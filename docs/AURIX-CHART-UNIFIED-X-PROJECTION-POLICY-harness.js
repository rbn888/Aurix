'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-UNIFIED-X-PROJECTION-POLICY-harness — SPEC DSH.CHART.UNIFIED_X_PROJECTION_POLICY.32
// ════════════════════════════════════════════════════════════════════════════
// SPEC.31 proved the renderer / path builder / curve / gap / interpolation are already unified and the sole
// remaining horizontal-visual divergence owner is the range-scaled _AURIX_X_FILL_BETA. SPEC.32 unifies it:
// when _AURIX_CHART_UNIFIED_X_PROJECTION_POLICY is ON, every range resolves to one _AURIX_UNIFIED_X_FILL_BETA
// (0.48) inside computeAurixAdaptiveXScale — the ONLY behavioural change. This harness proves:
//   • beta resolution: ON ⇒ 0.48 for every range; OFF ⇒ exact legacy {24h .48, 7d .48, 30d .50, 1y .65, all .70}.
//   • beta touches ONLY x-pixel projection: 24H/7D x-coords byte-identical ON vs OFF; 30D/1Y/ALL differ only in x.
//   • point selection is beta-free: rendered point count + structural-break (path) count come from
//     downsampleAurixAdaptive + _aurixStructuralBreaks (no x-scale input) ⇒ identical ON vs OFF.
//   • the FRC contract is upstream of the renderer ⇒ 24H/7D full contract + all timestamp/value hashes identical.
//   • SPEC.31 audit additively reports projectionPolicy / resolved|legacy|unified beta + the new summary flags.
// The mini-render below uses the SAME production functions in the SAME order as
// renderValidatedPortfolioChartWithInstitutionalRenderer for the beta-relevant slice (the full renderer pulls
// FX/storage deps that don't run headless), so counts/paths/x are the real ones.
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
const RANGES = ['24h', '7d', '30d', '1y', 'all'];
const LEGACY = { '24h': 0.48, '7d': 0.48, '30d': 0.50, '1y': 0.65, 'all': 0.70 };
const UNIFIED = 0.48;
// centralised, reported harness tolerance (SPEC.32 — do not widen to hide a regression)
const TOL = { compressionRegressionRel: 0.05, catastrophicSpacingCV: 3.0 };

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
  '_AURIX_DENSITY_THRESHOLDS', '_AURIX_VISUAL_LANGUAGE_THRESHOLDS', '_AURIX_RC_PAD_FRAC', '_AURIX_X_FILL_BETA',
  '_WSC_VIEW_W', '_WSC_VIEW_H', '_AURIX_VP_DENSITY', '_AURIX_VP_DENSITY_MIN', '_AURIX_VP_DENSITY_MAX',
];
const FNS = [
  '_aurixEmergencyHash', '_aurixRealGapFloorMs', '_aurixConfirmedBridgeGaps', '_aurixVerticalJumps',
  '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks', '_aurixSplitAtGaps', '_aurixBuildContinuityValidatedSeries',
  '_aurixStructuralBreaks', '_aurixResolveChartReturnContract', '_aurixShortHistoryDisplay', '_aurixVisualTrustGate',
  '_aurixStableDisplayAnchor', '_aurixCanonicalReturnAnchorIndex', '_aurixResolveReliabilityDeadlock',
  '_aurixResolveFinalRenderSeriesContract', '_aurixComputeChartDensityMetrics', '_aurixVpTargetPointCount',
  '_aurixSegmentSpacingStats', '_aurixAuditUnifiedVisualLanguageCore', '_aurixSignificantLocalExtrema',
  'downsampleAurixLTTB', 'downsampleAurixAdaptive', 'computeAurixAdaptiveXScale',
];
function mkCtx(flagOn) {
  const ctx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date, Set, Map, RegExp, String, Object };
  // flag + unified beta are MUTABLE context globals (so we can flip ON/OFF) — NOT loaded as const decls
  ctx._AURIX_UNIFIED_X_FILL_BETA = UNIFIED;
  ctx._AURIX_CHART_UNIFIED_X_PROJECTION_POLICY = !!flagOn;
  vm.createContext(ctx);
  CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (e) {} });
  FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (e) { console.log('  ! could not load ' + f + ': ' + e.message); } });
  return ctx;
}
const CTX_ON = mkCtx(true), CTX_OFF = mkCtx(false);
const G = (ctx, n) => vm.runInContext(n, ctx);
const W = G(CTX_ON, '_WSC_VIEW_W'), H = G(CTX_ON, '_WSC_VIEW_H');
const BOX = { left: W * 0.06, right: W - W * 0.06, top: H * 0.14, bottom: H - H * 0.14 };
const PLOTW = Math.round(BOX.right - BOX.left);

