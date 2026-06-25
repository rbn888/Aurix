/* AURIX — SPEC 4: VISIBLE INTEGRATION — validation harness.
   Extracts the REAL feature flag + pure WSC selector (_aurixWscInstitutionalSelect)
   + the whole render-engine chain from app.js, stubs only the data accessors, and
   asserts the 10 mandated cases. The selector is what _wscPaintSurface calls to
   decide engine-vs-legacy, so testing it validates the visible integration logic
   without a DOM.

     1. flag on            → WSC uses engine pathData
     2. flag off           → WSC uses the legacy render
     3. fallback           → invalid path → legacy, no throw, reason logged
     4. 24H                → path applied, last point == dashboard, no overshoot
     5. 7D                 → path applied, downsampled (clusters reduced), not "building"
     6. 30D                → no regression (engine path valid)
     7. 1A                 → no regression
     8. TOTAL              → no regression
     9. desktop/mobile     → both use the engine when flag on
    10. debug              → flags + fallback reported

   Run: node docs/AURIX-INSTITUTIONAL-RENDER-VISIBLE-harness.js */
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
const FLAG_CONST = (src.match(/const AURIX_INSTITUTIONAL_RENDER_VISIBLE = (?:true|false);/) || [])[0];
if (!FLAG_CONST) throw new Error('missing AURIX_INSTITUTIONAL_RENDER_VISIBLE flag');
const FLAG_DEFAULT = /= true;/.test(FLAG_CONST);   // shipped default of the const

const DAY = 86400e3, HOUR = 36e5, NOW = 1000 * DAY;

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
vm.runInContext(IR_CONSTS, sb); vm.runInContext(Y_CONSTS, sb);
vm.runInContext(FLAG_CONST, sb);
[ fn('_aurixRenderContractGeometry'), fn('_aurixVpTargetPointCount'), fn('_aurixComputeVisualPreparation'),
  fn('prepareAurixVisualSeries'), fn('downsampleAurixLTTB'), fn('_aurixSignificantLocalExtrema'), fn('downsampleAurixAdaptive'), fn('computeAurixTimeScale'),
  fn('computeAurixValueScale'), fn('_aurixMonotonePath'), fn('buildAurixMonotonicPath'),
  fn('buildAurixAreaPath'), fn('_aurixSplitAtGaps'), fn('renderAurixInstitutionalChart'),
  fn('_aurixInstitutionalRenderVisible'), fn('_aurixWscInstitutionalSelect') ].forEach(c => vm.runInContext(c, sb));

const { _aurixWscInstitutionalSelect } = sb;
const W = 1000, H = 240;
const BOX_DESK = { left: 60, right: 940, top: 24, bottom: 211.2 };
const BOX_MOB  = { left: 60, right: 850, top: 24, bottom: 211.2 };  // mobile reserves a right label lane
const FALLBACK = { linePath: 'LEGACY_LINE_PATH', areaPath: 'LEGACY_AREA_PATH Z' };

function healthy(n, spanMs, base, drift, amp) {
  const t0 = NOW - spanMs;
  return Array.from({ length: n }, (_, i) => ({ time: t0 + Math.round(i * spanMs / (n - 1)), value: base + i * drift + amp * Math.sin(i * 0.7) }));
}
const lastV = s => s[s.length - 1].value;
const setFlag = v => { if (v === undefined) delete sb.AURIX_INSTITUTIONAL_RENDER_VISIBLE; else sb.AURIX_INSTITUTIONAL_RENDER_VISIBLE = v; };
const sel = (range, box) => _aurixWscInstitutionalSelect(range, W, H, box || BOX_DESK, FALLBACK);

let ok = true;
const ck = (n, c, g) => { console.log((c ? '  ✓' : '  ✗') + ' ' + n + (g !== undefined ? '  [' + g + ']' : '')); if (!c) ok = false; };

console.log('AURIX SPEC 4 — Institutional Render Engine: visible integration\n');

console.log('CASE 0 — shipped default flag (' + (FLAG_DEFAULT ? 'ON' : 'OFF') + '):');
{ setFlag(undefined);   // no runtime override → reads the shipped const
  ck('default flag resolves to the shipped const', sb._aurixInstitutionalRenderVisible() === FLAG_DEFAULT, FLAG_CONST);
  const s = healthy(40, DAY, 70000, 18, 120); SERIES = s; DASH = lastV(s);
  const r = sel('24h');
  if (FLAG_DEFAULT) ck('default ON → engine path applied', r.pathAppliedToWSC === true && r.linePath !== FALLBACK.linePath);
  else ck('default OFF → legacy geometry', r.pathAppliedToWSC === false && r.linePath === FALLBACK.linePath); }

console.log('\nCASE 1 — feature flag ON → WSC uses engine pathData:');
{ setFlag(true); const s = healthy(40, DAY, 70000, 18, 120); SERIES = s; DASH = lastV(s); FLOWS = [];
  const r = sel('24h');
  ck('visibleEnabled', r.visibleEnabled === true);
  ck('pathAppliedToWSC', r.pathAppliedToWSC === true);
  ck('no fallback', r.usedFallback === false, r.fallbackReason);
  ck('engine line replaces legacy', r.linePath !== FALLBACK.linePath && /^M /.test(r.linePath), r.linePath.slice(0, 10));
  ck('engine area replaces legacy + closes (Z)', r.areaPath !== FALLBACK.areaPath && /Z\s*$/.test(r.areaPath)); }

