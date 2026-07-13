'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-7D-SINGLE-CONTINUOUS-CONTRACT-harness — SPEC DSH.CHART.7D_SINGLE_CONTINUOUS_CONTRACT.45
// ════════════════════════════════════════════════════════════════════════════
// Production evidence: on ≥2 accounts the 7D chart drew two disconnected islands (continuous-left → big
// empty gap → separate-right). Root cause = FINAL_CONTRACT_SEGMENTATION (E): the FRC enforced a single
// visible path for 24H (SPEC.21 C5) but NOT for 7D, so the visual-trust-gate's honest ≥2-substantial-cluster
// output reached the renderer as two visible runs. Fix (step 6.6 of _aurixResolveFinalRenderSeriesContract,
// flag _AURIX_CHART_7D_SINGLE_CONTINUOUS): for 7D only, split on the SAME break set the renderer splits on,
// and when >1 run select EXACTLY ONE authoritative continuous run (recent-first, else recency→span→count→ts),
// never bridging/fabricating/concatenating (syntheticPoints stays 0), marking partial and keeping the
// discarded runs in diagnostics. This harness proves it against the REAL app.js source (no resolver mock),
// with ON (flag true) vs OFF (flag false) contexts to prove before/after and that only 7D changes.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(startIdx) { let k = app.indexOf('{', startIdx), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(startIdx, k); }
function fnSrc(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing fn ' + name); return braceSlice(i); }
function konstSrc(name) {
  const m = new RegExp('const ' + name + '\\s*=\\s*').exec(app);
  if (!m) throw new Error('missing const ' + name);
  const eq = m.index + m[0].length, first = app[eq];
  if (first === '{' || first === '[') { const body = braceSlice(eq); const semi = app.indexOf(';', eq + body.length); return app.slice(m.index, semi + 1); }
  const semi = app.indexOf(';', eq); return app.slice(m.index, semi + 1);
}
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const HOUR = 36e5, DAY = 864e5, MIN = 60e3, T0 = 1_800_000_000_000;
const CONSTS = [
  '_AURIX_VP_GAP_FLOOR_MS', '_AURIX_VP_GAP_MEDIAN_MULT', '_AURIX_EMG_RANGE_MS',
  '_AURIX_CHART_CONTINUITY_UNIFICATION', '_AURIX_CHART_RETURN_CONTRACT_UNIFICATION',
  '_AURIX_CHART_SHORT_HISTORY_DISPLAY', '_AURIX_CHART_SHORT_HISTORY_MIN_DAYS',
  '_AURIX_CHART_VISUAL_TRUST_GATE', '_AURIX_VTG_MIN_MAIN_PTS', '_AURIX_VTG_MIN_MAIN_SPAN_MS',
  '_AURIX_CHART_BOOTSTRAP_SUPPRESSION', '_AURIX_STABLE_BAND_LO', '_AURIX_STABLE_MIN_PTS',
  '_AURIX_STABLE_MIN_SPAN_MS', '_AURIX_STABLE_CONSTRUCTION_JUMP',
  '_AURIX_CHART_FINAL_RENDER_SERIES_CONTRACT', '_AURIX_CHART_CANONICAL_REFRESH_DETERMINISM',
  '_AURIX_CHART_RELIABILITY_DEADLOCK_RESOLUTION', '_AURIX_ALL_MIN_TRUST_POINTS',
];
const FNS = [
  '_aurixRealGapFloorMs', '_aurixConfirmedBridgeGaps', '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks',
  '_aurixSplitAtGaps', '_aurixBuildContinuityValidatedSeries', '_aurixStructuralBreaks', '_aurixVerticalJumps',
  '_aurixResolveChartReturnContract', '_aurixShortHistoryDisplay', '_aurixVisualTrustGate',
  '_aurixStableDisplayAnchor', '_aurixResolveReliabilityDeadlock', '_aurixResolveFinalRenderSeriesContract',
  '_aurixEmergencyHash',
];
function mkCtx(flagOn) {
  const ctx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date };
  vm.createContext(ctx);
  CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (e) { /* optional */ } });
  // Load the 7D flag explicitly so OFF (false) mimics pre-fix behaviour without a ReferenceError.
  vm.runInContext('const _AURIX_CHART_7D_SINGLE_CONTINUOUS = ' + (flagOn ? 'true' : 'false') + ';', ctx);
  FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (e) { throw new Error('load ' + f + ': ' + e.message); } });
  return ctx;
}
const ON = mkCtx(true), OFF = mkCtx(false);
const frc = (ctx, emg, range, surface) => vm.runInContext('_aurixResolveFinalRenderSeriesContract', ctx)(emg, range, surface);
function visibleRuns(ctx, renderPoints, range) {
  const m = (renderPoints || []).map(p => ({ time: (p.ts != null ? p.ts : p.time), value: p.value })).filter(p => Number.isFinite(p.time) && Number.isFinite(p.value));
  if (m.length < 2) return m.length ? 1 : 0;
  let br = []; try { const sb = vm.runInContext('_aurixStructuralBreaks', ctx)(m, range); br = (sb && sb.breaks) || []; } catch (_) {}
  let rn = [m]; if (br.length) { try { rn = vm.runInContext('_aurixSplitAtGaps', ctx)(m, br) || [m]; } catch (_) {} }
  return rn.filter(x => x && x.length).length;
}

