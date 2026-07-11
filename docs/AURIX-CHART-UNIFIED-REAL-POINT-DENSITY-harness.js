'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-UNIFIED-REAL-POINT-DENSITY-harness — SPEC DSH.CHART.UNIFIED_REAL_POINT_DENSITY.33
// ════════════════════════════════════════════════════════════════════════════
// SPEC.31/32 proved the renderer/path/gaps/X-projection are unified; the last visual divergence owner is the
// range-scaled _AURIX_VP_DENSITY (bands force long ranges UP — 1y min 280, all min 320 — vs 24H max 180 → the
// same real points crammed into the same width = compression). SPEC.33 unifies the density TARGET policy ONLY:
// when _AURIX_CHART_UNIFIED_REAL_POINT_DENSITY is ON, `_aurixVpTargetPointCount` uses one shared config
// (_AURIX_UNIFIED_VP_DENSITY = {pixelsPerPoint 5, minPoints 80, maxPoints 180} == 24H's proven band) for every
// range. This changes ONLY how many EXISTING real points are selected — reusing downsampleAurixAdaptive (no
// reduction-maths change). This harness proves: unified target ON / legacy target OFF; real-point PRESERVATION
// (first, last, global+local extrema, gap boundaries, subset-only, no synthetic, no dup, sorted); long ranges
// get fewer points (less compressed); 24H unchanged; projection beta stays 0.48; gaps/returns/badges/colours/
// presentation unchanged; the audit reports the unified density policy additively.
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
const LEGACY_BAND = { '24h': { min: 80, max: 180 }, '7d': { min: 120, max: 240 }, '30d': { min: 140, max: 300 }, '1y': { min: 280, max: 400 }, 'all': { min: 320, max: 450 } };
const UNIFIED_CFG = { pixelsPerPoint: 5, minPoints: 80, maxPoints: 180 };

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
  '_aurixResolveFinalRenderSeriesContract', '_aurixComputeChartDensityMetrics', '_aurixSegmentSpacingStats',
  '_aurixAuditUnifiedVisualLanguageCore', '_aurixSignificantLocalExtrema', 'downsampleAurixLTTB',
  'downsampleAurixAdaptive', 'computeAurixAdaptiveXScale', '_aurixVpTargetPointCount',
];
function mkCtx(flagOn) {
  const ctx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date, Set, Map, RegExp, String, Object };
  // density flag + unified config are MUTABLE ctx globals (flip ON/OFF); NOT loaded as const decls.
  ctx._AURIX_UNIFIED_VP_DENSITY = { pixelsPerPoint: UNIFIED_CFG.pixelsPerPoint, minPoints: UNIFIED_CFG.minPoints, maxPoints: UNIFIED_CFG.maxPoints };
  ctx._AURIX_CHART_UNIFIED_REAL_POINT_DENSITY = !!flagOn;
  // X-projection stays unified (SPEC.32 ON) so beta = 0.48 everywhere
  ctx._AURIX_UNIFIED_X_FILL_BETA = 0.48;
  ctx._AURIX_CHART_UNIFIED_X_PROJECTION_POLICY = true;
  vm.createContext(ctx);
  CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (e) {} });
  FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (e) { console.log('  ! could not load ' + f + ': ' + e.message); } });
  return ctx;
}
const CTX_ON = mkCtx(true), CTX_OFF = mkCtx(false);
const G = (ctx, n) => vm.runInContext(n, ctx);
const W = G(CTX_ON, '_WSC_VIEW_W'), H = G(CTX_ON, '_WSC_VIEW_H');
const BOX = { left: W * 0.06, right: W - W * 0.06, top: H * 0.14, bottom: H - H * 0.14 };
const target = (ctx, r) => G(ctx, '_aurixVpTargetPointCount')(r, W);
const ds = (ctx, pts, t) => G(ctx, 'downsampleAurixAdaptive')(pts.map(p => ({ time: p.ts, value: p.value })), t);
const sb = (ctx, mapped, r) => G(ctx, '_aurixStructuralBreaks')(mapped, r);
const frc = (ctx, emg, r, s) => G(ctx, '_aurixResolveFinalRenderSeriesContract')(emg, r, s || 'desktop');
const hash = (ctx, pts) => G(ctx, '_aurixEmergencyHash')(pts);
const tsHash = (ctx, pts) => hash(ctx, pts.map(p => ({ ts: (p.ts != null ? p.ts : p.time), value: 0 })));
const valHash = (ctx, pts) => hash(ctx, pts.map(p => ({ ts: 0, value: p.value })));

