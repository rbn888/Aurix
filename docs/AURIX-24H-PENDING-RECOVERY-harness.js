'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-24H-PENDING-RECOVERY-harness — SPEC DSH.PERF.24H_PENDING_RECOVERY
// ════════════════════════════════════════════════════════════════════════════
// P0 (post-v654 QA FAIL). The account still showed "Historial parcial" with a fully drawn 24H chart.
// PROVEN OWNER: canDisplayCanonicalReturn computed its two evidence facts from DIFFERENT sources —
//   baselineSnapshotId ← _aurixRangeReturn ← _aurixInvestableSnapshots ← _aurixHistorySourceForDisplay
//                        (canonical ∪ BACKEND snapshots)                          ⇒ set, valid
//   chartReady         ← _aurixCanonicalCatHistory.length >= 2  (canonical ONLY)  ⇒ false
// An account whose history lives in portfolio_snapshots (server-side */15) with a sparse remote
// category_history therefore produced: 80-point series, _aurixRangeReturn valid +1.0863%, and
// chartReady false ⇒ 'no_chart' ⇒ 'awaiting_canonical_history' ⇒ the candidate PERSISTS pending ⇒ the
// reader finds pct null ⇒ pending forever. Measured on the real chain: 0 or 1 canonical rows never
// recover, 2 rows recover instantly, on an IDENTICAL visible series.
//
// THE CRITICAL CONTRACT: PENDING → evidence becomes valid → MUST RECOVER TO READY.
//
// This harness drives the REAL chain end to end (no re-implementation):
//   _aurixHistorySourceForDisplay → _aurixInvestableSnapshots → _aurixEligibleInvestableSeries
//   → _aurixRangeReturn → canDisplayCanonicalReturn → getValidReturnBaseline → sanity
//   → _aurixComputePerformanceStateCandidate → (verify-read) → monotonic guard → selector → badge owner.
// Parity, loaded/storeOk, epoch/reset, thresholds, _aurixRangeReturn and the Chart Engine are untouched
// and asserted so.
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

const MIN = 60e3, HOUR = 36e5;
const NOW = 1_800_000_000_000;
const SIM = { now: NOW };
class FakeDate extends Date { constructor(...a) { if (!a.length) super(SIM.now); else super(...a); } static now() { return SIM.now; } }

// ── shared mutable world ────────────────────────────────────────────────────
const W = { ledger: [], live: 0, epoch: 0, resetAt: 0 };
const CONSTS = ['_AURIX_CAT_BUCKETS', '_WSC_INTERNAL_KINDS', '_AURIX_RETURN_MIN_HISTORY_MS', '_AURIX_RETURN_FLOW_DOMINANCE',
  '_AURIX_RETURN_ESTABLISHED_FRAC', '_AURIX_RETURN_STABLE_STEP', '_AURIX_RETURN_COMPARABLE_RATIO', '_AURIX_CANONICAL_TAIL_MS',
  '_AURIX_PERF_INVESTABLE_UNIT_REFERENCE', '_AURIX_PERF_STATE_24H_MONOTONIC', '_AURIX_24H_TRANSIENT_PENDING_CAUSES',
  '_AURIX_LIVE_DATA_REVISION_REASONS', '_AURIX_BACKEND_SNAPSHOTS_ENABLED', '_AURIX_BACKEND_SNAPSHOTS_AUTOLOAD',
  '_AURIX_PARITY_GATE_COUNTS_BACKEND_EVIDENCE', '_AURIX_SNAP_NEAR_MS', '_AURIX_SNAP_NEAR_FRAC', '_AURIX_SNAP_FE_AUTHORITY_MS',
  '_AURIX_PERF_SANITY_PCT_TOL', '_AURIX_PERF_SANITY_VALUE_REL_TOL', '_AURIX_PERF_SANITY_VALUE_ABS_TOL',
  '_AURIX_PERF_STATE_MAX_AGE_MS', '_AURIX_PERF_RANGE_WINDOW_MS'];
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

// ── the account: created 20h ago, history lives in BACKEND snapshots (*/15) ──
const CREATE = NOW - 20 * HOUR;
const vAt = t => 6000 * (1 + 0.011 * ((t - CREATE) / (20 * HOUR)));
const backendRows = () => { const o = []; for (let t = CREATE; t <= NOW - 6 * MIN; t += 15 * MIN) o.push({ ts: t, total: +vAt(t).toFixed(2), real_estate: 0, source: 'backend_snapshot' }); return o; };
// real category_history rows carry per-bucket values that must sum to total (_aurixCategoryPointValid)
const catRows = n => { const o = []; for (let i = 0; i < n; i++) { const t = NOW - (n - 1 - i) * 12 * MIN - 6 * MIN; const v = +vAt(t).toFixed(2); o.push({ ts: t, total: v, crypto: v, real_estate: 0 }); } return o; };
const PENDING_PS = () => ({ userId: 'u1', lifecycleId: 'L1', portfolioRevision: 11, calculatedAt: NOW - 40 * MIN,
  byRange: { '24h': { baselineSnapshotId: CREATE, baselineValue: 6000, displayedReturnPct: null, displayedReturnValue: null,
    displayedColor: 'pending', returnState: 'pending_baseline', sanityFailureReason: null,
    invalidReason: 'awaiting_canonical_history', chartSeriesHash: 'h', performanceHash: 'p-pend' } } });

