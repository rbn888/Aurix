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
  // MARKET-FIRST-PAINT-P0 — la protección de MARKET-V2-01 es "la fila no dibuja NINGUNA serie
  // en su HTML", no "la celda nace en esqueleto". La celda sigue yendo VACÍA (aquí se comprueba,
  // que es más fuerte que exigir una clase); lo que cambia es que su estado inicial ya se deriva
  // de la caché, para que una fila con snapshot no se construya en dos pasos. El esqueleto queda
  // reservado a lo único que lo merece: que todavía no se sepa nada de ese activo.
  ok('14.2 la fila NO pinta ninguna serie en su HTML: celda vacía y estado derivado de la caché',
     !!rowFn && !/<svg/.test(rowFn) &&
     /col col-chart \$\{_chartCls\}"/.test(rowFn) &&
     /data-spark-key="\$\{normSym\}"[^>]*><\/div>/.test(rowFn) &&
     /_chartCls = _histHasSeries \? '' : \(_histUsable \? 'col-chart--none' : 'is-loading'\)/.test(rowFn));
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

// ── 15 MARKET V2 · BLOQUE 2A — view model único de Asset Detail ─────────────
// No se comprueba que "existe una línea": se EJECUTA el view model real extraído de
// app.js contra series construidas a mano, y se afirma sobre su salida.
console.log('\n15 — Market V2 bloque 2A (view model de Asset Detail):');
{
  const vm = require('vm');
  const ctx = { console: { log() {}, warn() {} }, Math, JSON, Number, isFinite, Infinity, Array, Object, String, Boolean };
  vm.createContext(ctx);
  const decl = (re) => { const m = app.match(re); if (!m) throw new Error('decl no encontrada: ' + re); return m[0]; };
  vm.runInContext(decl(/const _AURIX_MKT_VM_52W_MS = [^;]+;/), ctx);
  vm.runInContext(decl(/const _AURIX_MKT_VM_52W_MIN_COVERAGE = [^;]+;/), ctx);
  ['_aurixMktVmField', '_aurixMktVmNone', '_aurixMktVmType', '_aurixMktCatalogRecord',
   '_aurixMktSeriesStats', '_aurixMktVmCoverage', '_aurixMktBuildDetailVM']
    .forEach(n => vm.runInContext(fnSource(n), ctx));
  const build = (input, deps) => vm.runInContext('_aurixMktBuildDetailVM', ctx)(input, deps);

  const DAY = 864e5, NOW = 1_750_000_000_000;
  // Serie diaria con OHLC: el máximo intradía va 5 por encima del cierre más alto, para
  // poder demostrar que la derivada usa high/low reales y no sólo el cierre.
  const daily = (days, base, step, withOhlc) => {
    const a = [];
    for (let i = days; i >= 0; i--) {
      const v = base + (days - i) * step;
      const p = { time: NOW - i * DAY, value: v };
      if (withOhlc) { p.high = v + 5; p.low = v - 5; p.close = v; }
      a.push(p);
    }
    return a;
  };
  const ETF_DB = [{ ticker: 'CSPX.L', marketSymbol: 'CSPX.L', name: 'iShares Core S&P 500 UCITS ETF (Acc)', manager: 'iShares', exchange: 'LSE', currency: 'USD', isin: 'IE00B5BMR087' }];
  const FUND_DB = [{ ticker: 'VG-WLD', name: 'Vanguard Global Stock Index', manager: 'Vanguard', currency: 'EUR', isin: 'IE00B03HD191' }];
  const deps = (extra) => Object.assign({ catalogs: [ETF_DB, FUND_DB], resolveLogo: () => 'https://logo/x.png' }, extra || {});

  // 15.1 — cripto, sólo 30d cargado
  const btc = build({
    item: { symbol: 'BTC', ticker: 'BTC', name: 'Bitcoin', type: 'crypto', coinId: 'bitcoin', current_price: 64120, change24h: 1.84, currency: 'USD' },
    range: '30d', series: daily(30, 60000, 100, false), meta: { source: 'coingecko', currency: 'USD', granularity: '1h', asOf: NOW },
    nowMs: NOW,
  }, deps());
  ok('15.1 con 30d cargado: máximo/mínimo del PERIODO derivados, con cobertura declarada',
     btc.price.periodHigh.state === 'derived' && btc.price.periodLow.state === 'derived' &&
     btc.price.periodHigh.value === 63000 && btc.price.periodLow.value === 60000 &&
     btc.price.periodHigh.coverage && btc.price.periodHigh.coverage.spanDays === 30);
  ok('15.2 REGLA DE VERDAD: sin ventana de un año NO se publica 52 semanas',
     btc.derived.high52w.state === 'unavailable' && btc.derived.high52w.reason === 'range_not_loaded' &&
     btc.derived.low52w.state === 'unavailable');
  ok('15.3 REGLA DE VERDAD: sin rango ALL no hay máximo histórico disponible',
     btc.derived.availableHigh.state === 'unavailable' && btc.derived.availableHigh.reason === 'all_range_not_loaded');
  ok('15.4 una cripto no "le falta" el ISIN: el campo NO aplica a su tipo',
     btc.metaFields.every(f => f.key !== 'isin' && f.key !== 'issuer') &&
     btc.metaFields.some(f => f.key === 'currency'));

  // 15.5 — la trampa: 1y en caché pero con sólo 200 días de span
  const shortYear = build({
    item: { symbol: 'BTC', ticker: 'BTC', name: 'Bitcoin', type: 'crypto', current_price: 64120, currency: 'USD' },
    range: '30d', series: daily(30, 60000, 100, false), meta: { asOf: NOW }, nowMs: NOW,
  }, deps({ seriesForRange: r => (r === '1y' ? daily(200, 40000, 120, false) : null) }));
  ok('15.5 una ventana de 200 días NO se rotula como 52 semanas (cifra real, etiqueta falsa)',
     shortYear.derived.high52w.state === 'unavailable' &&
     shortYear.derived.high52w.reason === 'history_shorter_than_52w');

  // 15.6 — ALL de 3 años en caché
  const withAll = build({
    item: { symbol: 'BTC', ticker: 'BTC', name: 'Bitcoin', type: 'crypto', current_price: 64120, currency: 'USD' },
    range: '30d', series: daily(30, 60000, 100, false), meta: { asOf: NOW }, nowMs: NOW,
  }, deps({ seriesForRange: r => (r === 'all' ? daily(1095, 5000, 55, false) : null) }));
  ok('15.6 con ALL cargado: 52 semanas y máximo DISPONIBLE derivados, nunca como absolutos',
     withAll.derived.high52w.state === 'derived' &&
     withAll.derived.availableHigh.state === 'derived' &&
     withAll.derived.availableHigh.absolute === false &&
     withAll.derived.availableHigh.coverage.spanDays === 1095);
  ok('15.7 el 52 semanas se RECORTA al último año; el disponible abarca todo el histórico',
     withAll.derived.high52w.coverage.spanDays === 364 &&
     withAll.derived.availableHigh.coverage.spanDays === 1095);
  // REGRESIÓN REAL detectada con datos de producción: la serie 'all' de AAPL llega a 1984,
  // y el máximo/mínimo de esos 41 años se publicaba como "52 semanas" (mínimo: 0,06 $).
  // Este assert lo blinda: un pico de hace dos años NO puede aparecer en el 52 semanas,
  // pero SÍ debe aparecer en el máximo histórico disponible.
  const spike = daily(1095, 100, 0.05, false);
  spike[100].value = 99999;            // pico ~2,7 años atrás
  spike[100].high  = 99999;
  const spiked = build({
    item: { symbol: 'AAPL', ticker: 'AAPL', name: 'Apple Inc.', type: 'stock', current_price: 150, currency: 'USD' },
    range: 'all', series: spike, meta: { source: 'yahoo', asOf: NOW }, nowMs: NOW,
  }, deps());
  ok('15.7b un pico de hace 2,7 años NO contamina el 52 semanas, pero sí el disponible',
     spiked.derived.high52w.value !== 99999 &&
     spiked.derived.high52w.coverage.spanDays === 364 &&
     spiked.derived.availableHigh.value === 99999);
  // Con 1y diario y ALL semanal cubriendo ambos el año, el 52 semanas debe salir del más
  // fino: un máximo semanal se salta los extremos intradía de las otras sesiones.
  const coarseAll = []; for (let i = 1095; i >= 0; i -= 7) coarseAll.push({ time: NOW - i * DAY, value: 100 + (1095 - i) * 0.05 });
  const mixed = build({
    item: { symbol: 'AAPL', ticker: 'AAPL', name: 'Apple Inc.', type: 'stock', current_price: 150, currency: 'USD' },
    range: '1y', series: daily(370, 100, 0.1, true), meta: { granularity: '1d', asOf: NOW }, nowMs: NOW,
  }, deps({ seriesForRange: r => (r === 'all' ? coarseAll : null) }));
  ok('15.7c entre ventanas válidas gana la de más resolución (diaria sobre semanal)',
     mixed.derived.high52w.coverage.points > 300);

  // 15.8 — ETF curado: ISIN + gestora
  const etf = build({
    item: { symbol: 'CSPX.L', ticker: 'CSPX.L', marketSymbol: 'CSPX.L', name: 'iShares Core S&P 500 UCITS ETF (Acc)', type: 'etfs', current_price: 540, currency: 'USD', exchange: 'LSE' },
    range: '1y', series: daily(370, 400, 0.4, true), meta: { source: 'yahoo', currency: 'USD', granularity: '1d', asOf: NOW }, nowMs: NOW,
  }, deps());
  ok('15.8 ETF: ISIN y gestora salen del catálogo curado y lo declaran',
     etf.identity.isin.state === 'direct' && etf.identity.isin.value === 'IE00B5BMR087' &&
     etf.identity.isin.origin === 'curated_catalog' &&
     etf.identity.issuer.state === 'direct' && etf.identity.issuer.value === 'iShares');
  ok('15.9 tipo plural normalizado (etfs → etf), o la composición por tipo no acertaría',
     etf.type === 'etf' && etf.metaFields.map(f => f.key).join(',') === 'exchange,currency,isin,issuer');
  ok('15.10 usa el high/low REAL del punto cuando la fuente lo publica, no el cierre',
     etf.price.periodHigh.value === 400 + 370 * 0.4 + 5);
  ok('15.11 con 370 días cargados el 52 semanas SÍ se publica, recortado a 364 días',
     etf.derived.high52w.state === 'derived' && etf.derived.high52w.coverage.spanDays === 364);

  // 15.12 — acción sin catálogo curado
  const aapl = build({
    item: { symbol: 'AAPL', ticker: 'AAPL', name: 'Apple Inc.', type: 'stock', current_price: 214, currency: 'USD', exchange: 'NasdaqGS' },
    range: '30d', series: daily(30, 200, 0.5, true), meta: { source: 'yahoo', asOf: NOW }, nowMs: NOW,
  }, deps());
  ok('15.12 sin catálogo: ISIN y gestora se declaran NO disponibles con motivo, no vacíos',
     aapl.identity.isin.state === 'unavailable' && aapl.identity.isin.reason === 'not_in_curated_catalog' &&
     aapl.identity.issuer.state === 'unavailable' && aapl.identity.issuer.reason === 'not_reliably_derivable' &&
     aapl.metaFields.map(f => f.key).join(',') === 'exchange,currency');

  // 15.13 — sin serie
  const noHist = build({
    item: { symbol: 'BNB', ticker: 'BNB', name: 'BNB', type: 'crypto', current_price: 610, currency: 'USD' },
    range: '24h', series: [], meta: null, nowMs: NOW,
  }, deps());
  ok('15.13 sin serie: no hay sección de gráfico ni de derivadas, y el precio sigue',
     !noHist.sections.some(s => s.id === 'chart') &&
     !noHist.sections.some(s => s.id === 'derived') &&
     noHist.sections.some(s => s.id === 'price') &&
     noHist.price.periodHigh.reason === 'no_series_for_range');
  ok('15.14 sin módulos vacíos: toda sección presente tiene contenido real',
     noHist.sections.every(s => s.present === true) &&
     noHist.derivedFields.length === 0);

  // 15.16/15.17 — variación: directa en 24H, derivada en el resto
  const chg24 = build({
    item: { symbol: 'BTC', ticker: 'BTC', name: 'Bitcoin', type: 'crypto', current_price: 64120, change24h: 1.84, currency: 'USD' },
    range: '24h', series: daily(1, 63000, 1120, false), meta: { asOf: NOW }, nowMs: NOW,
  }, deps());
  ok('15.16 en 24H la variación es DIRECTA (la publica la fuente), no derivada',
     chg24.price.change.state === 'direct' && chg24.price.change.value === 1.84 && chg24.price.change.window === '24h');
  ok('15.17 en 30d la variación es DERIVADA con la misma regla que la fila de Market',
     btc.price.change.state === 'derived' &&
     Math.abs(btc.price.change.value - ((63000 - 60000) / 60000) * 100) < 1e-9);

  // 15.18 — campos excluidos por decisión de fase
  const excluded = /marketCap|market_cap|volume|sector|industry|supply|dividendYield|expenseRatio|\bAUM\b|cusip|figi|country|launchDate/i;
  ok('15.18 el contrato NO declara ninguno de los campos excluidos en esta fase',
     !excluded.test(JSON.stringify(etf)) && !excluded.test(JSON.stringify(btc)));
  ok('15.19 el contrato no habla de ATH/ATL: sólo de máximo/mínimo DISPONIBLE',
     !/\bath\b|\batl\b/i.test(JSON.stringify(Object.keys(withAll.derived))) &&
     'availableHigh' in withAll.derived && 'availableLow' in withAll.derived);
  ok('15.20 las etiquetas obligatorias del SPEC viven en el contrato',
     ['periodHigh', 'periodLow', 'high52w', 'low52w', 'availableHigh', 'availableLow']
       .every(k => typeof btc.labels[k] === 'string' && btc.labels[k]));
  ok('15.21 los valores derivados se declaran en USD canónico (el render convierte)',
     btc.valuesCurrency === 'USD' && etf.valuesCurrency === 'USD');

  // Pureza y no-regresión
  const vmSrcs = ['_aurixMktBuildDetailVM', '_aurixMktSeriesStats', '_aurixMktCatalogRecord', '_aurixMktVmType']
    .map(n => fnSource(n)).join('\n');
  ok('15.22 el view model es puro: sin DOM, sin window, sin i18n dentro',
     !/document\.|window\.|getElementById|innerHTML|querySelector/.test(vmSrcs));
  ok('15.23 no añade llamadas: lee caché por inyección, nunca pide histórico',
     !/fetch\(|HistoryAdapter\(|_mktHistoryFetchOne|_mktHistoryFetchVisible/.test(vmSrcs));
  ok('15.24 la máquina de estados del motor sigue intacta (2A no toca render ni estados)',
     !/dataset\.state|setState\(/.test(vmSrcs) &&
     (app.match(/function _aurixMktLoad\(/g) || []).length === 1);
}

// ── 16 MARKET V2 · BLOQUE 2B — header, precio y temporalidades ──────────────
// Asserts de COMPORTAMIENTO: se ejecuta el owner real del header con un DOM mínimo y se
// afirma sobre lo que pinta, no sobre la presencia de selectores.
console.log('\n16 — Market V2 bloque 2B (header, precio y temporalidades):');
{
  const vm2 = require('vm');
  const b2 = cssCode.slice(cssCode.indexOf('#marketPreviewOverlay .mkt-prv-icon .asset-icon'));
  const codeOf = (s) => String(s || '').replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');
  const head   = codeOf(fnSource('_aurixMktRenderHead'));
  const openFn = codeOf(fnSource('_aurixMktOpenSymbol'));
  const loadFn = codeOf(fnSource('_aurixMktLoad'));
  const down   = codeOf(fnSource('_aurixMktTeardown'));
  const bridge = codeOf(fnSource('_searchResultToMarketItem'));

  // ── DOM mínimo + el owner REAL, ejecutado.
  const ids = ['mktPrvIcon','mktPrvName','mktPrvSymbol','mktPrvBadge','mktPrvSubMeta',
               'mktPrvPrice','mktPrvChange','mktPrvPeriod','mktPrvFresh'];
  function mkEl() {
    return { textContent: '', innerHTML: '', hidden: false, className: '', _attr: {},
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute(k, v) { this._attr[k] = v; }, getAttribute(k) { return this._attr[k] === undefined ? null : this._attr[k]; },
      removeAttribute(k) { delete this._attr[k]; } };
  }
  const els = {};
  const ctx2 = { console: { log() {}, warn() {} }, Math, JSON, Number, isFinite, Infinity, Array, Object, String, Boolean, Date,
    document: { getElementById: (k) => els[k] || null },
    baseCurrency: 'USD', lang: 'es',
    T: { es: { market_badge_crypto: 'Cripto', market_badge_stock: 'Acción', market_badge_etf: 'ETF', mkt_price_stale: 'Precio retrasado' } },
    _aurixMktItem: null, _aurixMktRange: '30d', _aurixMktSeries: null, _aurixMktMetaCur: null,
    _AURIX_ETF_DB: [{ ticker: 'CSPX.L', marketSymbol: 'CSPX.L', manager: 'iShares', exchange: 'LSE', currency: 'USD', isin: 'IE00B5BMR087' }],
    _AURIX_FUND_DB: [], _marketHistoryCache: new Map() };
  ctx2.t = (k) => ctx2.T[ctx2.lang][k];
  ctx2.getAssetLogo = (a) => (a && a.image) || null;
  ctx2._assetIconHtml = (a) => (a && a.image) ? '<div class="asset-icon has-logo"><img class="aurix-aicon-img"></div>' : '<div class="asset-icon"><span class="aurix-aicon-fallback">Z</span></div>';
  ctx2.safePrice  = (v) => '$' + Number(v).toFixed(2);
  ctx2.safeChange = (v) => (v >= 0 ? '+' : '') + Number(v).toFixed(2) + '%';
  ctx2._mktHistoryCacheKey = () => null;
  vm2.createContext(ctx2);
  for (const re of [/const _AURIX_MKT_VM_52W_MS = [^;]+;/, /const _AURIX_MKT_VM_52W_MIN_COVERAGE = [^;]+;/,
                    /const _AURIX_MKT_RANGE_LABEL = Object\.freeze\([^;]+;/]) {
    vm2.runInContext(app.match(re)[0], ctx2);
  }
  ['_aurixMktVmField','_aurixMktVmNone','_aurixMktVmType','_aurixMktCatalogRecord','_aurixMktSeriesStats',
   '_aurixMktVmCoverage','_aurixMktBuildDetailVM','_aurixMktVmDeps','_aurixMktSnapshotOf','_aurixMktCurrentVM',
   '_aurixMktHeadField','_aurixMktRenderHead','_aurixMktResetHead'].forEach(n => vm2.runInContext(fnSource(n), ctx2));
  const DAY = 864e5, NOW = 1_750_000_000_000;
  const daily = (d, base, step) => { const a = []; for (let i = d; i >= 0; i--) a.push({ time: NOW - i * DAY, value: base + (d - i) * step }); return a; };
  // Devuelve una INSTANTÁNEA por valor. Devolver `els` haría que todas las llamadas
  // compartieran el mismo objeto y cualquier comparación entre rangos se comparase consigo
  // misma (siempre verde): un assert que no prueba nada.
  function paint(state, opts) {
    ids.forEach(k => { els[k] = mkEl(); });
    Object.assign(ctx2, state);
    vm2.runInContext('_aurixMktRenderHead(_aurixMktCurrentVM(), ' + JSON.stringify(opts || null) + ')', ctx2);
    const snap = {};
    ids.forEach(k => {
      const e = els[k];
      snap[k] = { textContent: e.textContent, innerHTML: e.innerHTML, hidden: e.hidden,
                  className: e.className, attr: Object.assign({}, e._attr),
                  getAttribute(a) { return this.attr[a] === undefined ? null : this.attr[a]; } };
    });
    return snap;
  }
  const BTC = { symbol: 'BTC', ticker: 'BTC', name: 'Bitcoin', type: 'crypto', current_price: 64120, change24h: 1.84, currency: 'USD', image: 'https://logo/btc.png' };

  const p24 = paint({ _aurixMktItem: BTC, _aurixMktRange: '24h', _aurixMktSeries: daily(1, 63000, 1120), _aurixMktMetaCur: { currency: 'USD', asOf: NOW } });
  ok('16.1 en 24H la variación es la DIRECTA de la fuente, y el periodo lo declara',
     p24.mktPrvChange.textContent === '+1.84%' &&
     p24.mktPrvChange.getAttribute('data-change-state') === 'direct' &&
     p24.mktPrvPeriod.textContent === '24H');
  const p1m = paint({ _aurixMktItem: BTC, _aurixMktRange: '30d', _aurixMktSeries: daily(30, 60000, 100), _aurixMktMetaCur: { currency: 'USD', asOf: NOW } });
  ok('16.2 change24h NO se reutiliza bajo 1M: la variación se deriva de la serie',
     p1m.mktPrvChange.getAttribute('data-change-state') === 'derived' &&
     p1m.mktPrvChange.textContent === '+5.00%' &&
     p1m.mktPrvChange.textContent !== p24.mktPrvChange.textContent &&
     p1m.mktPrvPeriod.textContent === '1M');
  const pNo = paint({ _aurixMktItem: BTC, _aurixMktRange: '1y', _aurixMktSeries: null, _aurixMktMetaCur: null });
  ok('16.3 un rango sin serie muestra ausencia NEUTRA, nunca la cifra del rango anterior',
     pNo.mktPrvChange.textContent === '—' &&
     pNo.mktPrvChange.getAttribute('data-change-state') === 'unavailable' &&
     /--none/.test(pNo.mktPrvChange.className) && pNo.mktPrvPeriod.textContent === '1Y');
  const pPend = paint({ _aurixMktItem: BTC, _aurixMktRange: '30d', _aurixMktSeries: null, _aurixMktMetaCur: null }, { pending: true });
  ok('16.4 mientras carga no se muestra ninguna cifra (ni la de 24h ni la previa)',
     pPend.mktPrvChange.textContent === '' && /--pending/.test(pPend.mktPrvChange.className) &&
     pPend.mktPrvChange.getAttribute('data-change-state') === null);
  ok('16.5 la variación derivada usa primer y último punto válido de la serie',
     /stats\.changePct/.test(codeOf(fnSource('_aurixMktBuildDetailVM'))) &&
     Math.abs(Number(p1m.mktPrvChange.textContent.replace('%', '')) - ((63000 - 60000) / 60000) * 100) < 0.01);
  // Identidad
  const pEtf = paint({ _aurixMktItem: { symbol: 'CSPX.L', ticker: 'CSPX.L', marketSymbol: 'CSPX.L', name: 'iShares Core S&P 500 UCITS ETF USD (Acc)', type: 'etfs', current_price: 540.25, currency: 'USD', exchange: 'LSE' }, _aurixMktRange: '1y', _aurixMktSeries: daily(370, 400, 0.4), _aurixMktMetaCur: { currency: 'USD', asOf: NOW } });
  ok('16.6 header con mercado y divisa cuando existen, con el separador de la lista',
     pEtf.mktPrvSubMeta.hidden === false && pEtf.mktPrvSubMeta.textContent === 'LSE · USD');
  ok('16.7 el header OCULTA los campos unavailable en vez de dejar hueco',
     p1m.mktPrvSubMeta.textContent === 'USD' &&      // cripto: no hay exchange, no se inventa
     pNo.mktPrvFresh.hidden === true &&              // la fuente no publica frescura
     ids.every(k => typeof els[k].hidden === 'boolean'));
  ok('16.8 el logo canónico se pinta por el renderer único y sólo cae a iniciales si falta',
     /_assetIconHtml\(item, sym, 'asset-icon', true\)/.test(head) &&
     /has-logo/.test(pEtf.mktPrvIcon.innerHTML) === false &&   // este ETF no trae imagen
     /has-logo/.test(p1m.mktPrvIcon.innerHTML) === true);
  ok('16.9 "al día" no se anuncia: la frescura sólo aparece si la fuente la declara stale',
     /value === 'stale'/.test(head) &&
     paint({ _aurixMktItem: Object.assign({}, BTC, { stale: true }), _aurixMktRange: '24h', _aurixMktSeries: null, _aurixMktMetaCur: null }).mktPrvFresh.hidden === false &&
     paint({ _aurixMktItem: Object.assign({}, BTC, { stale: false }), _aurixMktRange: '24h', _aurixMktSeries: null, _aurixMktMetaCur: null }).mktPrvFresh.hidden === true);
  // Se pinta un activo, se resetea, y SÓLO entonces se mira: la instantánea tiene que ser
  // posterior al reset, o se estaría comprobando el estado pintado.
  paint({ _aurixMktItem: BTC, _aurixMktRange: '30d', _aurixMktSeries: daily(30, 60000, 100), _aurixMktMetaCur: { currency: 'USD', asOf: NOW } });
  vm2.runInContext('_aurixMktResetHead()', ctx2);
  const pReset = {};
  ids.forEach(k => { const e = els[k]; pReset[k] = { textContent: e.textContent, hidden: e.hidden, className: e.className,
    getAttribute(a) { return e._attr[a] === undefined ? null : e._attr[a]; } }; });
  ok('16.10 al cerrar no sobrevive ningún dato del activo anterior',
     pReset.mktPrvName.textContent === '' && pReset.mktPrvSymbol.textContent === '' &&
     pReset.mktPrvPrice.textContent === '—' && pReset.mktPrvChange.textContent === '' &&
     pReset.mktPrvChange.getAttribute('data-change-state') === null &&
     pReset.mktPrvSubMeta.hidden === true && pReset.mktPrvPeriod.hidden === true);

  // ── Arquitectura y anti-obsolescencia (sobre el código real)
  ok('16.11 la vista consume el view model: un solo owner escribe la cabecera',
     /_aurixMktBuildDetailVM/.test(codeOf(fnSource('_aurixMktCurrentVM'))) &&
     /_aurixMktRenderHead\(_aurixMktCurrentVM\(\)/.test(openFn) &&
     (app.match(/function _aurixMktRenderHead\(/g) || []).length === 1);
  ok('16.12 la vista NO vuelve a leer item/snapshot/catálogo por su cuenta',
     !/item\.change24h|item\.current_price|_AURIX_(ETF|FUND)_DB/.test(head) &&
     !/item\.change24h|item\.current_price/.test(openFn));
  ok('16.13 respuestas obsoletas no pisan el rango activo (token de generación)',
     /const gen = \+\+_aurixMktGen;/.test(loadFn) &&
     /if \(gen !== _aurixMktGen\) return;/.test(loadFn) &&
     /if \(reqRange !== _aurixMktRange\) return;/.test(loadFn));
  ok('16.14 al cambiar de rango se descarta la serie anterior ANTES de pedir la nueva',
     /_aurixMktSeries  = null;[\s\S]{0,120}_aurixMktRenderHead\(_aurixMktCurrentVM\(\), \{ pending: true \}\)[\s\S]{0,80}_aurixMktLoad/.test(openFn));
  ok('16.15 un error de carga no conserva la variación de la carga previa',
     /catch \(err\)[\s\S]{0,400}_aurixMktSeries  = null;[\s\S]{0,120}_aurixMktRenderHead/.test(loadFn));
  ok('16.16 se guarda la serie CRUDA del adapter, no la ya convertida (evita doble conversión)',
     /_aurixMktSeries  = result\.series;/.test(loadFn) &&
     /valuesCurrency: String\(\(meta && meta\.currency\)/.test(codeOf(fnSource('_aurixMktBuildDetailVM'))));
  ok('16.17 el teardown limpia serie, meta, cabecera y bumpea el token',
     /_aurixMktSeries  = null;/.test(down) && /_aurixMktGen\+\+;/.test(down) && /_aurixMktResetHead\(\)/.test(down));
  ok('16.18 el puente de search deja pasar el exchange que la API ya publica',
     /exchange:       result\.exchange     \|\| null/.test(bridge));
  ok('16.19 la máquina de estados del motor sigue intacta',
     !/dataset\.state/.test(head) && !/aurix-chart-state/.test(b2) &&
     (app.match(/function _aurixMktLoad\(/g) || []).length === 1);

  // ── Presentación (bloque CSS acotado)
  ok('16.20 sin salto de ancho al cambiar de rango: tabular + ancho mínimo reservado',
     /\.mkt-prv-change \{[^}]*font-variant-numeric: tabular-nums/.test(b2) &&
     /\.mkt-prv-change \{[^}]*min-width: 7\.5ch/.test(b2));
  ok('16.21 el cero y la ausencia son neutros (ni verde ni rojo)',
     /\.mkt-prv-change\.is-flat,\s*#marketPreviewOverlay \.mkt-prv-change--none \{[^}]*color: rgba\(255,255,255,0\.46\)/.test(b2));
  ok('16.22 nombres largos: elipsis con min-width 0 en toda la cadena flex',
     /\.mkt-prv-head,\s*#marketPreviewOverlay \.mkt-prv-id,\s*#marketPreviewOverlay \.mkt-prv-sub \{ min-width: 0; \}/.test(b2) &&
     /\.mkt-prv-name \{[^}]*text-overflow: ellipsis/.test(cssCode));
  ok('16.23 temporalidades con área táctil de 44px sin engordar la píldora',
     /\.aurix-chart-range::before \{[^}]*height: 44px/.test(b2) &&
     /\.aurix-chart-range \{[^}]*min-height: 30px/.test(b2));
  ok('16.24 estado activo inequívoco: relleno + borde, no sólo opacidad',
     /\.aurix-chart-range\[aria-pressed="true"\] \{[^}]*background: rgba\(74,130,240,0\.20\)[^}]*border-color/.test(b2));
  ok('16.25 móvil: una fila con scroll horizontal contenido, sin recortes',
     /@media \(max-width: 768px\)[\s\S]{0,600}\.mkt-prv-ranges \{[^}]*overflow-x: auto;[^}]*overflow-y: hidden/.test(b2));
  ok('16.26 motion en la franja del SPEC (180–240 ms) y sin animar el precio',
     /transition: color 200ms ease/.test(b2) && !/\.mkt-prv-price \{[^}]*transition/.test(b2));
  ok('16.27 Reduced Motion elimina transiciones y el barrido de pendiente',
     /@media \(prefers-reduced-motion: reduce\) \{[\s\S]{0,320}transition: none;[\s\S]{0,140}--pending::after \{ animation: none; \}/.test(b2));
  ok('16.28 el bloque CSS no escapa de la ficha: todo bajo #marketPreviewOverlay',
     b2.split('\n').filter(l => /^[.#\[a-z]/.test(l.trim()) && l.includes('{'))
       .every(l => /#marketPreviewOverlay/.test(l) || /^@|^\s*\}/.test(l.trim())));
}

console.log('\nRESULT: ' + (fail === 0 ? 'ALL PASS ✓' : 'FAIL ✗') + '  (' + pass + ' passed, ' + fail + ' failed)');
process.exit(fail === 0 ? 0 : 1);
