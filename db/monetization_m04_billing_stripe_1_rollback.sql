-- ============================================================================
-- AURIX-MONETIZATION-M04  ·  ROLLBACK ESTRUCTURAL
-- Pareja explícita de: db/monetization_m04_billing_stripe_1.sql
-- ----------------------------------------------------------------------------
-- *** NO EJECUTADO. Este fichero es un artefacto preparatorio. ***
--
-- psql -v ON_ERROR_STOP=1 -f db/monetization_m04_billing_stripe_1_rollback.sql
--   (SIN `-1`: el fichero abre y cierra su propia transacción.)
--
-- Retira los CINCO objetos que crea M.04:
--     2 funciones  aurix_billing_apply_event, aurix_billing_link_customer
--     3 tablas     billing_events, billing_customers, billing_prices
--
-- ----------------------------------------------------------------------------
-- LO QUE ESTE ROLLBACK **NO** REVIERTE  (declarado, no olvidado)
-- ----------------------------------------------------------------------------
-- 1. LAS FILAS QUE EL WRITER ESCRIBIÓ EN public.subscriptions.  ← LA ASIMETRÍA
--    `aurix_billing_apply_event()` hace UPSERT en `subscriptions`, que es una
--    tabla de B1 y NO se borra aquí. Un DROP de los objetos M.04 deja intacto
--    todo lo que el writer concedió o degradó: una cuenta puede quedarse en
--    plan='premium' / provider='stripe' con un provider_customer_id que ya no
--    tiene tabla de mapeo donde resolverse. El rollback estructural NO es un
--    rollback de datos, y los dos siguen siendo pasos SEPARADOS a propósito:
--    db/m04_rehearsal/06_restore_subscriptions.sql es el que restaura, y este
--    fichero no lo invoca ni lo sustituye.
--
--    Lo que sí hace este fichero es NEGARSE A EMPEZAR si la restauración no va
--    a ser posible — ver la BARRERA de más abajo.
--
-- 2. public.user_portfolios.subscription / subscription_updated_at.  El jsonb
--    comercial que el cliente sincroniza por last-write-wins. M.04 no lo
--    escribe, pero si durante el ensayo la app corrió con sesión y sincronizó
--    un plan, ese espejo del cliente conserva el estado y NO lo toca ni el
--    APPLY ni este rollback. Fuera del alcance de M.04; se declara porque es
--    la vía por la que un "premium" podría sobrevivir al rollback en la UI.
--
-- 3. entitlement_overrides / plan_features / aurix_commercial_state() /
--    aurix_entitlements().  M.04 es aditivo y no los modifica: no hay nada que
--    revertir en ellos. Se listan para que el VERIFY afirme que SIGUEN EN PIE
--    (un rollback que se los llevara sería una regresión de B1/B2).
--
-- 4. public.aurix_touch_updated_at().  Es un helper COMPARTIDO de B1 y lo usan
--    los triggers de subscriptions, plan_features y entitlement_overrides.
--    M.04 sólo lo REFERENCIA. Este fichero NO lo borra a propósito: un
--    `drop function aurix_touch_updated_at cascade` "de limpieza" dejaría
--    subscriptions sin mantenimiento de updated_at, que es justo la columna de
--    la que depende después el desempate de eventos.
--
-- 5. Nada de Stripe. Clientes, suscripciones, precios y eventos del lado del
--    proveedor sobreviven íntegros; SQL no los alcanza. Tras un rollback, un
--    reenvío de webhook desde el dashboard llega a un endpoint cuyo writer ya
--    no existe → 500 y reintentos. Cerrar/limpiar el lado Stripe es manual y
--    está fuera de este fichero.
--
-- 6. Nada de Vercel. Variables de entorno (STRIPE_*), rutas de api/billing/ y
--    el deployment siguen como estén.
--
-- 7. La caché de esquema de PostgREST. **D3 DIFERIDO POR DIRECTIVA:** este
--    fichero NO ejecuta `notify pgrst, 'reload schema'`. Es una cuestión de
--    VISIBILIDAD y no forma parte de la seguridad ni de la reversibilidad que
--    se está certificando. Consecuencia asumida y declarada: tras el rollback,
--    una sonda HTTP puede seguir anunciando tablas ya borradas. Por eso el
--    VERIFY POST se hace por CATÁLOGO (`to_regclass`) y no por HTTP.
--
-- 8. Logs, WAL, pg_stat_statements y el historial del editor SQL. Irrelevantes
--    para la igualdad PRE/POST, pero no son cero: dejan rastro de que se
--    ensayó.
--
-- ----------------------------------------------------------------------------
-- ORDEN Y POR QUÉ
-- ----------------------------------------------------------------------------
--   FUNCIONES PRIMERO. Los cuerpos plpgsql declaran variables de tipo fila
--   (`v_price public.billing_prices;`, `v_ev public.billing_events;`). Postgres
--   NO registra esa dependencia, así que un `drop table` con las funciones
--   presentes tendría éxito y dejaría dos funciones ROTAS que sólo estallan al
--   invocarse. Borrarlas antes evita ese estado intermedio.
--
--   TABLAS CON `restrict` (el defecto), NUNCA `cascade`. No hay FK entre las
--   tres, así que el orden entre ellas es indiferente; lo que importa es que
--   si algún objeto NO inventariado depende de una de ellas, el DROP debe
--   FALLAR y delatarlo, no arrastrarlo en silencio.
--
--   Índices (billing_customers_handle_uidx, billing_prices_active_uidx,
--   billing_events_user_idx), triggers (*_touch_updated_at), políticas RLS y
--   grants caen SOLOS con sus tablas. No se enumeran para no dar la impresión
--   de que hay que reponerlos.
-- ============================================================================


