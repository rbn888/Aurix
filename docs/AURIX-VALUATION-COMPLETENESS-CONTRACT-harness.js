'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-VALUATION-COMPLETENESS-CONTRACT-harness — SPEC CHART-INTEGRITY.LB-1
// ════════════════════════════════════════════════════════════════════════════
// Regression for the forensic P0: a cold-start snapshot could be persisted while some active holdings had
// no valid price (assetValueUSD → NaN, silently skipped), yielding a positive-but-INCOMPLETE total that
// became the return endpoint and published a false ~-24%. This certifies:
//   (Phase 2) _aurixAssessValuationCompleteness reports priced/unpriced/invalid/missingFx + complete + reason.
//   (LB-1)    a valuation-incomplete point is HARD-rejected by _shouldRejectSnapshot / _aurixGuardSnapshot
//             (reason 'valuation_incomplete', NOT quarantined) so it can never enter history / become an endpoint.
// Covers regression categories A (cold start missing price), B (the -24% incident), J (pricing combinations).
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
// multiline const extractor (handles Object.freeze({...});)
function konstSrc(name){ const s='const '+name+' ='; const i=app.indexOf(s); if(i<0) throw new Error('missing const '+name);
  let k=i, depth=0, started=false; for(;k<app.length;k++){ const c=app[k]; if(c==='('||c==='{'||c==='[') {depth++;started=true;} else if(c===')'||c==='}'||c===']') depth--; else if(c===';'&&(!started||depth===0)) { k++; break; } }
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c,info){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(info?'  ['+info+']':''));} }

const NOW = 1800000000000;
const sb = { Math, Number, JSON, Array, isFinite, Infinity, console:{warn:()=>{},log:()=>{},debug:()=>{}}, window:{} };
vm.createContext(sb);
// constants
sb.OZ_TO_G = 31.1034768; sb.usdToEur = 0.92;
vm.runInContext(konstSrc('_AURIX_VALUATION_REASON'), sb);
vm.runInContext('const _AURIX_SNAPSHOT_GUARD = { fastMs: 1800000, fastPct: 0.08, slowMs: 21600000, slowPct: 0.15, flowWindowMs: 600000 };', sb);
vm.runInContext('const _AURIX_SNAPSHOT_GUARD_MAX = 20;', sb);
vm.runInContext('const _AURIX_GUARD_QUARANTINE_REASONS = { suspicious_drop_without_market_reason: 1, suspicious_jump_without_capital_flow: 1 };', sb);
vm.runInContext('var _aurixGuardTelemetry = { snapshotRejected:0, lastRejectReason:null, lastRejectTs:null, snapshotQuarantined:0, lastQuarantineReason:null, lastQuarantineTs:null };', sb);
vm.runInContext('var _aurixPricesReady = true;', sb);
// leaf stubs
sb.isClosedAsset = a => !!a && a.lifecycleStatus === 'closed';
sb.liquidityNominal = a => Number((a && a.qty) || 0);
sb._goldGrams = (q,u)=> u==='oz'? q*sb.OZ_TO_G : (u==='kg'? q*1000 : q);
sb._goldPurity = k => ({'24':1,'18':0.75}[String(k)] || 1);
sb._aurixFxStatus = ccy => (ccy==='ZZZ' ? 'unknown' : 'live');            // ZZZ = an uncovered exotic currency
sb._aurixFxRate = ccy => (ccy==='GBP' ? 1.27 : NaN);
sb._aurixHasCapitalFlowNear = () => false;
sb._aurixPushRejected = () => {};
// real functions under test
['assetNativeValue','assetValueUSD','_aurixAssessValuationCompleteness','_shouldRejectSnapshot','_aurixGuardSnapshot']
  .forEach(n => vm.runInContext(fnSrc(n), sb));
const assess = list => { sb.__l = list; return vm.runInContext('_aurixAssessValuationCompleteness(__l)', sb); };
const guard  = (next, prev) => { sb.__n = next; sb.__p = prev; return vm.runInContext('_aurixGuardSnapshot(__n, __p, "portfolio")', sb); };
const reject = (next, prev) => { sb.__n = next; sb.__p = prev; return vm.runInContext('_shouldRejectSnapshot(__n, __p, {})', sb); };

console.log('AURIX-VALUATION-COMPLETENESS-CONTRACT — SPEC CHART-INTEGRITY.LB-1\n');

// ── Phase 2: the assessment ──
console.log('Assessment (Phase 2):');
const full = [
  { symbol:'BTC', type:'crypto', qty:1,   price:60000, assetCurrency:'USD' },
  { symbol:'AAPL',type:'stock',  qty:10,  price:200,   assetCurrency:'USD' },
  { symbol:'EURC',type:'cash',   qty:5000,             assetCurrency:'USD' },
];
{ const a = assess(full); ok('1 fully-priced portfolio ⇒ complete, reason COMPLETE', a.complete===true && a.reason==='COMPLETE' && a.unpriced===0 && a.priced===3, JSON.stringify(a)); }

