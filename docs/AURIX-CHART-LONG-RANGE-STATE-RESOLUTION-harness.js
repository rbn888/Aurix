'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-LONG-RANGE-STATE-RESOLUTION-harness — SPEC DSH.CHART.LONG_RANGE_STATE_RESOLUTION.26
// ════════════════════════════════════════════════════════════════════════════
// SPEC.25 real-account verdict was SHORT_HISTORY_TRUTHFUL_PRESENTATION_NEEDED with
// calculatingWithUsableBaselineCount:1: a wider finite range (30D/1Y) rendered a usable series with a
// usable trusted baseline yet stayed "Calculando…" while 7D showed a valid trusted return over the SAME
// available history. ROOT CAUSE: the SPEC.22 deadlock promotion used a WINDOW-SCALED span floor
// (_AURIX_CHART_SHORT_HISTORY_MIN_DAYS[r]: 7d=2, 30d=7, 1y=30), conflating RETURN TRUST with HISTORY
// COVERAGE. SPEC.26 decouples them: a trusted flow-neutral return over the available real interval is
// promoted on ANY range using a RANGE-INDEPENDENT trust floor (the narrowest finite floor, 2 days), and
// coverage is surfaced separately as historyCoverage (FULL_REQUESTED_WINDOW / PARTIAL_AVAILABLE_HISTORY /
// ALL_AVAILABLE_HISTORY / UNKNOWN) — never as a suppressed return. 24H, geometry, color, return math,
// syntheticPoints, SPEC.19 sole chokepoint and desktop/mobile parity are all preserved.
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

const DAY = 864e5, HOUR = 36e5, T0 = 1_800_000_000_000;
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
];
const FNS = [
  '_aurixEmergencyHash', '_aurixRealGapFloorMs', '_aurixConfirmedBridgeGaps', '_aurixVerticalJumps',
  '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks', '_aurixSplitAtGaps', '_aurixBuildContinuityValidatedSeries',
  '_aurixStructuralBreaks', '_aurixResolveChartReturnContract', '_aurixShortHistoryDisplay', '_aurixVisualTrustGate',
  '_aurixStableDisplayAnchor', '_aurixCanonicalReturnAnchorIndex', '_aurixResolveReliabilityDeadlock',
  '_aurixResolveFinalRenderSeriesContract',
];
const ctx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date, Set };
vm.createContext(ctx);
CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (_) {} });
FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (_) {} });
const frc = (emg, r, s) => vm.runInContext('_aurixResolveFinalRenderSeriesContract', ctx)(emg, r, s || 'desktop');
const hash = pts => vm.runInContext('_aurixEmergencyHash', ctx)(pts);

