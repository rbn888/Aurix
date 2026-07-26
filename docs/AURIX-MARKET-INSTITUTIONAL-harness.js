'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MARKET-INSTITUTIONAL-harness — SPEC MARKET INSTITUTIONAL V1
// ════════════════════════════════════════════════════════════════════════════
// Cubre SÓLO lo que este SPEC añade. No repite lo que ya protegen
// AURIX-MARKET-FOUNDATION (retícula, estados, fila/estrella, carrusel) ni
// AURIX-SECURITY-BASELINE. Donde puede, ejecuta el código real del bundle en vez
// de comprobar que "existe una línea".
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { return ''; } };
const app = read('app.js'), css = read('styles.css'), indexHtml = read('index.html');
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '');
const appCode = app.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x ? '  → ' + x : '')); } };
function fnSource(name) {
  const i = app.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0, st = false;
  for (let k = i; k < app.length; k++) { if (app[k] === '{') { d++; st = true; } else if (app[k] === '}') { d--; if (st && !d) return app.slice(i, k + 1); } }
  return '';
}
function bracketAt(i) { let d = 0, j = app.indexOf('[', i); for (let k = j; k < app.length; k++) { if (app[k] === '[') d++; else if (app[k] === ']') { d--; if (!d) return app.slice(j, k + 1); } } return ''; }

console.log('AURIX-MARKET-INSTITUTIONAL — SPEC MARKET INSTITUTIONAL V1\n');

