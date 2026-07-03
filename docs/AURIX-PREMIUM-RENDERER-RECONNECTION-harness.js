'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-PREMIUM-RENDERER-RECONNECTION-harness
// The visible chart must render the ALREADY-VALIDATED buildProductionPortfolioChart points through the
// ORIGINAL institutional geometry (LTTB + regime scale + monotone-CUBIC path), NOT the emergency M/L
// polyline. Data source unchanged; values not modified; return unchanged.
// Scaffolding mirrors AURIX-ADAPTIVE-DENSITY (injects the real engine chain in a vm sandbox).
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const app = src;
function fn(name) { const s = 'function ' + name + '('; const i = src.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let k = src.indexOf('{', i), d = 0; for (; k < src.length; k++) { const c = src[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return src.slice(i, k); }
function block(a, b) { const i = src.indexOf(a); if (i < 0) throw new Error('missing ' + a); const e = src.indexOf(b, i); if (e < 0) throw new Error('missing ' + b); return src.slice(i, e + b.length); }
let pass = 0, fail = 0; const ok = (n, c, g) => { if (c) { pass++; console.log('  ✓ ' + n + (g !== undefined ? '  [' + g + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (g !== undefined ? '  [' + g + ']' : '')); } };

const RC_CONSTS = block('const _AURIX_RC_QUALITY_THRESHOLD', 'const _AURIX_RC_VPAD_FRAC = 0.08;');
const VP_CONSTS = block('const _AURIX_VP_DENSITY', 'const _AURIX_VP_VALUE_EPS = 0.004;');
const IR_CONSTS = block('const _AURIX_IR_VALUE_MARGIN', '= 0.08;');
const Y_CONSTS  = block('const _AURIX_Y_JUMP_DOMINANCE', 'const _AURIX_Y_LEGIBLE_ALPHA  = 0.35;');
const X_CONSTS  = block('const _AURIX_X_FILL_BETA', '};');

const DAY = 86400e3, HOUR = 36e5, NOW = 1000 * DAY;
const sb = { console, activeRange: '30d', Math, Number, Array, JSON, isFinite, parseFloat, Infinity,
  _wscFmtAxisVal: v => { const a = Math.abs(v); if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M'; if (a >= 1e3) return (v / 1e3).toFixed(1) + 'k'; return Math.round(v).toString(); } };
sb.window = sb; sb.window.innerWidth = 1440;
vm.createContext(sb);
vm.runInContext(src.slice(src.indexOf('const _AURIX_PATH_RENDER_SPACING'), src.indexOf('function _aurixArrConfig')), sb);
vm.runInContext(RC_CONSTS, sb); vm.runInContext(VP_CONSTS, sb); vm.runInContext(IR_CONSTS, sb); vm.runInContext(Y_CONSTS, sb); vm.runInContext(X_CONSTS, sb);
vm.runInContext(block('const _AURIX_BRIDGE_SEG_ENABLED', "'all': 0.4 };"), sb);   // SPEC 24H.BRIDGE-SEGMENTATION.01 deps
[ fn('_aurixVpTargetPointCount'), fn('downsampleAurixLTTB'), fn('_aurixSignificantLocalExtrema'),
  fn('downsampleAurixAdaptive'), fn('computeAurixTimeScale'), fn('computeAurixAdaptiveXScale'), fn('computeAurixValueScale'),
  fn('_aurixMonotonePath'), fn('buildAurixAreaPath'), fn('_aurixSplitAtGaps'), fn('_aurixConfirmedBridgeGaps'),
  fn('renderValidatedPortfolioChartWithInstitutionalRenderer') ].forEach(c => vm.runInContext(c, sb));
const ADAPT = (points, opts) => vm.runInContext('renderValidatedPortfolioChartWithInstitutionalRenderer(' + JSON.stringify(points) + ',' + JSON.stringify(opts) + ')', sb);

console.log('AURIX-PREMIUM-RENDERER-RECONNECTION\n');

// validated points as buildProductionPortfolioChart emits them: { ts, value }
const N = 240;
const pts = Array.from({ length: N }, (_, i) => ({ ts: NOW - (N - 1 - i) * 2 * HOUR, value: +(9000 * (1 + 0.06 * i / (N - 1)) + Math.sin(i * 0.4) * 180).toFixed(2) }));
const box = { left: 60, right: 940, top: 34, bottom: 206 };
const rc = ADAPT(pts, { range: '30d', vw: 1000, vh: 240, box: box });

console.log('End-to-end adapter (real institutional chain):');
ok('A1 adapter succeeds (ok:true)', rc.ok === true, 'err=' + (rc.error || 'none'));
ok('3 desktop-shape path contains cubic "C" commands (NOT only M/L)', /C /.test(rc.linePath) && (rc.linePath.match(/C /g) || []).length > 0, (rc.linePath.match(/C /g) || []).length + ' curves');
ok('LTTB downsample active (drawn ≤ raw)', rc.visiblePixels.length <= N && rc.visiblePixels.length >= 2, rc.visiblePixels.length + '/' + N);
ok('6 first/last VALUE preserved (renderer does not change endpoints)',
   rc.visiblePoints[0].value === pts[0].value && rc.visiblePoints[rc.visiblePoints.length - 1].value === pts[pts.length - 1].value,
   rc.visiblePoints[0].value + '…' + rc.visiblePoints[rc.visiblePoints.length - 1].value);
{ // mobile box → same cubic geometry, same validated points → identical downsample shape
  const rcM = ADAPT(pts, { range: '30d', vw: 1000, vh: 260, box: { left: 6, right: 994, top: 16, bottom: 244 } });
  ok('4 mobile-shape path contains cubic "C" commands', rcM.ok && /C /.test(rcM.linePath));
  ok('9 desktop & mobile consume identical validated points (same count)', rcM.visiblePoints.length === rc.visiblePoints.length); }

console.log('\nStatic wiring (visible ready chart → institutional geometry, emergency = fallback only):');
ok('1 desktop ready path uses the institutional adapter, not _aurixEmergencyBuildSvg as primary',
   /const rc = renderValidatedPortfolioChartWithInstitutionalRenderer\(emg\.points, \{ range: emg\.range, vw: W, vh: H, box: _box \}\);/.test(app) &&
   /if \(rc\.ok\) \{ _lineD = rc\.linePath;/.test(app));
ok('2 mobile ready path uses the institutional adapter, not _aurixEmergencyBuildSvg as primary',
   /const _rc = renderValidatedPortfolioChartWithInstitutionalRenderer\(emg\.points, \{ range: r, vw: VBW, vh: VBH, box: _mbox \}\);/.test(app) &&
   /const built = _rc\.ok/.test(app));
ok('desktop premium markup present (glow filter + last-dot on the reconnected path)',
   /filter="url\(#wscGlow-' \+ uid \+ '\)"/.test(app) && /wsc-last-dot/.test(fn('_wscPaintEmergency')));
ok('5 renderer receives buildProductionPortfolioChart(range).points (single validated source)',
   /renderValidatedPortfolioChartWithInstitutionalRenderer\(emg\.points/.test(app));
ok('7 adapter is a PURE renderer — never writes returnPct/returnValue/state',
   !/returnPct|returnValue|out\.state/.test(fn('renderValidatedPortfolioChartWithInstitutionalRenderer')));
ok('adapter maps ts→time ONLY (no value math)',
   /map\(p => \(\{ time: p\.ts, value: p\.value \}\)\)/.test(fn('renderValidatedPortfolioChartWithInstitutionalRenderer')));
ok('8 pending still renders the clean pending state (unchanged)',
   /if \(emg\.state !== 'ready'\) \{\s*try \{ if \(typeof _aurixSetChartSkin/.test(app) && /_aurixMobileLiteFallback\('pending'\)/.test(app));
ok('_aurixEmergencyBuildSvg retained for rollback/fallback (still defined)',
   /function _aurixEmergencyBuildSvg\(/.test(app));

console.log('\n' + (fail === 0 ? '✅ ALL PASS' : '❌ ' + fail + ' FAILED') + '  (' + pass + '/' + (pass + fail) + ')');
process.exit(fail === 0 ? 0 : 1);
