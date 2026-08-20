'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-WN12-BOUNDED-RANGE-SPAN-GUARD-harness — SPEC DSH.PERF.WN12_BOUNDED_RANGE_SPAN_GUARD
// ════════════════════════════════════════════════════════════════════════════
// PROVEN DEFECT (probe on the real chain, appjs 619 / v655): WN.12 — the COSMETIC lead-in trim inside
// _aurixEligibleInvestableSeries — was redefining the FINANCIAL window of a BOUNDED range, because
// _aurixRangeReturn reads the SAME series. Backend snapshots */15 over 20 h + N frontend
// `category_history` rows: the ±60 min frontend-authority merge opens a ~2 h hole in the uniform grid;
// WN.12 measures curvature as an UN-normalised second difference of VALUE, so that single large-Δt step
// becomes sdMax (3.3 vs a 0.01 median) ⇒ thr = 0.20·sdMax sits above the whole genuine curvature ⇒ the
// walk runs to its cap (m−3) ⇒ 77 pts / 19.9 h collapse to 4 pts / 1.65 h and the "24H" badge publishes
// +0.0899 instead of +1.0863. ONE frontend row flipped it, so the published % was a function of how many
// frontend rows existed, not of the 24 h window.
//
// THE CONTRACT: on a bounded range (24h/7d/30d/1y) a cosmetic trim may never cost more than
// 1 − _AURIX_WN12_MIN_SPAN_RETENTION (= 20 %) of the available temporal span. The floor is DERIVED from
// the adopted coverage contract (_AURIX_24H_COVERAGE_THR = 0.8 / coverageRatio < 0.8 ⇒
// historyTooShortForRange / 'partial_history' / badgeEligibility 'calculating'), not tuned.
//
// Drives the REAL chain (no re-implementation): _aurixHistorySourceForDisplay →
// _aurixInvestableSnapshots → _aurixEligibleInvestableSeries → _aurixRangeReturn →
// getValidReturnBaseline → sanity → _aurixComputePerformanceStateCandidate → badge owner.
// The merge / ±60 min frontend authority, _aurixRangeReturn, the return thresholds, the v654/v655
// publication state and the Chart Engine are UNTOUCHED and asserted so.
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

const MIN = 60e3, HOUR = 36e5, SEC = 1000;
const NOW = 1_800_000_000_000;
const SIM = { now: NOW };
class FakeDate extends Date { constructor(...a) { if (!a.length) super(SIM.now); else super(...a); } static now() { return SIM.now; } }

const W = { ledger: [], live: 0, epoch: 0, resetAt: 0 };
const CONSTS = ['_AURIX_CAT_BUCKETS', '_WSC_INTERNAL_KINDS', '_AURIX_RETURN_MIN_HISTORY_MS', '_AURIX_RETURN_FLOW_DOMINANCE',
  '_AURIX_RETURN_ESTABLISHED_FRAC', '_AURIX_RETURN_STABLE_STEP', '_AURIX_RETURN_COMPARABLE_RATIO', '_AURIX_CANONICAL_TAIL_MS',
  '_AURIX_PERF_INVESTABLE_UNIT_REFERENCE', '_AURIX_PERF_STATE_24H_MONOTONIC', '_AURIX_24H_TRANSIENT_PENDING_CAUSES',
  '_AURIX_LIVE_DATA_REVISION_REASONS', '_AURIX_BACKEND_SNAPSHOTS_ENABLED', '_AURIX_BACKEND_SNAPSHOTS_AUTOLOAD',
  '_AURIX_PARITY_GATE_COUNTS_BACKEND_EVIDENCE', '_AURIX_SNAP_NEAR_MS', '_AURIX_SNAP_NEAR_FRAC', '_AURIX_SNAP_FE_AUTHORITY_MS',
  '_AURIX_PERF_SANITY_PCT_TOL', '_AURIX_PERF_SANITY_VALUE_REL_TOL', '_AURIX_PERF_SANITY_VALUE_ABS_TOL',
  '_AURIX_PERF_STATE_MAX_AGE_MS', '_AURIX_PERF_RANGE_WINDOW_MS', '_AURIX_24H_COVERAGE_THR',
  '_AURIX_WN12_BOUNDED_RANGE_SPAN_GUARD', '_AURIX_WN12_MIN_SPAN_RETENTION', '_AURIX_WN12_BOUNDED_RANGES'];
