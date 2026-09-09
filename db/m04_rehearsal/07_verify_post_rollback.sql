-- ============================================================================
-- M.04 ENSAYO · PASO 7 — VERIFY POST-ROLLBACK
-- ----------------------------------------------------------------------------
-- *** NO EJECUTADO. Artefacto preparatorio. ***
-- psql -1 -v ON_ERROR_STOP=1 -f db/m04_rehearsal/07_verify_post_rollback.sql
--
-- Cuatro afirmaciones. CUALQUIER diferencia = FAIL:
--   A. Objetos M.04 AUSENTES (tablas, funciones, incluidas sobrecargas).
--   B. subscriptions IDÉNTICA al PRE — por DOS métodos independientes:
--        · huella md5 sobre to_jsonb (detecta cualquier cambio de valor)
--        · EXCEPT nativo EN AMBOS SENTIDOS (live−PRE y PRE−live)
--      Se usan los dos a propósito: comparan por caminos distintos (texto
--      canónico vs. tipos nativos), así que un fallo de uno no puede ocultar el
--      del otro. Y el EXCEPT en un solo sentido no es una comparación: sin la
--      dirección PRE−live, una fila del PRE que se perdiera daría PASS.
--   C. La ESTRUCTURA de subscriptions es la del PRE (struct_fp).
--   D. SIN RESTOS M.04 en ningún catálogo, y B1/B2 EN PIE.
-- ============================================================================

do $$
begin
  if to_regclass('public.user_portfolios') is not null then
    raise exception 'GUARD DE ENSAYO: esta es la BD de Aurix. Abortado.';
  end if;
end $$;

do $$
declare
  v_m       record;
  v_now     record;
  v_n       int;
  v_l_menos int;
  v_p_menos int;
  v_restos  text;
  v_run     uuid;
  v_g       record;
