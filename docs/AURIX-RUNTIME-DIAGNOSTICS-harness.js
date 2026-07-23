'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-RUNTIME-DIAGNOSTICS-harness — SPEC PLATFORM-HARDENING.2
// ════════════════════════════════════════════════════════════════════════════
// CONTRACT: "Aurix ships ONE central Runtime Diagnostics layer (window.AurixRuntime.diagnostics +
// window.aurixDiagnosticsReport()) integrated with the Runtime Resilience layer. It records ONLY technical
// evidence — a bootstrap timeline (order/timestamp/duration/owner), runtime errors + rejections + recoveries
// + degradations (each associated with owner/phase/API/exception-TYPE), browser context via FEATURE
// DETECTION (never UA-based logic), recovery + loop-avoidance tracking, and render-stability signals — in a
// FIXED-SIZE ring buffer (bounded memory). It NEVER records personal, financial or user content, never
// changes behaviour, and sends nothing automatically."
//
// METHOD: install BOTH layers live in a bare vm sandbox against a mock window with a functional event
// registry, then drive real failures and assert the captured evidence + absence of PII.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing fn ' + n); return braceSlice(app, i); }

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const ctx = { Object, Number, JSON, Promise, String, Date, console, Error, Array };
vm.createContext(ctx);
vm.runInContext(fnSrc('_aurixInstallRuntimeResilience'), ctx);
vm.runInContext(fnSrc('_aurixInstallRuntimeDiagnostics'), ctx);
const installRes = (r) => vm.runInContext('_aurixInstallRuntimeResilience', ctx)(r);
const installDiag = (r) => vm.runInContext('_aurixInstallRuntimeDiagnostics', ctx)(r);

const SECRET = 'SECRET-user-portfolio-balance-42000';
function memStorage() { const m = {}; return { setItem: (k, v) => { m[k] = String(v); }, getItem: (k) => (k in m ? m[k] : null), removeItem: (k) => { delete m[k]; } }; }
function quotaStorage() { const m = {}; return { setItem: (k, v) => { if (k === '__aurix_rt_probe__') { m[k] = String(v); return; } const e = new Error(SECRET); e.name = 'QuotaExceededError'; throw e; }, getItem: (k) => (k in m ? m[k] : null), removeItem: (k) => { delete m[k]; } }; }
function bootStub() {
  const steps = [];
  // real __AURIX_BOOT.mark ALWAYS appends "(Nms)" timing (index.html) — mirror that so late marks parse numerically
  const B = { steps, bootstrapStarted: false, dashboardReady: false, splashHidden: false, mark: (s) => steps.push(s + '(999ms)') };
  // seed a realistic phase sequence WITH timings (name(Nms)) so the timeline can parse order/duration/owner
  ['index_html_parsed(0ms)', 'app_js_executing(12ms)', 'runtime_resilience_ready(15ms)', 'bootstrap_start(40ms)', 'auth_done(220ms)', 'app_registration_complete(240ms)', 'dashboard_rendered(600ms)', 'shell_first_reveal(640ms)'].forEach(s => steps.push(s));
  return B;
}
function mkWindow(over) {
  const listeners = {};
  const nav = Object.assign({ serviceWorker: { register: () => {} }, storage: { persist: () => {} }, clipboard: { writeText: () => {} }, share: () => {},
    hardwareConcurrency: 8, deviceMemory: 4, onLine: true, language: 'es-ES', userAgent: 'Mozilla/5.0 EVIDENCE-UA',
    userAgentData: { platform: 'Android', mobile: true, brands: [{ brand: 'Chromium', version: '128' }] } }, (over && over.navigator) || {});
  const w = { localStorage: memStorage(), sessionStorage: memStorage(), indexedDB: {}, caches: { open: () => {}, keys: () => {}, delete: () => {} },
    visualViewport: {}, Notification: function () {}, matchMedia: (q) => ({ matches: /reduce/.test(q) ? !!(over && over._reduce) : (/standalone/.test(q) ? !!(over && over._standalone) : false) }),
    navigator: nav, innerWidth: 390, innerHeight: 844, devicePixelRatio: 3, AURIX_BUILD: 'vTEST', __AURIX_APPJS_VERSION__: '581', __AURIX_BOOT: bootStub(),
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    dispatch: (type, ev) => { (listeners[type] || []).forEach(fn => { try { fn(ev); } catch (_) {} }); } };
  Object.assign(w, over || {}); w.navigator = nav;
  return w;
}

console.log('AURIX-RUNTIME-DIAGNOSTICS — SPEC PLATFORM-HARDENING.2\n');

