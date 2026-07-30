#!/usr/bin/env node
/**
 * AURIX · MARKET CRYPTO PREVIEW PROBE (SPEC MARKET-CRYPTO-PREVIEW-P0)
 *
 * Responde a la única pregunta del SPEC: al entrar en Cripto, ¿TODAS las filas visibles tienen
 * mini gráfico desde el primer paint? No razona sobre el código: clasifica cada celda del DOM
 * vivo en uno de cinco estados y cuenta los que el SPEC prohíbe.
 *
 *   real     .aurix-chart-host / <canvas>  → histórico real montado por el motor
 *   preview  .mkt-spark-preview            → provisional (final legítimo)
 *   skeleton .col-chart.is-loading         → PROHIBIDO
 *   none     .col-chart--none              → PROHIBIDO (era el hueco reportado)
 *   empty    celda sin nada dentro         → PROHIBIDO
 *
 * Corre sobre el ORIGEN DE PRODUCCIÓN con app.js/styles.css servidos por CDP: la allow-list CORS
 * de la price API sólo responde ahí, así que un proxy local mediría un Market sin datos reales
 * (gotcha de MARKET-SNAPSHOT-PERSIST-P1). `--remote` mide los assets YA DESPLEGADOS.
 *
 * Muestrea en dos instantes, que son las dos mitades del criterio de éxito:
 *   firstPaint  primer sample en que existen filas   → aquí no puede haber ni un hueco
 *   settled     tras el cierre de 7 s + margen       → aquí se ve cuánto histórico real llegó
 *
 *   node --experimental-websocket scripts/aurix-market-crypto-preview-probe.mjs [--remote] [--device=iPhone]
 */
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
const REMOTE = process.argv.includes('--remote');
const SHOT = process.argv.includes('--shot');
const ONLY = (process.argv.find(a => a.startsWith('--device=')) || '').split('=')[1] || null;
const ORIGIN = 'https://app.aurixsystem.io';
const APPJS_V = '611', CSS_V = '645';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Los ocho que el SPEC obliga a validar. Bitcoin y Ethereum eran los únicos que ya pintaban.
const REQUIRED = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'USDC', 'USDT', 'ADA'];

const PORT = 9700 + (process.pid % 90);
const profile = mkdtempSync(join(tmpdir(), 'aurix-mktprev-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });

async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try { const j = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch (_) {}
    await sleep(250);
  }
  throw new Error('no devtools');
}
let id = 0; const pend = new Map(); const hs = [];
const ws = new WebSocket(await wsUrl());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  else if (m.method) hs.forEach(h => h(m));
});
const send = (a, b = {}, s) => Promise.race([
  new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: a, params: b, ...(s ? { sessionId: s } : {}) })); }),
  sleep(30000).then(() => { throw new Error('cdp timeout ' + a); }),
]);

