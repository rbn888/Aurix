'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-READY-SERIES-VISIBILITY-harness — SPEC DSH.CHART.READY_SERIES_VISIBILITY.49
// ════════════════════════════════════════════════════════════════════════════
// v541 production: 24H + 7D showed "Calculando / Histórico en construcción" with NO line even though a
// validated drawable series existed. Owner: the FRC bootstrap-suppression gate (step 5, _aurixStableDisplayAnchor)
// returned mode 'building' on 'no_stable_tramo' while the badge was Calculando — a RETURN/VALUE-TRUST verdict
// that wrongly HID the line. SPEC.49: line visibility ⊥ return readiness. When ≥2 continuous validated points
// exist (24H/7D), keep them as a partial line; the return contract independently keeps the badge Calculando/
// neutral. Genuine insufficiency (<2 points) still shows construction. 30D/1Y/ALL unchanged (gated out).
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
  '_AURIX_VP_GAP_FLOOR_MS', '_AURIX_VP_GAP_MEDIAN_MULT', '_AURIX_EMG_RANGE_MS',
  '_AURIX_CHART_CONTINUITY_UNIFICATION', '_AURIX_CHART_RETURN_CONTRACT_UNIFICATION',
  '_AURIX_CHART_SHORT_HISTORY_DISPLAY', '_AURIX_CHART_SHORT_HISTORY_MIN_DAYS',
  '_AURIX_CHART_VISUAL_TRUST_GATE', '_AURIX_VTG_MIN_MAIN_PTS', '_AURIX_VTG_MIN_MAIN_SPAN_MS',
  '_AURIX_CHART_BOOTSTRAP_SUPPRESSION', '_AURIX_STABLE_BAND_LO', '_AURIX_STABLE_MIN_PTS',
  '_AURIX_STABLE_MIN_SPAN_MS', '_AURIX_STABLE_CONSTRUCTION_JUMP', '_AURIX_CHART_FINAL_RENDER_SERIES_CONTRACT',
  '_AURIX_CHART_CANONICAL_REFRESH_DETERMINISM', '_AURIX_CHART_7D_SINGLE_CONTINUOUS', '_AURIX_CHART_RELIABILITY_DEADLOCK_RESOLUTION',
  '_AURIX_PARTIAL_RETURN_MIN_PCT',
];
const FNS = [
  '_aurixRealGapFloorMs', '_aurixConfirmedBridgeGaps', '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks',
  '_aurixSplitAtGaps', '_aurixBuildContinuityValidatedSeries', '_aurixStructuralBreaks', '_aurixVerticalJumps',
  '_aurixRegimeBoundaryBreaks',   // SPEC RANGE_INVARIANT_GAP — FRC regime split
  '_aurixResolveChartReturnContract', '_aurixShortHistoryDisplay', '_aurixVisualTrustGate',
  '_aurixStableDisplayAnchor', '_aurixResolveReliabilityDeadlock', '_aurixResolveFinalRenderSeriesContract',
  '_aurixAuditReadySeriesVisibilityCore',
];
function mkCtx() {
  const ctx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date, Set, String, Object,
    buildProductionPortfolioChart: () => ({ points: [], state: 'pending' }) };
  vm.createContext(ctx);
  CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (e) { /* optional */ } });
  FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (e) { throw new Error('load ' + f + ': ' + e.message); } });
  return ctx;
}
const CTX = mkCtx();
const frc = (emg, range, surface) => vm.runInContext('_aurixResolveFinalRenderSeriesContract', CTX)(emg, range, surface || 'desktop');
const auditCore = (range, emg) => vm.runInContext('_aurixAuditReadySeriesVisibilityCore', CTX)(range, emg);
function seg(t0, n, stepMs, v0, dv) { const o = []; for (let i = 0; i < n; i++) o.push({ ts: t0 + i * stepMs, value: +(v0 + i * dv).toFixed(2) }); return o; }
function emgOf(points, over) {
  return Object.assign({
    range: '24h', state: 'ready', returnState: 'ok', reason: null, pendingReason: null,
    badgeReturnPct: 1.2, returnPct: 1.2, returnValue: 10, color: 'up',
    coverageRatio: 0.5, pointCount: points.length, finalPointCount: points.length, chartHash: 'h',
    baselineTs: points.length ? points[0].ts : null, baselineValue: points.length ? points[0].value : null,
    currentTs: points.length ? points[points.length - 1].ts : null, currentValue: points.length ? points[points.length - 1].value : null,
    historyTooShortForRange: true, displayedRangeState: 'partial_history', points: points,
  }, over || {});
}
const NOT_READY = { returnState: 'insufficient_return_history', badgeReturnPct: null, returnPct: null, color: 'flat' };
const subsetOf = (a, b) => a.every(p => b.some(q => q.ts === p.ts && q.value === p.value));

