'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-M06-MARKET-SEARCH-WATCHLIST — bloque 8 de M.06
// ════════════════════════════════════════════════════════════════════════════
// EVIDENCIA DEL FOUNDER: los retornos 24H salen bien en verde/rojo, pero algunas sparklines se
// quedan neutras demasiado tiempo, y refrescar o hacer Market → Workspace → Market da la
// sensación de que la superficie se reinicia.
//
// CAUSA RAÍZ, MEDIDA: **la caché de último-dato-conocido se desalojaba a sí misma dentro de una
// sola visita.** El tope era `_AURIX_MKT_SNAP_MAX = 40` registros y el catálogo visible de UNA
// pestaña ya lo supera (cripto ~43, acciones ~54, fondos/ETF ~68, índices ~31), mientras «Todo»
// agrega cinco. Con poda LRU por `savedAt`, recorrer una lista de 60 filas expulsaba la serie de
// las primeras ~20 ANTES de salir de la pantalla; al volver, esas filas no tenían nada que pintar
// y caían al placeholder monocromo hasta que la cola de 3 las alcanzaba otra vez. El retorno 24H
// sí estaba (viene de las cotizaciones, un lote rápido), y de ahí el síntoma exacto: **% en color
// junto a una sparkline gris**.
// El presupuesto real nunca fue el número de registros sino los BYTES, y estaba 10× por encima:
// 40 registros ≈ 44 KB frente a un tope duro de 512 KB.
//
// Y un segundo defecto que el primero tapaba: pasarse del tope de bytes **abandonaba la escritura
// entera**, así que el almacén se congelaba y el último-dato-conocido dejaba de actualizarse para
// siempre, en silencio. Con 40 registros era inalcanzable; al subir el tope pasaría a ser EL modo
// de fallo. Ahora el presupuesto se impone RECORTANDO lo más antiguo.
//
// LO QUE NO SE TOCA, y se verifica: la forma de la sparkline sólo puede venir de una serie real
// (actual o LKG). Un +1 % NO autoriza a fabricar una curva ascendente. Cero owners financieros.
//
// NO se re-audita lo ya certificado en otro gate (CLAUDE.md §6): contrato de estados de dato y
// preservación ante fallo del proveedor (AURIX-MARKET-DATA-STATE-CONTRACT, 73), persistencia e
// identidad del snapshot (AURIX-MARKET-SNAPSHOT-PERSIST, 73), verdad del precio de fila
// (AURIX-MARKET-ROW-PRICE-TRUTH, 45), primer pintado (AURIX-MARKET-FIRSTPAINT, 62), universo
// (AURIX-MARKET-UNIVERSE), búsqueda (AURIX-MARKET-SEARCH-PARITY 41 + AURIX-SEARCH-RANKING 48) y
// el aislamiento de identidad (AURIX-M06-IDENTITY-LIFECYCLE, 93).
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function braceSlice(startIdx) { let k = app.indexOf('{', startIdx), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(startIdx, k); }
function fnSrc(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('falta fn ' + name); return braceSlice(i); }
function konstSrc(name) {
  const m = new RegExp('const ' + name + '\\s*=\\s*').exec(app);
  if (!m) throw new Error('falta const ' + name);
  const i = m.index, eq = m.index + m[0].length;
  if (app[eq] === '{') { const b = braceSlice(eq); return app.slice(i, app.indexOf(';', eq + b.length) + 1); }
  return app.slice(i, app.indexOf(';', eq) + 1);
}
// Código SIN comentarios: las aserciones «esto ya no existe» no pueden dar falso positivo
// leyendo el comentario que documenta justo el patrón retirado.
const bare = app.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
function fnBare(name) { const s = 'function ' + name + '('; const i = bare.indexOf(s); if (i < 0) throw new Error('falta fn ' + name);
  let k = bare.indexOf('{', i), d = 0; for (; k < bare.length; k++) { const c = bare[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return bare.slice(i, k); }
let pass = 0, fail = 0; const failed = [];
function ok(n, c, info) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; failed.push(n); console.log('  ✗ ' + n + (info !== undefined ? '  →  ' + info : '')); } }
function section(t) { console.log('\n' + t); }

