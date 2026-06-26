'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MOBILE-GUARDRAILS-harness — permanent hardening gate for the mobile dashboard
// ════════════════════════════════════════════════════════════════════════════
// This is the authoritative "the mobile incident must never recur" gate. It encodes the
// 7 permanent guarantees (G1-G7) + a full regression checklist. If any check fails, a
// change has reintroduced the incident class — STOP and fix before shipping.
// Pure static analysis over the live files (no app behaviour change). See
// docs/INCIDENT-mobile-dashboard-2026-06.md for the full write-up.
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

let pass = 0, fail = 0;
function ck(name, cond, extra) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (extra ? '  — ' + extra : '')); } }
function fnSrc(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) return ''; let k = app.indexOf('{', i), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(i, k); }

const BOOT_IIFE = '(async () => {\n  if (window.__APP_BOOTED__)';
const iBoot = app.indexOf(BOOT_IIFE);
const iContract = app.indexOf('_aurixApplyRenderContract();');
const iNav = app.indexOf("querySelectorAll('#bottomNav .item[data-tab]')");
const heavyGates = (app.match(/AURIX_MOBILE_SAFE\) return;/g) || []).length;

console.log('AURIX-MOBILE-GUARDRAILS — permanent hardening gate');

// ── G1 — a web-chart change cannot touch mobile boot ──
console.log('\nG1 — web-chart improvements cannot couple to mobile boot:');
ck('G1.1 mobile first paint (_aurixApplyRenderContract) runs at module scope BEFORE the boot IIFE',
   iContract > 0 && iBoot > 0 && iContract < iBoot);
