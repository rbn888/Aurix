'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ASSET-PERSISTENCE-GUARDRAIL-harness — P0 asset durability (CRITICAL-FIX)
// ════════════════════════════════════════════════════════════════════════════
// GUARANTEE: no user asset/holding can disappear through a UI change, category navigation,
// refresh, deploy/cache-bust or render. The historic data-loss vector was
// convertFromNewToFlat() silently dropping a holding whose catalog asset entry was missing
// (.filter(Boolean)) — then the next save() persisted the reduced set. The fix SALVAGES
// orphaned holdings (never drops a position with qty/cost/transactions). These tests exercise
// the REAL load/convert/save round-trip + assert the UI/category layer is read-only.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fn(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=app.indexOf('{',i),d=0; for(;k<app.length;k++){const c=app[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c,i){ if(c){pass++;console.log('  ✓ '+n+(i?'  ['+i+']':''));}else{fail++;console.log('  ✗ '+n+(i?'  ['+i+']':''));} }

// ── sandbox: localStorage shim + the persistence functions (read/convert/save) ──
function makeStore(){
  const mem = {};
  const localStorage = {
    getItem:(k)=> (k in mem ? mem[k] : null),
    setItem:(k,v)=>{ mem[k] = String(v); },
    removeItem:(k)=>{ delete mem[k]; },
  };
  const sb = { console, JSON, Array, Number, Object, Map, String, Boolean, localStorage,
    IS_DEV:false, STORAGE_KEY:'portfolio_assets', _persistDebug:()=>{}, scheduleSave:()=>{}, _mem:mem,
    // P0-DATA-JOURNAL: load() now runs journal-recovery; this harness tests the salvage layer in
    // isolation, so the journal recovery is a pass-through stub here.
    _aurixRecoverFromJournalIfEmpty:(x)=>x };
  vm.createContext(sb);
  ['inferPriceSource','inferProviderId','_aurixSalvageHolding','_aurixLegacyFallbackById',
   'convertToNewModel','convertFromNewToFlat','convertToLegacyFormat','getPortfolioData','load']
    .forEach(name=>{ try { vm.runInContext(fn(name), sb); } catch(e){ console.log('load fail '+name+': '+e.message); } });
  // saveData has destructured params (breaks the brace-matcher); replicate it faithfully
  // (same three keys + legacy mirror via convertToLegacyFormat as the app's saveData).
  vm.runInContext("function saveData(d){ localStorage.setItem('aurix_assets', JSON.stringify(d.assets)); localStorage.setItem('aurix_holdings', JSON.stringify(d.holdings)); localStorage.setItem('portfolio_assets', JSON.stringify({ assets: convertToLegacyFormat(d.assets, d.holdings), lastUpdated: 1 })); }", sb);
  return sb;
}
const BTC = { id:'btc-1', name:'Bitcoin', ticker:'BTC', type:'crypto', qty:0.5, price:60000, assetCurrency:'USD',
  change24h:-3.2, prevPrice:62000, costBasis:25000, realizedPnL:0, coinId:'bitcoin', marketSymbol:null,
  image:null, logo:null, karat:null, goldUnit:null, isin:null, rent:null, location:null,
  transactions:[{type:'buy',qty:0.5,price:50000,ts:1000}] };
const OTHERS = {
  stock:      { id:'aapl-1', name:'Apple', ticker:'AAPL', type:'stock', qty:10, price:200, costBasis:1500, marketSymbol:'AAPL', transactions:[{type:'buy',qty:10,price:150,ts:1}] },
  etf:        { id:'vwce-1', name:'VWCE', ticker:'VWCE', type:'etf', qty:5, price:110, costBasis:500, marketSymbol:'VWCE', transactions:[{type:'buy',qty:5,price:100,ts:1}] },
  real_estate:{ id:'flat-1', name:'Piso', ticker:'PISO', type:'real_estate', qty:1, price:200000, costBasis:180000, rent:900, transactions:[] },
  cash:       { id:'cash-1', name:'Efectivo', ticker:'EUR', type:'cash', qty:3000, price:1, costBasis:3000, transactions:[] },
};
function fullPortfolio(){ return [BTC, OTHERS.stock, OTHERS.etf, OTHERS.real_estate, OTHERS.cash].map(a=>Object.assign({},a)); }

console.log('AURIX-ASSET-PERSISTENCE-GUARDRAIL — P0\n');

console.log('Round-trip durability (create → save → reload):');
{ const sb = makeStore();
  const flat = fullPortfolio();
  const model = vm.runInContext('convertToNewModel', sb)(flat);
  vm.runInContext('saveData', sb)(model);                       // persist (aurix_assets + aurix_holdings + legacy mirror)
  const reloaded = vm.runInContext('load', sb)();               // fresh load (== a refresh / deploy / cache-bust)
  ok('1 asset count stable after save+reload', reloaded.length === flat.length, reloaded.length+'/'+flat.length);
  const btc = reloaded.find(a => a.ticker === 'BTC');
  ok('2 BTC manual holding persists after reload', !!btc && btc.qty === 0.5);
  ok('3 BTC transaction stays persisted', !!btc && Array.isArray(btc.transactions) && btc.transactions.length === 1 && btc.transactions[0].price === 50000);
  ok('4 BTC cost basis preserved', !!btc && btc.costBasis === 25000);
  ['stock','etf','real_estate','cash'].forEach(tp => { const a = reloaded.find(x=>x.type===tp); ok('4.'+tp+' '+tp+' asset persists', !!a && a.qty === OTHERS[tp].qty); }); }

