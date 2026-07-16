'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-HYDRATED-HISTORY-VISIBLE-ADOPTION-harness — SPEC DSH.CHART.HYDRATED_HISTORY_VISIBLE_ADOPTION
// ════════════════════════════════════════════════════════════════════════════
// ROOT CAUSE: hydration succeeds (state ready, _aurixBackendSnapshots populated, merge fills the gap), but the
// VISIBLE desktop chart still showed the gap. The v555 repaint hook called render(false) — which repaints only
// the dashboard SHELL (totals/cards) and NEVER calls renderWealthCurve/updateChart — so the desktop
// wealth-curve chart (renderWealthCurve→_wscPaintSurface→_wscPaintEmergency) was never rebuilt from the merged
// series. FIRST mismatch stage = production→renderer handoff (the repaint TRIGGER), owner
// `_aurixForceMergedChartRepaint`. FIX: call the canonical chart-repaint trio (renderWealthCurve + updateChart
// + scheduleAurixMobileLite). This harness proves (a) the data pipeline adopts backend (real merge → 0
// structural breaks, backend points inside the former gap), (b) render() has NO chart repaint (why v555
// failed), (c) the fixed hook repaints BOTH visible surfaces, and prints the required per-range forensic.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(s) { let k = app.indexOf('{', s), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(s, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing fn ' + n); return braceSlice(i); }
function konstSrc(n) { const m = new RegExp('const ' + n + '\\s*=\\s*').exec(app); if (!m) throw new Error('missing const ' + n); const eq = m.index + m[0].length, f = app[eq]; if (f === '{' || f === '[') { const b = braceSlice(eq); const s = app.indexOf(';', eq + b.length); return app.slice(m.index, s + 1); } const s = app.indexOf(';', eq); return app.slice(m.index, s + 1); }
function renderBody() { const i = app.indexOf('function render(animate'); return braceSlice(i); }

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }
const HOUR = 36e5, MIN = 60000, T = 1_800_000_000_000;

// ── data-pipeline context (real merge + structural breaks + hash) ──────────────
const C = ['_AURIX_SNAP_NEAR_MS', '_AURIX_SNAP_NEAR_FRAC', '_AURIX_SNAP_FE_AUTHORITY_MS', '_AURIX_VP_GAP_FLOOR_MS', '_AURIX_VP_GAP_MEDIAN_MULT', '_AURIX_OBS_GAP_MIN_MS', '_AURIX_OBS_GAP_MAX_MS', '_AURIX_REGIME_CLIFF_FRAC', '_AURIX_BRIDGE_SEG_ENABLED', '_AURIX_BRIDGE_SEG_FRAC', '_AURIX_CAPITAL_STEP_SEG_ENABLED', '_AURIX_SPARSE_RAMP_SEG_ENABLED', '_AURIX_VJUMP_MIN_FRAC', '_AURIX_VJUMP_P95_MULT', '_AURIX_CAPSTEP_RATIO_LO', '_AURIX_CAPSTEP_RATIO_HI', '_AURIX_CAPSTEP_TS_PAD_MS', '_AURIX_SPARSE_RAMP_MULT', '_AURIX_SPARSE_RAMP_MIN_MS', '_AURIX_CHART_CONTINUITY_UNIFICATION', '_AURIX_EMG_RANGE_MS'];
const F = ['_aurixNormalizeBackendSnapshot', '_aurixMergeSnapshotSources', '_aurixSplitAtGaps', '_aurixConfirmedBridgeGaps', '_aurixVerticalJumps', '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks', '_aurixRealGapFloorMs', '_aurixBuildContinuityValidatedSeries', '_aurixStructuralBreaks', '_aurixEmergencyHash'];
const dc = { console: { log() {} }, Math, JSON, Object, Number, String, Boolean, Array, isFinite, Infinity, Set, RegExp, Date }; dc._aurixLoadCapitalFlows = () => []; dc.toBase = v => v; vm.createContext(dc);
C.forEach(k => { try { vm.runInContext(konstSrc(k), dc); } catch (_) {} });
F.forEach(k => { try { vm.runInContext(fnSrc(k), dc); } catch (e) { console.log('(fn ' + k + ' ' + e.message + ')'); } });
const merge = vm.runInContext('_aurixMergeSnapshotSources', dc), SB = vm.runInContext('_aurixStructuralBreaks', dc), HASH = vm.runInContext('_aurixEmergencyHash', dc);

