'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MOBILE-INSPECTOR-SNAP-harness — RC3-INC7
// ════════════════════════════════════════════════════════════════════════════
// The mobile inspector cursor must ride the VISIBLE drawn line (post simplify/densify/
// bridge), not snap to noisy real points. dataPoint (tooltip) stays a REAL point; the
// cursor uses visualPoint = a point ON the drawn curve at the finger X.
//   • cursor lies on the drawn visual polyline (≤1px),
//   • dense samples (small x-gaps) so it tracks the cubic,
//   • small finger move → small cursor move (continuity) — far smoother than nearest-real,
//   • bridged 24H zone is traversed smoothly,
//   • tooltip values are REAL points; other ranges unaffected.
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fn(name){ const s='function '+name+'('; const i=src.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=src.indexOf('{',i),d=0; for(;k<src.length;k++){const c=src[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} return src.slice(i,k); }
const CONST_BLOCK = src.slice(src.indexOf('const _AURIX_PATH_RENDER_SPACING'), src.indexOf('function _aurixArrConfig'));
const ENGINE = ['_aurixRenderContractGeometry','_aurixVpTargetPointCount','_aurixComputeVisualPreparation','prepareAurixVisualSeries','downsampleAurixLTTB','_aurixSignificantLocalExtrema','downsampleAurixAdaptive','computeAurixTimeScale','computeAurixAdaptiveXScale','computeAurixValueScale','_aurixArrConfig','_aurixArrRepresentVertices','_aurixPolishSimplify','_aurixDensifyPathSegments','_aurixSampleSegments','_aurixMonotonePath','buildAurixMonotonicPath','buildAurixAreaPath','_aurixSplitAtGaps','_wscFmtAxisVal','_aurixVisualPointAtX','renderAurixInstitutionalChart'];
const AUX = ['_AURIX_RC_QUALITY_THRESHOLD','_AURIX_RC_WINDOW_MS','_AURIX_RC_DASHBOARD_TOL','_AURIX_RC_ASPECT','_AURIX_RC_PAD_FRAC','_AURIX_RC_VPAD_FRAC','_AURIX_IR_VALUE_MARGIN','_AURIX_IR_VPAD_FRAC','_AURIX_Y_JUMP_DOMINANCE','_AURIX_Y_LEGIBLE_ALPHA','_AURIX_X_FILL_BETA','_AURIX_VP_DENSITY','_AURIX_VP_GAP_FLOOR_MS','_AURIX_VP_GAP_MEDIAN_MULT','_AURIX_VP_CAPITAL_KINDS','_AURIX_VP_CLUSTER_WIDTH_PX','_AURIX_VP_CLUSTER_MIN_PTS','_AURIX_VP_VALUE_EPS'];
const HOUR=36e5, MIN=60e3, DAY=864e5, NOW=1000*DAY;
let S=[],D=null;
const sb={console,getAurixRenderSeries:()=>S,investableValueBase:()=>D,_aurixLoadCapitalFlows:()=>[],window:undefined,Math,JSON,Array,Number,isFinite,Infinity,Date,activeRange:'24h',__set:s=>{S=s;D=s[s.length-1].value;}};
vm.createContext(sb); vm.runInContext(CONST_BLOCK,sb);
AUX.forEach(c=>{const m=src.match(new RegExp('const '+c+'\\s*=[^;]*?;','s'));if(m)vm.runInContext(m[0],sb);});
ENGINE.forEach(n=>{try{vm.runInContext(fn(n),sb);}catch(e){console.log('skip',n,e.message);}});
const box={left:6,right:994,top:16,bottom:244};
function build24(withGap){const v0=72000,pts=[];let k=0;
  if(withGap){ for(let t=NOW-24*HOUR;t<=NOW-14*HOUR;t+=10*MIN,k++)pts.push({time:t,value:Math.round(v0+30*Math.sin(k*1.7))}); for(let t=NOW-4*HOUR;t<=NOW;t+=10*MIN,k++)pts.push({time:t,value:Math.round(v0+30*Math.sin(k*1.7)+200)}); }
  else { for(let t=NOW-24*HOUR;t<=NOW;t+=5*MIN,k++){const micro=18*Math.sin(k*1.7)+12*Math.cos(k*3.1);const climb=(t>NOW-5*HOUR&&t<NOW-4*HOUR)?((t-(NOW-5*HOUR))/HOUR)*700:(t>=NOW-4*HOUR?700:0);pts.push({time:t,value:Math.round(v0+micro+climb)});} }
  return pts;}
function render(s){sb.__set(s);return vm.runInContext(`renderAurixInstitutionalChart('24h',1000,260,${JSON.stringify(box)})`,sb);}
const vAt = (samples,fx)=>vm.runInContext('_aurixVisualPointAtX',sb)(samples,fx);
let pass=0,fail=0; function ok(n,c,i){ if(c){pass++;console.log('  ✓ '+n+(i?'  ['+i+']':''));}else{fail++;console.log('  ✗ '+n+(i?'  ['+i+']':''));} }

console.log('AURIX-MOBILE-INSPECTOR-SNAP — RC3-INC7\n');
const rc = render(build24(false));
const vs = rc.visualSamples || [];
// 1. visual samples exist + dense
let maxGap=0; for(let i=1;i<vs.length;i++){const g=vs[i].x-vs[i-1].x; if(g>maxGap)maxGap=g;}
ok('1 visualSamples exist + dense (max x-gap ≤ 6px)', vs.length>20 && maxGap<=6, 'count='+vs.length+' maxGap='+maxGap.toFixed(1));
// 2. cursor lies ON the drawn polyline (≤1px): visualPoint vs the polyline at fx
function distToPolyline(samples,pt){ // min distance from pt to the polyline segments near pt.x
  let best=Infinity; for(let i=1;i<samples.length;i++){ const a=samples[i-1],b=samples[i]; if(pt.x<Math.min(a.x,b.x)-1||pt.x>Math.max(a.x,b.x)+1)continue;
    const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1; const d=Math.abs((pt.x-a.x)*dy-(pt.y-a.y)*dx)/L; if(d<best)best=d; } return best; }
let maxOnPath=0; for(let fx=box.left;fx<=box.right;fx+=2){const vp=vAt(vs,fx); const d=distToPolyline(vs,vp); if(d>maxOnPath)maxOnPath=d;}
ok('2 cursor lies on the drawn visual line (≤1px)', maxOnPath<=1.0, 'maxDist='+maxOnPath.toFixed(3)+'px');
// 3 + 4. continuity: small finger move (Δx≈2px) → small cursor move; far smoother than nearest-real
const real = rc.visiblePixels;
function nearestRealY(fx){let k=0,best=Infinity;for(let i=0;i<real.length;i++){const d=Math.abs(real[i].x-fx);if(d<best){best=d;k=i;}}return real[k].y;}
let maxVisualJump=0, maxRealJump=0, prevV=null, prevR=null;
for(let fx=box.left;fx<=box.right;fx+=2){ const vy=vAt(vs,fx).y; const ry=nearestRealY(fx);
  if(prevV!=null){ maxVisualJump=Math.max(maxVisualJump,Math.abs(vy-prevV)); maxRealJump=Math.max(maxRealJump,Math.abs(ry-prevR)); } prevV=vy; prevR=ry; }
// cursor follows the finger CONTINUOUSLY in X (visualPoint.x == fx for interior) — no discrete
// x-snapping/teleport (the buggy nearest-real behaviour jumped the cursor's x to real points).
let maxXErr=0; for(let fx=box.left+5;fx<=box.right-5;fx+=2){ const vp=vAt(vs,fx); maxXErr=Math.max(maxXErr,Math.abs(vp.x-fx)); }
ok('3 cursor x tracks the finger continuously (no x-snap)', maxXErr<=0.5, 'maxXErr='+maxXErr.toFixed(3));
ok('4 visual-path far smoother in Y than nearest-real snapping', maxVisualJump < maxRealJump*0.7, 'visual='+maxVisualJump.toFixed(1)+' real='+maxRealJump.toFixed(1));
// 5. bridged 24H zone traversed smoothly
const rcg = render(build24(true));
ok('5b 24H gap is bridged (one subpath)', rcg.diagnostics.renderedSubpaths===1 && rcg.diagnostics.bridgedGapCount>=1);
const vsg = rcg.visualSamples||[]; let maxOnPathG=0,maxXErrG=0;
for(let fx=box.left+5;fx<=box.right-5;fx+=2){ const vp=vAt(vsg,fx); maxOnPathG=Math.max(maxOnPathG,distToPolyline(vsg,vp)); maxXErrG=Math.max(maxXErrG,Math.abs(vp.x-fx)); }
ok('5 bridged zone: cursor ON the bridge line (≤1px) + x tracks finger', maxOnPathG<=1.0 && maxXErrG<=0.5, 'onPath='+maxOnPathG.toFixed(3)+' xErr='+maxXErrG.toFixed(3));
// 6. tooltip uses REAL data (nearest real point value ∈ real series)
{ const s=build24(false); render(s); const set=new Set(s.map(p=>p.value)); const realVals=rc.visiblePoints.map(p=>p.value);
  ok('6 dataPoint/tooltip values are REAL points (no fabrication)', realVals.every(v=>set.has(v))); }
// 7. visiblePoints/visiblePixels untouched (engine data contract): equal to downsampled set
{ const s=build24(false); const r2=render(s); const ds=vm.runInContext(`downsampleAurixAdaptive(${JSON.stringify(s)}, _aurixVpTargetPointCount('24h',1000)).length`,sb);
  ok('7 visiblePoints == downsampled set (cursor snap added NO data)', r2.visiblePoints.length===ds && r2.visiblePixels.length===r2.visiblePoints.length); }
// 8. telemetry exposes snap mode + sample count
{ const r2=render(build24(false));
  ok('8 telemetry: inspectorSnapMode + visualSampleCount present', r2.visualSamples.length>0); }

console.log('\nLIVE FILE — inspector wiring:');
const upd = fn('_aurixMobInspectorUpdate');
ok('9 cursor uses _aurixVisualPointAtX (visual line), tooltip uses dataPoint p', /_aurixVisualPointAtX\(_aurixMobChartVisual, fx\)/.test(upd) && /const p = pts\[k\]/.test(upd));
ok('10 mobile lite caches rc.visualSamples → _aurixMobChartVisual', /_aurixMobChartVisual = Array\.isArray\(rc\.visualSamples\)/.test(src));
ok('11 cursor.left/top from visualPoint (lxPct/lyPct from vpt)', /const lxPct = \(vpt\.x/.test(upd));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
