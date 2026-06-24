/* Executes the ACTUAL shipped functions from app.js (not a re-implementation) in a
   sandbox, to prove _aurixRangeReturn / _dshComputePerfSnapshot / auditAurixReturns
   behave flow-neutral and consistently after a 0.20 BTC add.
   Run: node docs/AURIX-RETURN-UNIFY-harness.js                                     */
'use strict';
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8');

// ── Brace-matched extraction of named declarations from app.js ─────────────────
function extractFunction(name) {
  const sig = 'function ' + name + '(';
  const i = src.indexOf(sig); if (i < 0) throw new Error('not found: ' + name);
  let j = src.indexOf('{', i), depth = 0, k = j;
  for (; k < src.length; k++) { const c = src[k]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { k++; break; } } }
  return src.slice(i, k);
}
function extractConstObject(name) {
  const sig = 'const ' + name + ' =';
  const i = src.indexOf(sig); if (i < 0) throw new Error('not found: ' + name);
  let k = src.indexOf('{', i), depth = 0;
  for (; k < src.length; k++) { const c = src[k]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { k++; break; } } }
  while (src[k] !== ';' && k < src.length) k++;
  return src.slice(i, k + 1);
}
// The window.audit* exposer block (between its open and the next top-level comment).
function extractWindowAuditBlock() {
  const i = src.indexOf("window.auditAurixReturn  =");
  const start = src.lastIndexOf("if (typeof window !== 'undefined') {", i);
  let k = src.indexOf('{', start), depth = 0;
  for (; k < src.length; k++) { const c = src[k]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { k++; break; } } }
  return src.slice(start, k);
}

// ── Synthetic state: ~$75k investable, +0.20 BTC (~$12.45k) added 18h ago ──────
const H = 3600e3, D = 86400e3;
const NOW = 1_000 * D;
const categoryHistory = [
  { ts: NOW - 40*D, total: 53000, real_estate: 0 },
  { ts: NOW - 31*D, total: 54000, real_estate: 0 },
  { ts: NOW - 8*D,  total: 62800, real_estate: 0 },
  { ts: NOW - 26*H, total: 63000, real_estate: 0 },
  { ts: NOW - 18*H, total: 75450, real_estate: 0 },   // ← +0.20 BTC capital
  { ts: NOW - 2*H,  total: 75600, real_estate: 0 },
  { ts: NOW,        total: 75651, real_estate: 0 },
];
const capitalFlows = [ { ts: NOW - 18*H, kind: 'asset_add', amountUSD: 12450 } ];

// ── Sandbox with the app's runtime contract stubbed (USD === base here) ─────────
const sandbox = {
  console,
  categoryHistory,
  activeRange: '30d',
  Date: (() => { const R = Date; const D2 = class extends R { static now() { return NOW; } }; return D2; })(),
  toBase: (v /*usd*/) => v,
  investableValueBase: () => 75651,
  _aurixLoadCapitalFlows: () => capitalFlows.slice(),
  _aurixPortfolioEpoch: () => 0,
  _dshRangeBand: () => null,            // label helper, irrelevant to the % under test
};
sandbox.window = sandbox;              // app.js exposes window.* — point it at the sandbox
vm.createContext(sandbox);

// Load the REAL shipped declarations in dependency order.
[
  extractConstObject('_WSC_INTERNAL_KINDS'),
  extractFunction('_aurixFlowIsInternal'),
  extractFunction('_aurixInvestableSnapshots'),
  extractFunction('_aurixEligibleInvestableSeries'),
  extractFunction('_aurixFlowNeutralize'),
  extractFunction('_aurixRangeReturn'),
  extractFunction('_aurixAuditRangeReturn'),
  extractFunction('_dshComputePerfSnapshot'),
  extractWindowAuditBlock(),
].forEach(code => vm.runInContext(code, sandbox));

// ── Run auditAurixReturns() — the exact console command requested ───────────────
console.log('\n========== auditAurixReturns() (real shipped code) ==========');
const rows = sandbox.window.auditAurixReturns();

// ── Assert the objectives via the SHIPPED _aurixRangeReturn + _dshComputePerfSnapshot
let ok = true; const ck = (n,c)=>{console.log((c?'  ✓':'  ✗')+' '+n); if(!c) ok=false;};
console.log('\n========== Objective checks ==========');
const R = {}; ['24h','7d','30d','1y','all'].forEach(r => R[r] = sandbox.window.auditAurixReturn(r));

ck('7D deposit removed: gross >15% → shown <1%', R['7d'].grossReturnPct > 15 && R['7d'].netReturnPct < 1);
ck('no short window shows the +$12.45k add as return (24H & 7D <1%)',
   R['24h'].netReturnPct < 1 && R['7d'].netReturnPct < 1);
ck('every range reports the asset_add flow detected',
   ['7d','30d','1y','all'].every(r => R[r].cashflowsDetected >= 1));

// hero (computed via _aurixRangeReturn) vs resumen (_dshComputePerfSnapshot) — same %
const heroPct = sandbox._aurixRangeReturn('30d').deltaPct;
const resumenPct = sandbox._dshComputePerfSnapshot('30d').deltaPct;
ck('hero % === resumen % (same canonical source) [' + heroPct + ' vs ' + resumenPct + ']',
   Math.abs(heroPct - resumenPct) < 1e-9);

// nesting / no flow cliff between adjacent ranges
const seq = ['24h','7d','30d','1y'].map(r => R[r].netReturnPct);
let nested = true; for (let i=1;i<seq.length;i++) if (seq[i] < seq[i-1]-0.01) nested=false;
ck('returns nest monotonically across ranges (no flow cliff)', nested);

console.log('\nRESULT:', ok ? 'ALL CHECKS PASS ✓ (executed against shipped app.js code)' : 'FAIL ✗');
process.exit(ok ? 0 : 1);
