-- ============================================================================
-- AURIX · PER-USER SNAPSHOT CONTINUITY OBSERVABILITY
-- portfolio_snapshot_user_health  +  portfolio_snapshot_health.stale_active_portfolios
-- ----------------------------------------------------------------------------
-- Apply: paste this whole file into the Supabase SQL editor of the project
-- referenced by SUPABASE_URL in config.js, then run.
-- *** NOT APPLIED FROM THE REPO — same convention as the other db/*.sql files.
--     (That header states how the file is DELIVERED, never what production
--     currently contains. Production is the evidence; check the DB.) ***
--
-- WHY (the P0 this closes)
--   The read-only forensic audit of 2026-08-24 confirmed a structural blindness,
--   not a valuation bug. The capturer can refuse to insert for ONE account on
--   every */15 tick, indefinitely, while:
--     · other accounts keep inserting normally;
--     · the GLOBAL watchdog stays HEALTHY — portfolio_snapshot_health_eval reads
--       max(ts) across ALL users, so one dark account can never move it;
--     · the user's app looks perfectly normal — app.js SALVAGES an orphaned
--       holding (_aurixSalvageHolding) while the capturer counts it as dropped;
--     · nothing anywhere records WHICH account was skipped or WHY: the three
--       silent branches (inactive / empty / incompleteRej) write no row and log
--       no line. Only aggregate counters reach the HTTP response body.
--   Result: an account can be frozen out of server history for weeks with no
--   signal and, for the orphan-holding branch, no self-recovery.
--
-- WHAT THIS IS NOT
--   LB-1 (dropped_asset_count > 0 ⇒ skip the whole insert) is CORRECT and stays
--   untouched: it exists so a partial valuation can never become a false low
--   baseline. This migration does not relax a single gate, does not persist a
--   partial valuation, does not turn an unvalued position into 0 and does not
--   introduce a second source of financial truth. It stores OPERATIONAL state
--   only — outcomes, counters and diagnostics that the capturer already computes
--   and currently throws away.
--
-- WHY CURRENT-STATE AND NOT AN EVENT LOG
--   One row per user, upserted. An append-only event log at */15 would add
--   ~96 rows per user per day forever to answer a question that only ever needs
--   the latest state plus a consecutive-failure counter. The counter carries the
--   duration; the log would carry a retention problem.
--
-- NO RETROACTIVE CAUSE
--   No backfill. A user has no row until the first OBSERVED attempt. The absence
--   of snapshots before this migration is never re-labelled INCOMPLETE (or
--   anything else): the cause of the 2026-08-03 gap is not recoverable and will
--   not be invented. Causes are known from activation forward.
--
-- Idempotent + re-runnable + strictly ADDITIVE: one new table, one new function,
-- one new column on portfolio_snapshot_health, and the two watchdog functions
-- extended by ONE informational field. Touches no existing column of
-- portfolio_snapshots, no existing row, no policy of another table, and leaves
-- the global status classification byte-identical.
--
-- Security (fail-closed, mirrors portfolio_snapshot_health): RLS enabled with NO
-- policy and EXECUTE/SELECT revoked from anon + authenticated ⇒ no client can
-- read any account's operational state, its own included, and no user can ever
-- observe another account. Only postgres (pg_cron) and service_role reach it.
-- No secret is read, stored or logged anywhere in this file.
-- ============================================================================

-- ATOMIC: this file DROPs and recreates portfolio_snapshot_health_eval. Applied in
-- pieces, a failure after the DROP would leave the GLOBAL watchdog dead while its
-- singleton keeps showing the last HEALTHY row — an outage that looks like health.
-- One transaction makes a partial application impossible.
begin;

