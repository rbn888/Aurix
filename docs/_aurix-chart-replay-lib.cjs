'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX CHART REPLAY LIB — shared sandbox loader for the CHART RELIABILITY block
// ════════════════════════════════════════════════════════════════════════════
// Loads the REAL chart pipeline out of app.js into a vm sandbox and lets a harness drive a full
// lifecycle: set the persisted truth, set the hydration state, build, dump S0→S8.
//
// NON-NEGOTIABLE: nothing in the certified pipeline is stubbed. `_aurixHistorySourceForDisplay`,
// `_aurixMergeSnapshotSources`, `_aurixRealGapFloorMs`, the continuity classifier, the FRC and the
// publication gate are the production functions, byte for byte. Only genuinely EXTERNAL things are
// stubbed: FX conversion (toBase), the storage shim behind `_aurixLoadCapitalFlows`, and the wall
// clock (frozen, because the invariant is stated at a fixed evaluation time).
// (Lesson AURIX-HARNESS: a pass-through `formatBase` stub once let 5 financial defects through green.)
const fs = require('fs'), vm = require('vm'), path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

// ── source extraction ────────────────────────────────────────────────────────
const _fnCache = new Map(), _constCache = new Map();
function fnSrc(name) {
  if (_fnCache.has(name)) return _fnCache.get(name);
  const s = 'function ' + name + '(';
  const i = APP.indexOf(s);
  if (i < 0) throw new Error('replay-lib: missing function ' + name);
  let k = APP.indexOf('{', i), d = 0;
  for (; k < APP.length; k++) { const c = APP[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } }
  const r = APP.slice(i, k); _fnCache.set(name, r); return r;
}
// Statement-aware `const NAME = …;` extractor. Handles multi-declarator statements
// (`const A = 1, B = 2;`) and object/array literals spanning lines — the old single-line regex
// silently missed both, and a missing threshold constant would make the pipeline fall back to its
// inline defaults instead of the production values (i.e. certify the wrong engine).
function constSrc(name) {
  if (_constCache.has(name)) return _constCache.get(name);
  const re = new RegExp('(?:^|[\\s,({])' + name + '\\s*=(?!=)');
  let from = 0, m;
  while (true) {
    re.lastIndex = 0;
    const sub = APP.slice(from);
    m = re.exec(sub);
    if (!m) throw new Error('replay-lib: missing const ' + name);
    const at = from + m.index;
    // walk back to the nearest line-start const/let that owns this declarator
    let ls = APP.lastIndexOf('\n', at);
    let decl = -1;
    for (let probe = ls; probe > 0 && at - probe < 4000; probe = APP.lastIndexOf('\n', probe - 1)) {
      const line = APP.slice(probe + 1, APP.indexOf('\n', probe + 1));
      const dm = /^(const|let)\s/.exec(line);
      if (dm) { decl = probe + 1 + line.indexOf(dm[1]); break; }
      if (/^(function|\/\/|\*)/.test(line)) break;
    }
    if (decl < 0) { from = at + 1; continue; }
    // forward to the terminating `;` at depth 0
    let i = decl, d = 0, q = null;
    for (; i < APP.length; i++) {
      const c = APP[i];
      if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if (c === '/' && APP[i + 1] === '/') { while (i < APP.length && APP[i] !== '\n') i++; continue; }
      if ('([{'.includes(c)) d++;
      else if (')]}'.includes(c)) d--;
      else if (c === ';' && d === 0) break;
    }
    const stmt = APP.slice(decl, i + 1);
    if (new RegExp('(?:^|[\\s,({])' + name + '\\s*=(?!=)').test(stmt)) { _constCache.set(name, stmt); return stmt; }
    from = at + 1;
  }
}

