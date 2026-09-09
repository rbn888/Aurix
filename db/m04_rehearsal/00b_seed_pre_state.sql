-- ============================================================================
-- M.04 ENSAYO · PASO 0b — SEMBRAR UN ESTADO PRE REALISTA  (sólo ensayo)
-- ----------------------------------------------------------------------------
-- Añadido durante la ejecución del rehearsal. Es andamiaje LOCAL: no cambia
-- ninguna lógica productiva y no se aplica a producción jamás.
--
-- POR QUÉ HACE FALTA. Sin filas en `subscriptions`, el ensayo pasaría por
-- vacuidad: el paso 10 (RESTORE) no tendría nada que restaurar y el paso 11
-- compararía dos tablas vacías. La asimetría que este bloque existe para
-- certificar —que el DROP de M.04 NO deshace lo que el writer escribió en una
-- tabla de B1— sólo es observable si hay un PRE con contenido y si el writer
-- lo MUTA de verdad.
--
-- Las cuatro cuentas están elegidas para cubrir las tres clases de daño que la
-- restauración tiene que saber deshacer:
--   u1  fila EXISTENTE que el writer va a ASCENDER  → el restore debe volverla a free
--   u2  fila EXISTENTE que nadie va a tocar          → el restore no debe alterarla
--   u3  fila EXISTENTE de un cliente ya churneado    → control: sobrevive intacta
--   u4  SIN fila; el writer le va a INSERTAR una     → el restore debe BORRARLA
--
-- Los uuid son literales fijos para que dos ejecuciones del ensayo sean
-- comparables entre sí.
-- ============================================================================

do $$
begin
  if to_regclass('public.user_portfolios') is not null then
    raise exception 'GUARD DE ENSAYO: esta es la BD de Aurix. Abortado.';
  end if;
end $$;

begin;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'u1-asciende@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'u2-comp@example.invalid'),
  ('33333333-3333-4333-8333-333333333333', 'u3-churn@example.invalid'),
  ('44444444-4444-4444-8444-444444444444', 'u4-sin-fila@example.invalid')
on conflict (id) do nothing;

-- u1 · la fila por defecto de B1: free, sin proveedor. Es la que el writer
--      convertirá en premium/stripe, y la que el restore tiene que devolver.
insert into public.subscriptions (user_id, plan, status, provider)
values ('11111111-1111-4111-8111-111111111111', 'free', 'active', 'none');

-- u2 · una cortesía: premium vigente con provider 'manual' y precio 0, que es
--      la forma que B1 documenta para distinguir un comp de una venta
--      (premium_price_chk exige precio no nulo; 0 dice "no se ha cobrado").
insert into public.subscriptions
  (user_id, plan, status, provider, billing_interval,
   current_period_start, current_period_end, price_amount_cents, price_currency)
values ('22222222-2222-4222-8222-222222222222', 'premium', 'active', 'manual', 'month',
        '2026-08-01 00:00:00+00', '2026-10-01 00:00:00+00', 0, 'EUR');

-- u3 · un cliente que ya pasó por Stripe y caducó. Lleva last_event_id, así que
--      también ejercita el índice único parcial (provider, last_event_id) que
--      es una de las dos trampas del restore.
insert into public.subscriptions
  (user_id, plan, status, provider, provider_customer_id, provider_subscription_id,
   last_event_id, last_event_at, canceled_at)
values ('33333333-3333-4333-8333-333333333333', 'free', 'expired', 'stripe',
        'cus_LEGADO_U3', 'sub_LEGADO_U3', 'evt_LEGADO_U3',
        '2026-07-15 10:00:00+00', '2026-07-15 10:00:00+00');

-- u4 · deliberadamente SIN fila.

commit;

select user_id, plan, status, provider, price_amount_cents, price_currency
  from public.subscriptions order by user_id;
