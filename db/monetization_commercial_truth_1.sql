-- ============================================================================
-- AURIX-MONETIZATION-M02-B1  ·  COMMERCIAL TRUTH FOUNDATION
-- ----------------------------------------------------------------------------
-- Apply: paste this whole file into the Supabase SQL editor for the project
-- referenced by SUPABASE_URL in config.js, then run.   *** NOT YET APPLIED ***
--
-- Idempotent + ADDITIVE. It creates three NEW tables, one trigger function and
-- one read function. It NEVER touches user_portfolios, capital_flows,
-- portfolio_snapshots, holdings, category_history or performance_state, and it
-- does not drop, rename or migrate a single legacy column or row.
--
-- ----------------------------------------------------------------------------
-- WHY THIS EXISTS  (see docs/AURIX-MONETIZATION-M02-PHASE-A.md)
-- ----------------------------------------------------------------------------
-- Today the commercial tier lives in localStorage (`aurix_plan`) and in
-- `user_portfolios.subscription`. The second one LOOKS server-authoritative and
-- is not: `user_portfolios` is written by a full-row upsert from the client and
-- its RLS grants the user UPDATE on their own row, columns included. So the
-- user can persist their own tier to the server and propagate it to every one
-- of their devices. That is harmless while ENFORCE_ENTITLEMENTS = false and it
-- is a privilege-escalation the day enforcement is switched on.
--
-- THE RULE THIS FILE ENCODES:
--   The client may never be, and may never become, the source of truth of
--   Premium. Commercial state is written by service-role only.
--
-- WHY NEW TABLES AND NOT MORE COLUMNS ON user_portfolios:
--   A column cannot be made read-only inside a row the user legitimately
--   overwrites. Making `subscription` safe would mean breaking the portfolio
--   sync rail. Same reasoning already written down in portfolio_snapshots_1.sql
--   and capital_flows_1.sql, with the deliberate difference that here NO client
--   is ever a writer.
--
-- ----------------------------------------------------------------------------
-- WHAT IS OUT OF SCOPE OF THIS MIGRATION
-- ----------------------------------------------------------------------------
--   · No enforcement. ENFORCE_ENTITLEMENTS stays false; no UI changes.
--   · No entitlement resolver yet (that is B2).
--   · No Stripe, no Apple IAP, no checkout, no webhook, no price of record.
--     `provider` is a prepared field, not an integration.
--   · No backfill. Legacy client-controlled values are NOT imported: importing
--     them would launder self-granted tiers into real subscriptions.
--     ABSENCE OF A ROW IS THE CORRECT STATE FOR EVERY EXISTING USER (= free).
--
-- ----------------------------------------------------------------------------
-- RLS MODEL (the part that must not be got wrong)
-- ----------------------------------------------------------------------------
-- Three independent locks, because one is never enough:
--
--   1. PRIVILEGES. Supabase's default privileges grant ALL on new public tables
--      to anon and authenticated. Every table below REVOKEs them explicitly.
--      Privileges are checked BEFORE row security, so a future policy mistake
--      still cannot open a write path.
--   2. RLS enabled with NO permissive policy for anon/authenticated on the two
--      sensitive tables ⇒ default deny.
--   3. A RESTRICTIVE deny policy on those same tables. Permissive policies OR
--      together (so an accidental future "select_own" policy would open the
--      table), while restrictive policies AND with everything. This is what
--      makes the deny survive a future mistake.
--
-- `force row level security` is deliberately NOT used. FORCE only affects the
-- TABLE OWNER, which here is the administrator that seeds and repairs these
-- rows from the SQL editor; the threat model is the `authenticated` role, and
-- FORCE adds nothing against it. This matches portfolio_snapshots_1.sql, the
-- existing service-role-written table.
--
-- The client never reads these tables directly. It reads the SANITIZED
-- surface `public.aurix_commercial_state()` (bottom of this file), which
-- returns only its own row and never the provider identifiers.
-- ============================================================================


