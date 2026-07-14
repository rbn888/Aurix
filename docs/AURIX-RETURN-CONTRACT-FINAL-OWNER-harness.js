'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-RETURN-CONTRACT-FINAL-OWNER-harness — SPEC DSH.CHART.24H_RETURN_CONTRACT_FINAL_OWNER.50
// ════════════════════════════════════════════════════════════════════════════
// v542 preserves the line (SPEC.49) but 24H return stayed insufficient_return_history. ROOT CAUSE: SPEC.48's
// post-construction recent-run baseline ran ONLY inside historyTooShortForRange (window coverage <0.8). A 24H
// series with a construction/import prefix but ≥80% window coverage therefore never evaluated its
// post-construction candidate — the construction-contaminated full-range baseline suppressed the return.
// SPEC.50 decouples baseline-REGIME selection from window COVERAGE: run the recent-run anchoring whenever a
// real prefix exists (runStartIdx>0) OR the window is short. Every financial predicate still gates publication.
// 7D keeps its OWN elapsed-coverage policy (≥2 real days) and never inherits 24H rules. Audit:
// window.aurixAuditReturnContractDecision('24h'|'7d').
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

const MIN = 60000, HOUR = 36e5, DAY = 864e5, T0 = 1_800_000_000_000;
const CONSTS = ['_AURIX_PARTIAL_RETURN_MIN_PCT', '_AURIX_EMG_RANGE_MS', '_AURIX_RET_SANE_PCT',
  '_AURIX_24H_PARTIAL_MIN_COVERAGE', '_AURIX_24H_PARTIAL_MIN_POINTS', '_AURIX_24H_ENDPOINT_FRESH_MS', '_AURIX_24H_MAX_INTERNAL_GAP_MS'];
const FNS = ['_aurix24hReturnReadiness', '_aurixSplitAtGaps', '_aurix24hRecentRunAnchor', '_aurixAuditReturnContractDecisionCore'];
function mkCtx() {
  const ctx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date, Set, String, Object,
    buildProductionPortfolioChart: () => ({ points: [], state: 'pending' }) };
  vm.createContext(ctx);
  CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (e) { /* optional */ } });
  ctx._aurixStructuralBreaks = function (points) { const b = []; for (let i = 1; i < points.length; i++) { if (points[i].time - points[i - 1].time > 6 * HOUR) b.push({ start: points[i - 1].time, end: points[i].time }); } return { breaks: b }; };
  FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (e) { throw new Error('load ' + f + ': ' + e.message); } });
  return ctx;
}
const CTX = mkCtx();
const anchorOf = pts => vm.runInContext('_aurix24hRecentRunAnchor', CTX)(pts);
const audit = (range, emg) => vm.runInContext('_aurixAuditReturnContractDecisionCore', CTX)(range, emg);
const readiness = ev => vm.runInContext('_aurix24hReturnReadiness', CTX)(ev);
const colorFor = pct => (Number.isFinite(pct) ? (pct > 0.05 ? 'positive' : (pct < -0.05 ? 'negative' : 'neutral')) : 'neutral');
const run = (endTs, n, spanMs, base, driftPct) => { const o = []; for (let i = 0; i < n; i++) o.push({ ts: endTs - spanMs + Math.round(i * spanMs / (n - 1)), value: +(base * (1 + (driftPct / 100) * (i / (n - 1)))).toFixed(2) }); return o; };

// ── faithful mirror of the SPEC.50 builder gate: recent-run anchoring runs whenever a prefix exists OR the
//    window is short (was: coverage<0.8 ONLY). ──
function gateEntered(pts, coverageRatio) {
  const a = anchorOf(pts);
  const historyTooShort = coverageRatio < 0.8;
  const hasPrefix = a.runStartIdx > 0;
  return { post: historyTooShort || hasPrefix, old: historyTooShort, runStartIdx: a.runStartIdx };
}

