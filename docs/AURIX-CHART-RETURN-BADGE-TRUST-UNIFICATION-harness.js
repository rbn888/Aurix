'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-RETURN-BADGE-TRUST-UNIFICATION-harness — SPEC DSH.CHART.RETURN-BADGE-TRUST-UNIFICATION.14
// ════════════════════════════════════════════════════════════════════════════
// Before .14 the badge painted a FLAT "0.00%" whenever the line drew but the return was not trustworthy
// (insufficient_return_history) — indistinguishable from a REAL flat return. .14 unifies the contract via
// _aurixResolveChartReturnContract, fed the SAME continuity-validated series (SPEC.13) + the proven
// flow-neutral/maturity gates of buildProductionPortfolioChart: a real % (incl. a genuine 0.00%) shows ONLY
// when trustworthy + comparable (≥2 pts, same epoch, same source family, coverage ok); otherwise Calculando
// — never a silent 0.00%. GATE OFF (forceOff / flag absent) = v495. GATE ON = the new contract.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(startIdx) { let k = app.indexOf('{', startIdx), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(startIdx, k); }
function fn(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing fn ' + name); return braceSlice(i); }
function konst(name) {
  const m = new RegExp('const ' + name + '\\s*=\\s*').exec(app);
  if (!m) throw new Error('missing const ' + name);
  const i = m.index, eq = m.index + m[0].length, first = app[eq];
  if (first === '{' || first === '[') { const body = braceSlice(eq); const semi = app.indexOf(';', eq + body.length); return app.slice(i, semi + 1); }
  const semi = app.indexOf(';', eq); return app.slice(i, semi + 1);
}
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }
const MIN = 60e3, HOUR = 36e5, DAY = 864e5;

const CONSTS = ['_AURIX_EMG_RANGE_MS', '_AURIX_EMG_ADJ_JUMP', '_AURIX_EMG_FALLBACK_TAIL', '_AURIX_EMG_MIN_POINTS', '_AURIX_HPQ_MIN_POINTS', '_AURIX_HPQ_SPIKE_JUMP', '_AURIX_HPQ_SPIKE_REVERT_FRAC', '_AURIX_HPQ_FUTURE_MS', '_AURIX_PROD_MIN_POINTS', '_AURIX_PROD_GATE_PCT', '_AURIX_RET_MIN_BASE', '_AURIX_RET_SANE_PCT', '_AURIX_STEP_MATCH_MIN_CONF', '_AURIX_ALL_MIN_TRUST_SPAN_MS', '_AURIX_ALL_MIN_TRUST_POINTS', '_AURIX_VJUMP_MIN_FRAC', '_AURIX_VJUMP_P95_MULT', '_AURIX_CAPSTEP_RATIO_LO', '_AURIX_CAPSTEP_RATIO_HI', '_AURIX_CAPSTEP_TS_PAD_MS', '_AURIX_CAPITAL_STEP_SEG_ENABLED', '_AURIX_CHART_RECONCILE_GATE', '_AURIX_SNAP_NEAR_MS', '_AURIX_SNAP_NEAR_FRAC', '_AURIX_SNAP_FE_AUTHORITY_MS', '_AURIX_CHART_EPOCH_TRUST', '_AURIX_CHART_EPOCH_BAND_LO', '_AURIX_CHART_24H_FE_AUTHORITY', '_AURIX_BRIDGE_SEG_ENABLED', '_AURIX_BRIDGE_SEG_FRAC', '_AURIX_SPARSE_RAMP_SEG_ENABLED', '_AURIX_SPARSE_RAMP_MULT', '_AURIX_SPARSE_RAMP_MIN_MS', '_AURIX_ORPHAN_CLEANUP_ENABLED', '_AURIX_ORPHAN_MAX_PTS', '_AURIX_VP_GAP_FLOOR_MS', '_AURIX_VP_GAP_MEDIAN_MULT', '_AURIX_CHART_CONTINUITY_UNIFICATION', '_AURIX_CHART_RETURN_CONTRACT_UNIFICATION'];
const FNS = ['_aurixEmergencyHash', '_aurixProdPlateauFilter', '_aurixProdVisualGate', '_aurixHpqIso', '_aurixHpqDiag', '_aurixHpqRangesContaining', '_aurixSourceFamily', '_aurixFrontendUsableInWindow', '_aurixApplyRangeSourceAuthority', '_aurixTrustedChartSource', '_aurixHpqRawStages', '_aurixHpqTrimConstruction', '_aurixHpqQuarantineSpikes', '_aurixHpqFirstInvalidStage', 'buildValidatedHistoricalSeries', '_aurixNetFlowsInWindow', '_aurixComputePeriodReturn', 'buildProductionPortfolioChart', '_aurixConfirmedBridgeGaps', '_aurixVerticalJumps', '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks', '_aurixSplitAtGaps', '_aurixRealGapFloorMs', '_aurixBuildContinuityValidatedSeries', '_aurixStructuralBreaks', '_aurixResolveChartReturnContract', '_aurixEmergencyPaintBadgeNode'];