-- ── 1. Per-user current operational state (one row per user, upserted) ───────
create table if not exists public.portfolio_snapshot_user_health (
  user_id                 uuid        primary key references auth.users (id) on delete cascade,
  last_attempt_at         timestamptz not null,          -- every observed attempt moves this
  last_success_at         timestamptz,                   -- ONLY a real insert moves this. NULL = never observed to succeed
  last_outcome            text        not null,          -- the canonical outcome of the last attempt
  -- Consecutive OBSERVED ATTEMPTS that did not insert — not wall-clock ticks. A
  -- SKIPPED attempt (a snapshot for this minute already existed) also increments it,
  -- as the contract requires, so the counter is a triage signal and `last_success_at`
  -- is the authority on darkness.
  consecutive_non_success int         not null default 0,
  dropped_asset_count     int         not null default 0,-- positions the capturer could not value, last attempt
  -- Positions the attempt actually valued into the total. A COUNT, never an amount.
  -- This is the fact that separates "nothing to capture" from "should have captured
  -- and did not": a liquidated account has 0 (its holdings are qty 0 and the capturer
  -- skips them), while an account holding a position with a missing price has ≥1 —
  -- `Number(null)` is 0, which is FINITE, so that position is not `dropped`, the total
  -- is 0 and the attempt lands in EMPTY carrying no warning whatsoever.
  attempted_positions     int         not null default 0,
  warnings                text[]      not null default '{}', -- normalised operational diagnostics (no payloads)
  last_snapshot_at        timestamptz,                   -- newest snapshot instant KNOWN at attempt time
  updated_at              timestamptz not null default now(),
  -- A small closed vocabulary on purpose: six states answer the operational
  -- question. Twenty would make the counter meaningless and the queries guesswork.
  constraint portfolio_snapshot_user_health_outcome_chk
    check (last_outcome in ('INSERTED','INACTIVE','EMPTY','INCOMPLETE','SKIPPED','ERROR'))
);

comment on table public.portfolio_snapshot_user_health is
  'PER-USER SNAPSHOT CONTINUITY OBSERVABILITY — operational state of the last capture attempt per user. NOT financial data: no amount, no quantity, no price, no balance, no email and no name. `warnings` MAY name the instrument, asset id or currency that blocked a valuation (e.g. unpriced:TSLA) — that is WHAT an account holds, never HOW MUCH, and it is the whole point of the diagnostic; the table is therefore service-role only and must never be exposed to a client. user_id is the only identifier. Written exclusively by the portfolio-snapshot Edge Function via portfolio_snapshot_user_health_upsert, AFTER every financial write of the run.';

comment on column public.portfolio_snapshot_user_health.last_success_at is
  'Instant of the last attempt that actually INSERTED a snapshot. NULL = never observed to succeed since this observability was activated — NEVER evidence that older snapshots did not exist.';

-- Supports the stale-account aggregate below without scanning the table.
create index if not exists portfolio_snapshot_user_health_success_idx
  on public.portfolio_snapshot_user_health (last_success_at);

-- RE-RUNNABLE across revisions of THIS file. `create table if not exists` does nothing
-- when the table already exists from an earlier revision, but `create or replace
-- function` below WOULD install an upsert that writes this column — every flush would
-- then raise 42703, be swallowed by the capturer's catch, and the observability would be
-- dead with every gate green. The additive ALTER closes that gap, exactly as the
-- watchdog column below does.
alter table public.portfolio_snapshot_user_health
  add column if not exists attempted_positions int not null default 0;

alter table public.portfolio_snapshot_user_health enable row level security;
revoke all on public.portfolio_snapshot_user_health from anon, authenticated;
-- No policy is created ⇒ with RLS on, even a GRANT would expose nothing.

