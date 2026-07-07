'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-RUNTIME-SOAK-CROSS-RANGE-PROVENANCE-harness — SPEC DSH.CHART.RUNTIME_SOAK_...LAUNCH_GATE.23
// ════════════════════════════════════════════════════════════════════════════
// The final pre-launch chart gate is a READ-ONLY audit layer (no rendering change): three pure classifiers —
// _aurixClassifyCrossRangeSeriesProvenance (identical cross-range series = legitimate shared-history OR alias
// defect), _aurixAuditRenderPathGaps (real gap vs visual bridge from timestamps + path ownership),
// _aurixClassifyEvidenceTransition (same-settled-evidence flap vs legitimate evidence change) — plus the
// window.aurixChartRuntimeSoakAudit soak that composes them into a STABLE_LAUNCH_READY / NOT_LAUNCH_READY
// verdict. This harness unit-tests each classifier (both legitimate and defect branches) and asserts the
// soak is cost-bounded, read-only and leaves no timers.
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
const CONSTS = ['_AURIX_VP_GAP_FLOOR_MS', '_AURIX_VP_GAP_MEDIAN_MULT', '_AURIX_EMG_RANGE_MS', '_AURIX_BRIDGE_SEG_ENABLED',
  '_AURIX_BRIDGE_SEG_FRAC', '_AURIX_CAPITAL_STEP_SEG_ENABLED', '_AURIX_SPARSE_RAMP_SEG_ENABLED', '_AURIX_VJUMP_MIN_FRAC',
  '_AURIX_VJUMP_P95_MULT', '_AURIX_CAPSTEP_RATIO_LO', '_AURIX_CAPSTEP_RATIO_HI', '_AURIX_CAPSTEP_TS_PAD_MS',
  '_AURIX_SPARSE_RAMP_MULT', '_AURIX_SPARSE_RAMP_MIN_MS', '_AURIX_CHART_CONTINUITY_UNIFICATION'];
const GAP_FNS = ['_aurixEmergencyHash', '_aurixRealGapFloorMs', '_aurixConfirmedBridgeGaps', '_aurixVerticalJumps',
  '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks', '_aurixSplitAtGaps', '_aurixBuildContinuityValidatedSeries', '_aurixStructuralBreaks'];
const CORE_FNS = ['_aurixClassifyCrossRangeSeriesProvenance', '_aurixAuditRenderPathGaps', '_aurixClassifyEvidenceTransition'];
function mkCtx(withSplit) {
  const ctx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date, Set, Map };
  vm.createContext(ctx);
  CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (_) {} });
  GAP_FNS.forEach(f => {
    if (!withSplit && (f === '_aurixStructuralBreaks' || f === '_aurixSplitAtGaps')) return;   // simulate a renderer that does NOT segment
    try { vm.runInContext(fnSrc(f), ctx); } catch (_) {}
  });
  CORE_FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (e) { throw new Error('load ' + f + ': ' + e.message); } });
  return ctx;
}
const FULL = mkCtx(true), NOSPLIT = mkCtx(false);
const xrange = (ctx, list) => vm.runInContext('_aurixClassifyCrossRangeSeriesProvenance', ctx)(list);
const gaps = (ctx, pts, r) => vm.runInContext('_aurixAuditRenderPathGaps', ctx)(pts, r);
const trans = (ctx, a, b) => vm.runInContext('_aurixClassifyEvidenceTransition', ctx)(a, b);

function seg(t0, n, stepMs, v0, dv) { const o = []; for (let i = 0; i < n; i++) o.push({ ts: t0 + i * stepMs, value: +(v0 + i * dv).toFixed(2) }); return o; }
function C(range, hash, canon, realFirst, realLast, pts) {
  return { requestedRange: range, canonicalInputHash: canon, finalRenderHash: hash, renderPointCount: pts != null ? pts : 40,
    realFirstTs: realFirst, realLastTs: realLast, realSpanMs: (realLast != null && realFirst != null) ? realLast - realFirst : 0 };
}
// a settled 7D contract snapshot for transition tests
function snap(over) {
  return Object.assign({ canonicalInputHash: 'C1', finalRenderHash: 'R1', badgeLabel: '+0.14%', badgeEligible: true,
    colorClass: 'up', mode: 'partial_clean', renderPathCount: 1, returnAnchorTs: T0, deadlockResolution: 'PARTIAL', state: 'ready' }, over || {});
}

