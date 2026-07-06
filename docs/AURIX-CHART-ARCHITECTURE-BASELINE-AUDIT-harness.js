'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-ARCHITECTURE-BASELINE-AUDIT-harness — SPEC DSH.CHART.ARCHITECTURE-DATA-LINEAGE.BASELINE-AUDIT.12
// ════════════════════════════════════════════════════════════════════════════
// Proves that window.aurixChartArchitectureAudit() is a PURE READ-ONLY baseline auditor: it never mutates
// the source / localStorage / global critical state, never calls save/sync/supabase-write, and it correctly
// detects (per range) source families, untagged points, cross-source/cross-epoch first↔last, gaps, islands,
// needles, future/pre-account/stale/out-of-band points, unreliable badge + unreliable visible line, while
// keeping 24H frontend-first and backend available on long ranges — with zero synthetic points, deterministic
// output and JSON-serializable payload. Loaded via the same vm sandbox the sibling chart harnesses use.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(startIdx) { let k = app.indexOf('{', startIdx), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(startIdx, k); }
function fn(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing fn ' + name); return braceSlice(i); }
function konst(name) { const m = app.match(new RegExp('const ' + name + '\\s*=.*?;')); if (!m) throw new Error('missing const ' + name); return m[0]; }
function winAssign(name) { const s = 'window.' + name + ' = function'; const i = app.indexOf(s); if (i < 0) throw new Error('missing window.' + name); const body = braceSlice(i); return body + ';'; }
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }
const MIN = 60e3, HOUR = 36e5, DAY = 864e5;

const CONSTS = ['_AURIX_EMG_RANGE_MS', '_AURIX_EMG_ADJ_JUMP', '_AURIX_EMG_FALLBACK_TAIL', '_AURIX_EMG_MIN_POINTS', '_AURIX_HPQ_MIN_POINTS', '_AURIX_HPQ_SPIKE_JUMP', '_AURIX_HPQ_SPIKE_REVERT_FRAC', '_AURIX_HPQ_FUTURE_MS', '_AURIX_PROD_MIN_POINTS', '_AURIX_PROD_GATE_PCT', '_AURIX_RET_MIN_BASE', '_AURIX_RET_SANE_PCT', '_AURIX_STEP_MATCH_MIN_CONF', '_AURIX_ALL_MIN_TRUST_SPAN_MS', '_AURIX_ALL_MIN_TRUST_POINTS', '_AURIX_VJUMP_MIN_FRAC', '_AURIX_VJUMP_P95_MULT', '_AURIX_CAPSTEP_RATIO_LO', '_AURIX_CAPSTEP_RATIO_HI', '_AURIX_CAPSTEP_TS_PAD_MS', '_AURIX_CAPITAL_STEP_SEG_ENABLED', '_AURIX_CHART_RECONCILE_GATE', '_AURIX_SNAP_NEAR_MS', '_AURIX_SNAP_NEAR_FRAC', '_AURIX_SNAP_FE_AUTHORITY_MS', '_AURIX_CHART_EPOCH_TRUST', '_AURIX_CHART_EPOCH_BAND_LO', '_AURIX_CHART_24H_FE_AUTHORITY'];
// NOTE: _AURIX_CHART_EPOCH_BAND_HI shares the _AURIX_CHART_EPOCH_BAND_LO statement (defined together).
const FNS = ['_aurixEmergencyHash', '_aurixProdPlateauFilter', '_aurixProdVisualGate', '_aurixHpqIso', '_aurixHpqDiag', '_aurixHpqRangesContaining', '_aurixSourceFamily', '_aurixFrontendUsableInWindow', '_aurixApplyRangeSourceAuthority', '_aurixTrustedChartSource', '_aurixHpqRawStages', '_aurixHpqTrimConstruction', '_aurixHpqQuarantineSpikes', '_aurixHpqFirstInvalidStage', 'buildValidatedHistoricalSeries', '_aurixNetFlowsInWindow', '_aurixComputePeriodReturn', '_aurixVerticalJumps', '_aurixCapitalStepBreaks', 'buildProductionPortfolioChart'];

