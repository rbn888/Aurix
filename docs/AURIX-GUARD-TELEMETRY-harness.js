'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-GUARD-TELEMETRY-harness — P0-HISTORY-PARITY-BLOCKER diagnosis instrumentation
// ════════════════════════════════════════════════════════════════════════════
// Instrumentation ONLY (no guard behaviour changed). aurixHistoryDebug() must surface the snapshot-guard
// + destructive-save-block rejection state so the founder can prove from the system whether these
// rejections cause web/mobile history divergence. Key grounded facts this harness pins:
//  • a guard-rejected snapshot returns EARLY from recordSnapshot/recordCategorySnapshot ⇒ never appended
//    to portfolio/category history ⇒ never flushed to Supabase (dropped, not queued, not retried);
//  • the event journal is LOCAL-ONLY (never in the flush payload) ⇒ there is no remoteJournalRevision.
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} }
const dbg = (function(){ const i=app.indexOf('window.aurixHistoryDebug = async function'); return app.slice(i, app.indexOf('return out;', i)); })();

console.log('AURIX-GUARD-TELEMETRY — rejection instrumentation (diagnosis only)\n');

console.log('aurixHistoryDebug() exposes every requested field:');
ok('1 all 12 requested guard/journal fields present', [
  'snapshotGuardRejectedCount','saveBlockedDestructiveCount','lastSnapshotRejectedReason','lastRejectedTimestamp',
  'lastSaveBlockedReason','journalRevision','remoteJournalRevision','snapshotGuardState','destructiveGuardState',
  'pendingRejectedSnapshots','rejectedSnapshotIds','acceptedSnapshotIds'
].every(k => dbg.indexOf(k + ':') !== -1));

console.log('\nTelemetry is wired into the ACTUAL rejection paths (counts, never changes, the guards):');
ok('2 snapshot-guard reject path increments snapshotRejected + records reason/ts',
   /_aurixGuardTelemetry\.snapshotRejected\+\+; _aurixGuardTelemetry\.lastRejectReason = res\.reason; _aurixGuardTelemetry\.lastRejectTs = next\.ts;/.test(fnSrc('_aurixGuardSnapshot')));
ok('3 destructive count-reduction block increments saveBlocked',
   /_aurixGuardTelemetry\.saveBlocked\+\+; _aurixGuardTelemetry\.lastSaveBlockReason = verdict\.reason/.test(fnSrc('saveData')));
ok('4 journal-contradiction block increments saveBlocked (reason contradicts_event_journal)',
   /_aurixGuardTelemetry\.saveBlocked\+\+; _aurixGuardTelemetry\.lastSaveBlockReason = 'contradicts_event_journal';/.test(fnSrc('saveData')));
ok('5 telemetry object declared (counters only — additive)',
   /const _aurixGuardTelemetry = \{[\s\S]*?snapshotRejected: 0,[\s\S]*?saveBlocked: 0,/.test(app));

console.log('\nGrounded fact #1/#4 — a rejected snapshot is DROPPED (early return), never stored, never retried:');
ok('6 recordSnapshot returns early when the guard rejects (point never appended)',
   /if \(_aurixGuardSnapshot\(\s*\{ ts: now, total: val, investable: val[\s\S]*?'portfolio'\)\) return;/.test(fnSrc('recordSnapshot')));
ok('7 recordCategorySnapshot returns early when the guard rejects (point never appended)',
   /_aurixGuardSnapshot\(/.test(fnSrc('recordCategorySnapshot')) && /'category'\)\) return;/.test(fnSrc('recordCategorySnapshot')));
ok('8 rejected snapshots only enter an in-memory diagnostic ring (no persistence / no retry queue)',
   /window\.__AURIX_REJECTED_SNAPSHOTS__\.push\(rec\)/.test(fnSrc('_aurixPushRejected')) &&
   !/retr(y|ies)|requeue|resend/i.test(fnSrc('_aurixPushRejected')));
ok('9 debug labels the rejected ring as discarded, not queued (pendingRejectedSnapshots = ring length)',
   /DISCARDED, not queued[\s\S]*?never retried\/synced/.test(dbg) && /pendingRejectedSnapshots: rejectedIds\.length,/.test(dbg));

console.log('\nGrounded fact #2 — the guard is DEVICE-RELATIVE (compares to the local last-valid snapshot):');
ok('10 _shouldRejectSnapshot compares next vs prevValid.total (the device-local last clean snapshot)',
   /const deltaPct = \(total - prevValid\.total\) \/ prevValid\.total;/.test(fnSrc('_shouldRejectSnapshot')) &&
   /suspicious_drop_without_market_reason/.test(fnSrc('_shouldRejectSnapshot')));
ok('11 prevValid is each device\'s OWN last valid snapshot (_aurixLastValidSnapshot(local history))',
   /_aurixLastValidSnapshot\(portfolioHistory, 'value'\)/.test(fnSrc('recordSnapshot')));

console.log('\nGrounded fact — the event journal is LOCAL-ONLY ⇒ no remote journal revision:');
ok('12 journalRevision = local event count; remoteJournalRevision hard-coded null (not synced)',
   /journalRevision = \(typeof _aurixJournalRead === 'function'\) \? _aurixJournalRead\(\)\.length/.test(dbg) &&
   /remoteJournalRevision: null,/.test(dbg));
ok('13 the flush payload to Supabase does NOT include the journal/events (local-only confirmed)',
   /category_history:     categoryHistory,/.test(app) && !/aurix_portfolio_events:|events:\s*_aurixJournalRead/.test(fnSrc('_flushStatePersistence')));

console.log('\nNo behaviour change — guards/renderer/holdings sync untouched:');
ok('14 _AURIX_BLOCK_DESTRUCTIVE_SAVES still true; renderer + merge untouched',
   /const _AURIX_BLOCK_DESTRUCTIVE_SAVES = true;/.test(app) && /function renderAurixInstitutionalChart\(/.test(app) &&
   /function _aurixMergePortfolio\(/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
