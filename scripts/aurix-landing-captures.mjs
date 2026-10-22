#!/usr/bin/env node
/**
 * AURIX · LANDING COMERCIAL V1 — capturas de la landing (herramienta, no se publica).
 * SPEC: docs/AURIX-LANDING-COMMERCIAL-V1-SPEC.md §4.
 *
 * Sirve el repo en 127.0.0.1, monta la app con la CARTERA DE DEMOSTRACIÓN reproducible y el
 * recorrido de 24 h de la captura original (reparto constante), y genera el hero V2 ES/EN.
 * `--v1-assets` regenera además posiciones e Intelligence completa (nombres V1).
 * Antes de escribir una sola imagen comprueba que el motor publica exactamente las cifras que
 * la landing afirma (Premium 29/22/18/69 · «9»; Free 29 %). Si no coinciden, FALLA sin escribir.
 *
 * Red: toda petición que no sea 127.0.0.1 se corta, salvo GET de imágenes, hojas de estilo y
 * fuentes (logos y Google Fonts). Ningún fetch/XHR sale de la máquina ⇒ cero escritura en producción.
 *
 *   node scripts/aurix-landing-captures.mjs            # verifica y escribe las capturas
 *   node scripts/aurix-landing-captures.mjs --check    # sólo verifica el motor
 *   node scripts/aurix-landing-captures.mjs --intel-v2 # sólo Intelligence V2 (escritorio + móvil, ES/EN)
 *   node scripts/aurix-landing-captures.mjs --positions # sólo el detalle de Acciones de Seguimiento (ES/EN)
 *
 * INTELLIGENCE V2 (docs/AURIX-LANDING-INTELLIGENCE-PREMIUM-SPEC.md): Intelligence real con la esfera
 * OCULTA en la captura (la landing pone encima su esfera viva) y la primera pregunta de «Explora»
 * abierta en la misma sesión. Antes de escribir comprueba también la respuesta exacta de esa pregunta,
 * los cinco ejes del Radar certificados y el periodo medido de Estabilidad y Crecimiento.
 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const OUT = process.env.AURIX_LP_OUT || join(ROOT, 'landing', 'assets');
const CHECK_ONLY = process.argv.includes('--check');
const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
let PWm;
try { PWm = await import(PW); } catch (_) { console.error('✗ SIN MOTOR (playwright en ' + PW + ')\nRESULT: NO EJECUTADO'); process.exit(2); }

// ── Cartera de demostración (SPEC §4.1) ─────────────────────────────────────────────
const DAY = 864e5, H = 36e5;
const NOW = Date.now();
const BOUGHT = NOW - 60 * DAY;
// [id, tipo, ticker, nombre, cantidad, precio]  → valor = cantidad × precio (USD)
const ROWS = [
  ['s_msft', 'stock',  'MSFT', 'Microsoft',        125,     428],
  ['s_aapl', 'stock',  'AAPL', 'Apple',            134,     250],
  ['s_amzn', 'stock',  'AMZN', 'Amazon',           20,      200],
  ['s_meta', 'stock',  'META', 'Meta Platforms',   6,       603.355],
  ['e_spy',  'etf',    'SPY',  'SPDR S&P 500',     1,       700],
  ['e_qqq',  'etf',    'QQQ',  'Invesco QQQ',      1,       700],
  ['e_iusa', 'etf',    'IUSA', 'iShares S&P 500',  10,      51.178],
  ['c_btc',  'crypto', 'BTC',  'Bitcoin',          0.62,    66016.1290322581],
  ['c_eth',  'crypto', 'ETH',  'Ethereum',         8,       3395],
  ['c_sol',  'crypto', 'SOL',  'Solana',           25,      160],
  ['c_sui',  'crypto', 'SUI',  'Sui',              1240,    3.23],
  ['m_xau',  'metal',  'XAU',  'Gold',             0.04,    2541.75],
];
const CASH = [['l_1', 'Broker cash', 6663.30], ['l_2', 'Savings account', 6663.30]];
// ── Variación de la cotización en 24 h / última sesión (%) · SPEC Intelligence V2 §4 ──────────
// Moderadas y COHERENTES con el hero: su suma ponderada es EXACTAMENTE el +0,19 % que el
// Dashboard publica en 24 h (la curva original). AAPL es la incógnita que lo cuadra (se resuelve
// abajo, no se elige). Sólo BTC alcanza el umbral de «movimiento» del motor (≥1 % y ≥0,05 pp).
const CHG24 = { MSFT: 0.2, AAPL: null, AMZN: 0.5, META: 0.7, SPY: 0.3, QQQ: 0.3, IUSA: 0.3, BTC: 1.2, ETH: -0.6, SOL: -0.4, SUI: 0.3, XAU: 0.2 };
const REAL_ESTATE = ['r_1', 'Home', 308165];
const COIN = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', SUI: 'sui' };

const ASSETS = [
  ...ROWS.map(([id, type, ticker, name, qty, price]) => ({
    id, type, ticker, name, qty, price, assetCurrency: 'USD', costBasis: +(qty * price).toFixed(2), change24h: 0,   // se fija tras resolver CHG24
    transactions: [{ type: 'buy', qty, price, ts: BOUGHT }], createdAt: BOUGHT,
    ...(type === 'crypto' ? { coinId: COIN[ticker], marketSymbol: ticker } : { marketSymbol: ticker }),
  })),
  ...CASH.map(([id, name, v]) => ({ id, type: 'cash', ticker: 'USD', name, qty: v, price: 1, nominal: v, amount: v, assetCurrency: 'USD', transactions: [], createdAt: BOUGHT })),
  { id: REAL_ESTATE[0], type: 'real_estate', ticker: '', name: REAL_ESTATE[1], qty: 1, price: REAL_ESTATE[2], value: REAL_ESTATE[2], costBasis: REAL_ESTATE[2], purchasePrice: REAL_ESTATE[2], assetCurrency: 'USD',
    transactions: [{ type: 'buy', qty: 1, price: REAL_ESTATE[2], ts: BOUGHT }], createdAt: BOUGHT },
];
const val = a => a.type === 'cash' ? a.qty : a.qty * a.price;
const CV_NOW = { crypto: 0, stock: 0, etf: 0, fund: 0, metal: 0, real_estate: 0, liquidity: 0, other: 0 };
ASSETS.forEach(a => { CV_NOW[a.type === 'cash' ? 'liquidity' : a.type] += val(a); });
Object.keys(CV_NOW).forEach(k => { CV_NOW[k] = +CV_NOW[k].toFixed(2); });
const INVESTABLE = +(Object.keys(CV_NOW).filter(k => k !== 'real_estate').reduce((s, k) => s + CV_NOW[k], 0)).toFixed(2);
if (INVESTABLE !== 186055.38) { console.error('✗ La cartera de demostración no suma 186.055,38 (' + INVESTABLE + ')'); process.exit(1); }

// ── Historial (SPEC §4.1 · V2 §6.C) ──────────────────────────────────────────────────
// Las últimas 24 h reproducen el RECORRIDO ORIGINAL: la curva de la captura del Dashboard de la
// cuenta de prueba (landing/assets/dashboard-2x.jpg — misma cartera: 186.055,38 · +0,19 % en 24 h),
// extraída píxel a píxel (mediana de la línea verde por columna) y muestreada cada 15 min como
// factor sobre el valor actual. No se dibuja una evolución nueva: se recupera la que ya existía.
// Antes de esas 24 h el total se queda en el primer valor de la curva. Reparto CONSTANTE: ninguna
// conclusión de Intelligence cambia a lo largo de la curva.
const HERO_CURVE_24H = [0.998112,0.998064,0.998284,0.998502,0.998626,0.998675,0.998564,0.998528,0.998669,0.998982,0.998917,0.998888,0.998872,0.998745,0.99857,0.998504,0.998538,0.998753,0.99862,0.998552,0.998664,0.998908,0.99895,0.998815,0.998744,0.998808,0.998705,0.998686,0.998826,0.99885,0.998704,0.998844,0.998688,0.999056,0.99992,0.99995,0.999808,0.999753,0.999757,0.99992,0.999864,0.999925,0.999936,0.999944,0.999944,0.999944,0.999944,0.999952,0.999968,1.000008,1.000116,1.000376,1.000216,1.000139,1.000096,1.000069,1.000048,1.000032,1.000016,0.999976,0.999912,0.999721,0.999728,0.999752,0.999752,0.999687,0.99944,0.999416,0.999392,0.99949,0.999683,0.999785,0.999824,0.999864,0.999896,0.99995,1.000277,1.000175,0.999688,0.999357,0.99948,0.999426,0.99891,0.998904,0.999168,0.999566,0.999672,0.999694,0.999779,0.999811,0.999676,0.999549,0.999528,0.999564,0.999747,0.999969,1];
// El tramo que la app dibuja como «24 h» empieza en el primer snapshot que acepta como base (medido
// en una primera pasada, ver CURVE_SPAN): la curva original se coloca exactamente sobre ese tramo.
// El 24 h publicado se mide entre esa base y el ÚLTIMO snapshot (no el valor en vivo), así que la
// curva termina en ese snapshot y desde ahí hasta ahora el total es el actual.
// Resolución de AAPL y factores por categoría. Valor hace 24 h de cada posición = v / (1 + c).
// Se exige Σ (v / (1 + c)) + liquidez = INVESTABLE × curva[0] (el +0,19 % del hero), y cada
// categoría sigue la MISMA curva escalada: f_k(t) = 1 + K_k · (F(t) − 1), con Σ CV_k · K_k =
// INVESTABLE · ⇒ la suma de categorías ES la curva original en cada instante (hero intacto) y al
// final todas valen 1 (pesos, titular, Salud y Radar intactos).
const F0 = HERO_CURVE_24H[0];
{
  const v = a => a.qty * a.price, ago = a => v(a) / (1 + CHG24[a.ticker] / 100);
  const fin = ASSETS.filter(a => CHG24[a.ticker] !== undefined), aapl = fin.find(a => a.ticker === 'AAPL');
  const rest = fin.filter(a => a !== aapl).reduce((t, a) => t + ago(a), 0);
  CHG24.AAPL = (v(aapl) / (INVESTABLE * F0 - CV_NOW.liquidity - rest) - 1) * 100;
  fin.forEach(a => { a.change24h = CHG24[a.ticker]; });
}
const CAT_K = {};
Object.keys(CV_NOW).forEach(k => {
  if (k === 'real_estate' || k === 'liquidity' || !CV_NOW[k]) { CAT_K[k] = 0; return; }
  const ago = ASSETS.filter(a => (a.type === 'cash' ? 'liquidity' : a.type) === k).reduce((t, a) => t + (a.qty * a.price) / (1 + (a.change24h || 0) / 100), 0);
  CAT_K[k] = (ago / CV_NOW[k] - 1) / (F0 - 1);
});
{ const chk = Object.keys(CV_NOW).filter(k => k !== 'real_estate').reduce((t, k) => t + CV_NOW[k] * CAT_K[k], 0);
  if (Math.abs(chk / INVESTABLE - 1) > 1e-9) { console.error('✗ Las variaciones de 24 h no cuadran con la curva del hero (' + chk / INVESTABLE + ')'); process.exit(1); } }
let CURVE_SPAN = DAY, CURVE_END = 0;
const factor = t => {
  const age = Math.max(0, NOW - t);
  if (age <= CURVE_END) return 1;
  if (age >= CURVE_SPAN) return HERO_CURVE_24H[0];
  const pos = (1 - (age - CURVE_END) / (CURVE_SPAN - CURVE_END)) * (HERO_CURVE_24H.length - 1), i = Math.floor(pos), f = pos - i;
  const a = HERO_CURVE_24H[i], b = HERO_CURVE_24H[Math.min(i + 1, HERO_CURVE_24H.length - 1)];
  return a + (b - a) * f;
};
const snapAt = t => { const f = factor(t), cv = {}; let inv = 0;
  Object.keys(CV_NOW).forEach(k => { cv[k] = k === 'real_estate' ? CV_NOW[k] : +(CV_NOW[k] * (1 + CAT_K[k] * (f - 1))).toFixed(2); if (k !== 'real_estate') inv += cv[k]; });
  return { cv, inv: +inv.toFixed(2) }; };
const START = NOW - 30 * DAY, END = NOW - 60e3;
let HIST = [], CATS = [], SERVER = [];
function buildHistory() {
  HIST = []; CATS = []; SERVER = [];
  for (let ts = START; ts < END; ts += DAY) { const s = snapAt(ts); HIST.push({ ts, value: s.inv }); CATS.push({ ts, total: s.inv, ...s.cv }); }
  { const s = snapAt(END); HIST.push({ ts: END, value: s.inv }); CATS.push({ ts: END, total: s.inv, ...s.cv }); }
  for (let ts = START; ts <= END; ts += (END - ts <= 26 * H ? 15 * 60e3 : 6 * H)) {
    const s = snapAt(ts); SERVER.push({ ts, total_value_usd: s.inv, real_estate: 0, category_values: { ...s.cv, real_estate: 0 }, confidence: 'high' });
  }
}
buildHistory();

// ── Lo que la landing afirma (SPEC §2.4) ─────────────────────────────────────────────
const EXPECT = {
  es: { head: 'Microsoft, Bitcoin y Apple pesan más que tus otras 9 inversiones juntas.', top3: '69%', free: 'El 29% de tu cartera financiera depende de Microsoft.' },
  en: { head: 'Microsoft, Bitcoin and Apple outweigh your other 9 investments combined.', top3: '69%', free: '29% of your financial portfolio depends on Microsoft.' },
};
const DRIVERS = [['Microsoft', 29], ['Bitcoin', 22], ['Apple', 18]];
// Intelligence V2 — lo que la landing publica como texto (pregunta, respuesta) y el periodo del pie
// del Radar. Las mismas cadenas están en landing/app.js; scripts/aurix-landing-probe.mjs las compara.
const INTEL_V2 = {
  // Las tres preguntas visibles de «Explora» y sus respuestas, tal como las publica el motor para esta
  // cartera. Las mismas cadenas viven en landing/app.js (lp.iv2.q1…q3 / a1_1…a3_1); el probe las compara.
  es: { qs: [
    { q: '¿Estoy repartido entre varias clases o sigo dependiendo de pocas inversiones?',
      a: ['Repartes entre 4 clases de inversión, pero no tanto entre posiciones: el peso sigue recayendo en tus tres mayores inversiones.',
          'Clases: Acciones, Cripto, Fondos/ETF y Metales. Tres mayores: Microsoft, Bitcoin y Apple.'] },
    { q: '¿Qué parte de mi cartera está entre Acciones y Cripto?',
      a: ['Acciones y Cripto reúnen hoy el 92% de tu cartera financiera.', 'Acciones, 51%; Cripto, 41%.'] },
    { q: '¿Cuánto han rendido realmente mis inversiones?',
      a: ['El rendimiento de tu cartera financiera fue del 0,19% en el último día registrado'] } ],
    tags: ['Acciones: 51% de tu cartera', 'Bitcoin: +1,2% · 24 h'] },
  en: { qs: [
    { q: 'Am I spread across several investment classes, or do I still depend on a few investments?',
      a: ['You spread across 4 investment classes, but less so across positions: the weight still rests on your three largest investments.',
          'Classes: Stocks, Crypto, ETF / Funds and Metals. Three largest: Microsoft, Bitcoin and Apple.'] },
    { q: 'How much of my portfolio is in Stocks and Crypto?',
      a: ['Stocks and Crypto together hold 92% of your financial portfolio today.', 'Stocks, 51%; Crypto, 41%.'] },
    { q: 'How much have my investments actually returned?',
      a: ['The return of your financial portfolio was 0.19% over the last recorded day'] } ],
    tags: ['Stocks: 51% of your portfolio', 'Bitcoin: +1.2% · 24 h'] },
  days: 1,
  health: { score: 33, tone: 'orange' },
};

// ── Servidor local del repo (mismo parche de auth que las sondas de Intelligence) ──
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const AUTH_PATCH = x => String(x)
  .replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')
  .replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0');
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const abs = normalize(join(ROOT, p)); if (!abs.startsWith(ROOT)) return res.writeHead(403).end();
    let body = await readFile(abs);
    if (abs === join(ROOT, 'app.js')) body = Buffer.from(AUTH_PATCH(String(body)));
    res.writeHead(200, { 'content-type': MIME[extname(abs)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch (_) { res.writeHead(404).end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const blocked = [];
async function open(browser, { lang, w, h, premium, anon = false, dpr = 2 }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: w < 800, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.route('**/*', route => {
    const req = route.request(), url = req.url();
    if (url.startsWith(ORIGIN)) return route.continue();
    const t = req.resourceType();
    if (req.method() === 'GET' && (t === 'image' || t === 'font' || t === 'stylesheet')) return route.continue();
    blocked.push(req.method() + ' ' + url.split('?')[0]);
    return route.abort();
  });
  await page.addInitScript(`try{ localStorage.setItem('portfolio_lang', ${JSON.stringify(lang)});
    localStorage.setItem('portfolio_assets', ${JSON.stringify(JSON.stringify(ASSETS))});
    localStorage.setItem('portfolio_history', ${JSON.stringify(JSON.stringify(HIST))});
    localStorage.setItem('category_history', ${JSON.stringify(JSON.stringify(CATS))}); }catch(_){}`);
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(`typeof switchTab === 'function' && typeof _renderIntelligenceCommandCenter === 'function' && typeof _AURIX_ENT_CANON !== 'undefined'`, null, { timeout: 60000 });
  await page.waitForTimeout(900);
  await page.evaluate(`(function(){
    var bl=document.getElementById('bootLoader'); if(bl) bl.remove(); var ar=document.getElementById('appRoot'); if(ar) ar.style.opacity='1';
    try{ _aurixCancelLoginRedirect('p'); _aurixMarkSessionConfirmed(); }catch(_){}
    var fe=Object.create(null); _AURIX_ENT_CANON.forEach(function(k){ fe[k]=${premium ? "(k!=='workspace.catalog_preview')" : 'false'}; });
    _aurixEnt={loaded:true,loading:false,error:null,plan:'${premium ? 'premium' : 'free'}',status:'${premium ? 'active' : 'none'}',source:'default',validUntil:null,features:fe,sources:Object.create(null),fetchedAt:Date.now()};
    // anon: el Dashboard calcula su 24 h en local (sin cuenta no hay performance_state remoto que esperar).
    try { ${anon ? "_aurixActiveUserId=null;" : "_aurixActiveUserId='landing-demo'; _aurixStampCacheOwner();"} _aurixEntApplyToUi(fe); } catch(_) {}
    var srv=${JSON.stringify(SERVER)}; _aurixBackendSnapshots = srv; _aurixSetBackendSnapshotsState('ready');
    switchTab('home');
    // Precios del fixture = precios válidos de esta sesión local: la cabecera dice «Actualizado a las…»
    // como tras un refresco correcto, en vez de «precios no cargados» por la red cortada.
    try { lastRefreshAt = Date.now(); setUpdateStatus('ok'); } catch(_) {}
    // El arranque normal monta la superficie del gráfico tras el login, que aquí no existe.
    try { if (!_aurixDashDesktop && !window.AURIX_MOBILE_SAFE) _aurixDashMount('desktop'); } catch(_) {}
    try { updateChart(); } catch(_) {}
    try { _dshRenderPerfSnapshot(false); } catch(_) {}
    try { renderMiniCompositionDonut(); } catch(_) {}
    try { if (window.AURIX_MOBILE_SAFE) renderAurixMobileLiteChart(); } catch(_) {}
    return true; })()`);
  await page.waitForTimeout(3000);
  return { ctx, page };
}
const text = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; }, sel);

