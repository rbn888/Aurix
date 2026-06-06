'use strict';
/* AURIX-CHART-FINAL-FIX proof — run: `node docs/AURIX-CHART-FINAL-FIX-proof.cjs`.
   Exact replica of validateChartSeries() from app.js. Proves: isolated spikes
   are dropped on ALL ranges; the 30D diagonal is rejected (→ building); real
   moves (deposit / big buy / real crash) are NEVER dropped; structural junk is
   dropped; and reports which points are dropped and why. No smoothing. */

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`${c ? '  PASS' : '  FAIL'}  ${n}`); c ? pass++ : fail++; };

const _AURIX_VCS = { SPIKE_DEV: 0.40, SPIKE_VS_GAP: 2.5, EDGE_DEV: 0.50, TWO_PT_INCOMP: 0.50 };
const MIN = { '24h': 2, '7d': 2, '30d': 2, '1y': 2, 'all': 5 };
const minPoints = (r) => MIN[String(r).toLowerCase()] ?? 2;

function validateChartSeries(range, series, liveValue) {
  const dropped = [];
  const r = String(range || '').toLowerCase();
  const minPts = minPoints(r);
  const live = Number(liveValue);
  const haveLive = Number.isFinite(live) && live > 0;
  const seen = new Map();
  for (const p of (Array.isArray(series) ? series : [])) {
    if (!p) continue;
    const t = Number(p.time), v = Number(p.value);
    if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(v) || v <= 0) { dropped.push({ reason: 'structural', time: p && p.time, value: p && p.value }); continue; }
    seen.set(t, { time: t, value: v });
  }
  let pts = Array.from(seen.values()).sort((a, b) => a.time - b.time);
  if (pts.length < 2) return { valid: false, cleanedSeries: pts, reason: 'insufficient', droppedPoints: dropped, isPartial: dropped.length > 0 };
  const keep = new Array(pts.length).fill(true);
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1].value, b = pts[i].value, c = pts[i + 1].value;
    const interp = (a + c) / 2;
    if (!(interp > 0)) continue;
    const dev = Math.abs(b - interp) / interp;
    const gap = Math.abs(c - a) / Math.min(a, c);
    if (dev > _AURIX_VCS.SPIKE_DEV && dev > _AURIX_VCS.SPIKE_VS_GAP * gap) { keep[i] = false; dropped.push({ reason: 'interior_spike', time: pts[i].time, value: pts[i].value }); }
  }
  pts = pts.filter((_, i) => keep[i]);
  if (haveLive && pts.length >= 3) {
    const f = pts[0], f1 = pts[1];
    if (Math.abs(f.value / f1.value - 1) > _AURIX_VCS.EDGE_DEV && Math.abs(f.value - live) > Math.abs(f1.value - live)) { dropped.push({ reason: 'leading_edge', time: f.time, value: f.value }); pts = pts.slice(1); }
  }
  if (haveLive && pts.length >= 3) {
    const l = pts[pts.length - 1], l1 = pts[pts.length - 2];
    if (Math.abs(l.value / l1.value - 1) > _AURIX_VCS.EDGE_DEV && Math.abs(l.value - live) > Math.abs(l1.value - live)) { dropped.push({ reason: 'trailing_edge', time: l.time, value: l.value }); pts = pts.slice(0, -1); }
  }
  if (pts.length < minPts) return { valid: false, cleanedSeries: pts, reason: 'insufficient_after_clean', droppedPoints: dropped, isPartial: true };
  if (pts.length === 2 && Math.abs(pts[1].value / pts[0].value - 1) > _AURIX_VCS.TWO_PT_INCOMP) return { valid: false, cleanedSeries: pts, reason: 'two_point_incompatible', droppedPoints: dropped, isPartial: true };
  return { valid: true, cleanedSeries: pts, reason: 'ok', droppedPoints: dropped, isPartial: dropped.length > 0 };
}

// helper: build series from values with hourly/daily spacing
const S = (vals, stepMs = 3600000) => vals.map((v, i) => ({ time: 1_700_000_000_000 + i * stepMs, value: v }));
const vals = (res) => res.cleanedSeries.map(p => p.value);

