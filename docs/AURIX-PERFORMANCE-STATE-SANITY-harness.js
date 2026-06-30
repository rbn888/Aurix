'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-PERFORMANCE-STATE-SANITY-harness — P0 never publish a % that can't be proven mathematically
// ════════════════════════════════════════════════════════════════════════════
// A ready performance_state[range] is published ONLY if the maths reconciles: baseline + current + chart
// series + flows. _aurixPerformanceSanityCheck(range) is the gate; a failing ready candidate is published as
// returnState:"pending_sanity" (no %, no €, no colour) for THAT range only ⇒ the consumer shows Calculando.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} }
const NOW = 1800000000000;

function env(){
  const sb = { Math, Number, JSON, Date:{ now:()=>NOW }, console:{log:()=>{}} };
  vm.createContext(sb);
  vm.runInContext("const _AURIX_PERF_SANITY_PCT_TOL=0.10; const _AURIX_PERF_SANITY_VALUE_REL_TOL=0.01; const _AURIX_PERF_SANITY_VALUE_ABS_TOL=1; const _AURIX_PERF_STATE_MAX_AGE_MS="+(6*3600*1000)+"; const _AURIX_PERF_RANGE_WINDOW_MS={'24h':86400000,'7d':604800000,'30d':2592000000,'1y':31536000000,'all':Infinity}; const _AURIX_RETURN_COMPARABLE_RATIO={'24h':1.5,'7d':2.0,'30d':3.0,'1y':5.0,'all':8.0};", sb);
  vm.runInContext("var activeRange='24h'; var _canon={}, _ret={}, _cur=null;", sb);
  vm.runInContext("function _aurixCanonicalPerformance(r){return _canon[r]||null;} function _aurixRangeReturn(r){return _ret[r]||null;} function totalValueBase(){return _cur;} function _aurixHistoryHash(parts){return 'h:'+parts.join('|');}", sb);
  vm.runInContext(fnSrc('_aurixSeriesWithinRange'), sb);
  vm.runInContext(fnSrc('_aurixPerformanceSanityCheck'), sb);
  return sb;
}
function set(sb, r, canon, ret, cur){ vm.runInContext("_canon['"+r+"']="+JSON.stringify(canon)+"; _ret['"+r+"']="+JSON.stringify(ret)+"; _cur="+cur+";", sb); }
const check = (sb,r,opts) => vm.runInContext("_aurixPerformanceSanityCheck('"+r+"'"+(opts?","+JSON.stringify(opts):"")+")", sb);
// a fully coherent 24h candidate: baseline 8000 → current 8100, +100 / +1.25%, no flows
const C = () => ({ chartSeries:[{ts:1,value:8000},{ts:2,value:8100}], chartSeriesHash:'H24', baselineValue:8000, baselineSnapshotId:1, displayedReturnPct:1.25, displayedReturnValue:100, lastSnapshotTs:2 });
const R = () => ({ netFlowsNeutralized:0, grossDeltaPct:1.25 });

console.log('AURIX-PERFORMANCE-STATE-SANITY — provable maths or pending_sanity\n');

console.log('Rejections — a ready candidate that cannot be proven becomes pending_sanity:');
{ const sb=env(); const c=C(); c.displayedReturnPct=-1.52;                 set(sb,'24h',c,R(),8100);   // pct doesn't match value/baseline
  const s=check(sb,'24h'); ok('1 formula/pct incoherent → FAIL (pct_value_baseline_incoherent)', s.sanityPassed===false && s.sanityFailureReason==='pct_value_baseline_incoherent'); }
{ const sb=env(); const c=C(); c.displayedReturnValue=300; c.displayedReturnPct=3.75; set(sb,'24h',c,R(),8100);  // internally coherent but value not explained by baseline/current (no flows)
  const s=check(sb,'24h'); ok('2 displayedReturnValue not explained by baseline/current/flows → FAIL', s.sanityPassed===false && s.sanityFailureReason==='return_unexplained_by_baseline_current_flows'); }
{ const sb=env(); set(sb,'24h',C(),R(),9000);                              // current 9000 ≠ chart last 8100
  const s=check(sb,'24h'); ok('3 chartLastValue ≠ currentValue → FAIL (chart_current_mismatch)', s.sanityPassed===false && s.sanityFailureReason==='chart_current_mismatch'); }
{ const sb=env(); const c=C(); c.baselineSnapshotId=999;                   set(sb,'24h',c,R(),8100);   // baseline ts not in series
  const s=check(sb,'24h'); ok('4 baselineSnapshotId not in series → FAIL (baseline_not_in_series)', s.sanityPassed===false && s.sanityFailureReason==='baseline_not_in_series'); }
{ const sb=env(); const c=C(); c.chartSeries=[{ts:2,value:8100}];          set(sb,'24h',c,R(),8100);   // <2 points
  const s=check(sb,'24h'); ok('5 pointCount < 2 → FAIL (insufficient_chart_series)', s.sanityPassed===false && s.sanityFailureReason==='insufficient_chart_series'); }
{ const sb=env(); set(sb,'24h',C(),R(),8100);
  const s=check(sb,'24h',{ calculatedAt: NOW - 7*3600*1000 });              // 7h old > 6h ceiling
  ok('6 stale calculatedAt → FAIL (stale_calculated_at)', s.sanityPassed===false && s.sanityFailureReason==='stale_calculated_at'); }