async function dismissContextQuestion(page) {
  const b = page.locator('[data-intel-answer="__pause"]').first();
  if (await b.count()) { await b.click(); await page.waitForTimeout(700); }
}
// Recorta el rectángulo [top,bottom] de la página completa con un margen lateral.
// Sin `fullPage`: estirar la ventana hace que la app re-maquete (sobre todo en móvil) y la base, las
// capas y la imagen final dejarían de coincidir. La región tiene que caber en la ventana.
async function shotRegion(page, path, rect, pad = 16) {
  const sc = await page.evaluate(() => ({ x: scrollX, y: scrollY, h: innerHeight }));
  if (rect.y - pad - sc.y + rect.height + 2 * pad > sc.h + 1) throw new Error('la región no cabe en la ventana: ' + path);
  await page.screenshot({ path, type: 'jpeg', quality: 82,
    clip: { x: Math.max(0, rect.x - pad - sc.x), y: Math.max(0, rect.y - pad - sc.y), width: rect.width + 2 * pad, height: rect.height + 2 * pad } });
}
const rectOf = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; }, sel);
const unionRect = (page, sels) => page.evaluate(ss => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
  ss.forEach(s => { const e = document.querySelector(s); if (!e) return; const r = e.getBoundingClientRect(); if (!r.width) return; n++;
    x0 = Math.min(x0, r.left + scrollX); y0 = Math.min(y0, r.top + scrollY); x1 = Math.max(x1, r.right + scrollX); y1 = Math.max(y1, r.bottom + scrollY); });
  return n ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null; }, sels);

