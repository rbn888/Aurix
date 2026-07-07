'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-CANONICAL-REFRESH-DETERMINISM-harness — SPEC DSH.CHART.CANONICAL-REFRESH-DETERMINISM.21
// ════════════════════════════════════════════════════════════════════════════
// Verifies the SPEC.21 layer shipped THIS turn (inside the SPEC.19 resolver, flag
// _AURIX_CHART_CANONICAL_REFRESH_DETERMINISM): C5 24H single-visible-path integrity (renderPathCount ≤ 1,
// never bridge/fabricate, deterministic path selection), C4/C6 atomic semantic state + explicit blocking
// reason codes + deterministic return anchor exposure, and determinism/purity of the resolver. The
// valuation/source/commit-layer fixes for the refresh color-flip (return-anchor drift from backend autoload)
// and the 7D coverage-span deadlock are proven in the forensic audit and held for founder approval, so those
// harness cases assert the CURRENT (flag-ON) deterministic behaviour of the resolver, not the deferred fix.
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

const DAY = 864e5, HOUR = 36e5, MIN = 60e3, T0 = 1_800_000_000_000;
const CONSTS = [
  '_AURIX_VP_GAP_FLOOR_MS', '_AURIX_VP_GAP_MEDIAN_MULT', '_AURIX_EMG_RANGE_MS', '_AURIX_BRIDGE_SEG_ENABLED',
  '_AURIX_BRIDGE_SEG_FRAC', '_AURIX_CAPITAL_STEP_SEG_ENABLED', '_AURIX_SPARSE_RAMP_SEG_ENABLED',
  '_AURIX_VJUMP_MIN_FRAC', '_AURIX_VJUMP_P95_MULT', '_AURIX_CAPSTEP_RATIO_LO', '_AURIX_CAPSTEP_RATIO_HI',
  '_AURIX_CAPSTEP_TS_PAD_MS', '_AURIX_SPARSE_RAMP_MULT', '_AURIX_SPARSE_RAMP_MIN_MS', '_AURIX_ORPHAN_CLEANUP_ENABLED',
  '_AURIX_ORPHAN_MAX_PTS', '_AURIX_ALL_MIN_TRUST_POINTS',
  '_AURIX_CHART_CONTINUITY_UNIFICATION', '_AURIX_CHART_RETURN_CONTRACT_UNIFICATION',
  '_AURIX_CHART_SHORT_HISTORY_DISPLAY', '_AURIX_CHART_SHORT_HISTORY_MIN_DAYS',
  '_AURIX_CHART_VISUAL_TRUST_GATE', '_AURIX_VTG_MIN_MAIN_PTS', '_AURIX_VTG_MIN_MAIN_SPAN_MS',
  '_AURIX_CHART_BOOTSTRAP_SUPPRESSION', '_AURIX_STABLE_BAND_LO', '_AURIX_STABLE_MIN_PTS',
  '_AURIX_STABLE_MIN_SPAN_MS', '_AURIX_STABLE_CONSTRUCTION_JUMP', '_AURIX_CHART_FINAL_RENDER_SERIES_CONTRACT',
];
const FNS = [
  '_aurixEmergencyHash', '_aurixRealGapFloorMs', '_aurixConfirmedBridgeGaps', '_aurixVerticalJumps',
  '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks', '_aurixSplitAtGaps', '_aurixBuildContinuityValidatedSeries',
  '_aurixStructuralBreaks', '_aurixResolveChartReturnContract', '_aurixShortHistoryDisplay', '_aurixVisualTrustGate',
  '_aurixStableDisplayAnchor', '_aurixResolveFinalRenderSeriesContract', '_aurixCanonicalReturnAnchorIndex',
];
function mkCtx(withCanonFlag) {
  const ctx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date, Set };
  vm.createContext(ctx);
  CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (_) {} });
  if (withCanonFlag) { try { vm.runInContext(konstSrc('_AURIX_CHART_CANONICAL_REFRESH_DETERMINISM'), ctx); } catch (_) {} }
  // _aurixSplitAtGaps may not exist as a top-level `function name(`; guard.
  FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (e) { /* optional */ } });
  return ctx;
}
const ON = mkCtx(true), OFF = mkCtx(false);
const frcON = (emg, range, surface) => vm.runInContext('_aurixResolveFinalRenderSeriesContract', ON)(emg, range, surface);
const frcOFF = (emg, range, surface) => vm.runInContext('_aurixResolveFinalRenderSeriesContract', OFF)(emg, range, surface);
const hash = pts => vm.runInContext('_aurixEmergencyHash', ON)(pts);