-- ── 0. shared helper: updated_at maintenance ────────────────────────────────
-- These tables are written by webhooks and by hand. A stale `updated_at` on
-- commercial state is not a cosmetic problem: it is what later decides event
-- ordering and staleness. Maintain it in the database, not in the writer.
create or replace function public.aurix_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ============================================================================
-- 1. public.subscriptions — BILLING / SUBSCRIPTION STATE
-- ============================================================================
-- One effective commercial row per user for V1 (hence user_id as the primary
-- key). Billing HISTORY, multiple concurrent subscriptions and provider event
-- logs are deliberately not modelled yet; when they are needed they arrive as
-- their own append-only table, not as extra rows here.
--
-- NAMING NOTES (deviations from the SPEC field list, both deliberate):
--   · `billing_interval`, not `interval`: INTERVAL is a Postgres type/keyword,
--     and a column with that name has to be quoted forever. Same semantics.
--   · `price_currency`, not `currency`: it pairs with price_amount_cents and
--     can never be confused with the user's DISPLAY currency, which is a
--     preference and lives in user_portfolios.
--
-- `plan` is `free | premium` only. There is NO `founder` plan: founder, comp
-- and QA access are not subscriptions and must not pollute billing truth or
-- MRR/ARR. They live in entitlement_overrides.
create table if not exists public.subscriptions (
  user_id                 uuid        not null primary key
                                      references auth.users (id) on delete cascade,

  plan                    text        not null default 'free',
  status                  text        not null default 'active',

  -- Prepared, NOT integrated. 'none' is the honest value until a provider writes here.
  provider                text        not null default 'none',
  billing_interval        text,                              -- month | year | lifetime | null

  trial_start             timestamptz,
  trial_end               timestamptz,
  current_period_start    timestamptz,
  current_period_end      timestamptz,

  cancel_at_period_end    boolean     not null default false,
  canceled_at             timestamptz,

  -- The CANONICAL amount actually charged. Never the price rendered by the UI.
  -- WRITER TRAPS for B9, both fail-closed but both worth knowing before you debug
  -- them: Stripe returns `currency` LOWERCASE ('eur') and currency_chk below
  -- demands ^[A-Z]{3}$, so a pass-through write is rejected on every paying row —
  -- upper() at the writer. And Apple's transaction price is in MILLI-units, not
  -- cents: a raw pass-through writes 10x into this column and passes every check.
  price_amount_cents      integer,
  price_currency          text,

  -- Opaque provider handles. SENSITIVE: never exposed to the frontend.
  provider_customer_id    text,
  provider_subscription_id text,

  -- Webhook idempotency (consumed in B9; recorded from day one so that the
  -- first webhook ever written already has somewhere to be idempotent against).
  last_event_id           text,
  last_event_at           timestamptz,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint subscriptions_plan_chk
    check (plan in ('free','premium')),
  constraint subscriptions_status_chk
    check (status in ('active','trialing','past_due','canceled','expired')),
  constraint subscriptions_provider_chk
    check (provider in ('none','stripe','apple','manual')),
  constraint subscriptions_interval_chk
    check (billing_interval is null or billing_interval in ('month','year','lifetime')),

  -- Coherence: a period/trial cannot end before it starts, and money cannot be
  -- negative or carry a currency that is not an ISO-4217 alpha code.
  constraint subscriptions_trial_order_chk
    check (trial_start is null or trial_end is null or trial_end >= trial_start),
  constraint subscriptions_period_order_chk
    check (current_period_start is null or current_period_end is null
           or current_period_end >= current_period_start),
  constraint subscriptions_price_chk
    check (price_amount_cents is null or price_amount_cents >= 0),
  constraint subscriptions_currency_chk
    check (price_currency is null or price_currency ~ '^[A-Z]{3}$'),
  constraint subscriptions_price_pair_chk
    check ((price_amount_cents is null) = (price_currency is null)),

  -- FAIL-CLOSED AGAINST PARTIAL WRITES. Everything above validates a field in
  -- isolation, and that is not enough: `(u,'premium','active','stripe','month')`
  -- with the period columns missing — a truncated webhook payload, a failed
  -- second statement, a hand repair — passes every check above and is
  -- BYTE-IDENTICAL to a legitimate lifetime purchase. Any natural resolver
  -- predicate (`current_period_end is null or current_period_end > now()`) then
  -- grants Premium forever, surviving cancellation and card failure. A partial
  -- row is Aurix's historical failure class, so the schema refuses it: a LIVE
  -- premium row must state WHEN IT ENDS, and 'lifetime' must be said explicitly.
  --
  -- `is not distinct from`, NOT `=`. This is where the first version of this
  -- constraint failed review: with billing_interval NULL, `billing_interval =
  -- 'lifetime'` is NULL, so the chain evaluated to
  --     false or false or NULL or false = NULL
  -- and Postgres ACCEPTS a CHECK that returns NULL. The most partial row of all
  -- — premium/active with no interval and no period, which is exactly what a
  -- `checkout.session.completed` payload or a hand repair produces — sailed
  -- through the guard written to stop it. `is not distinct from` is NULL-safe and
  -- returns false for NULL, so every disjunct here is total and the constraint
  -- can never abstain.
  constraint subscriptions_premium_bound_chk
    check (plan <> 'premium'
           or status not in ('active','trialing')
           or current_period_end is not null
           or billing_interval is not distinct from 'lifetime'),

  -- A trial that never says when it ends is the same fail-open in the trial path.
  constraint subscriptions_trialing_bound_chk
    check (status <> 'trialing' or trial_end is not null),

  -- MAKES "PAYING" DECIDABLE, which is what keeps contract point 10 (founder is
  -- not a paying customer) true INSIDE this table. `provider = 'manual'` is
  -- required by the SPEC and is legitimately needed for support repairs, but it
  -- would otherwise let a comp'd account sit here as an indistinguishable
  -- premium row, and price is nullable for real provider rows too — so
  -- `price is null` could not separate them. With this constraint every LIVE
  -- premium row carries its canonical amount, so:
  --     paying  ⇔  plan='premium' and status in ('active','trialing')
  --                and price_amount_cents > 0
  -- and a comp is an explicit 0. Founder/QA/comp still belong in
  -- entitlement_overrides and must NOT be written here at all.
  constraint subscriptions_premium_price_chk
    check (plan <> 'premium'
           or status not in ('active','trialing')
           or price_amount_cents is not null)
);

