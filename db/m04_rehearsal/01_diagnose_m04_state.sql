-- ============================================================================
-- M.04 ENSAYO · PASO 1 — DIAGNÓSTICO DETERMINISTA DEL ESTADO M.04
-- ----------------------------------------------------------------------------
-- *** NO EJECUTADO. Artefacto preparatorio. ***
-- psql -v ON_ERROR_STOP=1 -f db/m04_rehearsal/01_diagnose_m04_state.sql
--
--   ATENCIÓN: SIN `-1`. La evidencia se COMITEA antes de que el fichero falle.
--   Un diagnóstico que se lleva su propia evidencia al abortar no es un
--   diagnóstico: sería exactamente el fallo que este paso viene a evitar.
--
-- ----------------------------------------------------------------------------
-- QUÉ DECIDE Y POR QUÉ ES EL PRIMER PASO
-- ----------------------------------------------------------------------------
-- El ensayo anterior daba por supuesto un estado inicial limpio. No se puede:
-- el APPLY usa `create table if not exists`, que NO-OPEA sobre una tabla
-- preexistente. Si un intento anterior dejó una tabla a medias —sin sus CHECK,
-- sin su índice único, sin RLS— el APPLY "tiene éxito" y no crea lo que falta.
-- Sobre un estado PARCIAL, terminar sin error no significa nada.
--
-- Este fichero clasifica el estado en UNO de tres valores, y sólo uno de ellos
-- deja continuar:
--
--   LIMPIO    → ninguno de los 5 objetos M.04 presente Y ningún resto de
--               ningún tipo. Es el ÚNICO estado desde el que se puede seguir.
--   COMPLETO  → los 5 presentes Y con la forma esperada Y sin restos.
--               STOP: no se reaplica automáticamente.
--   PARCIAL   → cualquier otra cosa. Objetos que faltan, objetos con forma
--               incorrecta, restos, o cualquier AMBIGÜEDAD.
--               STOP: no se repara automáticamente.
--
-- REGLA DURA: la ambigüedad es PARCIAL, nunca LIMPIO. La clasificación se
-- construye por eliminación —LIMPIO y COMPLETO exigen condiciones POSITIVAS y
-- exhaustivas, y todo lo demás cae en PARCIAL— para que no exista un camino por
-- el que un estado no contemplado acabe pareciendo limpio.
--
-- ESTE FICHERO NO REPARA NADA. No crea, no borra, no altera ningún objeto M.04
-- ni ninguna fila de negocio. Sólo LEE catálogos y ESCRIBE su propia evidencia
-- en el esquema `m04_rehearsal`.
-- ============================================================================


-- ── GUARD DE ENTORNO ────────────────────────────────────────────────────────
-- Prueba POSITIVA de que NO estamos en la BD de Aurix: producción tiene
-- public.user_portfolios y el entorno de ensayo no la tiene.
do $$
begin
  if to_regclass('public.user_portfolios') is not null then
    raise exception
      'GUARD DE ENSAYO: public.user_portfolios EXISTE ⇒ esta es la BD de Aurix. '
      'Este fichero NO se ejecuta contra producción. Abortado.';
  end if;
end $$;


create schema if not exists m04_rehearsal;

-- ── EL RUN ──────────────────────────────────────────────────────────────────
-- Un ensayo = un run_id. Todas las puertas (gates) posteriores se firman con
-- él, y así una captura PRE de un ensayo ANTERIOR no puede autorizar el
-- rollback de este.
create table if not exists m04_rehearsal.run (
  singleton  boolean     not null primary key default true
                         constraint run_singleton_chk check (singleton),
  run_id     uuid        not null default gen_random_uuid(),
  started_at timestamptz not null default now(),
  db_name    text        not null default current_database()
);

