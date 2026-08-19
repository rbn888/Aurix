'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-24H-PUBLICATION-NON-REGRESSION-harness — SPEC DSH.PERF.24H_PUBLICATION_NON_REGRESSION
// ════════════════════════════════════════════════════════════════════════════
// P0. A NEW account published its 24H return, then degraded to "Calculando…" and stayed in
// "Historial parcial" for >10 min with no financial change. TWO proven owners, both fixed here:
//
// L1 UNIT COHERENCE — every canonical return series is INVESTABLE wealth (total − real_estate), but
//   getValidReturnBaseline (_baselineRatio ≤ _AURIX_RETURN_COMPARABLE_RATIO) and
//   _aurixPerformanceSanityCheck (chartMatchesCurrentValue) compared it against totalValueBase()
//   (TOTAL net worth). A real-estate holder could therefore NEVER publish a return: reproduced at
//   baseline 6000.57 vs currentValue 10060 ⇒ ratio 1.6765 > 1.20 ⇒ permanent pending_baseline, while
//   _aurixRangeReturn itself returned a valid +0.9464%. Both gates now read _aurixLiveReturnReferenceValue().
//
// L2 MONOTONIC PUBLICATION — the visible 24H comes ONLY from performance_state.byRange['24h'].
//   Both owners that assign it (the persisted candidate + the remote adoption in _mergeRemoteState)
//   had no monotonicity rule, so a recompute pending for a TRANSIENT cause (canonical lag, hydration
//   in flight, no comparable baseline yet) overwrote READY, the writer adopted its own payload back
//   and the % vanished durably. READY → PENDING now requires demonstrated invalidating evidence.
//
// This harness loads the REAL production gates + the REAL guard (no re-implementation).
// Thresholds, coverage, the trim, source authority and the Chart Engine are untouched and asserted so.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function fnSrc(n) {
  const i = app.indexOf('function ' + n + '(');
  if (i < 0) throw new Error('missing fn ' + n);
  let k = app.indexOf('{', i), d = 0;
  for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } }
  return app.slice(i, k);
}
// Robust for object AND array literals (the legacy brace-only slicer breaks on `const X = [ ... ];`).
function konstSrc(n) {
  const m = new RegExp('const ' + n + '\\s*=\\s*').exec(app);
  if (!m) throw new Error('missing const ' + n);
  const eq = m.index + m[0].length, f = app[eq];
  if (f === '{' || f === '[') {
    let d = 0, k = eq;
    for (; k < app.length; k++) { const c = app[k]; if (c === '{' || c === '[') d++; else if (c === '}' || c === ']') { d--; if (!d) { k++; break; } } }
    const s = app.indexOf(';', k); return app.slice(m.index, s + 1);
  }
  const s = app.indexOf(';', eq); return app.slice(m.index, s + 1);
}

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const MIN = 60e3, HOUR = 36e5;
const NOW = 1_800_000_000_000;
const SIM = { now: NOW };
class FakeDate extends Date { constructor(...a) { if (!a.length) super(SIM.now); else super(...a); } static now() { return SIM.now; } }

// ── sandbox: the REAL badge/publication chain ────────────────────────────────
let HIST = [], LEDGER = [], LIVE_TOTAL = 0, LIVE_INVESTABLE = 0, REV_INFO = { localRevisionReason: 'snapshot', hasRealUnsyncedHoldingsMutation: false };
const CONSTS = ['_WSC_INTERNAL_KINDS', '_AURIX_RETURN_MIN_HISTORY_MS', '_AURIX_RETURN_FLOW_DOMINANCE', '_AURIX_RETURN_ESTABLISHED_FRAC',
  '_AURIX_RETURN_STABLE_STEP', '_AURIX_RETURN_COMPARABLE_RATIO', '_AURIX_CANONICAL_TAIL_MS',
  '_AURIX_PERF_INVESTABLE_UNIT_REFERENCE', '_AURIX_PERF_STATE_24H_MONOTONIC', '_AURIX_24H_TRANSIENT_PENDING_CAUSES',
  '_AURIX_LIVE_DATA_REVISION_REASONS'];
const FNS = ['_aurixLiveReturnReferenceValue', '_aurixFlowIsInternal', '_aurixPointValuationIncomplete',
  '_aurixInvestableSnapshots', '_aurixEligibleInvestableSeries', '_aurixFlowNeutralize', '_aurixRangeReturn',
  '_aurixPortfolioCreatedAt', '_aurixReturnSnapshotStats', '_aurixPostConstructionBaseline', 'getValidReturnBaseline',
  '_aurix24hRowIsReady', '_aurix24hRowOf', '_aurix24hMonotonicPublication'];
