-- ════════════════════════════════════════════════════════════════════════════
-- AURIX-EMAIL-CAMPAIGN-1 · public.email_campaign_sends  (idempotency ledger)
-- ════════════════════════════════════════════════════════════════════════════
-- One row per (campaign_id, normalized_email) delivery attempt. The send script
-- (scripts/aurix-send-campaign.mjs) checks this table BEFORE sending and records
-- the outcome AFTER the provider confirms — so a re-run never emails an address
-- that already succeeded (idempotent "exactly once" per campaign).
--
-- SECURITY: service_role only (same model as public.waitlist). RLS denies anon /
-- authenticated entirely — this ledger is never exposed to the browser.
--
-- Run once in the Supabase SQL editor (idempotent). No other flow touched.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.email_campaign_sends (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         text        not null,                 -- e.g. aurix_launch_live_2026_07_23
  email               text        not null,                 -- normalized (trim + lowercase)
  status              text        not null,                 -- sent | skipped_duplicate | skipped_suppressed
                                                            -- | skipped_invalid | failed_retryable | failed_permanent
  provider_message_id text,                                 -- Resend id when status='sent'
  error               text,                                 -- reason for failed_* / skipped_*
  created_at          timestamptz not null default now()
);

-- Idempotency key: at most one SUCCESSFUL send per (campaign, email). A partial
-- unique index on status='sent' lets failed/skipped rows be re-attempted while a
-- confirmed 'sent' can never be duplicated.
create unique index if not exists email_campaign_sends_sent_uniq
  on public.email_campaign_sends (campaign_id, email)
  where status = 'sent';

create index if not exists email_campaign_sends_campaign_idx
  on public.email_campaign_sends (campaign_id, created_at desc);

alter table public.email_campaign_sends enable row level security;
-- No policies → anon/authenticated get zero access; service_role bypasses RLS.
