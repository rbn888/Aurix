'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-VERTICAL-SOFTENING-RC5B-harness — RC5-B (vertical step softening + header gain placement)
// ════════════════════════════════════════════════════════════════════════════
// FASE 1: a near-vertical LONG drawn segment (a real level jump) is redrawn with eased
// shoulders by inserting smoothstep VISUAL vertices BETWEEN the two real points. The jump,
// global max/min, endpoints and last point are preserved; no new extrema/teeth; visiblePoints/
// tooltip data untouched; visualSamples re-sampled from the softened path. FASE 2: the perf
// return moves BELOW the %/€ selector as a premium micro-subtext. Render-only; rollback exact.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function fn(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=app.indexOf('{',i),d=0; for(;k<app.length;k++){const c=app[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} return app.slice(i,k); }
const CONST_BLOCK = app.slice(app.indexOf('const _AURIX_PATH_RENDER_SPACING'), app.indexOf('function _aurixArrConfig'));
const ENG = ['_aurixRenderContractGeometry','_aurixVpTargetPointCount','_aurixComputeVisualPreparation','prepareAurixVisualSeries','downsampleAurixLTTB','_aurixSignificantLocalExtrema','downsampleAurixAdaptive','computeAurixTimeScale','computeAurixAdaptiveXScale','computeAurixValueScale','_aurixArrConfig','_aurixArrRepresentVertices','_aurixSpikeReduce','_aurixSpikeParams','_aurixSpikeDiscipline','_aurix24hSpikeGuard','_aurixVolatilityPolish','_aurixPolishSimplify','_aurixSampleSegments','_aurixDensifyPathSegments','_aurixVisualPointAtX','_aurixMonotonePath','buildAurixMonotonicPath','buildAurixAreaPath','_aurixSplitAtGaps','_wscFmtAxisVal','auditAurixRenderVsCanonical','_aurixCompareRenderToCanonical','renderAurixInstitutionalChart'];
const AUX = ['_AURIX_RC_QUALITY_THRESHOLD','_AURIX_RC_WINDOW_MS','_AURIX_RC_DASHBOARD_TOL','_AURIX_RC_ASPECT','_AURIX_RC_PAD_FRAC','_AURIX_RC_VPAD_FRAC','_AURIX_IR_VALUE_MARGIN','_AURIX_IR_VPAD_FRAC','_AURIX_Y_JUMP_DOMINANCE','_AURIX_Y_LEGIBLE_ALPHA','_AURIX_X_FILL_BETA','_AURIX_VP_DENSITY','_AURIX_VP_GAP_FLOOR_MS','_AURIX_VP_GAP_MEDIAN_MULT','_AURIX_VP_CAPITAL_KINDS','_AURIX_VP_CLUSTER_WIDTH_PX','_AURIX_VP_CLUSTER_MIN_PTS','_AURIX_VP_VALUE_EPS'];
const HOUR=36e5, MIN=6e4, DAY=864e5, NOW=1000*DAY;
function mk(constBlock){ let S=[],D=null;
  const sb={ console, getAurixRenderSeries:()=>S, investableValueBase:()=>D, _aurixLoadCapitalFlows:()=>[], window:undefined, Math, JSON, Array, Number, isFinite, Infinity, Date, activeRange:'7d', __set:s=>{S=s;D=s[s.length-1].value;} };
  vm.createContext(sb); vm.runInContext(constBlock, sb);
  AUX.forEach(c=>{const m=app.match(new RegExp('const '+c+'\\s*=[^;]*?;','s'));if(m)vm.runInContext(m[0],sb);});
  ENG.forEach(n=>{try{vm.runInContext(fn(n),sb);}catch(e){}}); return sb; }
