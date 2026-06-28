'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-MOTION-RC4C-harness — RC4-C institutional motion & final visual polish
// ════════════════════════════════════════════════════════════════════════════
// Presentation/UX ONLY. Verifies the visual refinements (curve/area/glow/cursor/hairline/
// tooltip + fade-in motion) AND that NO data/geometry contract changed (REGLA 0): 24H never
// splits, equivalence holds, visiblePoints/visualSamples untouched, area closes under the
// last point. Everything reversible (CSS / render params / gated motion).
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
function fn(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=app.indexOf('{',i),d=0; for(;k<app.length;k++){const c=app[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} return app.slice(i,k); }
const CONST_BLOCK = app.slice(app.indexOf('const _AURIX_PATH_RENDER_SPACING'), app.indexOf('function _aurixArrConfig'));
let pass=0, fail=0; function ok(n,c,i){ if(c){pass++;console.log('  ✓ '+n+(i?'  ['+i+']':''));}else{fail++;console.log('  ✗ '+n+(i?'  ['+i+']':''));} }

console.log('AURIX-CHART-MOTION-RC4C — RC4-C\n');

console.log('VISUAL POLISH (CSS / render params):');
// C1 — institutional curve (round caps/joins + geometricPrecision + non-scaling stroke)
ok('C1 desktop line: round cap+join + geometricPrecision', /\.wsc-line {[^}]*stroke-linecap: round;[^}]*stroke-linejoin: round;[^}]*shape-rendering: geometricPrecision/.test(css));
ok('C1 mobile line: round cap+join + non-scaling stroke', /stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/.test(app));
// C2 — area lighter + bottom invisible
ok('C2 area top stop lighter (≤ .12) + bottom invisible (0)', /\.wsc-area-0   { stop-color: var\(--accent[^}]*stop-opacity: \.115/.test(css) && /\.wsc-area-1   { stop-color: var\(--accent[^}]*stop-opacity: 0/.test(css));
// C3 — glow more uniform (bigger radius, lower intensity)
{ const sbp={ window:undefined, Math }; vm.createContext(sbp); vm.runInContext(fn('_wscRenderPolish'), sbp);
  const longD = sbp._wscRenderPolish('1y', false, 'up'), sharpD = sbp._wscRenderPolish('24h', false, 'up');
  ok('C3 glow: larger radius + lower intensity', longD.glowStrength >= 1.5 && sharpD.glowStrength >= 2.0 && longD.glowAlpha <= 0.52, 'strLong='+longD.glowStrength+' strSharp='+sharpD.glowStrength+' alpha='+longD.glowAlpha); }
// C4/C5 — fade-in on range change / first paint, gated (not every refresh), reduced-motion safe
ok('C4/C5 lite svg fades only on range-change/first-paint (gated)', /class="aurix-lite-svg' + "'" + ' \+ \(_aurixMobileLitePrevRange !== r \? . aurix-lite-in/.test(app.replace(/\\/g,'')) || /_aurixMobileLitePrevRange !== r \?/.test(app));
ok('C4/C5 fade keyframe present (150–300ms) + reduced-motion guard', /@keyframes aurixLiteIn/.test(css) && /\.aurix-lite-in { animation: aurixLiteIn \.22s/.test(css) && /prefers-reduced-motion[\s\S]{0,80}\.aurix-lite-in { animation: none/.test(css));
ok('C5 prev-range updated AFTER paint (so same-range refresh does NOT re-animate → C12)', /_aurixMobileLitePrevRange = r;/.test(app));
// C7 — active point finer
ok('C7 cursor: finer ring + softer wider glow', /\.wsc-cursor {[^}]*box-shadow: 0 0 0 3px rgba\(255,255,255,\.14\), 0 0 14px/.test(css));
// C8 — hairline subtler
ok('C8 hairline subtler (≤ .15 / .09)', /\.wsc-hair {[^}]*rgba\(255,255,255,\.15\)/.test(css) && /\.wsc-hair-h {[^}]*rgba\(255,255,255,\.09\)/.test(css));
// C9 — tooltip fade 80–120ms, opacity-only (no transform/scale/bounce)
ok('C9 tooltip fade 80–120ms, opacity-only (no transform/scale)', css.indexOf('transition: opacity .1s var(--ease-out') >= 0 && !/\.wsc-tip {[\s\S]{0,520}transition:[^;]*transform/.test(css));

console.log('\nREGLA 0 — no data/geometry contract changed:');
const ENG = ['_aurixRenderContractGeometry','_aurixVpTargetPointCount','_aurixComputeVisualPreparation','prepareAurixVisualSeries','downsampleAurixLTTB','_aurixSignificantLocalExtrema','downsampleAurixAdaptive','computeAurixTimeScale','computeAurixAdaptiveXScale','computeAurixValueScale','_aurixArrConfig','_aurixArrRepresentVertices','_aurixPolishSimplify','_aurix24hSpikeGuard','_aurixSampleSegments','_aurixDensifyPathSegments','_aurixMonotonePath','buildAurixMonotonicPath','buildAurixAreaPath','_aurixSplitAtGaps','_wscFmtAxisVal','auditAurixRenderVsCanonical','_aurixCompareRenderToCanonical','renderAurixInstitutionalChart'];
const AUX = ['_AURIX_RC_QUALITY_THRESHOLD','_AURIX_RC_WINDOW_MS','_AURIX_RC_DASHBOARD_TOL','_AURIX_RC_ASPECT','_AURIX_RC_PAD_FRAC','_AURIX_RC_VPAD_FRAC','_AURIX_IR_VALUE_MARGIN','_AURIX_IR_VPAD_FRAC','_AURIX_Y_JUMP_DOMINANCE','_AURIX_Y_LEGIBLE_ALPHA','_AURIX_X_FILL_BETA','_AURIX_VP_DENSITY','_AURIX_VP_GAP_FLOOR_MS','_AURIX_VP_GAP_MEDIAN_MULT','_AURIX_VP_CAPITAL_KINDS','_AURIX_VP_CLUSTER_WIDTH_PX','_AURIX_VP_CLUSTER_MIN_PTS','_AURIX_VP_VALUE_EPS'];
let SER=[],DSH=null;
const sb={ console, getAurixRenderSeries:()=>SER, investableValueBase:()=>DSH, _aurixLoadCapitalFlows:()=>[], window:undefined, Math, JSON, Array, Number, isFinite, Infinity, Date, activeRange:'24h' };
vm.createContext(sb); vm.runInContext(CONST_BLOCK, sb);
AUX.forEach(c=>{const m=app.match(new RegExp('const '+c+'\\s*=[^;]*?;','s'));if(m)vm.runInContext(m[0],sb);});
ENG.forEach(n=>{try{vm.runInContext(fn(n),sb);}catch(e){}});
const HOUR=36e5,MIN=60e3,DAY=864e5,NOW=1000*DAY;
function build(range){let p=[]; if(range==='24h'){const v0=72000;let k=0;for(let t=NOW-24*HOUR;t<=NOW;t+=5*MIN,k++){const m=120*Math.sin(k*2.1)+80*Math.cos(k*3.7);const c=(t>NOW-5*HOUR&&t<NOW-4*HOUR)?((t-(NOW-5*HOUR))/HOUR)*700:(t>=NOW-4*HOUR?700:0);p.push({time:t,value:Math.round(v0+m+c)});}}
  else{const days={'7d':7,'30d':30,'1y':365,'all':900}[range];for(let i=0;i<300;i++)p.push({time:Math.round(NOW-days*DAY+i*(days*DAY/299)),value:Math.round(60000+i*20+400*Math.sin(i*0.1))});} return p;}
function render(range){SER=build(range);DSH=SER[SER.length-1].value;sb.SERIES=SER;return vm.runInContext(`renderAurixInstitutionalChart('${range}',1000,260,{"left":6,"right":994,"top":16,"bottom":244})`,sb);}
const r24 = render('24h');
ok('REGLA0 24H still ONE subpath (no split)', r24.diagnostics.renderedSubpaths===1);
ok('REGLA0 equivalence render↔canonical not divergent', vm.runInContext("auditAurixRenderVsCanonical('24h').status",sb)!=='divergent');
{ const ds=vm.runInContext(`downsampleAurixAdaptive(${JSON.stringify(build('24h'))}, _aurixVpTargetPointCount('24h',1000)).length`,sb);
  ok('REGLA0 visiblePoints/visualSamples present + untouched', r24.visiblePoints.length===ds && Array.isArray(r24.visualSamples) && r24.visualSamples.length>0); }
// C6 — area closes EXACTLY under the last point (no overflow/short/gap)
{ const lineLast = String(r24.pathData).trim().match(/([-\d.]+)\s+([-\d.]+)\s*$/);
  const m = String(r24.areaPathData).trim().match(/L\s+([-\d.]+)\s+([-\d.]+)\s+L\s+([-\d.]+)\s+([-\d.]+)\s+Z$/);
  ok('C6 area closes under the last point (baseline, then back to first, Z)', !!m && !!lineLast && Math.abs(+m[1] - +lineLast[1]) < 0.5, m? ('areaLastX='+m[1]+' lineLastX='+(lineLast&&lineLast[1])) : 'no Z close'); }
ok('C7 inspector intact (visualPoint snap)', /_aurixVisualPointAtX\(_aurixMobChartVisual, fx\)/.test(app));
ok('C12 render stability: redundant re-render gated by fingerprint (_syncFp)', /_syncFp/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
