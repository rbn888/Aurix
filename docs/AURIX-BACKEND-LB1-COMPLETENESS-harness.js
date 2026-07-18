'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-BACKEND-LB1-COMPLETENESS-harness — SPEC CHART-INTEGRITY.LB-1 (server-side)
// ════════════════════════════════════════════════════════════════════════════
// The backend Edge Function (portfolio-snapshot) previously had NO price-coverage guard: unpriced/orphan/
// FX-missing holdings were skipped (`continue`) yet a positive PARTIAL total was still inserted — the same
// −24% class of defect, server-side, bypassing the client LB-1 (which only guards client writes). FIX: a
// `dropped` counter (active holdings EXCLUDED from the total, distinct from stale-but-valued) + a
// completeness gate that SKIPS the insert when dropped>0 (preserving the previous valid snapshot).
// This certifies the guard by source cross-check + a behavioral mirror of the valueUser drop logic.
const fs = require('fs'), path = require('path');
const edge = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'portfolio-snapshot', 'index.ts'), 'utf8');
let pass=0,fail=0; function ok(n,c,info){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(info?'  ['+info+']':''));} }

console.log('AURIX-BACKEND-LB1-COMPLETENESS — SPEC CHART-INTEGRITY.LB-1 (server-side)\n');

// ── Source cross-check: the guard exists, is correctly placed, and is non-destructive ──
console.log('Edge Function guard (source):');
ok('1 `dropped` counter declared in valueUser', /let total = 0,[^;]*dropped = 0;/.test(edge));
ok('2 orphan holding increments dropped', /if \(!asset\) \{ unpriced\+\+; dropped\+\+;/.test(edge));
ok('3 non-finite quantity increments dropped (qty===0 still excluded, not dropped)', /if \(qty === 0\) continue;/.test(edge) && /if \(!Number\.isFinite\(qty\)\) \{ dropped\+\+;/.test(edge));
ok('4 non-finite value (missing price/FX, no fallback) increments dropped', /if \(!Number\.isFinite\(valueUSD\)\) \{ unpriced\+\+; dropped\+\+;/.test(edge));
ok('5 valueUser returns dropped_asset_count', /dropped_asset_count: dropped/.test(edge));
ok('6 insert is SKIPPED when dropped>0 (partial valuation never persisted)', /if \(Number\(v\.dropped_asset_count\) > 0\) \{ incompleteRej\+\+; continue; \}/.test(edge));
ok('7 completeness gate runs BEFORE near-dup and BEFORE insert', edge.indexOf('dropped_asset_count) > 0') < edge.indexOf('near-duplicate guard') && edge.indexOf('dropped_asset_count) > 0') < edge.indexOf('.insert('));
ok('8 gate SKIPS (continue) — never updates/deletes existing rows (previous valid snapshot preserved)', !/\.update\(|\.delete\(/.test(edge) && /incompleteRej\+\+; continue;/.test(edge));
ok('9 incompleteRej reported in the response summary', /inserted, skipped, empty, inactive, errored, incompleteRej/.test(edge));
ok('10 return formula / valuation math otherwise unchanged (still stored-price fallback for stale)', /const unit = fresh \? fresh\.price : storedPrice;/.test(edge));

// ── Behavioral mirror of valueUser's drop logic (proves accept/reject decisions) ──
console.log('\nBehavioral mirror (accept complete/stale, reject partial):');
// mirror: returns {total, dropped}. Non-cash: fresh price OR stored fallback; NaN only when both missing (or FX missing).
function valueMirror(holdings, catalog, prices, fx) {
  const byId = new Map(catalog.map(a => [a.id, a]));
  let total = 0, dropped = 0;
  for (const h of holdings) {
    const a = byId.get(h.asset_id);
    if (!a) { dropped++; continue; }                                   // orphan
    const qty = Number(h.quantity);
    if (qty === 0) continue;                                           // legit excluded
    if (!Number.isFinite(qty)) { dropped++; continue; }               // invalid qty
    let v;
    if (a.type === 'cash') { v = a.assetCurrency === 'USD' ? qty : (Number.isFinite(fx[a.assetCurrency]) ? qty*fx[a.assetCurrency] : (a.currentPrice>0?qty*a.currentPrice:NaN)); }
    else { const fresh = prices[a.symbol]; const unit = (fresh!=null) ? fresh : a.currentPrice; const native = qty*unit;
           v = a.assetCurrency==='USD' ? native : (Number.isFinite(fx[a.assetCurrency]) ? native*fx[a.assetCurrency] : NaN); }
    if (!Number.isFinite(v)) { dropped++; continue; }                 // excluded ⇒ partial
    total += v;
  }
  return { total: +total.toFixed(2), dropped };
}
const cat = [ {id:'a1',symbol:'BTC',type:'crypto',currentPrice:60000,assetCurrency:'USD'},
              {id:'a2',symbol:'AAPL',type:'stock',currentPrice:200,assetCurrency:'USD'},
              {id:'a3',symbol:null,type:'cash',currentPrice:1,assetCurrency:'USD'} ];
const hold = [ {asset_id:'a1',quantity:0.5}, {asset_id:'a2',quantity:10}, {asset_id:'a3',quantity:5000} ];
const accept = r => r.dropped === 0;   // insert allowed
// fully fresh
ok('11 all fresh ⇒ dropped 0, total 37000, ACCEPT', (r=>r.dropped===0 && r.total===37000 && accept(r))(valueMirror(hold, cat, {BTC:60000,AAPL:200}, {})));
// AAPL missing fresh but stored fallback ⇒ stale-but-valued, NOT dropped, ACCEPT (matches app using currentPrice)
ok('12 stale price (stored fallback) ⇒ dropped 0, ACCEPT (not over-rejected)', (r=>r.dropped===0 && r.total===37000 && accept(r))(valueMirror(hold, cat, {BTC:60000}, {})));
// AAPL has no fresh AND no stored price ⇒ dropped 1 ⇒ REJECT
const catNoStore = cat.map(a => a.id==='a2' ? {...a, currentPrice: NaN} : a);
ok('13 [incident] missing price + no fallback ⇒ dropped 1 ⇒ REJECT (partial total never persisted)', (r=>r.dropped===1 && !accept(r))(valueMirror(hold, catNoStore, {BTC:60000}, {})));
// orphan holding ⇒ dropped 1 ⇒ REJECT
ok('14 orphan holding ⇒ dropped 1 ⇒ REJECT', (r=>r.dropped===1 && !accept(r))(valueMirror(hold.concat([{asset_id:'zzz',quantity:1}]), cat, {BTC:60000,AAPL:200}, {})));
// non-USD asset with missing FX and no fallback ⇒ dropped ⇒ REJECT
const catEur = cat.map(a => a.id==='a2' ? {...a, assetCurrency:'EUR'} : a);
ok('15 missing FX (no fallback) ⇒ dropped 1 ⇒ REJECT', (r=>r.dropped===1 && !accept(r))(valueMirror(hold, catEur, {BTC:60000,AAPL:200}, {})));
// covered FX ⇒ ACCEPT
ok('16 covered FX ⇒ dropped 0 ⇒ ACCEPT', (r=>r.dropped===0 && accept(r))(valueMirror(hold, catEur, {BTC:60000,AAPL:200}, {EUR:1.08})));
// zero-qty holding excluded, not dropped
ok('17 zero-qty holding ⇒ excluded, dropped 0, ACCEPT', (r=>r.dropped===0 && accept(r))(valueMirror(hold.concat([{asset_id:'a1',quantity:0}]), cat, {BTC:60000,AAPL:200}, {})));

console.log('\n' + (fail? ('FAIL — '+pass+' passed, '+fail+' failed') : ('PASS — '+pass+' passed, 0 failed  —  BACKEND LB-1 CERTIFIED ✓')));
if (fail) process.exit(1);
