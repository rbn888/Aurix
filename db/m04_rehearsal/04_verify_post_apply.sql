-- ============================================================================
-- M.04 ENSAYO · PASO 4 — AUTO-VERIFY POST-APPLY (gate independiente)
-- ----------------------------------------------------------------------------
-- *** NO EJECUTADO. Artefacto preparatorio. ***
-- psql -1 -v ON_ERROR_STOP=1 -f db/m04_rehearsal/04_verify_post_apply.sql
--
-- Se ejecuta DESPUÉS de aplicar db/monetization_m04_billing_stripe_1.sql y
-- ANTES de las pruebas del writer.
--
-- ----------------------------------------------------------------------------
-- REPARTO DE TRABAJO CON LA AUTO-VERIFICACIÓN DEL PROPIO APPLY (D2)
-- ----------------------------------------------------------------------------
-- El APPLY ya lleva su propio bloque de verificación DENTRO de la transacción:
-- si la forma no cuadra, no comitea nada. Este fichero NO lo duplica por
-- inercia, hace las dos cosas que aquel no puede hacer:
--
--   1. Verifica desde FUERA, en otra transacción y otra sesión. Un bloque que
--      se autoevalúa dentro de su propia transacción no puede afirmar nada
--      sobre lo que quedó COMITEADO. Esto sí.
--   2. Afirma que **el APPLY no tocó `subscriptions`**, que exige el manifiesto
--      PRE y por tanto es inalcanzable desde dentro del APPLY (que es
--      autocontenido a propósito y no conoce el andamiaje del ensayo).
--      Esta afirmación SEPARA CAUSAS: si la huella cambia aquí, la mutación es
--      del APPLY y no del writer — un hallazgo distinto, y peor.
--
-- D3 · NO se recarga la caché de esquema de PostgREST en esta fase. Es una
-- cuestión de VISIBILIDAD, no de seguridad ni de reversibilidad, y queda
-- explícitamente diferida por directiva. No añadir aquí `notify pgrst`.
-- ============================================================================

do $$
begin
  if to_regclass('public.user_portfolios') is not null then
    raise exception 'GUARD DE ENSAYO: esta es la BD de Aurix. Abortado.';
  end if;
end $$;

do $$
declare
  v_run  uuid;
  v_g    record;
  v_m    record;
  v_now  record;
  v_n    int;
  v_fl   oid;
  v_fa   oid;
