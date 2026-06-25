/* AURIX — SPEC 5: RENDER POLISH — precision-audit harness.
   Extracts the REAL auditAurixRenderPrecision + the render-engine chain from
   app.js, stubs only the data accessors, and asserts the code-verifiable visual
   precision invariants across all ranges + desktop/mobile + a gapped series:

     • last point aligned (right edge + dashboard value + on the path knot)
     • first point / start closure (path begins with M at the first knot)
     • area path === line base path, and the area closes (Z)
     • monotone curve never overshoots
     • all knots stay inside the plot box (no clipping)
     • tooltip knots coincide with the path knots
     • deterministic audit

   On-device items (Retina, antialiasing, glow uniformity, FPS) are SPEC 7 visual
   checks — out of scope for a headless harness. Run:
     node docs/AURIX-RENDER-POLISH-harness.js                                     */
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
const RP_BOX    = block('const _AURIX_RP_AUDIT_BOX', '};');

const DAY = 86400e3, HOUR = 36e5, MIN = 60e3, NOW = 1000 * DAY;

let SERIES = [], DASH = null, FLOWS = [];
const sb = { console, activeRange: '30d', getAurixRenderSeries: () => SERIES, investableValueBase: () => DASH, _aurixLoadCapitalFlows: () => FLOWS };
sb.window = sb; sb.window.innerWidth = 1440;
vm.createContext(sb);
vm.runInContext(RC_CONSTS, sb); vm.runInContext(VP_CONSTS, sb); vm.runInContext(IR_CONSTS, sb); vm.runInContext(Y_CONSTS, sb); vm.runInContext(RP_BOX, sb);
[ fn('_aurixRenderContractGeometry'), fn('_aurixVpTargetPointCount'), fn('_aurixComputeVisualPreparation'),
  fn('prepareAurixVisualSeries'), fn('downsampleAurixLTTB'), fn('_aurixSignificantLocalExtrema'), fn('downsampleAurixAdaptive'), fn('computeAurixTimeScale'),
  fn('computeAurixValueScale'), fn('_aurixMonotonePath'), fn('buildAurixMonotonicPath'),
  fn('buildAurixAreaPath'), fn('_aurixSplitAtGaps'), fn('renderAurixInstitutionalChart'),
  fn('auditAurixRenderPrecision') ].forEach(c => vm.runInContext(c, sb));

const { auditAurixRenderPrecision } = sb;
const BOX_DESK = { left: 60, right: 940, top: 24, bottom: 211.2 };
const BOX_MOB  = { left: 60, right: 850, top: 24, bottom: 211.2 };

function healthy(n, spanMs, base, drift, amp) {
  const t0 = NOW - spanMs;
  return Array.from({ length: n }, (_, i) => ({ time: t0 + Math.round(i * spanMs / (n - 1)), value: base + i * drift + amp * Math.sin(i * 0.7) }));
}
function withGap() {   // 24H with a real 12-hour hole (exceeds the adaptive gap threshold)
  const t0 = NOW - DAY, pts = [];
  for (let i = 0; i < 9; i++) pts.push({ time: t0 + i * 30 * MIN, value: 70000 + i * 8 });
  const after = t0 + 16 * HOUR;
  for (let i = 0; i < 16; i++) pts.push({ time: after + i * 30 * MIN, value: 70120 + i * 8 });
  return pts;
}
const lastV = s => s[s.length - 1].value;

let ok = true;
const ck = (n, c, g) => { console.log((c ? '  ✓' : '  ✗') + ' ' + n + (g !== undefined ? '  [' + g + ']' : '')); if (!c) ok = false; };

console.log('AURIX SPEC 5 — Render Polish (precision audit)\n');

const RANGES = [['24h', 1], ['7d', 7], ['30d', 30], ['1y', 360], ['all', 380]];
console.log('ALL RANGES — institutional-precision (every code-verifiable invariant holds):');
for (const [r, days] of RANGES) {
  const s = healthy(140, days * DAY, 60000, 6, 220); SERIES = s; DASH = lastV(s); FLOWS = [];
  const a = auditAurixRenderPrecision(r, 1000, 240, BOX_DESK);
  ck(r + ' status = institutional-precision', a.status === 'institutional-precision', (a.failures || []).join('|') || 'ok');
}

console.log('\nINVARIANTS (24H, detailed):');
{ const s = healthy(120, DAY, 70000, 10, 180); SERIES = s; DASH = lastV(s);
  const a = auditAurixRenderPrecision('24h', 1000, 240, BOX_DESK);
  ck('last value == dashboard', a.checks.lastValueIsDashboard);
  ck('last knot on path + at right edge', a.checks.lastKnotOnPath && a.checks.lastXAtRightEdge);
  ck('first knot on path, starts with M', a.checks.firstKnotOnPath && a.checks.pathStartsWithMove);
  ck('area === line base path', a.checks.areaSharesLineBase);
  ck('area closes (Z)', a.checks.areaClosed);
  ck('no overshoot', a.checks.noOvershoot);
  ck('knots within plot (no clipping)', a.checks.knotsWithinPlot);
  ck('tooltip knots on path', a.checks.tooltipKnotsOnPath); }

console.log('\nGAPPED SERIES — precision holds with broken subpaths:');
{ const s = withGap(); SERIES = s; DASH = lastV(s);
  const a = auditAurixRenderPrecision('24h', 1000, 240, BOX_DESK);
  ck('status = institutional-precision', a.status === 'institutional-precision', (a.failures || []).join('|') || 'ok');
  ck('area shares ALL line subpaths', a.checks.areaSharesLineBase);
  ck('last knot still on path / dashboard', a.checks.lastKnotOnPath && a.checks.lastValueIsDashboard); }

console.log('\nDESKTOP / MOBILE — both audit clean (only the box differs):');
{ const s = healthy(150, 30 * DAY, 50000, 6, 250); SERIES = s; DASH = lastV(s);
  const d = auditAurixRenderPrecision('30d', 1000, 240, BOX_DESK);
  const m = auditAurixRenderPrecision('30d', 1000, 240, BOX_MOB);
  ck('desktop institutional-precision', d.status === 'institutional-precision', (d.failures || []).join('|') || 'ok');
  ck('mobile institutional-precision', m.status === 'institutional-precision', (m.failures || []).join('|') || 'ok');
  ck('mobile last knot at its (narrower) right edge', m.checks.lastXAtRightEdge && m.checks.lastKnotOnPath); }

console.log('\nDETERMINISM — same input → identical audit:');
{ const s = healthy(120, 7 * DAY, 65000, 5, 150); SERIES = s; DASH = lastV(s);
  const a = auditAurixRenderPrecision('7d', 1000, 240, BOX_DESK);
  const b = auditAurixRenderPrecision('7d', 1000, 240, BOX_DESK);
  ck('JSON identical', JSON.stringify(a) === JSON.stringify(b)); }

console.log('\nRESULT:', ok ? 'ALL PASS ✓ — render-layer precision invariants verified across ranges + surfaces' : 'FAIL ✗');
process.exit(ok ? 0 : 1);
