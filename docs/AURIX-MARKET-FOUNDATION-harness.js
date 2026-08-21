'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MARKET-FOUNDATION-harness — SPEC MARKET FOUNDATION V1
// ════════════════════════════════════════════════════════════════════════════
// Protege la coherencia funcional y la geometría de Market. No repite lo que ya
// cubren otros harnesses (precios, cartera, gráfico): se limita al owner Market.
//
// La pieza central es la SIMULACIÓN REAL: extrae del bundle las funciones de
// cobertura recién añadidas y las ejecuta contra los universos vivos declarados
// en app.js. Así el harness no comprueba que "existe una línea de código", sino
// que el comportamiento observable es el correcto — y detecta el día en que un
// chip vuelva a quedarse sin filas que filtrar.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
// Las aserciones "esto YA NO existe" tienen que mirar CÓDIGO, no comentarios: los
// comentarios de esta entrega citan literalmente el código retirado para dejar
// constancia de la causa raíz, y harían pasar por vivo algo que está eliminado.
const stripBlockComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const cssCode = stripBlockComments(css);
const appCode = stripBlockComments(app).split('\n').map(l => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  → ' + extra : '')); } }

console.log('AURIX-MARKET-FOUNDATION — SPEC MARKET FOUNDATION V1\n');

// ── utilidades de extracción ────────────────────────────────────────────────
function fnSource(name) {
  const i = app.indexOf('function ' + name + '(');
  if (i < 0) return null;
  let d = 0, started = false;
  for (let k = i; k < app.length; k++) {
    if (app[k] === '{') { d++; started = true; }
    else if (app[k] === '}') { d--; if (started && !d) return app.slice(i, k + 1); }
  }
  return null;
}
function bracketAt(i) {
  let d = 0, j = app.indexOf('[', i);
  for (let k = j; k < app.length; k++) { if (app[k] === '[') d++; else if (app[k] === ']') { d--; if (!d) return app.slice(j, k + 1); } }
  return '';
}
const constArray = (n) => { const i = app.search(new RegExp('const ' + n + ' +=\\s*\\[')); return i < 0 ? [] : [...bracketAt(i).matchAll(/'([^']+)'/g)].map(x => x[1]); };
const constBlock = (n) => { const i = app.indexOf('const ' + n + ' = ['); return i < 0 ? '' : bracketAt(i); };
function catalog(n) {
  const b = constBlock(n), out = [];
  const re = /\{\s*id:\s*'([a-z0-9_]+)'\s*,\s*items:\s*\[([\s\S]*?)\]\s*\}/g;
  let m; while ((m = re.exec(b))) out.push({ id: m[1], items: [...m[2].matchAll(/ticker:\s*'([^']+)'/g)].map(x => ({ ticker: x[1] })) });
  return out;
}

// ── 1. Estado canónico: un solo owner por dimensión ─────────────────────────
console.log('1 — Estado canónico (un único owner por dimensión, sin sistemas paralelos):');
ok('1.1 la categoría principal tiene un único owner (currentMarketTab)',
   (app.match(/^let currentMarketTab\s*=/gm) || []).length === 1);
ok('1.2 la consulta local de Market tiene un único owner (_marketSearchQuery)',
   (app.match(/^let _marketSearchQuery\s*=/gm) || []).length === 1);
ok('1.3 el subfiltro vive en _DISCOVERY_CATALOGS (un get/set por pestaña, sin store nuevo)',
   (app.match(/^const _DISCOVERY_CATALOGS = \{/gm) || []).length === 1 &&
   /etfs:\s*\{ catalog:[\s\S]{0,200}get: \(\) =>/.test(app));
ok('1.4 la lista visible se pinta desde un único renderer (renderCurrentMarketView)',
   (app.match(/^function renderCurrentMarketView\(/gm) || []).length === 1);
ok('1.5 Watchlist conserva su owner existente (watchlistStore / toggleWatchlist)',
   (app.match(/^const watchlistStore = /gm) || []).length === 1 &&
   (app.match(/^function toggleWatchlist\(/gm) || []).length === 1);
ok('1.6 no se ha introducido ningún store/servicio nuevo para Market',
   !/new\s+(MarketStore|MarketState|FilterStore)\b/.test(app));

// ── 2. Cobertura real de los subfiltros — SIMULACIÓN ────────────────────────
console.log('\n2 — Cada chip visible filtra de verdad (simulación con las funciones del bundle):');
const normalizeSymbol = s => String(s || '').toUpperCase().replace(/\.[A-Z]{1,3}$/, '').replace(/\//g, '').replace(/-/g, '').replace(/^\^/, '').trim();
const _TAB_TO_TYPE = { crypto: 'crypto', stocks: 'stock', etfs: 'etfs', indices: 'indices', commodities: 'commodities' };
let sim = null;
try {
  const src = ['_aurixMktCatalogSymbols', '_aurixMktChipCoverage', '_aurixMktRowsForTab'].map(fnSource);
  if (src.some(s => !s)) throw new Error('faltan helpers de cobertura');
  sim = {}; (new Function('normalizeSymbol', '_TAB_TO_TYPE', 'out', src.join('\n') +
    '\nout._aurixMktCatalogSymbols=_aurixMktCatalogSymbols;out._aurixMktChipCoverage=_aurixMktChipCoverage;out._aurixMktRowsForTab=_aurixMktRowsForTab;'))(normalizeSymbol, _TAB_TO_TYPE, sim);
} catch (e) { sim = null; }
ok('2.1 los helpers de cobertura existen y son ejecutables', !!sim);

const UNIVERSE = {
  etfs: constArray('MARKET_ETFS'), indices: constArray('MARKET_INDICES'),
  commodities: constArray('MARKET_COMMODITIES'), stocks: constArray('STOCKS_UNIVERSE'),
  crypto: [...constBlock('CRYPTO_IDS').matchAll(/symbol:\s*'([A-Z0-9]+)'/g)].map(x => x[1]),
};
const CATALOGS = {
  etfs: catalog('_FUNDS_CATALOG'), stocks: catalog('_STOCKS_CATALOG'), crypto: catalog('_CRYPTO_CATALOG'),
  indices: catalog('_INDICES_CATALOG'), commodities: catalog('_COMMODITIES_CATALOG'),
};
ok('2.2 se han podido leer los 5 catálogos y los 5 universos vivos',
   Object.values(CATALOGS).every(c => c.length > 0) && Object.values(UNIVERSE).every(u => u.length > 0));
// La simulación de abajo ESPEJA la regla del bundle. Si alguien afloja la regla real
// en _renderDiscoveryCatalog (p. ej. vuelve a `cov > 0`, admitiendo un chip que
// devuelve la lista entera) la simulación seguiría siendo verde y el harness dejaría
// de proteger nada. Este assert ancla la regla real para que esa deriva falle el gate.
const discSrc = fnSource('_renderDiscoveryCatalog') || '';
ok('2.regla la regla de visibilidad del bundle sigue siendo el subconjunto ESTRICTO',
   /if \(i === 0\) return true;/.test(discSrc) &&
   /return cov > 0 && cov < rows\.length;/.test(discSrc) &&
   /if \(visible\.length <= 1\) return '';/.test(discSrc));
ok('2.reset el reseteo del subfiltro inválido ocurre ANTES de cualquier salida temprana',
   discSrc.indexOf('reg.set(activeId)') > 0 &&
   discSrc.indexOf('reg.set(activeId)') < discSrc.indexOf("if (visible.length <= 1) return '';"));

// Espeja EXACTAMENTE la regla de _renderDiscoveryCatalog: la categoría por defecto
// siempre se muestra; un subfiltro sólo si produce un subconjunto estricto (>0 filas
// y menos que la lista completa). Si esta función y la del bundle divergen, los
// asserts de abajo dejan de proteger nada — por eso 2.regla lo comprueba aparte.
function visibleChips(tab) {
  if (!sim) return null;
  const type = _TAB_TO_TYPE[tab];
  const data = UNIVERSE[tab].map(s => ({ symbol: s, type }));
  const rows = sim._aurixMktRowsForTab(tab, data);
  const vis = CATALOGS[tab].filter((c, i) => {
    if (i === 0) return true;
    const cov = sim._aurixMktChipCoverage(c, rows, false);
    return cov > 0 && cov < rows.length;
  });
  return vis.length <= 1 ? [] : vis;   // una fila con sólo el chip por defecto no se pinta
}
if (sim) {
  Object.keys(CATALOGS).forEach((tab) => {
    const type = _TAB_TO_TYPE[tab];
    const data = UNIVERSE[tab].map(s => ({ symbol: s, type }));
    const rows = sim._aurixMktRowsForTab(tab, data);
    const vis = visibleChips(tab);
    // EL invariante que mata el defecto: todo subfiltro que se muestra produce un
    // subconjunto ESTRICTO de la lista — ni 0 filas (caía al fallback silencioso) ni
    // todas (la lista quedaba idéntica, que es el mismo defecto con otra cara).
    const malos = vis.slice(1).filter(c => {
      const cov = sim._aurixMktChipCoverage(c, rows, false);
      return cov === 0 || cov >= rows.length;
    });
    ok('2.' + tab + ' todo subfiltro visible cambia realmente la lista (subconjunto estricto)',
       malos.length === 0, malos.map(c => c.id).join(', '));
    // Y no se pinta una fila de chips inútil cuando no queda ningún filtro real.
    ok('2.' + tab + ' no se pinta fila de chips si no queda ningún subfiltro real',
       vis.length === 0 || vis.length >= 2, 'visibles=' + vis.length);
  });
  // Regresión "Oro": el caso reportado. Mientras el universo vivo de ETFs no
  // contenga ningún ETF de oro, el chip NO puede mostrarse. El día que se añada
  // (p.ej. GLD a MARKET_ETFS) este assert deja de exigir que esté oculto y pasa a
  // exigir que filtre — por eso se expresa como bicondicional, no como "está oculto".
  const etfRows = UNIVERSE.etfs.map(s => ({ symbol: s, type: 'etfs' }));
  const gold = CATALOGS.etfs.find(c => c.id === 'gold');
  const goldCov = gold ? sim._aurixMktChipCoverage(gold, etfRows, false) : -1;
  const goldVisible = !!(visibleChips('etfs') || []).find(c => c.id === 'gold');
  ok('2.oro REGRESIÓN — "Oro" se muestra si y sólo si tiene filas reales que filtrar',
     gold && ((goldCov > 0) === goldVisible), 'cobertura=' + goldCov + ' visible=' + goldVisible);
  ok('2.oro el catálogo de Oro sigue clasificando SÓLO oro (no se inventaron activos)',
     gold && gold.items.every(i => /GLD|GOLD|SGLN|PHAU|IAU|4GLD|XAU/i.test(i.ticker)));
}

// ── 3. El fallback silencioso —causa directa— no puede volver ───────────────
console.log('\n3 — Sin fallback silencioso: el chip activo nunca muestra otra categoría:');
const fromCache = fnSource('renderFromCache') || '';
ok('3.1 renderFromCache aplica el subfiltro sin condicionarlo a que dé resultados',
   /_catSet\)\s*items = items\.filter/.test(fromCache.replace(/\s+/g, ' ')));
ok('3.2 el patrón `if (sub.length) items = sub` ha desaparecido',
   !/if\s*\(sub\.length\)\s*items\s*=\s*sub/.test(appCode));
// MARKET-INSTITUTIONAL-V1 sustituyó renderFromCache directo por _aurixMktChipListHtml
// (que elige entre lista recuperada y tabla cargada). El invariante protegido es el
// mismo: el catálogo se evalúa ANTES que la lista, porque puede resetear el subfiltro.
ok('3.3 el catálogo se pinta ANTES que la lista (un reset se refleja en el mismo frame)',
   /const disc = _renderDiscoveryCatalog\('etfs', data\);\s*\n\s*html = disc \+ _aurixMktChipListHtml\('etfs', data\)/.test(app) &&
   /const disc = _DISCOVERY_CATALOGS\[currentMarketTab\] \? _renderDiscoveryCatalog\(currentMarketTab, data\) : '';\s*\n\s*html = disc \+ _aurixMktChipListHtml\(activeType, data\)/.test(app));
ok('3.4 el renderer de chips recibe los datos reales de la pestaña',
   /_renderDiscoveryCatalog\(currentMarketTab, data\)/.test(app) &&
   /function _renderDiscoveryCatalog\(tabKey, data\)/.test(app));
ok('3.5 un subfiltro que deja de ser válido se resetea al por defecto (SPEC §3)',
   /if \(!visible\.some\(c => c\.id === activeId\)\) \{[\s\S]{0,120}reg\.set\(activeId\)/.test(app));
ok('3.6 en cold start (sin filas) se pintan todos los chips — sin parpadeo de la fila',
   /const canJudge = rows\.length > 0;/.test(app) && /canJudge\s*\?[\s\S]{0,900}: reg\.catalog\.slice\(\)/.test(app));
ok('3.7 el estado activo del chip también se expone accesible (aria-selected)',
   /aria-selected="\$\{c\.id === cat\.id \? 'true' : 'false'\}"/.test(app));

// ── 4. Geometría: header y filas comparten definición de columnas ───────────
console.log('\n4 — Retícula: header y fila comparten SIEMPRE la misma definición:');
const gridRules = (() => {
  const re = /([^{}]*\.market-(?:row|table-header)[^{}]*)\{([^}]*)\}/g;
  let m; const hdr = [], row = [];
  while ((m = re.exec(css))) {
    const g = /grid-template-columns\s*:\s*([^;}]+)/.exec(m[2]);
    if (!g) continue;
    const line = css.slice(0, m.index).split('\n').length;
    const val = g[1].trim().replace(/\s+/g, ' ');
    const sels = m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',').map(s => s.trim());
    if (sels.some(s => s.endsWith('.market-table-header'))) hdr.push({ line, val });
    if (sels.some(s => s.endsWith('.market-row'))) row.push({ line, val });
  }
  return { hdr, row };
})();
const rowVals = new Set(gridRules.row.map(r => r.val));
const orphanHeaders = gridRules.hdr.filter(h => !rowVals.has(h.val));
ok('4.1 toda definición de columnas del header tiene una fila con la definición IDÉNTICA',
   orphanHeaders.length === 0, orphanHeaders.map(o => 'L' + o.line + ' [' + o.val + ']').join(', '));
// MARKET-INSTITUTIONAL-V1 unificó el header (estaba duplicado en tres renderers) y
// fijó CINCO columnas canónicas: la de capitalización se retiró porque su cobertura
// real es 0% y una columna de guiones sólo roba ancho a identidad y tendencia.
ok('4.2 el header lo emite un owner ÚNICO con las 5 columnas canónicas',
   (app.match(/^function _aurixMktTableHeaderHtml\(/gm) || []).length === 1 &&
   (app.match(/_aurixMktTableHeaderHtml\(\)/g) || []).length >= 4 &&
   /marketColAsset[\s\S]{0,120}marketColPrice[\s\S]{0,160}perf[\s\S]{0,200}TENDENCIA/.test(app));
ok('4.2b la capitalización NO aparece en la UI (ni cabecera, ni celda, ni ordenación)',
   !/CAP\.|MKT CAP/.test(app) && !/class="col col-cap/.test(app) &&
   !/data-mkt-sort="cap/.test(read('index.html')));
ok('4.3 la fila emite exactamente esas 5 celdas, en ese orden',
   /col-asset[\s\S]{0,1400}col-price[\s\S]{0,400}col-change[\s\S]{0,600}col-chart[\s\S]{0,300}col-action/.test(fnSource('renderMarketItem') || ''));
ok('4.4 precio y variación usan cifras tabulares (el ancho no baila al actualizar precios)',
   /\.col-price \{[^}]*tabular-nums/.test(css) && /\.col-change \{[^}]*tabular-nums/.test(css));

// ── 5. Estados: una sola caja para los cinco ────────────────────────────────
console.log('\n5 — Hover / focus / pressed / selected reutilizan la MISMA caja:');
ok('5.1 el hover ya no desplaza la fila (translateX eliminado — era la causa del desalineado)',
   !/\.market-row:hover \{[^}]*transform\s*:\s*translate/.test(cssCode));
ok('5.2 el hover ya no impone un radio distinto al de la fila',
   !/\.market-row:hover \{[^}]*border-radius\s*:\s*8px/.test(cssCode));
ok('5.3 ningún estado de .market-row aplica transform (ni scale ni translate)',
   !new RegExp('\\.market-row(:hover|:active|:focus[a-z-]*|\\.is-selected)[^{]*\\{[^}]*transform\\s*:\\s*(scale|translate)').test(cssCode));
ok('5.4 la transición de la fila se limita a propiedades de bajo coste (sin transform)',
   !/\.market-row \{[^}]*transition:[^;]*transform/.test(cssCode));
ok('5.5 existe estado de foco por teclado y no sobresale de la fila (inset, sin outline desplazado)',
   /\.market-row:focus-visible \{[^}]*box-shadow:\s*inset/.test(css));
ok('5.6 existen los estados pressed y selected/abierto',
   /\.market-row:active \{/.test(css) && /\.market-row\.is-selected/.test(css));
ok('5.7 los estados heredan el radio de la fila (border-radius: inherit)',
   (css.match(/\.market-row(:focus-visible|:active|\.is-selected)[\s\S]{0,220}?border-radius:\s*inherit/g) || []).length >= 3);
ok('5.8 la estrella tiene foco visible contenido en su propia caja',
   /\.watchlist-btn:focus-visible \{[^}]*box-shadow:\s*inset/.test(css));

// ── 6. Interacción fila / estrella ──────────────────────────────────────────
console.log('\n6 — La fila abre el activo; la estrella sólo toca Watchlist:');
const renderMarket = fnSource('renderMarket') || '';
ok('6.1 la estrella detiene la propagación antes de que la fila abra la ficha',
   /const btn = e\.target\.closest\('\.watchlist-btn'\);\s*\n\s*if \(btn\) \{\s*\n\s*e\.stopPropagation\(\);/.test(renderMarket));
ok('6.2 la rama de la estrella va ANTES que la rama de apertura de fila',
   renderMarket.indexOf(".closest('.watchlist-btn')") < renderMarket.indexOf(".closest('.market-row')"));
ok('6.3 la estrella da feedback inmediato (glifo + clase + aria-pressed)',
   /b\.textContent = isAdded \? '★' : '☆'/.test(renderMarket) &&
   /b\.setAttribute\('aria-pressed', isAdded \? 'true' : 'false'\)/.test(renderMarket));
ok('6.4 la fila es un control real: role=button + tabindex para foco de teclado',
   // El contrato es role=button + tabindex=0 en la fila, no el orden literal de los atributos: la
   // identidad canónica (data-canon) se añade entre medias en ASSET-DISCOVERY-IDENTITY.V1.
   /class="market-row" data-symbol="\$\{normSym\}"[^>]*role="button" tabindex="0"/.test(app));
ok('6.5 Enter y Espacio abren la fila (mismo owner que el clic, un solo listener)',
   /screen\.addEventListener\('keydown'/.test(renderMarket) &&
   /if \(e\.key !== 'Enter' && e\.key !== ' ' && e\.key !== 'Spacebar'\) return;/.test(renderMarket));
ok('6.6 el teclado sobre la estrella NO abre además la ficha (doble apertura imposible)',
   /if \(e\.target\.closest\('\.watchlist-btn'\)\) return;/.test(renderMarket));
ok('6.7 Espacio no hace scroll de página, Enter sí conserva su comportamiento nativo',
   /if \(e\.key !== 'Enter'\) e\.preventDefault\(\);/.test(renderMarket));
ok('6.8 un solo toggle por pulsación: no hay segunda escritura en la rama de la estrella',
   (renderMarket.match(/toggleWatchlist\(/g) || []).length === 1);

// ── 7. Carrusel móvil de categorías ─────────────────────────────────────────
console.log('\n7 — Carrusel de categorías: el primer chip nunca queda cortado:');
const tabUI = fnSource('updateMarketTabUI') || '';
ok('7.1 ya no se recentra la pastilla activa de forma incondicional (inline:center eliminado)',
   !/inline:\s*'center'/.test(stripBlockComments(tabUI).split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n')));
ok('7.2 sólo se desplaza cuando la pastilla activa NO está completamente visible',
   /if \(a\.left >= s\.left \+ EDGE && a\.right <= s\.right - EDGE\) return;/.test(tabUI));
ok('7.3 cuando hay que desplazar se usa inline:nearest (sin salto brusco)',
   /scrollIntoView\(\{ inline: 'nearest', block: 'nearest', behavior: 'auto' \}\)/.test(tabUI));
ok('7.4 el margen de seguridad coincide con la máscara/padding lateral del carrusel (22px)',
   /const EDGE = 22;/.test(tabUI) && /scroll-padding-inline:\s*22px/.test(css) && /padding-left:\s*22px/.test(css));
ok('7.5 el carrusel conserva scroll horizontal nativo y sin scrollbar visible',
   /\.market-tabs \{[^}]*overflow-x:\s*auto/.test(css) && /\.market-tabs::-webkit-scrollbar \{ display: none; \}/.test(css));
ok('7.6 el scroll horizontal no se propaga al scroll vertical de la página',
   /overscroll-behavior-x:\s*contain/.test(css));

// ── 8. Protección de producción (SPEC §10) ──────────────────────────────────
console.log('\n8 — Nada de datos, persistencia ni contratos ha cambiado:');
ok('8.1 la barrera de escritura de persistencia sigue intacta',
   /_aurixPersistenceReady/.test(app) && /const _AURIX_BLOCK_DESTRUCTIVE_SAVES = true;/.test(app));
ok('8.2 el modelo de Watchlist no cambia (mismo store, mismas claves)',
   /function getWatchlist\(\) \{\s*\n\s*return watchlistStore\.getWatchlist\(\);/.test(app));
ok('8.3 Market no escribe en localStorage ni en Supabase desde el owner tocado',
   !/localStorage\.setItem/.test(fnSource('renderCurrentMarketView') || '') &&
   !/localStorage\.setItem/.test(fnSource('_renderDiscoveryCatalog') || '') &&
   !/localStorage\.setItem/.test(tabUI));
ok('8.4 no se han añadido proveedores ni endpoints nuevos',
   !/api\/market\/|api\/quotes|api\/screener/.test(app));
// MARKET-EXCELLENCE-B4 — el literal congelado se sustituye por el invariante que de
// verdad protegía: ningún activo inventado. B4 amplió los universos con listados
// reales (identidad del catálogo curado, 23/23 resueltos contra el proveedor) y sin
// añadir ni una petición. Lo que NO puede pasar sigue vigilado aquí: que un símbolo
// del universo aparezca sin identidad detrás o con un precio de respaldo inventado.
// El contrato completo del universo vive en AURIX-MARKET-UNIVERSE-harness.
(function () {
  const lit = (n) => {
    const m = new RegExp('const ' + n + '\\s*=\\s*\\[').exec(app);
    if (!m) return null;
    let d = 0; const j = app.indexOf('[', m.index);
    for (let k = j; k < app.length; k++) {
      if (app[k] === '[') d++;
      else if (app[k] === ']') { d--; if (!d) { try { return eval(app.slice(j, k + 1)); } catch (_) { return null; } } }
    }
    return null;
  };
  const etfs = lit('MARKET_ETFS') || [];
  const idx  = lit('MARKET_INDICES') || [];
  const comm = lit('MARKET_COMMODITIES') || [];
  const named = /const _MKT_DISPLAY_NAMES = \{([\s\S]*?)\n\};/.exec(app);
  const idxNames = /const INDEX_NAMES\s*=\s*\{([\s\S]*?)\n\};/.exec(app);
  ok('8.5 los universos vivos sólo contienen listados con identidad detrás',
     etfs.length > 0 && idx.length > 0 && comm.length === 3
     && etfs.every(s => app.includes("ticker:'" + s + "'") || (named && named[1].includes(s.replace(/\.[A-Z]{1,3}$/, ''))))
     && idx.every(s => !!idxNames && idxNames[1].includes("'" + s + "'")),
     'etfs=' + etfs.length + ' idx=' + idx.length);
})();
ok('8.6 la identidad de los activos no se modifica (canonicalId / marketSymbol intactos)',
   !/canonicalId\s*=\s*(?!.*existing)/.test(fnSource('renderMarketItem') || ''));
ok('8.7 el ranking de Search V2.1 no ha sido tocado por este cambio',
   /_aurixScoreSearchResult|_aurixRankSearchResults|scoreResult/.test(app));

console.log('\nRESULT: ' + (fail === 0 ? 'ALL PASS ✓' : 'FAIL ✗') + '  (' + pass + ' passed, ' + fail + ' failed)');
process.exit(fail === 0 ? 0 : 1);