-- ── LAS PUERTAS ─────────────────────────────────────────────────────────────
-- Evidencia DURABLE de qué pasos se han superado. Es lo que convierte la
-- barrera del rollback en un hecho comprobable y no en una declaración.
create table if not exists m04_rehearsal.gates (
  gate        text        not null primary key,
  run_id      uuid        not null,
  verdict     text        not null
                          constraint gates_verdict_chk
                          check (verdict in ('PASS','FAIL','BLOCKED')),
  detail      text,
  recorded_at timestamptz not null default now()
);

-- ── LOS HALLAZGOS ───────────────────────────────────────────────────────────
-- Una fila por comprobación, con lo esperado y lo encontrado LADO A LADO. Es la
-- entrega que pide la directiva para PARCIAL y COMPLETO: sin esta tabla, "está
-- parcial" no es evidencia con la que diseñar nada.
create table if not exists m04_rehearsal.diagnose_findings (
  run_id      uuid        not null,
  objeto      text        not null,
  comprobacion text       not null,
  esperado    text,
  encontrado  text,
  ok          boolean,
  primary key (run_id, objeto, comprobacion)
);


-- ── ARRANQUE DEL RUN ────────────────────────────────────────────────────────
-- Un diagnóstico nuevo abre un run nuevo, y eso INVALIDA las puertas del
-- anterior. Si ya hay una captura PRE en curso, se niega: seguir crearía un run
-- cuyo espejo pertenece a otro, y 02 se negaría después a sobrescribirlo,
-- dejando el ensayo en un bloqueo confuso. Mejor pararlo aquí, con la salida
-- explícita escrita.
do $$
begin
  if to_regclass('m04_rehearsal.subscriptions_pre') is not null then
    raise exception
      'DIAGNÓSTICO: ya existe una captura PRE (m04_rehearsal.subscriptions_pre) de un '
      'ensayo en curso. Re-diagnosticar abriría un run nuevo cuya evidencia PRE es de '
      'otro. Cierra el ensayo anterior a mano y de forma deliberada: '
      'drop table m04_rehearsal.subscriptions_pre; delete from m04_rehearsal.gates;';
  end if;
end $$;

begin;

delete from m04_rehearsal.gates;
delete from m04_rehearsal.run;
insert into m04_rehearsal.run default values;

do $$
declare
  v_run        uuid;
  v_present    int := 0;
  v_residual   int := 0;
  v_shape_fail int := 0;
  v_clase      text;
  v_detalle    text;
  v_bc         boolean;
  v_bp         boolean;
  v_be         boolean;
  v_fl         oid;
  v_fa         oid;
  -- IDENTIDAD POR TIPOS DE ARGUMENTO. Se resuelve con to_regprocedure y NO con
  -- pg_get_function_identity_arguments, que renderiza también los NOMBRES de
  -- los parámetros ('p_user_id uuid, …'): compararla con una lista de tipos
  -- desnudos da un FALSO FAIL incluso contra un M.04 perfecto, y en una puerta
  -- fail-closed un falso FAIL hace tanto daño como un falso PASS. En Postgres
  -- la identidad de una función es (nombre, TIPOS); el nombre del parámetro no
  -- forma parte de ella.
  c_sig_link   text := 'public.aurix_billing_link_customer(uuid,text,text)';
  c_sig_apply  text := 'public.aurix_billing_apply_event(text,text,text,text,'
                       'text,text,text,timestamptz,timestamptz,boolean,'
                       'timestamptz,timestamptz,timestamptz,timestamptz)';
  -- Sentinelas del CUERPO del writer. No prueban que la lógica sea correcta,
  -- pero sí que la función es la versión ACTUAL de M.04 y no una anterior sin
  -- los guards: una firma idéntica con un cuerpo viejo es indistinguible por
  -- catálogo, y es justo el estado que un intento fallido puede dejar.
  c_sent_apply text[] := array['missing_period','other_subscription','unknown_status',
                               'unknown_price','unknown_customer','ignored_type',
                               'stale','duplicate','invalid_payload'];
