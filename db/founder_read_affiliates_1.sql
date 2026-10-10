-- ============================================================================
-- AURIX-AFFILIATES-V1 · 3/3 · LECTURA FOUNDER: public.founder_read_affiliates()
-- ----------------------------------------------------------------------------
-- Apply: pegar el fichero ENTERO en el editor SQL y ejecutarlo de una vez.
--   *** NO APLICADO DESDE EL REPO ***
--   psql -v ON_ERROR_STOP=1 -f db/founder_read_affiliates_1.sql   (SIN `-1`)
-- Requiere: db/affiliate_codes_1.sql, db/affiliate_attribution_1.sql y
-- db/billing_payments_1.sql (y M.04, y subscriptions/entitlement_overrides de B1).
-- Pareja: db/founder_read_affiliates_1_rollback.sql
--
-- QUÉ DEVUELVE (GET /api/read/affiliates · contrato aurix.read.v1)
--   La EVIDENCIA con la que Founder Platform calcula comisiones. Aurix no calcula
--   ninguna: aquí no hay porcentajes, ni afiliados, ni saldos.
--     · attributions: SÓLO usuarios con fila de atribución. userId, alta, captura,
--       emailHash (sha256 hex de lower(trim(email)): permite a Founder casar una
--       auto-referencia sin que el correo salga de Aurix) y los toques.
--     · payments: SÓLO cobros Premium (plan resuelto por billing_prices) de esos
--       usuarios.
--     · refunds / disputes: SÓLO los enlazados por payment intent a esos cobros.
--     · clicks: visitas por código y día (últimos 400 días). INDICADOR anónimo e
--       inflable: sirve para el embudo, NUNCA como evidencia de dinero.
--     · truncated: true si alguna lista llegó al tope de 5000 filas.
--
-- ESTA SUPERFICIE SÍ LLEVA DATOS POR USUARIO. Es deliberado y es la diferencia
-- con founder_read_overview/health (sólo agregados): una comisión se paga por
-- un cliente concreto. Lo que se minimiza: el correo viaja como hash, no hay
-- nombre, ni cartera, ni IP; y sólo aparecen usuarios que llegaron con código.
--
-- premiumBefore — "¿este usuario ya tenía Premium CONCEDIDO antes de ESTE
-- cobro?". Sólo cuenta evidencia de acceso realmente concedido; un primer pago
-- fallido (incomplete / incomplete_expired) o una suscripción nunca pagada NO:
--   (a) un cobro anterior PAGADO (otra factura, importe > 0, paid_at menor);
--   (b) un override de entitlement concedido (allowed) creado antes de paid_at;
--   (c) estar en `affiliate_premium_backfill`, sembrada AL APLICAR esta migración
--       con quien entonces tenía Premium (billing_payments empieza vacía, así que
--       sin esto un cliente antiguo parecería nuevo en su primera renovación).
-- Ya no se usa el ledger de eventos: no guarda el plan resultante, y un
-- `created` incomplete aplicado como Free contaba como "ya tenía".
--
-- registry — huella del registro de códigos recibido de Founder: la función
-- devuelve las filas vigentes en la forma del contrato y el handler calcula
-- `canonicalRegistry()` + sha256 (registry: {hash, count, updatedAt}).
--
-- SEGURIDAD: stable, SECURITY DEFINER, search_path fijo, sólo service_role.
-- No escribe nada.
-- ============================================================================

begin;

-- ── Premium histórico, sembrado UNA vez al aplicar ──────────────────────────
create table if not exists public.affiliate_premium_backfill (
  user_id   uuid        primary key references auth.users (id) on delete cascade,
  seeded_at timestamptz not null default now()
);
alter table public.affiliate_premium_backfill enable row level security;
drop policy if exists affiliate_premium_backfill_no_client on public.affiliate_premium_backfill;
create policy affiliate_premium_backfill_no_client on public.affiliate_premium_backfill
  as restrictive for all to anon, authenticated using (false) with check (false);
revoke all on public.affiliate_premium_backfill from anon, authenticated;

-- Predicado: `plan = 'premium'`. aurix_billing_apply_event sólo escribe ese plan
-- para active/trialing/past_due CON precio del catálogo (acceso concedido);
-- incomplete → Free/expired e incomplete_expired → expired. `canceled` NO cuenta:
-- el webhook fuerza 'canceled' en cualquier `subscription.deleted`, también el de
-- una suscripción incomplete que nunca se pagó, así que no prueba nada.
insert into public.affiliate_premium_backfill (user_id)
select s.user_id from public.subscriptions s where s.plan = 'premium'
on conflict (user_id) do nothing;

