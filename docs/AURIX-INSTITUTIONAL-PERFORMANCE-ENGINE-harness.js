'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-INSTITUTIONAL-PERFORMANCE-ENGINE-harness — P0 performance (not balance)
// ════════════════════════════════════════════════════════════════════════════
// The visible chart must draw a flow-neutral PERFORMANCE INDEX, never raw portfolio balance.
// buildInstitutionalPerformanceSeries(range) classifies each interval, neutralizes ONLY trusted
// cashflows (explicit ledger events + high-confidence structural evidence — never magnitude/price),
// builds a normalized index (start 100), and returns PENDING (insufficient_trusted_performance_data)
// rather than fabricate performance when a material interval is a low-confidence / unknown flow.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name) {
  const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let p = app.indexOf('(', i), pd = 0; for (; p < app.length; p++) { if (app[p] === '(') pd++; else if (app[p] === ')') { pd--; if (!pd) { p++; break; } } }
  let k = app.indexOf('{', p), d = 0; for (; k < app.length; k++) { if (app[k] === '{') d++; else if (app[k] === '}') { d--; if (!d) { k++; break; } } }
  return app.slice(i, k);
}
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }

const HOUR = 3600000, DAY = 86400000, LAST = 1800000000000;

// hist = category snapshots; flows = capital-flow ledger events
function makeEnv(hist, flows) {
  const sb = {
    Math: Math, Number: Number, Map: Map, Array: Array, String: String, JSON: JSON, Date: Date,
    isFinite: isFinite, parseFloat: parseFloat, Infinity: Infinity, console: { log: () => {} },
    activeRange: '30d', activePerfMode: 'pct', categoryHistory: hist || [], toBase: (v) => v,
    _flows: flows || [], _aurixLoadCapitalFlows: null, _aurixHistorySourceForDisplay: null,
  };
  sb._aurixLoadCapitalFlows = () => sb._flows;
  sb._aurixHistorySourceForDisplay = () => sb.categoryHistory;
  vm.createContext(sb);
  vm.runInContext('const _AURIX_EMG_RANGE_MS = {"24h":864e5,"7d":6048e5,"30d":2592e6,"1y":31536e6,"all":Infinity};' +
    'const _AURIX_EMG_MAX_RATIO = {"24h":1.20,"7d":1.35,"30d":1.75,"1y":3.00,"all":3.00};' +
    'const _AURIX_EMG_ADJ_JUMP = {"24h":0.20,"7d":0.35,"30d":0.50,"1y":0.50,"all":0.50};' +
    'const _AURIX_EMG_SANITY_PCT = {"24h":10,"7d":20,"30d":35,"1y":50,"all":50};' +
    'const _AURIX_EMG_MIN_POINTS = 2; const _AURIX_EMG_FALLBACK_TAIL = 8;' +
    'const _AURIX_PROD_MIN_POINTS = {"24h":3,"7d":6,"30d":6,"1y":6,"all":6};' +
    'const _AURIX_HPQ_MIN_POINTS = 2; const _AURIX_HPQ_FUTURE_MS = 365*864e5; const _AURIX_HPQ_SPIKE_JUMP = 0.20; const _AURIX_HPQ_SPIKE_REVERT_FRAC = 0.5;' +
    'const _AURIX_IPE_START_INDEX = 100; const _AURIX_IPE_FLOW_CANDIDATE_PCT = 0.15; const _AURIX_IPE_LIQ_JUMP_FRAC = 0.15; const _AURIX_IPE_STRUCT_MIN = 1;' +
    'const _AURIX_IPE_INVEST_BUCKETS = ["crypto","stock","etf","fund","metal","liquidity","other"];', sb);
  ['_aurixEmergencyHash', '_aurixProdPlateauFilter', '_aurixProdVisualGate',
    '_aurixHpqIso', '_aurixHpqDiag', '_aurixHpqRangesContaining', '_aurixHpqRawStages',
    '_aurixHpqTrimConstruction', '_aurixHpqQuarantineSpikes', '_aurixHpqFirstInvalidStage', 'buildValidatedHistoricalSeries',
    '_aurixIpeFlowsInInterval', '_aurixIpeStructuralEvidence', '_aurixIpeClassifyInterval', 'buildInstitutionalPerformanceSeries',
    'buildProductionPortfolioChart'].forEach(f => vm.runInContext(fnSrc(f), sb));
  return sb;
}
const PERF = (sb, r) => vm.runInContext('buildInstitutionalPerformanceSeries(' + JSON.stringify(r) + ')', sb);
const P = (sb, r) => vm.runInContext('buildProductionPortfolioChart(' + JSON.stringify(r) + ')', sb);