-- ── 2. The writer — ONE atomic batch upsert per run ─────────────────────────
-- Takes the whole run as a jsonb array so the capturer makes ONE call, and does
-- the increment/reset IN SQL so no caller has to read-modify-write a counter
-- (which would race two overlapping runs and silently lose failures).
--
-- SUCCESS SEMANTICS, stated once and only here:
--   INSERTED ⇒ last_success_at = now, consecutive_non_success = 0
--   anything else ⇒ last_success_at PRESERVED, consecutive_non_success += 1
create or replace function public.portfolio_snapshot_user_health_upsert(p_rows jsonb)
returns int
language plpgsql security definer
set search_path = public, pg_catalog
as $$
declare
  v_now timestamptz := now();
  v_n   int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then return 0; end if;

  with src as (
    select (e->>'user_id')::uuid                              as user_id,
           upper(e->>'outcome')                               as outcome,
           greatest(coalesce((e->>'dropped')::int, 0), 0)     as dropped,
           greatest(coalesce((e->>'positions')::int, 0), 0)   as positions,
           coalesce((select array_agg(w)
                       from jsonb_array_elements_text(coalesce(e->'warnings', '[]'::jsonb)) w),
                    '{}'::text[])                             as warnings,
           nullif(e->>'snapshot_at', '')::timestamptz         as snapshot_at
      from jsonb_array_elements(p_rows) e
     -- Unknown outcomes are DROPPED, not coerced: a vocabulary this table has not
     -- reviewed must never reach it (the CHECK would abort the whole batch).
     where (e->>'user_id') is not null
       and upper(e->>'outcome') in ('INSERTED','INACTIVE','EMPTY','INCOMPLETE','SKIPPED','ERROR')
       -- PER-ROW RESILIENCE. The FK to auth.users is correct (cascade delete keeps this
       -- table clean), but a single user_portfolios row orphaned from auth.users would
       -- raise 23503 and roll back the ENTIRE chunk — up to 500 innocent accounts would
       -- silently lose their state every tick, and some would then look stale while being
       -- captured perfectly. Filtering here keeps the SPEC.36 promise the capturer already
       -- makes: one bad portfolio never costs the rest.
       and exists (select 1 from auth.users u where u.id = (e->>'user_id')::uuid)
  ), dedup as (
    -- One row per user per batch. A repeated user_id would make ON CONFLICT DO
    -- UPDATE affect the same row twice and abort the statement.
    select distinct on (user_id) * from src order by user_id
  )
  insert into public.portfolio_snapshot_user_health as h (
    user_id, last_attempt_at, last_success_at, last_outcome,
    consecutive_non_success, dropped_asset_count, attempted_positions,
    warnings, last_snapshot_at, updated_at
  )
  select d.user_id,
         v_now,
         case when d.outcome = 'INSERTED' then v_now else null end,
         d.outcome,
         case when d.outcome = 'INSERTED' then 0 else 1 end,
         d.dropped,
         d.positions,
         (d.warnings)[1:12],                     -- belt and braces; the caller already caps
         d.snapshot_at,
         v_now
    from dedup d
  on conflict (user_id) do update set
    last_attempt_at         = v_now,
    last_success_at         = case when excluded.last_outcome = 'INSERTED'
                                  then v_now else h.last_success_at end,
    last_outcome            = excluded.last_outcome,
    consecutive_non_success = case when excluded.last_outcome = 'INSERTED'
                                  then 0 else h.consecutive_non_success + 1 end,
    dropped_asset_count     = excluded.dropped_asset_count,
    attempted_positions     = excluded.attempted_positions,
    warnings                = excluded.warnings,
    -- Preserve the last KNOWN snapshot instant when this attempt learned nothing newer.
    last_snapshot_at        = coalesce(excluded.last_snapshot_at, h.last_snapshot_at),
    updated_at              = v_now;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.portfolio_snapshot_user_health_upsert(jsonb) from public, anon, authenticated;
-- EXPLICIT grant to the ONE caller. Unlike the v1 watchdog functions — invoked by
-- pg_cron as the owner, which always has EXECUTE — this one is called by the Edge
-- Function as `service_role`. Revoking from PUBLIC strips the implicit grant that
-- role inherited, so without this line every flush would return 42501 and the
-- observability would be born dead with every gate green.
grant execute on function public.portfolio_snapshot_user_health_upsert(jsonb) to service_role;

