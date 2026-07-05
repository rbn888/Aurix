'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-POINT-LINEAGE-DISCONTINUITY-harness — SPEC DSH.CHART.POINT-LINEAGE.DISCONTINUITY.AUDIT.10
// ════════════════════════════════════════════════════════════════════════════
// AUDIT-FIRST harness (NO fix applied yet). It DRIVES the real visible-chart pipeline
// (buildProductionPortfolioChart → buildValidatedHistoricalSeries → _aurixHpqRawStages) with new-account
// fixtures and PROVES the root cause of the field breakage (needles / islands / pre-account history /
// false 24H return). It asserts:
//   • DEFECTS CONFIRMED (pre-fix evidence) — behaviours that MUST change once the fix lands.
//   • INVARIANTS HOLDING — determinism (v490) + zero synthetic points, which the fix must preserve.
// ROOT CAUSE (proved below): the VISIBLE pipeline applies NEITHER a value-band trust filter NOR an
// account-age/epoch gate (both live only in the RETURN path _aurixEligibleInvestableSeries / the reset
// epoch), so out-of-band, pre-account and multi-epoch points survive into the drawn line, and the 24H
// return is computed from first/last values with no epoch-comparability check.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function fn(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let k = app.indexOf('{', i), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(i, k); }
function konst(name) { const m = app.match(new RegExp('const ' + name + '\\s*=.*?;')); if (!m) throw new Error('missing ' + name); return m[0]; }
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }
const MIN = 60e3, HOUR = 36e5, DAY = 864e5;

let HIST = [], LEDGER = [];
const PS = { console, Math, JSON, Array, Number, isFinite, Infinity, Date, Map, Set, Object, isNaN, parseInt, parseFloat, String,
  toBase: v => v, _aurixLoadCapitalFlows: () => LEDGER, _aurixHistorySourceForDisplay: () => HIST,
  _aurixCanonicalHistoryReady: () => true, currentUser: { id: 'user-new-abc' }, activeRange: '24h', __setHist: h => { HIST = h; } };
vm.createContext(PS);
['_AURIX_EMG_RANGE_MS', '_AURIX_EMG_ADJ_JUMP', '_AURIX_EMG_FALLBACK_TAIL', '_AURIX_EMG_MIN_POINTS', '_AURIX_HPQ_MIN_POINTS', '_AURIX_HPQ_SPIKE_JUMP', '_AURIX_HPQ_SPIKE_REVERT_FRAC', '_AURIX_HPQ_FUTURE_MS', '_AURIX_PROD_MIN_POINTS', '_AURIX_PROD_GATE_PCT', '_AURIX_RET_MIN_BASE', '_AURIX_RET_SANE_PCT', '_AURIX_STEP_MATCH_MIN_CONF', '_AURIX_ALL_MIN_TRUST_SPAN_MS', '_AURIX_ALL_MIN_TRUST_POINTS', '_AURIX_VJUMP_MIN_FRAC', '_AURIX_VJUMP_P95_MULT', '_AURIX_CAPSTEP_RATIO_LO', '_AURIX_CAPSTEP_RATIO_HI', '_AURIX_CAPSTEP_TS_PAD_MS', '_AURIX_CAPITAL_STEP_SEG_ENABLED', '_AURIX_CHART_RECONCILE_GATE', '_AURIX_SNAP_NEAR_MS', '_AURIX_SNAP_NEAR_FRAC'].forEach(c => vm.runInContext(konst(c), PS));
['_aurixEmergencyHash', '_aurixProdPlateauFilter', '_aurixProdVisualGate', '_aurixHpqIso', '_aurixHpqDiag', '_aurixHpqRangesContaining', '_aurixHpqRawStages', '_aurixHpqTrimConstruction', '_aurixHpqQuarantineSpikes', '_aurixHpqFirstInvalidStage', 'buildValidatedHistoricalSeries', '_aurixNetFlowsInWindow', '_aurixComputePeriodReturn', '_aurixVerticalJumps', '_aurixCapitalStepBreaks', 'buildProductionPortfolioChart'].forEach(n => vm.runInContext(fn(n), PS));
function build(range) { return vm.runInContext('buildProductionPortfolioChart(' + JSON.stringify(range) + ')', PS); }
function validated(range) { return vm.runInContext('buildValidatedHistoricalSeries(' + JSON.stringify(range) + ')', PS); }
function series(t0, n, stepMin, valFn, src) { const out = []; for (let i = 0; i < n; i++) { const p = { ts: t0 + i * stepMin * MIN, total: +valFn(i).toFixed(2), real_estate: 0 }; if (src) p.source = src; out.push(p); } return out; }
const T0 = 1_800_000_000_000;                 // "now" reference base for fixtures
const CREATED_AT = T0 - 3 * HOUR;             // account created 3 hours before the newest point (new account)

console.log('AURIX-CHART-POINT-LINEAGE-DISCONTINUITY — SPEC DSH.CHART.POINT-LINEAGE.DISCONTINUITY.AUDIT.10\n');
console.log('=== DEFECTS CONFIRMED (pre-fix evidence — these MUST change when the fix lands) ===');

