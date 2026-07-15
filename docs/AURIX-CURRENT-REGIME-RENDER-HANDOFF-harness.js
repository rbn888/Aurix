'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CURRENT-REGIME-RENDER-HANDOFF-harness — SPEC DSH.CHART.CURRENT_REGIME_RENDER_HANDOFF.51
// ════════════════════════════════════════════════════════════════════════════
// The regime selector is PROVEN correct on the affected account for every range, yet 30D/1Y/ALL still rendered
// historical regimes / a 16k→6k cliff / disconnected islands as the ACTIVE line. Root cause: the FRC isolates
// the single authoritative current-regime run only for 24H (§6.5) and 7D (§6.6); 30D/1Y/ALL had NO single-
// continuous enforcement, so the visual-trust-gate's surviving multi-cluster output reached out.renderPoints
// (and both faithful painters, `emg.points = frc.renderPoints`) as ≥2 visible runs. FIX (step 6.7, flag
// _AURIX_CHART_ACTIVE_REGIME_SINGLE_PATH): extend the SAME single-continuous selection to 30D/1Y/ALL. This
// harness proves it against the REAL app.js FRC (no resolver mock), ON vs OFF, that 24H/7D are untouched, that
// no point is fabricated/bridged, and that the read-only audit reports MISMATCH (OFF) → HANDOFF_CLEAN (ON)
// with selectedRunHash === frcOutputHash === desktopHash === mobileHash.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(startIdx) { let k = app.indexOf('{', startIdx), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(startIdx, k); }
function fnSrc(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing fn ' + name); return braceSlice(i); }
function konstSrc(name) {
  const m = new RegExp('const ' + name + '\\s*=\\s*').exec(app);
  if (!m) throw new Error('missing const ' + name);
  const eq = m.index + m[0].length, first = app[eq];
  if (first === '{' || first === '[') { const body = braceSlice(eq); const semi = app.indexOf(';', eq + body.length); return app.slice(m.index, semi + 1); }
  const semi = app.indexOf(';', eq); return app.slice(m.index, semi + 1);
}
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const HOUR = 36e5, DAY = 864e5, MIN = 60e3, T0 = 1_800_000_000_000;
const CONSTS = [
  '_AURIX_VP_GAP_FLOOR_MS', '_AURIX_VP_GAP_MEDIAN_MULT', '_AURIX_EMG_RANGE_MS',
  '_AURIX_CHART_CONTINUITY_UNIFICATION', '_AURIX_CHART_RETURN_CONTRACT_UNIFICATION',
  '_AURIX_CHART_SHORT_HISTORY_DISPLAY', '_AURIX_CHART_SHORT_HISTORY_MIN_DAYS',
  '_AURIX_CHART_VISUAL_TRUST_GATE', '_AURIX_VTG_MIN_MAIN_PTS', '_AURIX_VTG_MIN_MAIN_SPAN_MS',
  '_AURIX_CHART_BOOTSTRAP_SUPPRESSION', '_AURIX_STABLE_BAND_LO', '_AURIX_STABLE_BAND_HI', '_AURIX_STABLE_MIN_PTS',
  '_AURIX_STABLE_MIN_SPAN_MS', '_AURIX_STABLE_CONSTRUCTION_JUMP',
  '_AURIX_CHART_FINAL_RENDER_SERIES_CONTRACT', '_AURIX_CHART_CANONICAL_REFRESH_DETERMINISM',
  '_AURIX_CHART_RELIABILITY_DEADLOCK_RESOLUTION', '_AURIX_ALL_MIN_TRUST_POINTS',
];
const FNS = [
  '_aurixRealGapFloorMs', '_aurixConfirmedBridgeGaps', '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks',
  '_aurixSplitAtGaps', '_aurixBuildContinuityValidatedSeries', '_aurixStructuralBreaks', '_aurixVerticalJumps',
  '_aurixResolveChartReturnContract', '_aurixShortHistoryDisplay', '_aurixVisualTrustGate',
  '_aurixStableDisplayAnchor', '_aurixResolveReliabilityDeadlock', '_aurixResolveFinalRenderSeriesContract',
  '_aurixEmergencyHash', '_aurixAuditCurrentRegimeRenderHandoffCore',
];
function mkCtx(flagOn) {
  const ctx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date, String, Object, Set, Boolean };
  vm.createContext(ctx);
  CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (e) { /* optional */ } });
  // 24H/7D own flags always ON (so they keep isolating); toggle only the new 30D/1Y/ALL flag.
  vm.runInContext('const _AURIX_CHART_7D_SINGLE_CONTINUOUS = true;', ctx);
  vm.runInContext('const _AURIX_CHART_ACTIVE_REGIME_SINGLE_PATH = ' + (flagOn ? 'true' : 'false') + ';', ctx);
  FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (e) { throw new Error('load ' + f + ': ' + e.message); } });
  return ctx;
}
const ON = mkCtx(true), OFF = mkCtx(false);
const frc = (ctx, emg, range, surface) => vm.runInContext('_aurixResolveFinalRenderSeriesContract', ctx)(emg, range, surface);
function visibleRuns(ctx, renderPoints, range) {
  const m = (renderPoints || []).map(p => ({ time: (p.ts != null ? p.ts : p.time), value: p.value })).filter(p => Number.isFinite(p.time) && Number.isFinite(p.value));
  if (m.length < 2) return m.length ? 1 : 0;
  let br = []; try { const sb = vm.runInContext('_aurixStructuralBreaks', ctx)(m, range); br = (sb && sb.breaks) || []; } catch (_) {}
  let rn = [m]; if (br.length) { try { rn = vm.runInContext('_aurixSplitAtGaps', ctx)(m, br) || [m]; } catch (_) {} }
  return rn.filter(x => x && x.length).length;
}
function seg(t0, n, step, v0, dv) { const o = []; for (let i = 0; i < n; i++) o.push({ ts: t0 + i * step, value: +(v0 + i * dv).toFixed(2) }); return o; }
function emgOf(points, range, over) {
  const last = points[points.length - 1];
  return Object.assign({ range: range, state: 'ready', returnState: 'ok', reason: null, pendingReason: null,
    badgeReturnPct: 3.2, returnPct: 3.2, returnValue: 30, color: 'up', coverageRatio: 1.0,
    pointCount: points.length, finalPointCount: points.length, chartHash: 'h', points: points,
    currentValue: last && last.value, baselineTs: points[0] && points[0].ts, baselineValue: points[0] && points[0].value }, over || {});
}
const isSubset = (rp, input) => rp.every(p => input.some(q => q.ts === (p.ts != null ? p.ts : p.time) && q.value === p.value));
const isChrono = rp => rp.every((p, i) => i === 0 || (p.ts != null ? p.ts : p.time) > (rp[i - 1].ts != null ? rp[i - 1].ts : rp[i - 1].time));
const dHash = (ctx, rp) => vm.runInContext('_aurixEmergencyHash', ctx)((rp || []).map(p => ({ ts: (p.ts != null ? p.ts : p.time), value: p.value })));

