'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-FINAL-PERFORMANCE-KILL-SWITCH-harness — P0 single remote performance_state authority
// ════════════════════════════════════════════════════════════════════════════
// WHY v432 re-allowed divergence: each device still COMPUTED its displayed return from its OWN
// _aurixCanonicalCatHistory (its last remote pull). Because category_history is overwritten last-writer-wins,
// two devices' canonical stores transiently differ → deterministic-but-different inputs → −64.83% vs +7.39%.
// FIX: an authenticated client renders REAL performance ONLY from the confirmed REMOTE performance_state
// object (read back from Supabase, set ONLY in _mergeRemoteState). No remote object ⇒ KILL SWITCH:
// "Calculando…". Two devices read the SAME object ⇒ identical %/value/colour. opts.raw = the writer's local
// candidate (never displayed). The remote column may need provisioning (graceful: absent ⇒ Calculando).
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} }
const NOW = 1800000000000, DAY = 86400000;

function makeEnv(){
  const sb = { Math, Number, Date:{ now:()=>NOW }, console:{log:()=>{}}, activeRange:'30d', _total:4120 };
  sb._cfg = { valid:true, deltaPct:5.0, deltaAbs:200, startValue:4000, baselineTs:NOW-10*DAY, lastTs:NOW, netFlowsNeutralized:10 };
  sb._aurixRangeReturn = () => sb._cfg;
  sb._aurixResetAt = () => 0;
  sb.totalValueBase = () => sb._total;
  sb._aurixEligibleInvestableSeries = () => ({ series:[{ts:NOW-10*DAY,value:4000},{ts:NOW,value:4120}], meta:{} });
  sb._aurixLoadCapitalFlows = () => [];
  sb._aurixLifecycleId = () => 'lc-X';
  sb._aurixPortfolioRevision = () => 7;
  sb._aurixPortfolioEpoch = () => 0;
  vm.createContext(sb);
  vm.runInContext('var currentUser=null; var _aurixActiveUserId=null; var _aurixRemotePerformanceState=null;', sb);
  vm.runInContext('const _AURIX_RETURN_MIN_HISTORY_MS=90*1000; const _AURIX_RETURN_FLOW_DOMINANCE=0.5; const _AURIX_RETURN_ESTABLISHED_FRAC=0.80; const _AURIX_RETURN_STABLE_STEP=0.40; const _AURIX_RETURN_COMPARABLE_RATIO={"24h":1.5,"7d":2.0,"30d":3.0,"1y":5.0,"all":8.0};', sb);
  sb._aurixPendingSync = () => false;
  vm.runInContext(fnSrc('_aurixCurrentUserId'), sb);
  vm.runInContext(fnSrc('_aurixCurrentLifecycleId'), sb);
  vm.runInContext(fnSrc('_aurixCurrentRevision'), sb);
  vm.runInContext(fnSrc('_aurixSelectRemotePerformance'), sb);
  vm.runInContext(fnSrc('_aurixRemotePerformanceForRange'), sb);
  vm.runInContext(fnSrc('_aurixPortfolioCreatedAt'), sb);
  vm.runInContext(fnSrc('_aurixReturnSnapshotStats'), sb);
  vm.runInContext(fnSrc('_aurixPostConstructionBaseline'), sb);
  vm.runInContext(fnSrc('getValidReturnBaseline'), sb);   // canDisplayCanonicalReturn NOT loaded ⇒ _disp.ok=true (isolate the PS gate)
  return sb;
}
const G = (sb, opts) => vm.runInContext('getValidReturnBaseline("30d"'+(opts?', '+JSON.stringify(opts):'')+')', sb);
const authed = (sb) => vm.runInContext('currentUser={id:"u1"}; _aurixActiveUserId="u1";', sb);
function setPS(sb, obj){ sb.__ps = obj; vm.runInContext('_aurixRemotePerformanceState = __ps;', sb); }
const VALID_PS = { userId:'u1', lifecycleId:'lc-X', portfolioRevision:7, calculatedAt:NOW,
  byRange:{ '30d': { baselineSnapshotId:NOW-10*DAY, baselineValue:4000, displayedReturnPct:3.3, displayedReturnValue:130, displayedColor:'green', returnState:'ready', chartSeriesHash:'cs1', performanceHash:'ph1' } } };

