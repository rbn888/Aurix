'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MARKET-CRYPTO-ALL-WINDOW — SPEC MARKET EXCELLENCE B1.1
// ════════════════════════════════════════════════════════════════════════════
// CoinGecko `days=max` es exclusivo de Pro con la clave/tier actual (502
// upstream_401, medido). ALL de cripto se sirve desde la fuente de ventana larga
// que ya está en producción (par `<TICKER>-USD`), sin inventar un solo punto y
// declarando fuente y ventana reales. Este harness ejecuta el adaptador REAL con
// `fetch` doble y distingue a qué endpoint se llama en cada caso.
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

// Entorno mínimo para el IIFE de los adaptadores, con `fetch` instrumentado.
function loadAdapters(responder) {
  const win = { AURIX_API_BASE: 'https://api.test' };
  const hits = { cg: [], yh: [] };
  const fakeFetch = (url) => {
    const u = String(url);
    if (u.indexOf('history-yahoo') >= 0) hits.yh.push(u); else hits.cg.push(u);
    return Promise.resolve(responder(u, hits));
  };
  const fn = new Function('window', 'fetch', 'console', 'setTimeout', 'clearTimeout',
    adapters + '\n;return window.AurixChartAdapters;');
  return { api: fn(win, fakeFetch, { warn() {}, log() {}, error() {} }, (f) => { f(); return 0; }, () => {}), hits };
}
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
const isYh = (u) => u.indexOf('history-yahoo') >= 0;

// Serie semanal real (como ETH-USD) y mensual (como BTC-USD): la fuente declara
// '1wk' en los dos casos, pero el paso REAL de la segunda es mensual.
const WEEK = 7 * 86400e3, MONTH = 31 * 86400e3;
function ypoints(n, stepMs, startMs) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ time: startMs + i * stepMs, open: 100 + i, high: 105 + i, low: 95 + i, close: 100 + i, volume: 10 });
  return out;
}
const ETH_LONG = ypoints(460, WEEK,  Date.UTC(2017, 10, 6));
const BTC_LONG = ypoints(144, MONTH, Date.UTC(2014, 9, 1));
const CG_PRICES = [[1700000000000, 2000], [1700003600000, 2010], [1700007200000, 2025]];

console.log('AURIX-MARKET-CRYPTO-ALL-WINDOW — SPEC MARKET EXCELLENCE B1.1\n');

