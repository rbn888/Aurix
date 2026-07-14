'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-24H-RETURN-READINESS-harness — SPEC DSH.CHART.24H_RETURN_READINESS.46 + 24H_BOOTSTRAP_EXIT.48
// ════════════════════════════════════════════════════════════════════════════
// .46: after many real hours a fresh account's 24H stayed neutral + "Historial parcial" — the coverage gate
// suppressed the return and the SPEC.22 partial-promotion excludes 24H. Fixed with _aurix24hReturnReadiness.
// .47: the .46 bootstrap predicate keyed on rangeCollapsedBecauseHistoryTooShort — a COVERAGE fact that is
// TRUE for ANY partial 24H — so every mature partial 24H was permanently BOOTSTRAP_ONLY_HISTORY. Fixed by
// anchoring the 24H RETURN on the most-recent continuous run (post-construction, the SAME run the FRC draws):
// the construction/import prefix + pre-real-regime outage are excluded from the RETURN (a recorded deposit
// shows only post-deposit market return); the visible line / points are byte-identical. The flow-neutral
// engine stays the financial-validity arbiter, so a large construction/import jump is never published.
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
const FNS = ['_aurix24hReturnReadiness', '_aurixSplitAtGaps', '_aurix24hRecentRunAnchor', '_aurixAudit24hReturnReadinessCore'];
function mkCtx() {
  const ctx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date, Set,
    buildProductionPortfolioChart: () => ({ points: [] }) };
  vm.createContext(ctx);
  CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (e) { console.log('  (const load fail ' + c + ': ' + e.message + ')'); } });
  // faithful structural-break stub: a break wherever a real temporal gap > 6h separates two points
  // (matches the production behaviour the recent-run anchor relies on — bridge/real-gap segmentation).
  ctx._aurixStructuralBreaks = function (points) { const b = []; for (let i = 1; i < points.length; i++) { if (points[i].time - points[i - 1].time > 6 * HOUR) b.push({ start: points[i - 1].time, end: points[i].time }); } return { breaks: b }; };
  FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (e) { console.log('  (fn load fail ' + f + ': ' + e.message + ')'); } });
  return ctx;
}
const CTX = mkCtx();
const readiness = ev => vm.runInContext('_aurix24hReturnReadiness', CTX)(ev);
const anchorOf = pts => vm.runInContext('_aurix24hRecentRunAnchor', CTX)(pts);
const audit = (emg, now) => vm.runInContext('_aurixAudit24hReturnReadinessCore', CTX)(emg, now);
const colorFor = pct => (Number.isFinite(pct) ? (pct > 0.05 ? 'positive' : (pct < -0.05 ? 'negative' : 'neutral')) : 'neutral');
const MINPTS = 8, SANE24 = 25;
// build n points spanning spanMs ending at endTs, ramping value base→base*(1+drift%)
const run = (endTs, n, spanMs, base, driftPct) => { const o = []; for (let i = 0; i < n; i++) o.push({ ts: endTs - spanMs + Math.round(i * spanMs / (n - 1)), value: +(base * (1 + (driftPct / 100) * (i / (n - 1)))).toFixed(2) }); return o; };

// faithful mirror of the builder's SPEC.48 24H decision (anchor → regime → readiness), fed the flow-neutral
// engine's verdict (per24State/per24Pct) as a trusted input (the engine is tested elsewhere).
function builderDecide(pts, per24State, per24Pct, netFlows, freshMs) {
  const a = anchorOf(pts);
  const first24 = pts[a.runStartIdx];
  const last = pts[pts.length - 1];
  const covRun = +(((last.ts - first24.ts) / DAY).toFixed(4));
  let gapRun = a.runStartIdx > 0 ? a.largestGapMsInRun : 0;
  if (a.runStartIdx === 0) { for (let i = 1; i < pts.length; i++) { const d = pts[i].ts - pts[i - 1].ts; if (d > gapRun) gapRun = d; } }
  const postCount = a.postBootstrapPointCount;
  const regime = (postCount < MINPTS) ? 'construction' : (a.runStartIdx > 0 ? 'post_construction' : 'investable');
  const rd = readiness({ coverageRatio: covRun, pointCount: postCount, endpointFreshnessMs: (freshMs == null ? 5 * MIN : freshMs),
    largestGapMs: gapRun, baselineIsOriginal: (first24.value > 0), currentValueAvailable: (last.value > 0),
    financialConfidenceOk: (per24State === 'ok'), returnPct: per24Pct, bootstrapOnly: (regime === 'construction') });
  return { a, first24, last, covRun, gapRun, postCount, regime, rd, publishable: !!rd.publishable };
}