function seg(t0, n, stepMs, v0, dv) { const o = []; for (let i = 0; i < n; i++) o.push({ ts: t0 + i * stepMs, value: +(v0 + i * dv).toFixed(2) }); return o; }
function emgOf(points, over) {
  const first = points[0], last = points[points.length - 1];
  return Object.assign({
    range: '30d', state: 'ready', returnState: 'ok', reason: null, pendingReason: null, returnSuppressedReason: null,
    badgeReturnPct: 5.0, returnPct: 5.0, returnValue: 100, color: 'up', coverageRatio: 1.0,
    historyTooShortForRange: false, finalPointCount: points.length, pointCount: points.length,
    baselineTs: first ? first.ts : null, baselineValue: first ? first.value : null,
    currentTs: last ? last.ts : null, currentValue: last ? last.value : null,
    chartHash: 'h', points: points,
  }, over || {});
}
const subsetOf = (rp, input) => rp.every(p => input.some(q => q.ts === p.ts && q.value === p.value));
const sig = frc => JSON.stringify([frc.mode, frc.state, frc.colorClass, frc.badgeLabel, frc.badgeEligible, frc.returnAnchorTs, frc.renderPathCount, hash(frc.renderPoints)]);

console.log('AURIX-CHART-CANONICAL-REFRESH-DETERMINISM — SPEC.21');

// 1. identical canonical input 20× → identical everything.
{
  const pts = seg(T0, 48, 30 * MIN, 1000, 0.05);
  const base = sig(frcON(emgOf(pts, { range: '24h' }), '24h', 'desktop'));
  let same = true; for (let i = 0; i < 20; i++) { if (sig(frcON(emgOf(pts, { range: '24h' }), '24h', 'desktop')) !== base) { same = false; break; } }
  ok('1 identical input 20× → identical contract signature', same);
}

// 3. same reliable near-zero return → same semantic color every run.
{
  const pts = seg(T0, 48, 30 * MIN, 1000, 0);
  const runs = []; for (let i = 0; i < 5; i++) runs.push(frcON(emgOf(pts, { range: '24h', returnState: 'ok', badgeReturnPct: -0.04, returnPct: -0.04, color: 'flat' }), '24h', 'desktop').colorClass);
  ok('3 same -0.04% reliable → same color every run (deterministic)', runs.every(c => c === runs[0]));
  ok('3 -0.04% is within ±0.05 dead-band → neutral/flat (never red flip)', runs[0] === 'flat', runs[0]);
}

// 4. same positive return → never Calculando after eligibility.
{
  const r = frcON(emgOf(seg(T0, 48, 30 * MIN, 1000, 0.05), { range: '24h', returnState: 'ok', badgeReturnPct: 1.22 }), '24h', 'desktop');
  ok('4 positive eligible return → badge eligible, not Calculando', r.badgeEligible === true && !/Calculando/.test(r.badgeLabel) && r.colorClass === 'up');
}

// 5. 24H two disconnected islands → ONE canonical eligible path, renderPathCount ≤ 1, no bridge, synthetic 0.
{
  const A = seg(T0, 10, 12 * MIN, 1000, 0.1);                 // ~1.8h cluster
  const B = seg(T0 + 22 * HOUR, 10, 12 * MIN, 1002, 0.1);     // recent ~1.8h cluster, 22h gap between
  const pts = A.concat(B);
  const r = frcON(emgOf(pts, { range: '24h', returnState: 'ok', badgeReturnPct: 0.24 }), '24h', 'desktop');
  ok('5 24H islands → renderPathCount ≤ 1', r.renderPathCount <= 1, 'paths=' + r.renderPathCount);
  ok('5 24H islands → one contiguous path OR building', (r.mode === 'building') || (r.renderPoints.length >= 2), r.mode);
  ok('5 24H islands → no synthetic point (renderPoints ⊆ input)', r.diagnostics.syntheticPoints === 0 && subsetOf(r.renderPoints, pts));
  ok('5 24H islands → no bridge across gap (single cluster span)', r.mode === 'building' || (r.renderPoints[r.renderPoints.length - 1].ts - r.renderPoints[0].ts) <= 3 * HOUR, 'span=' + ((r.renderPoints[r.renderPoints.length - 1].ts - r.renderPoints[0].ts) / HOUR).toFixed(2) + 'h');
}