// RETOQUE COMERCIAL DE LA CAPTURA (V2 §6.A/B). Sólo en esta sesión local y sólo como representación:
// cápsula de salud en una línea con acabado glass y donut desplazado a la derecha (bajo el final de la
// cifra total; si la cápsula llega más lejos, a su derecha con margen). El producto no se toca.
async function retouchHero(page, desktop) {
  return page.evaluate(`(function(desktop){
    var st = document.createElement('style');
    st.textContent = ''
      + '#aurixSignal.aurix-signal{ width:auto !important; max-width:none !important; flex:0 0 auto !important;'
      + '  background: linear-gradient(180deg, rgba(255,255,255,.085), rgba(255,255,255,.02) 55%), rgba(42,86,180,.16) !important;'
      + '  border:1px solid rgba(120,170,255,.48) !important; box-shadow: inset 0 1px 0 rgba(255,255,255,.14), 0 6px 18px rgba(0,0,0,.28) !important; }'
      + '#aurixSignal .aurix-signal-line, #aurixSignal .aurix-signal-body, #aurixSignal .aurix-signal-act{ flex-wrap:nowrap !important; white-space:nowrap !important; }'
      + '#aurixSignal .aurix-signal-line{ display:flex !important; align-items:center !important; gap:6px !important; }'
      + '#aurixSignal .aurix-signal-sep{ display:inline !important; visibility:visible !important; opacity:.7 !important; margin:0 6px 0 2px !important; }';
    document.head.appendChild(st);
    var R = function(e){ var r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height, right: r.right + scrollX }; };
    var cap = document.getElementById('aurixSignal'), msg = document.getElementById('aurixSignalMsg'), cta = document.getElementById('aurixSignalCta');
    var out = { value: (document.getElementById('totalValue') || {}).textContent || '', change: (document.getElementById('chartChange') || {}).textContent || '' };
    var c = R(cap), m = msg.getBoundingClientRect(), a = cta.getBoundingClientRect();
    out.capsule = c;
    out.capsuleOneLine = Math.abs((m.top + m.height / 2) - (a.top + a.height / 2)) < 6 && c.height < 64;
    if (desktop) {
      var v = document.getElementById('totalValue'), d = document.getElementById('microCompositionDonut'), zone = document.querySelector('.hero-left');
      var vr = R(v), dr = R(d), zr = R(zone);
      var target = Math.max(vr.right - dr.width / 2, c.right + 20 + dr.width / 2);
      var dx = target - (dr.x + dr.width / 2);
      d.style.transition = 'none'; d.style.transform = 'translateX(' + Math.round(dx) + 'px)';   // sin transición: la captura la ve ya en su sitio
      var nd = R(d);
      out.donutGap = Math.round(nd.x - c.right); out.donutInside = nd.right <= zr.right - 16; out.dx = Math.round(dx);
    } else { out.donutGap = 99; out.donutInside = true; }
    return out; })(${desktop})`);
}
const pct = n => +(n * 100).toFixed(2);
const rel = (c, crop) => ({ l: pct((c.x - crop.x) / crop.width), t: pct((c.y - crop.y) / crop.height), w: pct(c.width / crop.width), h: pct(c.height / crop.height) });
async function writeHotspots(hot) {
  const { writeFile } = await import('node:fs/promises');
  const cssPath = join(ROOT, 'landing', 'styles.css');
  const css = await readFile(cssPath, 'utf8');
  const B = '/* HERO-HOTSPOT:BEGIN', E = '/* HERO-HOTSPOT:END */';
  const rule = (sel, v) => `${sel}{ left:${v.l}%; top:${v.t}%; width:${v.w}%; height:${v.h}%; }`;
  const block = `${B} — generado por scripts/aurix-landing-captures.mjs: cápsula de salud en cada imagen del hero (%). */\n`
    + rule('.hero-hotspot', hot['en-d']) + '\n' + rule('html[lang="es"] .hero-hotspot', hot['es-d']) + '\n'
    + '@media (max-width:767px){\n  ' + rule('.hero-hotspot', hot['en-m']) + '\n  ' + rule('html[lang="es"] .hero-hotspot', hot['es-m']) + '\n}\n' + E;
  const i = css.indexOf(B), j = css.indexOf(E);
  const next = (i >= 0 && j > i) ? css.slice(0, i) + block + css.slice(j + E.length) : css + '\n' + block + '\n';
  await writeFile(cssPath, next);
  console.log('  · zonas del enlace escritas en landing/styles.css: ' + JSON.stringify(hot));
}

