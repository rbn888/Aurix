'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-GEOMETRIC-ROOT-CAUSE-harness — SPEC DSH.CHART.GEOMETRIC_ROOT_CAUSE_AUDIT.40
// ════════════════════════════════════════════════════════════════════════════
// READ-ONLY audit that walks the REAL chart pipeline per range, measures the DRAWN geometry, and attributes
// the cross-range visual difference to each owner (DATASET / LTTB / VERTICAL_SCALE / SEGMENTATION /
// EXTREMA_SELECTION) with a % split + verdict. This harness proves: all required metrics are returned;
// the classifier responds correctly to EACH injected owner (not rigged to one verdict); extrema is measured
// at the LTTB stage (not the out-of-scope FRC short-history gate); syntheticPoints stays 0; no mutation; and
// the audit is PURELY additive (renderer / FRC / LTTB / density owners are single-def and carry no SPEC.40 gate).
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing ' + n); return braceSlice(app, i); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const ctx = { console: { log() {} }, Math, JSON, Number, isFinite, Infinity, Array, Object, String, Date };
vm.createContext(ctx);
vm.runInContext('const _WSC_VIEW_W = 1000, _WSC_VIEW_H = 240;', ctx);
vm.runInContext(fnSrc('_aurixAuditGeometricRootCauseCore'), ctx);
const core = (opts, deps) => vm.runInContext('_aurixAuditGeometricRootCauseCore', ctx)(opts, deps);

// ── scenario builder: full control of each pipeline stage per range ──────────
// values → renderPoints (frc) → visiblePoints/pixels (renderer LTTB output). Options isolate each owner.
function rangeSpec(values, o) {
  o = o || {};
  const inputCount = o.inputCount || values.length;                        // chart.points count (history length)
  const rp = values.map((v, i) => ({ ts: i * 60000, value: v }));          // frc.renderPoints (renderer input)
  let vv = rp.slice();
  if (o.dropExtremumInVisible) {                                           // renderer LTTB drops an extremum
    const mn = Math.min.apply(null, values); vv = vv.filter(p => p.value !== mn);
  } else if (o.lttbReduce) {                                               // renderer LTTB reduces count (keeps extrema)
    const mn = Math.min.apply(null, values), mx = Math.max.apply(null, values);
    vv = rp.filter((p, i) => i === 0 || i === rp.length - 1 || p.value === mn || p.value === mx || i % 2 === 0);
  }
  const pixels = vv.map((p, i) => ({ x: 60 + i * (880 / Math.max(1, vv.length - 1)), y: 240 - (p.value % 200) }));
  return { input: inputCount, chartPoints: Array.from({ length: inputCount }, (_, i) => ({ ts: i * 60000, value: 1000 + (i % 50) })),
    renderPoints: rp, vpts: vv.map(p => ({ time: p.ts, value: p.value })), pixels: pixels,
    xBeta: o.xBeta != null ? o.xBeta : 0.48, yMode: o.yMode || 'linear', breaks: o.breaks || [], synthetic: o.synthetic || 0 };
}
function mkDeps(spec) {
  return {
    buildChart: r => ({ range: r, state: 'ready', points: spec[r].chartPoints, pointCount: spec[r].chartPoints.length }),
    resolveContract: (chart, r) => ({ renderPoints: spec[r].renderPoints, renderPathCount: (spec[r].breaks.length) + 1, finalRenderHash: 'h_' + r, diagnostics: { syntheticPoints: spec[r].synthetic } }),
    render: (pts, opts) => { const s = spec[opts.range]; return { visiblePixels: s.pixels, visiblePoints: s.vpts, xScale: { beta: s.xBeta, mode: 'fill-blend' }, yScale: { mode: s.yMode }, structuralBreakCount: s.breaks.length }; },
    structuralBreaks: (pts, r) => ({ breaks: spec[r].breaks }),
  };
}
const smooth = n => Array.from({ length: n }, (_, i) => 1000 + Math.round(20 * Math.sin(i / 6)));
const volatile = n => Array.from({ length: n }, (_, i) => 1000 + ((i * 37) % 90) - 45);

console.log('\nAURIX-CHART-GEOMETRIC-ROOT-CAUSE — SPEC.40');

