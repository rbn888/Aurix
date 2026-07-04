'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-V480-RUNTIME-CLEANUP-harness — SPEC DSH.CHART.V480.RUNTIME-CLEANUP.01
// ════════════════════════════════════════════════════════════════════════════
// Three small surgical fixes on top of DATA-TRUTH.01:
//   1. ALL trust: short all-history + construction/derived flow → honest neutral (no red -21%).
//   2. Orphan cleanup: an interior ≤2-pt micro-island between two structural breaks is not drawn.
//   3. Terminal sparse ramp: a lone low-density final connection (dense cluster → current value hours
//      later) is broken, not drawn as a long premium curve.
const fs = require('fs'), vm = require('vm'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function fn(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let k = app.indexOf('{', i), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(i, k); }
function konst(name) { const m = app.match(new RegExp('const ' + name + '\\s*=.*?;')); if (!m) throw new Error('missing ' + name); return m[0]; }
function objConst(name) { const i = app.indexOf('const ' + name + ' ='); const j = app.indexOf('};', i); return app.slice(i, j + 2); }
function block(a, b) { const i = app.indexOf(a); const e = app.indexOf(b, i); return app.slice(i, e + b.length); }
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }
const MIN = 60e3, HOUR = 36e5, DAY = 864e5;

// ── RENDER sandbox (orphan cleanup + terminal ramp) ──
let RFLOWS = [];
const RS = { console, Math, JSON, Array, Number, isFinite, Infinity, Date, activeRange: '24h', window: undefined, _aurixLoadCapitalFlows: () => RFLOWS, toBase: v => v };
vm.createContext(RS);
['_AURIX_RC_ASPECT', '_AURIX_RC_PAD_FRAC', '_AURIX_RC_VPAD_FRAC', '_AURIX_IR_VALUE_MARGIN', '_AURIX_IR_VPAD_FRAC', '_AURIX_Y_JUMP_DOMINANCE', '_AURIX_Y_LEGIBLE_ALPHA', '_AURIX_VP_GAP_MEDIAN_MULT', '_AURIX_BRIDGE_SEG_ENABLED'].forEach(c => vm.runInContext(konst(c), RS));
['_AURIX_VP_DENSITY', '_AURIX_X_FILL_BETA', '_AURIX_VP_GAP_FLOOR_MS', '_AURIX_BRIDGE_SEG_FRAC'].forEach(c => vm.runInContext(objConst(c), RS));
vm.runInContext(block('const _AURIX_CAPITAL_STEP_SEG_ENABLED', 'const _AURIX_ALL_MIN_TRUST_SPAN_MS = 21 * 864e5;'), RS);
['_aurixVpTargetPointCount', 'downsampleAurixLTTB', '_aurixSignificantLocalExtrema', 'downsampleAurixAdaptive', 'computeAurixTimeScale', 'computeAurixAdaptiveXScale', 'computeAurixValueScale', '_aurixMonotonePath', 'buildAurixMonotonicPath', 'buildAurixAreaPath', '_aurixSplitAtGaps', '_aurixConfirmedBridgeGaps', '_aurixVerticalJumps', '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks', '_aurixStructuralBreaks', 'renderValidatedPortfolioChartWithInstitutionalRenderer'].forEach(n => vm.runInContext(fn(n), RS));
const box = { left: 6, right: 994, top: 16, bottom: 404 };
function render(points) { RS.__p = points; return vm.runInContext('renderValidatedPortfolioChartWithInstitutionalRenderer(__p,{range:"24h",vw:1000,vh:420,box:' + JSON.stringify(box) + '})', RS); }
const countM = s => (String(s).match(/M /g) || []).length;