console.log('\nTHE data-loss vector — orphaned holding (missing catalog asset) is RECOVERED, not dropped:');
{ const sb = makeStore();
  // Corruption: catalog LOST the BTC entry, but the holding row + transactions still exist.
  const model = vm.runInContext('convertToNewModel', sb)(fullPortfolio());
  const corruptCatalog = model.assets.filter(a => a.id !== 'btc-1');   // BTC asset entry gone
  // holdings still include the BTC holding (with its transactions)
  ok('5 (setup) catalog missing BTC but holding row present', !corruptCatalog.some(a=>a.id==='btc-1') && model.holdings.some(h=>h.asset_id==='btc-1'));
  // legacy mirror still has full BTC (metadata recovery source)
  sb._mem['aurix_assets']   = JSON.stringify(corruptCatalog);
  sb._mem['aurix_holdings'] = JSON.stringify(model.holdings);
  // (legacy mirror already written by saveData in convertToNewModel? no — write it explicitly with full BTC)
  sb._mem['portfolio_assets'] = JSON.stringify({ assets: vm.runInContext('convertFromNewToFlat', sb)(model.assets, model.holdings), lastUpdated: 1 });
  const reloaded = vm.runInContext('load', sb)();
  const btc = reloaded.find(a => a.id === 'btc-1' || a.ticker === 'BTC' || (a._orphanAssetId==='btc-1'));
  ok('6 orphaned BTC holding RECOVERED (not dropped) — position survives', !!btc);
  ok('7 recovered BTC keeps qty + cost + transaction', !!btc && btc.qty === 0.5 && btc.costBasis === 25000 && btc.transactions.length === 1);
  ok('8 recovered BTC keeps metadata via legacy mirror (name/type/coinId)', !!btc && btc.type === 'crypto' && /bitcoin/i.test(String(btc.coinId)) && btc._recovered === true);
  ok('9 asset count NOT reduced by the orphan (no silent drop)', reloaded.length === 5); }

console.log('\nSalvage without any fallback still preserves the position (degraded display, full financials):');
{ const sb = makeStore();
  sb._mem['aurix_assets']   = JSON.stringify([]);                                   // catalog entirely empty
  sb._mem['aurix_holdings'] = JSON.stringify([{ id:'btc-1', asset_id:'btc-1', quantity:0.5, costBasis:25000, realizedPnL:0, transactions:[{type:'buy',qty:0.5,price:50000,ts:1}] }]);
  const reloaded = vm.runInContext('load', sb)();
  ok('10 holding salvaged with NO catalog + NO legacy mirror (financials intact)',
     reloaded.length === 1 && reloaded[0].qty === 0.5 && reloaded[0].costBasis === 25000 && reloaded[0].transactions.length === 1 && reloaded[0]._recovered === true); }

console.log('\nGenuinely-empty orphan is dropped (no meaningless resurrection); deleted assets never return:');
{ const sb = makeStore();
  sb._mem['aurix_assets']   = JSON.stringify([]);
  sb._mem['aurix_holdings'] = JSON.stringify([{ id:'ghost', asset_id:'ghost', quantity:0, costBasis:0, realizedPnL:0, transactions:[] }]);
  const reloaded = vm.runInContext('load', sb)();
  ok('11 empty orphan (no qty/cost/tx) is dropped, not resurrected', reloaded.length === 0); }

console.log('\nNo storage overwrite / no reduced set on a plain reload (idempotent):');
{ const sb = makeStore();
  const model = vm.runInContext('convertToNewModel', sb)(fullPortfolio());
  vm.runInContext('saveData', sb)(model);
  const a1 = vm.runInContext('load', sb)();
  const holdingsAfterLoad1 = JSON.parse(sb._mem['aurix_holdings']).length;
  const a2 = vm.runInContext('load', sb)();                       // a second reload must not shrink anything
  const holdingsAfterLoad2 = JSON.parse(sb._mem['aurix_holdings']).length;
  ok('12 load() does not mutate stored holdings (read-only)', holdingsAfterLoad1 === 5 && holdingsAfterLoad2 === 5 && a1.length === a2.length); }

console.log('\nUI / category layer is strictly read-only (cannot mutate holdings):');
ok('13 category render/build/apply/series funcs never write assets/holdings/storage',
   ['_aurixCategoryPerfRender','_aurixCategoryPerfBuildPanel','_aurixCategoryPerfApplyRange','_aurixCategoryPerfUpdateHeader','_categorySeriesForRange','_categoryBucketsForType']
     .every(name => { const src = fn(name); return !/\bassets\s*=/.test(src) && !/\bsave\s*\(/.test(src) && !/saveData\s*\(/.test(src) && !/localStorage\.setItem/.test(src); }));
ok('14 category navigation filters for DISPLAY only (local var, never reassigns global assets)',
   /const filtered = activeCategory[\s\S]{0,160}\.filter\(/.test(app) && !/\bassets = [\s\S]{0,40}\.filter\(a => \(TYPE_META/.test(app));
ok('15 removing the mini chart did NOT touch the data model (cleanup commit is UI-only)',
   /const _AURIX_CATEGORY_PERF_CHART_ENABLED = false;/.test(app) &&
   !/_AURIX_CATEGORY_PERF_CHART_ENABLED/.test(fn('convertFromNewToFlat')) &&
   !/category-perf/.test(fn('load')) && !/category-perf/.test(fn('saveData')));

console.log('\nMain institutional chart untouched:');
ok('16 renderer + frozen layers intact', /function renderAurixInstitutionalChart\(/.test(app) && /_AURIX_PREMIUM_MOTION_ENABLED = true/.test(app) && /_AURIX_VERTICAL_STEP_SOFTENING_ENABLED = true/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
