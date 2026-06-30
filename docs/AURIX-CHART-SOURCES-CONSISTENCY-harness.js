/* FASE 3 — chart-source consistency against shipped code. Confirms every surface accessor
   (WSC=getInstitutionalPerformanceSeries, V2=getAurixRenderSeries + getDashboardChartRenderState,
   Chart.js legacy=_aurixLegacyDataFromCanonical) returns the SAME canonical series and the
   same last value (= dashboard), with PCE off and getChartData not feeding the main chart.
   Run: node docs/AURIX-CHART-SOURCES-CONSISTENCY-harness.js                          */
'use strict';
const fs=require('fs'), vm=require('vm'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
function fn(n){const s='function '+n+'(';const i=src.indexOf(s);if(i<0)throw new Error('missing '+n);
  let k=src.indexOf('{',i),d=0;for(;k<src.length;k++){const c=src[k];if(c==='{')d++;else if(c==='}'){d--;if(!d){k++;break;}}}return src.slice(i,k);}

const H=3600e3,D=86400e3,NOW=1000*D;
let ELIG=[], LIVE=0, RECON_FLAG=false, RECON_ACTIVE=null;
const sb={ console,
  Date:(()=>{const R=Date;return class extends R{static now(){return NOW;}};})(),
  activeRange:'30d', baseCurrency:'USD', toBase:v=>v,
  assets:[{id:'x'}],
  investableValueBase:()=>LIVE,
  _aurixEligibleInvestableSeries:()=>({series:ELIG,meta:{excluded:0,reasons:{}}}),
  _aurixChartDataReady:()=>true,
  _aurixInvestableChartEpoch:()=>0,
  _aurixReconFlag:()=>RECON_FLAG,
  _aurixChartSettleUntil:0,
  _aurixLastGoodByRange:{},
  _aurixChartAnchorTail:(s)=>s,
  _aurixLastGoodReusable:()=>false,
  _aurixRangeReturn:()=>({valid:true,deltaPct:0,deltaAbs:0}),
};
Object.defineProperty(sb,'_reconActive',{ get(){ return RECON_ACTIVE; } });
sb.window=sb; vm.createContext(sb);
// P0-FINAL-RENDER-OWNERSHIP-SURGERY — _aurixDashSeries + getDashboardChartRenderState are now PASSIVE
// consumers of the single producer. Stub computePerformanceSnapshot to expose the canonical series as
// snapshot.chartSeries ({ts,value}); the consumers map it back to {time,value}, so V2===canonical still holds.
vm.runInContext("function computePerformanceSnapshot(r){ var rs=(getInstitutionalPerformanceSeries(r).renderSeries)||[]; return { graphReady: rs.length>=2, badgeReady: rs.length>=2, chartSeries: rs.map(function(p){return {ts:p.time,value:p.value};}), tone:'flat', displayedReturnPct:0 }; }", sb);
[ fn('getCanonicalPortfolioSeries'),fn('getInstitutionalPerformanceSeries'),fn('getAurixRenderSeries'),
  fn('_aurixLegacyDataFromCanonical'),fn('_aurixDashSeries'),fn('getDashboardChartRenderState')
].forEach(c=>vm.runInContext(c,sb));

let ok=true; const ck=(n,c,g)=>{console.log((c?'  ✓':'  ✗')+' '+n+(g!==undefined?'  ['+g+']':''));if(!c)ok=false;};
const RANGES=['24h','7d','30d','1y','all'];
const last=a=>(a&&a.length?a[a.length-1]:null);
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b>0&&Math.abs(a-b)/b<0.005;

// Full real investable history ending at LIVE.
ELIG=[{ts:NOW-360*D,value:10000},{ts:NOW-250*D,value:54809},{ts:NOW-90*D,value:74506},
      {ts:NOW-30*D,value:73800},{ts:NOW-7*D,value:73500},{ts:NOW-1*D,value:73200},{ts:NOW,value:73100}];
LIVE=73170;

console.log('CASES 1-5 — every surface accessor === canonical, last === dashboard (per range)');
RANGES.forEach(r=>{
  const canon = sb.getInstitutionalPerformanceSeries(r).renderSeries;
  const wsc   = sb.getAurixRenderSeries(r);
  const v2dash= sb._aurixDashSeries(r);
  const legacy= sb._aurixLegacyDataFromCanonical(r);
  let v2state=[]; try{ const d=sb.getDashboardChartRenderState(r); v2state=(d.state==='ready')?d.series:[]; }catch(_){}
  const sameWsc   = wsc.length===canon.length && wsc.every((p,i)=>p.time===canon[i].time && p.value===canon[i].value);
  const sameV2    = v2dash.length===canon.length && v2dash.every((p,i)=>p.time===canon[i].time && p.value===canon[i].value);
  const sameV2st  = v2state.length===canon.length && v2state.every((p,i)=>p.time===canon[i].time && Math.abs(p.value-canon[i].value)<1e-9);
  const sameLegacy= legacy.values.length===canon.length && legacy.values.every((v,i)=>v===canon[i].value);
  const lastOK    = last(canon) && near(last(canon).value, LIVE) && near(legacy.lastValue, LIVE);
  ck(`${r}: WSC===canonical`, sameWsc, wsc.length+'/'+canon.length);
  ck(`${r}: V2(_aurixDashSeries)===canonical`, sameV2);
  ck(`${r}: V2(getDashboardChartRenderState.series)===canonical`, sameV2st, 'len '+v2state.length+'/'+canon.length);
  ck(`${r}: Chart.js legacy values===canonical`, sameLegacy);
  ck(`${r}: last === dashboard ${LIVE}`, lastOK, last(canon)&&Math.round(last(canon).value));
});

// P0-FINAL-RENDER-OWNERSHIP-SURGERY — getDashboardChartRenderState is now a PURE snapshot adapter: it owns
// no series and consumes no _reconActive in EITHER flag state. The series is always the canonical
// snapshot.chartSeries; isRecon is always false. (The recon/PCE override no longer lives in this renderer.)
console.log('\nCASE 6 — getDashboardChartRenderState is a pure snapshot adapter (never consumes _reconActive)');
RECON_FLAG=false; RECON_ACTIVE={ range:'30d', currency:'USD', series:[{time:NOW-10*D,value:999999},{time:NOW,value:999999}] };
{ const d=sb.getDashboardChartRenderState('30d');
  ck('flag OFF → series is canonical (not the 999999 recon), isRecon false', d.series.every(p=>p.value!==999999) && d.isRecon!==true, 'isRecon='+d.isRecon); }
console.log('\nCASE 6b — even with PCE flag ON the renderer does NOT inject recon (single series owner)');
RECON_FLAG=true;
{ const d=sb.getDashboardChartRenderState('30d');
  ck('flag ON → still canonical snapshot.chartSeries, isRecon false (no duplicate series owner)', d.series.every(p=>p.value!==999999) && d.isRecon!==true, 'isRecon='+d.isRecon); }
RECON_FLAG=false; RECON_ACTIVE=null;

console.log('\nCASE 7 — getChartData does NOT feed the main visible chart');
{ const usesGetChartData = /getChartData\(/.test(fn('_aurixDashSeries')) || /getChartData\(/.test(fn('getAurixRenderSeries')) || /getChartData\(/.test(fn('getInstitutionalPerformanceSeries'));
  ck('WSC/V2 accessors contain NO getChartData call', !usesGetChartData); }

console.log('\nRESULT:', ok?'ALL PASS ✓ — one canonical source, no surface divergence':'FAIL ✗');
process.exit(ok?0:1);
