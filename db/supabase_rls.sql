-- ============================================================================
-- SUPABASE-RLS-1 — Row Level Security enforcement
-- ----------------------------------------------------------------------------
-- Apply: paste this whole file into the Supabase SQL editor for the project
-- referenced by SUPABASE_URL in config.js, then run.
-- Idempotent: every CREATE is paired with a DROP IF EXISTS, safe to re-run.
-- ============================================================================
--
-- Audit summary (derived from client code at this commit):
--
--   public.user_portfolios   — per-user portfolio rows. CRUD from app.js.
--                              Owner column: user_id (uuid, auth.users).
--   public.user_onboarding   — per-user onboarding state. select + upsert
--                              from services/onboarding-engine.js.
--                              Owner column: user_id (uuid, auth.users).
--   public.invite_codes      — read pre-auth from login.html with the anon
--                              key. Vulnerable: anyone can `select *` and
--                              enumerate every code. Hardened below.
--
-- Role exposure review:
--
--   anon          — SUPABASE_ANON_KEY ships in config.js (public).
--                   Acceptable for the anon role since RLS is now enforced.
--                   After this migration anon can only:
--                     • call auth endpoints
--                     • execute public.validate_invite_code(text)
--                   Direct table access from anon is denied everywhere.
--
--   authenticated — issued after signInWithOtp / signInWithPassword.
--                   Restricted to its own rows via auth.uid() = user_id.
--
--   service_role  — verified NOT present in client bundle. Grep over the
--                   repo for "service_role" / "SUPABASE_SERVICE" returns
--                   zero hits outside this comment block. Vercel handlers
--                   (api/verify-pin.js) read PIN_HASH only — no Supabase
--                   client there. KEEP IT THAT WAY: service_role bypasses
--                   RLS by design and must never be embedded in client or
--                   public-facing code.
--
-- ============================================================================


-- ── 1. user_portfolios ──────────────────────────────────────────────────────
alter table public.user_portfolios enable row level security;
alter table public.user_portfolios force  row level security;

drop policy if exists "user_portfolios_select_own" on public.user_portfolios;
drop policy if exists "user_portfolios_insert_own" on public.user_portfolios;
drop policy if exists "user_portfolios_update_own" on public.user_portfolios;
drop policy if exists "user_portfolios_delete_own" on public.user_portfolios;

create policy "user_portfolios_select_own"
  on public.user_portfolios
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "user_portfolios_insert_own"
  on public.user_portfolios
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user_portfolios_update_own"
  on public.user_portfolios
  for update
  to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_portfolios_delete_own"
  on public.user_portfolios
  for delete
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.user_portfolios from anon;


-- ── 2. user_onboarding ──────────────────────────────────────────────────────
alter table public.user_onboarding enable row level security;
alter table public.user_onboarding force  row level security;

drop policy if exists "user_onboarding_select_own" on public.user_onboarding;
drop policy if exists "user_onboarding_insert_own" on public.user_onboarding;
drop policy if exists "user_onboarding_update_own" on public.user_onboarding;
drop policy if exists "user_onboarding_delete_own" on public.user_onboarding;

create policy "user_onboarding_select_own"
  on public.user_onboarding
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "user_onboarding_insert_own"
  on public.user_onboarding
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user_onboarding_update_own"
  on public.user_onboarding
  for update
  to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_onboarding_delete_own"
  on public.user_onboarding
  for delete
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.user_onboarding from anon;


-- ── 3. invite_codes (HARDENING) ─────────────────────────────────────────────
-- THREAT before this migration:
--   login.html executes `select * from invite_codes where code = …` with the
--   anon key. Without RLS, anon could `select *` with no filter and dump the
--   whole table (codes, owners, usage). Even with a "code = …" filter and no
--   RLS the entire row is leaked, including used_count and max_uses.
--
-- AFTER this migration:
--   • Direct anon / authenticated access to the table is denied.
--   • The only client-callable surface is the SECURITY DEFINER function
--     public.validate_invite_code(text) which returns ONLY a boolean.
--   • To administer invite codes use the service_role from a server (e.g.
--     a Vercel handler) or the Supabase dashboard.
--
-- CLIENT MIGRATION REQUIRED (separate commit):
--   In login.html, replace
--       client.from('invite_codes').select('*').eq('code', code).single()
--   with
--       client.rpc('validate_invite_code', { p_code: code })
--   and treat the boolean return as the validity flag.

alter table public.invite_codes enable row level security;
alter table public.invite_codes force  row level security;

drop policy if exists "invite_codes_no_client" on public.invite_codes;

-- Refuse everything for both anon and authenticated. service_role bypasses
-- RLS, so admin scripts and serverless handlers using service_role still work.
create policy "invite_codes_no_client"
  on public.invite_codes
  for all
  to anon, authenticated
  using      (false)
  with check (false);

revoke all on public.invite_codes from anon, authenticated;


-- ── 3b. public RPC: validate_invite_code(p_code) ─────────────────────────────
create or replace function public.validate_invite_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ok boolean;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    return false;
  end if;

  select (active and used_count < max_uses)
    into v_ok
    from public.invite_codes
   where code = upper(trim(p_code))
   limit 1;

  return coalesce(v_ok, false);
end;
$$;

revoke all      on function public.validate_invite_code(text) from public;
grant  execute  on function public.validate_invite_code(text) to anon, authenticated;


-- ============================================================================
-- Verification — run these read-only queries after applying the migration:
-- ============================================================================
-- -- RLS flags
-- select tablename, rowsecurity, forcerowsecurity
--   from pg_tables
--  where schemaname = 'public'
--    and tablename in ('user_portfolios','user_onboarding','invite_codes')
--  order by tablename;
--
-- -- Policies
-- select tablename, policyname, cmd, roles, qual, with_check
--   from pg_policies
--  where schemaname = 'public'
--    and tablename in ('user_portfolios','user_onboarding','invite_codes')
--  order by tablename, policyname;
--
-- -- Negative test as anon (should return zero rows / errors):
-- set role anon;
-- select count(*) from public.user_portfolios;
-- select count(*) from public.invite_codes;
-- reset role;
--
-- -- Positive test for the RPC (replace with a real code):
-- select public.validate_invite_code('FOO');
-- ============================================================================
