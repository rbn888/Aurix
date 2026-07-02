'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-RETURNS-RETIMING — SPEC DSH.CHART.RETURNS.RETIMING.01
// v471 re-anchored mis-timestamped derived flows to BASE → fixed 24H but left 7D/30D/1A/TOTAL at a
// FALSE 0.00%: the construction capital inside those windows was no longer subtracted, so the gross
// growth (capital, not return) tripped the sane band. This fix RE-TIMES an uncorroborated derived flow
// to the matching structural step in portfolioHistory (ledger sizes it, history times it) so it falls
// back INSIDE the right window and neutralises; falls back to the honest base anchor when no reliable
// step matches. Extracts the REAL helpers + REAL _aurixNetFlowsInWindow/_aurixComputePeriodReturn.
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fn(name) { const s = 'function ' + name + '('; const i = src.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let k = src.indexOf('{', i), d = 0; for (; k < src.length; k++) { const c = src[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return src.slice(i, k); }
let pass = 0, fail = 0; const ok = (n, c, g) => { if (c) { pass++; console.log('  ✓ ' + n + (g !== undefined ? '  [' + g + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (g !== undefined ? '  [' + g + ']' : '')); } };

const DAY = 86400e3;
const H0 = 1000 * DAY;              // earliest tracked snapshot
const HN = H0 + 30 * DAY;           // current snapshot
const MIGRATE = HN + 60 * DAY;      // migration Date.now() — well after history (the artefact ts)

const sb = { console, Math, Number, Array, JSON, isFinite, parseFloat, Infinity, String, Date,
  baseCurrency: 'USD', activePerfMode: 'pct',
  toBase: (amount) => Number(amount),
  _AURIX_LEDGER_SELF_HEAL: true,
  _AURIX_FLOW_CORROBORATE_MS: 3 * DAY, _AURIX_FLOW_CORROBORATE_FRAC: 0.4,
  _AURIX_STEP_MATCH_LO: 0.6, _AURIX_STEP_MATCH_HI: 1.6, _AURIX_STEP_MATCH_MIN_CONF: 0.5, _AURIX_STEP_SUSTAIN: 4,
  portfolioHistory: [], categoryHistory: [],
  _aurixPortfolioEpoch: () => 0,
  _STORE: [],
  _aurixLoadCapitalFlows: function () { return sb._STORE.slice(); },
  _AURIX_RET_MIN_BASE: 1,
  _AURIX_RET_SANE_PCT: { '24h': 25, '7d': 45, '30d': 80, '1y': 200, 'all': 250 } };
sb.window = sb;
vm.createContext(sb);
vm.runInContext(fn('_aurixEarliestTrackedTs'), sb);
vm.runInContext(fn('_aurixFlowTsCorroboratedByHistory'), sb);
vm.runInContext(fn('_aurixMatchHistoricalStep'), sb);
vm.runInContext(fn('_aurixFlowRetimeDecision'), sb);
vm.runInContext(fn('_aurixEffectiveFlowTs'), sb);
vm.runInContext(fn('_aurixNetFlowsInWindow'), sb);
vm.runInContext(fn('_aurixComputePeriodReturn'), sb);

const setHist = pts => { sb.portfolioHistory = pts.map(p => ({ ts: p.ts, value: p.value })); };
const decide = (amt, ts) => vm.runInContext(`_aurixFlowRetimeDecision(${amt}, ${ts})`, sb);
// place a single derived flow at its RE-TIMED ts, then compute the period return for a window
function ret(range, s, e, flowAmt, flowTs) {
  const dec = flowAmt ? decide(flowAmt, flowTs) : null;
  sb._STORE = flowAmt ? [{ ts: dec.effectiveTs, amountUSD: flowAmt, kind: flowAmt > 0 ? 'asset_add' : 'asset_remove' }] : [];
  const p = vm.runInContext('_aurixComputePeriodReturn(' + JSON.stringify(range) + ',' + JSON.stringify(s) + ',' + JSON.stringify(e) + ')', sb);
  return { dec, p };
}

console.log('AURIX-CHART-RETURNS-RETIMING — SPEC DSH.CHART.RETURNS.RETIMING.01\n');

// ── Construction scenario: a +19.9k structural step at H0+3d, sustained; then flat market drift. ──
// The derived flow (+20k asset_add) is stamped at migration time (MIGRATE), uncorroborated there.
const HSTEP = [
  { ts: H0,          value: 10000 },
  { ts: H0 + 2 * DAY, value: 10100 },
  { ts: H0 + 3 * DAY, value: 30000 },   // ← STEP +19900 (construction / asset add)
  { ts: H0 + 10 * DAY, value: 30300 },
  { ts: H0 + 23 * DAY, value: 30600 },
  { ts: H0 + 29 * DAY, value: 30900 },
  { ts: HN,           value: 31000 } ];

console.log('Re-time decision:');
setHist(HSTEP);
{ const d = decide(20000, MIGRATE);
  ok('1 uncorroborated migration flow re-timed to the matching structural step',
     d.reason === 'retimed_to_structural_step' && d.matchedStepTs === H0 + 3 * DAY && d.effectiveTs === H0 + 3 * DAY,
     d.reason + ' step@' + ((d.matchedStepTs - H0) / DAY) + 'd conf=' + d.confidence); }

console.log('\n7D/30D/1A/TOTAL no longer a FALSE 0.00% when the step is in-window:');
// TOTAL / 30D / 1A: window (H0, HN] contains the step → re-timed flow neutralises → +10% real return.
{ const { p } = ret('all', { ts: H0, value: 10000 }, { ts: HN, value: 31000 }, 20000, MIGRATE);
  ok('2 TOTAL: step in-window → +10% real (was 0.00%)', p.returnState === 'ok' && Math.abs(p.returnPct - 10) < 0.01, p.returnState + ' pct=' + p.returnPct + ' nf=' + p.netFlows); }
{ const { p } = ret('30d', { ts: H0, value: 10000 }, { ts: HN, value: 31000 }, 20000, MIGRATE);
  ok('3 30D: step in-window → +10% real (was 0.00%)', p.returnState === 'ok' && Math.abs(p.returnPct - 10) < 0.01, p.returnState + ' pct=' + p.returnPct); }
{ const { p } = ret('1y', { ts: H0, value: 10000 }, { ts: HN, value: 31000 }, 20000, MIGRATE);
  ok('4 1A: step in-window → +10% real (was 0.00%)', p.returnState === 'ok' && Math.abs(p.returnPct - 10) < 0.01, p.returnState + ' pct=' + p.returnPct); }
// 7D window that CONTAINS the step (first before it, last after it) → neutralised, small real return.
{ const { p } = ret('7d', { ts: H0, value: 10000 }, { ts: H0 + 5 * DAY, value: 30150 }, 20000, MIGRATE);
  ok('7 7D: step in-window → real return, not 0.00% nor +200%', p.returnState === 'ok' && p.returnPct > 0 && p.returnPct < 45, 'pct=' + p.returnPct + ' nf=' + p.netFlows); }

console.log('\n24H still works (step outside the 24h window):');
// 24H window (H0+29d, HN] excludes the H0+3d step → netFlows 0 → small real market move stands.
{ const { p } = ret('24h', { ts: H0 + 29 * DAY, value: 30900 }, { ts: HN, value: 31000 }, 20000, MIGRATE);
  ok('5 24H: step out of window → +0.32% market, netFlows 0', p.returnState === 'ok' && Math.abs(p.returnPct - 0.3236) < 0.01 && p.netFlows === 0, 'pct=' + p.returnPct + ' nf=' + p.netFlows); }

console.log('\nNew account never re-inflates to +500%:');
// Brand-new: 0→24k built by one big asset add (step at H0+2d). A +24k derived flow re-times INTO the
// window and neutralises the construction → honest small/zero return, never +500%.
{ const HNEW = [ { ts: H0, value: 1 }, { ts: H0 + 1 * DAY, value: 1 }, { ts: H0 + 2 * DAY, value: 24000 },
                 { ts: H0 + 10 * DAY, value: 24100 }, { ts: HN, value: 24200 } ];
  setHist(HNEW);
  const { dec, p } = ret('all', { ts: H0, value: 1 }, { ts: HN, value: 24200 }, 24000, MIGRATE);
  // startV≈1 (≤ _AURIX_RET_MIN_BASE) OR neutralised → in NO case a fabricated +500%/+2.4M%.
  const notInflated = (p.returnState === 'insufficient_return_history') || (p.returnState === 'ok' && Math.abs(p.returnPct) < 25);
  ok('6 new account never +500% (honest or neutralised)', notInflated, p.returnState + ' pct=' + p.returnPct + ' reTimedTo=' + ((dec.effectiveTs - H0) / DAY) + 'd'); }

console.log('\nReal in-window deposit (corroborated) still neutralises:');
// A genuine deposit whose ts already matches a history step → corroborated → ts kept → neutralised.
{ const HDEP = [ { ts: H0, value: 10000 }, { ts: H0 + 10 * DAY, value: 10100 }, { ts: H0 + 12 * DAY, value: 15200 },
                 { ts: H0 + 20 * DAY, value: 15400 }, { ts: HN, value: 16000 } ];
  setHist(HDEP);
  const depTs = H0 + 11 * DAY;
  const d = decide(5000, depTs);
  const { p } = ret('30d', { ts: H0, value: 10000 }, { ts: HN, value: 16000 }, 5000, depTs);
  ok('8 corroborated deposit kept + neutralised → +10% (not +60%)',
     d.corroborated === true && p.returnState === 'ok' && Math.abs(p.returnPct - 10) < 0.01, d.reason + ' pct=' + p.returnPct); }

console.log('\nNo reliable step → honest state preserved (never fabricate):');
// Gradual growth with NO single step matching the amount → no reliable match → fallback base → the
// large gross growth stays un-neutralised → honest insufficient (0.00%), never a fabricated %.
{ const HGRAD = [ { ts: H0, value: 10000 }, { ts: H0 + 6 * DAY, value: 13000 }, { ts: H0 + 12 * DAY, value: 16000 },
                  { ts: H0 + 20 * DAY, value: 19000 }, { ts: HN, value: 22000 } ];
  setHist(HGRAD);
  const d = decide(9000, MIGRATE);       // no single ~9k sustained step (gradual +3k moves)
  const { p } = ret('30d', { ts: H0, value: 10000 }, { ts: HN, value: 22000 }, 9000, MIGRATE);
  ok('9 no reliable step → fallback base + honest insufficient (not fabricated)',
     d.reason.indexOf('fallback_base') === 0 && p.returnState === 'insufficient_return_history',
     d.reason + ' → ' + p.returnState + ' pct=' + p.returnPct); }

console.log('\nGuards / safety:');
// self-heal OFF → decision is a no-op (rollback).
{ sb._AURIX_LEDGER_SELF_HEAL = false; setHist(HSTEP); const d = decide(20000, MIGRATE);
  ok('10 self-heal OFF ⇒ no re-time (rollback)', d.effectiveTs === MIGRATE && d.reason === 'self_heal_off');
  sb._AURIX_LEDGER_SELF_HEAL = true; }
// Wrong-direction step is never matched (a withdrawal is not "explained" by an up step).
{ setHist(HSTEP); const d = decide(-19900, MIGRATE);
  ok('11 opposite-direction flow is not matched to an up step', d.reason.indexOf('fallback_base') === 0, d.reason); }
// Idempotency: same (amount, original ts, history) ⇒ identical decision.
{ setHist(HSTEP); const a = decide(20000, MIGRATE), b = decide(20000, MIGRATE);
  ok('12 idempotent decision (same inputs → same effectiveTs)', a.effectiveTs === b.effectiveTs && a.reason === b.reason); }

console.log('\n' + (fail === 0 ? '✅ ALL PASS' : '❌ FAIL') + '  (' + pass + '/' + (pass + fail) + ')');
process.exit(fail === 0 ? 0 : 1);
