'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MOBILE-CHART-harness — P1 Mobile Safe Rendering Contract
// ════════════════════════════════════════════════════════════════════════════
// Proves the lightweight mobile SVG renderer honours all 8 permanent invariants:
// it NEVER throws, NEVER blocks, is budgeted (100ms) + cancelable, and on ANY
// failure / timeout / empty data / cancellation leaves a placeholder while the
// rest of the app is untouched.
//
// Strategy: extract the REAL mobile-chart block from app.js and execute it in a
// vm sandbox with (a) a controllable clock, (b) a controllable engine stub
// (renderAurixInstitutionalChart) so we can inject slow / throwing / empty / huge
// / never-ending behaviour, and (c) fake DOM hosts. The engine itself is validated
// separately (RENDER-CANONICAL-EQUIVALENCE); here we test the SAFETY WRAPPER.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

let pass = 0, fail = 0;
function ck(name, cond, extra) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (extra ? '  — ' + extra : '')); } }

// ── Extract the contiguous mobile-chart block (declarations → window export) ──
const START = 'let _aurixMobileChartToken = 0;';
const ENDMARK = 'window.renderAurixMobileChartNow = renderAurixMobileChartNow; }';
const s = app.indexOf(START), e = app.indexOf(ENDMARK);
if (s < 0 || e < 0) { console.log('  ✗ could not locate mobile-chart block in app.js'); process.exit(1); }
const block = app.slice(s, e + ENDMARK.length);

// ── Build a fresh sandbox per scenario so token/timer state never leaks ──
function makeEnv(engine) {
  const hosts = {
    wealthCurveMobile: { innerHTML: '' },
    perfSnapshot: { innerHTML: '' },
  };
  const env = {
    clock: 0,            // ms, advanced by the engine stub to simulate render cost
    reports: [],
    pendingTimer: null,  // captured setTimeout callback (run manually)
    rafCount: 0,
    threw: false,
    hosts,
  };
  const sandbox = {
    console,
    Date: { now: () => env.clock },
    Math,
    performance: { now: () => env.clock },
    setTimeout: (fn) => { env.pendingTimer = fn; return 1; },
    clearTimeout: () => { env.pendingTimer = null; },
    requestAnimationFrame: (fn) => { env.rafCount++; fn(); },
    _reportSafe: (a, b) => { env.reports.push(a + ': ' + b); },
    renderAurixInstitutionalChart: engine,
    activeRange: '30d',
  };
  sandbox.window = sandbox;
  sandbox.window.AURIX_MOBILE_SAFE = true;
  sandbox.document = { getElementById: (id) => hosts[id] || null };
  vm.createContext(sandbox);
  vm.runInContext(block, sandbox);
  env.sandbox = sandbox;
  return env;
}

// Drive a full Fase-B cycle: schedule → run captured macrotask (→ rAF → paint).
function cycle(env, range) {
  try { env.sandbox.scheduleAurixMobileChart(range); } catch (_) { env.threw = true; }
  if (env.pendingTimer) { try { env.pendingTimer(); } catch (_) { env.threw = true; } }
}
const hostHtml = (env) => env.hosts.wealthCurveMobile.innerHTML;

console.log('AURIX-MOBILE-CHART — P1 Mobile Safe Rendering Contract');
console.log('\nEXECUTION — safety wrapper under every failure mode (engine stubbed):');

// 1) NORMAL — valid series renders a native SVG (no Chart.js), under budget
{ const env = makeEnv(function () {
    const pts = []; for (let i = 0; i < 60; i++) pts.push({ time: i, value: 100 + i });
    return { pathData: 'M0 0 L1 1 L2 2 L3 3', areaPathData: 'M0 0 L1 1 Z', visiblePoints: pts, renderMeta: { lastDeltaPct: 2.4 } };
  });
  cycle(env, '30d');
  ck('normal series paints inline <svg>', hostHtml(env).indexOf('<svg') === 0 || hostHtml(env).indexOf('<svg') > -1);
  ck('normal render uses NO Chart.js (pure svg markup)', hostHtml(env).indexOf('canvas') < 0 && /<path /.test(hostHtml(env)));
  ck('normal render does not throw', env.threw === false);
  ck('both hosts painted (mobile + snapshot)', env.hosts.perfSnapshot.innerHTML.indexOf('<svg') > -1);
}

