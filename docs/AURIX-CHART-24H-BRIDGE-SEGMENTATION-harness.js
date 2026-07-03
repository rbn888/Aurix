'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-24H-BRIDGE-SEGMENTATION-harness — SPEC DSH.CHART.24H.BRIDGE-SEGMENTATION.01
// ════════════════════════════════════════════════════════════════════════════
// The VISIBLE renderer (renderValidatedPortfolioChartWithInstitutionalRenderer) must break the
// premium line at a CONFIRMED sparse bridge (a hole that is a genuine outage AND a dominant fraction
// of the shown window) instead of drawing one continuous premium curve across missing data. It must:
//   - break the path at a >20h 24H gap (≥2 'M' subpaths, ≥2 area 'Z' regions),
//   - keep an ordinary pause continuous (single subpath) — dominance gate,
//   - preserve the dense premium curve WITHIN each run (cubic 'C' commands, no point invented),
//   - never touch values/timestamps/returns,
//   - be fully reversible (_AURIX_BRIDGE_SEG_ENABLED=false → single continuous path).
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fn(name) { const s = 'function ' + name + '('; const i = src.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let k = src.indexOf('{', i), d = 0; for (; k < src.length; k++) { const c = src[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return src.slice(i, k); }
function objConst(name) { const i = src.indexOf('const ' + name + ' ='); if (i < 0) throw new Error('missing obj const ' + name); const j = src.indexOf('};', i); return src.slice(i, j + 2); }
function scalarConst(name) { const m = src.match(new RegExp('const ' + name + '\\s*=.*?;')); if (!m) throw new Error('missing const ' + name); return m[0]; }

const ENGINE_FNS = ['_aurixVpTargetPointCount', 'downsampleAurixLTTB', '_aurixSignificantLocalExtrema', 'downsampleAurixAdaptive',
  'computeAurixAdaptiveXScale', 'computeAurixValueScale', '_aurixMonotonePath', 'buildAurixMonotonicPath', 'buildAurixAreaPath',
  '_aurixSplitAtGaps', '_aurixConfirmedBridgeGaps', 'renderValidatedPortfolioChartWithInstitutionalRenderer'];
const SCALARS = ['_AURIX_RC_ASPECT', '_AURIX_RC_PAD_FRAC', '_AURIX_RC_VPAD_FRAC', '_AURIX_IR_VALUE_MARGIN', '_AURIX_IR_VPAD_FRAC',
  '_AURIX_Y_JUMP_DOMINANCE', '_AURIX_Y_LEGIBLE_ALPHA', '_AURIX_VP_GAP_MEDIAN_MULT'];
const OBJS = ['_AURIX_VP_DENSITY', '_AURIX_X_FILL_BETA', '_AURIX_VP_GAP_FLOOR_MS', '_AURIX_BRIDGE_SEG_FRAC'];

function mkSandbox(segEnabled) {
  const sb = { console, Math, JSON, Array, Number, isFinite, Infinity, Date, activeRange: '24h', window: undefined };
  vm.createContext(sb);
  SCALARS.forEach(c => vm.runInContext(scalarConst(c), sb));
  OBJS.forEach(c => vm.runInContext(objConst(c), sb));
  vm.runInContext('const _AURIX_BRIDGE_SEG_ENABLED = ' + (segEnabled ? 'true' : 'false') + ';', sb);
  ENGINE_FNS.forEach(n => { try { vm.runInContext(fn(n), sb); } catch (e) {} });
  return sb;
}
const SB = mkSandbox(true), SB_OFF = mkSandbox(false);

const MIN = 60e3, HOUR = 36e5;
let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name + (info ? '  [' + info + ']' : '')); } else { fail++; console.log('  ✗ ' + name + (info ? '  [' + info + ']' : '')); } }
const box = { left: 6, right: 994, top: 16, bottom: 404 };
function render(sb, pts) { return vm.runInContext('renderValidatedPortfolioChartWithInstitutionalRenderer(' + JSON.stringify(pts) + ', { range: "24h", vw: 1000, vh: 420, box: ' + JSON.stringify(box) + ' })', sb); }
function gaps(sb, pts, range) { return vm.runInContext('_aurixConfirmedBridgeGaps(' + JSON.stringify(pts.map(p => ({ time: p.ts, value: p.value }))) + ', ' + JSON.stringify(range || '24h') + ')', sb); }
const countM = s => (String(s).match(/M /g) || []).length;
const countZ = s => (String(s).match(/Z/g) || []).length;

// Dense continuous 24H (~216 pts, ~6.6-min cadence), organic micro-variation + 2 real extrema.
function dense24h() { const p = [], n = 216, t0 = 1_800_000_000_000, base = 72000;
  for (let i = 0; i < n; i++) { let v = base + 220 * Math.sin(i * 0.18) + 60 * Math.cos(i * 0.51); if (i === 70) v += 900; if (i === 150) v -= 800; p.push({ ts: t0 + i * 6.66 * MIN, value: Math.round(v) }); } return p; }