// ── 1) readiness resolver (SPEC.46 behavioural cases — bootstrap gate now regime-fed) ──
console.log('\nReadiness resolver:');
const ev = o => Object.assign({ coverageRatio: 0.5, pointCount: 24, endpointFreshnessMs: 10 * MIN, largestGapMs: 20 * MIN, baselineIsOriginal: true, currentValueAvailable: true, financialConfidenceOk: true, returnPct: 1.24, bootstrapOnly: false }, o);
ok('1 short coverage → INSUFFICIENT_ELAPSED_COVERAGE', readiness(ev({ coverageRatio: 0.10 })).reasonCode === 'INSUFFICIENT_ELAPSED_COVERAGE');
ok('2 sufficient partial → publishable', readiness(ev({ coverageRatio: 0.50 })).publishable === true);
ok('4 many points + tiny elapsed → not publishable', readiness(ev({ pointCount: 400, coverageRatio: 0.05 })).publishable === false);
ok('5 stale endpoint → STALE_ENDPOINT', readiness(ev({ endpointFreshnessMs: 3 * HOUR })).reasonCode === 'STALE_ENDPOINT');
ok('6 untrusted cashflow → FINANCIAL_CONFIDENCE_UNTRUSTED', readiness(ev({ financialConfidenceOk: false })).reasonCode === 'FINANCIAL_CONFIDENCE_UNTRUSTED');
ok('domain floor -100 → RETURN_OUTSIDE_SUPPORTED_DOMAIN', readiness(ev({ returnPct: -100 })).reasonCode === 'RETURN_OUTSIDE_SUPPORTED_DOMAIN');
ok('bootstrap regime → BOOTSTRAP_ONLY_HISTORY', readiness(ev({ bootstrapOnly: true })).reasonCode === 'BOOTSTRAP_ONLY_HISTORY');
ok('interior 8h hole → DISCONTINUOUS_INTERVAL', readiness(ev({ largestGapMs: 8 * HOUR })).reasonCode === 'DISCONTINUOUS_INTERVAL');

// ── 2) recent-run (post-construction) anchor ──
console.log('\nRecent-run anchor:');
{ // single continuous run → runStartIdx 0 (mature/clean unchanged)
  const pts = run(T0, 30, 10 * HOUR, 6000, 2);
  const a = anchorOf(pts);
  ok('single run → runStartIdx 0, runCount 1', a.runStartIdx === 0 && a.runCount === 1 && a.constructionEndTimestamp === null);
}
{ // construction prefix + 6.87h gap + recent run → anchor at recent run start
  const prefix = run(T0 - 12 * HOUR - 412 * MIN, 5, 30 * MIN, 2450, 1);   // ends ~412min before recent run
  const recent = run(T0, 20, 12 * HOUR, 5900, 2.3);
  const pts = prefix.concat(recent);
  const a = anchorOf(pts);
  ok('prefix+gap → runStartIdx=5 (recent run)', a.runStartIdx === 5 && a.runCount === 2, JSON.stringify({ i: a.runStartIdx, c: a.runCount }));
  ok('prefix+gap → postBootstrapPointCount=20, bootstrapSnapshotCount=5', a.postBootstrapPointCount === 20 && a.bootstrapSnapshotCount === 5);
  ok('prefix+gap → constructionEndTimestamp = recent run start', a.constructionEndTimestamp === recent[0].ts);
  ok('prefix+gap → recent-run internal gap ≤ 6h', a.largestGapMsInRun <= 6 * HOUR);
}