// ── 1 marker + read-only + required metric fields ────────────────────────────
ok('1 SPEC.40 marker present', app.indexOf('GEOMETRIC_ROOT_CAUSE_AUDIT.40') >= 0);
(function () {
  const spec = { '24h': rangeSpec(smooth(60)), 'all': rangeSpec(smooth(60)) };
  const res = core({ ranges: ['24h', 'all'] }, mkDeps(spec));
  ok('1 readOnly + behaviorChanged false', res.readOnly === true && res.behaviorChanged === false);
  const need = ['inputPointCount', 'renderedPointCount', 'LTTBReductionRatio', 'averageSegmentLength', 'medianSegmentLength',
    'shortestSegment', 'longestSegment', 'averageSlope', 'slopeVariance', 'curvatureVariance', 'vertexDensity',
    'angleDistribution', 'spacingUniformity', 'gapCount', 'gapCoverage', 'extremaPreserved', 'renderHash', 'syntheticPoints'];
  const p = res.perRange['24h'];
  ok('1 all required per-range metrics present', need.every(k => k in p), need.filter(k => !(k in p)).join(','));
  ok('1 verdict + responsibilityPct + rootCause present', 'verdict' in res && res.attribution && res.attribution.responsibilityPct && 'rootCause' in res);
})();

// ── 2 GEOMETRY_ALREADY_UNIFIED — identical geometry + identical dataset ──────
(function () {
  const s = rangeSpec(smooth(120));
  const spec = { '24h': s, '7d': rangeSpec(smooth(120)), 'all': rangeSpec(smooth(120)) };
  const res = core({ ranges: ['24h', '7d', 'all'] }, mkDeps(spec));
  ok('2 identical everything ⇒ GEOMETRY_ALREADY_UNIFIED', res.verdict === 'GEOMETRY_ALREADY_UNIFIED', res.verdict + ' pct=' + JSON.stringify(res.attribution.responsibilityPct));
})();

// ── 3 DATASET_DOMINANT — same engine, different input count + volatility ─────
(function () {
  const spec = {
    '24h': rangeSpec(smooth(60)),                       // few points, low volatility
    '7d': rangeSpec(volatile(150)),                     // more points, high volatility
    'all': rangeSpec(volatile(180)),
  };
  const res = core({ ranges: ['24h', '7d', 'all'] }, mkDeps(spec));
  ok('3 different data, same engine ⇒ DATASET_DOMINANT', res.verdict === 'DATASET_DOMINANT', res.verdict + ' pct=' + JSON.stringify(res.attribution.responsibilityPct));
  ok('3 engineParamsUnified true (xBeta all 0.48)', res.engineUniformity.engineParamsUnified === true);
})();

// ── 4 SEGMENTATION_DOMINANT — same data, but long ranges break at gaps ───────
(function () {
  const spec = {
    '24h': rangeSpec(smooth(120)),
    '7d': rangeSpec(smooth(120), { breaks: [{ start: 30 * 60000, end: 70 * 60000 }] }),
    'all': rangeSpec(smooth(120), { breaks: [{ start: 30 * 60000, end: 70 * 60000 }, { start: 90 * 60000, end: 110 * 60000 }] }),
  };
  const res = core({ ranges: ['24h', '7d', 'all'] }, mkDeps(spec));
  ok('4 gaps on long ranges ⇒ SEGMENTATION_DOMINANT', res.verdict === 'SEGMENTATION_DOMINANT', res.verdict + ' pct=' + JSON.stringify(res.attribution.responsibilityPct));
})();

// ── 5 VERTICAL_SCALE_DOMINANT — distinct y-scale modes across ranges ─────────
(function () {
  const spec = {
    '24h': rangeSpec(smooth(120), { yMode: 'linear' }),
    '7d': rangeSpec(smooth(120), { yMode: 'legible-blend' }),
    'all': rangeSpec(smooth(120), { yMode: 'legible-blend' }),
  };
  const res = core({ ranges: ['24h', '7d', 'all'] }, mkDeps(spec));
  ok('5 mixed y-scale modes ⇒ VERTICAL_SCALE_DOMINANT', res.verdict === 'VERTICAL_SCALE_DOMINANT', res.verdict + ' pct=' + JSON.stringify(res.attribution.responsibilityPct));
})();

