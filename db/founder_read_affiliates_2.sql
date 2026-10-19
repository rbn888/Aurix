-- ============================================================================
-- AURIX-PARTNER-ENGINE-V2 · 2/2 · LECTURA FOUNDER v2: public.founder_read_affiliates()
-- ----------------------------------------------------------------------------
-- Apply: pegar el fichero ENTERO en el editor SQL y ejecutarlo de una vez.
--   *** NO APLICADO DESDE EL REPO ***
--   psql -v ON_ERROR_STOP=1 -f db/founder_read_affiliates_2.sql   (SIN `-1`)
-- Requiere: db/founder_read_affiliates_1.sql y db/billing_payment_breakdown_1.sql.
-- Orden: 2/2. Pareja: db/founder_read_affiliates_2_rollback.sql
--
-- QUÉ CAMBIA RESPECTO A v1 — SÓLO ESTO
--   Cada objeto de `payments` gana cuatro claves, del desglose que Stripe informó
--   (public.billing_payment_breakdowns, LEFT JOIN por (provider, invoice_id)):
--     · subtotalCents  — integer | null
--     · discountCents  — integer | null
--     · taxCents       — integer | null  (null si Stripe NO calculó impuesto)
--     · taxStatus      — 'computed' | 'not_computed' | null
--   Las cuatro son null cuando el cobro no tiene desglose (cobros anteriores a
--   V2, o un desglose rechazado): Founder lo trata como base NO certificable.
--   Aurix no calcula la base, ni el IVA, ni la comisión: publica lo que Stripe dijo.
--   Y una quinta, `paidBefore` (boolean): la cuenta ya había PAGADO Premium antes
--   de este cobro —otro cobro pagado (a) o el Premium histórico sembrado al
--   aplicar v1 (c)—. Es `premiumBefore` SIN la cláusula (b): un acceso gratuito
--   administrativo (entitlement_overrides), vigente, caducado o revocado, no
--   convierte a nadie en cliente pagador anterior. `premiumBefore` sigue
--   publicándose idéntico para el programa clásico.
--   Todo lo demás (filtros, premiumBefore, topes, registry, grants) es v1 byte a byte.
--
-- NO SE VUELVE A SEMBRAR affiliate_premium_backfill: v1 ya lo hizo al aplicarse,
-- y resembrar hoy metería como "Premium histórico" a quien se hizo Premium después.
--
-- SEGURIDAD: stable, SECURITY DEFINER, search_path fijo, sólo service_role.
-- No escribe nada.
-- ============================================================================

begin;

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
           ) as premium_before,
           -- V2: pagador anterior = (a) o (c). Un Premium gratuito no cuenta.
           (
             exists (select 1 from public.billing_payments e
                      where e.provider = p.provider and e.user_id = p.user_id
                        and e.invoice_id <> p.invoice_id
                        and e.amount_paid_cents > 0 and e.paid_at < p.paid_at)
             or exists (select 1 from public.affiliate_premium_backfill b
                         where b.user_id = p.user_id and b.seeded_at < p.paid_at)
           ) as paid_before,
           -- V2: desglose de Stripe, si existe (LEFT JOIN: un cobro sin desglose
           -- —anterior a V2— sale con las cuatro claves a null, nunca a 0).
           bd.subtotal_cents as bd_subtotal_cents,
           bd.discount_cents as bd_discount_cents,
           bd.tax_cents      as bd_tax_cents,
           bd.tax_status     as bd_tax_status
      from public.billing_payments p
      left join public.billing_payment_breakdowns bd
        on bd.provider = p.provider and bd.invoice_id = p.invoice_id
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
               'premiumBefore',   pay.premium_before,
               'paidBefore',      pay.paid_before,
               'subtotalCents',   pay.bd_subtotal_cents,
               'discountCents',   pay.bd_discount_cents,
               'taxCents',        pay.bd_tax_cents,
               'taxStatus',       pay.bd_tax_status
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
  'AURIX-AFFILIATES-V1 + PARTNER-ENGINE-V2 (payment breakdown) — evidence for GET /api/read/affiliates (contract aurix.read.v1). Only attributed users; email as sha256 hash; premium payments + linked refunds/disputes; anonymous click counts (indicator, not money evidence). service_role only.';

revoke all     on function public.founder_read_affiliates() from public, anon, authenticated;
grant  execute on function public.founder_read_affiliates() to service_role;

do $$
declare
  v_f oid := to_regprocedure('public.founder_read_affiliates()')::oid;
begin
  if to_regclass('public.billing_payment_breakdowns') is null then
    raise exception 'FOUNDER-READ-AFFILIATES-2 APPLY FAIL: falta billing_payment_breakdowns '
                    '(aplicar antes db/billing_payment_breakdown_1.sql)';
  end if;
  if v_f is null then
    raise exception 'FOUNDER-READ-AFFILIATES APPLY FAIL: falta la función';
  end if;
  if position('''taxStatus''' in pg_get_functiondef(v_f)) = 0 then
    raise exception 'FOUNDER-READ-AFFILIATES-2 APPLY FAIL: la función no publica el desglose';
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
  raise notice 'FOUNDER-READ-AFFILIATES-2 APPLY VERIFIED — cobros con desglose (taxStatus)';
end $$;

commit;

-- ============================================================================
-- VERIFICACIÓN (después del commit):
--   select jsonb_pretty(public.founder_read_affiliates() -> 'payments' -> 0);
--   ⇒ incluye subtotalCents, discountCents, taxCents, taxStatus.
-- ============================================================================
