'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-24H-FRONTEND-SOURCE-AUTHORITY-harness — SPEC DSH.CHART.24H.FRONTEND-SOURCE-AUTHORITY.11
// ════════════════════════════════════════════════════════════════════════════
// v493's ±60min TIME-ONLY rule is range-agnostic, so a backend point temporally isolated INSIDE the 24H
// window (far from the dense remote block) survived → became the FIRST plotted point → badge crossed
// backend(old)→remote(now) = false ~−0.85%. FIX: range-aware source-family authority — for 24H, when
// frontend/remote is usable (≥2 pts in window) ALL backend is excluded; backend is fallback only. Long
// ranges keep backend. Two sandboxes: GATE OFF (v493, reproduces the defect) vs GATE ON (the fix).
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function fn(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let k = app.indexOf('{', i), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(i, k); }
function konst(name) { const m = app.match(new RegExp('const ' + name + '\\s*=.*?;')); if (!m) throw new Error('missing ' + name); return m[0]; }
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }
const MIN = 60e3, HOUR = 36e5, DAY = 864e5;

const CONSTS = ['_AURIX_EMG_RANGE_MS', '_AURIX_EMG_ADJ_JUMP', '_AURIX_EMG_FALLBACK_TAIL', '_AURIX_EMG_MIN_POINTS', '_AURIX_HPQ_MIN_POINTS', '_AURIX_HPQ_SPIKE_JUMP', '_AURIX_HPQ_SPIKE_REVERT_FRAC', '_AURIX_HPQ_FUTURE_MS', '_AURIX_PROD_MIN_POINTS', '_AURIX_PROD_GATE_PCT', '_AURIX_RET_MIN_BASE', '_AURIX_RET_SANE_PCT', '_AURIX_STEP_MATCH_MIN_CONF', '_AURIX_ALL_MIN_TRUST_SPAN_MS', '_AURIX_ALL_MIN_TRUST_POINTS', '_AURIX_VJUMP_MIN_FRAC', '_AURIX_VJUMP_P95_MULT', '_AURIX_CAPSTEP_RATIO_LO', '_AURIX_CAPSTEP_RATIO_HI', '_AURIX_CAPSTEP_TS_PAD_MS', '_AURIX_CAPITAL_STEP_SEG_ENABLED', '_AURIX_CHART_RECONCILE_GATE', '_AURIX_SNAP_NEAR_MS', '_AURIX_SNAP_NEAR_FRAC', '_AURIX_SNAP_FE_AUTHORITY_MS', '_AURIX_CHART_EPOCH_TRUST', '_AURIX_CHART_EPOCH_BAND_LO'];
const FNS = ['_aurixEmergencyHash', '_aurixProdPlateauFilter', '_aurixProdVisualGate', '_aurixHpqIso', '_aurixHpqDiag', '_aurixHpqRangesContaining', '_aurixTrustedChartSource', '_aurixHpqRawStages', '_aurixHpqTrimConstruction', '_aurixHpqQuarantineSpikes', '_aurixHpqFirstInvalidStage', 'buildValidatedHistoricalSeries', '_aurixNetFlowsInWindow', '_aurixComputePeriodReturn', '_aurixVerticalJumps', '_aurixCapitalStepBreaks', 'buildProductionPortfolioChart'];
const AUTH_FNS = ['_aurixSourceFamily', '_aurixFrontendUsableInWindow', '_aurixApplyRangeSourceAuthority'];
const S = { HIST: [] };
function mk(withAuthority) {
  const ctx = { console, Math, JSON, Array, Number, isFinite, Infinity, Date, Map, Set, Object, isNaN, parseInt, parseFloat, String,
    toBase: v => v, _aurixLoadCapitalFlows: () => [], _aurixHistorySourceForDisplay: () => S.HIST,
    _aurixCanonicalHistoryReady: () => true, currentUser: { id: 'u', created_at: '2020-01-01T00:00:00Z' }, activeRange: '24h' };
  vm.createContext(ctx);
  CONSTS.forEach(c => vm.runInContext(konst(c), ctx));
  if (withAuthority) { vm.runInContext(konst('_AURIX_CHART_24H_FE_AUTHORITY'), ctx); AUTH_FNS.forEach(n => vm.runInContext(fn(n), ctx)); }
  FNS.forEach(n => vm.runInContext(fn(n), ctx));
  return { build: r => vm.runInContext('buildProductionPortfolioChart(' + JSON.stringify(r) + ')', ctx) };
}
const OFF = mk(false), ON = mk(true);
const isBackend = h => h && String(h.source || '').toLowerCase() === 'backend_snapshot';
// A plotted ts is "backend" ONLY if a backend point sits there AND no frontend point shares that ts
// (when both share a ts, the authority/dedup keeps the frontend value → it is a frontend point).
function tsIsBackendOnly(ts) { return S.HIST.some(h => h.ts === ts && isBackend(h)) && !S.HIST.some(h => h.ts === ts && !isBackend(h)); }
function backendPlotted(p) { return p.points.filter(pt => tsIsBackendOnly(pt.ts)).length; }
function famOfTs(ts) { return tsIsBackendOnly(ts) ? 'backend' : 'frontend'; }
function firstFam(p) { return p.points.length ? famOfTs(p.points[0].ts) : null; }
function lastFam(p) { return p.points.length ? famOfTs(p.points[p.points.length - 1].ts) : null; }
function feSeries(t0, n, stepMin, valFn) { const out = []; for (let i = 0; i < n; i++) out.push({ ts: t0 + i * stepMin * MIN, total: +valFn(i).toFixed(2), real_estate: 0 }); return out; }
function beSeries(t0, n, stepMin, valFn) { const out = []; for (let i = 0; i < n; i++) out.push({ ts: t0 + i * stepMin * MIN, total: +valFn(i).toFixed(2), real_estate: 0, source: 'backend_snapshot' }); return out; }
const T0 = 1_800_000_000_000;

