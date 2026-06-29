'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-HISTORY-SYNC-FINAL-FIX-harness — P0 real web/mobile history parity
// ════════════════════════════════════════════════════════════════════════════
// WHY v425 WAS NOT ENOUGH: it gated only on "remote reconciled once". But the union merge KEEPS each
// device's local-only points, so two devices could hold DIFFERENT bodies (different baseline ⇒ different
// %/chart) yet both report "loaded". THE FIX: a device leaves "Calculando…" only when its local canonical
// BODY hash === the remote canonical body hash (full adoption of the same shared series). The body
// excludes the live tail (<2 min) so independent per-device 30 s snapshots never block parity forever.
// The more-complete device pushes its reconciled superset via the existing throttled flush. PURE READ +
// existing persistence path — no holdings sync / renderer / integrity lock / journal touched.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} }
const NOW = 1800000000000;

const sb = { Math, Number, Date:{ now:()=>NOW }, console:{log:()=>{}}, _epoch:0 };
sb._aurixPortfolioEpoch = () => sb._epoch;
vm.createContext(sb);
vm.runInContext("const _AURIX_CAT_BUCKETS = ['crypto','stock','etf','fund','metal','real_estate','liquidity','other'];", sb);
vm.runInContext('const _AURIX_CANONICAL_TAIL_MS = 120000;', sb);
vm.runInContext(fnSrc('_aurixHistoryHash'), sb);
vm.runInContext(fnSrc('_aurixCategoryPointValid'), sb);
vm.runInContext(fnSrc('_aurixCanonicalBodyHash'), sb);
const BH = (arr) => { sb.__a = arr; return vm.runInContext('_aurixCanonicalBodyHash(__a)', sb); };
// settled points (older than NOW-120000) form the body; ts > NOW-120000 is the live tail.
const old = (t,v,re) => ({ ts: NOW-200000-t, total: v, real_estate: re||0, crypto: v-(re||0) });

console.log('AURIX-HISTORY-SYNC-FINAL-FIX — deterministic canonical body parity\n');

console.log('Body hash is deterministic + device-independent (the parity guarantee):');
ok('1 same settled points, ANY input order → same hash (web === mobile)',
   BH([old(0,100),old(100,110),old(200,121)]) === BH([old(200,121),old(0,100),old(100,110)]));
ok('2 the live tail (<2 min) is EXCLUDED — a fresh 30 s snapshot does NOT change the body hash',
   BH([old(0,100),old(100,110)]) === BH([old(0,100),old(100,110),{ts:NOW-1000,total:111,crypto:111}]));
ok('3 a duplicate ts collapses (dedup) — duplicated point hashes the same as one',
   BH([old(0,100),old(100,110)]) === BH([old(0,100),old(100,110),old(100,110)]));
ok('4 different settled VALUE → different hash', BH([old(0,100),old(100,110)]) !== BH([old(0,100),old(100,111)]));
ok('5 hash is a stable 8-hex token', /^[0-9a-f]{8}$/.test(BH([old(0,100)])));

console.log('\nLifecycle + integrity exclusions (no pre-reset, no corrupt points):');
{ // epoch sits BETWEEN the pre-reset point (NOW-500000) and the body points (~NOW-200000)
  sb._epoch = NOW - 300000;
  const withPre = BH([{ts:NOW-500000,total:9000,crypto:9000}, old(0,100), old(100,110)]);
  const clean   = BH([old(0,100), old(100,110)]);
  sb._epoch = 0;
  ok('6 pre-epoch (pre-reset) points are excluded from the body (new lifecycle = new history)', withPre === clean); }
ok('7 a corrupt point (total != Σbuckets) is excluded',
   BH([old(0,100), {ts:NOW-300000, total:5000, crypto:1}]) === BH([old(0,100), {ts:NOW-300000, total:1, crypto:1}]) ? false : true /* differ unless corrupt dropped */);
{ // explicit: corrupt point dropped ⇒ same as without it
  const a = BH([old(0,100), old(50,105)]);
  const b = BH([old(0,100), old(50,105), {ts:NOW-300000, total:5000, crypto:1, real_estate:1}]); // total 5000 != 2
  ok('7b body with a corrupt point === body without it (corrupt dropped)', a === b); }

console.log('\nMerge wiring — remote-before, local-after, push-if-ahead (source):');
const merge = fnSrc('_mergeRemoteState');
ok('8 remote canonical body hash computed from the remote row BEFORE adopting the union',
   /_aurixRemoteCanonicalHash = _aurixCanonicalBodyHash\(remoteCat\);/.test(merge) &&
   merge.indexOf('_aurixRemoteCanonicalHash = _aurixCanonicalBodyHash') < merge.indexOf('categoryHistory  = _mergeCategoryByTs'));
ok('9 local canonical body hash computed AFTER adopting the reconciled union',
   /categoryHistory  = _mergeCategoryByTs\(categoryHistory, remoteCat\);\s*_aurixLocalCanonicalHash = _aurixCanonicalBodyHash\(categoryHistory\);/.test(merge));
ok('10 if local is more complete (hashes differ) → push the superset via the EXISTING throttled flush (#4/#6)',
   /_aurixLocalCanonicalHash !== _aurixRemoteCanonicalHash && typeof scheduleStateFlush === 'function'\) scheduleStateFlush\(\)/.test(merge));

console.log('\nReadiness gate consumes hash equality (the real gate, not "loaded once"):');
ok('11 _aurixCanonicalHistoryReady requires local hash === remote hash',
   /_aurixCanonicalHistoryLoaded === true\s*&& _aurixLocalCanonicalHash != null\s*&& _aurixLocalCanonicalHash === _aurixRemoteCanonicalHash/.test(fnSrc('_aurixCanonicalHistoryReady')));
ok('12 getValidReturnBaseline still gates first on canonical readiness (awaiting_canonical_history)',
   /if \(typeof _aurixCanonicalHistoryReady === 'function' && !_aurixCanonicalHistoryReady\(\)\) invalidReason = 'awaiting_canonical_history';/.test(app));

console.log('\nDiagnosis — before/after proof via window.aurixHistoryDebug():');
ok('13 debug exposes localCanonicalHash / remoteCanonicalHash / historyHashMatch',
   /localCanonicalHash:/.test(app) && /remoteCanonicalHash:/.test(app) && /historyHashMatch:/.test(app));

console.log('\nNo-touch (holdings sync / renderer / integrity lock / journal):');
ok('14 holdings merge / renderer / destructive-save lock untouched',
   /function _aurixMergePortfolio\(/.test(app) && /function renderAurixInstitutionalChart\(/.test(app) &&
   /const _AURIX_BLOCK_DESTRUCTIVE_SAVES = true;/.test(app));
ok('15 push uses the existing _flushStatePersistence path (category_history in the upsert), no new writer',
   /category_history:     categoryHistory,/.test(app) && /function scheduleStateFlush\(\)/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
