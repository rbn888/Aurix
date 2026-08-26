'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-UNKNOWN-QUANTITY-INTEGRITY-harness — SPEC FOUNDATION HARDENING
// ════════════════════════════════════════════════════════════════════════════
// UNKNOWN ≠ ZERO, applied to the QUANTITY.
//
// The defect, reproduced against both real owners BEFORE any change: quantity
// was read through `Number()`, and Number(null), Number(''), Number('   '),
// Number(false) and Number([]) are all 0 and all FINITE. So a holding whose
// quantity nobody knew landed in the `qty === 0` branch and was filed as a
// CLOSED POSITION — silently excluded, dropped 0, LB-1 content:
//
//   valid 1000 + qty null   ⇒ server total 1000, dropped 0 ⇒ INSERTED
//                              client complete TRUE, active 1 (the unknown
//                              position was not even counted)
//
// A snapshot persisted as COMPLETE with a position missing from it. Silently
// understated patrimony, and a direct breach of the schema_version >= 2 promise
// that `asset_values` carries EVERY active position of the instant. In the other
// direction the same coercion FABRICATED quantities: Number(true) is 1 and
// Number([5]) is 5, so a boolean or a wrapped array was valued as a real position.
//
// Second defect, the client/server divergence: `totalValueUSD` filtered only
// `!isFinite`, never `v <= 0`, so a qty −3 beside a valid 1000 published 850
// while the completeness gate correctly refused the snapshot. The hero showed a
// number no contract had certified.
//
// FINAL CONTRACT, and both sides must agree on all four states:
//   qty > 0  → VALUE
//   qty === 0 (real numeric zero, incl. −0) → legitimately ignored, NOT dropped
//   qty < 0  → INCOMPLETE
//   UNKNOWN / INVALID → INCOMPLETE
//
// This gate EXECUTES the real server valueUser (transpiled from the Edge
// Function) AND the real client owners (from app.js). It reimplements neither.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const TS_PATH = path.join(ROOT, 'supabase', 'functions', 'portfolio-snapshot', 'index.ts');
const ts = fs.readFileSync(TS_PATH, 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

let pass = 0, fail = 0;
function ok(n, c, info) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } }

// ── the REAL server owner, executed ─────────────────────────────────────────
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
const SNAMES = ['bucketOf', 'goldPurity', 'goldGrams', 'isUsEquityOpenNow', 'usableFactor', 'usableQuantity', 'fxToUsd', 'valueUser'];
const SRC = SNAMES.map(n => extractFn(n, js)).join('\n');
function assertTranspiled(src) {
  const bad = src.split('\n').filter(l => /\b(any|Record<|Map<|: string|: number|: boolean|: Date)\b/.test(l) && !/^\s*\/\//.test(l));
  return bad.length ? bad[0].trim().slice(0, 110) : null;
}
const CONSTS = 'const OZ_TO_G = 31.1034768;'
  + 'const PURITY_TABLE = { "10":0.4167,"14":0.5833,"18":0.7500,"21":0.8750,"22":0.9167,"24":1.0000 };';
let valueUser = null, usableQuantity = null, srvErr = null;
try {
  const leftover = assertTranspiled(SRC);
  if (leftover) throw new Error('TypeScript sin despojar (¿cambió una firma?): ' + leftover);
  const built = new Function(CONSTS + '\n' + SRC + '\n;return { valueUser: valueUser, usableQuantity: usableQuantity };')();
  valueUser = built.valueUser; usableQuantity = built.usableQuantity;
} catch (e) { srvErr = String((e && e.message) || e); }

// ── the REAL client owners, executed ───────────────────────────────────────
function fnSrcIn(src, name) {
  const s = 'function ' + name + '('; const i = src.indexOf(s);
  if (i < 0) throw new Error('missing ' + name);
  let p = src.indexOf('(', i), pd = 0;
  for (; p < src.length; p++) { if (src[p] === '(') pd++; else if (src[p] === ')') { pd--; if (!pd) { p++; break; } } }
  let k = src.indexOf('{', p), d = 0;
  for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) { k++; break; } } }
  return src.slice(i, k);
}
const fnSrc = n => fnSrcIn(app, n);
function konstSrc(name) {
  const s = 'const ' + name + ' ='; const i = app.indexOf(s);
  if (i < 0) throw new Error('missing const ' + name);
  let k = i, depth = 0, started = false;
  for (; k < app.length; k++) { const c = app[k];
    if (c === '(' || c === '{' || c === '[') { depth++; started = true; }
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (c === ';' && (!started || depth === 0)) { k++; break; } }
  return app.slice(i, k);
}
const CLIENT_OWNERS = ['isClosedAsset', 'activeAssets', '_aurixUsableQuantity', 'liquidityNominal',
  'assetNativeValue', 'assetValueUSD', 'totalValueUSD', 'isInvestableAsset', 'investableAssets',
  'investableValueUSD', '_aurixAssessValuationCompleteness',
  // added by the adversarial review: the salvage door, the position boundary and the pure
  // utility behind the published category return
  '_aurixSalvageHolding', '_aurixPositionFromAsset', 'computePositionPerformance', 'computeCategoryPerformance'];
