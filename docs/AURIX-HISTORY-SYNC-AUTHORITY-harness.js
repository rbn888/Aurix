'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-HISTORY-SYNC-AUTHORITY-harness — P0 shared snapshot store authority
// ════════════════════════════════════════════════════════════════════════════
// The wealth history is shared remote state (per-user portfolios row: category_history/portfolio_history).
// A device must NOT render a real return from a LOCAL-ONLY series before it has reconciled the canonical
// remote history — that is how web/mobile produced divergent %/charts. _aurixCanonicalHistoryReady()
// gates getValidReturnBaseline: authenticated + not-yet-reconciled (or remote unavailable) ⇒ stay
// "Calculando…" (invalidReason='awaiting_canonical_history'). The flag flips true the first time a
// remote row is reconciled (_mergeRemoteState). localStorage stays a CACHE (union-by-ts merge), never a
// substitute. No new polling — uses the existing boot + focus/visibility/pageshow reconcile path.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} }
const NOW = 1800000000000, DAY = 86400000;

function makeEnv(){
  const sb = { Math, Number, Date:{ now:()=>NOW }, console:{log:()=>{}},
    activeRange:'30d', _cfg:null, _resetAt:0, _total:4120, categoryHistory:[] };
  sb._aurixRangeReturn = () => sb._cfg;
  sb._aurixResetAt = () => sb._resetAt;
  sb.totalValueBase = () => sb._total;
  sb._aurixEligibleInvestableSeries = () => ({ series:[{ts:NOW-10*DAY,value:4000},{ts:NOW,value:4120}], meta:{anchor:4120,reasons:{}} });
  sb._aurixLoadCapitalFlows = () => [];
  sb._aurixPendingSync = () => false;
  sb._aurixPortfolioEpoch = () => 0;
  vm.createContext(sb);
  vm.runInContext('var currentUser = null; var _aurixCanonicalHistoryLoaded = false; var _aurixLocalCanonicalHash = null; var _aurixRemoteCanonicalHash = null; var _aurixCanonicalCatHistory = [];', sb);
  vm.runInContext('const _AURIX_RETURN_MIN_HISTORY_MS=90*1000; const _AURIX_RETURN_FLOW_DOMINANCE=0.5; const _AURIX_RETURN_ESTABLISHED_FRAC=0.80; const _AURIX_RETURN_STABLE_STEP=0.40; const _AURIX_RETURN_COMPARABLE_RATIO={"24h":1.5,"7d":2.0,"30d":3.0,"1y":5.0,"all":8.0}; const _AURIX_CANONICAL_TAIL_MS=120000;', sb);
  vm.runInContext(fnSrc('_aurixCanonicalHistoryReady'), sb);
  vm.runInContext(fnSrc('canDisplayCanonicalReturn'), sb);
  vm.runInContext(fnSrc('_aurixPortfolioCreatedAt'), sb);
  vm.runInContext(fnSrc('_aurixReturnSnapshotStats'), sb);
  vm.runInContext(fnSrc('_aurixPostConstructionBaseline'), sb);
  vm.runInContext(fnSrc('getValidReturnBaseline'), sb);
  // a clean, established, post-reset return that WOULD be valid once history is loaded
  sb._cfg = { valid:true, deltaPct:3.0, deltaAbs:120, startValue:4000, baselineTs:NOW-10*DAY, lastTs:NOW, netFlowsNeutralized:10 };
  return sb;
}
const G = (sb) => vm.runInContext('getValidReturnBaseline("30d")', sb);
const ready = (sb) => vm.runInContext('_aurixCanonicalHistoryReady()', sb);

console.log('AURIX-HISTORY-SYNC-AUTHORITY — shared snapshot store\n');

console.log('Readiness — authenticated devices need HASH-EQUAL local/remote canonical history:');
{ const sb=makeEnv(); vm.runInContext('currentUser={id:"u1"};', sb);
  ok('1 authenticated + remote NOT yet reconciled → not ready', ready(sb)===false); }
{ const sb=makeEnv(); vm.runInContext('currentUser={id:"u1"}; _aurixCanonicalHistoryLoaded=true; _aurixLocalCanonicalHash="abc12345"; _aurixRemoteCanonicalHash="abc12345";', sb);
  ok('2 authenticated + local hash === remote hash → ready', ready(sb)===true); }
{ const sb=makeEnv();   // anonymous: no remote authority ⇒ local IS canonical (single device)
  ok('3 anonymous (no currentUser) → ready (local canonical, no cross-device divergence)', ready(sb)===true); }
{ // THE v425 INSUFFICIENCY: reconciled "once" but bodies DIFFER ⇒ must NOT be ready (this is the fix)
  const sb=makeEnv(); vm.runInContext('currentUser={id:"u1"}; _aurixCanonicalHistoryLoaded=true; _aurixLocalCanonicalHash="LOCAL_ahead"; _aurixRemoteCanonicalHash="remote_old";', sb);
  ok('3b authed + loaded but local hash !== remote hash → NOT ready (divergent body blocked)', ready(sb)===false); }

