'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-FINAL-RENDER-SERIES-CONTRACT-harness — SPEC DSH.CHART.FINAL_RENDER_SERIES_CONTRACT.19
// ════════════════════════════════════════════════════════════════════════════
// _aurixResolveFinalRenderSeriesContract(emg, range, surface) is the SINGLE chokepoint both the desktop
// (_wscPaintEmergency) and the mobile-lite (renderAurixMobileLiteChart) paint paths consume. It runs the
// proven pipeline in ONE fixed order — continuity → short-history → bootstrap-suppression → visual-trust-gate
// → return-contract — and returns the FINAL renderPoints, render mode, badge label/colour and Calculando
// decision. This harness loads the resolver + every dependency into a vm sandbox and proves the SPEC's 15
// mandatory cases directly against the REAL app.js source (no mocks of the resolver).
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(startIdx) { let k = app.indexOf('{', startIdx), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(startIdx, k); }
function fnSrc(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing fn ' + name); return braceSlice(i); }
function konstSrc(name) {
  const m = new RegExp('const ' + name + '\\s*=\\s*').exec(app);
  if (!m) throw new Error('missing const ' + name);
  const i = m.index, eq = m.index + m[0].length, first = app[eq];
  if (first === '{' || first === '[') { const body = braceSlice(eq); const semi = app.indexOf(';', eq + body.length); return app.slice(i, semi + 1); }
  const semi = app.indexOf(';', eq); return app.slice(i, semi + 1);
}
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const DAY = 864e5, HOUR = 36e5, MIN = 60e3, T0 = 1_800_000_000_000;

// Consts declared with a leading `const NAME =` (BAND_HI shares the BAND_LO statement, so it loads with it).
const CONSTS = [
  '_AURIX_VP_GAP_FLOOR_MS', '_AURIX_VP_GAP_MEDIAN_MULT', '_AURIX_EMG_RANGE_MS',
  '_AURIX_CHART_CONTINUITY_UNIFICATION', '_AURIX_CHART_RETURN_CONTRACT_UNIFICATION',
  '_AURIX_CHART_SHORT_HISTORY_DISPLAY', '_AURIX_CHART_SHORT_HISTORY_MIN_DAYS',
  '_AURIX_CHART_VISUAL_TRUST_GATE', '_AURIX_VTG_MIN_MAIN_PTS', '_AURIX_VTG_MIN_MAIN_SPAN_MS',
  '_AURIX_CHART_BOOTSTRAP_SUPPRESSION', '_AURIX_STABLE_BAND_LO', '_AURIX_STABLE_MIN_PTS',
  '_AURIX_STABLE_MIN_SPAN_MS', '_AURIX_STABLE_CONSTRUCTION_JUMP',
];
const FNS = [
  '_aurixRealGapFloorMs', '_aurixConfirmedBridgeGaps', '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks',
  '_aurixSplitAtGaps', '_aurixBuildContinuityValidatedSeries', '_aurixStructuralBreaks',
  '_aurixResolveChartReturnContract', '_aurixShortHistoryDisplay', '_aurixVisualTrustGate',
  '_aurixStableDisplayAnchor', '_aurixResolveFinalRenderSeriesContract',
];
function mkCtx(withFinalFlag) {
  const ctx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date };
  vm.createContext(ctx);
  CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (e) { /* optional const */ } });
  if (withFinalFlag) { try { vm.runInContext(konstSrc('_AURIX_CHART_FINAL_RENDER_SERIES_CONTRACT'), ctx); } catch (_) {} }
  FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (e) { throw new Error('load ' + f + ': ' + e.message); } });
  return ctx;
}
const ON = mkCtx(true), OFF = mkCtx(false);   // OFF = FINAL flag const absent (typeof undefined)
const frc = (ctx, emg, range, surface) => vm.runInContext('_aurixResolveFinalRenderSeriesContract', ctx)(emg, range, surface);

// ── fixtures ────────────────────────────────────────────────────────────────
function seg(t0, n, stepMs, v0, dv) { const o = []; for (let i = 0; i < n; i++) o.push({ ts: t0 + i * stepMs, value: +(v0 + i * dv).toFixed(2) }); return o; }
function emgOf(points, over) {
  return Object.assign({
    range: '30d', state: 'ready', returnState: 'ok', reason: null, pendingReason: null,
    badgeReturnPct: 5.0, returnPct: 5.0, returnValue: 100, color: 'up',
    coverageRatio: 1.0, pointCount: points.length, chartHash: 'h', points: points,
  }, over || {});
}
const subsetOf = (rp, input) => rp.every(p => input.some(q => q.ts === p.ts && q.value === p.value));