// ── 1) THE CONTRADICTION — prefix series at ≥80% coverage now evaluates its post-construction candidate ──
console.log('\nCoverage-gate decoupling:');
{
  // construction prefix @ ~20h ago (5 pts) + 6.87h gap + recent run last ~11h → window span 20h → coverage 0.833
  const prefix = run(T0 - 20 * HOUR, 5, 20 * MIN, 2427.97, 2);
  const recent = run(T0, 114, 11 * HOUR, 5900, 2.3);
  const pts = prefix.concat(recent);
  const cov = +(((pts[pts.length - 1].ts - pts[0].ts) / DAY).toFixed(4));   // full-range coverage
  const g = gateEntered(pts, cov);
  ok('1 full-range coverage ≥0.8 (window looks "full")', cov >= 0.8, 'cov=' + cov);
  ok('1 OLD gate (coverage<0.8 only) would NOT evaluate candidate', g.old === false);
  ok('1 SPEC.50 gate DOES evaluate candidate (prefix present)', g.post === true && g.runStartIdx === 5, JSON.stringify(g));
}
{
  // mature 24H, single run, no prefix, coverage 0.9 → gate NOT entered (unchanged, per drives)
  const pts = run(T0, 60, 21.6 * HOUR, 6000, 3);
  const cov = +(((pts[pts.length - 1].ts - pts[0].ts) / DAY).toFixed(4));
  const g = gateEntered(pts, cov);
  ok('2 mature no-prefix 24H → gate NOT entered (byte-identical mature path)', g.post === false && g.runStartIdx === 0, JSON.stringify({ cov: cov, g: g }));
}

// ── audit fixtures ──
const emg24 = over => Object.assign({
  range: '24h', state: 'ready', points: [], __auditNowRef: T0 + MIN,
  returnState: 'ok', returnPct: 2.3, badgeReturnPct: 2.3, coverageRatio: 0.83,
  historyTooShortForRange: false, displayedRangeState: 'partial_history', partial24hPublished: true,
  baselineTs: null, baselineValue: null, currentValue: null,
}, over || {});
function anchorFor(pts, over) {
  const a = anchorOf(pts); const first = pts[a.runStartIdx], last = pts[pts.length - 1];
  return Object.assign({
    bootstrapFlagSource: 'recent_continuous_run_regime', runStartIdx: a.runStartIdx, runCount: a.runCount,
    bootstrapSnapshotCount: a.bootstrapSnapshotCount, postBootstrapPointCount: a.postBootstrapPointCount,
    constructionEndTimestamp: a.constructionEndTimestamp,
    acceptedBaselineRegime: a.postBootstrapPointCount < 8 ? 'construction' : (a.runStartIdx > 0 ? 'post_construction' : 'investable'),
    acceptedBaselineTs: first.ts, acceptedBaselineValue: first.value,
    baselineToCurrentPct: +(((last.value - first.value) / first.value) * 100).toFixed(4),
    recentRunReturnState: 'ok', recentRunReturnPct: 2.3,
    recentRunCoverageRatio: +(((last.ts - first.ts) / DAY).toFixed(4)), recentRunLargestGapMs: a.largestGapMsInRun,
    bootstrapExitEligible: true, bootstrapExitRejectionReason: null,
  }, over || {});
}

