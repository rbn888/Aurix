#!/usr/bin/env node
/**
 * AURIX MARKET · FIRST-PAINT PROBE (SPEC MARKET-FIRST-PAINT-P0)
 *
 * Measures whether a Market row behaves as a SNAPSHOT (appears complete in one paint) or is
 * assembled in pieces (price → variation → chart at different moments).
 *
 * Serves the LOCAL working copy through a proxy that patches ONLY the auth navigation, so the
 * production bundle path can be exercised without an OTP account (recipe from ACCOUNT-CENTER-I18N).
 * Real market data still comes from the real API — nothing is stubbed.
 *
 * Reported per scenario:
 *   tListVisible   first moment any row exists
 *   tFirstComplete first moment ANY row is fully resolved (price+change+chart, no skeleton)
 *   tAllComplete   moment the LAST row resolves
 *   partialRows    rows observed in a partial state AFTER the list first painted  ← the defect
 *   skeletonPeak   maximum number of skeleton cells visible at once
 *
 *   node --experimental-websocket scripts/aurix-market-firstpaint-probe.mjs [--label=before]
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
const LABEL = (process.argv.find(a => a.startsWith('--label=')) || '--label=run').split('=')[1];
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
      // Patch ONLY the auth navigation. Market, the history cache and the row renderer are
      // untouched — this must measure the real code path.
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

const PORT = 9640 + (process.pid % 120);
const profile = mkdtempSync(join(tmpdir(), 'aurix-mkt-'));
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
  // Every CDP call is bounded: a Runtime.evaluate issued during a navigation can otherwise
  // never settle and hang the probe forever.
  return { send: (a, b = {}, s) => Promise.race([
    new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: a, params: b, ...(s ? { sessionId: s } : {}) })); }),
    sleep(20000).then(() => { throw new Error('cdp timeout: ' + a); }),
  ]) };
}
const ws = new WebSocket(await wsUrl());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
const cdp = mkClient(ws);
const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => cdp.send(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable');
await S('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

const ev = async (expression) => {
  const r = await S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || '').slice(0, 300));
  return r.result && r.result.value;
};

// Per-row completeness, evaluated in the page. A row is COMPLETE when price and variation carry
// a real value (no skeleton) and the chart cell has resolved to either a mounted chart or a
// declared-empty cell — i.e. nothing about it is still pending.
const SAMPLER = `(function(){
  var list=document.getElementById('marketList'); if(!list) return null;
  var rows=list.querySelectorAll('.market-row'); if(!rows.length) return {rows:0};
  var complete=0, partial=0, skel=0;
  rows.forEach(function(r){
    var pr=r.querySelector('.col-price'), ch=r.querySelector('.col-change'), cc=r.querySelector('.col-chart'), st=r.querySelector('.watchlist-btn');
    var priceOk=!!pr && pr.textContent.trim()!=='' && pr.textContent.trim()!=='—';
    var chLoading=!!ch && ch.classList.contains('is-loading');
    var chOk=!!ch && !chLoading && ch.textContent.trim()!=='';
    var ccLoading=!!cc && cc.classList.contains('is-loading');
    var ccResolved=!!cc && !ccLoading && (cc.querySelector('svg')||cc.classList.contains('col-chart--none'));
    var starOk=!!st;
    if(chLoading) skel++; if(ccLoading) skel++;
    if(priceOk&&chOk&&ccResolved&&starOk) complete++; else partial++;
  });
  return {rows:rows.length, complete:complete, partial:partial, skel:skel};
})()`;

async function scenario(name, prep) {
  // Scenarios must be independent: the silent background refresh from the previous scenario
  // would otherwise still occupy the 3-slot fetch queue and be charged to the next one.
  for (let i = 0; i < 120; i++) {
    const busy = await ev(`(function(){try{return _marketHistoryQueue.pending.length + _marketHistoryQueue.running;}catch(_){return 0;}})()`).catch(() => 0);
    if (!busy) break;
    await sleep(250);
  }
  await ev(`(function(){try{document.getElementById('marketList').innerHTML='';}catch(_){}})()`).catch(() => {});
  if (prep) await ev(prep);
  const t0 = Date.now();
  await ev(`(function(){try{ _applyTab('market'); }catch(e){ try{renderMarket();}catch(_){} }})()`);
  const timeline = [];
  let tList = null, tFirst = null, tAll = null, skelPeak = 0, sawPartialAfterPaint = 0;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const s = await ev(SAMPLER).catch(() => null);
    const t = Date.now() - t0;
    if (s && s.rows) {
      if (tList == null) tList = t;
      skelPeak = Math.max(skelPeak, s.skel || 0);
      if (tFirst == null && s.complete > 0) tFirst = t;
      if (s.partial > 0) sawPartialAfterPaint = Math.max(sawPartialAfterPaint, s.partial);
      timeline.push({ t, ...s });
      if (s.partial === 0 && s.complete > 0) { tAll = t; break; }
    }
    await sleep(120);
  }
  const last = timeline[timeline.length - 1] || {};
  const row = { scenario: name, tListVisible: tList, tFirstComplete: tFirst, tAllComplete: tAll, rows: last.rows || 0, partialRowsAfterPaint: sawPartialAfterPaint, skeletonPeak: skelPeak };
  console.log(`  ${name.padEnd(34)} list=${String(tList).padStart(5)}ms  firstComplete=${String(tFirst).padStart(5)}ms  allComplete=${String(tAll).padStart(6)}ms  rows=${row.rows}  partialAfterPaint=${row.partialRowsAfterPaint}  skelPeak=${row.skeletonPeak}`);
  return row;
}

const OUT = { label: LABEL, scenarios: [] };
try {
  await S('Page.navigate', { url: ORIGIN + '/index.html' });
  for (let i = 0; i < 60; i++) { const ok = await ev(`typeof renderMarket==='function' && typeof _applyTab==='function'`).catch(() => false); if (ok) break; await sleep(1000); }
  await sleep(3000);
  // Prime Market once so the asset universe is loaded from the real API; the measured
  // scenarios below then exercise the render path, not the initial catalogue download.
  // 'watchlist' (the default tab) is empty without a session — prime on 'all'.
  await ev(`(function(){try{currentMarketTab='all';}catch(_){} try{_applyTab('market');}catch(_){}})()`).catch(() => {});
  for (let i = 0; i < 45; i++) { const n = await ev(`(document.querySelectorAll('#marketList .market-row')||[]).length`).catch(() => 0); if (n > 0) break; await sleep(1000); }
  const primed = await ev(`(document.querySelectorAll('#marketList .market-row')||[]).length`).catch(() => 0);
  console.log(`\n════ MARKET FIRST PAINT · ${LABEL} ════   (universe primed: ${primed} rows)`);
  if (!primed) throw new Error('Market never populated — probe cannot measure');

  OUT.scenarios.push(await scenario('1 cold (empty cache)', `(function(){try{_marketHistoryCache.clear();}catch(_){ } return 1;})()`));
  OUT.scenarios.push(await scenario('2 warm (cache fresh)', null));
  // The reported symptom: leave Market, come back later. The 24H TTL is 60s, so any real
  // absence longer than a minute expires every entry. Aged deterministically here.
  OUT.scenarios.push(await scenario('3 return after TTL expiry', `(function(){var n=0;try{_marketHistoryCache.forEach(function(e){e.ts=Date.now()-3600000;n++;});}catch(_){ } return n;})()`));
  OUT.scenarios.push(await scenario('4 filter switch → crypto', `(function(){try{currentMarketTab='crypto';}catch(_){ } return 1;})()`));
  OUT.scenarios.push(await scenario('5 filter switch → all', `(function(){try{currentMarketTab='all';}catch(_){ } return 1;})()`));

  console.log('\nJSON ' + JSON.stringify(OUT));
} catch (e) {
  console.log('PROBE ERROR: ' + (e && e.message));
  process.exitCode = 1;
} finally {
  try { chrome.kill('SIGKILL'); } catch (_) {}
  try { server.close(); } catch (_) {}
  try { rmSync(profile, { recursive: true, force: true }); } catch (_) {}
}