console.log('AURIX-FINAL-PERFORMANCE-KILL-SWITCH — render real return ONLY from remote performance_state\n');

console.log('KILL SWITCH — authenticated user without a confirmed remote performance_state ⇒ Calculando:');
{ const sb=makeEnv(); authed(sb);   // no remote PS
  const g=G(sb);
  ok('1 no remote performance_state → pending (no_remote_performance_state), NOT the local +5%',
     g.valid===false && g.invalidReason==='no_remote_performance_state' && g.deltaPct===null && g.renderedFromRemote===false); }

console.log('\nRender ONLY from the remote object (both devices read the SAME ⇒ identical):');
{ const sb=makeEnv(); authed(sb); setPS(sb, VALID_PS);
  const g=G(sb);
  ok('2 valid remote performance_state → renders EXACTLY it (+3.3%, value 130, green), renderedFromRemote=true',
     g.valid===true && g.deltaPct===3.3 && g.deltaAbs===130 && g.displayedColor==='green' && g.renderedFromRemote===true && g.performanceSource==='remote'); }

console.log('\nRevision: older PS is ACCEPTED when no pending local changes (relaxed <=), but BLOCKED if local moved past it:');
{ const sb=makeEnv(); authed(sb); setPS(sb, Object.assign({}, VALID_PS, { portfolioRevision:6 }));  // older PS, no pending
  ok('3a older revision (6 < current 7) + NO pending changes → ACCEPTED (no longer wrongly stale)', G(sb).valid===true && G(sb).renderedFromRemote===true); }
{ const sb=makeEnv(); authed(sb); sb._aurixPendingSync=()=>true; setPS(sb, Object.assign({}, VALID_PS, { portfolioRevision:6 }));
  ok('3b older revision + PENDING local changes → BLOCKED (stale_revision_with_pending_changes)', G(sb).valid===false && G(sb).invalidReason!=='remote_performance_pending'); }
{ const sb=makeEnv(); authed(sb); setPS(sb, Object.assign({}, VALID_PS, { portfolioRevision:9 }));  // future
  ok('3c FUTURE revision (9 > current 7) → BLOCKED (revision_from_future / corrupt)', G(sb).valid===false); }

console.log('\nReject foreign / old-lifecycle performance_state ⇒ Calculando:');
{ const sb=makeEnv(); authed(sb); setPS(sb, Object.assign({}, VALID_PS, { lifecycleId:'lc-OLD' }));
  ok('4 old lifecycle → pending (reset invalidates prior performance)', G(sb).valid===false); }
{ const sb=makeEnv(); authed(sb); setPS(sb, Object.assign({}, VALID_PS, { userId:'u2' }));
  ok('5 foreign userId → pending (never read another user\'s performance)', G(sb).valid===false); }

console.log('\nAnonymous + writer-raw bypass the remote gate (single device / candidate computation):');
{ const sb=makeEnv();   // anonymous (no currentUser)
  ok('6 anonymous → local deterministic return (single device, no remote authority)', G(sb).valid===true && G(sb).deltaPct===5.0 && G(sb).renderedFromRemote===false); }
{ const sb=makeEnv(); authed(sb);   // authed but RAW (writer candidate) → bypass remote gate → local result
  ok('7 opts.raw bypasses the kill switch (writer candidate uses the local deterministic result)', G(sb,{raw:true}).valid===true && G(sb,{raw:true}).deltaPct===5.0); }

console.log('\nLocal divergence / Date.now / live price cannot affect the authed display (it reads the remote object):');
{ const sb=makeEnv(); authed(sb); setPS(sb, VALID_PS); sb._total = 999999; sb._cfg = { valid:true, deltaPct:-64.8, deltaAbs:-3000, startValue:9000, baselineTs:NOW, lastTs:NOW };
  const g=G(sb);
  ok('8 a wildly different LOCAL computation is ignored — display = remote (+3.3%), not local (−64.8%)', g.deltaPct===3.3 && g.renderedFromRemote===true); }