begin;

-- ============================================================================
-- BARRERA BLOQUEANTE · EVIDENCIA, NO DECLARACIÓN
-- ============================================================================
-- La versión anterior de este fichero se contentaba con un opt-in de sesión:
-- el operador declaraba "tengo un snapshot" y el DROP arrancaba. Eso no es una
-- barrera, es una casilla. Una declaración no puede distinguirse de un error de
-- buena fe, y el fallo que hay detrás — dejar cuentas premium huérfanas sin
-- forma de volver atrás — es irreversible.
--
-- Ahora hay DOS puertas independientes, y las dos están DENTRO de la
-- transacción a propósito: así, aunque alguien ejecute el fichero sin
-- ON_ERROR_STOP, el `raise` aborta y los DROP no llegan a comitear.
--
--   PUERTA 1 · INTENCIÓN (necesaria, insuficiente)
--     set aurix.m04_rollback_ack = 'TENGO-SNAPSHOT-PRE-DE-SUBSCRIPTIONS';
--     Sirve para que nadie ejecute este fichero por inercia. Nada más.
--
--   PUERTA 2 · HECHO VERIFICABLE (la que de verdad bloquea)
--     Se comprueba, AQUÍ Y AHORA, que la captura PRE de subscriptions:
--       · existe (esquema, manifiesto y espejo);
--       · pertenece a ESTE ensayo (run_id);
--       · superó VERIFY PRE (gate PASS del mismo run);
--       · tiene número de filas registrado;
--       · tiene huella determinista registrada;
--       · está COMPLETA — el espejo tiene tantas filas como dice el manifiesto;
--       · sigue siendo FIEL — la huella recalculada SOBRE EL ESPEJO coincide
--         con la registrada. Que exista no basta: podría haber sido truncado o
--         editado despues de verificarse.
--       · y el gate y el manifiesto CUENTAN LO MISMO, que es lo que detecta que
--         alguien haya reescrito uno de los dos por su cuenta.
--
-- Si algo de esto falla: ROLLBACK = BLOCKED. No continúa en silencio.
-- ============================================================================
do $$
declare
  v_run    uuid;
  v_g      record;
  v_m      record;
  v_mirror record;
  v_detail text;
