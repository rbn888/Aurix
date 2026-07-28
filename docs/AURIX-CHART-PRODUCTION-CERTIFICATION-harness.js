'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-PRODUCTION-CERTIFICATION-harness — SPEC DSH.CHART.CHART_PRODUCTION_CERTIFICATION
// ════════════════════════════════════════════════════════════════════════════
// The chart FINANCIAL engine is FROZEN. This harness CERTIFIES — and BLOCKS DEPLOY (process.exit(1) on any
// failure) — that 24H/7D/30D/1Y/ALL consume ONE pipeline: correct baseline/endpoint, returnPct == flow-neutral
// market return, one number for every consumer (returnPct===badgeReturnPct===lineReturnPct), colour from the
// ±0.05% dead-band (presentation only), geometry with no infinite/vertical/tooth/double-render artefacts (all
// from the single renderer + certified data), desktop/mobile parity, overnight stability, and a premium visual
// finish (institutional K/M labels, fixed uniform grid, label gutter) that never alters the financial curve.
// Loads the REAL engine + renderer + merge; the graph engine is verified UNCHANGED (single defs).
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(s) { let k = app.indexOf('{', s), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(s, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing fn ' + n); return braceSlice(i); }
function konstSrc(n) { const m = new RegExp('const ' + n + '\\s*=\\s*').exec(app); if (!m) throw new Error('missing const ' + n); const eq = m.index + m[0].length, f = app[eq]; if (f === '{' || f === '[') { const b = braceSlice(eq); const s = app.indexOf(';', eq + b.length); return app.slice(m.index, s + 1); } const s = app.indexOf(';', eq); return app.slice(m.index, s + 1); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }
const RANGES = ['24h', '7d', '30d', '1y', 'all'], HOUR = 36e5, DAY = 864e5, MIN = 60000, T = 1_800_000_000_000;

// ── engine context: calc + renderer + merge ──────────────────────────────────
const CONSTS = ['_AURIX_RET_MIN_BASE', '_AURIX_RET_SANE_PCT', '_AURIX_SNAP_NEAR_MS', '_AURIX_SNAP_NEAR_FRAC', '_AURIX_SNAP_FE_AUTHORITY_MS', '_AURIX_VP_GAP_FLOOR_MS', '_AURIX_VP_GAP_MEDIAN_MULT', '_AURIX_OBS_GAP_MIN_MS', '_AURIX_OBS_GAP_MAX_MS', '_AURIX_REGIME_CLIFF_FRAC', '_AURIX_BRIDGE_SEG_ENABLED', '_AURIX_BRIDGE_SEG_FRAC', '_AURIX_CAPITAL_STEP_SEG_ENABLED', '_AURIX_SPARSE_RAMP_SEG_ENABLED', '_AURIX_VJUMP_MIN_FRAC', '_AURIX_VJUMP_P95_MULT', '_AURIX_CAPSTEP_RATIO_LO', '_AURIX_CAPSTEP_RATIO_HI', '_AURIX_CAPSTEP_TS_PAD_MS', '_AURIX_SPARSE_RAMP_MULT', '_AURIX_SPARSE_RAMP_MIN_MS', '_AURIX_CHART_CONTINUITY_UNIFICATION', '_AURIX_EMG_RANGE_MS', '_AURIX_ORPHAN_CLEANUP_ENABLED', '_AURIX_ORPHAN_MAX_PTS', '_AURIX_RC_ASPECT', '_AURIX_CHART_UNIFIED_REAL_POINT_DENSITY', '_AURIX_UNIFIED_VP_DENSITY', '_AURIX_VP_DENSITY', '_AURIX_CHART_UNIFIED_X_PROJECTION_POLICY', '_AURIX_RC_PAD_FRAC', '_AURIX_UNIFIED_X_FILL_BETA', '_AURIX_X_FILL_BETA', '_AURIX_IR_VALUE_MARGIN', '_AURIX_IR_VPAD_FRAC', '_AURIX_Y_JUMP_DOMINANCE', '_AURIX_Y_LEGIBLE_ALPHA'];
const FNS = ['_aurixNetFlowsInWindow', '_aurixComputePeriodReturn', '_wscFmtAxisVal', '_aurixNormalizeBackendSnapshot', '_aurixMergeSnapshotSources', '_aurixSplitAtGaps', '_aurixConfirmedBridgeGaps', '_aurixVerticalJumps', '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks', '_aurixRealGapFloorMs', '_aurixBuildContinuityValidatedSeries', '_aurixStructuralBreaks', '_aurixVpTargetPointCount', 'downsampleAurixLTTB', '_aurixSignificantLocalExtrema', 'downsampleAurixAdaptive', 'computeAurixAdaptiveXScale', 'computeAurixValueScale', '_aurixMonotonePath', 'buildAurixAreaPath', 'renderValidatedPortfolioChartWithInstitutionalRenderer'];
let FLOWS = [];
const ctx = { console: { log() {} }, Math, JSON, Object, Number, String, Boolean, Array, isFinite, Infinity, Set, RegExp, Date, window: {} };
ctx._aurixLoadCapitalFlows = () => FLOWS; ctx.toBase = v => v;
vm.createContext(ctx);
CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (_) {} });
FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (e) { console.log('(fn ' + f + ' ' + e.message + ')'); } });
const CPR = (r, a, b) => vm.runInContext('_aurixComputePeriodReturn', ctx)(r, a, b);
const FMT = v => vm.runInContext('_wscFmtAxisVal', ctx)(v);
const merge = (fe, be) => vm.runInContext('_aurixMergeSnapshotSources', ctx)(fe, be);
const SB = (pts, r) => vm.runInContext('_aurixStructuralBreaks', ctx)(pts, r);
const render = (pts, r, vw, vh) => vm.runInContext('renderValidatedPortfolioChartWithInstitutionalRenderer', ctx)(pts.map(p => ({ ts: p.time != null ? p.time : p.ts, value: p.value })), { range: r, vw: vw, vh: vh });
const mCount = d => ((d || '').match(/M /g) || []).length;
// parse pixel x of each subpath; a vertical line = non-increasing x within a subpath
function xMonotonicPerSubpath(linePath) {
  const subs = (linePath || '').split(/(?=M )/).map(s => s.trim()).filter(Boolean);
  for (const sp of subs) { const xs = (sp.match(/[ML]\s+(-?[\d.]+)\s+(-?[\d.]+)/g) || []).map(t => parseFloat(t.replace(/[ML]\s+/, '').split(/\s+/)[0])); for (let i = 1; i < xs.length; i++) if (!(xs[i] > xs[i - 1])) return false; }
  return true;
}
const finitePath = d => d && !/NaN|Infinity|undefined/.test(d);
// range fixtures: continuous dense series over the range window (healthy, no gap)
const seriesFor = r => { const span = ({ '24h': 20 * HOUR, '7d': 5 * DAY, '30d': 20 * DAY, '1y': 300 * DAY, 'all': 300 * DAY })[r]; const n = 120; const o = []; for (let i = 0; i < n; i++) o.push({ time: T - span + Math.round(i * span / (n - 1)), value: +(6000 + i * 3).toFixed(2) }); return o; };

