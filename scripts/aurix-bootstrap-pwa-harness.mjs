#!/usr/bin/env node
/**
 * AURIX BOOTSTRAP / PWA HARNESS · SPEC BOOT-CHROME-ANDROID-P0
 *
 * Single harness for the boot chain: index.html → app.js resolution → cache/SW →
 * HTTP response → load & execute in Chrome Android. Drives REAL Chrome over CDP,
 * emulating a Chrome 140 / Android client, against a local static server whose
 * `app.js?v=` responses are shaped per scenario through Fetch interception.
 *
 * Scope: bootstrap only. It never touches portfolio, market, auth or financial logic.
 *
 *   node --experimental-websocket scripts/aurix-bootstrap-pwa-harness.mjs
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
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

// ── static server ────────────────────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/' ) p = '/index.html';
    const abs = normalize(join(ROOT, p));
    if (!abs.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const buf = await readFile(abs);
    res.writeHead(200, { 'content-type': MIME[extname(abs)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  } catch (_) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

// ── chrome ───────────────────────────────────────────────────────────────────────────────────
const PORT = 9411 + (process.pid % 150);
const profile = mkdtempSync(join(tmpdir(), 'aurix-harness-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });

async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try { const j = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch (_) {}
    await sleep(250);
  }
  throw new Error('Chrome DevTools endpoint never came up');
}
function mkClient(ws) {
  let id = 0; const pend = new Map(); const hs = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else if (m.method) hs.forEach(h => h(m));
  });
  return { send: (method, params = {}, sessionId) => new Promise((res, rej) => { const mid = ++id; pend.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) })); }), on: h => hs.push(h) };
}

const ws = new WebSocket(await wsUrl());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
const cdp = mkClient(ws);

const b64 = s => Buffer.from(s, 'utf8').toString('base64');
// Minimal stand-in for the real bundle: satisfies the supervisor's success contract.
const STUB_OK = b64(`try{window.__AURIX_BOOT.appJsExecuted=true;window.__AURIX_BOOT.mark('app_js_executing');}catch(_){}`);
const STUB_NOEXEC = b64(`/* loads fine, never signals execution (parse-ok but inert) */ void 0;`);

const RESULTS = [];
function check(scenario, name, pass, detail) {
  RESULTS.push({ scenario, name, pass: !!pass, detail: detail === undefined ? '' : String(detail).slice(0, 220) });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined && !pass ? '  → ' + String(detail).slice(0, 220) : ''}`);
}

/**
 * Run one scenario in a fresh tab.
 * cfg.script(loadIndex) → { action:'pass' } | { action:'fulfil', status, body, headers } | { action:'hold', releaseAtMs, then }
 * cfg.probe(loadIndex)  → { status } for the supervisor's Range probe
 */
