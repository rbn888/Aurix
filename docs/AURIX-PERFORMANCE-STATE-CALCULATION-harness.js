'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-PERFORMANCE-STATE-CALCULATION-harness — P0 baseline must be economically comparable
// ════════════════════════════════════════════════════════════════════════════
// Production published baselineValue=5503.16, return −64.39% (−3543.57€) for a portfolio now worth ~1960.
// ROOT CAUSE: the baseline (5503) belonged to a different CAPITAL regime (construction peak / an unrecorded
// withdrawal that flow-neutralisation missed), so the "return" measured capital movement, not market
// performance. FIX: (1) the establishment anchor now requires a COMPARABLE band [0.80×,1.25×] of current
// (it used value ≥ 0.80×current with NO upper bound → picked the 5503 peak for a shrunk portfolio); (2) a
// range-aware comparability gate rejects any baseline whose value ratio vs current exceeds the max plausible
// MARKET ratio ⇒ returnState pending_baseline ("Calculando…") instead of a mathematically wrong return.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} }
const NOW = 1800000000000, DAY = 86400000;

function makeEnv(range){
  const sb = { Math, Number, Date:{ now:()=>NOW }, console:{log:()=>{}}, activeRange: range || '24h', _cfg:null, _total:1959.59 };
  sb._aurixRangeReturn = () => sb._cfg;
  sb._aurixResetAt = () => 0;
  sb.totalValueBase = () => sb._total;
  sb._aurixEligibleInvestableSeries = () => ({ series:[{ts:NOW-2*DAY,value:5503.16},{ts:NOW,value:1959.59}], meta:{} });
  sb._aurixLoadCapitalFlows = () => [];
  vm.createContext(sb);
  vm.runInContext('var currentUser = null;', sb);  // anonymous ⇒ exercise the LOCAL raw comparability gate directly
  vm.runInContext('const _AURIX_RETURN_MIN_HISTORY_MS=90*1000; const _AURIX_RETURN_FLOW_DOMINANCE=0.5; const _AURIX_RETURN_ESTABLISHED_FRAC=0.80; const _AURIX_RETURN_STABLE_STEP=0.40; const _AURIX_RETURN_COMPARABLE_RATIO={"24h":1.5,"7d":2.0,"30d":3.0,"1y":5.0,"all":8.0};', sb);
  vm.runInContext(fnSrc('_aurixPortfolioCreatedAt'), sb);
  vm.runInContext(fnSrc('_aurixReturnSnapshotStats'), sb);
  vm.runInContext(fnSrc('_aurixPostConstructionBaseline'), sb);
  vm.runInContext(fnSrc('getValidReturnBaseline'), sb);
  return sb;
}
const G = (sb,range) => vm.runInContext('getValidReturnBaseline("'+(range||'24h')+'")', sb);

console.log('AURIX-PERFORMANCE-STATE-CALCULATION — reject non-comparable baselines\n');

console.log('The exact production case — baseline 5503.16, current 1959.59 (24H):');
{ const sb=makeEnv('24h');
  sb._cfg = { valid:true, deltaPct:-64.3916, deltaAbs:-3543.57, startValue:5503.16, baselineTs:NOW-2*DAY, lastTs:NOW, netFlowsNeutralized:0 };
  const g=G(sb,'24h');
  ok('1 ratio 5503/1960 = 2.8× > 1.5 (24H) → baseline_not_comparable → pending (NOT −64.39%)',
     g.valid===false && g.invalidReason==='baseline_not_comparable' && g.deltaPct===null && g.returnState==='pending_baseline'); }

console.log('\nA genuinely comparable baseline IS accepted:');
{ const sb=makeEnv('24h'); sb._total=4120;
  sb._aurixEligibleInvestableSeries = () => ({ series:[{ts:NOW-3*DAY,value:4000},{ts:NOW,value:4120}], meta:{} });
  sb._cfg = { valid:true, deltaPct:3.0, deltaAbs:120, startValue:4000, baselineTs:NOW-3*DAY, lastTs:NOW, netFlowsNeutralized:5 };
  const g=G(sb,'24h');
  ok('2 ratio 4000/4120 = 1.03× ≤ 1.5 → comparable → valid (+3%)', g.valid===true && g.deltaPct===3.0 && g.returnState==='ready'); }

