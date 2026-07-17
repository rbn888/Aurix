'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-PUBLICATION-READINESS-CONTRACT-harness — SPEC CHART-INTEGRITY.LB-2
// ════════════════════════════════════════════════════════════════════════════
// Regression for the forensic P0: a confirmed return could publish on cold start BEFORE backend hydration
// finished, then CHANGE once merged. Certifies:
//   • _aurixResolvePublicationReadiness ordered gates (valuation → hydration → generation).
//   • _aurixResolveChartReturnContract withholds a number (state 'calculating') while hydration is
//     idle/loading/failed, and only publishes 'ok' once hydration is 'ready' — with the SAME healthy chart.
// Covers regression category C (delayed backend hydration).
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
function konstSrc(name){ const s='const '+name+' ='; const i=app.indexOf(s); if(i<0) throw new Error('missing const '+name);
  let k=i, depth=0, started=false; for(;k<app.length;k++){ const c=app[k]; if(c==='('||c==='{'||c==='[') {depth++;started=true;} else if(c===')'||c==='}'||c===']') depth--; else if(c===';'&&(!started||depth===0)) { k++; break; } }
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c,info){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(info?'  ['+info+']':''));} }

const sb = { Math, Number, JSON, Array, isFinite, Infinity, String, console:{warn:()=>{},log:()=>{},debug:()=>{}}, window:{} };
vm.createContext(sb);
vm.runInContext(konstSrc('_AURIX_PUBLICATION_STATE'), sb);
vm.runInContext(konstSrc('_AURIX_CHART_RETURN_CONTRACT_UNIFICATION'), sb);
['_aurixResolvePublicationReadiness','_aurixResolveChartReturnContract'].forEach(n => vm.runInContext(fnSrc(n), sb));
const ready = ctx => { sb.__c = ctx; return vm.runInContext('_aurixResolvePublicationReadiness(__c)', sb); };
const contract = (ctx) => { sb.__x = ctx; return vm.runInContext('_aurixResolveChartReturnContract(null, "24h", __x)', sb); };

console.log('AURIX-PUBLICATION-READINESS-CONTRACT — SPEC CHART-INTEGRITY.LB-2\n');

// ── Pure resolver ──
console.log('Readiness resolver (ordered gates):');
ok('1 default (no inputs) ⇒ READY/publishable', (r=>r.publishable&&r.state==='READY')(ready({})));
ok('2 valuationComplete:false ⇒ VALUATION_INCOMPLETE, not publishable (highest priority)', (r=>!r.publishable&&r.state==='VALUATION_INCOMPLETE')(ready({ valuationComplete:false, backendEnabled:true, hydrationState:'ready' })));
ok('3 backend enabled + idle ⇒ HYDRATING_HISTORY, not publishable', (r=>!r.publishable&&r.state==='HYDRATING_HISTORY')(ready({ backendEnabled:true, hydrationState:'idle' })));
ok('4 backend enabled + loading ⇒ HYDRATING_HISTORY, not publishable', (r=>!r.publishable&&r.state==='HYDRATING_HISTORY')(ready({ backendEnabled:true, hydrationState:'loading' })));
ok('5 backend enabled + failed ⇒ STALE_HISTORY, not publishable (safe degradation)', (r=>!r.publishable&&r.state==='STALE_HISTORY')(ready({ backendEnabled:true, hydrationState:'failed' })));
ok('6 backend enabled + ready ⇒ READY/publishable', (r=>r.publishable&&r.state==='READY')(ready({ backendEnabled:true, hydrationState:'ready' })));
ok('7 backend DISABLED + loading ⇒ READY (flag off skips hydration gate)', (r=>r.publishable&&r.state==='READY')(ready({ backendEnabled:false, hydrationState:'loading' })));
ok('8 generationConsistent:false ⇒ RECONCILING_HISTORY, not publishable', (r=>!r.publishable&&r.state==='RECONCILING_HISTORY')(ready({ backendEnabled:true, hydrationState:'ready', generationConsistent:false })));

// ── Wired into the return contract (a healthy, trustworthy chart) ──
console.log('\nReturn contract withholds a number until hydration settles (same healthy chart):');
const healthyChart = { chart: { range:'24h', returnState:'ok', badgeReturnPct:-0.46, returnValue:-27.6, state:'ready',
  points:[{ts:1,value:6000},{ts:2,value:5972}] }, backendEnabled:true };
ok('9  [C] hydration LOADING ⇒ state calculating (no number published)', (o=>o.state==='calculating' && o.reason==='not_publication_ready:HYDRATING_HISTORY' && o.returnPct===null)(contract(Object.assign({}, healthyChart, { hydrationState:'loading' }))), JSON.stringify(contract(Object.assign({}, healthyChart, { hydrationState:'loading' }))));
ok('10 [C] hydration IDLE ⇒ calculating (no number)', (o=>o.state==='calculating' && o.returnPct===null)(contract(Object.assign({}, healthyChart, { hydrationState:'idle' }))));
ok('11 [C] hydration FAILED ⇒ calculating (STALE, safe degradation)', (o=>o.state==='calculating' && o.reason==='not_publication_ready:STALE_HISTORY')(contract(Object.assign({}, healthyChart, { hydrationState:'failed' }))));
ok('12 [C] hydration READY ⇒ publishes the number (state ok, -0.46%)', (o=>o.state==='ok' && o.returnPct===-0.46 && o.badgeEligible===true)(contract(Object.assign({}, healthyChart, { hydrationState:'ready' }))), JSON.stringify(contract(Object.assign({}, healthyChart, { hydrationState:'ready' }))));
ok('13 endpoint valuation incomplete ⇒ calculating even when hydration ready', (o=>o.state==='calculating' && o.reason==='not_publication_ready:VALUATION_INCOMPLETE')(contract(Object.assign({}, healthyChart, { hydrationState:'ready', valuationComplete:false }))));
ok('14 backend disabled ⇒ publishes regardless of hydration (byte-identical legacy)', (o=>o.state==='ok' && o.returnPct===-0.46)(contract(Object.assign({}, healthyChart, { backendEnabled:false, hydrationState:'loading' }))));
// no-context path (harness/default): must still publish a healthy chart
ok('15 no readiness context (default) ⇒ publishes (backward compatible)', (o=>o.state==='ok' && o.returnPct===-0.46)(contract({ chart: healthyChart.chart })));

console.log('\n' + (fail? ('FAIL — '+pass+' passed, '+fail+' failed') : ('PASS — '+pass+' passed, 0 failed  —  LB-2 CERTIFIED ✓')));
if (fail) process.exit(1);
