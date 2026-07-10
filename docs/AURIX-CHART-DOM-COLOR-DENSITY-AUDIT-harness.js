'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-DOM-COLOR-DENSITY-AUDIT-harness — SPEC DSH.CHART.DOM_COLOR_DENSITY_AUDIT.30
// ════════════════════════════════════════════════════════════════════════════
// Proves the SPEC.30 read-only audit (window.aurixAuditChartDomColorDensity + core + pure classifiers):
//   • DOM presentation match/mismatch vs the SPEC.19 contract's expected label (badge binding).
//   • Line COLOUR ownership — an untrusted (not-eligible) badge must draw a NEUTRAL line; a directional
//     colour under an untrusted badge is the proven colour-ownership defect. 24H trusted colour matches.
//   • Visual DENSITY — pure pixel-column distribution metrics + balanced / overdense / underdense / mixed
//     classification against CENTRALISED thresholds; unavailable pixel width ⇒ inconclusive (never a guess).
//   • Cross-range alias reuse (identical short history is legitimate; wrong-range timestamps = alias defect).
// AUDIT-ONLY: syntheticPoints stays 0, inputs are never mutated, desktop/mobile parity holds, the settle
// wrapper clears ALL timers, output is deterministic, and the Golden v510 contract behaviour is unchanged.
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
// slice `window.<lhs> = function (args) { ... };` → the bare `function (args) {...}` expression source
function assignFnSrc(lhs) { const s = 'window.' + lhs + ' = function'; const i = app.indexOf(s); if (i < 0) throw new Error('missing assign ' + lhs); const fi = app.indexOf('function', i); return braceSlice(fi); }

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
  // SPEC.30 + perceptual X domain
  '_AURIX_DENSITY_THRESHOLDS', '_AURIX_RC_PAD_FRAC', '_AURIX_X_FILL_BETA',
  '_AURIX_RETURN_PENDING_TEXT', '_AURIX_HIST_PARTIAL_TEXT', '_AURIX_HIST_AVAILABLE_TEXT',
];
const FNS = [
  '_aurixEmergencyHash', '_aurixRealGapFloorMs', '_aurixConfirmedBridgeGaps', '_aurixVerticalJumps',
  '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks', '_aurixSplitAtGaps', '_aurixBuildContinuityValidatedSeries',
  '_aurixStructuralBreaks', '_aurixResolveChartReturnContract', '_aurixShortHistoryDisplay', '_aurixVisualTrustGate',
  '_aurixStableDisplayAnchor', '_aurixCanonicalReturnAnchorIndex', '_aurixResolveReliabilityDeadlock',
  '_aurixResolveFinalRenderSeriesContract', '_aurixClassifyCrossRangeSeriesProvenance', 'computeAurixAdaptiveXScale',
  // SPEC.30 new
  '_aurixComputeChartDensityMetrics', '_aurixProjectRenderPointsToPixels', '_aurixLineColorStateFromDom',
  '_aurixReadChartDom', '_aurixExpectedBadgeLabel', '_aurixClassifyDomPresentation', '_aurixClassifyLineColorOwnership',
  '_aurixAuditChartDomColorDensityCore',
];
function mkCtx() {
  const ctx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date, Set, Map, RegExp, String };
  vm.createContext(ctx);
  CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (e) { /* optional */ } });
  FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (e) { console.log('  ! could not load ' + f + ': ' + e.message); } });
  return ctx;
}
const CTX = mkCtx();
const G = n => vm.runInContext(n, CTX);
const frc = (emg, r, s) => G('_aurixResolveFinalRenderSeriesContract')(emg, r, s || 'desktop');
const density = (xs, w, ts) => G('_aurixComputeChartDensityMetrics')(xs, w, ts || null);
const expectedLabel = f => G('_aurixExpectedBadgeLabel')(f);
const classDom = (exp, vis, avail) => G('_aurixClassifyDomPresentation')(exp, vis, avail);
const classColor = (elig, exp, vis, avail) => G('_aurixClassifyLineColorOwnership')(elig, exp, vis, avail);
const classCross = list => G('_aurixClassifyCrossRangeSeriesProvenance')(list);
const core = (opts, deps) => G('_aurixAuditChartDomColorDensityCore')(opts, deps);

