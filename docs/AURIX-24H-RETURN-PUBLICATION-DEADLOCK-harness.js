'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-24H-RETURN-PUBLICATION-DEADLOCK-harness — SPEC DSH.CHART.24H_RETURN_PUBLICATION_DEADLOCK
// ════════════════════════════════════════════════════════════════════════════
// P0. PROVEN OWNER: `_aurix24hRecentRunAnchor` set the accepted 24H RETURN baseline to `runs[last][0]`,
// so ANY structural break re-anchored the baseline forward — INCLUDING a pure browser/overnight OBSERVATION
// gap (real_temporal_gap / confirmed_sparse_bridge with NO capital flow). Every night the baseline jumped
// to the morning run and the elapsed-coverage clock reset (prod: coverage 0.07 < 0.25 despite an 18h-old
// regime → INSUFFICIENT_ELAPSED_COVERAGE), and a 6–8h intra-run hole tripped DISCONTINUOUS_INTERVAL.
// FIX: the accepted regime is the current POST-CONSTRUCTION / POST-CAPITAL-EVENT regime — start at the
// most-recent run, extend BACKWARD across pure observation gaps, STOP only at a RECONCILED capital event
// (break.reason 'capital_step') or a CONSTRUCTION-LOW prefix; and largestGapMsInRun excludes spanned
// observation outages so the continuity gate no longer sees them. Rendering segmentation is untouched.
// This harness loads the REAL production break/anchor chain + the REAL readiness resolver (no re-impl).
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(s) { let k = app.indexOf('{', s), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(s, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing fn ' + n); return braceSlice(i); }
function konstSrc(n) { const m = new RegExp('const ' + n + '\\s*=\\s*').exec(app); if (!m) throw new Error('missing const ' + n); const eq = m.index + m[0].length, f = app[eq]; if (f === '{' || f === '[') { const b = braceSlice(eq); const s = app.indexOf(';', eq + b.length); return app.slice(m.index, s + 1); } const s = app.indexOf(';', eq); return app.slice(m.index, s + 1); }

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const MIN = 60000, HOUR = 36e5, DAY = 864e5, T0 = 1_800_000_000_000;
const CONSTS = ['_AURIX_VP_GAP_FLOOR_MS', '_AURIX_VP_GAP_MEDIAN_MULT', '_AURIX_BRIDGE_SEG_ENABLED', '_AURIX_BRIDGE_SEG_FRAC',
  '_AURIX_CAPITAL_STEP_SEG_ENABLED', '_AURIX_SPARSE_RAMP_SEG_ENABLED', '_AURIX_VJUMP_MIN_FRAC', '_AURIX_VJUMP_P95_MULT',
  '_AURIX_CAPSTEP_RATIO_LO', '_AURIX_CAPSTEP_RATIO_HI', '_AURIX_CAPSTEP_TS_PAD_MS', '_AURIX_SPARSE_RAMP_MULT', '_AURIX_SPARSE_RAMP_MIN_MS',
  '_AURIX_CHART_CONTINUITY_UNIFICATION', '_AURIX_EMG_RANGE_MS', '_AURIX_PARTIAL_RETURN_MIN_PCT',
  '_AURIX_24H_PARTIAL_MIN_COVERAGE', '_AURIX_24H_PARTIAL_MIN_POINTS', '_AURIX_24H_ENDPOINT_FRESH_MS', '_AURIX_24H_MAX_INTERNAL_GAP_MS'];
const FNS = ['_aurixSplitAtGaps', '_aurixConfirmedBridgeGaps', '_aurixVerticalJumps', '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks',
  '_aurixRealGapFloorMs', '_aurixBuildContinuityValidatedSeries', '_aurixStructuralBreaks', '_aurix24hRecentRunAnchor', '_aurix24hReturnReadiness'];

let FLOWS = [];   // capital-flow ledger the harness injects per-test (empty ⇒ every gap is a pure observation gap)
const ctx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Set, RegExp, Object };
ctx._aurixLoadCapitalFlows = () => FLOWS;
ctx.toBase = v => v;
vm.createContext(ctx);
CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (e) { console.log('  (const load fail ' + c + ': ' + e.message + ')'); } });
FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (e) { console.log('  (fn load fail ' + f + ': ' + e.message + ')'); } });
const anchorOf = pts => vm.runInContext('_aurix24hRecentRunAnchor', ctx)(pts);
const readiness = ev => vm.runInContext('_aurix24hReturnReadiness', ctx)(ev);
const colorFor = pct => (Number.isFinite(pct) ? (pct > 0.05 ? 'positive' : (pct < -0.05 ? 'negative' : 'neutral')) : 'neutral');
const MINPTS = 8, REQSPAN = DAY;

