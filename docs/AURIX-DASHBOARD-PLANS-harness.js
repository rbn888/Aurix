'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-DASHBOARD-PLANS — «Tus planes»: qué se publica y qué NO se afirma
// ════════════════════════════════════════════════════════════════════════════
// Aquí vive el contrato de DATOS de la sección, ejecutado sobre los owners
// reales: qué documentos entran, qué cifras se publican, cuándo NO se publica
// ninguna y por qué un cero local no autoriza a decir «no tienes planes».
// La geometría y los recorridos (abrir, editar, guardar, volver, renombrar,
// borrar, cambiar de cuenta) tienen su propio owner:
// `scripts/aurix-dashboard-plans-probe.mjs`, que los ejercita en un navegador.
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
function konstSrc(name){ const m=new RegExp('^const '+name+'\\s*=','m').exec(app);
  if(!m) throw new Error('missing const '+name); const i=m.index;
  let k=i, depth=0, started=false; for(;k<app.length;k++){ const c=app[k]; if(c==='('||c==='{'||c==='[') {depth++;started=true;} else if(c===')'||c==='}'||c===']') depth--; else if(c===';'&&(!started||depth===0)) { k++; break; } }
  return app.slice(i,k); }
let pass=0, fail=0; function ok(n,c,info){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(info?'  ['+info+']':''));} }

console.log('AURIX-DASHBOARD-PLANS — plantillas guardadas en el Dashboard\n');

function ctx(opts) {
  opts = opts || {};
  const sb = { Math, Number, String, Object, Array, JSON, Date, Intl, console: { warn(){}, error(){} } };
  vm.createContext(sb);
  const tI = app.indexOf('const T = {');
  let k = app.indexOf('{', tI), d = 0, end = -1;
  for (; k < app.length; k++) { if (app[k] === '{') d++; else if (app[k] === '}') { d--; if (!d) { end = k + 1; break; } } }
  vm.runInContext('var lang = "es";', sb);
  vm.runInContext(app.slice(tI, end) + ';', sb);
  vm.runInContext('function t(k){ var dd=T[lang]||T.es; var v=dd[k]; if(v===undefined) v=T.es[k]; return v; }', sb);
  vm.runInContext('function _intccEsc(x){ return String(x == null ? "" : x).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c])); }', sb);
  vm.runInContext('function formatBase(v){ return String(Math.round(Number(v) || 0)) + " €"; }', sb);
  // El almacén REAL de Workspace, con su filtro de tombstones.
  vm.runInContext('var __LS = Object.create(null); var localStorage = { getItem: k => (k in __LS ? __LS[k] : null), setItem: (k,v) => { __LS[k] = String(v); }, removeItem: k => { delete __LS[k]; } };', sb);
  vm.runInContext('var _wsDocTableState = ' + JSON.stringify(opts.table || 'yes') + ';', sb);
  vm.runInContext('var __SESSION = ' + JSON.stringify(opts.session === undefined ? 'u1' : opts.session) + '; function _wsDocsSession(){ return __SESSION; }', sb);
  vm.runInContext('var __WORST = ' + JSON.stringify(opts.worst || 'idle') + '; function _wsDocSyncWorst(){ return __WORST; }', sb);
  vm.runInContext('var __GRANT = ' + JSON.stringify(opts.grant === undefined ? true : opts.grant) + '; function hasFeature(){ return __GRANT; } function hasAurixPremiumAccess(){ return __GRANT; } function _aurixEntIsCatalogPreview(){ return false; }', sb);
  vm.runInContext('var __UP = []; function openUpgradeIntent(o){ __UP.push(o); return false; }', sb);
  vm.runInContext('var _wsToolActive=null, _wsToolInputs=null, _wsToolEditId=null, _wsToolDirty=false, _wsReturnTab="tools", _wshView="home";', sb);
  ['_WSH_PROJECTS_KEY','_WS_CATALOG','_WS_TOOLKEY_TO_ID','_WS_TOOL_RENDER','_WS_TPL_RENDER','_WSPL_TYPES',
   '_WSBUD_INCOME','_WSBUD_EXPENSES'].forEach(n => vm.runInContext(konstSrc(n), sb));
  ['_wshReadStore','_ws4ProjectsRaw','_ws4Projects','_wsCatalogEntry','_wsSurfaceEntry','_wsEntryOpenable',
   '_wsToolAccess','_wsCatalogSurfaceKey','_wsLabel','_wsTypeLabel','_wsNum','_wsCapIconHtml','_wsGlyph',
   'calculateMonthlyBudget','calculateReceivables','calculateRealEstatePortfolio','_wsRecvStatus',
   '_wsPlanMoney',
   '_wsPlansDocs','_wsPlanMetrics','_wsPlansEmptyState','_renderDashboardPlans']
    .forEach(n => { try { vm.runInContext(fnSrc(n), sb); } catch (e) { throw new Error('ctx ' + n + ': ' + e.message); } });
  if (opts.docs) vm.runInContext('localStorage.setItem(_WSH_PROJECTS_KEY, ' + JSON.stringify(JSON.stringify(opts.docs)) + ');', sb);
  return sb;
}
const R = (c, e) => vm.runInContext(e, c);

