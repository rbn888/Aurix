-- ============================================================================
-- AURIX-CHART-CONTINUOUS-SERVER-SNAPSHOTS  (DSH.CHART.CONTINUOUS_SERVER_SNAPSHOTS.36)
-- ----------------------------------------------------------------------------
-- The SCHEDULER that makes portfolio history advance WHILE THE APP IS CLOSED. It invokes the deploy-ready
-- Edge Function `portfolio-snapshot` (supabase/functions/portfolio-snapshot/index.ts) every 15 minutes via
-- pg_cron + pg_net. Idempotent + re-runnable: unschedules any prior job of the same name before (re)creating it.
--
-- *** NOT APPLIED FROM THE REPO — run once in the Supabase SQL editor of the linked project at ACTIVATION. ***
-- Prerequisites (all external, founder-run — see docs/AURIX-CHART-BACKEND-SNAPSHOTS-V1.md):
--   1. db/portfolio_snapshots_1.sql applied (creates the append-only table + unique idempotency index).
--   2. Edge Function deployed:  supabase functions deploy portfolio-snapshot --project-ref <ref>
--      (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are platform-injected into the function env; never in code.)
--   3. Vault secret `aurix_snapshot_invoke_key` = an invocation key (anon or service_role) so pg_net's POST is
--      accepted by the Functions gateway. The key is read from Vault here — NEVER hardcoded in this file.
--
-- Security: the invocation key lives ONLY in Supabase Vault. The function itself uses the service-role env
-- (platform-injected) to write portfolio_snapshots; this migration only *triggers* it on a schedule.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent: drop any prior schedule of this name so re-applying this file never stacks duplicate jobs.
select cron.unschedule('aurix-portfolio-snapshot')
  where exists (select 1 from cron.job where jobname = 'aurix-portfolio-snapshot');

-- Every 15 minutes, POST the Edge Function. bounded timeout; Authorization pulled from Vault (no secret here).
select cron.schedule(
  'aurix-portfolio-snapshot',
  '*/15 * * * *',
  $CRON$
    select net.http_post(
      url     := 'https://ozcasyufbknnuemllwso.functions.supabase.co/portfolio-snapshot',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'aurix_snapshot_invoke_key')
      ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $CRON$
);

-- Nightly retention thinning (idempotent): keep full-resolution for 35 days, then one row per user per day.
-- Non-destructive to recent data; keeps the table bounded over months/years of continuous capture.
select cron.unschedule('aurix-portfolio-snapshot-retention')
  where exists (select 1 from cron.job where jobname = 'aurix-portfolio-snapshot-retention');

select cron.schedule(
  'aurix-portfolio-snapshot-retention',
  '17 3 * * *',                         -- 03:17 UTC daily (off-peak)
  $RET$
    delete from public.portfolio_snapshots s
    using (
      select id, row_number() over (partition by user_id, date_trunc('day', ts) order by ts desc) rn
      from public.portfolio_snapshots
      where ts < now() - interval '35 days'
    ) d
    where s.id = d.id and d.rn > 1;
  $RET$
);

-- Verify:
--   select jobname, schedule, active from cron.job where jobname like 'aurix-portfolio-snapshot%';
--   select * from cron.job_run_details order by start_time desc limit 10;   -- run history (success/failure)
-- Rollback (stop the scheduler, keep captured data):
--   select cron.unschedule('aurix-portfolio-snapshot');
--   select cron.unschedule('aurix-portfolio-snapshot-retention');