console.log('\nAudit — predicate ownership:');
// (A) PRE-fix contradiction: valid candidate suppressed (returnState insufficient while all predicates pass)
{
  const prefix = run(T0 - 20 * HOUR, 5, 20 * MIN, 2427.97, 2);
  const recent = run(T0, 114, 11 * HOUR, 5900, 2.3);
  const pts = prefix.concat(recent);
  const emg = emg24({ points: pts, returnState: 'insufficient_return_history', returnPct: null, badgeReturnPct: null,
    partial24hPublished: false, displayedRangeState: 'partial_history', partial24hAnchor: anchorFor(pts) });
  const a = audit('24h', emg);
  ok('A contradiction detected: publishableNow true but currentReturnState insufficient', a.publishableNow === true && a.currentReturnState === 'insufficient_return_history' && a.validCandidateSuppressed === true, JSON.stringify({ p: a.publishableNow, cur: a.currentReturnState, vcs: a.validCandidateSuppressed, ff: a.firstFailedPredicate }));
  ok('A no failed predicate; baseline is post-construction recent run (not 2427.97)', a.firstFailedPredicate === null && a.baselineRegime === 'post_construction' && a.baselineValue !== 2427.97);
}
// (B) POST-fix published: candidate published, no contradiction
{
  const prefix = run(T0 - 20 * HOUR, 5, 20 * MIN, 2427.97, 2);
  const recent = run(T0, 114, 11 * HOUR, 5900, 2.3);
  const pts = prefix.concat(recent);
  const emg = emg24({ points: pts, returnState: 'ok', partial24hPublished: true, partial24hAnchor: anchorFor(pts) });
  const a = audit('24h', emg);
  ok('B published → publishableNow true, validCandidateSuppressed false, currentReturnState ok', a.publishableNow === true && a.validCandidateSuppressed === false && a.currentReturnState === 'ok');
  ok('B firstFailedPredicate null, exactReason return_published', a.firstFailedPredicate === null && a.exactReason === 'return_published');
}
// (3) valid 7D coverage → publishable
{
  const pts = run(T0, 60, 5 * DAY, 6000, 3);   // 5 real days ≥ 2d policy, single run
  const emg = { range: '7d', state: 'ready', points: pts, __auditNowRef: T0 + MIN, returnState: 'ok', returnPct: 3.0,
    badgeReturnPct: 3.0, coverageRatio: 0.71, baselineTs: pts[0].ts, baselineValue: pts[0].value, currentValue: pts[pts.length - 1].value, displayedRangeState: 'partial_history' };
  const a = audit('7d', emg);
  ok('3 valid 7D (≥2 real days, per ok) → publishableNow true', a.publishableNow === true && a.firstFailedPredicate === null, JSON.stringify({ p: a.publishableNow, ff: a.firstFailedPredicate }));
}
// (4) 7D insufficient coverage → return hidden (legitimate; its OWN policy, not 24H)
{
  const pts = run(T0, 40, 20 * HOUR, 6000, 1);   // <1 real day → < 2d 7D policy; per was trusted but coverage-suppressed
  const emg = { range: '7d', state: 'ready', points: pts, __auditNowRef: T0 + MIN, returnState: 'insufficient_return_history',
    returnPct: null, badgeReturnPct: null, coverageRatio: 0.12, baselineTs: pts[0].ts, baselineValue: pts[0].value, currentValue: pts[pts.length - 1].value,
    partialReturnTrusted: true, partialReturnPct: 1.0 };   // SPEC.22: trusted per, suppressed for coverage
  const a = audit('7d', emg);
  ok('4 7D insufficient coverage → NOT publishable, firstFailedPredicate elapsed_coverage_ok (honest)', a.publishableNow === false && a.firstFailedPredicate === 'elapsed_coverage_ok' && a.firstFailedOwner === '_aurix24hReturnReadiness', JSON.stringify({ p: a.publishableNow, ff: a.firstFailedPredicate }));
  ok('4 7D does NOT inherit 24H coverage rule (required ≥2d, not ≥0.25)', /realSpanDays/.test(a.predicates.find(p => p.name === 'elapsed_coverage_ok').actual));
}
// (5) construction/import prefix excluded from baseline (post-construction regime)
{
  const prefix = run(T0 - 20 * HOUR, 5, 20 * MIN, 2427.97, 2);
  const recent = run(T0, 30, 11 * HOUR, 5900, 2.3);
  const pts = prefix.concat(recent);
  const a = audit('24h', emg24({ points: pts, partial24hAnchor: anchorFor(pts) }));
  ok('5 construction prefix excluded → baseline = recent run, construction_import_excluded passes', a.baselineRegime === 'post_construction' && a.predicates.find(p => p.name === 'construction_import_excluded').passed === true && a.baselineValue >= 5000);
}
// (6) untrusted deposit → cashflow_trusted fails
{
  const prefix = run(T0 - 20 * HOUR, 5, 20 * MIN, 2427.97, 2);
  const recent = run(T0, 30, 11 * HOUR, 5900, 2.3);
  const pts = prefix.concat(recent);
  const a = audit('24h', emg24({ points: pts, returnState: 'insufficient_return_history', partial24hPublished: false,
    partial24hAnchor: anchorFor(pts, { recentRunReturnState: 'insufficient_return_history', recentRunReturnPct: null }) }));
  ok('6 untrusted deposit (per not ok) → cashflow_trusted fails, not publishable', a.publishableNow === false && a.firstFailedPredicate === 'cashflow_trusted' && a.firstFailedOwner === '_aurixComputePeriodReturn');
}
// (7) trusted flow-neutralized deposit → only market return (recent run) publishable
{
  const prefix = run(T0 - 18 * HOUR, 8, 3 * HOUR, 2450, 0.4);
  const recent = run(T0, 20, 10 * HOUR, 6000, 0.6);   // post-deposit market
  const pts = prefix.concat(recent);
  const a = audit('24h', emg24({ points: pts, partial24hAnchor: anchorFor(pts, { recentRunReturnPct: 0.6 }) }));
  ok('7 trusted deposit → market return over post-deposit run, publishable', a.publishableNow === true && a.flowAdjustedReturnPct === 0.6 && a.baselineValue >= 5000);
}
// (8) stale endpoint → endpoint_fresh fails
{
  const prefix = run(T0 - 20 * HOUR, 5, 20 * MIN, 2427.97, 2);
  const recent = run(T0 - 3 * HOUR, 30, 11 * HOUR, 5900, 2.3);   // last point 3h old
  const pts = prefix.concat(recent);
  const a = audit('24h', emg24({ points: pts, __auditNowRef: T0 + MIN, partial24hAnchor: anchorFor(pts) }));   // now = T0+1min, last = T0-3h
  ok('8 stale endpoint (>90min) → endpoint_fresh fails', a.publishableNow === false && a.firstFailedPredicate === 'endpoint_fresh', JSON.stringify({ ff: a.firstFailedPredicate, fresh: a.endpointFreshnessMinutes }));
}
// (9) colors — positive / negative / zero
{
  const mk = drift => { const prefix = run(T0 - 20 * HOUR, 5, 20 * MIN, 2450, 1); const recent = run(T0, 30, 11 * HOUR, 6000, drift); const pts = prefix.concat(recent); return audit('24h', emg24({ points: pts, returnPct: drift, badgeReturnPct: drift, partial24hAnchor: anchorFor(pts, { recentRunReturnPct: drift }) })); };
  ok('9 positive → publishable + green', (() => { const a = mk(2.5); return a.publishableNow && colorFor(a.flowAdjustedReturnPct) === 'positive'; })());
  ok('9 negative → publishable + red', (() => { const a = mk(-2.5); return a.publishableNow && colorFor(a.flowAdjustedReturnPct) === 'negative'; })());
  ok('9 zero → publishable + neutral', (() => { const a = mk(0); return a.publishableNow && colorFor(a.flowAdjustedReturnPct) === 'neutral'; })());
}
// (10) audit serializable + spec
{
  const a = audit('24h', emg24({ points: run(T0, 20, 11 * HOUR, 6000, 2), partial24hAnchor: anchorFor(run(T0, 20, 11 * HOUR, 6000, 2)) }));
  ok('10 audit serializable + predicates ordered array', (() => { try { JSON.stringify(a); return true; } catch (_) { return false; } })() && Array.isArray(a.predicates) && a.predicates.length >= 8 && a.spec === 'DSH.CHART.24H_RETURN_CONTRACT_FINAL_OWNER.50');
}

