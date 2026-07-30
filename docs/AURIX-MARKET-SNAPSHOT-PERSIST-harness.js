'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MARKET-SNAPSHOT-PERSIST-harness — SPEC MARKET SNAPSHOTS PERSISTENTES (P1)
// ════════════════════════════════════════════════════════════════════════════
// P0 dejó la fila atómica siempre que hubiera algo en memoria. Este owner persiste
// la serie REAL ya descargada para que la PRIMERA entrada de la siguiente sesión
// pinte igual de rápido. Es stale-while-revalidate: lo persistido sirve para
// PINTAR, nunca para evitar la actualización.
//
// Se EJECUTAN las funciones reales del bundle contra un localStorage simulado y
// contra entradas hostiles (corruptas, sintéticas, futuras, de otro listing).
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const appCode = app.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
  .map(l => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra !== undefined ? '  → ' + extra : '')); } }
console.log('AURIX-MARKET-SNAPSHOT-PERSIST — SPEC MARKET SNAPSHOTS PERSISTENTES\n');

function fnSource(name) {
  const i = app.indexOf('function ' + name + '(');
  if (i < 0) return null;
  let d = 0, s = false;
  for (let k = i; k < app.length; k++) {
    if (app[k] === '{') { d++; s = true; } else if (app[k] === '}') { d--; if (s && !d) return app.slice(i, k + 1); }
  }
  return null;
}
// Las declaraciones del owner van alineadas con varios espacios antes del `=`.
function constLine(name) { const m = new RegExp('^const ' + name + '\\s*=\\s*.*$', 'm').exec(app); return m ? m[0] : null; }

const FNS = ['_aurixMktSnapStorage', '_aurixMktSnapshotIdentity', '_aurixMktSnapshotStoreValidate',
  '_aurixMktSnapshotStorePrune', '_aurixMktSnapshotStoreRead', '_aurixMktSnapshotStoreWrite',
  '_aurixMktSnapshotStoreSchedule', '_aurixMktSnapshotCapture', '_aurixMktSnapshotRestore',
  '_mktHistorySeriesStamp', '_mktHistoryCacheKey', '_mktHistoryCacheFresh', '_mktHistoryCacheUsable',
  'normalizeSymbol'];
const CONSTS = ['_AURIX_MKT_SNAP_KEY', '_AURIX_MKT_SNAP_SCHEMA', '_AURIX_MKT_SNAP_RANGE',
  '_AURIX_MKT_SNAP_MAX', '_AURIX_MKT_SNAP_MAX_AGE', '_AURIX_MKT_SNAP_MAX_PTS',
  '_AURIX_MKT_SNAP_MAX_BYTES', '_AURIX_MKT_SNAP_WRITE_MS'];
const missingFn = FNS.filter(n => !fnSource(n)), missingC = CONSTS.filter(n => !constLine(n));
ok('0.1 el owner es un bloque único y extraíble del bundle', !missingFn.length && !missingC.length, missingFn.concat(missingC).join(','));

// ── sandbox: localStorage simulado + reloj controlado ───────────────────────
let LS = {}, throwOnSet = false;
const mkSandbox = () => {
  const sb = {
    console, JSON, Math, Number, Array, Object, String, isNaN, parseInt, parseFloat, Infinity,
    _MKT_HISTORY_RANGE_MAP: { '24H': '24h', '7D': '7d', '1M': '30d', '1Y': '1y', 'ALL': 'all' },
    _MKT_HISTORY_TTL: { '24h': 60000, '7d': 300000, '30d': 1800000, '1y': 21600000, 'all': 86400000 },
    _marketHistoryCache: new Map(),
    setTimeout: (f) => { try { f(); } catch (_) {} return 1; },   // debounce ejecutado en el acto
    clearTimeout: () => {},
    Date,
  };
  // Estado `let` del owner (no son funciones ni consts, pero las funciones lo mutan).
  sb._aurixMktSnapCache = null; sb._aurixMktSnapDirty = false; sb._aurixMktSnapTimer = null;
  sb.window = sb; sb.globalThis = sb; sb.document = undefined;
  sb.window.AurixRuntime = {
    storage: { local: {
      get: (k, f) => (Object.prototype.hasOwnProperty.call(LS, k) ? LS[k] : (f === undefined ? null : f)),
      set: (k, v) => { if (throwOnSet) return false; LS[k] = String(v); return true; },
      remove: (k) => { delete LS[k]; return true; },
    } },
  };
  vm.createContext(sb);
  vm.runInContext(CONSTS.map(constLine).join('\n') + '\n' + FNS.map(fnSource).join('\n'), sb);
  return sb;
};

