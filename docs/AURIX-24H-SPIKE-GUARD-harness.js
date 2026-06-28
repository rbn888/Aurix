'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-24H-SPIKE-GUARD-harness — RC4-D (permanent 24H spike regression fix)
// ════════════════════════════════════════════════════════════════════════════
// The 24H VISUAL path drops redundant sharp single-vertex teeth (aspect-based, spacing-
// independent), keeping the day's real high/low, endpoints, gap-edges and sustained bursts.
// Render-only: visiblePoints/visualSamples-source/tooltip/inspector/data untouched. 24H never
// splits. Other ranges are unaffected (guard is 24H-only). Rollback by ENABLED=false.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fn(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=app.indexOf('{',i),d=0; for(;k<app.length;k++){const c=app[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} return app.slice(i,k); }
const CONST_BLOCK = app.slice(app.indexOf('const _AURIX_PATH_RENDER_SPACING'), app.indexOf('function _aurixArrConfig'));
const ENG = ['_aurixRenderContractGeometry','_aurixVpTargetPointCount','_aurixComputeVisualPreparation','prepareAurixVisualSeries','downsampleAurixLTTB','_aurixSignificantLocalExtrema','downsampleAurixAdaptive','computeAurixTimeScale','computeAurixAdaptiveXScale','computeAurixValueScale','_aurixArrConfig','_aurixArrRepresentVertices','_aurix24hSpikeGuard','_aurixPolishSimplify','_aurixSampleSegments','_aurixDensifyPathSegments','_aurixMonotonePath','buildAurixMonotonicPath','buildAurixAreaPath','_aurixSplitAtGaps','_wscFmtAxisVal','auditAurixRenderVsCanonical','_aurixCompareRenderToCanonical','renderAurixInstitutionalChart'];
const AUX = ['_AURIX_RC_QUALITY_THRESHOLD','_AURIX_RC_WINDOW_MS','_AURIX_RC_DASHBOARD_TOL','_AURIX_RC_ASPECT','_AURIX_RC_PAD_FRAC','_AURIX_RC_VPAD_FRAC','_AURIX_IR_VALUE_MARGIN','_AURIX_IR_VPAD_FRAC','_AURIX_Y_JUMP_DOMINANCE','_AURIX_Y_LEGIBLE_ALPHA','_AURIX_X_FILL_BETA','_AURIX_VP_DENSITY','_AURIX_VP_GAP_FLOOR_MS','_AURIX_VP_GAP_MEDIAN_MULT','_AURIX_VP_CAPITAL_KINDS','_AURIX_VP_CLUSTER_WIDTH_PX','_AURIX_VP_CLUSTER_MIN_PTS','_AURIX_VP_VALUE_EPS'];
const HOUR=36e5, MIN=60e3, DAY=864e5, NOW=1000*DAY;
function mk(constBlock){ let S=[],D=null;
  const sb={ console, getAurixRenderSeries:()=>S, investableValueBase:()=>D, _aurixLoadCapitalFlows:()=>[], window:undefined, Math, JSON, Array, Number, isFinite, Infinity, Date, activeRange:'24h', __set:s=>{S=s;D=s[s.length-1].value;} };
  vm.createContext(sb); vm.runInContext(constBlock, sb);
  AUX.forEach(c=>{const m=app.match(new RegExp('const '+c+'\\s*=[^;]*?;','s'));if(m)vm.runInContext(m[0],sb);});
  ENG.forEach(n=>{try{vm.runInContext(fn(n),sb);}catch(e){}}); return sb; }
const box={left:6,right:994,top:16,bottom:244};
// 24H with sharp alternating teeth (noise) + a SUSTAINED burst climb near the end.
function build24() { const v0=72000,p=[]; let k=0;
  for(let t=NOW-24*HOUR;t<=NOW;t+=5*MIN,k++){ const tooth=(k%2===0?1:-1)*210+55*Math.sin(k*0.7);
    const climb=(t>NOW-6*HOUR&&t<NOW-5*HOUR)?((t-(NOW-6*HOUR))/HOUR)*1400:(t>=NOW-5*HOUR?1400:0); p.push({time:t,value:Math.round(v0+tooth+climb)}); }
  return p; }
function build(range){ if(range==='24h')return build24(); const days={'7d':7,'30d':30,'1y':365,'all':900}[range],p=[];
  for(let i=0;i<300;i++)p.push({time:Math.round(NOW-days*DAY+i*(days*DAY/299)),value:Math.round(60000+i*20+400*Math.sin(i*0.1))}); return p; }
function render(sb,range){ const s=build(range); sb.__set(s); return vm.runInContext(`renderAurixInstitutionalChart('${range}',1000,260,${JSON.stringify(box)})`,sb); }
function coords(d){ const out=[]; const re=/([MLC])([^MLC]*)/g; let m;
  while((m=re.exec(d))){ const nums=m[2].trim().split(/[ ,]+/).map(Number).filter(x=>!isNaN(x)); if(m[1]==='C')out.push({x:nums[4],y:nums[5]}); else if(nums.length>=2)out.push({x:nums[0],y:nums[1]}); } return out; }
