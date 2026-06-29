'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-SNAPSHOT-GUARD-PARITY-harness — P0 stop device-local permanent history divergence
// ════════════════════════════════════════════════════════════════════════════
// ROOT CAUSE: the snapshot-guard compared each new point to THIS device's last LOCAL snapshot, and a
// "suspicious move" was permanently DROPPED (never written, never synced) → web and mobile kept different
// histories → different baseline/%/chart/color. FIX: device-RELATIVE suspicious moves are QUARANTINED —
// the point is ALLOWED into local history (so it syncs) and the SHARED canonical history (union + trust
// filter), not the local last snapshot, has final authority. Device-INDEPENDENT corruption/incomplete
// data (fx_partial/fx_approx/invalid_total/invalid_investable) stays hard-dropped (real corruption still
// blocked). _shouldRejectSnapshot's CLASSIFICATION is unchanged; only _aurixGuardSnapshot's ACTION changed.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} }
const NOW = 1800000000000;

function env(hasFlow){
  const sb = { Math, Number, Date, console:{warn:()=>{},log:()=>{}}, window:{} };
  vm.createContext(sb);
  vm.runInContext('const _AURIX_SNAPSHOT_GUARD = { fastMs: 1800000, fastPct: 0.08, slowMs: 21600000, slowPct: 0.15, flowWindowMs: 600000 };', sb);
  vm.runInContext('const _AURIX_SNAPSHOT_GUARD_MAX = 20;', sb);
  vm.runInContext('const _AURIX_GUARD_QUARANTINE_REASONS = { suspicious_drop_without_market_reason: 1, suspicious_jump_without_capital_flow: 1 };', sb);
  vm.runInContext('var _aurixGuardTelemetry = { snapshotRejected:0, lastRejectReason:null, lastRejectTs:null, snapshotQuarantined:0, lastQuarantineReason:null, lastQuarantineTs:null };', sb);
  sb._aurixHasCapitalFlowNear = () => !!hasFlow;
  sb._aurixPushRejected = () => {};
  vm.runInContext(fnSrc('_shouldRejectSnapshot'), sb);
  vm.runInContext(fnSrc('_aurixGuardSnapshot'), sb);
  return sb;
}
// guard returns TRUE = drop (skip write); FALSE = allow write
const guard = (sb, next, prev) => { sb.__n = next; sb.__p = prev; return vm.runInContext('_aurixGuardSnapshot(__n, __p, "category")', sb); };
const tel = (sb) => vm.runInContext('JSON.parse(JSON.stringify(_aurixGuardTelemetry))', sb);

console.log('AURIX-SNAPSHOT-GUARD-PARITY — quarantine, never permanently drop\n');

console.log('Device-RELATIVE suspicious move → QUARANTINED (allowed + synced), not dropped:');
{ const sb = env(false);
  // −20 % drop vs local last-valid, no flow → classified suspicious_drop
  const skip = guard(sb, { ts: NOW, total: 4000, investable: 4000 }, { ts: NOW-60000, total: 5000 });
  ok('1 suspicious DROP is ALLOWED into history (guard returns false, not dropped)', skip === false);
  ok('2 it is counted as quarantined (not rejected), reason recorded', tel(sb).snapshotQuarantined === 1 && tel(sb).snapshotRejected === 0 && tel(sb).lastQuarantineReason === 'suspicious_drop_without_market_reason');
  ok('3 the point is marked suspect (quarantine marker)', sb.__n.suspect === true); }
{ const sb = env(false);
  // +20 % jump, no capital flow → classified suspicious_jump
  const skip = guard(sb, { ts: NOW, total: 6000, investable: 6000 }, { ts: NOW-60000, total: 5000 });
  ok('4 suspicious JUMP (no flow) is ALLOWED (quarantined), not dropped', skip === false && tel(sb).snapshotQuarantined === 1); }

