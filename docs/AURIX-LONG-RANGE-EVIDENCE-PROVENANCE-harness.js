'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-LONG-RANGE-EVIDENCE-PROVENANCE-harness — SPEC DSH.CHART.LONG_RANGE_EVIDENCE_PROVENANCE.25
// ════════════════════════════════════════════════════════════════════════════
// _aurixAuditLongRangeEvidenceCore is a READ-ONLY, single-pass provenance audit that PROVES why 7D/30D/1Y/ALL
// look near-identical and/or stay "Calculando…" while 24H works. It reuses the SPEC.19 final contract, the
// canonical builders and the SPEC.23 pure classifiers. This harness stubs ONLY the three data builders
// (buildProductionPortfolioChart / buildValidatedHistoricalSeries / _aurixResolveFinalRenderSeriesContract)
// with controlled fixtures and loads the REAL hash + cross-range + render-path-gap classifiers, then asserts
// the 10 spec scenarios: legitimate short history, proven cross-range alias, older-evidence-used clean,
// gap segmented (no bridge) vs gap bridged (bridge defect), Calculando with / without usable baseline,
// safe clipboard fallback, read-only (no mutation / no forbidden call), and syntheticPoints always 0.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(startIdx) { let k = app.indexOf('{', startIdx), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(startIdx, k); }
function fnSrc(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing fn ' + name); return braceSlice(i); }
function konstSrc(name) {
  const m = new RegExp('const ' + name + '\\s*=\\s*').exec(app);
  if (!m) throw new Error('missing const ' + name);
  const eq = m.index + m[0].length, first = app[eq];
  if (first === '{' || first === '[') { const body = braceSlice(eq); const semi = app.indexOf(';', eq + body.length); return app.slice(m.index, semi + 1); }
  const semi = app.indexOf(';', eq); return app.slice(m.index, semi + 1);
}
function stmtSrc(marker) { const i = app.indexOf(marker); if (i < 0) throw new Error('missing stmt ' + marker); return braceSlice(i) + ';'; }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const DAY = 864e5, HOUR = 36e5, T0 = 1_800_000_000_000;
const CONSTS = ['_AURIX_VP_GAP_FLOOR_MS', '_AURIX_VP_GAP_MEDIAN_MULT', '_AURIX_EMG_RANGE_MS', '_AURIX_BRIDGE_SEG_ENABLED',
  '_AURIX_BRIDGE_SEG_FRAC', '_AURIX_CAPITAL_STEP_SEG_ENABLED', '_AURIX_SPARSE_RAMP_SEG_ENABLED', '_AURIX_VJUMP_MIN_FRAC',
  '_AURIX_VJUMP_P95_MULT', '_AURIX_CAPSTEP_RATIO_LO', '_AURIX_CAPSTEP_RATIO_HI', '_AURIX_CAPSTEP_TS_PAD_MS',
  '_AURIX_SPARSE_RAMP_MULT', '_AURIX_SPARSE_RAMP_MIN_MS', '_AURIX_CHART_CONTINUITY_UNIFICATION'];
const GAP_FNS = ['_aurixEmergencyHash', '_aurixRealGapFloorMs', '_aurixConfirmedBridgeGaps', '_aurixVerticalJumps',
  '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks', '_aurixSplitAtGaps', '_aurixBuildContinuityValidatedSeries', '_aurixStructuralBreaks'];
const CORE_FNS = ['_aurixClassifyCrossRangeSeriesProvenance', '_aurixAuditRenderPathGaps', '_aurixAuditLongRangeEvidenceCore'];

function mkCtx(withSplit) {
  const ctx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date, Set, Map, String, Object, __FIX: {} };
  vm.createContext(ctx);
  CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (_) {} });
  GAP_FNS.forEach(f => {
    if (!withSplit && (f === '_aurixStructuralBreaks' || f === '_aurixSplitAtGaps')) return;   // simulate a renderer that does NOT segment
    try { vm.runInContext(fnSrc(f), ctx); } catch (_) {}
  });
  CORE_FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (e) { throw new Error('load ' + f + ': ' + e.message); } });
  // stub the three data builders — read live from ctx.__FIX (reassigned per scenario)
  ctx.buildProductionPortfolioChart = r => (ctx.__FIX[r] && ctx.__FIX[r].chart) || { points: [], state: 'pending' };
  ctx.buildValidatedHistoricalSeries = r => (ctx.__FIX[r] && ctx.__FIX[r].vhs) || {};
  ctx._aurixResolveFinalRenderSeriesContract = (chart, r) => (ctx.__FIX[r] && ctx.__FIX[r].frc) || {};
  return ctx;
}
const FULL = mkCtx(true), NOSPLIT = mkCtx(false);
function audit(ctx, fix, options) { ctx.__FIX = fix; return vm.runInContext('_aurixAuditLongRangeEvidenceCore', ctx)(options || {}); }

