'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MARKET-UNIVERSE — SPEC MARKET EXCELLENCE B4
// ════════════════════════════════════════════════════════════════════════════
// El universo VISIBLE de Market era 5 ETF y 3 índices, no por límite de
// arquitectura sino porque nunca se amplió: cada pestaña se hidrata con UNA
// petición batched a `/api/prices/snapshot`, así que el coste de red NO crece con
// la longitud de la lista. Este harness fija el universo ampliado, el presupuesto
// de peticiones y —sobre todo— que ampliar no haya introducido ni un dato falso:
// ni precio, ni variación, ni nombre, ni identidad.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { return ''; } };
const app = read('app.js');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x ? '  → ' + x : '')); } };
function fnSource(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0, st = false;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') { d++; st = true; }
    else if (src[k] === '}') { d--; if (st && !d) return src.slice(i, k + 1); }
  }
  return '';
}
function arrLiteral(name) {
  const m = new RegExp('const ' + name + '\\s*=\\s*\\[').exec(app);
  if (!m) return null;
  let d = 0; const j = app.indexOf('[', m.index);
  for (let k = j; k < app.length; k++) {
    if (app[k] === '[') d++;
    else if (app[k] === ']') { d--; if (!d) { try { return eval(app.slice(j, k + 1)); } catch (_) { return null; } } }
  }
  return null;
}
function objLiteral(name) {
  const m = new RegExp('const ' + name + '\\s*=\\s*\\{').exec(app);
  if (!m) return null;
  let d = 0; const j = app.indexOf('{', m.index);
  for (let k = j; k < app.length; k++) {
    if (app[k] === '{') d++;
    else if (app[k] === '}') { d--; if (!d) { try { return eval('(' + app.slice(j, k + 1) + ')'); } catch (_) { return null; } } }
  }
  return null;
}
// El normalizador REAL del bundle: la identidad de fila y la clave de caché salen de aquí.
const normalizeSymbol = new Function(fnSource(app, 'normalizeSymbol') + '\n;return normalizeSymbol;')();

const ETFS    = arrLiteral('MARKET_ETFS')        || [];
const IDX     = arrLiteral('MARKET_INDICES')     || [];
const STOCKS  = arrLiteral('STOCKS_UNIVERSE')    || [];
const COMMS   = arrLiteral('MARKET_COMMODITIES') || [];
const NAMES   = objLiteral('_MKT_DISPLAY_NAMES') || {};
const IDXNAME = objLiteral('INDEX_NAMES')        || {};
// Catálogo curado REAL del bundle (fuente de los nombres institucionales).
const ETF_DB = (() => {
  const i = app.indexOf('const _AURIX_ETF_DB = [');
  if (i < 0) return [];
  let d = 0; const j = app.indexOf('[', i);
  for (let k = j; k < app.length; k++) {
    if (app[k] === '[') d++;
    else if (app[k] === ']') { d--; if (!d) { try { return eval(app.slice(j, k + 1)); } catch (_) { return []; } } }
  }
  return [];
})();

console.log('AURIX-MARKET-UNIVERSE — SPEC MARKET EXCELLENCE B4\n');

// ── 1. Universo por clase ─────────────────────────────────────────────────
console.log('1 — Universo visible por clase:');
ok('1.1 ETF: al menos 20 listados reales (antes 5)', ETFS.length >= 20, 'n=' + ETFS.length);
ok('1.2 Índices: al menos 10 (antes 3)', IDX.length >= 10, 'n=' + IDX.length);
ok('1.3 Acciones: al menos 22 (antes 20)', STOCKS.length >= 22, 'n=' + STOCKS.length);
ok('1.4 Materias primas: sin cambios (fuera del bloque)', COMMS.length === 3, 'n=' + COMMS.length);

// ── 2. Casos focales del SPEC ─────────────────────────────────────────────
console.log('\n2 — Casos focales representados en el universo visible:');
const upper = a => a.map(s => String(s).toUpperCase());
const hasETF = t => upper(ETFS).includes(t);
const hasIdx = t => upper(IDX).includes(t);
const hasStk = t => upper(STOCKS).includes(t);
ok('2.1 S&P 500: SPY + VOO + IVV y su familia UCITS',
   ['SPY', 'VOO', 'IVV', 'VUAA.L', 'CSPX.L', 'SXR8.DE'].every(hasETF));
ok('2.2 Nasdaq 100: QQQ + QQQM + EQQQ/CNDX',
   ['QQQ', 'QQQM', 'EQQQ.L', 'CNDX.L'].every(hasETF));
