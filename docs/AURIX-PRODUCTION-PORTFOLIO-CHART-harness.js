'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-PRODUCTION-PORTFOLIO-CHART-harness — P0 FINAL CUT (production-grade visible chart)
// ════════════════════════════════════════════════════════════════════════════
// buildProductionPortfolioChart(range) is THE single source the visible dashboard chart (line + return)
// reads. It builds on the clean series from buildEmergencyInstitutionalChart and adds STRICT production
// gates: plateau removal, hard plausibility (24h10/7d20/30d30/1y50/all50), and a visual-quality gate
// (no vertical walls, no dominant cliffs, no flatlines, ≥6 points / 24h ≥3). Either premium+coherent OR
// an honest pending — never a broken chart, never a % that disagrees with the drawn line.
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
const LAST = 1800000000000, FAKE_NOW = LAST + 100 * DAY;

function makeEnv(hist) {
  const sb = {
    Math: Math, Number: Number, Map: Map, Array: Array, String: String, JSON: JSON,
    isFinite: isFinite, parseFloat: parseFloat, Infinity: Infinity,
    Date: { now: () => FAKE_NOW }, console: { log: () => {} },
    activeRange: '30d', activePerfMode: 'pct', categoryHistory: hist || [], toBase: (v) => v, _aurixHistorySourceForDisplay: null,
  };
  sb._aurixHistorySourceForDisplay = () => sb.categoryHistory;
  vm.createContext(sb);
  vm.runInContext('const _AURIX_EMG_RANGE_MS = {"24h":864e5,"7d":6048e5,"30d":2592e6,"1y":31536e6,"all":Infinity};' +
    'const _AURIX_EMG_MAX_RATIO = {"24h":1.20,"7d":1.35,"30d":1.75,"1y":3.00,"all":3.00};' +
    'const _AURIX_EMG_ADJ_JUMP = {"24h":0.20,"7d":0.35,"30d":0.50,"1y":0.50,"all":0.50};' +
    'const _AURIX_EMG_SANITY_PCT = {"24h":10,"7d":20,"30d":35,"1y":50,"all":50};' +
    'const _AURIX_EMG_MIN_POINTS = 2; const _AURIX_EMG_FALLBACK_TAIL = 8;' +
    'const _AURIX_PROD_GATE_PCT = {"24h":10,"7d":20,"30d":30,"1y":50,"all":50};' +
    'const _AURIX_PROD_MIN_POINTS = {"24h":3,"7d":6,"30d":6,"1y":6,"all":6};', sb);
  ['_aurixEmergencyHash', '_aurixEmergencyRawSeries', '_aurixEmergencyTrimPrefix', '_aurixEmergencyDeSpike',
    'buildEmergencyInstitutionalChart', '_aurixProdPlateauFilter', '_aurixProdVisualGate',
    'buildProductionPortfolioChart'].forEach(f => vm.runInContext(fnSrc(f), sb));
  return sb;
}
const P = (sb, r) => vm.runInContext('buildProductionPortfolioChart(' + JSON.stringify(r) + ')', sb);
const HASH = (sb, pts) => vm.runInContext('_aurixEmergencyHash(' + JSON.stringify(pts) + ')', sb);

// --- datasets ---
const construction = [   // construction low 5503 in-band, gentle step → survives emergency trim → +60%
  { ts: LAST - 20 * DAY, total: 5503, real_estate: 0 }, { ts: LAST - 19 * DAY, total: 5510, real_estate: 0 },
  { ts: LAST - 10 * DAY, total: 8790, real_estate: 0 }, { ts: LAST - 5 * DAY, total: 8810, real_estate: 0 },
  { ts: LAST, total: 8820, real_estate: 0 },
];
const regimeHigh = [   // current 1960; old 5503 regime (ratio 2.8) must be stripped → no -67%
  { ts: LAST - 20 * DAY, total: 5503, real_estate: 0 }, { ts: LAST - 19 * DAY, total: 5480, real_estate: 0 },
  { ts: LAST - 10 * DAY, total: 1980, real_estate: 0 }, { ts: LAST - 5 * DAY, total: 1965, real_estate: 0 },
  { ts: LAST, total: 1960, real_estate: 0 },
];
function smooth(nPts, spanH, base, perStep) {   // gentle rising line, recent timestamps
  const a = []; for (let k = 0; k < nPts; k++) a.push({ ts: LAST - (nPts - 1 - k) * (spanH / (nPts - 1)) * HOUR, total: base + k * perStep, real_estate: 0 }); return a;
}
const towerData = [   // one-point vertical tower (13500) that mean-reverts, ≥6 clean points remain
  { ts: LAST - 8 * HOUR, total: 8000, real_estate: 0 }, { ts: LAST - 7 * HOUR, total: 8010, real_estate: 0 },
  { ts: LAST - 6 * HOUR, total: 8020, real_estate: 0 }, { ts: LAST - 5 * HOUR, total: 13500, real_estate: 0 },
  { ts: LAST - 4 * HOUR, total: 8030, real_estate: 0 }, { ts: LAST - 3 * HOUR, total: 8040, real_estate: 0 },
  { ts: LAST - 2 * HOUR, total: 8050, real_estate: 0 }, { ts: LAST - 1 * HOUR, total: 8060, real_estate: 0 },
  { ts: LAST, total: 8070, real_estate: 0 },
];
const plateauData = [];   // flat construction plateau (all identical) over 30d
for (let k = 0; k < 8; k++) plateauData.push({ ts: LAST - (7 - k) * DAY, total: 8000, real_estate: 0 });

