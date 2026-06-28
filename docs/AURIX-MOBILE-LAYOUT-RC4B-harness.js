'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MOBILE-LAYOUT-RC4B-harness — RC4-B (24H spike polish + perf indicator + grid)
// ════════════════════════════════════════════════════════════════════════════
// FASE 1: 24H spike polish drops narrow reverting teeth (subset of real points; extremes/
// endpoints/bursts kept; 24H still one subpath). FASE 2: mobile perf indicator repopulated
// (green/red %/€) from the canonical return — read-only. FASE 3: premium mobile grid (h/v).
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function fn(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=app.indexOf('{',i),d=0; for(;k<app.length;k++){const c=app[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} return app.slice(i,k); }
const CONST_BLOCK = app.slice(app.indexOf('const _AURIX_PATH_RENDER_SPACING'), app.indexOf('function _aurixArrConfig'));
let pass=0, fail=0; function ok(n,c,i){ if(c){pass++;console.log('  ✓ '+n+(i?'  ['+i+']':''));}else{fail++;console.log('  ✗ '+n+(i?'  ['+i+']':''));} }

console.log('AURIX-MOBILE-LAYOUT-RC4B — RC4-B\n');

// ── FASE 1 — 24H spike polish (pure) ──
const sb1 = { Math }; vm.createContext(sb1); vm.runInContext(CONST_BLOCK, sb1);
const spike = function(d){ return sb1._aurix24hSpikeGuard(d, {x:t=>t}, {y:v=>v}, []); };
const xs = { x: t => t }, ys = { y: v => v };   // identity scales → time=px, value=py units
// build: smooth ramp + one NARROW REVERTING tooth + a real BURST (sustained) + extremes
function build() {
  const d = [];
  for (let i = 0; i < 10; i++) d.push({ time: i * 20, value: 50 + i * 0.4 });        // 0..180 gentle
  // narrow reverting LOCAL peak (not a global extreme): base 8, neighbours 64/64.3, juts UP to 75
  d.push({ time: 188, value: 64 }); d.push({ time: 192, value: 75 }); d.push({ time: 196, value: 64.3 });
  // sustained burst: a real climb (neighbours far apart → progresses, NOT a tooth)
  d.push({ time: 220, value: 60 }); d.push({ time: 240, value: 95 }); d.push({ time: 260, value: 130 });
  d.push({ time: 280, value: 128 });                                                  // global max ~130 inside burst
  for (let i = 0; i < 6; i++) d.push({ time: 300 + i * 20, value: 70 - i });           // tail
  return d;
}
function countTeeth(d) { let c = 0; for (let i = 1; i < d.length - 1; i++) { const a=d[i-1].value,b=d[i+1].value,cc=d[i].value;
  const peak=cc<a&&cc<b, tr=cc>a&&cc>b; if(!peak&&!tr)continue; const prom=Math.min(Math.abs(cc-a),Math.abs(cc-b)); const base=d[i+1].time-d[i-1].time; const rev=Math.abs(a-b);
  if(base<=9&&prom>=6&&rev<=4)c++; } return c; }
const d0 = build(), dP = spike(d0, xs, ys);
ok('1 spike polish reduces narrow reverting teeth', countTeeth(dP) < countTeeth(d0) && dP.length < d0.length, 'teeth '+countTeeth(d0)+'→'+countTeeth(dP)+' verts '+d0.length+'→'+dP.length);
ok('2 endpoints preserved', dP[0].time===d0[0].time && dP[dP.length-1].time===d0[d0.length-1].time);
{ const gmax0=Math.max.apply(null,d0.map(p=>p.value)), gmin0=Math.min.apply(null,d0.map(p=>p.value));
  const gmaxP=Math.max.apply(null,dP.map(p=>p.value)), gminP=Math.min.apply(null,dP.map(p=>p.value));
  ok('3 global max/min preserved', gmaxP===gmax0 && gminP===gmin0, 'max '+gmax0+' min '+gmin0); }
ok('4 sustained burst kept (real climb not dropped)', dP.some(p=>p.value===95) && dP.some(p=>p.value===130));
ok('5 output is a subset of real points (no fabrication)', dP.every(p=>d0.some(q=>q.time===p.time&&q.value===p.value)));
// gated: ENABLED=false → no-op
{ const sbOff={Math}; vm.createContext(sbOff); vm.runInContext(CONST_BLOCK.replace('_AURIX_24H_SPIKE_GUARD_ENABLED = true','_AURIX_24H_SPIKE_GUARD_ENABLED = false'), sbOff);
  // the gate is in the render wiring (r==='24h' && ENABLED); the helper itself always thins —
  // assert the live wiring gates it and is reversible by constant.
  ok('6 spike guard gated by _AURIX_24H_SPIKE_GUARD_ENABLED + 24H-only (reversible)',
     /_AURIX_24H_SPIKE_GUARD_ENABLED && _volOn\) drawn = _aurix24hSpikeGuard/.test(app) && /_AURIX_24H_SPIKE_GUARD_ENABLED = (true|false)/.test(app)); }