// ── 3) SPEC.48 bootstrap-exit decision scenarios ──
console.log('\nBootstrap-exit scenarios:');
// (1) genuine construction-only (single run, unrecorded ramp → flow-neutral NOT ok) → neutral
{
  const pts = run(T0, 20, 10 * HOUR, 100, 2300);   // ramps 100→2400 (construction), unrecorded
  const d = builderDecide(pts, 'insufficient', null, 0, 5 * MIN);
  ok('1 construction-only (per not ok) → NOT publishable, FINANCIAL_CONFIDENCE_UNTRUSTED', !d.publishable && d.rd.reasonCode === 'FINANCIAL_CONFIDENCE_UNTRUSTED', JSON.stringify({ p: d.publishable, r: d.rd.reasonCode }));
}
// (1b) construction-only, recent clean run too small → BOOTSTRAP_ONLY_HISTORY (regime=construction)
{
  const prefix = run(T0 - 8 * HOUR, 20, 6 * HOUR, 2450, 1);
  const recent = run(T0, 4, 20 * MIN, 6000, 0.5);   // only 4 post-gap points
  const pts = prefix.concat(recent);
  const d = builderDecide(pts, 'ok', 0.4, 0, 5 * MIN);
  ok('1b tiny post-construction run → BOOTSTRAP_ONLY_HISTORY', !d.publishable && d.regime === 'construction' && d.rd.reasonCode === 'BOOTSTRAP_ONLY_HISTORY', JSON.stringify({ p: d.publishable, rg: d.regime, r: d.rd.reasonCode }));
}
// (2) construction prefix + trusted market history → publish post-construction market return
{
  const prefix = run(T0 - 12 * HOUR - 412 * MIN, 5, 30 * MIN, 2450, 1);
  const recent = run(T0, 20, 12 * HOUR, 5900, 2.3);
  const pts = prefix.concat(recent);
  const d = builderDecide(pts, 'ok', 2.3, 0, 5 * MIN);
  ok('2 prefix+market → publishable, regime=post_construction, baseline=recent run', d.publishable && d.regime === 'post_construction' && d.first24.value === recent[0].value, JSON.stringify({ p: d.publishable, rg: d.regime }));
}
// (3) large deposit WITHOUT trusted flow (single run, jump unreconciled → per not ok) → neutral
{
  const pts = run(T0, 20, 10 * HOUR, 2427.97, 148);   // 2427→6035 single run, no matching flow → per rejects
  const d = builderDecide(pts, 'insufficient', null, 0, 5 * MIN);
  ok('3 large deposit no flow → NOT publishable (financial confidence)', !d.publishable && d.rd.reasonCode === 'FINANCIAL_CONFIDENCE_UNTRUSTED');
}
// (4) trusted deposit neutralized (deposit = capital-step break >6h separates) → publish only market return
{
  const prefix = run(T0 - 10 * HOUR - 7 * HOUR, 8, 3 * HOUR, 2450, 0.5);   // pre-deposit
  const recent = run(T0, 15, 10 * HOUR, 6000, 0.6);                         // post-deposit market
  const pts = prefix.concat(recent);
  const d = builderDecide(pts, 'ok', 0.6, 3550, 5 * MIN);
  ok('4 trusted deposit → publish market return over post-deposit run', d.publishable && d.regime === 'post_construction' && d.first24.value === recent[0].value);
}
// (5) production shape (119 pts, 412min gap, fresh, flow-trusted) → bootstrap exits, publishes
{
  const prefix = run(T0 - 12 * HOUR - 412 * MIN, 5, 20 * MIN, 2427.97, 2);
  const recent = run(T0, 114, 12 * HOUR, 5900, 2.3);
  const pts = prefix.concat(recent);
  const a = anchorOf(pts);
  const d = builderDecide(pts, 'ok', 2.3, 0, 0.97 * MIN);
  ok('5 production shape → publishable', d.publishable, JSON.stringify({ p: d.publishable, r: d.rd.reasonCode, i: a.runStartIdx, cov: d.covRun, gap: d.gapRun / MIN }));
  ok('5 production shape → excludes pre-gap prefix (bootstrapSnapshotCount=5)', a.bootstrapSnapshotCount === 5 && a.postBootstrapPointCount === 114);
  ok('5 production shape → recent-run gap ≤6h (was 412min full-range)', d.gapRun <= 6 * HOUR);
}
// (6) colors
{
  const mk = drift => { const prefix = run(T0 - 12 * HOUR - 412 * MIN, 5, 20 * MIN, 2450, 1); const recent = run(T0, 20, 12 * HOUR, 6000, drift); return prefix.concat(recent); };
  ok('6 positive → publishable + green', (() => { const d = builderDecide(mk(2), 'ok', 2, 0, 5 * MIN); return d.publishable && colorFor(2) === 'positive'; })());
  ok('6 negative → publishable + red', (() => { const d = builderDecide(mk(-2), 'ok', -2, 0, 5 * MIN); return d.publishable && colorFor(-2) === 'negative'; })());
  ok('6 zero → publishable + neutral', (() => { const d = builderDecide(mk(0), 'ok', 0, 0, 5 * MIN); return d.publishable && colorFor(0) === 'neutral'; })());
}

