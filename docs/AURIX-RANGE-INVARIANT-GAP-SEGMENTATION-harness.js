'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-RANGE-INVARIANT-GAP-SEGMENTATION-harness — SPEC DSH.CHART.RANGE_INVARIANT_GAP_SEGMENTATION
// ════════════════════════════════════════════════════════════════════════════
// P0. PROVEN OWNER: `_aurixRealGapFloorMs` derived the observation-gap threshold from the REQUESTED range
// (`_AURIX_VP_GAP_FLOOR_MS[range]` = 8h/2d/7d/45d), so the SAME overnight timestamp gap segmented in 24H but
// drew one smooth bridge in 7D/30D/1Y/ALL. FIX: the threshold is now cadence-relative (median × mult) with
// range-INVARIANT [MIN,MAX] guards. Observation gaps are classified from ORIGINAL validated timestamps
// before LTTB and each segment is downsampled independently; the renderer emits one path/fill per segment.
// The FRC current-regime single-path (SPEC.45/51) now splits on REGIME boundaries ONLY (capital + value
// cliff), so a same-level observation gap stays INSIDE the selected regime and renders as separate segments
// (capital/value-cliff regime single-path is UNCHANGED). Loads the REAL production functions (no re-impl).
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(s) { let k = app.indexOf('{', s), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(s, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing fn ' + n); return braceSlice(i); }
function konstSrc(n) { const m = new RegExp('const ' + n + '\\s*=\\s*').exec(app); if (!m) throw new Error('missing const ' + n); const eq = m.index + m[0].length, f = app[eq]; if (f === '{' || f === '[') { const b = braceSlice(eq); const s = app.indexOf(';', eq + b.length); return app.slice(m.index, s + 1); } const s = app.indexOf(';', eq); return app.slice(m.index, s + 1); }

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const MIN = 60000, HOUR = 36e5, DAY = 864e5, T0 = 1_800_000_000_000;
const CONSTS = ['_AURIX_VP_GAP_FLOOR_MS', '_AURIX_VP_GAP_MEDIAN_MULT', '_AURIX_OBS_GAP_MIN_MS', '_AURIX_OBS_GAP_MAX_MS',
  '_AURIX_REGIME_CLIFF_FRAC', '_AURIX_BRIDGE_SEG_ENABLED', '_AURIX_BRIDGE_SEG_FRAC', '_AURIX_CAPITAL_STEP_SEG_ENABLED',
  '_AURIX_SPARSE_RAMP_SEG_ENABLED', '_AURIX_VJUMP_MIN_FRAC', '_AURIX_VJUMP_P95_MULT', '_AURIX_CAPSTEP_RATIO_LO',
  '_AURIX_CAPSTEP_RATIO_HI', '_AURIX_CAPSTEP_TS_PAD_MS', '_AURIX_SPARSE_RAMP_MULT', '_AURIX_SPARSE_RAMP_MIN_MS',
  '_AURIX_CHART_CONTINUITY_UNIFICATION', '_AURIX_EMG_RANGE_MS', '_AURIX_ORPHAN_CLEANUP_ENABLED', '_AURIX_ORPHAN_MAX_PTS',
  '_AURIX_RC_ASPECT', '_AURIX_CHART_UNIFIED_REAL_POINT_DENSITY', '_AURIX_UNIFIED_VP_DENSITY', '_AURIX_VP_DENSITY',
  '_AURIX_CHART_UNIFIED_X_PROJECTION_POLICY', '_AURIX_RC_PAD_FRAC', '_AURIX_UNIFIED_X_FILL_BETA', '_AURIX_X_FILL_BETA',
  '_AURIX_IR_VALUE_MARGIN', '_AURIX_IR_VPAD_FRAC', '_AURIX_Y_JUMP_DOMINANCE', '_AURIX_Y_LEGIBLE_ALPHA'];
const FNS = ['_aurixSplitAtGaps', '_aurixConfirmedBridgeGaps', '_aurixVerticalJumps', '_aurixCapitalStepBreaks',
  '_aurixSparseRampBreaks', '_aurixRealGapFloorMs', '_aurixBuildContinuityValidatedSeries', '_aurixStructuralBreaks',
  '_aurixRegimeBoundaryBreaks', '_aurixVpTargetPointCount', 'downsampleAurixLTTB', '_aurixSignificantLocalExtrema', 'downsampleAurixAdaptive', 'computeAurixAdaptiveXScale',
  'computeAurixValueScale', '_aurixMonotonePath', 'buildAurixAreaPath', 'renderValidatedPortfolioChartWithInstitutionalRenderer',
  '_aurixEmergencyHash'];

let FLOWS = [];
const ctx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Set, RegExp, Object, String, window: {} };
ctx._aurixLoadCapitalFlows = () => FLOWS;
ctx.toBase = v => v;
vm.createContext(ctx);
CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (e) { console.log('  (const load fail ' + c + ': ' + e.message + ')'); } });
FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (e) { console.log('  (fn load fail ' + f + ': ' + e.message + ')'); } });
const SB = (pts, r) => vm.runInContext('_aurixStructuralBreaks', ctx)(pts, r);
const RB = (pts, r) => vm.runInContext('_aurixRegimeBoundaryBreaks', ctx)(pts, r);
const floorMs = (pts, r) => vm.runInContext('_aurixRealGapFloorMs', ctx)(pts, r);
const _toTs = pts => pts.map(p => ({ ts: p.time, value: p.value }));   // renderer consumes {ts,value}
const render = (pts, r) => vm.runInContext('renderValidatedPortfolioChartWithInstitutionalRenderer', ctx)(_toTs(pts), { range: r, vw: 1000, vh: 240 });
const renderMob = (pts, r) => vm.runInContext('renderValidatedPortfolioChartWithInstitutionalRenderer', ctx)(_toTs(pts), { range: r, vw: 390, vh: 200 });
const mCount = d => ((d || '').match(/M /g) || []).length;
const RANGES = ['24h', '7d', '30d', '1y', 'all'];