// ── 1. Discovery unificado: Market usa el pipeline de Add Asset ─────────────
console.log('1 — Market y Add Asset comparten discovery (sin buscador ni ranking paralelo):');
const disc = fnSource('_aurixMktDiscover');
ok('1.1 Market recupera con searchAllAssets (el mismo owner que Add Asset)', /searchAllAssets\(q,/.test(disc));
ok('1.2 traduce con el puente existente _searchResultToMarketItem', /_searchResultToMarketItem\(r\)/.test(disc));
ok('1.3 NO existe un segundo ranking: sólo hay un _aurixRankSearchResults',
   (app.match(/^function _aurixRankSearchResults\(/gm) || []).length === 1 &&
   !/function _aurixMkt(Rank|Score)[A-Za-z]*\(/.test(app));
ok('1.4 la búsqueda de Market ya NO filtra localmente MARKET_DATA',
   !/const filtered = data\.filter\(item => \{[\s\S]{0,200}sym\.includes\(q\)/.test(appCode));
ok('1.5 una sola petición en vuelo: cancela la anterior', /_mktDiscAbort\.abort\(\)/.test(disc));
ok('1.6 hay debounce y caché de consultas (sin peticiones duplicadas)',
   /_MKT_DISC_DEBOUNCE/.test(app) && /_mktDiscCache/.test(app) && /_mktDiscCache\.size > _MKT_DISC_CACHE_MAX/.test(app));
ok('1.7 los precios se hidratan por el endpoint YA existente (sin proveedor nuevo)',
   /\$\{PRICES_PROXY\}\/snapshot\?symbols=/.test(fnSource('_aurixMktHydrateQuotes')));

// ── 2. Catálogo curado: identidad, nunca datos de mercado ───────────────────
console.log('\n2 — Catálogo curado de ETF (§3): sólo identidad, cero datos de mercado:');
const etfDb = bracketAt(app.indexOf('const _AURIX_ETF_DB = ['));
let ETF = [];
try { ETF = eval(etfDb); } catch (_) {}
ok('2.1 el catálogo se lee y tiene entradas', Array.isArray(ETF) && ETF.length >= 20, 'n=' + (ETF || []).length);
ok('2.2 NINGUNA entrada guarda precio, capitalización, volumen ni rentabilidad',
   ETF.every(e => !('price' in e) && !('marketCap' in e) && !('volume' in e) && !('change24h' in e) && !('performance' in e)));
ok('2.3 toda entrada lleva identidad completa (ticker, símbolo, nombre, gestora, moneda, ISIN)',
   ETF.every(e => e.ticker && e.marketSymbol && e.name && e.manager && e.currency && e.isin));
// Las familias que §12 exige recuperar, resueltas con el matcher REAL del bundle.
const _aurixIsIsin = () => false;
let matcher = null;
try { matcher = new Function('_AURIX_ETF_DB', '_aurixIsIsin', fnSource('_aurixSearchEtfsLocal') + '; return _aurixSearchEtfsLocal;')(ETF, _aurixIsIsin); } catch (_) {}
ok('2.4 el matcher curado es ejecutable', typeof matcher === 'function');
if (matcher) {
  const has = (q, list) => { const r = matcher(q).map(x => x.ticker); return list.every(t => r.includes(t)); };
  ok('2.5 "S&P 500" recupera VOO, SPY, IVV, VUAA, CSPX y SXR8 (§12)',
     has('S&P 500', ['VOO', 'SPY', 'IVV', 'VUAA.L', 'CSPX.L', 'SXR8.DE']));
  ok('2.6 "Nasdaq 100" recupera QQQ, QQQM, EQQQ y CNDX (§12)',
     has('Nasdaq 100', ['QQQ', 'QQQM', 'EQQQ.L', 'CNDX.L']));
  ok('2.7 "MSCI World" recupera IWDA, SWDA, EUNL y URTH', has('MSCI World', ['IWDA.AS', 'SWDA.L', 'EUNL.DE', 'URTH']));
  ok('2.8 "Oro" recupera GLD, IAU, SGLN, PHAU y 4GLD', has('Oro', ['GLD', 'IAU', 'SGLN.L', 'PHAU.L', '4GLD.DE']));
}
ok('2.9 el catálogo entra por el MISMO punto del pipeline que el de fondos',
   /for \(const item of \[\.\.\.curatedEtfs, \.\.\.funds, \.\.\.metals/.test(app));

// ── 3. Deduplicación ────────────────────────────────────────────────────────
console.log('\n3 — Deduplicación (§9): sin duplicados y sin fusionar lo que es distinto:');
ok('3.1 además del ISIN se deduplica por TICKER EXACTO (colapsa curado ↔ proveedor)',
   /const tkey = 'TK:' \+ String\(item\.ticker \|\| ''\)\.toUpperCase\(\)\.trim\(\);/.test(app) &&
   /if \(seen\.has\(key\) \|\| seen\.has\(tkey\)\) continue;/.test(app));
ok('3.2 el ticker NO se normaliza al deduplicar (IWDA.AS y SWDA.L siguen separados)',
   !/const tkey = 'TK:' \+ normalizeSymbol/.test(app));

// ── 4. Ruido tokenizado fuera de las exposiciones tradicionales ─────────────
console.log('\n4 — Filtros tradicionales sin tokenizados/DeFi/wrapped:');
const filt = fnSource('_aurixMktIsTraditionalAsset');
ok('4.1 existe la regla y descarta el tipo cripto', /type === 'crypto'/.test(filt));
let isTrad = null;
try { isTrad = new Function('_MKT_RX_TOKENIZED', fnSource('_aurixMktIsTraditionalAsset') + '; return _aurixMktIsTraditionalAsset;')(eval(/const _MKT_RX_TOKENIZED = (\/.*\/i);/.exec(app)[1])); } catch (_) {}
ok('4.2 la regla es ejecutable', typeof isTrad === 'function');
if (isTrad) {
  const NOISE = ['SPDR S&P 500 ETF (Ondo Tokenized ETF)', 'Backed CSPX Core S&P 500', 'DeFi S&P 500',
                 'iShares TIPS Bond ETF (Ondo Tokenized ETF)', 'Wrapped Bitcoin', 'Staked ETH'];
  const REAL = ['SPDR S&P 500 ETF Trust', 'Vanguard S&P 500 ETF', 'iShares Core MSCI World UCITS ETF (Acc)',
                'iShares Core U.S. Aggregate Bond ETF', 'SPDR Gold Shares', 'Fidelity MSCI World'];
  ok('4.3 descarta envoltorios tokenizados / DeFi / wrapped / staked',
     NOISE.every(n => !isTrad({ type: 'etf', name: n })), NOISE.filter(n => isTrad({ type: 'etf', name: n })).join(' | '));
  ok('4.4 NO descarta ningún producto tradicional real',
     REAL.every(n => isTrad({ type: 'etf', name: n })), REAL.filter(n => !isTrad({ type: 'etf', name: n })).join(' | '));
  ok('4.5 un activo cripto nunca pasa el filtro tradicional', !isTrad({ type: 'crypto', name: 'Bitcoin' }));
}
ok('4.6 el filtro se aplica SÓLO a fondos/ETF, índices y materias primas',
   /_MKT_TRADITIONAL_TABS = \{ etfs: true, funds: true, indices: true, commodities: true \}/.test(app));
ok('4.7 la pestaña Cripto y el buscador global quedan intactos',
   /if \(!_MKT_TRADITIONAL_TABS\[currentMarketTab\]\) return rows;/.test(app) &&
   !/_aurixMktFilterTraditional/.test(fnSource('searchAllAssets')));
ok('4.8 nunca deja la lista vacía: si el filtro lo borra todo, devuelve lo recuperado',
   /return kept\.length \? kept : rows;/.test(app));

// ── 5. Capitalización retirada de la UI ─────────────────────────────────────
console.log('\n5 — Capitalización (§3 del feedback): fuera de la UI, sin dato inventado:');
ok('5.1 la fila NO emite celda de capitalización', !/class="col col-cap/.test(app));
ok('5.2 la cabecera NO declara columna de capitalización', !/CAP\.|MKT CAP/.test(app));
ok('5.3 no se ofrece ordenación por capitalización en ninguna superficie',
   !/data-mkt-sort="cap/.test(indexHtml) && !/key: 'cap'/.test(app));
// HOTFIX ROW-GEOMETRY: cinco columnas de DATOS y una pista de aire flexible en el
// MEDIO (pista 2). En v609 ese aire iba al final y dejaba ~190px muertos a la derecha
// de la estrella mientras Precio/24H/Tendencia quedaban comprimidos.
ok('5.4 la rejilla web tiene 5 columnas de datos y el aire flexible en el medio',
   /grid-template-columns: minmax\(0, 420px\) 124px minmax\(32px, 1fr\) 100px minmax\(32px, 1fr\) 172px 44px;/.test(cssCode) &&
   !/minmax\(0, 500px\) minmax\(20px, 1fr\) 118px/.test(cssCode));
ok('5.5 la capitalización NUNCA se calcula ni se estima (sólo se acepta explícita)',
   /const v = Number\(row && \(row\.marketCap \?\? row\.market_cap\)\);/.test(app) &&
   !/marketCap\s*=\s*(price|qty|shares)/.test(app));

// ── 6. Identidad ────────────────────────────────────────────────────────────
console.log('\n6 — Identidad (§7/§9): nombre completo primero, metadatos sólo si existen:');
const row = fnSource('renderMarketItem');
ok('6.1 el título es el nombre completo, no el ticker', /const idTitle = \(name && name !== item\.symbol\) \? name : item\.symbol;/.test(row));
ok('6.2 nombre truncado lleva title= con el nombre completo', /class="mkt-id-name" title="\$\{escHtml\(idTitle\)\}"/.test(row));
ok('6.3 cada metadato se pinta SÓLO si el dato existe (nada deducido)',
   /item\.issuer   \? .+ : '',/.test(row) && /item\.exchange \? .+ : '',/.test(row) && /item\.currency \? .+ : '',/.test(row));
ok('6.4 el tipo usa etiqueta corta de instrumento, no el rótulo de la pestaña',
   /_aurixMktShortType\(item\.type\)/.test(row) && /function _aurixMktShortType\(/.test(app));
ok('6.5 la gestora sale del dato del activo, nunca de una constante fija',
   /row\.issuer   = r\.manager \|\| r\.issuer \|\| null;/.test(app));

// ── 7. Sparkline y estados ──────────────────────────────────────────────────
console.log('\n7 — Sparkline compacto y estados honestos:');
ok('7.1 la pista del sparkline es FIJA en web (no crece con la pantalla)',
   /#marketList \.col-chart \{[^}]*width: 172px; max-width: 172px;/.test(cssCode));
ok('7.2 el svg se recorta al ancho de su pista', /#marketList \.col-chart svg \{ width: 172px !important; max-width: 172px;/.test(cssCode));
ok('7.3 en móvil el sparkline es amplio (rango 68–88px) y no hereda anchos de web',
   /width: 68px; max-width: 68px;/.test(cssCode) && /width: 68px !important;/.test(cssCode) &&
   !/width: 44px; max-width: 44px;/.test(cssCode));
ok('7.4 el nombre puede ocupar dos líneas en móvil antes de truncar',
   /-webkit-line-clamp: 2;/.test(cssCode));
ok('7.5 la identidad no puede solaparse con el precio: cada uno tiene su pista real',
   /grid-template-columns: minmax\(0, 1fr\) 84px 68px 28px;/.test(cssCode) &&
   !/minmax\(0, 1fr\) 44px max-content 30px/.test(cssCode));
ok('7.6 el skeleton tiene UN owner y la geometría de la fila real',
   (app.match(/^function _aurixMktSkeletonHtml\(/gm) || []).length === 1);
ok('7.7 no puede quedarse en skeleton permanente: siempre repinta al terminar',
   /if \(_mktDiscQuery === tag\) renderCurrentMarketView\(\);/.test(disc));
ok('7.8 no se relanza una recuperación ya en vuelo (abortaría la suya propia)',
   /if \(_mktDiscQuery !== tag\) \{ _aurixMktDiscover\(cq, \{ silent: true \}\); return _aurixMktSkeletonHtml\(6\); \}/.test(app));

// ── 8. Nada de datos ni de backend ──────────────────────────────────────────
console.log('\n8 — Sin cambios de datos, persistencia ni proveedores:');
ok('8.1 los universos vivos siguen intactos',
   /const MARKET_ETFS +=\s*\['SPY','QQQ','VOO','VTI','URTH'\];/.test(app));
ok('8.2 no se añadió ningún endpoint nuevo', !/api\/market\/|api\/quotes|api\/screener/.test(app));
ok('8.3 el discovery de Market no escribe en localStorage ni en Supabase',
   !/localStorage\.setItem|supabase\./.test(disc) && !/localStorage\.setItem/.test(fnSource('_aurixMktChipListHtml')));
ok('8.4 la barrera de persistencia sigue en pie',
   /_aurixPersistenceReady/.test(app) && /const _AURIX_BLOCK_DESTRUCTIVE_SAVES = true;/.test(app));

// ── 9. HOTFIX: flujo de alta, histórico de índices y retícula compacta ──────
console.log('\n9 — HOTFIX (alta desde ficha · histórico de índices · retícula):');
// 9a — el adaptador de fila → selección: la causa era que MARKET_DATA no trae `ticker`
// y selectAsset() empieza por entry.ticker.slice(0,4).
let toSel = null, addable = null;
try {
  const src = fnSource('_aurixMktAddableType') + '\n' + fnSource('_aurixMktToSelection');
  const norm = s => String(s||'').toUpperCase().replace(/\.[A-Z]{1,3}$/,'').replace(/\//g,'').replace(/-/g,'').replace(/^\^/,'').trim();
  const f = new Function('normalizeSymbol', src + '; return {a:_aurixMktAddableType, s:_aurixMktToSelection};')(norm);
  addable = f.a; toSel = f.s;
} catch (_) {}
ok('9.1 el adaptador fila→selección es ejecutable', typeof toSel === 'function');
if (toSel) {
  const row = { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', type: 'etfs', price: 738.93 };
  const sel = toSel(row);
  ok('9.2 una fila de MARKET_DATA (sin ticker) produce un ticker válido para selectAsset',
     !!sel && sel.ticker === 'SPY' && typeof sel.ticker.slice === 'function');
  ok('9.3 el tipo se traduce al vocabulario del alta (etfs → etf)', !!sel && sel.type === 'etf');
  ok('9.4 crypto / stock / fund / metal son añadibles',
     addable({type:'crypto',symbol:'BTC'}) === 'crypto' && addable({type:'stock',symbol:'AAPL'}) === 'stock' &&
     addable({type:'funds',symbol:'X'}) === 'fund' && addable({type:'metal',symbol:'XAU'}) === 'metal');
  ok('9.5 un índice NO es añadible (no es una posición que se pueda mantener)',
     addable({type:'indices',symbol:'GSPC'}) === null && toSel({type:'indices',symbol:'GSPC'}) === null);
  ok('9.6 el oro spot sí es añadible como metal; una materia prima genérica no',
     addable({type:'commodity',symbol:'XAU/USD'}) === 'metal' && addable({type:'commodity',symbol:'WTI'}) === null);
  ok('9.7 no se inventa identidad: sin gestora ni moneda, no se emiten esos campos',
     (() => { const x = toSel({symbol:'AAPL', type:'stock'}); return !('manager' in x) && !('assetCurrency' in x); })());
}
ok('9.8 si el activo no es añadible NO se abre nada (jamás el buscador general)',
   /if \(!sel\) return;/.test(app) && /_aurixMktClose\(\);\s*\/\/ cerrar la ficha ANTES/.test(app));
ok('9.9 el CTA se deshabilita con motivo real en lugar de ofrecerse en falso',
   /addBtn\.disabled = !addable;/.test(app) && /t\('mkt_not_addable'\)/.test(app));
// 9b — histórico de índices
let pick = null;
try { pick = new Function('MARKET_INDICES', fnSource('_aurixMktPickAdapter') + '; return _aurixMktPickAdapter;')(['^GSPC','^IXIC','^DJI']); } catch (_) {}
ok('9.10 el selector de adaptador es ejecutable', typeof pick === 'function');
if (pick) {
  const sym = (it) => { const a = pick(it); return a && a.args ? a.args.symbol : null; };
  ok('9.11 los índices recuperan su "^" (GSPC → ^GSPC), que es lo que Yahoo acepta',
     sym({type:'indices',symbol:'GSPC'}) === '^GSPC' && sym({type:'indices',symbol:'IXIC'}) === '^IXIC' &&
     sym({type:'indices',symbol:'DJI'}) === '^DJI');
  ok('9.12 un índice con sufijo de mercado NO recibe "^" (no se rompe 000001.SS)',
     sym({type:'indices',symbol:'000001.SS'}) === '000001.SS');
  ok('9.13 los demás tipos no cambian de dirección', sym({type:'etf',symbol:'SPY'}) === 'SPY');
  ok('9.14 crypto sigue yendo por su propio adaptador',
     (pick({type:'crypto',symbol:'BTC',coinId:'bitcoin'}) || {}).kind === 'crypto');
}
// 9c — retícula compacta
ok('9.15 la identidad tiene techo por viewport (430–560px) y no absorbe el sobrante',
   /minmax\(0, 420px\)/.test(cssCode) && /minmax\(0, 360px\)/.test(cssCode) && /minmax\(0, 480px\)/.test(cssCode));
ok('9.16 la tendencia se mantiene en ~168px', /172px/.test(cssCode));
ok('9.17 móvil conserva nombre a dos líneas y rejilla propia (no hereda la de web)',
   /-webkit-line-clamp: 2;/.test(cssCode) &&
   /grid-template-columns: minmax\(0, 1fr\) 84px 68px 28px;/.test(cssCode) &&
   !/minmax\(0, 500px\)[^;]*;\s*[^}]*max-width: 768px/.test(cssCode));
ok('9.18 header y filas comparten pistas: colocación explícita, sin absolutos ni transforms',
   /#marketList \.market-row > \.col-price,\s*\n\s*#marketList \.market-table-header > div:nth-child\(2\) \{ grid-column: 2; \}/.test(cssCode) &&
   !/#marketList[^{]*\.col-[a-z]+[^{]*\{[^}]*position:\s*absolute/.test(cssCode));

console.log('\nRESULT: ' + (fail === 0 ? 'ALL PASS ✓' : 'FAIL ✗') + '  (' + pass + ' passed, ' + fail + ' failed)');
process.exit(fail === 0 ? 0 : 1);
