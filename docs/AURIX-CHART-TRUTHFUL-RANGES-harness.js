'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-TRUTHFUL-RANGES-harness — SPEC DSH.CHART.TRUTHFUL_RANGES.01
// ════════════════════════════════════════════════════════════════════════════
// Confirmed cause: the remote canonical history is GENUINELY_SHORT (~5 days), so a
// finite requested range (7D/30D/1Y) collapses onto it. A requested-period return
// must then NOT be published as a numeric %/tone (no fabricated -52%/+288%). The LINE
// still draws the available real points; only the BADGE % is suppressed to the honest
// 'insufficient_return_history' state (painted 0.00% flat). 24H (full coverage) and ALL
// (all-history) are unaffected. Drives the REAL buildProductionPortfolioChart pipeline
// against a synthetic ~4.94-day history that reproduces the -52.35% scenario.
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fn(name) { const s = 'function ' + name + '('; const i = src.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let k = src.indexOf('{', i), d = 0; for (; k < src.length; k++) { const c = src[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return src.slice(i, k); }
function konst(name) { const m = src.match(new RegExp('const ' + name + '\\s*=.*?;')); if (!m) throw new Error('missing const ' + name); return m[0]; }

let HIST = [];     // history source: [{ ts, total, real_estate }]
let LEDGER = [];   // capital flows
const sb = {
  console, Math, JSON, Array, Number, isFinite, Infinity, Date, Map, Set, Object, isNaN, parseInt, parseFloat, String,
  toBase: (v /*, ccy */) => v,                              // USD == base in tests
  _aurixLoadCapitalFlows: () => LEDGER,
  _aurixHistorySourceForDisplay: () => HIST,
  currentUser: undefined, activeRange: '24h',
  __setHist: (h) => { HIST = h; }, __setLedger: (l) => { LEDGER = l; },
};
vm.createContext(sb);
['_AURIX_EMG_RANGE_MS', '_AURIX_EMG_ADJ_JUMP', '_AURIX_EMG_FALLBACK_TAIL', '_AURIX_EMG_MIN_POINTS',
 '_AURIX_HPQ_MIN_POINTS', '_AURIX_HPQ_SPIKE_JUMP', '_AURIX_HPQ_SPIKE_REVERT_FRAC', '_AURIX_HPQ_FUTURE_MS',
 '_AURIX_PROD_MIN_POINTS', '_AURIX_PROD_GATE_PCT', '_AURIX_RET_MIN_BASE', '_AURIX_RET_SANE_PCT'
].forEach(c => vm.runInContext(konst(c), sb));
['_aurixEmergencyHash', '_aurixProdPlateauFilter', '_aurixProdVisualGate', '_aurixHpqIso', '_aurixHpqDiag',
 '_aurixHpqRangesContaining', '_aurixHpqRawStages', '_aurixHpqTrimConstruction', '_aurixHpqQuarantineSpikes',
 '_aurixHpqFirstInvalidStage', 'buildValidatedHistoricalSeries', '_aurixNetFlowsInWindow',
 '_aurixComputePeriodReturn', 'buildProductionPortfolioChart'
].forEach(n => vm.runInContext(fn(n), sb));

const MIN = 60e3, DAY = 864e5;
let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name + (info ? '  [' + info + ']' : '')); } else { fail++; console.log('  ✗ ' + name + (info ? '  [' + info + ']' : '')); } }
function build(range) { return vm.runInContext('buildProductionPortfolioChart(' + JSON.stringify(range) + ')', sb); }
// ~4.94-day history at 30-min cadence, value ramps startV→endV linearly (no spikes → nothing quarantined).
function ramp(startV, endV, days) {
  const n = Math.round(days * 24 * 2), t0 = 1_800_000_000_000, out = [];
  for (let i = 0; i < n; i++) out.push({ ts: t0 + i * 30 * MIN, total: +(startV + (endV - startV) * (i / (n - 1))).toFixed(2), real_estate: 0 });
  return out;
}

console.log('AURIX-CHART-TRUTHFUL-RANGES — SPEC DSH.CHART.TRUTHFUL_RANGES.01\n');