const src = REMOTE ? await (await fetch(`${ORIGIN}/app.js?v=${APPJS_V}`)).text() : await readFile(join(ROOT, 'app.js'), 'utf8');
// Se parchea SÓLO la navegación de auth (receta de ACCOUNT-CENTER-I18N). Market, la caché de
// histórico y el pintor de la fila quedan intactos: esto tiene que medir el camino real.
const APPJS_B64 = Buffer.from(src
  .replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')
  .replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0'), 'utf8').toString('base64');
// styles.css se intercepta TAMBIÉN: el estado de la celda es en parte visual (`.col-chart--preview`)
// y sin esto la sonda mediría la hoja anterior (gotcha de GOLD-ADD-UX-POLISH-V1).
const CSS_B64 = Buffer.from(
  REMOTE ? await (await fetch(`${ORIGIN}/styles.css?v=${CSS_V}`)).text() : await readFile(join(ROOT, 'styles.css'), 'utf8'),
  'utf8').toString('base64');

const DEVICES = {
  iPhone:  { w: 390,  h: 844,  dsf: 3,   mobile: true,  ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  Android: { w: 412,  h: 915,  dsf: 2.6, mobile: true,  ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36' },
  Tablet:  { w: 834,  h: 1112, dsf: 2,   mobile: true,  ua: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  Desktop: { w: 1280, h: 900,  dsf: 1,   mobile: false, ua: null },
};

// Clasificador de celdas. `visible` distingue "la celda no pinta" de "el CSS la oculta en este
// breakpoint": una celda oculta no es un hueco para el usuario y no puede contar como fallo.
const SAMPLER = `(function(){
  var list=document.getElementById('marketList'); if(!list) return null;
  var rows=list.querySelectorAll('.market-row[data-symbol]');
  if(!rows.length) return {rows:0};
  var out={rows:rows.length, real:0, preview:0, skeleton:0, none:0, empty:0, hiddenCells:0, bySym:{}};
  Array.prototype.forEach.call(rows,function(r){
    var sym=r.getAttribute('data-symbol')||'?';
    var cc=r.querySelector('.col-chart');
    if(!cc){ out.empty++; out.bySym[sym]='no-cell'; return; }
    var cs=getComputedStyle(cc), rect=cc.getBoundingClientRect();
    var visible = cs.display!=='none' && cs.visibility!=='hidden' && rect.width>0 && rect.height>0;
    var state;
    if(cc.querySelector('.aurix-chart-host')||cc.querySelector('canvas')) state='real';
    else if(cc.querySelector('.mkt-spark-preview')) state='preview';
    else if(cc.classList.contains('is-loading')) state='skeleton';
    else if(cc.classList.contains('col-chart--none')) state='none';
    else state='empty';
    out[state]++; if(!visible) out.hiddenCells++;
    out.bySym[sym]={state:state, visible:visible, w:Math.round(rect.width), h:Math.round(rect.height),
      price:(r.querySelector('.col-price')||{}).textContent||'',
      chg:(r.querySelector('.col-change')||{}).textContent||''};
  });
  return out;
})()`;

const DEV_ENTRIES = Object.entries(DEVICES).filter(([n]) => !ONLY || n === ONLY);
const RESULTS = [];

try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);
  const ev = async (expression) => {
    const r = await S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result && r.result.value;
  };
  await S('Page.enable'); await S('Runtime.enable');
  await S('Fetch.enable', { patterns: [{ urlPattern: '*app.js*', requestStage: 'Request' }, { urlPattern: '*styles.css*', requestStage: 'Request' }] });
  hs.push(async m => {
    if (m.method !== 'Fetch.requestPaused' || m.sessionId !== sessionId) return;
    const isCss = /styles\.css/.test(m.params.request.url);
    try {
      await S('Fetch.fulfillRequest', {
        requestId: m.params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'content-type', value: isCss ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8' },
                          { name: 'cache-control', value: 'no-store' }],
        body: isCss ? CSS_B64 : APPJS_B64,
      });
    } catch (_) { try { await S('Fetch.continueRequest', { requestId: m.params.requestId }); } catch (_e) {} }
  });

  for (const [name, D] of DEV_ENTRIES) {
    await S('Emulation.setDeviceMetricsOverride', { width: D.w, height: D.h, deviceScaleFactor: D.dsf, mobile: D.mobile });
    if (D.ua) await S('Emulation.setUserAgentOverride', { userAgent: D.ua });
    await S('Page.navigate', { url: ORIGIN + '/index.html' });
    let booted = false;
    for (let i = 0; i < 90; i++) { if (await ev(`typeof _applyTab==='function' && typeof renderMarket==='function'`).catch(() => false)) { booted = true; break; } await sleep(1000); }
    if (!booted) { console.log(`  ${name}: BOOT FAIL`); RESULTS.push({ device: name, error: 'boot' }); continue; }
    await sleep(2500);

    // Cripto directamente: es la pestaña del SPEC. `watchlist` (la de por defecto) va vacía sin sesión.
    await ev(`(function(){try{currentMarketTab='crypto';}catch(_){} try{_applyTab('market');}catch(_){}})()`);

    // FIRST PAINT: el primer sample en el que ya existen filas. Aquí se juega el criterio.
    let first = null;
    const dl = Date.now() + 45000;
    while (Date.now() < dl) {
      const s = await ev(SAMPLER).catch(() => null);
      if (s && s.rows) { first = s; break; }
      await sleep(60);
    }
    if (!first) { console.log(`  ${name}: Market nunca pobló`); RESULTS.push({ device: name, error: 'no-rows' }); continue; }

    // SETTLED: tras el cierre acotado de 7 s + margen para que llegue el histórico real.
    await sleep(11000);
    const settled = await ev(SAMPLER).catch(() => null);

    const holes = s => (s.skeleton || 0) + (s.none || 0) + (s.empty || 0);
    const missing = REQUIRED.filter(sym => !settled || !settled.bySym[sym]);
    const bad = REQUIRED.filter(sym => {
      const a = first.bySym[sym], b = settled && settled.bySym[sym];
      const okState = x => x && x.state !== 'skeleton' && x.state !== 'none' && x.state !== 'empty';
      return (a && !okState(a)) || (b && !okState(b));
    });
    const pass = holes(first) === 0 && settled && holes(settled) === 0 && !missing.length && !bad.length;

    console.log(`\n  ── ${name} (${D.w}×${D.h}) ──  ${pass ? 'PASS ✓' : 'FAIL ✗'}`);
    console.log(`     firstPaint  rows=${first.rows}  real=${first.real} preview=${first.preview}  │ skeleton=${first.skeleton} none=${first.none} empty=${first.empty}  (celdas ocultas por CSS: ${first.hiddenCells})`);
    if (settled) console.log(`     settled     rows=${settled.rows}  real=${settled.real} preview=${settled.preview}  │ skeleton=${settled.skeleton} none=${settled.none} empty=${settled.empty}`);
    console.log('     los 8 obligatorios:');
    REQUIRED.forEach(sym => {
      const a = first.bySym[sym], b = settled && settled.bySym[sym];
      const f = x => x ? `${x.state}${x.visible === false ? '(oculta)' : ''}` : 'AUSENTE';
      console.log(`       ${sym.padEnd(5)} firstPaint=${f(a).padEnd(18)} settled=${f(b).padEnd(18)} ${b && b.price ? 'precio=' + String(b.price).trim() + '  var=' + String(b.chg).trim() : ''}`);
    });
    // Capturas para la validación VISUAL del founder: el criterio del SPEC es lo que se ve.
    // La del PRIMER PAINT no se puede tomar durante el arranque (el splash tapa la lista), así
    // que se reproduce el estado exacto: caché de histórico vacía + re-render de Cripto, y se
    // dispara ANTES de que vuelva ningún histórico real. Eso es literalmente lo que ve alguien
    // que entra en Cripto por primera vez.
    if (SHOT) {
      try {
        const png = await S('Page.captureScreenshot', { format: 'png' });
        await writeFile(join(ROOT, `mkt-crypto-${name.toLowerCase()}-settled.png`), Buffer.from(png.data, 'base64'));
        await ev(`(function(){try{_marketHistoryCache.clear();}catch(_){}
          try{currentMarketTab='crypto'; document.getElementById('marketList')._lastKey=null; renderCurrentMarketView();}catch(_){}})()`);
        // Se MIDE, no sólo se fotografía: este re-render destruye los controladores cuya serie ya
        // no está en caché, y ahí es donde apareció un hueco que el sample normal no veía.
        const cold = await ev(SAMPLER);
        const png2 = await S('Page.captureScreenshot', { format: 'png' });
        await writeFile(join(ROOT, `mkt-crypto-${name.toLowerCase()}-firstpaint.png`), Buffer.from(png2.data, 'base64'));
        const coldHoles = (cold.skeleton || 0) + (cold.none || 0) + (cold.empty || 0);
        console.log(`     capturas → …-settled.png · …-firstpaint.png`);
        console.log(`     coldRender  rows=${cold.rows}  real=${cold.real} preview=${cold.preview}  │ skeleton=${cold.skeleton} none=${cold.none} empty=${cold.empty}  ${coldHoles ? '✗ HUECOS' : '✓'}`);
        if (coldHoles) { RESULTS.push({ device: name + '/cold', pass: false, first: cold, settled: cold, bad: ['cold:' + coldHoles] }); }
      } catch (e) { console.log('     captura falló: ' + e.message); }
    }
    if (missing.length) console.log(`     ⚠ no presentes en la pestaña: ${missing.join(', ')}`);
    if (bad.length) console.log(`     ✗ con hueco: ${bad.join(', ')}`);
    RESULTS.push({ device: name, pass, first, settled, missing, bad });
  }

  const failed = RESULTS.filter(r => !r.pass);
  console.log(`\n════ RESULT: ${failed.length ? 'FAIL ✗' : 'PASS ✓'}  (${RESULTS.length - failed.length}/${RESULTS.length} dispositivos)`);
  console.log('JSON ' + JSON.stringify({ remote: REMOTE, appjs: APPJS_V, css: CSS_V, results: RESULTS.map(r => ({ device: r.device, pass: r.pass, error: r.error, first: r.first && { rows: r.first.rows, real: r.first.real, preview: r.first.preview, skeleton: r.first.skeleton, none: r.first.none, empty: r.first.empty }, settled: r.settled && { real: r.settled.real, preview: r.settled.preview, skeleton: r.settled.skeleton, none: r.settled.none, empty: r.settled.empty }, bad: r.bad })) }));
  if (failed.length) process.exitCode = 1;
} catch (e) {
  console.log('PROBE ERROR: ' + (e && e.message));
  process.exitCode = 1;
} finally {
  try { chrome.kill('SIGKILL'); } catch (_) {}
  try { rmSync(profile, { recursive: true, force: true }); } catch (_) {}
}