console.log('AURIX-CHART-RUNTIME-SOAK-CROSS-RANGE-PROVENANCE — SPEC.23');

// 1-6 — same settled evidence: NO_CHANGE when identical, SAME_EVIDENCE_REGRESSION on any field flap.
ok('1 identical settled snapshot → NO_CHANGE (stable)', trans(FULL, snap(), snap()) === 'NO_CHANGE');
ok('2 same input, colorClass flip → REGRESSION', trans(FULL, snap(), snap({ colorClass: 'down' })) === 'SAME_EVIDENCE_REGRESSION');
ok('3 same input, badge flip → REGRESSION', trans(FULL, snap(), snap({ badgeLabel: 'Calculando…', badgeEligible: false })) === 'SAME_EVIDENCE_REGRESSION');
ok('4 same input, mode flip → REGRESSION', trans(FULL, snap(), snap({ mode: 'full' })) === 'SAME_EVIDENCE_REGRESSION');
ok('5 same input, path-count flip → REGRESSION', trans(FULL, snap(), snap({ renderPathCount: 2 })) === 'SAME_EVIDENCE_REGRESSION');
ok('6 same input, anchor flip → REGRESSION', trans(FULL, snap(), snap({ returnAnchorTs: T0 + DAY })) === 'SAME_EVIDENCE_REGRESSION');

// 7 — 24H single continuous interval → gap audit pathCount 1, legitimate, no synthetic pairs added.
{
  const g = gaps(FULL, seg(T0, 48, 30 * MIN, 1000, 0.05), '24h');
  ok('7 clean 24H → pathCount 1, LEGITIMATE, no bridge', g.pathCount === 1 && g.classification === 'LEGITIMATE_CONTINUOUS_REAL_INTERVAL' && g.bridgedDiscontinuousGapCount === 0);
  ok('8 gap audit adds no points (pairs == n-1)', g.pairs.length === 47);
}

// 9 — cross-range classifier is surface-independent (pure over contract fields; identical result any surface).
{
  const list = [C('7d', 'H', 'C', T0, T0 + 4 * DAY), C('30d', 'H', 'C', T0, T0 + 4 * DAY)];
  ok('9 classifier pure/surface-independent (same list → same verdict)', JSON.stringify(xrange(FULL, list)) === JSON.stringify(xrange(FULL, list.slice())));
}

// 10 — legitimate 7D/30D/1Y/ALL SAME available history (short-history account) → NOT a defect.
{
  const list = [C('7d', 'H', 'C', T0, T0 + 4 * DAY), C('30d', 'H', 'C', T0, T0 + 4 * DAY), C('1y', 'H', 'C', T0, T0 + 4 * DAY), C('all', 'H', 'C', T0, T0 + 4 * DAY)];
  const res = xrange(FULL, list);
  ok('10 same-available-history → CROSS_RANGE_CLEAN', res.verdict === 'CROSS_RANGE_CLEAN' && res.defects.length === 0);
  ok('10 every identical pair classified SAME_AVAILABLE_HISTORY_LEGITIMATE', res.pairs.every(p => p.classification === 'SAME_AVAILABLE_HISTORY_LEGITIMATE'));
}

// 11 — accidental cross-range alias (24H identical to a 4-day 7D) → CROSS_RANGE_ALIAS_DEFECT.
{
  const list = [C('24h', 'H', 'C', T0, T0 + 4 * DAY), C('7d', 'H', 'C', T0, T0 + 4 * DAY)];
  const res = xrange(FULL, list);
  ok('11 24H aliasing a 4-day series → CROSS_RANGE_ALIAS_DEFECT', res.verdict === 'CROSS_RANGE_DEFECT' && res.pairs[0].classification === 'CROSS_RANGE_ALIAS_DEFECT', JSON.stringify(res.pairs));
}

// 11b — identical hash but different real interval / canonical input → SUSPECT (not silently accepted).
{
  const list = [C('7d', 'H', 'C', T0, T0 + 3 * DAY), C('30d', 'H', 'C', T0, T0 + 4 * DAY)];
  const res = xrange(FULL, list);
  ok('11b identical hash, different real interval → ALIAS_SUSPECT', res.pairs[0].classification === 'CROSS_RANGE_ALIAS_SUSPECT', res.pairs[0].classification);
}

