'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ASSET-LEVEL-INTEGRITY-harness — SPEC FASE 2.8 · P0
// ════════════════════════════════════════════════════════════════════════════
// UNKNOWN VALUE ≠ ZERO VALUE. The defect: `Number()` was used as the validity
// test for a price, and it erases exactly that distinction — Number(null),
// Number('') and Number(false) are all 0 and all FINITE, and a NEGATIVE price is
// finite too. So a position whose price was unknown was valued at a finite 0,
// sailed past the !Number.isFinite(valueUSD) guard, left dropped_asset_count at 0,
// did not trigger LB-1, and was persisted into asset_values as "0.00" — a figure
// that reads as "this holding is worth nothing" when the truth was "nobody knows
// what this holding is worth". A negative price was worse: it SUBTRACTED from the
// portfolio total. Reproduced against the real valueUser before any change.
//
// The fix is one rule stated once — usablePrice: finite AND > 0 — applied at every
// point where a price enters the valuation (catalog, provider, gold spot, FX), so
// that one truth governs total, category_values AND asset_values together. An
// unusable price yields NaN, the existing guard drops the position,
// dropped_asset_count rises and LB-1 refuses the WHOLE snapshot.
//
// This gate executes the REAL valueUser transpiled from the Edge Function — it
// never reimplements the valuation.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const BASELINE = 'b60d533';
const TS_PATH = path.join(ROOT, 'supabase', 'functions', 'portfolio-snapshot', 'index.ts');
const ts = fs.readFileSync(TS_PATH, 'utf8');

let pass = 0, fail = 0, skipped = 0;
function ok(n, c, info) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } }
function skip(n, why) { skipped++; console.log('  ⊘ SKIP ' + n + '  [' + why + ']'); }

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
// TS→JS by LITERAL list, never a generic regex: an annotation `:` and a ternary `:`
// are indistinguishable without a real parser, and an approximate regex mutilates the
// body in silence — the worst harness failure, because it would then test code that is
// not production's. If a signature moves, assertTranspiled turns this red instead.
const TS_STRIP = [
  ['function bucketOf(type: string): string {', 'function bucketOf(type) {'],
  ['function goldPurity(k: any): number {', 'function goldPurity(k) {'],
  ['function goldGrams(qty: number, unit: string): number {', 'function goldGrams(qty, unit) {'],
  ['function isUsEquityOpenNow(now: Date): boolean {', 'function isUsEquityOpenNow(now) {'],
  ['function usableFactor(v: any): number {', 'function usableFactor(v) {'],
  ['function usableQuantity(raw: any): number {', 'function usableQuantity(raw) {'],
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
const NAMES = ['bucketOf', 'goldPurity', 'goldGrams', 'isUsEquityOpenNow', 'usableFactor', 'usableQuantity', 'fxToUsd', 'valueUser'];
const SRC = NAMES.map(n => extractFn(n, js)).join('\n');
function assertTranspiled(src) {
  const bad = src.split('\n').filter(l => /\b(any|Record<|Map<|: string|: number|: boolean|: Date)\b/.test(l) && !/^\s*\/\//.test(l));
  return bad.length ? bad[0].trim().slice(0, 110) : null;
}
const CONSTS = 'const OZ_TO_G = 31.1034768;'
  + 'const PURITY_TABLE = { "10":0.4167,"14":0.5833,"18":0.7500,"21":0.8750,"22":0.9167,"24":1.0000 };';
let valueUser = null, usableFactor = null, buildErr = null;
try {
  const leftover = assertTranspiled(SRC);
  if (leftover) throw new Error('TypeScript sin despojar (¿cambió una firma?): ' + leftover);
  const built = new Function(CONSTS + '\n' + SRC + '\n;return { valueUser: valueUser, usableFactor: usableFactor };')();
  valueUser = built.valueUser; usableFactor = built.usableFactor;
} catch (e) { buildErr = String((e && e.message) || e); }

// Executable surface only: the comments deliberately NAME what must not happen.
const TS_CODE = ts.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

const NOW = new Date('2026-08-24T15:00:00Z');   // US equities OPEN, fixed instant
const PX = (o) => new Map(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? { price: v, currency: 'USD' } : v]));
const GOOD = PX({ AAPL: 200 });
// A = valid. B = the position under test.
const row = (b, hb) => ({
  assets: [{ id: 'a', symbol: 'AAPL', type: 'stock', currentPrice: 200, assetCurrency: 'USD' }].concat(b ? [b] : []),
  holdings: [{ id: 'h1', asset_id: 'a', quantity: 5 }].concat(b ? [Object.assign({ id: 'h2', asset_id: b.id, quantity: 10 }, hb || {})] : []),
});
const val = (b, hb, px) => valueUser(row(b, hb), px || GOOD, NOW);
const B = (over) => Object.assign({ id: 'b', symbol: 'GHOST', type: 'stock', assetCurrency: 'USD' }, over);
const zeros = v => Object.entries(v.assetValues).filter(([, x]) => Number(x) === 0).map(([k]) => k);
const sum = o => Object.values(o).reduce((s, x) => s + Number(x), 0);
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 0.011 : t);
// What the capturer will actually persist: LB-1 refuses everything with dropped > 0.
const persisted = v => Number.isFinite(v.total) && v.total > 0 && Number(v.dropped_asset_count) === 0;