const S = { HIST: [], setItemCalls: 0, saveCalls: 0, writeCalls: 0 };
function buildCtx() {
  const lsStore = {};
  const localStorage = { getItem: k => (k in lsStore ? lsStore[k] : null), setItem: (k, v) => { S.setItemCalls++; lsStore[k] = String(v); }, removeItem: k => { S.setItemCalls++; delete lsStore[k]; } };
  const supabaseWrite = () => { S.writeCalls++; return { then: () => {} }; };
  const ctx = {
    console, Math, JSON, Array, Number, isFinite, Infinity, Date, Map, Set, Object, isNaN, parseInt, parseFloat, String,
    toBase: v => v, _aurixLoadCapitalFlows: () => [],
    _aurixHistorySourceForDisplay: () => S.HIST,
    _aurixCanonicalHistoryReady: () => true,
    currentUser: { id: 'user-arch-12', created_at: '2020-01-01T00:00:00Z' },
    activeRange: '24h',
    categoryHistory: S.HIST, _aurixCanonicalCatHistory: S.HIST, _aurixBackendSnapshots: [], _aurixCanonicalHistoryLoaded: true,
    getTotalValue: () => 9000,
    localStorage: localStorage,
    // save/sync/write spies — the auditor must NEVER touch these
    saveToBackend: () => { S.saveCalls++; }, autoSaveToBackend: () => { S.saveCalls++; }, savePortfolio: () => { S.saveCalls++; },
    recordCategorySnapshot: () => { S.saveCalls++; }, render: () => {}, updateChart: () => {},
    supabaseClient: { from: () => ({ insert: supabaseWrite, upsert: supabaseWrite, update: supabaseWrite, delete: supabaseWrite, select: () => ({ eq: () => ({}) }) }) },
    window: { AURIX_BUILD: 'v-arch-12-test' },
  };
  vm.createContext(ctx);
  CONSTS.forEach(c => vm.runInContext(konst(c), ctx));
  FNS.forEach(n => vm.runInContext(fn(n), ctx));
  vm.runInContext(winAssign('aurixChartArchitectureAudit'), ctx);
  return ctx;
}
const CTX = buildCtx();
function runAudit() { return CTX.window.aurixChartArchitectureAudit(); }
function feSeries(t0, n, stepMin, valFn) { const out = []; for (let i = 0; i < n; i++) out.push({ ts: t0 + i * stepMin * MIN, total: +valFn(i).toFixed(2), real_estate: 0 }); return out; }
function beSeries(t0, n, stepMin, valFn) { const out = []; for (let i = 0; i < n; i++) out.push({ ts: t0 + i * stepMin * MIN, total: +valFn(i).toFixed(2), real_estate: 0, source: 'backend_snapshot' }); return out; }
const T0 = 1_800_000_000_000;
const AUDIT_SRC = winAssign('aurixChartArchitectureAudit');

console.log('AURIX-CHART-ARCHITECTURE-BASELINE-AUDIT — SPEC DSH.CHART.ARCHITECTURE-DATA-LINEAGE.BASELINE-AUDIT.12\n');

// ── 1. function exists + basic shape ──
console.log('1. Auditor exists + shape:');
{
  S.HIST = feSeries(T0 - 20 * HOUR, 60, 15, i => 9000 + 2 * i);
  const a = runAudit();
  ok('window.aurixChartArchitectureAudit is a function', typeof CTX.window.aurixChartArchitectureAudit === 'function');
  ok('spec marker correct', a && a.spec === 'DSH.CHART.ARCHITECTURE-DATA-LINEAGE.BASELINE-AUDIT.12', a.spec);
  ok('has rangeDiagnostics for all 5 ranges', a && a.rangeDiagnostics && ['24h', '7d', '30d', '1y', 'all'].every(r => a.rangeDiagnostics[r]));
  ok('has all required matrices', a && a.sourceFamilyMatrix && a.epochMatrix && a.segmentMatrix && a.badgeMatrix && a.rendererMatrix && a.trustGateMatrix);
  ok('exposes identity fields', 'portfolioRevision' in a && 'lifecycleId' in a && 'accountCreatedAtIso' in a && 'currentRange' in a);
}

