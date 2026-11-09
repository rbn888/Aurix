'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-LIVE-PUSH-STALE-GUARD-harness — sync multi-dispositivo (2026-11-09)
// ════════════════════════════════════════════════════════════════════════════
// Visto por el founder: un activo añadido desde el acceso directo del iPhone no
// aparecía en el navegador. Dos escritores reescribían la fila ENTERA con la
// lista vieja del navegador sin que éste hubiera cambiado nada:
//   · autoSaveToBackend en el tick de precios (>15 min sin subir), y
//   · _flushStatePersistence (snapshot / ocultar pestaña), que además movía
//     `updated_at` —la versión de los ACTIVOS— sin tocarlos.
// Se ejecuta el código REAL de los dos contra un servidor simulado que guarda la
// fila (activos + updated_at) y aplica los filtros de la escritura condicional.
// Parte D: filas de Seguimiento fuera del universo con histórico y ficha.
const fs = require('fs'), path = require('path'), vm = require('vm');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, i) => { if (c) pass++; else fail++; console.log(`  ${c ? '✓' : '✗'} ${n}${!c && i ? '  →  ' + i : ''}`); };
function braceSlice(i) { let d = 0, j = app.indexOf('{', i); for (; j < app.length; j++) { if (app[j] === '{') d++; else if (app[j] === '}') { d--; if (!d) break; } } return app.slice(i, j + 1); }
function fnSrc(name) { let i = app.indexOf('async function ' + name + '('); if (i < 0) i = app.indexOf('function ' + name + '('); if (i < 0) throw new Error('missing fn ' + name); return braceSlice(i); }
function constSrc(name) { const m = app.match(new RegExp('const ' + name + ' = [^;]+;')); if (!m) throw new Error('missing const ' + name); return m[0].replace(/^const /, 'var '); }

const T0 = Date.parse('2026-11-09T10:00:00.000Z');
// Servidor compartido por los dispositivos: una fila por usuario.
function makeServer(row) {
  const srv = { row: row ? Object.assign({}, row) : null, ops: [] };
  srv.from = (table) => {
    const st = { op: 'select', obj: null, filters: [], sel: null };
    const b = {
      select(c) { st.sel = c; st.returning = true; return b; },
      upsert(x) { st.op = 'upsert'; st.obj = x; return b; },
      update(x) { st.op = 'update'; st.obj = x; return b; },
      eq(k, v) { st.filters.push([k, v]); return b; }, single() { return b; }, maybeSingle() { return b; },
      then(res, rej) {
        srv.ops.push({ table, op: st.op, keys: st.obj ? Object.keys(st.obj) : null, filters: st.filters.slice() });
        const match = r => r && st.filters.every(([k, v]) => k === 'updated_at' ? Date.parse(r.updated_at) === Date.parse(v) : String(r[k]) === String(v));
        let data = null;
        if (st.op === 'upsert') { srv.row = Object.assign({}, srv.row || {}, st.obj); data = [srv.row]; }
        else if (st.op === 'update') { if (match(srv.row)) { srv.row = Object.assign({}, srv.row, st.obj); data = [srv.row]; } else data = []; }
        else data = srv.row;
        return Promise.resolve({ data, error: null }).then(res, rej);
      },
    };
    return b;
  };
  return srv;
}

