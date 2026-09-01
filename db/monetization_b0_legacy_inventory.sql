-- ============================================================================
-- AURIX-MONETIZATION-M02-B0  ·  LEGACY COMMERCIAL STATE INVENTORY
-- ----------------------------------------------------------------------------
-- READ-ONLY. Every statement below is a SELECT. This file contains no INSERT,
-- UPDATE, DELETE, ALTER, DROP or GRANT, and it must stay that way.
--
-- WHY IT IS A SEPARATE FILE THE FOUNDER RUNS:
--   The only Supabase key present in this repository is the publishable/anon
--   key in config.js, and `anon` has no privilege on user_portfolios (verified:
--   the REST call returns 42501 "permission denied for table user_portfolios").
--   Counting legacy tiers therefore requires the SQL editor or a service-role
--   key. A service-role key must never enter this repo or a shell command
--   (db/supabase_rls.sql documents that rule), so the count is executed by the
--   founder in the Supabase SQL editor and pasted back.
--
-- WHAT THIS IS FOR:
--   Knowing what legacy commercial values exist. NOTHING ELSE.
--
--   The values found here are CLIENT-CONTROLLED (app.js writes
--   user_portfolios.subscription from _collectSubscription, and the RLS on
--   user_portfolios grants the user UPDATE on their own row). They are
--   therefore NOT evidence of a purchase and MUST NOT be converted into rows of
--   public.subscriptions. There is no paid channel in production: nobody has
--   ever paid for Aurix. Any non-free value is a local default, a founder/test
--   value or a self-grant.
--
--   B1 does not depend on this result. The new tables start EMPTY and absence
--   of a row means Free, which is the correct state for every existing user.
--
-- FORBIDDEN, explicitly:
--   · backfilling public.subscriptions from these values
--   · granting Premium because of these values
--   · deleting or rewriting these values (they are removed in B7, and only the
--     WRITER is removed then — the column stays)
-- ============================================================================


-- ── Q1. How many users exist, and how many carry any legacy subscription blob ─
select count(*)                                                   as users_total,
       count(*) filter (where subscription is not null
                          and subscription <> '{}'::jsonb)        as with_subscription_blob,
       count(*) filter (where subscription_updated_at is not null) as with_subscription_ts
  from public.user_portfolios;


-- ── Q2. Distribution of the legacy tier value ───────────────────────────────
-- Expectation: everything in 'free' or NULL. Anything else is explained in Q4.
select coalesce(subscription->>'tier', '(null)') as legacy_tier,
       coalesce(subscription->>'status','(null)') as legacy_status,
       coalesce(subscription->>'source','(null)') as legacy_source,
       count(*)                                   as rows
  from public.user_portfolios
 group by 1, 2, 3
 order by rows desc, legacy_tier;


-- ── Q3. Rows whose tier is NOT free — the ones that matter ──────────────────
-- `user_id` is included so the founder can tell his own account apart from a
-- real user's. It is NOT a migration list.
select user_id,
       subscription->>'tier'            as tier,
       subscription->>'status'          as status,
       subscription->>'source'          as source,
       subscription->>'promoCode'       as promo_code,
       subscription->>'founderEligible' as founder_eligible,
       subscription_updated_at
  from public.user_portfolios
 where coalesce(subscription->>'tier', 'free') <> 'free'
 order by subscription_updated_at desc nulls last;


-- ── Q4. Unexpected shapes: keys we never wrote, or a tier outside the enum ───
-- Catches hand-edited blobs and forward-incompatible values.
select user_id,
       subscription->>'tier' as tier,
       jsonb_object_keys_agg  as unexpected_keys
  from (
    select user_id,
           subscription,
           (select array_agg(k)
              from jsonb_object_keys(subscription) k
             where k not in ('tier','status','startedAt','renewsAt','expiresAt',
                             'canceledAt','trialEndsAt','promoCode','source',
                             'founderEligible')) as jsonb_object_keys_agg
      from public.user_portfolios
     where subscription is not null and subscription <> '{}'::jsonb
  ) t
 where jsonb_object_keys_agg is not null
    or coalesce(subscription->>'tier','free') not in ('free','founder','premium');


-- ── Q5. Sanity: the new tables must be EMPTY after B1 is applied ────────────
-- If subscriptions has rows before a provider exists, something backfilled it.
-- Run only after db/monetization_commercial_truth_1.sql has been applied.
-- select 'subscriptions'         as t, count(*) from public.subscriptions
-- union all
-- select 'entitlement_overrides' as t, count(*) from public.entitlement_overrides
-- union all
-- select 'plan_features'         as t, count(*) from public.plan_features;
-- -- expect: subscriptions 0 · entitlement_overrides 0 · plan_features 6
-- ============================================================================
