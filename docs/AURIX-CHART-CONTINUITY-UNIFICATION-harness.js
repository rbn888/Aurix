'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-CONTINUITY-UNIFICATION-harness — SPEC DSH.CHART.CONTINUITY-UNIFICATION.13
// ════════════════════════════════════════════════════════════════════════════
// SPEC.12 proved the islands are NOT synthetic points; the renderer splits on structural breaks and the
// SPARSE-RAMP detector over-fires inside a continuous economic segment. This SPEC unifies continuity: the
// visible line, the structural-break split, the badge eligibility and the diagnostics read ONE truth via
// _aurixBuildContinuityValidatedSeries. GATE OFF (forceOff / flag absent) = v494 union (reproduces islands);
// GATE ON = honest breaks only (bridges ∪ capital ∪ real gaps ≥ range floor); artificial sparse-ramp cuts
// in a continuous segment removed. Never a synthetic point, never a false bridge across a real hole.
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
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }
const MIN = 60e3, HOUR = 36e5, DAY = 864e5;

const CONSTS = [
  // pipeline
  '_AURIX_EMG_RANGE_MS', '_AURIX_EMG_ADJ_JUMP', '_AURIX_EMG_FALLBACK_TAIL', '_AURIX_EMG_MIN_POINTS', '_AURIX_HPQ_MIN_POINTS', '_AURIX_HPQ_SPIKE_JUMP', '_AURIX_HPQ_SPIKE_REVERT_FRAC', '_AURIX_HPQ_FUTURE_MS', '_AURIX_PROD_MIN_POINTS', '_AURIX_PROD_GATE_PCT', '_AURIX_RET_MIN_BASE', '_AURIX_RET_SANE_PCT', '_AURIX_STEP_MATCH_MIN_CONF', '_AURIX_ALL_MIN_TRUST_SPAN_MS', '_AURIX_ALL_MIN_TRUST_POINTS', '_AURIX_VJUMP_MIN_FRAC', '_AURIX_VJUMP_P95_MULT', '_AURIX_CAPSTEP_RATIO_LO', '_AURIX_CAPSTEP_RATIO_HI', '_AURIX_CAPSTEP_TS_PAD_MS', '_AURIX_CAPITAL_STEP_SEG_ENABLED', '_AURIX_CHART_RECONCILE_GATE', '_AURIX_SNAP_NEAR_MS', '_AURIX_SNAP_NEAR_FRAC', '_AURIX_SNAP_FE_AUTHORITY_MS', '_AURIX_CHART_EPOCH_TRUST', '_AURIX_CHART_EPOCH_BAND_LO', '_AURIX_CHART_24H_FE_AUTHORITY',
  // break machinery + continuity
  '_AURIX_BRIDGE_SEG_ENABLED', '_AURIX_BRIDGE_SEG_FRAC', '_AURIX_SPARSE_RAMP_SEG_ENABLED', '_AURIX_SPARSE_RAMP_MULT', '_AURIX_SPARSE_RAMP_MIN_MS', '_AURIX_ORPHAN_CLEANUP_ENABLED', '_AURIX_ORPHAN_MAX_PTS', '_AURIX_VP_GAP_FLOOR_MS', '_AURIX_VP_GAP_MEDIAN_MULT', '_AURIX_CHART_CONTINUITY_UNIFICATION'];
const FNS = [
  '_aurixEmergencyHash', '_aurixProdPlateauFilter', '_aurixProdVisualGate', '_aurixHpqIso', '_aurixHpqDiag', '_aurixHpqRangesContaining', '_aurixSourceFamily', '_aurixFrontendUsableInWindow', '_aurixApplyRangeSourceAuthority', '_aurixTrustedChartSource', '_aurixHpqRawStages', '_aurixHpqTrimConstruction', '_aurixHpqQuarantineSpikes', '_aurixHpqFirstInvalidStage', 'buildValidatedHistoricalSeries', '_aurixNetFlowsInWindow', '_aurixComputePeriodReturn', 'buildProductionPortfolioChart',
  '_aurixConfirmedBridgeGaps', '_aurixVerticalJumps', '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks', '_aurixSplitAtGaps', '_aurixRealGapFloorMs', '_aurixBuildContinuityValidatedSeries', '_aurixStructuralBreaks'];

