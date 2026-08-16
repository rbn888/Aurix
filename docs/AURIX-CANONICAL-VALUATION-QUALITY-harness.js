'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CANONICAL-VALUATION-QUALITY-harness — SPEC CHART-INTEGRITY.BLOCK-A
// ════════════════════════════════════════════════════════════════════════════
// Forensic P0: a snapshot taken while one holding had no price is UNDERCOUNTED yet keeps
// `total === Σbuckets`, so it passed every structural gate and was drawn as a real market
// crash (the repeated downward teeth in 24H/7D). Two structural holes made it possible:
//   1. the guard's quality verdict was written onto a THROWAWAY literal, never onto the
//      persisted point ⇒ nothing downstream could tell partial from complete;
//   2. _mergeCategoryByTs validated STRUCTURE only ⇒ an incomplete remote point took
//      authority over an instant just by arriving later.
// This certifies the BLOCK-A contract: ABSENCE OF INFORMATION ⇒ NO NEW CANONICAL POINT,
// never a FALSE MARKET MOVE — and that the criterion is PROVENANCE, never MAGNITUDE.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
function konstSrc(name){ const s='const '+name+' ='; const i=app.indexOf(s); if(i<0) throw new Error('missing const '+name);
  let k=i, depth=0, started=false; for(;k<app.length;k++){ const c=app[k]; if(c==='('||c==='{'||c==='[') {depth++;started=true;} else if(c===')'||c==='}'||c===']') depth--; else if(c===';'&&(!started||depth===0)) { k++; break; } }
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c,info){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(info?'  ['+info+']':''));} }

const HOUR = 36e5, T0 = 1800000000000;
const sb = { Math, Number, JSON, Array, Object, Map, isFinite, Infinity, Date,
             console:{warn:()=>{},log:()=>{},debug:()=>{}}, window:{}, IS_DEV:false };
vm.createContext(sb);

// ── real code under test ────────────────────────────────────────────────────
vm.runInContext(konstSrc('_AURIX_CAT_BUCKETS'), sb);
vm.runInContext(fnSrc('_aurixCategoryPointValid'), sb);
vm.runInContext(fnSrc('_aurixPointValuationIncomplete'), sb);
vm.runInContext(fnSrc('_aurixPointValuationApprox'), sb);
vm.runInContext(fnSrc('_aurixStampPointQuality'), sb);
vm.runInContext(fnSrc('_mergeCategoryByTs'), sb);
vm.runInContext(fnSrc('_aurixHpqRawStages'), sb);
// ── stubs for collaborators OUTSIDE this contract (kept behaviour-neutral) ───
vm.runInContext('function _aurixFilterAfterEpoch(a){ return a; }', sb);          // epoch trim: no-op here
vm.runInContext('function toBase(v){ return v; }', sb);                          // USD == base in this fixture
vm.runInContext('const _AURIX_HPQ_FUTURE_MS = 365*24*36e5;', sb);
// capturing diag stub — we assert the STAGE/RULE our gate routes to, not diag's own shape
vm.runInContext('function _aurixHpqDiag(range,snap,index,prev,stage,rule){ return { stage:stage, rule:rule, ts:snap&&snap.ts }; }', sb);
// the REAL downstream magnitude stage — the collateral-damage regression below is only meaningful
// if the interaction with it is exercised, not just _aurixHpqRawStages in isolation.
vm.runInContext(konstSrc('_AURIX_HPQ_SPIKE_JUMP'), sb);
vm.runInContext(konstSrc('_AURIX_HPQ_SPIKE_REVERT_FRAC'), sb);
vm.runInContext(fnSrc('_aurixHpqQuarantineSpikes'), sb);
function spikeFiltered(points){
  const raw = series(points);
  return vm.runInContext('_aurixHpqQuarantineSpikes', sb)(raw.normalized, sb._AURIX_HPQ_SPIKE_JUMP, '24h').kept;
}
// NOTE: `var`, not `let` — only a var/function declaration becomes a property of the vm
// global, which is what lets the fixture below be swapped in from outside the context.
vm.runInContext('var __SRC = []; function _aurixHistorySourceForDisplay(){ return __SRC; }', sb);
function series(points){ sb.__SRC = points; return vm.runInContext('_aurixHpqRawStages("7d")', sb); }