// ── 6 EXTREMA_SELECTION_DOMINANT — renderer LTTB drops an extremum ───────────
(function () {
  const spec = {
    '24h': rangeSpec(smooth(120)),
    '7d': rangeSpec(smooth(120), { dropExtremumInVisible: true }),
    'all': rangeSpec(smooth(120), { dropExtremumInVisible: true }),
  };
  const res = core({ ranges: ['24h', '7d', 'all'] }, mkDeps(spec));
  ok('6 LTTB drops extremum ⇒ EXTREMA_SELECTION_DOMINANT', res.verdict === 'EXTREMA_SELECTION_DOMINANT', res.verdict + ' pct=' + JSON.stringify(res.attribution.responsibilityPct));
  ok('6 extremaPreserved.both false on affected ranges', res.perRange['7d'].extremaPreserved.both === false);
})();

// ── 7 LTTB_DOMINANT — same big input, but drawn vertex counts differ ─────────
(function () {
  const spec = {
    '24h': rangeSpec(smooth(200)),                       // renderer keeps all 200
    '7d': rangeSpec(smooth(200), { lttbReduce: true }),  // renderer reduces (keeps extrema) ⇒ fewer vertices, same input
    'all': rangeSpec(smooth(200), { lttbReduce: true }),
  };
  const res = core({ ranges: ['24h', '7d', 'all'] }, mkDeps(spec));
  ok('7 same input, different vertex counts ⇒ LTTB_DOMINANT', res.verdict === 'LTTB_DOMINANT', res.verdict + ' pct=' + JSON.stringify(res.attribution.responsibilityPct));
})();

// ── 8 extrema measured at LTTB stage, NOT the out-of-scope FRC short-history gate ─
(function () {
  // frc.renderPoints already exclude a leading trough (simulating SPEC.16 drop). LTTB then preserves its
  // input's extrema. extremaPreserved must be TRUE (LTTB clean); endToEndExtrema reports the FRC drop.
  const full = smooth(120);
  const spec = { '24h': rangeSpec(full), 'all': (function () { const s = rangeSpec(full.slice(5)); s.chartPoints = full.map((v, i) => ({ ts: i * 60000, value: v })); s.chartPoints[0].value = -99999; return s; })() };
  const res = core({ ranges: ['24h', 'all'] }, mkDeps(spec));
  ok('8 LTTB-stage extremaPreserved true despite FRC leading-drop', res.perRange['all'].extremaPreserved.both === true);
  ok('8 endToEndExtrema exposes the full-series drop transparently', res.perRange['all'].endToEndExtrema && res.perRange['all'].endToEndExtrema.min === false);
})();

// ── 9 syntheticPoints always 0; totalSyntheticPoints surfaced ────────────────
(function () {
  const res = core({ ranges: ['24h', 'all'] }, mkDeps({ '24h': rangeSpec(smooth(80)), 'all': rangeSpec(volatile(160)) }));
  ok('9 totalSyntheticPoints 0', res.totalSyntheticPoints === 0 && res.summary.totalSyntheticPoints === 0);
})();

// ── 10 no mutation of injected data ──────────────────────────────────────────
(function () {
  const spec = { '24h': rangeSpec(smooth(60)), 'all': rangeSpec(volatile(120)) };
  const before = JSON.stringify(spec);
  core({ ranges: ['24h', 'all'] }, mkDeps(spec));
  ok('10 injected spec not mutated', JSON.stringify(spec) === before);
})();

// ── 11 PURELY ADDITIVE — renderer / FRC / LTTB / density owner BODIES carry no SPEC.40 gate ──
// (Check each owner's function BODY, not a text window — the audit core sits textually after the renderer and
//  legitimately references its name to CALL it read-only; that is not a gate inside the owner.)
const noGate = (n) => (app.match(new RegExp('^function ' + n + '\\(', 'gm')) || []).length === 1 && fnSrc(n).indexOf('GEOMETRIC_ROOT_CAUSE') < 0;
ok('11 renderer body single-def + no SPEC.40 gate', noGate('renderValidatedPortfolioChartWithInstitutionalRenderer'));
ok('11 FRC body single-def + no SPEC.40 gate', noGate('_aurixResolveFinalRenderSeriesContract'));
ok('11 LTTB downsample body single-def + no SPEC.40 gate', noGate('downsampleAurixAdaptive'));
ok('11 density target body single-def + no SPEC.40 gate', noGate('_aurixVpTargetPointCount'));
ok('11 single audit core owner', (app.match(/^function _aurixAuditGeometricRootCauseCore\(/gm) || []).length === 1);

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' SPEC.40 GEOMETRIC-ROOT-CAUSE — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