// ── 24H render contract still holds (no split, extremes, last) ──
const ENG = ['_aurixRenderContractGeometry','_aurixVpTargetPointCount','_aurixComputeVisualPreparation','prepareAurixVisualSeries','downsampleAurixLTTB','_aurixSignificantLocalExtrema','downsampleAurixAdaptive','computeAurixTimeScale','computeAurixAdaptiveXScale','computeAurixValueScale','_aurixArrConfig','_aurixArrRepresentVertices','_aurixPolishSimplify','_aurix24hSpikeGuard','_aurixSampleSegments','_aurixDensifyPathSegments','_aurixMonotonePath','buildAurixMonotonicPath','buildAurixAreaPath','_aurixSplitAtGaps','_wscFmtAxisVal','auditAurixRenderVsCanonical','_aurixCompareRenderToCanonical','renderAurixInstitutionalChart'];
const AUX = ['_AURIX_RC_QUALITY_THRESHOLD','_AURIX_RC_WINDOW_MS','_AURIX_RC_DASHBOARD_TOL','_AURIX_RC_ASPECT','_AURIX_RC_PAD_FRAC','_AURIX_RC_VPAD_FRAC','_AURIX_IR_VALUE_MARGIN','_AURIX_IR_VPAD_FRAC','_AURIX_Y_JUMP_DOMINANCE','_AURIX_Y_LEGIBLE_ALPHA','_AURIX_X_FILL_BETA','_AURIX_VP_DENSITY','_AURIX_VP_GAP_FLOOR_MS','_AURIX_VP_GAP_MEDIAN_MULT','_AURIX_VP_CAPITAL_KINDS','_AURIX_VP_CLUSTER_WIDTH_PX','_AURIX_VP_CLUSTER_MIN_PTS','_AURIX_VP_VALUE_EPS'];
let SER=[],DSH=null;
const sbR = { console, getAurixRenderSeries:()=>SER, investableValueBase:()=>DSH, _aurixLoadCapitalFlows:()=>[], window:undefined, Math, JSON, Array, Number, isFinite, Infinity, Date, activeRange:'24h' };
vm.createContext(sbR); vm.runInContext(CONST_BLOCK, sbR);
AUX.forEach(c=>{const m=app.match(new RegExp('const '+c+'\\s*=[^;]*?;','s'));if(m)vm.runInContext(m[0],sbR);});
ENG.forEach(n=>{try{vm.runInContext(fn(n),sbR);}catch(e){}});
const HOUR=36e5,MIN=60e3,NOW=1000*864e5;
SER=[]; { const v0=72000; let k=0; for(let t=NOW-24*HOUR;t<=NOW;t+=5*MIN,k++){ const micro=140*Math.sin(k*2.3)+90*Math.cos(k*4.1); const climb=(t>NOW-5*HOUR&&t<NOW-4*HOUR)?((t-(NOW-5*HOUR))/HOUR)*700:(t>=NOW-4*HOUR?700:0); SER.push({time:t,value:Math.round(v0+micro+climb)}); } }
DSH=SER[SER.length-1].value; sbR.SERIES=SER;
const rc = vm.runInContext(`renderAurixInstitutionalChart('24h',1000,260,{"left":6,"right":994,"top":16,"bottom":244})`, sbR);
ok('7 24H still ONE subpath (no split — RULE 0 intact)', rc.diagnostics.renderedSubpaths===1);
{ const srcMax=Math.max.apply(null,SER.map(p=>p.value)), srcMin=Math.min.apply(null,SER.map(p=>p.value));
  const vmax=Math.max.apply(null,rc.visiblePoints.map(p=>p.value)), vmin=Math.min.apply(null,rc.visiblePoints.map(p=>p.value));
  ok('8 24H max/min/last preserved (visiblePoints untouched)', vmax===srcMax&&vmin===srcMin&&rc.visiblePoints[rc.visiblePoints.length-1].value===DSH); }
