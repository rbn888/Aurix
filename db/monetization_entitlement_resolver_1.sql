-- ============================================================================
-- AURIX-MONETIZATION-M02-B2  ·  SERVER ENTITLEMENT RESOLVER
-- ----------------------------------------------------------------------------
-- Apply: paste into the Supabase SQL editor, or
--   supabase db query --linked -f db/monetization_entitlement_resolver_1.sql
-- Idempotent + ADDITIVE. Creates ONE function. Touches no table, no column, no
-- row, no policy, no privilege of B1. Does not modify aurix_commercial_state().
--
-- ----------------------------------------------------------------------------
-- WHAT THIS IS
-- ----------------------------------------------------------------------------
-- B1 made commercial truth server-authoritative. B1 does not DECIDE anything:
-- `aurix_commercial_state()` reports facts (plan, status, period), and deciding
-- what those facts mean was still nobody's job. This function is that job, and
-- it is the ONLY place where the question "what may this user use?" is answered.
--
--   subscriptions  →  plan_features  →  entitlement_overrides  →  effective set
--
-- THE BOUNDARY THIS ENCODES:
--   The client may ASK "what may I use?". It may never DECIDE "I am Premium".
--   The answer is derived here, from commercial truth, on the server.
--
-- ── `features` IS THE ONLY AUTHORITY FOR ACCESS. `plan` IS NEVER A GATE. ────
--   These two fields can legitimately disagree, and a consumer must know which
--   one to obey. `plan` is a COMMERCIAL FACT (does this account pay?) and it is
--   deliberately preserved even when access is revoked — a '*' deny for abuse
--   leaves plan='premium' because the customer really is still paying, and MRR
--   must not lie. `features` is the DECISION.
--   The dangerous direction is the other one: if plan_features were ever empty or
--   unreadable, this function would still report plan='premium' with an EMPTY
--   feature map. A consumer written as `if (ent.plan === 'premium')` — the natural
--   migration from today's boolean `hasAurixPremiumAccess` — would then grant
--   everything during a catalogue outage, which is the exact fail-open this block
--   exists to prevent.
--   So, for B3 and everything after: gate on `features[key] === true`. Never on
--   `plan`. Certified as scenario S24.
--
-- NOT authority, and deliberately not read by this function: localStorage
-- (`aurix_plan`), `user_portfolios.subscription`, the hardcoded owner email in
-- `hasAurixPremiumAccess`, `PLAN_FEATURES`/`PREMIUM_FEATURES` in the bundle,
-- `PROMO_CODES`, `premiumTier`, query params, browser flags, any cached client
-- state. They all still exist for compatibility and none of them grants a right.
-- Retiring them is B3/B4; this function is what makes that retirement possible.
--
-- ----------------------------------------------------------------------------
-- FAIL-CLOSED, WITHOUT EXCEPTION
-- ----------------------------------------------------------------------------
-- The function ALWAYS returns exactly one row. "No answer" must never be
-- confusable with "Premium", so there is no zero-row case to misread: absence of
-- a subscription, an unauthenticated caller, an unrecognised plan or status, an
-- expired period, a stale trial, a malformed override, an empty plan_features —
-- every one of them resolves to plan='free' with the feature denied.
--
-- A commercial outage may therefore DEGRADE access. It can never grant it.
--
-- ----------------------------------------------------------------------------
-- PRECEDENCE (fixed, and the order matters)
-- ----------------------------------------------------------------------------
--   1. canonical subscription      → is there a VALID premium entitlement?
--   2. plan feature matrix         → what does that plan include?
--   3. applicable override         → global '*' first, then the specific key
--   4. sanitized effective result  → what the client receives
--
-- Step 3 is NOT symmetric, and the asymmetry is deliberate — every tie resolves
-- towards LESS access:
--   · A DENY global ('*', allowed=false) is ABSOLUTE. It short-circuits and the
--     per-feature overrides are not even consulted, because the only reason the
--     global denial exists is support cutting off abuse, and a stale per-feature
--     grant must not survive it.
--   · An ALLOW global is REFINABLE: '*' allow plus a `workspace.loan` deny denies
--     exactly that one feature. Here specificity does win.
-- An override with allowed=false DENIES a feature the plan includes; one with
-- allowed=true GRANTS one the plan does not. Both directions are required: one is
-- founder/comp access, the other is abuse and refund handling.
--
-- Overrides outside their [starts_at, expires_at) window have NO effect in
-- either direction — an expired grant does not grant, and an expired denial does
-- not deny. And an override naming a feature that is not in plan_features is
-- IGNORED: a right must exist in the catalogue before it can be granted, so an
-- override can never invent a capability.
--
-- ----------------------------------------------------------------------------
-- FOUNDER IS NOT A PLAN
-- ----------------------------------------------------------------------------
-- A founder / comp / QA account gets `feature_sources = 'override'` while `plan`
-- stays 'free' and `source` stays 'default'. That is the whole point: the account
-- can use everything and still never appears as a paying subscriber, so MRR/ARR,
-- Premium counts and conversion stay clean. This is also what will let Founder
-- Preview (B4) show every tool with its REAL commercial status without turning
-- the founder into a customer or changing what a normal user sees.
-- ============================================================================