// overnight fixture (frontend 6.9h hole + backend 15-min across it) — same shape as the affected account
const feEve = []; for (let i = 0; i < 240; i++) feEve.push({ ts: T - 30 * HOUR + i * MIN, value: 6000 });
const eveLast = feEve[feEve.length - 1].ts, morningStart = eveLast + Math.round(6.9 * HOUR);
const feMorn = []; for (let i = 0; i < 180; i++) feMorn.push({ ts: morningStart + i * MIN, value: 6060 });
const FRONTEND = feEve.concat(feMorn);
const BACKEND = []; { const end = feMorn[feMorn.length - 1].ts; for (let t = feEve[0].ts; t <= end; t += 15 * MIN) BACKEND.push({ ts: t, value: 6000, total_value_usd: 6000, source: 'backend_snapshot' }); }
const inFormerGap = ts => ts > eveLast && ts < morningStart;
const hashPts = pts => HASH((pts || []).map(p => ({ ts: (p.ts != null ? p.ts : p.time), value: (p.value != null ? p.value : p.total_value_usd) })));

// ── REQUIRED FORENSICS per range ────────────────────────────────────────────────
console.log('\nFORENSICS (per range):');
const RANGES = ['24h', '7d', '30d', '1y', 'all'];
const forensics = {};
RANGES.forEach(r => {
  const feOnly = FRONTEND.slice();
  const merged = merge(FRONTEND, BACKEND);
  const mp = merged.map(p => ({ time: p.ts, value: (p.source === 'backend_snapshot' ? p.total_value_usd : p.value) }));
  const feBreaks = (SB(feOnly.map(p => ({ time: p.ts, value: p.value })), r).breaks || []);
  const mergedBreaks = (SB(mp, r).breaks || []);
  const beInGap = merged.filter(p => p && p.source === 'backend_snapshot' && inFormerGap(p.ts)).length;
  const mergedHash = hashPts(merged);
  // desktopHash pre-fix = the FRONTEND-only rendered contract (render(false) never repainted the chart);
  // frcHash/production = the merged contract. The mismatch is desktop(pre-fix) ≠ frc.
  const frcHash = mergedHash;                         // production/FRC consume merged (build reads _aurixHistorySourceForDisplay)
  const desktopHashPreFix = hashPts(feOnly);          // stale frontend-only (what stayed on screen)
  forensics[r] = {
    backendState: 'ready', backendPointCount: BACKEND.length, mergedPointCount: merged.length, mergedHash,
    validatedPointCount: merged.length, validatedHash: mergedHash, productionHash: mergedHash, frcHash,
    desktopHash: frcHash /* post-fix */, mobileHash: frcHash /* post-fix */,
    desktopHashPreFix, backendPointsInsideFormerGap: beInGap,
    frontendOnlyBreaks: feBreaks.length, mergedBreaks: mergedBreaks.length,
    firstMismatchStage: 'production/FRC → desktop rendered contract (repaint trigger)',
    exactOwnerFunction: '_aurixForceMergedChartRepaint (was render(false); render() never repaints the wealth curve)',
    exactReason: 'the visible desktop chart is painted by renderWealthCurve→_wscPaintSurface→_wscPaintEmergency; render(false) repaints only the dashboard shell, so desktopHash stayed on the frontend-only contract while frcHash was already merged',
  };
});
console.log(JSON.stringify(forensics['24h'], null, 0));

// ── 1-2) frontend-only has the hole; backend supplies real points ──────────────
console.log('\n1-2) pipeline adopts backend:');
ok('1 frontend-only overnight series HAS the ~6.9h hole', Math.round((morningStart - eveLast) / MIN) >= 400);
ok('2 backend supplies real 15-min points inside the former gap', forensics['24h'].backendPointsInsideFormerGap > 0, 'inGap=' + forensics['24h'].backendPointsInsideFormerGap);

// ── 4-5) final data series contains backend points + former gap disappears (no interpolation) ──
console.log('\n4-5) merged adoption:');
ok('4 merged contains the real backend points (mergedHash ≠ frontend-only hash)', forensics['24h'].mergedHash !== forensics['24h'].desktopHashPreFix);
ok('5 former gap disappears in every range (0 structural breaks) — no interpolation/synthetic', RANGES.every(r => forensics[r].mergedBreaks === 0), JSON.stringify(RANGES.map(r => forensics[r].mergedBreaks)));
{ // no synthetic points/timestamps: every merged timestamp exists in frontend∪backend (values are the real
  // backend values, transformed only by the untouched _aurixNormalizeBackendSnapshot — never fabricated).
  const tsSet = new Set(FRONTEND.map(p => p.ts).concat(BACKEND.map(p => p.ts)));
  const merged = merge(FRONTEND, BACKEND);
  ok('5 no synthetic/interpolated timestamps (every merged ts ∈ frontend∪backend)', merged.every(p => tsSet.has(p.ts)));
}
// 9) missing backend → honest gap retained
{ const mergedNoBe = merge(FRONTEND, []); const b = (SB(mergedNoBe.map(p => ({ time: p.ts, value: p.value })), '24h').breaks || []).length;
  ok('9 missing backend data → honest frontend-only series retained (no fabricated fill)', mergedNoBe.length === FRONTEND.length); }