const CONSTS = ["_AURIX_VP_GAP_FLOOR_MS","_AURIX_VP_GAP_MEDIAN_MULT","_AURIX_OBS_GAP_MIN_MS","_AURIX_OBS_GAP_MAX_MS","_AURIX_PUBLICATION_STATE","_AURIX_LB2_BLOCK_ON_HYDRATION_FAILED","_AURIX_CHART_FIRSTPAINT_HOLD_ALL_RANGES","_AURIX_CHART_BLOCK_ON_CANONICAL_READ_FAILED","_AURIX_BACKEND_SNAPSHOTS_ENABLED","_AURIX_BACKEND_SNAPSHOTS_AUTOLOAD","_AURIX_SNAP_NEAR_MS","_AURIX_SNAP_NEAR_FRAC","_AURIX_SNAP_FE_AUTHORITY_MS","_AURIX_CHART_CANONICAL_REFRESH_DETERMINISM","_AURIX_VTG_MIN_MAIN_PTS","_AURIX_VTG_MIN_MAIN_SPAN_MS","_AURIX_CHART_7D_SINGLE_CONTINUOUS","_AURIX_CHART_ACTIVE_REGIME_SINGLE_PATH","_AURIX_CHART_RELIABILITY_DEADLOCK_RESOLUTION","_AURIX_ALL_MIN_TRUST_POINTS","_AURIX_CHART_SHORT_HISTORY_MIN_DAYS","_AURIX_PARTIAL_RETURN_MIN_PCT","_AURIX_REGIME_CLIFF_FRAC","_AURIX_CAPITAL_STEP_SEG_ENABLED","_AURIX_CAPSTEP_RATIO_LO","_AURIX_CAPSTEP_RATIO_HI","_AURIX_CAPSTEP_TS_PAD_MS","_AURIX_VJUMP_P95_MULT","_AURIX_VJUMP_MIN_FRAC","_AURIX_CAPITAL_FLOWS_KEY","_AURIX_CHART_VISUAL_TRUST_GATE","_AURIX_CHART_BOOTSTRAP_SUPPRESSION","_AURIX_STABLE_BAND_LO","_AURIX_STABLE_BAND_HI","_AURIX_STABLE_MIN_PTS","_AURIX_STABLE_MIN_SPAN_MS","_AURIX_STABLE_CONSTRUCTION_JUMP","_AURIX_CHART_SHORT_HISTORY_DISPLAY","_AURIX_CHART_RETURN_CONTRACT_UNIFICATION","_AURIX_CHART_CONTINUITY_UNIFICATION","_AURIX_EMG_RANGE_MS","_AURIX_SPARSE_RAMP_SEG_ENABLED","_AURIX_SPARSE_RAMP_MULT","_AURIX_SPARSE_RAMP_MIN_MS","_AURIX_BRIDGE_SEG_ENABLED","_AURIX_BRIDGE_SEG_FRAC","_AURIX_CHART_RECONCILE_GATE","_AURIX_CHART_DURABLE_COLD_START","_AURIX_HPQ_MIN_POINTS","_AURIX_24H_PARTIAL_MIN_POINTS","_AURIX_RET_SANE_PCT","_AURIX_STEP_MATCH_MIN_CONF","_AURIX_ALL_MIN_TRUST_SPAN_MS","_AURIX_24H_PARTIAL_MIN_COVERAGE","_AURIX_24H_ENDPOINT_FRESH_MS","_AURIX_24H_MAX_INTERNAL_GAP_MS","_AURIX_PROD_MIN_POINTS","_AURIX_EMG_ADJ_JUMP","_AURIX_RET_MIN_BASE","_AURIX_HPQ_SPIKE_JUMP","_AURIX_EMG_FALLBACK_TAIL","_AURIX_HPQ_TEMPORAL_CONSTRUCTION_WINDOW","_AURIX_HPQ_CONSTRUCTION_WINDOW_MS","_AURIX_HPQ_SPIKE_REVERT_FRAC","_AURIX_CHART_EPOCH_TRUST","_AURIX_CHART_24H_FE_AUTHORITY","_AURIX_HPQ_FUTURE_MS","_AURIX_CHART_SEGMENT_SOURCE_AUTHORITY","_AURIX_CHART_24H_COVERAGE_AWARE_AUTHORITY","_AURIX_24H_COVERAGE_THR","_AURIX_24H_MIN_BACKEND_POINTS","_AURIX_CHART_EPOCH_BAND_LO","_AURIX_CHART_EPOCH_BAND_HI"];