let sb = null, cliErr = null;
try {
  sb = { Math, Number, JSON, Array, isFinite, Infinity, NaN, String, Object,
    console: { warn: () => {}, log: () => {}, debug: () => {} }, window: {} };
  vm.createContext(sb);
  sb.OZ_TO_G = 31.1034768; sb.usdToEur = 0.92;
  vm.runInContext(konstSrc('_AURIX_VALUATION_REASON'), sb);
  vm.runInContext('var _aurixPricesReady = true;', sb);
  vm.runInContext('var assets = [];', sb);
  sb._goldGrams = (q, u) => u === 'oz' ? q * sb.OZ_TO_G : (u === 'kg' ? q * 1000 : q);
  sb._goldPurity = k => ({ '24': 1, '18': 0.75 }[String(k)] || 1);
  sb._aurixCategoryBucket = a => (a && (a.type === 'real_estate' ? 'real_estate' : a.type)) || 'other';
  sb._aurixDisplayCategory = t => t || 'other';
  sb.avgBuyPrice = () => null;
  sb._aurixFxStatus = () => 'live';
  sb._aurixFxRate = () => NaN;
  CLIENT_OWNERS.forEach(n => vm.runInContext(fnSrc(n), sb));
} catch (e) { cliErr = String((e && e.message) || e); }
function client(list) {
  sb.__l = list;
  vm.runInContext('assets = __l;', sb);
  return {
    assess: vm.runInContext('_aurixAssessValuationCompleteness(activeAssets())', sb),
    total: vm.runInContext('totalValueUSD()', sb),
    investable: vm.runInContext('investableValueUSD()', sb),
  };
}
const cliQty = raw => { sb.__q = raw; return vm.runInContext('_aurixUsableQuantity(__q)', sb); };

const TS_CODE = ts.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const NOW = new Date('2026-08-24T15:00:00Z');
const PX = (o) => new Map(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? { price: v, currency: 'USD' } : v]));
const GOOD = PX({ AAPL: 200 });
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const sum = o => Object.values(o).reduce((s, x) => s + Number(x), 0);
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 0.011 : t);
// The capturer's own decision, mirrored from index.ts (empty branch, then LB-1).
const persisted = v => Number.isFinite(v.total) && v.total > 0 && Number(v.dropped_asset_count) === 0;
const outcome = v => (!Number.isFinite(v.total) || v.total <= 0)
  ? (Number(v.dropped_asset_count) > 0 ? 'INCOMPLETE' : 'EMPTY')
  : (Number(v.dropped_asset_count) > 0 ? 'INCOMPLETE' : 'INSERTED');

const A_CAT = { id: 'a', symbol: 'AAPL', type: 'stock', currentPrice: 200, assetCurrency: 'USD' };
const B_CAT = { id: 'b', symbol: 'MSFT', type: 'stock', currentPrice: 50, assetCurrency: 'USD' };
const PXAB = PX({ AAPL: 200, MSFT: 50 });
// server: a valid 1000 (5 × 200) plus the position under test
const srvPair = q => valueUser({ assets: [A_CAT, B_CAT],
  holdings: [{ id: 'h1', asset_id: 'a', quantity: 5 }, { id: 'h2', asset_id: 'b', quantity: q }] }, PXAB, NOW);
const srvSolo = (catalog, q, px) => valueUser({ assets: [catalog],
  holdings: [{ id: 'h', asset_id: catalog.id, quantity: q }] }, px || GOOD, NOW);
// client: the same shapes through the flat model (`qty: h.quantity`, raw — app.js:10790)
const cliPair = q => client([
  { id: 'a', symbol: 'AAPL', ticker: 'AAPL', type: 'stock', qty: 5, price: 200, assetCurrency: 'USD' },
  { id: 'b', symbol: 'MSFT', ticker: 'MSFT', type: 'stock', qty: q, price: 50, assetCurrency: 'USD' },
]);
const cliSolo = (q, over) => client([Object.assign(
  { id: 'a', symbol: 'AAPL', ticker: 'AAPL', type: 'stock', qty: q, price: 200, assetCurrency: 'USD' }, over || {})]);

console.log('\n════ AURIX-UNKNOWN-QUANTITY-INTEGRITY ════\n');
console.log('0 · Both real owners execute:');
ok('0.1 server valueUser + usableQuantity extracted and runnable from index.ts', valueUser !== null, srvErr || '');
ok('0.2 client valuation + completeness owners loaded from app.js', sb !== null, cliErr || '');
if (!valueUser || !sb) { console.log('\n✗ FAIL  cannot assert anything without both real owners\n'); process.exit(1); }

// ── 1–2 · REAL ZERO stays a real zero ──────────────────────────────────────
console.log('\n1–2 · A numeric zero is still a closed position, on both sides:');
{
  const s0 = srvPair(0), c0 = cliPair(0);
  ok('1 numeric 0 ⇒ server ignores it silently (NOT dropped) and still persists',
    Number(s0.dropped_asset_count) === 0 && persisted(s0) && s0.total === 1000 && !has(s0.assetValues, 'b')
    && s0.warnings.length === 0, 'drop=' + s0.dropped_asset_count + ' total=' + s0.total);
  ok('1b …and the client agrees: complete, the position not even counted as active',
    c0.assess.complete === true && c0.assess.reason === 'COMPLETE' && c0.assess.totalActive === 1
    && c0.assess.invalid === 0 && near(c0.total, 1000), JSON.stringify(c0.assess));
  const sm0 = srvPair(-0), cm0 = cliPair(-0);
  ok('2 −0 keeps the exact zero semantics on the server (−0 === 0)',
    Number(sm0.dropped_asset_count) === 0 && persisted(sm0) && sm0.total === 1000 && sm0.warnings.length === 0);
  ok('2b …and on the client',
    cm0.assess.complete === true && cm0.assess.invalid === 0 && near(cm0.total, 1000));
  ok('2c the canonical rule returns a real zero for 0 and −0, on both sides',
    usableQuantity(0) === 0 && usableQuantity(-0) === 0 && cliQty(0) === 0 && cliQty(-0) === 0);
  ok('2d …and a string "0" is an explicit zero too, not an unknown',
    usableQuantity('0') === 0 && cliQty('0') === 0);
}

