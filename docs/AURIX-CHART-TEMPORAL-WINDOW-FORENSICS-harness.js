'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-TEMPORAL-WINDOW-FORENSICS-harness — SPEC DSH.CHART.TEMPORAL_WINDOW_FORENSICS.42
// ════════════════════════════════════════════════════════════════════════════
// READ-ONLY audit that proves which temporal dataset each range renders and, if long ranges "reuse" the same
// dataset, names the ONE owner (or declares it legitimate short/epoch-band history). This harness proves the
// classifier discriminates: progressive windows ⇒ CORRECT; short raw history ⇒ CORRECT (honest collapse);
// long merged history trimmed by epoch-trust ⇒ OWNER _aurixTrustedChartSource; a stage-10 window that fails to
// expand ⇒ OWNER buildValidatedHistoricalSeries; plus per-stage stats, pairwise overlap, purity, additive-only.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing ' + n); return braceSlice(app, i); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const ctx = { console: { log() {} }, Math, JSON, Number, isFinite, Infinity, Array, Object, String, Set, Date };
vm.createContext(ctx);
vm.runInContext(fnSrc('_aurixTemporalStageStats'), ctx);
vm.runInContext(fnSrc('_aurixAuditTemporalWindowCore'), ctx);
const core = (opts, deps) => vm.runInContext('_aurixAuditTemporalWindowCore', ctx)(opts, deps);

const DAY = 864e5, NOW = 1_720_000_000_000;
const RANGE_MS = { '24h': 864e5, '7d': 6048e5, '30d': 2592e6, '1y': 31536e6, 'all': Infinity };
function daily(days, v0, vStep) { const a = []; for (let d = days; d >= 0; d--) a.push({ ts: NOW - d * DAY, total: (v0 || 10000) + (days - d) * (vStep || 1), source: 'remote_canonical' }); return a; }
function mkDeps(pool, opts) {
  opts = opts || {};
  const nowRef = pool.length ? Math.max.apply(null, pool.map(p => p.ts)) : 0;
  const epochTrust = src => { if (opts.epochTrimDays == null) return src; const cut = nowRef - opts.epochTrimDays * DAY; return src.filter(p => p.ts >= cut); };
  const validatedPool = () => epochTrust(pool).slice().sort((a, b) => a.ts - b.ts).map(p => ({ ts: p.ts, value: p.total }));
  const buildValidated = r => {
    const vf = validatedPool(); let ranged;
    if (opts.stage10Bug) { ranged = vf.slice(-3); }
    else { const span = RANGE_MS[r]; const start = Number.isFinite(span) ? nowRef - span : -Infinity; ranged = vf.filter(p => p.ts >= start); if (ranged.length < 2) ranged = vf.slice(-8); }
    const span = RANGE_MS[r]; const start = Number.isFinite(span) ? nowRef - span : -Infinity;
    const collapsed = (r !== 'all') && vf.length > 0 && vf[0].ts >= start;
    return { validatedFull: vf, rangeSeries: ranged, nowRef: nowRef, collapsedRange: ranged.length < 2, rangeCollapsedBecauseHistoryTooShort: !!collapsed };
  };
  return {
    displaySource: () => pool.map(p => Object.assign({}, p)),
    trustedSource: epochTrust, epochTrustOn: opts.epochTrimDays != null,
    authority: (src) => src,
    buildValidated: buildValidated,
    buildChart: r => { const v = buildValidated(r); const span = RANGE_MS[r]; const s = v.rangeSeries; return { points: s.map(p => ({ ts: p.ts, value: p.value })), coverageRatio: Number.isFinite(span) ? (s.length >= 2 ? +((s[s.length - 1].ts - s[0].ts) / span).toFixed(4) : 0) : null }; },
    resolveContract: (chart) => ({ renderPoints: chart.points, renderPathCount: 1, diagnostics: { syntheticPoints: 0 } }),
    rangeMs: RANGE_MS,
  };
}

console.log('\nAURIX-CHART-TEMPORAL-WINDOW-FORENSICS — SPEC.42');