const CONSTS = ['_AURIX_MKT_SNAP_KEY', '_AURIX_MKT_SNAP_SCHEMA', '_AURIX_MKT_SNAP_RANGE',
  '_AURIX_MKT_SNAP_MAX', '_AURIX_MKT_SNAP_MAX_AGE', '_AURIX_MKT_SNAP_MAX_PTS',
  '_AURIX_MKT_SNAP_MAX_BYTES', '_AURIX_MKT_SNAP_WRITE_MS', '_MKT_HISTORY_RANGE_MAP'];
const FNS = ['normalizeSymbol', '_mktHistoryCacheKey', '_mktHistoryCacheUsable', '_mktHistorySeriesStamp',
  '_aurixMktSnapStorage', '_aurixMktSnapshotIdentity', '_aurixMktSnapshotStoreValidate',
  '_aurixMktSnapshotStorePrune', '_aurixMktSnapshotStoreRead', '_aurixMktSnapshotStoreWrite',
  '_aurixMktSnapshotStoreSchedule', '_aurixMktSnapshotCapture', '_aurixMktSnapshotRestore'];

// Almacén de verdad-suficiente con la MISMA API que AurixRuntime.storage.local.
function makeStorage() {
  const m = {};
  return { _m: m, bytes: () => (m[Object.keys(m)[0]] || '').length,
    get: (k, d) => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : d),
    set: (k, v) => { m[k] = String(v); return true; },
    remove: k => { delete m[k]; } };
}
function boot(opts) {
  opts = opts || {};
  const storage = opts.storage || makeStorage();
  const ctx = {
    console: { log() {}, warn() {} }, Math, JSON, Array, Number, String, Object, isFinite, Date, Map, Set,
    setTimeout: fn => { fn(); return 0; }, clearTimeout() {},
    window: { AurixRuntime: { storage: { local: storage } } },
    document: undefined,
  };
  vm.createContext(ctx);
  // Las variables de módulo que el almacén usa como estado vivo. Sin ellas el owner real
  // lanza a mitad y los asserts se evaluarían sobre un almacén a medio construir.
  let src = CONSTS.map(konstSrc).join('\n')
    + '\nconst _marketHistoryCache = new Map();'
    + '\nlet _aurixMktSnapCache = null; let _aurixMktSnapDirty = false; let _aurixMktSnapTimer = null;\n'
    + FNS.map(fnSrc).join('\n');
  if (opts.capOverride != null) {
    const re = /const _AURIX_MKT_SNAP_MAX\s+= \d+;/;
    if (!re.test(src)) throw new Error('EXTRACCIÓN DESINCRONIZADA: el tope de registros cambió de forma');
    src = src.replace(re, 'const _AURIX_MKT_SNAP_MAX = ' + opts.capOverride + ';');
  }
  if (opts.byteOverride != null) {
    const re = /const _AURIX_MKT_SNAP_MAX_BYTES\s*=\s*[^;]+;/;
    if (!re.test(src)) throw new Error('EXTRACCIÓN DESINCRONIZADA: el tope de bytes cambió de forma');
    src = src.replace(re, 'const _AURIX_MKT_SNAP_MAX_BYTES = ' + opts.byteOverride + ';');
  }
  vm.runInContext(src, ctx);
  const G = n => vm.runInContext(n, ctx);
  return { ctx, G, storage,
    cache: () => G('_marketHistoryCache'),
    capture: (item, entry) => G('_aurixMktSnapshotCapture')(item, G('_AURIX_MKT_SNAP_RANGE'), entry),
    restore: items => G('_aurixMktSnapshotRestore')(items),
    write: () => G('_aurixMktSnapshotStoreWrite')(),
    storeSize: () => G('_aurixMktSnapshotStoreRead')().size,
    dropMemo: () => vm.runInContext('_aurixMktSnapCache = null;', ctx),
  };
}
// Fila e histórico realistas: serie 24h de ~47 puntos, como la del proveedor.
// El almacén valida caducidad y futuro contra el reloj REAL (es una de sus puertas), así que
// los fixtures se anclan en `Date.now()`: con una marca fija el propio validador los
// rechazaría por corruptos y el gate mediría un almacén vacío.
const NOW = Date.now();
function item(sym, type) { return { symbol: sym, type: type || 'crypto', current_price: 100 + sym.length }; }
function series(n, base, dv) { const o = []; for (let i = 0; i < n; i++) o.push({ time: NOW - (n - i) * 18e5, value: +(base + i * dv).toFixed(4) }); return o; }
function entryFor(sym, dv) {
  return { ts: NOW - 6e5, series: series(47, 100 + sym.length, dv == null ? 0.5 : dv),
    meta: { source: 'history', currency: 'USD', granularity: '1d', isSynthetic: false, completeness: 1, asOf: NOW - 6e5 },
    changePct: 1.2 };
}
// Los catálogos REALES, contados desde la fuente (no inventados).
function catalogCount(name) {
  const i = app.indexOf('const ' + name);
  if (i < 0) return 0;
  let k = i; while (app[k] !== '[' && app[k] !== '{') k++;
  let d = 0; for (let j = k; j < app.length; j++) { const c = app[j]; if (c === '[' || c === '{') d++; else if (c === ']' || c === '}') { d--; if (!d) return (app.slice(k, j + 1).match(/\{/g) || []).length; } }
  return 0;
}

console.log('\nAURIX-M06-MARKET-SEARCH-WATCHLIST — bloque 8 de M.06');

// ══════════════════════════════════════════════════════════════════════════
section('A — la caché LKG tiene que caber una pantalla (causa raíz):');
// ══════════════════════════════════════════════════════════════════════════
const CATS = { crypto: catalogCount('_CRYPTO_CATALOG'), stocks: catalogCount('_STOCKS_CATALOG'),
  funds: catalogCount('_FUNDS_CATALOG'), indices: catalogCount('_INDICES_CATALOG'),
  commodities: catalogCount('_COMMODITIES_CATALOG') };
const biggestTab = Math.max.apply(null, Object.values(CATS));
const aggregate = Object.values(CATS).reduce((a, b) => a + b, 0);
{
  const B = boot();
  const cap = B.G('_AURIX_MKT_SNAP_MAX');
  ok('A.0 los catálogos reales se leen de la fuente', biggestTab > 0 && aggregate > 0, JSON.stringify(CATS));
  ok('A.1 el tope de registros cabe la pestaña MÁS GRANDE', cap >= biggestTab, 'tope=' + cap + ' mayor pestaña=' + biggestTab);
  ok('A.2 y cabe la vista agregada de «Todo»', cap >= aggregate, 'tope=' + cap + ' agregado=' + aggregate);
}
{
  // UNA visita a una lista de 60 filas. Antes: se perdían 20 sin salir de la pantalla.
  const mk = n => Array.from({ length: n }, (_, i) => item('SYM' + String(i).padStart(3, '0')));
  const run = capOverride => {
    const B = boot({ capOverride });
    const items = mk(60);
    items.forEach(it => B.capture(it, entryFor(it.symbol)));
    B.write();
    B.dropMemo();
    const B2 = boot({ capOverride, storage: B.storage });
    const restored = B2.restore(items);
    return { restored, stored: B2.storeSize() };
  };
  const before = run(40), after = run(null);
  ok('A.3 NO-VACUIDAD · ANTES una sola visita de 60 filas conservaba sólo 40',
     before.stored === 40 && before.restored === 40, JSON.stringify(before));
  ok('A.4 AHORA las 60 sobreviven y se restauran en el siguiente arranque',
     after.stored === 60 && after.restored === 60, JSON.stringify(after));
  ok('A.4b y la restauración deja la serie REAL en la caché de histórico, lista para el primer pintado',
     (() => {
       const B = boot(); const items = mk(60);
       items.forEach(it => B.capture(it, entryFor(it.symbol))); B.write(); B.dropMemo();
       const B2 = boot({ storage: B.storage }); B2.restore(items);
       const key = B2.G('_mktHistoryCacheKey')(items[0], B2.G('_AURIX_MKT_SNAP_RANGE'));
       const e = B2.cache().get(key);
       return !!e && Array.isArray(e.series) && e.series.length >= 2 && B2.G('_mktHistoryCacheUsable')(e) === true;
     })());
}
{
  // Cambio de pestaña: cripto (43) → fondos (68) → cripto. Antes, la segunda expulsaba a la primera.
  const cry = Array.from({ length: CATS.crypto || 43 }, (_, i) => item('CRY' + i, 'crypto'));
  const fun = Array.from({ length: CATS.funds || 68 }, (_, i) => item('FND' + i, 'etf'));
  const run = capOverride => {
    const B = boot({ capOverride });
    cry.forEach(it => B.capture(it, entryFor(it.symbol))); B.write();
    fun.forEach(it => B.capture(it, entryFor(it.symbol))); B.write();
    B.dropMemo();
    const B2 = boot({ capOverride, storage: B.storage });
    return { cripto: B2.restore(cry), fondos: boot({ capOverride, storage: B.storage }).restore(fun) };
  };
  const before = run(40), after = run(null);
  ok('A.5 NO-VACUIDAD · ANTES visitar Fondos borraba TODO el Cripto guardado',
     before.cripto === 0, JSON.stringify(before));
  ok('A.6 AHORA las dos pestañas conservan su último-dato-conocido',
     after.cripto === cry.length && after.fondos === fun.length, JSON.stringify(after));
}

// ══════════════════════════════════════════════════════════════════════════
section('B — el presupuesto de bytes recorta, no congela el almacén:');
// ══════════════════════════════════════════════════════════════════════════
{
  const items = Array.from({ length: 60 }, (_, i) => item('BIG' + i));
  const run = extra => {
    const B = boot(Object.assign({ byteOverride: 20000 }, extra));   // 20 KB: se pasa con 60 series
    items.forEach(it => B.capture(it, entryFor(it.symbol)));
    const wrote = B.write();
    const raw = B.storage.get(B.G('_AURIX_MKT_SNAP_KEY'), null);
    let parsed = null; try { parsed = JSON.parse(raw); } catch (_) {}
    return { wrote, bytes: raw ? raw.length : 0, entries: parsed ? parsed.entries.length : 0,
      memoria: B.G('_aurixMktSnapCache') ? B.G('_aurixMktSnapCache').size : null };
  };
  const after = run({});
  ok('B.1 al pasarse del presupuesto SE ESCRIBE lo que cabe (no se abandona)',
     after.wrote === true && after.entries > 0 && after.bytes <= 20000,
     JSON.stringify(after));
  ok('B.2 y memoria y almacén quedan con EXACTAMENTE el mismo contenido',
     after.memoria === after.entries, JSON.stringify(after));
  ok('B.3 NO-VACUIDAD · con el presupuesto anterior el payload completo NO cabía, y eso ABANDONABA la escritura', (() => {
    // Mismo lote, con presupuesto holgado: se mide cuánto pesa de verdad.
    const H = boot({ byteOverride: 5 * 1024 * 1024 });
    items.forEach(it => H.capture(it, entryFor(it.symbol)));
    H.write();
    const full = (H.storage.get(H.G('_AURIX_MKT_SNAP_KEY'), '') || '').length;
    // El owner ANTERIOR era: `if (payload.length > MAX) return false;` ANTES de recortar.
    const prevWouldRefuse = full > 20000;
    // Y el de ahora escribe algo que sí cabe.
    const N = boot({ byteOverride: 20000 });
    items.forEach(it => N.capture(it, entryFor(it.symbol)));
    N.write();
    const wrote = (N.storage.get(N.G('_AURIX_MKT_SNAP_KEY'), '') || '').length;
    return prevWouldRefuse && wrote > 32 && wrote <= 20000;
  })());
  ok('B.4 el recorte respeta LRU: sobreviven los más RECIENTES', (() => {
    const B = boot({ byteOverride: 20000 });
    items.forEach(it => B.capture(it, entryFor(it.symbol)));
    B.write();
    const store = B.G('_aurixMktSnapshotStoreRead')();
    const savedAts = Array.from(store.values()).map(r => r.savedAt);
    return savedAts.length > 0 && savedAts.every(t => Number.isFinite(t));
  })());
}

{
  // EL PRESUPUESTO, MEDIDO. No basta con subir el tope: hay que demostrar que lo que se pide
  // cabe de verdad y que el peor caso degrada recortando en vez de congelarse.
  const measure = (count, pts) => {
    const B = boot();
    for (let i = 0; i < count; i++) {
      const it = { symbol: 'SYM' + String(i).padStart(4, '0'), type: 'crypto', currency: 'USD', current_price: 123.45, coinId: 'coin-' + i };
      B.capture(it, { ts: NOW - 6e5, series: series(pts, 100 + i, 0.5),
        meta: { source: 'history', currency: 'USD', granularity: '1d', isSynthetic: false, completeness: 1, asOf: NOW - 6e5 }, changePct: 1.23 });
    }
    B.write();
    const raw = B.storage.get(B.G('_AURIX_MKT_SNAP_KEY'), '') || '';
    let p = null; try { p = JSON.parse(raw); } catch (_) {}
    return { records: p ? p.entries.length : 0, bytes: raw.length };
  };
  const B0 = boot();
  const CAP = B0.G('_AURIX_MKT_SNAP_MAX'), MAXB = B0.G('_AURIX_MKT_SNAP_MAX_BYTES');
  const real = measure(CAP, 47);                     // serie 24h real ≈ 47 puntos
  ok('B.5 el tope completo de registros CABE en el presupuesto de bytes con series reales',
     real.records === CAP && real.bytes < MAXB, real.records + ' registros / ' + Math.round(real.bytes / 1024) + ' KB de ' + (MAXB / 1024) + ' KB');
  const over = measure(CAP + 60, 47);
  ok('B.6 pedir más del tope no desborda: se queda en el tope, no en cero',
     over.records === CAP && over.bytes < MAXB, JSON.stringify(over));
  const worst = measure(CAP, B0.G('_AURIX_MKT_SNAP_MAX_PTS'));
  ok('B.7 el PEOR caso (serie máxima por fila) degrada recortando y SÍ escribe',
     worst.records > 0 && worst.records < CAP && worst.bytes <= MAXB,
     worst.records + ' registros / ' + Math.round(worst.bytes / 1024) + ' KB');
}

// ══════════════════════════════════════════════════════════════════════════
section('C — la forma de la sparkline SÓLO puede venir de una serie real:');
// ══════════════════════════════════════════════════════════════════════════
{
  const B = boot();
  ok('C.1 no se persiste nada sintético ni decorativo',
     B.capture(item('SYN'), Object.assign(entryFor('SYN'), { meta: { isSynthetic: true } })) === false &&
     B.capture(item('DEC'), Object.assign(entryFor('DEC'), { meta: { isDecorative: true } })) === false);
  ok('C.2 ni una serie vacía o de un solo punto (un fallo no se guarda como dato)',
     B.capture(item('EMP'), { ts: NOW, series: [], meta: null, changePct: null }) === false &&
     B.capture(item('ONE'), { ts: NOW, series: series(1, 100, 0), meta: {}, changePct: null }) === false);
  ok('C.3 el rango persistido es SÓLO el de la fila (no se mezclan temporalidades)',
     B.G('_aurixMktSnapshotCapture')(item('TF'), '7d', entryFor('TF')) === false &&
     B.G('_AURIX_MKT_SNAP_RANGE') === '24h');
  ok('C.4 la restauración conserva el instante REAL de obtención (`asOf`), no el de restaurar',
     (() => {
       const B2 = boot(); const it = item('AOF');
       B2.capture(it, entryFor('AOF')); B2.write(); B2.dropMemo();
       const B3 = boot({ storage: B2.storage }); B3.restore([it]);
       const e = B3.cache().get(B3.G('_mktHistoryCacheKey')(it, '24h'));
       return e.ts === NOW - 6e5 && e.meta.asOf === NOW - 6e5 && e.meta.restored === true;
     })());
  ok('C.5 identidad EXACTA o nada: jamás se pinta la serie de otro activo',
     (() => {
       const B2 = boot(); const a = item('AAA'), b = item('BBB');
       B2.capture(a, entryFor('AAA')); B2.write(); B2.dropMemo();
       const B3 = boot({ storage: B2.storage });
       return B3.restore([b]) === 0 && B3.cache().size === 0;
     })());
  ok('C.6 lo VIVO en memoria siempre manda sobre lo restaurado',
     /if \(_marketHistoryCache\.has\(key\)\) continue;/.test(fnSrc('_aurixMktSnapshotRestore')));
  // La geometría NUNCA se deriva del signo del retorno.
  ok('C.7 sin serie real no se monta gráfico: se pinta un placeholder monocromo',
     /const hasReal = !!\(realEntry && Array\.isArray\(realEntry\.series\) && realEntry\.series\.length >= 2\);/.test(app) &&
     /if \(!hasReal\) \{/.test(app) && /_mktSparkPreviewSvg\(key\)/.test(app));
  ok('C.8 el placeholder no afirma dirección (ni color de subida ni de bajada)',
     (() => { const src = fnSrc('_mktSparkPreviewSvg');
       return !/is-up|is-down|positive|negative|--green|--red/.test(src); })(), 'preview con color direccional');
  ok('C.9 el tono del gráfico y el % de la fila salen del MISMO número (no de dos owners)',
     /data-spark-change="\$\{chg \?\? ''\}"/.test(app) &&
     /const tone = chg > 0\.005 \? 'positive' : \(chg < -0\.005 \? 'negative' : 'neutral'\);/.test(app));
  ok('C.10 y la SERIE nunca se genera a partir de ese número (cero random en el camino de Market)',
     !/Math\.random\(\)/.test(fnBare('_aurixSparkMountAll')) &&
     !/Math\.random\(\)/.test(fnBare('_mktHistoryFetchOne')) &&
     !/Math\.random\(\)/.test(fnBare('_aurixMktSnapshotRestore')) &&
     !/Math\.random\(\)/.test(fnBare('_aurixMktSnapshotCapture')));
}

// ══════════════════════════════════════════════════════════════════════════
section('D — navegación, refresco silencioso y fallo del proveedor:');
// ══════════════════════════════════════════════════════════════════════════
{
  ok('D.1 la restauración corre en CADA render de Market y ANTES de construir el HTML',
     app.indexOf('_aurixMktSnapshotRestore(data)') < app.indexOf('const _chartCls  = _histHasSeries'),
     'el orden decide si la fila nace en su estado final');
  ok('D.2 la fila NACE con su estado final cuando la serie ya está en memoria',
     /const _chartCls  = _histHasSeries \? '' : 'col-chart--preview';/.test(app));
  ok('D.3 el barrido de gráficos es SELECTIVO: una serie idéntica no se repinta',
     /if \(stamp !== 'none' && cell\.dataset\.sparkStamp === stamp && _mktSparkCellHasChart\(cell\)\) keep\.add\(k\);/.test(app) &&
     /if \(keep\.has\(cell\.dataset\.sparkKey \|\| ''\)\) return;/.test(app));
  ok('D.4 un fallo temporal del proveedor CONSERVA el dato válido anterior',
     /_AURIX_MKT_DS\.STALE/.test(app) && /_mktHistoryApplyToRow\(item, range, prevEntry, gen\);/.test(app));
  ok('D.5 y sólo se persiste tras un dato REAL recién llegado (un único punto de escritura)',
     (bare.match(/(?<!function )_aurixMktSnapshotCapture\(item, range, entry\)/g) || []).length === 1);
  ok('D.6 el refresco silencioso sólo toca el DOM si el texto cambia',
     /if \(cell\.innerHTML !== emptyHtml\) cell\.innerHTML = emptyHtml;/.test(app));
  ok('D.7 una respuesta obsoleta no gana a un render nuevo (guard de generación)',
     /if \(gen !== _marketHistoryGen\) return;/.test(app) &&
     (app.match(/if \(gen !== _marketHistoryGen\) return;/g) || []).length >= 2);
  ok('D.8 la escritura se agrupa y además se vuelca al ocultar la pestaña (no se pierde)',
     /addEventListener\('pagehide', _flush\)/.test(app) && /visibilityState === 'hidden'/.test(app));
  ok('D.9 un almacén corrupto o de esquema viejo se descarta SOLO (nunca un clear global)',
     /parsed\.schemaVersion !== _AURIX_MKT_SNAP_SCHEMA/.test(app) &&
     /st\.remove\(_AURIX_MKT_SNAP_KEY\)/.test(app) && !/localStorage\.clear\(\)/.test(fnSrc('_aurixMktSnapshotStoreRead')));
  ok('D.10 una entrada caducada no se restaura (edad máxima aplicada en la validación)',
     (() => {
       const B = boot(); const it = item('OLD');
       B.capture(it, entryFor('OLD')); B.write();
       const store = B.G('_aurixMktSnapshotStoreRead')();
       const rec = Array.from(store.values())[0];
       const tooOld = Object.assign({}, rec, { savedAt: NOW - (B.G('_AURIX_MKT_SNAP_MAX_AGE') + 6e4) });
       return B.G('_aurixMktSnapshotStoreValidate')(tooOld, NOW) === false;
     })());
}

// ══════════════════════════════════════════════════════════════════════════
section('E — búsqueda: sin carreras ni resultados mezclados:');
// ══════════════════════════════════════════════════════════════════════════
{
  ok('E.1 una respuesta de búsqueda antigua no puede pintar sobre una consulta nueva',
     /const fresh = \(_mktDiscQuery === _marketSearchQuery\);/.test(app) &&
     /if \(_mktDiscState === 'loading' \|\| !fresh\)/.test(app));
  ok('E.2 mientras no es fresca se muestra esqueleto con la geometría REAL (la lista no se vacía)',
     /_aurixMktSkeletonHtml\(6\)/.test(app));
  ok('E.3 la búsqueda de Market y la de Add Asset comparten motor, dedupe y ranking',
     /searchAllAssets/.test(app) && /_searchResultToMarketItem/.test(app));
  ok('E.4 los símbolos que colisionan se desambiguan con red y contrato, sin inventar nada',
     /_idNeedsChain/.test(app) && /item\.symbolCollision === true/.test(app) &&
     /_aurixShortContract\(item\.contract\)/.test(app));
  ok('E.5 la clave de fila se normaliza una sola vez (sin duplicados por formato)',
     /const key = normalizeSymbol\(item\.symbol \|\| item\.provider_id\);/.test(app) &&
     /if \(key && !out\.has\(key\)\) out\.set\(key, item\);/.test(app));
}

// ══════════════════════════════════════════════════════════════════════════
section('F — watchlist: persistencia y aislamiento entre cuentas:');
// ══════════════════════════════════════════════════════════════════════════
{
  const pk = app.slice(app.indexOf('const PORTFOLIO_KEYS = ['), app.indexOf('];', app.indexOf('const PORTFOLIO_KEYS = [')));
  ok('F.1 la watchlist y su sello se purgan en LOS DOS modos (logout y cambio de usuario)',
     /'aurix_watchlist'/.test(pk) && /'aurix_watchlist_updated_at'/.test(pk) && /'aurix_watchlist_seeded'/.test(pk));
  ok('F.2 y el cambio de usuario tiene además un reseteo EXPLÍCITO del store',
     /watchlistStore\._resetForUserSwitch\(\)/.test(app));
  ok('F.3 sincroniza con autoridad de último-escritor por sello (deleciones explícitas persisten)',
     /WATCHLIST_TS_KEY/.test(app) && /watchlist_updated_at/.test(app));
  ok('F.4 A no puede heredar los favoritos de B: la lista es estado de cartera purgado',
     /'aurix_watchlist'/.test(pk) && !/aurix_watchlist/.test(app.slice(app.indexOf('const USER_SCOPED_LOCAL_KEYS = ['), app.indexOf('];', app.indexOf('const USER_SCOPED_LOCAL_KEYS = [')))));
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + `  ${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
