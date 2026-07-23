'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-RUNTIME-RESILIENCE-harness — SPEC PLATFORM-HARDENING.1
// ════════════════════════════════════════════════════════════════════════════
// CONTRACT: "Aurix ships ONE central, reusable Runtime Resilience layer (window.AurixRuntime). Every
// critical browser API (localStorage / sessionStorage / IndexedDB / Cache / capabilities) routed through it
// degrades safely when that API is ABSENT, BLOCKED or THROWS — the layer itself never throws, capabilities
// are detected by FEATURE DETECTION (never User-Agent), bootstrap stays single (one init / one recovery,
// never a loop), runtime exceptions are contained, and telemetry is technical-only (owner/api/type/phase),
// never personal, financial or user content."
//
// METHOD: extract `_aurixInstallRuntimeResilience` from app.js and INSTALL IT LIVE in a bare vm sandbox
// against adversarial mock `window`s (storage throws, storage silently fails, IDB absent, Cache absent, SW
// absent, visualViewport absent). Real behaviour is asserted — not just regex over source.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing fn ' + n); return braceSlice(app, i); }

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const INSTALL_SRC = fnSrc('_aurixInstallRuntimeResilience');
const ctx = { Object, Number, JSON, Promise, String, Date, console, Error };
vm.createContext(ctx);
vm.runInContext(INSTALL_SRC, ctx);
const install = (rootObj) => vm.runInContext('_aurixInstallRuntimeResilience', ctx)(rootObj);

// ── mock browser globals ─────────────────────────────────────────────────────
function memStorage() { const m = {}; return { setItem: (k, v) => { m[k] = String(v); }, getItem: (k) => (k in m ? m[k] : null), removeItem: (k) => { delete m[k]; } }; }
function throwingStorage() { const e = () => { const err = new Error('SECRET-user-content-should-never-be-logged'); err.name = 'SecurityError'; throw err; }; return { setItem: e, getItem: e, removeItem: () => {} }; }
function silentStorage() { return { setItem: () => {}, getItem: () => null, removeItem: () => {} }; } // write no-op, read null (partitioned)
function quotaStorage() { // passes the round-trip probe, but throws (QuotaExceededError) on a real write
  const m = {};
  return { setItem: (k, v) => { if (k === '__aurix_rt_probe__') { m[k] = String(v); return; } const e = new Error('SECRET-user-content-should-never-be-logged'); e.name = 'QuotaExceededError'; throw e; },
    getItem: (k) => (k in m ? m[k] : null), removeItem: (k) => { delete m[k]; } };
}
function mkWindow(over) {
  const nav = Object.assign({ serviceWorker: { register: () => {} }, storage: { persist: () => {} }, clipboard: { writeText: () => {} }, share: () => {}, hardwareConcurrency: 8, deviceMemory: 4 }, (over && over.navigator) || {});
  const w = { localStorage: memStorage(), sessionStorage: memStorage(), indexedDB: {}, caches: { open: () => {}, keys: () => {}, delete: () => {} },
    visualViewport: {}, Notification: function () {}, matchMedia: (q) => ({ matches: /reduce/.test(q) ? !!(over && over._reduce) : false }), navigator: nav,
    AURIX_BUILD: 'vTEST', __AURIX_APPJS_VERSION__: '580' };
  Object.assign(w, over || {}); w.navigator = nav; return w;
}

console.log('AURIX-RUNTIME-RESILIENCE — SPEC PLATFORM-HARDENING.1\n');

// ── 1 single owner / clean install ───────────────────────────────────────────
console.log('1 — single owner:');
const w1 = mkWindow();
const rt = install(w1);
ok('1.1 installs window.AurixRuntime', !!w1.AurixRuntime && w1.AurixRuntime === rt);
ok('1.2 second install returns the SAME instance (no duplicate wrapper)', install(w1) === rt);
ok('1.3 exposes __AURIX_RUNTIME alias + aurixRuntimeStatus()', w1.__AURIX_RUNTIME === rt && typeof w1.aurixRuntimeStatus === 'function');
ok('1.4 install on non-object root → null (never throws)', install(null) === null);

