-- ============================================================================
-- M.04 ENSAYO · PASO 3 — VERIFY PRE  (antes de aplicar M.04)
-- ----------------------------------------------------------------------------
-- *** NO EJECUTADO. Artefacto preparatorio. ***
-- psql -1 -v ON_ERROR_STOP=1 -f db/m04_rehearsal/03_verify_pre.sql
--
-- Tres afirmaciones, todas objetivas:
--   A. Los objetos M.04 están AUSENTES. Es la sonda que ya conocemos del
--      bloqueo real: `to_regclass` responde por el CATÁLOGO, así que separa
--      "no existe" de "existe pero PostgREST no lo anuncia" (PGRST205). Una
--      sonda HTTP no sabe distinguirlo; ésta sí.
--   B. B1/B2 están en pie con sus 12 CHECK. Sin ellos el ensayo mediría un
--      writer más permisivo que el de producción.
--   C. La captura PRE existe, pertenece a ESTE run, está COMPLETA y su huella
--      es reproducible AHORA — recalculada sobre la tabla viva Y sobre el
--      espejo. Una captura cuya huella no se puede recalcular no es una
--      captura: es un número copiado.
--
-- Cualquier diferencia ⇒ FAIL, y el `raise` aborta. Si aborta, NO se escribe el
-- gate VERIFY_PRE, y sin ese gate el ROLLBACK queda BLOCKED. Ésa es la cadena:
-- la barrera del rollback no es una promesa del operador, es la ausencia de una
-- fila que sólo este fichero puede escribir.
-- ============================================================================

do $$
begin
  if to_regclass('public.user_portfolios') is not null then
    raise exception 'GUARD DE ENSAYO: esta es la BD de Aurix. Abortado.';
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
  -- ── PUERTA · la captura PRE de ESTE run existe y viene de un LIMPIO ───────
  if to_regclass('m04_rehearsal.gates') is null
     or to_regclass('m04_rehearsal.manifest') is null then
    raise exception 'BLOCKED: falta el andamiaje del ensayo (pasos 1 y 2)';
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

  -- ── A. OBJETOS M.04 AUSENTES ──────────────────────────────────────────────
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
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'aurix_billing%';
  if v_n <> 0 then
    raise exception 'VERIFY PRE FAIL: existen % funciones aurix_billing*', v_n;
  end if;

  -- ── B. PRECONDICIONES DE B1/B2 ────────────────────────────────────────────
  if to_regclass('public.subscriptions') is null
     or to_regclass('public.plan_features') is null
     or to_regclass('public.entitlement_overrides') is null then
    raise exception 'VERIFY PRE FAIL: falta una tabla de B1';
  end if;
  if to_regprocedure('public.aurix_touch_updated_at()') is null then
    raise exception 'VERIFY PRE FAIL: falta aurix_touch_updated_at()';
  end if;
  select count(*) into v_n
    from pg_constraint where conrelid = 'public.subscriptions'::regclass and contype = 'c';
  if v_n <> 12 then
    raise exception 'VERIFY PRE FAIL: subscriptions tiene % CHECK, se esperaban 12', v_n;
  end if;

  -- ── C. LA CAPTURA PRE ES VÁLIDA, COMPLETA Y REPRODUCIBLE ──────────────────
  if to_regclass('m04_rehearsal.subscriptions_pre') is null then
    raise exception 'VERIFY PRE FAIL: no hay espejo. Ejecuta 02_pre_capture.sql';
  end if;

  select * into v_m from m04_rehearsal.manifest where fase = 'PRE';
  if not found then
    raise exception 'VERIFY PRE FAIL: el manifiesto no tiene fila PRE';
  end if;
  if v_m.run_id <> v_run then
    raise exception 'VERIFY PRE FAIL: la fila PRE del manifiesto es del run % y este '
                    'ensayo es el %', v_m.run_id, v_run;
  end if;

  select * into v_now    from m04_rehearsal.fp_data();
  select * into v_mirror from m04_rehearsal.fp_of('m04_rehearsal.subscriptions_pre'::regclass);

  if v_now.row_count <> v_m.row_count then
    raise exception 'VERIFY PRE FAIL: filas live=% manifiesto=%',
                    v_now.row_count, v_m.row_count;
  end if;
  if v_mirror.row_count <> v_m.row_count then
    raise exception 'VERIFY PRE FAIL: filas espejo=% manifiesto=% (captura INCOMPLETA)',
                    v_mirror.row_count, v_m.row_count;
  end if;
  if v_now.data_fp <> v_m.data_fp then
    raise exception 'VERIFY PRE FAIL: data_fp no reproducible sobre la tabla viva '
                    '(ahora=% manifiesto=%)', v_now.data_fp, v_m.data_fp;
  end if;
  if v_mirror.data_fp <> v_m.data_fp then
    raise exception 'VERIFY PRE FAIL: la huella del ESPEJO (%) no es la del manifiesto '
                    '(%): el snapshot no es fiel', v_mirror.data_fp, v_m.data_fp;
  end if;
  if m04_rehearsal.fp_struct() <> v_m.struct_fp then
    raise exception 'VERIFY PRE FAIL: struct_fp no reproducible';
  end if;

  -- ── EL GATE ───────────────────────────────────────────────────────────────
  -- Se escribe la huella DENTRO del detalle, no sólo un 'PASS': así el rollback
  -- puede comprobar que lo que verificó este paso es lo mismo que él encuentra,
  -- sin fiarse de que nadie tocara el manifiesto en medio.
  insert into m04_rehearsal.gates (gate, run_id, verdict, detail)
  values ('VERIFY_PRE', v_run, 'PASS',
          format('filas=%s data_fp=%s struct_fp=%s',
                 v_m.row_count, v_m.data_fp, v_m.struct_fp))
  on conflict (gate) do update
    set run_id = excluded.run_id, verdict = excluded.verdict,
        detail = excluded.detail, recorded_at = now();

  raise notice 'VERIFY PRE = PASS · M.04 ausente · filas=% · data_fp=% · struct_fp=%',
               v_m.row_count, v_m.data_fp, v_m.struct_fp;
  raise notice 'Siguiente paso: APPLY (db/monetization_m04_billing_stripe_1.sql)';
end $$;

select gate, verdict, detail from m04_rehearsal.gates order by recorded_at;
