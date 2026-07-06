'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-RANGE-TRUTH-AUDIT-harness — SPEC DSH.CHART.HISTORICAL-RANGE-TRUTH.15 (Phase 1 forensic tool)
// ════════════════════════════════════════════════════════════════════════════
// Verifies window.aurixChartRangeTruthAudit() is a PURE READ-ONLY, deterministic, JSON-serializable range
// comparator that classifies the observed "long ranges look identical + surviving left fragments" pattern:
// LEGITIMATE short history vs a real defect (out-of-window contamination / shared array / synthetic points /
// incompatible fragment). It NEVER mutates source, localStorage or global state and calls no save/sync/write.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(startIdx) { let k = app.indexOf('{', startIdx), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(startIdx, k); }
function fn(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing fn ' + name); return braceSlice(i); }
function konst(name) {
  const m = new RegExp('const ' + name + '\\s*=\\s*').exec(app);
  if (!m) throw new Error('missing const ' + name);
  const i = m.index, eq = m.index + m[0].length, first = app[eq];
  if (first === '{' || first === '[') { const body = braceSlice(eq); const semi = app.indexOf(';', eq + body.length); return app.slice(i, semi + 1); }
  const semi = app.indexOf(';', eq); return app.slice(i, semi + 1);
}
function winAssign(name) { const s = 'window.' + name + ' = function'; const i = app.indexOf(s); if (i < 0) throw new Error('missing window.' + name); return braceSlice(i) + ';'; }
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }
const DAY = 864e5, HOUR = 36e5, MIN = 60e3, T0 = 1_800_000_000_000;

const CONSTS = ['_AURIX_EMG_RANGE_MS', '_AURIX_EMG_ADJ_JUMP', '_AURIX_EMG_FALLBACK_TAIL', '_AURIX_EMG_MIN_POINTS', '_AURIX_HPQ_MIN_POINTS', '_AURIX_HPQ_SPIKE_JUMP', '_AURIX_HPQ_SPIKE_REVERT_FRAC', '_AURIX_HPQ_FUTURE_MS', '_AURIX_PROD_MIN_POINTS', '_AURIX_PROD_GATE_PCT', '_AURIX_RET_MIN_BASE', '_AURIX_RET_SANE_PCT', '_AURIX_STEP_MATCH_MIN_CONF', '_AURIX_ALL_MIN_TRUST_SPAN_MS', '_AURIX_ALL_MIN_TRUST_POINTS', '_AURIX_VJUMP_MIN_FRAC', '_AURIX_VJUMP_P95_MULT', '_AURIX_CAPSTEP_RATIO_LO', '_AURIX_CAPSTEP_RATIO_HI', '_AURIX_CAPSTEP_TS_PAD_MS', '_AURIX_CAPITAL_STEP_SEG_ENABLED', '_AURIX_CHART_RECONCILE_GATE', '_AURIX_SNAP_NEAR_MS', '_AURIX_SNAP_NEAR_FRAC', '_AURIX_SNAP_FE_AUTHORITY_MS', '_AURIX_CHART_EPOCH_TRUST', '_AURIX_CHART_EPOCH_BAND_LO', '_AURIX_CHART_24H_FE_AUTHORITY', '_AURIX_BRIDGE_SEG_ENABLED', '_AURIX_BRIDGE_SEG_FRAC', '_AURIX_SPARSE_RAMP_SEG_ENABLED', '_AURIX_SPARSE_RAMP_MULT', '_AURIX_SPARSE_RAMP_MIN_MS', '_AURIX_ORPHAN_CLEANUP_ENABLED', '_AURIX_ORPHAN_MAX_PTS', '_AURIX_VP_GAP_FLOOR_MS', '_AURIX_VP_GAP_MEDIAN_MULT', '_AURIX_CHART_CONTINUITY_UNIFICATION'];
const FNS = ['_aurixEmergencyHash', '_aurixProdPlateauFilter', '_aurixProdVisualGate', '_aurixHpqIso', '_aurixHpqDiag', '_aurixHpqRangesContaining', '_aurixSourceFamily', '_aurixFrontendUsableInWindow', '_aurixApplyRangeSourceAuthority', '_aurixTrustedChartSource', '_aurixHpqRawStages', '_aurixHpqTrimConstruction', '_aurixHpqQuarantineSpikes', '_aurixHpqFirstInvalidStage', 'buildValidatedHistoricalSeries', '_aurixNetFlowsInWindow', '_aurixComputePeriodReturn', 'buildProductionPortfolioChart', '_aurixConfirmedBridgeGaps', '_aurixVerticalJumps', '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks', '_aurixSplitAtGaps', '_aurixRealGapFloorMs', '_aurixBuildContinuityValidatedSeries', '_aurixStructuralBreaks'];

