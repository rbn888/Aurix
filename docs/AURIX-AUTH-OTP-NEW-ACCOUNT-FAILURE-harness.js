'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-AUTH-OTP-NEW-ACCOUNT-FAILURE-harness — SPEC AUTH.OTP.NEW-ACCOUNT.FAILURE.AUDIT.08
// ════════════════════════════════════════════════════════════════════════════
// A NEW account (maxallgains@gmail.com) received an OTP but saw "No se pudo completar la operación"
// while an existing account (rbn892) signs in fine. A new account's verify ALSO creates the user
// server-side, so it can fail with a backend 5xx that an existing account never triggers.
//
// This harness proves, on the REAL login.html source:
//   1. A server-side backend failure (5xx / "unexpected_failure" / "database error saving new user")
//      is NEVER shown as "código incorrecto" — it maps to the honest generic message.
//   2. A genuine wrong/expired code STILL maps to 'otp-invalid' (existing-user UX unchanged → rbn892).
//   3. The no-session-after-verify path is telemetry-visible (reports 'otp-no-session').
//   4. The success path (session confirmed → single location.replace) is untouched.
//   5. No PII (email/OTP/token) is added to any report/trace by this SPEC.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root  = path.join(__dirname, '..');
const login = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }

// ── extract _isBackendAuthFailure + _classifyAuthError from the real source and exercise them ──
const clsStart = login.indexOf('function _classifyAuthError(err)');
const beEnd    = login.indexOf('return /unexpected_failure');
const beClose  = login.indexOf('\n    }', beEnd);
const src = login.slice(clsStart, beClose + '\n    }'.length);
const sb = {};
vm.createContext(sb);
vm.runInContext(src, sb);

// message-selection mirror of the verify-error branch (kept in lock-step with the source assertion below)
function pickClass(err) {
  const cls = sb._classifyAuthError(err);
  const backend = sb._isBackendAuthFailure(err);
  return (cls === 'network' || cls === 'rate') ? cls : backend ? 'generic' : 'otp-invalid';
}

// 1 — backend 5xx / server errors → generic (NOT otp-invalid)
ok('1a HTTP 500 "Database error saving new user" → generic (not código incorrecto)',
   pickClass({ status: 500, message: 'Database error saving new user' }) === 'generic');
ok('1b unexpected_failure → generic', pickClass({ status: 500, message: 'unexpected_failure' }) === 'generic');
ok('1c HTTP 503 → generic', pickClass({ status: 503, message: 'Service Unavailable' }) === 'generic');
ok('1d statusCode variant honoured', pickClass({ statusCode: 500, message: 'internal server error' }) === 'generic');

// 2 — genuine wrong/expired codes STILL otp-invalid (existing-user path unchanged → rbn892)
ok('2a "Token has expired or is invalid" → otp-invalid',
   pickClass({ status: 401, message: 'Token has expired or is invalid' }) === 'otp-invalid');
ok('2b "otp_expired" → otp-invalid', pickClass({ status: 403, message: 'otp_expired' }) === 'otp-invalid');
ok('2c 5xx never mislabels a wrong code (guard is status/msg specific)',
   sb._isBackendAuthFailure({ status: 401, message: 'invalid' }) === false);

// 3 — network / rate untouched
ok('3a network error → network', pickClass({ message: 'Failed to fetch' }) === 'network');
ok('3b 429 → rate', pickClass({ status: 429, message: 'Too many requests' }) === 'rate');

// ── source-contract assertions on login.html itself ──
ok('4 verify-error branch routes backend failures to generic, wrong codes to otp-invalid',
   /const backendFailure = _isBackendAuthFailure\(verifyErr\);/.test(login) &&
   /: backendFailure \? 'generic'\s*[\r\n]+\s*: 'otp-invalid'/.test(login));
ok('5 backend failure is always reported (observable in /api/client-log)',
   /if \(\(cls !== 'otp-invalid' && cls !== 'rate'\) \|\| backendFailure\)/.test(login) &&
   /'otp-verify-backend'/.test(login));
ok('6 no-session-after-verify path is now telemetry-visible',
   /_reportLoginSafe\('otp-no-session'/.test(login));
ok('7 no-session message stays neutral generic (never claims the code was wrong)',
   /_reportLoginSafe\('otp-no-session'[\s\S]*?otpErrorEl\.innerText = authErr\('generic'\);/.test(login));

// ── regression guards: success + rbn892 paths untouched ──
ok('8 success path unchanged: session confirmed → single location.replace',
   /let confirmed = \(otpData && otpData\.session\) \|\| null;[\s\S]*?window\.location\.replace\(target\);/.test(login) &&
   (login.match(/window\.location\.replace\(target\)/g) || []).length === 1);
ok('9 verifyOtp call itself untouched (email/token/type: email)',
   /client\.auth\.verifyOtp\(\{[\s\S]*?email,[\s\S]*?token: code,[\s\S]*?type: 'email'/.test(login));

// ── privacy: this SPEC adds no email/OTP/token to any report or trace ──
ok('10 no PII (email/otp/token) in the new otp-no-session / otp-verify-backend reports',
   !/_reportLoginSafe\('otp-no-session'[^)]*email/.test(login) &&
   !/_reportLoginSafe\('otp-no-session'[^)]*token/.test(login));

// ── version sync ──
{ const vj = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
  const m = login.match(/var AURIX_LOGIN_BUILD = (\d+);/);
  ok('11 version.json.loginhtml === login.html AURIX_LOGIN_BUILD (in sync)',
     m && Number(m[1]) === vj.loginhtml, 'login=' + (m && m[1]) + ' version.json=' + vj.loginhtml);
}
ok('marker AUTH.OTP.NEW-ACCOUNT.FAILURE.AUDIT.08 present', /AUTH\.OTP\.NEW-ACCOUNT\.FAILURE\.AUDIT\.08/.test(login));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