function seg(t0, n, step, v0, dv) { const o = []; for (let i = 0; i < n; i++) o.push({ ts: t0 + i * step, value: +(v0 + i * dv).toFixed(2) }); return o; }
function emgOf(points, over) {
  return Object.assign({ range: '7d', state: 'ready', returnState: 'ok', reason: null, pendingReason: null,
    badgeReturnPct: 3.2, returnPct: 3.2, returnValue: 30, color: 'up', coverageRatio: 1.0,
    pointCount: points.length, chartHash: 'h', points: points, baselineTs: points[0] && points[0].ts, baselineValue: points[0] && points[0].value }, over || {});
}
const isSubset = (rp, input) => rp.every(p => input.some(q => q.ts === (p.ts != null ? p.ts : p.time) && q.value === p.value));
const isChrono = rp => rp.every((p, i) => i === 0 || (p.ts != null ? p.ts : p.time) > (rp[i - 1].ts != null ? rp[i - 1].ts : rp[i - 1].time));
const dHash = (ctx, rp) => vm.runInContext('_aurixEmergencyHash', ctx)((rp || []).map(p => ({ ts: (p.ts != null ? p.ts : p.time), value: p.value })));

// ── fixtures ──────────────────────────────────────────────────────────────────
const CONT_FE = seg(T0, 168, HOUR, 1000, 0.02);                                            // continuous 7d hourly
const CONT_BE = seg(T0, 84, 2 * HOUR, 990, 0.05);                                          // continuous 7d, 2h cadence
// two real islands: older block, ~4d real gap, recent block (endpoint = current value)
const ISL_OLD = seg(T0, 48, HOUR, 1000, 0.02);
const ISL_NEW = seg(T0 + 5 * DAY, 48, HOUR, 1001, 0.02);
const ISLANDS = ISL_OLD.concat(ISL_NEW);
// account-B shape: smaller recent block, larger older block, different gap
const B_OLD = seg(T0, 60, HOUR, 500, 0.01);
const B_NEW = seg(T0 + 5.5 * DAY, 30, HOUR, 502, 0.03);
const ISLANDS_B = B_OLD.concat(B_NEW);

console.log('AURIX-7D-SINGLE-CONTINUOUS-CONTRACT — SPEC.45');

// 1. Continuous frontend 7D → unchanged, one visible segment, ready.
{ const e = emgOf(CONT_FE, { range: '7d' }); const r = frc(ON, e, '7d', 'desktop');
  ok('1 continuous FE 7D → exactly one visible segment', visibleRuns(ON, r.renderPoints, '7d') === 1, 'runs=' + visibleRuns(ON, r.renderPoints, '7d'));
  ok('1 continuous FE 7D → ready + full + ≥2 pts + all original', r.state === 'ready' && r.mode === 'full' && r.renderPoints.length >= 2 && isSubset(r.renderPoints, CONT_FE));
  ok('1 continuous FE 7D → NOT trimmed by 6.6 (no single-path code)', !(r.reasonCodes || []).includes('single_continuous_7d_single_path')); }

// 2. Mature continuous backend 7D → unchanged, one visible segment.
{ const e = emgOf(CONT_BE, { range: '7d' }); const r = frc(ON, e, '7d', 'desktop');
  ok('2 continuous BE 7D → one visible segment, all original', visibleRuns(ON, r.renderPoints, '7d') === 1 && isSubset(r.renderPoints, CONT_BE)); }