const box={left:6,right:994,top:16,bottom:244};
function coords(d){ const o=[]; const re=/([MLC])([^MLC]*)/g; let m; while((m=re.exec(d))){ const n=m[2].trim().split(/[ ,]+/).map(Number).filter(x=>!isNaN(x)); if(m[1]==='C')o.push({x:n[4],y:n[5]}); else if(n.length>=2)o.push({x:n[0],y:n[1]}); } return o; }
function maxSlope(d){ const c=coords(d); let s=0; for(let i=1;i<c.length;i++){ const dx=Math.abs(c[i].x-c[i-1].x)||0.001, dy=Math.abs(c[i].y-c[i-1].y); s=Math.max(s,dy/dx); } return s; }
function teeth(d,asp){ const c=coords(d); let n=0; for(let i=1;i<c.length-1;i++){ const a=c[i-1].y,b=c[i+1].y,y=c[i].y; const pk=y<a&&y<b,tr=y>a&&y>b; if(!pk&&!tr)continue; const pr=Math.min(Math.abs(y-a),Math.abs(y-b)); const ba=Math.abs(c[i+1].x-c[i-1].x)||1; if(pr>=4&&pr/ba>=asp)n++; } return n; }
function render(sb,range,s){ sb.__set(s); return vm.runInContext(`renderAurixInstitutionalChart('${range}',1000,260,${JSON.stringify(box)})`,sb); }
// 7D series with a sharp real level jump in the middle (deposit-like vertical wall)
function wall(range){ const days={'24h':1,'7d':7,'30d':30,'1y':365,'all':900}[range], N=300, p=[]; for(let i=0;i<N;i++){ const f=i/(N-1); p.push({time:Math.round(NOW-days*DAY+f*days*DAY), value:Math.round(60000+f*2000+200*Math.sin(i*0.3)+(f>0.5?9000:0))}); } return p; }
let pass=0,fail=0; function ok(n,c,i){ if(c){pass++;console.log('  ✓ '+n+(i?'  ['+i+']':''));}else{fail++;console.log('  ✗ '+n+(i?'  ['+i+']':''));} }

console.log('AURIX-VERTICAL-SOFTENING-RC5B — RC5-B\n');
const ON = mk(CONST_BLOCK);
const OFF = mk(CONST_BLOCK.replace('const _AURIX_VERTICAL_STEP_SOFTENING_ENABLED = true', 'const _AURIX_VERTICAL_STEP_SOFTENING_ENABLED = false'));
const s7 = wall('7d');
const a = render(ON,'7d',s7), b = render(OFF,'7d',s7);
const smx=Math.max.apply(null,s7.map(p=>p.value)), smn=Math.min.apply(null,s7.map(p=>p.value));

console.log('FASE 1 — vertical step softening:');
ok('1 softening flag ON/OFF + per-range multipliers present',
   /_AURIX_VERTICAL_STEP_SOFTENING_ENABLED = true/.test(app) &&
   /rangeMultiplier: \{ '24h': 1\.0, '7d': 0\.78, '30d': 0\.78, '1y': 0\.5, 'all': 0\.5 \}/.test(app) &&
   a.diagnostics.softenDiag && b.diagnostics.softenDiag === null);
ok('2 long vertical segment is softened (inserted pts + gentler corner slope)',
   a.diagnostics.softenDiag.insertedPoints > 0 && a.diagnostics.softenDiag.softenedSegments > 0 &&
   maxSlope(a.pathData) < maxSlope(b.pathData), 'slope '+maxSlope(b.pathData).toFixed(1)+'→'+maxSlope(a.pathData).toFixed(1)+' inserted='+a.diagnostics.softenDiag.insertedPoints);
ok('3 start + end real points preserved', a.visiblePoints[0].value===s7[0].value && a.visiblePoints[a.visiblePoints.length-1].value===s7[s7.length-1].value);
ok('4 max / min / last preserved (no flatten, no overshoot)',
   Math.max.apply(null,a.visiblePoints.map(p=>p.value))===smx && Math.min.apply(null,a.visiblePoints.map(p=>p.value))===smn &&
   a.visiblePoints[a.visiblePoints.length-1].value===s7[s7.length-1].value);
ok('5 tooltip still uses REAL data (visiblePoints identical ON==OFF; tooltip reads sv[k])',
   JSON.stringify(a.visiblePoints)===JSON.stringify(b.visiblePoints) && /val = sv\[k\]/.test(fn('_wscAttachTooltip')));
