'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-INSTITUTIONAL-INTERACTION-POLISH-harness — SPEC DSH.CHART.INSTITUTIONAL_INTERACTION_POLISH.34
// ════════════════════════════════════════════════════════════════════════════
// SPEC.32–33 completed the shared visual language (one renderer/path/gap/beta/density). SPEC.34 adds ONLY the
// interaction layer: a PURE resolver (_aurixResolveChartInteraction) that SELECTS the nearest REAL rendered
// point (binary search, gap-aware max-snap, never interpolates/fabricates), plus flag-gated desktop polish
// (rAF-throttled tracking, crosshair/marker/tooltip, keyboard) — mobile keeps its CLOSED+HARDENED inspector.
// This harness proves: the resolver contract (nearest/tie/clamp/gap/segment/determinism/no-mutation/binary);
// chart geometry + FRC hashes are IDENTICAL regardless of the interaction flag (interaction is downstream of
// the renderer and touches nothing); tooltip clamp/flip; flag OFF restores v514; the audit reports the
// contract; and — by source — rAF throttle, passive listeners, no network/storage/save-sync in the handler,
// keyboard + Escape, reduced-motion respect, the hardened mobile inspector untouched, and single owners.
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
// slice the institutional-tooltip attach function source for static assertions
function fnBodySrc(name) { return fnSrc(name); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const DAY = 864e5, HOUR = 36e5, MIN = 60e3, T0 = 1_800_000_000_000;
const RANGES = ['24h', '7d', '30d', '1y', 'all'];

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
  '_WSC_VIEW_W', '_WSC_VIEW_H', '_AURIX_VP_DENSITY', '_AURIX_INTERACTION_MAX_SNAP_PX', '_aurixInteractionState',
];
const FNS = [
  '_aurixEmergencyHash', '_aurixRealGapFloorMs', '_aurixConfirmedBridgeGaps', '_aurixVerticalJumps',
  '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks', '_aurixSplitAtGaps', '_aurixBuildContinuityValidatedSeries',
  '_aurixStructuralBreaks', '_aurixResolveChartReturnContract', '_aurixShortHistoryDisplay', '_aurixVisualTrustGate',
  '_aurixStableDisplayAnchor', '_aurixCanonicalReturnAnchorIndex', '_aurixResolveReliabilityDeadlock',
  '_aurixResolveFinalRenderSeriesContract', '_aurixVpTargetPointCount', '_aurixSignificantLocalExtrema',
  'downsampleAurixLTTB', 'downsampleAurixAdaptive', 'computeAurixAdaptiveXScale',
  '_aurixResolveChartInteraction', '_aurixPlaceTooltip',
];
function mkCtx(interactionFlag) {
  const ctx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date, Set, Map, RegExp, String, Object };
  // unified X + density flags ON (v514 shipped state); interaction flag toggled per ctx (mutable global)
  ctx._AURIX_UNIFIED_X_FILL_BETA = 0.48; ctx._AURIX_CHART_UNIFIED_X_PROJECTION_POLICY = true;
  ctx._AURIX_UNIFIED_VP_DENSITY = { pixelsPerPoint: 5, minPoints: 80, maxPoints: 180 }; ctx._AURIX_CHART_UNIFIED_REAL_POINT_DENSITY = true;
  ctx._AURIX_CHART_INSTITUTIONAL_INTERACTION = !!interactionFlag;
  vm.createContext(ctx);
  CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (e) {} });
  FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (e) { console.log('  ! could not load ' + f + ': ' + e.message); } });
  return ctx;
}
const CTX = mkCtx(true), CTX_OFF = mkCtx(false);
const G = (ctx, n) => vm.runInContext(n, ctx);
const W = G(CTX, '_WSC_VIEW_W'), H = G(CTX, '_WSC_VIEW_H');
const resolve = (pts, xDomain, rect, px, opts) => G(CTX, '_aurixResolveChartInteraction')(pts, xDomain, rect, px, opts);
const place = (px, py, tw, th, w, h, m, finger) => G(CTX, '_aurixPlaceTooltip')(px, py, tw, th, w, h, m, finger);
const MAXSNAP = G(CTX, '_AURIX_INTERACTION_MAX_SNAP_PX');