const FNS = ["_aurixRealGapFloorMs","_aurixResolvePublicationReadiness","_aurixChartPublicationSourcesPending","_aurixHistorySourceForDisplay","_aurixMergeSnapshotSources","_aurixNormalizeBackendSnapshot","_aurixResolveFinalRenderSeriesContract","_aurixResolveReliabilityDeadlock","_aurixSplitAtGaps","_aurixRegimeBoundaryBreaks","_aurixCapitalStepBreaks","_aurixVerticalJumps","_aurixLoadCapitalFlows","_aurixPortfolioEpoch","_aurixVisualTrustGate","_aurixStableDisplayAnchor","_aurixShortHistoryDisplay","_aurixResolveChartReturnContract","_aurixBuildContinuityValidatedSeries","_aurixSparseRampBreaks","_aurixConfirmedBridgeGaps","_aurixStructuralBreaks","buildProductionPortfolioChart","_aurixEmergencyHash","_aurix24hReturnReadiness","_aurix24hRecentRunAnchor","_aurixProdVisualGate","_aurixComputePeriodReturn","_aurixNetFlowsInWindow","_aurixCanonicalReturnAnchorIndex","buildValidatedHistoricalSeries","_aurixHpqRangesContaining","_aurixProdPlateauFilter","_aurixHpqDiag","_aurixHpqIso","_aurixHpqTrimConstruction","_aurixHpqQuarantineSpikes","_aurixHpqFirstInvalidStage","_aurixHpqRawStages","_aurixPointValuationIncomplete","_aurixInvestableSnapshots","_aurixApplyRangeSourceAuthority","_aurixFrontendUsableInWindow","_aurixSourceFamily","_aurix24hStripNonAuthoritativePreservingHoles","_aurix24hSourceCoverage","_aurixEnforceSegmentSourceAuthority","_aurixTrustedChartSource","_aurixInvestableChartEpoch","_aurixResolveColdStartRender","_aurixCanonicalHistoryReady","_aurixNoteCanonicalOutcome"];

// ── sandbox ──────────────────────────────────────────────────────────────────
const RealDate = Date;
function frozenDate(nowMs) {
  const D = function (...a) { return a.length ? new RealDate(...a) : new RealDate(nowMs); };
  D.now = () => nowMs; D.parse = RealDate.parse; D.UTC = RealDate.UTC; D.prototype = RealDate.prototype;
  return D;
}

