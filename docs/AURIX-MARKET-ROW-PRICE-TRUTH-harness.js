'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MARKET-ROW-PRICE-TRUTH — MICRO-SPEC
// ════════════════════════════════════════════════════════════════════════════
// Con el proveedor caído, Market encogía de 23 ETF a 8 y de 10 índices a 9 —las
// filas que casualmente tienen precio en un mapa estático escrito a mano en 2024—
// y pintaba ese número con el mismo aspecto que una cotización viva. Medido con la
// sonda `aurix-market-visual-audit` (BTC $97.000, ETH $3.400, variación "—").
// Este harness ejecuta los owners REALES: `_isValidMarketItem`, `_buildItem`,
// `normalizeMarketData`, `_buildFallbackItems` y el filtro de `commitMarketData`.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { return ''; } };
const app = read('app.js');

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
function litArr(name) {
  const m = new RegExp('const ' + name + '\\s*=\\s*\\[').exec(app);
  if (!m) return null;
  let d = 0; const j = app.indexOf('[', m.index);
  for (let k = j; k < app.length; k++) {
    if (app[k] === '[') d++;
    else if (app[k] === ']') { d--; if (!d) { try { return eval(app.slice(j, k + 1)); } catch (_) { return null; } } }
  }
  return null;
}
function litObj(name) {
  const m = new RegExp('const ' + name + '\\s*=\\s*\\{').exec(app);
  if (!m) return null;
  let d = 0; const j = app.indexOf('{', m.index);
  for (let k = j; k < app.length; k++) {
    if (app[k] === '{') d++;
    else if (app[k] === '}') { d--; if (!d) { try { return eval('(' + app.slice(j, k + 1) + ')'); } catch (_) { return null; } } }
  }
  return null;
}

console.log('AURIX-MARKET-ROW-PRICE-TRUTH — MICRO-SPEC\n');

// ── Owners reales, reconstruidos con sus dependencias del propio bundle ────
const normalizeSymbol   = new Function(fnSource('normalizeSymbol') + '\n;return normalizeSymbol;')();
const isValid           = new Function(fnSource('_isValidMarketItem') + '\n;return _isValidMarketItem;')();
const normalizeMarketData = new Function('normalizeSymbol',
  fnSource('normalizeMarketData') + '\n;return normalizeMarketData;')(normalizeSymbol);
const INDEX_NAMES     = litObj('INDEX_NAMES') || {};
const COMMODITY_NAMES = litObj('COMMODITY_NAMES') || {};
const FALLBACK_PRICES = litObj('FALLBACK_PRICES') || {};
const INDEX_FALLBACKS = litObj('INDEX_FALLBACKS') || {};
const ETFS = litArr('MARKET_ETFS') || [];
const IDX  = litArr('MARKET_INDICES') || [];
// `getFallbackData` real: sigue existiendo (otros consumidores lo usan) y se le
// inyecta el mapa real, para probar que _buildItem YA NO lo usa como precio de fila.
const getFallbackData = new Function('FALLBACK_PRICES', fnSource('getFallbackData') + '\n;return getFallbackData;')(FALLBACK_PRICES);
let cachedPrice = null;   // controlable por prueba
const buildItem = new Function('INDEX_NAMES', 'COMMODITY_NAMES', '_aurixEtfCatalogName', 'normalizeSymbol',
  '_updatePriceCache', 'getCachedPrice', 'getFallbackData', 'normalizeMarketData', 'AURIX_TELEMETRY',
  fnSource('_buildItem') + '\n;return _buildItem;')(
    INDEX_NAMES, COMMODITY_NAMES, () => '', normalizeSymbol,
    () => {}, () => cachedPrice, getFallbackData, normalizeMarketData, undefined);
// El filtro REAL de commitMarketData sobre una lista.
const commitFilter = items => items.filter(isValid);

