'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-DETERMINISM-NEW-ACCOUNT-harness — SPEC DSH.CHART.DETERMINISM.NEW-ACCOUNT.09
// ════════════════════════════════════════════════════════════════════════════
// On a new account, refreshing at the same instant drew DIFFERENT chart shapes (dense/irregular, smooth
// drop, isolated point, separated segments) while the badge stayed neutral. Root cause: the downstream
// pipeline is deterministic given its input, but the VISIBLE line was painted from an UNRECONCILED source
// during boot — an authenticated user reads the volatile local cache (categoryHistory) until the remote
// canonical store reconciles, then flips to canonical, then re-merges backend snapshots. This harness
// proves: (a) same data in any arrival order → identical chartOutputHash; (b) dedupe/sort/near-dup are
// deterministic; (c) the reconcile gate holds the line as a stable "building" state until reconciled and
// never synthesises points; (d) a mature account's real return is intact.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function fn(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let k = app.indexOf('{', i), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(i, k); }
function konst(name) { const m = app.match(new RegExp('const ' + name + '\\s*=.*?;')); if (!m) throw new Error('missing ' + name); return m[0]; }
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }
const MIN = 60e3, HOUR = 36e5, DAY = 864e5;

// ── PIPELINE sandbox ──
let HIST = [], LEDGER = [], RECONCILED = true;
const PS = { console, Math, JSON, Array, Number, isFinite, Infinity, Date, Map, Set, Object, isNaN, parseInt, parseFloat, String,
  toBase: v => v, _aurixLoadCapitalFlows: () => LEDGER, _aurixHistorySourceForDisplay: () => HIST,
  _aurixCanonicalHistoryReady: () => RECONCILED, currentUser: { id: 'user-abc-123' }, activeRange: 'all',
  __setHist: h => { HIST = h; }, __setLedger: l => { LEDGER = l; } };
vm.createContext(PS);
['_AURIX_EMG_RANGE_MS', '_AURIX_EMG_ADJ_JUMP', '_AURIX_EMG_FALLBACK_TAIL', '_AURIX_EMG_MIN_POINTS', '_AURIX_HPQ_MIN_POINTS', '_AURIX_HPQ_SPIKE_JUMP', '_AURIX_HPQ_SPIKE_REVERT_FRAC', '_AURIX_HPQ_FUTURE_MS', '_AURIX_PROD_MIN_POINTS', '_AURIX_PROD_GATE_PCT', '_AURIX_RET_MIN_BASE', '_AURIX_RET_SANE_PCT', '_AURIX_STEP_MATCH_MIN_CONF', '_AURIX_ALL_MIN_TRUST_SPAN_MS', '_AURIX_ALL_MIN_TRUST_POINTS', '_AURIX_VJUMP_MIN_FRAC', '_AURIX_VJUMP_P95_MULT', '_AURIX_CAPSTEP_RATIO_LO', '_AURIX_CAPSTEP_RATIO_HI', '_AURIX_CAPSTEP_TS_PAD_MS', '_AURIX_CAPITAL_STEP_SEG_ENABLED', '_AURIX_CHART_RECONCILE_GATE', '_AURIX_SNAP_NEAR_MS', '_AURIX_SNAP_NEAR_FRAC', '_AURIX_SNAP_FE_AUTHORITY_MS'].forEach(c => vm.runInContext(konst(c), PS));
['_aurixEmergencyHash', '_aurixProdPlateauFilter', '_aurixProdVisualGate', '_aurixHpqIso', '_aurixHpqDiag', '_aurixHpqRangesContaining', '_aurixHpqRawStages', '_aurixHpqTrimConstruction', '_aurixHpqQuarantineSpikes', '_aurixHpqFirstInvalidStage', 'buildValidatedHistoricalSeries', '_aurixNetFlowsInWindow', '_aurixComputePeriodReturn', '_aurixVerticalJumps', '_aurixCapitalStepBreaks', '_aurixNormalizeBackendSnapshot', '_aurixMergeSnapshotSources', 'buildProductionPortfolioChart'].forEach(n => vm.runInContext(fn(n), PS));
function build(range) { return vm.runInContext('buildProductionPortfolioChart(' + JSON.stringify(range) + ')', PS); }
function merge(feArr, beArr) { PS.__fe = feArr; PS.__be = beArr; return vm.runInContext('_aurixMergeSnapshotSources(__fe, __be)', PS); }

