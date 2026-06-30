'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-RANGE-PERFORMANCE-PIPELINE-harness — P0 per-range coherence: one source of truth per range
// ════════════════════════════════════════════════════════════════════════════
// Symptom: mobile 24H showed +17% (or Calculando) while 7D/30D/1A/TOTAL all showed an identical +4.03%.
// ROOT CAUSE (two layers): (a) the DESKTOP _wscPaintSurface gated validity on getValidReturnBaseline but took the
// NUMBER from a LOCAL recompute (_aurixRangeReturn) — diverging from performance_state and device-to-device; and it
// forced "Calculando…" whenever the LOCAL chart series was sparse (perf.mode==='building') even when the range was
// ready. (b) every badge surface must read the SAME canonical per-range source. FIX: all surfaces delegate the
// badge to the single canonical painter _aurixPaintReturnBadge → getValidReturnBaseline(activeRange) →
// performance_state.byRange[range] for authed. The chart CURVE geometry is untouched. Each range reads its OWN entry.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ let s='function '+name+'('; let i=app.indexOf(s); if(i<0){ s='async function '+name+'('; i=app.indexOf(s); } if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} }
const NOW = 1800000000000;

console.log('AURIX-RANGE-PERFORMANCE-PIPELINE — one canonical per-range source of truth\n');

// ── 1) SOURCE: every badge surface delegates to the single canonical painter ──
console.log('Single source — all badge writers delegate to _aurixPaintReturnBadge:');
const wsc = fnSrc('_wscPaintSurface');
ok('1 desktop WSC main badge delegates to _aurixPaintReturnBadge (not a local _aurixRangeReturn recompute)',
   (wsc.match(/_aurixPaintReturnBadge\(changeEl, opts\.uid === 'm' \? 'mobile' : 'desktop'\)/g) || []).length >= 2);
ok('2 desktop WSC no longer reads the badge number from the LOCAL _aurixRangeReturn (no `_ret.deltaPct` badge value)',
   !/const deltaPct = \(_ret && Number\.isFinite\(_ret\.deltaPct\)\)/.test(wsc));