// 12 — click-order dependency (same range+input, different finalRenderHash) → REGRESSION.
{
  const orderA = snap({ finalRenderHash: 'RA' }), orderB = snap({ finalRenderHash: 'RB' });
  ok('12 same input, order-dependent render hash → REGRESSION', trans(FULL, orderA, orderB) === 'SAME_EVIDENCE_REGRESSION');
}

// 13 — reverse click-order stability: the classification of an unordered pair is order-independent.
{
  const a = C('7d', 'H', 'C', T0, T0 + 4 * DAY), b = C('30d', 'H', 'C', T0, T0 + 4 * DAY);
  const fwd = xrange(FULL, [a, b]).pairs[0].classification;
  const rev = xrange(FULL, [b, a]).pairs[0].classification;
  ok('13 reverse-order → identical pair classification', fwd === rev && fwd === 'SAME_AVAILABLE_HISTORY_LEGITIMATE');
}

// 14 — a renderer that does NOT segment a real discontinuity → VISUAL_BRIDGE_DEFECT (detected from ts + path).
{
  const pts = seg(T0, 10, 12 * MIN, 1000, 0.1).concat(seg(T0 + 22 * HOUR, 10, 12 * MIN, 1002, 0.1));   // 22h real gap
  const g = gaps(NOSPLIT, pts, '24h');   // no structural-break helper ⇒ one path ⇒ the gap is bridged
  ok('14 unsegmented real discontinuity → VISUAL_BRIDGE_DEFECT', g.classification === 'VISUAL_BRIDGE_DEFECT' && g.bridgedDiscontinuousGapCount >= 1, g.classification + ' bridged=' + g.bridgedDiscontinuousGapCount);
}

// 15 — the SAME discontinuity, correctly segmented by the real renderer → LEGITIMATE (not a bridge).
{
  const pts = seg(T0, 10, 12 * MIN, 1000, 0.1).concat(seg(T0 + 22 * HOUR, 10, 12 * MIN, 1002, 0.1));
  const g = gaps(FULL, pts, '24h');
  ok('15 segmented discontinuity → pathCount ≥ 2, no bridge, LEGITIMATE', g.pathCount >= 2 && g.bridgedDiscontinuousGapCount === 0 && g.classification === 'LEGITIMATE_CONTINUOUS_REAL_INTERVAL', 'paths=' + g.pathCount);
  ok('15b large-but-below-threshold same-path gap stays within threshold', g.maxSamePathDtMs < g.gapThresholdMs);
}

// 16 — 7D PARTIAL → Calculando on SAME settled evidence → REGRESSION (the reported oscillation, if real).
ok('16 7D PARTIAL→Calculando, same canonical input → SAME_EVIDENCE_REGRESSION',
   trans(FULL, snap(), snap({ badgeLabel: 'Calculando…', badgeEligible: false, colorClass: 'flat', deadlockResolution: 'BUILDING', state: 'calculating', finalRenderHash: 'R2' })) === 'SAME_EVIDENCE_REGRESSION');

// 17 — 7D transition AFTER a genuine evidence revision (canonical input changed) → LEGITIMATE.
ok('17 7D transition after canonical revision → EVIDENCE_CHANGED_LEGITIMATE',
   trans(FULL, snap(), snap({ canonicalInputHash: 'C2', badgeLabel: 'Calculando…', badgeEligible: false, deadlockResolution: 'BUILDING', state: 'calculating' })) === 'EVIDENCE_CHANGED_LEGITIMATE');

// 18 — genuine BUILDING stays truthful/stable across identical evidence.
{
  const b = snap({ badgeLabel: 'Calculando…', badgeEligible: false, colorClass: 'flat', mode: 'building', renderPathCount: 0, deadlockResolution: 'BUILDING', state: 'calculating', canonicalInputHash: 'CB', finalRenderHash: 'RB' });
  ok('18 building repeated (same evidence) → NO_CHANGE', trans(FULL, b, b) === 'NO_CHANGE');
}

// 19 — mature FULL: distinct real series per range → DIFFERENT_SERIES_EXPECTED (no false alias).
{
  const list = [C('7d', 'H7', 'C7', T0, T0 + 7 * DAY), C('30d', 'H30', 'C30', T0 - 20 * DAY, T0 + 7 * DAY)];
  const res = xrange(FULL, list);
  ok('19 mature distinct series → DIFFERENT_SERIES_EXPECTED, clean', res.pairs[0].classification === 'DIFFERENT_SERIES_EXPECTED' && res.verdict === 'CROSS_RANGE_CLEAN');
}