begin
  -- ── PUERTA 1 · intención ──────────────────────────────────────────────────
  if coalesce(current_setting('aurix.m04_rollback_ack', true), '')
     <> 'TENGO-SNAPSHOT-PRE-DE-SUBSCRIPTIONS' then
    raise exception
      'ROLLBACK = BLOCKED (puerta 1/2, intención): falta el opt-in de sesión. Este '
      'rollback es ESTRUCTURAL y no revierte las filas que el writer escribió en '
      'public.subscriptions. Ejecuta primero: '
      'set aurix.m04_rollback_ack = ''TENGO-SNAPSHOT-PRE-DE-SUBSCRIPTIONS'';';
  end if;

  -- ── PUERTA 2 · el andamiaje de evidencia existe ───────────────────────────
  if to_regclass('m04_rehearsal.run') is null
     or to_regclass('m04_rehearsal.gates') is null
     or to_regclass('m04_rehearsal.manifest') is null
     or to_regclass('m04_rehearsal.subscriptions_pre') is null then
    raise exception
      'ROLLBACK = BLOCKED (puerta 2/2): no existe la evidencia de una captura PRE '
      '(m04_rehearsal.run / gates / manifest / subscriptions_pre). Sin snapshot '
      'verificado no se retira nada: la restauración sería imposible.';
  end if;

  select run_id into v_run from m04_rehearsal.run;
  if v_run is null then
    raise exception 'ROLLBACK = BLOCKED: no hay run_id. Ejecuta el diagnóstico (paso 1).';
  end if;

  -- ── el snapshot superó VERIFY PRE, y para ESTE run ────────────────────────
  select * into v_g from m04_rehearsal.gates where gate = 'VERIFY_PRE';
  if not found then
    raise exception 'ROLLBACK = BLOCKED: no hay gate VERIFY_PRE. El snapshot PRE no ha '
                    'sido verificado (paso 3).';
  end if;
  if v_g.verdict <> 'PASS' then
    raise exception 'ROLLBACK = BLOCKED: VERIFY_PRE=% (%)', v_g.verdict, v_g.detail;
  end if;
  if v_g.run_id <> v_run then
    raise exception 'ROLLBACK = BLOCKED: el gate VERIFY_PRE es del run % y el ensayo en '
                    'curso es el %. Un snapshot de otro ensayo no autoriza este '
                    'rollback.', v_g.run_id, v_run;
  end if;

  -- ── el manifiesto registra filas y huella, para ESTE run ─────────────────
  select * into v_m from m04_rehearsal.manifest where fase = 'PRE';
  if not found then
    raise exception 'ROLLBACK = BLOCKED: el manifiesto no tiene fila PRE.';
  end if;
  if v_m.run_id <> v_run then
    raise exception 'ROLLBACK = BLOCKED: la fila PRE del manifiesto es del run %.', v_m.run_id;
  end if;
  if v_m.row_count is null or v_m.data_fp is null or v_m.data_fp = '' then
    raise exception 'ROLLBACK = BLOCKED: el manifiesto PRE no registra filas y huella.';
  end if;

  -- ── el gate y el manifiesto cuentan lo mismo ─────────────────────────────
  -- Si alguien reescribió uno de los dos a mano, aquí se ve. Sin este cruce, un
  -- manifiesto editado podría "validar" un espejo que ya no es el que se
  -- verificó.
  v_detail := format('filas=%s data_fp=%s struct_fp=%s',
                     v_m.row_count, v_m.data_fp, v_m.struct_fp);
  if v_g.detail is distinct from v_detail then
    raise exception 'ROLLBACK = BLOCKED: el gate VERIFY_PRE (%) y el manifiesto (%) no '
                    'coinciden: la evidencia ha sido alterada después de verificarse.',
                    v_g.detail, v_detail;
  end if;

  -- ── el espejo está COMPLETO y sigue siendo FIEL ──────────────────────────
  select * into v_mirror
    from m04_rehearsal.fp_of('m04_rehearsal.subscriptions_pre'::regclass);
  if v_mirror.row_count <> v_m.row_count then
    raise exception 'ROLLBACK = BLOCKED: el espejo tiene % filas y el manifiesto dice %: '
                    'la captura está INCOMPLETA.', v_mirror.row_count, v_m.row_count;
  end if;
  if v_mirror.data_fp <> v_m.data_fp then
    raise exception 'ROLLBACK = BLOCKED: la huella del espejo (%) ya no es la registrada '
                    '(%): el snapshot ha sido alterado y no restauraría el PRE.',
                    v_mirror.data_fp, v_m.data_fp;
  end if;

  -- ── AVISO, no bloqueo ─────────────────────────────────────────────────────
  -- No se exige el gate WRITER: este fichero tiene que seguir sirviendo como
  -- SALIDA DE EMERGENCIA a mitad del ensayo. Que las pruebas del writer no se
  -- hayan corrido es información, no un impedimento para retirar M.04.
  if not exists (select 1 from m04_rehearsal.gates
                  where gate = 'WRITER' and verdict = 'PASS' and run_id = v_run) then
    raise notice 'AVISO: no hay gate WRITER=PASS en este run. Se permite el rollback '
                 '(salida de emergencia), pero el ensayo queda incompleto.';
  end if;

  raise notice 'BARRERA SUPERADA · snapshot PRE verificado · run=% · filas=% · fp=%',
               v_run, v_m.row_count, v_m.data_fp;
