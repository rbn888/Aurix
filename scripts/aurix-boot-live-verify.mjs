#!/usr/bin/env node
/**
 * AURIX BOOT · LIVE VERIFICATION MATRIX (SPEC BOOT-CHROME-ANDROID-P0)
 *
 * Post-deploy check against PRODUCTION with a real Chrome emulating Chrome 140 / Android,
 * across the network + cache states from the SPEC's live checklist.
 *
 *   node --experimental-websocket scripts/aurix-boot-live-verify.mjs [origin]
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ORIGIN = process.argv.find(a => a.startsWith('http')) || 'https://app.aurixsystem.io';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 9560 + (process.pid % 120);
const profile = mkdtempSync(join(tmpdir(), 'aurix-live-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });

async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try { const j = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch (_) {}
    await sleep(250);
  }
  throw new Error('no devtools');
}
function mkClient(ws) {
  let id = 0; const pend = new Map(); const hs = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else if (m.method) hs.forEach(h => h(m));
  });
  return { send: (a, b = {}, s) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: a, params: b, ...(s ? { sessionId: s } : {}) })); }), on: h => hs.push(h) };
}

const ws = new WebSocket(await wsUrl());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
const cdp = mkClient(ws);
const rows = [];

async function run(label, { down, warm, query, clearCache = true, seed }) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);
  await S('Page.enable'); await S('Runtime.enable'); await S('Network.enable');
  await S('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36', platform: 'Android', userAgentMetadata: { platform: 'Android', platformVersion: '14', mobile: true, architecture: '', model: 'Pixel 7', brands: [{ brand: 'Google Chrome', version: '140' }] } });
  await S('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true });
  if (clearCache) { await S('Network.clearBrowserCache').catch(() => {}); }
  await S('Network.emulateNetworkConditions', { offline: false, latency: down ? 150 : 20, downloadThroughput: down || -1, uploadThroughput: down ? down / 4 : -1 });

  const navs = [];
  cdp.on(m => { if (m.sessionId === sessionId && m.method === 'Page.frameNavigated' && !m.params.frame.parentId) navs.push(m.params.frame.url); });

  if (seed) { await S('Page.navigate', { url: ORIGIN + '/version.json' }); await sleep(600); await S('Runtime.evaluate', { expression: seed, returnByValue: true }).catch(() => {}); }
  if (warm) { await S('Page.navigate', { url: ORIGIN + '/index.html' }); await sleep(warm); }

  navs.length = 0;
  await S('Page.navigate', { url: ORIGIN + '/index.html' + (query || '') });

  // Peak state = the best boot state observed before the app's own auth redirect tears the
  // context down. dashboardReady needs an authenticated session and is not assertable here.
  const peak = { loaded: false, executed: false, bootstrapStarted: false, dashboardReady: false, diagEver: false, diagText: null, build: null, appjsV: null };
  const deadline = Date.now() + (down ? 70000 : 25000);
  while (Date.now() < deadline) {
    try {
      const r = await S('Runtime.evaluate', { expression: `(function(){var B=window.__AURIX_BOOT;var d=document.getElementById('aurixBootDiag');return JSON.stringify({has:!!B,l:B?B.appJsLoaded:null,e:B?B.appJsExecuted:null,bs:B?B.bootstrapStarted:null,dr:B?B.dashboardReady:null,b:B?B.build:null,v:B?B.appJsVersion:null,diag:!!d,dt:d?d.innerText.slice(0,300):null,url:location.href});})()`, returnByValue: true });
      const s = r.result && r.result.value ? JSON.parse(r.result.value) : null;
      if (s && s.has) {
        peak.loaded ||= !!s.l; peak.executed ||= !!s.e; peak.bootstrapStarted ||= !!s.bs; peak.dashboardReady ||= !!s.dr;
        peak.build = s.b || peak.build; peak.appjsV = s.v || peak.appjsV;
        if (s.diag) { peak.diagEver = true; peak.diagText = s.dt; }
      }
      if (peak.executed && (peak.bootstrapStarted || /login/.test((s && s.url) || ''))) break;
    } catch (_) {}
    await sleep(1000);
  }
  const reachedApp = peak.executed && (peak.bootstrapStarted || navs.some(u => /login/.test(u)));
  rows.push({ label, ...peak, recoveryReloads: navs.filter(u => /_recover=/.test(u)).length, reachedApp });
  console.log(`${reachedApp && !peak.diagEver ? 'PASS' : 'FAIL'}  ${label.padEnd(46)} loaded=${peak.loaded} exec=${peak.executed} bootstrap=${peak.bootstrapStarted} diag=${peak.diagEver} build=${peak.build} appjs=${peak.appjsV}`);
  try { await cdp.send('Target.closeTarget', { targetId }); } catch (_) {}
}

const OLD_STATE = `try{localStorage.setItem('aurix_build','v600-ancient');localStorage.setItem('portfolio_lang','es');localStorage.setItem('live_probe_portfolio','{"qty":7}');}catch(_){}`;

try {
  await run('1 · clean cache · wifi (fast)', { clearCache: true });
  await run('2 · clean cache · mobile data ~400 Kbps', { down: 51200, clearCache: true });
  await run('3 · warm cache · mobile data ~400 Kbps', { down: 51200, clearCache: false, warm: 12000 });
  await run('4 · old local state preserved · 400 Kbps', { down: 51200, seed: OLD_STATE });
  await run('5 · fresh profile (incognito-equivalent)', { clearCache: true, query: '?_fresh=' + Date.now() });
  await run('6 · ?lang=en · 400 Kbps', { down: 51200, query: '?lang=en' });
  await run('7 · reopen after update · wifi', { clearCache: false, warm: 8000 });

  const bad = rows.filter(r => !r.reachedApp || r.diagEver);
  const state = await (async () => {
    const { targetId } = await cdp.send('Target.createTarget', { url: ORIGIN + '/index.html' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await sleep(4000);
    const r = await cdp.send('Runtime.evaluate', { expression: `(function(){try{return JSON.stringify({pf:localStorage.getItem('live_probe_portfolio'),lang:localStorage.getItem('portfolio_lang')});}catch(_){return 'null';}})()`, returnByValue: true }, sessionId);
    return JSON.parse(r.result.value || 'null');
  })();
  console.log('\nlocal state after the whole matrix:', JSON.stringify(state), '(portfolio + lang must survive)');
  console.log(`\n════ LIVE MATRIX · ${rows.length - bad.length}/${rows.length} passed ════`);
  bad.forEach(b => console.log('  FAIL ' + b.label + ' → ' + (b.diagText || 'app never reached')));
  process.exitCode = bad.length ? 1 : 0;
} finally {
  try { chrome.kill('SIGKILL'); } catch (_) {}
  try { rmSync(profile, { recursive: true, force: true }); } catch (_) {}
}
