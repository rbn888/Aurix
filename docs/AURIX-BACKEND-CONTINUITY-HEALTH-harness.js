'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-BACKEND-CONTINUITY-HEALTH-harness — SPEC CHART-INTEGRITY.LB-3
// ════════════════════════════════════════════════════════════════════════════
// Certifies the backend-continuity health classifier distinguishes EMPTY new-user vs FAILED request vs
// DEAD/late cron, and never treats an unknown as healthy. Covers regression category E (dead/stale cron)
// and the offline/unauthorized paths (F). The client relies on this to degrade safely instead of silently
// depending on an invisible external scheduler.
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

const sb = { Math, Number, isFinite, console:{}, };
vm.createContext(sb);
['_AURIX_BACKEND_HEALTH','_AURIX_BACKEND_CADENCE_MS','_AURIX_BACKEND_LATE_FACTOR','_AURIX_BACKEND_STALE_FACTOR'].forEach(c=>vm.runInContext(konstSrc(c), sb));
vm.runInContext(fnSrc('_aurixBackendHealth'), sb);
const H = inp => { sb.__i = inp; return vm.runInContext('_aurixBackendHealth(__i)', sb); };
const NOW = 1800000000000, MIN = 60000, CAD = 15*MIN;

console.log('AURIX-BACKEND-CONTINUITY-HEALTH — SPEC CHART-INTEGRITY.LB-3\n');
ok('1 fresh (≤2 cadences old) ⇒ HEALTHY', H({ clientReady:true, fetchStatus:'ok', rows:100, latestTs:NOW-20*MIN, now:NOW }).status==='HEALTHY');
ok('2 behind (>2, ≤8 cadences) ⇒ LATE', H({ clientReady:true, fetchStatus:'ok', rows:100, latestTs:NOW-60*MIN, now:NOW }).status==='LATE');
ok('3 [E] very old (>8 cadences) ⇒ STALE (cron late/dead)', H({ clientReady:true, fetchStatus:'ok', rows:100, latestTs:NOW-5*3600*1000, now:NOW }).status==='STALE');
ok('4 empty table (rows 0, authed) ⇒ EMPTY_NEW_USER (NOT stale, NOT healthy)', H({ clientReady:true, fetchStatus:'ok', rows:0, now:NOW }).status==='EMPTY_NEW_USER');
ok('5 [F] fetch error ⇒ UNAVAILABLE', H({ clientReady:true, fetchStatus:'error', now:NOW }).status==='UNAVAILABLE');
ok('6 [F] RLS/auth denied ⇒ UNAUTHORIZED', H({ clientReady:true, fetchStatus:'unauthorized', now:NOW }).status==='UNAUTHORIZED');
ok('7 client not ready ⇒ UNKNOWN (never HEALTHY by default)', H({ clientReady:false }).status==='UNKNOWN');
ok('8 rows present but no timestamp ⇒ UNKNOWN', H({ clientReady:true, fetchStatus:'ok', rows:5, latestTs:null, now:NOW }).status==='UNKNOWN');
ok('9 exactly at 2-cadence boundary ⇒ HEALTHY (inclusive)', H({ clientReady:true, fetchStatus:'ok', rows:1, latestTs:NOW-2*CAD, now:NOW }).status==='HEALTHY');
ok('10 just past 8-cadence boundary ⇒ STALE', H({ clientReady:true, fetchStatus:'ok', rows:1, latestTs:NOW-(8*CAD+1), now:NOW }).status==='STALE');
ok('11 default thresholds independent of custom cadence override', H({ clientReady:true, fetchStatus:'ok', rows:1, latestTs:NOW-3*MIN, now:NOW, cadenceMs:MIN, staleFactor:2 }).status==='STALE');
// core invariant: an unknown/degraded backend must NEVER be reported HEALTHY
const nonHealthy = ['UNKNOWN','UNAVAILABLE','UNAUTHORIZED','STALE','EMPTY_NEW_USER'];
ok('12 no degraded input is ever reported HEALTHY', [H({clientReady:false}), H({clientReady:true,fetchStatus:'error',now:NOW}), H({clientReady:true,fetchStatus:'ok',rows:0,now:NOW})].every(h=>nonHealthy.includes(h.status)));

console.log('\n' + (fail? ('FAIL — '+pass+' passed, '+fail+' failed') : ('PASS — '+pass+' passed, 0 failed  —  LB-3 CERTIFIED ✓')));
if (fail) process.exit(1);
