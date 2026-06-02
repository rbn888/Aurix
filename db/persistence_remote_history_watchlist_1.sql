-- ============================================================================
-- AURIX-PERSISTENCE-REMOTE-HISTORY-WATCHLIST-1
-- ----------------------------------------------------------------------------
-- Apply: paste this whole file into the Supabase SQL editor for the project
-- referenced by SUPABASE_URL in config.js, then run.
-- Idempotent (add column if not exists) and NON-destructive: existing rows
-- keep assets/holdings untouched and receive '[]' (never NULL) in the new
-- columns via the defaults.
--
-- Purpose: move the histórico (portfolio_history, category_history) and the
-- watchlist from local-only storage to Supabase, so Safari and the installed
-- iOS PWA (separate storage containers) show identical data and deleting /
-- recreating the home-screen shortcut never loses history or watchlist.
--
-- Read/write strategy lives in app.js:
--   • portfolio_history / category_history → union-by-ts merge (monotonic).
--   • watchlist                            → last-write-wins via watchlist_updated_at
--                                            (preserves explicit deletions).
--
-- RLS: NO policy changes needed. Policies on user_portfolios are row-level
-- (auth.uid() = user_id) and cover every column automatically. See
-- db/supabase_rls.sql.
-- ============================================================================

alter table public.user_portfolios
  add column if not exists portfolio_history    jsonb       not null default '[]'::jsonb,
  add column if not exists category_history     jsonb       not null default '[]'::jsonb,
  add column if not exists watchlist            jsonb       not null default '[]'::jsonb,
  add column if not exists watchlist_updated_at timestamptz;

-- Defensive: guarantee sane defaults on the existing columns so a flush upsert
-- that omits them can never insert NULL into a brand-new row.
alter table public.user_portfolios alter column assets   set default '[]'::jsonb;
alter table public.user_portfolios alter column holdings set default '{}'::jsonb;

-- ============================================================================
-- Verification — run after applying (expect the 4 new columns to be listed):
-- ============================================================================
-- select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name   = 'user_portfolios'
--    and column_name in ('portfolio_history','category_history',
--                        'watchlist','watchlist_updated_at')
--  order by column_name;
-- ============================================================================
