/* AURIX — SPEC 2: VISUAL PREPARATION ENGINE — validation harness.
   Extracts the REAL prepareAurixVisualSeries + its pure core + helpers from
   app.js, stubs only the data accessors (getAurixRenderSeries, investableValueBase,
   _aurixLoadCapitalFlows), and asserts the 10 mandated cases:

     1. healthy 24H        → no critical gaps, reasonable clusters, targetPointCount computed
     2. cluster at end     → cluster detected
     3. temporal hole      → gap detected
     4. redundant points   → redundant detected (classified, NOT removed)
     5. capital event      → event detected + line NOT altered
     6. 7D many points     → targetPointCount within range
     7. 30D/1A/TOTAL       → deterministic preparation
     8. same input         → same output, byte for byte
     9. last point         → still equals dashboard
    10. no mutation        → input canonical series untouched

   PURE READ proof throughout. Run: node docs/AURIX-VISUAL-PREPARATION-harness.js */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function fn(name){ const s='function '+name+'('; const i=src.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=src.indexOf('{',i),d=0; for(;k<src.length;k++){const c=src[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} return src.slice(i,k); }
function block(startStr, endStr){ const i=src.indexOf(startStr); if(i<0)throw new Error('missing '+startStr);
  const e=src.indexOf(endStr, i); if(e<0)throw new Error('missing '+endStr); return src.slice(i, e+endStr.length); }

const RC_CONSTS = block('const _AURIX_RC_QUALITY_THRESHOLD', 'const _AURIX_RC_VPAD_FRAC = 0.08;');
const VP_CONSTS = block('const _AURIX_VP_DENSITY', 'const _AURIX_VP_VALUE_EPS = 0.004;');

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
[ fn('_aurixRenderContractGeometry'), fn('_aurixVpTargetPointCount'),
  fn('_aurixComputeVisualPreparation'), fn('prepareAurixVisualSeries') ].forEach(c => vm.runInContext(c, sb));

// ── synthetic series builders ──────────────────────────────────────────────
function healthy(n, spanMs, base, drift, amp) {
  const t1 = NOW, t0 = NOW - spanMs;
  return Array.from({ length: n }, (_, i) => ({
    time: t0 + Math.round(i * spanMs / (n - 1)),
    value: base + i * drift + amp * Math.sin(i * 0.7),
  }));
}
// 8 spread points + 20 crammed into the last 0.5% of the 24h width.
function clusterEnd() {
  const t1 = NOW, t0 = NOW - DAY, span = t1 - t0, pts = [];
  for (let i = 0; i < 8; i++) pts.push({ time: t0 + (i / 7) * 0.85 * span, value: 70000 + i * 5 });
  for (let i = 0; i < 20; i++) pts.push({ time: t0 + (0.995 + (i / 19) * 0.005) * span, value: 70040 + i });
  return pts;
}
// 24H with a 3-hour hole in the middle (> the 90-min threshold).
function withGap() {
  const t1 = NOW, t0 = NOW - DAY, pts = [];
  for (let i = 0; i < 10; i++) pts.push({ time: t0 + i * 40 * MIN, value: 70000 + i * 8 });        // 0 .. 6h
  const after = t0 + 9 * 40 * MIN + 3 * HOUR;                                                        // +3h hole
  for (let i = 0; i < 10; i++) pts.push({ time: after + i * 40 * MIN, value: 70100 + i * 8 });
  pts[pts.length - 1].time = t1;
  return pts;
}
// sharp climb then a long flat plateau (plateau interior = redundant: tiny delta vs big span).
function withRedundant() {
  const t1 = NOW, t0 = NOW - DAY, span = t1 - t0, n = 20, pts = [];
  for (let i = 0; i < n; i++) {
    const v = i < 4 ? 70000 + i * 2500 : 80000 + (i - 4) * 0.5;        // climb 70k→80k, then near-flat drift
    pts.push({ time: t0 + (i / (n - 1)) * span, value: v });
  }
  return pts;
}

let ok = true;
const ck = (n, c, g) => { console.log((c ? '  ✓' : '  ✗') + ' ' + n + (g !== undefined ? '  [' + g + ']' : '')); if (!c) ok = false; };
const run = (range, series, dash, flows, vw) => { SERIES = series; DASH = dash; FLOWS = flows || []; return sb.prepareAurixVisualSeries(range, vw); };
const lastV = s => s[s.length - 1].value;

console.log('AURIX SPEC 2 — Visual Preparation Engine\n');

console.log('CASE 1 — healthy 24H (no critical gaps, reasonable clusters, target computed):');
{ const s = healthy(30, DAY, 70000, 18, 120); const p = run('24h', s, lastV(s), [], 1440);
  ck('no critical gaps', p.gaps.length === 0, p.gaps.length);
  ck('clusters reasonable (0)', p.clusters.length === 0, p.clusters.length);
  ck('targetPointCount in [60,110]', p.targetPointCount >= 60 && p.targetPointCount <= 110, p.targetPointCount); }

console.log('\nCASE 2 — cluster at end (cluster detected):');
{ const s = clusterEnd(); const p = run('24h', s, lastV(s), [], 1440);
  ck('cluster detected (>=1)', p.clusters.length >= 1, p.clusters.length);
  ck('cluster reason = visual_cluster', p.clusters[0] && p.clusters[0].reason === 'visual_cluster', p.clusters[0] && p.clusters[0].pointCount); }

console.log('\nCASE 3 — temporal hole (gap detected):');
{ const s = withGap(); const p = run('24h', s, lastV(s), [], 1440);
  ck('gap detected (>=1)', p.gaps.length >= 1, p.gaps.length);
  ck('gap reason = time_gap', p.gaps[0] && p.gaps[0].reason === 'time_gap', p.gaps[0] && Math.round(p.gaps[0].durationMs / MIN) + 'min'); }

console.log('\nCASE 4 — redundant points (classified, not removed):');
{ const s = withRedundant(); const p = run('24h', s, lastV(s), [], 1440);
  ck('redundant points detected (>0)', p.redundantPoints.length > 0, p.redundantPoints.length);
  ck('preparedPoints NOT trimmed (== source)', p.preparedPoints.length === p.sourcePoints.length, p.preparedPoints.length + '/' + p.sourcePoints.length); }

console.log('\nCASE 5 — capital event (detected + line NOT altered):');
{ const s = healthy(30, DAY, 70000, 18, 120);
  const ev = { ts: s[15].time, amountUSD: 5000, kind: 'deposit' };
  const p = run('24h', s, lastV(s), [ev], 1440);
  ck('capitalEvent detected', p.capitalEvents.length >= 1, p.capitalEvents.length);
  ck('event type carried', p.capitalEvents[0] && p.capitalEvents[0].type === 'deposit', p.capitalEvents[0] && p.capitalEvents[0].visualPriority);
  const lineSame = p.preparedPoints.length === s.length && p.preparedPoints.every((q, i) => q.value === s[i].value && q.time === s[i].time);
  ck('line NOT altered by the event', lineSame, lineSame); }

console.log('\nCASE 6 — 7D many points (targetPointCount within range):');
{ const s = healthy(200, 7 * DAY, 60000, 4, 300); const p = run('7d', s, lastV(s), [], 1440);
  ck('targetPointCount in [90,150]', p.targetPointCount >= 90 && p.targetPointCount <= 150, p.targetPointCount);
  ck('actualPointCount = 200', p.actualPointCount === 200, p.actualPointCount); }

console.log('\nCASE 7 — 30D / 1A / TOTAL deterministic preparation:');
{ let allDet = true;
  for (const r of ['30d', '1y', 'all']) {
    const s = healthy(120, (r === '30d' ? 30 : r === '1y' ? 360 : 380) * DAY, 50000, 6, 250);
    const a = run(r, s, lastV(s), [], 1440), b = run(r, s, lastV(s), [], 1440);
    const same = JSON.stringify(a) === JSON.stringify(b);
    ck(r + ' deterministic (run twice identical)', same, 'target=' + a.targetPointCount);
    allDet = allDet && same;
  } }

console.log('\nCASE 8 — same input → same output, byte for byte:');
{ const s = healthy(30, DAY, 70000, 18, 120);
  const a = run('24h', s, lastV(s), [], 1440);
  const b = run('24h', s, lastV(s), [], 1440);
  ck('JSON identical', JSON.stringify(a) === JSON.stringify(b)); }

console.log('\nCASE 9 — last point still equals dashboard:');
{ let allOk = true;
  for (const r of ['24h', '7d', '30d', '1y', 'all']) {
    const s = healthy(60, (r === '24h' ? 1 : r === '7d' ? 7 : r === '30d' ? 30 : r === '1y' ? 360 : 380) * DAY, 65000, 5, 150);
    const p = run(r, s, lastV(s), [], 1440);
    const good = p.lastPoint && Math.abs(p.meta.lastDeltaPct) <= 0.5;
    ck(r + ' lastPoint == dashboard (±0.5%)', good, p.meta.lastDeltaPct);
    allOk = allOk && good;
  } }

console.log('\nCASE 10 — no mutation of the input canonical series:');
{ const s = healthy(30, DAY, 70000, 18, 120); const before = JSON.stringify(s);
  run('24h', s, lastV(s), [{ ts: s[10].time, amountUSD: 4000, kind: 'asset_add' }], 1440);
  run('24h', s, lastV(s), [], 375);
  ck('input series unchanged', JSON.stringify(s) === before); }

console.log('\nRESULT:', ok ? 'ALL PASS ✓ — preparation is measurable, deterministic, non-mutating' : 'FAIL ✗');
process.exit(ok ? 0 : 1);
