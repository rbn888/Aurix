'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-SHORT-HISTORY-PREMIUM-PRESENTATION-harness — SPEC DSH.CHART.SHORT_HISTORY_PREMIUM_PRESENTATION.28
// ════════════════════════════════════════════════════════════════════════════
// PRESENTATION-ONLY. Stable real partial history with no trusted return must not read as indefinite
// "Calculando…". The SPEC.19 final contract exposes historyPresentationState (TRUSTED_RETURN | PARTIAL_HISTORY
// | AVAILABLE_HISTORY | CALCULATING | UNKNOWN); the canonical badge painter (_aurixEmergencyPaintBadgeNode)
// maps PARTIAL_HISTORY→"Historial parcial", AVAILABLE_HISTORY→"Historial disponible", else the existing
// "Calculando…". No %, no 0%, no colour, no geometry, no synthetic points, no eligibility flip. 24H trusted
// return, ALL lifetime-return trust and the SPEC.27 impossible-return guard are all untouched.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(startIdx) { let k = app.indexOf('{', startIdx), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(startIdx, k); }
function fnSrc(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing fn ' + name); return braceSlice(i); }
function konstSrc(name) {
  const m = new RegExp('const ' + name + '\\s*=\\s*').exec(app);
  if (!m) throw new Error('missing const ' + name);
  const i = m.index, eq = m.index + m[0].length, first = app[eq];
  if (first === '{' || first === '[') { const body = braceSlice(eq); const semi = app.indexOf(';', eq + body.length); return app.slice(i, semi + 1); }
  const semi = app.indexOf(';', eq); return app.slice(i, semi + 1);
}
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const DAY = 864e5, T0 = 1_800_000_000_000;
const CONSTS = [
  '_AURIX_VP_GAP_FLOOR_MS', '_AURIX_VP_GAP_MEDIAN_MULT', '_AURIX_EMG_RANGE_MS', '_AURIX_BRIDGE_SEG_ENABLED',
  '_AURIX_BRIDGE_SEG_FRAC', '_AURIX_CAPITAL_STEP_SEG_ENABLED', '_AURIX_SPARSE_RAMP_SEG_ENABLED',
  '_AURIX_VJUMP_MIN_FRAC', '_AURIX_VJUMP_P95_MULT', '_AURIX_CAPSTEP_RATIO_LO', '_AURIX_CAPSTEP_RATIO_HI',
  '_AURIX_CAPSTEP_TS_PAD_MS', '_AURIX_SPARSE_RAMP_MULT', '_AURIX_SPARSE_RAMP_MIN_MS', '_AURIX_ORPHAN_CLEANUP_ENABLED',
  '_AURIX_ORPHAN_MAX_PTS', '_AURIX_ALL_MIN_TRUST_POINTS', '_AURIX_CHART_CONTINUITY_UNIFICATION',
  '_AURIX_CHART_RETURN_CONTRACT_UNIFICATION', '_AURIX_CHART_SHORT_HISTORY_DISPLAY', '_AURIX_CHART_SHORT_HISTORY_MIN_DAYS',
  '_AURIX_CHART_VISUAL_TRUST_GATE', '_AURIX_VTG_MIN_MAIN_PTS', '_AURIX_VTG_MIN_MAIN_SPAN_MS',
  '_AURIX_CHART_BOOTSTRAP_SUPPRESSION', '_AURIX_STABLE_BAND_LO', '_AURIX_STABLE_MIN_PTS',
  '_AURIX_STABLE_MIN_SPAN_MS', '_AURIX_STABLE_CONSTRUCTION_JUMP', '_AURIX_CHART_FINAL_RENDER_SERIES_CONTRACT',
  '_AURIX_CHART_CANONICAL_REFRESH_DETERMINISM', '_AURIX_CHART_RELIABILITY_DEADLOCK_RESOLUTION',
  '_AURIX_PARTIAL_RETURN_MIN_PCT', '_AURIX_RETURN_PENDING_TEXT', '_AURIX_HIST_PARTIAL_TEXT', '_AURIX_HIST_AVAILABLE_TEXT',
];
const FNS = [
  '_aurixEmergencyHash', '_aurixRealGapFloorMs', '_aurixConfirmedBridgeGaps', '_aurixVerticalJumps',
  '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks', '_aurixSplitAtGaps', '_aurixBuildContinuityValidatedSeries',
  '_aurixStructuralBreaks', '_aurixResolveChartReturnContract', '_aurixShortHistoryDisplay', '_aurixVisualTrustGate',
  '_aurixStableDisplayAnchor', '_aurixCanonicalReturnAnchorIndex', '_aurixResolveReliabilityDeadlock',
  '_aurixResolveFinalRenderSeriesContract', '_aurixReturnPendingHTML', '_aurixHistoryPresentationBadge', '_aurixEmergencyPaintBadgeNode',
];
const ctx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date, Set,
  _aurixEmergencyBadgeText: emg => ((emg.badgeReturnPct >= 0 ? '+' : '') + Number(emg.badgeReturnPct).toFixed(2) + '%'),
  _aurixReturnInsufficientText: () => '0.00%' };
