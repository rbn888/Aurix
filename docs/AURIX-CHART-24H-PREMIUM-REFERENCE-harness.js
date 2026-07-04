'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-24H-PREMIUM-REFERENCE-harness — SPEC DSH.CHART.INSTITUTIONAL.LINE.02 Fase 0/6
// ════════════════════════════════════════════════════════════════════════════
// Freezes the GOOD dense-left-side 24H geometry as STRUCTURAL invariants (not pixel
// equality — timestamps/prices are live). Future long-range fixes must not regress it:
//   - first/last real points preserved through downsample,
//   - global value extrema preserved (premium local detail, not flattened),
//   - values NEVER mutated by geometry (every rendered value ∈ input values),
//   - deterministic geometry (same input → identical path),
//   - the visible production render path (renderValidatedPortfolioChartWithInstitutionalRenderer)
//     emits a premium monotone-CUBIC path (has 'C' commands), not a degraded polyline,
//   - a dense cluster is NOT collapsed to 2 points.
// Executes the REAL engine functions against a synthetic dense 24H series.
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fn(name) { const s = 'function ' + name + '('; const i = src.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let k = src.indexOf('{', i), d = 0; for (; k < src.length; k++) { const c = src[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return src.slice(i, k); }

const ENGINE_FNS = ['_aurixVpTargetPointCount', 'downsampleAurixLTTB', '_aurixSignificantLocalExtrema', 'downsampleAurixAdaptive',
  'computeAurixTimeScale', 'computeAurixAdaptiveXScale', 'computeAurixValueScale', '_aurixArrConfig', '_aurixArrRepresentVertices',
  '_aurixMonotonePath', 'buildAurixMonotonicPath', 'buildAurixAreaPath', '_aurixSplitAtGaps', '_aurixConfirmedBridgeGaps',
  '_aurixVerticalJumps', '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks', '_aurixStructuralBreaks',
  'renderValidatedPortfolioChartWithInstitutionalRenderer'];
const AUX_CONSTS = ['_AURIX_RC_ASPECT', '_AURIX_RC_PAD_FRAC', '_AURIX_RC_VPAD_FRAC', '_AURIX_IR_VALUE_MARGIN', '_AURIX_IR_VPAD_FRAC',
  '_AURIX_Y_JUMP_DOMINANCE', '_AURIX_Y_LEGIBLE_ALPHA', '_AURIX_VP_GAP_MEDIAN_MULT', '_AURIX_BRIDGE_SEG_ENABLED',
  '_AURIX_CAPITAL_STEP_SEG_ENABLED', '_AURIX_SPARSE_RAMP_SEG_ENABLED', '_AURIX_VJUMP_MIN_FRAC', '_AURIX_VJUMP_P95_MULT',
  '_AURIX_CAPSTEP_RATIO_LO', '_AURIX_CAPSTEP_RATIO_HI', '_AURIX_CAPSTEP_TS_PAD_MS', '_AURIX_SPARSE_RAMP_MULT', '_AURIX_SPARSE_RAMP_MIN_MS'];

const sb = { console, Math, JSON, Array, Number, isFinite, Infinity, Date, activeRange: '24h', window: undefined };
vm.createContext(sb);
AUX_CONSTS.forEach(c => { const m = src.match(new RegExp('const ' + c + '\\s*=[^;]*?(\\{[\\s\\S]*?\\}\\s*;|[^;]*;)', 's')); if (m) { try { vm.runInContext(m[0], sb); } catch (_) {} } });
// _AURIX_VP_DENSITY / _AURIX_X_FILL_BETA are object literals — grab them explicitly.
['_AURIX_VP_DENSITY', '_AURIX_X_FILL_BETA', '_AURIX_VP_GAP_FLOOR_MS', '_AURIX_BRIDGE_SEG_FRAC'].forEach(c => { const i = src.indexOf('const ' + c + ' ='); if (i >= 0) { const j = src.indexOf('};', i); vm.runInContext(src.slice(i, j + 2), sb); } });
ENGINE_FNS.forEach(n => { try { vm.runInContext(fn(n), sb); } catch (e) {} });

const MIN = 60e3;
let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name + (info ? '  [' + info + ']' : '')); } else { fail++; console.log('  ✗ ' + name + (info ? '  [' + info + ']' : '')); } }

