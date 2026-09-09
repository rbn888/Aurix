-- ============================================================================
-- AURIX · M.04 PRODUCCIÓN · SALIDA DE EMERGENCIA — RESTAURAR subscriptions
-- ----------------------------------------------------------------------------
-- *** SÓLO SI HAY QUE VOLVER ATRÁS. No forma parte del camino feliz. ***
--
-- Copia MECÁNICA de db/m04_rehearsal/06_restore_subscriptions.sql, certificado
-- en el rehearsal, con UN cambio y ninguno más: el guard está INVERTIDO (exige
-- estar en la BD de Aurix en vez de negarse a ello). La lógica de restauración
-- —precondiciones, barrera de evidencia, TRUNCATE + INSERT, aserción antes del
-- commit— es byte a byte la que se ejecutó y se verificó.
--
-- Se prepara AHORA, antes del APPLY, a propósito: montar la salida de
-- emergencia cuando ya hace falta no es un plan.
--
-- ORDEN, si hay que revertir:
--   1. db/monetization_m04_billing_stripe_1_rollback.sql   (retira los 5 objetos;
--      ya es válido en producción tal cual, no lleva guard de entorno)
--   2. ESTE fichero                                        (devuelve subscriptions al PRE)
--   3. db/m04_rehearsal/07_verify_post_rollback.sql         (NO usable: lleva el guard
--      del ensayo. Si se llega aquí, pedir su variante de producción.)
--
-- Pegar TODO en el SQL Editor de una vez. El fichero abre y cierra su propia
-- transacción: si algo falla a mitad, subscriptions se queda como estaba ANTES
-- de intentar restaurar, nunca a medias.
--
-- Este es el paso que el rollback estructural NO hace. Borrar las tablas M.04
-- no devuelve a Free a la cuenta que el writer puso en premium: `subscriptions`
-- es de B1 y sobrevive al DROP con todo lo que se le escribió encima.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ TRUNCATE + INSERT Y NO UN UPSERT "QUIRÚRGICO"
-- ----------------------------------------------------------------------------
-- El camino aparentemente elegante — borrar las filas que no existían en PRE y
-- hacer `insert ... on conflict (user_id) do update` con los valores PRE —
-- tiene DOS trampas, y las dos producen un falso PASS o un fallo raro:
--
--   1. EL TRIGGER. `subscriptions_touch_updated_at` es BEFORE **UPDATE** y hace
--      `new.updated_at := now()` INCONDICIONALMENTE. Restaurar por UPDATE es
--      por tanto IMPOSIBLE de casar con el PRE: el trigger pisa el updated_at
--      que acabas de escribir y la huella nunca vuelve a coincidir. Habría que
--      desactivarlo (`alter table ... disable trigger`), y un fichero corrido a
--      trozos en el editor SQL puede dejarlo DESACTIVADO para siempre — un daño
--      silencioso y peor que el que se venía a arreglar.
--      Un INSERT no dispara ese trigger. Ésa es la razón técnica de fondo:
--      reinsertar reproduce updated_at LITERALMENTE, sin tocar nada.
--
--   2. LOS ÍNDICES ÚNICOS PARCIALES de B1:
--         subscriptions_provider_event_uidx (provider, last_event_id)
--         subscriptions_provider_sub_uidx   (provider, provider_subscription_id)
--      No son diferibles. Un UPSERT multifila puede colisionar TRANSITORIAMENTE
--      con una fila que todavía no le ha tocado el turno (el evento que el
--      ensayo escribió en la cuenta A es el que el PRE tenía en la B), y la
--      sentencia falla por un conflicto que en el estado final no existe.
--      Vaciar primero elimina la clase entera de problema.
--
-- TRUNCATE es seguro aquí y se ha verificado: NINGUNA tabla tiene una FK hacia
-- public.subscriptions (sólo la leen aurix_commercial_state / aurix_entitlements),
-- así que no hay CASCADE que arrastre nada. Tampoco hay secuencias que resetear.
--
-- ----------------------------------------------------------------------------
-- QUÉ OCURRE SI LA RESTAURACIÓN FALLA A MITAD
-- ----------------------------------------------------------------------------
-- Todo va dentro de UNA transacción, la que abre el `begin;` de este fichero. Si
-- algo estalla — una FK a un auth.users que ya no existe, un CHECK, el proceso
-- muerto — Postgres revierte TRUNCATE e INSERT juntos y `subscriptions` se
-- queda tal cual estaba ANTES de intentar restaurar (estado post-APPLY, con las
-- escrituras del writer), NUNCA medio restaurada. Eso es deliberado: un estado
-- conocido-sucio es diagnosticable; uno a medias no.
--
-- El estado intermedio "tabla vacía" sólo es visible dentro de la transacción,
-- y el VERIFY POST es el que decide si el resultado vale. Si este
-- fichero falla: NO reintentar a ciegas — leer el error, y si el PRE no se
-- puede reponer, recargar el volcado EXTERNO (la autoridad):
--
--   psql -1 -v ON_ERROR_STOP=1 "$REHEARSAL_DB_URL" \
--     -c 'truncate public.subscriptions;' \
--     -f evidence/m04/subscriptions_PRE.data.sql
--
-- Ése es el camino de mayor garantía porque no depende de que el espejo en la
-- misma BD siga siendo fiel (ver la cabecera de 02_pre_capture.sql). En un
-- entorno desechable, si nada de lo anterior funciona, la salida limpia es
-- destruir el entorno y rehacerlo: no hay dato real que perder.
-- ============================================================================

do $$
begin
  if to_regclass('public.user_portfolios') is null then
    raise exception
      'GUARD DE PRODUCCIÓN: no existe public.user_portfolios ⇒ ésta NO es la BD de '
      'Aurix. Para un entorno de ensayo usa '
      'db/m04_rehearsal/06_restore_subscriptions.sql.';
  end if;