// 3. FE recent + BE older + real gap → never two islands; select one deterministic; partial true.
{ const e = emgOf(ISLANDS, { range: '7d' }); const r = frc(ON, e, '7d', 'desktop'); const rOff = frc(OFF, e, '7d', 'desktop');
  ok('3 ON 7D islands → exactly ONE visible segment (never two islands)', visibleRuns(ON, r.renderPoints, '7d') === 1, 'runs=' + visibleRuns(ON, r.renderPoints, '7d'));
  ok('3 ON 7D islands → selected the RECENT run (endpoint reconciles with current value)', r.renderPoints[r.renderPoints.length - 1].ts === ISL_NEW[ISL_NEW.length - 1].ts);
  ok('3 ON 7D islands → partial + single-path reason + discarded run in diagnostics', (r.reasonCodes || []).includes('single_continuous_7d_single_path') && r.mode === 'partial_clean' && r.diagnostics.sevenDayDiscardedRuns && r.diagnostics.sevenDayDiscardedRuns.length === 1);
  ok('3 ON 7D islands → all points original, zero synthetic', isSubset(r.renderPoints, ISLANDS) && r.diagnostics.syntheticPoints === 0);
  ok('3 BEFORE (flag OFF) drew TWO islands — proves this fix is the owner', visibleRuns(OFF, rOff.renderPoints, '7d') === 2, 'offRuns=' + visibleRuns(OFF, rOff.renderPoints, '7d')); }

// 4. Overlap / mixed → the chosen run is ONE contiguous run (one valuation family per continuous segment).
{ const e = emgOf(ISLANDS, { range: '7d' }); const r = frc(ON, e, '7d', 'desktop');
  ok('4 selected segment is a single contiguous run (no mixed-family concatenation)', visibleRuns(ON, r.renderPoints, '7d') === 1 && r.renderPoints.length === ISL_NEW.length); }

// 5. Genuinely continuous input (valid points throughout) → 6.6 does NOT over-split; keeps all.
{ const e = emgOf(CONT_FE, { range: '7d' }); const r = frc(ON, e, '7d', 'desktop');
  ok('5 continuous input kept intact (6.6 sees 1 run, trims nothing)', r.renderPoints.length === CONT_FE.length && r.diagnostics.visiblePath7dRuns === 1 && !(r.reasonCodes || []).includes('single_continuous_7d_single_path')); }

// 6. Real missing history — recent block too small/brief AND older ineligible → PENDING (building), never bridged.
{ const tiny = seg(T0, 60, HOUR, 1000, 0.01).concat(seg(T0 + 6 * DAY + 20 * HOUR, 2, 10 * MIN, 1001, 0.01));   // 2-pt, ~10min recent tail
  const e = emgOf(tiny, { range: '7d' }); const r = frc(ON, e, '7d', 'desktop');
  ok('6 real missing history → single segment OR pending (never two islands, never bridged)', (r.mode === 'building') || (visibleRuns(ON, r.renderPoints, '7d') === 1), 'mode=' + r.mode + ' runs=' + visibleRuns(ON, r.renderPoints, '7d'));
  ok('6 no synthetic points in the pending/partial path', (r.diagnostics.syntheticPoints || 0) === 0); }

// 7. Two different account shapes → same deterministic policy, no cross-contamination.
{ const rA = frc(ON, emgOf(ISLANDS, { range: '7d' }), '7d', 'desktop'); const rB = frc(ON, emgOf(ISLANDS_B, { range: '7d' }), '7d', 'desktop');
  ok('7 account A → one visible segment (recent)', visibleRuns(ON, rA.renderPoints, '7d') === 1 && rA.renderPoints[rA.renderPoints.length - 1].ts === ISL_NEW[ISL_NEW.length - 1].ts);
  ok('7 account B → one visible segment (recent), independent shape', visibleRuns(ON, rB.renderPoints, '7d') === 1 && rB.renderPoints[rB.renderPoints.length - 1].ts === B_NEW[B_NEW.length - 1].ts);
  ok('7 deterministic: re-run A identical (no state carryover)', dHash(ON, rA.renderPoints) === dHash(ON, frc(ON, emgOf(ISLANDS, { range: '7d' }), '7d', 'desktop').renderPoints)); }

