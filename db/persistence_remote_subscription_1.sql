-- ============================================================================
-- AURIX-MONETIZATION-1 · Phase 2 — Subscription / plan (remote, dormant)
-- ----------------------------------------------------------------------------
-- Apply: paste this whole file into the Supabase SQL editor for the project
-- referenced by SUPABASE_URL in config.js, then run.
-- Idempotent (add column if not exists) and NON-destructive: existing rows keep
-- all data and receive '{}' (never NULL) in `subscription` via the default.
--
-- Purpose: make the per-account plan remote so the commercial tier
-- (free | founder | premium) and its status/dates converge across Safari, the
-- installed PWA, a recreated shortcut, desktop and mobile — exactly like
-- assets/holdings/history/watchlist/preferences/ui_state already do.
--
-- This is INFRASTRUCTURE ONLY. It does not enable payments, Stripe, real
-- subscriptions or any paywall. In prelaunch every feature stays unlocked for
-- every tier (app.js: ENFORCE_ENTITLEMENTS = false); this column just durably
-- records whatever plan the client holds.
--
-- subscription jsonb shape (written by app.js _collectSubscription / getPlan):
--   { "tier": "free|founder|premium",
--     "status": "active|trialing|past_due|canceled|expired",
--     "startedAt": <ms|null>, "renewsAt": <ms|null>, "expiresAt": <ms|null>,
--     "canceledAt": <ms|null>, "trialEndsAt": <ms|null>,
--     "promoCode": <string|null>, "source": "default|promo|manual|stripe",
--     "founderEligible": <bool> }
--
-- Strategy (app.js): last-write-wins by `subscription_updated_at`, mirroring the
-- preferences / ui_state sync. A legacy explicit local plan (key present, no
-- timestamp) is stamped once on migration so it is never overwritten by an older
-- remote. Until this SQL is applied, _flushStatePersistence is push-safe: it
-- strips these two columns and persists core data, so nothing breaks.
--
-- RLS: NO policy changes needed. Policies on user_portfolios are row-level
-- (auth.uid() = user_id) and cover every column automatically.
-- ============================================================================

alter table public.user_portfolios
  add column if not exists subscription            jsonb       not null default '{}'::jsonb,
  add column if not exists subscription_updated_at timestamptz;

-- ============================================================================
-- Verification — run after applying (expect the 2 new columns to be listed):
-- ============================================================================
-- select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name   = 'user_portfolios'
--    and column_name in ('subscription','subscription_updated_at')
--  order by column_name;
-- ============================================================================