// ── HERO V3 · capas para la animación de entrada (V3 §2) ──────────────────────────────────
// Misma sesión, mismo instante y mismo retoque que la captura final: (1) BASE sin la cifra (texto
// transparente, la caja se queda), sin la curva y sin los segmentos del donut; (2) CURVA sola y
// (3) DONUT solo, en PNG con fondo transparente. Base + capas = la imagen final, píxel a píxel
// salvo la cifra, que la landing pinta en HTML con la misma tipografía (Inter) y su formato.
const CURVE_SEL = { d: ['.hero-right .wsc-line', '.hero-right .wsc-area', '.hero-right .wsc-dot', '.hero-right .wsc-last-dot'], m: ['#wealthCurveMobile .aurix-lite-line', '#wealthCurveMobile .aurix-lite-area', '#wealthCurveMobile .wsc-line', '#wealthCurveMobile .wsc-area', '#wealthCurveMobile .wsc-dot', '#wealthCurveMobile .wsc-last-dot'] };
async function heroLayers(page, kind) {
  const geo = await page.evaluate(`(function(kind){
    var R = function(e){ var r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; };
    var tv = document.getElementById('totalValue'), cs = getComputedStyle(tv);
    var svg = kind === 'd' ? document.querySelector('.hero-right .wsc-svg') : document.querySelector('#wealthCurveMobile svg');
    var don = document.getElementById('microCompositionDonut');
    return { value: Object.assign(R(tv), { size: parseFloat(cs.fontSize), weight: cs.fontWeight, ls: parseFloat(cs.letterSpacing) || 0, lh: parseFloat(cs.lineHeight), color: cs.color, text: tv.textContent }),
      curve: svg ? R(svg) : null, donut: (kind === 'd' && don) ? R(don) : null }; })(${JSON.stringify(kind)})`);
  return geo;
}
async function hideForBase(page, kind) {
  await page.addStyleTag({ content: `#totalValue{ color:transparent !important; -webkit-text-fill-color:transparent !important; text-shadow:none !important; }
    ${CURVE_SEL[kind].join(',')}{ visibility:hidden !important; }
    #microCompositionDonut .mcd-segs{ visibility:hidden !important; }` });
  await page.waitForTimeout(300);
}
async function onlyLayer(page, sels) {
  await page.evaluate(() => { for (const el of [document.documentElement, document.body]) { el.style.setProperty('background', 'none', 'important'); el.style.setProperty('background-color', 'transparent', 'important'); el.style.setProperty('visibility', 'hidden', 'important'); el.style.setProperty('color-scheme', 'normal', 'important'); el.style.setProperty('transition', 'none', 'important'); el.style.setProperty('animation', 'none', 'important'); } });
  await page.addStyleTag({ content: `html, body{ background:none !important; background-color:transparent !important; color-scheme:normal !important; transition:none !important; animation:none !important; } *, *::before, *::after{ visibility:hidden !important; }
    ${sels.join(',')}{ visibility:visible !important; }` });
  await page.waitForTimeout(300);
}
const pctRect = (r, crop) => ({ l: pct((r.x - crop.x) / crop.width), t: pct((r.y - crop.y) / crop.height), w: pct(r.width / crop.width), h: pct(r.height / crop.height) });
async function writeLayerCss(L) {
  const { writeFile } = await import('node:fs/promises');
  const cssPath = join(ROOT, 'landing', 'styles.css');
  const css = await readFile(cssPath, 'utf8');
  const B = '/* HERO-LAYERS:BEGIN', E = '/* HERO-LAYERS:END */';
  const box = (sel, v) => `${sel}{ left:${v.l}%; top:${v.t}%; width:${v.w}%; height:${v.h}%; }`;
  const val = (sel, v) => `${sel}{ left:${v.l}%; top:${v.t}%; font-size:${v.fs}cqw; letter-spacing:${v.ls}cqw; line-height:${v.lh}cqw; font-weight:${v.weight}; color:${v.color}; }`;
  const set = (pre, k) => [box(`${pre}.hero-shot .hero-curve`, L[k].curve), L[k].donut ? box(`${pre}.hero-shot .hero-donut`, L[k].donut) : '', val(`${pre}.hero-shot .hero-val`, L[k].value)].filter(Boolean).join('\n');
  const block = `${B} — generado por scripts/aurix-landing-captures.mjs: capas animadas del hero (%, cqw de la imagen). */\n`
    + set('', 'en-d') + '\n' + set('html[lang="es"] ', 'es-d') + '\n'
    + '@media (max-width:767px){\n' + set('', 'en-m') + '\n' + set('html[lang="es"] ', 'es-m') + '\n}\n' + E;
  const i = css.indexOf(B), j = css.indexOf(E);
  await writeFile(cssPath, (i >= 0 && j > i) ? css.slice(0, i) + block + css.slice(j + E.length) : css + '\n' + block + '\n');
  console.log('  · capas del hero escritas en landing/styles.css');
}

// Ajuste móvil V4: bloque propio (posterior en la hoja ⇒ manda sólo en móvil); los de escritorio no se tocan.
async function writeMobileBlocks(hot, L) {
  const { writeFile } = await import('node:fs/promises');
  const cssPath = join(ROOT, 'landing', 'styles.css');
  const css = await readFile(cssPath, 'utf8');
  const B = '/* HERO-MOBILE-V4:BEGIN', E = '/* HERO-MOBILE-V4:END */';
  const box = (sel, v) => `${sel}{ left:${v.l}%; top:${v.t}%; width:${v.w}%; height:${v.h}%; }`;
  const val = (sel, v) => `${sel}{ left:${v.l}%; top:${v.t}%; font-size:${v.fs}cqw; letter-spacing:${v.ls}cqw; line-height:${v.lh}cqw; font-weight:${v.weight}; color:${v.color}; }`;
  const set = (pre, k) => [box(`${pre}.hero-shot .hero-hotspot`, hot[k]), box(`${pre}.hero-shot .hero-curve`, L[k].curve), val(`${pre}.hero-shot .hero-val`, L[k].value)].join('\n  ');
  const block = `${B} — generado por scripts/aurix-landing-captures.mjs --mobile-v4: hero móvil con los puntos del carrusel. */\n@media (max-width:767px){\n  `
    + set('', 'en-m') + '\n  ' + set('html[lang="es"] ', 'es-m') + '\n}\n' + E;
  const i = css.indexOf(B), j = css.indexOf(E);
  await writeFile(cssPath, (i >= 0 && j > i) ? css.slice(0, i) + block + css.slice(j + E.length) : css + '\n' + block + '\n');
  console.log('  · bloque móvil V4 escrito en landing/styles.css');
}

