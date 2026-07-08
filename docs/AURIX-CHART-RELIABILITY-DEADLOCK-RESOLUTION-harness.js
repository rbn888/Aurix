'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-RELIABILITY-DEADLOCK-RESOLUTION-harness — SPEC DSH.CHART.RELIABILITY_DEADLOCK_RESOLUTION.22
// ════════════════════════════════════════════════════════════════════════════
// The 7D+ reliability deadlock: buildProductionPortfolioChart's coverage-span gate (coverageRatio < 0.8)
// suppresses the return to insufficient_return_history even when the flow-neutral return over the AVAILABLE
// real interval is trustworthy — so the SPEC.16 partial line draws with an indefinite Calculando badge. This
// harness verifies the resolution (flag _AURIX_CHART_RELIABILITY_DEADLOCK_RESOLUTION), tested both on the
// pure classifier _aurixResolveReliabilityDeadlock and end-to-end through the SPEC.19 resolver: a
// trustworthy partial interval is promoted to an honest partial-interval return (mode partial_clean, never
// full), genuinely-insufficient evidence stays truthful building, 24H/mature are untouched, and flag OFF
// reproduces exact v503 behaviour.
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

const DAY = 864e5, HOUR = 36e5, MIN = 60e3, T0 = 1_800_000_000_000;
const CONSTS = [
  '_AURIX_VP_GAP_FLOOR_MS', '_AURIX_VP_GAP_MEDIAN_MULT', '_AURIX_EMG_RANGE_MS', '_AURIX_BRIDGE_SEG_ENABLED',
  '_AURIX_BRIDGE_SEG_FRAC', '_AURIX_CAPITAL_STEP_SEG_ENABLED', '_AURIX_SPARSE_RAMP_SEG_ENABLED',
  '_AURIX_VJUMP_MIN_FRAC', '_AURIX_VJUMP_P95_MULT', '_AURIX_CAPSTEP_RATIO_LO', '_AURIX_CAPSTEP_RATIO_HI',
  '_AURIX_CAPSTEP_TS_PAD_MS', '_AURIX_SPARSE_RAMP_MULT', '_AURIX_SPARSE_RAMP_MIN_MS', '_AURIX_ORPHAN_CLEANUP_ENABLED',
  '_AURIX_ORPHAN_MAX_PTS', '_AURIX_ALL_MIN_TRUST_POINTS',
  '_AURIX_CHART_CONTINUITY_UNIFICATION', '_AURIX_CHART_RETURN_CONTRACT_UNIFICATION',
  '_AURIX_CHART_SHORT_HISTORY_DISPLAY', '_AURIX_CHART_SHORT_HISTORY_MIN_DAYS',
  '_AURIX_CHART_VISUAL_TRUST_GATE', '_AURIX_VTG_MIN_MAIN_PTS', '_AURIX_VTG_MIN_MAIN_SPAN_MS',
  '_AURIX_CHART_BOOTSTRAP_SUPPRESSION', '_AURIX_STABLE_BAND_LO', '_AURIX_STABLE_MIN_PTS',
  '_AURIX_STABLE_MIN_SPAN_MS', '_AURIX_STABLE_CONSTRUCTION_JUMP', '_AURIX_CHART_FINAL_RENDER_SERIES_CONTRACT',
  '_AURIX_CHART_CANONICAL_REFRESH_DETERMINISM',
];
const FNS = [
  '_aurixEmergencyHash', '_aurixRealGapFloorMs', '_aurixConfirmedBridgeGaps', '_aurixVerticalJumps',
  '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks', '_aurixSplitAtGaps', '_aurixBuildContinuityValidatedSeries',
  '_aurixStructuralBreaks', '_aurixResolveChartReturnContract', '_aurixShortHistoryDisplay', '_aurixVisualTrustGate',
  '_aurixStableDisplayAnchor', '_aurixCanonicalReturnAnchorIndex', '_aurixResolveReliabilityDeadlock',
  '_aurixResolveFinalRenderSeriesContract',
];
function mkCtx(withFlag) {
  const ctx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date, Set };
  vm.createContext(ctx);
  CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (_) {} });
  if (withFlag) { try { vm.runInContext(konstSrc('_AURIX_CHART_RELIABILITY_DEADLOCK_RESOLUTION'), ctx); } catch (_) {} }
  FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (e) { /* optional */ } });
  return ctx;
}
const ON = mkCtx(true), OFF = mkCtx(false);
const dlON = (emg, contract, r) => vm.runInContext('_aurixResolveReliabilityDeadlock', ON)(emg, contract, r);
const frcON = (emg, r, s) => vm.runInContext('_aurixResolveFinalRenderSeriesContract', ON)(emg, r, s);
const frcOFF = (emg, r, s) => vm.runInContext('_aurixResolveFinalRenderSeriesContract', OFF)(emg, r, s);
const hash = pts => vm.runInContext('_aurixEmergencyHash', ON)(pts);

