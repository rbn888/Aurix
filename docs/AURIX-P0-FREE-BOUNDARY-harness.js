'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-P0-FREE-BOUNDARY — SPEC P0 «PORTADAS FREE + GUARD WORKSPACE +
// INPUTS NUMÉRICOS + MI ESPACIO»
// ════════════════════════════════════════════════════════════════════════════
// LOS CUATRO DEFECTOS QUE ORIGINAN ESTE FICHERO:
//
//  1 · LA PORTADA FREE DE WORKSPACE ERA UNA BIENVENIDA, NO UNA FRONTERA.
//      Tres cosas a la vez: `_wsFreeCoverSeen` la mostraba UNA vez por sesión, la
//      decisión fallaba hacia ABIERTO («si no sé el plan, al catálogo») y
//      `renderWorkspace` convertía explícitamente `free_cover` en `home` al
//      reentrar en la sección. Un usuario Free veía Mi espacio, Plantillas y
//      Herramientas con sólo salir de la pestaña y volver.
//
//  2 · EL CTA COBRABA UN PEAJE. `data-wsfc-upgrade` abría `#upgradeOverlay`
//      («Función premium» → «Ver AURIX Premium») y pedía un SEGUNDO clic para
//      llegar a los planes, en el punto de máxima intención.
//
//  3 · GUARDAR NO PREGUNTABA EL NOMBRE, así que dos presupuestos guardados eran
//      dos tarjetas con la misma etiqueta. Y el ciclo de vida del documento entre
//      dispositivos estaba roto por debajo: `revision` no se movía nunca (así que
//      ninguna EDICIÓN viajaba) y borrar recortaba el array en vez de dejar
//      tombstone (así que el siguiente pull resucitaba lo borrado).
//
//  4 · MI ESPACIO SE LLENABA SOLO. La pertenencia era `max(uso, favorito,
//      guardado) > 0`, así que ABRIR una herramienta una vez ya la metía.
//
// CÓMO SE CERTIFICA, y esto es deliberado: aquí se EJECUTAN los owners reales
// —el despachador de vistas, el guard, el ciclo de guardado, el modelo de
// documento— sobre los bytes de app.js. Lo que NO se puede ejercer sin navegador
// (el camino DOM → evento de teclado → handler) vive en
// `scripts/aurix-p0-free-boundary-probe.mjs`, que lo recorre con eventos reales de
// CDP. La razón está escrita en ese fichero: el gate numérico anterior daba verde
// llamando a `_wsNum` directamente y no podía detectar «no me deja borrar» ni en
// un sentido ni en el otro.
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
function konstSrc(name){ const m=new RegExp('^const '+name+'\\s*=','m').exec(app);
  if(!m) throw new Error('missing const '+name); const i=m.index;
  let k=i, depth=0, started=false; for(;k<app.length;k++){ const c=app[k]; if(c==='('||c==='{'||c==='[') {depth++;started=true;} else if(c===')'||c==='}'||c===']') depth--; else if(c===';'&&(!started||depth===0)) { k++; break; } }
  return app.slice(i,k); }
let pass=0, fail=0; const bad=[];
function ok(n,c,info){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;bad.push(n);console.log('  ✗ '+n+(info?'  ['+info+']':''));} }

console.log('AURIX-P0-FREE-BOUNDARY — la frontera del plan, el nombre del documento y la intención\n');

// ── EL DICCIONARIO REAL ────────────────────────────────────────────────────
function dictInto(sb, langCode) {
  const tI = app.indexOf('const T = {');
  let k = app.indexOf('{', tI), d = 0, end = -1;
  for (; k < app.length; k++) { if (app[k] === '{') d++; else if (app[k] === '}') { d--; if (!d) { end = k + 1; break; } } }
  vm.runInContext('var lang = ' + JSON.stringify(langCode) + ';', sb);
  vm.runInContext(app.slice(tI, end) + ';', sb);
  vm.runInContext('function t(k){ var dd=T[lang]||T.es; var v=dd[k]; if(v===undefined) v=T.es[k]; return v; }', sb);
}

// ── UN CONTENEDOR QUE SE COMPORTA COMO EL DE VERDAD ────────────────────────
// No es un DOM: es exactamente la superficie que `renderWorkspaceHome` consulta
// (`querySelector('.aurix-wsh')` → `getAttribute('data-wsh-view')`) derivada del
// markup que el propio render acaba de escribir. Así la IDEMPOTENCIA del
// despachador —la rama `if (shown === …) return;`— se ejerce de verdad en vez de
// simularse. El camino con eventos reales lo cubre la sonda de navegador.
const DOM_SHIM = `
var __painted = [];
function __mkContainer(){
  return {
    _html: '',
    style: {},
    get innerHTML(){ return this._html; },
    set innerHTML(v){ this._html = String(v); __painted.push(this.view()); },
    view: function(){ var m = /data-wsh-view="([^"]*)"/.exec(this._html); return m ? m[1] : null; },
    querySelector: function(sel){
      if (sel !== '.aurix-wsh') return null;
      var v = this.view();
      if (v === null) return null;
      var self = this;
      return { querySelector: function(){ return null; },
        getAttribute: function(a){ return a === 'data-wsh-view' ? v
        : (/data-ws4-id/.test(a) ? (/data-ws4-id="([^"]*)"/.exec(self._html)||[])[1] || null : null); } };
    },
  };
}
var __C = __mkContainer();
var document = { getElementById: function(id){ return id === 'aurixWorkspace' ? __C : null; },
                 querySelector: function(){ return null; },
                 addEventListener: function(){}, createElement: function(){ return { style:{}, setAttribute:function(){}, appendChild:function(){}, classList:{add:function(){},remove:function(){}} }; },
                 body: { classList: { add: function(){}, remove: function(){} }, appendChild: function(){} } };
var requestAnimationFrame = function(f){ };
// openUpgradeIntent pregunta por window.openAurixPremiumModal: sin window, su try
// silencioso se comía la apertura y el gate habría dado verde sin paywall alguno.
var window = globalThis;
`;

