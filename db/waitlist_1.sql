-- ════════════════════════════════════════════════════════════════════════════
-- AURIX-WAITLIST-1 · public.waitlist
-- ════════════════════════════════════════════════════════════════════════════
-- Source of truth for every "Request Access" lead captured on the landing.
--
-- ARCHITECTURE
--   • The landing form POSTs to the Vercel handler /api/waitlist.
--   • That handler inserts here using the SUPABASE service_role key (server-side
--     only — never shipped to the browser). service_role bypasses RLS.
--   • RLS denies ALL direct access to anon/authenticated, so the public
--     (publishable/anon) key in config.js can neither read nor write this table.
--     Same hardening model as public.invite_codes.
--
-- WELCOME EMAIL
--   • Exactly one transactional welcome email per address. The handler sends it
--     only when welcome_email_sent_at IS NULL, then stamps it — so it is never
--     sent twice. Supabase Auth OTP emails are a SEPARATE system (auth only).
--
-- ADMIN (Phase 7)
--   • View / search / export leads via Supabase dashboard → Table editor →
--     waitlist → "Export to CSV". No custom admin panel for the initial waitlist.
--
-- Run this once in the Supabase SQL editor (idempotent).
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.waitlist (
  id                    uuid primary key default gen_random_uuid(),
  name                  text        not null,
  email                 text        not null unique,
  created_at            timestamptz not null default now(),
  locale                text        default 'en',        -- 'en' | 'es'
  source                text        default 'landing',
  status                text        default 'waitlist',  -- waitlist | invited | joined | archived
  welcome_email_sent_at timestamptz,                     -- null until the one welcome email is sent
  notes                 text                              -- nullable, manual ops notes
);

-- Helps the dashboard list newest-first.
create index if not exists waitlist_created_at_idx
  on public.waitlist (created_at desc);

-- ── RLS: deny all client access (writes happen via service_role only) ────────
alter table public.waitlist enable row level security;
alter table public.waitlist force  row level security;

drop policy if exists "waitlist_no_client" on public.waitlist;

create policy "waitlist_no_client"
  on public.waitlist
  for all
  to anon, authenticated
  using      (false)
  with check (false);

revoke all on public.waitlist from anon, authenticated;