const S = { HIST: [], FLOWS: [] };
function mkCtx() {
  const ctx = { console, Math, JSON, Array, Number, isFinite, Infinity, Date, Map, Set, Object, isNaN, parseInt, parseFloat, String,
    toBase: v => v, _aurixLoadCapitalFlows: () => S.FLOWS, _aurixHistorySourceForDisplay: () => S.HIST,
    _aurixCanonicalHistoryReady: () => true, currentUser: { id: 'u', created_at: '2020-01-01T00:00:00Z' }, activeRange: '24h' };
  vm.createContext(ctx);
  CONSTS.forEach(c => vm.runInContext(konst(c), ctx));
  FNS.forEach(n => vm.runInContext(fn(n), ctx));
  return ctx;
}
const CTX = mkCtx();
const cv = (pts, r, opts) => vm.runInContext('_aurixBuildContinuityValidatedSeries', CTX)(pts, r, opts);
const sbrk = (pts, r) => vm.runInContext('_aurixStructuralBreaks', CTX)(pts, r);
const build = r => vm.runInContext('buildProductionPortfolioChart(' + JSON.stringify(r) + ')', CTX);
const pathCount = c => (c.breaks.length + (c.points.length >= 2 ? 1 : 0));
// point builders ({time,value} for the break helper; {ts,total,real_estate} for the pipeline)
function tv(t0, n, stepMs, valFn) { const o = []; for (let i = 0; i < n; i++) o.push({ time: t0 + i * stepMs, value: +valFn(i).toFixed(2) }); return o; }
function feHist(t0, n, stepMs, valFn) { const o = []; for (let i = 0; i < n; i++) o.push({ ts: t0 + i * stepMs, total: +valFn(i).toFixed(2), real_estate: 0 }); return o; }
const T0 = 1_800_000_000_000;

console.log('AURIX-CHART-CONTINUITY-UNIFICATION — SPEC DSH.CHART.CONTINUITY-UNIFICATION.13\n');

// ── 1. 7D new account: sparse but same-segment → GATE OFF islands, GATE ON continuous ──
console.log('1. 7D same-epoch sparse-ramp islands → GATE ON continuous:');
{
  // dense 20-min cadence with an interior RUN of 3 connections at ~5h each (<2d 7D floor) → sparse-ramp fires OFF
  const pts = [];
  let t = T0 - 5 * DAY; for (let i = 0; i < 12; i++) { pts.push({ time: t, value: 9000 + i }); t += 20 * MIN; }
  for (let i = 0; i < 3; i++) { t += 5 * HOUR; pts.push({ time: t, value: 9012 + i }); }
  for (let i = 0; i < 12; i++) { t += 20 * MIN; pts.push({ time: t, value: 9016 + i }); }
  const off = cv(pts, '7d', { forceOff: true }), on = cv(pts, '7d');
  ok('GATE OFF: sparse-ramp breaks present (islands)', off.sparseRampBreaksBefore >= 1 && off.structuralBreaksAfter >= 1, 'ramps=' + off.sparseRampBreaksBefore + ' breaks=' + off.structuralBreaksAfter);
  ok('GATE OFF: pathCount > 1', pathCount(off) > 1, 'paths=' + pathCount(off));
  ok('GATE ON: artificial islands suppressed → continuous', on.continuityState === 'continuous' && pathCount(on) === 1, 'state=' + on.continuityState + ' paths=' + pathCount(on) + ' artif=' + on.artificialIslandCount);
  ok('GATE ON: no synthetic points (points unchanged)', on.syntheticPoints === 0 && on.points.length === pts.length);
  ok('structuralBreaks delegates to continuity ON', sbrk(pts, '7d').continuityUnified === true && sbrk(pts, '7d').breaks.length === on.breaks.length);
}

// ── 2. 30D short history → partial + calculating ──
console.log('\n2. 30D short history → partial_history / calculating (no false return):');
{
  S.HIST = feHist(T0 - 3 * DAY, 60, HOUR, i => 9000 + i);   // only ~3 days of a 30d window
  const p = build('30d');
  const c = cv(p.points.map(q => ({ time: q.ts, value: q.value })), '30d');
  ok('displayedRangeState partial_history', p.displayedRangeState === 'partial_history', p.displayedRangeState);
  ok('badge not a real return (neutral)', p.returnState !== 'ok', 'rs=' + p.returnState);
  ok('line still drawn (points ≥2)', p.points.length >= 2 && p.state === 'ready');
  ok('continuity coverage < 0.8 → calculating eligibility', c.coverageRatio != null && c.coverageRatio < 0.8 && c.badgeEligibility === 'calculating', 'cov=' + c.coverageRatio);
}

// ── 3. 1A old incompatible island separated by a real gap → segmented, not joined ──
console.log('\n3. 1A old island + recent block separated by a real (>45d) gap → segmented honestly:');
{
  const pts = [];
  let t = T0 - 300 * DAY; for (let i = 0; i < 8; i++) { pts.push({ time: t, value: 5000 + i }); t += DAY; }   // old block
  t += 120 * DAY;                                                                                            // real 120d gap (> 45d 1y floor)
  for (let i = 0; i < 20; i++) { pts.push({ time: t, value: 9000 + i }); t += DAY; }                          // recent block
  const on = cv(pts, '1y');
  ok('GATE ON: real gap segments (breaks ≥1)', on.realGapCount >= 1 && on.structuralBreaksAfter >= 1, 'realGaps=' + on.realGapCount);
  ok('GATE ON: NOT continuous (honest segmentation)', on.continuityState !== 'continuous', on.continuityState);
  ok('GATE ON: no interpolation (points unchanged, no synthetic)', on.syntheticPoints === 0 && on.points.length === pts.length);
  ok('badge eligibility calculating (segmented)', on.badgeEligibility === 'calculating');
}

