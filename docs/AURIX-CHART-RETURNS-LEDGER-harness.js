'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-RETURNS-LEDGER — SPEC DSH.CHART.RETURNS.LEDGER.01
// ROOT-CAUSE fix for "0.00% en todas las temporalidades con la línea dibujada".
// A migrated LEGACY holding produced an asset_add flow stamped at Date.now() (migration time),
// so _aurixNetFlowsInWindow subtracted the WHOLE cost basis as capital added *today* → neutralDelta
// negative → sane-band veto → insufficient_return_history → badge forced to 0.00% in every range.
// Fix: derived (backfilled) flows keep their ts ONLY when portfolioHistory CORROBORATES a real step
// there; otherwise they are re-anchored to the earliest tracked ts (pre-existing BASE capital, excluded
// from the (baseline, current] window). Real in-window buys are still neutralised exactly as before.
// Extracts the REAL helpers + the REAL _aurixNetFlowsInWindow/_aurixComputePeriodReturn from app.js.
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fn(name) { const s = 'function ' + name + '('; const i = src.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let k = src.indexOf('{', i), d = 0; for (; k < src.length; k++) { const c = src[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return src.slice(i, k); }
function block(a, b) { const i = src.indexOf(a); if (i < 0) throw new Error('missing ' + a); const e = src.indexOf(b, i); if (e < 0) throw new Error('missing ' + b); return src.slice(i, e + b.length); }
let pass = 0, fail = 0; const ok = (n, c, g) => { if (c) { pass++; console.log('  ✓ ' + n + (g !== undefined ? '  [' + g + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (g !== undefined ? '  [' + g + ']' : '')); } };

const DAY = 86400e3;
const H0 = 1000 * DAY;                        // earliest tracked snapshot
const HN = H0 + 30 * DAY;                     // current snapshot (30d span)
const NOW = HN + 60 * DAY;                    // "migration time" — well AFTER history (Date.now() artefact)

// ── sandbox: in-memory flow ledger + injectable history; base == USD (identity toBase) ──
const sb = { console, Math, Number, Array, JSON, isFinite, parseFloat, Infinity, String, Date,
  baseCurrency: 'USD', activePerfMode: 'pct',
  toBase: (amount) => Number(amount),
  _AURIX_LEDGER_SELF_HEAL: true,
  _AURIX_FLOW_CORROBORATE_MS: 3 * DAY,
  _AURIX_FLOW_CORROBORATE_FRAC: 0.4,
  portfolioHistory: [], categoryHistory: [],
  _aurixPortfolioEpoch: () => 0,
  _STORE: [],
  _aurixLoadCapitalFlows: function () { return sb._STORE.slice(); },
  _aurixSaveCapitalFlows: function (arr) { sb._STORE = arr.slice(); },
  _aurixCaptureFlow: function (kind, amountUSD, ts, assetId, note, source) {
    if (!Number.isFinite(amountUSD) || Math.round(Math.abs(amountUSD) * 100) === 0) return;
    const id = `${kind}:${assetId || 'cash'}:${ts}:${Math.round(Math.abs(amountUSD))}`;
    if (sb._STORE.some(f => f.id === id)) return;
    sb._STORE.push({ id, ts, amountUSD: +amountUSD.toFixed(2), kind, source: source || 'user', assetId });
  },
  _AURIX_RET_MIN_BASE: 1,
  _AURIX_RET_SANE_PCT: { '24h': 25, '7d': 45, '30d': 80, '1y': 200, 'all': 250 } };
sb.window = sb;
vm.createContext(sb);
// real helpers under test
vm.runInContext(fn('_aurixEarliestTrackedTs'), sb);
vm.runInContext(fn('_aurixFlowTsCorroboratedByHistory'), sb);
vm.runInContext(fn('_aurixEffectiveFlowTs'), sb);
vm.runInContext(fn('_aurixPurgeDerivedFlows'), sb);
// real return engine (proves the end-to-end un-suppression)
vm.runInContext(fn('_aurixNetFlowsInWindow'), sb);
vm.runInContext(fn('_aurixComputePeriodReturn'), sb);

function setHistory(pts) { sb.portfolioHistory = pts.map(p => ({ ts: p.ts, value: p.value })); }
function per(range, startV, endV) { return vm.runInContext(
  '_aurixComputePeriodReturn(' + JSON.stringify(range) + ',' + JSON.stringify({ ts: H0, value: startV }) + ',' + JSON.stringify({ ts: HN, value: endV }) + ')', sb); }
function call(expr) { return vm.runInContext(expr, sb); }

console.log('AURIX-CHART-RETURNS-LEDGER — SPEC DSH.CHART.RETURNS.LEDGER.01\n');

console.log('Helpers:');
// A flat, no-step history: earliest tracked ts is the first snapshot minus 1 (a base anchor).
setHistory([{ ts: H0, value: 10000 }, { ts: H0 + 15 * DAY, value: 10500 }, { ts: HN, value: 11000 }]);
ok('1 earliestTrackedTs = firstSnapshot − 1 (base anchor before every window)', call('_aurixEarliestTrackedTs()') === H0 - 1, call('_aurixEarliestTrackedTs()'));

// A migration flow stamped at NOW has NO corroborating step in history → not corroborated.
ok('2 flow stamped at migration time (Date.now) is NOT corroborated', call(`_aurixFlowTsCorroboratedByHistory(10000, ${NOW})`) === false);
// It is therefore re-anchored to the base anchor (excluded from any (baseline, current] window).
ok('3 uncorroborated flow re-anchored to base anchor', call(`_aurixEffectiveFlowTs(10000, ${NOW})`) === H0 - 1, call(`_aurixEffectiveFlowTs(10000, ${NOW})`));

// A REAL in-window deposit: history steps up +5000 across its ts → corroborated → ts kept.
setHistory([{ ts: H0, value: 10000 }, { ts: H0 + 10 * DAY, value: 10200 }, { ts: H0 + 12 * DAY, value: 15300 }, { ts: HN, value: 15400 }]);
const realTs = H0 + 11 * DAY;
ok('4 real deposit with a matching history step IS corroborated', call(`_aurixFlowTsCorroboratedByHistory(5000, ${realTs})`) === true);
ok('5 corroborated flow keeps its real ts (still neutralised in-window)', call(`_aurixEffectiveFlowTs(5000, ${realTs})`) === realTs, call(`_aurixEffectiveFlowTs(5000, ${realTs})`));

// Self-heal toggle: with self-heal OFF, no re-anchoring happens (rollback path).
sb._AURIX_LEDGER_SELF_HEAL = false;
ok('6 self-heal OFF ⇒ ts untouched (rollback)', call(`_aurixEffectiveFlowTs(10000, ${NOW})`) === NOW);
sb._AURIX_LEDGER_SELF_HEAL = true;

console.log('\nDerived-ledger rebuild:');
sb._STORE = [
  { id: 'a', ts: NOW, amountUSD: 9000, kind: 'asset_add', source: 'tx-backfill' },
  { id: 'b', ts: realTs, amountUSD: 500, kind: 'deposit', source: 'user' },
  { id: 'c', ts: H0 + 5 * DAY, amountUSD: 200, kind: 'import_baseline', source: 'inferred' } ];
const purged = call('_aurixPurgeDerivedFlows()');
ok('7 purge removes derived (tx-backfill + inferred) flows', purged === 2, 'removed=' + purged);
ok('8 purge KEEPS user-authored live flows (source of truth)', sb._STORE.length === 1 && sb._STORE[0].source === 'user');

console.log('\nEnd-to-end return (the actual bug):');
// BEFORE the fix a legacy $9000 holding produced an asset_add flow at NOW (inside the window),
// so on a 30d window 10.000 → 11.000 the badge computed (1000 − 9000)/10000 = −80% → out of band → 0.00%.
// Reproduce the BUGGY ledger and confirm it is suppressed:
// The migration Date.now() ≈ the CURRENT snapshot ts, so the artefact flow lands at the window end
// (f.ts <= toTs ⇒ included): (11000 − 10000 − 9500)/10000 = −85% ⇒ |85| > band(80) → suppressed.
setHistory([{ ts: H0, value: 10000 }, { ts: H0 + 15 * DAY, value: 10500 }, { ts: HN, value: 11000 }]);
sb._STORE = [{ id: 'legacy', ts: HN, amountUSD: 9500, kind: 'asset_add', source: 'tx-backfill' }];
{ const p = per('30d', 10000, 11000);
  ok('9 buggy migration flow (raw) suppresses real +10% → insufficient (reproduces bug)',
     p.returnState === 'insufficient_return_history', p.returnState + ' pct=' + p.returnPct + ' netFlows=' + p.netFlows); }

// AFTER the fix: re-anchor the derived flow, then recompute — the +10% real market return is restored.
{ const eff = call(`_aurixEffectiveFlowTs(9500, ${HN})`);
  sb._STORE = [{ id: 'legacy', ts: eff, amountUSD: 9500, kind: 'asset_add', source: 'tx-backfill' }];
  const p = per('30d', 10000, 11000);
  ok('10 re-anchored flow ⇒ real market +10% is shown (bug fixed)',
     p.returnState === 'ok' && Math.abs(p.returnPct - 10) < 0.001, p.returnState + ' pct=' + p.returnPct + ' netFlows=' + p.netFlows); }

// A GENUINE in-window contribution is still correctly neutralised (no regression on the original SPEC).
{ setHistory([{ ts: H0, value: 10000 }, { ts: H0 + 10 * DAY, value: 10100 }, { ts: H0 + 12 * DAY, value: 15200 }, { ts: HN, value: 16000 }]);
  const dTs = H0 + 11 * DAY, eff = call(`_aurixEffectiveFlowTs(5000, ${dTs})`);
  sb._STORE = [{ id: 'dep', ts: eff, amountUSD: 5000, kind: 'deposit', source: 'tx-backfill' }];
  const p = per('30d', 10000, 16000);   // (16000 − 10000 − 5000)/10000 = +10%, NOT +60%
  ok('11 genuine corroborated deposit still neutralised → +10% (not +60%)',
     p.returnState === 'ok' && Math.abs(p.returnPct - 10) < 0.001, 'pct=' + p.returnPct); }

// Sign guard: a withdrawal-shaped flow is not "corroborated" by an UP step (direction must match).
setHistory([{ ts: H0, value: 10000 }, { ts: H0 + 11 * DAY, value: 15000 }, { ts: HN, value: 15000 }]);
ok('12 corroboration requires matching direction (up step ≠ withdrawal)', call(`_aurixFlowTsCorroboratedByHistory(-5000, ${H0 + 10 * DAY})`) === false);

console.log('\n' + (fail === 0 ? '✅ ALL PASS' : '❌ FAIL') + '  (' + pass + '/' + (pass + fail) + ')');
process.exit(fail === 0 ? 0 : 1);
