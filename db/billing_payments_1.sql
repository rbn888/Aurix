-- ============================================================================
-- AURIX-AFFILIATES-V1 · 2/3 · EVIDENCIA DE COBRO (Stripe → Aurix)
-- public.billing_payments · public.billing_refunds · public.billing_disputes
-- public.aurix_billing_record_payment_event(...)
-- ----------------------------------------------------------------------------
-- Apply: pegar el fichero ENTERO en el editor SQL y ejecutarlo de una vez.
--   *** NO APLICADO DESDE EL REPO ***
--   psql -v ON_ERROR_STOP=1 -f db/billing_payments_1.sql   (SIN `-1`)
-- Requiere M.04 aplicado (billing_customers, billing_prices, billing_events).
-- Orden: 2/3. Pareja: db/billing_payments_1_rollback.sql
--
-- QUÉ ES
--   M.04 dejaba fuera "refunds, disputes" a propósito: su escritor gobierna el
--   ACCESO, y el acceso no depende de un reembolso. Esto no cambia eso. Es un
--   REGISTRO de lo que Stripe dice que se cobró, se devolvió o se disputó, para
--   que Founder Platform pueda calcular comisiones de afiliado sobre dinero
--   REAL y descontar lo que se devuelve. No concede ni retira nada: no toca
--   `subscriptions`, ni `entitlement_overrides`, ni `aurix_billing_apply_event`.
--
-- LO QUE NO SE CONFÍA DEL PAYLOAD
--   · el USUARIO sale de `billing_customers` por el id de customer (igual que M.04);
--   · el PLAN y el INTERVALO salen de `billing_prices` por el id de precio. Un
--     precio desconocido deja plan/intervalo a null: el cobro se registra igual
--     (es un hecho), pero no cuenta como Premium;
--   · el IMPORTE sí es el del proveedor: es exactamente lo que se cobró.
--
-- TODO SE ENLAZA POR PAYMENT INTENT
--   Un reembolso o una disputa llegan sobre el cargo, no sobre la factura. Lo
--   común a los tres es el payment intent, así que esa es la clave de unión.
--
-- IDEMPOTENCIA (misma doctrina que aurix_billing_apply_event)
--   La inserción en `billing_events` (provider, event_id) ES el cerrojo, en la
--   MISMA transacción que la escritura. Sólo lo APLICADO es definitivo: un evento
--   repetido que ya se aplicó devuelve 'duplicate'; uno rechazado se reintenta.
--   Además cada escritura es idempotente por sí misma:
--     · billing_payments: una fila por factura; un segundo evento SÓLO rellena
--       huecos (coalesce), nunca reescribe un dato ya guardado;
--     · billing_refunds: Stripe da el importe reembolsado ACUMULADO, así que se
--       guarda el MÁXIMO visto: un evento viejo llegado tarde no lo baja;
--     · billing_disputes: sólo escribe un evento MÁS NUEVO que el último; empate
--       de segundo ⇒ manda el ciclo de vida (created < updated < closed).
--
-- FACTURA PAGADA SIN PAYMENT INTENT ('missing_link')
--   Si el importe es > 0 y no hay forma de saber su payment intent, la fila se
--   GUARDA (no se pierde el cobro) pero el evento queda NO aplicado y el webhook
--   contesta 500: Stripe reintenta y el reintento rellena el enlace. Sin enlace,
--   un reembolso posterior no se podría descontar. Una factura de 0 (prueba
--   gratuita, cupón del 100 %) no tiene cobro ni payment intent: se registra.
-- ============================================================================

begin;

-- ── 0. billing_events: nuevos resultados posibles ────────────────────────────
-- 'recorded' (evidencia guardada) y 'missing_link' (cobro sin payment intent,
-- reintentable). Se redefine el CHECK con el MISMO nombre: M.04 cuenta dos CHECK
-- en esta tabla y siguen siendo dos.
alter table public.billing_events drop constraint if exists billing_events_outcome_chk;
alter table public.billing_events add constraint billing_events_outcome_chk
  check (outcome in ('applied','duplicate','unknown_price','unknown_customer',
                     'ignored_type','stale','invalid_payload','unknown_status',
                     'missing_period','other_subscription','received',
                     'recorded','missing_link'));


