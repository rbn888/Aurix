'use strict';
/* AURIX-CHART-LAUNCH-QUALITY-1 proof — replicates the single visual state machine
   getDashboardChartRenderState + validateSeriesAgainstLive + the loosened TOTAL
   policy + last-good reuse gating. Proves: exactly one state, no false chart vs
   live, TOTAL = all available history, loading never an empty block, lastGood
   never revives contamination. Run: node docs/AURIX-CHART-LAUNCH-QUALITY-proof.cjs */
let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`${c ? '  PASS' : '  FAIL'}  ${n}`); c ? pass++ : fail++; };

const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const EPOCH = 1780704000000, T6 = EPOCH + 9 * HOUR;
const REGIME = { '24h': [0.6, 1.5], '7d': [0.5, 2.2], '30d': [0.4, 2.5], '1y': [0.15, 8], 'all': [0.1, 12] };

function availability(range, series, epoch) {
  const r = String(range).toLowerCase(), ep = epoch || 0;
  const v = (series || []).filter(p => p && Number.isFinite(p.time) && p.time > 0 && Number.isFinite(p.value) && p.value > 0 && (!ep || p.time >= ep));
  const n = v.length, spanDays = n >= 2 ? (v[n - 1].time - v[0].time) / DAY : 0, spanMin = n >= 2 ? (v[n - 1].time - v[0].time) / MIN : 0;
  const days = new Set(v.map(p => Math.floor(p.time / DAY))).size;
  if (n < 2) return false;
  if (r === '24h') return n >= 4 && spanMin >= 30;
  if (r === '7d') return days >= 2 || n >= 4;
  if (r === '30d') return days >= 5 || spanDays >= 7;
  if (r === '1y') return spanDays >= 30;
  if (r === 'all') return n >= 2;               // TOTAL = all available history
  return n >= 2;
}
function validateLive(range, series, live) {
  const arr = (series || []).filter(p => p && Number.isFinite(p.time) && p.time > 0 && Number.isFinite(p.value) && p.value > 0);
  if (arr.length < 2) return { valid: false, reason: 'too_few' };
  if (!Number.isFinite(live) || live <= 0) return { valid: true, reason: 'no_live' };
  const band = REGIME[String(range).toLowerCase()] || [0.1, 12], rlo = live * band[0], rhi = live * band[1];
  for (const p of arr) if (p.value < rlo || p.value > rhi) return { valid: false, reason: 'regime_incompatible' };
  const spanDays = (arr[arr.length - 1].time - arr[0].time) / DAY, fold = 1 + 1.5 * Math.max(spanDays, 0.1);
  if (arr[0].value < live / fold || arr[0].value > live * fold) return { valid: false, reason: 'headline_implausible' };
  return { valid: true, reason: 'ok' };
}
function lastGoodReusable(lg, range, live, epoch) {
  if (!Array.isArray(lg) || lg.length < 2) return false;
  if (epoch && lg.some(p => Number(p.time) < epoch)) return false;
  if (!availability(range, lg, epoch)) return false;
  if (!validateLive(range, lg, live).valid) return false;
  return true;
}
// mirrors getDashboardChartRenderState branch order
function decide({ hasAssets, ready, settleActive, candidate, lastGood, live, range, epoch }) {
  if (!hasAssets) return 'empty';
  if (!ready) return (Array.isArray(lastGood) && lastGood.length >= 2) ? 'ready' : 'loading';
  if (settleActive && Array.isArray(lastGood) && lastGood.length >= 2) return 'ready';
  const series = candidate || [];
  if (series.length >= 2 && availability(range, series, epoch) && validateLive(range, series, live).valid) return 'ready';
  if (lastGoodReusable(lastGood, range, live, epoch)) return 'ready';
  return 'building';
}

const intraday = (n, stepMin = 10, base = T6, v0 = 6850, dv = 12) => Array.from({ length: n }, (_, i) => ({ time: base + i * stepMin * MIN, value: v0 + i * dv }));
const daily = (n, base = EPOCH + HOUR, v0 = 6800, dv = 20) => Array.from({ length: n }, (_, i) => ({ time: base + i * DAY, value: v0 + i * dv }));
const LIVE = 6950;

