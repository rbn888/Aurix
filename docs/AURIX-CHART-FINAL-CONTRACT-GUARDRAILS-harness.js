'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-FINAL-CONTRACT-GUARDRAILS-harness — SPEC DSH.CHART.FINAL-CONTRACT-GUARDRAILS.20
// ════════════════════════════════════════════════════════════════════════════
// Launch guardrail for v502. Proves the VISIBLE chart is driven 100% by the SPEC.19 final render contract
// and that desktop + mobile produce a byte-identical final render series (identical renderHash / mode /
// colorClass / badgeLabel per range). From here on, any change that lets a range or a surface paint points
// outside _aurixResolveFinalRenderSeriesContract — or lets the two surfaces diverge — breaks THIS harness
// before it can reach production. It exercises the REAL resolver + the REAL render-hash (_aurixEmergencyHash)
// from app.js (no mocks), and asserts the audit + both paint paths at the source level.
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
const CONSTS = [
  '_AURIX_VP_GAP_FLOOR_MS', '_AURIX_VP_GAP_MEDIAN_MULT', '_AURIX_EMG_RANGE_MS',
  '_AURIX_CHART_CONTINUITY_UNIFICATION', '_AURIX_CHART_RETURN_CONTRACT_UNIFICATION',
  '_AURIX_CHART_SHORT_HISTORY_DISPLAY', '_AURIX_CHART_SHORT_HISTORY_MIN_DAYS',
  '_AURIX_CHART_VISUAL_TRUST_GATE', '_AURIX_VTG_MIN_MAIN_PTS', '_AURIX_VTG_MIN_MAIN_SPAN_MS',
  '_AURIX_CHART_BOOTSTRAP_SUPPRESSION', '_AURIX_STABLE_BAND_LO', '_AURIX_STABLE_MIN_PTS',
  '_AURIX_STABLE_MIN_SPAN_MS', '_AURIX_STABLE_CONSTRUCTION_JUMP', '_AURIX_CHART_FINAL_RENDER_SERIES_CONTRACT',
];
const FNS = [
  '_aurixEmergencyHash', '_aurixRealGapFloorMs', '_aurixConfirmedBridgeGaps', '_aurixCapitalStepBreaks',
  '_aurixSparseRampBreaks', '_aurixSplitAtGaps', '_aurixBuildContinuityValidatedSeries', '_aurixStructuralBreaks',
  '_aurixResolveChartReturnContract', '_aurixShortHistoryDisplay', '_aurixVisualTrustGate',
  '_aurixStableDisplayAnchor', '_aurixResolveFinalRenderSeriesContract',
];
const ctx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date };
vm.createContext(ctx);
CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (_) {} });
FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (e) { throw new Error('load ' + f + ': ' + e.message); } });
const frc = (emg, range, surface) => vm.runInContext('_aurixResolveFinalRenderSeriesContract', ctx)(emg, range, surface);
const hash = pts => vm.runInContext('_aurixEmergencyHash', ctx)(pts);

// ── fixtures (mirror the SPEC.19 scenarios, one emg per range) ────────────────
function seg(t0, n, stepMs, v0, dv) { const o = []; for (let i = 0; i < n; i++) o.push({ ts: t0 + i * stepMs, value: +(v0 + i * dv).toFixed(2) }); return o; }
function emgOf(points, over) {
  return Object.assign({ range: '30d', state: 'ready', returnState: 'ok', reason: null, pendingReason: null,
    badgeReturnPct: 5.0, returnPct: 5.0, returnValue: 100, color: 'up', coverageRatio: 1.0,
    pointCount: points.length, chartHash: 'h', points: points }, over || {});
}
const subsetOf = (rp, input) => rp.every(p => input.some(q => q.ts === p.ts && q.value === p.value));

const MATURE = seg(T0, 60, 12 * HOUR, 980, 0.4);
// per-range emg matrix used by the parity guardrail (variety: ok, untrusted, short, island, gap)
const MATRIX = {
  '24h_ok':      emgOf(seg(T0, 48, 30 * MIN, 1000, 0.05), { range: '24h', returnState: 'ok', badgeReturnPct: 5.0, color: 'up' }),
  '24h_untrust': emgOf(seg(T0, 48, 30 * MIN, 1000, 0.05), { range: '24h', returnState: 'insufficient_return_history', badgeReturnPct: null, color: 'flat' }),
  '7d_short':    emgOf(seg(T0, 24, 1 * HOUR, 1000, 0.02), { range: '7d', returnState: 'insufficient_return_history', badgeReturnPct: null, coverageRatio: 0.15, color: 'flat' }),
  '30d_island':  emgOf(seg(T0, 2, 1 * HOUR, 300, 0).concat(seg(T0 + 25 * DAY, 40, 3 * HOUR, 1000, 0.1)), { range: '30d', returnState: 'insufficient_return_history', badgeReturnPct: null, coverageRatio: 0.4, color: 'flat' }),
  '30d_gap':     emgOf(seg(T0, 30, 6 * HOUR, 1000, 0.2).concat(seg(T0 + 20 * DAY, 30, 6 * HOUR, 1006, 0.2)), { range: '30d', returnState: 'ok', badgeReturnPct: 3.0, color: 'up', coverageRatio: 0.95 }),
  'mature':      emgOf(MATURE, { range: '30d', returnState: 'ok', badgeReturnPct: 8.12, color: 'up' }),
};

