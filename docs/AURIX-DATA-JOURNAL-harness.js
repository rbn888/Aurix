'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-DATA-JOURNAL-harness — P0 append-only portfolio event log
// ════════════════════════════════════════════════════════════════════════════
// Every explicit action appends an IMMUTABLE event (with a full post-action snapshot) to
// aurix_portfolio_events. Events are never modified; recovery rebuilds the portfolio from the
// latest non-reset snapshot; a save that contradicts the journal is blocked.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c,i){ if(c){pass++;console.log('  ✓ '+n+(i?'  ['+i+']':''));}else{fail++;console.log('  ✗ '+n+(i?'  ['+i+']':''));} }

function makeEnv(){
  const mem = {}; const errs = [];
  const localStorage = { getItem:k=>(k in mem?mem[k]:null), setItem:(k,v)=>{mem[k]=String(v);}, removeItem:k=>{delete mem[k];} };
  const sb = { JSON, Array, Number, Object, Map, String, Boolean, Date, isFinite, localStorage,
    STORAGE_KEY:'portfolio_assets', IS_DEV:false, _persistDebug:()=>{},
    console:{ log:()=>{}, warn:()=>{}, error:(...a)=>errs.push(a.join(' ')) },
    window:{ AURIX_BUILD:'vTEST' }, currentUser:{ id:'u1' }, _mem:mem, _errs:errs,
    _nativeToUSD:()=>0, _aurixCaptureFlow:()=>{} };
  sb._AURIX_BLOCK_DESTRUCTIVE_SAVES = true;
  vm.createContext(sb);
  vm.runInContext("const _AURIX_JOURNAL_KEY='aurix_portfolio_events'; let _aurixJournalSeq=0;", sb);
  vm.runInContext('const _AURIX_DESTRUCTIVE_CONTEXTS = ' + JSON.stringify(['delete-asset','sell','reduce-position','reset','edit-transaction','migration-confirmed']) + ';', sb);
  vm.runInContext('let _aurixSaveAuditLog = []; let _aurixLastDestructiveSaveAt = 0;', sb);
  ['inferPriceSource','inferProviderId','_aurixSalvageHolding','_aurixLegacyFallbackById','convertToNewModel','convertFromNewToFlat','convertToLegacyFormat',
   '_aurixCountModel','_aurixReadPersistedCounts','assertNonDestructivePortfolioSave','_aurixAuditSave',
   '_aurixSnapshotHash','_aurixJournalRead','_aurixJournalLatestSnapshot','_aurixJournalLatestAssetCount','_aurixJournalAppend','_aurixJournalTypeFromContext',
   'rebuildPortfolioFromEvents','_aurixRecoverFromJournalIfEmpty','_aurixJournalContradictsSave','saveData','_ledgerTrade']
    .forEach(n=>{ try{ vm.runInContext(fnSrc(n), sb); }catch(e){ console.log('load fail '+n+': '+e.message); } });
  return sb;
}
const J = (sb,n) => vm.runInContext(n, sb);
function modelN(n, base){ const a=[],h=[]; for(let i=0;i<n;i++){ const id=(base||'a')+i; a.push({id, name:id, symbol:id, type:'crypto', currentPrice:1, coinId:'c'+i}); h.push({id, asset_id:id, quantity:1, costBasis:1, transactions:[{type:'buy',qty:1,price:1,ts:1}]}); } return {assets:a,holdings:h}; }

console.log('AURIX-DATA-JOURNAL — P0\n');

console.log('Append-only event log + required fields:');
{ const sb = makeEnv(); const add = J(sb,'_aurixJournalAppend');
  const e1 = add('add_asset','btc-1',{x:1},{assets:[{id:'btc-1'}],holdings:[]});
  ['eventId','timestamp','userId','type','assetId','payload','previousSnapshotHash','appVersion'].forEach(f =>
    ok('1.'+f+' present', e1 && f in e1));
  ok('2 userId + appVersion captured', e1.userId==='u1' && e1.appVersion==='vTEST');
  const e2 = add('buy','btc-1',{side:'buy'},{assets:[{id:'btc-1'}],holdings:[]});
  ok('3 previousSnapshotHash links to prior snapshot', typeof e2.previousSnapshotHash==='string' && e2.previousSnapshotHash.length>0);
  const log = J(sb,'_aurixJournalRead')();
  ok('4 append-only: log grows, event[0] unchanged', log.length===2 && log[0].eventId===e1.eventId && log[0].type==='add_asset'); }

console.log('\nEvent types per explicit action (context mapping):');
{ const sb = makeEnv(); const tf = J(sb,'_aurixJournalTypeFromContext');
  ok('5 add/buy/sell/delete/edit/reset/migration map correctly',
     tf('add-asset')==='add_asset' && tf('buy')==='buy' && tf('sell')==='sell' && tf('delete-asset')==='delete_asset' &&
     tf('edit-transaction')==='edit_transaction' && tf('reset')==='reset_portfolio' && tf('migration-confirmed')==='migration' &&
     tf(undefined,true)==='add_asset' && tf(undefined,false)==='update'); }