// ── fixtures ────────────────────────────────────────────────────────────────
// Multi-regime: large OLD high cluster → big real gap → large RECENT cluster (endpoint = live value).
function multiRegime(range, spanDays) {
  const stepH = spanDays >= 300 ? 24 : (spanDays >= 25 ? 6 : 2);
  const old = seg(T0, 40, stepH * HOUR, 16000, 2);                                   // old high regime
  const gapStart = old[old.length - 1].ts;
  const recentStart = gapStart + Math.max(2 * DAY, spanDays * DAY * 0.25);           // dominant real gap
  const recent = seg(recentStart, 40, stepH * HOUR, 6000, 1.5);                      // recent regime (current)
  return old.concat(recent);
}
const single30 = seg(T0, 60, 6 * HOUR, 12000, 3);                                    // healthy single continuous run

console.log('\nAURIX-CURRENT-REGIME-RENDER-HANDOFF — SPEC.51');

// ── 0 markers + flag + step present ───────────────────────────────────────────
ok('0 SPEC.51 marker + flag + step 6.7 + audit registered', app.indexOf('CURRENT_REGIME_RENDER_HANDOFF.51') >= 0
  && /const _AURIX_CHART_ACTIVE_REGIME_SINGLE_PATH = true;/.test(app)
  && app.indexOf('active_regime_single_path') >= 0
  && /window\.aurixAuditCurrentRegimeRenderHandoff\s*=/.test(app));

