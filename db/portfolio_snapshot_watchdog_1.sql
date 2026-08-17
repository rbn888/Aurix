-- ============================================================================
-- AURIX-SNAPSHOT-CONTINUITY-WATCHDOG  (SPEC SNAPSHOT-CONTINUITY-WATCHDOG)
-- ----------------------------------------------------------------------------
-- WHY: on 2026-08-16 19:00:06 the scheduler `aurix-portfolio-snapshot` stopped
-- producing snapshots (the P0 auth hardening left the cron sending an obsolete
-- header ⇒ 401 on every tick) and NOTHING noticed for 20,8 h. The capture data
-- was restored at 15:49:16 on 2026-08-17; what stayed open was the DETECTION.
--
-- WHAT: the minimum server-side watchdog. A separate pg_cron job (independent of
-- the snapshot job — a dead job cannot monitor itself) evaluates the freshness of
-- the last VALID server-side snapshot every 5 minutes and keeps one persistent,
-- queryable operational row. It NEVER writes to portfolio_snapshots, never
-- invokes the Edge Function, never touches the */15 cadence or the retention job.
--
-- REUSED (no new infrastructure): pg_cron (already installed by
-- db/portfolio_snapshots_cron_1.sql), the existing portfolio_snapshots table as
-- read-only source of truth, and the SAME active-portfolio rule the Edge Function
-- applies (supabase/functions/portfolio-snapshot/index.ts:248-250:
-- `hasCatalog = assets[] non-empty` OR `hasHoldings = holdings[] non-empty`), so
-- an account base with no active portfolio can never raise a false alarm.
--
-- NOT INCLUDED (deliberate — would need infrastructure/credentials that do not
-- exist in this project): outbound alerting (email / webhook / Slack / PagerDuty).
-- This file leaves the persistent server-side SIGNAL; wiring an external notifier
-- to it stays OPTIONAL and out of scope.
--
-- *** NOT APPLIED FROM THE REPO — same convention as the other db/*.sql files. ***
-- Idempotent + re-runnable + strictly ADDITIVE: creates one table, three
-- functions and one cron job. Touches no existing table, job, policy or column.
--
-- Security (fail-closed): RLS enabled with NO policy and EXECUTE revoked from
-- anon/authenticated ⇒ no client can read the health row or run the functions.
-- Only postgres (pg_cron) and service_role reach it. No secret is read, stored
-- or logged anywhere in this file.
-- ============================================================================

create extension if not exists pg_cron;

-- ── 1. The persistent operational signal (singleton row) ────────────────────
create table if not exists public.portfolio_snapshot_health (
  id                       smallint    primary key default 1 check (id = 1),
  checked_at               timestamptz not null,
  status                   text        not null,   -- HEALTHY | STALE | IDLE_NO_ACTIVE_PORTFOLIOS
  last_snapshot_at         timestamptz,            -- newest valid server-side snapshot
  lag_minutes              numeric,                -- age of that snapshot at check time
  active_portfolios        int         not null,
  stale_after_minutes      numeric     not null,   -- configured threshold (2 full cadences)
  stale_since              timestamptz,            -- set while an interruption is OPEN, null when healthy
  consecutive_stale_checks int         not null default 0,
  last_incident_started_at timestamptz,            -- survives recovery ⇒ the outage stays auditable
  last_incident_ended_at   timestamptz,
  last_incident_minutes    numeric
);

alter table public.portfolio_snapshot_health enable row level security;
revoke all on public.portfolio_snapshot_health from anon, authenticated;

-- ── 2. PURE classifier — the whole decision, fully testable, reads nothing ───
-- Ordered so that requirement "no false positive when there is no legitimate
-- work to do" wins over the freshness test.
create or replace function public.portfolio_snapshot_health_classify(
  p_active      int,
  p_last        timestamptz,
  p_now         timestamptz,
  p_stale_after interval
) returns text
language sql immutable
set search_path = pg_catalog
as $$
  select case
    when coalesce(p_active, 0) = 0        then 'IDLE_NO_ACTIVE_PORTFOLIOS'  -- nothing to capture ⇒ never an alarm
    when p_last is null                   then 'STALE'                      -- active portfolios but no snapshot at all
    when p_now - p_last > p_stale_after   then 'STALE'                      -- > 2 full cadences ⇒ real interruption
    else 'HEALTHY'
  end;
$$;

-- ── 3. READ-ONLY evaluator — gathers the two facts and classifies ────────────
-- Default threshold = 30 min = 2 full */15 cadences. `p_now` is a parameter so
-- both branches can be proven without mutating a single row.
create or replace function public.portfolio_snapshot_health_eval(
  p_now         timestamptz default now(),
  p_stale_after interval    default interval '30 minutes'
) returns table (
  status              text,
  last_snapshot_at    timestamptz,
  lag_minutes         numeric,
  active_portfolios   int,
  stale_after_minutes numeric
)
language sql stable security definer
set search_path = public, pg_catalog
as $$
  with a as (
    -- SAME rule as the Edge Function's ACTIVE-ONLY skip (index.ts:248-250).
    select count(*)::int n
      from public.user_portfolios up
     where (jsonb_typeof(up.assets)   = 'array' and jsonb_array_length(up.assets)   > 0)
        or (jsonb_typeof(up.holdings) = 'array' and jsonb_array_length(up.holdings) > 0)
  ), s as (
    -- Newest VALID server-side snapshot. `ts <= p_now` so a clock-skewed future
    -- row can never mask a real outage. Read-only; the table is never written here.
    select max(ts) ts
      from public.portfolio_snapshots
     where source = 'backend_snapshot'
       and total_value_usd > 0
       and ts <= p_now
  )
  select public.portfolio_snapshot_health_classify(a.n, s.ts, p_now, p_stale_after),
         s.ts,
         case when s.ts is null then null
              else round((extract(epoch from (p_now - s.ts)) / 60.0)::numeric, 2) end,
         a.n,
         round((extract(epoch from p_stale_after) / 60.0)::numeric, 2)
    from a, s;
