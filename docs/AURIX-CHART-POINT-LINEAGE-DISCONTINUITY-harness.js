'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-POINT-LINEAGE-DISCONTINUITY-harness — SPEC DSH.CHART.POINT-LINEAGE.DISCONTINUITY.AUDIT.10
// ════════════════════════════════════════════════════════════════════════════
// Before/after proof of the new-account chart breakage (needles / islands / pre-account history / false
// 24H −0.99%). Runs the REAL visible pipeline in TWO sandboxes:
//   • GATE OFF (no _AURIX_CHART_EPOCH_TRUST) — reproduces the defects (root-cause evidence).
//   • GATE ON  (fix active) — the defects are resolved by trimming to the CURRENT economic epoch
//     (account-age/epoch floor + value-band [0.25×,2.5×] segmentation) BEFORE the existing stages.
// ROOT CAUSE: the visible pipeline (buildProductionPortfolioChart → _aurixHpqRawStages) applied NEITHER an
// account-age gate NOR the value-band epoch filter that the RETURN path already uses, so pre-account /
// out-of-band / multi-epoch points survived into the drawn line, and a pre-window point became the 24H
// "first comparable" → false −0.99%. The fix never fabricates points and never joins incompatible epochs.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function fn(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let k = app.indexOf('{', i), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(i, k); }
function konst(name) { const m = app.match(new RegExp('const ' + name + '\\s*=.*?;')); if (!m) throw new Error('missing ' + name); return m[0]; }
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }
const MIN = 60e3, HOUR = 36e5, DAY = 864e5;
const T0 = 1_800_000_000_000;

const CONSTS = ['_AURIX_EMG_RANGE_MS', '_AURIX_EMG_ADJ_JUMP', '_AURIX_EMG_FALLBACK_TAIL', '_AURIX_EMG_MIN_POINTS', '_AURIX_HPQ_MIN_POINTS', '_AURIX_HPQ_SPIKE_JUMP', '_AURIX_HPQ_SPIKE_REVERT_FRAC', '_AURIX_HPQ_FUTURE_MS', '_AURIX_PROD_MIN_POINTS', '_AURIX_PROD_GATE_PCT', '_AURIX_RET_MIN_BASE', '_AURIX_RET_SANE_PCT', '_AURIX_STEP_MATCH_MIN_CONF', '_AURIX_ALL_MIN_TRUST_SPAN_MS', '_AURIX_ALL_MIN_TRUST_POINTS', '_AURIX_VJUMP_MIN_FRAC', '_AURIX_VJUMP_P95_MULT', '_AURIX_CAPSTEP_RATIO_LO', '_AURIX_CAPSTEP_RATIO_HI', '_AURIX_CAPSTEP_TS_PAD_MS', '_AURIX_CAPITAL_STEP_SEG_ENABLED', '_AURIX_CHART_RECONCILE_GATE', '_AURIX_SNAP_NEAR_MS', '_AURIX_SNAP_NEAR_FRAC'];
const FNS = ['_aurixEmergencyHash', '_aurixProdPlateauFilter', '_aurixProdVisualGate', '_aurixHpqIso', '_aurixHpqDiag', '_aurixHpqRangesContaining', '_aurixHpqRawStages', '_aurixHpqTrimConstruction', '_aurixHpqQuarantineSpikes', '_aurixHpqFirstInvalidStage', 'buildValidatedHistoricalSeries', '_aurixNetFlowsInWindow', '_aurixComputePeriodReturn', '_aurixVerticalJumps', '_aurixCapitalStepBreaks', 'buildProductionPortfolioChart'];
// shared source + a per-sandbox mutable currentUser
const S = { HIST: [] };
function mk(withFix) {
  const ctx = { console, Math, JSON, Array, Number, isFinite, Infinity, Date, Map, Set, Object, isNaN, parseInt, parseFloat, String,
    toBase: v => v, _aurixLoadCapitalFlows: () => [], _aurixHistorySourceForDisplay: () => S.HIST,
    _aurixCanonicalHistoryReady: () => true, currentUser: { id: 'u' }, activeRange: '24h' };
  vm.createContext(ctx);
  CONSTS.forEach(c => vm.runInContext(konst(c), ctx));
  if (withFix) { vm.runInContext(konst('_AURIX_CHART_EPOCH_TRUST'), ctx); vm.runInContext(konst('_AURIX_CHART_EPOCH_BAND_LO'), ctx); vm.runInContext(fn('_aurixTrustedChartSource'), ctx); }
  FNS.forEach(n => vm.runInContext(fn(n), ctx));
  return {
    build: r => vm.runInContext('buildProductionPortfolioChart(' + JSON.stringify(r) + ')', ctx),
    validated: r => vm.runInContext('buildValidatedHistoricalSeries(' + JSON.stringify(r) + ')', ctx),
    setCreated: iso => { ctx.currentUser = { id: 'u', created_at: iso }; },
  };
}
const OFF = mk(false), ON = mk(true);
function series(t0, n, stepMin, valFn, src) { const out = []; for (let i = 0; i < n; i++) { const p = { ts: t0 + i * stepMin * MIN, total: +valFn(i).toFixed(2), real_estate: 0 }; if (src) p.source = src; out.push(p); } return out; }
function outOfBandCount(pts) { if (!pts.length) return 0; const last = pts[pts.length - 1].value; return pts.filter(p => last > 0 && (p.value > 2.5 * last || p.value < 0.25 * last)).length; }
function needleCount(pts) { let n = 0; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1].value, b = pts[i].value; if (a > 0 && Math.abs(b - a) / a > 0.25) n++; } return n; }

