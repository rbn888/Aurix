'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ANDROID-AUTH-REDIRECT-LOOP-harness — SPEC ANDROID-AUTH-REDIRECT-LOOP (OWNER A)
// ════════════════════════════════════════════════════════════════════════════
// Proves the storage-INDEPENDENT loop bound added to safeRedirect() so an index⇄login redirect
// ping-pong can NEVER flicker forever when sessionStorage is defeated (Android in-app Webview /
// partitioned / private contexts where setItem "succeeds" but the value is gone after navigation).
// Contract proven:
//   1  a valid session entering the app issues ONE clean redirect (not suppressed),
//   2  no session issues ONE normal redirect to login (not suppressed),
//   3  storage WORKING → existing sessionStorage window cap (3) still trips (no regression),
//   4  setItem THROWS → bounded by the URL counter, never loops,
//   5  setItem succeeds but getItem returns null (silent non-persist) → bounded, never loops,
//   6  partitioned/unreliable (storage wiped every navigation) → attempts stay bounded,
//   7  index⇄login cannot loop indefinitely (50 forced iterations settle to suppressed),
//   8  a confirmed session clears the URL fallback marker (_aurixClearRedirectFallback),
//   9  deep links with existing query params stay usable (counter appended with &, params preserved),
//  10  _aurixStorageUsable round-trip probe correctly classifies working / throwing / non-persisting,
//  11  window.__AURIX_REDIRECT_LOOP_BROKEN is published when the bound trips.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }

// Extract the redirect-owner block (targets + loop-breaker constants + storage/URL helpers + safeRedirect).
const START = 'const _SAFE_REDIRECT_TARGETS = new Set([';
const END = 'const _AURIX_AUTH_TRACE_KEY';
const s = app.indexOf(START), e = app.indexOf(END);
if (s < 0 || e < 0 || e <= s) { console.error('extraction failed: START/END markers not found'); console.log('1 failed'); process.exit(1); }
const ownerSrc = app.slice(s, e);

// ── Mock browser environment ────────────────────────────────────────────────
function makeStorage(mode) {
  // mode: 'ok' | 'throw' | 'nopersist'  (nopersist: setItem is a no-op → getItem always null)
  const map = {};
  return {
    _map: map,
    getItem(k) { return mode === 'nopersist' ? null : (k in map ? map[k] : null); },
    setItem(k, v) { if (mode === 'throw') throw new Error('QuotaExceeded'); if (mode === 'ok') map[k] = String(v); /* nopersist: swallow */ },
    removeItem(k) { delete map[k]; },
    wipe() { for (const k in map) delete map[k]; },
  };
}
function makeLocation(pathname, search) {
  const loc = { origin: 'https://app.aurixsystem.io', pathname: pathname || '/index.html', search: search || '', hash: '', _navs: [] };
  loc._apply = function (u) {
    this._navs.push(u);
    try { const p = new URL(u, this.origin); this.pathname = p.pathname; this.search = p.search; this.hash = p.hash; } catch (_) {}
  };
  loc.replace = function (u) { this._apply(u); };
  Object.defineProperty(loc, 'href', { get() { return this.origin + this.pathname + this.search + this.hash; }, set(u) { this._apply(u); } });
  return loc;
}
function makeEnv(storageMode, pathname, search) {
  const storage = makeStorage(storageMode);
  const location = makeLocation(pathname, search);
  const win = { location: location };
  const sb = {
    console: { warn() {}, log() {}, error() {} },
    Date, JSON, Math, Number, parseInt, isFinite, URL, URLSearchParams,
    sessionStorage: storage,
    window: win,
    history: { replaceState(_a, _b, url) { try { location._apply(url); } catch (__) {} } },
  };
  sb.window.history = sb.history;
  vm.createContext(sb);
  vm.runInContext(ownerSrc, sb);
  sb.__storage = storage; sb.__location = location;
  return sb;
}
function call(sb, target, source) { return vm.runInContext('safeRedirect(' + JSON.stringify(target) + ',' + JSON.stringify(source || null) + ')', sb); }

