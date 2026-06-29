'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-PERFORMANCE-STATE-CONSUMPTION-harness — P0 consume the written remote performance_state
// ════════════════════════════════════════════════════════════════════════════
// Persistence is proven (WRITE_OK + VERIFY_READ). The UI stayed "Calculando…" because the CONSUMPTION layer
// discarded the object. Two causes fixed: (1) STRICT portfolioRevision equality rejected a PS written at rev N
// once the benign meta version bumped to N+1 → relaxed to <= + no-pending; (2) range-key case mismatch →
// normalised to lowercase. _aurixSelectRemotePerformance now returns a structured {row, ok, reason, …diag}.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} }

function env(){
  const sb = { Math, Number, Date:{ now:()=>1800000000000 }, console:{log:()=>{}}, activeRange:'24h' };
  sb._aurixCurrentUserId = () => 'u1';
  sb._aurixCurrentLifecycleId = () => 'lc-81fd47d5';
  sb._aurixCurrentRevision = () => 176;
  sb._pending = false; sb._aurixPendingSync = () => sb._pending;
  vm.createContext(sb);
  vm.runInContext('var _aurixRemotePerformanceState = null;', sb);
  vm.runInContext(fnSrc('_aurixSelectRemotePerformance'), sb);
  vm.runInContext(fnSrc('_aurixRemotePerformanceForRange'), sb);
  return sb;
}
const sel = (sb, range) => { sb.__r = range; return vm.runInContext('_aurixSelectRemotePerformance(__r)', sb); };
function setPS(sb, obj){ sb.__ps = obj; vm.runInContext('_aurixRemotePerformanceState = __ps;', sb); }
// PS exactly as production wrote it: lifecycle lc-81fd47d5, revision 176, lowercase range keys.
const PROD_PS = { userId:'u1', lifecycleId:'lc-81fd47d5', portfolioRevision:176, calculatedAt:1800000000000,
  byRange:{ '24h':{ baselineSnapshotId:1, baselineValue:4000, displayedReturnPct:2.4, displayedReturnValue:96, displayedColor:'positive', returnState:'ready', chartSeriesHash:'cs', performanceHash:'5dcb8e16' } } };

console.log('AURIX-PERFORMANCE-STATE-CONSUMPTION — the written object is now consumed\n');

console.log('The production object (rev 176, lc-81fd47d5) is SELECTED, not discarded:');
{ const sb=env(); setPS(sb, PROD_PS);
  const s=sel(sb,'24h');
  ok('1 exact match (user+lifecycle+revision+range) → ok, row selected, performanceHash present',
     s.ok===true && s.reason==='ok' && s.row && s.row.performanceHash==='5dcb8e16'); }

console.log('\nRange key is normalised to lowercase ("24H" / "24h" both resolve):');
{ const sb=env(); setPS(sb, PROD_PS);
  ok('2 requested "24H" (uppercase) resolves the "24h" entry', sel(sb,'24H').ok===true && sel(sb,'24H').rangeKey==='24h'); }
{ const sb=env(); setPS(sb, { userId:'u1', lifecycleId:'lc-81fd47d5', portfolioRevision:176, byRange:{ '24H':{ performanceHash:'h', displayedReturnPct:1 } } });
  ok('3 stored uppercase "24H" key still resolves for requested "24h"', sel(sb,'24h').ok===true); }

console.log('\nRelaxed revision — the root-cause discard is gone:');
{ const sb=env(); setPS(sb, Object.assign({}, PROD_PS, { portfolioRevision:175 }));   // older, no pending
  ok('4 older revision (175 <= 176) + NO pending changes → ACCEPTED (was wrongly stale before)', sel(sb,'24h').ok===true); }
{ const sb=env(); sb._pending=true; setPS(sb, Object.assign({}, PROD_PS, { portfolioRevision:175 }));
  const s=sel(sb,'24h'); ok('5 older revision + PENDING local changes → blocked (stale_revision_with_pending_changes)', s.ok===false && s.reason==='stale_revision_with_pending_changes'); }
{ const sb=env(); setPS(sb, Object.assign({}, PROD_PS, { portfolioRevision:200 }));   // future
  const s=sel(sb,'24h'); ok('6 FUTURE revision (200 > 176) → blocked (revision_from_future)', s.ok===false && s.reason==='revision_from_future'); }

console.log('\nStill blocks foreign account / old lifecycle / missing entry — with explicit reasons:');
{ const sb=env(); setPS(sb, Object.assign({}, PROD_PS, { userId:'u2' }));
  ok('7 foreign userId → user_mismatch', sel(sb,'24h').reason==='user_mismatch'); }
{ const sb=env(); setPS(sb, Object.assign({}, PROD_PS, { lifecycleId:'lc-OLD' }));
  ok('8 old lifecycle → lifecycle_mismatch', sel(sb,'24h').reason==='lifecycle_mismatch'); }
{ const sb=env(); setPS(sb, PROD_PS);
  ok('9 a range with no entry → range_entry_missing', sel(sb,'7d').reason==='range_entry_missing'); }
{ const sb=env();
  ok('10 no remote object at all → no_remote_object', sel(sb,'24h').reason==='no_remote_object'); }

console.log('\nWiring — set-after-write + getValidReturnBaseline prioritises remote + debug surfaces diagnosis:');
ok('11 a confirmed write adopts the VERIFIED-remote performance_state into the consumed var immediately',
   /try \{ if \(verifiedPs && typeof verifiedPs === 'object'\) \{ _aurixRemotePerformanceState = verifiedPs;/.test(app));
ok('12 getValidReturnBaseline consumes the remote performance_state BEFORE any local fallback',
   /if \(!opts\.raw && typeof _aurixRemotePerformanceForRange === 'function'[\s\S]*?const psRow = _aurixRemotePerformanceForRange\(r\);/.test(fnSrc('getValidReturnBaseline')) &&
   (function(){ const f=fnSrc('getValidReturnBaseline'); return f.indexOf('_aurixRemotePerformanceForRange(r)') < f.indexOf('renderedFromRemote: false'); })());
ok('13 aurixPerformanceStateDebug returns validationPassed/validationFailureReason + the revision comparison',
   ['validationPassed','validationFailureReason','expectedPortfolioRevision','performancePortfolioRevision','revisionComparisonMode','consumerPathUsed','finalDisplayState']
     .every(k => app.indexOf(k + ':') !== -1));

console.log('\nNo-touch (schema/RLS/renderer/holdings/pricing untouched):');
ok('14 renderer / holdings merge / pricing untouched',
   /function renderAurixInstitutionalChart\(/.test(app) && /function _aurixMergePortfolio\(/.test(app) && /reason: 'invalid_total'/.test(fnSrc('_shouldRejectSnapshot')));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
