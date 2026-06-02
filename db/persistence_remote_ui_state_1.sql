-- ============================================================================
-- AURIX-ACCOUNT-SOURCE-OF-TRUTH-1 · Phase 1 — UI state (workspace + orders)
-- ----------------------------------------------------------------------------
-- Apply: paste this whole file into the Supabase SQL editor for the project
-- referenced by SUPABASE_URL in config.js, then run.
-- Idempotent (add column if not exists) and NON-destructive: existing rows keep
-- all data and receive '{}' (never NULL) in `ui_state` via the default.
--
-- Purpose: make the per-account UI state remote so it matches across Safari, the
-- installed PWA, a recreated shortcut, desktop and mobile. Closes the last
-- device-divergence gaps after assets/holdings/history/watchlist/preferences.
--
-- ui_state jsonb shape (written by app.js _collectUiState):
--   { "workspace": <aurix.workspace.v1 payload | null>,
--     "cardOrder": [assetId, ...],
--     "catOrder":  [type, ...] }
--
-- Strategy (app.js): last-write-wins by `ui_state_updated_at`, mirroring the
-- preferences sync. A legacy explicit local state (keys present, no timestamp)
-- is stamped once on migration so it is never overwritten by an older remote.
--
-- RLS: NO policy changes needed. Policies on user_portfolios are row-level
-- (auth.uid() = user_id) and cover every column automatically.
-- ============================================================================

alter table public.user_portfolios
  add column if not exists ui_state            jsonb       not null default '{}'::jsonb,
  add column if not exists ui_state_updated_at timestamptz;

-- ============================================================================
-- Verification — run after applying (expect the 2 new columns to be listed):
-- ============================================================================
-- select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name   = 'user_portfolios'
--    and column_name in ('ui_state','ui_state_updated_at')
--  order by column_name;
-- ============================================================================
