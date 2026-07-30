#!/usr/bin/env node
/**
 * AURIX MARKET · FIRST-PAINT A/B COMPARE
 *
 * Answers one question with evidence: did the recent Market work make the first paint WORSE,
 * or did the "empty mini-charts" predate it? Runs the identical scenario set against two
 * builds (a git revision vs the working tree) in the same browser, same network, same session
 * ordering, and prints them side by side.
 *
 * Page stays on the PRODUCTION origin (the price API's CORS allow-list only answers that
 * origin — from localhost every history fetch returns an EMPTY series and every mini-chart
 * would look broken in BOTH builds). app.js + styles.css are swapped via CDP Fetch.
 *
 *   node --experimental-websocket scripts/aurix-market-firstpaint-compare.mjs --a=/tmp/rev637 --b=.
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
const arg = n => (process.argv.find(a => a.startsWith('--' + n + '=')) || '').split('=')[1];
const DIR_A = arg('a') || '/tmp/rev637';
const DIR_B = arg('b') || ROOT;
const LBL_A = arg('la') || 'ANTES';
const LBL_B = arg('lb') || 'AHORA';
const ORIGIN = 'https://app.aurixsystem.io';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const abs = d => (isAbsolute(d) ? d : normalize(join(ROOT, d)));

async function bundle(dir) {
  const js = (await readFile(join(abs(dir), 'app.js'), 'utf8'))
    .replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')
    .replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0');
  const css = await readFile(join(abs(dir), 'styles.css'), 'utf8');
  return { js: Buffer.from(js, 'utf8').toString('base64'), css: Buffer.from(css, 'utf8').toString('base64') };
}

const PORT = 9950 + (process.pid % 45);
const profile = mkdtempSync(join(tmpdir(), 'aurix-ab-'));
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

// Un mini gráfico REAL es `.aurix-chart-host` / <canvas> (LightweightCharts). Nunca un <svg>.
const SAMPLE = `(function(){var l=document.getElementById('marketList');if(!l)return{rows:0};
var rs=l.querySelectorAll('.market-row');var chart=0,skel=0,none=0,blank=0,pctOk=0,pctSkel=0,pctDash=0;
rs.forEach(function(r){
  var c=r.querySelector('.col-chart');
  if(c){ if(c.querySelector('.aurix-chart-host')||c.querySelector('canvas'))chart++;
         else if(c.classList.contains('is-loading'))skel++;
         else if(c.classList.contains('col-chart--none'))none++; else blank++; }
  var ch=r.querySelector('.col-change');
  if(ch){ if(ch.classList.contains('is-loading'))pctSkel++;
          else if(/%/.test(ch.textContent))pctOk++; else pctDash++; }
});
return{rows:rs.length,chart:chart,skel:skel,none:none,blank:blank,pctOk:pctOk,pctSkel:pctSkel,pctDash:pctDash};})()`;

async function runBuild(label, dir) {
  const B = await bundle(dir);
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);
  await S('Page.enable'); await S('Runtime.enable'); await S('Network.enable');
  await S('Fetch.enable', { patterns: [{ urlPattern: '*app.js*', requestStage: 'Request' }, { urlPattern: '*styles.css*', requestStage: 'Request' }] });
  const h = async m => {
    if (m.method !== 'Fetch.requestPaused' || m.sessionId !== sessionId) return;
    const isCss = /styles\.css/.test(m.params.request.url);
    try {
      await S('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'content-type', value: isCss ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8' }],
        body: isCss ? B.css : B.js });
    } catch (_) {}
  };
  hs.push(h);
  await S('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  const ev = async x => {
    const r = await S('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result && r.result.value;
  };
  // Almacén de snapshots limpio: comparamos el comportamiento del RENDER, no la persistencia.
  await S('Page.navigate', { url: ORIGIN + '/index.html' });
  for (let i = 0; i < 60; i++) { const o = await ev(`typeof renderMarket==='function'`).catch(() => false); if (o) break; await sleep(1000); }
  await ev(`(function(){try{localStorage.removeItem('aurix.market.snapshots.v1');}catch(_){}})()`).catch(() => {});
  await sleep(2000);

  const drain = async () => { for (let i = 0; i < 90; i++) { const b = await ev(`(function(){try{return _marketHistoryQueue.pending.length+_marketHistoryQueue.running;}catch(_){return 0;}})()`).catch(() => 0); if (!b && i > 3) return; await sleep(500); } };
  const out = {};
  const scen = async (name, prep) => {
    if (prep) await ev(prep);
    await ev(`(function(){try{_applyTab('market');}catch(e){try{renderMarket();}catch(_){}}})()`);
    await sleep(250);                       // primer paint
    out[name + '@first'] = await ev(SAMPLE);
    await drain(); await sleep(1500);
    out[name + '@settled'] = await ev(SAMPLE);
  };

  await scen('1-entrada-fria', `(function(){try{currentMarketTab='all';}catch(_){}})()`);
  await scen('2-vuelta-dashboard', `(function(){try{_applyTab('home');}catch(_){}})()`);
  await scen('3-cripto', `(function(){try{currentMarketTab='crypto';}catch(_){}})()`);
  await scen('4-seguimiento', `(function(){try{currentMarketTab='watchlist';}catch(_){}})()`);
  await scen('5-todo', `(function(){try{currentMarketTab='all';}catch(_){}})()`);
  await send('Target.closeTarget', { targetId });
  return out;
}

const fmt = s => s ? `filas=${String(s.rows).padStart(3)} graf=${String(s.chart).padStart(3)} skel=${String(s.skel).padStart(3)} vacio=${String(s.none).padStart(3)} blank=${String(s.blank).padStart(2)} | %ok=${String(s.pctOk).padStart(3)} %skel=${String(s.pctSkel).padStart(2)} %—=${String(s.pctDash).padStart(3)}` : '(n/a)';

try {
  console.log(`\n════ A/B FIRST PAINT · ${LBL_A} (${DIR_A})  vs  ${LBL_B} (${DIR_B}) ════`);
  const A = await runBuild(LBL_A, DIR_A);
  const B = await runBuild(LBL_B, DIR_B);
  const keys = Object.keys(A);
  for (const k of keys) {
    console.log(`\n── ${k}`);
    console.log(`   ${LBL_A.padEnd(6)} ${fmt(A[k])}`);
    console.log(`   ${LBL_B.padEnd(6)} ${fmt(B[k])}`);
    const a = A[k], b = B[k];
    if (a && b && a.rows && b.rows) {
      const d = b.chart - a.chart, ds = b.skel - a.skel, dn = b.none - a.none;
      const verdict = (d < -1) ? 'REGRESIÓN (menos gráficos)' : (ds > 1 ? 'REGRESIÓN (más esqueletos)' : 'sin regresión');
      console.log(`   Δ graf=${d >= 0 ? '+' : ''}${d}  Δ skel=${ds >= 0 ? '+' : ''}${ds}  Δ vacio=${dn >= 0 ? '+' : ''}${dn}   ⇒ ${verdict}`);
    }
  }
  console.log('\nJSON ' + JSON.stringify({ A, B }));
} catch (e) {
  console.log('COMPARE ERROR: ' + (e && e.message));
  process.exitCode = 1;
} finally {
  try { chrome.kill('SIGKILL'); } catch (_) {}
  try { rmSync(profile, { recursive: true, force: true }); } catch (_) {}
}