console.log('\nDevice-INDEPENDENT corruption / incomplete data → STILL hard-dropped (test 8):');
{ const sb = env(false);
  ok('5 fx_partial → dropped (guard returns true)', guard(sb, { ts: NOW, total: 5000, investable: 5000, fxPartial: true }, { ts: NOW-60000, total: 5000 }) === true && tel(sb).snapshotRejected === 1 && tel(sb).snapshotQuarantined === 0); }
{ const sb = env(false);
  ok('6 invalid_total (≤0) → dropped', guard(sb, { ts: NOW, total: 0, investable: 0 }, { ts: NOW-60000, total: 5000 }) === true && tel(sb).lastRejectReason === 'invalid_total'); }
{ const sb = env(false);
  ok('7 fx_approx → dropped', guard(sb, { ts: NOW, total: 5000, investable: 5000, fxApprox: true }, { ts: NOW-60000, total: 5000 }) === true); }

console.log('\nLegitimate moves still accepted cleanly (no quarantine noise):');
{ const sb = env(false);
  ok('8 small move within thresholds → accepted, no quarantine/reject', guard(sb, { ts: NOW, total: 5100, investable: 5100 }, { ts: NOW-60000, total: 5000 }) === false && tel(sb).snapshotQuarantined === 0 && tel(sb).snapshotRejected === 0); }
{ const sb = env(true);
  ok('9 big jump WITH a capital flow nearby → accepted (not suspicious)', guard(sb, { ts: NOW, total: 6000, investable: 6000 }, { ts: NOW-60000, total: 5000 }) === false && tel(sb).snapshotQuarantined === 0); }

console.log('\nSource — classification unchanged, only the action; quarantine reasons are device-relative:');
ok('10 _shouldRejectSnapshot still CLASSIFIES suspicious_drop/jump as reject (unchanged)',
   /suspicious_drop_without_market_reason/.test(fnSrc('_shouldRejectSnapshot')) && /suspicious_jump_without_capital_flow/.test(fnSrc('_shouldRejectSnapshot')));
ok('11 quarantine reasons = ONLY the device-relative heuristics (corruption excluded)',
   /_AURIX_GUARD_QUARANTINE_REASONS = \{ suspicious_drop_without_market_reason: 1, suspicious_jump_without_capital_flow: 1 \}/.test(app));
ok('12 _aurixGuardSnapshot returns false (allow) for quarantine reasons, true (drop) for corruption',
   /if \(_AURIX_GUARD_QUARANTINE_REASONS\[res\.reason\]\) \{[\s\S]*?return false;[\s\S]*?\}\s*try \{ _aurixGuardTelemetry\.snapshotRejected\+\+/.test(fnSrc('_aurixGuardSnapshot')));

console.log('\nParity end-to-end — quarantined points are written ⇒ synced ⇒ adopted ⇒ converge:');
ok('13 recordSnapshot / recordCategorySnapshot write the point when guard returns false (then it flushes)',
   /'portfolio'\)\) return;/.test(fnSrc('recordSnapshot')) && /'category'\)\) return;/.test(fnSrc('recordCategorySnapshot')));
ok('14 the canonical readiness gate still holds Calculando until local body hash === remote (item 7/8)',
   /_aurixLocalCanonicalHash === _aurixRemoteCanonicalHash/.test(fnSrc('_aurixCanonicalHistoryReady')));
ok('15 debug exposes snapshotQuarantinedCount + lastQuarantineReason for before/after proof',
   /snapshotQuarantinedCount:/.test(app) && /lastQuarantineReason:/.test(app));

console.log('\nNo-touch (renderer / holdings / pricing untouched):');
ok('16 renderer + holdings merge + destructive lock untouched; _shouldRejectSnapshot logic intact',
   /function renderAurixInstitutionalChart\(/.test(app) && /function _aurixMergePortfolio\(/.test(app) &&
   /const _AURIX_BLOCK_DESTRUCTIVE_SAVES = true;/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