const S = { HIST: [], setItemCalls: 0, saveCalls: 0 };
function buildCtx() {
  const lsStore = {};
  const localStorage = { getItem: k => (k in lsStore ? lsStore[k] : null), setItem: (k, v) => { S.setItemCalls++; lsStore[k] = String(v); }, removeItem: k => { S.setItemCalls++; delete lsStore[k]; } };
  const ctx = { console, Math, JSON, Array, Number, isFinite, Infinity, Date, Map, Set, Object, isNaN, parseInt, parseFloat, String,
    toBase: v => v, _aurixLoadCapitalFlows: () => [], _aurixHistorySourceForDisplay: () => S.HIST,
    _aurixCanonicalHistoryReady: () => true, currentUser: { id: 'range-truth-u', created_at: '2020-01-01T00:00:00Z' }, activeRange: '24h',
    localStorage: localStorage, saveToBackend: () => { S.saveCalls++; }, autoSaveToBackend: () => { S.saveCalls++; }, recordCategorySnapshot: () => { S.saveCalls++; }, render: () => {},
    window: { AURIX_BUILD: 'v-rt-test' } };
  vm.createContext(ctx);
  CONSTS.forEach(c => vm.runInContext(konst(c), ctx));
  FNS.forEach(n => vm.runInContext(fn(n), ctx));
  vm.runInContext(winAssign('aurixChartRangeTruthAudit'), ctx);
  return ctx;
}
const CTX = buildCtx();
const audit = () => CTX.window.aurixChartRangeTruthAudit();
const AUDIT_SRC = winAssign('aurixChartRangeTruthAudit');
function feHist(t0, n, stepMs, valFn, extra) { const o = []; for (let i = 0; i < n; i++) o.push(Object.assign({ ts: t0 + i * stepMs, total: +valFn(i).toFixed(2), real_estate: 0 }, extra || {})); return o; }

console.log('AURIX-CHART-RANGE-TRUTH-AUDIT — SPEC DSH.CHART.HISTORICAL-RANGE-TRUTH.15 (Phase 1)\n');

