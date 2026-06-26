'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MOBILE-DASHBOARD-CONTRACT-harness — permanent mobile render contract +
// carousel/donut (SPEC §4, points 1-12)
// ════════════════════════════════════════════════════════════════════════════
// Proves: the dashboard's first paint is decoupled from data — the splash represents
// only shell-build time; cards show immediately (skeleton), nav is live, data hydrates
// the cards without rebuilding the shell, the carousel swipe works with a LIGHTWEIGHT
// touch handler (no Chart.js), and the donut slide renders a native SVG (or a clean
// placeholder). Executes the real functions in a vm sandbox + live-file checks.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

let pass = 0, fail = 0;
function ck(name, cond, extra) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (extra ? '  — ' + extra : '')); } }
function fnSrc(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing ' + name); let k = app.indexOf('{', i), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(i, k); }

function makeNode(id) {
  const n = {
    id: id || null, _html: '', htmlWrites: 0, kids: [], classes: new Set(), attrs: {}, style: { cssText: '', opacity: '' }, textContent: '',
    get innerHTML() { return n._html; }, set innerHTML(v) { n._html = v; n.htmlWrites++; },
    get firstChild() { return n.kids.length ? n.kids[0] : null; },
    appendChild(c) { n.kids.push(c); return c; },
    insertBefore(c, ref) { const i = ref ? n.kids.indexOf(ref) : -1; if (i >= 0) n.kids.splice(i, 0, c); else n.kids.unshift(c); return c; },
    removeChild(c) { const i = n.kids.indexOf(c); if (i >= 0) n.kids.splice(i, 1); return c; },
    setAttribute(k, v) { n.attrs[k] = String(v); }, getAttribute(k) { return n.attrs[k] != null ? n.attrs[k] : null; }, removeAttribute(k) { delete n.attrs[k]; },
    classList: { add(c) { n.classes.add(c); }, remove(c) { n.classes.delete(c); }, contains(c) { return n.classes.has(c); }, toggle(c, on) { if (on) n.classes.add(c); else n.classes.delete(c); } },
    addEventListener() {}, querySelectorAll() { return []; },
  };
  return n;
}

console.log('AURIX-MOBILE-DASHBOARD-CONTRACT — render contract + carousel/donut');
console.log('\nEXECUTION — render contract (shell-first reveal + skeleton):');

const cS = app.indexOf('let _aurixRenderContractApplied = false;');
const cE = app.indexOf('// ── AURIX-READY-FIRST-1');
if (cS < 0 || cE < 0) { console.log('  ✗ render-contract block not found'); process.exit(1); }
const contractBlock = app.slice(cS, cE);

function runContract(opts) {
  opts = opts || {};
  const appRoot = makeNode('appRoot'); const assetsList = makeNode('assetsList'); const body = makeNode('body');
  const nodes = { appRoot, assetsList };
  const ls = {}; if (opts.session) ls['sb-abc-auth-token'] = JSON.stringify({ access_token: 'x'.repeat(40) });
  const env = { splashHidden: false, splashReason: null };
  const sandbox = {
    console,
    localStorage: { get length() { return Object.keys(ls).length; }, key: (i) => Object.keys(ls)[i] || null, getItem: (k) => ls[k] || null },
    location: { pathname: opts.pathname || '/index.html' },
    document: { getElementById: (id) => nodes[id] || null, body, querySelector: () => null, createElement: () => makeNode(null) },
  };
  sandbox.window = sandbox;
  sandbox.window.AURIX_MOBILE_SAFE = opts.mobileSafe !== false;
  sandbox.window.hideSplashSafe = function (r) { env.splashHidden = true; env.splashReason = r; };
  sandbox.window.__AURIX_BOOT = { mark: function () {} };
  vm.createContext(sandbox);
  vm.runInContext(contractBlock, sandbox);
  return { appRoot, assetsList, body, env, sandbox };
}

{ const r = runContract({ mobileSafe: true, session: true });
  ck('1. shell revealed immediately (appRoot opacity → 1)', r.appRoot.style.opacity === '1');
  ck('2. splash cleared on shell-first (not on data)', r.env.splashHidden === true && r.env.splashReason === 'shell_first');
  ck('2b. skeleton cards painted (body.aurix-skeleton + skel rows in #assetsList)',
     r.body.classList.contains('aurix-skeleton') && /aurix-skel-row/.test(r.assetsList.innerHTML) && r.assetsList.getAttribute('data-aurix-skel') === '1'); }

{ const r = runContract({ mobileSafe: true, session: true });
  r.sandbox._aurixClearCardSkeleton();
  ck('3. _aurixClearCardSkeleton drops skeleton on data hydrate (no shell rebuild)', !r.body.classList.contains('aurix-skeleton') && r.assetsList.getAttribute('data-aurix-skel') === null); }

{ const r = runContract({ mobileSafe: false, session: true });
  ck('12. desktop (mobile-safe off) → contract no-op (no reveal/splash/skeleton)',
     r.appRoot.style.opacity === '' && r.env.splashHidden === false && !r.body.classList.contains('aurix-skeleton')); }

{ const r = runContract({ mobileSafe: true, session: false });
  ck('1b. logged-out → shell-first does NOT fire (no dashboard flash before login)',
     r.appRoot.style.opacity === '' && r.env.splashHidden === false); }

console.log('\nEXECUTION — lightweight SVG donut (no Chart.js):');
const donutSrc = fnSrc('renderAurixMobileDonutLite');
function runDonut(dist) {
  const wrap = makeNode(null); const cv = makeNode('donutCenterValMobile'); const cs = makeNode('donutCenterSubMobile'); const legend = makeNode('distributionLegendMobile');
  const nodes = { donutCenterValMobile: cv, donutCenterSubMobile: cs, distributionLegendMobile: legend };
  const sandbox = {
    console, Math,
    TYPE_META: { crypto: { label: 'Cripto', color: '#2563EB' }, stock: { label: 'Acciones', color: '#EA580C' }, cash: { label: 'Liquidez', color: '#16A34A' }, other: { label: 'Otros', color: '#6b7280' } },
    getInvestableDistribution: () => dist,
    investableValueBase: () => 12345, formatShort: (v) => '$' + v,
    document: { querySelector: (sel) => sel === '.mobile-donut-wrap' ? wrap : null, getElementById: (id) => nodes[id] || wrap.kids.find(k => k.id === id) || null, createElement: () => makeNode(null) },
  };
  sandbox.window = sandbox; sandbox.window.AURIX_MOBILE_SAFE = true;
  vm.createContext(sandbox);
  vm.runInContext(donutSrc + '\nthis.__run = renderAurixMobileDonutLite;', sandbox);
  sandbox.__run();
  return { wrap, cv, cs, legend, host: wrap.kids.find(k => k.id === 'mobileDonutLiteHost') };
}

{ const d = runDonut([{ type: 'crypto', valueBase: 6000, pct: 60 }, { type: 'cash', valueBase: 4000, pct: 40 }]);
  ck('5. donut shows the total (center value from canonical investable base)', d.cv.textContent === '$12345');
  ck('7. donut renders native SVG ring (no Chart.js) from canonical distribution',
     !!d.host && d.host.innerHTML.indexOf('<svg') > -1 && /<circle /.test(d.host.innerHTML));
  ck('6. donut LEGEND restored — categories + colours', /legend-item/.test(d.legend.innerHTML) && d.legend.innerHTML.indexOf('Cripto') > -1 && d.legend.innerHTML.indexOf('#2563EB') > -1);
  ck('7c. donut legend shows PERCENTAGES per category', /60\.0%/.test(d.legend.innerHTML) && /40\.0%/.test(d.legend.innerHTML)); }
{ const d = runDonut(null);
  ck('7b. donut with no data → placeholder visible (slide never looks broken)',
     !!d.host && d.host.innerHTML.indexOf('Distribución no disponible') > -1 && d.host.innerHTML.indexOf('<svg') < 0); }
{ const d = runDonut([{ type: 'crypto', valueBase: 6000, pct: 60 }]);
  ck('11. donut via createElement+insertBefore (no carousel innerHTML rebuild)',
     d.wrap.htmlWrites === 0 && d.wrap.kids.some(k => k.id === 'mobileDonutLiteHost')); }

console.log('\nLIVE FILE — contract wiring & permanent invariants:');
const sliderFn = fnSrc('initMobileSlider');
const bootIIFE = '(async () => {\n  if (window.__APP_BOOTED__)';
ck('§1 _aurixApplyRenderContract is THE render-contract entry (reveal + splash + skeleton)',
   contractBlock.indexOf("hideSplashSafe('shell_first')") >= 0 && contractBlock.indexOf('_aurixPaintCardSkeleton()') >= 0);
ck('§1 contract gated to mobile-safe + cached session (desktop + logged-out safe)',
   contractBlock.indexOf('!window.AURIX_MOBILE_SAFE') >= 0 && contractBlock.indexOf('_aurixHasCachedSession()') >= 0);
ck('§1 contract applied at module scope BEFORE the boot IIFE (decoupled from boot pipeline)',
   app.indexOf('_aurixApplyRenderContract();') > 0 && app.indexOf('_aurixApplyRenderContract();') < app.indexOf(bootIIFE));
ck('§3 boot clears skeleton AFTER first render(true) (hydrate, no shell rebuild)',
   /render\(true\); \}\s*\n\s*catch \(e\) \{[\s\S]{0,400}_aurixClearCardSkeleton\(\)/.test(app));
ck('§4 nav listeners bind at module scope BEFORE the boot IIFE (nav live with the shell)',
   app.indexOf("querySelectorAll('#bottomNav .item[data-tab]')") < app.indexOf(bootIIFE));
ck('§5 carousel swipe re-enabled: initMobileSlider NOT gated by AURIX_MOBILE_SAFE + has touch handlers',
   sliderFn.indexOf('AURIX_MOBILE_SAFE) return') < 0 && /touchstart/.test(sliderFn) && /touchmove/.test(sliderFn) && /touchend/.test(sliderFn));
ck('§5 swipe drives translateX + bound exactly once (no listener duplication)',
   /translateX\(/.test(sliderFn) && sliderFn.indexOf('__AURIX_MOBILE_SLIDER_BOUND__') >= 0 && /_aurixMobileSliderBoot/.test(app));
ck('§6 dots updated by the slider (goTo toggles .m-dot active)',
   /dots\.forEach\([\s\S]{0,90}toggle\('active'/.test(sliderFn));
// Cards inferiores (category grid) — updateDonut is gated on mobile, so its mobile branch
// must drive updateCategoryCards (which OWNS #categoriesSection visibility); + the boot
// scheduler also rebuilds them. updateCategoryCards itself carries NO mobile-safe gate.
const updateDonutFn = fnSrc('updateDonut');
ck('CARDS: updateDonut mobile branch drives renderAurixMobileDonutLite + updateCategoryCards',
   /AURIX_MOBILE_SAFE\) \{[\s\S]{0,400}renderAurixMobileDonutLite\(\)[\s\S]{0,200}updateCategoryCards\(\)[\s\S]{0,80}return;/.test(updateDonutFn));
ck('CARDS: boot/scheduler deferred pass rebuilds the category cards',
   /renderAurixMobileDonutLite\(\); \} catch \(_\) \{\}\s*\n\s*try \{ updateCategoryCards\(\)/.test(app));
ck('CARDS: updateCategoryCards has NO mobile-safe gate (safe to run on phones)',
   fnSrc('updateCategoryCards').indexOf('AURIX_MOBILE_SAFE') < 0);
ck('§8 Chart.js still blocked on mobile (6 heavy fns hard-gated)', (app.match(/AURIX_MOBILE_SAFE\) return;/g) || []).length >= 6);
ck('§9 carousel boot does NOT call initMobileCharts / updateChart / updateDonut',
   app.indexOf('function _aurixMobileSliderBoot') >= 0 &&
   !/_aurixMobileSliderBoot[\s\S]{0,400}(initMobileCharts|updateChart|updateDonut)\(/.test(app));
ck('§10 lite chart + donut hosts are pointer-events:none (no gesture interception)', app.indexOf('pointer-events:none') >= 0);
ck('§11 donut writes ONLY #mobileDonutLiteHost (createElement+insertBefore, no carousel innerHTML)',
   donutSrc.indexOf("host.id = 'mobileDonutLiteHost'") >= 0 && donutSrc.indexOf('wrap.insertBefore(host') >= 0 &&
   donutSrc.indexOf('.mobile-slider-track') < 0 && /querySelector\('\.mobile-donut-wrap'\)/.test(donutSrc));
ck('§12 donut + slider gated to mobile-safe (desktop untouched)',
   donutSrc.indexOf('!window.AURIX_MOBILE_SAFE') >= 0 && /_aurixMobileSliderBoot\(\)[\s\S]{0,160}!window\.AURIX_MOBILE_SAFE/.test(app));
ck('skeleton CSS present + reduced-motion guarded', css.indexOf('body.aurix-skeleton') >= 0 && /aurixSkelShimmer/.test(css) && /prefers-reduced-motion[\s\S]{0,170}aurix-skel-bar/.test(css));
ck('mobile chart lite still intact (renderAurixMobileLiteChart + #mobileChartLiteHost)',
   app.indexOf('function renderAurixMobileLiteChart') >= 0 && app.indexOf('#mobileChartLiteHost') >= 0);

console.log('\nRESULT: ' + (fail === 0 ? 'PASS ✓' : 'FAIL ✗') + '  (' + pass + ' passed, ' + fail + ' failed)');
process.exit(fail === 0 ? 0 : 1);
