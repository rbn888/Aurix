-- ============================================================================
-- AURIX-CHART-BACKEND-SNAPSHOTS-V1  (DSH.CHART.BACKEND-SNAPSHOTS.V1.01)
-- ----------------------------------------------------------------------------
-- Apply: paste this whole file into the Supabase SQL editor for the project
-- referenced by SUPABASE_URL in config.js, then run.  *** NOT YET APPLIED ***
-- (This file is committed for review; run it only at the ACTIVATION step, Fase 6.)
-- Idempotent + NON-destructive: creates a NEW table only; never touches
-- user_portfolios / holdings / category_history / performance_state.
--
-- Why a NEW table (not user_portfolios.category_history):
--   category_history is written by a LAST-WRITER-WINS full-row upsert from the
--   frontend. A backend writer appending there would be clobbered by the next
--   frontend flush. A dedicated append-only table is isolated from that race and
--   gives a clean retention/downsample surface. The frontend MERGES it read-only
--   at display time (app.js _aurixMergeSnapshotSources, behind
--   _AURIX_BACKEND_SNAPSHOTS_ENABLED); it never overwrites it.
--
-- RLS: users may READ their own rows. INSERT is service-role ONLY (the scheduler
-- uses the service_role key, which bypasses RLS). No client ever inserts here.
-- ============================================================================

create table if not exists public.portfolio_snapshots (
  id              bigint generated always as identity primary key,
  user_id         uuid        not null references auth.users (id) on delete cascade,
  ts              timestamptz not null,                 -- capture instant
  total_value_usd numeric     not null,                 -- portfolio total in USD (investable = total - real_estate)
  real_estate     numeric     not null default 0,       -- USD, so the chart can compute investable = total - real_estate
  category_values jsonb       not null default '{}'::jsonb,  -- per-bucket USD (crypto/stocks/funds/metals/cash/…)
  asset_count     int         not null default 0,
  source          text        not null default 'backend_snapshot',
  confidence      text        not null default 'scheduled',   -- scheduled | reconstructed | stale_price
  market_state    text,                                        -- open | closed | crypto_24_7 | mixed
  price_staleness text,                                        -- live | last_close | stale
  schema_version  int         not null default 1,
  created_at      timestamptz not null default now()
);

-- Fast per-user time-range reads (the chart fetches recent-by-user).
create index if not exists portfolio_snapshots_user_ts_idx
  on public.portfolio_snapshots (user_id, ts desc);

-- Idempotency / no-duplicate guard: at most one snapshot per user per minute-bucket.
-- (The scheduler also applies a value/time near-duplicate check, but this is the hard floor.)
-- NOTE: the index expression MUST be IMMUTABLE. `date_trunc('minute', ts)` on a timestamptz is only STABLE
-- (timezone-dependent), so Postgres rejects it in an index. We bucket on the absolute epoch-minute instead —
-- the epoch of an instant is timezone-independent, so this IMMUTABLE wrapper is correct and safe.
create or replace function public.aurix_minute_bucket(p_ts timestamptz)
  returns bigint language sql immutable
  as $$ select floor(extract(epoch from p_ts) / 60)::bigint $$;

create unique index if not exists portfolio_snapshots_user_minute_uidx
  on public.portfolio_snapshots (user_id, public.aurix_minute_bucket(ts));

alter table public.portfolio_snapshots enable row level security;

-- READ own rows (authenticated). No client INSERT/UPDATE/DELETE policy ⇒ writes are
-- service-role only (scheduler). Never exposes another user's data.
drop policy if exists portfolio_snapshots_select_own on public.portfolio_snapshots;
create policy portfolio_snapshots_select_own
  on public.portfolio_snapshots for select
  using (auth.uid() = user_id);

-- Retention helper (call from the scheduler or a nightly job): keep full-resolution
-- for 35 days, then thin older rows to one per day. NON-destructive to recent data.
-- (Provided for reference; wire into the scheduler at activation.)
-- delete from public.portfolio_snapshots s
--   using (
--     select id, row_number() over (partition by user_id, date_trunc('day', ts) order by ts desc) rn
--     from public.portfolio_snapshots where ts < now() - interval '35 days'
--   ) d
--   where s.id = d.id and d.rn > 1;