async function scenario(name, cfg) {
  console.log(`\n── ${name}`);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);
  await S('Page.enable'); await S('Runtime.enable'); await S('Network.enable');
  await S('Emulation.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
    platform: 'Android', userAgentMetadata: { platform: 'Android', platformVersion: '14', architecture: '', model: 'Pixel 7', mobile: true, brands: [{ brand: 'Google Chrome', version: '140' }] },
  });
  await S('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true });
  await S('Fetch.enable', { patterns: [{ urlPattern: '*app.js*' }] });

  let docLoads = 0, scriptReqs = 0;
  const navUrls = [];
  const t0 = Date.now(); const rel = () => Date.now() - t0;
  const held = [];

  cdp.on(async m => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId) { docLoads++; navUrls.push(m.params.frame.url); }
    if (m.method !== 'Fetch.requestPaused') return;
    const p = m.params;
    const hdrs = Object.fromEntries(Object.entries(p.request.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const isProbe = !!hdrs.range;
    try {
      if (isProbe) {
        const r = (cfg.probe ? cfg.probe(docLoads) : { status: 206 });
        if (r.fail) { await S('Fetch.failRequest', { requestId: p.requestId, errorReason: r.fail }); return; }
        await S('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: r.status, responseHeaders: [{ name: 'content-type', value: 'application/javascript' }, { name: 'content-range', value: 'bytes 0-0/3518088' }], body: b64('x') });
        return;
      }
      scriptReqs++;
      const a = cfg.script(docLoads);
      if (a.action === 'pass') { await S('Fetch.continueRequest', { requestId: p.requestId }); return; }
      if (a.action === 'hold') { held.push({ requestId: p.requestId, a }); if (a.releaseAtMs) setTimeout(async () => { try { const t = a.then; await S('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: t.status, responseHeaders: [{ name: 'content-type', value: 'application/javascript' }], body: t.body }); } catch (_) {} }, a.releaseAtMs); return; }
      await S('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: a.status, responseHeaders: [{ name: 'content-type', value: a.contentType || 'application/javascript' }], body: a.body || b64('') });
    } catch (_) {}
  });

  const url = ORIGIN + '/index.html' + (cfg.query || '');
  if (cfg.seed) {
    await S('Page.navigate', { url: ORIGIN + '/version.json' });
    await sleep(400);
    await S('Runtime.evaluate', { expression: cfg.seed, returnByValue: true }).catch(() => {});
  }
  docLoads = 0;
  await S('Page.navigate', { url });

  const probeState = async () => {
    try {
      const r = await S('Runtime.evaluate', {
        expression: `(function(){var B=window.__AURIX_BOOT;var d=document.getElementById('aurixBootDiag');
          return JSON.stringify({has:!!B,executed:B?B.appJsExecuted:null,loaded:B?B.appJsLoaded:null,loadError:B?B.appJsLoadError:null,
            watchdogFired:B?B.watchdogFired:null,steps:B?B.steps.slice(-3):null,readyState:document.readyState,
            diag:!!d,diagText:d?d.innerText.slice(0,4000):null,
            recoveryMark:(function(){try{return sessionStorage.getItem('aurix_boot_recovery');}catch(_){return 'ERR';}})(),
            seededEmail:(function(){try{return localStorage.getItem('harness_email');}catch(_){return null;}})(),
            seededPortfolio:(function(){try{return localStorage.getItem('harness_portfolio');}catch(_){return null;}})(),
            splashVisible:(function(){var b=document.getElementById('bootLoader');return !!b&&b.style.display!=='none';})()});})()`,
        returnByValue: true,
      });
      return r.result && r.result.value ? JSON.parse(r.result.value) : null;
    } catch (_) { return null; }
  };

  const samples = [];
  for (const at of cfg.sampleAt) {
    await sleep(Math.max(0, at - rel()));
    samples.push({ at, ...(await probeState() || { lost: true }) });
  }
  // A "recovery" reload is specifically one carrying the _recover marker — the app's own
  // navigations (e.g. the unauthenticated redirect to login) must not be counted as one.
  const recoveryLoads = () => navUrls.filter(u => /_recover=/.test(u)).length;
  await cfg.assert({ samples, docLoads: () => docLoads, recoveryLoads, navUrls: () => navUrls, scriptReqs: () => scriptReqs, check: (n, p, d) => check(name, n, p, d), probeState });
  try { await S('Fetch.disable'); } catch (_) {}
  try { await cdp.send('Target.closeTarget', { targetId }); } catch (_) {}
}

const SEED = `try{localStorage.setItem('harness_email','founder@aurixsystem.io');localStorage.setItem('harness_portfolio','{"qty":123.45}');localStorage.setItem('sb-access-token','SECRET_TOKEN_VALUE');}catch(_){}`;

try {
  // 1 ── Current build, clean cache, real bundle. Must boot, never show the panel.
  await scenario('clean_boot_real_bundle', {
    // Sampled at 6s: the real bundle has executed but the app has not yet performed its own
    // unauthenticated redirect, which would destroy the context and is not a boot concern.
    script: () => ({ action: 'pass' }), sampleAt: [2500],
    assert: async ({ samples, check, recoveryLoads, navUrls }) => {
      check('app.js executed', samples[0].executed === true, JSON.stringify(samples[0].steps) + ' navs=' + navUrls().join(' | '));
      check('no diagnostic panel on a normal boot', samples[0].diag === false);
      check('no recovery reload', recoveryLoads() === 0, navUrls().join(' | '));
      check('no recovery marker written', !samples[0].recoveryMark, samples[0].recoveryMark);
    },
  });

  // 2 ── THE REGRESSION. Bundle arrives at 20s (slow mobile link). The old 12s timer painted the
  //      panel here over a healthy boot; the supervisor must recognise the parser is still blocked.
  await scenario('slow_bundle_no_false_diagnostic', {
    script: () => ({ action: 'hold', releaseAtMs: 20000, then: { status: 200, body: STUB_OK } }),
    probe: () => ({ status: 206 }), sampleAt: [13000, 18000, 24000],
    assert: async ({ samples, check, docLoads }) => {
      check('no panel at 13s while the transfer is in flight', samples[0].diag === false, 'readyState=' + samples[0].readyState);
      check('no panel at 18s (still downloading)', samples[1].diag === false);
      check('parser still blocked ⇒ evidence of a live transfer', samples[0].readyState === 'loading');
      check('boots once the bundle lands', samples[2].executed === true);
      check('still no panel after boot', samples[2].diag === false);
      check('no recovery reload on a merely slow link', docLoads() === 1, 'docLoads=' + docLoads());
    },
  });

  // 3 ── Hard 404. Terminal at once (no 12s tax) → exactly ONE recovery → panel on the 2nd failure.
  await scenario('bundle_404_recovers_once_then_reports', {
    script: () => ({ action: 'fulfil', status: 404, body: b64('not found') }),
    probe: () => ({ status: 404 }), sampleAt: [4000, 11000],
    assert: async ({ samples, check, docLoads }) => {
      check('recovery happened before the old 12s deadline', docLoads() >= 2, 'docLoads=' + docLoads());
      check('panel shown after the second failure', samples[1].diag === true);
      check('reason is the load error', /app_js_load_error/.test(samples[1].diagText || ''), (samples[1].diagText || '').slice(0, 120));
      check('recovery marker present (anti-loop armed)', !!samples[1].recoveryMark);
      check('exactly one recovery reload — no loop', docLoads() === 2, 'docLoads=' + docLoads());
    },
  });

  // 4 ── Bundle downloads fine but never signals execution (parse-ok but inert / CSP-neutered).
  await scenario('loaded_but_never_executed', {
    script: () => ({ action: 'fulfil', status: 200, body: STUB_NOEXEC }),
    probe: () => ({ status: 206 }), sampleAt: [9000, 15000],
    assert: async ({ samples, check, docLoads }) => {
      check('classified as loaded-but-not-executed', /app_js_loaded_but_never_executed/.test(samples[1].diagText || ''), (samples[1].diagText || '').slice(0, 160));
      check('one recovery then report', docLoads() === 2, 'docLoads=' + docLoads());
    },
  });

  // 5 ── Transfer hangs forever but the resource itself is reachable (probe 206). Must NOT report:
  //      below the ceiling this is a slow link, not a fatal.
  await scenario('hanging_transfer_reachable_no_premature_report', {
    script: () => ({ action: 'hold' }), probe: () => ({ status: 206 }), sampleAt: [14000, 22000],
    assert: async ({ samples, check, docLoads }) => {
      check('no panel at 14s', samples[0].diag === false);
      check('no panel at 22s (probe proves the resource is fine)', samples[1].diag === false);
      check('no reload while the parser is still blocked', docLoads() === 1, 'docLoads=' + docLoads());
    },
  });

  // 6 ── Transfer hangs AND the resource is unreachable (5xx). The probe is what breaks the tie.
  await scenario('hanging_transfer_unreachable_probe_breaks_tie', {
    // Two soft deadlines back to back: ~13s to recover, then ~13s more on the recovered load
    // before the second verdict — hence the 34s sample.
    script: () => ({ action: 'hold' }), probe: () => ({ status: 503 }), sampleAt: [16000, 34000],
    assert: async ({ samples, check, recoveryLoads }) => {
      check('probe failure triggers recovery', recoveryLoads() === 1, 'recoveryLoads=' + recoveryLoads());
      check('panel after the second failure', samples[1].diag === true);
      check('reason names the unreachable bundle', /app_js_unreachable_503/.test(samples[1].diagText || ''), (samples[1].diagText || '').slice(0, 200));
      check('no third reload — no loop', recoveryLoads() === 1);
    },
  });

  // 6b ── REGRESSION LOCK. The probe itself fails at the NETWORK level (contention on a saturated
  //       slow link) while the bundle is downloading fine. An ambiguous probe error must never
  //       outrank the parser evidence: no verdict, no reload, and the app boots normally.
  await scenario('probe_network_error_never_condemns_a_live_transfer', {
    script: () => ({ action: 'hold', releaseAtMs: 26000, then: { status: 200, body: STUB_OK } }),
    probe: () => ({ fail: 'ConnectionFailed' }), sampleAt: [15000, 22000, 30000],
    assert: async ({ samples, check, recoveryLoads }) => {
      check('no panel at 15s despite the probe error', samples[0].diag === false);
      check('no panel at 22s despite the probe error', samples[1].diag === false);
      check('no recovery reload triggered by an ambiguous probe', recoveryLoads() === 0);
      check('app boots when the bundle lands', samples[2].executed === true);
      check('still no panel after boot', samples[2].diag === false);
    },
  });

  // 7 ── A panel already painted must be RETIRED if the bundle turns up afterwards. The recovery
  //      marker is pre-seeded so this load reports directly (no reload), then the bundle lands.
  await scenario('panel_retires_when_bundle_arrives_late', {
    seed: `try{sessionStorage.setItem('aurix_boot_recovery',JSON.stringify({r:'seeded',ts:1}));}catch(_){}`,
    script: () => ({ action: 'hold', releaseAtMs: 22000, then: { status: 200, body: STUB_OK } }),
    probe: () => ({ status: 503 }), sampleAt: [16000, 27000],
    assert: async ({ samples, check, recoveryLoads }) => {
      check('panel was painted (recovery already exhausted)', samples[0].diag === true, 'readyState=' + samples[0].readyState);
      check('no reload — the anti-loop marker held', recoveryLoads() === 0);
      check('app booted when the bundle finally landed', samples[1].executed === true);
      check('panel retired — user is not stranded on a diagnostic', samples[1].diag === false);
      check('splash restored, not left hidden', samples[1].splashVisible === true);
    },
  });

  // 8/9 ── Localisation of the recovery screen.
  await scenario('diagnostic_lang_en', {
    query: '?lang=en', script: () => ({ action: 'fulfil', status: 404, body: b64('x') }), probe: () => ({ status: 404 }), sampleAt: [11000],
    assert: async ({ samples, check }) => {
      const t = samples[0].diagText || '';
      check('English title', /startup diagnostics/i.test(t), t.slice(0, 90));
      check('English retry button', /Retry \(clean reload\)/.test(t));
      check('no Spanish leakage', !/diagnóstico de arranque|Reintentar/.test(t));
    },
  });
  await scenario('diagnostic_lang_es', {
    query: '?lang=es', script: () => ({ action: 'fulfil', status: 404, body: b64('x') }), probe: () => ({ status: 404 }), sampleAt: [11000],
    assert: async ({ samples, check }) => {
      const t = samples[0].diagText || '';
      check('Spanish title', /diagnóstico de arranque/i.test(t), t.slice(0, 90));
      check('Spanish retry button', /Reintentar/.test(t));
    },
  });

  // 10 ── Privacy + data safety: the report leaks nothing, and recovery preserves user state.
  await scenario('no_pii_and_no_data_loss', {
    seed: SEED, script: () => ({ action: 'fulfil', status: 404, body: b64('x') }), probe: () => ({ status: 404 }), sampleAt: [11000],
    assert: async ({ samples, check }) => {
      const t = samples[0].diagText || '';
      check('panel shown', samples[0].diag === true);
      check('no email in the report', !/founder@aurixsystem\.io/.test(t));
      check('no token in the report', !/SECRET_TOKEN_VALUE/.test(t));
      check('no portfolio values in the report', !/123\.45/.test(t));
      check('no localStorage dump', !/harness_portfolio|sb-access-token/.test(t));
      check('portfolio survived the recovery reload', samples[0].seededPortfolio === '{"qty":123.45}', samples[0].seededPortfolio);
      check('session/prefs survived the recovery reload', samples[0].seededEmail === 'founder@aurixsystem.io', samples[0].seededEmail);
      check('report carries the diagnostic fields the SPEC requires',
        /appJsUrl/.test(t) && /serviceWorker/.test(t) && /aurixCaches/.test(t) && /online/.test(t) && /visibilityState/.test(t) && /recovery/.test(t) && /readyState/.test(t));
    },
  });

  // 11 ── No PWA / static-contract regression.
  await scenario('pwa_and_version_contract_intact', {
    script: () => ({ action: 'pass' }), sampleAt: [8000],
    assert: async ({ check }) => {
      const html = await readFile(join(ROOT, 'index.html'), 'utf8');
      const vj = JSON.parse(await readFile(join(ROOT, 'version.json'), 'utf8'));
      const build = (html.match(/var BUILD = '([^']+)'/) || [])[1];
      const appjsV = (html.match(/var APPJS_V = '(\d+)'/) || [])[1];
      const tagV = (html.match(/app\.js\?v=(\d+)/) || [])[1];
      check('manifest still linked', /rel="manifest"/.test(html) || /manifest\.webmanifest/.test(html));
      check('BUILD matches version.json', build === vj.build, build + ' vs ' + vj.build);
      check('APPJS_V matches the script tag', appjsV === tagV, appjsV + ' vs ' + tagV);
      check('APPJS_V matches version.json.appjs', Number(appjsV) === vj.appjs, appjsV + ' vs ' + vj.appjs);
      check('bundle referenced by the tag exists on disk', !!(await readFile(join(ROOT, 'app.js')).catch(() => null)));
      check('no Service Worker is registered by Aurix', !/serviceWorker\s*\.\s*register/.test(html));
    },
  });
} finally {
  const failed = RESULTS.filter(r => !r.pass);
  console.log(`\n════ BOOTSTRAP/PWA HARNESS · ${RESULTS.length - failed.length}/${RESULTS.length} passed ════`);
  if (failed.length) failed.forEach(f => console.log(`  FAIL [${f.scenario}] ${f.name} ${f.detail}`));
  try { chrome.kill('SIGKILL'); } catch (_) {}
  try { server.close(); } catch (_) {}
  try { rmSync(profile, { recursive: true, force: true }); } catch (_) {}
  process.exit(failed.length ? 1 : 0);
}
