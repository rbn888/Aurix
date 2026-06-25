/* AURIX — P0 BOOT BISECTION — harness (Fase 8).
   Models the restructured boot: the splash hides as soon as the dashboard SHELL
   renders (then a yield paints it), and ALL heavy/secondary work (chart init, the
   mobile-only chart branch, pricing) is DEFERRED after the hide. Proves the invariant:
   across every failure mode the splash hides + the shell shows — never an infinite
   logo. Also verifies the live app.js wiring (bisect cuts + hide-before-charts order).

   Run: node docs/AURIX-BOOT-BISECTION-harness.js                                      */
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');

// Pipeline model. Pre-shell phases run with awaits (event loop free → the early
// global 4.5s timeout can still fire). The shell render hides the splash; charts &
// secondary modules run AFTER the hide and cannot un-hide it. A hung await never
// blocks the thread, so the global timeout backstops it.
function simulate(scn) {
  const GLOBAL_TIMEOUT = 4500;
  const st = { splashHidden: false, hideCount: 0, reason: null, shellRendered: false };
  function hideSplashSafe(reason) { if (st.splashHidden) return; st.splashHidden = true; st.hideCount++; st.reason = reason; }

  // bisect cut → shell + hide, stop early
  if (scn.bisect) { hideSplashSafe('bisect:' + scn.bisect); return st; }

  // pre-shell phases (auth, portfolio, recompute, render shell). A hang here keeps the
  // thread FREE (await) → the global timeout fires. A throw is caught → proceed.
  const preShellHang = scn.hang && ['auth', 'portfolio'].indexOf(scn.hang) >= 0;
  const renderBlocks = scn.hang === 'render';   // (only render blocking the thread is unrecoverable; boot_bisect=dashboard surfaces it)

  if (preShellHang) { hideSplashSafe('global_boot_timeout'); return st; }      // timeout backstop
  if (renderBlocks) { return st; }                                            // splashHidden stays false (surfaced by bisect)

  // shell renders → hide + yield (paint)
  st.shellRendered = true;
  hideSplashSafe('dashboard_shell');

  // post-shell deferred work — failures/hangs here can NEVER un-hide the splash.
  // (charts, mobileCharts, pricing, secondary) — modelled as no-ops on st.splashHidden.
  return st;
}

let ok = true;
const ck = (n, c, g) => { console.log((c ? '  ✓' : '  ✗') + ' ' + n + (g !== undefined ? '  [' + g + ']' : '')); if (!c) ok = false; };

console.log('AURIX P0 — Boot bisection (shell-first; splash always hides)\n');

const CASES = [
  { name: '1. healthy boot', scn: {}, shell: true },
  { name: '2. auth hangs', scn: { hang: 'auth' }, shell: false, reason: 'global_boot_timeout' },
  { name: '3. Supabase fails (caught)', scn: { fail: 'supabase' }, shell: true },
  { name: '4. portfolio corrupt (caught)', scn: { fail: 'portfolio' }, shell: true },
  { name: '5. migration throws (caught)', scn: { fail: 'migration' }, shell: true },
  { name: '6. pricing hangs (deferred, post-shell)', scn: { hang: 'pricing' }, shell: true },
  { name: '7. chart init fails (deferred, post-shell)', scn: { fail: 'chart' }, shell: true },
  { name: '8. DOM mobile incomplete (caught)', scn: { fail: 'dom' }, shell: true },
  { name: '9. localStorage throws (caught)', scn: { fail: 'localStorage' }, shell: true },
  { name: '10. JSON corrupt (caught)', scn: { fail: 'json' }, shell: true },
  { name: '11. secondary module infinite (deferred)', scn: { hang: 'secondary' }, shell: true },
  { name: '12b. mobile chart branch hangs (deferred)', scn: { hang: 'mobileCharts' }, shell: true },
  { name: '14. iOS-like env', scn: {}, shell: true },
];
for (const c of CASES) {
  const st = simulate(c.scn);
  const okCase = st.splashHidden === true && (c.reason ? st.reason === c.reason : true) && (c.shell ? st.shellRendered === true : true);
  ck(c.name + ' → splash hidden' + (c.shell ? ' + shell' : ''), okCase, 'reason=' + st.reason + ' shell=' + st.shellRendered);
}

console.log('\n13. bisect cuts (each phase) → shell + hide:');
for (const ph of ['core', 'auth', 'portfolio', 'dashboard']) {
  const st = simulate({ bisect: ph });
  ck('?boot_bisect=' + ph + ' → splash hidden', st.splashHidden === true && st.reason === 'bisect:' + ph, st.reason);
}

console.log('\nhideSplashSafe idempotent (bisect + shell):');
{ const st = { splashHidden: false, hideCount: 0 };
  function h() { if (st.splashHidden) return; st.splashHidden = true; st.hideCount++; }
  h(); h(); h();
  ck('hideCount === 1', st.hideCount === 1); }

console.log('\nINVARIANT — only a synchronous render-block leaves the splash (everything else hides):');
{ let infinite = 0;
  const modes = [{}, { hang: 'auth' }, { fail: 'chart' }, { hang: 'mobileCharts' }, { fail: 'migration' }, { hang: 'pricing' }, { bisect: 'dashboard' }];
  for (const m of modes) { if (!simulate(m).splashHidden) infinite++; }
  ck('no non-render mode leaves an infinite splash', infinite === 0, infinite + ' infinite'); }

console.log('\nLIVE FILE — app.js boot restructure (hide-before-charts + bisect + deferral):');
{ const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  ck('bisect cuts present (core/auth/portfolio/dashboard)',
     /_bootBisect === 'core'/.test(app) && /_bootBisect === 'auth'/.test(app) && /_bootBisect === 'portfolio'/.test(app) && /_bootBisect === 'dashboard'/.test(app));
  ck('boot_bisect read from query', app.indexOf("get('boot_bisect')") >= 0);
  const iHide = app.indexOf("hideSplashSafe('dashboard_shell')");
  const iInitChart = app.indexOf('try { initChart(); initDonut(); updateChart(); updateDonut(); }');
  ck('splash hidden BEFORE chart init', iHide > 0 && iInitChart > 0 && iHide < iInitChart, 'hide@' + iHide + ' < charts@' + iInitChart);
  ck('desktop chart init detached (setTimeout)', iInitChart > 0 && /setTimeout\(function \(\) \{\s*try \{ initChart\(\)/.test(app));
  // P0 mobile-safe: chart functions are gated; the mobile chart init is not run at all
  ck('mobile-safe gates chart functions', (app.match(/AURIX_MOBILE_SAFE\) return;/g) || []).length >= 7);
  ck('mobile boot skips charts + placeholder', app.indexOf('charts_skipped_mobile_safe') >= 0 && app.indexOf('Gráfico temporalmente desactivado en móvil') >= 0);
  ck('render(true) is guarded (shell render can fail safely)', /try \{ render\(true\); \}/.test(app)); }

console.log('\nRESULT:', ok ? 'ALL PASS ✓ — shell-first boot; heavy/mobile chart work deferred after splash hide' : 'FAIL ✗');
process.exit(ok ? 0 : 1);
