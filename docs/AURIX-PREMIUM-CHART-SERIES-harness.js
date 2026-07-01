'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-PREMIUM-CHART-SERIES-harness — P0 institutional chart-series + baseline quality
// ════════════════════════════════════════════════════════════════════════════
// buildEmergencyInstitutionalChart(range) must produce a CLEAN institutional series and a TRUSTWORTHY
// return: leading construction/regime spikes stripped, interior mean-reverting spikes removed, baseline
// taken ONLY from the clean visible series, the return computed ONLY from first→last of the drawn line
// (badge return == line return), a tightened plausibility gate that kills the +59/+60% construction
// artifact and any −67%, honest range-collapse, and desktop/mobile point parity. These tests extract the
// pure functions from app.js and run them with stubbed globals (anchor = last snapshot ts, not Date.now).
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

const HOUR = 3600000, DAY = 86400000;
const LAST = 1800000000000;
const FAKE_NOW = LAST + 100 * DAY;

function makeEnv(hist, opts) {
  opts = opts || {};
  const sb = {
    Math: Math, Number: Number, Map: Map, Array: Array, String: String, JSON: JSON,
    isFinite: isFinite, parseFloat: parseFloat,
    Date: { now: () => FAKE_NOW }, console: { log: () => {} },
    activeRange: opts.activeRange || '30d', activePerfMode: 'pct',
    categoryHistory: hist || [], toBase: (v) => v, _aurixHistorySourceForDisplay: null,
  };
  sb._aurixHistorySourceForDisplay = () => sb.categoryHistory;
  vm.createContext(sb);
  vm.runInContext('const _AURIX_EMG_RANGE_MS = {"24h":864e5,"7d":6048e5,"30d":2592e6,"1y":31536e6,"all":Infinity};' +
    'const _AURIX_EMG_MAX_RATIO = {"24h":1.20,"7d":1.35,"30d":1.75,"1y":3.00,"all":3.00};' +
    'const _AURIX_EMG_ADJ_JUMP = {"24h":0.20,"7d":0.35,"30d":0.50,"1y":0.50,"all":0.50};' +
    'const _AURIX_EMG_SANITY_PCT = {"24h":10,"7d":20,"30d":35,"1y":50,"all":50};' +
    'const _AURIX_EMG_MIN_POINTS = 2; const _AURIX_EMG_FALLBACK_TAIL = 8;', sb);
  ['_aurixEmergencyHash', '_aurixEmergencyRawSeries', '_aurixEmergencyTrimPrefix', '_aurixEmergencyDeSpike',
    'buildEmergencyInstitutionalChart', '_aurixEmergencyBuildSvg'].forEach(f => vm.runInContext(fnSrc(f), sb));
  return sb;
}
const B = (sb, r) => vm.runInContext('buildEmergencyInstitutionalChart(' + JSON.stringify(r) + ')', sb);

console.log('AURIX-PREMIUM-CHART-SERIES — institutional series + baseline quality\n');

// Stable regime ≈ 8800 with a LEADING construction spike (5503) that is IN the 30d ratio band but
// steps > 50% into the regime — the classic +60% artifact.
const constructionSpike = [
  { ts: LAST - 20 * DAY, total: 5503, real_estate: 0 },   // construction low — must be stripped
  { ts: LAST - 10 * DAY, total: 8790, real_estate: 0 },
  { ts: LAST - 5 * DAY, total: 8810, real_estate: 0 },
  { ts: LAST - 1 * DAY, total: 8820, real_estate: 0 },
  { ts: LAST, total: 8800, real_estate: 0 },
];

console.log('Rule 2 — construction prefix removal:');
{ const emg = B(makeEnv(constructionSpike), '30d');
  ok('1 leading construction spike is removed (prefix count ≥ 1, firstStable ≠ 5503)',
    emg.rejectedConstructionPrefixCount >= 1 && emg.firstStablePointValue !== 5503, 'trimmed=' + emg.rejectedConstructionPrefixCount + ' firstStable=' + emg.firstStablePointValue);
  ok('2 the removed construction point can NEVER be the baseline',
    emg.baselineValue !== 5503 && (emg.points || []).every(p => p.value !== 5503), 'baseline=' + emg.baselineValue); }

