'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MARKET-FIRSTPAINT-harness — SPEC MARKET FIRST PAINT ATÓMICO (P0)
// ════════════════════════════════════════════════════════════════════════════
// La fila de Market debe comportarse como un SNAPSHOT: si aparece, aparece
// COMPLETA. Nunca precio → variación → gráfico en momentos distintos.
//
// El defecto que cierra este harness: `_mktHistoryCacheFresh` gobernaba a la vez
// el REFRESCO y el PINTADO. Con el TTL de 24H en 60 s, salir a Dashboard y volver
// caducaba todas las entradas y la lista tiraba un snapshot REAL para volver a
// esqueleto + red. Medido: al volver tras caducar el TTL, las 11 filas volvían a
// esqueleto y tardaban 648 ms teniendo el dato ya en memoria.
//
// La regla que se protege aquí es la separación de las dos decisiones:
//   FRESCO  → ¿hay que volver a pedirlo?   (TTL intacto ⇒ ni una llamada nueva)
//   USABLE  → ¿se puede pintar ya?          (la edad es irrelevante: el dato es real)
//
// No se comprueba "existe una línea": se EJECUTAN las funciones reales extraídas
// del bundle contra estados de caché construidos a mano.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
// Las aserciones "esto YA NO existe" tienen que mirar CÓDIGO, no comentarios: los
// comentarios de esta entrega citan literalmente el código retirado.
const appCode = app.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
  .map(l => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  → ' + extra : '')); } }

console.log('AURIX-MARKET-FIRSTPAINT — SPEC MARKET FIRST PAINT ATÓMICO\n');

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

// ── SANDBOX: funciones REALES del bundle + dependencias mínimas ─────────────
const NEEDED = ['_mktHistoryCacheKey', '_mktHistoryCacheFresh', '_mktHistoryCacheUsable',
  '_mktHistorySeriesStamp', '_mktHistoryChangeForRow', '_mktHistoryEntryForCell',
  'renderMarketItem', 'safePrice', 'safeChange', 'fmtMktPrice',
  // MARKET-CRYPTO-PREVIEW-P0 — el pintor del provisional entra al sandbox: la fila lo invoca
  // en su primer paint, así que sin él `renderMarketItem` ni siquiera es ejecutable.
  '_mktSparkPreviewSvg'];
const missing = NEEDED.filter(n => !fnSource(n));
ok('0.1 todas las funciones del owner son extraíbles del bundle', missing.length === 0, missing.join(','));

const sandbox = {
  console,
  _MKT_HISTORY_RANGE_MAP: { '24H': '24h', '7D': '7d', '1M': '30d', '1Y': '1y', 'ALL': 'all' },
  _MKT_HISTORY_TTL: { '24h': 60000, '7d': 300000, '30d': 1800000, '1y': 21600000, 'all': 86400000 },
  _marketHistoryCache: new Map(),
  _aurixMktTimeframe: '7D',
  normalizeSymbol: s => String(s || '').toUpperCase(),
  isInWatchlist: () => false,
  escHtml: s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])),
  _assetIconHtml: () => '<i class="asset-icon"></i>',
  _aurixMktExpFlag: () => true,
  _aurixMktShortType: x => x,
  _MKT_DISPLAY_NAMES: {},
  _AURIX_MKT_EAGER_ICONS: 4,
  baseCurrency: 'USD',
  toBase: v => v,
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
if (!missing.length) vm.runInContext(NEEDED.map(fnSource).join('\n'), sandbox);

const S = sandbox;
const mkSeries = (n, base) => Array.from({ length: n }, (_, i) => ({ value: base + i, t: i }));
const put = (sym, range, entry) => S._marketHistoryCache.set(`${sym}|${range}`, entry);
const NOW = Date.now();
const chartCls = html => { const m = /class="col col-chart ([^"]*)"/.exec(html); return m ? m[1].trim() : '(none-matched)'; };
const changeCell = html => { const m = /<div class="col col-change ([^"]*)"[\s\S]*?>([\s\S]*?)<\/div>/.exec(html); return m ? { cls: m[1], body: m[2].trim() } : null; };
const ITEM = { symbol: 'AAPL', name: 'Apple Inc', current_price: 190.5, price_change_percentage_24h: 1.25, type: 'stock' };

