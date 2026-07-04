'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-AUTH-MOBILE-OTP-E2E-harness — SPEC AUTH.MOBILE.OTP.E2E.02
// ════════════════════════════════════════════════════════════════════════════
// Proves the mobile OTP handoff is truthful:
//   - login.html confirms a REAL session (returned OR getSession, bounded grace) BEFORE navigating,
//     never redirects into a null session, uses ONE navigation owner (location.replace),
//   - app.js waitForSession applies a BOUNDED hydration grace (re-checks getSession) so a transient
//     null right after verify does not bounce the user back to login,
//   - the auth trace is privacy-safe (no OTP / email / token / secret in any trace call).
// Behavioural (vm) test of waitForSession + source-contract assertions for login.html.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const login = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }

// ── extract waitForSession (+ trace helpers) from app.js ──
const waitSrc = app.slice(app.indexOf('const waitForSession'), app.indexOf('const ensureSession'));

function runWaitForSession(seq) {
  // seq: { initialSession, getSession(callN)->session|null, signedInAfterMs, signedInSession }
  let cb = null, getCalls = 0, resolved = { done: false, val: undefined };
  const sb = {
    console: { warn() {}, log() {} }, Date, JSON, Math, Promise, setTimeout, clearTimeout, Object, Array, RegExp,
    IS_DEV: false,
    sessionStorage: { getItem: () => '[]', setItem() {}, removeItem() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {}, },
    location: { pathname: '/index.html' }, navigator: { userAgent: 'iPhone test' }, document: { visibilityState: 'visible' },
    _aurixAuthTrace: () => {}, _aurixAuthStorageKeyPresent: () => true,
    supabaseClient: {
      auth: {
        onAuthStateChange(fn) {
          cb = fn;
          setTimeout(() => { try { fn('INITIAL_SESSION', seq.initialSession || null); } catch (_) {} }, 0);
          if (seq.signedInAfterMs != null) setTimeout(() => { try { fn('SIGNED_IN', seq.signedInSession || null); } catch (_) {} }, seq.signedInAfterMs);
          return { data: { subscription: { unsubscribe() {} } } };
        },
        getSession() { getCalls++; const s = seq.getSession ? seq.getSession(getCalls) : null; return Promise.resolve({ data: { session: s } }); },
      },
    },
    __getCalls: () => getCalls,
  };
  // Object.keys used by storage-key helper — ensure localStorage keys enumerable (not needed here; helper stubbed).
  vm.createContext(sb);
  vm.runInContext(waitSrc + '\n; globalThis.__wfs = waitForSession;', sb);
  return sb.__wfs();
}
function withTimeout(p, ms) { return Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('harness-timeout')), ms))]); }

