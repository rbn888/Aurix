'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MARKET-PERIOD-SORT-TRUTH — SPEC MARKET EXCELLENCE B5
// ════════════════════════════════════════════════════════════════════════════
// El orden por rendimiento se calculaba UNA vez con la cobertura del instante y
// después cada variación que llegaba se escribía DENTRO de la fila ya pintada, sin
// reordenar: la lista acababa mostrando un +20 % por debajo de un +2 %. Este harness
// monta el pipeline REAL de historial de Market en un sandbox (cola, caché, orden,
// estado de cobertura) con la red y el DOM sustituidos por dobles, y comprueba A–H.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { return ''; } };
const app = read('app.js');
// Código sin comentarios: una afirmación sobre el CÓDIGO no puede dispararse por
// una palabra escrita en un comentario (incluido el de este mismo SPEC).
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
// Declaración completa `const|let NAME = <literal>;` (objeto, array o escalar).
function declSource(name) {
  const m = new RegExp('(?:const|let)\\s+' + name + '\\s*=\\s*').exec(app);
  if (!m) return '';
  const start = m.index;
  let i = m.index + m[0].length;
  const open = app[i];
  if (open === '{' || open === '[' || app.slice(i, i + 15).startsWith('Object.freeze(')) {
    const brace = app.indexOf(open === '{' || open === '[' ? open : '{', i);
    const closeCh = app[brace] === '[' ? ']' : '}';
    let d = 0;
    for (let k = brace; k < app.length; k++) {
      if (app[k] === app[brace]) d++;
      else if (app[k] === closeCh) { d--; if (!d) { const end = app.indexOf(';', k); return app.slice(start, end + 1); } }
    }
  }
  const end = app.indexOf(';', i);
  return app.slice(start, end + 1);
}

console.log('AURIX-MARKET-PERIOD-SORT-TRUTH — SPEC MARKET EXCELLENCE B5\n');