function seg(t0, n, stepMs, v0, dv) { const o = []; for (let i = 0; i < n; i++) o.push({ ts: t0 + i * stepMs, value: +(v0 + i * dv).toFixed(2) }); return o; }
// Build a per-range fixture. renderPoints drives the render hash; validatedFull/rangeSeries drive older-evidence.
function R(o) {
  const rp = o.renderPoints || [];
  const cp = o.chartPoints || rp;
  const chart = {
    points: cp, state: 'ready',
    firstTs: cp.length ? cp[0].ts : null, lastTs: cp.length ? cp[cp.length - 1].ts : null,
    baselineTs: (o.baselineTs !== undefined) ? o.baselineTs : (cp.length ? cp[0].ts : null),
    baselineValue: (o.baselineValue !== undefined) ? o.baselineValue : (cp.length ? cp[0].value : null),
    currentValue: (o.currentValue !== undefined) ? o.currentValue : (cp.length ? cp[cp.length - 1].value : null),
    coverageRatio: (o.coverageRatio !== undefined) ? o.coverageRatio : null,
    returnState: o.returnState || (o.badgeEligible ? 'ok' : 'insufficient_return_history'),
    returnSuppressedReason: o.returnSuppressedReason || null,
    badgeReturnPct: (o.badgeReturnPct !== undefined) ? o.badgeReturnPct : null,
    coverageSuppressed: !!o.coverageSuppressed, partialReturnTrusted: !!o.partialReturnTrusted,
  };
  const vhs = { validatedFull: o.validatedFull || cp, rangeSeries: o.rangeSeries || cp, nowRef: o.nowRef };
  const frc = {
    renderPoints: rp, mode: o.mode || (o.badgeEligible ? 'full' : 'building'), colorClass: o.colorClass || 'flat',
    badgeLabel: o.badgeLabel || (o.badgeEligible ? '+1.00%' : 'Calculando…'),
    badgeReturnPct: (o.badgeReturnPct !== undefined) ? o.badgeReturnPct : (o.badgeEligible ? 1.0 : null),
    badgeEligible: !!o.badgeEligible, renderPathCount: rp.length >= 2 ? 1 : 0,
    state: o.badgeEligible ? 'ready' : 'calculating', reasonCodes: o.reasonCodes || [],
    diagnostics: { syntheticPoints: 0, reliabilityDeadlock: o.deadlockBranch ? { branch: o.deadlockBranch, evidence: {} } : null },
  };
  return { chart, vhs, frc };
}

console.log('AURIX-LONG-RANGE-EVIDENCE-PROVENANCE — SPEC.25');

// ── 1 — legitimate short history: 7d/30d/1y/all SAME 4-day history, no older evidence → no defect ──────────
{
  const now = T0 + 4 * DAY;
  const pts = seg(T0, 40, (4 * DAY) / 39, 1000, 0.1);
  const one = R({ renderPoints: pts, validatedFull: pts, rangeSeries: pts, nowRef: now, coverageRatio: 0.57, badgeEligible: false, deadlockBranch: 'BUILDING' });
  const fix = { '7d': one, '30d': one, '1y': one, 'all': one };
  const a = audit(FULL, fix, { ranges: ['7d', '30d', '1y', 'all'], include24hControl: false });
  ok('1 short history → SHORT_HISTORY_TRUTHFUL_PRESENTATION_NEEDED', a.verdict === 'SHORT_HISTORY_TRUTHFUL_PRESENTATION_NEEDED', a.verdict);
  ok('1 no defects, no alias suspects', a.defects.length === 0 && a.summary.aliasDefectCount === 0 && a.summary.aliasSuspectCount === 0);
  ok('1 every olderEvidence = NO_OLDER_EVIDENCE_SHORT_HISTORY', Object.keys(a.olderEvidenceMatrix).every(k => a.olderEvidenceMatrix[k].classification === 'NO_OLDER_EVIDENCE_SHORT_HISTORY'));
  ok('1 every long pair legitimate', Object.keys(a.pairwiseMatrix).every(k => a.pairwiseMatrix[k].classification === 'SAME_AVAILABLE_HISTORY_LEGITIMATE'));
  ok('1 behaviorChanged false + syntheticPoints 0', a.behaviorChanged === false && a.summary.totalSyntheticPoints === 0);
}