function seg(t0, n, stepMs, v0, dv) { const o = []; for (let i = 0; i < n; i++) o.push({ ts: t0 + i * stepMs, value: +(v0 + i * dv).toFixed(2) }); return o; }
// A 7D chart whose real history is ~4 days (coverage 0.57 < 0.8) but the flow-neutral return was trustworthy.
function deadlock7d(over) {
  const pts = seg(T0, 40, 2.4 * HOUR, 1000, 0.5);   // ~3.9 days, 40 dense points, gently rising
  const first = pts[0], last = pts[pts.length - 1];
  return Object.assign({
    range: '7d', state: 'ready', returnState: 'insufficient_return_history',
    returnSuppressedReason: 'insufficient_requested_range_history', reason: 'range_collapsed_history_short',
    points: pts, finalPointCount: pts.length, pointCount: pts.length,
    firstTs: first.ts, lastTs: last.ts, baselineTs: first.ts, baselineValue: first.value,
    currentTs: last.ts, currentValue: last.value, coverageRatio: 0.57, historyTooShortForRange: true,
    displayedActualSpanMs: last.ts - first.ts, initialBuildDetected: false,
    coverageSuppressed: true, partialReturnTrusted: true, partialReturnPct: 2.10, partialReturnValue: 100, partialReturnColor: 'up',
    badgeReturnPct: null, returnPct: null, color: 'flat', chartHash: 'h',
  }, over || {});
}
const calc = { state: 'calculating', reason: 'insufficient_requested_range_history' };
const subsetOf = (rp, input) => rp.every(p => input.some(q => q.ts === p.ts && q.value === p.value));

console.log('AURIX-CHART-RELIABILITY-DEADLOCK-RESOLUTION — SPEC.22');

// 1 — reproduce + resolve: qualifying 7D deadlock → PARTIAL, promoted to an honest partial return.
{
  const d = dlON(deadlock7d(), calc, '7d');
  ok('1 pure resolver → branch PARTIAL (deadlock detected)', d.branch === 'PARTIAL' && d.deadlockDetected === true, d.branch);
  ok('1 pure resolver → returnPct = trusted partial return', d.returnPct === 2.10 && d.colorState === 'positive');
  const f = frcON(deadlock7d(), '7d', 'desktop');
  ok('1 FRC → badge eligible + real % (no longer Calculando)', f.badgeEligible === true && /\+2\.10%/.test(f.badgeLabel) && f.colorClass === 'up', f.badgeLabel);
  ok('1 FRC → state ready (deadlock resolved)', f.state === 'ready', f.state);
  ok('1 FRC → reason RELIABILITY_DEADLOCK_RESOLVED_PARTIAL', (f.reasonCodes || []).indexOf('RELIABILITY_DEADLOCK_RESOLVED_PARTIAL') >= 0);
}

// 2 — deterministic resolution (same evidence → identical decision).
{
  const a = frcON(deadlock7d(), '7d', 'desktop'), b = frcON(deadlock7d(), '7d', 'desktop');
  ok('2 deterministic (same input → identical contract)', JSON.stringify(a) === JSON.stringify(b));
}

// 3 — genuine short history stays BUILDING (span below the honest floor).
{
  const short = deadlock7d({ points: seg(T0, 10, 2 * HOUR, 1000, 0.5), finalPointCount: 10, pointCount: 10,
    displayedActualSpanMs: 18 * HOUR, lastTs: T0 + 18 * HOUR, currentTs: T0 + 18 * HOUR });
  const d = dlON(short, calc, '7d');
  ok('3 short span → branch BUILDING (not a deadlock)', d.branch === 'BUILDING' && d.deadlockDetected === false, d.branch);
  ok('3 short span → predicate insufficient_real_span/points', /insufficient_real_(span|points)/.test(d.blockingPredicate), d.blockingPredicate);
  const f = frcON(short, '7d', 'desktop');
  ok('3 FRC → NOT promoted (badge stays not-eligible)', f.badgeEligible === false && (f.reasonCodes || []).indexOf('RELIABILITY_DEADLOCK_GENUINE_BUILDING') >= 0);
}

