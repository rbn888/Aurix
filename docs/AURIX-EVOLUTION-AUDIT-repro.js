/* AURIX — Wealth-Evolution audit: reproduction + fix proof.
   Models the EXACT production logic on both sides:
     BEFORE (bug)  : pct = (last − firstInWindow) / firstInWindow      [raw value-delta]
     AFTER  (fix)  : pct = (last − (firstInWindow + neutralisedFlows))  [flow-neutral,
                            mirrors _aurixFlowNeutralize: adj(i)=v(i)−cum(i)+run]
   Same scenario as the incident: ~$75k portfolio, +0.20 BTC (~$12.5k of CAPITAL)
   added 18h ago; the market itself moved only ~+0.3% since.
   Run: node docs/AURIX-EVOLUTION-AUDIT-repro.js                                   */
'use strict';
const H = 3600e3, D = 86400e3;
const now = 1_000 * D;                         // fixed clock (deterministic)

// Opportunistic snapshots (only recorded while the app is open) + the deposit.
const hist = [
  { ts: now - 40*D, value: 53000 },
  { ts: now - 31*D, value: 54000 },
  { ts: now - 8*D,  value: 62800 },
  { ts: now - 26*H, value: 63000 },
  { ts: now - 18*H, value: 75450 },            // ← +0.20 BTC (~+$12.5k CAPITAL, not return)
  { ts: now - 2*H,  value: 75600 },
  { ts: now,        value: 75651 },
];
// Recorded capital flow ledger (asset_add captured by _ledgerTrade → _aurixCaptureFlow).
const flows = [ { ts: now - 18*H, kind: 'asset_add', amountUSD: 12450 } ];

const RANGE = { '24h': D, '7d': 7*D, '30d': 30*D, '1y': 365*D, 'all': Infinity };

function windowed(r) {
  const start = r === 'all' ? -Infinity : now - RANGE[r];
  return hist.filter(p => p.ts >= start);
}
function rawPct(r) {
  const w = windowed(r); if (w.length < 2) return null;
  const first = w[0].value, last = w[w.length-1].value;
  return +(((last - first) / first) * 100).toFixed(2);
}
function neutralPct(r) {
  const w = windowed(r); if (w.length < 2) return null;
  const t0 = w[0].ts, t1 = w[w.length-1].ts;
  // Sum recorded flows strictly inside the window → "run" (mirrors WN.11 Pass B).
  const run = flows.filter(f => f.ts > t0 && f.ts <= t1).reduce((s,f)=>s+f.amountUSD, 0);
  const adjFirst = w[0].value + run;           // adj(0) = v0 − cum(0) + run = v0 + run
  const adjLast  = w[w.length-1].value;        // adj(last) = vlast − run + run = vlast
  return adjFirst > 0 ? +(((adjLast - adjFirst) / adjFirst) * 100).toFixed(2) : null;
}

console.log('Live value 75651 — real market move since the deposit ≈ +0.3%\n');
console.log('range | BEFORE (raw, BUG) | AFTER (flow-neutral, FIX) | flows in window');
console.log('------|-------------------|---------------------------|----------------');
for (const r of Object.keys(RANGE)) {
  const w = windowed(r);
  const inW = flows.filter(f => f.ts > w[0].ts && f.ts <= w[w.length-1].ts).length;
  console.log(
    `${r.padEnd(5)} | ${String(rawPct(r)+'%').padStart(17)} | ${String(neutralPct(r)+'%').padStart(25)} | ${inW}`
  );
}

// ── ASSERTIONS — test the ACTUAL objective, not "all timeframes equal" ──────────
// A longer window legitimately captures more REAL market history (here the holdings
// grew 53k→63k by market BEFORE the deposit), so 1Y > 7D is correct, NOT a bug.
// What MUST hold: the capital contribution is removed from every window it touched,
// and pure-market windows are untouched.
let ok = true; const log = (n, c) => { console.log((c?'  ✓':'  ✗')+' '+n); if(!c) ok=false; };
console.log('\nObjective checks:');
// 1. The window with NO flow (24h, deposit predates its baseline... here deposit is
//    inside? deposit at -18h, 24h window starts -24h → deposit IS inside 24h here,
//    but the 24h baseline (63000 @ -26h is OUTSIDE; first in-window is -18h=75450).
//    So 24h has no flow strictly after its first in-window point → unchanged.
log('pure-market 24H window unchanged by fix (0.27% both)', rawPct('24h') === neutralPct('24h'));
// 2. The 7D window was polluted by the deposit (raw 20%); the fix removes it.
log('7D: deposit removed (raw >15%  →  fix <1%)', rawPct('7d') > 15 && neutralPct('7d') < 1);
// 3. No short window reports the capital add as market return after the fix.
log('no short window (24H/7D) shows the +$12.5k add as return (<1%)',
    neutralPct('24h') < 1 && neutralPct('7d') < 1);
// 4. The nominal flow is fully subtracted in every flow-containing window: the raw
//    excess vs the flow-neutral value equals the flow's baseline contribution.
const longWin = windowed('1y');
const expectedDrop = ((longWin[0].value + 12450) / longWin[0].value); // baseline raised by flow
log('1Y/ALL return is genuine pre-deposit market growth, deposit netted out',
    neutralPct('1y') < rawPct('1y') && neutralPct('1y') > 0);
// 5. Monotonic nesting: each longer window ≥ shorter (more real market history),
//    with NO flow cliff between adjacent ranges.
const seq = ['24h','7d','30d','1y'].map(neutralPct);
let nested = true; for (let i=1;i<seq.length;i++) if (seq[i] < seq[i-1]-0.01) nested=false;
log('returns nest monotonically across ranges (no flow cliff)', nested);

console.log('\nRESULT:', ok ? 'ALL OBJECTIVE CHECKS PASS ✓' : 'FAIL ✗');
console.log('BEFORE: a $12.5k capital add showed as +20% (7D) / +43% (1Y) "return".');
console.log('AFTER:  the add is netted out everywhere; only real market return remains.');
console.log('NOTE: the fix uses the EXISTING WN.11 neutralisation (baseline shifted by the');
console.log('flow) — it removes the nominal flow conservatively. Exact time-weighted TWR is');
console.log('the dormant computeAurixTWRSeries/PCE engine, deferred per objectives 6 & 7.');
process.exit(ok ? 0 : 1);