-- ── 3. WATCHDOG V2 — one additive field, same global contract ────────────────
-- The existing global signal is NOT replaced. `status`, its threshold and
-- `portfolio_snapshot_health_classify` are untouched, so HEALTHY / STALE /
-- IDLE_NO_ACTIVE_PORTFOLIOS keep meaning exactly what they meant. What is added
-- is the ONE number the global view structurally could not produce: how many
-- ACTIVE portfolios have no recent successful capture.
alter table public.portfolio_snapshot_health
  add column if not exists stale_active_portfolios int;

comment on column public.portfolio_snapshot_health.stale_active_portfolios is
  'WATCHDOG V2 — active portfolios with an OBSERVED health row whose last successful capture is missing or older than stale_after_minutes. Counts only observed accounts: before a first attempt the cause is unknown, and inferring staleness from absence would be exactly the retroactive fabrication this design refuses. NULL = not yet evaluated by this version.';

-- The return type gains a column, so the function must be dropped first
-- (create or replace cannot change a RETURNS TABLE signature). Idempotent.
drop function if exists public.portfolio_snapshot_health_eval(timestamptz, interval);

create or replace function public.portfolio_snapshot_health_eval(
  p_now         timestamptz default now(),
  p_stale_after interval    default interval '30 minutes'
) returns table (
  status                  text,
  last_snapshot_at        timestamptz,
  lag_minutes             numeric,
  active_portfolios       int,
  stale_after_minutes     numeric,
  stale_active_portfolios int
)
language sql stable security definer
set search_path = public, pg_catalog
as $$
  with a as (
    -- SAME rule as the Edge Function's ACTIVE-ONLY skip (index.ts:248-250). UNCHANGED.
    select count(*)::int n
      from public.user_portfolios up
     where (jsonb_typeof(up.assets)   = 'array' and jsonb_array_length(up.assets)   > 0)
        or (jsonb_typeof(up.holdings) = 'array' and jsonb_array_length(up.holdings) > 0)
  ), s as (
    -- Newest VALID server-side snapshot, GLOBAL. UNCHANGED — this is what `status` reads.
    select max(ts) ts
      from public.portfolio_snapshots
     where source = 'backend_snapshot'
       and total_value_usd > 0
       and ts <= p_now
  ), st as (
    -- NEW: the ONE thing the global view structurally cannot see — an account that
    -- SHOULD have a recent snapshot and does not.
    --
    -- Two ways to get this wrong, and the predicate has to dodge both:
    --
    --   FALSE POSITIVE. Aurix NEVER deletes a fully-sold position — it becomes `closed`
    --   with qty 0 and its asset STAYS in the catalog. A liquidated account therefore
    --   keeps assets[] non-empty ("active"), the capturer skips its zero-quantity
    --   holdings, the total is 0 and last_success_at stays NULL forever. Counting those
    --   would float the metric at N-liquidated-accounts and drown the real signal.
    --
    --   FALSE NEGATIVE. Filtering by last_outcome instead (an earlier attempt at this)
    --   hides the canonical shape of the P0: (a) an account holding a position with a
    --   missing price values it to a FINITE 0, so it is not `dropped`, the total is 0
    --   and it lands in EMPTY with NO warning — an open position, never a snapshot,
    --   invisible; and (b) an account the run never REACHED (a mid-loop death or the
    --   MAX_USERS cap) keeps the previous tick's INSERTED while its success ages, which
    --   is precisely "frozen subset, green global signal".
    --
    -- So the axis is not the outcome. It is: no recent SUCCESS, and this account was
    -- not a legitimate no-op. `attempted_positions` is what makes the distinction
    -- possible — liquidated and genuinely-empty accounts value 0 positions; every
    -- account that had something to capture values at least one or drops at least one.
    -- `last_attempt_at` covers the account that was never even tried.
    --
    -- The join is deliberate — an account with no health row yet is NOT counted, so
    -- activation cannot manufacture a spike out of silence. Same freshness threshold
    -- as the global signal, so there is ONE definition of "recent".
    select count(*)::int n
      from public.user_portfolios up
      join public.portfolio_snapshot_user_health h on h.user_id = up.user_id
     where ((jsonb_typeof(up.assets)   = 'array' and jsonb_array_length(up.assets)   > 0)
         or (jsonb_typeof(up.holdings) = 'array' and jsonb_array_length(up.holdings) > 0))
       and (h.last_success_at is null or p_now - h.last_success_at > p_stale_after)
       and (   p_now - h.last_attempt_at > p_stale_after   -- never even attempted lately
            or h.last_outcome = 'ERROR'                    -- the iteration threw (see below)
            or h.dropped_asset_count > 0                   -- tried, could not value a position
            or h.attempted_positions  > 0)                 -- tried, valued something, still no snapshot
  )
  -- WHY 'ERROR' NEEDS ITS OWN DISJUNCT. It is the only outcome whose counters nobody can
  -- fill: the exception branch runs in a `catch` where the valuation result is out of
  -- scope, so dropped and attempted_positions are both 0 while last_attempt_at stays
  -- fresh every tick. Without this line an account whose iteration throws on every */15
  -- would never insert, never be counted and never move the global signal — the exact P0.
  -- There is no "legitimate no-op" reading of ERROR, so it is sufficient on its own.
  --
  -- KNOWN RESIDUAL, deliberate. `dropped_asset_count > 0` also fires for a LIQUIDATED
  -- account that owns an ORPHANED closed holding: in valueUser the orphan check precedes
  -- the qty check, so a qty-0 holding pointing at a missing catalog asset is dropped and
  -- never reaches the zero-quantity skip. That account has no open position and will
  -- never produce a snapshot, so it is arguably "nothing to capture". It is counted ON
  -- PURPOSE: an orphaned holding is not a clean liquidation, it is a data-shape defect
  -- (the AURIX-DATA-001 family), its `warnings` row names it as orphan_holding:<id>, and
  -- silence about it is what this migration exists to end. Distinguishing it from the
  -- audited victim would need a discriminator valueUser does not persist, and valueUser
  -- is byte-frozen by contract here.
  select public.portfolio_snapshot_health_classify(a.n, s.ts, p_now, p_stale_after),
         s.ts,
         case when s.ts is null then null
              else round((extract(epoch from (p_now - s.ts)) / 60.0)::numeric, 2) end,
         a.n,
         round((extract(epoch from p_stale_after) / 60.0)::numeric, 2),
         st.n
    from a, s, st;
