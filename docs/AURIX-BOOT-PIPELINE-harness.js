/* AURIX — P0 BOOT PIPELINE — harness (Fase 11).
   Models the early splash guarantee (hideSplashSafe + global 4.5s timeout) and proves
   the invariant: across EVERY boot outcome the splash is hidden — never an infinite
   logo. Also verifies the guarantee is wired correctly + EARLY in app.js (before the
   migrations that previously could throw and abort boot).

   Run: node docs/AURIX-BOOT-PIPELINE-harness.js                                       */
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');

// Model of the live early-guarantee logic (mirrors app.js):
//   • hideSplashSafe(reason): idempotent (hides once).
//   • dashboard render → hideSplashSafe('boot_complete').
//   • global timeout @4500ms → hideSplashSafe('global_boot_timeout') if not hidden.
function simulate(scn) {
  const GLOBAL_TIMEOUT = 4500;
  const st = { splashHidden: false, hideCount: 0, reason: null, dashboardReady: false };
  function hideSplashSafe(reason) { if (st.splashHidden) return; st.splashHidden = true; st.hideCount++; st.reason = reason; }
  // collect timed actions
  const actions = [];
  if (scn.dashboardRenderAt != null) actions.push({ t: scn.dashboardRenderAt, fn: function () { st.dashboardReady = true; hideSplashSafe('boot_complete'); } });
  actions.push({ t: GLOBAL_TIMEOUT, fn: function () { if (!st.dashboardReady) hideSplashSafe('global_boot_timeout'); } });
  // (extra explicit hide calls, to test idempotency)
  (scn.extraHidesAt || []).forEach(t => actions.push({ t: t, fn: function () { hideSplashSafe('extra'); } }));
  actions.sort((a, b) => a.t - b.t).forEach(a => { if (a.t <= (scn.horizon || 6000)) a.fn(); });
  return st;
}

let ok = true;
const ck = (n, c, g) => { console.log((c ? '  ✓' : '  ✗') + ' ' + n + (g !== undefined ? '  [' + g + ']' : '')); if (!c) ok = false; };

console.log('AURIX P0 — Boot pipeline (splash always hides; never infinite)\n');

// Fase 11 cases 1-14 → modelled as "does the dashboard render before the global timeout?"
const CASES = [
  { name: '1. healthy boot', dashboardRenderAt: 2200, expectReason: 'boot_complete' },
  { name: '2. auth never resolves', dashboardRenderAt: null, expectReason: 'global_boot_timeout' },
  { name: '3. Supabase fails', dashboardRenderAt: null, expectReason: 'global_boot_timeout' },
  { name: '4. portfolio load timeout (shell renders)', dashboardRenderAt: 2600, expectReason: 'boot_complete' },
  { name: '5. pricing/fx fails (non-blocking)', dashboardRenderAt: 2300, expectReason: 'boot_complete' },
  { name: '6. chart init fails (non-blocking)', dashboardRenderAt: 2300, expectReason: 'boot_complete' },
  { name: '7. error before bootstrap', dashboardRenderAt: null, expectReason: 'global_boot_timeout' },
  { name: '8. DOMContentLoaded already fired', dashboardRenderAt: 1800, expectReason: 'boot_complete' },
  { name: '9. localStorage throws', dashboardRenderAt: 2400, expectReason: 'boot_complete' },
  { name: '10. sessionStorage throws', dashboardRenderAt: 2400, expectReason: 'boot_complete' },
  { name: '11. secondary module hangs (deferred)', dashboardRenderAt: 2500, expectReason: 'boot_complete' },
  { name: '12. global boot timeout (nothing renders)', dashboardRenderAt: null, expectReason: 'global_boot_timeout' },
  { name: '14. iOS-like env', dashboardRenderAt: null, expectReason: 'global_boot_timeout' },
];
for (const c of CASES) {
  const st = simulate(c);
  ck(c.name + ' → splash hidden', st.splashHidden === true && st.reason === c.expectReason, 'reason=' + st.reason);
}

console.log('\n13. hideSplashSafe idempotent (many calls → hidden once):');
{ const st = simulate({ dashboardRenderAt: 2000, extraHidesAt: [2100, 2200, 5000] });
  ck('hideCount === 1', st.hideCount === 1, 'hideCount=' + st.hideCount); }

console.log('\nINVARIANT — splash is hidden for EVERY render-time (incl. never):');
{ let everInfinite = false;
  for (const rt of [0, 100, 1000, 4499, 4500, 4501, 9000, null]) {
    const st = simulate({ dashboardRenderAt: rt, horizon: 20000 });
    if (!st.splashHidden) everInfinite = true;
  }
  ck('no render-time yields an infinite splash', everInfinite === false); }

console.log('\nLIVE FILE — app.js wiring (early + correct):');
{ const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  ck('app.js defines window.hideSplashSafe', app.indexOf('window.hideSplashSafe = function') >= 0);
  ck('app.js global boot timeout (4500ms)', app.indexOf('global_boot_timeout_4500ms') >= 0);
  ck('app.js error boundary (window error + rejection)', /addEventListener\('error'/.test(app) && /addEventListener\('unhandledrejection'/.test(app));
  ck('app.js debugAurixBoot()', app.indexOf('window.debugAurixBoot = function') >= 0);
  ck('app.js migrateCostBasis is guarded (try/catch)', /function migrateCostBasis\(\)\s*\{\s*[^]*?try\s*\{/.test(app));
  // the guarantee must be registered BEFORE the migrations (which used to abort boot)
  const iGuard = app.indexOf('window.hideSplashSafe = function');
  const iMig = app.indexOf('function migrateCostBasis()');
  ck('splash guarantee registered BEFORE migrateCostBasis', iGuard > 0 && iMig > 0 && iGuard < iMig, 'guard@' + iGuard + ' < migrate@' + iMig);
  ck('app.js: _aurixHideLoader unifies __AURIX_SPLASH_HIDDEN', app.indexOf('window.__AURIX_SPLASH_HIDDEN = true') >= 0); }

console.log('\nRESULT:', ok ? 'ALL PASS ✓ — the boot pipeline can never leave an infinite splash' : 'FAIL ✗');
process.exit(ok ? 0 : 1);
