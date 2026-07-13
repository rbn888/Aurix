'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CATEGORY-PERFORMANCE-CONSISTENCY-harness — P0-CATEGORY-PERFORMANCE-CONSISTENCY
// ════════════════════════════════════════════════════════════════════════════
// Category headers used to derive their return from the categoryHistory snapshot time-series
// ((last−first)/first), producing figures (Stocks +598.80%) that had NO relationship to the sum of the
// per-row invested-cost P&L (~+37.79). This harness proves the two pure utilities computePositionPerformance
// / computeCategoryPerformance aggregate by SUMMING ABSOLUTES from cost basis (never averaging %, never from
// snapshots), that the category header renders from them (and hides Liquidity performance), that the
// aggregate reconciles with the rows within 0.01, and that NO snapshot/history/chart owner is used or
// touched by the fix.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing ' + n); return braceSlice(app, i); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }
const near = (a, b, eps) => Math.abs(a - b) <= (eps == null ? 1e-9 : eps);

// ── extract the two PURE utilities and run them in a sandbox ─────────────────
const ctx = { Number, Array, Object, Math, isFinite, parseInt, console: { log() {} } };
vm.createContext(ctx);
vm.runInContext(fnSrc('computePositionPerformance'), ctx);
vm.runInContext(fnSrc('computeCategoryPerformance'), ctx);
const CPP = (p) => vm.runInContext('computePositionPerformance', ctx)(p);
const CCP = (ps) => vm.runInContext('computeCategoryPerformance', ctx)(ps);

console.log('\nAURIX-CATEGORY-PERFORMANCE-CONSISTENCY — P0');

