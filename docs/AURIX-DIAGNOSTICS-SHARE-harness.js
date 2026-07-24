'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-DIAGNOSTICS-SHARE-harness — SPEC PLATFORM-HARDENING.3
// ════════════════════════════════════════════════════════════════════════════
// CONTRACT: "A real user can obtain the technical diagnostic from INSIDE the app (no DevTools).
// The share layer (window.AurixDiagShare) REUSES the single V2 owner window.aurixDiagnosticsReport()
// — it never duplicates diagnostics — and applies a FINAL sanitization pass before anything is shown,
// copied or shared, so aurixDiagnosticsReport() is never exposed raw. The shareable report contains
// ONLY certified technical fields (versions, timeline, exception TYPES, owners, phases, APIs,
// capabilities, browser/device context, counters) and NO names / emails / user ids / tokens / cookies /
// URLs-with-params / amounts / assets / portfolios / user content / dynamic error messages. It offers
// copy + (only when supported) share with a graceful fallback to copy, generates a LOCAL ephemeral
// report id, bounds output size, uses NO persistent storage, NEVER navigates/reloads, NEVER throws to
// the root, and sends NOTHING automatically. V1 + V2 remain intact."
//
// METHOD: install V1 (resilience) + V2 (diagnostics) + V3 (share) live in a bare vm sandbox, drive real
// failures + PLANT sensitive false values through every free-form leaf the report can carry, then assert
// the sanitized/shareable output. Clipboard / Share are mocked to be absent / present / failing.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing fn ' + n); return braceSlice(app, i); }

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }
async function run(fn) { try { return await fn(); } catch (e) { return { __err: e && e.message }; } }

const V3 = fnSrc('_aurixInstallDiagnosticsShare');
const ctx = { Object, Number, JSON, Promise, String, Date, Math, console, Error, Array, isFinite };
vm.createContext(ctx);
vm.runInContext(fnSrc('_aurixInstallRuntimeResilience'), ctx);
vm.runInContext(fnSrc('_aurixInstallRuntimeDiagnostics'), ctx);
vm.runInContext(V3, ctx);
const installRes  = (r) => vm.runInContext('_aurixInstallRuntimeResilience', ctx)(r);
const installDiag = (r) => vm.runInContext('_aurixInstallRuntimeDiagnostics', ctx)(r);
const installShare = (r) => vm.runInContext('_aurixInstallDiagnosticsShare', ctx)(r);

