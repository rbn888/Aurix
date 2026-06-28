'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-DATA-INTEGRITY-LOCK-harness — P0 (no save may reduce holdings without explicit action)
// ════════════════════════════════════════════════════════════════════════════
// A read/migration/sync bug can hand the app a REDUCED in-memory set; the lock turns the
// follow-up persist from PERMANENT LOSS into a blocked no-op that preserves the last valid
// portfolio. Tests the real assertNonDestructivePortfolioSave + the real saveData write-guard,
// plus the wiring of the destructive/boot/migration/backend paths.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
// extractor tolerant of destructured params: skip the params parens, then match the body braces
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c,i){ if(c){pass++;console.log('  ✓ '+n+(i?'  ['+i+']':''));}else{fail++;console.log('  ✗ '+n+(i?'  ['+i+']':''));} }

function makeEnv(block){
  const mem = {};
  const errors = [];
  const localStorage = { getItem:k=>(k in mem?mem[k]:null), setItem:(k,v)=>{mem[k]=String(v);}, removeItem:k=>{delete mem[k];} };
  const sb = { JSON, Array, Number, Object, Map, String, Boolean, Date, isFinite, localStorage,
    STORAGE_KEY:'portfolio_assets', IS_DEV:false, _persistDebug:()=>{},
    console:{ log:()=>{}, warn:()=>{}, error:(...a)=>errors.push(a.join(' ')) },
    window:{}, _mem:mem, _errors:errors };
  sb._AURIX_BLOCK_DESTRUCTIVE_SAVES = (block !== false);
  vm.createContext(sb);
  vm.runInContext('const _AURIX_DESTRUCTIVE_CONTEXTS = ' + JSON.stringify(['delete-asset','sell','reduce-position','reset','edit-transaction','migration-confirmed']) + ';', sb);
  vm.runInContext('let _aurixSaveAuditLog = []; let _aurixLastDestructiveSaveAt = 0;', sb);
  // P0-DATA-JOURNAL: saveData also consults the journal; this harness isolates the count-guard,
  // so the journal-contradiction check is a no-op stub here (the journal has its own harness).
  vm.runInContext('function _aurixJournalContradictsSave(){ return false; }', sb);
  ['inferPriceSource','inferProviderId','_aurixSalvageHolding','_aurixLegacyFallbackById','convertToNewModel','convertFromNewToFlat','convertToLegacyFormat',
   '_aurixCountModel','_aurixReadPersistedCounts','assertNonDestructivePortfolioSave','_aurixAuditSave','saveData']
    .forEach(n=>{ try{ vm.runInContext(fnSrc(n), sb); }catch(e){ console.log('load fail '+n+': '+e.message); } });
  return sb;
}
function modelN(n){ const a=[],h=[]; for(let i=0;i<n;i++){ a.push({id:'a'+i,name:'A'+i,symbol:'A'+i,type:'crypto',currentPrice:1,coinId:'c'+i}); h.push({id:'a'+i,asset_id:'a'+i,quantity:1,costBasis:1,transactions:[{type:'buy',qty:1,price:1,ts:1}]}); } return {assets:a,holdings:h}; }
function seed(sb, n){ const m=modelN(n); sb._mem['aurix_assets']=JSON.stringify(m.assets); sb._mem['aurix_holdings']=JSON.stringify(m.holdings); }
function counts(sb){ return { a: JSON.parse(sb._mem['aurix_assets']||'[]').length, h: JSON.parse(sb._mem['aurix_holdings']||'[]').length }; }

console.log('AURIX-DATA-INTEGRITY-LOCK — P0\n');

console.log('Guard verdicts (assertNonDestructivePortfolioSave):');
{ const sb = makeEnv(); const A = vm.runInContext('assertNonDestructivePortfolioSave', sb);
  ok('1 non-reducing save allowed', A({assets:5,holdings:5,transactions:8},{assets:5,holdings:5,transactions:8},'').allowed===true);
  ok('2 reduction WITHOUT explicit context BLOCKED', A({assets:5,holdings:5,transactions:8},{assets:4,holdings:4,transactions:6},'').allowed===false);
  ok('3 reduction WITH delete-asset allowed', A({assets:5,holdings:5,transactions:8},{assets:4,holdings:4,transactions:6},'delete-asset').allowed===true);
  ok('4 reset allowed to empty', A({assets:5,holdings:5,transactions:8},{assets:0,holdings:0,transactions:0},'reset').allowed===true);
  ok('5 sell/reduce-position allowed', A({assets:3,holdings:3,transactions:5},{assets:2,holdings:2,transactions:4},'sell').allowed===true && A({assets:3,holdings:3,transactions:5},{assets:2,holdings:2,transactions:4},'reduce-position').allowed===true);
  ok('6 edit-transaction allowed to drop a tx', A({assets:2,holdings:2,transactions:5},{assets:2,holdings:2,transactions:4},'edit-transaction').allowed===true);
  ok('7 first/empty prior state always allowed', A(null,{assets:3,holdings:3,transactions:3},'').allowed===true); }