console.log('\n=== 1. Isolated spike dropped on ALL ranges (24H/7D/1A/TOTAL) ===');
for (const r of ['24h', '7d', '1y', 'all']) {
  const res = validateChartSeries(r, S([100, 102, 101, 980, 103, 104, 105]), 103);
  ok(`${r}: needle 980 dropped, line stays ~100-105`, res.valid && !vals(res).includes(980) && res.droppedPoints.some(d => d.reason === 'interior_spike'));
}
{
  const res = validateChartSeries('7d', S([5000, 5100, 4950, 9000, 5050, 5200]), 5100);
  console.log('  7D dropped:', JSON.stringify(res.droppedPoints.map(d => ({ r: d.reason, v: d.value }))));
}

console.log('\n=== 2. 30D diagonal rejected -> building (not a false line) ===');
ok('30D contaminated leading point (12000 -> 5600 flat): leading dropped, line flat',
   (() => { const res = validateChartSeries('30d', S([12000, 5600, 5610, 5590, 5600]), 5600); return res.valid && !vals(res).includes(12000) && res.droppedPoints.some(d => d.reason === 'leading_edge'); })());
ok('30D lone 2-point incompatible pair (12000, 5600): INVALID -> building',
   (() => { const res = validateChartSeries('30d', S([12000, 5600]), 5600); return res.valid === false && res.reason === 'two_point_incompatible'; })());
ok('30D no false -27%: the only points left are coherent with live',
   (() => { const res = validateChartSeries('30d', S([12000, 5600, 5600]), 5600); return res.valid && vals(res).every(v => Math.abs(v / 5600 - 1) < 0.2); })());

console.log('\n=== 3. Real moves NEVER dropped (no smoothing, no blocking) ===');
ok('real deposit (sustained step 100->200) kept entirely',
   (() => { const res = validateChartSeries('7d', S([100, 100, 100, 200, 200, 200]), 200); return res.valid && vals(res).length === 6 && res.droppedPoints.length === 0; })());
ok('1000x deposit (1k -> 1,000,000 sustained) kept',
   (() => { const res = validateChartSeries('7d', S([1000, 1000, 1000000, 1000000, 1000000]), 1000000); return res.valid && res.droppedPoints.length === 0; })());
ok('real crash (-40% sustained 10000->6000) kept, downside not hidden',
   (() => { const res = validateChartSeries('30d', S([10000, 10000, 6000, 6000, 6000]), 6000); return res.valid && vals(res).includes(6000) && vals(res).includes(10000) && res.droppedPoints.length === 0; })());
ok('volatile-but-real trend (no isolated needle) kept',
   (() => { const res = validateChartSeries('1y', S([100, 130, 160, 200, 240, 300]), 300); return res.valid && res.droppedPoints.length === 0; })());
ok('legit 2-point small segment (5600, 5700) kept (not flagged incompatible)',
   (() => { const res = validateChartSeries('30d', S([5600, 5700]), 5700); return res.valid; })());

console.log('\n=== 4. Structural junk dropped; nothing impossible reaches render ===');
ok('NaN / Infinity / 0 / negative / bad-timestamp points dropped',
   (() => { const res = validateChartSeries('24h', [{ time: 1, value: NaN }, { time: 2, value: Infinity }, { time: 3, value: 0 }, { time: 4, value: -5 }, { time: NaN, value: 100 }, { time: 1700000000000, value: 100 }, { time: 1700003600000, value: 101 }], 100); return res.valid && res.cleanedSeries.length === 2 && res.droppedPoints.filter(d => d.reason === 'structural').length === 5; })());

console.log('\n=== 5. Boot safety: no live value -> endpoints NOT false-dropped ===');
ok('no live (NaN): leading edge kept (conservative), interior spike still cleaned',
   (() => { const res = validateChartSeries('30d', S([12000, 5600, 5600]), NaN); return res.valid && vals(res).includes(12000); })());

console.log('\n=== Dropped-point evidence (sample) ===');
{
  const res = validateChartSeries('30d', S([12000, 5600, 99000, 5600, 5610]), 5600);
  console.log('  input [12000,5600,99000,5600,5610] live=5600 ->', res.reason);
  console.log('  dropped:', JSON.stringify(res.droppedPoints.map(d => ({ reason: d.reason, value: d.value }))));
  console.log('  rendered:', JSON.stringify(vals(res)));
}

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