// 2) UP vs DOWN tone — stroke colour follows lastDeltaPct sign
{ const up = makeEnv(function () { return { pathData: 'M0 0 L1 1 L2 2', areaPathData: 'M0 0 Z', visiblePoints: [{time:0,value:1},{time:1,value:2}], renderMeta: { lastDeltaPct: 5 } }; });
  cycle(up, '30d');
  const down = makeEnv(function () { return { pathData: 'M0 0 L1 1 L2 2', areaPathData: 'M0 0 Z', visiblePoints: [{time:0,value:2},{time:1,value:1}], renderMeta: { lastDeltaPct: -5 } }; });
  cycle(down, '30d');
  ck('positive delta → green stroke', hostHtml(up).indexOf('#34d39e') > -1);
  ck('negative delta → red stroke', hostHtml(down).indexOf('#ff6b6b') > -1);
}

// 3) ENGINE THROWS (e.g. memory/exception) → placeholder, captured, no throw
{ const env = makeEnv(function () { throw new Error('out of memory'); });
  cycle(env, '30d');
  ck('engine exception → placeholder "no disponible"', hostHtml(env).indexOf('Gráfico no disponible') > -1);
  ck('engine exception captured to _reportSafe', env.reports.some(r => r.indexOf('mobile-chart') === 0 && r.indexOf('out of memory') > -1));
  ck('engine exception NEVER throws out', env.threw === false);
}

// 4) EMPTY data → placeholder, no svg
{ const env = makeEnv(function () { return { pathData: '', areaPathData: '', visiblePoints: [] }; });
  cycle(env, '30d');
  ck('empty series → placeholder, no <svg>', hostHtml(env).indexOf('Gráfico no disponible') > -1 && hostHtml(env).indexOf('<svg') < 0);
}

// 5) SINGLE point (insufficient history) → friendly placeholder
{ const env = makeEnv(function () { return { pathData: 'M0 0', areaPathData: 'M0 0', visiblePoints: [{ time: 0, value: 1 }] }; });
  cycle(env, '30d');
  ck('single point → "Aún no hay suficiente historial"', hostHtml(env).indexOf('Aún no hay suficiente historial') > -1);
}

// 6) BUDGET exceeded (slow / never-ending render simulated via clock) → cancel + placeholder
{ let envRef = null;
  // The sandbox clock is read through performance.now() → env.clock; the engine stub
  // bumps it by 350ms to stand in for a slow / never-ending render.
  envRef = makeEnv(function () { envRef.clock += 350; const pts = []; for (let i = 0; i < 200; i++) pts.push({ time: i, value: i }); return { pathData: 'M0 0 L1 1 L2 2 L3 3', areaPathData: 'M0 0 Z', visiblePoints: pts, renderMeta: { lastDeltaPct: 1 } }; });
  cycle(envRef, '30d');
  ck('render over 100ms budget → placeholder (cancel)', hostHtml(envRef).indexOf('Gráfico no disponible') > -1);
  ck('budget breach reported with ms', envRef.reports.some(r => r.indexOf('budget exceeded') > -1));
  ck('budget breach never throws', envRef.threw === false);
}

// 7) FAST huge series (thousands of points) → still paints, under budget
{ let envRef = null;
  envRef = makeEnv(function () { envRef.clock += 8; const pts = []; let d = 'M0 0'; for (let i = 0; i < 5000; i++) { pts.push({ time: i, value: (i * 7) % 311 }); d += ' L' + i + ' ' + ((i * 3) % 200); } return { pathData: d, areaPathData: d + ' Z', visiblePoints: pts, renderMeta: { lastDeltaPct: 0.3 } }; });
  cycle(envRef, 'total');
  ck('5000-point series within budget → paints <svg>', hostHtml(envRef).indexOf('<svg') > -1);
  ck('huge series records render ms metric', typeof envRef.sandbox.window.__aurixMobileChartMs === 'number');
}

// 8) CANCELLATION — a newer schedule supersedes an in-flight one (orientation / refresh / tab churn)
{ let envRef = null; let calls = 0;
  envRef = makeEnv(function () { calls++; return { pathData: 'M0 0 L1 1 L2 2', areaPathData: 'M0 0 Z', visiblePoints: [{time:0,value:1},{time:1,value:2}], renderMeta: { lastDeltaPct: 1 } }; });
  // Schedule #1, capture its timer WITHOUT running it.
  try { envRef.sandbox.scheduleAurixMobileChart('30d'); } catch (_) { envRef.threw = true; }
  const staleTimer = envRef.pendingTimer;
  // Schedule #2 (bumps token, replaces timer).
  try { envRef.sandbox.scheduleAurixMobileChart('7d'); } catch (_) { envRef.threw = true; }
  // Run the STALE timer first — must be canceled (token mismatch) → no paint, engine not called.
  try { staleTimer(); } catch (_) { envRef.threw = true; }
  ck('stale (superseded) render is canceled — no paint', hostHtml(envRef).indexOf('<svg') < 0);
  ck('stale render did NOT invoke the engine', calls === 0);
  // Now run the latest timer → paints.
  try { envRef.pendingTimer(); } catch (_) { envRef.threw = true; }
  ck('latest render paints', hostHtml(envRef).indexOf('<svg') > -1);
  ck('cancellation flow never throws', envRef.threw === false);
}