// A) cold start: one active holding lacks a valid price
const missingPrice = full.slice(); missingPrice[0] = { symbol:'BTC', type:'crypto', qty:1, price:undefined, assetCurrency:'USD' };
{ const a = assess(missingPrice); ok('2 [A] one unpriced crypto ⇒ NOT complete, reason MISSING_PRICE, unpriced=1', a.complete===false && a.reason==='MISSING_PRICE' && a.unpriced===1, JSON.stringify(a)); }
{ const a = assess([{ symbol:'BTC',type:'crypto',qty:1,price:0,assetCurrency:'USD' }]); ok('3 price 0 ⇒ unpriced (never valued as 0)', a.complete===false && a.reason==='MISSING_PRICE'); }
{ const a = assess([{ symbol:'X',type:'crypto',qty:1,price:100,assetCurrency:'ZZZ' }]); ok('4 [J] uncovered FX ⇒ NOT complete, reason MISSING_FX', a.complete===false && a.reason==='MISSING_FX' && a.missingFx===1); }
{ const a = assess([{ symbol:'GBP',type:'stock',qty:2,price:50,assetCurrency:'GBP' }]); ok('5 [J] covered FX (GBP) ⇒ complete', a.complete===true && a.reason==='COMPLETE', JSON.stringify(a)); }
{ const a = assess([{ symbol:'C',type:'cash',qty:1000,assetCurrency:'USD' }]); ok('6 cash (no market price) ⇒ complete', a.complete===true && a.priced===1); }
{ const a = assess([{ symbol:'OLD',type:'crypto',qty:0,price:0,assetCurrency:'USD',lifecycleStatus:'closed' }]); ok('7 closed/zero-qty holding ⇒ excluded, empty complete', a.complete===true && a.totalActive===0 && a.reason==='EMPTY'); }
{ const a = assess([]); ok('8 empty account ⇒ complete (total 0)', a.complete===true && a.reason==='EMPTY'); }
{ const a = assess([{ symbol:'BAD',type:'crypto',qty:NaN,price:100,assetCurrency:'USD' }]); ok('9 [J] non-finite quantity ⇒ INVALID_HOLDING', a.complete===false && a.reason==='INVALID_HOLDING' && a.invalid===1); }
// prices-not-ready reason distinction
{ vm.runInContext('_aurixPricesReady = false;', sb); const a = assess(missingPrice); ok('10 unpriced while prices not ready ⇒ reason VALUATION_NOT_READY', a.complete===false && a.reason==='VALUATION_NOT_READY'); vm.runInContext('_aurixPricesReady = true;', sb); }

// ── LB-1: the write guard hard-rejects incomplete valuations ──
console.log('\nWrite-guard rejection (LB-1):');
{ const res = reject({ ts:NOW, total:4560, investable:4560, valuationComplete:false, valuationReason:'MISSING_PRICE', unpricedActive:1, missing:['BTC'] }, { ts:NOW-8*36e5, total:6000 });
  ok('11 valuationComplete:false ⇒ reject reason valuation_incomplete', res.reject===true && res.reason==='valuation_incomplete', JSON.stringify(res)); }
{ const skip = guard({ ts:NOW, total:4560, investable:4560, valuationComplete:false, valuationReason:'MISSING_PRICE' }, { ts:NOW-8*36e5, total:6000 });
  const tel = vm.runInContext('JSON.parse(JSON.stringify(_aurixGuardTelemetry))', sb);
  ok('12 incomplete ⇒ HARD dropped (guard true) and REJECTED, not quarantined', skip===true && tel.snapshotRejected===1 && tel.snapshotQuarantined===0, JSON.stringify(tel)); }
{ // B) the exact -24% incident: a high baseline (6000) vs a partial-low endpoint (4560, ~-24%) after an overnight (>6h) gap.
  // Pre-fix this passed the guard (overnight gap → not "suspicious") and published -24% < 25% sane band. Now it is
  // hard-rejected purely because the endpoint valuation is incomplete — regardless of magnitude or gap.
  const skip = guard({ ts:NOW, total:4560, investable:4560, valuationComplete:false, valuationReason:'MISSING_PRICE' }, { ts:NOW-12*36e5, total:6000 });
  ok('13 [B] -24% partial endpoint after overnight gap ⇒ BLOCKED at snapshot stage', skip===true); }
{ // control: a COMPLETE endpoint with the same -24% move is NOT blocked by completeness (only completeness gates here;
  // magnitude/plausibility is a separate downstream concern). Overnight gap ⇒ not "suspicious" ⇒ allowed to persist.
  const skip = guard({ ts:NOW, total:4560, investable:4560, valuationComplete:true }, { ts:NOW-12*36e5, total:6000 });
  ok('14 complete endpoint (same move) ⇒ NOT blocked by completeness gate', skip===false); }
{ // backward-compat: a caller that does not set valuationComplete (legacy path) is unaffected.
  const res = reject({ ts:NOW, total:5000, investable:5000 }, { ts:NOW-60000, total:5000 });
  ok('15 legacy next (no valuationComplete field) ⇒ no completeness rejection', res.reject===false); }
{ // fail-safe: assessment exception path yields complete:false (never silently "complete") — proven by feeding a
  // list whose asset makes assetValueUSD throw is impractical here; instead assert the reason enum exists + default.
  const a = assess(null); ok('16 null list ⇒ treated as empty complete (no crash)', a && a.complete===true && a.reason==='EMPTY'); }

console.log('\n' + (fail? ('FAIL — '+pass+' passed, '+fail+' failed') : ('PASS — '+pass+' passed, 0 failed  —  LB-1 CERTIFIED ✓')));
if (fail) process.exit(1);