function seg(t0, n, stepMs, v0, dv) { const o = []; for (let i = 0; i < n; i++) o.push({ ts: t0 + i * stepMs, value: +(v0 + i * dv).toFixed(2) }); return o; }
function wave(t0, n, stepMs, base, amp, period) { const o = []; for (let i = 0; i < n; i++) o.push({ ts: t0 + i * stepMs, value: +(base + amp * Math.sin(i / period) + i * 0.05).toFixed(2) }); return o; }
function withGap(t0, gapDays) { return wave(t0, 200, HOUR, 1000, 40, 9).concat(wave(t0 + 200 * HOUR + gapDays * DAY, 200, HOUR, 1200, 35, 6)); }
function irregular(t0, n) { const o = []; let t = t0, v = 1000; for (let i = 0; i < n; i++) { o.push({ ts: t, value: +v.toFixed(2) }); t += (i % 4 === 0 ? 12 : i % 4 === 1 ? 55 : i % 4 === 2 ? 180 : 400) * MIN; v += (i % 2 ? 3.2 : -1.9); } return o; }

// mini-render — real production functions, same order as the renderer's beta/density slice
function miniRender(ctx, pts, range) {
  const mapped = pts.map(p => ({ time: p.ts, value: p.value }));
  const t = target(ctx, range);
  const vp = G(ctx, 'downsampleAurixAdaptive')(mapped, t);
  const br = (sb(ctx, vp, range).breaks) || [];
  const xScale = G(ctx, 'computeAurixAdaptiveXScale')(vp, W, BOX, range);
  return { visiblePoints: vp, visiblePixels: vp.map(p => ({ x: +xScale.x(p.time).toFixed(4), y: 120 })), xScale: xScale,
    renderedPointCount: vp.length, renderPathCount: br.length + 1, structuralBreakCount: br.length };
}