// mature dense series (30d, 12h cadence) — the "no regression" baseline
const MATURE = seg(T0, 60, 12 * HOUR, 980, 0.4);   // ~1004 at the end, dense continuous

console.log('AURIX-CHART-FINAL-RENDER-SERIES-CONTRACT — SPEC.19');

// 1. 24H valid line + return ok → full / ready / positive / real badge.
{
  const pts = seg(T0, 48, 30 * MIN, 1000, 0.05);   // stable ~1000 over 24h
  const e = emgOf(pts, { range: '24h', returnState: 'ok', badgeReturnPct: 5.0, color: 'up' });
  const r = frc(ON, e, '24h', 'desktop');
  ok('24H ok-return → mode full', r.mode === 'full', r.mode);
  ok('24H ok-return → state ready', r.state === 'ready', r.state);
  ok('24H ok-return → colorState positive', r.colorState === 'positive', r.colorState);
  ok('24H ok-return → badge eligible + real %', r.badgeEligible === true && /\+5\.00%/.test(r.badgeLabel), r.badgeLabel);
  ok('24H ok-return → line drawn', r.lineEligible === true && r.renderPoints.length >= 2);
}

// 2. 24H valid line but return NOT trustworthy → line neutral/clean, badge Calculando.
{
  const pts = seg(T0, 48, 30 * MIN, 1000, 0.05);
  const e = emgOf(pts, { range: '24h', returnState: 'insufficient_return_history', badgeReturnPct: null, returnPct: null, color: 'flat' });
  const r = frc(ON, e, '24h', 'desktop');
  ok('24H untrusted → line still drawn', r.lineEligible === true && r.renderPoints.length >= 2);
  ok('24H untrusted → badge Calculando', r.badgeEligible === false && /Calculando/.test(r.badgeLabel), r.badgeLabel);
  ok('24H untrusted → colorState neutral', r.colorState === 'neutral', r.colorState);
  ok('24H untrusted → state calculating', r.state === 'calculating', r.state);
  ok('24H untrusted → never ambiguous 0.00%', !/0\.00%/.test(r.badgeLabel), r.badgeLabel);
}

// 3. 7D history shorter than 7d → partial_clean or building, never a fake full historic.
{
  const pts = seg(T0, 24, 1 * HOUR, 1000, 0.02);   // ~1 day of history for a 7d window
  const e = emgOf(pts, { range: '7d', returnState: 'insufficient_return_history', badgeReturnPct: null, coverageRatio: 0.15, color: 'flat' });
  const r = frc(ON, e, '7d', 'desktop');
  ok('7D short → mode partial_clean|building', r.mode === 'partial_clean' || r.mode === 'building', r.mode);
  ok('7D short → NOT full historic', r.mode !== 'full', r.mode);
  ok('7D short → badge Calculando', r.badgeEligible === false && /Calculando/.test(r.badgeLabel));
  ok('7D short → state calculating', r.state === 'calculating', r.state);
}

// 4. 30D small leading island + big gap + main cluster → island dropped, no bridge.
{
  const island = seg(T0, 2, 1 * HOUR, 300, 0);                       // tiny old fragment
  const main = seg(T0 + 25 * DAY, 40, 3 * HOUR, 1000, 0.1);          // recent MAIN cluster
  const pts = island.concat(main);
  const e = emgOf(pts, { range: '30d', returnState: 'insufficient_return_history', badgeReturnPct: null, coverageRatio: 0.4, color: 'flat' });
  const r = frc(ON, e, '30d', 'desktop');
  ok('30D island → mode partial_clean', r.mode === 'partial_clean', r.mode);
  ok('30D island → dropped the initial island', r.diagnostics.droppedCount >= 2, 'dropped=' + r.diagnostics.droppedCount);
  ok('30D island → no bridge (renderPoints ⊆ input)', subsetOf(r.renderPoints, pts));
  ok('30D island → first rendered point is the MAIN cluster', r.renderPoints[0].value >= 900, r.renderPoints[0].value);
}