end $$;


-- ── 1. FUNCIONES ────────────────────────────────────────────────────────────
-- Firmas COMPLETAS: `drop function` resuelve por (nombre, tipos de argumento).
-- Con una firma incompleta el DROP falla; con una firma distinta borraría otra
-- sobrecarga. Estas dos son literalmente las de los grants del APPLY.
drop function if exists public.aurix_billing_apply_event(
  text, text, text, text, text, text, text,
  timestamptz, timestamptz, boolean, timestamptz, timestamptz, timestamptz, timestamptz
);

drop function if exists public.aurix_billing_link_customer(uuid, text, text);

-- ── 2. TABLAS ───────────────────────────────────────────────────────────────
drop table if exists public.billing_events    restrict;
drop table if exists public.billing_customers restrict;
drop table if exists public.billing_prices    restrict;

-- ── 3. AFIRMACIÓN DENTRO DE LA MISMA TRANSACCIÓN ────────────────────────────
-- Que el rollback dejó CERO restos M.04 y que NO se llevó por delante nada de
-- B1/B2. Si algo falla aquí, el `raise` aborta y revierte el DROP completo: se
-- prefiere M.04 intacto a un estado a medias.
do $$
declare
  v_restos int;
  v_run    uuid;
begin
  select run_id into v_run from m04_rehearsal.run;

  if to_regclass('public.billing_customers') is not null
     or to_regclass('public.billing_prices') is not null
     or to_regclass('public.billing_events')  is not null then
    raise exception 'M04 ROLLBACK: sigue existiendo al menos una tabla M.04';
  end if;

  -- Sobrecargas incluidas: si alguien creó una variante de firma, aquí sale.
  select count(*) into v_restos
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'aurix_billing%';
  if v_restos <> 0 then
    raise exception 'M04 ROLLBACK: quedan % funciones aurix_billing*', v_restos;
  end if;

  -- Lo que TIENE que sobrevivir.
  if to_regclass('public.subscriptions') is null
     or to_regclass('public.plan_features') is null
     or to_regclass('public.entitlement_overrides') is null then
    raise exception 'M04 ROLLBACK: el rollback se ha llevado una tabla de B1';
  end if;
  if to_regprocedure('public.aurix_touch_updated_at()') is null then
    raise exception 'M04 ROLLBACK: falta el helper compartido aurix_touch_updated_at()';
  end if;
  if to_regprocedure('public.aurix_entitlements()') is null then
    raise exception 'M04 ROLLBACK: falta el resolver aurix_entitlements() de B2';
  end if;

  insert into m04_rehearsal.gates (gate, run_id, verdict, detail)
  values ('ROLLBACK', v_run, 'PASS',
          '0 restos M.04 · B1/B2 en pie · subscriptions NO restaurada por este paso')
  on conflict (gate) do update
    set run_id = excluded.run_id, verdict = excluded.verdict,
        detail = excluded.detail, recorded_at = now();

  raise notice 'M04 ROLLBACK ESTRUCTURAL: OK (0 restos M.04, B1/B2 en pie)';
  raise notice 'RECORDATORIO: subscriptions NO ha sido restaurada por este fichero.';
end $$;

commit;

-- ============================================================================
-- SIGUIENTE PASO OBLIGATORIO, NO OPCIONAL:
--   db/m04_rehearsal/06_restore_subscriptions.sql   (restaurar el PRE)
--   db/m04_rehearsal/07_verify_post_rollback.sql    (demostrar la igualdad)
--
-- D3 · NO se emite `notify pgrst, 'reload schema'`: diferido por directiva.
-- ============================================================================