function seg(t0, n, stepMs, v0, dv) { const o = []; for (let i = 0; i < n; i++) o.push({ ts: t0 + i * stepMs, value: +(v0 + i * dv).toFixed(2) }); return o; }
// A finite range whose real history is SHORTER than the requested window (coverage < 0.8) but whose
// flow-neutral return over the AVAILABLE interval is itself trusted (partialReturnTrusted). This is the
// exact shape SPEC.25 flagged as calculatingWithUsableBaselineCount and SPEC.26 must resolve.
function partialTrusted(range, over) {
  const pts = (over && over.points) || seg(T0, 40, 2.4 * HOUR, 1000, 0.5);   // ~3.9 days dense
  const first = pts[0], last = pts[pts.length - 1];
  return Object.assign({
    range: range, state: 'ready', returnState: 'insufficient_return_history',
    returnSuppressedReason: 'insufficient_requested_range_history', reason: 'range_collapsed_history_short',
    points: pts, finalPointCount: pts.length, pointCount: pts.length,
    firstTs: first.ts, lastTs: last.ts, baselineTs: first.ts, baselineValue: first.value,
    currentTs: last.ts, currentValue: last.value, coverageRatio: 0.13, historyTooShortForRange: true,
    displayedRangeState: 'partial_history', displayedActualSpanMs: last.ts - first.ts, initialBuildDetected: false,
    coverageSuppressed: true, partialReturnTrusted: true, partialReturnPct: -3.90, partialReturnValue: -40, partialReturnColor: 'down',
    badgeReturnPct: null, returnPct: null, color: 'flat', chartHash: 'h',
  }, over || {});
}
// A mature finite range (full coverage, trusted return) — the "working" reference (7D-style).
function mature(range, color) {
  const dv = color === 'down' ? -0.4 : (color === 'flat' ? 0 : 0.4);
  const pts = seg(T0, 60, 2.8 * HOUR, 1000, dv);
  const first = pts[0], last = pts[pts.length - 1];
  const pct = +(((last.value - first.value) / first.value) * 100).toFixed(2);
  return { range: range, state: 'ready', returnState: 'ok', points: pts, finalPointCount: 60, pointCount: 60,
    firstTs: first.ts, lastTs: last.ts, baselineTs: first.ts, baselineValue: first.value, currentTs: last.ts, currentValue: last.value,
    coverageRatio: 0.99, historyTooShortForRange: false, displayedRangeState: 'full', displayedActualSpanMs: last.ts - first.ts,
    badgeReturnPct: pct, returnPct: pct, color: (dv > 0 ? 'up' : dv < 0 ? 'down' : 'flat'), chartHash: 'h' };
}
const subsetOf = (rp, input) => rp.every(p => input.some(q => q.ts === p.ts && q.value === p.value));

console.log('AURIX-CHART-LONG-RANGE-STATE-RESOLUTION — SPEC.26');

// 1 — 7D valid trusted return: percentage shown, sign/color preserved (the working reference, unchanged).
{
  const f = frc(mature('7d', 'down'), '7d', 'desktop');
  ok('1 7D trusted return → shown, negative/red preserved', f.badgeEligible === true && f.colorClass === 'down' && f.badgeReturnPct < 0 && f.mode === 'full', f.badgeLabel);
  ok('1 7D coverage = FULL_REQUESTED_WINDOW', f.historyCoverage === 'FULL_REQUESTED_WINDOW', f.historyCoverage);
}

// 2/3 — 30D & 1Y usable trusted baseline + valid trusted return → must NOT remain calculating.
['30d', '1y'].forEach((rg, i) => {
  const f = frc(partialTrusted(rg), rg, 'desktop');
  ok((2 + i) + ' ' + rg.toUpperCase() + ' partial trusted → promoted (not Calculando)', f.badgeEligible === true && /-3\.90%/.test(f.badgeLabel) && f.colorClass === 'down' && f.state === 'ready', f.badgeLabel + '/' + f.state);
  ok((2 + i) + ' ' + rg.toUpperCase() + ' → mode partial_clean, coverage PARTIAL_AVAILABLE_HISTORY', f.mode === 'partial_clean' && f.historyCoverage === 'PARTIAL_AVAILABLE_HISTORY');
});

// 4 — ALL usable trusted baseline + valid trusted return → shown (contract-trusted ALL is not calculating).
{
  const m = mature('all', 'down'); m.displayedRangeState = 'all_history';
  const f = frc(m, 'all', 'desktop');
  ok('4 ALL trusted return → shown, coverage ALL_AVAILABLE_HISTORY', f.badgeEligible === true && f.colorClass === 'down' && f.historyCoverage === 'ALL_AVAILABLE_HISTORY', f.badgeLabel + '/' + f.historyCoverage);
}

// 5 — partial short history + valid trusted return → PARTIAL_AVAILABLE_HISTORY, return shown, NOT calculating.
{
  const f = frc(partialTrusted('30d'), '30d', 'desktop');
  ok('5 partial+trusted → return shown AND coverage partial (coexist)', f.badgeEligible === true && f.badgeReturnPct === -3.90 && f.historyCoverage === 'PARTIAL_AVAILABLE_HISTORY');
  ok('5 tagged RELIABILITY_DEADLOCK_RESOLVED_PARTIAL', (f.reasonCodes || []).indexOf('RELIABILITY_DEADLOCK_RESOLVED_PARTIAL') >= 0);
}