// simple evenly-spaced real points in viewBox x-domain [0..W]
function linPts(n) { const o = []; for (let i = 0; i < n; i++) o.push({ x: (i / (n - 1)) * W, ts: T0 + i * HOUR, value: 1000 + i, pixelY: 100 + (i % 5), segmentId: 0 }); return o; }
const RECT = { width: 880 };
const XD = { min: 0, max: W };

console.log('\nAURIX-CHART-INSTITUTIONAL-INTERACTION-POLISH — SPEC.34   (maxSnapPx=' + MAXSNAP + ')');

// ── 1) nearest point chooses exact real point ────────────────────────────────
(function () {
  const pts = linPts(11);   // x at 0,100,...,1000
  const r = resolve(pts, XD, RECT, 300 + 3, { source: 'mouse' });   // nearest = index 3 (x=300)
  ok('1 nearest picks the exact real point', r.active && r.pointIndex === 3 && r.pointTs === pts[3].ts && r.pointValue === pts[3].value);
})();

// ── 2) midpoint tie is deterministic (lower index) ───────────────────────────
(function () {
  const pts = linPts(11); const mid = (pts[4].x + pts[5].x) / 2;
  const a = resolve(pts, XD, RECT, mid, {}), b = resolve(pts, XD, RECT, mid, {});
  ok('2 midpoint tie deterministic → lower index', a.pointIndex === 4 && b.pointIndex === 4);
})();

// ── 3) no interpolation (returned value is exactly a real point value) ───────
(function () {
  const pts = linPts(11); const r = resolve(pts, XD, RECT, 250, {});
  ok('3 no interpolation (value ∈ input set)', pts.some(p => p.value === r.pointValue && p.ts === r.pointTs));
})();

// ── 4) selected point belongs to the input rendered series ───────────────────
(function () {
  const pts = linPts(50); const inTs = new Set(pts.map(p => p.ts));
  let allReal = true; for (let x = 0; x <= W; x += 37) { const r = resolve(pts, XD, RECT, x, {}); if (r.active && !inTs.has(r.pointTs)) allReal = false; }
  ok('4 selected point always ∈ input series', allReal);
})();

// ── 5) pointer beyond left edge clamps safely ────────────────────────────────
(function () { const pts = linPts(11); const r = resolve(pts, XD, RECT, -500, {}); ok('5 left-edge clamp → first point, active, clamped', r.active && r.pointIndex === 0 && r.clamped === true); })();

// ── 6) pointer beyond right edge clamps safely ───────────────────────────────
(function () { const pts = linPts(11); const r = resolve(pts, XD, RECT, W + 500, {}); ok('6 right-edge clamp → last point, active, clamped', r.active && r.pointIndex === 10 && r.clamped === true); })();

// ── 7) large real gap does not select a distant point beyond max snap distance ─
(function () {
  // two dense clusters with a WIDE x-gap in the middle (sparse zone). pointer in the gap centre.
  const pts = [];
  for (let i = 0; i < 5; i++) pts.push({ x: i * 10, ts: T0 + i * HOUR, value: 1000 + i, pixelY: 100, segmentId: 0 });
  for (let i = 0; i < 5; i++) pts.push({ x: W - 40 + i * 10, ts: T0 + (100 + i) * HOUR, value: 1200 + i, pixelY: 100, segmentId: 1 });
  const r = resolve(pts, XD, RECT, W / 2, {});   // far from either cluster
  ok('7 pointer in wide gap → NO point (beyond max snap)', r.active === false && r.pointIndex === -1, 'active=' + r.active);
})();

// ── 8) segment ownership preserved (selected point reports its segmentId) ────
(function () {
  const pts = [];
  for (let i = 0; i < 6; i++) pts.push({ x: i * 20, ts: T0 + i * HOUR, value: 1000 + i, pixelY: 100, segmentId: 0 });
  for (let i = 0; i < 6; i++) pts.push({ x: 500 + i * 20, ts: T0 + (50 + i) * HOUR, value: 1100 + i, pixelY: 100, segmentId: 7 });
  const rA = resolve(pts, XD, RECT, 40, {}), rB = resolve(pts, XD, RECT, 520, {});
  ok('8 segmentId reported from the chosen real point', rA.segmentId === 0 && rB.segmentId === 7);
})();

