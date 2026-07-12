'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-ELIMINATE-SOURCE-ALTERNATION-harness — SPEC DSH.CHART.ELIMINATE_SOURCE_ALTERNATION.38
// ════════════════════════════════════════════════════════════════════════════
// The LIVE founder audit proved SOURCE_ALTERNATION_DEFECT_PROVEN (sourceAlternationCount 183,
// valuationRegimeCount 3). ROOT CAUSE / OWNER: the range-aware source authority (_aurixApplyRangeSourceAuthority)
// only removed backend from 24H; on the LONG ranges the range-agnostic ±60min merge authority is far smaller
// than the engine real-gap floor (2d/7d/45d), so a backend gap-filler 60min–<floor from frontend survived
// INSIDE a continuous render segment ⇒ frontend↔backend valuation-regime alternation mid-segment.
// FIX (flag _AURIX_CHART_SEGMENT_SOURCE_AUTHORITY): every continuous segment (points whose gap < the engine
// real-gap floor — the SAME runs the renderer splits on) carries a SINGLE source family. A run with any
// frontend point ⇒ frontend authority (reject its backend interlopers); a backend-only run (older tail /
// genuine ≥floor hole) is kept whole and renders as its own honest segment. The audit is made segment-aware:
// a source change ACROSS a genuine structural break is a legitimate SEGMENT_BOUNDARY, never a within-segment
// alternation defect. This harness proves the authority filter, the segment-aware audit, the regression
// (fine-grained within-segment alternation STILL fails), and that 24H is byte-identical (untouched branch).
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing ' + n); return braceSlice(app, i); }
function konstSrc(n) { const m = new RegExp('const ' + n + '\\s*=\\s*').exec(app); if (!m) throw new Error('missing const ' + n); const eq = m.index + m[0].length; const s = app.indexOf(';', eq); return app.slice(m.index, s + 1); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const ctx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date, Object, String, Set };
vm.createContext(ctx);
// constants + helpers the fix depends on
['_AURIX_VP_GAP_FLOOR_MS', '_AURIX_VP_GAP_MEDIAN_MULT'].forEach(n => vm.runInContext(konstSrc(n), ctx));
vm.runInContext('const _AURIX_CHART_CONTINUITY_UNIFICATION = true;', ctx);
vm.runInContext(konstSrc('_AURIX_CHART_24H_FE_AUTHORITY'), ctx);
vm.runInContext(konstSrc('_AURIX_CHART_SEGMENT_SOURCE_AUTHORITY'), ctx);
vm.runInContext(konstSrc('_AURIX_SNAPSHOT_JUMP_PCT'), ctx);
vm.runInContext(fnSrc('_aurixRealGapFloorMs'), ctx);
vm.runInContext(fnSrc('_aurixSourceFamily'), ctx);
vm.runInContext(fnSrc('_aurixFrontendUsableInWindow'), ctx);
vm.runInContext(fnSrc('_aurixEnforceSegmentSourceAuthority'), ctx);
vm.runInContext(fnSrc('_aurixApplyRangeSourceAuthority'), ctx);
vm.runInContext(fnSrc('_aurixClassifySnapshotTransition'), ctx);
vm.runInContext(fnSrc('_aurixAuditLongRangeSnapshotContinuityCore'), ctx);
const G = n => vm.runInContext(n, ctx);
const authority = (src, r) => G('_aurixApplyRangeSourceAuthority')(src, r);
const enforce = (src, r) => G('_aurixEnforceSegmentSourceAuthority')(src, r);
const core = (opts, deps) => G('_aurixAuditLongRangeSnapshotContinuityCore')(opts, deps);

const DAY = 864e5, MIN = 60000, T0 = 1_800_000_000_000;
const fe = (ts, total, over) => Object.assign({ ts: ts, total: total, real_estate: 0, source: 'remote_canonical' }, over || {});
const be = (ts, total, over) => Object.assign({ ts: ts, total: total, real_estate: 0, source: 'backend_snapshot' }, over || {});

console.log('\nAURIX-CHART-ELIMINATE-SOURCE-ALTERNATION — SPEC.38');

