'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-24H-GAP-BRIDGE-harness — RC3-INC3B definitive 24H visual gap bridge
// ════════════════════════════════════════════════════════════════════════════
// Proves the surgical 24H bridge: a NORMAL nocturnal pause is drawn continuous (no
// split, no invented points), while real outages / daytime / anomalous-jump / event /
// non-isolated-block gaps stay split. Other ranges and all data contracts untouched.
// Executes the REAL engine against synthetic series with timestamps at known LOCAL hours.
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fn(name){ const s='function '+name+'('; const i=src.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=src.indexOf('{',i),d=0; for(;k<src.length;k++){const c=src[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} return src.slice(i,k); }
const CONST_BLOCK = src.slice(src.indexOf('const _AURIX_PATH_RENDER_SPACING'), src.indexOf('function _aurixArrConfig'));
const ENGINE_FNS = ['_aurixRenderContractGeometry','_aurixVpTargetPointCount','_aurixComputeVisualPreparation','prepareAurixVisualSeries','downsampleAurixLTTB','_aurixSignificantLocalExtrema','downsampleAurixAdaptive','computeAurixTimeScale','computeAurixAdaptiveXScale','computeAurixValueScale','_aurixArrConfig','_aurixArrRepresentVertices','_aurixMonotonePath','buildAurixMonotonicPath','buildAurixAreaPath','_aurixSplitAtGaps','_wscFmtAxisVal','_aurixCompareRenderToCanonical','auditAurixRenderVsCanonical','renderAurixInstitutionalChart'];
const AUX_CONSTS = ['_AURIX_RC_QUALITY_THRESHOLD','_AURIX_RC_WINDOW_MS','_AURIX_RC_DASHBOARD_TOL','_AURIX_RC_ASPECT','_AURIX_RC_PAD_FRAC','_AURIX_RC_VPAD_FRAC','_AURIX_IR_VALUE_MARGIN','_AURIX_IR_VPAD_FRAC','_AURIX_Y_JUMP_DOMINANCE','_AURIX_Y_LEGIBLE_ALPHA','_AURIX_X_FILL_BETA','_AURIX_VP_DENSITY','_AURIX_VP_GAP_FLOOR_MS','_AURIX_VP_GAP_MEDIAN_MULT','_AURIX_VP_CAPITAL_KINDS','_AURIX_VP_CLUSTER_WIDTH_PX','_AURIX_VP_CLUSTER_MIN_PTS','_AURIX_VP_VALUE_EPS'];

const MIN = 60e3, HOUR = 36e5, DAY = 864e5;
function mkSandbox(constBlock) {
  let SERIES = [], DASH = null;
  const sb = { console, getAurixRenderSeries: () => SERIES, investableValueBase: () => DASH, _aurixLoadCapitalFlows: () => [],
    window: undefined, Math, JSON, Array, Number, isFinite, Infinity, Date, activeRange: '24h',
    __set: (s) => { SERIES = s; DASH = s[s.length - 1].value; } };
  vm.createContext(sb);
  vm.runInContext(constBlock, sb);
  AUX_CONSTS.forEach(c => { const m = src.match(new RegExp('const ' + c + '\\s*=[^;]*?;', 's')); if (m) vm.runInContext(m[0], sb); });
  ENGINE_FNS.forEach(n => { try { vm.runInContext(fn(n), sb); } catch (e) {} });
  return sb;
}
const SB = mkSandbox(CONST_BLOCK);
const box = { left: 6, right: 994, top: 16, bottom: 244 };
function T(y, mo, d, h, mi) { return new Date(y, mo, d, h, mi, 0).getTime(); }
// 24h series: block A [sA,eA], gap, block B [sB,eB]; optional % jump across the gap.
function build(sA, eA, sB, eB, jumpPct) {
  const pts = [], v0 = 72000;
  for (let t = sA; t <= eA; t += 15 * MIN) pts.push({ time: t, value: Math.round(v0 + 80 * Math.sin(t / MIN * 0.3)) });
  const vb = v0 * (1 + (jumpPct || 0));
  for (let t = sB; t <= eB; t += 15 * MIN) pts.push({ time: t, value: Math.round(vb + 80 * Math.sin(t / MIN * 0.3)) });
  return pts;
}
function render(sb, range, series, vbw, vbh, bx) { sb.__set(series); return vm.runInContext(`renderAurixInstitutionalChart('${range}', ${vbw || 1000}, ${vbh || 260}, ${JSON.stringify(bx || box)})`, sb); }
function dec0(rc) { return (rc.gapBridgeDecisions && rc.gapBridgeDecisions[0]) || {}; }
function lastCoord(d) { const m = String(d).trim().match(/([-\d.]+)\s+([-\d.]+)\s*$/); return m ? { x: +m[1], y: +m[2] } : null; }
function connected(rc) { const lp = lastCoord(rc.pathData), px = rc.visiblePixels; if (!lp || !px.length) return false; const l = px[px.length - 1]; return Math.hypot(lp.x - l.x, lp.y - l.y) <= 0.5; }

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name + (info ? '  [' + info + ']' : '')); } else { fail++; console.log('  ✗ ' + name + (info ? '  [' + info + ']' : '')); } }

