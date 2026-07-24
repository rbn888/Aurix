'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-GOLD-PNL-UNIT-harness — SPEC PURCHASE PRICE V1 · GOLD ABSOLUTE P&L
// ════════════════════════════════════════════════════════════════════════════
// CONTRACT: "Gold (XAU) absolute P&L, invested capital and current value are all expressed in
// the SAME effective unit as the displayed valuation: grams × purity ÷ OZ_TO_G × pricePerOz
// (assetNativeValue). Cost basis is normalised to that unit by syncCostBasisFromTransactions,
// assetPnLBase takes its value from assetNativeValue, and category performance
// (computePositionPerformance via _aurixPositionFromAsset) is fed a Scale-B current/avg price.
// Therefore for gold: currentValue − investedCost === absolutePnL, and the percentage is
// coherent. The transaction still stores qty = weight (goldUnit) and price = per troy oz; the
// live price is untouched; NO second formula is introduced; and every NON-gold asset is
// byte-identical (assetNativeValue === qty × price when there is no karat)."
//
// This is the specific regression proving the previously-demonstrated bug (costBasis in a
// grams×perOz scale while value used effectiveOz×perOz → absolute P&L ~OZ_TO_G/purity× too big)
// is closed, using the REAL owners extracted from app.js.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing fn ' + n); return braceSlice(app, i); }

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }
function near(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-6); }

const OZ_TO_G = 31.1034768;
const ctx = { Number, Math, Object, Array, Date, console };
vm.createContext(ctx);
// Constants + tiny stubs the extracted owners close over (values identical to app.js).
vm.runInContext('const OZ_TO_G = 31.1034768; const _PURITY_TABLE = {24:1,22:0.9167,21:0.875,18:0.75,14:0.5833,10:0.4167,9:0.375}; function liquidityNominal(a){ return a.qty; } function _aurixDisplayCategory(t){ return t === "metal" ? "metal" : String(t||""); }', ctx);
['_goldPurity', '_goldGrams', 'isClosedAsset', 'assetNativeValue', 'avgBuyPrice',
 'syncCostBasisFromTransactions', 'syncQtyFromTransactions', 'migrateLegacyAssetToTransactions',
 'sanitizeTransactionPrices', 'assetPnLBase', '_aurixPositionFromAsset',
 'computePositionPerformance', 'computeCategoryPerformance'].forEach(fn => vm.runInContext(fnSrc(fn), ctx));
const G = (n) => vm.runInContext(n, ctx);
const purity = G('_goldPurity');

// Build a gold asset exactly as the add-asset owner does (tx qty=weight, price=per oz), then run
// the render() sync sequence (migrate → sanitize → syncQty → syncCost) as the app does every render.
function goldAssetAfterRender(purchaseOz, liveOz, karat, grams, unit) {
  const a = { ticker: 'XAU', karat, goldUnit: unit || 'g', type: 'metal', qty: grams, price: liveOz,
    transactions: [{ type: 'buy', qty: grams, price: purchaseOz, ts: 1 }] };
  G('migrateLegacyAssetToTransactions')(a); G('sanitizeTransactionPrices')(a);
  G('syncQtyFromTransactions')(a); G('syncCostBasisFromTransactions')(a);
  return a;
}
function canonical(purchaseOz, liveOz, karat, grams) {
  const effOz = grams * purity(karat) / OZ_TO_G;
  const cur = effOz * liveOz, inv = effOz * purchaseOz;
  return { effOz, cur, inv, abs: cur - inv, pct: (cur - inv) / inv * 100 };
}
function assertCase(label, a, c) {
  const val = G('assetNativeValue')(a);
  const p = G('assetPnLBase')(a);
  ok(label + ' — current value = grams×purity÷OZ×spot (canonical)', near(val, c.cur, 0.01), val + ' vs ' + c.cur);
  ok(label + ' — invested cost normalised to same unit', near(a.costBasis, c.inv, 0.01), a.costBasis + ' vs ' + c.inv);
  ok(label + ' — absolute P&L = value − cost (canonical)', near(p.abs, c.abs, 0.01), p.abs + ' vs ' + c.abs);
  ok(label + ' — percentage P&L coherent', near(p.pct, c.pct, 1e-4), p.pct + ' vs ' + c.pct);
  ok(label + ' — INVARIANT currentValue − investedCost === absolutePnL', near(val - a.costBasis, p.abs, 1e-9));
  // category performance (dashboard/category header) reconciles in the same unit
  const perf = G('computePositionPerformance')(G('_aurixPositionFromAsset')(a));
  ok(label + ' — category currentValue matches (Scale B)', near(perf.currentValue, c.cur, 0.01), perf.currentValue + ' vs ' + c.cur);
  ok(label + ' — category absolutePnL matches', perf.absolutePnL != null && near(perf.absolutePnL, c.abs, 0.01), perf.absolutePnL + ' vs ' + c.abs);
}

