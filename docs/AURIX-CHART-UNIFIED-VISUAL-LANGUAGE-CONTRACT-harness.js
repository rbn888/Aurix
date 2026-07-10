'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-UNIFIED-VISUAL-LANGUAGE-CONTRACT-harness — SPEC DSH.CHART.UNIFIED_VISUAL_LANGUAGE_CONTRACT.31
// ════════════════════════════════════════════════════════════════════════════
// Proves the SPEC.31 STRICTLY READ-ONLY visual-language audit: whether every range (24H/7D/30D/1Y/ALL) is
// rendered under ONE visual contract, or whether per-range render policies give each range a different visual
// personality. The audit reuses only existing owners (SPEC.19 contract, production renderer, adaptive X scale,
// reduction policy, SPEC.30 density metric) — no second renderer/path/calculator/projection engine. This
// harness drives the core headless (injected deps) to prove each verdict path + the pure segment/spacing/
// compression maths, and proves the audit never mutates inputs, is deterministic, keeps syntheticPoints 0 and
// leaves the 24H contract render hash byte-identical.
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
  '_AURIX_ORPHAN_MAX_PTS', '_AURIX_ALL_MIN_TRUST_POINTS', '_AURIX_CHART_CONTINUITY_UNIFICATION',
  '_AURIX_CHART_RETURN_CONTRACT_UNIFICATION', '_AURIX_CHART_SHORT_HISTORY_DISPLAY', '_AURIX_CHART_SHORT_HISTORY_MIN_DAYS',
  '_AURIX_CHART_VISUAL_TRUST_GATE', '_AURIX_VTG_MIN_MAIN_PTS', '_AURIX_VTG_MIN_MAIN_SPAN_MS',
  '_AURIX_CHART_BOOTSTRAP_SUPPRESSION', '_AURIX_STABLE_BAND_LO', '_AURIX_STABLE_MIN_PTS',
  '_AURIX_STABLE_MIN_SPAN_MS', '_AURIX_STABLE_CONSTRUCTION_JUMP', '_AURIX_CHART_FINAL_RENDER_SERIES_CONTRACT',
  '_AURIX_CHART_CANONICAL_REFRESH_DETERMINISM', '_AURIX_CHART_RELIABILITY_DEADLOCK_RESOLUTION', '_AURIX_PARTIAL_RETURN_MIN_PCT',
  '_AURIX_DENSITY_THRESHOLDS', '_AURIX_VISUAL_LANGUAGE_THRESHOLDS', '_AURIX_RC_PAD_FRAC', '_AURIX_X_FILL_BETA',
  '_WSC_VIEW_W', '_WSC_VIEW_H', '_AURIX_VP_DENSITY',
];
const FNS = [
  '_aurixEmergencyHash', '_aurixRealGapFloorMs', '_aurixConfirmedBridgeGaps', '_aurixVerticalJumps',
  '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks', '_aurixSplitAtGaps', '_aurixBuildContinuityValidatedSeries',
  '_aurixStructuralBreaks', '_aurixResolveChartReturnContract', '_aurixShortHistoryDisplay', '_aurixVisualTrustGate',
  '_aurixStableDisplayAnchor', '_aurixCanonicalReturnAnchorIndex', '_aurixResolveReliabilityDeadlock',
  '_aurixResolveFinalRenderSeriesContract', '_aurixComputeChartDensityMetrics', '_aurixVpTargetPointCount',
  '_aurixSegmentSpacingStats', '_aurixAuditUnifiedVisualLanguageCore',
];
function mkCtx() {
  const ctx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date, Set, Map, RegExp, String, Object };
  vm.createContext(ctx);
  CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (e) {} });
  FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (e) { console.log('  ! could not load ' + f + ': ' + e.message); } });
  return ctx;
}
const CTX = mkCtx();
const G = n => vm.runInContext(n, CTX);
const frc = (emg, r, s) => G('_aurixResolveFinalRenderSeriesContract')(emg, r, s || 'desktop');
const segStats = px => G('_aurixSegmentSpacingStats')(px);
const core = (opts, deps) => G('_aurixAuditUnifiedVisualLanguageCore')(opts, deps);
const hash = pts => G('_aurixEmergencyHash')(pts);
const W = G('_WSC_VIEW_W'), H = G('_WSC_VIEW_H');
const BOX = { left: W * 0.06, right: W - W * 0.06, top: H * 0.14, bottom: H - H * 0.14 };
const PLOTW = Math.round(BOX.right - BOX.left);

