-- ============================================================================
-- M.04 ENSAYO · PASO 5b — MUTACIÓN **PERSISTIDA** DEL WRITER  (sólo ensayo)
-- ----------------------------------------------------------------------------
-- Añadido durante la ejecución del rehearsal. Andamiaje LOCAL: no cambia
-- ninguna lógica productiva.
--
-- POR QUÉ HACE FALTA — es el hueco que la ejecución destapó en el plan.
-- `05_writer_idempotency_tests.sql` corre dentro de `begin; … rollback;` y por
-- diseño NO deja residuo, lo cual es correcto para probar el writer... y
-- convierte en VACUO lo que viene después: si `subscriptions` no ha cambiado,
-- el rollback no tiene asimetría que dejar al descubierto, el paso 10 no tiene
-- nada que restaurar y el paso 11 compara la tabla consigo misma. Habría dado
-- PASS sin haber demostrado NADA de lo que este bloque existe para demostrar.
--
-- Así que aquí el writer escribe DE VERDAD y se COMITEA, como lo haría un
-- webhook de Stripe real:
--   u1 (free) ─────────────► premium/stripe     · el rollback NO lo deshará
--   u4 (sin fila) ─────────► fila NUEVA premium · el rollback NO la borrará
--
-- Al terminar, la huella de `subscriptions` TIENE que ser distinta de la del
-- PRE. Si coincidiera, este paso no habría hecho su trabajo y el resto del
-- ensayo no probaría la reversibilidad — por eso se afirma explícitamente.
--
-- Sigue sin haber Stripe: los eventos se fabrican y se pasan a la función, que
-- es donde vive la decisión. Lo que no se ejerce aquí es el transporte.
-- ============================================================================

do $$
begin
  if to_regclass('public.user_portfolios') is not null then
    raise exception 'GUARD DE ENSAYO: esta es la BD de Aurix. Abortado.';
  end if;
end $$;

begin;

-- El catálogo lo siembra el founder tras crear los precios en Stripe; aquí se
-- siembra un precio de ENSAYO para que el writer tenga de dónde leer plan,
-- intervalo, importe y divisa. Sin fila en billing_prices el writer rechaza
-- con `unknown_price`, que es su comportamiento correcto.
insert into public.billing_prices
  (provider, provider_price_id, plan, billing_interval, amount_cents, currency, trial_days, active)
values ('stripe', 'price_ENSAYO_MENSUAL', 'premium', 'month', 799, 'EUR', 0, true)
on conflict (provider, provider_price_id) do nothing;

do $$
declare
  v_u1  uuid := '11111111-1111-4111-8111-111111111111';
  v_u4  uuid := '44444444-4444-4444-8444-444444444444';
  r     jsonb;
  s     public.subscriptions;
  v_pre record;
  v_now record;
begin
  perform public.aurix_billing_link_customer(v_u1, 'stripe', 'cus_LIVE_U1');
  perform public.aurix_billing_link_customer(v_u4, 'stripe', 'cus_LIVE_U4');

  -- u1: fila EXISTENTE free ⇒ el writer la ASCIENDE (UPDATE).
  r := public.aurix_billing_apply_event(
         'stripe','evt_LIVE_U1','customer.subscription.created',
         'cus_LIVE_U1','sub_LIVE_U1','price_ENSAYO_MENSUAL','active',
         '2026-09-01 00:00:00+00', '2026-10-01 00:00:00+00', false,
         null, null, null, '2026-09-01 00:00:05+00');
  if r->>'outcome' <> 'applied' then
    raise exception '5b/u1: outcome=% (esperado applied)', r->>'outcome';
  end if;
  select * into s from public.subscriptions where user_id = v_u1;
  if s.plan <> 'premium' or s.provider <> 'stripe' then
    raise exception '5b/u1: no ascendió (plan=% provider=%)', s.plan, s.provider;
  end if;

  -- u4: SIN fila ⇒ el writer la CREA (INSERT). El restore tendrá que BORRARLA,
  -- que es la clase de daño que un upsert de restauración no cubriría.
  r := public.aurix_billing_apply_event(
         'stripe','evt_LIVE_U4','customer.subscription.created',
         'cus_LIVE_U4','sub_LIVE_U4','price_ENSAYO_MENSUAL','active',
         '2026-09-01 00:00:00+00', '2026-10-01 00:00:00+00', false,
         null, null, null, '2026-09-01 00:00:06+00');
  if r->>'outcome' <> 'applied' then
    raise exception '5b/u4: outcome=% (esperado applied)', r->>'outcome';
  end if;
  if not exists (select 1 from public.subscriptions where user_id = v_u4) then
    raise exception '5b/u4: no se creó la fila';
  end if;

  -- LA AFIRMACIÓN QUE DA SENTIDO AL RESTO DEL ENSAYO.
  select * into v_pre from m04_rehearsal.manifest where fase = 'PRE';
  select * into v_now from m04_rehearsal.fp_data();
  if v_now.data_fp = v_pre.data_fp then
    raise exception '5b: la huella NO se movió (%). Sin mutación persistida, el '
                    'rollback y el restore no probarían nada.', v_now.data_fp;
  end if;

  raise notice 'MUTACIÓN PERSISTIDA · filas %→% · fp %→%',
               v_pre.row_count, v_now.row_count, v_pre.data_fp, v_now.data_fp;
end $$;

commit;

-- Se registra como fase, no como puerta: es el estado "sucio" contra el que se
-- medirá la reversibilidad.
insert into m04_rehearsal.manifest
  (fase, run_id, row_count, data_fp, struct_fp, db_name, server_ver)
select 'DIRTY', (select run_id from m04_rehearsal.run),
       d.row_count, d.data_fp, m04_rehearsal.fp_struct(), current_database(), version()
  from m04_rehearsal.fp_data() d
on conflict (fase) do update
  set run_id = excluded.run_id, captured_at = now(), row_count = excluded.row_count,
      data_fp = excluded.data_fp, struct_fp = excluded.struct_fp;

select user_id, plan, status, provider, price_amount_cents, provider_subscription_id
  from public.subscriptions order by user_id;