// visualSamples coherent with the FINAL softened path: regenerated (differ vs OFF), dense,
// strictly x-monotonic, and entirely within the plot box (sampled from the softened segments).
{ let mono=true, inBox=true;
  for(let j=1;j<a.visualSamples.length;j++){ if(a.visualSamples[j].x < a.visualSamples[j-1].x-0.01) mono=false; }
  for(let j=0;j<a.visualSamples.length;j++){ const y=a.visualSamples[j].y; if(y<box.top-2||y>box.bottom+2) inBox=false; }
  ok('6 visualSamples coherent with the FINAL (softened) path (regenerated, x-monotonic, in-box)',
     a.visualSamples.length>0 && a.visualSamples.length!==b.visualSamples.length && mono && inBox); }
ok('7 24H no-split (softening never crosses a gap / splits the line)', render(ON,'24h',wall('24h')).diagnostics.renderedSubpaths===1);
ok('8 no new teeth introduced by softening (monotonic insert)', teeth(a.pathData,0.45) <= teeth(b.pathData,0.45));

console.log('\nFASE 1 — per-range strictness (24H medium · 7D/30D soft · 1A/TOTAL very soft):');
[['24h',1.0],['7d',0.78],['30d',0.78],['1y',0.5],['all',0.5]].forEach(([rg,mult])=>{
  const r=render(ON,rg,wall(rg)); const sm=Math.max.apply(null,wall(rg).map(p=>p.value));
  ok(rg+' softens its wall + keeps max/last (mult '+mult+')',
     r.diagnostics.softenDiag.insertedPoints>0 && Math.max.apply(null,r.visiblePoints.map(p=>p.value))===sm && r.diagnostics.renderedSubpaths>=1);
});

console.log('\nNO REGRESSION — equivalence / inspector / color / motion:');
ok('9a equivalence render↔canonical NOT divergent (24h+7d+all)',
   vm.runInContext("auditAurixRenderVsCanonical('24h').status",ON)!=='divergent' &&
   vm.runInContext("auditAurixRenderVsCanonical('7d').status",ON)!=='divergent' &&
   vm.runInContext("auditAurixRenderVsCanonical('all').status",ON)!=='divergent');
ok('8b inspector snap intact (mobile + desktop visualPoint)', /_aurixVisualPointAtX\(_aurixMobChartVisual, fx\)/.test(app) && /_aurixVisualPointAtX\(model\.visualSamples, vbX\)/.test(fn('_wscAttachTooltip')));
ok('9 color parity intact (range-return sign hexes)', /tone === 'down' \? '#e25563'/.test(app) && /_aurixRangeReturn\(r\)/.test(app));
ok('10 premium motion (RC5-A) intact', /_AURIX_PREMIUM_MOTION_ENABLED = true/.test(app) && /@keyframes aurixLineDraw/.test(css) && /\.wsc-in\.aurix-pm \.wsc-line/.test(css));

console.log('\nFASE 2 — Header Gain Placement (mobile):');
const ctrl = html.slice(html.indexOf('mobile-slide-chart'), html.indexOf('mobile-slide-chart')+1600);
ok('11 indicator sits BELOW the %/€ selector (perf-unit-block: toggle then #chartChangeMobile)',
   /<div class="perf-unit-block">\s*<div class="perf-toggle">[\s\S]*?<\/div>\s*<span class="chart-change" id="chartChangeMobile">/.test(ctrl) &&
   ctrl.indexOf('perf-toggle') < ctrl.indexOf('id="chartChangeMobile"'));
