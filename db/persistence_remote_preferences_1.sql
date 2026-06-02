-- ============================================================================
-- AURIX-LAUNCH-P0-PERSISTENCE — critical preferences
-- ----------------------------------------------------------------------------
-- Apply: paste this whole file into the Supabase SQL editor for the project
-- referenced by SUPABASE_URL in config.js, then run.
-- Idempotent (add column if not exists) and NON-destructive: existing rows
-- keep all data and receive '{}' (never NULL) in `preferences` via the default.
--
-- Purpose: persist the user's critical display preferences (language and base
-- currency) so Safari and the installed iOS PWA (separate storage containers)
-- render identical numbers and language. Extends the history/watchlist sync
-- from db/persistence_remote_history_watchlist_1.sql.
--
-- Strategy (app.js): last-write-wins by `preferences_updated_at`, mirroring the
-- watchlist. The PLAN (aurix_plan) is intentionally NOT included — it is an
-- entitlement, not a preference, and should become server-authoritative later.
--
-- RLS: NO policy changes needed. Policies on user_portfolios are row-level
-- (auth.uid() = user_id) and cover every column automatically.
-- ============================================================================

alter table public.user_portfolios
  add column if not exists preferences            jsonb       not null default '{}'::jsonb,
  add column if not exists preferences_updated_at timestamptz;

-- ============================================================================
-- Verification — run after applying (expect the 2 new columns to be listed):
-- ============================================================================
-- select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name   = 'user_portfolios'
--    and column_name in ('preferences','preferences_updated_at')
--  order by column_name;
-- ============================================================================