console.log('AURIX-GOLD-PNL-UNIT — SPEC PURCHASE PRICE V1 · GOLD ABSOLUTE P&L\n');

// ── 0 the bug is fixed at the owner (source contracts) ──────────────────────────
console.log('0 — owner fixes present (canonical conversion reused, no second formula):');
ok('0.1 syncCostBasisFromTransactions gold-normalises each lot (grams×purity×price/OZ_TO_G)', /_goldGrams\(qty, asset\.goldUnit \|\| 'g'\) \* _goldPurity\(asset\.karat\) \* \(price \/ OZ_TO_G\)/.test(app));
ok('0.2 assetPnLBase value comes from the canonical valuation owner (assetNativeValue)', /const value = assetNativeValue\(asset\);/.test(app) && !/const value = asset\.qty \* asset\.price;/.test(app));
ok('0.3 category position uses a Scale-B current price for gold (qty×price = assetNativeValue)', /assetNativeValue\(a\) \/ qty/.test(app));
ok('0.4 migrate keeps legacy gold cost basis (synthetic price per-oz via effectiveOz)', /asset\.costBasis \/ effectiveOz/.test(app));
ok('0.5 every P&L value term uses the canonical valuation (no qty×price − costBasis left)', !/qty \* [a-z]*\.?price - [a-z]*\.?costBasis/.test(app) && /value \+= assetNativeValue\(a\);/.test(app));

// ── 1 controlled case (SPEC): 100 g, 18k, purchase 2000/oz, live 2500/oz ────────
console.log('1 — controlled case: 100 g · 18k · buy 2000/oz · live 2500/oz:');
{
  const c = canonical(2000, 2500, 18, 100);
  const a = goldAssetAfterRender(2000, 2500, 18, 100, 'g');
  ok('1.0 canonical: effOz≈2.4113, value≈6028.26, invested≈4822.61, abs≈1205.65, +25%',
     near(c.effOz, 2.411306, 1e-5) && near(c.cur, 6028.26, 0.01) && near(c.inv, 4822.61, 0.01) && near(c.abs, 1205.65, 0.01) && near(c.pct, 25, 1e-6));
  assertCase('1', a, c);
  // the OLD bug would have produced abs ≈ 50000 (qty×price − qty×price); prove it's gone
  ok('1.x absolute P&L is NOT the old grams×perOz figure (~50000)', Math.abs(G('assetPnLBase')(a).abs - 50000) > 1000);
}

// ── 2 gold purchase price BELOW spot → positive P&L ─────────────────────────────
console.log('2 — manual price below spot (1800 vs 2000/oz, 50 g, 18k):');
assertCase('2', goldAssetAfterRender(1800, 2000, 18, 50, 'g'), canonical(1800, 2000, 18, 50));

// ── 3 gold purchase price ABOVE spot → negative P&L ─────────────────────────────
console.log('3 — manual price above spot (2500 vs 2000/oz, 100 g, 18k):');
{ const c = canonical(2500, 2000, 18, 100); const a = goldAssetAfterRender(2500, 2000, 18, 100, 'g');
  assertCase('3', a, c); ok('3.x negative P&L (bought high)', G('assetPnLBase')(a).abs < 0 && near(G('assetPnLBase')(a).pct, -20, 1e-6)); }

// ── 4 purity ≠ 100% honoured (24k vs 14k differ in effective oz) ────────────────
console.log('4 — purity honoured (24k vs 14k):');
{ const a24 = goldAssetAfterRender(1800, 2000, 24, 50, 'g'); const a14 = goldAssetAfterRender(1800, 2000, 14, 50, 'g');
  assertCase('4·24k', a24, canonical(1800, 2000, 24, 50));
  assertCase('4·14k', a14, canonical(1800, 2000, 14, 50));
  ok('4.x lower purity ⇒ lower cost basis + value (14k < 24k)', a14.costBasis < a24.costBasis && G('assetNativeValue')(a14) < G('assetNativeValue')(a24)); }

// ── 5 fallback to spot when no manual price → P&L 0 at add ──────────────────────
console.log('5 — fallback to spot (purchase = spot):');
{ const a = goldAssetAfterRender(2500, 2500, 18, 100, 'g'); const p = G('assetPnLBase')(a);
  ok('5.1 cost basis = current value ⇒ absolute P&L 0', near(p.abs, 0, 0.01) && near(p.pct, 0, 1e-6));
  ok('5.2 value still canonical (not zero)', near(G('assetNativeValue')(a), canonical(2500, 2500, 18, 100).cur, 0.01)); }