const FNS = ['_aurixCategoryPointValid', '_aurixFilterAfterEpoch', '_aurixCanonicalBodyHash', '_mergeCategoryByTs',
  '_aurixNormalizeBackendSnapshot', '_aurixMergeSnapshotSources', '_aurixHistorySourceForDisplay', '_aurixHistoryHash',
  '_aurixPendingSync', '_aurixCurrentUserId', '_aurixCurrentLifecycleId', '_aurixCurrentRevision',
  '_aurixSelectRemotePerformance', '_aurixRemotePerformanceForRange', '_aurixFlowIsInternal', '_aurixPointValuationIncomplete',
  '_aurixInvestableSnapshots', '_aurixEligibleInvestableSeries', '_aurixFlowNeutralize', '_aurixRangeReturn',
  '_aurixPortfolioCreatedAt', '_aurixReturnSnapshotStats', '_aurixPostConstructionBaseline', 'canDisplayCanonicalReturn',
  '_aurixLiveReturnReferenceValue', 'getValidReturnBaseline', '_aurixSeriesWithinRange', '_aurixPerformanceSanityCheck',
  '_aurixCanonicalPerformance', '_aurixComputePerformanceStateCandidate', '_aurix24hRowIsReady', '_aurix24hRowOf',
  '_aurix24hMonotonicPublication'];