// point factory: complete unless a quality flag is passed in
function P(tsOffsetH, total, q){
  return Object.assign({ ts: T0 + tsOffsetH*HOUR, total: total, crypto: total, stock: 0, etf: 0,
                         fund: 0, metal: 0, real_estate: 0, liquidity: 0, other: 0 }, q || {});
}

console.log('AURIX-CANONICAL-VALUATION-QUALITY — SPEC CHART-INTEGRITY.BLOCK-A\n');

// ── CASO A — complete valid snapshot enters canonical history ───────────────
console.log('CASO A — complete snapshot ⇒ enters canonical history');
{
  const src = [P(0,100000), P(1,101000), P(2,102000)];
  const r = series(src);
  ok('all 3 complete points reach the canonical series', r.normalized.length === 3, 'got '+r.normalized.length);
  ok('none quarantined for valuation quality', r.counts.incompleteValuation === 0);
  const merged = vm.runInContext('_mergeCategoryByTs', sb)(src, []);
  ok('merge preserves all 3 complete points', merged.length === 3, 'got '+merged.length);
}

// ── CASO B — partial valuation creates NO canonical market point ────────────
console.log('\nCASO B — partial/incomplete valuation ⇒ NO canonical market point');
{
  // the real incident shape: an 18 % "crash" that is really one unpriced holding, then recovery
  const src = [P(0,100000), P(1,82000,{fxPartial:true}), P(2,100500)];
  const r = series(src);
  const tss = r.normalized.map(p => p.ts);
  ok('the undercounted point never becomes canonical', tss.indexOf(T0+1*HOUR) === -1);
  ok('the two complete points survive', r.normalized.length === 2, 'got '+r.normalized.length);
  ok('counted as incompleteValuation', r.counts.incompleteValuation === 1, 'got '+r.counts.incompleteValuation);
  const q = r.quarantined.filter(d => d && d.rule === 'valuation_incomplete');
  ok('quarantined with an auditable reason (valuation_incomplete)', q.length === 1);
  ok('no false vertical move remains in the series',
     r.normalized.every(p => p.value >= 100000));
  // valuationComplete:false is the second HARD marker (backend/other-device writers)
  const r2 = series([P(0,100000), P(1,82000,{valuationComplete:false}), P(2,100500)]);
  ok('valuationComplete:false is excluded too', r2.normalized.length === 2 && r2.counts.incompleteValuation === 1);
}