// ── 1. Las dos decisiones están separadas ───────────────────────────────────
console.log('1 — FRESCO (¿refetch?) y USABLE (¿pintable?) son decisiones distintas:');
if (!missing.length) {
  const stale = { ts: NOW - 3600000, series: mkSeries(10, 100), meta: null, changePct: 2.5 };
  const fresh = { ts: NOW - 1000, series: mkSeries(10, 100), meta: null, changePct: 2.5 };
  ok('1.1 una entrada caducada NO es fresca (sigue tocando refrescar)', S._mktHistoryCacheFresh(stale, '7d') === false);
  ok('1.2 una entrada caducada SÍ es pintable (el dato es real, sólo no es el último)', S._mktHistoryCacheUsable(stale) === true);
  ok('1.3 una entrada fresca es ambas cosas', S._mktHistoryCacheFresh(fresh, '7d') === true && S._mktHistoryCacheUsable(fresh) === true);
  ok('1.4 "aún no sabemos" no es pintable', S._mktHistoryCacheUsable(null) === false && S._mktHistoryCacheUsable(undefined) === false);
  // El TTL es lo único que gobierna la red: si cambia, el consumo cambia.
  ok('1.5 los TTL por rango NO se han tocado (cero llamadas nuevas)',
     /'24h':\s*60 \* 1000/.test(app) && /'7d':\s*5 \* 60 \* 1000/.test(app) &&
     /'30d':\s*30 \* 60 \* 1000/.test(app) && /'1y':\s*6\s*\* 3600 \* 1000/.test(app) && /'all':\s*24 \* 3600 \* 1000/.test(app));
}

// ── 2. Valor conocido: nunca valor → esqueleto → valor ──────────────────────
console.log('\n2 — La variación nunca retrocede a esqueleto teniendo un valor conocido:');
if (!missing.length) {
  S._marketHistoryCache.clear();
  S._aurixMktTimeframe = '7D';
  put('AAPL', '7d', { ts: NOW - 3600000, series: mkSeries(8, 50), meta: null, changePct: 3.14 });
  ok('2.1 _mktHistoryChangeForRow devuelve el último valor conocido pese al TTL',
     S._mktHistoryChangeForRow(ITEM) === 3.14, String(S._mktHistoryChangeForRow(ITEM)));
  const cell = changeCell(S.renderMarketItem(ITEM, 0));
  ok('2.2 la celda de variación NO nace en esqueleto con snapshot caducado',
     !!cell && !/is-loading/.test(cell.cls) && /3\.14%/.test(cell.body), cell && (cell.cls + ' | ' + cell.body));
  S._marketHistoryCache.clear();
  ok('2.3 sin ningún snapshot sí hay esqueleto (no se inventa un valor)',
     /is-loading/.test((changeCell(S.renderMarketItem(ITEM, 0)) || {}).cls || ''));
}

// ── 3. La celda del gráfico nace en su estado final ─────────────────────────
console.log('\n3 — El mini gráfico nace resuelto cuando el snapshot ya existe:');
if (!missing.length) {
  // MARKET-CRYPTO-PREVIEW-P0 — los dos estados VACÍOS de la celda (esqueleto y vacío declarado)
  // desaparecen del primer paint. Sin serie real utilizable, la fila nace con el provisional.
  S._marketHistoryCache.clear();
  ok('3.1 sin snapshot → provisional, NUNCA esqueleto',
     chartCls(S.renderMarketItem(ITEM, 0)) === 'col-chart--preview', chartCls(S.renderMarketItem(ITEM, 0)));
  put('AAPL', '7d', { ts: NOW - 3600000, series: mkSeries(12, 80), meta: null, changePct: 1.1 });
  ok('3.2 con snapshot caducado → NACE MONTABLE, sin esqueleto', chartCls(S.renderMarketItem(ITEM, 0)) === '', chartCls(S.renderMarketItem(ITEM, 0)));
  put('AAPL', '7d', { ts: NOW - 1000, series: mkSeries(12, 80), meta: null, changePct: 1.1 });
  ok('3.3 con snapshot fresco → igual, sin esqueleto', chartCls(S.renderMarketItem(ITEM, 0)) === '');
  // Ausencia YA resuelta (activo sin histórico): tampoco es un hueco — es el provisional.
  put('AAPL', '7d', { ts: NOW - 5000, series: [], meta: null, changePct: null });
  ok('3.4 ausencia de histórico ya resuelta → provisional, no vacío declarado',
     chartCls(S.renderMarketItem(ITEM, 0)) === 'col-chart--preview', chartCls(S.renderMarketItem(ITEM, 0)));
}