// 6 — partial short history + NO trusted baseline → calculating legitimately allowed.
{
  const untrusted = partialTrusted('30d', { partialReturnTrusted: false, partialReturnPct: null });
  const f = frc(untrusted, '30d', 'desktop');
  ok('6 partial + untrusted → stays Calculando (legitimate)', f.badgeEligible === false && /Calculando/.test(f.badgeLabel) && (f.reasonCodes || []).indexOf('RELIABILITY_DEADLOCK_GENUINE_BUILDING') >= 0);
  const noAnchor = partialTrusted('1y', { baselineTs: null, baselineValue: null });
  const f2 = frc(noAnchor, '1y', 'desktop');
  ok('6 partial + no deterministic anchor → stays Calculando', f2.badgeEligible === false);
}

// 7 — SAME legitimate real history across wider ranges → identical geometry, no COPIED percentage, no alias.
{
  const pts = seg(T0 + 3 * DAY, 40, 2.4 * HOUR, 2000, -0.6);
  const seven = partialTrusted('7d', { points: pts, coverageRatio: 0.55 });
  seven.returnState = 'ok'; seven.badgeReturnPct = -4.5; seven.returnPct = -4.5; seven.color = 'down'; seven.historyTooShortForRange = false; seven.displayedRangeState = 'full';
  const thirty = partialTrusted('30d', { points: pts.slice(), partialReturnPct: -4.5, partialReturnColor: 'down' });
  const f7 = frc(seven, '7d', 'desktop'), f30 = frc(thirty, '30d', 'desktop');
  ok('7 same history → identical geometry (renderHash equal, not differentiated)', hash(f7.renderPoints) === hash(f30.renderPoints));
  ok('7 both show a return, each from its OWN emg (data-driven, not copied)', f7.badgeEligible && f30.badgeEligible && f30.badgeReturnPct === -4.5);
  ok('7 no synthetic points introduced', f7.diagnostics.syntheticPoints === 0 && f30.diagnostics.syntheticPoints === 0);
}

// 8 — ALL → ALL_AVAILABLE_HISTORY coverage.
{
  const m = mature('all', 'up'); m.displayedRangeState = 'all_history';
  ok('8 ALL coverage = ALL_AVAILABLE_HISTORY', frc(m, 'all', 'desktop').historyCoverage === 'ALL_AVAILABLE_HISTORY');
}

// 9 — full finite window → FULL_REQUESTED_WINDOW coverage.
{
  ok('9 full finite window coverage = FULL_REQUESTED_WINDOW', frc(mature('30d', 'up'), '30d', 'desktop').historyCoverage === 'FULL_REQUESTED_WINDOW');
}

// 10 — positive / negative / zero existing return semantics preserved on a promoted partial.
{
  const pos = frc(partialTrusted('30d', { partialReturnPct: 2.1, partialReturnColor: 'up' }), '30d', 'desktop');
  const neg = frc(partialTrusted('30d', { partialReturnPct: -3.9, partialReturnColor: 'down' }), '30d', 'desktop');
  const zero = frc(partialTrusted('30d', { partialReturnPct: 0.0, partialReturnColor: 'flat' }), '30d', 'desktop');
  ok('10 positive → up/green', pos.colorClass === 'up' && pos.badgeReturnPct > 0);
  ok('10 negative → down/red', neg.colorClass === 'down' && neg.badgeReturnPct < 0);
  ok('10 zero → flat/neutral', zero.colorClass === 'flat' && zero.badgeReturnPct === 0);
}

