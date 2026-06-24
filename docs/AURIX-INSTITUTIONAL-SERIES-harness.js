/* AURIX GRAPH V1 — validates the single institutional source against the shipped
   getInstitutionalPerformanceSeries / _aurixFlowNeutralize / _aurixRangeReturn /
   _aurixDashSeries / _wscAssessSeriesQuality from app.js. Covers V1 rules 1,2,5,7,8.
   Run: node docs/AURIX-INSTITUTIONAL-SERIES-harness.js                            */
'use strict';
const fs=require('fs'), vm=require('vm'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
function fn(n){const s='function '+n+'(';const i=src.indexOf(s);if(i<0)throw new Error('missing '+n);
  let k=src.indexOf('{',i),d=0;for(;k<src.length;k++){const c=src[k];if(c==='{')d++;else if(c==='}'){d--;if(!d){k++;break;}}}return src.slice(i,k);}
function obj(n){const s='const '+n+' =';const i=src.indexOf(s);if(i<0)throw new Error('missing '+n);
  let k=src.indexOf('{',i),d=0;for(;k<src.length;k++){const c=src[k];if(c==='{')d++;else if(c==='}'){d--;if(!d){k++;break;}}}while(src[k]!==';'&&k<src.length)k++;return src.slice(i,k+1);}

const H=3600e3,D=86400e3,NOW=1000*D;
let ELIG=[], FLOWS=[], LIVE=0;
const sb={ console,
  Date:(()=>{const R=Date;return class extends R{static now(){return NOW;}};})(),
  activeRange:'30d', toBase:v=>v,
  investableValueBase:()=>LIVE,
  _aurixEligibleInvestableSeries:()=>({series:ELIG,meta:{excluded:0,reasons:{}}}),
  _aurixLoadCapitalFlows:()=>FLOWS.slice(),
};
sb.window=sb; vm.createContext(sb);
[ obj('_WSC_INTERNAL_KINDS'),obj('_WSC_BUCKET_MS'),obj('_WSC_WINDOW_MS'),obj('_WSC_QUALITY'),
  src.match(/const _WSC_LOWDENSITY_MIN = \d+;/)[0],
  fn('_aurixFlowIsInternal'),fn('_aurixFlowNeutralize'),fn('_wscAssessSeriesQuality'),
  fn('_aurixRangeReturn'),fn('getInstitutionalPerformanceSeries'),fn('getInstitutionalSeries'),fn('_aurixDashSeries')
].forEach(c=>vm.runInContext(c,sb));

let ok=true; const ck=(n,c,g)=>{console.log((c?'  ✓':'  ✗')+' '+n+(g!==undefined?'  ['+g+']':''));if(!c)ok=false;};
const set=(elig,flows,live)=>{ELIG=elig;FLOWS=flows||[];LIVE=(live!=null?live:(elig.length?elig[elig.length-1].value:0));};
const spread=(n,span,base,slope)=>Array.from({length:n},(_,i)=>({ts:NOW-span+Math.round(i*span/(n-1)),value:base+i*(slope||0)}));

console.log('RULE 1 — canonical return shape (points/firstValue/lastValue/returnPct/coverage/renderMode) + alias');
{ set(spread(20,28*D,50000,300),[]);
  const p=sb.getInstitutionalSeries('30d');
  ck('getInstitutionalSeries alias works', !!p && Array.isArray(p.points), p&&p.renderMode);
  ck('exposes firstValue/lastValue/returnPct/coverage/renderMode',
     Number.isFinite(p.firstValue)&&Number.isFinite(p.lastValue)&&p.returnPct!=null&&Number.isFinite(p.coverage)&&!!p.renderMode); }

console.log('\nRULE 2 — 24H last point ≈ live dashboard value (±0.5%) even if last snapshot is stale');
{ set(spread(40,22*H,63000,50),[], 73082);   // snapshots end ~65k, LIVE=73082
  const p=sb.getInstitutionalSeries('24h');
  const last=p.renderSeries[p.renderSeries.length-1].value;
  ck('24H endpoint anchored to live 73082 (not the ~65k snapshot)', Math.abs(last-73082)/73082<0.005, Math.round(last));
  // 7D same rule
  set(spread(30,6*D,63000,80),[], 73082);
  const p7=sb.getInstitutionalSeries('7d');
  ck('7D endpoint anchored to live 73082', Math.abs(p7.renderSeries[p7.renderSeries.length-1].value-73082)/73082<0.005, Math.round(p7.renderSeries[p7.renderSeries.length-1].value)); }

console.log('\nRULE 8 — 30D/1A/TOTAL endpoint NOT re-anchored (frozen anchor-to-start)');
{ set([{ts:NOW-25*D,value:54809},{ts:NOW-12*D,value:74506},{ts:NOW,value:75000}],
      [{ts:NOW-12*D,kind:'asset_add',amountUSD:19697}], 99999);   // LIVE deliberately far off
  const p=sb.getInstitutionalSeries('30d');
  const last=p.renderSeries[p.renderSeries.length-1].value;
  ck('30D endpoint stays performance value (NOT pulled to 99999)', Math.abs(last-99999)>1000, Math.round(last));
  ck('30D still starts at REAL 54809 (anchor-to-start)', Math.round(p.renderSeries[0].value)===54809, Math.round(p.renderSeries[0].value)); }

console.log('\nRULE 7 — three modes: premium / partial (≥2) / building (<2)');
{ set(spread(20,28*D,50000,300),[]); ck("30D good coverage → premium-curve", sb.getInstitutionalSeries('30d').mode==='premium-curve', sb.getInstitutionalSeries('30d').mode);
  set([{ts:NOW-2*H,value:75000},{ts:NOW-1*H,value:75100},{ts:NOW,value:75200}],[],75200);
  ck('7D 3 recent pts → partial-curve (draws, NOT building)', sb.getInstitutionalSeries('7d').mode==='partial-curve', sb.getInstitutionalSeries('7d').mode);
  set([{ts:NOW-1*H,value:75000},{ts:NOW,value:75100}],[],75100);
  ck('7D 2 pts → partial-curve (Rule 7: building only <2)', sb.getInstitutionalSeries('7d').mode==='partial-curve', sb.getInstitutionalSeries('7d').mode);
  set([{ts:NOW,value:75000}],[],75000);
  ck('1 pt → building (empty)', sb.getInstitutionalSeries('7d').mode==='building', sb.getInstitutionalSeries('7d').mode); }

console.log('\nFLOW-NEUTRAL preserved — capital add not shown as return; market move preserved');
{ set([{ts:NOW-25*D,value:54809},{ts:NOW-12*D,value:74506},{ts:NOW,value:75651}],[{ts:NOW-12*D,kind:'asset_add',amountUSD:19697}],75651);
  ck('30D add netted out (net <5%)', Math.abs(sb._aurixRangeReturn('30d').deltaPct)<5, sb._aurixRangeReturn('30d').deltaPct+'%');
  let ms=0;const rs=sb.getInstitutionalSeries('30d').renderSeries;for(let i=1;i<rs.length;i++){const a=rs[i-1].value,b=rs[i].value;if(a>0)ms=Math.max(ms,Math.abs(b/a-1));}
  ck('30D no false capital step (<18%)', ms<0.18, '+'+(ms*100).toFixed(1)+'%');
  set(spread(40,22*H,75000,-95),[],71300);
  ck('24H market −5% reflected (negative)', sb._aurixRangeReturn('24h').deltaPct<0, sb._aurixRangeReturn('24h').deltaPct+'%'); }

console.log('\nRULE 1 (single source) — V2 _aurixDashSeries === renderSeries (no divergence)');
{ set([{ts:NOW-25*D,value:54809},{ts:NOW-12*D,value:74506},{ts:NOW,value:75651}],[{ts:NOW-12*D,kind:'asset_add',amountUSD:19697}],75651);
  const v2=sb._aurixDashSeries('30d'); const wsc=sb.getInstitutionalSeries('30d').renderSeries;
  ck('V2 === single source', v2.length===wsc.length && v2.every((p,i)=>p.time===wsc[i].time && Math.abs(p.value-wsc[i].value)<1e-9), 'len '+v2.length+'/'+wsc.length); }

console.log('\nRESULT:', ok?'ALL CASES PASS ✓ (shipped getInstitutionalPerformanceSeries / V1 rules)':'FAIL ✗');
process.exit(ok?0:1);
