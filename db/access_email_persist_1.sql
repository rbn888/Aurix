-- ════════════════════════════════════════════════════════════════════════════
-- AURIX-ACCESS-EMAIL-PERSIST-1 · public.persist_access_email(text, text)
-- ════════════════════════════════════════════════════════════════════════════
-- HOTFIX P0 — GUARANTEED CAPTURE OF EVERY ACCESS EMAIL.
--
-- Every valid email entered to access Aurix must be saved IMMEDIATELY into the historical email table
-- (public.waitlist — the card the owner now sees as "correos usuario") BEFORE the OTP is requested, so the
-- address is never lost if the user abandons / the OTP send fails / the code expires / is wrong / the user
-- never verifies. This SECURITY DEFINER RPC is the ONLY public write surface: waitlist RLS denies
-- anon/authenticated (see db/waitlist_1.sql) and the service_role key must NEVER reach the browser. Same
-- hardening model as public.validate_invite_code. login.html calls it before every signInWithOtp.
--
-- REUSES the historical table and its EXISTING `email` UNIQUE constraint — creates NO new table, no parallel
-- source, migrates no data. Idempotent: a new email inserts exactly one neutral row (name '' satisfies the
-- NOT NULL column; status defaults to 'waitlist'); an existing email is left COMPLETELY untouched (no
-- duplicate; no change to name/status/source/created_at/welcome_email_sent_at/notes) → testers / invited /
-- joined / owner rows keep every field and permission. Returns void either way, so it can NEVER be used to
-- enumerate whether an address already exists, read the list, or edit any other row.
--
-- Run once in the Supabase SQL editor (idempotent — safe to re-run). Reversible: see the rollback block.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.persist_access_email(p_email text, p_source text default 'login-otp')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text;
  v_source text;
begin
  -- 1) normalize (trim + lowercase) — comparison AND persistence use the normalized value
  v_email := lower(btrim(coalesce(p_email, '')));

  -- 2) validate format before persisting (mirrors the client regex). Invalid → no row, no side effect.
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  v_source := coalesce(nullif(btrim(p_source), ''), 'login-otp');

  -- 3) idempotent upsert onto the EXISTING `email` UNIQUE constraint. New email → one neutral row.
  --    Existing email → DO NOTHING: never overwrite historical name/status/source/created_at/
  --    welcome_email_sent_at/notes (preserve testers / invited / joined / owner intact).
  insert into public.waitlist (name, email, source, status)
  values ('', v_email, v_source, 'waitlist')
  on conflict (email) do nothing;
end;
$$;

-- Public EXECUTE on the function only (never on the table). anon = pre-auth login; authenticated = re-auth.
revoke all     on function public.persist_access_email(text, text) from public;
grant  execute on function public.persist_access_email(text, text) to anon, authenticated;

-- ── VERIFY (safe; returns nothing, exposes no data) ──────────────────────────
--   select public.persist_access_email('  Test@Example.COM ', 'smoke');  -- inserts test@example.com once
--   select public.persist_access_email('test@example.com',    'smoke');  -- idempotent no-op (no duplicate)
--   -- owner-only (dashboard / service role): exactly ONE row for test@example.com, name '', source 'smoke'.

-- ── ROLLBACK (code-safe; NEVER deletes captured emails) ──────────────────────
--   drop function if exists public.persist_access_email(text, text);
--   -- Dropping the function removes NO waitlist rows. After dropping, redeploy the previous login.html
--   -- (revert the persist-before-OTP commit) so the client stops calling the RPC.