// helpers to build snapshots. bucket = which category holds the value (default liquidity+crypto split)
function snap(ts, invest, opts) { opts = opts || {}; return Object.assign({ ts: ts, total: invest + (opts.re || 0), real_estate: opts.re || 0, crypto: opts.crypto != null ? opts.crypto : invest, stock: 0, etf: 0, fund: 0, metal: 0, liquidity: opts.liquidity || 0, other: 0 }, {}); }
// a flat-market series (value constant) so pure flows show clearly; n points over spanH hours
function flat(n, spanH, invest) { const a = []; for (let k = 0; k < n; k++) a.push(snap(LAST - (n - 1 - k) * (spanH / (n - 1)) * HOUR, invest, { crypto: invest })); return a; }

console.log('AURIX-INSTITUTIONAL-PERFORMANCE-ENGINE — performance, not balance\n');

console.log('Cashflows change BALANCE but not PERFORMANCE:');
{ // Deposit doubles the balance mid-series (explicit ledger event) → performance ≈ 0
  const h = []; for (let k = 0; k < 6; k++) h.push(snap(LAST - (11 - k) * HOUR, 8000, { crypto: 8000 }));
  for (let k = 0; k < 6; k++) h.push(snap(LAST - (5 - k) * HOUR, 16000, { crypto: 16000 }));   // after deposit
  const depTs = h[6].ts - 1;   // deposit lands in the interval into the doubled regime
  const p = PERF(makeEnv(h, [{ ts: depTs, amountUSD: 8000, kind: 'deposit' }]), 'all');
  ok('Deposit doubles balance → Total Value doubles, PERFORMANCE ≈ unchanged',
    p.state === 'ready' && Math.abs(p.returnPct) < 1 && p.lastRawValue === 16000 && p.flowEvents.some(e => e.flowClassification === 'explicit_cashflow'), 'ret=' + p.returnPct + ' lastRaw=' + p.lastRawValue); }
{ // Withdrawal (explicit) → performance unchanged
  const h = []; for (let k = 0; k < 6; k++) h.push(snap(LAST - (11 - k) * HOUR, 10000, { crypto: 10000 }));
  for (let k = 0; k < 6; k++) h.push(snap(LAST - (5 - k) * HOUR, 6000, { crypto: 6000 }));
  const p = PERF(makeEnv(h, [{ ts: h[6].ts - 1, amountUSD: -4000, kind: 'withdrawal' }]), 'all');
  ok('Withdrawal → performance ≈ unchanged', p.state === 'ready' && Math.abs(p.returnPct) < 1, 'ret=' + p.returnPct); }
{ // Added asset: a NEW class appears (structural high-confidence) → balance up, performance unchanged
  const h = []; for (let k = 0; k < 6; k++) h.push(snap(LAST - (11 - k) * HOUR, 8000, { crypto: 8000 }));
  for (let k = 0; k < 6; k++) { const s = snap(LAST - (5 - k) * HOUR, 12000, { crypto: 8000 }); s.stock = 4000; h.push(s); }   // stock class appears
  const p = PERF(makeEnv(h, []), 'all');
  ok('Added asset (new class appears) → balance up, performance unchanged (structural neutralized)',
    p.state === 'ready' && Math.abs(p.returnPct) < 1 && p.flowEvents.some(e => e.flowClassification === 'inferred_cashflow_high_confidence'), 'ret=' + p.returnPct); }
{ // Liquidity transfer (cash jump) → structural high-confidence → no artificial return
  const h = []; for (let k = 0; k < 6; k++) h.push(snap(LAST - (11 - k) * HOUR, 8000, { crypto: 8000, liquidity: 0 }));
  for (let k = 0; k < 6; k++) { const s = snap(LAST - (5 - k) * HOUR, 11000, { crypto: 8000 }); s.liquidity = 3000; h.push(s); }
  const p = PERF(makeEnv(h, []), 'all');
  ok('Liquidity transfer → no artificial return', p.state === 'ready' && Math.abs(p.returnPct) < 1, 'ret=' + p.returnPct); }
{ // New synchronization: first-sync appears as a new class → neutralized
  const h = []; for (let k = 0; k < 6; k++) h.push(snap(LAST - (11 - k) * HOUR, 5000, { crypto: 5000 }));
  for (let k = 0; k < 6; k++) { const s = snap(LAST - (5 - k) * HOUR, 9000, { crypto: 5000 }); s.metal = 4000; h.push(s); }
  const p = PERF(makeEnv(h, []), 'all');
  ok('New synchronization (class appears) → no artificial return', p.state === 'ready' && Math.abs(p.returnPct) < 1, 'ret=' + p.returnPct); }
{ // Portfolio construction: leading low regime then a sustained explicit inflow step → neutralized
  const h = [snap(LAST - 20 * DAY, 5000, { crypto: 5000 }), snap(LAST - 19 * DAY, 5010, { crypto: 5010 }),
    snap(LAST - 10 * DAY, 12000, { crypto: 12000 }), snap(LAST - 5 * DAY, 12020, { crypto: 12020 }), snap(LAST, 12030, { crypto: 12030 })];
  const p = PERF(makeEnv(h, [{ ts: LAST - 15 * DAY, amountUSD: 7000, kind: 'import_baseline' }]), 'all');
  ok('Portfolio construction neutralized (no fake appreciation)', p.state !== 'ready' || Math.abs(p.returnPct) < 5, p.state + ' ret=' + p.returnPct); }