// `const` declarado dentro de runInContext vive en el ÁMBITO LÉXICO del contexto, no como
// propiedad del sandbox: hay que evaluarlo dentro para leerlo desde aquí.
const cval = (sb, name) => vm.runInContext(name, sb);
const NOW = Date.now();
const series = (n, base) => Array.from({ length: n }, (_, i) => ({ time: NOW - (n - i) * 300000, value: base + i }));
const ITEM = { symbol: 'AAPL', type: 'stock', exchange: 'NASDAQ', currency: 'USD', current_price: 190.5 };
const ENTRY = () => ({ ts: NOW - 3600000, series: series(47, 100), meta: { source: 'yahoo', currency: 'USD', granularity: '5m', isSynthetic: false, completeness: 0.49, asOf: NOW - 3600000 }, changePct: 1.5 });

// ── 1. Identidad canónica y colisiones ──────────────────────────────────────
console.log('1 — Identidad canónica (normalizeSymbol es LOSSY y no puede gobernar sola):');
{
  const S = mkSandbox();
  ok('1.1 normalizeSymbol pierde información (por eso hace falta identidad propia)',
     S.normalizeSymbol('BRK.B') === 'BRK' && S.normalizeSymbol('AAPL.MX') === 'AAPL');
  const id = S._aurixMktSnapshotIdentity;
  ok('1.2 BRK.B y BRK no comparten identidad', id({ symbol: 'BRK.B', type: 'stock' }) !== id({ symbol: 'BRK', type: 'stock' }));
  ok('1.3 el mismo ticker en exchanges distintos no colisiona',
     id({ symbol: 'AAPL', type: 'stock', exchange: 'NASDAQ' }) !== id({ symbol: 'AAPL', type: 'stock', exchange: 'MEX' }));
  ok('1.4 crypto y stock con símbolo coincidente no colisionan',
     id({ symbol: 'BTC', type: 'crypto' }) !== id({ symbol: 'BTC', type: 'stock' }));
  ok('1.5 clases distintas de ETF/fondo (ISIN) no colisionan',
     id({ symbol: 'IWDA', type: 'etf', isin: 'IE00B4L5Y983' }) !== id({ symbol: 'IWDA', type: 'etf', isin: 'IE00BK5BQT80' }));
  ok('1.6 divisas distintas del mismo listing no colisionan',
     id({ symbol: 'VWCE', type: 'etf', currency: 'EUR' }) !== id({ symbol: 'VWCE', type: 'etf', currency: 'USD' }));
  ok('1.7 sin símbolo no hay identidad (no se persiste basura)', id({}) === '' && id(null) === '');
  ok('1.8 la identidad es estable entre llamadas', id(ITEM) === id(Object.assign({}, ITEM)));
}