// ── 1. exists + read-only + serializable ──
console.log('1. Exists, read-only, JSON-serializable:');
{
  S.HIST = feHist(T0 - 20 * HOUR, 40, 30 * MIN, i => 9000 + i);
  const before = JSON.stringify(S.HIST), len = S.HIST.length;
  S.setItemCalls = 0; S.saveCalls = 0;
  const a = audit();
  ok('function exists', typeof CTX.window.aurixChartRangeTruthAudit === 'function');
  ok('spec marker', a && a.spec === 'DSH.CHART.HISTORICAL-RANGE-TRUTH.15');
  ok('source not mutated', JSON.stringify(S.HIST) === before && S.HIST.length === len);
  ok('no localStorage write', S.setItemCalls === 0);
  ok('no save/sync call', S.saveCalls === 0);
  ok('source text has no write ops', !/localStorage\.setItem|\.upsert\(|\.insert\(|autoSaveToBackend\(|saveToBackend\(|recordCategorySnapshot\(/.test(AUDIT_SRC));
  ok('JSON serializable', (() => { try { JSON.parse(JSON.stringify(a)); return true; } catch (_) { return false; } })());
  ok('has perRange for all 5', ['24h', '7d', '30d', '1y', 'all'].every(r => a.perRange[r]));
}

// ── 2. Scenario A (matches production screenshots): short history <7d → LEGITIMATE ──
console.log('\n2. Short history <7d, 2 fragments + recent segment → LEGITIMATE (not a defect):');
{
  S.HIST = [];
  S.HIST.push({ ts: T0 - 4.8 * DAY, total: 9520, real_estate: 0 }, { ts: T0 - 4.7 * DAY, total: 9515, real_estate: 0 });
  S.HIST.push({ ts: T0 - 3.5 * DAY, total: 9480, real_estate: 0 }, { ts: T0 - 3.4 * DAY, total: 9490, real_estate: 0 });
  S.HIST = S.HIST.concat(feHist(T0 - 1 * DAY, 40, 30 * MIN, i => 9000 + i * 2));
  const a = audit();
  ok('7d/30d/1y/all identical chartHash', ['7d', '30d', '1y'].every(r => a.chartHashByRange[r] === a.chartHashByRange.all), JSON.stringify(a.chartHashByRange));
  ok('24H differs from long ranges', a.chartHashByRange['24h'] !== a.chartHashByRange.all);
  ok('total trust span < 7d', a.shortHistoryShorterThan7d === true, 'span=' + a.totalTrustSpanDays);
  ok('verdict = LEGITIMATE short history', a.verdict === 'LEGITIMATE_short_history_identical_long_ranges', a.verdict);
  ok('NO out-of-window contamination', a.outOfWindowContaminationRanges.length === 0);
  ok('NO shared array across ranges', a.sharedArrayRefsDetected === false);
  ok('syntheticPoints 0', a.syntheticPoints === 0 && ['24h', '7d', '30d', '1y', 'all'].every(r => a.perRange[r].syntheticPoints === 0));
}

// ── 3. per-range window correctness ──
console.log('\n3. Per-range windows anchored on nowRef − span:');
{
  S.HIST = feHist(T0 - 40 * DAY, 200, 4 * HOUR, i => 9000 + i * 0.2);   // >30d dense
  const a = audit();
  const now = new Date(a.perRange['7d'].windowEndIso).getTime();
  const ws7 = new Date(a.perRange['7d'].windowStartIso).getTime();
  ok('7d windowStart ≈ nowRef − 7d', Math.abs((now - ws7) - 7 * DAY) < HOUR, 'delta=' + ((now - ws7) / DAY).toFixed(2) + 'd');
  ok('all has no finite windowStart', a.perRange.all.windowStartIso === null);
  ok('7d excludes >7d points (minPlottedDayRel ≥ −7.1)', a.perRange['7d'].minPlottedDayRel >= -7.1, 'min=' + a.perRange['7d'].minPlottedDayRel);
  ok('no out-of-window plotted points on any finite range', a.outOfWindowContaminationRanges.length === 0);
}

// ── 4. Scenario B: old value-compatible fragment → 1y/all include, 7d/30d exclude; ambiguous ──
console.log('\n4. Old value-compatible fragment (150-200d) → window filter works, fragment ambiguous:');
{
  S.HIST = [];
  S.HIST.push({ ts: T0 - 200 * DAY, total: 9520, real_estate: 0 }, { ts: T0 - 199 * DAY, total: 9515, real_estate: 0 });
  S.HIST.push({ ts: T0 - 150 * DAY, total: 9480, real_estate: 0 }, { ts: T0 - 149 * DAY, total: 9490, real_estate: 0 });
  S.HIST = S.HIST.concat(feHist(T0 - 3 * DAY, 60, HOUR, i => 9000 + i));
  const a = audit();
  ok('7d min ≥ −7 (old fragment excluded)', a.perRange['7d'].minPlottedDayRel >= -7.1, 'min7d=' + a.perRange['7d'].minPlottedDayRel);
  ok('1y min ≤ −140 (old fragment INCLUDED, correctly within 1y)', a.perRange['1y'].minPlottedDayRel <= -140, 'min1y=' + a.perRange['1y'].minPlottedDayRel);
  ok('7d chartHash ≠ 1y chartHash (ranges differ — NOT the screenshot pattern)', a.chartHashByRange['7d'] !== a.chartHashByRange['1y']);
  ok('fragment classified value_compatible_untagged (not falsely rejected)', a.fragments.length >= 1 && a.fragments.some(f => f.verdict === 'value_compatible_untagged_ambiguous'), JSON.stringify(a.fragments.map(f => f.verdict)));
  ok('NOT flagged as out-of-window (in-window is correct)', a.outOfWindowContaminationRanges.length === 0);
}

// ── 5. Scenario C: pre-account fragments rejected by epoch trust (never plotted) ──
console.log('\n5. Pre-account fragments (ts < created_at) rejected — never in plotted series:');
{
  CTX.currentUser.created_at = new Date(T0 - 5 * DAY).toISOString();
  S.HIST = [];
  S.HIST.push({ ts: T0 - 40 * DAY, total: 9520, real_estate: 0 }, { ts: T0 - 39 * DAY, total: 9515, real_estate: 0 });
  S.HIST = S.HIST.concat(feHist(T0 - 2 * DAY, 40, 30 * MIN, i => 9000 + i));
  const a = audit();
  ok('all-range min ≥ −5 (pre-account excluded by epoch trust)', a.perRange.all.minPlottedDayRel >= -5.1, 'min=' + a.perRange.all.minPlottedDayRel);
  ok('no fragment older than account survived', !a.fragments.some(f => f.beforeAccountCreation === true), JSON.stringify(a.fragments.map(f => f.verdict)));
  CTX.currentUser.created_at = '2020-01-01T00:00:00Z';
}

// ── 6. determinism ──
console.log('\n6. Deterministic across input permutations:');
{
  const base = [];
  base.push({ ts: T0 - 4.8 * DAY, total: 9520, real_estate: 0 }, { ts: T0 - 3.5 * DAY, total: 9480, real_estate: 0 });
  for (let i = 0; i < 40; i++) base.push({ ts: T0 - 1 * DAY + i * 30 * MIN, total: +(9000 + i * 2).toFixed(2), real_estate: 0 });
  const strip = a => { const c = JSON.parse(JSON.stringify(a)); ['24h', '7d', '30d', '1y', 'all'].forEach(r => { if (c.perRange[r]) delete c.perRange[r].rangeSeriesRefId; }); delete c.rangeSeriesRefIds; return JSON.stringify(c); };
  const outs = [];
  for (let k = 0; k < 10; k++) { const rot = k % base.length; let a = base.slice(rot).concat(base.slice(0, rot)); if (k % 2) a = a.slice().reverse(); S.HIST = a; outs.push(strip(audit())); }
  ok('10 input orders → identical audit', outs.every(o => o === outs[0]), Array.from(new Set(outs)).length + ' distinct');
}

// ── 7. array identity: ranges never share the same rangeSeries object ──
console.log('\n7. No range-insensitive shared array:');
{
  S.HIST = feHist(T0 - 5 * DAY, 100, HOUR, i => 9000 + i);
  const a = audit();
  const ids = ['24h', '7d', '30d', '1y', 'all'].map(r => a.rangeSeriesRefIds[r]);
  ok('sharedArrayRefsDetected = false', a.sharedArrayRefsDetected === false);
  ok('rangeSeries refIds distinct per range', new Set(ids).size === ids.length, ids.join(','));
}

console.log('\n=== SOURCE CONTRACT ===');
ok('read-only global present', /window\.aurixChartRangeTruthAudit = function/.test(app));
ok('marker SPEC.15 present', /DSH\.CHART\.HISTORICAL-RANGE-TRUTH\.15/.test(app));
ok('classifies verdict (legitimate vs defect)', /LEGITIMATE_short_history_identical_long_ranges/.test(app) && /DEFECT_out_of_window_contamination/.test(app));
ok('detects shared array + out-of-window + synthetic', /sharedArrayRefsDetected/.test(app) && /pointsBeforeWindowStart/.test(app) && /syntheticPoints: 0/.test(app));
ok('classifies fragment lineage (pre-account/pre-reset/value-band)', /pre_account_rejected/.test(app) && /pre_reset_rejected/.test(app) && /foreign_value_band/.test(app));
ok('no behavior flag added (pure read-only tool)', !/_AURIX_CHART_CANONICAL_HISTORICAL_AUTHORITY/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
