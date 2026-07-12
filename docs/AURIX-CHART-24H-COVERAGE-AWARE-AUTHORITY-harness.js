'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-24H-COVERAGE-AWARE-AUTHORITY-harness — SPEC DSH.CHART.24H_COVERAGE_AWARE_AUTHORITY.41
// ════════════════════════════════════════════════════════════════════════════
// ROOT CAUSE: the .11 24H authority granted frontend authority on COUNT (≥2 frontend points in-window) alone,
// so an established account opened briefly today (≥2 recent frontend points spanning a few hours) dropped ALL
// durable backend snapshots → 24H span collapsed → coverageRatio<0.8 → "Historial parcial" on a continuous,
// established chart. FIX (flag _AURIX_CHART_24H_COVERAGE_AWARE_AUTHORITY): coverage-aware — frontend keeps 24H
// only with mature rolling-24H SPAN coverage (byte-identical on dense/healthy); else backend-authoritative
// single series when backend covers; else honest partial. Owner: _aurixApplyRangeSourceAuthority + its single
// helper _aurix24hSourceCoverage. This harness proves the 12 required cases + flag-OFF rollback + purity.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing ' + n); return braceSlice(app, i); }
function konstSrc(n) { const m = new RegExp('const ' + n + '\\s*=\\s*').exec(app); if (!m) throw new Error('missing const ' + n); const eq = m.index + m[0].length; const s = app.indexOf(';', eq); return app.slice(m.index, s + 1); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

function mkCtx(coverageAware) {
  const ctx = { console: { log() {} }, Math, JSON, Number, isFinite, Infinity, Array, Object, String, Set };
  vm.createContext(ctx);
  ['_AURIX_VP_GAP_FLOOR_MS', '_AURIX_VP_GAP_MEDIAN_MULT'].forEach(n => vm.runInContext(konstSrc(n), ctx));
  vm.runInContext('const _AURIX_CHART_CONTINUITY_UNIFICATION = true;', ctx);
  vm.runInContext('const _AURIX_CHART_SEGMENT_SOURCE_AUTHORITY = true;', ctx);
  vm.runInContext('const _AURIX_CHART_24H_COVERAGE_AWARE_AUTHORITY = ' + (coverageAware ? 'true' : 'false') + ';', ctx);
  vm.runInContext(konstSrc('_AURIX_24H_COVERAGE_THR'), ctx);
  vm.runInContext(konstSrc('_AURIX_24H_MIN_BACKEND_POINTS'), ctx);
  vm.runInContext(fnSrc('_aurixRealGapFloorMs'), ctx);
  vm.runInContext(fnSrc('_aurixSourceFamily'), ctx);
  vm.runInContext(fnSrc('_aurixFrontendUsableInWindow'), ctx);
  vm.runInContext(fnSrc('_aurix24hSourceCoverage'), ctx);
  vm.runInContext(fnSrc('_aurixEnforceSegmentSourceAuthority'), ctx);
  vm.runInContext(fnSrc('_aurixApplyRangeSourceAuthority'), ctx);
  return ctx;
}
const ON = mkCtx(true), OFF = mkCtx(false);
const auth = (ctx, src, r) => vm.runInContext('_aurixApplyRangeSourceAuthority', ctx)(src, r);
const cov = (ctx, src, nowRef, w) => vm.runInContext('_aurix24hSourceCoverage', ctx)(src, nowRef, w);
const fam = (ctx, p) => vm.runInContext('_aurixSourceFamily', ctx)(p);

const HOUR = 36e5, MIN = 60000, DAY = 864e5, NOW = 1_720_000_000_000;
const fe = (ts, v) => ({ ts, total: v, real_estate: 0, source: 'remote_canonical' });
const be = (ts, v) => ({ ts, total: v, real_estate: 0, source: 'backend_snapshot' });
// builders inside the last 24h window (rolling from NOW)
function feSpan(hours, stepMin, v0) { const a = []; for (let m = 0; m <= hours * 60; m += stepMin) a.push(fe(NOW - hours * HOUR + m * MIN, (v0 || 10000) + m)); return a; }
function beFull(stepMin, v0) { const a = []; for (let m = 0; m <= 24 * 60; m += stepMin) a.push(be(NOW - 24 * HOUR + m * MIN, (v0 || 9800) + (m % 40))); return a; }
const backendOnly = out => out.every(p => p.source === 'backend_snapshot');
const noBackend = out => out.every(p => p.source !== 'backend_snapshot');
const span = out => { const t = out.filter(p => Number.isFinite(p.ts)).map(p => p.ts); return t.length >= 2 ? (Math.max.apply(null, t) - Math.min.apply(null, t)) : 0; };
const subsetOf = (out, src) => out.every(p => src.indexOf(p) >= 0);   // no fabricated points (object identity)

console.log('\nAURIX-CHART-24H-COVERAGE-AWARE-AUTHORITY — SPEC.41');

// ── flag + owner presence ────────────────────────────────────────────────────
ok('0 marker + flag + single helper', app.indexOf('24H_COVERAGE_AWARE_AUTHORITY.41') >= 0 && /const _AURIX_CHART_24H_COVERAGE_AWARE_AUTHORITY = true;/.test(app) && (app.match(/^function _aurix24hSourceCoverage\(/gm) || []).length === 1);
ok('0 single authority owner (no second pipeline)', (app.match(/^function _aurixApplyRangeSourceAuthority\(/gm) || []).length === 1);

// ── 1 Dense frontend 24H → exact legacy result (byte-identical) ──────────────
(function () {
  const src = feSpan(24, 20).concat(beFull(15));
  const onOut = auth(ON, src, '24h'), legacy = src.filter(p => fam(ON, p) !== 'backend');
  ok('1 dense frontend ⇒ frontend authority == legacy filter (byte-identical)', JSON.stringify(onOut) === JSON.stringify(legacy) && noBackend(onOut));
  ok('1 dense ON == OFF (byte-identical)', JSON.stringify(onOut) === JSON.stringify(auth(OFF, src, '24h')));
})();

// ── 2 Sparse frontend + mature backend → backend-only full coverage ──────────
(function () {
  const src = feSpan(3, 20).concat(beFull(15));   // frontend only last 3h; backend full 24h
  const out = auth(ON, src, '24h');
  ok('2 sparse frontend + mature backend ⇒ backend-only', backendOnly(out) && out.length >= 8);
  ok('2 backend-only span covers ≥0.8×24h', span(out) >= 0.8 * DAY, 'spanH=' + (span(out) / HOUR).toFixed(1));
  ok('2 OFF (legacy) would instead be frontend-only (the bug)', noBackend(auth(OFF, src, '24h')));
})();

// ── 3 One frontend point + mature backend → frontend discarded, no alternation ─
(function () {
  const src = [fe(NOW - 30 * MIN, 10000)].concat(beFull(15));
  const out = auth(ON, src, '24h');
  ok('3 lone frontend point discarded ⇒ backend-only (no source alternation)', backendOnly(out) && out.indexOf(src[0]) < 0);
})();

// ── 4 Mature frontend + backend overlap → frontend-authoritative legacy ──────
(function () {
  const src = feSpan(24, 30).concat(beFull(15));   // frontend covers full 24h AND backend present
  const out = auth(ON, src, '24h');
  ok('4 mature frontend + backend ⇒ frontend authority (drop backend)', noBackend(out) && JSON.stringify(out) === JSON.stringify(src.filter(p => fam(ON, p) !== 'backend')));
})();

// ── 5 Sparse frontend + sparse backend → honest partial (== legacy) ──────────
(function () {
  const src = [fe(NOW - 60 * MIN, 10000), fe(NOW - 30 * MIN, 10010)].concat([be(NOW - 20 * HOUR, 9900), be(NOW - 18 * HOUR, 9905), be(NOW - 16 * HOUR, 9910)]);
  const out = auth(ON, src, '24h');
  ok('5 sparse+sparse ⇒ fall-through legacy (ON == OFF)', JSON.stringify(out) === JSON.stringify(auth(OFF, src, '24h')));
})();

// ── 6 Genuine backend gap → segmented (backend-only), never bridged/fabricated ─
(function () {
  // backend covers window but with a ≥8h hole; frontend sparse ⇒ backend authority; the hole is PRESERVED (no synthetic point).
  const bpts = [];
  for (let m = 0; m <= 6 * 60; m += 15) bpts.push(be(NOW - 24 * HOUR + m * MIN, 9800 + m));      // first 6h
  for (let m = 0; m <= 6 * 60; m += 15) bpts.push(be(NOW - 8 * HOUR + m * MIN, 9900 + m));        // last ~8h (≥8h gap between)
  const src = [fe(NOW - 30 * MIN, 10000)].concat(bpts);
  const out = auth(ON, src, '24h');
  ok('6 backend gap ⇒ backend-only, gap preserved (no fabricated points)', backendOnly(out) && subsetOf(out, src));
})();

// ── 7 Rolling 24H across midnight → window is [nowRef−24h, nowRef], no reset ──
(function () {
  // nowRef = latest ts; a point 25h old must be OUTSIDE the window (proves rolling, not calendar-day).
  const nowRef = NOW;
  const c = cov(ON, [be(NOW - 25 * HOUR, 9000), be(NOW - 12 * HOUR, 9500), be(NOW - 1 * HOUR, 9600)], nowRef, DAY);
  ok('7 rolling window excludes >24h-old point (2 in-window backend)', c.beCount === 2, JSON.stringify(c));
})();

// ── 8 Deterministic / session-independent (cold-start safe: pure fn of src) ──
(function () {
  const src = feSpan(3, 20).concat(beFull(15));
  ok('8 authority is a PURE fn of src (same input ⇒ same output, no session state)', JSON.stringify(auth(ON, src, '24h')) === JSON.stringify(auth(ON, src.slice(), '24h')) && JSON.stringify(auth(ON, src, '24h')) === JSON.stringify(auth(ON, src, '24h')));
})();

// ── 9 Long ranges byte-identical (24H flag must not affect 7D/30D/1Y/ALL) ────
(function () {
  const src = feSpan(3, 60).concat(beFull(15)).concat([be(NOW - 200 * DAY, 7000), be(NOW - 199 * DAY, 7010)]);
  let same = true;
  ['7d', '30d', '1y', 'all'].forEach(r => { if (JSON.stringify(auth(ON, src, r)) !== JSON.stringify(auth(OFF, src, r))) same = false; });
  ok('9 long ranges identical with 24H flag ON vs OFF', same);
})();

// ── 10 Surface-independent (desktop/mobile data parity) ──────────────────────
(function () {
  // the authority takes no surface param ⇒ identical series feeds both surfaces.
  const src = feSpan(3, 20).concat(beFull(15));
  const a = auth(ON, src, '24h');
  ok('10 authority has no surface parameter ⇒ desktop/mobile read identical series', fnSrc('_aurixApplyRangeSourceAuthority').indexOf('surface') < 0 && a.length > 0);
})();

// ── 11 syntheticPoints = 0 — output is a strict subset of input (no fabrication) ─
(function () {
  const src = feSpan(3, 20).concat(beFull(15));
  ['24h'].forEach(r => { const out = auth(ON, src, r); ok('11 ' + r + ' output ⊆ input (no synthetic/interpolated point)', subsetOf(out, src)); });
})();

// ── 12 Flag OFF → exact prior v520 behaviour (established ⇒ frontend-only partial) ─
(function () {
  const src = feSpan(3, 20).concat(beFull(15));
  const off = auth(OFF, src, '24h');
  ok('12 flag OFF ⇒ legacy frontend authority (drops backend, the prior partial behaviour)', noBackend(off) && JSON.stringify(off) === JSON.stringify(src.filter(p => fam(OFF, p) !== 'backend')));
})();

// ── coverage helper unit ─────────────────────────────────────────────────────
(function () {
  const c = cov(ON, feSpan(3, 20).concat(beFull(15)), NOW, DAY);
  ok('C feCoverage ~0.125 (3h/24h), beCoverage ~1.0', Math.abs(c.feCoverage - 0.125) < 0.02 && c.beCoverage >= 0.95, JSON.stringify(c));
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' SPEC.41 24H-COVERAGE-AWARE-AUTHORITY — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