// Un dispositivo con su estado local (meta de sync + activos) contra ese servidor.
function makeDevice(srv, o) {
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, JSON, Object, Array, Math, Number, String, Date, Promise, Error, isFinite,
    setTimeout: () => 0, clearTimeout: () => {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    IS_DEV: false, RESET_AT_KEY: 'k', _AURIX_BLOCK_DESTRUCTIVE_SAVES: false, _aurixLastDestructiveSaveAt: 0,
    _aurixResetInProgress: false, _isSaving: false, _aurixRemoteLoadOutcome: 'ok-row',
    _aurixPersistenceReady: () => true, _aurixResetAt: () => 0, _persistDebug() {}, _setSaveStatus() {}, _aurixAuditSave() {},
    _aurixReadPersistedCounts: () => null, _aurixCountModel: () => ({}), _aurixSyncState: {}, currentUser: { id: 'u1' },
    scheduleStateFlush() {}, _aurixFlushPerformanceState() {},
    getWatchlist: () => ['BTC'], _aurixWatchlistTs: () => 1, _aurixPrefsTs: () => 1, _aurixUiStateTs: () => 1, _aurixSubscriptionTs: () => 1,
    _collectUiState: () => ({}), _aurixHistoryColumnsSafe: () => true, _aurixEpochColumnSeen: false, _aurixLineageColumnSeen: false,
    _aurixLineageDirty: false, _aurixLineageForBackend: () => null, _aurixPortfolioEpoch: () => 0,
    portfolioHistory: [{ ts: 1, value: 1 }], categoryHistory: [], lang: 'es', baseCurrency: 'USD',
    _meta: Object.assign({ version: 1, updatedAt: T0, syncedAt: T0, lastRealMutationAt: T0 - 1000 }, o.meta || {}),
    __assets: o.assets, __resyncs: [],
  };
  ctx._aurixReadPortfolioMeta = () => Object.assign({}, ctx._meta);
  ctx._aurixWritePortfolioMeta = m => { ctx._meta = Object.assign({}, m); };
  ctx._aurixMarkSynced = ms => { ctx._meta.syncedAt = ms; if (!(ctx._meta.updatedAt > ms)) ctx._meta.updatedAt = ms; };
  ctx._aurixAssetsForBackend = () => ({ assets: ctx.__assets.map(t => ({ id: t, ticker: t })), holdings: ctx.__assets.map(t => ({ asset_id: t, quantity: 1 })), omit: false, reason: 'live-data' });
  ctx._aurixResyncFromRemote = r => { ctx.__resyncs.push(r); };
  ctx.supabaseClient = { from: srv.from };
  vm.createContext(ctx);
  for (const c of ['_AURIX_LIVE_PRICE_KEYS', '_AURIX_LIVE_PRICE_PERSIST_MS', '_AURIX_LIVE_PUSH_DEFER_MS']) vm.runInContext(constSrc(c), ctx);
  // Última subida correcta hace >15 min: el salto «sólo precios» no aplica (el caso de la pestaña que vuelve).
  vm.runInContext('var _aurixLastSyncedStructFp = null; var _aurixLastBackendSaveOkAt = Date.now() - 20 * 60 * 1000; var _aurixLastSyncedStructUser = "u1"; var _aurixLivePushDeferUntil = 0; var _aurixLastFlushedStateFp = null; var _lastStateFlushMs = 0;', ctx);
  ['_aurixContentFingerprint', '_aurixStructuralFingerprint', 'autoSaveToBackend', '_flushStatePersistence'].forEach(f => vm.runInContext(fnSrc(f), ctx));
  return ctx;
}
const run = (c, code) => vm.runInContext(code, c);
const serverTickers = s => (s.row && s.row.assets || []).map(a => a.ticker).join(',');
const writes = s => s.ops.filter(x => x.op === 'upsert' || x.op === 'update').length;