// ── 0 marker + single core + read-only ───────────────────────────────────────
ok('0 marker present', app.indexOf('TEMPORAL_WINDOW_FORENSICS.42') >= 0);
ok('0 single audit core owner', (app.match(/^function _aurixAuditTemporalWindowCore\(/gm) || []).length === 1);
(function () { const res = core({}, mkDeps(daily(400, 9000, 5))); ok('0 readOnly + behaviorChanged false', res.readOnly === true && res.behaviorChanged === false); })();

// ── 1 Long in-band pool ⇒ progressive windows ⇒ WINDOW_SELECTION_CORRECT ─────
(function () {
  const res = core({}, mkDeps(daily(400, 9000, 5)));
  ok('1 long in-band ⇒ WINDOW_SELECTION_CORRECT', res.verdict === 'WINDOW_SELECTION_CORRECT' && res.exactOwner === null, res.verdict);
  ok('1 progressive spans (7d<30d<1y<all)', res.perRange['7d'].window.actualDurationDays < res.perRange['30d'].window.actualDurationDays && res.perRange['30d'].window.actualDurationDays < res.perRange['1y'].window.actualDurationDays);
  ok('1 smaller ⊂ larger (subset 100%)', res.rangeComparison['7d_vs_30d'].smallerSubsetOfLargerPct === 100 && !res.rangeComparison['7d_vs_30d'].identicalDataset);
})();

// ── 2 Short raw history ⇒ CORRECT (honest short-history collapse) ────────────
(function () {
  const res = core({}, mkDeps(daily(5, 10000, 10)));
  ok('2 short history ⇒ WINDOW_SELECTION_CORRECT (not a defect)', res.verdict === 'WINDOW_SELECTION_CORRECT' && res.exactOwner === null, res.verdict);
  ok('2 long ranges reuse the same available history (identical hashes)', res.rangeComparison['7d_vs_30d'].identicalDataset && res.rangeComparison['30d_vs_1y'].identicalDataset);
  ok('2 flagged rangeCollapsedBecauseHistoryTooShort', res.perRange['30d'].window.rangeCollapsedBecauseHistoryTooShort === true);
  ok('2 mergedSpanDays < 7', res.preWindowSpans.mergedSpanDays < 7);
})();

// ── 3 Long merged BUT epoch-trust trims the pool ⇒ OWNER _aurixTrustedChartSource ─
(function () {
  const res = core({}, mkDeps(daily(400, 9000, 5), { epochTrimDays: 2 }));
  ok('3 epoch-trimmed long history ⇒ OWNER_IDENTIFIED', res.verdict === 'WINDOW_SELECTION_OWNER_IDENTIFIED', res.verdict);
  ok('3 exact owner = _aurixTrustedChartSource', res.exactOwner === '_aurixTrustedChartSource', res.exactOwner);
  ok('3 span collapses at epoch stage (merged 400d → postEpoch <7d)', res.preWindowSpans.mergedSpanDays >= 7 && res.preWindowSpans.postEpochTrustSpanDays < 7);
})();

// ── 4 Long validated pool BUT stage-10 window never expands ⇒ OWNER buildValidatedHistoricalSeries ─
(function () {
  const res = core({}, mkDeps(daily(60, 9000, 5), { stage10Bug: true }));
  ok('4 stage-10 non-expansion ⇒ OWNER_IDENTIFIED', res.verdict === 'WINDOW_SELECTION_OWNER_IDENTIFIED', res.verdict);
  ok('4 exact owner = buildValidatedHistoricalSeries (stage-10)', /buildValidatedHistoricalSeries/.test(res.exactOwner || ''), res.exactOwner);
  ok('4 validated pool long but ranges reused', res.preWindowSpans.validatedFullSpanDays >= 7);
})();

// ── 5 per-stage stats present for every range + every stage ──────────────────
(function () {
  const res = core({}, mkDeps(daily(400, 9000, 5)));
  const need = ['stage1_raw_backend', 'stage2_raw_frontend', 'stage3_merged', 'stage4_post_source_authority', 'stage5_post_temporal_window', 'stage6_validated_full', 'stage7_build_production_chart', 'stage8_final_renderer_input'];
  const p = res.perRange['30d'].stages;
  ok('5 all 8 stages present', need.every(k => k in p));
  const st = p.stage5_post_temporal_window;
  ok('5 stage carries ts/value hashes + span + unique days/hours + ids', ['firstTs', 'lastTs', 'spanDays', 'uniqueDays', 'uniqueHours', 'timestampHash', 'valueHash', 'firstPointId', 'lastPointId', 'count'].every(k => k in st));
  ok('5 internal _tsSet stripped from output', !('_tsSet' in st));
})();

// ── 6 window analysis fields + rolling window kind ───────────────────────────
(function () {
  const res = core({}, mkDeps(daily(400, 9000, 5)));
  const w = res.perRange['30d'].window;
  ok('6 window analysis complete', ['requestedDurationMs', 'actualDurationMs', 'coverageRatio', 'expectedStart', 'actualStart', 'expectedEnd', 'actualEnd', 'deltaStartMs', 'deltaEndMs', 'windowKind'].every(k => k in w));
  ok('6 finite range is rolling [nowRef-Δ,nowRef]', w.windowKind === 'rolling[nowRef-Δ,nowRef]' && res.perRange['all'].window.windowKind === 'all_history');
})();

// ── 7 syntheticPoints = 0 ────────────────────────────────────────────────────
(function () { const res = core({}, mkDeps(daily(400, 9000, 5))); ok('7 totalSyntheticPoints 0', res.totalSyntheticPoints === 0 && res.summary.totalSyntheticPoints === 0); })();

// ── 8 no mutation of injected source ─────────────────────────────────────────
(function () { const pool = daily(400, 9000, 5); const before = JSON.stringify(pool); core({}, mkDeps(pool)); ok('8 injected source not mutated', JSON.stringify(pool) === before); })();

// ── 9 PURELY ADDITIVE / READ-ONLY — no temporal-selection owner body carries a SPEC.42 gate ──
const noGate = n => (app.match(new RegExp('^function ' + n + '\\(', 'gm')) || []).length === 1 && fnSrc(n).indexOf('TEMPORAL_WINDOW_FORENSICS') < 0;
ok('9 buildValidatedHistoricalSeries body untouched (no SPEC.42 gate)', noGate('buildValidatedHistoricalSeries'));
ok('9 _aurixApplyRangeSourceAuthority body untouched', noGate('_aurixApplyRangeSourceAuthority'));
ok('9 _aurixTrustedChartSource body untouched', noGate('_aurixTrustedChartSource'));
ok('9 _aurixHpqRawStages body untouched', noGate('_aurixHpqRawStages'));
ok('9 FRC + renderer bodies untouched', noGate('_aurixResolveFinalRenderSeriesContract') && noGate('renderValidatedPortfolioChartWithInstitutionalRenderer'));
(function () {
  const cp = require('child_process');
  let del = 'err'; try { del = cp.execSync('git -C ' + JSON.stringify(root) + ' diff -- app.js | grep -E "^-" | grep -v "^---" | wc -l', { encoding: 'utf8' }).trim(); } catch (e) { del = 'giterr'; }
  ok('9 app.js change purely additive (0 deletions)', del === '0', 'deletions=' + del);
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' SPEC.42 TEMPORAL-WINDOW-FORENSICS — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