// Creates one isolated "device/session". Every field of `state` is settable so a harness can replay
// any lifecycle: pre-hydration, hydrated, failed, anonymous, cross-device.
function newSession(opts) {
  opts = opts || {};
  const NOW = opts.now != null ? opts.now : 1_800_000_000_000;
  const store = {};                                  // localStorage shim (capital flows live here)
  const ctx = {
    console, Math, JSON, Array, Number, Object, Map, Set, String, Boolean, RegExp, Error,
    isFinite, isNaN, parseInt, parseFloat, Infinity, NaN, undefined,
    Date: frozenDate(NOW),
    // ── external boundary stubs (NOT part of the certified pipeline) ──
    toBase: v => v,                                  // FX: harness fixtures are already base currency
    localStorage: {
      getItem: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    // ── the persisted truth + lifecycle state the harness drives ──
    currentUser: opts.anonymous ? null : { id: opts.uid || 'user-replay-1', created_at: new RealDate(NOW - 400 * 864e5).toISOString() },
    categoryHistory: [],                             // local cache
    _aurixCanonicalCatHistory: null,                 // remote canonical (authed)
    _aurixBackendSnapshots: [],                      // server snapshots (async)
    _aurixBackendSnapshotsState: 'idle',
    _aurixRemoteLoadOutcome: 'ok-row',
    _aurixCanonicalHistoryLoaded: true,
    activeRange: '24h',
    activePerfMode: 'pct',
    // Frontera externa: el repintado real toca el DOM. Aquí sólo se CUENTA, que es exactamente lo
    // que hay que certificar del latch (¿dispara, y en qué estado del gate?).
    _aurixChartPublicationWasPending: false,
    __repaints: [],
    __store: store,
    __now: NOW,
  };
  ctx._aurixForceMergedChartRepaint = function () {
    ctx.__repaints.push(vm.runInContext('_aurixChartPublicationSourcesPending()', ctx));
  };
  vm.createContext(ctx);
  // dedupe: a multi-declarator statement (`const A = 1, B = 2;`) is the owner of several constants
  const seenStmt = new Set();
  const over = opts.constOverrides || {};
  for (const c of CONSTS) {
    // A rollback toggle can be forced to its OFF value so a harness can pin the defect the fix closed
    // (prove the test actually discriminates, instead of passing for an unrelated reason).
    if (Object.prototype.hasOwnProperty.call(over, c)) { vm.runInContext('const ' + c + ' = ' + over[c] + ';', ctx); continue; }
    const src = constSrc(c); if (seenStmt.has(src)) continue; seenStmt.add(src); vm.runInContext(src, ctx);
  }
  for (const f of FNS) vm.runInContext(fnSrc(f), ctx);
  return ctx;
}

// Set the frozen persisted financial truth for a session.
//  truth = { local:[{ts,total,real_estate?,source?}], remote:[…], backend:[…], flows:[…] }
function setTruth(ctx, truth) {
  truth = truth || {};
  ctx.categoryHistory = (truth.local || []).map(p => Object.assign({}, p));
  ctx._aurixCanonicalCatHistory = truth.remote ? truth.remote.map(p => Object.assign({}, p)) : null;
  ctx.__backendRows = (truth.backend || []).map(p => Object.assign({}, p));
  const key = vm.runInContext('_AURIX_CAPITAL_FLOWS_KEY', ctx);
  ctx.__store[key] = JSON.stringify(truth.flows || []);
}

// Lifecycle: how far the async source assembly has progressed for THIS build.
//  'pre'    → backend rows not loaded yet, hydration still in flight   (cycle 1)
//  'failed' → hydration gave up this cycle (flaky network)
//  'ready'  → backend rows landed                                     (cycle 2)
function setHydration(ctx, phase) {
  if (phase === 'ready') { ctx._aurixBackendSnapshots = ctx.__backendRows || []; ctx._aurixBackendSnapshotsState = 'ready'; }
  else if (phase === 'failed') { ctx._aurixBackendSnapshots = []; ctx._aurixBackendSnapshotsState = 'failed'; }
  else { ctx._aurixBackendSnapshots = []; ctx._aurixBackendSnapshotsState = phase === 'loading' ? 'loading' : 'idle'; }
}

// Flip the async source-assembly state INSIDE one live session. This is what a real re-entry does:
// the runtime is the same, only how much of the source set has arrived changes.
//  phase = { outcome, loaded, canon:bool, be:'idle'|'loading'|'failed'|'ready' }
function setPhase(ctx, phase, truth) {
  ctx._aurixCanonicalCatHistory = phase.canon ? (truth.remote || []).map(p => Object.assign({}, p)) : null;
  ctx._aurixRemoteLoadOutcome = phase.outcome;
  ctx._aurixCanonicalHistoryLoaded = phase.loaded;
  setHydration(ctx, phase.be);
}

const call = (ctx, expr) => vm.runInContext(expr, ctx);

// ── S0→S8 stage dump ─────────────────────────────────────────────────────────
// Each stage is the PRODUCTION function, invoked exactly as production invokes it.
function describe(arr, tsKey, vKey) {
  const a = Array.isArray(arr) ? arr : [];
  const ts = a.map(p => (p && (p[tsKey] != null ? p[tsKey] : p.ts != null ? p.ts : p.time))).filter(Number.isFinite);
  let largest = 0; for (let i = 1; i < ts.length; i++) largest = Math.max(largest, ts[i] - ts[i - 1]);
  const val = p => (p == null ? null : (p[vKey] != null ? p[vKey] : (p.total != null ? p.total : p.value)));
  const srcs = {}; a.forEach(p => { const s = (p && p.source) || 'frontend'; srcs[s] = (srcs[s] || 0) + 1; });
  return {
    count: a.length,
    firstTs: ts.length ? ts[0] : null, lastTs: ts.length ? ts[ts.length - 1] : null,
    firstValue: a.length ? val(a[0]) : null, lastValue: a.length ? val(a[a.length - 1]) : null,
    largestGapMs: largest, sources: srcs,
  };
}

function stages(ctx, range, surface) {
  surface = surface || 'desktop';
  ctx.activeRange = range;
  const out = {};
  const S0 = call(ctx, '_aurixHistorySourceForDisplay()');
  out.S0_source = describe(S0, 'ts', 'total');
  ctx.__s0 = S0;
  out.S1_trusted = describe(call(ctx, '_aurixTrustedChartSource(__s0)'), 'ts', 'total');
  ctx.__s1 = call(ctx, '_aurixTrustedChartSource(__s0)');
  out.S2_authority = describe(call(ctx, '_aurixApplyRangeSourceAuthority(__s1, ' + JSON.stringify(range) + ')'), 'ts', 'total');
  const hpq = call(ctx, '_aurixHpqRawStages(' + JSON.stringify(range) + ')');
  out.S3_validated = describe(hpq && hpq.validated ? hpq.validated : (hpq && hpq.stages ? [] : []), 'ts', 'total');
  const bv = call(ctx, 'buildValidatedHistoricalSeries(' + JSON.stringify(range) + ')');
  out.S4_rangeClipped = describe(bv.rangeSeries, 'ts', 'total');
  out.S4_nowRef = bv.nowRef;
  const emg = call(ctx, 'buildProductionPortfolioChart(' + JSON.stringify(range) + ')');
  ctx.__emg = emg;
  out.S5_built = Object.assign(describe(emg.points, 'time', 'value'), {
    state: emg.state, reason: emg.reason, pendingReason: emg.pendingReason,
    chartHash: emg.chartHash, returnPct: emg.returnPct, coverageRatio: emg.coverageRatio,
  });
  const cont = call(ctx, '_aurixBuildContinuityValidatedSeries(__emg.points, ' + JSON.stringify(range) + ')');
  out.S6_continuity = {
    segments: (cont.segments || []).length, continuityState: cont.continuityState,
    realGapCount: cont.realGapCount, realGapFloorMs: cont.realGapFloorMs,
    coverageRatio: cont.coverageRatio, displayedRangeState: cont.displayedRangeState,
    badgeEligibility: cont.badgeEligibility, syntheticPoints: cont.syntheticPoints,
    reasonCodes: cont.reasonCodes,
  };
  let frc = null;
  try { frc = call(ctx, '_aurixResolveFinalRenderSeriesContract(__emg, ' + JSON.stringify(range) + ', ' + JSON.stringify(surface) + ')'); } catch (e) { frc = { error: String(e.message) }; }
  out.S7_plotted = Object.assign(describe(frc && frc.renderPoints, 'time', 'value'), {
    mode: frc && frc.mode, state: frc && frc.state, reason: frc && frc.reason,
    colorState: frc && frc.colorState, badgeEligible: frc && frc.badgeEligible,
    historyPresentationState: frc && frc.historyPresentationState,
    segments: frc && frc.diagnostics ? frc.diagnostics.segmentCount : null,
    syntheticPoints: frc && frc.diagnostics ? frc.diagnostics.syntheticPoints : null,
  });
  const pend = call(ctx, '_aurixChartPublicationSourcesPending()');
  out.S8_publication = {
    pending: pend.pending, reason: pend.reason,
    // production's own definitive-escape predicate (_wscPaintEmergency:37872-37877)
    definitiveEscape: !!(emg.state === 'ready' && frc && frc.badgeEligible),
    returnPct: emg.returnPct, badgeEligible: frc && frc.badgeEligible,
  };
  out.__frc = frc; out.__emg = emg; out.__cont = cont;
  return out;
}

// The published ChartSeries identity: what the user actually ends up seeing.
// Mirrors _wscPaintEmergency's decision (hold vs LKG vs publish) without touching the DOM.
function publishedSeries(ctx, range, surface) {
  const st = stages(ctx, range, surface);
  const pend = st.S8_publication;
  let published;
  // Espejo de _wscPaintEmergency: mientras el conjunto de fuentes esté pendiente NO se publica un build
  // fresco (BLOCK-B puede republicar un LKG ya certificado, que no se modela aquí porque es un frame
  // anterior, no una serie nueva). `assertNoDefinitiveEscape()` fija este espejo contra app.js.
  if (pend.pending) published = { kind: 'HELD', series: null };
  else if (st.S7_plotted.mode === 'building' || st.S7_plotted.mode === 'empty' || st.S7_plotted.mode === 'error' || !(st.S7_plotted.count >= 2)) published = { kind: 'BUILDING', series: null };
  else published = {
    kind: 'PUBLISHED',
    series: {
      points: (st.__frc.renderPoints || []).map(p => [p.time, +Number(p.value).toFixed(6)]),
      segments: st.S6_continuity.segments,
      continuityState: st.S6_continuity.continuityState,
      range: range,
      firstTs: st.S7_plotted.firstTs, lastTs: st.S7_plotted.lastTs,
      returnPct: st.__emg.returnPct,
      baselineTs: st.__emg.baselineTs, currentTs: st.__emg.currentTs,
      badgeEligible: !!st.S7_plotted.badgeEligible,
      colorState: st.S7_plotted.colorState,
      syntheticPoints: st.S7_plotted.syntheticPoints || 0,
    },
  };
  published.hash = require('crypto').createHash('sha1').update(JSON.stringify(published.kind === 'PUBLISHED' ? published.series : published.kind)).digest('hex').slice(0, 16);
  published.stages = st;
  return published;
}

// Fija el espejo de `publishedSeries` contra el código real: si alguien reintroduce una puerta de
// escape que publique con fuentes pendientes, el modelo dejaría de describir producción y estos
// harnesses pasarían certificando algo que ya no existe. Devuelve la lista de infracciones.
function assertNoDefinitiveEscape() {
  const out = [];
  for (const [name, needle] of [['desktop', '_definitive'], ['mobile', '_definitiveM']]) {
    // el identificador sólo puede sobrevivir dentro de un comentario que documente su retirada
    const hits = APP.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => l.includes(needle) && !/^\s*(\/\/|\*)/.test(l));
    if (hits.length) out.push(name + ' @ ' + hits.map(h => h[0]).join(','));
  }
  const gate = fnSrc('_aurixChartPublicationSourcesPending');
  if (!/outcome === 'failed'/.test(gate)) out.push('canonical failed leg missing from the gate');
  return out;
}

module.exports = { assertNoDefinitiveEscape, newSession, setTruth, setHydration, setPhase, stages, publishedSeries, call, describe, fnSrc, constSrc, ROOT };