// A rollback flag is a `const` in app.js, so it cannot be reassigned inside a live context: the OFF
// variants get their OWN context built from the SAME production source with the literal overridden.
// That keeps "flag OFF ⇒ prior behaviour verbatim" an assertion about the real code, not about a stub.
function buildCtx(overrides) {
  overrides = overrides || {};
  const ctx = {
    console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date: FakeDate, Map, Set, Object,
    isNaN, parseInt, parseFloat, String, RegExp, Boolean, Error,
    toBase: v => v,
    _aurixLoadCapitalFlows: () => LEDGER,
    _aurixHistorySourceForDisplay: () => HIST,
    categoryHistory: [],
    _aurixPortfolioEpoch: () => 0,
    _aurixResetAt: () => 0,
    totalValueBase: () => LIVE_TOTAL,
    investableValueBase: () => LIVE_INVESTABLE,
    _aurixLocalRevisionInfo: () => REV_INFO,
    canDisplayCanonicalReturn: () => ({ ok: true, reason: 'harness', baselineSource: 'remote', chartSource: 'remote', returnSource: 'remote', pendingLocalOnlyCount: 0 }),
    currentUser: null,               // no _aurixRemotePerformanceForRange loaded ⇒ local/raw path (= writer candidate)
    activeRange: '24h',
  };
  vm.createContext(ctx);
  CONSTS.forEach(c => {
    try {
      let src = konstSrc(c);
      if (Object.prototype.hasOwnProperty.call(overrides, c)) src = 'const ' + c + ' = ' + JSON.stringify(overrides[c]) + ';';
      vm.runInContext(src, ctx);
    } catch (e) { console.log('  (const load fail ' + c + ': ' + e.message.slice(0, 60) + ')'); }
  });
  FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (e) { console.log('  (fn load fail ' + f + ': ' + e.message.slice(0, 60) + ')'); } });
  return ctx;
}
const PS = buildCtx();

const gate = (ctx) => vm.runInContext("getValidReturnBaseline('24h', { raw: true })", ctx || PS);
const liveRef = (ctx) => vm.runInContext('_aurixLiveReturnReferenceValue()', ctx || PS);
const guard = (next, prev, src, ctx) => { const c = ctx || PS; c.__n = next; c.__p = prev; c.__s = src || 'test'; return vm.runInContext('_aurix24hMonotonicPublication(__n, __p, __s)', c); };
const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= (tol == null ? 0.01 : tol);

// ── canonical-series builder: one economic history, parameterised ────────────
const CREATE = NOW - 14 * HOUR;                 // account created yesterday evening
function canon(lastTs, stepMin, realEstate) {
  const o = [];
  for (let t = CREATE; t <= lastTs; t += stepMin * MIN) {
    const inv = (t < CREATE + 22 * MIN) ? 2400 : 6000 * (1 + 0.01 * ((t - CREATE - 22 * MIN) / (14 * HOUR)));
    o.push({ ts: t, total: +(inv + (realEstate || 0)).toFixed(2), real_estate: (realEstate || 0) });
  }
  return o;
}
const ADD_LEDGER = [{ ts: CREATE + 22 * MIN, amountUSD: 3600, kind: 'asset_add' }];
function setState(realEstate, stepMin, lastAgoMin) {
  LEDGER = ADD_LEDGER;
  HIST = canon(NOW - (lastAgoMin == null ? 5 : lastAgoMin) * MIN, stepMin == null ? 15 : stepMin, realEstate || 0);
  const lastInv = HIST[HIST.length - 1].total - (realEstate || 0);
  LIVE_INVESTABLE = lastInv;
  LIVE_TOTAL = lastInv + (realEstate || 0);
}

// ── performance_state fixtures ───────────────────────────────────────────────
const READY_ROW = { baselineSnapshotId: CREATE + 30 * MIN, baselineValue: 6000.57, displayedReturnPct: 0.9464,
  displayedReturnValue: 56.79, displayedColor: 'green', returnState: 'ready', sanityFailureReason: null,
  invalidReason: null, chartSeriesHash: 'h-ready', performanceHash: 'p-ready' };
