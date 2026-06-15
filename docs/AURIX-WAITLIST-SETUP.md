# AURIX Waitlist + Welcome Email — Setup & Operations

This document is the founder checklist to activate the Request Access → waitlist
→ welcome email pipeline. The **code** is in place; the steps below are the
**manual configuration** that only you can do (Supabase, Vercel, Resend). Nothing
is deployed automatically.

Architecture: landing form → `POST /api/waitlist` (Vercel) → insert into Supabase
`public.waitlist` with the service-role key (server-side) → one welcome email via
Resend. The table is RLS-locked; the public key can't read or write it.

---

## 1. Create the waitlist table (Supabase)
Run `db/waitlist_1.sql` once in **Supabase → SQL Editor**. It creates
`public.waitlist` (`id, name, email UNIQUE, created_at, locale, source,
status='waitlist', welcome_email_sent_at, notes`) and deny-all RLS (writes happen
only through the service role). Idempotent — safe to re-run.

The welcome email is sent only when `welcome_email_sent_at IS NULL` and the column
is stamped afterward, so each address receives **exactly one** welcome email.

## 2. Set Vercel environment variables
Project: **isa-portfolio-ten** (the backend at `isa-portfolio-ten.vercel.app`).
Vercel → Settings → Environment Variables (Production + Preview):

| Variable | Required | Value |
|---|---|---|
| `SUPABASE_URL` | optional | `https://ozcasyufbknnuemllwso.supabase.co` (defaulted in code; set to be explicit) |
| `SUPABASE_SERVICE_ROLE_KEY` | **required** | Supabase → Settings → API → `service_role` secret. **Server-only — never put in client code.** |
| `RESEND_API_KEY` | for email | Resend API key (see step 3). If unset, leads are still stored; the email is skipped. |
| `WAITLIST_FROM` | optional | e.g. `Aurix <hello@aurixsystem.io>` (must be a Resend-verified domain) |
| `WAITLIST_ALLOWED_ORIGINS` | optional | CORS allowlist; defaults to `https://aurixsystem.io,https://www.aurixsystem.io,https://rbn888.github.io` |

After setting vars, redeploy the Vercel project so the function picks them up.

## 3. Email provider (Resend)
1. Create a Resend account and **verify the `aurixsystem.io` domain** (DNS records).
2. Create an API key → set `RESEND_API_KEY` in Vercel.
3. Set `WAITLIST_FROM` to a from-address on the verified domain.
- Until this is done, lead capture works (priorities 1–4); the welcome email
  (priority 6) is simply skipped and logged. No code change needed to turn it on.
- This is independent from Supabase Auth's OTP/login emails (those already work,
  sent by Supabase's own mailer).

## 4. Verify end-to-end (after deploy)
1. On the landing, submit Request Access → expect "Request received. We'll be in touch."
2. Supabase → Table editor → `waitlist` → the row appears (name, email, locale, source=landing, status=new).
3. Inbox receives the welcome email (once Resend is configured).
4. Submit the same email again → still success, **no duplicate row, no second email**.

## 5. Managing the waitlist (no admin panel needed yet)
Use **Supabase → Table editor → `waitlist`**:
- View leads (newest first via the `created_at` index).
- Edit `status` (`new → invited → joined → archived`).
- **Export → CSV** for the full list.
A dedicated Founder Admin Panel is intentionally **not** built — revisit only if
volume/workflow outgrows the dashboard.

## 6. Language consistency (handled in code)
- The landing passes `?lang=en|es` on every "Enter Aurix" link.
- `login.html` and `index.html` read `?lang=` → persist to `localStorage.portfolio_lang`
  → render in that language (login.html is now fully bilingual; the old hardcoded
  Spanish is gone).
- Cross-origin note: `aurixsystem.io` and the app origin don't share localStorage,
  so the `?lang=` param is the handoff.

> Out of scope (still Spanish): `reset.html` / `reset-password.html` are not part of
> the Request Access / OTP login flow. Localize later if needed.

## Security notes
- `SUPABASE_SERVICE_ROLE_KEY` lives only in Vercel env and is used server-side in
  `api/waitlist.js`. It is never shipped to the browser. The `waitlist` table RLS
  denies the public key entirely.
- The endpoint is origin-checked (CORS allowlist), JSON-only, size-capped (2KB),
  validates name/email/locale/source, and is rate-limited to **5 submissions per
  IP per hour** (best-effort in-memory, per serverless instance — same pattern as
  `api/verify-pin.js`). Over the limit returns HTTP 429 `{ ok:false,
  error:'rate_limited' }`; the landing shows a friendly "too many attempts" note.
- Optional future hardening if abused: a CAPTCHA / shared-store rate limit.