console.log('\nThe gate — return stays "Calculando…" until canonical history hashes match:');
{ const sb=makeEnv(); vm.runInContext('currentUser={id:"u1"};', sb);
  const g=G(sb);
  ok('4 authed, history NOT reconciled → awaiting_canonical_history (pending, no real return)',
     g.valid===false && g.invalidReason==='awaiting_canonical_history' && g.returnState==='pending_baseline');
  ok('5 pending hides %/$ (deltaPct null) — never a divergent local-only return', g.deltaPct===null); }
{ const sb=makeEnv(); vm.runInContext('currentUser={id:"u1"}; _aurixCanonicalHistoryLoaded=true; _aurixLocalCanonicalHash="x"; _aurixRemoteCanonicalHash="y";', sb);
  const g=G(sb);
  ok('5c authed + hash MISMATCH → still awaiting_canonical_history (no return until converged)',
     g.valid===false && g.invalidReason==='awaiting_canonical_history'); }
{ const sb=makeEnv(); vm.runInContext('currentUser={id:"u1"}; _aurixCanonicalHistoryLoaded=true; _aurixLocalCanonicalHash="h"; _aurixRemoteCanonicalHash="h"; _aurixCanonicalCatHistory=[{ts:1,total:100},{ts:2,total:110}];', sb);
  const g=G(sb);
  ok('6 confirmed remote (loaded + store present + applied===remote, no pending) → real return shows (+3%)', g.valid===true && g.returnState==='ready' && g.deltaPct===3.0); }
{ const sb=makeEnv();   // anonymous proceeds straight to the normal canonical evaluation
  const g=G(sb);
  ok('7 anonymous → not gated by authority (valid from local canonical)', g.valid===true && g.deltaPct===3.0); }

console.log('\nRemote unavailable (offline / load failure) keeps it pending (test 8):');
ok('8 _mergeRemoteState sets loaded=true ONLY for a non-null remote row (null ⇒ stay pending)',
   /if \(remoteRow && typeof remoteRow === 'object'\) _aurixCanonicalHistoryLoaded = true;/.test(app));

console.log('\nLifecycle / user isolation — new user must re-download before showing return:');
ok('9 foreign-cache purge (user switch) resets _aurixCanonicalHistoryLoaded',
   /_aurixCanonicalHistoryLoaded = false;[^\n]*new user must re-download/.test(app));

console.log('\nlocalStorage is a CACHE of shared history, never a substitute:');
ok('10 history reconciled via union-by-ts merge of remote into local (cache), not replaced blindly',
   /categoryHistory  = _mergeCategoryByTs\(categoryHistory, remoteCat\)/.test(app) &&
   /portfolioHistory = _mergeHistoryByTs\(portfolioHistory, remoteHist\)/.test(app));

console.log('\nNo new polling — reconcile rides the EXISTING focus/visibility/pageshow + boot path:');
ok('11 focus/visibilitychange/pageshow reconcile remote via _aurixFg (which calls _aurixResyncFromRemote; no new setInterval)',
   /const _aurixFg = \(reason\) => \{[\s\S]*?_aurixResyncFromRemote\(reason\);/.test(app) &&
   /document\.addEventListener\('visibilitychange', \(\) => \{ if \(document\.visibilityState === 'visible'\) _aurixFg\('visible'\); \}\);/.test(app) &&
   /window\.addEventListener\('focus',   \(\) => _aurixFg\('focus'\)\);/.test(app) &&
   /_aurixFg\('pageshow'\)/.test(app));
ok('12 resync collapses focus+visibility bursts (≤1 per 1.5s) — no extra Supabase load',
   /now - _aurixLastResyncAt < 1500/.test(app));

console.log('\nNo-touch (holdings sync / integrity lock / journal / renderer):');
ok('13 holdings merge decision (_aurixMergePortfolio) + integrity lock + renderer untouched',
   /function _aurixMergePortfolio\(/.test(app) && /const _AURIX_BLOCK_DESTRUCTIVE_SAVES = true;/.test(app) &&
   /function renderAurixInstitutionalChart\(/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
