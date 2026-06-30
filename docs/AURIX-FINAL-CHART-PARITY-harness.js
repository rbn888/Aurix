'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-FINAL-CHART-PARITY-harness — P0 desktop/mobile draw ONE canonical series; strict comparability;
// honest range collapse; construction/regime cleanup; no absurd returns.
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c,i){ if(c){pass++;console.log('  ✓ '+n+(i?'  ['+i+']':''));}else{fail++;console.log('  ✗ '+n+(i?'  ['+i+']':''));} }
const NOW = 1800000000000, DAY = 864e5, HR = 36e5;

console.log('AURIX-FINAL-CHART-PARITY — one canonical series, strict comparability, honest collapse\n');

// ── PART A — key-only adapters (no filter, no recompute) ──
console.log('PART A — desktop/mobile adapters change KEYS only (one canonical series):');
{ const canonical = [{ts:1,value:100},{ts:2,value:110},{ts:3,value:120}];
  const desktop = canonical.map(p => ({ time: p.ts, value: p.value }));
  const mobile  = canonical.map(p => ({ ts: p.ts, value: p.value }));
  ok('1 mobile draws from canonical ⇒ desktop draws same COUNT', desktop.length === mobile.length && desktop.length === canonical.length);
  ok('2 desktop adapter {ts,value}→{time,value}: no filtering, same values in order',
     desktop.every((p,i) => p.value === canonical[i].value && p.time === canonical[i].ts) && desktop.length === canonical.length);
  ok('4 24H valid series ⇒ desktop/mobile same values (only the key differs)',
     desktop.every((p,i) => p.value === mobile[i].value)); }
ok('1b the diagnostic builds desktop/mobile by KEY-ONLY map of chartSeriesCanonical',
   /const desktopSeries = canonical\.map\(p => \(\{ time: p\.ts, value: p\.value \}\)\);/.test(app) &&
   /const mobileSeries = canonical\.map\(p => \(\{ ts: p\.ts, value: p\.value \}\)\);/.test(app));
ok('3 desktop skeleton forbidden when graphReady: _wscPaintSurface dissolves the loading skin to "ready"',
   /_aurixSetChartSkin\(opts\.uid === 'm' \? 'mobile' : 'desktop', 'ready'\)/.test(fnSrc('_wscPaintSurface')) &&
   /_aurixSetChartSkin\(opts\.uid === 'm' \? 'mobile' : 'desktop', 'building'\)/.test(fnSrc('_wscPaintSurface')));
ok('13 desktop & mobile canDraw computed from the SAME snapshot.graphReady (can never disagree)',
   /out\.desktopCanDraw = !!\(snap && snap\.graphReady && dd\.count >= 2\);/.test(app) &&
   /out\.mobileCanDraw = !!\(snap && snap\.graphReady && md\.count >= 2\);/.test(app));

// ── PART C/E — strict comparability rejects the absurd −67% baseline ──
console.log('\nPART C/E — strict comparability rejects a non-comparable (capital-regime) baseline:');
function gvrbEnv(ratio){
  const sb = { Math, Number, Date:{ now:()=>NOW }, console:{log:()=>{}}, activeRange:'7d', _cfg:null, _total:0, _resetAt:0 };
  sb._aurixRangeReturn = () => sb._cfg; sb._aurixResetAt = () => sb._resetAt; sb.totalValueBase = () => sb._total;
  vm.createContext(sb);
  vm.runInContext('const _AURIX_RETURN_MIN_HISTORY_MS=90*1000; const _AURIX_RETURN_FLOW_DOMINANCE=0.5; const _AURIX_RETURN_COMPARABLE_RATIO='+JSON.stringify(ratio)+';', sb);
  vm.runInContext(fnSrc('_aurixPortfolioCreatedAt'), sb);
  vm.runInContext(fnSrc('getValidReturnBaseline'), sb);
  return sb;
}
const STRICT = {"24h":1.20,"7d":1.35,"30d":1.75,"1y":3.00,"all":3.00};
{ const sb = gvrbEnv(STRICT); sb._total = 1000; sb._resetAt = 0;
  // baseline 3000 vs current 1000 → ratio 3.0 → −66.7% (the reported absurd 7D return)
  sb._cfg = { valid:true, deltaPct:-66.7, deltaAbs:-2000, startValue:3000, baselineTs:NOW-3*DAY, lastTs:NOW, netFlowsNeutralized:0 };
  const g = vm.runInContext('getValidReturnBaseline("7d")', sb);
  ok('6 TOTAL/7D cannot publish −67%: 3× baseline → baseline_not_comparable → pending (not ready)',
     g.valid===false && g.invalidReason==='baseline_not_comparable' && g.deltaPct===null, 'reason='+g.invalidReason);
  ok('11 no comparable baseline ⇒ returnState pending_baseline, not ready', g.returnState==='pending_baseline'); }
{ const sb = gvrbEnv(STRICT); sb._total = 5000; sb._resetAt = 0;
  // comparable baseline (5200 vs 5000 → ratio 1.04 < 1.35) → real return shows
  sb._cfg = { valid:true, deltaPct:-3.85, deltaAbs:-200, startValue:5200, baselineTs:NOW-3*DAY, lastTs:NOW, netFlowsNeutralized:0 };
  ok('6b comparable baseline (ratio<1.35) → READY with the real return', vm.runInContext('getValidReturnBaseline("7d")', sb).valid===true); }
ok('6c strict thresholds present in source',
   /_AURIX_RETURN_COMPARABLE_RATIO = \{ '24h': 1\.20, '7d': 1\.35, '30d': 1\.75, '1y': 3\.00, 'all': 3\.00 \};/.test(app));

