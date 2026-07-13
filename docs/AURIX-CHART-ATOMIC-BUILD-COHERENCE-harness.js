'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-ATOMIC-BUILD-COHERENCE-harness — SPEC DSH.CHART.ATOMIC_BUILD_COHERENCE.43
// ════════════════════════════════════════════════════════════════════════════
// Both authenticated accounts stayed on v521 after v522 deployed (window.aurixAuditTemporalWindow is not a
// function) — a build-coherence defect: the old stale-bundle guard compared version.json vs index APPJS_V
// only and blocked retry permanently (marker set once per target, before adoption). This SPEC adds one
// runtime contract: version.json.appjs === index APPJS_V === app.js?v= === __AURIX_APPJS_VERSION__, with at
// most ONE controlled cache-busted reload per expected version, marker cleared on coherence, recoverable
// state on exhaust (never a loop, never a silent mixed release), and the temporal audit auto-run once when
// coherent. This harness proves the pure decision helper (all 14 cases) + the exports/exposure + that NO
// chart/auth/storage owner is touched.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const versionJson = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing ' + n); return braceSlice(app, i); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const ctx = { console: { log() {} }, Math, JSON, Number, isFinite, parseInt, Object, Array };
vm.createContext(ctx);
vm.runInContext(fnSrc('_aurixResolveBuildCoherence'), ctx);
const R = (e, iv, rv, xv, rs, cap) => vm.runInContext('_aurixResolveBuildCoherence', ctx)(e, iv, rv, xv, rs || null, cap || null);
// SPEC.44 capability-state fixtures — a fully-registered bundle vs one missing the temporal audit.
const CAPS_OK = { registrationComplete: true, required: { temporalWindowAudit: true, geometricAudit: true, snapshotContinuityAudit: true } };
const CAPS_MISSING_TW = { registrationComplete: true, required: { temporalWindowAudit: false, geometricAudit: true, snapshotContinuityAudit: true } };
const CAPS_INCOMPLETE = { registrationComplete: false, required: { temporalWindowAudit: true, geometricAudit: true, snapshotContinuityAudit: true } };

console.log('\nAURIX-CHART-ATOMIC-BUILD-COHERENCE — SPEC.43');

