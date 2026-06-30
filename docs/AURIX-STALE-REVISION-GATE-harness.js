'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-STALE-REVISION-GATE-harness — P0 a live-data/snapshot revision bump must NOT block a ready PS
// ════════════════════════════════════════════════════════════════════════════
// ROOT CAUSE (v445): a price refresh calls save() → _aurixBumpPortfolioMeta bumps the revision and sets
// pendingSync=true, even though only prices changed. The stale gate at _aurixSelectRemotePerformance:804 then
// rejected an otherwise-ready remote performance_state (stale_revision_with_pending_changes) → 24H oscillated
// ready↔Calculando. FIX: record WHY the revision moved (lastRevisionReason / lastRealMutationAt). The gate now
// rejects ONLY a REAL unsynced holdings/capital mutation; a live-data/snapshot/price-refresh lag is ACCEPTED.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} }

// Sandbox running the REAL _aurixSelectRemotePerformance + _aurixLocalRevisionInfo over a fake localStorage meta.
const LIVE = "['price-refresh','market-update','snapshot','live-data','perf-state','price','history-maintenance']";
function env(){
  const store = {};
  const sb = { Math, Number, JSON, Date:{ now:()=>1000000 },
    localStorage:{ getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} } };
  vm.createContext(sb);
  vm.runInContext("const _AURIX_PORTFOLIO_META_KEY='aurix_portfolio_meta'; const _AURIX_LIVE_DATA_REVISION_REASONS="+LIVE+";", sb);
  vm.runInContext("function _aurixDeviceId(){return 'd';}", sb);
  vm.runInContext("var activeRange='24h';", sb);
  vm.runInContext("var _ps=null; function _aurixCurrentUserId(){return 'u1';} function _aurixCurrentLifecycleId(){return 'L1';} function _aurixCurrentRevision(){return _curRev;} var _curRev=10;", sb);
  vm.runInContext("Object.defineProperty(globalThis,'_aurixRemotePerformanceState',{get:()=>_ps,set:v=>{_ps=v;},configurable:true});", sb);
  vm.runInContext(fnSrc('_aurixReadPortfolioMeta'), sb);
  vm.runInContext(fnSrc('_aurixWritePortfolioMeta'), sb);
  vm.runInContext(fnSrc('_aurixBumpPortfolioMeta'), sb);
  vm.runInContext(fnSrc('_aurixMarkSynced'), sb);
  vm.runInContext(fnSrc('_aurixPendingSync'), sb);
  vm.runInContext(fnSrc('_aurixLocalRevisionInfo'), sb);
  vm.runInContext(fnSrc('_aurixSelectRemotePerformance'), sb);
  // a READY remote performance_state at revision 9 (one behind current 10), valid 24h row
  vm.runInContext("_ps={ userId:'u1', lifecycleId:'L1', portfolioRevision:9, byRange:{ '24h':{ displayedReturnPct:0.37, displayedReturnValue:50, baselineValue:8000, baselineSnapshotId:111, performanceHash:'h', returnState:'ready' } } };", sb);
  return sb;
}
const sel = (sb,r) => vm.runInContext("_aurixSelectRemotePerformance('"+(r||'24h')+"')", sb);
// helper to drive a save-context bump then mark a remote sync at ts, so syncedAt baseline is set
function syncBaseline(sb){ vm.runInContext("_aurixMarkSynced(500000);", sb); }   // syncedAt=500000 < Date.now 1000000

console.log('AURIX-STALE-REVISION-GATE — live-data revision lag must not block a ready performance_state\n');

console.log('Acceptance — ready remote PS + local revision lag that is NOT a real holdings mutation:');
{ // 1) snapshot-only revision bump
  const sb=env(); syncBaseline(sb); vm.runInContext("_aurixBumpPortfolioMeta('snapshot');", sb);
  const s=sel(sb,'24h');
  ok('1 ready PS + snapshot-only bump + pendingSync → STILL READY (accepted_despite_snapshot_only_revision)',
     s.ok===true && s.row && s.acceptedDespiteRevisionLag===true && s.hasRealUnsyncedHoldingsMutation===false && s.reason==='accepted_despite_snapshot_only_revision'); }
{ // 2) live-data revision bump
  const sb=env(); syncBaseline(sb); vm.runInContext("_aurixBumpPortfolioMeta('market-update');", sb);
  const s=sel(sb,'24h');
  ok('2 ready PS + live-data bump → STILL READY (accepted_despite_live_data_revision)',
     s.ok===true && s.acceptedDespiteRevisionLag===true && s.reason==='accepted_despite_live_data_revision'); }
{ // 3) performance_state write revision bump (perf-state)
  const sb=env(); syncBaseline(sb); vm.runInContext("_aurixBumpPortfolioMeta('perf-state');", sb);
  const s=sel(sb,'24h');
  ok('3 ready PS + perf-state write bump → STILL READY (accepted)', s.ok===true && s.acceptedDespiteRevisionLag===true); }
{ // 7) price-refresh specifically (the production culprit) — pendingSync true, ready stays ready
  const sb=env(); syncBaseline(sb); vm.runInContext("_aurixBumpPortfolioMeta('price-refresh');", sb);
  const s=sel(sb,'24h');
  ok('7 refresh (price-refresh bump) CANNOT flip ready 24H to Calculando (row returned, valid)',
     s.ok===true && !!s.row && vm.runInContext("_aurixPendingSync()", sb)===true); }

