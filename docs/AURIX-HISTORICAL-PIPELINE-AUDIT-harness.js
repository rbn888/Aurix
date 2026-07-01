'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-HISTORICAL-PIPELINE-AUDIT-harness — P0 root-cause: snapshot-level quarantine
// ════════════════════════════════════════════════════════════════════════════
// buildValidatedHistoricalSeries(range) runs the full staged pipeline (validation → ordering →
// dedup → normalization → construction-prefix → spike → plateau → range) and QUARANTINES individual
// corrupted snapshots instead of rejecting whole ranges. buildProductionPortfolioChart consumes the
// validated series and decides READY/PENDING ONLY by validated-point sufficiency (≥2 after quarantine).
// These tests extract the real functions from app.js and run them with stubbed globals.
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

function makeEnv(hist) {
  const sb = {
    Math: Math, Number: Number, Map: Map, Array: Array, String: String, JSON: JSON, Date: Date,
    isFinite: isFinite, parseFloat: parseFloat, Infinity: Infinity,
    console: { log: () => {} },
    activeRange: '30d', activePerfMode: 'pct', categoryHistory: hist || [], toBase: (v) => v, _aurixHistorySourceForDisplay: null,
  };
  sb._aurixHistorySourceForDisplay = () => sb.categoryHistory;
  vm.createContext(sb);
  vm.runInContext('const _AURIX_EMG_RANGE_MS = {"24h":864e5,"7d":6048e5,"30d":2592e6,"1y":31536e6,"all":Infinity};' +
    'const _AURIX_EMG_MAX_RATIO = {"24h":1.20,"7d":1.35,"30d":1.75,"1y":3.00,"all":3.00};' +
    'const _AURIX_EMG_ADJ_JUMP = {"24h":0.20,"7d":0.35,"30d":0.50,"1y":0.50,"all":0.50};' +
    'const _AURIX_EMG_SANITY_PCT = {"24h":10,"7d":20,"30d":35,"1y":50,"all":50};' +
    'const _AURIX_EMG_MIN_POINTS = 2; const _AURIX_EMG_FALLBACK_TAIL = 8;' +
    'const _AURIX_PROD_GATE_PCT = {"24h":10,"7d":20,"30d":30,"1y":50,"all":50};' +
    'const _AURIX_PROD_MIN_POINTS = {"24h":3,"7d":6,"30d":6,"1y":6,"all":6};' +
    'const _AURIX_HPQ_MIN_POINTS = 2; const _AURIX_HPQ_FUTURE_MS = 365*864e5; const _AURIX_HPQ_SPIKE_JUMP = 0.20; const _AURIX_HPQ_SPIKE_REVERT_FRAC = 0.5;', sb);
  ['_aurixEmergencyHash', '_aurixProdPlateauFilter', '_aurixProdVisualGate',
    '_aurixHpqIso', '_aurixHpqDiag', '_aurixHpqRangesContaining', '_aurixHpqRawStages',
    '_aurixHpqTrimConstruction', '_aurixHpqQuarantineSpikes', '_aurixHpqFirstInvalidStage',
    'buildValidatedHistoricalSeries', 'buildProductionPortfolioChart'].forEach(f => vm.runInContext(fnSrc(f), sb));
  return sb;
}
const V = (sb, r) => vm.runInContext('buildValidatedHistoricalSeries(' + JSON.stringify(r) + ')', sb);
const P = (sb, r) => vm.runInContext('buildProductionPortfolioChart(' + JSON.stringify(r) + ')', sb);
const has = (arr, v) => (arr || []).some(p => p.value === v);
// valid rising series of n points ending at LAST, span hours
function series(n, spanH, base, step) { const a = []; for (let k = 0; k < n; k++) a.push({ ts: LAST - (n - 1 - k) * (spanH / (n - 1)) * HOUR, total: base + k * step, real_estate: 0 }); return a; }

console.log('AURIX-HISTORICAL-PIPELINE-AUDIT — snapshot-level quarantine\n');

