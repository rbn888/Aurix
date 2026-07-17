'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MULTI-RANGE-INTEGRITY-CONTRACT-harness — SPEC CHART-INTEGRITY.Phase 7
// ════════════════════════════════════════════════════════════════════════════
// Certifies 24H/7D/30D/1Y/ALL all obey the SAME integrity contract: a confirmed number is withheld while
// backend hydration is in progress and while the endpoint valuation is incomplete, and published only once
// both are satisfied — identically for every range. Covers regression category H.
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

const sb = { Math, Number, JSON, Array, isFinite, Infinity, String, console:{}, window:{} };
vm.createContext(sb);
vm.runInContext(konstSrc('_AURIX_PUBLICATION_STATE'), sb);
vm.runInContext(konstSrc('_AURIX_CHART_RETURN_CONTRACT_UNIFICATION'), sb);
['_aurixResolvePublicationReadiness','_aurixResolveChartReturnContract'].forEach(n => vm.runInContext(fnSrc(n), sb));
const RANGES = ['24h','7d','30d','1y','all'];
const chartFor = () => ({ range:'r', returnState:'ok', badgeReturnPct:1.23, returnValue:74, state:'ready', points:[{ts:1,value:6000},{ts:2,value:6074}] });
const run = (range, over) => { sb.__x = Object.assign({ chart: chartFor(), backendEnabled:true }, over); return vm.runInContext('_aurixResolveChartReturnContract(null, '+JSON.stringify(range)+', __x)', sb); };

console.log('AURIX-MULTI-RANGE-INTEGRITY-CONTRACT — SPEC CHART-INTEGRITY.Phase 7\n');
console.log('Hydration LOADING ⇒ every range withholds the number:');
RANGES.forEach(r => ok(`  ${r}: withheld (calculating) while hydrating`, (o=>o.state==='calculating' && o.returnPct===null)(run(r, { hydrationState:'loading' }))));
console.log('Endpoint valuation INCOMPLETE ⇒ every range withholds:');
RANGES.forEach(r => ok(`  ${r}: withheld while valuation incomplete`, (o=>o.state==='calculating')(run(r, { hydrationState:'ready', valuationComplete:false }))));
console.log('Hydration READY + complete ⇒ every range publishes the same number:');
RANGES.forEach(r => ok(`  ${r}: publishes +1.23%`, (o=>o.state==='ok' && o.returnPct===1.23 && o.badgeEligible===true)(run(r, { hydrationState:'ready' }))));
// invariance: the publication state is identical across ranges for identical readiness inputs
{ const states = RANGES.map(r => run(r, { hydrationState:'loading' }).publicationState);
  ok('publication state is range-invariant (all HYDRATING_HISTORY)', states.every(s => s==='HYDRATING_HISTORY'), states.join(',')); }

console.log('\n' + (fail? ('FAIL — '+pass+' passed, '+fail+' failed') : ('PASS — '+pass+' passed, 0 failed  —  MULTI-RANGE INTEGRITY CERTIFIED ✓')));
if (fail) process.exit(1);