// ── 2-6. READ-ONLY contract ──
console.log('\n2-6. Read-only contract (no mutation / no save / no sync / no write):');
{
  S.HIST = feSeries(T0 - 20 * HOUR, 60, 15, i => 9000 + 2 * i);
  const before = JSON.stringify(S.HIST);
  const beforeLen = S.HIST.length;
  S.setItemCalls = 0; S.saveCalls = 0; S.writeCalls = 0;
  const a = runAudit();
  ok('source array not mutated (deep equal)', JSON.stringify(S.HIST) === before);
  ok('source length unchanged', S.HIST.length === beforeLen);
  ok('no localStorage.setItem / removeItem called', S.setItemCalls === 0, 'calls=' + S.setItemCalls);
  ok('no save/sync/snapshot call', S.saveCalls === 0, 'calls=' + S.saveCalls);
  ok('no supabase write (insert/upsert/update/delete)', S.writeCalls === 0, 'calls=' + S.writeCalls);
  ok('source text contains NO write ops', !/localStorage\.setItem|localStorage\.removeItem|\.upsert\(|\.insert\(|autoSaveToBackend\(|saveToBackend\(|recordCategorySnapshot\(/.test(AUDIT_SRC));
  ok('audit returned an object regardless', a && typeof a === 'object');
}

// ── 7. detects local / remote / backend families ──
console.log('\n7. Detects local/remote/backend source families:');
{
  const fe = feSeries(T0 - 5 * DAY, 40, 60, i => 9000 + i);          // frontend/remote (no source tag)
  const be = beSeries(T0 - 20 * DAY, 30, 6 * 60, i => 8800 + i);     // backend older
  S.HIST = be.concat(fe);
  const a = runAudit();
  ok('backend snapshots seen in mergedDisplaySource', a.dataSources.mergedDisplaySource.backendMerged > 0, 'be=' + a.dataSources.mergedDisplaySource.backendMerged);
  ok('all-range backendCount > 0', a.rangeDiagnostics.all.backendCount > 0, 'be=' + a.rangeDiagnostics.all.backendCount);
  ok('all-range frontendCount > 0', a.rangeDiagnostics.all.frontendCount > 0, 'fe=' + a.rangeDiagnostics.all.frontendCount);
}

// ── 8. detects untagged points ──
console.log('\n8. Detects untagged (no per-point revision/account/source) points:');
{
  S.HIST = feSeries(T0 - 5 * DAY, 40, 60, i => 9000 + i);            // pure frontend = untagged
  const a = runAudit();
  ok('untaggedPoints.total > 0 (frontend family untagged)', a.untaggedPoints.total > 0, 'n=' + a.untaggedPoints.total);
  ok('untaggedPoints has explanatory note', typeof a.untaggedPoints.note === 'string' && a.untaggedPoints.note.length > 0);
}

// ── 9. detects cross-source first/last ──
console.log('\n9. Detects cross-source-family first↔last:');
{
  const be = beSeries(T0 - 40 * DAY, 20, 12 * 60, () => 8500);        // older backend
  const fe = feSeries(T0 - 3 * DAY, 40, 60, () => 9000);             // recent frontend, in-band
  S.HIST = be.concat(fe);
  const a = runAudit();
  const d = a.rangeDiagnostics.all;
  ok('all: first=backend, last=frontend', d.firstSourceFamily === 'backend' && d.lastSourceFamily === 'frontend', 'first=' + d.firstSourceFamily + ' last=' + d.lastSourceFamily);
  ok('all: sameSourceFamily === false', d.sameSourceFamily === false);
  ok('sourceFamilyMatrix.all reflects conflict', a.sourceFamilyMatrix.all.same === false);
}

// ── 10. detects cross-epoch first/last ──
console.log('\n10. Detects cross-epoch first↔last:');
{
  // sustained +56% step placed at ~66% of the series so construction-prefix trim (first 50% only) keeps it.
  const older = feSeries(T0 - 10 * DAY, 30, 60, () => 8000);
  const newer = feSeries(T0 - 5 * DAY + 1, 15, 60, () => 12500);
  S.HIST = older.concat(newer);
  const a = runAudit();
  const d = a.rangeDiagnostics.all;
  ok('all: firstEpoch !== lastEpoch', d.firstEpoch != null && d.lastEpoch != null && d.firstEpoch !== d.lastEpoch, 'first=' + d.firstEpoch + ' last=' + d.lastEpoch);
  ok('all: sameEpoch === false', d.sameEpoch === false);
  ok('epochMatrix.all reflects cross-epoch', a.epochMatrix.all.sameEpoch === false);
}

// ── 11-13. gaps / islands / needles ──
console.log('\n11-13. Detects gaps / islands / needles:');
{
  // two dense clusters separated by a large temporal gap in 'all' → island + gap
  const c1 = feSeries(T0 - 60 * DAY, 20, 60, () => 9000);
  const c2 = feSeries(T0 - 2 * DAY, 20, 60, () => 9100);
  S.HIST = c1.concat(c2);
  const a = runAudit();
  ok('all: islandCount > 1 (two clusters)', a.rangeDiagnostics.all.islandCount > 1, 'islands=' + a.rangeDiagnostics.all.islandCount);
  ok('all: largestGapMs large (gap detected)', a.rangeDiagnostics.all.largestGapMs > 30 * DAY, 'gapMs=' + a.rangeDiagnostics.all.largestGapMs);
  ok('gaps aggregate non-empty', a.gaps.length > 0);
  ok('islands aggregate non-empty', a.islands.length > 0);
}
{
  // needle: sustained ~30% step past 60% of a 24h series (survives spike quarantine, > spikeJump 0.20)
  const a1 = feSeries(T0 - 20 * HOUR, 30, 20, () => 9000);
  const a2 = feSeries(T0 - 20 * HOUR + 30 * 20 * MIN + MIN, 12, 20, () => 11800);
  S.HIST = a1.concat(a2);
  const a = runAudit();
  const anyNeedle = ['24h', '7d', '30d', '1y', 'all'].some(r => a.rangeDiagnostics[r].needleCount > 0);
  ok('needleCount > 0 on at least one range', anyNeedle, '24h=' + a.rangeDiagnostics['24h'].needleCount);
  ok('needles aggregate non-empty', a.needles.length > 0);
}

// ── 14. detects future points ──
console.log('\n14. Detects future / clock-skew points:');
{
  const cluster = feSeries(T0 - 3 * DAY, 30, 60, () => 9000);
  const future = [{ ts: T0 + 400 * DAY, total: 9100, real_estate: 0 }];   // 400d forward gap
  S.HIST = cluster.concat(future);
  const a = runAudit();
  ok('all: futurePointCount >= 1', a.rangeDiagnostics.all.futurePointCount >= 1, 'n=' + a.rangeDiagnostics.all.futurePointCount);
  ok('futurePoints aggregate non-empty', a.futurePoints.length > 0);
}

// ── 15. detects pre-account points ──
console.log('\n15. Detects pre-account points:');
{
  const created = T0 - 5 * DAY;
  CTX.currentUser.created_at = new Date(created).toISOString();
  const pre = feSeries(T0 - 20 * DAY, 10, 6 * 60, () => 9000);        // before account creation
  const post = feSeries(T0 - 3 * DAY, 30, 60, () => 9000);
  S.HIST = pre.concat(post);
  const a = runAudit();
  ok('all: preAccountPointCount >= 1', a.rangeDiagnostics.all.preAccountPointCount >= 1, 'n=' + a.rangeDiagnostics.all.preAccountPointCount);
  ok('preAccountPoints aggregate non-empty', a.preAccountPoints.length > 0);
  CTX.currentUser.created_at = '2020-01-01T00:00:00Z';                 // restore
}

// ── 16. detects source-family conflict ──
console.log('\n16. Detects source-family conflict (backend inside frontend region):');
{
  const be = beSeries(T0 - 40 * DAY, 15, 12 * 60, () => 8600);
  const fe = feSeries(T0 - 2 * DAY, 30, 60, () => 9000);
  S.HIST = be.concat(fe);
  const a = runAudit();
  ok('sourceFamilyMatrix.all shows both families present', a.sourceFamilyMatrix.all.backend > 0 && a.sourceFamilyMatrix.all.frontend > 0);
  ok('all: sameSourceFamily === false (conflict)', a.rangeDiagnostics.all.sameSourceFamily === false);
}

// ── 17. detects unreliable badge ──
console.log('\n17. Detects unreliable/neutral badge:');
{
  // short new-account 'all' → maturity gate suppresses badge → neutral
  S.HIST = feSeries(T0 - 2 * HOUR, 6, 20, () => 9000 + 1);
  const a = runAudit();
  const anyNeutral = ['24h', '7d', '30d', '1y', 'all'].some(r => a.badgeMatrix[r].badgeState === 'neutral_calculando');
  ok('at least one range badgeState = neutral_calculando', anyNeutral, JSON.stringify(['24h', 'all'].map(r => a.badgeMatrix[r].badgeState)));
  ok('trustGateMatrix carries untrustReasons', ['24h', '7d', '30d', '1y', 'all'].some(r => a.trustGateMatrix[r].untrustReasons.length > 0));
}

// ── 18. detects unreliable visible line ──
console.log('\n18. Detects unreliable visible line (islands / low readiness):');
{
  const c1 = feSeries(T0 - 60 * DAY, 20, 60, () => 9000);
  const c2 = feSeries(T0 - 2 * DAY, 20, 60, () => 9100);
  S.HIST = c1.concat(c2);
  const a = runAudit();
  ok('all: institutionalReadinessScore < 100 (defective)', a.rangeDiagnostics.all.institutionalReadinessScore < 100, 'score=' + a.rangeDiagnostics.all.institutionalReadinessScore);
  ok('rendererMatrix exposes continuityScore + renderPathCount', 'continuityScore' in a.rendererMatrix.all && 'renderPathCount' in a.rendererMatrix.all);
}

// ── 19. differentiates 24H from long ranges ──
console.log('\n19. 24H differentiated from 7D/30D/1A/TOTAL:');
{
  const fe = feSeries(T0 - 20 * HOUR, 40, 20, () => 9000);
  const be = beSeries(T0 - 40 * HOUR, 6, 60, () => 9600);            // old backend (outside 24h)
  S.HIST = fe.concat(be);
  const a = runAudit();
  ok('24h authorityMode is frontend/backend-specific', /24h$/.test(a.rangeDiagnostics['24h'].sourceAuthorityMode), a.rangeDiagnostics['24h'].sourceAuthorityMode);
  ok('long ranges authorityMode = mixed_long_range', ['7d', '30d', '1y', 'all'].every(r => a.rangeDiagnostics[r].sourceAuthorityMode === 'mixed_long_range'));
}

// ── 20. backend still available for long ranges ──
console.log('\n20. Backend available for long ranges:');
{
  const fe = feSeries(T0 - 3 * DAY, 60, 60, i => 9000 + i * 0.2);
  const be = beSeries(T0 - 25 * DAY, 40, 8 * 60, i => 8800 + i);
  S.HIST = fe.concat(be);
  const a = runAudit();
  ok('30d backendUsableInRange true', a.rangeDiagnostics['30d'].backendUsableInRange === true);
  ok('all backendCount > 0 (history intact)', a.rangeDiagnostics.all.backendCount > 0);
}

// ── 21. 24H can exclude backend when frontend usable ──
console.log('\n21. 24H excludes backend when frontend usable:');
{
  const fe = feSeries(T0 - 20 * HOUR, 40, 20, i => 9000 + i);        // dense frontend in-window
  const be = beSeries(T0 - 22 * HOUR, 8, 60, () => 9600);           // backend scattered
  S.HIST = fe.concat(be);
  const a = runAudit();
  ok('24h frontendUsableInRange === true', a.rangeDiagnostics['24h'].frontendUsableInRange === true);
  ok('24h backendExcludedByRangeAuthority >= 1', a.rangeDiagnostics['24h'].backendExcludedByRangeAuthority >= 1, 'excl=' + a.rangeDiagnostics['24h'].backendExcludedByRangeAuthority);
  ok('24h authorityMode = frontend_authority_24h', a.rangeDiagnostics['24h'].sourceAuthorityMode === 'frontend_authority_24h');
}

// ── 22. no synthetic points ──
console.log('\n22. No synthetic points anywhere:');
{
  const fe = feSeries(T0 - 3 * DAY, 60, 60, i => 9000 + i);
  const be = beSeries(T0 - 20 * DAY, 30, 6 * 60, i => 8800 + i);
  S.HIST = fe.concat(be);
  const a = runAudit();
  ok('every range syntheticPointsCount === 0', ['24h', '7d', '30d', '1y', 'all'].every(r => a.rangeDiagnostics[r].syntheticPointsCount === 0));
  ok('top-level syntheticPoints === 0', a.syntheticPoints === 0);
}

// ── 23. determinism ──
console.log('\n23. Deterministic across arrival orders:');
{
  const full = feSeries(T0 - 20 * HOUR, 50, 20, i => 9000 + 3 * i + (i % 4) * 2).concat(beSeries(T0 - 30 * HOUR, 8, 60, () => 9500));
  const strip = a => { const c = JSON.parse(JSON.stringify(a)); delete c.accountAgeHours; return JSON.stringify(c); };
  const outs = [];
  for (let k = 0; k < 6; k++) { const rot = k % full.length; let arr = full.slice(rot).concat(full.slice(0, rot)); if (k % 2) arr = arr.reverse(); S.HIST = arr; outs.push(strip(runAudit())); }
  ok('6 arrival orders → identical audit (minus wall-clock age)', outs.every(o => o === outs[0]), Array.from(new Set(outs)).length + ' distinct');
}

// ── 24. JSON-serializable ──
console.log('\n24. JSON-serializable output:');
{
  S.HIST = feSeries(T0 - 3 * DAY, 40, 60, i => 9000 + i).concat(beSeries(T0 - 20 * DAY, 20, 6 * 60, i => 8800 + i));
  const a = runAudit();
  let roundTrip = null, err = null;
  try { roundTrip = JSON.parse(JSON.stringify(a)); } catch (e) { err = e; }
  ok('JSON.stringify → parse round-trips', !err && roundTrip && roundTrip.spec === a.spec, err ? String(err) : 'ok');
  ok('no functions leaked into payload', JSON.stringify(a).indexOf('function') === -1 || !/\"[^\"]*\":\s*function/.test(JSON.stringify(a)));
}

// ── 25. does not remove / break existing audit surface ──
console.log('\n25. Existing chart surface intact (source contract):');
{
  ok('buildProductionPortfolioChart still present', /function buildProductionPortfolioChart\(range\)/.test(app));
  ok('aurixChartPointLineageAudit still present', /window\.aurixChartPointLineageAudit = function/.test(app));
  ok('aurixChartDeterminismAudit still present', /window\.aurixChartDeterminismAudit = function/.test(app));
  ok('aurixSnapshotSourceAudit still present', /window\.aurixSnapshotSourceAudit = function/.test(app));
  ok('new auditor wired read-only (returns out, logs UI tag)', /CHART_ARCHITECTURE_AUDIT/.test(app) && /return out;/.test(AUDIT_SRC));
  ok('recommendations matrix present (conserve/refactor/replace)', Array.isArray(runAudit().recommendations) && runAudit().recommendations.length >= 8);
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