const S = { HIST: [] };
function mkCtx() {
  const ctx = { console, Math, JSON, Array, Number, isFinite, Infinity, Date, Map, Set, Object, isNaN, parseInt, parseFloat, String,
    toBase: v => v, _aurixLoadCapitalFlows: () => [], _aurixHistorySourceForDisplay: () => S.HIST,
    _aurixCanonicalHistoryReady: () => true, currentUser: { id: 'u', created_at: '2020-01-01T00:00:00Z' }, activeRange: '24h',
    // badge painter formatter stubs (DOM-free)
    activePerfMode: 'pct', _dshFmtPct: v => ({ text: (v >= 0 ? '+' : '') + Number(v).toFixed(2) + '%' }), _dshFmtMoney0: v => String(Math.round(v)),
    _aurixEmergencyBadgeText: emg => (emg.returnPct >= 0 ? '+' : '') + emg.returnPct.toFixed(2) + '%',
    _aurixReturnInsufficientText: () => '0.00%', _aurixReturnPendingHTML: () => '<span class="wsc-metric-calc">Calculando…</span>' };
  vm.createContext(ctx);
  CONSTS.forEach(c => vm.runInContext(konst(c), ctx));
  FNS.forEach(n => vm.runInContext(fn(n), ctx));
  return ctx;
}
const CTX = mkCtx();
const build = r => vm.runInContext('buildProductionPortfolioChart(' + JSON.stringify(r) + ')', CTX);
const resolve = (vs, r, ctx) => vm.runInContext('_aurixResolveChartReturnContract', CTX)(vs, r, ctx);
const continuity = (pts, r) => vm.runInContext('_aurixBuildContinuityValidatedSeries', CTX)(pts, r);
const paint = (emg) => { const el = { innerHTML: '', className: '' }; vm.runInContext('_aurixEmergencyPaintBadgeNode', CTX)(el, emg, 'test'); return el; };
// full pipeline contract for a range from the current S.HIST
function contractFor(r) { const chart = build(r); const vs = continuity((chart.points || []).map(p => ({ time: p.ts, value: p.value })), r); return resolve(vs, r, { chart: chart }); }
function feHist(t0, n, stepMs, valFn) { const o = []; for (let i = 0; i < n; i++) o.push({ ts: t0 + i * stepMs, total: +valFn(i).toFixed(2), real_estate: 0 }); return o; }
const T0 = 1_800_000_000_000;

console.log('AURIX-CHART-RETURN-BADGE-TRUST-UNIFICATION — SPEC DSH.CHART.RETURN-BADGE-TRUST-UNIFICATION.14\n');

// ── 1. new account, 1 point → Calculando, line neutral ──
console.log('1. New account 1 point → Calculando + neutral line:');
{
  S.HIST = feHist(T0 - 1 * HOUR, 1, HOUR, () => 9000);
  const c = contractFor('24h'); const p = build('24h');
  ok('state = calculating', c.state === 'calculating', c.reason);
  ok('badgeEligible false', c.badgeEligible === false);
  ok('colorState neutral (no red/green)', c.colorState === 'neutral');
  ok('line neutral (emg.color flat when not ok)', p.color === 'flat', 'color=' + p.color);
}