// 8-11. 24H / 30D / 1Y / ALL behaviour UNCHANGED by this fix (ON === OFF, and 6.6 never fires).
['24h', '30d', '1y', 'all'].forEach(rg => {
  const e = emgOf(ISLANDS, { range: rg }); const on = frc(ON, e, rg, 'desktop'); const off = frc(OFF, e, rg, 'desktop');
  ok((rg === '24h' ? '8' : rg === '30d' ? '9' : rg === '1y' ? '10' : '11') + ' ' + rg.toUpperCase() + ' unchanged (ON===OFF renderPoints) + 6.6 never fired', dHash(ON, on.renderPoints) === dHash(OFF, off.renderPoints) && on.diagnostics.visiblePath7dRuns === undefined && !(on.reasonCodes || []).some(c => /single_continuous_7d/.test(c)));
});

// 12-15. No synthetic timestamps/values, no interpolation, no smoothing (every render point ∈ input).
{ const r = frc(ON, emgOf(ISLANDS, { range: '7d' }), '7d', 'desktop');
  ok('12/13 no synthetic timestamps/values — every render point exists verbatim in the input', isSubset(r.renderPoints, ISLANDS));
  ok('14/15 no interpolation/smoothing — syntheticPoints 0 + chronological originals', r.diagnostics.syntheticPoints === 0 && isChrono(r.renderPoints)); }

// 16. Desktop/mobile exact point parity across all fixtures.
{ let allParity = true;
  [['7d', ISLANDS], ['7d', CONT_FE], ['7d', ISLANDS_B]].forEach(([rg, pts]) => {
    const d = frc(ON, emgOf(pts, { range: rg }), rg, 'desktop'), m = frc(ON, emgOf(pts, { range: rg }), rg, 'mobile');
    if (!(d.renderPoints.length === m.renderPoints.length && dHash(ON, d.renderPoints) === dHash(ON, m.renderPoints))) allParity = false;
  });
  ok('16 desktop/mobile exact point parity (7D)', allParity); }

// 17. FRC never returns more than one visible segment for 7D (all 7D fixtures).
{ let maxRuns = 0; [ISLANDS, CONT_FE, CONT_BE, ISLANDS_B].forEach(pts => { const r = frc(ON, emgOf(pts, { range: '7d' }), '7d', 'desktop'); maxRuns = Math.max(maxRuns, visibleRuns(ON, r.renderPoints, '7d')); });
  ok('17 7D final contract NEVER exposes >1 visible segment', maxRuns <= 1, 'maxRuns=' + maxRuns); }

// 18. Golden v510 / renderer byte-untouched by SPEC.45 (no new symbols in the render path).
{ const chartFns = ['renderValidatedPortfolioChartWithInstitutionalRenderer', 'renderAurixInstitutionalChart', '_aurixSplitAtGaps'];
  const newSym = ['_AURIX_CHART_7D_SINGLE_CONTINUOUS', 'single_continuous_7d', 'aurixAudit7dContinuity'];
  let clean = true; chartFns.forEach(fn => { const single = (app.match(new RegExp('^function ' + fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\(', 'gm')) || []).length === 1; if (!single || newSym.some(s => fnSrc(fn).indexOf(s) >= 0)) clean = false; });
  ok('18 renderer + _aurixSplitAtGaps free of SPEC.45 symbols (Golden v510 render path untouched)', clean); }

// 19. Invariant: state==='ready' ⇒ points≥2 ∧ one segment ∧ chronological ∧ original ∧ desktop==mobile.
{ const d = frc(ON, emgOf(CONT_FE, { range: '7d' }), '7d', 'desktop'), m = frc(ON, emgOf(CONT_FE, { range: '7d' }), '7d', 'mobile');
  const inv = (d.state !== 'ready') || (d.renderPoints.length >= 2 && visibleRuns(ON, d.renderPoints, '7d') === 1 && isChrono(d.renderPoints) && isSubset(d.renderPoints, CONT_FE) && dHash(ON, d.renderPoints) === dHash(ON, m.renderPoints));
  ok('19 READY invariant holds (≥2 pts, 1 segment, chronological, original, parity)', inv); }

// 20. Debug/forensic audit exposed + read-only.
{ ok('20 window.aurixAudit7dContinuity exposed', /window\.aurixAudit7dContinuity = _aurixAudit7dContinuity/.test(app));
  ok('20 SPEC.45 marker + flag present', app.indexOf('7D_SINGLE_CONTINUOUS_CONTRACT.45') >= 0 && /const _AURIX_CHART_7D_SINGLE_CONTINUOUS = true;/.test(app)); }

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' SPEC.45 7D-SINGLE-CONTINUOUS-CONTRACT — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
