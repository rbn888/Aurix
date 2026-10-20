'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-NUMERIC-INPUT-CONTRACT-harness — LOTE 1 · P0 INTEGRIDAD NUMÉRICA
// ════════════════════════════════════════════════════════════════════════════
// Ejecuta el código REAL de app.js (las funciones se extraen del fichero, no se
// copian) para fijar el contrato de lectura/escritura de los campos numéricos:
//   1. tabla de lectura ES/EN (decimales, miles, ambiguos, inválidos)
//   2. ida y vuelta EXACTA escritura→lectura en ambos idiomas (===)
//   3. ningún consumidor de los flujos de cartera lee un campo numérico por otra vía
// El comportamiento en el DOM (pulsaciones reales, persistencia, edición sin
// cambios, cambio de idioma) lo certifica scripts/aurix-numeric-input-probe.mjs.
const fs = require('fs'), path = require('path'), vm = require('vm');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing ' + n); return braceSlice(app, i); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const ctx = { lang: 'es' };
vm.createContext(ctx);
vm.runInContext('const MAX_INPUT_NUMBER = 1e12;\n' + ['_aurixNumLang', '_aurixReadNumberText', 'parseLocalFloat', '_aurixFormatNumberInput'].map(fnSrc).join('\n'), ctx);
const P = (s, l) => ctx.parseLocalFloat(s, l);
const R = (s, l) => ctx._aurixReadNumberText(s, l);
const F = (n, l) => ctx._aurixFormatNumberInput(n, l);
const same = (a, b) => (Number.isNaN(a) && Number.isNaN(b)) || a === b;

console.log('\nAURIX-NUMERIC-INPUT-CONTRACT — LOTE 1 · P0');

// ── 1 · tabla de lectura ─────────────────────────────────────────────────────
const NBSP = ' ', NNBSP = ' ';
const TABLE = [
  // texto,            ES,          EN,          ambigüedad ES, ambigüedad EN
  ['0.2',              0.2,         0.2,         null,          null],
  ['0,2',              0.2,         0.2,         null,          null],
  ['0.0015',           0.0015,      0.0015,      null,          null],
  ['1.5',              1.5,         1.5,         null,          null],
  ['1,5',              1.5,         1.5,         null,          null],
  ['300.50',           300.5,       300.5,       null,          null],
  ['300,50',           300.5,       300.5,       null,          null],
  ['65000.5',          65000.5,     65000.5,     null,          null],
  ['1.000',            1000,        1,           'group',       'decimal'],
  ['1,000',            1,           1000,        'decimal',     'group'],
  ['12.345',           12345,       12.345,      'group',       'decimal'],
  ['0.200',            0.2,         0.2,         null,          null],
  ['1000.000',         1000,        1000,        null,          null],
  ['1.234,56',         1234.56,     1234.56,     null,          null],
  ['1,234.56',         1234.56,     1234.56,     null,          null],
  ['1.234.567',        1234567,     1234567,     null,          null],
  ['1,234,567',        1234567,     1234567,     null,          null],
  ['1.234.567,89',     1234567.89,  1234567.89,  null,          null],
  ['1234',             1234,        1234,        null,          null],
  ['5,',               5,           5,           null,          null],
  ['.5',               0.5,         0.5,         null,          null],
  ['1.2.3',            NaN,         NaN,         null,          null],
  ['1,23,456',         NaN,         NaN,         null,          null],
  ['1.2,3',            NaN,         NaN,         null,          null],
  ['1,5.3',            NaN,         NaN,         null,          null],
  ['12abc',            NaN,         NaN,         null,          null],
  ['€100',             NaN,         NaN,         null,          null],
  ['1e3',              NaN,         NaN,         null,          null],
  ['Infinity',         NaN,         NaN,         null,          null],
  ['-',                NaN,         NaN,         null,          null],
  ['',                 NaN,         NaN,         null,          null],
  [',',                NaN,         NaN,         null,          null],
  ['-5',               -5,          -5,          null,          null],
  ['1' + NBSP + '234,5', 1234.5,    1234.5,      null,          null],
  ['12' + NNBSP + '345', 12345,     12345,       null,          null],
  [' 0.2 ',            0.2,         0.2,         null,          null],
  ['1000000000000',    1e12,        1e12,        null,          null],
  ['1000000000001',    NaN,         NaN,         null,          null],
];
TABLE.forEach(([txt, es, en, aes, aen]) => {
  ok(`1 ES «${txt}» → ${es}`, same(P(txt, 'es'), es), String(P(txt, 'es')));
  ok(`1 EN «${txt}» → ${en}`, same(P(txt, 'en'), en), String(P(txt, 'en')));
  ok(`1 ES «${txt}» ambigüedad ${aes}`, R(txt, 'es').ambiguous === aes, String(R(txt, 'es').ambiguous));
  ok(`1 EN «${txt}» ambigüedad ${aen}`, R(txt, 'en').ambiguous === aen, String(R(txt, 'en').ambiguous));
});
ok('1 la alternativa propuesta para «1.000» en ES es «1,000»', R('1.000', 'es').alt === '1,000');
ok('1 la alternativa propuesta para «1,000» en EN es «1.000»', R('1,000', 'en').alt === '1.000');
ok('1 sin idioma explícito se usa el activo (lang)', (ctx.lang = 'en', P('1,000')) === 1000 && (ctx.lang = 'es', P('1,000')) === 1);
ok('1 no-string → NaN', Number.isNaN(P(undefined)) && Number.isNaN(P(null)) && Number.isNaN(P(5)));

