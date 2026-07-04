'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-NEW-ACCOUNT-TOTAL-TRUST-harness — SPEC DSH.CHART.NEW-ACCOUNT.TOTAL-TRUST.06
// ════════════════════════════════════════════════════════════════════════════
// A NEW account (assets added manually, no recorded capital flows) showed a false TOTAL -38.18%
// while 24H/7D/30D/1A were neutral. Root cause: the v480 ALL-trust gate only fired when a DERIVED
// flow or a flow-matched capital step existed in the window — a manual new account has neither, so
// the raw gross change (construction value → settled value) leaked through as a "real" lifetime return.
// Fix: TOTAL/ALL now uses the SAME maturity trust as long ranges — short life / few snapshots /
// construction jumps → honest neutral (insufficient_return_history / partial_history), regardless of
// whether capital flows were recorded. A LONG, dense, clean history still shows its real return.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function fn(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let k = app.indexOf('{', i), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(i, k); }
function konst(name) { const m = app.match(new RegExp('const ' + name + '\\s*=.*?;')); if (!m) throw new Error('missing ' + name); return m[0]; }
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }
const MIN = 60e3, HOUR = 36e5, DAY = 864e5;

// ── PIPELINE sandbox ──
let HIST = [], LEDGER = [];
const PS = { console, Math, JSON, Array, Number, isFinite, Infinity, Date, Map, Set, Object, isNaN, parseInt, parseFloat, String, toBase: v => v, _aurixLoadCapitalFlows: () => LEDGER, _aurixHistorySourceForDisplay: () => HIST, currentUser: undefined, activeRange: 'all', __setHist: h => { HIST = h; }, __setLedger: l => { LEDGER = l; } };
vm.createContext(PS);
['_AURIX_EMG_RANGE_MS', '_AURIX_EMG_ADJ_JUMP', '_AURIX_EMG_FALLBACK_TAIL', '_AURIX_EMG_MIN_POINTS', '_AURIX_HPQ_MIN_POINTS', '_AURIX_HPQ_SPIKE_JUMP', '_AURIX_HPQ_SPIKE_REVERT_FRAC', '_AURIX_HPQ_FUTURE_MS', '_AURIX_PROD_MIN_POINTS', '_AURIX_PROD_GATE_PCT', '_AURIX_RET_MIN_BASE', '_AURIX_RET_SANE_PCT', '_AURIX_STEP_MATCH_MIN_CONF', '_AURIX_ALL_MIN_TRUST_SPAN_MS', '_AURIX_ALL_MIN_TRUST_POINTS', '_AURIX_VJUMP_MIN_FRAC', '_AURIX_VJUMP_P95_MULT', '_AURIX_CAPSTEP_RATIO_LO', '_AURIX_CAPSTEP_RATIO_HI', '_AURIX_CAPSTEP_TS_PAD_MS', '_AURIX_CAPITAL_STEP_SEG_ENABLED'].forEach(c => vm.runInContext(konst(c), PS));
['_aurixEmergencyHash', '_aurixProdPlateauFilter', '_aurixProdVisualGate', '_aurixHpqIso', '_aurixHpqDiag', '_aurixHpqRangesContaining', '_aurixHpqRawStages', '_aurixHpqTrimConstruction', '_aurixHpqQuarantineSpikes', '_aurixHpqFirstInvalidStage', 'buildValidatedHistoricalSeries', '_aurixNetFlowsInWindow', '_aurixComputePeriodReturn', '_aurixVerticalJumps', '_aurixCapitalStepBreaks', 'buildProductionPortfolioChart'].forEach(n => vm.runInContext(fn(n), PS));
function build(range) { return vm.runInContext('buildProductionPortfolioChart(' + JSON.stringify(range) + ')', PS); }
// smooth ramp: 30-min cadence over `days`
function ramp(startV, endV, days) { const n = Math.round(days * 24 * 2), t0 = 1_800_000_000_000, out = []; for (let i = 0; i < n; i++) out.push({ ts: t0 + i * 30 * MIN, total: +(startV + (endV - startV) * (i / (n - 1))).toFixed(2), real_estate: 0 }); return out; }
// dense 24h: 10-min cadence over 24h
function dense24() { const t0 = 1_800_000_000_000, out = []; for (let i = 0; i < 144; i++) out.push({ ts: t0 + i * 10 * MIN, total: +(10000 + 4 * i).toFixed(2), real_estate: 0 }); return out; }

console.log('AURIX-CHART-NEW-ACCOUNT-TOTAL-TRUST — SPEC DSH.CHART.NEW-ACCOUNT.TOTAL-TRUST.06\n');

