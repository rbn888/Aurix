#!/usr/bin/env node
/**
 * AURIX MARKET · SNAPSHOT PERSISTENCE E2E (SPEC MARKET-SNAPSHOT-PERSIST-P1)
 *
 * Proves the cross-session claim end to end with REAL market data.
 *
 * The page stays on the PRODUCTION origin — that is not cosmetic: the price API's CORS
 * allow-list only answers app.aurixsystem.io, so a localhost proxy silently yields EMPTY
 * history series and every mini-chart resolves to "honest empty" instead of a real chart.
 * app.js is swapped at the network layer (CDP Fetch) so the origin is preserved while the
 * local build under test is what actually runs.
 *
 * Sessions share one Chrome profile, so localStorage survives between them exactly as it
 * does when a user closes and reopens the browser.
 *
 *   node --experimental-websocket scripts/aurix-market-snapshot-e2e.mjs [--remote]
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
const REMOTE = process.argv.includes('--remote');   // usa el app.js YA desplegado
const ORIGIN = 'https://app.aurixsystem.io';
const SNAP_KEY = 'aurix.market.snapshots.v1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 9700 + (process.pid % 150);
const profile = mkdtempSync(join(tmpdir(), 'aurix-snap-e2e-'));
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

const localAppJs = REMOTE ? null : Buffer.from(
  (await readFile(join(ROOT, 'app.js'), 'utf8'))
    .replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')
    .replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0'), 'utf8').toString('base64');
const remoteAppJs = REMOTE ? Buffer.from(
  (await (await fetch(ORIGIN + '/app.js?v=606')).text())
    .replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')
    .replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0'), 'utf8').toString('base64') : null;
const APPJS_B64 = REMOTE ? remoteAppJs : localAppJs;

// El motor monta `.aurix-chart-host` con <canvas>; NO hay <svg>. Contar 'svg' daba charts=0
// siempre y hacía ilegible toda la medición.
const SAMPLER = `(function(){var l=document.getElementById('marketList');if(!l)return{rows:0};
var rs=l.querySelectorAll('.market-row');var charts=0,skel=0,none=0,blank=0;
rs.forEach(function(r){var c=r.querySelector('.col-chart');if(!c)return;
 var mounted=!!(c.querySelector('.aurix-chart-host')||c.querySelector('canvas'));
 if(mounted)charts++;else if(c.classList.contains('is-loading'))skel++;
 else if(c.classList.contains('col-chart--none'))none++;else blank++;});
return{rows:rs.length,charts:charts,skel:skel,none:none,blank:blank};})()`;

async function newSession(label) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);
  await S('Page.enable'); await S('Runtime.enable'); await S('Network.enable');
  await S('Fetch.enable', { patterns: [{ urlPattern: '*app.js*', requestStage: 'Request' }] });
  const handler = async m => {
    if (m.method !== 'Fetch.requestPaused' || m.sessionId !== sessionId) return;
    try { await S('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'application/javascript; charset=utf-8' }], body: APPJS_B64 }); } catch (_) {}
  };
  hs.push(handler);
  await S('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  const ev = async expr => {
    const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result && r.result.value;
  };
  return { S, ev, sessionId, targetId, close: async () => { try { await send('Target.closeTarget', { targetId }); } catch (_) {} } };
}

async function boot(s) {
  await s.S('Page.navigate', { url: ORIGIN + '/index.html' });
  for (let i = 0; i < 60; i++) { const o = await s.ev(`typeof renderMarket==='function'`).catch(() => false); if (o) break; await sleep(1000); }
  await sleep(2000);
}
async function drain(s) {
  for (let i = 0; i < 90; i++) {
    const b = await s.ev(`(function(){try{return _marketHistoryQueue.pending.length+_marketHistoryQueue.running;}catch(_){return 0;}})()`).catch(() => 0);
    if (!b && i > 3) return; await sleep(500);
  }
}
const R = [];
const check = (n, c, d) => { R.push({ n, c: !!c }); console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${d !== undefined ? '  → ' + d : ''}`); };

try {
  console.log(`\n════ SNAPSHOT PERSISTENCE E2E (${REMOTE ? 'bundle desplegado' : 'build local'}) ════`);

  // ── SESIÓN 1: almacenamiento limpio, carga real desde red ──────────────────
  console.log('\n── Sesión 1 · almacenamiento limpio');
  let s = await newSession('s1');
  await boot(s);
  await s.ev(`(function(){try{localStorage.removeItem('${SNAP_KEY}');}catch(_){}})()`);
  await s.ev(`(function(){try{currentMarketTab='all';}catch(_){}try{_applyTab('market');}catch(_){}})()`);
  for (let i = 0; i < 45; i++) { const n = await s.ev(`(document.querySelectorAll('#marketList .market-row')||[]).length`).catch(() => 0); if (n > 0) break; await sleep(1000); }
  await drain(s);
  await sleep(2000);
  const s1 = await s.ev(SAMPLER);
  const store1 = await s.ev(`(function(){try{var raw=localStorage.getItem('${SNAP_KEY}');if(!raw)return null;var p=JSON.parse(raw);
    return JSON.stringify({bytes:raw.length,entries:p.entries.length,schema:p.schemaVersion,
      sample:p.entries.slice(0,1).map(function(r){return {id:r.identityKey,pts:r.series.length,asOf:r.asOf,savedAt:r.savedAt,src:r.source,syn:r.isSynthetic};})});}catch(e){return 'ERR '+e.message;}})()`);
  console.log(`  filas=${s1.rows} charts=${s1.charts} skel=${s1.skel} none=${s1.none} blank=${s1.blank}`);
  console.log(`  almacén: ${store1}`);
  const st1 = store1 ? JSON.parse(store1) : null;
  check('sesión 1 obtiene mini gráficos reales de la red', s1.charts > 0, `charts=${s1.charts}`);
  check('sesión 1 persiste snapshots', !!st1 && st1.entries > 0, st1 && st1.entries);
  check('el almacén respeta el máximo de 40', !!st1 && st1.entries <= 40, st1 && st1.entries);
  // En la sesión 1 el dato ACABA de descargarse, así que asOf ≈ savedAt es lo correcto: lo que
  // se exige es que asOf nunca sea POSTERIOR a savedAt (sería un asOf inventado). La prueba de
  // conservación real vive en la sesión 2, contra la caché rehidratada.
  check('asOf nunca es posterior a savedAt', !!st1 && st1.sample[0] && st1.sample[0].asOf <= st1.sample[0].savedAt,
    st1 && st1.sample[0] && (st1.sample[0].asOf + ' vs ' + st1.sample[0].savedAt));
  check('nada sintético persistido', !!st1 && st1.sample[0] && st1.sample[0].syn === false);
  check('ningún dato de usuario en el almacén',
    !!store1 && !/email|userId|holdings|quantity|watchlist|token/i.test(store1));
  const reqs1 = await s.ev(`performance.getEntriesByType('resource').filter(function(r){return r.name.indexOf('history-yahoo')>=0||r.name.indexOf('/api/prices/history')>=0;}).length`);
  await s.close();

  // ── SESIÓN 2: nueva pestaña, mismo perfil (= cerrar y reabrir el navegador) ─
  console.log('\n── Sesión 2 · reapertura con snapshots persistidos');
  s = await newSession('s2');
  await boot(s);
  const hasStore = await s.ev(`(function(){try{return (localStorage.getItem('${SNAP_KEY}')||'').length;}catch(_){return 0;}})()`);
  check('el almacén sobrevive al cierre de la sesión', hasStore > 0, hasStore + ' B');
  await s.ev(`(function(){try{currentMarketTab='all';}catch(_){}})()`);
  const t0 = Date.now();
  await s.ev(`(function(){try{_applyTab('market');}catch(_){}})()`);
  for (let i = 0; i < 45; i++) { const n = await s.ev(`(document.querySelectorAll('#marketList .market-row')||[]).length`).catch(() => 0); if (n > 0) break; await sleep(200); }
  const firstPaint = await s.ev(SAMPLER);
  const tPaint = Date.now() - t0;
  // El criterio del SPEC es "cero esqueletos PARA SNAPSHOTS PERSISTIDOS", no cero en absoluto:
  // el almacén guarda 40 como máximo y la pestaña "all" muestra ~100 filas, así que las que
  // nunca se persistieron deben conservar el comportamiento frío (CASO 1 del SPEC).
  const restoredRows = await s.ev(`(function(){
    var restored={};_marketHistoryCache.forEach(function(v,k){if(v&&v.meta&&v.meta.restored)restored[k.split('|')[0]]=1;});
    var l=document.getElementById('marketList');var rs=l?l.querySelectorAll('.market-row'):[];
    var seen=0,mounted=0,skel=0,other=0;
    Array.prototype.forEach.call(rs,function(r){var sym=r.getAttribute('data-symbol');if(!restored[sym])return;seen++;
      var c=r.querySelector('.col-chart');if(!c){other++;return;}
      if(c.querySelector('.aurix-chart-host')||c.querySelector('canvas'))mounted++;
      else if(c.classList.contains('is-loading'))skel++;else other++;});
    return JSON.stringify({visibleRestored:seen,mounted:mounted,skeleton:skel,other:other});})()`);
  console.log(`  PRIMER PAINT (t=${tPaint}ms): filas=${firstPaint.rows} charts=${firstPaint.charts} skel=${firstPaint.skel} none=${firstPaint.none} blank=${firstPaint.blank}`);
  check('en el primer paint ya hay mini gráficos REALES restaurados', firstPaint.charts > 0, `charts=${firstPaint.charts}`);
  const rr = JSON.parse(restoredRows);
  console.log(`  filas visibles CON snapshot persistido: ${restoredRows}`);
  check('CERO esqueletos en las filas con snapshot persistido', rr.visibleRestored > 0 && rr.skeleton === 0, restoredRows);
  check('todas las filas con snapshot persistido pintan gráfico real ya en el primer paint',
    rr.visibleRestored > 0 && rr.mounted === rr.visibleRestored, restoredRows);
  check('ninguna celda restaurada se queda en blanco', firstPaint.blank === 0, `blank=${firstPaint.blank}`);
  const restoredMeta = await s.ev(`(function(){var n=0,orig=0;_marketHistoryCache.forEach(function(v){if(v&&v.meta&&v.meta.restored){n++;if(v.ts===v.meta.asOf)orig++;}});return JSON.stringify({restored:n,tsMatchesAsOf:orig});})()`);
  console.log(`  restauradas: ${restoredMeta}`);
  const rm = JSON.parse(restoredMeta);
  check('las entradas restauradas conservan su asOf original', rm.restored > 0 && rm.restored === rm.tsMatchesAsOf, restoredMeta);
  await drain(s); await sleep(1500);
  const after = await s.ev(SAMPLER);
  check('tras el refresh silencioso no aparece ningún esqueleto', after.skel === 0, `skel=${after.skel}`);
  check('el refresh silencioso mantiene o mejora los gráficos', after.charts >= firstPaint.charts, `${firstPaint.charts} → ${after.charts}`);
  const reqs2 = await s.ev(`performance.getEntriesByType('resource').filter(function(r){return r.name.indexOf('history-yahoo')>=0||r.name.indexOf('/api/prices/history')>=0;}).length`);
  console.log(`  peticiones de histórico: sesión1=${reqs1}  sesión2=${reqs2}`);
  check('el nº de peticiones no aumenta respecto a la sesión fría', reqs2 <= reqs1 + 2, `${reqs1} → ${reqs2}`);
  await s.close();

  // ── SESIÓN 3: almacén corrupto ─────────────────────────────────────────────
  console.log('\n── Sesión 3 · almacén corrupto');
  s = await newSession('s3');
  await boot(s);
  await s.ev(`(function(){try{localStorage.setItem('${SNAP_KEY}','{corrupto!!');}catch(_){}})()`);
  await s.ev(`(function(){try{currentMarketTab='all';}catch(_){}try{_applyTab('market');}catch(_){}})()`);
  for (let i = 0; i < 45; i++) { const n = await s.ev(`(document.querySelectorAll('#marketList .market-row')||[]).length`).catch(() => 0); if (n > 0) break; await sleep(500); }
  const s3 = await s.ev(SAMPLER);
  check('un almacén corrupto no rompe Market', s3.rows > 0, `filas=${s3.rows}`);
  await drain(s); await sleep(1500);
  const s3b = await s.ev(SAMPLER);
  check('tras corrupción se recarga normalmente desde red', s3b.charts > 0, `charts=${s3b.charts}`);
  check('la clave corrupta se descarta y se regenera limpia',
    (await s.ev(`(function(){try{var r=localStorage.getItem('${SNAP_KEY}');if(!r)return true;var p=JSON.parse(r);return p.schemaVersion===1;}catch(_){return false;}})()`)) === true);
  await s.close();

  const bad = R.filter(r => !r.c);
  console.log(`\n════ E2E · ${R.length - bad.length}/${R.length} ════`);
  bad.forEach(b => console.log('  FAIL ' + b.n));
  process.exitCode = bad.length ? 1 : 0;
} catch (e) {
  console.log('E2E ERROR: ' + (e && e.message));
  process.exitCode = 1;
} finally {
  try { chrome.kill('SIGKILL'); } catch (_) {}
  try { rmSync(profile, { recursive: true, force: true }); } catch (_) {}
}