// ── 2 · ida y vuelta exacta ──────────────────────────────────────────────────
const CORPUS = [0, 1, 0.2, 0.5, 1.5, 0.0015, 1e-8, 1.23456789e-11, 0.30000000000000004, 0.123456789012345,
  1234, 12345, 123456, 1234567.89, 1e12, 999999999999.99, 250000, 1200, 1.2, 2.345, 0.000012345, 31.1034768,
  65000.12, 7.99, 59.99, 100, 1000, 0.1 + 0.2, 1 / 3, 2 / 3, 5e-7, 1.5e-10, 42.000001];
for (const l of ['es', 'en']) CORPUS.forEach(n => {
  const txt = F(n, l), back = P(txt, l);
  ok(`2 ${l} ${n} → «${txt}» → ${back}`, back === n, `«${txt}» → ${back}`);
  ok(`2 ${l} ${n} se escribe sin exponente`, !/e/i.test(txt), txt);
});
ok('2 es-ES no agrupa 4 cifras (como Intl)', F(1234, 'es') === '1234' && F(12345, 'es') === '12.345');
ok('2 en-US agrupa desde 4 cifras (como Intl)', F(1234, 'en') === '1,234' && F(1234.5, 'en') === '1,234.5');
ok('2 decimal en el separador del idioma', F(0.5, 'es') === '0,5' && F(0.5, 'en') === '0.5');
ok('2 negativos conservan el signo', F(-2.5, 'es') === '-2,5' && P(F(-2.5, 'es'), 'es') === -2.5);
ok('2 NaN / Infinity → campo vacío', F(NaN, 'es') === '' && F(Infinity, 'en') === '');
// Formato contra Intl en el rango en que Intl no redondea (≤ 3 decimales)
for (const n of [1, 12, 123, 1234, 12345, 123456, 1234567, 1.5, 1234.567, 98765.432]) {
  ok(`2 coincide con Intl es-ES (${n})`, F(n, 'es') === new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 }).format(n), F(n, 'es') + ' vs ' + new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 }).format(n));
  ok(`2 coincide con Intl en-US (${n})`, F(n, 'en') === new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(n));
}