// ── 2. new account several points, low coverage → Calculando ──
console.log('\n2. New account, points but low coverage (30D) → Calculando:');
{
  S.HIST = feHist(T0 - 3 * DAY, 60, HOUR, i => 9000 + i);   // ~3d of a 30d window
  const c = contractFor('30d');
  ok('state = calculating', c.state === 'calculating', c.reason);
  ok('badgeEligible false', c.badgeEligible === false);
  ok('displayedBadgeLabel Calculando', c.badgeLabel === 'Calculando…');
}

// ── 3. 24H frontend-only reliable → ok, color per return ──
console.log('\n3. 24H frontend-only reliable → ok + coloured:');
{
  S.HIST = feHist(T0 - 26 * HOUR, 157, 10 * MIN, i => 9000 + 2 * i);   // dense rising, spans >24h (full coverage)
  const c = contractFor('24h'); const p = build('24h');
  ok('chart returnState ok (real return)', p.returnState === 'ok', 'rs=' + p.returnState);
  ok('contract state ok', c.state === 'ok', c.reason);
  ok('colorState positive (rising)', c.colorState === 'positive' && c.returnPct > 0, 'pct=' + c.returnPct);
  ok('badgeEligible true', c.badgeEligible === true);
}

// ── 4. 24H backend+frontend → never cross-family (authority excludes backend) ──
console.log('\n4. 24H backend+frontend → never cross-family return:');
{
  const fe = feHist(T0 - 20 * HOUR, 40, 20 * MIN, i => 9000 + i);
  const be = []; for (let i = 0; i < 8; i++) be.push({ ts: T0 - 22 * HOUR + i * 60 * MIN, total: 9600, real_estate: 0, source: 'backend_snapshot' });
  S.HIST = fe.concat(be);
  const p = build('24h');
  const backendPlotted = p.points.filter(pt => S.HIST.some(h => h.ts === pt.ts && h.source === 'backend_snapshot') && !S.HIST.some(h => h.ts === pt.ts && !h.source)).length;
  ok('24H backendPlotted = 0 (frontend authority)', backendPlotted === 0, 'be=' + backendPlotted);
  // explicit cross-family context → resolver forces calculating (belt-and-suspenders)
  const cross = resolve({ points: [{ time: 1, value: 9000 }, { time: 2, value: 9100 }], continuityState: 'continuous', coverageRatio: 1 }, '24h', { chart: { range: '24h', state: 'ready', returnState: 'ok', badgeReturnPct: 1.1, returnValue: 100, points: [{ ts: 1, value: 9000 }, { ts: 2, value: 9100 }] }, sameSourceFamily: false });
  ok('cross-source-family → calculating', cross.state === 'calculating' && cross.reason === 'cross_source_family', cross.reason);
}

// ── 5. 7D real gap / islands → Calculando if continuity insufficient ──
console.log('\n5. 7D real gap → Calculando (broken continuity), cross-epoch → calculating:');
{
  // real 3-day gap inside a 7d window (> 2d 7d floor) breaks continuity; coverage also collapses
  const a = feHist(T0 - 6 * DAY, 20, HOUR, () => 9000);
  const b = feHist(T0 - 1 * DAY, 20, HOUR, () => 9100);
  S.HIST = a.concat(b);
  const c = contractFor('7d');
  ok('7D not a real return (calculating)', c.state === 'calculating', c.reason);
  // explicit cross-epoch context
  const xe = resolve({ points: [{ time: 1, value: 8000 }, { time: 2, value: 12000 }], continuityState: 'continuous', coverageRatio: 1 }, '7d', { chart: { range: '7d', state: 'ready', returnState: 'ok', badgeReturnPct: 50, returnValue: 4000, points: [{ ts: 1, value: 8000 }, { ts: 2, value: 12000 }] }, sameEpoch: false });
  ok('cross-epoch → calculating', xe.state === 'calculating' && xe.reason === 'cross_epoch', xe.reason);
}