// ── 1 flag present + default ON ──────────────────────────────────────────────
ok('1 flag _AURIX_CHART_SEGMENT_SOURCE_AUTHORITY defined + true', G('_AURIX_CHART_SEGMENT_SOURCE_AUTHORITY') === true);
ok('1 marker present in app.js', app.indexOf('ELIMINATE_SOURCE_ALTERNATION.38') >= 0);

// ── 2 interior backend inside a frontend segment (gaps < floor) ⇒ DROPPED ────
(function () {
  // 7d floor = 2d; points ~6h apart ⇒ one continuous segment. Backend interlopers must be rejected.
  const src = [fe(T0, 1000), be(T0 + 6 * 36e5, 1080), fe(T0 + 12 * 36e5, 1010), be(T0 + 18 * 36e5, 1075), fe(T0 + 24 * 36e5, 1015)];
  const outR = authority(src, '7d');
  ok('2 all backend interlopers dropped (frontend authority in a continuous segment)', outR.every(p => G('_aurixSourceFamily')(p) !== 'backend'), 'kept=' + outR.map(p => p.source).join(','));
  ok('2 all frontend points survive', outR.length === 3);
  ok('2 order preserved + ascending ts', outR.every((p, i) => i === 0 || p.ts > outR[i - 1].ts));
})();

// ── 3 backend-only run separated by a genuine ≥floor gap ⇒ KEPT whole ────────
(function () {
  // 7d floor = 2d. A backend-only historical tail 5 days before a frontend block ⇒ its own segment ⇒ kept.
  const src = [be(T0 - 6 * DAY, 900), be(T0 - 5.5 * DAY, 905), fe(T0, 1000), fe(T0 + 6 * 36e5, 1005), fe(T0 + 12 * 36e5, 1010)];
  const outR = authority(src, '7d');
  const keptBackend = outR.filter(p => G('_aurixSourceFamily')(p) === 'backend').length;
  ok('3 backend-only tail run kept (own segment, ≥floor from frontend)', keptBackend === 2, 'keptBackend=' + keptBackend);
  ok('3 frontend block also kept', outR.filter(p => G('_aurixSourceFamily')(p) !== 'backend').length === 3);
})();

// ── 4 mixed: interior backend dropped BUT genuine-gap backend kept ────────────
(function () {
  const src = [be(T0 - 10 * DAY, 800), be(T0 - 9.5 * DAY, 805),                 // backend tail (own segment) → kept
    fe(T0, 1000), be(T0 + 6 * 36e5, 1090), fe(T0 + 12 * 36e5, 1010)];           // interior backend → dropped
  const outR = authority(src, '7d');
  ok('4 interior backend dropped, tail backend kept', outR.filter(p => G('_aurixSourceFamily')(p) === 'backend').length === 2 && outR.length === 4);
})();

// ── 5 no backend ⇒ strict NO-OP (same array reference) ───────────────────────
(function () {
  const src = [fe(T0, 1000), fe(T0 + 6 * 36e5, 1010), fe(T0 + 12 * 36e5, 1005)];
  ok('5 no-backend src returned unchanged (identity)', authority(src, '30d') === src);
})();

// ── 6 flag OFF ⇒ long ranges return src unchanged (rollback) ─────────────────
(function () {
  vm.runInContext('_AURIX_CHART_SEGMENT_SOURCE_AUTHORITY_OFF_TEST = (function(){ var f=_AURIX_CHART_SEGMENT_SOURCE_AUTHORITY; return f; })();', ctx);
  // simulate OFF by calling the enforce path guard via a temp context clone
  const ctx2 = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date, Object, String, Set };
  vm.createContext(ctx2);
  ['_AURIX_VP_GAP_FLOOR_MS', '_AURIX_VP_GAP_MEDIAN_MULT'].forEach(n => vm.runInContext(konstSrc(n), ctx2));
  vm.runInContext('const _AURIX_CHART_24H_FE_AUTHORITY = true;', ctx2);
  vm.runInContext('const _AURIX_CHART_SEGMENT_SOURCE_AUTHORITY = false;', ctx2);   // OFF
  vm.runInContext(fnSrc('_aurixRealGapFloorMs'), ctx2);
  vm.runInContext(fnSrc('_aurixSourceFamily'), ctx2);
  vm.runInContext(fnSrc('_aurixFrontendUsableInWindow'), ctx2);
  vm.runInContext(fnSrc('_aurixEnforceSegmentSourceAuthority'), ctx2);
  vm.runInContext(fnSrc('_aurixApplyRangeSourceAuthority'), ctx2);
  const src = [fe(T0, 1000), be(T0 + 6 * 36e5, 1090), fe(T0 + 12 * 36e5, 1010)];
  const outR = vm.runInContext('_aurixApplyRangeSourceAuthority', ctx2)(src, '7d');
  ok('6 flag OFF ⇒ long-range src returned unchanged (backend interloper survives = prior behaviour)', outR === src);
})();