-- ── 1. public.billing_payments — una fila por factura pagada ─────────────────
create table if not exists public.billing_payments (
  provider          text        not null,
  invoice_id        text        not null,
  user_id           uuid        references auth.users (id) on delete set null,
  customer_id       text,
  subscription_id   text,
  payment_intent_id text,
  price_id          text,
  plan              text,                    -- de billing_prices, nunca del payload
  billing_interval  text,                    -- de billing_prices, nunca del payload
  amount_paid_cents integer     not null,
  currency          text        not null,
  billing_reason    text,
  paid_at           timestamptz not null,
  livemode          boolean     not null,
  event_id          text        not null,
  recorded_at       timestamptz not null default now(),

  primary key (provider, invoice_id),
  constraint billing_payments_provider_chk check (provider in ('stripe','apple','manual')),
  constraint billing_payments_amount_chk   check (amount_paid_cents >= 0),
  constraint billing_payments_currency_chk check (currency ~ '^[A-Z]{3}$'),
  constraint billing_payments_handle_chk   check (length(invoice_id) between 3 and 255)
);

create index if not exists billing_payments_pi_idx   on public.billing_payments (provider, payment_intent_id);
create index if not exists billing_payments_user_idx on public.billing_payments (user_id, paid_at);


-- ── 2. public.billing_refunds — importe reembolsado ACUMULADO por payment intent
create table if not exists public.billing_refunds (
  provider              text        not null,
  payment_intent_id     text        not null,
  amount_refunded_cents integer     not null,
  currency              text        not null,
  last_event_at         timestamptz not null,
  last_event_id         text        not null,
  livemode              boolean     not null,

  primary key (provider, payment_intent_id),
  constraint billing_refunds_provider_chk check (provider in ('stripe','apple','manual')),
  constraint billing_refunds_amount_chk   check (amount_refunded_cents >= 0),
  constraint billing_refunds_currency_chk check (currency ~ '^[A-Z]{3}$')
);


-- ── 3. public.billing_disputes — último estado conocido de cada disputa ──────
create table if not exists public.billing_disputes (
  provider          text        not null,
  dispute_id        text        not null,
  payment_intent_id text,
  charge_id         text,
  status            text        not null,
  amount_cents      integer     not null,
  currency          text        not null,
  last_event_at     timestamptz not null,
  last_event_type   text        not null,
  last_event_id     text        not null,
  livemode          boolean     not null,

  primary key (provider, dispute_id),
  constraint billing_disputes_provider_chk check (provider in ('stripe','apple','manual')),
  constraint billing_disputes_amount_chk   check (amount_cents >= 0),
  constraint billing_disputes_currency_chk check (currency ~ '^[A-Z]{3}$'),
  constraint billing_disputes_status_chk   check (length(status) between 1 and 60)
);

create index if not exists billing_disputes_pi_idx on public.billing_disputes (provider, payment_intent_id);


-- ── 4. RLS: deny para el cliente, sin privilegios ────────────────────────────
alter table public.billing_payments enable row level security;
alter table public.billing_refunds  enable row level security;
alter table public.billing_disputes enable row level security;

drop policy if exists billing_payments_no_client on public.billing_payments;
create policy billing_payments_no_client on public.billing_payments
  as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists billing_refunds_no_client on public.billing_refunds;
create policy billing_refunds_no_client on public.billing_refunds
  as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists billing_disputes_no_client on public.billing_disputes;
create policy billing_disputes_no_client on public.billing_disputes
  as restrictive for all to anon, authenticated using (false) with check (false);

revoke all on public.billing_payments from anon, authenticated;
revoke all on public.billing_refunds  from anon, authenticated;
revoke all on public.billing_disputes from anon, authenticated;


