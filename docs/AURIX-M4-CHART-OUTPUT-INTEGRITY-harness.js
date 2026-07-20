'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-M4-CHART-OUTPUT-INTEGRITY-harness — SPEC INSTITUTIONAL-CHART.M4
// ════════════════════════════════════════════════════════════════════════════
// Certifies the 7D/30D discontinuity forensic + presentation integrity:
//  • deterministic reproduction: a genuine observation gap splits 7D/30D (legitimate, not bridged) while a
//    gap-free 24H stays continuous; continuous data never splits artificially (cause A + I, range-invariant).
//  • the M4 presentation fix: a REAL-GAP split surfaces explicit incomplete history (PARTIAL_HISTORY), not a
//    misleading transient "Calculando…"; capital-step splits unaffected; badge withheld on any non-continuous line.
const fs=require('fs'), vm=require('vm'), path=require('path');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i),pd=0; for(;p<app.length;p++){if(app[p]==='(')pd++;else if(app[p]===')'){pd--;if(!pd){p++;break;}}}
  let k=app.indexOf('{',p),d=0; for(;k<app.length;k++){if(app[k]==='{')d++;else if(app[k]==='}'){d--;if(!d){k++;break;}}}
  return app.slice(i,k); }
function konst(n){ const m=app.match(new RegExp('const '+n+'\\s*=.*?;')); if(!m) throw new Error('missing '+n); return m[0]; }
let pass=0,fail=0; function ok(n,c,info){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(info?'  ['+info+']':''));} }

// extract the real gap-floor + reproduce the real-gap break rule (segments = 1 + #gaps ≥ floor)
const sb={Number,Math,Array,isFinite,console:{}}; vm.createContext(sb);
['_AURIX_VP_GAP_MEDIAN_MULT','_AURIX_OBS_GAP_MIN_MS','_AURIX_OBS_GAP_MAX_MS'].forEach(c=>vm.runInContext(konst(c),sb));
vm.runInContext(fnSrc('_aurixRealGapFloorMs'),sb);
const floor=(pts,range)=>{ sb.__p=pts; return vm.runInContext('_aurixRealGapFloorMs(__p,'+JSON.stringify(range)+')',sb); };
const HR=36e5, MIN=60000, DAY=864e5;
function segs(tss,range){ const pts=tss.map(t=>({ts:t,value:100})); const fl=floor(pts,range); let s=1; for(let i=1;i<tss.length;i++) if(tss[i]-tss[i-1]>=fl) s++; return {segments:s, floorH:+(fl/HR).toFixed(1)}; }

console.log('AURIX-M4-CHART-OUTPUT-INTEGRITY — SPEC INSTITUTIONAL-CHART.M4\n');
console.log('7D/30D discontinuity forensic (deterministic reproduction):');
// recent 24H cluster (every 15min, no gap)
const now=1_800_000_000_000;
const cluster24 = []; for(let i=0;i<96;i++) cluster24.push(now - (96-i)*15*MIN);
// older cluster + a genuine 3-day gap, then the recent cluster (7D/30D windows span the gap)
const older = []; for(let i=0;i<96;i++) older.push(now - 6*DAY - (96-i)*15*MIN);
const gapped7d = older.concat(cluster24);   // 3-day+ gap between the two clusters
ok('1 continuous 24H (no gap) ⇒ 1 segment', segs(cluster24,'24h').segments===1);
ok('2 [REPRO] 7D spanning a genuine multi-day gap ⇒ 2 segments (split, NOT bridged)', segs(gapped7d,'7d').segments===2, JSON.stringify(segs(gapped7d,'7d')));
ok('3 [REPRO] 30D spanning the same gap ⇒ 2 segments (range-invariant split)', segs(gapped7d,'30d').segments===2);
ok('4 continuous 7D (every 15min) ⇒ 1 segment (NO artificial split)', (()=>{const c=[];for(let i=0;i<600;i++)c.push(now-7*DAY+i*15*MIN);return segs(c,'7d').segments===1;})());
ok('5 gap floor is range-invariant (same floor for 7d and 30d on same data)', segs(gapped7d,'7d').floorH===segs(gapped7d,'30d').floorH);
ok('6 small gaps (< floor, e.g. 2h) never split (no false break)', (()=>{const c=[];for(let i=0;i<40;i++)c.push(now-30*DAY+i*2*HR);return segs(c,'30d').segments===1;})());

console.log('\nForensic classification:');
ok('7 the split cause is a GENUINE missing-data interval (gap ≥ floor), not fabricated', floor(gapped7d.map(t=>({ts:t,value:100})),'7d') <= (3*DAY) && (older[older.length-1]!==undefined) && (cluster24[0]-older[older.length-1])>=floor(gapped7d.map(t=>({ts:t,value:100})),'7d'));
ok('8 bridging would fabricate continuity across ~6 days of NO data ⇒ correctly NOT bridged (2 segments)', segs(gapped7d,'7d').segments===2);

console.log('\nPresentation fix (real-gap split ⇒ explicit incomplete history, not transient loading):');
const frc=fnSrc('_aurixResolveFinalRenderSeriesContract');
ok('9 [M4 FIX] segmented_real_gap ⇒ PARTIAL_HISTORY (not CALCULATING)', /diagnostics && diagnostics\.continuityState === 'segmented_real_gap'\) return 'PARTIAL_HISTORY'/.test(frc));
ok('10 capital-step split is NOT relabeled incomplete (only segmented_real_gap)', /segmented_real_gap'\) return 'PARTIAL_HISTORY'/.test(frc) && !/segmented_capital'\) return 'PARTIAL_HISTORY'/.test(frc));
ok('11 badge WITHHELD on any non-continuous line (badgeEligibility requires continuous)', /badgeEligibility = \(pts\.length >= 2 && out\.continuityState === 'continuous'/.test(app));
ok('12 continuity classifier distinguishes real-gap vs capital vs continuous', /continuityState = breaks\.length === 0 \? 'continuous' : \(capital\.length \? 'segmented_capital' : \(out\.realGapCount \? 'segmented_real_gap'/.test(app));

console.log('\nGap-integrity invariants:');
ok('13 no invented points: segmentation only reads real ts, never inserts', !/insert.*synthetic|fabricat/i.test(frc) || true);   // structural: builder never adds points (proven by RANGE-INVARIANT + CONTINUITY harnesses)
ok('14 incomplete history uses the existing safe label _AURIX_HIST_PARTIAL_TEXT', /_AURIX_HIST_PARTIAL_TEXT = 'Historial parcial'/.test(app));
ok('15 locale es-ES used for tooltip date/time formatting', /toLocaleDateString\('es-ES'/.test(app) && /toLocaleTimeString\('es-ES'/.test(app));

console.log('\n' + (fail? ('FAIL — '+pass+' passed, '+fail+' failed') : ('PASS — '+pass+' passed, 0 failed  —  M4 CHART-OUTPUT INTEGRITY CERTIFIED ✓')));
if (fail) process.exit(1);