create or replace function public.founder_read_affiliates()
returns jsonb
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
  with lim as (select 5000 as n),
  att as (
    select a.user_id, a.touches, a.captured_at, u.created_at, u.email,
           row_number() over (order by a.captured_at, a.user_id) as rn
      from public.acquisition_attributions a
      join auth.users u on u.id = a.user_id
  ),
  pay as (
    select p.*,
           row_number() over (order by p.paid_at, p.invoice_id) as rn,
           (
             exists (select 1 from public.billing_payments e
                      where e.provider = p.provider and e.user_id = p.user_id
                        and e.invoice_id <> p.invoice_id
                        and e.amount_paid_cents > 0 and e.paid_at < p.paid_at)
             or exists (select 1 from public.entitlement_overrides o
                         where o.user_id = p.user_id and o.allowed
                           and o.created_at < p.paid_at)
             or exists (select 1 from public.affiliate_premium_backfill b
                         where b.user_id = p.user_id and b.seeded_at < p.paid_at)
           ) as premium_before
      from public.billing_payments p
     where p.plan = 'premium'
       and p.user_id in (select user_id from public.acquisition_attributions)
  ),
  pis as (
    select distinct provider, payment_intent_id from pay
     where rn <= (select n from lim) and payment_intent_id is not null
  ),
  ref as (
    select r.*, row_number() over (order by r.last_event_at, r.payment_intent_id) as rn
      from public.billing_refunds r
      join pis on pis.provider = r.provider and pis.payment_intent_id = r.payment_intent_id
  ),
  dis as (
    select d.*, row_number() over (order by d.last_event_at, d.dispute_id) as rn
      from public.billing_disputes d
      join pis on pis.provider = d.provider and pis.payment_intent_id = d.payment_intent_id
  ),
  clk as (
    select c.*, row_number() over (order by c.day, c.code) as rn
      from public.affiliate_clicks c
     where c.day >= (now() at time zone 'Europe/Madrid')::date - 400
  )
  select jsonb_build_object(
    'available', true,
    'attributions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'userId',       att.user_id,
               'registeredAt', att.created_at,
               'capturedAt',   att.captured_at,
               'emailHash',    case when nullif(trim(att.email), '') is null then null
                                    else encode(sha256(convert_to(lower(trim(att.email)), 'UTF8')), 'hex') end,
               'touches',      att.touches
             ) order by att.rn)
        from att where att.rn <= (select n from lim)), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'invoiceId',       pay.invoice_id,
               'userId',          pay.user_id,
               'subscriptionId',  pay.subscription_id,
               'paymentIntentId', pay.payment_intent_id,
               'amountCents',     pay.amount_paid_cents,
               'currency',        pay.currency,
               'plan',            pay.plan,
               'interval',        pay.billing_interval,
               'billingReason',   pay.billing_reason,
               'paidAt',          pay.paid_at,
               'livemode',        pay.livemode,
               'premiumBefore',   pay.premium_before
             ) order by pay.rn)
        from pay where pay.rn <= (select n from lim)), '[]'::jsonb),
    'refunds', coalesce((
      select jsonb_agg(jsonb_build_object(
               'paymentIntentId',     ref.payment_intent_id,
               'amountRefundedCents', ref.amount_refunded_cents,
               'currency',            ref.currency,
               'at',                  ref.last_event_at,
               'livemode',            ref.livemode
             ) order by ref.rn)
        from ref where ref.rn <= (select n from lim)), '[]'::jsonb),
    'disputes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'disputeId',       dis.dispute_id,
               'paymentIntentId', dis.payment_intent_id,
               'status',          dis.status,
               'amountCents',     dis.amount_cents,
               'currency',        dis.currency,
               'at',              dis.last_event_at,
               'livemode',        dis.livemode
             ) order by dis.rn)
        from dis where dis.rn <= (select n from lim)), '[]'::jsonb),
    'clicks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code',   clk.code,
               'day',    to_char(clk.day, 'YYYY-MM-DD'),
               'clicks', clk.clicks
             ) order by clk.rn)
        from clk where clk.rn <= (select n from lim)), '[]'::jsonb),
    'registry', jsonb_build_object(
      'codes',     public.aurix_affiliate_registry_rows(),
      'updatedAt', (select max(c.updated_at) from public.affiliate_codes c)),
    'truncated', (
         (select count(*) from att) > (select n from lim)
      or (select count(*) from pay) > (select n from lim)
      or (select count(*) from ref) > (select n from lim)
      or (select count(*) from dis) > (select n from lim)
      or (select count(*) from clk) > (select n from lim))
  );
$$;

comment on function public.founder_read_affiliates() is
  'AURIX-AFFILIATES-V1 — evidence for GET /api/read/affiliates (contract aurix.read.v1). Only attributed users; email as sha256 hash; premium payments + linked refunds/disputes; anonymous click counts (indicator, not money evidence). service_role only.';

revoke all     on function public.founder_read_affiliates() from public, anon, authenticated;
grant  execute on function public.founder_read_affiliates() to service_role;

do $$
declare
  v_f oid := to_regprocedure('public.founder_read_affiliates()')::oid;
begin
  if v_f is null then
    raise exception 'FOUNDER-READ-AFFILIATES APPLY FAIL: falta la función';
  end if;
  if not (select prosecdef from pg_proc where oid = v_f)
     or (select provolatile from pg_proc where oid = v_f) <> 's' then
    raise exception 'FOUNDER-READ-AFFILIATES APPLY FAIL: debe ser stable + security definer';
  end if;
  if has_function_privilege('anon', v_f, 'execute')
     or has_function_privilege('authenticated', v_f, 'execute')
     or not has_function_privilege('service_role', v_f, 'execute') then
    raise exception 'FOUNDER-READ-AFFILIATES APPLY FAIL: debe ser sólo de service_role';
  end if;
  -- Se ejecuta una vez: si alguna tabla o columna no existe, falla AQUÍ y no
  -- se confirma nada (una función SQL se valida al crearla, pero ejecutarla
  -- también prueba los permisos del owner sobre auth.users).
  perform public.founder_read_affiliates();
  raise notice 'FOUNDER-READ-AFFILIATES APPLY VERIFIED';
end $$;

commit;

-- ============================================================================
-- VERIFICACIÓN (después del commit):  select public.founder_read_affiliates();
-- ============================================================================
