'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-IDLE-REDUNDANT-WRITES-harness — RENDIMIENTO EN REPOSO (2026-10-20)
// ════════════════════════════════════════════════════════════════════════════
// En reposo, cada tick de precios (30 s) subía el catálogo entero aunque no
// cambiara nada persistible; ocultar la pestaña reescribía el estado completo
// (historiales incluidos) aunque fuera idéntico; y cada performance_state se
// releía tras escribirlo aunque la fila devuelta ya lo probara.
// Se ejecuta el CÓDIGO REAL de app.js (extraído tal cual) contra un Supabase
// simulado que registra cada operación. Nada se reimplementa aquí.
const fs = require('fs'), path = require('path'), vm = require('vm');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
let pass = 0, fail = 0; const failed = [];
const ok = (n, c, i) => { if (c) pass++; else { fail++; failed.push(n); } console.log(`  ${c ? '✓' : '✗'} ${n}${i ? '  [' + i + ']' : ''}`); };

function braceSlice(i) { let d = 0, j = app.indexOf('{', i); for (; j < app.length; j++) { if (app[j] === '{') d++; else if (app[j] === '}') { d--; if (!d) break; } } return app.slice(i, j + 1); }
function fnSrc(name) { let i = app.indexOf('async function ' + name + '('); if (i < 0) i = app.indexOf('function ' + name + '('); if (i < 0) throw new Error('missing fn ' + name); return braceSlice(i); }
function constSrc(name) { const re = new RegExp('const ' + name + ' = [^;]+;'); const m = app.match(re); if (!m) throw new Error('missing const ' + name); return m[0].replace(/^const /, 'var '); }