// 21 — ALL vs a finite range: identical only when the shared interval fits the finite window too (legit).
{
  const legit = xrange(FULL, [C('all', 'H', 'C', T0, T0 + 4 * DAY), C('7d', 'H', 'C', T0, T0 + 4 * DAY)]);
  ok('21 ALL≡7D on 4-day history → SAME_AVAILABLE_HISTORY_LEGITIMATE', legit.pairs[0].classification === 'SAME_AVAILABLE_HISTORY_LEGITIMATE');
  const defect = xrange(FULL, [C('all', 'H', 'C', T0, T0 + 40 * DAY), C('7d', 'H', 'C', T0, T0 + 40 * DAY)]);
  ok('21b ALL≡7D on 40-day history → ALIAS_DEFECT (7D should have clipped)', defect.pairs[0].classification === 'CROSS_RANGE_ALIAS_DEFECT');
}

// 8/20 — invariants: pure, no synthetic, SPEC.19 chokepoint untouched, no rendering flag introduced.
console.log('\nInvariants + source-level (Phase A audit-only):');
ok('20 SPEC.19 remains the SOLE final render chokepoint', (app.match(/function _aurixResolveFinalRenderSeriesContract\(/g) || []).length === 1);
ok('20b SPEC.23 introduces NO rendering-gating flag (audit-only)', !/_AURIX_CHART_RUNTIME_SOAK\w*\s*=\s*(true|false)/.test(app));
ok('8b classifiers never fabricate points (gap pairs strictly n-1)', (function () { const g = gaps(FULL, seg(T0, 20, HOUR, 1000, 1), '7d'); return g.pairs.length === 19 && g.pairs.every(p => Number.isFinite(p.dtMs)); })());

const soakSrc = (function () { const i = app.indexOf('window.aurixChartRuntimeSoakAudit = function'); return i < 0 ? '' : braceSlice(app.indexOf('{', i)); })();
ok('S1 soak audit defined + returns a Promise', soakSrc.length > 0 && /return new Promise\(/.test(soakSrc));
ok('22 soak clears its interval (no timer left behind)', /clearInterval\(timer\)/.test(soakSrc) && /done = true/.test(soakSrc));
ok('23 soak bounds sample count (MAX_SAMPLES cap)', /MAX_SAMPLES/.test(soakSrc) && /Math\.min\(600/.test(soakSrc));
ok('24 soak does NOT fan out network (no fetch/refetch; reuses buildProductionPortfolioChart)', !/fetch\(|aurixLoadBackendSnapshots|_aurixFetchBackendSnapshots|loadPortfolioFromBackend/.test(soakSrc) && /buildProductionPortfolioChart\(r\)/.test(soakSrc));
ok('24b soak builds ONE chart per range per tick (not per surface)', /RANGES\.forEach\(r => \{[\s\S]{0,400}buildProductionPortfolioChart\(r\)/.test(soakSrc) && /SURFACES\.forEach\(s =>/.test(soakSrc));
ok('S2 soak is read-only (no writes to points/source/innerHTML)', !/\.innerHTML|emg\.points\s*=|categoryHistory\s*=[^=]|_aurixBackendSnapshots\s*=[^=]/.test(soakSrc));
ok('S3 launch verdict codes present', /STABLE_LAUNCH_READY/.test(soakSrc) && /NOT_LAUNCH_READY/.test(soakSrc));
['SAME_INPUT_RENDER_FLAP', 'SAME_INPUT_COLOR_FLAP', 'SAME_INPUT_BADGE_FLAP', 'SAME_INPUT_MODE_FLAP', 'SAME_INPUT_PATH_FLAP', 'SAME_INPUT_ANCHOR_FLAP', 'PARTIAL_CALCULATING_OSCILLATION', 'CROSS_RANGE_ALIAS_DEFECT', 'VISUAL_BRIDGE_DEFECT', 'DESKTOP_MOBILE_DIVERGENCE', 'SYNTHETIC_POINT_REGRESSION'].forEach(code =>
  ok('S4 soak detects ' + code, new RegExp(code).test(soakSrc)));
ok('S5 soak exposes cross-range matrix + 7D transitions', /crossRangeMatrix/.test(soakSrc) && /sevenDayTransitions/.test(soakSrc));
ok('S6 SPEC.23 marker present', /SPEC DSH\.CHART\.RUNTIME_SOAK_CROSS_RANGE_PROVENANCE_LAUNCH_GATE\.23/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
