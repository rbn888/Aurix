-- ============================================================================
-- AURIX · M.04 PRODUCCIÓN · PASO 4 — VERIFY POST-APPLY
-- ----------------------------------------------------------------------------
-- Pegar TODO en el SQL Editor. Ejecutar INMEDIATAMENTE después del APPLY.
--
-- Es db/m04_rehearsal/04_verify_post_apply.sql con el guard invertido, MÁS la
-- comparación EXCEPT en ambos sentidos contra el espejo (que en el rehearsal
-- vivía sólo en el paso 07). Aquí importa desde ya: es la prueba directa de que
-- `subscriptions` no se movió, y una sola dirección no basta — sin `PRE − live`,
-- una fila que se PERDIERA daría PASS.
--
-- NO duplica la auto-verificación D2 del APPLY. Hace las dos cosas que aquélla
-- no puede: verificar desde FUERA, en otra transacción, lo que quedó COMITEADO;
-- y afirmar que el APPLY no tocó subscriptions, que exige el manifiesto PRE y es
-- inalcanzable desde dentro de un APPLY autocontenido.
--
-- D3 sigue fuera: NO se emite `notify pgrst, 'reload schema'`.
-- ============================================================================

do $$
begin
  if to_regclass('public.user_portfolios') is null then
    raise exception 'GUARD DE PRODUCCIÓN: ésta NO es la BD de Aurix. Abortado.';
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
  v_l    int;
  v_p    int;