console.log('\nCASE 2 — feature flag OFF → WSC uses legacy render:');
{ setFlag(false); const s = healthy(40, DAY, 70000, 18, 120); SERIES = s; DASH = lastV(s);
  const r = sel('24h');
  ck('visibleEnabled = false', r.visibleEnabled === false);
  ck('legacy line kept', r.linePath === FALLBACK.linePath);
  ck('legacy area kept', r.areaPath === FALLBACK.areaPath);
  ck('pathAppliedToWSC = false', r.pathAppliedToWSC === false);
  setFlag(true); }

console.log('\nCASE 3 — fallback (invalid path → legacy, no throw):');
{ setFlag(true); SERIES = [{ time: NOW, value: 70000 }]; DASH = 70000;  // 1 point → engine can't draw
  let threw = false, r; try { r = sel('24h'); } catch (_) { threw = true; }
  ck('did not throw', !threw);
  ck('usedFallback', r && r.usedFallback === true, r && r.fallbackReason);
  ck('fallback reason set', r && /invalid_path|no_result|low_points/.test(r.fallbackReason), r && r.fallbackReason);
  ck('legacy geometry kept', r && r.linePath === FALLBACK.linePath); }

console.log('\nCASE 4 — 24H (path applied, last == dashboard, no overshoot):');
{ setFlag(true); const s = healthy(60, DAY, 70000, 15, 140); SERIES = s; DASH = lastV(s);
  const r = sel('24h');
  ck('pathAppliedToWSC', r.pathAppliedToWSC === true);
  ck('last point == dashboard (±0.5%)', Math.abs(r.rendered.renderMeta.lastDeltaPct) <= 0.5, r.rendered.renderMeta.lastDeltaPct);
  ck('no overshoot', r.rendered.renderMeta.overshootDetected === false); }

console.log('\nCASE 5 — 7D (path applied, downsampled, not "building"):');
{ setFlag(true); const s = healthy(220, 7 * DAY, 60000, 4, 300); SERIES = s; DASH = lastV(s);
  const r = sel('7d');
  ck('pathAppliedToWSC', r.pathAppliedToWSC === true);
  ck('downsampled toward target (clusters reduced)', r.rendered.renderMeta.pointCountAfter <= r.rendered.renderMeta.targetPointCount + 2 && r.rendered.renderMeta.pointCountAfter < 220, r.rendered.renderMeta.pointCountAfter + '/' + r.rendered.renderMeta.targetPointCount);
  ck('not building (>=2 visible points)', r.rendered.visiblePoints.length >= 2, r.rendered.visiblePoints.length); }

console.log('\nCASE 6/7/8 — 30D / 1A / TOTAL (no regression):');
{ setFlag(true);
  for (const [r, days] of [['30d', 30], ['1y', 360], ['all', 380]]) {
    const s = healthy(180, days * DAY, 50000, 6, 250); SERIES = s; DASH = lastV(s);
    const out = sel(r);
    ck(r + ' path applied, no fallback', out.pathAppliedToWSC === true && out.usedFallback === false, out.fallbackReason);
    ck(r + ' last == dashboard', Math.abs(out.rendered.renderMeta.lastDeltaPct) <= 0.5, out.rendered.renderMeta.lastDeltaPct);
  } }

console.log('\nCASE 9 — desktop/mobile (both use the engine when flag on):');
{ setFlag(true); const s = healthy(150, 30 * DAY, 50000, 6, 250); SERIES = s; DASH = lastV(s);
  const d = sel('30d', BOX_DESK), m = sel('30d', BOX_MOB);
  ck('desktop path applied', d.pathAppliedToWSC === true);
  ck('mobile path applied', m.pathAppliedToWSC === true);
  ck('both engine paths (start M), differ from legacy', /^M /.test(d.linePath) && /^M /.test(m.linePath) && d.linePath !== FALLBACK.linePath && m.linePath !== FALLBACK.linePath);
  ck('paths differ by box (different right edge)', d.linePath !== m.linePath); }

console.log('\nCASE 10 — debug (flags + fallback reported):');
{ setFlag(true); const s = healthy(40, DAY, 70000, 18, 120); SERIES = s; DASH = lastV(s);
  const r = sel('24h');
  const fields = ['visibleEnabled','usedFallback','fallbackReason','pathAppliedToWSC','areaAppliedToWSC','gapSegmentsRendered','eventMarkersRendered'];
  ck('all reporting fields present', fields.every(f => f in r), fields.filter(f => !(f in r)).join(',') || 'all');
  ck('eventMarkers prepared-not-drawn (0 this phase)', r.eventMarkersRendered === 0); }

console.log('\nPURITY — selector never mutates the canonical series:');
{ setFlag(true); const s = healthy(40, DAY, 70000, 18, 120); const before = JSON.stringify(s);
  SERIES = s; DASH = lastV(s); sel('24h'); sel('24h', BOX_MOB);
  ck('canonical series unchanged', JSON.stringify(s) === before); }

console.log('\nRESULT:', ok ? 'ALL PASS ✓ — visible WSC integration: flagged, reversible, fallback-safe, dashboard-locked' : 'FAIL ✗');
process.exit(ok ? 0 : 1);