(async () => {
  console.log('\nAURIX-LIVE-PUSH-STALE-GUARD');

  // ── El escenario del founder ──
  // El navegador sincronizó en T0 con [BTC]. Después el acceso directo dio de alta FUND (T1).
  const T1 = T0 + 60 * 1000;
  const srv = makeServer({ user_id: 'u1', assets: [{ id: 'BTC', ticker: 'BTC' }, { id: 'FUND', ticker: 'FUND' }], updated_at: new Date(T1).toISOString() });
  const browser = makeDevice(srv, { assets: ['BTC'] });

  await run(browser, 'autoSaveToBackend()');
  ok('E.1 tick de precios de la pestaña vieja ⇒ el alta del otro dispositivo sigue en el servidor', serverTickers(srv) === 'BTC,FUND', serverTickers(srv));
  ok('E.2 …el sello del servidor no se mueve', Date.parse(srv.row.updated_at) === T1);
  ok('E.3 …y la pestaña reconcilia con el remoto en vez de sobrescribir', browser.__resyncs[0] === 'remote-newer-before-push');
  ok('E.4 _isSaving se libera tras aplazar', run(browser, '_isSaving') === false);
  const w1 = writes(srv);
  await run(browser, 'autoSaveToBackend()');
  ok('E.5 dentro del aplazamiento no se reintenta en cada tick de 30 s', writes(srv) === w1);

  await run(browser, "_flushStatePersistence('debounced')");
  ok('F.1 flush de snapshot/historial de la pestaña vieja ⇒ NO reescribe los activos', serverTickers(srv) === 'BTC,FUND', serverTickers(srv));
  ok('F.2 …ni mueve `updated_at` (la versión de los activos)', Date.parse(srv.row.updated_at) === T1);
  ok('F.3 …pero el historial sí se guarda', Array.isArray(srv.row.portfolio_history) && srv.row.portfolio_history.length === 1);

  // La reconciliación adopta el remoto (como hace _aurixResyncFromRemote con «remote-more»).
  browser.__assets = ['BTC', 'FUND']; run(browser, `_aurixMarkSynced(${T1}); _aurixLivePushDeferUntil = 0;`);
  await run(browser, 'autoSaveToBackend()');
  const T2 = Date.parse(srv.row.updated_at);
  ok('E.6 ya reconciliada, la subida de precios vuelve a funcionar (escritura condicional aceptada)', T2 > T1 && run(browser, '_meta.syncedAt') === T2);
  await run(browser, "_lastStateFlushMs = 0; _flushStatePersistence('debounced')");
  run(browser, '_aurixLastBackendSaveOkAt = Date.now() - 20 * 60 * 1000;');
  await run(browser, 'autoSaveToBackend()');
  const _lastOp = srv.ops[srv.ops.length - 1];
  ok('E.7 el flush propio ya no rompe la escritura condicional del mismo dispositivo', _lastOp.op === 'update' && _lastOp.keys.includes('assets') && browser.__resyncs.length === 1 && Date.parse(srv.row.updated_at) >= T2, JSON.stringify(srv.ops.slice(-3)) + ' resyncs=' + browser.__resyncs.length);

  // ── Mutación real: comportamiento de siempre ──
  {
    const s = makeServer({ user_id: 'u1', assets: [{ id: 'BTC', ticker: 'BTC' }], updated_at: new Date(T0).toISOString() });
    const d = makeDevice(s, { assets: ['BTC', 'ETH'], meta: { lastRealMutationAt: T0 + 5 } });
    await run(d, 'autoSaveToBackend()');
    ok('E.8 mutación real pendiente ⇒ se sube como siempre', serverTickers(s) === 'BTC,ETH' && s.ops.some(x => x.op === 'upsert'));
    const s2 = makeServer({ user_id: 'u1', assets: [{ id: 'BTC', ticker: 'BTC' }], updated_at: new Date(T0).toISOString() });
    const d2 = makeDevice(s2, { assets: ['BTC', 'ETH'], meta: { lastRealMutationAt: T0 + 5 } });
    await run(d2, "_flushStatePersistence('debounced')");
    const stamp = Date.parse(s2.row.updated_at);
    ok('F.4 flush con mutación real ⇒ sube los activos (upsert de siempre)', serverTickers(s2) === 'BTC,ETH' && stamp > T0);
    ok('F.5 …y marca la sync con ese sello, así la siguiente subida condicional encaja', run(d2, '_meta.syncedAt') === stamp);
  }

  // ── Bordes ──
  {
    const s = makeServer(null);
    const d = makeDevice(s, { assets: ['BTC'], meta: { syncedAt: 0, updatedAt: 0, lastRealMutationAt: 0 } });
    await run(d, 'autoSaveToBackend()');
    ok('E.9 cuenta sin sincronizar aún ⇒ upsert normal (crea la fila)', serverTickers(s) === 'BTC' && s.ops[0].op === 'upsert');
    const s2 = makeServer(null);
    const d2 = makeDevice(s2, { assets: ['BTC'] });
    await run(d2, "_flushStatePersistence('debounced')");
    ok('F.6 flush sin fila en el servidor ⇒ recurre al upsert y la crea con sus activos', serverTickers(s2) === 'BTC' && !!s2.row.updated_at);
  }

  // ── M · fusión con el mismo número de activos (_aurixMergePortfolio REAL) ──
  {
    const m = { console: { log() {} }, Math, JSON, Array, Object, String, Number, Date, Map, isFinite, __meta: {} };
    vm.createContext(m);
    vm.runInContext('function _shouldDistrustRemote(){return false;} function _aurixReadPortfolioMeta(){return Object.assign({}, __meta);}', m);
    ['_aurixRemoteUpdatedMs', '_aurixRemoteLosesEconomicGround', '_aurixMergePortfolio'].forEach(f => vm.runInContext(fnSrc(f), m));
    const merge = (meta, local, remote) => { m.__meta = meta; return vm.runInContext('_aurixMergePortfolio', m)(local, remote); };
    const L = { assets: [{ id: 'a' }], holdings: [{ asset_id: 'a', quantity: 2, transactions: [1] }] };
    const R = (q, ms) => ({ assets: [{ id: 'a' }], holdings: [{ asset_id: 'a', quantity: q, transactions: [1] }], updated_at: new Date(ms).toISOString() });
    // Sin mutación propia; los ticks de precios han movido updatedAt por delante del remoto.
    const idle = { syncedAt: T0, updatedAt: T0 + 9e5, lastRealMutationAt: T0 - 1 };
    ok('M.1 sin cambios propios, un remoto posterior a la última sync se adopta aunque los precios movieran updatedAt',
       merge(idle, L, R(3, T0 + 6e4)).apply === 'remote');
    ok('M.2 …pero la guarda económica sigue: un remoto con MENOS unidades no se adopta',
       merge(idle, L, R(1, T0 + 6e4)).apply === 'local');
    ok('M.3 remoto no posterior a la última sync ⇒ se queda lo local', merge(idle, L, R(3, T0)).apply === 'local');
    const pending = { syncedAt: T0, updatedAt: T0 + 9e5, lastRealMutationAt: T0 + 5e5 };
    ok('M.4 con una mutación real propia pendiente, regla de siempre: remoto más viejo que updatedAt ⇒ local',
       merge(pending, L, R(3, T0 + 6e4)).apply === 'local');
    ok('M.5 …y remoto más nuevo que updatedAt ⇒ remoto (como antes)', merge(pending, L, R(3, T0 + 1e6)).apply === 'remote');
  }

  // ── D · filas de Seguimiento fuera del universo ──
  ok('D.1 el histórico del Seguimiento incluye las filas extra',
     /const _histData = \(currentMarketTab === 'watchlist' && !_marketSearchQuery && _aurixWlExtraShown\.length\) \? data\.concat\(_aurixWlExtraShown\) : data;\s*_mktHistoryFetchVisible\(_histData\);/.test(app));
  ok('D.2 la ficha se abre con la identidad recordada si no está en MARKET_DATA',
     /_findMktItem\(symbol, MARKET_DATA\) : null; \} catch \(_\) \{\}\s*\/\/[^\n]*\n\s*if \(!item\) \{ try \{ item = _aurixWlExtra\.get\(normalizeSymbol\(symbol\)\) \|\| null; \} catch \(_\) \{\} \}/.test(app));
  const d = { console: { log() {} }, Math, JSON, Array, Object, String, Number, Date, Map, Set, Promise };
  vm.createContext(d);
  vm.runInContext(`var currentMarketTab='watchlist', _marketSearchQuery=''; var __wl=['BTC','0P0001CLDK'];
    function getWatchlist(){return __wl.slice();} function t(k){return k;} function _aurixMktExpFlag(){return false;}
    function _aurixMktTableHeaderHtml(){return '';} function renderMarketItem(i){return '<'+i.symbol+'>';} function renderCurrentMarketView(){}`, d);
  vm.runInContext(fnSrc('normalizeSymbol'), d);
  const st = app.indexOf('const _aurixWlExtra'); vm.runInContext(app.slice(st, app.indexOf('function renderMyAssetsBlock', st)).replace(/^const /gm, 'var ').replace(/^let /gm, 'var '), d);
  vm.runInContext(fnSrc('renderMyAssetsBlock'), d);
  vm.runInContext("_aurixWlExtra.set('0P0001CLDK', { symbol: '0P0001CLDK.F', marketSymbol: '0P0001CLDK.F', type: 'fund', price: 14.07, _wlTs: Date.now() });", d);
  vm.runInContext('renderMyAssetsBlock', d)([{ symbol: 'BTC', price: 1 }]);
  const shown = vm.runInContext('_aurixWlExtraShown', d);
  ok('D.3 el render publica las filas extra que pintó (y sólo ésas)', shown.length === 1 && shown[0].symbol === '0P0001CLDK.F');
  vm.runInContext("__wl=['BTC'];", d); vm.runInContext('renderMyAssetsBlock', d)([{ symbol: 'BTC', price: 1 }]);
  ok('D.4 al desmarcar, la lista de extras pintadas se vacía', vm.runInContext('_aurixWlExtraShown', d).length === 0);

  console.log(`\n${fail ? '✗ FAIL' : '✓ PASS'}  ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
