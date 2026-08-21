#!/usr/bin/env node
/**
 * AURIX MARKET · VISUAL GEOMETRY AUDIT (SPEC MARKET UI/UX INSTITUTIONAL POLISH · Fase 0)
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

const MEASURE = `(function(){
  var out = { ua: innerWidth };
  var list = document.getElementById('marketList');
  if (!list) return { error: 'no marketList' };
  var rows = Array.prototype.slice.call(list.querySelectorAll('.market-row'));
  out.rows = rows.length;
  if (!rows.length) return out;
  var doc = document.documentElement;
  out.docOverflowX = Math.max(0, doc.scrollWidth - doc.clientWidth);
  out.listOverflowX = Math.max(0, list.scrollWidth - list.clientWidth);
  var uniq = function(a){ return Array.from(new Set(a.map(function(v){return Math.round(v);}))); };
  var heights = [], priceL = [], changeR = [], chartW = [], chartH = [], small = 0;
  var ellipsisMissing = [], metaOverflow = [], rowOverflow = 0, titleClipped = 0;
  rows.forEach(function(r){
    var rb = r.getBoundingClientRect();
    heights.push(rb.height);
    if (rb.height < 44) small++;
    if (r.scrollWidth - r.clientWidth > 1) rowOverflow++;
    var p = r.querySelector('.col-price'), c = r.querySelector('.col-change'), ch = r.querySelector('.col-chart');
    if (p) priceL.push(p.getBoundingClientRect().left);
    if (c) changeR.push(c.getBoundingClientRect().right);
    if (ch) { var cb = ch.getBoundingClientRect(); chartW.push(cb.width); chartH.push(cb.height); }
    var t = r.querySelector('.mkt-id-title') || r.querySelector('.market-name') || r.querySelector('.col-asset');
    if (t && t.scrollWidth - t.clientWidth > 1) {
      titleClipped++;
      var cs = getComputedStyle(t);
      if (cs.textOverflow !== 'ellipsis' && cs.overflow !== 'hidden') ellipsisMissing.push((t.textContent||'').slice(0,28));
    }
    var m = r.querySelector('.mkt-id-meta');
    if (m && m.scrollWidth - m.clientWidth > 1) {
      var mcs = getComputedStyle(m);
      if (mcs.textOverflow !== 'ellipsis' && mcs.overflow !== 'hidden') metaOverflow.push((m.textContent||'').slice(0,28));
    }
  });
  var spread = function(a){ if(!a.length) return 0; return Math.round(Math.max.apply(null,a) - Math.min.apply(null,a)); };
  out.rowHeights     = uniq(heights);
  out.rowOverflow    = rowOverflow;
  out.priceLeftVar   = spread(priceL);
  out.changeRightVar = spread(changeR);
  out.chartWVar      = spread(chartW);
  out.chartHVar      = spread(chartH);
  out.chartBox       = chartW.length ? Math.round(chartW[0]) + 'x' + Math.round(chartH[0]) : '-';
  out.touchSmall     = small;
  out.titleClipped   = titleClipped;
  out.ellipsisMissing= ellipsisMissing;
  out.metaOverflow   = metaOverflow;
  // Scroll vertical: ¿se alcanza el último elemento?
  var sc = list.closest('.market-section') || list;
  out.scrollHost   = sc === list ? 'list' : 'section';
  out.scrollHeight = Math.round(sc.scrollHeight);
  out.clientHeight = Math.round(sc.clientHeight);
  sc.scrollTop = sc.scrollHeight;
  out.reachedBottom = Math.abs(sc.scrollTop + sc.clientHeight - sc.scrollHeight) < 4 || sc.scrollHeight <= sc.clientHeight;
  sc.scrollTop = 0;
  // Precio/variación legibles
  var p0 = rows[0].querySelector('.col-price'), c0 = rows[0].querySelector('.col-change');
  out.priceFont  = p0 ? Math.round(parseFloat(getComputedStyle(p0).fontSize)*10)/10 : null;
  out.changeFont = c0 ? Math.round(parseFloat(getComputedStyle(c0).fontSize)*10)/10 : null;
  out.longestTitle = rows.map(function(r){ var t=r.querySelector('.mkt-id-title')||r.querySelector('.col-asset'); return t?(t.textContent||'').trim():''; })
                         .sort(function(a,b){return b.length-a.length;})[0] || '';
  return out;
})()`;

const VIEWPORTS = [
  { name: 'móvil   390x844', w: 390, h: 844, mobile: true },
  { name: 'tablet  834x1112', w: 834, h: 1112, mobile: true },
  { name: 'desktop 1440x900', w: 1440, h: 900, mobile: false },
];
const TABS = ['etfs', 'indices', 'crypto', 'stocks'];

const report = {};
try {
  for (const vp of VIEWPORTS) {
    await S('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.mobile });
    await S('Page.navigate', { url: ORIGIN + '/index.html' });
    await sleep(4500);
    await ev(`(function(){try{ _applyTab('market'); }catch(e){ try{renderMarket();}catch(_){} }})()`);
    await sleep(2500);
    report[vp.name] = {};
    for (const tab of TABS) {
      // Camino REAL de cambio de pestaña: el mismo que usa el click.
      await ev(`(function(){try{ currentMarketTab='${tab}'; hydrateMarket('${tab}'); }catch(e){return String(e);} })()`);
      // 1) esperar a que el refresco de precios del universo aterrice (no medir el fallback);
      let prev = -1, stable = 0;
      for (let i = 0; i < 50; i++) {
        const n = await ev(`(function(){try{return document.querySelectorAll('#marketList .market-row').length;}catch(_){return 0;}})()`);
        if (n === prev && n > 0) { if (++stable >= 3) break; } else { stable = 0; prev = n; }
        await sleep(400);
      }
      // 2) y a que la cola de histórico se calme (misma señal que el probe de first paint).
      for (let i = 0; i < 60; i++) {
        const busy = await ev(`(function(){try{return _marketHistoryQueue.pending.length + _marketHistoryQueue.running;}catch(_){return 0;}})()`);
        if (!busy) break;
        await sleep(400);
      }
      await sleep(500);
      report[vp.name][tab] = await ev(MEASURE);
    }
  }
  console.log(JSON.stringify(report, null, 1));
} finally {
  try { chrome.kill(); } catch (_) {}
  try { rmSync(profile, { recursive: true, force: true }); } catch (_) {}
  try { server.close(); } catch (_) {}
}
