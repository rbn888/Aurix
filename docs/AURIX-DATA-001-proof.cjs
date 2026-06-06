'use strict';
/* AURIX-DATA-001 — proof harness (run: `node docs/AURIX-DATA-001-proof.cjs`).
   Replicates the EXACT logic of F1 (pence normalization, api/prices.js +
   api/prices/history-yahoo.js) and F3/F4 (the shared integrity invariant
   _aurixCategoryPointValid, app.js) and asserts the three properties required
   before shipping the fix: (1) F1 fixes UK holdings without breaking legit
   ones; (2) a real large rise still records; (3) the guard blocks ONLY
   impossible data, never legit moves or real volatility. No magnitude
   heuristics anywhere — see the "honest limitation" section. */

let pass = 0, fail = 0;
function check(name, cond) {
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${name}`);
  cond ? pass++ : fail++;
}
function approx(a, b, tol = 0.01) { return Math.abs(a - b) <= tol; }

// ── F1: exact copy of the normalization in api/prices.js / history-yahoo.js ──
function f1Normalize(rawCurrIn, priceIn) {
  let rawCurr = (typeof rawCurrIn === 'string') ? rawCurrIn.trim() : '';
  let price = priceIn;
  const isPence = (rawCurr === 'GBp') || (rawCurr.toUpperCase() === 'GBX');
  if (isPence) { price = price / 100; rawCurr = 'GBP'; }
  const currency = /^[A-Z]{3}$/.test(rawCurr) ? rawCurr : null;
  return { price, currency };
}

// ── client valuation (USD/EUR-only model, unchanged — usdToEur = 0.92) ──
const usdToEur = 0.92;
function assetValueUSD(price, qty, curr) {        // mirrors app.js:4462
  const native = qty * price;
  return (curr || 'USD') === 'USD' ? native : native / usdToEur;
}
// What the client stores: NEW adds stamp the gateway currency (resolveSymbolQuote);
// a null gateway currency falls back to 'USD' (snapshot.js:471 / app.js:21515).
function storedCurrency(gatewayCurrency) { return gatewayCurrency || 'USD'; }

// ── F3/F4: exact copy of _aurixCategoryPointValid from app.js ──
const BUCKETS = ['crypto','stock','etf','fund','metal','real_estate','liquidity','other'];
function pointValid(p) {
  if (!p || typeof p.ts !== 'number' || !Number.isFinite(p.ts)) return false;
  if (typeof p.total !== 'number' || !Number.isFinite(p.total) || p.total < 0) return false;
  let sum = 0, sawBucket = false;
  for (const k of BUCKETS) {
    if (p[k] === undefined || p[k] === null) continue;
    const v = Number(p[k]);
    if (!Number.isFinite(v) || v < 0) return false;
    sum += v; sawBucket = true;
  }
  if (sawBucket && Math.abs(p.total - sum) > Math.max(1, p.total * 0.05)) return false;
  return true;
}
const T = Date.now();
const pt = (total, b = {}) => Object.assign({ ts: T, total }, b);

console.log('\n=== PROOF 1 - F1 fixes UK holdings, does NOT break legit ones ===');
{
  // A real UK pence stock: BP.L quoted by Yahoo at 480 GBp = GBP 4.80, qty 100 -> GBP 480.
  // True USD value ~= 480 * 1.27 = $609.60.
  const trueUsd = 480 * 1.27;
  const beforeCurr = storedCurrency(/^[A-Z]{3}$/.test('GBp') ? 'GBp' : null); // 'GBp' fails ISO -> null -> USD
  const beforeVal  = assetValueUSD(480, 100, beforeCurr);   // 100 x 480 as USD
  const after = f1Normalize('GBp', 480);
  const afterVal  = assetValueUSD(after.price, 100, storedCurrency(after.currency));
  console.log(`  BP.L (480 GBp x100 = GBP480, true ~ $${trueUsd.toFixed(2)})`);
  console.log(`    before F1: {price:480, curr:${beforeCurr}} -> $${beforeVal.toFixed(2)}  (x${(beforeVal/trueUsd).toFixed(1)} off)`);
  console.log(`    after  F1: {price:${after.price}, curr:${after.currency}} -> $${afterVal.toFixed(2)}  (x${(afterVal/trueUsd).toFixed(3)} of true)`);
  check('before F1 was catastrophically inflated (>50x true value)', beforeVal / trueUsd > 50);
  check('after F1 is the correct order of magnitude (within 20% of true)', Math.abs(afterVal/trueUsd - 1) < 0.20);
  check('F1 normalizes GBp price exactly /100 (480 -> 4.80)', approx(after.price, 4.80));
  check('F1 stamps real ISO currency GBP (not null/USD)', after.currency === 'GBP');
  const gbx = f1Normalize('GBX', 9500);
  check('GBX (9500) also normalized -> 95.00 GBP', approx(gbx.price, 95) && gbx.currency === 'GBP');
  const gbp = f1Normalize('GBP', 95.00);
  check('legit GBP (pounds) quote UNCHANGED (no /100)', approx(gbp.price, 95.00) && gbp.currency === 'GBP');
  const usd = f1Normalize('USD', 512.34);
  check('USD quote (e.g. CSPX.L) UNCHANGED', approx(usd.price, 512.34) && usd.currency === 'USD');
  const eur = f1Normalize('EUR', 88.21);
  check('EUR quote (e.g. IWDA.AS) UNCHANGED', approx(eur.price, 88.21) && eur.currency === 'EUR');
}

console.log('\n=== PROOF 2 - a real LARGE rise still records (no magnitude limit) ===');
{
  check('1k -> 101k cash deposit records', pointValid(pt(101000, { liquidity: 101000 })));
  check('1000x deposit (1k -> 1,000,000) records', pointValid(pt(1000000, { liquidity: 1000000 })));
  check('big buy: 50k stock + 6k crypto records', pointValid(pt(56000, { stock: 50000, crypto: 6000 })));
  check('+50% crypto day (6k -> 9k) records - volatility not hidden', pointValid(pt(9000, { crypto: 9000 })));
  check('-40% crypto crash (10k -> 6k) records - downside not hidden', pointValid(pt(6000, { crypto: 6000 })));
  check('real-estate-heavy 386k net worth records', pointValid(pt(386000, { real_estate: 380000, crypto: 6000 })));
  check('penny rounding (total 100.01 vs sum 100.00) records', pointValid(pt(100.01, { crypto: 100.00 })));
}

console.log('\n=== PROOF 3 - guard blocks ONLY impossible / corrupt data ===');
{
  check('total = NaN rejected',               !pointValid(pt(NaN,       { crypto: 1 })));
  check('total = Infinity rejected',          !pointValid(pt(Infinity,  { crypto: Infinity })));
  check('total negative rejected',            !pointValid(pt(-5000,     { crypto: -5000 })));
  check('bucket real_estate = NaN rejected',  !pointValid(pt(5000,      { real_estate: NaN, crypto: 5000 })));
  check('bucket crypto = Infinity rejected',  !pointValid(pt(5000,      { crypto: Infinity })));
  check('negative bucket rejected',           !pointValid(pt(5000,      { crypto: -1, stock: 5001 })));
  check('total contradicts buckets (600k vs sum 6k) rejected', !pointValid(pt(600000, { stock: 6000 })));
  check('buckets exceed total (sum 600k vs total 6k) rejected', !pointValid(pt(6000,  { stock: 600000 })));
  check('missing ts rejected',                !pointValid({ total: 5000, crypto: 5000 }));
}

console.log('\n=== HONEST LIMITATION (by design - no magnitude heuristic) ===');
{
  // A *consistently* inflated value (one asset mis-priced 100x) yields a point
  // where total === sum(buckets), so F3/F4 (consistency + finiteness) CANNOT and
  // MUST NOT reject it - that would require a magnitude heuristic, which the
  // spec forbids (it would also block a legit large deposit). This is exactly
  // why F1 (source fix) is the primary remedy; F3/F4 are NaN/Inf/inconsistency
  // backstops only.
  check('consistently-inflated point PASSES guard (only F1 stops it at source)', pointValid(pt(600000, { stock: 600000 })));
  console.log('     -> handled by F1; F3/F4 are backstops for NaN/Inf/inconsistency only.');
}

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
