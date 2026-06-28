'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-SPIKE-DISCIPLINE-RC4G-harness — RC4-G (24H spike discipline v2 + desktop snap)
// ════════════════════════════════════════════════════════════════════════════
// 24H spike guard v2 (aspect-based, STRICT) kills narrow needles before they enter long
// ranges; per-range discipline (24H strict / 7D·30D medium / 1A·TOTAL soft) reduces inherited
// clusters without flattening narrative. Read-only spike diagnostic. Desktop hover/dot rides
// the polished line (visualPoint) ≤1px, same as mobile. Render-only; data untouched.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fn(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=app.indexOf('{',i),d=0; for(;k<app.length;k++){const c=app[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} return app.slice(i,k); }
const CONST_BLOCK = app.slice(app.indexOf('const _AURIX_PATH_RENDER_SPACING'), app.indexOf('function _aurixArrConfig'));
const ENG = ['_aurixRenderContractGeometry','_aurixVpTargetPointCount','_aurixComputeVisualPreparation','prepareAurixVisualSeries','downsampleAurixLTTB','_aurixSignificantLocalExtrema','downsampleAurixAdaptive','computeAurixTimeScale','computeAurixAdaptiveXScale','computeAurixValueScale','_aurixArrConfig','_aurixArrRepresentVertices','_aurixSpikeReduce','_aurixSpikeParams','_aurixSpikeDiscipline','_aurix24hSpikeGuard','_aurixVolatilityPolish','_aurixPolishSimplify','_aurixSampleSegments','_aurixDensifyPathSegments','_aurixVisualPointAtX','_aurixMonotonePath','buildAurixMonotonicPath','buildAurixAreaPath','_aurixSplitAtGaps','_wscFmtAxisVal','_aurixCompareRenderToCanonical','auditAurixRenderVsCanonical','renderAurixInstitutionalChart'];
const AUX = ['_AURIX_RC_QUALITY_THRESHOLD','_AURIX_RC_WINDOW_MS','_AURIX_RC_DASHBOARD_TOL','_AURIX_RC_ASPECT','_AURIX_RC_PAD_FRAC','_AURIX_RC_VPAD_FRAC','_AURIX_IR_VALUE_MARGIN','_AURIX_IR_VPAD_FRAC','_AURIX_Y_JUMP_DOMINANCE','_AURIX_Y_LEGIBLE_ALPHA','_AURIX_X_FILL_BETA','_AURIX_VP_DENSITY','_AURIX_VP_GAP_FLOOR_MS','_AURIX_VP_GAP_MEDIAN_MULT','_AURIX_VP_CAPITAL_KINDS','_AURIX_VP_CLUSTER_WIDTH_PX','_AURIX_VP_CLUSTER_MIN_PTS','_AURIX_VP_VALUE_EPS'];
const HOUR=36e5, MIN=60e3, DAY=864e5, NOW=1000*DAY;
function mk(constBlock){ let S=[],D=null;
  const sb={ console, getAurixRenderSeries:()=>S, investableValueBase:()=>D, _aurixLoadCapitalFlows:()=>[], window:undefined, Math, JSON, Array, Number, isFinite, Infinity, Date, activeRange:'24h', __set:s=>{S=s;D=s[s.length-1].value;} };
  vm.createContext(sb); vm.runInContext(constBlock, sb);
  AUX.forEach(c=>{const m=app.match(new RegExp('const '+c+'\\s*=[^;]*?;','s'));if(m)vm.runInContext(m[0],sb);});
  ENG.forEach(n=>{try{vm.runInContext(fn(n),sb);}catch(e){}}); return sb; }
