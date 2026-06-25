/* AURIX — BUGFIX P0: INSTITUTIONAL RENDER CONTINUITY — harness.
   Proves the visible render draws the COMPLETE, CONTINUOUS series in every range and
   only breaks the line on a genuine, documented gap. Extracts the REAL engine chain
   (with the adaptive gap threshold) from app.js and stubs only the data accessors.

   Cases (criteria §8):
     • 24H / 7D / 30D continuous (irregular cadence) → ONE subpath, gapCount 0
     • 1A / TOTAL full history → ONE subpath, first rendered == first source (early kept)
     • a real legitimate gap → breaks (subpaths==2) and is reported with threshold
     • an isolated point bracketed by gaps → coalesced, does NOT shatter the series
     • an isolated live tail BELOW threshold → stays connected (no break)

   Regression target: the OLD fixed thresholds (24h:90min, 7d:8h, 30d:36h, 1y:21d)
   fragmented all of these; the adaptive threshold must keep them continuous.
   Run: node docs/AURIX-INSTITUTIONAL-RENDER-CONTINUITY-harness.js                  */
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
const sb = { console, activeRange: '30d', getAurixRenderSeries: () => SERIES, investableValueBase: () => DASH, _aurixLoadCapitalFlows: () => FLOWS };
sb.window = sb; sb.window.innerWidth = 1440;
vm.createContext(sb);
vm.runInContext(RC_CONSTS, sb); vm.runInContext(VP_CONSTS, sb); vm.runInContext(IR_CONSTS, sb);
[ fn('_aurixRenderContractGeometry'), fn('_aurixVpTargetPointCount'), fn('_aurixComputeVisualPreparation'),
  fn('prepareAurixVisualSeries'), fn('downsampleAurixLTTB'), fn('computeAurixTimeScale'),
  fn('computeAurixValueScale'), fn('_aurixMonotonePath'), fn('buildAurixMonotonicPath'),
  fn('buildAurixAreaPath'), fn('_aurixSplitAtGaps'), fn('renderAurixInstitutionalChart') ].forEach(c => vm.runInContext(c, sb));

const { renderAurixInstitutionalChart } = sb;
const lastV = s => s[s.length - 1].value;
const render = (range, series) => { SERIES = series; DASH = lastV(series); FLOWS = []; return renderAurixInstitutionalChart(range, 1000, 240, { left: 60, right: 940, top: 24, bottom: 211.2 }); };

// evenly-but-coarsely sampled (intervals far exceed the OLD fixed thresholds)
function cont(n, spanMs, base) {
  const t0 = NOW - spanMs;
  const pts = Array.from({ length: n }, (_, i) => ({ time: t0 + Math.round(i * spanMs / (n - 1)), value: base + 220 * Math.sin(i * 0.4) + i * 4 }));
  pts[n - 1].time = NOW; return pts;
}
// sparse-but-CONTINUOUS early history (monthly cadence) + dense recent — this is the
// shape that read as "missing early history" when thresholds were too aggressive.
function sparseEarlyDenseRecent(spanDays) {
  const t0 = NOW - spanDays * DAY, denseStart = NOW - 30 * DAY, pts = [];
  for (let tt = t0; tt < denseStart - DAY; tt += 30 * DAY) pts.push({ time: tt, value: 40000 + ((tt - t0) / DAY) * 5 });   // monthly early, spans the whole early region
  for (let i = 0; i < 100; i++) pts.push({ time: denseStart + Math.round(i * 30 * DAY / 99), value: 48000 + 800 * Math.sin(i * 0.3) + i * 10 });
  pts[pts.length - 1].time = NOW; pts.sort((a, b) => a.time - b.time); return pts;
}

let ok = true;
const ck = (n, c, g) => { console.log((c ? '  ✓' : '  ✗') + ' ' + n + (g !== undefined ? '  [' + g + ']' : '')); if (!c) ok = false; };

console.log('AURIX BUGFIX P0 — Institutional Render continuity\n');

console.log('CONTINUOUS RANGES — one unbroken subpath, no artificial gaps:');
for (const [r, n, span] of [['24h', 10, DAY], ['7d', 30, 7 * DAY], ['30d', 40, 30 * DAY]]) {
  const rc = render(r, cont(n, span, 70000)); const d = rc.diagnostics;
  ck(r + ' renderedSubpaths === 1 (continuous)', d.renderedSubpaths === 1, d.renderedSubpaths + ' subpaths, gapCount ' + d.gapCount);
  ck(r + ' gapCount === 0', d.gapCount === 0);
  ck(r + ' first rendered == first source (whole range drawn)', d.firstRenderedPoint && d.firstSourcePoint && d.firstRenderedPoint.time === d.firstSourcePoint.time);
  ck(r + ' last == dashboard', Math.abs(rc.renderMeta.lastDeltaPct) <= 0.5);
}