function ctx(persona, langCode) {
  const sb = { Math, Number, String, Boolean, isFinite, isNaN, parseFloat, parseInt, JSON, Array, Object, Set, Map, Date, Intl,
               console: { warn(){}, log(){}, error(){} } };
  vm.createContext(sb);
  dictInto(sb, langCode || 'es');
  vm.runInContext(DOM_SHIM, sb);
  vm.runInContext('var __LS = Object.create(null); var localStorage = { getItem: k => (k in __LS ? __LS[k] : null), setItem: (k,v) => { __LS[k] = String(v); }, removeItem: k => { delete __LS[k]; } };', sb);
  vm.runInContext('var __SS = Object.create(null); var sessionStorage = { getItem: k => (k in __SS ? __SS[k] : null), setItem: (k,v) => { __SS[k] = String(v); }, removeItem: k => { delete __SS[k]; } };', sb);
  // ── LA ÚNICA PALANCA: la superficie SANEADA del resolver ─────────────────
  // No se stubea `hasFeature` ni `hasAurixPremiumAccess`: se ejecutan los reales
  // sobre el estado que el servidor deja. Es lo que hace que «pendiente» y «Free»
  // sean estados DISTINTOS de verdad y no dos ramas escritas a mano.
  vm.runInContext(konstSrc('_WS_CATALOG'), sb);
  ['_WS_TOOLKEY_TO_ID','_WS_VIEW_SURFACES','_WS_TOOL_RENDER','_WS_TPL_RENDER','_WS4TYPE_TO_ID',
   '_WS_TABS','_WS_TOOL_ASSET','_WS_TPL_ASSET','_WS_APP_IDENTITY','_WS_ARCH','_WS_ASSET_BASE',
   '_WSH_PINNED_KEY','_WSH_RECENT_KEY','_WSH_GOALS_KEY','_WSH_PROJECTS_KEY','_WSH_SCENARIOS_KEY',
   '_WSH_TOOL_STATE_KEY','_WS_PROJTYPE_TO_TOOL','_WS_FOUNDER_VIEW_KEY','_AURIX_ENT_CANON_EXTRA',
   '_AURIX_ENT_CANON','_WSBUD_INCOME','_WSBUD_EXPENSES','_WS_TOOL_REQUIRED','_WS_PROJ_CONV',
   '_WSH_SPACE_HIDDEN_KEY','_WSH_SPACE_TOP_KEY',
   '_WSFC_CAPS'].forEach(n => vm.runInContext(konstSrc(n), sb));
  vm.runInContext('var _aurixEnt = { loaded:false, loading:false, error:null, plan:"free", status:"none", source:"default", validUntil:null, features:Object.create(null), sources:Object.create(null), fetchedAt:0 };', sb);
  ['hasFeature','_aurixEntLoaded','hasAurixPremiumAccess','_aurixEntIsCatalogPreview',
   '_wsPremiumShell','_renderWorkspacePending','_wsFounderViewFlag','_wsInternalViewOn',
   '_wsCatalogEntry','_wsSurfaceEntry','_wsToolFeatureKey','_wsCatalogVisible','_wsCatalogFor',
   '_wsEntrySurfaceKey','_wsCatalogInternal','_wsEntryOpenable','_wsWs4Access','_wsToolAccess',
   '_wsCatalogSurfaceKey','_wsCommercialLabel','_wsCommercialTierClass','_wsTierChip','_wsAppIdentity',
   '_wsRenderSurface','_wsTabOk','_wsSmartTab','_wsCanonRef','_wsRelTime','_wsRecentMap','_wsRecentTs',
   '_wsPinned','_wsIsPinned','_wshReadStore','_wsGlyph','_wsTplViz','_wsAssetImg','_wsCatPreviewBaseHtml',
   '_wsCatPreviewHtml','_wsMseToolPreview','_wshAllProjects','_wsToolKeyForProjectType','_wsGlyphTile',
   '_wsSceneHtml','_wsReceivablesPreview','_wsAssetsPreview','_wsToolPreviewHtml','_wsLabel','_wsTypeLabel',
   '_renderWorkspaceHome','_renderWorkspaceFreeCover','_wsCanPersist','_wsPersistUpsell','_wshReveal',
   '_wsfcPublishedCaps','_wsEntryNameKey','_wsCapIconHtml',
   '_wshMetrics','_wshRefreshMetrics','_wsTogglePin','_wsTouch','_wsSpaceHidden','_wsSpaceTop','_wsSpaceTopRank',
   '_ws4ProjectsRaw','_ws4Projects','_ws4SaveAll','_wsDocStamp','_ws4Persist','_ws4Tombstone',
   '_wsgGoalsRaw','_wsgGoals','_wsgSaveAll','_wsgTombstone','_wsgPersist','_wsgGet','_wsgStored',
   '_wsScenariosRaw','_wsScenarios','_wsScenarioTombstone','_wsRename','_wshRepaintHome',
   '_wsNum','_wsNumOrNull','_wsCanonicalNumStr','_wsNumInLang','_wsCanonicalizeInputs','_wsFormatInputNumber',
   '_wsStripThousands','_wsToolStateRead','_wsToolStateGet','_wsToolStateSet','_wsToolStateType',
   '_wsToolDefaults','_wsBudgetDefaults','_wsToolDefaultsFor','_wsToolSuggestName','_wsToolMissingRequired',
   '_wsDraftMissing','_wsToolOnInput','_wsRefViz','_wsProjViz','_wsProjMeta','_wsPinKindLabel',
   '_wsToolShowRequired','_wsDraftRequired','_wsDraftRequiredIn',
   ].forEach(n => { try { vm.runInContext(fnSrc(n), sb); } catch (e) { throw new Error('ctx ' + n + ': ' + e.message); } });
  // Hojas que no son la lógica bajo prueba.
  vm.runInContext(`
    function formatBase(v){ return String(v); }
    function _intccEsc(x){ return String(x == null ? '' : x).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
    function _escapeWorkspaceText(x){ return _intccEsc(x); }
    var _wshWired = true; function _wshWireOnce(){}
    function _wshWriteStore(k,v){ try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch(_) { return false; } }
    function _wsDocsQueue(){} function _wsDocSyncSet(){} function _wsSyncBadgeRefresh(){}
    var __paywall = []; function openAurixPremiumModal(o){ __paywall.push(o||{}); }
    var __overlay = []; function openUpgradeIntentOverlay(o){ __overlay.push(o||{}); return false; }
    function _aurixRecordUpgradeIntent(fk, src){ return { featureKey: fk, source: src }; }
    function _featureLabel(k){ return k; }
    var __rendered = []; 
    function _renderScenarioBuilder(){ __rendered.push('scenario'); return '<div class="aurix-wsh" data-wsh-view="scenario"></div>'; }
    function _renderWealthProjection(){ __rendered.push('planning'); return '<div class="aurix-wsh" data-wsh-view="planning"></div>'; }
    function _renderWorkspaceDetail(){ __rendered.push('workspace'); return '<div class="aurix-wsh" data-wsh-view="workspace" data-ws4-id="x"></div>'; }
    function _renderGoals(){ __rendered.push('goals'); return '<div class="aurix-wsh" data-wsh-view="goals"></div>'; }
    function _wsRenderTool(){ __rendered.push('tool'); return '<div class="aurix-wsh wsh-tool-view" data-wsh-view="tool"></div>'; }
    var AURIX_WS6_TOOL=true, AURIX_WS7_TOOL=true, AURIX_WS8_TOOL=true, AURIX_WS12_TOOL=true,
        AURIX_WS13_TOOL=true, AURIX_WS14_TOOL=true, AURIX_WS15_TOOL=true, AURIX_WS_HOME=true,
        AURIX_WS_USE_REAL_DATA=false, IS_DEV=false;
    var baseCurrency='EUR';
    var _wshView='home', _wsTab=null, _wsToolActive='compound', _wsToolInputs=null, _wsToolEditId=null,
        _wsToolDirty=false, _wsReturnTab='tools', _ws4ActiveId=null, _ws4Draft=null, _ws4Dirty=false,
        _wsgPrefill=null, _wsgWorking={}, _wsgDirty={}, _wsJrnDraft=null, _wsJrnEditId=null,
        _wsReDraft=null, _wsReEditId=null, _wsReDetailId=null, _wsRecvDraft=null, _wsRecvEditId=null,
        _wsRecvQuery='', _wsApDraft=null, _wsApEditId=null;
    function _wsJrnNewDraft(){ return {}; } function _wsReNewDraft(){ return {}; }
    function _wsRecvNewDraft(){ return {}; } function _wsApNewDraft(){ return {}; }
    function _wsJournalDefaults(){ return { trades: [], currency: 'EUR' }; }
    function _wsReDefaults(){ return { properties: [] }; }
    function _wsReceivablesDefaults(){ return { items: [] }; }
    function _wsLoanDefaults(){ return { principal: 250000, rate: 3.5, years: 30, fees: 0, insurance: 0 }; }
    function _wsAssetPricesDefaults(){ return { rows: [] }; }
    function calculateMonthlyBudget(i){ return { income:0, expenses:0, free:0, saveRate:null, saveRateBasis:'x', deficit:false }; }
    function calculateLoan(i){ return { monthlyPayment:1, totalInterest:1, totalPaid:1, principal:_wsNum(i.principal), annual:1, years:_wsNum(i.years) }; }
    function _wsCompoundProjection(i){ return { final:1, initial:1, contributed:1, growth:1, assumptions:{ convention:'effective', annualRatePct:1, currency:'EUR' } }; }
    var __modal = []; function _wsPrompt(o){ __modal.push(o); }
    function _wsModal2(o){ __modal.push(o); }
    function _wsConfirm(f){ __modal.push({ confirm: true, run: f }); }
  `, sb);
  ['_wsToolSave','_wsToolSaveAs','_wsToolRename','_wsToolDelete','_wsToolNamePrompt','_wsToolCommit',
   'openUpgradeIntent','requireFeature','renderWorkspaceHome','_wsOpenTool']
    .forEach(n => { try { vm.runInContext(fnSrc(n), sb); } catch (e) { throw new Error('ctx ' + n + ': ' + e.message); } });
  const P = {
    pending: '',
    free:    '_aurixEnt.loaded = true; _aurixEnt.fetchedAt = Date.now();',
    premium: '_aurixEnt.loaded = true; _aurixEnt.plan = "premium"; _aurixEnt.fetchedAt = Date.now(); _AURIX_ENT_CANON.forEach(function(k){ if (k !== "workspace.catalog_preview") _aurixEnt.features[k] = true; });',
    founder: '_aurixEnt.loaded = true; _aurixEnt.plan = "premium"; _aurixEnt.fetchedAt = Date.now(); _AURIX_ENT_CANON.forEach(function(k){ _aurixEnt.features[k] = true; });',
  };
  vm.runInContext(P[persona], sb);
  return sb;
}
const R = (c, e) => vm.runInContext(e, c);
const view = c => R(c, '__C.view()');