// ── 2 capabilities: feature detection ONLY (all present) ──────────────────────
console.log('2 — capability detection (feature detection, no UA):');
const c = rt.capabilities;
ok('2.1 detects localStorage / sessionStorage present', c.localStorage === true && c.sessionStorage === true);
ok('2.2 detects indexedDB / cacheStorage / serviceWorker present', c.indexedDB === true && c.cacheStorage === true && c.serviceWorker === true);
ok('2.3 detects visualViewport / notifications / clipboard / share', c.visualViewport === true && c.notifications === true && c.clipboard === true && c.share === true);
ok('2.4 reads hardwareConcurrency / deviceMemory numerically', c.hardwareConcurrency === 8 && c.deviceMemory === 4);
ok('2.5 NO User-Agent sniffing anywhere in the layer', !/userAgent|navigator\.platform|\bUA\b/.test(INSTALL_SRC));
ok('2.6 has() reads capability map', rt.has('serviceWorker') === true && rt.has('nope') === false);

// ── 3 safe storage: throwing / silent / absent all degrade, never throw ───────
console.log('3 — storage safe degradation:');
const wThrow = mkWindow({ localStorage: throwingStorage() });
const rtT = install(wThrow);
ok('3.1 throwing localStorage → capability false (round-trip probe caught)', rtT.capabilities.localStorage === false);
let threw = false, r31; try { r31 = rtT.storage.local.set('k', 'v'); } catch (_) { threw = true; }
ok('3.2 set() on throwing storage returns false, never throws', threw === false && r31 === false);
ok('3.3 get() returns supplied fallback when unavailable', rtT.storage.local.get('k', 'FB') === 'FB');
const wSilent = mkWindow({ localStorage: silentStorage() });
const rtS = install(wSilent);
ok('3.4 silent-failure storage (write ok, read null) detected as unavailable', rtS.capabilities.localStorage === false);
// working storage round-trips through the wrapper
const rtW = install(mkWindow());
rtW.storage.local.setJson('obj', { a: 1 });
ok('3.5 setJson/json round-trips on working storage', JSON.stringify(rtW.storage.local.json('obj')) === '{"a":1}');
ok('3.6 json() returns fallback on missing key', rtW.storage.local.json('missing', 'FB') === 'FB');
// reuse of index.html's authoritative sessionStorage probe (no duplicate probe)
const wReuse = mkWindow({ __AURIX_STORAGE_OK: false });
ok('3.7 reuses index.html __AURIX_STORAGE_OK probe for session availability', install(wReuse).capabilities.sessionStorage === false);

// ── 4 absent APIs: IndexedDB / Cache / ServiceWorker / visualViewport ─────────
console.log('4 — absent browser APIs degrade safely:');
const wBare = mkWindow({ indexedDB: undefined, caches: undefined, visualViewport: undefined, navigator: { serviceWorker: undefined } });
const rtB = install(wBare);
ok('4.1 IndexedDB absent → capability false', rtB.capabilities.indexedDB === false);
ok('4.2 Cache API absent → capability false', rtB.capabilities.cacheStorage === false);
ok('4.3 ServiceWorker absent → capability false', rtB.capabilities.serviceWorker === false);
ok('4.4 visualViewport absent → capability false + degraded flag', rtB.capabilities.visualViewport === false && rtB.degraded.visualViewport === true);

// ── 5 bootstrap protection: single init, single controlled recovery ───────────
console.log('5 — bootstrap protection (single init / single recovery):');
const rtG = install(mkWindow());
ok('5.1 claim(key) true first time, false forever after (single init)', rtG.claim('bootstrap') === true && rtG.claim('bootstrap') === false);
let onceN = 0; rtG.once('render', () => { onceN++; }); rtG.once('render', () => { onceN++; });
ok('5.2 once(key,fn) runs the fn exactly once (no double render)', onceN === 1);
let recN = 0; const r1 = rtG.recover('boot', () => { recN++; }); const r2 = rtG.recover('boot', () => { recN++; });
ok('5.3 recover() allows exactly ONE retry then refuses (never infinite loop)', r1 === true && r2 === false && recN === 1);
ok('5.4 recover(key,fn,2) honours an explicit max', (() => { let n = 0; const a = rtG.recover('x', () => n++, 2), b = rtG.recover('x', () => n++, 2), d = rtG.recover('x', () => n++, 2); return a && b && !d && n === 2; })());