// Two dense clusters split by a ~21h hole (the confirmed >20h bridge). Total span ~24h.
function bridged24h() { const p = [], t0 = 1_800_000_000_000, base = 72000;
  for (let i = 0; i < 12; i++) p.push({ ts: t0 + i * 8 * MIN, value: Math.round(base + 40 * Math.sin(i * 0.5)) });
  const t1 = t0 + 11 * 8 * MIN + 21 * HOUR;
  for (let i = 0; i < 12; i++) p.push({ ts: t1 + i * 8 * MIN, value: Math.round(base + 120 + 40 * Math.sin(i * 0.5)) });
  return p; }
// Dense 24H with ONE ~10h pause in the middle (below the 12h dominance gate → must stay continuous).
function ordinaryPause24h() { const p = [], t0 = 1_800_000_000_000, base = 72000;
  for (let i = 0; i <= 18; i++) p.push({ ts: t0 + i * 30 * MIN, value: Math.round(base + 30 * Math.sin(i * 0.3)) });      // 0–9h
  const t1 = t0 + 9 * HOUR + 10 * HOUR;                                                                                   // +10h hole
  for (let i = 0; i <= 10; i++) p.push({ ts: t1 + i * 30 * MIN, value: Math.round(base + 50 + 30 * Math.sin(i * 0.3)) }); // 19–24h
  return p; }

console.log('AURIX-CHART-24H-BRIDGE-SEGMENTATION — SPEC DSH.CHART.24H.BRIDGE-SEGMENTATION.01\n');

console.log('CONTINUOUS (no confirmed bridge) — premium single path preserved:');
{ const rc = render(SB, dense24h());
  ok('1 dense continuous 24H → NOT segmented (single subpath)', rc.segmentedBridgeCount === 0 && countM(rc.linePath) === 1, 'segs=' + rc.segmentedBridgeCount + ' M=' + countM(rc.linePath));
  ok('2 continuous path is premium cubic + single area region', /C /.test(rc.linePath) && countZ(rc.areaPath) === 1, 'C=' + /C /.test(rc.linePath) + ' Z=' + countZ(rc.areaPath)); }

console.log('\nCONFIRMED >20h bridge — path breaks, clusters stay premium:');
{ const rc = render(SB, bridged24h());
  ok('3 >20h gap → segmentedBridgeCount 1 + broken line (≥2 subpaths)', rc.segmentedBridgeCount === 1 && countM(rc.linePath) >= 2, 'segs=' + rc.segmentedBridgeCount + ' M=' + countM(rc.linePath));
  ok('4 area also splits (≥2 filled regions)', countZ(rc.areaPath) >= 2, 'Z=' + countZ(rc.areaPath));
  ok('5 each run keeps the dense premium cubic curve', /C /.test(rc.linePath), 'hasC=' + /C /.test(rc.linePath));
  const inVals = new Set(bridged24h().map(p => p.value));
  ok('6 no point invented (all rendered values are real inputs)', rc.visiblePoints.every(p => inVals.has(p.value)));
  ok('7 first & last real points preserved across the break', rc.visiblePoints[0].time === bridged24h()[0].ts && rc.visiblePoints[rc.visiblePoints.length - 1].time === bridged24h()[bridged24h().length - 1].ts); }

console.log('\nDOMINANCE GATE — ordinary pause stays continuous:');
{ const rc = render(SB, ordinaryPause24h());
  ok('8 ~10h pause (< dominance) → NOT segmented (single subpath)', rc.segmentedBridgeCount === 0 && countM(rc.linePath) === 1, 'segs=' + rc.segmentedBridgeCount + ' M=' + countM(rc.linePath)); }

console.log('\nDETECTION HELPER + scope:');
{ ok('9 helper flags the >20h bridge (24h)', gaps(SB, bridged24h(), '24h').length === 1);
  ok('10 helper flags nothing on dense continuous (24h)', gaps(SB, dense24h(), '24h').length === 0);
  ok('11 ALL never segments (all-history has no requested window)', gaps(SB, bridged24h(), 'all').length === 0); }

console.log('\nDETERMINISM + returns-untouched + rollback:');
{ const a = render(SB, bridged24h()), b = render(SB, bridged24h());
  ok('12 deterministic (same input → identical paths)', a.linePath === b.linePath && a.areaPath === b.areaPath);
  ok('13 renderer is geometry-only (no returnPct emitted)', a.returnPct === undefined && a.returnState === undefined); }
{ const rc = render(SB_OFF, bridged24h());
  ok('14 rollback (_AURIX_BRIDGE_SEG_ENABLED=false) → single continuous path even with >20h gap', rc.segmentedBridgeCount === 0 && countM(rc.linePath) === 1, 'segs=' + rc.segmentedBridgeCount + ' M=' + countM(rc.linePath)); }

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