console.log('\nRange-aware band — the same ratio that blocks 24H can be comparable on a long range:');
{ const sb=makeEnv('all'); sb._total=2000;
  sb._aurixEligibleInvestableSeries = () => ({ series:[{ts:NOW-300*DAY,value:5503},{ts:NOW,value:2000}], meta:{} });
  sb._cfg = { valid:true, deltaPct:-63.6, deltaAbs:-3503, startValue:5503, baselineTs:NOW-300*DAY, lastTs:NOW, netFlowsNeutralized:0 };
  ok('3 ratio 5503/2000 = 2.75× ≤ 8.0 (all) → comparable → valid (a long-range market drawdown is plausible)', G(sb,'all').valid===true); }
{ const sb=makeEnv('24h'); sb._total=2000;
  sb._cfg = { valid:true, deltaPct:-63.6, deltaAbs:-3503, startValue:5503, baselineTs:NOW-2*DAY, lastTs:NOW, netFlowsNeutralized:0 };
  ok('4 the SAME 2.75× ratio on 24H → baseline_not_comparable (implausible as a 24H market move)', G(sb,'24h').invalidReason==='baseline_not_comparable'); }

console.log('\nEstablishment anchor now requires a comparable band (no construction-peak baseline for a shrunk portfolio):');
ok('5 _aurixPostConstructionBaseline anchors within [0.80×,1.25×] of current (upper bound added)',
   /const ESTAB_LO = _AURIX_RETURN_ESTABLISHED_FRAC \* currentValue;[\s\S]*?const ESTAB_HI = currentValue \/ _AURIX_RETURN_ESTABLISHED_FRAC;[\s\S]*?snaps\[i\]\.value >= ESTAB_LO && snaps\[i\]\.value <= ESTAB_HI/.test(fnSrc('_aurixPostConstructionBaseline')));

console.log('\nThe gate re-asserts comparability after the post-construction escape (escape cannot re-admit it):');
ok('6 comparability re-checked after the flows_dominate escape',
   /if \(!invalidReason && !_baselineComparable\) invalidReason = 'baseline_not_comparable';/.test(fnSrc('getValidReturnBaseline')));

console.log('\nInstrumentation — the calculation/baseline diagnosis is exposed:');
const pd = (function(){ const i=app.indexOf('window.aurixPerformanceStateDebug = async function'); return app.slice(i, i+4000); })();
ok('7 aurixPerformanceStateDebug merges _aurixBaselineDiagnosis', /Object\.assign\(out, _aurixBaselineDiagnosis\(r\)\)/.test(app));
ok('8 diagnosis exposes the mandated baseline fields',
   ['inputSeriesCount','inputSeriesFirstSnapshot','inputSeriesLastSnapshot','candidateBaselines','selectedBaselineSnapshotId',
    'selectedBaselineValue','selectedBaselineReason','currentCanonicalValue','netCapitalFlows','marketReturnOnlyValue',
    'flowAdjustedValue','calculationFormula','rawReturnPct','rawReturnValue','finalReturnPct','finalReturnValue',
    'rejectedBaselineCandidates','baselineRejectedReason','baselineAcceptedReason','baselineComparable',
    'baselineDominatedByCapitalFlow','baselineConstructionSnapshot','baselinePortfolioAge','baselineMarketComparable']
     .every(k => fnSrc('_aurixBaselineDiagnosis').indexOf(k + ':') !== -1));

console.log('\nRule: pending is preferable to a wrong return; no fabrication:');
{ const sb=makeEnv('24h');
  sb._cfg = { valid:true, deltaPct:-64.39, deltaAbs:-3543, startValue:5503.16, baselineTs:NOW-2*DAY, lastTs:NOW, netFlowsNeutralized:0 };
  const g=G(sb,'24h');
  ok('9 a non-comparable baseline NEVER publishes a %/value (pending, no number)', g.deltaPct===null && g.deltaAbs===null && g.returnState==='pending_baseline'); }

console.log('\nNo-touch (renderer / holdings / pricing / persistence / consumer):');
ok('10 renderer / holdings merge / pricing / remote-consumption untouched',
   /function renderAurixInstitutionalChart\(/.test(app) && /function _aurixMergePortfolio\(/.test(app) &&
   /reason: 'invalid_total'/.test(fnSrc('_shouldRejectSnapshot')) && /function _aurixSelectRemotePerformance\(/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