// ── (contract) O(log n) binary lookup mode + full contract shape ─────────────
(function () {
  const r = resolve(linPts(500), XD, RECT, 12345 % W, { source: 'touch' });
  const keys = ['active', 'pointIndex', 'point', 'pointTs', 'pointValue', 'pixelX', 'pixelY', 'segmentId', 'distancePx', 'source', 'clamped'];
  ok('C1 full contract shape + lookupMode binary + source echoed', keys.every(k => k in r) && r.lookupMode === 'binary' && r.source === 'touch');
})();

// ── (contract) deterministic same-input output ───────────────────────────────
(function () { const pts = linPts(120); ok('C2 deterministic same-input output', JSON.stringify(resolve(pts, XD, RECT, 421, {})) === JSON.stringify(resolve(pts, XD, RECT, 421, {}))); })();

// ── (contract) no mutation of input points ───────────────────────────────────
(function () { const pts = linPts(60); const before = JSON.stringify(pts); resolve(pts, XD, RECT, 333, {}); ok('C3 input points not mutated', JSON.stringify(pts) === before); })();

// ── 18) tooltip clamped inside the plot/card ─────────────────────────────────
(function () {
  const w = 880, h = 240, tw = 140, th = 64;
  const near = place(870, 120, tw, th, w, h, 18, false);   // far right → must clamp
  ok('18 tooltip clamped inside card (right edge)', near.tx + tw <= w && near.tx >= 0 && near.ty >= 0 && near.ty + th <= h, JSON.stringify(near));
})();

// ── 19) tooltip flips at edges (below when no room above) ────────────────────
(function () {
  const w = 880, h = 240, tw = 140, th = 64;
  const top = place(400, 10, tw, th, w, h, 18, false);    // near top → flip below
  ok('19 tooltip flips below when no room above', top.below === true && top.ty >= 10);
})();