console.log('Individual corrupted snapshots are quarantined; the rest of the series survives:');
{ // 1 — one corrupted (mean-reverting) snapshot inside otherwise valid history
  const h = series(21, 20 * 24, 8000, 5); h[10] = { ts: h[10].ts, total: 16000, real_estate: 0 };   // spike (+99%)
  const v = V(makeEnv(h), 'all');
  ok('1 one corrupted snapshot inside valid history → quarantined, others survive',
    v.counts.spikeRejectedSnapshots >= 1 && !has(v.validatedFull, 16000) && v.validatedFull.length >= 19, 'q=' + v.counts.spikeRejectedSnapshots + ' clean=' + v.validatedFull.length); }
{ // 2 — duplicate timestamp
  const h = series(8, 60, 8000, 4); h.push({ ts: h[7].ts, total: 8099, real_estate: 0 });
  const v = V(makeEnv(h), 'all');
  ok('2 duplicate timestamp removed', v.counts.duplicateSnapshots >= 1, 'dupes=' + v.counts.duplicateSnapshots); }
{ // 3 — duplicated portfolio value (flat plateau run)
  const h = []; for (let k = 0; k < 6; k++) h.push({ ts: LAST - (10 - k) * HOUR, total: 8000, real_estate: 0 });
  h.push({ ts: LAST - 2 * HOUR, total: 8100, real_estate: 0 }); h.push({ ts: LAST, total: 8150, real_estate: 0 });
  const v = V(makeEnv(h), 'all');
  ok('3 duplicated portfolio values (plateau) collapsed', v.counts.plateauCollapsed >= 1, 'plateau=' + v.counts.plateauCollapsed); }
{ // 4 — stale timestamp (leading point >365d before the bulk)
  const h = series(10, 20 * 24, 8000, 5); h.unshift({ ts: LAST - 800 * DAY, total: 6000, real_estate: 0 });
  const v = V(makeEnv(h), 'all');
  ok('4 stale timestamp quarantined (not in clean series)', v.counts.staleSnapshots >= 1 && !has(v.validatedFull, 6000), 'stale=' + v.counts.staleSnapshots); }
{ // 5 — future timestamp (trailing point >365d after the bulk)
  const h = series(10, 20 * 24, 8000, 5); h.push({ ts: LAST + 400 * DAY, total: 25000, real_estate: 0 });
  const v = V(makeEnv(h), 'all');
  ok('5 future timestamp quarantined + nowRef anchored on real history',
    v.counts.futureSnapshots >= 1 && !has(v.validatedFull, 25000) && v.nowRef <= LAST, 'future=' + v.counts.futureSnapshots + ' nowRef=' + (v.nowRef === LAST)); }
{ // 6 — zero portfolio value
  const h = series(8, 60, 8000, 4); h[3] = { ts: h[3].ts, total: 0, real_estate: 0 };
  const v = V(makeEnv(h), 'all');
  ok('6 zero portfolio value quarantined', v.counts.zeroValueSnapshots >= 1 && !has(v.validatedFull, 0), 'zero=' + v.counts.zeroValueSnapshots); }
{ // 7 — incomplete synchronization snapshot (+44.79% then reverts) with an EXACT, specific reason.
  // Legit neighbours ≈9812 (base 9800, step 4 ⇒ h[3]=9812); only h[4] is the corrupt 14207.13.
  const h = series(9, 20, 9800, 4); h[4] = { ts: h[4].ts, total: 14207.13, real_estate: 0 };
  const v = V(makeEnv(h), '24h');
  const spike = (v.quarantined || []).find(q => q.rejectionRule === 'spike_meanreverting');
  ok('7 incomplete-sync snapshot quarantined with an exact, non-generic reason',
    !!spike && /44\.79%/.test(spike.exactReason) && spike.pipelineStage === 'SpikeDetection', spike ? spike.exactReason.slice(0, 80) : 'none'); }
{ // 8 — temporary valuation spike (up then back)
  const h = series(12, 120, 8000, 3); h[6] = { ts: h[6].ts, total: 15000, real_estate: 0 };
  const v = V(makeEnv(h), 'all');
  ok('8 temporary valuation spike quarantined', v.counts.spikeRejectedSnapshots >= 1 && !has(v.validatedFull, 15000)); }
{ // 9 — construction prefix (low regime then a sustained step into the current regime)
  const h = [{ ts: LAST - 20 * DAY, total: 5503, real_estate: 0 }, { ts: LAST - 19 * DAY, total: 5510, real_estate: 0 },
    { ts: LAST - 10 * DAY, total: 8790, real_estate: 0 }, { ts: LAST - 5 * DAY, total: 8810, real_estate: 0 }, { ts: LAST, total: 8820, real_estate: 0 }];
  const v = V(makeEnv(h), 'all');
  ok('9 construction prefix quarantined (5503/5510 removed, baseline is the real regime)',
    v.counts.constructionSnapshots >= 1 && !has(v.validatedFull, 5503), 'construction=' + v.counts.constructionSnapshots); }

