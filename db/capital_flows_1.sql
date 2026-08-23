-- ============================================================================
-- AURIX-CASH-LEDGER-PERFORMANCE-TRUTH  ·  capital_flows  (P0)
-- ----------------------------------------------------------------------------
-- Apply: paste this whole file into the Supabase SQL editor for the project
-- referenced by SUPABASE_URL in config.js, then run.  *** NOT YET APPLIED ***
-- Idempotent + ADDITIVE: creates a NEW table only. Never touches
-- user_portfolios / holdings / category_history / performance_state /
-- portfolio_snapshots.
--
-- WHY A DEDICATED TABLE (and not one more jsonb column on user_portfolios):
--   The six existing remote persistences (portfolio_history, category_history,
--   watchlist, subscription, preferences, ui_state) are jsonb columns written by
--   a LAST-WRITER-WINS full-row upsert from the frontend. That is acceptable for
--   caches and preferences and FATAL for an economic ledger: device B writing an
--   older array silently erases a capital event recorded on device A. The same
--   reasoning is already written down in portfolio_snapshots_1.sql — this table
--   follows that precedent, with one deliberate difference: the CLIENT is the
--   writer here (the user performs the operation), so RLS grants per-user
--   INSERT/UPDATE instead of being service-role only. No client ever needs the
--   service-role key.
--
-- WHAT THIS TABLE IS: the authority for EXTERNAL capital movement in and out of
-- the portfolio, plus the internal moves already classified by the client. It is
-- what makes a return provable as "market movement + neutralised flows" on ANY
-- device — today `aurixCapitalFlows` lives in one browser's localStorage, so a
-- second device cannot neutralise a flow it never saw.
--
-- WHAT IT IS NOT: a transaction log for buy/sell of assets (those live on the
-- holding's `transactions[]`), and not a balance. The balance stays where it is;
-- this table is what lets Aurix PROVE the balance moved for an economic reason.
-- ============================================================================

create table if not exists public.capital_flows (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  -- Stable, client-generated, opaque. NOT derived from the amount: an edit must
  -- update the SAME row (revision + 1), never insert a second flow. The previous
  -- localStorage id (`kind:assetId:ts:amount`) changed with the amount, which is
  -- exactly why "edit 500 → 700" produced two flows totalling 1200.
  flow_id     text        not null,
  ts          timestamptz not null,                  -- ECONOMIC instant of the movement
  -- deposit | withdrawal            → external capital in / out
  -- internal_buy | internal_sell    → composition change, NOT an external flow
  -- internal_transfer | import_baseline
  kind        text        not null,
  amount      numeric     not null,                  -- signed, in `currency`
  currency    text        not null,
  amount_usd  numeric     not null,                  -- signed; what neutralisation consumes
  asset_id    text,                                  -- the holding it relates to, when one exists
  revision    int         not null default 1,        -- bumped by every edit / delete
  deleted_at  timestamptz,                           -- tombstone: financial history is never erased
  updated_at  timestamptz not null default now(),
  primary key (user_id, flow_id)
);

-- The reader is always "this user's live flows, in economic order".
create index if not exists capital_flows_user_ts_idx
  on public.capital_flows (user_id, ts)
  where deleted_at is null;

alter table public.capital_flows enable row level security;
alter table public.capital_flows force  row level security;

-- Fail-closed per user: a client may only ever see and write its OWN rows.
-- No DELETE policy on purpose — a delete is a tombstone (UPDATE deleted_at), so
-- financial history cannot be physically destroyed from the client.
drop policy if exists capital_flows_select_own on public.capital_flows;
create policy capital_flows_select_own
  on public.capital_flows for select
  using (auth.uid() = user_id);

drop policy if exists capital_flows_insert_own on public.capital_flows;
create policy capital_flows_insert_own
  on public.capital_flows for insert
  with check (auth.uid() = user_id);

drop policy if exists capital_flows_update_own on public.capital_flows;
create policy capital_flows_update_own
  on public.capital_flows for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