console.log('\n════ AURIX-ASSET-LEVEL-INTEGRITY ════\n');
console.log('0 · The real owner executes:');
ok('0.1 valueUser + usableFactor extracted and runnable from index.ts', valueUser !== null, buildErr || '');
if (!valueUser) { console.log('\n✗ FAIL  cannot assert anything without the real owner\n'); process.exit(1); }

// ── 1–2 · The happy path is untouched ───────────────────────────────────────
console.log('\n1–2 · Valid positions still value exactly as before:');
{
  const one = val(null);
  ok('1.1 a single valid position yields a persistable snapshot',
    persisted(one) && one.total === 1000 && one.count === 1 && one.assetValues.a === 1000, JSON.stringify(one.assetValues));
  const two = val(B({ symbol: 'MSFT', currentPrice: 50 }), null, PX({ AAPL: 200, MSFT: 50 }));
  ok('2.1 two valid positions BOTH reach asset_values',
    persisted(two) && two.assetValues.a === 1000 && two.assetValues.b === 500 && two.count === 2, JSON.stringify(two.assetValues));
  ok('2.2 …and neither is a zero', zeros(two).length === 0);
}

// ── 3–7 · Every unusable price is DROPPED, never valued at 0 ────────────────
console.log('\n3–7 · An open position with an unusable price is DROPPED:');
{
  const CASES = [
    ['3 currentPrice: null',        B({ currentPrice: null }),      GOOD],
    ['4 currentPrice: undefined',   B({}),                          GOOD],
    ['5 currentPrice: NaN',         B({ currentPrice: NaN }),       GOOD],
    ['5b currentPrice: "abc"',      B({ currentPrice: 'abc' }),     GOOD],
    ['5c currentPrice: "" (empty)', B({ currentPrice: '' }),        GOOD],
    ['5d currentPrice: false',      B({ currentPrice: false }),     GOOD],
    ['6 currentPrice: 0',           B({ currentPrice: 0 }),         GOOD],
    ['6b currentPrice: -30',        B({ currentPrice: -30 }),       GOOD],
    ['7 FX pair absent (EUR)',      B({ currentPrice: 40, assetCurrency: 'EUR' }), GOOD],
    ['7b FX rate = 0',              B({ currentPrice: 40, assetCurrency: 'EUR' }), PX({ AAPL: 200, 'EURUSD=X': 0 })],
    ['7c non-USD CASH, FX absent',  B({ type: 'cash', currentPrice: 1, assetCurrency: 'EUR' }), GOOD],
    ['7d non-USD CASH, FX rate 0',  B({ type: 'cash', currentPrice: 1, assetCurrency: 'EUR' }), PX({ AAPL: 200, 'EURUSD=X': 0 })],
    ['G gold, purity unparseable',  B({ symbol: 'XAU', type: 'metal', karat: '18K', goldUnit: 'g', currentPrice: 60 }), PX({ AAPL: 200, 'XAU/USD': 3000 })],
    ['G2 gold, karat "abc"',        B({ symbol: 'XAU', type: 'metal', karat: 'abc', goldUnit: 'g', currentPrice: 60 }), PX({ AAPL: 200, 'XAU/USD': 3000 })],
    ['G3 gold, no spot, no catalog', B({ symbol: 'XAU', type: 'metal', karat: '24', goldUnit: 'g', currentPrice: null }), GOOD],
  ];
  CASES.forEach(([label, b, px]) => {
    const v = val(b, null, px);
    ok(label + ' ⇒ dropped, absent from asset_values, snapshot refused',
      Number(v.dropped_asset_count) === 1
      && !Object.prototype.hasOwnProperty.call(v.assetValues, 'b')
      && !persisted(v),
      'drop=' + v.dropped_asset_count + ' av=' + JSON.stringify(v.assetValues));
  });
  ok('7e the FX cases are refused for FX, not by accident (warning names the currency)',
    /fx_missing:EUR/.test(val(B({ currentPrice: 40, assetCurrency: 'EUR' })).warnings.join(',')));
  // F2, found by the adversarial review and PRE-EXISTING: non-USD cash used to fall back
  // to the asset's `currentPrice` as if it were an FX rate. Cash is stored with price = 1
  // (LIQ-1), so 1000 EUR was published as 1000 USD — an ~8% fabrication, dropped = 0,
  // snapshot PERSISTED, one warning. A stored 1 is not a rate.
  ok('7f non-USD cash no longer treats a stored 1 as an exchange rate',
    (function () {
      const w = val(B({ type: 'cash', currentPrice: 1, assetCurrency: 'EUR' }));
      return Number(w.dropped_asset_count) === 1 && !persisted(w)
        && !Object.prototype.hasOwnProperty.call(w.assetValues, 'b')
        && /fx_missing:EUR/.test(w.warnings.join(','));
    })());
  ok('7g …while non-USD cash WITH an FX rate still values exactly as before',
    (function () {
      const w = val(B({ type: 'cash', currentPrice: 1, assetCurrency: 'EUR' }), null, PX({ AAPL: 200, 'EURUSD=X': 1.1 }));
      return Number(w.dropped_asset_count) === 0 && persisted(w) && near(w.assetValues.b, 11);
    })());
  ok('7h USD cash is untouched (no price, no FX involved)',
    (function () {
      const w = val(B({ type: 'cash', currentPrice: 1, assetCurrency: 'USD' }));
      return Number(w.dropped_asset_count) === 0 && persisted(w) && near(w.assetValues.b, 10);
    })());

  // F1, a regression THIS SPEC introduced and both the review and the certified LB-1 gate
  // caught: "the provider returned garbage" and "the provider returned nothing" are the
  // same fact. app.js PRICES-PRESERVE-1 requires keeping the last known price so totals do
  // not briefly drop; fetchPrices is global and once per tick, so poisoning here would let
  // ONE bad symbol block the snapshot of every account holding it, indefinitely.
  console.log('  — an unusable PROVIDER price is ABSENT, not poison:');
  [['provider price 0', 0], ['provider price -7', -7], ['provider price NaN', NaN]].forEach(([label, px]) => {
    const w = val(B({ symbol: 'PX', currentPrice: 50 }), null, PX({ AAPL: 200, PX: px }));
    ok('F1.' + label + ' ⇒ falls back to the catalog price, valued and stale (not dropped)',
      Number(w.dropped_asset_count) === 0 && persisted(w) && near(w.assetValues.b, 500)
      && w.price_staleness !== 'live',
      'drop=' + w.dropped_asset_count + ' av=' + JSON.stringify(w.assetValues) + ' stale=' + w.price_staleness);
  });
  ok('F1.4 …and the stale counters are honest (not counted as priced)',
    (function () {
      const w = val(B({ symbol: 'PX', currentPrice: 50 }), null, PX({ AAPL: 200, PX: 0 }));
      return Number(w.priced_asset_count) === 1 && Number(w.unpriced_asset_count) === 1;
    })(), 'priced=' + val(B({ symbol: 'PX', currentPrice: 50 }), null, PX({ AAPL: 200, PX: 0 })).priced_asset_count);
  ok('F1.5 with NO catalog price either, it IS dropped (nothing left to value with)',
    (function () {
      const w = val(B({ symbol: 'PX', currentPrice: null }), null, PX({ AAPL: 200, PX: 0 }));
      return Number(w.dropped_asset_count) === 1 && !persisted(w);
    })());
  ok('F1.6 the stored-price fallback for stale is intact (the LB-1 gate pins this)',
    /const unit = havePx \? freshUnit : storedPrice;/.test(ts));
}

