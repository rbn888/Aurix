/* AURIX — SPEC 1: RENDER CONTRACT & VISUAL QUALITY GATE — validation harness.
   Extracts the REAL getAurixRenderContract + its pure core + the five visual
   metrics from app.js, stubs only the two data accessors (getAurixRenderSeries,
   investableValueBase), and asserts the mandated cases:

     1. healthy 24H            → qualityScore >= 85
     2. cluster at the right   → clusterScore low      + clustered_points_right_edge
     3. vertical wall          → verticalJumpScore low  + vertical_jump_unclassified
     4. ruler-straight line    → straightnessScore low  + too_many_straight_segments
     5. large temporal gaps    → continuityScore low    + untreated_large_gap
     6. last point != dashboard→ immediate FAIL (last_point_not_dashboard, quality 0)
     7. healthy 30D            → qualityScore >= 90
     8. desktop vs mobile      → identical logical verdict (only viewportWidth differs)

   PURE READ proof: the contract never mutates data — it only MEASURES a series.
   Run: node docs/AURIX-RENDER-CONTRACT-harness.js                                */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function fn(name){ const s='function '+name+'('; const i=src.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=src.indexOf('{',i),d=0; for(;k<src.length;k++){const c=src[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} return src.slice(i,k); }
function obj(name){ const s='const '+name+' ='; const i=src.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=src.indexOf('{',i),d=0; for(;k<src.length;k++){const c=src[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} while(src[k]!==';'&&k<src.length)k++; return src.slice(i,k+1); }

// All six _AURIX_RC_* constants are declared consecutively — slice the whole block.
const cstart = src.indexOf('const _AURIX_RC_QUALITY_THRESHOLD');
const cendM  = 'const _AURIX_RC_VPAD_FRAC = 0.08;';
const RC_CONSTS = src.slice(cstart, src.indexOf(cendM) + cendM.length);
if (cstart < 0 || RC_CONSTS.indexOf('_AURIX_RC_ASPECT') < 0) throw new Error('missing _AURIX_RC_* constants');

const DAY = 86400e3, HOUR = 36e5, NOW = 1000 * DAY;

// per-scenario state the stubs read
let SERIES = [];
let DASH = null;

const sb = {
  console,
  activeRange: '30d',
  getAurixRenderSeries: () => SERIES,
  investableValueBase: () => DASH,
};
sb.window = sb;
sb.window.innerWidth = 1440;
vm.createContext(sb);

vm.runInContext(RC_CONSTS, sb);
[ obj('_WSC_QUALITY'),
  fn('_aurixRenderContractGeometry'), fn('_aurixRcClusterScore'), fn('_aurixRcStraightnessScore'),
  fn('_aurixRcVerticalJumpScore'), fn('_aurixRcDensityScore'), fn('_aurixRcContinuityScore'),
  fn('_aurixComputeRenderContract'), fn('getAurixRenderContract') ].forEach(c => vm.runInContext(c, sb));

// ── synthetic series builders ──────────────────────────────────────────────
// healthy: even spacing + gentle sine microstructure (bends → not ruler-straight,
// no vertical walls), spanning the full window (coverage ≈ 100%).
function healthy(n, spanMs, base, drift, amp) {
  const t1 = NOW, t0 = NOW - spanMs;
  return Array.from({ length: n }, (_, i) => ({
    time: t0 + Math.round(i * spanMs / (n - 1)),
    value: base + i * drift + amp * Math.sin(i * 0.7),
  }));
}
// cluster at right: a few early points, a moderate empty span, then many crammed points.
function clusterRight() {
  const t1 = NOW, t0 = NOW - DAY, span = t1 - t0, pts = [];
  for (let i = 0; i < 8; i++) pts.push({ time: t0 + (i / 7) * 0.68 * span, value: 70000 + i * 6 });  // 0 .. 0.68
  for (let i = 0; i < 16; i++) pts.push({ time: t0 + (0.95 + (i / 15) * 0.05) * span, value: 70050 + i }); // 0.95 .. 1.0
  return pts;
}
// vertical wall: flat-ish wiggle with one near-instant +6000 jump (dt = 30s).
function verticalWall() {
  const t1 = NOW, t0 = NOW - DAY, span = t1 - t0, pts = [];
  const n = 20;
  for (let i = 0; i < n; i++) {
    let tt = t0 + (i / (n - 1)) * span;
    let v = 69000 + i * 100 + 150 * Math.sin(i * 0.6);
    if (i === 11) { tt = pts[10].time + 30e3; v = pts[10].value + 6000; }  // wall: 30s, +6000
    pts.push({ time: tt, value: v });
  }
  pts[pts.length - 1].time = t1;
  return pts;
}
// ruler-straight: perfectly linear, evenly spaced.
function straightLine() {
  const t1 = NOW, t0 = NOW - DAY, n = 30;
  return Array.from({ length: n }, (_, i) => ({ time: t0 + (i / (n - 1)) * (t1 - t0), value: 70000 + i * 30 }));
}
// large gaps: two small clusters at the extremes of a 7-day span, huge empty middle.
function bigGaps() {
  const t1 = NOW, t0 = NOW - 7 * DAY, span = t1 - t0, pts = [];
  for (let i = 0; i < 4; i++) pts.push({ time: t0 + (i / 3) * 0.07 * span, value: 70000 + i * 10 });        // first ~0.5d
  for (let i = 0; i < 4; i++) pts.push({ time: t0 + (0.93 + (i / 3) * 0.07) * span, value: 70100 + i * 10 }); // last ~0.5d
  return pts;
}

let ok = true;
const ck = (n, c, g) => { console.log((c ? '  ✓' : '  ✗') + ' ' + n + (g !== undefined ? '  [' + g + ']' : '')); if (!c) ok = false; };
const run = (range, series, dash, vw) => { SERIES = series; DASH = dash; return sb.getAurixRenderContract(range, vw); };
const last = s => s[s.length - 1].value;

console.log('AURIX SPEC 1 — Render Contract & Visual Quality Gate\n');

console.log('CASE 1 — healthy 24H (qualityScore >= 85):');
{ const s = healthy(30, DAY, 70000, 18, 120); const c = run('24h', s, last(s));
  ck('qualityScore >= 85', c.qualityScore >= 85, c.qualityScore);
  ck('renderMode = institutional', c.renderMode === 'institutional', c.renderMode);
  ck('no failures', c.failures.length === 0, c.failures.join('|') || '—');
  ck('lastPoint == dashboard (delta ~0%)', Math.abs(c.lastPointDeltaPct) < 0.5, c.lastPointDeltaPct); }

console.log('\nCASE 2 — cluster at right edge (clusterScore low + failure):');
{ const s = clusterRight(); const c = run('24h', s, last(s));
  ck('clusterScore low (< 60)', c.clusterScore < 60, c.clusterScore);
  ck('failure clustered_points_right_edge', c.failures.indexOf('clustered_points_right_edge') >= 0, c.failures.join('|'));
  ck('qualityScore < 85', c.qualityScore < 85, c.qualityScore); }

console.log('\nCASE 3 — vertical wall (verticalJumpScore low + failure):');
{ const s = verticalWall(); const c = run('24h', s, last(s));
  ck('verticalJumpScore low (< 70)', c.verticalJumpScore < 70, c.verticalJumpScore);
  ck('failure vertical_jump_unclassified', c.failures.indexOf('vertical_jump_unclassified') >= 0, c.failures.join('|'));
  ck('qualityScore < 85', c.qualityScore < 85, c.qualityScore); }

console.log('\nCASE 4 — ruler-straight line (straightnessScore low + failure):');
{ const s = straightLine(); const c = run('24h', s, last(s));
  ck('straightnessScore low (< 60)', c.straightnessScore < 60, c.straightnessScore);
  ck('failure too_many_straight_segments', c.failures.indexOf('too_many_straight_segments') >= 0, c.failures.join('|'));
  ck('qualityScore < 85', c.qualityScore < 85, c.qualityScore); }

console.log('\nCASE 5 — large temporal gaps (continuityScore low + failure):');
{ const s = bigGaps(); const c = run('7d', s, last(s));
  ck('continuityScore low (< 60)', c.continuityScore < 60, c.continuityScore);
  ck('failure untreated_large_gap', c.failures.indexOf('untreated_large_gap') >= 0, c.failures.join('|'));
  ck('largestGapPct > 60', c.largestGapPct > 60, c.largestGapPct); }

console.log('\nCASE 6 — last point != dashboard (immediate FAIL):');
{ const s = healthy(30, DAY, 70000, 18, 120); const c = run('24h', s, last(s) * 1.05);   // dashboard 5% off
  ck('failure last_point_not_dashboard', c.failures.indexOf('last_point_not_dashboard') >= 0, c.failures.join('|'));
  ck('qualityScore = 0', c.qualityScore === 0, c.qualityScore);
  ck('renderMode = fail-dashboard-divergence', c.renderMode === 'fail-dashboard-divergence', c.renderMode); }

console.log('\nCASE 7 — healthy 30D (qualityScore >= 90):');
{ const s = healthy(40, 30 * DAY, 50000, 25, 200); const c = run('30d', s, last(s));
  ck('qualityScore >= 90', c.qualityScore >= 90, c.qualityScore);
  ck('renderMode = institutional', c.renderMode === 'institutional', c.renderMode);
  ck('no failures', c.failures.length === 0, c.failures.join('|') || '—'); }

console.log('\nCASE 8 — desktop vs mobile (same input → identical logical verdict):');
{ const s = healthy(30, DAY, 70000, 18, 120);
  const desk = run('24h', s, last(s), 1440);
  const mob  = run('24h', s, last(s), 375);
  ck('viewportWidth differs (1440 vs 375)', desk.viewportWidth === 1440 && mob.viewportWidth === 375, desk.viewportWidth + '/' + mob.viewportWidth);
  ck('same qualityScore', desk.qualityScore === mob.qualityScore, desk.qualityScore + '==' + mob.qualityScore);
  ck('same renderMode', desk.renderMode === mob.renderMode, desk.renderMode);
  ck('same scores (cluster/straight/jump/density/continuity)',
     desk.clusterScore === mob.clusterScore && desk.straightnessScore === mob.straightnessScore &&
     desk.verticalJumpScore === mob.verticalJumpScore && desk.densityScore === mob.densityScore &&
     desk.continuityScore === mob.continuityScore,
     [desk.clusterScore, desk.straightnessScore, desk.verticalJumpScore, desk.densityScore, desk.continuityScore].join(','));
  ck('same failures', desk.failures.join('|') === mob.failures.join('|'), desk.failures.join('|') || '—'); }

console.log('\nPURITY — contract never mutates the input series:');
{ const s = healthy(30, DAY, 70000, 18, 120); const snapshot = JSON.stringify(s);
  run('24h', s, last(s)); run('24h', s, last(s), 375);
  ck('input series unchanged after measurement', JSON.stringify(s) === snapshot); }

console.log('\nRESULT:', ok ? 'ALL PASS ✓ — render contract is measurable + viewport-stable' : 'FAIL ✗');
process.exit(ok ? 0 : 1);