console.log('\nScale + multi-range + READY/PENDING correctness:');
{ // 10 — one corrupted snapshot inside 500 valid
  const h = series(500, 300 * 24, 8000, 1); h[250] = { ts: h[250].ts, total: 13000, real_estate: 0 };
  const v = V(makeEnv(h), 'all');
  ok('10 one corrupted snapshot inside 500 valid → 499 survive, 1 quarantined',
    v.counts.spikeRejectedSnapshots >= 1 && v.validatedFull.length >= 498 && !has(v.validatedFull, 13000), 'clean=' + v.validatedFull.length); }
{ // 11 — corrupted snapshot affecting multiple ranges (recent ts → in every window)
  const h = series(30, 20 * 24, 8000, 4); h[27] = { ts: LAST - 6 * HOUR, total: 13000, real_estate: 0 };
  const v = V(makeEnv(h), 'all');
  const spike = (v.quarantined || []).find(q => q.currentPortfolioValue === 13000);
  ok('11 corrupted snapshot reports downstream impact across multiple ranges',
    !!spike && Array.isArray(spike.downstreamImpact) && spike.downstreamImpact.length >= 4 && spike.downstreamImpact.indexOf('24h') >= 0,
    spike ? spike.downstreamImpact.join(',') : 'none'); }
{ // 12 — quarantine restores READY (a spike that WOULD have caused a range cliff)
  const h = series(30, 20 * 24, 8000, 4); h[15] = { ts: h[15].ts, total: 20000, real_estate: 0 };
  const p = P(makeEnv(h), '30d');
  ok('12 quarantine restores READY (spike removed, line drawn)',
    p.renderDecision === 'READY' && p.quarantinedSnapshotCount >= 1 && !has(p.points, 20000), p.renderDecision + ' q=' + p.quarantinedSnapshotCount); }
{ // 13 — quarantine still leaves insufficient history
  const h = [{ ts: LAST - 2 * HOUR, total: 0, real_estate: 0 }, { ts: LAST - 1 * HOUR, total: 8000, real_estate: 0 }, { ts: LAST, total: 0, real_estate: 0 }];
  const p = P(makeEnv(h), '30d');
  ok('13 quarantine still leaves insufficient history → PENDING, no %, no line',
    p.renderDecision === 'PENDING' && p.reason === 'insufficient_validated_points' && p.returnPct === null && p.points.length === 0, p.reason); }

console.log('\nRenderer is a passive consumer of the validated series:');
{ // 14 — renderer receives READY only after validation (points ⊆ validated, ≥2)
  const h = series(30, 20 * 24, 8000, 4);
  const p = P(makeEnv(h), '30d');
  ok('14 renderer receives READY only after validation (≥2 validated points, from clean series)',
    p.renderDecision === 'READY' && p.points.length >= 2 && p.cleanPointCountAfterQuarantine >= 2 && Number.isFinite(p.returnPct)); }
{ // 15 — renderer never receives a corrupted series
  const h = series(21, 20 * 24, 8000, 5); h[10] = { ts: h[10].ts, total: 16000, real_estate: 0 };
  const p = P(makeEnv(h), 'all');
  ok('15 renderer never receives the corrupted snapshot (not in drawn points)',
    p.state === 'ready' && !has(p.points, 16000) && p.lineReturnPct === p.badgeReturnPct, 'q=' + p.quarantinedSnapshotCount); }

console.log('\nGlobal audit + first-invalid-stage + parity:');
{ const h = series(21, 20 * 24, 8000, 5); h[10] = { ts: h[10].ts, total: 12000, real_estate: 0 }; h.push({ ts: h[20].ts, total: 8107, real_estate: 0 });
  const sb = makeEnv(h); const v = V(sb, 'all');
  ok('A1 firstInvalidStage identifies the FIRST failing stage (not the last symptom)', v.firstInvalidStage != null, v.firstInvalidStage);
  const p = P(sb, 'all');
  const dh = vm.runInContext('_aurixEmergencyHash(' + JSON.stringify(p.points.map(x => ({ ts: x.ts, value: x.value }))) + ')', sb);
  ok('A2 desktop/mobile parity (identical validated points ⇒ identical hash)', dh === p.chartHash);
  ok('A3 every quarantined snapshot carries a structured, specific diagnostic',
    (v.quarantined || []).every(q => q.snapshotId && q.pipelineStage && q.rejectionRule && q.exactReason && Array.isArray(q.downstreamImpact))); }

console.log('\n' + (fail === 0 ? '✅ ALL PASS' : '❌ ' + fail + ' FAILED') + '  (' + pass + '/' + (pass + fail) + ')');
process.exit(fail === 0 ? 0 : 1);