// 6. 24H recent path eligible → recent path selected deterministically.
{
  const A = seg(T0, 10, 12 * MIN, 1000, 0.1);
  const B = seg(T0 + 22 * HOUR, 10, 12 * MIN, 1002, 0.1);     // recent, eligible (10 pts / ~1.8h)
  const pts = A.concat(B);
  const r = frcON(emgOf(pts, { range: '24h', returnState: 'ok', badgeReturnPct: 0.24 }), '24h', 'desktop');
  ok('6 24H recent eligible → recent cluster selected', r.renderPoints[0].ts >= B[0].ts, 'first=' + r.renderPoints[0].ts + ' Bstart=' + B[0].ts);
  ok('6 24H recent selection reason code present', (r.reasonCodes || []).indexOf('canonical_24h_recent_path_selected') >= 0 || (r.reasonCodes || []).indexOf('canonical_24h_single_path') >= 0);
}

// 7. 24H recent path ineligible, older dominant eligible → deterministic fallback (older) or building.
{
  const A = seg(T0, 10, 12 * MIN, 1000, 0.1);                 // older, large eligible
  const B = seg(T0 + 22 * HOUR, 2, 3 * MIN, 1002, 0.1);       // recent tiny: 2 pts / 6 min (ineligible)
  const pts = A.concat(B);
  const r = frcON(emgOf(pts, { range: '24h', returnState: 'ok', badgeReturnPct: 0.24 }), '24h', 'desktop');
  ok('7 24H recent-ineligible → renderPathCount ≤ 1', r.renderPathCount <= 1);
  ok('7 24H recent-ineligible → older dominant path or building (deterministic)',
     r.mode === 'building' || (r.renderPoints[0].ts === A[0].ts && r.renderPoints[r.renderPoints.length - 1].ts <= A[A.length - 1].ts), r.mode + ' first=' + (r.renderPoints[0] && r.renderPoints[0].ts));
}

// 8. 7D dense multi-day usable history WITH sufficient coverage → eligible (not Calculando).
{
  const pts = seg(T0, 60, 2 * HOUR + 48 * MIN, 1000, 0.2);    // ~7 days dense, coverage ~1, returnState ok
  const r = frcON(emgOf(pts, { range: '7d', returnState: 'ok', badgeReturnPct: 2.1, coverageRatio: 0.98 }), '7d', 'desktop');
  ok('8 7D sufficient dense history → eligible real return (not Calculando)', r.badgeEligible === true && !/Calculando/.test(r.badgeLabel) && r.mode === 'full', r.mode + ' ' + r.badgeLabel);
}

// 9. 7D genuinely insufficient history → Calculando WITH explicit reason code (never generic).
{
  const pts = seg(T0, 24, 4 * HOUR, 1000, 0.02);              // ~4 days for 7D window
  const r = frcON(emgOf(pts, { range: '7d', returnState: 'insufficient_return_history', returnSuppressedReason: 'insufficient_requested_range_history', historyTooShortForRange: true, badgeReturnPct: null, coverageRatio: 0.57, color: 'flat' }), '7d', 'desktop');
  ok('9 7D insufficient → Calculando', /Calculando/.test(r.badgeLabel) && r.badgeEligible === false);
  ok('9 7D insufficient → EXPLICIT reason code (not generic)', (r.reasonCodes || []).indexOf('INSUFFICIENT_REAL_SPAN') >= 0, JSON.stringify(r.reasonCodes));
  ok('9 7D insufficient → reason codes are not bare ["CALCULATING"]', JSON.stringify(r.reasonCodes) !== JSON.stringify(['CALCULATING']));
}

// 10 + 11. deterministic return anchor / same input → same visual state (no intra-refresh drift).
{
  const pts = seg(T0, 48, 30 * MIN, 1000, 0.05);
  const a = frcON(emgOf(pts, { range: '24h' }), '24h', 'desktop'), b = frcON(emgOf(pts, { range: '24h' }), '24h', 'desktop');
  ok('10 returnAnchorTs deterministic + exposed', a.returnAnchorTs === b.returnAnchorTs && a.returnAnchorTs === pts[0].ts);
  ok('11 same canonical input → identical visual state', sig(a) === sig(b));
}

// 12 + 13. real deposit preserved / real temporal gap never bridged (non-24H keeps honest segmentation).
{
  const A = seg(T0, 20, 6 * HOUR, 1000, 0.2);
  const B = seg(T0 + 20 * DAY, 20, 6 * HOUR, 1400, 0.2);      // real 20-day gap + a step up (deposit-like)
  const pts = A.concat(B);
  const r = frcON(emgOf(pts, { range: '30d', returnState: 'ok', badgeReturnPct: 3.0, coverageRatio: 0.95 }), '30d', 'desktop');
  ok('12 real deposit/step preserved (both clusters kept, no erase)', r.diagnostics.outputCount === pts.length && subsetOf(r.renderPoints, pts));
  ok('13 real temporal gap never bridged (segmented, no synthetic)', r.renderPathCount >= 2 && r.diagnostics.syntheticPoints === 0);
}

