'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-LAST-MARKER-LOCK-harness — RC3-INC4-B
// ════════════════════════════════════════════════════════════════════════════
// Contract: the end marker sits EXACTLY on the last rendered vertex of the SVG path.
//   rc.lastRenderedVertex == parse(last coord of rc.pathData) == last real visiblePixel
//   max error < 0.25 px, across ALL ranges, with the polish passes ON.
// Plus a live-file check that the WSC marker is built from lastRenderedVertex (not a
// recomputed sample).
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fn(name){ const s='function '+name+'('; const i=src.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=src.indexOf('{',i),d=0; for(;k<src.length;k++){const c=src[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} return src.slice(i,k); }
const CONST_BLOCK = src.slice(src.indexOf('const _AURIX_PATH_RENDER_SPACING'), src.indexOf('function _aurixArrConfig'));
const ENGINE = ['_aurixRenderContractGeometry','_aurixVpTargetPointCount','_aurixComputeVisualPreparation','prepareAurixVisualSeries','downsampleAurixLTTB','_aurixSignificantLocalExtrema','downsampleAurixAdaptive','computeAurixTimeScale','computeAurixAdaptiveXScale','computeAurixValueScale','_aurixArrConfig','_aurixArrRepresentVertices','_aurixPolishSimplify','_aurixDensifyPathSegments','_aurixMonotonePath','buildAurixMonotonicPath','buildAurixAreaPath','_aurixSplitAtGaps','_wscFmtAxisVal','renderAurixInstitutionalChart'];
const AUX = ['_AURIX_RC_QUALITY_THRESHOLD','_AURIX_RC_WINDOW_MS','_AURIX_RC_DASHBOARD_TOL','_AURIX_RC_ASPECT','_AURIX_RC_PAD_FRAC','_AURIX_RC_VPAD_FRAC','_AURIX_IR_VALUE_MARGIN','_AURIX_IR_VPAD_FRAC','_AURIX_Y_JUMP_DOMINANCE','_AURIX_Y_LEGIBLE_ALPHA','_AURIX_X_FILL_BETA','_AURIX_VP_DENSITY','_AURIX_VP_GAP_FLOOR_MS','_AURIX_VP_GAP_MEDIAN_MULT','_AURIX_VP_CAPITAL_KINDS','_AURIX_VP_CLUSTER_WIDTH_PX','_AURIX_VP_CLUSTER_MIN_PTS','_AURIX_VP_VALUE_EPS'];
const DAY=864e5, HOUR=36e5, MIN=60e3, NOW=1000*DAY;
let S=[],D=null;
const sb={console,getAurixRenderSeries:()=>S,investableValueBase:()=>D,_aurixLoadCapitalFlows:()=>[],window:undefined,Math,JSON,Array,Number,isFinite,Infinity,Date,activeRange:'30d'};
vm.createContext(sb); vm.runInContext(CONST_BLOCK,sb);
AUX.forEach(c=>{const m=src.match(new RegExp('const '+c+'\\s*=[^;]*?;','s'));if(m)vm.runInContext(m[0],sb);});
ENGINE.forEach(n=>{try{vm.runInContext(fn(n),sb);}catch(e){}});
function build(range){let pts=[];
  if(range==='24h'){const v0=72000;let k=0;for(let t=NOW-24*HOUR;t<=NOW;t+=5*MIN,k++){const noise=90*Math.sin(k*1.1)+60*Math.cos(k*2.3);pts.push({time:t,value:Math.round(v0+noise)});}}
  else if(range==='7d'){for(let i=0;i<400;i++)pts.push({time:Math.round(NOW-7*DAY+i*(7*DAY/399)),value:Math.round(70000+i*8+300*Math.sin(i*0.18))});}
  else if(range==='30d'){for(let i=0;i<600;i++)pts.push({time:Math.round(NOW-30*DAY+i*(30*DAY/599)),value:Math.round(66000+i*6+500*Math.sin(i*0.12))});}
  else if(range==='1y'){for(let i=0;i<1000;i++){const f=i/999;pts.push({time:Math.round(NOW-365*DAY+i*(365*DAY/999)),value:Math.round((f<0.2?30000:30000+(f-0.2)/0.8*45000)+250*Math.sin(i*0.07))});}}
  else{for(let i=0;i<1500;i++){const f=i/1499;pts.push({time:Math.round(NOW-900*DAY+i*(900*DAY/1499)),value:Math.round((f<0.15?12000:12000+(f-0.15)/0.85*63000)+300*Math.sin(i*0.05))});}}
  return pts;}
function render(range){ S=build(range); D=S[S.length-1].value; sb.SERIES=S;
  return vm.runInContext(`renderAurixInstitutionalChart('${range}',1000,${Math.round(1000*0.42)},${JSON.stringify({left:60,right:940,top:30,bottom:200})})`,sb); }
function lastCoord(d){ const m=String(d).trim().match(/([-\d.]+)\s+([-\d.]+)\s*$/); return m?{x:+m[1],y:+m[2]}:null; }
let pass=0,fail=0; function ok(n,c,i){ if(c){pass++;console.log('  ✓ '+n+(i?'  ['+i+']':''));}else{fail++;console.log('  ✗ '+n+(i?'  ['+i+']':''));} }

console.log('AURIX-LAST-MARKER-LOCK — RC3-INC4-B (marker on the exact last rendered vertex)\n');
['24h','7d','30d','1y','all'].forEach(r=>{
  const rc=render(r);
  const lrv=rc.lastRenderedVertex, pc=lastCoord(rc.pathData), lvp=rc.visiblePixels[rc.visiblePixels.length-1];
  const dPath = (lrv&&pc)?Math.hypot(lrv.x-pc.x,lrv.y-pc.y):NaN;          // lastRenderedVertex == path end
  const dVis  = (lrv&&lvp)?Math.hypot(lrv.x-lvp.x,lrv.y-lvp.y):NaN;       // == last real visible point
  ok(r+': lastRenderedVertex == path-end (<0.25px)', isFinite(dPath)&&dPath<0.25, 'Δ='+(isFinite(dPath)?dPath.toFixed(4):'n/a'));
  ok(r+': lastRenderedVertex == last real point (<0.25px)', isFinite(dVis)&&dVis<0.25, 'Δ='+(isFinite(dVis)?dVis.toFixed(4):'n/a'));
});

console.log('\nLIVE FILE — WSC marker derives from lastRenderedVertex:');
const S0=src.indexOf('function _wscPaintSurface'); const paint=src.slice(S0, src.indexOf('\n}', src.indexOf('hostEl.innerHTML',S0)));
ok('marker uses _inst.rendered.lastRenderedVertex (not a recomputed sample)', /lastRenderedVertex/.test(paint) && /wsc-last-dot/.test(paint) && /_vx \/ W/.test(paint));
ok('engine exposes rc.lastRenderedVertex', /lastRenderedVertex,?\s/.test(src.slice(src.indexOf('areaPathData, lastRenderedVertex'), src.indexOf('areaPathData, lastRenderedVertex')+40)) || src.indexOf('areaPathData, lastRenderedVertex') >= 0);

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