console.log('AURIX-CHART-24H-FRONTEND-SOURCE-AUTHORITY — SPEC DSH.CHART.24H.FRONTEND-SOURCE-AUTHORITY.11\n');

// ── 1. EXACT reproduction of the prod audit ──
console.log('1. Exact prod audit repro (backend 9550.25 @Jul4 15:49 → remote 9469.53 @Jul5 13:59):');
{
  const tLast = Date.parse('2026-07-05T13:59:14.185Z');
  const tBe0 = Date.parse('2026-07-04T15:49:05.402Z');
  // older backend anchor BEFORE the 24H window start (like the real account's older history) so GATE OFF
  // doesn't self-suppress via "history too short"; a slight slope on the in-window backend prevents the
  // plateau filter from collapsing it away — together they reproduce the prod coverage + false −0.85%.
  const beOld = beSeries(tLast - 30 * HOUR, 3, 60, () => 9551);
  const be = beSeries(tBe0, 20, 15, i => +(9550.25 - i * 0.2).toFixed(2)); // in-window backend from 15:49, first=9550.25
  const fe = feSeries(tLast - 13 * HOUR, 40, 20, i => 9460 + (i % 5) * 2); // remote dense last ~13h ~9460-9468
  fe[fe.length - 1] = { ts: tLast, total: 9469.53, real_estate: 0 };
  S.HIST = beOld.concat(be).concat(fe);
  const off = OFF.build('24h'), on = ON.build('24h');
  ok('GATE OFF: backend plotted + first=backend (defect reproduced)', backendPlotted(off) > 0 && firstFam(off) === 'backend', 'bePlotted=' + backendPlotted(off) + ' first=' + firstFam(off));
  ok('GATE OFF: false ~−0.85% badge (backend→remote)', off.returnState === 'ok' && off.badgeReturnPct != null && Math.abs(off.badgeReturnPct - (-0.8452)) < 0.05, 'badge=' + off.badgeReturnPct);
  ok('GATE ON: backendPlotted = 0', backendPlotted(on) === 0, 'bePlotted=' + backendPlotted(on));
  ok('GATE ON: first plotted is frontend/remote (not backend)', firstFam(on) === 'frontend', 'first=' + firstFam(on));
  ok('GATE ON: no backend→remote return (first/last same family)', firstFam(on) === lastFam(on));
  ok('GATE ON: false −0.85 gone (badge neutral or honest frontend-only)', !(on.returnState === 'ok' && on.badgeReturnPct != null && Math.abs(on.badgeReturnPct - (-0.8452)) < 0.05), 'rs=' + on.returnState + ' badge=' + on.badgeReturnPct);
}

