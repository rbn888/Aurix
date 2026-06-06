'use strict';
/* AURIX-DATA-001 (source) — EVIDENCE harness (read-only, no app changes).
   Reproduces the REMAINING contamination after F1/F3/F4/F2-A/F2-C shipped.
   F2-A fixed the VALUE side (assetValueUSD/toBase are multi-FX). The COST-BASIS
   side and the reconstruction FX were NOT fixed — this quantifies the error.
   Run: node docs/AURIX-DATA-001-costbasis-fx-evidence.cjs */
let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`${c ? '  PASS' : '  FAIL'}  ${n}`); c ? pass++ : fail++; };

// Realistic rates
const usdToEur = 0.92;            // EUR per USD (app constant)
const FX = { GBP: 1.27, CHF: 1.12, JPY: 0.0066, EUR: 1 / usdToEur }; // USD per unit
const fxRate = c => FX[c];        // mirrors _aurixFxRate (USD per unit)

// ---- CURRENT app logic (replicated verbatim) ----
function assetNativeValue(a) { return a.qty * a.price; }                 // native ccy
function assetValueUSD(a) {                                              // F2-A: CORRECT
  const c = (a.assetCurrency || 'USD').toUpperCase(), native = assetNativeValue(a);
  if (c === 'USD') return native;
  if (c === 'EUR') return native / usdToEur;
  const r = fxRate(c); return Number.isFinite(r) ? native * r : NaN;
}
// DERIVED_FINANCIAL_STATE (app.js ~5781-5789) — value USD, cost RAW native:
function derivedPnL(asset) {
  const totalValue     = assetValueUSD(asset);          // USD
  const totalCostBasis = Number(asset.costBasis || 0);  // <-- RAW native ccy (BUG)
  const unrealized     = totalCostBasis > 0 ? totalValue - totalCostBasis : 0;
  const pct            = totalCostBasis > 0 ? (unrealized / totalCostBasis) * 100 : 0;
  return { unrealized, pct };
}
// wealth-engine / wealth-ledger _toUSD (services/*.js) — non-USD ASSUMED EUR:
function weToUSD(amount, cur) { return String(cur || 'USD').toUpperCase() === 'USD' ? amount : amount / usdToEur; }
// PCE reconstruction fxToBase (app.js ~12173) — USD/EUR only:
function reconFxToBase(ccy, baseC) {
  const c = String(ccy || '').toUpperCase();
  if (c === baseC) return 1;
  if (c === 'USD' || c === 'EUR') return c === 'USD' ? 1 : 1 / usdToEur; // toBase(1,c) in USD base
  return null;                                                          // GBP/CHF/JPY dropped
}

// ---- CORRECT reference ----
const costBasisUSD = a => { const c = (a.assetCurrency||'USD').toUpperCase(); const cb = Number(a.costBasis||0);
  return c === 'USD' ? cb : c === 'EUR' ? cb / usdToEur : cb * fxRate(c); };

console.log('\n=== A. VALUE side is already correct (F2-A) ===');
{
  const gbp = { qty: 10, price: 100, assetCurrency: 'GBP' };   // 1000 GBP
  ok('GBP value = 1000*1.27 = 1270 USD (assetValueUSD correct)', Math.abs(assetValueUSD(gbp) - 1270) < 1e-6);
}

console.log('\n=== B. COST-BASIS P&L is contaminated (native vs USD mismatch) ===');
{
  // Bought 10 @ 100 GBP, price unchanged → REAL P&L must be 0.
  const gbp = { qty: 10, price: 100, assetCurrency: 'GBP', costBasis: 1000 };
  const buggy = derivedPnL(gbp);
  ok('current logic invents a phantom gain (unrealized != 0)', Math.abs(buggy.unrealized) > 1);
  console.log(`        → phantom unrealized: ${buggy.unrealized.toFixed(2)} USD (${buggy.pct.toFixed(1)}%) — should be 0`);
  // correct
  const correct = assetValueUSD(gbp) - costBasisUSD(gbp);
  ok('correct unrealized (USD cost vs USD value) = 0', Math.abs(correct) < 1e-6);
  // EUR is ALSO affected (pre-existing), not just GBP/CHF/JPY:
  const eur = { qty: 100, price: 10, assetCurrency: 'EUR', costBasis: 1000 }; // 1000 EUR cost & value
  ok('EUR cost-basis P&L also wrong today (mixed USD value vs EUR cost)', Math.abs(derivedPnL(eur).unrealized) > 1);
}

console.log('\n=== C. wealth-engine/ledger _toUSD treats every non-USD as EUR ===');
{
  ok('GBP 1000 → weToUSD gives 1086.96 (÷0.92), NOT 1270', Math.abs(weToUSD(1000, 'GBP') - 1086.957) < 0.01);
  ok('correct GBP→USD would be 1270', Math.abs(1000 * fxRate('GBP') - 1270) < 1e-6);
  ok('CHF 1000 → weToUSD wrong (1086.96 vs 1120)', Math.abs(weToUSD(1000,'CHF') - 1120) > 30);
}

console.log('\n=== D. PCE reconstruction drops GBP/CHF/JPY (fxToBase → null) ===');
{
  ok('GBP fxToBase → null (asset uncovered in reconstructed series)', reconFxToBase('GBP', 'USD') === null);
  ok('CHF fxToBase → null', reconFxToBase('CHF', 'USD') === null);
  ok('USD/EUR still covered', reconFxToBase('USD','USD') === 1 && reconFxToBase('EUR','USD') !== null);
}

console.log('\n=== E. USD-only portfolios are UNAFFECTED (no regression risk) ===');
{
  const usd = { qty: 5, price: 200, assetCurrency: 'USD', costBasis: 800 }; // 1000 value, 800 cost
  ok('USD value 1000', Math.abs(assetValueUSD(usd) - 1000) < 1e-6);
  ok('USD P&L correct today (cost USD vs value USD) = +200', Math.abs(derivedPnL(usd).unrealized - 200) < 1e-6);
  ok('USD reconFxToBase covered', reconFxToBase('USD', 'USD') === 1);
}

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
console.log('NOTE: every assertion PASSING here = the contamination is REAL and reproducible.');
process.exit(fail ? 1 : 0);
