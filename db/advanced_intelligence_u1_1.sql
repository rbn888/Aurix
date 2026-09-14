-- ============================================================================
-- AURIX ADVANCED INTELLIGENCE · U1 — additive server authority   *** NOT APPLIED ***
-- ----------------------------------------------------------------------------
-- Apply: paste this whole file into the Supabase SQL editor for the project
-- referenced by SUPABASE_URL in config.js, then run. Committed for review.
--
-- Idempotent · ADDITIVE ONLY · NON-destructive. It creates NO table, drops
-- nothing, deletes nothing and rewrites no row. Three columns on two tables
-- that already exist and already carry the correct row-level security.
--
-- WHY COLUMNS AND NOT NEW TABLES — two reasons, both load-bearing:
--   1. `user_portfolios` and `capital_flows` are already the authoritative
--      user-scoped owners for this state, and their RLS is row-level
--      (auth.uid() = user_id), so it covers every column automatically. A new
--      table would need its own policies, its own grants, and its own review.
--   2. Project DEFAULT PRIVILEGES grant `anon` SELECT on NEW tables in `public`.
--      That hazard is documented in Aurix memory and it is real: on a new table
--      RLS is the ONLY barrier and the grant is not. Adding columns to existing
--      tables does not touch grants at all, so the hazard is structurally
--      avoided rather than mitigated.
--
-- ROLLBACK = IGNORE. Nothing reads these columns unless the client finds them.
-- The frontend is written schema-absent-safe: if a column is missing, the read
-- fails and the engine falls back to EXACTLY today's device-local behaviour
-- (the same pattern `intelligence_context` already uses). There is therefore no
-- DROP in this file and none is needed to roll back — reverting the frontend is
-- sufficient. A DROP would be a destructive migration and is forbidden.
--
-- WHAT THIS FILE DOES NOT DO, on purpose:
--   · it does not delete or modify any `portfolio_snapshots` row;
--   · it does not apply db/portfolio_snapshots_reset_delete_1.sql (founder
--     decision: PRESERVE pre-reset history) and does not grant DELETE anywhere;
--   · it does not reinterpret, backfill or upgrade any legacy `capital_flows`
--     row — legacy rows stay NULL in `intent` and are read as UNKNOWN_LEGACY
--     forever. Inference may never become certified external capital.
-- ============================================================================


-- ── 1 · SERVER-AUTHORITATIVE PORTFOLIO EPOCH ────────────────────────────────
-- The defect this closes: `_aurixPortfolioEpoch()` (app.js:13109) reads ONLY
-- localStorage (`aurix_portfolio_epoch`, fallback `aurix_reset_at`), so the
-- lifecycle boundary of an ACCOUNT is a property of a DEVICE. A phone that never
-- performed the reset has epoch 0 and legitimately reads pre-reset
-- `portfolio_snapshots` rows that the desktop hides — which is the leading
-- candidate for the phantom ETF/metals historical exposure, and is independently
-- guaranteed to be possible by the RLS of portfolio_snapshots_1.sql (the client
-- had SELECT only, so the reset could never delete the source).
--
-- Milliseconds, not timestamptz, because every client-side epoch comparison in
-- app.js is an integer ms comparison against `ts`. Storing the same unit removes
-- a conversion that could only ever introduce an off-by-a-timezone bug on a
-- boundary that decides whether financial history is visible.
--
-- Semantics the client must honour (implemented in app.js, asserted by the
-- AURIX-EVIDENCE-CONTRACT harness):
--   effective = max(server_epoch, local_epoch)
-- so an existing local epoch can NEVER regress, and a device at 0 adopts the
-- account's authority as soon as it is readable. NULL = no authority known yet
-- ⇒ behaviour identical to today.
alter table public.user_portfolios
  add column if not exists portfolio_epoch_ms         bigint,
  add column if not exists portfolio_epoch_updated_at timestamptz;

comment on column public.user_portfolios.portfolio_epoch_ms is
  'Server-authoritative portfolio lifecycle epoch, unix ms. Client uses max(server, local) so a local epoch never regresses. NULL = unknown, client falls back to device-local behaviour.';


-- ── 2 · FORWARD-ONLY ASSET CLASSIFICATION LINEAGE ───────────────────────────
-- The second candidate for the phantom exposure: the snapshot capturer buckets
-- on `asset.type` at capture time (supabase/functions/portfolio-snapshot/
-- index.ts:106, :271) against a MUTABLE catalog type. If an instrument's type is
-- later corrected (etf -> fund, metal -> other), the historical bucket stays
-- frozen at the old value and today's is different, so an exposure appears to
-- have "fallen to 0%" with no economic event whatsoever.
--
-- This column records type changes GOING FORWARD so a window that spans one can
-- be refused instead of published. It cannot be reconstructed for the past, and
-- it is not backfilled: a window with no lineage coverage resolves to
-- classificationValidity = 'unknown' and the TRANSITION is suppressed (the
-- current STATE may still be published if independently certified).
--
-- Shape — append-only, bounded by the client, no PII:
--   [{ "a": "<assetId>", "f": "<fromBucket>", "t": "<toBucket>", "at": <ms> }]
-- jsonb rather than a table because it rides the existing last-writer-wins
-- upsert of user_portfolios, and unlike an economic ledger a LOST lineage entry
-- is SAFE: it degrades a claim to 'unknown' and suppresses it. Fail-closed data
-- may live in a fail-closed store; a capital event may not (which is exactly why
-- capital_flows is a table — see db/capital_flows_1.sql).
alter table public.user_portfolios
  add column if not exists asset_classification_lineage            jsonb not null default '[]'::jsonb,
  add column if not exists asset_classification_lineage_updated_at  timestamptz;

