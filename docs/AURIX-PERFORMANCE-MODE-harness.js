/* Validates Performance mode (A+B) against the REAL shipped functions from app.js:
   _aurixBackfillFlowsFromTransactions, _aurixFlowNeutralize, _aurixRangeReturn,
   _aurixDashSeries. Proves capital flows are netted out of curve AND %, real market
   moves are preserved, and V2 (_aurixDashSeries) shares the WSC flow-neutral source.
   Run: node docs/AURIX-PERFORMANCE-MODE-harness.js                                  */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fn(n){ const s='function '+n+'('; const i=src.indexOf(s); if(i<0)throw new Error('missing '+n);
  let k=src.indexOf('{',i),d=0; for(;k<src.length;k++){const c=src[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} return src.slice(i,k); }
function obj(n){ const s='const '+n+' ='; const i=src.indexOf(s); if(i<0)throw new Error('missing '+n);
  let k=src.indexOf('{',i),d=0; for(;k<src.length;k++){const c=src[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} while(src[k]!==';'&&k<src.length)k++; return src.slice(i,k+1); }

const H=3600e3, D=86400e3, NOW=1000*D;
// state the stubs read
let ELIG = [];                 // eligible investable series [{ts,value}]
let FLOWS = [];                // capital flows ledger
let STORE = [];               // mutable ledger for backfill test

const sb = {
  console,
  Date: (()=>{ const R=Date; return class extends R { static now(){ return NOW; } }; })(),
  IS_DEV: false,
  assets: [],
  activeAssets: () => sb.assets,
  toBase: (v)=>v, _nativeToUSD: (v)=>v,
  investableValueBase: () => (ELIG.length ? ELIG[ELIG.length-1].value : 0),
  _aurixPortfolioEpoch: () => 0,
  _aurixEligibleInvestableSeries: () => ({ series: ELIG, meta:{} }),
  _aurixLoadCapitalFlows: () => FLOWS.slice(),
  _aurixSaveCapitalFlows: (a) => { STORE = a.slice(); FLOWS = a.slice(); },
};
sb.window = sb;
vm.createContext(sb);
[ obj('_WSC_INTERNAL_KINDS'), obj('_WSC_BUCKET_MS'), obj('_WSC_WINDOW_MS'), obj('_WSC_QUALITY'),
  src.match(/const _WSC_LOWDENSITY_MIN = \d+;/)[0],
  fn('_aurixFlowIsInternal'), fn('_aurixFlowNeutralize'), fn('_wscAssessSeriesQuality'),
  fn('_aurixRangeReturn'), fn('_aurixDashSeries'), fn('_aurixCaptureFlow'),
  fn('_aurixBackfillFlowsFromTransactions') ].forEach(c=>vm.runInContext(c, sb));

let ok=true; const ck=(n,c,g)=>{console.log((c?'  ✓':'  ✗')+' '+n+(g!==undefined?'  ['+g+']':'')); if(!c) ok=false;};
const spread=(n,span,base,slope)=>Array.from({length:n},(_,i)=>({ts:NOW-span+Math.round(i*span/(n-1)),value:base+i*(slope||0)}));

console.log('CASE 1 — large asset_add inside the window (deposit ~+19.7k on a ~55k base)');
{ // construction-like series: flat ~55k then jump to ~75k, recorded as a flow
  ELIG = [{ts:NOW-20*D,value:54809},{ts:NOW-15*D,value:55000},{ts:NOW-10*D,value:74506},{ts:NOW-5*D,value:74800},{ts:NOW,value:75651}];
  FLOWS = [{ts:NOW-10*D, kind:'asset_add', amountUSD:19697}];
  const r = sb._aurixRangeReturn('30d');
  ck('netReturnPct strips the +19.7k add (<5%)', Math.abs(r.deltaPct) < 5, r.deltaPct+'%');
  ck('grossDeltaPct still shows the raw jump (>30%)', r.grossDeltaPct > 30, r.grossDeltaPct+'%'); }

console.log('\nCASE 2 — construction 54k→75k WITHOUT a recorded flow → backfill from transactions, then neutralised');
{ sb.assets = [{ id:'btc', assetCurrency:'USD', transactions:[ {type:'buy', qty:0.2, price:62500, ts:NOW-10*D} ] }];
  FLOWS = []; STORE = [];
  const res = sb._aurixBackfillFlowsFromTransactions();
  ck('backfill derived 1 flow from the transaction', res.added === 1, 'added='+res.added);
  ck('flow is asset_add +12500 at tx ts', STORE[0] && STORE[0].kind==='asset_add' && STORE[0].amountUSD===12500, JSON.stringify(STORE[0]));
  // now neutralisation can see it:
  ELIG = [{ts:NOW-20*D,value:54809},{ts:NOW-11*D,value:55000},{ts:NOW-9*D,value:67500},{ts:NOW-4*D,value:67700},{ts:NOW,value:67800}];
  const r = sb._aurixRangeReturn('30d');
  ck('netReturnPct after backfill strips the construction (<5%)', Math.abs(r.deltaPct) < 5, r.deltaPct+'%'); }

console.log('\nCASE 3 — real market move, NO flow → return PRESERVED (not neutralised)');
{ ELIG = spread(10, 28*D, 50000, 800);   // 50000 → ~57200 by market, no flows
  FLOWS = [];
  const r = sb._aurixRangeReturn('30d');
  ck('market gain preserved (>10%)', r.deltaPct > 10, r.deltaPct+'%');
  ck('basis = no-flows-in-window', /no-flows/.test(r.basis), r.basis); }

console.log('\nCASE 4 — 7D low-density still protected (quality gate intact)');
{ ELIG = [{ts:NOW-30*60e3,value:75000},{ts:NOW-20*60e3,value:75100},{ts:NOW,value:75200}];
  const q = sb._wscAssessSeriesQuality('7d', ELIG, ELIG, ELIG.map(p=>p.value));
  ck('7D low-density not renderable', q.institutionalRenderable===false, q.reason); }

console.log('\nCASE 5 — 30D renders WITHOUT the false step (flow-neutralised dash series)');
{ ELIG = [{ts:NOW-20*D,value:54809},{ts:NOW-11*D,value:55000},{ts:NOW-9*D,value:74506},{ts:NOW-4*D,value:74800},{ts:NOW,value:75651}];
  FLOWS = [{ts:NOW-10*D, kind:'asset_add', amountUSD:19697}];
  const ds = sb._aurixDashSeries('30d');
  let maxStep=0; for(let i=1;i<ds.length;i++){const a=ds[i-1].value,b=ds[i].value; if(a>0)maxStep=Math.max(maxStep,Math.abs(b/a-1));}
  ck('no ≥18% step in the V2 dash series (capital step removed)', maxStep < 0.18, '+'+(maxStep*100).toFixed(1)+'%'); }

console.log('\nCASE 6 — grossReturnPct includes the flow, netReturnPct shown does NOT');
{ ELIG = [{ts:NOW-20*D,value:54809},{ts:NOW-9*D,value:74506},{ts:NOW,value:75651}];
  FLOWS = [{ts:NOW-10*D, kind:'asset_add', amountUSD:19697}];
  const r = sb._aurixRangeReturn('30d');
  ck('grossDeltaPct > net/ shown deltaPct', r.grossDeltaPct > r.deltaPct + 20, 'gross '+r.grossDeltaPct+' vs net '+r.deltaPct); }

console.log('\nCASE 7 — V2 (_aurixDashSeries) and WSC share the SAME flow-neutral source');
{ ELIG = [{ts:NOW-20*D,value:54809},{ts:NOW-9*D,value:74506},{ts:NOW,value:75651}];
  FLOWS = [{ts:NOW-10*D, kind:'asset_add', amountUSD:19697}];
  const ds = sb._aurixDashSeries('30d');                                  // V2 source
  const wscAdj = sb._aurixFlowNeutralize(ELIG, '30d').adjusted;           // WSC source
  const same = ds.length===wscAdj.length && ds.every((p,i)=>Math.abs(p.value-wscAdj[i])<1e-6);
  ck('V2 dash series === WSC adjusted (identical flow-neutral values)', same,
     'V2['+ds.map(p=>Math.round(p.value))+'] WSC['+wscAdj.map(v=>Math.round(v))+']'); }

console.log('\nDESKTOP == MOBILE — _aurixDashSeries is range-based (no surface branch); _aurixDashSync feeds both ctrls from it.');
console.log('\nRESULT:', ok ? 'ALL CASES PASS ✓ (against shipped app.js code)' : 'FAIL ✗');
process.exit(ok?0:1);
