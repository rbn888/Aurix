'use strict';
/* AURIX-CHART-INSTITUTIONAL-PHASE2 proof — replicates _aurixChartDataQuality.
   Proves baseline-mode vs building decisions and structural-jump detection.
   Run: node docs/AURIX-CHART-PHASE2-proof.cjs */
let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`${c ? '  PASS' : '  FAIL'}  ${n}`); c ? pass++ : fail++; };

const EXPECT = { '30d': 30, '1y': 365, 'all': 90 };
function dataQuality(series, range) {
  const r = String(range || '').toLowerCase();
  const valid = (series || []).filter(p => p && Number.isFinite(p.time) && p.time > 0 && Number.isFinite(p.value) && p.value > 0);
  const n = valid.length;
  const firstCleanTs = n ? valid[0].time : null, lastCleanTs = n ? valid[n - 1].time : null;
  const spanDays = n >= 2 ? (lastCleanTs - firstCleanTs) / 86400000 : 0;
  const expectDays = EXPECT[r] || 0;
  const coverageRatio = expectDays > 0 ? Math.min(1, spanDays / expectDays) : 1;
  let hasStructuralJump = false;
  for (let i = 1; i < valid.length; i++) { const a = valid[i-1].value, b = valid[i].value; if (a > 0 && Math.abs(b/a-1) >= 0.12) { hasStructuralJump = true; break; } }
  return { validPointCount:n, firstCleanTs, lastCleanTs, coverageRatio, hasStructuralJump,
    shouldShowBuildingState: n < 2, shouldShowBaselineMode: n >= 2 && expectDays > 0 && coverageRatio < 0.25 };
}
const DAY = 86400000, T = 1_780_800_000_000;
const S = (vals, stepDays=1) => vals.map((v,i)=>({ time:T+i*stepDays*DAY, value:v }));

console.log('\n=== Baseline mode (recent history, low coverage) ===');
ok('1A with 5 recent days → baseline mode (not building)',
   (()=>{const q=dataQuality(S([6200,6300,6500,6800,6952]),'1y'); return q.shouldShowBaselineMode && !q.shouldShowBuildingState;})());
ok('30D with 4 recent days (cov<25%) → baseline mode',
   (()=>{const q=dataQuality(S([6800,6900,6950,7000]),'30d'); return q.shouldShowBaselineMode;})());
ok('TOTAL with ~10 recent days (<90 expect) → baseline mode',
   (()=>{const q=dataQuality(S([6000,6200,6400,6600,6800,6900,6950,7000,7010,7020]),'all'); return q.shouldShowBaselineMode;})());
ok('30D with full month of data → NOT baseline (normal render)',
   (()=>{const q=dataQuality(S(Array.from({length:30},(_,i)=>6000+i*30)),'30d'); return !q.shouldShowBaselineMode && !q.shouldShowBuildingState;})());

console.log('\n=== Building only when truly insufficient ===');
ok('1 point → building',  (()=>dataQuality(S([7000]),'30d').shouldShowBuildingState)());
ok('0 points → building', (()=>dataQuality([],'1y').shouldShowBuildingState)());
ok('2 points → render (baseline), not building', (()=>{const q=dataQuality(S([6900,7000]),'30d'); return !q.shouldShowBuildingState;})());

console.log('\n=== Structural jump detection (deposit/buy) ===');
ok('flat then +15% jump → hasStructuralJump',
   (()=>dataQuality(S([6000,6000,6900,6900]),'7d').hasStructuralJump)());
ok('ordinary <12% volatility → no structural jump',
   (()=>!dataQuality(S([6000,6300,6100,6250,6200]),'7d').hasStructuralJump)());
ok('real -40% crash IS flagged as a jump (≥12% step) → step render, honest',
   (()=>dataQuality(S([10000,10000,6000,6000]),'30d').hasStructuralJump)());

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