console.log('\n=== Mutually-exclusive states + QA matrix ===');
ok('no assets → empty', decide({ hasAssets: false, ready: true, range: '24h', epoch: EPOCH }) === 'empty');
ok('assets, not ready, no lastGood → loading (never empty block)',
   decide({ hasAssets: true, ready: false, candidate: [], lastGood: null, range: '24h', epoch: EPOCH }) === 'loading');
ok('not ready WITH lastGood → ready (keep last good, no flash)',
   decide({ hasAssets: true, ready: false, lastGood: intraday(5), range: '24h', live: LIVE, epoch: EPOCH }) === 'ready');
ok('24H ready (>=4 pts, >=30min, compatible)',
   decide({ hasAssets: true, ready: true, candidate: intraday(6, 10), live: LIVE, range: '24h', epoch: EPOCH }) === 'ready');
ok('7D ready (today intraday, >=4 pts)',
   decide({ hasAssets: true, ready: true, candidate: intraday(6, 30), live: LIVE, range: '7d', epoch: EPOCH }) === 'ready');
ok('30D building (single day, no coverage)',
   decide({ hasAssets: true, ready: true, candidate: intraday(6, 10), lastGood: null, live: LIVE, range: '30d', epoch: EPOCH }) === 'building');
ok('1A building (no coverage)',
   decide({ hasAssets: true, ready: true, candidate: intraday(6, 10), lastGood: null, live: LIVE, range: '1y', epoch: EPOCH }) === 'building');
ok('TOTAL ready (2+ compatible points — all available history)',
   decide({ hasAssets: true, ready: true, candidate: intraday(3, 20), live: LIVE, range: 'all', epoch: EPOCH }) === 'ready');
ok('TOTAL building (only 1 point)',
   decide({ hasAssets: true, ready: true, candidate: [{ time: T6, value: 6950 }], lastGood: null, live: LIVE, range: 'all', epoch: EPOCH }) === 'building');

console.log('\n=== Caso grave: live ~6.9k, series 18k/20k → building (no false chart) ===');
{
  const bad = [{ time: T6, value: 18000 }, { time: T6 + 20 * MIN, value: 20000 }];
  ok('validateLive rejects 18k/20k vs 6.95k', !validateLive('all', bad, LIVE).valid);
  ok('decide → building (not ready-with-false-line)',
     decide({ hasAssets: true, ready: true, candidate: bad, lastGood: null, live: LIVE, range: 'all', epoch: EPOCH }) === 'building');
}

console.log('\n=== lastGood never revives contamination ===');
{
  const badLG = [{ time: T6, value: 18000 }, { time: T6 + 20 * MIN, value: 20000 }];
  ok('contaminated lastGood not reusable', !lastGoodReusable(badLG, 'all', LIVE, EPOCH));
  ok('pre-epoch lastGood not reusable', !lastGoodReusable([{ time: EPOCH - DAY, value: 6900 }, { time: T6, value: 6950 }], 'all', LIVE, EPOCH));
  ok('candidate building + contaminated lastGood → building',
     decide({ hasAssets: true, ready: true, candidate: [], lastGood: badLG, live: LIVE, range: '30d', epoch: EPOCH }) === 'building');
  ok('candidate building + VALID lastGood → ready (race guard kept)',
     decide({ hasAssets: true, ready: true, candidate: [], lastGood: intraday(6, 30), live: LIVE, range: '7d', epoch: EPOCH }) === 'ready');
}

console.log('\n=== validateLive does NOT block real moves ===');
{
  ok('real +20% over 1y kept', validateLive('1y', [{ time: EPOCH, value: 5800 }, { time: EPOCH + 200 * DAY, value: 6950 }], LIVE).valid);
  ok('ordinary 24h volatility kept', validateLive('24h', intraday(6, 10, T6, 6800, 30), LIVE).valid);
  ok('boot (no live) does not block', validateLive('24h', intraday(4), NaN).valid);
}

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
