'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ROUTING-CACHE-STABILITY-harness — P0 (no index⇄login flicker; no stale bundle)
// ════════════════════════════════════════════════════════════════════════════
// safeRedirect() logs every redirect in sessionStorage and SUPPRESSES further redirects once a
// ping-pong is detected (≥3 in 10s) so the app can never flicker forever. index.html carries a
// cache-busted stale-bundle guard that reloads ONCE (never a loop). version.json is the served-version
// source of truth and must match index.html's APPJS_V. window.aurixBootDiagnostic() is exposed.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const login = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
function fnSrc(src, name) {
  const s = 'function ' + name + '('; const i = src.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let p = src.indexOf('(', i), pd = 0; for (; p < src.length; p++) { if (src[p] === '(') pd++; else if (src[p] === ')') { pd--; if (!pd) { p++; break; } } }
  let k = src.indexOf('{', p), d = 0; for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) { k++; break; } } }
  return src.slice(i, k);
}
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }

// Sandbox running the REAL safeRedirect from app.js with a fake sessionStorage + window.location.
function makeEnv(pathname) {
  const store = new Map();
  const navs = [];
  const sb = {
    console: { warn: () => {}, log: () => {} }, Date: Date, JSON: JSON, Array: Array,
    Number: Number, parseInt: parseInt, isFinite: isFinite, URL: URL, URLSearchParams: URLSearchParams,
    _SAFE_REDIRECT_TARGETS: new Set(['index.html', 'login.html', 'reset.html', 'reset-password.html']),
    _AURIX_REDIRECT_MAX: 3, _AURIX_REDIRECT_WINDOW_MS: 10000,
    // SPEC ANDROID-AUTH-REDIRECT-LOOP — storage-independent URL bounce bound (mirrors app.js constants).
    _AURIX_REDIRECT_URL_PARAM: '_arl', _AURIX_REDIRECT_URL_MAX: 5,
    sessionStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    window: { location: { pathname: pathname || '/index.html', search: '', origin: 'https://rbn888.github.io', get href() { return ''; }, set href(v) { navs.push(v); } } },
  };
  sb.__navs = navs; sb.__store = store;
  vm.createContext(sb);
  // safeRedirect now reads a storage-independent URL bounce counter via _aurixReadUrlBounce — provide it too.
  vm.runInContext(fnSrc(app, '_aurixReadUrlBounce') + '\n' + fnSrc(app, 'safeRedirect'), sb);
  return sb;
}
const R = (sb, target, source) => vm.runInContext('safeRedirect(' + JSON.stringify(target) + ',' + JSON.stringify(source || null) + ')', sb);

console.log('AURIX-ROUTING-CACHE-STABILITY — no flicker, no stale bundle\n');

console.log('Redirect loop breaker:');
{ const sb = makeEnv('/index.html');
  const r1 = R(sb, 'login.html', 'boot:no-session');
  ok('1 first redirect is issued (navigation happens)', r1 === true && sb.__navs.length === 1, 'navs=' + sb.__navs.length); }
{ const sb = makeEnv('/index.html');
  const results = [R(sb, 'login.html', 'a'), R(sb, 'index.html', 'b'), R(sb, 'login.html', 'c'), R(sb, 'index.html', 'd'), R(sb, 'login.html', 'e')];
  ok('2 rapid ping-pong is broken after 3 (later redirects suppressed → no infinite flicker)',
    results[0] === true && results[1] === true && results[2] === true && results[3] === false && results[4] === false && sb.__navs.length === 3, 'issued=' + sb.__navs.length + ' results=' + results.join(',')); }
{ const sb = makeEnv('/index.html');
  R(sb, 'login.html', 'a'); R(sb, 'index.html', 'b'); R(sb, 'login.html', 'c'); R(sb, 'index.html', 'd');
  const broken = JSON.parse(sb.__store.get('aurix_redirect_broken') || 'null');
  const last = JSON.parse(sb.__store.get('aurix_last_redirect') || 'null');
  ok('3 loop-break is recorded for the diagnostic (aurix_redirect_broken + source)', !!broken && broken.bounces >= 3 && !!last, JSON.stringify(broken)); }
{ const sb = makeEnv('/index.html');
  ok('4 unknown redirect target falls back to login.html (never external)', (function () { R(sb, '//evil.com/x', 's'); return /login\.html(?:\?|$)/.test(sb.__navs[0]) && !/evil/.test(sb.__navs[0]); })(), sb.__navs[0]); }