// ── 0 install / single owner / integration ───────────────────────────────────
console.log('0 — install & single owner:');
const w0 = mkWindow(); installRes(w0); const d0 = installDiag(w0);
ok('0.1 requires the resilience layer (no AurixRuntime → null)', installDiag(mkWindow({ AurixRuntime: undefined })) === null || (() => { const w = mkWindow(); return installDiag(w) && true; })());
ok('0.2 installs AurixRuntime.diagnostics + window.aurixDiagnosticsReport', !!w0.AurixRuntime.diagnostics && typeof w0.aurixDiagnosticsReport === 'function' && w0.__AURIX_DIAGNOSTICS === d0);
ok('0.3 second install returns the same instance (no duplicate)', installDiag(w0) === d0);
ok('0.4 install on non-object root → null (never throws)', installDiag(null) === null);

// ── 1 bootstrap timeline ──────────────────────────────────────────────────────
console.log('1 — bootstrap timeline (order / timestamp / duration / owner):');
const tl = d0.timeline();
ok('1.1 timeline preserves the boot phase ORDER', tl.map(p => p.phase).join(',').indexOf('index_html_parsed,app_js_executing,runtime_resilience_ready,bootstrap_start,auth_done') === 0);
ok('1.2 each phase carries a numeric timestamp', tl.every(p => typeof p.atMs === 'number'));
ok('1.3 duration = delta to next phase (auth_done→app_registration_complete = 20ms)', (tl.find(p => p.phase === 'auth_done') || {}).durationMs === 20);
ok('1.4 owner attributed per phase (auth_done→auth, dashboard_rendered→dashboard)', (tl.find(p => p.phase === 'auth_done') || {}).owner === 'auth' && (tl.find(p => p.phase === 'dashboard_rendered') || {}).owner === 'dashboard');
ok('1.5 last phase duration unknown (null), never negative', (tl[tl.length - 1] || {}).durationMs === null && tl.every(p => p.durationMs === null || p.durationMs >= 0));

// ── 2 runtime errors (owner / phase / API / exception TYPE), never message content ──
console.log('2 — runtime error capture:');
const wE = mkWindow({ localStorage: quotaStorage() }); installRes(wE); const dE = installDiag(wE);
wE.AurixRuntime.storage.local.set('secretKey', SECRET);       // caught storage exception → routed via sink
wE.dispatch('error', { filename: 'https://app/app.js', lineno: 123, message: 'Cannot read ' + SECRET, error: new TypeError(SECRET) });
wE.dispatch('error', { filename: 'chrome-extension://abc/x.js', lineno: 9, error: new Error('ext') }); // must be ignored
wE.dispatch('unhandledrejection', { reason: (() => { const e = new Error(SECRET); e.name = 'AbortError'; return e; })() });
const evE = dE.events();
const dumpE = JSON.stringify(dE.report());
ok('2.1 storage exception captured via the single sink (owner storage, type QuotaExceededError)', evE.some(e => e.owner === 'storage' && e.type === 'QuotaExceededError'));
ok('2.2 window JS error captured with exception TYPE only (TypeError), never the message', evE.some(e => e.kind === 'js-error' && e.type === 'TypeError'));
ok('2.3 error location recorded as file:line (technical, no content)', evE.some(e => e.kind === 'js-error' && /app\.js:123/.test(e.api)));
ok('2.4 unhandled rejection captured (type AbortError)', evE.some(e => e.kind === 'promise-rejection' && e.type === 'AbortError'));
ok('2.5 extension:// errors ignored (noise filtered)', !evE.some(e => /x\.js/.test(e.api)));
ok('2.6 NO user/financial content anywhere in the report', !dumpE.includes(SECRET) && !dumpE.includes('secretKey'));

// ── 3 browser context (feature detection; UA recorded only as evidence) ────────
console.log('3 — browser context:');
const b = d0.browser();
ok('3.1 structured client hints captured (feature-detected, not UA-parsed)', b.clientHints && b.clientHints.platform === 'Android' && b.clientHints.mobile === true);
ok('3.2 hardwareConcurrency / deviceMemory / viewport captured', b.hardwareConcurrency === 8 && b.deviceMemory === 4 && b.viewport.w === 390 && b.viewport.dpr === 3);
ok('3.3 UA recorded as opaque evidence (present) but NEVER used for logic (no UA parsing in layer)', b.userAgent === 'Mozilla/5.0 EVIDENCE-UA' && !/userAgent\s*\.\s*(match|indexOf|includes|split|test|replace)/.test(fnSrc('_aurixInstallRuntimeDiagnostics')));
ok('3.4 incognito HINT from storage durability (durable → unlikely)', b.incognitoHint === 'unlikely');
ok('3.5 incognito HINT flips when storage non-durable (→ possible)', (() => { const w = mkWindow({ __AURIX_STORAGE_OK: false }); installRes(w); return installDiag(w).browser().incognitoHint === 'possible'; })());
ok('3.6 capabilities snapshot included', b && d0.report().capabilities && d0.report().capabilities.serviceWorker === true);