const DOCS = [
  { id: 'd1', type: 'monthly_budget',        customName: 'Presupuesto casa',  updatedAt: 500, inputs: { salary: 2500, housing: 700, food: 300 } },
  { id: 'd2', type: 'monthly_budget',        customName: 'Presupuesto viaje', updatedAt: 400, inputs: { salary: 800, food: 200 } },
  { id: 'd3', type: 'receivables_app',       customName: 'Clientes 2026',     updatedAt: 300, inputs: { items: [{ id: 'r1', units: 1, unitPrice: 1000, paidAmount: 400 }] } },
  { id: 'd4', type: 'real_estate_portfolio', customName: 'Cartera Madrid',    updatedAt: 200, inputs: { properties: [{ id: 'p1', name: 'Piso', ptype: 'flat', buy: 200000, value: 250000 }] } },
  { id: 'd5', type: 'trade_journal',         customName: 'Diario cripto',     updatedAt: 100, inputs: { currency: 'EUR', trades: [{ id: 't1', asset: 'BTC', buy: 1, qty: 1 }, { id: 't2', asset: 'ETH', buy: 2, qty: 1 }] } },
];

// ════════════════════════════════════════════════════════════════════════════
// 1 · QUÉ ENTRA: SÓLO PLANTILLAS GUARDADAS
// ════════════════════════════════════════════════════════════════════════════
console.log('1 · El conjunto publicado:');
{
  const c = ctx({ docs: DOCS.concat([
    { id: 'x1', type: 'compound_growth',  customName: 'Simulación', updatedAt: 900, inputs: {} },
    { id: 'x2', type: 'loan_simulation',  customName: 'Hipoteca',   updatedAt: 880, inputs: {} },
    { id: 'x3', type: 'asset_prices',     customName: 'Precios',    updatedAt: 870, inputs: {} },
    { id: 'x4', type: 'monthly_budget',   customName: 'Borrado',    updatedAt: 950, deletedAt: 1, inputs: {} },
    // §11 — la comparación de supuestos también guarda documento, así que
    // también aparece. Lleva SUS resultados dentro, que es de donde debe leer la
    // tarjeta: recalcular aquí usaría los parámetros del último borrador.
    { id: 'x5', type: 'scenario_compare', customName: 'Aportar 300', updatedAt: 860,
      currency: 'EUR', inputs: { baseManual: '100000', years: '20', ret: '6', baseMonthly: '0', altMonthly: '300' },
      results: { baseFinal: 320714, altFinal: 456745, diff: 136031, byContribution: 72000, byGrowth: 64031, years: 20 } },
  ]) });
  const ids = JSON.parse(R(c, 'JSON.stringify(_wsPlansDocs().map(p => p.id))'));
  // ── RE-DECIDIDO (§5) ─────────────────────────────────────────────────────
  // Esto exigía SÓLO las cuatro plantillas, y era alcance declarado. Resultó ser
  // un contrato roto: Interés compuesto ofrece «Guardar», el usuario guarda y su
  // documento no aparecía en ningún sitio. Ningún botón puede prometer guardar
  // mientras su instancia queda fuera. Ahora entran TODAS las capacidades que
  // guardan documento… y lo INTERNO sigue fuera, que es la otra mitad: `x3` es
  // `asset_prices`, no está publicada, y el gate de apertura la deja fuera sola.
  // AMPLIADO en §11 con `x5` (comparación de escenarios): la lista crece cuando
  // crece el conjunto de capacidades que guardan documento — no se ha aflojado
  // nada, se ha añadido un tipo que antes no existía.
  ok('1.1 TODA instancia guardada de una capacidad publicada, incluidas herramientas',
    ids.indexOf('x1') !== -1 && ids.indexOf('x2') !== -1 && ids.indexOf('x5') !== -1
    && ['d1','d2','d3','d4','d5'].every(x => ids.indexOf(x) !== -1)
    && ids.length === 8, JSON.stringify(ids));
  ok('1.1b …y lo INTERNO sigue fuera: no publicado no aparece',
    ids.indexOf('x3') === -1, JSON.stringify(ids));
  ok('1.2 un documento con tombstone NO resucita en esta vista',
    ids.indexOf('x4') === -1);
  // El más recién editado primero: es el que el usuario probablemente retoma.
  ok('1.3 se ordenan por última edición, no por tipo ni por orden de almacén',
    (() => { const ts = JSON.parse(R(c, 'JSON.stringify(_wsPlansDocs().map(p => p.updatedAt))'));
      return ts.every((v, i) => i === 0 || ts[i - 1] >= v); })(),
    R(c, 'JSON.stringify(_wsPlansDocs().map(p => p.updatedAt))'));
  // Dos presupuestos distintos conservan identidad y nombre propios: es lo único
  // que los distingue, porque comparten tipo.
  const html1 = R(c, '_renderDashboardPlans()');
  // Una simulación se rotula como tal: un capital final proyectado no es un
  // hecho patrimonial, y la tarjeta tiene que decirlo.
  ok('1.3b las simulaciones se rotulan como proyección, y las plantillas no',
    (() => { const h = R(c, '_renderDashboardPlans()');
      const simCards = (h.match(/wspl-sim/g) || []).length;
      return simCards === 3; })(),
    (R(c, '_renderDashboardPlans()').match(/wspl-sim/g) || []).length + ' rótulos');
  ok('1.4 dos plantillas del MISMO tipo mantienen nombre e identidad propios',
    /data-wspl-id="d1"/.test(html1) && /data-wspl-id="d2"/.test(html1)
    && html1.indexOf('Presupuesto casa') !== -1 && html1.indexOf('Presupuesto viaje') !== -1
    && (html1.match(/data-wspl-open="d[12]"/g) || []).length === 2);
  // Y sus dos cifras salen de lo GUARDADO. Si la tarjeta recalculase, leería los
  // parámetros vivos de la superficie —que son de OTRO borrador— y publicaría una
  // comparación que ese documento nunca hizo.
  ok('1.4b la comparación guardada publica SUS cifras, no un recálculo',
    (() => {
      const m = JSON.parse(R(c, `JSON.stringify(_wsPlanMetrics(_wsPlansDocs().find(p => p.id === 'x5')).map(x => x.v))`));
      return m.length === 2 && /456\.7|456,7|456745/.test(m[0]) && /136\.0|136,0|136031/.test(m[1]);
    })(),
    R(c, `JSON.stringify(_wsPlanMetrics(_wsPlansDocs().find(p => p.id === 'x5')))`));
  ok('1.5 esta vista no escribe: no hay una segunda persistencia',
    !/setItem|_wshWriteStore|_ws4Persist|_ws4SaveAll/.test(
      fnSrc('_wsPlansDocs') + fnSrc('_wsPlanMetrics') + fnSrc('_renderDashboardPlans') + fnSrc('updateDashboardPlans')));
  // El conjunto se relee del almacén en CADA pintado: no hay caché propia que
  // pueda sobrevivir a un cambio de cuenta. El aislamiento se hereda.
  ok('1.6 se relee el almacén en cada pintado (sin caché propia que arrastrar)',
    /_ws4Projects\(\)/.test(fnSrc('_wsPlansDocs')) && !/let _wsPlansCache|var _wsPlansCache/.test(app));
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · LAS CIFRAS: DEL MOTOR QUE YA EXISTE, Y SÓLO SI SON CIERTAS
// ════════════════════════════════════════════════════════════════════════════
console.log('\n2 · Hasta dos métricas, nunca inventadas:');
{
  const c = ctx({ docs: DOCS });
  const met = id => JSON.parse(R(c, 'JSON.stringify(_wsPlanMetrics(_wsPlansDocs().find(p => p.id === ' + JSON.stringify(id) + ')))'));
  ok('2.1 presupuesto → ingresos y gastos, del mismo motor que la plantilla',
    (() => { const m = met('d1'); return m.length === 2 && m[0].k === 'Ingresos' && m[1].k === 'Gastos'
      && m[0].v === R(c, 'formatBase(calculateMonthlyBudget({salary:2500,housing:700,food:300}).income)'); })(),
    JSON.stringify(met('d1')));
  ok('2.2 cobros → pendiente y cobrado, de sus estados reales',
    (() => { const m = met('d3'); return m.length === 2 && m[0].k === 'Pendiente' && m[1].k === 'Cobrado'; })(),
    JSON.stringify(met('d3')));
  ok('2.3 inmuebles → número y valor',
    (() => { const m = met('d4'); return m.length === 2 && m[0].k === 'Inmuebles' && m[0].v === '1'; })(),
    JSON.stringify(met('d4')));
  ok('2.4 diario → SÓLO el recuento: no se inventa una rentabilidad',
    (() => { const m = met('d5'); return m.length === 1 && m[0].k === 'Operaciones' && m[0].v === '2'; })(),
    JSON.stringify(met('d5')));
  ok('2.5 ninguna métrica afirma un PERIODO («este mes» exigiría un selector que no existe)',
    !/este mes|this month|mensualmente|per month/i.test(R(c, '_renderDashboardPlans()')));
  // ── LO QUE NO SE PUEDE CALCULAR NO SE PINTA ──────────────────────────────
  const vacio = ctx({ docs: [
    { id: 'e1', type: 'monthly_budget',        customName: 'Vacío',   updatedAt: 5, inputs: {} },
    { id: 'e2', type: 'receivables_app',       customName: 'Sin filas', updatedAt: 4, inputs: { items: [] } },
    { id: 'e3', type: 'real_estate_portfolio', customName: 'Sin pisos', updatedAt: 3, inputs: { properties: [] } },
    { id: 'e4', type: 'trade_journal',         customName: 'Sin ops',   updatedAt: 2, inputs: { trades: [] } },
  ] });
  ok('2.6 un documento sin datos suficientes se publica SIN cifras, no con ceros',
    ['e1', 'e2', 'e3', 'e4'].every(id =>
      JSON.parse(R(vacio, 'JSON.stringify(_wsPlanMetrics(_wsPlansDocs().find(p => p.id === ' + JSON.stringify(id) + ')))')).length === 0),
    R(vacio, '_renderDashboardPlans()').slice(0, 200));
  ok('2.7 …y aun así conserva su nombre y su tipo',
    (() => { const h = R(vacio, '_renderDashboardPlans()');
      return h.indexOf('Vacío') !== -1 && h.indexOf('wspl-metrics') === -1
        && h.indexOf(R(vacio, 't("wstool_budget_n")')) !== -1; })());
  // Una cartera con inmuebles pero SIN valoración declarada: el recuento sí, el
  // valor no — «0 €» diría que no vale nada.
  const sinValor = ctx({ docs: [{ id: 'v1', type: 'real_estate_portfolio', customName: 'Sin tasar', updatedAt: 1,
    inputs: { properties: [{ id: 'p1', name: 'Piso', ptype: 'flat', buy: 0, value: 0 }] } }] });
  ok('2.8 inmuebles sin valor declarado publican el recuento y NO un valor de cero',
    (() => { const m = JSON.parse(R(sinValor, 'JSON.stringify(_wsPlanMetrics(_wsPlansDocs()[0]))'));
      return m.length === 1 && m[0].k === 'Inmuebles'; })(),
    R(sinValor, 'JSON.stringify(_wsPlanMetrics(_wsPlansDocs()[0]))'));
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · UN FALLO DE SINCRONIZACIÓN NO ES «NO TIENES PLANES»
// ════════════════════════════════════════════════════════════════════════════
console.log('\n3 · El vacío sólo se afirma cuando se sabe:');
{
  const casos = [
    ['sin sesión · lo local es todo lo que hay',      { session: null,  table: 'unknown' }, 'empty'],
    ['tabla confirmada · el vacío es cierto',          { table: 'yes' },                    'empty'],
    ['tabla ausente · lo local es todo lo que hay',    { table: 'no' },                     'empty'],
    ['todavía sin respuesta · no se sabe',             { table: 'unknown' },                'loading'],
    ['error de sincronización · no se sabe',           { table: 'unknown', worst: 'error' },'error'],
  ];
  casos.forEach(([n, o, exp]) => {
    const c = ctx(Object.assign({ docs: [] }, o));
    ok('3.1 ' + n, R(c, '_wsPlansEmptyState()') === exp, R(c, '_wsPlansEmptyState()'));
  });
  const err = ctx({ docs: [], table: 'unknown', worst: 'error' });
  const h = R(err, '_renderDashboardPlans()');
  ok('3.2 con error NO se dice «no tienes planes», y se ofrece reintentar',
    h.indexOf(R(err, 't("wspl_empty")')) === -1 && h.indexOf(R(err, 't("wspl_error")')) !== -1
    && /data-ws-sync-retry/.test(h));
  const vac = ctx({ docs: [], table: 'yes' });
  const hv = R(vac, '_renderDashboardPlans()');
  ok('3.3 Premium sin documentos: una línea con acceso a Plantillas, no una gran card',
    hv.indexOf(R(vac, 't("wspl_empty")')) !== -1 && /data-wspl-templates/.test(hv)
    && hv.indexOf('wspl-card') === -1);
}

// ════════════════════════════════════════════════════════════════════════════
// 4 · EL DERECHO: FALLA CERRADO, Y OCULTAR NO ES BORRAR
// ════════════════════════════════════════════════════════════════════════════
console.log('\n4 · Sin Premium confirmado no hay sección:');
{
  const src = fnSrc('updateDashboardPlans');
  ok('4.1 el guard pregunta al resolver, no a un rail local',
    /hasAurixPremiumAccess\(\) === true/.test(src) && !/aurix_plan|isPremiumTier/.test(src));
  ok('4.2 y falla CERRADO: una excepción oculta la sección',
    /catch \(_\) \{ prem = false; \}/.test(src));
  ok('4.3 sin derecho no se pinta NADA: ni hueco, ni candado, ni teaser',
    /if \(!prem \|\| drill\) \{ sec\.style\.display = 'none'; sec\.innerHTML = ''; return; \}/.test(src)
    && !/lock|candado|teaser|upgrade/i.test(src));
  ok('4.4 ocultar no borra: el guard no toca ningún almacén',
    !/removeItem|_ws4Tombstone|_wshWriteStore/.test(src));
  // La sección nace OCULTA en el HTML: sin JS no hay un hueco reservado.
  ok('4.5 la sección nace oculta en el documento, no tras un parpadeo',
    /<section class="wspl-sec" id="wsPlansSection" style="display:none"><\/section>/.test(html));
  // «Continuar» vuelve a preguntar: un derecho revocado entre el pintado y el
  // clic no puede abrir nada.
  const open = fnSrc('_wsPlansOpen');
  ok('4.6 «Continuar» revalida el derecho por el MISMO owner de apertura',
    /_wsToolAccess\(spec\.tool\)/.test(open) && /if \(!acc\.ok\)/.test(open) && /_wsOpenTool\(spec\.tool, id\)/.test(open));
  ok('4.7 …y sólo ofrece upgrade cuando la razón ES comercial',
    /acc\.reason === 'entitlement'/.test(open));
  ok('4.8 el retorno usa el owner preparado del bloque anterior',
    /_wsReturnTab = 'dashboard';/.test(open));
  // Y el Dashboard no se convierte en una segunda puerta a lo no publicado.
  const c = ctx({ docs: DOCS, grant: false });
  ok('4.9 sin derecho, ni un documento entra en el conjunto publicado',
    JSON.parse(R(c, 'JSON.stringify(_wsPlansDocs())')).length === 0);
}

// ════════════════════════════════════════════════════════════════════════════
// 5 · NO TOCA EL PATRIMONIO
// ════════════════════════════════════════════════════════════════════════════
console.log('\n5 · Una simulación nunca es patrimonio:');
{
  const all = fnSrc('_wsPlansDocs') + fnSrc('_wsPlanMetrics') + fnSrc('_renderDashboardPlans')
    + fnSrc('updateDashboardPlans') + fnSrc('_wsPlansOpen');
  ok('5.1 la sección no lee ni escribe activos, movimientos ni totales',
    !/assets|holdings|portfolio(Total|Value)|totalValueUSD|addAsset|getDistribution|updateDonut/.test(all));
  ok('5.2 y se pinta DEBAJO de las categorías, fuera de cualquier total',
    html.indexOf('id="categoriesSection"') < html.indexOf('id="wsPlansSection"')
    && html.indexOf('id="wsPlansSection"') < html.indexOf('id="assetsSection"'));
  // ── NI SE LO CUENTA A INTELLIGENCE ──────────────────────────────────────
  // Un presupuesto puede ser el de un familiar y un cobro puede ser hipotético.
  // Que el Dashboard OFREZCA abrirlos no los convierte en hechos del patrimonio
  // de nadie, así que esta vista no puede alimentar al motor de interpretación
  // ni sembrar el formulario de alta de activos. Es una vista de acceso, y su
  // único verbo es «continuar».
  // `_intccEsc` NO cuenta y se exceptúa a propósito: es el escapador de HTML
  // compartido, una función pura que vive en ese namespace por historia. Lo que
  // este assert persigue es un FLUJO DE DATOS hacia el motor, no un prefijo.
  const allNoEsc = all.replace(/_intccEsc/g, 'esc');
  ok('5.3 la sección no alimenta Intelligence ni siembra el alta de activos',
    !/_aurixIntel|intelligence|_intcc|_intv|factLedger|_aurixFacts|openModal\(|prefill|seedAsset/i.test(allNoEsc),
    (allNoEsc.match(/intelligence|_intcc|openModal\(|prefill/gi) || []).join(' '));
  // Y no escribe NADA: una vista que persiste es una vista que puede corromper
  // el documento que sólo venía a enseñar.
  ok('5.4 y sigue sin escribir en ningún almacén (ni local, ni remoto)',
    !/setItem|removeItem|_ws4Persist|_wshWriteStore|\.upsert\(|\.insert\(|\.update\(/.test(all));
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
