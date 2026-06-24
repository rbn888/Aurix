/* FASE 2 (hardened) — snapshot WRITE GUARD validation against the shipped
   _shouldRejectSnapshot / _aurixHasCapitalFlowNear / _AURIX_SNAPSHOT_GUARD from app.js.
   Run: node docs/AURIX-SNAPSHOT-WRITE-GUARD-harness.js                              */
'use strict';
const fs=require('fs'), vm=require('vm'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
function fn(n){const s='function '+n+'(';const i=src.indexOf(s);if(i<0)throw new Error('missing '+n);
  let k=src.indexOf('{',i),d=0;for(;k<src.length;k++){const c=src[k];if(c==='{')d++;else if(c==='}'){d--;if(!d){k++;break;}}}return src.slice(i,k);}
function obj(n){const s='const '+n+' =';const i=src.indexOf(s);if(i<0)throw new Error('missing '+n);
  let k=src.indexOf('{',i),d=0;for(;k<src.length;k++){const c=src[k];if(c==='{')d++;else if(c==='}'){d--;if(!d){k++;break;}}}while(src[k]!==';'&&k<src.length)k++;return src.slice(i,k+1);}

const H=3600e3, M=60e3, NOW=1000*86400e3;
let FLOWS=[];
const sb={ console, _aurixLoadCapitalFlows:()=>FLOWS.slice() };
sb.window=sb; vm.createContext(sb);
[ obj('_AURIX_SNAPSHOT_GUARD'), fn('_aurixHasCapitalFlowNear'), fn('_shouldRejectSnapshot') ].forEach(c=>vm.runInContext(c,sb));
const R = sb._shouldRejectSnapshot;

let ok=true; const ck=(n,c,g)=>{console.log((c?'  ✓':'  ✗')+' '+n+(g!==undefined?'  ['+g+']':''));if(!c)ok=false;};

console.log('1. complete normal snapshot → accept');
FLOWS=[]; { const r=R({ts:NOW,total:73000,investable:73000}, {ts:NOW-5*M,total:73050}, {surface:'p'});
  ck('accepted (ok)', r.reject===false && r.reason==='ok', r.reason); }

console.log('2. fxPartial → reject');
{ const r=R({ts:NOW,total:62886,investable:62886,fxPartial:true}, {ts:NOW-5*M,total:73000}, {surface:'p'});
  ck('rejected fx_partial', r.reject && r.reason==='fx_partial', r.reason); }

console.log('3. fxApprox → reject');
{ const r=R({ts:NOW,total:71000,investable:71000,fxApprox:true}, {ts:NOW-5*M,total:73000}, {surface:'p'});
  ck('rejected fx_approx', r.reject && r.reason==='fx_approx', r.reason); }

console.log('4. total NaN → reject');
{ const r=R({ts:NOW,total:NaN,investable:NaN}, {ts:NOW-5*M,total:73000}, {surface:'p'});
  ck('rejected invalid_total', r.reject && r.reason==='invalid_total', r.reason); }

console.log('5. total 0 → reject');
{ const r=R({ts:NOW,total:0,investable:0}, {ts:NOW-5*M,total:73000}, {surface:'p'});
  ck('rejected invalid_total', r.reject && r.reason==='invalid_total', r.reason); }

console.log('6. drop 73k → 62k in 5 min, no flow → reject');
FLOWS=[]; { const r=R({ts:NOW,total:62000,investable:62000}, {ts:NOW-5*M,total:73000}, {surface:'p'});
  ck('rejected suspicious_drop_without_market_reason', r.reject && r.reason==='suspicious_drop_without_market_reason', r.reason+' '+(r.details&&r.details.deltaPct)+'%'); }

console.log('7. jump 62k → 75k in 5 min, no flow → reject');
FLOWS=[]; { const r=R({ts:NOW,total:75000,investable:75000}, {ts:NOW-5*M,total:62000}, {surface:'p'});
  ck('rejected suspicious_jump_without_capital_flow', r.reject && r.reason==='suspicious_jump_without_capital_flow', r.reason+' '+(r.details&&r.details.deltaPct)+'%'); }

console.log('8. jump 62k → 75k in 5 min WITH asset_add near → accept');
FLOWS=[{ts:NOW-3*M, kind:'asset_add', amountUSD:13000}];
{ const r=R({ts:NOW,total:75000,investable:75000}, {ts:NOW-5*M,total:62000}, {surface:'p'});
  ck('accepted (capital flow justifies jump)', r.reject===false && r.reason==='ok', r.reason+' flowNear='+(r.details&&r.details.capitalFlowNear)); }

console.log('9. moderate real market drop (−3% over 2h) → accept');
FLOWS=[]; { const r=R({ts:NOW,total:70810,investable:70810}, {ts:NOW-2*H,total:73000}, {surface:'p'});
  ck('accepted (within thresholds)', r.reject===false && r.reason==='ok', r.reason+' '+(r.details&&r.details.deltaPct)+'%'); }

console.log('10. moderate real market rise (+4% over 5h) → accept');
FLOWS=[]; { const r=R({ts:NOW,total:75920,investable:75920}, {ts:NOW-5*H,total:73000}, {surface:'p'});
  ck('accepted (within slow threshold, no flow needed)', r.reject===false && r.reason==='ok', r.reason+' '+(r.details&&r.details.deltaPct)+'%'); }

console.log('\nEXTRA — invalid_investable (category: total ok, investable ≤ 0)');
{ const r=R({ts:NOW,total:73000,investable:0}, {ts:NOW-5*M,total:73000}, {surface:'c'});
  ck('rejected invalid_investable', r.reject && r.reason==='invalid_investable', r.reason); }

console.log('\nEXTRA — capital-flow window: flow 9 min away counts, 11 min away does not');
const WIN = 10*60e3;   // _AURIX_SNAPSHOT_GUARD.flowWindowMs
FLOWS=[{ts:NOW-9*M, kind:'deposit', amountUSD:13000}];
ck('flow within ±10min detected', sb._aurixHasCapitalFlowNear(NOW, WIN)===true);
FLOWS=[{ts:NOW-11*M, kind:'deposit', amountUSD:13000}];
ck('flow outside ±10min not detected', sb._aurixHasCapitalFlowNear(NOW, WIN)===false);

console.log('\nRESULT:', ok?'ALL CASES PASS ✓ (shipped _shouldRejectSnapshot)':'FAIL ✗');
process.exit(ok?0:1);
