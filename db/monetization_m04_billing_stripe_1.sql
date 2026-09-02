-- ============================================================================
-- AURIX-MONETIZATION-M04  ·  REAL BILLING (STRIPE / WEB)
-- ----------------------------------------------------------------------------
-- Apply: paste this whole file into the Supabase SQL editor for the project
-- referenced by SUPABASE_URL in config.js, then run.   *** NOT YET APPLIED ***
--
-- Idempotent + ADDITIVE. Creates three NEW tables and two functions. It does not
-- touch, drop, rename or migrate anything from B1/B2: `subscriptions`,
-- `entitlement_overrides`, `plan_features`, `aurix_commercial_state()` and
-- `aurix_entitlements()` are consumed exactly as they are. The resolver is NOT
-- modified — its status policy (premium ⇔ plan='premium' and status in
-- active/trialing and the period still running) is already the policy this block
-- needs, `past_due` included: it does not grant.
--
-- ----------------------------------------------------------------------------
-- WHAT THIS ADDS, AND WHY EACH PIECE EXISTS
-- ----------------------------------------------------------------------------
-- B1 prepared `subscriptions` for a provider and left `provider = 'none'`. This
-- is the block where a provider finally writes it. Three things were missing and
-- none of them can live in the webhook's JavaScript:
--
--   1. WHO IS THIS CUSTOMER (`billing_customers`). A Stripe customer exists
--      BEFORE any subscription does — it is created at checkout. `subscriptions`
--      is keyed by user_id and its premium CHECKs describe a *live* commercial
--      row, so it is the wrong place to park "this user is stripe customer X".
--      Keeping the mapping in its own table is also what makes the webhook
--      resolve the user from the PROVIDER's identifiers instead of from anything
--      the browser said. `wrong user` stops being expressible.
--
--   2. WHAT DOES THIS PRICE MEAN (`billing_prices`). The canonical price map.
--      A webhook that reads plan/interval/amount out of the event payload trusts
--      the payload; one that reads them out of this table trusts the product. An
--      unmapped price id resolves to NOTHING and the event is refused, so a
--      price created by mistake in the Stripe dashboard cannot grant Premium and
--      cannot invent a plan. It is also the ONE commercial source the paywall
--      renders from, so the price on screen and the price of record are the same
--      row (read-only for the client, no write path).
--
--   3. WAS THIS EVENT ALREADY APPLIED (`billing_events`). B1 already warned that
--      `subscriptions.last_event_id` is NOT idempotency: with one row per user, a
--      re-delivered event updating the same row to the same id conflicts with
--      nothing and applies twice. Real idempotency needs a ledger whose primary
--      key IS the provider event id, and the insert into it must be part of the
--      same transaction that writes the subscription. That is exactly what
--      `aurix_billing_apply_event()` below does.
--
-- ----------------------------------------------------------------------------
-- THE BOUNDARY (unchanged from B1/B2, extended to payments)
-- ----------------------------------------------------------------------------
-- The browser may START a checkout. It may never state its outcome. Nothing the
-- browser can produce — a success URL, a query param, localStorage, a client
-- callback, an email, a rendered screen — is accepted as proof of purchase. The
-- only writer of `subscriptions` is `aurix_billing_apply_event()`, callable only
-- by service_role, invoked only from the webhook endpoint AFTER the request has
-- been verified against Stripe's signing secret.
--
-- ----------------------------------------------------------------------------
-- OUT OF SCOPE OF THIS MIGRATION (declared, not forgotten)
-- ----------------------------------------------------------------------------
--   · Apple / IAP. Provider 'apple' is accepted by the CHECK constraints and by
--     the price map, and nothing else about it is built here: StoreKit
--     server-notifications have a different signature scheme, a different
--     idempotency key and MILLI-unit prices (see the writer trap noted in B1).
--     Mixing it into this block would make one review cover two threat models.
--     It is M.04B.
--   · Proration, upgrades between intervals, refunds, disputes, coupons, tax.
--     A price CHANGE arrives as `customer.subscription.updated`, which this
--     writer already handles by re-reading the price map, so an interval switch
--     converges without new code. What is NOT modelled is the accounting of it.
--   · Billing history / MRR aggregates. `billing_events` is an append-only
--     ledger, not a report.
-- ============================================================================


