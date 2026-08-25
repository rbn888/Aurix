'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-NEGATIVE-QUANTITY-FAIL-CLOSED-harness — SPEC P0 FOUNDATION HARDENING
// ════════════════════════════════════════════════════════════════════════════
// A POSITION WITH A NEGATIVE QUANTITY IS NOT A FINANCIAL POSITION.
//
// The defect, reproduced against the real valueUser BEFORE any change: quantity
// was read with `Number(h.quantity)` and guarded only by `=== 0` and
// `!Number.isFinite`. A finite negative passes both, so it reached the valuation
// as a REAL amount and SUBTRACTED patrimony on every surface at once:
//
//   cash USD qty −500                    ⇒ total −500,  asset_values {c:−500}
//   valid 4000 + cash USD qty −500       ⇒ total 3500,  asset_values {c:−500},
//                                          dropped 0 ⇒ LB-1 satisfied ⇒ PERSISTED
//
// That second row is the dangerous one: a snapshot that looks entirely valid and
// is 500 USD wrong. And a lone negative position was worse than wrong, it was
// invisible — total ≤ 0 filed the account as EMPTY ("nothing to capture") with
// dropped 0 and no warning, so no operator could ever name it.
//
// The fix is a domain validation at the QUANTITY boundary — not through
// usableFactor, which governs multiplicative FACTORS and rejects 0, whereas a
// quantity of 0 is a legitimate closed position that must keep being skipped
// silently. Two contracts, deliberately kept apart.
//
// CONTRACT CERTIFIED HERE:
//   qty > 0   → valued exactly as before (byte-identical outcome)
//   qty === 0 → skipped silently, NOT dropped (closed / liquidated, unchanged)
//   qty < 0   → FAIL-CLOSED: no total, no category_values, no asset_values,
//               dropped++, stable operational warning, LB-1 refuses the SNAPSHOT
//
// This gate EXECUTES the real valueUser transpiled from the Edge Function. It
// never reimplements the valuation.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const TS_PATH = path.join(ROOT, 'supabase', 'functions', 'portfolio-snapshot', 'index.ts');
const ts = fs.readFileSync(TS_PATH, 'utf8');

let pass = 0, fail = 0;
function ok(n, c, info) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } }

// ── the REAL owner, executed ────────────────────────────────────────────────
function extractFn(name, src) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('missing ' + name);
  let d = 0, st = false;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') { d++; st = true; }
    else if (src[k] === '}') { d--; if (st && !d) return src.slice(i, k + 1); }
  }
  throw new Error('unterminated ' + name);
}
// TS→JS by LITERAL list, never a generic regex: an annotation `:` and a ternary `:` are
// indistinguishable without a real parser, and an approximate regex mutilates the body in
// silence — the worst harness failure, because it would then test code that is not
// production's. If a signature moves, assertTranspiled turns this red instead.
const TS_STRIP = [
  ['function bucketOf(type: string): string {', 'function bucketOf(type) {'],
  ['function goldPurity(k: any): number {', 'function goldPurity(k) {'],
  ['function goldGrams(qty: number, unit: string): number {', 'function goldGrams(qty, unit) {'],
  ['function isUsEquityOpenNow(now: Date): boolean {', 'function isUsEquityOpenNow(now) {'],
  ['function usableFactor(v: any): number {', 'function usableFactor(v) {'],
  ['function fxToUsd(cur: string, prices: Map<string, { price: number; currency: string }>): number {', 'function fxToUsd(cur, prices) {'],
  ['function valueUser(row: any, prices: Map<string, { price: number; currency: string }>, now: Date) {', 'function valueUser(row, prices, now) {'],
  ['const catalog: any[] =', 'const catalog ='],
  ['const holdings: any[] =', 'const holdings ='],
  ['new Map<any, any>(', 'new Map('],
  ['const categories: Record<string, number> = {}', 'const categories = {}'],
  ['const assetValues: Record<string, number> = {}', 'const assetValues = {}'],
  ['const warnings: string[] = []', 'const warnings = []'],
  ['catalog.map((a: any) =>', 'catalog.map((a) =>'],
  ['let valueUSD: number =', 'let valueUSD ='],
];
let js = ts;
for (const [a, b] of TS_STRIP) js = js.split(a).join(b);
js = js.replace(/\b(let|const|var)\s+(\w+)\s*:\s*[\w<>\[\]{}, ;|]+?\s*=/g, '$1 $2 =');
const NAMES = ['bucketOf', 'goldPurity', 'goldGrams', 'isUsEquityOpenNow', 'usableFactor', 'fxToUsd', 'valueUser'];
const SRC = NAMES.map(n => extractFn(n, js)).join('\n');
function assertTranspiled(src) {
  const bad = src.split('\n').filter(l => /\b(any|Record<|Map<|: string|: number|: boolean|: Date)\b/.test(l) && !/^\s*\/\//.test(l));
  return bad.length ? bad[0].trim().slice(0, 110) : null;
}
const CONSTS = 'const OZ_TO_G = 31.1034768;'
  + 'const PURITY_TABLE = { "10":0.4167,"14":0.5833,"18":0.7500,"21":0.8750,"22":0.9167,"24":1.0000 };';
let valueUser = null, buildErr = null;
try {
  const leftover = assertTranspiled(SRC);
  if (leftover) throw new Error('TypeScript sin despojar (¿cambió una firma?): ' + leftover);
  valueUser = new Function(CONSTS + '\n' + SRC + '\n;return valueUser;')();
} catch (e) { buildErr = String((e && e.message) || e); }

// Executable surface only: the comments deliberately NAME what must not happen.
const TS_CODE = ts.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

const NOW = new Date('2026-08-24T15:00:00Z');   // US equities OPEN, fixed instant
const PX = (o) => new Map(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? { price: v, currency: 'USD' } : v]));
const GOOD = PX({ AAPL: 200 });
const sum = o => Object.values(o).reduce((s, x) => s + Number(x), 0);
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 0.011 : t);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// EXACTLY the capturer's decision, mirrored from index.ts (the `empty` branch then LB-1).
// A snapshot is only persisted when the total is positive AND nothing was dropped.
const persisted = v => Number.isFinite(v.total) && v.total > 0 && Number(v.dropped_asset_count) === 0;
const lb1Outcome = v => (!Number.isFinite(v.total) || v.total <= 0)
  ? (Number(v.dropped_asset_count) > 0 ? 'INCOMPLETE' : 'EMPTY')
  : (Number(v.dropped_asset_count) > 0 ? 'INCOMPLETE' : 'INSERTED');

// A = a valid position worth 1000. B = the position under test.
const VALID = { id: 'a', symbol: 'AAPL', type: 'stock', currentPrice: 200, assetCurrency: 'USD' };
const row = (b, hb) => ({
  assets: [VALID].concat(b ? [b] : []),
  holdings: [{ id: 'h1', asset_id: 'a', quantity: 5 }].concat(b ? [Object.assign({ id: 'h2', asset_id: b.id, quantity: 10 }, hb || {})] : []),
});
const val = (b, hb, px) => valueUser(row(b, hb), px || GOOD, NOW);
const B = (over) => Object.assign({ id: 'b', symbol: 'GHOST', type: 'stock', currentPrice: 40, assetCurrency: 'USD' }, over);
const solo = (asset, qty, px) => valueUser({ assets: [asset], holdings: [{ id: 'h', asset_id: asset.id, quantity: qty }] }, px || GOOD, NOW);

console.log('\n════ AURIX-NEGATIVE-QUANTITY-FAIL-CLOSED ════\n');
console.log('0 · The real owner executes:');
ok('0.1 valueUser extracted and runnable from index.ts', valueUser !== null, buildErr || '');
if (!valueUser) { console.log('\n✗ FAIL  cannot assert anything without the real owner\n'); process.exit(1); }