// ── 2. Escritura: sólo dato real, sólo si aporta diferencia ─────────────────
console.log('\n2 — Escritura (sólo snapshots reales, sólo ante diferencia):');
{
  LS = {}; throwOnSet = false;
  const S = mkSandbox();
  ok('2.1 un snapshot real se serializa y persiste', S._aurixMktSnapshotCapture(ITEM, '24h', ENTRY()) === true);
  const raw = LS['aurix.market.snapshots.v1'];
  ok('2.2 se escribe bajo la clave propia versionada', typeof raw === 'string' && raw.length > 100);
  const parsed = JSON.parse(raw || '{}');
  ok('2.3 el payload declara schemaVersion', parsed.schemaVersion === 1 && Array.isArray(parsed.entries) && parsed.entries.length === 1);
  ok('2.4 una repetición idéntica NO reescribe', S._aurixMktSnapshotCapture(ITEM, '24h', ENTRY()) === false);
  const e2 = ENTRY(); e2.series = series(47, 200);
  ok('2.5 una serie distinta SÍ se persiste', S._aurixMktSnapshotCapture(ITEM, '24h', e2) === true);
  ok('2.6 un rango que no es el de la fila NO se persiste (nada de 7d/30d/1y/all)',
     S._aurixMktSnapshotCapture(ITEM, '7d', ENTRY()) === false && S._aurixMktSnapshotCapture(ITEM, '1y', ENTRY()) === false);
  ok('2.7 un resultado vacío/de error NO se persiste',
     S._aurixMktSnapshotCapture(ITEM, '24h', { ts: NOW, series: [], meta: null, changePct: null }) === false);
  const syn = ENTRY(); syn.meta.isSynthetic = true;
  ok('2.8 un snapshot sintético se RECHAZA', S._aurixMktSnapshotCapture(ITEM, '24h', syn) === false);
  const dec = ENTRY(); dec.meta.isDecorative = true;
  ok('2.9 un snapshot decorativo se RECHAZA', S._aurixMktSnapshotCapture(ITEM, '24h', dec) === false);
  ok('2.10 un fallo de storage no rompe nada', (() => { throwOnSet = true; const r = S._aurixMktSnapshotCapture({ symbol: 'MSFT', type: 'stock' }, '24h', ENTRY()); throwOnSet = false; return r === true; })());
}

// ── 3. asOf se conserva; savedAt es un campo APARTE ─────────────────────────
console.log('\n3 — Honestidad temporal (asOf original, nunca Date.now()):');
{
  LS = {}; const S = mkSandbox();
  const e = ENTRY(); const originalAsOf = e.meta.asOf;
  S._aurixMktSnapshotCapture(ITEM, '24h', e);
  const rec = JSON.parse(LS['aurix.market.snapshots.v1']).entries[0];
  ok('3.1 asOf persistido == asOf original del dato', rec.asOf === originalAsOf, rec.asOf + ' vs ' + originalAsOf);
  ok('3.2 savedAt es un campo distinto y posterior', rec.savedAt !== rec.asOf && rec.savedAt >= originalAsOf);
  ok('3.3 savedAt NO sustituye a asOf', rec.asOf < NOW - 3000000);
  ok('3.4 el registro se declara no sintético', rec.isSynthetic === false && rec.source === 'yahoo');
  // La restauración devuelve el ts ORIGINAL a la caché: por eso queda usable-pero-no-fresca.
  const S2 = mkSandbox();
  S2._aurixMktSnapshotRestore([ITEM]);
  const hydrated = S2._marketHistoryCache.get('AAPL|24h');
  ok('3.5 la caché se hidrata con el ts ORIGINAL, no con el de restauración', !!hydrated && hydrated.ts === originalAsOf);
  ok('3.6 el meta restaurado conserva asOf y se marca como restaurado',
     !!hydrated && hydrated.meta.asOf === originalAsOf && hydrated.meta.restored === true && hydrated.meta.isSynthetic === false);
  ok('3.7 lo restaurado es USABLE pero NO fresco ⇒ pinta ya y se refresca solo',
     S2._mktHistoryCacheUsable(hydrated) === true && S2._mktHistoryCacheFresh(hydrated, '24h') === false);
}

// ── 4. Restauración e identidad: nunca el listing de otro ───────────────────
console.log('\n4 — Restauración sólo con identidad EXACTA:');
{
  LS = {}; const S = mkSandbox();
  S._aurixMktSnapshotCapture(ITEM, '24h', ENTRY());
  const S2 = mkSandbox();
  ok('4.1 el mismo activo se restaura', S2._aurixMktSnapshotRestore([ITEM]) === 1);
  const S3 = mkSandbox();
  ok('4.2 el mismo ticker en otro exchange NO se restaura',
     S3._aurixMktSnapshotRestore([{ symbol: 'AAPL', type: 'stock', exchange: 'MEX', currency: 'USD' }]) === 0);
  const S4 = mkSandbox();
  ok('4.3 el mismo ticker con otro tipo de activo NO se restaura',
     S4._aurixMktSnapshotRestore([{ symbol: 'AAPL', type: 'crypto', exchange: 'NASDAQ', currency: 'USD' }]) === 0);
  const S5 = mkSandbox();
  S5._marketHistoryCache.set('AAPL|24h', { ts: NOW, series: series(5, 1), meta: {}, changePct: 9 });
  ok('4.4 lo que ya está vivo en memoria manda sobre lo persistido', S5._aurixMktSnapshotRestore([ITEM]) === 0);
  const S6 = mkSandbox();
  ok('4.5 restaurar sin dataset no hace nada', S6._aurixMktSnapshotRestore([]) === 0 && S6._aurixMktSnapshotRestore(null) === 0);
}

