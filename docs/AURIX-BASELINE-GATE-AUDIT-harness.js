'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-BASELINE-GATE-AUDIT-harness — P0 read-only trace of WHY getValidReturnBaseline(range) is invalid
// ════════════════════════════════════════════════════════════════════════════
// The UI/render is confirmed correct: the badge faithfully shows "Calculando…" because
// getValidReturnBaseline("24h") returns invalid. window.aurixBaselineGateTrace(range) replays BOTH ordered
// gates WITHOUT modifying them — (A) the LOCAL baseline chain (via opts.raw) and (B) the authed CONSUMER
// kill-switch (_aurixSelectRemotePerformance) — and names the single check that flips baselineValid → false,
// with all 10 mandated fields. Pure read: no DOM/render/chart/gate mutation.
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function block(){ const s=app.indexOf('window.aurixBaselineGateTrace = function'); if(s<0) throw new Error('missing tracer');
  let k=app.indexOf('{',s), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(s,k); }   // exact function literal (brace-matched)
const T = block();
let pass=0,fail=0; function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} }

console.log('AURIX-BASELINE-GATE-AUDIT — trace the validation gate, mutate nothing\n');

console.log('Helper exists and replays BOTH gates read-only:');
ok('1 window.aurixBaselineGateTrace(range) defined', /window\.aurixBaselineGateTrace = function \(range\)/.test(app));
ok('2 replays the LOCAL chain via getValidReturnBaseline(range, {raw:true})', /getValidReturnBaseline\(norm, \{ raw: true \}\)/.test(T));
ok('3 reads the FINAL authed verdict via getValidReturnBaseline(range)', /const gf = getValidReturnBaseline\(norm\);/.test(T));
ok('4 replays the CONSUMER kill-switch via _aurixSelectRemotePerformance(range)', /_aurixSelectRemotePerformance\(norm\)/.test(T));

console.log('\nAll 10 mandated trace fields present:');
ok('5  (1) every validation — orderedChecks list', /orderedChecks: checks/.test(T) && /firstFailingCheck:/.test(T));
ok('6  (2) early returns / first failing — firstFailingCheck', /firstFailingCheck: \(checks\.find/.test(T));
ok('7  (3) exact invalidReason — finalInvalidReason', /finalInvalidReason = gf\.invalidReason/.test(T));
ok('8  (4) expected portfolioRevision', /expectedPortfolioRevision:/.test(T));
ok('9  (5) performance_state portfolioRevision', /performancePortfolioRevision:/.test(T));
ok('10 (6) lifecycleId comparison', /lifecycleMatch: sel \? \(sel\.expectedLifecycleId === sel\.performanceLifecycleId\)/.test(T));
ok('11 (7) baselineSnapshotId', /baselineSnapshotId: psRow \? psRow\.baselineSnapshotId/.test(T));
ok('12 (8) calculatedAt', /calculatedAt: ps \? ps\.calculatedAt/.test(T));
ok('13 (9) stale_revision_with_pending_changes evaluation', /staleRevisionWithPendingChanges: \(psRev != null && cur != null && sel\) \? \(psRev < cur && !!sel\.pendingSync\)/.test(T));
ok('14 (10) pendingSync evaluation', /pendingSync: sel \? sel\.pendingSync/.test(T));

console.log('\nDetermines the single failing condition (conclusion):');
ok('15 conclusion distinguishes remote_performance_pending vs no_remote_performance_state vs anon',
   /remote_performance_pending/.test(T) && /no_remote_performance_state/.test(T) && /ANON\/local path/.test(T));
ok('16 conclusion surfaces the underlying LOCAL writer reason for a pending performance_state',
   /the LOCAL baseline gate: ' \+ \(lc\.invalidReason/.test(T));

console.log('\nPURE READ — the tracer mutates no gate / DOM / render / chart:');
ok('17 no innerHTML / textContent / className write inside the tracer', !/innerHTML|textContent|\.className =/.test(T));
ok('18 the tracer reassigns no gate global (activeRange / remote performance state / the gate fn)',
   !/(^|[^.\w])activeRange\s*=[^=]/.test(T) && !/_aurixRemotePerformanceState\s*=[^=]/.test(T) && !/getValidReturnBaseline\s*=[^=]/.test(T));
ok('19 the gate itself is unchanged (ordered chain + kill-switch intact)',
   /else if \(windowMs < _AURIX_RETURN_MIN_HISTORY_MS\) invalidReason = 'insufficient_history';/.test(app) &&
   /const psRow = _aurixRemotePerformanceForRange\(r\);/.test(app) &&
   /out\.reason = 'stale_revision_with_real_local_mutation';/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