// 11 — desktop / mobile parity preserved on a promoted partial.
{
  const d = frc(partialTrusted('1y'), '1y', 'desktop'), m = frc(partialTrusted('1y'), '1y', 'mobile');
  ok('11 desktop == mobile (promoted partial)', hash(d.renderPoints) === hash(m.renderPoints) && d.mode === m.mode && d.badgeLabel === m.badgeLabel && d.colorClass === m.colorClass && d.state === m.state && d.historyCoverage === m.historyCoverage);
}

// 12 — 24H identical fixture: substantive output unchanged (resolver never touches 24H; coverage additive only).
{
  const pts = seg(T0, 48, 30 * 60e3, 1000, -0.03);   // 24h down-trend
  const first = pts[0], last = pts[pts.length - 1];
  const pct = +(((last.value - first.value) / first.value) * 100).toFixed(2);
  const h24 = { range: '24h', state: 'ready', returnState: 'ok', points: pts, finalPointCount: 48, pointCount: 48,
    firstTs: first.ts, lastTs: last.ts, baselineTs: first.ts, baselineValue: first.value, currentTs: last.ts, currentValue: last.value,
    coverageRatio: 0.99, historyTooShortForRange: false, displayedRangeState: 'full', badgeReturnPct: pct, returnPct: pct, color: 'down', chartHash: 'h' };
  const a = frc(h24, '24h', 'desktop'), b = frc(h24, '24h', 'desktop');
  ok('12 24H deterministic + trusted return + red preserved', JSON.stringify(a) === JSON.stringify(b) && a.badgeEligible === true && a.colorClass === 'down' && a.mode === 'full');
  ok('12 24H NOT touched by deadlock resolver', !(a.reasonCodes || []).some(c => /RELIABILITY_DEADLOCK/.test(c)));
  ok('12 24H coverage = FULL_REQUESTED_WINDOW (additive only)', a.historyCoverage === 'FULL_REQUESTED_WINDOW');
}

// 13 — syntheticPoints always 0 across every promoted / building / mature / 24H shape.
{
  const cases = [frc(partialTrusted('30d'), '30d', 'desktop'), frc(partialTrusted('1y'), '1y', 'desktop'),
    frc(mature('7d', 'down'), '7d', 'desktop'), frc(partialTrusted('30d', { partialReturnTrusted: false, partialReturnPct: null }), '30d', 'desktop')];
  ok('13 syntheticPoints = 0 everywhere', cases.every(c => c.diagnostics.syntheticPoints === 0));
  ok('13 promoted renderPoints ⊆ input (no invented points)', subsetOf(frc(partialTrusted('30d'), '30d', 'desktop').renderPoints, partialTrusted('30d').points));
}

// ── source-level invariants ──
console.log('\nSource-level:');
ok('S1 SPEC.26 marker present', /SPEC\.26/.test(app) && /LONG_RANGE_STATE_RESOLUTION/.test(app));
ok('S2 trust floor is range-INDEPENDENT (tbl[\'7d\'], not window-scaled tbl[r])', /const minSpanDays = \(tbl\['7d'\] != null\)/.test(app));
ok('S3 historyCoverage exposed on the FRC contract', /historyCoverage:/.test(app) && /PARTIAL_AVAILABLE_HISTORY/.test(app) && /ALL_AVAILABLE_HISTORY/.test(app) && /FULL_REQUESTED_WINDOW/.test(app));
ok('S4 SPEC.19 remains the SOLE final render chokepoint', (app.match(/function _aurixResolveFinalRenderSeriesContract\(/g) || []).length === 1);
ok('S5 exactly ONE return formula + ONE deadlock resolver (no second calculator)', (app.match(/function _aurixComputePeriodReturn\(/g) || []).length === 1 && (app.match(/function _aurixResolveReliabilityDeadlock\(/g) || []).length === 1);
ok('S6 no interpolation / synthetic marker regression (syntheticPoints stays 0)', /syntheticPoints: 0/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