(function () {
  console.log('AURIX-ANDROID-AUTH-REDIRECT-LOOP — SPEC ANDROID-AUTH-REDIRECT-LOOP (OWNER A)\n');

  // 1. Valid session entering the app → one clean redirect to index, not suppressed.
  { const sb = makeEnv('ok', '/login.html', ''); const r = call(sb, 'index.html', 'login:getSession');
    ok('1 session→index issues ONE clean redirect', r === true && sb.__location._navs.length === 1 && /index\.html/.test(sb.__location._navs[0]), 'navs=' + sb.__location._navs.length); }

  // 2. No session → one normal redirect to login, not suppressed, carries _arl=1.
  { const sb = makeEnv('ok', '/index.html', ''); const r = call(sb, 'login.html', 'boot:no-session');
    ok('2 no-session→login normal redirect (_arl=1)', r === true && /login\.html\?_arl=1/.test(sb.__location._navs[0]), sb.__location._navs[0]); }

  // 3. Storage WORKING → sessionStorage window cap (3) still trips → no regression.
  { const sb = makeEnv('ok', '/index.html', ''); const results = [];
    for (let i = 0; i < 6; i++) results.push(call(sb, i % 2 ? 'index.html' : 'login.html', 'x'));
    const suppressedAt = results.indexOf(false);
    ok('3 working storage → sessionStorage cap suppresses (no regression)', suppressedAt === 3, 'suppressedAt=' + suppressedAt + ' results=' + JSON.stringify(results)); }

  // 4. setItem THROWS → never loops; URL counter bounds it, eventually false.
  { const sb = makeEnv('throw', '/index.html', ''); let navs = 0, suppressed = false;
    for (let i = 0; i < 50 && !suppressed; i++) { const r = call(sb, i % 2 ? 'index.html' : 'login.html', 'x'); if (r) navs++; else suppressed = true; }
    ok('4 setItem THROWS → bounded, no infinite loop', suppressed === true && navs <= 5, 'navs=' + navs + ' suppressed=' + suppressed); }

  // 5. setItem OK but getItem null (silent non-persist) → bounded.
  { const sb = makeEnv('nopersist', '/index.html', ''); let navs = 0, suppressed = false;
    for (let i = 0; i < 50 && !suppressed; i++) { const r = call(sb, i % 2 ? 'index.html' : 'login.html', 'x'); if (r) navs++; else suppressed = true; }
    ok('5 non-persisting storage → bounded, no infinite loop', suppressed === true && navs <= 5, 'navs=' + navs); }

  // 6. Partitioned/unreliable → storage wiped every navigation → still bounded (URL counter survives).
  { const sb = makeEnv('ok', '/index.html', ''); let navs = 0, suppressed = false;
    for (let i = 0; i < 50 && !suppressed; i++) { sb.__storage.wipe(); const r = call(sb, i % 2 ? 'index.html' : 'login.html', 'x'); if (r) navs++; else suppressed = true; }
    ok('6 partitioned storage (wiped each nav) → bounded', suppressed === true && navs <= 5, 'navs=' + navs); }

  // 7. index⇄login cannot loop indefinitely — 50 forced iterations settle to permanently suppressed.
  { const sb = makeEnv('nopersist', '/index.html', ''); const tail = [];
    for (let i = 0; i < 50; i++) tail.push(call(sb, i % 2 ? 'index.html' : 'login.html', 'x'));
    const last10AllFalse = tail.slice(-10).every(v => v === false);
    ok('7 index⇄login cannot loop indefinitely (settles suppressed)', last10AllFalse === true, 'last10=' + JSON.stringify(tail.slice(-10))); }

  // 8. Confirmed session clears the URL fallback marker + sessionStorage log.
  { const sb = makeEnv('ok', '/index.html', '?_arl=3&foo=bar');
    sb.__storage.setItem('aurix_redirect_log', '[{"ts":1}]');
    vm.runInContext('_aurixClearRedirectFallback();', sb);
    const href = sb.__location.href, log = sb.__storage.getItem('aurix_redirect_log');
    ok('8 confirmed session clears _arl marker + log', !/_arl/.test(href) && /foo=bar/.test(href) && log === null, 'href=' + href + ' log=' + log); }

  // 9. Deep links stay usable: on session-confirm, clearing the marker keeps ALL real query params
  //    (only _arl is stripped); and safeRedirect coerces any non-whitelisted target to login (security).
  { const sb = makeEnv('ok', '/index.html', '?ref=email&_arl=2&tab=market');
    vm.runInContext('_aurixClearRedirectFallback();', sb);
    const href = sb.__location.href, deepOk = /ref=email/.test(href) && /tab=market/.test(href) && !/_arl/.test(href);
    const coerce = makeEnv('ok', '/index.html', ''); call(coerce, 'https://evil.example/pwn', 'tamper');
    const coerceOk = /\/login\.html/.test(coerce.__location._navs[0]) && !/evil/.test(coerce.__location._navs[0]);
    ok('9 deep-link params preserved on clear + non-whitelisted target coerced to login', deepOk && coerceOk, 'href=' + href + ' coerce=' + coerce.__location._navs[0]); }

  // 10. Round-trip probe classifies each storage mode correctly.
  { const okEnv = makeEnv('ok'), thrEnv = makeEnv('throw'), npEnv = makeEnv('nopersist');
    const a = vm.runInContext('_aurixStorageUsable()', okEnv);
    const b = vm.runInContext('_aurixStorageUsable()', thrEnv);
    const c = vm.runInContext('_aurixStorageUsable()', npEnv);
    ok('10 _aurixStorageUsable probe: ok=true, throw=false, nopersist=false', a === true && b === false && c === false, 'ok=' + a + ' throw=' + b + ' nopersist=' + c); }

  // 11. window.__AURIX_REDIRECT_LOOP_BROKEN published when the bound trips.
  { const sb = makeEnv('nopersist', '/index.html', ''); for (let i = 0; i < 10; i++) call(sb, i % 2 ? 'index.html' : 'login.html', 'x');
    const flag = vm.runInContext('window.__AURIX_REDIRECT_LOOP_BROKEN', sb);
    ok('11 __AURIX_REDIRECT_LOOP_BROKEN published on suppression', !!flag && typeof flag === 'object', JSON.stringify(flag)); }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('GATE: NO-GO — ' + fail + ' failed'); process.exit(1); }
  console.log('GATE: GO — all ' + pass + ' assertions passed');
  process.exit(0);
})();