// ── 1) drawable 24H + return READY → line + % ──
console.log('\nCore visibility contract:');
{
  const pts = seg(T0, 12, 30 * MIN, 6000, 5);
  const r = frc(emgOf(pts, { range: '24h', returnState: 'ok', badgeReturnPct: 1.2 }), '24h');
  ok('1 drawable 24H + return ready → line + %', (r.mode === 'full' || r.mode === 'partial_clean') && r.renderPoints.length >= 2 && r.badgeEligible === true, JSON.stringify({ m: r.mode, n: r.renderPoints.length, be: r.badgeEligible }));
}
// ── 2) drawable 24H + return NOT ready (ramp, no_stable_tramo) → line visible + calculating badge ──
{
  const pts = seg(T0, 9, 15 * MIN, 100, 100);   // steep construction ramp 100..900 → no stable tramo
  const r = frc(emgOf(pts, { range: '24h', coverageRatio: 0.2, ...NOT_READY }), '24h');
  ok('2 drawable 24H + return NOT ready → LINE VISIBLE (mode partial_clean, ≥2 pts)', r.mode === 'partial_clean' && r.renderPoints.length >= 2, JSON.stringify({ m: r.mode, n: r.renderPoints.length, reason: r.reason }));
  ok('2 drawable 24H + return NOT ready → badge Calculando (independent)', r.badgeEligible === false && /Calculando/.test(r.badgeLabel));
  ok('2 diagnostics prove bootstrap said no_stable_tramo but line preserved', r.diagnostics.bootstrapLinePreserved === true && r.diagnostics.stableDisplayAnchor.mode === 'building');
}
// ── 3) drawable 7D single segment + return NOT ready → line visible ──
{
  const pts = seg(T0, 12, 20 * MIN, 100, 100);   // continuous ramp, single run, no stable tramo
  const r = frc(emgOf(pts, { range: '7d', coverageRatio: 0.05, ...NOT_READY }), '7d');
  ok('3 drawable 7D + return NOT ready → LINE VISIBLE', r.mode === 'partial_clean' && r.renderPoints.length >= 2, JSON.stringify({ m: r.mode, n: r.renderPoints.length, reason: r.reason }));
  ok('3 drawable 7D + return NOT ready → badge Calculando', r.badgeEligible === false);
}
// ── 4) fewer than two points → construction ──
{
  const r = frc(emgOf(seg(T0, 1, 0, 6000, 0), { range: '24h', ...NOT_READY }), '24h');
  ok('4 <2 points → construction (building/empty)', r.mode === 'building' || r.mode === 'empty', r.mode);
}
// ── 5) no authoritative continuous segment (24H: 2 tiny runs split by >6h gap, neither eligible) → construction ──
{
  const runA = seg(T0 - 11 * HOUR, 2, 4 * MIN, 500, 0);
  const runB = seg(T0, 2, 4 * MIN, 500, 0);       // flat so bootstrap finds a "tramo", then VTG kills tiny main
  const r = frc(emgOf(runA.concat(runB), { range: '24h', coverageRatio: 0.2, ...NOT_READY }), '24h');
  ok('5 no authoritative continuous segment → construction', r.mode === 'building', JSON.stringify({ m: r.mode, reason: r.reason }));
}
// ── 6) bootstrap prefix + valid recent run → recent run visible (existing SPEC.18 prefix-hide) ──
{
  const prefix = seg(T0 - 20 * HOUR, 4, 10 * MIN, 100, 0);       // low bootstrap prefix
  const recent = seg(T0 - 3 * HOUR, 12, 15 * MIN, 1000, 4);      // stable regime near current
  const r = frc(emgOf(prefix.concat(recent), { range: '24h', coverageRatio: 0.5, ...NOT_READY }), '24h');
  ok('6 bootstrap prefix + valid recent run → recent run visible', r.mode === 'partial_clean' && r.renderPoints.length >= 2 && r.renderPoints.every(p => p.value >= 800), JSON.stringify({ m: r.mode, min: Math.min.apply(null, r.renderPoints.map(p => p.value)) }));
}
// ── 7) genuine construction-only stays neutral is handled by <2 / VTG; 30D construction ramp still building ──
{
  const pts = seg(T0, 9, 15 * MIN, 100, 100);
  const r = frc(emgOf(pts, { range: '30d', coverageRatio: 0.05, ...NOT_READY }), '30d');
  ok('7/11 30D bootstrap no-stable → STILL building (30D unchanged, gate excludes it)', r.mode === 'building' && /bootstrap_suppression/.test(r.reason), JSON.stringify({ m: r.mode, reason: r.reason }));
  const r1y = frc(emgOf(pts, { range: '1y', coverageRatio: 0.01, ...NOT_READY }), '1y');
  ok('11 1Y bootstrap no-stable → STILL building (1Y unchanged)', r1y.mode === 'building');
}
// ── 8) SPEC RANGE_INVARIANT_GAP — 7D two SAME-LEVEL runs separated by a real observation gap → BOTH
//      segments render (multi-segment); the same-level gap is inactivity, not a regime change. (Was SPEC.45
//      single continuous segment; superseded for observation gaps — capital/value-cliff single-path kept.)
{
  const runA = seg(T0 - 6 * DAY, 6, 3 * HOUR, 6000, 2);
  const runB = seg(T0 - 20 * HOUR, 8, 2 * HOUR, 6100, 2);   // recent run, >6h gap before it, SAME level → observation gap
  const pts = runA.concat(runB);
  const r = frc(emgOf(pts, { range: '7d', returnState: 'ok', badgeReturnPct: 1.0, coverageRatio: 0.9 }), '7d');
  ok('8 7D observation-gap two-run → BOTH segments (renderPathCount 2, both runs kept)', r.renderPathCount === 2 && r.renderPoints.length === pts.length, JSON.stringify({ rpc: r.renderPathCount, n: r.renderPoints.length, expect: pts.length }));
}
// ── 9) point identities/hashes unchanged (renderPoints ⊂ input, no synthetic) ──
{
  const pts = seg(T0, 9, 15 * MIN, 100, 100);
  const r = frc(emgOf(pts, { range: '24h', coverageRatio: 0.2, ...NOT_READY }), '24h');
  ok('9 renderPoints ⊂ input, no fabricated point', subsetOf(r.renderPoints, pts) && r.diagnostics.syntheticPoints === 0);
}
// ── 10) desktop/mobile parity ──
{
  const pts = seg(T0, 9, 15 * MIN, 100, 100);
  const e = emgOf(pts, { range: '24h', coverageRatio: 0.2, ...NOT_READY });
  const d = frc(e, '24h', 'desktop'), m = frc(e, '24h', 'mobile');
  ok('10 desktop/mobile identical renderPoints', JSON.stringify(d.renderPoints) === JSON.stringify(m.renderPoints) && d.mode === m.mode);
}