// ── PIPELINE sandbox (ALL trust) ──
let HIST = [], LEDGER = [];
const PS = { console, Math, JSON, Array, Number, isFinite, Infinity, Date, Map, Set, Object, isNaN, parseInt, parseFloat, String, toBase: v => v, _aurixLoadCapitalFlows: () => LEDGER, _aurixHistorySourceForDisplay: () => HIST, currentUser: undefined, activeRange: 'all', __setHist: h => { HIST = h; }, __setLedger: l => { LEDGER = l; } };
vm.createContext(PS);
['_AURIX_EMG_RANGE_MS', '_AURIX_EMG_ADJ_JUMP', '_AURIX_EMG_FALLBACK_TAIL', '_AURIX_EMG_MIN_POINTS', '_AURIX_HPQ_MIN_POINTS', '_AURIX_HPQ_SPIKE_JUMP', '_AURIX_HPQ_SPIKE_REVERT_FRAC', '_AURIX_HPQ_FUTURE_MS', '_AURIX_PROD_MIN_POINTS', '_AURIX_PROD_GATE_PCT', '_AURIX_RET_MIN_BASE', '_AURIX_RET_SANE_PCT', '_AURIX_STEP_MATCH_MIN_CONF', '_AURIX_ALL_MIN_TRUST_SPAN_MS', '_AURIX_VJUMP_MIN_FRAC', '_AURIX_VJUMP_P95_MULT', '_AURIX_CAPSTEP_RATIO_LO', '_AURIX_CAPSTEP_RATIO_HI', '_AURIX_CAPSTEP_TS_PAD_MS', '_AURIX_CAPITAL_STEP_SEG_ENABLED'].forEach(c => vm.runInContext(konst(c), PS));
['_aurixEmergencyHash', '_aurixProdPlateauFilter', '_aurixProdVisualGate', '_aurixHpqIso', '_aurixHpqDiag', '_aurixHpqRangesContaining', '_aurixHpqRawStages', '_aurixHpqTrimConstruction', '_aurixHpqQuarantineSpikes', '_aurixHpqFirstInvalidStage', 'buildValidatedHistoricalSeries', '_aurixNetFlowsInWindow', '_aurixComputePeriodReturn', '_aurixVerticalJumps', '_aurixCapitalStepBreaks', 'buildProductionPortfolioChart'].forEach(n => vm.runInContext(fn(n), PS));
function build(range) { return vm.runInContext('buildProductionPortfolioChart(' + JSON.stringify(range) + ')', PS); }
function ramp(startV, endV, days) { const n = Math.round(days * 24 * 2), t0 = 1_800_000_000_000, out = []; for (let i = 0; i < n; i++) out.push({ ts: t0 + i * 30 * MIN, total: +(startV + (endV - startV) * (i / (n - 1))).toFixed(2), real_estate: 0 }); return out; }

console.log('AURIX-CHART-V480-RUNTIME-CLEANUP — SPEC DSH.CHART.V480.RUNTIME-CLEANUP.01\n');

console.log('1. ALL trust:');
// short all-history + DERIVED (tx-backfill) flow → suppressed (no red -21%)
PS.__setHist(ramp(10000, 7833, 4.94));
PS.__setLedger([{ ts: 1_800_000_000_000 + 2 * DAY, amountUSD: 300, source: 'tx-backfill', retimeReason: 'retimed_to_structural_step', retimeConfidence: 0.9, matchedStepTs: 1 }]);
{ const p = build('all'); ok('ALL short + derived flow → suppressed (no red return)', p.returnState !== 'ok' && p.badgeReturnPct === null && p.color === 'flat' && (p.allUntrustReasons || []).includes('short_all_history'), 'rs=' + p.returnState + ' badge=' + p.badgeReturnPct + ' reasons=' + (p.allUntrustReasons || []).join('|')); }
// long trustworthy all-history, clean ledger → return still shown
PS.__setHist(ramp(10000, 11000, 30)); PS.__setLedger([]);
{ const p = build('all'); ok('ALL long + trustworthy → return still shown', p.returnState === 'ok' && Number.isFinite(p.badgeReturnPct) && p.allRangeReturnAllowed === true, 'rs=' + p.returnState + ' badge=' + p.badgeReturnPct); }
// SPEC NEW-ACCOUNT.TOTAL-TRUST.06: a SHORT all-history is a new account → neutral even if the line is
// clean (poca vida real). Supersedes the old v480 "short but clean → allowed" (no false lifetime return).
PS.__setHist(ramp(10000, 10500, 4.94)); PS.__setLedger([]);
{ const p = build('all'); ok('ALL short but CLEAN → NEUTRAL (new-account maturity gate)', p.returnState !== 'ok' && p.badgeReturnPct === null && (p.allUntrustReasons || []).includes('short_all_history'), 'rs=' + p.returnState + ' badge=' + p.badgeReturnPct + ' reasons=' + (p.allUntrustReasons || []).join('|')); }