console.log('AURIX-CHART-FINAL-CONTRACT-GUARDRAILS — SPEC.20');

// ── G1 — the read-only audit exists and has the mandated shape ────────────────
console.log('\nG1 — window.aurixChartFinalContractAudit shape:');
const auditSrc = (function () { const i = app.indexOf('window.aurixChartFinalContractAudit = function'); return i < 0 ? '' : braceSlice(app.indexOf('{', i)); })();
ok('G1.1 audit function is defined', auditSrc.length > 0);
ok('G1.2 audits ALL 5 ranges', /RANGES\s*=\s*\['24h',\s*'7d',\s*'30d',\s*'1y',\s*'all'\]/.test(auditSrc));
ok('G1.3 audits BOTH surfaces', /SURFACES\s*=\s*\['desktop',\s*'mobile'\]/.test(auditSrc));
ok('G1.4 both surfaces resolved from the ONE final contract', /_aurixResolveFinalRenderSeriesContract\(chart,\s*r,\s*s\)/.test(auditSrc));
['appVersion', 'renderHash', 'renderPathCount', 'colorClass', 'badgeLabel', 'badgeEligible', 'reasonCodes', 'diagnostics'].forEach(k =>
  ok('G1.5 audit exposes ' + k, new RegExp(k).test(auditSrc)));
ok('G1.6 audit exposes parity.desktopEqualsMobile', /desktopEqualsMobile/.test(auditSrc));
ok('G1.7 audit uses the real render-hash (_aurixEmergencyHash)', /_aurixEmergencyHash/.test(auditSrc));
ok('G1.8 audit is read-only (no assignment to emg/points/flag/render call)',
   !/_aurixEmergencyPaint|renderValidatedPortfolioChart|\bemg\.points\s*=|hostEl\.innerHTML/.test(auditSrc));

// ── G2 — desktop and mobile produce the SAME renderHash / mode / colorClass / badge per range ──
console.log('\nG2 — desktop ≡ mobile (the parity the audit reports):');
Object.keys(MATRIX).forEach(key => {
  const e = MATRIX[key];
  const d = frc(emgOf(e.points, e), e.range, 'desktop');
  const m = frc(emgOf(e.points, e), e.range, 'mobile');
  const hd = hash(d.renderPoints), hm = hash(m.renderPoints);
  ok('G2 ' + key + ' → identical renderHash', hd === hm, hd + ' vs ' + hm);
  ok('G2 ' + key + ' → identical mode/colorClass/badge/paths',
     d.mode === m.mode && d.colorClass === m.colorClass && d.badgeLabel === m.badgeLabel && d.renderPathCount === m.renderPathCount,
     JSON.stringify([d.mode, d.colorClass, d.badgeLabel]) + ' vs ' + JSON.stringify([m.mode, m.colorClass, m.badgeLabel]));
});

// ── G3 — no paint path may render points other than frc.renderPoints when the flag is ON ──
console.log('\nG3 — no bypass of the final contract in either paint path:');
const deskFn = fnSrc('_wscPaintEmergency');
const liteFn = app.slice(app.indexOf('function renderAurixMobileLiteChart'), app.indexOf('function scheduleAurixMobileLite'));
ok('G3.1 desktop ON-branch assigns emg.points = _frc.renderPoints', /_frcOn && emg\.state === 'ready'[\s\S]{0,900}emg\.points = _frc\.renderPoints/.test(deskFn));
ok('G3.2 mobile ON-branch assigns emg.points = _frcM.renderPoints', /_frcOnM && emg\.state === 'ready'[\s\S]{0,900}emg\.points = _frcM\.renderPoints/.test(liteFn));
ok('G3.3 desktop renderer reads emg.points (fed only by the contract on the ON path)', /renderValidatedPortfolioChartWithInstitutionalRenderer\(emg\.points/.test(deskFn));
ok('G3.4 mobile renderer reads emg.points (fed only by the contract on the ON path)', /renderValidatedPortfolioChartWithInstitutionalRenderer\(emg\.points/.test(liteFn));
ok('G3.5 desktop tone comes from the contract when ON', /_frcTone != null\) \? _frcTone : emg\.color/.test(deskFn));
ok('G3.6 mobile tone comes from the contract when ON', /_frcToneM != null\) \? _frcToneM : emg\.color/.test(liteFn));
// the ONLY emg.points reassignment on the ON-branch (from the FRC `if` to ITS `} else {`) is the contract's
const onBranch = (src, marker) => { const s = src.indexOf(marker); const e = src.indexOf('} else {', s); return (s >= 0 && e > s) ? src.slice(s, e) : ''; };
ok('G3.7 desktop ON-branch has exactly ONE emg.points assignment (the contract)',
   (onBranch(deskFn, "_frcOn && emg.state === 'ready'").match(/emg\.points\s*=/g) || []).length === 1);