// ── 6 runtime protection: contain exceptions, return fallback ─────────────────
console.log('6 — runtime protection:');
const rtP = install(mkWindow());
let pThrew = false, pv; try { pv = rtP.protect('bootstrap', 'test', () => { throw new Error('boom'); }, 'FALLBACK'); } catch (_) { pThrew = true; }
ok('6.1 protect() contains a throw and returns the fallback', pThrew === false && pv === 'FALLBACK');
ok('6.2 protect() passes through a normal return', rtP.protect('runtime', 'test', () => 42, 0) === 42);

// ── 7 logging: technical-only, bounded, never leaks content ───────────────────
console.log('7 — logging (technical-only, no PII/financial/user content):');
const rtL = install(mkWindow({ localStorage: quotaStorage() })); // probe passes ⇒ available; real write throws ⇒ caught+logged
ok('7.0 quota storage passes the probe (capability true)', rtL.capabilities.localStorage === true);
rtL.storage.local.set('secretKey', 'SECRET-user-content-should-never-be-logged'); // forces a caught throw
const logs = rtL.logs();
const dump = JSON.stringify(logs);
ok('7.1 a caught storage exception is logged', logs.length >= 1);
ok('7.2 log records the exception TYPE, never its message/content', /"type":"QuotaExceededError"/.test(dump) && !/SECRET-user-content/.test(dump));
ok('7.3 log carries owner + api + phase (technical telemetry)', logs.some(l => l.owner === 'storage' && /setItem/.test(l.api) && l.phase === 'runtime'));
ok('7.4 log values NEVER carry the stored key/value payload', !dump.includes('secretKey'));
// ring buffer bound
const rtR = install(mkWindow());
for (let i = 0; i < 500; i++) rtR.log({ owner: 'x', api: 'y', phase: 'z', type: 'T' });
ok('7.5 telemetry ring buffer is bounded (≤ 120)', rtR.logs().length <= 120);
ok('7.6 status() is a safe technical snapshot (no user data)', (() => { const s = rtR.status(); return s.version === '1' && s.capabilities && typeof s.logCount === 'number' && !('user' in s) && !('portfolio' in s); })());

// ── 8 async storage owners degrade without rejecting ──────────────────────────
console.log('8 — async storage owners (IndexedDB / Cache) degrade without rejecting:');
(async () => {
  const rtA = install(mkWindow({ indexedDB: undefined, caches: undefined }));
  let aThrew = false, ig, iset, co, ck;
  try {
    ig = await rtA.storage.idb.get('k', 'FB');
    iset = await rtA.storage.idb.set('k', 'v');
    co = await rtA.storage.cache.open('c');
    ck = await rtA.storage.cache.keys();
  } catch (_) { aThrew = true; }
  ok('8.1 idb.get() with IDB absent resolves fallback (no reject)', aThrew === false && ig === 'FB');
  ok('8.2 idb.set() with IDB absent resolves false (no reject)', iset === false);
  ok('8.3 cache.open() absent resolves null, cache.keys() resolves []', co === null && Array.isArray(ck) && ck.length === 0);

  // ── 9 app.js + index.html integration (installed on window; existing guards intact) ──
  console.log('9 — integration & regression:');
  ok('9.1 app.js installs the layer on window at boot', /_aurixInstallRuntimeResilience\(window\)/.test(app));
  ok('9.2 layer installs BEFORE the build-coherence contract (earliest reusable owner)', app.indexOf('_aurixInstallRuntimeResilience(window)') < app.indexOf("function _aurixResolveBuildCoherence"));
  ok('9.3 index.html _storageOk round-trip probe still present (existing owner intact)', /_storageOk = \(function \(\) \{ try \{ var k = '__aurix_probe__'; sessionStorage\.setItem/.test(html));
  ok('9.4 existing _aurixStorageUsable owner untouched', /function _aurixStorageUsable\(\)/.test(app));

  console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})();
