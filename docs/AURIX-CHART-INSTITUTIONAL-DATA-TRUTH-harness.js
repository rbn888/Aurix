'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-INSTITUTIONAL-DATA-TRUTH-harness — SPEC DSH.CHART.INSTITUTIONAL.DATA-TRUTH.01
// ════════════════════════════════════════════════════════════════════════════
// The chart must stop drawing missing data, capital construction and short-history artefacts as if they
// were continuous institutional MARKET performance — while preserving the dense premium 24H behaviour.
//   RENDER sandbox: capital-step + sparse-ramp segmentation (no synthetic point; dense preserved).
//   PIPELINE sandbox: partial_history state + collapsed-range suppression + ALL return trust.
//   + the sibling premium/bridge/truthful/auth harnesses stay green.
const fs = require('fs'), vm = require('vm'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function fn(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let k = app.indexOf('{', i), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(i, k); }
function konst(name) { const m = app.match(new RegExp('const ' + name + '\\s*=.*?;')); if (!m) throw new Error('missing const ' + name); return m[0]; }
function objConst(name) { const i = app.indexOf('const ' + name + ' ='); const j = app.indexOf('};', i); return app.slice(i, j + 2); }
function block(a, b) { const i = app.indexOf(a); const e = app.indexOf(b, i); return app.slice(i, e + b.length); }
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }

// ── RENDER sandbox (visible renderer + structural-break detectors) ──
let RENDER_FLOWS = [];
const RS = { console, Math, JSON, Array, Number, isFinite, Infinity, Date, activeRange: '24h', window: undefined,
  _aurixLoadCapitalFlows: () => RENDER_FLOWS, toBase: v => v };
vm.createContext(RS);
['_AURIX_RC_ASPECT', '_AURIX_RC_PAD_FRAC', '_AURIX_RC_VPAD_FRAC', '_AURIX_IR_VALUE_MARGIN', '_AURIX_IR_VPAD_FRAC',
 '_AURIX_Y_JUMP_DOMINANCE', '_AURIX_Y_LEGIBLE_ALPHA', '_AURIX_VP_GAP_MEDIAN_MULT', '_AURIX_BRIDGE_SEG_ENABLED'].forEach(c => vm.runInContext(konst(c), RS));
['_AURIX_VP_DENSITY', '_AURIX_X_FILL_BETA', '_AURIX_VP_GAP_FLOOR_MS', '_AURIX_BRIDGE_SEG_FRAC'].forEach(c => vm.runInContext(objConst(c), RS));
vm.runInContext(block('const _AURIX_CAPITAL_STEP_SEG_ENABLED', 'const _AURIX_SPARSE_RAMP_MIN_MS = 20 * 60000;'), RS);
['_aurixVpTargetPointCount', 'downsampleAurixLTTB', '_aurixSignificantLocalExtrema', 'downsampleAurixAdaptive',
 'computeAurixTimeScale', 'computeAurixAdaptiveXScale', 'computeAurixValueScale', '_aurixMonotonePath', 'buildAurixMonotonicPath',
 'buildAurixAreaPath', '_aurixSplitAtGaps', '_aurixConfirmedBridgeGaps', '_aurixVerticalJumps', '_aurixCapitalStepBreaks',
 '_aurixSparseRampBreaks', '_aurixStructuralBreaks', 'renderValidatedPortfolioChartWithInstitutionalRenderer'].forEach(n => vm.runInContext(fn(n), RS));
const MIN = 60e3, HOUR = 36e5;
const box = { left: 6, right: 994, top: 16, bottom: 404 };
function render(points) { RS.__pts = points; return vm.runInContext('renderValidatedPortfolioChartWithInstitutionalRenderer(__pts, { range:"24h", vw:1000, vh:420, box:' + JSON.stringify(box) + ' })', RS); }
const countM = s => (String(s).match(/M /g) || []).length;

// ── PIPELINE sandbox (buildProductionPortfolioChart end-to-end) ──
let HIST = [], LEDGER = [];
const PS = { console, Math, JSON, Array, Number, isFinite, Infinity, Date, Map, Set, Object, isNaN, parseInt, parseFloat, String,
  toBase: v => v, _aurixLoadCapitalFlows: () => LEDGER, _aurixHistorySourceForDisplay: () => HIST, currentUser: undefined, activeRange: '24h',
  __setHist: h => { HIST = h; }, __setLedger: l => { LEDGER = l; } };
vm.createContext(PS);
['_AURIX_EMG_RANGE_MS', '_AURIX_EMG_ADJ_JUMP', '_AURIX_EMG_FALLBACK_TAIL', '_AURIX_EMG_MIN_POINTS', '_AURIX_HPQ_MIN_POINTS',
 '_AURIX_HPQ_SPIKE_JUMP', '_AURIX_HPQ_SPIKE_REVERT_FRAC', '_AURIX_HPQ_FUTURE_MS', '_AURIX_PROD_MIN_POINTS', '_AURIX_PROD_GATE_PCT',
 '_AURIX_RET_MIN_BASE', '_AURIX_RET_SANE_PCT', '_AURIX_STEP_MATCH_MIN_CONF'].forEach(c => vm.runInContext(konst(c), PS));