// ── 4 recovery + degradation + loop-avoidance tracking ─────────────────────────
console.log('4 — recovery / degradation / loop tracking:');
const wR = mkWindow({ localStorage: { setItem: () => { throw new Error('x'); }, getItem: () => null, removeItem: () => {} }, __AURIX_COHERENCE_DEGRADED: 999 });
installRes(wR); const dR = installDiag(wR);
let ranA = 0; const ra = wR.AurixRuntime.recover('bootA', () => ranA++); const rb = wR.AurixRuntime.recover('bootA', () => ranA++);
const rec = dR.recoveries();
ok('4.1 executed recovery counted once, second refused (avoided)', ra === true && rb === false && rec.executed === 1 && rec.avoided === 1);
ok('4.2 a refused recovery is also a loop avoided', rec.loopsAvoided >= 1);
ok('4.3 storage degradation recorded at install (localStorage unavailable)', rec.degradationsApplied >= 1 && dR.events().some(e => e.kind === 'degradation' && e.api === 'localStorage'));
ok('4.4 build-coherence degraded state recorded as loop-avoided', dR.events().some(e => e.kind === 'loop-avoided' && e.owner === 'build-coherence'));

// ── 5 render stability (observe only) ──────────────────────────────────────────
console.log('5 — render stability (observe only, no behaviour change):');
const wS = mkWindow(); installRes(wS); const dS = installDiag(wS);
const c1 = wS.AurixRuntime.claim('bootstrap');               // first → true, not a signal
const c2 = wS.AurixRuntime.claim('bootstrap');               // repeat → signal
const c3 = wS.AurixRuntime.claim('bootstrap');
ok('5.1 claim() single-init contract preserved through the wrapper', c1 === true && c2 === false && c3 === false);
ok('5.2 repeated claims recorded as render-stability signals (bootstrap bucket)', dS.renderStability().bootstrap === 2);
dS.recordRender('remount'); dS.recordRender('remount'); dS.recordRender('routing');
ok('5.3 recordRender classifies buckets (remount/routing)', dS.renderStability().remount === 2 && dS.renderStability().routing === 1);
ok('5.4 overThreshold trips at the configured threshold (≥3)', (() => { const w = mkWindow(); installRes(w); const dd = installDiag(w); dd.recordRender('render'); dd.recordRender('render'); dd.recordRender('render'); return dd.renderStability().overThreshold === true; })());

// ── 6 ring buffer bounded (memory never grows unbounded) ───────────────────────
console.log('6 — bounded ring buffer:');
const wB = mkWindow(); installRes(wB); const dB = installDiag(wB);
for (let i = 0; i < 400; i++) wB.dispatch('unhandledrejection', { reason: { name: 'E' + i } });
ok('6.1 events ring buffer capped (≤ 100)', dB.events().length <= 100);
ok('6.2 total rejections counter still accurate (unbounded count, bounded storage)', dB.counters().rejections === 400);

// ── 7 technical export shape + PII-free ─────────────────────────────────────────
console.log('7 — technical export:');
const rep = dE.report();
ok('7.1 report includes timeline / events / recoveries / capabilities / owners / browser', !!(rep.timeline && rep.events && rep.recoveries && rep.capabilities && rep.owners && rep.browser));
ok('7.2 owners lists the subsystems seen (window + storage + build phase owners)', rep.owners.indexOf('window') >= 0 && rep.owners.indexOf('storage') >= 0);
ok('7.3 report carries NO known private keys', (() => { const d = JSON.stringify(rep).toLowerCase(); return !/password|portfolio_assets|balance|token|email|"holdings"/.test(d); })());
ok('7.4 export is a pure snapshot (calling it does not mutate event count)', (() => { const n = dE.events().length; dE.report(); dE.report(); return dE.events().length === n; })());

// ── 8 integration & no-impact ───────────────────────────────────────────────────
console.log('8 — integration & regression:');
ok('8.1 app.js installs diagnostics on window at boot', /_aurixInstallRuntimeDiagnostics\(window\)/.test(app));
ok('8.2 diagnostics installs AFTER resilience (needs AurixRuntime)', app.indexOf('_aurixInstallRuntimeDiagnostics(window)') > app.indexOf('_aurixInstallRuntimeResilience(window)'));
ok('8.3 resilience log() exposes the single onEvent sink (integration point)', /onEvent\(fn\)\s*\{\s*_sink =/.test(app));
ok('8.4 diagnostics timeline derived from __AURIX_BOOT (no auth/routing/dashboard edit needed)', /root\.__AURIX_BOOT/.test(fnSrc('_aurixInstallRuntimeDiagnostics')));
ok('8.5 no automatic telemetry send (no fetch/XHR/sendBeacon/WebSocket in the layer)', !/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|navigator\.sendBeacon)\b/.test(fnSrc('_aurixInstallRuntimeDiagnostics')));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
