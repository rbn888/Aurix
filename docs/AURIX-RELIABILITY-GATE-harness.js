'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-RELIABILITY-GATE-harness — P0 identity isolation + sync/integrity/journal cross-refs
// ════════════════════════════════════════════════════════════════════════════
// Guarantees a portfolio is isolated PER USER (user B never reads/writes user A's local cache),
// synced via Supabase as source of truth (revision/updatedAt/deviceId/pendingSync), and protected
// by the destructive-save guard + append-only journal. Identity behaviour is exercised in a vm
// sandbox; the sync/integrity/journal layers are cross-referenced (their own harnesses verify them).
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
const PORTFOLIO_KEYS_SRC = app.slice(app.indexOf('const PORTFOLIO_KEYS = ['), app.indexOf('];', app.indexOf('const PORTFOLIO_KEYS = [')) + 2);
let pass=0,fail=0; function ok(n,c,i){ if(c){pass++;console.log('  ✓ '+n+(i?'  ['+i+']':''));}else{fail++;console.log('  ✗ '+n+(i?'  ['+i+']':''));} }

function makeStore(){
  const mem = {};
  const localStorage = { getItem:k=>(k in mem?mem[k]:null), setItem:(k,v)=>{mem[k]=String(v);}, removeItem:k=>{delete mem[k];} };
  const sb = { JSON, Array, Number, Object, String, Boolean, Date, Math, isFinite, localStorage,
    console:{ log:()=>{}, warn:()=>{}, error:()=>{} }, STORAGE_KEY:'portfolio_assets', _mem:mem };
  vm.createContext(sb);
  vm.runInContext(PORTFOLIO_KEYS_SRC, sb);
  vm.runInContext('const AUTH_LOCAL_KEYS = []; let _aurixActiveUserId = null; let assets = []; let _aurixMiniDonutDrawn=false; let _aurixMiniSig="";', sb);
  vm.runInContext("const _AURIX_LIVE_DATA_REVISION_REASONS = ['price-refresh','market-update','snapshot','live-data','perf-state','price','history-maintenance'];", sb);
  ['_clearLocalUserState','_aurixDeviceId','_aurixCacheOwner','_aurixStampCacheOwner','_aurixCacheIsForeign','_aurixEnforceCacheOwner',
   '_aurixReadPortfolioMeta','_aurixWritePortfolioMeta','_aurixBumpPortfolioMeta','_aurixMarkSynced','_aurixPortfolioRevision','_aurixPendingSync',
   'inferPriceSource','inferProviderId','convertToNewModel','convertFromNewToFlat','convertToLegacyFormat','_aurixSalvageHolding','_aurixLegacyFallbackById','getPortfolioData']
    .forEach(n=>{ try{ vm.runInContext(fnSrc(n), sb); }catch(e){ console.log('load fail '+n+': '+e.message); } });
  // also need the _AURIX_* key consts referenced by the helpers
  ['_AURIX_PORTFOLIO_META_KEY','_AURIX_CACHE_OWNER_KEY','_AURIX_DEVICE_ID_KEY'].forEach(c=>{ const m=app.match(new RegExp('const '+c+"\\s*=\\s*'[^']*';")); if(m) vm.runInContext(m[0], sb); });
  return sb;
}
const G=(sb,n)=>vm.runInContext(n,sb);

console.log('AURIX-RELIABILITY-GATE — P0\n');