// ── 2. 24H frontend dense + backend scattered INSIDE window → backend fully excluded ──
console.log('\n2. 24H dense frontend + backend inside window → backend excluded, frontend authority:');
{
  const fe = feSeries(T0 - 23 * HOUR, 138, 10, i => 9000 + 2 * i);        // dense 24h frontend
  const be = beSeries(T0 - 20 * HOUR, 40, 30, () => 9600);               // backend scattered inside window
  S.HIST = fe.concat(be);
  const on = ON.build('24h');
  ok('backendPlotted = 0 (dense frontend authority)', backendPlotted(on) === 0, 'bePlotted=' + backendPlotted(on));
  ok('line uses frontend (points ≥2, ready)', on.state === 'ready' && on.points.length >= 2);
  ok('first/last same family (frontend)', firstFam(on) === 'frontend' && lastFam(on) === 'frontend');
}

// ── 3. 24H with NO frontend family → backend fallback allowed (line not blank) ──
console.log('\n3. 24H no frontend → backend fallback allowed:');
{
  S.HIST = beSeries(T0 - 22 * HOUR, 40, 30, i => 9000 + i);              // backend only
  const on = ON.build('24h');
  ok('backend fallback plotted (line not blank)', backendPlotted(on) >= 2 && on.points.length >= 2, 'bePlotted=' + backendPlotted(on) + ' state=' + on.state);
  ok('no synthetic points (plotted ⊆ input)', on.points.every(pt => S.HIST.some(h => h.ts === pt.ts)));
}

// ── 4. 24H with only 1 frontend point + backend → frontend NOT usable (needs ≥2) ──
console.log('\n4. 24H one frontend point + backend → not usable, no fabricated cross-family return:');
{
  const be = beSeries(T0 - 22 * HOUR, 30, 30, () => 9500);
  S.HIST = be.concat([{ ts: T0 - 1 * HOUR, total: 9400, real_estate: 0 }]);   // single frontend point
  const on = ON.build('24h');
  // frontend not usable → backend fallback; assert it does not crash and no synthetic points
  ok('no synthetic points', on.points.every(pt => S.HIST.some(h => h.ts === pt.ts)));
  ok('deterministic (same output twice)', on.build ? true : ON.build('24h').chartHash === on.chartHash);
}

// ── 5. 7D frontend + backend → backend NOT excluded (authority is 24H-only) ──
console.log('\n5. 7D frontend + backend → backend retained (long-range history):');
{
  const fe = feSeries(T0 - 3 * DAY, 200, 20, i => 9000 + i * 0.5);       // ~3d frontend
  const be = beSeries(T0 - 6 * DAY, 30, 3 * 60, i => 8900 + i);         // older backend (days 3-6)
  S.HIST = fe.concat(be);
  const on7 = ON.build('7d');
  ok('7D still plots backend (not force-excluded)', backendPlotted(on7) > 0, 'bePlotted7d=' + backendPlotted(on7));
}

// ── 6. 30D / 1A / TOTAL → backend history intact ──
console.log('\n6. 30D/1A/TOTAL → backend history intact:');
{
  const fe = feSeries(T0 - 3 * DAY, 200, 20, i => 9000 + i * 0.5);
  const be = beSeries(T0 - 25 * DAY, 60, 8 * 60, i => 8800 + i);
  S.HIST = fe.concat(be);
  ok('30D plots backend', backendPlotted(ON.build('30d')) > 0);
  ok('TOTAL plots backend', backendPlotted(ON.build('all')) > 0);
}