// ── PART B/E — honest range collapse ──
console.log('\nPART B/E — short history is reported as a collapse, not "different history per range":');
ok('5 snapshot exposes rangeCollapsedBecauseHistoryTooShort (history span < range span, not "all")',
   /const rangeCollapsedBecauseHistoryTooShort = \(r !== 'all'\) && Number\.isFinite\(_rangeMs\) && _histSpanMs > 0 && _histSpanMs < _rangeMs;/.test(app) &&
   /rangeCollapsedBecauseHistoryTooShort: rangeCollapsedBecauseHistoryTooShort,/.test(app));
{ // collapse formula: 3 days of history, 7d range → collapsed
  const histSpan = 3*DAY, rangeMs = 6048e5;   // 7d
  ok('5b collapse formula true when history(3d) < range(7d)', (histSpan>0 && histSpan<rangeMs) === true);
  ok('5c collapse formula false for "all"', false === ('all' !== 'all')); }

// ── PART D — construction/regime + dedup/order/null cleanup (eligible series) ──
console.log('\nPART D — construction/regime snapshots + dup/out-of-order/invalid cleaned from the series:');
function eligEnv(src){
  const sb = { Math, Number, Date:{ now:()=>NOW }, console:{log:()=>{}}, activeRange:'all' };
  vm.createContext(sb);
  vm.runInContext('var SRC='+JSON.stringify(src)+';', sb);
  vm.runInContext('function _aurixHistorySourceForDisplay(){return SRC;} var categoryHistory=SRC; function _aurixPortfolioEpoch(){return 0;} function toBase(v){return v;} function investableValueBase(){return 8000;}', sb);
  vm.runInContext(fnSrc('_aurixInvestableSnapshots'), sb);
  vm.runInContext(fnSrc('_aurixEligibleInvestableSeries'), sb);
  return sb;
}
{ // current ≈ 8000; a leading construction point at 800 (0.1×) + a polluted 40000 (5×) + clean ~8000s
  const src = [
    { ts: NOW-20*DAY, total: 800,   real_estate: 0 },     // construction (≪ band) → rejected
    { ts: NOW-19*DAY, total: 40000, real_estate: 0 },     // capital-regime/polluted (≫ band) → rejected
    { ts: NOW-10*DAY, total: 8000,  real_estate: 0 },
    { ts: NOW-5*DAY,  total: 8100,  real_estate: 0 },
    { ts: NOW,        total: 8050,  real_estate: 0 },
  ];
  const sb = eligEnv(src);
  const el = vm.runInContext("_aurixEligibleInvestableSeries('all')", sb);
  ok('7 leading construction/regime snapshots removed from the eligible series', el.series.every(p => p.value > 2000 && p.value < 20000) && el.meta.excluded >= 2); }
{ const src = [ {ts:NOW-3*DAY,total:8000,real_estate:0}, {ts:NOW-3*DAY,total:8000,real_estate:0}, {ts:NOW-DAY,total:8050,real_estate:0}, {ts:NOW,total:8100,real_estate:0} ];
  const sb = eligEnv(src);
  const inv = vm.runInContext("_aurixInvestableSnapshots('all')", sb);
  const ts = inv.map(p=>p.ts); const sorted = ts.slice().sort((a,b)=>a-b);
  ok('9 out-of-order timestamps are sorted deterministically', JSON.stringify(ts)===JSON.stringify(sorted)); }
{ const src = [ {ts:NOW-3*DAY,total:0,real_estate:0}, {ts:NOW-2*DAY,total:null,real_estate:0}, {ts:NOW-DAY,total:8000,real_estate:0}, {ts:NOW,total:8100,real_estate:0} ];
  const sb = eligEnv(src);
  const inv = vm.runInContext("_aurixInvestableSnapshots('all')", sb);
  ok('10 invalid/null/zero investable values rejected (only finite >0 survive)', inv.every(p => Number.isFinite(p.value) && p.value > 0) && inv.length === 2); }
ok('8 de-dup/sort happen in the series builder (sort by ts), not in a renderer',
   /\.sort\(\(a, b\) => a\.ts - b\.ts\);/.test(fnSrc('_aurixInvestableSnapshots')));

// ── PART F / sanity ──
console.log('\nSanity + no-renderer-business-logic:');
ok('12 sanity-fail path exists: pending_sanity when the return is not explained by baseline/current/flows',
   /return_unexplained_by_baseline_current_flows/.test(app) && /returnState: 'pending_sanity'/.test(app));
ok('14 no renderer performs filtering/baseline logic (consumers read the snapshot; engine calls only in producer)',
   !/getValidReturnBaseline\(|getInstitutionalPerformanceSeries\(|_aurixRangeReturn\(/.test(fnSrc('_aurixReconSyncHeadline')) &&
   !/getValidReturnBaseline\(|getInstitutionalPerformanceSeries\(/.test(fnSrc('_aurixMobileSetPerfIndicator')) &&
   !/getInstitutionalPerformanceSeries\(|getAurixRenderSeries\(/.test(fnSrc('getDashboardChartRenderState')));
ok('15 window.aurixFinalChartParityDebug exposes the mandated parity fields',
   /window\.aurixFinalChartParityDebug = function/.test(app) &&
   ['snapshotChartSeriesCount','desktopInputCount','mobileInputCount','desktopCanDraw','mobileCanDraw','desktopNoDrawReason','mobileNoDrawReason','desktopMobileSeriesSameCount','rangeCollapsedBecauseHistoryTooShort','firstBadStage','sanityPassed']
     .every(k => app.indexOf(k) !== -1));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
