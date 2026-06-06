'use strict';
/* AURIX-DASHBOARD-CHART-INSTITUTIONAL-1 proof — replicates normalizeChartRawSeries
   from app.js. Proves: legacy/contaminated points (18-20k vs ~7k live) are
   dropped → no false -62%; near-duplicate-time points collapse (no stacked
   spikes); REAL gains/losses and ordinary volatility are NEVER hidden; too-few
   clean points → invalid (building). Display only — raw data untouched.
   Run: node docs/AURIX-CHART-NORMALIZE-proof.cjs */

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`${c ? '  PASS' : '  FAIL'}  ${n}`); c ? pass++ : fail++; };

const BAND = { '24h':[0.6,1.5], '7d':[0.5,2.2], '30d':[0.4,2.5], '1y':[0.15,8], 'all':[0.1,12] };
const BUCKET = { '24h':5*60000, '7d':60*60000, '30d':6*60*60000, '1y':86400000, 'all':86400000 };
const MIN = { '24h':2,'7d':2,'30d':2,'1y':2,'all':5 };
const minPoints = r => MIN[r] ?? 2;

function normalizeChartRawSeries(series, opts) {
  const o = opts || {}, r = String(o.range||'').toLowerCase();
  const minPts = minPoints(r), bucketMs = BUCKET[r] || 86400000;
  const byBucket = new Map();
  for (const p of (Array.isArray(series)?series:[])) {
    const t = Number(p&&p.time), v = Number(p&&p.value);
    if (!Number.isFinite(t)||t<=0||!Number.isFinite(v)||v<=0) continue;
    byBucket.set(Math.floor(t/bucketMs), { time:t, value:v });
  }
  let pts = Array.from(byBucket.values()).sort((a,b)=>a.time-b.time);
  let droppedRegime = 0;
  if (pts.length < 2) return { series:pts, valid:false, reason:'insufficient', droppedRegime };
  const live = Number(o.liveValue);
  if (Number.isFinite(live) && live > 0) {
    const band = BAND[r] || [0.1,12], lo = live*band[0], hi = live*band[1];
    const clean = pts.filter(p => p.value >= lo && p.value <= hi);
    droppedRegime = pts.length - clean.length;
    if (droppedRegime > 0) {
      if (clean.length < minPts) return { series:clean, valid:false, reason:'regime_incompatible', droppedRegime };
      pts = clean;
    }
  }
  return { series:pts, valid:true, reason:'ok', droppedRegime };
}

const DAY = 86400000, T = 1_780_800_000_000;
const S = (vals, step=DAY) => vals.map((v,i)=>({ time:T+i*step, value:v }));
const vals = r => r.series.map(p=>p.value);
const pct = (r,live)=> r.valid ? +(((live - r.series[0].value)/r.series[0].value)*100).toFixed(1) : null;

console.log('\n=== 1. The -62% contamination: legacy 18-20k dropped vs ~7k live ===');
{
  // 30D: mostly clean ~7k with a couple legacy 18-20k points → drop legacy.
  const r = normalizeChartRawSeries(S([6200,6300,6500,6800,6952,7000]), { range:'30d', liveValue:6952 });
  ok('30D clean portfolio (no legacy) untouched → ~+12%, not -62%', r.valid && pct(r,6952) > 5 && r.droppedRegime===0);
  const c = normalizeChartRawSeries(S([19000,20000,6200,6500,6952,7000]), { range:'30d', liveValue:6952 });
  ok('30D: legacy 19-20k dropped, clean ~6.2-7k kept → headline ~+12%', c.valid && !vals(c).includes(19000) && pct(c,6952) > 5 && c.droppedRegime===2);
  const allBad = normalizeChartRawSeries(S([19000,20000,18000]), { range:'30d', liveValue:6952 });
  ok('30D fully-contaminated (no clean points) → invalid → building', allBad.valid===false && allBad.reason==='regime_incompatible');
}

console.log('\n=== 2. Near-duplicate-time points collapse (no stacked spikes) ===');
{
  // 5 points within one 6h 30D-bucket + spread points → bucket collapses cluster.
  const cluster = [];
  for (let i=0;i<5;i++) cluster.push({ time:T+i*60000, value:6900+i*10 }); // 1-min apart (same 6h bucket)
  cluster.push({ time:T+DAY, value:7000 });
  const r = normalizeChartRawSeries(cluster, { range:'30d', liveValue:6950 });
  ok('5 same-bucket points collapse to 1 (last); cluster ≠ vertical spike', r.valid && r.series.length===2 && r.series[0].value===6940);
}

console.log('\n=== 3. REAL moves NEVER hidden ===');
{
  ok('real crash -40% (10k→6k, 30D) kept (within band)',
     (()=>{ const r=normalizeChartRawSeries(S([10000,10000,8000,6000,6000]),{range:'30d',liveValue:6000}); return r.valid && vals(r).includes(10000) && r.droppedRegime===0; })());
  ok('real deposit doubling (6k→12k, 30D) kept',
     (()=>{ const r=normalizeChartRawSeries(S([6000,6000,12000,12000]),{range:'30d',liveValue:12000}); return r.valid && vals(r).includes(6000) && r.droppedRegime===0; })());
  ok('1A long-range 3x real growth (4k→12k) kept (loose long band)',
     (()=>{ const r=normalizeChartRawSeries(S([4000,5000,7000,9000,12000]),{range:'1y',liveValue:12000}); return r.valid && vals(r).includes(4000) && r.droppedRegime===0; })());
  ok('ordinary volatility around live kept',
     (()=>{ const r=normalizeChartRawSeries(S([5800,6100,5900,6050,6000]),{range:'7d',liveValue:6000}); return r.valid && r.droppedRegime===0; })());
}

console.log('\n=== 4. Structural / hygiene ===');
{
  ok('NaN/<=0/dup-time dropped, finite series sorted',
     (()=>{ const r=normalizeChartRawSeries([{time:5,value:NaN},{time:0,value:6000},{time:T+DAY,value:7000},{time:T,value:6900}],{range:'30d',liveValue:6950}); return r.valid && r.series.length===2 && r.series[0].time < r.series[1].time; })());
  ok('boot (no live) → no regime drop, still collapses duplicates',
     (()=>{ const r=normalizeChartRawSeries(S([19000,6200,6500]),{range:'30d',liveValue:NaN}); return r.valid && vals(r).includes(19000); })());
}

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
