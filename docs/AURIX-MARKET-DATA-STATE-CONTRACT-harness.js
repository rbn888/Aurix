'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MARKET-DATA-STATE-CONTRACT — SPEC MARKET EXCELLENCE B1
// ════════════════════════════════════════════════════════════════════════════
// Un fallo temporal del proveedor NO puede terminar representado como que un
// activo real "no tiene histórico". Este harness ejecuta el CÓDIGO REAL:
//   · los adaptadores reales de services/chart-adapters.js, con `fetch` sustituido
//     por un doble que reproduce las respuestas del backend real (200 con datos,
//     200 vacío, 429, 502, caída de red);
//   · el reductor real `_aurixMktDataState` extraído de app.js;
//   · la regla real de frescura de caché `_mktHistoryCacheFresh`.
// Lo que no se puede ejecutar sin navegador (las ramas de pintado) se comprueba
// sobre la estructura del owner, no sobre "existe una línea".
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { return ''; } };
const app      = read('app.js');
const adapters = read('services/chart-adapters.js');

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
// Recorta una declaración `const NAME = Object.freeze({ ... });` completa.
function constFreezeSource(src, name) {
  const i = src.indexOf('const ' + name + ' = Object.freeze({');
  if (i < 0) return '';
  let d = 0, st = false;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') { d++; st = true; }
    else if (src[k] === '}') { d--; if (st && !d) return src.slice(i, k + 1) + ');'; }
  }
  return '';
}

console.log('AURIX-MARKET-DATA-STATE-CONTRACT — SPEC MARKET EXCELLENCE B1\n');

// ── 0. Carga de los adaptadores REALES con un `fetch` controlado ────────────
// El módulo es un IIFE que se cuelga de `window`. Se le inyecta un entorno
// mínimo: `fetch` doble, temporizador inmediato (los backoffs de reintento no
// deben costar segundos de gate) y una consola silenciosa.
function loadAdapters(responder) {
  const win = { AURIX_API_BASE: 'https://api.test' };
  const calls = [];
  const fakeFetch = (url, opts) => {
    calls.push(String(url));
    return Promise.resolve(responder(String(url), calls.length, opts));
  };
  const quietConsole = { warn() {}, log() {}, error() {} };
  const fastTimeout = (fn) => { fn(); return 0; };
  const fn = new Function('window', 'fetch', 'console', 'setTimeout', 'clearTimeout',
    adapters + '\n;return window.AurixChartAdapters;');
  return { api: fn(win, fakeFetch, quietConsole, fastTimeout, () => {}), calls, win };
}
const jsonRes = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
});
const PRICES = [[1700000000000, 2000], [1700003600000, 2010], [1700007200000, 2025]];
const POINTS = [
  { time: 1700000000000, open: 10, high: 11, low: 9,  close: 10.5, volume: 100 },
  { time: 1700086400000, open: 10.5, high: 12, low: 10, close: 11.8, volume: 120 },
];

