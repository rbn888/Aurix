'use strict';
/* F2 (A+C) proof harness — run: `node docs/F2-fx-proof.cjs`.
   Replicates the EXACT F2-A FX engine + F2-C snapshot-guard logic from app.js,
   plus the PRE-F2 ("OLD") formulas, and asserts:
   (2) GBP/CHF/JPY convert correctly; (3) USD/EUR are byte-identical to pre-F2;
   (4) an FX failure (unknown currency) never corrupts portfolioHistory or
   categoryHistory. No "non-USD = EUR" anywhere. */

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? '  PASS' : '  FAIL'}  ${name}`); cond ? pass++ : fail++; };
const approx = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

const usdToEur = 0.92;                                   // app.js anchor (unchanged)
const FALLBACK = { USD: 1, GBP: 1.27, CHF: 1.11, JPY: 0.0064 };
let CACHE = null;                                        // { ts, rates } | null  (live), TTL 12h
const TTL = 12 * 60 * 60 * 1000;
const fresh = () => !!(CACHE && CACHE.rates && (Date.now() - CACHE.ts) < TTL);

// ── exact replica of _aurixFxLookup / _aurixFxRate / _aurixFxStatus (app.js) ──
function fxLookup(ccy) {
  const c = String(ccy || '').toUpperCase();
  if (c === 'USD') return { rate: 1, status: 'live' };
  if (c === 'EUR') return { rate: (Number.isFinite(usdToEur) && usdToEur > 0) ? 1 / usdToEur : null, status: 'live' };
  if (fresh()) { const r = CACHE.rates[c]; if (Number.isFinite(r) && r > 0) return { rate: r, status: 'live' }; }
  const fb = FALLBACK[c];
  if (Number.isFinite(fb) && fb > 0) return { rate: fb, status: 'approx' };
  return { rate: null, status: 'unknown' };
}
const fxRate = (c) => fxLookup(c).rate;
const fxStatus = (c) => fxLookup(c).status;

// ── NEW toBase / assetValueUSD (exact replica) ──
function toBase(amount, from, base) {
  from = (from || 'USD').toUpperCase();
  if (from === base) return amount;
  if (from === 'USD' && base === 'EUR') return amount * usdToEur;
  if (from === 'EUR' && base === 'USD') return amount / usdToEur;
  const fr = fxRate(from), br = fxRate(base);
  if (!Number.isFinite(fr) || !Number.isFinite(br) || br <= 0) return NaN;
  return amount * fr / br;
}
function assetValueUSD(native, curr) {
  curr = (curr || 'USD').toUpperCase();
  if (curr === 'USD') return native;
  if (curr === 'EUR') return native / usdToEur;
  const r = fxRate(curr);
  return Number.isFinite(r) ? native * r : NaN;
}
// ── OLD (pre-F2) formulas for the identity comparison ──
function oldToBase(amount, from, base) {
  from = (from || 'USD').toUpperCase();
  if (from === base) return amount;
  if (from === 'USD') return amount * usdToEur;
  return amount / usdToEur;
}
const oldAssetValueUSD = (native, curr) => ((curr || 'USD').toUpperCase() === 'USD') ? native : native / usdToEur;

// ── sum + coverage replicas ──
const valUSD = (a) => assetValueUSD(a.qty * a.price, a.assetCurrency);
const totalValueUSD = (assets) => assets.reduce((s, a) => { const v = valUSD(a); return Number.isFinite(v) ? s + v : s; }, 0);
const uncovered = (assets) => assets.filter(a => fxStatus(a.assetCurrency || 'USD') === 'unknown').length;
const approxUsed = (assets) => assets.some(a => fxStatus(a.assetCurrency || 'USD') === 'approx');
// DATA-001 validator (categoryHistory point)
const BUCKETS = ['crypto','stock','etf','fund','metal','real_estate','liquidity','other'];
function pointValid(p) {
  if (!p || typeof p.ts !== 'number' || !Number.isFinite(p.ts)) return false;
  if (typeof p.total !== 'number' || !Number.isFinite(p.total) || p.total < 0) return false;
  let sum = 0, saw = false;
  for (const k of BUCKETS) { if (p[k] == null) continue; const v = Number(p[k]); if (!Number.isFinite(v) || v < 0) return false; sum += v; saw = true; }
  if (saw && Math.abs(p.total - sum) > Math.max(1, p.total * 0.05)) return false;
  return true;
}

console.log('\n=== PROOF 3 - USD & EUR are BYTE-IDENTICAL to pre-F2 ===');
{
  let ident = true;
  for (const base of ['USD', 'EUR']) {
    for (const from of ['USD', 'EUR']) {
      for (const amt of [0, 1, 100, 1234.56, 999999.99]) {
        if (toBase(amt, from, base) !== oldToBase(amt, from, base)) { ident = false; console.log(`    mismatch toBase(${amt},${from},${base})`); }
      }
    }
    for (const curr of ['USD', 'EUR']) {
      for (const native of [0, 1, 100, 1234.56, 999999.99]) {
        if (assetValueUSD(native, curr) !== oldAssetValueUSD(native, curr)) { ident = false; console.log(`    mismatch assetValueUSD(${native},${curr})`); }
      }
    }
  }
  check('toBase + assetValueUSD === pre-F2 for ALL USD/EUR cases (strict ===)', ident);
  // live cache must NOT change USD/EUR (EUR is anchored, not fetched)
  CACHE = { ts: Date.now(), rates: { GBP: 1.30, CHF: 1.15, JPY: 0.0070 } };
  check('EUR unchanged even with a live FX cache present', assetValueUSD(1000, 'EUR') === oldAssetValueUSD(1000, 'EUR'));
  CACHE = null;
}

console.log('\n=== PROOF 2 - GBP / CHF / JPY convert correctly (base EUR) ===');
{
  CACHE = null;  // use static fallback (approx)
  const gbp = toBase(assetValueUSD(1000, 'GBP'), 'USD', 'EUR');
  const chf = toBase(assetValueUSD(1000, 'CHF'), 'USD', 'EUR');
  const jpy = toBase(assetValueUSD(100000, 'JPY'), 'USD', 'EUR');
  console.log(`  GBP1000 -> ${gbp.toFixed(2)} EUR (old bug: ${oldToBase(oldAssetValueUSD(1000,'GBP'),'USD','EUR').toFixed(2)})`);
  console.log(`  CHF1000 -> ${chf.toFixed(2)} EUR (old bug: ${oldToBase(oldAssetValueUSD(1000,'CHF'),'USD','EUR').toFixed(2)})`);
  console.log(`  JPY100000 -> ${jpy.toFixed(2)} EUR (old bug: ${oldToBase(oldAssetValueUSD(100000,'JPY'),'USD','EUR').toFixed(2)})`);
  check('GBP 1000 -> ~1168.40 EUR (1000*1.27*0.92)', approx(gbp, 1168.40, 0.5));
  check('CHF 1000 -> ~1021.20 EUR (1000*1.11*0.92)', approx(chf, 1021.20, 0.5));
  check('JPY 100000 -> ~588.80 EUR (100000*0.0064*0.92)', approx(jpy, 588.80, 0.5));
  check('OLD code mis-valued JPY catastrophically (showed ~100000 EUR)', approx(oldToBase(oldAssetValueUSD(100000,'JPY'),'USD','EUR'), 100000, 1));
  check('GBP via fallback is flagged approx (not live, not unknown)', fxStatus('GBP') === 'approx');
  // live cache path
  CACHE = { ts: Date.now(), rates: { GBP: 1.30 } };
  check('GBP uses LIVE rate when cache fresh (1.30, status live)', fxStatus('GBP') === 'live' && approx(assetValueUSD(1000,'GBP'), 1300, 0.01));
  CACHE = null;
}

console.log('\n=== PROOF 4 - an FX failure NEVER corrupts portfolioHistory / categoryHistory ===');
{
  CACHE = null;
  // SEK has no live rate and no fallback -> genuinely unknown.
  check('unknown currency (SEK) -> assetValueUSD NaN (never invented)', Number.isNaN(assetValueUSD(5000, 'SEK')));
  check('unknown currency status = unknown', fxStatus('SEK') === 'unknown');

  // Mixed portfolio: USD covered + SEK uncovered.
  const mixed = [ { qty: 1, price: 1000, assetCurrency: 'USD' }, { qty: 1, price: 5000, assetCurrency: 'SEK' } ];
  const tot = totalValueUSD(mixed);
  check('total excludes uncovered SEK and stays FINITE (no NaN poison)', Number.isFinite(tot) && approx(tot, 1000, 0.01));
  check('uncovered count = 1 (SEK)', uncovered(mixed) === 1);

  // recordSnapshot simulation (portfolioHistory): finite guard + fxPartial flag.
  const history = [{ ts: 1, value: 900 }];
  (function recordSnapshot(assets) {
    const val = totalValueUSD(assets);
    if (!Number.isFinite(val) || val <= 0) return;            // guard (DATA-001)
    const p = { ts: 2, value: +val.toFixed(2) };
    if (uncovered(assets) > 0) p.fxPartial = true;
    if (approxUsed(assets))    p.fxApprox  = true;
    history.push(p);
  })(mixed);
  check('portfolioHistory got a FINITE point (1000), flagged fxPartial', history.length === 2 && history[1].value === 1000 && history[1].fxPartial === true);
  check('no NaN/garbage ever written to portfolioHistory', history.every(p => Number.isFinite(p.value) && p.value > 0));

  // All-uncovered portfolio -> total 0 -> NOT persisted at all.
  const allBad = [{ qty: 1, price: 5000, assetCurrency: 'SEK' }];
  const h2 = [{ ts: 1, value: 900 }];
  (function recordSnapshot(assets) { const val = totalValueUSD(assets); if (!Number.isFinite(val) || val <= 0) return; h2.push({ ts: 2, value: val }); })(allBad);
  check('fully-uncovered portfolio -> snapshot NOT persisted (history unchanged)', h2.length === 1);

  // categoryHistory simulation: SEK excluded from total+buckets, stays consistent.
  (function recordCategory(assets) {
    const buckets = { crypto:0, stock:0, etf:0, fund:0, metal:0, real_estate:0, liquidity:0, other:0 };
    let total = 0;
    for (const a of assets) { const v = valUSD(a); if (!Number.isFinite(v) || v <= 0) continue; buckets.stock += v; total += v; }
    if (total <= 0) return null;
    const pnt = { ts: 3, total: +total.toFixed(2), ...Object.fromEntries(Object.entries(buckets).map(([k,v]) => [k, +v.toFixed(2)])) };
    if (uncovered(assets) > 0) pnt.fxPartial = true;
    check('categoryHistory point excludes SEK, total == sum(buckets), fxPartial set', pnt.total === 1000 && pnt.stock === 1000 && pnt.fxPartial === true);
    check('categoryHistory point passes DATA-001 F4 validator (not corrupt)', pointValid(pnt));
  })(mixed);
}

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