-- Dropped first: CREATE OR REPLACE cannot change a return type, and B3 may well
-- widen this projection. Grants are re-issued below in the same transaction.
drop function if exists public.aurix_entitlements();

create function public.aurix_entitlements()
returns table (
  plan                text,          -- effective COMMERCIAL plan: free | premium
  subscription_status text,          -- sanitized: none | <known status> | unrecognized
  features            jsonb,         -- feature_key -> boolean. Every canonical key, always present.
  feature_sources     jsonb,         -- feature_key -> plan | override | default   (answers "why")
  source              text,          -- how PLAN was decided: subscription | default
  valid_until         timestamptz    -- when the premium entitlement lapses. null = no bound / not premium
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := auth.uid();
  v_sub        public.subscriptions;
  v_plan       text    := 'free';
  v_status     text    := 'none';
  v_source     text    := 'default';
  v_until      timestamptz := null;
  v_features   jsonb   := '{}'::jsonb;
  v_sources    jsonb   := '{}'::jsonb;
  v_key        text;
  v_allowed    boolean;
  v_star       boolean;
  v_star_found boolean := false;
  r            record;
begin
  -- ── 1. canonical subscription ─────────────────────────────────────────────
  -- No session ⇒ no uid ⇒ no row ⇒ Free. Never an error, never Premium.
  if v_uid is not null then
    select * into v_sub from public.subscriptions s where s.user_id = v_uid;
  end if;

  if v_sub.user_id is not null then
    -- Sanitize the status BEFORE trusting it. The CHECK constraints in B1 make
    -- an unknown value unreachable today; this function still refuses to assume
    -- that, because fail-closed that depends on a constraint elsewhere is not
    -- fail-closed.
    if v_sub.status not in ('active','trialing','past_due','canceled','expired') then
      v_status := 'unrecognized';
    elsif v_sub.plan <> 'premium' then
      -- CUALIFICADO POR PLAN. B1 crea filas con `plan default 'free', status
      -- default 'active'`, así que publicar 'active' sobre una fila free diría
      -- "tiene una suscripción activa" justo cuando no la tiene — lo contrario de
      -- la verdad, y en la superficie que DECIDE. Sin plan premium no hay
      -- suscripción comercial en vigor: 'none'.
      -- El status crudo no se pierde: sigue disponible en aurix_commercial_state()
      -- de B1, que es donde vive el hecho comercial (lo necesitará B3 para un
      -- "tu plan se canceló"). Aquí se publica la DECISIÓN, no el historial.
      v_status := 'none';
    else
      v_status := v_sub.status;
    end if;

    -- A premium entitlement is valid only when ALL of these hold. Note the
    -- explicit plan whitelist: an unrecognised plan value is not premium.
    if v_sub.plan = 'premium'
       and v_status in ('active','trialing')
       -- Either it is a declared lifetime purchase, or the paid period is still
       -- running. `is not distinct from` because billing_interval is nullable and
       -- a NULL comparison must be false here, not unknown — the same 3VL trap
       -- that B1's premium_bound constraint had to close.
       and (v_sub.billing_interval is not distinct from 'lifetime'
            or (v_sub.current_period_end is not null and v_sub.current_period_end > now()))
       -- A row still marked `trialing` after its trial_end is STALE state: the
       -- provider has not told us what happened. Fail-closed ⇒ not premium. This
       -- deliberately prefers "a late webhook briefly degrades access" over
       -- "an unfinished trial grants Premium indefinitely".
       and (v_status <> 'trialing'
            or (v_sub.trial_end is not null and v_sub.trial_end > now()))
    then
      v_plan    := 'premium';
      v_source  := 'subscription';

      -- Lifetime has no bound. Otherwise publish the EARLIEST applicable bound,
      -- so validUntil never over-promises.
      if v_sub.billing_interval is not distinct from 'lifetime' then
        v_until := null;
      elsif v_status = 'trialing' then
        v_until := least(v_sub.trial_end, v_sub.current_period_end);
      else
        v_until := v_sub.current_period_end;
      end if;
    end if;
  end if;

  -- ── 2. plan feature matrix ────────────────────────────────────────────────
  -- The canonical key set comes from plan_features itself, so adding a
  -- capability in B5 flows through with no change here. An empty or unreadable
  -- catalogue yields an empty map, i.e. everything denied.
  for r in
    select distinct pf.feature_key as k from public.plan_features pf
  loop
    v_key := r.k;
    select pf.allowed into v_allowed
      from public.plan_features pf
     where pf.plan = v_plan and pf.feature_key = v_key;
    v_allowed := coalesce(v_allowed, false);          -- absence = denied
    v_features := v_features || jsonb_build_object(v_key, v_allowed);
    v_sources  := v_sources  || jsonb_build_object(v_key, case when v_allowed then 'plan' else 'default' end);
  end loop;

  -- ── 3. applicable overrides: GLOBAL first, then the specific key ──────────
  if v_uid is not null then
    -- 3a. the global '*' grant/denial, if one is in force right now.
    select eo.allowed into v_star
      from public.entitlement_overrides eo
     where eo.user_id = v_uid
       and eo.feature_key = '*'
       and eo.starts_at <= now()
       and (eo.expires_at is null or eo.expires_at > now());
    v_star_found := found;

    -- A GLOBAL DENIAL IS ABSOLUTE, and that is a decision, not an accident.
    -- Specificity-wins was the first version and it broke the only use case the
    -- global denial exists for: support cutting off abuse. A stale per-feature
    -- grant from an old QA session (`intelligence.full`, true, no expiry) would
    -- survive `('*', false, 'support')` and the kill switch would silently not
    -- kill. So a live '*' deny short-circuits: everything denied, per-feature
    -- overrides not even consulted.
    if v_star_found and v_star is false then
      for r in select jsonb_object_keys(v_features) as k loop
        v_features := jsonb_set(v_features, array[r.k], to_jsonb(false));
        v_sources  := jsonb_set(v_sources,  array[r.k], to_jsonb('override'::text));
      end loop;

    else
      -- 3b. A global GRANT opens everything, and then the per-feature decisions
      -- refine it — here specificity DOES win, so '*' allow + a `workspace.loan`
      -- deny removes exactly that one feature. Keys absent from the catalogue are
      -- IGNORED: an override cannot invent a capability that no plan defines.
      if v_star_found and v_star is true then
        for r in select jsonb_object_keys(v_features) as k loop
          v_features := jsonb_set(v_features, array[r.k], to_jsonb(true));
          v_sources  := jsonb_set(v_sources,  array[r.k], to_jsonb('override'::text));
        end loop;
      end if;

      for r in
        select eo.feature_key as k, eo.allowed as a
          from public.entitlement_overrides eo
         where eo.user_id = v_uid
           and eo.feature_key <> '*'
           and eo.allowed is not null
           and eo.starts_at <= now()
           and (eo.expires_at is null or eo.expires_at > now())
      loop
        if v_features ? r.k then
          v_features := jsonb_set(v_features, array[r.k], to_jsonb(r.a));
          v_sources  := jsonb_set(v_sources,  array[r.k], to_jsonb('override'::text));
        end if;
      end loop;
    end if;
  end if;

  -- ── 4. sanitized effective result ─────────────────────────────────────────
  -- What is NOT here is the point: no provider_customer_id, no
  -- provider_subscription_id, no last_event_id, no price, no provider metadata.
  -- The client gets a decision and the reason for it, never the billing system.
  return query select v_plan, v_status, v_features, v_sources, v_source, v_until;
end;
$$;

-- Same lock as B1: named roles, not just the PUBLIC pseudo-role, because
-- Supabase's default privileges grant EXECUTE on new functions to anon and
-- authenticated by name.
revoke all     on function public.aurix_entitlements() from public, anon, authenticated;
grant  execute on function public.aurix_entitlements() to   authenticated;


-- ============================================================================
-- VERIFICATION — see db/monetization_b2_resolver_certification.sql for the
-- executable behavioural certification (24 scenarios, self-restoring, inside a
-- transaction that is rolled back, so it leaves no rows behind).
-- ============================================================================
-- -- ACL: expect anon=false, authenticated=true
-- select p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'execute')
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  cross join (select rolname from pg_roles where rolname in ('anon','authenticated')) r
--  where n.nspname = 'public' and p.proname = 'aurix_entitlements';
--
-- -- A user with no subscription must resolve to Free with everything denied:
-- select * from public.aurix_entitlements();
-- ============================================================================