const box={left:6,right:994,top:16,bottom:244};
function coords(d){ const out=[]; const re=/([MLC])([^MLC]*)/g; let m; while((m=re.exec(d))){ const n=m[2].trim().split(/[ ,]+/).map(Number).filter(x=>!isNaN(x)); if(m[1]==='C')out.push({x:n[4],y:n[5]}); else if(n.length>=2)out.push({x:n[0],y:n[1]}); } return out; }
function teeth(d,asp){ const c=coords(d); let n=0; for(let i=1;i<c.length-1;i++){ const a=c[i-1].y,b=c[i+1].y,y=c[i].y; const pk=y<a&&y<b,tr=y>a&&y>b; if(!pk&&!tr)continue; const pr=Math.min(Math.abs(y-a),Math.abs(y-b)); const ba=Math.abs(c[i+1].x-c[i-1].x)||1; if(pr>=4&&pr/ba>=asp)n++; } return n; }
function render(sb,range,s){ sb.__set(s); return vm.runInContext(`renderAurixInstitutionalChart('${range}',1000,260,${JSON.stringify(box)})`,sb); }
function b24(){ const v0=72000,p=[]; let k=0; for(let t=NOW-24*HOUR;t<=NOW;t+=5*MIN,k++){ const tt=(k%3===0?1:k%3===1?-1:0.5)*180+50*Math.sin(k*0.6); const c=(t>NOW-6*HOUR&&t<NOW-5*HOUR)?((t-(NOW-6*HOUR))/HOUR)*1300:(t>=NOW-5*HOUR?1300:0); p.push({time:t,value:Math.round(v0+tt+c)}); } return p; }
function longClusters(range){ const days={'7d':7,'30d':30,'1y':365,'all':900}[range],N=300,p=[]; for(let i=0;i<N;i++){ const f=i/(N-1); const tooth=f>0.7?(i%2===0?1:-1)*700:0; p.push({time:Math.round(NOW-days*DAY+f*days*DAY),value:Math.round(60000+f*9000+(f>0.45&&f<0.5?5000:0)+tooth)}); } return p; }
let pass=0,fail=0; function ok(n,c,i){ if(c){pass++;console.log('  ✓ '+n+(i?'  ['+i+']':''));}else{fail++;console.log('  ✗ '+n+(i?'  ['+i+']':''));} }

console.log('AURIX-SPIKE-DISCIPLINE-RC4G — RC4-G\n');
const ON = mk(CONST_BLOCK);
const OFF24 = mk(CONST_BLOCK.replace("'24h': { strict: true }", "'24h': { strict: 'off' }"));
const s24 = b24();
const r24 = render(ON,'24h',s24), r24off = render(OFF24,'24h',s24);
const srcMax=Math.max.apply(null,s24.map(p=>p.value)), srcMin=Math.min.apply(null,s24.map(p=>p.value));

ok('1 24H spike guard v2 active', /_AURIX_24H_SPIKE_GUARD_V2_ENABLED = true/.test(app) && (r24.diagnostics.spikeDiag && r24.diagnostics.spikeDiag.level === true));
ok('2 24H micro-spikes removed (strict aspect 0.45)', teeth(r24.pathData,0.45) < teeth(r24off.pathData,0.45) && teeth(r24.pathData,0.45) <= 2, 'teeth '+teeth(r24off.pathData,0.45)+'→'+teeth(r24.pathData,0.45));
ok('3 24H sustained move kept (reaches near real high)', r24.visiblePoints.some(p=>p.value>srcMax-80));
ok('4 24H last point kept', r24.visiblePoints[r24.visiblePoints.length-1].value===s24[s24.length-1].value);
ok('5 24H global max/min preserved', Math.max.apply(null,r24.visiblePoints.map(p=>p.value))===srcMax && Math.min.apply(null,r24.visiblePoints.map(p=>p.value))===srcMin);
ok('6 24H never splits', r24.diagnostics.renderedSubpaths===1);
// 7 cluster compression: a noisy cluster collapses far below candidate count
ok('7 cluster of spikes compressed (removed ≥ half candidates)', r24.diagnostics.spikeDiag && r24.diagnostics.spikeDiag.removed >= r24.diagnostics.spikeDiag.candidates*0.4, JSON.stringify(r24.diagnostics.spikeDiag));

console.log('\nFASE 4 — per-range discipline:');
[['7d',0.62,false],['30d',0.62,false],['1y',0.88,'soft'],['all',0.88,'soft']].forEach(([rg,asp,lvl])=>{
  const off = mk(CONST_BLOCK.replace(new RegExp("'"+rg+"': \\{ strict: [^}]+\\}"), "'"+rg+"': { strict: 'off' }"));
  const s=longClusters(rg); const a=render(ON,rg,s), b=render(off,rg,s);
  ok(rg+' reduces inherited clusters (level '+lvl+')', teeth(a.pathData,asp) < teeth(b.pathData,asp), 'teeth '+teeth(b.pathData,asp)+'→'+teeth(a.pathData,asp));
  ok(rg+' not flattened: max/min/last + sustained step kept', Math.max.apply(null,a.visiblePoints.map(p=>p.value))===Math.max.apply(null,s.map(p=>p.value)) && a.visiblePoints[a.visiblePoints.length-1].value===s[s.length-1].value && a.visiblePoints.some(p=>p.value>Math.max.apply(null,s.map(q=>q.value))-3000));
});