const fails = [];
const ok = (name, cond, info) => { if (cond) console.log('  ✓ ' + name); else { fails.push(name); console.log('  ✗ ' + name + (info ? '  [' + String(info).slice(0, 300) + ']' : '')); } };


// ── INTELLIGENCE V2 ───────────────────────────────────────────────────────────────────────
// Una sola sesión por encuadre y la MISMA cartera: base sin esfera y sin el arco de Salud (la
// landing pone encima su esfera viva y dibuja el arco en vector), y la card «Explora» con cada
// pregunta abierta SIN el texto de su respuesta (la landing lo pone encima como texto real,
// desplazable, con la tipografía medida aquí). Antes de escribir se comprueba todo lo publicado.
const INTEL_V2_MODE = process.argv.includes('--intel-v2');
const POSITIONS_MODE = process.argv.includes('--positions');
const visQs = page => page.evaluate(`[...document.querySelectorAll('.intcc-explore .intcc-x-q')].filter(function(b){ return b.offsetParent !== null; }).map(function(b){ return b.id; })`);
async function intelV2Check(page, lang, w) {
  const E = INTEL_V2[lang];
  const r = await page.evaluate(`(function(){
    var o = {}; var n = function(s){ return String(s || '').replace(/\\s+/g, ' ').trim(); };
    var qs = [].slice.call(document.querySelectorAll('.intcc-explore .intcc-x-q')).filter(function(b){ return b.offsetParent !== null; });
    o.qs = qs.map(function(b){ var a = document.getElementById(b.getAttribute('aria-controls'));
      return { q: n(b.innerText), a: a ? [].slice.call(a.querySelectorAll('p')).map(function(p){ return n(p.textContent); }) : null }; });
    o.tags = [].slice.call(document.querySelectorAll('.intcc-hero .intv21-tag')).map(function(e){ return n(e.textContent); });
    var rc = document.querySelector('.intcc-radar'); o.certified = rc ? rc.getAttribute('data-certified') : null;
    var pr = _aurixPeakRetention('all'), gr = _aurixGrowthAxis('all');
    var d = function(x){ return (x && x.status === 'available' && x.spanMs > 0) ? Math.max(1, Math.round(x.spanMs / 864e5)) : null; };
    o.stabDays = d(pr); o.growthDays = d(gr);
    var ax = _intv7RadarAxes(); o.stabDisplay = ax.display && ax.display.stability; o.spanLabel = _intv4T('intv7_axis_span_days', o.stabDays);
    var h = document.querySelector('.intcc-hero'); o.heroCls = h ? h.className : ''; o.heroTxt = h ? n(h.innerText) : '';
    o.r24 = (function(){ try { var x = _aurixRangeReturn('24h'); return x && x.pct; } catch(_) { return null; } })();
    return o; })()`);
  const T = `${lang} ${w}`;
  ok(`${T} · V2 las tres preguntas de Explora y sus respuestas, exactas`, JSON.stringify(r.qs) === JSON.stringify(E.qs), JSON.stringify(r.qs));
  ok(`${T} · V2 etiquetas reales del hero (clase + movimiento de 24 h)`, w < 768 || JSON.stringify(r.tags) === JSON.stringify(E.tags), JSON.stringify(r.tags));
  ok(`${T} · V2 Radar con 5 ejes certificados`, r.certified === '5', r.certified);
  ok(`${T} · V2 Estabilidad y Crecimiento medidos sobre ${INTEL_V2.days} d (motor)`, r.stabDays === INTEL_V2.days && r.growthDays === INTEL_V2.days, JSON.stringify(r));
  ok(`${T} · V2 el motor declara ese periodo en el eje (${r.spanLabel})`, !!r.spanLabel && String(r.stabDisplay || '').includes(r.spanLabel), r.stabDisplay);
  ok(`${T} · V2 Salud ${INTEL_V2.health.score} % · A vigilar, tono ${INTEL_V2.health.tone}`, w < 768 || (new RegExp('\\b' + INTEL_V2.health.score + '\\b').test(r.heroTxt) && /(A vigilar|Worth watching)/.test(r.heroTxt) && r.heroCls.includes('is-tone-' + INTEL_V2.health.tone)), r.heroCls + ' | ' + r.heroTxt.slice(0, 120));
  return r;
}
// Arco de Salud: caja del SVG, color y fracción que pinta la app.
const arcOf = page => page.evaluate(`(function(){ var s = document.querySelector('.intcc-hero .intcc-score-svg'), c = s && s.querySelector('.intcc-score-arc'); if (!c) return null;
  var r = s.getBoundingClientRect(), cs = getComputedStyle(c), da = parseFloat(c.getAttribute('stroke-dasharray')), off = parseFloat(c.getAttribute('stroke-dashoffset'));
  return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height, color: cs.stroke, sw: parseFloat(cs.strokeWidth), frac: +(1 - off / da).toFixed(4), r: +c.getAttribute('r') }; })()`);
