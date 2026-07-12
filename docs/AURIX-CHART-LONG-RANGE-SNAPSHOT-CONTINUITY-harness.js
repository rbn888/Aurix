'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-LONG-RANGE-SNAPSHOT-CONTINUITY-harness — SPEC DSH.CHART.LONG_RANGE_SNAPSHOT_CONTINUITY.37
// ════════════════════════════════════════════════════════════════════════════
// SPEC.37 forensics proved (against LIVE portfolio_snapshots) that the server series is clean: over 7 days /
// 2688 adjacent pairs there were only 5 jumps ≥1.5% — 3 real holdings edits + 2 genuine crypto stale→live
// moves — 0 same-minute conflicts, 0 revision/currency dimension, and the merge already enforces 60-min
// frontend authority (no fine-grained source alternation). So no valuation-regime defect is provable from
// reachable data. This ships the REQUIRED read-only browser audit (window.aurixAuditLongRangeSnapshotContinuity)
// so the displayed-series root cause can be proven on a real account (whose browser-local frontend points the
// server cannot reach). This harness proves the classifier (every SPEC transition type), every verdict path,
// and that the audit is strictly read-only: no mutation, deterministic, syntheticPoints 0, and NO change to
// the merge / FRC / render owners.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing ' + n); return braceSlice(app, i); }
function konstSrc(n) { const m = new RegExp('const ' + n + '\\s*=\\s*').exec(app); const eq = m.index + m[0].length; const s = app.indexOf(';', eq); return app.slice(m.index, s + 1); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const ctx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date, Object, String };
vm.createContext(ctx);
vm.runInContext(konstSrc('_AURIX_SNAPSHOT_JUMP_PCT'), ctx);
vm.runInContext(fnSrc('_aurixClassifySnapshotTransition'), ctx);
vm.runInContext(fnSrc('_aurixAuditLongRangeSnapshotContinuityCore'), ctx);
const G = n => vm.runInContext(n, ctx);
const classify = (a, b, o) => G('_aurixClassifySnapshotTransition')(a, b, o || {});
const core = (opts, deps) => G('_aurixAuditLongRangeSnapshotContinuityCore')(opts, deps);
const T0 = 1_800_000_000_000, MIN = 60000;
const P = (ts, v, over) => Object.assign({ ts: ts, value: v, real_estate: 0, asset_count: 5, source: 'frontend', market_state: 'open', price_staleness: 'live', catKeys: 'crypto,stock' }, over || {});

console.log('\nAURIX-CHART-LONG-RANGE-SNAPSHOT-CONTINUITY — SPEC.37');

// ── classifier: every SPEC transition type ──────────────────────────────────
ok('1 small move ⇒ ECONOMIC_MOVE_PLAUSIBLE', classify(P(T0, 1000), P(T0 + 15 * MIN, 1005)) === 'ECONOMIC_MOVE_PLAUSIBLE');
ok('2 asset_count change + jump ⇒ FLOW_OR_HOLDINGS_CHANGE', classify(P(T0, 1000, { asset_count: 16 }), P(T0 + 15 * MIN, 300, { asset_count: 7 })) === 'FLOW_OR_HOLDINGS_CHANGE');
ok('3 source flip + jump ⇒ SOURCE_VALUATION_REGIME_CHANGE', classify(P(T0, 1000, { source: 'frontend' }), P(T0 + 90 * MIN, 1050, { source: 'backend_snapshot' })) === 'SOURCE_VALUATION_REGIME_CHANGE');
ok('4 staleness flip + jump (same source) ⇒ STALE_TO_LIVE_PRICE_TRANSITION', classify(P(T0, 1000, { price_staleness: 'stale' }), P(T0 + 15 * MIN, 1050, { price_staleness: 'live' })) === 'STALE_TO_LIVE_PRICE_TRANSITION');
ok('5 real_estate toggle + jump ⇒ CATEGORY_COMPOSITION_DISCONTINUITY', classify(P(T0, 1000, { real_estate: 0 }), P(T0 + 15 * MIN, 1500, { real_estate: 500 })) === 'CATEGORY_COMPOSITION_DISCONTINUITY');
ok('6 category-keys change + jump ⇒ CATEGORY_COMPOSITION_DISCONTINUITY', classify(P(T0, 1000, { catKeys: 'crypto' }), P(T0 + 15 * MIN, 1200, { catKeys: 'crypto,stock' })) === 'CATEGORY_COMPOSITION_DISCONTINUITY');
ok('7 same minute, different value ⇒ DUPLICATE_TIME_DIFFERENT_VALUE', classify(P(T0, 1000), P(T0 + 5000, 1100)) === 'DUPLICATE_TIME_DIFFERENT_VALUE');
ok('8 jump within one regime/source/composition ⇒ UNKNOWN_DISCONTINUITY (genuine move)', classify(P(T0, 1000), P(T0 + 15 * MIN, 1100)) === 'UNKNOWN_DISCONTINUITY');