$$;

-- ── 4. The writer — upserts the singleton, opens/closes incidents ────────────
-- Auto-recovery is structural: STALE→HEALTHY clears `stale_since` and stamps the
-- closed incident, so the interruption stays auditable after the fact.
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
  select e.status, e.last_snapshot_at, e.lag_minutes, e.active_portfolios, e.stale_after_minutes
    into v_status, v_last, v_lag, v_active, v_thr
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
    last_incident_started_at, last_incident_ended_at, last_incident_minutes
  ) values (
    1, v_now, v_status, v_last, v_lag, v_active,
    v_thr, v_since,
    case when v_status = 'STALE' then coalesce(v_prev_consec, 0) + 1 else 0 end,
    v_inc_s, v_inc_e, v_inc_m
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
    last_incident_minutes    = excluded.last_incident_minutes;
end;
$$;

-- Fail-closed: no client may read the signal or run the checks.
revoke all on function public.portfolio_snapshot_health_classify(int, timestamptz, timestamptz, interval) from public, anon, authenticated;
revoke all on function public.portfolio_snapshot_health_eval(timestamptz, interval)                        from public, anon, authenticated;
revoke all on function public.portfolio_snapshot_health_check()                                            from public, anon, authenticated;

-- ── 5. The independent schedule ─────────────────────────────────────────────
-- Every 5 min ⇒ a real interruption is recorded within 5 min of crossing the
-- 30-min threshold. Two bounded aggregates per run; no HTTP, no secret, no write
-- outside the singleton. Idempotent: unschedule any prior job of the same name.
select cron.unschedule('aurix-portfolio-snapshot-watchdog')
  where exists (select 1 from cron.job where jobname = 'aurix-portfolio-snapshot-watchdog');

select cron.schedule(
  'aurix-portfolio-snapshot-watchdog',
  '*/5 * * * *',
  $WD$ select public.portfolio_snapshot_health_check(); $WD$
);

-- Seed the row immediately so the signal exists before the first scheduled run.
select public.portfolio_snapshot_health_check();

-- Verify:
--   select * from public.portfolio_snapshot_health;                          -- the operational signal
--   select * from public.portfolio_snapshot_health_eval();                   -- current verdict (read-only)
--   select * from public.portfolio_snapshot_health_eval(now() + interval '31 minutes');   -- proves the STALE branch
--   select jobname, schedule, active from cron.job where jobname like 'aurix-portfolio-snapshot%';
-- Rollback (removes the watchdog only; capture and retention untouched):
--   select cron.unschedule('aurix-portfolio-snapshot-watchdog');
--   drop function if exists public.portfolio_snapshot_health_check();
--   drop function if exists public.portfolio_snapshot_health_eval(timestamptz, interval);
--   drop function if exists public.portfolio_snapshot_health_classify(int, timestamptz, timestamptz, interval);
--   drop table if exists public.portfolio_snapshot_health;
