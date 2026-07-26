'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-SEARCH-RANKING-harness — SEARCH V2.1 (unified institutional search, phase 1)
// ════════════════════════════════════════════════════════════════════════════
// The previous ranker had four string tiers (exact → startsWith → includes → rest) and no
// notion of what the user actually wants, so an index could outrank the ETF that tracks it
// and a look-alike token could outrank BTC. This proves the unified scorer against the REAL
// app.js source, with deterministic fixtures shaped exactly like what the providers return
// (no network, no DOM), over the query list the SPEC requires.
//
// It also pins the honesty of the data: our providers do NOT return market cap or volume for
// equities/ETFs on their SEARCH endpoints, so the popularity term must stay NEUTRAL for them
// instead of being fabricated. Only CoinGecko's market_cap_rank and Yahoo's own score are real.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(s, i) { let d = 0, k = s.indexOf('{', i); const isB = s[i] === '['; if (isB) k = i; const open = s[k], close = open === '[' ? ']' : '}'; for (; k < s.length; k++) { const c = s[k]; if (c === open) d++; else if (c === close) { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing fn ' + n); return braceSlice(app, i); }
function konstSrc(n) { const m = new RegExp('const ' + n + '\\s*=\\s*').exec(app); if (!m) throw new Error('missing const ' + n); const eq = m.index + m[0].length, f = app[eq]; if (f === '{' || f === '[') { const b = braceSlice(app, eq); const s = app.indexOf(';', eq + b.length); return app.slice(m.index, s + 1); } const s = app.indexOf(';', eq); return app.slice(m.index, s + 1); }
let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } };

const ctx = { console: { log() {} }, Math, JSON, Array, Object, String, Number, isFinite, RegExp, Date };
vm.createContext(ctx);
['_AURIX_FUND_DISCOVERY', '_AURIX_FUND_MANAGER_LABEL', '_AURIX_FUND_KEYWORDS', '_AURIX_FUND_DB'].forEach(c => vm.runInContext(konstSrc(c), ctx));
['_aurixSearchAliasHit', '_aurixSearchPopularity', '_aurixSearchTypeWeight', '_aurixSearchProviderWeight',
 '_aurixSearchMatchScore', '_aurixRankSearchResults', '_aurixSearchSubtitle'].forEach(f => vm.runInContext(fnSrc(f), ctx));
const call = (n, ...a) => vm.runInContext(n, ctx)(...a);
const rank = (items, q) => call('_aurixRankSearchResults', items, q).map(x => x.ticker);
const sub  = a => call('_aurixSearchSubtitle', a);

console.log('AURIX-SEARCH-RANKING — SEARCH V2.1 (phase 1)\n');