// 4 — no deterministic anchor → BUILDING.
{
  const d = dlON(deadlock7d({ baselineTs: null, baselineValue: null }), calc, '7d');
  ok('4 no anchor → BUILDING + predicate', d.branch === 'BUILDING' && d.blockingPredicate === 'no_deterministic_anchor', d.blockingPredicate);
}

// 5 — canonical source conflict → BUILDING.
{
  const d = dlON(deadlock7d(), { state: 'calculating', reason: 'cross_source_family' }, '7d');
  ok('5 source conflict → BUILDING + predicate', d.branch === 'BUILDING' && d.blockingPredicate === 'canonical_source_conflict', d.blockingPredicate);
}

// 6 — bootstrap-only history → BUILDING.
{
  const d = dlON(deadlock7d({ initialBuildDetected: true }), calc, '7d');
  ok('6 bootstrap-only → BUILDING + predicate', d.branch === 'BUILDING' && d.blockingPredicate === 'bootstrap_only_history', d.blockingPredicate);
}

// 6b — untrusted partial return (coverage suppressed but per-return was NOT ok) → BUILDING.
{
  const d = dlON(deadlock7d({ partialReturnTrusted: false, partialReturnPct: null }), calc, '7d');
  ok('6b untrusted partial → BUILDING + predicate', d.branch === 'BUILDING' && d.blockingPredicate === 'partial_return_untrusted', d.blockingPredicate);
}

// 6c — current value unavailable → BUILDING.
{
  const d = dlON(deadlock7d({ currentValue: null }), calc, '7d');
  ok('6c no current value → BUILDING + predicate', d.branch === 'BUILDING' && d.blockingPredicate === 'current_value_unavailable', d.blockingPredicate);
}

// 7 — a resolved partial is NEVER labelled a full-window return.
{
  const f = frcON(deadlock7d(), '7d', 'desktop');
  ok('7 resolved partial → mode partial_clean (never full)', f.mode === 'partial_clean', f.mode);
  ok('7 resolved partial → no synthetic points, renderPoints ⊆ input', f.diagnostics.syntheticPoints === 0 && subsetOf(f.renderPoints, deadlock7d().points));
}

// 8 — same input repeated → identical hash + reasons.
{
  const runs = []; for (let i = 0; i < 6; i++) { const r = frcON(deadlock7d(), '7d', 'desktop'); runs.push(JSON.stringify([hash(r.renderPoints), r.mode, r.badgeLabel, r.colorClass, r.reasonCodes])); }
  ok('8 repeated → byte-identical contract', runs.every(x => x === runs[0]));
}

// 9 — 24H untouched (resolver NA for 24H).
{
  const d = dlON(deadlock7d({ range: '24h' }), calc, '24h');
  ok('9 24H → resolver NA (never touched)', d.branch === 'NA');
}

// 10 — mature 7D (full coverage, returnState ok) unchanged: contract ok ⇒ resolver FULL, no promotion.
{
  const pts = seg(T0, 60, 2.8 * HOUR, 1000, 0.3);   // ~7 days
  const first = pts[0], last = pts[pts.length - 1];
  const mature = { range: '7d', state: 'ready', returnState: 'ok', points: pts, finalPointCount: 60, pointCount: 60,
    firstTs: first.ts, lastTs: last.ts, baselineTs: first.ts, baselineValue: first.value, currentTs: last.ts, currentValue: last.value,
    coverageRatio: 0.99, historyTooShortForRange: false, displayedActualSpanMs: last.ts - first.ts,
    badgeReturnPct: 2.5, returnPct: 2.5, color: 'up', chartHash: 'h' };
  const f = frcON(mature, '7d', 'desktop');
  ok('10 mature 7D → full / ready / eligible (unchanged)', f.mode === 'full' && f.state === 'ready' && f.badgeEligible === true && /\+2\.50%/.test(f.badgeLabel));
  ok('10 mature 7D → NOT tagged as a deadlock resolution', !(f.reasonCodes || []).some(c => /RELIABILITY_DEADLOCK/.test(c)));
}

// 11 — desktop == mobile for a resolved deadlock.
{
  const d = frcON(deadlock7d(), '7d', 'desktop'), m = frcON(deadlock7d(), '7d', 'mobile');
  ok('11 desktop == mobile (resolved partial)', hash(d.renderPoints) === hash(m.renderPoints) && d.mode === m.mode && d.badgeLabel === m.badgeLabel && d.colorClass === m.colorClass && d.state === m.state);
}