// ── helper: build a synthetic merged series + injected deps for the core ─────
function mkDeps(points) {
  const pts = points.map(p => ({ ts: p.ts, total: p.value, real_estate: p.real_estate || 0, asset_count: p.asset_count,
    source: p.source, market_state: p.market_state, price_staleness: p.price_staleness,
    category_values: (p.catKeys ? p.catKeys.split(',').reduce((o, k) => (o[k] = 1, o), {}) : {}) }));
  return {
    displaySource: () => pts,
    buildChart: r => ({ range: r, state: 'ready', points: points.map(p => ({ ts: p.ts, value: p.value })) }),
    resolveContract: (chart, r, s) => ({ renderPoints: points.map(p => ({ ts: p.ts, value: p.value })), diagnostics: { syntheticPoints: 0 } }),
  };
}
const seq = (specs) => specs.map((s, i) => P(T0 + i * 15 * MIN, s.v, s));

// ── 9 GENUINE_ECONOMIC_VOLATILITY (real-account shape: an edit + a market move, single source) ───
(function () {
  const pts = seq([{ v: 1000 }, { v: 1010 }, { v: 300, asset_count: 2 }, { v: 305 }, { v: 340 }]);   // edit (16→2 count via override) + moves
  pts[2].asset_count = 2; pts[0].asset_count = pts[1].asset_count = 6;
  const res = core({ ranges: ['7d'], include24hControl: false }, mkDeps(pts));
  ok('9 verdict GENUINE_ECONOMIC_VOLATILITY (edits+moves, no source alternation)', res.verdict === 'GENUINE_ECONOMIC_VOLATILITY', res.verdict + ' jumps=' + res.totalJumpCount);
})();

// ── 10 SOURCE_ALTERNATION_DEFECT_PROVEN (frontend↔backend jumps) ─────────────
(function () {
  const pts = seq([{ v: 1000, source: 'frontend' }, { v: 1080, source: 'backend_snapshot' }, { v: 1000, source: 'frontend' }, { v: 1085, source: 'backend_snapshot' }]);
  const res = core({ ranges: ['7d'], include24hControl: false }, mkDeps(pts));
  ok('10 verdict SOURCE_ALTERNATION_DEFECT_PROVEN', res.verdict === 'SOURCE_ALTERNATION_DEFECT_PROVEN', res.verdict);
  ok('10 defect recorded + sourceAlternationCount>0', res.defects.some(d => d.type === 'SOURCE_VALUATION_REGIME_CHANGE') && res.sourceAlternationCount > 0);
})();

// ── 11 SAME_MINUTE_CONFLICT_DEFECT_PROVEN ────────────────────────────────────
(function () {
  const pts = [P(T0, 1000), P(T0 + 4000, 1200), P(T0 + 15 * MIN, 1210)];   // 2nd within same minute, different value
  const res = core({ ranges: ['7d'], include24hControl: false }, mkDeps(pts));
  ok('11 verdict SAME_MINUTE_CONFLICT_DEFECT_PROVEN', res.verdict === 'SAME_MINUTE_CONFLICT_DEFECT_PROVEN', res.verdict);
})();