// Respuesta abierta: caja de la región desplazable, cabecera abierta y tipografía de sus párrafos.
async function openGeom(page, id) {
  return page.evaluate(id => { const b = document.getElementById(id), a = document.getElementById(b.getAttribute('aria-controls'));
    const R = e => { const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; };
    // Donde EMPIEZA EL TEXTO (no la caja del párrafo: el producto sangra con el padding del <p>), el
    // padding vertical de los párrafos y su separación, y el color de cada uno.
    const p = a.querySelector('p'), p2 = a.querySelectorAll('p')[1], cs = getComputedStyle(p), cs2 = p2 ? getComputedStyle(p2) : null, ar = a.getBoundingClientRect();
    const rg = document.createRange(); rg.selectNodeContents(p); const t0 = rg.getClientRects()[0];
    const pr = p.getBoundingClientRect();
    return { hdr: R(b), box: R(a), fs: parseFloat(cs.fontSize), lh: parseFloat(cs.lineHeight), color: cs.color, color2: cs2 ? cs2.color : cs.color, weight: cs.fontWeight,
      padL: t0.left - ar.left, padR: ar.right - pr.right + parseFloat(cs.paddingRight), padT: (pr.top - ar.top) + parseFloat(cs.paddingTop),
      gap: p2 ? parseFloat(cs.paddingBottom) + parseFloat(cs2.paddingTop) : 0, scrolls: a.scrollHeight > a.clientHeight + 1 }; }, id);
}
const HIDE_ANSWER_TEXT = '.intcc-explore .intcc-x-answer-in p{ visibility:hidden !important; }';
async function writeIntelV2Css(G) {
  const { writeFile } = await import('node:fs/promises');
  const cssPath = join(ROOT, 'landing', 'styles.css');
  const css = await readFile(cssPath, 'utf8');
  const B = '/* INTEL-V2-LAYERS:BEGIN', E = '/* INTEL-V2-LAYERS:END */';
  const box = (sel, v) => `${sel}{ left:${v.l}%; top:${v.t}%; width:${v.w}%; height:${v.h}%; }`;
  // La esfera de la landing se centra en el hueco de la de la app. Su anillo exterior mide 1,08 × el
  // hueco (.lp-orb-ring--1, inset −4 %) y el de la app 0,88 × su caja (.intcc-orb-ring--1, inset 6 %):
  // mismo diámetro de anillo ⇒ hueco = 0,88 / 1,08 × la caja de la app.
  const orb = (sel, v) => `${sel}{ --iv2-cx:${+(v.l + v.w / 2).toFixed(2)}%; --iv2-cy:${+(v.t + v.h / 2).toFixed(2)}%; --iv2-ow:${+(v.w * 0.88 / 1.08).toFixed(3)}; }`;
  // Texto de la respuesta en cqw de la imagen (escala con ella), con un mínimo legible de 13 px.
  const ans = (sel, a, Wc) => `${sel}{ left:${a.box.l}%; top:${a.box.t}%; width:${a.box.w}%; height:${a.box.h}%; --iv2-fs:${+(a.fs / Wc * 100).toFixed(4)}cqw; --iv2-lh:${+(a.lh / a.fs).toFixed(3)}; --iv2-gap:${+(a.gap / Wc * 100).toFixed(4)}cqw; --iv2-pl:${+(a.padL / Wc * 100).toFixed(4)}cqw; --iv2-pr:${+(a.padR / Wc * 100).toFixed(4)}cqw; --iv2-pt:${+(a.padT / Wc * 100).toFixed(4)}cqw; --iv2-c2:${a.color2}; color:${a.color}; font-weight:${a.weight}; }`;
  const setD = (pre, g) => [orb(`${pre}.iv2-shot`, g.orb),
    `${pre}.iv2-shot .iv2-arc{ left:${g.arc.l}%; top:${g.arc.t}%; width:${g.arc.w}%; height:${g.arc.h}%; --iv2-arc-frac:${g.arc.frac}; --iv2-arc-color:${g.arc.color}; }`,
    `${pre}.iv2-shot .iv2-radar-note{ right:${g.radar.right}%; top:${g.radar.top}%; height:${g.radar.h}%; --iv2-rn-fs:${g.radar.fs}cqw; }`,
    box(`${pre}.iv2-shot .iv2-open`, g.card),
    ...g.qs.map((q, i) => box(`${pre}.iv2-shot .iv2-q[data-q="${i + 1}"]`, q)),
    ...g.open.map((o, i) => box(`${pre}.iv2-shot[data-open="${i + 1}"] .iv2-q[data-q="${i + 1}"]`, o.hdr)),
    ...g.open.map((o, i) => ans(`${pre}.iv2-shot .iv2-ans[data-q="${i + 1}"]`, o, g.W))].join('\n');
  const setM = (pre, g) => [orb(`${pre}.iv2-shot`, g.orb),
    ...g.qs.map((q, i) => box(`${pre}.iv2-m-explore .iv2-q[data-q="${i + 1}"]`, q)),
    ...g.open.map((o, i) => box(`${pre}.iv2-m-explore[data-open="${i + 1}"] .iv2-q[data-q="${i + 1}"]`, o.hdr)),
    ...g.open.map((o, i) => ans(`${pre}.iv2-m-explore .iv2-ans[data-q="${i + 1}"]`, o, g.W))].join('\n  ');
  const block = `${B} — generado por scripts/aurix-landing-captures.mjs --intel-v2: esfera, arco de Salud, preguntas y respuestas de Explora en cada imagen (%, cqw). */\n`
    + setD('', G['en-d']) + '\n' + setD('html[lang="es"] ', G['es-d']) + '\n'
    + '@media (max-width:1023px){\n  ' + setM('', G['en-m']) + '\n  ' + setM('html[lang="es"] ', G['es-m']) + '\n}\n' + E;
  const i = css.indexOf(B), j = css.indexOf(E);
  await writeFile(cssPath, (i >= 0 && j > i) ? css.slice(0, i) + block + css.slice(j + E.length) : css + '\n' + block + '\n');
  console.log('  · geometría de Intelligence V2 escrita en landing/styles.css');
}
async function intelV2(browser, write) {
  const G = {};
  const style = (page, c) => page.addStyleTag({ content: c }).then(() => page.waitForTimeout(250));
  const rel = (r, crop) => pctRect(r, crop);
  for (const lang of ['es', 'en']) {
    // Escritorio: hero (Salud + Inteligencia), Radar, Factores, Explora; 1x y 2x.
    for (const dpr of [1, 2]) {
      const { ctx, page } = await open(browser, { lang, w: 1440, h: 900, premium: true, dpr });
      await page.evaluate(`switchTab('intelligence')`); await page.waitForTimeout(1800);
      await dismissContextQuestion(page);
      if (dpr === 1) await intelV2Check(page, lang, 1440);
      const orbR = await rectOf(page, '.intcc-hero-orb-wrap .intcc-orb'), arc = await arcOf(page);
      await style(page, '.intcc-orb{ visibility:hidden !important; } .intcc-hero .intcc-score-arc{ visibility:hidden !important; }');
      const r = await unionRect(page, ['.intcc-hero', '.intcc-radar', '.intcc-drivers', '.intcc-explore']);
      ok(`${lang} · V2 escritorio @${dpr}x localizado (esfera y arco)`, !!r && !!orbR && !!arc, JSON.stringify({ r, orbR, arc }));
      if (!(r && orbR && arc)) { await ctx.close(); continue; }
      const sfx = dpr === 2 ? '-2x' : '';
      const crop = await write(page, `intelligence-v2-${lang}${sfx}.jpg`, r, 16);
      const ids = await visQs(page);
      const qs = []; for (const id of ids) qs.push(rel(await rectOf(page, '#' + id), crop));
      const card0 = await rectOf(page, '.intcc-explore');
      // Nota del periodo del Radar: en la fila de su título, alineada a la derecha con el mismo margen.
      const radar = await page.evaluate(() => { const c = document.querySelector('.intcc-radar'), t = c && c.querySelector('.intcc-card-title'); if (!t) return null;
        const R = e => { const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; };
        return { card: R(c), title: R(t), fs: parseFloat(getComputedStyle(t).fontSize) }; });
      ok(`${lang} · V2 @${dpr}x tarjeta del Radar y su título localizados`, !!radar, JSON.stringify(radar));
      await style(page, HIDE_ANSWER_TEXT);
      const opened = [];
      for (let k = 0; k < ids.length; k++) {
        await page.click('#' + ids[k]); await page.waitForTimeout(700);
        const card = await rectOf(page, '.intcc-explore'), g = await openGeom(page, ids[k]);
        ok(`${lang} · V2 @${dpr}x pregunta ${k + 1} abierta en la misma caja`, Math.abs(card.height - card0.height) < 1 && Math.abs(card.y - card0.y) < 1, JSON.stringify({ card0, card }));
        await write(page, `intelligence-v2-open${k + 1}-${lang}${sfx}.jpg`, card, 0);
        opened.push({ hdr: rel(g.hdr, crop), box: rel(g.box, crop), fs: g.fs, lh: g.lh, gap: g.gap, padL: g.padL, padR: g.padR, padT: g.padT, color: g.color, color2: g.color2, weight: g.weight });
        await page.click('#' + ids[k]); await page.waitForTimeout(500);
      }
      if (dpr === 1 && radar) { const inset = radar.title.x - radar.card.x;
        G[lang + '-d'] = { W: crop.width, orb: rel(orbR, crop), arc: Object.assign(rel(arc, crop), { frac: arc.frac, color: arc.color }), card: rel(card0, crop), qs, open: opened,
          radar: { right: pct((crop.x + crop.width - (radar.card.x + radar.card.width - inset)) / crop.width), top: pct((radar.title.y - crop.y) / crop.height), h: pct(radar.title.height / crop.height), fs: +(radar.fs / crop.width * 100).toFixed(4) } }; }
      await ctx.close();
    }
    // Móvil real (390): cabecera de Intelligence, Factores y Explora, cada card por separado (sin Salud ni
    // Radar). La pregunta de contexto se aplaza, como haría el usuario.
    { const { ctx, page } = await open(browser, { lang, w: 390, h: 844, premium: true });
      await page.evaluate(`switchTab('intelligence')`); await page.waitForTimeout(1800);
      await dismissContextQuestion(page);
      await intelV2Check(page, lang, 390);
      const order = await page.evaluate(`['.intcc-m-hero','.intcc-drivers','.intcc-explore'].map(function(s){ var e=[].slice.call(document.querySelectorAll(s)).find(function(x){ return x.offsetParent !== null; }); return e ? e.getBoundingClientRect().top + scrollY : null; })`);
      ok(`${lang} · V2 móvil: cabecera → Factores → Explora en ese orden`, order.every(Number.isFinite) && order[0] < order[1] && order[1] < order[2], JSON.stringify(order));
      const shot = async (sel, file) => { await page.evaluate(`document.querySelector('${sel}').scrollIntoView({ block: 'center' })`); await page.waitForTimeout(250);
        const r = await rectOf(page, sel); return { r, crop: await write(page, file, r, 0) }; };
      const orbR = await rectOf(page, '.intcc-m-orb .intcc-orb');
      await style(page, '.intcc-orb{ visibility:hidden !important; }');
      const head = await shot('.intcc-m-hero', `intelligence-v2-m-head-${lang}.jpg`);
      await shot('.intcc-drivers', `intelligence-v2-m-drivers-${lang}.jpg`);
      const ex = await shot('.intcc-explore', `intelligence-v2-m-explore-${lang}.jpg`);
      const ids = await visQs(page);
      const qs = []; for (const id of ids) qs.push(pctRect(await rectOf(page, '#' + id), ex.crop));
      await style(page, HIDE_ANSWER_TEXT);
      const opened = [];
      for (let k = 0; k < ids.length; k++) {
        await page.click('#' + ids[k]); await page.waitForTimeout(700);
        const e2 = await shot('.intcc-explore', `intelligence-v2-m-explore-open${k + 1}-${lang}.jpg`);
        ok(`${lang} · V2 móvil pregunta ${k + 1} abierta en la misma caja`, Math.abs(e2.r.height - ex.r.height) < 1, JSON.stringify({ a: ex.r, b: e2.r }));
        const g = await openGeom(page, ids[k]);
        opened.push({ hdr: pctRect(g.hdr, ex.crop), box: pctRect(g.box, ex.crop), fs: g.fs, lh: g.lh, gap: g.gap, padL: g.padL, padR: g.padR, padT: g.padT, color: g.color, color2: g.color2, weight: g.weight });
        await page.click('#' + ids[k]); await page.waitForTimeout(500);
      }
      G[lang + '-m'] = { W: ex.crop.width, orb: pctRect(orbR, head.crop), qs, open: opened };
      await ctx.close(); }
  }
  if (['es-d', 'en-d', 'es-m', 'en-m'].every(k => G[k])) await writeIntelV2Css(G);
  else ok('geometría de Intelligence V2 medida en las cuatro variantes', false, JSON.stringify(Object.keys(G)));
}
// Seguimiento: el detalle de Acciones con la misma cartera (variaciones de 24 h incluidas).
async function positionsCapture(browser, write) {
  for (const lang of ['es', 'en']) {
    // 1440 de ancho (mismo maquetado de escritorio); alto suficiente para que el detalle quepa entero.
    const { ctx, page } = await open(browser, { lang, w: 1440, h: 1400, premium: true, anon: true, dpr: 1 });
    await page.evaluate(`setActiveCategory('stock')`); await page.waitForTimeout(1800);
    const r = await rectOf(page, '#assetsSection.is-detail');
    ok(`${lang} · detalle de Acciones localizado`, !!r, r && JSON.stringify(r));
    if (r) { await page.evaluate(y => scrollTo(0, y), Math.max(0, r.y - 40)); await page.waitForTimeout(400); await write(page, `positions-demo-${lang}.jpg`, r, 12); }
    await ctx.close();
  }
}

