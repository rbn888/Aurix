-- ============================================================================
-- AURIX · M.04 PRODUCCIÓN · PASO 5 — SEED de los dos precios Stripe TEST
-- ----------------------------------------------------------------------------
-- Los importes son la decisión de producto de M.04 (7,99 €/mes · 59,99 €/año).
-- Esta tabla es el precio DE RECORD: no ajustar aquí para cuadrar con Stripe.
-- Idempotente por PK (provider, provider_price_id). Fail-closed contra
-- billing_prices_active_uidx: si ya existiera OTRO precio activo para
-- (stripe, premium, month|year), aborta con unique violation y no siembra nada.
-- ============================================================================

insert into public.billing_prices
  (provider, provider_price_id, plan, billing_interval, amount_cents, currency, trial_days, active)
values
  ('stripe', 'price_1UBeqjKuk0nQ7dBIPx0Luq1i', 'premium', 'month',  799, 'EUR', 0, true),
  ('stripe', 'price_1UBetMKuk0nQ7dBISxq3UtoB', 'premium', 'year',  5999, 'EUR', 0, true)
on conflict (provider, provider_price_id) do update
  set plan             = excluded.plan,
      billing_interval = excluded.billing_interval,
      amount_cents     = excluded.amount_cents,
      currency         = excluded.currency,
      trial_days       = excluded.trial_days,
      active           = excluded.active;

-- ── VERIFICACIÓN (solo lectura) · se espera 2 / 2 / 2 ───────────────────────
select
  count(*)                                                as filas_totales,
  count(*) filter (where active)                          as activas,
  count(*) filter (where active
                     and provider = 'stripe' and plan = 'premium'
                     and currency = 'EUR'    and trial_days = 0
                     and (provider_price_id, billing_interval, amount_cents) in (
                       ('price_1UBeqjKuk0nQ7dBIPx0Luq1i', 'month',  799),
                       ('price_1UBetMKuk0nQ7dBISxq3UtoB', 'year',  5999))) as exactas
from public.billing_prices;