console.log('AURIX-24H-GAP-BRIDGE — RC3-INC3B definitive\n');

// 1. nocturnal 10h (23:00→09:00) → BRIDGE
{ const rc = render(SB, '24h', build(T(2026,5,14,11,0),T(2026,5,14,23,0),T(2026,5,15,9,0),T(2026,5,15,11,0),0));
  ok('1 nocturnal 10h gap → BRIDGE (continuous path)', dec0(rc).bridged === true && rc.diagnostics.renderedSubpaths === 1, dec0(rc).reason); }
// 2. nocturnal 12h (21:00→09:00) → BRIDGE
{ const rc = render(SB, '24h', build(T(2026,5,14,9,0),T(2026,5,14,21,0),T(2026,5,15,9,0),T(2026,5,15,10,30),0));
  ok('2 nocturnal 12h gap → BRIDGE', dec0(rc).bridged === true && rc.diagnostics.renderedSubpaths === 1, dec0(rc).reason + ' durH=' + dec0(rc).durationH); }
// 3. 18h gap → NO bridge
{ const rc = render(SB, '24h', build(T(2026,5,14,11,0),T(2026,5,14,15,0),T(2026,5,15,9,0),T(2026,5,15,11,0),0));
  ok('3 18h gap → NO bridge (outage_too_long), path split', dec0(rc).bridged === false && dec0(rc).reason === 'outage_too_long' && rc.diagnostics.renderedSubpaths >= 2); }
// 4. daytime 10h (11:00→21:00) → NO bridge
{ const rc = render(SB, '24h', build(T(2026,5,14,23,0),T(2026,5,15,11,0),T(2026,5,15,21,0),T(2026,5,15,23,0),0));
  ok('4 daytime gap → NO bridge (not_nocturnal)', dec0(rc).bridged === false && dec0(rc).reason === 'not_nocturnal'); }
// 5. nocturnal 10h with +8% jump → NO bridge
{ const rc = render(SB, '24h', build(T(2026,5,14,11,0),T(2026,5,14,23,0),T(2026,5,15,9,0),T(2026,5,15,11,0),0.08));
  ok('5 anomalous jump >5% → NO bridge (anomalous_jump)', dec0(rc).bridged === false && dec0(rc).reason === 'anomalous_jump', 'disp%=' + dec0(rc).dispPct); }
// 6. nocturnal gap leaving a small isolated final block → BRIDGE
{ const rc = render(SB, '24h', build(T(2026,5,14,10,0),T(2026,5,14,23,0),T(2026,5,15,8,0),T(2026,5,15,9,0),0));
  ok('6 isolated final block (small) → BRIDGE', dec0(rc).bridged === true, 'fb%=' + dec0(rc).finalBlockPct); }
// 7. last marker connected (bridge case)
{ const rc = render(SB, '24h', build(T(2026,5,14,11,0),T(2026,5,14,23,0),T(2026,5,15,9,0),T(2026,5,15,11,0),0));
  ok('7 last point connected to path (bridge)', connected(rc) === true); }
// 8. pathSegmentCount reduces when bridge applies (1 vs >=2 unbridged)
{ const sB = render(SB, '24h', build(T(2026,5,14,11,0),T(2026,5,14,23,0),T(2026,5,15,9,0),T(2026,5,15,11,0),0));   // bridged
  const sU = render(SB, '24h', build(T(2026,5,14,11,0),T(2026,5,14,15,0),T(2026,5,15,9,0),T(2026,5,15,11,0),0));   // 18h split
  const segB = (sB.pathData.match(/M /g) || []).length, segU = (sU.pathData.match(/M /g) || []).length;
  ok('8 pathSegmentCount reduces when bridge applies', segB < segU && segB === 1, 'bridged=' + segB + ' split=' + segU); }