// ── 8–9 · One bad position poisons the WHOLE snapshot ──────────────────────
console.log('\n8–9 · LB-1: unknown never becomes zero, and never sneaks in:');
{
  const v = val(B({ currentPrice: null }));
  ok('8.1 the valid position is still valued (the fix does not over-refuse)', v.assetValues.a === 1000);
  ok('8.2 …but dropped > 0, so LB-1 refuses the ENTIRE snapshot',
    Number(v.dropped_asset_count) > 0 && !persisted(v));
  ok('8.3 the LB-1 guard is intact and precedes the near-dup guard and the insert',
    /if \(Number\(v\.dropped_asset_count\) > 0\) \{ incompleteRej\+\+;[^}]*continue; \}/.test(ts)
    && ts.indexOf('if (Number(v.dropped_asset_count) > 0)') < ts.indexOf('near-duplicate guard')
    && ts.indexOf('if (Number(v.dropped_asset_count) > 0)') < ts.indexOf("admin.from('portfolio_snapshots').insert("));
  // The invariant, swept: NO input may produce a persistable snapshot carrying a 0.
  const SWEEP = [null, undefined, NaN, '', 'abc', false, [], 0, -1, -1e9, '0', ' ', {}];
  ok('9.1 across every unusable price shape, a persistable snapshot NEVER carries a 0',
    SWEEP.every(pr => { const r = val(B({ currentPrice: pr })); return !(persisted(r) && zeros(r).length > 0); }),
    SWEEP.filter(pr => { const r = val(B({ currentPrice: pr })); return persisted(r) && zeros(r).length > 0; }).map(String).join('|'));
  ok('9.2 …and each of them is actually dropped, not silently omitted',
    SWEEP.every(pr => Number(val(B({ currentPrice: pr })).dropped_asset_count) === 1),
    SWEEP.filter(pr => Number(val(B({ currentPrice: pr })).dropped_asset_count) !== 1).map(String).join('|'));
  ok('9.3 a NEGATIVE price can no longer SUBTRACT from the portfolio total',
    val(B({ currentPrice: -30 })).total === 1000);
}