// ── 0 markers + single owners ────────────────────────────────────────────────
ok('0 SPEC marker present', app.indexOf('P0-CATEGORY-PERFORMANCE-CONSISTENCY') >= 0);
ok('0 single computePositionPerformance owner', (app.match(/^function computePositionPerformance\(/gm) || []).length === 1);
ok('0 single computeCategoryPerformance owner', (app.match(/^function computeCategoryPerformance\(/gm) || []).length === 1);
ok('0 window.aurixCategoryPerformanceAudit exposed', /window\.aurixCategoryPerformanceAudit = _aurixCategoryPerformanceAudit/.test(app));

// ── shape contracts ──────────────────────────────────────────────────────────
(function () {
  const r = CPP({ id: 'x', category: 'stock', quantity: 1, currentPrice: 10, averagePurchasePrice: 8 });
  const keys = ['id', 'category', 'quantity', 'currentPrice', 'averagePurchasePrice', 'currentValue', 'costBasis', 'absolutePnL', 'returnPct', 'state'];
  ok('P computePositionPerformance returns the exact contract keys', keys.every(k => k in r), JSON.stringify(Object.keys(r)));
  const a = CCP([{ category: 'stock', quantity: 1, currentPrice: 10, averagePurchasePrice: 8 }]);
  const ak = ['category', 'positionCount', 'readyPositionCount', 'currentValue', 'costBasis', 'absolutePnL', 'returnPct', 'state'];
  ok('C computeCategoryPerformance returns the exact contract keys', ak.every(k => k in a), JSON.stringify(Object.keys(a)));
})();

// ── 1 two stocks reconcile ────────────────────────────────────────────────────
(function () {
  const A = { id: 'A', category: 'stock', quantity: 2, averagePurchasePrice: 294.28, currentPrice: 313.59 };
  const B = { id: 'B', category: 'stock', quantity: 2, averagePurchasePrice: 243.18, currentPrice: 242.37 };
  const rA = CPP(A), rB = CPP(B), agg = CCP([A, B]);
  const rowSum = rA.absolutePnL + rB.absolutePnL;
  ok('1 categoryAbsolutePnL === Σ row P&L', near(agg.absolutePnL, rowSum), agg.absolutePnL + ' vs ' + rowSum);
  ok('1 categoryReturnPct === Σabs / Σcost * 100', near(agg.returnPct, (agg.absolutePnL / agg.costBasis) * 100), String(agg.returnPct));
  ok('1 state ready', agg.state === 'ready' && agg.readyPositionCount === 2);
})();

// ── 2 ETF/Funds mixed (neg / flat / pos) reconcile ────────────────────────────
(function () {
  const E1 = { category: 'etf', quantity: 1, averagePurchasePrice: 100, currentPrice: 90 };   // -10
  const E2 = { category: 'etf', quantity: 1, averagePurchasePrice: 100, currentPrice: 100 };  //   0
  const E3 = { category: 'etf', quantity: 1, averagePurchasePrice: 100, currentPrice: 130 };  // +30
  const agg = CCP([E1, E2, E3]);
  const rowSum = [E1, E2, E3].reduce((s, p) => s + CPP(p).absolutePnL, 0);
  ok('2 mixed ETF/Funds aggregate === Σ rows', near(agg.absolutePnL, rowSum) && near(agg.absolutePnL, 20));
  ok('2 pct = 20/300*100', near(agg.returnPct, 20 / 300 * 100));
})();

// ── 3 metals: gold negative, silver flat ⇒ category never positive ────────────
(function () {
  const gold = { category: 'metal', quantity: 10, averagePurchasePrice: 60, currentPrice: 50 };  // -100
  const silver = { category: 'metal', quantity: 10, averagePurchasePrice: 25, currentPrice: 25 }; //    0
  const agg = CCP([gold, silver]);
  ok('3 all-non-positive rows ⇒ category ≤ 0 (never fabricated positive)', agg.absolutePnL <= 0 && near(agg.absolutePnL, -100));
})();

// ── 4 missing average purchase price ⇒ missing_cost_basis, no fabricated return ─
(function () {
  const p = CPP({ category: 'stock', quantity: 2, currentPrice: 100 });   // no avg, no costBasis
  ok('4 position ⇒ missing_cost_basis, no fabricated return', p.state === 'missing_cost_basis' && p.absolutePnL === null && p.returnPct === null);
  const aggAll = CCP([{ category: 'stock', quantity: 2, currentPrice: 100 }]);
  ok('4 category (all missing cost) ⇒ missing_cost_basis, returnPct null', aggAll.state === 'missing_cost_basis' && aggAll.returnPct === null && aggAll.absolutePnL === null);
  const aggMix = CCP([{ category: 'stock', quantity: 2, averagePurchasePrice: 50, currentPrice: 60 }, { category: 'stock', quantity: 2, currentPrice: 100 }]);
  ok('4 category (one missing) ⇒ partial, aggregate over ready only, no fabrication', aggMix.state === 'partial' && aggMix.readyPositionCount === 1 && near(aggMix.absolutePnL, 20) && near(aggMix.costBasis, 100));
})();

// ── 5 missing current price ⇒ missing_price, no fabricated return ──────────────
(function () {
  const p = CPP({ category: 'stock', quantity: 2, averagePurchasePrice: 100 });   // costBasis derivable, price missing
  ok('5 position ⇒ missing_price (cost known, no price), no fabricated return', p.state === 'missing_price' && p.absolutePnL === null && p.returnPct === null && p.costBasis === 200);
  const agg = CCP([{ category: 'stock', quantity: 2, averagePurchasePrice: 100 }]);
  ok('5 category ⇒ missing_price, returnPct null', agg.state === 'missing_price' && agg.returnPct === null);
})();

// ── 5b zero / negative cost basis ⇒ never divide by zero ──────────────────────
(function () {
  const z = CPP({ category: 'stock', quantity: 1, currentPrice: 10, costBasis: 0 });
  const n = CPP({ category: 'stock', quantity: 1, currentPrice: 10, costBasis: -5 });
  ok('5b zero cost ⇒ zero_cost_basis, no division', z.state === 'zero_cost_basis' && z.returnPct === null);
  ok('5b negative cost ⇒ zero_cost_basis (guarded like assetPnLBase cost<=0)', n.state === 'zero_cost_basis' && n.returnPct === null);
})();

// ── 6 Liquidity: never shows fabricated investment performance ────────────────
(function () {
  const hdr = fnSrc('_aurixCategoryPerfUpdateHeader');
  ok('6 header short-circuits cash/liquidity to neutral copy', /key === 'cash' \|\| key === 'liquidity'/.test(hdr) && /Sin rendimiento de mercado/.test(hdr));
  ok('6 header never renders a % for the liquidity branch', /is-flat[\s\S]{0,120}Sin rendimiento de mercado[\s\S]{0,40}return;/.test(hdr));
})();

// ── 7 rounding: displayed aggregate === displayed row sum within 0.01 ──────────
(function () {
  const A = { category: 'stock', quantity: 3, averagePurchasePrice: 33.333333, currentPrice: 40.111111 };
  const B = { category: 'stock', quantity: 7, averagePurchasePrice: 12.987654, currentPrice: 11.111111 };
  const rowSum = +(CPP(A).absolutePnL + CPP(B).absolutePnL).toFixed(2);
  const aggDisp = +CCP([A, B]).absolutePnL.toFixed(2);
  ok('7 |displayedAggregate − displayedRowSum| ≤ 0.01', Math.abs(aggDisp - rowSum) <= 0.01, 'agg=' + aggDisp + ' rows=' + rowSum);
})();

// ── 8 aggregation sums ABSOLUTES (not %), uses NO snapshot/history/chart owner ─
(function () {
  const ccp = fnSrc('computeCategoryPerformance');
  ok('8 aggregate sums absolutePnL (reduce), not averaged percentages', /s \+ p\.absolutePnL/.test(ccp) && /absolutePnL \/ costBasis/.test(ccp) && !/returnPct.*reduce|reduce.*returnPct/.test(ccp));
  const forbidden = ['portfolioHistory', 'categoryHistory', 'buildProductionPortfolioChart', 'computePerformanceSnapshot', '_aurixRangeReturn', '_categorySeriesForRange'];
  // Scope to the actual calc + header path (the diagnostic's dataSource STRING legitimately names these
  // sources as ones it does NOT use, so it is asserted separately via usesPortfolioHistory:false).
  const bodies = fnSrc('computePositionPerformance') + ccp + fnSrc('_aurixCategoryPerfUpdateHeader');
  const hit = forbidden.filter(t => bodies.indexOf(t) >= 0);
  ok('8 category performance aggregate/header never reference snapshot/history/chart owners', hit.length === 0, 'hit: ' + hit.join(','));
  ok('8 diagnostic asserts usesPortfolioHistory:false', /usesPortfolioHistory: false/.test(app));
})();

// ── 9 chart renderer protection (v468 checkpoint) — untouched by this SPEC ─────
(function () {
  const chartFns = ['renderValidatedPortfolioChartWithInstitutionalRenderer', 'renderAurixInstitutionalChart', 'buildProductionPortfolioChart', '_aurixResolveFinalRenderSeriesContract'];
  const newSymbols = ['computeCategoryPerformance', 'computePositionPerformance', 'aurixCategoryPerformanceAudit', '_aurixPositionFromAsset'];
  chartFns.forEach(fn => {
    const single = (app.match(new RegExp('^function ' + fn + '\\(', 'gm')) || []).length === 1;
    const clean = single ? newSymbols.every(s => fnSrc(fn).indexOf(s) < 0) : false;
    ok('9 chart renderer ' + fn + ' single-owner + free of P0 symbols (byte-untouched)', single && clean);
  });
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' P0-CATEGORY-PERFORMANCE-CONSISTENCY — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
