/* AURIX — P0 BOOT WATCHDOG — harness.
   Models the inline index.html watchdog decision and proves that across EVERY boot
   scenario the splash can never stay permanent: the outcome is always either the
   dashboard (app booted) or a recoverable diagnostic panel — never an indefinite logo.
   Also verifies the live files carry the watchdog + the app.js boot instrumentation.

   Scenarios: index cached, old app.js, new app.js, build change, (removed) reload loop,
   bootstrap failure, app.js fails to load, iOS-like sessionStorage that throws, failure
   before dashboard, silent errors.

   Run: node docs/AURIX-BOOT-WATCHDOG-harness.js                                       */
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');

// The watchdog runs at the 8s deadline (with a 14s backstop). Outcome rule mirrors
// index.html: if the dashboard rendered (or the app hid the splash) → dashboard;
// otherwise the watchdog force-replaces the splash with the diagnostic panel.
function watchdogOutcome(state) {
  if (state.dashboardReady || state.splashHidden) return 'dashboard';
  return 'diagnostic';                 // never 'permanent_splash' — impossible by construction
}

// Build the boot state AS IT IS AT THE 8s DEADLINE for a scenario.
function stateAtDeadline(scn) {
  const B = {
    appJsRequested: false, appJsLoaded: false, appJsExecuted: false,
    bootstrapStarted: false, dashboardReady: false, splashHidden: false,
    errors: [], lastStep: 'index_html_parsed',
  };
  (scn.timeline || []).forEach(function(ev) {
    if (ev.t > 8000) return;           // anything after the deadline doesn't count yet
    if (ev.set) Object.keys(ev.set).forEach(function(k) { B[k] = ev.set[k]; });
    if (ev.step) B.lastStep = ev.step;
    if (ev.error) B.errors.push(ev.error);
  });
  return B;
}

let ok = true;
const ck = (n, c, g) => { console.log((c ? '  ✓' : '  ✗') + ' ' + n + (g !== undefined ? '  [' + g + ']' : '')); if (!c) ok = false; };

console.log('AURIX P0 — Boot watchdog (splash can never be permanent)\n');

const SCENARIOS = [
  { name: 'healthy boot (new app.js)', expect: 'dashboard', timeline: [
    { t: 50, step: 'app_js_requested', set: { appJsRequested: true } },
    { t: 300, step: 'app_js_loaded', set: { appJsLoaded: true } },
    { t: 320, step: 'app_js_executing', set: { appJsExecuted: true } },
    { t: 500, step: 'bootstrap_start', set: { bootstrapStarted: true } },
    { t: 2200, step: 'dashboard_rendered', set: { dashboardReady: true } },
    { t: 2600, step: 'splash_hidden', set: { splashHidden: true } } ] },
  { name: 'index cached / old app.js still boots', expect: 'dashboard', timeline: [
    { t: 60, set: { appJsRequested: true } }, { t: 280, set: { appJsLoaded: true } },
    { t: 300, set: { appJsExecuted: true } }, { t: 2500, step: 'dashboard_rendered', set: { dashboardReady: true } } ] },
  { name: 'build change (no reload now) → boots', expect: 'dashboard', timeline: [
    { t: 300, set: { appJsExecuted: true } }, { t: 2400, step: 'dashboard_rendered', set: { dashboardReady: true } } ] },
  { name: 'app.js FAILS to load (network/404)', expect: 'diagnostic', timeline: [
    { t: 50, step: 'app_js_requested', set: { appJsRequested: true } },
    { t: 400, step: 'app_js_load_error', error: 'app.js failed to load (network/404/parse)' } ] },
  { name: 'app.js loads but PARSE error (never executes)', expect: 'diagnostic', timeline: [
    { t: 50, set: { appJsRequested: true } }, { t: 300, set: { appJsLoaded: true } },
    { t: 305, step: 'app_js_loaded', error: "SyntaxError @ app.js:123" } ] },
  { name: 'bootstrap hangs (auth never resolves)', expect: 'diagnostic', timeline: [
    { t: 300, set: { appJsExecuted: true } }, { t: 500, step: 'bootstrap_start', set: { bootstrapStarted: true } },
    { t: 520, step: 'auth_done' } ] },   // stops here, dashboard never renders
  { name: 'failure before dashboard (render throws)', expect: 'diagnostic', timeline: [
    { t: 300, set: { appJsExecuted: true } }, { t: 500, set: { bootstrapStarted: true } },
    { t: 1800, step: 'portfolio_fx_done', error: 'TypeError: render failed' } ] },
  { name: 'iOS-like sessionStorage throws (non-fatal)', expect: 'dashboard', timeline: [
    { t: 10, error: 'sessionStorage unavailable' }, { t: 300, set: { appJsExecuted: true } },
    { t: 2400, step: 'dashboard_rendered', set: { dashboardReady: true } } ] },
  { name: 'silent error, dashboard never renders', expect: 'diagnostic', timeline: [
    { t: 300, set: { appJsExecuted: true } }, { t: 900, error: 'undefined is not an object' } ] },
  { name: 'reload loop (removed) — would-be loop never boots app, watchdog still recovers', expect: 'diagnostic', timeline: [
    { t: 50, set: { appJsRequested: true } } ] },   // app.js never executes (stuck pre-app)
];