$$;

-- The writer: same singleton, same incident bookkeeping, one extra field stored.
create or replace function public.portfolio_snapshot_health_check()
returns void
language plpgsql security definer
set search_path = public, pg_catalog
as $$
declare
  v_now          timestamptz := now();
  v_status       text;
  v_last         timestamptz;
  v_lag          numeric;
  v_active       int;
  v_thr          numeric;
  v_stale_acc    int;
  v_prev_status  text;
  v_prev_since   timestamptz;
  v_prev_consec  int;
  v_prev_inc_s   timestamptz;
  v_prev_inc_e   timestamptz;
  v_prev_inc_m   numeric;
  v_since        timestamptz;
  v_inc_s        timestamptz;
  v_inc_e        timestamptz;
  v_inc_m        numeric;
begin
  select e.status, e.last_snapshot_at, e.lag_minutes, e.active_portfolios,
         e.stale_after_minutes, e.stale_active_portfolios
    into v_status, v_last, v_lag, v_active, v_thr, v_stale_acc
    from public.portfolio_snapshot_health_eval(v_now) e;

  -- No row on the first ever run ⇒ every v_prev_* stays NULL (safe).
  select h.status, h.stale_since, h.consecutive_stale_checks,
         h.last_incident_started_at, h.last_incident_ended_at, h.last_incident_minutes
    into v_prev_status, v_prev_since, v_prev_consec, v_prev_inc_s, v_prev_inc_e, v_prev_inc_m
    from public.portfolio_snapshot_health h
   where h.id = 1;

  if v_status = 'STALE' then
    v_since := coalesce(v_prev_since, v_now);          -- keep the ORIGINAL start across checks
    v_inc_s := v_since;
    v_inc_e := null;                                    -- incident still OPEN
    v_inc_m := round((extract(epoch from (v_now - v_since)) / 60.0)::numeric, 2);
  elsif v_prev_status = 'STALE' then                    -- recovery edge ⇒ close the incident
    v_since := null;
    v_inc_s := v_prev_since;
    v_inc_e := v_now;
    v_inc_m := round((extract(epoch from (v_now - coalesce(v_prev_since, v_now))) / 60.0)::numeric, 2);
  else                                                  -- steady healthy/idle ⇒ preserve history
    v_since := null;
    v_inc_s := v_prev_inc_s;
    v_inc_e := v_prev_inc_e;
    v_inc_m := v_prev_inc_m;
  end if;

  insert into public.portfolio_snapshot_health (
    id, checked_at, status, last_snapshot_at, lag_minutes, active_portfolios,
    stale_after_minutes, stale_since, consecutive_stale_checks,
    last_incident_started_at, last_incident_ended_at, last_incident_minutes,
    stale_active_portfolios
  ) values (
    1, v_now, v_status, v_last, v_lag, v_active,
    v_thr, v_since,
    case when v_status = 'STALE' then coalesce(v_prev_consec, 0) + 1 else 0 end,
    v_inc_s, v_inc_e, v_inc_m,
    v_stale_acc
  )
  on conflict (id) do update set
    checked_at               = excluded.checked_at,
    status                   = excluded.status,
    last_snapshot_at         = excluded.last_snapshot_at,
    lag_minutes              = excluded.lag_minutes,
    active_portfolios        = excluded.active_portfolios,
    stale_after_minutes      = excluded.stale_after_minutes,
    stale_since              = excluded.stale_since,
    consecutive_stale_checks = excluded.consecutive_stale_checks,
    last_incident_started_at = excluded.last_incident_started_at,
    last_incident_ended_at   = excluded.last_incident_ended_at,
    last_incident_minutes    = excluded.last_incident_minutes,
    stale_active_portfolios  = excluded.stale_active_portfolios;
