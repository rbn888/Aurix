-- ============================================================================
-- AURIX · M.04 PRODUCCIÓN · PASO 2 — VERIFY PRE
-- ----------------------------------------------------------------------------
-- Pegar TODO en el SQL Editor y ejecutar. Ejecutar ANTES del APPLY.
--
-- Es db/m04_rehearsal/03_verify_pre.sql con el guard invertido y nada más.
--
-- SU AUSENCIA ES LA BARRERA. Si este fichero aborta, el gate VERIFY_PRE no se
-- escribe, y sin esa fila el rollback certificado se niega a arrancar. Es decir:
-- si el PRE no está verificado, no hay marcha atrás disponible — y por tanto no
-- se debe aplicar nada.
-- ============================================================================

do $$
begin
  if to_regclass('public.user_portfolios') is null then
    raise exception 'GUARD DE PRODUCCIÓN: ésta NO es la BD de Aurix. Abortado.';
  end if;
end $$;

do $$
declare
  v_n      int;
  v_run    uuid;
  v_g      record;
  v_m      record;
  v_now    record;
  v_mirror record;
begin
  if to_regclass('m04_rehearsal.gates') is null
     or to_regclass('m04_rehearsal.manifest') is null then
    raise exception 'BLOCKED: falta el andamiaje. Ejecuta 01_pre_capture_prod.sql';
  end if;
  select run_id into v_run from m04_rehearsal.run;

  select * into v_g from m04_rehearsal.gates where gate = 'DIAGNOSE';
  if not found or v_g.verdict <> 'PASS' or v_g.run_id <> v_run then
    raise exception 'BLOCKED: DIAGNOSE no es PASS para este run';
  end if;
  select * into v_g from m04_rehearsal.gates where gate = 'PRE_CAPTURE';
  if not found or v_g.verdict <> 'PASS' or v_g.run_id <> v_run then
    raise exception 'BLOCKED: PRE_CAPTURE no es PASS para este run';
  end if;

  -- ── A. M.04 SIGUE AUSENTE ────────────────────────────────────────────────
  -- Por CATÁLOGO, que es lo que separa "no existe" de "existe y PostgREST no lo
  -- anuncia" (PGRST205). Una sonda HTTP no sabe distinguirlo.
  if to_regclass('public.billing_customers') is not null then
    raise exception 'VERIFY PRE FAIL: existe public.billing_customers';
  end if;
  if to_regclass('public.billing_prices') is not null then
    raise exception 'VERIFY PRE FAIL: existe public.billing_prices';
  end if;
  if to_regclass('public.billing_events') is not null then
    raise exception 'VERIFY PRE FAIL: existe public.billing_events';
  end if;
  select count(*) into v_n
    from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname like 'aurix_billing%';
  if v_n <> 0 then
    raise exception 'VERIFY PRE FAIL: existen % funciones aurix_billing*', v_n;
  end if;

  -- ── B. B1/B2 EN PIE ──────────────────────────────────────────────────────
  if to_regclass('public.subscriptions') is null
     or to_regclass('public.plan_features') is null
     or to_regclass('public.entitlement_overrides') is null then
    raise exception 'VERIFY PRE FAIL: falta una tabla de B1';
  end if;
  if to_regprocedure('public.aurix_touch_updated_at()') is null then
    raise exception 'VERIFY PRE FAIL: falta aurix_touch_updated_at() (lo usan los '
                    'triggers de M.04)';
  end if;
  if to_regprocedure('public.aurix_entitlements()') is null then
    raise exception 'VERIFY PRE FAIL: falta el resolver aurix_entitlements() de B2';
  end if;
  select count(*) into v_n from pg_constraint
   where conrelid = 'public.subscriptions'::regclass and contype = 'c';
  if v_n <> 12 then
    raise exception 'VERIFY PRE FAIL: subscriptions tiene % CHECK, se esperaban 12', v_n;
  end if;

  -- ── C. EL PRE ES VÁLIDO, COMPLETO Y REPRODUCIBLE ─────────────────────────
  if to_regclass('m04_rehearsal.subscriptions_pre') is null then
    raise exception 'VERIFY PRE FAIL: no hay espejo. Ejecuta 01_pre_capture_prod.sql';
  end if;
  select * into v_m from m04_rehearsal.manifest where fase = 'PRE';
  if not found then
    raise exception 'VERIFY PRE FAIL: el manifiesto no tiene fila PRE';
  end if;
  if v_m.run_id <> v_run then
    raise exception 'VERIFY PRE FAIL: la fila PRE es del run % y el actual es %',
                    v_m.run_id, v_run;
  end if;

  select * into v_now    from m04_rehearsal.fp_data();
  select * into v_mirror from m04_rehearsal.fp_of('m04_rehearsal.subscriptions_pre'::regclass);

  if v_now.row_count <> v_m.row_count then
    raise exception 'VERIFY PRE FAIL: filas live=% manifiesto=%',
                    v_now.row_count, v_m.row_count;
  end if;
  if v_mirror.row_count <> v_m.row_count then
    raise exception 'VERIFY PRE FAIL: espejo=% manifiesto=% (captura INCOMPLETA)',
                    v_mirror.row_count, v_m.row_count;
  end if;
  if v_now.data_fp <> v_m.data_fp then
    raise exception 'VERIFY PRE FAIL: la tabla viva ha CAMBIADO desde la captura '
                    '(ahora=% PRE=%). Recapturar antes de aplicar.',
                    v_now.data_fp, v_m.data_fp;
  end if;
  if v_mirror.data_fp <> v_m.data_fp then
    raise exception 'VERIFY PRE FAIL: la huella del ESPEJO (%) no es la registrada '
                    '(%): el snapshot no es fiel y no restauraría el PRE.',
                    v_mirror.data_fp, v_m.data_fp;
  end if;
  if m04_rehearsal.fp_struct() <> v_m.struct_fp then
    raise exception 'VERIFY PRE FAIL: struct_fp no reproducible';
  end if;

  -- ── EL GATE ───────────────────────────────────────────────────────────────
  -- El formato del `detail` es EXACTAMENTE el que el rollback certificado cruza
  -- contra el manifiesto para detectar evidencia alterada. No cambiarlo.
  insert into m04_rehearsal.gates (gate, run_id, verdict, detail)
  values ('VERIFY_PRE', v_run, 'PASS',
          format('filas=%s data_fp=%s struct_fp=%s',
                 v_m.row_count, v_m.data_fp, v_m.struct_fp))
  on conflict (gate) do update
    set run_id = excluded.run_id, verdict = excluded.verdict,
        detail = excluded.detail, recorded_at = now();

  raise notice 'VERIFY PRE = PASS · M.04 ausente · filas=% · data_fp=%',
               v_m.row_count, v_m.data_fp;
end $$;

select gate, verdict, detail, recorded_at from m04_rehearsal.gates order by recorded_at;