ok('2.3 MSCI World / global: URTH, IWDA, SWDA, EUNL, VWCE, VWRL, ACWI, VTI',
   ['URTH', 'IWDA.AS', 'SWDA.L', 'EUNL.DE', 'VWCE.DE', 'VWRL.L', 'ACWI', 'VTI'].every(hasETF));
ok('2.4 Índices: S&P 500, Nasdaq, Dow, Russell 2000',
   ['^GSPC', '^IXIC', '^DJI', '^RUT'].every(hasIdx));
ok('2.5 Índices europeos y Japón: Euro Stoxx 50, DAX, FTSE 100, CAC 40, IBEX, Nikkei',
   ['^STOXX50E', '^GDAXI', '^FTSE', '^FCHI', '^IBEX', '^N225'].every(hasIdx));
ok('2.6 Equities focales completas (AAPL…AVGO + MA + LLY)',
   ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'BRK.B', 'JPM', 'V', 'MA', 'LLY', 'AVGO'].every(hasStk));

// ── 3. Identidad: una fila = un listado, nunca un ticker colapsado ────────
console.log('\n3 — Identidad del universo (nunca ticker = identidad):');
for (const [label, list] of [['ETF', ETFS], ['índices', IDX], ['acciones', STOCKS], ['materias', COMMS]]) {
  const norm = list.map(normalizeSymbol);
  const dup  = norm.filter((x, i) => norm.indexOf(x) !== i);
  ok('3.x ' + label + ': ningún listado colapsa con otro al normalizar', dup.length === 0, dup.join(','));
}
const allNorm = [].concat(ETFS, IDX, STOCKS, COMMS).map(normalizeSymbol);
ok('3.5 ninguna clave de fila se repite entre clases distintas',
   new Set(allNorm).size === allNorm.length,
   allNorm.filter((x, i) => allNorm.indexOf(x) !== i).join(','));
ok('3.6 el catálogo curado NO se ha extendido con identidad inventada',
   ETF_DB.length === 22, 'n=' + ETF_DB.length);
ok('3.7 y toda entrada del catálogo sigue con identidad completa (ISIN incluido)',
   ETF_DB.every(e => e.ticker && e.marketSymbol && e.name && e.manager && e.currency && e.isin));
ok('3.8 todo ETF del universo visible tiene identidad verificada o nombre propio ya existente',
   ETFS.every(s => ETF_DB.some(e => String(e.ticker).toUpperCase() === s.toUpperCase())
                   || NAMES[normalizeSymbol(s)]),
   ETFS.filter(s => !ETF_DB.some(e => String(e.ticker).toUpperCase() === s.toUpperCase()) && !NAMES[normalizeSymbol(s)]).join(','));

// ── 4. Nombres: etiqueta real o nada. Nunca un ticker desnudo como título ─
console.log('\n4 — Nombre de fila: identidad real, cero deducción:');
const etfName = new Function('_AURIX_ETF_DB', fnSource(app, '_aurixEtfCatalogName') + '\n;return _aurixEtfCatalogName;');
const nameOf = etfName(ETF_DB);
ok('4.0 el resolvedor de nombre de ETF es ejecutable y lee el catálogo',
   typeof nameOf === 'function' && nameOf('CSPX.L') === 'iShares Core S&P 500 UCITS ETF (Acc)', nameOf('CSPX.L'));
ok('4.1 nombre institucional para los listados UCITS del universo',
   ['VUAA.L', 'CSPX.L', 'SXR8.DE', 'IWDA.AS', 'SWDA.L', 'EUNL.DE', 'VWCE.DE', 'VWRL.L', 'EQQQ.L', 'CNDX.L']
     .every(s => nameOf(s).length > 8));
ok('4.2 un símbolo fuera del catálogo NO recibe nombre inventado', nameOf('ZZZZ.XX') === '');
ok('4.3 todo índice del universo tiene nombre humano',
   IDX.every(s => typeof IDXNAME[s] === 'string' && IDXNAME[s].length > 2),
   IDX.filter(s => !IDXNAME[s]).join(','));
ok('4.4 toda acción del universo tiene razón social (clave normalizada)',
   STOCKS.every(s => typeof NAMES[normalizeSymbol(s)] === 'string'),
   STOCKS.filter(s => !NAMES[normalizeSymbol(s)]).join(','));