// ── 2 — proven alias: 30D validatedFull holds evidence older than the 7D window, but 30D returns the 7D series ─
{
  const now = T0 + 40 * DAY;
  const L = seg(now - 4 * DAY, 20, (4 * DAY) / 19, 2000, 0.1);          // last-4-days segment (identical for 7D & 30D)
  const seven = R({ renderPoints: L, validatedFull: L, rangeSeries: L, nowRef: now, badgeEligible: true });
  const VF = seg(T0, 60, (40 * DAY) / 59, 1500, 5);                     // 40-day clean validatedFull for 30D
  const thirty = R({ renderPoints: L, chartPoints: L, rangeSeries: L, validatedFull: VF, nowRef: now, badgeEligible: true });   // BUG: clipped to 7D
  const a = audit(FULL, { '7d': seven, '30d': thirty }, { ranges: ['7d', '30d'], include24hControl: false });
  ok('2 alias proven → PROVEN_CROSS_RANGE_ALIAS_DEFECT', a.verdict === 'PROVEN_CROSS_RANGE_ALIAS_DEFECT', a.verdict);
  ok('2 pair classified CROSS_RANGE_ALIAS_DEFECT', a.pairwiseMatrix['7d|30d'].classification === 'CROSS_RANGE_ALIAS_DEFECT');
  ok('2 olderEvidence 30d = OLDER_EVIDENCE_EXISTS_UNUSED', a.olderEvidenceMatrix['30d'].classification === 'OLDER_EVIDENCE_EXISTS_UNUSED');
  ok('2 exactly one cross_range_alias defect with root-cause site', a.defects.filter(d => d.category === 'cross_range_alias').length === 1 && /RangeExtraction/.test(a.defects[0].minimalRootCauseSite));
}

// ── 3 — older evidence exists AND is used (30D reaches back) → distinct series, clean ───────────────────────
{
  const now = T0 + 40 * DAY;
  const L = seg(now - 4 * DAY, 20, (4 * DAY) / 19, 2000, 0.1);
  const M = seg(T0 + 10 * DAY, 60, (30 * DAY) / 59, 1500, 5);           // 30D reaches back ~30 days
  const VF = seg(T0, 70, (40 * DAY) / 69, 1400, 4);
  const seven = R({ renderPoints: L, validatedFull: L, rangeSeries: L, nowRef: now, badgeEligible: true });
  const thirty = R({ renderPoints: M, chartPoints: M, rangeSeries: M, validatedFull: VF, nowRef: now, badgeEligible: true });
  const a = audit(FULL, { '7d': seven, '30d': thirty }, { ranges: ['7d', '30d'], include24hControl: false });
  ok('3 older-evidence-used → LONG_RANGE_EVIDENCE_CLEAN', a.verdict === 'LONG_RANGE_EVIDENCE_CLEAN', a.verdict);
  ok('3 pair DISTINCT_SERIES_EXPECTED, no alias defect', a.pairwiseMatrix['7d|30d'].classification === 'DISTINCT_SERIES_EXPECTED' && a.summary.aliasDefectCount === 0);
  ok('3 olderEvidence 30d = OLDER_EVIDENCE_USED', a.olderEvidenceMatrix['30d'].classification === 'OLDER_EVIDENCE_USED');
}