ok('G3.8 mobile ON-branch has exactly ONE emg.points assignment (the contract)',
   (onBranch(liteFn, "_frcOnM && emg.state === 'ready'").match(/emg\.points\s*=/g) || []).length === 1);
ok('G3.9 both paint paths gate on the FINAL flag', (app.match(/_AURIX_CHART_FINAL_RENDER_SERIES_CONTRACT\s*!==\s*'undefined'/g) || []).length >= 2);

// ── G4 — behavioural invariants (must never silently regress) ─────────────────
console.log('\nG4 — behavioural invariants held by the contract:');
{ const r = frc(MATRIX['24h_ok'], '24h', 'desktop');
  ok('G4.1 24H ok → green + real % (eligible)', r.colorState === 'positive' && r.badgeEligible === true && /\+5\.00%/.test(r.badgeLabel)); }
{ const r = frc(MATRIX['24h_untrust'], '24h', 'desktop');
  ok('G4.2 24H untrusted → neutral + Calculando, never 0.00%', r.colorState === 'neutral' && /Calculando/.test(r.badgeLabel) && !/0\.00%/.test(r.badgeLabel) && r.lineEligible === true); }
{ const r = frc(MATRIX['7d_short'], '7d', 'desktop');
  ok('G4.3 7D short-history → NOT a full historic', r.mode !== 'full' && r.badgeEligible === false); }
{ const r = frc(MATRIX['30d_island'], '30d', 'desktop');
  ok('G4.4 30D island → dropped + no fragment/bootstrap in output', r.diagnostics.droppedCount >= 2 && r.renderPoints[0].value >= 900 && subsetOf(r.renderPoints, MATRIX['30d_island'].points)); }
{ const bramp = [100, 300, 500, 700].map((v, i) => ({ ts: T0 + i * 15 * MIN, value: v })).concat(seg(T0 + 4 * 15 * MIN, 6, 15 * MIN, 950, 10));
  const r = frc(emgOf(bramp, { range: '30d', returnState: 'insufficient_return_history', badgeReturnPct: null, color: 'flat' }), '30d', 'desktop');
  ok('G4.5 bootstrap ramp → only the stable tramo (every point in ±15% band)', r.mode === 'partial_clean' && r.renderPoints.every(p => p.value >= 850)); }
{ const r = frc(MATRIX['mature'], '30d', 'desktop');
  ok('G4.6 mature → full / ready / all points survive (no regression)', r.mode === 'full' && r.state === 'ready' && r.diagnostics.outputCount === MATURE.length); }
{ const r = frc(MATRIX['30d_gap'], '30d', 'desktop');
  ok('G4.7 real gap → segmented, never unioned (renderPathCount ≥ 2, no drop)', r.renderPathCount >= 2 && r.diagnostics.outputCount === MATRIX['30d_gap'].points.length); }
{ const all = Object.keys(MATRIX).map(k => frc(MATRIX[k], MATRIX[k].range, 'desktop'));
  ok('G4.8 syntheticPoints ALWAYS 0', all.every(r => r.diagnostics.syntheticPoints === 0)); }

// ── G5 — determinism of the guardrail itself ──────────────────────────────────
console.log('\nG5 — deterministic guardrail:');
{ const a = frc(MATRIX['mature'], '30d', 'desktop'), b = frc(MATRIX['mature'], '30d', 'desktop');
  ok('G5.1 same input → identical renderHash', hash(a.renderPoints) === hash(b.renderPoints));
  ok('G5.2 SPEC.19 marker intact', /SPEC DSH\.CHART\.FINAL_RENDER_SERIES_CONTRACT\.19/.test(app));
  ok('G5.3 SPEC.20 audit marker present', /SPEC DSH\.CHART\.FINAL-CONTRACT-GUARDRAILS\.20/.test(app)); }

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
