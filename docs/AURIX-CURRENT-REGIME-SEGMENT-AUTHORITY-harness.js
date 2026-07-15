'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CURRENT-REGIME-SEGMENT-AUTHORITY-harness — P0 CURRENT_REGIME_SEGMENT_AUTHORITY (proof-first audit)
// ════════════════════════════════════════════════════════════════════════════
// This turn ships the READ-ONLY forensic audit window.aurixAuditCurrentRegimeAuthority(range) ONLY (no runtime
// selection change — the surgical fix is gated behind proving the selector rule on the affected live account).
// The harness proves the AUDIT correctly diagnoses, per range, WHICH continuous run the current recency-first
// owner selects, WHICH run is the true current portfolio regime (endpoint reconciles with the live value), and
// NAMES the first wrong-selection owner + rule — and that it is pure / read-only / never fabricates a point.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing ' + n); return braceSlice(app, i); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const HOUR = 36e5, MIN = 60000, DAY = 864e5, NOW = 1_720_000_000_000;

// Build a fresh vm context per scenario with mocked builders driving a chosen topology.
// scenario: { range, live, points:[{ts,value}], breaks:[{start,end}], state? }
function run(scn) {
  const ctx = {
    Math, JSON, Number, isFinite, Infinity, Array, Object, String, Set, Boolean,
    console: { log() {} },
    Date: { now: () => scn.now != null ? scn.now : NOW },
    currentUser: { id: 'testuser12345' },
  };
  const winObj = {}; ctx.window = winObj;
  vm.createContext(ctx);
  // real constants + real gap-splitter (fidelity); mock only the data builders
  vm.runInContext('const _AURIX_VTG_MIN_MAIN_PTS = 3;', ctx);
  vm.runInContext('const _AURIX_VTG_MIN_MAIN_SPAN_MS = ' + (15 * MIN) + ';', ctx);
  vm.runInContext('const _AURIX_STABLE_BAND_HI = 1.15;', ctx);
  vm.runInContext(fnSrc('_aurixSplitAtGaps'), ctx);   // the REAL run splitter
  const pts = scn.points.map(p => ({ ts: p.ts, value: p.value }));
  ctx.__PTS = pts; ctx.__BREAKS = scn.breaks || []; ctx.__LIVE = scn.live; ctx.__STATE = scn.state || 'ready';
  vm.runInContext('function getInvestablePortfolioValue(){ return __LIVE; }', ctx);
  vm.runInContext('function buildProductionPortfolioChart(){ return { state: __STATE, points: __PTS.map(p=>({ts:p.ts,value:p.value})) }; }', ctx);
  vm.runInContext('function buildValidatedHistoricalSeries(){ return { rangeSeries: __PTS.map(p=>({ts:p.ts,value:p.value,source:"remote_canonical"})) }; }', ctx);
  vm.runInContext('function _aurixStructuralBreaks(){ return { breaks: __BREAKS }; }', ctx);
  vm.runInContext(fnSrc('_aurixAuditCurrentRegimeAuthorityCore'), ctx);
  return { res: vm.runInContext('_aurixAuditCurrentRegimeAuthorityCore(' + JSON.stringify(scn.range) + ')', ctx), input: pts };
}

// A continuous run: n points every stepMin, ending endMinAgo before NOW, around value v (+small drift).
function runPts(startTs, n, stepMs, v) { const a = []; for (let i = 0; i < n; i++) a.push({ ts: startTs + i * stepMs, value: v + i }); return a; }
// A structural break between two adjacent timestamps a<b.
const brk = (a, b) => ({ start: a, end: b });

console.log('\nAURIX-CURRENT-REGIME-SEGMENT-AUTHORITY — P0 (proof-first read-only audit)');