// ── 4 — temporal gap SEGMENTED (real renderer splits the gap) → no bridge defect ───────────────────────────
{
  const now = T0 + 20 * DAY;
  const segA = seg(T0, 20, HOUR, 1000, 0.5);
  const segB = seg(T0 + 20 * HOUR + 10 * DAY, 20, HOUR, 1010, 0.5);     // 10-day real gap
  const rp = segA.concat(segB);
  const one = R({ renderPoints: rp, chartPoints: rp, rangeSeries: rp, validatedFull: rp, nowRef: now, badgeEligible: true });
  const a = audit(FULL, { '30d': one }, { ranges: ['30d'], include24hControl: false });
  ok('4 gap segmented → bridgedDiscontinuousGapCount 0', a.discontinuities['30d'].bridgedDiscontinuousGapCount === 0 && a.discontinuities['30d'].pathCount > 1, 'paths=' + a.discontinuities['30d'].pathCount);
  ok('4 no visual_bridge defect', a.defects.filter(d => d.category === 'visual_bridge').length === 0 && a.summary.possibleBridgeDefectCount === 0);
  ok('4 real gap reported as REAL_GAP_SEGMENTED', a.discontinuities['30d'].top.some(t => t.classification === 'REAL_GAP_SEGMENTED'));
}

// ── 5 — temporal gap BRIDGED (renderer draws it in one path) → bridge defect ───────────────────────────────
{
  const now = T0 + 20 * DAY;
  const segA = seg(T0, 20, HOUR, 1000, 0.5);
  const segB = seg(T0 + 20 * HOUR + 10 * DAY, 20, HOUR, 1010, 0.5);
  const rp = segA.concat(segB);
  const one = R({ renderPoints: rp, chartPoints: rp, rangeSeries: rp, validatedFull: rp, nowRef: now, badgeEligible: true });
  const a = audit(NOSPLIT, { '30d': one }, { ranges: ['30d'], include24hControl: false });   // NOSPLIT = renderer does not segment
  ok('5 gap bridged → PROVEN_VISUAL_BRIDGE_DEFECT', a.verdict === 'PROVEN_VISUAL_BRIDGE_DEFECT', a.verdict);
  ok('5 bridgedDiscontinuousGapCount > 0', a.discontinuities['30d'].bridgedDiscontinuousGapCount > 0);
  ok('5 visual_bridge defect present with root-cause site', a.defects.some(d => d.category === 'visual_bridge' && /_aurixStructuralBreaks/.test(d.minimalRootCauseSite)));
}

// ── 6 — Calculando with NO usable baseline → legitimate building, no return defect ─────────────────────────
{
  const now = T0 + 3 * DAY;
  const pts = seg(T0, 6, HOUR, 1000, 0.2);
  const one = R({ renderPoints: pts, validatedFull: pts, rangeSeries: pts, nowRef: now, badgeEligible: false,
    deadlockBranch: 'BUILDING', baselineTs: null, baselineValue: null, currentValue: null });
  const a = audit(FULL, { '7d': one }, { ranges: ['7d'], include24hControl: false });
  ok('6 no-baseline Calculando → CALCULATING_NO_USABLE_BASELINE', a.returnContractAudit['7d'].classification === 'CALCULATING_NO_USABLE_BASELINE', a.returnContractAudit['7d'].classification);
  ok('6 no return_contract defect', a.summary.returnContractDefectCount === 0 && a.verdict !== 'RETURN_CONTRACT_DEFECT');
}

// ── 7 — Calculando with a resolver-approved trustworthy partial baseline that never fired → return defect ──
{
  const now = T0 + 6 * DAY;
  const pts = seg(T0, 30, (6 * DAY) / 29, 1000, 0.3);
  const one = R({ renderPoints: pts, validatedFull: pts, rangeSeries: pts, nowRef: now, badgeEligible: false,
    deadlockBranch: 'PARTIAL', baselineTs: T0, baselineValue: 1000, currentValue: 1009,
    coverageSuppressed: true, partialReturnTrusted: true });
  const a = audit(FULL, { '7d': one }, { ranges: ['7d'], include24hControl: false });
  ok('7 usable trustworthy baseline stuck Calculando → RETURN_CONTRACT_DEFECT', a.verdict === 'RETURN_CONTRACT_DEFECT', a.verdict);
  ok('7 returnContractAudit classification RETURN_CONTRACT_DEFECT', a.returnContractAudit['7d'].classification === 'RETURN_CONTRACT_DEFECT');
  ok('7 return_contract defect with badge-gate root-cause site', a.defects.some(d => d.category === 'return_contract' && /badge gate/.test(d.minimalRootCauseSite)));
}

