'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-DOUBLE-BASELINE-EVALUATION-harness — P0 instrument every getValidReturnBaseline() call
// ════════════════════════════════════════════════════════════════════════════
// Contradiction: aurixBaselineGateTrace("24h") → baselineValid=true, then RENDER_OWNER → baselineValid=false on
// the same refresh. That is the SAME function re-evaluated at two times with different TIME-VARYING inputs
// (portfolioRevision / pendingSync / remote state). A transparent logging wrapper around getValidReturnBaseline
// records every invocation (caller, stack, range, raw, rev, lifecycleId, pendingSync, verdict, object identity)
// and a flip detector pins the valid→invalid pair + which inputs changed. Behaviour is unchanged (returns the
// core result object verbatim). window.aurixGvrbCalls(range) returns the chronological table.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
// extract the wrapper installation block
function wrapBlock(){ const s=app.indexOf('P0-DOUBLE-BASELINE-EVALUATION-AUDIT'); const a=app.indexOf('\ntry {', s); const e=app.indexOf('// RETURN-PENDING-FINAL — the premium', a);
  return app.slice(a, e>0?e:a+5000); }
const W = wrapBlock();
let pass=0,fail=0; function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} }

console.log('AURIX-DOUBLE-BASELINE-EVALUATION — chronological trace of every getValidReturnBaseline call\n');

console.log('Transparent wrapper — instruments without changing behaviour:');
ok('1 wraps the original getValidReturnBaseline (guarded, idempotent via __gvrbWrapped)',
   /const _gvrbCore = getValidReturnBaseline;/.test(W) && /getValidReturnBaseline\.__gvrbWrapped = true;/.test(W) &&
   /!getValidReturnBaseline\.__gvrbWrapped/.test(W));
ok('2 calls the core with the SAME args and RETURNS its result unchanged (same object identity → no behaviour change)',
   /const res = _gvrbCore\.call\(this, range, opts\);/.test(W) && /\n      return res;\n/.test(W));
ok('3 the original function definition is still intact (harnesses can still read it)',
   /function getValidReturnBaseline\(range, opts\)/.test(app) && /deltaPct: psRow\.displayedReturnPct/.test(fnSrc('getValidReturnBaseline')));

console.log('\nEvery mandated field is logged per call:');
ok('4  timestamp via performance.now', /performance\.now\(\)/.test(W) && /t: now,/.test(W));
ok('5  caller + caller stack', /caller: frames\[0\]/.test(W) && /stack: frames,/.test(W) && /new Error\(\)\.stack/.test(W));
ok('6  range + raw parameter', /range: \(range == null \? null : range\)/.test(W) && /raw: !!\(opts && opts\.raw\)/.test(W));
ok('7  portfolioRevision', /portfolioRevision: \(typeof _aurixCurrentRevision === 'function'\)/.test(W));
ok('8  lifecycleId', /lifecycleId: \(typeof _aurixCurrentLifecycleId === 'function'\)/.test(W));
ok('9  pendingSync', /pendingSync: \(typeof _aurixPendingSync === 'function'\)/.test(W));
ok('10 baselineValid + invalidReason + displayedReturnPct', /baselineValid: !!\(res && res\.valid\)/.test(W) && /invalidReason: res \? res\.invalidReason/.test(W) && /displayedReturnPct: \(res && res\.valid\) \? res\.deltaPct/.test(W));
ok('11 returned object identity (sameObjectAsPrevReturn)', /sameObjectAsPrevReturn: \(res === _gvrbLastRes\)/.test(W));

console.log('\nChronological table + flip detector + controls:');
ok('12 window.aurixGvrbCalls(range) returns the chronological table', /window\.aurixGvrbCalls = function/.test(W) && /table: table/.test(W));
ok('13 flip detector pins first valid=true then valid=false + which inputs changed',
   /flip = \(firstTrue && firstFalseAfter\)/.test(W) && /inputsThatChanged:/.test(W) &&
   /portfolioRevision: firstTrue\.portfolioRevision !== firstFalseAfter\.portfolioRevision/.test(W) &&
   /pendingSync: firstTrue\.pendingSync !== firstFalseAfter\.pendingSync/.test(W));
ok('14 aurixGvrbTraceOn + aurixGvrbClear controls', /window\.aurixGvrbTraceOn = function/.test(W) && /window\.aurixGvrbClear = function/.test(W));

console.log('\nFunctional — wrapper logs each call, returns core result verbatim, flip detector works:');
{
  // Load the REAL wrapper block verbatim over a core whose verdict depends on a MUTABLE pendingSync input
  // (models the real time-varying gate). No string mangling — only the surrounding scope is supplied.
  const sb = { console:{log:()=>{},table:()=>{}}, performance:{ now:(()=>{let n=0; return ()=>{n+=1; return n;};})() }, activeRange:'24h', window:{}, Date:{ now:()=>0 } };
  vm.createContext(sb);
  vm.runInContext("var _pending=false, _rev=5; function _aurixPendingSync(){return _pending;} function _aurixCurrentRevision(){return _rev;} function _aurixCurrentLifecycleId(){return 'L1';}", sb);
  vm.runInContext("var getValidReturnBaseline = function(range,opts){ return { valid: !_pending, invalidReason: _pending?'no_remote_performance_state':null, deltaPct: _pending?null:0.37, performanceSource: _pending?'pending':'remote', renderedFromRemote:!_pending }; };", sb);
  vm.runInContext(W, sb);   // installs the wrapper + window.aurixGvrbCalls, verbatim from app.js
  const r1 = vm.runInContext("getValidReturnBaseline('24h')", sb);
  vm.runInContext("_pending=true; _rev=6;", sb);
  const r2 = vm.runInContext("getValidReturnBaseline('24h')", sb);
  ok('15 call #1 returns the core object verbatim (valid=true, pct=0.37)', r1 && r1.valid===true && r1.deltaPct===0.37);
  ok('16 call #2 returns the core object verbatim (valid=false)', r2 && r2.valid===false && r2.invalidReason==='no_remote_performance_state');
  const calls = vm.runInContext("window.aurixGvrbCalls('24h')", sb);
  ok('17 the log captured BOTH evaluations chronologically', calls && calls.totalCalls===2 && calls.table[0].valid===true && calls.table[1].valid===false);
  ok('18 flip detector identifies the valid→invalid pair and that pendingSync+rev changed',
     calls.flip && calls.flip.inputsThatChanged.pendingSync==='false→true' && calls.flip.inputsThatChanged.portfolioRevision==='5→6');
}

console.log('\nNo behaviour/UI/render/chart change (audit-only):');
ok('19 renderer / holdings / chart curve untouched; the wrapper only adds logging',
   /function renderAurixInstitutionalChart\(/.test(app) && /const linePath = _wscMonotonePath\(pts\);/.test(app) &&
   !/_gvrbCore\.call\(this, range, opts\);[\s\S]{0,40}res\.valid =/.test(W));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
