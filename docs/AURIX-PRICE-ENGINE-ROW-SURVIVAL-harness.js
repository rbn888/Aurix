'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-PRICE-ENGINE-ROW-SURVIVAL — MICRO-FIX
// ════════════════════════════════════════════════════════════════════════════
// Los dos bucles de consenso terminaban en `if (!isFinite(price)) continue`, que no
// descartaba el PRECIO sino el ACTIVO: si el snapshot omitía un símbolo, su fila
// desaparecía de Market con nombre, icono, identidad y navegación. Este harness
// ejecuta `_setCryptoData` y `_setStocksData` REALES, con todo el Price Engine del
// bundle dentro de un sandbox, y sólo la capa de eventos/telemetría sustituida.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { return ''; } };
const app = read('app.js');
const appCode = app.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
  .map(l => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x ? '  → ' + x : '')); } };
function fnSource(name) {
  const i = app.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0, st = false;
  for (let k = i; k < app.length; k++) {
    if (app[k] === '{') { d++; st = true; }
    else if (app[k] === '}') { d--; if (st && !d) return app.slice(i, k + 1); }
  }
  return '';
}
function declSource(name) {
  const m = new RegExp('(?:const|let)\\s+' + name + '\\s*=\\s*').exec(app);
  if (!m) return '';
  const start = m.index;
  const i = m.index + m[0].length;
  const open = app[i];
  if (open === '{' || open === '[') {
    const closeCh = open === '[' ? ']' : '}';
    let d = 0;
    for (let k = i; k < app.length; k++) {
      if (app[k] === open) d++;
      else if (app[k] === closeCh) { d--; if (!d) { const end = app.indexOf(';', k); return app.slice(start, end + 1); } }
    }
  }
  const end = app.indexOf(';', i);
  return app.slice(start, end + 1);
}

console.log('AURIX-PRICE-ENGINE-ROW-SURVIVAL — MICRO-FIX\n');

const DECLS = ['MARKET_DATA', 'MARKET_DATA_VERSION', 'MARKET_CACHE', 'MARKET_CACHE_TS',
               'PRICE_CACHE', 'PRICE_CACHE_MAX_AGE', 'PROVIDER_WEIGHT'];
const FNS = ['normalizeSymbol', 'normalizeTimestamp', 'canonicalSymbol', 'normalizePriceItem',
             'isValidPrice', 'filterStale', 'enforceTimeConsistency', 'removeOutliers',
             'computeConfidence', 'hasEnoughProviders', 'weightedMedian', 'resolveConsensusPrice', 'getBestCandidate',
             'getCachedPrice', '_updatePriceCache', '_mktUsablePrice',
             '_isValidMarketItem', '_dedupeMarketData', 'commitMarketData',
             '_setCryptoData', '_setStocksData'];

function build() {
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    Math, JSON, Date, Map, Set, Array, Number, Object, String, Boolean, Promise, RegExp, Error,
    isFinite, isNaN, parseInt, parseFloat, setTimeout, clearTimeout,
    IS_DEV: false, AURIX_TELEMETRY: undefined,
    MARKET_EVENTS: { emit() {} },
    buildMarketEventSnapshot: () => ({}),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const decls = DECLS.map(n => declSource(n).replace(/^(?:const|let)\s+/, 'var ')).join('\n');
  const fns = FNS.map(fnSource).join('\n');
  vm.runInContext(decls + '\n' + fns, ctx);
  return ctx;
}
const rowsOf = (ctx, type) => ctx.MARKET_DATA.filter(d => String(d.type).toLowerCase() === type);

// Payload de proveedor en la forma que cada setter espera.
const cryptoRaw = (arr) => arr.map(a => ({ symbol: a.s, name: a.n, price: a.p, current_price: a.p,
  price_change_percentage_24h: a.c === undefined ? 1.5 : a.c, timestamp: Date.now(), source: 'coingecko' }));
const stockRaw  = (arr) => arr.map(a => ({ symbol: a.s, name: a.n, price: a.p,
  change24h: a.c === undefined ? 0.7 : a.c, timestamp: Date.now() }));