const psReady = (rev, life) => ({ userId: 'u1', lifecycleId: life || 'L1', portfolioRevision: rev == null ? 10 : rev,
  calculatedAt: NOW - 9 * HOUR, byRange: { '24h': READY_ROW, '7d': { displayedReturnPct: 1.1, returnState: 'ready', performanceHash: 'p7' } } });
const pendRow = (cause, viaSanity) => (viaSanity
  ? { baselineSnapshotId: CREATE, baselineValue: 6000.57, displayedReturnPct: null, displayedReturnValue: null,
      displayedColor: 'pending', returnState: 'pending_sanity', sanityFailureReason: cause, invalidReason: null,
      chartSeriesHash: 'h-p', performanceHash: 'p-pend' }
  : { baselineSnapshotId: CREATE, baselineValue: 6000.57, displayedReturnPct: null, displayedReturnValue: null,
      displayedColor: 'pending', returnState: 'pending_baseline', sanityFailureReason: null, invalidReason: cause,
      chartSeriesHash: 'h-p', performanceHash: 'p-pend' });
const psPending = (cause, opts) => { opts = opts || {}; return { userId: opts.userId || 'u1', lifecycleId: opts.lifecycleId || 'L1',
  portfolioRevision: opts.rev == null ? 10 : opts.rev, calculatedAt: NOW,
  byRange: { '24h': pendRow(cause, opts.viaSanity), '7d': { displayedReturnPct: 1.2, returnState: 'ready', performanceHash: 'p7b' } } }; };

console.log('AURIX-24H-PUBLICATION-NON-REGRESSION — SPEC DSH.PERF.24H_PUBLICATION_NON_REGRESSION');
console.log('flags: investableUnitRef=' + vm.runInContext('_AURIX_PERF_INVESTABLE_UNIT_REFERENCE', PS)
  + '  monotonic24h=' + vm.runInContext('_AURIX_PERF_STATE_24H_MONOTONIC', PS) + '\n');

// ── A) READY → recompute pending por canonical lag → conserva READY ──────────
console.log('A) READY → pending (canonical lag) → preserves READY:');
{
  REV_INFO = { localRevisionReason: 'snapshot', hasRealUnsyncedHoldingsMutation: false };
  const prev = psReady(), next = psPending('baseline_not_comparable');
  const r = guard(next, prev, 'local_candidate');
  ok('A1 preserved', r.preserved === true, r.reason);
  ok('A2 24H row is READY again', r.ps.byRange['24h'].displayedReturnPct === 0.9464, JSON.stringify(r.ps.byRange['24h']));
  ok('A3 carried forward VERBATIM (same object, not re-derived)', r.ps.byRange['24h'] === READY_ROW);
  ok('A4 provenance preserved, NOT re-dated', r.ps.monotonic24h.preservedFromCalculatedAt === prev.calculatedAt
    && r.ps.monotonic24h.preservedPerformanceHash === 'p-ready', JSON.stringify(r.ps.monotonic24h));
  ok('A5 other ranges untouched (7D takes the NEW value)', r.ps.byRange['7d'].displayedReturnPct === 1.2);
  ok('A6 inputs never mutated', prev.byRange['24h'].displayedReturnPct === 0.9464 && next.byRange['24h'].displayedReturnPct === null);
  ok('A7 same for chart_current_mismatch (sanity path)', guard(psPending('chart_current_mismatch', { viaSanity: true }), prev).preserved === true);
  ok('A8 same for awaiting_canonical_history', guard(psPending('awaiting_canonical_history'), prev).preserved === true);
  ok('A9 same for a MISSING 24H entry', guard({ userId: 'u1', lifecycleId: 'L1', portfolioRevision: 10, calculatedAt: NOW, byRange: {} }, prev).preserved === true);
  ok('A10 live-data revision bump does not demote', guard(psPending('baseline_not_comparable', { rev: 14 }), prev).preserved === true);
}

