'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-HISTORY-PARITY-EMERGENCY-GATE-harness — P0 stop showing divergent returns
// ════════════════════════════════════════════════════════════════════════════
// WHY v429 still showed divergence: a CONFIRMED flush promoted the LOCAL union into the display store and
// appliedHash===remoteHash was a per-device tautology → web showed its union (−65%), mobile its own (+4.9%).
// FIX: one strict helper canDisplayCanonicalReturn(range) every return/colour/line consumer must pass. For an
// authenticated user it demands the displayed history be the CONFIRMED remote canonical with NO divergent
// local-only state. Block ⇒ "Calculando…" + neutral. Anonymous = single device ⇒ allowed.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} }
const NOW = 1800000000000;

function env(){
  const sb = { Math, Number, Date: { now: () => NOW }, console:{log:()=>{},warn:()=>{}}, activeRange:'24h' };
  sb._aurixRangeReturn = () => sb._cfg;
  sb._aurixPendingSync = () => sb._pending;
  sb._aurixPortfolioEpoch = () => 0;
  vm.createContext(sb);
  vm.runInContext('var currentUser=null; var _aurixCanonicalHistoryLoaded=false; var _aurixLocalCanonicalHash=null; var _aurixRemoteCanonicalHash=null; var _aurixCanonicalCatHistory=null; var categoryHistory=[]; const _AURIX_CANONICAL_TAIL_MS=120000;', sb);
  vm.runInContext(fnSrc('canDisplayCanonicalReturn'), sb);
  sb._cfg = { valid:true, deltaPct:3.0, baselineTs:NOW-86400000, lastTs:NOW };
  sb._pending = false;
  return sb;
}
const can = (sb) => vm.runInContext('canDisplayCanonicalReturn("24h")', sb);
// a healthy authenticated "confirmed" baseline
function confirmed(sb){ vm.runInContext('currentUser={id:"u1"}; _aurixCanonicalHistoryLoaded=true; _aurixCanonicalCatHistory=[{ts:1,total:100},{ts:2,total:110}]; _aurixLocalCanonicalHash="h"; _aurixRemoteCanonicalHash="h"; categoryHistory=[{ts:1,total:100},{ts:2,total:110}];', sb); }

console.log('AURIX-HISTORY-PARITY-EMERGENCY-GATE — never show divergent returns\n');

console.log('Block conditions → "Calculando…" (ok=false):');
{ const sb=env(); vm.runInContext('currentUser={id:"u1"};', sb);  // authed, nothing loaded ⇒ source local/pending
  const c=can(sb); ok('1 source not remote (not loaded) → BLOCKED', c.ok===false && c.returnSource!=='remote'); }
{ const sb=env(); confirmed(sb); vm.runInContext('_aurixRemoteCanonicalHash="DIFFERENT";', sb);
  const c=can(sb); ok('2 appliedHistoryHash !== remoteHistoryHash → BLOCKED', c.ok===false && c.reason==='applied_neq_remote'); }
{ const sb=env(); confirmed(sb); vm.runInContext('categoryHistory=[{ts:1,total:100},{ts:2,total:110},{ts:'+(NOW-300000)+',total:9999}];', sb);
  const c=can(sb); ok('3 pendingLocalOnlyCount > 0 → BLOCKED', c.ok===false && c.reason==='pending_local_only' && c.pendingLocalOnlyCount>0); }
{ const sb=env(); confirmed(sb); vm.runInContext('_aurixCanonicalHistoryLoaded=false;', sb);
  const c=can(sb); ok('4 baselineSource !== remote (not loaded) → BLOCKED', c.ok===false && c.baselineSource!=='remote'); }
{ const sb=env(); confirmed(sb); vm.runInContext('_aurixCanonicalCatHistory=null;', sb);
  const c=can(sb); ok('5 chartSource !== remote (no store) → BLOCKED', c.ok===false && c.chartSource!=='remote'); }
{ const sb=env(); confirmed(sb); sb._pending=true;
  const c=can(sb); ok('6 returnSource remote but local AHEAD (historyMismatch) → BLOCKED', c.ok===false && c.reason==='history_mismatch_local_ahead'); }

console.log('\nPass condition → real return allowed (ok=true):');
{ const sb=env(); confirmed(sb);
  const c=can(sb); ok('7 remote confirmed + hashes equal + no pending + no mismatch → ALLOWED',
     c.ok===true && c.reason==='remote_confirmed' && c.baselineSource==='remote' && c.chartSource==='remote' && c.returnSource==='remote'); }
{ const sb=env();  // anonymous: single device, local canonical
  const c=can(sb); ok('8 anonymous → allowed (no cross-device divergence possible)', c.ok===true && c.reason==='anonymous_local_canonical'); }

console.log('\nNever web-red / mobile-green: at most ONE device shows; a diverging device blocks:');
{ // web has a local-only point remote lacks (it diverges) → web BLOCKS; mobile (clean, == remote) → shows
  const web=env(); confirmed(web); vm.runInContext('categoryHistory=[{ts:1,total:100},{ts:2,total:110},{ts:'+(NOW-300000)+',total:1}];', web);
  const mob=env(); confirmed(mob);
  ok('9 the diverging device (local-only point) is pending while the clean device shows → no red-vs-green',
     can(web).ok===false && can(mob).ok===true); }

console.log('\nSingle authority — every consumer passes through the helper (source):');
ok('10 getValidReturnBaseline gates first on canDisplayCanonicalReturn',
   /const _disp = \(typeof canDisplayCanonicalReturn === 'function'\) \? canDisplayCanonicalReturn\(r\)[\s\S]*?if \(!_disp\.ok\) invalidReason = 'awaiting_canonical_history';/.test(app));
ok('11 mobile lite line colour derives from the gated getValidReturnBaseline (not raw _aurixRangeReturn)',
   /const _gret = \(typeof getValidReturnBaseline === 'function'\) \? getValidReturnBaseline\(r\) : null;\s*const _rpct = \(_gret && _gret\.valid/.test(fnSrc('renderAurixMobileLiteChart')));
ok('12 desktop badge / recon headline / mobile indicator / perf hero all gate on getValidReturnBaseline',
   /getValidReturnBaseline\(activeRange\)/.test(fnSrc('_aurixReconSyncHeadline')) &&
   /getValidReturnBaseline\(activeRange\)/.test(fnSrc('_aurixMobileSetPerfIndicator')) &&
   /getValidReturnBaseline\(activeRange\)/.test(fnSrc('_dshPaintPerfSnapshot')));
ok('13 toggle %/€ cannot flip the gate (canDisplayCanonicalReturn ignores activePerfMode)',
   !/activePerfMode/.test(fnSrc('canDisplayCanonicalReturn')));

console.log('\nDiagnosis (aurixHistoryDebug) + no-touch:');
ok('14 debug exposes canDisplayCanonicalReturn + blockReason + sources',
   /canDisplayCanonicalReturn: _disp\.ok,/.test(app) && /blockReason: _disp\.ok \? null : _disp\.reason,/.test(app));
ok('15 renderer / holdings / pricing untouched; corruption guard intact',
   /function renderAurixInstitutionalChart\(/.test(app) && /function _aurixMergePortfolio\(/.test(app) &&
   /reason: 'invalid_total'/.test(fnSrc('_shouldRejectSnapshot')));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