// ── 1. A/C · con precio vivo, igual que hoy ───────────────────────────────
console.log('1 — A/C · Con precio del proveedor: comportamiento intacto:');
{
  const ctx = build();
  ctx.__raw = cryptoRaw([{ s: 'BTC', n: 'Bitcoin', p: 61000 }, { s: 'ETH', n: 'Ethereum', p: 2400 }]);
  vm.runInContext('_setCryptoData(__raw)', ctx);
  const rows = rowsOf(ctx, 'crypto');
  ok('1.1 A · las dos criptos se publican con su precio real',
     rows.length === 2 && rows.every(r => r.price > 0), JSON.stringify(rows.map(r => r.symbol + '=' + r.price)));
  ok('1.2 A · y con procedencia "live"', rows.every(r => r.priceProvenance === 'live'));
  ctx.__raw2 = stockRaw([{ s: 'AAPL', n: 'Apple', p: 231.4 }, { s: 'MSFT', n: 'Microsoft', p: 402 }]);
  vm.runInContext('_setStocksData(__raw2)', ctx);
  const st = rowsOf(ctx, 'stock');
  ok('1.3 C · las dos acciones se publican con su precio real',
     st.length === 2 && st.every(r => r.price > 0), JSON.stringify(st.map(r => r.symbol + '=' + r.price)));
  ok('1.4 C · y con procedencia "live"', st.every(r => r.priceProvenance === 'live'));
}

// ── 2. B/D/F · fallo PARCIAL: la fila sobrevive ───────────────────────────
console.log('\n2 — B/D/F · Fallo parcial del proveedor: la fila no desaparece:');
{
  const ctx = build();
  ctx.__raw = cryptoRaw([
    { s: 'BTC',  n: 'Bitcoin',  p: 61000 },
    { s: 'ETH',  n: 'Ethereum', p: null },      // el proveedor no da precio
    { s: 'SOL',  n: 'Solana',   p: NaN },       // número imposible
    { s: 'ADA',  n: 'Cardano',  p: 0 },         // cero: no es un precio
    { s: 'DOGE', n: 'Dogecoin', p: 5e10 },      // fuera de rango
  ]);
  vm.runInContext('_setCryptoData(__raw)', ctx);
  const rows = rowsOf(ctx, 'crypto');
  ok('2.1 F · se publican las 5 filas, no sólo la que tiene precio (antes: 1)',
     rows.length === 5, rows.length + ' → ' + rows.map(r => r.symbol).join(','));
  const by = Object.fromEntries(rows.map(r => [r.symbol, r]));
  ok('2.2 B · la que sí tiene precio lo conserva', by.BTC.price === 61000 && by.BTC.priceProvenance === 'live');
  ok('2.3 B · las demás quedan con price null (nunca 0, nunca el número imposible)',
     ['ETH', 'SOL', 'ADA', 'DOGE'].every(s => by[s].price === null && by[s].current_price === null),
     ['ETH', 'SOL', 'ADA', 'DOGE'].map(s => s + '=' + by[s].price).join(','));
  ok('2.4 y su procedencia se declara desconocida',
     ['ETH', 'SOL', 'ADA', 'DOGE'].every(s => by[s].priceProvenance === 'none'));
  ok('2.5 G · identidad intacta en las filas sin precio (símbolo, nombre, tipo)',
     by.ETH.name === 'Ethereum' && by.ETH.symbol === 'ETH' && by.ETH.type === 'crypto'
     && !!by.ETH.canonicalSymbol);
  ok('2.6 el número imposible NO se guarda en la caché de precios',
     !ctx.PRICE_CACHE['SOL'] && !ctx.PRICE_CACHE['DOGE'] && !!ctx.PRICE_CACHE['BTC'],
     Object.keys(ctx.PRICE_CACHE).join(','));
}
{
  const ctx = build();
  ctx.__raw = stockRaw([
    { s: 'AAPL', n: 'Apple',    p: 231.4 },
    { s: 'BRK.B', n: 'Berkshire', p: null },
    { s: 'LLY',  n: 'Eli Lilly', p: undefined },
  ]);
  vm.runInContext('_setStocksData(__raw)', ctx);
  const rows = rowsOf(ctx, 'stock');
  ok('2.7 D/F · las 3 acciones sobreviven (antes: 1)', rows.length === 3, rows.map(r => r.symbol).join(','));
  const by = Object.fromEntries(rows.map(r => [r.symbol, r]));
  ok('2.8 D · sin precio ⇒ null y procedencia "none"',
     by.BRK.price === null && by.BRK.priceProvenance === 'none'
     && by.LLY.price === null, JSON.stringify(Object.keys(by)));
  ok('2.9 la acción resuelta mantiene su precio', by.AAPL.price === 231.4);
}