-- ============================================================================
-- 1. public.billing_customers — PROVIDER CUSTOMER ↔ AURIX USER
-- ============================================================================
-- The mapping the webhook resolves the user from. One row per (provider, user).
-- SENSITIVE: provider identifiers never reach the frontend, so — like
-- subscriptions — this table has zero client privileges and a restrictive deny.
create table if not exists public.billing_customers (
  provider             text        not null,
  user_id              uuid        not null
                                   references auth.users (id) on delete cascade,
  provider_customer_id text        not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  primary key (provider, user_id),
  constraint billing_customers_provider_chk
    check (provider in ('stripe','apple','manual')),
  -- A customer handle is opaque, but it is never empty and never a whole payload.
  constraint billing_customers_handle_chk
    check (length(provider_customer_id) between 3 and 255)
);

-- ONE provider customer can belong to ONE Aurix user. Without this, two accounts
-- could end up mapped to the same Stripe customer and a single payment would
-- entitle both — cross-user leakage through the mapping table rather than
-- through RLS.
create unique index if not exists billing_customers_handle_uidx
  on public.billing_customers (provider, provider_customer_id);

drop trigger if exists billing_customers_touch_updated_at on public.billing_customers;
create trigger billing_customers_touch_updated_at
  before update on public.billing_customers
  for each row execute function public.aurix_touch_updated_at();

alter table public.billing_customers enable row level security;

drop policy if exists billing_customers_no_client on public.billing_customers;
create policy billing_customers_no_client
  on public.billing_customers
  as restrictive
  for all
  to anon, authenticated
  using      (false)
  with check (false);

revoke all on public.billing_customers from anon, authenticated;


-- ============================================================================
-- 2. public.billing_prices — THE CANONICAL PRICE MAP (one commercial source)
-- ============================================================================
-- Product decision of M.04, and the ONLY place it is written down:
--
--     Aurix Premium · monthly    7,99 €/month
--     Aurix Premium · annual    59,99 €/year
--
-- The amounts live here as integers in the smallest currency unit, exactly as
-- the provider charges them, and the paywall RENDERS from here. That is the
-- point: a price shown to a user that does not exist in this table cannot be
-- charged, and a price charged that is not in this table cannot grant anything.
--
-- `trial_days` is per price and DEFAULTS TO 0. The 14-day trial is modelled and
-- verified compatible with Stripe (`subscription_data.trial_period_days`), and it
-- stays OFF until the founder sets it here — a trial is a commercial decision, so
-- turning it on must not require a deploy and must not happen as a side effect of
-- one. The checkout endpoint reads this column; nothing else decides it.
--
-- READABLE by authenticated on purpose: this is a public catalogue (what Premium
-- costs), it leaks nothing, and it is what stops the client bundle from carrying
-- a second, drifting copy of the prices. WRITES are impossible for the client:
-- no write policy and no write privilege.
create table if not exists public.billing_prices (
  provider          text        not null,
  provider_price_id text        not null,

  plan              text        not null,          -- must exist in plan_features
  billing_interval  text        not null,          -- month | year | lifetime
  amount_cents      integer     not null,
  currency          text        not null,          -- ISO-4217 UPPERCASE
  trial_days        integer     not null default 0,
  active            boolean     not null default true,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  primary key (provider, provider_price_id),

  constraint billing_prices_provider_chk
    check (provider in ('stripe','apple','manual')),
  -- Only a plan the feature matrix knows can be sold. A price for a plan that
  -- grants nothing is a way to take money for no capability.
  constraint billing_prices_plan_chk
    check (plan in ('premium')),
  constraint billing_prices_interval_chk
    check (billing_interval in ('month','year','lifetime')),
  -- A PAID price is strictly positive. A 0-amount row would sail into
  -- `subscriptions` and pass B1's premium_price_chk, laundering a comp as a sale;
  -- comps belong in entitlement_overrides.
  constraint billing_prices_amount_chk
    check (amount_cents > 0),
  -- UPPERCASE, because that is what subscriptions.price_currency demands. Stripe
  -- returns 'eur'; normalising HERE means the writer cannot forget to.
  constraint billing_prices_currency_chk
    check (currency ~ '^[A-Z]{3}$'),
  constraint billing_prices_trial_chk
    check (trial_days between 0 and 90),
  -- A price id is opaque but bounded.
  constraint billing_prices_handle_chk
    check (length(provider_price_id) between 3 and 255)
);

