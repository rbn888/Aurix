/* AURIX — SPEC 3: INSTITUTIONAL RENDER ENGINE — validation harness.
   Extracts the REAL render engine + helpers from app.js and stubs only the data
   accessors that PreparedSeries depends on (getAurixRenderSeries,
   investableValueBase, _aurixLoadCapitalFlows). Asserts the 11 mandated cases:

     1. downsampling     → first/last + global max/min preserved, points are real
     2. timestamp scale  → x proportional to real time (never the index)
     3. value scale      → real max/min never clipped (visual margin added)
     4. monotonic path   → no overshoot between neighbours
     5. area path        → shares the exact line base path
     6. gaps             → gapSegments generated, line broken (not solid across gap)
     7. capital events   → eventMarkers generated, line NOT altered
     8. last point       → lastValue == dashboard
     9. determinism      → same input → same output
    10. desktop/mobile   → same logical behaviour, only dimensions change
    11. no mutation      → PreparedSeries / input arrays untouched

   Engine reads ONLY PreparedSeries. Run: node docs/AURIX-INSTITUTIONAL-RENDER-harness.js */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function fn(name){ const s='function '+name+'('; const i=src.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=src.indexOf('{',i),d=0; for(;k<src.length;k++){const c=src[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} return src.slice(i,k); }
function block(startStr, endStr){ const i=src.indexOf(startStr); if(i<0)throw new Error('missing '+startStr);
  const e=src.indexOf(endStr, i); if(e<0)throw new Error('missing '+endStr); return src.slice(i, e+endStr.length); }

const RC_CONSTS = block('const _AURIX_RC_QUALITY_THRESHOLD', 'const _AURIX_RC_VPAD_FRAC = 0.08;');
const VP_CONSTS = block('const _AURIX_VP_DENSITY', 'const _AURIX_VP_VALUE_EPS = 0.004;');
const IR_CONSTS = block('const _AURIX_IR_VALUE_MARGIN', '= 0.08;');

const DAY = 86400e3, HOUR = 36e5, MIN = 60e3, NOW = 1000 * DAY;

let SERIES = [], DASH = null, FLOWS = [];
const sb = {
  console,
  activeRange: '30d',
  getAurixRenderSeries: () => SERIES,
  investableValueBase: () => DASH,
  _aurixLoadCapitalFlows: () => FLOWS,
};
sb.window = sb; sb.window.innerWidth = 1440;
vm.createContext(sb);

vm.runInContext(RC_CONSTS, sb);
vm.runInContext(VP_CONSTS, sb);
vm.runInContext(IR_CONSTS, sb);
[ fn('_aurixRenderContractGeometry'), fn('_aurixVpTargetPointCount'), fn('_aurixComputeVisualPreparation'),
  fn('prepareAurixVisualSeries'), fn('downsampleAurixLTTB'), fn('computeAurixTimeScale'),
  fn('computeAurixValueScale'), fn('_aurixMonotonePath'), fn('buildAurixMonotonicPath'),
  fn('buildAurixAreaPath'), fn('_aurixSplitAtGaps'), fn('renderAurixInstitutionalChart') ].forEach(c => vm.runInContext(c, sb));

const {
  downsampleAurixLTTB, computeAurixTimeScale, computeAurixValueScale,
  _aurixMonotonePath, buildAurixMonotonicPath, buildAurixAreaPath, renderAurixInstitutionalChart,
} = sb;

// ── builders ────────────────────────────────────────────────────────────────
function dense(n, spanMs, base) {
  const t0 = NOW - spanMs;
  return Array.from({ length: n }, (_, i) => ({ time: t0 + Math.round(i * spanMs / (n - 1)), value: base + 200 * Math.sin(i * 0.3) }));
}
function withGap() {
  const t0 = NOW - DAY, pts = [];
  for (let i = 0; i < 10; i++) pts.push({ time: t0 + i * 40 * MIN, value: 70000 + i * 8 });
  const after = t0 + 9 * 40 * MIN + 3 * HOUR;
  for (let i = 0; i < 10; i++) pts.push({ time: after + i * 40 * MIN, value: 70100 + i * 8 });
  pts[pts.length - 1].time = NOW;
  return pts;
}
const lastV = s => s[s.length - 1].value;

let ok = true;
const ck = (n, c, g) => { console.log((c ? '  ✓' : '  ✗') + ' ' + n + (g !== undefined ? '  [' + g + ']' : '')); if (!c) ok = false; };
const bez = (t, p0, c1, c2, p1) => { const mt = 1 - t; return mt*mt*mt*p0 + 3*mt*mt*t*c1 + 3*mt*t*t*c2 + t*t*t*p1; };

console.log('AURIX SPEC 3 — Institutional Render Engine\n');

console.log('CASE 1 — downsampling (first/last + global max/min preserved, real points):');
{ const t0 = NOW - DAY, n = 500;
  const srcArr = Array.from({ length: n }, (_, i) => ({ time: t0 + Math.round(i * DAY / (n - 1)), value: 70000 + 300 * Math.sin(i * 0.2) }));
  srcArr[123].value = 50000;   // global min
  srcArr[250].value = 90000;   // global max
  const real = new Set(srcArr.map(p => p.time + ':' + p.value));
  const ds = downsampleAurixLTTB(srcArr, 100);
  ck('count near target (<= target+2)', ds.length <= 102 && ds.length >= 90, ds.length);
  ck('first preserved', ds[0].time === srcArr[0].time && ds[0].value === srcArr[0].value);
  ck('last preserved', ds[ds.length-1].time === srcArr[n-1].time && ds[ds.length-1].value === srcArr[n-1].value);
  ck('global max preserved (90000)', Math.max(...ds.map(p => p.value)) === 90000);
  ck('global min preserved (50000)', Math.min(...ds.map(p => p.value)) === 50000);
  ck('all returned points are real', ds.every(p => real.has(p.time + ':' + p.value)));
  const sorted = ds.every((p, i) => i === 0 || p.time > ds[i-1].time);
  ck('sorted ascending, no dup timestamps', sorted); }

console.log('\nCASE 2 — timestamp scale (x proportional to real time, not index):');
{ const t0 = NOW - 4*HOUR;
  const pts = [{ time: t0, value: 1 }, { time: t0 + 1*HOUR, value: 2 }, { time: t0 + 3*HOUR, value: 3 }]; // gaps 1h, 2h
  const xs = computeAurixTimeScale(pts, 1000);
  const d01 = xs.x(pts[1].time) - xs.x(pts[0].time);
  const d12 = xs.x(pts[2].time) - xs.x(pts[1].time);
  ck('distance ratio == duration ratio (1:2)', Math.abs(d12 / d01 - 2) < 1e-6, +(d12/d01).toFixed(4));
  ck('x is not index-based (d12 > d01)', d12 > d01, +d01.toFixed(1) + ' vs ' + d12.toFixed(1)); }

console.log('\nCASE 3 — value scale (real max/min never clipped):');
{ const pts = [{ time: 1, value: 60000 }, { time: 2, value: 75000 }, { time: 3, value: 58000 }];
  const ys = computeAurixValueScale(pts, 300);
  ck('yMin below data min', ys.yMin < ys.dataMin, ys.yMin.toFixed(1) + ' < ' + ys.dataMin);
  ck('yMax above data max', ys.yMax > ys.dataMax, ys.yMax.toFixed(1) + ' > ' + ys.dataMax);
  ck('y(dataMax) inside plot (>= top)', ys.y(ys.dataMax) >= ys.top - 1e-6, ys.y(ys.dataMax).toFixed(2));
  ck('y(dataMin) inside plot (<= bottom)', ys.y(ys.dataMin) <= ys.bottom + 1e-6, ys.y(ys.dataMin).toFixed(2)); }

console.log('\nCASE 4 — monotonic path (no overshoot between neighbours):');
{ const t0 = NOW - DAY, n = 24;
  const pts = Array.from({ length: n }, (_, i) => ({ time: t0 + i*HOUR, value: 70000 + ((i % 2) ? 1200 : -1200) + (i===12 ? 5000 : 0) })); // zigzag + spike
  const xs = computeAurixTimeScale(pts, 1000), ys = computeAurixValueScale(pts, 300);
  const mp = _aurixMonotonePath(pts, xs, ys);
  let worst = 0;
  mp.segments.forEach(s => {
    if (s.type !== 'C') return;
    const lo = Math.min(s.y0, s.y1), hi = Math.max(s.y0, s.y1);
    for (let k = 1; k <= 15; k++) { const t = k/16, by = bez(t, s.y0, s.c1y, s.c2y, s.y1); worst = Math.max(worst, Math.max(0, by - hi, lo - by)); }
  });
  ck('no cubic segment overshoots endpoint band', worst < 0.5, 'worstPx=' + worst.toFixed(3));
  ck('path starts with M', /^M /.test(mp.d), mp.d.slice(0, 12)); }

console.log('\nCASE 5 — area path (shares exact line base path):');
{ const pts = dense(12, DAY, 70000);
  const xs = computeAurixTimeScale(pts, 1000), ys = computeAurixValueScale(pts, 300);
  const line = buildAurixMonotonicPath(pts, xs, ys);
  const area = buildAurixAreaPath(line, pts, { x: xs.x, bottom: ys.bottom });
  ck('area begins with the exact line path', area.indexOf(line) === 0);
  ck('area closes to baseline (ends Z)', /Z\s*$/.test(area));
  ck('no second smoothed path (one M only)', (area.match(/M /g) || []).length === 1, (area.match(/M /g)||[]).length); }

console.log('\nCASE 6 — gaps (gapSegments generated, line broken across the gap):');
{ SERIES = withGap(); DASH = lastV(SERIES); FLOWS = [];
  const rc = renderAurixInstitutionalChart('24h', 1000, 300);
  ck('gapSegments generated', rc.gapSegments.length >= 1, rc.gapSegments.length);
  ck('gapSegment style provided', rc.gapSegments[0] && rc.gapSegments[0].style === 'dashed', rc.gapSegments[0] && rc.gapSegments[0].style);
  ck('line broken (>=2 subpaths, not solid across gap)', (rc.pathData.match(/M /g) || []).length >= 2, (rc.pathData.match(/M /g)||[]).length); }

console.log('\nCASE 7 — capital events (eventMarkers generated, line NOT altered):');
{ const s = dense(40, DAY, 70000); SERIES = s; DASH = lastV(s);
  const noEv = renderAurixInstitutionalChart('24h', 1000, 300);
  FLOWS = [{ ts: s[20].time, amountUSD: 5000, kind: 'deposit' }];
  const rc = renderAurixInstitutionalChart('24h', 1000, 300);
  ck('eventMarker generated', rc.eventMarkers.length >= 1, rc.eventMarkers.length);
  ck('eventMarker has x + type', rc.eventMarkers[0] && Number.isFinite(rc.eventMarkers[0].x) && rc.eventMarkers[0].type === 'deposit');
  ck('line NOT altered by the event (identical pathData)', rc.pathData === noEv.pathData);
  ck('visiblePoints identical with/without event', JSON.stringify(rc.visiblePoints) === JSON.stringify(noEv.visiblePoints)); }

console.log('\nCASE 8 — last point (lastValue == dashboard):');
{ const s = dense(60, DAY, 70000); SERIES = s; DASH = lastV(s); FLOWS = [];
  const rc = renderAurixInstitutionalChart('24h', 1000, 300);
  ck('lastValue == dashboardValue', rc.renderMeta.lastValue === rc.renderMeta.dashboardValue, rc.renderMeta.lastValue + '==' + rc.renderMeta.dashboardValue);
  ck('lastDeltaPct ~ 0 (<=0.5%)', Math.abs(rc.renderMeta.lastDeltaPct) <= 0.5, rc.renderMeta.lastDeltaPct); }

console.log('\nCASE 9 — determinism (same input → same output):');
{ const s = dense(120, 7*DAY, 65000); SERIES = s; DASH = lastV(s); FLOWS = [{ ts: s[50].time, amountUSD: 3000, kind: 'asset_add' }];
  const a = renderAurixInstitutionalChart('7d', 1000, 300);
  const b = renderAurixInstitutionalChart('7d', 1000, 300);
  ck('JSON identical', JSON.stringify(a) === JSON.stringify(b)); }

console.log('\nCASE 10 — desktop/mobile (same logical behaviour, only dimensions change):');
{ const s = dense(300, 30*DAY, 50000); SERIES = s; DASH = lastV(s); FLOWS = [];
  const desk = renderAurixInstitutionalChart('30d', 1440, 420);
  const mob  = renderAurixInstitutionalChart('30d', 375, 200);
  ck('viewport dimensions differ', desk.viewportWidth !== mob.viewportWidth && desk.viewportHeight !== mob.viewportHeight, desk.viewportWidth + 'x' + desk.viewportHeight + ' / ' + mob.viewportWidth + 'x' + mob.viewportHeight);
  ck('same interpolation', desk.renderMeta.interpolation === mob.renderMeta.interpolation, desk.renderMeta.interpolation);
  ck('same lastValue (== dashboard)', desk.renderMeta.lastValue === mob.renderMeta.lastValue);
  ck('same gapSegments + eventMarkers count', desk.gapSegments.length === mob.gapSegments.length && desk.eventMarkers.length === mob.eventMarkers.length);
  ck('both generate a path', desk.pathData.length > 0 && mob.pathData.length > 0); }

console.log('\nCASE 11 — no mutation of PreparedSeries / input arrays:');
{ const s = dense(80, DAY, 70000); const before = JSON.stringify(s);
  SERIES = s; DASH = lastV(s); FLOWS = [{ ts: s[40].time, amountUSD: 2000, kind: 'deposit' }];
  const rc = renderAurixInstitutionalChart('24h', 1000, 300);
  ck('stubbed canonical series unchanged', JSON.stringify(s) === before);
  ck('prepared.preparedPoints unchanged length', rc.prepared.preparedPoints.length === s.length, rc.prepared.preparedPoints.length + '/' + s.length);
  const dsIn = dense(50, DAY, 70000), dsBefore = JSON.stringify(dsIn);
  downsampleAurixLTTB(dsIn, 20);
  ck('downsample does not mutate its input', JSON.stringify(dsIn) === dsBefore); }

console.log('\nRESULT:', ok ? 'ALL PASS ✓ — institutional render engine: real points, real time, no overshoot, gap-aware, dashboard-locked' : 'FAIL ✗');
process.exit(ok ? 0 : 1);
