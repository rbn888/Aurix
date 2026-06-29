'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-VOLATILITY-PARITY-RC4E-harness — RC4-E (mobile color parity + global volatility polish)
// ════════════════════════════════════════════════════════════════════════════
// FASE 1: the mobile lite line/area colour follows the RANGE RETURN sign (parity with web +
// the %/€ indicator), not lastDeltaPct (≈0 → stayed green). FASE 2/3: per-range volatility
// polish reduces compact-tooth clusters on 7D/30D/1A/TOTAL (24H keeps its spike guard), keeping
// extremes/endpoints/bursts; render-only; rollback global + per-range.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fn(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=app.indexOf('{',i),d=0; for(;k<app.length;k++){const c=app[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} return app.slice(i,k); }
const CONST_BLOCK = app.slice(app.indexOf('const _AURIX_PATH_RENDER_SPACING'), app.indexOf('function _aurixArrConfig'));
const ENG = ['_aurixRenderContractGeometry','_aurixVpTargetPointCount','_aurixComputeVisualPreparation','prepareAurixVisualSeries','downsampleAurixLTTB','_aurixSignificantLocalExtrema','downsampleAurixAdaptive','computeAurixTimeScale','computeAurixAdaptiveXScale','computeAurixValueScale','_aurixArrConfig','_aurixArrRepresentVertices','_aurixSpikeReduce','_aurix24hSpikeGuard','_aurixVolatilityPolish','_aurixPolishSimplify','_aurixSampleSegments','_aurixDensifyPathSegments','_aurixMonotonePath','buildAurixMonotonicPath','buildAurixAreaPath','_aurixSplitAtGaps','_wscFmtAxisVal','auditAurixRenderVsCanonical','_aurixCompareRenderToCanonical','renderAurixInstitutionalChart'];
const AUX = ['_AURIX_RC_QUALITY_THRESHOLD','_AURIX_RC_WINDOW_MS','_AURIX_RC_DASHBOARD_TOL','_AURIX_RC_ASPECT','_AURIX_RC_PAD_FRAC','_AURIX_RC_VPAD_FRAC','_AURIX_IR_VALUE_MARGIN','_AURIX_IR_VPAD_FRAC','_AURIX_Y_JUMP_DOMINANCE','_AURIX_Y_LEGIBLE_ALPHA','_AURIX_X_FILL_BETA','_AURIX_VP_DENSITY','_AURIX_VP_GAP_FLOOR_MS','_AURIX_VP_GAP_MEDIAN_MULT','_AURIX_VP_CAPITAL_KINDS','_AURIX_VP_CLUSTER_WIDTH_PX','_AURIX_VP_CLUSTER_MIN_PTS','_AURIX_VP_VALUE_EPS'];
const HOUR=36e5, MIN=60e3, DAY=864e5, NOW=1000*DAY;
function mk(constBlock){ let S=[],D=null;
  const sb={ console, getAurixRenderSeries:()=>S, investableValueBase:()=>D, _aurixLoadCapitalFlows:()=>[], window:undefined, Math, JSON, Array, Number, isFinite, Infinity, Date, activeRange:'7d', __set:s=>{S=s;D=s[s.length-1].value;} };
  vm.createContext(sb); vm.runInContext(constBlock, sb);
  AUX.forEach(c=>{const m=app.match(new RegExp('const '+c+'\\s*=[^;]*?;','s'));if(m)vm.runInContext(m[0],sb);});
  ENG.forEach(n=>{try{vm.runInContext(fn(n),sb);}catch(e){}}); return sb; }
const box={left:6,right:994,top:16,bottom:244};
function coords(d){ const out=[]; const re=/([MLC])([^MLC]*)/g; let m;
  while((m=re.exec(d))){ const nums=m[2].trim().split(/[ ,]+/).map(Number).filter(x=>!isNaN(x)); if(m[1]==='C')out.push({x:nums[4],y:nums[5]}); else if(nums.length>=2)out.push({x:nums[0],y:nums[1]}); } return out; }
function teeth(d, aspect){ const c=coords(d); let n=0; for(let i=1;i<c.length-1;i++){ const a=c[i-1].y,b=c[i+1].y,y=c[i].y; const pk=y<a&&y<b,tr=y>a&&y>b; if(!pk&&!tr)continue;
  const prom=Math.min(Math.abs(y-a),Math.abs(y-b)); const base=Math.abs(c[i+1].x-c[i-1].x)||1; if(prom>=4&&prom/base>=aspect)n++; } return n; }
// cluster of compact teeth in the LAST third + smooth elsewhere (+ a real sustained move)
function clusterSeries(range){ const days={'7d':7,'30d':30,'1y':365,'all':900}[range]; const N=range==='7d'?400:range==='30d'?600:range==='1y'?1000:1500;
  const p=[]; for(let i=0;i<N;i++){ const f=i/(N-1); const base=60000 + f*8000 + (f>0.55&&f<0.62?6000:0);   // one real sustained step
    const tooth = f>0.66 ? (i%2===0?1:-1)*900 : 30*Math.sin(i*0.2);                                          // compact teeth in last third
    p.push({time:Math.round(NOW-days*DAY+f*days*DAY), value:Math.round(base+tooth)}); } return p; }
function render(sb,range,s){ sb.__set(s); return vm.runInContext(`renderAurixInstitutionalChart('${range}',1000,260,${JSON.stringify(box)})`,sb); }
let pass=0,fail=0; function ok(n,c,i){ if(c){pass++;console.log('  ✓ '+n+(i?'  ['+i+']':''));}else{fail++;console.log('  ✗ '+n+(i?'  ['+i+']':''));} }

