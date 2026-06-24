/* Validates the SINGLE institutional source (Performance mode, anchor-to-start)
   against the shipped getInstitutionalPerformanceSeries / _aurixFlowNeutralize /
   _aurixRangeReturn / _aurixDashSeries / _wscAssessSeriesQuality from app.js.
   Run: node docs/AURIX-INSTITUTIONAL-SERIES-harness.js                            */
'use strict';
const fs=require('fs'), vm=require('vm'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
function fn(n){const s='function '+n+'(';const i=src.indexOf(s);if(i<0)throw new Error('missing '+n);
  let k=src.indexOf('{',i),d=0;for(;k<src.length;k++){const c=src[k];if(c==='{')d++;else if(c==='}'){d--;if(!d){k++;break;}}}return src.slice(i,k);}
function obj(n){const s='const '+n+' =';const i=src.indexOf(s);if(i<0)throw new Error('missing '+n);
  let k=src.indexOf('{',i),d=0;for(;k<src.length;k++){const c=src[k];if(c==='{')d++;else if(c==='}'){d--;if(!d){k++;break;}}}while(src[k]!==';'&&k<src.length)k++;return src.slice(i,k+1);}

const H=3600e3,D=86400e3,NOW=1000*D;
let ELIG=[], FLOWS=[];
const sb={ console,
  Date:(()=>{const R=Date;return class extends R{static now(){return NOW;}};})(),
  activeRange:'30d', toBase:v=>v,
  investableValueBase:()=>(ELIG.length?ELIG[ELIG.length-1].value:0),
  _aurixEligibleInvestableSeries:()=>({series:ELIG,meta:{excluded:0,reasons:{}}}),
  _aurixLoadCapitalFlows:()=>FLOWS.slice(),
};
sb.window=sb; vm.createContext(sb);
[ obj('_WSC_INTERNAL_KINDS'),obj('_WSC_BUCKET_MS'),obj('_WSC_WINDOW_MS'),obj('_WSC_QUALITY'),
  src.match(/const _WSC_LOWDENSITY_MIN = \d+;/)[0],
  fn('_aurixFlowIsInternal'),fn('_aurixFlowNeutralize'),fn('_wscAssessSeriesQuality'),
  fn('_aurixRangeReturn'),fn('getInstitutionalPerformanceSeries'),fn('_aurixDashSeries')
].forEach(c=>vm.runInContext(c,sb));

let ok=true; const ck=(n,c,g)=>{console.log((c?'  ✓':'  ✗')+' '+n+(g!==undefined?'  ['+g+']':''));if(!c)ok=false;};
const set=(elig,flows)=>{ELIG=elig;FLOWS=flows||[];};
const spread=(n,span,base,slope)=>Array.from({length:n},(_,i)=>({ts:NOW-span+Math.round(i*span/(n-1)),value:base+i*(slope||0)}));

console.log('CASE 1 — user starts at 10k, builds to 75k via ASSET ADDS (capital, not market)');
{ set([{ts:NOW-300*D,value:10000},{ts:NOW-200*D,value:30000},{ts:NOW-100*D,value:55000},{ts:NOW,value:75000}],
      [{ts:NOW-200*D,kind:'asset_add',amountUSD:20000},{ts:NOW-100*D,kind:'asset_add',amountUSD:25000},{ts:NOW-1*D,kind:'asset_add',amountUSD:20000}]);
  const p=sb.getInstitutionalPerformanceSeries('all');
  ck('TOTAL starts at REAL 10k (anchor-to-start), not 75k', Math.round(p.renderSeries[0].value)===10000, Math.round(p.renderSeries[0].value));
  const r=sb._aurixRangeReturn('all');
  ck('capital adds NOT shown as return (net ≈ 0%)', Math.abs(r.deltaPct)<2, r.deltaPct+'%'); }

console.log('\nCASE 2 — add 0.2 BTC (~+12.5k) to a 63k portfolio');
{ set([{ts:NOW-20*D,value:62800},{ts:NOW-10*D,value:75300},{ts:NOW-2*D,value:75500},{ts:NOW,value:75651}],
      [{ts:NOW-10*D,kind:'asset_add',amountUSD:12450}]);
  const p=sb.getInstitutionalPerformanceSeries('30d');
  let maxStep=0;for(let i=1;i<p.renderSeries.length;i++){const a=p.renderSeries[i-1].value,b=p.renderSeries[i].value;if(a>0)maxStep=Math.max(maxStep,Math.abs(b/a-1));}
  ck('curve does not break — no ≥18% step', maxStep<0.18, '+'+(maxStep*100).toFixed(1)+'%');
  ck('return not inflated by the add (net <5%)', Math.abs(sb._aurixRangeReturn('30d').deltaPct)<5, sb._aurixRangeReturn('30d').deltaPct+'%'); }

console.log('\nCASE 3 — market down 5% in 24H, no flows');
{ set(spread(40,22*H,75000,-95), []);   // ~75000 → ~71300
  const p=sb.getInstitutionalPerformanceSeries('24h');
  ck('24H mode = premium-curve (has density, no flow)', p.mode==='premium-curve', p.mode);
  ck('24H reflects the market drop (negative)', sb._aurixRangeReturn('24h').deltaPct<0, sb._aurixRangeReturn('24h').deltaPct+'%'); }

console.log('\nCASE 4 — 7D with only recent data');
{ set([{ts:NOW-2*H,value:75000},{ts:NOW-1*H,value:75100},{ts:NOW,value:75200}], []);
  const p=sb.getInstitutionalPerformanceSeries('7d');
  ck('7D = partial-curve (≥3 pts, low coverage) — NOT a false continuous premium', p.mode==='partial-curve', p.mode);
  set([{ts:NOW-1*H,value:75000},{ts:NOW,value:75100}], []);
  ck('7D with 2 pts = building', sb.getInstitutionalPerformanceSeries('7d').mode==='building', sb.getInstitutionalPerformanceSeries('7d').mode); }

console.log('\nCASE 5 — 30D/1A/TOTAL with history incl. a construction flow → premium, no step, real start');
{ set([{ts:NOW-25*D,value:54809},{ts:NOW-20*D,value:55200},{ts:NOW-15*D,value:55400},{ts:NOW-12*D,value:74506},{ts:NOW-8*D,value:74800},{ts:NOW-4*D,value:75200},{ts:NOW,value:75651}],
      [{ts:NOW-12*D,kind:'asset_add',amountUSD:19697}]);
  for(const r of ['30d','1y','all']){ const p=sb.getInstitutionalPerformanceSeries(r);
    ck(r+' = premium-curve', p.mode==='premium-curve', p.mode);
    let ms=0;for(let i=1;i<p.renderSeries.length;i++){const a=p.renderSeries[i-1].value,b=p.renderSeries[i].value;if(a>0)ms=Math.max(ms,Math.abs(b/a-1));}
    ck(r+' no false capital step (<18%)', ms<0.18, '+'+(ms*100).toFixed(1)+'%');
    ck(r+' starts at REAL first point (~54809), not lifted', Math.round(p.renderSeries[0].value)===54809, Math.round(p.renderSeries[0].value)); } }

console.log('\nCASE 6 — desktop/mobile: V2 (_aurixDashSeries) === WSC source (getInstitutionalPerformanceSeries)');
{ set([{ts:NOW-25*D,value:54809},{ts:NOW-12*D,value:74506},{ts:NOW,value:75651}],[{ts:NOW-12*D,kind:'asset_add',amountUSD:19697}]);
  const v2=sb._aurixDashSeries('30d'); const wsc=sb.getInstitutionalPerformanceSeries('30d').renderSeries;
  const same=v2.length===wsc.length && v2.every((p,i)=>p.time===wsc[i].time && Math.abs(p.value-wsc[i].value)<1e-9);
  ck('V2 renderSeries === single-source renderSeries (no divergence possible)', same, 'len '+v2.length+'/'+wsc.length); }

console.log('\nRESULT:', ok?'ALL CASES PASS ✓ (shipped getInstitutionalPerformanceSeries)':'FAIL ✗');
process.exit(ok?0:1);