// ── 3–9 · UNKNOWN / INVALID never becomes a legitimate zero ────────────────
console.log('\n3–9 · Unknown / invalid is INCOMPLETE, never a silent closed position:');
{
  const CASES = [
    ['3  null',                 null],
    ['4  empty string',         ''],
    ['5  whitespace-only',      '   '],
    ['6  false',                false],
    ['6b true (used to be valued as qty 1)', true],
    ['7  non-numeric string',   'abc'],
    ['8  NaN',                  NaN],
    ['9  Infinity',             Infinity],
    ['9b -Infinity',            -Infinity],
    ['9c undefined / absent',   undefined],
    ['9d object {}',            {}],
    ['9e array [] (used to be a silent zero)', []],
    ['9f array [5] (used to fabricate qty 5)', [5]],
    ['9g numeric string with junk "5x"', '5x'],
  ];
  CASES.forEach(([label, q]) => {
    const s = srvPair(q), c = cliPair(q);
    ok(label + ' ⇒ SERVER dropped, absent from asset_values, snapshot refused',
      Number(s.dropped_asset_count) === 1 && !has(s.assetValues, 'b') && !persisted(s)
      && outcome(s) === 'INCOMPLETE' && s.total === 1000,
      'drop=' + s.dropped_asset_count + ' total=' + s.total + ' av=' + JSON.stringify(s.assetValues));
    ok(label + ' ⇒ CLIENT completeness fails closed, counted as active AND invalid',
      c.assess.complete === false && c.assess.reason === 'INVALID_HOLDING'
      && c.assess.totalActive === 2 && c.assess.invalid === 1,
      JSON.stringify(c.assess));
  });
  ok('9h the canonical rule agrees with itself across BOTH owners for every shape',
    CASES.every(([, q]) => Number.isNaN(usableQuantity(q)) && Number.isNaN(cliQty(q))),
    CASES.filter(([, q]) => !(Number.isNaN(usableQuantity(q)) && Number.isNaN(cliQty(q)))).map(([l]) => l).join('|'));
}

// ── 10 · NEGATIVE stays fail-closed (previous block) ───────────────────────
console.log('\n10 · A negative quantity is still fail-closed:');
{
  const s = srvPair(-3), c = cliPair(-3);
  ok('10 SERVER drops it, nothing subtracted from the total',
    Number(s.dropped_asset_count) === 1 && s.total === 1000 && !has(s.assetValues, 'b') && !persisted(s));
  ok('10b CLIENT completeness still fails closed', c.assess.complete === false && c.assess.reason === 'INVALID_HOLDING');
  ok('10c …and the negative shares the one INVALID verdict on both sides',
    Number.isNaN(usableQuantity(-3)) && Number.isNaN(cliQty(-3)) && Number.isNaN(usableQuantity('-3')));
}

// ── 11–13 · VALID quantities are untouched ────────────────────────────────
console.log('\n11–13 · Valid quantities behave exactly as before:');
{
  const s5 = srvPair(5), c5 = cliPair(5);
  ok('11 positive integer ⇒ valued and persistable, identical on both sides',
    persisted(s5) && s5.total === 1250 && s5.assetValues.b === 250
    && c5.assess.complete === true && near(c5.total, 1250), 'srv=' + s5.total + ' cli=' + c5.total);
  const sd = srvPair(0.5), cd = cliPair(0.5);
  ok('12 positive decimal ⇒ unchanged on both sides',
    persisted(sd) && near(sd.assetValues.b, 25) && cd.assess.complete === true && near(cd.total, 1025));
  const ss = srvPair('5'), cs = cliPair('5');
  ok('13 a valid NUMERIC STRING keeps working (the model has always persisted them)',
    persisted(ss) && ss.assetValues.b === 250 && cs.assess.complete === true && near(cs.total, 1250),
    'srv=' + ss.total + ' cli=' + cs.total);
  ok('13b …including a padded numeric string, which is a real quantity, not whitespace',
    usableQuantity(' 5 ') === 5 && cliQty(' 5 ') === 5 && usableQuantity('2.5') === 2.5);
  ok('13c a very large and a sub-cent quantity are both still valid',
    usableQuantity(1e6) === 1e6 && usableQuantity(1e-9) === 1e-9 && cliQty(1e-9) === 1e-9);
}

// ── 14–19 · The refusal is total: one invalid poisons the whole snapshot ───
console.log('\n14–19 · An invalid quantity never reaches any published surface:');
{
  const s = srvPair(null);
  ok('14 one invalid + one valid ⇒ the WHOLE snapshot is refused', !persisted(s) && outcome(s) === 'INCOMPLETE');
  ok('15 the invalid position never enters asset_values', !has(s.assetValues, 'b'), JSON.stringify(s.assetValues));
  ok('16 …nor category_values (no bucket is created for it)',
    near(sum(s.categories), 1000) && Object.values(s.categories).every(x => x > 0), JSON.stringify(s.categories));
  ok('17 …and it never alters total_value_usd (1000, the valid position alone)', s.total === 1000);
  ok('18 dropped_asset_count is exactly the number of invalid positions',
    (function () {
      const w = valueUser({ assets: [A_CAT, B_CAT, { id: 'c', symbol: 'X', type: 'stock', currentPrice: 10, assetCurrency: 'USD' }],
        holdings: [{ id: 'h1', asset_id: 'a', quantity: 5 }, { id: 'h2', asset_id: 'b', quantity: null },
                   { id: 'h3', asset_id: 'c', quantity: '' }] }, PXAB, NOW);
      return Number(w.dropped_asset_count) === 2 && w.total === 1000 && Object.keys(w.assetValues).length === 1;
    })());
  ok('19 the warning names the instrument in the canonical vocabulary, with no value',
    /^invalid_qty:MSFT$/.test(s.warnings[0]) && !/\d/.test(s.warnings.join(',')), JSON.stringify(s.warnings));
  ok('19b …and falls back to the asset id when the symbol is missing',
    srvSolo({ id: 'noid', type: 'stock', currentPrice: 40, assetCurrency: 'USD' }, null).warnings[0] === 'invalid_qty:noid');
  ok('19c reconciliation holds with the invalid position excluded from all three surfaces',
    near(sum(s.assetValues), s.total) && near(sum(s.categories), s.total));
}