console.log('\nGenuine market performance stays visible:');
{ // pure market appreciation (no flows, no structural): +10% over 30d in small steps
  const h = []; for (let k = 0; k <= 30; k++) h.push(snap(LAST - (30 - k) * DAY, 8000 * (1 + 0.10 * k / 30), { crypto: 8000 * (1 + 0.10 * k / 30) }));
  const p = PERF(makeEnv(h, []), 'all');
  ok('Genuine market appreciation visible (≈ +10%)', p.state === 'ready' && p.returnPct > 8 && p.returnPct < 12 && p.flowEvents.length === 0, 'ret=' + p.returnPct); }
{ const h = []; for (let k = 0; k <= 30; k++) h.push(snap(LAST - (30 - k) * DAY, 8000 * (1 - 0.08 * k / 30), { crypto: 8000 * (1 - 0.08 * k / 30) }));
  const p = PERF(makeEnv(h, []), 'all');
  ok('Genuine market decline visible (≈ -8%)', p.state === 'ready' && p.returnPct < -6 && p.returnPct > -10, 'ret=' + p.returnPct); }

console.log('\nUncertainty → performance PENDING; chart gracefully falls back to VALUE (never fake return):');
{ // large unexplained jump: the PERFORMANCE engine itself refuses (never fabricates a return)
  const h = []; for (let k = 0; k < 6; k++) h.push(snap(LAST - (11 - k) * HOUR, 8000, { crypto: 8000 }));
  for (let k = 0; k < 6; k++) h.push(snap(LAST - (5 - k) * HOUR, 13000, { crypto: 13000 }));   // +62% jump, no evidence
  const p = PERF(makeEnv(h, []), 'all');
  ok('Performance engine: unknown interval → PENDING insufficient_trusted_performance_data (no fabricated return)',
    p.state === 'pending' && p.reason === 'insufficient_trusted_performance_data' && p.returnPct === null, p.state + '/' + p.reason); }
{ // …but the CHART falls back to the validated raw VALUE series (labelled value, not return) — availability
  const h = []; for (let k = 0; k < 6; k++) h.push(snap(LAST - (11 - k) * HOUR, 8000, { crypto: 8000 }));
  for (let k = 0; k < 6; k++) h.push(snap(LAST - (5 - k) * HOUR, 20000, { crypto: 20000 }));
  const p = P(makeEnv(h, []), 'all');
  ok('Chart falls back to VALUE series (mode value_fallback, labelled value, chartUsesPerformanceIndex=false, NOT pending)',
    p.state === 'ready' && p.mode === 'value_fallback' && p.chartUsesPerformanceIndex === false && p.label === 'Evolución del valor' &&
    p.reason === 'performance_pending_cashflow_data_missing_value_fallback_used' && p.points.length >= 2, p.mode + '/' + p.reason); }

console.log('\nGraceful fallback decision model (3 modes):');
{ // trusted performance → performance_index
  const h = []; for (let k = 0; k <= 20; k++) h.push(snap(LAST - (20 - k) * HOUR, 8000 * (1 + 0.05 * k / 20), { crypto: 8000 * (1 + 0.05 * k / 20) }));
  const p = P(makeEnv(h, []), 'all');
  ok('MODE performance_index when trusted (label Rentabilidad, chartUsesPerformanceIndex=true)',
    p.mode === 'performance_index' && p.label === 'Rentabilidad' && p.chartUsesPerformanceIndex === true && p.state === 'ready' && p.points[0].value === 100, p.mode); }
{ // construction, no flow, ≥2 validated → value_fallback (NOT pending, NOT performance)
  const h = [snap(LAST - 20 * DAY, 5503, { crypto: 5503 }), snap(LAST - 19 * DAY, 5510, { crypto: 5510 }),
    snap(LAST - 10 * DAY, 8790, { crypto: 8790 }), snap(LAST - 5 * DAY, 8810, { crypto: 8810 }), snap(LAST, 8820, { crypto: 8820 })];
  const p = P(makeEnv(h, []), 'all');
  ok('MODE value_fallback when performance pending but v459 value series READY (no construction blocking)',
    p.mode === 'value_fallback' && p.state === 'ready' && p.chartUsesPerformanceIndex === false && p.points.length >= 2, p.mode + '/' + p.reason); }
{ // genuinely insufficient (1 validated point) → pending
  const p = P(makeEnv([snap(LAST, 8000, { crypto: 8000 })], []), '30d');
  ok('MODE pending only when NOT enough validated points', p.mode === 'pending' && p.state === 'pending' && p.reason === 'insufficient_validated_points', p.mode + '/' + p.reason); }