// ── Sandbox con el código REAL y sólo la red/DOM sustituidos ───────────────
function build() {
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    Math, JSON, Date, Map, Set, Array, Number, Object, String, Boolean, Promise, RegExp, Error,
    isFinite, isNaN, parseInt, parseFloat, setTimeout, clearTimeout,
    __renders: 0, __fetched: [], __applied: [], __raf: [], __maxRunning: 0,
  };
  ctx.window = ctx;
  ctx.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };
  ctx.requestAnimationFrame = (f) => { ctx.__raf.push(f); return ctx.__raf.length; };
  ctx.renderCurrentMarketView = () => { ctx.__renders++; };
  ctx._mktHistoryApplyToRow = (item) => { ctx.__applied.push(item && item.symbol); };
  ctx._aurixMktSnapshotCapture = () => false;
  ctx.AURIX_TELEMETRY = undefined;
  ctx.isInWatchlist = () => false;
  ctx.safeChange = v => String(v);
  ctx._aurixMktExpFlag = () => true;
  ctx._aurixMktFeaturedRank = () => 999;
  ctx._aurixMktTypePriority = () => 1;
  ctx._aurixMktRowMarketCap = () => NaN;
  ctx._aurixMktRowPrice = a => Number(a && a.price);
  // Capa de adaptadores presente (el pipeline sólo comprueba que existan).
  ctx.window.AurixChartAdapters = { yahooHistoryAdapter() {}, cryptoHistoryAdapter() {} };
  vm.createContext(ctx);

  const decls = ['_MKT_HISTORY_RANGE_MAP', '_MKT_HISTORY_TTL', '_MKT_HISTORY_UNAVAIL_TTL',
                 '_marketHistoryCache', '_marketHistoryQueue', '_marketHistoryGen',
                 '_marketHistoryErrors', '_mktRankPendingGen', '_aurixMktTimeframe', '_aurixMktSortBy']
    // `const`/`let` en el ámbito de un script de vm NO se exponen como propiedades del
    // contexto, así que la declaración se reescribe a `var`. El VALOR es el real del bundle.
    .map(n => declSource(n).replace(/^(?:const|let)\s+/, 'var ')).join('\n');
  const fns = ['normalizeSymbol', '_mktHistoryAdapterRange', '_mktHistoryCacheKey',
               '_mktHistoryCacheFresh', '_mktHistoryCacheUsable', '_mktHistorySeriesStamp',
               '_mktHistoryChangeForRow', '_mktHistoryAdaptersReady',
               '_aurixMktSortNeedsPeriodHistory', '_aurixMktSortCoveragePending',
               '_mktHistoryEnqueue', '_mktHistoryDrain', '_mktHistoryFetchVisible',
               '_aurixMktExpSortItems']
    .map(fnSource).join('\n');
  vm.runInContext(decls + '\n' + fns, ctx);
  // La petición real por fila se sustituye por un doble determinista: lo que se prueba
  // es la cola, el orden y el estado de cobertura, no el proveedor (eso es B1).
  ctx.__resolvers = [];
  vm.runInContext(`
    async function _mktHistoryFetchOne(item, range, gen) {
      __fetched.push(item.symbol + '|' + range);
      // Concurrencia observada DENTRO del trabajo: la cota real, no una lectura de después.
      if (_marketHistoryQueue.running > __maxRunning) __maxRunning = _marketHistoryQueue.running;
      await new Promise(res => __resolvers.push({ res, item, range, gen }));
      if (gen !== _marketHistoryGen) return;
      const k = _mktHistoryCacheKey(item, range);
      const pct = __plan && (item.symbol in __plan) ? __plan[item.symbol] : null;
      if (pct === 'unavailable') {
        _marketHistoryCache.set(k, { ts: Date.now(), series: [], meta: null, changePct: null, unavailable: true });
      } else {
        _marketHistoryCache.set(k, { ts: Date.now(), series: [{time:1,value:1},{time:2,value:2}], meta: null, changePct: pct });
      }
      _mktHistoryApplyToRow(item, range, _marketHistoryCache.get(k), gen);
    }
    var __plan = {};
  `, ctx);
  ctx.flushQueue = async () => {
    // Resuelve la cola completa respetando la concurrencia real.
    for (let guard = 0; guard < 500 && (ctx.__resolvers.length || ctx._marketHistoryQueue.running); guard++) {
      const r = ctx.__resolvers.shift();
      if (r) r.res(); else await new Promise(res => setTimeout(res, 0));
      await new Promise(res => setTimeout(res, 0));
    }
    await new Promise(res => setTimeout(res, 0));
  };
  ctx.flushRaf = () => { const q = ctx.__raf.splice(0); q.forEach(f => f()); };
  return ctx;
}
const universe = (n, type) => Array.from({ length: n }, (_, i) => ({ symbol: 'S' + i, name: 'Asset ' + i, type: type || 'stock', price: 10 + i }));

