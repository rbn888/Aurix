'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-M0-ACCOUNTING-FORENSIC-AUDIT — READ-ONLY forensic audit (no prod change)
// ════════════════════════════════════════════════════════════════════════════
// Verifies the CURRENT accounting against INDEPENDENTLY hand-computed expected values across a deterministic
// scenario matrix. Extracts the REAL functions (syncCostBasisFromTransactions, isClosedAsset) + replicates
// the REAL sell-handler realized formula (app.js ~47993: realized=(price−avgCost)×amount; remaining
// costBasis*=remaining/qty). Identity checked: ΔPV = CashFlows + Realized + ΔUnrealized (residual must be 0).
// Removable: this file only; touches no app.js logic.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i),pd=0; for(;p<app.length;p++){if(app[p]==='(')pd++;else if(app[p]===')'){pd--;if(!pd){p++;break;}}}
  let k=app.indexOf('{',p),d=0; for(;k<app.length;k++){if(app[k]==='{')d++;else if(app[k]==='}'){d--;if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c,info){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(info?'  ['+info+']':''));} }
const sb={Number,Math,Array,console:{}}; vm.createContext(sb);
vm.runInContext(fnSrc('isClosedAsset'),sb); vm.runInContext(fnSrc('syncCostBasisFromTransactions'),sb);
const codeSync = txns => { const a={transactions:txns.slice()}; sb.__a=a; vm.runInContext('syncCostBasisFromTransactions(__a)',sb); return a.costBasis; };

// ── INDEPENDENT reference: correct weighted-average-cost engine (hand-method) ──
function refEngine(events){ // events: {buy qty,price} | {sell qty,price} | {deposit amt} | {withdraw amt}
  let qty=0, costBasis=0, realized=0, cash=0, cashFlows=0;
  for(const e of events){
    if(e.buy){ costBasis+=e.buy.qty*e.buy.price; qty+=e.buy.qty; cash-=e.buy.qty*e.buy.price; cashFlows+=0; } // buy = internal (cash→asset), net flow 0
    else if(e.sell){ const avg=qty>0?costBasis/qty:0; realized+=(e.sell.price-avg)*e.sell.qty; costBasis-=avg*e.sell.qty; qty-=e.sell.qty; cash+=e.sell.price*e.sell.qty; } // sell = internal, net flow 0
    else if(e.deposit){ cash+=e.deposit; cashFlows+=e.deposit; }
    else if(e.withdraw){ cash-=e.withdraw; cashFlows-=e.withdraw; }
  }
  return {qty, costBasis:+costBasis.toFixed(6), realized:+realized.toFixed(6), cashFlows};
}
// txns list for the code's sync (buys+sells only)
const txns = events => events.filter(e=>e.buy||e.sell).map(e=> e.buy?{type:'buy',qty:e.buy.qty,price:e.buy.price}:{type:'sell',qty:e.sell.qty,price:e.sell.price});

console.log('AURIX-M0-ACCOUNTING-FORENSIC-AUDIT — read-only\n');

// ═══ VERIFIED-CORRECT probes (buy-only: sync matches avg-cost) ═══
console.log('Buy-only cost basis (expect CORRECT):');
{ const ev=[{buy:{qty:10,price:100}}]; ok('1 single buy ⇒ costBasis 1000', codeSync(txns(ev))===1000 && refEngine(ev).costBasis===1000); }
{ const ev=[{buy:{qty:10,price:100}},{buy:{qty:10,price:200}}]; ok('2 multiple buys ⇒ costBasis 3000 (avg 150)', codeSync(txns(ev))===3000 && refEngine(ev).costBasis===3000); }
{ const ev=[{buy:{qty:5,price:80}},{buy:{qty:15,price:120}}]; ok('3 avg-cost update ⇒ 2200', codeSync(txns(ev))===2200 && refEngine(ev).costBasis===2200); }