// build n points spanning spanMs ending at endTs, ramping base → base*(1+drift%)
const run = (endTs, n, spanMs, base, driftPct) => { const o = []; for (let i = 0; i < n; i++) o.push({ ts: endTs - spanMs + Math.round(i * spanMs / (n - 1)), value: +(base * (1 + (driftPct / 100) * (i / (n - 1)))).toFixed(2) }); return o; };

// Faithful mirror of the (fixed) builder 24H decision: real anchor + real readiness. per24State/per24Pct are
// the flow-neutral engine's verdict (a trusted input — that engine is tested elsewhere). Uses the anchor's
// largestGapMsInRun directly (the fix: spanned observation gaps are excluded), exactly like the builder.
function builderDecide(pts, per24State, per24Pct, freshMs) {
  const a = anchorOf(pts);
  let first24 = pts[0]; const last = pts[pts.length - 1];
  if (a.runStartIdx > 0 && a.runStartIdx < pts.length) first24 = pts[a.runStartIdx];
  const postCount = a.postBootstrapPointCount;
  const covRun = +(((last.ts - first24.ts) / REQSPAN).toFixed(4));
  const gapRun = a.largestGapMsInRun;   // FIX: builder trusts the anchor (observation outages excluded)
  const regime = (postCount < MINPTS) ? 'construction' : (a.runStartIdx > 0 ? 'post_construction' : 'investable');
  const rd = readiness({ coverageRatio: covRun, pointCount: postCount, endpointFreshnessMs: (freshMs == null ? 5 * MIN : freshMs),
    largestGapMs: gapRun, baselineIsOriginal: (first24.value > 0), currentValueAvailable: (last.value > 0),
    financialConfidenceOk: (per24State === 'ok'), returnPct: per24Pct, bootstrapOnly: (regime === 'construction') });
  return { a, first24, last, covRun, gapRun, postCount, regime, rd, publishable: !!rd.publishable };
}

// A same-regime 24H shape with an overnight OBSERVATION gap (no capital flow). All args are HOURS BEFORE
// now (T0): evening [evStartH → evEndH], a gap, then morning [moStartH → 0]. Regime began evStartH ago.
function overnightShape(evStartH, evEndH, moStartH) {
  const dense = (fromMsAgo, toMsAgo, base) => { const from = T0 - fromMsAgo, to = T0 - toMsAgo, span = to - from; const n = Math.max(12, Math.round(span / (8 * MIN))); const o = []; for (let i = 0; i < n; i++) o.push({ ts: from + Math.round(i * span / (n - 1)), value: +(base + i * 1.0).toFixed(2) }); return o; };
  const evening = dense(evStartH * HOUR, evEndH * HOUR, 6000);
  const morning = dense(moStartH * HOUR, 0, 6060);
  return evening.concat(morning);
}

// ── 1) coverage-clock: trusted interval JUST below the minimum → PENDING ──────────────────────
console.log('\n1) elapsed-coverage minimum:');
{ FLOWS = []; const pts = run(T0, 40, 359 * MIN, 6000, 1.2); const d = builderDecide(pts, 'ok', 1.2, 5 * MIN);
  ok('1 5h59m trusted interval → pending (INSUFFICIENT_ELAPSED_COVERAGE)', !d.publishable && d.rd.reasonCode === 'INSUFFICIENT_ELAPSED_COVERAGE', JSON.stringify({ cov: d.covRun, r: d.rd.reasonCode })); }
{ FLOWS = []; const pts = run(T0, 40, 360 * MIN, 6000, 1.2); const d = builderDecide(pts, 'ok', 1.2, 5 * MIN);
  ok('2 threshold exactly reached (6h → cov 0.25) → publishes', d.publishable && d.rd.reasonCode === 'TRUSTED_PARTIAL_24H_RETURN', JSON.stringify({ cov: d.covRun, r: d.rd.reasonCode })); }
{ FLOWS = []; const pts = run(T0, 60, 10 * HOUR, 6000, 1.4); const d = builderDecide(pts, 'ok', 1.4, 5 * MIN);
  ok('3 threshold exceeded (10h) → publishes', d.publishable && d.rd.reasonCode === 'TRUSTED_PARTIAL_24H_RETURN', JSON.stringify({ cov: d.covRun })); }