// ── B) READY → nueva mutación REAL de holdings → puede dejar READY ───────────
console.log('\nB) READY → pending + REAL holdings mutation → demotion ALLOWED:');
{
  REV_INFO = { localRevisionReason: 'assets', hasRealUnsyncedHoldingsMutation: true };
  const prev = psReady(10);
  const r = guard(psPending('baseline_not_comparable', { rev: 11 }), prev);
  ok('B1 not preserved', r.preserved === false, r.reason);
  ok('B2 reason names the real mutation', r.reason === 'real_holdings_mutation', r.reason);
  ok('B3 24H is pending', r.ps.byRange['24h'].displayedReturnPct === null);
  const r2 = guard(psPending('baseline_not_comparable', { lifecycleId: 'L2' }), prev);
  ok('B4 lifecycle change (reset) demotes', r2.preserved === false && r2.reason === 'lifecycle_changed', r2.reason);
  const r3 = guard(psPending('baseline_not_comparable', { userId: 'u2' }), prev);
  ok('B5 different user demotes', r3.preserved === false && r3.reason === 'user_changed', r3.reason);
  REV_INFO = { localRevisionReason: 'snapshot', hasRealUnsyncedHoldingsMutation: false };
  ok('B6 same revision bump WITHOUT real mutation preserves', guard(psPending('baseline_not_comparable', { rev: 11 }), prev).preserved === true);
}

// ── C) READY → baseline realmente inválido en la MISMA unidad → puede dejar READY ──
console.log('\nC) READY → demonstrated maths failure on the SAME unit → demotion ALLOWED:');
{
  REV_INFO = { localRevisionReason: 'snapshot', hasRealUnsyncedHoldingsMutation: false };
  const prev = psReady();
  ['pct_value_baseline_incoherent', 'return_unexplained_by_baseline_current_flows', 'absurd_return_no_flows',
   'series_out_of_range', 'stale_calculated_at'].forEach(c => {
    const r = guard(psPending(c, { viaSanity: true }), prev);
    ok('C ' + c + ' demotes', r.preserved === false && r.reason === 'invalidating_cause:' + c, r.reason);
  });
  const r = guard(psPending('pre_reset'), prev);
  ok('C pre_reset demotes', r.preserved === false && r.reason === 'invalidating_cause:pre_reset', r.reason);
  const r2 = guard(psPending('some_future_unknown_failure'), prev);
  ok('C unknown cause demotes (fail-closed: never a stale % on unknown evidence)', r2.preserved === false, r2.reason);
}

// ── D) real estate mueve totalValueBase pero NO investableValueBase → no degrada ──
console.log('\nD) real estate changes totalValueBase but not investableValueBase → 24H must NOT degrade:');
{
  setState(0);
  const noRe = gate();
  const refNoRe = liveRef();
  ok('D1 baseline: no real estate → READY', noRe.valid === true && Number.isFinite(noRe.deltaPct), noRe.invalidReason);
  setState(4000);                                     // +4000 property: total 10060, investable 6060
  const withRe = gate();
  const refRe = liveRef();
  ok('D2 live reference is INVESTABLE, not TOTAL', near(refRe, refNoRe) && !near(refRe, vm.runInContext('totalValueBase()', PS), 1),
    'ref=' + refRe + ' total=' + vm.runInContext('totalValueBase()', PS));
  ok('D3 still READY with real estate held', withRe.valid === true, withRe.invalidReason);
  ok('D4 identical % — real estate is not performance', withRe.deltaPct === noRe.deltaPct, noRe.deltaPct + ' vs ' + withRe.deltaPct);
  ok('D5 comparability ratio unchanged by the property',
    Math.abs(withRe.baselineValue / refRe - noRe.baselineValue / refNoRe) < 1e-9);
  // the pre-fix reference would have failed: prove the defect is real, not hypothetical
  const ratioVsTotal = Math.max(withRe.baselineValue / 10060, 10060 / withRe.baselineValue);
  ok('D6 pre-fix reference (TOTAL) would have breached the 1.20 limit',
    ratioVsTotal > vm.runInContext("_AURIX_RETURN_COMPARABLE_RATIO['24h']", PS), 'ratio=' + ratioVsTotal.toFixed(4));
  ok('D7 threshold itself untouched', vm.runInContext("_AURIX_RETURN_COMPARABLE_RATIO['24h']", PS) === 1.20);
}