vm.createContext(ctx);
CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (_) {} });
FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (_) {} });
const frc = (emg, r, s) => vm.runInContext('_aurixResolveFinalRenderSeriesContract', ctx)(emg, r, s || 'desktop');
const hash = pts => vm.runInContext('_aurixEmergencyHash', ctx)(pts);
const paint = (emg, s) => { const el = { innerHTML: '', className: '' }; vm.runInContext('_aurixEmergencyPaintBadgeNode', ctx)(el, emg, s || 'desktop'); return el; };

function seg(t0, n, stepMs, v0, dv) { const o = []; for (let i = 0; i < n; i++) o.push({ ts: t0 + i * stepMs, value: +(v0 + i * dv).toFixed(2) }); return o; }
// coverage-suppressed finite range: stable rendered partial line, no trusted return (matches real 7D/30D/1Y).
function partial(range, over) {
  over = over || {};
  const spanDays = over.spanDays != null ? over.spanDays : 3.147;
  const pts = seg(T0, 40, (spanDays * DAY) / 39, 1000, -0.2);
  const first = pts[0], last = pts[pts.length - 1];
  return Object.assign({
    range: range, state: 'ready', returnState: 'insufficient_return_history',
    returnSuppressedReason: 'insufficient_requested_range_history', reason: 'range_collapsed_history_short',
    points: pts, finalPointCount: pts.length, pointCount: pts.length,
    firstTs: first.ts, lastTs: last.ts, baselineTs: first.ts, baselineValue: first.value,
    currentTs: last.ts, currentValue: last.value, coverageRatio: over.coverageRatio != null ? over.coverageRatio : 0.1,
    historyTooShortForRange: true, displayedRangeState: 'partial_history', displayedActualSpanMs: spanDays * DAY,
    initialBuildDetected: false, coverageSuppressed: true, partialReturnTrusted: over.partialReturnTrusted != null ? over.partialReturnTrusted : false,
    partialReturnPct: over.partialReturnPct != null ? over.partialReturnPct : null, partialReturnColor: 'down',
    badgeReturnPct: null, returnPct: null, color: 'flat', chartHash: 'h',
  }, over.emg || {});
}
function mature(range, pct, drs) {
  const pts = seg(T0, 60, (7 * DAY) / 59, 1000, pct / 100 * 1000 / 59);
  const first = pts[0], last = pts[pts.length - 1];
  return { range: range, state: 'ready', returnState: 'ok', points: pts, finalPointCount: 60, pointCount: 60,
    firstTs: first.ts, lastTs: last.ts, baselineTs: first.ts, baselineValue: first.value, currentTs: last.ts, currentValue: last.value,
    coverageRatio: 0.99, historyTooShortForRange: false, displayedRangeState: drs || 'full',
    badgeReturnPct: pct, returnPct: pct, color: (pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat'), chartHash: 'h' };
}
function allShort() {
  const pts = seg(T0, 40, (3.147 * DAY) / 39, 1000, -0.2), first = pts[0], last = pts[pts.length - 1];
  return { range: 'all', state: 'ready', returnState: 'insufficient_return_history', returnSuppressedReason: 'all_history_new_account_or_initial_build',
    reason: 'all_history_new_account_or_initial_build', points: pts, finalPointCount: 40, pointCount: 40,
    firstTs: first.ts, lastTs: last.ts, baselineTs: first.ts, baselineValue: first.value, currentTs: last.ts, currentValue: last.value,
    coverageRatio: null, historyTooShortForRange: false, displayedRangeState: 'all_history', initialBuildDetected: true,
    coverageSuppressed: false, partialReturnTrusted: false, badgeReturnPct: null, returnPct: null, color: 'flat', chartHash: 'h' };
}
const subsetOf = (rp, input) => rp.every(p => input.some(q => q.ts === p.ts && q.value === p.value));

console.log('AURIX-CHART-SHORT-HISTORY-PREMIUM-PRESENTATION — SPEC.28');

// 1 — 24H trusted negative unchanged (percentage shown, red, no history label).
{
  const f = frc(mature('24h', -1.28), '24h', 'desktop'), el = paint(mature('24h', -1.28), 'desktop');
  ok('1 24H trusted → TRUSTED_RETURN + % badge (unchanged)', f.historyPresentationState === 'TRUSTED_RETURN' && /-1\.28%/.test(el.innerHTML) && /chart-change (down|up|flat)/.test(el.className) && !/Historial/.test(el.innerHTML), el.innerHTML);
}

// 2 — trusted positive/negative/zero returns unchanged.
{
  ['up', 'down', 'flat'].forEach(t => {
    const pct = t === 'up' ? 3.2 : t === 'down' ? -3.2 : 0.0;
    const f = frc(mature('7d', pct), '7d', 'desktop');
    ok('2 trusted ' + t + ' → TRUSTED_RETURN, no history label', f.historyPresentationState === 'TRUSTED_RETURN' && f.badgeEligible === true);
  });
}

// 3/4 — 7D & 30D partial stable history → "Historial parcial", returnPct null, eligible false.
['7d', '30d'].forEach((rg, i) => {
  const f = frc(partial(rg), rg, 'desktop'), el = paint(partial(rg), rg === '7d' ? 'desktop' : 'mobile');
  ok((3 + i) + ' ' + rg.toUpperCase() + ' partial stable → PARTIAL_HISTORY', f.historyPresentationState === 'PARTIAL_HISTORY' && f.badgeEligible === false && f.badgeReturnPct == null, f.historyPresentationState);
  ok((3 + i) + ' ' + rg.toUpperCase() + ' badge → "Historial parcial", no %/0%/Calculando', /Historial parcial/.test(el.innerHTML) && !/%/.test(el.innerHTML) && !/Calculando/.test(el.innerHTML) && el.className === 'chart-change flat', el.innerHTML);
});

// 5 — 1Y partial with an IMPOSSIBLE return (SPEC.27 rejected) → "Historial parcial", never -191%.
{
  const emg = partial('1y', { partialReturnTrusted: true, partialReturnPct: -191.1372, spanDays: 3.147 });
  const f = frc(emg, '1y', 'desktop'), el = paint(emg, '1y' && 'desktop');
  ok('5 1Y impossible-return partial → PARTIAL_HISTORY, not eligible', f.historyPresentationState === 'PARTIAL_HISTORY' && f.badgeEligible === false, f.historyPresentationState + '/' + f.badgeEligible);
  ok('5 badge shows "Historial parcial", never -191%', /Historial parcial/.test(el.innerHTML) && !/191/.test(el.innerHTML) && !/%/.test(el.innerHTML));
}

// 6 — ALL available short history → "Historial disponible", no lifetime return invented.
{
  const f = frc(allShort(), 'all', 'desktop'), el = paint(allShort(), 'desktop');
  ok('6 ALL short → AVAILABLE_HISTORY', f.historyPresentationState === 'AVAILABLE_HISTORY' && f.badgeEligible === false, f.historyPresentationState);
  ok('6 badge → "Historial disponible", no %/lifetime return', /Historial disponible/.test(el.innerHTML) && !/%/.test(el.innerHTML) && !/Calculando/.test(el.innerHTML));
}

// 7 — actively loading (chart not ready) → still "Calculando…".
{
  const loading = { range: '7d', state: 'pending', reason: 'awaiting_canonical_reconcile', points: [], pointCount: 0 };
  const f = frc(loading, '7d', 'desktop'), el = paint(loading, 'desktop');
  ok('7 loading/unresolved → CALCULATING + "Calculando…"', (f.historyPresentationState === 'CALCULATING' || f.historyPresentationState === 'UNKNOWN') && /Calculando/.test(el.innerHTML), f.historyPresentationState + '/' + el.innerHTML);
}

// 8 — no real points / no current value / building → safe existing Calculando.
{
  const empty = { range: '30d', state: 'ready', points: [{ ts: T0, value: 1000 }], pointCount: 1, finalPointCount: 1 };  // <2 finite → building
  const el = paint(empty, 'desktop');
  ok('8 <2 points → not a history label, stays Calculando', /Calculando/.test(el.innerHTML) && !/Historial/.test(el.innerHTML));
}

// 9 — syntheticPoints remains 0 across all presentation states.
{
  const cs = [frc(partial('7d'), '7d', 'desktop'), frc(allShort(), 'all', 'desktop'), frc(mature('24h', -1.28), '24h', 'desktop')];
  ok('9 syntheticPoints = 0 everywhere', cs.every(c => c.diagnostics.syntheticPoints === 0));
}

// 10 — desktop/mobile SEMANTIC parity (same presentation state + same rendered geometry).
{
  const d = frc(partial('30d'), '30d', 'desktop'), m = frc(partial('30d'), '30d', 'mobile');
  ok('10 desktop == mobile presentation + geometry', d.historyPresentationState === m.historyPresentationState && hash(d.renderPoints) === hash(m.renderPoints) && d.mode === m.mode);
  const ed = paint(partial('30d'), 'desktop'), em = paint(partial('30d'), 'mobile');
  ok('10 desktop == mobile badge label', ed.innerHTML === em.innerHTML);
}

// 11 — chart hashes / point arrays unchanged by presentation (renderPoints ⊆ input, no mutation).
{
  const emg = partial('30d'); const before = hash(emg.points.map(p => ({ ts: p.ts, value: p.value })));
  const f = frc(emg, '30d', 'desktop');
  ok('11 renderPoints ⊆ input, input hash unchanged', subsetOf(f.renderPoints, emg.points) && hash(emg.points.map(p => ({ ts: p.ts, value: p.value }))) === before);
}

// 12 — SPEC.27 impossible-return guard still holds (no promotion, no eligibility) alongside the label.
{
  const f = frc(partial('1y', { partialReturnTrusted: true, partialReturnPct: -191.1372 }), '1y', 'desktop');
  ok('12 impossible partial → badgeEligible false (SPEC.27 intact)', f.badgeEligible === false && f.badgeReturnPct == null && f.historyPresentationState === 'PARTIAL_HISTORY');
}

// ── source-level invariants ──
console.log('\nSource-level:');
ok('S1 SPEC.28 marker present', /SHORT_HISTORY_PREMIUM_PRESENTATION\.28/.test(app));
ok('S2 premium labels + presentation state defined', /Historial parcial/.test(app) && /Historial disponible/.test(app) && /historyPresentationState/.test(app));
ok('S3 badge painter uses the presentation helper (both branches)', (app.match(/_aurixHistoryPresentationBadge\(emg, surface\)/g) || []).length >= 2);
ok('S4 SPEC.19 sole final render chokepoint', (app.match(/function _aurixResolveFinalRenderSeriesContract\(/g) || []).length === 1);
ok('S5 exactly ONE return formula + ONE deadlock resolver', (app.match(/function _aurixComputePeriodReturn\(/g) || []).length === 1 && (app.match(/function _aurixResolveReliabilityDeadlock\(/g) || []).length === 1);
ok('S6 SPEC.27 guard preserved', /withinSupportedReturnDomain/.test(app) && /_AURIX_PARTIAL_RETURN_MIN_PCT/.test(app));
ok('S7 no eligibility flip for presentation (label path never sets badgeEligible)', !/badgeEligible = true.*Historial/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