// ── 4. TOTAL new account → Calculando, no giant return ──
console.log('\n4. TOTAL new account → Calculando (protected by TOTAL-TRUST.06):');
{
  S.HIST = feHist(T0 - 2 * HOUR, 6, 20 * MIN, i => 9000 + i);   // just built, few points
  const p = build('all');
  ok('TOTAL returnState neutral (not ok)', p.returnState !== 'ok', 'rs=' + p.returnState);
  ok('TOTAL no giant construction return (badgeReturnPct null)', p.badgeReturnPct == null, 'badge=' + p.badgeReturnPct);
  ok('line drawn for current epoch (points ≥2 or pending)', p.points.length >= 2 || p.state === 'pending');
}

// ── 5. 24H v494 source authority intact (regression guard) ──
console.log('\n5. 24H v494 frontend authority intact:');
{
  const fe = feHist(T0 - 20 * HOUR, 40, 20 * MIN, i => 9000 + i);
  const be = []; for (let i = 0; i < 8; i++) be.push({ ts: T0 - 22 * HOUR + i * 60 * MIN, total: 9600, real_estate: 0, source: 'backend_snapshot' });
  S.HIST = fe.concat(be);
  const p = build('24h');
  const backendPlotted = p.points.filter(pt => S.HIST.some(h => h.ts === pt.ts && h.source === 'backend_snapshot') && !S.HIST.some(h => h.ts === pt.ts && !h.source)).length;
  ok('24H frontend usable → backendPlotted = 0', backendPlotted === 0, 'bePlotted=' + backendPlotted);
  ok('24H line ready (frontend)', p.state === 'ready' && p.points.length >= 2);
}

// ── 6. Mature account, dense same-epoch → single premium path + real badge ──
console.log('\n6. Mature dense same-epoch → renderPathCount = 1, real badge intact:');
{
  const fe = feHist(T0 - 6 * DAY, 300, 30 * MIN, i => 9000 + i * 0.5);   // dense uniform 6d
  S.HIST = fe;
  const p = build('7d');
  const c = cv(p.points.map(q => ({ time: q.ts, value: q.value })), '7d');
  ok('dense uniform → 0 structural breaks (1 path)', c.structuralBreaksAfter === 0 && pathCount(c) === 1, 'breaks=' + c.structuralBreaksAfter);
  ok('mature badge unaffected (real return possible)', p.state === 'ready' && p.points.length >= 2);
  ok('GATE ON == GATE OFF when dense (no interference)', c.structuralBreaksAfter === cv(p.points.map(q => ({ time: q.ts, value: q.value })), '7d', { forceOff: true }).structuralBreaksAfter);
}

// ── 7. Real gap within 30D → honest segmentation, never a false bridge ──
console.log('\n7. Real 10-day gap inside 30D → segmented (no false continuous bridge):');
{
  const pts = [];
  let t = T0 - 25 * DAY; for (let i = 0; i < 15; i++) { pts.push({ time: t, value: 9000 + i }); t += 6 * HOUR; }
  t += 10 * DAY;   // real 10d hole (> 7d 30d floor)
  for (let i = 0; i < 15; i++) { pts.push({ time: t, value: 9020 + i }); t += 6 * HOUR; }
  const off = cv(pts, '30d', { forceOff: true }), on = cv(pts, '30d');
  ok('GATE ON: real gap becomes a break (segmented)', on.realGapCount >= 1 && on.structuralBreaksAfter >= 1, 'realGaps=' + on.realGapCount + ' breaks=' + on.structuralBreaksAfter);
  ok('GATE ON: NOT continuous over the real hole', on.continuityState !== 'continuous', on.continuityState);
  ok('no interpolation (points unchanged)', on.points.length === pts.length && on.syntheticPoints === 0);
}

