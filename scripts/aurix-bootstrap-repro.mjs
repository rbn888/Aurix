#!/usr/bin/env node
/**
 * AURIX-BOOT-CHROME-ANDROID-P0 · REPRO PROBE (investigation, not a gate)
 *
 * Drives real Chrome over CDP against a target URL while emulating a Chrome
 * Android device + a throttled mobile network, and records the FULL lifecycle
 * of the `app.js?v=` request plus the `window.__AURIX_BOOT` state at the moment
 * the boot watchdog is scheduled to fire.
 *
 * Answers the FASE 2 classification question (A..H) with evidence:
 *   A app.js not really requested · B requested but blocked/cancelled
 *   C 404/403/5xx             · D stale response from cache
 *   E SW serves wrong resource · F incomplete download
 *   G downloaded but rejected (MIME/CSP) · H syntax incompatibility
 *
 * Usage:
 *   node scripts/aurix-bootstrap-repro.mjs [url] [--down=<bytes/s>] [--watch=<ms>]
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ARGS = process.argv.slice(2);
const URL_ = ARGS.find(a => !a.startsWith('--')) || 'https://app.aurixsystem.io/index.html';
const opt = (n, d) => { const a = ARGS.find(x => x.startsWith('--' + n + '=')); return a ? Number(a.split('=')[1]) : d; };
const DOWN = opt('down', 400 * 1024 / 8);   // default ~400 Kbps ≈ slow mobile data
const WATCH = opt('watch', 12000);          // watchdog deadline under test
const HOLD = opt('hold', 45000);            // total observation window

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333 + (process.pid % 200);
const profile = mkdtempSync(join(tmpdir(), 'aurix-boot-'));

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch (_) {}
    await sleep(250);
  }
  throw new Error('Chrome DevTools endpoint never came up');
}

function client(ws) {
  let id = 0; const pend = new Map(); const handlers = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else if (m.method) handlers.forEach(h => h(m));
  });
  return {
    send: (method, params = {}, sessionId) => new Promise((res, rej) => {
      const mid = ++id; pend.set(mid, { res, rej });
      ws.send(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) }));
    }),
    on: h => handlers.push(h),
  };
}

const REPORT = { url: URL_, downBytesPerSec: DOWN, watchdogMs: WATCH, appJs: null, requests: {}, boot: null, classification: null, notes: [] };

try {
  const ws = new WebSocket(await wsUrl());
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  const cdp = client(ws);

  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);

  await S('Network.enable');
  await S('Page.enable');
  await S('Runtime.enable');
  await S('Log.enable');

  // Chrome 140 on Android (Pixel-class), exactly the reported client.
  await S('Emulation.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
    platform: 'Android',
    userAgentMetadata: { platform: 'Android', platformVersion: '14', architecture: '', model: 'Pixel 7', mobile: true, brands: [{ brand: 'Google Chrome', version: '140' }, { brand: 'Chromium', version: '140' }] },
  });
  await S('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true });
  await S('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: DOWN, uploadThroughput: DOWN / 4 });

  const byId = new Map();
  const t0 = Date.now();
  const rel = () => Date.now() - t0;

  cdp.on(m => {
    if (m.sessionId !== sessionId) return;
    const p = m.params || {};
    if (m.method === 'Network.requestWillBeSent') byId.set(p.requestId, { url: p.request.url, start: rel() });
    if (m.method === 'Network.responseReceived') {
      const e = byId.get(p.requestId); if (!e) return;
      e.status = p.response.status; e.mime = p.response.mimeType;
      e.fromDiskCache = p.response.fromDiskCache; e.fromSW = p.response.fromServiceWorker;
      e.headers = p.response.headers; e.responseAt = rel();
    }
    if (m.method === 'Network.loadingFinished') { const e = byId.get(p.requestId); if (e) { e.finishedAt = rel(); e.encodedBytes = p.encodedDataLength; } }
    if (m.method === 'Network.loadingFailed') { const e = byId.get(p.requestId); if (e) { e.failedAt = rel(); e.errorText = p.errorText; e.canceled = p.canceled; e.blockedReason = p.blockedReason; } }
    if (m.method === 'Log.entryAdded' && p.entry && /error/i.test(p.entry.level)) REPORT.notes.push('console:' + p.entry.text.slice(0, 200));
  });

  await S('Page.navigate', { url: URL_ });

  // Snapshot __AURIX_BOOT exactly at the watchdog deadline.
  const snap = async () => {
    try {
      const r = await S('Runtime.evaluate', {
        expression: `(function(){var B=window.__AURIX_BOOT;if(!B)return null;return JSON.stringify({build:B.build,appJsVersion:B.appJsVersion,appJsRequested:B.appJsRequested,appJsLoaded:B.appJsLoaded,appJsExecuted:B.appJsExecuted,bootstrapStarted:B.bootstrapStarted,dashboardReady:B.dashboardReady,domContentLoaded:B.domContentLoaded,windowLoad:B.windowLoad,watchdogFired:B.watchdogFired,tickCount:B.tickCount,errors:B.errors.slice(0,5),steps:B.steps,diagVisible:!!document.getElementById('aurixBootDiag'),probe:B.probe||null,readyState:document.readyState,diagReason:(function(){var d=document.getElementById('aurixBootDiag');if(!d)return null;var m=d.innerText.match(/"reason":\\s*"([^"]+)"/);return m?m[1]:'?';})()});})()`,
        returnByValue: true, awaitPromise: false,
      });
      return r.result && r.result.value ? JSON.parse(r.result.value) : null;
    } catch (_) { return null; }
  };

  await sleep(Math.max(0, WATCH - rel()) + 400);
  REPORT.bootAtWatchdog = await snap();
  REPORT.timeline = [];
  while (rel() < HOLD) {
    await sleep(5000);
    const s = await snap();
    REPORT.timeline.push({ atMs: rel(), executed: s && s.appJsExecuted, ready: s && s.dashboardReady, diagVisible: s && s.diagVisible, reason: s && s.diagReason, steps: s && s.steps, lost: !s });
  }
  REPORT.bootAtEnd = await snap();

  for (const [, e] of byId) {
    if (/app\.js\?v=/.test(e.url)) REPORT.appJs = e;
    if (/version\.json/.test(e.url)) REPORT.requests.versionJson = e;
    if (/index\.html|\/$/.test(e.url) && !REPORT.requests.index) REPORT.requests.index = e;
  }

  const a = REPORT.appJs;
  if (!a) REPORT.classification = 'A · app.js never requested';
  else if (a.blockedReason) REPORT.classification = 'B · blocked (' + a.blockedReason + ')';
  else if (a.errorText || a.canceled) REPORT.classification = 'B · cancelled/failed: ' + (a.errorText || 'canceled');
  else if (a.status >= 400) REPORT.classification = 'C · HTTP ' + a.status;
  else if (a.fromSW) REPORT.classification = 'E · served by Service Worker';
  else if (!a.finishedAt) REPORT.classification = 'F · response never finished within the observation window';
  else if (a.finishedAt > WATCH) REPORT.classification = 'F/B · download finished at ' + a.finishedAt + 'ms — AFTER the ' + WATCH + 'ms watchdog';
  else REPORT.classification = 'OK · finished at ' + a.finishedAt + 'ms (within watchdog)';

  console.log(JSON.stringify(REPORT, null, 2));
} finally {
  try { chrome.kill('SIGKILL'); } catch (_) {}
  try { rmSync(profile, { recursive: true, force: true }); } catch (_) {}
}