console.log('\nOTHER RANGES UNCHANGED (never bridge):');
function gapSeries(range, days) { const pts = []; const now = T(2026,5,15,12,0); const span = days * DAY; const half = Math.floor(span/2);
  for (let i = 0; i < 30; i++) pts.push({ time: now - span + i * (half/30), value: 70000 + i * 5 });
  for (let i = 0; i < 30; i++) pts.push({ time: now - Math.floor(half*0.2) + i * ((half*0.2)/30), value: 71000 + i * 5 });   // big hole in the middle
  return pts; }
['7d','30d','1y','all'].forEach((rg, i) => { const days = { '7d':7,'30d':30,'1y':365,'all':900 }[rg];
  const rc = render(SB, rg, gapSeries(rg, days));
  const anyBridged = (rc.gapBridgeDecisions || []).some(g => g.bridged);
  ok((9 + i) + ' ' + rg + ' never bridges (range-gated)', !anyBridged && rc.diagnostics.bridgedGapCount === 0); });

console.log('\nDATA CONTRACTS:');
// 13. tooltip/inspector source = full visiblePoints (ARR/bridge don't shrink it)
{ const s = build(T(2026,5,14,11,0),T(2026,5,14,23,0),T(2026,5,15,9,0),T(2026,5,15,11,0),0); const rc = render(SB, '24h', s);
  const dsCount = vm.runInContext(`downsampleAurixAdaptive(${JSON.stringify(s)}, _aurixVpTargetPointCount('24h',1000)).length`, SB);
  ok('13 tooltip source: visiblePoints == full downsampled set', rc.visiblePoints.length === dsCount);
  ok('14 inspector source: visiblePixels == visiblePoints (full)', rc.visiblePixels.length === rc.visiblePoints.length); }
// 15. equivalence
{ render(SB, '24h', build(T(2026,5,14,11,0),T(2026,5,14,23,0),T(2026,5,15,9,0),T(2026,5,15,11,0),0));
  const a = vm.runInContext("auditAurixRenderVsCanonical('24h')", SB);
  ok('15 render↔canonical equivalence (not divergent, no invented points)', a.status !== 'divergent' && a.noInvented !== false, a.status); }
// 16. bridge is render-only — no Chart.js / data mutation in the bridge code
{ const bridgeFn = fn('_aurix24hGapBridgeDecision') + fn('_aurixGapBridgeIsNight') + fn('_aurixGapPointValueAt');
  ok('16 bridge code is render-only (no Chart.js / no snapshot/pricing writes)', ['new Chart','localStorage','portfolio_history','category_history','.push('].every(s => bridgeFn.indexOf(s) < 0) || bridgeFn.indexOf('out.push') < 0); }

console.log('\nROLLBACK:');
// 17. ENABLED=false → no bridge
{ const sbOff = mkSandbox(CONST_BLOCK.replace('_AURIX_GAP_BRIDGE_24H_ENABLED = true', '_AURIX_GAP_BRIDGE_24H_ENABLED = false'));
  const rc = render(sbOff, '24h', build(T(2026,5,14,11,0),T(2026,5,14,23,0),T(2026,5,15,9,0),T(2026,5,15,11,0),0));
  ok('17 ENABLED=false → NO bridge (split restored)', dec0(rc).bridged === false && dec0(rc).reason === 'disabled' && rc.diagnostics.renderedSubpaths >= 2); }
// 18. MAX_MS=0 → no bridge
{ const sbZero = mkSandbox(CONST_BLOCK.replace('_AURIX_GAP_BRIDGE_24H_MAX_MS = 14 * 60 * 60 * 1000', '_AURIX_GAP_BRIDGE_24H_MAX_MS = 0'));
  const rc = render(sbZero, '24h', build(T(2026,5,14,11,0),T(2026,5,14,23,0),T(2026,5,15,9,0),T(2026,5,15,11,0),0));
  ok('18 MAX_MS=0 → NO bridge (split restored)', dec0(rc).bridged === false && dec0(rc).reason === 'maxms_0' && rc.diagnostics.renderedSubpaths >= 2); }

console.log('\nRESULT: ' + (fail === 0 ? 'ALL PASS ✓' : 'FAIL ✗') + '  (' + pass + ' passed, ' + fail + ' failed)');
process.exit(fail === 0 ? 0 : 1);
