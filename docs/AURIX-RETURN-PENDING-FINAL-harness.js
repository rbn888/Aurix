'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-RETURN-PENDING-FINAL-harness — P0 correctness + premium UX
// ════════════════════════════════════════════════════════════════════════════
// When the return baseline is NOT yet valid (new / reset / onboarding / import) the header must
// NEVER show a dry "—" or a false loss: it shows a premium "Calculando…" state (electric-blue,
// 1.5s shimmer, no red/green, no flash, reduced-motion safe) — IDENTICAL on web + mobile. The %/$
// toggle does not change the pending state. The baseline leaves "Calculando…" automatically as soon
// as there are two genuinely comparable post-reset snapshots (≥90 s history, flows < 50% of value).
// Display-only + validation: the return math (_aurixRangeReturn), sync, persistence and the renderer
// are NOT touched.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c,i){ if(c){pass++;console.log('  ✓ '+n+(i?'  ['+i+']':''));}else{fail++;console.log('  ✗ '+n+(i?'  ['+i+']':''));} }

const NOW = 1800000000000, MIN = 60000, DAY = 86400000;
function makeEnv(){
  const sb = { Math, Number, Date: { now: () => NOW }, console:{log:()=>{}},
    activeRange:'30d', _cfg:null, _resetAt:0, _total:0 };
  sb._aurixRangeReturn = () => sb._cfg;
  sb._aurixResetAt = () => sb._resetAt;
  sb.totalValueBase = () => sb._total;
  vm.createContext(sb);
  vm.runInContext('const _AURIX_RETURN_MIN_HISTORY_MS = 90 * 1000; const _AURIX_RETURN_FLOW_DOMINANCE = 0.5; const _AURIX_RETURN_COMPARABLE_RATIO = {"24h":1.20,"7d":1.35,"30d":1.75,"1y":3.00,"all":3.00};', sb);
  vm.runInContext(fnSrc('_aurixPortfolioCreatedAt'), sb);
  vm.runInContext(fnSrc('getValidReturnBaseline'), sb);
  return sb;
}
const G = (sb,r) => vm.runInContext('getValidReturnBaseline("'+(r||'30d')+'")', sb);

console.log('AURIX-RETURN-PENDING-FINAL — premium "Calculando…" + fast baseline stabilization\n');

