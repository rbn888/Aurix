'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MOBILE-CHART-RC3-harness — mobile chart institutional polish (RC3)
// ════════════════════════════════════════════════════════════════════════════
// RC3 polishes the mobile chart's REPRESENTATION + INTERACTION only (SVG + CSS +
// inspector). This harness asserts each delivered polish increment AND the standing
// invariants: engine untouched, no Chart.js, mobile-only, inspector/grid/tooltip intact,
// reduced-motion guarded. Math/sync invariance + mobile guardrails are enforced by the
// existing harnesses run in the same suite.
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

let pass = 0, fail = 0;
function ck(name, cond, extra) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (extra ? '  — ' + extra : '')); } }

console.log('AURIX-MOBILE-CHART-RC3 — institutional polish');

// ── INCREMENT 1 — Fase 3: institutional cursor ──
console.log('\ninc1 (Fase 3) — institutional cursor:');
ck('cursor has dark separation ring + Aurix-blue halo/glow (not a bare white dot)',
   /\.mob-chart-cursor \{[\s\S]{0,260}rgba\(10,16,28,\.85\)[\s\S]{0,120}rgba\(120,170,255/.test(css));
ck('cursor has a discreet breathing ring (::after + mobCursorBreath)',
   /\.mob-chart-cursor::after \{[\s\S]{0,160}animation: mobCursorBreath/.test(css) && /@keyframes mobCursorBreath/.test(css));
ck('cursor breath disabled under reduced motion',
   /prefers-reduced-motion[\s\S]{0,200}\.mob-chart-cursor::after \{ animation: none/.test(css));

// ── STANDING INVARIANTS (must hold after every RC3 increment) ──
console.log('\nstanding invariants — representation/interaction only:');
ck('inspector intact (long-press → X-only selection, no interpolation)',
   app.indexOf('function _aurixInitMobileChartInspector') >= 0 && app.indexOf('function _aurixMobInspectorUpdate') >= 0);
ck('cursor/hair/tooltip present + pointer-events:none (never intercept touch)',
   css.indexOf('.mob-chart-cursor') >= 0 && css.indexOf('.mob-chart-tip') >= 0 && /\.mob-chart-hair, \.mob-chart-cursor, \.mob-chart-tip \{[\s\S]{0,120}pointer-events: none/.test(css));
ck('mobile grid present', app.indexOf('mob-chart-grid') >= 0 && css.indexOf('.mob-chart-grid line') >= 0);
ck('rAF-throttled inspector (1 update/frame, no SVG re-render on hover)',
   /requestAnimationFrame\(function \(\) \{ rafOn = false; _aurixMobInspectorUpdate/.test(app));
ck('inspector bound exactly once (no duplicate listeners)', app.indexOf('_aurixMobInspectorBound) return;') >= 0);
ck('Chart.js still blocked on mobile (≥6 heavy gates)', (app.match(/AURIX_MOBILE_SAFE\) return;/g) || []).length >= 6);
{ // engine untouched: inspector + lite render carry no engine-fn calls beyond the single
  // approved render call in the lite renderer (RC3 must not add new engine coupling).
  const inspectorStart = app.indexOf('let _aurixMobChartPts = null;');
  const inspectorEnd = app.indexOf('window._aurixMobInspectorUpdate = _aurixMobInspectorUpdate; }');
  const inspectorBlock = app.slice(inspectorStart, inspectorEnd);
  ck('engine untouched: inspector never calls the 6 engine fns',
     ['renderAurixInstitutionalChart(', 'computeAurixAdaptiveXScale(', 'computeAurixValueScale(', 'downsampleAurixAdaptive(', 'prepareAurixVisualSeries(', '_aurixMonotonePath('].every(s => inspectorBlock.indexOf(s) < 0)); }
ck('desktop chart untouched (WSC end-dot + RC1-A presentation intact)',
   app.indexOf('wsc-last-dot') >= 0 && css.indexOf('.wsc-last-dot') >= 0);
ck('lite chart + donut intact', app.indexOf('function renderAurixMobileLiteChart') >= 0 && app.indexOf('function renderAurixMobileDonutLite') >= 0);

console.log('\nRESULT: ' + (fail === 0 ? 'PASS ✓' : 'FAIL ✗') + '  (' + pass + ' passed, ' + fail + ' failed)');
process.exit(fail === 0 ? 0 : 1);
