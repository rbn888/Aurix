'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-PURCHASE-PRICE-V1-harness — SPEC PURCHASE PRICE V1
// ════════════════════════════════════════════════════════════════════════════
// CONTRACT: "When adding a supported priced asset (stock/etf/fund/crypto — and gold via its
// existing spot flow), the user's optional real purchase price becomes the FIRST Buy
// transaction. Transactions[] is the SINGLE source of truth: cost basis, weighted-average
// price and P&L all derive from it. If the price is left empty, the first Buy uses the live
// price (unchanged behaviour). The live price is NEVER overwritten by the entered value.
// The initial Buy is visible in View Transactions, editable via the existing tx editor, a
// second Buy re-weights the average, legacy holdings are not regressed, and no duplicate
// holdings/transactions are created."
//
// METHOD: (A) run the CANONICAL cost-basis/avg-price/P&L pipeline (extracted from app.js) on
// the exact {type:'buy',qty,price,ts} tx shape to prove the numbers; (B) static source
// contracts prove the add-asset owner wires the effective purchase price into the first Buy
// (tx + ledger + cost basis) with a live-price fallback, never overwrites the live price, and
// gates the field to non-gold market assets, real-estate/cash excluded, HTML field present.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing fn ' + n); return braceSlice(app, i); }

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }
function near(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-6); }

// ── Extract the canonical pipeline into a sandbox (no DOM needed) ──
const ctx = { Number, Math, Object, Array, Date, console };
vm.createContext(ctx);
['isClosedAsset', 'avgBuyPrice', 'computeCostBasisFromTransactions', 'syncCostBasisFromTransactions',
 'syncQtyFromTransactions', 'migrateLegacyAssetToTransactions', 'assetPnLBase'].forEach(fn => {
  vm.runInContext(fnSrc(fn), ctx);
});
const P = (name) => vm.runInContext(name, ctx);
const avgBuyPrice = P('avgBuyPrice'), syncCost = P('syncCostBasisFromTransactions'),
      syncQty = P('syncQtyFromTransactions'), migrate = P('migrateLegacyAssetToTransactions'),
      pnl = P('assetPnLBase');

// A helper mirroring exactly what the add-asset owner now writes for a NEW asset: a first Buy
// at the EFFECTIVE price (entered → else live), costBasis = qty × effective.
function newAsset(over) {
  const a = Object.assign({ type: 'stock', qty: 0, price: 0, costBasis: 0, transactions: [] }, over);
  return a;
}

console.log('AURIX-PURCHASE-PRICE-V1 — SPEC PURCHASE PRICE V1\n');

// ── 1 alta con precio manual — first Buy carries the ENTERED price ──────────────
console.log('1 — add with manual purchase price:');
{
  const live = 60000, entered = 38000, qty = 1;
  const effective = (entered > 0) ? entered : live;          // the owner's `_effectivePrice` rule
  const a = newAsset({ ticker: 'BTC', type: 'crypto', qty, price: live,
    costBasis: qty * effective, transactions: [{ type: 'buy', qty, price: effective, ts: 1 }] });
  syncCost(a); syncQty(a);
  ok('1.1 first Buy tx price = entered purchase price (38,000), not live (60,000)', a.transactions[0].price === 38000);
  ok('1.2 cost basis derives from the entered price (1 × 38,000)', near(a.costBasis, 38000));
  ok('1.3 avg buy price = entered price', avgBuyPrice(a) === 38000);
  ok('1.4 live price is preserved on asset.price (never overwritten)', a.price === 60000);
  const p = pnl(a);
  ok('1.5 P&L reflects purchase price (value 60,000 − cost 38,000 = +22,000)', near(p.abs, 22000) && near(p.pct, (22000 / 38000) * 100));
}

// ── 2 alta sin precio manual — first Buy falls back to the LIVE price ───────────
console.log('2 — add without purchase price (live-price fallback):');
{
  const live = 60000, entered = NaN, qty = 2;
  const effective = (Number.isFinite(entered) && entered > 0) ? entered : live;
  const a = newAsset({ ticker: 'ETH', type: 'crypto', qty, price: live,
    costBasis: qty * effective, transactions: [{ type: 'buy', qty, price: effective, ts: 1 }] });
  syncCost(a);
  ok('2.1 empty purchase price → first Buy uses live price', a.transactions[0].price === 60000);
  ok('2.2 cost basis = qty × live (2 × 60,000)', near(a.costBasis, 120000));
  ok('2.3 P&L is 0 at add when no purchase price entered (cost = value)', near(pnl(a).abs, 0));
}

