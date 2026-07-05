'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-PREMIUM-RANGES-BACKEND-harness — SPEC DSH.CHART.PREMIUM-RANGES.BACKEND-HISTORY.05
// ════════════════════════════════════════════════════════════════════════════
// Backend history (regular ~15-min cadence) must fill long ranges WITHOUT ugly cuts at the join, keep
// 24H dense-frontend authority, invent NO points, and stay partial_history honest when sparse. A genuine
// data HOLE must still segment (honest). Per-range diagnostic exposes coverage/sourceMix/state.
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

// ── RENDER sandbox (visible renderer + structural-break detectors + merge) ──
let RFLOWS = [];
const RS = { console, Math, JSON, Array, Number, isFinite, Infinity, Date, activeRange: '30d', window: undefined, _aurixLoadCapitalFlows: () => RFLOWS, toBase: v => v };
vm.createContext(RS);
['_AURIX_RC_ASPECT', '_AURIX_RC_PAD_FRAC', '_AURIX_RC_VPAD_FRAC', '_AURIX_IR_VALUE_MARGIN', '_AURIX_IR_VPAD_FRAC', '_AURIX_Y_JUMP_DOMINANCE', '_AURIX_Y_LEGIBLE_ALPHA', '_AURIX_VP_GAP_MEDIAN_MULT', '_AURIX_BRIDGE_SEG_ENABLED'].forEach(c => vm.runInContext(konst(c), RS));
['_AURIX_VP_DENSITY', '_AURIX_X_FILL_BETA', '_AURIX_VP_GAP_FLOOR_MS', '_AURIX_BRIDGE_SEG_FRAC'].forEach(c => vm.runInContext(objConst(c), RS));
vm.runInContext(block('const _AURIX_CAPITAL_STEP_SEG_ENABLED', 'const _AURIX_ALL_MIN_TRUST_SPAN_MS = 21 * 864e5;'), RS);
['_aurixVpTargetPointCount', 'downsampleAurixLTTB', '_aurixSignificantLocalExtrema', 'downsampleAurixAdaptive', 'computeAurixTimeScale', 'computeAurixAdaptiveXScale', 'computeAurixValueScale', '_aurixMonotonePath', 'buildAurixMonotonicPath', 'buildAurixAreaPath', '_aurixSplitAtGaps', '_aurixConfirmedBridgeGaps', '_aurixVerticalJumps', '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks', '_aurixStructuralBreaks', 'renderValidatedPortfolioChartWithInstitutionalRenderer'].forEach(n => vm.runInContext(fn(n), RS));
const box = { left: 6, right: 994, top: 16, bottom: 404 };
function render(points, range) { RS.__p = points; return vm.runInContext('renderValidatedPortfolioChartWithInstitutionalRenderer(__p, { range:"' + (range || '30d') + '", vw:1000, vh:420, box:' + JSON.stringify(box) + ' })', RS); }
const countM = s => (String(s).match(/M /g) || []).length;

// ── MERGE sandbox ──
const MS = { console, Math, JSON, Array, Number, isFinite, Infinity };
vm.createContext(MS);
['_AURIX_SNAP_NEAR_MS', '_AURIX_SNAP_NEAR_FRAC', '_AURIX_SNAP_FE_AUTHORITY_MS'].forEach(c => vm.runInContext(konst(c), MS));
['_aurixNormalizeBackendSnapshot', '_aurixMergeSnapshotSources'].forEach(n => vm.runInContext(fn(n), MS));
function merge(fe, be) { MS.__fe = fe; MS.__be = be; return vm.runInContext('_aurixMergeSnapshotSources(__fe, __be, {})', MS); }

