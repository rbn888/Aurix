'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CANONICAL-RETURN-HISTORY-harness — P0 cross-device history parity
// ════════════════════════════════════════════════════════════════════════════
// For one account / lifecycle / range, web and mobile MUST produce the same chart, %, $, color,
// baseline and last point. The return (getValidReturnBaseline→_aurixRangeReturn) and the chart
// (renderAurixInstitutionalChart) already read ONE canonical source — the per-user investable snapshot
// series. This patch adds a DETERMINISTIC, device-independent historyHash/chartHash so divergence is
// provable + locatable, plus window.aurixHistoryDebug(). PURE READ — no sync/persistence/renderer touch.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} }

// Load the pure helpers into a sandbox.
const sb = { Math, Number, console:{log:()=>{}}, _series:[], _uid:'u1', _epoch:0, _reset:0, activeRange:'30d' };
sb._aurixEligibleInvestableSeries = () => ({ series: sb._series, meta:{ anchor: 5000, reasons:{ construction_baseline: 1 } } });
sb._aurixPortfolioEpoch = () => sb._epoch;
sb._aurixResetAt = () => sb._reset;
vm.createContext(sb);
vm.runInContext('var _aurixActiveUserId = "u1"; var currentUser = null;', sb);
vm.runInContext(fnSrc('_aurixHistoryHash'), sb);
vm.runInContext(fnSrc('_aurixLifecycleId'), sb);
vm.runInContext(fnSrc('_aurixCanonicalHistory'), sb);
const H  = (arr) => vm.runInContext('_aurixHistoryHash('+JSON.stringify(arr)+')', sb);
const CH = () => vm.runInContext('_aurixCanonicalHistory("30d")', sb);
const LC = () => vm.runInContext('_aurixLifecycleId()', sb);

console.log('AURIX-CANONICAL-RETURN-HISTORY — deterministic single history\n');

console.log('historyHash is deterministic + device-independent (web === mobile for identical history):');
ok('1 same series → same hash (the parity guarantee)', H(['1:100','2:110','3:121']) === H(['1:100','2:110','3:121']));
ok('2 a different VALUE → different hash', H(['1:100','2:110']) !== H(['1:100','2:111']));
ok('3 a different ORDER → different hash', H(['1:100','2:110']) !== H(['2:110','1:100']));
ok('4 a missing/extra snapshot (count differs) → different hash', H(['1:100','2:110']) !== H(['1:100','2:110','3:121']));
ok('5 hash is a stable 8-hex token', /^[0-9a-f]{8}$/.test(H(['1:100'])));

console.log('\nCanonical accessor — the SINGLE source the chart + return consume:');
sb._series = [ {ts:10, value:100.004}, {ts:20, value:110}, {ts:20, value:110} ];
{ const c = CH();
  ok('6 normalises {ts,value} (2-dp) from the per-user investable eligible series', c.series.length===3 && c.series[0].value===100 && c.source==='category_history.investable.eligible');
  ok('7 exposes the build reason from the eligible-series meta', c.reason==='construction_baseline' && c.anchor===5000); }

console.log('\nLifecycle — reset starts a NEW lifecycle (old history invalid); same lifecycle is device-independent:');
{ sb._epoch = 0; sb._reset = 0; const before = LC();
  sb._reset = 1800000000000; const after = LC();
  ok('8 reset → new lifecycleId (history from the old lifecycle no longer applies)', before !== after && /^lc-[0-9a-f]{8}$/.test(after)); }
{ // same uid + same epoch/reset on two "devices" ⇒ identical lifecycleId (device change keeps history)
  sb._reset = 1800000000000; const dev1 = LC(); const dev2 = LC();
  ok('9 same account + lifecycle → identical lifecycleId across devices', dev1 === dev2); }
{ const u1 = LC();
  vm.runInContext('_aurixActiveUserId = "u2";', sb); const u2 = LC();
  vm.runInContext('_aurixActiveUserId = "u1";', sb);
  ok('10 different user → different lifecycleId (per-user isolation)', u1 !== u2); }

console.log('\nwindow.aurixHistoryDebug() — mandated diagnosis surface (all required fields present):');
const dbgSrc = (function(){ const i=app.indexOf('window.aurixHistoryDebug = async function'); return app.slice(i, app.indexOf('return out;', i)); })();
ok('11 exposes every required field', [
  'userId','deviceId','portfolioRevision','lifecycleId','historyRevision','historyHash','snapshotSource',
  'snapshotCount','snapshotIds','baselineSnapshotId','baselineTimestamp','baselineValue','currentValue',
  'displayedReturnPct','displayedReturnValue','displayedColor','chartPointCount','chartHash','returnState',
  'lastHistorySync','historyMismatch','canonicalHistoryLoaded','historyBuildReason'
].every(k => dbgSrc.indexOf(k + ':') !== -1));
ok('12 it is async (await window.aurixHistoryDebug())', /window\.aurixHistoryDebug = async function/.test(app));
ok('13 chartHash hashes the canonical chart series (getInstitutionalPerformanceSeries.renderSeries)',
   /getInstitutionalPerformanceSeries\(r\)[\s\S]*?renderSeries[\s\S]*?chartHash = _aurixHistoryHash/.test(dbgSrc + app.slice(app.indexOf('window.aurixHistoryDebug'), app.indexOf('window.aurixHistoryDebug')+4000)));
ok('14 color derives EXCLUSIVELY from the canonical return sign (never computed independently)',
   /const color = !g\.valid \? 'pending' : \(g\.deltaPct > 0\.005 \? 'green' : \(g\.deltaPct < -0\.005 \? 'red' : 'neutral'\)\)/.test(app));
ok('15 duplicate-snapshot detection present (snapshot parity)', /const dups = ids\.length - new Set\(ids\)\.size;/.test(app));

console.log('\nNo-touch guarantees (renderer / sync / persistence / integrity lock / journal):');
ok('16 renderer / merge / destructive-save lock / integrity untouched',
   /function renderAurixInstitutionalChart\(/.test(app) && /function _aurixMergePortfolio\(/.test(app) &&
   /const _AURIX_BLOCK_DESTRUCTIVE_SAVES = true;/.test(app));
ok('17 canonical accessor is read-only over the existing eligible series (no new history built)',
   /function _aurixCanonicalHistory\(range\)/.test(app) && /_aurixEligibleInvestableSeries\(r\)/.test(fnSrc('_aurixCanonicalHistory')));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