comment on column public.user_portfolios.asset_classification_lineage is
  'Forward-only append log of asset type/bucket changes: [{a,f,t,at}]. Never backfilled. Absence of coverage degrades a historical exposure claim to unknown and suppresses the transition.';


-- ── 3 · EXPLICIT FLOW INTENT ────────────────────────────────────────────────
-- The defect this closes: `kind` conflates ECONOMIC INTENT with MECHANISM.
-- `deposit` is emitted both when new external money arrives AND when the user
-- merely registers cash they already owned (aurixCashOperation, app.js:11101 —
-- the single external writer for both paths), and `withdrawal` is emitted both
-- for a real withdrawal and for the DEREGISTRATION of a deleted cash row
-- (_aurixLedgerAssetRemoval, app.js:10774). A sentence that says "has aportado X
-- de capital nuevo" over that ledger is not certifiable, which is why the claim
-- is retired.
--
-- `intent` is the forward-only explicit declaration. Vocabulary, frozen:
--   OPENING_BALANCE              wealth that already existed when it was registered
--   EXTERNAL_CASH_CONTRIBUTION   new money entering from outside the portfolio
--   EXTERNAL_CASH_WITHDRAWAL     money leaving to outside the portfolio
--   INTERNAL_BUY                 composition change funded inside the perimeter
--   INTERNAL_SELL                composition change inside the perimeter
--   EXTERNAL_ASSET_TRANSFER_IN   an asset arriving from outside (needs capture)
--   EXTERNAL_ASSET_TRANSFER_OUT  an asset leaving to outside (needs capture)
--   CORRECTION                   fixing a previously mis-registered amount
--   IMPORT_OR_MIGRATION          produced by an import or a migration
--   UNKNOWN_LEGACY               written before intent existed, or inferred
--
-- NULL means UNKNOWN_LEGACY. Legacy rows are NEVER upgraded by inference — that
-- is the whole point: the reason the current claim is false is that mechanism was
-- read as intent. A row whose intent is unknown fails closed out of every
-- external-capital claim, forever, and no amount of later evidence promotes it.
--
-- The CHECK permits NULL, so it validates instantly against every existing row
-- and cannot fail on apply. It exists so a malformed client write is rejected by
-- the database rather than silently entering a financial claim.
alter table public.capital_flows
  add column if not exists intent text;

alter table public.capital_flows
  drop constraint if exists capital_flows_intent_vocab;
alter table public.capital_flows
  add  constraint capital_flows_intent_vocab check (
    intent is null or intent in (
      'OPENING_BALANCE',
      'EXTERNAL_CASH_CONTRIBUTION',
      'EXTERNAL_CASH_WITHDRAWAL',
      'INTERNAL_BUY',
      'INTERNAL_SELL',
      'EXTERNAL_ASSET_TRANSFER_IN',
      'EXTERNAL_ASSET_TRANSFER_OUT',
      'CORRECTION',
      'IMPORT_OR_MIGRATION',
      'UNKNOWN_LEGACY'
    )
  );

comment on column public.capital_flows.intent is
  'Explicit, forward-only economic intent. NULL = UNKNOWN_LEGACY. Legacy rows are never upgraded by inference; unknown intent fails closed out of every external-capital claim.';


-- ============================================================================
-- VERIFICATION — run these three after applying. All must hold.
-- ============================================================================
--
-- 1 · the five columns exist (expect 5 rows):
--
-- select table_name, column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_schema = 'public'
--    and ((table_name = 'user_portfolios'
--          and column_name in ('portfolio_epoch_ms','portfolio_epoch_updated_at',
--                              'asset_classification_lineage',
--                              'asset_classification_lineage_updated_at'))
--      or (table_name = 'capital_flows' and column_name = 'intent'))
--  order by table_name, column_name;
--
-- 2 · the intent vocabulary constraint is present and VALIDATED (expect 1 row,
--     convalidated = true):
--
-- select conname, convalidated
--   from pg_constraint
--  where conrelid = 'public.capital_flows'::regclass
--    and conname  = 'capital_flows_intent_vocab';
--
-- 3 · `anon` gained NOTHING. This file adds no table, so default privileges
--     cannot apply — but verify rather than assume, because the grant, not the
--     policy, is what the default-privileges hazard exploits (expect 0 rows):
--
-- select table_name, privilege_type
--   from information_schema.role_table_grants
--  where table_schema = 'public'
--    and grantee      = 'anon'
--    and table_name in ('user_portfolios','capital_flows','portfolio_snapshots');
--
-- 4 · pre-reset history is INTACT and no DELETE policy was granted on snapshots
--     (expect the row count unchanged, and 0 delete policies):
--
-- select count(*) as delete_policies
--   from pg_policies
--  where schemaname = 'public'
--    and tablename  = 'portfolio_snapshots'
--    and cmd        = 'DELETE';
--
-- ============================================================================
-- APPLICATION ORDER / SCOPE
-- ============================================================================
-- · This file FIRST, the frontend candidate SECOND. Either order is safe (the
--   client is schema-absent-safe), but this order makes the fix live the moment
--   the frontend ships.
-- · NO Edge Function deployment is required. The snapshot capturer is unchanged:
--   classification lineage is written by the CLIENT, which is the only party that
--   observes a type change at the moment it happens. Touching the capturer would
--   mean changing the semantics of `category_values` on a live append-only
--   history, which is out of scope and unnecessary.
-- · NO Vercel change. No new API route, so the Hobby 12+1 function ceiling is
--   untouched.
-- · Rollback: revert the frontend. Leave these columns in place; nothing reads
--   them and nothing depends on them. Do not DROP.
-- ============================================================================