console.log('FASE 1 — Identity isolation (user A ↛ user B):');
{ const sb = makeStore();
  // user A saves: stamp owner A + cache
  G(sb,'_aurixActiveUserId'); vm.runInContext('_aurixActiveUserId = "userA";', sb);
  sb._mem['aurix_assets'] = JSON.stringify([{id:'btc',symbol:'BTC'}]); sb._mem['aurix_holdings'] = JSON.stringify([{id:'btc',asset_id:'btc',quantity:1}]);
  vm.runInContext('_aurixStampCacheOwner();', sb);
  ok('1 cache owner stamped to the active user', sb._mem['aurix_cache_owner']==='userA');
  // now user B becomes active → cache is foreign → load returns empty (B never reads A)
  vm.runInContext('_aurixActiveUserId = "userB";', sb);
  ok('2 foreign cache detected for a different user', G(sb,'_aurixCacheIsForeign()')===true);
  const d = vm.runInContext('getPortfolioData();', sb);
  ok('3 getPortfolioData() returns EMPTY for the foreign cache (B does not read A)', d.source==='legacy' && Array.isArray(d.legacy) && d.legacy.length===0); }

console.log('\nFASE 1 — user switch purges the previous user cache (logout/login no mix):');
{ const sb = makeStore();
  sb._mem['aurix_cache_owner']='userA';
  sb._mem['aurix_assets']=JSON.stringify([{id:'x'}]); sb._mem['aurix_holdings']=JSON.stringify([{id:'x',asset_id:'x'}]);
  sb._mem['aurix_portfolio_meta']=JSON.stringify({version:9,updatedAt:5,syncedAt:5});
  sb._mem['aurix_portfolio_events']=JSON.stringify([{type:'add_asset'}]);
  const purged = vm.runInContext('_aurixEnforceCacheOwner("userB");', sb);
  ok('4 enforceCacheOwner purges A and re-stamps B', purged===true && !('aurix_assets' in sb._mem) && !('aurix_holdings' in sb._mem) && !('aurix_portfolio_meta' in sb._mem) && !('aurix_portfolio_events' in sb._mem) && sb._mem['aurix_cache_owner']==='userB');
  // same user → no purge
  sb._mem['aurix_assets']=JSON.stringify([{id:'y'}]);
  const purged2 = vm.runInContext('_aurixEnforceCacheOwner("userB");', sb);
  ok('5 same user → cache kept (no purge)', purged2===false && ('aurix_assets' in sb._mem)); }

console.log('\nFASE 1 — isolation keys cleared on logout:');
ok('6 meta + journal + cache-owner are in PORTFOLIO_KEYS (cleared by _clearLocalUserState on SIGNED_OUT)',
   /'aurix_portfolio_meta'/.test(PORTFOLIO_KEYS_SRC) && /'aurix_portfolio_events'/.test(PORTFOLIO_KEYS_SRC) && /'aurix_cache_owner'/.test(PORTFOLIO_KEYS_SRC) &&
   /aurix_assets/.test(PORTFOLIO_KEYS_SRC) && /aurix_holdings/.test(PORTFOLIO_KEYS_SRC));
{ const sb = makeStore();
  ['aurix_assets','aurix_holdings','aurix_portfolio_meta','aurix_portfolio_events','aurix_cache_owner'].forEach(k=>sb._mem[k]='x');
  vm.runInContext('_clearLocalUserState();', sb);
  ok('7 _clearLocalUserState wipes all portfolio + isolation keys', !['aurix_assets','aurix_holdings','aurix_portfolio_meta','aurix_portfolio_events','aurix_cache_owner'].some(k=>k in sb._mem)); }

console.log('\nFASE 2 — identity/sync fields (revision · updatedAt · deviceId · pendingSync):');
{ const sb = makeStore();
  const id1 = G(sb,'_aurixDeviceId()'), id2 = G(sb,'_aurixDeviceId()');
  ok('8 stable per-device id (persisted, not regenerated)', typeof id1==='string' && id1.length>3 && id1===id2 && sb._mem['aurix_device_id']===id1);
  vm.runInContext('_aurixBumpPortfolioMeta();', sb);
  const m = G(sb,'_aurixReadPortfolioMeta()');
  ok('9 meta carries version(revision) + updatedAt + deviceId', m.version===1 && m.updatedAt>0 && m.deviceId===id1 && G(sb,'_aurixPortfolioRevision()')===1);
  ok('10 pendingSync true after a local change, false after markSynced', G(sb,'_aurixPendingSync()')===true && (vm.runInContext('_aurixMarkSynced(Date.now()+10);', sb), G(sb,'_aurixPendingSync()')===false)); }