// ═══ DEFECT probes (partial/full sell: sync subtracts PROCEEDS, not cost) ═══
console.log('\nPost-sell cost basis (code sync vs correct avg-cost remaining):');
function probe(name, ev){ const code=codeSync(txns(ev)); const ref=refEngine(ev); const match=Math.abs(code-ref.costBasis)<1e-6;
  console.log(`  • ${name}: code costBasis=${code}  correct=${ref.costBasis}  ${match?'MATCH':'✗ MISMATCH (defect)'}`); return {code,ref,match}; }
const p4=probe('4 partial sell (buy10@100, sell5@200)', [{buy:{qty:10,price:100}},{sell:{qty:5,price:200}}]);
ok('4 partial-sell remaining costBasis correct (500)', p4.match, 'code='+p4.code+' correct='+p4.ref.costBasis);
const p5=probe('5 full sell (buy10@100, sell10@200)', [{buy:{qty:10,price:100}},{sell:{qty:10,price:200}}]);
ok('5 full-sell costBasis 0 (both agree at 0)', p5.match);
const p6=probe('6 multi partial sells (buy20@100, sell5@150, sell5@250)', [{buy:{qty:20,price:100}},{sell:{qty:5,price:150}},{sell:{qty:5,price:250}}]);
ok('6 multi-partial-sell remaining costBasis correct (1000)', p6.match, 'code='+p6.code+' correct='+p6.ref.costBasis);
const p7=probe('7 sell at a LOSS then hold (buy10@100, sell5@60)', [{buy:{qty:10,price:100}},{sell:{qty:5,price:60}}]);
ok('7 loss-sell remaining costBasis correct (500)', p7.match, 'code='+p7.code+' correct='+p7.ref.costBasis);
const p8=probe('8 sell>half at profit (buy10@100, sell8@200) — max(0) clamp', [{buy:{qty:10,price:100}},{sell:{qty:8,price:200}}]);
ok('8 clamp defect: remaining costBasis correct (200)', p8.match, 'code='+p8.code+' correct='+p8.ref.costBasis);

// ═══ IDENTITY: ΔPV = flows + realized + Δunrealized, using the CODE's displayed costBasis ═══
console.log('\nAccounting identity (code costBasis ⇒ unrealized ⇒ residual):');
function identity(name, ev, currentPrice){ const ref=refEngine(ev);
  const codeCB=codeSync(txns(ev)); const qty=ref.qty;
  const mv=qty*currentPrice;                                   // market value now
  const unrealCode=mv-codeCB;                                  // unrealized using CODE's (post-render-sync) costBasis
  const unrealTrue=mv-ref.costBasis;                           // correct unrealized
  const marketPnLcode=ref.realized+unrealCode;                // realized is correct (handler); unrealized from code
  const marketPnLtrue=ref.realized+unrealTrue;
  // ΔPV (market-only, flows excluded) TRUE = marketPnLtrue by construction. Residual = code − true.
  const residual=+(marketPnLcode-marketPnLtrue).toFixed(6);
  console.log(`  • ${name}: realized=${ref.realized} unrealized(code)=${unrealCode} vs true=${unrealTrue}  → residual=${residual}`);
  return residual; }
ok('9 [DEFECT] partial-sell identity residual = 0', identity('buy10@100 sell5@200 @price200',[{buy:{qty:10,price:100}},{sell:{qty:5,price:200}}],200)===0);
ok('10 [DEFECT] loss-sell identity residual = 0', identity('buy10@100 sell5@60 @price60',[{buy:{qty:10,price:100}},{sell:{qty:5,price:60}}],60)===0);
ok('11 buy-only identity residual = 0 (correct)', identity('buy10@100 @price130',[{buy:{qty:10,price:100}}],130)===0);
ok('12 sell-then-rebuy identity residual = 0', identity('buy10@100 sell10@200 buy5@150 @price150',[{buy:{qty:10,price:100}},{sell:{qty:10,price:200}},{buy:{qty:5,price:150}}],150)===0);

console.log('\n' + (fail? ('AUDIT COMPLETE — '+pass+' checks passed, '+fail+' FAILED (defects present)') : ('ALL '+pass+' PASS — no defect')));
// M0 is an AUDIT: a "fail" = a proven defect, which is the finding. Always exit 0 (report-only).
process.exit(0);