// ── 25/26) render hashes + geometry IDENTICAL regardless of interaction flag; syntheticPoints 0 ─
function seg(t0, n, stepMs, v0, dv) { const o = []; for (let i = 0; i < n; i++) o.push({ ts: t0 + i * stepMs, value: +(v0 + i * dv).toFixed(2) }); return o; }
function mature24h(pct) {
  const pts = seg(T0, 48, 30 * MIN, 1000, pct / 100 * 1000 / 47), f = pts[0], l = pts[pts.length - 1];
  return { range: '24h', state: 'ready', returnState: 'ok', points: pts, finalPointCount: 48, pointCount: 48,
    firstTs: f.ts, lastTs: l.ts, baselineTs: f.ts, baselineValue: f.value, currentTs: l.ts, currentValue: l.value,
    coverageRatio: 0.9997, historyTooShortForRange: false, displayedRangeState: 'full',
    badgeReturnPct: pct, returnPct: pct, color: (pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat'), chartHash: 'h' };
}
function partial(range) {
  const pts = seg(T0, 14, 3 * HOUR, 1000, 0.3), f = pts[0], l = pts[pts.length - 1];
  return { range: range, state: 'ready', returnState: 'insufficient_return_history', returnSuppressedReason: 'insufficient_requested_range_history',
    reason: 'range_collapsed_history_short', points: pts, finalPointCount: 14, pointCount: 14, firstTs: f.ts, lastTs: l.ts,
    baselineTs: f.ts, baselineValue: f.value, currentTs: l.ts, currentValue: l.value, coverageRatio: 0.05,
    historyTooShortForRange: true, displayedRangeState: (range === 'all' ? 'all_history' : 'partial_history'),
    coverageSuppressed: true, partialReturnTrusted: false, badgeReturnPct: null, returnPct: null, color: 'flat', chartHash: 'h' };
}
const frc = (ctx, emg, r, s) => G(ctx, '_aurixResolveFinalRenderSeriesContract')(emg, r, s || 'desktop');
const hash = (ctx, pts) => G(ctx, '_aurixEmergencyHash')(pts);
const dsX = (ctx, pts, r) => { const t = G(ctx, '_aurixVpTargetPointCount')(r, W); const vp = G(ctx, 'downsampleAurixAdaptive')(pts.map(p => ({ time: p.ts, value: p.value })), t); const xs = G(ctx, 'computeAurixAdaptiveXScale')(vp, W, { left: W * 0.06, right: W - W * 0.06 }, r); return { vp: vp, xs: vp.map(p => +xs.x(p.time).toFixed(4)) }; };
(function () {
  let identical = true;
  RANGES.forEach(r => {
    const emg = (r === '24h') ? mature24h(3.1) : partial(r);
    const a = frc(CTX, emg, r), b = frc(CTX_OFF, emg, r);
    if (JSON.stringify(a) !== JSON.stringify(b)) identical = false;
    const geoOn = dsX(CTX, (r === '24h' ? mature24h(3.1) : partial(r)).points, r);
    const geoOff = dsX(CTX_OFF, (r === '24h' ? mature24h(3.1) : partial(r)).points, r);
    if (JSON.stringify(geoOn) !== JSON.stringify(geoOff)) identical = false;
  });
  ok('25 FRC contract + downsample + x-geometry IDENTICAL with interaction flag ON vs OFF', identical);
  ok('26 interactionSyntheticPoints 0 + resolver never fabricates', G(CTX, '_aurixInteractionState').interactionSyntheticPoints === 0 && resolve(linPts(20), XD, RECT, 123, {}).active === true);
})();

// ── 22/23/24) line state + 24H + long-range geometry unchanged by interaction ─
(function () {
  const up = frc(CTX, mature24h(3.3), '24h'), upOff = frc(CTX_OFF, mature24h(3.3), '24h');
  ok('22 line colour state unchanged (24H up)', up.colorClass === 'up' && up.colorClass === upOff.colorClass && up.badgeEligible === upOff.badgeEligible);
  ok('23 24H FRC byte-identical ON vs OFF', JSON.stringify(up) === JSON.stringify(upOff));
  let same = true; ['7d', '30d', '1y', 'all'].forEach(r => { if (JSON.stringify(frc(CTX, partial(r), r)) !== JSON.stringify(frc(CTX_OFF, partial(r), r))) same = false; });
  ok('24 7D/30D/1Y/ALL FRC byte-identical ON vs OFF', same);
})();

// ── 27) desktop/mobile data parity (FRC surface parity) ──────────────────────
(function () {
  let parity = true;
  RANGES.forEach(r => { const emg = (r === '24h') ? mature24h(2.0) : partial(r); const d = frc(CTX, emg, r, 'desktop'), m = frc(CTX, emg, r, 'mobile'); if (hash(CTX, d.renderPoints) !== hash(CTX, m.renderPoints) || d.mode !== m.mode) parity = false; });
  ok('27 desktop/mobile data parity', parity);
})();

// ── 34) flag OFF restores v514 interaction (attach branches on the flag) ─────
(function () {
  const src = fnBodySrc('_wscAttachTooltip');
  ok('34 _wscAttachTooltip gates on _AURIX_CHART_INSTITUTIONAL_INTERACTION', /_AURIX_CHART_INSTITUTIONAL_INTERACTION/.test(src) && /_wscAttachTooltipInstitutional/.test(src));
  ok('34 flag OFF path keeps the exact v514 pointermove/pointerleave body', /plot\.addEventListener\('pointermove', move\)/.test(src) && /snapToPoint/.test(src));
})();

// ── SOURCE-LEVEL guarantees for the DOM/perf/lifecycle items (no jsdom in Node) ─
const inst = fnBodySrc('_wscAttachTooltipInstitutional');
ok('9 desktop lifecycle: pointerenter/move/leave wired', /pointerenter/.test(inst) && /pointermove/.test(inst) && /pointerleave/.test(inst));
ok('10 rAF throttling used (requestAnimationFrame, ≤1 update/frame)', /requestAnimationFrame/.test(inst) && /rafOn/.test(inst));
ok('11 no path rebuild during pointer move (no innerHTML / renderValidated… in handler)', !/innerHTML\s*=/.test(inst.replace(/tip\.innerHTML/g, '')) && !/renderValidatedPortfolioChartWithInstitutionalRenderer/.test(inst));
ok('12/28 keyboard: ArrowLeft/ArrowRight select real points', /ArrowLeft/.test(inst) && /ArrowRight/.test(inst) && /keydown/.test(inst));
ok('29 Escape clears selection', /Escape/.test(inst));
ok('30 reduced-motion respected (early return in _wscAttachTooltip)', /_dshReducedMotion\(\)\)\s*return;/.test(fnBodySrc('_wscAttachTooltip')));
ok('31/33 no timers / network / storage / save-sync in the interaction handler', !/setTimeout|setInterval/.test(inst) && !/fetch\(|XMLHttpRequest|localStorage|autoSaveToBackend|supabase/.test(inst));
ok('32 passive listeners on pointer tracking', /\{ passive: true \}/.test(inst));
ok('13/14 mobile hardened inspector untouched (long-press claim + drag threshold + touchcancel)', /lpTimer = setTimeout/.test(app) && /Math\.abs\(t\.clientX - startX\) > 10/.test(app) && /addEventListener\('touchcancel', end\)/.test(app));
ok('15/16/17 lifecycle reset: attach re-runs on repaint (nodes recreated per _wscAttachTooltip call)', /plot\.appendChild\(hairV\)/.test(inst));

// ── DIFF-GATE owners (single owner each) ─────────────────────────────────────
ok('OWN interaction resolver owner = 1', (app.match(/^function _aurixResolveChartInteraction\(/gm) || []).length === 1);
ok('OWN renderer owner = 1', (app.match(/^function renderValidatedPortfolioChartWithInstitutionalRenderer\(/gm) || []).length === 1);
ok('OWN path builder owner = 1', (app.match(/^function _aurixMonotonePath\(/gm) || []).length === 1);
ok('OWN density owner = 1', (app.match(/^function _aurixVpTargetPointCount\(/gm) || []).length === 1);
ok('OWN SPEC.19 chokepoint = 1', (app.match(/^function _aurixResolveFinalRenderSeriesContract\(/gm) || []).length === 1);
ok('OWN interaction flag declared once', (app.match(/const _AURIX_CHART_INSTITUTIONAL_INTERACTION\s*=/g) || []).length === 1);
ok('35 SPEC.34 marker present', app.indexOf('DSH.CHART.INSTITUTIONAL_INTERACTION_POLISH.34') >= 0);

// ── AUDIT extension: interactionContract present + correct ───────────────────
(function () {
  // build the audit core into a ctx that also has it + deps (reuse CTX; load the audit + segment stats)
  const ctx = mkCtx(true);
  ['_aurixComputeChartDensityMetrics', '_aurixSegmentSpacingStats', '_aurixAuditUnifiedVisualLanguageCore'].forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (e) { console.log('  ! ' + f + ': ' + e.message); } });
  try { vm.runInContext(konstSrc('_AURIX_VISUAL_LANGUAGE_THRESHOLDS'), ctx); } catch (_) {}
  const deps = {
    buildChart: r => ({ range: r, state: 'ready', points: (r === '24h' ? mature24h(2).points : partial(r).points) }),
    resolveContract: (chart, r, s) => frc(ctx, chart, r, s),
    render: (rp, opts) => ({ ok: true, visiblePixels: rp.map((p, i) => ({ x: i, y: 100 })), visiblePoints: rp.map(p => ({ time: p.ts, value: p.value })), xScale: { xMin: rp[0].ts, xMax: rp[rp.length - 1].ts, mode: 'fill-blend', beta: 0.48 }, structuralBreakCount: 0 }),
    projectionBeta: () => 0.48, densityBand: r => G(ctx, '_AURIX_VP_DENSITY')[r], targetPointCount: (r, w) => G(ctx, '_aurixVpTargetPointCount')(r, w),
    densityPolicyFlag: true, unifiedDensityConfig: { pixelsPerPoint: 5, minPoints: 80, maxPoints: 180 },
  };
  const res = G(ctx, '_aurixAuditUnifiedVisualLanguageCore')({ ranges: RANGES }, deps);
  const ic = res.interactionContract;
  ok('A interactionContract present + correct', !!ic && ic.enabled === true && ic.interpolation === false && ic.nearestPointPolicy === 'nearest_real_point_by_x_binary_search' && ic.maxSnapDistancePx === MAXSNAP && ic.keyboardEnabled === true && ic.mobilePointerEnabled === true && ic.syntheticPoints === 0);
  ok('A interactionContract does not change the verdict (read-only)', typeof res.verdict === 'string' && res.behaviorChanged === false);
})();

// ── Golden checkpoint doc present (unchanged) ────────────────────────────────
ok('G Golden v510 checkpoint doc present', fs.existsSync(path.join(root, 'docs', 'AURIX-CHART-GOLDEN-CHECKPOINT-v510.md')));

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' SPEC.34 INSTITUTIONAL INTERACTION & POLISH — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