function seg(t0, n, stepMs, v0, dv) { const o = []; for (let i = 0; i < n; i++) o.push({ ts: t0 + i * stepMs, value: +(v0 + i * dv).toFixed(2) }); return o; }
function mature24h(pct) {
  const pts = seg(T0, 48, 30 * MIN, 1000, pct / 100 * 1000 / 47);
  const first = pts[0], last = pts[pts.length - 1];
  return { range: '24h', state: 'ready', returnState: 'ok', points: pts, finalPointCount: 48, pointCount: 48,
    firstTs: first.ts, lastTs: last.ts, baselineTs: first.ts, baselineValue: first.value, currentTs: last.ts, currentValue: last.value,
    coverageRatio: 0.9997, historyTooShortForRange: false, displayedRangeState: 'full',
    badgeReturnPct: pct, returnPct: pct, color: (pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat'), chartHash: 'h' };
}

// evenly-spaced pixels across the plot area (institutional look, spacing CV ≈ 0)
function evenPixels(n) { const px = []; for (let i = 0; i < n; i++) px.push({ x: BOX.left + (n <= 1 ? 0 : (i / (n - 1)) * PLOTW), y: 120 }); return px; }
// compressed pixels: most points crammed into the first 20px, a couple far right (spacing CV high)
function compressedPixels(n) { const px = []; for (let i = 0; i < n - 2; i++) px.push({ x: BOX.left + i * (20 / Math.max(1, n - 3)), y: 120 }); px.push({ x: BOX.left + PLOTW * 0.6, y: 120 }); px.push({ x: BOX.left + PLOTW, y: 120 }); return px; }

// headless deps: fixed owners; per-range beta / band / rendered-pixel shape controllable
function mkDeps(cfg) {
  cfg = cfg || {};
  const betas = cfg.betas, bands = cfg.bands, ptsN = cfg.ptsN || {}, pixels = cfg.pixels;
  const chartOf = r => cfg.chartByRange ? cfg.chartByRange[r] : { range: r, state: 'ready', points: seg(T0, ptsN[r] || 60, HOUR, 1000, 0.2) };
  return {
    buildChart: r => chartOf(r),
    resolveContract: (chart, r, s) => (cfg.frcByRange && cfg.frcByRange[r]) || { renderPoints: chart.points, renderPathCount: 1, diagnostics: { syntheticPoints: 0 }, badgeEligible: false, colorClass: 'flat' },
    render: (rp, opts) => {
      const r = opts.range;
      const px = pixels ? pixels(r, rp) : evenPixels(rp.length);
      return { ok: true, visiblePixels: px, visiblePoints: rp.map(p => ({ time: p.ts, value: p.value })),
        xScale: { xMin: rp[0].ts, xMax: rp[rp.length - 1].ts, mode: 'fill-blend', beta: betas ? betas[r] : 0.5 },
        structuralBreakCount: 0 };
    },
    projectionBeta: r => betas ? betas[r] : 0.5,
    densityBand: r => bands ? bands[r] : { min: 100, max: 200 },
    targetPointCount: (r, w) => (bands && bands[r]) ? bands[r].max : 200,
  };
}
const RANGES = ['24h', '7d', '30d', '1y', 'all'];
const sameBeta = {}; RANGES.forEach(r => sameBeta[r] = 0.5);
const diffBeta = { '24h': 0.48, '7d': 0.48, '30d': 0.50, '1y': 0.65, 'all': 0.70 };
const sameBand = {}; RANGES.forEach(r => sameBand[r] = { min: 100, max: 200 });
const diffBand = { '24h': { min: 80, max: 180 }, '7d': { min: 120, max: 240 }, '30d': { min: 140, max: 300 }, '1y': { min: 280, max: 400 }, 'all': { min: 320, max: 450 } };

console.log('\nAURIX-CHART-UNIFIED-VISUAL-LANGUAGE-CONTRACT — SPEC.31');

// ── 1) pure segment/spacing stats: evenly spaced ⇒ CV ≈ 0 (institutional) ────
(function () {
  const s = segStats(evenPixels(50));
  ok('1 evenly-spaced spacingUniformityScore ≈ 0', s.spacingUniformityScore != null && s.spacingUniformityScore < 0.01, 'cv=' + s.spacingUniformityScore);
  ok('1 segmentCount = n-1', s.segmentCount === 49);
})();

// ── 2) pure spacing stats: compressed ⇒ high CV ──────────────────────────────
(function () {
  const s = segStats(compressedPixels(40));
  ok('2 compressed spacingUniformityScore high', s.spacingUniformityScore != null && s.spacingUniformityScore > 0.6, 'cv=' + s.spacingUniformityScore);
})();

// ── 3) compressionRatio = renderedPoints / availablePixelColumns ─────────────
(function () {
  const res = core({ ranges: ['24h'] }, mkDeps({ betas: sameBeta, bands: sameBand, ptsN: { '24h': 100 } }));
  const c = res.perRange['24h'];
  ok('3 compressionRatio = rendered / plotWidth', Math.abs(c.compressionRatio - (c.renderedPointCount / PLOTW)) < 5e-5, 'cr=' + c.compressionRatio + ' rp=' + c.renderedPointCount + ' plot=' + PLOTW);
})();

// ── 4) UNIFIED — same owners, same beta, same band, even spacing ─────────────
(function () {
  const res = core({}, mkDeps({ betas: sameBeta, bands: sameBand, ptsN: { '24h': 60, '7d': 60, '30d': 60, '1y': 60, 'all': 60 } }));
  const s = res.summary;
  ok('4 verdict UNIFIED_VISUAL_LANGUAGE', res.verdict === 'UNIFIED_VISUAL_LANGUAGE', res.verdict);
  ok('4 visualLanguageConsistent true', s.visualLanguageConsistent === true);
  ok('4 all consistency flags true', s.renderPipelineConsistent && s.pathPolicyConsistent && s.projectionConsistent && s.densityPolicyConsistent && s.spacingPolicyConsistent);
  ok('4 recommend density optimisation only', res.recommendedSpec32 && res.recommendedSpec32.title === 'DENSITY_OPTIMISATION_ONLY');
})();

// ── 5) PROJECTION-only divergence ⇒ VISUAL_PIPELINE_DIVERGENCE ───────────────
(function () {
  const res = core({}, mkDeps({ betas: diffBeta, bands: sameBand }));
  ok('5 projectionConsistent false', res.summary.projectionConsistent === false);
  ok('5 densityPolicyConsistent true', res.summary.densityPolicyConsistent === true);
  ok('5 verdict VISUAL_PIPELINE_DIVERGENCE', res.verdict === 'VISUAL_PIPELINE_DIVERGENCE', res.verdict);
  ok('5 owner = _AURIX_X_FILL_BETA', res.divergenceOwners.some(o => o.owner === '_AURIX_X_FILL_BETA'));
  ok('5 recommend UNIFY_X_DOMAIN_PROJECTION', res.recommendedSpec32.title === 'UNIFY_X_DOMAIN_PROJECTION');
})();

// ── 6) DENSITY-band-only divergence ⇒ DENSITY_ONLY_DIFFERENCE ────────────────
(function () {
  const res = core({}, mkDeps({ betas: sameBeta, bands: diffBand }));
  ok('6 densityPolicyConsistent false', res.summary.densityPolicyConsistent === false);
  ok('6 projectionConsistent true', res.summary.projectionConsistent === true);
  ok('6 verdict DENSITY_ONLY_DIFFERENCE', res.verdict === 'DENSITY_ONLY_DIFFERENCE', res.verdict);
  ok('6 recommend UNIFY_REDUCTION_DENSITY_POLICY', res.recommendedSpec32.title === 'UNIFY_REDUCTION_DENSITY_POLICY');
})();

// ── 7) MIXED — projection AND density band both diverge (the real-account shape) ─
(function () {
  const res = core({}, mkDeps({ betas: diffBeta, bands: diffBand }));
  ok('7 verdict MIXED_DIFFERENCE', res.verdict === 'MIXED_DIFFERENCE', res.verdict);
  ok('7 ≥2 divergence owners', res.divergenceOwners.filter(o => o.dimension === 'X_PROJECTION' || o.dimension === 'REDUCTION_DENSITY').length >= 2);
  ok('7 renderer + path still consistent', res.summary.renderPipelineConsistent === true && res.summary.pathPolicyConsistent === true);
})();

// ── 8) DATA-ONLY difference — unified policy, but compression differs by data ─
(function () {
  const pix = (r, rp) => evenPixels(rp.length);
  const res = core({}, mkDeps({ betas: sameBeta, bands: sameBand, pixels: pix, ptsN: { '24h': 40, '7d': 60, '30d': 100, '1y': 400, 'all': 800 } }));
  ok('8 all hard policies consistent', res.summary.projectionConsistent && res.summary.densityPolicyConsistent && res.summary.renderPipelineConsistent && res.summary.pathPolicyConsistent);
  ok('8 verdict DATA_ONLY_DIFFERENCE', res.verdict === 'DATA_ONLY_DIFFERENCE', res.verdict + ' compSpread=' + res.summary.compressionSpread);
})();

// ── 9) verdict is always one of the allowed enum ─────────────────────────────
(function () {
  const ALLOWED = ['UNIFIED_VISUAL_LANGUAGE', 'DATA_ONLY_DIFFERENCE', 'DENSITY_ONLY_DIFFERENCE', 'VISUAL_PIPELINE_DIVERGENCE', 'PATH_POLICY_DIVERGENCE', 'MIXED_DIFFERENCE'];
  const r1 = core({}, mkDeps({ betas: diffBeta, bands: diffBand }));
  const r2 = core({}, mkDeps({ betas: sameBeta, bands: sameBand }));
  ok('9 verdict enum valid', ALLOWED.indexOf(r1.verdict) >= 0 && ALLOWED.indexOf(r2.verdict) >= 0);
})();

// ── 10) six summary consistency flags present ────────────────────────────────
(function () {
  const s = core({}, mkDeps({ betas: sameBeta, bands: sameBand })).summary;
  const keys = ['visualLanguageConsistent', 'renderPipelineConsistent', 'pathPolicyConsistent', 'densityPolicyConsistent', 'spacingPolicyConsistent', 'projectionConsistent'];
  ok('10 all six summary flags present + boolean', keys.every(k => typeof s[k] === 'boolean'));
})();

// ── 11) every range exposes the full INPUT/DOMAIN/PATH/DENSITY/VISUAL/COMPRESSION/SPACING set ─
(function () {
  const res = core({}, mkDeps({ betas: sameBeta, bands: sameBand }));
  const need = ['rawPointCount', 'usablePointCount', 'renderedPointCount', 'xMin', 'xMax', 'xProjection', 'pixelWidth',
    'rendererOwner', 'pathBuilderOwner', 'curveMode', 'gapMode', 'interpolationMode', 'tensionMode',
    'pointsPerPixel', 'medianPointsPerColumn', 'maxPointsPerColumn', 'averageSegmentLength', 'medianSegmentLength',
    'shortestSegment', 'longestSegment', 'compressionRatio', 'spacingUniformityScore'];
  let allOk = true;
  RANGES.forEach(r => { const c = res.perRange[r]; need.forEach(k => { if (!(k in c)) { allOk = false; console.log('    missing ' + k + ' in ' + r); } }); });
  ok('11 full metric set exposed per range', allOk);
  ok('11 renderer owner is the single production renderer', RANGES.every(r => res.perRange[r].rendererOwner === 'renderValidatedPortfolioChartWithInstitutionalRenderer'));
})();

// ── 12) syntheticPoints always 0 ─────────────────────────────────────────────
(function () {
  const res = core({}, mkDeps({ betas: diffBeta, bands: diffBand }));
  ok('12 totalSyntheticPoints 0', res.summary.totalSyntheticPoints === 0 && RANGES.every(r => res.perRange[r].syntheticPoints === 0));
})();

// ── 13) inputs not mutated ───────────────────────────────────────────────────
(function () {
  const chartByRange = {}; RANGES.forEach(r => chartByRange[r] = { range: r, state: 'ready', points: seg(T0, 60, HOUR, 1000, 0.2) });
  const before = JSON.stringify(chartByRange);
  core({}, mkDeps({ betas: diffBeta, bands: diffBand, chartByRange: chartByRange }));
  ok('13 input charts/points not mutated', JSON.stringify(chartByRange) === before);
})();

// ── 14) deterministic output for identical input ─────────────────────────────
(function () {
  const strip = o => { const c = JSON.parse(JSON.stringify(o)); delete c.startedAtIso; delete c.endedAtIso; return c; };
  const d = () => mkDeps({ betas: diffBeta, bands: diffBand });
  ok('14 deterministic', JSON.stringify(strip(core({}, d()))) === JSON.stringify(strip(core({}, d()))));
})();

// ── 15) 24H contract render hash byte-identical (audit changes no hashes) ─────
(function () {
  const emg = mature24h(3.1);
  const before = frc(emg, '24h', 'desktop');
  const beforeHash = hash(before.renderPoints);
  const emgSnapshot = JSON.stringify(emg);
  // run the audit with the REAL FRC as the resolver + a stub renderer
  core({ ranges: ['24h'] }, {
    buildChart: () => emg,
    resolveContract: (c, r, s) => frc(c, r, s),
    render: (rp) => ({ ok: true, visiblePixels: evenPixels(rp.length), visiblePoints: rp.map(p => ({ time: p.ts, value: p.value })), xScale: { xMin: rp[0].ts, xMax: rp[rp.length - 1].ts, mode: 'fill-blend', beta: 0.48 }, structuralBreakCount: 0 }),
  });
  const after = frc(emg, '24h', 'desktop');
  ok('15 24H FRC renderHash unchanged after audit', hash(after.renderPoints) === beforeHash, beforeHash + ' vs ' + hash(after.renderPoints));
  ok('15 24H input emg not mutated', JSON.stringify(emg) === emgSnapshot);
  ok('15 24H badge/eligibility untouched (byte-identical contract)', JSON.stringify(after) === JSON.stringify(before));
})();

// ── 16) behaviorChanged false + readOnly true + thresholds reported ──────────
(function () {
  const res = core({}, mkDeps({ betas: sameBeta, bands: sameBand }));
  ok('16 behaviorChanged false, readOnly true', res.behaviorChanged === false && res.readOnly === true);
  ok('16 thresholds reported', res.thresholds && Number.isFinite(res.thresholds.spacingConsistencyTol));
})();

// ── 17) real app owners present (single-owner architecture) ──────────────────
(function () {
  ok('17 _AURIX_X_FILL_BETA is range-scaled (divergence owner exists)', /_AURIX_X_FILL_BETA\s*=\s*\{[^}]*'1y'\s*:\s*0\.65/.test(app));
  ok('17 _AURIX_VP_DENSITY is range-scaled (reduction owner exists)', /_AURIX_VP_DENSITY\s*=\s*\{[\s\S]*?'all'\s*:\s*\{\s*min:\s*320/.test(app));
  ok('17 single production renderer referenced', app.indexOf('function renderValidatedPortfolioChartWithInstitutionalRenderer(') >= 0);
  ok('17 SPEC.31 marker present', app.indexOf('DSH.CHART.UNIFIED_VISUAL_LANGUAGE_CONTRACT.31') >= 0);
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' SPEC.31 UNIFIED VISUAL LANGUAGE AUDIT — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