// Dense 24H reference: ~216 points at ~6.6-min cadence, organic sinusoidal micro-variation
// + a couple of genuine local extrema. This is the "premium dense left" character.
function dense24h() {
  const pts = [], n = 216, t0 = 1_800_000_000_000, base = 72000;
  for (let i = 0; i < n; i++) {
    const t = t0 + i * 6.66 * MIN;
    let v = base + 220 * Math.sin(i * 0.18) + 60 * Math.cos(i * 0.51);
    if (i === 70) v += 900;   // a real local peak
    if (i === 150) v -= 800;  // a real local trough
    pts.push({ ts: t, value: Math.round(v) });
  }
  return pts;
}
function render(points) { return vm.runInContext('renderValidatedPortfolioChartWithInstitutionalRenderer(' + JSON.stringify(points) + ', { range: "24h", vw: 1000, vh: 420, box: { left: 6, right: 994, top: 16, bottom: 404 } })', sb); }
function downsample(points) { const tgt = vm.runInContext('_aurixVpTargetPointCount("24h", 1000)', sb); return { tgt, out: vm.runInContext('downsampleAurixAdaptive(' + JSON.stringify(points.map(p => ({ time: p.ts, value: p.value }))) + ', ' + tgt + ')', sb) }; }

console.log('AURIX-CHART-24H-PREMIUM-REFERENCE — SPEC DSH.CHART.INSTITUTIONAL.LINE.02\n');
const PTS = dense24h();
const inVals = PTS.map(p => p.value);
const gMin = Math.min.apply(null, inVals), gMax = Math.max.apply(null, inVals);

// 1. Downsample target is the 24h band (≤180) and the dense series is NOT collapsed to a stub.
{ const d = downsample(PTS); ok('1 dense 24H downsamples to a rich series (not collapsed)', d.out.length >= 100 && d.out.length <= 180 * 1.5 + 2, 'target=' + d.tgt + ' out=' + d.out.length + ' in=' + PTS.length); }
// 2. First & last real points preserved through downsample (endpoints anchor the return).
{ const d = downsample(PTS).out; ok('2 first & last timestamps preserved', d[0].time === PTS[0].ts && d[d.length - 1].time === PTS[PTS.length - 1].ts, 'first=' + (d[0].time === PTS[0].ts) + ' last=' + (d[d.length - 1].time === PTS[PTS.length - 1].ts)); }
// 3. Global value extrema preserved (premium local detail is NOT flattened away).
{ const d = downsample(PTS).out; const dv = d.map(p => p.value); ok('3 global min & max value points preserved', Math.min.apply(null, dv) === gMin && Math.max.apply(null, dv) === gMax, 'min=' + (Math.min.apply(null, dv) === gMin) + ' max=' + (Math.max.apply(null, dv) === gMax)); }
// 4. Values NEVER mutated by geometry — every rendered value is a real input value.
{ const d = downsample(PTS).out; const inSet = new Set(inVals); ok('4 no synthetic values (geometry never invents observations)', d.every(p => inSet.has(p.value)), 'allReal=' + d.every(p => inSet.has(p.value))); }
// 5. Visible render path returns a PREMIUM monotone-cubic path (has 'C' commands), ok:true.
{ const rc = render(PTS); ok('5 render ok + premium cubic path (C commands)', rc && rc.ok === true && /C/.test(rc.linePath) && rc.linePath.length > 50, 'ok=' + (rc && rc.ok) + ' hasC=' + (rc && /C/.test(rc.linePath))); }
// 6. Determinism — identical input yields byte-identical geometry.
{ const a = render(PTS), b = render(PTS); ok('6 deterministic geometry (same in → same path)', a.linePath === b.linePath && a.areaPath === b.areaPath); }
// 7. A DENSE cluster (many points, tiny time span) is not collapsed to 2 points.
{ const clust = []; for (let i = 0; i < 40; i++) clust.push({ ts: 1_800_000_000_000 + i * 30_000, value: 72000 + Math.round(50 * Math.sin(i)) });
  const d = vm.runInContext('downsampleAurixAdaptive(' + JSON.stringify(clust.map(p => ({ time: p.ts, value: p.value }))) + ', _aurixVpTargetPointCount("24h", 1000))', sb);
  ok('7 dense cluster retains all detail when under target', d.length === clust.length, 'in=' + clust.length + ' out=' + d.length); }
// 8. Render output point count is meaningful (premium density retained on the visible surface).
{ const rc = render(PTS); ok('8 visible render retains dense detail (≥100 visible points)', rc.visiblePoints && rc.visiblePoints.length >= 100, 'visible=' + (rc.visiblePoints && rc.visiblePoints.length)); }

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