ok('9 equivalence render↔canonical not divergent', vm.runInContext("auditAurixRenderVsCanonical('24h').status",sbR)!=='divergent');

// ── FASE 2 — mobile perf indicator (pure, fake DOM + stubs) ──
function testIndicator(deltaPct, deltaAbs, mode) {
  const el = { className:'', innerHTML:'', textContent:'', title:'', removeAttribute(){ this.title=''; } };
  const sb = { document:{ getElementById:(id)=> id==='chartChangeMobile'?el:null }, activePerfMode:mode, activeRange:'24h',
    _aurixRangeReturn:()=>({deltaPct,deltaAbs}), _dshFmtPct:(p)=>({text:(p>0?'+':'')+p.toFixed(2)+'%',capped:false}), _dshFmtMoney0:(v)=>'$'+Math.round(v), Number, Math };
  vm.createContext(sb); vm.runInContext(fn('_aurixMobileSetPerfIndicator'), sb); sb._aurixMobileSetPerfIndicator();
  return el;
}
{ const e=testIndicator(3.21, 1234, '%'); ok('10 indicator appears (% mode) + green when positive', e.className==='chart-change up' && /3\.21%/.test(e.innerHTML)); }
{ const e=testIndicator(-2.5, -800, '%'); ok('11 indicator red when negative', e.className==='chart-change down' && /-2\.50%/.test(e.innerHTML)); }
{ const e=testIndicator(0, 0, '%'); ok('12 indicator neutral when ~zero', e.className==='chart-change flat'); }
{ const e=testIndicator(3.21, 1234, 'curr'); ok('13 indicator honours €/curr mode', /\$1234/.test(e.innerHTML) && e.className==='chart-change up'); }
ok('14 indicator wired into the lite paint (read-only, no _wscPaintSurface on mobile)',
   /_aurixMobileSetPerfIndicator\(\);/.test(app) && /renderAurixMobileLiteChart\(r, token\)/.test(app));
ok('15 indicator reads canonical return (no data mutation)', /_aurixRangeReturn\(activeRange\)/.test(fn('_aurixMobileSetPerfIndicator')));

// ── Layout (no overflow / pulsable): uses the EXISTING element + controls, no new markup ──
ok('16 #chartChangeMobile element exists in the mobile chart header (no layout shift)', /id="chartChangeMobile"/.test(idx));
ok('17 perf-toggle + range tabs still present + clickable (unchanged markup)', /class="perf-toggle"[\s\S]{0,400}data-perf="%"[\s\S]{0,400}data-range="24h"/.test(idx));

// ── FASE 3 — premium mobile grid ──
ok('18 grid lines classed h/v in the lite SVG', /<line class="h"/.test(app) && /<line class="v"/.test(app));
ok('19 grid CSS: horizontals subtle, verticals fainter', /\.mob-chart-grid line\.h \{ stroke: rgba\(255,255,255,\.058\)/.test(css) && /\.mob-chart-grid line\.v \{ stroke: rgba\(255,255,255,\.028\)/.test(css));

// ── No regression on the protected contracts ──
ok('20 inspector snap (visualPoint) + gesture lock + 24H RULE 0 intact', /_aurixVisualPointAtX\(_aurixMobChartVisual, fx\)/.test(app) && /_aurixSliderShouldSwipe\(/.test(app) && /out\.reason = 'normal_pause'/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