// Rollback flags are `const` in app.js, so the OFF variant needs its OWN context built from the SAME
// production source with the literal overridden — the assertion then covers the real code, not a stub.
function buildCtx(overrides) {
  overrides = overrides || {};
  const ctx = {
    console: { log() {}, error() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date: FakeDate, Map, Set,
    Object, isNaN, parseInt, parseFloat, String, RegExp, Boolean, Error,
    toBase: v => v,
    _aurixLoadCapitalFlows: () => W.ledger,
    totalValueBase: () => W.live,
    investableValueBase: () => W.live,
    _aurixPortfolioEpoch: () => W.epoch,
    _aurixResetAt: () => W.resetAt,
    _aurixLifecycleId: () => 'L1',
    _aurixPortfolioRevision: () => 12,
    _aurixReadPortfolioMeta: () => ({ version: 12, updatedAt: NOW - 3 * MIN, syncedAt: NOW - 3 * MIN }),
    _aurixLocalRevisionInfo: () => ({ localRevisionReason: 'snapshot', hasRealUnsyncedHoldingsMutation: false }),
    currentUser: { id: 'u1' }, _aurixActiveUserId: 'u1', activeRange: '24h',
    categoryHistory: [],
    _aurixCanonicalCatHistory: null, _aurixCanonicalHistoryLoaded: true,
    _aurixRemoteCanonicalHash: null, _aurixLocalCanonicalHash: null,
    _aurixBackendSnapshots: [], _aurixRemotePerformanceState: null,
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
const run = (ctx, expr) => vm.runInContext(expr, ctx);

// ── FIXTURE 1 (the defect): account created 20 h ago, history in BACKEND snapshots (*/15) ──
const CREATE = NOW - 20 * HOUR;
const vAt = t => 6000 * (1 + 0.011 * ((t - CREATE) / (20 * HOUR)));          // +1.1 % over 20 h, smooth, no flows
const backendRows = () => { const o = []; for (let t = CREATE; t <= NOW - 6 * MIN; t += 15 * MIN) o.push({ ts: t, total: +vAt(t).toFixed(2), real_estate: 0, source: 'backend_snapshot' }); return o; };
// frontend/remote category_history rows on the SAME economic history (per-bucket values must sum to total)
const catRows = n => { const o = []; for (let i = 0; i < n; i++) { const t = NOW - (n - 1 - i) * 12 * MIN - 6 * MIN; const v = +vAt(t).toFixed(2); o.push({ ts: t, total: v, crypto: v, real_estate: 0 }); } return o; };

// ── FIXTURE 2 (legitimate WN.12 work): a DENSE, STEEP-BUT-STRAIGHT onboarding construction ramp
// (30 s cadence, 20 min, 5200 → 6000) ahead of the */15 history — exactly WN.12's documented target
// ("even a steep-but-straight ramp is caught"). MANY points, LITTLE span ⇒ retention ≈ 0.98 ⇒ the trim
// MUST still apply. Steps are ~0.36 % so the merge's own backend near-dup collapse (5 min / 0.2 %,
// untouched here) does not thin them.
const LEAD_START = CREATE - 20 * MIN;
const LEAD_N = 40;
const denseLeadInRows = () => {
  const o = [];
  for (let i = 0; i < LEAD_N; i++) o.push({ ts: LEAD_START + i * 30 * SEC, total: +(5200 + (800 * i / LEAD_N)).toFixed(2), real_estate: 0, source: 'backend_snapshot' });
  return o.concat(backendRows());
};

const hSpan = ms => +(ms / HOUR).toFixed(2);

// One full cycle over the real chain. `range` selects the window; nothing else changes.
function cycle(ctx, opts) {
  opts = opts || {};
  const range = opts.range || '24h';
  W.ledger = []; W.epoch = 0; W.resetAt = 0;
  ctx._aurixBackendSnapshots = (opts.backend || backendRows)();
  ctx.categoryHistory = [];
  ctx._aurixCanonicalHistoryLoaded = true;
  ctx.__cat = catRows(opts.catRows || 0);
  ctx._aurixCanonicalCatHistory = run(ctx, '_mergeCategoryByTs([], __cat)');
  ctx._aurixRemoteCanonicalHash = run(ctx, '_aurixCanonicalBodyHash(_aurixCanonicalCatHistory)');
  ctx._aurixLocalCanonicalHash = ctx._aurixRemoteCanonicalHash;
  ctx._aurixRemotePerformanceState = null;
  ctx.activeRange = range;

  const src = (run(ctx, '_aurixHistorySourceForDisplay()') || []).filter(p => p && Number.isFinite(p.ts)).sort((a, b) => a.ts - b.ts);
  W.live = src.length ? (Number(src[src.length - 1].total) - (Number(src[src.length - 1].real_estate) || 0)) : 0;

  ctx.__rg = range;
  const raw  = run(ctx, '_aurixInvestableSnapshots(__rg)');
  const elig = run(ctx, '_aurixEligibleInvestableSeries(__rg)');
  const R    = run(ctx, '_aurixRangeReturn(__rg)');
  const s = elig.series;
  const rawSpan  = raw.length >= 2 ? raw[raw.length - 1].ts - raw[0].ts : 0;
  const eligSpan = s.length >= 2 ? s[s.length - 1].ts - s[0].ts : 0;

  // the badge owner, only meaningful for the published range 24H
  let cand = null, row = null, badge = null;
  if (range === '24h') {
    cand = run(ctx, '_aurixComputePerformanceStateCandidate()');
    row = cand && cand.byRange && cand.byRange['24h'];
    ctx.__next = JSON.parse(JSON.stringify(cand)); ctx.__prev = null;
    const adopted = run(ctx, "_aurix24hMonotonicPublication(__next, __prev, 'remote_adoption')");
    ctx._aurixRemotePerformanceState = adopted.ps;
    badge = run(ctx, "getValidReturnBaseline('24h')");
  }
  return {
    src, raw, elig, R, row, badge,
    rawPts: raw.length, rawSpanH: hSpan(rawSpan),
    eligPts: s.length, eligSpanH: hSpan(eligSpan),
    trimApplied: !!elig.meta.staleLeadInRemoved,
    trimmed: elig.meta.reasons.stale_low_information,
    guardBlocked: !!elig.meta.wn12SpanGuardBlocked,
    retention: elig.meta.wn12SpanRetention != null ? elig.meta.wn12SpanRetention : null,
    baselineAgeH: (R.baselineTs && R.lastTs) ? hSpan(R.lastTs - R.baselineTs) : null,
    deltaPct: R.deltaPct,
  };
}

const ON  = buildCtx();
const OFF = buildCtx({ _AURIX_WN12_BOUNDED_RANGE_SPAN_GUARD: false });

console.log('AURIX-WN12-BOUNDED-RANGE-SPAN-GUARD — SPEC DSH.PERF.WN12_BOUNDED_RANGE_SPAN_GUARD');
console.log('flag: wn12BoundedRangeSpanGuard=' + run(ON, '_AURIX_WN12_BOUNDED_RANGE_SPAN_GUARD') +
  '  minSpanRetention=' + run(ON, '_AURIX_WN12_MIN_SPAN_RETENTION') +
  '  bounded=' + JSON.stringify(Object.keys(run(ON, '_AURIX_WN12_BOUNDED_RANGES'))) + '\n');

// ── A) 24H, backend 20 h + 0 frontend rows → baseline ≈ the available window ──
console.log('A) 24H, backend 20h + 0 frontend rows → baseline == available window:');
const a = cycle(ON, { catRows: 0 });
ok('A.1 raw 24H window is the real ~20 h of history', a.rawPts >= 8 && a.rawSpanH >= 19.5, a.rawPts + 'pts/' + a.rawSpanH + 'h');
ok('A.2 no trim is proposed on a clean uniform series', a.trimApplied === false && a.guardBlocked === false);
ok('A.3 eligible span == raw span (nothing removed)', a.eligPts === a.rawPts && a.eligSpanH === a.rawSpanH, a.eligPts + '/' + a.eligSpanH);
ok('A.4 baseline age matches the available window', a.baselineAgeH >= 19.5, String(a.baselineAgeH));
ok('A.5 the return is the full-window one (+1.0863)', Math.abs(a.deltaPct - 1.0863) < 0.02, String(a.deltaPct));
const REF = a.deltaPct;

// ── B) same history + 1/2/3/5/8/12 frontend rows → the window (and the %) must not follow the row count ──
console.log('\nB) same economic history + N frontend rows → % is NOT a function of N:');
const B_N = [1, 2, 3, 5, 8, 12];
const bs = B_N.map(n => ({ n, r: cycle(ON, { catRows: n }) }));
bs.forEach(({ n, r }) => {
  ok('B.' + n + ' nCat=' + n + ': window stays ~20 h and % stays ~' + REF.toFixed(4) +
     '  [' + r.eligPts + 'pts/' + r.eligSpanH + 'h, baseline ' + r.baselineAgeH + 'h, ' + r.deltaPct + ']',
    r.eligSpanH >= 19.0 && r.baselineAgeH >= 19.0 && Math.abs(r.deltaPct - REF) <= 0.05,
    'span=' + r.eligSpanH + ' baseline=' + r.baselineAgeH + ' pct=' + r.deltaPct);
});
const pcts = [REF].concat(bs.map(x => x.r.deltaPct));
ok('B.spread the published % across 0..12 frontend rows spans <= 0.05 pp',
  (Math.max.apply(null, pcts) - Math.min.apply(null, pcts)) <= 0.05,
  JSON.stringify(pcts));
ok('B.guard the guard is what declined the trim (not an absent trim)',
  bs.every(x => x.r.guardBlocked === true && x.r.trimApplied === false));

// ── C) the exact reproduced defect 19.9 h → 1.65 h is blocked ──
console.log('\nC) the exact case 19.9h → 1.65h is BLOCKED:');
const c2 = cycle(ON, { catRows: 2 });
ok('C.1 the trim WOULD have collapsed the window (retention far below the floor)',
  c2.retention != null && c2.retention < 0.2, String(c2.retention));
ok('C.2 the guard declined it', c2.guardBlocked === true && c2.trimApplied === false && c2.trimmed === 0);
ok('C.3 the eligible series keeps the whole available window', c2.eligPts === c2.rawPts && c2.eligSpanH >= 19.0, c2.eligPts + '/' + c2.rawPts + ' ' + c2.eligSpanH + 'h');
ok('C.4 the baseline no longer measures ~1.65 h', c2.baselineAgeH >= 19.0, String(c2.baselineAgeH));
ok('C.5 the badge publishes the full-window % (not +0.0899)', Math.abs(c2.deltaPct - REF) <= 0.05 && Math.abs(c2.deltaPct - 0.0899) > 0.5, String(c2.deltaPct));

// ── D) WN.12 still trims a REAL dense low-information lead-in ──
console.log('\nD) WN.12 still trims a real dense construction ramp (retention stays coherent):');
const d = cycle(ON, { catRows: 0, backend: denseLeadInRows });
ok('D.1 the dense lead-in is present in the raw window', d.rawPts > 60, String(d.rawPts));
ok('D.2 the trim IS applied (guard did not block it)', d.trimApplied === true && d.guardBlocked === false, 'trimmed=' + d.trimmed + ' retention=' + d.retention);
ok('D.3 it removed points, not window', d.retention != null && d.retention >= 0.80 && d.eligPts < d.rawPts, 'retention=' + d.retention + ' ' + d.eligPts + '<' + d.rawPts);
ok('D.4 the surviving window is still the real ~20 h history', d.eligSpanH >= 19.5, String(d.eligSpanH));
ok('D.5 the construction ramp no longer owns the baseline', d.baselineAgeH >= 19.5 && d.baselineAgeH <= 20.4, String(d.baselineAgeH));

// ── E) ALL/TOTAL keeps WN.12 exactly as before ──
console.log('\nE) ALL/TOTAL behaviour is unchanged by the guard:');
const eOn  = cycle(ON,  { catRows: 2, range: 'all' });
const eOff = cycle(OFF, { catRows: 2, range: 'all' });
ok('E.1 ALL is not guarded', eOn.guardBlocked === false && eOn.retention == null);
ok('E.2 ALL still applies the WN.12 trim', eOn.trimApplied === true && eOn.trimmed > 0, 'trimmed=' + eOn.trimmed);
ok('E.3 ALL is byte-identical with the flag OFF',
  eOn.eligPts === eOff.eligPts && eOn.eligSpanH === eOff.eligSpanH && eOn.deltaPct === eOff.deltaPct && eOn.trimmed === eOff.trimmed,
  JSON.stringify({ on: [eOn.eligPts, eOn.deltaPct], off: [eOff.eligPts, eOff.deltaPct] }));
const dOn = cycle(ON, { catRows: 0, backend: denseLeadInRows, range: 'all' });
const dOff = cycle(OFF, { catRows: 0, backend: denseLeadInRows, range: 'all' });
ok('E.4 the legitimate dense-lead-in trim is identical ON/OFF on ALL', dOn.eligPts === dOff.eligPts && dOn.deltaPct === dOff.deltaPct);

// ── F) FLAG OFF reproduces the previous behaviour exactly (rollback safety) ──
console.log('\nF) FLAG OFF reproduces the previous (defective) behaviour:');
const fOff = cycle(OFF, { catRows: 2 });
ok('F.1 OFF: the trim collapses the series to 4 points', fOff.trimApplied === true && fOff.eligPts === 4, String(fOff.eligPts));
ok('F.2 OFF: the baseline measures ~1.65 h', fOff.baselineAgeH > 1.0 && fOff.baselineAgeH < 3.0, String(fOff.baselineAgeH));
ok('F.3 OFF: the badge publishes +0.0899', Math.abs(fOff.deltaPct - 0.0899) < 0.02, String(fOff.deltaPct));
ok('F.4 OFF: no guard metadata is emitted', fOff.guardBlocked === false && fOff.retention == null);
const fOff0 = cycle(OFF, { catRows: 0 });
ok('F.5 OFF: the 0-row case is identical ON/OFF (guard is a no-op where no trim fires)',
  fOff0.eligPts === a.eligPts && fOff0.deltaPct === a.deltaPct, fOff0.deltaPct + ' vs ' + a.deltaPct);
const dOff24 = cycle(OFF, { catRows: 0, backend: denseLeadInRows });
ok('F.6 OFF: the legitimate dense-lead-in trim is identical ON/OFF on 24H (guard changes only the defect)',
  dOff24.eligPts === d.eligPts && dOff24.deltaPct === d.deltaPct && dOff24.trimmed === d.trimmed,
  JSON.stringify({ on: [d.eligPts, d.deltaPct], off: [dOff24.eligPts, dOff24.deltaPct] }));

// ── G) no synthetic, interpolated or smoothed data ──
console.log('\nG) every published point is a REAL captured point:');
function realityCheck(r) {
  const key = new Set(r.raw.map(p => p.ts + '@' + p.value.toFixed(6)));
  const s = r.elig.series;
  const allReal = s.every(p => key.has(p.ts + '@' + p.value.toFixed(6)));
  const sorted = s.every((p, i) => i === 0 || p.ts > s[i - 1].ts);
  const rawTs = r.raw.map(p => p.ts), i0 = rawTs.indexOf(s.length ? s[0].ts : -1);
  const isSuffix = s.length > 0 && i0 >= 0 && s.every((p, i) => rawTs[i0 + i] === p.ts);   // a contiguous tail slice
  return { allReal, sorted, isSuffix, added: s.length > r.raw.length };
}
[['nCat=2 (guard blocked)', c2], ['nCat=0', a], ['dense lead-in (trim applied)', d]].forEach(([name, r]) => {
  const g = realityCheck(r);
  ok('G ' + name + ': subset of real captured points, ordered, no invented point',
    g.allReal && g.sorted && g.isSuffix && !g.added, JSON.stringify(g));
});

// ── H) the published % is _aurixRangeReturn.deltaPct — never synthesised ──
console.log('\nH) the badge % === _aurixRangeReturn.deltaPct:');
[['nCat=0', a], ['nCat=2', c2], ['nCat=8', bs.find(x => x.n === 8).r]].forEach(([name, r]) => {
  ok('H ' + name + ': candidate + badge % === _aurixRangeReturn.deltaPct',
    r.row && r.row.returnState === 'ready' && r.row.displayedReturnPct === r.deltaPct &&
    r.badge && r.badge.valid === true && r.badge.deltaPct === r.deltaPct,
    JSON.stringify({ R: r.deltaPct, cand: r.row && r.row.displayedReturnPct, badge: r.badge && r.badge.deltaPct, st: r.row && r.row.returnState }));
});

// ── I) blast radius: the SPEC's untouchable surfaces ──
console.log('\nI) blast radius — untouched surfaces:');
ok('I.1 the ±60 min frontend authority window is unchanged (60 min)', run(ON, '_AURIX_SNAP_FE_AUTHORITY_MS') === 60 * 60000);
ok('I.2 the merge still drops backend points near a frontend point (not disabled)',
  c2.src.filter(p => p.source === 'backend_snapshot').length < backendRows().length);
ok('I.3 return comparability thresholds unchanged', JSON.stringify(run(ON, '_AURIX_RETURN_COMPARABLE_RATIO')) === JSON.stringify({ '24h': 1.20, '7d': 1.35, '30d': 1.75, '1y': 3.00, 'all': 3.00 }));
ok('I.4 the retention floor is the adopted coverage boundary (0.8), not a tuned value',
  run(ON, '_AURIX_WN12_MIN_SPAN_RETENTION') === 0.80 && run(ON, '_AURIX_24H_COVERAGE_THR') === 0.8);
ok('I.5 _aurixRangeReturn source is untouched (no span/guard logic inside it)',
  !/WN12|SpanGuard|MIN_SPAN_RETENTION/.test(fnSrc('_aurixRangeReturn')));
const _eligSrc = fnSrc('_aurixEligibleInvestableSeries');
const _outsideOwner = app.split(_eligSrc).join('').replace(/^const _AURIX_WN12_.*$/gm, '');
ok('I.6 the guard lives ONLY inside _aurixEligibleInvestableSeries (+ its own const block)',
  /_AURIX_WN12_BOUNDED_RANGE_SPAN_GUARD/.test(_eligSrc) && !/_AURIX_WN12_BOUNDED_RANGE_SPAN_GUARD/.test(_outsideOwner));
ok('I.7 the guard predicate is a TIME span (densification-invariant, v652 trim determinism intact)',
  /_keptSpanMs\s*\/\s*_preSpanMs/.test(fnSrc('_aurixEligibleInvestableSeries')));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