// ── 0 ONE ranking authority, used by every surface ───────────────────────────
console.log('0 — motor único:');
ok('0 marker present', app.indexOf('SEARCH-V2.1') >= 0);
ok('0 a single ranking function exists', (app.match(/function _aurixRankSearchResults\(/g) || []).length === 1);
// MARKET-INSTITUTIONAL-V1 amplió searchAllAssets (catálogo curado de ETF + comentarios
// de causa raíz), así que la llamada al ranker quedó a ~3.9k chars del inicio de la
// función y la ventana de 3000 ya no la alcanzaba. Se amplía la ventana: lo que este
// assert protege —que searchAllAssets ordene por el ranker canónico— no ha cambiado.
ok('0 searchAllAssets ranks through it', /searchAllAssets[\s\S]{0,6000}_aurixRankSearchResults\(merged, query\)/.test(app));
ok('0 the filtered route ranks through the SAME function', (app.match(/_aurixRankSearchResults\(merged, query\)/g) || []).length >= 2);
ok('0 no second/alternate ranker was introduced', !/function _aurix\w*Rank\w*Results2|function _aurixMarketRankSearch/.test(app));

// ── 1 never alphabetical ─────────────────────────────────────────────────────
console.log('\n1 — nunca alfabético:');
{
  const items = [
    { ticker: 'ZZZ', name: 'Zulu Unrelated Holding' },
    { ticker: 'AAA', name: 'Alpha Unrelated Corp' },
    { ticker: 'APPLE', name: 'Apple Inc.', type: 'stock', marketSymbol: 'AAPL' },
  ];
  const r = rank(items, 'apple');
  ok('1 relevance beats alphabetical order', r[0] === 'APPLE', r.join(','));
}

// ── 2 los ejemplos del SPEC ──────────────────────────────────────────────────
console.log('\n2 — consultas del SPEC:');
// "S&P 500" — the investable ETFs must beat the index the user cannot buy.
{
  const items = [
    { ticker: '^GSPC', name: 'S&P 500',                 type: 'index',  marketSymbol: '^GSPC', providerScore: 900000 },
    { ticker: 'VOO',   name: 'Vanguard S&P 500 ETF',    type: 'etf',    marketSymbol: 'VOO',   providerScore: 40000 },
    { ticker: 'IVV',   name: 'iShares Core S&P 500 ETF',type: 'etf',    marketSymbol: 'IVV',   providerScore: 30000 },
  ];
  const r = rank(items, 's&p 500');
  ok('2 "S&P 500" → ETF invertible por delante del índice', r[0] !== '^GSPC' && r.indexOf('^GSPC') === r.length - 1, r.join(','));
}
// "Nasdaq"
{
  const items = [
    { ticker: '^IXIC', name: 'NASDAQ Composite',            type: 'index', marketSymbol: '^IXIC', providerScore: 800000 },
    { ticker: 'QQQ',   name: 'Invesco QQQ Trust (Nasdaq 100)', type: 'etf', marketSymbol: 'QQQ', providerScore: 50000 },
  ];
  ok('2 "Nasdaq" → ETF conocido primero', rank(items, 'nasdaq')[0] === 'QQQ', rank(items, 'nasdaq').join(','));
}
// "World" — word-start match inside the name must beat a mid-token match.
{
  const items = [
    { ticker: 'XWLD', name: 'Someworldish Micro Trust',      type: 'etf', marketSymbol: 'XWLD' },
    { ticker: 'IWDA', name: 'iShares Core MSCI World UCITS ETF', type: 'etf', marketSymbol: 'IWDA' },
  ];
  ok('2 "World" → MSCI World por delante de una coincidencia a mitad de palabra', rank(items, 'world')[0] === 'IWDA', rank(items, 'world').join(','));
}
// "Gold"
{
  const items = [
    { ticker: 'GOLDMINER', name: 'Small Gold Miner Corp', type: 'stock', marketSymbol: 'GM1' },
    { ticker: 'XAU',       name: 'Oro (Gold)',            type: 'metal', marketSymbol: 'GC=F' },
  ];
  ok('2 "Gold" → el activo de oro primero', rank(items, 'gold')[0] === 'XAU', rank(items, 'gold').join(','));
}
// "Bitcoin" — real market-cap rank must beat a look-alike derivative.
{
  const items = [
    { ticker: 'BTCUP', name: 'Bitcoin Up Leveraged Token', type: 'crypto', coinId: 'btcup', marketCapRank: 4200 },
    { ticker: 'BTC',   name: 'Bitcoin',                    type: 'crypto', coinId: 'bitcoin', marketCapRank: 1 },
  ];
  ok('2 "Bitcoin" → BTC por delante de derivados', rank(items, 'bitcoin')[0] === 'BTC', rank(items, 'bitcoin').join(','));
}
// Tickers exactos del SPEC
{
  const items = [
    { ticker: 'VOOG', name: 'Vanguard S&P 500 Growth ETF', type: 'etf', marketSymbol: 'VOOG' },
    { ticker: 'VOO',  name: 'Vanguard S&P 500 ETF',        type: 'etf', marketSymbol: 'VOO' },
  ];
  for (const [q, want] of [['voo', 'VOO'], ['VOO', 'VOO']]) {
    ok(`2 ticker exacto "${q}" primero`, rank(items, q)[0] === want, rank(items, q).join(','));
  }
}
{
  const items = [{ ticker: 'SPYG', name: 'SPDR Portfolio Growth', type: 'etf' }, { ticker: 'SPY', name: 'SPDR S&P 500 ETF Trust', type: 'etf' }];
  ok('2 "SPY" exacto primero', rank(items, 'spy')[0] === 'SPY', rank(items, 'spy').join(','));
  const iv = [{ ticker: 'IVVW', name: 'iShares Covered Call', type: 'etf' }, { ticker: 'IVV', name: 'iShares Core S&P 500 ETF', type: 'etf' }];
  ok('2 "IVV" exacto primero', rank(iv, 'ivv')[0] === 'IVV', rank(iv, 'ivv').join(','));
}
// Gestoras
{
  const items = [
    { ticker: 'ZZV', name: 'Zeta Fund holding vanguard stake', type: 'etf' },
    { ticker: 'VUAA', name: 'Vanguard S&P 500 UCITS ETF USD Acc', type: 'etf', isin: 'IE00BFMXXD54', manager: 'Vanguard' },
  ];
  ok('2 "Vanguard" → producto de la gestora antes que una mención suelta', rank(items, 'vanguard')[0] === 'VUAA', rank(items, 'vanguard').join(','));
  const bl = [
    { ticker: 'ZBR', name: 'Zebra Corp mentions blackrock', type: 'stock' },
    { ticker: 'BLK-ICS', name: 'BlackRock ICS Euro Liquidity', type: 'fund', isin: 'IE00B3ZJFC95', manager: 'BlackRock' },
  ];
  ok('2 "BlackRock" → producto de la gestora primero', rank(bl, 'blackrock')[0] === 'BLK-ICS', rank(bl, 'blackrock').join(','));
}

// ── 3 señales, y honestidad sobre las que NO existen ─────────────────────────
console.log('\n3 — señales de ranking:');
ok('3.1 exacto > prefijo de nombre > prefijo de ticker > inicio de palabra > contiene',
   call('_aurixSearchMatchScore', { ticker: 'AAPL', name: 'Apple' }, 'aapl') === 1000
   && call('_aurixSearchMatchScore', { ticker: 'X', name: 'apple inc' }, 'apple') === 700
   && call('_aurixSearchMatchScore', { ticker: 'APPLX', name: 'zzz' }, 'appl') === 650
   && call('_aurixSearchMatchScore', { ticker: 'X', name: 'MSCI World ETF' }, 'world') === 500
   && call('_aurixSearchMatchScore', { ticker: 'X', name: 'someworldish' }, 'world') === 300);
ok('3.3 alias reutiliza el catálogo existente (sin sistema nuevo)',
   call('_aurixSearchAliasHit', { isin: 'IE00B3ZJFC95' }, 'monetario') > 0
   && call('_aurixSearchAliasHit', { isin: 'IE00B3ZJFC95' }, 'zzzz') === 0);
ok('3.4/5/6 popularidad real: market_cap_rank (cripto) y score de Yahoo',
   call('_aurixSearchPopularity', { marketCapRank: 1 }) > call('_aurixSearchPopularity', { marketCapRank: 5000 })
   && call('_aurixSearchPopularity', { providerScore: 100000 }) > call('_aurixSearchPopularity', { providerScore: 10 }));
// HONESTY PIN — no provider gives cap/volume for equities on a search endpoint, so an item
// with no real signal must score NEUTRAL. If someone later fabricates one, this fails.
ok('3.4/5/6 sin dato real ⇒ 0 (no se inventa capitalización ni volumen)',
   call('_aurixSearchPopularity', { type: 'stock', ticker: 'AAPL' }) === 0
   && call('_aurixSearchPopularity', {}) === 0);
ok('3.7 calidad de proveedor: catálogo curado > hit de proveedor > local',
   call('_aurixSearchProviderWeight', { isin: 'IE00B03HD191', manager: 'Vanguard' })
   > call('_aurixSearchProviderWeight', { marketSymbol: 'VOO' })
   && call('_aurixSearchProviderWeight', { marketSymbol: 'VOO' }) > call('_aurixSearchProviderWeight', {}));
// El índice se penaliza un tier COMPLETO; el resto de tipos invertibles son IGUALES entre sí
// (preferir etf/fondo sobre acción hundía BLK bajo códigos 0P* en datos reales).
ok('3.8 tipo: índice penalizado un tier completo; el resto, neutral',
   call('_aurixSearchTypeWeight', { type: 'index' }) <= -1000
   && call('_aurixSearchTypeWeight', { type: 'etf' }) === call('_aurixSearchTypeWeight', { type: 'stock' })
   && call('_aurixSearchTypeWeight', { type: 'metal' }) > 0);

// ── 4 estabilidad y conservación del conjunto ────────────────────────────────
console.log('\n4 — estabilidad:');
{
  const same = [{ ticker: 'X1', name: 'nvidia corp' }, { ticker: 'X2', name: 'nvidia holding' }];
  ok('4 empate ⇒ conserva el orden de entrada', rank(same, 'nvidia').join(',') === 'X1,X2');
  const set = [{ ticker: 'SPY', name: 'SPDR S&P 500' }, { ticker: 'QQQ', name: 'Invesco QQQ' }, { ticker: 'VTI', name: 'Vanguard Total' }];
  const out = rank(set, 'spy');
  ok('4 no pierde ni duplica resultados', out.length === 3 && ['SPY', 'QQQ', 'VTI'].every(t => out.includes(t)));
  ok('4 determinista (misma entrada ⇒ misma salida)', rank(set, 'spy').join() === rank(set, 'spy').join());
}

// ── 5 presentación: el nombre manda, el ticker acompaña ──────────────────────
console.log('\n5 — jerarquía de la tarjeta:');
ok('5 el nombre completo es la línea principal (getDisplayName)', /class="sugg-name">\$\{escHtml\(getDisplayName\(a\)\)\}/.test(app));
ok('5 línea secundaria = ticker · tipo · gestora', sub({ type: 'etf', ticker: 'VOO', manager: 'Vanguard' }) === 'VOO · ETF · Vanguard', sub({ type: 'etf', ticker: 'VOO', manager: 'Vanguard' }));
ok('5 una acción ya NO muestra un ticker desnudo', sub({ type: 'stock', ticker: 'AAPL' }) === 'AAPL · STOCK');
ok('5 fondo conserva los desambiguadores de SPEC 66/70 detrás del ticker',
   sub({ type: 'fund', ticker: 'VG-WLD', manager: 'Vanguard', shareClass: 'EUR Acc', isin: 'IE00B03HD191' })
   === 'VG-WLD · FUND · Vanguard · EUR Acc · IE00B03HD191');
ok('5 el chip de tipo duplicado se retiró (el tipo vive en el subtítulo; el color, en el badge)',
   !/<span class="sugg-type \$\{a\.type\}">/.test(app) && /\.sugg-badge\.\w+/.test(fs.readFileSync(path.join(root, 'styles.css'), 'utf8')));

// ── 6 logos ──────────────────────────────────────────────────────────────────
console.log('\n6 — logos:');
{
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  ok('6 el contenedor del badge posiciona y recorta (la img es absolute/inset:0)',
     /\.asset-icon,[\s\S]{0,80}\.sugg-badge,[\s\S]{0,80}\.add-v2-asset-icon \{ position: relative; overflow: hidden; \}/.test(css));
  ok('6 stock/ETF/fondo usan contain (nunca recortados); cripto usa cover',
     /\.aicon--stock \.aurix-aicon-img,[\s\S]{0,120}object-fit: contain/.test(css) && /\.aicon--crypto \.aurix-aicon-img \{ object-fit: cover; \}/.test(css));
  ok('6 la búsqueda reutiliza el MISMO owner de icono que el resto de superficies',
     /_assetIconHtml\(a, a\.ticker, 'sugg-badge '/.test(app));
}

// ── 7 los proxies pasan las señales sin cambiar de proveedor ─────────────────
console.log('\n7 — proxies:');
{
  const a = fs.readFileSync(path.join(root, 'api/search/assets.js'), 'utf8');
  const c = fs.readFileSync(path.join(root, 'api/search/crypto.js'), 'utf8');
  ok('7 Yahoo: providerScore + exchange desde la MISMA respuesta', /providerScore:/.test(a) && /exchange:/.test(a));
  ok('7 CoinGecko: market_cap_rank desde la MISMA respuesta', /marketCapRank:/.test(c));
  ok('7 sin proveedores nuevos', !/api\.polygon|finnhub|alphavantage|iexcloud/i.test(a + c));
  ok('7 sigue siendo el mismo endpoint de Yahoo (una sola petición)', (a.match(/query1\.finance\.yahoo\.com/g) || []).length === 1);
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