drop trigger if exists billing_prices_touch_updated_at on public.billing_prices;
create trigger billing_prices_touch_updated_at
  before update on public.billing_prices
  for each row execute function public.aurix_touch_updated_at();

-- ONE active price per (provider, plan, interval). Two active monthly prices is
-- not a catalogue, it is an ambiguity, and the paywall would have to pick one.
create unique index if not exists billing_prices_active_uidx
  on public.billing_prices (provider, plan, billing_interval)
  where active;

alter table public.billing_prices enable row level security;

drop policy if exists billing_prices_read_active on public.billing_prices;
create policy billing_prices_read_active
  on public.billing_prices
  for select
  to authenticated
  using (active);

revoke all    on public.billing_prices from anon, authenticated;
grant  select on public.billing_prices to   authenticated;

-- NO SEED. The provider price ids do not exist until the founder creates the two
-- products in Stripe, and inventing placeholder ids here would either fail
-- closed silently (best case) or map a real payment to a wrong plan (worst). The
-- INSERTs to run after creating them are at the bottom of this file, with the
-- amounts already filled in so only the two ids have to be pasted.


-- ============================================================================
-- 3. public.billing_events — IDEMPOTENCY LEDGER (append-only)
-- ============================================================================
-- The primary key IS the provider event id, which is what makes a re-delivery a
-- no-op instead of a second application. Stripe retries aggressively (and the
-- dashboard can resend by hand), so this is not a theoretical case.
--
-- Every event that reaches the writer is recorded, applied or not, with its
-- outcome. A refused event is evidence, not silence: `unknown_price`,
-- `unknown_customer`, `ignored_type` and `stale` are exactly the states someone
-- will need when a payment "did not work".
create table if not exists public.billing_events (
  provider    text        not null,
  event_id    text        not null,
  event_type  text        not null,

  user_id     uuid        references auth.users (id) on delete set null,
  outcome     text        not null,
  applied     boolean     not null default false,

  received_at timestamptz not null default now(),

  primary key (provider, event_id),
  constraint billing_events_provider_chk
    check (provider in ('stripe','apple','manual')),
  constraint billing_events_outcome_chk
    check (outcome in ('applied','duplicate','unknown_price','unknown_customer',
                       'ignored_type','stale','invalid_payload','unknown_status',
                       'missing_period','other_subscription','received'))
);

create index if not exists billing_events_user_idx
  on public.billing_events (user_id, received_at desc);

alter table public.billing_events enable row level security;

drop policy if exists billing_events_no_client on public.billing_events;
create policy billing_events_no_client
  on public.billing_events
  as restrictive
  for all
  to anon, authenticated
  using      (false)
  with check (false);

revoke all on public.billing_events from anon, authenticated;


