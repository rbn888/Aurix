-- ============================================================================
-- AURIX-RESET-IRREVERSIBLE (SPEC 65) — portfolio_snapshots owner DELETE policy
-- ----------------------------------------------------------------------------
-- Apply: paste this whole file into the Supabase SQL editor for the project
-- referenced by SUPABASE_URL in config.js (ozcasyufbknnuemllwso), then run.
-- Idempotent + NON-destructive to schema: only adds an RLS DELETE policy.
--
-- WHY: portfolio_snapshots is an append-only BACKEND wealth-history table
-- (service-role writer / pg_cron). Its original RLS granted the client SELECT
-- only (see db/portfolio_snapshots_1.sql), so a client-side RESET could not
-- delete this SOURCE — pre-reset wealth history rehydrated into the chart on
-- the next focus/login/device. A complete, irreversible RESET must delete the
-- source, not merely hide it on the frontend.
--
-- This policy lets an authenticated user DELETE ONLY THEIR OWN snapshot rows
-- (auth.uid() = user_id). It CANNOT touch any other user's rows. The scheduler
-- (service_role) is unaffected (it bypasses RLS). After applying, the client
-- reset (`_pushEmptyPortfolioToBackend` → delete().eq('user_id', currentUser.id))
-- hard-deletes the source, and re-running RESET on the affected account clears
-- its historical snapshots for good.
-- ============================================================================

alter table public.portfolio_snapshots enable row level security;

drop policy if exists portfolio_snapshots_delete_own on public.portfolio_snapshots;
create policy portfolio_snapshots_delete_own
  on public.portfolio_snapshots for delete
  using (auth.uid() = user_id);