begin
  perform set_config('TimeZone', 'UTC', true);

  select run_id into v_run from m04_rehearsal.run;
  select * into v_g from m04_rehearsal.gates where gate = 'VERIFY_PRE';
  if not found or v_g.verdict <> 'PASS' or v_g.run_id <> v_run then
    raise exception 'BLOCKED: VERIFY_PRE no es PASS para este run. Un APPLY sin PRE '
                    'verificado no es reversible y no se certifica.';
  end if;

  -- ── A. LOS CINCO OBJETOS, CON SU FORMA ───────────────────────────────────
  if to_regclass('public.billing_customers') is null
     or to_regclass('public.billing_prices') is null
     or to_regclass('public.billing_events') is null then
    raise exception 'POST-APPLY FAIL: falta al menos una de las tres tablas';
  end if;

  -- Identidad por TIPOS de argumento. NO por
  -- pg_get_function_identity_arguments, que incluye los NOMBRES de los
  -- parámetros: compararla con tipos desnudos da FAIL contra un M.04 PERFECTO.
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

  select count(*) into v_n from pg_constraint
   where conrelid = 'public.billing_customers'::regclass and contype = 'c';
  if v_n <> 2 then raise exception 'POST-APPLY FAIL: billing_customers % CHECK (2)', v_n; end if;
  select count(*) into v_n from pg_constraint
   where conrelid = 'public.billing_prices'::regclass and contype = 'c';
  if v_n <> 7 then raise exception 'POST-APPLY FAIL: billing_prices % CHECK (7)', v_n; end if;
  select count(*) into v_n from pg_constraint
   where conrelid = 'public.billing_events'::regclass and contype = 'c';
  if v_n <> 2 then raise exception 'POST-APPLY FAIL: billing_events % CHECK (2)', v_n; end if;

  -- La PK del ledger ES la idempotencia del webhook.
  if (select pg_get_constraintdef(c.oid) from pg_constraint c
       where c.conrelid = 'public.billing_events'::regclass and c.contype = 'p')
     is distinct from 'PRIMARY KEY (provider, event_id)' then
    raise exception 'POST-APPLY FAIL: la PK de billing_events no es (provider, event_id)';
  end if;

  if not exists (select 1 from pg_index x join pg_class i on i.oid = x.indexrelid
                  where x.indrelid = 'public.billing_customers'::regclass
                    and x.indisunique and i.relname = 'billing_customers_handle_uidx') then
    raise exception 'POST-APPLY FAIL: falta billing_customers_handle_uidx (un customer '
                    'podría entitlar a dos cuentas)';
  end if;
  if not exists (select 1 from pg_index x join pg_class i on i.oid = x.indexrelid
                  where x.indrelid = 'public.billing_prices'::regclass
                    and x.indisunique and x.indpred is not null
                    and i.relname = 'billing_prices_active_uidx') then
    raise exception 'POST-APPLY FAIL: falta billing_prices_active_uidx';
  end if;

  select count(*) into v_n from pg_class
   where oid in ('public.billing_customers'::regclass,
                 'public.billing_prices'::regclass,
                 'public.billing_events'::regclass)
     and relrowsecurity;
  if v_n <> 3 then raise exception 'POST-APPLY FAIL: sólo % de 3 tablas con RLS', v_n; end if;

  -- Exactamente UNA concesión al cliente en todo M.04.
  select count(*) into v_n
    from pg_class c cross join lateral aclexplode(c.relacl) ac
    join pg_roles g on g.oid = ac.grantee
   where c.oid in ('public.billing_customers'::regclass,
                   'public.billing_prices'::regclass,
                   'public.billing_events'::regclass)
     and g.rolname in ('anon','authenticated');
  if v_n <> 1 then
    raise exception 'POST-APPLY FAIL: % privilegios de cliente (se espera 1: '
                    'billing_prices/SELECT a authenticated)', v_n;
  end if;
  if not has_table_privilege('authenticated','public.billing_prices','select') then
    raise exception 'POST-APPLY FAIL: authenticated no puede leer el catálogo';
  end if;

  if has_function_privilege('anon', v_fl, 'execute')
     or has_function_privilege('authenticated', v_fl, 'execute')
     or has_function_privilege('anon', v_fa, 'execute')
     or has_function_privilege('authenticated', v_fa, 'execute') then
    raise exception 'POST-APPLY FAIL: el cliente puede ejecutar un writer de billing';
  end if;
  if not has_function_privilege('service_role', v_fa, 'execute') then
    raise exception 'POST-APPLY FAIL: service_role no puede ejecutar el writer';
  end if;
  if (select coalesce(array_to_string(proconfig,','),'') from pg_proc where oid = v_fa)
     <> 'search_path=public, pg_temp' then
    raise exception 'POST-APPLY FAIL: el writer no tiene search_path fijado';
  end if;

  -- Una sobrecarga sobrante sobreviviría al DROP del rollback.
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname like 'aurix_billing%'
     and p.oid not in (v_fl, v_fa);
  if v_n <> 0 then
    raise exception 'POST-APPLY FAIL: % sobrecargas aurix_billing* inesperadas', v_n;
  end if;

  -- ── B. EL CATÁLOGO ESTÁ VACÍO ────────────────────────────────────────────
  -- El APPLY no siembra a propósito: los price_id no existen hasta crearlos en
  -- Stripe. Una fila aquí sería un placeholder inventado.
  select count(*) into v_n from public.billing_prices;
  if v_n <> 0 then
    raise exception 'POST-APPLY FAIL: billing_prices tiene % filas; el APPLY no siembra', v_n;
  end if;

  -- ── C. subscriptions NO SE HA MOVIDO · dos métodos independientes ────────
  select * into v_m from m04_rehearsal.manifest where fase = 'PRE';
  if not found or v_m.run_id <> v_run then
    raise exception 'POST-APPLY FAIL: no hay manifiesto PRE de este run';
  end if;
  select * into v_now from m04_rehearsal.fp_data();

  if v_now.row_count <> v_m.row_count or v_now.data_fp <> v_m.data_fp then
    raise exception 'POST-APPLY FAIL: el APPLY MUTÓ subscriptions (filas %→%, fp %→%). '
                    'El APPLY debía ser ADITIVO. Camino de salida: rollback + restore.',
                    v_m.row_count, v_now.row_count, v_m.data_fp, v_now.data_fp;
  end if;
  if m04_rehearsal.fp_struct() <> v_m.struct_fp then
    raise exception 'POST-APPLY FAIL: el APPLY cambió la ESTRUCTURA de subscriptions';
  end if;

  select count(*) into v_l from (
    select * from public.subscriptions
    except select * from m04_rehearsal.subscriptions_pre) q;
  select count(*) into v_p from (
    select * from m04_rehearsal.subscriptions_pre
    except select * from public.subscriptions) q;
  if v_l <> 0 or v_p <> 0 then
    raise exception 'POST-APPLY FAIL: EXCEPT live−PRE=% PRE−live=% (debía ser 0/0)',
                    v_l, v_p;
  end if;

  insert into m04_rehearsal.manifest
    (fase, run_id, row_count, data_fp, struct_fp, db_name, server_ver)
  values ('POST_APPLY', v_run, v_now.row_count, v_now.data_fp,
          m04_rehearsal.fp_struct(), current_database(), version())
  on conflict (fase) do update
    set run_id = excluded.run_id, captured_at = now(), row_count = excluded.row_count,
        data_fp = excluded.data_fp, struct_fp = excluded.struct_fp;

  insert into m04_rehearsal.gates (gate, run_id, verdict, detail)
  values ('POST_APPLY', v_run, 'PASS',
          format('5 objetos con la forma esperada · catálogo vacío · subscriptions '
                 'intacta (filas=%s fp=%s) · EXCEPT 0/0', v_now.row_count, v_now.data_fp))
  on conflict (gate) do update
    set run_id = excluded.run_id, verdict = excluded.verdict,
        detail = excluded.detail, recorded_at = now();

  raise notice 'APPLY VERIFIED (gate independiente) · subscriptions intacta (fp=%) '
               '· EXCEPT 0/0', v_now.data_fp;
end $$;

select gate, verdict, detail from m04_rehearsal.gates order by recorded_at;
select fase, row_count, data_fp from m04_rehearsal.manifest order by captured_at;
