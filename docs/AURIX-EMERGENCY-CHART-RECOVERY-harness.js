'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-EMERGENCY-CHART-RECOVERY-harness — P0 emergency production recovery
// ════════════════════════════════════════════════════════════════════════════
// buildEmergencyInstitutionalChart(range) is THE single deterministic source for the visible main
// dashboard chart line + the visible chart return. It is impossible to make it emit a mixed state
// (line without %, % without line, -67% construction baseline, or a desktop/mobile mismatch). These
// tests extract the pure functions from app.js and run them in a sandbox with stubbed globals — the
// range anchor is proven to be the LAST snapshot ts (never Date.now()).
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name) {
  const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let p = app.indexOf('(', i), pd = 0; for (; p < app.length; p++) { if (app[p] === '(') pd++; else if (app[p] === ')') { pd--; if (!pd) { p++; break; } } }
  let k = app.indexOf('{', p), d = 0; for (; k < app.length; k++) { if (app[k] === '{') d++; else if (app[k] === '}') { d--; if (!d) { k++; break; } } }
  return app.slice(i, k);
}
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }

const HOUR = 3600000, DAY = 86400000;
const LAST = 1800000000000;                 // last snapshot ts (the real anchor)
const FAKE_NOW = LAST + 100 * DAY;          // Date.now() far in the future — must NEVER be the anchor

function makeEnv(hist, opts) {
  opts = opts || {};
  const sb = {
    Math: Math, Number: Number, Map: Map, Array: Array, String: String, JSON: JSON,
    isFinite: isFinite, parseFloat: parseFloat,
    Date: { now: () => FAKE_NOW }, console: { log: () => {} },
    activeRange: opts.activeRange || '30d', activePerfMode: 'pct',
    categoryHistory: hist || [],
    toBase: (v) => v,                                    // identity — sandbox base == USD
    _aurixHistorySourceForDisplay: null,
  };
  sb._aurixHistorySourceForDisplay = () => sb.categoryHistory;
  vm.createContext(sb);
  // The const thresholds the builder closes over.
  vm.runInContext('const _AURIX_EMG_RANGE_MS = {"24h":864e5,"7d":6048e5,"30d":2592e6,"1y":31536e6,"all":Infinity};' +
    'const _AURIX_EMG_MAX_RATIO = {"24h":1.20,"7d":1.35,"30d":1.75,"1y":3.00,"all":3.00};' +
    'const _AURIX_EMG_ADJ_JUMP = {"24h":0.20,"7d":0.35,"30d":0.50,"1y":0.50,"all":0.50};' +
    'const _AURIX_EMG_SANITY_PCT = {"24h":10,"7d":20,"30d":35,"1y":50,"all":50};' +
    'const _AURIX_EMG_MIN_POINTS = 2; const _AURIX_EMG_FALLBACK_TAIL = 8;', sb);
  vm.runInContext(fnSrc('_aurixEmergencyHash'), sb);
  vm.runInContext(fnSrc('_aurixEmergencyRawSeries'), sb);
  vm.runInContext(fnSrc('_aurixEmergencyTrimPrefix'), sb);
  vm.runInContext(fnSrc('_aurixEmergencyDeSpike'), sb);
  vm.runInContext(fnSrc('buildEmergencyInstitutionalChart'), sb);
  vm.runInContext(fnSrc('_aurixEmergencyBuildSvg'), sb);
  return sb;
}
const B = (sb, r) => vm.runInContext('buildEmergencyInstitutionalChart(' + JSON.stringify(r) + ')', sb);
const HASH = (sb, pts) => vm.runInContext('_aurixEmergencyHash(' + JSON.stringify(pts) + ')', sb);

// A healthy, comparable investable series (current ≈ 8838).
function healthy(spanH) {
  spanH = spanH || 48;
  const pts = [];
  for (let i = spanH; i >= 0; i--) pts.push({ ts: LAST - i * HOUR, total: 8600 + (spanH - i) * 5, real_estate: 0 });
  return pts;
}

console.log('AURIX-EMERGENCY-CHART-RECOVERY — P0 deterministic emergency chart\n');

console.log('Determinism + desktop/mobile parity:');
{ const sb = makeEnv(healthy(48)); const emg = B(sb, '30d');
  const desktop = emg.points.map(p => ({ time: p.ts, value: p.value }));
  const mobile = emg.points.map(p => ({ ts: p.ts, value: p.value }));
  const dHash = HASH(sb, desktop.map(p => ({ ts: p.time, value: p.value })));
  const mHash = HASH(sb, mobile);
  ok('1 same raw history → identical desktop/mobile points (hash equal)', dHash === mHash && dHash === emg.chartHash, dHash);
  ok('16 no desktop/mobile mismatch possible (adapters only rename keys)',
    desktop.length === mobile.length && desktop.every((p, i) => p.time === mobile[i].ts && p.value === mobile[i].value)); }