// 9) OFF mobile-safe → scheduler is a strict no-op (desktop untouched)
{ let envRef = null;
  envRef = makeEnv(function () { return { pathData: 'M0 0 L1 1', areaPathData: 'M0 0 Z', visiblePoints: [{time:0,value:1},{time:1,value:2}], renderMeta: { lastDeltaPct: 1 } }; });
  envRef.sandbox.window.AURIX_MOBILE_SAFE = false;
  try { envRef.sandbox.scheduleAurixMobileChart('30d'); } catch (_) { envRef.threw = true; }
  ck('AURIX_MOBILE_SAFE=false → no timer scheduled (no-op)', envRef.pendingTimer === null);
  ck('no-op path never throws', envRef.threw === false);
}

// 10) MISSING hosts (dashboard not present) → silent no-op, never throws
{ let envRef = null;
  envRef = makeEnv(function () { return { pathData: 'M0 0 L1 1', areaPathData: 'M0 0 Z', visiblePoints: [{time:0,value:1},{time:1,value:2}], renderMeta: { lastDeltaPct: 1 } }; });
  envRef.sandbox.document.getElementById = () => null;
  cycle(envRef, '30d');
  ck('no hosts present → no throw, no work', envRef.threw === false);
}

// ── LIVE FILE — architecture wiring & invariants ──
console.log('\nLIVE FILE — wiring & permanent invariants in app.js:');
{
  ck('renderWealthCurve hands off to scheduler on mobile (no heavy paint)',
     /AURIX_MOBILE_SAFE\)\s*\{\s*try\s*\{\s*scheduleAurixMobileChart\(activeRange\);/.test(app));
  ck('boot mobile block schedules Fase B (deferred, after placeholder)',
     app.indexOf('charts_skipped_mobile_safe') >= 0 &&
     app.indexOf('charts_skipped_mobile_safe') < app.indexOf('try { scheduleAurixMobileChart(); } catch (_) {}'));
  ck('paint runs in a DEFERRED macrotask (setTimeout) — never inline in boot',
     /_aurixMobileChartTimer = setTimeout\(function \(\)/.test(app));
  ck('Invariant: 100ms performance budget enforced', /if \(dt > 100\)/.test(app));
  ck('Invariant: cancelable via token (>=3 guards)', (app.match(/token !== _aurixMobileChartToken/g) || []).length >= 3);
  ck('Invariant: failure → placeholder fallback', app.indexOf("_aurixMobileChartPlaceholder('Gráfico no disponible')") >= 0);
  ck('Invariant: renderer fully try/catch wrapped (never throws)',
     /function renderAurixMobileChartNow\(range, token\) \{\s*try \{/.test(app));
  ck('Mobile renderer never calls Chart.js (no initChart/new Chart/updateChart inside block)',
     block.indexOf('new Chart') < 0 && block.indexOf('initChart') < 0 && block.indexOf('updateChart') < 0 && block.indexOf('initMobileCharts') < 0);
  ck('Uses the canonical series via the pure engine (renderAurixInstitutionalChart)',
     block.indexOf('renderAurixInstitutionalChart(range, VBW, VBH, box)') >= 0);
  ck('Render-time metric exposed for live validation (window.__aurixMobileChartMs)',
     block.indexOf('window.__aurixMobileChartMs') >= 0);
  // The 6 heavy chart fns stay hard-gated (no-op) on mobile; renderWealthCurve hands off.
  ck('6 heavy chart fns remain hard-gated on mobile', (app.match(/AURIX_MOBILE_SAFE\) return;/g) || []).length >= 6);
}

console.log('\nRESULT: ' + (fail === 0 ? 'PASS ✓' : 'FAIL ✗') + '  (' + pass + ' passed, ' + fail + ' failed)');
process.exit(fail === 0 ? 0 : 1);