// ── 3B. El provisional: la celda nunca sale vacía y no simula mercado ───────
console.log('\n3B — El provisional de Market List (MARKET-CRYPTO-PREVIEW-P0):');
if (!missing.length) {
  const cellHtml = html => {
    const m = String(html).match(/<div class="col col-chart[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    return m ? m[1] : null;
  };
  S._marketHistoryCache.clear();
  const dry = S.renderMarketItem(ITEM, 0);
  ok('3B.1 sin histórico la celda NO va vacía: trae el provisional dentro',
     /<svg class="mkt-spark-preview"/.test(cellHtml(dry) || ''), cellHtml(dry));
  ok('3B.2 el provisional se declara no-dato (aria-hidden, no anunciable)',
     /aria-hidden="true"/.test(cellHtml(dry) || ''));
  // DETERMINISMO: es lo que impide que el provisional "tiemble" entre renders y lo que hace que
  // el parcheo in-place lo vea como "sin diferencia" y no toque el DOM.
  ok('3B.3 mismo símbolo ⇒ misma forma exacta en renders sucesivos',
     S._mktSparkPreviewSvg('SOL') === S._mktSparkPreviewSvg('SOL'));
  ok('3B.4 símbolos distintos ⇒ formas distintas (no es una plantilla plana)',
     S._mktSparkPreviewSvg('SOL') !== S._mktSparkPreviewSvg('ADA'));
  // Este assert mira CÓDIGO, no prosa: el comentario de la función cita literalmente el
  // `Math.random()` retirado para explicar por qué el provisional es determinista.
  const stripComments = s => String(s || '').replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');
  const previewFn = stripComments(fnSource('_mktSparkPreviewSvg'));
  ok('3B.5 el provisional NO usa Math.random() (esa era la serie falsa retirada)',
     !!previewFn && !/Math\.random\(/.test(previewFn));
  // NO CODIFICA DIRECCIÓN: la diferencia dura con `generateSparkline()`. Un provisional que
  // tomase el signo de la variación volvería a ser legible como mercado.
  const up = S._mktSparkPreviewSvg('SOL');
  ok('3B.6 la forma no depende de la variación: no puede leerse como subida/bajada',
     up === S._mktSparkPreviewSvg('SOL') && !/(stroke="(?!currentColor)|fill="(?!none)")/.test(up) &&
     /stroke="currentColor"/.test(up) && /fill="none"/.test(up));
  ok('3B.7 es una línea, no un gráfico con relleno ni área',
     !/<path/.test(up) && !/gradient/i.test(up) && (up.match(/<polyline/g) || []).length === 1);
  // SIN REFLOW: el provisional y el gráfico real ocupan la MISMA celda; el provisional se
  // dimensiona con las reglas `.col-chart svg` que ya existían (no inventa caja propia).
  ok('3B.8 se estira a la caja de la celda (viewBox + preserveAspectRatio, sin width/height fijos)',
     /viewBox="0 0 100 32"/.test(up) && /preserveAspectRatio="none"/.test(up) &&
     !/<svg[^>]*\swidth="/.test(up) && !/<svg[^>]*\sheight="/.test(up));
  // ALCANCE: el provisional pertenece SÓLO a la fila de Market. Ninguna otra superficie lo llama.
  const callers = (appCode.match(/_mktSparkPreviewSvg\(/g) || []).length;
  const owners = ['renderMarketItem', '_aurixSparkMountAll', '_mktSparkSettle', '_mktHistoryApplyToRow']
    .reduce((n, f) => n + ((stripComments(fnSource(f)) || '').match(/_mktSparkPreviewSvg\(/g) || []).length, 0);
  ok('3B.9 sólo lo invocan los cuatro owners de la celda de Market List (nada más)',
     callers === owners + 1 /* la propia declaración */, 'callers=' + callers + ' owners=' + owners);
  // EL CIERRE YA NO DECLARA VACÍOS. Éste era el productor real del hueco reportado en Cripto:
  // a los 7 s, toda fila sin histórico acababa en `col-chart--none` + innerHTML vacío.
  const settleFn = stripComments(fnSource('_mktSparkSettle'));
  ok('3B.10 el cierre de 7 s repinta el provisional en vez de declarar la celda vacía',
     !!settleFn && !/classList\.add\('col-chart--none'\)/.test(settleFn) &&
     /classList\.add\('col-chart--preview'\)/.test(settleFn) &&
     /innerHTML = _mktSparkPreviewSvg\(/.test(settleFn) &&
     !/innerHTML = '';/.test(settleFn));
  // NINGÚN CAMINO DE FALLO PUEDE DEJAR HUECO: si el motor revienta después de vaciar la celda,
  // se restituye el provisional (antes volvía a esqueleto o a vacío).
  const mountFn2 = stripComments(fnSource('_aurixSparkMountAll'));
  const applyFn2 = stripComments(fnSource('_mktHistoryApplyToRow'));
  ok('3B.11 un fallo de montaje restituye el provisional, nunca deja la celda en blanco',
     /catch \(err\) \{[\s\S]{0,400}innerHTML = _mktSparkPreviewSvg\(/.test(mountFn2) &&
     /catch \(_\) \{[\s\S]{0,400}innerHTML = _mktSparkPreviewSvg\(/.test(applyFn2));
  // Y el histórico real SIGUE MANDANDO: cuando llega, desaloja al provisional.
  ok('3B.12 el histórico real desaloja al provisional en cuanto se monta',
     /classList\.remove\([^)]*'col-chart--preview'/.test(mountFn2) &&
     /classList\.remove\('col-chart--preview'/.test(applyFn2));
}

// ── 4. La celda lee la caché pese al TTL ────────────────────────────────────
console.log('\n4 — El montador del gráfico reutiliza el snapshot caducado:');
if (!missing.length) {
  S._marketHistoryCache.clear();
  const stale = { ts: NOW - 7200000, series: mkSeries(9, 10), meta: null, changePct: -2 };
  put('AAPL', '7d', stale);
  const cellStub = { dataset: { sparkKey: 'AAPL', sparkTf: '7D' } };
  ok('4.1 _mktHistoryEntryForCell devuelve la entrada aunque haya caducado', S._mktHistoryEntryForCell(cellStub) === stale);
  ok('4.2 y sigue devolviendo null cuando no hay nada', S._mktHistoryEntryForCell({ dataset: { sparkKey: 'ZZZZ', sparkTf: '7D' } }) === null);
}

// ── 5. Refresco silencioso: sin diferencia, sin repintado ───────────────────
console.log('\n5 — Refresco silencioso (actualizar SÓLO si hay diferencia):');
if (!missing.length) {
  const a = { ts: NOW, series: mkSeries(10, 5), changePct: 1 };
  const b = { ts: NOW + 60000, series: mkSeries(10, 5), changePct: 1 };   // misma serie, otro instante
  const c = { ts: NOW, series: mkSeries(10, 6), changePct: 1 };           // serie distinta
  ok('5.1 el sello ignora el timestamp: misma serie ⇒ mismo sello', S._mktHistorySeriesStamp(a) === S._mktHistorySeriesStamp(b));
  ok('5.2 una serie distinta cambia el sello', S._mktHistorySeriesStamp(a) !== S._mktHistorySeriesStamp(c));
  ok('5.3 sin serie utilizable el sello es "none"', S._mktHistorySeriesStamp({ ts: NOW, series: [] }) === 'none');
  ok('5.4 _mktHistoryApplyToRow sale sin tocar el DOM si el sello coincide',
     /sparkCell\.dataset\.sparkStamp === _mktHistorySeriesStamp\(entry\)/.test(appCode));
  ok('5.5 la variación sólo se escribe si el texto cambia',
     /if \(cell\.textContent !== txt\) cell\.textContent = txt;/.test(appCode));
  ok('5.6 el montador salta las celdas sin diferencia en vez de recrearlas',
     /if \(keep\.has\(cell\.dataset\.sparkKey \|\| ''\)\) return;/.test(appCode));
  ok('5.7 el parche in-place ya no destruye un gráfico montado sin motivo',
     /sel === '\.col-chart'[\s\S]{0,220}_mktSparkCellHasChart\(lc\)/.test(appCode));
  // REGRESSION LOCK — el motor es LightweightCharts: monta `.aurix-chart-host` con <canvas> y
  // NUNCA un <svg>. Preguntar por 'svg' devolvía siempre "no montado": dejaba inertes las
  // optimizaciones de no-repintado y, en el barrido de cierre, habría BORRADO gráficos reales.
  ok('5.8 la detección de "celda ya montada" no busca <svg> en ninguna ruta de Market',
     !/querySelector\('svg'\)/.test(appCode));
  ok('5.9 existe un único helper de detección y es el que usan todas las rutas',
     /function _mktSparkCellHasChart/.test(appCode) &&
     (appCode.match(/_mktSparkCellHasChart\(/g) || []).length >= 5 &&
     /aurix-chart-host/.test(fnSource('_mktSparkCellHasChart') || ''));
}

// ── 6. Prioridad del SPEC: snapshot → pintar → refrescar detrás ─────────────
console.log('\n6 — Orden del SPEC: último snapshot → render inmediato → refresh silencioso:');
{
  const fv = fnSource('_mktHistoryFetchVisible') || '';
  ok('6.1 una entrada FRESCA se aplica y no se vuelve a pedir',
     /_mktHistoryCacheFresh\(cached, range\)[\s\S]{0,200}_mktHistoryApplyToRow\(item, range, cached, gen\);[\s\S]{0,60}continue;/.test(fv));
  ok('6.2 una entrada caducada pero REAL se aplica YA y ADEMÁS se refresca',
     /_mktHistoryCacheUsable\(cached\)\) _mktHistoryApplyToRow\(item, range, cached, gen\);[\s\S]{0,160}_mktHistoryEnqueue/.test(fv));
  ok('6.3 el refetch lo sigue gobernando FRESCO, no USABLE (no hay llamadas nuevas)',
     /_mktHistoryCacheFresh/.test(fv) && !/if \(!_mktHistoryCacheUsable\(cached\)\)[\s\S]{0,40}_mktHistoryEnqueue/.test(fv));
  ok('6.4 la cola de concurrencia sigue acotada a 3 en vuelo',
     /_marketHistoryQueue\s*=\s*\{ running: 0, max: 3/.test(appCode));
}

// ── 7. Honestidad del dato (no se reintroduce nada sintético) ───────────────
console.log('\n7 — Honestidad: un snapshot reutilizado no puede decir que es de ahora:');
{
  ok('7.1 el meta por defecto publica asOf = instante de OBTENCIÓN, no de pintado',
     /asOf: entry\.ts \|\| Date\.now\(\)/.test(appCode) && /asOf: realEntry\.ts \|\| Date\.now\(\)/.test(appCode));
  ok('7.2 ya no queda ningún asOf: Date.now() suelto en el montaje del mini gráfico',
     !/isSynthetic: false, completeness: 1, asOf: Date\.now\(\),/.test(appCode));
  ok('7.3 sigue sin existir generación sintética de series en Market',
     !/generateSparkline|synthetic ?walk/i.test(appCode));
  ok('7.4 el mini gráfico sigue exigiendo >= 2 puntos reales para pintarse',
     /entry\.series && entry\.series\.length >= 2/.test(appCode) && /realEntry\.series\) && realEntry\.series\.length >= 2/.test(appCode));
}

// ── 8. No se ha tocado ningún subsistema ajeno ──────────────────────────────
console.log('\n8 — Alcance: sólo el owner de Market:');
{
  const t = (re) => (appCode.match(re) || []).length;
  ok('8.1 el motor de gráficos no se ha modificado desde Market (sigue usándose su API pública)',
     /window\.AurixCharts\.createSparkline/.test(appCode));
  ok('8.2 Asset Detail conserva su propio owner de datos (MARKET-V2-02A/02B)',
     /MARKET-V2-02A/.test(app) && /MARKET-V2-02B/.test(app));
  // El owner sigue haciendo UNA sola llamada por fila y rango: ni una petición nueva.
  const f1 = fnSource('_mktHistoryFetchOne') || '';
  ok('8.3 el owner sigue haciendo exactamente una llamada de red por fila y rango',
     (f1.match(/await fn\(args\)/g) || []).length === 1 &&
     (f1.match(/AurixChartAdapters\.(yahoo|crypto)HistoryAdapter/g) || []).length === 2,
     'awaits=' + (f1.match(/await fn\(args\)/g) || []).length);
  ok('8.4 el número de puntos de llamada al adaptador no ha cambiado en todo el bundle',
     t(/AurixChartAdapters\.(yahoo|crypto)HistoryAdapter/g) === 12,
     String(t(/AurixChartAdapters\.(yahoo|crypto)HistoryAdapter/g)));
}

// ── 9. Enlace símbolo → histórico de CRIPTO (MARKET-CRYPTO-HISTORY) ─────────
// La causa real de "los mini gráficos salen vacíos": una cripto sin `coinId` caía a Yahoo con
// el ticker DESNUDO, que Yahoo no resuelve. Comprobado contra el endpoint real: `SOL` → 0
// puntos, `SOL-USD` → 232. Afectaba a ~68 de 129 filas (casi toda la pestaña Cripto), tanto al
// mini gráfico como a la variación. Es la MISMA clase de fallo que el "^" de los índices.
console.log('\n9 — Enlace símbolo → histórico de cripto:');
{
  const vm2 = require('vm');
  const sb = { console, String, Number, RegExp, JSON, MARKET_INDICES: ['^GSPC', '^IXIC', '^DJI'] };
  sb.window = sb; vm2.createContext(sb);
  const srcPick = fnSource('_aurixMktPickAdapter');
  ok('9.1 el owner del enrutado es extraíble', !!srcPick);
  if (srcPick) {
    vm2.runInContext(srcPick, sb);
    const P = sb._aurixMktPickAdapter;
    const y = o => { const r = P(o); return r && r.kind === 'yahoo' ? r.args.symbol : (r ? r.kind : null); };
    // Lo que ya funcionaba NO cambia.
    ok('9.2 una cripto CON coinId sigue yendo al adaptador de cripto',
       (P({ type: 'crypto', coinId: 'solana', symbol: 'SOL' }) || {}).kind === 'crypto');
    ok('9.3 una acción normal no se toca', y({ type: 'stock', symbol: 'AAPL' }) === 'AAPL');
    ok('9.4 los índices conservan su "^"', y({ type: 'index', symbol: 'GSPC' }) === '^GSPC');
    ok('9.5 el oro sigue mapeando a GC=F', y({ type: 'metal', symbol: 'XAU' }) === 'GC=F');
    // El fix.
    ok('9.6 una cripto SIN coinId pide el par canónico, no el ticker desnudo',
       y({ type: 'crypto', symbol: 'SOL' }) === 'SOL-USD', y({ type: 'crypto', symbol: 'SOL' }));
    ok('9.7 se aplica a los tickers afectados de la lista',
       ['ADA', 'DOGE', 'AVAX', 'DOT', 'USDT'].every(s => y({ type: 'crypto', symbol: s }) === s + '-USD'));
    // Y no puede estropear lo que ya venía bien formado.
    ok('9.8 no duplica el sufijo si el símbolo ya trae el par',
       y({ type: 'crypto', symbol: 'SOL-USD' }) === 'SOL-USD');
    ok('9.9 no toca símbolos con sufijo de mercado o separador',
       y({ type: 'crypto', symbol: 'BTC.X' }) === 'BTC.X' && y({ type: 'crypto', symbol: 'ETH/EUR' }) === 'ETH/EUR');
    ok('9.10 marketSymbol explícito sigue mandando', y({ type: 'crypto', marketSymbol: 'BTC-EUR', symbol: 'BTC' }) === 'BTC-EUR');
  }
  // Sigue siendo UNA sola petición por fila: el fix corrige el símbolo, no añade llamadas.
  const f1b = fnSource('_mktHistoryFetchOne') || '';
  ok('9.11 no se añade ninguna petición: misma llamada por fila con el símbolo correcto',
     (f1b.match(/await fn\(args\)/g) || []).length === 1);
  ok('9.12 el enrutado sigue teniendo un único owner compartido',
     (appCode.match(/_aurixMktPickAdapter\(/g) || []).length === 3);
}

console.log(`\nRESULT: ${fail ? 'FAIL ✗' : 'PASS ✓'}  (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
