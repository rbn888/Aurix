'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MAX-SEGMENT-LENGTH-harness — RC3-INC4-C
// ════════════════════════════════════════════════════════════════════════════
// Contract: distance-aware subdivision keeps every rendered segment ≤ _AURIX_MAX_SEGMENT_PX
// (no "giant line" on sparse 1A/TOTAL). Subdivision is PURE GEOMETRY (points sampled ON the
// existing curve): visiblePoints count is unchanged (no data invented). Rollback by constant.
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fn(name){ const s='function '+name+'('; const i=src.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=src.indexOf('{',i),d=0; for(;k<src.length;k++){const c=src[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} return src.slice(i,k); }
const CONST_BLOCK = src.slice(src.indexOf('const _AURIX_PATH_RENDER_SPACING'), src.indexOf('function _aurixArrConfig'));
const ENGINE = ['_aurixRenderContractGeometry','_aurixVpTargetPointCount','_aurixComputeVisualPreparation','prepareAurixVisualSeries','downsampleAurixLTTB','_aurixSignificantLocalExtrema','downsampleAurixAdaptive','computeAurixTimeScale','computeAurixAdaptiveXScale','computeAurixValueScale','_aurixArrConfig','_aurixArrRepresentVertices','_aurixPolishSimplify','_aurixDensifyPathSegments','_aurixMonotonePath','buildAurixMonotonicPath','buildAurixAreaPath','_aurixSplitAtGaps','_wscFmtAxisVal','_aurixCompareRenderToCanonical','auditAurixRenderVsCanonical','renderAurixInstitutionalChart'];
const AUX = ['_AURIX_RC_QUALITY_THRESHOLD','_AURIX_RC_WINDOW_MS','_AURIX_RC_DASHBOARD_TOL','_AURIX_RC_ASPECT','_AURIX_RC_PAD_FRAC','_AURIX_RC_VPAD_FRAC','_AURIX_IR_VALUE_MARGIN','_AURIX_IR_VPAD_FRAC','_AURIX_Y_JUMP_DOMINANCE','_AURIX_Y_LEGIBLE_ALPHA','_AURIX_X_FILL_BETA','_AURIX_VP_DENSITY','_AURIX_VP_GAP_FLOOR_MS','_AURIX_VP_GAP_MEDIAN_MULT','_AURIX_VP_CAPITAL_KINDS','_AURIX_VP_CLUSTER_WIDTH_PX','_AURIX_VP_CLUSTER_MIN_PTS','_AURIX_VP_VALUE_EPS'];
const DAY=864e5;
function mk(constBlock){ let S=[],D=null;
  const sb={console,getAurixRenderSeries:()=>S,investableValueBase:()=>D,_aurixLoadCapitalFlows:()=>[],window:undefined,Math,JSON,Array,Number,isFinite,Infinity,Date,activeRange:'all',__set:s=>{S=s;D=s[s.length-1].value;}};
  vm.createContext(sb); vm.runInContext(constBlock,sb);
  AUX.forEach(c=>{const m=src.match(new RegExp('const '+c+'\\s*=[^;]*?;','s'));if(m)vm.runInContext(m[0],sb);});
  ENGINE.forEach(n=>{try{vm.runInContext(fn(n),sb);}catch(e){}}); return sb; }
const SB=mk(CONST_BLOCK), MAXPX = vm.runInContext('_AURIX_MAX_SEGMENT_PX', SB), box={left:60,right:940,top:30,bottom:200};
// sparse 1A/TOTAL: long flat-ish early history then growth → without subdivision the first
// segment is a huge line. Few source points → long pixel gaps.
function sparse(range, n){ const days={ '1y':365,'all':900 }[range], pts=[], NOW=1000*DAY;
  for(let i=0;i<n;i++){ const f=i/(n-1); const base = f<0.25 ? 20000 : 20000 + (f-0.25)/0.75*55000; pts.push({time:Math.round(NOW-days*DAY+f*days*DAY), value:Math.round(base)}); }
  return pts; }
function render(sb,range,s){ sb.__set(s); return vm.runInContext(`renderAurixInstitutionalChart('${range}',1000,${Math.round(1000*0.42)},${JSON.stringify(box)})`,sb); }
function coords(d){ const out=[]; const re=/([MLC])([^MLC]*)/g; let m;
  while((m=re.exec(d))){ const nums=m[2].trim().split(/[ ,]+/).map(Number).filter(x=>!isNaN(x)); if(m[1]==='C') out.push({x:nums[4],y:nums[5]}); else if(nums.length>=2) out.push({x:nums[0],y:nums[1]}); }
  return out; }
function maxSeg(d){ const c=coords(d); let mx=0; for(let i=1;i<c.length;i++){ const dd=Math.hypot(c[i].x-c[i-1].x,c[i].y-c[i-1].y); if(dd>mx)mx=dd; } return mx; }
let pass=0,fail=0; function ok(n,c,i){ if(c){pass++;console.log('  ✓ '+n+(i?'  ['+i+']':''));}else{fail++;console.log('  ✗ '+n+(i?'  ['+i+']':''));} }

console.log('AURIX-MAX-SEGMENT-LENGTH — RC3-INC4-C (no giant segments; pure geometry)\n');
console.log('threshold _AURIX_MAX_SEGMENT_PX =', MAXPX, 'viewBox px\n');
['1y','all'].forEach(r=>{
  [10, 20, 40].forEach(n=>{
    const s=sparse(r,n); const rc=render(SB,r,s);
    const ms=maxSeg(rc.pathData);
    ok(r+' n='+n+': max rendered segment ≤ threshold(+1px tol)', ms <= MAXPX+1, 'maxSeg='+ms.toFixed(1));
  });
});
// data NOT invented: visiblePoints count == downsampled count (subdivision is geometry-only)
{ const s=sparse('all',12); const rc=render(SB,'all',s);
  const dsCount=vm.runInContext(`downsampleAurixAdaptive(${JSON.stringify(s)}, _aurixVpTargetPointCount('all',1000)).length`, SB);
  ok('subdivision adds NO data points (visiblePoints == downsampled set)', rc.visiblePoints.length===dsCount, 'vis='+rc.visiblePoints.length+' ds='+dsCount);
  ok('subdivision keeps equivalence (sampled points on the curve, not new data)', (function(){ const a=vm.runInContext("auditAurixRenderVsCanonical('all')",SB); return a.status!=='divergent'; })()); }
// last point still exactly the end of the path (subdivision doesn't move the endpoint)
{ const s=sparse('1y',10); const rc=render(SB,'1y',s);
  const m=String(rc.pathData).trim().match(/([-\d.]+)\s+([-\d.]+)\s*$/); const lvp=rc.visiblePixels[rc.visiblePixels.length-1];
  ok('last path coord == last real point (subdivision preserves endpoint)', m && Math.hypot(+m[1]-lvp.x,+m[2]-lvp.y)<0.25); }

console.log('\nROLLBACK:');
{ const sbOff=mk(CONST_BLOCK.replace(/_AURIX_MAX_SEGMENT_PX = \d+/, '_AURIX_MAX_SEGMENT_PX = 0'));
  const s=sparse('all',8); const rc=render(sbOff,'all',s);
  ok('MAX_SEGMENT_PX=0 → subdivision OFF (long segments allowed again)', maxSeg(rc.pathData) > MAXPX, 'maxSeg='+maxSeg(rc.pathData).toFixed(1)); }

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
