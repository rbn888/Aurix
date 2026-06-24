/* AURIX GRAPH — FINAL release-gate validation. Asserts the value-chart canonical model
   against shipped getCanonicalPortfolioSeries / getInstitutionalPerformanceSeries /
   _aurixDashSeries / _aurixRangeReturn from app.js: ONE source, every timeframe ends at
   the dashboard value (±0.5%), line = raw value, % = separate metadata.
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
[ obj('_WSC_INTERNAL_KINDS'),
  fn('_aurixFlowIsInternal'),fn('_aurixFlowNeutralize'),fn('_aurixRangeReturn'),
  fn('getCanonicalPortfolioSeries'),fn('getInstitutionalPerformanceSeries'),fn('getInstitutionalSeries'),fn('getAurixRenderSeries'),fn('_aurixLegacyDataFromCanonical'),fn('_aurixDashSeries')
].forEach(c=>vm.runInContext(c,sb));

let ok=true; const ck=(n,c,g)=>{console.log((c?'  ✓':'  ✗')+' '+n+(g!==undefined?'  ['+g+']':''));if(!c)ok=false;};
const RANGES=['24h','7d','30d','1y','all'];

// Full real history: starts 10k, construction step to ~55k, BTC add to ~74k, market to ~73k,
// most-recent snapshot at NOW (so canonical tail refreshes to LIVE). Investable value (raw).
ELIG=[
  {ts:NOW-360*D,value:10000},{ts:NOW-300*D,value:30000},{ts:NOW-250*D,value:54809},
  {ts:NOW-120*D,value:55200},{ts:NOW-90*D,value:74506},{ts:NOW-30*D,value:73800},
  {ts:NOW-7*D,value:73500},{ts:NOW-1*D,value:73200},{ts:NOW-2*H,value:73050},{ts:NOW,value:73000},
];
FLOWS=[{ts:NOW-250*D,kind:'asset_add',amountUSD:44000},{ts:NOW-90*D,kind:'asset_add',amountUSD:19697}];
LIVE=73170;

console.log('RULE 1 — single canonical source exists and feeds every timeframe');
{ const c=sb.getCanonicalPortfolioSeries();
  ck('getCanonicalPortfolioSeries returns [{ts,value}]', Array.isArray(c)&&c[0]&&Number.isFinite(c[0].ts)&&Number.isFinite(c[0].value));
  ck('canonical tail === live (mark-to-market)', Math.abs(c[c.length-1].value-LIVE)<1e-6, c[c.length-1].value);
  RANGES.forEach(r=>ck(r+' source = getCanonicalPortfolioSeries', sb.getInstitutionalSeries(r).source==='getCanonicalPortfolioSeries')); }

console.log('\nRULES 2/3/10/11 — EVERY timeframe ends at the dashboard value (±0.5%)');
{ RANGES.forEach(r=>{ const s=sb.getInstitutionalSeries(r).renderSeries; const last=s.length?s[s.length-1].value:null;
   ck(r+' last ≈ dashboard 73170', last!=null&&Math.abs(last-LIVE)/LIVE<0.005, last!=null?Math.round(last):null); }); }

console.log('\nRULE 5/6 — line = RAW VALUE (not flow-neutral); % is separate metadata');
{ const p=sb.getInstitutionalSeries('all');
  // raw value series shows the real construction value (54809 present), NOT a rebased value
  const has54809 = p.renderSeries.some(pt=>Math.round(pt.value)===54809);
  ck('TOTAL line contains the real raw value 54809 (value chart, not rebased)', has54809);
  ck('returnPct present as separate metadata (flow-neutral header)', p.returnPct!==null, p.returnPct+'%'); }

console.log('\nRULE 7/13 — modes affect rendering only (premium/partial/building)');
{ ck('TOTAL with full history = premium-curve', sb.getInstitutionalSeries('all').mode==='premium-curve', sb.getInstitutionalSeries('all').mode);
  const save=ELIG; ELIG=[{ts:NOW-2*H,value:73000},{ts:NOW,value:73100}]; LIVE=73170;
  ck('7D 2 recent pts low coverage = partial-curve (draws)', sb.getInstitutionalSeries('7d').mode==='partial-curve', sb.getInstitutionalSeries('7d').mode);
  ELIG=[{ts:NOW,value:73100}];
  ck('1 pt = building (only no-chart case)', sb.getInstitutionalSeries('7d').mode==='building', sb.getInstitutionalSeries('7d').mode);
  ELIG=save; LIVE=73170; }

console.log('\nRULE 1 (no divergence) — V2 _aurixDashSeries === single source renderSeries');
{ RANGES.forEach(r=>{ const v2=sb._aurixDashSeries(r); const wsc=sb.getInstitutionalSeries(r).renderSeries;
   const same=v2.length===wsc.length && v2.every((pt,i)=>pt.time===wsc[i].time && Math.abs(pt.value-wsc[i].value)<1e-9);
   ck(r+' V2 === canonical', same, 'len '+v2.length+'/'+wsc.length); }); }

console.log('\nRELEASE GATE (Rule 15) — all deltas < 0.5%');
{ let gate=true; RANGES.forEach(r=>{ const s=sb.getInstitutionalSeries(r).renderSeries; const last=s[s.length-1].value;
   const d=Math.abs(last-LIVE)/LIVE; if(!(d<0.005)) gate=false; });
  ck('RELEASE GATE PASS (every timeframe = dashboard ±0.5%)', gate); }

console.log('\nFASE 3/4 — every accessor resolves to the ONE canonical series');
{ const r='30d';
  const canon = sb.getInstitutionalSeries(r).renderSeries;
  const render = sb.getAurixRenderSeries(r);
  const v2 = sb._aurixDashSeries(r);
  const legacy = sb._aurixLegacyDataFromCanonical(r);
  ck('getAurixRenderSeries === renderSeries', render.length===canon.length && render.every((p,i)=>p.value===canon[i].value));
  ck('_aurixDashSeries (V2) === renderSeries', v2.length===canon.length && v2.every((p,i)=>p.value===canon[i].value));
  ck('legacy fallback values === renderSeries values', legacy.values.length===canon.length && legacy.values.every((v,i)=>v===canon[i].value));
  ck('legacy fallback last === dashboard live', Math.abs(legacy.lastValue-LIVE)/LIVE<0.005, Math.round(legacy.lastValue)); }

console.log('\nRESULT:', ok?'ALL CASES PASS ✓ — canonical value chart, no divergence':'FAIL ✗');
process.exit(ok?0:1);
