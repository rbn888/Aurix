# AURIX — Mobile Login Stability (P0 protected invariant)

**Status:** ACCEPTED on a real iPhone at **v478** — `invite → email → OTP → dashboard → stays in`.
This is a **protected P0 production invariant**. Future chart / UI / backend / routing / cache / Pages /
refactor work must prove it does not break this flow. Frozen by
`docs/AURIX-AUTH-MOBILE-STABILITY-FREEZE-harness.js` (+ the two sibling auth harnesses).

## Symptoms seen (and now fixed)
1. **Invite code sometimes did not reveal the email step.**
2. **Send-code spinner could hang forever** (a stalled Supabase auth fetch had no timeout).
3. **OTP accepted but the app did not enter** — navigated to `index.html` before the session was
   readable, so the index read `null` and bounced back to login.
4. **Dashboard briefly painted, then bounced out** — a late redirect owner logged a still-valid
   session out (a spurious `SIGNED_OUT`, or a **non-auth boot/render exception** wrongly treated as logout).

## Root causes
- **No session confirmation before navigation:** login treated `verifyOtp` no-error as sufficient.
- **Index cold-boot race:** `waitForSession` finished `null` on the first `INITIAL_SESSION`/`getSession`
  read, before the just-written session had hydrated.
- **Multiple redirect owners:** the verify handler + a load-time `SIGNED_IN` listener both navigated.
- **Boot `try/catch` redirected to login on ANY exception** — not proof of a lost session.

## Fixes shipped
**v477 — `AUTH.MOBILE.OTP.E2E.02`** (`login.html` + `app.js`)
- `login.html`: after `verifyOtp` no-error, **confirm a real session** (returned session OR
  `getSession` with a bounded ~2.4s grace for `SIGNED_IN` / storage flush) **before** navigating;
  no session ⇒ recoverable error, spinner cleared, **no redirect**. **One navigation owner**
  (`window.location.replace`); the load-time listener is guarded by `_otpVerifyNavInProgress`.
- `app.js`: `waitForSession` gained a **bounded hydration grace** (re-check `getSession` up to ~1.5s;
  a `SIGNED_IN` wins immediately) before declaring logged-out.
- Preserved the v-earlier `_authWithTimeout` (bounded send/verify so the spinner always closes).

**v478 — `AUTH.MOBILE.POST-LOGIN-BOUNCE.03`** (`app.js`)
- **Single guarded login-redirect owner** `aurixScheduleLoginRedirect(reason, { force })`:
  - `force` (explicit user sign-out) → redirect immediately;
  - otherwise → `getSession` first; a present session cancels the bounce. If null **and** a session was
    confirmed within the recent 10s window → re-check on a bounded `300/800/1500ms` sequence; a session
    that reappears **cancels** the pending redirect; only redirect (clearing local state) if still null.
  - **Coalesced** (one pending sequence); never infinite; never grants access without a session.
- Wiring: `signOut()` sets `_explicitSignOut` (force). Global `SIGNED_OUT` → guarded owner (force only on
  explicit). `SIGNED_IN`/`TOKEN_REFRESHED` → mark confirmed + cancel pending. `waitForSession` opens the
  recent window on a confirmed boot session. **Boot no-session + boot exception → guarded owner** (a
  non-auth boot exception with a valid session no longer logs the user out).

## Invariants future changes MUST preserve
- **A. Invite:** valid invite/secret → email step becomes available.
- **B. Send:** `signInWithOtp` is bounded; busy state always closes; OTP step on success; visible
  recoverable error on failure.
- **C. Verify:** never navigate merely because `verifyOtp` error is null — **confirm a session first**
  (returned OR bounded `getSession`/auth-event); no confirmed session ⇒ no redirect.
- **D. Navigate:** confirmed session → **exactly one** navigation owner (`window.location.replace`).
- **E. Index hydration:** an initial transient null gets a bounded grace to recover; only a persistent
  null redirects.
- **F. Post-login stability:** a recently-confirmed session cannot be expelled by a single late
  null/`SIGNED_OUT` transient — bounded re-check; a recovered session cancels the pending redirect; a
  persistent null redirects; **explicit logout redirects immediately**.
- **G. Boot exceptions:** a non-auth boot/render/chart exception must **not** auto-logout; only a proven
  missing/invalid session may trigger a login redirect.

## Debug / rollback commands (privacy-safe)
- `aurixAuthDebug()` / `copy(aurixAuthDebugExport())` — the bounded, privacy-safe auth trace
  (stages, booleans, error class, pathname, platform slice, visibility). Survives login→index (same tab).
- `aurixClearAuthRedirectState()` — clears ONLY the redirect loop breaker / pending guarded timer.
  **Does not sign out and does not delete the Supabase session.**
- `aurixBootDiagnostic()` — served/expected version, redirect count, auth gate state, storage keys, SW/caches.

## PRIVACY RULE (hard)
The auth trace and all diagnostics **NEVER** record an **OTP token, invite secret, full email, access
token, refresh token, or auth header** — only booleans / stage names / error class / pathname / platform
slice / visibility / event name / `storageKeyPresent`. Any new trace call must obey this (enforced by the
freeze harness).

## Guarding tests
- `docs/AURIX-AUTH-MOBILE-OTP-E2E-harness.js` — verify→confirm→single-nav + index grace + privacy.
- `docs/AURIX-AUTH-POST-LOGIN-BOUNCE-harness.js` — guarded single redirect owner.
- `docs/AURIX-AUTH-MOBILE-STABILITY-FREEZE-harness.js` — this freeze (contract + behaviour + markers + privacy + siblings).
- `docs/AURIX-ROUTING-CACHE-STABILITY-harness.js` — loop breaker + version sync.

> Note: acceptance is one confirmed real-device login. Treat the flow as protected; do not claim
> "never fails" — keep the harnesses green and re-verify on device after any auth-adjacent change.