console.log('\nRejection — only a REAL unsynced holdings/capital mutation blocks a stale PS:');
{ // 4) real holdings mutation
  const sb=env(); syncBaseline(sb); vm.runInContext("_aurixBumpPortfolioMeta('delete-asset');", sb);
  const s=sel(sb,'24h');
  ok('4 ready PS + REAL holdings mutation (delete-asset) → BLOCKED (stale_revision_with_real_local_mutation)',
     s.ok===false && s.reason==='stale_revision_with_real_local_mutation' && s.hasRealUnsyncedHoldingsMutation===true); }
{ // bare mutation also blocks
  const sb=env(); syncBaseline(sb); vm.runInContext("_aurixBumpPortfolioMeta('mutation');", sb);
  ok('4b ready PS + generic mutation → BLOCKED', sel(sb,'24h').ok===false && sel(sb,'24h').reason==='stale_revision_with_real_local_mutation'); }
{ // 5) wrong lifecycle
  const sb=env(); syncBaseline(sb); vm.runInContext("_ps.lifecycleId='OTHER';", sb);
  ok('5 wrong lifecycle → BLOCKED (lifecycle_mismatch)', sel(sb,'24h').ok===false && sel(sb,'24h').reason==='lifecycle_mismatch'); }
{ // 6) wrong user
  const sb=env(); syncBaseline(sb); vm.runInContext("_ps.userId='OTHER';", sb);
  ok('6 wrong user → BLOCKED (user_mismatch)', sel(sb,'24h').ok===false && sel(sb,'24h').reason==='user_mismatch'); }

console.log('\nReal mutation, once synced, no longer blocks (lastRealMutationAt ≤ syncedAt):');
{ const sb=env(); vm.runInContext("_aurixBumpPortfolioMeta('delete-asset');", sb);   // real mutation at t=1,000,000
  vm.runInContext("_aurixMarkSynced(2000000); _curRev=9;", sb);                       // synced AFTER it, PS now current
  ok('8 after sync, no unsynced real mutation → accepted (revision equal, no lag)', sel(sb,'24h').ok===true); }

console.log('\nSource — the gate + reasons + classification:');
ok('9 gate rejects ONLY a real mutation; live-data lag is accepted',
   /if \(_lr\.hasRealUnsyncedHoldingsMutation\) \{ out\.reason = 'stale_revision_with_real_local_mutation'; return out; \}/.test(fnSrc('_aurixSelectRemotePerformance')) &&
   /out\.acceptedDespiteRevisionLag = true;/.test(fnSrc('_aurixSelectRemotePerformance')));
ok('10 _aurixBumpPortfolioMeta records reason + stamps lastRealMutationAt only for a real mutation',
   /m\.lastRevisionReason = r;/.test(fnSrc('_aurixBumpPortfolioMeta')) &&
   /if \(_AURIX_LIVE_DATA_REVISION_REASONS\.indexOf\(r\) < 0\) m\.lastRealMutationAt = m\.updatedAt;/.test(fnSrc('_aurixBumpPortfolioMeta')));
ok('11 the price-refresh persist is labelled live-data', /save\('price-refresh'\);/.test(app));
ok('12 debug surfaces the new fields (aurixRangePipelineDebug + gvrb)',
   /hasRealUnsyncedHoldingsMutation: sel \? sel\.hasRealUnsyncedHoldingsMutation/.test(app) &&
   /acceptedDespiteRevisionLag: sel \? sel\.acceptedDespiteRevisionLag/.test(app) &&
   /rec\.hasRealUnsyncedHoldingsMutation = _sel\.hasRealUnsyncedHoldingsMutation/.test(app));
ok('13 no-touch: schema/RLS/persistence/baseline/renderer/pricing values unchanged',
   /function renderAurixInstitutionalChart\(/.test(app) && /function _aurixRangeReturn\(range\)/.test(app) &&
   /deltaPct: psRow\.displayedReturnPct/.test(fnSrc('getValidReturnBaseline')));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