// Drive one full recompute cycle from a PERSISTED pending state. Returns every stage verdict.
function cycle(ctx, opts) {
  opts = opts || {};
  W.ledger = []; W.epoch = opts.epoch || 0; W.resetAt = opts.resetAt || 0;
  ctx._aurixBackendSnapshots = opts.backend === false ? [] : backendRows();
  ctx.categoryHistory = opts.localCache || [];
  ctx._aurixCanonicalHistoryLoaded = opts.loaded === false ? false : true;
  if (opts.storeNull) { ctx._aurixCanonicalCatHistory = null; ctx._aurixRemoteCanonicalHash = null; ctx._aurixLocalCanonicalHash = null; }
  else {
    ctx.__cat = catRows(opts.catRows || 0);
    ctx._aurixCanonicalCatHistory = run(ctx, '_mergeCategoryByTs([], __cat)');
    ctx._aurixRemoteCanonicalHash = run(ctx, '_aurixCanonicalBodyHash(_aurixCanonicalCatHistory)');
    ctx._aurixLocalCanonicalHash = ctx._aurixRemoteCanonicalHash;
  }
  ctx._aurixRemotePerformanceState = PENDING_PS();
  const src = run(ctx, '_aurixHistorySourceForDisplay()') || [];
  const valid = src.filter(p => p && Number.isFinite(p.ts)).sort((a, b) => a.ts - b.ts);
  W.live = valid.length ? (Number(valid[valid.length - 1].total) - (Number(valid[valid.length - 1].real_estate) || 0)) : 0;

  const R = run(ctx, "_aurixRangeReturn('24h')");
  const disp = run(ctx, "canDisplayCanonicalReturn('24h')");
  const g = run(ctx, "getValidReturnBaseline('24h', { raw: true })");
  const sane = run(ctx, "_aurixPerformanceSanityCheck('24h')");
  const cand = run(ctx, '_aurixComputePerformanceStateCandidate()');
  const candRow = cand && cand.byRange && cand.byRange['24h'];
  ctx.__next = JSON.parse(JSON.stringify(cand)); ctx.__prev = ctx._aurixRemotePerformanceState;
  const adopted = run(ctx, "_aurix24hMonotonicPublication(__next, __prev, 'remote_adoption')");
  ctx._aurixRemotePerformanceState = adopted.ps;
  const badge = run(ctx, "getValidReturnBaseline('24h')");
  // fedEvidence = the confirmed-remote rows actually injected. Flag-agnostic on purpose: the OFF build
  // reports backendEvidenceCount 0 by design, so the incoherence signature must be measured from the input.
  const fedEvidence = (ctx._aurixCanonicalCatHistory || []).length + (ctx._aurixBackendSnapshots || []).length;
  return { srcCount: src.length, R, disp, g, sane, candRow, adopted, badge, fedEvidence,
    storePresent: Array.isArray(ctx._aurixCanonicalCatHistory),
    recovered: badge.valid === true && Number.isFinite(badge.deltaPct) };
}

const CTX = buildCtx();

console.log('AURIX-24H-PENDING-RECOVERY — SPEC DSH.PERF.24H_PENDING_RECOVERY');
console.log('flag: parityGateCountsBackendEvidence=' + run(CTX, '_AURIX_PARITY_GATE_COUNTS_BACKEND_EVIDENCE') + '\n');

// ── R1 — PENDING persisted + valid BACKEND-ONLY history → MUST RECOVER TO READY ──
console.log('R1) PENDING persisted + valid backend-only history → recovers to READY:');
const r1 = cycle(CTX, { catRows: 0 });
ok('R1.1 the 24H series exists and is drawable (>=2 pts)', r1.srcCount >= 2, 'src=' + r1.srcCount);
ok('R1.2 _aurixRangeReturn is valid on that series', r1.R.valid === true && Number.isFinite(r1.R.deltaPct), JSON.stringify({ v: r1.R.valid, p: r1.R.deltaPct }));
ok('R1.3 parity gate no longer blocks on no_chart', r1.disp.ok === true && r1.disp.reason === 'remote_confirmed', r1.disp.reason);
ok('R1.4 getValidReturnBaseline(raw) is valid', r1.g.valid === true && r1.g.invalidReason == null, r1.g.invalidReason);
ok('R1.5 sanity lock passes', r1.sane.sanityPassed === true, r1.sane.sanityFailureReason);
ok('R1.6 the candidate publishes a finite % (pending → ready)', r1.candRow && r1.candRow.returnState === 'ready' && Number.isFinite(r1.candRow.displayedReturnPct), JSON.stringify(r1.candRow && { s: r1.candRow.returnState, p: r1.candRow.displayedReturnPct }));
ok('R1.7 BADGE RECOVERS to a finite return', r1.recovered === true, r1.badge.invalidReason + ' pct=' + r1.badge.deltaPct);