// 5. Bootstrap ramp + stable tramo → only the stable tramo (prefix hidden).
{
  const ramp = [100, 300, 500, 700].map((v, i) => ({ ts: T0 + i * 15 * MIN, value: v }));
  const stable = seg(T0 + 4 * 15 * MIN, 6, 15 * MIN, 950, 10);       // 950..1000, in ±15% band of 1000
  const pts = ramp.concat(stable);
  const cur = pts[pts.length - 1].value;
  const e = emgOf(pts, { range: '30d', returnState: 'insufficient_return_history', badgeReturnPct: null, coverageRatio: 0.1, color: 'flat' });
  const r = frc(ON, e, '30d', 'desktop');
  ok('bootstrap+stable → mode partial_clean', r.mode === 'partial_clean', r.mode);
  ok('bootstrap+stable → hidden low prefix', r.diagnostics.droppedCount >= 4, 'dropped=' + r.diagnostics.droppedCount);
  ok('bootstrap+stable → every rendered point in ±15% band', r.renderPoints.every(p => p.value >= 0.85 * cur), JSON.stringify(r.renderPoints.map(p => p.value)));
  ok('bootstrap+stable → no fabricated point', r.diagnostics.syntheticPoints === 0 && subsetOf(r.renderPoints, pts));
}

// 6. Bootstrap ramp with NO stable tramo → building.
{
  const pts = seg(T0, 9, 15 * MIN, 100, 100);   // 100..900, only the last touches nothing stable
  const e = emgOf(pts, { range: '30d', returnState: 'insufficient_return_history', badgeReturnPct: null, coverageRatio: 0.1, color: 'flat' });
  const r = frc(ON, e, '30d', 'desktop');
  ok('bootstrap no-stable → mode building', r.mode === 'building', r.mode);
  ok('bootstrap no-stable → no line', r.renderPoints.length === 0 && r.lineEligible === false);
  ok('bootstrap no-stable → badge Calculando', /Calculando/.test(r.badgeLabel) && r.badgeEligible === false);
}

// 7. Real large gap between two legit clusters → segmented, never unioned.
{
  const a = seg(T0, 30, 6 * HOUR, 1000, 0.2);
  const b = seg(T0 + 20 * DAY, 30, 6 * HOUR, 1006, 0.2);   // 20-day real gap
  const pts = a.concat(b);
  const e = emgOf(pts, { range: '30d', returnState: 'ok', badgeReturnPct: 3.0, color: 'up', coverageRatio: 0.95 });
  const r = frc(ON, e, '30d', 'desktop');
  ok('real gap → keeps ALL points (no drop)', r.diagnostics.outputCount === pts.length, 'out=' + r.diagnostics.outputCount);
  ok('real gap → segmented (renderPathCount ≥ 2)', r.renderPathCount >= 2, 'paths=' + r.renderPathCount);
  ok('real gap → no synthetic bridge point', r.diagnostics.syntheticPoints === 0 && subsetOf(r.renderPoints, pts));
}

// 8. Mature account → full, real return, no regression.
{
  const e = emgOf(MATURE, { range: '30d', returnState: 'ok', badgeReturnPct: 8.12, color: 'up' });
  const r = frc(ON, e, '30d', 'desktop');
  ok('mature → mode full', r.mode === 'full', r.mode);
  ok('mature → state ready', r.state === 'ready', r.state);
  ok('mature → real % badge, eligible', r.badgeEligible === true && /\+8\.12%/.test(r.badgeLabel), r.badgeLabel);
  ok('mature → colorState positive', r.colorState === 'positive');
  ok('mature → single render path', r.renderPathCount === 1, 'paths=' + r.renderPathCount);
  ok('mature → all points survive', r.diagnostics.outputCount === MATURE.length);
}

// 9. Mobile and desktop receive the SAME output for the SAME inputs.
{
  const e = emgOf(MATURE, { range: '30d', returnState: 'ok', badgeReturnPct: 8.12 });
  const d = frc(ON, e, '30d', 'desktop'), m = frc(ON, emgOf(MATURE, { range: '30d', returnState: 'ok', badgeReturnPct: 8.12 }), '30d', 'mobile');
  ok('parity → identical renderPoints', JSON.stringify(d.renderPoints) === JSON.stringify(m.renderPoints));
  ok('parity → identical mode/state', d.mode === m.mode && d.state === m.state);
  ok('parity → identical badge + colour', d.badgeLabel === m.badgeLabel && d.colorState === m.colorState);
  ok('parity → surface field reflects caller', d.surface === 'desktop' && m.surface === 'mobile');
}

// 10. No synthetic points, ever (renderPoints always a subset of the input).
{
  const cases = [
    frc(ON, emgOf(seg(T0, 48, 30 * MIN, 1000, 0.05), { range: '24h' }), '24h', 'desktop'),
    frc(ON, emgOf(MATURE, { range: '30d' }), '30d', 'desktop'),
    frc(ON, emgOf(seg(T0, 30, 6 * HOUR, 1000, 0.2).concat(seg(T0 + 20 * DAY, 30, 6 * HOUR, 1006, 0.2)), { range: '30d' }), '30d', 'desktop'),
  ];
  ok('no synthetic → syntheticPoints 0 all cases', cases.every(c => c.diagnostics.syntheticPoints === 0));
}