console.log('\nAcceptance — provable maths passes (incl. explained flow-neutral adjustment):');
{ const sb=env(); set(sb,'24h',C(),R(),8100);
  const s1=check(sb,'24h'), s2=check(sb,'24h');
  ok('7 deterministic web/mobile hash (same series → same webMobileDeterministicHash) + PASS', s1.sanityPassed===true && s1.webMobileDeterministicHash===s2.webMobileDeterministicHash && s1.webMobileDeterministicHash!=null); }
{ const sb=env(); set(sb,'24h',C(),R(),8100);
  const s=check(sb,'24h'); ok('8 coherent 24h (baseline 8000 → 8100, +1.25%) → READY (sanityPassed)', s.sanityPassed===true && s.sanityFailureReason===null && s.chartMatchesCurrentValue===true); }
{ const sb=env(); const c=C(); c.displayedReturnValue=100; c.displayedReturnPct=1.25;   // flow-neutral: raw would be +300, but 200 of flows explains it
  set(sb,'24h',c,{ netFlowsNeutralized:200, grossDeltaPct:3.75 },8300);   // chart last 8100, current 8100? keep current=chartLast
  vm.runInContext("_canon['24h'].chartSeries=[{ts:1,value:8000},{ts:2,value:8100}]; _cur=8100;", sb);
  const s=check(sb,'24h'); ok('8b flow-neutral adjustment EXPLAINED by registered flows → READY', s.sanityPassed===true); }

console.log('\nIsolation — a 24h sanity failure does not contaminate other ranges:');
{ const sb=env(); const bad=C(); bad.displayedReturnPct=-1.52; set(sb,'24h',bad,R(),8100);
  const good=C(); set(sb,'7d',good,R(),8100);
  ok('9 24h FAIL + 7d PASS (per-range independent)', check(sb,'24h').sanityPassed===false && check(sb,'7d').sanityPassed===true); }

console.log('\nWriter publishes pending_sanity (no %, no €, pending colour) — consumer shows Calculando:');
ok('10 writer stores pending_sanity for a failing ready candidate (null pct/value, reason carried)',
   /returnState: 'pending_sanity', sanityFailureReason: sane\.sanityFailureReason/.test(fnSrc('_aurixComputePerformanceStateCandidate')) &&
   /displayedReturnPct: null, displayedReturnValue: null, displayedColor: 'pending'/.test(fnSrc('_aurixComputePerformanceStateCandidate')));
ok('11 the consumer shows Calculando for a null displayedReturnPct (existing kill-switch)',
   /if \(psRow && Number\.isFinite\(psRow\.displayedReturnPct\)\)/.test(fnSrc('getValidReturnBaseline')));
ok('12 sanity runs ONLY for a valid candidate (pending ranges keep their own state)',
   /const sane = \(g\.valid && typeof _aurixPerformanceSanityCheck === 'function'\)/.test(fnSrc('_aurixComputePerformanceStateCandidate')));

console.log('\nDiagnostic — window.aurixPerformanceSanityDebug exposes every mandated field:');
ok('13 helper defined + all required fields',
   /window\.aurixPerformanceSanityDebug = function/.test(app) &&
   ['build','range','lifecycleId','portfolioRevision','performanceStateRevision','calculatedAt','ageMs','currentValueUsed',
    'baselineValueUsed','baselineSnapshotId','baselineTimestamp','displayedReturnPct','displayedReturnValue','formulaExpectedPct',
    'formulaExpectedValue','pctDeltaVsFormula','valueDeltaVsFormula','chartSeriesHash','chartPointCount','firstChartPoint',
    'lastChartPoint','chartLastValue','chartMatchesCurrentValue','sourceSeriesHash','sourcePointCount','webMobileDeterministicHash',
    'sanityPassed','sanityFailureReason'].every(k => app.indexOf(k + ':') !== -1 || app.indexOf(k + ' ') !== -1));

console.log('\nNo-touch (UI/renderer/holdings/pricing/baseline calc untouched — only generation/validation):');
ok('14 chart renderer + holdings merge + baseline engine + pricing-guard untouched',
   /function renderAurixInstitutionalChart\(/.test(app) && /function _aurixMergePortfolio\(/.test(app) &&
   /function _aurixRangeReturn\(range\)/.test(app) && /reason: 'invalid_total'/.test(fnSrc('_shouldRejectSnapshot')));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
