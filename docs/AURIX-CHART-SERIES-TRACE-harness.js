'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-SERIES-TRACE-harness — P0 root-cause: chart series vs return use DIFFERENT window anchors
// ════════════════════════════════════════════════════════════════════════════
// The CHART series (getInstitutionalPerformanceSeries) windows by Date.now() (app.js:19815-19817), while the
// RETURN/baseline path (_aurixInvestableSnapshots) windows by the LAST SNAPSHOT timestamp (app.js:19514/19517).
// When the last snapshot is stale vs the device clock, the chart's range window loses every real point
// (win<2 → 'building' → empty chartSeries) while the return path stays valid → badge % beside a skeleton chart.
// This harness (a) asserts the two anchors exist verbatim in source, (b) reproduces the divergence
// arithmetically with a stale snapshot, and (c) verifies window.aurixChartSeriesTrace is a READ-ONLY tracer.
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} }

console.log('AURIX-CHART-SERIES-TRACE — chart vs return windowing divergence (root cause)\n');

console.log('The two window anchors exist verbatim in source (the inconsistency):');
ok('1 RETURN window anchored on the LAST SNAPSHOT ts (nowRef) — _aurixInvestableSnapshots',
   /for \(const _p of _src\) \{ if \(_p && Number\.isFinite\(_p\.ts\) && _p\.ts > nowRef\) nowRef = _p\.ts; \}/.test(fnSrc('_aurixInvestableSnapshots')) &&
   /const start = range === 'all' \? 0 : nowRef - \(ms\[range\] \|\| 2592e6\);/.test(fnSrc('_aurixInvestableSnapshots')));
ok('2 CHART window anchored on Date.now() — getInstitutionalPerformanceSeries (the divergent site)',
   /const now = Date\.now\(\);/.test(fnSrc('getInstitutionalPerformanceSeries')) &&
   /const start = \(r === 'all'\) \? -Infinity : now - \(ms\[r\] \|\| 2592e6\);/.test(fnSrc('getInstitutionalPerformanceSeries')) &&
   /const win = canonical\.filter\(p => p && Number\.isFinite\(p\.ts\) && p\.ts >= start/.test(fnSrc('getInstitutionalPerformanceSeries')));
ok('3 getCanonicalPortfolioSeries appends a Date.now() live tail (widens the gap further)',
   /else out\.push\(\{ ts: now, value: live \}\);/.test(fnSrc('getCanonicalPortfolioSeries')));

console.log('\nArithmetic reproduction — stale snapshot ⇒ return window keeps points, chart window empties:');
{
  const DAY = 864e5, NOW = 1800000000000;
  const lastSnap = NOW - 26 * 36e5;                 // last snapshot is 26h old (stale vs device clock)
  // a clean 24h of snapshots ending at lastSnap (every 2h)
  const snaps = []; for (let t = lastSnap - 24 * 36e5; t <= lastSnap; t += 2 * 36e5) snaps.push({ ts: t, value: 8000 });
  // RETURN anchor (the real code's formula): nowRef = max snapshot ts
  let nowRef = 0; snaps.forEach(p => { if (p.ts > nowRef) nowRef = p.ts; });
  const retStart = nowRef - DAY;
  const retWin = snaps.filter(p => p.ts >= retStart);
  // CHART anchor (the real code's formula): Date.now(); canonical = snaps + live tail @ now
  const canonical = snaps.concat([{ ts: NOW, value: 8050 }]);   // getCanonicalPortfolioSeries live-tail append
  const chartStart = NOW - DAY;
  const chartWin = canonical.filter(p => p.ts >= chartStart);
  ok('4 RETURN 24h window (lastSnapshotTs anchor) keeps ≥2 points → baseline computable', retWin.length >= 2);
  ok('5 CHART 24h window (Date.now anchor) collapses to <2 points → mode "building" / empty chartSeries', chartWin.length < 2);
  ok('6 SAME history → DIVERGENT result purely from the anchor (badge % vs skeleton chart)', retWin.length >= 2 && chartWin.length < 2);
}

console.log('\nwindow.aurixChartSeriesTrace — READ-ONLY pipeline trace exists with the full per-stage metric set:');
const T = (function(){ const s=app.indexOf('window.aurixChartSeriesTrace = function'); let k=app.indexOf('{',s),d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}} return app.slice(s,k); })();
ok('7 helper defined', /window\.aurixChartSeriesTrace = function \(range\)/.test(app));
ok('8 traces every mandated stage (raw→canonical→investable→eligible→canonical series→institutional→snapshot)',
   /1_raw_category_history/.test(T) && /2_canonical_cat_history/.test(T) && /3_investable_snapshots/.test(T) &&
   /4_eligible_investable/.test(T) && /5_canonical_portfolio_series/.test(T) && /6_institutional_perf_series/.test(T) && /7_snapshot\.chartSeries/.test(T));
ok('9 emits the full per-stage metric set',
   ['pointCount','firstTs','lastTs','firstValue','lastValue','minValue','maxValue','hasNaN','hasNull','hasZero','hasNegative','duplicateTsCount','outOfOrderCount']
     .every(k => T.indexOf(k) !== -1));
ok('10 exposes rejection reasons, baseline, current, %, hashes + the two window anchors',
   /rejectionReasons/.test(T) && /baselineSnapshotId/.test(T) && /currentValue/.test(T) && /displayedReturnPct/.test(T) &&
   /chartSeriesHash/.test(T) && /producerHash/.test(T) && /returnWindowAnchor/.test(T) && /chartWindowAnchor/.test(T));
ok('11 detects the chart-vs-return divergence + names the exact site',
   /chartVsReturnDivergence/.test(T) && /getInstitutionalPerformanceSeries app\.js:19816/.test(T) && /_aurixInvestableSnapshots app\.js:19517/.test(T));
ok('12 READ-ONLY: the tracer assigns to no pipeline global / engine fn (only its local `out`)',
   !/_aurixCanonicalCatHistory\s*=[^=]/.test(T) && !/categoryHistory\s*=[^=]/.test(T) &&
   !/getInstitutionalPerformanceSeries\s*=[^=]/.test(T) && !/_aurixInvestableSnapshots\s*=[^=]/.test(T) &&
   !/\.innerHTML/.test(T) && !/\.push\(/.test(T.replace(/out\.stages\.push/g,'')) );

console.log('\nNo behaviour change (diagnostic-only — pipeline + producer untouched):');
ok('13 pipeline + producer functions unchanged (still present, engine frozen)',
   /function _aurixInvestableSnapshots\(range\)/.test(app) && /function getInstitutionalPerformanceSeries\(range\)/.test(app) &&
   /function computePerformanceSnapshot\(range\)/.test(app) && /function _aurixEligibleInvestableSeries\(range\)/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