// ── 12) audit contract ──
console.log('\nAudit contract:');
{
  const pts = seg(T0, 9, 15 * MIN, 100, 100);
  const a = auditCore('24h', emgOf(pts, { range: '24h', coverageRatio: 0.2, ...NOT_READY }));
  ok('A drawable-not-ready → painterDecision render_line, firstStateOverwriteStage none', a.painterDecision === 'render_line' && a.firstStateOverwriteStage === 'none', JSON.stringify({ pd: a.painterDecision, st: a.firstStateOverwriteStage }));
  ok('A bootstrap verdict surfaced, line preserved, return independently calculating', a.bootstrapVerdict === 'no_stable_tramo' && a.bootstrapLinePreserved === true && a.returnContractOutputState === 'calculating' && a.badgeEligible === false, JSON.stringify({ bv: a.bootstrapVerdict, lp: a.bootstrapLinePreserved, rc: a.returnContractOutputState }));
  ok('A frc output has points, painterReceivedPointCount ≥2', a.frcOutputPointCount >= 2 && a.painterReceivedPointCount >= 2 && a.frcInputPointCount === 9);
  ok('A audit serializable + spec.49', (() => { try { JSON.stringify(a); return true; } catch (_) { return false; } })() && a.spec === 'DSH.CHART.READY_SERIES_VISIBILITY.49');
}
{
  const a = auditCore('24h', emgOf(seg(T0, 1, 0, 6000, 0), { range: '24h', pointCount: 1, finalPointCount: 1, ...NOT_READY }));
  ok('B <2 points → firstStateOverwriteStage validate, owner buildProductionPortfolioChart', a.painterDecision === 'construction' && a.firstStateOverwriteStage === 'validate' && a.exactOwnerFunction === 'buildProductionPortfolioChart', JSON.stringify({ st: a.firstStateOverwriteStage, o: a.exactOwnerFunction }));
}
{
  const a = auditCore('30d', emgOf(seg(T0, 9, 15 * MIN, 100, 100), { range: '30d', coverageRatio: 0.05, ...NOT_READY }));
  ok('C 30D construction ramp → construction, owner _aurixStableDisplayAnchor (unchanged)', a.painterDecision === 'construction' && a.firstStateOverwriteStage === 'bootstrap_suppression' && a.exactOwnerFunction === '_aurixStableDisplayAnchor', JSON.stringify({ st: a.firstStateOverwriteStage, o: a.exactOwnerFunction }));
}