// ── 3. Ausencia total: el universo no se vacía ────────────────────────────
console.log('\n3 — Ausencia TOTAL de precios: el universo sigue en pie:');
{
  const ctx = build();
  ctx.__raw = cryptoRaw([{ s: 'BTC', n: 'Bitcoin', p: null }, { s: 'ETH', n: 'Ethereum', p: null }]);
  vm.runInContext('_setCryptoData(__raw)', ctx);
  ok('3.1 dos filas sin precio siguen siendo dos filas', rowsOf(ctx, 'crypto').length === 2);
  ok('3.2 y ninguna finge un 0 %',
     rowsOf(ctx, 'crypto').every(r => r.change24h === 1.5),   // la variación SÍ venía en el payload
     JSON.stringify(rowsOf(ctx, 'crypto').map(r => r.change24h)));
}
{
  const ctx = build();
  ctx.__raw = cryptoRaw([{ s: 'BTC', n: 'Bitcoin', p: null, c: null }]);
  vm.runInContext('_setCryptoData(__raw)', ctx);
  const r = rowsOf(ctx, 'crypto')[0];
  ok('3.3 sin variación del proveedor tampoco se inventa un 0 (antes: `change24h ?? 0`)',
     r.change24h === null && r.change === null && r.price_change_percentage_24h === null,
     JSON.stringify({ c: r.change24h, ch: r.change }));
}

// ── 4. E · recuperación sin duplicar ni cambiar identidad ────────────────
console.log('\n4 — E · Recuperación del proveedor:');
{
  const ctx = build();
  ctx.__down = cryptoRaw([{ s: 'BTC', n: 'Bitcoin', p: null }, { s: 'ETH', n: 'Ethereum', p: null }]);
  vm.runInContext('_setCryptoData(__down)', ctx);
  const before = rowsOf(ctx, 'crypto');
  ctx.__up = cryptoRaw([{ s: 'BTC', n: 'Bitcoin', p: 61000 }, { s: 'ETH', n: 'Ethereum', p: 2400 }]);
  vm.runInContext('_setCryptoData(__up)', ctx);
  const after = rowsOf(ctx, 'crypto');
  ok('4.1 E · mismo número de filas antes y después (sin duplicados)',
     before.length === 2 && after.length === 2, before.length + ' → ' + after.length);
  ok('4.2 E · misma identidad y el precio pasa de null a real',
     before.every(r => r.price === null) && after.every(r => r.price > 0)
     && JSON.stringify(before.map(r => r.symbol)) === JSON.stringify(after.map(r => r.symbol)));
  ok('4.3 E · la procedencia pasa de "none" a "live"',
     before.every(r => r.priceProvenance === 'none') && after.every(r => r.priceProvenance === 'live'));
}
{
  // El último precio REAL descargado sigue siendo pintable y se declara cacheado.
  const ctx = build();
  vm.runInContext(`_updatePriceCache({ symbol: 'ETH', price: 2390, timestamp: Date.now(), source: 'coingecko', confidence: 1 })`, ctx);
  ctx.__raw = cryptoRaw([{ s: 'ETH', n: 'Ethereum', p: null }]);
  vm.runInContext('_setCryptoData(__raw)', ctx);
  const r = rowsOf(ctx, 'crypto')[0];
  ok('4.4 con precio real cacheado se pinta ese, declarado como "cached"',
     r.price === 2390 && r.priceProvenance === 'cached', JSON.stringify({ p: r.price, pr: r.priceProvenance }));
}