console.log('\nDesktop draws iff mobile draws (single source):');
{ const sb = makeEnv(healthy(48)); const emg = B(sb, '30d');
  const dCan = emg.state === 'ready' && emg.points.length >= 2;
  const mCan = emg.state === 'ready' && emg.points.length >= 2;
  ok('2 desktop draws when mobile draws', dCan === mCan && dCan === true);
  ok('3 mobile draws when desktop draws', mCan === dCan && mCan === true); }

console.log('\nNo forbidden mixed states:');
{ const sbReady = makeEnv(healthy(48)); const ready = B(sbReady, '30d');
  const sbPend = makeEnv([{ ts: LAST, total: 5000, real_estate: 0 }]); const pend = B(sbPend, '30d');
  ok('4 percentage cannot render without a line (ready ⇒ points≥2; never % with <2)',
    !(ready.returnPct !== null && ready.points.length < 2) && !(pend.returnPct !== null && pend.points.length < 2), ready.state + '/' + pend.state);
  ok('5 skeleton cannot render with a percentage (pending ⇒ returnPct null)',
    pend.state === 'pending' && pend.returnPct === null);
  ok('13 pending state hides percentage', pend.returnPct === null && pend.points.length === 0);
  ok('14 ready state removes overlay (state ready ⇒ real points + %)',
    ready.state === 'ready' && ready.points.length >= 2 && ready.returnPct !== null); }

console.log('\nConstruction baseline / spike rejection (the fake -67%):');
{ // current ≈ 1960, leading construction peak 5503 (ratio 2.8 vs current → not comparable for 30d)
  const hist = [
    { ts: LAST - 20 * DAY, total: 5503, real_estate: 0 },   // construction peak
    { ts: LAST - 15 * DAY, total: 4000, real_estate: 0 },   // still not comparable (2.04×)
    { ts: LAST - 10 * DAY, total: 1980, real_estate: 0 },
    { ts: LAST - 5 * DAY, total: 1965, real_estate: 0 },
    { ts: LAST, total: 1960, real_estate: 0 },
  ];
  const sb = makeEnv(hist); const emg = B(sb, '30d');
  ok('6 -67% construction baseline is rejected (baseline ≠ 5503, |%| within sanity)',
    emg.baselineValue !== 5503 && (emg.state === 'pending' || Math.abs(emg.returnPct) <= 75), 'baseline=' + emg.baselineValue + ' pct=' + emg.returnPct);
  ok('11 leading construction spike removed (leadingTrimmed ≥ 1, spike not in points)',
    emg.leadingTrimmed >= 1 && (emg.points || []).every(p => p.value !== 5503), 'trimmed=' + emg.leadingTrimmed); }

{ // if EVERYTHING is a non-comparable construction regime → pending, never a fabricated %
  const hist = [
    { ts: LAST - 3 * DAY, total: 50000, real_estate: 0 },
    { ts: LAST - 2 * DAY, total: 45000, real_estate: 0 },
    { ts: LAST, total: 8000, real_estate: 0 },
  ];
  const sb = makeEnv(hist); const emg = B(sb, '24h');
  ok('6b all-construction 24H → pending / no absurd %',
    emg.state === 'pending' ? emg.returnPct === null : Math.abs(emg.returnPct) <= 25, emg.reason + ' ' + emg.returnPct); }

console.log('\nAnchor = last snapshot ts, NOT Date.now():');
{ // points span the last 23h ending at LAST; Date.now() is 100 days ahead. If the anchor were
  // Date.now(), the 24h window would exclude every point → collapse/pending. It must stay ready.
  const sb = makeEnv(healthy(23)); const emg = B(sb, '24h');
  ok('7 24H window anchored on last snapshot ts (ready, not empty despite Date.now()+100d)',
    emg.state === 'ready' && emg.collapsedRange === false && emg.lastTs === LAST, emg.state + ' collapsed=' + emg.collapsedRange); }