// ── 8 — copy helper handles clipboard NotAllowedError (reject + sync throw) without throwing ────────────────
{
  const copyStmt = stmtSrc('window.aurixCopyLastLongRangeEvidenceAudit = function');
  function runCopy(clipImpl) {
    const w = { __AURIX_LAST_LONG_RANGE_EVIDENCE_AUDIT__: { verdict: 'X', v: 1 } };
    const nav = { clipboard: { writeText: clipImpl } };
    const ctx = { window: w, navigator: nav, console: { log() {} }, JSON };
    vm.createContext(ctx);
    vm.runInContext(copyStmt, ctx);
    return vm.runInContext('window.aurixCopyLastLongRangeEvidenceAudit()', ctx);
  }
  let threw = false, json1 = '', json2 = '', json3 = '';
  try { json1 = runCopy(() => Promise.reject(new Error('NotAllowedError'))); } catch (_) { threw = true; }
  try { json2 = runCopy(() => { throw new Error('NotAllowedError'); }); } catch (_) { threw = true; }
  try { json3 = runCopy(() => Promise.resolve()); } catch (_) { threw = true; }
  ok('8 copy never throws on clipboard reject / sync throw / resolve', !threw);
  ok('8 copy returns the stored JSON in every case', /"verdict": "X"/.test(json1) && /"verdict": "X"/.test(json2) && /"verdict": "X"/.test(json3));
}

// ── 9 — read-only: audit does not mutate fixtures and calls no render / save / storage global ──────────────
{
  const now = T0 + 4 * DAY;
  const pts = seg(T0, 40, (4 * DAY) / 39, 1000, 0.1);
  const one = R({ renderPoints: pts, validatedFull: pts, rangeSeries: pts, nowRef: now, coverageRatio: 0.57, badgeEligible: false, deadlockBranch: 'BUILDING' });
  const fix = { '7d': one, '30d': one, '1y': one, 'all': one };
  const before = JSON.stringify(fix);
  // install spies for functions a write would use; the audit must never touch them
  let forbidden = 0;
  ['renderValidatedPortfolioChartWithInstitutionalRenderer', '_wscPaintEmergency', 'renderAurixMobileLiteChart',
    'scheduleStateFlush', 'saveState', 'flushState'].forEach(name => { FULL[name] = () => { forbidden++; }; });
  FULL.localStorage = { setItem: () => { forbidden++; }, getItem: () => null };
  const a = audit(FULL, fix, { ranges: ['7d', '30d', '1y', 'all'], include24hControl: false });
  ok('9 fixtures not mutated (read-only of data)', JSON.stringify(fix) === before);
  ok('9 no render / save / storage global invoked', forbidden === 0);
  ok('9 behaviorChanged flag is false', a.behaviorChanged === false);
  ['renderValidatedPortfolioChartWithInstitutionalRenderer', '_wscPaintEmergency', 'renderAurixMobileLiteChart',
    'scheduleStateFlush', 'saveState', 'flushState', 'localStorage'].forEach(name => { delete FULL[name]; });
}

// ── 10 — syntheticPoints always 0 across every scenario shape ──────────────────────────────────────────────
{
  const now = T0 + 40 * DAY;
  const L = seg(now - 4 * DAY, 20, (4 * DAY) / 19, 2000, 0.1);
  const M = seg(T0 + 10 * DAY, 60, (30 * DAY) / 59, 1500, 5);
  const fix = {
    '7d': R({ renderPoints: L, validatedFull: L, rangeSeries: L, nowRef: now, badgeEligible: true }),
    '30d': R({ renderPoints: M, validatedFull: seg(T0, 70, (40 * DAY) / 69, 1400, 4), rangeSeries: M, nowRef: now, badgeEligible: true }),
  };
  const a = audit(FULL, fix, { ranges: ['7d', '30d'], include24hControl: false });
  ok('10 per-range syntheticPoints all 0', a.ranges.every(r => a.perRange[r].syntheticPoints === 0));
  ok('10 summary.totalSyntheticPoints 0', a.summary.totalSyntheticPoints === 0);
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