-- WHAT THESE TWO INDEXES DO AND DO NOT GUARANTEE — read before writing B9.
--   They guarantee: one provider event id cannot be recorded against two
--   DIFFERENT users, and one provider subscription cannot entitle two accounts.
--   They do NOT guarantee webhook idempotency. With one row per user, a
--   re-delivered event that updates the SAME row to the SAME last_event_id
--   conflicts with nothing and is applied twice. Real idempotency is the
--   WRITER's job: update ... where user_id = $1 and (last_event_id is null or
--   last_event_id <> $2). Recorded here from day one so that guard has a column
--   to compare against; a full provider-event log is B9/B11.
create unique index if not exists subscriptions_provider_event_uidx
  on public.subscriptions (provider, last_event_id)
  where last_event_id is not null;

create unique index if not exists subscriptions_provider_sub_uidx
  on public.subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;

drop trigger if exists subscriptions_touch_updated_at on public.subscriptions;
create trigger subscriptions_touch_updated_at
  before update on public.subscriptions
  for each row execute function public.aurix_touch_updated_at();

alter table public.subscriptions enable row level security;

-- Lock 3: restrictive deny. No permissive policy exists, so this table is
-- already closed; this policy is what keeps it closed if someone later adds one.
drop policy if exists subscriptions_no_client on public.subscriptions;
create policy subscriptions_no_client
  on public.subscriptions
  as restrictive
  for all
  to anon, authenticated
  using      (false)
  with check (false);

-- Lock 1: privileges. Undo Supabase's default GRANT ALL on new public tables.
revoke all on public.subscriptions from anon, authenticated;


