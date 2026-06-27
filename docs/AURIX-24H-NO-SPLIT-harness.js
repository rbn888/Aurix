'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-24H-NO-SPLIT-harness — RC3-INC4 RULE 0 (PERMANENT CONTRACT)
// ════════════════════════════════════════════════════════════════════════════
// The 24H path NEVER splits for a pause. It is one continuous subpath across EVERY
// internal gap (any duration, any hour, any wealth move) as long as the data is valid.
// It may break ONLY structurally: invalid series (<2 pts) / corrupted data. Other ranges
// still split at real gaps. ROLLBACK: _AURIX_GAP_BRIDGE_24H_ENABLED=false restores splits.
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fn(name){ const s='function '+name+'('; const i=src.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=src.indexOf('{',i),d=0; for(;k<src.length;k++){const c=src[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} return src.slice(i,k); }
const CONST_BLOCK = src.slice(src.indexOf('const _AURIX_PATH_RENDER_SPACING'), src.indexOf('function _aurixArrConfig'));
const ENGINE = ['_aurixRenderContractGeometry','_aurixVpTargetPointCount','_aurixComputeVisualPreparation','prepareAurixVisualSeries','downsampleAurixLTTB','_aurixSignificantLocalExtrema','downsampleAurixAdaptive','computeAurixTimeScale','computeAurixAdaptiveXScale','computeAurixValueScale','_aurixArrConfig','_aurixArrRepresentVertices','_aurixPolishSimplify','_aurixDensifyPathSegments','_aurixMonotonePath','buildAurixMonotonicPath','buildAurixAreaPath','_aurixSplitAtGaps','_wscFmtAxisVal','renderAurixInstitutionalChart'];
const AUX = ['_AURIX_RC_QUALITY_THRESHOLD','_AURIX_RC_WINDOW_MS','_AURIX_RC_DASHBOARD_TOL','_AURIX_RC_ASPECT','_AURIX_RC_PAD_FRAC','_AURIX_RC_VPAD_FRAC','_AURIX_IR_VALUE_MARGIN','_AURIX_IR_VPAD_FRAC','_AURIX_Y_JUMP_DOMINANCE','_AURIX_Y_LEGIBLE_ALPHA','_AURIX_X_FILL_BETA','_AURIX_VP_DENSITY','_AURIX_VP_GAP_FLOOR_MS','_AURIX_VP_GAP_MEDIAN_MULT','_AURIX_VP_CAPITAL_KINDS','_AURIX_VP_CLUSTER_WIDTH_PX','_AURIX_VP_CLUSTER_MIN_PTS','_AURIX_VP_VALUE_EPS'];
const MIN=60e3, HOUR=36e5, DAY=864e5;
function mk(constBlock){ let S=[],D=null;
  const sb={console,getAurixRenderSeries:()=>S,investableValueBase:()=>D,_aurixLoadCapitalFlows:()=>[],window:undefined,Math,JSON,Array,Number,isFinite,Infinity,Date,activeRange:'24h',__set:s=>{S=s;D=s[s.length-1].value;}};
  vm.createContext(sb); vm.runInContext(constBlock,sb);
  AUX.forEach(c=>{const m=src.match(new RegExp('const '+c+'\\s*=[^;]*?;','s'));if(m)vm.runInContext(m[0],sb);});
  ENGINE.forEach(n=>{try{vm.runInContext(fn(n),sb);}catch(e){}}); return sb; }
const SB=mk(CONST_BLOCK), box={left:6,right:994,top:16,bottom:244};
function T(h,mi,dayOff){ return new Date(2026,5,15+(dayOff||0),h,mi||0,0).getTime(); }
// 24h series with a single gap [gA→gB]; pre-gap block ends at gA, post-gap 3h from gB.
function gap24(gA,gB){ const v0=72000,pts=[]; let k=0;
  for(let t=gA-10*HOUR;t<=gA;t+=15*MIN,k++) pts.push({time:t,value:Math.round(v0+100*Math.sin(k*0.5))});
  for(let t=gB;t<=gB+3*HOUR;t+=15*MIN,k++) pts.push({time:t,value:Math.round(v0+100*Math.sin(k*0.5))});
  return pts; }
function render(sb,range,s){ sb.__set(s); return vm.runInContext(`renderAurixInstitutionalChart('${range}',1000,260,${JSON.stringify(box)})`,sb); }
let pass=0,fail=0; function ok(n,c,i){ if(c){pass++;console.log('  ✓ '+n+(i?'  ['+i+']':''));}else{fail++;console.log('  ✗ '+n+(i?'  ['+i+']':''));} }

console.log('AURIX-24H-NO-SPLIT — RULE 0 permanent contract\n');
// A range of pause scenarios — ALL must render as ONE subpath (never split) in 24H.
const scenarios = [
  ['nocturnal 10h (23:00→09:00)', T(23,0,-1), T(9,0,0)],
  ['nocturnal 12h (21:00→09:00)', T(21,0,-1), T(9,0,0)],
  ['daytime 9h (08:00→17:00)',    T(8,0,0), T(17,0,0)],            // daytime pause (>8h floor → detected)
  ['long 17h (16:00→09:00)',      T(16,0,-1), T(9,0,0)],
  ['very long 20h (13:00→09:00)', T(13,0,-1), T(9,0,0)],
];
scenarios.forEach(([label,gA,gB])=>{
  const s = gap24(gA,gB);
  const rc = render(SB,'24h',s);
  ok('24H '+label+' → ONE subpath (no split)', (rc.gaps||[]).length>=1 && rc.diagnostics.renderedSubpaths===1, 'gaps='+(rc.gaps||[]).length+' subpaths='+rc.diagnostics.renderedSubpaths);
});
// last point always connected (marker never orphaned) on a bridged 24H
{ const rc = render(SB,'24h',gap24(T(23,0,-1),T(9,0,0)));
  const lrv=rc.lastRenderedVertex,l=rc.visiblePixels[rc.visiblePixels.length-1];
  ok('24H bridged: last point connected', lrv&&Math.hypot(lrv.x-l.x,lrv.y-l.y)<0.25); }
// data contracts on a bridged 24H
{ const s=gap24(T(23,0,-1),T(9,0,0)); const rc=render(SB,'24h',s);
  const srcMax=Math.max.apply(null,s.map(p=>p.value)), srcMin=Math.min.apply(null,s.map(p=>p.value));
  const vmax=Math.max.apply(null,rc.visiblePoints.map(p=>p.value)), vmin=Math.min.apply(null,rc.visiblePoints.map(p=>p.value));
  ok('24H bridged: max/min preserved + last==dashboard', vmax===srcMax && vmin===srcMin && rc.visiblePoints[rc.visiblePoints.length-1].value===s[s.length-1].value); }

console.log('\nSTRUCTURAL split allowed; other ranges still split:');
// other ranges still split at a real (>floor) gap
{ const now=T(12,0,0),pts=[]; for(let i=0;i<12;i++)pts.push({time:now-30*DAY+i*(DAY/2),value:70000+i*8}); for(let i=0;i<12;i++)pts.push({time:now-14*DAY+i*DAY,value:70100+i*8});
  const rc=render(SB,'30d',pts);
  ok('30D real gap STILL splits (range-gated; only 24H bridges)', rc.diagnostics.renderedSubpaths>=2 && rc.diagnostics.bridgedGapCount===0); }

console.log('\nROLLBACK:');
{ const sbOff=mk(CONST_BLOCK.replace('_AURIX_GAP_BRIDGE_24H_ENABLED = true','_AURIX_GAP_BRIDGE_24H_ENABLED = false'));
  const rc=render(sbOff,'24h',gap24(T(23,0,-1),T(9,0,0)));
  ok('ENABLED=false → 24H splits again (rollback)', rc.diagnostics.renderedSubpaths>=2 && rc.diagnostics.bridgedGapCount===0); }

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