// ── 0 marker + single owner + four version sources aligned at 523 ────────────
ok('0 SPEC.43 marker present', app.indexOf('ATOMIC_BUILD_COHERENCE.43') >= 0);
ok('0 SPEC.44 marker present (extends the SPEC.43 owner — not a new build system)', app.indexOf('RUNTIME_CAPABILITY_COHERENCE.44') >= 0);
ok('0 single _aurixResolveBuildCoherence owner', (app.match(/^function _aurixResolveBuildCoherence\(/gm) || []).length === 1);
ok('0 version.json.appjs = 539', versionJson.appjs === 539);
ok('0 index APPJS_V = 539', /var APPJS_V = '539';/.test(indexHtml));
ok('0 index requests app.js?v=539', /app\.js\?v=539/.test(indexHtml));
ok('0 executed bundle self-version __AURIX_APPJS_VERSION__ = 539', /__AURIX_APPJS_VERSION__ = '539';/.test(app));

// ── 1 all four match → no reload ─────────────────────────────────────────────
(function () { const d = R(523, 523, 523, 523, null); ok('1 all match ⇒ coherent + action none (no reload)', d.coherent === true && d.action === 'none' && d.clearMarker === true, JSON.stringify(d)); })();

// ── 2 browser executes v521 while expected v522 → one reload ─────────────────
(function () { const d = R(522, 521, 521, 521, null); ok('2 executed v521 vs expected v522 ⇒ action reload', d.action === 'reload' && d.coherent === false && d.nextReloadState.v === 522 && d.nextReloadState.n === 1); })();

// ── 3 index stale but version.json current → authoritative = expected ────────
(function () { const d = R(523, 521, 521, 521, null); ok('3 stale index ⇒ mismatch(indexVersion) + reload to authoritative expected', d.mismatchFields.indexOf('indexVersion') >= 0 && d.action === 'reload' && d.nextReloadState.v === 523); })();

// ── 4 script query stale → mismatch flagged (corrected URL uses expected) ────
(function () { const d = R(523, 523, 521, 523, null); ok('4 stale requested query ⇒ mismatch(requestedVersion)', d.mismatchFields.indexOf('requestedVersion') >= 0 && d.coherent === false);
  ok('4 reload URL is built from expected (aurixApplyBuildUpdate uses __AURIX_LATEST_APPJS)', /aurixApplyBuildUpdate[\s\S]{0,400}__AURIX_LATEST_APPJS/.test(app)); })();

// ── 5 executed bundle stale → mismatch detected ──────────────────────────────
(function () { const d = R(523, 523, 523, 521, null); ok('5 stale executed bundle ⇒ mismatch(executedVersion) + not coherent', d.mismatchFields.indexOf('executedVersion') >= 0 && d.coherent === false && d.action === 'reload'); })();

// ── 6 successful reload clears marker (coherent ⇒ clearMarker) ───────────────
(function () { const d = R(523, 523, 523, 523, { v: 523, n: 1, ts: 1 }); ok('6 coherent after reload ⇒ clearMarker true + no further reload', d.coherent === true && d.clearMarker === true && d.action === 'none'); })();

// ── 7 repeated mismatch does NOT loop (one attempt spent ⇒ recoverable) ──────
(function () { const d = R(523, 521, 521, 521, { v: 523, n: 1, ts: 1 }); ok('7 still mismatched after 1 attempt ⇒ recoverable (never loop)', d.action === 'recoverable' && d.reloadAttempted === true); })();

// ── 8 auth/portfolio/history/storage NOT touched by the coherence code ───────
(function () {
  const boot = (function () { const i = app.indexOf('_aurixBuildCoherenceBoot'); return app.slice(i, i + 8000); })();
  const helper = fnSrc('_aurixResolveBuildCoherence');
  const blob = boot + helper;
  const forbidden = ['categoryHistory =', '_clearLocalUserState', 'signOut', 'logout', 'removeItem(\'category', 'localStorage.clear', 'sessionStorage.clear', 'currentUser =', 'portfolio_revision', 'auth.signOut'];
  const hit = forbidden.filter(t => blob.indexOf(t) >= 0);
  ok('8 coherence code never clears auth/portfolio/history/storage', hit.length === 0, 'hit: ' + hit.join(','));
  ok('8 only the reload marker + HTTP caches are touched', blob.indexOf("sessionStorage.removeItem(MK)") >= 0 && blob.indexOf('caches.delete') >= 0 && blob.indexOf('localStorage.removeItem') < 0);
})();

// ── 9 coherent v522+ ⇒ temporal audit auto-run once (wired) + audit exists ───
(function () {
  ok('9 aurixAuditTemporalWindow exists in bundle (SPEC.42, loaded)', app.indexOf('window.aurixAuditTemporalWindow = function') >= 0);
  const boot = app.slice(app.indexOf('_aurixBuildCoherenceBoot'), app.indexOf('_aurixBuildCoherenceBoot') + 8000);
  ok('9 runner calls the audit once on coherent build >=522', /runAuditOnce[\s\S]{0,200}aurixAuditTemporalWindow/.test(app) && /dec\.expectedVersion >= 522[\s\S]{0,40}runAuditOnce\(\)/.test(app));
})();

// ── 10 normal coherent boot ⇒ no reload / no extra fan-out ───────────────────
(function () { const d = R(523, 523, 523, 523, null); ok('10 coherent ⇒ action none (no reload, no cache-bust)', d.action === 'none'); })();

// ── 11 desktop/mobile share the SAME owner (no surface branching) ────────────
(function () { const boot = app.slice(app.indexOf('_aurixBuildCoherenceBoot'), app.indexOf('_aurixBuildCoherenceBoot') + 8000); ok('11 coherence contract has no desktop/mobile branch', !/surface|isMobile|opts\.uid/.test(boot) && !/mobile/.test(fnSrc('_aurixResolveBuildCoherence'))); })();

// ── 12 chart owners byte-untouched by SPEC.43 (no coherence gate in them) ────
const noGate = n => (app.match(new RegExp('^function ' + n + '\\(', 'gm')) || []).length === 1 && fnSrc(n).indexOf('BUILD_COHERENCE') < 0 && fnSrc(n).indexOf('__AURIX_APPJS_VERSION__') < 0;
ok('12 buildProductionPortfolioChart untouched', noGate('buildProductionPortfolioChart'));
ok('12 FRC untouched', noGate('_aurixResolveFinalRenderSeriesContract'));
ok('12 renderer untouched', noGate('renderValidatedPortfolioChartWithInstitutionalRenderer'));
ok('12 buildValidatedHistoricalSeries untouched', noGate('buildValidatedHistoricalSeries'));

// ── 13 no synthetic points / no point fabrication in the coherence code ──────
(function () { const boot = app.slice(app.indexOf('_aurixBuildCoherenceBoot'), app.indexOf('_aurixBuildCoherenceBoot') + 8000); ok('13 coherence code creates no chart points (syntheticPoints unaffected)', !/renderPoints|\.points\s*=|value:|synthetic/.test(boot)); })();

// ── 14 offline (no expected) ⇒ coherent, never block a normal open ───────────
(function () { const d = R(null, 523, 523, 523, null); ok('14 offline/no version.json ⇒ coherent + no reload (never block)', d.coherent === true && d.action === 'none'); })();

// ── status shape (diagnostic contract) — SPEC.44 extended shape (no auditAvailable) ──────────
ok('S aurixBuildCoherenceStatus returns SPEC.44 fields', /aurixBuildCoherenceStatus = function[\s\S]{0,700}expectedVersion:[\s\S]{0,600}indexVersion:[\s\S]{0,600}requestedVersion:[\s\S]{0,600}executedVersion:[\s\S]{0,600}coherent:[\s\S]{0,600}registrationComplete:[\s\S]{0,300}requiredCapabilitiesPresent:[\s\S]{0,300}missingCapabilities:[\s\S]{0,300}reloadAttempted:[\s\S]{0,300}build:/.test(app));

// ════════════════════════════════════════════════════════════════════════════
// SPEC.44 RUNTIME_CAPABILITY_COHERENCE — capability-aware coherence contract
// ════════════════════════════════════════════════════════════════════════════

// ── 15 matching versions + complete registration + all capabilities ⇒ coherent true ─────────
(function () { const d = R(524, 524, 524, 524, null, CAPS_OK); ok('15 versions match + registered + all caps ⇒ coherent true, action none', d.coherent === true && d.action === 'none' && d.requiredCapabilitiesPresent === true && d.registrationComplete === true, JSON.stringify(d)); })();

// ── 16 matching versions + missing temporal audit ⇒ coherent FALSE ───────────────────────────
(function () { const d = R(524, 524, 524, 524, null, CAPS_MISSING_TW); ok('16 versions match but temporal audit missing ⇒ coherent FALSE (version-match alone is not coherent)', d.coherent === false && d.requiredCapabilitiesPresent === false, JSON.stringify(d)); })();

// ── 17 capability mismatch classified + one controlled reload ───────────────────────────────
(function () { const d = R(524, 524, 524, 524, null, CAPS_MISSING_TW); ok('17 classify RUNTIME_CAPABILITY_MISMATCH + action reload (first attempt)', d.classify === 'RUNTIME_CAPABILITY_MISMATCH' && d.action === 'reload' && d.nextReloadState.v === 524 && d.nextReloadState.n === 1, JSON.stringify(d)); })();

// ── 18 full version correct but registration incomplete ⇒ NOT coherent ──────────────────────
(function () { const d = R(524, 524, 524, 524, null, CAPS_INCOMPLETE); ok('18 versions match + appRegistrationComplete false ⇒ not coherent + reload', d.coherent === false && d.registrationComplete === false && d.classify === 'RUNTIME_CAPABILITY_MISMATCH' && d.action === 'reload', JSON.stringify(d)); })();

// ── 19 one missing capability produces its EXACT name ────────────────────────────────────────
(function () { const d = R(524, 524, 524, 524, null, CAPS_MISSING_TW); ok('19 missingCapabilities lists the exact name', Array.isArray(d.missingCapabilities) && d.missingCapabilities.length === 1 && d.missingCapabilities[0] === 'temporalWindowAudit', JSON.stringify(d.missingCapabilities)); })();

// ── 20 capability mismatch does NOT loop (one attempt spent ⇒ recoverable) ──────────────────
(function () { const d = R(524, 524, 524, 524, { v: 524, n: 1, ts: 1 }, CAPS_MISSING_TW); ok('20 caps still missing after one reload ⇒ recoverable, never loop', d.action === 'recoverable' && d.reloadAttempted === true, JSON.stringify(d)); })();

// ── 21 successful adoption (caps present after reload) clears the marker ─────────────────────
(function () { const d = R(524, 524, 524, 524, { v: 524, n: 1, ts: 1 }, CAPS_OK); ok('21 coherent after reload ⇒ clearMarker true, no further reload', d.coherent === true && d.clearMarker === true && d.action === 'none'); })();

// ── 22 version-only callers (no capabilityState) keep SPEC.43 behaviour byte-for-byte ────────
(function () { const d = R(524, 524, 524, 524, null); ok('22 no capabilityState ⇒ version-only coherence preserved (backward compatible)', d.coherent === true && d.registrationComplete === null && d.requiredCapabilitiesPresent === null); })();

// ── 23 temporal audit export is UNCONDITIONAL in production (only if(window) guard) ──────────
(function () {
  ok('23 aurixAuditTemporalWindow exported unconditionally (no dev/prod/debug guard)', /window\.aurixAuditTemporalWindow = function/.test(app));
  const i = app.indexOf('window.aurixAuditTemporalWindow = function');
  const before = app.slice(Math.max(0, i - 4000), i);
  ok('23 export not gated on a non-production flag', !/if\s*\(\s*(DEV|__DEV__|DEBUG|isDev|NODE_ENV)/.test(before));
})();

// ── 24 final registration marker + capability manifest at END of bundle ─────────────────────
(function () {
  ok('24 __AURIX_APP_REGISTRATION_COMPLETE__ set true', /__AURIX_APP_REGISTRATION_COMPLETE__ = true/.test(app));
  ok('24 __AURIX_RUNTIME_CAPABILITIES__ frozen manifest with required caps', /__AURIX_RUNTIME_CAPABILITIES__ = Object\.freeze\(\{[\s\S]{0,600}temporalWindowAudit:[\s\S]{0,120}geometricAudit:[\s\S]{0,120}snapshotContinuityAudit:/.test(app));
  const mi = app.indexOf('__AURIX_RUNTIME_CAPABILITIES__ = Object.freeze');
  ok('24 manifest lives near the END of the bundle (after ~90% of the file)', mi > app.length * 0.9, 'at ' + mi + '/' + app.length);
})();

// ── 25 diagnostic + isolation: optional diagnostics cannot abort registration ───────────────
(function () {
  ok('25 aurixRuntimeReadinessStatus exposes exact readiness fields', /aurixRuntimeReadinessStatus = function[\s\S]{0,600}registrationComplete:[\s\S]{0,300}temporalWindowAuditAvailable:[\s\S]{0,300}requiredCapabilitiesPresent:[\s\S]{0,300}missingCapabilities:[\s\S]{0,300}lastBootError:/.test(app));
  // the audit-export block AND the final manifest are each wrapped in try/…catch so a diagnostic throw
  // can never abort bundle registration.
  const mi = app.indexOf('__AURIX_APP_REGISTRATION_COMPLETE__ = true');
  const around = app.slice(Math.max(0, mi - 400), mi);
  ok('25 final registration marker is guarded by try/catch', /try \{/.test(around));
  ok('25 readiness diagnostic is read-only (no network / storage writes)', !/aurixRuntimeReadinessStatus = function[\s\S]{0,600}(fetch\(|setItem|localStorage|XMLHttpRequest)/.test(app));
})();

// ── 26 SPEC.44 touches NO chart/data owners (byte-identical chart output) ────────────────────
(function () {
  const noGate2 = n => (app.match(new RegExp('^function ' + n + '\\(', 'gm')) || []).length === 1 && fnSrc(n).indexOf('RUNTIME_CAPABILITIES') < 0 && fnSrc(n).indexOf('__AURIX_APP_REGISTRATION_COMPLETE__') < 0;
  ok('26 buildProductionPortfolioChart untouched by SPEC.44', noGate2('buildProductionPortfolioChart'));
  ok('26 FRC untouched by SPEC.44', noGate2('_aurixResolveFinalRenderSeriesContract'));
  ok('26 buildValidatedHistoricalSeries untouched by SPEC.44', noGate2('buildValidatedHistoricalSeries'));
  ok('26 source authority untouched by SPEC.44', noGate2('_aurixApplyRangeSourceAuthority'));
  // the EOF manifest / coherence code fabricate no chart points
  const eof = app.slice(app.indexOf('RUNTIME_CAPABILITY_COHERENCE.44'));
  ok('26 EOF capability block creates no chart points (syntheticPoints unaffected)', !/renderPoints|\.points\s*=|value:\s*[0-9]|synthetic/.test(eof));
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' SPEC.43/44 BUILD+CAPABILITY COHERENCE — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