// ── E) hydration / densificación sin cambio económico → no degrada ───────────
// Two distinct claims, asserted separately and honestly:
//  E1–E4  STRICT: hydration that fills LATER gaps (a backend */15 tail arriving after the first
//         comparable sample) is a strict superset that cannot move the baseline ⇒ bit-identical %.
//  E5–E7  MATERIAL: densifying ACROSS the construction boundary legitimately lands an earlier first
//         comparable sample, so the % may move microscopically. The contract is "must not DEGRADE"
//         (never READY → pending, never a sign flip), not bit-identity — bit-identity under
//         densification is the Chart Engine's separately certified trim property, not this gate's.
console.log('\nE) hydration / densification with NO economic change → no degradation:');
{
  const vAt = t => (t < CREATE + 22 * MIN) ? 2400 : 6000 * (1 + 0.01 * ((t - CREATE - 22 * MIN) / (14 * HOUR)));
  const sparse = canon(NOW - 5 * MIN, 15, 0);
  // strict superset: extra points ONLY after the first comparable sample ⇒ baseline cannot move
  const extra = [];
  for (let i = 0; i < sparse.length - 1; i++) {
    const mid = Math.round((sparse[i].ts + sparse[i + 1].ts) / 2);
    if (mid > CREATE + 45 * MIN) extra.push({ ts: mid, total: +vAt(mid).toFixed(2), real_estate: 0 });
  }
  LEDGER = ADD_LEDGER;
  HIST = sparse.slice(); LIVE_INVESTABLE = LIVE_TOTAL = sparse[sparse.length - 1].total;
  const pre = gate();
  HIST = sparse.concat(extra).sort((a, b) => a.ts - b.ts);
  const post = gate();
  ok('E1 pre-hydration READY', pre.valid === true, pre.invalidReason);
  ok('E2 post-hydration still READY', post.valid === true, post.invalidReason);
  ok('E3 strict superset ⇒ identical baseline', post.baselineValue === pre.baselineValue, pre.baselineValue + ' vs ' + post.baselineValue);
  ok('E4 strict superset ⇒ identical %', post.deltaPct === pre.deltaPct, pre.deltaPct + ' vs ' + post.deltaPct);
  setState(0, 15);
  const s15 = gate();
  setState(0, 3);                                     // 5× denser ACROSS the construction boundary
  const s3 = gate();
  ok('E5 5× densification does not degrade READY', s15.valid === true && s3.valid === true, s15.invalidReason + ' / ' + s3.invalidReason);
  ok('E6 % stays materially identical (<=0.05pp) and keeps its sign',
    near(s3.deltaPct, s15.deltaPct, 0.05) && Math.sign(s3.deltaPct) === Math.sign(s15.deltaPct), s15.deltaPct + ' vs ' + s3.deltaPct);
  setState(4000, 3);                                  // densified AND real estate held
  const both = gate();
  ok('E7 densified + real estate still READY', both.valid === true && near(both.deltaPct, s3.deltaPct, 1e-9), both.invalidReason);
  // guard is a strict no-op when the recompute is itself valid
  REV_INFO = { localRevisionReason: 'snapshot', hasRealUnsyncedHoldingsMutation: false };
  const nextReady = { userId: 'u1', lifecycleId: 'L1', portfolioRevision: 11, calculatedAt: NOW,
    byRange: { '24h': { displayedReturnPct: 0.9464, returnState: 'ready', performanceHash: 'p-new' } } };
  const g = guard(nextReady, psReady());
  ok('E8 guard is a no-op when the recompute is valid', g.preserved === false && g.reason === 'new_valid_computation' && g.ps === nextReady, g.reason);
}

// ── F) cuenta nueva sin READY previo y sin baseline suficiente → sigue pending ──
console.log('\nF) new account, NO previous READY, insufficient baseline → stays pending, never fabricates:');
{
  REV_INFO = { localRevisionReason: 'snapshot', hasRealUnsyncedHoldingsMutation: false };
  const r = guard(psPending('baseline_not_comparable'), null);
  ok('F1 no previous state → nothing to preserve', r.preserved === false && r.reason === 'no_pair', r.reason);
  const r2 = guard(psPending('baseline_not_comparable'), psPending('baseline_not_comparable'));
  ok('F2 previous was pending too → stays pending', r2.preserved === false && r2.reason === 'no_previous_ready', r2.reason);
  ok('F3 no % fabricated', r2.ps.byRange['24h'].displayedReturnPct === null && r2.ps.byRange['24h'].displayedReturnValue === null);
  // a genuinely too-short new account through the REAL gate
  LEDGER = ADD_LEDGER;
  HIST = [{ ts: NOW - 40 * 1000, total: 6000, real_estate: 0 }, { ts: NOW - 10 * 1000, total: 6010, real_estate: 0 }];
  LIVE_INVESTABLE = LIVE_TOTAL = 6010;
  const g = gate();
  ok('F4 30s of history → pending (min-history floor intact)', g.valid === false && g.invalidReason === 'insufficient_history', g.invalidReason);
  ok('F5 no % on the pending gate', g.deltaPct === null);
  // an unrecorded capital regime shift is still rejected on the SAME unit
  HIST = canon(NOW - 5 * MIN, 15, 0).concat([{ ts: NOW - 2 * MIN, total: 26000, real_estate: 0 }]);
  LIVE_INVESTABLE = LIVE_TOTAL = 26000; LEDGER = [];
  const g2 = gate();
  ok('F6 unrecorded 4× capital shift still rejected (gate not relaxed)', g2.valid === false, g2.invalidReason + ' pct=' + g2.deltaPct);
}

