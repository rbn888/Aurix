'use strict';
/* AURIX-CHART-FINAL-FIX + CLOSEOUT proof — run:
   `node docs/AURIX-CHART-FINAL-FIX-proof.cjs`.
   Exact replica of validateChartSeries() from app.js. Proves: isolated spikes
   dropped on ALL ranges; single contaminated endpoint dropped; the pure 2-point
   30D diagonal rejected → building; REAL moves (deposit / crash / growth /
   volatility) are NEVER dropped (hard rule); structural junk dropped. Also
   documents the ONE residual it deliberately does NOT touch: a sustained
   contaminated plateau, which is structurally identical to a real move and so
   can only be removed at the data layer (reversible epoch re-baseline). */

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
    if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(v) || v <= 0) { dropped.push({ reason: 'structural', value: p && p.value }); continue; }
    seen.set(t, { time: t, value: v });
  }
  let pts = Array.from(seen.values()).sort((a, b) => a.time - b.time);
  if (pts.length < 2) return { valid: false, cleanedSeries: pts, reason: 'insufficient', droppedPoints: dropped, isPartial: dropped.length > 0 };
  const keep = new Array(pts.length).fill(true);
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1].value, b = pts[i].value, c = pts[i + 1].value;
    const interp = (a + c) / 2; if (!(interp > 0)) continue;
    const dev = Math.abs(b - interp) / interp, gap = Math.abs(c - a) / Math.min(a, c);
    if (dev > _AURIX_VCS.SPIKE_DEV && dev > _AURIX_VCS.SPIKE_VS_GAP * gap) { keep[i] = false; dropped.push({ reason: 'interior_spike', value: pts[i].value }); }
  }
  pts = pts.filter((_, i) => keep[i]);
  if (haveLive && pts.length >= 3) {
    const f = pts[0], f1 = pts[1];
    if (Math.abs(f.value / f1.value - 1) > _AURIX_VCS.EDGE_DEV && Math.abs(f.value - live) > Math.abs(f1.value - live)) { dropped.push({ reason: 'leading_edge', value: f.value }); pts = pts.slice(1); }
  }
  if (haveLive && pts.length >= 3) {
    const l = pts[pts.length - 1], l1 = pts[pts.length - 2];
    if (Math.abs(l.value / l1.value - 1) > _AURIX_VCS.EDGE_DEV && Math.abs(l.value - live) > Math.abs(l1.value - live)) { dropped.push({ reason: 'trailing_edge', value: l.value }); pts = pts.slice(0, -1); }
  }
  if (pts.length < minPts) return { valid: false, cleanedSeries: pts, reason: 'insufficient_after_clean', droppedPoints: dropped, isPartial: true };
  if (pts.length === 2 && Math.abs(pts[1].value / pts[0].value - 1) > _AURIX_VCS.TWO_PT_INCOMP) return { valid: false, cleanedSeries: pts, reason: 'two_point_incompatible', droppedPoints: dropped, isPartial: true };
  return { valid: true, cleanedSeries: pts, reason: 'ok', droppedPoints: dropped, isPartial: dropped.length > 0 };
}

const S = (vals) => vals.map((v, i) => ({ time: 1_700_000_000_000 + i * 86400000, value: v }));
const vals = (res) => res.cleanedSeries.map(p => p.value);
const pctOf = (res, live) => res.valid ? +(((live - res.cleanedSeries[0].value) / res.cleanedSeries[0].value) * 100).toFixed(1) : null;

console.log('\n=== 1. Isolated spike dropped on ALL ranges ===');
for (const r of ['24h', '7d', '1y', 'all']) {
  const res = validateChartSeries(r, S([100, 102, 101, 980, 103, 104, 105]), 103);
  ok(`${r}: needle 980 dropped`, res.valid && !vals(res).includes(980));
}

console.log('\n=== 2. 30D: single contaminated endpoint cleaned / pure diagonal -> building ===');
ok('30D single contaminated leading point (12000 -> 5600 flat): dropped, KPI ~0%',
   (() => { const res = validateChartSeries('30d', S([12000, 5600, 5610, 5600]), 5600); return res.valid && !vals(res).includes(12000) && Math.abs(pctOf(res, 5600)) < 5; })());
ok('30D lone 2-point incompatible (12000,5600) -> INVALID -> building',
   (() => { const res = validateChartSeries('30d', S([12000, 5600]), 5600); return res.valid === false && res.reason === 'two_point_incompatible'; })());

console.log('\n=== 3. REAL moves NEVER dropped (hard rule) ===');
ok('real deposit (sustained step 100->200) kept entirely',
   (() => { const res = validateChartSeries('7d', S([100, 100, 100, 200, 200, 200]), 200); return res.valid && res.droppedPoints.length === 0; })());
ok('real crash (-40% sustained) kept, downside NOT hidden',
   (() => { const res = validateChartSeries('30d', S([10000, 10000, 6000, 6000, 6000]), 6000); return res.valid && vals(res).includes(10000) && res.droppedPoints.length === 0; })());
ok('TOTAL real growth 3000->7000 gradual kept (+133% preserved)',
   (() => { const res = validateChartSeries('all', S([3000, 3500, 4200, 5000, 6000, 7000]), 7000); return res.valid && res.droppedPoints.length === 0 && pctOf(res, 7000) > 100; })());
ok('ordinary volatility around live kept',
   (() => { const res = validateChartSeries('30d', S([5000, 5500, 4800, 5200, 5600, 5400]), 5400); return res.valid && res.droppedPoints.length === 0; })());

console.log('\n=== 4. Structural junk dropped ===');
ok('NaN/Inf/0/neg/bad-ts dropped',
   (() => { const res = validateChartSeries('24h', [{ time: 1, value: NaN }, { time: 2, value: Infinity }, { time: 3, value: 0 }, { time: 4, value: -5 }, { time: NaN, value: 100 }, { time: 1700000000000, value: 100 }, { time: 1700086400000, value: 101 }], 100); return res.valid && res.cleanedSeries.length === 2; })());

console.log('\n=== 5. HONEST LIMITATION — sustained plateau is NOT auto-trimmed ===');
{
  // A sustained contaminated plateau is structurally identical to a real move,
  // so validateChartSeries keeps it (auto-trimming it would hide real crashes /
  // deposits — see section 3). Eliminating THIS residual is a data-layer job
  // (reversible investable-epoch re-baseline), not a render-time guess.
  const res = validateChartSeries('30d', S([12500, 12400, 12600, 5600, 5610]), 5600);
  ok('sustained plateau kept (proves we never auto-hide a real-looking move)', res.valid && vals(res).includes(12500));
  console.log(`     → KPI would read ${pctOf(res, 5600)}% — removed only by the epoch re-baseline (docs/AURIX-DATA-001 §5).`);
}

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