console.log('\nRules 3+6 — +60% construction artifact rejected:');
{ // baseline would be 5503 (in band) → +60% → must be pending_sanity, never a fabricated %
  const hist = [
    { ts: LAST - 20 * DAY, total: 5503, real_estate: 0 },
    { ts: LAST - 19 * DAY, total: 5510, real_estate: 0 },   // gentle step keeps 5503 "stable" by jump-test
    { ts: LAST - 10 * DAY, total: 8790, real_estate: 0 },
    { ts: LAST - 5 * DAY, total: 8810, real_estate: 0 },
    { ts: LAST, total: 8820, real_estate: 0 },
  ];
  const emg = B(makeEnv(hist), '30d');
  ok('3 +60% from a construction artifact → pending_sanity (no fabricated %)',
    emg.state === 'pending' && emg.reason === 'pending_sanity' && emg.returnPct === null, emg.state + '/' + emg.reason + ' pct=' + emg.returnPct); }

console.log('\nRule 4/6 — -67% regime baseline impossible:');
{ // current ≈ 1960, an old 5503 regime (ratio 2.8 > 1.75) must be stripped → no -67%
  const hist = [
    { ts: LAST - 20 * DAY, total: 5503, real_estate: 0 },
    { ts: LAST - 19 * DAY, total: 5480, real_estate: 0 },
    { ts: LAST - 10 * DAY, total: 1980, real_estate: 0 },
    { ts: LAST - 5 * DAY, total: 1965, real_estate: 0 },
    { ts: LAST, total: 1960, real_estate: 0 },
  ];
  const emg = B(makeEnv(hist), '30d');
  ok('4 -67% from a regime baseline is impossible (baseline ≠ 5503, return not ≈ -67%)',
    emg.baselineValue !== 5503 && (emg.state !== 'ready' || emg.returnPct > -35), 'baseline=' + emg.baselineValue + ' pct=' + emg.returnPct); }

console.log('\nRule 4 — line return == badge return:');
{ // 24H healthy: values 8600..8700 over 23h → small positive within 10% gate
  const h24 = []; for (let i = 23; i >= 0; i--) h24.push({ ts: LAST - i * HOUR, total: 8600 + (23 - i) * 4, real_estate: 0 });
  const emg = B(makeEnv(h24), '24h');
  ok('5 24H line return equals badge return (single value from first→last of the drawn line)',
    emg.state === 'ready' && emg.lineReturnPct === emg.badgeReturnPct && emg.lineReturnPct === emg.returnPct &&
    Math.abs(emg.returnPct - ((emg.lastValue - emg.firstValue) / emg.firstValue * 100)) < 0.01, 'pct=' + emg.returnPct); }
{ const h7 = []; for (let i = 160; i >= 0; i -= 4) h7.push({ ts: LAST - i * HOUR, total: 8600 + (160 - i) * 2, real_estate: 0 });
  const emg = B(makeEnv(h7), '7d');
  ok('6 7D line return equals badge return',
    emg.state === 'ready' && emg.lineReturnPct === emg.badgeReturnPct &&
    Math.abs(emg.returnPct - ((emg.lastValue - emg.firstValue) / emg.firstValue * 100)) < 0.01, 'pct=' + emg.returnPct); }

console.log('\nRule 5 — honest range collapse on short history:');
{ // only ~5 days of clean history — 7D/30D/1Y all show the SAME series + SAME return
  const hist = []; for (let i = 5 * 24; i >= 0; i -= 6) hist.push({ ts: LAST - i * HOUR, total: 8700 + (5 * 24 - i), real_estate: 0 });
  const sb = makeEnv(hist);
  const d30 = B(sb, '30d'), d1y = B(sb, '1y'), d7 = B(sb, '7d'), dall = B(sb, 'all');
  ok('7 30D/1Y/ALL collapse honestly (flag set; same clean series + identical return as 7D)',
    d30.rangeCollapsedBecauseHistoryTooShort === true && d1y.rangeCollapsedBecauseHistoryTooShort === true &&
    d30.returnPct === d7.returnPct && d1y.returnPct === d7.returnPct && d30.chartHash === dall.chartHash,
    '30d=' + d30.returnPct + ' 7d=' + d7.returnPct + ' collapsed30=' + d30.rangeCollapsedBecauseHistoryTooShort); }

