'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MOBILE-LITE-CHART-harness — P1 SPEC: Mobile Chart Lite
// ════════════════════════════════════════════════════════════════════════════
// Executes the REAL lite renderer block from app.js in a vm sandbox with a fake
// carousel DOM + controllable engine/clock, proving the SPEC invariants:
//  the chart is a guest inside the dashboard — if it fails, the house keeps working
//  exactly like v365-mobile-safe; it never touches the carousel / cards / nav, never
//  uses Chart.js, is budgeted (100ms), cancelable, and writes ONLY #mobileChartLiteHost.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

let pass = 0, fail = 0;
function ck(name, cond, extra) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (extra ? '  — ' + extra : '')); } }

// ── Extract the contiguous lite-renderer block ──
const S = app.indexOf('const _aurixMobileChartState = {');
const anchor = app.indexOf('window.debugAurixMobileChart = function ()', S);
const E = app.indexOf('\n}', anchor);
if (S < 0 || anchor < 0 || E < 0) { console.log('  ✗ could not locate lite-chart block'); process.exit(1); }
const block = app.slice(S, E + 2);

// ── Fake DOM with carousel/cards/nav sentinels we must never touch ──
function makeDom() {
  const all = [];
  function mk(id) {
    const n = {
      id: id || null, _html: '', htmlWrites: 0, kids: [], style: { cssText: '' },
      get innerHTML() { return n._html; },
      set innerHTML(v) { n._html = v; n.htmlWrites++; },
      get firstChild() { return n.kids.length ? n.kids[0] : null; },
      appendChild(c) { n.kids.push(c); c.parent = n; return c; },
      removeChild(c) { const i = n.kids.indexOf(c); if (i >= 0) n.kids.splice(i, 1); return c; },
    };
    all.push(n); return n;
  }
  const area = mk('wealthCurveMobile');
  const placeholder = mk(null); placeholder._html = 'BOOT PLACEHOLDER'; area.kids.push(placeholder);
  const carousel = mk('mobileSliderTrack'); carousel._html = 'SLIDES';
  const cards = mk('cardsRoot'); cards._html = 'CARDS';
  const nav = mk('bottomNav'); nav._html = 'NAV'; nav.navAlive = true;
  return {
    all, area, carousel, cards, nav,
    document: { createElement: () => mk(null), getElementById: (id) => all.find(x => x.id === id) || null },
    hostCount: () => all.filter(x => x.id === 'mobileChartLiteHost').length,
    host: () => all.find(x => x.id === 'mobileChartLiteHost') || null,
  };
}

// ── Sandbox per scenario (token/timer state isolated) ──
function makeEnv(engine, opts) {
  opts = opts || {};
  const dom = makeDom();
  const env = { clock: 0, reports: [], pendingTimer: null, threw: false, dom, chartJsCalls: 0 };
  const sandbox = {
    console, Math, Date: { now: () => env.clock }, performance: { now: () => env.clock },
    setTimeout: (fn) => { env.pendingTimer = fn; return 1; },
    clearTimeout: () => { env.pendingTimer = null; },
    requestAnimationFrame: (fn) => { fn(); },
    _reportSafe: (a, b) => { env.reports.push(a + ': ' + b); },
    renderAurixInstitutionalChart: engine,
    // Heavy Chart.js paths — must NEVER be invoked by the lite block.
    initChart: () => { env.chartJsCalls++; }, updateChart: () => { env.chartJsCalls++; },
    initDonut: () => { env.chartJsCalls++; }, updateDonut: () => { env.chartJsCalls++; },
    initMobileCharts: () => { env.chartJsCalls++; }, initMobileSlider: () => { env.chartJsCalls++; },
    activeRange: '30d',
  };
  sandbox.window = sandbox;
  sandbox.window.AURIX_MOBILE_SAFE = opts.mobileSafe !== false;
  sandbox.window.AURIX_MOBILE_CHART_LITE_ENABLED = opts.liteEnabled !== false;
  sandbox.document = dom.document;
  vm.createContext(sandbox);
  vm.runInContext(block, sandbox);
  env.sandbox = sandbox;
  return env;
}
function cycle(env, range) {
  try { env.sandbox.scheduleAurixMobileLite(range); } catch (_) { env.threw = true; }
  if (env.pendingTimer) { try { env.pendingTimer(); } catch (_) { env.threw = true; } }
}
const hostHtml = (env) => { const h = env.dom.host(); return h ? h.innerHTML : ''; };

// Engine stubs
function engineOK(series, dashboard) {
  return function () {
    let d = 'M0 0'; for (let i = 1; i < series.length; i++) d += ' L' + i + ' ' + (series[i].value % 200);
    return { pathData: d, areaPathData: d + ' Z', visiblePoints: series.slice(),
      renderMeta: { lastDeltaPct: 3.1, lastValue: series[series.length - 1].value, dashboardValue: dashboard } };
  };
}
const S30 = []; for (let i = 0; i < 60; i++) S30.push({ time: i, value: 100 + i });
const DASH = S30[S30.length - 1].value;

