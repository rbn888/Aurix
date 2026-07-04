'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-AUTH-MOBILE-STABILITY-FREEZE-harness — SPEC AUTH.MOBILE.LOGIN-STABILITY.FREEZE.01
// ════════════════════════════════════════════════════════════════════════════
// FREEZE. The mobile iPhone OTP login flow is now accepted on a real device (v478):
//   invite → email → OTP → dashboard → STAYS IN.
// This locks the accepted auth contract as a P0 regression invariant so future chart / UI / backend
// / routing / cache / Pages / refactor work cannot silently reintroduce any of:
//   invite-doesn't-open-email · infinite send spinner · OTP-accepted-no-entry · paint-then-bounce ·
//   duplicate redirect owners · null-session race · stale redirect timer · boot-exception-as-logout.
// Behavioural VM tests (waitForSession hydration grace + the single guarded redirect owner) PLUS
// source-contract + marker + privacy assertions, and the three sibling auth/routing harnesses.
const fs = require('fs'), vm = require('vm'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const login = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── slices of the REAL production code ──
const waitSrc  = app.slice(app.indexOf('const waitForSession'), app.indexOf('const ensureSession'));
const ownerSrc = app.slice(app.indexOf('let _aurixRecentSessionUntil'), app.indexOf('if (supabaseClient && !window.__AUTH_LISTENER__)'));
const verifyBlock = login.slice(login.indexOf('otpSubmitBtn.addEventListener'), login.indexOf('OTP resend'));

// ── VM: waitForSession (index hydration grace) ──
function runWaitForSession(seq) {
  let getCalls = 0;
  const sb = {
    console: { warn() {}, log() {} }, Date, JSON, Math, Promise, setTimeout, clearTimeout, Object, Array,
    IS_DEV: false, navigator: { userAgent: 'iPhone' }, document: { visibilityState: 'visible' },
    location: { pathname: '/index.html' }, sessionStorage: { getItem: () => '[]', setItem() {}, removeItem() {} },
    _aurixAuthTrace() {}, _aurixAuthStorageKeyPresent: () => true, _aurixMarkSessionConfirmed() {},
    supabaseClient: { auth: {
      onAuthStateChange(fn) {
        setTimeout(() => { try { fn('INITIAL_SESSION', seq.initialSession || null); } catch (_) {} }, 0);
        if (seq.signedInAfterMs != null) setTimeout(() => { try { fn('SIGNED_IN', seq.signedInSession || null); } catch (_) {} }, seq.signedInAfterMs);
        return { data: { subscription: { unsubscribe() {} } } };
      },
      getSession() { getCalls++; return Promise.resolve({ data: { session: seq.getSession ? seq.getSession(getCalls) : null } }); },
    } },
  };
  vm.createContext(sb);
  vm.runInContext(waitSrc + '\n; globalThis.__wfs = waitForSession;', sb);
  return sb.__wfs();
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);

// ── VM: guarded redirect owner (post-login stability) ──
function makeOwner(getSessionImpl, recent) {
  const navs = [], cleared = { count: 0 };
  const sb = {
    console: { warn() {}, log() {} }, Date, JSON, Math, Promise, Object, Array,
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms || 0, 5)), clearTimeout,
    _aurixAuthTrace() {}, _clearLocalUserState: () => { cleared.count++; },
    safeRedirect: (target, reason) => { navs.push({ target, reason }); return true; },
    supabaseClient: { auth: { getSession() { return Promise.resolve({ data: { session: getSessionImpl() } }); } } },
    sessionStorage: { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } },
    window: { location: { pathname: '/index.html' } },
  };
  vm.createContext(sb);
  vm.runInContext(ownerSrc, sb);
  if (recent) vm.runInContext('_aurixMarkSessionConfirmed();', sb);
  sb.__navs = navs; sb.__cleared = cleared; return sb;
}
const schedule = (sb, reason, opts) => vm.runInContext('aurixScheduleLoginRedirect(' + JSON.stringify(reason) + ',' + JSON.stringify(opts || {}) + ')', sb);