console.log('AURIX-CHART-POINT-LINEAGE-DISCONTINUITY — SPEC DSH.CHART.POINT-LINEAGE.DISCONTINUITY.AUDIT.10\n');
console.log('=== A. Out-of-band foreign cluster (island) ===');
{
  const oldCreated = new Date(T0 - 60 * DAY).toISOString(); OFF.setCreated(oldCreated); ON.setCreated(oldCreated);
  S.HIST = series(T0 - 20 * DAY, 8, 30, () => 9000).concat(series(T0 - 10 * DAY, 5, 30, () => 40000)).concat(series(T0 - 2 * HOUR, 8, 10, i => 9000 + 5 * i));
  ok('GATE OFF: 40k island PLOTTED (defect reproduced)', outOfBandCount(OFF.build('all').points) > 0, 'oob=' + outOfBandCount(OFF.build('all').points));
  ok('GATE ON: 40k island REMOVED (segmented to current epoch)', outOfBandCount(ON.build('all').points) === 0, 'oob=' + outOfBandCount(ON.build('all').points));
}

console.log('\n=== B. Pre-account-age points ===');
{
  const created = new Date(T0 - 3 * HOUR).toISOString(); OFF.setCreated(created); ON.setCreated(created);
  S.HIST = series(T0 - 200 * DAY, 6, 6 * 60, () => 9000).concat(series(T0 - 2 * HOUR, 8, 10, i => 9000 + 4 * i));
  const preOff = OFF.build('all').points.filter(p => p.ts < (T0 - 3 * HOUR)).length;
  const preOn = ON.build('all').points.filter(p => p.ts < (T0 - 3 * HOUR)).length;
  ok('GATE OFF: pre-account point plotted as real history (defect)', preOff > 0, 'pre=' + preOff);
  ok('GATE ON: pre-account points REMOVED (account-age gate)', preOn === 0, 'pre=' + preOn);
}

console.log('\n=== C. 24H needle from an out-of-band spike-cluster ===');
{
  const oldCreated = new Date(T0 - 60 * DAY).toISOString(); OFF.setCreated(oldCreated); ON.setCreated(oldCreated);
  S.HIST = series(T0 - 20 * HOUR, 5, 30, () => 9000).concat(series(T0 - 12 * HOUR, 3, 30, () => 30000)).concat(series(T0 - 4 * HOUR, 6, 30, () => 9000));
  ok('GATE OFF: ≥1 needle in plotted 24H (defect)', needleCount(OFF.build('24h').points) > 0, 'needles=' + needleCount(OFF.build('24h').points));
  ok('GATE ON: out-of-band cluster removed → no needle', needleCount(ON.build('24h').points) === 0, 'needles=' + needleCount(ON.build('24h').points));
}

console.log('\n=== D. False 24H −0.99% from a PRE-ACCOUNT first-comparable point ===');
{
  const created = new Date(T0 - 3 * HOUR).toISOString(); OFF.setCreated(created); ON.setCreated(created);
  // a pre-account point (ts < created_at) 20h ago sits inside the 24H window and becomes first-comparable;
  // an old anchor >24h prevents the "history too short" suppression from firing on GATE OFF.
  S.HIST = [{ ts: T0 - 40 * HOUR, total: 9050, real_estate: 0 }].concat(series(T0 - 20 * HOUR, 4, 30, () => 9100)).concat(series(T0 - 2 * HOUR, 6, 20, () => 9010));
  const off = OFF.build('24h'), on = ON.build('24h');
  ok('GATE OFF: false NEGATIVE 24H return published (the field −0.99%)', off.returnState === 'ok' && off.badgeReturnPct != null && off.badgeReturnPct < 0, 'rs=' + off.returnState + ' badge=' + off.badgeReturnPct);
  ok('GATE ON: pre-account contamination removed → 24H return NEUTRAL (honest)', on.returnState !== 'ok', 'rs=' + on.returnState + ' badge=' + on.badgeReturnPct);
}