begin
  perform set_config('TimeZone', 'UTC', true);   -- determinismo de la huella

  -- ── PUERTA · se certifica el final de una secuencia COMPLETA ─────────────
  -- Sin ROLLBACK y RESTORE registrados, este fichero podría dar PASS sobre un
  -- estado que simplemente nunca llegó a tener M.04 — un PASS vacío.
  select run_id into v_run from m04_rehearsal.run;
  select * into v_g from m04_rehearsal.gates where gate = 'ROLLBACK';
  if not found or v_g.verdict <> 'PASS' or v_g.run_id <> v_run then
    raise exception 'BLOCKED: no hay gate ROLLBACK=PASS de este run.';
  end if;
  select * into v_g from m04_rehearsal.gates where gate = 'RESTORE';
  if not found or v_g.verdict <> 'PASS' or v_g.run_id <> v_run then
    raise exception 'BLOCKED: no hay gate RESTORE=PASS de este run. El rollback '
                    'estructural sin restauración NO es un estado certificable.';
  end if;

  -- ── A. OBJETOS M.04 AUSENTES ──────────────────────────────────────────────
  if to_regclass('public.billing_customers') is not null then
    raise exception 'VERIFY POST FAIL: sigue existiendo public.billing_customers';
  end if;
  if to_regclass('public.billing_prices') is not null then
    raise exception 'VERIFY POST FAIL: sigue existiendo public.billing_prices';
  end if;
  if to_regclass('public.billing_events') is not null then
    raise exception 'VERIFY POST FAIL: sigue existiendo public.billing_events';
  end if;

  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'aurix_billing%';
  if v_n <> 0 then
    raise exception 'VERIFY POST FAIL: quedan % funciones aurix_billing*', v_n;
  end if;

  -- ── B. IGUALDAD DE DATOS ──────────────────────────────────────────────────
  select * into v_m from m04_rehearsal.manifest where fase = 'PRE';
  if not found or v_m.run_id <> v_run then
    raise exception 'VERIFY POST FAIL: no hay manifiesto PRE de este run con el que comparar';
  end if;

  select * into v_now from m04_rehearsal.fp_data();

  if v_now.row_count <> v_m.row_count then
    raise exception 'VERIFY POST FAIL: filas ahora=% PRE=%',
                    v_now.row_count, v_m.row_count;
  end if;
  if v_now.data_fp <> v_m.data_fp then
    raise exception 'VERIFY POST FAIL: data_fp ahora=% PRE=%',
                    v_now.data_fp, v_m.data_fp;
  end if;

  -- Comparación en AMBOS sentidos, sobre tipos nativos (EXCEPT trata NULL como
  -- igual a NULL, que es la semántica que queremos aquí).
  select count(*) into v_l_menos from (
    select * from public.subscriptions
    except
    select * from m04_rehearsal.subscriptions_pre
  ) q;
  select count(*) into v_p_menos from (
    select * from m04_rehearsal.subscriptions_pre
    except
    select * from public.subscriptions
  ) q;

  if v_l_menos <> 0 then
    raise exception 'VERIFY POST FAIL: % filas en subscriptions que NO están en el PRE '
                    '(escrituras del writer no revertidas)', v_l_menos;
  end if;
  if v_p_menos <> 0 then
    raise exception 'VERIFY POST FAIL: % filas del PRE que ya NO están en subscriptions '
                    '(la restauración perdió estado)', v_p_menos;
  end if;

  -- ── C. IGUALDAD DE ESTRUCTURA ─────────────────────────────────────────────
  if m04_rehearsal.fp_struct() <> v_m.struct_fp then
    raise exception 'VERIFY POST FAIL: la ESTRUCTURA de subscriptions no es la del PRE '
                    '(columnas / CHECK / índices / triggers / políticas / grants)';
  end if;

  -- ── D. SIN RESTOS · B1/B2 EN PIE ──────────────────────────────────────────
  -- Barrido por nombre en tablas, vistas, secuencias, tipos, funciones,
  -- políticas y triggers. Un objeto M.04 con otro nombre no lo detecta esto,
  -- pero el APPLY sólo crea los cinco inventariados y sus dependientes.
  select string_agg(x.obj, ', ') into v_restos from (
    select 'rel:' || c.relname as obj
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname like 'billing\_%'
    union all
    select 'proc:' || p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like '%billing%'
    union all
    select 'trg:' || t.tgname
      from pg_trigger t where not t.tgisinternal and t.tgname like 'billing\_%'
    union all
    select 'pol:' || pol.polname
      from pg_policy pol where pol.polname like 'billing\_%'
  ) x;
  if v_restos is not null then
    raise exception 'VERIFY POST FAIL: restos M.04 en el catálogo: %', v_restos;
  end if;

  if to_regclass('public.subscriptions') is null
     or to_regclass('public.plan_features') is null
     or to_regclass('public.entitlement_overrides') is null
     or to_regprocedure('public.aurix_touch_updated_at()') is null
     or to_regprocedure('public.aurix_entitlements()') is null then
    raise exception 'VERIFY POST FAIL: el rollback dañó B1/B2';
  end if;

  select count(*) into v_n
    from pg_constraint where conrelid = 'public.subscriptions'::regclass and contype = 'c';
  if v_n <> 12 then
    raise exception 'VERIFY POST FAIL: subscriptions tiene % CHECK, se esperaban 12', v_n;
  end if;

  insert into m04_rehearsal.gates (gate, run_id, verdict, detail)
  values ('VERIFY_POST', v_run, 'PASS',
          format('0 objetos M.04 · filas=%s data_fp=%s · struct igual · EXCEPT 0/0 '
                 '· B1/B2 en pie', v_now.row_count, v_now.data_fp))
  on conflict (gate) do update
    set run_id = excluded.run_id, verdict = excluded.verdict,
        detail = excluded.detail, recorded_at = now();

  raise notice 'VERIFY POST-ROLLBACK = PASS · 0 objetos M.04 · filas=% · data_fp=% '
               '· struct_fp igual · EXCEPT 0/0 · B1/B2 en pie',
               v_now.row_count, v_now.data_fp;
end $$;

-- Registrar la fase POST para que la evidencia sea una tabla, no un NOTICE que
-- el cliente SQL puede no mostrar.
insert into m04_rehearsal.manifest
  (fase, run_id, row_count, data_fp, struct_fp, db_name, server_ver)
select 'POST', (select run_id from m04_rehearsal.run),
       d.row_count, d.data_fp, m04_rehearsal.fp_struct(),
       current_database(), version()
  from m04_rehearsal.fp_data() d
on conflict (fase) do update
  set run_id = excluded.run_id, captured_at = now(), row_count = excluded.row_count,
      data_fp = excluded.data_fp, struct_fp = excluded.struct_fp;

-- El parte final del ensayo: PRE.data_fp == POST.data_fp es la afirmación
-- central, y las puertas de al lado dicen por qué camino se llegó hasta ella.
select fase, run_id, captured_at, row_count, data_fp, struct_fp
  from m04_rehearsal.manifest order by fase;

select gate, verdict, detail, recorded_at from m04_rehearsal.gates order by recorded_at;
