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
   /width: 70px; max-width: 70px;/.test(cssCode) && /width: 70px !important;/.test(cssCode) &&
   !/width: 44px; max-width: 44px;/.test(cssCode));
ok('7.4 el nombre puede ocupar dos líneas en móvil antes de truncar',
   /-webkit-line-clamp: 2;/.test(cssCode));
ok('7.5 la identidad no puede solaparse con el precio: cada uno tiene su pista real',
   /grid-template-columns: minmax\(0, 140px\) 84px minmax\(0, 1fr\) 70px 28px;/.test(cssCode) &&
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
   /grid-template-columns: minmax\(0, 140px\) 84px minmax\(0, 1fr\) 70px 28px;/.test(cssCode) &&
   !/minmax\(0, 500px\)[^;]*;\s*[^}]*max-width: 768px/.test(cssCode));
ok('9.18 header y filas comparten pistas: colocación explícita, sin absolutos ni transforms',
   /#marketList \.market-row > \.col-price,\s*\n\s*#marketList \.market-table-header > div:nth-child\(2\) \{ grid-column: 2; \}/.test(cssCode) &&
   !/#marketList[^{]*\.col-[a-z]+[^{]*\{[^}]*position:\s*absolute/.test(cssCode));

// ── 10 MARKET-EXCELLENCE-01 — el final del scroll móvil ─────────────────────
// Medido antes del arreglo: la última fila terminaba a 0,05 / −0,88px del borde de la card
// (se leía como recorte) y en pantallas cortas la card desbordaba su host 31,5px porque el
// tope era `max-height: 70vh` — un porcentaje del viewport que ni descuenta el chrome de
// Market ni sigue a la unidad dinámica, de ahí el reajuste al aparecer la barra de URL.
console.log('\n10 — final del scroll en móvil:');
ok('10.1 el scroller ya no fija su altura con un porcentaje del viewport',
   /#marketList\.market-section \{[^}]*max-height: none;/.test(cssCode));
ok('10.2 deriva su altura del espacio real: cadena flex con min-height 0',
   /\.market-screen \{ display: flex; flex-direction: column; min-height: 100%; \}/.test(cssCode) &&
   /\.market-body,\s*\n\s*\.market-main\s*\{ flex: 0 1 auto; min-height: 0;/.test(cssCode) &&
   /#marketList\.market-section \{[^}]*flex: 0 1 auto;[^}]*min-height: 0;/.test(cssCode));
ok('10.3 no se estira con pocas filas: encoge pero no crece (0 1 auto, nunca 1 1)',
   !/#marketList\.market-section \{[^}]*flex: 1 1 auto/.test(cssCode));
ok('10.4 la última fila tiene aire real al final, con safe-area',
   /#marketList\.market-section \{[^}]*padding: 0 0 calc\(10px \+ env\(safe-area-inset-bottom, 0px\)\);/.test(cssCode));
ok('10.5 desaparece la franja vacía bajo la lista (reserva de 80px y margen heredado)',
   /\.market-screen \{ padding-bottom: calc\(8px \+ env\(safe-area-inset-bottom, 0px\)\); \}/.test(cssCode) &&
   /#marketList\.market-section \{ margin-bottom: 0; \}/.test(cssCode));
// El patrón debe mirar SÓLO la regla del contenedor: los tamaños fijos de sus hijos
// (icono 40px, sparkline 28px) son legítimos y no tienen que ver con el scroll.
{
  const bloque = (cssCode.match(/#marketList\.market-section \{[^}]*\}/g) || []).join('\n');
  ok('10.6 se conserva el scroll nativo: sin altura rígida en el scroller ni JS de reposicionamiento',
     /-webkit-overflow-scrolling: touch/.test(bloque) &&
     !/(^|[^-])height:\s*\d/.test(bloque.replace(/max-height|min-height/g, '')) &&
     !/scrollTop\s*=\s*[^;]*marketList/.test(app));
}
ok('10.7 el arreglo es CSS-only y vive en el bloque móvil (escritorio intacto)',
   /@media \(max-width: 768px\)[\s\S]{0,4000}\.market-screen \{ padding-bottom: calc\(8px/.test(cssCode));

// ── 11 MARKET-EXCELLENCE-01B — pulido institucional (sólo presentación) ─────
console.log('\n11 — pulido de filas y estados:');
ok('11.1 cifras tabulares en precio, variación, cabecera y ticker (columna que no ondula)',
   /#marketList \.col-price,\s*\n#marketList \.col-change,[\s\S]{0,200}font-variant-numeric: tabular-nums;/.test(cssCode));
// El "sin tocar tamaños" se comprueba SOBRE EL BLOQUE NUEVO: los `font-size` por breakpoint
// existen desde antes y son legítimos; lo que no debe hacer este pulido es alterarlos.
// El marcador vive en un COMENTARIO, así que hay que anclar sobre el CSS crudo y despojar
// después: `cssCode` ya no lo contiene (mismo gotcha de siempre con los asserts de ausencia).
const bloque01B = css.slice(css.indexOf('MARKET-EXCELLENCE-01B')).replace(/\/\*[\s\S]*?\*\//g, '');
ok('11.2 jerarquía por color/peso, no por tamaño (los tamaños siguen fijados por breakpoint)',
   /#marketList \.mkt-id-name \{[^}]*color: rgba\(255,255,255,0\.96\)/.test(bloque01B) &&
   /#marketList \.mkt-id-meta \{[^}]*color: rgba\(255,255,255,0\.46\)/.test(bloque01B) &&
   !/\.mkt-id-name \{[^}]*font-size/.test(bloque01B) &&
   !/\.market-row \{[^}]*(padding|height):/.test(bloque01B));
ok('11.3 el precio pesa más que la variación', /#marketList \.col-price  \{[^}]*font-weight: 650/.test(cssCode));
ok('11.4 separador afinado y cabecera en tono secundario',
   /#marketList \.market-row \{ border-bottom-color: rgba\(255,255,255,0\.045\); \}/.test(cssCode));
ok('11.5 iconografía unificada: mismo radio y aro sutil',
   /#marketList \.asset-icon \{[^}]*border-radius: 9px;[^}]*box-shadow: inset 0 0 0 1px/.test(cssCode));
ok('11.6 el esqueleto usa barrido con anchos variados y respeta prefers-reduced-motion',
   /@keyframes mktShimmer/.test(cssCode) &&
   /nth-child\(3\) \.skeleton-text \{ width: 112px; \}/.test(cssCode) &&
   /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,320}\.skeleton-spark \{ animation: none; \}/.test(cssCode));
ok('11.7 vacío/error con ritmo vertical propio y SIN inventar copy nueva',
   /#marketList \.market-empty \{[^}]*min-height: 132px/.test(cssCode) &&
   (app.match(/market_no_results/g) || []).length >= 2 &&
   !/market_error_state|market_load_failed/.test(app));
ok('11.8 tablet 769–1024 recibe el mismo aire final',
   /@media \(min-width: 769px\) and \(max-width: 1024px\) \{\s*\n\s*#marketList\.market-section \{ padding-bottom: 14px; \}/.test(cssCode));
ok('11.9 REGRESIÓN: no se tocan las medidas ya fijadas (radio de card, filas planas, rejilla web)',
   /#marketList\.market-section \{[\s\S]{0,400}border-radius: 14px;/.test(cssCode) &&
   /#marketList\.market-section \.market-row \{ border-radius: 0; \}/.test(cssCode) &&
   /grid-template-columns: minmax\(0, 420px\) 124px minmax\(32px, 1fr\) 100px minmax\(32px, 1fr\) 172px 44px;/.test(cssCode));
ok('11.10 es CSS-only: ni datos, ni contratos, ni lógica',
   !/renderMarketItem[\s\S]{0,200}mkt-id-name[\s\S]{0,200}font-/.test(app));

// ── 12 MARKET-EXCELLENCE-02 — base institucional de la ficha de activo ──────
// Owner único: #marketPreviewOverlay / .modal--mkt-preview, abierto por _aurixMktOpenSymbol.
// Todo el bloque es presentación: ni JS, ni motor, ni datasets, ni providers.
console.log('\n12 — ficha de activo (Asset Detail):');
{
  const d = css.slice(css.indexOf('MARKET-EXCELLENCE-02')).replace(/\/\*[\s\S]*?\*\//g, '');
  const chartCore = read('services/aurix-chart-core.js');
  // Cuerpos de TODA regla de styles.css cuyo selector mezcle la ficha con un estado del motor.
  const overlayStateRules = (cssCode.match(/[^}{]*aurix-chart-state[^{}]*\{[^}]*\}/g) || [])
    .filter(r => /marketPreviewOverlay|modal--mkt-preview|mkt-prv/.test(r.split('{')[0]))
    .map(r => r.slice(r.indexOf('{') + 1, -1));
  ok('12.1 owner único: un solo overlay y un solo abridor, sin segundo flujo',
     (indexHtml.match(/id="marketPreviewOverlay"/g) || []).length === 1 &&
     (app.match(/function _aurixMktOpenSymbol\(/g) || []).length === 1);
  ok('12.2 el precio domina y es tabular',
     /\.mkt-prv-price \{[^}]*font-size: 30px;[^}]*font-weight: 700/.test(d) &&
     /\.mkt-prv-price \{[^}]*font-variant-numeric: tabular-nums/.test(d) &&
     /\.mkt-prv-change \{[^}]*font-variant-numeric: tabular-nums/.test(d));
  ok('12.3 jerarquía de header: nombre titular, ticker y tipo de soporte, sin badge chillón',
     /\.mkt-prv-name \{[^}]*font-weight: 650/.test(d) &&
     /\.mkt-prv-symbol \{[^}]*color: rgba\(255,255,255,0\.58\)/.test(d) &&
     /\.mkt-prv-badge:empty \{ display: none; \}/.test(d));
  ok('12.4 temporalidades honestas: una deshabilitada se LEE deshabilitada, y no se altera el set',
     /button\[disabled\],[\s\S]{0,90}aria-disabled="true"\]\s*\{[^}]*pointer-events: none/.test(d) &&
     /ranges:\s*\['24H','1W','1M','1Y','ALL'\]/.test(app));
  // ASSET-DETAIL-STATE-REGRESSION (P0) — la altura estable vive en el mount; los estados
  // del motor NO se tocan. La versión anterior de este assert exigía justamente la regla
  // que causó la regresión (display:flex con especificidad de id sobre .aurix-chart-state),
  // que pintaba cargando+vacío+error a la vez sobre el gráfico.
  ok('12.5 la altura estable vive en el mount, no en los estados',
     /\.mkt-prv-mount \{[^}]*min-height: 168px/.test(d) &&
     /\.aurix-chart-state--error \{ color: rgba\(255,155,155/.test(d));
  ok('12.5b la ficha NO pisa el contrato de visibilidad de los estados del motor',
     // ni display, ni caja, ni alineación en NINGUNA regla de estado de la ficha…
     !overlayStateRules.some(r => /(^|[;{\s])(display|align-items|justify-content|min-height|position|inset|opacity|visibility)\s*:/.test(r)) &&
     // …y ningún selector amplio que alcance a las variantes del motor.
     !/\[class\*=["']aurix-chart-state/.test(cssCode));
  ok('12.5c el contrato sigue siendo del motor: base oculta + opt-in por data-state',
     /\.aurix-chart-state \{[^}]*display: none/.test(chartCore) &&
     /\[data-state="loading"\] \.aurix-chart-state--loading,[\s\S]{0,200}\{\s*display: flex/.test(chartCore));
  ok('12.6 tablet 769–1024 con composición PROPIA (card contenida, no sheet estirado)',
     /@media \(min-width: 769px\) and \(max-width: 1024px\) \{[\s\S]{0,400}#marketPreviewOverlay > \.modal \{[^}]*border-radius: 18px/.test(d) &&
     /@media \(min-width: 769px\) and \(max-width: 1024px\) \{[\s\S]{0,400}\.sheet-handle \{ display: none; \}/.test(d));
  ok('12.7 móvil sin scroll horizontal y con colchón bajo el CTA (safe-area)',
     /@media \(max-width: 768px\)[\s\S]{0,700}\.modal-body    \{ overflow-x: hidden; \}/.test(d) &&
     /\.mkt-prv-mount \{ padding-bottom: calc\(8px \+ env\(safe-area-inset-bottom, 0px\)\); \}/.test(d));
  ok('12.8 escritorio con más ancho útil sin inflar tipografías',
     /@media \(min-width: 1025px\)[\s\S]{0,220}max-width: 620px/.test(d) &&
     !/@media \(min-width: 1025px\)[\s\S]{0,300}font-size: [4-9]\dpx/.test(d));
  ok('12.9 NO se toca el motor del gráfico ni sus datos',
     !/mkt-prv-mount[\s\S]{0,200}(canvas|svg) \{[^}]*(width|height): \d+px/.test(d) &&
     (app.match(/function _aurixMktPickAdapter\(/g) || []).length === 1 &&
     (app.match(/function _aurixMktLoad\(/g) || []).length <= 1);
  ok('12.10 continuidad Market → ficha: mismo owner, sin duplicar navegación',
     /_aurixMktOpenSymbol\(row\.dataset\.symbol\)/.test(app) &&
     (app.match(/function _aurixMktClose\(/g) || []).length === 1);
  ok('12.11 no se añaden campos ni métricas: sólo la línea de origen que ya existía',
     /\.mkt-prv-meta \{[^}]*color: rgba\(255,255,255,0\.38\)/.test(d) &&
     (app.match(/function _aurixMktSetMeta\(/g) || []).length === 1 &&
     !/mktPrvVolume|mktPrvMarketCap|mkt-prv-fundamentals/.test(indexHtml + app));
}

// ── 13 MARKET-EXCELLENCE-03 — pulido final ──────────────────────────────────
console.log('\n13 — pulido final:');
{
  const f = css.slice(css.indexOf('MARKET-EXCELLENCE-03')).replace(/\/\*[\s\S]*?\*\//g, '');
  ok('13.1 la lista recupera su card en la banda 769–1024 (mismo radio que móvil y escritorio)',
     /@media \(min-width: 769px\) and \(max-width: 1024px\) \{[\s\S]{0,300}#marketList\.market-section \{[^}]*border-radius: 14px/.test(f));
  // Regresión que este mismo bloque estuvo a punto de introducir: el shorthand `overflow`
  // pisa el `overflow-y: auto` de la regla base y deja la lista sin scroll.
  ok('13.1b la card de la banda intermedia NO usa el shorthand overflow (mataría el scroll)',
     /@media \(min-width: 769px\) and \(max-width: 1024px\) \{[\s\S]{0,600}overflow-x: hidden;\s*\n\s*overflow-y: auto;/.test(f) &&
     !/@media \(min-width: 769px\) and \(max-width: 1024px\) \{[\s\S]{0,600}\n\s*overflow: hidden;/.test(f));
  ok('13.2 los tres breakpoints comparten el MISMO radio de card (14px), sin valores sueltos',
     (cssCode.match(/#marketList\.market-section \{[^}]*border-radius: (\d+)px/g) || [])
       .every(m => /border-radius: 14px/.test(m)));
  ok('13.3 hay estado pressed en la fila, no sólo hover y focus',
     /#marketList \.market-row:active \{ background-color/.test(f) &&
     /\.market-row:focus-visible/.test(cssCode) && /\.market-row:hover/.test(cssCode));
  ok('13.4 la transición es acotada (sólo color), sin animar geometría',
     /#marketList \.market-row \{ transition: background-color \.14s ease; \}/.test(f));
  ok('13.5 prefers-reduced-motion desactiva transiciones y escalados',
     /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,320}transition: none;[\s\S]{0,220}transform: none;/.test(f));
  ok('13.6 sin componentes nuevos ni estilos duplicados: todo son overrides de lo existente',
     !/\.mkt-[a-z-]+--v2|\.market-row-new|\.mkt-prv-v2/.test(cssCode) &&
     (cssCode.match(/@keyframes mktShimmer/g) || []).length === 1);
  ok('13.7 accesibilidad básica: foco visible en fila, estrella y temporalidades',
     /\.market-row:focus-visible/.test(cssCode) && /\.watchlist-btn:focus-visible/.test(cssCode) &&
     /#marketPreviewOverlay \.mkt-prv-ranges button:focus-visible/.test(cssCode));
  ok('13.8 NO se toca dato, lógica ni navegación (bloque exclusivamente CSS)',
     !/MARKET-EXCELLENCE-03/.test(app));
}

// ── 14 MARKET V2 · BLOQUE 1 — verdad del mini gráfico ───────────────────────
// La celda `.col-chart` sólo puede acabar en histórico REAL o en ausencia declarada.
// El tercer final —una serie inventada con forma de mercado— queda prohibido por código.
console.log('\n14 — Market V2 bloque 1 (verdad del mini gráfico):');
{
  // El marcador vive en un comentario: hay que cortar sobre el CSS crudo y limpiar después.
  const v2 = css.slice(css.indexOf('MARKET-V2-01 — verdad')).replace(/\/\*[\s\S]*?\*\//g, '');
  // Igual con el JS: los comentarios de estos bloques CITAN el defecto ("Math.random()",
  // "synthetic"), así que los asserts de prohibición deben mirar código, no prosa.
  const code = (s) => String(s || '').replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');
  const rowFn = code(fnSource('renderMarketItem'));
  const mountFn = code(fnSource('_aurixSparkMountAll'));
  const applyFn = code(fnSource('_mktHistoryApplyToRow'));
  const settleFn = code(fnSource('_mktSparkSettle'));
  const fetchOneFn = code(fnSource('_mktHistoryFetchOne'));
  ok('14.1 el generador de series falsas ya NO existe en el bundle',
     !/function generateSparkline\s*\(/.test(appCode) &&
     !/function renderSparkline\s*\(/.test(appCode));
  ok('14.2 la fila NO pinta ninguna serie en su HTML: la celda nace en esqueleto',
     !!rowFn && !/<svg/.test(rowFn) &&
     /col col-chart is-loading"/.test(rowFn) &&
     /data-spark-key="\$\{normSym\}"/.test(rowFn));
  ok('14.3 el montaje exige serie real: sin ella no dibuja nada',
     !!mountFn && /const hasReal = /.test(mountFn) && /if \(!hasReal\) return;/.test(mountFn) &&
     !/synthetic/.test(mountFn.replace(/\/\/.*$/gm, '')));
  ok('14.4 desaparece el meta que mentía (source synthetic declarado isSynthetic:false)',
     !/source: 'synthetic'/.test(appCode));
  ok('14.5 ninguna ruta de gráfico de Market se alimenta de Math.random()',
     ![mountFn, applyFn, settleFn, rowFn].some(f => /Math\.random\(/.test(f || '')));
  ok('14.6 sin histórico utilizable la celda se declara vacía, no se queda en blanco',
     !!applyFn && /col-chart--none/.test(applyFn) && /const usable = /.test(applyFn));
  ok('14.7 un activo sin adaptador resuelve la celda en vez de dejarla en esqueleto',
     !!fetchOneFn && /if \(!adapter\) \{/.test(fetchOneFn) && /_mktHistoryApplyToRow\(item, range, none, gen\)/.test(fetchOneFn));
  ok('14.8 cierre acotado: ningún esqueleto puede quedarse parpadeando para siempre',
     !!settleFn && /_AURIX_MKT_SPARK_SETTLE_MS/.test(settleFn) &&
     /_aurixSparkMountAll\(el\)/.test(settleFn) && /col-chart--none/.test(settleFn) &&
     /_mktSparkSettle\(el\)/.test(fnSource('renderCurrentMarketView')));
  ok('14.9 la ausencia se dibuja sin dirección ni color (no simula "no se movió")',
     /\.col-chart--none::after \{/.test(v2) &&
     /rgba\(220,230,250,0\.16\)/.test(v2) &&
     !/\.col-chart--none[\s\S]{0,400}(success|danger|00ff88|ff4d4d)/.test(v2));
  ok('14.10 sin salto de layout: la ausencia es absoluta como el esqueleto',
     /\.col-chart--none::after \{[^}]*position: absolute/.test(v2));
  ok('14.11 Reduced Motion: el esqueleto de Market deja de animarse',
     /@media \(prefers-reduced-motion: reduce\) \{\s*\.col-change-skeleton,\s*\.col-chart\.is-loading::after \{ animation: none; \}/.test(v2));
  ok('14.13 la estrella gana área táctil (44px) SIN cambiar su tamaño visual (28px)',
     /#marketList \.watchlist-btn::before \{[^}]*width: 44px; height: 44px/.test(v2) &&
     /#marketList \.watchlist-btn \{ position: relative; \}/.test(v2) &&
     /#marketList\.is-v4 \.watchlist-btn \{[^}]*width: 28px/.test(cssCode));
  ok('14.12 no aumenta llamadas: se reusa el backfill existente, sin nuevo fetch',
     (appCode.match(/_mktHistoryFetchVisible\(/g) || []).length === 2 &&
     !/fetch\(/.test(settleFn) && !/HistoryAdapter\(/.test(settleFn));
}

console.log('\nRESULT: ' + (fail === 0 ? 'ALL PASS ✓' : 'FAIL ✗') + '  (' + pass + ' passed, ' + fail + ' failed)');
process.exit(fail === 0 ? 0 : 1);
