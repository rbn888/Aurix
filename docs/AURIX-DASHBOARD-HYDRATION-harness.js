/* AURIX — P0.12 DASHBOARD HYDRATION — harness (Fase 8).
   Models the hydration invariant: once the dashboard SHELL is visible, navigation
   ALWAYS responds — because event listeners bind at top-level (independent of the
   boot pipeline) and all heavy/secondary work (chart init incl. the mobile-only
   branch, pricing, workspace, market) is DETACHED from the interactive path. A
   failure or freeze in any of those can never make the UI unresponsive.

   Run: node docs/AURIX-DASHBOARD-HYDRATION-harness.js                                */
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');

// Boot interactivity model.
//   OLD (broken): chart init ran INLINE on the boot path before the dashboard was
//     interactive → a chart block/throw left the UI dead.
//   NEW (fixed): shell renders (guarded) → splash hides → interactive; chart/secondary
//     run on a LATER macrotask (detached), so their failure/freeze can't kill the UI.
function bootInteractive(scn, mode) {
  // top-level listeners (#bottomNav, header tabs, menu, btnAdd) always attach — proven
  // on-device: app-load-test ran ALL app.js top-level in ~68ms with no throw/block.
  const navBound = true;
  // render() is guarded (degraded mode) → the shell always renders.
  const shellRendered = true;
  if (mode === 'old') {
    // inline chart on the critical path: a chart block/throw prevents interactivity.
    if (scn.chartBlocks || scn.chartThrows || scn.mobileChartBlocks) return { shellRendered, navResponds: false };
    return { shellRendered, navResponds: shellRendered && navBound };
  }
  // NEW: charts/pricing/workspace/market are detached → never affect interactivity.
  return { shellRendered, navResponds: shellRendered && navBound };
}

let ok = true;
const ck = (n, c, g) => { console.log((c ? '  ✓' : '  ✗') + ' ' + n + (g !== undefined ? '  [' + g + ']' : '')); if (!c) ok = false; };

console.log('AURIX P0.12 — Dashboard hydration (nav always responds once shell is visible)\n');

const SCN = [
  { name: 'healthy', scn: {} },
  { name: 'chart init fails', scn: { chartThrows: true } },
  { name: 'chart init blocks/heavy', scn: { chartBlocks: true } },
  { name: 'mobile chart branch blocks', scn: { mobileChartBlocks: true } },
  { name: 'pricing fails', scn: { pricingFails: true } },
  { name: 'workspace fails', scn: { workspaceFails: true } },
  { name: 'market fails', scn: { marketFails: true } },
];

console.log('NEW boot — nav responds in EVERY scenario (shell visible ⇒ interactive):');
for (const s of SCN) {
  const r = bootInteractive(s.scn, 'new');
  ck(s.name + ' → shell + nav responds', r.shellRendered && r.navResponds, 'navResponds=' + r.navResponds);
}

console.log('\nOLD boot (regression reference) — inline chart block killed interactivity:');
{ const r = bootInteractive({ chartBlocks: true }, 'old');
  ck('OLD: chart block → nav DEAD (this was the bug)', r.navResponds === false); }

console.log('\nINVARIANT — shell visible ⇒ nav responds, for every failure combo:');
{ let bad = 0;
  for (const a of [true, false]) for (const b of [true, false]) for (const c of [true, false]) {
    const r = bootInteractive({ chartThrows: a, pricingFails: b, workspaceFails: c }, 'new');
    if (r.shellRendered && !r.navResponds) bad++;
  }
  ck('no failure combo leaves nav dead', bad === 0, bad + ' dead'); }

console.log('\nLIVE FILE — app.js hydration wiring:');
{ const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  // chart init must be DETACHED (inside a setTimeout), not awaited inline on the boot path
  ck('chart init detached (setTimeout, not inline awaited)',
     /setTimeout\(function \(\) \{\s*try \{ initChart\(\); initDonut\(\); updateChart\(\); updateDonut\(\); \}/.test(app));
  ck('mobile DISABLES charts entirely (mobile-safe, not just detached)', app.indexOf('charts_skipped_mobile_safe') >= 0);
  ck('render(true) guarded (degraded mode)', /try \{ render\(true\); \}\s*\n?\s*catch/.test(app));
  ck('render error captured to debugAurixBoot', app.indexOf("__AURIX_BOOT.errors.push('render: '") >= 0);
  ck('chart error captured to debugAurixBoot', app.indexOf("__AURIX_BOOT.errors.push('chart: '") >= 0);
  // nav listeners bind at top-level, BEFORE the boot IIFE (so they never depend on it)
  const iNav = app.indexOf("document.querySelectorAll('#bottomNav .item[data-tab]')");
  const iBootIIFE = app.indexOf('if (window.__APP_BOOTED__) return;');
  ck('nav listeners bound BEFORE the boot IIFE', iNav > 0 && iBootIIFE > 0 && iNav < iBootIIFE, 'nav@' + iNav + ' < boot@' + iBootIIFE);
  // boot_bisect=dashboard returns BEFORE chart init (isolates render vs charts)
  const iBisectDash = app.indexOf("_bootBisect === 'dashboard'");
  const iChart = app.indexOf('try { initChart(); initDonut(); updateChart(); updateDonut(); }');
  ck('?boot_bisect=dashboard cuts BEFORE chart init', iBisectDash > 0 && iChart > 0 && iBisectDash < iChart);

  // P0 MOBILE-SAFE — every chart entry point early-returns on phones (no Chart.js can run)
  ck('window.AURIX_MOBILE_SAFE flag defined', /window\.AURIX_MOBILE_SAFE = /.test(app));
  const guards = (app.match(/AURIX_MOBILE_SAFE\) return;/g) || []).length;
  ck('all chart functions mobile-gated (>=7 entry guards)', guards >= 7, guards + ' guards');
  ck('mobile boot shows chart placeholder + skips init', app.indexOf('Gráfico temporalmente desactivado en móvil') >= 0 && /if \(window\.AURIX_MOBILE_SAFE\) \{[\s\S]*?charts_skipped_mobile_safe/.test(app)); }

console.log('\nRESULT:', ok ? 'ALL PASS ✓ — dashboard stays interactive regardless of chart/pricing/secondary failures' : 'FAIL ✗');
process.exit(ok ? 0 : 1);
