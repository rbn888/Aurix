'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-AUTH-POST-LOGIN-BOUNCE-harness — SPEC AUTH.MOBILE.POST-LOGIN-BOUNCE.03
// ════════════════════════════════════════════════════════════════════════════
// After OTP the dashboard paints, then the app must NOT bounce back to login on a spurious late
// null (flaky token refresh / non-auth boot exception / visibility re-check). Proves the single
// guarded redirect owner (aurixScheduleLoginRedirect):
//   - a confirmed session + a transient null → re-checks, no redirect,
//   - a persistent null → redirects after bounded retries,
//   - explicit signOut (force) → redirects immediately,
//   - a session that reappears cancels a pending redirect,
//   - duplicate owners coalesce to ONE redirect,
//   - aurixClearAuthRedirectState clears breaker/timers only (no signOut),
//   - never grants access without a session; never logs a secret.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }

// Extract the single-owner block (helpers + aurixScheduleLoginRedirect + aurixClearAuthRedirectState).
const ownerSrc = app.slice(app.indexOf('let _aurixRecentSessionUntil'), app.indexOf('if (supabaseClient && !window.__AUTH_LISTENER__)'));

// getSessionImpl(callN) → session|null. recent = a session was confirmed within the recent window.
function makeEnv(getSessionImpl, recent) {
  let getCalls = 0;
  const navs = [], cleared = { count: 0 }, timers = new Set();
  const sb = {
    console: { warn() {}, log() {} }, Date, JSON, Math, Promise, Object, Array,
    setTimeout: (fn, ms) => { const id = global.setTimeout(fn, Math.min(ms || 0, 5)); timers.add(id); return id; },   // collapse delays for speed
    clearTimeout: (id) => { global.clearTimeout(id); timers.delete(id); },
    _aurixAuthTrace: () => {},
    _clearLocalUserState: () => { cleared.count++; },
    safeRedirect: (target, reason) => { navs.push({ target, reason }); return true; },
    supabaseClient: { auth: { getSession() { getCalls++; return Promise.resolve({ data: { session: getSessionImpl(getCalls) } }); } } },
    sessionStorage: { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } },
    window: { location: { pathname: '/index.html' } },
  };
  sb.window.aurixClearAuthRedirectState = null;
  vm.createContext(sb);
  vm.runInContext(ownerSrc, sb);
  if (recent) vm.runInContext('_aurixMarkSessionConfirmed();', sb);
  sb.__navs = navs; sb.__cleared = cleared; sb.__getCalls = () => getCalls;
  return sb;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function schedule(sb, reason, opts) { return vm.runInContext('aurixScheduleLoginRedirect(' + JSON.stringify(reason) + ',' + JSON.stringify(opts || {}) + ')', sb); }