console.log('Premium pending markup (shared, identical web + mobile):');
ok('1 _aurixReturnPendingHTML() exists and emits "Calculando…" inside .wsc-metric-calc',
   /function _aurixReturnPendingHTML\(\)\s*\{/.test(app) &&
   /class="wsc-metric-val wsc-metric-calc"[\s\S]*?Calculando…/.test(app));
ok('2 pending text is "Calculando…", never a dry "—"',
   /const _AURIX_RETURN_PENDING_TEXT = 'Calculando…';/.test(app));

console.log('\nAll header return consumers render the pending state (no false loss anywhere):');
ok('3 desktop WSC — chart-not-ready (skeleton) routes the badge through the canonical painter (Calculando)',
   /if \(!_snap \|\| !_snap\.graphReady\) \{[\s\S]*?_aurixPaintReturnBadge\(changeEl,[\s\S]*?else \{ changeEl\.innerHTML = _aurixReturnPendingHTML\(\); changeEl\.className = 'chart-change calculating';/.test(app));
ok('4 desktop WSC delegates badge to the canonical painter (Calculando when invalid)',
   /if \(typeof _aurixPaintReturnBadge === 'function'\) _aurixPaintReturnBadge\(changeEl, opts\.uid === 'm' \? 'mobile' : 'desktop'\);/.test(fnSrc('_wscPaintSurface')) &&
   /el\.innerHTML = _aurixReturnPendingHTML\(\);\s*el\.className = 'chart-change calculating';/.test(fnSrc('_aurixPaintReturnBadge')));
ok('5 desktop reconstructed headline delegates to the single badge owner (Calculando from the painter)',
   /_aurixPaintReturnBadge\(chartChangeEl, 'desktop'\)/.test(fnSrc('_aurixReconSyncHeadline')));
ok('6 mobile indicator delegates to the single badge owner (parity, Calculando from the painter)',
   /_aurixPaintReturnBadge\(el, 'mobile'\)/.test(fnSrc('_aurixMobileSetPerfIndicator')));
ok('7 "Resumen de rendimiento" hero consumes the single producer — pending from snapshot, no own getValidReturnBaseline',
   /computePerformanceSnapshot\(activeRange\)/.test(fnSrc('_dshPaintPerfSnapshot')) &&
   /const _pending = _hasData && !_ps\.badgeReady;/.test(fnSrc('_dshPaintPerfSnapshot')) &&
   /_pending \? _aurixReturnPendingHTML\(\)/.test(fnSrc('_dshPaintPerfSnapshot')) &&
   !/getValidReturnBaseline\(/.test(fnSrc('_dshPaintPerfSnapshot')));
ok('7b legacy Chart.js headline (updateChart) delegates to the single badge owner — no raw formula',
   /_aurixPaintReturnBadge\(chartChangeEl, 'desktop'\)/.test(fnSrc('updateChart')) &&
   !/getValidReturnBaseline\(/.test(fnSrc('updateChart')));

console.log('\nWeb ⇄ mobile parity (same node content):');
ok('8 recon headline mirrors innerHTML (not textContent) to #chartChangeMobile',
   /const _mch = document\.getElementById\('chartChangeMobile'\);\s*if \(_mch\) \{ _mch\.innerHTML = chartChangeEl\.innerHTML; _mch\.className = chartChangeEl\.className; \}/.test(fnSrc('_aurixReconSyncHeadline')));

console.log('\n%/$ toggle never changes the pending state (gate read BEFORE the unit):');
ok('9 the painter reads the unit (activePerfMode) only AFTER readiness (pending state is unit-independent)',
   (function(){ const s=fnSrc('_aurixPaintReturnBadge'); return s.indexOf('_aurixFormatReturnFromSnapshot') > s.indexOf('snap.badgeReady'); })() &&
   /const mode = \(typeof activePerfMode/.test(fnSrc('_aurixFormatReturnText')));
ok('10 mobile indicator contains NO unit logic at all (activePerfMode + pending markup live in the single owner)',
   fnSrc('_aurixMobileSetPerfIndicator').indexOf('activePerfMode') === -1 && fnSrc('_aurixMobileSetPerfIndicator').indexOf('_aurixReturnPendingHTML') === -1);
ok('11 perf-snapshot count-up is skipped while pending (Calculando markup not overwritten)',
   /if \(snap && !_pending\) \{/.test(fnSrc('_dshPaintPerfSnapshot')));

console.log('\nPremium CSS — electric blue, 1.5s shimmer, no flash, no red/green, reduced-motion safe:');
ok('12 .wsc-metric-calc animates with a 1.5s shimmer',
   /\.wsc-metric-calc \{[\s\S]*?animation: aurixCalcShimmer 1\.5s/.test(css) && /@keyframes aurixCalcShimmer/.test(css));
ok('13 reduced-motion → static blue text (animation:none, no sweep)',
   /@media \(prefers-reduced-motion: reduce\) \{\s*\.wsc-metric-calc \{\s*animation: none;[\s\S]*?-webkit-text-fill-color: #4A82F0;/.test(css));
ok('14 calculating tone is electric blue — never red/green',
   /\.chart-change\.calculating\s*\{ color: var\(--aurix-blue\)/.test(css) &&
   !/\.chart-change\.calculating[^}]*var\(--(green|red)\)/.test(css) &&
   !/\.wsc-metric-calc[^}]*var\(--(green|red)\)/.test(css));

console.log('\nFast stabilization — leave "Calculando…" as soon as it is honest, never invent a return:');
ok('15 min-history floor lowered to 90 s (was 5 min)',
   /const _AURIX_RETURN_MIN_HISTORY_MS = 90 \* 1000;/.test(app));
ok('16 debug exposes the exit criterion + min-history + Calculando label',
   /minHistorySeconds:/.test(app) && /exitCriterion:/.test(app) && /displayedReturn: g\.valid \? \{ pct: g\.deltaPct, abs: g\.deltaAbs \} : _AURIX_RETURN_PENDING_TEXT/.test(app));

console.log('\nBehavioral — the guard drives the pending/ready decision correctly:');
{ const sb = makeEnv(); sb._total = 5938; sb._resetAt = 0;
  sb._cfg = { valid:true, deltaPct:-89.32, deltaAbs:-5306, startValue:5938, baselineTs:NOW-10*MIN, lastTs:NOW, netFlowsNeutralized:5306 };
  ok('17 new portfolio (flows dominate) → pending_baseline, no -89% shown', G(sb).returnState==='pending_baseline' && G(sb).deltaPct===null); }
{ const sb = makeEnv(); sb._total = 4000; sb._resetAt = NOW - 5*DAY;
  sb._cfg = { valid:true, deltaPct:-40, deltaAbs:-1500, startValue:4000, baselineTs:NOW-10*DAY, lastTs:NOW, netFlowsNeutralized:10 };
  ok('18 reset invalidates pre-reset history → pending (never the old account return)', G(sb).invalidReason==='pre_reset'); }
{ const sb = makeEnv(); sb._total = 4000;
  sb._cfg = { valid:true, deltaPct:1.5, deltaAbs:60, startValue:4000, baselineTs:NOW-30000, lastTs:NOW, netFlowsNeutralized:10 };
  ok('19 only ~30 s of history → still pending (not enough to be honest yet)', G(sb).invalidReason==='insufficient_history'); }
{ const sb = makeEnv(); sb._total = 4060;
  sb._cfg = { valid:true, deltaPct:1.5, deltaAbs:60, startValue:4000, baselineTs:NOW-2*MIN, lastTs:NOW, netFlowsNeutralized:10 };
  const g = G(sb);
  ok('20 two comparable post-reset snapshots (≥90 s, small flows) → READY, real return', g.valid===true && g.returnState==='ready' && g.deltaPct===1.5); }

console.log('\nNo touch to return math / sync / persistence / renderer:');
ok('21 _aurixRangeReturn formula unchanged; pending state is additive (display + validation only)',
   /out\.deltaPct   = \(Number\.isFinite\(first\) && first > 0 && Number\.isFinite\(last\)\) \? \+\(\(\(last - first\) \/ first\) \* 100\)/.test(app));
ok('22 renderer / sync / destructive-save lock untouched',
   /function renderAurixInstitutionalChart\(/.test(app) && /function _aurixMergePortfolio\(/.test(app) && /const _AURIX_BLOCK_DESTRUCTIVE_SAVES = true;/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