console.log('\nFULL HISTORY (1A / TOTAL) — early history kept, one subpath:');
for (const [r, days] of [['1y', 300], ['all', 700]]) {
  const s = sparseEarlyDenseRecent(days); const rc = render(r, s); const d = rc.diagnostics;
  ck(r + ' renderedSubpaths === 1 (sparse early NOT fragmented)', d.renderedSubpaths === 1, d.renderedSubpaths + ' subpaths, gapCount ' + d.gapCount);
  ck(r + ' first rendered time == earliest source (no lost early history)', d.firstRenderedPoint.time === s[0].time);
  ck(r + ' last == dashboard', Math.abs(rc.renderMeta.lastDeltaPct) <= 0.5);
}

console.log('\nREAL GAP — a genuine large hole DOES break, and is documented:');
{ const t0 = NOW - 7 * DAY, pts = [];
  for (let i = 0; i < 16; i++) pts.push({ time: t0 + i * 3 * HOUR, value: 70000 + i * 5 });   // 2 days dense
  const rs = t0 + 16 * 3 * HOUR + 4 * DAY;                                                     // 4-day hole
  for (let i = 0; i < 16; i++) pts.push({ time: rs + i * 3 * HOUR, value: 70090 + i * 5 });
  pts[pts.length - 1].time = NOW;
  const rc = render('7d', pts); const d = rc.diagnostics;
  ck('gapCount === 1', d.gapCount === 1, d.gapCount);
  ck('renderedSubpaths === 2 (line broken at the real gap)', d.renderedSubpaths === 2, d.renderedSubpaths);
  const g = rc.gaps[0];
  ck('gap documented (start/end/duration/threshold/reason)', g && g.start && g.end && g.durationMs && g.threshold && g.reason === 'time_gap', g && (Math.round(g.durationMs / HOUR) + 'h > thr ' + Math.round(g.threshold / HOUR) + 'h')); }

console.log('\nISOLATED POINT — a lone point between gaps does NOT shatter the series:');
{ const t0 = NOW - 30 * DAY, pts = [];
  for (let i = 0; i < 10; i++) pts.push({ time: t0 + i * 5 * HOUR, value: 50000 + i * 8 });   // cluster A
  pts.push({ time: t0 + 12 * DAY, value: 50200 });                                            // lone point
  const rs = NOW - 2 * DAY;
  for (let i = 0; i < 10; i++) pts.push({ time: rs + i * 5 * HOUR, value: 50500 + i * 8 });    // cluster B
  pts[pts.length - 1].time = NOW; pts.sort((a, b) => a.time - b.time);
  const rc = render('30d', pts); const d = rc.diagnostics;
  ck('isolatedPoints === 1 (the lone point detected)', d.isolatedPoints === 1, d.isolatedPoints);
  ck('renderedSubpaths === 2 (lone point coalesced, NOT a 3rd fragment)', d.renderedSubpaths === 2, d.renderedSubpaths);
  ck('droppedSubpaths === 0 (no invisible orphan)', d.droppedSubpaths === 0); }

console.log('\nLIVE TAIL below threshold — last point stays CONNECTED:');
{ const t0 = NOW - 30 * DAY, pts = [];
  for (let i = 0; i < 40; i++) pts.push({ time: t0 + Math.round(i * 28 * DAY / 39), value: 60000 + 50 * Math.sin(i * 0.5) + i * 5 });
  pts.push({ time: NOW, value: 60500 });   // live tail ~2 days after the prior point (below the 30d threshold)
  const rc = render('30d', pts); const d = rc.diagnostics;
  ck('gapCount === 0 (tail gap below threshold)', d.gapCount === 0, 'thr ' + Math.round(d.gapThresholdMs / DAY) + 'd');
  ck('renderedSubpaths === 1 (last point connected)', d.renderedSubpaths === 1);
  ck('last rendered == last source == dashboard', d.lastRenderedPoint.time === d.lastSourcePoint.time && Math.abs(rc.renderMeta.lastDeltaPct) <= 0.5); }

console.log('\nDETERMINISM:');
{ const s = cont(30, 7 * DAY, 65000);
  const a = render('7d', s), b = render('7d', s);
  ck('same input → identical render', JSON.stringify(a) === JSON.stringify(b)); }

console.log('\nRESULT:', ok ? 'ALL PASS ✓ — complete, continuous render; gaps only on real, documented holes' : 'FAIL ✗');
process.exit(ok ? 0 : 1);