console.log('\nBuild-coherence guard (index.html, SPEC.43) + version source of truth:');
// SPEC.43 replaced the SPEC-era stale guard with the build-coherence contract: same no-store version.json
// fetch, but a shared structured marker (aurix_coherence_reload {v,n}) and a cache-busted index.html?v= reload.
ok('5 index.html has the cache-busted build-coherence guard (version.json?cb, one-time reload)',
  /BUILD-COHERENCE GUARD/.test(html) && /fetch\('version\.json\?cb='/.test(html) && /aurix_coherence_reload/.test(html) && /index\.html\?v=/.test(html));
ok('6 stale reload is one-time-guarded per expected version (n>=1 ⇒ recoverable, never an infinite loop)',
  /mk\.v === j\.appjs && \(mk\.n \|\| 0\) >= 1/.test(html) && /sessionStorage\.setItem\('aurix_coherence_reload'/.test(html) && /__AURIX_BUILD_RELOAD_EXHAUSTED/.test(html));
{ const vj = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
  const m = html.match(/var APPJS_V = '(\d+)'/);
  const served = m ? parseInt(m[1], 10) : -1;
  ok('7 version.json.appjs === index.html APPJS_V (source of truth in sync)', vj.appjs === served, 'version.json=' + vj.appjs + ' index=' + served);
  const sm = html.match(/<script src="app\.js\?v=(\d+)"/);
  ok('8 index.html loads app.js at the same version', sm && parseInt(sm[1], 10) === served, sm && sm[1]); }

console.log('\nAuth root-cause hardening + diagnostic wiring:');
ok('9 waitForSession confirms a null INITIAL_SESSION via getSession (closes the cold-boot race)',
  /INITIAL_SESSION[\s\S]{0,240}getSession\(\)[\s\S]{0,80}finish/.test(app));
ok('10 spurious SIGNED_OUT is ignored when getSession still has a session (guarded owner re-checks)',
  // SPEC POST-LOGIN-BOUNCE.03 — spurious SIGNED_OUT now routes through the single guarded owner
  // (non-force), which re-checks getSession and refuses to bounce a session that is still present.
  /aurixScheduleLoginRedirect\('onAuthStateChange:SIGNED_OUT'\);/.test(app) &&
  /const \{ data \} = await supabaseClient\.auth\.getSession\(\);\s*if \(data && data\.session\) \{ _aurixMarkSessionConfirmed\(\)/.test(app));
ok('11 boot gate hides the shell when a redirect is suppressed (no stuck splash)',
  /const issued = await aurixScheduleLoginRedirect\('boot:no-session'\);[\s\S]{0,500}if \(!issued\)[\s\S]{0,160}auth-redirect-suppressed/.test(app));
ok('12 login.html mirrors the loop breaker (shared aurix_redirect_log)',
  /aurix_redirect_log/.test(login) && /REDIRECT-LOOP-BREAK/.test(login));
ok('13 window.aurixBootDiagnostic exposed with the required fields', (function () {
  const need = ['servedAppVersion', 'expectedAppVersion', 'currentUrl', 'redirectCount', 'authGateState', 'inviteGateState',
    'localStorageKeys', 'sessionStorageKeys', 'serviceWorkerActive', 'cacheNames', 'appJsUrlLoaded', 'appJsBuildTag',
    'chartVersionTag', 'reasonForRedirect', 'lastRedirectSource'];
  return /window\.aurixBootDiagnostic\s*=/.test(app) && need.every(k => new RegExp('\\b' + k + '\\b').test(app));
})());

console.log('\n' + (fail === 0 ? '✅ ALL PASS' : '❌ ' + fail + ' FAILED') + '  (' + pass + '/' + (pass + fail) + ')');
process.exit(fail === 0 ? 0 : 1);
