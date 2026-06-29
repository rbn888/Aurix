'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-UI-RENDER-PENDING-REPAINT-harness — P0 UI render trigger (data was ready, DOM stale)
// ════════════════════════════════════════════════════════════════════════════
// Data layer verified ready (returnState:"ready", displayedReturnPct:0.3763, renderedFromRemote:true) yet the
// UI rendered "Calculando…". CAUSE: the return badges are gated on getValidReturnBaseline().valid and were
// last painted while pending; _aurixResyncFromRemote only repaints inside the HOLDINGS apply:"remote" branch,
// so when performance_state was adopted on an apply:"local" reconcile, nothing repainted → stale label.
// FIX (render trigger only — no calc/baseline/persistence/performance_state/consumer-logic change): repaint
// the return surfaces after _mergeRemoteState whenever performance_state changed, regardless of apply.
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='async function '+name+'('; let i=app.indexOf(s); if(i<0) i=app.indexOf('function '+name+'('); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} }
const R = fnSrc('_aurixResyncFromRemote');

console.log('AURIX-UI-RENDER-PENDING-REPAINT — repaint return badges when performance_state arrives on apply:"local"\n');

console.log('The reconcile captures the performance_state fingerprint across _mergeRemoteState:');
ok('1 fingerprint captured BEFORE and AFTER the merge (revision:calculatedAt:lifecycleId)',
   /_psFpBefore = p \? \(\(p\.portfolioRevision \|\| 0\) \+ ':' \+ \(p\.calculatedAt \|\| 0\) \+ ':' \+ \(p\.lifecycleId \|\| ''\)\)/.test(R) &&
   /_psFpAfter = p \? \(\(p\.portfolioRevision \|\| 0\)/.test(R) &&
   /const _psChanged = _psFpBefore !== _psFpAfter;/.test(R));
ok('2 the BEFORE capture precedes _mergeRemoteState; AFTER follows it',
   R.indexOf('_psFpBefore') < R.indexOf('_mergeRemoteState(remote)') && R.indexOf('_mergeRemoteState(remote)') < R.indexOf('_psFpAfter'));

console.log('\nThe fix: an apply:"local" reconcile repaints the return surfaces when performance_state changed:');
ok('3 else-if (_psChanged) branch exists (covers apply !== "remote")',
   /\} else if \(_psChanged\) \{/.test(R));
ok('4 it repaints the SAME return surfaces (render + perf module + mobile lite)',
   (function(){ const i=R.indexOf('} else if (_psChanged) {'); const blk=R.slice(i, i+1100);
     return /render\(false\)/.test(blk) && /_dshRenderPerfSnapshot\(\)/.test(blk) && /scheduleAurixMobileLite\(/.test(blk); })());
ok('5 emits a traceable marker', /\[SYNC\]\[PERF_STATE_REPAINT\]/.test(R));

console.log('\nNo business-logic / calculation / consumer-gate change (only the render TRIGGER added):');
ok('6 the badges still gate on getValidReturnBaseline().valid → pending markup unchanged (the "Calculando…" source)',
   /el\.innerHTML = _aurixReturnPendingHTML\(\); el\.className = 'chart-change calculating';/.test(fnSrc('_aurixMobileSetPerfIndicator')) &&
   /changeEl\.innerHTML = _aurixReturnPendingHTML\(\);/.test(app));
ok('7 getValidReturnBaseline + performance_state read path + _aurixRangeReturn baseline selection untouched by this patch',
   /function getValidReturnBaseline\(range, opts\)/.test(app) &&
   /_aurixRemotePerformanceState = \(remoteRow && remoteRow\.performance_state/.test(fnSrc('_mergeRemoteState')) &&
   /leadingNonComparableTrimmed/.test(fnSrc('_aurixRangeReturn')));
ok('8 the apply:"remote" branch (existing holdings repaint) is preserved',
   /if \(decision\.apply === 'remote' && isValidPortfolioData\(remote\)\) \{/.test(R) && /render\(true\)/.test(R));

console.log('\nNo-touch (renderer internals / holdings / pricing):');
ok('9 renderer + holdings merge + pricing untouched',
   /function renderAurixInstitutionalChart\(/.test(app) && /function _aurixMergePortfolio\(/.test(app) && /reason: 'invalid_total'/.test(fnSrc('_shouldRejectSnapshot')));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
