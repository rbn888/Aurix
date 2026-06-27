'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-WEB-CHART-RC1A-harness — desktop presentation-only finish (RC1-A)
// ════════════════════════════════════════════════════════════════════════════
// RC1-A pulls the desktop web chart toward a TradingView/Wealthica finish using ONLY
// the presentation layer (_wscPaintSurface markup, CSS .wsc-*, tooltip). This harness
// asserts the premium additions are present AND that the SHARED ENGINE is untouched
// (the 6 forbidden functions carry none of the RC1-A markers). The engine's behaviour
// is guarded separately by the INSTITUTIONAL-RENDER / EQUIVALENCE / ADAPTIVE-DENSITY
// harnesses, and mobile by AURIX-MOBILE-GUARDRAILS — all run in the same suite.
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

let pass = 0, fail = 0;
function ck(name, cond, extra) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (extra ? '  — ' + extra : '')); } }
function fnSrc(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) return ''; let k = app.indexOf('{', i), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(i, k); }

const paint = fnSrc('_wscPaintSurface');
const ENGINE_FNS = ['renderAurixInstitutionalChart', 'computeAurixAdaptiveXScale', 'computeAurixValueScale', 'downsampleAurixAdaptive', 'prepareAurixVisualSeries', '_aurixMonotonePath'];

console.log('AURIX-WEB-CHART-RC1A — desktop presentation finish');

console.log('\nPRESENTATION — premium additions present (desktop):');
ck('end marker computed in _wscPaintSurface (% from the LAST RENDERED VERTEX, HTML element)',
   /wsc-last-dot/.test(paint) && /lastRenderedVertex/.test(paint) && /_vx \/ W/.test(paint));
ck('end marker is DESKTOP-only (gated !_isMobile)', /!_isMobile && _n >= 2/.test(paint));
ck('.wsc-last-dot styled + tone variants + pulse', css.indexOf('.wsc-last-dot') >= 0 && /@keyframes wscDotPulse/.test(css) && css.indexOf('.wsc-up   .wsc-last-dot') >= 0);
ck('end-dot pulse disabled under reduced motion', /prefers-reduced-motion[\s\S]{0,200}\.wsc-last-dot::after \{ animation: none/.test(css));
ck('richer area gradient (mid-stop) in markup + CSS', /class="wsc-area-mid"/.test(paint) && css.indexOf('.wsc-area-mid') >= 0);
ck('premium tooltip card (backdrop blur + tone accent bar)',
   /\.wsc-tip \{[\s\S]{0,700}backdrop-filter: blur/.test(css) && /\.wsc-tip::before/.test(css));
ck('cursor adopts trend tone + soft glide transition',
   css.indexOf('.wsc-up   .wsc-cursor') >= 0 && /\.wsc-cursor \{[\s\S]{0,260}transition:[\s\S]{0,80}transform \.06s/.test(css));
ck('crosshair retained (finer dashes)', css.indexOf('.wsc-hair') >= 0 && css.indexOf('.wsc-hair-h') >= 0);

console.log('\nENGINE UNTOUCHED — RC1-A markers never leak into the shared engine:');
ENGINE_FNS.forEach(fn => {
  const src = fnSrc(fn);
  ck(fn + ' present + carries NO RC1-A presentation markers',
     src.length > 0 && src.indexOf('wsc-last-dot') < 0 && src.indexOf('wsc-area-mid') < 0 && src.indexOf('wsc-tip') < 0);
});
ck('RC1-A changes live in the presentation layer (_wscPaintSurface / CSS only)',
   paint.indexOf('wsc-last-dot') >= 0 && app.indexOf('.wsc-last-dot') < 0 /* dot class is CSS, not app logic */);

console.log('\nMOBILE UNTOUCHED — lite renderers carry no desktop presentation:');
ck('mobile chart lite intact + no wsc-last-dot leak',
   app.indexOf('function renderAurixMobileLiteChart') >= 0 && fnSrc('renderAurixMobileLiteChart').indexOf('wsc-last-dot') < 0);
ck('mobile donut lite intact + no wsc-tip/area-mid leak',
   app.indexOf('function renderAurixMobileDonutLite') >= 0 && fnSrc('renderAurixMobileDonutLite').indexOf('wsc-area-mid') < 0);
ck('AURIX_MOBILE_SAFE still gates the heavy chart paths (≥6)', (app.match(/AURIX_MOBILE_SAFE\) return;/g) || []).length >= 6);

console.log('\nRESULT: ' + (fail === 0 ? 'PASS ✓' : 'FAIL ✗') + '  (' + pass + ' passed, ' + fail + ' failed)');
process.exit(fail === 0 ? 0 : 1);