// ── 5. Entradas hostiles: se descarta SÓLO la mala ──────────────────────────
console.log('\n5 — Corrupción: se descarta la entrada, no el resto ni el arranque:');
{
  const good = (() => { LS = {}; const S = mkSandbox(); S._aurixMktSnapshotCapture(ITEM, '24h', ENTRY()); return JSON.parse(LS['aurix.market.snapshots.v1']).entries[0]; })();
  const withBad = (mutate) => { const bad = JSON.parse(JSON.stringify(good)); bad.identityKey = 'v1|stock|||||USD|MSFT'; bad.cacheSymbol = 'MSFT'; mutate(bad);
    LS['aurix.market.snapshots.v1'] = JSON.stringify({ schemaVersion: 1, entries: [bad, good] });
    const S = mkSandbox(); return S._aurixMktSnapshotStoreRead(); };
  const MSFT = { symbol: 'MSFT', type: 'stock', currency: 'USD' };
  ok('5.1 serie con NaN → esa entrada fuera, la buena sobrevive', (m => m.size === 1 && m.has(good.identityKey))(withBad(b => { b.series[3] = [NaN, 5]; })));
  ok('5.2 serie desordenada en el tiempo → fuera', (m => m.size === 1)(withBad(b => { b.series = [[5000, 1], [1000, 2], [9000, 3]]; })));
  ok('5.3 precio no finito → fuera', (m => m.size === 1)(withBad(b => { b.price = 'mucho'; })));
  ok('5.4 divisa inválida → fuera', (m => m.size === 1)(withBad(b => { b.currency = 'DOLLARS'; })));
  ok('5.5 serie vacía → fuera', (m => m.size === 1)(withBad(b => { b.series = []; })));
  ok('5.6 valores <= 0 → fuera (no son cotizaciones)', (m => m.size === 1)(withBad(b => { b.series[2] = [b.series[2][0], 0]; })));
  ok('5.7 isSynthetic true → fuera', (m => m.size === 1)(withBad(b => { b.isSynthetic = true; })));
  ok('5.8 source sintético → fuera', (m => m.size === 1)(withBad(b => { b.source = 'synthetic'; })));
  ok('5.9 campo inesperado → fuera (el almacén no es un cajón de sastre)', (m => m.size === 1)(withBad(b => { b.userEmail = 'x@y.z'; })));
  ok('5.10 schemaVersion distinto en la entrada → fuera', (m => m.size === 1)(withBad(b => { b.schemaVersion = 99; })));
  ok('5.11 asOf en el futuro → fuera (corrupto)', (m => m.size === 1)(withBad(b => { b.asOf = Date.now() + 7 * 86400000; })));
  ok('5.12 más antiguo que 24 h → fuera (caducidad de seguridad)', (m => m.size === 1)(withBad(b => { b.savedAt = Date.now() - 25 * 3600000; })));
  ok('5.13 demasiados puntos → fuera (cota dura por registro)', (m => m.size === 1)(withBad(b => { b.series = Array.from({ length: 500 }, (_, i) => [i * 1000, 10 + i]); })));
  // El almacén entero corrupto no puede romper Market ni el bootstrap.
  LS['aurix.market.snapshots.v1'] = '{no es json';
  ok('5.14 JSON del almacén corrupto → se descarta y NO lanza', (() => { const S = mkSandbox(); const m = S._aurixMktSnapshotStoreRead(); return m.size === 0 && LS['aurix.market.snapshots.v1'] === undefined; })());
  LS['aurix.market.snapshots.v1'] = JSON.stringify({ schemaVersion: 99, entries: [good] });
  ok('5.15 esquema incompatible → se invalida SÓLO esta clave', (() => { const S = mkSandbox(); LS.otra_clave = 'intacta'; const m = S._aurixMktSnapshotStoreRead(); return m.size === 0 && LS.otra_clave === 'intacta'; })());
  ok('5.16 restaurar desde un almacén corrupto no rompe Market', (() => { LS['aurix.market.snapshots.v1'] = 'xxx'; const S = mkSandbox(); return S._aurixMktSnapshotRestore([ITEM, MSFT]) === 0; })());
}

