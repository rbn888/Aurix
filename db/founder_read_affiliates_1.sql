-- ============================================================================
-- AURIX-AFFILIATES-V1 · 3/3 · LECTURA FOUNDER: public.founder_read_affiliates()
-- ----------------------------------------------------------------------------
-- Apply: pegar el fichero ENTERO en el editor SQL y ejecutarlo de una vez.
--   *** NO APLICADO DESDE EL REPO ***
--   psql -v ON_ERROR_STOP=1 -f db/founder_read_affiliates_1.sql   (SIN `-1`)
-- Requiere: db/affiliate_attribution_1.sql y db/billing_payments_1.sql (y M.04,
-- y entitlement_overrides de B1). Orden: 3/3.
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
-- premiumBefore — "¿este usuario ya tenía Premium antes de ESTE cobro?" Founder
-- lo usa para distinguir una conversión nueva de una renovación o una vuelta.
-- Es true si se cumple CUALQUIERA de estas tres:
--   (a) hay un cobro anterior (paid_at menor, otra factura) del mismo usuario
--       con importe > 0;
--   (b) hay un evento de suscripción APLICADO de ese usuario recibido más de
--       10 minutos antes de paid_at. El margen existe porque el `created` de la
--       PROPIA suscripción nueva llega casi a la vez que su primer cobro.
--       LIMITACIÓN DECLARADA: el ledger no guarda el plan resultante, así que un
--       intento anterior que se aplicó como Free (p. ej. `incomplete`, primer pago
--       fallido) también cuenta. El error es CONSERVADOR: marca como "ya tenía"
--       a alguien que no tenía, nunca al revés;
--   (c) hay un override de entitlement concedido (allowed) creado antes de
--       paid_at — cualquier clave: un comp, aunque sea de una función, es acceso
--       Premium regalado antes de pagar.
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
             or exists (select 1 from public.billing_events be
                         where be.user_id = p.user_id and be.applied
                           and be.outcome = 'applied'
                           and be.event_type like 'customer.subscription.%'
                           and be.received_at < p.paid_at - interval '10 minutes')
             or exists (select 1 from public.entitlement_overrides o
                         where o.user_id = p.user_id and o.allowed
                           and o.created_at < p.paid_at)
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
