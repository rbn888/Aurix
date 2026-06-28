'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-SYNC-INTEGRITY-harness — P0 cross-device portfolio sync
// ════════════════════════════════════════════════════════════════════════════
// Supabase = shared source of truth; localStorage = cache. Merge is version/timestamp + count
// aware and NEVER loses assets (remote>local→remote · local>remote→keep local · equal→newer).
// Mobile/web re-sync on foreground/focus/pageshow/online (the fix for "added on web, missing on
// mobile"). Tests the merge + meta logic and asserts the wiring.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c,i){ if(c){pass++;console.log('  ✓ '+n+(i?'  ['+i+']':''));}else{fail++;console.log('  ✗ '+n+(i?'  ['+i+']':''));} }

function makeEnv(tombstone){
  const mem={};
  const localStorage={ getItem:k=>(k in mem?mem[k]:null), setItem:(k,v)=>{mem[k]=String(v);}, removeItem:k=>{delete mem[k];} };
  const sb={ JSON, Array, Number, Object, String, Boolean, Date, isFinite, localStorage,
    console:{log:()=>{},warn:()=>{}}, _mem:mem, _aurixResetAt:()=> (tombstone||0) };
  vm.createContext(sb);
  vm.runInContext("const _AURIX_PORTFOLIO_META_KEY='aurix_portfolio_meta';", sb);
  // P0-RELIABILITY-GATE: _aurixWritePortfolioMeta now stamps a deviceId; stub it here (this harness
  // focuses on the merge/timestamp logic).
  vm.runInContext("function _aurixDeviceId(){ return 'd-test'; }", sb);
  ['_aurixReadPortfolioMeta','_aurixWritePortfolioMeta','_aurixBumpPortfolioMeta','_aurixMarkSynced','_aurixRemoteUpdatedMs','_shouldDistrustRemote','_aurixMergePortfolio']
    .forEach(n=>{ try{ vm.runInContext(fnSrc(n), sb); }catch(e){ console.log('load fail '+n+': '+e.message); } });
  return sb;
}
const G=(sb,n)=>vm.runInContext(n,sb);
const isoOld='2026-06-01T00:00:00.000Z', isoNew='2026-06-30T00:00:00.000Z';
function model(n){ const a=[]; for(let i=0;i<n;i++)a.push({id:'a'+i,symbol:'A'+i}); return {assets:a, holdings:a.map(x=>({id:x.id,asset_id:x.id}))}; }

console.log('AURIX-SYNC-INTEGRITY — P0\n');

console.log('Local meta (version / updatedAt / syncedAt):');
{ const sb=makeEnv();
  const m1=G(sb,'_aurixBumpPortfolioMeta')();
  ok('1 bump increments version + sets updatedAt', m1.version===1 && m1.updatedAt>0);
  G(sb,'_aurixBumpPortfolioMeta')();
  ok('2 second bump → version 2', G(sb,'_aurixReadPortfolioMeta')().version===2);
  G(sb,'_aurixMarkSynced')(1234567890);
  ok('3 markSynced sets syncedAt', G(sb,'_aurixReadPortfolioMeta')().syncedAt===1234567890); }

console.log('\nMerge rule (NEVER loses assets):');
{ const sb=makeEnv();
  const M=G(sb,'_aurixMergePortfolio');
  ok('4 remote MORE than local → apply remote', M(model(5), Object.assign(model(6),{updated_at:isoNew})).apply==='remote');
  ok('5 local MORE than remote → KEEP local (not yet uploaded, no loss)', M(model(6), Object.assign(model(5),{updated_at:isoNew})).apply==='local');
  // equal count, remote newer than local meta.updatedAt
  G(sb,'_aurixWritePortfolioMeta')({version:1, updatedAt:new Date(isoOld).getTime(), syncedAt:new Date(isoOld).getTime()});
  ok('6 equal count + remote NEWER → apply remote', M(model(5), Object.assign(model(5),{updated_at:isoNew})).apply==='remote');
  // equal count, local newer
  G(sb,'_aurixWritePortfolioMeta')({version:9, updatedAt:new Date(isoNew).getTime(), syncedAt:new Date(isoOld).getTime()});
  ok('7 equal count + local NEWER → keep local', M(model(5), Object.assign(model(5),{updated_at:isoOld})).apply==='local');
  ok('8 remote empty → keep local', M(model(3), Object.assign(model(0),{updated_at:isoNew})).apply==='local'); }

console.log('\nReset tombstone newer than remote → distrust remote (keep local):');
{ const sb=makeEnv(new Date('2027-01-01T00:00:00Z').getTime());   // tombstone in the future vs remote
  ok('9 distrust remote when reset tombstone newer', G(sb,'_aurixMergePortfolio')(model(2), Object.assign(model(9),{updated_at:isoNew})).apply==='local'); }