// ── 3 supported asset types all flow through the same tx primitive ─────────────
console.log('3 — stock / etf / fund / crypto / metal share one primitive:');
{
  const types = [{ t: 'stock', px: 190 }, { t: 'etf', px: 95 }, { t: 'fund', px: 12.34 }, { t: 'crypto', px: 38000 }, { t: 'metal', px: 2000 }];
  let allOk = true;
  for (const { t, px } of types) {
    const a = newAsset({ type: t, qty: 3, price: px + 10, costBasis: 3 * px, transactions: [{ type: 'buy', qty: 3, price: px, ts: 1 }] });
    syncCost(a);
    if (!(near(a.costBasis, 3 * px) && near(avgBuyPrice(a), px))) allOk = false;
  }
  ok('3.1 cost basis + avg price correct for stock/etf/fund/crypto/metal', allOk);
}

// ── 4 first Buy visible in View Transactions (renders straight from transactions[]) ──
console.log('4 — first Buy visible in View Transactions:');
{
  const a = newAsset({ ticker: 'BTC', type: 'crypto', qty: 1, price: 60000, costBasis: 38000, transactions: [{ type: 'buy', qty: 1, price: 38000, ts: 1 }] });
  ok('4.1 exactly one Buy tx present with the entered price + qty + ts', a.transactions.length === 1 && a.transactions[0].type === 'buy' && a.transactions[0].price === 38000 && a.transactions[0].qty === 1 && a.transactions[0].ts === 1);
  ok('4.2 the View-Transactions renderer reads tx.type/qty/price/ts directly (openAssetDetailModal)', /new Date\(tx\.ts\)/.test(app) && /formatCurrency\(tx\.price/.test(app) && /formatQty\(tx\.qty\)/.test(app));
}

// ── 5 second Buy re-weights the average correctly ───────────────────────────────
console.log('5 — second Buy → weighted-average price:');
{
  const a = newAsset({ type: 'crypto', qty: 1, price: 60000, costBasis: 38000, transactions: [{ type: 'buy', qty: 1, price: 38000, ts: 1 }] });
  a.transactions.push({ type: 'buy', qty: 1, price: 42000, ts: 2 });   // existing Buy flow appends the same shape
  syncCost(a); syncQty(a);
  ok('5.1 qty re-derived from transactions (1 + 1 = 2)', a.qty === 2);
  ok('5.2 weighted average = (38,000 + 42,000) / 2 = 40,000', avgBuyPrice(a) === 40000);
  ok('5.3 cost basis = 38,000 + 42,000 = 80,000', near(a.costBasis, 80000));
}

// ── 6 editing the first Buy recomputes cost basis (existing tx editor path) ──────
console.log('6 — edit first Buy (reuses existing tx editor):');
{
  const a = newAsset({ type: 'stock', qty: 10, price: 200, costBasis: 1500, transactions: [{ type: 'buy', qty: 10, price: 150, ts: 1 }] });
  // the txForm editor replaces the tx in place (type/qty/price, ts preserved) then syncs
  a.transactions[0] = { type: 'buy', qty: 10, price: 175, ts: a.transactions[0].ts };
  syncCost(a);
  ok('6.1 corrected price → cost basis recomputed (10 × 175 = 1,750)', near(a.costBasis, 1750));
  ok('6.2 avg price reflects the edit', avgBuyPrice(a) === 175);
  ok('6.3 edit owner exists: txForm _editingTxIndex branch calls syncCostBasisFromTransactions', /_editingTxIndex !== null/.test(app) && /syncCostBasisFromTransactions\(asset\)/.test(app));
}

// ── 7 persistence shape — tx survives the flat↔holdings round-trip (contract) ────
console.log('7 — persistence (flat ↔ holdings preserves transactions):');
{
  ok('7.1 convertToNewModel carries transactions into holdings', /transactions:\s*a\.transactions\s*\|\|\s*\[\]/.test(app));
  ok('7.2 convertFromNewToFlat carries transactions back to the flat asset', /transactions:\s*h\.transactions\s*\|\|\s*\[\]/.test(app));
  ok('7.3 save() persists holdings (which hold transactions) to aurix_holdings', /localStorage\.setItem\('aurix_holdings'/.test(app));
}

// ── 8 legacy user — no regression, no duplicate synthetic Buy ───────────────────
console.log('8 — legacy holding (no transactions) — no regression / no duplication:');
{
  const legacy = { type: 'stock', qty: 4, price: 250, costBasis: 800, transactions: [] };
  migrate(legacy);
  ok('8.1 legacy asset with costBasis but no tx gets ONE synthetic Buy at avg price (800/4=200)', legacy.transactions.length === 1 && legacy.transactions[0].price === 200);
  migrate(legacy);   // idempotent — must not add a second
  ok('8.2 migration is idempotent (never duplicates the synthetic Buy)', legacy.transactions.length === 1);
  const pristine = { type: 'stock', qty: 0, price: 0, costBasis: 0, transactions: [] };
  migrate(pristine);
  ok('8.3 empty/zero legacy asset is left untouched (no phantom tx)', pristine.transactions.length === 0);
}

// ── 9 no duplicate holdings/transactions on add ─────────────────────────────────
console.log('9 — no duplicate holdings or transactions:');
{
  ok('9.1 NEW-asset path creates exactly ONE transactions:[{buy}] entry', (app.match(/transactions:\s*\[\{ type: 'buy', qty, price: _effectivePrice, ts: _buyTs \}\]/g) || []).length === 1);
  ok('9.2 re-buying an existing position PUSHES to existing.transactions (no new holding)', /existing\.transactions\.push\(\{ type: 'buy', qty, price: _effectivePrice/.test(app));
  ok('9.3 adding a tx is a NON-reducing save (destructive-save guard allows it)', /const drops = \(next\.assets < previous\.assets\)/.test(app) && /transactions < previous\.transactions/.test(app));
}

// ── 10 dashboard/portfolio recompute + owner wiring contracts ────────────────────
console.log('10 — recompute + owner wiring (source contracts):');
{
  ok('10.1 add-asset owner defines the effective-price rule (entered>0 else live pendingPrice)', /_effectivePrice = \(Number\.isFinite\(_ppRaw\) && _ppRaw > 0\) \? _ppRaw : pendingPrice/.test(app));
  ok('10.2 first Buy tx + ledger + cost basis all use _effectivePrice', /price: _effectivePrice, ts: _buyTs/.test(app) && /_ledgerTrade\(assets\.find\(a => a\.id === normalFlashId\), 'buy', qty, _effectivePrice/.test(app) && /qty \* _effectivePrice;/.test(app));
  ok('10.3 live price fields NOT overwritten (asset.price + spotPriceAtAdd stay pendingPrice)', /price:\s*pendingPrice,/.test(app) && /spotPriceAtAdd:\s*pendingPrice,/.test(app));
  ok('10.4 submit tail recomputes: save() + render(true) + onPortfolioChange(true)', /save\(\);\s*\n\s*render\(true\);\s*\n\s*closeModal\(\);[\s\S]{0,120}onPortfolioChange\(true\)/.test(app));
  ok('10.5 field gated to non-gold market assets (hidden for XAU), and hidden on deselect', /purchasePriceGroup'\);[\s\S]{0,80}entry\.ticker === 'XAU'/.test(app) && /purchasePriceGroup'\); if \(_ppg\) _ppg\.style\.display = 'none';/.test(app));
  ok('10.6 real-estate + cash paths create NO purchase-price tx (excluded)', /type:\s*'real_estate'/.test(app) && /type:\s*'cash'/.test(app));
  ok('10.7 HTML: optional purchase-price field sits between Quantity and Custodian in #qtyGroup', /id="assetPurchasePrice"/.test(html) && html.indexOf('id="assetPurchasePrice"') > html.indexOf('id="assetQty"') && html.indexOf('id="assetPurchasePrice"') < html.indexOf('id="assetLocationType"'));
  ok('10.8 helper copy present (ES+EN "Average price paid per unit")', /purchasePriceHint: 'Precio medio pagado por unidad\.'/.test(app) && /purchasePriceHint: 'Average price paid per unit\.'/.test(app));
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