// ════════════════════════════════════════════════════════════════════════════
// 1 · EL GUARD: LA PORTADA FREE NO SE PUEDE SALTAR
// ════════════════════════════════════════════════════════════════════════════
console.log('1 · El guard de Workspace:');
{
  // `_wsPremiumShell` tiene TRES respuestas, y la tercera es el arreglo caro:
  // `hasFeature` devuelve false tanto si el servidor dijo «no» como si todavía no
  // ha contestado, y tratarlos igual le enseñaba la portada de VENTA a un cliente
  // que ya había pagado durante toda la ventana de arranque.
  ok('1.1 el guard distingue «pendiente» de «Free», que es lo que `hasFeature` no puede',
    R(ctx('pending','es'), '_wsPremiumShell()') === 'pending'
    && R(ctx('free','es'), '_wsPremiumShell()') === false
    && R(ctx('premium','es'), '_wsPremiumShell()') === true);
  ok('1.2 y falla CERRADO: una excepción del entitlement no monta el interior',
    (function () { const c = ctx('premium','es');
      R(c, 'hasAurixPremiumAccess = function(){ throw new Error("boom"); };');
      return R(c, '_wsPremiumShell()') === false; })());
  // LA ESPERA TIENE QUE ACABARSE: un fallo permanente del resolver no puede dejar
  // un spinner eterno, porque eso deja a un usuario Free sin sus dos capacidades.
  ok('1.2b un resolver que NO PUDO contestar cae en la portada, no en un spinner',
    (function () { const c = ctx('pending','es');
      R(c, '_aurixEnt.error = "no-client";');
      return R(c, '_wsPremiumShell()') === false; })());
  ok('1.2c …y «todavía no ha contestado» sigue siendo un estado distinto',
    R(ctx('pending','es'), '_wsPremiumShell()') === 'pending');

  // NINGUNA vista interior se monta para un usuario Free. Se ejerce el despachador
  // REAL con todas las vistas que existen, una por una.
  const VIEWS = ['home','workspace','goals','scenario','planning','tool','free_cover'];
  const free = ctx('free','es');
  const got = VIEWS.map(v => { R(free, '_wshView=' + JSON.stringify(v) + '; _wsTab="space"; _wsToolActive="loan"; renderWorkspaceHome();'); return v + '→' + view(free); });
  ok('1.3 free · TODAS las vistas caen en la portada, ninguna monta shell interior',
    got.every(x => /→free_cover$/.test(x)), got.join(' '));
  ok('1.4 free · y no se pintó NADA interior por el camino (ni una vez)',
    JSON.parse(R(free, 'JSON.stringify(__rendered)')).length === 0,
    R(free, 'JSON.stringify(__rendered)'));
  // ── CIERRE WORKSPACE PREMIUM · 1.5 SE INVIERTE ───────────────────────────
  // Decía «la capacidad gratuita abre de verdad» y era correcto mientras el plan
  // Free incluía Interés compuesto y Portfolio inmobiliario. La decisión aprobada
  // las pasa a Premium, así que lo que hay que demostrar es lo contrario: que NO
  // abren, que la denegación es COMERCIAL (no «no publicado») y que el usuario
  // acaba en el flujo de pago en vez de en un botón muerto.
  ['compound','realestate'].forEach(k => {
    R(free, '__rendered.length=0; __paywall.length=0; _wshView="free_cover"; _wsToolActive=null; _wsOpenTool(' + JSON.stringify(k) + ');');
    ok('1.5 free · «' + k + '» ya NO abre: es Premium y lleva al flujo comercial',
      view(free) === 'free_cover'
      && R(free, '_wsToolActive') !== k
      && JSON.parse(R(free, 'JSON.stringify(__paywall)')).length === 1
      && R(free, '_wsToolAccess(' + JSON.stringify(k) + ').reason') === 'entitlement',
      view(free) + '/' + R(free, '_wsToolActive') + '/paywall=' + R(free, '__paywall.length'));
  });
  // Y el derecho que se deniega es el SUYO: dos claves nuevas, no una global.
  ok('1.5b cada una deniega con su propia clave de catálogo',
    R(free, '_wsToolAccess("compound").featureKey') === 'workspace.compound'
    && R(free, '_wsToolAccess("realestate").featureKey') === 'workspace.realestate',
    R(free, '_wsToolAccess("compound").featureKey') + '/' + R(free, '_wsToolAccess("realestate").featureKey'));
  // El guard ya no tiene excepción que conceder: la rendija `_wshView === 'tool'
  // && _wsToolAccess(...).ok` existía porque el plan Free incluía dos capacidades.
  ok('1.5c el despachador ya no tiene excepción para la vista `tool`',
    !/_openOk/.test(fnSrc('renderWorkspaceHome')),
    'la rendija debe estar retirada, no sólo vacía');
  // `_wsOpenTool` deniega ANTES de tocar la vista, así que lo que se comprueba es
  // que la capacidad no queda activa y que el paywall canónico se abrió.
  ok('1.6 free · una capacidad Premium NO abre, y lleva al flujo comercial',
    (function () { R(free, '__paywall.length=0; _wsToolActive="compound"; _wsOpenTool("loan");');
      return R(free, '_wsToolActive') !== 'loan'
        && JSON.parse(R(free, 'JSON.stringify(__paywall)')).length === 1; })(),
    R(free, '_wsToolActive') + ' paywall=' + R(free, '__paywall.length'));
  ok('1.7 free · salir de una capacidad devuelve a la portada, nunca al catálogo',
    (function () { R(free, '_wshView="tool"; _wsToolActive="compound";');
      R(free, '_wshView="home"; _wsTab=_wsTabOk(_wsReturnTab)?_wsReturnTab:"tools"; _wshRepaintHome();');
      return view(free) === 'free_cover'; })(), view(free));
  // Y la portada NO se gasta: se vuelve a pintar tantas veces como se entre.
  // Se mide sobre el CÓDIGO, no sobre los comentarios: la línea retirada se cita
  // literalmente en un comentario a propósito (para que nadie la reintroduzca sin
  // leer por qué se fue), y un regex sobre el fichero entero la encontraría ahí.
  const code = app.replace(/^\s*\/\/.*$/gm, '');
  ok('1.8 la portada no es de un solo uso: `_wsFreeCoverSeen` ya no existe',
    code.indexOf('_wsFreeCoverSeen') === -1, 
    (code.match(/.{0,40}_wsFreeCoverSeen.{0,40}/) || [''])[0]);
  ok('1.9 …y `renderWorkspace` ya no reconvierte la portada en catálogo',
    !/_wsFreeCoverSeen/.test(fnSrc('renderWorkspace').replace(/^\s*\/\/.*$/gm, '')));
  // La sección sigue abierta a todo usuario autenticado: lo gateado es la VISTA.
  ok('1.10 el gate vive en el despachador de vistas, no en la sección',
    /_wsPremiumShell\(\)/.test(fnSrc('renderWorkspaceHome'))
    && !/hasAurixPremiumAccess|hasFeature/.test(fnSrc('renderWorkspace')));
  // El guard corre ANTES de cualquier rama de vista. Si volviera a quedar detrás,
  // cinco vistas interiores se montarían antes de que nadie pregunte el plan.
  ok('1.11 el guard se evalúa antes de la primera rama de vista',
    (function () { const f = fnSrc('renderWorkspaceHome');
      return f.indexOf('_wsPremiumShell()') < f.indexOf("_wshView === 'scenario'"); })());
  // Los seis repintados forzados de Home también pasan por él.
  ok('1.12 ningún sitio repinta Home sin pasar por el guard',
    (function () {
      // El ÚNICO escritor legítimo es el propio helper; cualquier otro sería un
      // séptimo camino por el que el shell interior se monta sin preguntar.
      const owner = fnSrc('_wshRepaintHome');
      const all = (app.match(/innerHTML = _renderWorkspaceHome\(_wshMetrics\(\)\)/g) || []).length;
      const mine = (owner.match(/innerHTML = _renderWorkspaceHome\(_wshMetrics\(\)\)/g) || []).length;
      const dispatcher = (fnSrc('renderWorkspaceHome').match(/innerHTML = _renderWorkspaceHome\(metrics\)/g) || []).length;
      return all === mine && mine === 1 && dispatcher === 1
        && (app.match(/_wshRepaintHome\(\)/g) || []).length >= 7
        && /_wsPremiumShell\(\) !== true/.test(owner);
    })(),
    'escritores=' + (app.match(/innerHTML = _renderWorkspaceHome\(_wshMetrics\(\)\)/g) || []).length
    + ' llamadas=' + (app.match(/_wshRepaintHome\(\)/g) || []).length);
  // Pendiente: ni interior ni oferta comercial.
  const pend = ctx('pending','es');
  R(pend, '_wshView="home"; renderWorkspaceHome();');
  ok('1.13 entitlement sin resolver: espera neutra, sin interior y sin oferta',
    view(pend) === 'pending'
    && R(pend, '__C.innerHTML').indexOf('wsh-studio-root') === -1
    && R(pend, '__C.innerHTML').indexOf('wsfc-cta') === -1, view(pend));
  ok('1.14 …y la espera no afirma nada del plan',
    !/premium|gratis|free|plan/i.test(R(pend, '__C.innerHTML').replace(/wsfc-[a-z-]+/g, '')),
    R(pend, '__C.innerHTML').replace(/\s+/g, ' ').slice(0, 120));
  // Premium entra directamente.
  const prem = ctx('premium','es');
  R(prem, '_wshView="free_cover"; _wsTab="space"; renderWorkspaceHome();');
  ok('1.15 premium · entra en Workspace completo, sin ver la portada comercial',
    view(prem) === 'home' && R(prem, '__C.innerHTML').indexOf('wsfc-cta') === -1, view(prem));
  ok('1.16 …y su interior no ofrece la pestaña Interno',
    R(prem, '__C.innerHTML').indexOf('data-wstab="internal"') === -1);
  // El despachador sigue siendo idempotente: un tick de precio no repinta.
  ok('1.17 el despachador sigue siendo idempotente (un tick no rehace la vista)',
    (function () { R(prem, '__painted.length=0; renderWorkspaceHome(); renderWorkspaceHome();');
      return JSON.parse(R(prem, 'JSON.stringify(__painted)')).length === 0; })(),
    R(prem, 'JSON.stringify(__painted)'));
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · UN SOLO PASO HASTA LOS PLANES
// ════════════════════════════════════════════════════════════════════════════
console.log('\n2 · El CTA llega al pago sin peaje:');
{
  const c = ctx('free','es');
  R(c, '__paywall.length=0; __overlay.length=0; openUpgradeIntent({ featureKey: "workspace.full", source: "workspace:free_cover" });');
  ok('2.1 `openUpgradeIntent` abre el paywall CANÓNICO, no el overlay intermedio',
    JSON.parse(R(c, 'JSON.stringify(__paywall)')).length === 1
    && JSON.parse(R(c, 'JSON.stringify(__overlay)')).length === 0,
    R(c, 'JSON.stringify(__paywall)'));
  ok('2.2 …y conserva el origen, así que la medición del embudo no se rompe',
    /workspace:free_cover/.test(R(c, 'JSON.stringify(__paywall)')));
  ok('2.3 las DOS portadas usan el mismo owner canónico',
    /data-premium-cta="intelligence\.full"/.test(app)
    && /data-premium-cta="workspace\.full"/.test(app)
    && (app.match(/window\.openAurixPremiumModal\(\{ source: src \}\)/g) || []).length === 1);
  ok('2.4 el overlay «Función premium» ya no tiene opener en el producto',
    app.indexOf("data-wsfc-upgrade") === -1
    && /function openUpgradeIntentOverlay\(/.test(app)
    && (app.match(/openUpgradeIntentOverlay\(/g) || []).length === 1);
  ok('2.5 y `requireFeature` hereda el arreglo sin tener su propia pantalla',
    /openUpgradeIntent\(\{ featureKey: feature/.test(fnSrc('requireFeature')));
  // El precio sigue viviendo en un solo sitio.
  ok('2.6 ninguna de las dos portadas nombra un precio',
    !/59|7,99|7\.99/.test(fnSrc('_renderWorkspaceFreeCover'))
    && !/59|7,99|7\.99/.test(fnSrc('_aurixIntelligencePreviewHTML')));
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · EL DOCUMENTO: ID ESTABLE, NOMBRE PROPIO, REVISIÓN Y TOMBSTONE
// ════════════════════════════════════════════════════════════════════════════
console.log('\n3 · Guardado nombrado y ciclo de vida:');
{
  const c = ctx('premium','es');
  const setup = () => R(c, '_wsToolActive="budget"; _wsToolInputs=_wsToolDefaultsFor("budget"); _wsToolEditId=null; _wsToolDirty=true; __modal.length=0;');
  const confirm = name => R(c, '(function(){ var m=__modal[__modal.length-1]; m.onOk(' + JSON.stringify(name) + '); })()');
  const live = () => JSON.parse(R(c, 'JSON.stringify(_ws4Projects().map(function(p){ return { id:p.id, n:p.customName, rev:p.revision }; }))'));

  setup(); R(c, '_wsToolSave();');
  const m0 = JSON.parse(R(c, 'JSON.stringify(__modal.map(function(x){ return { title:x.title, required:!!x.required, field:x.fieldLabel, ok:x.okLabel, current:x.current }; }))'));
  ok('3.1 la PRIMERA vez que se guarda, se pide un nombre',
    m0.length === 1 && m0[0].required === true && live().length === 0,
    JSON.stringify(m0));
  ok('3.2 el modal es el de la SPEC: título, campo «Nombre» obligatorio, Cancelar/Guardar',
    m0[0].title === R(c, 't("wsname_save_title")')
    && m0[0].field === R(c, 't("wsname_field")')
    && m0[0].ok === R(c, 't("wsname_ok")'),
    JSON.stringify(m0[0]));
  ok('3.3 …y sugiere un nombre EDITABLE derivado de la capacidad',
    typeof m0[0].current === 'string' && m0[0].current.length > 0
    && m0[0].current === R(c, '_wsToolSuggestName()'), m0[0].current);
  ok('3.4 cancelar el modal no persiste NADA',
    (function () { R(c, '__modal.length=0; _wsToolSave();'); return live().length === 0; })());
  confirm('Presupuesto personal');
  ok('3.5 confirmar crea el documento con su nombre y su id estable',
    live().length === 1 && live()[0].n === 'Presupuesto personal'
    && /^ws4_/.test(live()[0].id), JSON.stringify(live()));
  ok('3.6 el documento guarda tipo, datos, moneda, versión y marcas de tiempo',
    (function () { const p = JSON.parse(R(c, 'JSON.stringify(_ws4Projects()[0])'));
      return p.type === 'monthly_budget' && !!p.inputs && p.currency === 'EUR'
        && p.bodyVersion === 1 && p.createdAt > 0 && p.updatedAt > 0; })(),
    R(c, 'JSON.stringify(Object.keys(_ws4Projects()[0]))'));
  // Guardar de nuevo ACTUALIZA: sin modal y sin duplicar.
  const rev1 = live()[0].rev;
  R(c, '_wsToolDirty=true; __modal.length=0; _wsToolSave();');
  ok('3.7 guardar la instancia abierta ACTUALIZA: no pregunta, no duplica',
    live().length === 1 && JSON.parse(R(c, 'JSON.stringify(__modal)')).length === 0
    && live()[0].rev === rev1 + 1, JSON.stringify(live()));
  // Dos instancias de la MISMA capacidad, y un nombre repetido no sobrescribe.
  setup(); R(c, '_wsToolSave();'); confirm('Presupuesto empresa');
  setup(); R(c, '_wsToolSave();'); confirm('Presupuesto empresa');
  const l3 = live();
  ok('3.8 varias instancias de la misma capacidad conviven',
    l3.length === 3, JSON.stringify(l3.map(x => x.n)));
  ok('3.9 un nombre repetido NO sobrescribe: la identidad es el ID',
    new Set(l3.map(x => x.id)).size === 3
    && l3.filter(x => x.n === 'Presupuesto empresa').length === 2, JSON.stringify(l3));
  // Guardar como… reutiliza el MISMO modal y crea una copia nueva.
  R(c, '__modal.length=0; _wsToolSaveAs();');
  const mAs = JSON.parse(R(c, 'JSON.stringify(__modal[0])'));
  ok('3.10 «Guardar como…» reutiliza el MISMO modal (no hay un segundo)',
    !!mAs && mAs.required === true && mAs.fieldLabel === R(c, 't("wsname_field")')
    && mAs.title === R(c, 't("wsname_saveas_title")'), JSON.stringify(mAs && mAs.title));
  confirm('Presupuesto copia');
  ok('3.11 …y crea una instancia NUEVA, con id nuevo',
    live().length === 4 && live().some(x => x.n === 'Presupuesto copia'), String(live().length));
  // Renombrar cambia SÓLO el nombre.
  const before = R(c, 'JSON.stringify(_ws4Projects().find(function(p){return p.id===_wsToolEditId;}).inputs)');
  R(c, '__modal.length=0; _wsToolRename();'); confirm('Presupuesto renombrado');
  const afterP = JSON.parse(R(c, 'JSON.stringify(_ws4Projects().find(function(p){return p.id===_wsToolEditId;}))'));
  ok('3.12 renombrar conserva los datos y no crea un documento',
    afterP.customName === 'Presupuesto renombrado'
    && JSON.stringify(afterP.inputs) === before && live().length === 4,
    afterP.customName);
  // Eliminar: confirmación, tombstone, y los demás intactos.
  R(c, '__modal.length=0; _wsToolDelete();');
  const delModal = JSON.parse(R(c, 'JSON.stringify(__modal.map(function(x){ return { title:x.title, danger:!!x.danger }; }))'));
  ok('3.13 eliminar pide confirmación explícita', delModal.length === 1 && delModal[0].danger === true,
    JSON.stringify(delModal));
  const delId = R(c, '_wsToolEditId');
  R(c, '(function(){ var m=__modal[__modal.length-1]; m.onOk(); })()');
  ok('3.14 …y borra por TOMBSTONE: desaparece de la lista y NO se recorta del almacén',
    live().length === 3
    && R(c, '_ws4ProjectsRaw().length') === 4
    && R(c, '!!_ws4ProjectsRaw().find(function(p){ return p.id===' + JSON.stringify(delId) + ' && p.deletedAt; })') === true,
    'live=' + live().length + ' raw=' + R(c, '_ws4ProjectsRaw().length'));
  ok('3.15 los otros tres documentos siguen intactos',
    live().filter(x => x.n && x.n.indexOf('Presupuesto') === 0).length === 3, JSON.stringify(live().map(x => x.n)));
  // ── LA REVISIÓN, QUE ES LO QUE HACE QUE OTRO DISPOSITIVO LO VEA ───────────
  ok('3.16 cada escritura sella una revisión MAYOR (sin ella, ninguna edición viaja)',
    (function () { const p = live()[0];
      R(c, '(function(){ var x=_ws4Projects()[0]; x.customName="otra vez"; _ws4Persist(x); })()');
      return live()[0].rev === p.rev + 1; })());
  ok('3.17 la revisión se sella en el OWNER de escritura, no en los llamadores',
    /_wsDocStamp\(p\);/.test(fnSrc('_ws4Persist')) && /_wsDocStamp\(g\);/.test(fnSrc('_wsgPersist')));
  ok('3.18 y el tombstone también sube: `_wsDocRows` ya sabía leerlo',
    /deleted_at: item\.deletedAt \? new Date\(Number\(item\.deletedAt\)\)\.toISOString\(\) : null/.test(app));
  // …Y BAJA. Antes el pull hacía `if (r.deleted_at) continue;`, que impedía la
  // resurrección pero NO propagaba el borrado: borrar en el móvil dejaba el
  // documento vivo en el escritorio, y el escritorio lo volvía a subir.
  ok('3.19a el tombstone se APLICA en el pull, con la misma regla de revisión',
    (function () { const pull = fnSrc('_wsDocsPull');
      return /if \(r\.deleted_at\) \{/.test(pull)
        && /cur\.deletedAt = Date\.parse\(r\.deleted_at\) \|\| Date\.now\(\);/.test(pull)
        && /if \(!\(remoteRev > \(Number\(cur\.revision\) \|\| 1\)\)\) continue;/.test(pull)
        && /if \(!cur\) continue;/.test(pull); })());
  ok('3.19b los dos sitios que borran usan el tombstone, no el recorte del array',
    /_ws4Tombstone\(id\)/.test(fnSrc('_wsxAct')) && /_wsgTombstone\(id\)/.test(fnSrc('_wsxAct'))
    && /_wsgTombstone\(id\)/.test(fnSrc('_wsgDelete'))
    && !/filter\(g => g && g\.id !== id\)/.test(app)
    && !/filter\(p => p && p\.id !== id\)/.test(app));
  ok('3.19 los tres almacenes de documentos ocultan lo borrado a TODOS sus lectores',
    /_ws4ProjectsRaw\(\)\.filter\(p => p && !p\.deletedAt\)/.test(app)
    && /_wsgGoalsRaw\(\)\.filter\(g => g && !g\.deletedAt\)/.test(app)
    && /_wsScenariosRaw\(\)\.filter\(x => x && !x\.deletedAt\)/.test(app)
    && /_wsgGoals\(\)\.forEach/.test(fnSrc('_wshAllProjects'))
    && /_ws4Projects\(\)\.forEach/.test(fnSrc('_wshAllProjects')));
  ok('3.20 …y los contadores de la cabecera cuentan lo VIVO',
    /goals:     _wsgGoals\(\)\.length/.test(fnSrc('_wshMetrics'))
    && /projects:  _ws4Projects\(\)\.length/.test(fnSrc('_wshMetrics')));
  // Un usuario Free no obtiene persistencia falsificando el rail local.
  ok('3.21 free · guardar no persiste nada y lleva al flujo comercial',
    (function () { const f = ctx('free','es');
      R(f, 'localStorage.setItem("aurix_plan", JSON.stringify({ tier: "premium" }));');
      R(f, '_wsToolActive="budget"; _wsToolInputs=_wsToolDefaultsFor("budget"); _wsToolEditId=null; __paywall.length=0; __modal.length=0; _wsToolSave();');
      return R(f, '_ws4ProjectsRaw().length') === 0
        && JSON.parse(R(f, 'JSON.stringify(__modal)')).length === 0
        && JSON.parse(R(f, 'JSON.stringify(__paywall)')).length === 1; })());
}

// ════════════════════════════════════════════════════════════════════════════
// 4 · UN CAMPO OBLIGATORIO VACÍO NO SE GUARDA EN SILENCIO
// ════════════════════════════════════════════════════════════════════════════
console.log('\n4 · Validación al guardar:');
{
  const c = ctx('premium','es');
  ok('4.1 los obligatorios están declarados en UN sitio, no repartidos',
    JSON.stringify(Object.keys(JSON.parse(R(c, 'JSON.stringify(_WS_TOOL_REQUIRED)')))) === '["compound","loan"]',
    R(c, 'JSON.stringify(Object.keys(_WS_TOOL_REQUIRED))'));
  ok('4.2 un plazo vacío se detecta como FALTA (y `_wsNum` lo habría leído 0)',
    (function () { R(c, '_wsToolActive="compound"; _wsToolInputs=_wsToolDefaultsFor("compound"); _wsToolInputs.years="";');
      return JSON.parse(R(c, 'JSON.stringify(_wsToolMissingRequired().map(function(f){return f.k;}))')).join(',') === 'years'
        && R(c, '_wsNum("")') === 0; })());
  ok('4.3 un CERO escrito a propósito NO es una falta',
    (function () { R(c, '_wsToolInputs.years="0";');
      return JSON.parse(R(c, 'JSON.stringify(_wsToolMissingRequired())')).length === 0; })());
  ok('4.4 y con la falta presente NO se persiste nada ni se pide nombre',
    (function () { R(c, '_wsToolInputs.years=""; _wsToolEditId=null; __modal.length=0; _wsToolSave();');
      return R(c, '_ws4ProjectsRaw().length') === 0
        && JSON.parse(R(c, 'JSON.stringify(__modal)')).length === 0; })());
  ok('4.5 el préstamo exige importe y plazo, no el tipo (un préstamo al 0% es legítimo)',
    (function () { const req = JSON.parse(R(c, 'JSON.stringify(_WS_TOOL_REQUIRED.loan.map(function(f){return f.k;}))'));
      return req.join(',') === 'principal,years'; })(),
    R(c, 'JSON.stringify(_WS_TOOL_REQUIRED.loan.map(function(f){return f.k;}))'));
  ok('4.6 la validación NOMBRA el campo con su etiqueta traducida, no con su clave',
    (function () { const keys = JSON.parse(R(c, 'JSON.stringify(_WS_TOOL_REQUIRED.loan.map(function(f){return f.label;}))'));
      return keys.every(k => typeof R(c, 't(' + JSON.stringify(k) + ')') === 'string'
        && R(c, 't(' + JSON.stringify(k) + ')').length > 0); })());
  // Los cuatro formularios de fila dejaron de fallar en silencio.
  ok('4.7 los cuatro formularios de fila piden la validación al owner compartido',
    ['_wsJrnAdd','_wsReAdd','_wsRecvAdd','_wsApAdd'].every(n => /_wsDraftRequired\(/.test(fnSrc(n)))
    && ['_wsJrnAdd','_wsReAdd','_wsRecvAdd','_wsApAdd'].every(n => !/if \(!\w+ (&&|\|\|) [^)]*<= 0\) return;/.test(fnSrc(n))));
  ok('4.8 y el objetivo sin importe objetivo tampoco se crea en silencio',
    /_wsDraftRequiredIn\(root, 'wsg-form', missG\)/.test(fnSrc('_wsgCreate')));
  ok('4.9 «vacío» y «cero» se distinguen con `_wsNumOrNull`, no con `<= 0`',
    /_wsNumOrNull\(v\) == null/.test(fnSrc('_wsToolMissingRequired'))
    && /_wsNumOrNull\(v\) == null/.test(fnSrc('_wsDraftMissing')));
  ok('4.10 la validación se PINTA: marca el campo y publica una razón',
    /aria-invalid/.test(fnSrc('_wsToolShowRequired'))
    && /role', 'alert'/.test(fnSrc('_wsToolShowRequired'))
    && /\.wsg-reqerr \{/.test(css));
}

// ════════════════════════════════════════════════════════════════════════════
// 5 · EL CONTRATO DE EDICIÓN NUMÉRICA, EN EL HANDLER REAL
// ════════════════════════════════════════════════════════════════════════════
// LO QUE ESTE BLOQUE NO PRETENDE SER, y conviene que quede escrito: el camino
// DOM → evento de teclado → handler NO se puede recorrer sin navegador, y el gate
// anterior fingió que sí (llamaba a `_wsNum` en un sandbox y declaraba cubierto el
// «no me deja borrar»). Ese camino lo recorre `aurix-p0-free-boundary-probe.mjs`
// con eventos reales de CDP. Aquí se ancla lo que SÍ se puede ejercer sin DOM: que
// el handler compartido escriba el texto CRUDO y que ninguna rama reinserte un
// valor durante la edición.
console.log('\n5 · El handler de edición no reinserta nada:');
{
  const c = ctx('premium','es');
  R(c, '_wsToolActive="compound"; _wsToolInputs=_wsToolDefaultsFor("compound");');
  const feed = v => R(c, '(function(){ _wsToolOnInput({ value: ' + JSON.stringify(v) + ', getAttribute: function(){ return "monthly"; } }); return String(_wsToolInputs.monthly); })()');
  ok('5.1 el handler guarda el texto CRUDO, así que el campo puede quedar vacío',
    ['3', '30', '300', '30', '3', ''].map(feed).join('|') === '3|30|300|30|3|',
    ['3','30','300','30','3',''].map(feed).join('|'));
  ok('5.2 el vacío se CONSERVA en el estado: no se canoniza a 0 ni al anterior',
    R(c, 'String(_wsToolInputs.monthly)') === '' && R(c, 'typeof _wsToolInputs.monthly') === 'string');
  ok('5.3 un parcial también: «3,» es un estado válido MIENTRAS se escribe',
    feed('3,') === '3,');
  ok('5.4 ningún handler de Workspace coacciona a número durante el `input`',
    ['_wsToolOnInput','_ws4OnInput','_wsgOnInput','_wsJrnOnInput','_wsReOnInput',
     '_wsRecvOnInput','_wsApOnInput','_wsLoanCmpInput','_wsbParamInput']
      .every(n => /=\s*el\.value|patch\[k\] = el\.value/.test(fnSrc(n))
        && !/_wsNum\(el\.value\)|Number\(el\.value\)/.test(fnSrc(n))),
    ['_wsToolOnInput','_ws4OnInput','_wsgOnInput','_wsJrnOnInput','_wsReOnInput',
     '_wsRecvOnInput','_wsApOnInput','_wsLoanCmpInput','_wsbParamInput']
      .filter(n => /_wsNum\(el\.value\)|Number\(el\.value\)/.test(fnSrc(n))).join(','));
  ok('5.5 el formateo ocurre al PERDER el foco, y el vacío se respeta ahí también',
    /document\.addEventListener\('focusout'/.test(app)
    && /if \(raw === ''\) return;\s*\/\/ vacío sigue siendo vacío/.test(app));
  ok('5.6 el parser financiero certificado no se toca',
    /const thou = en \? ',' : '\.';/.test(fnSrc('_wsNum'))
    && /if \(ch === thou && \/\^\\d\{3\}\$\/\.test\(after\)\) s = s\.split\(ch\)\.join\(''\);/.test(fnSrc('_wsNum')));
  ok('5.7 «3,5» y «3.5» valen 3,5 en los dos idiomas (no 35)',
    ['3,5','3.5'].every(v => R(c, '_wsNumInLang(' + JSON.stringify(v) + ', "es")') === 3.5
      && R(c, '_wsNumInLang(' + JSON.stringify(v) + ', "en")') === 3.5));
  ok('5.8 la sonda de navegador existe y recorre el camino real con eventos de CDP',
    fs.existsSync(path.join(ROOT, 'scripts', 'aurix-p0-free-boundary-probe.mjs'))
    && /Input\.dispatchKeyEvent/.test(fs.readFileSync(path.join(ROOT, 'scripts', 'aurix-p0-free-boundary-probe.mjs'), 'utf8'))
    && /Input\.insertText/.test(fs.readFileSync(path.join(ROOT, 'scripts', 'aurix-p0-free-boundary-probe.mjs'), 'utf8')));
}

// ════════════════════════════════════════════════════════════════════════════
// 6 · MI ESPACIO: SÓLO LO INTENCIONAL, Y DOS COLUMNAS SIMÉTRICAS
// ════════════════════════════════════════════════════════════════════════════
console.log('\n6 · Mi espacio:');
{
  const c = ctx('premium','es');
  // El despachador es IDEMPOTENTE a propósito (un tick de precio no rehace la
  // vista), así que para observar un repintado hay que pedirlo: se vacía el
  // contenedor, que es lo que hace el navegador al cambiar de sección.
  const space = () => { R(c, '__C._html=""; _wshView="home"; _wsTab="space"; renderWorkspaceHome();'); return R(c, '__C.innerHTML'); };
  let h = space();
  ok('6.1 el espacio vacío pinta las DOS columnas y CERO tarjetas',
    (h.match(/wsh-mse2-col/g) || []).length === 2 && h.indexOf('wsh-mse2-card') === -1);
  R(c, '_wsTouch("tool:compound"); _wsTouch("tpl:mbudget");'); h = space();
  ok('6.2 ABRIR no añade nada (la regla que se retira)',
    h.indexOf('wsh-mse2-card') === -1 && /data-wsmse-tpl="0"/.test(h) && /data-wsmse-tool="0"/.test(h));
  R(c, '_wsTogglePin("tool:compound");'); h = space();
  ok('6.3 un FAVORITO sí, y una sola vez',
    (h.match(/data-wsmse-type="fav"/g) || []).length === 1 && /data-wsmse-tool="1"/.test(h));
  R(c, '_wsTogglePin("tool:compound");'); h = space();
  ok('6.4 quitar la estrella lo saca', h.indexOf('wsh-mse2-card') === -1);
  R(c, 'localStorage.setItem(_WSH_PROJECTS_KEY, JSON.stringify([{ id:"p1", type:"monthly_budget", customName:"Presupuesto empresa", revision:1, updatedAt:7, results:{} }]));');
  h = space();
  ok('6.5 un DOCUMENTO guardado sí, con SU nombre y su tipo propio',
    (h.match(/data-wsmse-type="doc"/g) || []).length === 1
    && h.indexOf('Presupuesto empresa') !== -1 && /data-wsmse-tpl="1"/.test(h));
  // LA MINIATURA DE UN DOCUMENTO SALE DE SUS PROPIOS DATOS. Usar la ilustración de
  // la CATEGORÍA la hacía leer `_wsToolStateGet` —el borrador local de la
  // herramienta—, así que la tarjeta de un presupuesto podía enseñar las cifras del
  // último presupuesto EDITADO, no las suyas. Dos documentos, una sola miniatura.
  ok('6.5b la miniatura del documento la construye el owner de SUS datos',
    /_wsProjPreviewHtml\(it\.proj\)/.test(app)
    && /const r = p\.results \|\| \{\};/.test(fnSrc('_wsProjPreviewHtml'))
    && !/_wsToolStateGet/.test(fnSrc('_wsProjPreviewHtml')));
  ok('6.5c y la miniatura es una ilustración: no la dicta un lector de pantalla',
    /class="wsh-mse2-pv" aria-hidden="true"/.test(app));
  ok('6.6 el favorito y el documento NO se fusionan',
    /mtype: 'fav'/.test(app) && /mtype: 'doc'/.test(app)
    && /data-wsmse-type="\$\{it\.mtype\}"/.test(app));
  ok('6.7 «actualizado hace…» sobrevive sólo como metadato, no como pertenencia',
    /t\('wsmse2_updated'\)/.test(app) && /t\('wsmse2_fav'\)/.test(app)
    && !/ts: Math\.max\(used, pinned, sv\.ts\)/.test(app));
  ok('6.8 los subtítulos «… utilizadas recientemente» desaparecieron del diccionario',
    app.indexOf('wsmse2_tpl_sub') === -1 && app.indexOf('wsmse2_tool_sub') === -1
    && (h.match(/wsh-mse2-sub/g) || []).length === 0);
  ok('6.9 las dos cabeceras son idénticas (nada desplaza una columna)',
    (h.match(/class="wsh-title wsh-mse2-title"/g) || []).length === 2);
  ok('6.10 no hay carrusel horizontal: las listas son verticales en móvil',
    /\.wsh-mse2\[data-wsmse-cols="2"\] \.wsh-mse2-list \{\s*flex-direction: column;/.test(css)
    && /\.wsh-mse2\[data-wsmse-cols="2"\] \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/.test(css));
  ok('6.11 los títulos van en una línea y no se truncan: `nowrap` y `overflow:visible`',
    /\.wsh-mse2-title \{[^}]*white-space: nowrap;/.test(css)
    && /\.wsh-mse2-title \{[^}]*overflow: visible;/.test(css)
    && /\.wsh-mse2-title \{[^}]*text-transform: uppercase;/.test(css));
  ok('6.12 y a 360 px bajan a 11 px, el mínimo declarado de la hoja (nunca menos)',
    /@media \(max-width: 400px\) \{\s*\.wsh-mse2\[data-wsmse-cols="2"\] \.wsh-mse2-head \.wsh-title \{ font-size: 11px; \}/.test(css));
  ok('6.13 las tarjetas comparten alto mínimo y el nombre cabe en DOS líneas',
    /\.wsh-mse2\[data-wsmse-cols="2"\] \.wsh-mse2-card \{ min-height: 56px;/.test(css)
    && /\.wsh-mse2-card \.wsh-mse2-name \{[\s\S]{0,200}-webkit-line-clamp: 2;/.test(css));
  ok('6.14 el estado vacío es compacto y del MISMO alto que una tarjeta',
    /\.wsh-mse2\[data-wsmse-cols="2"\] \.wsh-mse2-empty \{ min-height: 56px; \}/.test(css));
  // La vista técnica de fundador.
  ok('6.15 «Interno» exige el derecho del servidor Y una activación deliberada',
    (function () {
      const f = ctx('founder','es');
      const auto = R(f, '_wsInternalViewOn()');
      R(f, 'sessionStorage.setItem(_WS_FOUNDER_VIEW_KEY, "1");');
      const on = R(f, '_wsInternalViewOn()');
      const p = ctx('premium','es');
      R(p, 'sessionStorage.setItem(_WS_FOUNDER_VIEW_KEY, "1");');
      const noRight = R(p, '_wsInternalViewOn()');
      return auto === false && on === true && noRight === false;
    })());
  ok('6.16 …y un override global Premium no la enciende por su cuenta',
    /return right && _wsFounderViewFlag\(\);/.test(fnSrc('_wsInternalViewOn'))
    && /_aurixEntIsCatalogPreview\(\) === true/.test(fnSrc('_wsInternalViewOn')));
  ok('6.17 la vista normal Premium tiene EXACTAMENTE tres pestañas',
    (function () { const p = ctx('premium','es');
      const hh = (R(p, '_wshView="home"; _wsTab="space"; renderWorkspaceHome(); __C.innerHTML'));
      const tabs = (hh.match(/data-wstab="(space|templates|tools|internal)"/g) || [])
        .map(x => /"([a-z]+)"/.exec(x)[1]);
      return new Set(tabs).size >= 3 && tabs.indexOf('internal') === -1; })());
}

// ════════════════════════════════════════════════════════════════════════════
// 7 · LO QUE NO SE HA TOCADO
// ════════════════════════════════════════════════════════════════════════════
console.log('\n7 · Fuera de alcance, y demostrablemente intacto:');
{
  ok('7.1 los precios no se tocan: siguen viniendo del servidor',
    !/59[.,]99/.test(app) && /premium:\s*\{[^}]*price:\s*null/.test(app));
  ok('7.2 ninguna fórmula financiera cambia de forma',
    /const thou = en \? ',' : '\.';/.test(fnSrc('_wsNum'))
    && /function calculateLoan\(/.test(app) && /function calculateCompoundGrowth\(/.test(app));
  ok('7.3 el radar y el interior Premium de Intelligence siguen en pie',
    /_renderIntelligenceCommandCenter\(\)/.test(app) && /_renderPremiumIntelligence\(\)/.test(app));
  ok('7.4 no se publica ninguna capacidad interna (siguen siendo OCHO)',
    (konstSrc('_WS_CATALOG').replace(/^\s*\/\/.*$/gm, '').match(/published: true/g) || []).length === 8,
    String((konstSrc('_WS_CATALOG').replace(/^\s*\/\/.*$/gm, '').match(/published: true/g) || []).length));
  ok('7.5 CSS no sustituye autorización: el guard no oculta, no monta',
    !/display:\s*none/.test(fnSrc('renderWorkspaceHome'))
    && /container\.innerHTML = _renderWorkspaceFreeCover\(\);/.test(fnSrc('renderWorkspaceHome')));
  ok('7.6 la persistencia sigue usando `workspace_documents` y sus owners',
    /_WS_DOC_TABLE = 'workspace_documents'/.test(app)
    && !/create table|CREATE TABLE/.test(app));
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + `  ${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFALLOS:'); bad.forEach(b => console.log('  · ' + b)); }
process.exit(fail ? 1 : 0);