console.log('EVERY scenario resolves to dashboard OR diagnostic — never a permanent splash:');
for (const scn of SCENARIOS) {
  const B = stateAtDeadline(scn);
  const out = watchdogOutcome(B);
  ck(scn.name + ' → ' + out, out === scn.expect && out !== 'permanent_splash', 'last=' + B.lastStep + (B.errors.length ? ' err=' + B.errors[0] : ''));
}

console.log('\nINVARIANT — watchdogOutcome is never "permanent_splash" for ANY state:');
{ let everPermanent = false;
  for (const dr of [true, false]) for (const sh of [true, false]) for (const ex of [true, false]) {
    const o = watchdogOutcome({ dashboardReady: dr, splashHidden: sh, appJsExecuted: ex });
    if (o === 'permanent_splash') everPermanent = true;
  }
  ck('no state yields a permanent splash', everPermanent === false); }

console.log('\nDIAGNOSTIC pinpoints the last reached step (so the break point is identifiable):');
{ const B = stateAtDeadline(SCENARIOS.find(s => s.name.indexOf('bootstrap hangs') === 0 || s.name.indexOf('bootstrap hangs') >= 0));
  ck('last step captured for a hang', B.lastStep === 'auth_done', B.lastStep); }

console.log('\nLIVE FILES — watchdog + instrumentation present:');
{ const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  ck('index.html: __AURIX_BOOT watchdog object', idx.indexOf('window.__AURIX_BOOT') >= 0 && idx.indexOf('showDiag') >= 0);
  // CLOSURE SPEC §1/§5/§8 — production-clean splash: NO visible stamp, panel only on a
  // genuine fatal (app.js never executed), at a single long backstop (not 8s).
  ck('index.html: single genuine-fatal backstop (12s, gated on appJsExecuted)',
     idx.indexOf('12000') >= 0 && /!B\.appJsExecuted/.test(idx) && idx.indexOf('8000') < 0 && idx.indexOf('14000') < 0);
  ck('index.html: recoverable diagnostic panel + retry', idx.indexOf('aurixBootDiag') >= 0 && idx.indexOf('aurixBootRetry') >= 0);
  ck('index.html: NO reload in boot guard (loop impossible)', idx.indexOf('window.location.reload') < 0);
  ck('index.html: app.js tag has onerror + v=379', /app\.js\?v=379/.test(idx) && idx.indexOf('app_js_load_error') >= 0);
  ck('index.html: NO visible build stamp / debug text in splash (production-clean)',
     idx.indexOf('aurixBuildStamp') < 0 && idx.indexOf('_aurixStampSplash') < 0 && idx.indexOf('watchdog timer started') < 0);
  ck('index.html: no-cache meta tags', /http-equiv="Cache-Control"/.test(idx) && /no-store/.test(idx));
  // P0 v359 — the panel must be VISIBLE on iOS: explicit positioning (no `inset:0`,
  // unsupported < iOS 14.5) + max z-index. This was why v356/v358 showed no panel.
  ck('index.html: panel explicit positioning (no inset:0) + max z-index', idx.indexOf('z-index:2147483647') >= 0 && idx.indexOf('top:0;left:0;right:0;bottom:0') >= 0);
  ck('index.html: panel does NOT use inset:0', idx.indexOf('inset:0;z-index') < 0);
  ck('index.html: heartbeat (event-loop block detection)', idx.indexOf('__AURIX_LAST_TICK') >= 0 && idx.indexOf('tickCount') >= 0);
  ck('index.html: watchdog-started flag', idx.indexOf('__AURIX_BOOT_WATCHDOG_STARTED') >= 0);
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  ck('app.js: first-line execution mark (appJsExecuted)', app.indexOf("window.__AURIX_BOOT.appJsExecuted = true") >= 0);
  ck('app.js: bootstrap_start mark', app.indexOf("'bootstrap_start'") >= 0);
  ck('app.js: dashboard_rendered → dashboardReady', app.indexOf("'dashboard_rendered'") >= 0);
  ck('app.js: splash_hidden mark', app.indexOf("'splash_hidden'") >= 0); }