-- ── 5. public.aurix_billing_record_payment_event() — service_role only ───────
-- Un solo escritor para los cinco tipos de evento de cobro. El webhook EXTRAE;
-- aquí se decide el usuario, el plan y si el evento ya se aplicó.
create or replace function public.aurix_billing_record_payment_event(
  p_provider          text,
  p_event_id          text,
  p_event_type        text,
  p_event_at          timestamptz,
  p_livemode          boolean,
  p_customer_id       text,
  p_invoice_id        text,
  p_subscription_id   text,
  p_payment_intent_id text,
  p_charge_id         text,
  p_price_id          text,
  p_amount            integer,
  p_currency          text,
  p_billing_reason    text,
  p_paid_at           timestamptz,
  p_dispute_id        text,
  p_status            text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ev       public.billing_events;
  v_user     uuid;
  v_price    public.billing_prices;
  v_at       timestamptz := coalesce(p_event_at, now());
  v_cur      text := upper(coalesce(p_currency, ''));
  v_live     boolean := coalesce(p_livemode, false);
  v_rank     int;
  v_rows     int;
begin
  if p_provider is null or p_event_id is null or p_event_type is null then
    return jsonb_build_object('ok', false, 'outcome', 'invalid_payload');
  end if;

  -- ── IDEMPOTENCIA PRIMERO: la inserción ES el cerrojo (misma transacción) ──
  insert into public.billing_events (provider, event_id, event_type, outcome, applied)
  values (p_provider, p_event_id, p_event_type, 'received', false)
  on conflict (provider, event_id) do nothing;

  if not found then
    select * into v_ev from public.billing_events be
     where be.provider = p_provider and be.event_id = p_event_id
       for update;
    if v_ev.applied then
      return jsonb_build_object('ok', true, 'outcome', 'duplicate');
    end if;
    -- rechazo previo (o enlace pendiente) ⇒ se REINTENTA
  end if;

  if p_event_type not in ('invoice.paid','charge.refunded','charge.dispute.created',
                          'charge.dispute.updated','charge.dispute.closed') then
    update public.billing_events set outcome = 'ignored_type', applied = false
     where provider = p_provider and event_id = p_event_id;
    return jsonb_build_object('ok', true, 'outcome', 'ignored_type');
  end if;

  if v_cur !~ '^[A-Z]{3}$' or p_amount is null or p_amount < 0 then
    update public.billing_events set outcome = 'invalid_payload', applied = false
     where provider = p_provider and event_id = p_event_id;
    return jsonb_build_object('ok', false, 'outcome', 'invalid_payload');
  end if;

  -- ── QUIÉN: por el customer del proveedor, vía nuestro mapeo ───────────────
  if p_customer_id is not null then
    select bc.user_id into v_user from public.billing_customers bc
     where bc.provider = p_provider and bc.provider_customer_id = p_customer_id;
  end if;

  -- ══ invoice.paid ══════════════════════════════════════════════════════════
  if p_event_type = 'invoice.paid' then
    if p_invoice_id is null then
      update public.billing_events set outcome = 'invalid_payload', applied = false
       where provider = p_provider and event_id = p_event_id;
      return jsonb_build_object('ok', false, 'outcome', 'invalid_payload');
    end if;

    -- QUÉ: del catálogo. Precio desconocido ⇒ plan/intervalo null (no Premium).
    if p_price_id is not null then
      select * into v_price from public.billing_prices bp
       where bp.provider = p_provider and bp.provider_price_id = p_price_id;
    end if;

    insert into public.billing_payments as bp (
      provider, invoice_id, user_id, customer_id, subscription_id, payment_intent_id,
      price_id, plan, billing_interval, amount_paid_cents, currency, billing_reason,
      paid_at, livemode, event_id
    ) values (
      p_provider, p_invoice_id, v_user, p_customer_id, p_subscription_id, p_payment_intent_id,
      p_price_id, v_price.plan, v_price.billing_interval, p_amount, v_cur, p_billing_reason,
      coalesce(p_paid_at, v_at), v_live, p_event_id
    )
    -- Un segundo evento de la MISMA factura sólo rellena huecos: nunca cambia un
    -- importe, una fecha o un enlace ya guardados.
    on conflict (provider, invoice_id) do update set
      payment_intent_id = coalesce(bp.payment_intent_id, excluded.payment_intent_id),
      user_id           = coalesce(bp.user_id,           excluded.user_id),
      subscription_id   = coalesce(bp.subscription_id,   excluded.subscription_id),
      price_id          = coalesce(bp.price_id,          excluded.price_id),
      plan              = coalesce(bp.plan,              excluded.plan),
      billing_interval  = coalesce(bp.billing_interval,  excluded.billing_interval);

    if p_payment_intent_id is null and p_amount > 0 then
      update public.billing_events
         set outcome = 'missing_link', applied = false, user_id = v_user
       where provider = p_provider and event_id = p_event_id;
      return jsonb_build_object('ok', false, 'outcome', 'missing_link');
    end if;

  -- ══ charge.refunded ═══════════════════════════════════════════════════════
  elsif p_event_type = 'charge.refunded' then
    if p_payment_intent_id is null then
      update public.billing_events set outcome = 'invalid_payload', applied = false, user_id = v_user
       where provider = p_provider and event_id = p_event_id;
      return jsonb_build_object('ok', false, 'outcome', 'invalid_payload');
    end if;

    -- ACUMULADO: se guarda el máximo, y la fecha más nueva. Desorden inocuo.
    insert into public.billing_refunds as r (
      provider, payment_intent_id, amount_refunded_cents, currency,
      last_event_at, last_event_id, livemode
    ) values (
      p_provider, p_payment_intent_id, p_amount, v_cur, v_at, p_event_id, v_live
    )
    on conflict (provider, payment_intent_id) do update set
      amount_refunded_cents = greatest(r.amount_refunded_cents, excluded.amount_refunded_cents),
      last_event_id = case when excluded.last_event_at >= r.last_event_at
                           then excluded.last_event_id else r.last_event_id end,
      last_event_at = greatest(r.last_event_at, excluded.last_event_at);

  -- ══ charge.dispute.* ══════════════════════════════════════════════════════
  else
    if p_dispute_id is null or coalesce(p_status, '') = '' then
      update public.billing_events set outcome = 'invalid_payload', applied = false, user_id = v_user
       where provider = p_provider and event_id = p_event_id;
      return jsonb_build_object('ok', false, 'outcome', 'invalid_payload');
    end if;

    v_rank := case p_event_type
                when 'charge.dispute.created' then 1
                when 'charge.dispute.updated' then 2
                when 'charge.dispute.closed'  then 3 end;

    -- SÓLO SI ES MÁS NUEVO. Un `updated` atrasado no puede reabrir una disputa
    -- cerrada. Empate de segundo ⇒ manda el ciclo de vida.
    insert into public.billing_disputes as d (
      provider, dispute_id, payment_intent_id, charge_id, status, amount_cents, currency,
      last_event_at, last_event_type, last_event_id, livemode
    ) values (
      p_provider, p_dispute_id, p_payment_intent_id, p_charge_id, left(p_status, 60), p_amount, v_cur,
      v_at, p_event_type, p_event_id, v_live
    )
    on conflict (provider, dispute_id) do update set
      payment_intent_id = coalesce(excluded.payment_intent_id, d.payment_intent_id),
      charge_id         = coalesce(excluded.charge_id, d.charge_id),
      status            = excluded.status,
      amount_cents      = excluded.amount_cents,
      currency          = excluded.currency,
      last_event_at     = excluded.last_event_at,
      last_event_type   = excluded.last_event_type,
      last_event_id     = excluded.last_event_id
    where excluded.last_event_at > d.last_event_at
       or (excluded.last_event_at = d.last_event_at
           and v_rank > (case d.last_event_type
                           when 'charge.dispute.created' then 1
                           when 'charge.dispute.updated' then 2
                           when 'charge.dispute.closed'  then 3 else 0 end));
    get diagnostics v_rows = row_count;

    if v_rows = 0 then
      update public.billing_events set outcome = 'stale', applied = false, user_id = v_user
       where provider = p_provider and event_id = p_event_id;
      return jsonb_build_object('ok', true, 'outcome', 'stale');
    end if;
  end if;

  update public.billing_events
     set outcome = 'recorded', applied = true, user_id = v_user
   where provider = p_provider and event_id = p_event_id;
  return jsonb_build_object('ok', true, 'outcome', 'recorded');
exception
  when others then
    -- Todo dentro de la misma transacción: un error deshace también la fila del
    -- ledger y el evento queda reintentable (500 ⇒ Stripe reintenta).
    raise;
end;
$$;

revoke all     on function public.aurix_billing_record_payment_event(text, text, text, timestamptz, boolean,
  text, text, text, text, text, text, integer, text, text, timestamptz, text, text) from public, anon, authenticated;
grant  execute on function public.aurix_billing_record_payment_event(text, text, text, timestamptz, boolean,
  text, text, text, text, text, text, integer, text, text, timestamptz, text, text) to service_role;


-- ── 6. VERIFICACIÓN — dentro de la transacción ───────────────────────────────
do $$
declare
  v_n  int;
  v_f  oid := to_regprocedure('public.aurix_billing_record_payment_event(text,text,text,timestamptz,'
                              'boolean,text,text,text,text,text,text,integer,text,text,timestamptz,text,text)')::oid;
begin
  if to_regclass('public.billing_payments') is null
     or to_regclass('public.billing_refunds') is null
     or to_regclass('public.billing_disputes') is null then
    raise exception 'PAYMENTS-1 APPLY FAIL: falta una tabla';
  end if;
  if v_f is null then
    raise exception 'PAYMENTS-1 APPLY FAIL: falta aurix_billing_record_payment_event/17';
  end if;

  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid = 'public.billing_payments'::regclass and contype = 'p')
     is distinct from 'PRIMARY KEY (provider, invoice_id)' then
    raise exception 'PAYMENTS-1 APPLY FAIL: billing_payments PK no es (provider, invoice_id)';
  end if;

  select count(*) into v_n from pg_constraint
   where conrelid = 'public.billing_events'::regclass and contype = 'c';
  if v_n <> 2 then
    raise exception 'PAYMENTS-1 APPLY FAIL: billing_events tiene % CHECK, se esperaban 2 (M.04)', v_n;
  end if;
  if position('recorded' in (select pg_get_constraintdef(oid) from pg_constraint
                              where conname = 'billing_events_outcome_chk'
                                and conrelid = 'public.billing_events'::regclass)) = 0 then
    raise exception 'PAYMENTS-1 APPLY FAIL: el ledger no admite el resultado recorded';
  end if;

  select count(*) into v_n from pg_class
   where oid in ('public.billing_payments'::regclass, 'public.billing_refunds'::regclass,
                 'public.billing_disputes'::regclass)
     and relrowsecurity;
  if v_n <> 3 then
    raise exception 'PAYMENTS-1 APPLY FAIL: RLS sólo en % de 3 tablas', v_n;
  end if;

  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('billing_payments', 'billing_refunds', 'billing_disputes')
     and grantee in ('anon', 'authenticated');
  if v_n <> 0 then
    raise exception 'PAYMENTS-1 APPLY FAIL: % privilegios de cliente', v_n;
  end if;

  if not (select prosecdef from pg_proc where oid = v_f)
     or (select coalesce(array_to_string(proconfig, ','), '') from pg_proc where oid = v_f)
        <> 'search_path=public, pg_temp' then
    raise exception 'PAYMENTS-1 APPLY FAIL: el escritor no es definer con search_path fijo';
  end if;
  if not has_function_privilege('service_role', v_f, 'execute')
     or has_function_privilege('anon', v_f, 'execute')
     or has_function_privilege('authenticated', v_f, 'execute') then
    raise exception 'PAYMENTS-1 APPLY FAIL: el escritor no es sólo de service_role';
  end if;

  raise notice 'PAYMENTS-1 APPLY VERIFIED — 3 tablas cerradas, escritor sólo service_role, ledger ampliado';
end $$;

commit;

-- ============================================================================
-- VERIFICACIÓN MANUAL (después del commit; como owner)
-- ============================================================================
-- (i) idempotencia: el mismo event_id dos veces ⇒ 'recorded' y luego 'duplicate'.
-- select public.aurix_billing_record_payment_event('stripe','evt_t1','invoice.paid', now(), false,
--   '<cus>','in_t1','sub_t1','pi_t1',null,'<price_id>', 799,'eur','subscription_create', now(), null, null);
-- (ii) disputa desordenada: closed(T2) y después updated(T1<T2) ⇒ 'stale', estado sigue 'lost'/'won'.
-- (limpiar después: delete de billing_payments/billing_disputes/billing_events con esos ids)
-- ============================================================================
