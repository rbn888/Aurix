'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ISIN-ADD-WATCHLIST-harness — tres defectos vistos por el founder con
// IE00BYX5NX33 (Fidelity MSCI World P Acc EUR):
//   A. Add Asset (pestaña «ETF / Fondos», la que abre la categoría Fondos/ETF y el
//      onboarding) no encontraba NINGÚN fondo: la proyección exigía type === 'etf'.
//   B. Un ISIN exacto devolvía 3 filas (ficha curada sin precio + 0P….F + ….SG).
//   C. La estrella sobre un resultado de búsqueda guardaba el símbolo pero
//      Seguimiento sólo pintaba el universo monitorizado.
// Ejecuta el código REAL de app.js en un vm; el proveedor se sustituye por la
// respuesta real de /api/search/assets?q=IE00BYX5NX33 (capturada 2026-11-09).
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function braceSlice(s, i) { let d = 0, k = s.indexOf('{', i); for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { let i = app.indexOf('async function ' + n + '('); if (i < 0) i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing fn ' + n); return braceSlice(app, i); }
function arrSrc(n) { const m = new RegExp('const ' + n + '\\s*=\\s*\\[').exec(app); let d = 0, k = m.index + m[0].length - 1; for (; k < app.length; k++) { if (app[k] === '[') d++; else if (app[k] === ']') { d--; if (!d) { k++; break; } } } return app.slice(m.index, k) + ';'; }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const PROVIDER = [
  { ticker: '0P0001CLDK.F', name: 'Fidelity MSCI World Index EUR P Acc', type: 'fund', marketSymbol: '0P0001CLDK.F', providerScore: 20014, exchange: 'Frankfurt' },
  { ticker: 'IE00BYX5NX33.SG', name: 'Fidelity MSCI World Index Fund ', type: 'fund', marketSymbol: 'IE00BYX5NX33.SG', providerScore: 20001, exchange: 'Stuttgart' },
];
const ctx = { console: { log() {}, warn() {} }, Math, JSON, Array, Object, String, Number, isFinite, RegExp, Date, Map, Set, Promise };
vm.createContext(ctx);
vm.runInContext(`
  const _AURIX_FUND_DISCOVERY = true;
  const _AURIX_FUND_MANAGER_LABEL = { fidelity: 'Fidelity' };
  const _AURIX_FUND_KEYWORDS = ['fund', 'fondo'];
  const ASSET_DB = [];
  function searchMetalsLocal() { return []; }
  async function searchCoinGeckoAPI() { return []; }
  var __provider = {}, __searches = 0;
  async function searchYahooFinance(q) { __searches++; return __provider[q] || []; }
`, ctx);
ctx.__provider = { IE00BYX5NX33: PROVIDER, '0P0001CLDK': [PROVIDER[0]] };
vm.runInContext(arrSrc('_AURIX_FUND_DB'), ctx);
vm.runInContext(arrSrc('_AURIX_ETF_DB'), ctx);
['_aurixParseFundMeta', '_aurixIsIsin', '_aurixSearchFundsLocal', '_aurixSearchEtfsLocal', '_aurixSearchProject',
 '_aurixSearchAliasHit', '_aurixSearchPopularity', '_aurixSearchTypeWeight', '_aurixSearchProviderWeight',
 '_aurixSearchIdentifierKey', '_aurixSearchMatchScore', '_aurixRankSearchResults', 'searchAllAssets', 'searchByFilter',
 'normalizeSymbol'].forEach(f => vm.runInContext(fnSrc(f), ctx));
vm.runInContext('globalThis.__sa = searchAllAssets; globalThis.__sbf = searchByFilter; globalThis.__proj = _aurixSearchProject;', ctx);

(async () => {
  console.log('\nAURIX-ISIN-ADD-WATCHLIST');

  // ── A · la pestaña «ETF / Fondos» incluye fondos ──
  const items = [{ type: 'etf' }, { type: 'fund' }, { type: 'stock' }];
  ok('A.1 proyección etf ⇒ etf + fund', ctx.__proj(items, 'etf').length === 2);
  ok('A.2 el resto de filtros sigue siendo estricto', ctx.__proj(items, 'stock').length === 1 && ctx.__proj(items, 'fund').length === 1);
  const addEtf = await ctx.__sbf('IE00BYX5NX33', 'etf');
  ok('A.3 Add Asset con pestaña ETF / Fondos encuentra el ISIN', addEtf.length >= 1, JSON.stringify(addEtf.map(x => x.ticker)));

  // ── B · un ISIN ⇒ un único fondo, con símbolo cotizable ──
  const all = await ctx.__sa('IE00BYX5NX33');
  ok('B.1 un ISIN de fondo ⇒ una sola fila', all.length === 1, JSON.stringify(all.map(x => x.ticker)));
  ok('B.2 gana la ficha curada (identidad completa)', all[0] && all[0].ticker === 'FID-WLD' && all[0].shareClass === 'P Acc EUR');
  ok('B.3 hereda el NAV Morningstar 0P… para cotizar', all[0] && all[0].marketSymbol === '0P0001CLDK.F');
  ok('B.4 Add Asset y lupa devuelven lo mismo', addEtf.length === 1 && addEtf[0].ticker === all[0].ticker);
  ctx.__provider['IE00BYX5NX33'] = PROVIDER.slice().reverse();
  const noCurated = await (async () => { const db = vm.runInContext('_AURIX_FUND_DB', ctx); const saved = db.splice(0); const r = await ctx.__sa('IE00BYX5NX33'); db.push(...saved); return r; })();
  ok('B.5 sin ficha curada: una fila y es el NAV 0P…, aunque el proveedor lo ordene detrás', noCurated.length === 1 && noCurated[0].marketSymbol === '0P0001CLDK.F', JSON.stringify(noCurated.map(x => x.ticker)));
  ctx.__provider['IE00BYX5NX33'] = PROVIDER;
  const name = await ctx.__sa('fidelity msci world');
  ok('B.6 consulta por nombre intacta (no se estampa ISIN fuera de una consulta ISIN)', !name.some(x => x.ticker === '0P0001CLDK.F' && x.isin));
  ok('B.7 ETF: cotizaciones por bolsa siguen separadas (§9)', /Sólo fondos: un ETF sí tiene/.test(app));

  // ── C · Seguimiento pinta lo marcado fuera del universo ──
  vm.runInContext(`
    var currentMarketTab = 'watchlist', _marketSearchQuery = '', __renders = 0, __wl = [];
    function getWatchlist() { return __wl.slice(); }
    function t(k) { return k; }
    function _aurixMktExpFlag() { return false; }
    function _aurixMktTableHeaderHtml() { return ''; }
    function renderMarketItem(i) { return '<row ' + i.symbol + ' ' + (i.price || '-') + '>'; }
    function renderCurrentMarketView() { __renders++; }
    function getDisplayName(r) { return r.name; }
    async function _yahooFundSymbolByISIN() { return '0P0001CLDK.F'; }
    var __nav = 14.07;
    async function _aurixMktHydrateQuotes(rows) { rows.forEach(r => { if (!(r.price > 0) && (r.marketSymbol === '0P0001CLDK.F' || r.symbol === '0P0001CLDK.F')) { r.price = __nav; } }); return rows; }
  `, ctx);
  const wlStart = app.indexOf('const _aurixWlExtra');
  vm.runInContext(app.slice(wlStart, app.indexOf('function renderMyAssetsBlock', wlStart)), ctx);
  ['_searchResultToMarketItem', 'renderMyAssetsBlock'].forEach(f => vm.runInContext(fnSrc(f), ctx));
  const universe = [{ symbol: 'BTC', price: 1, change24h: 0 }];
  ctx.__wl = ['BTC', '0P0001CLDK'];
  let html = vm.runInContext('renderMyAssetsBlock', ctx)(universe);
  ok('C.1 primer pintado: BTC y se lanza la resolución del fondo', /row BTC/.test(html));
  await new Promise(r => setTimeout(r, 20));
  html = vm.runInContext('renderMyAssetsBlock', ctx)(universe);
  ok('C.2 tras resolver: el fondo marcado aparece con precio', /row 0P0001CLDK\.F 14\.07/.test(html), html);
  ok('C.3 se repinta Seguimiento al resolver', vm.runInContext('__renders', ctx) >= 1);
  ctx.__wl = ['BTC', 'FIDWLD'];
  vm.runInContext('renderMyAssetsBlock', ctx)(universe);
  await new Promise(r => setTimeout(r, 20));
  html = vm.runInContext('renderMyAssetsBlock', ctx)(universe);
  ok('C.4 ficha curada marcada (FID-WLD) se resuelve por catálogo y cotiza', /row FID-WLD 14\.07/.test(html), html);
  ctx.__wl = ['BTC'];
  html = vm.runInContext('renderMyAssetsBlock', ctx)(universe);
  ok('C.5 lo que ya no está en la watchlist no se pinta', !/FID-WLD|0P0001CLDK/.test(html));
  const render = vm.runInContext('renderMyAssetsBlock', ctx);
  ctx.__wl = ['BTC', 'NOEXISTE'];
  let before = vm.runInContext('__searches', ctx);
  render(universe); await new Promise(r => setTimeout(r, 20));
  const afterFirst = vm.runInContext('__searches', ctx);
  for (let i = 0; i < 5; i++) { render(universe); await new Promise(r => setTimeout(r, 5)); }
  ok('C.7 un símbolo irresoluble se intenta UNA vez, no en cada repintado', afterFirst - before === 1 && vm.runInContext('__searches', ctx) === afterFirst,
     `${before}→${afterFirst}→${vm.runInContext('__searches', ctx)}`);
  ctx.__wl = ['BTC', 'ETH', 'AAPL'];
  before = vm.runInContext('__searches', ctx);
  render([]); await new Promise(r => setTimeout(r, 20));
  ok('C.8 con el universo aún cargando no se lanza ninguna búsqueda', vm.runInContext('__searches', ctx) === before);
  ctx.__wl = ['0P0001CLDK'];
  vm.runInContext('_aurixWlExtra.get("0P0001CLDK")._wlTs = 0; __nav = 15.5;', ctx);
  render(universe); await new Promise(r => setTimeout(r, 20));
  ok('C.9 la cotización de una fila extra se refresca (no queda congelada)', /row 0P0001CLDK\.F 15\.5/.test(render(universe)));
  vm.runInContext('_aurixWlExtra.get("0P0001CLDK")._wlTs = 0; __nav = 0;', ctx);
  render(universe); await new Promise(r => setTimeout(r, 20));
  ok('C.10 si el refresco falla se conserva la última cotización real', /row 0P0001CLDK\.F 15\.5/.test(render(universe)));
  ok('C.6 la estrella recuerda la identidad del resultado de búsqueda', /normalizeSymbol\(r\.symbol\) === sym\); if \(hit\) _aurixWlRemember\(hit\)/.test(app)
     && /toggleWatchlist\(sym\) && _aurixMktItem\._fromSearch\) _aurixWlRemember\(_aurixMktItem\)/.test(app));

  console.log(`\n${fail ? '✗ FAIL' : '✓ PASS'}  ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