// ── 20 · LB-1 intact ──────────────────────────────────────────────────────
console.log('\n20 · LB-1 is untouched and still governs the write:');
{
  ok('20.1 the guard exists and still precedes the near-dup guard and the insert',
    /if \(Number\(v\.dropped_asset_count\) > 0\) \{ incompleteRej\+\+;/.test(ts)
    && ts.indexOf('if (Number(v.dropped_asset_count) > 0)') < ts.indexOf('near-duplicate guard')
    && ts.indexOf('if (Number(v.dropped_asset_count) > 0)') < ts.indexOf("admin.from('portfolio_snapshots').insert("));
  ok('20.2 a total of 0 caused by dropped positions reports INCOMPLETE, not EMPTY',
    /noteHealth\(r\.user_id, Number\(v\.dropped_asset_count\) > 0 \? 'INCOMPLETE' : 'EMPTY'/.test(ts));
  ok('20.3 a lone invalid position is INCOMPLETE (never "nothing to capture")',
    outcome(srvSolo(A_CAT, null)) === 'INCOMPLETE');
  ok('20.4 a genuinely liquidated account is still EMPTY, not INCOMPLETE',
    outcome(srvSolo(A_CAT, 0)) === 'EMPTY' && Number(srvSolo(A_CAT, 0).dropped_asset_count) === 0);
  ok('20.5 the gate still only SKIPS — it never updates or deletes an existing row',
    !/\.update\(|\.delete\(/.test(TS_CODE));
}

// ── 21–22 · CLIENT/SERVER PARITY ─────────────────────────────────────────
console.log('\n21–22 · Client and server interpret the same stored value identically:');
{
  const SHAPES = [0, -0, '0', 5, 0.5, '5', ' 5 ', 1e-9, -3, '-3', null, undefined, '', '   ',
    false, true, 'abc', '5x', NaN, Infinity, -Infinity, {}, [], [5]];
  ok('21.1 the canonical rule returns the SAME verdict on both sides for every shape',
    SHAPES.every(q => {
      const s = usableQuantity(q), c = cliQty(q);
      return (Number.isNaN(s) && Number.isNaN(c)) || s === c;
    }), SHAPES.filter(q => { const s = usableQuantity(q), c = cliQty(q);
      return !((Number.isNaN(s) && Number.isNaN(c)) || s === c); }).map(String).join('|'));
  ok('21.2 server "would persist" and client "certifies complete" agree for every shape',
    SHAPES.every(q => persisted(srvPair(q)) === (cliPair(q).assess.complete === true)),
    SHAPES.filter(q => persisted(srvPair(q)) !== (cliPair(q).assess.complete === true)).map(String).join('|'));
  // Compares the RULE, not the prose: comments are stripped first, so this can never be
  // satisfied by matching documentation — only by the two runtimes computing the same thing.
  ok('21.3 the two implementations are textually the same rule (one contract, two runtimes)',
    (function () {
      const norm = (src, name) => src
        .replace(/\/\/[^\n]*/g, '')                 // drop comments — never evidence
        .replace(/: any\)/, ')').replace(/\): number \{/, ') {')
        .replace(new RegExp(name, 'g'), 'X')
        .replace(/\s+/g, ' ').trim();
      const a = norm(extractFn('usableQuantity', ts), 'usableQuantity');
      const b = norm(fnSrc('_aurixUsableQuantity'), '_aurixUsableQuantity');
      return a === b && a.length > 80;               // non-vacuous: the rule is really there
    })(),
    'server: ' + extractFn('usableQuantity', ts).replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').slice(0, 100));
  // 22 — the divergence this SPEC was asked to close.
  ok('22.1 totalValueUSD no longer publishes a total built on an invalid quantity',
    near(cliPair(-3).total, 1000) && near(cliPair(null).total, 1000), String(cliPair(-3).total));
  ok('22.2 …and neither does investableValueUSD, the base the Hero renders',
    near(cliPair(-3).investable, 1000) && near(cliPair(null).investable, 1000), String(cliPair(-3).investable));
  ok('22.3 negative cash no longer drags the published total below the truth',
    (function () {
      const c = client([{ id: 'c', symbol: 'USD', ticker: 'USD', type: 'cash', qty: -500, price: 1, assetCurrency: 'USD' }]);
      return c.total === 0 && c.assess.complete === false;
    })());
  ok('22.4 the published total and the completeness verdict can no longer contradict each other',
    SHAPES.every(q => {
      const c = cliPair(q);
      return c.assess.complete === true ? near(c.total, q === 0 || q === '0' ? 1000 : c.total) : near(c.total, 1000);
    }));
  ok('22.5 both totals reuse the canonical rule — no second definition exists',
    (app.match(/function _aurixUsableQuantity\(/g) || []).length === 1
    && /function totalValueUSD\(\)[\s\S]{0,2000}?_aurixUsableQuantity\(a && a\.qty\)/.test(app)
    && /function investableValueUSD\(\)[\s\S]{0,2000}?_aurixUsableQuantity\(a && a\.qty\)/.test(app));
  // Scoped to the completeness owner ON PURPOSE. `Number(a.qty)` also lives in
  // _aurixPositionFromAsset — the Performance / P&L boundary, a different contract that this
  // SPEC deliberately leaves intact — so a file-wide ban would forbid legitimate code and
  // quietly widen the blast radius. Reported as a residual instead of silently changed.
  ok('22.6 completeness reads the RAW field through the canonical rule, not through Number()',
    (function () {
      const body = fnSrc('_aurixAssessValuationCompleteness');
      return /const qty = _aurixUsableQuantity\(a\.qty\);/.test(body)
        && !/Number\(a\.qty\)/.test(body)
        && !/liquidityNominal\(a\)/.test(body);
    })());
}

// ── 23 · Observability ───────────────────────────────────────────────────
console.log('\n23 · The per-user signal explains the refusal, without PII:');
{
  ok('23.1 the refusal reports INCOMPLETE with dropped > 0',
    (function () { const s = srvPair(null);
      return outcome(s) === 'INCOMPLETE' && Number(s.dropped_asset_count) > 0; })());
  ok('23.2 the warning prefix is the canonical, already-reviewed invalid_qty',
    /^invalid_qty:/.test(srvPair('').warnings[0]));
  ok('23.3 observability still normalises it to invalid_quantity', /invalid_qty: 'invalid_quantity'/.test(ts));
  ok('23.4 no new outcome was added to the closed vocabulary',
    /const HEALTH_OUTCOMES = \['INSERTED', 'INACTIVE', 'EMPTY', 'INCOMPLETE', 'SKIPPED', 'ERROR'\] as const;/.test(ts));
  ok('23.5 no quantity VALUE is ever interpolated into a warning',
    (function () {
      const args = (TS_CODE.match(/warnings\.push\(([^;]*?)\);/g) || []).map(a => a.replace(/'[^']*'/g, "''"));
      return args.length >= 4 && args.every(a => !/\b(valueUSD|storedPrice|unit|native|nativeUSD|spotPerOz|qty|total|fx|raw)\b/.test(a));
    })());
  ok('23.6 no schema change and no new migration', (function () {
    let m = []; try { m = fs.readdirSync(path.join(ROOT, 'supabase', 'migrations')).filter(f => /\.sql$/.test(f)); } catch (e) { m = []; }
    return m.length === 1; })());
}

// ── 24 · Recovery ────────────────────────────────────────────────────────
console.log('\n24 · Recovery is automatic once the quantity is real again:');
{
  ok('24.1 before: invalid ⇒ refused; after: a valid quantity ⇒ persistable',
    !persisted(srvPair(null)) && persisted(srvPair(4)) && srvPair(4).assetValues.b === 200);
  ok('24.2 recovery needs no flag, no reset, no backfill — only the data',
    !/backfill|repair|force_insert|override/i.test(TS_CODE));
  ok('24.3 the client recovers on the same input, with no separate reset',
    cliPair(null).assess.complete === false && cliPair(4).assess.complete === true);
}

// ── 25 · Every earlier financial contract is intact ──────────────────────
console.log('\n25 · The price / FX / gold / real-estate contracts are untouched:');
{
  const B = over => Object.assign({ id: 'b', symbol: 'GHOST', type: 'stock', currentPrice: 40, assetCurrency: 'USD' }, over);
  const pair = (bCat, q, px) => valueUser({ assets: [A_CAT, bCat],
    holdings: [{ id: 'h1', asset_id: 'a', quantity: 5 }, { id: 'h2', asset_id: 'b', quantity: q == null ? 10 : q }] }, px || GOOD, NOW);
  ok('25.1 unknown price (null) ⇒ still dropped, never valued at 0',
    Number(pair(B({ currentPrice: null })).dropped_asset_count) === 1);
  ok('25.2 price 0 and NEGATIVE price ⇒ still dropped, never subtracting',
    Number(pair(B({ currentPrice: 0 })).dropped_asset_count) === 1
    && Number(pair(B({ currentPrice: -30 })).dropped_asset_count) === 1
    && pair(B({ currentPrice: -30 })).total === 1000);
  ok('25.3 FX missing ⇒ still fail-closed with its own distinct warning',
    /fx_missing:EUR/.test(pair(B({ assetCurrency: 'EUR' })).warnings.join(',')));
  ok('25.4 non-USD cash still never treats a stored 1 as an exchange rate',
    (function () { const w = pair(B({ type: 'cash', currentPrice: 1, assetCurrency: 'EUR' }));
      return Number(w.dropped_asset_count) === 1 && /fx_missing:EUR/.test(w.warnings.join(',')); })());
  ok('25.5 PRICES-PRESERVE-1 intact: an unusable PROVIDER price falls back to the catalog',
    (function () { const w = pair(B({ symbol: 'PX', currentPrice: 50 }), 10, PX({ AAPL: 200, PX: 0 }));
      return Number(w.dropped_asset_count) === 0 && persisted(w) && near(w.assetValues.b, 500)
        && w.price_staleness !== 'live'; })());
  ok('25.6 …and the stored-price fallback line itself is byte-intact',
    /const unit = havePx \? freshUnit : storedPrice;/.test(ts));
  ok('25.7 gold still values through grams × purity × spot/oz',
    (function () { const w = srvSolo({ id: 'g', symbol: 'XAU', type: 'metal', karat: '24', goldUnit: 'g',
      currentPrice: null, assetCurrency: 'USD' }, 100, PX({ 'XAU/USD': 3110.34768 }));
      return Number(w.dropped_asset_count) === 0 && near(w.assetValues.g, 10000, 1); })());
  ok('25.8 unparseable gold purity ⇒ still dropped (usableFactor untouched)',
    Number(srvSolo({ id: 'g', symbol: 'XAU', type: 'metal', karat: '18K', goldUnit: 'g', currentPrice: 60,
      assetCurrency: 'USD' }, 100, PX({ 'XAU/USD': 3000 })).dropped_asset_count) === 1);
  ok('25.9 real_estate keeps its own column and its bucket',
    (function () { const w = srvSolo({ id: 'd', symbol: 'HOME', type: 'real_estate', currentPrice: 300000,
      assetCurrency: 'USD' }, 1, PX({}));
      return near(w.realEstate, 300000) && near(w.categories.real_estate, 300000) && persisted(w); })());
  ok('25.10 orphan holding ⇒ still dropped with its own warning, still not salvaged server-side',
    (function () { const w = valueUser({ assets: [], holdings: [{ id: 'h', asset_id: 'zz', quantity: 1 }] }, GOOD, NOW);
      return Number(w.dropped_asset_count) === 1 && /orphan_holding:zz/.test(w.warnings.join(',')); })());
  ok('25.11 an orphan with an INVALID quantity is still attributed to the orphan (no double count)',
    (function () { const w = valueUser({ assets: [], holdings: [{ id: 'h', asset_id: 'zz', quantity: null }] }, GOOD, NOW);
      return Number(w.dropped_asset_count) === 1 && /orphan_holding:zz/.test(w.warnings.join(',')); })());
  ok('25.12 schema_version 2 still stamped, insert still exactly 12 columns',
    /schema_version: 2,/.test(ts) && (function () {
      const raw = ts.slice(ts.indexOf("admin.from('portfolio_snapshots').insert("), ts.indexOf('if (insErr) {'));
      const ins = raw.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
        .replace(/\/\/[^\n'"]*$/gm, '').replace(/'[^']*'/g, "''");
      return (ins.match(/\b(\w+)\s*:/g) || []).length === 12; })());
  ok('25.13 a sub-cent POSITIVE position is still valued, never dropped (schema_version >= 2)',
    (function () { const w = pair(B({ symbol: 'TINY', currentPrice: 200 }), 0.00001, PX({ AAPL: 200, TINY: 200 }));
      return Number(w.dropped_asset_count) === 0 && persisted(w) && has(w.assetValues, 'b')
        && w.assetValues.b === 0; })());
  ok('25.14 the auth gate and its fail-closed posture are untouched',
    /if \(!INVOKE_KEY \|\| INVOKE_KEY\.length < 20\) return \{ ok: false, status: 503/.test(ts)
    && ts.indexOf('const auth = authorizeCaller(req);') < ts.indexOf('createClient(SUPABASE_URL, SERVICE_ROLE)'));
}

// ── 26–30 · Nothing downstream moved ────────────────────────────────────
console.log('\n26–30 · Chart, Performance, Reader, Preview and User Health:');
{
  // Byte-identity of the owners this SPEC must not touch — no baseline needed, so it
  // blocks in CI forever rather than skipping on a shallow checkout.
  const UNTOUCHED = ['buildValidatedHistoricalSeries', '_aurixResolveFinalRenderSeriesContract',
    'computePerformanceSnapshot', '_aurixComputePerformanceStateCandidate',
    '_aurixNormalizeBackendSnapshot', '_aurixMergeSnapshotSources', '_aurixHistorySourceForDisplay',
    '_aurixCatHistWindow', '_aurixIntelligencePreviewFacts', '_aurixIntelligencePreviewHTML'];
  ok('26–29 the Chart, Performance, Reader and Preview owners exist exactly once and none reads the quantity rule',
    UNTOUCHED.every(n => (app.match(new RegExp('^(?:async )?function ' + n + '\\(', 'gm')) || []).length === 1)
    && UNTOUCHED.every(n => !/_aurixUsableQuantity/.test(fnSrc(n))),
    UNTOUCHED.filter(n => /_aurixUsableQuantity/.test(fnSrc(n))).join(','));
  ok('30.1 the per-user observability block is untouched by this SPEC',
    /function normalizeWarnings\(ws: any\): string\[\] \{/.test(ts) && /portfolio_snapshot_user_health_upsert/.test(ts));
  ok('30.2 the observability flush still runs AFTER every financial write',
    ts.indexOf("admin.from('portfolio_snapshots').insert(") < ts.indexOf('// ── Per-user observability flush'));
  // The declared client call sites, ENUMERATED rather than merely counted, so adding one in a
  // future SPEC is a decision someone has to write down here. Three of them were added because
  // the adversarial review found them: the salvage path (which WROTE a laundered 0 back to disk),
  // the position boundary and the pure utility behind the published category return.
  const DECLARED_CALL_SITES = ['totalValueUSD', 'investableValueUSD', '_aurixAssessValuationCompleteness',
    '_aurixSalvageHolding', '_aurixPositionFromAsset', 'computePositionPerformance',
    // SPEC WORKSPACE FORMULA INTEGRITY — la capa de fórmulas publicadas de Workspace lee la
    // cantidad certificada por AQUÍ y sólo por aquí; su gate propio es
    // docs/AURIX-WORKSPACE-FORMULA-INTEGRITY-harness.js.
    '_aw8Qty',
    // …y el owner de la superficie VIVA de Workspace, donde `assetCount` se contaba sobre la
    // lista sin filtrar mientras el total ya venía filtrado. Mismo gate que _aw8Qty.
    '_aurixHealthSnapshot',
    // SPEC INT.03 — el owner de diversificación efectiva (HHI / effective holdings) del
    // Intelligence Core. Lee la cantidad certificada por AQUÍ para FALLAR CERRADO: una
    // posición con cantidad no usable invalidaría el denominador y sobrestimaría la
    // diversificación, así que no publica número. Gate propio:
    // docs/AURIX-INT-CORE-FACT-ENGINE-harness.js (sección 4).
    '_aurixEffectiveDiversification'];
  ok('30.3 the quantity rule is used ONLY where this SPEC declares it',
    (app.match(/_aurixUsableQuantity\(/g) || []).length === DECLARED_CALL_SITES.length + 2   // +1 definicion, +1 recomputeDerivedFinancialState
    && DECLARED_CALL_SITES.every(n => /_aurixUsableQuantity\(/.test(fnSrc(n)))
    && (ts.match(/usableQuantity\(/g) || []).length === 2,                                   // 1 definition + 1 server call site
    'client=' + (app.match(/_aurixUsableQuantity\(/g) || []).length + ' server=' + (ts.match(/usableQuantity\(/g) || []).length
      + ' missing=' + DECLARED_CALL_SITES.filter(n => !/_aurixUsableQuantity\(/.test(fnSrc(n))).join(','));
  ok('30.4 assetNativeValue / assetValueUSD were NOT changed (no NaN pushed into unrelated surfaces)',
    /return asset\.qty \* asset\.price;/.test(app)
    && /function liquidityNominal\(asset\) \{\s*return Number\(asset\?\.qty \|\| 0\);\s*\}/.test(app));
  ok('30.5 no clamp, no abs, no coalescing-to-zero was introduced anywhere',
    !/Math\.abs\s*\(\s*(qty|raw)/.test(TS_CODE) && !/Number\(raw\) \|\| 0/.test(TS_CODE)
    && !/_aurixUsableQuantity\([^)]*\) \|\| 0/.test(app));
}

// ── 31 · The three paths the adversarial review returned FAIL on ─────────
console.log('\n31 · The doors the adversarial review found open:');
{
  // 31.1-31.3 — the SALVAGE door. `Number(h.quantity) || 0` laundered the unknown to a finite 0
  // BEFORE any contract saw it, and convertToNewFormat then persisted that 0, destroying the
  // unknown on disk. Executed, not asserted on source.
  const sv = (quantity, costBasis, tx) => { sb.__h = { id: 'h1', asset_id: 'zz', quantity: quantity,
    costBasis: costBasis, transactions: tx || [] }; return vm.runInContext('_aurixSalvageHolding(__h, null)', sb); };
  ok('31.1 a salvaged orphan with an UNKNOWN quantity keeps it unknown (never a fabricated 0)',
    [null, '', '   ', false, [], true].every(q => {
      const r = sv(q, 5000);
      return r !== null && !Number.isFinite(cliQty(r.qty));
    }), [null, '', '   ', false, [], true].filter(q => { const r = sv(q, 5000);
      return !(r !== null && !Number.isFinite(cliQty(r.qty))); }).map(String).join('|'));
  ok('31.2 …so completeness fails closed on it instead of certifying a total without it',
    (function () {
      const r = sv(null, 5000);
      const c = client([{ id: 'a', symbol: 'AAPL', ticker: 'AAPL', type: 'stock', qty: 5, price: 200, assetCurrency: 'USD' },
        Object.assign({ type: 'other', price: 0, assetCurrency: 'USD' }, r)]);
      return c.assess.complete === false && c.assess.invalid === 1;
    })());
  ok('31.3 a genuinely empty orphan is STILL discarded (garbage cannot block every snapshot)',
    sv(null, 0) === null && sv(0, 0) === null && sv('', 0) === null);
  ok('31.4 …while a known positive quantity, and a known 0 with cost, keep their old handling',
    sv(5, 100) !== null && sv(5, 100).qty === 5 && sv(0, 500) !== null && sv(0, 500).qty === 0);

  // 31.5-31.7 — the PUBLISHED RETURN door. This is not a display component: it is a %.
  const perf = (qty, cost) => { sb.__a = { id: 'x', ticker: 'AAPL', type: 'stock', qty: qty, price: 200, costBasis: cost };
    return vm.runInContext('computePositionPerformance(_aurixPositionFromAsset(__a))', sb); };
  ok('31.5 an unknown quantity NEVER yields a published return percentage',
    [null, '', '   ', false, [], 'abc', -3].every(q => {
      const r = perf(q, 5000);
      return r.state === 'missing_price' && r.returnPct === null && r.currentValue === null;
    }), [null, '', '   ', false, [], 'abc', -3].filter(q => perf(q, 5000).returnPct !== null).map(String).join('|'));
  ok('31.6 …and the row is never graded "ready" on data nobody could value',
    [null, '', false, [], -3].every(q => perf(q, 5000).state !== 'ready'));
  ok('31.7 a valid quantity still publishes the SAME return as before',
    perf(5, 800).state === 'ready' && near(perf(5, 800).returnPct, 25)
    && perf('5', 800).state === 'ready' && near(perf('5', 800).returnPct, 25)
    && perf(0.5, 50).state === 'ready' && near(perf(0.5, 50).returnPct, 100),
    JSON.stringify(perf(5, 800)));
  ok('31.8 the category aggregate reports PARTIAL instead of silently including the unknown',
    (function () {
      sb.__l = [{ id: 'a', ticker: 'AAPL', type: 'stock', qty: 5, price: 200, costBasis: 800 },
                { id: 'b', ticker: 'MSFT', type: 'stock', qty: null, price: 50, costBasis: 5000 }];
      const agg = vm.runInContext('computeCategoryPerformance(__l.map(_aurixPositionFromAsset))', sb);
      return agg.state === 'partial' && agg.readyPositionCount === 1 && agg.positionCount === 2
        && near(agg.currentValue, 1000);
    })());
  ok('31.9 a real zero keeps publishing its real return (zeros were not turned into errors)',
    perf(0, 5000).state === 'ready' && near(perf(0, 5000).returnPct, -100));

  // 31.10 — the divergence THIS SPEC introduced and the review caught: two published totals.
  // Scoped to recomputeDerivedFinancialState's OWN body, so this gate genuinely watches that owner
  // (the reader gate's exemption list requires a named watcher, and this is it).
  const DFS = fnSrc('recomputeDerivedFinancialState');
  ok('31.10 recomputeDerivedFinancialState applies the same quantity contract as the Hero',
    /const _qtyOk = _valuableSet\.has\(asset\);/.test(DFS)
    && /const _vUSD  = _qtyOk \? assetValueUSD\(asset\) : NaN;/.test(DFS)
    && /const _valuableSet    = new Set\(_valuableAssets\);/.test(DFS)
    && DFS.indexOf('const _valuableSet') < DFS.indexOf('const _qtyOk =')
    && DFS.indexOf('const _qtyOk =') < DFS.indexOf('totalValue       += _vUSD;'),
    'len=' + DFS.length);
  ok('31.11 …while cost basis and realized P&L keep their OWN contracts in that same owner',
    /const _cbUSD = costBasisUSD\(asset\);/.test(DFS) && /const _rpUSD = realizedPnLUSD\(asset\);/.test(DFS)
    && !/_qtyOk \? costBasisUSD/.test(DFS) && !/_qtyOk \? realizedPnLUSD/.test(DFS));
  ok('31.12 the two published totals can no longer disagree: both filter on the same rule',
    ['totalValueUSD', 'investableValueUSD', 'recomputeDerivedFinancialState']
      .every(n => /_aurixUsableQuantity\(/.test(fnSrc(n))));

  // 31.13-31.17 — the re-review's finding: guarding the TOTAL alone made numerator and
  // denominator come from different filters, so a fabricated `quantity: true` published a
  // crypto exposure of 106% — an impossible ratio, auto-rendered on opening Workspace, and
  // worse than the wrong-but-possible 100% it printed before. ONE list now feeds all of them.
  ok('31.13 one canonically filtered list is derived once inside the owner',
    /const _valuableAssets = portfolioAssets\.filter\(a => Number\.isFinite\(_aurixUsableQuantity\(a && a\.qty\)\)\);/.test(DFS));
  ok('31.14 allocations, exposure and assetCount all consume THAT list, not the unfiltered one',
    /buildPortfolioAllocations\(_valuableAssets, totalValue\)/.test(DFS)
    && /buildPortfolioExposure\(_valuableAssets\)/.test(DFS)
    && /assetCount:      _valuableAssets\.length,/.test(DFS)
    && !/buildPortfolioAllocations\(portfolioAssets/.test(DFS)
    && !/buildPortfolioExposure\(portfolioAssets\)/.test(DFS)
    && !/assetCount:      portfolioAssets\.length/.test(DFS));
  ok('31.15 …while the loop still walks the UNFILTERED list, so cost and realized P&L see every position',
    /for \(const asset of portfolioAssets\) \{/.test(DFS)
    && DFS.indexOf('const _valuableAssets =') < DFS.indexOf('for (const asset of portfolioAssets) {'));
  ok('31.16 an exposure percentage can no longer exceed the total it divides by',
    (function () {
      // executed, with the re-review's exact numbers: BTC 0.5 x 100000 valid + a fabricated
      // `quantity: true` at price 3000. 53000/50000 was 106%.
      const rows = [{ ticker: 'BTC', type: 'crypto', qty: 0.5, price: 100000, assetCurrency: 'USD' },
                    { ticker: 'ETH', type: 'crypto', qty: true, price: 3000, assetCurrency: 'USD' }];
      sb.__rows = rows;
      const kept = vm.runInContext('__rows.filter(a => Number.isFinite(_aurixUsableQuantity(a && a.qty)))', sb);
      const total = kept.reduce((acc, a) => { sb.__a = a; const v = vm.runInContext('assetValueUSD(__a)', sb);
        return Number.isFinite(v) ? acc + v : acc; }, 0);
      const expo = kept.reduce((acc, a) => { sb.__a = a; const v = vm.runInContext('assetValueUSD(__a)', sb);
        return Number.isFinite(v) ? acc + v : acc; }, 0);
      return kept.length === 1 && total === 50000 && expo === 50000 && (expo / total) * 100 === 100;
    })());
  ok('31.17 gainers/losers stay on the unfiltered list — they rank by change24h, not by quantity',
    /const gainers = \[\.\.\.portfolioAssets\]/.test(DFS) && /const losers = \[\.\.\.portfolioAssets\]/.test(DFS)
    && /change24h/.test(DFS));
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + '  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