function makeCtx(opts) {
  const o = opts || {};
  const ls = new Map();
  const ops = [];
  let failNext = 0;
  let stored = { user_id: 'u1', performance_state: null };
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, JSON, Object, Array, Math, Number, String, Date, Promise, Error, isFinite,
    setTimeout: () => 0, clearTimeout: () => {},
    localStorage: { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) },
    IS_DEV: false, RESET_AT_KEY: 'aurix_reset_at', _AURIX_BLOCK_DESTRUCTIVE_SAVES: false, _aurixLastDestructiveSaveAt: 0,
    _aurixResetInProgress: false, _aurixRemoteLoadOutcome: 'ok-row', _isSaving: false,
    _aurixPersistenceReady: () => true, _aurixResetAt: () => 0, _persistDebug() {}, _setSaveStatus() {}, _aurixAuditSave() {},
    _aurixReadPersistedCounts: () => null, _aurixCountModel: () => ({}), _aurixSyncState: {},
    _meta: { version: 1, updatedAt: 0, syncedAt: 0 },
    currentUser: { id: 'u1' },
    // Activos "vivos" en la forma de la app; el catálogo se convierte con el convertToNewModel REAL.
    assets: [
      { id: 'a1', ticker: 'BTC', type: 'crypto', price: 60000, prevPrice: 59000, change24h: 1.2, qty: 0.5, costBasis: 20000, assetCurrency: 'USD', transactions: [{ type: 'buy', qty: 0.5, price: 40000, ts: 1 }] },
      { id: 'a2', ticker: 'MSFT', type: 'stock', marketSymbol: 'MSFT', price: 400, prevPrice: 398, change24h: 0.5, qty: 10, costBasis: 3000, assetCurrency: 'USD', transactions: [] },
    ],
    portfolioHistory: [{ ts: 1, value: 30000 }], categoryHistory: [{ ts: 1, crypto: 30000 }],
    lang: 'es', baseCurrency: 'USD', getWatchlist: () => ['BTC'],
    _aurixWatchlistTs: () => 1, _aurixPrefsTs: () => 1, _aurixUiStateTs: () => 1, _aurixSubscriptionTs: () => 1, _collectUiState: () => ({ a: 1 }),
    _aurixHistoryColumnsSafe: () => true, _aurixEpochColumnSeen: false, _aurixLineageColumnSeen: false, _aurixLineageDirty: false,
    _aurixLineageForBackend: () => null, _aurixPortfolioEpoch: () => 0, _lastStateFlushMs: 0,
    _aurixLastPerfFlushMs: 0, _aurixLastWrittenPerfPayloadHash: null, _aurixPerfWriteAudit: null, _aurixRemotePerformanceState: null,
    render() {},
    inferPriceSource: () => 'api', inferProviderId: a => a.ticker || null,
    __perfRev: 1,
    __returnMismatch: false, __returnNoPs: false,
  };
  ctx._aurixReadPortfolioMeta = () => Object.assign({}, ctx._meta);
  ctx._aurixWritePortfolioMeta = (m) => { ctx._meta = Object.assign({}, m); };
  ctx._aurixMarkSynced = (ms) => { const m = ctx._aurixReadPortfolioMeta(); m.syncedAt = ms || Date.now(); if (!(m.updatedAt > m.syncedAt)) m.updatedAt = m.syncedAt; ctx._aurixWritePortfolioMeta(m); };
  ctx._aurixAssetsForBackend = () => { const c = ctx.convertToNewModel(ctx.assets); return { assets: c.assets, holdings: c.holdings, omit: false, reason: o.reason || 'live-data' }; };
  ctx._aurixComputePerformanceStateCandidate = () => ({ userId: 'u1', lifecycleId: 'L', portfolioRevision: ctx.__perfRev, byRange: { '24h': { performanceHash: 'h' + ctx.__perfRev } } });
  function builder(table) {
    const st = { table, op: 'select', obj: null, single: false };
    const b = {
      select(c) { st.sel = c; return b; }, upsert(x) { st.op = 'upsert'; st.obj = x; return b; }, update(x) { st.op = 'update'; st.obj = x; return b; },
      eq() { return b; }, single() { st.single = true; return b; }, maybeSingle() { st.single = true; return b; },
      then(res, rej) {
        ops.push({ table: st.table, op: st.op, keys: st.obj ? Object.keys(st.obj) : null, sel: st.sel || null });
        if (failNext > 0 && st.op !== 'select') { failNext--; return Promise.resolve({ data: null, error: { message: 'boom' } }).then(res, rej); }
        if (st.op === 'upsert' || st.op === 'update') stored = Object.assign({}, stored, st.obj);
        let row = Object.assign({}, stored);
        if (st.op === 'update' && ctx.__returnNoPs) row = { user_id: 'u1' };
        if (st.op === 'update' && ctx.__returnMismatch && row.performance_state) row.performance_state = Object.assign({}, row.performance_state, { byRange: { '24h': { performanceHash: 'otro' } } });
        return Promise.resolve({ data: st.single ? row : [row], error: null, status: 200 }).then(res, rej);
      },
    };
    return b;
  }
  ctx.supabaseClient = { from: builder };
  ctx.__ops = ops; ctx.__failNext = n => { failNext = n; };
  vm.createContext(ctx);
  for (const c of ['_AURIX_LIVE_PRICE_KEYS', '_AURIX_LIVE_PRICE_PERSIST_MS']) vm.runInContext(constSrc(c), ctx);
  vm.runInContext('var _aurixLastSyncedStructFp = null; var _aurixLastBackendSaveOkAt = 0; var _aurixLastFlushedStateFp = null;', ctx);
  for (const f of ['convertToNewModel', '_aurixContentFingerprint', '_aurixStructuralFingerprint', '_aurixHistoryHash',
                   'autoSaveToBackend', '_flushStatePersistence', '_aurixFlushPerformanceState']) vm.runInContext(fnSrc(f), ctx);
  return ctx;
}
const upserts = ctx => ctx.__ops.filter(x => x.table === 'user_portfolios' && x.op === 'upsert').length;
const run = (ctx, code) => vm.runInContext(code, ctx);