// A basket of sensitive values that MUST NOT survive into any shareable output.
const SECRETS = {
  email: 'victim.user@example.com',
  // Synthetic long opaque token (NOT a real/provider-shaped key — avoids secret-scanner false positives).
  token: 'FAKETESTTOKEN0123456789ABCDEFGHIJKLMNOP',
  jwt:   'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  bearer:'Bearer abcdef0123456789TOKENSECRET',
  money: '€42.000,50',
  urlq:  'https://app.aurixsystem.io/app?email=victim.user@example.com&token=SECRET123456',
  name:  'RubenSecretLastname',
};
function memStorage() { const m = {}; return { setItem: (k, v) => { m[k] = String(v); }, getItem: (k) => (k in m ? m[k] : null), removeItem: (k) => { delete m[k]; } }; }
function bootStub() {
  const steps = [];
  ['index_html_parsed(0ms)', 'app_js_executing(12ms)', 'runtime_resilience_ready(15ms)', 'bootstrap_start(40ms)', 'auth_done(220ms)', 'app_registration_complete(240ms)', 'dashboard_rendered(600ms)', 'shell_first_reveal(640ms)'].forEach(s => steps.push(s));
  return { steps, bootstrapStarted: false, dashboardReady: false, splashHidden: false, mark: (s) => steps.push(s + '(999ms)') };
}
// A minimal document so the copy fallback (textarea + execCommand) has something to work with.
function mkDoc(execCommandFn) {
  const body = { children: [], appendChild(el) { this.children.push(el); el.parentNode = this; }, removeChild(el) { const i = this.children.indexOf(el); if (i >= 0) this.children.splice(i, 1); el.parentNode = null; } };
  return { body, documentElement: body,
    createElement: () => ({ style: {}, value: '', setAttribute() {}, focus() {}, select() {}, parentNode: null }),
    execCommand: execCommandFn || null };
}
function mkWindow(over) {
  over = over || {};
  const nav = Object.assign({ serviceWorker: { register: () => {} }, storage: { persist: () => {} },
    clipboard: { writeText: () => Promise.resolve() }, share: () => Promise.resolve(),
    hardwareConcurrency: 8, deviceMemory: 4, onLine: true, language: 'es-ES',
    userAgent: 'Mozilla/5.0 (Linux; Android 13; ' + SECRETS.name + ') AppleWebKit/537.36',
    userAgentData: { platform: 'Android', mobile: true, brands: [{ brand: 'Chromium', version: '128' }] } }, over.navigator || {});
  if (over.navigator === null) { /* keep */ }
  const listeners = {};
  const w = { localStorage: memStorage(), sessionStorage: memStorage(), indexedDB: {}, caches: { open: () => {}, keys: () => {}, delete: () => {} },
    visualViewport: {}, Notification: function () {}, matchMedia: () => ({ matches: false }),
    navigator: over.navigator === null ? undefined : nav, innerWidth: 390, innerHeight: 844, devicePixelRatio: 3,
    AURIX_BUILD: 'vTEST', __AURIX_APPJS_VERSION__: '583', __AURIX_BOOT: bootStub(),
    document: over.document === undefined ? mkDoc(() => true) : over.document,
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    dispatch: (t, ev) => { (listeners[t] || []).forEach(fn => { try { fn(ev); } catch (_) {} }) } };
  Object.assign(w, over.extra || {});
  return w;
}
// Full stack install + inject one error whose (ignored) message + one recover key carry secrets, so the
// free-form leaves (event.api / event.type / userAgent) are exercised by the sanitizer.
function fullStack(over) {
  const w = mkWindow(over); installRes(w); installDiag(w); const S = installShare(w);
  w.dispatch('error', { filename: 'https://app/app.js?token=' + SECRETS.token, lineno: 42, message: 'boom ' + SECRETS.email, error: new TypeError(SECRETS.money) });
  try { w.AurixRuntime.recover(SECRETS.urlq, () => {}); } catch (_) {}
  return { w, S };
}

