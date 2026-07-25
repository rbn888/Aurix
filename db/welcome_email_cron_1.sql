-- ============================================================================
-- AURIX-EMAIL-ACTIVATION-1 · scheduler for the automated welcome email
-- ----------------------------------------------------------------------------
-- Drives GET /api/cron/welcome-email (api/cron/welcome-email.js on Vercel) every 15 minutes via
-- pg_cron + pg_net — the SAME mechanism already proven by `aurix-portfolio-snapshot`. This replaces the
-- Vercel-cron path, which needs a Pro plan (a `crons: */15` entry in vercel.json breaks Hobby builds).
--
-- The endpoint is SAFE BY DEFAULT: it returns {disabled:true} and sends nothing until the founder sets
-- WELCOME_CRON_ENABLED=true in the Vercel project env. So applying this file arms only the CLOCK.
--
-- Auth: the endpoint enforces `Authorization: Bearer <CRON_SECRET>` ONLY when CRON_SECRET is set on
-- Vercel. The secret is read here from Supabase Vault (`aurix_welcome_cron_secret`) and NEVER hardcoded.
-- coalesce() keeps the call valid before the secret exists, so ordering of the two steps does not matter.
--
-- Idempotent + re-runnable: unschedules any prior job of the same name before (re)creating it.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Shared secret for the cron→endpoint call. Generated inside the database so the value never transits a
-- shell, a transcript or a file: read it from the Supabase Vault UI and paste it into the Vercel project
-- env as CRON_SECRET. Created only once — re-running this file never rotates a secret already in use.
select vault.create_secret(
         encode(gen_random_bytes(32), 'hex'),
         'aurix_welcome_cron_secret',
         'Bearer token for GET /api/cron/welcome-email — must equal CRON_SECRET in the Vercel project env.')
where not exists (select 1 from vault.secrets where name = 'aurix_welcome_cron_secret');

select cron.unschedule('aurix-welcome-email')
  where exists (select 1 from cron.job where jobname = 'aurix-welcome-email');

-- Every 15 minutes. The endpoint itself owns the 30-minute delay, the WELCOME_FLOOR_AT floor and the
-- once-per-address idempotency (public.email_campaign_sends, campaign 'aurix_welcome_v1').
select cron.schedule(
  'aurix-welcome-email',
  '*/15 * * * *',
  $CRON$
    select net.http_get(
      url     := 'https://isa-portfolio-ten.vercel.app/api/cron/welcome-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(
          (select decrypted_secret from vault.decrypted_secrets where name = 'aurix_welcome_cron_secret'), '')
      ),
      timeout_milliseconds := 60000
    );
  $CRON$
);

-- ── VERIFY ───────────────────────────────────────────────────────────────────
--   select jobname, schedule, active from cron.job where jobname = 'aurix-welcome-email';
--   select status, return_message from cron.job_run_details
--     where jobid = (select jobid from cron.job where jobname='aurix-welcome-email')
--     order by start_time desc limit 5;
--
-- ── ROLLBACK (stops the clock; sends nothing, deletes nothing) ────────────────
--   select cron.unschedule('aurix-welcome-email');