-- ============================================================================
-- 2. public.entitlement_overrides — NON-COMMERCIAL EXCEPTIONS
-- ============================================================================
-- Founder access, comp accounts, QA and support grants. This table is what
-- keeps "the owner can see Premium" from being expressed as a fake paid
-- subscription. It holds NO payment information, and `source = override` is
-- what later lets business aggregates exclude it from MRR/ARR.
--
-- ONE representation covers both cases the SPEC asks for, with no extra
-- machinery: feature_key = '*' is a global grant over every premium feature,
-- anything else is a single-feature grant. `allowed` is present (and can be
-- false) so a revoked grant stays VISIBLE as a denial instead of vanishing.
-- Honest limit: unique (user_id, feature_key) makes this last-write-wins, so
-- setting allowed = false overwrites the reason/granted_by of the grant it
-- revokes. This is a CURRENT-STATE table, not a grant history; a full
-- grant/revoke log is B11 and is not pretended here.
create table if not exists public.entitlement_overrides (
  id           bigint      generated always as identity primary key,
  user_id      uuid        not null references auth.users (id) on delete cascade,

  -- '*' = every premium feature · otherwise a single feature key.
  feature_key  text        not null,
  allowed      boolean     not null default true,

  reason       text        not null,                   -- founder | comp | qa | support
  granted_by   text,                                   -- who granted it (audit)

  starts_at    timestamptz not null default now(),
  expires_at   timestamptz,                            -- null = no expiry

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint entitlement_overrides_user_feature_uniq unique (user_id, feature_key),
  constraint entitlement_overrides_key_chk
    check (feature_key = '*' or feature_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  constraint entitlement_overrides_reason_chk
    check (reason in ('founder','comp','qa','support')),
  constraint entitlement_overrides_window_chk
    check (expires_at is null or expires_at > starts_at)
);

drop trigger if exists entitlement_overrides_touch_updated_at on public.entitlement_overrides;
create trigger entitlement_overrides_touch_updated_at
  before update on public.entitlement_overrides
  for each row execute function public.aurix_touch_updated_at();

alter table public.entitlement_overrides enable row level security;

-- ZERO client access, read included. The client has no legitimate reason to
-- enumerate its own grants: what it will consume in B2 is the RESOLVED
-- entitlement set, not the reason it was granted.
drop policy if exists entitlement_overrides_no_client on public.entitlement_overrides;
create policy entitlement_overrides_no_client
  on public.entitlement_overrides
  as restrictive
  for all
  to anon, authenticated
  using      (false)
  with check (false);

revoke all on public.entitlement_overrides from anon, authenticated;


-- ============================================================================
-- 3. public.plan_features — WHAT A PLAN INCLUDES (server-side, versioned here)
-- ============================================================================
-- The map plan → feature. Today the equivalent map lives in the client bundle
-- (PLAN_FEATURES / PREMIUM_FEATURES), which means the shipped JavaScript
-- decides what a plan includes. From B2 on, this table decides.
--
-- V1 keys, and ONLY these three. Each one is a capability that something in the
-- product actually gates today:
--   workspace.loan       → the loan simulator (declared PREMIUM in M.01B)
--   intelligence.full    → full Intelligence (vs the INT.PREVIEW.V1 preview)
--   premium.settings     → membership / plan management in Settings
--
-- Deliberately NOT keys: workspace.compound (Compound is FREE behaviour),
-- intelligence.preview (the preview is the fail-closed fallback, not a right),
-- workspace.access and workspace.templates (not decided / nothing to gate yet).
-- A key is a capability someone must be GRANTED. Free defaults never get one.
create table if not exists public.plan_features (
  plan         text        not null,
  feature_key  text        not null,
  allowed      boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  primary key (plan, feature_key),
  constraint plan_features_plan_chk
    check (plan in ('free','premium')),
  -- Format, not an allowlist: a new capability must not require a constraint
  -- migration. The exact V1 key SET is asserted by the harness, which is where
  -- that contract belongs.
  constraint plan_features_key_chk
    check (feature_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),

  -- BLAST-RADIUS FLOOR. This is the one table where a SINGLE row changes what
  -- the entire user base can do, and the row that does the most damage is
  -- ('free', <any premium key>, true) — one INSERT hands a paid capability to
  -- every Free user, and the seed's `on conflict do update` would never correct
  -- it because a future key is not in the seed list. RLS cannot defend this
  -- (the realistic actor is an admin or service-role mistake, and service_role
  -- bypasses RLS by design), so the guarantee has to be a constraint: a free
  -- row can only ever DENY. Granting a capability to Free means removing its
  -- key, not flipping this flag.
  constraint plan_features_free_denies_chk
    check (plan <> 'free' or allowed = false)
);

drop trigger if exists plan_features_touch_updated_at on public.plan_features;
create trigger plan_features_touch_updated_at
  before update on public.plan_features
  for each row execute function public.aurix_touch_updated_at();

-- Seed. Rows are explicit on BOTH sides (free = false, premium = true) so the
-- map is inspectable and a missing row is unambiguously a bug rather than an
-- intentional deny. The resolver in B2 still treats absence as false.
-- Re-running this file re-asserts the intended values.
insert into public.plan_features (plan, feature_key, allowed) values
  ('free',    'workspace.loan',    false),
  ('free',    'intelligence.full', false),
  ('free',    'premium.settings',  false),
  ('premium', 'workspace.loan',    true),
  ('premium', 'intelligence.full', true),
  ('premium', 'premium.settings',  true)
on conflict (plan, feature_key) do update
  set allowed = excluded.allowed;

alter table public.plan_features enable row level security;

-- This one is a public capability catalogue, not user data: reading it leaks
-- nothing. Read is allowed so a future client can render "what Premium
-- includes" from one source instead of a hardcoded copy. Writes are impossible
-- for the client: no write policy AND no write privilege.
drop policy if exists plan_features_read_all on public.plan_features;
create policy plan_features_read_all
  on public.plan_features
  for select
  to authenticated
  using (true);

revoke all    on public.plan_features from anon, authenticated;
grant  select on public.plan_features to   authenticated;


-- ============================================================================
-- 4. public.aurix_commercial_state() — THE SANITIZED READ SURFACE
-- ============================================================================
-- The frontend never reads public.subscriptions. It reads this.
--
-- WHY: an own-row SELECT policy on subscriptions would be "safe" for writes and
-- still hand the browser provider_customer_id, provider_subscription_id,
-- last_event_id and the canonical price. Those are billing-system identifiers;
-- shipping them to a client is a leak we would have to walk back later. So the
-- read surface is a projection, and the sensitive columns have no client path
-- at all. (This is the same pattern as public.validate_invite_code(text) in
-- db/supabase_rls.sql: table closed, narrow SECURITY DEFINER surface open.)
--
-- ZERO ROWS = no commercial subscription = Free. That is the fail-closed
-- reading: absence, error and unauthenticated all resolve to "no Premium".
-- This function does NOT resolve entitlements — it does not look at
-- entitlement_overrides or plan_features. Combining the three is B2's job, and
-- keeping it out of here is what stops the client from doing that arithmetic.
-- Dropped first on purpose: CREATE OR REPLACE cannot change a function's return
-- type, so re-applying this file after B2 widens the projection would fail with
-- "cannot change return type of existing function". The grants below are
-- re-issued in the same transaction, so nothing is left ungranted.
drop function if exists public.aurix_commercial_state();

create function public.aurix_commercial_state()
returns table (
  plan                 text,
  status               text,
  provider             text,
  billing_interval     text,
  trial_end            timestamptz,
  current_period_end   timestamptz,
  cancel_at_period_end boolean,
  updated_at           timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.plan,
         s.status,
         s.provider,
         s.billing_interval,
         s.trial_end,
         s.current_period_end,
         s.cancel_at_period_end,
         s.updated_at
    from public.subscriptions s
   where s.user_id = auth.uid()
   limit 1;
$$;

-- `from public` alone is NOT enough: Supabase's default privileges grant EXECUTE
-- on new functions to anon and authenticated as NAMED roles, and a revoke from
-- the PUBLIC pseudo-role does not remove a role-specific grant. anon calling
-- this today would only get 0 rows (auth.uid() is null), which is harmless and
-- would stop being harmless the moment B2 widens the projection. Named roles are
-- revoked explicitly so the documented "anon: nothing" is actually true.
revoke all     on function public.aurix_commercial_state() from public, anon, authenticated;
grant  execute on function public.aurix_commercial_state() to   authenticated;

-- The trigger helper is called BY the triggers, never by a client. Postgres runs
-- trigger functions regardless of the invoker's EXECUTE privilege, so revoking
-- it costs nothing and removes a pointless client-callable surface.
revoke all on function public.aurix_touch_updated_at() from public, anon, authenticated;


-- ============================================================================
-- VERIFICATION — run these read-only queries after applying the migration.
-- ============================================================================
-- -- 1. RLS is on for all three tables
-- select tablename, rowsecurity
--   from pg_tables
--  where schemaname = 'public'
--    and tablename in ('subscriptions','entitlement_overrides','plan_features')
--  order by tablename;
--
-- -- 2. Policies: expect exactly one RESTRICTIVE deny-all on subscriptions and
-- --    entitlement_overrides, and one permissive SELECT on plan_features.
-- select tablename, policyname, permissive, cmd, roles, qual, with_check
--   from pg_policies
--  where schemaname = 'public'
--    and tablename in ('subscriptions','entitlement_overrides','plan_features')
--  order by tablename, policyname;
--
-- -- 3. Privileges: expect ZERO rows for subscriptions / entitlement_overrides,
-- --    and only SELECT for authenticated on plan_features.
-- select table_name, grantee, privilege_type
--   from information_schema.role_table_grants
--  where table_schema = 'public'
--    and table_name in ('subscriptions','entitlement_overrides','plan_features')
--    and grantee in ('anon','authenticated')
--  order by table_name, grantee, privilege_type;
--
-- -- 3b. Function ACLs: expect NO row for anon on either function, and
-- --     EXECUTE for authenticated on aurix_commercial_state only.
-- select p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'execute') as can_execute
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--  cross join (select rolname from pg_roles where rolname in ('anon','authenticated')) r
--  where n.nspname = 'public'
--    and p.proname in ('aurix_commercial_state','aurix_touch_updated_at')
--  order by p.proname, r.rolname;
--
-- -- 3c. DB-vs-FILE DIVERGENCE (declared residual). `create table if not exists`
-- --     silently NO-OPs on re-run, so a column or constraint added to this file
-- --     later will NOT reach a database that already has the table. Dump the real
-- --     shape and compare it against this file by eye after every re-apply:
-- select table_name, column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name in ('subscriptions','entitlement_overrides','plan_features')
--  order by table_name, ordinal_position;
--
-- select rel.relname as table_name, con.conname, pg_get_constraintdef(con.oid) as definition
--   from pg_constraint con
--   join pg_class rel on rel.oid = con.conrelid
--   join pg_namespace n on n.oid = rel.relnamespace
--  where n.nspname = 'public'
--    and rel.relname in ('subscriptions','entitlement_overrides','plan_features')
--  order by rel.relname, con.conname;
--
-- -- 4. Seed: expect 6 rows, 3 false (free) + 3 true (premium).
-- select plan, feature_key, allowed from public.plan_features order by plan, feature_key;
--
-- -- 5. Negative test — self-upgrade must FAIL, not return 0 rows.
-- --    Run as the authenticated role with a real uid:
-- -- set local role authenticated;
-- -- set local request.jwt.claims = '{"sub":"<a-real-user-uuid>","role":"authenticated"}';
-- -- insert into public.subscriptions (user_id, plan, status)
-- --   values (auth.uid(), 'premium', 'active');          -- expect: permission denied
-- -- update public.subscriptions set plan = 'premium';    -- expect: permission denied
-- -- insert into public.entitlement_overrides (user_id, feature_key, reason)
-- --   values (auth.uid(), '*', 'founder');               -- expect: permission denied
-- -- reset role;
-- --
-- -- -- 6. Fail-closed constraints (run as the owner; expect each to be REJECTED):
-- -- insert into public.subscriptions (user_id, plan, status, provider, billing_interval,
-- --   price_amount_cents, price_currency)
-- --   values ('<uuid>', 'premium', 'active', 'stripe', 'month', 1499, 'EUR');
-- --                                        -- expect: subscriptions_premium_bound_chk
-- -- -- The NULL-interval variant is the one that used to slip through. It must be
-- -- -- rejected too; if it is accepted, the 3VL fix did not reach the instance:
-- -- insert into public.subscriptions (user_id, plan, status, provider,
-- --   price_amount_cents, price_currency)
-- --   values ('<uuid>', 'premium', 'active', 'manual', 0, 'EUR');
-- --                                        -- expect: subscriptions_premium_bound_chk
-- -- insert into public.plan_features (plan, feature_key, allowed)
-- --   values ('free', 'workspace.templates', true);
-- --                                        -- expect: plan_features_free_denies_chk
-- -- update public.plan_features set allowed = true;      -- expect: permission denied
-- -- select * from public.aurix_commercial_state();       -- expect: 0 rows (no subscription)
-- -- reset role;
-- ============================================================================