ok('12 %/€ toggle honored by the SINGLE badge owner; indicator delegates + targets #chartChangeMobile, painter keeps tone',
   /getElementById\('chartChangeMobile'\)/.test(fn('_aurixMobileSetPerfIndicator')) &&
   /_aurixPaintReturnBadge\(el, 'mobile'\)/.test(fn('_aurixMobileSetPerfIndicator')) &&
   /activePerfMode/.test(fn('_aurixFormatReturnText')) &&
   /el\.className = 'chart-change ' \+ snap\.tone;/.test(fn('_aurixPaintReturnBadge')));
{ const ctrlRule = (css.match(/\.mobile-slide-chart \.chart-controls \{[^}]*\}/)||[''])[0];
  ok('13 no mobile overflow: column stack, reserved line-height, controls flex-start + nowrap',
     /\.mobile-slide-chart \.perf-unit-block \{ display: flex; flex-direction: column;/.test(css) &&
     /\.mobile-slide-chart \.perf-unit-block \.chart-change \{[\s\S]*?min-height: 12px;/.test(css) &&
     /align-items: flex-start;/.test(ctrlRule) && /flex-wrap: nowrap;/.test(ctrlRule)); }
ok('14 buttons still tappable (RC5-C compact selector keeps a comfortable ≥26px touch target)',
   /\.mobile-slide-chart \.perf-toggle \.perf-btn \{ padding: 3px 7px; min-height: 26px;/.test(css));

console.log('\nRC5-C — header micro-tuning (selector compact · return more visible):');
{ const sel = (css.match(/\.mobile-slide-chart \.perf-toggle \.perf-btn \{[^}]*\}/)||[''])[0];
  const ind = (css.match(/\.mobile-slide-chart \.perf-unit-block \.chart-change \{[^}]*font-size: 14px;[^}]*\}/)||[''])[0];
  const selFs = +((sel.match(/font-size: (\d+)px/)||[])[1] || 0);
  const indFs = +((ind.match(/font-size: (\d+)px/)||[])[1] || 0);
  ok('15 hierarchy inverted: return font-size (14) > selector font-size (11), tone colour intact',
     indFs >= 14 && selFs <= 11 && indFs > selFs && /\.chart-change\.up   \{ color: var\(--green\); \}/.test(css) && /\.chart-change\.down \{ color: var\(--red\); \}/.test(css), 'return='+indFs+'px selector='+selFs+'px');
  ok('16 return stays nowrap + content-sized (no row overflow) and aligned under the selector',
     /\.mobile-slide-chart \.perf-unit-block \.chart-change \{[^}]*white-space: nowrap;/.test(css) &&
     /\.mobile-slide-chart \.perf-unit-block \{ display: flex; flex-direction: column; align-items: flex-start;/.test(css)); }

console.log('\nRC5-D — header lock & selector compactness (no layout shift on %/€ toggle):');
ok('17 left block has a HARD fixed width (flex 0 0 92px) ⇒ temporalities never shift',
   /\.mobile-slide-chart \.perf-unit-block \{ flex: 0 0 92px; width: 92px; min-width: 92px;/.test(css));
ok('18 range group owns the rest of the row, decoupled from the data width (flex:1; min-width:0)',
   /\.mobile-slide-chart \.range-toggle \{ flex: 1; min-width: 0; \}/.test(css));
ok('19 selector compact: fixed-width control, buttons aligned in height (≥26px touch)',
   /\.mobile-slide-chart \.perf-toggle \{ width: 62px;/.test(css) &&
   /\.mobile-slide-chart \.perf-toggle \.perf-btn \{ flex: 1 1 0; min-width: 0;[^}]*min-height: 26px;/.test(css));
ok('20 return reserved width + breathing (margin-top + comfortable line-height), tone unchanged',
   /\.mobile-slide-chart \.perf-unit-block \.chart-change \{ width: 92px; min-width: 92px; margin-top: 4px;[^}]*line-height: 1\.2;/.test(css) &&
   /\.chart-change\.up   \{ color: var\(--green\); \}/.test(css) && /\.chart-change\.down \{ color: var\(--red\); \}/.test(css));
{ // before/after layout shift: BEFORE the left block was content-sized (flex:0 0 auto) ⇒ width
  // changed with the % vs € string; AFTER it is flex:0 0 92px (fixed) ⇒ identical in both modes.
  const blk = (css.match(/\.mobile-slide-chart \.perf-unit-block \{ flex: 0 0 92px;[^}]*\}/)||[''])[0];
  ok('21 layout-shift eliminated: block flex-basis is a fixed length (not auto/content)',
     blk.length>0 && !/auto/.test(blk.match(/flex: ([^;]+);/)[1])); }

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
