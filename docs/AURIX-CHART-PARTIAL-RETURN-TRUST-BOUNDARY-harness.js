'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-PARTIAL-RETURN-TRUST-BOUNDARY-harness — SPEC DSH.CHART.PARTIAL_RETURN_TRUST_BOUNDARY.27
// ════════════════════════════════════════════════════════════════════════════
// After SPEC.26 the deadlock PARTIAL promotion used a range-INDEPENDENT minSpanDays floor (~2d). On the real
// account this let 1Y promote a -191.14% partial from ~3.147 days of history: the wide 1Y sane band (200%)
// admits the flow-neutral residual as returnState 'ok' (partialReturnTrusted=true) while 7D/30D reject it
// (bands 45/80%). SPEC.27 adds the missing trust boundary: a promoted % must ALSO be inside the supported
// semantic domain — finite AND above total loss (> _AURIX_PARTIAL_RETURN_MIN_PCT = -100) for this positive-NAV
// long-only investable-wealth series — else stay honest Calculando (never clamp/rewrite/fabricate/alter
// points). SPEC.26 decoupling + range-independent span floor are preserved. This harness proves the guard on
// the pure resolver + through the SPEC.19 contract, and that the SPEC.25 audit surfaces the contradiction.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(startIdx) { let k = app.indexOf('{', startIdx), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(startIdx, k); }
function fnSrc(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing fn ' + name); return braceSlice(i); }
function konstSrc(name) {
  const m = new RegExp('const ' + name + '\\s*=\\s*').exec(app);
  if (!m) throw new Error('missing const ' + name);
  const i = m.index, eq = m.index + m[0].length, first = app[eq];
  if (first === '{' || first === '[') { const body = braceSlice(eq); const semi = app.indexOf(';', eq + body.length); return app.slice(i, semi + 1); }
  const semi = app.indexOf(';', eq); return app.slice(i, semi + 1);
}
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const DAY = 864e5, HOUR = 36e5, T0 = 1_800_000_000_000;
const CONSTS = [
  '_AURIX_VP_GAP_FLOOR_MS', '_AURIX_VP_GAP_MEDIAN_MULT', '_AURIX_EMG_RANGE_MS', '_AURIX_BRIDGE_SEG_ENABLED',
  '_AURIX_BRIDGE_SEG_FRAC', '_AURIX_CAPITAL_STEP_SEG_ENABLED', '_AURIX_SPARSE_RAMP_SEG_ENABLED',
  '_AURIX_VJUMP_MIN_FRAC', '_AURIX_VJUMP_P95_MULT', '_AURIX_CAPSTEP_RATIO_LO', '_AURIX_CAPSTEP_RATIO_HI',
  '_AURIX_CAPSTEP_TS_PAD_MS', '_AURIX_SPARSE_RAMP_MULT', '_AURIX_SPARSE_RAMP_MIN_MS', '_AURIX_ORPHAN_CLEANUP_ENABLED',
  '_AURIX_ORPHAN_MAX_PTS', '_AURIX_ALL_MIN_TRUST_POINTS', '_AURIX_CHART_CONTINUITY_UNIFICATION',
  '_AURIX_CHART_RETURN_CONTRACT_UNIFICATION', '_AURIX_CHART_SHORT_HISTORY_DISPLAY', '_AURIX_CHART_SHORT_HISTORY_MIN_DAYS',
  '_AURIX_CHART_VISUAL_TRUST_GATE', '_AURIX_VTG_MIN_MAIN_PTS', '_AURIX_VTG_MIN_MAIN_SPAN_MS',
  '_AURIX_CHART_BOOTSTRAP_SUPPRESSION', '_AURIX_STABLE_BAND_LO', '_AURIX_STABLE_MIN_PTS',
  '_AURIX_STABLE_MIN_SPAN_MS', '_AURIX_STABLE_CONSTRUCTION_JUMP', '_AURIX_CHART_FINAL_RENDER_SERIES_CONTRACT',
  '_AURIX_CHART_CANONICAL_REFRESH_DETERMINISM', '_AURIX_CHART_RELIABILITY_DEADLOCK_RESOLUTION', '_AURIX_PARTIAL_RETURN_MIN_PCT',
];
const FRC_FNS = [
  '_aurixEmergencyHash', '_aurixRealGapFloorMs', '_aurixConfirmedBridgeGaps', '_aurixVerticalJumps',
  '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks', '_aurixSplitAtGaps', '_aurixBuildContinuityValidatedSeries',
  '_aurixStructuralBreaks', '_aurixResolveChartReturnContract', '_aurixShortHistoryDisplay', '_aurixVisualTrustGate',
  '_aurixStableDisplayAnchor', '_aurixCanonicalReturnAnchorIndex', '_aurixResolveReliabilityDeadlock',
  '_aurixResolveFinalRenderSeriesContract',
];
function mkFrcCtx() {
  const ctx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date, Set };
  vm.createContext(ctx);
  CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (_) {} });
  FRC_FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (_) {} });
  return ctx;
}
const CTX = mkFrcCtx();
const frc = (emg, r, s) => vm.runInContext('_aurixResolveFinalRenderSeriesContract', CTX)(emg, r, s || 'desktop');
const dl = (emg, contract, r) => vm.runInContext('_aurixResolveReliabilityDeadlock', CTX)(emg, contract, r);
const hash = pts => vm.runInContext('_aurixEmergencyHash', CTX)(pts);
const calc = { state: 'calculating', reason: 'insufficient_requested_range_history' };