// ── 5. El patrón que borraba el activo ya no existe ─────────────────────
console.log('\n5 — El patrón destructivo ha desaparecido de los dos owners:');
const cryptoSrc = fnSource('_setCryptoData'), stockSrc = fnSource('_setStocksData');
ok('5.1 ningún `continue` por precio en el bucle de cripto',
   !/if \(!isFinite\(price\)[^)]*\) continue;/.test(cryptoSrc));
ok('5.2 ni en el de acciones', !/if \(!isFinite\(price\)[^)]*\) continue;/.test(stockSrc));
ok('5.3 el patrón no queda en ningún sitio del bundle',
   !/if \(!isFinite\(price\) \|\| price > 1e9\) continue;/.test(appCode));
ok('5.4 ambos usan el MISMO saneador de precio (una sola regla)',
   /_mktUsablePrice\(/.test(cryptoSrc) && /_mktUsablePrice\(/.test(stockSrc)
   && (appCode.match(/^function _mktUsablePrice\(/gm) || []).length === 1);
ok('5.5 el refresco de acciones ya no filtra la entrada sin precio',
   !/\.filter\(p => Number\.isFinite\(p\.price\)\)/.test(fnSource('_refreshStocks'))
   && /price: Number\.isFinite\(p\.price\) \? p\.price : null/.test(fnSource('_refreshStocks')));
ok('5.6 pero conserva la señal de backoff cuando NADA trae precio',
   /if \(!data\.some\(d => d\.price != null\)\)/.test(fnSource('_refreshStocks'))
   && /MARKET_FAILURE_TS\['stocks'\] = Date\.now\(\)/.test(fnSource('_refreshStocks')));
ok('5.7 se reutiliza el contrato de procedencia de v665, sin semántica nueva',
   (appCode.match(/priceProvenance/g) || []).length >= 6
   && !/priceState|priceOrigin|priceSource:/.test(appCode));

// ── 6. G/H · identidad, navegación y presupuesto de red ─────────────────
console.log('\n6 — G/H · Sin regresión fuera del precio:');
const rowSrc = fnSource('renderMarketItem');
ok('6.1 la fila sigue pintando la ausencia con el formateador existente',
   /<div class="col col-price">\$\{safePrice\(price\)\}<\/div>/.test(rowSrc)
   && /if \(typeof val !== 'number' \|\| isNaN\(val\)\) return '—';/.test(app));
ok('6.2 icono, watchlist y navegación intactos en la fila',
   /_assetIconHtml\(item, item\.symbol/.test(rowSrc) && /role="button" tabindex="0"/.test(rowSrc)
   && /data-symbol="\$\{normSym\}"/.test(rowSrc));
ok('6.3 el renderizador de fila no se ha tocado en este micro-fix', !/priceProvenance/.test(rowSrc));
ok('6.4 H · ni una petición nueva: una llamada batched por pestaña',
   (fnSource('_refreshStocks').match(/await fetch\(/g) || []).length === 1
   && (fnSource('_refreshGeneric').match(/await fetch\(/g) || []).length === 1
   && (fnSource('_refreshCrypto').match(/await fetch\(/g) || []).length === 1);
ok('6.5 v665 sigue en pie (la ausencia declarada es válida)',
   /if \(price == null\) return true;/.test(app));
ok('6.6 B1/B4/B5 intactos',
   /function _aurixMktDataState\(/.test(app) && /'CNDX\.L'/.test(app)
   && /_aurixMktSortCoveragePending/.test(app));
// El registro pendiente de v666 quedó cerrado en el cierre de MARKET EXCELLENCE V1:
// CRYPTO_FALLBACK ya no lleva precio inventado. El invariante que este harness debe
// seguir defendiendo no es "no se ha tocado", sino que la semilla SIGUE EXISTIENDO
// (la fila de cripto nace por identidad) y que ASSET_DB no ha cambiado de camino.
// Quien prueba el contenido de la semilla es AURIX-MARKET-ROW-PRICE-TRUTH §7.
ok('6.7 la semilla de cripto y la de acciones siguen en su sitio',
   /const CRYPTO_FALLBACK = \[/.test(app) && /ASSET_DB\.filter\(a => a\.type === 'stock'\)/.test(app));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