console.log('\n=== E. Sustained out-of-band cluster survives validatedFull (no band filter, gate OFF) ===');
{
  const oldCreated = new Date(T0 - 60 * DAY).toISOString(); OFF.setCreated(oldCreated); ON.setCreated(oldCreated);
  S.HIST = series(T0 - 5 * DAY, 6, 60, () => 9000).concat(series(T0 - 4 * DAY, 6, 60, () => 40000)).concat(series(T0 - 3 * HOUR, 6, 20, () => 9000));
  ok('GATE OFF: 40k cluster in validatedFull (defect)', OFF.validated('all').validatedFull.some(p => p.value > 20000));
  ok('GATE ON: 40k cluster gone from validatedFull (band segmentation)', !ON.validated('all').validatedFull.some(p => p.value > 20000));
}

console.log('\n=== INVARIANTS THE FIX PRESERVES (gate ON) ===');
{
  const oldCreated = new Date(T0 - 400 * DAY).toISOString(); ON.setCreated(oldCreated);
  // F. determinism across 10 arrival orders
  const f = series(T0 - 18 * HOUR, 30, 30, i => 9000 + 6 * i + (i % 4) * 10);
  const hashes = []; for (let k = 0; k < 10; k++) { const rot = k % f.length; let a = f.slice(rot).concat(f.slice(0, rot)); if (k % 2) a = a.reverse(); S.HIST = a; hashes.push(ON.build('all').chartHash); }
  ok('F. deterministic across 10 arrival orders (v490 intact)', hashes.every(h => h && h === hashes[0]), Array.from(new Set(hashes)).join(','));
  // G. zero synthetic points
  S.HIST = series(T0 - 12 * HOUR, 20, 30, i => 9000 + 3 * i); const g = ON.build('all');
  const inTs = new Set(S.HIST.map(x => x.ts));
  ok('G. zero synthetic points (plotted ⊆ input)', g.points.every(p => inTs.has(p.ts)) && g.points.length <= S.HIST.length);
  // H. mature same-epoch clean history keeps real return
  S.HIST = series(T0 - 33 * DAY, 400, 120, i => 10000 + 6 * i); const h = ON.build('all');
  ok('H. mature same-epoch real return intact (not over-suppressed)', h.returnState === 'ok' && h.badgeReturnPct != null, 'rs=' + h.returnState + ' badge=' + h.badgeReturnPct);
  // I. legit deposit account is NOT blanked — the current epoch still renders a ready line (fix never
  //    starves a real account; the leading build is trimmed by the pre-existing construction logic).
  S.HIST = series(T0 - 10 * DAY, 8, 120, () => 5000).concat(series(T0 - 2 * DAY, 8, 120, () => 10000));
  const p = ON.build('all'); ok('I. legit deposit account NOT blanked (current epoch renders ready)', p.state === 'ready' && p.points.length >= 2, 'state=' + p.state + ' pts=' + p.points.length);
}

console.log('\n=== SOURCE CONTRACT ===');
ok('reversible flag _AURIX_CHART_EPOCH_TRUST present', /const _AURIX_CHART_EPOCH_TRUST = true;/.test(app));
ok('_aurixTrustedChartSource applies account-age/epoch floor + value band', /function _aurixTrustedChartSource/.test(app) && /created_at/.test(app) && /_AURIX_CHART_EPOCH_BAND_LO/.test(app));
ok('gate wired into _aurixHpqRawStages (typeof-guarded no-op where absent)', /typeof _AURIX_CHART_EPOCH_TRUST !== 'undefined' && _AURIX_CHART_EPOCH_TRUST && typeof _aurixTrustedChartSource === 'function'/.test(app));
ok('window.aurixChartPointLineageAudit instrumentation present', /window\.aurixChartPointLineageAudit = function/.test(app));
ok('never fabricates: no synthetic-point construction in trusted source', !/interpolat|forwardFill|forward_fill|bridgeGap/.test(fn('_aurixTrustedChartSource')));
ok('marker DSH.CHART.POINT-LINEAGE.DISCONTINUITY.AUDIT.10 present', /DSH\.CHART\.POINT-LINEAGE\.DISCONTINUITY\.AUDIT\.10/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