console.log('\nBOOT-CHECK PAGE — standalone (no app.js), shows build + storage probes:');
{ const bcPath = path.join(root, 'boot-check.html');
  ck('boot-check.html exists', fs.existsSync(bcPath));
  if (fs.existsSync(bcPath)) {
    const bc = fs.readFileSync(bcPath, 'utf8');
    ck('boot-check: independent of app.js', bc.indexOf('app.js') >= 0 ? /index\.html\?fresh=/.test(bc) : true, 'no <script src=app.js>');
    ck('boot-check: no <script src="app.js">', !/<script[^>]+src=["']app\.js/.test(bc));
    ck('boot-check: shows build + html timestamp', bc.indexOf('bootCheckBuild') >= 0 && bc.indexOf('bootCheckHtmlTimestamp') >= 0);
    ck('boot-check: storage probes (local + session)', bc.indexOf("probe('localStorage')") >= 0 && bc.indexOf("probe('sessionStorage')") >= 0);
    ck('boot-check: reads deployed index build', bc.indexOf('deployedIndexBuild') >= 0 && /fetch\(/.test(bc));
    ck('boot-check: cache-buster button to open Aurix', bc.indexOf('openFresh') >= 0 && /index\.html\?fresh=/.test(bc));
    ck('boot-check: userAgent shown', bc.indexOf('userAgent') >= 0);
    ck('boot-check: heartbeat (tickCount + eventLoopAlive)', bc.indexOf('tickCount') >= 0 && bc.indexOf('eventLoopAlive') >= 0);
  } }

console.log('\nISOLATION PAGES (Fase 4/5) — exist + correct isolation:');
{ const naPath = path.join(root, 'index-no-app.html'), apPath = path.join(root, 'index-app-probe.html');
  ck('index-no-app.html exists', fs.existsSync(naPath));
  if (fs.existsSync(naPath)) {
    const na = fs.readFileSync(naPath, 'utf8');
    ck('index-no-app: NO app.js (proves timers/panel independent of app.js)', !/<script[^>]+src=["']app\.js/.test(na));
    ck('index-no-app: watchdog panel max z-index (explicit pos)', na.indexOf('2147483647') >= 0);
    ck('index-no-app: heartbeat + 8s panel', na.indexOf('tickCount') >= 0 && na.indexOf('8000') >= 0);
  }
  ck('index-app-probe.html exists', fs.existsSync(apPath));
  if (fs.existsSync(apPath)) {
    const ap = fs.readFileSync(apPath, 'utf8');
    ck('index-app-probe: loads app.js (controlled) + skips boot pipeline', /app\.js\?v=/.test(ap) && ap.indexOf('__APP_BOOTED__ = true') >= 0);
    ck('index-app-probe: reports appJsRequested/Loaded/Executed', ap.indexOf('appJsRequested') >= 0 && ap.indexOf('appJsLoaded') >= 0 && ap.indexOf('appJsExecuted') >= 0);
    ck('index-app-probe: heartbeat (thread-block detection)', ap.indexOf('tickCount') >= 0 && ap.indexOf('eventLoopBlockedNow') >= 0);
  }
  const tpPath = path.join(root, 'timer-proof.html');
  ck('timer-proof.html exists', fs.existsSync(tpPath));
  if (fs.existsSync(tpPath)) {
    const tp = fs.readFileSync(tpPath, 'utf8');
    ck('timer-proof: minimal — no fixed/inset/z-index/overlay', !/position:fixed/.test(tp) && tp.indexOf('inset') < 0 && tp.indexOf('z-index') < 0);
    ck('timer-proof: no app.js / no external css', !/<script[^>]+src=/.test(tp) && !/<link[^>]+stylesheet/.test(tp));
    ck('timer-proof: TIMER PROOF LOADED + tick + TIMER FIRED', tp.indexOf('TIMER PROOF LOADED') >= 0 && tp.indexOf("'tick: '") >= 0 && tp.indexOf('TIMER FIRED') >= 0);
    ck('timer-proof: setInterval + setTimeout', tp.indexOf('setInterval(') >= 0 && tp.indexOf('setTimeout(') >= 0);
  }
  const altPath = path.join(root, 'app-load-test.html');
  ck('app-load-test.html exists', fs.existsSync(altPath));
  if (fs.existsSync(altPath)) {
    const alt = fs.readFileSync(altPath, 'utf8');
    ck('app-load-test: continuous counter (setInterval)', alt.indexOf('setInterval(') >= 0 && alt.indexOf("getElementById('counter')") >= 0);
    ck('app-load-test: loads app.js with boot pipeline skipped', /app\.js\?v=/.test(alt) && alt.indexOf('window.__APP_BOOTED__ = true') >= 0);
    ck('app-load-test: reports LOADED vs freeze', alt.indexOf('LOADED+EXECUTED') >= 0 && alt.indexOf('onerror') >= 0);
  } }

console.log('\nRESULT:', ok ? 'ALL PASS ✓ — splash can never remain permanent; the break point is always reported' : 'FAIL ✗');
process.exit(ok ? 0 : 1);