function seg(t0, n, stepMs, v0, dv) { const o = []; for (let i = 0; i < n; i++) o.push({ ts: t0 + i * stepMs, value: +(v0 + i * dv).toFixed(2) }); return o; }
// coverage-suppressed finite range with a trusted partial return of `pct` over `spanDays` real days.
function partial(range, pct, over) {
  over = over || {};
  const spanDays = over.spanDays != null ? over.spanDays : 3.147;
  const nPts = over.nPts != null ? over.nPts : 869;
  const pts = seg(T0, Math.min(nPts, 60), (spanDays * DAY) / (Math.min(nPts, 60) - 1), 1000, -0.2);
  const first = pts[0], last = pts[pts.length - 1];
  return Object.assign({
    range: range, state: 'ready', returnState: 'insufficient_return_history',
    returnSuppressedReason: 'insufficient_requested_range_history', reason: 'range_collapsed_history_short',
    points: pts, finalPointCount: nPts, pointCount: nPts,
    firstTs: first.ts, lastTs: last.ts, baselineTs: first.ts, baselineValue: first.value,
    currentTs: last.ts, currentValue: last.value, coverageRatio: over.coverageRatio != null ? over.coverageRatio : 0.1,
    historyTooShortForRange: true, displayedRangeState: 'partial_history', displayedActualSpanMs: spanDays * DAY,
    initialBuildDetected: false, coverageSuppressed: true, partialReturnTrusted: true,
    partialReturnPct: pct, partialReturnValue: -40, partialReturnColor: (pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat'),
    badgeReturnPct: null, returnPct: null, color: 'flat', chartHash: 'h',
  }, over.emg || {});
}
function mature24h(pct) {
  const pts = seg(T0, 48, 30 * 60e3, 1000, pct / 100 * 1000 / 47);
  const first = pts[0], last = pts[pts.length - 1];
  return { range: '24h', state: 'ready', returnState: 'ok', points: pts, finalPointCount: 48, pointCount: 48,
    firstTs: first.ts, lastTs: last.ts, baselineTs: first.ts, baselineValue: first.value, currentTs: last.ts, currentValue: last.value,
    coverageRatio: 0.9997, historyTooShortForRange: false, displayedRangeState: 'full',
    badgeReturnPct: pct, returnPct: pct, color: (pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat'), chartHash: 'h' };
}
const subsetOf = (rp, input) => rp.every(p => input.some(q => q.ts === p.ts && q.value === p.value));

console.log('AURIX-CHART-PARTIAL-RETURN-TRUST-BOUNDARY — SPEC.27');

// 1 — 24H trusted -1.2774 remains eligible + red (direct trusted path, untouched by guard).
{
  const f = frc(mature24h(-1.2774), '24h', 'desktop');
  ok('1 24H trusted -1.28% eligible + red', f.badgeEligible === true && f.colorClass === 'down' && /-1\.2[78]/.test(f.badgeLabel) && f.mode === 'full', f.badgeLabel);
}

// 2 — trusted finite negative > -100% still promotes (evidence supports it).
{
  const f = frc(partial('1y', -3.90), '1y', 'desktop');
  ok('2 partial -3.90% (> -100%) → promoted eligible + red', f.badgeEligible === true && /-3\.90%/.test(f.badgeLabel) && f.colorClass === 'down' && f.state === 'ready', f.badgeLabel + '/' + f.state);
}

// 3 — promoted partial EXACTLY at the supported lower bound (-100%) is rejected (guard is strict `>`).
{
  const d = dl(partial('1y', -100), calc, '1y');
  ok('3 -100% exactly → BUILDING (outside supported domain)', d.branch === 'BUILDING' && d.blockingPredicate === 'promoted_return_outside_supported_domain', d.branch + '/' + d.blockingPredicate);
  const f = frc(partial('1y', -100), '1y', 'desktop');
  ok('3 FRC → not eligible, stays Calculando', f.badgeEligible === false && /Calculando/.test(f.badgeLabel));
}

// 4 — observed real-account shape: 3.147d / 365 requested / -191.1372 candidate must NOT be eligible.
{
  const emg = partial('1y', -191.1372, { spanDays: 3.147, nPts: 869, coverageRatio: 0.0086 });
  const d = dl(emg, calc, '1y');
  ok('4 -191.14% over 3.147d → BUILDING (span passed, domain failed)', d.branch === 'BUILDING' && d.deadlockDetected === false && d.evidence.withinSupportedReturnDomain === false && d.evidence.realSpanDays >= 2, JSON.stringify({ b: d.branch, span: d.evidence.realSpanDays, dom: d.evidence.withinSupportedReturnDomain }));
  const f = frc(emg, '1y', 'desktop');
  ok('4 FRC → NOT badgeEligible', f.badgeEligible === false, f.badgeLabel);
}

// 5/6 — rejected candidate is NOT clamped to -99.99% and NOT rewritten to 0%.
{
  const f = frc(partial('1y', -191.1372, { spanDays: 3.147, nPts: 869 }), '1y', 'desktop');
  ok('5 not clamped to -99.99% (badge Calculando, returnPct null)', f.badgeReturnPct == null && !/-99\.99/.test(f.badgeLabel) && !/-100/.test(f.badgeLabel));
  ok('6 not rewritten to 0% (no 0.00% badge)', !/0\.00%/.test(f.badgeLabel) && f.badgeReturnPct !== 0 && /Calculando/.test(f.badgeLabel));
}

// 7 — rejected candidate does not alter chart points/timestamps/values (line still the real partial series).
{
  const emg = partial('1y', -191.1372, { spanDays: 3.147, nPts: 869 });
  const f = frc(emg, '1y', 'desktop');
  ok('7 renderPoints ⊆ input, none invented', subsetOf(f.renderPoints, emg.points) && f.renderPoints.length >= 2);
  ok('7 line still drawn (geometry not suppressed), badge only', f.lineEligible === true && f.renderPoints.length > 0);
}

// 8 — syntheticPoints stays 0.
{
  const cases = [frc(partial('1y', -191.1372), '1y', 'desktop'), frc(partial('1y', -3.90), '1y', 'desktop'), frc(mature24h(-1.28), '24h', 'desktop')];
  ok('8 syntheticPoints = 0 everywhere', cases.every(c => c.diagnostics.syntheticPoints === 0));
}

// 9/10 — 7D & 30D existing BUILDING behavior is not worsened (untrusted partial still BUILDING for same reason).
['7d', '30d'].forEach((rg, i) => {
  const untrusted = partial(rg, -191.1372, { emg: { partialReturnTrusted: false, partialReturnPct: null } });
  const f = frc(untrusted, rg, 'desktop');
  ok((9 + i) + ' ' + rg.toUpperCase() + ' untrusted partial → still BUILDING/Calculando (unchanged)', f.badgeEligible === false && (f.reasonCodes || []).indexOf('RELIABILITY_DEADLOCK_GENUINE_BUILDING') >= 0);
});

// 11 — ALL new-account protection intact (resolver NA for ALL; suppressed emg stays Calculando).
{
  const allEmg = partial('all', -191.1372, { emg: { returnState: 'insufficient_return_history', returnSuppressedReason: 'all_history_new_account_or_initial_build', coverageSuppressed: false, partialReturnTrusted: false, partialReturnPct: null, initialBuildDetected: true } });
  const dAll = dl(allEmg, calc, 'all');
  ok('11 ALL → resolver NA (SPEC.06 gate owns ALL)', dAll.branch === 'NA');
  const f = frc(allEmg, 'all', 'desktop');
  ok('11 ALL → stays Calculando (not eligible)', f.badgeEligible === false);
}

// 12 — desktop / mobile parity on a promoted (valid) partial AND a rejected (impossible) partial.
{
  const okd = frc(partial('1y', -3.90), '1y', 'desktop'), okm = frc(partial('1y', -3.90), '1y', 'mobile');
  const bad = frc(partial('1y', -191.1372), '1y', 'desktop'), badm = frc(partial('1y', -191.1372), '1y', 'mobile');
  ok('12 parity on promoted partial', hash(okd.renderPoints) === hash(okm.renderPoints) && okd.badgeLabel === okm.badgeLabel && okd.colorClass === okm.colorClass && okd.state === okm.state);
  ok('12 parity on rejected impossible partial', hash(bad.renderPoints) === hash(badm.renderPoints) && bad.badgeLabel === badm.badgeLabel && bad.state === badm.state);
}

// 13/14 — legitimate trusted partial (positive and negative within domain) still promotes.
{
  const p = frc(partial('1y', 2.10), '1y', 'desktop');
  ok('13 partial +2.10% → promoted up/green', p.badgeEligible === true && p.colorClass === 'up' && p.badgeReturnPct === 2.10);
  const n = frc(partial('30d', -42.5), '30d', 'desktop');
  ok('14 partial -42.5% (within domain) → promoted down/red', n.badgeEligible === true && n.colorClass === 'down' && n.badgeReturnPct === -42.5);
}

// ── 15 — AUDIT CORRECTION: a badge-eligible impossible promoted return is surfaced as a defect ──────────────
// (defense-in-depth: exercised by stubbing an FRC that STILL promotes an impossible %, proving the audit never
//  summarises returnContractDefectCount:0 for that contradictory state.)
{
  const AFNS = ['_aurixEmergencyHash', '_aurixRealGapFloorMs', '_aurixConfirmedBridgeGaps', '_aurixVerticalJumps',
    '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks', '_aurixSplitAtGaps', '_aurixBuildContinuityValidatedSeries',
    '_aurixStructuralBreaks', '_aurixClassifyCrossRangeSeriesProvenance', '_aurixAuditRenderPathGaps', '_aurixAuditLongRangeEvidenceCore'];
  const actx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date, Set, Object, String, __FIX: {} };
  vm.createContext(actx);
  CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), actx); } catch (_) {} });
  AFNS.forEach(f => { try { vm.runInContext(fnSrc(f), actx); } catch (_) {} });
  actx.buildProductionPortfolioChart = r => (actx.__FIX[r] && actx.__FIX[r].chart) || { points: [], state: 'pending' };
  actx.buildValidatedHistoricalSeries = r => (actx.__FIX[r] && actx.__FIX[r].vhs) || {};
  actx._aurixResolveFinalRenderSeriesContract = (chart, r) => (actx.__FIX[r] && actx.__FIX[r].frc) || {};
  const pts = seg(T0, 40, (3.147 * DAY) / 39, 1000, -0.2);
  // a contract that (wrongly) promoted an impossible % as eligible — the audit must catch it.
  const badFrc = { renderPoints: pts, mode: 'partial_clean', colorClass: 'down', badgeLabel: '-191.14%', badgeReturnPct: -191.1372,
    badgeEligible: true, renderPathCount: 1, state: 'ready', historyCoverage: 'PARTIAL_AVAILABLE_HISTORY',
    reasonCodes: ['RELIABILITY_DEADLOCK_RESOLVED_PARTIAL'], returnAnchorTs: pts[0].ts,
    diagnostics: { syntheticPoints: 0, reliabilityDeadlock: { branch: 'PARTIAL', evidence: {} } } };
  const chart = { points: pts, state: 'ready', firstTs: pts[0].ts, lastTs: pts[pts.length - 1].ts, baselineTs: pts[0].ts, baselineValue: 1000,
    currentValue: pts[pts.length - 1].value, coverageRatio: 0.0086, returnState: 'insufficient_return_history',
    returnSuppressedReason: 'insufficient_requested_range_history', coverageSuppressed: true, partialReturnTrusted: true, badgeReturnPct: -191.1372 };
  actx.__FIX = { '1y': { chart, vhs: { validatedFull: pts, rangeSeries: pts, nowRef: pts[pts.length - 1].ts }, frc: badFrc } };
  const a = vm.runInContext('_aurixAuditLongRangeEvidenceCore', actx)({ ranges: ['1y'], surfaces: ['desktop'], include24hControl: false });
  ok('15 audit → returnContractDefectCount >= 1 (not 0)', a.summary.returnContractDefectCount >= 1 && a.summary.impossiblePromotedReturnCount >= 1, JSON.stringify(a.summary));
  const d = (a.defects || []).find(x => x.category === 'impossible_promoted_return');
  ok('15 defect surfaced with exact fields', !!d && d.range === '1y' && d.returnPct === -191.1372 && /insufficient/.test(d.returnState) && d.coverageRatio === 0.0086 && d.partialReturnTrusted === true && d.badgeEligible === true && /_aurixResolveReliabilityDeadlock/.test(d.minimalRootCauseSite), JSON.stringify(d));
  ok('15 returnContractAudit classification = IMPOSSIBLE_PROMOTED_RETURN', a.returnContractAudit['1y'].classification === 'IMPOSSIBLE_PROMOTED_RETURN');
}

// ── source-level invariants (16) ──
console.log('\nSource-level:');
ok('16 SPEC.27 marker present', /PARTIAL_RETURN_TRUST_BOUNDARY\.27/.test(app));
ok('16 supported-domain guard in promotion gate', /withinSupportedReturnDomain/.test(app) && /_AURIX_PARTIAL_RETURN_MIN_PCT/.test(app));
ok('16 exactly ONE return formula', (app.match(/function _aurixComputePeriodReturn\(/g) || []).length === 1);
ok('16 exactly ONE deadlock resolver', (app.match(/function _aurixResolveReliabilityDeadlock\(/g) || []).length === 1);
ok('16 SPEC.19 sole final render chokepoint', (app.match(/function _aurixResolveFinalRenderSeriesContract\(/g) || []).length === 1);
ok('16 SPEC.26 decoupling preserved (range-independent minSpanDays)', /const minSpanDays = \(tbl\['7d'\] != null\)/.test(app));
ok('16 no clamp / forced-neutral (guard returns BUILDING, never rewrites %)', /promoted_return_outside_supported_domain/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
