'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-RETURN-BASELINE-EXIT-harness — P0 (never get stuck in "Calculando…")
// ════════════════════════════════════════════════════════════════════════════
// CAUSE: a brand-new portfolio's value is ~100% freshly-formed capital, so the flow-neutral
// window is "flow-dominated" → getValidReturnBaseline returned invalidReason='flows_dominate_baseline'.
// That one-time onboarding/reset construction sits at the START of the lifecycle and never ages out of
// the active range, so pending stuck for 20–30 min+. FIX: _aurixPostConstructionBaseline re-checks
// whether the portfolio is ESTABLISHED (≥2 stable comparable snapshots AFTER construction, ≥min-history
// span, NO dominant ONGOING flow). If so the flow-neutral return is legitimate and pending clears
// automatically. It NEVER fabricates a return — it only lifts the over-conservative dominance veto;
// the % shown is still the canonical flow-neutral _aurixRangeReturn.deltaPct. PURE READ.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} }
const NOW = 1800000000000, MIN = 60000;

function makeEnv(){
  const sb = { Math, Number, Date: { now: () => NOW }, console:{log:()=>{}},
    activeRange:'30d', _cfg:null, _resetAt:0, _total:0, _series:[], _flows:[], categoryHistory:[] };
  sb._aurixRangeReturn = () => sb._cfg;
  sb._aurixResetAt = () => sb._resetAt;
  sb.totalValueBase = () => sb._total;
  sb._aurixEligibleInvestableSeries = () => ({ series: sb._series, meta:{} });
  sb._aurixLoadCapitalFlows = () => sb._flows;
  vm.createContext(sb);
  vm.runInContext('const _AURIX_RETURN_MIN_HISTORY_MS = 90*1000; const _AURIX_RETURN_FLOW_DOMINANCE = 0.5; const _AURIX_RETURN_ESTABLISHED_FRAC = 0.80; const _AURIX_RETURN_STABLE_STEP = 0.40; const _AURIX_RETURN_COMPARABLE_RATIO = {"24h":1.5,"7d":2.0,"30d":3.0,"1y":5.0,"all":8.0};', sb);
  vm.runInContext(fnSrc('_aurixPortfolioCreatedAt'), sb);
  vm.runInContext(fnSrc('_aurixReturnSnapshotStats'), sb);
  vm.runInContext(fnSrc('_aurixPostConstructionBaseline'), sb);
  vm.runInContext(fnSrc('getValidReturnBaseline'), sb);
  return sb;
}
const G = (sb) => vm.runInContext('getValidReturnBaseline("30d")', sb);

console.log('AURIX-RETURN-BASELINE-EXIT — stuck "Calculando…" fix\n');