// ── 8. Real capital deposit → capital-step segment, not market return, rest of line kept ──
console.log('\n8. Real capital deposit → capital step segments (not market), line preserved:');
{
  const pts = [];
  let t = T0 - 20 * HOUR; for (let i = 0; i < 20; i++) { pts.push({ time: t, value: 9000 + i * 2 }); t += 20 * MIN; }
  const jumpTs = t; pts.push({ time: t, value: 14000 });   // +~4960 deposit jump
  t += 20 * MIN; for (let i = 0; i < 20; i++) { pts.push({ time: t, value: 14000 + i * 2 }); t += 20 * MIN; }
  S.FLOWS = [{ ts: jumpTs, amountUSD: 5000, kind: 'deposit' }];
  const on = cv(pts, '24h');
  ok('GATE ON: capital step is a break', on.capitalStepBreaksAfter >= 1 && on.breaks.some(b => b.reason === 'capital_step'), 'capBreaks=' + on.capitalStepBreaksAfter);
  ok('GATE ON: segmented (deposit not drawn as market curve)', on.continuityState !== 'continuous');
  ok('rest of line kept (≥2 segments, no point deleted)', on.segments.length >= 2 && on.points.length === pts.length);
  S.FLOWS = [];
}

// ── 9. Construction batch (assets added in minutes) → no market return, no misleading islands ──
console.log('\n9. Construction batch → no giant return, honest state:');
{
  S.HIST = feHist(T0 - 40 * MIN, 5, 60 * 1000, i => 100 + i * 2000);   // built in ~4 min, ramping to ~9000
  const p = build('all');
  ok('construction TOTAL not a real return', p.returnState !== 'ok', 'rs=' + p.returnState);
  ok('no giant construction badge', p.badgeReturnPct == null);
}

// ── 10. Determinism: 10 permutations of input → same break set ──
console.log('\n10. Deterministic across input orders:');
{
  const base = [];
  let t = T0 - 5 * DAY; for (let i = 0; i < 12; i++) { base.push({ time: t, value: 9000 + i }); t += 20 * MIN; }
  for (let i = 0; i < 3; i++) { t += 5 * HOUR; base.push({ time: t, value: 9012 + i }); }
  for (let i = 0; i < 12; i++) { t += 20 * MIN; base.push({ time: t, value: 9016 + i }); }
  const sig = c => c.breaks.map(b => b.start + ':' + b.end).join('|') + '#' + c.continuityState + '#' + c.artificialIslandCount;
  const sigs = [];
  for (let k = 0; k < 10; k++) { const rot = k % base.length; let a = base.slice(rot).concat(base.slice(0, rot)); if (k % 2) a = a.slice().reverse(); sigs.push(sig(cv(a, '7d'))); }
  ok('10 input orders → one continuity signature', sigs.every(s => s === sigs[0]), Array.from(new Set(sigs)).length + ' distinct');
}

// ── 11. No synthetic points anywhere ──
console.log('\n11. No synthetic points:');
{
  const pts = tv(T0 - 5 * DAY, 40, 30 * MIN, i => 9000 + i);
  const on = cv(pts, '7d');
  ok('syntheticPoints = 0', on.syntheticPoints === 0);
  ok('every output point ∈ input', on.points.every(p => pts.some(q => q.time === p.time && q.value === p.value)));
}

// ── 12. Diagnostics contract ──
console.log('\n12. Diagnostics contract (chokepoint fields present):');
{
  const pts = tv(T0 - 5 * DAY, 40, 30 * MIN, i => 9000 + i);
  const c = cv(pts, '7d');
  const fields = ['points', 'segments', 'breaks', 'continuityState', 'displayedRangeState', 'badgeEligibility', 'reasonCodes', 'sourceAuthorityMode', 'coverageRatio', 'syntheticPoints', 'realGapCount', 'artificialIslandCount', 'structuralBreaksBefore', 'structuralBreaksAfter', 'sparseRampBreaksBefore', 'sparseRampBreaksAfter', 'capitalStepBreaksBefore', 'capitalStepBreaksAfter', 'realGapFloorMs'];
  ok('all contract fields present', fields.every(f => f in c), fields.filter(f => !(f in c)).join(',') || 'all');
  ok('JSON serializable', (() => { try { JSON.stringify(c); return true; } catch (_) { return false; } })());
  ok('sourceAuthorityMode set', typeof c.sourceAuthorityMode === 'string');
}

console.log('\n=== SOURCE CONTRACT ===');
ok('reversible flag _AURIX_CHART_CONTINUITY_UNIFICATION present', /const _AURIX_CHART_CONTINUITY_UNIFICATION = true;/.test(app));
ok('_aurixStructuralBreaks delegates to continuity helper', /_aurixBuildContinuityValidatedSeries\(points, range\)/.test(app));
ok('helper never invents points (syntheticPoints: 0)', /syntheticPoints: 0/.test(fn('_aurixBuildContinuityValidatedSeries')));
ok('GATE OFF path preserved (v494 union comment)', /EXACT v494/.test(app) || /byte-identical/.test(app));
ok('marker SPEC.13 present', /DSH\.CHART\.CONTINUITY-UNIFICATION\.13/.test(app));
ok('lineage audit exposes continuityUnification block', /continuityUnification:/.test(app) && /continuityUnified:/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