// ── 12 STABLE_CONTINUOUS_HISTORY (no jumps) ──────────────────────────────────
(function () {
  const pts = seq([{ v: 1000 }, { v: 1003 }, { v: 1005 }, { v: 1002 }, { v: 1006 }]);
  const res = core({ ranges: ['7d'], include24hControl: false }, mkDeps(pts));
  ok('12 verdict STABLE_CONTINUOUS_HISTORY (all sub-threshold)', res.verdict === 'STABLE_CONTINUOUS_HISTORY', res.verdict);
})();

// ── 13 VALUATION_REGIME_DEFECT_PROVEN (stale/live dominates jumps) ───────────
(function () {
  const pts = seq([
    { v: 1000, price_staleness: 'live' }, { v: 1060, price_staleness: 'stale' }, { v: 1000, price_staleness: 'live' },
    { v: 1055, price_staleness: 'stale' }, { v: 1000, price_staleness: 'live' }]);
  const res = core({ ranges: ['7d'], include24hControl: false }, mkDeps(pts));
  ok('13 verdict VALUATION_REGIME_DEFECT_PROVEN (stale/live regime dominates)', res.verdict === 'VALUATION_REGIME_DEFECT_PROVEN', res.verdict + ' staleLive=' + res.staleLiveAlternationCount);
})();

// ── 14 INSUFFICIENT_EVIDENCE (no data) ───────────────────────────────────────
(function () {
  const res = core({ ranges: ['7d'], include24hControl: false }, { displaySource: () => [], buildChart: () => ({ points: [] }), resolveContract: () => ({ renderPoints: [], diagnostics: { syntheticPoints: 0 } }) });
  ok('14 verdict INSUFFICIENT_EVIDENCE (no rendered points)', res.verdict === 'INSUFFICIENT_EVIDENCE', res.verdict);
})();

// ── 15 syntheticPoints always 0 ──────────────────────────────────────────────
(function () {
  const res = core({ ranges: ['7d', '30d'], include24hControl: true }, mkDeps(seq([{ v: 1000 }, { v: 1010 }, { v: 1020 }])));
  ok('15 totalSyntheticPoints 0', res.summary.totalSyntheticPoints === 0);
})();

// ── 16 no mutation of inputs ─────────────────────────────────────────────────
(function () {
  const pts = seq([{ v: 1000 }, { v: 1080 }, { v: 1000 }]); const deps = mkDeps(pts);
  const before = JSON.stringify(pts);
  core({ ranges: ['7d'], include24hControl: false }, deps);
  ok('16 input points not mutated', JSON.stringify(pts) === before);
})();

// ── 17 deterministic ─────────────────────────────────────────────────────────
(function () {
  const pts = seq([{ v: 1000 }, { v: 1080, source: 'backend_snapshot' }, { v: 1000 }]);
  const strip = o => { const c = JSON.parse(JSON.stringify(o)); delete c.startedAtIso; return c; };
  ok('17 deterministic same-input output', JSON.stringify(strip(core({ ranges: ['7d'], include24hControl: false }, mkDeps(pts)))) === JSON.stringify(strip(core({ ranges: ['7d'], include24hControl: false }, mkDeps(pts)))));
})();

// ── 18 read-only ─────────────────────────────────────────────────────────────
(function () {
  const res = core({ ranges: ['7d'], include24hControl: true }, mkDeps(seq([{ v: 1000 }, { v: 1010 }])));
  ok('18 behaviorChanged false + readOnly true', res.behaviorChanged === false && res.readOnly === true);
})();

