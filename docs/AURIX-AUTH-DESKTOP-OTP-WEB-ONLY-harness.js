'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-AUTH-DESKTOP-OTP-WEB-ONLY-harness — SPEC AUTH.DESKTOP.OTP.WEB-ONLY.FAILURE.01
// ════════════════════════════════════════════════════════════════════════════
// Mobile OTP works; desktop can be blocked by desktop-side STATE (stale login.html / stale redirect
// breaker / corrupt auth storage). Verifies the scoped self-heal + diagnostics + stale-login guard,
// WITHOUT regressing mobile. Behavioural (extracted login.html self-heal fns) + source-contract.
const fs = require('fs'), vm = require('vm'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..');
const login = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }

// ── extract the contiguous self-heal block from login.html ──
const blockStart = login.indexOf('function _storageAvailable()');
const blockEnd = login.indexOf('return { signedOut: true, removedAuthKeys: removed.length };');
const closeIdx = login.indexOf('\n    };', blockEnd);   // the closing brace of window.aurixHardAuthReset
const selfHealSrc = login.slice(blockStart, closeIdx + '\n    };'.length);

function mkStore(throwing) {
  const s = {};
  Object.defineProperties(s, {
    getItem: { value: k => { if (throwing) throw new Error('blocked'); return Object.prototype.hasOwnProperty.call(s, k) ? s[k] : null; } },
    setItem: { value: (k, v) => { if (throwing) throw new Error('blocked'); s[k] = String(v); } },
    removeItem: { value: k => { delete s[k]; } },
  });
  return s;
}
function mkSandbox(opts) {
  opts = opts || {};
  let signedOut = false;
  const sb = {
    console: { log() {}, warn() {} }, JSON, Object, Number, navigator: { userAgent: opts.ua || 'Mozilla/5.0 (Macintosh)' },
    localStorage: opts.storageThrows ? mkStore(true) : mkStore(false),
    sessionStorage: mkStore(false),
    _AURIX_AUTH_TRACE_KEY: 'aurix_auth_trace', AURIX_LOGIN_BUILD: 481,
    _authStorageKeyPresent: function () { try { return Object.keys(sb.localStorage).some(k => /^sb-.*-auth-token$/.test(k)); } catch (_) { return false; } },
    _authTrace: function () {},
    client: { auth: { signOut: () => { signedOut = true; return Promise.resolve(); } } },
    document: { visibilityState: 'visible' }, location: { href: 'https://x/login.html', pathname: '/login.html' },
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(selfHealSrc, sb);
  sb.__signedOut = () => signedOut;
  return sb;
}

console.log('AUTH-DESKTOP-OTP-WEB-ONLY — SPEC AUTH.DESKTOP.OTP.WEB-ONLY.FAILURE.01\n');

console.log('Self-heal (scoped; never touches portfolio/chart data):');
// 4. stale redirect breaker → reset clears it (no signOut, portfolio untouched)
{ const sb = mkSandbox();
  sb.sessionStorage.setItem('aurix_redirect_log', '[1,2,3]'); sb.sessionStorage.setItem('aurix_redirect_broken', '{}'); sb.sessionStorage.setItem('aurix_auth_trace', '[{}]');
  sb.localStorage.setItem('portfolio_history', 'DATA'); sb.localStorage.setItem('aurix_holdings', 'HOLD');
  const r = vm.runInContext('window.aurixResetLoginState()', sb);
  ok('4 aurixResetLoginState clears breaker/trace, no signOut, portfolio KEPT',
    sb.sessionStorage.getItem('aurix_redirect_log') === null && sb.sessionStorage.getItem('aurix_redirect_broken') === null && sb.sessionStorage.getItem('aurix_auth_trace') === null &&
    sb.__signedOut() === false && sb.localStorage.getItem('portfolio_history') === 'DATA' && sb.localStorage.getItem('aurix_holdings') === 'HOLD', 'signout=' + sb.__signedOut()); }
// 4b. explicit signOut option
{ const sb = mkSandbox(); vm.runInContext('window.aurixResetLoginState({ signOut: true })', sb);
  ok('4b aurixResetLoginState({signOut:true}) signs out', sb.__signedOut() === true); }
// 5. corrupt/stale Supabase auth storage → hard reset removes ONLY auth keys, keeps portfolio, signs out
{ const sb = mkSandbox();
  sb.localStorage.setItem('sb-ozcasyufbknnuemllwso-auth-token', 'STALE'); sb.localStorage.setItem('portfolio_history', 'DATA'); sb.localStorage.setItem('aurix_holdings', 'HOLD'); sb.localStorage.setItem('category_history', 'CH');
  const r = vm.runInContext('window.aurixHardAuthReset()', sb);
  ok('5 aurixHardAuthReset removes ONLY sb-*-auth-token + signs out; portfolio/chart KEPT',
    sb.localStorage.getItem('sb-ozcasyufbknnuemllwso-auth-token') === null && sb.__signedOut() === true &&
    sb.localStorage.getItem('portfolio_history') === 'DATA' && sb.localStorage.getItem('aurix_holdings') === 'HOLD' && sb.localStorage.getItem('category_history') === 'CH' && r.removedAuthKeys === 1, JSON.stringify(r)); }
// 7. storage unavailable → _storageAvailable false (drives the visible verify error)
{ const sb = mkSandbox({ storageThrows: true }); ok('7 _storageAvailable() false when storage blocked', vm.runInContext('_storageAvailable()', sb) === false); }
{ const sb = mkSandbox(); ok('7b _storageAvailable() true when storage works', vm.runInContext('_storageAvailable()', sb) === true); }
// env check returns without throwing + no secret fields
{ const sb = mkSandbox(); const env = vm.runInContext('window.aurixAuthEnvironmentCheck()', sb);
  ok('env check reports uaCategory desktop + storage booleans', env.uaCategory === 'desktop' && env.localStorageAvailable === true && typeof env.supabaseAuthKeyPresent === 'boolean');
  ok('9 env check carries NO secret field', !('otp' in env) && !('email' in env) && !('token' in env) && !('accessToken' in env)); }

console.log('\nLogin contract + stale guard (source):');
// 1. mobile path unchanged — stale-login reload is DESKTOP-ONLY
ok('1 mobile unchanged: stale-login reload is desktop-only (isMobileUA return)', /_aurixLoginStaleGuard[\s\S]*?if \(isMobileUA\) return;/.test(login));
// 2/8. confirmed session before nav + single owner (shared contract preserved)
ok('2 desktop verify success confirms session before location.replace', /let confirmed = \(otpData && otpData\.session\) \|\| null;[\s\S]*?window\.location\.replace\(target\);/.test(login));
ok('8 single navigation owner (_otpVerifyNavInProgress + one location.replace)', /_otpVerifyNavInProgress = true;/.test(login) && (login.match(/window\.location\.replace\(target\)/g) || []).length === 1);
// 3. session null after grace → recoverable error, no infinite spinner
ok('3 no confirmed session → recoverable error, no infinite spinner', /if \(!confirmed\)\s*\{[\s\S]*?setButtonBusy\(otpSubmitBtn, false\);[\s\S]*?return;/.test(login));
// 6. stale login.html → ONE cache-bust reload (one-shot guard)
ok('6 stale login.html → one cache-bust reload (one-shot, no loop)', /location\.replace\('login\.html\?v=' \+ served\)/.test(login) && /aurix_login_stale_reloaded/.test(login));
// 7. storage unavailable → visible error branch in verify
ok('7c verify fails fast with visible error when storage unavailable', /if \(!_storageAvailable\(\)\)\s*\{[\s\S]*?otpErrorEl\.innerText = authErr\('generic'\);[\s\S]*?return;/.test(login));
// markers
ok('marker AUTH.DESKTOP.OTP.WEB-ONLY.FAILURE.01 present', /AUTH\.DESKTOP\.OTP\.WEB-ONLY\.FAILURE\.01/.test(login));
ok('reset + hard-reset + env-check exposed', /window\.aurixResetLoginState = function/.test(login) && /window\.aurixHardAuthReset = function/.test(login) && /window\.aurixAuthEnvironmentCheck = function/.test(login));

console.log('\nMobile auth harnesses remain green:');
for (const [label, file] of [['10 mobile OTP E2E', 'AURIX-AUTH-MOBILE-OTP-E2E-harness.js'], ['11 post-login bounce', 'AURIX-AUTH-POST-LOGIN-BOUNCE-harness.js'], ['auth stability freeze', 'AURIX-AUTH-MOBILE-STABILITY-FREEZE-harness.js']]) {
  let good = false; try { cp.execSync('node ' + JSON.stringify(path.join(__dirname, file)), { stdio: 'ignore' }); good = true; } catch (_) {}
  ok(label + ' remains green', good);
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