(async () => {
  // ── 1. Estructura: el orden no puede depender del scroll ────────────────
  console.log('1 — A · El orden no depende del scroll (por construcción):');
  ok('1.1 no existe ningún IntersectionObserver en el bundle',
     !/IntersectionObserver/.test(appCode));
  ok('1.2 la precarga recibe el universo COMPLETO de la pestaña, no una porción del viewport',
     /try \{ _mktHistoryFetchVisible\(data\); \}/.test(app)
     && /const data = isAggregate[\s\S]{0,160}Object\.freeze\(\[\.\.\.MARKET_DATA\]\)/.test(app));
  ok('1.3 la precarga recorre TODO el dataset (sin corte ni ventana)',
     /const items = Array\.isArray\(dataset\) \? dataset : \[\];/.test(fnSource('_mktHistoryFetchVisible'))
     && /for \(const item of items\)/.test(fnSource('_mktHistoryFetchVisible')));
  ok('1.4 ningún listener de scroll alimenta el pipeline de histórico',
     !/addEventListener\('scroll'[\s\S]{0,200}_mktHistory/.test(app));
  {
    const ctx = build();
    ctx._aurixMktTimeframe = '7D'; ctx._aurixMktSortBy = 'change';
    const items = universe(6);
    const R = '7d';
    // Misma cobertura, dos ordenaciones consecutivas (equivale a "antes y después de scroll":
    // el scroll no toca ni el dataset ni el caché).
    [['S0', 5], ['S1', -3], ['S2', 12], ['S3', 0], ['S4', null], ['S5', 8]].forEach(([s, p]) => {
      ctx._marketHistoryCache.set(s + '|' + R, { ts: Date.now(), series: [1, 2], changePct: p });
    });
    ctx.__items = items;
    const first  = vm.runInContext('_aurixMktExpSortItems(__items).map(x => x.symbol)', ctx);
    const second = vm.runInContext('_aurixMktExpSortItems(__items).map(x => x.symbol)', ctx);
    const shuffled = vm.runInContext('_aurixMktExpSortItems(__items.slice()).map(x => x.symbol)', ctx);
    ok('1.5 el mismo tab + periodo + datos da EXACTAMENTE el mismo orden',
       JSON.stringify(first) === JSON.stringify(second) && JSON.stringify(first) === JSON.stringify(shuffled),
       first.join(','));
    ok('1.6 el orden es el correcto por variación de periodo (12, 8, 5, 0, -3, ausente)',
       JSON.stringify(first) === JSON.stringify(['S2', 'S5', 'S0', 'S3', 'S1', 'S4']), first.join(','));
    ok('1.7 C · la fila sin dato real va AL FINAL (no finge 0 %)',
       first[first.length - 1] === 'S4');
  }

  // ── 2. B · cobertura completa o ranking declarado pendiente ─────────────
  console.log('\n2 — B · Cobertura: el ranking parcial no se presenta como definitivo:');
  {
    const ctx = build();
    ctx._aurixMktTimeframe = '7D'; ctx._aurixMktSortBy = 'change';
    ctx.__plan = { S0: 5, S1: 20, S2: 2, S3: 'unavailable', S4: -1 };
    ctx.__items = universe(5);
    vm.runInContext('_mktHistoryFetchVisible(__items)', ctx);
    ok('2.1 con trabajo pendiente el ranking se declara PENDIENTE',
       vm.runInContext('_aurixMktSortCoveragePending()', ctx) === true);
    await ctx.flushQueue();
    ok('2.2 pide el histórico de TODAS las filas del universo (5), no sólo de las vistas',
       ctx.__fetched.length === 5, ctx.__fetched.join(','));
    ok('2.3 H · la concurrencia observada nunca pasa del máximo de la cola (3)',
       ctx.__maxRunning > 0 && ctx.__maxRunning <= 3 && ctx._marketHistoryQueue.max === 3,
       'maxRunning=' + ctx.__maxRunning + ' max=' + ctx._marketHistoryQueue.max);
    ok('2.4 al vaciarse la cola se publica UN re-ranking (uno, no uno por fila)',
       ctx.__raf.length === 1, 'raf=' + ctx.__raf.length);
    ctx.flushRaf();
    ok('2.5 el re-ranking es exactamente un render', ctx.__renders === 1, 'renders=' + ctx.__renders);
    ok('2.6 y el estado pendiente se apaga', vm.runInContext('_aurixMktSortCoveragePending()', ctx) === false);
    ctx.__items = universe(5);
    const order = vm.runInContext('_aurixMktExpSortItems(__items).map(x => x.symbol)', ctx);
    ok('2.7 el orden final refleja TODA la cobertura (20, 5, 2, -1, ausente)',
       JSON.stringify(order) === JSON.stringify(['S1', 'S0', 'S2', 'S4', 'S3']), order.join(','));
    ok('2.8 D · la fila con proveedor no disponible NO aparece como 0 %',
       vm.runInContext('_mktHistoryChangeForRow({symbol:"S3"})', ctx) === null);
  }

  // ── 3. E · caché caliente: cero peticiones repetidas ────────────────────
  console.log('\n3 — E · Caché caliente y sin trabajo redundante:');
  {
    const ctx = build();
    ctx._aurixMktTimeframe = '7D'; ctx._aurixMktSortBy = 'change';
    ctx.__plan = { S0: 1, S1: 2, S2: 3 };
    ctx.__items = universe(3);
    vm.runInContext('_mktHistoryFetchVisible(__items)', ctx);
    await ctx.flushQueue(); ctx.flushRaf();
    const firstRound = ctx.__fetched.length;
    ctx.__fetched.length = 0; ctx.__renders = 0;
    vm.runInContext('_mktHistoryFetchVisible(__items)', ctx);
    ok('3.1 la segunda pasada con caché fresco no pide NADA',
       firstRound === 3 && ctx.__fetched.length === 0, 'r1=' + firstRound + ' r2=' + ctx.__fetched.length);
    ok('3.2 y por tanto no declara ranking pendiente',
       vm.runInContext('_aurixMktSortCoveragePending()', ctx) === false);
    await ctx.flushQueue();
    ok('3.3 sin trabajo pendiente NO hay re-render (imposible el bucle de renders)',
       ctx.__renders === 0 && ctx.__raf.length === 0, 'renders=' + ctx.__renders);
  }
  {
    // Un fallo del proveedor no se reintenta en ráfaga (ventana corta de B1) y tampoco
    // deja el ranking colgado como pendiente para siempre.
    const ctx = build();
    ctx._aurixMktTimeframe = '1Y'; ctx._aurixMktSortBy = 'change';
    ctx.__plan = { S0: 'unavailable', S1: 4 };
    ctx.__items = universe(2);
    vm.runInContext('_mktHistoryFetchVisible(__items)', ctx);
    await ctx.flushQueue(); ctx.flushRaf();
    ctx.__fetched.length = 0;
    vm.runInContext('_mktHistoryFetchVisible(__items)', ctx);
    ok('3.4 el intento fallido no se reintenta de inmediato', ctx.__fetched.length === 0);
    ok('3.5 y el ranking queda publicado, no pendiente para siempre',
       vm.runInContext('_aurixMktSortCoveragePending()', ctx) === false);
  }

  // ── 4. F · cambio de temporalidad / pestaña invalida el trabajo viejo ───
  console.log('\n4 — F · El trabajo obsoleto se descarta:');
  {
    const ctx = build();
    ctx._aurixMktTimeframe = '7D'; ctx._aurixMktSortBy = 'change';
    ctx.__plan = { S0: 5, S1: 6, S2: 7, S3: 8 };
    ctx.__items = universe(4);
    vm.runInContext('_mktHistoryFetchVisible(__items)', ctx);
    const genBefore = ctx._marketHistoryGen;
    // El usuario cambia de temporalidad a mitad de la cola: nuevo render, nueva generación.
    ctx._aurixMktTimeframe = '1M';
    vm.runInContext('_mktHistoryFetchVisible(__items)', ctx);
    ok('4.1 el cambio de temporalidad bumpea la generación',
       ctx._marketHistoryGen > genBefore, genBefore + ' → ' + ctx._marketHistoryGen);
    ok('4.2 lo pendiente de la generación vieja deja de contar como pendiente de ESTA',
       vm.runInContext('_mktRankPendingGen === _marketHistoryGen', ctx) === true);
    await ctx.flushQueue();
    ok('4.3 se publica UN solo re-ranking, no uno por generación abandonada',
       ctx.__raf.length === 1, 'raf=' + ctx.__raf.length);
    ctx.flushRaf();
    ok('4.4 las respuestas de la generación vieja no escriben el periodo nuevo',
       !ctx._marketHistoryCache.has('S0|7d') || ctx._marketHistoryCache.has('S0|30d'));
  }

  // ── 5. G · 24H intacto ─────────────────────────────────────────────────
  console.log('\n5 — G · 24H no se toca: dato vivo, completo y sin re-ranking:');
  {
    const ctx = build();
    ctx._aurixMktTimeframe = '24H'; ctx._aurixMktSortBy = 'change';
    ok('5.1 con 24H la ordenación NO depende de histórico de periodo',
       vm.runInContext('_aurixMktSortNeedsPeriodHistory()', ctx) === false);
    ctx.__plan = { S0: 1, S1: 2, S2: 3 };
    ctx.__items = [
      { symbol: 'S0', type: 'crypto', price: 1, change24h: 3 },
      { symbol: 'S1', type: 'crypto', price: 2, change24h: -5 },
      { symbol: 'S2', type: 'crypto', price: 3, change24h: 9 },
    ];
    const order = vm.runInContext('_aurixMktExpSortItems(__items).map(x => x.symbol)', ctx);
    ok('5.2 24H ordena con el dato vivo de la fila (9, 3, -5)',
       JSON.stringify(order) === JSON.stringify(['S2', 'S0', 'S1']), order.join(','));
    vm.runInContext('_mktHistoryFetchVisible(__items)', ctx);
    ok('5.4 pero NUNCA declara ranking pendiente ni fuerza re-ranking en 24H',
       vm.runInContext('_aurixMktSortCoveragePending()', ctx) === false);
    await ctx.flushQueue();
    ok('5.3 24H sigue rellenando el mini gráfico (el trabajo de fondo no desaparece)',
       ctx.__fetched.length === 3, ctx.__fetched.join(','));
    ok('5.5 y no publica ningún render extra', ctx.__renders === 0 && ctx.__raf.length === 0,
       'renders=' + ctx.__renders);
  }
  {
    // Ordenaciones que no son de rendimiento tampoco activan nada.
    const ctx = build();
    ctx._aurixMktTimeframe = '7D';
    for (const sb of ['featured', 'name', 'price', 'price_asc', 'relevance', 'type', 'watchlist']) {
      ctx._aurixMktSortBy = sb;
      if (vm.runInContext('_aurixMktSortNeedsPeriodHistory()', ctx) !== false) { fail++; console.log('  ✗ 5.6 ' + sb); }
    }
    ok('5.6 ninguna ordenación ajena al rendimiento activa el re-ranking', true);
    ctx._aurixMktSortBy = 'change_asc';
    ok('5.7 "mayor caída" del periodo SÍ lo activa (mismo dato, misma verdad)',
       vm.runInContext('_aurixMktSortNeedsPeriodHistory()', ctx) === true);
  }

  // ── 6. Presupuesto: ni una petición nueva, ni precarga especulativa ────
  console.log('\n6 — Presupuesto de red y alcance:');
  const fv = fnSource('_mktHistoryFetchVisible');
  ok('6.1 no se ha añadido ninguna petición: el conteo es sobre el trabajo YA encolado',
     (fv.match(/_mktHistoryEnqueue\(/g) || []).length === 1);
  ok('6.2 no hay precarga especulativa de otros periodos',
     !/for \(const r of \['7d','30d','1y','all'\]/.test(app) && !/PRELOAD_RANGES/.test(app));
  ok('6.3 el re-ranking vive en el drenaje de la cola (un solo owner)',
     (fnSource('_mktHistoryDrain').match(/_mktRankPendingGen = 0;/g) || []).length === 1
     && (appCode.match(/_mktRankPendingGen = gen;/g) || []).length === 1
     && /if \(!_marketHistoryQueue\.running && !_marketHistoryQueue\.pending\.length && _aurixMktSortCoveragePending\(\)\)/.test(app)
     && (appCode.match(/renderCurrentMarketView\(\); \} catch \(_\) \{\} \};/g) || []).length === 1);
  ok('6.4 el estado de cobertura no añade nodos ni CSS: va en la etiqueta del orden',
     /rankPending \? PENDING_SUFFIX : ''/.test(app)
     && !/mkt-rank-pending|mkt-coverage/.test(read('styles.css')));
  ok('6.5 la etiqueta del orden declara el periodo REAL que usa',
     /'Mayor subida ' \+ _tf/.test(app) && /'Top gainers ' \+ _tf/.test(app));
  ok('6.6 B1 / B1.1 / B3 / B4 intactos',
     /function _aurixMktDataState\(/.test(app) && /_idNeedsChain/.test(app)
     && /'CNDX\.L'/.test(app) && /_cryptoLongHistory/.test(read('services/chart-adapters.js')));
  ok('6.7 la autoridad de orden de búsqueda no se ha tocado',
     (app.match(/^function _aurixRankSearchResults\(/gm) || []).length === 1);
  ok('6.8 no hay un segundo caché de histórico',
     (app.match(/const _marketHistoryCache\s*=\s*new Map\(\)/g) || []).length === 1);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