function seg(t0, n, stepMs, v0, dv) { const o = []; for (let i = 0; i < n; i++) o.push({ ts: t0 + i * stepMs, value: +(v0 + i * dv).toFixed(2) }); return o; }
function irregular(t0, n, v0) { const o = []; let t = t0, v = v0; for (let i = 0; i < n; i++) { o.push({ ts: t, value: +v.toFixed(2) }); t += (i % 3 === 0 ? 20 : (i % 3 === 1 ? 90 : 300)) * MIN; v += (i % 2 ? 1.5 : -0.7); } return o; }
function withGap(t0) { return seg(t0, 12, 30 * MIN, 1000, 0.5).concat(seg(t0 + 20 * DAY, 12, 30 * MIN, 1010, 0.5)); }

// FIXTURES
const FX = {
  '24h': seg(T0, 48, 30 * MIN, 1000, 0.4),                 // smooth 24H
  '7d': seg(T0, 14, 3 * HOUR, 1000, 0.3),                  // dense short-history 7D
  '30d': seg(T0, 14, 3 * HOUR, 1000, 0.3),                 // same short history shown in 30D
  '1y': seg(T0, 14, 3 * HOUR, 1000, 0.3),                  // …and 1Y
  'all': seg(T0, 14, 3 * HOUR, 1000, 0.3),                 // …and ALL
};
const FX_GAP = withGap(T0);
const FX_IRREG = irregular(T0, 40, 1000);
const FX_MATURE = seg(T0, 800, 6 * HOUR, 1000, 0.05);

// mini-render — SAME production functions + order as the real renderer for the beta-relevant slice.
// visiblePoints = downsampleAurixAdaptive(src,target)  [beta-free]; breaks = _aurixStructuralBreaks(vp) [beta-free];
// xScale = computeAurixAdaptiveXScale(vp, W, box, range) [beta-dependent].
function miniRender(ctx, points, range) {
  const src = points.map(p => ({ time: p.ts, value: p.value }));
  const target = G(ctx, '_aurixVpTargetPointCount')(range, W);
  const vp = G(ctx, 'downsampleAurixAdaptive')(src, target);
  const sb = G(ctx, '_aurixStructuralBreaks')(vp, range);
  const breaks = (sb && Array.isArray(sb.breaks)) ? sb.breaks : [];
  const xScale = G(ctx, 'computeAurixAdaptiveXScale')(vp, W, BOX, range);
  const visiblePixels = vp.map(p => ({ x: +xScale.x(p.time).toFixed(4), y: 120 }));
  return { visiblePoints: vp, visiblePixels: visiblePixels, xScale: xScale,
    renderedPointCount: vp.length, renderPathCount: breaks.length + 1, structuralBreakCount: breaks.length };
}
const betaOf = (ctx, range, pts) => G(ctx, 'computeAurixAdaptiveXScale')((pts || FX[range]).map(p => ({ time: p.ts, value: p.value })), W, BOX, range).beta;
const frc = (ctx, emg, r, s) => G(ctx, '_aurixResolveFinalRenderSeriesContract')(emg, r, s || 'desktop');
const hash = (ctx, pts) => G(ctx, '_aurixEmergencyHash')(pts);
const tsHash = (ctx, pts) => hash(ctx, pts.map(p => ({ ts: p.ts, value: 0 })));
const valHash = (ctx, pts) => hash(ctx, pts.map(p => ({ ts: 0, value: p.value })));