// ── 1. A/B/C · el universo no se encoge por un fallo del proveedor ────────
console.log('1 — El universo sobrevive al fallo del proveedor:');
{
  // C · fallo TOTAL: ni un símbolo resuelto (es el caso medido con la sonda).
  const etfRows = ETFS.map(s => buildItem(s, null, FALLBACK_PRICES, 'etf'));
  const idxRows = IDX.map(s => buildItem(s, null, INDEX_FALLBACKS, 'index'));
  ok('1.1 C · con el proveedor caído sobreviven los ' + ETFS.length + ' ETF (antes 8)',
     commitFilter(etfRows).length === ETFS.length, commitFilter(etfRows).length + '/' + ETFS.length);
  ok('1.2 C · y los ' + IDX.length + ' índices (antes 9)',
     commitFilter(idxRows).length === IDX.length, commitFilter(idxRows).length + '/' + IDX.length);
  ok('1.3 D · ninguna fila superviviente presenta un precio estático',
     etfRows.concat(idxRows).every(r => r.price === null),
     etfRows.concat(idxRows).filter(r => r.price !== null).map(r => r.symbol + '=' + r.price).join(','));
  ok('1.4 y ninguna fabrica una variación',
     etfRows.concat(idxRows).every(r => r.change === null && r.change24h === null));
  ok('1.5 la procedencia queda declarada como desconocida',
     etfRows.every(r => r.priceProvenance === 'none'));
  ok('1.6 F · identidad intacta: símbolo y nombre reales en cada fila',
     idxRows.every(r => r.symbol && r.name && r.name !== '')
     && idxRows.find(r => r.symbol === 'GSPC').name === 'S&P 500',
     JSON.stringify(idxRows.slice(0, 2)));
}
{
  // B · fallo PARCIAL: el proveedor resuelve unos y no otros.
  const hit = { price: 704.04, change24h: 1.2 };
  const rows = ETFS.map((s, i) => buildItem(s, i % 3 === 0 ? hit : null, FALLBACK_PRICES, 'etf'));
  const kept = commitFilter(rows);
  ok('1.7 B · las filas sin precio siguen visibles junto a las que sí lo tienen',
     kept.length === ETFS.length && kept.some(r => r.price === 704.04) && kept.some(r => r.price === null),
     kept.length + '/' + ETFS.length);
  ok('1.8 B · la fila resuelta trae precio Y variación reales, marcada como viva',
     kept[0].price === 704.04 && kept[0].change24h === 1.2 && kept[0].priceProvenance === 'live');
}

// ── 2. A · con precios vivos, igual que hoy ───────────────────────────────
console.log('\n2 — A · Universo con precios vivos: sin cambio de comportamiento:');
{
  const rows = ETFS.map(s => buildItem(s, { price: 100.5, change24h: -0.4 }, FALLBACK_PRICES, 'etf'));
  ok('2.1 todas las filas se conservan y publican el precio del proveedor',
     commitFilter(rows).length === ETFS.length && rows.every(r => r.price === 100.5 && r.change24h === -0.4));
  ok('2.2 el guardián sigue rechazando basura numérica',
     !isValid({ symbol: 'X', price: 0 }) && !isValid({ symbol: 'X', price: -5 })
     && !isValid({ symbol: 'X', price: 1e10 }) && !isValid({ symbol: 'X', price: NaN })
     && !isValid({ symbol: 'X', price: Infinity }) && !isValid({ symbol: 'X', price: 'cien' }));
  ok('2.3 y sigue rechazando una fila sin identidad',
     !isValid({ price: 10 }) && !isValid(null) && !isValid({ symbol: '', price: 10 }));
  ok('2.4 pero acepta la ausencia DECLARADA de precio',
     isValid({ symbol: 'VWCE', price: null }) && isValid({ symbol: 'VWCE', current_price: null, price: null }));
  ok('2.5 `undefined` (dato que nunca llegó) también es ausencia, no basura',
     isValid({ symbol: 'VWCE' }));
}

// ── 3. E · recuperación del proveedor ────────────────────────────────────
console.log('\n3 — E · Recuperación: el precio real reaparece sin duplicar ni cambiar identidad:');
{
  const down = buildItem('CSPX.L', null, FALLBACK_PRICES, 'etf');
  const up   = buildItem('CSPX.L', { price: 532.5, change24h: 0.8 }, FALLBACK_PRICES, 'etf');
  ok('3.1 la misma fila pasa de ausencia a precio real', down.price === null && up.price === 532.5);
  ok('3.2 sin cambiar de identidad (misma clave de fila)',
     down.symbol === up.symbol && down.symbol === normalizeSymbol('CSPX.L'), down.symbol + ' / ' + up.symbol);
  ok('3.3 y la procedencia pasa de "none" a "live"',
     down.priceProvenance === 'none' && up.priceProvenance === 'live');
  // El dedupe por clave normalizada impide la duplicación (y prefiere el no-fallback).
  const dedupe = fnSource('_dedupeMarketData');
  ok('3.4 el dedupe sigue colapsando por clave normalizada y prefiriendo el dato vivo',
     /const key = normalizeSymbol\(item\.symbol\)/.test(dedupe)
     && /existing\.fallback && !item\.fallback/.test(dedupe));
}