function seg(t0, n, stepMs, v0, dv) { const o = []; for (let i = 0; i < n; i++) o.push({ ts: t0 + i * stepMs, value: +(v0 + i * dv).toFixed(2) }); return o; }
function mature24h(pct) {
  const pts = seg(T0, 48, 30 * MIN, 1000, pct / 100 * 1000 / 47);
  const first = pts[0], last = pts[pts.length - 1];
  return { range: '24h', state: 'ready', returnState: 'ok', points: pts, finalPointCount: 48, pointCount: 48,
    firstTs: first.ts, lastTs: last.ts, baselineTs: first.ts, baselineValue: first.value, currentTs: last.ts, currentValue: last.value,
    coverageRatio: 0.9997, historyTooShortForRange: false, displayedRangeState: 'full',
    badgeReturnPct: pct, returnPct: pct, color: (pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat'), chartHash: 'h' };
}
// short partial 7d history (stable, no trusted return) — v510 ⇒ historyPresentationState PARTIAL_HISTORY
function partial7d() {
  const pts = seg(T0, 12, 3 * HOUR, 1000, 0.3);
  const first = pts[0], last = pts[pts.length - 1];
  return { range: '7d', state: 'ready', returnState: 'insufficient_return_history',
    returnSuppressedReason: 'insufficient_requested_range_history', reason: 'range_collapsed_history_short',
    points: pts, finalPointCount: 12, pointCount: 12, firstTs: first.ts, lastTs: last.ts,
    baselineTs: first.ts, baselineValue: first.value, currentTs: last.ts, currentValue: last.value,
    coverageRatio: 0.05, historyTooShortForRange: true, displayedRangeState: 'partial_history',
    initialBuildDetected: false, coverageSuppressed: true, partialReturnTrusted: false,
    badgeReturnPct: null, returnPct: null, color: 'flat', chartHash: 'h' };
}

// synthetic build/resolve deps for headless core runs — one chart per range, real FRC over it
function mkDeps(chartByRange, domByRange) {
  return {
    buildChart: r => chartByRange[r] || { points: [], state: 'pending' },
    resolveContract: (chart, r, s) => frc(chart, r, s),
    readDom: s => {
      const d = domByRange ? domByRange(s) : null;
      return d || { surface: s, domAvailable: false, visibleBadgeText: null, visibleBadgeClass: null,
        visibleLineClass: null, visibleLineColorState: null, selectedRange: null, chartPixelWidth: null };
    },
    projectPixels: (rp, w, r) => G('_aurixProjectRenderPointsToPixels')(rp, w, r),
  };
}

console.log('\nAURIX-CHART-DOM-COLOR-DENSITY-AUDIT — SPEC.30');

// ── 1) 24H trusted positive/negative colour matches ──────────────────────────
(function () {
  const up = frc(mature24h(3.2), '24h', 'desktop');
  const dn = frc(mature24h(-2.4), '24h', 'desktop');
  ok('1 24H trusted +% eligible, colorClass up', up.badgeEligible === true && up.colorClass === 'up', 'label=' + up.badgeLabel + ' cc=' + up.colorClass);
  ok('1 24H trusted +% colour ownership match', classColor(true, up.colorClass, 'positive', true) === 'TRUSTED_COLOR_MATCH');
  ok('1 24H trusted -% eligible, colorClass down', dn.badgeEligible === true && dn.colorClass === 'down', 'cc=' + dn.colorClass);
  ok('1 24H trusted -% colour ownership match', classColor(true, dn.colorClass, 'negative', true) === 'TRUSTED_COLOR_MATCH');
})();

// ── 2) 24H remains single path (renderPathCount ≤ 1) even with an internal gap ─
(function () {
  const a = seg(T0, 20, 20 * MIN, 1000, 0.5);              // recent run
  const b = seg(T0 - 8 * HOUR, 6, 20 * MIN, 900, 0.4);     // older island, big gap
  const emg = mature24h(1.0); emg.points = b.concat(a); emg.returnState = 'ok';
  const f = frc(emg, '24h', 'desktop');
  ok('2 24H renderPathCount ≤ 1', f.renderPathCount != null && f.renderPathCount <= 1, 'rpc=' + f.renderPathCount);
})();

// ── 3) PARTIAL_HISTORY + visible "Historial parcial" → match ─────────────────
(function () {
  const f = { badgeEligible: false, historyPresentationState: 'PARTIAL_HISTORY', badgeLabel: 'Calculando…', colorClass: 'flat' };
  const exp = expectedLabel(f);
  ok('3 expected PARTIAL text', exp.kind === 'PARTIAL' && exp.text === 'Historial parcial', exp.text);
  ok('3 DOM match', classDom(exp, 'Historial parcial', true) === 'DOM_PRESENTATION_MATCH');
})();

// ── 4) AVAILABLE_HISTORY + visible "Historial disponible" → match ────────────
(function () {
  const f = { badgeEligible: false, historyPresentationState: 'AVAILABLE_HISTORY', badgeLabel: 'Calculando…', colorClass: 'flat' };
  const exp = expectedLabel(f);
  ok('4 expected AVAILABLE text', exp.kind === 'AVAILABLE' && exp.text === 'Historial disponible', exp.text);
  ok('4 DOM match', classDom(exp, 'Historial disponible', true) === 'DOM_PRESENTATION_MATCH');
})();

// ── 5) PARTIAL_HISTORY + visible "Calculando…" → DOM mismatch ────────────────
(function () {
  const f = { badgeEligible: false, historyPresentationState: 'PARTIAL_HISTORY', badgeLabel: 'Calculando…', colorClass: 'flat' };
  const exp = expectedLabel(f);
  ok('5 DOM mismatch (expected parcial, visible Calculando)', classDom(exp, 'Calculando…', true) === 'DOM_PRESENTATION_MISMATCH');
})();

// ── 6) badgeEligible=false + green/red line → colour mismatch ────────────────
(function () {
  ok('6 untrusted + positive line → mismatch', classColor(false, 'flat', 'positive', true) === 'UNTRUSTED_LINE_COLOR_MISMATCH');
  ok('6 untrusted + negative line → mismatch', classColor(false, 'flat', 'negative', true) === 'UNTRUSTED_LINE_COLOR_MISMATCH');
})();

// ── 7) badgeEligible=false + neutral line → valid ────────────────────────────
(function () {
  ok('7 untrusted + neutral line → valid', classColor(false, 'flat', 'neutral', true) === 'UNTRUSTED_NEUTRAL_MATCH');
})();

// ── 8) legitimate same short history across ranges → no alias defect ─────────
(function () {
  // one shared 5-day real interval; fits inside 7d/30d/1y/all windows ⇒ identical output is legitimate
  const shared = { canonicalInputHash: 'C', finalRenderHash: 'R', renderPointCount: 40,
    realFirstTs: T0, realLastTs: T0 + 5 * DAY, realSpanMs: 5 * DAY };
  const list = ['7d', '30d', '1y', 'all'].map(r => Object.assign({ requestedRange: r }, shared));
  const res = classCross(list);
  const aliasDefects = res.pairs.filter(p => p.classification === 'CROSS_RANGE_ALIAS_DEFECT');
  ok('8 no alias defect for legitimate shared short history', aliasDefects.length === 0 && res.pairs.every(p => p.classification === 'SAME_AVAILABLE_HISTORY_LEGITIMATE'), 'verdict=' + res.verdict);
})();

// ── 9) proven wrong-range timestamps → alias defect ──────────────────────────
(function () {
  // identical hash but the real interval (20d) is WIDER than the 7d window ⇒ 7d should have clipped further
  const shared = { canonicalInputHash: 'C', finalRenderHash: 'R', renderPointCount: 40,
    realFirstTs: T0, realLastTs: T0 + 20 * DAY, realSpanMs: 20 * DAY };
  const list = ['7d', '30d'].map(r => Object.assign({ requestedRange: r }, shared));
  const res = classCross(list);
  ok('9 alias defect proven (20d interval identical on 7d & 30d)', res.pairs.some(p => p.classification === 'CROSS_RANGE_ALIAS_DEFECT'), 'verdict=' + res.verdict);
})();

// ── 10) balanced density ─────────────────────────────────────────────────────
(function () {
  const W = 400; const xs = []; for (let i = 0; i < 70; i++) xs.push(i * (W / 70));   // ~1 per 5.7px, spread across full width
  const m = density(xs, W, null);
  ok('10 balanced', m.densityClassification === 'DENSITY_BALANCED', m.densityClassification + ' max=' + m.maxPointsInOnePixelColumn + ' ppp=' + m.pointsPerPixel + ' sparsePx=' + m.longestVisuallySparseSpanPx);
})();

// ── 11) compressed multi-points-per-pixel density (uniform overdense) ────────
(function () {
  const W = 400; const xs = []; for (let i = 0; i < 1200; i++) xs.push((i / 1200) * (W - 1));   // ~3/px everywhere
  const m = density(xs, W, null);
  ok('11 overdensity', m.densityClassification === 'VISUAL_POINT_OVERDENSITY', m.densityClassification + ' max=' + m.maxPointsInOnePixelColumn + ' p50=' + m.p50PointsPerOccupiedColumn);
})();

// ── 12) sparse long-span density ─────────────────────────────────────────────
(function () {
  const W = 400; const xs = [2, 60, 130, 210, 300, 398];   // 6 points across the whole width
  const m = density(xs, W, null);
  ok('12 underdensity', m.densityClassification === 'VISUAL_POINT_UNDERDENSITY', m.densityClassification + ' ppp=' + m.pointsPerPixel);
})();

// ── 13) mixed density (packed head + big empty span + sparse tail) ───────────
(function () {
  const W = 400; const xs = [];
  for (let i = 0; i < 60; i++) xs.push((i % 10) + (i < 30 ? 0 : 0.4));   // ~60 points crammed into first ~10px
  xs.push(395); xs.push(398);                                            // two lonely tail points after a huge gap
  const m = density(xs, W, null);
  ok('13 mixed', m.densityClassification === 'MIXED_VISUAL_DENSITY', m.densityClassification + ' max=' + m.maxPointsInOnePixelColumn + ' sparsePx=' + m.longestVisuallySparseSpanPx);
})();

// ── 14) unavailable DOM/pixel width → inconclusive, never defect by guess ────
(function () {
  const mNoW = density([1, 2, 3, 4], null, [T0, T0 + HOUR]);
  ok('14 density UNAVAILABLE with no pixel width', mNoW.densityStatus === 'UNAVAILABLE' && mNoW.densityClassification === 'DENSITY_UNAVAILABLE');
  const chartByRange = { '7d': partial7d() };
  const res = core({ ranges: ['7d'], surfaces: ['desktop'], includeDom: true }, mkDeps(chartByRange, null));   // readDom → domAvailable false
  const cell = res.perRange['7d'].desktop;
  ok('14 core: DOM unavailable classified, not a defect', cell.domPresentationClassification === 'DOM_UNAVAILABLE' && cell.densityStatus === 'UNAVAILABLE' && res.summary.domPresentationMismatchCount === 0 && res.summary.visualDensityDefectCount === 0);
  ok('14 core verdict AUDIT_INCONCLUSIVE (nothing provable)', res.verdict === 'AUDIT_INCONCLUSIVE', res.verdict);
})();

// ── 15) syntheticPoints always 0 ─────────────────────────────────────────────
(function () {
  const chartByRange = { '24h': mature24h(2.1), '7d': partial7d() };
  const res = core({ ranges: ['24h', '7d'], surfaces: ['desktop', 'mobile'], includeDom: true }, mkDeps(chartByRange, null));
  let allZero = true;
  Object.keys(res.perRange).forEach(r => Object.keys(res.perRange[r]).forEach(s => { if (res.perRange[r][s].syntheticPoints !== 0) allZero = false; }));
  ok('15 syntheticPoints 0 everywhere', allZero && res.summary.totalSyntheticPoints === 0, 'total=' + res.summary.totalSyntheticPoints);
})();

// ── 16) input objects/points not mutated ─────────────────────────────────────
(function () {
  const chart24 = mature24h(2.1), chart7 = partial7d();
  const chartByRange = { '24h': chart24, '7d': chart7 };
  const before = JSON.stringify([chart24, chart7]);
  core({ ranges: ['24h', '7d'], surfaces: ['desktop', 'mobile'], includeDom: true, assumePixelWidth: 360 }, mkDeps(chartByRange, null));
  const after = JSON.stringify([chart24, chart7]);
  ok('16 input charts/points not mutated', before === after);
})();

// ── 17) desktop/mobile parity ────────────────────────────────────────────────
(function () {
  const chartByRange = { '24h': mature24h(1.5), '7d': partial7d(), '30d': partial7d() };
  const res = core({ ranges: ['24h', '7d', '30d'], surfaces: ['desktop', 'mobile'], includeDom: true, assumePixelWidth: 380 }, mkDeps(chartByRange, null));
  ok('17 desktop/mobile parity', res.summary.desktopMobileParity === true);
  ok('17 all24hSinglePath', res.summary.all24hSinglePath === true);
})();

// ── 18) settle wrapper clears ALL timers and always resolves ─────────────────
(async function () {
  const wrapSrc = assignFnSrc('aurixAuditChartDomColorDensity');
  const timerMap = new Map(); let nextId = 1; const queue = [];
  let nowT = 1000;
  const wctx = {
    Math, JSON, Array, Number, isFinite, Infinity, Set, Map, RegExp, String, Promise,
    console: { log() {} },
    Date: { now: () => (nowT += 5) },
    setTimeout: (cb) => { const id = nextId++; timerMap.set(id, cb); queue.push(id); return id; },
    clearTimeout: (id) => { timerMap.delete(id); },
    buildProductionPortfolioChart: () => ({ points: [], state: 'pending' }),
    _aurixResolveFinalRenderSeriesContract: (c, r, s) => ({ renderPoints: [], state: 'calculating', historyPresentationState: 'CALCULATING', badgeLabel: 'Calculando…' }),
    _aurixEmergencyHash: () => 'H',
    _aurixAuditChartDomColorDensityCore: () => ({ verdict: 'AUDIT_INCONCLUSIVE', summary: {}, defects: [], suspects: [] }),
  };
  wctx.window = wctx;
  vm.createContext(wctx);
  const wrapper = vm.runInContext('(' + wrapSrc + ')', wctx);
  const p = wrapper({ ranges: ['24h'], timeoutMs: 5000, settleStepMs: 50 });
  // pump the fake timer queue until the promise settles (settleSig is constant ⇒ stable on 2nd sample)
  let guard = 0;
  while (queue.length && guard++ < 1000) { const id = queue.shift(); if (timerMap.has(id)) { const cb = timerMap.get(id); timerMap.delete(id); cb(); } }
  const result = await p;
  ok('18 wrapper resolves (never rejects)', !!result && !!result.verdict);
  ok('18 all timers cleared after settle', timerMap.size === 0, 'remaining=' + timerMap.size);
  ok('18 stored last result in memory', wctx.__AURIX_LAST_CHART_DOM_COLOR_DENSITY_AUDIT__ === result);

  // ── 19) deterministic same-input output ────────────────────────────────────
  const chartByRange = { '24h': mature24h(2.0), '7d': partial7d() };
  const strip = o => { const c = JSON.parse(JSON.stringify(o)); delete c.startedAtIso; delete c.endedAtIso; return c; };
  const r1 = core({ ranges: ['24h', '7d'], surfaces: ['desktop', 'mobile'], includeDom: true, assumePixelWidth: 360 }, mkDeps(chartByRange, null));
  const r2 = core({ ranges: ['24h', '7d'], surfaces: ['desktop', 'mobile'], includeDom: true, assumePixelWidth: 360 }, mkDeps(chartByRange, null));
  ok('19 deterministic output for identical input', JSON.stringify(strip(r1)) === JSON.stringify(strip(r2)));

  // ── 20) Golden v510 contract behaviour unchanged (audit is read-only) ───────
  const g24 = mature24h(3.7), g7 = partial7d();
  const beforeA = JSON.stringify([frc(mature24h(3.7), '24h', 'desktop'), frc(partial7d(), '7d', 'desktop')]);
  core({ ranges: ['24h', '7d'], surfaces: ['desktop', 'mobile'], includeDom: true, assumePixelWidth: 360 }, mkDeps({ '24h': g24, '7d': g7 }, null));
  const afterA = JSON.stringify([frc(mature24h(3.7), '24h', 'desktop'), frc(partial7d(), '7d', 'desktop')]);
  const c24 = frc(mature24h(3.7), '24h', 'desktop');
  const c7 = frc(partial7d(), '7d', 'desktop');
  ok('20 v510 24H trusted % + colour intact', c24.badgeEligible === true && /%/.test(c24.badgeLabel) && c24.colorClass === 'up');
  ok('20 v510 7D partial history presentation intact', c7.badgeEligible === false && c7.historyPresentationState === 'PARTIAL_HISTORY');
  ok('20 audit did not change contract behaviour', beforeA === afterA);

  console.log('\n' + (fail === 0 ? '✅' : '❌') + ' SPEC.30 DOM/COLOR/DENSITY AUDIT — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})();