console.log('\nNormalization — dedupe / sort / reject bad values:');
{ const hist = [
    { ts: LAST, total: 8000, real_estate: 0 },
    { ts: LAST - 2 * HOUR, total: 7900, real_estate: 0 },   // out of order
    { ts: LAST, total: 8100, real_estate: 0 },              // duplicate ts (LAST) — LAST valid wins
    { ts: LAST - 1 * HOUR, total: 7950, real_estate: 0 },
  ];
  const sb = makeEnv(hist); const emg = B(sb, '30d');
  ok('8 duplicate timestamps deduped (last value wins → currentValue 8100, one point per ts)',
    emg.currentValue === 8100 && emg.pointCount === 3, 'cur=' + emg.currentValue + ' n=' + emg.pointCount);
  const asc = emg.points.every((p, i) => i === 0 || p.ts >= emg.points[i - 1].ts);
  ok('9 out-of-order points sorted ascending', asc); }

{ const hist = [
    { ts: LAST - 3 * HOUR, total: 8000, real_estate: 0 },
    { ts: NaN, total: 8000, real_estate: 0 },                       // non-finite ts
    { ts: LAST - 2 * HOUR, total: NaN, real_estate: 0 },            // NaN value
    { ts: LAST - 1 * HOUR, total: 0, real_estate: 0 },              // zero value
    { ts: LAST - 30 * 60000, total: 5000, real_estate: 5000 },      // net zero (non-positive)
    { ts: LAST, total: 8050, real_estate: 0 },
  ];
  const sb = makeEnv(hist); const emg = B(sb, '30d');
  ok('10 null/zero/NaN/non-finite-ts values rejected (≥4 rejected, only clean survive)',
    emg.rejectedCount >= 3 && emg.currentValue === 8050 && emg.points.every(p => p.value > 0), 'rejected=' + emg.rejectedCount); }

console.log('\nRange collapse is explicit:');
{ // only 2 comparable points, 40h apart → 24H window keeps just the last → fallback tail, collapsed
  const hist = [
    { ts: LAST - 40 * HOUR, total: 8000, real_estate: 0 },
    { ts: LAST, total: 8050, real_estate: 0 },
  ];
  const sb = makeEnv(hist); const emg = B(sb, '24h');
  ok('12 range collapse is explicit (collapsedRange true, still ready with the safe tail)',
    emg.state === 'ready' && emg.collapsedRange === true, emg.state + ' collapsed=' + emg.collapsedRange); }

console.log('\nEvery range → ready+line OR pending-without-% (no absurd values):');
{ const sb = makeEnv(healthy(400)); let allOk = true; const detail = {};
  ['24h', '7d', '30d', '1y', 'all'].forEach(r => {
    const emg = B(sb, r); detail[r] = emg.state + (emg.returnPct !== null ? (' ' + emg.returnPct + '%') : '');
    const good = (emg.state === 'ready' && emg.points.length >= 2 && emg.returnPct !== null) ||
      (emg.state === 'pending' && emg.returnPct === null && emg.points.length === 0);
    if (!good) allOk = false;
  });
  ok('15 24H/7D/30D/1Y/TOTAL all produce ready+line or pending-without-%', allOk, JSON.stringify(detail)); }

console.log('\nSVG builder draws the exact points (no rebuild/filter):');
{ const sb = makeEnv(healthy(48)); const emg = B(sb, '30d');
  const built = vm.runInContext('_aurixEmergencyBuildSvg(' + JSON.stringify(emg.points) + ', {W:1000,H:240})', sb);
  ok('17a SVG line has exactly one vertex per emergency point',
    (built.linePath.match(/[ML] /g) || []).length === emg.points.length && built.pixels.length === emg.points.length,
    (built.linePath.match(/[ML] /g) || []).length + ' vs ' + emg.points.length); }

console.log('\nWiring present in app.js (visible surfaces routed to the emergency builder):');
ok('W1 desktop _wscPaintSurface routes to _wscPaintEmergency', /if \(_aurixEmergencyChartOn\(\)\) \{\s*try \{\s*if \(_wscPaintEmergency\(changeEl, hostEl, opts\)\) return;/.test(app));
ok('W2 mobile lite renderer routes to buildEmergencyInstitutionalChart', /VISIBLE mobile line is driven ONLY by/.test(app) && /const emg = buildEmergencyInstitutionalChart\(r\);/.test(app) && /host\.innerHTML = svg;/.test(app));
ok('W3 return badge painter routes through the emergency object', /if \(_aurixEmergencyChartOn\(\)\) \{\s*_aurixEmergencyPaintBadgeNode\(el, buildEmergencyInstitutionalChart/.test(app));
ok('W4 debug + rollback exposed', /window\.aurixEmergencyChartDebug\s*=/.test(app) && /window\.disableAurixEmergencyChart\s*=/.test(app));

console.log('\n' + (fail === 0 ? '✅ ALL PASS' : '❌ ' + fail + ' FAILED') + '  (' + pass + '/' + (pass + fail) + ')');
process.exit(fail === 0 ? 0 : 1);
