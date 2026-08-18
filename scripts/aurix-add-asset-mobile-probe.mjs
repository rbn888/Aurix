#!/usr/bin/env node
/**
 * ADD-ASSET MOBILE INTERACTION — live probe (SPEC ADD ASSET MOBILE INTERACTION CLEANUP)
 *
 * Drives the REAL bundle in Chrome at a mobile viewport and checks the three contracts:
 *   FIX 1  custody <select> resolves to the dark native colour scheme
 *   FIX 2  Add crypto / stock / etf open at rest — no forced focus, no open dropdown
 *   FIX 3  with a keyboard-sized visual viewport the sheet stays inside it and Results
 *          stay scrollable; clearing it restores the previous geometry exactly
 *   plus   desktop regression: focus + curated defaults still fire above 768px
 *
 * Serves the LOCAL working copy through a proxy that patches ONLY the auth navigation, so the
 * production bundle path runs without an OTP account (same recipe as the Market probes).
 *
 *   node --experimental-websocket scripts/aurix-add-asset-mobile-probe.mjs
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
      // Patch ONLY the auth navigation — the Add Asset path under test is untouched.
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

const PORT = 9780 + (process.pid % 120);
const profile = mkdtempSync(join(tmpdir(), 'aurix-aa-'));
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
const ev = async (expression) => {
  const r = await S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '').slice(0, 300));
  return r.result && r.result.value;
};
let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n + (info ? '  [' + info + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };

async function load(w, h, mobile) {
  await S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 3 : 1, mobile });
  await S('Page.navigate', { url: ORIGIN + '/index.html' });
  for (let i = 0; i < 100; i++) {
    const ready = await ev(`!!(document.getElementById('modalOverlay') && typeof openContextualModal === 'function' && typeof openModal === 'function')`).catch(() => false);
    if (ready) break;
    await sleep(250);
  }
  await sleep(700);   // let boot settle (the defect's timers are 50/70 ms)
}

// state of the sheet at rest, read from the page
const SHEET = `(function(){
  var ov=document.getElementById('modalOverlay');
  var sug=document.getElementById('assetSuggestions');
  var si=document.getElementById('searchInput')||document.querySelector('#modalOverlay input[type="text"]');
  var sheet=ov?ov.querySelector('.modal'):null;
  var body=sheet?sheet.querySelector('.modal-body'):null;
  return {
    open: !!(ov&&ov.classList.contains('open')),
    sugOpen: !!(sug&&sug.classList.contains('open')),
    focused: !!(si&&document.activeElement===si),
    activeTag: document.activeElement?document.activeElement.id||document.activeElement.tagName:null,
    sheetH: sheet?Math.round(sheet.getBoundingClientRect().height):null,
    sheetTop: sheet?Math.round(sheet.getBoundingClientRect().top):null,
    bodyScrollable: !!(body&&body.scrollHeight>body.clientHeight+1),
    flow: sheet?sheet.getAttribute('data-asset-flow'):null,
  };
})()`;

console.log('ADD-ASSET MOBILE INTERACTION — live probe\n');

// ══ MOBILE 390×844 ══
await load(390, 844, true);
console.log('MOBILE 390×844');

// 1 — Add crypto opens clean
await ev(`openContextualModal('crypto')`); await sleep(400);
let s = await ev(SHEET);
ok('1 Add crypto: sheet open', s.open);
ok('1 Add crypto: NO dropdown desplegado', s.sugOpen === false, 'sugOpen=' + s.sugOpen);
ok('1 Add crypto: NO foco forzado (sin teclado)', s.focused === false, 'activeElement=' + s.activeTag);

// 2 — user taps Search → focus works normally
await ev(`(function(){var si=document.getElementById('searchInput')||document.querySelector('#modalOverlay input[type="text"]'); si.focus(); return true;})()`);
await sleep(250);
s = await ev(SHEET);
ok('2 pulsar Search: el foco funciona con normalidad', s.focused === true, 'activeElement=' + s.activeTag);

// 3 — type BTC → results appear and are reachable
await ev(`(function(){var si=document.getElementById('searchInput')||document.querySelector('#modalOverlay input[type="text"]'); si.value='BTC'; si.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);
await sleep(900);
s = await ev(SHEET);
ok('3 escribir BTC: resultados visibles', s.sugOpen === true, 'sugOpen=' + s.sugOpen);

// reference for the restore check: the geometry immediately BEFORE the keyboard opens
const restH = s.sheetH, restTop = s.sheetTop;

// 3b — FIX 3 contract: simulate a keyboard-sized visual viewport (Chrome headless has no
// software keyboard, so the publisher's OUTPUT is injected to exercise the CSS contract).
const KB_VVH = 420;
await ev(`(function(){var de=document.documentElement; de.style.setProperty('--aurix-vvh','${KB_VVH}px'); de.setAttribute('data-aurix-kb','open'); return true;})()`);
await sleep(300);
const kb = await ev(SHEET);
ok('3b teclado abierto: la sheet cabe en el viewport visual', kb.sheetH !== null && kb.sheetH <= KB_VVH, 'sheetH=' + kb.sheetH + ' <= ' + KB_VVH);
ok('3b teclado abierto: header/Search siguen arriba (sheet no desplazada fuera)', kb.sheetTop !== null && kb.sheetTop >= 0 && kb.sheetTop < KB_VVH, 'top=' + kb.sheetTop);
ok('3b teclado abierto: resultados scrolleables (un solo scroll owner)', kb.bodyScrollable === true, 'bodyScrollable=' + kb.bodyScrollable);

// 4 — keyboard closes → exact restore
await ev(`(function(){var de=document.documentElement; de.removeAttribute('data-aurix-kb'); de.style.removeProperty('--aurix-vvh'); return true;})()`);
await sleep(300);
const back = await ev(SHEET);
ok('4 cerrar teclado: geometría restaurada exactamente', back.sheetH === restH && back.sheetTop === restTop,
  'h ' + restH + '→' + back.sheetH + ', top ' + restTop + '→' + back.sheetTop);
ok('4 cerrar teclado: sin cap residual', await ev(`!document.documentElement.hasAttribute('data-aurix-kb') && !document.documentElement.style.getPropertyValue('--aurix-vvh')`));

// 5 — custody select is dark
await ev(`(function(){try{closeModal();}catch(_){ } return true;})()`); await sleep(200);
const sel = await ev(`(function(){
  var el=document.getElementById('assetLocationType'); if(!el) return null;
  var cs=getComputedStyle(el);
  var opts=[].map.call(el.options,function(o){return o.value;}).filter(Boolean);
  return { colorScheme: cs.colorScheme||cs.getPropertyValue('color-scheme'), options: opts };
})()`);
ok('5 custody select existe', !!sel);
ok('5 custody select: color-scheme dark (menú nativo oscuro)', !!sel && /dark/.test(sel.colorScheme), sel && sel.colorScheme);
ok('5 custody select: opciones intactas', !!sel && sel.options.join(',') === 'broker,exchange,wallet,bank,custodian,other', sel && sel.options.join(','));

// 6 — smoke: stocks + funds/etf same clean contract
for (const cat of ['stock', 'etf']) {
  await ev(`(function(){try{closeModal();}catch(_){ } return true;})()`); await sleep(200);
  await ev(`openContextualModal('${cat}')`); await sleep(400);
  const c = await ev(SHEET);
  ok('6 ' + cat + ': abre limpio (sin dropdown, sin foco)', c.open && c.sugOpen === false && c.focused === false,
    'sug=' + c.sugOpen + ' focus=' + c.focused);
}

// ══ DESKTOP 1440×900 — previous behaviour must survive ══
await load(1440, 900, false);
console.log('\nDESKTOP 1440×900 (regresión)');
await ev(`openContextualModal('crypto')`); await sleep(600);
const d = await ev(SHEET);
ok('7 desktop: foco automático conservado', d.focused === true, 'activeElement=' + d.activeTag);
ok('7 desktop: sugerencias curadas conservadas', d.sugOpen === true, 'sugOpen=' + d.sugOpen);
ok('7 desktop: la regla de teclado NO aplica', await ev(`!document.documentElement.hasAttribute('data-aurix-kb')`));

console.log('\n' + (fail === 0 ? 'RESULT: ALL PASS ✓' : 'RESULT: FAIL ✗') + '  (' + pass + ' passed, ' + fail + ' failed)');
try { ws.close(); } catch (_) {}
try { chrome.kill('SIGKILL'); } catch (_) {}
try { server.close(); } catch (_) {}
try { rmSync(profile, { recursive: true, force: true }); } catch (_) {}
process.exit(fail === 0 ? 0 : 1);