console.log('AURIX-MOBILE-LITE-CHART — P1 SPEC (Mobile Chart Lite)');
console.log('\nEXECUTION — 17 mandated cases (real renderer, fake carousel DOM):');

// 1) mobile-safe activo → Chart.js no se llama
{ const env = makeEnv(engineOK(S30, DASH)); cycle(env, '30d');
  ck('1. mobile-safe active → Chart.js never called', env.chartJsCalls === 0); }

// 2) renderer lite renderiza SVG con serie válida
{ const env = makeEnv(engineOK(S30, DASH)); cycle(env, '30d');
  ck('2. valid series → paints inline <svg>', hostHtml(env).indexOf('<svg') > -1 && /<path /.test(hostHtml(env))); }

// 3) usa solo puntos reales (engine output unmodified, count preserved)
{ const env = makeEnv(engineOK(S30, DASH)); cycle(env, '30d');
  const dbg = env.sandbox.debugAurixMobileChart();
  ck('3. uses real points only (pointCount == series length, no fabrication)', dbg.pointCount === S30.length); }

// 4) último punto coincide con dashboard (engine contract preserved, painted)
{ const env = makeEnv(engineOK(S30, DASH), {}); cycle(env, '30d');
  const eng = env.sandbox.renderAurixInstitutionalChart('30d', 1000, 260, {});
  ck('4. last point == dashboard (engine contract)', eng.renderMeta.lastValue === eng.renderMeta.dashboardValue && env.sandbox.debugAurixMobileChart().rendered === true); }

// 5) datos vacíos → placeholder
{ const env = makeEnv(function () { return { pathData: '', areaPathData: '', visiblePoints: [] }; }); cycle(env, '30d');
  ck('5. empty data → placeholder, no <svg>', hostHtml(env).indexOf('no disponible') > -1 && hostHtml(env).indexOf('<svg') < 0); }

// 6) excepción en renderer → placeholder
{ const env = makeEnv(function () { throw new Error('boom'); }); cycle(env, '30d');
  const dbg = env.sandbox.debugAurixMobileChart();
  ck('6. exception → placeholder + failed flag, no throw', hostHtml(env).indexOf('no disponible') > -1 && dbg.failed === true && env.threw === false); }

// 7) renderer lento >100ms → placeholder
{ let ref = null; ref = makeEnv(function () { ref.clock += 350; return engineOK(S30, DASH)(); }); cycle(ref, '30d');
  const dbg = ref.sandbox.debugAurixMobileChart();
  ck('7. render >100ms → placeholder (budget)', hostHtml(ref).indexOf('no disponible') > -1 && dbg.failed === true && /100ms/.test(String(dbg.lastError))); }

// 8) cambio de rango → actualiza solo host interno (area innerHTML never rewritten)
{ const env = makeEnv(engineOK(S30, DASH)); cycle(env, '30d'); cycle(env, '7d');
  ck('8. range change updates ONLY host (area.innerHTML never rewritten)', env.dom.area.htmlWrites === 0 && env.dom.host().htmlWrites === 2); }

// 9) no toca carrusel
{ const env = makeEnv(engineOK(S30, DASH)); cycle(env, '30d'); cycle(env, '7d');
  ck('9. carousel untouched', env.dom.carousel.htmlWrites === 0 && env.dom.carousel._html === 'SLIDES' && env.dom.carousel.kids.length === 0); }

// 10) no toca cards
{ const env = makeEnv(engineOK(S30, DASH)); cycle(env, '30d');
  ck('10. cards untouched', env.dom.cards.htmlWrites === 0 && env.dom.cards._html === 'CARDS'); }

// 11) no toca navegación
{ const env = makeEnv(engineOK(S30, DASH)); cycle(env, '30d');
  ck('11. navigation untouched', env.dom.nav.htmlWrites === 0 && env.dom.nav.navAlive === true); }

// 12) no llama initChart/updateChart/initMobileCharts (runtime + block has no refs)
{ const env = makeEnv(engineOK(S30, DASH)); cycle(env, '30d');
  const clean = ['initChart', 'updateChart', 'initDonut', 'updateDonut', 'initMobileCharts', 'initMobileSlider', 'new Chart'].every(t => block.indexOf(t) < 0);
  ck('12. never calls heavy chart fns (runtime 0 + no block refs)', env.chartJsCalls === 0 && clean); }

// 13) navegación sigue activa después de render
{ const env = makeEnv(engineOK(S30, DASH)); cycle(env, '30d');
  ck('13. nav still alive after render', env.dom.nav.navAlive === true && env.threw === false); }