console.log('Source — fix wired, guarded, additive (no chart/sync/persistence touch):');
ok('1 _aurixPostConstructionBaseline exists + is consulted only when flows_dominate (guarded)',
   /function _aurixPostConstructionBaseline\(/.test(app) &&
   /if \(invalidReason === 'flows_dominate_baseline' && typeof _aurixPostConstructionBaseline === 'function'\)/.test(app) &&
   /if \(postConstruction && postConstruction\.ok\) invalidReason = null;/.test(app));
ok('2 the % shown stays the canonical flow-neutral _aurixRangeReturn.deltaPct (no new return math)',
   /deltaPct: valid \? ret\.deltaPct : null, deltaAbs: valid \? ret\.deltaAbs : null,/.test(app));
ok('3 renderer / sync / merge / destructive-save lock untouched',
   /function renderAurixInstitutionalChart\(/.test(app) && /function _aurixMergePortfolio\(/.test(app) &&
   /const _AURIX_BLOCK_DESTRUCTIVE_SAVES = true;/.test(app));

console.log('\nThe reported trap — new portfolio, construction dominates the window:');
{ const sb = makeEnv();
  sb._total = 5000; sb._resetAt = 0;
  // flow-neutral return over the whole window is ~0% (construction neutralised), but netFlows dominates
  sb._cfg = { valid:true, deltaPct:0.0, deltaAbs:0, startValue:2000, baselineTs:NOW-10*MIN, lastTs:NOW, netFlowsNeutralized:3000 };
  // incremental onboarding: 2000 → 5000, then established ~5000 for 8 min
  sb._series = [ {ts:NOW-10*MIN, value:2000}, {ts:NOW-8*MIN, value:5000}, {ts:NOW-4*MIN, value:5010}, {ts:NOW, value:5000} ];
  sb._flows  = [ {ts:NOW-9*MIN, amountUSD:3000, kind:'asset_add'} ];   // construction flow, BEFORE establishment
  sb.categoryHistory = sb._series.slice();
  const g = G(sb);
  ok('4 WITHOUT the fix this is flows_dominate_baseline (ratio ≥0.5)', g.flowDominanceRatio >= 0.5);
  ok('5 WITH the fix → EXITS pending automatically (established, stable, no ongoing flow)', g.valid===true && g.returnState==='ready');
  ok('6 shows the canonical flow-neutral return (0%), never a false loss', g.deltaPct===0.0);
  ok('7 diagnosis fields present (Fase 1): snapshotCount/validSnapshotCount/comparableSnapshotCount/flowDominanceRatio',
     g.snapshotCount===4 && g.validSnapshotCount===4 && g.comparableSnapshotCount===3 && Number.isFinite(g.flowDominanceRatio));
  ok('8 postConstruction.ok=true, reason "established", ongoingFlows 0', g.postConstruction && g.postConstruction.ok===true && g.postConstruction.reason==='established' && g.postConstruction.ongoingFlows===0); }

console.log('\nGuard still protects — a LARGE ongoing flow after establishment keeps pending:');
{ const sb = makeEnv();
  sb._total = 5000; sb._resetAt = 0;
  sb._cfg = { valid:true, deltaPct:0.0, deltaAbs:0, startValue:2000, baselineTs:NOW-10*MIN, lastTs:NOW, netFlowsNeutralized:3000 };
  sb._series = [ {ts:NOW-10*MIN, value:2000}, {ts:NOW-8*MIN, value:5000}, {ts:NOW-4*MIN, value:5010}, {ts:NOW, value:5000} ];
  sb._flows  = [ {ts:NOW-9*MIN, amountUSD:3000, kind:'asset_add'}, {ts:NOW-2*MIN, amountUSD:4000, kind:'deposit'} ];  // big ONGOING flow
  sb.categoryHistory = sb._series.slice();
  const g = G(sb);
  ok('9 ongoing flow dominates → stays pending (flows_dominate_baseline)', g.valid===false && g.invalidReason==='flows_dominate_baseline');
  ok('10 postConstruction.reason = ongoing_flows_dominate', g.postConstruction && g.postConstruction.reason==='ongoing_flows_dominate'); }

console.log('\nGuard still protects — an UNSTABLE jump (possible hidden flow) keeps pending:');
{ const sb = makeEnv();
  sb._total = 5000; sb._resetAt = 0;
  sb._cfg = { valid:true, deltaPct:0.0, deltaAbs:0, startValue:2000, baselineTs:NOW-10*MIN, lastTs:NOW, netFlowsNeutralized:3000 };
  sb._series = [ {ts:NOW-10*MIN, value:2000}, {ts:NOW-8*MIN, value:5000}, {ts:NOW-4*MIN, value:9000}, {ts:NOW, value:5000} ]; // +80% jump
  sb._flows  = [ {ts:NOW-9*MIN, amountUSD:3000, kind:'asset_add'} ];
  sb.categoryHistory = sb._series.slice();
  const g = G(sb);
  ok('11 unstable comparable change → stays pending', g.valid===false && g.invalidReason==='flows_dominate_baseline' && g.postConstruction.reason==='unstable_comparable_change'); }

console.log('\nGuard still protects — only ONE established snapshot (not yet 2 comparable):');
{ const sb = makeEnv();
  sb._total = 5000; sb._resetAt = 0;
  sb._cfg = { valid:true, deltaPct:0.0, deltaAbs:0, startValue:2000, baselineTs:NOW-3*MIN, lastTs:NOW, netFlowsNeutralized:3000 };
  sb._series = [ {ts:NOW-3*MIN, value:2000}, {ts:NOW, value:5000} ];  // just hit full value now
  sb._flows  = [ {ts:NOW-2*MIN, amountUSD:3000, kind:'asset_add'} ];
  sb.categoryHistory = sb._series.slice();
  const g = G(sb);
  ok('12 only 1 established snapshot → still pending (need 2 comparable)', g.valid===false && g.invalidReason==='flows_dominate_baseline'); }

console.log('\nReset / pre-reset still wins (lifecycle isolation intact):');
{ const sb = makeEnv();
  sb._total = 5000; sb._resetAt = NOW - 5*MIN;
  sb._cfg = { valid:true, deltaPct:-40, deltaAbs:-2000, startValue:8000, baselineTs:NOW-20*MIN, lastTs:NOW, netFlowsNeutralized:10 };
  sb._series = [ {ts:NOW-20*MIN, value:8000}, {ts:NOW, value:5000} ];
  sb.categoryHistory = sb._series.slice();
  const g = G(sb);
  ok('13 pre-reset baseline → pending (pre_reset), never the old-account loss', g.valid===false && g.invalidReason==='pre_reset'); }

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
