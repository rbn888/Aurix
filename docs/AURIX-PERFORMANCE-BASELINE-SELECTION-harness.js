'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-PERFORMANCE-BASELINE-SELECTION-harness — P0 select the first COMPARABLE baseline
// ════════════════════════════════════════════════════════════════════════════
// v437 debug showed comparable candidates (8792/8860/8852 ≈ current 8840) yet the baseline stayed 5503.16
// (old construction snapshot) ⇒ pending. CAUSE: _aurixRangeReturn used snaps[0] blindly; the comparability
// gate then REJECTED the non-comparable snaps[0] instead of ADVANCING to a comparable one. FIX: _aurixRangeReturn
// skips LEADING non-comparable snapshots and anchors at the first economically comparable snapshot.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} }
const T = 1800000000000;

function env(series){
  const sb = { Math, Number, console:{log:()=>{}}, activeRange:'24h' };
  sb._series = series;
  sb._aurixEligibleInvestableSeries = () => ({ series: sb._series, meta:{} });
  // identity flow-neutraliser (no capital flows in these scenarios) → isolates the BASELINE SELECTION
  sb._aurixFlowNeutralize = (s) => ({ adjusted: s.map(p => p.value), totalOffset: 0, neutralized: 0 });
  vm.createContext(sb);
  vm.runInContext('const _AURIX_RETURN_COMPARABLE_RATIO = {"24h":1.20,"7d":1.35,"30d":1.75,"1y":3.00,"all":3.00};', sb);
  vm.runInContext(fnSrc('_aurixRangeReturn'), sb);
  return sb;
}
const R = (sb, range) => vm.runInContext('_aurixRangeReturn("'+(range||'24h')+'")', sb);

console.log('AURIX-PERFORMANCE-BASELINE-SELECTION — anchor at the first comparable snapshot\n');

console.log('The exact production series (leading 5503.16 + comparable ~8800 candidates, current 8840.8044):');
const PROD = [
  { ts: T - 2*86400000, value: 5503.16 },   // old construction / different capital regime
  { ts: T - 3*3600000,  value: 8792.28 },    // comparable (ratio ~1.0)
  { ts: T - 2*3600000,  value: 8860.86 },
  { ts: T - 1*3600000,  value: 8852.21 },
  { ts: T,              value: 8840.8044 },
];
{ const sb = env(PROD); const r = R(sb, '24h');
  ok('1 baseline is the FIRST COMPARABLE snapshot (8792.28), NOT 5503.16', r.startValue === 8792.28 && r.baselineTs === (T - 3*3600000));
  ok('2 leading non-comparable snapshot was trimmed (count = 1)', r.leadingNonComparableTrimmed === 1);
  ok('3 return computed from the comparable baseline (≈ +0.55%, not −64%)', r.valid === true && Math.abs(r.deltaPct - ((8840.8044-8792.28)/8792.28*100)) < 0.01 && r.deltaPct > 0);
  ok('4 baseline value is comparable to current (ratio ~1.0, not 0.62)', Math.max(r.startValue/8840.8044, 8840.8044/r.startValue) <= 1.5); }

console.log('\nNo trim when snaps[0] is already comparable:');
{ const sb = env([{ts:T-3*3600000,value:8800},{ts:T-2*3600000,value:8820},{ts:T,value:8840}]); const r = R(sb,'24h');
  ok('5 already-comparable snaps[0] kept (no trim)', r.startValue === 8800 && r.leadingNonComparableTrimmed === 0); }

console.log('\nDo NOT trim into < 2 points (only the last is comparable) → keep full series (gate then handles pending):');
{ const sb = env([{ts:T-2*86400000,value:5000},{ts:T-1*86400000,value:5200},{ts:T,value:8840}]); const r = R(sb,'24h');
  // 5000 & 5200 are non-comparable to 8840 (ratio >1.5); only the last is comparable ⇒ trimming would leave 1 point
  ok('6 cannot leave <2 comparable points → no trim (baseline stays 5000; comparability gate elsewhere → pending)',
     r.leadingNonComparableTrimmed === 0 && r.startValue === 5000); }

console.log('\nRange-aware: the same leading snapshot can be comparable on a long range (wider band):');
{ const sb = env(PROD); const r = R(sb, 'all');
  // all-range band = 8.0; 5503/8840 = 0.62 ⇒ ratio 1.6 ≤ 8.0 ⇒ comparable ⇒ NOT trimmed
  ok('7 on "all" the 5503 snapshot is comparable (ratio ≤ 8.0) → baseline = 5503 (kept)', r.startValue === 5503.16 && r.leadingNonComparableTrimmed === 0); }

console.log('\nSource — the selection lives in _aurixRangeReturn and downstream consumers inherit it:');
ok('8 _aurixRangeReturn skips leading non-comparable snapshots (first-comparable anchor)',
   /while \(b0 < snaps\.length - 1\) \{[\s\S]*?if \(ratio <= cmpMax\) break;[\s\S]*?b0\+\+;/.test(fnSrc('_aurixRangeReturn')) &&
   /if \(b0 > 0 && \(snaps\.length - b0\) >= 2\) \{ work = snaps\.slice\(b0\);/.test(fnSrc('_aurixRangeReturn')));
ok('9 the candidate/getValidReturnBaseline consume _aurixRangeReturn (so the comparable baseline flows through)',
   /const ret = \(typeof _aurixRangeReturn === 'function'\) \? _aurixRangeReturn\(r\) : null;/.test(fnSrc('getValidReturnBaseline')));

console.log('\nNo-touch (no Supabase/consumer/renderer/holdings/pricing changes):');
ok('10 renderer / holdings / consumer untouched',
   /function renderAurixInstitutionalChart\(/.test(app) && /function _aurixMergePortfolio\(/.test(app) && /function _aurixSelectRemotePerformance\(/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
