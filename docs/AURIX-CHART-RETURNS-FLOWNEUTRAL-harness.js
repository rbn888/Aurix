'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-RETURNS-FLOWNEUTRAL — SPEC DSH.CHART.RETURNS.01
// The chart badge % must be REAL (flow-neutral) return: adding assets/liquidity is NOT gain.
// New accounts / contribution-dominated periods → honest 0% (returnState insufficient), never +288%.
// Extracts the REAL _aurixComputePeriodReturn + _aurixNetFlowsInWindow + constants from app.js and runs
// the 9 mandated cases in a vm sandbox with a controllable capital-flow ledger.
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const app = src;
function fn(name) { const s = 'function ' + name + '('; const i = src.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let k = src.indexOf('{', i), d = 0; for (; k < src.length; k++) { const c = src[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return src.slice(i, k); }
function block(a, b) { const i = src.indexOf(a); if (i < 0) throw new Error('missing ' + a); const e = src.indexOf(b, i); if (e < 0) throw new Error('missing ' + b); return src.slice(i, e + b.length); }
let pass = 0, fail = 0; const ok = (n, c, g) => { if (c) { pass++; console.log('  ✓ ' + n + (g !== undefined ? '  [' + g + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (g !== undefined ? '  [' + g + ']' : '')); } };

// ── sandbox: real constants + real functions, injectable flow ledger + toBase (base==USD) ──
const sb = { console, Math, Number, Array, JSON, isFinite, parseFloat, Infinity, String,
  baseCurrency: 'USD', activePerfMode: 'pct',
  toBase: (amount, from) => Number(amount),                 // base == USD in the harness → identity
  _LEDGER: [],
  _aurixLoadCapitalFlows: function () { return sb._LEDGER; },
  _dshFmtPct: p => ({ text: (p > 0 ? '+' : (p < 0 ? '-' : '')) + Math.abs(p).toFixed(2) + '%' }),
  _dshFmtMoney0: n => (n > 0 ? '+' : (n < 0 ? '-' : '')) + '$' + Math.abs(Math.round(n)) };
sb.window = sb;
vm.createContext(sb);
vm.runInContext(block('const _AURIX_RET_MIN_BASE', "'all': 250 };"), sb);
vm.runInContext(fn('_aurixNetFlowsInWindow'), sb);
vm.runInContext(fn('_aurixComputePeriodReturn'), sb);
vm.runInContext(fn('_aurixReturnInsufficientText'), sb);
vm.runInContext(fn('_aurixEmergencyBadgeText'), sb);

const DAY = 86400e3;
const T0 = 1000 * DAY, T1 = 1000 * DAY + 20 * DAY;          // baseline / current timestamps (20d apart, inside 30d)
function setLedger(flows) { sb._LEDGER = flows.map(f => ({ ts: f.ts, amountUSD: f.usd, kind: f.kind || 'deposit' })); }
function per(range, startV, endV, flows) { setLedger(flows || []); return vm.runInContext(
  '_aurixComputePeriodReturn(' + JSON.stringify(range) + ',' + JSON.stringify({ ts: T0, value: startV }) + ',' + JSON.stringify({ ts: T1, value: endV }) + ')', sb); }
const MID = T0 + 5 * DAY;   // a flow that lands strictly inside (baseline, current]

console.log('AURIX-CHART-RETURNS-FLOWNEUTRAL — SPEC DSH.CHART.RETURNS.01\n');

console.log('Mandated cases:');
// Case 1 — initial construction: 0 → 10.000 by adding assets. No start base → honest, never +∞/+1000%.
{ const p = per('30d', 0, 10000, [{ ts: MID, usd: 10000, kind: 'asset_add' }]);
  ok('1 alta inicial 0→10.000 = honest (insufficient), NOT a huge %', p.returnState === 'insufficient_return_history' && p.returnPct === null, p.returnState + ' pct=' + p.returnPct); }

// Case 2 — pure contribution: 10.000 → 15.000 because user added 5.000 → 0%.
{ const p = per('30d', 10000, 15000, [{ ts: MID, usd: 5000, kind: 'deposit' }]);
  ok('2 aportación 10.000→15.000 (added 5.000) = 0% (flow-neutral)', p.returnState === 'ok' && Math.abs(p.returnPct) < 0.001, 'pct=' + p.returnPct); }

// Case 3 — market up, no flows: 10.000 → 11.000 = +10%.
{ const p = per('30d', 10000, 11000, []);
  ok('3 mercado 10.000→11.000 sin flujos = +10%', p.returnState === 'ok' && Math.abs(p.returnPct - 10) < 0.001, 'pct=' + p.returnPct); }

// Case 4 — market down, no flows: 10.000 → 9.000 = -10%.
{ const p = per('30d', 10000, 9000, []);
  ok('4 mercado 10.000→9.000 sin flujos = -10%', p.returnState === 'ok' && Math.abs(p.returnPct + 10) < 0.001, 'pct=' + p.returnPct); }

// Case 5 — contribution + market: 10.000 → +5.000 → 16.000 = ~+10% (real return on exposed capital), NOT +60%.
{ const p = per('30d', 10000, 16000, [{ ts: MID, usd: 5000, kind: 'deposit' }]);
  ok('5 aportación+mercado 10.000→(+5.000)→16.000 = +10% (not +60%)', p.returnState === 'ok' && Math.abs(p.returnPct - 10) < 0.001, 'pct=' + p.returnPct); }

// Case 6 — 24H new account with no meaningful start base (0 → 10.000 via asset add) → honest state.
{ const p = per('24h', 0, 10000, [{ ts: MID, usd: 10000, kind: 'asset_add' }]);
  ok('6 24H cuenta nueva sin base (0→10.000) = honest', p.returnState === 'insufficient_return_history', p.returnState); }
// 6b — 24H real small market move, no flows, is shown honestly.
{ const p = per('24h', 10000, 10120, []);
  ok('6b 24H mercado real +1.2% = +1.20% (shown)', p.returnState === 'ok' && Math.abs(p.returnPct - 1.2) < 0.001, 'pct=' + p.returnPct); }

// Case 7 — 7D with unrecorded contribution beyond the sane band → honest (never fabricates).
{ const p = per('7d', 10000, 30000, []);   // +200% with no ledger entry → unexplained capital
  ok('7 7D +200% with no ledger (unrecorded capital) = honest, not +200%', p.returnState === 'insufficient_return_history', p.returnState + ' pct=' + p.returnPct); }

// Case 8 — 30D with real data (contribution recorded) → correct net return.
{ const p = per('30d', 20000, 27000, [{ ts: MID, usd: 5000, kind: 'deposit' }]);   // (27000-20000-5000)/20000 = +10%
  ok('8 30D datos reales (aporte 5.000) = +10% neto', p.returnState === 'ok' && Math.abs(p.returnPct - 10) < 0.001, 'pct=' + p.returnPct); }

// Case 9 — TOTAL never interprets contributions as gain (big all-time contribution recorded → 0%).
{ const p = per('all', 5000, 50000, [{ ts: MID, usd: 45000, kind: 'asset_add' }]);
  ok('9 TOTAL aporte 45.000 recorded no es ganancia = 0%', p.returnState === 'ok' && Math.abs(p.returnPct) < 0.001, 'pct=' + p.returnPct); }

console.log('\nFlow-window correctness:');
// Flows OUTSIDE the window are not neutralized (they belong to another period).
{ const p = per('30d', 10000, 11000, [{ ts: T0 - DAY, usd: 5000 }, { ts: T1 + DAY, usd: 5000 }]);
  ok('10 flows outside (baseline,current] are ignored → +10% market stands', p.returnState === 'ok' && Math.abs(p.returnPct - 10) < 0.001, 'pct=' + p.returnPct); }
// Flow exactly AT baseline ts is excluded (strictly after baseline); at current ts is included.
{ const atBaseline = per('30d', 10000, 15000, [{ ts: T0, usd: 5000 }]);
  ok('11 flow at baseline ts excluded (still reads growth) → honest/ok not silently 0',
     atBaseline.returnState === 'ok' ? Math.abs(atBaseline.returnPct - 50) < 0.001 : atBaseline.returnState === 'insufficient_return_history',
     atBaseline.returnState + ' pct=' + atBaseline.returnPct); }
{ const atCurrent = per('30d', 10000, 15000, [{ ts: T1, usd: 5000 }]);
  ok('12 flow at current ts included → 0%', atCurrent.returnState === 'ok' && Math.abs(atCurrent.returnPct) < 0.001, 'pct=' + atCurrent.returnPct); }

console.log('\nWithdrawals + net flows:');
// Withdrawal (negative flow): 10.000 → 8.000 because user withdrew 3.000, but market +1.000 → +10%.
{ const p = per('30d', 10000, 8000, [{ ts: MID, usd: -3000, kind: 'withdrawal' }]);
  ok('13 retiro 3.000 con mercado +1.000 → +10% real', p.returnState === 'ok' && Math.abs(p.returnPct - 10) < 0.001, 'pct=' + p.returnPct); }

console.log('\nBadge display (honest state never shows a fabricated %):');
{ vm.runInContext('activePerfMode="pct"', sb);
  ok('14 insufficient badge text = 0.00% (neutral, pct mode)', vm.runInContext('_aurixReturnInsufficientText()', sb) === '0.00%', vm.runInContext('_aurixReturnInsufficientText()', sb)); }
{ vm.runInContext('activePerfMode="curr"', sb);
  const txt = vm.runInContext('_aurixReturnInsufficientText()', sb);
  ok('15 insufficient badge text = neutral 0 (curr mode)', /0/.test(txt) && !/\+|\-/.test(txt), txt);
  vm.runInContext('activePerfMode="pct"', sb); }

console.log('\nStatic wiring (data fn produces the honest state + line stays):');
ok('16 buildProductionPortfolioChart computes flow-neutral return via _aurixComputePeriodReturn',
   /_aurixComputePeriodReturn\(r, \{ ts: first\.ts/.test(fn('buildProductionPortfolioChart')));
ok('17 ready branch sets returnState + null returnPct on insufficient (line still drawn on state===ready)',
   /if \(out\.returnState === 'ok'\)/.test(fn('buildProductionPortfolioChart')) &&
   /out\.returnPct = null; out\.badgeReturnPct = null;/.test(fn('buildProductionPortfolioChart')));
ok('18 line draw is gated on state==="ready" ONLY (not returnPct) — wealth line survives honest state',
   /if \(emg\.state !== 'ready'\) \{[\s\S]{0,200}_wscRenderInsufficient/.test(fn('_wscPaintEmergency')) &&
   !/emg\.state === 'ready' && Number\.isFinite\(emg\.returnPct\)[\s\S]{0,60}renderValidatedPortfolioChart/.test(fn('_wscPaintEmergency')));
ok('19 badge painter has the honest insufficient branch (0%, flat tone, not "Calculando")',
   /emg\.returnState === 'insufficient_return_history'/.test(fn('_aurixEmergencyPaintBadgeNode')) &&
   /_aurixReturnInsufficientText\(\)/.test(fn('_aurixEmergencyPaintBadgeNode')));
ok('20 lineReturnPct still carries GROSS wealth growth (line semantics preserved for debug)',
   /out\.lineReturnPct = Number\.isFinite\(per\.grossPct\)/.test(fn('buildProductionPortfolioChart')));

console.log('\n' + (fail === 0 ? '✅ ALL PASS' : '❌ ' + fail + ' FAILED') + '  (' + pass + '/' + (pass + fail) + ')');
process.exit(fail === 0 ? 0 : 1);