// ── source-level invariants ──
console.log('\nSource-level invariants:');
ok('SPEC.49 marker present', /READY_SERIES_VISIBILITY\.49/.test(app));
ok('fix gated to 24H + 7D only (30D/1Y/ALL unchanged)', /const _visRange = \(r === '24h' \|\| r === '7d'\);/.test(app));
ok('line preserved only for ≥2 points and not insufficient_points', /_drawable = _visRange && Array\.isArray\(work\) && work\.length >= 2 && sda\.reason !== 'insufficient_points'/.test(app));
ok('genuine insufficiency still collapses to building', /if \(!_drawable\) return building\(out, 'bootstrap_suppression:' \+ sda\.reason\);/.test(app));
ok('_aurixStableDisplayAnchor itself unchanged (still returns building verdict)', /out\.mode = 'building'; out\.points = \[\]; out\.reason = 'no_stable_tramo'/.test(app));
ok('audit registered read-only', /window\.aurixAuditReadySeriesVisibility\s*=/.test(app));
ok('SPEC.45 7D single-continuous still present + unchanged', /_AURIX_CHART_7D_SINGLE_CONTINUOUS !== 'undefined' && _AURIX_CHART_7D_SINGLE_CONTINUOUS\) && r === '7d' && work\.length >= 2/.test(app));
ok('painters draw exclusively frc.renderPoints (single owner)', /emg\.points = _frc\.renderPoints;/.test(app) && /emg\.points = _frcM\.renderPoints;/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