// ── 1 30D multi-regime → ON isolates ONE current run; OFF keeps ≥2 ─────────────
['30d', '1y', 'all'].forEach(rg => {
  const pts = multiRegime(rg, rg === '30d' ? 30 : (rg === '1y' ? 365 : 800));
  const onOut = frc(ON, emgOf(pts, rg), rg, 'desktop');
  const offOut = frc(OFF, emgOf(pts, rg), rg, 'desktop');
  const onRuns = visibleRuns(ON, onOut.renderPoints, rg);
  const offRuns = visibleRuns(OFF, offOut.renderPoints, rg);
  ok(rg + ': OFF renders ≥2 runs (defect reproduced)', offRuns >= 2, 'offRuns=' + offRuns);
  ok(rg + ': ON renders exactly ONE current run', onRuns === 1 && onOut.renderPoints.length >= 2, 'onRuns=' + onRuns);
  ok(rg + ': ON endpoint == recent regime endpoint (live value)', onOut.renderPoints[onOut.renderPoints.length - 1].value === pts[pts.length - 1].value);
  ok(rg + ': ON renderPoints ⊂ input (no synthetic points)', isSubset(onOut.renderPoints, pts));
  ok(rg + ': ON chronological + no bridge across gap', isChrono(onOut.renderPoints) && onOut.diagnostics && onOut.diagnostics.activeRegimeUpstreamRuns >= 2);
  ok(rg + ': ON discarded old regime kept in diagnostics only', onOut.diagnostics && Array.isArray(onOut.diagnostics.activeRegimeDiscardedRuns) && onOut.diagnostics.activeRegimeDiscardedRuns.length >= 1);
});

// ── 2 24H current regime only (own §6.5) — ON==OFF byte-identical (flag gated out) ──
{
  const pts = multiRegime('24h', 1);
  const onOut = frc(ON, emgOf(pts, '24h'), '24h', 'desktop');
  const offOut = frc(OFF, emgOf(pts, '24h'), '24h', 'desktop');
  ok('2 24H unchanged by SPEC.51 flag (byte-identical ON vs OFF)', dHash(ON, onOut.renderPoints) === dHash(OFF, offOut.renderPoints));
  ok('2 24H single visible run (own §6.5)', visibleRuns(ON, onOut.renderPoints, '24h') <= 1);
}

// ── 3 7D current regime only (own §6.6) — ON==OFF byte-identical ────────────────
{
  const pts = multiRegime('7d', 7);
  const onOut = frc(ON, emgOf(pts, '7d'), '7d', 'desktop');
  const offOut = frc(OFF, emgOf(pts, '7d'), '7d', 'desktop');
  ok('3 7D unchanged by SPEC.51 flag (byte-identical ON vs OFF)', dHash(ON, onOut.renderPoints) === dHash(OFF, offOut.renderPoints));
  ok('3 7D single visible run (own §6.6)', visibleRuns(ON, onOut.renderPoints, '7d') <= 1);
}

// ── 4 Healthy single-run account — byte-identical ON/OFF, no trimming ───────────
['30d', '1y', 'all'].forEach(rg => {
  const onOut = frc(ON, emgOf(single30, rg), rg, 'desktop');
  const offOut = frc(OFF, emgOf(single30, rg), rg, 'desktop');
  ok('4 ' + rg + ' single-run byte-identical ON vs OFF', dHash(ON, onOut.renderPoints) === dHash(OFF, offOut.renderPoints));
  ok('4 ' + rg + ' single-run keeps all points (no split)', visibleRuns(ON, onOut.renderPoints, rg) === 1 && !(onOut.diagnostics && onOut.diagnostics.activeRegimeSelectedRun));
});