console.log('\nMulti-category: an asset added on web (remote +1) is applied on the other device:');
{ const sb=makeEnv(); const M=G(sb,'_aurixMergePortfolio');
  [['BTC','crypto'],['AAPL','stock'],['VWCE','etf'],['Piso','real_estate'],['Efectivo','cash']].forEach(([sym,type])=>{
    const local={ assets:[{id:'x',symbol:'X',type:'cash'}], holdings:[{id:'x',asset_id:'x'}] };
    const remote={ assets:[{id:'x',symbol:'X',type:'cash'},{id:sym,symbol:sym,type}], holdings:[{id:'x',asset_id:'x'},{id:sym,asset_id:sym}], updated_at:isoNew };
    ok(sym+' ('+type+') added on web → remote wins on mobile', M(local, remote).apply==='remote');
  }); }

console.log('\nWiring (source):');
ok('10 foreground re-sync hooks (visibilitychange/focus/pageshow/online → resync)',
   /document\.addEventListener\('visibilitychange', \(\) => \{ if \(document\.visibilityState === 'visible'\) _aurixResyncFromRemote\('visible'\); \}\);/.test(app) &&
   /window\.addEventListener\('focus',   \(\) => _aurixResyncFromRemote\('focus'\)\);/.test(app) &&
   /window\.addEventListener\('pageshow', \(\) => _aurixResyncFromRemote\('pageshow'\)\);/.test(app) &&
   /window\.addEventListener\('online',   \(\) => _aurixResyncFromRemote\('online'\)\);/.test(app));
ok('11 boot merge routed through the safe merge (not naive length-based)',
   /const decision = _aurixMergePortfolio\(localModel, backendData\);/.test(fnSrc('initPortfolioData')) &&
   !/backendData\.assets\.length > 0 && !distrustRemote/.test(fnSrc('initPortfolioData')));
ok('12 resync applies remote via saveData(remote-sync) + refreshes existing views',
   /assets = flat;/.test(fnSrc('_aurixResyncFromRemote')) && /saveData\(convertToNewModel\(assets\), 'remote-sync'\);/.test(fnSrc('_aurixResyncFromRemote')) &&
   /scheduleAurixMobileLite\(/.test(fnSrc('_aurixResyncFromRemote')) && /render\(true\)/.test(fnSrc('_aurixResyncFromRemote')));
ok('13 throttled + non-concurrent + auth/boot guarded',
   /_aurixResyncInFlight/.test(fnSrc('_aurixResyncFromRemote')) && /now - _aurixLastResyncAt < 1500/.test(fnSrc('_aurixResyncFromRemote')) && /!_bootLoadComplete/.test(fnSrc('_aurixResyncFromRemote')));
ok('14 save() bumps local meta on user change (NOT on remote-sync / boot-load)',
   /context !== 'remote-sync' && context !== 'boot-load'\) \{ try \{ _aurixBumpPortfolioMeta\(\)/.test(app));
ok('15 autosave: SAVE_OK + markSynced ONLY after a successful upsert (error throws first)',
   /if \(error\) throw error;   \/\/ never mark synced\/OK if the remote write failed/.test(app) &&
   /_aurixMarkSynced\(new Date\(_syncedAt\)\.getTime\(\)\);/.test(app) && /\[SYNC\]\[SAVE_OK\]/.test(app) && /\[SYNC\]\[SAVE_START\]/.test(app));
ok('16 remote-sync / boot-load bypass the journal-contradiction check (count-reduction still guarded)',
   /if \(context === 'remote-sync' \|\| context === 'boot-load'\) return false;/.test(fnSrc('_aurixJournalContradictsSave')));
ok('17 integrity lock respected: merge never applies a remote that REDUCES local',
   /if \(lc > rc\) \{[\s\S]*?return \{ apply: 'local'/.test(fnSrc('_aurixMergePortfolio')) &&
   makeEnv && G(makeEnv(),'_aurixMergePortfolio')(model(6), Object.assign(model(5),{updated_at:isoNew})).apply==='local');

console.log('\nData-layer only (no UI/renderer change):');
ok('18 institutional renderer + mini-chart removal intact',
   /function renderAurixInstitutionalChart\(/.test(app) && /const _AURIX_CATEGORY_PERF_CHART_ENABLED = false;/.test(app));
ok('19 localStorage treated as cache: shared key user_portfolios by user_id (both devices)',
   /\.from\('user_portfolios'\)[\s\S]{0,120}\.eq\('user_id', userId\)/.test(app) && /user_id:    currentUser\.id/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