ok('3 the chart skeleton branch (graph not ready) ALSO routes the badge through the painter — graph + badge share ONE readiness',
   /if \(!_snap \|\| !_snap\.graphReady\) \{[\s\S]*?if \(typeof _aurixPaintReturnBadge === 'function'\) _aurixPaintReturnBadge\(changeEl,/.test(wsc));
ok('4 mobile indicator delegates to the SAME canonical painter (web/mobile byte-identical)',
   /if \(typeof _aurixPaintReturnBadge === 'function'\) _aurixPaintReturnBadge\(el, 'mobile'\);/.test(fnSrc('_aurixMobileSetPerfIndicator')));
ok('5 the painter reads the ONE authoritative snapshot (computePerformanceSnapshot) — never the engine directly',
   /computePerformanceSnapshot\(typeof activeRange !== 'undefined' \? activeRange : '24h'\)/.test(fnSrc('_aurixPaintReturnBadge')) &&
   !/getValidReturnBaseline\(/.test(fnSrc('_aurixPaintReturnBadge')));

// ── 2) SOURCE: performance_state is a per-range map; consumer + writer are per-range ──
console.log('\nPer-range structure — performance_state.byRange[range], read + written per range:');
ok('6 getValidReturnBaseline (authed) returns the per-range performance_state value (psRow.displayedReturnPct)',
   /deltaPct: psRow\.displayedReturnPct/.test(fnSrc('getValidReturnBaseline')) &&
   /const psRow = _aurixRemotePerformanceForRange\(r\);/.test(fnSrc('getValidReturnBaseline')));
ok('7 the selector looks up byRange[range] (lowercased), never a single shared object',
   /ps\.byRange && \(ps\.byRange\[rk\]/.test(fnSrc('_aurixSelectRemotePerformance')));
ok('8 the writer computes a DISTINCT entry for each of the 5 ranges',
   /const RANGES = \['24h', '7d', '30d', '1y', 'all'\];/.test(fnSrc('_aurixComputePerformanceStateCandidate')) &&
   /byRange\[rg\] = \{/.test(fnSrc('_aurixComputePerformanceStateCandidate')));

// ── 3) FUNCTIONAL: each range resolves to its OWN performance_state entry ──
console.log('\nFunctional — getValidReturnBaseline(range) returns performance_state.byRange[range], per range:');
function makeAuthedEnv(byRange){
  const sb = { Math, Number, Date:{ now:()=>NOW }, console:{log:()=>{}} };
  vm.createContext(sb);
  vm.runInContext('var activeRange="24h";', sb);
  vm.runInContext('const _AURIX_RETURN_MIN_HISTORY_MS=90*1000; const _AURIX_RETURN_FLOW_DOMINANCE=0.5; const _AURIX_RETURN_COMPARABLE_RATIO={"24h":1.20,"7d":1.35,"30d":1.75,"1y":3.00,"all":3.00};', sb);
  // deps
  sb._aurixResetAt = () => 0;
  sb._aurixPortfolioCreatedAt = () => NOW - 10*86400000;
  sb.totalValueBase = () => 8840;
  sb._aurixRangeReturn = () => ({ valid:true, deltaPct:99, deltaAbs:99, startValue:8000, baselineTs:NOW-86400000, lastTs:NOW, netFlowsNeutralized:0 });  // LOCAL junk — must be IGNORED for authed
  sb.canDisplayCanonicalReturn = () => ({ ok:true, reason:'ok' });
  sb._aurixReturnSnapshotStats = () => ({ snapshotCount:5, validSnapshotCount:5, firstValidTs:NOW-5000000 });
  sb._aurixPostConstructionBaseline = () => ({ ok:false, comparableCount:0 });
  sb._aurixCurrentUserId = () => 'u1';
  sb._aurixCurrentLifecycleId = () => 'L1';
  sb._aurixCurrentRevision = () => 5;
  sb._aurixPendingSync = () => false;
  sb._aurixRemotePerformanceState = { userId:'u1', lifecycleId:'L1', portfolioRevision:5, calculatedAt:NOW, byRange:byRange };
  vm.runInContext(fnSrc('_aurixSelectRemotePerformance'), sb);
  vm.runInContext(fnSrc('_aurixRemotePerformanceForRange'), sb);
  vm.runInContext(fnSrc('getValidReturnBaseline'), sb);
  return sb;
}
const ready = (pct) => ({ displayedReturnPct:pct, displayedReturnValue:pct*10, baselineValue:8000, baselineSnapshotId:111, displayedColor: pct>0?'green':'red', performanceHash:'h'+pct, returnState:'ready' });
const byRange = { '24h':ready(17.0), '7d':ready(4.03), '30d':ready(4.03), '1y':ready(4.03),
  // 'all' present but PENDING (entry exists, no finite pct) — only THIS range should show Calculando
  'all':{ performanceHash:'hall', displayedReturnPct:null, returnState:'pending_baseline' } };
const sb = makeAuthedEnv(byRange);
const G = (r) => vm.runInContext('getValidReturnBaseline("'+r+'")', sb);
ok('9  24H uses performance_state["24h"] → +17% (NOT the local recompute 99, NOT 4.03)', G('24h').valid===true && G('24h').deltaPct===17.0);
ok('10 7D  uses performance_state["7d"]  → +4.03%', G('7d').valid===true && G('7d').deltaPct===4.03);
ok('11 30D uses performance_state["30d"] → +4.03%', G('30d').valid===true && G('30d').deltaPct===4.03);
ok('12 1A  uses performance_state["1y"]  → +4.03%', G('1y').valid===true && G('1y').deltaPct===4.03);
ok('13 a READY range never shows Calculando (valid + finite pct)', G('24h').valid===true && Number.isFinite(G('24h').deltaPct));
ok('14 TOTAL ("all") is the ONLY pending range → Calculando (pending does not leak into the others)',
   G('all').valid===false && G('all').deltaPct===null && G('7d').valid===true && G('24h').valid===true);
ok('15 ranges are independent — 24h !== 7d (no collapse to a single shared value)', G('24h').deltaPct !== G('7d').deltaPct);

// ── 4) Diagnostic helper ──
console.log('\nDiagnostic — window.aurixRangePipelineDebug(range):');
ok('16 helper exposes all mandated sections',
   /window\.aurixRangePipelineDebug = function/.test(app) &&
   ['requestedRange','normalizedRange','activeRangeBefore','activeRangeAfter','selectedButtonRange',
    'performanceStateRangeEntry','getValidReturnBaseline','getInstitutionalPerformanceSeries','wscPaintSurfaceInput','domFinal']
     .every(k => app.indexOf(k + ':') !== -1));
ok('17 the debug is READ-ONLY (activeRangeAfter mirrors before; never assigns activeRange)',
   /activeRangeAfter: \(typeof activeRange !== 'undefined'\) \? activeRange : null,   \/\/ READ-ONLY/.test(app));

// ── 5) No-touch ──
console.log('\nNo-touch (renderer / holdings / pricing / per-range engine intact):');
ok('18 chart renderer + holdings merge + pricing-guard untouched',
   /function renderAurixInstitutionalChart\(/.test(app) && /function _aurixMergePortfolio\(/.test(app) && /reason: 'invalid_total'/.test(fnSrc('_shouldRejectSnapshot')));
ok('19 the chart CURVE geometry still uses the local neutralised series (adjVals) — only the BADGE was unified',
   /const linePath = _wscMonotonePath\(pts\);/.test(wsc));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