// ── Fixture A (islands): settled ~9k, a GAP, a foreign out-of-band ~40k cluster, a GAP, live ~9k ──
// Models remote-canonical/backend/foreign points at an incompatible base surviving into the line.
console.log('\nA. Out-of-band foreign cluster survives (no value-band trust filter in visible pipeline):');
{
  const a = series(T0 - 20 * DAY, 8, 30, () => 9000)              // settled epoch
    .concat(series(T0 - 10 * DAY, 5, 30, () => 40000))           // foreign / incompatible epoch (>2.5×)
    .concat(series(T0 - 2 * HOUR, 8, 10, i => 9000 + 5 * i));    // live epoch
  PS.__setHist(a); LEDGER = [];
  const p = build('all');
  const lastV = p.points.length ? p.points[p.points.length - 1].value : 0;
  const outOfBand = p.points.filter(pt => lastV > 0 && (pt.value > 2.5 * lastV || pt.value < 0.25 * lastV));
  ok('DEFECT: foreign 40k cluster PLOTTED (would be dropped by the return-path value band)', outOfBand.length > 0, 'outOfBand=' + outOfBand.length + ' lastV=' + lastV);
}

// ── Fixture B (pre-account): points with ts BEFORE the account's created_at are plotted ──
console.log('\nB. Pre-account-age points are plotted as real history (no account-age gate in visible pipeline):');
{
  const pre = series(CREATED_AT - 200 * DAY, 6, 6 * 60, () => 9000);   // 200d before account existed
  const post = series(T0 - 2 * HOUR, 8, 10, i => 9000 + 4 * i);
  PS.__setHist(pre.concat(post)); LEDGER = [];
  const p = build('all');
  const preAccountPlotted = p.points.filter(pt => pt.ts < CREATED_AT).length;
  ok('DEFECT: point with ts < created_at is plotted (silently presented as user history)', preAccountPlotted > 0, 'preAccountPlotted=' + preAccountPlotted + ' created=' + CREATED_AT);
}

// ── Fixture C (needles in 24H): two sustained sub-clusters at different bases inside 24H ──
console.log('\nC. 24H needles from alternating economic bases (no epoch segmentation):');
{
  const c = series(T0 - 20 * HOUR, 5, 30, () => 9000)            // base A
    .concat(series(T0 - 12 * HOUR, 5, 30, () => 3000))           // base B (sustained → not a mean-revert spike)
    .concat(series(T0 - 4 * HOUR, 6, 30, () => 9000));           // back to base A
  PS.__setHist(c); LEDGER = [];
  const p = build('24h');
  let needles = 0;
  for (let i = 1; i < p.points.length; i++) { const a = p.points[i - 1].value, b = p.points[i].value; if (a > 0 && Math.abs(b - a) / a > 0.25) needles++; }
  ok('DEFECT: ≥1 vertical needle (>25% step) survives in the plotted 24H line', needles > 0, 'needles=' + needles + ' pts=' + p.points.length);
}

// ── Fixture D — reproduces the field −0.99% red on 24H. KEY FINDING: a genuinely new account (ALL points
// within 24h) has its 24H return CORRECTLY suppressed (rangeCollapsedBecauseHistoryTooShort). The red % only
// appears when the source carries points OLDER than 24h (pre-account/foreign/stale) → that disables the
// "history too short" suppression, and the first point INSIDE the 24h window is an incompatible-base point,
// so first→last yields a false small negative. This ties needles/islands/pre-account to the −0.99%.
console.log('\nD. 24H false −0.99% appears ONLY via pre-window contamination (no epoch-comparability check):');
{
  // Control: truly-new account, all points < 24h old → return correctly suppressed.
  PS.__setHist(series(T0 - 20 * HOUR, 20, 60, i => 9000 + 3 * i)); LEDGER = [];
  const clean = build('24h');
  ok('control: genuinely-new 24H (all pts <24h) → return CORRECTLY suppressed (neutral)', clean.returnState !== 'ok', 'rs=' + clean.returnState);
  // Contaminated: an old anchor (>24h) + a foreign-base cluster inside the window + live → false negative.
  const d = [{ ts: T0 - 40 * HOUR, total: 9050, real_estate: 0 }]      // OLD anchor before the window → disables the "too short" gate
    .concat(series(T0 - 23 * HOUR, 4, 30, () => 9100))                 // foreign/old base INSIDE window = first comparable point (keeps coverage ≥0.8)
    .concat(series(T0 - 3 * HOUR, 6, 20, () => 9010));                 // live base
  PS.__setHist(d); LEDGER = [];
  const p = build('24h');
  ok('DEFECT: pre-window contamination → 24H publishes a false NEGATIVE return (the field −0.99%)', p.returnState === 'ok' && p.badgeReturnPct != null && p.badgeReturnPct < 0, 'rs=' + p.returnState + ' badge=' + p.badgeReturnPct);
  ok('  → return is (first,last)-value based with NO epoch/base-comparability check', /_aurixComputePeriodReturn\(r, \{ ts: first\.ts, value: first\.value \}, \{ ts: last\.ts, value: last\.value \}\)/.test(app));
}