console.log('\nbuy/sell recorded at the ledger chokepoint (direction-accurate):');
{ const sb = makeEnv(); const lt = J(sb,'_ledgerTrade');
  lt({id:'btc-1',ticker:'BTC',assetCurrency:'USD'}, 'buy', 0.5, 50000, 1700000000000, null);
  lt({id:'btc-1',ticker:'BTC',assetCurrency:'USD'}, 'sell', 0.2, 60000, 1700000100000, 2000);
  const log = J(sb,'_aurixJournalRead')();
  ok('6 _ledgerTrade appends a buy event', log.some(e=>e.type==='buy' && e.assetId==='btc-1' && e.payload && e.payload.price===50000));
  ok('7 _ledgerTrade appends a sell event', log.some(e=>e.type==='sell' && e.assetId==='btc-1' && e.payload && e.payload.realized===2000)); }

console.log('\nRebuild + recovery from journal:');
{ const sb = makeEnv(); const add = J(sb,'_aurixJournalAppend'); const m = modelN(3);
  add('add_asset',null,{},m);
  const rebuilt = J(sb,'rebuildPortfolioFromEvents')();
  ok('8 portfolio rebuilt from latest snapshot', rebuilt.length===3 && rebuilt.every(a=>a.qty===1));
  // holding lost: localStorage empty but journal has the snapshot → recovery
  const recovered = J(sb,'_aurixRecoverFromJournalIfEmpty')([]);
  ok('9 lost holding recovered from journal (empty load → rebuilt)', recovered.length===3);
  ok('10 non-empty load is NOT overridden', J(sb,'_aurixRecoverFromJournalIfEmpty')([{id:'x',qty:9}]).length===1);
  add('reset_portfolio',null,{},{assets:[],holdings:[]});
  ok('11 after reset event, rebuild = empty (no resurrection)', J(sb,'rebuildPortfolioFromEvents')().length===0 && J(sb,'_aurixRecoverFromJournalIfEmpty')([]).length===0); }

console.log('\nJournal-contradiction guard (save blocked if it contradicts the journal):');
{ const sb = makeEnv(); const add = J(sb,'_aurixJournalAppend'); const m = modelN(2);   // a0, a1 recorded
  add('update',null,{},m);
  const SD = J(sb,'saveData');
  // seed last-good persisted = same 2 so the COUNT guard alone wouldn't fire on an id-swap
  sb._mem['aurix_assets']=JSON.stringify(m.assets); sb._mem['aurix_holdings']=JSON.stringify(m.holdings);
  const swap = modelN(2,'z');   // same count, different ids (a0/a1 vanish)
  const r1 = SD({assets:swap.assets, holdings:swap.holdings});            // no context
  ok('12 save dropping a journal-proven asset (same count) is BLOCKED', r1.blocked===true && sb._errs.some(e=>/contradicts event journal/.test(e)));
  const r2 = SD({assets:swap.assets, holdings:swap.holdings}, 'delete-asset');   // explicit
  ok('13 explicit destructive context bypasses the journal guard', r2.blocked===false);
  const keep = modelN(3);   // superset (a0,a1,a2) — no journal asset vanishes
  sb._mem['aurix_assets']=JSON.stringify(m.assets); sb._mem['aurix_holdings']=JSON.stringify(m.holdings);
  const r3 = SD({assets:keep.assets, holdings:keep.holdings});
  ok('14 non-contradicting growth save allowed', r3.blocked===false); }

console.log('\nWiring (source) — store, hooks, recovery, no UI:');
ok('15 append-only store key + window.rebuildPortfolioFromEvents exposed',
   /const _AURIX_JOURNAL_KEY = 'aurix_portfolio_events';/.test(app) && /window\.rebuildPortfolioFromEvents = rebuildPortfolioFromEvents;/.test(app));
ok('16 save() appends a snapshot event; _ledgerTrade appends buy/sell',
   /_aurixJournalAppend\(_type, null, \{ context: context \|\| null/.test(app) && /_aurixJournalAppend\(type === 'sell' \? 'sell' : 'buy'/.test(app));
ok('17 load() recovers from journal when empty',
   /_aurixRecoverFromJournalIfEmpty\(convertFromNewToFlat\(data\.assets/.test(app) && /_aurixRecoverFromJournalIfEmpty\(data\.legacy\)/.test(app));
ok('18 journal NOT in PORTFOLIO_KEYS (survives reset as immutable trail) + reset recorded as event',
   !/'aurix_portfolio_events'/.test(fnSrc('performSafeReset') in {} ? '' : app.slice(app.indexOf('const PORTFOLIO_KEYS'), app.indexOf('const PORTFOLIO_KEYS')+1200)) && /save\('reset'\);/.test(app));
ok('19 never mutates existing events (append push only, no index assignment)',
   /events\.push\(ev\);   \/\/ append-only/.test(app) && !/events\[\d+\]\s*=/.test(fnSrc('_aurixJournalAppend')));
ok('20 data-layer only: institutional renderer + mini-chart removal intact',
   /function renderAurixInstitutionalChart\(/.test(app) && /const _AURIX_CATEGORY_PERF_CHART_ENABLED = false;/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
