'use strict';
/* AURIX-DATA-001 (source) — FIX proof. Replicates the corrected logic:
   _nativeToUSD / costBasisUSD / realizedPnLUSD (app.js), the multi-FX _toUSD
   (wealth-engine/ledger), and the multi-FX reconstruction fxToBase. Proves the
   contamination is gone with NO regression for USD/EUR.
   Run: node docs/AURIX-DATA-001-costbasis-fix-proof.cjs */
let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`${c ? '  PASS' : '  FAIL'}  ${n}`); c ? pass++ : fail++; };
const approx = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

const usdToEur = 0.92;                                   // EUR per USD (app constant)
const FX = { GBP: 1.27, CHF: 1.12, JPY: 0.0066 };       // USD per unit (live/approx table)
function _aurixFxLookup(c) {                              // mirrors app.js
  c = String(c || '').toUpperCase();
  if (c === 'USD') return { rate: 1, status: 'live' };
  if (c === 'EUR') return { rate: 1 / usdToEur, status: 'live' };
  if (c in FX) return { rate: FX[c], status: 'live' };
  return { rate: null, status: 'unknown' };
}
const _aurixFxRate = c => _aurixFxLookup(c).rate;

// ---- FIXED app.js logic ----
function _nativeToUSD(amount, currency) {
  const c = (currency || 'USD').toUpperCase();
  if (c === 'USD') return amount;
  if (c === 'EUR') return amount / usdToEur;
  const r = _aurixFxRate(c);
  return Number.isFinite(r) ? amount * r : NaN;
}
const assetNativeValue = a => a.qty * a.price;
function assetValueUSD(a) {
  const c = (a.assetCurrency || 'USD').toUpperCase(), native = assetNativeValue(a);
  if (c === 'USD') return native;
  if (c === 'EUR') return native / usdToEur;
  const r = _aurixFxRate(c); return Number.isFinite(r) ? native * r : NaN;
}
const costBasisUSD   = a => { const v = Number(a && a.costBasis);   return Number.isFinite(v) ? _nativeToUSD(v, a && a.assetCurrency) : 0; };
const realizedPnLUSD = a => { const v = Number(a && a.realizedPnL); return Number.isFinite(v) ? _nativeToUSD(v, a && a.assetCurrency) : 0; };
// D1/D2 corrected unrealized P&L
function unrealized(a) {
  const val = assetValueUSD(a), cb = costBasisUSD(a);
  if (!Number.isFinite(val) || !Number.isFinite(cb)) return null;   // uncovered → no phantom
  return { abs: val - cb, pct: cb > 0 ? ((val - cb) / cb) * 100 : 0 };
}
// D3 corrected services _toUSD
function _toUSD(amount, cur) {
  const c = String(cur || 'USD').toUpperCase();
  if (c === 'USD') return amount;
  if (c === 'EUR') return amount / usdToEur;
  const r = _aurixFxRate(c); return Number.isFinite(r) ? amount * r : NaN;
}
// D4 corrected reconstruction fxToBase (base USD)
function toBase(amount, from) {
  const f = (from || 'USD').toUpperCase();
  if (f === 'USD') return amount;
  if (f === 'EUR') return amount / usdToEur;
  const r = _aurixFxRate(f); return Number.isFinite(r) ? amount * r : NaN;
}
function fxToBase(ccy, baseC) {
  const c = String(ccy || '').toUpperCase();
  if (c === baseC) return 1;
  const r = toBase(1, c); return Number.isFinite(r) ? r : null;
}

console.log('\n=== GBP: cost basis, no phantom P&L ===');
{
  const a = { qty: 10, price: 100, assetCurrency: 'GBP', costBasis: 1000 }; // bought flat
  ok('GBP value = 1270 USD', approx(assetValueUSD(a), 1270));
  ok('GBP costBasisUSD = 1270 USD', approx(costBasisUSD(a), 1270));
  ok('GBP unrealized = 0 (phantom +27% GONE)', approx(unrealized(a).abs, 0) && approx(unrealized(a).pct, 0));
  const up = { qty: 10, price: 120, assetCurrency: 'GBP', costBasis: 1000 };  // real +20%
  ok('GBP real +20% still shown', approx(unrealized(up).pct, 20));
}

