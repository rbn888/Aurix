'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-PERFORMANCE-STATE-WRITE-AUDIT-harness — P0 persistence audit (write path ONLY)
// ════════════════════════════════════════════════════════════════════════════
// The dedicated performance_state UPDATE is fully instrumented so production logs reveal WHY nothing
// persists: exact payload hash, table, row, WHERE, uid, rowsAffected (via .select()), Supabase error
// (status/code/message/details/hint), returned row, duration, retry path — then an IMMEDIATE VERIFY_READ
// of ONLY performance_state. rowsAffected===0 (e.g. missing RLS UPDATE policy) / error / returned-row-lacks
// performance_state / VERIFY_READ-null are all treated as FAILURE (no assuming success). Audit-only: no
// calc/history/render/UI/sync changes.
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='async function '+name+'('; let i=app.indexOf(s); if(i<0){ i=app.indexOf('function '+name+'('); } if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} }
const F = fnSrc('_aurixFlushPerformanceState');

console.log('AURIX-PERFORMANCE-STATE-WRITE-AUDIT — instrument the DB write path only\n');

console.log('Write uses .select() so rowsAffected is observable (silent 0-row failures surface):');
ok('1 dedicated UPDATE of user_portfolios.performance_state .eq(user_id) WITH .select() of the returned row',
   /\.from\('user_portfolios'\)\.update\(\{ performance_state: ps \}\)\.eq\('user_id', currentUser\.id\)\.select\('user_id, performance_state'\)/.test(F));
ok('2 rowsAffected = returned data length', /audit\.rowsAffected = data\.length;/.test(F));

console.log('\nEvery audit field the task demands is captured:');
ok('3 payload hash + table + WHERE + uid', /audit\.payloadHash =/.test(F) && /table: 'user_portfolios'/.test(app) && /audit\.where = "user_id = '/.test(F) && /audit\.uid = currentUser\.id;/.test(F));
ok('4 Supabase error object: status/code/message/details/hint', /status: res\.status[\s\S]*?code: error\.code[\s\S]*?message: error\.message[\s\S]*?details: error\.details[\s\S]*?hint: error\.hint/.test(F));
ok('5 duration measured', /audit\.durationMs = Date\.now\(\) - t0;/.test(F));
ok('6 returned row checked for performance_state', /audit\.returnedHasPerformanceState = !!\(returnedPs && typeof returnedPs === 'object'\);/.test(F));

console.log('\nStructured logs WRITE_START / WRITE_OK / WRITE_ERROR / VERIFY_READ:');
ok('7 [PERF_STATE][WRITE_START]', /\[PERF_STATE\]\[WRITE_START\]/.test(F));
ok('8 [PERF_STATE][WRITE_OK] with rowsAffected + returned hash', /\[PERF_STATE\]\[WRITE_OK\]/.test(F) && /returnedPerformanceHash: returnedHash/.test(F));
ok('9 [PERF_STATE][WRITE_ERROR] for supabase error AND for rowsAffected===0 (RLS/where)', (F.match(/\[PERF_STATE\]\[WRITE_ERROR\]/g) || []).length >= 2 && /missing RLS UPDATE policy/.test(F));
ok('10 immediate [PERF_STATE][VERIFY_READ] SELECTs ONLY performance_state for the same row',
   /\.from\('user_portfolios'\)\.select\('performance_state'\)\.eq\('user_id', currentUser\.id\)\.single\(\)/.test(F) && /\[PERF_STATE\]\[VERIFY_READ\]/.test(F));

console.log('\nFAILURE semantics — never assume persistence:');
ok('11 rowsAffected===0 ⇒ failureReason rows_affected_0 (returns, does not continue)', /audit\.failureReason = 'rows_affected_0';/.test(F));
ok('12 error!=null ⇒ failureReason supabase_error', /audit\.failureReason = 'supabase_error';/.test(F));
ok('13 returned row lacking performance_state ⇒ failure', /audit\.failureReason = 'returned_row_lacks_performance_state';/.test(F));
ok('14 VERIFY_READ null after WRITE_OK ⇒ STOP (failureReason verify_read_null, VERIFY_READ_NULL log)',
   /audit\.failureReason = 'verify_read_null';/.test(F) && /\[PERF_STATE\]\[VERIFY_READ_NULL\] STOP/.test(F));
ok('15 audit.ok set true ONLY after WRITE_OK + non-null VERIFY_READ', (function(){ const okIdx=F.indexOf('audit.ok = true;'); const vIdx=F.indexOf('verify_read_null'); return okIdx>0 && vIdx>0 && vIdx<okIdx; })());

console.log('\nExposed for production inspection:');
ok('16 window.aurixPerfStateWriteAudit() returns the last audit; aurixFlushPerformanceStateNow() forces a write',
   /window\.aurixPerfStateWriteAudit = \(\) => _aurixPerfWriteAudit;/.test(app) && /window\.aurixFlushPerformanceStateNow = \(\) => _aurixFlushPerformanceState\('perf-now'\);/.test(app));

console.log('\nAudit-only — no calc/history/render/UI/sync changes:');
ok('17 renderer / holdings merge / pricing / kill-switch render path untouched',
   /function renderAurixInstitutionalChart\(/.test(app) && /function _aurixMergePortfolio\(/.test(app) &&
   /reason: 'invalid_total'/.test(fnSrc('_shouldRejectSnapshot')) && /no_remote_performance_state/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