begin
  select run_id into v_run from m04_rehearsal.run;

  v_bc := to_regclass('public.billing_customers') is not null;
  v_bp := to_regclass('public.billing_prices')    is not null;
  v_be := to_regclass('public.billing_events')    is not null;
  v_fl := to_regprocedure(c_sig_link)::oid;
  v_fa := to_regprocedure(c_sig_apply)::oid;

  -- ══ PRESENCIA DE LOS 5 ══════════════════════════════════════════════════
  insert into m04_rehearsal.diagnose_findings
    (run_id, objeto, comprobacion, esperado, encontrado)
  values
    (v_run,'billing_customers','presente','true', v_bc::text),
    (v_run,'billing_prices',   'presente','true', v_bp::text),
    (v_run,'billing_events',   'presente','true', v_be::text),
    (v_run,'aurix_billing_link_customer','presente con la firma esperada','true',
           (v_fl is not null)::text),
    (v_run,'aurix_billing_apply_event',  'presente con la firma esperada','true',
           (v_fa is not null)::text);

  v_present := (v_bc::int) + (v_bp::int) + (v_be::int)
             + ((v_fl is not null)::int) + ((v_fa is not null)::int);

  -- ══ FORMA · billing_customers ═══════════════════════════════════════════
  if v_bc then
    insert into m04_rehearsal.diagnose_findings
      (run_id, objeto, comprobacion, esperado, encontrado)
    values
      (v_run,'billing_customers','columnas',
       'created_at:timestamp with time zone,provider:text,provider_customer_id:text,'
       'updated_at:timestamp with time zone,user_id:uuid',
       (select string_agg(column_name||':'||data_type, ',' order by column_name)
          from information_schema.columns
         where table_schema='public' and table_name='billing_customers')),
      (v_run,'billing_customers','nº de CHECK','2',
       (select count(*)::text from pg_constraint
         where conrelid='public.billing_customers'::regclass and contype='c')),
      (v_run,'billing_customers','clave primaria','PRIMARY KEY (provider, user_id)',
       (select pg_get_constraintdef(oid) from pg_constraint
         where conrelid='public.billing_customers'::regclass and contype='p')),
      (v_run,'billing_customers','FK a auth.users','1',
       (select count(*)::text from pg_constraint
         where conrelid='public.billing_customers'::regclass and contype='f'
           and confrelid='auth.users'::regclass)),
      (v_run,'billing_customers','índice único de handle','true',
       (select exists(select 1 from pg_indexes where schemaname='public'
                       and indexname='billing_customers_handle_uidx')::text)),
      (v_run,'billing_customers','trigger de updated_at','true',
       (select exists(select 1 from pg_trigger where not tgisinternal
                       and tgrelid='public.billing_customers'::regclass
                       and tgname='billing_customers_touch_updated_at')::text)),
      (v_run,'billing_customers','RLS activa','true',
       (select relrowsecurity::text from pg_class
         where oid='public.billing_customers'::regclass)),
      (v_run,'billing_customers','política restrictiva de denegación','restrictive',
       (select case when pol.polpermissive then 'permissive' else 'restrictive' end
          from pg_policy pol where pol.polrelid='public.billing_customers'::regclass
           and pol.polname='billing_customers_no_client')),
      (v_run,'billing_customers','privilegios de cliente','',
       (select coalesce(string_agg(grantee||':'||privilege_type,',' order by grantee,privilege_type),'')
          from information_schema.role_table_grants
         where table_schema='public' and table_name='billing_customers'
           and grantee in ('anon','authenticated')));
  end if;

  -- ══ FORMA · billing_prices ══════════════════════════════════════════════
  if v_bp then
    insert into m04_rehearsal.diagnose_findings
      (run_id, objeto, comprobacion, esperado, encontrado)
    values
      (v_run,'billing_prices','columnas',
       'active:boolean,amount_cents:integer,billing_interval:text,'
       'created_at:timestamp with time zone,currency:text,plan:text,provider:text,'
       'provider_price_id:text,trial_days:integer,updated_at:timestamp with time zone',
       (select string_agg(column_name||':'||data_type, ',' order by column_name)
          from information_schema.columns
         where table_schema='public' and table_name='billing_prices')),
      (v_run,'billing_prices','nº de CHECK','7',
       (select count(*)::text from pg_constraint
         where conrelid='public.billing_prices'::regclass and contype='c')),
      (v_run,'billing_prices','clave primaria',
       'PRIMARY KEY (provider, provider_price_id)',
       (select pg_get_constraintdef(oid) from pg_constraint
         where conrelid='public.billing_prices'::regclass and contype='p')),
      (v_run,'billing_prices','único parcial de precio activo','true',
       (select exists(select 1 from pg_indexes where schemaname='public'
                       and indexname='billing_prices_active_uidx'
                       and indexdef like '%WHERE active%')::text)),
      (v_run,'billing_prices','trigger de updated_at','true',
       (select exists(select 1 from pg_trigger where not tgisinternal
                       and tgrelid='public.billing_prices'::regclass
                       and tgname='billing_prices_touch_updated_at')::text)),
      (v_run,'billing_prices','RLS activa','true',
       (select relrowsecurity::text from pg_class
         where oid='public.billing_prices'::regclass)),
      (v_run,'billing_prices','política de lectura del catálogo','true',
       (select exists(select 1 from pg_policy
                       where polrelid='public.billing_prices'::regclass
                         and polname='billing_prices_read_active')::text)),
      -- La ÚNICA concesión al cliente en todo M.04. Ni más (fuga) ni menos
      -- (el paywall no podría renderizar el precio de récord).
      (v_run,'billing_prices','privilegios de cliente','authenticated:SELECT',
       (select coalesce(string_agg(grantee||':'||privilege_type,',' order by grantee,privilege_type),'')
          from information_schema.role_table_grants
         where table_schema='public' and table_name='billing_prices'
           and grantee in ('anon','authenticated')));
  end if;

  -- ══ FORMA · billing_events ══════════════════════════════════════════════
  if v_be then
    insert into m04_rehearsal.diagnose_findings
      (run_id, objeto, comprobacion, esperado, encontrado)
    values
      (v_run,'billing_events','columnas',
       'applied:boolean,event_id:text,event_type:text,outcome:text,provider:text,'
       'received_at:timestamp with time zone,user_id:uuid',
       (select string_agg(column_name||':'||data_type, ',' order by column_name)
          from information_schema.columns
         where table_schema='public' and table_name='billing_events')),
      (v_run,'billing_events','nº de CHECK','2',
       (select count(*)::text from pg_constraint
         where conrelid='public.billing_events'::regclass and contype='c')),
      -- La PK **es** la idempotencia. Si no es (provider, event_id), un
      -- reenvío no choca con nada y se aplica dos veces.
      (v_run,'billing_events','clave primaria (ES la idempotencia)',
       'PRIMARY KEY (provider, event_id)',
       (select pg_get_constraintdef(oid) from pg_constraint
         where conrelid='public.billing_events'::regclass and contype='p')),
      (v_run,'billing_events','índice forense por usuario','true',
       (select exists(select 1 from pg_indexes where schemaname='public'
                       and indexname='billing_events_user_idx')::text)),
      (v_run,'billing_events','RLS activa','true',
       (select relrowsecurity::text from pg_class
         where oid='public.billing_events'::regclass)),
      (v_run,'billing_events','política restrictiva de denegación','restrictive',
       (select case when pol.polpermissive then 'permissive' else 'restrictive' end
          from pg_policy pol where pol.polrelid='public.billing_events'::regclass
           and pol.polname='billing_events_no_client')),
      (v_run,'billing_events','privilegios de cliente','',
       (select coalesce(string_agg(grantee||':'||privilege_type,',' order by grantee,privilege_type),'')
          from information_schema.role_table_grants
         where table_schema='public' and table_name='billing_events'
           and grantee in ('anon','authenticated')));
  end if;

  -- ══ FORMA · aurix_billing_link_customer ═════════════════════════════════
  if v_fl is not null then
    insert into m04_rehearsal.diagnose_findings
      (run_id, objeto, comprobacion, esperado, encontrado)
    values
      (v_run,'aurix_billing_link_customer','security definer','true',
       (select prosecdef::text from pg_proc where oid=v_fl)),
      (v_run,'aurix_billing_link_customer','search_path fijado',
       'search_path=public, pg_temp',
       (select coalesce(array_to_string(proconfig,','),'') from pg_proc where oid=v_fl)),
      (v_run,'aurix_billing_link_customer','execute para service_role','true',
       has_function_privilege('service_role', v_fl, 'execute')::text),
      (v_run,'aurix_billing_link_customer','execute para anon','false',
       has_function_privilege('anon', v_fl, 'execute')::text),
      (v_run,'aurix_billing_link_customer','execute para authenticated','false',
       has_function_privilege('authenticated', v_fl, 'execute')::text),
      -- Cuerpo: el fail-closed ante un handle ajeno es LO que distingue esta
      -- función de un upsert "servicial" que fugaría entre cuentas.
      (v_run,'aurix_billing_link_customer','cuerpo con el fail-closed de handle ajeno','true',
       (select (prosrc like '%already linked to another user%')::text
          from pg_proc where oid=v_fl));
  end if;

  -- ══ FORMA · aurix_billing_apply_event ═══════════════════════════════════
  if v_fa is not null then
    insert into m04_rehearsal.diagnose_findings
      (run_id, objeto, comprobacion, esperado, encontrado)
    values
      (v_run,'aurix_billing_apply_event','security definer','true',
       (select prosecdef::text from pg_proc where oid=v_fa)),
      (v_run,'aurix_billing_apply_event','search_path fijado',
       'search_path=public, pg_temp',
       (select coalesce(array_to_string(proconfig,','),'') from pg_proc where oid=v_fa)),
      (v_run,'aurix_billing_apply_event','devuelve jsonb','jsonb',
       (select format_type(prorettype, null) from pg_proc where oid=v_fa)),
      (v_run,'aurix_billing_apply_event','execute para service_role','true',
       has_function_privilege('service_role', v_fa, 'execute')::text),
      (v_run,'aurix_billing_apply_event','execute para anon','false',
       has_function_privilege('anon', v_fa, 'execute')::text),
      (v_run,'aurix_billing_apply_event','execute para authenticated','false',
       has_function_privilege('authenticated', v_fa, 'execute')::text),
      -- Todos los outcomes del contrato tienen que estar en el cuerpo. Una
      -- firma idéntica con un cuerpo ANTERIOR (sin los guards de periodo, sin
      -- el desempate de segundo) es indistinguible por catálogo y es
      -- exactamente lo que un intento a medias puede dejar.
      (v_run,'aurix_billing_apply_event','cuerpo con los 9 outcomes del contrato',
       array_to_string(c_sent_apply, ','),
       (select array_to_string(array(
                 select s from unnest(c_sent_apply) s
                  where p.prosrc like '%'||s||'%' order by array_position(c_sent_apply, s)
               ), ',') from pg_proc p where p.oid=v_fa));
  end if;

  -- ══ RESTOS ══════════════════════════════════════════════════════════════
  -- Cualquier relación `billing_*` que no sea una de las tres, y cualquier
  -- función `aurix_billing*` cuya (nombre, firma) no sea una de las dos. Una
  -- sobrecarga sobrante es un resto: convierte el DROP del rollback en
  -- incompleto sin que nada lo delate.
  select count(*) into v_residual from (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname like 'billing\_%'
       and c.relkind in ('r','p','v','m','f')
       and c.relname not in ('billing_customers','billing_prices','billing_events')
    union all
    select 1 from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname like 'aurix_billing%'
       and p.oid not in (coalesce(v_fl, 0), coalesce(v_fa, 0))
  ) x;

  insert into m04_rehearsal.diagnose_findings
    (run_id, objeto, comprobacion, esperado, encontrado)
  values (v_run,'(catálogo)','restos billing_* / aurix_billing* no inventariados',
          '0', v_residual::text);

  -- ══ VEREDICTO ═══════════════════════════════════════════════════════════
  update m04_rehearsal.diagnose_findings
     set ok = (esperado is not distinct from encontrado)
   where run_id = v_run;

  select count(*) into v_shape_fail
    from m04_rehearsal.diagnose_findings
   where run_id = v_run and not ok
     and comprobacion not like 'presente%';

  -- Construida por eliminación: LIMPIO y COMPLETO exigen condiciones
  -- POSITIVAS y exhaustivas; todo lo demás es PARCIAL. Un estado que no
  -- hayamos previsto no puede caer en LIMPIO.
  if v_present = 0 and v_residual = 0 then
    v_clase := 'LIMPIO';
  elsif v_present = 5 and v_shape_fail = 0 and v_residual = 0 then
    v_clase := 'COMPLETO';
  else
    v_clase := 'PARCIAL';
  end if;

  v_detalle := format('clase=%s objetos_presentes=%s/5 forma_incorrecta=%s restos=%s',
                      v_clase, v_present, v_shape_fail, v_residual);

  -- El gate DIAGNOSE sólo es PASS con LIMPIO. COMPLETO y PARCIAL quedan
  -- BLOCKED: ninguno autoriza continuar, y la cadena de puertas de los pasos
  -- siguientes exige este PASS.
  insert into m04_rehearsal.gates (gate, run_id, verdict, detail)
  values ('DIAGNOSE', v_run,
          case when v_clase = 'LIMPIO' then 'PASS' else 'BLOCKED' end,
          v_detalle)
  on conflict (gate) do update
    set run_id = excluded.run_id, verdict = excluded.verdict,
        detail = excluded.detail, recorded_at = now();

  raise notice 'DIAGNÓSTICO M.04: %', v_detalle;
