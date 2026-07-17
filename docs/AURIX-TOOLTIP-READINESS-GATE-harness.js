'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-TOOLTIP-READINESS-GATE-harness — SPEC CHART-INTEGRITY.LB-2 (consumer completeness)
// ════════════════════════════════════════════════════════════════════════════
// The badge painter was gated by LB-2 but the two hover tooltips (desktop updateChartTooltip, mobile
// _aurixMobInspectorUpdate) computed a per-point return % straight from the plotted (possibly pre-merge)
// series — leaking a pre-reconciliation number while the badge shows "Calculando…". This certifies:
//   • _aurixReturnPublishReadyNow mirrors the badge readiness (false while backend enabled + idle/loading/failed).
//   • both tooltip functions consult it before emitting a %.
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

const sb = { Number, isFinite, console:{} };
vm.createContext(sb);
vm.runInContext(konstSrc('_AURIX_PUBLICATION_STATE'), sb);
vm.runInContext(fnSrc('_aurixResolvePublicationReadiness'), sb);
vm.runInContext(fnSrc('_aurixReturnPublishReadyNow'), sb);
// drive via injected globals
function ready(enabled, state){ vm.runInContext('var _AURIX_BACKEND_SNAPSHOTS_ENABLED='+enabled+'; var _aurixBackendSnapshotsState='+JSON.stringify(state)+';', sb); return vm.runInContext('_aurixReturnPublishReadyNow()', sb); }

console.log('AURIX-TOOLTIP-READINESS-GATE — SPEC CHART-INTEGRITY.LB-2\n');
console.log('Predicate mirrors the badge:');
ok('1 backend enabled + loading ⇒ NOT ready', ready(true,'loading')===false);
ok('2 backend enabled + idle ⇒ NOT ready', ready(true,'idle')===false);
ok('3 backend enabled + failed ⇒ NOT ready', ready(true,'failed')===false);
ok('4 backend enabled + ready ⇒ ready', ready(true,'ready')===true);
ok('5 backend disabled ⇒ ready regardless of state', ready(false,'loading')===true);

console.log('\nBoth tooltip functions consult the gate before emitting a %:');
const desk = fnSrc('updateChartTooltip');
const mob = fnSrc('_aurixMobInspectorUpdate');
ok('6 desktop updateChartTooltip references _aurixReturnPublishReadyNow', desk.indexOf('_aurixReturnPublishReadyNow') >= 0);
ok('7 desktop withholds % (valText = \'—\') when not ready', /!_aurixReturnPublishReadyNow\(\)/.test(desk) && /valText\s*=\s*'—'/.test(desk));
ok('8 mobile _aurixMobInspectorUpdate references _aurixReturnPublishReadyNow', mob.indexOf('_aurixReturnPublishReadyNow') >= 0);
ok('9 mobile guards pctTxt with the readiness predicate', /_pubReadyTip\s*&&/.test(mob));
ok('10 mobile still shows value + date (LINE ⊥ RETURN preserved)', mob.indexOf('mob-tip-v') >= 0 && mob.indexOf('mob-tip-date') >= 0);

console.log('\n' + (fail? ('FAIL — '+pass+' passed, '+fail+' failed') : ('PASS — '+pass+' passed, 0 failed  —  TOOLTIP GATE CERTIFIED ✓')));
if (fail) process.exit(1);
