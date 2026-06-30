'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-RETURN-BASELINE-GUARD-harness — P0 (never show a false return on a new portfolio)
// ════════════════════════════════════════════════════════════════════════════
// getValidReturnBaseline() gates the header return: only when there is a real post-reset baseline,
// a positive baseline, enough elapsed history, and the window is NOT dominated by the initial
// capital construction. Otherwise returnState='pending_baseline' ⇒ header shows "—" (no %, no $,
// no red/green). The return math (_aurixRangeReturn), sync and renderer are NOT touched.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c,i){ if(c){pass++;console.log('  ✓ '+n+(i?'  ['+i+']':''));}else{fail++;console.log('  ✗ '+n+(i?'  ['+i+']':''));} }
const NOW = 1800000000000, MIN = 60000, DAY = 86400000;

function makeEnv(){
  const sb = { Math, Number, Date: { now: () => NOW }, console:{log:()=>{}},
    activeRange: '30d', _cfg: null, _resetAt: 0, _total: 0 };
  sb._aurixRangeReturn = (range) => sb._cfg;            // stub the canonical return
  sb._aurixResetAt = () => sb._resetAt;
  sb.totalValueBase = () => sb._total;
  vm.createContext(sb);
  vm.runInContext('const _AURIX_RETURN_MIN_HISTORY_MS = 90 * 1000; const _AURIX_RETURN_FLOW_DOMINANCE = 0.5; const _AURIX_RETURN_COMPARABLE_RATIO = {"24h":1.5,"7d":2.0,"30d":3.0,"1y":5.0,"all":8.0};', sb);
  vm.runInContext(fnSrc('_aurixPortfolioCreatedAt'), sb);
  vm.runInContext(fnSrc('getValidReturnBaseline'), sb);
  return sb;
}
const G = (sb) => vm.runInContext('getValidReturnBaseline("30d")', sb);

console.log('AURIX-RETURN-BASELINE-GUARD — P0\n');

console.log('The reported bug — new portfolio, capital dominates the window:');
{ const sb = makeEnv();
  sb._total = 5938; sb._resetAt = 0;
  sb._cfg = { valid:true, deltaPct:-89.32, deltaAbs:-5306, startValue:5938, baselineTs:NOW-10*MIN, lastTs:NOW, netFlowsNeutralized:5306 };
  const g = G(sb);
  ok('1 new portfolio (flows ≈ 89% of value) → PENDING (no false -89%)', g.valid===false && g.invalidReason==='flows_dominate_baseline' && g.returnState==='pending_baseline');
  ok('2 pending hides %/$ (deltaPct & deltaAbs null)', g.deltaPct===null && g.deltaAbs===null); }

console.log('\nBaseline validity gates:');
{ const sb = makeEnv(); sb._total = 4000;
  sb._cfg = { valid:true, deltaPct:5, deltaAbs:200, startValue:0, baselineTs:NOW-10*DAY, lastTs:NOW, netFlowsNeutralized:10 };
  ok('3 baseline value 0 → no_valid_baseline (never % vs zero)', G(sb).invalidReason==='no_valid_baseline'); }
{ const sb = makeEnv(); sb._total = 4000; sb._resetAt = NOW - 5*DAY;
  sb._cfg = { valid:true, deltaPct:-40, deltaAbs:-1500, startValue:4000, baselineTs:NOW-10*DAY, lastTs:NOW, netFlowsNeutralized:10 };
  ok('4 snapshot BEFORE last reset → pre_reset (ignored)', G(sb).invalidReason==='pre_reset'); }
{ const sb = makeEnv(); sb._total = 4000;
  sb._cfg = { valid:true, deltaPct:2, deltaAbs:80, startValue:4000, baselineTs:NOW-30000, lastTs:NOW, netFlowsNeutralized:10 };
  ok('5 < 90 s of real history → insufficient_history (Calculando…)', G(sb).invalidReason==='insufficient_history'); }
{ const sb = makeEnv(); sb._total = 0;
  sb._cfg = { valid:true, deltaPct:2, deltaAbs:80, startValue:4000, baselineTs:NOW-10*DAY, lastTs:NOW, netFlowsNeutralized:10 };
  ok('6 no current value → no_current_value', G(sb).invalidReason==='no_current_value'); }
{ const sb = makeEnv(); sb._total = 4000;
  sb._cfg = { valid:false, deltaPct:null, deltaAbs:null, startValue:null, baselineTs:null, lastTs:null, netFlowsNeutralized:0 };
  ok('7 insufficient (<2 snapshots) → no_valid_baseline', G(sb).invalidReason==='no_valid_baseline'); }