(async () => {
  console.log('AURIX-AUTH-MOBILE-OTP-E2E — SPEC AUTH.MOBILE.OTP.E2E.02\n');

  console.log('INDEX BOOT GRACE (app.js waitForSession):');
  // 6. initial null → session hydrates on a later getSession → app ENTERS.
  { const S = { user: 'u' }; const r = await withTimeout(runWaitForSession({ initialSession: null, getSession: n => (n >= 2 ? S : null) }), 4000);
    ok('6 transient null then getSession session → resolves session (app enters)', r === S, 'resolved=' + (r ? 'session' : 'null')); }
  // 4. initial null, getSession null, SIGNED_IN fires during grace → app ENTERS.
  { const S = { user: 'u2' }; const r = await withTimeout(runWaitForSession({ initialSession: null, getSession: () => null, signedInAfterMs: 250, signedInSession: S }), 4000);
    ok('4 SIGNED_IN during grace → resolves session (app enters)', r === S, 'resolved=' + (r ? 'session' : 'null')); }
  // 7. initial null, getSession always null, no SIGNED_IN → resolves null (bounded) → redirects.
  { const t0 = Date.now(); const r = await withTimeout(runWaitForSession({ initialSession: null, getSession: () => null }), 4000); const dt = Date.now() - t0;
    ok('7 persistent null → resolves null after BOUNDED grace (redirect)', r === null && dt < 3500, 'resolved=' + r + ' ms=' + dt); }
  // returning user: INITIAL_SESSION already carries a session → immediate enter.
  { const S = { user: 'u3' }; const r = await withTimeout(runWaitForSession({ initialSession: S }), 4000);
    ok('+ INITIAL_SESSION with session → immediate enter', r === S); }

  console.log('\nLOGIN CONTRACT (login.html source):');
  const verifyBlock = login.slice(login.indexOf("otpSubmitBtn.addEventListener"), login.indexOf('OTP resend'));
  // 1. verifyOtp error → visible error + NO navigation (error branch returns before location.replace).
  ok('1 verify error path returns before navigation (no redirect on error)',
    /if \(verifyErr\)\s*\{[\s\S]*?_otpVerifyNavInProgress = false;[\s\S]*?window\.setButtonBusy\(otpSubmitBtn, false\);[\s\S]*?return;/.test(verifyBlock));
  // 2/3. success requires a CONFIRMED session (returned OR getSession grace) BEFORE the single nav.
  ok('2 confirms session (returned OR getSession bounded grace) before navigating',
    /let confirmed = \(otpData && otpData\.session\) \|\| null;/.test(verifyBlock) && /client\.auth\.getSession\(\)/.test(verifyBlock) && /for \(let i = 0; i <= 8 && !confirmed/.test(verifyBlock));
  // 5. still null after grace → recoverable error, NO navigation.
  ok('5 no session after grace → recoverable error, no redirect',
    /if \(!confirmed\)\s*\{[\s\S]*?_otpVerifyNavInProgress = false;[\s\S]*?window\.setButtonBusy\(otpSubmitBtn, false\);[\s\S]*?return;/.test(verifyBlock));
  // 9. redirect breaker stale state cannot block a confirmed session (log reset before nav).
  ok('9 redirect-loop breaker reset before confirmed navigation',
    /sessionStorage\.removeItem\('aurix_redirect_log'\)[\s\S]*?sessionStorage\.removeItem\('aurix_redirect_broken'\)[\s\S]*?window\.location\.replace\(target\)/.test(verifyBlock));
  // 10. ONE navigation owner: location.replace after confirm; load-time SIGNED_IN listener guarded during verify.
  ok('10 single navigation owner (location.replace) + guarded load-time listener',
    /window\.location\.replace\(target\);/.test(verifyBlock) &&
    /event === 'SIGNED_IN' && session && !_otpVerifyNavInProgress/.test(login) &&
    /_otpVerifyNavInProgress = true;/.test(verifyBlock));
  // 8. duplicate OTP tap → one verification (isVerifying guard).
  ok('8 duplicate tap guarded (isVerifying)', /if \(isVerifying\) return;\s*isVerifying = true;/.test(login));

  console.log('\nPRIVACY (no OTP / email / token / secret in any trace call):');
  // 11. every _authTrace(...) / _aurixAuthTrace(...) call must not pass a secret-bearing identifier.
  const traceCalls = (login.match(/_authTrace\([^;]*\)/g) || []).concat(app.match(/_aurixAuthTrace\([^;]*\)/g) || []);
  // Strip ALL string literals (stage labels like 'email:send-ok' are not secrets); a real leak would be a
  // variable/object-key reference. What remains after stripping strings is only identifiers/keys.
  const leak = traceCalls
    .map(c => c.replace(/'[^']*'/g, "''"))
    .filter(rest => /\b(token|code|email|secret|access_token|refresh_token|password)\b/i.test(rest));
  ok('11 no OTP/email/token/secret passed to any trace call', leak.length === 0, leak.length ? leak[0] : ('calls=' + traceCalls.length));
  // trace helpers store only whitelisted fields (never read email/token/code variables).
  const helperSrc = login.slice(login.indexOf('function _authTrace'), login.indexOf('function _authStorageKeyPresent'));
  ok('11b trace helper body references no token/email/secret variable', !/\b(token|access_token|refresh_token|invite_?secret|otp_?code)\b/i.test(helperSrc));

  console.log('\nMARKERS:');
  ok('marker AUTH.MOBILE.OTP.E2E.02 present in login.html', /AUTH\.MOBILE\.OTP\.E2E\.02/.test(login));
  ok('_authWithTimeout intact (prior fix preserved)', /_authWithTimeout/.test(login));
  ok('index grace + trace present in app.js', /BOUNDED HYDRATION GRACE/.test(app) && /window\.aurixAuthDebug/.test(app));

  console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})();