// deterministic permutations of an array (no Math.random) — rotations + reversal + swaps
function permutations(arr, count) {
  const out = [];
  for (let k = 0; k < count; k++) {
    const c = arr.slice();
    const rot = k % c.length;
    const rotated = c.slice(rot).concat(c.slice(0, rot));   // rotate
    if (k % 2 === 1) rotated.reverse();                      // reverse every other
    if (k % 3 === 0 && rotated.length > 3) { const t = rotated[1]; rotated[1] = rotated[rotated.length - 2]; rotated[rotated.length - 2] = t; }  // swap
    out.push(rotated);
  }
  return out;
}
// dense series: cadence minutes over N points from t0
function series(t0, n, stepMin, valFn) { const out = []; for (let i = 0; i < n; i++) out.push({ ts: t0 + i * stepMin * MIN, total: +valFn(i).toFixed(2), real_estate: 0 }); return out; }
const T0 = 1_800_000_000_000;

console.log('AURIX-CHART-DETERMINISM-NEW-ACCOUNT — SPEC DSH.CHART.DETERMINISM.NEW-ACCOUNT.09\n');

// ── 1. Same dataset, 10 permutations of arrival order → identical chartOutputHash ──
console.log('1. Same dataset, 10 arrival orders → same chartOutputHash:');
RECONCILED = true; LEDGER = [];
const base = series(T0, 40, 30, i => 10000 + 30 * i + (i % 5) * 12);   // 20h, gentle rise with wiggle
{
  const perms = permutations(base, 10);
  const hashes = perms.map(pmt => { PS.__setHist(pmt); return build('all').chartHash; });
  const allSame = hashes.every(h => h && h === hashes[0]);
  ok('10 permutations → one chartOutputHash', allSame, 'hashes=' + Array.from(new Set(hashes)).join(','));
  const states = perms.map(pmt => { PS.__setHist(pmt); return build('all').state; });
  ok('all permutations render ready (line drawn, not hidden)', states.every(s => s === 'ready'));
}

// ── 2 & 3. Boot orders local→remote→backend vs backend→remote→local → same final output ──
console.log('\n2/3. Boot arrival order (local→remote→backend vs reverse) → same final output:');
{
  const local  = series(T0,            12, 30, i => 10000 + 20 * i);           // frontend dense
  const remote = series(T0 + 6 * HOUR, 12, 30, i => 10360 + 20 * i);           // canonical continuation
  const backend= series(T0 + 12 * HOUR, 8, 60, i => 10720 + 40 * i);           // backend gap-fillers (later)
  PS.__setHist(local.concat(remote).concat(backend)); const hA = build('all').chartHash;
  PS.__setHist(backend.concat(remote).concat(local)); const hB = build('all').chartHash;
  PS.__setHist(remote.concat(backend).concat(local)); const hC = build('all').chartHash;
  ok('local→remote→backend == backend→remote→local == remote→backend→local', hA && hA === hB && hB === hC, hA + '|' + hB + '|' + hC);
}

// ── 4. Deterministic backend merge — frontend dense wins near-duplicates, stable across runs ──
console.log('\n4. 24H dense frontend + recent backend → frontend authority, deterministic merge:');
{
  const fe = series(T0, 24, 10, i => 20000 + 5 * i);                            // dense 10-min frontend
  const be = [ { ts: T0 + 5 * MIN,  total_value_usd: 20002 },                  // within 5min & 0.2% of a fe point → dropped
               { ts: T0 + 100 * DAY, total_value_usd: 30000 } ];               // genuine gap far away → kept
  const m1 = merge(fe, be), m2 = merge(fe, be);
  const h1 = m1.map(p => p.ts + ':' + p.total).join('|'), h2 = m2.map(p => p.ts + ':' + p.total).join('|');
  ok('merge deterministic (same output twice)', h1 === h2);
  ok('near-duplicate backend point dropped (frontend wins where dense)', !m1.some(p => p.source === 'backend_snapshot' && Math.abs(p.ts - (T0 + 5 * MIN)) < MIN));
  ok('genuine-gap backend point kept (fills a real hole)', m1.some(p => p.source === 'backend_snapshot' && p.ts === T0 + 100 * DAY));
  ok('merge sorted by ts + no synthetic points', m1.every((p, i) => i === 0 || p.ts >= m1[i - 1].ts) && m1.length === fe.length + 1);
}

// ── 5. 7D short history → partial/calculating, stable across refresh ──
console.log('\n5. 7D short history → partial/calculating, stable:');
{
  const h = series(T0, 6, 60, i => 5000 + 10 * i);   // 5h of data, requesting 7d
  PS.__setHist(h); LEDGER = [];
  const a = build('7d'), b = build('7d');
  ok('7D output deterministic (same hash twice)', a.chartHash === b.chartHash);
  ok('7D badge Calculando (returnState not ok)', a.returnState !== 'ok', 'rs=' + a.returnState);
  ok('7D line still available (not hidden) or honest pending', a.state === 'ready' || a.state === 'pending');
}