// ── PIPELINE sandbox (buildProductionPortfolioChart) ──
let HIST = [];
const PS = { console, Math, JSON, Array, Number, isFinite, Infinity, Date, Map, Set, Object, isNaN, parseInt, parseFloat, String, toBase: v => v, _aurixLoadCapitalFlows: () => [], _aurixHistorySourceForDisplay: () => HIST, currentUser: { id: 'u' }, activeRange: '7d', __setHist: h => { HIST = h; } };
vm.createContext(PS);
['_AURIX_EMG_RANGE_MS', '_AURIX_EMG_ADJ_JUMP', '_AURIX_EMG_FALLBACK_TAIL', '_AURIX_EMG_MIN_POINTS', '_AURIX_HPQ_MIN_POINTS', '_AURIX_HPQ_SPIKE_JUMP', '_AURIX_HPQ_SPIKE_REVERT_FRAC', '_AURIX_HPQ_FUTURE_MS', '_AURIX_PROD_MIN_POINTS', '_AURIX_PROD_GATE_PCT', '_AURIX_RET_MIN_BASE', '_AURIX_RET_SANE_PCT', '_AURIX_STEP_MATCH_MIN_CONF', '_AURIX_ALL_MIN_TRUST_SPAN_MS', '_AURIX_VJUMP_MIN_FRAC', '_AURIX_VJUMP_P95_MULT', '_AURIX_CAPSTEP_RATIO_LO', '_AURIX_CAPSTEP_RATIO_HI', '_AURIX_CAPSTEP_TS_PAD_MS', '_AURIX_CAPITAL_STEP_SEG_ENABLED'].forEach(c => vm.runInContext(konst(c), PS));
['_aurixEmergencyHash', '_aurixProdPlateauFilter', '_aurixProdVisualGate', '_aurixHpqIso', '_aurixHpqDiag', '_aurixHpqRangesContaining', '_aurixHpqRawStages', '_aurixHpqTrimConstruction', '_aurixHpqQuarantineSpikes', '_aurixHpqFirstInvalidStage', 'buildValidatedHistoricalSeries', '_aurixNetFlowsInWindow', '_aurixComputePeriodReturn', '_aurixVerticalJumps', '_aurixCapitalStepBreaks', 'buildProductionPortfolioChart'].forEach(n => vm.runInContext(fn(n), PS));
function build(range) { return vm.runInContext('buildProductionPortfolioChart(' + JSON.stringify(range) + ')', PS); }

const T0 = 1_800_000_000_000, BASE = 72000;

console.log('AURIX-CHART-PREMIUM-RANGES-BACKEND — SPEC DSH.CHART.PREMIUM-RANGES.BACKEND-HISTORY.05\n');

console.log('9. Join has NO ugly cut (regular 15-min backend + dense frontend tail):');
// bimodal {ts,value}: 4d backend body @15min + 1d dense frontend tail @5min
function bimodal() { const p = []; for (let t = T0; t < T0 + 4 * DAY; t += 15 * MIN) p.push({ ts: t, value: Math.round(BASE + 50 * Math.sin(t / HOUR)) });
  for (let t = T0 + 4 * DAY; t <= T0 + 5 * DAY; t += 5 * MIN) p.push({ ts: t, value: Math.round(BASE + 60 + 40 * Math.sin(t / HOUR)) }); return p; }
{ RFLOWS = []; const rc = render(bimodal(), '30d');
  ok('backend↔frontend join → NO structural cut (continuous)', rc.structuralBreakCount === 0 && countM(rc.linePath) === 1, 'breaks=' + rc.structuralBreakCount + ' M=' + countM(rc.linePath));
  ok('join path is premium cubic', /C /.test(rc.linePath)); }

console.log('\n24H dense stays the visual authority (single premium path):');
{ RFLOWS = []; const p = []; for (let t = T0; t <= T0 + DAY; t += 5 * MIN) p.push({ ts: t, value: Math.round(BASE + 200 * Math.sin(t / HOUR * 0.5)) });
  const rc = render(p, '24h'); ok('dense 24H → single continuous premium path', rc.structuralBreakCount === 0 && countM(rc.linePath) === 1, 'breaks=' + rc.structuralBreakCount); }

console.log('\nGenuine HOLE still segments honestly (missing data is NOT hidden):');
// backend body, then a 2.5-day HOLE (cron+app down), then dense tail
{ RFLOWS = []; const p = []; for (let t = T0; t < T0 + 1.5 * DAY; t += 15 * MIN) p.push({ ts: t, value: BASE });
  for (let t = T0 + 4 * DAY; t <= T0 + 5 * DAY; t += 5 * MIN) p.push({ ts: t, value: BASE + 100 });   // 2.5-day gap before this run
  const rc = render(p, '7d'); ok('a real ≥2.5-day hole → segmented (honest, not bridged as premium)', rc.structuralBreakCount >= 1 && countM(rc.linePath) >= 2, 'breaks=' + rc.structuralBreakCount + ' M=' + countM(rc.linePath)); }