// ── R2 — the published % comes from _aurixRangeReturn, never synthesised ──
console.log('\nR2) the published % is _aurixRangeReturn.deltaPct — no synthetic value:');
ok('R2.1 candidate % === _aurixRangeReturn.deltaPct', r1.candRow.displayedReturnPct === r1.R.deltaPct, r1.R.deltaPct + ' vs ' + r1.candRow.displayedReturnPct);
ok('R2.2 badge % === _aurixRangeReturn.deltaPct', r1.badge.deltaPct === r1.R.deltaPct, r1.R.deltaPct + ' vs ' + r1.badge.deltaPct);
ok('R2.3 baseline is a real point of the series, not invented', Number.isFinite(r1.g.baselineTs) && r1.g.baselineValue > 0 && r1.g.baselineTs === r1.R.baselineTs);
// prev is PENDING, so the guard exits at its first check ('no_previous_ready') — either way it must NOT preserve
ok('R2.4 the preserved-pending row was NOT resurrected as the answer',
  r1.adopted.preserved === false && Number.isFinite(r1.adopted.ps.byRange['24h'].displayedReturnPct), r1.adopted.reason);
ok('R2.5 % is not the stale persisted value (that one was null)', r1.badge.deltaPct !== null);

// ── R3 — local cache only stays blocked (parity intact) ──
console.log('\nR3) local cache only (no canonical store, no backend) → still blocked:');
const r3 = cycle(CTX, { storeNull: true, backend: false, localCache: catRows(40) });
ok('R3.1 parity gate blocks', r3.disp.ok === false, r3.disp.reason);
ok('R3.2 reason is a store/parity reason, not no_chart', r3.disp.reason === 'no_remote_store' || r3.disp.reason === 'no_remote_hash', r3.disp.reason);
ok('R3.3 badge stays pending', r3.recovered === false && r3.badge.deltaPct === null, r3.badge.invalidReason);
// empty canonical store + NO backend + a 40-row LOCAL cache: the local rows are never counted as evidence,
// so the ordered predicates block upstream (no_baseline fires before no_chart — the series itself is empty).
const r3b = cycle(CTX, { catRows: 0, backend: false, localCache: catRows(40) });
ok('R3.4 local cache never counted as evidence', r3b.disp.ok === false
  && r3b.disp.canonicalEvidenceCount === 0 && r3b.disp.backendEvidenceCount === 0
  && ['no_baseline', 'no_chart'].indexOf(r3b.disp.reason) >= 0,
  r3b.disp.reason + ' canon=' + r3b.disp.canonicalEvidenceCount + ' be=' + r3b.disp.backendEvidenceCount);
ok('R3.5 and the badge stays pending', r3b.recovered === false);

// ── R4 — canonicalHistoryLoaded === false stays blocked ──
console.log('\nR4) _aurixCanonicalHistoryLoaded=false → still blocked:');
const r4 = cycle(CTX, { catRows: 0, loaded: false });
ok('R4.1 blocks with remote_not_loaded', r4.disp.ok === false && r4.disp.reason === 'remote_not_loaded', r4.disp.reason);
ok('R4.2 backend evidence does NOT bypass the loaded gate', r4.recovered === false && r4.badge.deltaPct === null, r4.badge.invalidReason);

// ── R5 — pre-reset / epoch after the series stays blocked ──
console.log('\nR5) pre-reset / epoch newer than the whole series → still blocked:');
const r5 = cycle(CTX, { catRows: 0, epoch: NOW - 2 * MIN, resetAt: NOW - 2 * MIN });
ok('R5.1 the epoch empties the return series (applied to the MERGED source too)', r5.R.valid === false || r5.R.points < 2, JSON.stringify({ v: r5.R.valid, n: r5.R.points }));
ok('R5.2 parity gate blocks', r5.disp.ok === false, r5.disp.reason);
ok('R5.3 badge stays pending — no pre-reset return published', r5.recovered === false && r5.badge.deltaPct === null, r5.badge.invalidReason);