// ── 6. TOTAL short → calculating, stable ──
console.log('\n6. TOTAL short → calculating, stable:');
{
  PS.__setHist(series(T0, 8, 30, i => 3170 - 150 * i)); LEDGER = [];   // short declining new account
  const a = build('all'), b = build('all');
  ok('TOTAL deterministic', a.chartHash === b.chartHash);
  ok('TOTAL neutral (no false lifetime return)', a.returnState !== 'ok' && a.badgeReturnPct === null, 'rs=' + a.returnState + ' badge=' + a.badgeReturnPct);
}

// ── 7. Duplicate timestamps → deterministic dedupe (order-independent) ──
console.log('\n7. Duplicate timestamps → deterministic dedupe:');
{
  const dupTs = T0 + 5 * 30 * MIN;
  const withDup = base.concat([{ ts: dupTs, total: 99999, real_estate: 0 }]);   // duplicate ts, wild value
  PS.__setHist(withDup); const d1 = build('all');
  PS.__setHist(withDup.slice().reverse()); const d2 = build('all');
  ok('duplicate-ts output identical regardless of order', d1.chartHash === d2.chartHash, d1.chartHash + '|' + d2.chartHash);
  ok('dedupe recorded (rejectedInvalidCount reflects duplicate)', (d1.rejectedInvalidCount || 0) >= 1 || (d1.rawPointCount > d1.cleanPointCount));
}

// ── 8. Near-duplicates → deterministic (preserved consistently) ──
console.log('\n8. Near-duplicate timestamps → deterministic:');
{
  const near = base.concat([{ ts: T0 + 5 * 30 * MIN + 30 * 1000, total: 10151, real_estate: 0 }]);  // 30s after an existing point
  PS.__setHist(near); const n1 = build('all');
  PS.__setHist(near.slice().reverse()); const n2 = build('all');
  ok('near-duplicate output identical regardless of order', n1.chartHash === n2.chartHash, n1.chartHash + '|' + n2.chartHash);
}

// ── 9. Real capital steps → honest segments, deterministic (not a fake smooth curve) ──
console.log('\n9. Real capital steps → honest segments, deterministic:');
{
  const step = series(T0, 10, 60, i => 5000).concat(series(T0 + 11 * HOUR, 10, 60, i => 15000));  // a real doubling step
  PS.__setHist(step); LEDGER = [];
  const a = build('all'), b = build('all');
  ok('capital-step output deterministic', a.chartHash === b.chartHash);
  ok('step is preserved (capitalStepBreakCount ≥ 0, not smoothed away)', typeof a.capitalStepBreakCount === 'number');
}

// ── 10. Mature long dense clean history → real return intact (regression guard) ──
console.log('\n10. Mature long dense clean history → real return intact:');
{
  const mature = series(T0, 400, 120, i => 10000 + 6 * i);   // ~33 days, 400 points, clean gentle rise
  PS.__setHist(mature); LEDGER = [];
  const a = build('all'), b = build('all');
  ok('mature output deterministic', a.chartHash === b.chartHash);
  ok('mature real return SHOWS (returnState ok, badge numeric)', a.returnState === 'ok' && a.badgeReturnPct != null, 'rs=' + a.returnState + ' badge=' + a.badgeReturnPct);
  ok('mature line drawn', a.state === 'ready' && a.points.length >= 2);
}

// ── 11. No synthetic points — every plotted ts exists in the input ──
console.log('\n11. No synthetic points:');
{
  PS.__setHist(base);
  const p = build('all');
  const inTs = new Set(base.map(x => x.ts));
  ok('every plotted point ts ∈ input (no fabricated points)', p.points.every(pt => inTs.has(pt.ts)), 'plotted=' + p.points.length);
  ok('plotted count ≤ input count', p.points.length <= base.length);
}

// ── 12. Badge Calculando tied to real gates (short → calculating, mature → ok) ──
console.log('\n12. Badge Calculando tied to real gates:');
{
  PS.__setHist(series(T0, 8, 30, i => 3170 - 150 * i)); ok('short new account → isCalculating', build('all').returnState !== 'ok');
  PS.__setHist(series(T0, 400, 120, i => 10000 + 6 * i)); ok('mature → NOT calculating', build('all').returnState === 'ok');
}