console.log('\nMerge: backend fills gaps, no synthetic points, deterministic, no visual duplicates:');
{ // dense frontend last day + backend 15-min for the 4 prior days (older gap-fill)
  const fe = []; for (let t = T0 + 4 * DAY; t <= T0 + 5 * DAY; t += 5 * MIN) fe.push({ ts: t, total: BASE + 60, real_estate: 0 });
  const be = []; for (let t = T0; t < T0 + 4 * DAY; t += 15 * MIN) be.push({ ts: t, total_value_usd: BASE, real_estate: 0, market_state: 'crypto_24_7' });
  const m = merge(fe, be);
  const inSet = new Set(fe.map(p => p.ts).concat(be.map(p => p.ts)));
  // SPEC .10 — backend fills the older gap, but backend points within 60min of the frontend START are now
  // dropped (frontend/remote is the sole authority in its span) → merged is fe + be MINUS that boundary overlap.
  const beKept = m.filter(p => p.source === 'backend_snapshot').length;
  const beNearFrontend = m.some(p => p.source === 'backend_snapshot' && p.ts > fe[0].ts - 60 * MIN);
  ok('backend fills the older 4-day gap (boundary overlap with frontend excluded)', beKept > 100 && !beNearFrontend && m.length <= fe.length + be.length && m.length >= fe.length + be.length - 5, 'merged=' + m.length + ' beKept=' + beKept);
  ok('no synthetic points (every ts is real)', m.every(p => inSet.has(p.ts)));
  ok('deterministic', JSON.stringify(merge(fe, be)) === JSON.stringify(m));
  // near-duplicate backend (within 5min/0.2% of a frontend point) dropped ⇒ no visual duplicate
  const beDup = be.concat([{ ts: fe[10].ts + 60000, total_value_usd: (BASE + 60) + 1, real_estate: 0 }]);
  ok('near-duplicate at the frontend tail dropped (no visual duplicate)', merge(fe, beDup).length === m.length, 'withDup=' + merge(fe, beDup).length); }

console.log('\nHonest partial_history until coverage is real:');
{ // dense frontend ~4d + a FEW backend points slightly older ⇒ 7D coverage < 0.8 ⇒ partial_history
  const fe = []; for (let i = 0; i < 4 * 24 * 12; i++) fe.push({ ts: T0 + i * 5 * MIN, total: BASE + i * 0.1, real_estate: 0 });   // ~4 days @5min
  const be = []; for (let i = 1; i <= 6; i++) be.push({ ts: T0 - i * 6 * HOUR, total_value_usd: BASE - i, real_estate: 0 });        // 6 backend points, ~1.5d older
  PS.__setHist(merge(fe, be));
  const p7 = build('7d'); ok('7D with few backend → partial_history (honest, coverage<0.8)', p7.displayedRangeState === 'partial_history' && p7.coverageRatio < 0.8, 'state=' + p7.displayedRangeState + ' cov=' + p7.coverageRatio); }

console.log('\n10. Per-range diagnostic fields present:');
ok('aurixSnapshotSourceAudit.perRange has backendInWindow/frontendInWindow/sourceMix/coverageRatio/displayedRangeState',
  /backendInWindow: beIn, frontendInWindow: feIn/.test(app) && /sourceMix: totIn/.test(app) && /coverageRatio: cov, displayedRangeState: drs/.test(app));

console.log('\nSiblings remain green:');
for (const [label, file] of [['24H premium reference', 'AURIX-CHART-24H-PREMIUM-REFERENCE-harness.js'], ['BRIDGE_SEGMENTATION', 'AURIX-CHART-24H-BRIDGE-SEGMENTATION-harness.js'], ['V480 cleanup', 'AURIX-CHART-V480-RUNTIME-CLEANUP-harness.js'], ['backend snapshots', 'AURIX-CHART-BACKEND-SNAPSHOTS-harness.js'], ['TRUTHFUL_RANGES', 'AURIX-CHART-TRUTHFUL-RANGES-harness.js'], ['auth freeze', 'AURIX-AUTH-MOBILE-STABILITY-FREEZE-harness.js']]) {
  let good = false; try { cp.execSync('node ' + JSON.stringify(path.join(__dirname, file)), { stdio: 'ignore' }); good = true; } catch (_) {}
  ok(label + ' remains green', good);
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