// ── 19 required output fields present ────────────────────────────────────────
(function () {
  const res = core({ ranges: ['7d', '30d', '1y', 'all'], include24hControl: true }, mkDeps(seq([{ v: 1000 }, { v: 1010 }, { v: 1020 }])));
  const need = ['rootCause', 'perPointProvenance', 'adjacentTransitionMatrix', 'valuationRegimeCount', 'sourceAlternationCount',
    'staleLiveAlternationCount', 'compositionDiscontinuityCount', 'revisionMismatchCount', 'sameMinuteConflictCount',
    'genuineEconomicMoveCount', 'defects', 'suspects', 'summary', 'verdict'];
  ok('19 all required fields present', need.every(k => k in res), need.filter(k => !(k in res)).join(','));
  ok('19 24H control range included', res.ranges.indexOf('24h') >= 0);
  ok('19 perPointProvenance carries source/staleness/asset_count', Array.isArray(res.perPointProvenance['7d']) && 'source' in res.perPointProvenance['7d'][0] && 'price_staleness' in res.perPointProvenance['7d'][0]);
})();

// ── 20 marker + read-only owners untouched (no merge/FRC/render change) ──────
ok('20 SPEC.37 marker present', app.indexOf('DSH.CHART.LONG_RANGE_SNAPSHOT_CONTINUITY.37') >= 0);
ok('20 merge owner _aurixMergeSnapshotSources unchanged (single def, no SPEC.37 edit inside)', (app.match(/^function _aurixMergeSnapshotSources\(/gm) || []).length === 1 && !/_aurixMergeSnapshotSources[\s\S]{0,600}SPEC\.37/.test(app));
ok('20 FRC chokepoint single + no SPEC.37 gate added to it', (app.match(/^function _aurixResolveFinalRenderSeriesContract\(/gm) || []).length === 1 && !/_aurixResolveFinalRenderSeriesContract[\s\S]{0,4000}LONG_RANGE_SNAPSHOT_CONTINUITY/.test(app));
ok('20 single audit core owner', (app.match(/^function _aurixAuditLongRangeSnapshotContinuityCore\(/gm) || []).length === 1);

// ── 21 render owners untouched — SPEC.38 supersedes the SPEC.37-era "purely additive" guard ──
// SPEC.37 was read-only; SPEC.38 (ELIMINATE_SOURCE_ALTERNATION) now legitimately extends THIS audit core
// (segment-awareness) and fixes the render owner in the SOURCE-AUTHORITY function — NOT in the merge or the
// FRC. So the durable invariant is no longer "0 deletions in app.js", it is: the merge chokepoint
// (_aurixMergeSnapshotSources) and the FRC chokepoint stay single-owner and carry NO continuity/alternation
// gate, and the SPEC.38 render change lives ONLY in _aurixApplyRangeSourceAuthority / its segment helper.
(function () {
  const mergeSingle = (app.match(/^function _aurixMergeSnapshotSources\(/gm) || []).length === 1;
  const mergeNoGate = !/_aurixMergeSnapshotSources[\s\S]{0,700}(ELIMINATE_SOURCE_ALTERNATION|LONG_RANGE_SNAPSHOT_CONTINUITY)/.test(app);
  ok('21 merge owner still single + carries no audit/alternation gate (fix is NOT in the merge)', mergeSingle && mergeNoGate);
  const frcSingle = (app.match(/^function _aurixResolveFinalRenderSeriesContract\(/gm) || []).length === 1;
  const frcNoGate = !/_aurixResolveFinalRenderSeriesContract[\s\S]{0,4000}(LONG_RANGE_SNAPSHOT_CONTINUITY|ELIMINATE_SOURCE_ALTERNATION)/.test(app);
  ok('21 FRC chokepoint still single + no audit gate added', frcSingle && frcNoGate);
  ok('21 SPEC.38 render change is isolated to the source-authority owner', app.indexOf('function _aurixEnforceSegmentSourceAuthority(') >= 0 && app.indexOf('_AURIX_CHART_SEGMENT_SOURCE_AUTHORITY') >= 0);
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' SPEC.37 LONG-RANGE SNAPSHOT CONTINUITY — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