(async () => {
  // ── 1. ALL de cripto: ventana larga real, sin quemar intentos contra 401 ──
  console.log('1 — ETH ALL: se sirve la ventana larga real:');
  {
    const { api, hits } = loadAdapters((u) => isYh(u)
      ? res(200, { ok: true, points: ETH_LONG, currency: 'USD', granularity: '1wk' })
      : res(502, { error: 'upstream_401' }));
    const r = await api.cryptoHistoryAdapter({ coinId: 'ethereum', range: 'all', pairSymbol: 'ETH-USD' });
    ok('1.1 ETH ALL resuelve READY (antes: 502 upstream_401 → sin histórico)',
       r.meta.status === 'ready' && r.series.length === 460, r.meta.status + ' n=' + r.series.length);
    ok('1.2 NO se llama a days=max: cero intentos desperdiciados contra el 401 seguro',
       hits.cg.length === 0, 'cg=' + hits.cg.length);
    ok('1.3 una sola petición a la fuente de ventana larga', hits.yh.length === 1, 'yh=' + hits.yh.length);
    ok('1.4 pide el par correcto y el rango completo',
       /symbol=ETH-USD/.test(hits.yh[0]) && /range=all/.test(hits.yh[0]), hits.yh[0]);
    ok('1.5 la fuente se declara de verdad (meta.source), no la heredada del adaptador',
       r.meta.source === 'yahoo', r.meta.source);
    ok('1.6 la ventana REAL viaja en el meta (inicio, fin, span)',
       !!r.meta.window && r.meta.window.startMs === Date.UTC(2017, 10, 6)
       && r.meta.window.spanDays > 3000, JSON.stringify(r.meta.window));
    ok('1.7 nada sintético: ni un punto añadido ni interpolado',
       r.meta.isSynthetic === false && r.series.length === ETH_LONG.length
       && r.series[0].value === ETH_LONG[0].close
       && r.series[459].value === ETH_LONG[459].close);
    ok('1.8 divisa declarada por la fuente', r.meta.currency === 'USD', r.meta.currency);
  }
  // Granularidad MEDIDA, no la que declara la respuesta.
  {
    const { api } = loadAdapters((u) => isYh(u)
      ? res(200, { ok: true, points: BTC_LONG, currency: 'USD', granularity: '1wk' })
      : res(502, { error: 'upstream_401' }));
    const r = await api.cryptoHistoryAdapter({ coinId: 'bitcoin', range: 'all', pairSymbol: 'BTC-USD' });
    ok('1.9 paso mensual real ⇒ granularidad "1mo" aunque la fuente diga "1wk"',
       r.meta.granularity === '1mo', r.meta.granularity);
    ok('1.10 span real de más de una década', r.meta.window.spanDays > 4000, String(r.meta.window.spanDays));
  }
  {
    const { api } = loadAdapters((u) => isYh(u)
      ? res(200, { ok: true, points: ETH_LONG, currency: 'USD', granularity: '1d' })
      : res(502, { error: 'upstream_401' }));
    const r = await api.cryptoHistoryAdapter({ coinId: 'ethereum', range: 'all', pairSymbol: 'ETH-USD' });
    ok('1.11 paso semanal real ⇒ "1wk" aunque la fuente diga "1d"', r.meta.granularity === '1wk', r.meta.granularity);
  }

  // ── 2. Sin regresión en el resto de rangos ────────────────────────────────
  console.log('\n2 — ETH 24H / 30D / 1Y: exactamente el camino de antes:');
  for (const range of ['24h', '7d', '30d', '1y']) {
    const { api, hits } = loadAdapters((u) => isYh(u) ? res(500, {}) : res(200, { prices: CG_PRICES }));
    const r = await api.cryptoHistoryAdapter({ coinId: 'ethereum', range, pairSymbol: 'ETH-USD' });
    ok('2.' + range + ' sigue sirviéndose del proveedor de cripto, sin tocar la fuente larga',
       r.meta.status === 'ready' && r.meta.source === 'coingecko' && hits.yh.length === 0 && hits.cg.length === 1,
       r.meta.source + ' yh=' + hits.yh.length + ' cg=' + hits.cg.length);
  }
  {
    const { api, hits } = loadAdapters((u) => isYh(u) ? res(500, {}) : res(200, { prices: CG_PRICES }));
    const r = await api.cryptoHistoryAdapter({ coinId: 'ethereum', range: '1y' });
    ok('2.5 sin `pairSymbol` (capa de precios de cartera) nada cambia',
       r.meta.status === 'ready' && hits.yh.length === 0, 'yh=' + hits.yh.length);
  }
  {
    const { api, hits } = loadAdapters((u) => isYh(u) ? res(500, {}) : res(200, { prices: CG_PRICES }));
    const r = await api.cryptoHistoryAdapter({ coinId: 'ethereum', range: 'all' });
    ok('2.6 ALL sin `pairSymbol` mantiene days=max (funcionaría con clave Pro)',
       hits.yh.length === 0 && hits.cg.length === 1 && /days=max/.test(hits.cg[0]) && r.meta.status === 'ready',
       'cg=' + (hits.cg[0] || ''));
  }

  // ── 3. El contrato B1 sigue en pie en todos los fallos ───────────────────
  console.log('\n3 — Los fallos siguen siendo UNAVAILABLE, nunca NO_HISTORY:');
  {
    // Ni ventana larga ni days=max.
    const { api, hits } = loadAdapters((u) => isYh(u) ? res(502, { ok: false }) : res(502, { error: 'upstream_401' }));
    const r = await api.cryptoHistoryAdapter({ coinId: 'ethereum', range: 'all', pairSymbol: 'ETH-USD' });
    ok('3.1 las dos fuentes caídas → unavailable (jamás "sin histórico")',
       r.meta.status === 'unavailable', r.meta.status);
    ok('3.2 sólo entonces se intenta days=max (el fallback no oculta la vía original)',
       hits.yh.length === 1 && hits.cg.length >= 1, 'yh=' + hits.yh.length + ' cg=' + hits.cg.length);
  }
  {
    const { api } = loadAdapters((u) => isYh(u) ? res(429, {}) : res(429, { error: 'rate_limit' }));
    const r = await api.cryptoHistoryAdapter({ coinId: 'ethereum', range: 'all', pairSymbol: 'ETH-USD' });
    ok('3.3 rate-limit en ambas → unavailable con motivo de diagnóstico',
       r.meta.status === 'unavailable' && r.meta.error === 'rate-limited', r.meta.status + '/' + r.meta.error);
  }
  {
    const { api } = loadAdapters((u) => isYh(u) ? res(500, {}) : res(429, { error: 'rate_limit' }));
    const r = await api.cryptoHistoryAdapter({ coinId: 'ethereum', range: '30d', pairSymbol: 'ETH-USD' });
    ok('3.4 rate-limit fuera de ALL sigue siendo unavailable (B1 intacto)',
       r.meta.status === 'unavailable', r.meta.status);
  }
  {
    // La fuente larga responde bien y VACÍA: no es READY, y no se inventa nada.
    const { api, hits } = loadAdapters((u) => isYh(u)
      ? res(200, { ok: true, points: [], currency: 'USD', granularity: '1wk' })
      : res(200, { prices: CG_PRICES }));
    const r = await api.cryptoHistoryAdapter({ coinId: 'newcoin', range: 'all', pairSymbol: 'NEW-USD' });
    ok('3.5 ventana larga realmente vacía ⇒ se sigue al proveedor de cripto',
       hits.yh.length === 1 && hits.cg.length === 1 && r.meta.source === 'coingecko' && r.meta.status === 'ready',
       r.meta.source + '/' + r.meta.status);
  }
  {
    const { api, hits } = loadAdapters((u) => isYh(u)
      ? res(200, { ok: true, points: [], currency: 'USD', granularity: '1wk' })
      : res(200, { prices: [] }));
    const r = await api.cryptoHistoryAdapter({ coinId: 'newcoin', range: 'all', pairSymbol: 'NEW-USD' });
    ok('3.6 las DOS fuentes vacías de verdad ⇒ no_history (es la verdad)',
       r.meta.status === 'no_history', r.meta.status);
  }
  {
    const ctrl = { aborted: true };
    const { api, hits } = loadAdapters(() => res(200, { ok: true, points: ETH_LONG }));
    const r = await api.cryptoHistoryAdapter({ coinId: 'ethereum', range: 'all', pairSymbol: 'ETH-USD', signal: ctrl });
    ok('3.7 cancelado antes de salir → aborted y sin ninguna petición',
       r.meta.status === 'aborted' && hits.yh.length === 0 && hits.cg.length === 0,
       r.meta.status + ' yh=' + hits.yh.length);
  }

  // ── 4. Misma semántica en Market y en la ficha de activo ─────────────────
  console.log('\n4 — Un solo owner de identidad; Market y ficha de activo idénticos:');
  let pair = null;
  try { pair = new Function(fnSource(app, '_aurixCryptoPairSymbol') + '\n;return _aurixCryptoPairSymbol;')(); } catch (_) {}
  ok('4.0 el traductor de par es ejecutable', typeof pair === 'function');
  if (typeof pair === 'function') {
    ok('4.1 ETH → ETH-USD', pair({ symbol: 'ETH', type: 'crypto' }) === 'ETH-USD');
    ok('4.2 un par ya formado no se duplica', pair({ symbol: 'ETH-USD' }) === 'ETH-USD');
    ok('4.3 minúsculas y espacios normalizados', pair({ symbol: ' sol ' }) === 'SOL-USD');
    ok('4.4 sin símbolo no se inventa par', pair({}) === '' && pair(null) === '');
    ok('4.5 un símbolo no traducible no genera par falso', pair({ symbol: '000001.SS' }) === '');
  }
  ok('4.6 hay UN solo traductor de par en el bundle',
     (app.match(/^function _aurixCryptoPairSymbol\(/gm) || []).length === 1);
  const mktPick = fnSource(app, '_aurixMktPickAdapter');
  const adPick  = fnSource(app, '_aurixAssetPickAdapter');
  ok('4.7 Market entrega el par al adaptador', /pairSymbol: _aurixCryptoPairSymbol\(it\)/.test(mktPick));
  ok('4.8 la ficha de activo entrega el MISMO par', /pairSymbol: _aurixCryptoPairSymbol\(a\)/.test(adPick));
  ok('4.9 la etiqueta de fuente la manda el DATO, no el adaptador elegido',
     /const src = \(meta && typeof meta\.source === 'string'\)/.test(fnSource(app, '_aurixAssetMetaLine')));
  ok('4.10 la granularidad mensual tiene etiqueta humana (no se cuela un token)',
     /g === '1mo'\)\s*parts\.push\(isEs \? 'Mensual' : 'Monthly'\)/.test(fnSource(app, '_aurixAssetMetaLine')));

  // ── 5. Lo que el SPEC prohíbe tocar sigue intacto ───────────────────────
  console.log('\n5 — Alcance: nada fuera del owner:');
  ok('5.1 el mapa de días de cripto no se ha recortado (ALL sigue significando max)',
     /'all': 'max'/.test(adapters));
  ok('5.2 el contrato de estado v660 sigue siendo el mismo vocabulario',
     /READY:\s*'ready'/.test(adapters) && /NO_HISTORY:\s*'no_history'/.test(adapters)
     && /UNAVAILABLE: 'unavailable'/.test(adapters) && /ABORTED:\s*'aborted'/.test(adapters));
  ok('5.3 el fallback sólo se activa en ALL y con par explícito',
     /if \(range === 'all' && a\.pairSymbol\)/.test(adapters));
  ok('5.4 los reintentos del proveedor de cripto siguen siendo tres',
     /const BACKOFFS  = \[0, 400/.test(adapters));
  ok('5.5 el adaptador de la cartera (snapshots locales) no se ha tocado',
     /function portfolioHistoryAdapter\(args\)/.test(adapters)
     && !/pairSymbol/.test(fnSource(adapters, 'portfolioHistoryAdapter')));
  ok('5.6 la capa de precios de cartera sigue llamando sin par',
     /cryptoHistoryAdapter\(\{ coinId: req\.key, range: req\.range, signal: req\.signal \}\)/
       .test(read('services/portfolio-price-layer.js')));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