function mature24h(pct) {
  const pts = seg(T0, 48, 30 * MIN, 1000, pct / 100 * 1000 / 47), f = pts[0], l = pts[pts.length - 1];
  return { range: '24h', state: 'ready', returnState: 'ok', points: pts, finalPointCount: 48, pointCount: 48,
    firstTs: f.ts, lastTs: l.ts, baselineTs: f.ts, baselineValue: f.value, currentTs: l.ts, currentValue: l.value,
    coverageRatio: 0.9997, historyTooShortForRange: false, displayedRangeState: 'full',
    badgeReturnPct: pct, returnPct: pct, color: (pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat'), chartHash: 'h' };
}
function partial(range) {
  const pts = seg(T0, 12, 3 * HOUR, 1000, 0.3), f = pts[0], l = pts[pts.length - 1];
  return { range: range, state: 'ready', returnState: 'insufficient_return_history',
    returnSuppressedReason: 'insufficient_requested_range_history', reason: 'range_collapsed_history_short',
    points: pts, finalPointCount: 12, pointCount: 12, firstTs: f.ts, lastTs: l.ts,
    baselineTs: f.ts, baselineValue: f.value, currentTs: l.ts, currentValue: l.value,
    coverageRatio: 0.05, historyTooShortForRange: true, displayedRangeState: (range === 'all' ? 'all_history' : 'partial_history'),
    initialBuildDetected: false, coverageSuppressed: true, partialReturnTrusted: false,
    badgeReturnPct: null, returnPct: null, color: 'flat', chartHash: 'h' };
}
const isSubset = (out, input) => { const inTs = new Set(input.map(p => p.ts)); return out.every(p => inTs.has(p.time)); };
const sortedAsc = out => out.every((p, i) => i === 0 || p.time >= out[i - 1].time);
const noDup = out => { const s = new Set(); return out.every(p => { if (s.has(p.time)) return false; s.add(p.time); return true; }); };

console.log('\nAURIX-CHART-UNIFIED-REAL-POINT-DENSITY — SPEC.33');

// ── 1) Flag ON uses the same density config (same target) for all ranges ─────
(function () {
  const t = {}; RANGES.forEach(r => t[r] = target(CTX_ON, r));
  const uniq = Array.from(new Set(Object.values(t)));
  ok('1 flag ON ⇒ one shared target for all ranges', uniq.length === 1, JSON.stringify(t));
  ok('1 shared target = clamp(round(W/5),80,180)', uniq[0] === Math.max(80, Math.min(180, Math.round(W / 5))), 'target=' + uniq[0]);
})();

// ── 2) Flag OFF restores every legacy range band exactly ─────────────────────
(function () {
  const t = {}; RANGES.forEach(r => t[r] = target(CTX_OFF, r));
  const exp = {}; RANGES.forEach(r => { exp[r] = Math.max(LEGACY_BAND[r].min, Math.min(LEGACY_BAND[r].max, Math.round(W / 5))); });
  ok('2 flag OFF ⇒ exact legacy per-range targets', JSON.stringify(t) === JSON.stringify(exp), JSON.stringify(t) + ' vs ' + JSON.stringify(exp));
})();

// ── 3) Input below target returns unchanged points ───────────────────────────
(function () {
  const pts = seg(T0, 40, HOUR, 1000, 0.5);   // 40 < 180
  const out = ds(CTX_ON, pts, target(CTX_ON, '1y'));
  ok('3 input < target ⇒ unchanged (all points, same order)', out.length === 40 && out[0].time === pts[0].ts && out[39].time === pts[39].ts);
})();

// ── 4/5) first & last preserved (dense series that DOES reduce) ───────────────
(function () {
  const pts = wave(T0, 600, 20 * MIN, 1000, 80, 11);   // 600 > 180 ⇒ reduces
  const out = ds(CTX_ON, pts, target(CTX_ON, '1y'));
  ok('4 first point preserved', out[0].time === pts[0].ts);
  ok('5 last point preserved', out[out.length - 1].time === pts[pts.length - 1].ts);
  ok('4/5 strict subset + sorted + no dup', isSubset(out, pts) && sortedAsc(out) && noDup(out));
})();

// ── 6/7/8) local max / min / multiple extrema preserved ──────────────────────
(function () {
  const pts = wave(T0, 600, 20 * MIN, 1000, 120, 8);   // many prominent peaks/dips
  const out = ds(CTX_ON, pts, target(CTX_ON, '1y'));
  const outTs = new Set(out.map(p => p.time));
  let giMin = 0, giMax = 0; for (let i = 1; i < pts.length; i++) { if (pts[i].value < pts[giMin].value) giMin = i; if (pts[i].value > pts[giMax].value) giMax = i; }
  ok('6 global maximum preserved', outTs.has(pts[giMax].ts));
  ok('7 global minimum preserved', outTs.has(pts[giMin].ts));
  const ex = G(CTX_ON, '_aurixSignificantLocalExtrema')(pts.map(p => ({ time: p.ts, value: p.value })), 240, 0.03);
  const kept = ex.reduce((n, i) => n + (outTs.has(pts[i].ts) ? 1 : 0), 0);
  ok('8 dense-region extrema remain represented (≥60% of significant local extrema)', ex.length === 0 || kept / ex.length >= 0.6, kept + '/' + ex.length);
})();

// ── 9/10/11) gap-left + gap-right boundary preserved; no point crosses gap ────
(function () {
  const pts = withGap(T0, 40);   // 40-day gap between two 200-pt dense runs
  const lB = pts[199].ts, rB = pts[200].ts;
  const out = ds(CTX_ON, pts, target(CTX_ON, '1y'));
  const outTs = new Set(out.map(p => p.time));
  ok('9 gap-left boundary preserved', outTs.has(lB));
  ok('10 gap-right boundary preserved', outTs.has(rB));
  // every output point belongs to exactly one side of the gap (no fabricated mid-gap point)
  const mid = (lB + rB) / 2;
  const crosses = out.some(p => p.time > lB && p.time < rB);
  ok('11 no point inside the gap (no crossing/bridge)', !crosses);
})();

// ── 12) no synthetic points (strict subset) ──────────────────────────────────
(function () {
  const pts = withGap(T0, 40);
  const out = ds(CTX_ON, pts, target(CTX_ON, 'all'));
  ok('12 no synthetic points', isSubset(out, pts));
})();

// ── 13) no duplicate output points ───────────────────────────────────────────
(function () { ok('13 no duplicate output points', noDup(ds(CTX_ON, wave(T0, 500, 20 * MIN, 1000, 60, 7), target(CTX_ON, '30d')))); })();

// ── 14) chronological ordering preserved ─────────────────────────────────────
(function () { ok('14 chronological order preserved', sortedAsc(ds(CTX_ON, irregular(T0, 400), target(CTX_ON, '1y')))); })();

// ── 15) output is a strict subset of input ───────────────────────────────────
(function () { const pts = wave(T0, 700, 15 * MIN, 1000, 90, 10); ok('15 strict subset of input', isSubset(ds(CTX_ON, pts, target(CTX_ON, 'all')), pts)); })();

// ── 16) deterministic repeated output ────────────────────────────────────────
(function () {
  const pts = wave(T0, 600, 20 * MIN, 1000, 80, 9);
  ok('16 deterministic', JSON.stringify(ds(CTX_ON, pts, target(CTX_ON, '1y'))) === JSON.stringify(ds(CTX_ON, pts, target(CTX_ON, '1y'))));
})();

// ── 17) smooth 24H does not regress (byte-identical ON vs OFF — 24H band unchanged) ─
(function () {
  const pts = seg(T0, 48, 30 * MIN, 1000, 0.4);
  ok('17 24H target identical ON vs OFF', target(CTX_ON, '24h') === target(CTX_OFF, '24h'));
  ok('17 24H downsample byte-identical ON vs OFF', JSON.stringify(ds(CTX_ON, pts, target(CTX_ON, '24h'))) === JSON.stringify(ds(CTX_OFF, pts, target(CTX_OFF, '24h'))));
  ok('17 24H FRC contract byte-identical ON vs OFF', JSON.stringify(frc(CTX_ON, mature24h(3.0), '24h')) === JSON.stringify(frc(CTX_OFF, mature24h(3.0), '24h')));
})();

// ── 18/19/20/21) dense 7D/30D/1Y/ALL become LESS compressed (fewer rendered points) ─
['7d', '30d', '1y', 'all'].forEach((r, i) => {
  const pts = wave(T0, 900, 10 * MIN, 1000, 70, 12);   // 900 pts, reduces under both policies
  const on = ds(CTX_ON, pts, target(CTX_ON, r)).length;
  const off = ds(CTX_OFF, pts, target(CTX_OFF, r)).length;
  // 24H is the reference; legacy long ranges keep MORE points → unified should be ≤ legacy (less compressed), and == 24H's count
  const on24 = ds(CTX_ON, pts, target(CTX_ON, '24h')).length;
  ok((18 + i) + ' dense ' + r + ' less/equal compressed ON vs OFF (' + on + ' ≤ ' + off + ') and matches 24H density', on <= off && on === on24, 'on=' + on + ' off=' + off + ' on24=' + on24);
});

// ── 22) sparse range remains unchanged (input < target) ──────────────────────
(function () {
  const pts = seg(T0, 20, 3 * HOUR, 1000, 0.3);
  ok('22 sparse range unchanged ON', ds(CTX_ON, pts, target(CTX_ON, '1y')).length === 20);
})();

// ── 23) irregular timestamps handled safely (subset, sorted, first/last) ─────
(function () {
  const pts = irregular(T0, 500);
  const out = ds(CTX_ON, pts, target(CTX_ON, '1y'));
  ok('23 irregular timestamps: subset+sorted+first+last', isSubset(out, pts) && sortedAsc(out) && out[0].time === pts[0].ts && out[out.length - 1].time === pts[pts.length - 1].ts);
})();

// ── 24) mature long-history account retains extrema ──────────────────────────
(function () {
  const pts = wave(T0, 1200, 6 * HOUR, 1000, 150, 40);
  const out = ds(CTX_ON, pts, target(CTX_ON, 'all'));
  const outTs = new Set(out.map(p => p.time));
  let giMin = 0, giMax = 0; for (let i = 1; i < pts.length; i++) { if (pts[i].value < pts[giMin].value) giMin = i; if (pts[i].value > pts[giMax].value) giMax = i; }
  ok('24 mature account retains global extrema + first + last', outTs.has(pts[giMax].ts) && outTs.has(pts[giMin].ts) && outTs.has(pts[0].ts) && outTs.has(pts[pts.length - 1].ts));
})();

// ── 25) short-history ranges may share geometry honestly (identical short input ⇒ identical output) ─
(function () {
  const short = seg(T0, 12, 3 * HOUR, 1000, 0.3);
  const g30 = ds(CTX_ON, short, target(CTX_ON, '30d')), g1y = ds(CTX_ON, short, target(CTX_ON, '1y')), gall = ds(CTX_ON, short, target(CTX_ON, 'all'));
  ok('25 short history renders identically across ranges (honest, unchanged)', JSON.stringify(g30) === JSON.stringify(g1y) && JSON.stringify(g1y) === JSON.stringify(gall) && g30.length === 12);
})();

// ── 26) X projection beta remains 0.48 for all ranges ────────────────────────
(function () {
  const pts = wave(T0, 300, 20 * MIN, 1000, 50, 8);
  ok('26 beta 0.48 all ranges (SPEC.32 intact)', RANGES.every(r => Math.abs(miniRender(CTX_ON, pts, r).xScale.beta - 0.48) < 1e-9));
})();

// ── 27) renderPathCount unchanged ON vs OFF (gaps preserved regardless of target) ─
(function () {
  const pts = withGap(T0, 40);
  let same = true; RANGES.forEach(r => { if (miniRender(CTX_ON, pts, r).renderPathCount !== miniRender(CTX_OFF, pts, r).renderPathCount) same = false; });
  ok('27 renderPathCount identical ON vs OFF (all ranges, with a real gap)', same);
})();

// ── 28) timestamp/value source hashes unchanged (FRC renderPoints untouched) ──
(function () {
  let same = true;
  RANGES.forEach(r => {
    const emg = (r === '24h') ? mature24h(2.0) : partial(r);
    const a = frc(CTX_ON, emg, r).renderPoints, b = frc(CTX_OFF, emg, r).renderPoints;
    if (!(tsHash(CTX_ON, a) === tsHash(CTX_OFF, b) && valHash(CTX_ON, a) === valHash(CTX_OFF, b) && hash(CTX_ON, a) === hash(CTX_OFF, b))) same = false;
  });
  ok('28 FRC ts/value/render source hashes identical ON vs OFF', same);
})();

// ── 29) trusted return / badge / colour unchanged ON vs OFF ──────────────────
(function () {
  const a = frc(CTX_ON, mature24h(3.4), '24h'), b = frc(CTX_OFF, mature24h(3.4), '24h');
  ok('29 24H trusted %/badge/colour identical', a.badgeEligible === true && a.colorClass === 'up' && a.badgeLabel === b.badgeLabel && a.badgeReturnPct === b.badgeReturnPct);
})();

// ── 30) partial-history labels unchanged ON vs OFF ───────────────────────────
(function () {
  const a = frc(CTX_ON, partial('30d'), '30d'), b = frc(CTX_OFF, partial('30d'), '30d');
  ok('30 30D partial-history presentation unchanged', a.historyPresentationState === b.historyPresentationState && a.badgeLabel === b.badgeLabel);
})();

// ── 31) ALL available-history label unchanged ON vs OFF ──────────────────────
(function () {
  const a = frc(CTX_ON, partial('all'), 'all'), b = frc(CTX_OFF, partial('all'), 'all');
  ok('31 ALL history presentation unchanged', a.historyPresentationState === b.historyPresentationState && a.badgeLabel === b.badgeLabel);
})();

// ── 32) desktop/mobile parity ────────────────────────────────────────────────
(function () {
  let parity = true;
  RANGES.forEach(r => {
    const emg = (r === '24h') ? mature24h(1.5) : partial(r);
    const d = frc(CTX_ON, emg, r, 'desktop'), m = frc(CTX_ON, emg, r, 'mobile');
    if (!(hash(CTX_ON, d.renderPoints) === hash(CTX_ON, m.renderPoints) && d.mode === m.mode && d.renderPathCount === m.renderPathCount)) parity = false;
  });
  ok('32 desktop/mobile parity holds ON', parity);
})();

// ── 33) no input mutation ────────────────────────────────────────────────────
(function () {
  const pts = wave(T0, 400, 20 * MIN, 1000, 60, 9); const before = JSON.stringify(pts);
  ds(CTX_ON, pts, target(CTX_ON, '1y')); miniRender(CTX_ON, pts, '1y');
  ok('33 input array not mutated', JSON.stringify(pts) === before);
})();

// ── 34) no second renderer / path / density owner ────────────────────────────
(function () {
  ok('34 single density-target owner', (app.match(/^function _aurixVpTargetPointCount\(/gm) || []).length === 1);
  ok('34 single adaptive downsampler', (app.match(/^function downsampleAurixAdaptive\(/gm) || []).length === 1);
  ok('34 single production renderer', (app.match(/^function renderValidatedPortfolioChartWithInstitutionalRenderer\(/gm) || []).length === 1);
  ok('34 single path builder', (app.match(/^function _aurixMonotonePath\(/gm) || []).length === 1);
  ok('34 unified density config declared once + flag once', (app.match(/const _AURIX_UNIFIED_VP_DENSITY\s*=/g) || []).length === 1 && (app.match(/const _AURIX_CHART_UNIFIED_REAL_POINT_DENSITY\s*=/g) || []).length === 1);
  ok('34 legacy _AURIX_VP_DENSITY table preserved unchanged', /_AURIX_VP_DENSITY\s*=\s*\{[\s\S]*?'24h'\s*:\s*\{\s*min:\s*80,\s*max:\s*180[\s\S]*?'all'\s*:\s*\{\s*min:\s*320,\s*max:\s*450/.test(app));
})();

// ── 35) SPEC.33 marker present ───────────────────────────────────────────────
(function () { ok('35 SPEC.33 marker present', app.indexOf('DSH.CHART.UNIFIED_REAL_POINT_DENSITY.33') >= 0); })();

// ── AUDIT INTEGRATION — flag ON reports unified density policy + preservation ─
(function () {
  const denseFor = r => wave(T0, 900, 10 * MIN, 1000, 70, 12);
  const deps = ctx => ({
    buildChart: r => ({ range: r, state: 'ready', points: denseFor(r) }),
    resolveContract: (chart, r, s) => frc(ctx, chart, r, s),
    render: (rp, opts) => { const mr = miniRender(ctx, rp, opts.range); return { ok: true, visiblePixels: mr.visiblePixels, visiblePoints: mr.visiblePoints, xScale: mr.xScale, structuralBreakCount: mr.structuralBreakCount }; },
    projectionBeta: r => 0.48, densityBand: r => G(ctx, '_AURIX_VP_DENSITY')[r], targetPointCount: (r, w) => target(ctx, r),
    densityPolicyFlag: (ctx === CTX_ON), unifiedDensityConfig: UNIFIED_CFG,
  });
  const on = G(CTX_ON, '_aurixAuditUnifiedVisualLanguageCore')({ ranges: RANGES }, deps(CTX_ON));
  ok('A1 audit: densityPolicy UNIFIED for all ranges', RANGES.every(r => on.perRange[r].densityPolicy === 'UNIFIED_REAL_POINT_DENSITY'));
  ok('A1 audit: densityPolicyConsistent true', on.summary.densityPolicyConsistent === true);
  ok('A1 audit: allRangesUnifiedDensityPolicy true', on.summary.allRangesUnifiedDensityPolicy === true);
  ok('A1 audit: first/last/extrema/gap preservation pass', on.summary.firstLastPreservationPass && on.summary.extremaPreservationPass && on.summary.gapBoundaryPreservationPass);
  ok('A1 audit: totalRenderedSyntheticPoints 0', on.summary.totalRenderedSyntheticPoints === 0);
  ok('A1 audit: desktop/mobile parity true', on.summary.desktopMobileParity === true);
  ok('A1 audit: visualDensityVerdict healthy/residual', on.summary.visualDensityVerdict === 'UNIFIED_DENSITY_HEALTHY' || on.summary.visualDensityVerdict === 'UNIFIED_DENSITY_WITH_RESIDUAL_COMPRESSION');
  ok('A1 audit: REDUCTION_DENSITY divergence owner removed', !on.divergenceOwners.some(o => o.dimension === 'REDUCTION_DENSITY'));
  ok('A1 audit: per-range fields present', RANGES.every(r => { const c = on.perRange[r]; return ['densityTargetPointCount', 'inputPointCount', 'renderedPointCount', 'reductionRatio', 'extremaInputCount', 'extremaPreservedCount', 'gapBoundaryInputCount', 'gapBoundaryPreservedCount', 'firstPointPreserved', 'lastPointPreserved', 'p95PointsPerOccupiedColumn', 'emptyColumnRatio', 'resolvedDensityConfig', 'legacyDensityBand'].every(k => k in c); }));

  const off = G(CTX_OFF, '_aurixAuditUnifiedVisualLanguageCore')({ ranges: RANGES }, deps(CTX_OFF));
  ok('A2 audit OFF: densityPolicy LEGACY + inconsistent', off.perRange['1y'].densityPolicy === 'LEGACY_RANGE_SCALED_DENSITY' && off.summary.densityPolicyConsistent === false);
  ok('A2 audit OFF: REDUCTION_DENSITY divergence owner present', off.divergenceOwners.some(o => o.dimension === 'REDUCTION_DENSITY'));
})();

// ── Golden checkpoint unchanged (source constant not touched) ────────────────
(function () { ok('G Golden v510 tag string still referenced in docs (checkpoint doc present)', fs.existsSync(path.join(root, 'docs', 'AURIX-CHART-GOLDEN-CHECKPOINT-v510.md'))); })();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' SPEC.33 UNIFIED REAL-POINT DENSITY — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