// ── G) cuando aparece una nueva baseline válida → publica normalmente ─────────
console.log('\nG) a new valid baseline appears → publishes the new % normally:');
{
  REV_INFO = { localRevisionReason: 'snapshot', hasRealUnsyncedHoldingsMutation: false };
  setState(0);
  const g = gate();
  ok('G1 real gate publishes', g.valid === true && Number.isFinite(g.deltaPct), g.invalidReason);
  // preserved-then-recovered: the guard must not pin the old value once a valid one exists
  const prev = psReady();
  const preserved = guard(psPending('baseline_not_comparable'), prev);
  ok('G2 preserved while lagging', preserved.preserved === true);
  const fresh = { userId: 'u1', lifecycleId: 'L1', portfolioRevision: 12, calculatedAt: NOW,
    byRange: { '24h': { displayedReturnPct: -0.4211, displayedReturnValue: -25.5, displayedColor: 'red', returnState: 'ready', performanceHash: 'p-fresh' } } };
  const after = guard(fresh, preserved.ps);
  ok('G3 the NEW % replaces the preserved one', after.preserved === false && after.ps.byRange['24h'].displayedReturnPct === -0.4211, after.reason);
  ok('G4 including a NEGATIVE return (no optimistic pinning)', after.ps.byRange['24h'].displayedColor === 'red');
  ok('G5 no monotonic stamp on a normal replacement', after.ps.monotonic24h == null);
}

// ── ROLLBACK + scope ────────────────────────────────────────────────────────
console.log('\nH) rollback flags + scope containment:');
{
  REV_INFO = { localRevisionReason: 'snapshot', hasRealUnsyncedHoldingsMutation: false };
  const OFF_MONO = buildCtx({ _AURIX_PERF_STATE_24H_MONOTONIC: false });
  const r = guard(psPending('baseline_not_comparable'), psReady(), 'test', OFF_MONO);
  ok('H1 monotonic flag OFF ⇒ prior behaviour verbatim',
    r.preserved === false && r.reason === 'flag_off' && r.ps.byRange['24h'].displayedReturnPct === null, r.reason);
  const OFF_UNIT = buildCtx({ _AURIX_PERF_INVESTABLE_UNIT_REFERENCE: false });
  setState(4000);
  const gOff = gate(OFF_UNIT);
  ok('H2 unit flag OFF ⇒ the original defect reappears (the flag is the only switch)',
    gOff.valid === false && gOff.invalidReason === 'baseline_not_comparable', gOff.invalidReason);
  ok('H3 unit flag ON ⇒ READY on the same data', gate().valid === true, gate().invalidReason);
  ok('H4 guard touches ONLY the 24h key', (function () {
    const prev = psReady(), next = psPending('baseline_not_comparable');
    const r2 = guard(next, prev);
    return r2.ps.byRange['7d'] === next.byRange['7d'] && Object.keys(r2.ps.byRange).length === Object.keys(next.byRange).length;
  })());
  ok('H5 no threshold moved', vm.runInContext('JSON.stringify(_AURIX_RETURN_COMPARABLE_RATIO)', PS)
    === JSON.stringify({ '24h': 1.20, '7d': 1.35, '30d': 1.75, '1y': 3.00, 'all': 3.00 }));
  ok('H6 min-history floor unchanged', vm.runInContext('_AURIX_RETURN_MIN_HISTORY_MS', PS) === 90 * 1000);
  ok('H7 flow-dominance unchanged', vm.runInContext('_AURIX_RETURN_FLOW_DOMINANCE', PS) === 0.5);
  ok('H8 established-frac + stable-step unchanged',
    vm.runInContext('_AURIX_RETURN_ESTABLISHED_FRAC', PS) === 0.80 && vm.runInContext('_AURIX_RETURN_STABLE_STEP', PS) === 0.40);
}

console.log('\n' + (fail === 0 ? 'GATE GO' : 'GATE NO-GO') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