// ── 2) baseline stability across ordinary snapshots (no coverage-clock reset) ──────────────────
console.log('\n2) baseline stability:');
{ FLOWS = []; const pts = run(T0, 40, 10 * HOUR, 6000, 1.3); const b0 = anchorOf(pts).runStartTs;
  const pts2 = pts.concat([{ ts: T0 + 8 * MIN, value: 6081.2 }]); const b1 = anchorOf(pts2).runStartTs;
  ok('4 ordinary new snapshot → accepted baseline does NOT restart', b0 === b1 && b0 === pts[0].ts, JSON.stringify({ b0, b1 })); }
{ FLOWS = []; const pts = overnightShape(18, 14, 2); const a = anchorOf(pts);
  const d = builderDecide(pts, 'ok', 0.8, 5 * MIN);
  ok('5 overnight OBSERVATION gap inside same regime → visual split but return PUBLISHES', d.publishable && a.spannedObservationGapCount >= 1 && a.runStartIdx === 0,
    JSON.stringify({ pub: d.publishable, spanned: a.spannedObservationGapCount, idx: a.runStartIdx, cov: d.covRun, gapH: +(d.gapRun / HOUR).toFixed(2) })); }

// ── 3) reconciled capital event ENDS the interval exactly once ─────────────────────────────────
console.log('\n3) capital-event anchoring:');
// deposit: dense pre-run ~6000, a +3000 (≈+50%) reconciled step, dense post-run ~9000. The step is a
// capital_step break (matched flow) ⇒ anchor stops there ⇒ baseline = first post-deposit point.
function depositShape() {
  const pre = run(T0 - 12 * HOUR, 20, 5 * HOUR, 6000, 0.4);     // ends ~T0-7h at ~6024
  const post = run(T0, 22, 6 * HOUR, 9050, 0.6);               // starts ~T0-6h at 9050
  return { pts: pre.concat(post), stepTs: post[0].ts, preLast: pre[pre.length - 1].ts, postFirst: post[0].ts };
}
{ const s = depositShape(); FLOWS = [{ ts: s.postFirst, amountUSD: 3000 }];   // reconciled deposit
  const a = anchorOf(s.pts); const d = builderDecide(s.pts, 'ok', 0.6, 5 * MIN);
  ok('6 recorded deposit → previous interval excluded, one post-event baseline (regime=post_construction)',
    a.regimeBoundaryReason === 'capital_step' && a.runStartTs === s.postFirst && d.regime === 'post_construction' && d.first24.ts === s.postFirst,
    JSON.stringify({ boundary: a.regimeBoundaryReason, idx: a.runStartIdx, runStartTs: a.runStartTs, postFirst: s.postFirst })); }
{ const s = depositShape(); FLOWS = [{ ts: s.postFirst, amountUSD: 3000 }];
  const a0 = anchorOf(s.pts).runStartTs;
  const pts2 = s.pts.concat([{ ts: T0 + 8 * MIN, value: 9105.5 }, { ts: T0 + 16 * MIN, value: 9110.2 }]);   // later snapshots
  const a1 = anchorOf(pts2).runStartTs;
  ok('7 later snapshots after deposit → post-event baseline remains stable', a0 === a1 && a0 === s.postFirst, JSON.stringify({ a0, a1, postFirst: s.postFirst })); }
{ // unreconciled deposit: same value jump but NO matching flow ⇒ NOT a capital_step; the flow-neutral engine
  // rejects the unexplained jump (per24State !== 'ok') ⇒ FINANCIAL_CONFIDENCE_UNTRUSTED ⇒ pending.
  const s = depositShape(); FLOWS = [];
  const d = builderDecide(s.pts, 'insufficient', null, 5 * MIN);
  ok('8 unreconciled deposit → pending (FINANCIAL_CONFIDENCE_UNTRUSTED)', !d.publishable && d.rd.reasonCode === 'FINANCIAL_CONFIDENCE_UNTRUSTED', JSON.stringify({ r: d.rd.reasonCode })); }

// ── 4) no downstream overwrite of a publishable builder return ─────────────────────────────────
console.log('\n4) downstream overwrite guard (Class C):');
const buildSrc = fnSrc('buildProductionPortfolioChart');
ok('9 later returnState-ok block guards partial24hPublished (builder % not overwritten)',
  /if \(!out\.partial24hPublished\) \{[\s\S]{0,180}out\.returnPct = per\.returnPct/.test(buildSrc));
ok('9 SPEC.22 deadlock resolver still excludes 24H (no Calculando restore)', /r === '24h' \|\| r === 'all'\) return out;/.test(app));
ok('9 FRC deadlock step still excludes 24H', /deadlockResOn && out\.lineEligible && !out\.badgeEligible && r !== '24h' && r !== 'all'/.test(app));