// ── 4. Precio REAL pero antiguo: pintable y declarado ────────────────────
console.log('\n4 — El precio real ya descargado sigue siendo pintable (MARKET-FIRST-PAINT):');
{
  cachedPrice = { price: 498.2 };
  const row = buildItem('VOO', null, FALLBACK_PRICES, 'etf');
  cachedPrice = null;
  ok('4.1 un precio real cacheado SÍ se pinta (no se pierde el primer paint)', row.price === 498.2);
  ok('4.2 y se declara como cacheado, no como vivo', row.priceProvenance === 'cached' && row.fallback === true);
}

// ── 5. El mapa estático deja de ser precio de fila (pero no se borra) ────
console.log('\n5 — D · El número escrito a mano nunca más se presenta como cotización:');
ok('5.1 `_buildItem` ya no lee ningún mapa estático como precio',
   !/getFallbackData\(symbol\)/.test(fnSource('_buildItem'))
   && !/fallbackMap\?\.\[symbol\]/.test(fnSource('_buildItem')));
ok('5.2 la fila de arranque de acciones tampoco',
   !/getFallbackData\(sym\)/.test(fnSource('_buildFallbackItems')));
ok('5.3 `getFallbackData` NO se ha borrado: tiene otros consumidores fuera de alcance',
   /^function getFallbackData\(/m.test(app) && (app.match(/getFallbackData\(/g) || []).length >= 6);
ok('5.4 los mapas estáticos siguen existiendo (compatibilidad), sin crecer',
   Object.keys(FALLBACK_PRICES).length > 0 && Object.keys(INDEX_FALLBACKS).length > 0
   && FALLBACK_PRICES['VUAA.L'] === undefined && INDEX_FALLBACKS['^RUT'] === undefined);
{
  // Prueba dura: aunque el símbolo TENGA número en el mapa estático, no se pinta.
  const withStatic = Object.keys(FALLBACK_PRICES).filter(s => ETFS.includes(s));
  const rows = withStatic.map(s => buildItem(s, null, FALLBACK_PRICES, 'etf'));
  ok('5.5 los ' + withStatic.length + ' ETF que tienen número estático se muestran SIN precio',
     rows.length > 0 && rows.every(r => r.price === null),
     withStatic.join(',') + ' → ' + rows.map(r => r.price).join(','));
}
ok('5.6 la fila pinta ausencia con el formateador que ya existía',
   /function safePrice\(val\) \{\s*\n\s*if \(typeof val !== 'number' \|\| isNaN\(val\)\) return '—';/.test(app)
   && /<div class="col col-price">\$\{safePrice\(price\)\}<\/div>/.test(app));

// ── 6. F/G · sin regresión de identidad, navegación ni red ───────────────
console.log('\n6 — F/G · Identidad, navegación y presupuesto de red:');
const row = fnSource('renderMarketItem');
ok('6.1 la fila sigue navegable y con su identidad (role, data-symbol, icono)',
   /role="button" tabindex="0"/.test(row) && /data-symbol="\$\{normSym\}"/.test(row)
   && /_assetIconHtml\(item, item\.symbol/.test(row));
ok('6.2 la desambiguación de B3 sigue en pie', /_idNeedsChain/.test(row));
ok('6.3 el renderizador de la fila NO se ha tocado para este arreglo',
   !/priceProvenance/.test(row));
ok('6.4 G · ni una petición nueva: sigue una llamada batched por pestaña',
   (fnSource('_refreshGeneric').match(/await fetch\(/g) || []).length === 1
   && (fnSource('_refreshStocks').match(/await fetch\(/g) || []).length === 1);
ok('6.5 el universo de B4 sigue intacto', ETFS.length === 23 && IDX.length === 10);
ok('6.6 B1/B1.1/B5 intactos',
   /function _aurixMktDataState\(/.test(app) && /_aurixMktSortCoveragePending/.test(app)
   && /_cryptoLongHistory/.test(read('services/chart-adapters.js')));
ok('6.7 el orden por precio manda los ausentes al final (ya existía)',
   /const aM = !Number\.isFinite\(aV\), bM = !Number\.isFinite\(bV\);/.test(fnSource('_aurixMktExpSortItems')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
