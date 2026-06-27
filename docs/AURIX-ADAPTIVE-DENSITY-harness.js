/* AURIX — SPEC 6: ADAPTIVE DENSITY + LEGIBLE Y SCALE — harness.
   Extracts the REAL render-engine chain (with adaptive density + legible y-scale)
   and the equivalence audit from app.js, stubs only the data accessors, and proves:

     • all ranges: first/last/global-max/global-min preserved + equivalence PASS
     • Adaptive Density keeps significant LOCAL extrema (anti over-smoothing) — they
       survive the downsample even when LTTB alone would drop them
     • Legible Y scale activates ONLY on a dominant historical jump; default = linear;
       it is monotone (order-preserving), never hides the jump, never alters values
     • equivalence (auditAurixRenderVsCanonical) stays faithful in every case
     • deterministic

   Run: node docs/AURIX-ADAPTIVE-DENSITY-harness.js                                  */
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
const Y_CONSTS  = block('const _AURIX_Y_JUMP_DOMINANCE', 'const _AURIX_Y_LEGIBLE_ALPHA  = 0.35;');
const X_CONSTS  = block('const _AURIX_X_FILL_BETA', '};');

const DAY = 86400e3, HOUR = 36e5, NOW = 1000 * DAY;

let SERIES = [], DASH = null, FLOWS = [];
const sb = { console, activeRange: '30d', getAurixRenderSeries: () => SERIES, investableValueBase: () => DASH, _aurixLoadCapitalFlows: () => FLOWS,
  _wscFmtAxisVal: v => { const a = Math.abs(v); if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M'; if (a >= 1e3) return (v / 1e3).toFixed(1) + 'k'; return Math.round(v).toString(); } };
sb.window = sb; sb.window.innerWidth = 1440;
vm.createContext(sb);
vm.runInContext((src.match(/const _AURIX_PATH_RENDER_SPACING = [\d.]+;/)||["const _AURIX_PATH_RENDER_SPACING = 0;"])[0], sb);  // ARR — calibratable render spacing
vm.runInContext(RC_CONSTS, sb); vm.runInContext(VP_CONSTS, sb); vm.runInContext(IR_CONSTS, sb); vm.runInContext(Y_CONSTS, sb); vm.runInContext(X_CONSTS, sb);
[ fn('_aurixRenderContractGeometry'), fn('_aurixVpTargetPointCount'), fn('_aurixComputeVisualPreparation'),
  fn('prepareAurixVisualSeries'), fn('downsampleAurixLTTB'), fn('_aurixSignificantLocalExtrema'),
  fn('downsampleAurixAdaptive'), fn('computeAurixTimeScale'), fn('computeAurixAdaptiveXScale'), fn('computeAurixValueScale'),
  fn('_aurixArrRepresentVertices'), fn('_aurixMonotonePath'), fn('buildAurixMonotonicPath'), fn('buildAurixAreaPath'), fn('_aurixSplitAtGaps'),
  fn('renderAurixInstitutionalChart'), fn('_aurixCompareRenderToCanonical'), fn('auditAurixRenderVsCanonical') ].forEach(c => vm.runInContext(c, sb));

const { renderAurixInstitutionalChart, auditAurixRenderVsCanonical, downsampleAurixAdaptive, downsampleAurixLTTB, computeAurixValueScale } = sb;
const lastV = s => s[s.length - 1].value;
const setSeries = s => { SERIES = s; DASH = lastV(s); FLOWS = []; };

function cont(n, spanMs, base) { const t0 = NOW - spanMs; const pts = Array.from({ length: n }, (_, i) => ({ time: t0 + Math.round(i * spanMs / (n - 1)), value: base + 220 * Math.sin(i * 0.4) + i * 4 })); pts[n - 1].time = NOW; return pts; }

let ok = true;
const ck = (n, c, g) => { console.log((c ? '  ✓' : '  ✗') + ' ' + n + (g !== undefined ? '  [' + g + ']' : '')); if (!c) ok = false; };
const faithful = a => ['exact', 'faithful-downsampled'].indexOf(a.status) >= 0;

console.log('AURIX SPEC 6 — Adaptive Density + Legible Y Scale\n');

console.log('ALL RANGES — extremes preserved + equivalence faithful:');
for (const [r, n, span] of [['24h', 300, DAY], ['7d', 320, 7 * DAY], ['30d', 360, 30 * DAY], ['1y', 420, 360 * DAY], ['all', 460, 700 * DAY]]) {
  setSeries(cont(n, span, 60000));
  const rc = renderAurixInstitutionalChart(r); const a = auditAurixRenderVsCanonical(r);
  ck(r + ' first/last/max/min preserved', a.firstMatch && a.lastMatch && a.maxMatch && a.minMatch, 'rendered ' + rc.renderMeta.pointCountAfter + '/' + rc.renderMeta.pointCountBefore);
  ck(r + ' equivalence faithful', faithful(a), a.status);
  ck(r + ' yScaleMode reported', rc.renderMeta.yScaleMode === 'linear' || rc.renderMeta.yScaleMode === 'legible-blend', rc.renderMeta.yScaleMode);
}

console.log('\nADAPTIVE DENSITY — a significant LOCAL (non-global) extremum survives the downsample:');
{ const t0 = NOW - DAY, n = 400, pts = [];
  for (let i = 0; i < n; i++) pts.push({ time: t0 + Math.round(i * DAY / (n - 1)), value: 70000 + i * 12 + 60 * Math.sin(i * 0.5) });   // gentle rising base
  const peakIdx = 150; pts[peakIdx].value = pts[peakIdx].value + 4000;   // sharp LOCAL peak (not global — last points are higher via i*12)
  pts[n - 1].time = NOW;
  const adaptive = downsampleAurixAdaptive(pts, 120);
  const lttb = downsampleAurixLTTB(pts, 120);
  const hasPeak = arr => arr.some(p => p.time === pts[peakIdx].time);
  ck('adaptive keeps the significant local peak', hasPeak(adaptive), 'adaptive n=' + adaptive.length);
  ck('peak is real (value unchanged)', adaptive.some(p => p.time === pts[peakIdx].time && p.value === pts[peakIdx].value));
  ck('adaptive count >= LTTB count (extra detail, bounded)', adaptive.length >= lttb.length && adaptive.length <= 120 + Math.ceil(120 * 0.5) + 2, adaptive.length + ' vs lttb ' + lttb.length);
  ck('all points real (subset of source)', adaptive.every(p => pts.some(q => q.time === p.time && q.value === p.value))); }

console.log('\nLEGIBLE Y SCALE — activates only on a dominant historical jump; monotone; honest:');
{ // normal series → linear
  setSeries(cont(120, 30 * DAY, 60000));
  const lin = renderAurixInstitutionalChart('30d');
  ck('normal series → yScaleMode linear', lin.renderMeta.yScaleMode === 'linear', lin.renderMeta.yScaleMode);
  // big historical regime jump (5k → 60k) → legible-blend
  const t0 = NOW - 360 * DAY, n = 200, jump = [];
  for (let i = 0; i < n; i++) jump.push({ time: t0 + Math.round(i * 360 * DAY / (n - 1)), value: (i < n / 2 ? 5000 : 60000) + 300 * Math.sin(i * 0.6) });
  jump[n - 1].time = NOW; setSeries(jump);
  const rc = renderAurixInstitutionalChart('1y'); const a = auditAurixRenderVsCanonical('1y');
  ck('dominant jump → yScaleMode legible-blend', rc.renderMeta.yScaleMode === 'legible-blend', rc.renderMeta.yScaleMode);
  ck('equivalence still faithful (values untouched, jump not hidden)', faithful(a) && a.maxMatch && a.minMatch, a.status);
  // y-axis ticks honest + monotonic (top tick value >= bottom tick value)
  const tks = rc.yTicks;
  ck('yTicks present + values monotonic top→bottom', Array.isArray(tks) && tks.length >= 2 && tks[0].value >= tks[tks.length - 1].value, (tks || []).map(t => t.text).join(' / '));
  // monotone scale: y() strictly decreasing in value
  const sc = computeAurixValueScale(jump, 240, { top: 24, bottom: 211.2 });
  ck('scale y() strictly monotone in value', sc.y(5000) > sc.y(30000) && sc.y(30000) > sc.y(60000));
  // inverse round-trips (honest labels)
  const vmid = 32000, ymid = sc.y(vmid);
  ck('invValueAtY round-trips (honest axis)', Math.abs(sc.invValueAtY(ymid) - vmid) < (sc.yMax - sc.yMin) * 0.01, Math.round(sc.invValueAtY(ymid))); }

console.log('\nEQUIVALENCE GATE — auditAurixRenderVsCanonical PASS for every range (with jumps + microstructure):');
{ let allFaithful = true;
  const shapes = { '24h': cont(260, DAY, 70000), '7d': cont(300, 7 * DAY, 65000), '30d': cont(340, 30 * DAY, 55000),
    '1y': (() => { const t0 = NOW - 360 * DAY, n = 240, p = []; for (let i = 0; i < n; i++) p.push({ time: t0 + Math.round(i * 360 * DAY / (n - 1)), value: (i < 80 ? 8000 : 52000) + 400 * Math.sin(i) }); p[n - 1].time = NOW; return p; })(),
    'all': cont(380, 700 * DAY, 30000) };
  for (const r of ['24h', '7d', '30d', '1y', 'all']) { setSeries(shapes[r]); const a = auditAurixRenderVsCanonical(r); ck(r + ' faithful', faithful(a) && a.diffs.length === 0, a.status); allFaithful = allFaithful && faithful(a); } }

console.log('\nPERCEPTUAL X DISTRIBUTION — no empty islands; line walkable across full width:');
{ // sparse early (monthly) + dense recent — the classic "island" shape on 1A
  const t0 = NOW - 300 * DAY, denseStart = NOW - 30 * DAY, pts = [];
  for (let tt = t0; tt < denseStart - DAY; tt += 30 * DAY) pts.push({ time: tt, value: 40000 + ((tt - t0) / DAY) * 5 });
  for (let i = 0; i < 200; i++) pts.push({ time: denseStart + Math.round(i * 30 * DAY / 199), value: 60000 + 500 * Math.sin(i * 0.5) });
  pts[pts.length - 1].time = NOW; pts.sort((a, b) => a.time - b.time);
  setSeries(pts);
  const rc = renderAurixInstitutionalChart('1y', 1000, 240, { left: 60, right: 940, top: 24, bottom: 211.2 });
  const a = auditAurixRenderVsCanonical('1y');
  const px = rc.visiblePixels, W = 940 - 60;
  // largest consecutive horizontal gap under the engine's perceptual X (fill-blend)
  let maxGapFill = 0; for (let i = 1; i < px.length; i++) maxGapFill = Math.max(maxGapFill, (px[i].x - px[i - 1].x) / W);
  // largest consecutive horizontal gap under PURE real-time spacing (what made islands)
  const vts = rc.visiblePoints, span = vts[vts.length - 1].time - vts[0].time;
  let maxGapTime = 0; for (let i = 1; i < vts.length; i++) maxGapTime = Math.max(maxGapTime, (vts[i].time - vts[i - 1].time) / span);
  ck('xScaleMode = fill-blend', rc.renderMeta.xScaleMode === 'fill-blend', 'β=' + rc.renderMeta.xFillBeta);
  ck('no empty island (max x-gap < 25% of width)', maxGapFill < 0.25, (maxGapFill * 100).toFixed(1) + '%');
  ck('fill-blend much more even than pure time', maxGapFill < maxGapTime * 0.6, 'fill ' + (maxGapFill * 100).toFixed(1) + '% vs time ' + (maxGapTime * 100).toFixed(1) + '%');
  ck('equivalence still faithful (data untouched)', faithful(a) && a.diffs.length === 0, a.status);
  ck('x strictly increasing (order preserved, no overlap)', px.every((p, i) => i === 0 || p.x > px[i - 1].x));
  ck('first at left edge, last at right edge', Math.abs(px[0].x - 60) < 0.5 && Math.abs(px[px.length - 1].x - 940) < 0.5); }

console.log('\nDETERMINISM:');
{ setSeries(cont(300, 7 * DAY, 65000));
  const a = renderAurixInstitutionalChart('7d'), b = renderAurixInstitutionalChart('7d');
  ck('same input → identical render', JSON.stringify(a) === JSON.stringify(b)); }

console.log('\nRESULT:', ok ? 'ALL PASS ✓ — denser real detail + legible honest scale; data untouched; equivalence faithful' : 'FAIL ✗');
process.exit(ok ? 0 : 1);