console.log('\nSource — reader/writer/gate/debug wired:');
ok('9 reader: _mergeRemoteState adopts remoteRow.performance_state (remote READ only)',
   /_aurixRemotePerformanceState = \(remoteRow && remoteRow\.performance_state && typeof remoteRow\.performance_state === 'object'\)/.test(fnSrc('_mergeRemoteState')));
ok('10 writer: performance_state written via its OWN decoupled UPDATE (NOT the coupled payload that gets stripped)',
   /async function _aurixFlushPerformanceState\(reason\)/.test(app) &&
   /\.from\('user_portfolios'\)\.update\(\{ performance_state: ps \}\)\.eq\('user_id', currentUser\.id\)/.test(fnSrc('_aurixFlushPerformanceState')) &&
   !/performance_state:    \(typeof _aurixComputePerformanceStateCandidate/.test(app) &&
   !/subscription_updated_at, performance_state, \.\.\.core/.test(app));
ok('11 kill switch: getValidReturnBaseline renders authed real return ONLY from _aurixRemotePerformanceForRange',
   /if \(!opts\.raw && typeof _aurixRemotePerformanceForRange === 'function'[\s\S]*?_aurixCurrentUserId\(\)\) \{/.test(fnSrc('getValidReturnBaseline')) &&
   /invalidReason: psRow \? 'remote_performance_pending' : 'no_remote_performance_state'/.test(fnSrc('getValidReturnBaseline')));
ok('12 validity (in _aurixSelectRemotePerformance): user + lifecycle match, revision lag rejected ONLY for a real holdings mutation, normalized range key',
   /if \(ps\.userId !== _aurixCurrentUserId\(\)\) \{ out\.reason = 'user_mismatch'/.test(fnSrc('_aurixSelectRemotePerformance')) &&
   /if \(ps\.lifecycleId !== out\.expectedLifecycleId\) \{ out\.reason = 'lifecycle_mismatch'/.test(fnSrc('_aurixSelectRemotePerformance')) &&
   /if \(psRev > cur\) \{ out\.reason = 'revision_from_future'/.test(fnSrc('_aurixSelectRemotePerformance')) &&
   /if \(psRev < cur && out\.pendingSync\) \{/.test(fnSrc('_aurixSelectRemotePerformance')) &&
   /if \(_lr\.hasRealUnsyncedHoldingsMutation\) \{ out\.reason = 'stale_revision_with_real_local_mutation'/.test(fnSrc('_aurixSelectRemotePerformance')) &&
   /String\(range \|\| \(typeof activeRange/.test(fnSrc('_aurixSelectRemotePerformance')));
ok('13 debug: aurixPerformanceStateDebug exposes the consumption diagnosis (renderedFromRemote + validation + selection)',
   /window\.aurixPerformanceStateDebug = async function/.test(app) &&
   ['renderedFromRemote','hasRemotePerformanceState','performanceSource','performanceHash','chartSeriesHash','blockReason',
    'validationPassed','validationFailureReason','rangeEntryExists','remotePerformanceStateRanges','consumerPathUsed','finalDisplayState']
     .every(k => app.indexOf(k + ':') !== -1));

console.log('\nDecoupling — performance_state sync is independent of the holdings merge (apply:"local" cannot drop it):');
ok('15 _flushStatePersistence invokes the decoupled perf writer; reader sets it BEFORE the distrust/merge decision',
   /_aurixFlushPerformanceState\(reason\)/.test(fnSrc('_flushStatePersistence')) &&
   (function(){ const m = fnSrc('_mergeRemoteState'); return m.indexOf('_aurixRemotePerformanceState = (remoteRow') < m.indexOf('_shouldDistrustRemote'); })());

console.log('\nNo-touch (renderer / holdings / pricing / current value):');
ok('14 renderer / holdings merge / pricing untouched',
   /function renderAurixInstitutionalChart\(/.test(app) && /function _aurixMergePortfolio\(/.test(app) &&
   /reason: 'invalid_total'/.test(fnSrc('_shouldRejectSnapshot')));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
