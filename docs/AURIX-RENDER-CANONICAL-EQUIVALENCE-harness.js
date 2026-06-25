/* AURIX — RENDER ↔ CANONICAL EQUIVALENCE — objective audit harness.
   Extracts the REAL audit (_aurixCompareRenderToCanonical + auditAurixRenderVsCanonical)
   and the render-engine chain from app.js, stubs only the data accessors, and proves
   the Institutional Render represents the canonical series EXACTLY:

     • same first / last / global-max / global-min
     • all rendered timestamps ∈ canonical, chronological
     • no invented points, no altered values
     • the ONLY reduction is documented LTTB downsampling (intermediate, non-extremal)
     • a genuine big vertical jump is proven to be REAL data (its endpoints are canonical)
     • the audit DETECTS planted corruption (invented / altered / lost extremum / endpoints)

   This isolates any visual difference to the DRAWING algorithm; the DATA is untouched.
   Run: node docs/AURIX-RENDER-CANONICAL-EQUIVALENCE-harness.js                       */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function fn(name){ const s='function '+name+'('; const i=src.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=src.indexOf('{',i),d=0; for(;k<src.length;k++){const c=src[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} return src.slice(i,k); }
function block(startStr, endStr){ const i=src.indexOf(startStr); if(i<0)throw new Error('missing '+startStr);
  const e=src.indexOf(endStr, i); if(e<0)throw new Error('missing '+endStr); return src.slice(i, e+endStr.length); }

const RC_CONSTS = block('const _AURIX_RC_QUALITY_THRESHOLD', 'const _AURIX_RC_VPAD_FRAC = 0.08;');
const VP_CONSTS = block('const _AURIX_VP_DENSITY', 'const _AURIX_VP_VALUE_EPS = 0.004;');
const IR_CONSTS = block('const _AURIX_IR_VALUE_MARGIN', '= 0.08;');
const Y_CONSTS  = block('const _AURIX_Y_JUMP_DOMINANCE', 'const _AURIX_Y_LEGIBLE_ALPHA  = 0.35;');
const X_CONSTS  = block('const _AURIX_X_FILL_BETA', '};');

const DAY = 86400e3, HOUR = 36e5, MIN = 60e3, NOW = 1000 * DAY;

let SERIES = [], DASH = null, FLOWS = [];
const sb = { console, activeRange: '30d', getAurixRenderSeries: () => SERIES, investableValueBase: () => DASH, _aurixLoadCapitalFlows: () => FLOWS };
sb.window = sb; sb.window.innerWidth = 1440;
vm.createContext(sb);
vm.runInContext(RC_CONSTS, sb); vm.runInContext(VP_CONSTS, sb); vm.runInContext(IR_CONSTS, sb); vm.runInContext(Y_CONSTS, sb); vm.runInContext(X_CONSTS, sb);
[ fn('_aurixRenderContractGeometry'), fn('_aurixVpTargetPointCount'), fn('_aurixComputeVisualPreparation'),
  fn('prepareAurixVisualSeries'), fn('downsampleAurixLTTB'), fn('_aurixSignificantLocalExtrema'), fn('downsampleAurixAdaptive'), fn('computeAurixTimeScale'), fn('computeAurixAdaptiveXScale'),
  fn('computeAurixValueScale'), fn('_aurixMonotonePath'), fn('buildAurixMonotonicPath'),
  fn('buildAurixAreaPath'), fn('_aurixSplitAtGaps'), fn('renderAurixInstitutionalChart'),
  fn('_aurixCompareRenderToCanonical'), fn('auditAurixRenderVsCanonical') ].forEach(c => vm.runInContext(c, sb));

const { auditAurixRenderVsCanonical, _aurixCompareRenderToCanonical } = sb;
const lastV = s => s[s.length - 1].value;
const audit = (range, series) => { SERIES = series; DASH = lastV(series); FLOWS = []; return auditAurixRenderVsCanonical(range); };

function cont(n, spanMs, base) { const t0 = NOW - spanMs; const pts = Array.from({ length: n }, (_, i) => ({ time: t0 + Math.round(i * spanMs / (n - 1)), value: base + 220 * Math.sin(i * 0.4) + i * 4 })); pts[n - 1].time = NOW; return pts; }
function bigJump(n, spanMs) { const s = cont(n, spanMs, 50000); const k = n >> 1; for (let i = k; i < n; i++) s[i].value += 30000; return s; }   // real regime jump at k
function sparseEarlySpiky(spanDays) {
  const t0 = NOW - spanDays * DAY, denseStart = NOW - 30 * DAY, pts = [];
  for (let tt = t0; tt < denseStart - DAY; tt += 30 * DAY) pts.push({ time: tt, value: 40000 + ((tt - t0) / DAY) * 5 });
  for (let i = 0; i < 120; i++) pts.push({ time: denseStart + Math.round(i * 30 * DAY / 119), value: 60000 + (i % 7 === 0 ? 6000 : 0) + 400 * Math.sin(i * 0.9) });   // narrow recent spikes
  pts[pts.length - 1].time = NOW; pts.sort((a, b) => a.time - b.time); return pts;
}

let ok = true;
const ck = (n, c, g) => { console.log((c ? '  ✓' : '  ✗') + ' ' + n + (g !== undefined ? '  [' + g + ']' : '')); if (!c) ok = false; };
const faithful = a => ['exact', 'faithful-downsampled'].indexOf(a.status) >= 0;
const allMatch = a => a.firstMatch && a.lastMatch && a.maxMatch && a.minMatch && a.timestampsSubset && a.noInvented && a.monotonicTime && a.diffs.length === 0;

console.log('AURIX — Render ↔ Canonical equivalence\n');

console.log('ALL RANGES — rendered is an exact faithful subset of the canonical series:');
for (const [r, n, span] of [['24h', 80, DAY], ['7d', 90, 7 * DAY], ['30d', 100, 30 * DAY], ['1y', 120, 360 * DAY], ['all', 130, 700 * DAY]]) {
  const a = audit(r, cont(n, span, 60000));
  ck(r + ' status faithful (exact/faithful-downsampled)', faithful(a), a.status + ' canon=' + a.pointsCanonical + ' rendered=' + a.pointsRendered);
  ck(r + ' first/last/max/min/ts/no-invented all match', allMatch(a), 'diffs=' + a.diffs.length);
}

console.log('\n30D BIG VERTICAL JUMP — the jump is REAL data (its endpoints are canonical points):');
{ const s = bigJump(60, 30 * DAY); const a = audit('30d', s);
  ck('faithful + no diffs', faithful(a) && a.diffs.length === 0, a.status);
  ck('global max & min preserved', a.maxMatch && a.minMatch);
  const j = a.largestRenderedJump;
  const inCanon = s.some(p => p.time === j.fromTs) && s.some(p => p.time === j.toTs);
  ck('largest rendered jump endpoints exist in canonical', !!j && inCanon, j ? ('Δ' + Math.round(j.deltaAbs) + ' over ' + Math.round(j.dtMs / DAY) + 'd') : 'none'); }

console.log('\n1A / TOTAL sparse-early + narrow recent spikes — faithful, extrema kept:');
for (const [r, days] of [['1y', 300], ['all', 700]]) {
  const a = audit(r, sparseEarlySpiky(days));
  ck(r + ' faithful + all match', faithful(a) && allMatch(a), a.status + ' droppedDownsample=' + a.droppedByDownsampling);
  ck(r + ' first rendered == earliest canonical (early history kept)', a.firstMatch);
}

console.log('\nDENSE > target — only LTTB downsampling reduces count; extrema/endpoints kept:');
{ const s = cont(400, DAY, 70000); const a = audit('24h', s);
  ck('status = faithful-downsampled', a.status === 'faithful-downsampled', a.status);
  ck('droppedByDownsampling > 0 (intermediate non-extremal points)', a.droppedByDownsampling > 0, a.pointsCanonical + '→' + a.pointsRendered);
  ck('no invented / no altered (diffs empty)', a.diffs.length === 0);
  ck('first/last/max/min preserved', a.firstMatch && a.lastMatch && a.maxMatch && a.minMatch); }

console.log('\nAUDIT DETECTS CORRUPTION (proves it is not a rubber stamp):');
{ const canon = cont(20, DAY, 70000);
  // invented point (timestamp not in canon)
  const inv = _aurixCompareRenderToCanonical(canon.slice(0, 19).concat([{ time: NOW + 5 * MIN, value: 99999 }]), canon);
  ck('invented point → divergent + invented_point diff', inv.status === 'divergent' && inv.diffs.some(d => d.kind === 'invented_point'), inv.diffs.map(d => d.kind).join(','));
  // altered value at a real timestamp
  const altPts = canon.map((p, i) => i === 5 ? { time: p.time, value: p.value + 12345 } : p);
  const alt = _aurixCompareRenderToCanonical(altPts, canon);
  ck('altered value → divergent + value_altered diff (exact point)', alt.status === 'divergent' && alt.diffs.some(d => d.kind === 'value_altered' && d.time === canon[5].time), 'pt ts=' + canon[5].time);
  // dropped global max (peak removed from rendered)
  const peak = canon.slice(); peak[10].value = 200000;          // make a clear global max at idx 10
  const dropped = peak.filter((_, i) => i !== 10);              // rendered loses it
  const lost = _aurixCompareRenderToCanonical(dropped, peak);
  ck('lost global max → divergent + global_max diff', lost.status === 'divergent' && lost.diffs.some(d => d.kind === 'global_max'));
  // first/last mismatch
  const shifted = canon.slice(1);
  const fm = _aurixCompareRenderToCanonical(shifted, canon);
  ck('first-point mismatch → divergent + first_point diff', fm.status === 'divergent' && fm.diffs.some(d => d.kind === 'first_point')); }

console.log('\nDETERMINISM:');
{ const s = cont(90, 7 * DAY, 65000); const a = audit('7d', s), b = audit('7d', s);
  ck('same input → identical audit', JSON.stringify(a) === JSON.stringify(b)); }

console.log('\nRESULT:', ok ? 'ALL PASS ✓ — render is an exact faithful representation of the canonical series; differences are drawing-only' : 'FAIL ✗');
process.exit(ok ? 0 : 1);