// ── 7 24H branch byte-identical (frontend authority drops all backend, .11 unchanged) ─
(function () {
  const src = [be(T0 - 3 * 36e5, 950), fe(T0, 1000), fe(T0 + 36e5, 1005), fe(T0 + 2 * 36e5, 1010)];
  const outR = authority(src, '24h');
  ok('7 24H excludes ALL backend when frontend usable (≥2 in window)', outR.every(p => G('_aurixSourceFamily')(p) !== 'backend') && outR.length === 3);
})();

// ── helper: audit deps with an injectable structural-break owner (gap ≥ gapMs ⇒ break) ─
function mkDeps(points, gapMs) {
  const pts = points.map(p => ({ ts: p.ts, total: p.total != null ? p.total : p.value, real_estate: p.real_estate || 0,
    asset_count: p.asset_count, source: p.source, market_state: p.market_state, price_staleness: p.price_staleness,
    category_values: (p.catKeys ? p.catKeys.split(',').reduce((o, k) => (o[k] = 1, o), {}) : {}) }));
  const rp = points.map(p => ({ ts: p.ts, value: p.total != null ? p.total : p.value }));
  const breaks = (rp, r) => { const arr = Array.isArray(rp) ? rp : []; const b = []; for (let i = 1; i < arr.length; i++) { const d = arr[i].time - arr[i - 1].time; if (gapMs && d >= gapMs) b.push({ start: arr[i - 1].time, end: arr[i].time }); } return { breaks: b }; };
  return { displaySource: () => pts, buildChart: r => ({ range: r, state: 'ready', points: rp }),
    resolveContract: (chart, r, s) => ({ renderPoints: rp, diagnostics: { syntheticPoints: 0 } }),
    structuralBreaks: (gapMs ? breaks : undefined) };
}

// ── 8 cross-break source change ⇒ SEGMENT_BOUNDARY, NOT a defect ─────────────
(function () {
  // backend tail segment → [genuine gap] → frontend segment. With segment-awareness the handoff is legitimate.
  const pts = [be(T0, 900), be(T0 + 6 * 36e5, 905),
    fe(T0 + 10 * DAY, 1000), fe(T0 + 10 * DAY + 6 * 36e5, 1005), fe(T0 + 10 * DAY + 12 * 36e5, 1010)];
  const res = core({ ranges: ['30d'], include24hControl: false }, mkDeps(pts, 3 * DAY));
  ok('8 cross-break handoff classified SEGMENT_BOUNDARY', (res.adjacentTransitionMatrix.SEGMENT_BOUNDARY || 0) >= 1, JSON.stringify(res.adjacentTransitionMatrix));
  ok('8 within-segment sourceAlternationCount == 0', res.sourceAlternationCount === 0, 'alt=' + res.sourceAlternationCount);
  ok('8 verdict is NOT SOURCE_ALTERNATION_DEFECT_PROVEN', res.verdict !== 'SOURCE_ALTERNATION_DEFECT_PROVEN', res.verdict);
  ok('8 valuationRegimeCount (max per segment) == 1', res.valuationRegimeCount === 1, 'perSeg=' + res.valuationRegimeCount + ' global=' + res.valuationRegimeCountGlobal);
  ok('8 defects empty', res.defects.length === 0, JSON.stringify(res.defects));
})();