// ── CASO B2 — the quality verdict actually TRAVELS with the persisted point ─
console.log('\nCASO B2 — quality metadata travels on the PERSISTED point (hole #1)');
{
  const stamp = vm.runInContext('_aurixStampPointQuality', sb);
  const persisted = stamp({ ts: T0, value: 82000 }, { fxPartial:true, suspect:true });
  ok('fxPartial reaches the persisted point', persisted.fxPartial === true);
  ok('suspect reaches the persisted point (audit trail)', persisted.suspect === true);
  const clean = stamp({ ts: T0, value: 100000 }, { fxPartial:false, fxApprox:false, valuationComplete:true });
  ok('a CLEAN point keeps a byte-identical shape (no key added)',
     JSON.stringify(Object.keys(clean)) === JSON.stringify(['ts','value']), Object.keys(clean).join(','));
  // regression on the exact defect: the writers must stamp newPoint, not only the guard literal
  ok('recordSnapshot stamps its persisted newPoint',
     /const newPoint = _aurixStampPointQuality\(\{ ts: now, value:/.test(app));
  ok('recordCategorySnapshot stamps its persisted newPoint',
     /_aurixStampPointQuality\(newPoint, _catQuality\);/.test(app));
}

// ── CASO C — remote partial point does not win authority by valid SHAPE ─────
console.log('\nCASO C — remote partial point ⇒ merge grants it no authority (hole #2)');
{
  const merge = vm.runInContext('_mergeCategoryByTs', sb);
  const complete = P(0,100000), partial = Object.assign(P(0,82000),{fxPartial:true});
  ok('structurally the partial point IS valid (so shape alone cannot save us)',
     vm.runInContext('_aurixCategoryPointValid', sb)(partial) === true);
  const a = merge([complete],[partial]);   // partial arrives LAST (previously won by last-wins)
  ok('complete point owns the instant regardless of arrival order (remote last)',
     a.length === 1 && a[0].total === 100000, a.length ? 'total '+a[0].total : 'empty');
  const b = merge([partial],[complete]);   // and the reverse order
  ok('same winner with the arrival order reversed', b.length === 1 && b[0].total === 100000);
  // NO DATA LOSS: distinct timestamps are all still kept (union-by-ts contract intact)
  const c = merge([P(0,100000), P(1,101000)], [Object.assign(P(2,82000),{fxPartial:true})]);
  ok('merge NEVER deletes history — the partial point is kept, just not trusted', c.length === 3, 'got '+c.length);
  ok('and it is still excluded from the canonical SERIES', series(c).normalized.length === 2);
}

// ── CASO D — a real, complete, large drop is NEVER removed ──────────────────
console.log('\nCASO D — real complete crash ⇒ survives (no magnitude filter)');
{
  const r = series([P(0,100000), P(1,65000), P(2,60000)]);   // −35 %, fully valued, unflagged
  ok('a complete −35 % move keeps all its points', r.normalized.length === 3, 'got '+r.normalized.length);
  ok('nothing was dropped for valuation quality', r.counts.incompleteValuation === 0);
  ok('the low point is still present', r.normalized.some(p => p.value === 65000));
  // the magnitude back door: `suspect` is a device-relative MAGNITUDE verdict and must never
  // gate the series, or every legitimate large move would silently vanish.
  const s = series([P(0,100000), P(1,65000,{suspect:true}), P(2,60000)]);
  ok('a suspect-marked but COMPLETE crash is NOT excluded', s.normalized.length === 3, 'got '+s.normalized.length);
  ok('suspect alone is not a valuation-quality verdict',
     vm.runInContext('_aurixPointValuationIncomplete', sb)({suspect:true}) === false);
}

// ── CASO E — legacy points without the new metadata stay compatible ─────────
console.log('\nCASO E — legacy points (no metadata) ⇒ unchanged, unknown is never assumed bad');
{
  const legacy = [{ts:T0,total:100000},{ts:T0+HOUR,total:101000},{ts:T0+2*HOUR,total:99000}];
  const r = series(legacy);
  ok('legacy sparse-schema points all survive', r.normalized.length === 3, 'got '+r.normalized.length);
  ok('none reclassified as incomplete', r.counts.incompleteValuation === 0);
  ok('unknown quality ⇒ trusted', vm.runInContext('_aurixPointValuationIncomplete', sb)({ts:T0,total:1}) === false);
  const merged = vm.runInContext('_mergeCategoryByTs', sb)(legacy.slice(0,2), legacy.slice(1));
  ok('legacy merge keeps last-wins behaviour unchanged', merged.length === 3, 'got '+merged.length);
}

// ── NO COLLATERAL DAMAGE — adversarial review finding #1 (was a real defect) ─
console.log('\nCOLATERAL — excluding a point must not make a downstream stage delete a COMPLETE one');
{
  // The refuted first attempt also excluded fxApprox. Because an approx point IS valued (only its
  // FX rate is a fallback), removing it widened the delta between its two complete neighbours,
  // tripped the magnitude stages, and deleted the legitimate opening point: a real +28 % day was
  // published as +1,6 %. fxApprox must therefore pass this gate untouched.
  const FIX = [P(0,100000), P(1,115000,{fxApprox:true}), P(2,126000), P(3,127000), P(4,128000)];
  const r = series(FIX);
  ok('all 5 points survive _aurixHpqRawStages', r.normalized.length === 5, 'got '+r.normalized.length);
  // and — the part that actually regresses the defect — they survive the MAGNITUDE stage too
  const kept = spikeFiltered(FIX);
  ok('all 5 survive the downstream spike stage (no collateral removal)', kept.length === 5, 'got '+kept.length);
  ok('the real opening point is still present', kept.some(p => p.value === 100000));
  ok('the real +28 % day is preserved end-to-end',
     Math.abs((kept[kept.length-1].value - kept[0].value) / kept[0].value - 0.28) < 0.001);
  // The demonstrated reason the soft tier was removed is NOT collateral spike damage (that
  // scenario did not reproduce at the real 24H threshold: 5→5 and 4→4 through both stages) but a
  // DIVERGENT RELEASE RULE. The first attempt released approx points when fewer than 2 complete
  // points existed across ALL history, while the return path releases them when fewer than 2 exist
  // inside the RANGE WINDOW. A user with long complete history plus a fully-approx recent week hits
  // both at once: chart quarantines (history ≥ 2) while the badge releases (window = 0) ⇒ a
  // published 7D % for a line the chart refuses to draw. One rule, in one place, is the fix.
  ok('this SPEC adds no second release/starvation rule to the chart path',
     !/approxHeld|approxValuation/.test(app));
  ok('approx release stays solely in the pre-existing return path',
     (app.match(/excludeApprox && p\.fxApprox === true/g) || []).length === 1);
  ok('fxApprox is not treated as incomplete by this SPEC',
     vm.runInContext('_aurixPointValuationIncomplete', sb)({fxApprox:true}) === false);
  ok('no approx counter is exposed (the soft tier was removed, not left dangling)',
     r.counts.approxValuation === undefined);
}

// ── WINDOW ANCHOR — adversarial review finding #3 (was a real defect) ───────
console.log('\nANCLA — a quality-excluded trailing point still anchors the range window');
{
  // Excluding a trailing partial point must not slide the chart's nowRef backwards, or the line
  // and the % would measure two different windows (the return path anchors on the raw tail).
  const withPartialTail = series([P(0,100000), P(10,101000), P(20,102000), P(30,82000,{fxPartial:true})]);
  ok('nowRef still anchors on the real trailing observation', withPartialTail.nowRef === T0 + 30*HOUR,
     'got +'+((withPartialTail.nowRef-T0)/HOUR)+'h');
  ok('but the partial point is still not plotted', withPartialTail.normalized.length === 3);
  ok('anchor matches the pre-SPEC value (same as if it had been complete)',
     series([P(0,100000), P(10,101000), P(20,102000), P(30,99000)]).nowRef === withPartialTail.nowRef);
  // the clock-skew protection must NOT be reopened through the anchor pool
  const skew = series([P(0,100000), P(1,101000), P(24*400,82000,{fxPartial:true})]);
  ok('a corrupt FUTURE partial point cannot drag the anchor forward', skew.nowRef === T0 + 1*HOUR,
     'got +'+((skew.nowRef-T0)/HOUR)+'h');
}

// ── ONE VOCABULARY — adversarial review finding #2 (was a real defect) ──────
console.log('\nVOCABULARIO ÚNICO — the return path must not disagree with the chart path');
{
  const ret = app.slice(app.indexOf('const build = (excludeApprox) => {'), app.indexOf('const build = (excludeApprox) => {') + 1400);
  ok('the return/badge path uses the SAME shared predicate',
     /_aurixPointValuationIncomplete\(p\)\) continue;/.test(ret));
  ok('so valuationComplete:false can never become a return baseline while the chart drops it',
     /BLOCK-A — same shared predicate as the chart path/.test(ret));
  ok('exactly one quality vocabulary exists (no parallel predicate)',
     (app.match(/function _aurixPointValuationIncomplete\(/g) || []).length === 1);
}

// ── NON-GOALS — renderer untouched, no magnitude/smoothing introduced ───────
console.log('\nNON-GOALS (BLOCK-A boundary)');
{
  const block = app.slice(app.indexOf('function _aurixPointValuationIncomplete'), app.indexOf('function _aurixPointValuationApprox')+400);
  ok('quality predicates contain no percentage/magnitude threshold', !/0\.\d+|\bpct\b/i.test(block));
  ok('no smoothing/interpolation/resampling added', !/BLOCK-A[\s\S]{0,400}(smooth|interpolat|resampl)/i.test(app));
  ok('suspect is documented as audit-only, never a series filter', /never a series filter/.test(app));
}

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail === 0 ? 0 : 1);