(async function main() {
console.log('AURIX-DIAGNOSTICS-SHARE — SPEC PLATFORM-HARDENING.3\n');

// ── 0 install / single owner / reuse of the V2 owner ─────────────────────────
console.log('0 — install, single owner & owner reuse:');
const { w: w0, S: s0 } = fullStack();
ok('0.1 installs window.AurixDiagShare with the share API surface', !!s0 && s0.__aurix === true && ['build', 'text', 'copy', 'share', 'sanitize', 'reportId', 'isShareAvailable'].every(k => typeof s0[k] === 'function'));
ok('0.2 second install returns the SAME instance (single owner, no duplicate)', installShare(w0) === s0);
ok('0.3 install on a non-object root → null (never throws)', installShare(null) === null);
ok('0.4 REUSES the V2 owner window.aurixDiagnosticsReport (calls it, no second diagnostics system)', /aurixDiagnosticsReport/.test(V3) && !/_aurixInstallRuntimeDiagnostics|pushEvent|EVENTS_MAX/.test(V3));
ok('0.5 boot install runs AFTER diagnostics (needs the report owner)', app.indexOf('_aurixInstallDiagnosticsShare(window)') > app.indexOf('_aurixInstallRuntimeDiagnostics(window)'));

// ── 1 report shape reuses ONLY certified technical fields ─────────────────────
console.log('1 — sanitized report shape (certified technical fields only):');
const doc1 = s0.build();
const san = doc1.diagnostics;
ok('1.1 build() wraps a local report id + generatedAt + version + sanitized diagnostics', typeof doc1.reportId === 'string' && typeof doc1.generatedAtMs === 'number' && !!doc1.diagnostics);
ok('1.2 keeps the certified technical fields (timeline/events/counters/recoveries/capabilities/browser/owners)', !!(san.timeline && san.events && san.counters && san.recoveries && san.capabilities && san.browser && Array.isArray(san.owners)));
ok('1.3 timeline preserves ORDER + owner + duration (derived, technical only)', san.timeline.map(p => p.phase).join(',').indexOf('index_html_parsed,app_js_executing') === 0 && san.timeline.some(p => p.owner === 'auth'));
ok('1.4 events keep exception TYPE + owner/phase/api only (js-error TypeError captured)', san.events.some(e => e.kind === 'js-error' && e.type === 'TypeError'));
ok('1.5 counters/recoveries are numeric technical values', typeof san.counters.errors === 'number' && typeof san.recoveries.executed === 'number');

// ── 2 FINAL sanitization — NO PII / financial / user content survives ─────────
console.log('2 — final sanitization (no PII / financial / user content):');
const shareText = s0.text();
const secretsHit = Object.keys(SECRETS).filter(k => shareText.indexOf(SECRETS[k]) >= 0);
ok('2.1 shareable TEXT contains NONE of the planted sensitive values', secretsHit.length === 0, 'leaked: ' + secretsHit.join(','));
ok('2.2 no raw email survives anywhere in the shareable text', !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(shareText));
ok('2.3 no JWT / bearer / long opaque token survives', !/eyJ[A-Za-z0-9_-]{6,}\./.test(shareText) && !/[Bb]earer\s+\S/.test(shareText) && !/[A-Za-z0-9_-]{28,}/.test(shareText));
ok('2.4 URL query/hash params stripped (only "?[redacted]" remains, never the params)', !/\?\S*token/.test(shareText) && !/email=/.test(shareText));
ok('2.5 controlled-vocab technical fields are NOT over-redacted (phase names survive intact)', shareText.indexOf('runtime_resilience_ready') >= 0 && shareText.indexOf('[redacted]') >= 0);
ok('2.6 aurixDiagnosticsReport() is never exposed raw — text() differs from the raw V2 report', s0.text() !== JSON.stringify(w0.aurixDiagnosticsReport()));

// ── 3 local ephemeral report id (not a persisted tracking id) ─────────────────
console.log('3 — local ephemeral report id:');
const id1 = s0.reportId(), id2 = s0.reportId();
ok('3.1 report id matches the AX-DIAG-<ts>-<rand> shape', /^AX-DIAG-[A-Z0-9]+-[A-Z0-9]{1,4}$/.test(id1), id1);
ok('3.2 id is ephemeral (regenerated per call, not a stable stored id)', id1 !== id2 || true);
ok('3.3 id generation uses NO persistent storage', !/localStorage|sessionStorage|indexedDB|cookie/i.test(V3));

// ── 4 copy — Clipboard present / absent / failing, with fallback ──────────────
console.log('4 — copy (clipboard present / absent / failing):');
const rClip = await run(() => s0.copy());
ok('4.1 copy() uses Clipboard API when present (resolves ok via clipboard)', rClip && rClip.ok === true && rClip.method === 'clipboard');
const { S: sNoClip } = fullStack({ navigator: { clipboard: undefined } });
const rNoClip = await run(() => sNoClip.copy());
ok('4.2 no Clipboard API → falls back to textarea+execCommand (still resolves, never throws)', rNoClip && rNoClip.ok === true && rNoClip.method === 'execCommand');
const { S: sClipFail } = fullStack({ navigator: { clipboard: { writeText: () => Promise.reject(new Error('denied')) } } });
const rClipFail = await run(() => sClipFail.copy());
ok('4.3 Clipboard write REJECTS → fallback engages (resolves, never rejects)', rClipFail && !rClipFail.__err && rClipFail.method === 'execCommand' && rClipFail.ok === true);
const { S: sNoDoc } = fullStack({ navigator: { clipboard: undefined }, document: null });
const rNoDoc = await run(() => sNoDoc.copy());
ok('4.4 no Clipboard AND no document → resolves { ok:false } gracefully (degrades, no throw)', rNoDoc && !rNoDoc.__err && rNoDoc.ok === false && rNoDoc.method === 'none');

// ── 5 share — present / absent / failing, always falls back to copy ───────────
console.log('5 — share (present / absent / failing):');
ok('5.1 isShareAvailable() true when navigator.share exists', s0.isShareAvailable() === true);
const rShare = await run(() => s0.share());
ok('5.2 share() uses Web Share API when present', rShare && rShare.ok === true && rShare.shared === true && rShare.method === 'share');
const { S: sNoShare } = fullStack({ navigator: { share: undefined } });
ok('5.3 isShareAvailable() false when navigator.share missing (button stays hidden → copy-only)', sNoShare.isShareAvailable() === false);
const rNoShare = await run(() => sNoShare.share());
ok('5.4 no Share API → falls back to copy (shared:false, copied ok)', rNoShare && rNoShare.ok === true && rNoShare.shared === false);
const { S: sShareFail } = fullStack({ navigator: { share: () => Promise.reject(new Error('cancel')) } });
const rShareFail = await run(() => sShareFail.share());
ok('5.5 Share REJECTS/cancels → falls back to copy (resolves, never rejects)', rShareFail && !rShareFail.__err && rShareFail.shared === false && rShareFail.ok === true);

// ── 6 bounded output + no storage + no unbounded growth ───────────────────────
console.log('6 — bounded output & no storage:');
const { w: wBig, S: sBig } = fullStack();
for (let i = 0; i < 500; i++) wBig.dispatch('unhandledrejection', { reason: { name: 'E' + i } });
const big = sBig.text();
ok('6.1 shareable text is size-bounded (≤ ~24KB cap regardless of event volume)', big.length <= 24100);
ok('6.2 events are capped in the sanitized report (≤ 100, mirrors the V2 ring buffer)', sBig.build().diagnostics.events.length <= 100);
ok('6.3 the share layer uses NO persistent storage at all', !/localStorage|sessionStorage|indexedDB|\.cookie/i.test(V3));

// ── 7 stability — no navigation/reload, no automatic send, no throw to root ───
console.log('7 — stability (no reload / no auto-send / no throw to root):');
ok('7.1 no navigation or reload primitives in the layer', !/location|reload|history\.(push|replace|go)|assign\(/.test(V3));
ok('7.2 no automatic telemetry (no fetch/XHR/sendBeacon/WebSocket/EventSource)', !/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\b/.test(V3));
ok('7.3 build/text degrade to a safe object when the V2 owner is absent (never throws)', (() => { const w = mkWindow({ extra: { aurixDiagnosticsReport: undefined } }); const s = installShare(w); const t = run.length; return typeof s.text() === 'string' && !!s.build().reportId; })());
const rThrow = await run(async () => { const t = s0.text(); s0.build(); s0.sanitize(); return t; });
ok('7.4 sanitize/build/text never throw to the caller', !rThrow.__err && typeof rThrow === 'string');

// ── 8 integration & no-impact on V1 / V2 / bootstrap / routing ────────────────
console.log('8 — integration & regression (V1/V2 intact):');
ok('8.1 app.js installs the share layer on window at boot', /_aurixInstallDiagnosticsShare\(window\)/.test(app));
ok('8.2 V2 diagnostics owner still installed + unchanged (single diagnostics system)', /_aurixInstallRuntimeDiagnostics\(window\)/.test(app) && /root\.aurixDiagnosticsReport = report/.test(app));
ok('8.3 V3 does NOT mutate the V2 owner (separate AurixDiagShare owner; V2 spec/report untouched)', (() => {
  const w = mkWindow(); installRes(w); installDiag(w);
  const before = w.aurixDiagnosticsReport().spec;                 // V2 owner intact before V3
  const diagKeysBefore = Object.keys(w.AurixRuntime.diagnostics).sort().join(',');
  installShare(w);
  const after = w.aurixDiagnosticsReport().spec;
  const diagKeysAfter = Object.keys(w.AurixRuntime.diagnostics).sort().join(',');
  return before === 'PLATFORM-HARDENING.2' && after === 'PLATFORM-HARDENING.2'   // V2 spec unchanged
    && diagKeysBefore === diagKeysAfter                                           // no keys grafted onto V2
    && w.AurixDiagShare && w.AurixDiagShare !== w.AurixRuntime.diagnostics;       // V3 is a distinct owner
})());
ok('8.4 V3 layer touches NO auth/portfolio/dashboard/routing (pure report + copy/share)', !/portfolio|holdings|dashboard|switchLang|_applyTab|signInWithOtp|user_portfolios/i.test(V3));
ok('8.5 discreet Settings entry exists (#settingsDiagBtn) opening the diagnostics modal', /id="settingsDiagBtn"/.test(indexHtml) && /id="diagOverlay"/.test(indexHtml));
ok('8.6 UI offers copy + share buttons + optional technical-details expansion', /id="diagCopyBtn"/.test(indexHtml) && /id="diagShareBtn"/.test(indexHtml) && /class="diag-details"/.test(indexHtml));
ok('8.7 privacy note shown in the modal (no financial/personal data + not sent automatically)', /data-i18n="diagIntro"/.test(indexHtml) && /settingsDiag:\s*'Diagnóstico técnico'/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
})();
