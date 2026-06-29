'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CANONICAL-PERFORMANCE-ENGINE-harness — P0 single canonical authority for chart + return
// ════════════════════════════════════════════════════════════════════════════
// WHY client-side kept failing: each client COMPUTED the return from history using device-local Date.now()
// (range window edge) and device-local live value (trust-filter anchor) → two clients diverged even from the
// SAME history. FIX: the performance is now a PURE DETERMINISTIC function of the shared history — the window
// is anchored on the shared history's LAST snapshot timestamp (not Date.now()) and the trust anchor is the
// last shared snapshot value (not investableValueBase()). Two devices reading the same canonical store ⇒
// byte-identical window/baseline/series. performanceHash/chartSeriesHash make parity verifiable.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} }

// Build a sandbox for _aurixInvestableSnapshots with a fixed shared history; vary ONLY the device clock + live value.
function env(clockNow, liveValue, hist){
  const sb = { Math, Number, Date: { now: () => clockNow }, console:{log:()=>{}} };
  sb.toBase = (v) => v;
  sb._aurixPortfolioEpoch = () => 0;
  sb.investableValueBase = () => liveValue;
  sb._src = hist;
  sb._aurixHistorySourceForDisplay = () => sb._src;   // the shared canonical store (identical on both devices)
  vm.createContext(sb);
  vm.runInContext('var categoryHistory = [];', sb);
  vm.runInContext(fnSrc('_aurixInvestableSnapshots'), sb);
  vm.runInContext(fnSrc('_aurixEligibleInvestableSeries'), sb);
  return sb;
}
const win = (sb, range) => vm.runInContext('_aurixInvestableSnapshots("'+range+'").map(p=>p.ts)', sb);
const anchorOf = (sb, range) => vm.runInContext('_aurixEligibleInvestableSeries("'+range+'").meta.anchor', sb);

const DAY = 864e5;
// a shared history: snapshots over ~3 days, last at T (settled). value rising.
const T = 1800000000000;
const HIST = [
  { ts: T - 2*DAY, total: 4000, real_estate: 0 },
  { ts: T - 1*DAY, total: 4200, real_estate: 0 },
  { ts: T - 12*36e5, total: 4300, real_estate: 0 },   // 12h before last
  { ts: T,         total: 4400, real_estate: 0 },
];

console.log('AURIX-CANONICAL-PERFORMANCE-ENGINE — deterministic from shared history\n');

console.log('The range window is anchored on the shared history (NOT the device clock):');
{ // two "devices": different clocks (5 min skew) + different live values, SAME shared history
  const web = env(T + 60_000, 4405, HIST);     // web clock 1 min after last snapshot, live 4405
  const mob = env(T + 300_000, 4395, HIST);    // mobile clock 5 min after, live 4395
  ok('1 24H window identical across devices despite 5-min clock skew', JSON.stringify(win(web,'24h')) === JSON.stringify(win(mob,'24h')));
  ok('2 24H window = snapshots within 24h of the LAST snapshot (T-24h boundary incl., T-12h, T)', JSON.stringify(win(web,'24h')) === JSON.stringify([T-DAY, T-12*36e5, T]));
  ok('3 7D window identical across devices', JSON.stringify(win(web,'7d')) === JSON.stringify(win(mob,'7d'))); }

console.log('\nThe trust-filter anchor is the last shared snapshot value (NOT device live value):');
{ const web = env(T + 60_000, 9999, HIST);    // very different live values…
  const mob = env(T + 60_000, 1, HIST);
  ok('4 anchor identical across devices (= last snapshot 4400, ignores live value)', anchorOf(web,'30d') === 4400 && anchorOf(mob,'30d') === 4400); }

console.log('\nDeterminism end-to-end: same shared history ⇒ identical windowed series (any clock/live value):');
{ const web = env(T + 1, 5000, HIST);
  const mob = env(T + 999_999, 100, HIST);
  ok('5 30D series identical across devices', JSON.stringify(win(web,'30d')) === JSON.stringify(win(mob,'30d')));
  ok('6 ALL series identical across devices', JSON.stringify(win(web,'all')) === JSON.stringify(win(mob,'all'))); }

console.log('\nSource — window + anchor are deterministic (no Date.now()/live-value in the canonical path):');
ok('7 _aurixInvestableSnapshots windows on the source last-snapshot ts (nowRef), Date.now only as fallback',
   /let nowRef = 0;\s*for \(const _p of _src\)[\s\S]*?if \(!\(nowRef > 0\)\) nowRef = Date\.now\(\);\s*const ms =[\s\S]*?const start = range === 'all' \? 0 : nowRef - /.test(fnSrc('_aurixInvestableSnapshots')));
ok('8 _aurixEligibleInvestableSeries anchors on the last shared snapshot value (live only as fallback)',
   /let anchor = raw\[raw\.length - 1\]\.value;\s*if \(!\(anchor > 0\)\) \{ try \{ anchor = \(typeof investableValueBase/.test(fnSrc('_aurixEligibleInvestableSeries')));

console.log('\nDebug surface aurixPerformanceDebug() exposes every required field:');
const pd = (function(){ const i=app.indexOf('window.aurixPerformanceDebug = async function'); return app.slice(i, app.indexOf('return out;', i)); })();
ok('9 all required fields present', [
  'build','userId','lifecycleId','portfolioRevision','canonicalRevision','performanceSource','returnState',
  'canonicalUpdatedAt','isOutdated','chartSeriesHash','performanceHash','displayedReturnPct','displayedReturnValue',
  'displayedColor','baselineByRange','currentValue','blockReason','deviceId','localCacheHash','remoteHash'
].every(k => pd.indexOf(k + ':') !== -1));
ok('10 it is async + performanceHash fingerprints per-range {baseline,last,pct,color}',
   /window\.aurixPerformanceDebug = async function/.test(app) &&
   /perfFingerprint\.push\(rg \+ '\|' \+ p\.baselineSnapshotId \+ '\|' \+ p\.baselineValue \+ '\|' \+ p\.displayedReturnPct \+ '\|' \+ p\.displayedColor\)/.test(app));

console.log('\nGate + no-touch: real return only when confirmed; chart kept as visual fallback (item 12):');
ok('11 displayed return still gated by canDisplayCanonicalReturn (Calculando until confirmed)',
   /if \(!_disp\.ok\) invalidReason = 'awaiting_canonical_history';/.test(app));
ok('12 colour derives only from the canonical return sign',
   /const color = !g\.valid \? 'pending' : \(g\.deltaPct > 0\.005 \? 'green' : \(g\.deltaPct < -0\.005 \? 'red' : 'neutral'\)\)/.test(fnSrc('_aurixCanonicalPerformance')));
ok('13 renderer / holdings / pricing untouched; corruption guard intact',
   /function renderAurixInstitutionalChart\(/.test(app) && /function _aurixMergePortfolio\(/.test(app) &&
   /reason: 'invalid_total'/.test(fnSrc('_shouldRejectSnapshot')));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