// ── 10–12 · An accepted snapshot is complete on all three surfaces ──────────
console.log('\n10–12 · total, category_values and asset_values share ONE truth:');
{
  const px = PX({ AAPL: 200, BTC: 100000, 'EURUSD=X': 1.1 });
  const r = {
    assets: [
      { id: 'a', symbol: 'AAPL', type: 'stock',  currentPrice: 200,    assetCurrency: 'USD' },
      { id: 'b', symbol: 'BTC',  type: 'crypto', currentPrice: 100000, assetCurrency: 'USD' },
      { id: 'c', symbol: 'EUR',  type: 'cash',   currentPrice: 1,      assetCurrency: 'EUR' },
      { id: 'd', symbol: 'HOME', type: 'real_estate', currentPrice: 300000, assetCurrency: 'USD' },
    ],
    holdings: [
      { id: 'h1', asset_id: 'a', quantity: 5 }, { id: 'h2', asset_id: 'b', quantity: 0.5 },
      { id: 'h3', asset_id: 'c', quantity: 1000 }, { id: 'h4', asset_id: 'd', quantity: 1 },
    ],
  };
  const v = valueUser(r, px, NOW);
  ok('10.1 every open position appears in asset_values (never a partial map)',
    persisted(v) && ['a', 'b', 'c', 'd'].every(k => Object.prototype.hasOwnProperty.call(v.assetValues, k)),
    JSON.stringify(v.assetValues));
  ok('11.1 Σ asset_values reconciles with total_value_usd', near(sum(v.assetValues), v.total), sum(v.assetValues) + ' vs ' + v.total);
  ok('12.1 Σ category_values reconciles with total_value_usd', near(sum(v.categories), v.total), sum(v.categories) + ' vs ' + v.total);
  ok('12.2 real_estate keeps its existing semantics (own column AND its bucket)',
    near(v.realEstate, 300000) && near(v.categories.real_estate, 300000));
  ok('12.3 the denominators are untouched — investable is still total − real_estate',
    near(v.total - v.realEstate, 1000 + 50000 + 1100));
  ok('18.1 the same reconciliation holds with a dropped position EXCLUDED from all three',
    (function () {
      const bad = JSON.parse(JSON.stringify(r));
      bad.assets.push({ id: 'e', symbol: 'GHOST', type: 'stock', currentPrice: null, assetCurrency: 'USD' });
      bad.holdings.push({ id: 'h5', asset_id: 'e', quantity: 10 });
      const w = valueUser(bad, px, NOW);
      return Number(w.dropped_asset_count) === 1 && !persisted(w)
        && !Object.prototype.hasOwnProperty.call(w.assetValues, 'e')
        && near(sum(w.assetValues), w.total) && near(sum(w.categories), w.total);
    })());
}