(async () => {
  console.log('AURIX-AUTH-POST-LOGIN-BOUNCE — SPEC AUTH.MOBILE.POST-LOGIN-BOUNCE.03\n');

  // 1/5. confirmed session → transient null then session present → NO redirect.
  { const sb = makeEnv(n => (n === 1 ? null : { u: 1 }), true); await schedule(sb, 'auth-event-null'); await sleep(80);
    ok('1 confirmed session + transient null → re-checks, NO redirect', sb.__navs.length === 0, 'navs=' + sb.__navs.length + ' getCalls=' + sb.__getCalls()); }

  // 2. confirmed session → null persists through retries → ONE redirect to login.
  { const sb = makeEnv(() => null, true); await schedule(sb, 'auth-event-null'); await sleep(120);
    ok('2 persistent null after bounded retries → redirect once', sb.__navs.length === 1 && sb.__navs[0].target === 'login.html', 'navs=' + sb.__navs.length); }

  // 3. explicit signOut (force) → immediate redirect, no getSession gate.
  { const sb = makeEnv(() => ({ u: 1 }), true); await schedule(sb, 'signout', { force: true }); await sleep(20);
    ok('3 explicit signOut (force) → immediate redirect even if getSession has a session', sb.__navs.length === 1 && sb.__navs[0].reason === 'signout', 'navs=' + sb.__navs.length + ' getCalls=' + sb.__getCalls()); }

  // 4. pending redirect canceled when session reappears (stale timer).
  { const sb = makeEnv(n => (n >= 2 ? { u: 1 } : null), true); await schedule(sb, 'auth-event-null'); await sleep(120);
    ok('4 session reappears mid-sequence → pending redirect canceled', sb.__navs.length === 0, 'navs=' + sb.__navs.length); }

  // 7. cold no-session (not recent) → single re-check then redirect.
  { const sb = makeEnv(() => null, false); await schedule(sb, 'boot:no-session'); await sleep(60);
    ok('7 cold null (not recent) → redirect after single re-check', sb.__navs.length === 1, 'navs=' + sb.__navs.length + ' getCalls=' + sb.__getCalls()); }

  // 8. duplicate owners → coalesce to ONE redirect.
  { const sb = makeEnv(() => null, true); schedule(sb, 'a'); await schedule(sb, 'b'); await sleep(140);
    ok('8 duplicate redirect owners → one redirect max (coalesced)', sb.__navs.length === 1, 'navs=' + sb.__navs.length); }

  // 9. aurixClearAuthRedirectState cancels a pending redirect + clears breaker, does NOT sign out.
  { const sb = makeEnv(() => null, true); sb.sessionStorage.setItem('aurix_redirect_log', '[1]'); sb.sessionStorage.setItem('aurix_redirect_broken', '{}');
    schedule(sb, 'auth-event-null'); await sleep(2);   // let the guarded sequence reach its pending/timer state
    vm.runInContext('window.aurixClearAuthRedirectState();', sb); await sleep(140);
    ok('9 clearAuthRedirectState cancels pending redirect + clears breaker (no signOut)',
      sb.__navs.length === 0 && sb.sessionStorage.getItem('aurix_redirect_log') === null && sb.sessionStorage.getItem('aurix_redirect_broken') === null && sb.__cleared.count === 0,
      'navs=' + sb.__navs.length + ' cleared=' + sb.__cleared.count); }

  // never grants access without session: when it DOES redirect, it clears local state (genuine logout).
  { const sb = makeEnv(() => null, true); await schedule(sb, 'auth-event-null'); await sleep(120);
    ok('+ genuine redirect clears local user state', sb.__cleared.count === 1, 'cleared=' + sb.__cleared.count); }

  console.log('\nWIRING + PRIVACY (source):');
  ok('single owner: signOut sets _explicitSignOut (force path)', /_explicitSignOut = true;\s*\/\/[^\n]*\n\s*await supabaseClient\.auth\.signOut\(\)/.test(app));
  ok('SIGNED_OUT routed through guarded owner (spurious) + force on explicit', /if \(_explicitSignOut\) \{ _explicitSignOut = false; aurixScheduleLoginRedirect\('onAuthStateChange:SIGNED_OUT', \{ force: true \}\)/.test(app) && /aurixScheduleLoginRedirect\('onAuthStateChange:SIGNED_OUT'\);/.test(app));
  ok('boot exception routed through guarded owner (non-auth error cannot force logout)', /aurixScheduleLoginRedirect\('boot:exception'\)/.test(app));
  ok('boot:no-session routed through guarded owner', /aurixScheduleLoginRedirect\('boot:no-session'\)/.test(app));
  ok('confirmed boot session opens the recent window', /if \(val\) \{ try \{ _aurixMarkSessionConfirmed\(\)/.test(app));
  ok('marker AUTH.MOBILE.POST-LOGIN-BOUNCE.03 present', /AUTH\.MOBILE\.POST-LOGIN-BOUNCE\.03/.test(app));
  ok('window.aurixClearAuthRedirectState exposed', /window\.aurixClearAuthRedirectState = function/.test(app));
  // 10. no secret in any new trace call.
  const traceCalls = (app.match(/_aurixAuthTrace\([^;]*\)/g) || []).map(c => c.replace(/'[^']*'/g, "''"));
  const leak = traceCalls.filter(c => /\b(token|code|email|secret|access_token|refresh_token|password)\b/i.test(c));
  ok('10 no OTP/email/token/secret in any auth trace call', leak.length === 0, leak.length ? leak[0] : ('calls=' + traceCalls.length));

  console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})();