// ── 6 unit honoured — oz weight gives same cost as equivalent grams ─────────────
console.log('6 — goldUnit honoured (oz):');
{ // 1 oz at 18k, buy 2000/oz, live 2500/oz  ==  31.1034768 g equivalent
  const aOz = goldAssetAfterRender(2000, 2500, 18, 1, 'oz');
  const cOz = { effOz: 1 * purity(18), cur: 1 * purity(18) * 2500, inv: 1 * purity(18) * 2000, abs: 1 * purity(18) * 500, pct: 25 };
  assertCase('6', aOz, cOz); }

// ── 7 NON-gold regression — byte-identical (stock/etf/fund/crypto) ──────────────
console.log('7 — non-gold regression (byte-identical):');
{
  let allOk = true;
  for (const t of ['stock', 'etf', 'fund', 'crypto']) {
    const a = { ticker: 'X', type: t, qty: 10, price: 200, transactions: [{ type: 'buy', qty: 10, price: 150, ts: 1 }] };
    G('syncCostBasisFromTransactions')(a);
    const p = G('assetPnLBase')(a);
    // old behaviour: value = qty×price = 2000, cost = 1500, abs = 500, pct = 33.33
    if (!(a.costBasis === 1500 && near(G('assetNativeValue')(a), 2000) && near(p.abs, 500) && near(p.pct, 100 / 3))) allOk = false;
  }
  ok('7.1 stock/etf/fund/crypto: value=qty×price, cost=Σqty×price, P&L unchanged', allOk);
  const pos = G('_aurixPositionFromAsset')({ ticker: 'X', type: 'stock', qty: 10, price: 200, costBasis: 1500 });
  ok('7.2 non-gold position currentPrice = asset.price (unchanged)', pos.currentPrice === 200);
}

// ── 8 persistence / idempotence — re-running the render sync is stable ──────────
console.log('8 — persistence (re-render sync is idempotent — survives refresh):');
{
  const a = goldAssetAfterRender(2000, 2500, 18, 100, 'g');
  const cost1 = a.costBasis, val1 = G('assetNativeValue')(a);
  // simulate a refresh: transactions[] persist unchanged; render() runs the sync again
  G('migrateLegacyAssetToTransactions')(a); G('sanitizeTransactionPrices')(a); G('syncQtyFromTransactions')(a); G('syncCostBasisFromTransactions')(a);
  ok('8.1 cost basis + value stable across re-sync (no drift on reopen/refresh)', near(a.costBasis, cost1, 1e-9) && near(G('assetNativeValue')(a), val1, 1e-9));
  ok('8.2 transaction still stores qty=weight + price=per-oz (model unchanged)', a.transactions[0].qty === 100 && a.transactions[0].price === 2000);
}

// ── 9 portfolio-level reconciliation (mixed gold + stock, USD) ──────────────────
console.log('9 — portfolio total reconciles (gold + stock):');
{
  const gold  = goldAssetAfterRender(2000, 2500, 18, 100, 'g');   // value 6028.26, cost 4822.61
  const stock = { ticker: 'AAPL', type: 'stock', qty: 10, price: 200, transactions: [{ type: 'buy', qty: 10, price: 150, ts: 1 }] };
  G('syncCostBasisFromTransactions')(stock);
  const port = [gold, stock];
  // recompute()/getPortfolioPnL now both value via assetNativeValue (USD assets → assetValueUSD == native)
  const totalValue = port.reduce((s, a) => s + G('assetNativeValue')(a), 0);
  const totalCost  = port.reduce((s, a) => s + (a.costBasis || 0), 0);
  const totalAbs   = port.reduce((s, a) => s + G('assetPnLBase')(a).abs, 0);
  ok('9.1 Σ assetNativeValue − Σ costBasis === Σ per-asset absolute P&L', near(totalValue - totalCost, totalAbs, 0.01), (totalValue - totalCost).toFixed(2) + ' vs ' + totalAbs.toFixed(2));
  ok('9.2 portfolio value/cost are canonical (8028.26 / 6322.61)', near(totalValue, 6028.26 + 2000, 0.01) && near(totalCost, 4822.61 + 1500, 0.01));
  ok('9.3 portfolio return coherent (≈26.98%)', near((totalValue - totalCost) / totalCost * 100, 26.9757, 1e-2));
  // non-gold-only portfolio unchanged vs the old qty×price behaviour
  const s2 = { ticker: 'MSFT', type: 'stock', qty: 5, price: 400, transactions: [{ type: 'buy', qty: 5, price: 300, ts: 1 }] };
  G('syncCostBasisFromTransactions')(s2);
  ok('9.4 non-gold-only portfolio: value=Σqty×price, unchanged', near(G('assetNativeValue')(stock) + G('assetNativeValue')(s2), 10 * 200 + 5 * 400));
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