ok('4.5 BRK.B se resuelve por su clave normalizada (BRK), no por el ticker crudo',
   NAMES['BRK'] === 'Berkshire Hathaway' && NAMES['BRK.B'] === undefined);
ok('4.6 los nombres son etiquetas de UI: ni precios ni cálculos',
   Object.values(NAMES).every(v => typeof v === 'string' && !/^[\d.,]+$/.test(v)));

// ── 5. Precio y variación: dato del proveedor o ausencia ──────────────────
console.log('\n5 — Precio y variación honestos (nada fabricado):');
const buildSrc = fnSource(app, '_buildItem');
// `normalizeMarketData` necesita `normalizeSymbol` en su ámbito: se inyecta el real.
const norm2 = new Function('normalizeSymbol', fnSource(app, 'normalizeMarketData') + '\n;return normalizeMarketData;')(normalizeSymbol);
const build2 = new Function('INDEX_NAMES', 'COMMODITY_NAMES', '_aurixEtfCatalogName', 'normalizeSymbol',
  '_updatePriceCache', 'getCachedPrice', 'getFallbackData', 'normalizeMarketData', 'AURIX_TELEMETRY',
  buildSrc + '\n;return _buildItem;')(
    IDXNAME, objLiteral('COMMODITY_NAMES') || {}, nameOf, normalizeSymbol,
    () => {}, () => null, () => null, norm2, undefined);
ok('5.0 `_buildItem` es ejecutable', typeof build2 === 'function');
if (typeof build2 === 'function') {
  const resolved   = build2('CSPX.L', { price: 532.5, change24h: 1.24 }, {}, 'etf');
  const noChange   = build2('CSPX.L', { price: 532.5, change24h: null }, {}, 'etf');
  const unresolved = build2('ZZZZ.XX', null, {}, 'etf');
  const fbMapped   = build2('SPY', null, { SPY: 548 }, 'etf');
  ok('5.1 con dato del proveedor: precio Y variación reales llegan a la fila',
     resolved.price === 532.5 && resolved.change24h === 1.24, JSON.stringify(resolved));
  ok('5.2 el nombre institucional viaja con la fila',
     resolved.name === 'iShares Core S&P 500 UCITS ETF (Acc)', resolved.name);
  ok('5.3 proveedor sin variación ⇒ null, nunca 0 (un 0 se leería como "plano")',
     noChange.change24h === null && noChange.price === 532.5, String(noChange.change24h));
  ok('5.4 símbolo no resuelto ⇒ precio null Y variación null (antes fabricaba 0)',
     unresolved.price === null && unresolved.change === null && unresolved.change24h === null,
     JSON.stringify(unresolved));
  ok('5.5 un símbolo no resuelto NO recibe nombre inventado (queda su ticker)',
     unresolved.name === 'ZZZZ.XX', unresolved.name);
  ok('5.6 el respaldo declarado sigue marcándose como tal (sin regresión)',
     fbMapped.price === 548 && fbMapped.fallback === true, JSON.stringify(fbMapped));
}