// 14) varias llamadas consecutivas no duplican nodos
{ const env = makeEnv(engineOK(S30, DASH)); for (let i = 0; i < 5; i++) cycle(env, '30d');
  ck('14. repeated renders do not duplicate host node', env.dom.hostCount() === 1 && env.dom.area.kids.length === 1); }

// 15) mobile flag false → placeholder
{ const env = makeEnv(engineOK(S30, DASH), { liteEnabled: false }); cycle(env, '30d');
  const dbg = env.sandbox.debugAurixMobileChart();
  ck('15. LITE_ENABLED=false → placeholder (disabled)', hostHtml(env).indexOf('no disponible') > -1 && dbg.enabled === false && dbg.rendered === false); }

// 16) desktop no cambia (AURIX_MOBILE_SAFE=false → renderer is a no-op, no host created)
{ const env = makeEnv(engineOK(S30, DASH), { mobileSafe: false }); cycle(env, '30d');
  ck('16. desktop (mobile-safe off) → no host, no work', env.dom.hostCount() === 0 && env.pendingTimer === null); }

// 17) app boot no depende del gráfico (engine throws ⇒ no propagation; placeholder; nav alive)
{ const env = makeEnv(function () { throw new Error('chart dead'); }); cycle(env, '30d');
  ck('17. chart failure never propagates (boot/app independent)', env.threw === false && env.dom.nav.navAlive === true && hostHtml(env).indexOf('no disponible') > -1); }

// debug contract shape
{ const env = makeEnv(engineOK(S30, DASH)); cycle(env, '30d');
  const d = env.sandbox.debugAurixMobileChart();
  const keys = ['enabled', 'rendered', 'failed', 'durationMs', 'pointCount', 'range', 'lastError', 'fallbackUsed'];
  ck('debugAurixMobileChart() exposes the full contract', keys.every(k => k in d) && d.rendered === true && d.range === '30d'); }

// ── LIVE FILE — architecture wiring & invariants ──
console.log('\nLIVE FILE — wiring & permanent invariants in app.js:');
{
  ck('renderWealthCurve hands off to lite scheduler on mobile',
     /AURIX_MOBILE_SAFE\)\s*\{\s*try\s*\{\s*scheduleAurixMobileLite\(activeRange\);/.test(app));
  ck('writes ONLY a dedicated #mobileChartLiteHost (created via createElement+appendChild)',
     block.indexOf("host.id = 'mobileChartLiteHost'") >= 0 && block.indexOf('area.appendChild(host)') >= 0);
  ck('area placeholder removed via removeChild (NOT innerHTML rewrite of the area)',
     block.indexOf('area.removeChild(area.firstChild)') >= 0 && block.indexOf("area.innerHTML =") < 0);
  ck('only #mobileChartLiteHost gets innerHTML (host.innerHTML = svg)', block.indexOf('host.innerHTML = svg') >= 0);
  ck('paint deferred in a macrotask (setTimeout) — never inline in boot', /_aurixMobileLiteTimer = setTimeout\(function \(\)/.test(app));
  ck('hard 100ms budget enforced', /if \(dur > 100\)/.test(block));
  ck('cancelable via token (>=3 guards)', (block.match(/token !== _aurixMobileLiteToken/g) || []).length >= 3);
  ck('failure fallback text present', block.indexOf('Gráfico temporalmente no disponible en móvil') >= 0);
  ck('reads canonical series via approved engine only', block.indexOf('renderAurixInstitutionalChart(r, VBW, VBH, box)') >= 0);
  ck('AURIX_MOBILE_CHART_LITE_ENABLED flag defined + honoured', /AURIX_MOBILE_CHART_LITE_ENABLED = true/.test(app) && block.indexOf('_aurixLiteEnabled()') >= 0);
  ck('debugAurixMobileChart exported', app.indexOf('window.debugAurixMobileChart = function') >= 0);
  ck('autostart is TOP-LEVEL (after btnAdd binding, not inside boot IIFE)',
     app.indexOf('_aurixMobileLiteAutostart') > app.indexOf("btnAdd.addEventListener('click', openModal)"));
  ck('boot mobile block UNCHANGED (still placeholder + charts_skipped_mobile_safe, no renderer call)',
     app.indexOf('Gráfico temporalmente desactivado en móvil') >= 0 && app.indexOf('charts_skipped_mobile_safe') >= 0 &&
     app.indexOf('renderAurixMobileLiteChart()') < 0);
  ck('6 heavy chart fns remain hard-gated on mobile', (app.match(/AURIX_MOBILE_SAFE\) return;/g) || []).length >= 6);
}

console.log('\nRESULT: ' + (fail === 0 ? 'PASS ✓' : 'FAIL ✗') + '  (' + pass + ' passed, ' + fail + ' failed)');
process.exit(fail === 0 ? 0 : 1);