// ── R6 — flag OFF reproduces the prior behaviour verbatim ──
console.log('\nR6) flag OFF ⇒ prior behaviour verbatim (the defect reappears):');
const OFF = buildCtx({ _AURIX_PARITY_GATE_COUNTS_BACKEND_EVIDENCE: false });
const r6 = cycle(OFF, { catRows: 0 });
ok('R6.1 chartReady false again on the SAME evidence', r6.disp.chartReady === false && r6.disp.reason === 'no_chart', r6.disp.reason);
ok('R6.2 getValidReturnBaseline back to awaiting_canonical_history', r6.g.invalidReason === 'awaiting_canonical_history', r6.g.invalidReason);
ok('R6.3 badge stuck pending (this is the bug, reproduced)', r6.recovered === false);
const r6b = cycle(OFF, { catRows: 2 });
ok('R6.4 flag OFF still recovers with >=2 canonical rows (pre-fix behaviour preserved)', r6b.recovered === true, r6b.badge.invalidReason);

// ── R7 — chartReady and baselineSnapshotId use coherent evidence ──
console.log('\nR7) chartReady and baselineSnapshotId derive from coherent evidence:');
ok('R7.1 backend-only: baselineSnapshotId set AND chartReady true (was set/false)',
  r1.disp.baselineSnapshotId != null && r1.disp.chartReady === true,
  JSON.stringify({ b: r1.disp.baselineSnapshotId != null, c: r1.disp.chartReady }));
ok('R7.2 the counted evidence matches the series the return consumed',
  (r1.disp.canonicalEvidenceCount + r1.disp.backendEvidenceCount) >= 2 && r1.R.points >= 2,
  JSON.stringify({ canon: r1.disp.canonicalEvidenceCount, be: r1.disp.backendEvidenceCount, retPts: r1.R.points }));
// Scoped to CONFIRMED-REMOTE evidence. When the canonical store is null the display source legitimately
// falls back to the LOCAL cache, and a valid baseline with chartReady=false is then the parity gate doing
// its job (r3) — not the incoherence. The defect was: store present, remote evidence sufficient, return
// valid, yet chartReady false. That is what must never happen again.
const REMOTE_STATES = [r1, r3b, r4, r5];
const incoherent = x => x.storePresent && x.fedEvidence >= 2 && x.R.valid === true && x.disp.chartReady === false;
ok('R7.3 no confirmed-remote state has valid evidence with chartReady=false',
  REMOTE_STATES.every(x => !incoherent(x)),
  JSON.stringify(REMOTE_STATES.map(x => ({ ev: x.fedEvidence, c: x.disp.chartReady, v: x.R.valid }))));
ok('R7.3b and the OFF context DOES exhibit it (the invariant is the defect signature)', incoherent(r6),
  JSON.stringify({ fed: r6.fedEvidence, gateCounted: r6.disp.canonicalEvidenceCount + r6.disp.backendEvidenceCount, c: r6.disp.chartReady, v: r6.R.valid }));
ok('R7.4 canonical-only path unchanged (>=2 canonical rows still ready)', cycle(CTX, { catRows: 2 }).recovered === true);
ok('R7.5 threshold is still exactly 2', /\)\s*>=\s*2;/.test(fnSrc('canDisplayCanonicalReturn')));

// ── scope containment ───────────────────────────────────────────────────────
console.log('\nS) scope containment:');
ok('S1 loaded / storeOk predicates untouched',
  /if \(!loaded\)/.test(fnSrc('canDisplayCanonicalReturn')) && /else if \(!storeOk\)/.test(fnSrc('canDisplayCanonicalReturn')));
ok('S2 hash-parity predicates untouched',
  /out\.appliedHistoryHash !== out\.remoteHistoryHash/.test(fnSrc('canDisplayCanonicalReturn')));
ok('S3 the LOCAL cache is never counted as evidence',
  fnSrc('canDisplayCanonicalReturn').indexOf('categoryHistory.length') < 0);
ok('S4 _aurixRangeReturn body carries no SPEC gate', fnSrc('_aurixRangeReturn').indexOf('24H_PENDING_RECOVERY') < 0);
ok('S5 v654 monotonic guard intact', run(CTX, '_AURIX_PERF_STATE_24H_MONOTONIC') === true && typeof run(CTX, '_aurix24hMonotonicPublication') === 'function');
ok('S6 v654 unit reference intact', run(CTX, '_AURIX_PERF_INVESTABLE_UNIT_REFERENCE') === true);
ok('S7 no return threshold moved', run(CTX, 'JSON.stringify(_AURIX_RETURN_COMPARABLE_RATIO)') === JSON.stringify({ '24h': 1.20, '7d': 1.35, '30d': 1.75, '1y': 3.00, 'all': 3.00 })
  && run(CTX, '_AURIX_RETURN_MIN_HISTORY_MS') === 90 * 1000 && run(CTX, '_AURIX_RETURN_FLOW_DOMINANCE') === 0.5);

console.log('\n' + (fail === 0 ? 'GATE GO' : 'GATE NO-GO') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