// ── 3 · una sola vía de lectura/escritura en los flujos de cartera ───────────
ok('3 normalizePriceInput retirado', !/function normalizePriceInput\(|normalizePriceInput\(/.test(app));
ok('3 ningún parseLocalFloat(x.value) directo en un consumidor (sólo el lector de campo)', (app.match(/parseLocalFloat\([^)]*\.value/g) || []).every(m => m.startsWith("parseLocalFloat(String(el.value")));
ok('3 el NAV manual ya no usa parseFloat(replace)', !/parseFloat\(String\(input\.value \|\| ''\)\.replace\(',', '\.'\)/.test(app));
ok('3 la liquidez ya no tiene formateador de sólo dígitos', !/liquidityQtyInput\.addEventListener\('input'/.test(app));
ok('3 ningún relleno crudo de operación', !/txQtyInput\.value\s*=\s*tx\.qty|txPriceInput\.value\s*=\s*(tx|asset)\.price/.test(app));
ok('3 ningún relleno toFixed del precio manual', !/prefill\.price\.toFixed/.test(app));
ok('3 ningún relleno Intl sin decimales del inmueble', !/qtyInput\.value = new Intl\.NumberFormat/.test(app));
for (const id of ['manualPrice', 'assetPurchasePrice', 'reRent', 'txQty', 'txPrice'])
  ok(`3 #${id} lleva el formateador del contrato`, app.includes(`document.getElementById('${id}')`) && /\[qtyInput, reduceQtyInput, addQtyInput, liquidityQtyInput,[\s\S]{0,400}\]\.forEach\(el => attachFormatter\(el\)\)/.test(app) && new RegExp(`\\[qtyInput[\\s\\S]{0,400}getElementById\\('${id}'\\)[\\s\\S]{0,300}attachFormatter`).test(app));
// La corrección legada ÷100 sigue para operaciones del parser antiguo y NO toca las escritas
// con el contrato nuevo (marca pv). Se ejecuta el código real.
{ const c2 = { _AURIX_TX_PRICE_CONTRACT: 2 }; vm.createContext(c2);
  vm.runInContext('const _AURIX_TX_PRICE_CONTRACT = 2;\n' + fnSrc('_aurixLegacyClippedPrice') + '\n' + fnSrc('sanitizeTransactionPrices'), c2);
  const a = { transactions: [{ type: 'buy', qty: 1, price: 244677, ts: 1 }, { type: 'buy', qty: 1, price: 1234567.89, ts: 2, pv: 2 }, { type: 'buy', qty: 1, price: 700000, ts: 3, pv: 2 }] };
  c2.a = a; vm.runInContext('sanitizeTransactionPrices(a); sanitizeTransactionPrices(a);', c2);
  ok('3 legado sin marca: 244677 → 2446.77 (comportamiento de producción conservado)', a.transactions[0].price === 2446.77, String(a.transactions[0].price));
  ok('3 contrato nuevo: 1234567.89 y 700000 intactos tras dos renders', a.transactions[1].price === 1234567.89 && a.transactions[2].price === 700000); }
// TRANSICIÓN — una pestaña con el app.js ≤ v851 aplica su ÷100 a ciegas (copia LITERAL de la
// función de v851 como fixture del cliente antiguo) y el cliente nuevo debe deshacer sólo eso.
{ const c3 = {}; vm.createContext(c3);
  vm.runInContext(fnSrc('_aurixLegacyClippedPrice') + '\n' + fnSrc('sanitizeTransactionPrices').replace('function sanitizeTransactionPrices(', 'function newSanitize(') + `
    const _AURIX_TX_PRICE_CONTRACT = 2;
    function v851Sanitize(asset) {
      if (!asset.transactions || !asset.transactions.length) return;
      asset.transactions.forEach(tx => {
        if (!tx.price) return;
        if (tx.price > 100000) tx.price = tx.price / 100;
      });
    }`, c3);
  const run = (txs, oldRenders) => { c3.a = { transactions: txs.map(t => Object.assign({}, t)) }; c3.k = oldRenders;
    vm.runInContext('for (let i = 0; i < k; i++) v851Sanitize(a); newSanitize(a); newSanitize(a);', c3); return c3.a.transactions; };
  let r = run([{ type: 'buy', qty: 1, price: 700000, ts: 1, pv: 2, pvPrice: 700000 }], 1);
  ok('3 transición: BRK.A 700000 recortada a 7000 por una pestaña v851 → restituida', r[0].price === 700000, String(r[0].price));
  r = run([{ type: 'buy', qty: 1, price: 1.5e7, ts: 1, pv: 2, pvPrice: 1.5e7 }], 3);
  ok('3 transición: 1,5e7 recortada dos veces (150000 → 1500) → restituida', r[0].price === 1.5e7, String(r[0].price));
  r = run([{ type: 'buy', qty: 1, price: 1234567.89, ts: 1, pv: 2, pvPrice: 1234567.89 }], 1);
  ok('3 transición: 1234567.89 → 12345.6789 → restituida exacta', r[0].price === 1234567.89, String(r[0].price));
  r = run([{ type: 'buy', qty: 1, price: 7001, ts: 1, pv: 2, pvPrice: 700000 }], 0);
  ok('3 transición: un precio que NO es la huella exacta del ÷100 no se toca', r[0].price === 7001);
  r = run([{ type: 'buy', qty: 1, price: 50000, ts: 1, pv: 2, pvPrice: 50000 }], 2);
  ok('3 transición: una marcada ≤ 100.000 nunca cambia', r[0].price === 50000);
  r = run([{ type: 'buy', qty: 1, price: 7000, ts: 1, pv: 2, pvPrice: 7000 }], 0);
  ok('3 transición: una edición legítima (pvPrice reescrito) se respeta', r[0].price === 7000);
  r = run([{ type: 'buy', qty: 1, price: 244677, ts: 1 }], 1);
  ok('3 transición: legado sin marca sigue igual que en v851 (2446.77)', r[0].price === 2446.77, String(r[0].price));
  r = run([{ type: 'buy', qty: 1, price: 244677, ts: 1 }], 0);
  ok('3 transición: legado sin marca que llega crudo se corrige como en v851', r[0].price === 2446.77, String(r[0].price)); }
ok('3 toda operación marcada lleva también su precio escrito (pvPrice)', (app.match(/pvPrice: /g) || []).length === 7, String((app.match(/pvPrice: /g) || []).length));
ok('3 la corrección legada sigue en render()', /sanitizeTransactionPrices\(asset\);\s*\n\s*syncQtyFromTransactions\(asset\)/.test(app));
const stamps = (app.match(/pv: _AURIX_TX_PRICE_CONTRACT/g) || []).length;
ok('3 toda operación escrita con el contrato nuevo lleva la marca (7 sitios + comentario)', stamps >= 8, String(stamps));
ok('3 ninguna operación nueva sin marca en los flujos de alta/añadir/reducir/editar', !/transactions\.push\(\{ type: 'buy', qty(?:: amount)?, price: (?:_effectivePrice|_buyPrice), ts: _buyTs \}\)/.test(app) && !/const tx = \{ type, qty, price, ts: Date\.now\(\), assetName: asset\.name \};/.test(app));
ok('3 las cantidades de UNIDADES pasan por la confirmación de ambigüedad', (app.match(/_aurixNumAmbiguityGate\(/g) || []).length >= 6);

console.log(`\n${pass} passed · ${fail} failed`);
console.log(fail ? 'RESULT: FAIL' : 'RESULT: PASS');
process.exit(fail ? 1 : 0);