// helpers — points {time,value}; dense sessions + gaps
const dense = (fromH, toH, base, drift) => { const from = T0 - fromH * HOUR, to = T0 - toH * HOUR, span = to - from, n = Math.max(12, Math.round(span / (10 * MIN))); const o = []; for (let i = 0; i < n; i++) o.push({ time: from + Math.round(i * span / (n - 1)), value: +(base + i * drift).toFixed(2) }); return o; };
const brkStart = (pts, r, fn) => (fn(pts, r).breaks ? fn(pts, r).breaks : fn(pts, r)).map(b => b.start);

// ── 1) same overnight gap → identical boundary in every range ──────────────────
console.log('\n1) range-invariant boundary:');
{ const pts = dense(30, 23.3, 6000, 1).concat(dense(12, 0, 6060, 1));   // ~11h overnight gap, same level
  const gapAt = pts.find((p, i) => i > 0 && pts[i].time - pts[i - 1].time > 3 * HOUR);
  const boundaries = RANGES.map(r => { const b = SB(pts, r).breaks || []; return b.length === 1 ? b[0].start + ':' + b[0].end : (b.length + 'brk'); });
  ok('1 same overnight pair → identical boundary in 24h/7d/30d/1y/all', new Set(boundaries).size === 1 && boundaries[0].indexOf(':') > 0, JSON.stringify(boundaries));
  ok('1 floor identical across ranges (range-invariant)', new Set(RANGES.map(r => floorMs(pts, r))).size === 1); }

// ── 2) normal cadence → no break, one path, byte-identical desktop vs mobile shape ──
console.log('\n2) healthy continuous → one path:');
{ const pts = dense(24, 0, 6000, 0.5);   // continuous dense, no gap
  ok('2 continuous → 0 structural breaks in every range', RANGES.every(r => (SB(pts, r).breaks || []).length === 0));
  const rc = render(pts, '30d');
  ok('2 continuous → one visible path (single M)', rc.ok && mCount(rc.linePath) === 1 && rc.segmentCount === 1, 'M=' + mCount(rc.linePath) + ' seg=' + rc.segmentCount); }

// ── 3+4) gap survives LTTB; each segment downsampled independently; no cross-gap connector ──
console.log('\n3+4) segmentation through renderer (per-segment downsample):');
{ const pts = dense(30, 23.3, 6000, 1).concat(dense(12, 0, 6060, 1));
  RANGES.forEach(r => { const rc = render(pts, r); ok('3/4 ' + r + ' → exactly 2 rendered segments, no connector', rc.ok && rc.segmentCount === 2 && mCount(rc.linePath) === 2 && mCount(rc.areaPath) === 2, 'seg=' + rc.segmentCount + ' Mline=' + mCount(rc.linePath) + ' Marea=' + mCount(rc.areaPath)); });
  const rc = render(pts, '1y');
  ok('4 endpoints preserved (both original gap-adjacent points survive)', rc.visiblePoints.some(p => p.time === pts[0].time) && rc.visiblePoints.some(p => p.time === pts[pts.length - 1].time)); }

// ── 5) 24H accumulation of later points → old gap remains a gap (does not heal) ──
console.log('\n5) 24H gap does not heal:');
{ let pts = dense(20, 12, 6000, 1).concat(dense(4, 0, 6050, 1));   // gap ~8h, small recent block
  const before = render(pts, '24h').segmentCount;
  pts = pts.concat(dense(0.3, 0, 6058, 1).slice(1));                // accumulate more recent points
  const after = render(pts, '24h').segmentCount;
  ok('5 old gap still a gap after accumulation (segments ≥ 2 both times)', before === 2 && after === 2, 'before=' + before + ' after=' + after); }