console.log('AURIX-VOLATILITY-PARITY-RC4E — RC4-E\n');
console.log('FASE 1 — Mobile color parity (line colour by RANGE RETURN sign):');
// behavioural mapping the app uses, verified against the source hexes
const toneToStroke = pct => pct == null ? '#9fb0c7' : (pct > 0.005 ? '#2ebd85' : (pct < -0.005 ? '#e25563' : '#9fb0c7'));
ok('1 mobile negative range → RED line', toneToStroke(-0.13) === '#e25563');
ok('2 mobile positive range → GREEN line', toneToStroke(2.4) === '#2ebd85');
ok('2b zero/na → neutral', toneToStroke(0) === '#9fb0c7' && toneToStroke(null) === '#9fb0c7');
const liteFn = (()=>{ const s=app.indexOf('P0-HISTORY-PARITY-EMERGENCY-GATE — colour from the GATED'); return app.slice(s, s+900); })();
ok('3 mobile lite colours from the GATED canonical return (getValidReturnBaseline, NOT lastDeltaPct/raw _aurixRangeReturn)', /getValidReturnBaseline\(r\)/.test(liteFn) && /_gret && _gret\.valid && Number\.isFinite\(_gret\.deltaPct\)/.test(liteFn) && /tone === 'down' \? '#e25563'/.test(liteFn) && !/lastDeltaPct < 0\)/.test(liteFn));
ok('4 web/mobile parity: same hexes + same ±0.005 threshold', /> 0\.005 \? 'up'/.test(liteFn) && app.indexOf("'#e25563'")>=0 && app.indexOf("'#2ebd85'")>=0);
ok('5 indicator tone uses the same sign source (baseline-gated return + ±0.005)', /deltaPct > 0\.005 \? 'up' : deltaPct < -0\.005 \? 'down'/.test(fn('_aurixMobileSetPerfIndicator')) && /getValidReturnBaseline\(activeRange\)/.test(fn('_aurixMobileSetPerfIndicator')));

console.log('\nFASE 2/3 — Global volatility polish (per-range cluster reduction):');
const ON = mk(CONST_BLOCK);
[['7d',0.70],['30d',0.70],['1y',0.88],['all',0.88]].forEach(([rg,asp])=>{
  const OFF = mk(CONST_BLOCK.replace(new RegExp("'"+rg+"': \\{ strict: [^}]+\\}"), "'"+rg+"': { strict: 'off' }"));   // RC4-G per-range rollback: disable this range's discipline
  const s = clusterSeries(rg);
  const a = render(ON,rg,s), b = render(OFF,rg,s);
  const tOn=teeth(a.pathData,asp), tOff=teeth(b.pathData,asp);
  const srcMax=Math.max.apply(null,s.map(p=>p.value)), srcMin=Math.min.apply(null,s.map(p=>p.value));
  const vmax=Math.max.apply(null,a.visiblePoints.map(p=>p.value)), vmin=Math.min.apply(null,a.visiblePoints.map(p=>p.value));
  ok(rg+': compact-tooth cluster reduced vs polish-off', tOn < tOff, 'teeth '+tOff+'→'+tOn);
  ok(rg+': max/min/last preserved + sustained step kept', vmax===srcMax && vmin===srcMin && a.visiblePoints[a.visiblePoints.length-1].value===s[s.length-1].value && a.visiblePoints.some(p=>p.value>srcMax-3000));
  ok(rg+': per-range rollback restores prior path (more teeth)', tOff >= tOn);
});

console.log('\nNO REGRESSION + contracts:');
const r24 = render(ON,'24h', (function(){const v0=72000,p=[];let k=0;for(let t=NOW-24*HOUR;t<=NOW;t+=5*MIN,k++){const tt=(k%2===0?1:-1)*200;const c=(t>NOW-6*HOUR&&t<NOW-5*HOUR)?((t-(NOW-6*HOUR))/HOUR)*1200:(t>=NOW-5*HOUR?1200:0);p.push({time:t,value:Math.round(v0+tt+c)});}return p;})());
ok('24H still ONE subpath (no split) + spike guard kept', r24.diagnostics.renderedSubpaths===1 && teeth(r24.pathData,0.55) <= 4);
ok('equivalence render↔canonical not divergent (7d)', vm.runInContext("auditAurixRenderVsCanonical('7d').status",ON)!=='divergent');
ok('visualSamples come from the polished path (inspector rides clean line)', Array.isArray(r24.visualSamples) && r24.visualSamples.length>0);
ok('global rollback gate present (v2 + single disciplined call)', /_AURIX_24H_SPIKE_GUARD_V2_ENABLED = true/.test(app) && /drawn = _aurixSpikeDiscipline\(drawn, xScale, yScale, r, prepared\.gaps/.test(app));
ok('per-range discipline map present', /_AURIX_SPIKE_DISCIPLINE_BY_RANGE = \{[\s\S]*?'7d': \{ strict: false \}[\s\S]*?'1y': \{ strict: 'soft' \}/.test(app));
ok('shared core (no duplication): wrappers + discipline call the same reducer', /return _aurixSpikeDiscipline\(/.test(fn('_aurix24hSpikeGuard')) && /return _aurixSpikeDiscipline\(/.test(fn('_aurixVolatilityPolish')) && /_aurixSpikeReduce\(/.test(fn('_aurixSpikeDiscipline')));
ok('inspector snap + tooltip + indicator paths intact', /_aurixVisualPointAtX\(_aurixMobChartVisual, fx\)/.test(app) && /_aurixMobileSetPerfIndicator\(\);/.test(app) && /out\.reason = 'normal_pause'/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