end;
$$;

-- Fail-closed: unchanged from the v1 watchdog, restated because the signature moved.
revoke all on function public.portfolio_snapshot_health_eval(timestamptz, interval) from public, anon, authenticated;
revoke all on function public.portfolio_snapshot_health_check()                     from public, anon, authenticated;

-- Refresh the singleton immediately so stale_active_portfolios stops being NULL.
select public.portfolio_snapshot_health_check();

commit;

-- ============================================================================
-- Verify (read-only, no PII, no amounts):
--   select * from public.portfolio_snapshot_health;                 -- global + stale_active_portfolios
--   select * from public.portfolio_snapshot_health_eval();          -- current verdict
--   select count(*) from public.portfolio_snapshot_user_health;     -- rows observed so far
--   select last_outcome, count(*) from public.portfolio_snapshot_user_health group by 1 order by 2 desc;
--   -- one account, operational fields only:
--   select last_outcome, last_attempt_at, last_success_at, consecutive_non_success,
--          dropped_asset_count, warnings, last_snapshot_at
--     from public.portfolio_snapshot_user_health where user_id = '<UUID>';
--   -- who is dark, without emails or amounts:
--   select left(user_id::text, 8) as uid, last_outcome, consecutive_non_success,
--          dropped_asset_count, warnings, last_success_at
--     from public.portfolio_snapshot_user_health
--    where last_outcome <> 'INSERTED' order by consecutive_non_success desc limit 20;
--
-- Rollback (removes the observability only; capture, snapshots and the v1 global
-- signal are untouched — re-apply db/portfolio_snapshot_watchdog_1.sql to restore
-- the previous eval/check signature):
--   drop function if exists public.portfolio_snapshot_user_health_upsert(jsonb);
--   drop table    if exists public.portfolio_snapshot_user_health;
--   alter table public.portfolio_snapshot_health drop column if exists stale_active_portfolios;
-- ============================================================================