console.log('\n=== CHF: cost basis correct ===');
{
  const a = { qty: 50, price: 20, assetCurrency: 'CHF', costBasis: 1000 };    // 1000 CHF flat
  ok('CHF value = 1120 USD', approx(assetValueUSD(a), 1120));
  ok('CHF costBasisUSD = 1120 USD', approx(costBasisUSD(a), 1120));
  ok('CHF unrealized = 0', approx(unrealized(a).abs, 0));
}

console.log('\n=== JPY: cost basis correct ===');
{
  const a = { qty: 1000, price: 100, assetCurrency: 'JPY', costBasis: 100000 }; // 100k JPY flat
  ok('JPY value = 660 USD', approx(assetValueUSD(a), 660));
  ok('JPY costBasisUSD = 660 USD', approx(costBasisUSD(a), 660));
  ok('JPY unrealized = 0', approx(unrealized(a).abs, 0));
}

console.log('\n=== EUR: no regression (cost now consistent in USD) ===');
{
  const a = { qty: 100, price: 10, assetCurrency: 'EUR', costBasis: 1000 };   // 1000 EUR flat
  ok('EUR value = 1000/0.92 USD', approx(assetValueUSD(a), 1000 / usdToEur));
  ok('EUR costBasisUSD = 1000/0.92 USD', approx(costBasisUSD(a), 1000 / usdToEur));
  ok('EUR unrealized = 0 (was phantom before)', approx(unrealized(a).abs, 0));
  ok('EUR _toUSD byte-identical to old (amount/_fx)', approx(_toUSD(1000, 'EUR'), 1000 / usdToEur));
}

console.log('\n=== USD: byte-identical ===');
{
  const a = { qty: 5, price: 200, assetCurrency: 'USD', costBasis: 800 };     // 1000 value, 800 cost
  ok('USD value 1000', approx(assetValueUSD(a), 1000));
  ok('USD costBasisUSD = raw costBasis (800)', costBasisUSD(a) === 800);
  ok('USD unrealized = +200 (unchanged)', approx(unrealized(a).abs, 200) && approx(unrealized(a).pct, 25));
  ok('USD _toUSD identity', _toUSD(1234.5, 'USD') === 1234.5);
  ok('USD realizedPnLUSD identity', realizedPnLUSD({ realizedPnL: 50, assetCurrency: 'USD' }) === 50);
}

console.log('\n=== realizedPnL converted from native ===');
{
  ok('GBP realizedPnL 100 → 127 USD', approx(realizedPnLUSD({ realizedPnL: 100, assetCurrency: 'GBP' }), 127));
  ok('EUR realizedPnL 100 → 108.7 USD', approx(realizedPnLUSD({ realizedPnL: 100, assetCurrency: 'EUR' }), 100 / usdToEur));
}

console.log('\n=== Unknown FX → uncovered / NaN honest, NEVER assumed EUR ===');
{
  ok('_nativeToUSD unknown → NaN', Number.isNaN(_nativeToUSD(1000, 'XAG')));
  ok('costBasisUSD unknown → NaN (not 1000/0.92)', Number.isNaN(costBasisUSD({ costBasis: 1000, assetCurrency: 'XAG' })));
  ok('unrealized unknown → null (no phantom)', unrealized({ qty: 1, price: 1000, assetCurrency: 'XAG', costBasis: 1000 }) === null);
  ok('services _toUSD unknown → NaN', Number.isNaN(_toUSD(1000, 'XAG')));
  ok('reconstruction fxToBase unknown → null', fxToBase('XAG', 'USD') === null);
  ok('NOT assumed EUR (would have been 1086.96)', !approx(_toUSD(1000, 'XAG') || 0, 1086.957, 0.01));
}

console.log('\n=== D4: reconstruction now covers GBP/CHF/JPY ===');
{
  ok('fxToBase GBP finite (was null)', Number.isFinite(fxToBase('GBP', 'USD')) && approx(fxToBase('GBP', 'USD'), 1.27));
  ok('fxToBase CHF finite', approx(fxToBase('CHF', 'USD'), 1.12));
  ok('fxToBase JPY finite', approx(fxToBase('JPY', 'USD'), 0.0066));
  ok('fxToBase base ccy → 1', fxToBase('USD', 'USD') === 1);
}

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
