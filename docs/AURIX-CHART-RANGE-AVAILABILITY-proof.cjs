'use strict';
/* AURIX-CHART-RANGE-AVAILABILITY-1 proof — replicates getRangeAvailability from
   app.js. Proves the per-range availability policy: a range only renders when it
   has REAL temporal coverage (distinct days / span), not merely >=2 points. With
   the CURRENT data (clean history only since the 6-jun baseline) it must give:
   24H ready · 7D ready (recent baseline) · 30D building · 1A building · TOTAL building.
   Run: node docs/AURIX-CHART-RANGE-AVAILABILITY-proof.cjs */
let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`${c ? '  PASS' : '  FAIL'}  ${n}`); c ? pass++ : fail++; };

function getRangeAvailability(range, cleanSeries, epoch) {
  const r = String(range || '').toLowerCase();
  const arr = Array.isArray(cleanSeries) ? cleanSeries : [];
  const ep = Number(epoch) > 0 ? Number(epoch) : 0;
  const valid = arr.filter(p => p && Number.isFinite(p.time) && p.time > 0 &&
    Number.isFinite(p.value) && p.value > 0 && (!ep || p.time >= ep));
  const pointCount = valid.length;
  const coverageStart = pointCount ? valid[0].time : null;
  const coverageEnd = pointCount ? valid[pointCount - 1].time : null;
  const spanMs = pointCount >= 2 ? (coverageEnd - coverageStart) : 0;
  const spanDays = spanMs / 86400000;
  const spanMin = spanMs / 60000;
  const dayset = new Set();
  for (let i = 0; i < valid.length; i++) dayset.add(Math.floor(valid[i].time / 86400000));
  const uniqueDays = dayset.size;
  let available = false, reason = 'building', recentBaseline = false;
  if (pointCount < 2) { reason = 'building_no_points'; }
  else if (r === '24h') { available = pointCount >= 4 && spanMin >= 30; reason = available ? 'ready' : 'building_insufficient_intraday'; }
  else if (r === '7d') { available = uniqueDays >= 2 || pointCount >= 4; reason = available ? 'ready' : 'building_insufficient_points'; recentBaseline = available && uniqueDays < 7; }
  else if (r === '30d') { available = uniqueDays >= 5 || spanDays >= 7; reason = available ? 'ready' : 'building_insufficient_days'; recentBaseline = available && uniqueDays < 30; }
  else if (r === '1y') { available = spanDays >= 30; reason = available ? 'ready' : 'building_insufficient_coverage'; recentBaseline = available && spanDays < 365; }
  else if (r === 'all') { available = pointCount >= 2; reason = available ? 'ready' : 'building_no_points'; recentBaseline = false; } /* AURIX-CHART-LAUNCH-QUALITY: TOTAL = all available history */
  else { available = pointCount >= 2; reason = available ? 'ready' : 'building_no_points'; }
  return { available, reason, recentBaseline, uniqueDays, pointCount, spanDays, coverageStart, coverageEnd };
}

const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const EPOCH = 1780704000000;          // 2026-06-06T00:00:00Z baseline
const T6 = EPOCH + 9 * HOUR;          // 6 jun, 09:00 — "today" intraday start
// intraday points on 6 jun, 5-min apart
const intraday = (count, stepMin = 5, base = T6) =>
  Array.from({ length: count }, (_, i) => ({ time: base + i * stepMin * MIN, value: 7000 + i }));
// daily points across N distinct days from the baseline
const daily = (days, base = EPOCH + HOUR) =>
  Array.from({ length: days }, (_, i) => ({ time: base + i * DAY, value: 7000 + i * 10 }));

console.log('\n=== CURRENT DATA: clean history only since 6-jun baseline ===');
{
  const today = intraday(8);          // 8 intraday points spanning ~35 min, ONE day
  ok('24H → READY (>=4 pts, >=30 min span)',
     (() => { const a = getRangeAvailability('24h', today, EPOCH); return a.available && a.reason === 'ready'; })());
  ok('7D  → READY with recent-baseline note (1 day but >=4 pts)',
     (() => { const a = getRangeAvailability('7d', today, EPOCH); return a.available && a.recentBaseline && a.uniqueDays === 1; })());
  ok('30D → BUILDING (1 day, no 5-day / 7-day coverage)',
     (() => { const a = getRangeAvailability('30d', today, EPOCH); return !a.available && a.reason === 'building_insufficient_days'; })());
  ok('1A  → BUILDING (span far below 30 days)',
     (() => { const a = getRangeAvailability('1y', today, EPOCH); return !a.available; })());
  ok('TOTAL → READY (all available history; 2+ points, NOT 30D/1A)',
     (() => { const a = getRangeAvailability('all', today, EPOCH); return a.available; })());
}

console.log('\n=== 24H sufficiency ===');
{
  ok('3 points → building (need >=4)', !getRangeAvailability('24h', intraday(3), EPOCH).available);
  ok('4 points but only ~15 min span → building (need >=30 min)',
     !getRangeAvailability('24h', intraday(4, 5), EPOCH).available); // 4 pts * 5min = 15min span
  ok('4 points spanning 45 min → ready',
     getRangeAvailability('24h', intraday(4, 15), EPOCH).available); // 3 gaps * 15 = 45min
}

console.log('\n=== 7D honesty ===');
{
  ok('1 day, 3 points → building (too few)', !getRangeAvailability('7d', intraday(3), EPOCH).available);
  ok('2 distinct days → ready', getRangeAvailability('7d', daily(2), EPOCH).available);
  ok('full week (7 days) → ready, NOT flagged recent', (() => { const a = getRangeAvailability('7d', daily(7), EPOCH); return a.available && !a.recentBaseline; })());
}

console.log('\n=== 30D must have real coverage ===');
{
  ok('2 same-day points → building (the -0.06% bug case)',
     !getRangeAvailability('30d', [{ time: T6, value: 7000 }, { time: T6 + 20 * MIN, value: 6996 }], EPOCH).available);
  ok('4 distinct days → still building (need >=5 days or >=7 span)',
     !getRangeAvailability('30d', daily(4), EPOCH).available);
  ok('5 distinct days → ready', getRangeAvailability('30d', daily(5), EPOCH).available);
  ok('8-day real span → ready', getRangeAvailability('30d', daily(8), EPOCH).available);
}

console.log('\n=== 1A / TOTAL thresholds ===');
{
  ok('1A: 20-day span → building', !getRangeAvailability('1y', daily(20), EPOCH).available);
  ok('1A: 31-day span → ready', getRangeAvailability('1y', daily(31), EPOCH).available);
  ok('TOTAL: 1 point → building', !getRangeAvailability('all', daily(1), EPOCH).available);
  ok('TOTAL: 2 points → ready (all available history)', getRangeAvailability('all', daily(2), EPOCH).available);
  ok('TOTAL: 5 days → ready', getRangeAvailability('all', daily(5), EPOCH).available);
}

console.log('\n=== Epoch hygiene ===');
{
  // pre-baseline points must NOT count toward coverage
  const preBase = [{ time: EPOCH - 40 * DAY, value: 18000 }, { time: EPOCH - 30 * DAY, value: 19000 }];
  ok('pre-baseline points excluded → building (no false 30D coverage)',
     !getRangeAvailability('30d', preBase.concat([{ time: T6, value: 7000 }]), EPOCH).available);
  ok('0 points → building', !getRangeAvailability('30d', [], EPOCH).available);
}

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