// ── 6. 30D/1Y/ALL short history → Calculando ──
console.log('\n6. 30D/1Y/ALL short history → Calculando:');
{
  S.HIST = feHist(T0 - 2 * DAY, 40, HOUR, i => 9000 + i);
  ['30d', '1y', 'all'].forEach(r => { const c = contractFor(r); ok(r + ': calculating (short history)', c.state === 'calculating', r + ':' + c.reason); });
}

// ── 7. Mature same-epoch same-family → real return ──
console.log('\n7. Mature same-epoch same-family → real return:');
{
  S.HIST = feHist(T0 - 8 * DAY, 384, 30 * MIN, i => 9000 + i * 0.4);   // dense mature, spans >7d (full coverage)
  const c = contractFor('7d'); const p = build('7d');
  ok('chart returnState ok', p.returnState === 'ok', 'rs=' + p.returnState);
  ok('contract ok + badgeEligible', c.state === 'ok' && c.badgeEligible === true, c.reason);
  ok('colorState reflects sign', (c.returnPct > 0 && c.colorState === 'positive') || (c.returnPct < 0 && c.colorState === 'negative') || c.colorState === 'neutral');
}

// ── 8. real return near zero → 0.00% only with badgeEligible ──
console.log('\n8. Genuine ~0.00% real return → shown, badgeEligible true:');
{
  const zero = resolve({ points: [{ time: 1, value: 9000 }, { time: 2, value: 9000 }], continuityState: 'continuous', coverageRatio: 1 }, '24h', { chart: { range: '24h', state: 'ready', returnState: 'ok', badgeReturnPct: 0.0, returnValue: 0, points: [{ ts: 1, value: 9000 }, { ts: 2, value: 9000 }] } });
  ok('state ok (real flat)', zero.state === 'ok', zero.reason);
  ok('returnPct 0 + badgeEligible true', zero.returnPct === 0 && zero.badgeEligible === true);
  ok('colorState neutral for ~0', zero.colorState === 'neutral');
  ok('0.00% NOT shown when NOT eligible (insufficient → Calculando)', (() => { const c = resolve({ points: [{ time: 1, value: 9000 }, { time: 2, value: 9000 }], continuityState: 'continuous', coverageRatio: 0.1 }, '24h', { chart: { range: '24h', state: 'ready', returnState: 'insufficient_return_history', badgeReturnPct: null, points: [{ ts: 1, value: 9000 }, { ts: 2, value: 9000 }] } }); return c.state === 'calculating' && c.badgeLabel === 'Calculando…'; })());
}

// ── 9. syntheticPoints always 0 ──
console.log('\n9. No synthetic points:');
{
  S.HIST = feHist(T0 - 6 * DAY, 200, 30 * MIN, i => 9000 + i);
  ['24h', '7d', '30d', '1y', 'all'].forEach(r => { const c = contractFor(r); ok(r + ': syntheticPoints 0', c.syntheticPoints === 0); });
}

// ── 10. GATE OFF preserves v495 (insufficient → neutral 0.00%) ──
console.log('\n10. GATE OFF = v495 (insufficient → neutral 0.00%, not Calculando):');
{
  const chart = { range: '30d', state: 'ready', returnState: 'insufficient_return_history', badgeReturnPct: null, points: [{ ts: 1, value: 9000 }, { ts: 2, value: 9100 }] };
  const vs = { points: [{ time: 1, value: 9000 }, { time: 2, value: 9100 }], continuityState: 'continuous', coverageRatio: 0.1 };
  const off = resolve(vs, '30d', { chart: chart, forceOff: true });
  const on = resolve(vs, '30d', { chart: chart });
  ok('GATE OFF: state neutral (v495 0.00%)', off.state === 'neutral' && off.badgeLabel === '0.00%', off.state + '/' + off.badgeLabel);
  ok('GATE ON: state calculating (new contract)', on.state === 'calculating' && on.badgeLabel === 'Calculando…', on.state + '/' + on.badgeLabel);
}

