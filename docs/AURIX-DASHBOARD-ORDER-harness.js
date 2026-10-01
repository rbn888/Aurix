'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-DASHBOARD-ORDER — el orden del Dashboard: completo, por identidad y por cuenta
// ════════════════════════════════════════════════════════════════════════════
// EL DEFECTO que cierra: el arrastre de categorías guardaba sólo las VISIBLES y el
// render sólo aceptaba un orden con las seis, así que cualquier cuenta con alguna
// categoría vacía perdía su orden al recargar. Aquí se certifica, sobre los owners
// reales, el modelo que lo sustituye (dos grupos, mismo modelo):
//   · el orden guardado es COMPLETO: lo oculto conserva su hueco, lo nuevo va al final;
//   · «Tus planes» se ordena por identidad «kind:id», nunca por nombre ni posición;
//   · las dos claves viajan por el raíl LWW de ui_state y se purgan al cambiar de cuenta;
//   · guardar devuelve un resultado y un fallo se dice (no se aparenta).
// Los gestos (arrastre, táctil, teclado, menú) y la recarga real viven en
// `scripts/aurix-dashboard-order-probe.mjs`.
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0, fail=0; function ok(n,c,info){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(info?'  ['+info+']':''));} }
console.log('AURIX-DASHBOARD-ORDER — orden persistente en dos grupos\n');

const sb = { JSON, Array, Set, Map, Object, String, Number, Date, console: { warn(){}, log(){} } };
vm.createContext(sb);
vm.runInContext(`var __LS = Object.create(null); var localStorage = { getItem: k => (k in __LS ? __LS[k] : null), setItem: (k,v) => { __LS[k] = String(v); }, removeItem: k => { delete __LS[k]; } };
  var UI_STATE_TS_KEY = 'aurix_ui_state_updated_at'; var PLAN_ORDER_KEY = 'aurix_plan_order';
  var __flush = 0; function _aurixOrderFlushSoon(){ __flush++; }
  var __fail = 0; function _aurixOrderSaveFail(){ __fail++; }
  var __docs = [], __goals = [];
  function _ws4Projects(){ return __docs.filter(d => !d.deletedAt); } function _wsgGoals(){ return __goals; }
  var _WSPL_TYPES = { monthly_budget: {}, receivables_app: {} };`, sb);
['_aurixOrderNormalize','_aurixOrderMerge','_aurixPlanOrderRead','_aurixOrderPersist','_wsPlansOrderCommit','_collectUiState','_applyRemoteUiState']
  .forEach(n => vm.runInContext(fnSrc(n), sb));
const R = e => vm.runInContext(e, sb);
const J = e => JSON.stringify(R(e));

console.log('1 · El orden completo:');
const DEF = "['stock','etf','crypto','metal','real_estate','cash']";
ok('1.1 un orden PARCIAL guardado (el del arrastre antiguo) se completa, no se descarta',
  J(`_aurixOrderNormalize(['cash','stock','crypto'], ${DEF})`) === '["cash","stock","crypto","etf","metal","real_estate"]');
ok('1.2 duplicados y claves desconocidas no sobreviven',
  J(`_aurixOrderNormalize(['cash','cash','bogus','stock'], ${DEF})`) === '["cash","stock","etf","crypto","metal","real_estate"]');
ok('1.3 reordenar lo VISIBLE deja lo oculto en su hueco',
  J(`_aurixOrderMerge(['stock','etf','crypto','metal','real_estate','cash'], ['cash','crypto','stock'])`) === '["cash","etf","crypto","metal","real_estate","stock"]');
ok('1.4 lo visible que aún no estaba en el orden entra al final',
  J(`_aurixOrderMerge(['a','b'], ['b','a','c'])`) === '["b","a","c"]');
{
  const src = fnSrc('updateCategoryCards');
  ok('1.5 el render de categorías ya no exige las seis para respetar el orden',
    /_aurixOrderNormalize\(_catOrder, CAT_DEFAULT_ORDER\)/.test(src) && !/_catOrder\.length === CAT_DEFAULT_ORDER\.length/.test(src));
  ok('1.6 una reconstrucción completa espera mientras se arrastra',
    /_aurixReorderBusy === 'categoriesGrid'\) return;/.test(src));
}