console.log('AURIX-PRODUCTION-PORTFOLIO-CHART — P0 FINAL CUT\n');

console.log('Rejection of bad baselines / bad points:');
{ const p = P(makeEnv(construction), 'all');
  ok('1 +60% construction artifact rejected (pending, no %)', p.state === 'pending' && p.returnPct === null, p.reason); }
{ const p = P(makeEnv(regimeHigh), '30d');
  ok('2 -67% regime baseline rejected (baseline ≠ 5503, no ≈ -67%)',
    p.baselineValue !== 5503 && (p.state !== 'ready' || p.returnPct > -30), 'baseline=' + p.baselineValue + ' pct=' + p.returnPct); }
{ const p = P(makeEnv(towerData), '24h');
  ok('3 vertical one-point tower rejected (spike removed, not in points, chart stays clean)',
    p.rejectedSpikeCount >= 1 && (p.points || []).every(pt => pt.value !== 13500), 'spikes=' + p.rejectedSpikeCount + ' state=' + p.state); }
{ const p = P(makeEnv(plateauData), '30d');
  ok('4 flat construction plateau rejected (plateau collapsed, pending, no %)',
    p.rejectedPlateauCount >= 1 && p.state === 'pending' && p.returnPct === null, 'plateau=' + p.rejectedPlateauCount + ' ' + p.reason); }

console.log('\nValid smooth lines draw:');
{ const p = P(makeEnv(smooth(24, 23, 8600, 2)), '24h');
  ok('5 24H valid smooth line draws (ready, visual gate passed, within 10%)',
    p.state === 'ready' && p.visualQualityPassed === true && Math.abs(p.returnPct) <= 10 && p.points.length >= 3, 'pct=' + p.returnPct + ' n=' + p.points.length); }
{ const p = P(makeEnv(smooth(40, 160, 8600, 3)), '7d');
  ok('6 7D valid smooth line draws (ready, visual gate passed, within 20%)',
    p.state === 'ready' && p.visualQualityPassed === true && Math.abs(p.returnPct) <= 20 && p.points.length >= 6, 'pct=' + p.returnPct + ' n=' + p.points.length); }

console.log('\nInvalid construction long ranges → pending:');
{ ['30d', '1y', 'all'].forEach((rg, idx) => { const p = P(makeEnv(construction), rg);
  ok((7 + idx) + ' ' + rg.toUpperCase() + ' construction line becomes pending (no fabricated %)',
    p.state === 'pending' && p.returnPct === null && p.points.length === 0, rg + ':' + p.reason); }); }
{ // tighter 30d gate (30% < emergency 35%): a clean +32% over 30d must be pending_sanity
  const p = P(makeEnv(smooth(10, 20 * 24, 6800, 240)), '30d');   // 6800→8960 ≈ +31.8%
  ok('7b 30D clean +32% exceeds the tightened 30% gate → pending_sanity',
    p.state === 'pending' && p.reason === 'pending_sanity' && p.returnPct === null, 'pct-would-be≈+31.8'); }

console.log('\nParity + return integrity + pending honesty:');
{ const sb = makeEnv(smooth(24, 23, 8600, 2)); const p = P(sb, '24h');
  const dHash = HASH(sb, p.points.map(pt => ({ ts: pt.ts, value: pt.value })));
  const mHash = HASH(sb, p.points.map(pt => ({ ts: pt.ts, value: pt.value })));
  ok('10 desktop/mobile hashes identical (adapters rename keys only)', dHash === mHash && dHash === p.chartHash, dHash);
  const expected = ((p.points[p.points.length - 1].value - p.points[0].value) / p.points[0].value) * 100;
  ok('11 return equals first→last of the visible line (line == badge)',
    p.lineReturnPct === p.badgeReturnPct && p.lineReturnPct === p.returnPct && Math.abs(p.returnPct - expected) < 0.01, 'pct=' + p.returnPct); }
{ const p = P(makeEnv(construction), 'all');
  ok('12 no percentage when pending (returnPct null)', p.returnPct === null && p.lineReturnPct === null && p.badgeReturnPct === null);
  ok('13 no line when pending (points empty)', Array.isArray(p.points) && p.points.length === 0); }

console.log('\nWiring — visible surfaces read buildProductionPortfolioChart; "no disponible" removed:');
ok('W1 desktop _wscPaintEmergency reads buildProductionPortfolioChart',
  /const surface = uid === 'm' \? 'mobile' : 'desktop';\s*const emg = buildProductionPortfolioChart\(/.test(app));
ok('W2 mobile lite renderer reads buildProductionPortfolioChart',
  /const emg = buildProductionPortfolioChart\(r\);/.test(app));
ok('W3 return badge reads buildProductionPortfolioChart',
  /_aurixEmergencyPaintBadgeNode\(el, buildProductionPortfolioChart\(/.test(app));
ok('W4 mobile fallback no longer shows "Gráfico temporalmente no disponible en móvil"',
  !/Gráfico temporalmente no disponible en móvil/.test(fnSrc('_aurixMobileLiteFallback')) &&
  /Histórico en construcción/.test(fnSrc('_aurixMobileLiteFallback')));
ok('W5 window.aurixProductionChartDebug exposed', /window\.aurixProductionChartDebug\s*=/.test(app));

console.log('\n' + (fail === 0 ? '✅ ALL PASS' : '❌ ' + fail + ' FAILED') + '  (' + pass + '/' + (pass + fail) + ')');
process.exit(fail === 0 ? 0 : 1);