-- ============================================================================
-- 4. public.aurix_billing_link_customer() — service_role only
-- ============================================================================
-- Called by the checkout endpoint once, when a user starts their first checkout.
-- Idempotent: re-running returns the existing handle instead of creating a
-- second customer, which is what stops a user from accumulating Stripe customers
-- (and, later, two concurrent subscriptions) by clicking twice.
--
-- Fail-closed on conflict: if the handle already belongs to ANOTHER user the
-- function raises instead of re-pointing it. Re-pointing would be exactly the
-- cross-user leak the unique index exists to prevent, and doing it silently in a
-- "helpful" upsert is how that leak would be introduced.
create or replace function public.aurix_billing_link_customer(
  p_user_id     uuid,
  p_provider    text,
  p_customer_id text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing text;
  v_owner    uuid;
begin
  if p_user_id is null or p_provider is null or p_customer_id is null then
    raise exception 'aurix_billing_link_customer: null argument';
  end if;

  select bc.provider_customer_id into v_existing
    from public.billing_customers bc
   where bc.provider = p_provider and bc.user_id = p_user_id;

  if v_existing is not null then
    return v_existing;                                  -- already linked: reuse
  end if;

  select bc.user_id into v_owner
    from public.billing_customers bc
   where bc.provider = p_provider and bc.provider_customer_id = p_customer_id;

  if v_owner is not null and v_owner <> p_user_id then
    raise exception 'aurix_billing_link_customer: customer already linked to another user';
  end if;

  insert into public.billing_customers (provider, user_id, provider_customer_id)
  values (p_provider, p_user_id, p_customer_id)
  on conflict (provider, user_id) do nothing;

  select bc.provider_customer_id into v_existing
    from public.billing_customers bc
   where bc.provider = p_provider and bc.user_id = p_user_id;

  return v_existing;
end;
$$;

revoke all     on function public.aurix_billing_link_customer(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.aurix_billing_link_customer(uuid, text, text) to   service_role;


-- ============================================================================
-- 5. public.aurix_billing_apply_event() — THE ONLY WRITER OF subscriptions
-- ============================================================================
-- One function, one transaction, one decision. The webhook endpoint verifies the
-- signature and EXTRACTS facts; it decides nothing. Everything that could grant
-- access is decided here, from the database's own tables:
--
--   · the USER comes from billing_customers, i.e. from the provider's customer
--     id. Never from a request body, a JWT, an email or a client hint.
--   · the PLAN, INTERVAL, AMOUNT and CURRENCY come from billing_prices, i.e.
--     from the product catalogue. Never from the event payload.
--   · IDEMPOTENCY comes from the insert into billing_events succeeding. If the
--     event id is already there, the function returns 'duplicate' and writes
--     nothing, in the same transaction, so a concurrent re-delivery cannot slip
--     between a check and a write.
--   · STALENESS: an event older than the row's `last_event_at` is refused. Stripe
--     does not guarantee delivery order, and applying an out-of-order
--     `subscription.updated` after a `deleted` would resurrect a cancelled
--     subscription.
--
-- The status arrives from the provider because it IS the provider's fact, and it
-- is whitelisted here against B1's CHECK set: an unknown status is not written as
-- something friendlier, the event is refused (`invalid_payload`). B2 then decides
-- what the status MEANS, and `past_due` already means "not premium" there. This
-- function does not interpret; it records.
create or replace function public.aurix_billing_apply_event(
  p_provider             text,
  p_event_id             text,
  p_event_type           text,
  p_customer_id          text,
  p_subscription_id      text,
  p_price_id             text,
  p_status               text,
  p_current_period_start timestamptz,
  p_current_period_end   timestamptz,
  p_cancel_at_period_end boolean,
  p_trial_start          timestamptz,
  p_trial_end            timestamptz,
  p_canceled_at          timestamptz,
  p_event_at             timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user      uuid;
  v_price     public.billing_prices;
  v_prev      public.subscriptions;
  v_ev        public.billing_events;
  v_plan      text;
  v_status    text;
  v_at        timestamptz := coalesce(p_event_at, now());
  v_outcome   text;
  v_inserted  boolean := false;
  v_prev_type text;
  v_rank      int;
  v_prev_rank int;
begin
  -- ORDEN DENTRO DEL MISMO SEGUNDO. `event.created` tiene resolucion de SEGUNDO,
  -- asi que dos eventos de la misma suscripcion pueden empatar y el orden de
  -- ENTREGA no esta garantizado. Con un `<` estricto, un `created` (status
  -- incomplete) entregado DESPUES de su `updated` (active) no era stale y
  -- degradaba a Free a quien acababa de pagar; y un `updated` tras el `deleted`
  -- del mismo segundo resucitaba una suscripcion cancelada. El rango desempata
  -- por la semantica del ciclo de vida, que si es un orden total.
  v_rank := case p_event_type
              when 'customer.subscription.created' then 1
              when 'customer.subscription.updated' then 2
              when 'customer.subscription.deleted' then 3
              else 0 end;
  if p_provider is null or p_event_id is null or p_event_type is null then
    return jsonb_build_object('ok', false, 'outcome', 'invalid_payload');
  end if;

  -- ── IDEMPOTENCY FIRST. The insert IS the lock. ────────────────────────────
  -- Y la idempotencia es sobre lo APLICADO, no sobre lo VISTO. La primera version
  -- trataba cualquier id ya presente como duplicado, y eso convertia un rechazo
  -- RECUPERABLE en perdida permanente: la suscripcion de un customer todavia sin
  -- mapear se registraba `unknown_customer`, se arreglaba el mapeo, se reenviaba
  -- el evento desde el dashboard --MISMO id-- y se descartaba como duplicado. Una
  -- compra cobrada que nunca concede. Ahora solo un evento APLICADO es definitivo;
  -- uno rechazado se reintenta, y el `for update` serializa dos reintentos
  -- concurrentes sobre la misma fila.
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
    -- rechazo previo => se REINTENTA con el catalogo/mapeo actuales
  end if;
  v_inserted := true;

  -- ── TIPOS QUE NO CAMBIAN ESTADO ───────────────────────────────────────────
  -- El webhook los manda con `p_status = 'ignored'` para que quede su rastro. Se
  -- resuelve ANTES de buscar el customer: si no, un `invoice.payment_failed` se
  -- registraba como `unknown_customer` y quedaba indistinguible de un incidente
  -- real de mapeo, que es justo el diagnostico que este ledger existe para dar.
  if p_status = 'ignored' then
    update public.billing_events
       set outcome = 'ignored_type', applied = false
     where provider = p_provider and event_id = p_event_id;
    return jsonb_build_object('ok', true, 'outcome', 'ignored_type');
  end if;

  -- ── WHO. From the provider's customer id, via our own mapping. ────────────
  if p_customer_id is not null then
    select bc.user_id into v_user
      from public.billing_customers bc
     where bc.provider = p_provider and bc.provider_customer_id = p_customer_id;
  end if;

  if v_user is null then
    update public.billing_events
       set outcome = 'unknown_customer', applied = false
     where provider = p_provider and event_id = p_event_id;
    return jsonb_build_object('ok', false, 'outcome', 'unknown_customer');
  end if;

  -- ── WHAT. From the price catalogue. An unmapped price grants nothing. ─────
  if p_price_id is not null then
    select * into v_price
      from public.billing_prices bp
     where bp.provider = p_provider and bp.provider_price_id = p_price_id;
  end if;

  -- ── STALENESS. Out-of-order delivery must not resurrect old state. ────────
  select * into v_prev from public.subscriptions s where s.user_id = v_user;
  if v_prev.user_id is not null and v_prev.last_event_id is not null then
    select be.event_type into v_prev_type
      from public.billing_events be
     where be.provider = v_prev.provider and be.event_id = v_prev.last_event_id;
    v_prev_rank := case v_prev_type
                     when 'customer.subscription.created' then 1
                     when 'customer.subscription.updated' then 2
                     when 'customer.subscription.deleted' then 3
                     else 0 end;
  end if;
  if v_prev.user_id is not null and v_prev.last_event_at is not null
     and (v_at < v_prev.last_event_at
          or (v_at = v_prev.last_event_at and v_prev_rank is not null
              and v_rank < v_prev_rank)) then
    update public.billing_events
       set outcome = 'stale', applied = false, user_id = v_user
     where provider = p_provider and event_id = p_event_id;
    return jsonb_build_object('ok', true, 'outcome', 'stale');
  end if;

  -- ── UNA CANCELACION SOLO CANCELA LO SUYO ─────────────────────────────────
  -- Un customer admite VARIAS suscripciones. Si el usuario termina con una
  -- duplicada y la cancela, el `deleted` de ESA no puede poner la cuenta en Free
  -- mientras la otra sigue viva y cobrandose. Se ignora cualquier evento de una
  -- suscripcion distinta de la que gobierna la fila, salvo que la fila no este
  -- premium vigente: ahi otra suscripcion puede tomar el relevo legitimamente.
  if v_prev.user_id is not null and v_prev.provider_subscription_id is not null
     and p_subscription_id is not null
     and p_subscription_id <> v_prev.provider_subscription_id
     and v_prev.plan = 'premium' and v_prev.status in ('active','trialing') then
    update public.billing_events
       set outcome = 'other_subscription', applied = false, user_id = v_user
     where provider = p_provider and event_id = p_event_id;
    return jsonb_build_object('ok', true, 'outcome', 'other_subscription');
  end if;

  -- ── STATUS whitelist (B1's CHECK set). Unknown ⇒ refuse the event. ────────
  v_status := lower(coalesce(p_status, ''));
  if v_status = 'incomplete_expired' then
    v_status := 'expired';                              -- Stripe's terminal name for a failed first payment
  elsif v_status = 'unpaid' then
    v_status := 'past_due';                             -- same commercial meaning for B2: no access, still a customer
  end if;

  if v_status = '' then
    update public.billing_events
       set outcome = 'invalid_payload', applied = false, user_id = v_user
     where provider = p_provider and event_id = p_event_id;
    return jsonb_build_object('ok', false, 'outcome', 'invalid_payload');
  end if;

  -- UN STATUS DESCONOCIDO DEGRADA; NO CONGELA. Rechazar el evento y salir dejaba
  -- la fila anterior intacta, asi que un `paused` --o cualquier status futuro que
  -- signifique "ya no se cobra"-- conservaba Premium hasta fin de periodo: un
  -- fail-open por congelacion. La doctrina de este subsistema es que una anomalia
  -- comercial puede DEGRADAR el acceso y nunca concederlo, asi que un status que
  -- no entendemos se trata como no vigente y queda dicho en el ledger.
  if v_status not in ('active','trialing','past_due','canceled','expired','incomplete') then
    v_outcome := 'unknown_status';
    v_plan    := 'free';
    v_status  := 'expired';
  end if;

  -- `incomplete` (first payment not settled) is NOT one of B1's five statuses,
  -- and it must not be written as something that could grant. It is a pre-paid
  -- state: the commercial row stays / becomes free.
  if v_plan = 'free' then
    null;                                       -- ya resuelto arriba (unknown_status)
  elsif v_status = 'incomplete' then
    v_plan   := 'free';
    v_status := 'expired';
  elsif v_status in ('canceled','expired') then
    v_plan   := 'free';
  elsif v_price.provider_price_id is null then
    -- Live status but no known price ⇒ we cannot state WHAT was bought. Refuse.
    update public.billing_events
       set outcome = 'unknown_price', applied = false, user_id = v_user
     where provider = p_provider and event_id = p_event_id;
    return jsonb_build_object('ok', false, 'outcome', 'unknown_price');
  else
    v_plan := v_price.plan;
    -- EL PERIODO ES OBLIGATORIO PARA CONCEDER, y este guard existe porque el CHECK
    -- de B1 (`subscriptions_premium_bound_chk`) lo hace ESTALLAR: la excepcion deja
    -- el ledger vacio por el rollback, devuelve 500 y Stripe reintenta el MISMO
    -- payload hasta agotarse -- cobrado, sin Premium y sin forense. Con el guard el
    -- rechazo queda registrado con su causa y es REINTENTABLE, asi que reenviar el
    -- evento una vez corregido el extractor si lo aplica.
    if v_status in ('active','trialing')
       and p_current_period_end is null
       and v_price.billing_interval is distinct from 'lifetime' then
      update public.billing_events
         set outcome = 'missing_period', applied = false, user_id = v_user
       where provider = p_provider and event_id = p_event_id;
      return jsonb_build_object('ok', false, 'outcome', 'missing_period');
    end if;
    -- Un trial sin fecha de fin es el mismo fail-open por la via del trial.
    if v_status = 'trialing' and p_trial_end is null then
      update public.billing_events
         set outcome = 'missing_period', applied = false, user_id = v_user
       where provider = p_provider and event_id = p_event_id;
      return jsonb_build_object('ok', false, 'outcome', 'missing_period');
    end if;
  end if;

  -- ── WRITE. One row per user (B1's model), canonical values only. ──────────
  insert into public.subscriptions as s (
    user_id, plan, status, provider, billing_interval,
    trial_start, trial_end, current_period_start, current_period_end,
    cancel_at_period_end, canceled_at,
    price_amount_cents, price_currency,
    provider_customer_id, provider_subscription_id,
    last_event_id, last_event_at
  ) values (
    v_user,
    v_plan,
    v_status,
    p_provider,
    case when v_plan = 'premium' then v_price.billing_interval else null end,
    p_trial_start, p_trial_end, p_current_period_start, p_current_period_end,
    coalesce(p_cancel_at_period_end, false), p_canceled_at,
    case when v_plan = 'premium' then v_price.amount_cents else null end,
    case when v_plan = 'premium' then upper(v_price.currency) else null end,
    p_customer_id, p_subscription_id,
    p_event_id, v_at
  )
  on conflict (user_id) do update set
    plan                     = excluded.plan,
    status                   = excluded.status,
    provider                 = excluded.provider,
    billing_interval         = excluded.billing_interval,
    trial_start              = excluded.trial_start,
    trial_end                = excluded.trial_end,
    current_period_start     = excluded.current_period_start,
    current_period_end       = excluded.current_period_end,
    cancel_at_period_end     = excluded.cancel_at_period_end,
    canceled_at              = excluded.canceled_at,
    price_amount_cents       = excluded.price_amount_cents,
    price_currency           = excluded.price_currency,
    provider_customer_id     = excluded.provider_customer_id,
    provider_subscription_id = coalesce(excluded.provider_subscription_id, s.provider_subscription_id),
    last_event_id            = excluded.last_event_id,
    last_event_at            = excluded.last_event_at
  -- Belt and braces on top of the ledger: even if this function were called
  -- twice with the same event id inside one transaction, the row would not be
  -- written twice.
  -- `last_event_id` NO lleva provider (la unicidad de B1 si: el indice es
  -- `(provider, last_event_id)`), asi que sin comparar el provider un id de Apple
  -- que coincidiera con el ultimo de Stripe se habria saltado la escritura y aun
  -- asi se habria marcado como aplicada. Hoy inalcanzable con un solo proveedor;
  -- alcanzable el dia de M.04B, que es cuando nadie lo estaria mirando.
  where s.last_event_id is null
     or s.provider is distinct from excluded.provider
     or s.last_event_id <> excluded.last_event_id;

  v_outcome := coalesce(v_outcome, 'applied');
  update public.billing_events
     set outcome = v_outcome, applied = true, user_id = v_user
   where provider = p_provider and event_id = p_event_id;

  return jsonb_build_object('ok', true, 'outcome', v_outcome,
                            'plan', v_plan, 'status', v_status);
exception
  when others then
    -- The ledger row is inside the same transaction, so a raise rolls it back
    -- too: the event stays UNAPPLIED and Stripe's retry can try again. Failing
    -- with the event recorded as applied would lose a real purchase.
    raise;
end;
$$;

revoke all     on function public.aurix_billing_apply_event(text, text, text, text, text, text, text,
  timestamptz, timestamptz, boolean, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant  execute on function public.aurix_billing_apply_event(text, text, text, text, text, text, text,
  timestamptz, timestamptz, boolean, timestamptz, timestamptz, timestamptz, timestamptz) to service_role;


-- ============================================================================
-- 6. AFTER CREATING THE TWO STRIPE PRICES — run these two INSERTs
-- ============================================================================
-- Replace ONLY the two price ids. The amounts are the product decision and are
-- already correct; do not "adjust" them here to match a dashboard typo — fix the
-- dashboard, because this table is the price of record.
--
-- insert into public.billing_prices
--   (provider, provider_price_id, plan, billing_interval, amount_cents, currency, trial_days, active)
-- values
--   ('stripe', 'price_XXXXXXXXXXXXMONTHLY', 'premium', 'month',  799, 'EUR', 0, true),
--   ('stripe', 'price_XXXXXXXXXXXXANNUAL',  'premium', 'year',  5999, 'EUR', 0, true)
-- on conflict (provider, provider_price_id) do update
--   set plan = excluded.plan, billing_interval = excluded.billing_interval,
--       amount_cents = excluded.amount_cents, currency = excluded.currency,
--       active = excluded.active;
--
-- To switch the 14-day trial ON later (commercial decision, no deploy needed):
-- update public.billing_prices set trial_days = 14
--  where provider = 'stripe' and plan = 'premium' and active;


-- ============================================================================
-- VERIFICATION — read-only queries to run after applying.
-- ============================================================================
-- -- 1. RLS on, and the client has no privileges on the two sensitive tables.
-- select tablename, rowsecurity from pg_tables
--  where schemaname = 'public'
--    and tablename in ('billing_customers','billing_prices','billing_events');
--
-- select table_name, grantee, privilege_type
--   from information_schema.role_table_grants
--  where table_schema = 'public'
--    and table_name in ('billing_customers','billing_prices','billing_events')
--    and grantee in ('anon','authenticated')
--  order by table_name, grantee;      -- expect ONLY billing_prices / SELECT
--
-- -- 2. The writer is service_role only.
-- select p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'execute')
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  cross join (select rolname from pg_roles
--               where rolname in ('anon','authenticated','service_role')) r
--  where n.nspname = 'public'
--    and p.proname in ('aurix_billing_apply_event','aurix_billing_link_customer')
--  order by p.proname, r.rolname;
--
-- -- 2b. LO QUE EL GATE NO PUEDE EJECUTAR (residual declarado). Postgres no corre
-- --     en el harness, así que estas cuatro garantías están argumentadas sobre el
-- --     texto de esta función y hay que DEMOSTRARLAS al aplicarla. Ejecutar como
-- --     owner, con un user_id real y una fila en billing_prices:
-- --
-- -- (i) IDEMPOTENCIA: el mismo event_id dos veces ⇒ la segunda 'duplicate'.
-- -- select public.aurix_billing_apply_event('stripe','evt_i1','customer.subscription.created',
-- --   '<cus>','sub_1','<price_id>','active', now(), now() + interval '1 year', false,
-- --   null, null, null, now());          -- expect outcome=applied
-- -- select public.aurix_billing_apply_event('stripe','evt_i1','customer.subscription.created',
-- --   '<cus>','sub_1','<price_id>','active', now(), now() + interval '1 year', false,
-- --   null, null, null, now());          -- expect outcome=duplicate, y una sola fila
-- --
-- -- (ii) UN RECHAZO ES REINTENTABLE: mismo id, primero sin mapeo, luego con él.
-- -- select public.aurix_billing_apply_event('stripe','evt_r1','customer.subscription.created',
-- --   'cus_sin_mapear','sub_2','<price_id>','active', now(), now() + interval '1 year',
-- --   false, null, null, null, now());   -- expect unknown_customer, applied=false
-- -- -- (crear el mapeo y repetir la MISMA llamada) → expect applied
-- --
-- -- (iii) PERIODO AUSENTE: no revienta el CHECK, se rechaza con causa.
-- -- select public.aurix_billing_apply_event('stripe','evt_p1','customer.subscription.created',
-- --   '<cus>','sub_3','<price_id>','active', now(), NULL, false, null, null, null, now());
-- --                                      -- expect missing_period, y CERO filas nuevas
-- --
-- -- (iv) EMPATE DE SEGUNDO: un `created` no puede pisar a un `updated` del mismo ts.
-- -- (aplicar updated con ts T, luego created con el MISMO T) → expect stale
-- --
-- -- 3. Negative test — the client cannot write its own subscription or price.
-- -- set local role authenticated;
-- -- set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
-- -- insert into public.billing_prices (provider, provider_price_id, plan,
-- --   billing_interval, amount_cents, currency)
-- --   values ('stripe','price_fake','premium','year',1,'EUR');   -- permission denied
-- -- select public.aurix_billing_apply_event('stripe','evt_fake','x',null,null,
-- --   null,'active',null,null,false,null,null,null,now());       -- permission denied
-- -- reset role;
-- ============================================================================
