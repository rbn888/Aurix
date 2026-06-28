'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ASSET-DOCTOR-RECOVERY-harness — P0-DATA-RECOVERY (window.aurixAssetDoctor / RecoverHolding)
// ════════════════════════════════════════════════════════════════════════════
// Read-only diagnosis across memory / localStorage / legacy mirror / Supabase, and a SURGICAL
// restore that re-injects a FOUND holding without recalculating or overwriting other assets.
// Never fabricates a position (only restores financials actually present in a source).
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fn(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=app.indexOf('{',i),d=0; for(;k<app.length;k++){const c=app[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} return app.slice(i,k); }
const DOCTOR_BLOCK = app.slice(app.indexOf('function _aurixDoctorMatch('), app.indexOf('// ── Input number formatting'));
let pass=0,fail=0; function ok(n,c,i){ if(c){pass++;console.log('  ✓ '+n+(i?'  ['+i+']':''));}else{fail++;console.log('  ✗ '+n+(i?'  ['+i+']':''));} }

function supaMock(row){ // row = {assets,holdings} or null
  return { from:()=>({ select:()=>({ eq:()=>({ single: async ()=>({ data: row, error: row?null:{message:'no row'} }) }) }) }) };
}
function makeEnv(opts){
  opts = opts || {};
  const mem = Object.assign({}, opts.local || {});
  const localStorage = { getItem:k=>(k in mem?mem[k]:null), setItem:(k,v)=>{mem[k]=String(v);}, removeItem:k=>{delete mem[k];} };
  let saveCalls = 0;
  const sb = { console:{log:()=>{},warn:()=>{},error:()=>{}}, JSON, Array, Number, Object, Map, String, Boolean, Date, isFinite,
    localStorage, STORAGE_KEY:'portfolio_assets', IS_DEV:false, _persistDebug:()=>{},
    window:{}, supabaseClient: ('supa' in opts)? supaMock(opts.supa) : null, currentUser: opts.user||{id:'u1'},
    assets: opts.assets ? opts.assets.map(a=>Object.assign({},a)) : [],
    save:function(){ saveCalls++; }, render:function(){}, _mem:mem, _saveCalls:()=>saveCalls };
  vm.createContext(sb);
  ['inferPriceSource','inferProviderId','_aurixSalvageHolding','_aurixLegacyFallbackById','convertToNewModel','convertFromNewToFlat','convertToLegacyFormat']
    .forEach(n=>{ try{ vm.runInContext(fn(n), sb); }catch(e){ console.log('load fail '+n+': '+e.message); } });
  vm.runInContext(DOCTOR_BLOCK, sb);
  return sb;
}
const BTC_CAT = { id:'btc-1', name:'Bitcoin', symbol:'BTC', type:'crypto', currentPrice:60000, assetCurrency:'USD', coinId:'bitcoin' };
const BTC_HOLD = { id:'btc-1', asset_id:'btc-1', quantity:0.5, costBasis:25000, realizedPnL:0, transactions:[{type:'buy',qty:0.5,price:50000,ts:1700000000000}] };
const AAPL = { id:'aapl-1', name:'Apple', ticker:'AAPL', type:'stock', qty:10, price:200, costBasis:1500, transactions:[], assetCurrency:'USD' };

console.log('AURIX-ASSET-DOCTOR-RECOVERY — P0\n');

console.log('Diagnostic — locates BTC + detects ORPHAN holdings per source:');
{ const sb = makeEnv({ local:{ aurix_assets: JSON.stringify([]), aurix_holdings: JSON.stringify([BTC_HOLD]) } });
  const scan = vm.runInContext('_aurixDoctorScanModel', sb)({ assets:[], holdings:[BTC_HOLD] }, 'btc');
  ok('1 orphan BTC holding detected (catalog missing)', scan.orphans.length===1 && scan.orphanHits.length===1);
  ok('2 match works on ticker/name/coinId/id', vm.runInContext('_aurixDoctorMatch',sb)(BTC_CAT,'bitcoin') && vm.runInContext('_aurixDoctorMatch',sb)(BTC_HOLD,'btc') && vm.runInContext('_aurixDoctorMatch',sb)(AAPL,'btc')===false); }

console.log('\nVerdict + surgical restore from localStorage orphan (others untouched, no fabrication):');
{ const sb = makeEnv({ assets:[AAPL], local:{ aurix_assets: JSON.stringify([]), aurix_holdings: JSON.stringify([BTC_HOLD]) }, supa:null });
  return (async()=>{
    const diag = await sb.window.aurixAssetDoctor('BTC');
    ok('3 verdict = recoverable from localNew', diag.recoverableFrom==='localNew', diag.verdict);
    const before = sb.assets.length;
    const rep = await sb.window.aurixRecoverHolding('BTC');
    ok('4 restored from localStorage orphan', rep.restored===true && rep.source==='localNew' && rep.added===1);
    const btc = sb.assets.find(a=>a.ticker==='BTC');
    ok('5 BTC re-injected with REAL financials (qty/cost/tx from source)', !!btc && btc.qty===0.5 && btc.costBasis===25000 && btc.transactions.length===1 && btc.transactions[0].price===50000);
    ok('6 BTC metadata decorated (type crypto, coinId bitcoin)', btc.type==='crypto' && btc.coinId==='bitcoin');
    ok('7 other asset (AAPL) untouched + count grew by exactly 1', sb.assets.length===before+1 && sb.assets.some(a=>a.ticker==='AAPL'));
    ok('8 save() called exactly once on restore', sb._saveCalls()===1);
    const rep2 = await sb.window.aurixRecoverHolding('BTC');
    ok('9 idempotent — second restore is a no-op (no duplicate, no extra save)', rep2.restored===false && sb.assets.filter(a=>a.ticker==='BTC').length===1 && sb._saveCalls()===1);

    console.log('\nRestore from Supabase (absent locally + memory):');
    const sb2 = makeEnv({ assets:[AAPL], local:{}, supa:{ assets:[BTC_CAT], holdings:[BTC_HOLD] } });
    const d2 = await sb2.window.aurixAssetDoctor('BTC');
    ok('10 verdict = recoverable from supabase', d2.recoverableFrom==='supabase', d2.verdict);
    const r2 = await sb2.window.aurixRecoverHolding('BTC');
    ok('11 restored from Supabase, AAPL preserved', r2.restored===true && r2.source==='supabase' && sb2.assets.some(a=>a.ticker==='BTC') && sb2.assets.some(a=>a.ticker==='AAPL'));

    console.log('\nNot found anywhere → NOT recoverable, nothing fabricated:');
    const sb3 = makeEnv({ assets:[AAPL], local:{}, supa:null });
    const d3 = await sb3.window.aurixAssetDoctor('BTC');
    ok('12 verdict = not recoverable', d3.recoverableFrom===null && /NOT recoverable/i.test(d3.verdict));
    const r3 = await sb3.window.aurixRecoverHolding('BTC');
    ok('13 nothing fabricated — assets unchanged, no BTC created', r3.restored===false && sb3.assets.length===1 && !sb3.assets.some(a=>a.ticker==='BTC') && sb3._saveCalls()===0);

    console.log('\nAlready present in memory → reports present, no duplicate:');
    const sb4 = makeEnv({ assets:[AAPL, { id:'btc-1', ticker:'BTC', type:'crypto', qty:0.5, costBasis:25000, coinId:'bitcoin', transactions:[] }], local:{}, supa:null });
    const r4 = await sb4.window.aurixRecoverHolding('BTC');
    ok('14 already-present → restored:false, no dup, no save', r4.restored===false && sb4.assets.filter(a=>a.ticker==='BTC').length===1 && sb4._saveCalls()===0);

    console.log('\nRead-only + no-fabrication guarantees (source):');
    ok('15 aurixAssetDoctor is read-only (no assets= / save / setItem in its body)', !/\bassets\s*=/.test(DOCTOR_BLOCK.slice(DOCTOR_BLOCK.indexOf('aurixAssetDoctor'), DOCTOR_BLOCK.indexOf('aurixRecoverHolding'))) && !/\.setItem\(/.test(DOCTOR_BLOCK.slice(DOCTOR_BLOCK.indexOf('aurixAssetDoctor'), DOCTOR_BLOCK.indexOf('aurixRecoverHolding'))));
    ok('16 recover is read-first (calls doctor) + only pushes financials found in a source', /const diag = await window\.aurixAssetDoctor/.test(DOCTOR_BLOCK) && /if \(!diag\.recoverableFrom\) return \{ restored: false/.test(DOCTOR_BLOCK));
    ok('17 KNOWN metadata only decorates static fields, never qty/cost (no fabricated financials)', /KNOWN\[q\]\) return Object\.assign\(\{\}, a, KNOWN\[q\]/.test(DOCTOR_BLOCK) && !/quantity:|qty:\s*\d|costBasis:\s*\d/.test('const KNOWN = ' + (DOCTOR_BLOCK.match(/const KNOWN = \{[^;]*\};/)||[''])[0]));

    console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
    process.exit(fail===0?0:1);
  })();
}