(async () => {
  console.log('AURIX-IDLE-REDUNDANT-WRITES — escrituras redundantes en reposo\n');

  console.log('F — Huellas');
  {
    const c = makeCtx();
    const f = run(c, `[_aurixContentFingerprint('abc'), _aurixContentFingerprint('abc'), _aurixContentFingerprint('abd'), _aurixContentFingerprint('')]`);
    ok('F.1 huella determinista y sensible a un carácter (longitud + 2 hashes)', f[0] === f[1] && f[0] !== f[2] && /^\d+:[0-9a-f]+:[0-9a-f]+$/.test(f[0]), f.join(' '));
    const base = run(c, `(function(){ const m = convertToNewModel(assets); return _aurixStructuralFingerprint(m.assets, m.holdings); })()`);
    const after = (mut) => run(c, `(function(){ const a = JSON.parse(JSON.stringify(assets)); (${mut})(a); const m = convertToNewModel(a); return _aurixStructuralFingerprint(m.assets, m.holdings); })()`);
    ok('F.2 cambiar SÓLO precio/prevPrice/change24h NO cambia la huella estructural',
      after(`a => { a[0].price = 61234; a[0].prevPrice = 60000; a[0].change24h = -3; a[1].price = 401; }`) === base);
    ok('F.3 cantidad, coste, transacciones, identidad, cierre o metadatos SÍ la cambian',
      ['a => { a[0].qty = 0.6; }', 'a => { a[0].costBasis = 1; }', 'a => { a[0].transactions.push({ type: "buy", qty: 1, price: 1, ts: 2 }); }',
       'a => { a[1].marketSymbol = "MSFT.US"; }', 'a => { a[0].name = "X"; }', 'a => { a[0].lifecycleStatus = "closed"; }', 'a => { a.reverse(); }']
        .every(m => after(m) !== base));
    ok('F.4 las únicas claves ignoradas son las tres de mercado en vivo',
      JSON.stringify(run(c, '_AURIX_LIVE_PRICE_KEYS')) === JSON.stringify(['currentPrice', 'prevPrice', 'change24h']) && run(c, '_AURIX_LIVE_PRICE_PERSIST_MS') === 15 * 60 * 1000);
  }

  console.log('\nA — Subida de activos en price-refresh');
  {
    const c = makeCtx();
    await run(c, 'autoSaveToBackend()');
    ok('A.1 la primera subida se hace siempre (fija la línea base)', upserts(c) === 1);
    // Estado que deja un tick sólo de precio: updatedAt > syncedAt, sin mutación real pendiente.
    const synced = c._meta.syncedAt;
    c._meta = Object.assign({}, c._meta, { version: 9, updatedAt: synced + 5000, lastRealMutationAt: synced - 1000 });
    run(c, 'assets[0].price = 61000; assets[0].prevPrice = 60000; assets[0].change24h = 1.7;');
    await run(c, 'autoSaveToBackend()');
    ok('A.2 tick SÓLO de precios dentro de 15 min ⇒ no se sube', upserts(c) === 1);
    ok('A.3 …y la sincronización queda EXACTAMENTE como tras una subida (updatedAt = syncedAt; syncedAt y versión intactos)',
      c._meta.updatedAt === synced && c._meta.syncedAt === synced && c._meta.version === 9, JSON.stringify(c._meta));
    run(c, 'assets[0].qty = 0.75;');
    await run(c, 'autoSaveToBackend()');
    ok('A.4 un cambio REAL (cantidad) se sube aunque llegue por price-refresh', upserts(c) === 2);
    c._meta = Object.assign({}, c._meta, { updatedAt: c._meta.syncedAt + 1, lastRealMutationAt: c._meta.syncedAt + 1 });
    await run(c, 'autoSaveToBackend()');
    ok('A.5 con una mutación real PENDIENTE se sube aunque la huella coincida (como hasta ahora)', upserts(c) === 3);
    run(c, '_aurixLastBackendSaveOkAt = Date.now() - 16 * 60 * 1000;');
    await run(c, 'autoSaveToBackend()');
    ok('A.6 pasados 15 min, un cambio sólo de precios SÍ se sube (respaldo de la captura de servidor)', upserts(c) === 4);
  }
  {
    const c = makeCtx();
    await run(c, 'autoSaveToBackend()');
    c.__failNext(1); run(c, 'assets[0].qty = 0.9;');
    await run(c, 'autoSaveToBackend()');
    ok('A.7 una subida FALLIDA no mueve la línea base…', run(c, '_aurixLastSyncedStructFp') !== run(c, '(function(){ const m = convertToNewModel(assets); return _aurixStructuralFingerprint(m.assets, m.holdings); })()'));
    const n = upserts(c); await run(c, 'autoSaveToBackend()');
    ok('A.8 …así que el siguiente intento vuelve a subir', upserts(c) === n + 1);
  }
  {
    const c = makeCtx({ reason: 'reset' });
    await run(c, 'autoSaveToBackend()'); await run(c, 'autoSaveToBackend()');
    ok('A.9 un guardado que no es live-data (p. ej. reset) nunca se salta', upserts(c) === 2);
  }

  console.log('\nB — Flush al ocultar la pestaña (lifecycle)');
  {
    const c = makeCtx();
    await run(c, `_flushStatePersistence('lifecycle')`);
    const n1 = upserts(c);
    ok('B.1 el primer flush de ciclo de vida escribe', n1 === 1);
    const r = await run(c, `_flushStatePersistence('lifecycle')`);
    ok('B.2 ocultar otra vez con el estado IDÉNTICO ⇒ no se reescribe', upserts(c) === n1 && r === 'skipped-unchanged', r);
    run(c, 'portfolioHistory = portfolioHistory.concat([{ ts: 2, value: 30001 }]);');
    await run(c, `_flushStatePersistence('lifecycle')`);
    ok('B.3 con un punto de historial pendiente SÍ se escribe', upserts(c) === n1 + 1);
    run(c, `getWatchlist = () => ['BTC', 'ETH'];`); await run(c, `_flushStatePersistence('lifecycle')`);
    run(c, `assets[1].qty = 11;`); await run(c, `_flushStatePersistence('lifecycle')`);
    ok('B.4 un cambio de watchlist o de activos también se escribe', upserts(c) === n1 + 3);
    run(c, '_lastStateFlushMs = 0;'); await run(c, `_flushStatePersistence('debounced')`);
    ok('B.5 el flush programado (debounced) no cambia de comportamiento', upserts(c) === n1 + 4);
  }
  {
    const c = makeCtx();
    c.__failNext(2);   // el upsert y su reintento de núcleo fallan
    await run(c, `_flushStatePersistence('lifecycle')`);
    const n = upserts(c);
    await run(c, `_flushStatePersistence('lifecycle')`);
    ok('B.6 si el último flush FALLÓ, ocultar la pestaña vuelve a escribir (no se pierde nada)', upserts(c) > n);
  }

  console.log('\nB2/C — performance_state');
  {
    const c = makeCtx();
    let a = await run(c, `_aurixFlushPerformanceState('lifecycle')`);
    const upd = () => c.__ops.filter(x => x.op === 'update').length, sel = () => c.__ops.filter(x => x.op === 'select' && /performance_state/.test(x.sel || '') && !/user_id/.test(x.sel || '')).length;
    ok('C.1 escritura correcta con fila devuelta coincidente ⇒ SIN relectura extra', a.ok === true && upd() === 1 && sel() === 0 && a.verifyRead && a.verifyRead.source === 'returned-row', JSON.stringify(a.verifyRead));
    ok('C.2 …y lo adoptado es la fila REMOTA devuelta, no el candidato local', run(c, '_aurixRemotePerformanceState && _aurixRemotePerformanceState.byRange["24h"].performanceHash') === 'h1');
    a = await run(c, `_aurixFlushPerformanceState('lifecycle')`);
    ok('B2.1 ocultar la pestaña con performance_state IDÉNTICO ⇒ no se escribe', upd() === 1 && a.failureReason === 'skipped_unchanged_payload');
    run(c, '__perfRev = 2;'); a = await run(c, `_aurixFlushPerformanceState('lifecycle')`);
    ok('B2.2 con un cambio real se escribe al ocultar, aunque no hayan pasado 30 s', upd() === 2 && a.ok === true);
    a = await run(c, `_aurixFlushPerformanceState('perf-now')`);
    ok('B2.3 perf-now sigue forzando la escritura', upd() === 3);
  }
  {
    const c = makeCtx(); c.__returnMismatch = true;
    const a = await run(c, `_aurixFlushPerformanceState('lifecycle')`);
    const sels = c.__ops.filter(x => x.op === 'select').length;
    ok('C.3 si la fila devuelta NO coincide con lo enviado ⇒ se hace VERIFY_READ como siempre', sels === 1 && !(a.verifyRead && a.verifyRead.source === 'returned-row'), JSON.stringify(a.verifyRead));
  }
  {
    const c = makeCtx(); c.__returnNoPs = true;
    const a = await run(c, `_aurixFlushPerformanceState('lifecycle')`);
    ok('C.4 fila devuelta sin performance_state ⇒ fallo explícito, igual que antes', a.ok === false && a.failureReason === 'returned_row_lacks_performance_state');
  }

  console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