// ── source-level invariants ──
console.log('\nSource-level invariants:');
ok('SPEC.50 marker present', /24H_RETURN_CONTRACT_FINAL_OWNER\.50/.test(app));
const buildSrc = fnSrc('buildProductionPortfolioChart');
ok('11 recent-run anchor computed BEFORE the gate (both regimes)', /let _rr24 = null;[\s\S]{0,260}const _has24hPrefix = !!\(_rr24 && _rr24\.runStartIdx > 0\);/.test(buildSrc));
ok('11 gate decoupled from coverage: (historyTooShortForRange || _has24hPrefix)', /if \(r === '24h' && \(out\.historyTooShortForRange \|\| _has24hPrefix\)\) \{/.test(buildSrc));
ok('12 post-construction partial marked partial_history even at ≥0.8 coverage', /out\.displayedRangeState = \(out\.historyTooShortForRange \|\| out\.partial24hPublished\) \? 'partial_history'/.test(buildSrc));
ok('10 no downstream overwrite: returnState-ok block guarded by !partial24hPublished', /if \(out\.returnState === 'ok'\) \{[\s\S]{0,400}if \(!out\.partial24hPublished\) \{/.test(buildSrc));
ok('13 7D/30D/1Y suppression branch untouched (else if per.returnState ok)', /\} else if \(out\.historyTooShortForRange && per\.returnState === 'ok'\) \{/.test(buildSrc));
ok('13 gate is 24H-only (7D/30D/1Y/ALL not routed through recent-run anchoring)', /if \(r === '24h' && \(out\.historyTooShortForRange \|\| _has24hPrefix\)\)/.test(buildSrc) && !/if \(r === '7d' && \(out\.historyTooShortForRange \|\| _has/.test(buildSrc));
ok('12 SPEC.49 line visibility gate unchanged (bootstrap_no_stable_tramo_line_preserved present)', /bootstrap_no_stable_tramo_line_preserved/.test(app));
ok('audit registered read-only', /window\.aurixAuditReturnContractDecision\s*=/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