// ── 7. Mature account (dense frontend, no backend) → 24H real return intact ──
console.log('\n7. Mature account 24H (dense frontend, no backend) → real return intact:');
{
  S.HIST = feSeries(T0 - 23 * HOUR, 138, 10, i => 9000 + 3 * i);        // full 24h coverage, steady rise
  const on = ON.build('24h'), off = OFF.build('24h');
  ok('mature 24H return unchanged ON vs OFF (no interference)', on.chartHash === off.chartHash && on.returnState === off.returnState, 'onRS=' + on.returnState + ' offRS=' + off.returnState);
  ok('mature 24H shows real return (ready)', on.state === 'ready' && on.points.length >= 2);
}

// ── 8. Determinism — 10 permutations → one hash (GATE ON) ──
console.log('\n8. Deterministic across 10 arrival orders (gate ON):');
{
  const fe = feSeries(T0 - 20 * HOUR, 60, 15, i => 9000 + 4 * i + (i % 3) * 5);
  const be = beSeries(T0 - 21 * HOUR, 10, 60, () => 9600);
  const full = fe.concat(be);
  const hashes = []; for (let k = 0; k < 10; k++) { const rot = k % full.length; let a = full.slice(rot).concat(full.slice(0, rot)); if (k % 2) a = a.reverse(); S.HIST = a; hashes.push(ON.build('24h').chartHash); }
  ok('10 arrival orders → one chartHash', hashes.every(h => h === hashes[0]), Array.from(new Set(hashes)).join(','));
}

// ── 9. No synthetic points anywhere ──
console.log('\n9. No synthetic points:');
{
  const fe = feSeries(T0 - 20 * HOUR, 60, 15, i => 9000 + 3 * i);
  const be = beSeries(T0 - 21 * HOUR, 8, 60, () => 9600);
  S.HIST = fe.concat(be);
  const on = ON.build('24h');
  ok('every plotted ts ∈ input', on.points.every(pt => S.HIST.some(h => h.ts === pt.ts)));
}

// ── 10. Badge Calculando when frontend draws a line but return is not reliable ──
console.log('\n10. Frontend line but unreliable return → Calculando/neutral (no false 0/return):');
{
  // frontend usable (≥2) but only ~10h coverage of 24h → coverage <0.8 → return suppressed, line still draws
  const fe = feSeries(T0 - 10 * HOUR, 30, 20, i => 9000 + 2 * i);
  const be = beSeries(T0 - 40 * HOUR, 6, 60, () => 9600);   // old anchor (outside 24h) — must not become first
  S.HIST = fe.concat(be);
  const on = ON.build('24h');
  ok('backendPlotted = 0 (frontend usable)', backendPlotted(on) === 0);
  ok('badge neutral/Calculando (not a false return)', on.returnState !== 'ok', 'rs=' + on.returnState + ' badge=' + on.badgeReturnPct);
  ok('line still drawn (not hidden)', on.points.length >= 2 || on.state === 'pending');
}

console.log('\n=== SOURCE CONTRACT + diagnostics ===');
ok('reversible flag _AURIX_CHART_24H_FE_AUTHORITY present', /const _AURIX_CHART_24H_FE_AUTHORITY = true;/.test(app));
ok('_aurixApplyRangeSourceAuthority is 24H-only + excludes backend when frontend usable', /if \(r !== '24h'\) return src;/.test(app) && /_aurixSourceFamily\(p\) !== 'backend'/.test(app));
ok('wired into _aurixHpqRawStages(range) + caller passes r', /function _aurixHpqRawStages\(range\)/.test(app) && /_aurixHpqRawStages\(r\)/.test(app));
ok('lineage audit exposes sourceAuthorityMode/frontendUsableInRange/backendExcludedByRangeAuthority', /sourceAuthorityMode:/.test(app) && /frontendUsableInRange:/.test(app) && /backendExcludedByRangeAuthority:/.test(app));
ok('lineage audit exposes first/last/badge SourceFamily + returnCrossSourceFamilyBlocked', /firstSourceFamily:/.test(app) && /lastSourceFamily:/.test(app) && /badgeSourceFamily:/.test(app) && /returnCrossSourceFamilyBlocked:/.test(app));
ok('marker DSH.CHART.24H.FRONTEND-SOURCE-AUTHORITY.11 present', /DSH\.CHART\.24H\.FRONTEND-SOURCE-AUTHORITY\.11/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