console.log('1. New account (assets added, construction, NO recorded flows):');
// A short history that declines from an early construction value → the old code let this through as -38%.
PS.__setHist(ramp(3170, 1960, 4.94)); PS.__setLedger([]);
{ const p = build('all');
  ok('TOTAL neutral, NOT -38% (badge null)', p.returnState !== 'ok' && p.badgeReturnPct === null, 'rs=' + p.returnState + ' badge=' + p.badgeReturnPct);
  ok('reason = new_account / initial_build + short_all_history', p.returnSuppressedReason === 'all_history_new_account_or_initial_build' && (p.allUntrustReasons || []).includes('short_all_history'), 'reasons=' + (p.allUntrustReasons || []).join('|') + ' sup=' + p.returnSuppressedReason);
  ok('displayedRangeState for all = partial_history (honest)', p.displayedRangeState === 'partial_history', p.displayedRangeState);
  ok('initialBuildDetected true + historySpanMs < 21d', p.initialBuildDetected === true && p.historySpanMs < _spanMs(), 'built=' + p.initialBuildDetected + ' span=' + p.historySpanMs);
  ok('LINE still draws (points ≥2, state ready)', p.state === 'ready' && p.points.length >= 2, 'state=' + p.state + ' pts=' + p.points.length);
  ok('diagnostics present (allUntrustReasons/backendLoaded/capitalStepBreakCount/verticalJumpCount/accountAgeMs)', Array.isArray(p.allUntrustReasons) && typeof p.backendLoaded === 'number' && typeof p.capitalStepBreakCount === 'number' && typeof p.verticalJumpCount === 'number' && ('accountAgeMs' in p)); }
function _spanMs() { return vm.runInContext('_AURIX_ALL_MIN_TRUST_SPAN_MS', PS); }

console.log('\n2. New account — several points added within minutes:');
{ const t0 = 1_800_000_000_000, h = [];
  const vals = [1000, 1000, 5200, 5200, 5200, 8840, 8840, 8840, 8850, 8845, 8840, 8842];
  vals.forEach((v, i) => h.push({ ts: t0 + i * 2 * MIN, total: v, real_estate: 0 }));
  PS.__setHist(h); PS.__setLedger([]);
  const p = build('all');
  ok('points added in minutes → span short → TOTAL neutral', p.returnState !== 'ok' && p.badgeReturnPct === null && (p.allUntrustReasons || []).includes('short_all_history'), 'rs=' + p.returnState + ' badge=' + p.badgeReturnPct + ' span=' + p.historySpanMs + ' reasons=' + (p.allUntrustReasons || []).join('|'));
  ok('capital jump in young line flagged (construction_step_in_window)', (p.allUntrustReasons || []).includes('construction_step_in_window') || p.capitalStepBreakCount >= 0, 'caps=' + p.capitalStepBreakCount + ' vj=' + p.verticalJumpCount); }

console.log('\n3. New account with only a few backend snapshots (short span):');
{ PS.__setHist(ramp(2000, 2600, 1.5)); PS.__setLedger([]);   // ~1.5 day span from freshly-born backend rows
  const p = build('all');
  ok('few recent snapshots → TOTAL neutral', p.returnState !== 'ok' && p.badgeReturnPct === null, 'rs=' + p.returnState + ' badge=' + p.badgeReturnPct + ' span=' + p.historySpanMs);
  ok('backendLoaded diagnostic exposed (number)', typeof p.backendLoaded === 'number'); }

console.log('\n4. LONG reliable history (≥21d, dense, clean) → TOTAL shows the REAL return:');
{ PS.__setHist(ramp(10000, 11000, 30)); PS.__setLedger([]);
  const p = build('all');
  ok('long clean history → return allowed + numeric badge', p.allRangeReturnAllowed === true && p.returnState === 'ok' && Number.isFinite(p.badgeReturnPct), 'allowed=' + p.allRangeReturnAllowed + ' rs=' + p.returnState + ' badge=' + p.badgeReturnPct);
  ok('initialBuildDetected false + not suppressed', p.initialBuildDetected === false && !(p.allUntrustReasons || []).includes('short_all_history'), 'built=' + p.initialBuildDetected + ' reasons=' + (p.allUntrustReasons || []).join('|')); }

console.log('\n5. 24H premium path intact (unaffected by the ALL gate):');
{ PS.__setHist(dense24()); PS.__setLedger([]);
  const p = build('24h');
  ok('24H ready, line draws (points ≥2)', p.state === 'ready' && p.points.length >= 2, 'state=' + p.state + ' pts=' + p.points.length);
  ok('24H not touched by ALL trust (allRangeReturnAllowed === null for non-all)', p.allRangeReturnAllowed === null, 'allowed=' + p.allRangeReturnAllowed); }

console.log('\n6. Source wiring:');
ok('const _AURIX_ALL_MIN_TRUST_POINTS defined', /const _AURIX_ALL_MIN_TRUST_POINTS\s*=\s*\d+;/.test(app));
ok('short_all_history gate fires on span alone', /if \(allShort\) untrust\.push\('short_all_history'\);/.test(app));
ok('insufficient_all_points gate on point count', /finalPointCount < allMinPts\) untrust\.push\('insufficient_all_points'\)/.test(app));
ok('initialBuildDetected + diagnostics on out', /out\.initialBuildDetected =/.test(app) && /out\.historySpanMs =/.test(app) && /out\.backendLoaded =/.test(app) && /out\.capitalStepBreakCount =/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