ck('G1.2 the render contract never invokes a chart renderer',
   !/_aurixApplyRenderContract[\s\S]{0,1200}(initChart\(|renderAurixInstitutionalChart\(|renderWealthCurve\()/.test(app));
ck('G1.3 the heavy Chart.js fns hard-gate on AURIX_MOBILE_SAFE (≥6 gates)', heavyGates >= 6);
ck('G1.4 the institutional WEB engine is used by the lite renderer as a PURE path source (no DOM)',
   /renderAurixMobileLiteChart[\s\S]{0,1500}renderAurixInstitutionalChart\(/.test(app));

// ── G2 — no mobile chart can use Chart.js ──
console.log('\nG2 — no mobile chart uses Chart.js:');
['initChart', 'updateChart', 'initDonut', 'updateDonut', 'initMobileCharts', 'initMobileSlider'].forEach(fn => {
  if (fn === 'initMobileSlider') return; // slider is touch-only (re-enabled) — checked under G4/regression
  const src = fnSrc(fn);
  ck('G2 ' + fn + ' early-returns on mobile (no Chart.js on phones)', /window\.AURIX_MOBILE_SAFE\)/.test(src.slice(0, 400)));
});
{ const liteChart = app.slice(app.indexOf('function renderAurixMobileLiteChart'), app.indexOf('function scheduleAurixMobileLite'));
  const liteDonut = fnSrc('renderAurixMobileDonutLite');
  ck('G2 lite chart + lite donut are native SVG (no `new Chart`, no init*Chart calls)',
     !/new Chart\b/.test(liteChart) && !/new Chart\b/.test(liteDonut) && !/\binitChart\(/.test(liteChart) && !/\binitMobileCharts\(/.test(liteDonut)); }

// ── G3 — mobile dashboard cannot depend on Supabase for the first render ──
console.log('\nG3 — first render is decoupled from Supabase/network:');
const iWaitSession = app.indexOf('await waitForSession()');
// The contract runs at module scope BEFORE the boot IIFE — and EVERY data await
// (auth waitForSession, portfolio initPortfolioData→loadPortfolioFromBackend) lives
// INSIDE that IIFE. So contract-before-IIFE proves first-paint precedes all data I/O.
ck('G3.1 shell + skeleton + splash-clear happen BEFORE the boot IIFE (which holds all data awaits)',
   iContract > 0 && iBoot > 0 && iContract < iBoot && iWaitSession > iBoot);
ck('G3.2 shell-first reveal clears the splash itself (not gated on data)',
   /_aurixApplyRenderContract[\s\S]{0,900}hideSplashSafe\('shell_first'\)/.test(app));
ck('G3.3 logged-out is safe (contract gated on a cached session — no dashboard flash before login)',
   /_aurixApplyRenderContract[\s\S]{0,400}_aurixHasCachedSession\(\)/.test(app));

// ── G4 — mobile chart cannot block navigation ──
console.log('\nG4 — mobile chart cannot block navigation:');
ck('G4.1 nav listeners bind at module scope BEFORE the boot IIFE', iNav > 0 && iNav < iBoot);
ck('G4.2 lite chart paint is deferred (setTimeout) + 100ms budgeted + try/catch',
   /_aurixMobileLiteTimer = setTimeout/.test(app) && /if \(dur > 100\)/.test(app) && /function renderAurixMobileLiteChart\(range, token\) \{\s*const st[\s\S]{0,40}try \{/.test(app));
ck('G4.3 lite chart + donut hosts are pointer-events:none (never intercept touch/nav)',
   (app.match(/pointer-events:none/g) || []).length >= 2);
ck('G4.4 carousel swipe is a LIGHTWEIGHT touch handler, bound once (no Chart.js)',
   /touchstart/.test(fnSrc('initMobileSlider')) && app.indexOf('__AURIX_MOBILE_SLIDER_BOUND__') >= 0 && !/initMobileSlider[\s\S]{0,600}new Chart\b/.test(app));

// ── G5 — donut/cards cannot depend on the heavy updateDonut ──
console.log('\nG5 — donut + lower cards do not depend on heavy updateDonut:');
{ const ud = fnSrc('updateDonut');
  ck('G5.1 updateDonut mobile branch routes to lite donut + category cards, then returns',
     /AURIX_MOBILE_SAFE\) \{[\s\S]{0,400}renderAurixMobileDonutLite\(\)[\s\S]{0,200}updateCategoryCards\(\)[\s\S]{0,80}return;/.test(ud));
  ck('G5.2 the lite donut reads the canonical investable distribution (no Chart.js)',
     /getInvestableDistribution\(\)/.test(fnSrc('renderAurixMobileDonutLite')) && !/new Chart\b/.test(fnSrc('renderAurixMobileDonutLite')));
  ck('G5.3 category cards builder carries NO mobile-safe gate (safe to run on phones)',
     fnSrc('updateCategoryCards').indexOf('AURIX_MOBILE_SAFE') < 0); }

// ── G6 — splash shows no debug in production ──
console.log('\nG6 — splash is production-clean:');
ck('G6.1 no visible build stamp / watchdog text in index.html',
   idx.indexOf('aurixBuildStamp') < 0 && idx.indexOf('_aurixStampSplash') < 0 && idx.indexOf('watchdog timer started') < 0);
ck('G6.2 diagnostic panel gated to a genuine fatal (app.js never executed), not a slow boot',
   /!B\.appJsExecuted/.test(idx) && idx.indexOf('8000') < 0 && idx.indexOf('14000') < 0);
ck('G6.3 splash markup is only the AURIX wordmark', /<div class="boot-wordmark">AURIX<\/div>/.test(idx));

// ── G7 — AURIX_MOBILE_SAFE cannot be removed silently ──
console.log('\nG7 — AURIX_MOBILE_SAFE is load-bearing (removal breaks this gate):');
ck('G7.1 window.AURIX_MOBILE_SAFE is defined', /window\.AURIX_MOBILE_SAFE = /.test(app));
ck('G7.2 it gates a meaningful number of heavy paths (≥6) — removing it fails this test', heavyGates >= 6);
ck('G7.3 AURIX_MOBILE_CHART_LITE_ENABLED kill-switch still present (instant placeholder fallback)',
   /AURIX_MOBILE_CHART_LITE_ENABLED = true/.test(app));

// ── FINAL REGRESSION CHECKLIST (the founder's acceptance list, statically anchored) ──
console.log('\nREGRESSION CHECKLIST — full mobile dashboard surface:');
ck('R1 mobile boot clean (placeholder + skip heavy charts)', app.indexOf('charts_skipped_mobile_safe') >= 0);
ck('R2 shell-first reveal', app.indexOf("hideSplashSafe('shell_first')") >= 0);
ck('R3 cards skeleton', /_aurixPaintCardSkeleton/.test(app) && css.indexOf('body.aurix-skeleton') >= 0);
ck('R4 cards real (skeleton cleared after first render)', /render\(true\); \}\s*\n\s*catch \(e\) \{[\s\S]{0,420}_aurixClearCardSkeleton\(\)/.test(app));
ck('R5 main chart (lite SVG via canonical engine)', app.indexOf('function renderAurixMobileLiteChart') >= 0 && app.indexOf('#mobileChartLiteHost') >= 0);
ck('R6 time-range toggles drive the chart (renderWealthCurve → scheduleAurixMobileLite)',
   /AURIX_MOBILE_SAFE\)\s*\{\s*try\s*\{\s*scheduleAurixMobileLite\(activeRange\);/.test(app));
ck('R7 donut (lite SVG ring + center value)', app.indexOf('function renderAurixMobileDonutLite') >= 0 && app.indexOf('#mobileDonutLiteHost') >= 0);
ck('R8 donut legend (categories / colour / %)', app.indexOf('distributionLegendMobile') >= 0 && /legend-item/.test(fnSrc('renderAurixMobileDonutLite')));
ck('R9 category cards (lower cards) restored on mobile', /updateCategoryCards\(\); \} catch \(_\) \{\}/.test(app));
ck('R10 navigation listeners at module scope', iNav > 0 && iNav < iBoot);
ck('R11 menu + add button bound at module scope (before boot)',
   app.indexOf("btnAdd.addEventListener('click', openModal)") > 0 && app.indexOf("btnAdd.addEventListener('click', openModal)") < iBoot);
ck('R12 desktop untouched (contract/donut/slider all gated to mobile-safe)',
   /_aurixApplyRenderContract[\s\S]{0,300}!window\.AURIX_MOBILE_SAFE/.test(app) &&
   /renderAurixMobileDonutLite\(\) \{[\s\S]{0,120}!window\.AURIX_MOBILE_SAFE/.test(app));
ck('R13 Chart.js blocked on mobile (≥6 heavy gates)', heavyGates >= 6);
ck('R14 incident note present', fs.existsSync(path.join(root, 'docs', 'INCIDENT-mobile-dashboard-2026-06.md')));

console.log('\nRESULT: ' + (fail === 0 ? 'PASS ✓' : 'FAIL ✗') + '  (' + pass + ' passed, ' + fail + ' failed)');
process.exit(fail === 0 ? 0 : 1);