console.log('\nSnapshot hygiene still applies (per earlier layers):');
{ const h = []; for (let k = 0; k <= 20; k++) h.push(snap(LAST - (20 - k) * HOUR, 8000 + k * 4, { crypto: 8000 + k * 4 }));
  h[10] = snap(h[10].ts, 16000, { crypto: 16000 });   // mean-reverting spike
  const p = P(makeEnv(h, []), 'all');
  ok('One corrupted snapshot quarantined → remaining history renders', p.state === 'ready' && p.quarantinedSnapshotCount >= 1 && !p.points.some(x => x.value === 16000), 'q=' + p.quarantinedSnapshotCount);
  const dup = h.slice(); dup.push(snap(h[20].ts, 8090, { crypto: 8090 }));
  const v = vm.runInContext('buildValidatedHistoricalSeries("all")', makeEnv(dup, []));
  ok('Duplicate snapshot removed', v.counts.duplicateSnapshots >= 1);
  const z = []; for (let k = 0; k <= 8; k++) z.push(snap(LAST - (8 - k) * HOUR, 8000 + k, { crypto: 8000 + k })); z[3] = snap(z[3].ts, 0, { crypto: 0 });
  const vz = vm.runInContext('buildValidatedHistoricalSeries("all")', makeEnv(z, []));
  ok('Zero-value anomaly quarantined', vz.counts.zeroValueSnapshots >= 1);
  const fut = []; for (let k = 0; k <= 8; k++) fut.push(snap(LAST - (8 - k) * HOUR, 8000 + k, { crypto: 8000 + k })); fut.push(snap(LAST + 400 * DAY, 9000, { crypto: 9000 }));
  const vf = vm.runInContext('buildValidatedHistoricalSeries("all")', makeEnv(fut, []));
  ok('Future timestamp rejected', vf.counts.futureSnapshots >= 1);
  const st = []; st.push(snap(LAST - 800 * DAY, 6000, { crypto: 6000 })); for (let k = 0; k <= 8; k++) st.push(snap(LAST - (8 - k) * HOUR, 8000 + k, { crypto: 8000 + k }));
  const vs = vm.runInContext('buildValidatedHistoricalSeries("all")', makeEnv(st, []));
  ok('Stale timestamp rejected', vs.counts.staleSnapshots >= 1); }

console.log('\nContract guarantees:');
{ const h = []; for (let k = 0; k <= 20; k++) h.push(snap(LAST - (20 - k) * HOUR, 8000 * (1 + 0.05 * k / 20), { crypto: 8000 * (1 + 0.05 * k / 20) }));
  const sb = makeEnv(h, []); const p = P(sb, 'all');
  const dh = vm.runInContext('_aurixEmergencyHash(' + JSON.stringify(p.points.map(x => ({ ts: x.ts, value: x.value }))) + ')', sb);
  ok('Desktop/mobile parity — identical validated performance series', dh === p.chartHash);
  const first = p.points[0].value, last = p.points[p.points.length - 1].value;
  const idxReturn = ((last - first) / first) * 100;
  ok('Visible return equals performance-index return (first→last)', Math.abs(p.returnPct - idxReturn) < 0.01 && p.lineReturnPct === p.badgeReturnPct, 'ret=' + p.returnPct);
  ok('Chart draws the performance index (start 100), not raw balance', p.points[0].value === 100 && p.chartUsesPerformanceIndex === true, 'first=' + p.points[0].value);
  ok('Renderer consumes validated series only (READY has ≥2 index points)', p.renderDecision === 'READY' && p.points.length >= 2); }

console.log('\nWiring / debug API present:');
ok('W1 buildInstitutionalPerformanceSeries exists + exported', /function buildInstitutionalPerformanceSeries\(/.test(app) && /window\.buildInstitutionalPerformanceSeries =/.test(app));
ok('W2 buildProductionPortfolioChart consumes the performance series', /const perf = buildInstitutionalPerformanceSeries\(r\);/.test(app));
ok('W3 window.aurixInstitutionalPerformanceDebug exposed', /window\.aurixInstitutionalPerformanceDebug\s*=/.test(app));

console.log('\n' + (fail === 0 ? '✅ ALL PASS' : '❌ ' + fail + ' FAILED') + '  (' + pass + '/' + (pass + fail) + ')');
process.exit(fail === 0 ? 0 : 1);