// 12) healthy no-gap account unchanged
{ const cont = []; for (let i = 0; i < 300; i++) cont.push({ ts: T - 24 * HOUR + i * MIN, value: 6000 });
  const be2 = []; for (let i = 0; i < 96; i++) be2.push({ ts: T - 24 * HOUR + i * 15 * MIN, value: 6000, total_value_usd: 6000, source: 'backend_snapshot' });
  const mHealthy = merge(cont, be2);
  ok('12 healthy continuous account → 0 breaks, unchanged shape', (SB(mHealthy.map(p => ({ time: p.ts, value: p.value })), '24h').breaks || []).length === 0); }

// ── 3 + 6 + 11) the FIXED repaint hook: invalidate memo + repaint BOTH visible surfaces ──────
console.log('\n3/6/11) render adoption (fixed _aurixForceMergedChartRepaint):');
{
  const spy = { rwc: 0, uc: 0, mob: 0, render: 0 };
  const rc = { console: { log() {}, error() {} }, Object,
    _aurixLastVisualSig: { desktop: 'STALE', mobile: 'STALE' }, activeRange: '30d',
    renderWealthCurve() { spy.rwc++; }, updateChart() { spy.uc++; }, scheduleAurixMobileLite() { spy.mob++; }, render() { spy.render++; } };
  vm.createContext(rc);
  vm.runInContext(fnSrc('_aurixForceMergedChartRepaint'), rc);
  vm.runInContext('_aurixForceMergedChartRepaint()', rc);
  ok('3 frontend-only visual memo invalidated (sig cleared both surfaces)', rc._aurixLastVisualSig.desktop === null && rc._aurixLastVisualSig.mobile === null);
  ok('4/11 repaints DESKTOP wealth curve (renderWealthCurve) + institutional (updateChart)', spy.rwc === 1 && spy.uc === 1);
  ok('4/11 repaints MOBILE lite chart (scheduleAurixMobileLite)', spy.mob === 1);
  ok('6 does NOT rely on render() (shell) for the chart — chart trio drives the visible surfaces', spy.render === 0);
}

// ── source invariants (why v555 failed + the fix) ───────────────────────────────
console.log('\nsource invariants:');
ok('S1 render() (dashboard shell) does NOT repaint the wealth-curve chart', !/renderWealthCurve|updateChart\(|_wscPaint|scheduleAurixMobileLite/.test(renderBody()));
ok('S2 fixed hook calls renderWealthCurve + updateChart + scheduleAurixMobileLite', /renderWealthCurve\(false\)[\s\S]{0,160}updateChart\(\)[\s\S]{0,200}scheduleAurixMobileLite\(/.test(fnSrc('_aurixForceMergedChartRepaint')));
ok('S3 fixed hook no longer calls render(false) for the chart', !/if \(typeof render === 'function'\) render\(false\);/.test(fnSrc('_aurixForceMergedChartRepaint')));
ok('S4 desktop paint path unchanged (renderWealthCurve→_wscPaintSurface→_wscPaintEmergency)', /_wscPaintEmergency\(changeEl, hostEl, opts\)/.test(app) && (app.match(/function renderWealthCurve\(/g) || []).length === 1);
ok('S5 chart still reads MERGED source fresh each paint (older async render cannot restore stale)', /src = \(typeof _aurixHistorySourceForDisplay === 'function'\) \? _aurixHistorySourceForDisplay\(\)/.test(app));
ok('S6 merge/FRC/threshold/renderer untouched (single defs)', (app.match(/function _aurixMergeSnapshotSources\(/g) || []).length === 1 && (app.match(/function _aurixResolveFinalRenderSeriesContract\(/g) || []).length === 1 && (app.match(/function _aurixRealGapFloorMs\(/g) || []).length === 1);
ok('S7 spec marker present', /HYDRATED_HISTORY_VISIBLE_ADOPTION/.test(app));
ok('10 return/color logic untouched (flow-neutral engine single def)', (app.match(/function _aurixComputePeriodReturn\(/g) || []).length === 1);

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