['_aurixEmergencyHash', '_aurixProdPlateauFilter', '_aurixProdVisualGate', '_aurixHpqIso', '_aurixHpqDiag', '_aurixHpqRangesContaining',
 '_aurixHpqRawStages', '_aurixHpqTrimConstruction', '_aurixHpqQuarantineSpikes', '_aurixHpqFirstInvalidStage', 'buildValidatedHistoricalSeries',
 '_aurixNetFlowsInWindow', '_aurixComputePeriodReturn', 'buildProductionPortfolioChart'].forEach(n => vm.runInContext(fn(n), PS));
const DAY = 864e5;
function build(range) { return vm.runInContext('buildProductionPortfolioChart(' + JSON.stringify(range) + ')', PS); }
function ramp(startV, endV, days) { const n = Math.round(days * 24 * 2), t0 = 1_800_000_000_000, out = [];
  for (let i = 0; i < n; i++) out.push({ ts: t0 + i * 30 * MIN, total: +(startV + (endV - startV) * (i / (n - 1))).toFixed(2), real_estate: 0 }); return out; }

console.log('AURIX-CHART-INSTITUTIONAL-DATA-TRUTH — SPEC DSH.CHART.INSTITUTIONAL.DATA-TRUTH.01\n');

console.log('GEOMETRY (render, no synthetic points, dense preserved):');
// dense uniform 24H
function dense24() { const p = [], t0 = 1_800_000_000_000; for (let i = 0; i < 160; i++) p.push({ ts: t0 + i * 8 * MIN, value: Math.round(72000 + 200 * Math.sin(i * 0.2) + 60 * Math.cos(i * 0.5)) }); return p; }
{ RENDER_FLOWS = []; const rc = render(dense24()); ok('1 dense 24H market movement → premium continuous (single path)', rc.structuralBreakCount === 0 && countM(rc.linePath) === 1, 'M=' + countM(rc.linePath)); }
// sparse 20h bridge (two dense clusters split by 21h)
{ RENDER_FLOWS = []; const p = [], t0 = 1_800_000_000_000; for (let i = 0; i < 12; i++) p.push({ ts: t0 + i * 8 * MIN, value: 72000 + 30 * i }); const t1 = t0 + 11 * 8 * MIN + 21 * HOUR; for (let i = 0; i < 12; i++) p.push({ ts: t1 + i * 8 * MIN, value: 72400 + 30 * i });
  const rc = render(p); ok('2 sparse 20h bridge → segmented', rc.segmentedBridgeCount >= 1 && countM(rc.linePath) >= 2, 'bridge=' + rc.segmentedBridgeCount); }
// sparse monotonic ramp = ≥2 consecutive low-density points after a dense cluster
{ RENDER_FLOWS = []; const p = [], t0 = 1_800_000_000_000; for (let i = 0; i < 20; i++) p.push({ ts: t0 + i * 6 * MIN, value: 72000 + 5 * i });   // dense
  let t = t0 + 19 * 6 * MIN; for (let i = 0; i < 4; i++) { t += 3 * HOUR; p.push({ ts: t, value: 72150 + 400 * (i + 1) }); }                       // sparse monotonic ramp
  const rc = render(p); ok('3 sparse monotonic ramp → NOT premium-continuous (segmented)', rc.sparseRampSegmentCount >= 1 && countM(rc.linePath) >= 2, 'ramp=' + rc.sparseRampSegmentCount + ' M=' + countM(rc.linePath)); }
// capital deposit step (jump matches a +flow)
function stepSeries(sign) { const p = [], t0 = 1_800_000_000_000; for (let i = 0; i < 12; i++) p.push({ ts: t0 + i * 10 * MIN, value: 10000 + 8 * i }); const jt = t0 + 12 * 10 * MIN; const base = 10088; const jumped = base + sign * 4000; p.push({ ts: jt, value: jumped }); for (let i = 1; i < 10; i++) p.push({ ts: jt + i * 10 * MIN, value: jumped + sign * 6 * i }); return { p, jt, amt: sign * 4000 }; }
{ const s = stepSeries(1); RENDER_FLOWS = [{ ts: s.jt, amountUSD: s.amt }]; const rc = render(s.p); ok('4 capital DEPOSIT step → not smoothed as market (segmented)', rc.capitalStepSegmentCount >= 1 && countM(rc.linePath) >= 2, 'cap=' + rc.capitalStepSegmentCount); }
{ const s = stepSeries(-1); RENDER_FLOWS = [{ ts: s.jt, amountUSD: s.amt }]; const rc = render(s.p); ok('5 capital WITHDRAWAL step → not smoothed as market (segmented)', rc.capitalStepSegmentCount >= 1, 'cap=' + rc.capitalStepSegmentCount); }
{ const s = stepSeries(1); RENDER_FLOWS = [{ ts: s.jt, amountUSD: s.amt }]; const rc = render(s.p); const inVals = new Set(s.p.map(x => x.value));
  ok('6 wealth values before+after the step preserved (no fabrication)', rc.visiblePoints.every(v => inVals.has(v.value)) && rc.visiblePoints[0].time === s.p[0].ts && rc.visiblePoints[rc.visiblePoints.length - 1].time === s.p[s.p.length - 1].ts); }
