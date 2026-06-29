'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-HISTORY-AUTHORITY-HARD-LOCK-harness — P0 single remote history authority
// ════════════════════════════════════════════════════════════════════════════
// WHY union-by-ts + quarantine wasn't enough: the chart + return read the LOCAL categoryHistory (the
// union). union-by-ts is local-FIRST, so a device's local-only / quarantined points fed its baseline/return
// BEFORE remote confirmed them → web and mobile diverged. FIX: _aurixInvestableSnapshots (the single source
// the chart AND return read, via getCanonicalPortfolioSeries→_aurixEligibleInvestableSeries and
// _aurixRangeReturn) now reads _aurixHistorySourceForDisplay() — the REMOTE-authoritative canonical store
// for an authenticated user; local categoryHistory is only a cache + push buffer. Local history never has
// final authority. Anonymous/offline-anon = local (single device, no divergence).
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} }

function env(){
  const sb = { Math, Number, Date, console:{log:()=>{},warn:()=>{}} };
  sb.toBase = (v) => v;
  sb._aurixPortfolioEpoch = () => 0;
  vm.createContext(sb);
  vm.runInContext('var currentUser = null; var _aurixCanonicalCatHistory = null; var categoryHistory = [];', sb);
  vm.runInContext(fnSrc('_aurixHistorySourceForDisplay'), sb);
  vm.runInContext(fnSrc('_aurixInvestableSnapshots'), sb);
  return sb;
}
const snaps = (sb) => vm.runInContext("_aurixInvestableSnapshots('all').map(p=>p.ts)", sb);
const REMOTE = [{ts:100,total:4000,real_estate:0},{ts:200,total:4100,real_estate:0}];
const LOCAL_EXTRA = REMOTE.concat([{ts:300,total:9999,real_estate:0}]);  // a local-only point not yet in remote

console.log('AURIX-HISTORY-AUTHORITY-HARD-LOCK — remote is the single display authority\n');

console.log('Authenticated user — display reads the REMOTE canonical store, NOT the local union:');
{ const sb = env();
  vm.runInContext('currentUser={id:"u1"};', sb);
  sb.__r = REMOTE; sb.__l = LOCAL_EXTRA; vm.runInContext('_aurixCanonicalCatHistory = __r; categoryHistory = __l;', sb);
  const ts = snaps(sb);
  ok('1 chart/return source = remote canonical (local-only point 300 EXCLUDED)', JSON.stringify(ts) === JSON.stringify([100,200]));
  ok('2 the local-only point (300) never reaches the displayed series', ts.indexOf(300) === -1); }

console.log('\nAuthenticated user, remote canonical NOT yet present → falls back to local for the curve, but…');
{ const sb = env();
  vm.runInContext('currentUser={id:"u1"}; _aurixCanonicalCatHistory = null;', sb);
  sb.__l = LOCAL_EXTRA; vm.runInContext('categoryHistory = __l;', sb);
  const ts = snaps(sb);
  ok('3 with no canonical store, source falls back to local cache (curve never blank)', ts.length === 3);
  // …the readiness gate keeps return in "Calculando…" until the canonical store is loaded (verified below).
}

console.log('\nAnonymous user — local IS canonical (single device, no cross-device divergence):');
{ const sb = env();
  sb.__l = LOCAL_EXTRA; vm.runInContext('_aurixCanonicalCatHistory = __r2 = ' + JSON.stringify(REMOTE) + '; categoryHistory = __l;', sb);
  // currentUser stays null ⇒ anonymous
  const ts = snaps(sb);
  ok('4 anonymous reads local cache (not the remote store)', JSON.stringify(ts) === JSON.stringify([100,200,300])); }

console.log('\nSource wiring — the single chokepoint feeds BOTH chart and return:');
ok('5 _aurixInvestableSnapshots reads _aurixHistorySourceForDisplay() (not categoryHistory directly)',
   /const _src = \(typeof _aurixHistorySourceForDisplay === 'function'\) \? _aurixHistorySourceForDisplay\(\) : categoryHistory;/.test(fnSrc('_aurixInvestableSnapshots')) &&
   /for \(const p of _src\)/.test(fnSrc('_aurixInvestableSnapshots')));
ok('6 the chart (getCanonicalPortfolioSeries) and the return (_aurixRangeReturn) both flow through the eligible series',
   /_aurixEligibleInvestableSeries\(/.test(fnSrc('getCanonicalPortfolioSeries')) && /_aurixInvestableSnapshots\(range\)/.test(fnSrc('_aurixEligibleInvestableSeries')));
ok('7 display source = remote canonical for authed, local for anon (never local-final for authed)',
   /const authed = \(typeof currentUser !== 'undefined' && currentUser && currentUser\.id\);\s*if \(authed && Array\.isArray\(_aurixCanonicalCatHistory\)\) return _aurixCanonicalCatHistory;/.test(fnSrc('_aurixHistorySourceForDisplay')));

console.log('\nMerge sets the store FROM remote; confirmed flush promotes local→canonical (own pushed points):');
ok('8 _mergeRemoteState sets _aurixCanonicalCatHistory from the remote row (authority)',
   /_aurixCanonicalCatHistory = _mergeCategoryByTs\(\[\], remoteCat\);/.test(fnSrc('_mergeRemoteState')));
ok('9 a confirmed flush promotes local categoryHistory to the canonical store (remote now == local)',
   /_aurixCanonicalCatHistory = _mergeCategoryByTs\(\[\], categoryHistory\);[\s\S]*?_aurixRemoteCanonicalHash = _aurixCanonicalBodyHash\(_aurixCanonicalCatHistory\);/.test(fnSrc('_flushStatePersistence')));

console.log('\nStrict gate + diagnosis (item 5/9):');
ok('10 getValidReturnBaseline gates on canonical readiness (awaiting_canonical_history → "Calculando…")',
   /if \(typeof _aurixCanonicalHistoryReady === 'function' && !_aurixCanonicalHistoryReady\(\)\) invalidReason = 'awaiting_canonical_history';/.test(app));
ok('11 readiness requires loaded + store present + appliedHash === remoteHash (hard lock)',
   /_aurixCanonicalHistoryLoaded === true\s*&& Array\.isArray\(_aurixCanonicalCatHistory\)\s*&& _aurixLocalCanonicalHash != null\s*&& _aurixLocalCanonicalHash === _aurixRemoteCanonicalHash/.test(fnSrc('_aurixCanonicalHistoryReady')));
ok('12 aurixHistoryDebug exposes the item-9 authority fields',
   ['build','remoteHistoryLoaded','remoteHistoryHash','appliedHistoryHash','localCacheHash','pendingLocalOnlyCount','quarantinedCount','baselineSource','chartSource','returnSource']
     .every(k => app.indexOf(k + ':') !== -1));
ok('13 sources labelled remote (authed+ready) / pending (authed+not) / local (anon)',
   /const _srcLabel = !_authedU \? 'local' : \(_ready \? 'remote' : 'pending'\);/.test(app));

console.log('\nNo-touch + corruption still blocked:');
ok('14 renderer / holdings merge / pricing untouched; corruption guard intact',
   /function renderAurixInstitutionalChart\(/.test(app) && /function _aurixMergePortfolio\(/.test(app) &&
   /reason: 'invalid_total'/.test(fnSrc('_shouldRejectSnapshot')) && /reason: 'fx_partial'/.test(fnSrc('_shouldRejectSnapshot')));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
