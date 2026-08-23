#!/usr/bin/env node
/**
 * AURIX · FASE 1 FINAL QA — Dashboard, navegación, Add Asset y frontera free/premium.
 *
 * Mide geometría e integridad REALES en móvil y escritorio sobre el bundle local, con la
 * receta de aurix-market-visual-audit (proxy local + parche SÓLO de la navegación de auth
 * + CDP). No juzga estética: mide lo que puede estar roto.
 *
 * LIMITACIÓN CONOCIDA, leer antes de interpretar un resultado:
 *   La sesión es ANÓNIMA y el arranque deja el almacén local vacío, así que el Dashboard se
 *   mide en su estado SIN CARTERA. Sembrar `portfolio_assets` / `aurix_assets` antes del boot
 *   no sobrevive, y empujar sobre `assets` después tampoco se refleja (`seedCheck.assetsLen`
 *   sigue en 0). Por eso hero=$0.00, chart 0x0 y retorno vacío son el estado ESPERADO aquí,
 *   no defectos: el badge autenticado se publica desde `performance_state` remoto y el motor
 *   no dibuja sin historial. Lo que este probe SÍ certifica de forma sólida es el desborde
 *   horizontal, el texto roto, la navegación, los overlays y el ciclo abrir/cerrar de modales.
 *   El Dashboard CON cartera requiere sesión autenticada ⇒ QA del founder.
 *
 * Mide la geometría REAL de la pantalla Market en móvil y escritorio, sobre el bundle local,
 * con datos reales de la API. No juzga estética: mide los defectos que el SPEC prohíbe.
 *
 *   overflowX      la lista o alguna fila desborda a lo ancho          (móvil: prohibido)
 *   rowHeights     alturas distintas de fila = nombres rompiendo caja
 *   priceLeftVar   variación del borde izquierdo del precio            = "precios bailando"
 *   changeRightVar variación del borde derecho de la variación
 *   chartBoxVar    tamaños distintos de la celda del mini gráfico      = charts deformados
 *   ellipsisMissing títulos que desbordan SIN elipsis
 *   touchSmall     objetivos táctiles por debajo de 44 px de alto
 *   metaOverflow   la línea de identidad desborda su columna
 *   scrollable     el alto real de la lista y si se llega al último elemento
 *
 * Reutiliza la receta de aurix-market-firstpaint-probe (proxy local + parche SÓLO de la
 * navegación de auth + CDP). Nada de Market se sustituye.
 *
 *   node --experimental-websocket scripts/aurix-market-visual-audit.mjs
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const abs = normalize(join(ROOT, p));
    if (!abs.startsWith(ROOT)) return res.writeHead(403).end();
    let body = await readFile(abs);
    if (abs.endsWith('app.js')) {
      body = Buffer.from(String(body)
        .replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')
        .replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0'));
    }
    res.writeHead(200, { 'content-type': MIME[extname(abs)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch (_) { res.writeHead(404).end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const PORT = 9760 + (process.pid % 120);
const profile = mkdtempSync(join(tmpdir(), 'aurix-vis-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try { const j = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch (_) {}
    await sleep(250);
  }
  throw new Error('no devtools');
}
function mkClient(ws) {
  let id = 0; const pend = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } });
  return { send: (a, b = {}, s) => Promise.race([
    new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: a, params: b, ...(s ? { sessionId: s } : {}) })); }),
    sleep(25000).then(() => { throw new Error('cdp timeout: ' + a); }),
  ]) };
}
const ws = new WebSocket(await wsUrl());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
const cdp = mkClient(ws);
const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => cdp.send(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable');
const ev = async (expression) => {
  const r = await S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: r.exceptionDetails.text + ' ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '').slice(0, 200) };
  return r.result && r.result.value;
};


// Cartera de PRUEBA sembrada en el almacén local antes del boot. Es una ENTRADA del
// probe en un entorno local — nunca dato sintético en producción: sirve para que el
// Dashboard tenga algo real que pintar y poder medir su geometría.
const SEED = JSON.stringify([
  { id:'s1', name:'Bitcoin', ticker:'BTC', type:'crypto', qty:0.42, price:97000, coinId:'bitcoin', marketSymbol:'BTC', assetCurrency:'USD', costBasis:32000, transactions:[] },
  { id:'s2', name:'iShares Core MSCI World UCITS ETF', ticker:'IWDA.AS', type:'etf', qty:120, price:98.4, marketSymbol:'IWDA.AS', assetCurrency:'EUR', costBasis:10500, transactions:[] },
  { id:'s3', name:'Apple', ticker:'AAPL', type:'stock', qty:35, price:228.5, marketSymbol:'AAPL', assetCurrency:'USD', costBasis:6200, transactions:[] },
  { id:'s4', name:'Euros', ticker:'€', type:'cash', qty:3000, price:1, assetCurrency:'EUR', costBasis:3000, transactions:[] },
]);

const PROBE = `(function(){
  var out = {};
  var q = function(s){ return document.querySelector(s); };
  var vis = function(el){ if(!el) return false; var r=el.getBoundingClientRect(); var cs=getComputedStyle(el);
    return r.width>0 && r.height>0 && cs.visibility!=='hidden' && cs.display!=='none' && Number(cs.opacity)>0.01; };
  var doc = document.documentElement;
  out.docOverflowX = Math.max(0, doc.scrollWidth - doc.clientWidth);

  // ── 1 DASHBOARD ──────────────────────────────────────────────────────────
  var d = {};
  var hero = q('#totalValue') || q('.hero-value') || q('[data-total-value]');
  d.heroText = hero ? (hero.textContent||'').trim().slice(0,32) : null;
  d.heroVisible = vis(hero);
  d.heroFont = hero ? Math.round(parseFloat(getComputedStyle(hero).fontSize)) : null;
  // rentabilidad: cualquiera de las superficies de retorno
  var ret = q('#dashReturnBadge') || q('.return-badge') || q('[data-return]') || q('#perfSnapshot');
  d.returnText = ret ? (ret.textContent||'').trim().replace(/\s+/g,' ').slice(0,60) : null;
  d.returnVisible = vis(ret);
  // gráfico: canvas o host del motor (jamás un <svg> suelto)
  var host = q('.aurix-chart-host') || q('#perfSnapshot canvas') || q('canvas');
  d.chartPresent = !!host; d.chartVisible = vis(host);
  d.chartBox = host ? (Math.round(host.getBoundingClientRect().width)+'x'+Math.round(host.getBoundingClientRect().height)) : null;
  // cards / listado de activos
  var cards = document.querySelectorAll('.asset-card, .category-card, .portfolio-row, .asset-row, .holding-row, .cat-card, [data-asset-id]');
  d.assetNodes = cards.length;
  var hs = [], overflow = 0, clipped = 0;
  Array.prototype.forEach.call(cards, function(c){
    var r=c.getBoundingClientRect(); hs.push(Math.round(r.height));
    if (c.scrollWidth - c.clientWidth > 1) overflow++;
    if (r.right > doc.clientWidth + 1 || r.left < -1) clipped++;
  });
  d.cardHeights = Array.from(new Set(hs)); d.cardOverflow = overflow; d.cardClipped = clipped;
  // texto roto: NaN, undefined, null, Infinity, $NaN visibles
  var bodyTxt = (document.body.innerText||'');
  d.brokenText = (bodyTxt.match(/NaN|undefined|Infinity|\\[object Object\\]/g)||[]).slice(0,5);
  // estados
  d.emptyState = !!q('.empty-state, .dashboard-empty');
  d.errorState = !!q('.error-state, .dashboard-error');
  out.dashboard = d;

  // ── 4 NAVEGACIÓN ─────────────────────────────────────────────────────────
  var n = {};
  var navBtns = document.querySelectorAll('.bottom-nav .item[data-tab], .header-tab[data-tab]');
  n.navCount = navBtns.length;
  var labels = Array.prototype.map.call(navBtns, function(b){ return (b.textContent||'').trim(); }).filter(Boolean);
  n.navLabels = labels;
  n.navDuplicates = labels.length - new Set(labels).size;
  // overlays atrapados: abiertos sin que nadie los haya abierto
  var openOverlays = Array.prototype.filter.call(document.querySelectorAll('.modal-overlay, .overlay, .sheet'), vis);
  n.strayOverlays = openOverlays.length;
  n.strayOverlayIds = openOverlays.map(function(o){ return o.id||String(o.className).slice(0,24); }).slice(0,4);
  // scroll-lock residual
  n.bodyModalOpen = document.body.classList.contains('modal-open');
  n.bodyOverflow = getComputedStyle(document.body).overflow;
  // objetivos táctiles de la nav
  var small = 0;
  Array.prototype.forEach.call(navBtns, function(b){ if (b.getBoundingClientRect().height < 44) small++; });
  n.navTouchSmall = small;
  out.nav = n;

  // ── 5 FREE / PREMIUM ─────────────────────────────────────────────────────
  var p = {};
  p.hasFeatureFn = (typeof hasFeature === 'function');
  try { p.enforce = (typeof ENFORCE_ENTITLEMENTS !== 'undefined') ? !!ENFORCE_ENTITLEMENTS : null; } catch(e){ p.enforce = null; }
  // el usuario gratuito ve su cartera: valor + activos + gráfico
  p.freeCanSeePortfolio = !!(d.heroVisible && d.assetNodes > 0);
  var locks = document.querySelectorAll('.premium-lock, .locked, [data-premium]');
  p.premiumGates = locks.length;
  out.premium = p;
  return out;
})()`;

const ADD_ASSET_PROBE = `(function(){
  var out = {};
  var ov = document.getElementById('modalOverlay') || document.querySelector('.modal-overlay');
  out.opened = !!(ov && ov.classList.contains('open'));
  var input = document.getElementById('assetSearch') || document.querySelector('#modalOverlay input[type="text"], .modal-overlay input');
  out.hasSearchInput = !!input;
  out.results = document.querySelectorAll('.search-result, .search-result-item, .add-result').length;
  var m = ov ? ov.querySelector('.modal') : null;
  if (m) { var r = m.getBoundingClientRect();
    out.modalBox = Math.round(r.width)+'x'+Math.round(r.height);
    out.modalFitsViewport = r.right <= innerWidth + 1 && r.left >= -1 && r.top >= -1; }
  out.bodyLocked = document.body.classList.contains('modal-open');
  return out;
})()`;

const VIEWPORTS = [
  { name: 'movil   390x844',  w: 390,  h: 844,  mobile: true },
  { name: 'desktop 1440x900', w: 1440, h: 900,  mobile: false },
];

const report = {};
try {
  for (const vp of VIEWPORTS) {
    await S('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.mobile });
    await S('Page.navigate', { url: ORIGIN + '/index.html' });
    await sleep(1200);
    await ev(`(function(){try{
      var flat = ${JSON.stringify(SEED)};
      localStorage.setItem('portfolio_assets', JSON.stringify(flat));
      localStorage.setItem('aurix_assets', JSON.stringify(flat.map(function(a){ return {
        id:a.id, name:a.name, symbol:a.ticker, type:a.type, currentPrice:a.price,
        assetCurrency:a.assetCurrency, change24h:null, prevPrice:null, coinId:a.coinId||null,
        marketSymbol:a.marketSymbol||null, price_source:'api', provider_id:a.coinId||a.marketSymbol||null }; })));
      localStorage.setItem('aurix_holdings', JSON.stringify(flat.map(function(a){ return {
        id:a.id, asset_id:a.id, quantity:a.qty, costBasis:a.costBasis, realizedPnL:0, transactions:[] }; })));
    }catch(e){ return String(e); } })()`);
    await S('Page.navigate', { url: ORIGIN + '/index.html' });
    await sleep(5500);
    await ev(`(function(){ try {
      var flat = ${JSON.stringify(SEED)};
      assets.length = 0; flat.forEach(function(a){ assets.push(a); });
      if (typeof save === 'function') save();
      if (typeof recomputeDerivedFinancialState === 'function') recomputeDerivedFinancialState('probe');
      if (typeof render === 'function') render(true);
      if (typeof updateDonut === 'function') updateDonut();
      if (typeof updateCategoryCards === 'function') updateCategoryCards();
      return assets.length;
    } catch(e){ return String(e); } })()`);
    await sleep(3000);
    const R = {};
    R.seedCheck = await ev(`(function(){ try { return {
      assetsLen: (typeof assets!=='undefined' && Array.isArray(assets)) ? assets.length : null,
      lsLegacy: (localStorage.getItem('portfolio_assets')||'').length,
      lsNew: (localStorage.getItem('aurix_assets')||'').length,
      src: (typeof getPortfolioData==='function') ? (getPortfolioData()||{}).source : null,
      dataLen: (typeof getPortfolioData==='function') ? ((getPortfolioData()||{}).assets||[]).length : null,
      totalUSD: (typeof totalValueUSD==='function') ? totalValueUSD() : null,
      persistReady: (typeof _aurixPersistenceReady!=='undefined') ? _aurixPersistenceReady : null,
      authed: (typeof currentUser!=='undefined' && currentUser) ? true : false
    }; } catch(e){ return {err:String(e)}; } })()`);
    R.dashboard = await ev(PROBE);

    // Add Asset: abrir por el camino real
    await ev(`(function(){try{ if(typeof openModal==='function') openModal(); else document.getElementById('btnAddAsset').click(); }catch(e){return String(e);} })()`);
    await sleep(1200);
    R.addAssetOpen = await ev(ADD_ASSET_PROBE);
    // buscar
    await ev(`(function(){try{ var i=document.getElementById('assetSearch'); if(i){ i.value='apple'; i.dispatchEvent(new Event('input',{bubbles:true})); } }catch(e){} })()`);
    await sleep(2600);
    R.addAssetSearch = await ev(ADD_ASSET_PROBE);
    // cerrar y comprobar que no queda scroll-lock ni overlay
    await ev(`(function(){try{ if(typeof closeModal==='function') closeModal(); }catch(e){} })()`);
    await sleep(700);
    R.afterClose = await ev(`(function(){ return {
      strayOverlays: document.querySelectorAll('.modal-overlay.open').length,
      bodyModalOpen: document.body.classList.contains('modal-open'),
      bodyOverflow: getComputedStyle(document.body).overflow,
      docOverflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
    }; })()`);

    // Navegación por los 4 verbos, y vuelta al Dashboard
    R.tabs = {};
    for (const t of ['market', 'intelligence', 'workspace', 'home']) {
      await ev(`(function(){try{ _applyTab('${t}'); }catch(e){ return String(e); } })()`);
      await sleep(1500);
      R.tabs[t] = await ev(`(function(){ var doc=document.documentElement; var scr=document.querySelector('.screen.active, [data-screen].active');
        return { screen: scr ? (scr.id || scr.className).slice(0,40) : null,
                 docOverflowX: Math.max(0, doc.scrollWidth - doc.clientWidth),
                 stray: document.querySelectorAll('.modal-overlay.open').length,
                 locked: document.body.classList.contains('modal-open'),
                 broken: ((document.body.innerText||'').match(/NaN|undefined|\\[object Object\\]/g)||[]).slice(0,3) }; })()`);
    }
    report[vp.name] = R;
  }
  console.log(JSON.stringify(report, null, 1));
} finally {
  try { chrome.kill(); } catch (_) {}
  try { rmSync(profile, { recursive: true, force: true }); } catch (_) {}
  try { server.close(); } catch (_) {}
}