(async () => {
  console.log('AURIX-AUTH-MOBILE-STABILITY-FREEZE — SPEC AUTH.MOBILE.LOGIN-STABILITY.FREEZE.01\n');

  console.log('A/B/C/D — login.html contract (invite → email → OTP → confirm → single nav):');
  // 1. valid invite → email step opens (unlockAuth on valid).
  ok('1 valid invite unlocks the email step', /if \(result\.valid\) \{ _authTrace\('invite:ok'[\s\S]{0,40}unlockAuth\(\)/.test(login) && /function unlockAuth\(\)/.test(login));
  // 2/3. OTP send: bounded timeout + busy always closes + OTP step on success + visible error on failure.
  ok('2 OTP send opens OTP step on success', /email:send-ok/.test(login) && /email:send-ok[\s\S]{0,900}showOtpStep\(\)/.test(login));
  ok('3 OTP send is bounded + spinner always closes + visible error on failure',
    /_authWithTimeout\(client\.auth\.signInWithOtp/.test(login) && /finally \{[\s\S]{0,500}setButtonBusy\(submitBtn, false\)/.test(login) && /_authErrorText\(sendErr\)/.test(login));
  // 4. verifyOtp error → no navigation.
  ok('4 verifyOtp error → returns before navigation', /if \(verifyErr\)\s*\{[\s\S]*?_otpVerifyNavInProgress = false;[\s\S]*?return;/.test(verifyBlock));
  // 5/6. success → confirm session (returned OR bounded getSession/auth-event) before navigating.
  ok('5/6 confirms session (returned OR bounded getSession grace) before navigating',
    /let confirmed = \(otpData && otpData\.session\) \|\| null;/.test(verifyBlock) && /for \(let i = 0; i <= 8 && !confirmed/.test(verifyBlock) && /client\.auth\.getSession\(\)/.test(verifyBlock));
  // 7. persistent null after grace → no entry, recoverable error.
  ok('7 no confirmed session → recoverable error, NO redirect', /if \(!confirmed\)\s*\{[\s\S]*?_otpVerifyNavInProgress = false;[\s\S]*?return;/.test(verifyBlock));
  // D. one navigation owner via location.replace.
  ok('D single navigation owner (location.replace) + guarded load-time listener',
    /window\.location\.replace\(target\);/.test(verifyBlock) && /event === 'SIGNED_IN' && session && !_otpVerifyNavInProgress/.test(login));

  console.log('\nE — index hydration grace (app.js waitForSession, behavioural):');
  { const S = { u: 1 }; const r = await withTimeout(runWaitForSession({ initialSession: null, getSession: n => (n >= 2 ? S : null) }), 4000);
    ok('8 initial null → later getSession session → app REMAINS (enters)', r === S); }
  { const S = { u: 2 }; const r = await withTimeout(runWaitForSession({ initialSession: null, getSession: () => null, signedInAfterMs: 250, signedInSession: S }), 4000);
    ok('8b SIGNED_IN during grace → app enters', r === S); }
  { const t0 = Date.now(); const r = await withTimeout(runWaitForSession({ initialSession: null, getSession: () => null }), 4000);
    ok('9 persistent null → resolves null after BOUNDED grace (then redirect)', r === null && (Date.now() - t0) < 3500); }

  console.log('\nF/G — post-login stability (guarded redirect owner, behavioural):');
  { const sb = makeOwner(() => ({ u: 1 }), true); await schedule(sb, 'auth-event-null'); await sleep(80);
    ok('10 confirmed session + one late null → NO bounce', sb.__navs.length === 0); }
  { const sb = makeOwner((function () { let n = 0; return () => (++n >= 2 ? { u: 1 } : null); })(), true); await schedule(sb, 'auth-event-null'); await sleep(120);
    ok('11 session recovers mid-sequence → pending redirect canceled', sb.__navs.length === 0); }
  { const sb = makeOwner(() => null, true); await schedule(sb, 'auth-event-null'); await sleep(140);
    ok('12 persistent session loss → exactly one login redirect', sb.__navs.length === 1 && sb.__navs[0].target === 'login.html'); }
  { const sb = makeOwner(() => ({ u: 1 }), true); await schedule(sb, 'signout', { force: true }); await sleep(20);
    ok('13 explicit logout (force) → immediate redirect', sb.__navs.length === 1 && sb.__navs[0].reason === 'signout'); }
  { const sb = makeOwner(() => null, true); schedule(sb, 'a'); await schedule(sb, 'b'); await sleep(140);
    ok('14 duplicate redirect requests → coalesced to ONE owner', sb.__navs.length === 1); }
  { const sb = makeOwner((function () { let n = 0; return () => (++n >= 2 ? { u: 1 } : null); })(), true); schedule(sb, 'x'); await sleep(2); await sleep(120);
    ok('15 stale redirect timer cannot fire after session recovery', sb.__navs.length === 0); }
  { const sb = makeOwner(() => ({ u: 1 }), true); await schedule(sb, 'boot:exception'); await sleep(40);
    ok('16 non-auth boot exception + valid session → NO logout redirect', sb.__navs.length === 0); }
  { const sb = makeOwner(() => ({ u: 1 }), true); await schedule(sb, 'render:exception'); await sleep(40);
    ok('17 chart/render exception + valid session → NO logout redirect', sb.__navs.length === 0); }

  console.log('\nPrivacy — diagnostics never carry a secret:');
  const traceCalls = (login.match(/_authTrace\([^;]*\)/g) || []).concat(app.match(/_aurixAuthTrace\([^;]*\)/g) || []).map(c => c.replace(/'[^']*'/g, "''"));
  ok('18 no OTP token in any trace call', !traceCalls.some(c => /\b(token|otp|code)\b/i.test(c)));
  ok('19 no full email in any trace call', !traceCalls.some(c => /\bemail\b/i.test(c)));
  ok('20 no access/refresh token in any trace call', !traceCalls.some(c => /\b(access_token|refresh_token|secret|password)\b/i.test(c)));
  { const sb = makeOwner(() => null, true); sb.sessionStorage.setItem('aurix_redirect_log', '[1]'); vm.runInContext('window.aurixClearAuthRedirectState();', sb);
    ok('21 aurixClearAuthRedirectState clears breaker only (does NOT sign out)', sb.__cleared.count === 0 && sb.sessionStorage.getItem('aurix_redirect_log') === null); }

  console.log('\nMarkers — accepted invariants must remain in production source:');
  ok('login.html: AUTH.MOBILE.OTP.E2E.02', /AUTH\.MOBILE\.OTP\.E2E\.02/.test(login));
  ok('login.html: _authWithTimeout', /_authWithTimeout/.test(login));
  ok('app.js: AUTH.MOBILE.POST-LOGIN-BOUNCE.03', /AUTH\.MOBILE\.POST-LOGIN-BOUNCE\.03/.test(app));
  ok('app.js: BOUNDED HYDRATION GRACE', /BOUNDED HYDRATION GRACE/.test(app));
  ok('app.js: aurixScheduleLoginRedirect / mark / cancel / clear',
    /function aurixScheduleLoginRedirect/.test(app) && /function _aurixMarkSessionConfirmed/.test(app) && /function _aurixCancelLoginRedirect/.test(app) && /window\.aurixClearAuthRedirectState/.test(app));

  console.log('\nSibling harnesses (must remain green):');
  for (const [label, file] of [['22 OTP E2E', 'AURIX-AUTH-MOBILE-OTP-E2E-harness.js'], ['23 POST-LOGIN-BOUNCE', 'AURIX-AUTH-POST-LOGIN-BOUNCE-harness.js'], ['24 routing/cache', 'AURIX-ROUTING-CACHE-STABILITY-harness.js']]) {
    let good = false; try { cp.execSync('node ' + JSON.stringify(path.join(__dirname, file)), { stdio: 'ignore' }); good = true; } catch (_) { good = false; }
    ok(label + ' harness remains green', good);
  }

  console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})();