function mature24h(pct) {
  const pts = seg(T0, 48, 30 * MIN, 1000, pct / 100 * 1000 / 47);
  const first = pts[0], last = pts[pts.length - 1];
  return { range: '24h', state: 'ready', returnState: 'ok', points: pts, finalPointCount: 48, pointCount: 48,
    firstTs: first.ts, lastTs: last.ts, baselineTs: first.ts, baselineValue: first.value, currentTs: last.ts, currentValue: last.value,
    coverageRatio: 0.9997, historyTooShortForRange: false, displayedRangeState: 'full',
    badgeReturnPct: pct, returnPct: pct, color: (pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat'), chartHash: 'h' };
}
function partial(range) {
  const pts = seg(T0, 12, 3 * HOUR, 1000, 0.3), first = pts[0], last = pts[pts.length - 1];
  return { range: range, state: 'ready', returnState: 'insufficient_return_history',
    returnSuppressedReason: 'insufficient_requested_range_history', reason: 'range_collapsed_history_short',
    points: pts, finalPointCount: 12, pointCount: 12, firstTs: first.ts, lastTs: last.ts,
    baselineTs: first.ts, baselineValue: first.value, currentTs: last.ts, currentValue: last.value,
    coverageRatio: 0.05, historyTooShortForRange: true, displayedRangeState: (range === 'all' ? 'all_history' : 'partial_history'),
    initialBuildDetected: false, coverageSuppressed: true, partialReturnTrusted: false,
    badgeReturnPct: null, returnPct: null, color: 'flat', chartHash: 'h' };
}

console.log('\nAURIX-CHART-UNIFIED-X-PROJECTION-POLICY — SPEC.32   (tolerance: ' + JSON.stringify(TOL) + ')');

// ── 1-5) Flag ON resolves 0.48 for every range ──────────────────────────────
RANGES.forEach((r, i) => ok((i + 1) + ' flag ON ⇒ beta 0.48 for ' + r, Math.abs(betaOf(CTX_ON, r) - UNIFIED) < 1e-9, 'beta=' + betaOf(CTX_ON, r)));

// ── 6) Flag OFF restores legacy values exactly ───────────────────────────────
(function () {
  let allLegacy = true; const got = {};
  RANGES.forEach(r => { const b = betaOf(CTX_OFF, r); got[r] = b; if (Math.abs(b - LEGACY[r]) > 1e-9) allLegacy = false; });
  ok('6 flag OFF ⇒ exact legacy beta table', allLegacy, JSON.stringify(got));
})();

// ── 7) 24H full contract byte-identical ON vs OFF ────────────────────────────
(function () {
  const emg = mature24h(3.1);
  const cOn = frc(CTX_ON, emg, '24h'), cOff = frc(CTX_OFF, emg, '24h');
  ok('7 24H FRC contract byte-identical ON vs OFF', JSON.stringify(cOn) === JSON.stringify(cOff));
  ok('7 24H mini-render x-pixels identical (beta already 0.48)', JSON.stringify(miniRender(CTX_ON, FX['24h'], '24h').visiblePixels) === JSON.stringify(miniRender(CTX_OFF, FX['24h'], '24h').visiblePixels));
})();

// ── 8) 7D full contract + x-pixels byte-identical ON vs OFF ──────────────────
(function () {
  const emg = partial('7d');
  ok('8 7D FRC contract byte-identical ON vs OFF', JSON.stringify(frc(CTX_ON, emg, '7d')) === JSON.stringify(frc(CTX_OFF, emg, '7d')));
  ok('8 7D mini-render x-pixels identical (beta already 0.48)', JSON.stringify(miniRender(CTX_ON, FX['7d'], '7d').visiblePixels) === JSON.stringify(miniRender(CTX_OFF, FX['7d'], '7d').visiblePixels));
})();

// ── 9-11) 30D/1Y/ALL input timestamp/value hashes identical ON vs OFF ────────
['30d', '1y', 'all'].forEach((r, i) => {
  const emgOn = frc(CTX_ON, partial(r), r), emgOff = frc(CTX_OFF, partial(r), r);
  const rpOn = emgOn.renderPoints, rpOff = emgOff.renderPoints;
  ok((9 + i) + ' ' + r + ' timestampHash + valueHash identical ON vs OFF',
    tsHash(CTX_ON, rpOn) === tsHash(CTX_OFF, rpOff) && valHash(CTX_ON, rpOn) === valHash(CTX_OFF, rpOff) && hash(CTX_ON, rpOn) === hash(CTX_OFF, rpOff));
});

// ── 12) renderedPointCount unchanged ON vs OFF (point selection is beta-free) ─
(function () {
  let same = true; const rows = {};
  ['30d', '1y', 'all'].forEach(r => { const a = miniRender(CTX_ON, FX[r], r).renderedPointCount, b = miniRender(CTX_OFF, FX[r], r).renderedPointCount; rows[r] = a + '/' + b; if (a !== b) same = false; });
  const g = miniRender(CTX_ON, FX_GAP, '30d'), g2 = miniRender(CTX_OFF, FX_GAP, '30d');
  if (g.renderedPointCount !== g2.renderedPointCount) same = false;
  ok('12 renderedPointCount identical ON vs OFF', same, JSON.stringify(rows));
})();

// ── 13) renderPathCount unchanged ON vs OFF ──────────────────────────────────
(function () {
  const g = miniRender(CTX_ON, FX_GAP, '30d'), g2 = miniRender(CTX_OFF, FX_GAP, '30d');
  ok('13 renderPathCount identical ON vs OFF (with a real gap)', g.renderPathCount === g2.renderPathCount, g.renderPathCount + ' vs ' + g2.renderPathCount);
})();

// ── 14) gaps remain segmented (a real 20-day gap still splits the path) ──────
(function () {
  const g = miniRender(CTX_ON, FX_GAP, '30d');
  ok('14 real gap still segmented (>1 path) ON', g.renderPathCount > 1, 'paths=' + g.renderPathCount + ' breaks=' + g.structuralBreakCount);
})();

// ── 15) syntheticPoints remains 0 (rendered points ⊆ input, no fabrication) ──
(function () {
  const inSet = new Set(FX['1y'].map(p => p.ts + ':' + p.value));
  const vp = miniRender(CTX_ON, FX['1y'], '1y').visiblePoints;
  const allReal = vp.every(p => inSet.has(p.time + ':' + p.value));
  ok('15 no synthetic points (every rendered point is a real source point)', allReal);
})();

// ── 16) no mutation of input arrays/objects ──────────────────────────────────
(function () {
  const pts = seg(T0, 60, HOUR, 1000, 0.2); const before = JSON.stringify(pts);
  miniRender(CTX_ON, pts, '30d'); betaOf(CTX_ON, '30d', pts); frc(CTX_ON, partial('30d'), '30d');
  ok('16 input point array not mutated', JSON.stringify(pts) === before);
})();

// ── 17) desktop/mobile parity (single FRC contract) ──────────────────────────
(function () {
  let parity = true;
  RANGES.forEach(r => {
    const emg = (r === '24h') ? mature24h(2.0) : partial(r);
    const d = frc(CTX_ON, emg, r, 'desktop'), m = frc(CTX_ON, emg, r, 'mobile');
    if (!(hash(CTX_ON, d.renderPoints) === hash(CTX_ON, m.renderPoints) && d.mode === m.mode && d.badgeLabel === m.badgeLabel && d.renderPathCount === m.renderPathCount)) parity = false;
  });
  ok('17 desktop/mobile parity holds ON', parity);
})();

// ── 18) trusted return / badge / colour unchanged ON vs OFF ──────────────────
(function () {
  const up = frc(CTX_ON, mature24h(3.3), '24h'), upOff = frc(CTX_OFF, mature24h(3.3), '24h');
  ok('18 24H trusted %/colour identical ON vs OFF', up.badgeEligible === true && up.colorClass === 'up' && up.badgeLabel === upOff.badgeLabel && up.badgeReturnPct === upOff.badgeReturnPct);
})();

// ── 19) partial-history label unchanged ON vs OFF ────────────────────────────
(function () {
  const a = frc(CTX_ON, partial('30d'), '30d'), b = frc(CTX_OFF, partial('30d'), '30d');
  ok('19 30D partial-history presentation unchanged', a.historyPresentationState === b.historyPresentationState && a.badgeLabel === b.badgeLabel);
})();

// ── 20) ALL available-history label unchanged ON vs OFF ──────────────────────
(function () {
  const a = frc(CTX_ON, partial('all'), 'all'), b = frc(CTX_OFF, partial('all'), 'all');
  ok('20 ALL history presentation unchanged', a.historyPresentationState === b.historyPresentationState && a.badgeLabel === b.badgeLabel);
})();

// ── 21) deterministic same-input output ──────────────────────────────────────
(function () {
  ok('21 deterministic beta + geometry', betaOf(CTX_ON, '1y') === betaOf(CTX_ON, '1y') && JSON.stringify(miniRender(CTX_ON, FX['1y'], '1y').visiblePixels) === JSON.stringify(miniRender(CTX_ON, FX['1y'], '1y').visiblePixels));
})();

// ── 22) SPEC.31 audit reports ONE unified beta (flag ON) ─────────────────────
(function () {
  // audit core with real FRC + real beta resolution (mini-render provides xScale.beta from the real resolver)
  const deps = {
    buildChart: r => ({ range: r, state: 'ready', points: FX[r] || FX['30d'] }),
    resolveContract: (chart, r, s) => frc(CTX_ON, chart, r, s),
    render: (rp, opts) => { const mr = miniRender(CTX_ON, rp, opts.range); return { ok: true, visiblePixels: mr.visiblePixels, visiblePoints: mr.visiblePoints, xScale: mr.xScale, structuralBreakCount: mr.structuralBreakCount }; },
    projectionBeta: r => LEGACY[r], densityBand: r => G(CTX_ON, '_AURIX_VP_DENSITY')[r], targetPointCount: (r, w) => G(CTX_ON, '_aurixVpTargetPointCount')(r, w),
    projectionPolicyFlag: true, unifiedBeta: UNIFIED,
  };
  const res = G(CTX_ON, '_aurixAuditUnifiedVisualLanguageCore')({ ranges: RANGES }, deps);
  const betas = RANGES.map(r => res.perRange[r].resolvedProjectionBeta);
  ok('22 audit: every resolvedProjectionBeta = 0.48', betas.every(b => Math.abs(b - UNIFIED) < 1e-9), JSON.stringify(betas));
  ok('22 audit: allRangesSameProjectionBeta true', res.summary.allRangesSameProjectionBeta === true);
  ok('22 audit: projectionPolicyConsistent true', res.summary.projectionPolicyConsistent === true);
  ok('22 audit: projectionPolicy UNIFIED_X_PROJECTION', RANGES.every(r => res.perRange[r].projectionPolicy === 'UNIFIED_X_PROJECTION'));
  ok('22 audit: legacy beta still reported per range', res.perRange['1y'].legacyProjectionBeta === 0.65 && res.perRange['all'].legacyProjectionBeta === 0.70);
  ok('22 audit: projection divergence owner removed', !res.divergenceOwners.some(o => o.dimension === 'X_PROJECTION'));
  ok('22 audit: new summary maps present', res.summary.projectionBetaByRange && res.summary.spacingUniformityScoreByRange && res.summary.compressionRatioByRange && typeof res.summary.visualLanguageVerdict === 'string');
})();

// ── 23) Flag OFF audit reports legacy divergence ─────────────────────────────
(function () {
  const deps = {
    buildChart: r => ({ range: r, state: 'ready', points: FX[r] || FX['30d'] }),
    resolveContract: (chart, r, s) => frc(CTX_OFF, chart, r, s),
    render: (rp, opts) => { const mr = miniRender(CTX_OFF, rp, opts.range); return { ok: true, visiblePixels: mr.visiblePixels, visiblePoints: mr.visiblePoints, xScale: mr.xScale, structuralBreakCount: mr.structuralBreakCount }; },
    projectionBeta: r => LEGACY[r], densityBand: r => G(CTX_OFF, '_AURIX_VP_DENSITY')[r], targetPointCount: (r, w) => G(CTX_OFF, '_aurixVpTargetPointCount')(r, w),
    projectionPolicyFlag: false, unifiedBeta: UNIFIED,
  };
  const res = G(CTX_OFF, '_aurixAuditUnifiedVisualLanguageCore')({ ranges: RANGES }, deps);
  ok('23 flag OFF: allRangesSameProjectionBeta false', res.summary.allRangesSameProjectionBeta === false);
  ok('23 flag OFF: projectionPolicyConsistent false', res.summary.projectionPolicyConsistent === false);
  ok('23 flag OFF: X_PROJECTION divergence owner present', res.divergenceOwners.some(o => o.dimension === 'X_PROJECTION' && o.owner === '_AURIX_X_FILL_BETA'));
  ok('23 flag OFF: projectionPolicy LEGACY_RANGE_SCALED_PROJECTION', RANGES.every(r => res.perRange[r].projectionPolicy === 'LEGACY_RANGE_SCALED_PROJECTION'));
})();

// ── 24) no second renderer / path / projection owner introduced ──────────────
(function () {
  ok('24 single production renderer', (app.match(/^function renderValidatedPortfolioChartWithInstitutionalRenderer\(/gm) || []).length === 1);
  ok('24 single path builder', (app.match(/^function _aurixMonotonePath\(/gm) || []).length === 1);
  ok('24 single X projection engine', (app.match(/^function computeAurixAdaptiveXScale\(/gm) || []).length === 1);
  ok('24 SPEC.19 chokepoint single', (app.match(/^function _aurixResolveFinalRenderSeriesContract\(/gm) || []).length === 1);
  ok('24 unified beta constant declared once', (app.match(/const _AURIX_UNIFIED_X_FILL_BETA\s*=/g) || []).length === 1);
  ok('24 flag declared once + legacy table preserved', (app.match(/const _AURIX_CHART_UNIFIED_X_PROJECTION_POLICY\s*=/g) || []).length === 1 && /_AURIX_X_FILL_BETA\s*=\s*\{[^}]*'1y'\s*:\s*0\.65/.test(app));
})();

// ── 25) Golden checkpoint constant/marker + no density change ────────────────
(function () {
  ok('25 _AURIX_VP_DENSITY unchanged (density NOT touched in SPEC.32)', /_AURIX_VP_DENSITY\s*=\s*\{[\s\S]*?'24h'\s*:\s*\{\s*min:\s*80,\s*max:\s*180[\s\S]*?'all'\s*:\s*\{\s*min:\s*320,\s*max:\s*450/.test(app));
  ok('25 SPEC.32 marker present', app.indexOf('DSH.CHART.UNIFIED_X_PROJECTION_POLICY.32') >= 0);
})();

// ── extra) no catastrophic spacing / compression regression on the mature account ─
(function () {
  const on = miniRender(CTX_ON, FX_MATURE, '1y'), off = miniRender(CTX_OFF, FX_MATURE, '1y');
  const cvOn = G(CTX_ON, '_aurixSegmentSpacingStats')(on.visiblePixels).spacingUniformityScore;
  const cvOff = G(CTX_OFF, '_aurixSegmentSpacingStats')(off.visiblePixels).spacingUniformityScore;
  ok('E1 mature 1Y spacing CV not catastrophic ON (< ' + TOL.catastrophicSpacingCV + ')', cvOn < TOL.catastrophicSpacingCV, 'cvOn=' + cvOn + ' cvOff=' + cvOff);
  const compOn = on.renderedPointCount / PLOTW, compOff = off.renderedPointCount / PLOTW;
  ok('E1 compression not regressed beyond tolerance (rendered count identical)', Math.abs(compOn - compOff) <= TOL.compressionRegressionRel * compOff, 'compOn=' + compOn.toFixed(4) + ' compOff=' + compOff.toFixed(4));
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' SPEC.32 UNIFIED X-PROJECTION POLICY — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