// 12 — flag OFF → exact v503 (no promotion; stays calculating with explicit reason, no RESOLVED code).
{
  const f = frcOFF(deadlock7d(), '7d', 'desktop');
  ok('12 flag OFF → badge stays NOT eligible (v503)', f.badgeEligible === false);
  ok('12 flag OFF → no RELIABILITY_DEADLOCK_RESOLVED reason', !(f.reasonCodes || []).some(c => /RELIABILITY_DEADLOCK_RESOLVED/.test(c)));
}

// 13 — real gap never bridged / no synthetic (already covered by 7; global sweep).
{
  const cases = [frcON(deadlock7d(), '7d', 'desktop'), frcON(deadlock7d({ range: '30d', coverageRatio: 0.3 }), '30d', 'desktop')];
  ok('13 syntheticPoints = 0 across resolutions', cases.every(c => c.diagnostics.syntheticPoints === 0));
}

// 14 — SPEC.26: the promotion trust floor is RANGE-INDEPENDENT (return trust ≠ requested-window coverage).
// A trusted flow-neutral return over the available real interval promotes on 30D exactly as it does on 7D,
// regardless of how little of the wider window is covered; only a GENUINELY tiny interval (< the narrowest
// finite floor, 2 days) stays honest building. Was previously window-scaled (30D needed 7 real days).
{
  const d30 = dlON(deadlock7d({ range: '30d', coverageRatio: 0.13 }), calc, '30d');   // ~3.9 days, trusted partial
  ok('14 30D 3.9-day trusted partial → PARTIAL (decoupled from window coverage)', d30.branch === 'PARTIAL' && d30.deadlockDetected === true, d30.branch);
  const tiny = seg(T0, 10, 2 * HOUR, 1000, 0.5);   // ~18h < 2-day trust floor
  const tf = tiny[0], tl = tiny[tiny.length - 1];
  const d30tiny = dlON(deadlock7d({ range: '30d', points: tiny, finalPointCount: 10, pointCount: 10, firstTs: tf.ts, lastTs: tl.ts, baselineTs: tf.ts, baselineValue: tf.value, currentTs: tl.ts, currentValue: tl.value, displayedActualSpanMs: tl.ts - tf.ts, coverageRatio: 0.03 }), calc, '30d');
  ok('14 30D 18-hour history → BUILDING (below range-independent 2-day trust floor)', d30tiny.branch === 'BUILDING' && d30tiny.blockingPredicate === 'insufficient_real_span', d30tiny.blockingPredicate);
  const pts = seg(T0, 80, 3 * HOUR, 1000, 0.2);   // 10 days
  const first = pts[0], last = pts[pts.length - 1];
  const d30ok = dlON(deadlock7d({ range: '30d', points: pts, finalPointCount: 80, pointCount: 80, firstTs: first.ts, lastTs: last.ts, baselineTs: first.ts, baselineValue: first.value, currentTs: last.ts, currentValue: last.value, displayedActualSpanMs: last.ts - first.ts, coverageRatio: 0.33 }), calc, '30d');
  ok('14 30D 10-day history → PARTIAL', d30ok.branch === 'PARTIAL', d30ok.branch);
}

// ── source-level: auditor extension + markers ──
console.log('\nSource-level:');
const audSrc = (function () { const i = app.indexOf('window.aurixChartHydrationStabilityAudit = function'); return i < 0 ? '' : braceSlice(app.indexOf('{', i)); })();
ok('S1 SPEC.22 flag present + rollback documented', /_AURIX_CHART_RELIABILITY_DEADLOCK_RESOLUTION = true/.test(app));
ok('S2 pure resolver defined + exported', /function _aurixResolveReliabilityDeadlock\(/.test(app) && /window\._aurixResolveReliabilityDeadlock/.test(app));
ok('S3 buildProductionPortfolioChart exposes trusted partial-return evidence', /out\.partialReturnTrusted = true/.test(app) && /out\.coverageSuppressed = true/.test(app));
ok('S4 auditor exposes deadlock evidence fields', ['deadlockResolution', 'deadlockDetected', 'blockingPredicate', 'realPointCount', 'realSpanMs', 'anchorDeterministic', 'currentValueAvailable', 'sourceConflict'].every(k => new RegExp(k).test(audSrc)));
ok('S5 auditor deadlock detection uses resolver classification (flag-off fallback kept)', /e\.deadlockResolution != null/.test(audSrc) && /deadlockDetected && e\.returnContractState === 'calculating'/.test(audSrc));
ok('S6 SPEC.19 remains the sole final render chokepoint', (app.match(/function _aurixResolveFinalRenderSeriesContract\(/g) || []).length === 1);
ok('S7 SPEC.22 marker present', /SPEC DSH\.CHART\.RELIABILITY_DEADLOCK_RESOLUTION\.22/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