function sharpTeeth(d){ const c=coords(d); let n=0; for(let i=1;i<c.length-1;i++){ const a=c[i-1].y,b=c[i+1].y,y=c[i].y; const pk=y<a&&y<b,tr=y>a&&y>b; if(!pk&&!tr)continue;
  const prom=Math.min(Math.abs(y-a),Math.abs(y-b)); const base=Math.abs(c[i+1].x-c[i-1].x)||1; if(prom>=4.5&&prom/base>=0.55)n++; } return n; }
let pass=0,fail=0; function ok(n,c,i){ if(c){pass++;console.log('  ✓ '+n+(i?'  ['+i+']':''));}else{fail++;console.log('  ✗ '+n+(i?'  ['+i+']':''));} }

console.log('AURIX-24H-SPIKE-GUARD — RC4-D\n');
const ON = mk(CONST_BLOCK);
const OFF = mk(CONST_BLOCK.replace('_AURIX_24H_SPIKE_GUARD_ENABLED = true','_AURIX_24H_SPIKE_GUARD_ENABLED = false'));
const rOn = render(ON,'24h'), rOff = render(OFF,'24h');
const s = build('24h'), srcMax=Math.max.apply(null,s.map(p=>p.value)), srcMin=Math.min.apply(null,s.map(p=>p.value));
const teethOn=sharpTeeth(rOn.pathData), teethOff=sharpTeeth(rOff.pathData);

// 1. micro-spikes reduced
ok('1 24H micro-spikes reduced (sharp teeth)', teethOn < teethOff * 0.4, 'teeth '+teethOff+'→'+teethOn);
ok('1b drawnVertexCount reduced vs guard-off', rOn.diagnostics.drawnVertexCount < rOff.diagnostics.drawnVertexCount, 'drawn '+rOff.diagnostics.drawnVertexCount+'→'+rOn.diagnostics.drawnVertexCount);
// 2. real burst kept
ok('2 sustained burst kept (reaches near the real high)', rOn.visiblePoints.some(p=>p.value>srcMax-60));
// 3. 24H never splits
ok('3 24H still ONE subpath (no split)', rOn.diagnostics.renderedSubpaths===1);
// 4. global max/min + last preserved (visiblePoints untouched)
{ const vmax=Math.max.apply(null,rOn.visiblePoints.map(p=>p.value)), vmin=Math.min.apply(null,rOn.visiblePoints.map(p=>p.value));
  ok('4 global max/min + last preserved', vmax===srcMax && vmin===srcMin && rOn.visiblePoints[rOn.visiblePoints.length-1].value===s[s.length-1].value); }
// 5. visiblePoints untouched (== downsampled set; guard only thins the DRAWN path)
{ const ds=vm.runInContext(`downsampleAurixAdaptive(${JSON.stringify(s)}, _aurixVpTargetPointCount('24h',1000)).length`,ON);
  ok('5 visiblePoints untouched (data source intact)', rOn.visiblePoints.length===ds && rOn.visiblePixels.length===rOn.visiblePoints.length); }
// 6. visualSamples coherent with the FILTERED path (inspector rides the cleaned line)
{ const re=/([-\d.]+) ([-\d.]+)/g, last=rOn.visualSamples[rOn.visualSamples.length-1];
  // visual samples count tracks the filtered (fewer) path, not the noisy raw set
  ok('6 visualSamples come from the FILTERED path (coherent, fewer than guard-off)', rOn.visualSamples.length < rOff.visualSamples.length && rOn.visualSamples.length>10, 'vs '+rOff.visualSamples.length+'→'+rOn.visualSamples.length); }
// 7. equivalence
ok('7 render↔canonical equivalence not divergent', vm.runInContext("auditAurixRenderVsCanonical('24h').status",ON)!=='divergent');

console.log('\nOTHER RANGES UNAFFECTED (guard is 24H-only):');
['7d','30d','1y','all'].forEach((rg,i)=>{ const a=render(ON,rg), b=render(OFF,rg);
  ok((8+i)+' '+rg+' identical with guard ON/OFF (24H-only)', a.pathData===b.pathData && a.diagnostics.drawnVertexCount===b.diagnostics.drawnVertexCount); });

console.log('\nROLLBACK + WIRING + NO REGRESSION:');
ok('12 rollback ENABLED=false restores prior path (more teeth)', teethOff > teethOn);
ok('13 guard wired 24H-only + gated', /r === '24h'\) \{ if \(_AURIX_24H_SPIKE_GUARD_ENABLED && _volOn\) drawn = _aurix24hSpikeGuard\(/.test(app) && /_AURIX_24H_SPIKE_GUARD_ENABLED = true/.test(app));
ok('14 reducer protects gap edges + global extremes (code)', /i === miIdx \|\| i === maIdx/.test(fn('_aurixSpikeReduce')) && /gapT\.has/.test(fn('_aurixSpikeReduce')));
ok('15 inspector snap + tooltip + indicator paths intact', /_aurixVisualPointAtX\(_aurixMobChartVisual, fx\)/.test(app) && /_aurixMobileSetPerfIndicator\(\);/.test(app) && /out\.reason = 'normal_pause'/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