// presence + registration
ok('0 marker + audit fn + window registration', app.indexOf('P0.CURRENT_REGIME_SEGMENT_AUTHORITY') >= 0
  && (app.match(/function _aurixAuditCurrentRegimeAuthorityCore\(/g) || []).length === 1
  && /window\.aurixAuditCurrentRegimeAuthority\s*=/.test(app));

// ── 1 Older long run + recent short run that CONTAINS the latest snapshot and reconciles with live ─────────
// low regime (5 pts @ 6000, older) → break → recent regime (4 pts @ 16400, newest). live ≈ 16400.
{
  const lo = runPts(NOW - 20 * HOUR, 5, 30 * MIN, 6000);            // ends ~18h ago
  const hi = runPts(NOW - 2 * HOUR, 4, 20 * MIN, 16400);           // ends ~1h ago (newest)
  const { res } = run({ range: '24h', live: 16410, points: lo.concat(hi), breaks: [brk(lo[4].ts, hi[0].ts)] });
  ok('1 recent reconciling run is selected → CURRENT_REGIME_SELECTED', res.verdict === 'CURRENT_REGIME_SELECTED' && res.selectedRunIndex === 1, res.verdict + ' sel=' + res.selectedRunIndex);
  ok('1 selected run reconciles (distance ≤ tol)', res.selectedRunDistanceToLivePct <= res.liveValueTolerancePct);
  ok('1 currentRegimeRunIndex == selected', res.currentRegimeRunIndex === res.selectedRunIndex);
}

// ── 2 THE BUG: recent (chronologically-last) run is a STALE-VALUE 6k regime; an earlier run reconciles ─────
// current-regime 16400 run ends 4h ago → break → low 6068 regime ends 170min ago (freshest ts, wrong value).
{
  const hi = runPts(NOW - 8 * HOUR, 6, 30 * MIN, 16400);           // reconciles, older endpoint (~5.5h)
  const lo = runPts(NOW - 3 * HOUR, 23, 5 * MIN, 6068);           // low regime, FRESHEST endpoint (~170min)
  const { res } = run({ range: '24h', live: 16404, points: hi.concat(lo), breaks: [brk(hi[5].ts, lo[0].ts)] });
  ok('2 WRONG_SEGMENT_SELECTED (older stale run outranks current regime)', res.verdict === 'WRONG_SEGMENT_SELECTED', res.verdict);
  ok('2 selected is the freshest low run (index 1, ~6068)', res.selectedRunIndex === 1 && Math.round(res.selectedRunLastValue) === 6068 + 22, 'sel=' + res.selectedRunIndex + ' v=' + res.selectedRunLastValue);
  ok('2 currentRegimeRunIndex is the reconciling 16400 run (index 0)', res.currentRegimeRunIndex === 0, 'cur=' + res.currentRegimeRunIndex);
  ok('2 owner named', /_aurix24hRecentRunAnchor|FRC/.test(res.exactOwnerFunction || ''), res.exactOwnerFunction);
  ok('2 rule cites recency + no live reconciliation', /RECENCY/.test(res.exactSelectionRule || '') && /reconciliation/i.test(res.exactSelectionRule || ''));
  ok('2 selected run flagged not-consistent (large distance)', res.selectedRunDistanceToLivePct > res.liveValueTolerancePct, res.selectedRunDistanceToLivePct);
}

// ── 3 Fresh run consistent with live → selected ───────────────────────────────────────────────────────────
{
  const hi = runPts(NOW - 4 * HOUR, 10, 20 * MIN, 16000);
  const { res } = run({ range: '7d', live: 16050, points: hi, breaks: [] });
  ok('3 single fresh consistent run → SINGLE_RUN_HEALTHY & consistent', res.verdict === 'SINGLE_RUN_HEALTHY' && res.selectedRunDistanceToLivePct <= res.liveValueTolerancePct, res.verdict);
}

// ── 4 Fresh run materially inconsistent with live, and a reconciling run exists → mismatch reported ────────
{
  const good = runPts(NOW - 10 * HOUR, 6, 30 * MIN, 30000);        // reconciles with live 30000, older
  const bad = runPts(NOW - 2 * HOUR, 8, 10 * MIN, 5000);          // fresh but 83% off → inconsistent
  const { res } = run({ range: '30d', live: 30020, points: good.concat(bad), breaks: [brk(good[5].ts, bad[0].ts)] });
  ok('4 fresh-but-inconsistent selected → WRONG_SEGMENT_SELECTED', res.verdict === 'WRONG_SEGMENT_SELECTED', res.verdict);
  ok('4 mismatch magnitude reported (>tol)', res.selectedRunDistanceToLivePct > res.liveValueTolerancePct, res.selectedRunDistanceToLivePct);
  ok('4 currentRegimeRunIndex points at reconciling run', res.currentRegimeRunIndex === 0, 'cur=' + res.currentRegimeRunIndex);
}

// ── 5 Structural break → runs stay split, NO bridge, values byte-identical ────────────────────────────────
{
  const a = runPts(NOW - 12 * HOUR, 5, 40 * MIN, 8000);
  const b = runPts(NOW - 3 * HOUR, 6, 20 * MIN, 16000);
  const all = a.concat(b);
  const { res, input } = run({ range: '1y', live: 16010, points: all, breaks: [brk(a[4].ts, b[0].ts)] });
  ok('5 two runs preserved (break honored, not bridged)', res.runCount === 2 && res.candidateRuns.length === 2);
  ok('5 break flags set', res.candidateRuns[0].structuralBreakAfter === true && res.candidateRuns[1].structuralBreakBefore === true);
  // every candidate point sum equals the input (no fabricated/dropped point across the gap)
  const totalPts = res.candidateRuns.reduce((s, c) => s + c.pointCount, 0);
  ok('5 no synthetic/interpolated points (Σ run points == input)', totalPts === input.length, totalPts + ' vs ' + input.length);
}

// ── 6 Multiple historical regimes → exactly ONE current regime identified ─────────────────────────────────
{
  const r1 = runPts(NOW - 40 * DAY, 6, 2 * DAY, 15000);          // old high
  const r2 = runPts(NOW - 25 * DAY, 6, 2 * DAY, 5500);           // low regime
  const r3 = runPts(NOW - 5 * DAY, 6, 12 * HOUR, 6000);          // low regime cont (freshest ts)
  const r4 = runPts(NOW - 2 * DAY, 6, 6 * HOUR, 16400);         // hmm — make r4 NOT freshest by putting it before r3
  // topology (chronological): r1(15k) | r2(5.5k) | r4(16.4k current-regime, ends ~ -0.75d) | r3(6k, freshest)
  const chrono = r1.concat(r2).concat(r4).concat(runPts(NOW - 12 * HOUR, 6, 90 * MIN, 6050));
  // breaks between each regime
  const bpts = [brk(r1[5].ts, r2[0].ts), brk(r2[5].ts, r4[0].ts), brk(r4[5].ts, chrono[chrono.length - 6].ts)];
  const { res } = run({ range: 'all', live: 16404, points: chrono, breaks: bpts });
  ok('6 four historical regimes preserved in diagnostics', res.runCount === 4, 'runs=' + res.runCount);
  ok('6 exactly one currentRegimeRunIndex, the 16.4k regime (index 2)', res.currentRegimeRunIndex === 2, 'cur=' + res.currentRegimeRunIndex);
  ok('6 freshest run (last low 6k) != current regime → WRONG_SEGMENT_SELECTED', res.freshestRunIndex === 3 && res.verdict === 'WRONG_SEGMENT_SELECTED', 'fresh=' + res.freshestRunIndex + ' v=' + res.verdict);
}

// ── 7 Healthy single-run account → byte-identical, no ambiguity ───────────────────────────────────────────
{
  const one = runPts(NOW - 20 * HOUR, 20, 40 * MIN, 12000);
  const { res } = run({ range: '24h', live: 12030, points: one, breaks: [] });
  ok('7 single run → SINGLE_RUN_HEALTHY, no wrong-selection owner', res.verdict === 'SINGLE_RUN_HEALTHY' && res.firstWrongSelectionStage === null);
  ok('7 selected run index 0, reconciles', res.selectedRunIndex === 0 && res.selectedRunDistanceToLivePct <= res.liveValueTolerancePct);
}

// ── 8 Not-ready / no points → PENDING (never a fabricated verdict) ────────────────────────────────────────
{
  const { res } = run({ range: '24h', live: 16404, points: [], breaks: [], state: 'pending' });
  ok('8 empty/not-ready → PENDING_OR_EMPTY', res.verdict === 'PENDING_OR_EMPTY' && res.runCount === 0);
}

// ── 9 Every range value preserved (per-range diagnostics keep original endpoints) ─────────────────────────
{
  const a = runPts(NOW - 6 * HOUR, 4, 30 * MIN, 9000);
  const b = runPts(NOW - 2 * HOUR, 4, 20 * MIN, 16000);
  const { res } = run({ range: '7d', live: 16005, points: a.concat(b), breaks: [brk(a[3].ts, b[0].ts)] });
  ok('9 candidate endpoints are original values', res.candidateRuns[0].lastValue === a[3].value && res.candidateRuns[1].lastValue === b[3].value);
  ok('9 distanceToLiveValuePct + freshness populated per run', res.candidateRuns.every(c => c.distanceToLiveValuePct != null && c.endpointFreshnessMinutes != null));
}

// ── 10 No synthetic points: input array not mutated, output invents nothing ───────────────────────────────
{
  const a = runPts(NOW - 5 * HOUR, 5, 30 * MIN, 7000);
  const b = runPts(NOW - 1 * HOUR, 5, 10 * MIN, 16000);
  const before = a.concat(b).map(p => p.ts + ':' + p.value).join('|');
  const { res, input } = run({ range: '24h', live: 16010, points: a.concat(b), breaks: [brk(a[4].ts, b[0].ts)] });
  const after = input.map(p => p.ts + ':' + p.value).join('|');
  ok('10 input series not mutated', before === after);
  ok('10 Σ candidate points == input length (no bridge point added)', res.candidateRuns.reduce((s, c) => s + c.pointCount, 0) === input.length);
}

// ── 11 Desktop/mobile parity: audit reads emg.points (surface-independent) → repeated call identical ──────
{
  const a = runPts(NOW - 6 * HOUR, 6, 30 * MIN, 6068);
  const b = runPts(NOW - 9 * HOUR, 6, 30 * MIN, 16400);
  const scn = { range: '24h', live: 16404, points: b.concat(a), breaks: [brk(b[5].ts, a[0].ts)] };
  const r1 = run(scn).res, r2 = run(scn).res;
  ok('11 identical audit across calls (surface-independent)', JSON.stringify(r1) === JSON.stringify(r2));
}

// ── 12 containsLatestSnapshot marks the run with the global max ts ────────────────────────────────────────
{
  const hi = runPts(NOW - 8 * HOUR, 5, 30 * MIN, 16400);
  const lo = runPts(NOW - 2 * HOUR, 6, 10 * MIN, 6068);           // contains latest snapshot
  const { res } = run({ range: '24h', live: 16404, points: hi.concat(lo), breaks: [brk(hi[4].ts, lo[0].ts)] });
  ok('12 containsLatestSnapshot on the freshest (low) run only', res.candidateRuns[1].containsLatestSnapshot === true && res.candidateRuns[0].containsLatestSnapshot === false);
  ok('12 latest-snapshot run != current regime → WRONG_SEGMENT_SELECTED', res.verdict === 'WRONG_SEGMENT_SELECTED' && res.currentRegimeRunIndex === 0);
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  (' + pass + ' passed, ' + fail + ' failed)\n');
process.exit(fail === 0 ? 0 : 1);