const browser = await PWm.chromium.launch();
const plan = [];
try {
  // 1 · Verificación del motor (antes de escribir nada)
  for (const lang of ['es', 'en']) {
    const E = EXPECT[lang];
    { const { ctx, page } = await open(browser, { lang, w: 1440, h: 900, premium: true });
      const base = await page.evaluate(`({ inv: Math.round(investableValueUSD()*100)/100, n: activeAssets().length })`);
      ok(`${lang} · invertible 186.055,38 y 15 activos`, base.inv === 186055.38 && base.n === 15, JSON.stringify(base));
      await page.evaluate(`switchTab('intelligence')`); await page.waitForTimeout(1500);
      const hero = await text(page, '.intcc-hero'), drv = await text(page, '.intcc-drivers');
      ok(`${lang} · Premium titular del motor`, !!hero && hero.includes(E.head), hero);
      ok(`${lang} · Premium factores 29/22/18`, !!drv && DRIVERS.every(([n, p]) => new RegExp(n + '[^%]*?' + p + '\\s?%').test(drv)), drv);
      ok(`${lang} · Premium tres mayores = 69 %`, !!drv && drv.includes(E.top3), drv);
      await ctx.close(); }
    { const { ctx, page } = await open(browser, { lang, w: 1440, h: 900, premium: false });
      const f = await page.evaluate(`(function(){ var r=_aurixIntelligencePreviewFacts(); return r && r.visible && r.visible[0] ? r.visible[0].text : null; })()`);
      ok(`${lang} · Free primera lectura`, f === E.free, f);
      await ctx.close(); }
  }
  if (fails.length) throw new Error('el motor no publica lo que la landing afirma');
  if (!CHECK_ONLY) {
    // Primera pasada: ¿dónde empieza el tramo «24 h» que la app dibuja? (mismos timestamps; sólo cambian valores)
    const { ctx, page } = await open(browser, { lang: 'es', w: 1440, h: 900, premium: true, anon: true });
    const win = await page.evaluate(`(function(){ var r=_aurixRangeReturn('24h'); return [r.baselineTs, r.lastTs]; })()`);
    const baseAge = NOW - win[0];
    await ctx.close();
    ok('tramo 24 h de la app medido', Number.isFinite(baseAge) && baseAge > 12 * H && baseAge <= 26 * H, baseAge);
    CURVE_SPAN = baseAge; CURVE_END = NOW - win[1]; buildHistory();
    console.log('  · curva original colocada sobre las últimas ' + (CURVE_SPAN / H).toFixed(2) + ' h');
    if (process.argv.includes('--diag')) { const { ctx: c2, page: p2 } = await open(browser, { lang: 'es', w: 1440, h: 900, premium: true, anon: true });
      console.log(await p2.evaluate(`(function(){ var r=_aurixRangeReturn('24h'); var g=getValidReturnBaseline('24h'); return JSON.stringify({ bAgeH:(${NOW}-r.baselineTs)/36e5, start:r.startValue, lastAgeMin:(${NOW}-r.lastTs)/6e4, endV:r.endValue, cur:g.currentValue, pct:g.deltaPct, gb:g.baselineValue, gts:(${NOW}-g.baselineTs)/36e5 }); })()`));
      const srvBase = SERVER.filter(x => x.ts <= NOW - CURVE_SPAN + 60e3).slice(-2); console.log('srv near base', JSON.stringify(srvBase.map(x => [((NOW - x.ts) / H).toFixed(3), x.total_value_usd])));
      await c2.close(); throw new Error('diag'); }
  }
  if (CHECK_ONLY) console.log('\n(sólo verificación: no se escribe ninguna imagen)');
  else {
    await mkdir(OUT, { recursive: true });
    const write = async (page, file, rect, pad) => { await shotRegion(page, join(OUT, file), rect, pad); plan.push(file); return { x: rect.x - pad, y: rect.y - pad, width: rect.width + 2 * pad, height: rect.height + 2 * pad }; };
    const hot = {}, layers = {};
    const valRel = (v, crop) => Object.assign(pctRect(v, crop), { fs: pct(v.size / crop.width), ls: +(v.ls / crop.width * 100).toFixed(4), lh: pct(v.lh / crop.width), weight: v.weight, color: v.color });
    const MOBILE_ONLY = process.argv.includes('--mobile-v4');   // ajuste móvil: sólo recursos -v4- del móvil
    if (INTEL_V2_MODE) await intelV2(browser, write);
    else if (POSITIONS_MODE) await positionsCapture(browser, write);
    else {
    for (const lang of ['es', 'en']) {
      // 2 · Hero escritorio V2 (1x y 2x). anon ⇒ 24 h calculada en local con la curva original.
      for (const dpr of (MOBILE_ONLY ? [] : [1, 2])) {
        const { ctx, page } = await open(browser, { lang, w: 1440, h: 900, premium: true, anon: true, dpr });
        const t = await retouchHero(page, true); await page.waitForTimeout(400);
        ok(`${lang} · hero @${dpr}x · valor 186.055,38 y +0,19 % en 24 h`, /186[.,]055[.,]38/.test(t.value) && /\+0[.,]19\s?%/.test(t.change), JSON.stringify({ v: t.value, c: t.change }));
        ok(`${lang} · hero @${dpr}x · cápsula en una línea`, t.capsuleOneLine, JSON.stringify(t));
        ok(`${lang} · hero @${dpr}x · donut a la derecha, separado de la cápsula y dentro de la zona`, t.donutGap >= 16 && t.donutInside, JSON.stringify(t));
        const r = await rectOf(page, '.dashboard-top.hero-card');
        ok(`${lang} · hero escritorio @${dpr}x localizado`, !!r, r && JSON.stringify(r));
        if (r) {
          const crop = await write(page, `hero-dashboard-v3-full-${lang}${dpr === 2 ? '-2x' : ''}.jpg`, r, 16); if (dpr === 1) hot[lang + '-d'] = rel(t.capsule, crop);
          const sfx = dpr === 2 ? '-2x' : '';
          const g = await heroLayers(page, 'd');
          ok(`${lang} · hero @${dpr}x · capas localizadas (cifra, curva, donut)`, !!(g.curve && g.donut && g.value.width), JSON.stringify(g));
          await hideForBase(page, 'd'); await write(page, `hero-dashboard-v3-base-${lang}${sfx}.jpg`, r, 16);
          await onlyLayer(page, CURVE_SEL.d);
          const scrollXY = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
          await page.screenshot({ path: join(OUT, `hero-dashboard-v3-curve-${lang}${sfx}.png`), omitBackground: true, clip: { x: g.curve.x - scrollXY.x, y: g.curve.y - scrollXY.y, width: g.curve.width, height: g.curve.height } }); plan.push(`hero-dashboard-v3-curve-${lang}${sfx}.png`);
          await page.addStyleTag({ content: `${CURVE_SEL.d.join(',')}{ visibility:hidden !important; } #microCompositionDonut .mcd-segs, #microCompositionDonut .mcd-segs *{ visibility:visible !important; }` }); await page.waitForTimeout(200);
          await page.screenshot({ path: join(OUT, `hero-dashboard-v3-donut-${lang}${sfx}.png`), omitBackground: true, clip: { x: g.donut.x - scrollXY.x, y: g.donut.y - scrollXY.y, width: g.donut.width, height: g.donut.height } }); plan.push(`hero-dashboard-v3-donut-${lang}${sfx}.png`);
          if (dpr === 1) layers[lang + '-d'] = { curve: pctRect(g.curve, crop), donut: pctRect(g.donut, crop), value: valRel(g.value, crop) };
        }
        await ctx.close();
      }
      // 3 · Hero móvil V2: Dashboard móvil real — tarjeta de patrimonio + tarjeta de evolución.
      { const { ctx, page } = await open(browser, { lang, w: 390, h: 1300, premium: true, anon: true });
        const t = await retouchHero(page, false); await page.waitForTimeout(400);
        ok(`${lang} · hero móvil · cápsula en una línea`, t.capsuleOneLine, JSON.stringify(t));
        const r = await page.evaluate(`(function(mob){ var top=document.querySelector('.dashboard-top.hero-card'); var host=document.getElementById('wealthCurveMobile'); if(!top||!host) return null;
          var tr=top.getBoundingClientRect(), x=host; while (x && x.parentElement && x.getBoundingClientRect().width < tr.width - 2) x = x.parentElement;
          var cr=x.getBoundingClientRect(), bottom = cr.bottom, dots = document.querySelector('.mobile-slider-dots'), db = null;
          // V4 (ajuste móvil): la captura llega al borde inferior de la tarjeta del carrusel, con sus dos puntos enteros.
          if (mob && dots) { var card = dots.parentElement.getBoundingClientRect(); db = dots.getBoundingClientRect().bottom; bottom = Math.max(card.bottom, db + 14); }
          return { x: tr.left+scrollX, y: tr.top+scrollY, width: tr.width, height: (bottom - tr.top), dotsGap: db === null ? null : Math.round(bottom - db) }; })(${MOBILE_ONLY})`);
        ok(`${lang} · hero móvil localizado`, !!r && r.height > 400, r && JSON.stringify(r));
        if (MOBILE_ONLY) ok(`${lang} · hero móvil · los dos puntos del carrusel caben con margen ≥12 px`, r && r.dotsGap >= 12, r && JSON.stringify(r));
        if (r) {
          const V = MOBILE_ONLY ? 'v4' : 'v3';
          const crop = await write(page, `hero-dashboard-${V}-full-m-${lang}.jpg`, r, 8); hot[lang + '-m'] = rel(t.capsule, crop);
          const g = await heroLayers(page, 'm');
          ok(`${lang} · hero móvil · capas localizadas (cifra, curva)`, !!(g.curve && g.value.width), JSON.stringify(g));
          await hideForBase(page, 'm'); await write(page, `hero-dashboard-${V}-base-m-${lang}.jpg`, r, 8);
          await onlyLayer(page, CURVE_SEL.m);
          const scrollXY = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
          await page.screenshot({ path: join(OUT, `hero-dashboard-${V}-curve-m-${lang}.png`), omitBackground: true, clip: { x: g.curve.x - scrollXY.x, y: g.curve.y - scrollXY.y, width: g.curve.width, height: g.curve.height } }); plan.push(`hero-dashboard-${V}-curve-m-${lang}.png`);
          layers[lang + '-m'] = { curve: pctRect(g.curve, crop), value: valRel(g.value, crop) };
        }
        await ctx.close(); }
      // Recursos V1 (posiciones, Intelligence completa): sólo con --v1-assets, para no sobrescribirlos.
      if (process.argv.includes('--v1-assets') && !MOBILE_ONLY) {
        { const { ctx, page } = await open(browser, { lang, w: 1440, h: 900, premium: true });
          await page.evaluate(`switchTab('intelligence')`); await page.waitForTimeout(1500);
          await dismissContextQuestion(page);
          const r = await unionRect(page, ['.intcc-hero', '.intcc-radar', '.intcc-drivers', '.intcc-explore']);
          ok(`${lang} · Intelligence localizada`, !!r, r && JSON.stringify(r));
          if (r) await write(page, `intelligence-full-${lang}.jpg`, r, 16);
          await ctx.close(); }
        { const { ctx, page } = await open(browser, { lang, w: 1440, h: 900, premium: true, anon: true, dpr: 1 });
          await page.evaluate(`setActiveCategory('stock')`); await page.waitForTimeout(1800);
          const r = await rectOf(page, '#assetsSection.is-detail');
          ok(`${lang} · detalle de Acciones localizado`, !!r, r && JSON.stringify(r));
          if (r) await write(page, `positions-demo-${lang}.jpg`, r, 12);
          await ctx.close(); }
      }
    }
    // 4 · Zona del enlace «Ver análisis» sobre la cápsula de cada imagen → bloque generado en styles.css.
    if (MOBILE_ONLY) {
      if (['es-m', 'en-m'].every(k => hot[k] && layers[k])) await writeMobileBlocks(hot, layers);
      else ok('zonas y capas móviles medidas', false, JSON.stringify({ hot: Object.keys(hot), layers: Object.keys(layers) }));
    } else if (['es-d', 'en-d', 'es-m', 'en-m'].every(k => hot[k])) await writeHotspots(hot);
    else ok('zonas del enlace «Ver análisis» medidas en las cuatro imágenes', false, JSON.stringify(hot));
    if (MOBILE_ONLY) { /* ya escrito arriba */ } else if (['es-d', 'en-d', 'es-m', 'en-m'].every(k => layers[k])) await writeLayerCss(layers);
    else ok('capas del hero medidas en las cuatro variantes', false, JSON.stringify(Object.keys(layers)));
    }
    console.log('\nEscritas en ' + OUT + ': ' + plan.join(', '));
  }
} catch (e) { console.error('\n✗ ' + e.message); if (!fails.length) fails.push(e.message); }
finally { await browser.close(); server.close(); }

const leaks = blocked.filter(u => !/^GET /.test(u));
console.log(`Peticiones externas cortadas: ${blocked.length} (no-GET: ${leaks.length})`); leaks.forEach(u => console.log('  · cortada: ' + u));
console.log(fails.length ? `\nRESULT: NO-GO · ${fails.length} fallo(s)` : '\nRESULT: GO');
process.exit(fails.length ? 1 : 0);