// ── A) per-range calc certification (same pipeline, baseline/endpoint, flow-neutral, one number, dead-band) ──
console.log('\nA) per-range financial certification:');
RANGES.forEach(r => {
  FLOWS = [];
  const s = seriesFor(r), first = s[0], last = s[s.length - 1];
  const res = CPR(r, { ts: first.time, value: first.value }, { ts: last.time, value: last.value });
  const expected = +(((last.value - first.value - res.netFlows) / first.value) * 100).toFixed(4);
  const colorExpected = res.returnPct > 0.05 ? 'up' : (res.returnPct < -0.05 ? 'down' : 'flat');
  ok(r + ' baseline+marketPnl+cashflows==current (residual 0)', Math.abs(first.value + res.returnValue + res.netFlows - last.value) <= 0.01);
  ok(r + ' publishedReturnPct == flow-neutral market return', res.returnState === 'ok' && Math.abs(res.returnPct - expected) <= 0.0001, 'pct=' + res.returnPct + ' exp=' + expected);
  ok(r + ' colour derives from the SAME number via ±0.05 dead-band', res.color === colorExpected);
});
// deposit / withdrawal cross-check on a mid range
{ FLOWS = [{ ts: T - 10 * DAY, amountUSD: 2000 }]; const s = seriesFor('30d'); const r30 = CPR('30d', { ts: s[0].time, value: 6000 }, { ts: s[s.length - 1].time, value: 8100 });
  ok('deposit excluded (equation holds, published==market-only)', Math.abs(6000 + r30.returnValue + r30.netFlows - 8100) <= 0.01 && r30.netFlows === 2000); FLOWS = []; }