console.log('SOURCE WIRING (guard exists + reuses honest painter):');
{ const s = fn('buildProductionPortfolioChart');
  ok('a guard reads historyTooShortForRange (collapsed OR coverage<0.8)', /historyTooShortForRange = !!\(_finiteRange && \(out\.rangeCollapsedBecauseHistoryTooShort === true \|\| \(out\.coverageRatio != null && out\.coverageRatio < 0\.8\)\)\)/.test(s));
  ok('b suppressed return reuses insufficient_return_history + explicit reason', /out\.returnState = 'insufficient_return_history';/.test(s) && /insufficient_requested_range_history/.test(s));
  ok('c ALL / 24H not forced (finiteRange gate)', /_finiteRange = \(r !== 'all'\)/.test(s)); }

console.log('\nGENUINELY-SHORT (~4.94d) history, gross ≈ -52.35% (reproduces the bug):');
sb.__setHist(ramp(10000, 4765, 4.94)); sb.__setLedger([]);
const d30 = build('30d'), d1y = build('1y'), d7 = build('7d'), d24 = build('24h'), dall = build('all');
// 9. -52.35 scenario reproduced then SUPPRESSED on 30D.
ok('1 30D collapsed → return SUPPRESSED (no numeric %)', d30.state === 'ready' && d30.returnState !== 'ok' && d30.badgeReturnPct === null && d30.returnPct === null, 'state=' + d30.state + ' rs=' + d30.returnState + ' badge=' + d30.badgeReturnPct + ' cov=' + d30.coverageRatio);
ok('2 30D grossPct is the ~-52% that is NOW hidden from the badge', Math.abs(d30.lineReturnPct + 52.35) < 1.0 && d30.color === 'flat', 'gross=' + d30.lineReturnPct + ' color=' + d30.color);
// 3/4. 1Y + 7D suppressed.
ok('3 1Y collapsed → SUPPRESSED', d1y.state === 'ready' && d1y.returnState !== 'ok' && d1y.badgeReturnPct === null, 'rs=' + d1y.returnState + ' cov=' + d1y.coverageRatio);
ok('4 7D collapsed → SUPPRESSED', d7.state === 'ready' && d7.returnState !== 'ok' && d7.badgeReturnPct === null, 'rs=' + d7.returnState + ' cov=' + d7.coverageRatio);
// 5. coverageRatio < 0.8 on the collapsed finite ranges.
ok('5 collapsed finite ranges report coverageRatio < 0.8', d30.coverageRatio < 0.8 && d1y.coverageRatio < 0.8 && d7.coverageRatio < 0.8, '7d=' + d7.coverageRatio + ' 30d=' + d30.coverageRatio + ' 1y=' + d1y.coverageRatio);
// 7. LINE still draws even when badge suppressed.
ok('7 line still renders (points + ready) despite suppressed badge', d30.points.length >= 2 && d30.state === 'ready' && d1y.points.length >= 2, '30d pts=' + d30.points.length);
// 6. 24H full coverage (history extends past 24h) → NOT suppressed, real return shown.
ok('6 24H full coverage → returnState ok + numeric return + not collapsed', d24.returnState === 'ok' && Number.isFinite(d24.returnPct) && d24.rangeCollapsedBecauseHistoryTooShort === false, 'rs=' + d24.returnState + ' pct=' + d24.returnPct + ' cov=' + d24.coverageRatio);
ok('6b 24H return is the LOCAL last-24h slice, NOT the -52%', Math.abs(d24.returnPct) < 25, 'pct=' + d24.returnPct);
// 8. ALL unchanged (all-history semantics; governed by existing sane band, not this guard).
ok('8 ALL unchanged (not a finite requested range) → still computes', dall.returnState === 'ok' && Math.abs(dall.returnPct + 52.35) < 1.0 && dall.coverageRatio === null, 'rs=' + dall.returnState + ' pct=' + dall.returnPct);

console.log('\n24H sign correctness (green/red still works on full-coverage 24H):');
sb.__setHist(ramp(10000, 10800, 4.94));   // rising history → last-24h slice is positive
{ const up = build('24h'); ok('9 24H up-trend → returnState ok + color up', up.returnState === 'ok' && up.color === 'up' && up.returnPct > 0, 'pct=' + up.returnPct + ' color=' + up.color); }
sb.__setHist(ramp(10000, 9200, 4.94));    // falling history → last-24h slice negative
{ const dn = build('24h'); ok('10 24H down-trend → returnState ok + color down', dn.returnState === 'ok' && dn.color === 'down' && dn.returnPct < 0, 'pct=' + dn.returnPct + ' color=' + dn.color); }

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