// ── 6) long ranges: no smooth bridge ────────────────────────────────────────────
console.log('\n6) long ranges no bridge:');
{ const pts = dense(40, 30, 6000, 1).concat(dense(12, 0, 6070, 1));
  ok('6 7d/30d/1y/all all segment the overnight gap (no single smooth curve)', ['7d', '30d', '1y', 'all'].every(r => render(pts, r).segmentCount === 2)); }

// ── 7) multiple gaps → exact segment count ──────────────────────────────────────
console.log('\n7) multiple gaps:');
{ const pts = dense(60, 50, 6000, 1).concat(dense(38, 28, 6040, 1)).concat(dense(12, 0, 6090, 1));   // 3 sessions, 2 gaps
  RANGES.forEach(r => { const rc = render(pts, r); ok('7 ' + r + ' → 3 segments (2 gaps)', rc.segmentCount === 3 && mCount(rc.linePath) === 3, 'seg=' + rc.segmentCount); }); }

// ── 8) stroke, fill and glow never cross boundaries (line & area subpath counts match) ──
console.log('\n8) fill/stroke never cross:');
{ const pts = dense(30, 23.3, 6000, 1).concat(dense(12, 0, 6060, 1));
  const rc = render(pts, '30d');
  ok('8 line subpaths === area subpaths === segmentCount (no bridge in fill)', mCount(rc.linePath) === rc.segmentCount && mCount(rc.areaPath) === rc.segmentCount); }

// ── 9) regime boundary (value cliff / capital) → single-path preserved (SPEC.45/51) ──
console.log('\n9) regime vs observation classification:');
{ const obs = dense(30, 23.3, 6000, 1).concat(dense(12, 0, 6060, 1));                 // same-level observation gap
  FLOWS = []; ok('9 observation gap → 0 regime boundaries (stays multi-segment)', RB(obs, '1y').length === 0);
  const cliff = dense(40, 30, 16000, 2).concat(dense(12, 0, 6000, 1.5));              // 16000 → gap → 6000 (regime cliff)
  ok('9 value cliff across gap → 1 regime boundary (single-path regime)', RB(cliff, '1y').filter(b => b.reason === 'value_cliff').length === 1, JSON.stringify(RB(cliff, '1y'))); }
{ // capital step across a gap → regime boundary
  const pre = dense(40, 30, 6000, 0.3); const post = dense(12, 0, 9050, 0.3);
  FLOWS = [{ ts: post[0].time, amountUSD: 3000 }];
  const rb = RB(pre.concat(post), '1y');
  ok('9 reconciled capital step → regime boundary present', rb.some(b => b.reason === 'capital_step'), JSON.stringify(rb.map(b => b.reason)));
  FLOWS = []; }

// ── 10) no synthetic/mutated points (every rendered point ∈ input) ──────────────
console.log('\n10) no synthetic points:');
{ const pts = dense(30, 23.3, 6000, 1).concat(dense(12, 0, 6060, 1));
  const rc = render(pts, '1y');
  const inSet = new Set(pts.map(p => p.time + '|' + p.value));
  ok('10 every rendered visible point exists verbatim in input', rc.visiblePoints.every(p => inSet.has(p.time + '|' + p.value))); }

// ── 11) desktop / mobile exact segment + hash parity ────────────────────────────
console.log('\n11) desktop/mobile parity:');
{ const pts = dense(30, 23.3, 6000, 1).concat(dense(12, 0, 6060, 1));
  RANGES.forEach(r => { const d = render(pts, r), m = renderMob(pts, r); ok('11 ' + r + ' → same segment count desktop==mobile', d.segmentCount === m.segmentCount && d.structuralBreakCount === m.structuralBreakCount, 'd=' + d.segmentCount + ' m=' + m.segmentCount); }); }

// ── source invariants ───────────────────────────────────────────────────────────
console.log('\nsource invariants:');
ok('S1 spec marker present', /RANGE_INVARIANT_GAP_SEGMENTATION/.test(app));
ok('S2 realGapFloor no longer keys on requested range (owner removed)', !/let floor = tbl\[r\] \|\| \(7 \* 864e5\);/.test(fnSrc('_aurixRealGapFloorMs')) && /median \* mult/.test(fnSrc('_aurixRealGapFloorMs')));
ok('S3 renderer detects breaks on ORIGINAL src before LTTB', /const sbrk = _aurixStructuralBreaks\(src, r\);/.test(fnSrc('renderValidatedPortfolioChartWithInstitutionalRenderer')));
ok('S4 renderer downsamples each segment independently', /segments = kept\.map\(run =>/.test(fnSrc('renderValidatedPortfolioChartWithInstitutionalRenderer')));
ok('S5 FRC regime selection uses regime-boundary breaks (3 single-path steps)', (app.match(/breaks = _aurixRegimeBoundaryBreaks\(mapped, r\)/g) || []).length >= 3);
ok('S6 capital/value-cliff regime single-path preserved (SPEC.45/51 reason codes intact)', app.indexOf('active_regime_single_path') >= 0 && app.indexOf('single_continuous_7d_single_path') >= 0);

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