console.log('\nReal return shows once the baseline is valid:');
{ const sb = makeEnv(); sb._total = 4120;
  sb._cfg = { valid:true, deltaPct:3.2, deltaAbs:120, startValue:4000, baselineTs:NOW-10*DAY, lastTs:NOW, netFlowsNeutralized:50 };
  const g = G(sb);
  ok('8 established portfolio, small flows, real window → VALID + real %/$', g.valid===true && g.returnState==='ready' && g.deltaPct===3.2 && g.deltaAbs===120); }
{ const sb = makeEnv(); sb._total = 4120;
  sb._cfg = { valid:true, deltaPct:0, deltaAbs:0, startValue:4120, baselineTs:NOW-DAY, lastTs:NOW, netFlowsNeutralized:0 };
  ok('9 second real snapshot, no move → valid 0% (neutral, not negative)', G(sb).valid===true && G(sb).deltaPct===0); }

console.log('\nHeader consumers gated (source):');
ok('10 desktop WSC header delegates the badge to the canonical painter → "Calculando…" + calculating when invalid',
   /if \(typeof _aurixPaintReturnBadge === 'function'\) _aurixPaintReturnBadge\(changeEl, opts\.uid === 'm' \? 'mobile' : 'desktop'\);/.test(fnSrc('_wscPaintSurface')) &&
   /el\.innerHTML = _aurixReturnPendingHTML\(\);\s*el\.className = 'chart-change calculating';/.test(fnSrc('_aurixPaintReturnBadge')));
ok('11 desktop reconstructed headline gates on getValidReturnBaseline (shows "Calculando…")',
   /const _ret = \(typeof getValidReturnBaseline === 'function'\) \? getValidReturnBaseline\(activeRange\)/.test(fnSrc('_aurixReconSyncHeadline')) &&
   /chartChangeEl\.innerHTML = _aurixReturnPendingHTML\(\);/.test(fnSrc('_aurixReconSyncHeadline')));
ok('12 mobile indicator gates on getValidReturnBaseline (shows "Calculando…", no red/green)',
   /const ret = \(typeof getValidReturnBaseline === 'function'\) \? getValidReturnBaseline\(activeRange\)/.test(fnSrc('_aurixMobileSetPerfIndicator')) &&
   /if \(!ret \|\| !ret\.valid \|\| !Number\.isFinite\(ret\.deltaPct\)\) \{ el\.innerHTML = _aurixReturnPendingHTML\(\); el\.className = 'chart-change calculating';/.test(fnSrc('_aurixMobileSetPerfIndicator')));
ok('13 %/$ toggle respects pending: the canonical painter gates validity BEFORE the unit (mode read only when valid)',
   (function(){ const s=fnSrc('_aurixPaintReturnBadge'); return s.indexOf('_aurixFormatReturnText') > s.indexOf('g.valid'); })() &&
   /const mode = \(typeof activePerfMode/.test(fnSrc('_aurixFormatReturnText')));

console.log('\nDiagnostic:');
ok('14 window.aurixReturnDebug() exposes the required fields',
   /window\.aurixReturnDebug = function/.test(app) &&
   ['range','currentValue','baselineValue','baselineTimestamp','portfolioCreatedAt','lastResetAt','baselineValid','invalidReason','displayedReturn']
     .every(k => app.indexOf(k + ':') !== -1));

console.log('\nNo touch to return math / sync / renderer:');
ok('15 _aurixRangeReturn math unchanged (same deltaPct formula); getValidReturnBaseline is additive',
   /out\.deltaPct   = \(Number\.isFinite\(first\) && first > 0 && Number\.isFinite\(last\)\) \? \+\(\(\(last - first\) \/ first\) \* 100\)/.test(app) &&
   /function getValidReturnBaseline\(range, opts\)/.test(app));
ok('16 chart geometry / renderer / sync untouched', /function renderAurixInstitutionalChart\(/.test(app) && /function _aurixMergePortfolio\(/.test(app) && /const _AURIX_BLOCK_DESTRUCTIVE_SAVES = true;/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
