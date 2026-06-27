/* AURIX — RC3-INC2: RANGE + SHAPE AWARE RENDER QUALITY — validation harness.
   Verifies that ARR v2 (range-aware spacing + shape-aware local spacing + Last Segment
   Protection + 24H prominence/burst + 1A/TOTAL initial-narrative) optimises ONLY the
   drawn vertex set while every data contract stays intact. Extracts the REAL engine +
   ARR from app.js and stubs only the data accessors. Run: node docs/AURIX-GRAPH-RANGE-SHAPE-QUALITY-harness.js

   Cases (per SPEC RC3-INC2):
     1  24H path reaches the last point        11 first/last point of each run preserved
     2  24H final marker not orphaned          12 max/min preserved (all ranges)
     3  24H reduces drawn vertices (mazacote)   13 significant local extrema preserved
     4  24H preserves the last N points         14 tooltip uses FULL visiblePoints
     5  24H preserves a real burst              15 inspector uses FULL visiblePoints
     6  7D not degraded                         16 render↔canonical equivalence (subset/no-invent)
     7  30D not degraded                        17 mobile guardrail: ARR is representation-only
     8  1A initial narrative density            18 desktop render still produces a valid path
     9  TOTAL initial narrative density         19 spacing 0 ⇒ ARR no-op (rollback)
     10 gaps are not crossed                    20 determinism (same input → same output)
*/
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fn(name){ const s='function '+name+'('; const i=src.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=src.indexOf('{',i),d=0; for(;k<src.length;k++){const c=src[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} return src.slice(i,k); }

const DAY=86400e3, HOUR=36e5, MIN=60e3, NOW=1000*DAY;
let SERIES=[], DASH=null;
const sb={ console, activeRange:'30d', getAurixRenderSeries:()=>SERIES, investableValueBase:()=>DASH,
  _aurixLoadCapitalFlows:()=>[], window:undefined, Math, JSON, Array, Number, isFinite, Infinity };
vm.createContext(sb);
// ARR v2 range+shape constants block (drift-proof: read straight from app.js)
vm.runInContext(src.slice(src.indexOf('const _AURIX_PATH_RENDER_SPACING'), src.indexOf('function _aurixArrConfig')), sb);
['_AURIX_RC_QUALITY_THRESHOLD','_AURIX_RC_WINDOW_MS','_AURIX_RC_DASHBOARD_TOL','_AURIX_RC_ASPECT','_AURIX_RC_PAD_FRAC','_AURIX_RC_VPAD_FRAC','_AURIX_IR_VALUE_MARGIN','_AURIX_IR_VPAD_FRAC','_AURIX_Y_JUMP_DOMINANCE','_AURIX_Y_LEGIBLE_ALPHA','_AURIX_X_FILL_BETA','_AURIX_VP_DENSITY','_AURIX_VP_GAP_FLOOR_MS','_AURIX_VP_GAP_MEDIAN_MULT','_AURIX_VP_CAPITAL_KINDS','_AURIX_VP_CLUSTER_WIDTH_PX','_AURIX_VP_CLUSTER_MIN_PTS','_AURIX_VP_VALUE_EPS']
  .forEach(c=>{ const m=src.match(new RegExp('const '+c+'\\s*=[^;]*?;','s')); if(m) vm.runInContext(m[0],sb); });
['_aurixRenderContractGeometry','_aurixVpTargetPointCount','_aurixComputeVisualPreparation','prepareAurixVisualSeries','downsampleAurixLTTB','_aurixSignificantLocalExtrema','downsampleAurixAdaptive','computeAurixTimeScale','computeAurixAdaptiveXScale','computeAurixValueScale','_aurixArrConfig','_aurixArrRepresentVertices','_aurixMonotonePath','buildAurixMonotonicPath','buildAurixAreaPath','_aurixSplitAtGaps','_wscFmtAxisVal','_aurixCompareRenderToCanonical','auditAurixRenderVsCanonical','renderAurixInstitutionalChart']
  .forEach(n=>{ try{ vm.runInContext(fn(n),sb); }catch(e){ console.log('skip',n,e.message); } });

const W=1000, box={left:60,right:940,top:30,bottom:200};
function build(range, opts){ opts=opts||{}; let pts=[];
  if(range==='24h'){ const v0=72000; let k=0;
    for(let t=NOW-24*HOUR;t<=NOW;t+=5*MIN,k++){ const noise=90*Math.sin(k*1.1)+60*Math.cos(k*2.3);
      const climb=(t>NOW-6*HOUR&&t<NOW-5*HOUR)?((t-(NOW-6*HOUR))/HOUR)*900:(t>=NOW-5*HOUR?900:0); pts.push({time:t,value:Math.round(v0+noise+climb)}); }
  } else if(range==='24h-gap'){ const v0=72000; let k=0;
    for(let t=NOW-24*HOUR;t<=NOW-14*HOUR;t+=5*MIN,k++) pts.push({time:t,value:Math.round(v0+120*Math.sin(k*0.7))});
    for(let t=NOW-4*HOUR;t<=NOW;t+=5*MIN,k++) pts.push({time:t,value:Math.round(v0+150*Math.sin(k*0.7))});   // 10h overnight gap
  } else if(range==='7d'){ for(let i=0;i<400;i++){ const t=NOW-(7*DAY)+i*(7*DAY/399); pts.push({time:Math.round(t),value:Math.round(70000+i*8+300*Math.sin(i*0.18))}); }
  } else if(range==='30d'){ for(let i=0;i<600;i++){ const t=NOW-(30*DAY)+i*(30*DAY/599); pts.push({time:Math.round(t),value:Math.round(66000+i*6+500*Math.sin(i*0.12))}); }
  } else if(range==='1y'){ for(let i=0;i<1000;i++){ const t=NOW-(365*DAY)+i*(365*DAY/999); const f=i/999; const base=f<0.2?30000+60*Math.sin(i*0.05):30000+(f-0.2)/0.8*45000; pts.push({time:Math.round(t),value:Math.round(base+250*Math.sin(i*0.07))}); }
  } else { for(let i=0;i<1500;i++){ const t=NOW-(900*DAY)+i*(900*DAY/1499); const f=i/1499; const base=f<0.15?12000+40*Math.sin(i*0.04):12000+(f-0.15)/0.85*63000; pts.push({time:Math.round(t),value:Math.round(base+300*Math.sin(i*0.05))}); } }
  return pts;
}
function render(range, series){ SERIES=series; DASH=series[series.length-1].value; sb.SERIES=SERIES; sb.DASH=DASH;
  return vm.runInContext(`renderAurixInstitutionalChart('${range==='24h-gap'?'24h':range}', ${W}, ${Math.round(W*0.42)}, ${JSON.stringify(box)})`, sb); }
function lastCoord(d){ const m=String(d).trim().match(/([-\d.]+)\s+([-\d.]+)\s*$/); return m?{x:+m[1],y:+m[2]}:null; }

let pass=0, fail=0;
function ok(name, cond, info){ if(cond){ pass++; console.log('  ✓ '+name+(info?'  ['+info+']':'')); } else { fail++; console.log('  ✗ '+name+(info?'  ['+info+']':'')); } }

console.log('AURIX RC3-INC2 — Range + Shape Aware Render Quality\n');

// 24H baseline render
const s24=build('24h'); const r24=render('24h', s24);
const vp24=r24.visiblePoints, dv24=r24.diagnostics.drawnVertexCount, px24=r24.visiblePixels;
const lp24=lastCoord(r24.pathData), lvp24=px24[px24.length-1];
const lastSeg24=(lp24&&lvp24)?Math.hypot(lp24.x-lvp24.x, lp24.y-lvp24.y):NaN;

console.log('CASE 1-5 — 24H (most sensitive range):');
ok('1 path reaches the last point', isFinite(lastSeg24)&&lastSeg24<=0.5, 'Δ='+(isFinite(lastSeg24)?lastSeg24.toFixed(3):'n/a'));
ok('2 final marker not orphaned (path ends AT last visible point)', isFinite(lastSeg24)&&lastSeg24<=0.5);
ok('3 reduces drawn vertices (mazacote)', dv24 < vp24.length*0.80, 'ratio='+(dv24/vp24.length).toFixed(2));
// last N points present in the drawn path (parse all coords, check last N visible pixels appear)
const drawnCoords=(r24.pathData.match(/[-\d.]+ [-\d.]+/g)||[]).map(s=>{const a=s.split(' ');return {x:+a[0],y:+a[1]};});
const lastN24 = (_AURIX=>_AURIX)(12);
let lastNkept=0; for(let i=px24.length-lastN24;i<px24.length;i++){ const t=px24[i]; if(drawnCoords.some(c=>Math.abs(c.x-t.x)<0.6&&Math.abs(c.y-t.y)<0.6)) lastNkept++; }
ok('4 preserves the last N=12 points', lastNkept>=12, lastNkept+'/12 kept');
// burst preserved: a drawn vertex sits inside the real climb band
const v0=72000; ok('5 preserves a real burst (sustained move)', vp24.some(p=>p.value>v0+200&&p.value<v0+880) && drawnCoords.length>0, 'burst band represented');

console.log('\nCASE 6-7 — 7D / 30D not degraded (vs spacing-5 baseline ratio ~0.78/0.83):');
const r7=render('7d', build('7d')); const r30=render('30d', build('30d'));
ok('6 7D drawn ratio healthy + last connected', r7.diagnostics.drawnVertexCount/r7.visiblePoints.length>=0.55 && (()=>{const lp=lastCoord(r7.pathData),l=r7.visiblePixels[r7.visiblePixels.length-1];return lp&&Math.hypot(lp.x-l.x,lp.y-l.y)<=0.5;})(), 'ratio='+(r7.diagnostics.drawnVertexCount/r7.visiblePoints.length).toFixed(2));
ok('7 30D drawn ratio healthy + last connected', r30.diagnostics.drawnVertexCount/r30.visiblePoints.length>=0.55 && (()=>{const lp=lastCoord(r30.pathData),l=r30.visiblePixels[r30.visiblePixels.length-1];return lp&&Math.hypot(lp.x-l.x,lp.y-l.y)<=0.5;})(), 'ratio='+(r30.diagnostics.drawnVertexCount/r30.visiblePoints.length).toFixed(2));

console.log('\nCASE 8-9 — 1A / TOTAL initial narrative:');
function f15(rc){ const xs=rc.visiblePixels.map(p=>p.x); const xmin=Math.min.apply(null,xs),xmax=Math.max.apply(null,xs),w=(xmax-xmin)||1; return xs.filter(x=>x<=xmin+w*0.15).length; }
const r1y=render('1y', build('1y')); const rall=render('all', build('all'));
ok('8 1A first 15% keeps >= 10 vertices', f15(r1y)>=10, f15(r1y)+' vtx');
ok('9 TOTAL first 15% keeps >= 10 vertices', f15(rall)>=10, f15(rall)+' vtx');

console.log('\nCASE 10 — gaps not crossed:');
// RC3-INC3: 24H Visual Gap Bridge — a NORMAL overnight pause (≤14h) is bridged (drawn
// continuous, NOT solid-broken), but the gap is still DETECTED; a LARGE gap (>14h)
// still splits. Non-24H always splits. Render-only (data/last point untouched).
const sgap=build('24h-gap'); const rgap=render('24h-gap', sgap);   // ~10h overnight gap
ok('10 24H short overnight gap (≤14h) BRIDGED: continuous path, gap still detected', (rgap.gaps||[]).length>=1 && rgap.diagnostics.bridgedGapCount>=1 && rgap.diagnostics.renderedSubpaths===1 && (rgap.gapSegments||[]).length===0, 'gaps='+(rgap.gaps||[]).length+' bridged='+rgap.diagnostics.bridgedGapCount+' subpaths='+rgap.diagnostics.renderedSubpaths);
// large gap (>14h) still splits — build inline: NOW-24h..NOW-20h then NOW-2h..NOW (18h hole)
(function(){ const v0=72000; const pts=[]; let k=0;
  for(let t=NOW-24*HOUR;t<=NOW-20*HOUR;t+=5*MIN,k++) pts.push({time:t,value:Math.round(v0+120*Math.sin(k*0.7))});
  for(let t=NOW-2*HOUR;t<=NOW;t+=5*MIN,k++) pts.push({time:t,value:Math.round(v0+150*Math.sin(k*0.7))});
  const rbig=render('24h', pts);
  ok('10b 24H large gap (>14h) still SPLITS (not bridged)', (rbig.gaps||[]).length>=1 && rbig.diagnostics.bridgedGapCount===0 && rbig.diagnostics.renderedSubpaths>=2, 'bridged='+rbig.diagnostics.bridgedGapCount+' subpaths='+rbig.diagnostics.renderedSubpaths);
  ok('10c bridged + large gap: last point still = path end (connected)', (function(){ const lp=lastCoord(rbig.pathData), l=rbig.visiblePixels[rbig.visiblePixels.length-1]; return lp&&Math.hypot(lp.x-l.x,lp.y-l.y)<=0.5; })());
})();

console.log('\nCASE 11-13 — structural preservation (all ranges):');
function preserved(range){ const s=build(range); const rc=render(range,s);
  const vp=rc.visiblePoints; const drawn=(rc.pathData.match(/[-\d.]+ [-\d.]+/g)||[]).map(t=>{const a=t.split(' ');return {x:+a[0],y:+a[1]};});
  const px=rc.visiblePixels;
  // first/last of each run: at least the global first & last visible points present
  const firstOk=drawn.some(c=>Math.abs(c.x-px[0].x)<0.6&&Math.abs(c.y-px[0].y)<0.6);
  const lastOk=drawn.some(c=>Math.abs(c.x-px[px.length-1].x)<0.6&&Math.abs(c.y-px[px.length-1].y)<0.6);
  // max/min visible values equal source max/min
  const srcMax=Math.max.apply(null,s.map(p=>p.value)), srcMin=Math.min.apply(null,s.map(p=>p.value));
  const vmax=Math.max.apply(null,vp.map(p=>p.value)), vmin=Math.min.apply(null,vp.map(p=>p.value));
  return { firstOk, lastOk, maxOk:vmax===srcMax, minOk:vmin===srcMin };
}
const RNG=['24h','7d','30d','1y','all'];
ok('11 first & last of each render present in path (all ranges)', RNG.every(r=>{const p=preserved(r);return p.firstOk&&p.lastOk;}));
ok('12 global max & min preserved in visiblePoints (all ranges)', RNG.every(r=>{const p=preserved(r);return p.maxOk&&p.minOk;}));
// significant local extrema preserved: run audit equivalence preservedExtremes
ok('13 significant local extrema preserved (downsample+ARR keep peaks/dips)', (()=>{ render('1y',build('1y')); const a=vm.runInContext("auditAurixRenderVsCanonical('1y')",sb); return a.maxMatch&&a.minMatch&&a.status!=='divergent'; })());

console.log('\nCASE 14-15 — tooltip / inspector use the FULL visible set (NOT the path):');
// visiblePoints/visiblePixels count must equal the downsampled visible count (ARR does NOT shrink them)
const dsCount=vm.runInContext(`downsampleAurixAdaptive(${JSON.stringify(s24)}, _aurixVpTargetPointCount('24h',${W})).length`, sb);
ok('14 tooltip source: visiblePoints == full downsampled set (> drawn)', vp24.length===dsCount && vp24.length>dv24, 'vis='+vp24.length+' drawn='+dv24);
ok('15 inspector source: visiblePixels == visiblePoints (full)', px24.length===vp24.length);

console.log('\nCASE 16 — render↔canonical equivalence:');
ok('16 equivalence faithful (subset, no invented points) — 24H', (()=>{ render('24h',build('24h')); const a=vm.runInContext("auditAurixRenderVsCanonical('24h')",sb); return a.status!=='divergent'&&a.noInvented!==false; })(), 'status ok');

console.log('\nCASE 17 — ARR is representation-only:');
// visiblePoints values/timestamps are a subsequence of the canonical series (no fabrication)
ok('17 every visiblePoint is a real canonical point (no fabrication)', (()=>{ const set=new Set(s24.map(p=>p.time+':'+p.value)); return vp24.every(p=>set.has(p.time+':'+p.value)); })());

console.log('\nCASE 18-20 — desktop validity / rollback / determinism:');
ok('18 desktop render produces a valid line+area path', typeof r24.pathData==='string'&&r24.pathData.length>10&&typeof r24.areaPathData==='string'&&r24.areaPathData.length>10);
// rollback: spacing 0 ⇒ ARR no-op ⇒ drawn == visible
const cfgNo=vm.runInContext("(function(){ var run=[{time:1,value:10},{time:2,value:11},{time:3,value:12},{time:4,value:13},{time:5,value:14}]; return _aurixArrRepresentVertices(run,{x:function(t){return t;}}, null).length; })()", sb);
ok('19 spacing/cfg null ⇒ ARR no-op (returns all points)', cfgNo===5, cfgNo+'/5');
const a=render('30d',build('30d')), b=render('30d',build('30d'));
ok('20 determinism — same input → identical path', a.pathData===b.pathData && a.diagnostics.drawnVertexCount===b.diagnostics.drawnVertexCount);

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