console.log('\nRule 8 — desktop/mobile parity:');
{ const emg = B(makeEnv(constructionSpike), '30d');
  const dHash = vm.runInContext('_aurixEmergencyHash(' + JSON.stringify(emg.points.map(p => ({ ts: p.ts, value: p.value }))) + ')', makeEnv(constructionSpike));
  ok('8 desktop and mobile hashes match (same clean series; adapters rename keys only)',
    emg.chartHash === dHash || emg.state === 'pending', 'chartHash=' + emg.chartHash); }
{ // guaranteed-ready case for a hard parity check
  const h = []; for (let i = 20; i >= 0; i--) h.push({ ts: LAST - i * HOUR, total: 9000 + (20 - i) * 3, real_estate: 0 });
  const emg = B(makeEnv(h), '24h');
  const desk = emg.points.map(p => ({ ts: p.ts, value: p.value }));
  const mob = emg.points.map(p => ({ ts: p.ts, value: p.value }));
  const dh = vm.runInContext('_aurixEmergencyHash(' + JSON.stringify(desk) + ')', makeEnv(h));
  const mh = vm.runInContext('_aurixEmergencyHash(' + JSON.stringify(mob) + ')', makeEnv(h));
  ok('8b ready-case desktop hash === mobile hash === chartHash', emg.state === 'ready' && dh === mh && dh === emg.chartHash, dh + '/' + mh); }

console.log('\nRule 7/9/10/11 — dedupe, spike/tower removal, endpoint preservation:');
{ const hist = [
    { ts: LAST - 2 * HOUR, total: 8000, real_estate: 0 },
    { ts: LAST, total: 8100, real_estate: 0 },
    { ts: LAST, total: 8050, real_estate: 0 },   // duplicate ts
  ];
  const emg = B(makeEnv(hist), '30d');
  ok('9 duplicate timestamps removed (rejectedDuplicateCount ≥ 1, one point per ts)',
    emg.rejectedDuplicateCount >= 1 && emg.currentValue === 8050, 'dupes=' + emg.rejectedDuplicateCount + ' cur=' + emg.currentValue); }
{ const hist = [
    { ts: LAST - 4 * HOUR, total: 8000, real_estate: 0 },
    { ts: LAST - 3 * HOUR, total: 8020, real_estate: 0 },
    { ts: LAST - 2 * HOUR, total: 13000, real_estate: 0 },   // one-point tower (spike, mean-reverts)
    { ts: LAST - 1 * HOUR, total: 8030, real_estate: 0 },
    { ts: LAST, total: 8040, real_estate: 0 },
  ];
  const emg = B(makeEnv(hist), '24h');
  ok('10 vertical one-point towers removed (spike dropped, not in drawn points)',
    emg.rejectedSpikeCount >= 1 && (emg.points || []).every(p => p.value !== 13000), 'spikes=' + emg.rejectedSpikeCount);
  ok('11 first and last clean values preserved (drawn endpoints === baseline / current)',
    emg.state === 'ready' && emg.firstValue === emg.baselineValue && emg.lastValue === emg.currentValue &&
    emg.lastValue === 8040, 'first=' + emg.firstValue + ' last=' + emg.lastValue); }

console.log('\nAcceptance invariant across every range (no absurd %, line==badge, parity):');
{ const scenarios = { healthy: [], construction: constructionSpike };
  for (let i = 30 * 24; i >= 0; i -= 6) scenarios.healthy.push({ ts: LAST - i * HOUR, total: 8500 + (30 * 24 - i) * 0.15, real_estate: 0 });
  let allOk = true; const detail = {};
  Object.keys(scenarios).forEach(name => { ['24h', '7d', '30d', '1y', 'all'].forEach(r => {
    const emg = B(makeEnv(scenarios[name]), r);
    const gate = { '24h': 10, '7d': 20, '30d': 35, '1y': 50, all: 50 }[r];
    const good = (emg.state === 'ready' && emg.points.length >= 2 && emg.returnPct !== null &&
        emg.lineReturnPct === emg.badgeReturnPct && Math.abs(emg.returnPct) <= gate) ||
      (emg.state === 'pending' && emg.returnPct === null);
    if (!good) { allOk = false; detail[name + ':' + r] = emg.state + '/' + emg.reason + '/' + emg.returnPct; }
  }); });
  ok('12 every range: ready (clean line + truthful ≤gate %, line==badge) OR pending (no %)', allOk, JSON.stringify(detail)); }

console.log('\n' + (fail === 0 ? '✅ ALL PASS' : '❌ ' + fail + ' FAILED') + '  (' + pass + '/' + (pass + fail) + ')');
process.exit(fail === 0 ? 0 : 1);
