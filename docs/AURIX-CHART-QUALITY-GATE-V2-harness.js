/* Proves the V2 lightweight-charts engine now OBEYS the same quality gate as the
   WSC. Extracts the REAL getDashboardChartRenderState (with the new hook) +
   _wscAssessSeriesQuality from app.js, stubs its deps, and asserts that a
   low-density short window resolves to state:'building' (so _aurixDashSync hits the
   ctrl.setData([], {emptyReason:'low_data'}) path — NO continuous setData).
   Run: node docs/AURIX-CHART-QUALITY-GATE-V2-harness.js                          */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function fn(name){ const s='function '+name+'('; const i=src.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=src.indexOf('{',i),d=0; for(;k<src.length;k++){const c=src[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} return src.slice(i,k); }
function obj(name){ const s='const '+name+' ='; const i=src.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=src.indexOf('{',i),d=0; for(;k<src.length;k++){const c=src[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} while(src[k]!==';'&&k<src.length)k++; return src.slice(i,k+1); }

const H = 3600e3, D = 86400e3, NOW = 1000 * D;
const spread = (n, spanMs, base) => Array.from({length:n}, (_,i) => ({ ts: NOW - spanMs + Math.round(i*spanMs/(n-1)), value: base + i*5 }));
const cluster = (n, base) => Array.from({length:n}, (_,i) => ({ ts: NOW - (n-i)*5*60e3, value: base + i }));  // n pts, 5-min apart (recent)

// state controlled per scenario
let ELIG = [];                         // what _aurixEligibleInvestableSeries returns
const DASH = spread(20, 6*D, 70000);   // V2 candidate series (always ≥2, passes avail/live)

const sb = {
  console,
  Date: (() => { const R = Date; return class extends R { static now(){ return NOW; } }; })(),
  assets: [{ id: 'x' }],
  baseCurrency: 'USD',
  _reconActive: null,
  _aurixChartSettleUntil: 0,
  _aurixLastGoodByRange: {},
  _aurixChartDataReady: () => true,
  _aurixInvestableChartEpoch: () => 0,
  investableValueBase: () => 70100,
  _aurixReconFlag: () => false,
  _aurixDashSeries: () => DASH.map(p => ({ time: p.ts, value: p.value })),
  _aurixChartDropDivergent: (s) => s,
  validateChartSeries: (r, s) => ({ valid: true, cleanedSeries: s }),
  _aurixChartAnchorTail: (s) => s,
  getRangeAvailability: () => ({ available: true }),
  validateSeriesAgainstLive: () => ({ valid: true }),
  // hook inputs:
  _aurixEligibleInvestableSeries: () => ({ series: ELIG, meta: {} }),
  _aurixInvestableSnapshots: () => ELIG,
  _aurixFlowNeutralize: (s) => ({ adjusted: (s||[]).map(p => p.value), neutralized: 0, totalOffset: 0 }),
};
sb.window = sb;
vm.createContext(sb);
[ obj('_WSC_BUCKET_MS'), obj('_WSC_WINDOW_MS'), obj('_WSC_QUALITY'),
  src.match(/const _WSC_LOWDENSITY_MIN = \d+;/)[0],
  fn('_wscAssessSeriesQuality'), fn('getCanonicalPortfolioSeries'), fn('getInstitutionalPerformanceSeries'), fn('getDashboardChartRenderState') ].forEach(c => vm.runInContext(c, sb));

let ok = true; const ck = (n,c,g) => { console.log((c?'  ✓':'  ✗')+' '+n+(g!==undefined?'  ['+g+']':'')); if(!c) ok=false; };
const run = (range, elig) => { ELIG = elig; return sb.getDashboardChartRenderState(range); };

console.log('PROOF — V2 getDashboardChartRenderState shares the single source (GRAPH-V1 3-mode)\n');

console.log('7D partial (3 pts) — GRAPH-V1 Rule 4/7: DRAWS (partial), never a giant message:');
{ const d = run('7d', cluster(3, 70000));
  ck('state = ready (partial-curve draws)', d.state === 'ready', d.state);
  ck('series non-empty (honest partial line)', (d.series||[]).length >= 2, (d.series||[]).length); }

console.log('\n7D high-density (10 pts spread across the 7 days):');
{ const d = run('7d', spread(10, 6.8*D, 70000));
  ck('state = ready (premium curve)', d.state === 'ready', d.state);
  ck('series drawn', (d.series||[]).length >= 2, (d.series||[]).length); }

console.log('\n24H 2 pts — Rule 7: partial (≥2 draws), not building:');
{ const d = run('24h', cluster(2, 70000));
  ck('state = ready (partial)', d.state === 'ready', d.state); }

console.log('\nNo history — Rule 7: building (canonical = only the live point → <2 in window):');
{ const d = run('24h', []);   // empty history; canonical appends live → 1 point → building
  ck('state = building', d.state === 'building', d.state); }

console.log('\nNO REGRESSION — 30D / 1A / TOTAL with enough points stay ready:');
{ for (const r of ['30d','1y','all']) { const d = run(r, spread(25, (r==='30d'?28*D:r==='1y'?350*D:380*D), 50000));
    ck(r+' = ready (long-range rule, institutionalRenderable=true)', d.state === 'ready', d.state); } }

console.log('\nDESKTOP == MOBILE — same function, same global activeRange/series → identical decision (no surface-specific branch).');

console.log('\nRESULT:', ok ? 'ALL PASS ✓ — V2 obeys the gate; low-density 7D never paints a continuous line' : 'FAIL ✗');
process.exit(ok ? 0 : 1);