// ── Fixture E (architectural gap): the value-band filter is absent from the VISIBLE pipeline ──
// A LONE extreme outlier IS caught by spike-quarantine, but a SUSTAINED out-of-band cluster is not —
// that is exactly the return-path value band ([0.25×,2.5×]) which the visible pipeline never applies.
console.log('\nE. Sustained out-of-band cluster survives the visible pipeline (no value-band trust filter):');
{
  const e = series(T0 - 5 * DAY, 6, 60, () => 9000).concat(series(T0 - 4 * DAY, 6, 60, () => 40000)).concat(series(T0 - 3 * HOUR, 6, 20, () => 9000));
  PS.__setHist(e); LEDGER = [];
  const v = validated('all');
  const kept = v.validatedFull.filter(pt => pt.value > 20000).length;   // >2.5× the ~9k regime
  ok('DEFECT: sustained 40k cluster survives buildValidatedHistoricalSeries (return-path band would drop it)', kept > 0, 'keptOutOfBand=' + kept + ' cleanCount=' + v.validatedFull.length);
}

console.log('\n=== INVARIANTS ALREADY HOLDING (the fix MUST preserve these) ===');

// ── Determinism across 10 arrival orders (v490) still holds ──
console.log('\nF. Deterministic across 10 arrival orders (v490 gate intact):');
{
  const f = series(T0 - 18 * HOUR, 30, 30, i => 9000 + 6 * i + (i % 4) * 10);
  const hashes = [];
  for (let k = 0; k < 10; k++) {
    const rot = k % f.length; let arr = f.slice(rot).concat(f.slice(0, rot)); if (k % 2) arr = arr.reverse();
    PS.__setHist(arr); hashes.push(build('all').chartHash);
  }
  ok('10 arrival orders → one chartHash', hashes.every(h => h && h === hashes[0]), Array.from(new Set(hashes)).join(','));
}

// ── Zero synthetic points — every plotted ts exists in the input ──
console.log('\nG. Zero synthetic points:');
{
  const g = series(T0 - 12 * HOUR, 20, 30, i => 9000 + 3 * i);
  PS.__setHist(g); const p = build('all');
  const inTs = new Set(g.map(x => x.ts));
  ok('every plotted point ts ∈ input (never fabricated)', p.points.every(pt => inTs.has(pt.ts)) && p.points.length <= g.length, 'plotted=' + p.points.length);
}

// ── Exact + near duplicates resolve deterministically (v490) ──
console.log('\nH. Exact + near duplicates resolve deterministically:');
{
  const base = series(T0 - 10 * HOUR, 15, 30, i => 9000 + 5 * i);
  const dup = base.concat([{ ts: base[5].ts, total: 99999, real_estate: 0 }, { ts: base[7].ts + 20000, total: 9060, real_estate: 0 }]);
  PS.__setHist(dup); const h1 = build('all').chartHash;
  PS.__setHist(dup.slice().reverse()); const h2 = build('all').chartHash;
  ok('exact + near duplicate output identical regardless of order', h1 === h2, h1 + '|' + h2);
}

// ── Same-epoch clean history preserves REAL fluctuation (fix must not over-suppress) ──
console.log('\nI. Same-epoch mature clean history keeps its real return (must survive the fix):');
{
  const mature = series(T0 - 33 * DAY, 400, 120, i => 10000 + 6 * i);
  PS.__setHist(mature); LEDGER = [];
  const p = build('all');
  ok('mature same-epoch → real return shows (returnState ok)', p.returnState === 'ok' && p.badgeReturnPct != null, 'rs=' + p.returnState + ' badge=' + p.badgeReturnPct);
}

console.log('\n=== SOURCE CONTRACT (instrumentation added, no runtime fix) ===');
ok('window.aurixChartPointLineageAudit present', /window\.aurixChartPointLineageAudit = function/.test(app));
ok('lineage exposes per-point source/epoch/beforeAccountCreation/dropReason', /stageDropped:/.test(app) && /beforeAccountCreation:/.test(app) && /epochId:/.test(app) && /dropReason:/.test(app));
ok('lineage exposes needles + islands + return24hComparability', /needles:/.test(app) && /islands:/.test(app) && /return24hComparability:/.test(app));
ok('lineage IDs hashed (privacy) + syntheticPoints:0', /accountIdHash:/.test(app) && /hashStr/.test(app) && /syntheticPoints: 0/.test(app));
ok('NO runtime fix yet — buildProductionPortfolioChart still has no band/epoch/age gate (audit-only)', !/valueBandTrustFilter|accountAgeGate|epochSegmentedSeries/.test(app));
ok('marker DSH.CHART.POINT-LINEAGE.DISCONTINUITY.AUDIT.10 present', /DSH\.CHART\.POINT-LINEAGE\.DISCONTINUITY\.AUDIT\.10/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
console.log('NOTE: "DEFECT" assertions PASS because they confirm the CURRENT broken behaviour (root-cause evidence). They are the spec for the pending fix.');
process.exit(fail === 0 ? 0 : 1);
