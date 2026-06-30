'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-WINDOW-ANCHOR-FIX-harness — P0 the chart range window anchors on the SAME deterministic
// last-snapshot ts as the return path (NOT Date.now). Stale snapshots no longer empty the chart window.
// ════════════════════════════════════════════════════════════════════════════
// Runs the REAL getInstitutionalPerformanceSeries + _aurixInvestableSnapshots over a controlled, STALE
// shared history (last snapshot well behind the device clock) and proves the chart window keeps the same
// points the return window keeps. Only the windowing is exercised; no renderer/badge/ownership code.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} }

// Device clock is FAR ahead of the last snapshot (the stale-data scenario that caused the bug).
const NOW = 1800000000000;          // "device now"
const HR = 36e5, DAY = 864e5;
const LAST_SNAP = NOW - 26 * HR;    // last real snapshot is 26h stale vs the device clock

// shared history: clean snapshots every 2h across the 30h before LAST_SNAP (investable = total, no RE)
const SHARED = []; for (let t = LAST_SNAP - 30 * HR; t <= LAST_SNAP; t += 2 * HR) SHARED.push({ ts: t, total: 8000, real_estate: 0 });

function env(){
  const sb = { Math, Number, Date: { now: () => NOW }, console: { log(){}, warn(){}, table(){} } };
  vm.createContext(sb);
  vm.runInContext("var activeRange='24h';", sb);
  vm.runInContext("var SHARED=" + JSON.stringify(SHARED) + ";", sb);
  // shared-history source (what BOTH paths must anchor on) + the live investable value (≈ last snapshot)
  vm.runInContext("function _aurixHistorySourceForDisplay(){ return SHARED; } var categoryHistory=SHARED;", sb);
  vm.runInContext("function _aurixPortfolioEpoch(){ return 0; } function toBase(v){ return v; } function investableValueBase(){ return 8000; }", sb);
  vm.runInContext("function _aurixRangeReturn(){ return { deltaPct: 0, deltaAbs: 0 }; }", sb);  // not under test here
  vm.runInContext(fnSrc('_aurixInvestableSnapshots'), sb);
  vm.runInContext(fnSrc('_aurixEligibleInvestableSeries'), sb);
  vm.runInContext(fnSrc('getCanonicalPortfolioSeries'), sb);
  vm.runInContext(fnSrc('getInstitutionalPerformanceSeries'), sb);
  return sb;
}
const inv = (sb,r) => vm.runInContext("_aurixInvestableSnapshots('"+r+"')", sb);
const ips = (sb,r) => vm.runInContext("getInstitutionalPerformanceSeries('"+r+"')", sb);

console.log('AURIX-CHART-WINDOW-ANCHOR-FIX — chart window anchors on last-snapshot ts (not Date.now)\n');

console.log('Stale snapshot (26h behind device clock), valid relative to the snapshot nowRef:');
{ const sb=env();
  const r24 = inv(sb,'24h');                 // return path (last-snapshot anchored) — should keep points
  const c24 = ips(sb,'24h');                 // chart path (now last-snapshot anchored) — should ALSO keep points
  ok('1 stale-but-valid: return 24h keeps ≥2 points', Array.isArray(r24) && r24.length >= 2);
  ok('2 24H chart series has ≥2 points (no skeleton) — anchored on the snapshot, not Date.now', c24.renderSeries.length >= 2 && c24.mode !== 'building');
  ok('2b chart window anchorSource = last_snapshot_ts (not the device-clock fallback)', c24.windowAnchorSource === 'last_snapshot_ts');
  ok('2c chart anchorTs === the last snapshot ts (≈ deterministic nowRef)', c24.windowAnchorTs === LAST_SNAP); }

console.log('\n7D / 30D / 1Y use the same last-snapshot anchor rule:');
{ const sb=env();
  ['7d','30d','1y'].forEach(r => { const c = ips(sb,r);
    ok('3 '+r+' chart window anchored on last_snapshot_ts → keeps points (≥2)', c.windowAnchorSource==='last_snapshot_ts' && c.windowAnchorTs===LAST_SNAP && c.renderSeries.length>=2); }); }

console.log('\nTOTAL/all unaffected (start stays -Infinity):');
{ const sb=env(); const c = ips(sb,'all');
  ok('4 all: every point included (window start is -Infinity, not anchor-dependent)', c.renderSeries.length === SHARED.length || c.renderSeries.length >= SHARED.length); }

console.log('\nEmpty source → Date.now() fallback still works:');
{ const sb=env(); vm.runInContext("SHARED.length=0; categoryHistory=[];", sb);
  const c = ips(sb,'24h');
  ok('5 empty shared history → anchorSource falls back to date_now_fallback (no crash, building)', c.windowAnchorSource === 'date_now_fallback' && c.mode === 'building'); }

console.log('\nChart window == return window (same anchor) — the divergence is gone:');
{ const sb=env();
  const c24 = ips(sb,'24h'); const r24 = inv(sb,'24h');
  // both windows start at LAST_SNAP - 24h; the chart includes the same settled points the return path does
  const retFirst = r24[0].ts, chartFirstReal = c24.renderSeries[0].time;
  ok('6 chart first-point ts == return first-point ts (identical window start)', retFirst === chartFirstReal);
  ok('7 chart-vs-return divergence eliminated for stale-but-valid data (both ≥2)', r24.length>=2 && c24.renderSeries.length>=2); }

console.log('\nSource — the fix + no renderer/ownership change:');
ok('8 getInstitutionalPerformanceSeries computes nowRef from the shared source, Date.now is fallback-only',
   /_aurixHistorySourceForDisplay === 'function'\) \? _aurixHistorySourceForDisplay\(\)/.test(fnSrc('getInstitutionalPerformanceSeries')) &&
   /if \(!_anchorFromSnapshot\) nowRef = Date\.now\(\);/.test(fnSrc('getInstitutionalPerformanceSeries')) &&
   /const start = \(r === 'all'\) \? -Infinity : nowRef -/.test(fnSrc('getInstitutionalPerformanceSeries')));
ok('9 no renderer/ownership change: computePerformanceSnapshot is still the single producer; renderers untouched',
   /function computePerformanceSnapshot\(range\)/.test(app) && /graphReady: ready, badgeReady: ready, skeleton: !ready/.test(app) &&
   /_aurixPaintReturnBadge\(changeEl, opts\.uid === 'm' \? 'mobile' : 'desktop'\)/.test(app));
ok('10 _aurixInvestableSnapshots (return path) anchor unchanged (still last-snapshot ts)',
   /const start = range === 'all' \? 0 : nowRef - \(ms\[range\] \|\| 2592e6\);/.test(fnSrc('_aurixInvestableSnapshots')));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
