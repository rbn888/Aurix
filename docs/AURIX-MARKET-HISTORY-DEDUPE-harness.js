'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX · PERF · MARKET-HISTORY-DEDUPE — la cola de mini gráficos de Market, ejecutada de verdad.
// ════════════════════════════════════════════════════════════════════════════
// Se extrae del bundle el bloque REAL (estado de la cola, claves, frescura, encolado, drenaje,
// `_mktHistoryFetchVisible`, `_mktHistoryFetchOne` y el intérprete `_aurixMktDataState`) y se
// ejecuta con un adaptador simulado que cuenta llamadas y resuelve cuando la prueba lo decide.
//
// Medido en la app real antes del cambio: entrar en Market costaba 296–504 peticiones para 156
// series únicas y tres cambios de pestaña ~460 más, porque (1) cada render volvía a encolar lo que
// ya estaba pedido y (2) la respuesta que llegaba tras otro render se TIRABA sin guardarse.
// Después: 156 por fase, 0 duplicados. Este gate fija el contrato que lo hace posible y que no
// cambia ningún valor: mismas fuentes, mismos datos, misma regla de pintado.
const fs = require('fs'), path = require('path'), vm = require('vm');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

let pass = 0, fail = 0; const failed = [];
function ok(n, c, info) {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; failed.push(n); console.log('  ✗ ' + n + (info !== undefined ? '  →  ' + info : '')); }
}
function fnSrc(name) {
  let i = app.indexOf('\nasync function ' + name + '(');
  if (i < 0) i = app.indexOf('\nfunction ' + name + '(');
  if (i < 0) throw new Error('missing ' + name);
  let d = 0, st = false;
  for (let k = i; k < app.length; k++) { if (app[k] === '{') { d++; st = true; } else if (app[k] === '}') { d--; if (st && !d) return app.slice(i, k + 1); } }
  throw new Error('unbalanced ' + name);
}
function between(a, b) { const i = app.indexOf(a), j = app.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing block ' + a); return app.slice(i, j); }
function constSrc(name) { const i = app.indexOf('const ' + name + ' = Object.freeze('); const j = app.indexOf('});', i); return app.slice(i, j + 3); }

function world() {
  const calls = [], pending = [], applied = [];
  const ctx = {
    console: { warn() {}, log() {} }, Promise, Date, Map, Set, Number, Array, Object, String, JSON, Math,
    requestAnimationFrame: (f) => f(), renderCurrentMarketView() { ctx.__rerenders++; }, __rerenders: 0,
    _aurixMktTimeframe: '24H', _aurixMktSortBy: 'name',
    normalizeSymbol: (s) => String(s || '').toUpperCase(),
    _aurixMktSnapshotCapture() {},
    _aurixMktPickAdapter: (item) => ({ kind: item.type === 'crypto' ? 'crypto' : 'yahoo', args: { symbol: item.symbol } }),
    window: {},
  };
  // El adaptador no resuelve solo: la prueba decide cuándo llega cada respuesta.
  const adapter = (args) => new Promise(res => { calls.push(args.symbol + '|' + args.range); pending.push({ sym: args.symbol, res }); });
  ctx.window.AurixChartAdapters = { yahooHistoryAdapter: adapter, cryptoHistoryAdapter: adapter };
  vm.createContext(ctx);
  const src = [
    constSrc('_AURIX_MKT_DS'), fnSrc('_aurixMktDataState'),
    between('const _MKT_HISTORY_RANGE_MAP', 'function _mktHistoryAdaptersReady'),
    fnSrc('_mktHistoryAdaptersReady'), fnSrc('_mktHistoryFetchOne'), fnSrc('_mktHistoryFetchVisible'),
    // El pintado real toca el DOM; aquí se registra QUÉ se pintaría y con qué generación.
    'function _mktHistoryApplyToRow(item, range, entry, gen) { if (gen !== _marketHistoryGen) return; __applied.push([item.symbol, gen, entry.series.length]); }',
    'this.api = { visible: _mktHistoryFetchVisible, cache: _marketHistoryCache, queue: _marketHistoryQueue, inflight: (typeof _mktHistoryInflight !== "undefined" ? _mktHistoryInflight : new Set()), gen: () => _marketHistoryGen };',
  ].join('\n');
  ctx.__applied = applied;
  vm.runInContext(src, ctx);
  const series = (n) => ({ series: Array.from({ length: n }, (_, i) => ({ time: i, value: 100 + i })), meta: { status: 'ready' } });
  const resolveAll = async (n = 3) => { while (pending.length) { pending.shift().res(series(n)); await flush(); } };
  return { ctx, api: ctx.api, calls, pending, applied, series, resolveAll };
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const ITEMS = ['AAPL', 'MSFT', 'NVDA', 'GLD', 'TSLA'].map(s => ({ symbol: s, type: 'stock' }));

(async () => {
console.log('\nAURIX · PERF · MARKET-HISTORY-DEDUPE\n');
{
  const w = world();
  w.api.visible(ITEMS); w.api.visible(ITEMS); w.api.visible(ITEMS);
  await flush();
  const queuedOrRunning = w.api.queue.pending.length + w.api.queue.running;
  ok('tres renders seguidos = UNA petición por serie (antes: una por render)', queuedOrRunning === ITEMS.length && w.api.inflight.size === ITEMS.length, queuedOrRunning);
  await w.resolveAll();
  ok('cada serie se pidió exactamente una vez', w.calls.length === ITEMS.length && new Set(w.calls).size === ITEMS.length, w.calls.join(','));
  ok('al terminar no queda ninguna clave marcada en vuelo', w.api.inflight.size === 0);
  ok('todas las series quedan en caché', ITEMS.every(i => w.api.cache.get(i.symbol + '|24h') && w.api.cache.get(i.symbol + '|24h').series.length === 3));
  ok('y se pintan en el render VIGENTE (respuesta tardía tras otro render)', ITEMS.every(i => w.applied.some(a => a[0] === i.symbol && a[1] === w.api.gen())), JSON.stringify(w.applied.slice(0, 3)));
  const before = w.calls.length; w.api.visible(ITEMS); await flush();
  ok('render posterior con datos frescos: cero peticiones nuevas', w.calls.length === before);
}
{
  const w = world();
  w.api.visible(ITEMS);
  await flush();                                       // 3 en vuelo (max 3), 2 en cola
  const other = [{ symbol: 'BTC', type: 'crypto' }];
  w.api.visible(other);                                 // el usuario cambia de pestaña
  await w.resolveAll();
  ok('cancelación segura: lo que aún no había salido y ya no es visible NO se pide', !w.calls.includes('TSLA|24h') && !w.calls.includes('GLD|24h'), w.calls.join(','));
  ok('lo que ya estaba en vuelo termina y se GUARDA (no se tira)', ['AAPL', 'MSFT', 'NVDA'].every(s => w.api.cache.get(s + '|24h')));
  ok('pero no se pinta en una pestaña donde esa fila no existe', !w.applied.some(a => ['AAPL', 'MSFT', 'NVDA'].includes(a[0]) && a[1] === w.api.gen()));
  ok('la fila de la pestaña nueva sí se pide y se pinta', w.calls.includes('BTC|24h') && w.applied.some(a => a[0] === 'BTC' && a[1] === w.api.gen()));
  const n = w.calls.length; w.api.visible(ITEMS); await w.resolveAll();
  ok('al volver, sólo se piden las que faltaban (las guardadas no se repiten)', w.calls.length - n === 2, w.calls.slice(n).join(','));
}
{
  // Un fallo temporal sigue registrándose como INTENTO (no como ausencia) y no bloquea la clave.
  const w = world();
  w.api.visible([ITEMS[0]]); await flush();
  w.pending.shift().res({ series: [], meta: { status: 'unavailable', error: 'http-502' } }); await flush();
  const e = w.api.cache.get('AAPL|24h');
  ok('fallo del proveedor: se anota el intento (unavailable), sin inventar serie', e && e.unavailable === true && e.series.length === 0);
  ok('y la clave queda libre para el reintento con su ventana de siempre', w.api.inflight.size === 0);
}
{
  const src = fnSrc('_mktHistoryFetchVisible') + fnSrc('_mktHistoryFetchOne');
  ok('regresión: sin precarga diferida — el ranking por periodo (B5) sigue viendo la pestaña entera', !/IntersectionObserver/.test(src));
  ok('regresión: concurrencia de la cola intacta (3)', /const _marketHistoryQueue  = \{ running: 0, max: 3, pending: \[\] \};/.test(app));
  ok('regresión: mismas fuentes (adaptadores Yahoo / CoinGecko existentes)', /window\.AurixChartAdapters\.cryptoHistoryAdapter/.test(src) && /window\.AurixChartAdapters\.yahooHistoryAdapter/.test(src));
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('FALLARON: ' + failed.join(' · ')); process.exit(1); }
})().catch(e => { console.error('HARNESS CRASH', e); process.exit(1); });