// ── 6. Límite y poda LRU ────────────────────────────────────────────────────
console.log('\n6 — El almacenamiento no puede crecer sin límite:');
{
  LS = {}; const S = mkSandbox();
  for (let i = 0; i < 120; i++) S._aurixMktSnapshotCapture({ symbol: 'SYM' + i, type: 'stock', currency: 'USD', current_price: 10 + i }, '24h', ENTRY());
  const stored = JSON.parse(LS['aurix.market.snapshots.v1']).entries;
  const MAX = cval(S, '_AURIX_MKT_SNAP_MAX'), MAXB = cval(S, '_AURIX_MKT_SNAP_MAX_BYTES');
  ok('6.1 el almacén queda acotado al máximo declarado (120 capturados → MAX)', stored.length === MAX, stored.length + '/' + MAX);
  ok('6.2 el máximo es 40 (≈44 KB con series reales de producción)', MAX === 40);
  ok('6.3 la poda es LRU: sobrevive lo más reciente', stored.every(r => r.savedAt >= Math.min(...stored.map(x => x.savedAt))) && stored.length === 40);
  const bytes = LS['aurix.market.snapshots.v1'].length;
  ok('6.4 el tamaño real se mantiene muy por debajo de la cota dura', bytes < MAXB, bytes + ' B < ' + MAXB + ' B');
  ok('6.5 la memoria no diverge del almacén tras podar', S._aurixMktSnapshotStoreRead().size === 40);
  ok('6.6 un almacén gigantesco se descarta sin parsearlo', (() => { LS['aurix.market.snapshots.v1'] = 'x'.repeat(600 * 1024); const S2 = mkSandbox(); return S2._aurixMktSnapshotStoreRead().size === 0; })());
}

// ── 7. Privacidad: nada personal en el almacén ──────────────────────────────
console.log('\n7 — Privacidad: sólo datos públicos de mercado:');
{
  LS = {}; const S = mkSandbox();
  const rich = Object.assign({}, ITEM, { userId: 'u-1', email: 'founder@aurixsystem.io', quantity: 12.5, watchlist: ['AAPL'], holdings: [{ qty: 3 }], notes: 'privado' });
  S._aurixMktSnapshotCapture(rich, '24h', ENTRY());
  const blob = LS['aurix.market.snapshots.v1'];
  ok('7.1 no se filtra userId/email', !/u-1|founder@aurixsystem\.io/.test(blob));
  ok('7.2 no se filtran cantidades ni holdings', !/12\.5|holdings|quantity/.test(blob));
  ok('7.3 no se filtra la watchlist ni notas', !/watchlist|privado|notes/.test(blob));
  const rec = JSON.parse(blob).entries[0];
  const ALLOWED = ['schemaVersion', 'identityKey', 'cacheSymbol', 'assetType', 'range', 'price', 'currency', 'change', 'changePeriod', 'series', 'valuesCurrency', 'source', 'granularity', 'completeness', 'isSynthetic', 'asOf', 'savedAt', 'seriesStamp'];
  ok('7.4 el registro sólo contiene campos del esquema declarado', Object.keys(rec).every(k => ALLOWED.indexOf(k) >= 0), Object.keys(rec).join(','));
  ok('7.5 el owner nunca hace clear() global de storage',
     !/localStorage\.clear\(\)/.test(fnSource('_aurixMktSnapshotStoreWrite') + fnSource('_aurixMktSnapshotStoreRead') + fnSource('_aurixMktSnapshotCapture')) &&
     !/sessionStorage\.clear\(\)/.test(appCode));
  ok('7.6 sólo se elimina la clave propia de Market',
     /st\.remove\(_AURIX_MKT_SNAP_KEY\)/.test(appCode) && !/\.clear\(\)/.test(fnSource('_aurixMktSnapshotStoreRead')));
}

