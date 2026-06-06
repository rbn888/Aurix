'use strict';
/* AURIX-CHART-INSTITUTIONAL-PHASE2 proof — structural-jump detection only.
   NOTE (AURIX-CHART-RANGE-AVAILABILITY-1): the building-vs-baseline decision that
   PHASE2 used to own (the naive n<2 / coverageRatio<0.25 heuristic) is SUPERSEDED
   by the per-range availability policy. See docs/AURIX-CHART-RANGE-AVAILABILITY-proof.cjs.
   What remains valid here is the structural-jump flag (a >=12% adjacent step is a
   portfolio move, rendered as a clean step + "Incluye movimientos de cartera").
   Run: node docs/AURIX-CHART-PHASE2-proof.cjs */
let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`${c ? '  PASS' : '  FAIL'}  ${n}`); c ? pass++ : fail++; };

function hasStructuralJump(series) {
  const valid = (series || []).filter(p => p && Number.isFinite(p.time) && p.time > 0 && Number.isFinite(p.value) && p.value > 0);
  for (let i = 1; i < valid.length; i++) { const a = valid[i-1].value, b = valid[i].value; if (a > 0 && Math.abs(b/a-1) >= 0.12) return true; }
  return false;
}
const DAY = 86400000, T = 1_780_800_000_000;
const S = (vals, stepDays=1) => vals.map((v,i)=>({ time:T+i*stepDays*DAY, value:v }));

console.log('\n=== Structural jump detection (deposit/buy/sell) ===');
ok('flat then +15% jump → hasStructuralJump',
   hasStructuralJump(S([6000,6000,6900,6900])));
ok('ordinary <12% volatility → no structural jump',
   !hasStructuralJump(S([6000,6300,6100,6250,6200])));
ok('real -40% crash IS flagged as a jump (≥12% step) → step render, honest',
   hasStructuralJump(S([10000,10000,6000,6000])));
ok('empty / single point → no jump',
   !hasStructuralJump([]) && !hasStructuralJump(S([7000])));

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