begin
  perform set_config('TimeZone', 'UTC', true);

  -- ── PUERTA · sólo se verifica un APPLY que venía de un PRE verificado ─────
  select run_id into v_run from m04_rehearsal.run;
  select * into v_g from m04_rehearsal.gates where gate = 'VERIFY_PRE';
  if not found or v_g.verdict <> 'PASS' or v_g.run_id <> v_run then
    raise exception 'BLOCKED: VERIFY_PRE no es PASS para este run. Un APPLY sin PRE '
                    'verificado no es reversible y no se certifica.';
  end if;

  -- ── A. LOS CINCO OBJETOS, CON SU FORMA ────────────────────────────────────
  if to_regclass('public.billing_customers') is null then
    raise exception 'POST-APPLY FAIL: falta public.billing_customers';
  end if;
  if to_regclass('public.billing_prices') is null then
    raise exception 'POST-APPLY FAIL: falta public.billing_prices';
  end if;
  if to_regclass('public.billing_events') is null then
    raise exception 'POST-APPLY FAIL: falta public.billing_events';
  end if;

  -- Identidad por TIPOS de argumento (to_regprocedure), no por
  -- pg_get_function_identity_arguments: ésa incluye los NOMBRES de los
  -- parámetros y comparar con tipos desnudos da un falso FAIL.
  v_fl := to_regprocedure('public.aurix_billing_link_customer(uuid,text,text)')::oid;
  if v_fl is null then
    raise exception 'POST-APPLY FAIL: falta aurix_billing_link_customer(uuid,text,text)';
  end if;
  v_fa := to_regprocedure(
            'public.aurix_billing_apply_event(text,text,text,text,text,text,text,'
            'timestamptz,timestamptz,boolean,timestamptz,timestamptz,'
            'timestamptz,timestamptz)')::oid;
  if v_fa is null then
    raise exception 'POST-APPLY FAIL: falta aurix_billing_apply_event/14';
  end if;

  -- CHECKs por tabla: 2 / 7 / 2.
  select count(*) into v_n from pg_constraint
   where conrelid = 'public.billing_customers'::regclass and contype = 'c';
  if v_n <> 2 then raise exception 'POST-APPLY FAIL: billing_customers tiene % CHECK (2)', v_n; end if;
  select count(*) into v_n from pg_constraint
   where conrelid = 'public.billing_prices'::regclass and contype = 'c';
  if v_n <> 7 then raise exception 'POST-APPLY FAIL: billing_prices tiene % CHECK (7)', v_n; end if;
  select count(*) into v_n from pg_constraint
   where conrelid = 'public.billing_events'::regclass and contype = 'c';
  if v_n <> 2 then raise exception 'POST-APPLY FAIL: billing_events tiene % CHECK (2)', v_n; end if;

  -- La PK del ledger ES la idempotencia.
  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid = 'public.billing_events'::regclass and contype = 'p')
     is distinct from 'PRIMARY KEY (provider, event_id)' then
    raise exception 'POST-APPLY FAIL: la PK de billing_events no es (provider, event_id)';
  end if;

  -- Los dos índices que impiden fuga entre cuentas y catálogo ambiguo.
  if not exists (select 1 from pg_indexes where schemaname='public'
                   and indexname='billing_customers_handle_uidx') then
    raise exception 'POST-APPLY FAIL: falta billing_customers_handle_uidx '
                    '(un customer podría entitlar a dos cuentas)';
  end if;
  if not exists (select 1 from pg_indexes where schemaname='public'
                   and indexname='billing_prices_active_uidx') then
    raise exception 'POST-APPLY FAIL: falta billing_prices_active_uidx '
                    '(dos precios activos para el mismo intervalo)';
  end if;

  -- RLS activa en las tres.
  select count(*) into v_n from pg_class
   where oid in ('public.billing_customers'::regclass,
                 'public.billing_prices'::regclass,
                 'public.billing_events'::regclass)
     and relrowsecurity;
  if v_n <> 3 then raise exception 'POST-APPLY FAIL: sólo % de 3 tablas con RLS', v_n; end if;

  -- Privilegios: exactamente UNA concesión al cliente, el SELECT del catálogo.
  select count(*) into v_n
    from information_schema.role_table_grants
   where table_schema='public'
     and table_name in ('billing_customers','billing_prices','billing_events')
     and grantee in ('anon','authenticated');
  if v_n <> 1 then
    raise exception 'POST-APPLY FAIL: % concesiones a anon/authenticated (se espera 1: '
                    'billing_prices/SELECT a authenticated)', v_n;
  end if;
  if not has_table_privilege('authenticated','public.billing_prices','select') then
    raise exception 'POST-APPLY FAIL: authenticated no puede leer billing_prices';
  end if;

  -- El writer es service_role y nadie más, con search_path fijado.
  if has_function_privilege('anon', v_fl, 'execute')
     or has_function_privilege('authenticated', v_fl, 'execute')
     or has_function_privilege('anon', v_fa, 'execute')
     or has_function_privilege('authenticated', v_fa, 'execute') then
    raise exception 'POST-APPLY FAIL: el cliente puede ejecutar un writer de billing';
  end if;
  if not has_function_privilege('service_role', v_fa, 'execute') then
    raise exception 'POST-APPLY FAIL: service_role no puede ejecutar el writer';
  end if;
  if (select coalesce(array_to_string(proconfig,','),'') from pg_proc where oid=v_fa)
     <> 'search_path=public, pg_temp' then
    raise exception 'POST-APPLY FAIL: el writer no tiene search_path fijado';
  end if;

  -- Sin sobrecargas sobrantes: una de más sobreviviría al rollback.
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname like 'aurix_billing%'
     and p.oid not in (v_fl, v_fa);
  if v_n <> 0 then
    raise exception 'POST-APPLY FAIL: % sobrecargas aurix_billing* inesperadas', v_n;
  end if;

  -- ── B. NO HAY SEED ────────────────────────────────────────────────────────
  -- El APPLY deja billing_prices VACÍA a propósito (los price id no existen
  -- hasta crearlos en Stripe). Una fila aquí significaría un placeholder
  -- inventado, que es exactamente el fallo que la migración evita.
  select count(*) into v_n from public.billing_prices;
  if v_n <> 0 then
    raise exception 'POST-APPLY FAIL: billing_prices tiene % filas; el APPLY no siembra', v_n;
  end if;

  -- ── C. EL APPLY NO TOCÓ subscriptions ─────────────────────────────────────
  select * into v_m from m04_rehearsal.manifest where fase = 'PRE';
  if not found or v_m.run_id <> v_run then
    raise exception 'POST-APPLY FAIL: no hay manifiesto PRE de este run';
  end if;
  select * into v_now from m04_rehearsal.fp_data();

  if v_now.row_count <> v_m.row_count or v_now.data_fp <> v_m.data_fp then
    raise exception 'POST-APPLY FAIL: el APPLY MUTÓ subscriptions (filas %→%, fp %→%). '
                    'El APPLY debía ser aditivo.',
                    v_m.row_count, v_now.row_count, v_m.data_fp, v_now.data_fp;
  end if;
  if m04_rehearsal.fp_struct() <> v_m.struct_fp then
    raise exception 'POST-APPLY FAIL: el APPLY cambió la ESTRUCTURA de subscriptions';
  end if;

  -- ── EL GATE ───────────────────────────────────────────────────────────────
  insert into m04_rehearsal.manifest
    (fase, run_id, row_count, data_fp, struct_fp, db_name, server_ver)
  values ('POST_APPLY', v_run, v_now.row_count, v_now.data_fp,
          m04_rehearsal.fp_struct(), current_database(), version())
  on conflict (fase) do update
    set run_id = excluded.run_id, captured_at = now(), row_count = excluded.row_count,
        data_fp = excluded.data_fp, struct_fp = excluded.struct_fp;

  insert into m04_rehearsal.gates (gate, run_id, verdict, detail)
  values ('POST_APPLY', v_run, 'PASS',
          format('5 objetos con la forma esperada · catálogo vacío · '
                 'subscriptions intacta (filas=%s fp=%s)',
                 v_now.row_count, v_now.data_fp))
  on conflict (gate) do update
    set run_id = excluded.run_id, verdict = excluded.verdict,
        detail = excluded.detail, recorded_at = now();

  raise notice 'APPLY VERIFIED (gate independiente) · 5 objetos con la forma correcta · '
               'catálogo vacío · subscriptions intacta (fp=%)', v_now.data_fp;
end $$;

select gate, verdict, detail from m04_rehearsal.gates order by recorded_at;
select fase, run_id, row_count, data_fp from m04_rehearsal.manifest order by fase;