// 11. Determinism — same input, same contract.
{
  const e1 = emgOf(MATURE, { range: '30d', returnState: 'ok', badgeReturnPct: 8.12 });
  const e2 = emgOf(MATURE, { range: '30d', returnState: 'ok', badgeReturnPct: 8.12 });
  const a = frc(ON, e1, '30d', 'desktop'), b = frc(ON, e2, '30d', 'desktop');
  ok('deterministic → byte-identical contract', JSON.stringify(a) === JSON.stringify(b));
}

// 12. Flag OFF reproduces v500: (a) resolver output is flag-independent; (b) equals the manual v500 gate chain.
{
  const mkE = () => emgOf([100, 300, 500, 700].map((v, i) => ({ ts: T0 + i * 15 * MIN, value: v }))
    .concat(seg(T0 + 4 * 15 * MIN, 6, 15 * MIN, 950, 10)),
    { range: '30d', returnState: 'insufficient_return_history', badgeReturnPct: null, color: 'flat' });
  const onR = frc(ON, mkE(), '30d', 'desktop');
  const offR = frc(OFF, mkE(), '30d', 'desktop');
  ok('flag-off → resolver output identical (flag-independent)', JSON.stringify(onR.renderPoints) === JSON.stringify(offR.renderPoints));
  // manual v500 inline chain (short-history → bootstrap → visual-trust), same order the paint paths use when OFF
  const e = mkE(); const r = '30d';
  let pts = e.points.slice();
  const shd = vm.runInContext('_aurixShortHistoryDisplay', ON)({ points: pts, range: r }, r);
  let mode500 = 'full';
  if (shd && shd.mode === 'building') mode500 = 'building';
  else { if (shd && shd.mode === 'partial_clean' && shd.displayPoints.length >= 2) pts = shd.displayPoints.slice();
    const sda = vm.runInContext('_aurixStableDisplayAnchor', ON)(pts, r, { badgeCalculando: e.returnState !== 'ok' });
    if (sda && sda.mode === 'building') mode500 = 'building';
    else { if (sda && sda.points.length >= 2) pts = sda.points.slice();
      const vtg = vm.runInContext('_aurixVisualTrustGate', ON)(pts, r);
      if (vtg && vtg.mode === 'building') mode500 = 'building';
      else if (vtg && vtg.points.length >= 2) pts = vtg.points.slice(); } }
  ok('flag-off → renderPoints equal manual v500 gate chain', mode500 !== 'building' && JSON.stringify(onR.renderPoints) === JSON.stringify(pts), 'v500=' + JSON.stringify(pts.map(p => p.value)));
}

// 13. The painter cannot use raw emg.points when the final contract is ON (source-level contract).
{
  ok('desktop painter assigns emg.points = _frc.renderPoints', /emg\.points\s*=\s*_frc\.renderPoints/.test(app));
  ok('mobile painter assigns emg.points = _frcM.renderPoints', /emg\.points\s*=\s*_frcM\.renderPoints/.test(app));
  ok('both paint paths gate on the FINAL flag', (app.match(/_AURIX_CHART_FINAL_RENDER_SERIES_CONTRACT\s*!==\s*'undefined'/g) || []).length >= 2);
}

// 14. Badge never shows 0.00% unless the return is real + eligible.
{
  const ptsA = seg(T0, 48, 30 * MIN, 1000, 0);
  const real0 = frc(ON, emgOf(ptsA, { range: '24h', returnState: 'ok', badgeReturnPct: 0.0, returnPct: 0.0, color: 'flat' }), '24h', 'desktop');
  ok('real 0% return → shows 0.00% AND eligible', /0\.00%/.test(real0.badgeLabel) && real0.badgeEligible === true, real0.badgeLabel);
  const untrusted = frc(ON, emgOf(ptsA, { range: '24h', returnState: 'insufficient_return_history', badgeReturnPct: null, color: 'flat' }), '24h', 'desktop');
  ok('untrusted return → NEVER 0.00% (Calculando)', !/0\.00%/.test(untrusted.badgeLabel) && untrusted.badgeEligible === false, untrusted.badgeLabel);
}

// 15. Existing renderer calls stay literal (harness/regex-safe) — emg.points still feeds the geometry.
{
  ok('renderer literal preserved in both paths', (app.match(/renderValidatedPortfolioChartWithInstitutionalRenderer\(emg\.points/g) || []).length >= 2);
  ok('audit exposes finalRenderSeriesContract', /finalRenderSeriesContract:\s*finalRenderSeriesContract/.test(app));
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