// ── 9 REGRESSION: fine-grained WITHIN-segment alternation STILL fails ────────
(function () {
  // frontend↔backend flips with NO gap between them (gaps << break threshold) ⇒ real defect must still fire.
  const pts = [fe(T0, 1000), be(T0 + 6 * 36e5, 1080), fe(T0 + 12 * 36e5, 1000), be(T0 + 18 * 36e5, 1085), fe(T0 + 24 * 36e5, 1000)];
  const res = core({ ranges: ['30d'], include24hControl: false }, mkDeps(pts, 3 * DAY));  // 6h gaps ≪ 3d break ⇒ one segment
  ok('9 within-segment alternation ⇒ SOURCE_ALTERNATION_DEFECT_PROVEN', res.verdict === 'SOURCE_ALTERNATION_DEFECT_PROVEN', res.verdict);
  ok('9 sourceAlternationCount > 0', res.sourceAlternationCount > 0, 'alt=' + res.sourceAlternationCount);
})();

// ── 10 no-break owner ⇒ one segment (prior behaviour preserved) ──────────────
(function () {
  const pts = [fe(T0, 1000), be(T0 + 6 * 36e5, 1080), fe(T0 + 12 * 36e5, 1000)];
  const res = core({ ranges: ['30d'], include24hControl: false }, mkDeps(pts));  // no structuralBreaks dep ⇒ one segment
  ok('10 absent break owner ⇒ within-segment defect still detected', res.verdict === 'SOURCE_ALTERNATION_DEFECT_PROVEN', res.verdict);
})();

// ── 11 END-TO-END: authority filter THEN audit ⇒ clean (the real chain) ──────
(function () {
  // A realistic mixed history: dense frontend + interior backend gap-fillers + an older backend tail.
  const raw = [];
  for (let d = 0; d < 20; d++) raw.push(fe(T0 + d * DAY, 1000 + d * 3));                 // 20 daily frontend points
  raw.push(be(T0 + 2 * DAY + 6 * 36e5, 1200));                                            // interior backend (jump) → must be dropped
  raw.push(be(T0 + 9 * DAY + 6 * 36e5, 1250));                                            // interior backend (jump) → must be dropped
  raw.unshift(be(T0 - 30 * DAY, 700)); raw.unshift(be(T0 - 31 * DAY, 695));               // older backend tail (own segment)
  raw.sort((a, b) => a.ts - b.ts);
  const filtered = authority(raw, 'all');
  ok('11 interior backend interlopers removed by authority', filtered.filter(p => G('_aurixSourceFamily')(p) === 'backend' && p.ts >= T0).length === 0);
  // feed the FILTERED series through the audit (display + render come from the same filtered set)
  const deps = mkDeps(filtered.map(p => ({ ts: p.ts, total: p.total, source: p.source })), 20 * DAY);
  const res = core({ ranges: ['all'], include24hControl: false }, deps);
  ok('11 audit sourceAlternationCount == 0 after authority', res.sourceAlternationCount === 0, 'alt=' + res.sourceAlternationCount);
  ok('11 verdict not SOURCE_ALTERNATION_DEFECT_PROVEN', res.verdict !== 'SOURCE_ALTERNATION_DEFECT_PROVEN', res.verdict);
  ok('11 max regimes per segment == 1', res.valuationRegimeCount === 1);
  ok('11 no synthetic points', res.summary.totalSyntheticPoints === 0);
})();

// ── 12 purity: enforce never mutates input objects ───────────────────────────
(function () {
  const src = [fe(T0, 1000), be(T0 + 6 * 36e5, 1080), fe(T0 + 12 * 36e5, 1010)];
  const before = JSON.stringify(src);
  enforce(src, '7d');
  ok('12 enforce does not mutate input array/objects', JSON.stringify(src) === before);
})();

// ── 13 24H unaffected by the segment-authority flag (branch isolation) ───────
(function () {
  // With backend present in 24H window but frontend usable, 24H still drops backend via the .11 branch,
  // independent of the segment-authority path (which only runs for r !== '24h').
  const src = [be(T0 - 2 * 36e5, 960), fe(T0, 1000), fe(T0 + 36e5, 1004), fe(T0 + 2 * 36e5, 1009)];
  ok('13 24H path unchanged (frontend authority)', authority(src, '24h').every(p => G('_aurixSourceFamily')(p) !== 'backend'));
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' SPEC.38 ELIMINATE-SOURCE-ALTERNATION — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