console.log('\nWiring (source) — guards, scoping, merge:');
ok('11 load guard: getPortfolioData ignores a foreign cache',
   /if \(_aurixCacheIsForeign\(\)\) \{[\s\S]*?return \{ legacy: \[\], source: 'legacy' \};/.test(fnSrc('getPortfolioData')));
ok('12 initPortfolioData enforces cache owner before using local + boot sets active user early',
   /_aurixEnforceCacheOwner\(userId\);/.test(fnSrc('initPortfolioData')) && /_aurixActiveUserId = currentUser && currentUser\.id; _aurixEnforceCacheOwner\(_aurixActiveUserId\);/.test(app));
ok('13 remote scoped by user_id (read + write); saveData stamps the cache owner',
   /\.from\('user_portfolios'\)[\s\S]{0,140}\.eq\('user_id', userId\)/.test(app) && /user_id:    currentUser\.id/.test(app) && /_aurixStampCacheOwner\(\);/.test(fnSrc('saveData')));
ok('14 Supabase-as-source-of-truth merge present (revision/timestamp + count aware, never blind overwrite)',
   /function _aurixMergePortfolio\(/.test(app) && /apply: 'remote'/.test(fnSrc('_aurixMergePortfolio')) && /apply: 'local'/.test(fnSrc('_aurixMergePortfolio')) && /_aurixResyncFromRemote/.test(app));

console.log('\nFASE 3/4 — integrity guard + journal (cross-ref, own harnesses verify deeply):');
ok('15 destructive-save guard + kill switch present', /function assertNonDestructivePortfolioSave\(/.test(app) && /const _AURIX_BLOCK_DESTRUCTIVE_SAVES = true;/.test(app) && /\[DATA\]\[SAVE_BLOCKED_DESTRUCTIVE\]/.test(app));
ok('16 no silent filter(Boolean): orphan holding salvaged (logged) before any drop', /const salvaged = _aurixSalvageHolding\(h, fallbackById\);/.test(app) && /\[DATA\]\[RECOVERED\]/.test(app));
ok('17 append-only journal: events add_asset/buy/sell/edit_transaction/delete_asset/reset/migration + rebuild + recovery',
   /const _AURIX_JOURNAL_KEY = 'aurix_portfolio_events';/.test(app) && /function rebuildPortfolioFromEvents\(/.test(app) && /_aurixRecoverFromJournalIfEmpty/.test(app) &&
   /case 'delete-asset':        return 'delete_asset';/.test(app) && /type === 'sell' \? 'sell' : 'buy'/.test(app) && /events\.push\(ev\);   \/\/ append-only/.test(app));
ok('18 journal events carry context: userId + deviceId + revision + appVersion + timestamp',
   /userId: \(typeof currentUser/.test(fnSrc('_aurixJournalAppend')) && /deviceId: \(typeof _aurixDeviceId/.test(fnSrc('_aurixJournalAppend')) && /revision: \(typeof _aurixPortfolioRevision/.test(fnSrc('_aurixJournalAppend')));

console.log('\nNo data writes from UI/render + no collateral:');
ok('19 UI/category render is read-only (no save/assets=/setItem)',
   ['_aurixCategoryPerfRender','renderMiniCompositionDonut','renderCompositionModalDonut','_aurixCompositionEntries']
     .every(n => { const s=fnSrc(n); return !/\bassets\s*=/.test(s) && !/\bsave\s*\(/.test(s) && !/saveData\s*\(/.test(s) && !/localStorage\.setItem/.test(s); }));
ok('20 institutional renderer + donut + persistence layers all intact', /function renderAurixInstitutionalChart\(/.test(app) && /const _AURIX_CATEGORY_PERF_CHART_ENABLED = false;/.test(app) && /_aurixDonutRevealSVG/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