// ── 8. Contrato con P0 y con la red ─────────────────────────────────────────
console.log('\n8 — No cambia la red ni degrada lo restaurado:');
{
  const fv = fnSource('_mktHistoryFetchVisible') || '';
  const rv = fnSource('renderCurrentMarketView') || '';
  const f1 = fnSource('_mktHistoryFetchOne') || '';
  ok('8.1 la restauración ocurre ANTES de construir el HTML (si no, la fila nacería en esqueleto)',
     /_aurixMktSnapshotRestore\(data\)/.test(rv) && rv.indexOf('_aurixMktSnapshotRestore') < rv.indexOf('let html'));
  ok('8.2 la restauración NO vive en el bootstrap ni en el arranque',
     !/_aurixMktSnapshotRestore/.test(fnSource('renderMarket') || '') && (appCode.match(/_aurixMktSnapshotRestore\(/g) || []).length === 2);
  ok('8.3 la escritura tiene un único punto: tras un dato real recién llegado',
     (appCode.match(/_aurixMktSnapshotCapture\(/g) || []).length === 2 && /_marketHistoryCache\.set\(key, entry\);[\s\S]{0,180}_aurixMktSnapshotCapture\(item, range, entry\)/.test(f1));
  ok('8.4 el refetch lo sigue gobernando FRESCO (cero llamadas nuevas)', /_mktHistoryCacheFresh\(cached, range\)/.test(fv));
  ok('8.5 la cola de concurrencia sigue acotada a 3', /_marketHistoryQueue\s*=\s*\{ running: 0, max: 3/.test(appCode));
  ok('8.6 el nº de puntos de llamada al adaptador no ha cambiado',
     (appCode.match(/AurixChartAdapters\.(yahoo|crypto)HistoryAdapter/g) || []).length === 12);
  ok('8.7 no se introduce IndexedDB en este hotfix',
     !/indexedDB/i.test(fnSource('_aurixMktSnapStorage') + fnSource('_aurixMktSnapshotStoreRead') + fnSource('_aurixMktSnapshotStoreWrite')));
  ok('8.8 se reutiliza el Safe Storage existente (AurixRuntime.storage.local)',
     /AurixRuntime[\s\S]{0,60}storage[\s\S]{0,40}local/.test(fnSource('_aurixMktSnapStorage')));
  ok('8.9 la clave de esquema no va atada a appjs (un deploy no destruye el almacén)',
     /'aurix\.market\.snapshots\.v1'/.test(appCode) && !/snapshots\.v1[\s\S]{0,40}__AURIX_APPJS_VERSION__/.test(appCode));
  ok('8.10 la escritura se agrupa (debounce) y hay flush al ocultar la página',
     /_AURIX_MKT_SNAP_WRITE_MS/.test(fnSource('_aurixMktSnapshotStoreSchedule')) && /pagehide/.test(appCode) && /visibilitychange/.test(appCode));
}

// ── 9. Primer render con snapshots restaurados: cero esqueleto ──────────────
console.log('\n9 — La fila restaurada nace completa (contrato P0 intacto):');
{
  LS = {}; const S = mkSandbox();
  S._aurixMktSnapshotCapture(ITEM, '24h', ENTRY());
  const S2 = mkSandbox();
  S2._aurixMktSnapshotRestore([ITEM]);
  const ent = S2._marketHistoryCache.get('AAPL|24h');
  ok('9.1 la caché queda hidratada con una serie real de >= 2 puntos', !!ent && ent.series.length >= 2 && ent.series.every(p => Number.isFinite(p.value) && p.value > 0));
  ok('9.2 el sello de serie sobrevive al viaje (una respuesta idéntica no repintará)',
     S2._mktHistorySeriesStamp(ent) === JSON.parse(LS['aurix.market.snapshots.v1']).entries[0].seriesStamp);
  // Con la caché hidratada, renderMarketItem emitiría la celda SIN esqueleto: esa es la regla
  // que P0 fijó y que este owner alimenta.
  ok('9.3 la celda se decidiría montable (no is-loading) con esta entrada',
     !!ent && Array.isArray(ent.series) && ent.series.length >= 2 && S2._mktHistoryCacheUsable(ent) === true);
  ok('9.4 la lectura del almacén se memoiza (una sola vez por sesión)',
     /if \(_aurixMktSnapCache\) return _aurixMktSnapCache;/.test(fnSource('_aurixMktSnapshotStoreRead')));
}

console.log(`\nRESULT: ${fail ? 'FAIL ✗' : 'PASS ✓'}  (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