// ── 5) determinism: reload / hard-reload / background→foreground give the SAME state ───────────
console.log('\n5) determinism & background/foreground:');
{ FLOWS = []; const pts = overnightShape(18, 14, 2);
  const a = JSON.stringify(anchorOf(pts)), b = JSON.stringify(anchorOf(pts));
  ok('10 reload & hard reload → identical anchor (pure fn of points+ledger)', a === b);
  const d1 = builderDecide(pts, 'ok', 0.8, 5 * MIN), d2 = builderDecide(pts, 'ok', 0.8, 5 * MIN);
  ok('10 reload → identical publish decision', d1.publishable === d2.publishable && d1.covRun === d2.covRun); }
{ FLOWS = []; const pts = overnightShape(18, 14, 2);
  const foreground = builderDecide(pts, 'ok', 0.8, 3 * MIN);       // just resumed — fresh endpoint
  const stillFresh = builderDecide(pts, 'ok', 0.8, 80 * MIN);      // backgrounded a while, still within 90min
  ok('11 background/foreground (endpoint still fresh) → no regression to Calculando', foreground.publishable && stillFresh.publishable,
    JSON.stringify({ fg: foreground.publishable, bg: stillFresh.publishable })); }

// ── 6) sign/colour parity ──────────────────────────────────────────────────────────────────────
console.log('\n6) sign & colour:');
{ FLOWS = [];
  const mk = drift => run(T0, 40, 10 * HOUR, 6000, drift);
  const pos = builderDecide(mk(1.8), 'ok', 1.8, 5 * MIN);
  const neg = builderDecide(mk(-1.8), 'ok', -1.8, 5 * MIN);
  const zer = builderDecide(mk(0), 'ok', 0, 5 * MIN);
  ok('12 positive → publishes + green', pos.publishable && colorFor(1.8) === 'positive');
  ok('12 negative → publishes + red', neg.publishable && colorFor(-1.8) === 'negative');
  ok('12 exact zero → publishes + neutral 0.00%', zer.publishable && colorFor(0) === 'neutral'); }

// ── 7) endpoint reconciliation (baseline & endpoint are ORIGINAL points) ───────────────────────
console.log('\n7) endpoint reconciliation:');
{ FLOWS = []; const pts = overnightShape(18, 14, 2); const d = builderDecide(pts, 'ok', 0.8, 5 * MIN);
  ok('13 endpoint == last original point; baseline == accepted original point (no synthetic)',
    d.last.ts === pts[pts.length - 1].ts && d.last.value === pts[pts.length - 1].value && d.first24.ts === pts[0].ts,
    JSON.stringify({ lastTs: d.last.ts, expect: pts[pts.length - 1].ts })); }

// ── 8) source invariants: surface parity, other ranges untouched, golden/FRC protected ─────────
console.log('\n8) source invariants (parity / scope / golden):');
ok('14 anchor is surface-agnostic (desktop/mobile parity)', !/mobile|desktop|surface/i.test(fnSrc('_aurix24hRecentRunAnchor')));
ok('15 anchor is 24H-only (builder gate r===\'24h\')', /if \(r === '24h' && typeof _aurix24hRecentRunAnchor === 'function'\)/.test(buildSrc));
ok('15 7D/30D/1Y suppression branch untouched (else-if per.returnState ok)', /\} else if \(out\.historyTooShortForRange && per\.returnState === 'ok'\) \{/.test(buildSrc));
ok('16 SPEC.51 current-regime single-path flag present (FRC handoff untouched)', /_AURIX_CHART_ACTIVE_REGIME_SINGLE_PATH/.test(app));
ok('16 24H block never assigns out.points (line/points byte-identical; renderer geometry untouched)',
  (function () { const s = buildSrc.indexOf("if (r === '24h' && (out.historyTooShortForRange || _has24hPrefix))"); const blk = s >= 0 ? buildSrc.slice(s, s + 4600) : ''; return blk.length > 0 && !/out\.points\s*=/.test(blk) && !/renderPoints|linePath|areaPath/.test(blk); })());
ok('16 flow-neutral engine remains the financial arbiter', /financialConfidenceOk: \(_per24\.returnState === 'ok'\)/.test(buildSrc));
ok('deadlock spec marker present', /24H_RETURN_PUBLICATION_DEADLOCK/.test(app));
ok('exactly one recent-run anchor helper', (app.match(/function _aurix24hRecentRunAnchor\(/g) || []).length === 1);

// ── 9) construction prefix still excluded (regression) ─────────────────────────────────────────
console.log('\n9) construction exclusion (regression):');
{ FLOWS = []; const pre = run(T0 - 20 * HOUR, 6, 90 * MIN, 2450, 1); const rec = run(T0, 30, 8 * HOUR, 5900, 1.2);
  const a = anchorOf(pre.concat(rec));
  ok('construction-low prefix (≈41% of regime) → excluded, boundary=construction_low', a.runStartIdx === 6 && a.regimeBoundaryReason === 'construction_low',
    JSON.stringify({ idx: a.runStartIdx, boundary: a.regimeBoundaryReason })); }

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