// ── 13 · Closed / zero-quantity semantics preserved ────────────────────────
console.log('\n13 · closed and qty 0 keep the semantics they already had:');
{
  const v = val(B({ currentPrice: null }), { quantity: 0 });
  ok('13.1 a qty-0 position with NO price is still ignored, not dropped',
    Number(v.dropped_asset_count) === 0 && persisted(v) && !Object.prototype.hasOwnProperty.call(v.assetValues, 'b'),
    'drop=' + v.dropped_asset_count);
  ok('13.2 a qty-0 position WITH a price is still ignored (unchanged)',
    (function () { const w = val(B({ currentPrice: 40 }), { quantity: 0 });
      return w.count === 1 && !Object.prototype.hasOwnProperty.call(w.assetValues, 'b'); })());
  ok('13.3 the zero-quantity skip still precedes every price resolution',
    ts.indexOf('if (qty === 0) continue;') < ts.indexOf('const storedPrice = usableFactor('));
  ok('13.4 a corrupt quantity is still dropped with its own warning',
    (function () { const w = val(B({ currentPrice: 40 }), { quantity: 'x' });
      return Number(w.dropped_asset_count) === 1 && /invalid_qty:/.test(w.warnings.join(',')); })());
  ok('13.5 an orphan holding is still dropped, still not salvaged server-side',
    (function () { const w = valueUser({ assets: [], holdings: [{ id: 'h', asset_id: 'zz', quantity: 1 }] }, GOOD, NOW);
      return Number(w.dropped_asset_count) === 1 && /orphan_holding:zz/.test(w.warnings.join(',')); })());
}