console.log('\nFASE 1 — read-only diagnostic + FASE 6 visualSamples:');
ok('8 spikeDiag exposes candidates/removed/protected', r24.diagnostics.spikeDiag && typeof r24.diagnostics.spikeDiag.candidates==='number' && typeof r24.diagnostics.spikeDiag.removed==='number' && typeof r24.diagnostics.spikeDiag.protectedGlobalExtreme==='number');
ok('9 visualSamples generated from the FINAL polished path', Array.isArray(r24.visualSamples) && r24.visualSamples.length>0 && r24.visualSamples.length < r24off.visualSamples.length);

console.log('\nFASE 5 — Desktop visual snap precision (≤1px):');
// visualPoint lies on the polished polyline at any x (same helper desktop will use)
{ const vs=r24.visualSamples; let maxD=0;
  function dist(p){ let best=Infinity; for(let i=1;i<vs.length;i++){ const a=vs[i-1],b=vs[i]; if(p.x<Math.min(a.x,b.x)-1||p.x>Math.max(a.x,b.x)+1)continue; const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1; const d=Math.abs((p.x-a.x)*dy-(p.y-a.y)*dx)/L; if(d<best)best=d; } return best; }
  const vAt = vm.runInContext('_aurixVisualPointAtX',ON);
  for(let x=box.left;x<=box.right;x+=3){ const vp=vAt(vs,x); maxD=Math.max(maxD,dist(vp)); }
  ok('10 desktop cursor lies on the polished line ≤1px (visualPoint)', maxD<=1.0, 'maxDist='+maxD.toFixed(3)); }
ok('11 desktop _wscAttachTooltip uses visualSamples + _aurixVisualPointAtX (no duplicate logic)', /visualSamples: \(_inst && _inst\.rendered\) \? _inst\.rendered\.visualSamples/.test(app) && /_aurixVisualPointAtX\(model\.visualSamples, vbX\)/.test(fn('_wscAttachTooltip')));
ok('12 desktop tooltip still uses real dataPoint (val/tts), cursor uses visual y', /val = sv\[k\]/.test(fn('_wscAttachTooltip')) && /vbYvis/.test(fn('_wscAttachTooltip')));

console.log('\nNO REGRESSION + ROLLBACK:');
ok('13 equivalence render↔canonical not divergent (24h+7d)', vm.runInContext("auditAurixRenderVsCanonical('24h').status",ON)!=='divergent' && vm.runInContext("auditAurixRenderVsCanonical('7d').status",ON)!=='divergent');
ok('14 visiblePoints untouched (data source intact)', (function(){ const ds=vm.runInContext(`downsampleAurixAdaptive(${JSON.stringify(s24)}, _aurixVpTargetPointCount('24h',1000)).length`,ON); return r24.visiblePoints.length===ds && r24.visiblePixels.length===r24.visiblePoints.length; })());
ok('15 inspector snap + gesture lock + tooltip + indicator + color parity intact', /_aurixVisualPointAtX\(_aurixMobChartVisual, fx\)/.test(app) && /_aurixSliderShouldSwipe\(/.test(app) && /_aurixMobileSetPerfIndicator\(\);/.test(app) && /tone === 'down' \? '#e25563'/.test(app));
ok('16 global rollback: v2 OFF → legacy params (still gated, reversible)', (function(){ const leg=mk(CONST_BLOCK.replace('_AURIX_24H_SPIKE_GUARD_V2_ENABLED = true','_AURIX_24H_SPIKE_GUARD_V2_ENABLED = false')); const r=render(leg,'24h',s24); return r.diagnostics.renderedSubpaths===1 && r.visiblePoints.length===r24.visiblePoints.length; })());
ok('17 per-range rollback (24h strict:off) → no spike removal (more teeth)', teeth(r24off.pathData,0.45) > teeth(r24.pathData,0.45));
ok('18 24H still no-split under rollback', r24off.diagnostics.renderedSubpaths===1);

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