console.log('\n2 · «Tus planes» por identidad:');
R(`__docs = [{ id:'a', type:'monthly_budget' }, { id:'b', type:'receivables_app', dashHidden:true }, { id:'c', type:'monthly_budget', deletedAt: 5 }];
   __goals = [{ id:'g1' }];
   localStorage.setItem(PLAN_ORDER_KEY, JSON.stringify(['workspace:c','workspace:b','workspace:a','goal:g1']));
   _wsPlansOrderCommit(['goal:g1','workspace:a']);`);
const saved = R(`JSON.parse(localStorage.getItem(PLAN_ORDER_KEY))`);
ok('2.1 se guarda por «kind:id»', saved.every(k => /^(workspace|goal):/.test(k)), JSON.stringify(saved));
ok('2.2 lo BORRADO (tombstone) se descarta', saved.indexOf('workspace:c') === -1, JSON.stringify(saved));
ok('2.3 lo quitado del Dashboard conserva su hueco', JSON.stringify(saved) === '["workspace:b","goal:g1","workspace:a"]', JSON.stringify(saved));
ok('2.4 guardar sella el LWW de ui_state y pide subirlo', R('!!localStorage.getItem(UI_STATE_TS_KEY) && __flush > 0'));
{
  const src = fnSrc('_wsPlansAll');
  ok('2.5 sin orden guardado, el de última edición; con él, lo nuevo al final', /if \(!saved\.length\) return out;/.test(src) && /Infinity/.test(src));
}

console.log('\n3 · Sincronización y cuentas:');
const ui = R('_collectUiState()');
ok('3.1 planOrder viaja en el payload de ui_state junto a catOrder', Array.isArray(ui.planOrder) && ui.planOrder.length === 3 && Array.isArray(ui.catOrder));
R(`_applyRemoteUiState({ catOrder: ['cash'] });`);
ok('3.2 una fila remota SIN planOrder no borra el orden local', R(`JSON.parse(localStorage.getItem(PLAN_ORDER_KEY)).length`) === 3);
R(`_applyRemoteUiState({ planOrder: ['goal:g1'] });`);
ok('3.3 una fila remota con planOrder lo adopta', J(`JSON.parse(localStorage.getItem(PLAN_ORDER_KEY))`) === '["goal:g1"]');
{
  const keysAt = app.indexOf('const PORTFOLIO_KEYS = [');
  const keys = app.slice(keysAt, app.indexOf('];', keysAt));
  ok('3.4 las DOS claves de orden se purgan al cambiar de cuenta (PORTFOLIO_KEYS)',
    /'portfolio_cat_order'/.test(keys) && /'aurix_plan_order'/.test(keys));
  const merge = fnSrc('_mergeRemoteState');
  ok('3.5 un orden de planes local sin sello cuenta como estado explícito (guard legacy)', /aurix_plan_order/.test(merge));
}

console.log('\n4 · Guardar no es aparentar:');
R(`localStorage.setItem = function(){ throw new Error('quota'); }; __fail = 0;`);
ok('4.1 si el almacén local rechaza la escritura, se avisa y no se afirma nada',
  R(`_aurixOrderPersist('portfolio_cat_order', ['cash'])`) === false && R('__fail') === 1);
{
  const src = fnSrc('_flushStatePersistence');
  ok('4.2 el flush devuelve su resultado (ok / partial / fail …)', /return _outcome;/.test(src) && /_outcome = 'fail'/.test(src) && /_outcome = 'partial'/.test(src));
  ok("4.3 'order' no espera el minuto de throttle", /reason !== 'order'/.test(src));
  const soon = fnSrc('_aurixOrderFlushSoon');
  ok('4.4 un fallo (o un guardado parcial sin ui_state) ofrece reintentar', /r === 'fail' \|\| r === 'partial'/.test(soon) && /_aurixOrderSaveFail\(\)/.test(soon));
}

console.log('\n' + (fail ? 'FAIL' : 'PASS') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