console.log('\n2. Orphan micro-island cleanup:');
// denseA(30) | +cap step | mid-island | -cap step | denseB(30). Long dense clusters keep p95 small so
// the two big jumps are detected as vertical jumps and matched to flows.
function island(midPts) { const p = [], t0 = 1_800_000_000_000; let t = t0;
  for (let i = 0; i < 30; i++) { p.push({ ts: t, value: 10000 + 6 * i }); t += 10 * MIN; }
  for (let i = 0; i < midPts; i++) { p.push({ ts: t, value: 14000 + 5 * i }); t += 10 * MIN; }
  for (let i = 0; i < 30; i++) { p.push({ ts: t, value: 10000 + 6 * i }); t += 10 * MIN; } return p; }
function flowsFor(series) { const f = []; for (let i = 1; i < series.length; i++) { const d = series[i].value - series[i - 1].value; if (Math.abs(d) > 1000) f.push({ ts: series[i - 1].ts, amountUSD: d }); } return f; }
{ const s = island(2); RFLOWS = flowsFor(s); const rc = render(s);
  ok('interior 2-pt micro-island NOT drawn (orphan skipped)', rc.capitalStepSegmentCount >= 2 && countM(rc.linePath) === 2, 'cap=' + rc.capitalStepSegmentCount + ' M=' + countM(rc.linePath)); }

console.log('\n(cluster real pequeño no se oculta):');
{ const s = island(4); RFLOWS = flowsFor(s); const rc = render(s);
  ok('interior 4-pt real cluster IS kept (rendered)', countM(rc.linePath) >= 3, 'M=' + countM(rc.linePath)); }

console.log('\n3. Terminal sparse ramp (a few sparse tip points hours apart):');
{ RFLOWS = []; const p = [], t0 = 1_800_000_000_000; let t = t0; for (let i = 0; i < 24; i++) { p.push({ ts: t, value: 72000 + 4 * i }); t += 6 * MIN; }
  for (let i = 0; i < 3; i++) { t += 2 * HOUR; p.push({ ts: t, value: 72100 + 300 * (i + 1) }); }   // sparse terminal ramp
  const rc = render(p); ok('terminal sparse ramp cut (dense cluster its own premium subpath)', rc.sparseRampSegmentCount >= 1 && countM(rc.linePath) >= 2, 'ramp=' + rc.sparseRampSegmentCount + ' M=' + countM(rc.linePath)); }

console.log('\nGuards (dense preserved, no synthetic points):');
{ RFLOWS = []; const p = [], t0 = 1_800_000_000_000; for (let i = 0; i < 160; i++) p.push({ ts: t0 + i * 8 * MIN, value: Math.round(72000 + 200 * Math.sin(i * 0.2)) });
  const rc = render(p); const inVals = new Set(p.map(x => x.value));
  ok('dense 24H premium intact (single continuous path)', rc.structuralBreakCount === 0 && countM(rc.linePath) === 1, 'M=' + countM(rc.linePath));
  ok('no synthetic points (all rendered values real)', rc.visiblePoints.every(v => inVals.has(v.value))); }

console.log('\nSiblings remain green:');
for (const [label, file] of [['TRUTHFUL_RANGES', 'AURIX-CHART-TRUTHFUL-RANGES-harness.js'], ['BRIDGE_SEGMENTATION', 'AURIX-CHART-24H-BRIDGE-SEGMENTATION-harness.js'], ['DATA-TRUTH', 'AURIX-CHART-INSTITUTIONAL-DATA-TRUTH-harness.js'], ['24H premium reference', 'AURIX-CHART-24H-PREMIUM-REFERENCE-harness.js'], ['auth stability freeze', 'AURIX-AUTH-MOBILE-STABILITY-FREEZE-harness.js']]) {
  let good = false; try { cp.execSync('node ' + JSON.stringify(path.join(__dirname, file)), { stdio: 'ignore' }); good = true; } catch (_) {}
  ok(label + ' remains green', good);
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