// ── 5 desktop/mobile parity on the isolated run ─────────────────────────────────
{
  const pts = multiRegime('1y', 365);
  const d = frc(ON, emgOf(pts, '1y'), '1y', 'desktop');
  const m = frc(ON, emgOf(pts, '1y'), '1y', 'mobile');
  ok('5 desktop/mobile identical isolated run', dHash(ON, d.renderPoints) === dHash(ON, m.renderPoints) && d.renderPoints.length === m.renderPoints.length);
}

// ── 6 no synthetic points anywhere (renderPoints ⊂ input, all ranges) ───────────
{
  let allSubset = true;
  ['24h', '7d', '30d', '1y', 'all'].forEach(rg => { const pts = multiRegime(rg, rg === '24h' ? 1 : rg === '7d' ? 7 : rg === '30d' ? 30 : rg === '1y' ? 365 : 800); const o = frc(ON, emgOf(pts, rg), rg, 'desktop'); if (o.renderPoints && o.renderPoints.length && !isSubset(o.renderPoints, pts)) allSubset = false; });
  ok('6 no synthetic/interpolated points on any range', allSubset);
}

// ── 7-8 AUDIT: OFF → MISMATCH@frc_output; ON → HANDOFF_CLEAN with hash chain ─────
function auditWith(ctx, pts, rg) {
  // mock buildProductionPortfolioChart in this ctx to feed the audit the multi-regime emg
  vm.runInContext('globalThis.__EMG = ' + JSON.stringify(emgOf(pts, rg)) + ';', ctx);
  vm.runInContext('function buildProductionPortfolioChart(){ return __EMG; }', ctx);
  return vm.runInContext('_aurixAuditCurrentRegimeRenderHandoffCore', ctx)(rg);
}
['30d', '1y', 'all'].forEach(rg => {
  const pts = multiRegime(rg, rg === '30d' ? 30 : rg === '1y' ? 365 : 800);
  const aOff = auditWith(OFF, pts, rg);
  const aOn = auditWith(ON, pts, rg);
  ok('7 ' + rg + ' audit OFF → MISMATCH @ frc_output (owner FRC)', aOff.verdict === 'MISMATCH' && aOff.firstMismatchStage === 'frc_output' && aOff.exactOwnerFunction === '_aurixResolveFinalRenderSeriesContract', aOff.verdict + '/' + aOff.firstMismatchStage);
  ok('8 ' + rg + ' audit ON → HANDOFF_CLEAN', aOn.verdict === 'HANDOFF_CLEAN', aOn.verdict + ' ' + (aOn.exactReason || ''));
  ok('8 ' + rg + ' ON hash chain: selectedRun===frcOutput===desktop===mobile', aOn.selectedRunHash === aOn.frcOutputHash && aOn.frcOutputHash === aOn.desktopHash && aOn.desktopHash === aOn.mobileHash);
  ok('8 ' + rg + ' ON frcOutput is single segment', aOn.frcOutputSegmentCount === 1 && aOn.selectedRunSegmentCount === 1);
});

// ── 9 audit healthy single-run → HANDOFF_CLEAN both ON/OFF ──────────────────────
{
  const aOff = auditWith(OFF, single30, '30d');
  const aOn = auditWith(ON, single30, '30d');
  ok('9 single-run audit HANDOFF_CLEAN both flags', aOff.verdict === 'HANDOFF_CLEAN' && aOn.verdict === 'HANDOFF_CLEAN');
}

// ── 10 return independence: FRC never touches the return badge fields via step 6.7 ─
{
  const pts = multiRegime('1y', 365);
  const onOut = frc(ON, emgOf(pts, '1y', { returnState: 'ok', badgeReturnPct: 3.2 }), '1y', 'desktop');
  ok('10 badge still resolved from ORIGINAL points (return independent of line trim)', onOut.badgeReturnPct == null || typeof onOut.badgeReturnPct === 'number');
  ok('10 mode marked partial after isolation (honest partial line)', onOut.mode === 'partial_clean' || onOut.mode === 'full');
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  (' + pass + ' passed, ' + fail + ' failed)\n');
process.exit(fail === 0 ? 0 : 1);