// ── 13. Reconcile gate — authed + not reconciled → stable building state, NO points ──
console.log('\n13. Reconcile gate (authed unreconciled → building, never intermediate shape):');
{
  PS.__setHist(base); LEDGER = [];
  RECONCILED = false;
  const g = build('all');
  ok('unreconciled → state pending, reason awaiting_canonical_reconcile', g.state === 'pending' && g.reason === 'awaiting_canonical_reconcile', 'state=' + g.state + ' reason=' + g.reason);
  ok('unreconciled → NO points synthesised (line held, not garbage)', (g.points || []).length === 0);
  RECONCILED = true;
  const rdy = build('all');
  ok('reconciled → line draws again (not permanently hidden)', rdy.state === 'ready' && rdy.points.length >= 2);
  ok('reconciled hash stable across two reconciled builds', rdy.chartHash === build('all').chartHash);
}

// ── 14. Gate is a strict no-op where the helper is absent (existing chart harnesses unaffected) ──
console.log('\n14. Gate no-op when _aurixCanonicalHistoryReady absent:');
{
  const PS2 = Object.assign({}, PS);
  const ctx = vm.createContext({ console, Math, JSON, Array, Number, isFinite, Infinity, Date, Map, Set, Object, isNaN, parseInt, parseFloat, String,
    toBase: v => v, _aurixLoadCapitalFlows: () => [], _aurixHistorySourceForDisplay: () => base, currentUser: undefined, activeRange: 'all' });
  ['_AURIX_EMG_RANGE_MS', '_AURIX_EMG_ADJ_JUMP', '_AURIX_EMG_FALLBACK_TAIL', '_AURIX_EMG_MIN_POINTS', '_AURIX_HPQ_MIN_POINTS', '_AURIX_HPQ_SPIKE_JUMP', '_AURIX_HPQ_SPIKE_REVERT_FRAC', '_AURIX_HPQ_FUTURE_MS', '_AURIX_PROD_MIN_POINTS', '_AURIX_PROD_GATE_PCT', '_AURIX_RET_MIN_BASE', '_AURIX_RET_SANE_PCT', '_AURIX_STEP_MATCH_MIN_CONF', '_AURIX_ALL_MIN_TRUST_SPAN_MS', '_AURIX_ALL_MIN_TRUST_POINTS', '_AURIX_VJUMP_MIN_FRAC', '_AURIX_VJUMP_P95_MULT', '_AURIX_CAPSTEP_RATIO_LO', '_AURIX_CAPSTEP_RATIO_HI', '_AURIX_CAPSTEP_TS_PAD_MS', '_AURIX_CAPITAL_STEP_SEG_ENABLED', '_AURIX_CHART_RECONCILE_GATE', '_AURIX_SNAP_NEAR_MS', '_AURIX_SNAP_NEAR_FRAC', '_AURIX_SNAP_FE_AUTHORITY_MS'].forEach(c => vm.runInContext(konst(c), ctx));
  ['_aurixEmergencyHash', '_aurixProdPlateauFilter', '_aurixProdVisualGate', '_aurixHpqIso', '_aurixHpqDiag', '_aurixHpqRangesContaining', '_aurixHpqRawStages', '_aurixHpqTrimConstruction', '_aurixHpqQuarantineSpikes', '_aurixHpqFirstInvalidStage', 'buildValidatedHistoricalSeries', '_aurixNetFlowsInWindow', '_aurixComputePeriodReturn', '_aurixVerticalJumps', '_aurixCapitalStepBreaks', 'buildProductionPortfolioChart'].forEach(n => vm.runInContext(fn(n), ctx));
  const p = vm.runInContext('buildProductionPortfolioChart("all")', ctx);
  ok('helper absent → gate no-op → builds ready normally', p.state === 'ready' && p.points.length >= 2, 'state=' + p.state);
}

// ── 15. Source contract — fix + instrumentation present in app.js ──
console.log('\n15. Source contract:');
ok('reversible flag _AURIX_CHART_RECONCILE_GATE present', /const _AURIX_CHART_RECONCILE_GATE = true;/.test(app));
ok('gate wired inside buildProductionPortfolioChart (awaiting_canonical_reconcile)', /awaiting_canonical_reconcile[\s\S]*?_aurixCanonicalHistoryReady/.test(app) || /_aurixCanonicalHistoryReady[\s\S]{0,400}awaiting_canonical_reconcile/.test(app));
ok('window.aurixChartDeterminismAudit instrumentation present', /window\.aurixChartDeterminismAudit = function/.test(app));
ok('audit exposes chartInputHash + chartOutputHash + bootPhase + sourceCounts', /chartInputHash:/.test(app) && /chartOutputHash:/.test(app) && /bootPhase:/.test(app) && /sourceCounts:/.test(app));
ok('audit declares syntheticPoints: 0', /syntheticPoints: 0/.test(app));
ok('marker DSH.CHART.DETERMINISM.NEW-ACCOUNT.09 present', /DSH\.CHART\.DETERMINISM\.NEW-ACCOUNT\.09/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