// ── 4) audit contract (SPEC.48 extension) ──
console.log('\nAudit contract:');
const NEW_KEYS = ['bootstrapFlagSource', 'bootstrapSnapshotCount', 'postBootstrapPointCount', 'constructionEndTimestamp',
  'acceptedBaselineRegime', 'baselineToCurrentPct', 'largeValueChangeClassification', 'bootstrapExitEligible', 'bootstrapExitRejectionReason'];
// published production-shape emg (as the builder would emit it)
const publishedEmg = () => {
  const prefix = run(T0 - 12 * HOUR - 412 * MIN, 5, 20 * MIN, 2427.97, 2);
  const recent = run(T0, 114, 12 * HOUR, 5900, 2.3);
  const pts = prefix.concat(recent);
  return {
    range: '24h', state: 'ready', points: pts, finalPointCount: pts.length, coverageRatio: 0.7947,
    historyTooShortForRange: true, displayedRangeState: 'partial_history',
    baselineTs: recent[0].ts, baselineValue: recent[0].value, currentTs: T0, currentValue: 6035.73,
    returnState: 'ok', returnPct: 2.3, badgeReturnPct: 2.3, partial24hPublished: true, reason: 'partial_24h_return_published',
    partial24hReadiness: { publishable: true, reasonCode: 'TRUSTED_PARTIAL_24H_RETURN' },
    partial24hAnchor: {
      bootstrapFlagSource: 'recent_continuous_run_regime', runStartIdx: 5, runCount: 2, bootstrapSnapshotCount: 5,
      postBootstrapPointCount: 114, constructionEndTimestamp: recent[0].ts, acceptedBaselineRegime: 'post_construction',
      acceptedBaselineTs: recent[0].ts, acceptedBaselineValue: recent[0].value, baselineToCurrentPct: 2.3,
      windowBaselineToCurrentPct: 148.6, largeValueChangeClassification: 'external_capital_flow_reconciled',
      recentRunReturnPct: 2.3, recentRunReturnState: 'ok', recentRunCoverageRatio: 0.5, recentRunLargestGapMs: 20 * MIN,
      bootstrapExitEligible: true, bootstrapExitRejectionReason: null,
    },
  };
};
{
  const a = audit(publishedEmg(), T0 + MIN);
  ok('A published → returnComputable, currentState TRUSTED_PARTIAL_RETURN', a.returnComputable === true && a.currentState === 'TRUSTED_PARTIAL_RETURN');
  ok('A spec = SPEC.48', a.spec === 'DSH.CHART.24H_BOOTSTRAP_EXIT.48');
  ok('A all 9 new bootstrap fields present', NEW_KEYS.every(k => Object.prototype.hasOwnProperty.call(a, k)), NEW_KEYS.filter(k => !(k in a)).join(','));
  ok('A acceptedBaselineRegime post_construction, baseline is recent-run value (not 2427.97)', a.acceptedBaselineRegime === 'post_construction' && a.baselineValue !== 2427.97 && a.postBootstrapPointCount === 114);
  ok('A large value change classified external_capital_flow_reconciled; window jump ~148%', a.largeValueChangeClassification === 'external_capital_flow_reconciled' && Math.round(a.windowBaselineToCurrentPct) === 149);
  ok('A published baselineToCurrentPct is small covered-period (not 148%)', Math.abs(a.baselineToCurrentPct) < 25);
  ok('A audit serializable', (() => { try { JSON.stringify(a); return true; } catch (_) { return false; } })());
}
{ // blocked emg (construction-only) — audit reports the owner + rejection reason
  const pts = run(T0, 20, 10 * HOUR, 100, 2300);
  const emg = { range: '24h', state: 'ready', points: pts, finalPointCount: 20, coverageRatio: 0.42,
    historyTooShortForRange: true, displayedRangeState: 'partial_history', baselineTs: pts[0].ts, baselineValue: 100,
    currentTs: T0, currentValue: 2400, returnState: 'insufficient_return_history', returnPct: null, badgeReturnPct: null,
    partial24hPublished: false, partialReturnTrusted: false,
    partial24hReadiness: { publishable: false, reasonCode: 'FINANCIAL_CONFIDENCE_UNTRUSTED', blockingPredicate: 'per_return_state_not_ok' },
    partial24hAnchor: { bootstrapFlagSource: 'recent_continuous_run_regime', runStartIdx: 0, runCount: 1, bootstrapSnapshotCount: 0,
      postBootstrapPointCount: 20, constructionEndTimestamp: null, acceptedBaselineRegime: 'investable',
      acceptedBaselineTs: pts[0].ts, acceptedBaselineValue: 100, baselineToCurrentPct: 2300, windowBaselineToCurrentPct: 2300,
      largeValueChangeClassification: 'unreconciled_capital_or_construction', bootstrapExitEligible: false, bootstrapExitRejectionReason: 'FINANCIAL_CONFIDENCE_UNTRUSTED' } };
  const a = audit(emg, T0 + MIN);
  ok('B blocked → returnComputable false, currentState PARTIAL_HISTORY_NEUTRAL', a.returnComputable === false && a.currentState === 'PARTIAL_HISTORY_NEUTRAL');
  ok('B bootstrapExitEligible false + rejection reason surfaced', a.bootstrapExitEligible === false && a.bootstrapExitRejectionReason === 'FINANCIAL_CONFIDENCE_UNTRUSTED');
  ok('B large change classified unreconciled (never published)', a.largeValueChangeClassification === 'unreconciled_capital_or_construction' && a.cashflowConfidence === 'untrusted');
}