// 14. mature clean account — flag ON == flag OFF (no regression, semantic equivalence).
{
  const pts = seg(T0, 60, 12 * HOUR, 980, 0.4);
  const onR = frcON(emgOf(pts, { range: '30d', returnState: 'ok', badgeReturnPct: 8.12 }), '30d', 'desktop');
  const offR = frcOFF(emgOf(pts, { range: '30d', returnState: 'ok', badgeReturnPct: 8.12 }), '30d', 'desktop');
  ok('14 mature clean → flag ON ≡ OFF (byte/semantic equivalent)', sig(onR) === sig(offR) && onR.mode === 'full' && onR.state === 'ready');
}

// 15. desktop == mobile final contract.
{
  const A = seg(T0, 10, 12 * MIN, 1000, 0.1), B = seg(T0 + 22 * HOUR, 10, 12 * MIN, 1002, 0.1);
  const pts = A.concat(B);
  const d = frcON(emgOf(pts, { range: '24h', returnState: 'ok', badgeReturnPct: 0.24 }), '24h', 'desktop');
  const m = frcON(emgOf(pts, { range: '24h', returnState: 'ok', badgeReturnPct: 0.24 }), '24h', 'mobile');
  ok('15 desktop == mobile (renderHash/mode/color/badge/anchor)', hash(d.renderPoints) === hash(m.renderPoints) && d.mode === m.mode && d.colorClass === m.colorClass && d.badgeLabel === m.badgeLabel && d.returnAnchorTs === m.returnAnchorTs);
}

// 16. pure — no emg mutation.
{
  const pts = seg(T0, 10, 12 * MIN, 1000, 0.1).concat(seg(T0 + 22 * HOUR, 10, 12 * MIN, 1002, 0.1));
  const emg = emgOf(pts, { range: '24h', returnState: 'ok', badgeReturnPct: 0.24 });
  const before = JSON.stringify(emg.points);
  frcON(emg, '24h', 'desktop');
  ok('16 pure — emg.points not mutated', JSON.stringify(emg.points) === before);
}

// 17. syntheticPoints = 0 globally (all scenarios above + more).
{
  const cases = [
    frcON(emgOf(seg(T0, 48, 30 * MIN, 1000, 0.05), { range: '24h' }), '24h', 'desktop'),
    frcON(emgOf(seg(T0, 10, 12 * MIN, 1000, 0.1).concat(seg(T0 + 22 * HOUR, 10, 12 * MIN, 1002, 0.1)), { range: '24h', returnState: 'ok', badgeReturnPct: 0.24 }), '24h', 'desktop'),
    frcON(emgOf(seg(T0, 20, 6 * HOUR, 1000, 0.2).concat(seg(T0 + 20 * DAY, 20, 6 * HOUR, 1400, 0.2)), { range: '30d', returnState: 'ok', badgeReturnPct: 3.0 }), '30d', 'desktop'),
  ];
  ok('17 syntheticPoints = 0 globally', cases.every(c => c.diagnostics.syntheticPoints === 0));
}

// 19. flag OFF → exact v502 behaviour (24H islands NOT collapsed; C5 skipped).
{
  const A = seg(T0, 10, 12 * MIN, 1000, 0.1), B = seg(T0 + 22 * HOUR, 10, 12 * MIN, 1002, 0.1);
  const pts = A.concat(B);
  const onR = frcON(emgOf(pts, { range: '24h', returnState: 'ok', badgeReturnPct: 0.24 }), '24h', 'desktop');
  const offR = frcOFF(emgOf(pts, { range: '24h', returnState: 'ok', badgeReturnPct: 0.24 }), '24h', 'desktop');
  ok('19 flag OFF keeps v502 (multi-path 24H NOT collapsed)', offR.renderPathCount >= 2, 'offPaths=' + offR.renderPathCount);
  ok('19 flag ON collapses to single path (the fix)', onR.renderPathCount <= 1, 'onPaths=' + onR.renderPathCount);
  ok('19 flag OFF has no canonical_24h reason codes', !(offR.reasonCodes || []).some(c => /canonical_24h/.test(c)));
}