// ── 1. El contrato existe y es único ───────────────────────────────────────
console.log('1 — El contrato de estado existe en el productor (owner más alto):');
ok('1.1 los adaptadores publican el vocabulario canónico DATA_STATUS',
   /DATA_STATUS/.test(adapters) && /window\.AurixChartAdapters = Object\.freeze\(\{[\s\S]{0,400}DATA_STATUS/.test(adapters));
{
  const { api } = loadAdapters(() => jsonRes(200, { prices: PRICES }));
  ok('1.2 DATA_STATUS declara los cuatro estados del proveedor',
     api && api.DATA_STATUS && api.DATA_STATUS.READY === 'ready'
     && api.DATA_STATUS.NO_HISTORY === 'no_history'
     && api.DATA_STATUS.UNAVAILABLE === 'unavailable'
     && api.DATA_STATUS.ABORTED === 'aborted',
     JSON.stringify(api && api.DATA_STATUS));
}
ok('1.3 `_emptyResult` obliga a declarar el estado en cada retorno vacío',
   /function _emptyResult\(source, currency, granularity, status, error\)/.test(adapters));
ok('1.4 ninguna llamada a _emptyResult se queda sin estado',
   (adapters.match(/_emptyResult\(/g) || []).length >= 8
   && !/_emptyResult\('[a-z-]+', '[A-Z]{3}', '[0-9a-z]+'\)/.test(adapters));

// ── 2. A/B/C sobre el adaptador REAL de cripto (el caso focal ETH) ─────────
console.log('\n2 — Adaptador de cripto real (ETH): respuesta válida / vacía / fallo:');
(async () => {
  // A — respuesta válida con histórico → READY
  {
    const { api, calls } = loadAdapters(() => jsonRes(200, { prices: PRICES }));
    const r = await api.cryptoHistoryAdapter({ coinId: 'ethereum', range: 'all' });
    ok('2.A 200 con precios → status=ready y serie real',
       r.meta.status === 'ready' && r.series.length === 3 && r.series[0].value === 2000,
       r.meta.status + ' / n=' + r.series.length);
    ok('2.A2 no reintenta cuando la respuesta es buena', calls.length === 1, 'calls=' + calls.length);
    ok('2.A3 ALL pide el histórico completo (days=max)', /days=max/.test(calls[0]), calls[0]);
  }
  // B — respuesta válida realmente vacía → NO_HISTORY
  {
    const { api, calls } = loadAdapters(() => jsonRes(200, { prices: [] }));
    const r = await api.cryptoHistoryAdapter({ coinId: 'ethereum', range: 'all' });
    ok('2.B 200 sin precios → status=no_history (es la verdad del proveedor)',
       r.meta.status === 'no_history' && r.series.length === 0, r.meta.status);
    ok('2.B2 un vacío legítimo NO se reintenta', calls.length === 1, 'calls=' + calls.length);
  }
  // C — rate-limit / upstream / red → UNAVAILABLE, NUNCA no_history
  {
    const { api, calls } = loadAdapters(() => jsonRes(429, { error: 'rate_limit' }));
    const r = await api.cryptoHistoryAdapter({ coinId: 'ethereum', range: 'all' });
    ok('2.C 429 tras reintentos → status=unavailable (NUNCA no_history)',
       r.meta.status === 'unavailable' && r.meta.status !== 'no_history', r.meta.status);
    ok('2.C2 conserva el motivo fino sólo como diagnóstico', r.meta.error === 'rate-limited', String(r.meta.error));
    ok('2.C3 el rate-limit se reintenta antes de rendirse', calls.length === 3, 'calls=' + calls.length);
  }
  {
    const { api } = loadAdapters(() => jsonRes(502, { error: 'upstream_401' }));
    const r = await api.cryptoHistoryAdapter({ coinId: 'ethereum', range: 'all' });
    ok('2.C4 502 upstream → status=unavailable', r.meta.status === 'unavailable', r.meta.status);
  }
  {
    const { api } = loadAdapters(() => { throw new Error('network down'); });
    let r = null;
    try { r = await api.cryptoHistoryAdapter({ coinId: 'ethereum', range: 'all' }); } catch (_) {}
    ok('2.C5 caída de red → status=unavailable, sin excepción hacia la UI',
       !!r && r.meta.status === 'unavailable', r && r.meta.status);
  }
  {
    const { api } = loadAdapters(() => jsonRes(400, { error: 'invalid_id' }));
    const r = await api.cryptoHistoryAdapter({ coinId: 'ethereum', range: 'all' });
    ok('2.C6 400 no reintentable tampoco es "sin histórico"', r.meta.status === 'unavailable', r.meta.status);
  }
  // E — recuperación posterior del proveedor → READY
  {
    const { api } = loadAdapters((_u, n) => (n === 1 ? jsonRes(429, {}) : jsonRes(200, { prices: PRICES })));
    const r = await api.cryptoHistoryAdapter({ coinId: 'ethereum', range: 'all' });
    ok('2.E el proveedor recupera dentro de la misma llamada → ready',
       r.meta.status === 'ready' && r.series.length === 3, r.meta.status);
  }
  {
    // Recuperación entre llamadas: primero unavailable, después ready.
    const seq = [jsonRes(429, {}), jsonRes(429, {}), jsonRes(429, {}), jsonRes(200, { prices: PRICES })];
    const { api } = loadAdapters(() => seq.shift() || jsonRes(200, { prices: PRICES }));
    const bad  = await api.cryptoHistoryAdapter({ coinId: 'ethereum', range: 'all' });
    const good = await api.cryptoHistoryAdapter({ coinId: 'ethereum', range: 'all' });
    ok('2.E2 tras un fallo, la siguiente carga vuelve a READY sin estado pegado',
       bad.meta.status === 'unavailable' && good.meta.status === 'ready',
       bad.meta.status + ' → ' + good.meta.status);
  }

  // ── 3. Mismo contrato en el adaptador de Yahoo (era el que perdía TODO) ──
  console.log('\n3 — Adaptador de Yahoo real: el motivo ya no se pierde:');
  {
    const { api } = loadAdapters(() => jsonRes(200, { ok: true, points: POINTS, currency: 'USD', granularity: '1d' }));
    const r = await api.yahooHistoryAdapter({ symbol: 'AAPL', range: '30d' });
    ok('3.1 200 ok:true con puntos → ready', r.meta.status === 'ready' && r.series.length === 2, r.meta.status);
  }
  {
    const { api } = loadAdapters(() => jsonRes(200, { ok: true, points: [], currency: 'USD', granularity: '1d' }));
    const r = await api.yahooHistoryAdapter({ symbol: 'NEWCO', range: '30d' });
    ok('3.2 200 ok:true sin puntos → no_history', r.meta.status === 'no_history', r.meta.status);
  }
  {
    const { api } = loadAdapters(() => jsonRes(502, { ok: false, error: 'yahoo_http_429' }));
    const r = await api.yahooHistoryAdapter({ symbol: 'AAPL', range: '30d' });
    ok('3.3 502 → unavailable (antes era indistinguible de "sin histórico")',
       r.meta.status === 'unavailable', r.meta.status);
  }
  {
    const { api } = loadAdapters(() => { throw new Error('dns'); });
    const r = await api.yahooHistoryAdapter({ symbol: 'AAPL', range: '30d' });
    ok('3.4 caída de red → unavailable', r.meta.status === 'unavailable', r.meta.status);
  }
  {
    const { api } = loadAdapters(() => jsonRes(200, { ok: false, error: 'x' }));
    const r = await api.yahooHistoryAdapter({ symbol: 'AAPL', range: '30d' });
    ok('3.5 cuerpo que declara fallo → unavailable', r.meta.status === 'unavailable', r.meta.status);
  }
  // G — sin regresión: el resto del contrato del adaptador intacto.
  {
    const { api } = loadAdapters(() => jsonRes(200, { ok: true, points: POINTS, currency: 'EUR', granularity: '1d' }));
    const r = await api.yahooHistoryAdapter({ symbol: 'SAN.MC', range: '30d' });
    const p = r.series[0];
    ok('3.G el resto del meta sigue completo (source/currency/granularity/completeness/asOf)',
       r.meta.source === 'yahoo' && r.meta.currency === 'EUR' && r.meta.granularity === '1d'
       && typeof r.meta.completeness === 'number' && typeof r.meta.asOf === 'number');
    ok('3.G2 la divisa de cotización se preserva (no se fuerza USD)', r.meta.currency === 'EUR');
    ok('3.G3 la forma del punto no cambia (time/value/OHLC/volume)',
       p.time === 1700000000000 && p.value === 10.5 && p.close === 10.5 && p.open === 10 && p.volume === 100);
  }
  {
    const { api } = loadAdapters(() => jsonRes(200, { prices: PRICES }));
    const r = await api.cryptoHistoryAdapter({ coinId: 'ethereum', range: '24h' });
    ok('3.G4 cripto sigue emitiendo USD y granularidad por rango',
       r.meta.currency === 'USD' && r.meta.granularity === '5m', r.meta.granularity);
  }

  // ── 4. El reductor REAL de app.js ──────────────────────────────────────
  console.log('\n4 — Reductor único `_aurixMktDataState` (código real de app.js):');
  let reduce = null;
  try {
    reduce = new Function(
      constFreezeSource(app, '_AURIX_MKT_DS') + '\n' +
      fnSource(app, '_aurixMktDataState') + '\n;return _aurixMktDataState;'
    )();
  } catch (e) { /* reported below */ }
  ok('4.0 el reductor es ejecutable', typeof reduce === 'function');
  if (typeof reduce === 'function') {
    const ser = [{ time: 1, value: 10 }, { time: 2, value: 11 }];
    ok('4.A serie con puntos → ready', reduce({ series: ser, meta: { status: 'ready' } }, null) === 'ready');
    ok('4.B vacío declarado por el proveedor → no_history',
       reduce({ series: [], meta: { status: 'no_history' } }, null) === 'no_history');
    ok('4.C fallo del proveedor sin dato previo → unavailable',
       reduce({ series: [], meta: { status: 'unavailable', error: 'rate-limited' } }, null) === 'unavailable');
    ok('4.C2 un fallo NUNCA devuelve no_history',
       ['unavailable', 'stale'].includes(reduce({ series: [], meta: { status: 'unavailable' } }, ser)));
    ok('4.D fallo CON dato válido previo → stale (se conserva lo que había)',
       reduce({ series: [], meta: { status: 'unavailable' } }, ser) === 'stale');
    ok('4.D2 el reductor no muta la respuesta ni la serie previa', (() => {
      const res = { series: [], meta: { status: 'unavailable' } };
      const prev = ser.slice();
      reduce(res, prev);
      return res.series.length === 0 && prev.length === 2 && prev[0].value === 10;
    })());
    ok('4.D3 un "previo" no utilizable (0/1 punto) no finge stale',
       reduce({ series: [], meta: { status: 'unavailable' } }, [{ time: 1, value: 9 }]) === 'unavailable');
    ok('4.E cancelación → aborted (no se pinta nada)',
       reduce({ series: [], meta: { status: 'aborted' } }, null) === 'aborted');
    ok('4.F respuesta nula/malformada → unavailable, jamás no_history',
       reduce(null, null) === 'unavailable' && reduce(undefined, null) === 'unavailable'
       && reduce('boom', null) === 'unavailable');
    ok('4.G productor sin `status` mantiene el comportamiento previo (ausencia → no_history)',
       reduce({ series: [], meta: { source: 'x' } }, null) === 'no_history');
    ok('4.G2 productor sin `status` pero con `error` se trata como fallo',
       reduce({ series: [], meta: { error: 'boom' } }, null) === 'unavailable');
    // Integración del caso focal, extremo a extremo, sin mocks intermedios.
    const { api } = loadAdapters(() => jsonRes(429, { error: 'rate_limit' }));
    const eth = await api.cryptoHistoryAdapter({ coinId: 'ethereum', range: 'all' });
    ok('4.FOCAL ETH/ALL con 429 real del proveedor → unavailable (no "Ethereum sin histórico")',
       reduce(eth, null) === 'unavailable', reduce(eth, null));
  }

  // ── 5. Los consumidores usan ESE reductor y nada más ───────────────────
  console.log('\n5 — Los tres consumidores comparten intérprete (sin parches en la UI):');
  const mktLoad   = fnSource(app, '_aurixMktLoad');
  const assetLoad = fnSource(app, '_aurixAssetLoad');
  const fetchOne  = fnSource(app, '_mktHistoryFetchOne');
  ok('5.1 la ficha de Market decide con el reductor', /_aurixMktDataState\(/.test(mktLoad));
  ok('5.2 la ficha de activo decide con el MISMO reductor', /_aurixMktDataState\(/.test(assetLoad));
  ok('5.3 la lista de Market decide con el MISMO reductor', /_aurixMktDataState\(/.test(fetchOne));
  ok('5.4 hay UN solo reductor en todo el bundle',
     (app.match(/^function _aurixMktDataState\(/gm) || []).length === 1);
  ok('5.5 ya no queda la comprobación que confundía vacío con fallo en la ficha de Market',
     !/if \(!result \|\| !Array\.isArray\(result\.series\) \|\| !result\.series\.length\) \{\s*\n\s*ctrl\.setData\(\[\]\)/.test(mktLoad));
  ok('5.6 ni en la ficha de activo',
     !/if \(!result \|\| !Array\.isArray\(result\.series\) \|\| !result\.series\.length\) \{\s*\n\s*ctrl\.setData\(\[\]\)/.test(assetLoad));
  ok('5.7 `setData([])` (estado vacío del motor) sólo se alcanza en la rama NO_HISTORY',
     (() => {
       for (const src of [mktLoad, assetLoad]) {
         const i = src.indexOf('ctrl.setData([])');
         if (i < 0) continue;
         const before = src.slice(0, i);
         const guard = before.lastIndexOf('NO_HISTORY');
         const other = Math.max(before.lastIndexOf('UNAVAILABLE'), before.lastIndexOf('STALE'));
         if (!(guard > other)) return false;
       }
       return true;
     })());
  ok('5.8 la rama UNAVAILABLE no cae al estado vacío del motor',
     /_AURIX_MKT_DS\.UNAVAILABLE\)? \{[\s\S]{0,400}?_aurixMktSetCanvasState/.test(mktLoad));
  ok('5.9 el copy de los estados del lienzo tiene un dueño único',
     (app.match(/function _aurixMktSetCanvasState\(/g) || []).length === 1
     && !/No historical data available for this asset\./.test(app)
     && !/No hay histórico disponible para este activo\./.test(app));

  // ── 6. D/E en la lista: el dato válido sobrevive al fallo transitorio ──
  console.log('\n6 — Lista de Market: un fallo temporal ya no borra ni congela el dato bueno:');
  ok('6.1 en STALE se repinta la entrada previa, no una ausencia',
     /_AURIX_MKT_DS\.STALE\)? \{[\s\S]{0,400}?_mktHistoryApplyToRow\(item, range, prevEntry, gen\)/.test(fetchOne));
  ok('6.2 en STALE no se reescribe la caché (el `ts` no se toca ⇒ se reintenta)',
     (() => {
       const i = fetchOne.indexOf('_AURIX_MKT_DS.STALE');
       const j = fetchOne.indexOf('_AURIX_MKT_DS.UNAVAILABLE');
       if (i < 0 || j < 0) return false;
       return !/_marketHistoryCache\.set/.test(fetchOne.slice(i, j));
     })());
  ok('6.3 en UNAVAILABLE se registra el INTENTO (marcado), no una ausencia',
     /unavailable: true/.test(fetchOne));
  ok('6.4 el snapshot persistido nunca captura un intento fallido',
     /entry\.series\.length < 2\) return false/.test(fnSource(app, '_aurixMktSnapshotCapture')));
  let fresh = null;
  try {
    fresh = new Function(
      constFreezeSource(app, '_MKT_HISTORY_TTL') + '\n' +
      'const _MKT_HISTORY_UNAVAIL_TTL = ' + (/(_MKT_HISTORY_UNAVAIL_TTL = )([^;]+);/.exec(app) || [])[2] + ';\n' +
      fnSource(app, '_mktHistoryCacheFresh') + '\n;return _mktHistoryCacheFresh;'
    )();
  } catch (_) {}
  ok('6.5 la regla de frescura es ejecutable', typeof fresh === 'function');
  if (typeof fresh === 'function') {
    const now = Date.now();
    ok('6.6 un dato bueno conserva su TTL por rango (all = 24 h)',
       fresh({ ts: now - 3600e3, series: [1, 2] }, 'all') === true);
    ok('6.7 un INTENTO fallido caduca en 60 s aunque el rango sea ALL',
       fresh({ ts: now - 3600e3, series: [], unavailable: true }, 'all') === false);
    ok('6.8 el intento fallido sí frena la ráfaga inmediata',
       fresh({ ts: now - 5e3, series: [], unavailable: true }, 'all') === true);
    ok('6.9 sin entrada no hay frescura', fresh(null, 'all') === false);
  }

  // ── 7. F — ningún error técnico se presenta como dato financiero ───────
  console.log('\n7 — La UI comunica estado, nunca diagnóstico:');
  const setCanvas = fnSource(app, '_aurixMktSetCanvasState');
  ok('7.1 el copy de estado sale de i18n, no de `meta.error`',
     /t\('mkt_hist_unavailable'\)/.test(setCanvas) && /t\('mkt_no_history_canvas'\)/.test(setCanvas)
     && !/meta\.error/.test(setCanvas));
  ok('7.2 ningún consumidor imprime `meta.error`, `meta.status` ni JSON en el DOM',
     !/textContent\s*=\s*[^;\n]*meta\.(error|status)/.test(app)
     && !/innerHTML\s*=\s*[^;\n]*meta\.(error|status)/.test(app)
     && !/textContent\s*=\s*[^;\n]*JSON\.stringify/.test(app));
  for (const key of ['mkt_hist_unavailable', 'mkt_no_history_canvas', 'mkt_hist_stale']) {
    const hits = (app.match(new RegExp('\\n\\s*' + key + ':', 'g')) || []).length;
    ok('7.3 `' + key + '` está en los DOS idiomas', hits === 2, 'n=' + hits);
  }
  const copies = (app.match(/mkt_hist_unavailable: (['"])(.*?)\1,/g) || []).join(' | ');
  ok('7.4 el mensaje de indisponibilidad no expone códigos, proveedor ni jerga',
     copies.length > 0
     && !/(429|502|503|504|http|json|coingecko|yahoo|rate.?limit|upstream|error)/i.test(copies),
     copies);
  ok('7.5 el mensaje declara que es temporal e invita a reintentar',
     /(unos minutos|few minutes)/i.test(copies), copies);
  ok('7.6 "sin histórico" y "no se pudo cargar" son textos DISTINTOS',
     !/mkt_no_history_canvas: (['"])(.*?)\1[\s\S]{0,200}mkt_hist_unavailable: \1\2\1/.test(app));
  ok('7.7 el estado stale no inventa cifras: sólo declara que no está al día',
     /_AURIX_MKT_DS\.STALE\)? \{[\s\S]{0,300}?t\('mkt_hist_stale'\)/.test(mktLoad)
     && !/_AURIX_MKT_DS\.STALE\)? \{[\s\S]{0,300}?ctrl\.setData\(/.test(mktLoad));

  // ── 8. G — no se ha tocado nada de lo prohibido ───────────────────────
  console.log('\n8 — Sin regresión en los invariantes que el SPEC protege:');
  ok('8.1 el token de generación y los guardas de respuesta tardía siguen intactos',
     /if \(gen !== _aurixMktGen\) return;/.test(mktLoad)
     && /if \(reqRange !== _aurixMktRange\) return;/.test(mktLoad)
     && /if \(item !== _aurixMktItem\) return;/.test(mktLoad));
  ok('8.2 la serie CRUDA sigue siendo la que se guarda para el view model',
     /_aurixMktSeries\s*=\s*result\.series;/.test(mktLoad));
  ok('8.3 la conversión a divisa base sigue en el render, no en el guardado',
     /value: toBase\(p\.value, fromCurr\)/.test(mktLoad));
  ok('8.4 el motor sigue siendo el dueño de los estados (sólo se le pide setState)',
     /ctrl\.setState\(/.test(setCanvas) && !/dataset\.state\s*=/.test(mktLoad));
  ok('8.5 no se ha tocado el Chart Engine de Portfolio',
     !/buildProductionPortfolioChart/.test(mktLoad) && !/buildProductionPortfolioChart/.test(fetchOne));
  ok('8.6 el adaptador de portfolio (snapshots locales) declara ausencia real, no fallo',
     /_emptyResult\('local-snapshot', 'USD', '5m', DATA_STATUS\.NO_HISTORY\)/.test(adapters));
  ok('8.7 los reintentos del adaptador de cripto siguen siendo tres, sin añadir llamadas',
     /const BACKOFFS  = \[0, 400/.test(adapters));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