// ── 1 · Every asset kind: a negative quantity is FAIL-CLOSED ────────────────
console.log('\n1 · qty < 0 is fail-closed on EVERY valuation branch:');
{
  const KINDS = [
    ['1.1 ordinary stock',        B({ symbol: 'AAPL', currentPrice: 200 }), GOOD],
    ['1.2 crypto',               B({ symbol: 'BTC', type: 'crypto', currentPrice: 100000 }), PX({ AAPL: 200, BTC: 100000 })],
    ['1.3 cash USD (reviewer\'s case)', B({ symbol: 'USD', type: 'cash', currentPrice: 1, assetCurrency: 'USD' }), GOOD],
    ['1.4 cash EUR with a valid FX rate', B({ symbol: 'EUR', type: 'cash', currentPrice: 1, assetCurrency: 'EUR' }), PX({ AAPL: 200, 'EURUSD=X': 1.1 })],
    ['1.5 liquidity bucket type', B({ symbol: 'CAJA', type: 'liquidity', currentPrice: 1, assetCurrency: 'USD' }), GOOD],
    ['1.6 physical gold XAU',    B({ symbol: 'XAU', type: 'metal', karat: '24', goldUnit: 'g', currentPrice: 3000 }), PX({ AAPL: 200, 'XAU/USD': 3000 })],
    ['1.7 metal, non-gold',      B({ symbol: 'XAG', type: 'metal', currentPrice: 30 }), PX({ AAPL: 200, XAG: 30 })],
    ['1.8 real_estate',          B({ symbol: 'HOME', type: 'real_estate', currentPrice: 300000 }), GOOD],
    ['1.9 etf',                  B({ symbol: 'VWCE', type: 'etf', currentPrice: 110 }), PX({ AAPL: 200, VWCE: 110 })],
    ['1.10 fund',                B({ symbol: 'FND', type: 'fund', currentPrice: 15 }), PX({ AAPL: 200, FND: 15 })],
    ['1.11 other / unknown type', B({ symbol: 'MISC', type: 'weird', currentPrice: 7 }), PX({ AAPL: 200, MISC: 7 })],
  ];
  KINDS.forEach(([label, b, px]) => {
    const v = val(b, { quantity: -10 }, px);
    ok(label + ' ⇒ dropped, absent from all three surfaces, snapshot refused',
      Number(v.dropped_asset_count) === 1
      && !has(v.assetValues, 'b')
      && !persisted(v)
      && v.total === 1000                                   // exactly the valid position, nothing subtracted
      && near(sum(v.categories), 1000),
      'total=' + v.total + ' drop=' + v.dropped_asset_count + ' av=' + JSON.stringify(v.assetValues)
      + ' cv=' + JSON.stringify(v.categories));
  });
  ok('1.12 the gold branch cannot value a negative through grams × purity either',
    (function () {
      const w = solo({ id: 'g', symbol: 'XAU', type: 'metal', karat: '24', goldUnit: 'oz', currentPrice: 3000, assetCurrency: 'USD' },
        -100, PX({ 'XAU/USD': 3000 }));
      return Number(w.dropped_asset_count) === 1 && !has(w.assetValues, 'g') && w.total === 0 && !persisted(w);
    })());
}

// ── 2 · The exact case observed by the Financial Reviewer ──────────────────
console.log('\n2 · The observed case: −500 USD cash beside a valid position:');
{
  const v = valueUser({
    assets: [VALID, { id: 'c', symbol: 'USD', type: 'cash', currentPrice: 1, assetCurrency: 'USD' }],
    holdings: [{ id: 'h1', asset_id: 'a', quantity: 20 }, { id: 'h2', asset_id: 'c', quantity: -500 }],
  }, GOOD, NOW);
  ok('2.1 the negative no longer reaches asset_values', !has(v.assetValues, 'c'), JSON.stringify(v.assetValues));
  ok('2.2 the negative no longer subtracts from total_value_usd (4000, not 3500)', v.total === 4000, String(v.total));
  ok('2.3 the negative no longer reaches category_values (no liquidity bucket at all)',
    !has(v.categories, 'liquidity'), JSON.stringify(v.categories));
  ok('2.4 dropped_asset_count rises to 1', Number(v.dropped_asset_count) === 1);
  ok('2.5 LB-1 refuses the WHOLE snapshot — the plausible-but-wrong row is never persisted',
    !persisted(v) && lb1Outcome(v) === 'INCOMPLETE');
  ok('2.6 the valid position is still valued (the fix does not over-refuse)', v.assetValues.a === 4000);
  ok('2.7 asset_count counts only what was actually valued', Number(v.count) === 1);
}