end $$;

commit;   -- ← la evidencia queda comiteada ANTES del STOP de abajo


-- ── EVIDENCIA (para leer, y para adjuntar al parte) ─────────────────────────
select gate, verdict, detail, recorded_at from m04_rehearsal.gates where gate='DIAGNOSE';

select objeto, comprobacion, esperado, encontrado, ok
  from m04_rehearsal.diagnose_findings f
 where f.run_id = (select run_id from m04_rehearsal.run)
 order by ok nulls first, objeto, comprobacion;


-- ── STOP ────────────────────────────────────────────────────────────────────
-- Falla RUIDOSAMENTE si el estado no es LIMPIO. No repara, no reaplica, no
-- decide: entrega la evidencia y para. Diseñar la reparación de un PARCIAL
-- todavía desconocido es un bloque posterior, y hacerlo aquí a ciegas es la
-- forma de convertir un diagnóstico en un incidente.
do $$
declare
  v_g record;
begin
  select * into v_g from m04_rehearsal.gates where gate = 'DIAGNOSE';
  if v_g.verdict <> 'PASS' then
    raise exception
      'STOP · ESTADO M.04 NO LIMPIO (%). No se continúa al ensayo y NO se repara '
      'automáticamente. La evidencia está en m04_rehearsal.diagnose_findings '
      '(filas con ok=false primero). Entrégala para decidir el siguiente paso.',
      v_g.detail;
  end if;
  raise notice 'DIAGNÓSTICO = LIMPIO · gate DIAGNOSE=PASS · run=%', v_g.run_id;
  raise notice 'Siguiente paso: db/m04_rehearsal/02_pre_capture.sql';
end $$;