// ── 6. Presupuesto de peticiones: el universo crece, la red no ────────────
console.log('\n6 — Presupuesto de red (el punto crítico del SPEC):');
const generic = fnSource(app, '_refreshGeneric');
const stocks  = fnSource(app, '_refreshStocks');
ok('6.1 UNA sola petición batched por pestaña, sea cual sea el tamaño de la lista',
   (generic.match(/await fetch\(/g) || []).length === 1
   && /symbols=\$\{encodeURIComponent\(symbols\.join\(','\)\)\}/.test(generic));
ok('6.2 lo mismo en acciones: una petición para todo el universo',
   (stocks.match(/await fetch\(/g) || []).length === 1
   && /STOCKS_UNIVERSE\.join\(','\)/.test(stocks));
ok('6.3 ningún universo excede el tope de 200 símbolos del endpoint',
   [ETFS, IDX, STOCKS, COMMS].every(l => l.length <= 200)
   && Math.max(ETFS.length, IDX.length, STOCKS.length) <= 200);
ok('6.4 no se ha introducido fan-out por fila para el precio',
   !/for \(const s(ymbol)? of symbols\)[\s\S]{0,200}fetch\(/.test(generic));
ok('6.5 el TTL de caché de la pestaña no se ha tocado (sin más red por render)',
   /const MARKET_CACHE_TTL = 60 \* 1000;/.test(app));
ok('6.6 los iconos siguen siendo eager sólo en las primeras filas',
   /const _AURIX_MKT_EAGER_ICONS = 12;/.test(app)
   && /visibleData\.slice\(0, _AURIX_MKT_EAGER_ICONS\)/.test(fnSource(app, '_aurixPreloadMarketIcons')));
ok('6.7 el histórico del mini gráfico sigue en cola acotada (3 en vuelo)',
   /_marketHistoryQueue\s*=\s*\{ running: 0, max: 3/.test(app));
ok('6.8 el universo de cripto (100 filas) ya era el techo real: los nuevos quedan por debajo',
   Math.max(ETFS.length, IDX.length, STOCKS.length) < 100);

// ── 7. La clave de hidratación: canónica en los dos lados ────────────────
console.log('\n7 — Hidratación de listados internacionales:');
ok('7.1 el mapa del snapshot se indexa por símbolo CANÓNICO',
   /snapshotMap\.set\(normalizeSymbol\(item\.symbol\), item\)/.test(generic));
ok('7.2 y se consulta con la MISMA clave (antes: crudo vs canónico ⇒ miss sistemático)',
   /snapshotMap\.get\(normalizeSymbol\(symbol\)\)/.test(generic));
ok('7.3 la variación y la divisa del proveedor ya no se descartan',
   /change24h: Number\.isFinite\(hit\.change24h\) \? hit\.change24h : null/.test(generic)
   && /currency: hit\.currency \|\| null/.test(generic));
// Simulación de la hidratación real: el endpoint responde canónico, la lista pide crudo.
{
  const snapshotMap = new Map();
  [{ symbol: 'VUAA', price: 148.28 }, { symbol: 'CSPX', price: 532.5 }, { symbol: 'IWDA', price: 92.1 }]
    .forEach(s => snapshotMap.set(normalizeSymbol(s.symbol), s));
  const hits = ['VUAA.L', 'CSPX.L', 'IWDA.AS'].map(s => snapshotMap.get(normalizeSymbol(s)));
  ok('7.4 los tres listados con sufijo encuentran su precio real', hits.every(h => h && h.price > 0),
     JSON.stringify(hits));
}

// ── 8. Nada de lo prohibido se ha tocado ─────────────────────────────────
console.log('\n8 — Alcance:');
ok('8.1 la autoridad de orden de búsqueda sigue intacta',
   (app.match(/^function _aurixRankSearchResults\(/gm) || []).length === 1);
ok('8.2 el corte del result-set de búsqueda NO se ha cambiado (sigue tras el ranker)',
   /_aurixRankSearchResults\(_aurixSearchProject\(merged, filter\), query\)\.slice\(0, 10\)/.test(app));
ok('8.3 B1 (contrato de estado) y B1.1 (ALL de cripto) intactos',
   /function _aurixMktDataState\(/.test(app) && /_cryptoLongHistory/.test(read('services/chart-adapters.js')));
ok('8.4 B3 (desambiguación de la fila) intacto', /_idNeedsChain/.test(app));
// Ningún símbolo NUEVO trae precio de respaldo: se amplía universo, no se inventan
// cotizaciones offline. Los nombres SÍ se añaden (son etiquetas, no datos de mercado).
{
  const FB  = objLiteral('FALLBACK_PRICES') || {};
  const IFB = objLiteral('INDEX_FALLBACKS') || {};
  const NEW = ['IVV', 'VUAA.L', 'SXR8.DE', 'QQQM', 'CNDX.L', 'IWDA.AS', 'SWDA.L', 'EUNL.DE',
               'VWRL.L', 'ACWI', 'GLD', 'IAU', 'SGLN.L', 'PHAU.L', '4GLD.DE',
               '^RUT', 'MA', 'LLY'];
  const withPrice = NEW.filter(s => FB[s] != null || IFB[s] != null);
  ok('8.5 ningún símbolo nuevo del universo trae precio de respaldo inventado',
     withPrice.length === 0, withPrice.join(','));
  ok('8.5b los mapas de respaldo siguen teniendo un único owner cada uno',
     (app.match(/^const FALLBACK_PRICES\s*=\s*\{/gm) || []).length === 1
     && (app.match(/^const INDEX_FALLBACKS\s*=\s*\{/gm) || []).length === 1);
}
ok('8.6 sin CSS nuevo ni cambio de fila: la ampliación es de datos',
   !/market-row--wide|market-list--paged|virtualiz/i.test(read('styles.css')));
ok('8.7 el motor de búsqueda no se ha tocado',
   /_aurixSearchEtfsLocal\(query\)/.test(fnSource(app, 'searchAllAssets')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