// ── 11. GATE ON applies new contract for ok too ──
console.log('\n11. GATE ON real return unchanged vs OFF when trustworthy:');
{
  const chart = { range: '24h', state: 'ready', returnState: 'ok', badgeReturnPct: 2.5, returnValue: 200, points: [{ ts: 1, value: 9000 }, { ts: 2, value: 9225 }] };
  const vs = { points: [{ time: 1, value: 9000 }, { time: 2, value: 9225 }], continuityState: 'continuous', coverageRatio: 1 };
  const off = resolve(vs, '24h', { chart: chart, forceOff: true });
  const on = resolve(vs, '24h', { chart: chart });
  ok('OFF and ON both ok for trustworthy return', off.state === 'ok' && on.state === 'ok');
  ok('same returnPct + colorState', off.returnPct === on.returnPct && off.colorState === on.colorState && on.colorState === 'positive');
}

// ── 12. Determinism: input order → same contract ──
console.log('\n12. Deterministic contract across input orders:');
{
  const baseHist = feHist(T0 - 20 * HOUR, 60, 15 * MIN, i => 9000 + 3 * i + (i % 4) * 2);
  const sig = c => c.state + '|' + c.returnPct + '|' + c.colorState + '|' + c.badgeEligible + '|' + c.reason;
  const sigs = [];
  for (let k = 0; k < 8; k++) { const rot = k % baseHist.length; let a = baseHist.slice(rot).concat(baseHist.slice(0, rot)); if (k % 2) a = a.slice().reverse(); S.HIST = a; sigs.push(sig(contractFor('24h'))); }
  ok('8 input orders → one contract signature', sigs.every(s => s === sigs[0]), Array.from(new Set(sigs)).length + ' distinct');
}

// ── 13. Badge painter mapping (DOM-free) ──
console.log('\n13. Badge painter honours contract:');
{
  const okEmg = { range: '24h', state: 'ready', returnState: 'ok', returnPct: 2.5, badgeReturnPct: 2.5, returnValue: 200, color: 'up', points: [{ ts: 1, value: 9000 }, { ts: 2, value: 9225 }] };
  const insufEmg = { range: '30d', state: 'ready', returnState: 'insufficient_return_history', returnPct: null, badgeReturnPct: null, color: 'flat', points: [{ ts: 1, value: 9000 }, { ts: 2, value: 9100 }] };
  const pendEmg = { range: '24h', state: 'pending', returnState: 'insufficient_return_history', returnPct: null, badgeReturnPct: null, color: 'flat', points: [] };
  const okEl = paint(okEmg), insufEl = paint(insufEmg), pendEl = paint(pendEmg);
  ok('ok → coloured badge (chart-change up)', /chart-change up/.test(okEl.className) && /%/.test(okEl.innerHTML), okEl.className);
  ok('insufficient → Calculando (NOT 0.00%)', /calculating/.test(insufEl.className) && /Calculando/.test(insufEl.innerHTML) && !/0\.00%/.test(insufEl.innerHTML), insufEl.className);
  ok('pending → Calculando', /calculating/.test(pendEl.className) && /Calculando/.test(pendEl.innerHTML));
}

console.log('\n=== SOURCE CONTRACT ===');
ok('reversible flag present', /const _AURIX_CHART_RETURN_CONTRACT_UNIFICATION = true;/.test(app));
ok('_aurixResolveChartReturnContract defined + exported', /function _aurixResolveChartReturnContract/.test(app) && /window\._aurixResolveChartReturnContract =/.test(app));
ok('badge painter uses the contract', /_aurixResolveChartReturnContract\(vs, emg && emg.range/.test(app));
ok('SPEC.13 continuity still present', /_AURIX_CHART_CONTINUITY_UNIFICATION/.test(app) && /_aurixBuildContinuityValidatedSeries/.test(app));
ok('lineage audit exposes returnContract block', /returnContract: returnContract,/.test(app) && /displayedBadgeLabel:/.test(app));
ok('marker SPEC.14 present', /DSH\.CHART\.RETURN-BADGE-TRUST-UNIFICATION\.14/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