// 12/13/14: no synthetic points, first/last preserved, extrema preserved (dense)
{ RENDER_FLOWS = []; const d = dense24(); const rc = render(d); const inVals = new Set(d.map(x => x.value));
  ok('12 no synthetic points (all rendered values are real)', rc.visiblePoints.every(v => inVals.has(v.value)));
  ok('13 first & last real points preserved', rc.visiblePoints[0].time === d[0].ts && rc.visiblePoints[rc.visiblePoints.length - 1].time === d[d.length - 1].ts);
  const dv = rc.visiblePoints.map(v => v.value); ok('14 global extrema preserved inside dense cluster', Math.max.apply(null, dv) === Math.max.apply(null, [...inVals]) && Math.min.apply(null, dv) === Math.min.apply(null, [...inVals])); }
// 15: mobile/desktop use the SAME renderer ⇒ deterministic equivalent segmentation
{ RENDER_FLOWS = []; const d = dense24(); const a = render(d), b = render(d); ok('15 desktop/mobile equivalent segmentation (deterministic)', a.linePath === b.linePath && a.structuralBreakCount === b.structuralBreakCount); }

console.log('\nRANGE HONESTY + RETURN TRUST (pipeline):');
// 7/8: finite range with ~5d history → partial_history
PS.__setHist(ramp(10000, 9800, 4.94)); PS.__setLedger([]);
{ const p = build('30d'); ok('7 30D with ~5D history → displayedRangeState partial_history', p.displayedRangeState === 'partial_history', p.displayedRangeState + ' cov=' + p.coverageRatio); }
{ const p = build('1y'); ok('8 1Y with ~5D history → displayedRangeState partial_history', p.displayedRangeState === 'partial_history', p.displayedRangeState); }
// 9: collapsed finite ranges cannot show a numeric badge
{ const a = build('7d'), b = build('30d'), c = build('1y');
  ok('9 7D/30D/1Y collapsed → NO numeric return badge', a.badgeReturnPct === null && b.badgeReturnPct === null && c.badgeReturnPct === null); }
// 10: ALL untrusted (low-confidence retimed flow in window) → suppressed (no red -21% style)
PS.__setHist(ramp(10000, 7800, 4.94));   // gross ~-22% over all-history
PS.__setLedger([{ ts: 1_800_000_000_000 + 2 * DAY, amountUSD: 50, retimeReason: 'fallback_base_low_confidence', retimeConfidence: 0.2 }]);
{ const p = build('all'); ok('10 ALL untrusted flow timing → suppressed (badge null, not -21%)', p.allRangeReturnAllowed === false && p.badgeReturnPct === null && p.returnState !== 'ok', 'allowed=' + p.allRangeReturnAllowed + ' badge=' + p.badgeReturnPct + ' reasons=' + (p.allUntrustReasons || []).join('|')); }
// 11: legitimate ALL return allowed when full trustworthy history + no bad flows
PS.__setHist(ramp(10000, 11000, 30)); PS.__setLedger([]);
{ const p = build('all'); ok('11 legitimate ALL (trustworthy, no bad flows) → return allowed + numeric badge', p.allRangeReturnAllowed === true && p.returnState === 'ok' && Number.isFinite(p.badgeReturnPct), 'allowed=' + p.allRangeReturnAllowed + ' badge=' + p.badgeReturnPct); }
{ const p = build('all'); ok('11b line still draws for ALL (points ≥2, ready)', p.state === 'ready' && p.points.length >= 2); }

console.log('\nSibling harnesses remain green:');
for (const [label, file] of [['16 24H premium reference', 'AURIX-CHART-24H-PREMIUM-REFERENCE-harness.js'], ['17 TRUTHFUL_RANGES', 'AURIX-CHART-TRUTHFUL-RANGES-harness.js'], ['18 BRIDGE_SEGMENTATION', 'AURIX-CHART-24H-BRIDGE-SEGMENTATION-harness.js'], ['19 auth stability freeze', 'AURIX-AUTH-MOBILE-STABILITY-FREEZE-harness.js']]) {
  let good = false; try { cp.execSync('node ' + JSON.stringify(path.join(__dirname, file)), { stdio: 'ignore' }); good = true; } catch (_) {}
  ok(label + ' harness remains green', good);
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
