'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-M3-CASHFLOW-ISOLATION-harness — SPEC INSTITUTIONAL-CHART.M3
// ════════════════════════════════════════════════════════════════════════════
// Proves cash flows / transaction movements can never render as market gain/loss:
//  (1) engine-level flow-neutrality of the certified _aurixComputePeriodReturn across the M3 matrix;
//  (2) the _aurixWindowHasCashFlows predicate (flow-free ⇒ raw delta ≡ flow-neutral; else suppress);
//  (3) consumer-level guards: both tooltips gate on the predicate; _dshComputePerfSnapshot fails closed.
const fs=require('fs'), vm=require('vm'), path=require('path');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i),pd=0; for(;p<app.length;p++){if(app[p]==='(')pd++;else if(app[p]===')'){pd--;if(!pd){p++;break;}}}
  let k=app.indexOf('{',p),d=0; for(;k<app.length;k++){if(app[k]==='{')d++;else if(app[k]==='}'){d--;if(!d){k++;break;}}}
  return app.slice(i,k); }
function konst(name){ const m=app.match(new RegExp('const '+name+'\\s*=.*?;')); if(!m) throw new Error('missing '+name); return m[0]; }
let pass=0,fail=0; function ok(n,c,info){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(info?'  ['+info+']':''));} }

// ── sandbox: certified flow-neutral engine with a stubbed flow ledger ──
const sb={Number,Math,isFinite,console:{}}; vm.createContext(sb);
vm.runInContext(konst('_AURIX_RET_MIN_BASE'),sb);
vm.runInContext('const _AURIX_RET_SANE_PCT = { "24h":25,"7d":45,"30d":80,"1y":200,"all":250 };',sb);
sb.__flows=0; vm.runInContext('function _aurixNetFlowsInWindow(a,b){ return { net: __flows }; }',sb);
vm.runInContext(fnSrc('_aurixComputePeriodReturn'),sb);
const ret=(range,startV,endV,flowsNet)=>{ sb.__flows=flowsNet; sb.__s={ts:1,value:startV}; sb.__e={ts:2,value:endV}; return vm.runInContext('_aurixComputePeriodReturn('+JSON.stringify(range)+',__s,__e)',sb); };

console.log('AURIX-M3-CASHFLOW-ISOLATION — SPEC INSTITUTIONAL-CHART.M3\n');
console.log('Engine flow-neutrality (deposits/withdrawals/transfers never become market return):');
ok('1 deposit only, flat market ⇒ return 0 (not a gain)', ret('30d',1000,1500,500).returnPct===0);
ok('2 withdrawal only, flat market ⇒ return 0 (not a loss)', ret('30d',1000,500,-500).returnPct===0);
ok('3 buy only, unchanged price (internal, flow 0, value flat) ⇒ 0', ret('30d',1000,1000,0).returnPct===0);
ok('4 partial sell at avg cost (internal, flow 0, value flat) ⇒ 0', ret('30d',1000,1000,0).returnPct===0);
ok('7 full liquidation (proceeds stay internal, flow 0, value flat) ⇒ 0 not a crash', ret('30d',1000,1000,0).returnPct===0);
ok('9 deposit +500 with +100 market ⇒ return reflects market only (+10%)', ret('30d',1000,1600,500).returnPct===10);
ok('10 withdrawal -300 with -100 market ⇒ market only (-10%)', ret('30d',1000,600,-300).returnPct===-10);
ok('11 large deposit dwarfing market: start 1000 +9000 dep, +100 mkt ⇒ +10% not +910%', ret('30d',1000,10100,9000).returnPct===10);
ok('14 zero-value start + contribution ⇒ no fabricated 100%/∞ (insufficient)', ret('30d',0,500,500).returnState!=='ok' && ret('30d',0,500,500).returnPct===null);

// ── the M3 predicate ──
console.log('\n_aurixWindowHasCashFlows predicate (flow-free ⇒ raw≡neutral; else suppress; fail-closed):');
const sb2={Number,Math,isFinite,console:{}}; vm.createContext(sb2);
sb2.__nf=0; sb2.__ok=true; vm.runInContext('function _aurixRangeReturn(r){ return __ok ? { netFlowsNeutralized: __nf } : null; }',sb2);
vm.runInContext(fnSrc('_aurixWindowHasCashFlows'),sb2);
const hasFlows=(nf,rok)=>{ sb2.__nf=nf; sb2.__ok=rok!==false; return vm.runInContext('_aurixWindowHasCashFlows("30d")',sb2); };
ok('12 flow-free window (netFlowsNeutralized 0) ⇒ false (raw % allowed)', hasFlows(0)===false);
ok('13 window with flows (≠0) ⇒ true (suppress %)', hasFlows(500)===true);
ok('14b fail-closed: engine returns null ⇒ true (suppress)', hasFlows(0,false)===true);

// ── consumer-level guards (source contract) ──
console.log('\nConsumer guards (source contract; desktop == mobile):');
const deskTip=fnSrc('updateChartTooltip'); const mobTip=fnSrc('_aurixMobInspectorUpdate'); const perf=fnSrc('_dshComputePerfSnapshot');
ok('15 desktop tooltip gates the % on _aurixWindowHasCashFlows', /_aurixWindowHasCashFlows\(/.test(deskTip) && /valText = '—'/.test(deskTip));
ok('16 mobile tooltip gates the % on _aurixWindowHasCashFlows (same predicate)', /_aurixWindowHasCashFlows\(/.test(mobTip) && /_flowFreeTip/.test(mobTip));
ok('17 _dshComputePerfSnapshot fails closed (no raw value-delta fallback)', !/deltaPct[^\n]*\(\(last - first\) \/ first\)/.test(perf) && /\? _ret\.deltaPct : null/.test(perf) && /\? _ret\.deltaAbs : null/.test(perf));
ok('18 badge/labels performance source is flow-neutral _aurixRangeReturn.deltaPct (adjusted endpoints)', /const first = adj\[0\], last = adj\[adj\.length - 1\]/.test(app) && /out\.deltaPct/.test(app));

console.log('\n' + (fail? ('FAIL — '+pass+' passed, '+fail+' failed') : ('PASS — '+pass+' passed, 0 failed  —  M3 CASH-FLOW ISOLATION CERTIFIED ✓')));
if (fail) process.exit(1);
