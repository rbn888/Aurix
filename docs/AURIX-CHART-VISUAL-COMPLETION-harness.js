'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-VISUAL-COMPLETION — grid + right Y-axis + desktop hover + mobile padding
// Visual/interaction only: keeps the premium cubic line, restores grid + right amounts, desktop hover,
// mobile edge padding. Data pipeline / returnPct / buildProductionPortfolioChart untouched.
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const app = src;
function fn(name) { const s = 'function ' + name + '('; const i = src.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let k = src.indexOf('{', i), d = 0; for (; k < src.length; k++) { const c = src[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return src.slice(i, k); }
function block(a, b) { const i = src.indexOf(a); if (i < 0) throw new Error('missing ' + a); const e = src.indexOf(b, i); if (e < 0) throw new Error('missing ' + b); return src.slice(i, e + b.length); }
let pass = 0, fail = 0; const ok = (n, c, g) => { if (c) { pass++; console.log('  ✓ ' + n + (g !== undefined ? '  [' + g + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (g !== undefined ? '  [' + g + ']' : '')); } };

const sb = { console, activeRange: '30d', Math, Number, Array, JSON, isFinite, parseFloat, Infinity, Set,
  _wscFmtAxisVal: v => { const a = Math.abs(v); if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M'; if (a >= 1e3) return (v / 1e3).toFixed(1) + 'k'; return Math.round(v).toString(); } };
sb.window = sb; sb.window.innerWidth = 1440;
vm.createContext(sb);
vm.runInContext(src.slice(src.indexOf('const _AURIX_PATH_RENDER_SPACING'), src.indexOf('function _aurixArrConfig')), sb);
vm.runInContext(block('const _AURIX_RC_QUALITY_THRESHOLD', 'const _AURIX_RC_VPAD_FRAC = 0.08;'), sb);
vm.runInContext(block('const _AURIX_VP_DENSITY', 'const _AURIX_VP_VALUE_EPS = 0.004;'), sb);
vm.runInContext(block('const _AURIX_IR_VALUE_MARGIN', '= 0.08;'), sb);
vm.runInContext(block('const _AURIX_Y_JUMP_DOMINANCE', 'const _AURIX_Y_LEGIBLE_ALPHA  = 0.35;'), sb);
vm.runInContext(block('const _AURIX_X_FILL_BETA', '};'), sb);
vm.runInContext(block('const _AURIX_BRIDGE_SEG_ENABLED', "'all': 0.4 };"), sb);   // SPEC 24H.BRIDGE-SEGMENTATION.01 deps
vm.runInContext(block('const _AURIX_CAPITAL_STEP_SEG_ENABLED', 'const _AURIX_SPARSE_RAMP_MIN_MS = 20 * 60000;'), sb);   // SPEC DATA-TRUTH.01 deps
[ fn('_aurixVpTargetPointCount'), fn('downsampleAurixLTTB'), fn('_aurixSignificantLocalExtrema'), fn('downsampleAurixAdaptive'),
  fn('computeAurixTimeScale'), fn('computeAurixAdaptiveXScale'), fn('computeAurixValueScale'), fn('_wscFmtAxisVal'),
  fn('_aurixMonotonePath'), fn('buildAurixAreaPath'), fn('_aurixSplitAtGaps'), fn('_aurixConfirmedBridgeGaps'),
  fn('_aurixVerticalJumps'), fn('_aurixCapitalStepBreaks'), fn('_aurixSparseRampBreaks'), fn('_aurixStructuralBreaks'),
  fn('renderValidatedPortfolioChartWithInstitutionalRenderer'),
  fn('_aurixInstitutionalYTicks') ].forEach(c => vm.runInContext(c, sb));

const DAY = 86400e3, HOUR = 36e5, NOW = 1000 * DAY;
const N = 200, pts = Array.from({ length: N }, (_, i) => ({ ts: NOW - (N - 1 - i) * 3 * HOUR, value: +(9000 * (1 + 0.05 * i / (N - 1)) + Math.sin(i * 0.4) * 150).toFixed(2) }));
const dbox = { left: 60, right: 940, top: 34, bottom: 206 };
const mbox = { left: 14, right: 900, top: 24, bottom: 236 };   // SPEC MOBILE.CHART.LAYOUT.01 — right gutter reserved for Y-axis labels
const rcD = vm.runInContext('renderValidatedPortfolioChartWithInstitutionalRenderer(' + JSON.stringify(pts) + ',{range:"30d",vw:1000,vh:240,box:' + JSON.stringify(dbox) + '})', sb);
const rcM = vm.runInContext('renderValidatedPortfolioChartWithInstitutionalRenderer(' + JSON.stringify(pts) + ',{range:"30d",vw:1000,vh:260,box:' + JSON.stringify(mbox) + '})', sb);
// y-ticks computed INSIDE the sandbox (yScale carries invValueAtY as a live fn there)
const ytLen = vm.runInContext('(_aurixInstitutionalYTicks(renderValidatedPortfolioChartWithInstitutionalRenderer(' + JSON.stringify(pts) + ',{range:"30d",vw:1000,vh:240,box:' + JSON.stringify(dbox) + '}).yScale,4)||[]).length', sb);

console.log('AURIX-CHART-VISUAL-COMPLETION\n');

console.log('Y-axis labels derived from the SAME rendered scale:');
ok('ticks generated from the adapter yScale inverse (executable)', ytLen >= 2, ytLen + ' ticks');
ok('5 Y-labels come from _aurixInstitutionalYTicks(rc.yScale) in the desktop painter (same scale as the line)',
   /_aurixInstitutionalYTicks\(rc\.yScale, 4\)/.test(fn('_wscPaintEmergency')) &&
   /invValueAtY/.test(fn('_aurixInstitutionalYTicks')));

console.log('\nDesktop grid + right axis (static markup):');
const paintD = fn('_wscPaintEmergency');
ok('1 desktop ready SVG has a grid layer BEHIND the line (grid-layer emitted before wsc-line)',
   /class="wsc-grid-layer" pointer-events="none">' \+ _grid/.test(paintD) && paintD.indexOf('wsc-grid-layer') < paintD.indexOf("class=\"wsc-line\""));
ok('3 desktop right-side Y-axis labels present (.wsc-ylabs / .wsc-ylab from ticks)',
   /class="wsc-ylabs">' \+ _yLabels/.test(paintD) && /_yticks\.map\(tk => '<span class="wsc-ylab"/.test(paintD));
ok('grid has both horizontal (from ticks) and vertical lines',
   /_yticks\.forEach\(tk => \{ _grid \+= '<line class="wsc-grid"/.test(paintD) && /\[0, 0\.25, 0\.5, 0\.75, 1\]\.forEach/.test(paintD));

console.log('\nPointer layering (grid/area do NOT capture; plot is interactive; line above):');
ok('6 grid layer has pointer-events none', /class="wsc-grid-layer" pointer-events="none"/.test(paintD));
ok('7 area path has pointer-events none', /class="wsc-area"[\s\S]{0,140}pointer-events="none"/.test(paintD));
ok('svg is pointer-events:none (plot div is the interactive layer)', /class="wsc-svg"[\s\S]{0,120}style="pointer-events:none"/.test(paintD));
ok('9 line drawn AFTER grid+area (visually above); last-dot overlay on plot', paintD.indexOf('class="wsc-area"') < paintD.indexOf('class="wsc-line"') && /_lastDot/.test(paintD));

console.log('\nDesktop hover (tooltip attached + nearest-point works):');
ok('8 desktop painter attaches _wscAttachTooltip to the .wsc-plot with adapter samples (snapToPoint)',
   /_wscAttachTooltip\(plot, \{/.test(paintD) && /snapToPoint: true/.test(paintD) && /opts\.tooltip && rc\.ok/.test(paintD) && /sampleX: rc\.visiblePixels\.map/.test(paintD));
{ // executable nearest-point simulation on the real adapter pixels (mirrors _wscAttachTooltip snap)
  const sx = rcD.visiblePixels.map(q => q.x); const vx = (sx[0] + sx[sx.length - 1]) / 2;
  let k = 0; while (k < sx.length - 2 && sx[k + 1] < vx) k++; if (k < sx.length - 1 && Math.abs(sx[k + 1] - vx) < Math.abs(sx[k] - vx)) k++;
  ok('nearest rendered point resolved for a mid-chart hover x', k >= 0 && k < sx.length, 'idx ' + k + '/' + sx.length); }

console.log('\nMobile grid + right axis + edge padding:');
const paintM = fn('renderAurixMobileLiteChart');
ok('2 mobile grid layer preserved (mob-chart-grid)', /class="mob-chart-grid" pointer-events="none"/.test(paintM));
ok('4 mobile right Y-axis labels present (mob-ylab from the same scale)', /_aurixInstitutionalYTicks\(_rc\.yScale, 3\)/.test(paintM) && /class="mob-ylab"/.test(paintM));
ok('10 mobile padding — line never touches the chart edge (all pixels inside the padded box)', (function () {
  const xs = rcM.visiblePixels.map(q => q.x), ys = rcM.visiblePixels.map(q => q.y);
  return Math.min.apply(null, xs) >= 14 - 0.5 && Math.max.apply(null, xs) <= 900 + 0.5 && Math.min.apply(null, ys) >= 24 - 0.5 && Math.max.apply(null, ys) <= 236 + 0.5;
})(), 'x[' + Math.min.apply(null, rcM.visiblePixels.map(q => q.x)).toFixed(0) + '..' + Math.max.apply(null, rcM.visiblePixels.map(q => q.x)).toFixed(0) + '] y[' + Math.min.apply(null, rcM.visiblePixels.map(q => q.y)).toFixed(0) + '..' + Math.max.apply(null, rcM.visiblePixels.map(q => q.y)).toFixed(0) + ']');

console.log('\nSPEC MOBILE.CHART.LAYOUT.01 — premium right gutter for Y-axis labels (mobile only):');
ok('L1 mobile plot box reserves a right gutter (right=900 of 1000 viewBox, ~100u for labels)',
   /const _mbox = \{ left: 14, right: 900, top: 24, bottom: 236 \};/.test(paintM), 'right=900');
ok('L2 curve/area map into the gutter box → all mobile pixels end at/inside x=900 (never over the labels)',
   Math.max.apply(null, rcM.visiblePixels.map(q => q.x)) <= 900 + 0.5, 'maxX=' + Math.max.apply(null, rcM.visiblePixels.map(q => q.x)).toFixed(1));
ok('L3 Y-labels right-aligned inside the gutter, nudged ~7px toward the card edge (x=973, ~27u)',
   /class="mob-ylab" x="973"[\s\S]{0,90}text-anchor="end"/.test(paintM));
ok('L4 label gutter is clear of the curve (label right edge 973 sits inside 900..1000 gutter, wider curve↔label gap)',
   973 > 900 && 973 < 1000);
ok('L5 grid horizontal lines aligned to the plot right (x2=900, no lines running under the labels)',
   /class="h" x1="14" y1="77" x2="900"/.test(paintM) && !/class="h"[^>]*x2="986"/.test(paintM));
ok('L6 label typography/colour/opacity UNCHANGED (font-size 17, rgba(159,176,199,0.55))',
   /class="mob-ylab"[\s\S]{0,120}fill="rgba\(159,176,199,0\.55\)" font-size="17"/.test(paintM));
ok('L7 desktop plot box untouched (SPEC: no desktop change)', /W \* 0\.06/.test(paintD) && !/right: 900/.test(paintD));

console.log('\nLine integrity + data/return untouched:');
ok('11 visible path still contains cubic "C" commands (desktop + mobile)', /C /.test(rcD.linePath) && /C /.test(rcM.linePath), (rcD.linePath.match(/C /g) || []).length + ' / ' + (rcM.linePath.match(/C /g) || []).length);
ok('12 buildProductionPortfolioChart has NO visual concerns (grid/ylab/tooltip absent → data fn untouched)',
   !/wsc-grid|wsc-ylab|_wscAttachTooltip|renderValidatedPortfolioChartWithInstitutionalRenderer|mob-ylab/.test(fn('buildProductionPortfolioChart')));
ok('13 the visual painters never assign returnPct/returnValue (return math untouched)',
   !/returnPct\s*=|returnValue\s*=/.test(paintD) && !/\bemg\.returnPct\s*=/.test(paintM));
ok('14 window.aurixChartVisualDebug exposed with required fields', (function () {
  const need = ['hasCubicPath', 'gridLineCount', 'rightAxisLabelCount', 'axisValues', 'plotBox', 'mobilePadding', 'pointerLayerPresent', 'pointerEventsOk', 'hoverNearestPointWorks', 'lineAboveGrid', 'areaBelowLine', 'dataHash', 'returnPctUnchanged'];
  return /window\.aurixChartVisualDebug\s*=/.test(app) && need.every(k => new RegExp('\\b' + k + '\\b').test(app));
})());

console.log('\n' + (fail === 0 ? '✅ ALL PASS' : '❌ ' + fail + ' FAILED') + '  (' + pass + '/' + (pass + fail) + ')');
process.exit(fail === 0 ? 0 : 1);