// ── 5) source-level invariants ──
console.log('\nSource-level invariants:');
ok('SPEC.48 marker present', /24H_BOOTSTRAP_EXIT\.48/.test(app));
ok('recent-run anchor helper exists (exactly one)', (app.match(/function _aurix24hRecentRunAnchor\(/g) || []).length === 1);
ok('bootstrap predicate no longer keys on rangeCollapsed (removed the coverage-as-bootstrap conflation)', !/_bootstrap = \(out\.rangeCollapsedBecauseHistoryTooShort === true\)/.test(app));
const buildSrc = fnSrc('buildProductionPortfolioChart');
ok('7 24H block never assigns out.points (line/points byte-identical)', (function () { const s = buildSrc.indexOf("if (r === '24h' && (out.historyTooShortForRange || _has24hPrefix))"); const blk = s >= 0 ? buildSrc.slice(s, s + 4200) : ''; return blk.length > 0 && !/out\.points\s*=/.test(blk) && !/renderPoints|linePath|areaPath/.test(blk); })());
ok('8 non-24H suppression preserved in untouched else-if branch', /\} else if \(out\.historyTooShortForRange && per\.returnState === 'ok'\) \{/.test(buildSrc));
ok('8 SPEC.22 deadlock resolver still excludes 24H', /r === '24h' \|\| r === 'all'\) return out;/.test(app));
ok('8 FRC deadlock step still excludes 24H', /deadlockResOn && out\.lineEligible && !out\.badgeEligible && r !== '24h' && r !== 'all'/.test(app));
ok('later returnState-ok block guards partial24hPublished (recent-run % not overwritten)', /if \(!out\.partial24hPublished\) \{[\s\S]{0,160}out\.returnPct = per\.returnPct/.test(fnSrc('buildProductionPortfolioChart')));
ok('9 recent-run anchor is surface-agnostic (desktop/mobile parity)', !/mobile|desktop|surface/.test(fnSrc('_aurix24hRecentRunAnchor')));
ok('flow-neutral engine is the financial arbiter (per.returnState feeds financialConfidenceOk)', /financialConfidenceOk: \(_per24\.returnState === 'ok'\)/.test(buildSrc));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