// ── B) geometry audit (single renderer, no infinite/vertical/tooth/double-render) ─────────────
console.log('\nB) geometry audit:');
RANGES.forEach(r => {
  const rc = render(seriesFor(r), r, 1000, 240);
  ok(r + ' renders one finite continuous path (no NaN/Infinity, no vertical, single subpath for healthy data)',
    rc.ok && finitePath(rc.linePath) && finitePath(rc.areaPath) && mCount(rc.linePath) === 1 && rc.segmentCount === 1 && xMonotonicPerSubpath(rc.linePath),
    'M=' + mCount(rc.linePath) + ' seg=' + rc.segmentCount + ' monotonic=' + xMonotonicPerSubpath(rc.linePath));
  ok(r + ' area subpaths == line subpaths (no double render / stray fill)', mCount(rc.areaPath) === mCount(rc.linePath));
});

// ── C) range switch changes ONLY window+scale, not calc/color/baseline/endpoint ─────────────
console.log('\nC) range-switch invariance:');
{ // a single fixed dataset viewed at different ranges: baseline/endpoint/return are a pure function of the
  // window slice, never of "which button"; there is no per-range recomputation branch of the % engine.
  ok('C1 exactly ONE flow-neutral engine (no per-range % recompute)', (app.match(/function _aurixComputePeriodReturn\(/g) || []).length === 1);
  ok('C2 the % is a pure fn of (baseline,endpoint,flows) — same inputs ⇒ same output across ranges', (function () {
    const a = { ts: T, value: 6000 }, b = { ts: T + 5 * DAY, value: 6120 }; FLOWS = [];
    return RANGES.every(r => Math.abs(CPR(r, a, b).returnPct - CPR('7d', a, b).returnPct) <= 0.0001 || CPR(r, a, b).returnState !== 'ok' || CPR('7d', a, b).returnState !== 'ok');
  })());
  ok('C3 range affects only the SANE-BOUND guard + window (documented), never the formula', /const bound = _AURIX_RET_SANE_PCT\[r\]/.test(fnSrc('_aurixComputePeriodReturn')) && /neutralDelta \/ startV/.test(fnSrc('_aurixComputePeriodReturn'))); }

// ── D) desktop / mobile parity (same data contract; only viewport scales) ─────────────────────
console.log('\nD) desktop/mobile parity:');
RANGES.forEach(r => {
  const d = render(seriesFor(r), r, 1000, 240), m = render(seriesFor(r), r, 390, 200);
  ok(r + ' desktop==mobile segment structure (same segmentCount + structuralBreakCount)', d.segmentCount === m.segmentCount && d.structuralBreakCount === m.structuralBreakCount);
});
ok('D1 both surfaces paint the SAME emg contract from buildProductionPortfolioChart', (app.match(/renderValidatedPortfolioChartWithInstitutionalRenderer\(emg\.points/g) || []).length >= 2);

// ── E) overnight stability (backend 15-min across the night ⇒ no new gap/vertical/bridge) ─────
console.log('\nE) overnight stability:');
{ const feEve = []; for (let i = 0; i < 240; i++) feEve.push({ ts: T - 30 * HOUR + i * MIN, value: 6000 });
  const eveLast = feEve[feEve.length - 1].ts, morn = eveLast + Math.round(6.9 * HOUR);
  const feMorn = []; for (let i = 0; i < 180; i++) feMorn.push({ ts: morn + i * MIN, value: 6060 });
  const be = []; { const end = feMorn[feMorn.length - 1].ts; for (let t = feEve[0].ts; t <= end; t += 15 * MIN) be.push({ ts: t, value: 6000, total_value_usd: 6000, source: 'backend_snapshot' }); }
  const merged = merge(feEve.concat(feMorn), be);
  ok('E1 overnight merged series has 0 structural breaks in every range (no new gap/bridge)', RANGES.every(r => (SB(merged.map(p => ({ time: p.ts, value: (p.source === 'backend_snapshot' ? p.total_value_usd : p.value) })), r).breaks || []).length === 0));
  const rc = render(merged.map(p => ({ time: p.ts, value: (p.source === 'backend_snapshot' ? p.total_value_usd : p.value) })), '24h', 1000, 240);
  ok('E2 overnight render: one continuous finite path, no vertical, single segment', rc.ok && finitePath(rc.linePath) && xMonotonicPerSubpath(rc.linePath) && rc.segmentCount === 1, 'seg=' + rc.segmentCount);
  // "next morning" more points accrue CONTIGUOUSLY at the recent edge ⇒ still no new artefact/gap
  const extra = []; for (let i = 1; i <= 60; i++) extra.push({ ts: feMorn[feMorn.length - 1].ts + i * MIN, value: 6062 });
  const be2 = []; { const end2 = extra[extra.length - 1].ts; for (let t = feEve[0].ts; t <= end2; t += 15 * MIN) be2.push({ ts: t, value: 6000, total_value_usd: 6000, source: 'backend_snapshot' }); }
  const merged2 = merge(feEve.concat(feMorn).concat(extra), be2);
  ok('E3 more points next day (contiguous) ⇒ still 0 breaks (no artefact accrual)', (SB(merged2.map(p => ({ time: p.ts, value: (p.source === 'backend_snapshot' ? p.total_value_usd : p.value) })), '24h').breaks || []).length === 0); }

// ── F) premium visual finish (labels/grid/gutter) — NEVER touches the curve ───────────────────
console.log('\nF) premium visual (presentation-only):');
ok('F1 institutional K/M labels, no trailing .0 (20000→20K, 19000→19K, 1.5M/2M)', FMT(20000) === '20K' && FMT(19000) === '19K' && FMT(18000) === '18K' && FMT(1.5e6) === '1.5M' && FMT(2e6) === '2M');
ok('F2 informative decimals kept (20200→20.2K, 17347→17.3K)', FMT(20200) === '20.2K' && FMT(17347) === '17.3K');
ok('F3 no label ever ends in ".0K"/".00M" (clean)', [20000, 19000, 18000, 2e6, 1e6, 6000, 12345, 48920].every(v => !/\.0+[KM]$/.test(FMT(v))));
ok('F4 grid is FIXED-coordinate (scale-uniform spacing/geometry, not value-derived)', /<line class="h" x1="14" y1="77" x2="900" y2="77"\/><line class="h" x1="14" y1="130"/.test(app) && /<line class="v" x1="257" y1="24"/.test(app));
ok('F5 Y-label gutter nudged to x=973 (≈7px toward edge, wider curve↔label gap; text-anchor:end)', /class="mob-ylab" x="973"[\s\S]{0,120}text-anchor="end"/.test(app));
ok('F6 axis formatter is axis-only (never tooltip/badge/return) — 2 tick callers', (app.match(/_wscFmtAxisVal\(/g) || []).length === 3 /* 1 def + 2 tick callers */);
ok('F7 line thickness / glow / end-dot unchanged (mobile stroke-width 2.25 kept)', /class="aurix-lite-line"[\s\S]{0,120}stroke-width="2.25"/.test(app));
ok('F8 curve geometry independent of labels (linePath from _aurixMonotonePath, not the label text)', /const rp = _aurixMonotonePath\(run, xScale, yScale\)/.test(app) && !/mob-ylab[\s\S]{0,40}linePath/.test(app));

// ── G) FROZEN ENGINE INVARIANTS (deploy-gate) ─────────────────────────────────────────────────
console.log('\nG) frozen-engine invariants:');
ok('G1 _aurixComputePeriodReturn unchanged (single def, flow-neutral formula intact)', (app.match(/function _aurixComputePeriodReturn\(/g) || []).length === 1 && /neutralDelta = rawDelta - nf\.net/.test(app));
ok('G2 merge / FRC / gap-floor / renderer single defs (frozen)', (app.match(/function _aurixMergeSnapshotSources\(/g) || []).length === 1 && (app.match(/function _aurixResolveFinalRenderSeriesContract\(/g) || []).length === 1 && (app.match(/function _aurixRealGapFloorMs\(/g) || []).length === 1 && (app.match(/function renderValidatedPortfolioChartWithInstitutionalRenderer\(/g) || []).length === 1);
ok('G3 dead-band is presentation-only (color from returnPct, number never clamped)', /out\.color = neutralPct > 0\.05 \? 'up' : \(neutralPct < -0\.05 \? 'down' : 'flat'\)/.test(app) && /out\.returnPct = \+neutralPct\.toFixed\(4\)/.test(app));
ok('G4 spec marker present', /CHART_PRODUCTION_CERTIFICATION/.test(app));

// ── H) HISTORY VALIDATION (SPEC CHART ENGINE — VALIDACIÓN DEFINITIVA DEL HISTÓRICO) ───────────
// Sections A–G certify the CALC and the GEOMETRY. What they never covered is the stage that decides
// HOW MUCH HISTORY EXISTS, which is what makes a range publish or honestly suppress: the trust floor
// (`_aurixInvestableChartEpoch`) + the sanitation stages. The live audit proved the engine correct and
// found NO defect; these asserts pin the exact invariants it verified so a future change to the epoch
// owner or the sanitation order cannot silently blank 1Y/TOTAL or resurrect quarantined snapshots.
console.log('\nH) history validation (trust floor + sanitation + honest suppression):');
{
  const hCtx = { console: { log() {} }, Math, JSON, Object, Number, String, Boolean, Array, isFinite, Infinity, Set, RegExp, Date, window: {} };
  hCtx.toBase = v => v;
  let LS = {};
  hCtx.localStorage = { getItem: k => (k in LS ? LS[k] : null), setItem(k, v) { LS[k] = String(v); }, removeItem(k) { delete LS[k]; } };
  let DISPLAY = [];
  vm.createContext(hCtx);
  ['_AURIX_CHART_EPOCH_BAND_LO', 'AURIX_INVESTABLE_CHART_EPOCH', 'INVESTABLE_CHART_EPOCH_KEY', 'PORTFOLIO_EPOCH_KEY',
   '_AURIX_HPQ_FUTURE_MS', '_AURIX_HPQ_SPIKE_JUMP', '_AURIX_HPQ_SPIKE_REVERT_FRAC', '_AURIX_HPQ_MIN_POINTS', '_AURIX_EMG_RANGE_MS',
   '_AURIX_EMG_ADJ_JUMP', '_AURIX_EMG_FALLBACK_TAIL', '_AURIX_CHART_24H_FE_AUTHORITY', '_AURIX_CHART_EPOCH_TRUST',
  ].forEach(c => { try { vm.runInContext(konstSrc(c), hCtx); } catch (_) {} });
  ['_aurixInvestableChartEpoch', '_aurixPortfolioEpoch', '_aurixTrustedChartSource', '_aurixSourceFamily',
   '_aurixApplyRangeSourceAuthority', '_aurix24hSourceCoverage', '_aurixHpqIso', '_aurixHpqDiag', '_aurixHpqRawStages',
   '_aurixHpqQuarantineSpikes', '_aurixHpqTrimConstruction', '_aurixProdPlateauFilter',
   '_aurixHpqFirstInvalidStage', '_aurixHpqRangesContaining', 'buildValidatedHistoricalSeries',
  ].forEach(f => { try { vm.runInContext(fnSrc(f), hCtx); } catch (e) { console.log('  (fn ' + f + ' ' + e.message + ')'); } });
  vm.runInContext('var _aurixHistorySourceForDisplay = function () { return DISPLAY; };', hCtx);
  Object.defineProperty(hCtx, 'DISPLAY', { get: () => DISPLAY });
  const EPOCH = vm.runInContext('AURIX_INVESTABLE_CHART_EPOCH', hCtx);
  const trusted = src => vm.runInContext('_aurixTrustedChartSource', hCtx)(src);
  const built = r => vm.runInContext('buildValidatedHistoricalSeries', hCtx)(r);
  const epochOf = () => vm.runInContext('_aurixInvestableChartEpoch', hCtx)();
  // dense, healthy post-epoch series (values well inside the ±band so only the floor can trim)
  const mk = (fromTs, toTs, stepMs, v0) => { const o = []; let i = 0; for (let t = fromTs; t <= toTs; t += stepMs, i++) o.push({ ts: t, total: +(v0 * (1 + 0.0004 * i)).toFixed(2), real_estate: 0 }); return o; };

  // H1 — the trust floor owner. A moving/absent floor is what silently blanks a whole range.
  ok('H1 trust epoch is a FIXED past instant (never Date.now(), never future)',
     Number.isFinite(EPOCH) && EPOCH > 0 && EPOCH < Date.now() &&
     /const AURIX_INVESTABLE_CHART_EPOCH = \d+;/.test(app) &&
     !/AURIX_INVESTABLE_CHART_EPOCH = Date\.now/.test(app), 'epoch=' + new Date(EPOCH).toISOString());
  LS = {}; ok('H1b floor = max(portfolioEpoch, constant, override) — constant wins when it is the newest',
     epochOf() === EPOCH);
  LS = { [vm.runInContext('PORTFOLIO_EPOCH_KEY', hCtx)]: String(EPOCH + 10 * DAY) };
  ok('H1c a portfolio RESET epoch overrides the constant (never shows less-clean history)',
     epochOf() === EPOCH + 10 * DAY);
  LS = { [vm.runInContext('INVESTABLE_CHART_EPOCH_KEY', hCtx)]: String(EPOCH + 20 * DAY) };
  ok('H1d an explicit per-device override wins when it is the most recent', epochOf() === EPOCH + 20 * DAY);
  LS = {};

  // H2 — the floor drops pre-epoch snapshots and NEVER starves the series.
  {
    const pre = mk(EPOCH - 60 * DAY, EPOCH - 1 * DAY, DAY, 9000);
    const post = mk(EPOCH + HOUR, EPOCH + 40 * DAY, 6 * HOUR, 10000);
    const t = trusted(pre.concat(post));
    ok('H2 every pre-epoch snapshot is excluded from the trusted source',
       t.length === post.length && t.every(p => p.ts >= EPOCH), 'kept=' + t.length + '/' + (pre.length + post.length));
    const onlyPre = trusted(pre);
    ok('H2b never starves: with NOTHING post-epoch it falls through instead of returning empty',
       Array.isArray(onlyPre) && onlyPre.length >= 2);
  }

  // H3 — baseline post-reset: TOTAL cannot invent history before the reset.
  {
    const resetTs = EPOCH + 30 * DAY;
    LS = { [vm.runInContext('PORTFOLIO_EPOCH_KEY', hCtx)]: String(resetTs) };
    DISPLAY = mk(EPOCH + HOUR, EPOCH + 60 * DAY, 6 * HOUR, 10000);
    const all = built('all');
    ok('H3 post-reset TOTAL starts AT/AFTER the reset epoch (no invented prior history)',
       all.rangeSeries.length > 0 && all.rangeSeries[0].ts >= resetTs,
       'first=' + (all.rangeSeries[0] && new Date(all.rangeSeries[0].ts).toISOString()));
    ok('H3b post-reset baseline is the first POST-reset snapshot, not the oldest stored one',
       all.validatedFull.every(p => p.ts >= resetTs));
    LS = {};
  }

  // H4 — sanitation: corrupt / duplicated / unordered / future / stale, and DETERMINISM.
  {
    const clean = mk(EPOCH + HOUR, EPOCH + 40 * DAY, 6 * HOUR, 10000);
    const mid = clean[Math.floor(clean.length / 2)];
    const dirty = clean.concat([
      { ts: mid.ts, total: mid.total * 1.0001, real_estate: 0 },     // duplicate timestamp
      { ts: clean[3].ts, total: NaN, real_estate: 0 },               // non-finite
      { ts: clean[4].ts, total: 0, real_estate: 0 },                 // zero
      { ts: clean[5].ts, total: -500, real_estate: 0 },              // negative
      { ts: null, total: 12000, real_estate: 0 },                    // invalid ts
      { ts: clean[clean.length - 1].ts + 400 * DAY, total: 12500, real_estate: 0 },   // absurd future
    ]);
    // a mild spike stays inside the ±band, so it is the SPIKE stage (not the band) that must catch it
    dirty.push({ ts: clean[10].ts + MIN, total: +(clean[10].total * 1.8).toFixed(2), real_estate: 0 });
    const shuffled = dirty.map((p, i) => [p, (i * 2654435761) % dirty.length]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
    DISPLAY = shuffled;
    const a = built('all');
    const rules = new Set(a.quarantined.map(q => q.rejectionRule));
    // The trust filter runs FIRST, so structurally-impossible records (NaN / 0 / negative / invalid ts) are
    // already gone before the diagnostic stage and carry no quarantine record. What must be certified is the
    // OUTCOME — none of them can reach the published series — measured at the trusted source itself.
    const tr = trusted(shuffled);
    ok('H4 non-finite / zero / negative / invalid-ts snapshots never reach the series',
       tr.every(p => Number.isFinite(p.ts) && Number(p.total) > 0) &&
       a.rangeSeries.every(p => Number.isFinite(p.ts) && Number.isFinite(p.value) && p.value > 0),
       'trusted=' + tr.length + '/' + shuffled.length);
    ok('H4b the absurd FUTURE snapshot is dropped and never becomes the window anchor',
       a.counts.futureSnapshots >= 1 && rules.has('future_timestamp') && a.nowRef <= clean[clean.length - 1].ts,
       'nowRef=' + new Date(a.nowRef).toISOString());
    ok('H4b2 the in-band spike is caught by the SPIKE stage and leaves an audit record',
       a.counts.spikeRejectedSnapshots >= 1 && [...rules].some(x => /spike/i.test(String(x))), [...rules].join(','));
    ok('H4b3 every quarantine record carries its stage + rule (usable audit trail)',
       a.quarantined.every(q => q.pipelineStage && q.rejectionRule));
    ok('H4c the published series is strictly ascending with no duplicate timestamps',
       a.rangeSeries.every((p, i) => i === 0 || p.ts > a.rangeSeries[i - 1].ts));
    ok('H4d every published point is finite and strictly positive',
       a.rangeSeries.every(p => Number.isFinite(p.ts) && Number.isFinite(p.value) && p.value > 0));
    // determinism: same content, different ARRIVAL ORDER ⇒ byte-identical series (SPEC.09)
    DISPLAY = dirty.slice().sort((x, y) => (x.ts || 0) - (y.ts || 0));
    const b = built('all');
    ok('H4e result is independent of arrival order (deterministic dedupe/ordering)',
       JSON.stringify(a.rangeSeries.map(p => [p.ts, p.value])) === JSON.stringify(b.rangeSeries.map(p => [p.ts, p.value])),
       a.rangeSeries.length + ' vs ' + b.rangeSeries.length);
    // a single corrupted snapshot is caught on EVERY range, not only the tight short ones
    ok('H4f no corrupt snapshot survives on ANY of the five ranges',
       RANGES.every(r => { DISPLAY = shuffled; const v = built(r);
         return v.rangeSeries.length >= 2 &&
                v.rangeSeries.every(p => Number.isFinite(p.ts) && Number.isFinite(p.value) && p.value > 0) &&
                v.rangeSeries.every((p, i) => i === 0 || p.ts > v.rangeSeries[i - 1].ts); }));
  }

  // H5 — coverage / insufficiency: a range without enough history publishes NO %.
  {
    DISPLAY = mk(EPOCH + HOUR, EPOCH + 3 * HOUR, 15 * MIN, 10000);   // 3h of history only
    ['7d', '30d', '1y'].forEach(r => {
      const v = built(r);
      ok('H5 ' + r + ' flags its window as NOT covered when history is far shorter than the range',
         v.rangeCollapsedBecauseHistoryTooShort === true);
    });
    // the return owner itself refuses to publish on an unusable baseline / implausible residual
    FLOWS = [];
    const noBase = CPR('30d', { ts: T - 30 * DAY, value: 0.5 }, { ts: T, value: 900 });
    ok('H5b baseline at/below the floor ⇒ honest suppression, never a fabricated %',
       noBase.returnState !== 'ok' && noBase.returnPct == null, 'state=' + noBase.returnState);
    const insane = CPR('24h', { ts: T - DAY, value: 100 }, { ts: T, value: 400 });
    ok('H5c residual beyond the per-range sane band ⇒ honest suppression',
       insane.returnState !== 'ok' && insane.returnPct == null, 'state=' + insane.returnState);
  }

  // H6 — temporal states disappear once real history exists (and only then).
  {
    DISPLAY = mk(EPOCH + HOUR, EPOCH + 40 * DAY, 6 * HOUR, 10000);
    const covered = built('30d');
    ok('H6 with real coverage the range no longer reports itself as too short',
       covered.rangeCollapsedBecauseHistoryTooShort === false && covered.rangeSeries.length >= 8);
    ok('H6b the 24H partial-publication thresholds are still explicit (no silent fabrication)',
       /_AURIX_24H_PARTIAL_MIN_COVERAGE\s*=/.test(app) && /_AURIX_24H_PARTIAL_MIN_POINTS\s*=/.test(app) &&
       /_AURIX_24H_ENDPOINT_FRESH_MS\s*=/.test(app) && (app.match(/function _aurix24hReturnReadiness\(/g) || []).length === 1);
    ok('H6c a published partial 24H stays labelled PARTIAL (never promoted to full)',
       /partial24hPublished/.test(app) && /displayedRangeState = \(out\.historyTooShortForRange \|\| out\.partial24hPublished\) \? 'partial_history'/.test(app));
  }
  FLOWS = [];
}

const status = fail === 0 ? 'LAUNCH-READY ✓' : 'BLOCKED ✗ (deploy must not proceed)';
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed  —  ' + status);
process.exit(fail === 0 ? 0 : 1);   // BLOCKS DEPLOY on any failure
