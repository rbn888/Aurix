'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CANONICAL-ACCOUNTING-harness — SPEC INSTITUTIONAL-CHART.M1
// ════════════════════════════════════════════════════════════════════════════
// Certifies the canonical accounting engine (_aurixComputeAccounting / _aurixAccountPosition): the 5
// separated quantities, the D1-corrected weighted-average cost basis, the enforced identity (residual 0),
// and fail-closed behaviour. Runs the SAME M0 scenario matrix — now 100% green against the canonical model.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i),pd=0; for(;p<app.length;p++){if(app[p]==='(')pd++;else if(app[p]===')'){pd--;if(!pd){p++;break;}}}
  let k=app.indexOf('{',p),d=0; for(;k<app.length;k++){if(app[k]==='{')d++;else if(app[k]==='}'){d--;if(!d){k++;break;}}}
  return app.slice(i,k); }
function konst(name){ const m=app.match(new RegExp('const '+name+'\\s*=.*?;')); if(!m) throw new Error('missing '+name); return m[0]; }
let pass=0,fail=0; function ok(n,c,info){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(info?'  ['+info+']':''));} }
const sb={Number,Math,Array,isFinite,console:{}}; vm.createContext(sb);
konst('_AURIX_ACCOUNTING_EPSILON') && vm.runInContext(konst('_AURIX_ACCOUNTING_EPSILON'),sb);
vm.runInContext(fnSrc('_aurixAccountPosition'),sb); vm.runInContext(fnSrc('_aurixComputeAccounting'),sb);
const acct = input => { sb.__i=input; return vm.runInContext('_aurixComputeAccounting(__i)',sb); };
const B=(qty,price)=>({type:'buy',qty,price}); const S=(qty,price)=>({type:'sell',qty,price});
const pos=(txns,currentPrice)=>({positions:[{transactions:txns,currentPrice}]});
const near=(a,b)=>Math.abs(a-b)<0.01;

console.log('AURIX-CANONICAL-ACCOUNTING — SPEC INSTITUTIONAL-CHART.M1\n');

// ── the 5 quantities + D1-corrected basis + residual, on the M0 matrix ──
console.log('Canonical engine on the M0 scenario matrix (residual must be 0):');
{ const r=acct(pos([B(10,100)],130)); ok('1 single buy: cb 1000, unreal 300, resid 0, reconciled', near(r.costBasis,1000)&&near(r.unrealizedPnL,300)&&near(r.realizedPnL,0)&&r.residual===0&&r.reconciled, JSON.stringify(r)); }
{ const r=acct(pos([B(10,100),B(10,200)],150)); ok('2 multiple buys: cb 3000, unreal 0, resid 0', near(r.costBasis,3000)&&near(r.unrealizedPnL,0)&&r.residual===0); }
{ const r=acct(pos([B(10,100),S(5,200)],200)); ok('3 [D1] partial sell@profit: cb 500, real 500, unreal 500, resid 0', near(r.costBasis,500)&&near(r.realizedPnL,500)&&near(r.unrealizedPnL,500)&&r.residual===0&&r.reconciled, JSON.stringify(r)); }
{ const r=acct(pos([B(10,100),S(10,200)],200)); ok('4 full sell: cb 0, real 1000, unreal 0, resid 0', near(r.costBasis,0)&&near(r.realizedPnL,1000)&&near(r.unrealizedPnL,0)&&r.residual===0); }
{ const r=acct(pos([B(20,100),S(5,150),S(5,250)],130)); ok('5 [D1] multi partial sells: cb 1000, real 1000, unreal 300, resid 0', near(r.costBasis,1000)&&near(r.realizedPnL,250+750)&&near(r.unrealizedPnL,10*130-1000)&&r.residual===0, JSON.stringify(r)); }
{ const r=acct(pos([B(10,100),S(5,60)],60)); ok('6 [D1] loss sell: cb 500, real -200, unreal -200, resid 0', near(r.costBasis,500)&&near(r.realizedPnL,-200)&&near(r.unrealizedPnL,-200)&&r.residual===0, JSON.stringify(r)); }
{ const r=acct(pos([B(10,100),S(8,200)],200)); ok('7 [D1] sell>half (no clamp bug): cb 200, real 800, unreal 200, resid 0', near(r.costBasis,200)&&near(r.realizedPnL,800)&&near(r.unrealizedPnL,200)&&r.residual===0, JSON.stringify(r)); }
{ const r=acct(pos([B(10,100),S(10,200),B(5,150)],150)); ok('8 [D1] sell-then-rebuy: cb 750, real 1000, unreal 0, resid 0', near(r.costBasis,750)&&near(r.realizedPnL,1000)&&near(r.unrealizedPnL,0)&&r.residual===0, JSON.stringify(r)); }

// ── multi-asset aggregate + cash flows separated ──
console.log('\nMulti-asset + cash flows (separation):');
{ const r=acct({ positions:[{transactions:[B(10,100),S(5,200)],currentPrice:200},{transactions:[B(2,1000)],currentPrice:1200}], cashFlowsNet: 5000 });
  ok('9 multi-asset: value 1000+2400=3400, real 500, unreal 500+400=900, resid 0, flows 5000 separate',
    near(r.portfolioValue,3400)&&near(r.realizedPnL,500)&&near(r.unrealizedPnL,900)&&r.residual===0&&near(r.cashFlows,5000)&&r.reconciled, JSON.stringify(r)); }
{ const r=acct({ positions:[{transactions:[B(1,1000)],currentPrice:1500}], cashFlowsNet: -300 });
  ok('10 withdrawal is a cash flow, NOT a market loss (unreal +500, flows -300)', near(r.unrealizedPnL,500)&&near(r.cashFlows,-300)&&r.marketPnL===500); }

// ── identity + fail-closed ──
console.log('\nIdentity + fail-closed:');
{ const r=acct(pos([B(10,100),S(3,180),S(2,90)],110)); ok('11 identity residual 0 on mixed sells', r.residual===0&&r.reconciled); }
{ const r=acct(pos([B(10,100)],NaN)); ok('12 fail-closed: unpriced ⇒ state valuation_incomplete, NOT reconciled, no fabricated value', r.state==='valuation_incomplete'&&r.reconciled===false&&r.anyUnpriced===true, JSON.stringify(r)); }
{ const r=acct({positions:[{transactions:[B(10,100),S(5,200)],currentPrice:200}]}); ok('13 reconciled healthy ⇒ state reconciled', r.state==='reconciled'&&r.reconciled===true); }
// stored-divergence diagnostic (feeds M2 data reconciliation): stored buggy costBasis 0 vs canonical 500
{ const r=acct({positions:[{transactions:[B(10,100),S(5,200)],currentPrice:200,storedCostBasis:0,storedRealizedPnL:500}]});
  ok('14 detects stored costBasis divergence (buggy 0 vs canonical 500 = -500)', r.positions[0].storedCostBasisDivergence===-500, JSON.stringify(r.positions[0])); }

console.log('\n' + (fail? ('FAIL — '+pass+' passed, '+fail+' failed') : ('PASS — '+pass+' passed, 0 failed  —  M1 CANONICAL ENGINE CERTIFIED ✓')));
if (fail) process.exit(1);
