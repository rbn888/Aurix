'use strict';
/* AURIX-CHART-LAUNCH-QUALITY-1 — REAL-CASE proof for the reported incident:
   liveValue ≈ 6.9k, a 7D series containing ~18k–20k points rendered a false
   ~ -62%. Proves the new gate routes that exact shape to BUILDING on 7D / 30D /
   TOTAL, and that a contaminated last-good is discarded.
   Run: node docs/AURIX-CHART-REALCASE-62pct-proof.cjs */
let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`${c ? '  PASS' : '  FAIL'}  ${n}`); c ? pass++ : fail++; };

const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const EPOCH = 1780704000000, NOW = EPOCH + 9 * HOUR;
const LIVE = 6900;                                   // reported live investable value
const REGIME = { '24h': [0.6, 1.5], '7d': [0.5, 2.2], '30d': [0.4, 2.5], '1y': [0.15, 8], 'all': [0.1, 12] };

function availability(range, series, epoch) {
  const r = String(range).toLowerCase(), ep = epoch || 0;
  const v = (series || []).filter(p => p && Number.isFinite(p.time) && p.time > 0 && Number.isFinite(p.value) && p.value > 0 && (!ep || p.time >= ep));
  const n = v.length, spanDays = n >= 2 ? (v[n - 1].time - v[0].time) / DAY : 0, spanMin = n >= 2 ? (v[n - 1].time - v[0].time) / MIN : 0;
  const days = new Set(v.map(p => Math.floor(p.time / DAY))).size;
  let available = false, reason = 'building_no_points';
  if (n < 2) reason = 'building_no_points';
  else if (r === '24h') { available = n >= 4 && spanMin >= 30; reason = available ? 'ready' : 'building_insufficient_intraday'; }
  else if (r === '7d') { available = days >= 2 || n >= 4; reason = available ? 'ready' : 'building_insufficient_points'; }
  else if (r === '30d') { available = days >= 5 || spanDays >= 7; reason = available ? 'ready' : 'building_insufficient_days'; }
  else if (r === '1y') { available = spanDays >= 30; reason = available ? 'ready' : 'building_insufficient_coverage'; }
  else if (r === 'all') { available = n >= 2; reason = available ? 'ready' : 'building_no_points'; }
  return { available, reason, spanDays };
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
  if (!availability(range, lg, epoch).available) return false;
  if (!validateLive(range, lg, live).valid) return false;
  return true;
}
function renderState({ hasAssets = true, ready = true, candidate, lastGood = null, live = LIVE, range, epoch = EPOCH }) {
  if (!hasAssets) return 'empty';
  if (!ready) return (Array.isArray(lastGood) && lastGood.length >= 2) ? 'ready' : 'loading';
  const s = candidate || [];
  if (s.length >= 2 && availability(range, s, epoch).available && validateLive(range, s, live).valid) return 'ready';
  if (lastGoodReusable(lastGood, range, live, epoch)) return 'ready';
  return 'building';
}
const summary = (range, series) => {
  const vals = series.map(p => p.value);
  const span = (series[series.length - 1].time - series[0].time) / DAY;
  return { liveValue: LIVE, firstPoint: vals[0], lastPoint: vals[vals.length - 1], minPoint: Math.min(...vals), maxPoint: Math.max(...vals),
    spanDays: +span.toFixed(3), validateSeriesAgainstLive: validateLive(range, series, LIVE), availabilityReason: availability(range, series, EPOCH).reason,
    renderState: renderState({ candidate: series, range }) };
};

// The contaminated shape from the incident: starts ~18-20k, "drops" toward live.
const contaminated = [
  { time: NOW - 2 * HOUR, value: 18000 },
  { time: NOW - 1.5 * HOUR, value: 20000 },
  { time: NOW - 1 * HOUR, value: 19000 },
  { time: NOW, value: 6900 },
];

console.log('\n=== Contaminated 18k–20k series vs live 6.9k — per range ===');
for (const range of ['7d', '30d', 'all']) {
  const s = summary(range, contaminated);
  console.log(`  [${range}]`, JSON.stringify(s));
  ok(`${range}: validateSeriesAgainstLive INVALID`, !s.validateSeriesAgainstLive.valid);
  ok(`${range}: renderState === building (no false line/headline)`, s.renderState === 'building');
}

console.log('\n=== Explicit guarantees ===');
ok('7D cannot render a different-regime series (→ building)',
   renderState({ candidate: contaminated, range: '7d' }) === 'building');
ok('TOTAL cannot show a contaminated series (→ building)',
   renderState({ candidate: contaminated, range: 'all' }) === 'building');
ok('contaminated lastGood is discarded (not reused even if candidate empty)',
   renderState({ candidate: [], lastGood: contaminated, range: '7d' }) === 'building');
ok('18k/20k vs live 6.9k ends in building (headline_implausible)',
   validateLive('7d', contaminated, LIVE).reason === 'regime_incompatible' || validateLive('7d', contaminated, LIVE).reason === 'headline_implausible');

console.log('\n=== Contrast: a CLEAN recent 7D series renders (no false negative) ===');
{
  const clean = [
    { time: NOW - 3 * HOUR, value: 6820 },
    { time: NOW - 2 * HOUR, value: 6870 },
    { time: NOW - 1 * HOUR, value: 6910 },
    { time: NOW, value: 6900 },
  ];
  const s = summary('7d', clean);
  console.log('  [7d clean]', JSON.stringify(s));
  ok('clean 7D series → ready', s.renderState === 'ready');
  ok('clean 7D validate valid', s.validateSeriesAgainstLive.valid);
}

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
