-- ============================================================================
-- AURIX-FOUNDER-READ-1 · agregados para la frontera de lectura Founder
-- public.founder_read_overview()  +  public.founder_read_health()
-- ----------------------------------------------------------------------------
-- Apply: paste this whole file into the Supabase SQL editor of the project
-- referenced by SUPABASE_URL in config.js, then run.
-- *** NOT APPLIED FROM THE REPO — same convention as the other db/*.sql files.
--     (This header states how the file is DELIVERED, never what production
--     currently contains. Production is the evidence; check the DB.) ***
--
-- WHY THIS EXISTS
--   Founder Platform observes Aurix through a narrow read contract. Two of the
--   facts it needs cannot be read any other way:
--     · `auth.users` is not reachable through PostgREST — only a SECURITY
--       DEFINER function can count it;
--     · the operational tables (portfolio_snapshot_health, …_user_health) are
--       service-role only by design.
--   These two functions do the counting WHERE THE DATA LIVES and return only
--   numbers, timestamps and statuses. One call per Founder endpoint: one round
--   trip, no N+1, no duplicated computation.
--
-- WHAT THIS IS NOT
--   Not a second source of truth: every value is a COUNT or a passthrough of a
--   row the watchdog already wrote. No financial rule, no access rule, no
--   valuation, no derived business metric. Nothing is stored: both functions
--   are `stable` and write nothing.
--
-- PRIVACY — THE POINT OF THE WHOLE FILE
--   No email, no name, no user_id, no holding, no symbol, no per-user value, no
--   capital flow, and NOT the `warnings` text of portfolio_snapshot_user_health
--   (it names the instrument that blocked a valuation — that is WHAT an account
--   holds). Only aggregates leave Postgres, so the API layer has no PII to leak
--   even by accident.
--
-- MONETIZATION IS ABSENT ON PURPOSE
--   `user_portfolios.subscription` is client-declared prelaunch state
--   (ENFORCE_ENTITLEMENTS = false), not commercial truth. It is NOT read here.
--
-- SECURITY (fail-closed, mirrors portfolio_snapshot_health)
--   SECURITY DEFINER + fixed search_path. EXECUTE is REVOKED from anon and
--   authenticated: only service_role (the Aurix server) can call these. A
--   browser holding the publishable key gets `42501`, exactly as it does today
--   for the underlying tables. No secret is read, stored or logged here.
--
-- RESILIENCE
--   The watchdog row is read as jsonb (`to_jsonb`) and its fields are picked by
--   key, so a future added/renamed column can never make this function error:
--   an absent key yields null, and Founder renders "no disponible" instead of a
--   fabricated zero.
--
-- Idempotent + re-runnable + strictly ADDITIVE: two new functions. No table, no
-- column, no policy, no existing object is touched.
-- ============================================================================

-- ── 1. Overview: users · funnel · health summary ────────────────────────────
create or replace function public.founder_read_overview()
returns jsonb
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
  with h as (
    -- Fila singleton del watchdog, como jsonb: robusto a cambios de columnas.
    select to_jsonb(x) j from public.portfolio_snapshot_health x where x.id = 1
  ), leads as (
    -- Tabla histórica de captación (renombrada por el propietario desde
    -- `waitlist`; identificador citado con mayúscula y espacio).
    select
      count(*)::int                                                              as total,
      count(*) filter (where status = 'waitlist')::int                           as waitlist,
      count(*) filter (where status = 'invited')::int                            as invited,
      count(*) filter (where status = 'joined')::int                             as joined,
      count(*) filter (where status = 'archived')::int                           as archived,
      count(*) filter (where welcome_email_sent_at is not null)::int             as welcomed
    from public."Correos usuario"
  )
  select jsonb_build_object(
    'available', true,
    'users', jsonb_build_object(
      'available',  true,
      -- Identidades reales de Supabase Auth. Recuento, jamás filas.
      'registered', (select count(*)::int from auth.users),
      'newLast7d',  (select count(*)::int from auth.users where created_at >= now() - interval '7 days'),
      'newLast30d', (select count(*)::int from auth.users where created_at >= now() - interval '30 days'),
      -- MISMA regla ACTIVE-ONLY que el capturador y portfolio_snapshot_health_eval.
      -- Se toma del watchdog cuando existe (ya calculada, as-of checkedAt); si no,
      -- se cuenta aquí con la regla idéntica, nunca con otra definición.
      'activePortfolios', coalesce(
        (select (j->>'active_portfolios')::int from h),
        (select count(*)::int from public.user_portfolios up
          where (jsonb_typeof(up.assets)   = 'array' and jsonb_array_length(up.assets)   > 0)
             or (jsonb_typeof(up.holdings) = 'array' and jsonb_array_length(up.holdings) > 0))
      ),
      'accountsWithState', (select count(*)::int from public.user_portfolios)
    ),
    'funnel', (
      select jsonb_build_object(
        'available', true,
        'leadsTotal', total, 'waitlist', waitlist, 'invited', invited,
        'joined', joined, 'archived', archived, 'welcomeEmailsSent', welcomed
      ) from leads
    ),
    'health', coalesce(
      (select jsonb_build_object(
         'available',             true,
         'status',                j->>'status',
         'checkedAt',             j->>'checked_at',
         'lastSnapshotAt',        j->>'last_snapshot_at',
         'lagMinutes',            (j->>'lag_minutes')::numeric,
         -- Campo informativo añadido por la observabilidad per-usuario. Si el
         -- proyecto no lo tiene todavía, viaja como null (no como 0).
         'staleActivePortfolios', (j->>'stale_active_portfolios')::int,
         'incidentOpen',          (j->>'stale_since') is not null
       ) from h),
      jsonb_build_object('available', false, 'reason', 'watchdog_never_checked')
    )
  );
$$;

comment on function public.founder_read_overview() is
  'AURIX-FOUNDER-READ-1 — aggregates for GET /api/read/overview (contract aurix.read.v1). Counts only: no email, no name, no user_id, no holding, no symbol, no per-user value, no subscription. service_role only.';

-- ── 2. Health: watchdog · integrity · continuity ────────────────────────────
create or replace function public.founder_read_health()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with h as (
    select to_jsonb(x) j from public.portfolio_snapshot_health x where x.id = 1
  ), dupes as (
    -- Chequeo determinista del invariante de idempotencia: como máximo un
    -- snapshot por (usuario, minuto). El índice único es el suelo duro; esto
    -- lo OBSERVA sin volver a implementarlo.
    select coalesce(max(c), 0)::int m from (
      select count(*) c
        from public.portfolio_snapshots
       where source = 'backend_snapshot'
       group by user_id, date_trunc('minute', ts)
    ) g
  ), integ as (
    select
      count(*)::int                                                                   as total,
      count(*) filter (where total_value_usd is null or total_value_usd <= 0)::int    as bad
    from public.portfolio_snapshots
   where source = 'backend_snapshot'
  ), cont as (
    select
      count(*)::int                                                                   as accounts,
      count(*) filter (where last_outcome = 'INSERTED')::int                          as inserted,
      count(*) filter (where last_outcome = 'INACTIVE')::int                          as inactive,
      count(*) filter (where last_outcome = 'EMPTY')::int                             as empty,
      count(*) filter (where last_outcome = 'INCOMPLETE')::int                        as incomplete,
      count(*) filter (where last_outcome = 'SKIPPED')::int                           as skipped,
      count(*) filter (where last_outcome = 'ERROR')::int                             as errored,
      count(*) filter (where last_success_at is null
                          or last_success_at < now() - interval '24 hours')::int      as dark_over_24h
    from public.portfolio_snapshot_user_health
  )
  select jsonb_build_object(
    'available', true,
    'watchdog', coalesce(
      (select jsonb_build_object(
         'available',              true,
         'status',                 j->>'status',
         'checkedAt',              j->>'checked_at',
         'lastSnapshotAt',         j->>'last_snapshot_at',
         'lagMinutes',             (j->>'lag_minutes')::numeric,
         'staleAfterMinutes',      (j->>'stale_after_minutes')::numeric,
         'staleSince',             j->>'stale_since',
         'consecutiveStaleChecks', (j->>'consecutive_stale_checks')::int,
         'activePortfolios',       (j->>'active_portfolios')::int,
         'staleActivePortfolios',  (j->>'stale_active_portfolios')::int,
         'incidentOpen',           (j->>'stale_since') is not null,
         'lastIncidentStartedAt',  j->>'last_incident_started_at',
         'lastIncidentEndedAt',    j->>'last_incident_ended_at',
         'lastIncidentMinutes',    (j->>'last_incident_minutes')::numeric
       ) from h),
      jsonb_build_object('available', false, 'reason', 'watchdog_never_checked')
    ),
    'integrity', (
      select jsonb_build_object(
        'available', true,
        'snapshotsTotal', integ.total,
        'nonPositiveOrNullTotals', integ.bad,
        'maxDuplicatesPerUserMinute', dupes.m
      ) from integ, dupes
    ),
    'continuity', (
      select jsonb_build_object(
        'available', true,
        'accountsObserved', accounts,
        'byOutcome', jsonb_build_object(
          'INSERTED', inserted, 'INACTIVE', inactive, 'EMPTY', empty,
          'INCOMPLETE', incomplete, 'SKIPPED', skipped, 'ERROR', errored
        ),
        'accountsDarkOver24h', dark_over_24h
      ) from cont
    )
  );
$$;

comment on function public.founder_read_health() is
  'AURIX-FOUNDER-READ-1 — aggregates for GET /api/read/health (contract aurix.read.v1). Watchdog passthrough + integrity counters + per-account continuity AGGREGATED BY OUTCOME. Never returns user_id, warnings text, holdings, symbols or amounts. service_role only.';

-- ── 3. Fail-closed: solo el servidor de Aurix puede llamarlas ───────────────
revoke all on function public.founder_read_overview() from public, anon, authenticated;
revoke all on function public.founder_read_health()   from public, anon, authenticated;
grant execute on function public.founder_read_overview() to service_role;
grant execute on function public.founder_read_health()   to service_role;

-- ============================================================================
-- Verification — run after applying (expect one jsonb row each):
-- ============================================================================
-- select public.founder_read_overview();
-- select public.founder_read_health();
--
-- And confirm the boundary is closed for clients (expect: no rows / denied):
-- select has_function_privilege('anon',          'public.founder_read_overview()', 'execute');
-- select has_function_privilege('authenticated', 'public.founder_read_health()',   'execute');
-- ============================================================================
-- Rollback (removes the Founder read aggregates; touches nothing else):
-- ============================================================================
-- drop function if exists public.founder_read_overview();
-- drop function if exists public.founder_read_health();
-- ============================================================================