console.log('\nReal saveData write-guard (last valid portfolio preserved):');
{ const sb = makeEnv(); seed(sb,5); const SD = vm.runInContext('saveData', sb);
  const r1 = SD({assets:modelN(4).assets, holdings:modelN(4).holdings});            // reduction, no context
  ok('8 destructive save (5→4, no context) BLOCKED + disk untouched', r1.blocked===true && counts(sb).a===5 && counts(sb).h===5);
  ok('9 [DATA][SAVE_BLOCKED_DESTRUCTIVE] logged', sb._errors.some(e=>/SAVE_BLOCKED_DESTRUCTIVE/.test(e)));
  const r2 = SD({assets:modelN(4).assets, holdings:modelN(4).holdings}, 'delete-asset');  // explicit
  ok('10 explicit delete-asset save (5→4) ALLOWED + written', r2.blocked===false && counts(sb).a===4);
  const r3 = SD({assets:modelN(7).assets, holdings:modelN(7).holdings});            // growth
  ok('11 non-reducing save (4→7) allowed', r3.blocked===false && counts(sb).a===7);
  const r4 = SD({assets:[], holdings:[]}, 'reset');
  ok('12 reset save to empty allowed', r4.blocked===false && counts(sb).a===0); }

console.log('\nTransaction-count protection:');
{ const sb = makeEnv(); const m=modelN(2); sb._mem['aurix_assets']=JSON.stringify(m.assets); sb._mem['aurix_holdings']=JSON.stringify(m.holdings);
  const SD = vm.runInContext('saveData', sb);
  const less = JSON.parse(JSON.stringify(m)); less.holdings[0].transactions = [];   // drop a tx
  ok('13 dropping a transaction without context is BLOCKED', SD({assets:less.assets, holdings:less.holdings}).blocked===true);
  ok('14 dropping a transaction WITH edit-transaction is allowed', SD({assets:less.assets, holdings:less.holdings}, 'edit-transaction').blocked===false); }

console.log('\nKill switch + audit log:');
{ const sb = makeEnv(false); seed(sb,5); const SD = vm.runInContext('saveData', sb);
  ok('15 kill switch OFF → reduction NOT blocked', SD({assets:modelN(3).assets, holdings:modelN(3).holdings}).blocked===false && counts(sb).a===3); }
{ const sb = makeEnv(); seed(sb,5); const SD = vm.runInContext('saveData', sb);
  SD({assets:modelN(4).assets, holdings:modelN(4).holdings});                       // blocked
  SD({assets:modelN(6).assets, holdings:modelN(6).holdings}, 'delete-asset');       // allowed destructive-tagged (growth here, but context recorded)
  const audit = vm.runInContext('_aurixSaveAuditLog', sb);
  const e0 = audit[0];
  ok('16 audit log records context/prev/next/destructiveAllowed/blocked/reason/ts',
     audit.length>=2 && 'lastSaveContext' in e0 && 'previousCounts' in e0 && 'nextCounts' in e0 && 'destructiveAllowed' in e0 && 'blocked' in e0 && 'reason' in e0 && 'ts' in e0 && e0.blocked===true); }

console.log('\nWiring (source) — destructive contexts, boot, migration, backend, in-memory restore:');
ok('17 save() restores in-memory from last-good on block + emits aurix:save-blocked',
   /const _res = saveData\(\{ assets: catalogAssets, holdings \}, context\);/.test(app) && /if \(_res && _res\.blocked\)/.test(app) && /assets = load\(\);/.test(fnSrc('save')) && /aurix:save-blocked/.test(app));
ok('18 destructive call sites tagged (delete-asset / edit-transaction / reset)',
   /save\('delete-asset'\); closeAssetManage/.test(app) && /save\('delete-asset'\);\n  closeAssetDetail/.test(app) && /save\('edit-transaction'\);/.test(app) && /save\('reset'\);/.test(app));
ok('19 boot reconciliation write tagged boot-load (reduction blocked vs local last-good)',
   /saveData\(\{ assets: portfolioData\.assets, holdings: portfolioData\.holdings \}, 'boot-load'\);/.test(app));
ok('20 migration: timestamped backup BEFORE write + post-count validation + restore-on-shrink',
   /aurix_portfolio_backup_before_migration_' \+ Date\.now\(\)/.test(app) && /migration reduced counts — restoring backup/.test(app) && /save\('migration-confirmed'\)/.test(app));
ok('21 backend push guard: skip reduction vs local last-good unless recent explicit destructive',
   /backend push skipped \(reduction vs local last-good\)/.test(app) && /Date\.now\(\) - _aurixLastDestructiveSaveAt\) < 5000/.test(fnSrc('autoSaveToBackend')));

console.log('\nRecovery policy + no silent filter(Boolean):');
ok('22 missing catalog + existing holding → salvaged (not dropped); only empty orphan dropped, logged',
   /const salvaged = _aurixSalvageHolding\(h, fallbackById\);/.test(app) && /\[DATA\]\[RECOVERED\]/.test(app) && /if \(!salvaged\) return null;/.test(app));
ok('23 transactions preserved by salvage (tx live inside holdings; nothing standalone discarded)',
   /transactions: tx,/.test(fnSrc('_aurixSalvageHolding')) || /transactions: tx\.length \? tx :/.test(fnSrc('_aurixSalvageHolding')));

console.log('\nUI never touches data + mini charts still removed:');
ok('24 category render/build/apply/series funcs never write assets/holdings/storage',
   ['_aurixCategoryPerfRender','_aurixCategoryPerfBuildPanel','_aurixCategoryPerfApplyRange','_aurixCategoryPerfUpdateHeader','_categorySeriesForRange','_categoryBucketsForType']
     .every(name => { const src = fnSrc(name); return !/\bassets\s*=/.test(src) && !/\bsave\s*\(/.test(src) && !/saveData\s*\(/.test(src) && !/localStorage\.setItem/.test(src); }));
ok('25 mini charts still removed (flag false) + institutional renderer intact',
   /const _AURIX_CATEGORY_PERF_CHART_ENABLED = false;/.test(app) && /function renderAurixInstitutionalChart\(/.test(app) && /_AURIX_PREMIUM_MOTION_ENABLED = true/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