// ── 14–16 · Observability tells the operator why ───────────────────────────
console.log('\n14–16 · The per-user signal explains the refusal:');
{
  const v = val(B({ currentPrice: null }));
  ok('14.1 the branch that fires reports INCOMPLETE (dropped > 0 ⇒ LB-1 branch)',
    Number(v.dropped_asset_count) > 0
    && /dropped_asset_count\) > 0\) \{ incompleteRej\+\+; noteHealth\(r\.user_id, 'INCOMPLETE', v\.dropped_asset_count, v\.count, v\.warnings\); continue; \}/.test(ts));
  ok('14.2 …and a total of 0 caused by dropped positions also reports INCOMPLETE, not EMPTY',
    /noteHealth\(r\.user_id, Number\(v\.dropped_asset_count\) > 0 \? 'INCOMPLETE' : 'EMPTY'/.test(ts));
  ok('15.1 dropped_asset_count is exactly the number of unvaluable open positions',
    (function () {
      const r2 = {
        assets: [{ id: 'a', symbol: 'AAPL', type: 'stock', currentPrice: 200, assetCurrency: 'USD' },
                 { id: 'b', symbol: 'G1', type: 'stock', currentPrice: null, assetCurrency: 'USD' },
                 { id: 'c', symbol: 'G2', type: 'stock', currentPrice: 0, assetCurrency: 'USD' }],
        holdings: [{ id: 'h1', asset_id: 'a', quantity: 5 }, { id: 'h2', asset_id: 'b', quantity: 1 },
                   { id: 'h3', asset_id: 'c', quantity: 1 }],
      };
      return Number(valueUser(r2, GOOD, NOW).dropped_asset_count) === 2;
    })());
  ok('16.1 the warning names the instrument, in the normalised vocabulary',
    /unpriced:GHOST/.test(v.warnings.join(',')));
  ok('16.2 the observability normaliser accepts that prefix as reviewed',
    /unpriced: 'unpriced'/.test(ts));
  ok('16.3 no amount, quantity or price VALUE is ever interpolated into a warning',
    (function () {
      const args = (TS_CODE.match(/warnings\.push\(([^;]*?)\);/g) || [])
        .map(a => a.replace(/'[^']*'/g, "''"));      // drop string literals: names are not values
      const forbidden = /\b(valueUSD|storedPrice|unit|native|nativeUSD|spotPerOz|qty|total|fx)\b/;
      return args.length >= 4 && args.every(a => !forbidden.test(a));
    })(),
    (TS_CODE.match(/warnings\.push\(([^;]*?)\);/g) || []).map(a => a.replace(/'[^']*'/g, "''"))
      .filter(a => /\b(valueUSD|storedPrice|unit|native|nativeUSD|spotPerOz|qty|total|fx)\b/.test(a)).join(' | '));
  ok('16.4 a warning may only carry an identifier or a currency code',
    (TS_CODE.match(/warnings\.push\(([^;]*?)\);/g) || [])
      .every(a => /(asset\.symbol|asset\.ticker|h\.asset_id|\bcur\b|quoteCur)/.test(a)));
}

// ── 17 · Recovery is automatic ─────────────────────────────────────────────
console.log('\n17 · The price comes back and the next tick can insert:');
{
  const b = B({ currentPrice: null, symbol: 'LATE' });
  const before = val(b, null, PX({ AAPL: 200 }));
  const after  = val(b, null, PX({ AAPL: 200, LATE: 12 }));
  ok('17.1 before: dropped, snapshot refused', Number(before.dropped_asset_count) === 1 && !persisted(before));
  ok('17.2 after the provider returns a price: valued, snapshot persistable',
    Number(after.dropped_asset_count) === 0 && persisted(after) && after.assetValues.b === 120,
    JSON.stringify(after.assetValues));
  ok('17.3 recovery needs no flag, no reset and no backfill — only the price',
    !/backfill|repair|force_insert|override/i.test(TS_CODE));
}

// ── The rule itself ────────────────────────────────────────────────────────
console.log('\nThe rule: ONE truth, applied at every price entry point:');
{
  ok('R.1 usableFactor is finite AND strictly positive, NaN otherwise',
    [null, undefined, NaN, '', 'abc', false, [], {}, 0, -1, '0'].every(x => Number.isNaN(usableFactor(x)))
    && usableFactor(200) === 200 && usableFactor('12.5') === 12.5);
  ok('R.2b unknown PURITY is unknown, not zero (goldPurity falls back to 0)',
    (function () {
      const g = k => ({ assets: [{ id: 'g', symbol: 'XAU', type: 'metal', karat: k, goldUnit: 'g', currentPrice: 60, assetCurrency: 'USD' }],
                        holdings: [{ id: 'hg', asset_id: 'g', quantity: 100 }] });
      const px = PX({ 'XAU/USD': 3000 });
      // `karat: 0` is FALSY, so the asset never enters the XAU branch at all — it is valued
      // as an ordinary asset. Existing behaviour, deliberately not in this list.
      const bad = ['18K', 'abc', '  ', '0'].every(k => {
        const w = valueUser(g(k), px, NOW);
        return Number(w.dropped_asset_count) === 1 && !Object.prototype.hasOwnProperty.call(w.assetValues, 'g');
      });
      const good = valueUser(g('18'), px, NOW);
      return bad && Number(good.dropped_asset_count) === 0 && good.assetValues.g > 0;
    })());
  ok('R.2 it mirrors app.js, the product\'s own definition of a missing price',
    (function () {
      const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
      return /priceMissing = !Number\.isFinite\(priceN\) \|\| priceN <= 0/.test(app)
        && /Number\.isFinite\(n\) && n > 0/.test(ts);
    })());
  ok('R.3 every multiplicative input goes through it: catalog, provider, gold spot, FX, purity',
    /const storedPrice = usableFactor\(asset\.currentPrice\)/.test(ts)
    && /const freshUnit = fresh \? usableFactor\(fresh\.price\) : NaN/.test(ts)
    && /const freshSpot = freshXau \? usableFactor\(freshXau\.price\) : NaN/.test(ts)
    && /return p \? usableFactor\(p\.price\) : NaN/.test(ts)
    && /const purity = usableFactor\(goldPurity\(asset\.karat\)\)/.test(ts));
  ok('R.4 no raw Number() survives as a price validity test',
    !/Number\(asset\.currentPrice\)/.test(TS_CODE) && !/Number\.isFinite\(p\.price\) \? p\.price/.test(TS_CODE)
    && !/storedPrice > 0 \? qty \* storedPrice/.test(TS_CODE));
  ok('R.5 it is ONE helper, not a parallel valuation path',
    (ts.match(/^function usableFactor\(/gm) || []).length === 1
    && !/function .*[Pp]rice2|resolvePriceV2|priceOrZero/.test(ts));
  ok('R.6 gold still values through the same rule (no separate leniency)',
    (function () {
      const g = { assets: [{ id: 'g', symbol: 'XAU', type: 'metal', karat: '24', goldUnit: 'g', currentPrice: null, assetCurrency: 'USD' }],
                  holdings: [{ id: 'hg', asset_id: 'g', quantity: 100 }] };
      const noSpot = valueUser(g, PX({}), NOW);
      const withSpot = valueUser(g, PX({ 'XAU/USD': 3110.34768 }), NOW);
      return Number(noSpot.dropped_asset_count) === 1 && Number(withSpot.dropped_asset_count) === 0
        && near(withSpot.assetValues.g, 10000, 1);
    })());
}

// ── The boundary for future asset-level history ────────────────────────────
console.log('\nBoundary: which rows a future reader may trust:');
{
  ok('B.1 persisted rows now carry schema_version 2', /schema_version: 2,/.test(ts));
  ok('B.2 the boundary reuses EXISTING metadata — no new versioning architecture',
    /schema_version  int/.test(fs.readFileSync(path.join(ROOT, 'db', 'portfolio_snapshots_1.sql'), 'utf8'))
    && !/asset_values_version|integrity_flag|trustworthy/i.test(ts));
  ok('B.3 no backfill and no retroactive relabelling of older rows',
    !/update public\.portfolio_snapshots/i.test(ts) && !/\.update\(|\.delete\(/.test(TS_CODE));
  ok('B.4 the boundary is documented where the value is written, not only in a doc',
    /schema_version 1 rows were/.test(ts) && /schema_version >= 2/.test(ts));
}

// ── 19–23 · Nothing downstream moved ──────────────────────────────────────
console.log('\n19–23 · Chart, Performance, Reader, Preview, User Health:');
{
  let files = null;
  try { files = cp.execSync('git diff ' + BASELINE + ' --name-only', { cwd: ROOT, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8').trim(); } catch (e) { files = null; }
  if (files === null) {
    skip('19–22 app.js untouched vs ' + BASELINE, BASELINE + ' not in this clone (shallow checkout)');
    ok('19.1 this SPEC references no frontend owner IN CODE',
      !/\bapp\.js\b|switchTab|buildProductionPortfolioChart|_aurixCatHist|_aurixIntelligencePreview/.test(TS_CODE));
  } else {
    const list = files.split('\n').filter(Boolean);
    // The four surfaces this SPEC must not move, pinned by BYTE-IDENTITY of their own
    // bodies instead of by "app.js is absent from the diff". The old form died the moment
    // any other SPEC legitimately edited a different part of the 3.5 MB bundle — which is
    // exactly what UNKNOWN QUANTITY INTEGRITY does — and an assertion that cannot survive
    // a legitimate edit elsewhere stops being evidence. This form keeps the teeth: touch
    // Chart, Performance, Reader or Preview and it goes red.
    const FRONTEND_OWNERS = ['buildValidatedHistoricalSeries', '_aurixResolveFinalRenderSeriesContract',
      'computePerformanceSnapshot', '_aurixComputePerformanceStateCandidate',
      '_aurixNormalizeBackendSnapshot', '_aurixMergeSnapshotSources', '_aurixHistorySourceForDisplay',
      '_aurixCatHistWindow', '_aurixIntelligencePreviewFacts', '_aurixIntelligencePreviewHTML'];
    const bodyOf = (src, n) => { const s = 'function ' + n + '('; const i = src.indexOf(s); if (i < 0) return null;
      let k = src.indexOf('{', i), d = 0; for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } return null; };
    ok('19.1 Chart, Performance, Reader and Preview are byte-identical to ' + BASELINE + ' (they cannot have moved)',
      (function () {
        let base = null;
        try { base = cp.execSync('git show ' + BASELINE + ':app.js', { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8'); } catch (e) { return false; }
        const cur = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
        return FRONTEND_OWNERS.every(n => { const a = bodyOf(base, n), b = bodyOf(cur, n); return !!a && !!b && a === b; });
      })(),
      FRONTEND_OWNERS.join(','));
    ok('19.2 the four bundle-version sources are COHERENT (a bundle change carried a complete bump)',
      (function () {
      // Re-anchored: "index.html / version.json untouched" was a claim about a rolling
      // baseline, so a LATER SPEC that legitimately changes the bundle — and is OBLIGED by
      // the cache-bust contract to bump it — turned this red for the right change. The
      // durable invariant is not "untouched", it is COHERENT: if the bundle moved, every one
      // of the four version sources moved together. A partial bump is the actual failure mode
      // (memory records __AURIX_APPJS_VERSION__ as the one that gets forgotten), and this
      // catches it whether or not any baseline is reachable.
      const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      const ver = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8'));
      const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
      const m1 = idx.match(/var APPJS_V = '(\d+)';/);
      const m2 = idx.match(/app\.js\?v=(\d+)/);
      const m3 = appSrc.match(/window\.__AURIX_APPJS_VERSION__ = '(\d+)';/);
      if (!m1 || !m2 || !m3) return false;
      const all = [String(ver.appjs), m1[1], m2[1], m3[1]];
      return all.every(v => v === all[0]) && /var BUILD = '[^']+';/.test(idx)
        && idx.indexOf(String(ver.build)) !== -1;
    })());
  }
  ok('23.1 the per-user observability block is untouched by this SPEC',
    /function normalizeWarnings\(ws: any\): string\[\] \{/.test(ts)
    && /const HEALTH_OUTCOMES = \['INSERTED', 'INACTIVE', 'EMPTY', 'INCOMPLETE', 'SKIPPED', 'ERROR'\]/.test(ts)
    && /portfolio_snapshot_user_health_upsert/.test(ts));
  ok('23.2 the observability flush still runs AFTER every financial write',
    ts.indexOf("admin.from('portfolio_snapshots').insert(") < ts.indexOf('// ── Per-user observability flush'));
  ok('23.3 no schema change is required by this SPEC — one migration, unchanged',
    (function () {
      let m = []; try { m = fs.readdirSync(path.join(ROOT, 'supabase', 'migrations')).filter(f => /\.sql$/.test(f)); } catch (e) { m = []; }
      return m.length === 1;
    })());
  ok('23.4 the snapshot insert gained no new column and lost none (exactly 12)',
    (function () {
      const raw = ts.slice(ts.indexOf("admin.from('portfolio_snapshots').insert("), ts.indexOf('if (insErr) {'));
      const ins = raw.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
        .replace(/\/\/[^\n'"]*$/gm, '').replace(/'[^']*'/g, "''");
      const keys = (ins.match(/\b(\w+)\s*:/g) || []).map(k => k.replace(/\s*:$/, ''));
      const EXPECTED = ['user_id', 'ts', 'total_value_usd', 'real_estate', 'category_values', 'asset_count',
                        'source', 'asset_values', 'confidence', 'market_state', 'price_staleness', 'schema_version'];
      return EXPECTED.every(c => keys.indexOf(c) !== -1) && keys.length === EXPECTED.length;
    })(),
    (function () {
      const raw = ts.slice(ts.indexOf("admin.from('portfolio_snapshots').insert("), ts.indexOf('if (insErr) {'));
      const ins = raw.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
        .replace(/\/\/[^\n'"]*$/gm, '').replace(/'[^']*'/g, "''");
      return (ins.match(/\b(\w+)\s*:/g) || []).join(',');
    })());
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + '  ' + pass + ' passed, ' + fail + ' failed'
  + (skipped ? ', ' + skipped + ' skipped (baseline not reachable — run in a full clone)' : '') + '\n');
process.exit(fail ? 1 : 0);