// ── 3 · A LONE negative position stops being reported as EMPTY ─────────────
console.log('\n3 · A lone negative position is INCOMPLETE, never "nothing to capture":');
{
  const v = solo({ id: 'c', symbol: 'USD', type: 'cash', currentPrice: 1, assetCurrency: 'USD' }, -500, PX({}));
  ok('3.1 it is dropped, so the outcome is INCOMPLETE and not EMPTY',
    Number(v.dropped_asset_count) === 1 && lb1Outcome(v) === 'INCOMPLETE', lb1Outcome(v));
  ok('3.2 the capturer branch that decides this exists and keys on dropped > 0',
    /noteHealth\(r\.user_id, Number\(v\.dropped_asset_count\) > 0 \? 'INCOMPLETE' : 'EMPTY'/.test(ts));
  ok('3.3 a genuinely empty account is still EMPTY, not INCOMPLETE (no over-reporting)',
    (function () {
      const w = solo({ id: 'z', symbol: 'CLOSED', type: 'stock', currentPrice: 40, assetCurrency: 'USD' }, 0, GOOD);
      return Number(w.dropped_asset_count) === 0 && lb1Outcome(w) === 'EMPTY';
    })());
}

// ── 4 · Reconciliation: one truth across the three surfaces ────────────────
console.log('\n4 · Reconciliation — no surface values what another discards:');
{
  const px = PX({ AAPL: 200, BTC: 100000, 'EURUSD=X': 1.1 });
  const r = {
    assets: [
      VALID,
      { id: 'b', symbol: 'BTC',  type: 'crypto', currentPrice: 100000, assetCurrency: 'USD' },
      { id: 'c', symbol: 'EUR',  type: 'cash',   currentPrice: 1,      assetCurrency: 'EUR' },
      { id: 'd', symbol: 'HOME', type: 'real_estate', currentPrice: 300000, assetCurrency: 'USD' },
      { id: 'n', symbol: 'BAD',  type: 'stock',  currentPrice: 50,     assetCurrency: 'USD' },
    ],
    holdings: [
      { id: 'h1', asset_id: 'a', quantity: 5 }, { id: 'h2', asset_id: 'b', quantity: 0.5 },
      { id: 'h3', asset_id: 'c', quantity: 1000 }, { id: 'h4', asset_id: 'd', quantity: 1 },
      { id: 'h5', asset_id: 'n', quantity: -20 },
    ],
  };
  const v = valueUser(r, px, NOW);
  ok('4.1 the dropped position is absent from asset_values', !has(v.assetValues, 'n'), JSON.stringify(v.assetValues));
  ok('4.2 Σ asset_values reconciles with total_value_usd', near(sum(v.assetValues), v.total), sum(v.assetValues) + ' vs ' + v.total);
  ok('4.3 Σ category_values reconciles with total_value_usd', near(sum(v.categories), v.total), sum(v.categories) + ' vs ' + v.total);
  ok('4.4 the total is the four valid positions only — nothing added, nothing subtracted',
    near(v.total, 1000 + 50000 + 1100 + 300000), String(v.total));
  ok('4.5 no category bucket is negative', Object.values(v.categories).every(x => Number(x) >= 0), JSON.stringify(v.categories));
  ok('4.6 no asset_values entry is negative', Object.values(v.assetValues).every(x => Number(x) >= 0), JSON.stringify(v.assetValues));
  ok('4.7 real_estate keeps its own column and its bucket, unaffected',
    near(v.realEstate, 300000) && near(v.categories.real_estate, 300000));
  ok('4.8 investable is still total − real_estate', near(v.total - v.realEstate, 1000 + 50000 + 1100));
  ok('4.9 …and LB-1 still refuses this snapshot, because one position was dropped',
    Number(v.dropped_asset_count) === 1 && !persisted(v));
  ok('4.10 several negatives are each counted once',
    (function () {
      const bad = JSON.parse(JSON.stringify(r));
      bad.holdings.push({ id: 'h6', asset_id: 'b', quantity: -1 }, { id: 'h7', asset_id: 'c', quantity: -5 });
      const w = valueUser(bad, px, NOW);
      return Number(w.dropped_asset_count) === 3 && near(sum(w.assetValues), w.total) && near(sum(w.categories), w.total);
    })());
  ok('4.11 a negative LOT does not poison the same asset\'s valid lot in asset_values',
    (function () {
      const w = valueUser({ assets: [VALID],
        holdings: [{ id: 'h1', asset_id: 'a', quantity: 5 }, { id: 'h2', asset_id: 'a', quantity: -2 }] }, GOOD, NOW);
      return w.assetValues.a === 1000 && Number(w.dropped_asset_count) === 1 && !persisted(w);
    })(), 'av=' + JSON.stringify(valueUser({ assets: [VALID],
      holdings: [{ id: 'h1', asset_id: 'a', quantity: 5 }, { id: 'h2', asset_id: 'a', quantity: -2 }] }, GOOD, NOW).assetValues));
}

// ── 5 · qty === 0 semantics are EXACTLY as they were ───────────────────────
console.log('\n5 · Zero is not negative: closed / liquidated semantics intact:');
{
  const ZERO_KINDS = [
    ['5.1 closed stock',   B({ symbol: 'CLOSED', currentPrice: 40 })],
    ['5.2 closed cash',    B({ symbol: 'USD', type: 'cash', currentPrice: 1 })],
    ['5.3 closed gold',    B({ symbol: 'XAU', type: 'metal', karat: '24', goldUnit: 'g', currentPrice: 3000 })],
    ['5.4 closed real_estate', B({ symbol: 'HOME', type: 'real_estate', currentPrice: 300000 })],
    ['5.5 closed AND unpriced', B({ symbol: 'GHOST', currentPrice: null })],
  ];
  ZERO_KINDS.forEach(([label, b]) => {
    const v = val(b, { quantity: 0 }, PX({ AAPL: 200, 'XAU/USD': 3000 }));
    ok(label + ' at qty 0 ⇒ silently ignored, NOT dropped, snapshot still persistable',
      Number(v.dropped_asset_count) === 0 && persisted(v) && !has(v.assetValues, 'b') && v.total === 1000,
      'drop=' + v.dropped_asset_count + ' total=' + v.total);
  });
  ok('5.6 qty −0 keeps the qty-0 branch (−0 === 0), never the dropped branch',
    (function () { const w = val(B({}), { quantity: -0 });
      return Number(w.dropped_asset_count) === 0 && persisted(w) && !has(w.assetValues, 'b'); })());
  ok('5.7 the zero-quantity skip still PRECEDES the invalid-quantity guard',
    ts.indexOf('if (qty === 0) continue;') < ts.indexOf('if (!Number.isFinite(qty) || qty < 0)'));
  ok('5.8 …and still precedes every price resolution',
    ts.indexOf('if (qty === 0) continue;') < ts.indexOf('const storedPrice = usableFactor('));
  ok('5.9 a fully liquidated account still values 0 with dropped 0 (EMPTY, not INCOMPLETE)',
    (function () {
      const w = valueUser({ assets: [VALID], holdings: [{ id: 'h1', asset_id: 'a', quantity: 0 }] }, GOOD, NOW);
      return w.total === 0 && Number(w.dropped_asset_count) === 0 && lb1Outcome(w) === 'EMPTY';
    })());
  // The schema_version ≥ 2 boundary: inside a persistable snapshot a 0.00 means zero-or-sub-cent,
  // NEVER unknown. A sub-cent position is a KNOWN value and must keep being valued, not dropped —
  // measured beside a valid position, because the per-position rounding is to 2 decimals.
  ok('5.10 a sub-cent POSITIVE position is still valued, never dropped (schema_version ≥ 2 contract)',
    (function () {
      const w = val(B({ symbol: 'TINY', currentPrice: 200 }), { quantity: 0.00001 }, PX({ AAPL: 200, TINY: 200 }));
      return Number(w.dropped_asset_count) === 0 && persisted(w) && has(w.assetValues, 'b') && w.assetValues.b === 0;
    })(), JSON.stringify(val(B({ symbol: 'TINY', currentPrice: 200 }), { quantity: 0.00001 }, PX({ AAPL: 200, TINY: 200 })).assetValues));
}

// ── 6 · qty > 0 is byte-identical to before ────────────────────────────────
console.log('\n6 · Positive quantities are untouched:');
{
  ok('6.1 a single valid position values exactly as before',
    (function () { const w = valueUser({ assets: [VALID], holdings: [{ id: 'h1', asset_id: 'a', quantity: 5 }] }, GOOD, NOW);
      return persisted(w) && w.total === 1000 && w.count === 1 && w.assetValues.a === 1000; })());
  ok('6.2 fractional quantities are unaffected',
    (function () { const w = solo({ id: 'b', symbol: 'BTC', type: 'crypto', currentPrice: 100000, assetCurrency: 'USD' },
        0.5, PX({ BTC: 100000 }));
      return persisted(w) && near(w.total, 50000) && near(w.assetValues.b, 50000); })());
  ok('6.3 a very large quantity is unaffected',
    (function () { const w = solo(VALID, 1e6, GOOD); return persisted(w) && near(w.total, 2e8, 1); })());
  ok('6.4 a NUMERIC STRING quantity still values as before (Number() coercion preserved)',
    (function () { const w = solo(VALID, '5', GOOD); return persisted(w) && w.total === 1000; })());
  ok('6.5 gold still values through grams × purity × spot/oz, unchanged',
    (function () { const w = solo({ id: 'g', symbol: 'XAU', type: 'metal', karat: '24', goldUnit: 'g', currentPrice: null, assetCurrency: 'USD' },
        100, PX({ 'XAU/USD': 3110.34768 }));
      return Number(w.dropped_asset_count) === 0 && near(w.assetValues.g, 10000, 1); })());
  ok('6.6 non-USD cash with FX still values as before',
    (function () { const w = solo({ id: 'c', symbol: 'EUR', type: 'cash', currentPrice: 1, assetCurrency: 'EUR' },
        1000, PX({ 'EURUSD=X': 1.1 }));
      return Number(w.dropped_asset_count) === 0 && near(w.assetValues.c, 1100); })());
}

// ── 7 · A NEGATIVE STRING and other shapes at the same boundary ────────────
console.log('\n7 · The boundary holds for every shape Number() accepts:');
{
  const NEG = ['-500', -1e-9, -0.0001, -1e9, '-1e3', ' -5 ', -Number.MIN_VALUE];
  ok('7.1 every finite negative shape is dropped, never valued',
    NEG.every(q => { const w = solo(VALID, q, GOOD); return Number(w.dropped_asset_count) === 1 && !has(w.assetValues, 'a'); }),
    NEG.filter(q => Number(solo(VALID, q, GOOD).dropped_asset_count) !== 1).map(String).join('|'));
  ok('7.2 −Infinity is still dropped by the non-finite clause (unchanged)',
    (function () { const w = solo(VALID, -Infinity, GOOD); return Number(w.dropped_asset_count) === 1; })());
  ok('7.3 NaN / non-numeric strings / undefined are still dropped (unchanged)',
    [NaN, 'x', undefined, Infinity, {}].every(q => Number(solo(VALID, q, GOOD).dropped_asset_count) === 1),
    [NaN, 'x', undefined, Infinity, {}].filter(q => Number(solo(VALID, q, GOOD).dropped_asset_count) !== 1).map(String).join('|'));
  ok('7.4 the invariant, swept: NO negative quantity can produce a persistable snapshot',
    NEG.concat([-1, -1e-30, '-0.5']).every(q => {
      const w = valueUser({ assets: [VALID, B({ currentPrice: 40 })],
        holdings: [{ id: 'h1', asset_id: 'a', quantity: 5 }, { id: 'h2', asset_id: 'b', quantity: q }] }, GOOD, NOW);
      return !persisted(w);
    }));
  ok('7.5 …and no persistable snapshot ever carries a negative figure',
    [-1, '-500', -0.0001, -1e9].every(q => {
      const w = valueUser({ assets: [VALID, B({ currentPrice: 40 })],
        holdings: [{ id: 'h1', asset_id: 'a', quantity: 5 }, { id: 'h2', asset_id: 'b', quantity: q }] }, GOOD, NOW);
      return !(persisted(w) && (Object.values(w.assetValues).some(x => x < 0) || Object.values(w.categories).some(x => x < 0) || w.total < 0));
    }));
}

// ── 8 · The refusal is a REFUSAL, not a repair ─────────────────────────────
console.log('\n8 · No clamp, no abs, no reinterpretation as a closed position:');
{
  const v = solo({ id: 'c', symbol: 'USD', type: 'cash', currentPrice: 1, assetCurrency: 'USD' }, -500, PX({}));
  ok('8.1 −500 is NOT clamped to 0 and stored (absent, not zero)', !has(v.assetValues, 'c'));
  ok('8.2 −500 is NOT turned into +500 (no Math.abs)', v.total === 0 && !Object.values(v.assetValues).some(x => Number(x) === 500));
  ok('8.3 …and it is not silently reinterpreted as a closed position — it is DROPPED',
    Number(v.dropped_asset_count) === 1 && v.count === 0);
  // `\bqty\s*=(?!=)` is an ASSIGNMENT to qty — the `(?!=)` is what keeps `qty ===` out of it.
  // Exactly one such assignment may exist, and it must be the canonical read: any clamp, abs or
  // reinterpretation would need a second one.
  ok('8.4 no Math.abs and no quantity clamp exists in the executable surface',
    !/Math\.abs\s*\(\s*qty/.test(TS_CODE) && !/Math\.max\s*\(\s*0\s*,\s*qty/.test(TS_CODE)
    && (TS_CODE.match(/\bqty\s*=(?!=)/g) || []).length === 1
    && TS_CODE.indexOf('const qty = Number(h.quantity);') !== -1,
    'qty assignments: ' + JSON.stringify(TS_CODE.match(/\bqty\s*=(?!=)[^;\n]*/g) || []));
  ok('8.5 the guard is a single expression on the quantity, not a second valuation path',
    (ts.match(/if \(!Number\.isFinite\(qty\) \|\| qty < 0\)/g) || []).length === 1
    && (TS_CODE.match(/const qty = Number\(h\.quantity\);/g) || []).length === 1);
  ok('8.6 quantity is validated at its own boundary, NOT through usableFactor',
    !/usableFactor\(\s*(qty|h\.quantity)/.test(TS_CODE)
    && /function usableFactor\(v: any\): number \{ const n = Number\(v\); return \(Number\.isFinite\(n\) && n > 0\) \? n : NaN; \}/.test(ts));
  ok('8.7 nothing is repaired, backfilled or overridden anywhere in this function',
    !/backfill|repair|force_insert|override/i.test(TS_CODE) && !/\.update\(|\.delete\(/.test(TS_CODE));
}

// ── 9 · The operational diagnostic ────────────────────────────────────────
console.log('\n9 · The warning names the cause, without PII and without amounts:');
{
  const v = solo({ id: 'c', symbol: 'USD', type: 'cash', currentPrice: 1, assetCurrency: 'USD' }, -500, PX({}));
  ok('9.1 the refusal emits a warning', v.warnings.length === 1, JSON.stringify(v.warnings));
  ok('9.2 it uses the canonical invalid_qty prefix (already reviewed vocabulary)',
    /^invalid_qty:/.test(v.warnings[0]), v.warnings[0]);
  ok('9.3 it identifies the instrument, never the amount',
    v.warnings[0] === 'invalid_qty:USD', v.warnings[0]);
  ok('9.4 no quantity value is ever interpolated into the warning',
    !/-?\d/.test(v.warnings.join(',')), JSON.stringify(v.warnings));
  ok('9.5 it falls back to the asset id when the symbol is missing',
    (function () { const w = solo({ id: 'noid', type: 'stock', currentPrice: 40, assetCurrency: 'USD' }, -1, GOOD);
      return w.warnings[0] === 'invalid_qty:noid'; })());
  ok('9.6 observability normalises it to the canonical invalid_quantity',
    /invalid_qty: 'invalid_quantity'/.test(ts));
  ok('9.7 the prefix is in the reviewed allow-list, so the identifier survives normalisation',
    ts.indexOf('const HEALTH_WARN_ALLOW') < ts.indexOf("invalid_qty: 'invalid_quantity'"));
  ok('9.8 the same guard keeps serving the pre-existing corrupt-quantity case',
    (function () { const w = solo(VALID, 'x', GOOD); return /^invalid_qty:/.test(w.warnings[0]); })());
}

// ── 10 · Everything the previous block protects is intact ─────────────────
console.log('\n10 · Non-regression on the SPEC 2.8 price contracts:');
{
  ok('10.1 unknown price (null) ⇒ still dropped, never valued at 0',
    (function () { const w = val(B({ currentPrice: null })); return Number(w.dropped_asset_count) === 1 && !has(w.assetValues, 'b'); })());
  ok('10.2 price 0 and NEGATIVE price ⇒ still dropped, never subtracting',
    (function () { const z = val(B({ currentPrice: 0 })), n = val(B({ currentPrice: -30 }));
      return Number(z.dropped_asset_count) === 1 && Number(n.dropped_asset_count) === 1 && n.total === 1000; })());
  ok('10.3 FX missing ⇒ still fail-closed with its own warning',
    (function () { const w = val(B({ currentPrice: 40, assetCurrency: 'EUR' }));
      return Number(w.dropped_asset_count) === 1 && /fx_missing:EUR/.test(w.warnings.join(',')); })());
  ok('10.4 non-USD cash without FX ⇒ still never treats a stored 1 as a rate',
    (function () { const w = val(B({ type: 'cash', currentPrice: 1, assetCurrency: 'EUR' }));
      return Number(w.dropped_asset_count) === 1 && /fx_missing:EUR/.test(w.warnings.join(',')); })());
  ok('10.5 PRICES-PRESERVE-1 intact: an unusable PROVIDER price falls back to the catalog, not dropped',
    (function () { const w = val(B({ symbol: 'PX', currentPrice: 50 }), null, PX({ AAPL: 200, PX: 0 }));
      return Number(w.dropped_asset_count) === 0 && persisted(w) && near(w.assetValues.b, 500) && w.price_staleness !== 'live'; })());
  ok('10.6 …and the stored-price fallback line itself is untouched',
    /const unit = havePx \? freshUnit : storedPrice;/.test(ts));
  ok('10.7 unparseable gold purity ⇒ still dropped',
    (function () { const w = solo({ id: 'g', symbol: 'XAU', type: 'metal', karat: '18K', goldUnit: 'g', currentPrice: 60, assetCurrency: 'USD' },
        100, PX({ 'XAU/USD': 3000 }));
      return Number(w.dropped_asset_count) === 1; })());
  ok('10.8 orphan holding ⇒ still dropped, still not salvaged server-side',
    (function () { const w = valueUser({ assets: [], holdings: [{ id: 'h', asset_id: 'zz', quantity: 1 }] }, GOOD, NOW);
      return Number(w.dropped_asset_count) === 1 && /orphan_holding:zz/.test(w.warnings.join(',')); })());
  ok('10.9 an ORPHAN with a negative quantity is still attributed to the orphan, not double-counted',
    (function () { const w = valueUser({ assets: [], holdings: [{ id: 'h', asset_id: 'zz', quantity: -1 }] }, GOOD, NOW);
      return Number(w.dropped_asset_count) === 1 && /orphan_holding:zz/.test(w.warnings.join(',')); })());
  ok('10.10 persisted rows still carry schema_version 2 and the insert gained no column',
    /schema_version: 2,/.test(ts)
    && (function () {
      const raw = ts.slice(ts.indexOf("admin.from('portfolio_snapshots').insert("), ts.indexOf('if (insErr) {'));
      const ins = raw.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
        .replace(/\/\/[^\n'"]*$/gm, '').replace(/'[^']*'/g, "''");
      return (ins.match(/\b(\w+)\s*:/g) || []).length === 12;
    })());
  ok('10.11 LB-1 still precedes the near-dup guard and the insert',
    ts.indexOf('if (Number(v.dropped_asset_count) > 0)') < ts.indexOf('near-duplicate guard')
    && ts.indexOf('if (Number(v.dropped_asset_count) > 0)') < ts.indexOf("admin.from('portfolio_snapshots').insert("));
  ok('10.12 the auth gate and its fail-closed posture are untouched',
    /if \(!INVOKE_KEY \|\| INVOKE_KEY\.length < 20\) return \{ ok: false, status: 503/.test(ts)
    && ts.indexOf('const auth = authorizeCaller(req);') < ts.indexOf('createClient(SUPABASE_URL, SERVICE_ROLE)'));
  ok('10.13 this SPEC touches no frontend owner in code',
    !/\bapp\.js\b|switchTab|buildProductionPortfolioChart|_aurixCatHist/.test(TS_CODE));
  // CLIENT/SERVER PARITY — the adversarial sweep's central finding, pinned so it cannot silently
  // rot. The client LB-1 (`_aurixAssessValuationCompleteness`) has the same quantity shape and no
  // `qty < 0` test either, BUT it then requires `Number.isFinite(v) && v > 0` over a value built as
  // `qty * price`, so a negative quantity lands in `invalid` ⇒ complete:false ⇒ the write guard
  // REJECTS. The client therefore ALREADY failed closed while the server valued and persisted: this
  // fix CLOSES a pre-existing client/server divergence rather than opening one.
  ok('10.15 client/server parity: the client already refuses a negative-value holding',
    (function () {
      const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
      return /const valued = Number\.isFinite\(v\) && v > 0;/.test(app)          // client rejects value ≤ 0
        && /if \(qty === 0\) continue;\s*\/\/ zero-quantity position — legitimately excluded/.test(app)
        && /return asset\.qty \* asset\.price;/.test(app)                        // …over qty × price
        && /if \(n\.valuationComplete === false\)/.test(app);                    // …and that hard-rejects the write
    })());
  ok('10.14 no schema change and no migration added',
    (function () {
      let m = []; try { m = fs.readdirSync(path.join(ROOT, 'supabase', 'migrations')).filter(f => /\.sql$/.test(f)); } catch (e) { m = []; }
      return m.length === 1;
    })());
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + '  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