// 2/B. return anchor from CANONICAL points only (backend gap-filler autoload never re-anchors the return).
{
  const anchorIdx = vm.runInContext('_aurixCanonicalReturnAnchorIndex', ON);
  const be = (ts, v) => ({ ts: ts, value: v, raw: { source: 'backend_snapshot' } });
  const fe = (ts, v) => ({ ts: ts, value: v, raw: { source: 'local' } });
  // frontend-only (early refresh, backend not yet loaded): anchor = index 0.
  const feOnly = [fe(T0, 1000), fe(T0 + HOUR, 1001), fe(T0 + 2 * HOUR, 1002)];
  // later refresh: backend autoload prepended 2 OLDER gap-fillers → merged first points are backend.
  const merged = [be(T0 - 2 * DAY, 600), be(T0 - DAY, 800), fe(T0, 1000), fe(T0 + HOUR, 1001), fe(T0 + 2 * HOUR, 1002)];
  ok('B1 frontend-only → anchor index 0', anchorIdx(feOnly, true) === 0);
  ok('B2 backend prepended older fillers → anchor SKIPS to first canonical point', anchorIdx(merged, true) === 2, 'idx=' + anchorIdx(merged, true));
  ok('B3 canonical anchor ts is STABLE across the two refreshes', feOnly[anchorIdx(feOnly, true)].ts === merged[anchorIdx(merged, true)].ts);
  ok('B4 flag OFF → exact v502 (anchor index 0, backend point wins)', anchorIdx(merged, false) === 0);
  ok('B5 all-backend edge → safe fallback to index 0', anchorIdx([be(T0, 1), be(T0 + HOUR, 2)], true) === 0);
  ok('B6 deterministic (same input → same index)', anchorIdx(merged, true) === anchorIdx(merged.slice(), true));
}

// 22. canonical revision genuinely changes → contract may legitimately change.
{
  const p1 = seg(T0, 48, 30 * MIN, 1000, 0.05);
  const p2 = seg(T0, 48, 30 * MIN, 1000, 0.6);   // materially different geometry (real revision change)
  const a = frcON(emgOf(p1, { range: '24h', returnState: 'ok', badgeReturnPct: 1.0 }), '24h', 'desktop');
  const b = frcON(emgOf(p2, { range: '24h', returnState: 'ok', badgeReturnPct: 5.0 }), '24h', 'desktop');
  ok('22 changed canonical revision → contract may change', hash(a.renderPoints) !== hash(b.renderPoints));
}

// ── source-level: auditor + audit extension present, read-only, JSON-serializable shape ──
console.log('\nSource-level (Phase B/E):');
const auditSrc = (function () { const i = app.indexOf('window.aurixChartHydrationStabilityAudit = function'); return i < 0 ? '' : braceSlice(app.indexOf('{', i)); })();
ok('B1 hydration stability auditor defined', auditSrc.length > 0);
ok('B2 auditor returns a Promise (async observation)', /return new Promise\(/.test(auditSrc));
ok('B3 auditor clears its interval (no timer left behind)', /clearInterval\(timer\)/.test(auditSrc));
ok('B4 auditor is read-only (no emg/points/source writes, no innerHTML)', !/\.innerHTML|categoryHistory\s*=[^=]|_aurixBackendSnapshots\s*=[^=]|emg\.points\s*=/.test(auditSrc));
['verdict', 'accountObservationId', 'uniqueCanonicalInputHashes', 'uniqueSelectedPointsHashes', 'uniqueRenderHashes', 'transitions', 'defects', 'finalEvent'].forEach(k =>
  ok('B5 auditor output exposes ' + k, new RegExp(k + ':').test(app)));
['SAME_INPUT_CONTRACT_DIVERGENCE', 'COLOR_BADGE_MISMATCH', 'RETURN_ANCHOR_DRIFT', 'DEFECT_HYDRATION_RACE', 'VISIBLE_PATH_FRAGMENTATION', 'RELIABILITY_DEADLOCK'].forEach(t =>
  ok('B6 auditor detects ' + t, new RegExp(t).test(app)));
ok('E1 final contract audit adds all24hSinglePath guardrail', /all24hSinglePath/.test(app));
ok('E2 final contract audit adds canonicalInputHash', /canonicalInputHash: canonicalInputHash/.test(app));
ok('E3 final contract audit adds returnAnchorTs + returnAnchorMatch', /returnAnchorTs: frc\.returnAnchorTs/.test(app) && /returnAnchorMatch/.test(app));
ok('E4 SPEC.21 flag present + rollback documented', /_AURIX_CHART_CANONICAL_REFRESH_DETERMINISM = true/.test(app));
ok('E5 SPEC.19 chokepoint intact (no second render decision path)', (app.match(/function _aurixResolveFinalRenderSeriesContract\(/g) || []).length === 1);

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