end $$;

begin;

-- ── PRECONDICIONES ──────────────────────────────────────────────────────────
do $$
declare
  v_huerfanos int;
  v_run       uuid;
  v_g         record;
  v_m         record;
  v_mirror    record;
begin
  -- ── LA MISMA BARRERA QUE EL ROLLBACK, POR LA MISMA RAZÓN ─────────────────
  -- Restaurar desde un espejo que no se ha verificado es tan peligroso como no
  -- restaurar: se sobrescribiría `subscriptions` con un estado que nadie ha
  -- demostrado que sea el PRE. Se exige la evidencia, no la intención.
  if to_regclass('m04_rehearsal.subscriptions_pre') is null then
    raise exception 'RESTORE = BLOCKED: no hay captura PRE. No se restaura a ciegas.';
  end if;
  if not exists (select 1 from m04_rehearsal.manifest where fase = 'PRE') then
    raise exception 'RESTORE = BLOCKED: el manifiesto no tiene fila PRE.';
  end if;

  select run_id into v_run from m04_rehearsal.run;
  select * into v_g from m04_rehearsal.gates where gate = 'VERIFY_PRE';
  if not found or v_g.verdict <> 'PASS' or v_g.run_id <> v_run then
    raise exception 'RESTORE = BLOCKED: VERIFY_PRE no es PASS para este run (db/m04_prod/02_verify_pre_prod.sql).';
  end if;

  select * into v_m from m04_rehearsal.manifest where fase = 'PRE';
  if v_m.run_id <> v_run then
    raise exception 'RESTORE = BLOCKED: la fila PRE del manifiesto es del run %.', v_m.run_id;
  end if;

  -- El espejo tiene que estar COMPLETO y seguir siendo FIEL **ahora**, antes de
  -- vaciar nada. Comprobarlo después de un TRUNCATE sería tarde.
  select * into v_mirror
    from m04_rehearsal.fp_of('m04_rehearsal.subscriptions_pre'::regclass);
  if v_mirror.row_count <> v_m.row_count then
    raise exception 'RESTORE = BLOCKED: el espejo tiene % filas y el manifiesto dice %.',
                    v_mirror.row_count, v_m.row_count;
  end if;
  if v_mirror.data_fp <> v_m.data_fp then
    raise exception 'RESTORE = BLOCKED: la huella del espejo (%) no es la registrada (%). '
                    'Restaurar desde él NO devolvería el PRE.',
                    v_mirror.data_fp, v_m.data_fp;
  end if;

  -- La FK `user_id references auth.users on delete cascade` sigue en pie: si
  -- una cuenta del PRE ya no existe, el INSERT fallaría A MITAD. Mejor saberlo
  -- ANTES de vaciar la tabla, y con los uuid delante.
  select count(*) into v_huerfanos
    from m04_rehearsal.subscriptions_pre p
   where not exists (select 1 from auth.users u where u.id = p.user_id);
  if v_huerfanos <> 0 then
    raise exception
      'RESTORE: % filas del PRE apuntan a cuentas que ya no existen en auth.users. '
      'El PRE no es restaurable tal cual; investigar antes de vaciar nada.', v_huerfanos;
  end if;

  -- Los índices únicos parciales tienen que estar en pie: son parte de lo que
  -- se está restaurando, no un detalle.
  if not exists (select 1 from pg_indexes
                  where schemaname='public' and tablename='subscriptions'
                    and indexname='subscriptions_provider_event_uidx') then
    raise exception 'RESTORE: falta subscriptions_provider_event_uidx (B1)';
  end if;
end $$;

-- ── VACIAR Y REPONER ────────────────────────────────────────────────────────
-- `select *` en el INSERT y en el espejo: el espejo se creó con CTAS de la
-- MISMA tabla, así que el orden de columnas coincide por construcción y una
-- columna añadida después viaja sola. Escribir la lista a mano es lo que dejaría
-- fuera esa columna.
truncate table public.subscriptions;

insert into public.subscriptions
select * from m04_rehearsal.subscriptions_pre;

-- ── AFIRMACIÓN INMEDIATA (dentro de la misma transacción) ───────────────────
-- Si la restauración no reproduce la huella PRE, se aborta y NO se hace commit:
-- se prefiere el estado post-APPLY, sucio pero conocido, a un PRE aproximado
-- que luego se daría por bueno.
do $$
declare
  v_m record;
  v_n record;
begin
  select * into v_m from m04_rehearsal.manifest where fase = 'PRE';
  select * into v_n from m04_rehearsal.fp_data();

  if v_n.row_count <> v_m.row_count then
    raise exception 'RESTORE FAIL: filas=% esperadas=%', v_n.row_count, v_m.row_count;
  end if;
  if v_n.data_fp <> v_m.data_fp then
    raise exception 'RESTORE FAIL: data_fp=% esperada=%', v_n.data_fp, v_m.data_fp;
  end if;

  insert into m04_rehearsal.gates (gate, run_id, verdict, detail)
  values ('RESTORE', v_m.run_id, 'PASS',
          format('subscriptions restaurada al PRE · filas=%s data_fp=%s',
                 v_n.row_count, v_n.data_fp))
  on conflict (gate) do update
    set run_id = excluded.run_id, verdict = excluded.verdict,
        detail = excluded.detail, recorded_at = now();

  raise notice 'RESTORE OK · filas=% · data_fp=%', v_n.row_count, v_n.data_fp;
end $$;

commit;

-- El VERIFY completo (comparación en ambos sentidos + ausencia de restos M.04)
-- es un paso aparte. Esta afirmación de aquí sólo evita hacer commit de una
-- restauración que ya se sabe mala.
