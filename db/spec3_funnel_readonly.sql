-- ============================================================================
-- SPEC 3 · BLOQUE 3 — EMBUDO MÍNIMO CON LO QUE YA EXISTE (SÓLO LECTURA)
-- ----------------------------------------------------------------------------
-- Pegar en el editor SQL de Supabase (rol del editor = acceso a auth.users).
-- NO crea, NO modifica y NO concede nada: un único SELECT. Devuelve SÓLO
-- recuentos por cohorte semanal — ningún email, user_id, importe, posición ni
-- contenido de documento sale de la consulta.
--
-- PASOS QUE SE MIDEN AQUÍ (fuente autoritativa del servidor, no del navegador):
--   registered      auth.users.created_at
--   first_position  primera captura del servidor con activos (portfolio_snapshots:
--                   asset_count > 0 y total_value_usd > 0). El capturador corre cada
--                   15 min sobre carteras ACTIVAS ⇒ la hora es la del primer guardado
--                   ±15 min; una posición añadida y borrada en menos de 15 min no cuenta.
--   activated       ACTIVACIÓN INICIAL = first_position dentro de los 7 días siguientes
--                   al registro. Registrarse por sí solo NO cuenta.
--   checkout        mapeo Stripe creado por /api/billing/checkout (billing_customers):
--                   el usuario llegó a abrir una sesión de pago. No prueba que pagara.
--   premium         Premium CONFIRMADO por el servidor: suscripción Stripe escrita por
--                   el webhook (subscriptions.provider = 'stripe', plan 'premium',
--                   status active/trialing) o, si ya caducó/canceló, un evento de
--                   suscripción APLICADO en billing_events. Nunca el retorno de Stripe.
--
-- QUÉ NO PUEDE MEDIR (no hay destino para esos eventos; ver docs/AURIX-LAUNCH-CONVERSION.md, SPEC 3):
--   visita, clic en CTA, primer análisis mostrado, paywall mostrado.
--
-- EXCLUSIÓN: las cuentas con override 'founder' o 'qa' (fundador y cuentas de prueba)
-- quedan fuera para no contaminar el embudo.
-- ============================================================================
with excluded as (
  select distinct user_id from public.entitlement_overrides where reason in ('founder', 'qa')
),
u as (
  select id as user_id, created_at
  from auth.users
  where created_at >= now() - interval '8 weeks'
    and id not in (select user_id from excluded)
),
fp as (
  select s.user_id, min(s.ts) as first_ts
  from public.portfolio_snapshots s
  join u on u.user_id = s.user_id
  where s.asset_count > 0 and s.total_value_usd > 0
  group by s.user_id
),
co as (
  select distinct c.user_id from public.billing_customers c join u on u.user_id = c.user_id
  where c.provider = 'stripe'
),
pr as (
  select s.user_id from public.subscriptions s join u on u.user_id = s.user_id
  where s.provider = 'stripe' and s.plan = 'premium' and s.status in ('active', 'trialing')
  union
  select e.user_id from public.billing_events e join u on u.user_id = e.user_id
  where e.provider = 'stripe' and e.applied and e.event_type like 'customer.subscription.%'
)
select
  date_trunc('week', u.created_at)::date                                          as cohort_week,
  count(*)                                                                        as registered,
  count(fp.user_id)                                                               as first_position,
  count(fp.user_id) filter (where fp.first_ts <= u.created_at + interval '7 days') as activated_7d,
  count(co.user_id)                                                               as checkout_opened,
  count(pr.user_id)                                                               as premium_confirmed
from u
left join fp on fp.user_id = u.user_id
left join co on co.user_id = u.user_id
left join (select distinct user_id from pr) pr on pr.user_id = u.user_id
group by 1
order by 1 desc;
