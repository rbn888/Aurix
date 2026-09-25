'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-WORKSPACE-ACCESS-TRUTH — SPEC DE CIERRE · Bloques A y B
// ════════════════════════════════════════════════════════════════════════════
// Este gate NO lee regex sobre app.js para decidir si el acceso es correcto: monta
// el catálogo y el render REALES en tres personas (Free, Premium, Founder), pinta
// el HTML de Workspace con las funciones desplegadas, extrae CADA tarjeta del
// markup y resuelve su DESTINO por el mismo despachador que corre en producción.
//
// Es la lección que este proyecto ya ha pagado tres veces: un assert que es un
// regex pasa en verde mientras el `if` que lo usa hace lo contrario. Aquí una
// tarjeta que no abra, que abra lo que no debe, o que ofrezca «Abrir» y luego
// deniegue, sale como FALLO con su id.
//
// LOS CUATRO DEFECTOS QUE ORIGINAN ESTE FICHERO, TODOS VERIFICADOS EN VIVO:
//  1 · `_AURIX_ENT_CANON` era una lista LITERAL de cuatro claves y el bucle de
//      carga copia sólo las claves de esa lista. Al publicar las cinco capacidades
//      Premium, `hasFeature('workspace.budget')` devolvía false para TODA cuenta
//      premium: el catálogo ofrecía Presupuesto y el gate lo negaba.
//  2 · `_wsCatalogVisible` dejaba pasar lo NO publicado a la cuenta con
//      `workspace.catalog_preview`, así que el inventario interno y las tarjetas
//      «Próximamente» se mezclaban con el producto, y Objetivos salía DOS VECES.
//  3 · Los tres controles de la portada Free no estaban en el `closest()` del
//      despachador: botones muertos.
//  4 · `_ws4OpenOrCreate` abría la hoja legacy SIN comprobar publicación ni
//      derecho — la sexta puerta, y la última sin gate.
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
function konstSrc(name){ const m=new RegExp('^const '+name+'\\s*=','m').exec(app);
  if(!m) throw new Error('missing const '+name); const i=m.index;
  let k=i, depth=0, started=false; for(;k<app.length;k++){ const c=app[k]; if(c==='('||c==='{'||c==='[') {depth++;started=true;} else if(c===')'||c==='}'||c===']') depth--; else if(c===';'&&(!started||depth===0)) { k++; break; } }
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c,info){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(info?'  ['+info+']':''));} }

console.log('AURIX-WORKSPACE-ACCESS-TRUTH — catálogo, acceso y destino real de cada tarjeta\n');

// ── EL DICCIONARIO REAL, porque un nombre vacío es un defecto visible ───────
// Se extrae el bloque de claves del idioma pedido y se evalúa: `t()` tiene que
// devolver los MISMOS literales que ve el usuario, no un stub que siempre acierta.
function dictFor(langCode) {
  const idx = langCode === 'en' ? 1 : 0;
  const occ = [];
  let i = app.indexOf('\n  es: {');
  const starts = [];
  ['\n  es: {', '\n  en: {'].forEach(m => { const k = app.indexOf(m); if (k >= 0) starts.push(k); });
  // El diccionario vive en `const T = { es: {...}, en: {...} }`. Se localiza por su
  // declaración y se evalúa entero: es la única forma de que `t()` sea el de verdad.
  const tI = app.indexOf('const T = {');
  if (tI < 0) throw new Error('T dictionary not found');
  let k = app.indexOf('{', tI), d = 0, end = -1;
  for (; k < app.length; k++) { if (app[k] === '{') d++; else if (app[k] === '}') { d--; if (!d) { end = k + 1; break; } } }
  const sb = { Math, Number, String, Object, Array, JSON, Date, Intl, console: { warn(){}, error(){} } };
  vm.createContext(sb);
  vm.runInContext('var lang = ' + JSON.stringify(langCode) + ';', sb);
  vm.runInContext(app.slice(tI, end) + ';', sb);
  vm.runInContext('function t(k){ var d=T[lang]||T.es; var v=d[k]; if(v===undefined) v=T.es[k]; return v; }', sb);
  return sb;
}

// ── LAS TRES PERSONAS ──────────────────────────────────────────────────────
// `hasFeature` es la ÚNICA palanca: se le da exactamente lo que el resolver daría.
//   free     → nada
//   premium  → las claves que `plan_features` concede a premium (derivadas del
//              catálogo, no escritas a mano) + intelligence.full + premium.settings
//   founder  → lo de premium MÁS workspace.catalog_preview
// ── OCHO → NUEVE (2026-09-25) ─────────────────────────────────────────────
// El COMPARADOR DE RENTABILIDAD se publica como novena capacidad: se mudó de
// Intelligence y su derecho ya existe en la base (`workspace.comparator`,
// db/workspace_comparator_1.sql, aplicado y verificado). El número se mantiene
// FIJADO —una capacidad que aparece sin que nadie la decida es justo lo que
// esto caza— y sube porque se decidió, no porque estorbara.
const N_CAPS = 9;

const CAT_KEYS = (function () {
  // ── SE LEE EL CÓDIGO, NO LOS COMENTARIOS ────────────────────────────────
  // Esto extraía las claves con una expresión sobre el TEXTO del catálogo, y
  // un comentario que documentaba una clave futura («cuando el SQL esté
  // aplicado, esta entrada pasa a featureKey: 'workspace.comparator'») entraba
  // como si fuera una entrada real: el harness exigía que el cliente conociera
  // una clave que nadie declara todavía. Un instrumento al que se le puede
  // cambiar el veredicto escribiendo un comentario no mide el catálogo.
  const m = konstSrc('_WS_CATALOG')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  return Array.from(new Set((m.match(/featureKey:\s*'([\w.]+)'/g) || []).map(x => x.replace(/.*'([\w.]+)'.*/, '$1'))));
})();
function ctx(persona, langCode) {
  const sb = dictFor(langCode);
  const granted = persona === 'free' ? []
    : CAT_KEYS.concat(['intelligence.full', 'premium.settings'])
        .concat(persona === 'founder' ? ['workspace.catalog_preview'] : []);
  sb.__granted = granted;
  vm.runInContext('function hasFeature(k){ return __granted.indexOf(k) !== -1; }', sb);
  vm.runInContext('function hasAurixPremiumAccess(){ return hasFeature("intelligence.full"); }', sb);
  vm.runInContext('function isPremiumTier(){ return ' + (persona === 'free' ? 'false' : 'true') + '; }', sb);
  vm.runInContext('var __upsell = []; function openUpgradeIntent(o){ __upsell.push(o); return false; }', sb);
  // Almacenamiento local real (en memoria) para que fijados y recientes se comporten.
  vm.runInContext('var __LS = Object.create(null); var localStorage = { getItem: k => (k in __LS ? __LS[k] : null), setItem: (k,v) => { __LS[k] = String(v); }, removeItem: k => { delete __LS[k]; } };', sb);
  // `sessionStorage` real (en memoria): la vista técnica de fundador es una
  // activación DELIBERADA de sesión, así que el gate tiene que poder ejercerla.
  vm.runInContext('var __SS = Object.create(null); var sessionStorage = { getItem: k => (k in __SS ? __SS[k] : null), setItem: (k,v) => { __SS[k] = String(v); }, removeItem: k => { delete __SS[k]; } };', sb);
  vm.runInContext('var _wshView = "home", _wsTab = null, _wsToolActive = null, _wsToolInputs = null, _wsToolEditId = null, _wsToolDirty = false, _wsReturnTab = "tools", _ws4ActiveId = null, _ws4Draft = null, _ws4Dirty = false, _wsFreeCoverSeen = false, _wsgPrefill = null, _wsJrnDraft = null, _wsJrnEditId = null, _wsReDraft = null, _wsReEditId = null, _wsReDetailId = null, _wsRecvDraft = null, _wsRecvEditId = null, _wsRecvQuery = "", _wsApDraft = null, _wsApEditId = null;', sb);
  vm.runInContext('var __opened = []; function renderWorkspaceHome(){ __opened.push("render:" + _wshView); }', sb);
  vm.runInContext('function formatBase(v){ return String(v); }', sb);
  vm.runInContext('function _intccEsc(x){ return String(x == null ? "" : x).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c])); }', sb);
  vm.runInContext('function _escapeWorkspaceText(x){ return _intccEsc(x); }', sb);
  ['_WS_CATALOG','_WS_TOOLKEY_TO_ID','_WS_VIEW_SURFACES','_WS_TOOL_RENDER','_WS_TPL_RENDER',
   '_WS4TYPE_TO_ID','_WS_TABS','_WS_TOOL_ASSET','_WS_TPL_ASSET','_WS_APP_IDENTITY','_WS_ARCH',
   '_WS_ASSET_BASE','_WSH_PINNED_KEY','_WSH_RECENT_KEY','_WSH_GOALS_KEY','_WSH_PROJECTS_KEY',
   '_WSFC_CAPS','_WS_SURFACE_ICON_EXTRA','_WS_TOOL_COVER',
   '_WSH_SCENARIOS_KEY','_WSH_TOOL_STATE_KEY','_WS_PROJTYPE_TO_TOOL',
   '_WS_FOUNDER_VIEW_KEY'].forEach(n => vm.runInContext(konstSrc(n), sb));
  ['_wsCatalogEntry','_wsSurfaceEntry','_wsToolFeatureKey','_wsCatalogVisible','_wsCatalogFor',
   '_wsEntrySurfaceKey','_wsCatalogInternal','_wsEntryOpenable','_wsWs4Access','_wsToolAccess','_wsCatalogSurfaceKey',
   '_aurixEntIsCatalogPreview',
   '_wsCommercialLabel','_wsCommercialTierClass','_wsTierChip','_wsAppIdentity','_wsRenderSurface',
   '_wsTabOk','_wsSmartTab','_wsCanonRef','_wsRelTime','_wsRecentMap','_wsRecentTs','_wsPinned',
   '_wsIsPinned','_wshReadStore','_wsGlyph','_wsTplViz','_wsAssetImg','_wsCatPreviewBaseHtml',
   '_wsCatPreviewHtml','_wsMseToolPreview','_wshAllProjects','_wsToolKeyForProjectType',
   '_wsGlyphTile','_wsSceneHtml','_wsReceivablesPreview','_wsAssetsPreview','_wsToolPreviewHtml',
   '_wsLabel','_wsTypeLabel','_renderWorkspaceHome','_renderWorkspaceFreeCover',
   '_wsfcPublishedCaps','_wsEntryNameKey','_wsCapIconHtml','_wsSurfaceIcon','_wsBudgetCurrentPeriod',
   // La portada ilustrada de las tres herramientas: se ejecuta la REAL, no un
   // stub, porque es la que decide qué pinta cada tarjeta del catálogo.
   '_wsToolCoverHtml',
   '_wsCanPersist','_wsPersistUpsell','_wsOpenSurface','_wsTogglePin','_wsTouch',
   // SPEC P0 — el guard de vista, la vista técnica de fundador y el contrato de
   // documento (revisión + tombstone). Se ejecutan los REALES, no un stub.
   '_wsPremiumShell','_renderWorkspacePending','_wsFounderViewFlag','_wsInternalViewOn',
   '_ws4ProjectsRaw','_ws4Projects','_wsDocStamp','_wsScenariosRaw','_wsScenarios',
   '_wsgGoalsRaw','_wsgGoals','_wsxOpen',
   // El listado de documentos de UNA capacidad: es la lista que alimenta tanto
   // el selector de reemplazo como «Abrir guardado», la puerta que sustituye a
   // la que los documentos tenían en Mi Espacio.
   '_wsSaveCandidates','_wsLabel','_wsRelTime'].forEach(n => {
     try { vm.runInContext(fnSrc(n), sb); } catch (e) { throw new Error('ctx ' + n + ': ' + e.message); }
   });
  // `_wsOpenTool` se instrumenta: se conserva su CUERPO real (con sus gates) y sólo
  // se observa el resultado. Stubbearlo sería certificar el stub.
  vm.runInContext(fnSrc('_wsOpenTool')
    .replace('_wshView = \'tool\'; renderWorkspaceHome();', '__opened.push("tool:" + key);'), sb);
  vm.runInContext('function _wsToolDefaultsFor(){ return {}; } function _wsCanonicalizeInputs(o){ return o||{}; } function _wsToolStateGet(){ return null; } function _wsJrnNewDraft(){ return {}; } function _wsReNewDraft(){ return {}; } function _wsRecvNewDraft(){ return {}; } function _wsApNewDraft(){ return {}; }', sb);
  vm.runInContext('var AURIX_WS6_TOOL=true, AURIX_WS7_TOOL=true, AURIX_WS8_TOOL=true, AURIX_WS12_TOOL=true, AURIX_WS13_TOOL=true, AURIX_WS14_TOOL=true, AURIX_WS15_TOOL=true, AURIX_WS16_TOOL=true;', sb);
  vm.runInContext('function _wshWriteStore(k,v){ localStorage.setItem(k, JSON.stringify(v)); return true; }', sb);
  vm.runInContext('function _wsDocsQueue(){} function _wsDocSyncSet(){}', sb);
  // La hoja legacy, con su gate real y su apertura observable.
  vm.runInContext('function _ws4Templates(){ return { investment:{fields:[]}, budget:{fields:[]}, property:{fields:[]}, business:{fields:[]}, networth:{fields:[]}, fire:{fields:[]} }; }', sb);
  vm.runInContext(fnSrc('_ws4OpenOrCreate')
    .replace("_ws4ActiveId = _ws4Draft.id; _wshView = 'workspace'; renderWorkspaceHome();", '__opened.push("ws4:" + type);'), sb);
  return sb;
}
const R = (c, expr) => vm.runInContext(expr, c);

// ── EXTRACTOR DE TARJETAS ──────────────────────────────────────────────────
// Lee el markup igual que lo lee un navegador: los atributos que el despachador
// consulta. No interpreta intención, sólo lo que está escrito en el DOM.
function cards(html) {
  const out = [];
  const re = /<div class="(wsh-tool wsh-toolcard[^"]*|wsh-tpl wsh-cardv[^"]*|wsh-mse2-card[^"]*)"([^>]*)>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[2];
    const g = k => { const r = new RegExp(k + '="([^"]*)"').exec(attrs); return r ? r[1] : null; };
    out.push({
      cls: m[1], attrs,
      role: g('role'), cta: g('data-wsh-cta'), tool: g('data-wstool'),
      ws4: g('data-ws4-type'), lock: g('data-wsh-lock'), aria: g('aria-label'),
      // SPEC P0 §4 — Mi espacio ya no es sólo accesos a capacidades: un DOCUMENTO
      // guardado se abre por su ref propia (`data-wsx-open`), no por la capacidad.
      xopen: g('data-wsx-open'), mtype: g('data-wsmse-type'),
      interactive: /role="button"/.test(attrs),
    });
  }
  return out;
}
function names(html) {
  return (html.match(/<p class="wsh-(?:tool|tpl|mse2)-name">([^<]*)<\/p>/g) || [])
    .map(x => x.replace(/<[^>]*>/g, ''));
}
// El destino REAL de una tarjeta: se ejecuta la rama del despachador que le
// corresponde y se devuelve lo que la app abrió (o el paywall que presentó).
function destination(c, card) {
  R(c, '__opened.length = 0; __upsell.length = 0;');
  if (card.lock !== null) { R(c, 'openUpgradeIntent({ featureKey: ' + JSON.stringify(card.lock) + ' })'); }
  else if (card.xopen) { R(c, '_wsxOpen(' + JSON.stringify(card.xopen) + ')'); }
  else if (card.cta === 'tool') { R(c, '_wsOpenTool(' + JSON.stringify(card.tool || 'compound') + ')'); }
  else if (card.cta === 'workspace') { R(c, '_ws4OpenOrCreate(' + JSON.stringify(card.ws4 || '') + ')'); }
  else if (card.cta === 'goals' || card.cta === 'scenario' || card.cta === 'planning') { R(c, '_wsOpenSurface(' + JSON.stringify(card.cta) + ')'); }
  else if (!card.interactive) return { kind: 'inert' };
  else return { kind: 'dead' };          // interactiva y sin rama: botón muerto
  const opened = R(c, 'JSON.stringify(__opened)');
  const upsell = R(c, 'JSON.stringify(__upsell)');
  const o = JSON.parse(opened), u = JSON.parse(upsell);
  if (o.length) return { kind: 'opened', what: o[0] };
  if (u.length) return { kind: 'paywall', featureKey: u[0].featureKey || '' };
  return { kind: 'dead' };
}
// ── DETECTOR DE FILTRACIÓN, Y POR QUÉ NO PUEDE SER «busca el id» ───────────
// Dos ids internos COINCIDEN con claves de superficie de entradas publicadas
// (`receivables` es el id de la herramienta interna Y el `data-wstool` de la
// plantilla publicada; `tpl:scenario` es el ref de fijado del Simulador
// publicado). Buscar el id a secas daba falsos positivos, así que la señal es la
// que un usuario ve: un NOMBRE pintado que pertenece a una entrada no publicada y
// que no comparte nombre con ninguna publicada.
function leakedIds(c, html, internalIds) {
  const nameKeyOf = id => JSON.parse(R(c, 'JSON.stringify((_WS_TOOL_RENDER[' + JSON.stringify(id) + '] || _WS_TPL_RENDER[' + JSON.stringify(id) + '] || {}).nameKey || null)'));
  const publishedNameKeys = JSON.parse(R(c, 'JSON.stringify(_WS_CATALOG.filter(e => e.published === true).map(e => (_WS_TOOL_RENDER[e.id] || _WS_TPL_RENDER[e.id] || {}).nameKey))'));
  return internalIds.filter(id => {
    if (html.indexOf('>' + id + '<') !== -1) return true;             // id crudo pintado
    const nk = nameKeyOf(id);
    if (!nk || publishedNameKeys.indexOf(nk) !== -1) return false;
    return html.indexOf('>' + R(c, 't(' + JSON.stringify(nk) + ')') + '<') !== -1;
  });
}
function home(c, tab) { R(c, '_wsTab = ' + JSON.stringify(tab)); return R(c, '_renderWorkspaceHome({})'); }

// ════════════════════════════════════════════════════════════════════════════
// 1 · LA CLAVE CANÓNICA SE DERIVA, Y ESO ERA EL P0
// ════════════════════════════════════════════════════════════════════════════
console.log('1 · El cliente acepta TODA clave que el catálogo declara:');
{
  const canon = (function () {
    const sb = { Math, Number, String, Object, Array, JSON, Set };
    vm.createContext(sb);
    vm.runInContext(konstSrc('_WS_CATALOG'), sb);
    vm.runInContext(konstSrc('_AURIX_ENT_CANON_EXTRA'), sb);
    vm.runInContext(konstSrc('_AURIX_ENT_CANON'), sb);
    return JSON.parse(vm.runInContext('JSON.stringify(_AURIX_ENT_CANON)', sb));
  })();
  ok('1.1 toda clave de derecho del catálogo está en el conjunto canónico del cliente',
    CAT_KEYS.every(k => canon.indexOf(k) !== -1),
    JSON.stringify(CAT_KEYS.filter(k => canon.indexOf(k) === -1)));
  ok('1.2 …y las cinco nuevas en concreto (el defecto que bloqueaba a la cuenta Premium)',
    ['workspace.budget','workspace.receivables','workspace.journal','workspace.goals','workspace.scenarios']
      .every(k => canon.indexOf(k) !== -1),
    JSON.stringify(canon));
  ok('1.3 y las transversales, que no tienen entrada de catálogo, siguen estando',
    ['intelligence.full','premium.settings','workspace.catalog_preview'].every(k => canon.indexOf(k) !== -1));
  // Y se comprueba que NO es un literal: si alguien vuelve a escribirlo a mano, el
  // conjunto deja de crecer con el catálogo y el defecto vuelve tal cual.
  ok('1.4 el conjunto se DERIVA del catálogo, no se escribe a mano',
    /_AURIX_ENT_CANON = Object\.freeze\(\s*Array\.from\(new Set\(\s*_WS_CATALOG\.map/.test(app),
    'debe derivarse de _WS_CATALOG');
  ok('1.5 el bucle de carga sigue siendo el que filtra por clave canónica',
    /for \(const k of _AURIX_ENT_CANON\) \{/.test(app));
  // El paywall tiene que poder nombrar lo que vende.
  const labels = konstSrc('FEATURE_LABELS');
  ok('1.6 el paywall sabe nombrar toda capacidad vendible (nunca la clave cruda)',
    CAT_KEYS.filter(k => k).every(k => labels.indexOf("'" + k + "'") !== -1),
    JSON.stringify(CAT_KEYS.filter(k => labels.indexOf("'" + k + "'") === -1)));
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · NADIE EXTERNO VE NI ABRE LO INTERNO
// ════════════════════════════════════════════════════════════════════════════
console.log('\n2 · Interno y «Próximamente» fuera del producto:');
{
  const free = ctx('free', 'es'), prem = ctx('premium', 'es'), fdr = ctx('founder', 'es');
  const INTERNAL_IDS = JSON.parse(R(free, 'JSON.stringify(_WS_CATALOG.filter(e => e.published !== true).map(e => e.id))'));
  ok('2.1 hay inventario interno que proteger (si no, el resto del bloque es vacuo)',
    INTERNAL_IDS.length >= 7, String(INTERNAL_IDS.length));
  [['free', free], ['premium', prem]].forEach(([nm, c]) => {
    const html = ['space', 'templates', 'tools'].map(t2 => home(c, t2)).join('\n');
    const leaked = leakedIds(c, html, INTERNAL_IDS);
    ok('2.2 ' + nm + ' · ningún id interno aparece en el markup de ninguna pestaña',
      leaked.length === 0, JSON.stringify(leaked));
    ok('2.3 ' + nm + ' · no existe la pestaña de inventario ni su aviso',
      html.indexOf('data-wstab="internal"') === -1
      && html.indexOf(R(c, 't("wsh_internal_b")')) === -1);
    ok('2.4 ' + nm + ' · ninguna tarjeta dice «Próximamente» ni «Interno»',
      html.indexOf('>' + R(c, 't("wsh_soon")') + '<') === -1
      && html.indexOf('>' + R(c, 't("wstier_preview")') + '<') === -1);
  });
  // SPEC P0 §4 — RE-DECIDIDO: el derecho del servidor ya no BASTA. Un override
  // global Premium concede `workspace.catalog_preview` con todo lo demás, así que
  // la pestaña «Interno» aparecía automáticamente en la vista normal de la cuenta
  // del founder, que es también la cuenta de QA. Ahora hace falta activar la vista
  // técnica a mano; el derecho sigue siendo la autoridad y el flag no concede nada.
  ok('2.5a un override global NO muestra Interno por sí solo',
    home(fdr, 'tools').indexOf('data-wstab="internal"') === -1);
  R(fdr, 'sessionStorage.setItem(_WS_FOUNDER_VIEW_KEY, "1")');
  ok('2.5 el founder SÍ tiene su vista explícita, y sólo ahí vive el inventario',
    home(fdr, 'tools').indexOf('data-wstab="internal"') !== -1
    && home(fdr, 'internal').indexOf('data-wsh-internal="1"') !== -1);
  ok('2.5b y el flag local SIN el derecho del servidor no concede nada',
    (function () { const c = ctx('premium', 'es');
      R(c, 'sessionStorage.setItem(_WS_FOUNDER_VIEW_KEY, "1")');
      return R(c, '_wsInternalViewOn()') === false
        && home(c, 'tools').indexOf('data-wstab="internal"') === -1; })());
  const fdrPublic = home(fdr, 'tools') + home(fdr, 'templates') + home(fdr, 'space');
  ok('2.6 …y en su catálogo NORMAL ya no hay nada interno (era el defecto reportado)',
    leakedIds(fdr, fdrPublic, INTERNAL_IDS).length === 0
    && cards(home(fdr, 'tools')).length + cards(home(fdr, 'templates')).length === 9,
    JSON.stringify(leakedIds(fdr, fdrPublic, INTERNAL_IDS))
      + ' cards=' + (cards(home(fdr, 'tools')).length + cards(home(fdr, 'templates')).length));
  ok('2.7 `_wsCatalogVisible` ya no pregunta quién mira',
    R(free, '_wsCatalogVisible({ published: false })') === false
    && R(fdr, '_wsCatalogVisible({ published: false })') === false
    && R(free, '_wsCatalogVisible({ published: true })') === true);
  ok('2.8 la vista interna falla CERRADA sin el derecho',
    R(free, '_wsCatalogInternal("tool").length') === 0
    && R(prem, '_wsCatalogInternal("template").length') === 0
    && R(fdr, '_wsCatalogInternal("tool").length') > 0);
  // OBJETIVOS DUPLICADO: la regla es estructural, no una excepción por id.
  const dup = JSON.parse(R(fdr, 'JSON.stringify(["tool","template"].map(k => _wsCatalogInternal(k).map(e => e.id)).reduce((a,b)=>a.concat(b),[]))'));
  ok('2.9 la vista interna NO repite una superficie con propietario publicado',
    ['goal','monthly_budget','trade_journal','receivables','real_estate_portfolio','tpl_scenario']
      .every(id => dup.indexOf(id) === -1),
    JSON.stringify(dup));
  ok('2.10 …así que Objetivos tiene UN solo hogar en todo el producto',
    (function () {
      const h = home(fdr, 'templates') + home(fdr, 'tools') + home(fdr, 'internal');
      const n = (h.match(new RegExp('>' + R(fdr, 't("wsg_title")') + '<', 'g')) || []).length;
      return n === 1;
    })(),
    'apariciones del nombre de Objetivos');
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · CADA TARJETA PÚBLICA TIENE DESTINO, Y ES EL CORRECTO
// ════════════════════════════════════════════════════════════════════════════
console.log('\n3 · Clic real en cada tarjeta, y a dónde llega:');
const PUBLIC = (function () {
  const sb = { Math, Number, String, Object, Array, JSON };
  vm.createContext(sb); vm.runInContext(konstSrc('_WS_CATALOG'), sb);
  return JSON.parse(vm.runInContext('JSON.stringify(_WS_CATALOG.filter(e => e.published === true).map(e => ({ id: e.id, kind: e.kind, tier: e.commercialTier, fk: e.featureKey })))', sb));
})();
{
    ok('3.0 el catálogo público son las NUEVE capacidades declaradas',
    PUBLIC.length === N_CAPS, JSON.stringify(PUBLIC.map(e => e.id)));
  ['es', 'en'].forEach(lg => {
    ['free', 'premium'].forEach(persona => {
      const c = ctx(persona, lg);
      const all = ['templates', 'tools'].map(t2 => cards(home(c, t2))).reduce((a, b) => a.concat(b), []);
      ok('3.1 ' + persona + '/' + lg + ' · se pintan las nueve tarjetas públicas, ni una más',
        all.length === N_CAPS, String(all.length));
      const dests = all.map(cd => ({ cd, d: destination(c, cd) }));
      ok('3.2 ' + persona + '/' + lg + ' · ninguna tarjeta está muerta',
        dests.every(x => x.d.kind !== 'dead'),
        JSON.stringify(dests.filter(x => x.d.kind === 'dead').map(x => x.cd.attrs.slice(0, 80))));
      ok('3.3 ' + persona + '/' + lg + ' · ninguna tarjeta pública es inerte (todas interactivas)',
        all.every(cd => cd.interactive), String(all.filter(cd => !cd.interactive).length));
      // Y ninguna descarga: el único `download` del producto es la copia de
      // seguridad de Ajustes, y no puede alcanzarse desde una tarjeta.
      ok('3.4 ' + persona + '/' + lg + ' · ninguna tarjeta declara descarga ni navegación externa',
        all.every(cd => !/download|href=|target=/.test(cd.attrs)));
      if (persona === 'premium') {
        ok('3.5 premium/' + lg + ' · las NUEVE abren dentro de Aurix',
          dests.every(x => x.d.kind === 'opened'),
          JSON.stringify(dests.filter(x => x.d.kind !== 'opened').map(x => x.d)));
        ok('3.6 premium/' + lg + ' · y ninguna presenta paywall',
          dests.every(x => x.d.kind !== 'paywall'));
      } else {
        // CIERRE WORKSPACE PREMIUM — 3.7 SE INVIERTE. Exigía que Free abriera
        // EXACTAMENTE `tool:compound` y `tool:realestate`, que eran las dos
        // capacidades del plan Free. Ya no hay ninguna: la decisión aprobada es que
        // las ocho requieren Premium, así que la afirmación correcta es la contraria
        // —Free no abre NI UNA— y se comprueba con el mismo despachador real.
        const openFree = dests.filter(x => x.d.kind === 'opened').map(x => x.d.what).sort();
        ok('3.7 free/' + lg + ' · no abre NINGUNA capacidad: las nueve son Premium',
          openFree.length === 0, JSON.stringify(openFree));
        ok('3.8 free/' + lg + ' · las NUEVE llevan al paywall con su clave real',
          dests.filter(x => x.d.kind === 'paywall').length === N_CAPS
          && dests.filter(x => x.d.kind === 'paywall').every(x => /^workspace\./.test(x.d.featureKey)),
          JSON.stringify(dests.map(x => x.d.kind + ':' + (x.d.featureKey || x.d.what || ''))));
        // Y el derecho que se deniega es el SUYO, no uno prestado: si las dos nuevas
        // colgaran de `intelligence.full` o de una clave global, esto lo delataría.
        const fks = dests.filter(x => x.d.kind === 'paywall').map(x => x.d.featureKey).sort();
        ok('3.9 free/' + lg + ' · cada capacidad deniega con SU propia clave, sin global',
          new Set(fks).size === N_CAPS
          && fks.indexOf('workspace.compound') !== -1
          && fks.indexOf('workspace.realestate') !== -1
          && fks.indexOf('workspace.full') === -1,
          JSON.stringify(fks));
      }
    });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// 4 · UNA SOLA ACCIÓN, Y LA ETIQUETA SÓLO CUANDO INFORMA
// ════════════════════════════════════════════════════════════════════════════
console.log('\n4 · «Abrir» cuando se puede abrir; «Premium» cuando no:');
{
  ['es', 'en'].forEach(lg => {
    const prem = ctx('premium', lg), free = ctx('free', lg);
    const hp = home(prem, 'templates') + home(prem, 'tools');
    const hf = home(free, 'templates') + home(free, 'tools');
    const PREM_LBL = R(prem, 't("wstier_premium")'), FREE_LBL = R(prem, 't("wstier_free")');
    ok('4.1 premium/' + lg + ' · CERO etiquetas «Premium» e «Incluido» dentro de las tarjetas',
      hp.indexOf('wsh-tier') === -1,
      (hp.match(/wsh-tier is-\w+/g) || []).join(','));
    ok('4.2 premium/' + lg + ' · las nueve tarjetas muestran UNA acción, y es «Abrir»',
      (hp.match(/wsh-tool-go/g) || []).length === N_CAPS
      && (hp.match(/wsh-tool-go is-lock/g) || []).length === 0
      && (hp.match(/wsh-pill/g) || []).length === 0,
      String((hp.match(/wsh-tool-go/g) || []).length));
    // CIERRE WORKSPACE PREMIUM — eran «las seis Premium» y «las dos Free». Ya no
    // hay ninguna Free: las ocho llevan etiqueta Premium y ninguna ofrece «Abrir».
    ok('4.3 free/' + lg + ' · las NUEVE llevan etiqueta Premium, y ninguna dice «Incluido»',
      (hf.match(/wsh-tier is-premium/g) || []).length === N_CAPS
      && hf.indexOf('wsh-tier is-free') === -1,
      String((hf.match(/wsh-tier is-premium/g) || []).length));
    ok('4.4 free/' + lg + ' · y ninguna dice «Abrir» para luego denegar',
      (hf.match(/wsh-tool-go">/g) || []).length === 0
      && (hf.match(/wsh-tool-go is-lock/g) || []).length === N_CAPS,
      JSON.stringify([(hf.match(/wsh-tool-go">/g) || []).length, (hf.match(/wsh-tool-go is-lock/g) || []).length]));
    ok('4.5 free/' + lg + ' · la tarjeta bloqueada es accesible y dice qué le falta',
      cards(hf).filter(cd => cd.lock).every(cd => cd.interactive && cd.aria && cd.aria.indexOf(R(free, 't("wsh_lock_aria")')) !== -1),
      JSON.stringify(cards(hf).filter(cd => cd.lock).map(cd => cd.aria)));
    ok('4.6 ' + lg + ' · ningún nombre de tarjeta queda vacío ni imprime su id',
      names(hp).length === N_CAPS && names(hp).every(n => n && !/^tpl_|_growth$|_simulation$/.test(n)),
      JSON.stringify(names(hp)));
  });
}

// ════════════════════════════════════════════════════════════════════════════
// 5 · MI ESPACIO: DOS COLUMNAS, DATOS REALES, CERO INVENTADO
// ════════════════════════════════════════════════════════════════════════════
console.log('\n5 · Mi espacio:');
{
  const c = ctx('premium', 'es');
  const empty = home(c, 'space');
  ok('5.1 con el espacio vacío se pintan LAS DOS columnas, no una portada',
    (empty.match(/wsh-mse2-col/g) || []).length === 2
    && empty.indexOf('data-wsmse-cols="2"') !== -1
    && empty.indexOf('wsh-mse2-blank') === -1);
  ok('5.2 y no se fabrica ni una tarjeta para rellenar',
    empty.indexOf('wsh-mse2-card') === -1
    && empty.indexOf('data-wsmse-tpl="0"') !== -1 && empty.indexOf('data-wsmse-tool="0"') !== -1);
  ok('5.3 cada columna vacía ofrece salida a SU catálogo (cero enlaces muertos)',
    (empty.match(/data-wstab="templates"/g) || []).length >= 1
    && (empty.match(/data-wstab="tools"/g) || []).length >= 1);
  // ── LA PERTENENCIA ES INTENCIONAL, Y ESTO ES LO QUE SE RE-DECIDE ─────────
  // La versión anterior de este bloque poblaba Mi espacio con `_wsTouch` —abrir
  // una herramienta— y lo certificaba como correcto. Era la regla que la SPEC P0
  // retira: un espacio que se llena con lo que pasó por delante no es el espacio
  // del usuario. Ahora sólo entran FAVORITOS y DOCUMENTOS GUARDADOS.
  R(c, '_wsTouch("tool:compound"); _wsTouch("tpl:mbudget")');
  const touched = home(c, 'space');
  ok('5.4 ABRIR una capacidad NO la mete en Mi espacio',
    touched.indexOf('data-wsmse-tpl="0"') !== -1 && touched.indexOf('data-wsmse-tool="0"') !== -1
    && touched.indexOf('wsh-mse2-card') === -1,
    touched.slice(touched.indexOf('data-wsmse-cols'), touched.indexOf('data-wsmse-cols') + 70));
  // 1 · un FAVORITO puebla su columna, y sólo la suya.
  R(c, '_wsTogglePin("tool:compound")');
  const fav = home(c, 'space');
  ok('5.4b marcar un favorito SÍ lo mete, y una sola vez',
    fav.indexOf('data-wsmse-tool="1"') !== -1 && fav.indexOf('data-wsmse-tpl="0"') !== -1
    && (fav.match(/data-wsmse-type="fav"/g) || []).length === 1,
    fav.slice(fav.indexOf('data-wsmse-cols'), fav.indexOf('data-wsmse-cols') + 70));
  ok('5.4c quitar la estrella lo saca',
    (function () { R(c, '_wsTogglePin("tool:compound")');
      const h = home(c, 'space');
      return h.indexOf('wsh-mse2-card') === -1; })());
  R(c, '_wsTogglePin("tool:compound")');
  // ── RE-DECIDIDO (2026-09-24): MI ESPACIO SON FAVORITOS, Y NADA MÁS ───────
  // Este bloque exigía que un DOCUMENTO guardado poblara la columna de su
  // capacidad en Mi Espacio. El contrato de producto separa tres entidades
  // —capacidad, favorito y documento— y esa mezcla era justo el defecto: una
  // tarjeta decía «capacidad que fijé» y la de al lado «presupuesto que
  // guardé», con la misma forma, y una capacidad con tres documentos aparecía
  // cuatro veces.
  // Las GARANTÍAS de los asserts que había aquí no se pierden: se comprueban
  // donde los documentos viven ahora — la lista de documentos de la capacidad,
  // que alimenta «Abrir guardado» y el Resumen.
  R(c, 'localStorage.setItem(_WSH_PROJECTS_KEY, JSON.stringify([{ id: "p1", type: "monthly_budget", customName: "Presupuesto empresa", revision: 1, updatedAt: Date.now(), results: {} }]))');
  const both = home(c, 'space');
  ok('5.5 un documento guardado NO entra en Mi Espacio: allí sólo hay favoritos',
    both.indexOf('data-wsmse-type="doc"') === -1 && both.indexOf('data-wsmse-tpl="0"') !== -1,
    both.slice(both.indexOf('data-wsmse-cols'), both.indexOf('data-wsmse-cols') + 70));
  ok('5.5b …y el favorito que SÍ hay sigue estando, intacto',
    (both.match(/data-wsmse-type="fav"/g) || []).length === 1
    && both.indexOf('data-wsmse-tool="1"') !== -1, JSON.stringify(names(both)));
  ok('5.6 el documento existe y conserva el NOMBRE que le puso el usuario',
    (function () {
      const d = JSON.parse(R(c, 'JSON.stringify(_wsSaveCandidates("monthly_budget", null))'));
      return d.length === 1 && d[0].name === 'Presupuesto empresa';
    })(), R(c, 'JSON.stringify(_wsSaveCandidates("monthly_budget", null).map(function(d){return d.name;}))'));
  ok('5.6c VARIAS instancias de la MISMA capacidad conviven, sin deduplicar por título',
    (function () {
      R(c, 'localStorage.setItem(_WSH_PROJECTS_KEY, JSON.stringify([' +
        '{ id: "p1", type: "monthly_budget", customName: "Presupuesto empresa", revision: 1, updatedAt: 2, results: {} },' +
        '{ id: "p2", type: "monthly_budget", customName: "Presupuesto personal", revision: 1, updatedAt: 3, results: {} },' +
        '{ id: "p3", type: "monthly_budget", customName: "Presupuesto empresa", revision: 1, updatedAt: 4, results: {} }]))');
      const d = JSON.parse(R(c, 'JSON.stringify(_wsSaveCandidates("monthly_budget", null))'));
      // TRES, con dos títulos repetidos: la identidad es el id, nunca el nombre.
      return d.length === 3 && new Set(d.map(x => x.id)).size === 3
        && d.filter(x => x.name === 'Presupuesto empresa').length === 2;
    })(), R(c, 'JSON.stringify(_wsSaveCandidates("monthly_budget", null).map(function(d){return d.id + ":" + d.name;}))'));
  ok('5.6d un documento con tombstone no se ofrece, y su registro NO se borra',
    (function () {
      R(c, 'localStorage.setItem(_WSH_PROJECTS_KEY, JSON.stringify([' +
        '{ id: "p1", type: "monthly_budget", customName: "Borrado", revision: 2, deletedAt: 9, updatedAt: 9, results: {} },' +
        '{ id: "p2", type: "monthly_budget", customName: "Vivo", revision: 1, updatedAt: 3, results: {} }]))');
      const d = JSON.parse(R(c, 'JSON.stringify(_wsSaveCandidates("monthly_budget", null))'));
      const raw = R(c, '_ws4ProjectsRaw().length'), live = R(c, '_ws4Projects().length');
      return d.length === 1 && d[0].name === 'Vivo' && raw === 2 && live === 1;
    })());
  // Con una sola fuente hay una sola tarjeta: la del favorito. Y abre.
  ok('5.7 las tarjetas de Mi espacio abren de verdad (cada favorito, su capacidad)',
    (function () {
      R(c, 'localStorage.setItem(_WSH_PROJECTS_KEY, JSON.stringify([{ id: "p1", type: "monthly_budget", customName: "Presupuesto empresa", revision: 1, updatedAt: 5, results: {} }]))');
      const h = home(c, 'space');
      const cd = cards(h).filter(x => /wsh-mse2-card/.test(x.cls));
      return cd.length === 1 && cd.every(x => destination(c, x).kind === 'opened');
    })(),
    JSON.stringify(cards(home(c, 'space')).filter(x => /wsh-mse2-card/.test(x.cls)).map(x => destination(c, x))));
  // Y un usuario Free no puede ver en Mi Espacio algo que no puede abrir.
  const cf = ctx('free', 'es');
  R(cf, '_wsTogglePin("tpl:mbudget"); _wsTogglePin("tool:compound")');
  R(cf, 'localStorage.setItem(_WSH_PROJECTS_KEY, JSON.stringify([{ id: "p1", type: "monthly_budget", customName: "Presupuesto empresa", revision: 1, updatedAt: 5, results: {} }]))');
  const hf = home(cf, 'space');
  // Free no llega a tener NADA aquí, y por dos razones independientes que conviene
  // separar: fijar es Premium (así que no hay favorito) y el documento heredado de
  // una capacidad Premium no se ofrece (así que no hay tarjeta de documento).
  ok('5.8 free · Mi espacio no ofrece ni la capacidad ni el DOCUMENTO que no puede abrir',
    hf.indexOf('data-wsmse-tpl="0"') !== -1 && hf.indexOf('data-wsmse-tool="0"') !== -1
    && names(hf).indexOf('Presupuesto empresa') === -1,
    hf.slice(hf.indexOf('data-wsmse-cols'), hf.indexOf('data-wsmse-cols') + 70));
  ok('5.8b …porque fijar es Premium: no queda una estrella huérfana',
    R(cf, '_wsIsPinned("tpl:mbudget")') === false && R(cf, '_wsIsPinned("tool:compound")') === false);
  // ── LAS DOS COLUMNAS SON SIMÉTRICAS EN EL MARKUP ──────────────────────────
  ok('5.8c las dos cabeceras son IDÉNTICAS: ningún subtítulo desplaza una columna',
    (function () {
      const h = home(c, 'space');
      return (h.match(/wsh-mse2-sub/g) || []).length === 0
        && (h.match(/class="wsh-title wsh-mse2-title"/g) || []).length === 2;
    })());
  ok('5.8d y los subtítulos «… utilizadas recientemente» ya no existen en el diccionario',
    app.indexOf('wsmse2_tpl_sub') === -1 && app.indexOf('wsmse2_tool_sub') === -1);
  // El mapa de render es UNO: si vuelve a haber dos, Mi Espacio se queda atrás.
  ok('5.9 no queda un segundo catálogo de render para Mi espacio',
    !/_MSE_TOOL_RENDER|_MSE_TPL_RENDER/.test(app));
  ok('5.10 Mi espacio deriva del MISMO mapa que el catálogo',
    /const tplList = colItems\(_WS_TPL_RENDER, 'template'\);/.test(app)
    && /const toolList = colItems\(_WS_TOOL_RENDER, 'tool'\);/.test(app));
}

// ════════════════════════════════════════════════════════════════════════════
// 6 · GUARDAR ES PREMIUM, Y SE DICE ANTES DE PULSAR
// ════════════════════════════════════════════════════════════════════════════
console.log('\n6 · Persistencia: sin plan no se escribe, y no se finge:');
{
  const free = ctx('free', 'es'), prem = ctx('premium', 'es');
  ok('6.1 free · fijar no escribe nada y presenta el valor de Premium',
    (function () {
      R(free, '__upsell.length = 0; _wsTogglePin("tool:compound")');
      return R(free, '_wsPinned().length') === 0 && R(free, '__upsell.length') === 1
        && R(free, '__upsell[0].featureKey') === 'workspace.documents';
    })(),
    R(free, 'JSON.stringify(__upsell)'));
  ok('6.2 premium · fijar SÍ escribe',
    (function () { R(prem, '_wsTogglePin("tool:compound")'); return R(prem, '_wsPinned().length') === 1; })());
  // ── EL DEFECTO CRÍTICO QUE ENCONTRÓ LA REVISIÓN, Y AQUÍ SE EJERCE ────────────
  // La primera versión de `_wsCanPersist` preguntaba `isPremiumTier()`, que lee el
  // rail LOCAL `aurix_plan`. Nadie lo escribe desde el servidor y su único escritor
  // se retiró, así que resolvía 'free' SIEMPRE: una cuenta de pago no podía guardar
  // ni sincronizar nada, y a la vez cualquiera podía concedérselo desde la consola.
  // Se comprueba EJECUTANDO las dos direcciones, no leyendo el código.
  ok('6.3 el gate de persistencia lo decide el SERVIDOR, no un rail local',
    (function () {
      // (a) una cuenta con el derecho del servidor SÍ puede, aunque el rail local diga free
      const c1 = ctx('premium', 'es');
      R(c1, 'localStorage.setItem("aurix_plan", JSON.stringify({ tier: "free" }))');
      const serverYes = R(c1, '_wsCanPersist()') === true;
      // (b) y un rail local falsificado NO concede nada sin derecho del servidor
      const c2 = ctx('free', 'es');
      R(c2, 'localStorage.setItem("aurix_plan", JSON.stringify({ tier: "premium" }))');
      const localNo = R(c2, '_wsCanPersist()') === false;
      return serverYes && localNo;
    })(),
    'servidor manda, localStorage no');
  ok('6.3b y es el MISMO predicado que pinta el acento Premium (no se contradicen)',
    /function _wsCanPersist\(\) \{[\s\S]{0,80}hasAurixPremiumAccess\(\) === true/.test(app)
    && /return hasAurixPremiumAccess\(\) === true;/.test(fnSrc('_renderWorkspaceHome'))
    && !/isPremiumTier\(\) === true/.test(fnSrc('_wsCanPersist'))
    && !/hasFeature\('workspace\.documents'\)/.test(app));
  // RETIRAR LO PROPIO NUNCA REQUIERE PLAN. El gate estaba ANTES de la rama y esta
  // función hace las dos cosas, así que un fijado antiguo quedaba huérfano: la
  // estrella encendida y cada clic abriendo el paywall en vez de apagarla.
  ok('6.3c un fijado existente SIEMPRE se puede quitar, con plan o sin él',
    (function () {
      const c = ctx('free', 'es');
      R(c, 'localStorage.setItem(_WSH_PINNED_KEY, JSON.stringify([{ ref: "tool:compound", ts: 1 }]))');
      R(c, '__upsell.length = 0; _wsTogglePin("tool:compound")');
      return R(c, '_wsPinned().length') === 0 && R(c, '__upsell.length') === 0;
    })());
  ok('6.4 y `workspace.documents` NO puede colarse como derecho',
    (function () {
      const sb = { Math, Number, String, Object, Array, JSON, Set };
      vm.createContext(sb);
      vm.runInContext(konstSrc('_WS_CATALOG'), sb);
      vm.runInContext(konstSrc('_AURIX_ENT_CANON_EXTRA'), sb);
      vm.runInContext(konstSrc('_AURIX_ENT_CANON'), sb);
      return vm.runInContext('_AURIX_ENT_CANON.indexOf("workspace.documents")', sb) === -1;
    })());
  ok('6.5 sin plan la subida remota no ocurre y el estado cae a «este dispositivo»',
    /if \(!_wsCanPersist\(\)\) \{ _wsDocSyncSet\(key, 'local_only'\); return false; \}/.test(app)
    && /if \(!_wsCanPersist\(\)\) return false;/.test(fnSrc('_wsDocsPull')));
  ok('6.6 el botón Guardar de una cuenta sin plan lleva su etiqueta Premium',
    /is-lock" data-wstool-save>\$\{esc\(saveLabel\)\}<span class="wsh-tier is-premium">/.test(fnSrc('_wsToolSaveBarHtml')));
}

// ════════════════════════════════════════════════════════════════════════════
// 7 · LA SEXTA PUERTA, CERRADA
// ════════════════════════════════════════════════════════════════════════════
console.log('\n7 · Ninguna ruta directa abre lo que el catálogo no publica:');
{
  const free = ctx('free', 'es'), prem = ctx('premium', 'es'), fdr = ctx('founder', 'es');
  ['networth', 'property', 'business', 'fire'].forEach(ty => {
    ok('7.1 free · `' + ty + '` no abre la hoja legacy (era la sexta puerta sin gate)',
      (function () { R(free, '__opened.length = 0; _ws4OpenOrCreate(' + JSON.stringify(ty) + ')'); return R(free, '__opened.length') === 0; })());
  });
  ok('7.2 premium tampoco: no está publicado, y eso no es un derecho',
    (function () { R(prem, '__opened.length = 0; _ws4OpenOrCreate("networth")'); return R(prem, '__opened.length') === 0; })());
  ok('7.3 el founder sí puede evaluarlo desde su vista',
    (function () { R(fdr, '__opened.length = 0; _ws4OpenOrCreate("networth")'); return R(fdr, '__opened.length') === 1; })());
  ok('7.4 y el gate vive en UN owner, compartido por la apertura y la tarjeta',
    // Resolverlo dos veces —una en `_ws4OpenOrCreate` y otra en el modelo de
    // tarjeta— permitía que la tarjeta dijera una cosa y la apertura hiciera otra.
    /const _acc4 = _wsWs4Access\(type\);/.test(fnSrc('_ws4OpenOrCreate'))
    && /const id = _WS4TYPE_TO_ID\[String\(type \|\| ''\)\];/.test(fnSrc('_wsWs4Access'))
    && /if \(!_wsEntryOpenable\(entry\)\) return \{ ok: false, reason: 'unpublished'/.test(fnSrc('_wsWs4Access'))
    && /acc = _wsWs4Access\(r\.ws4\);/.test(fnSrc('_renderWorkspaceHome')));
  // Un proyecto guardado de una versión anterior tampoco puede saltarse el gate.
  ok('7.5 un proyecto legacy guardado pasa por el MISMO owner, con su entitlement',
    // Comprobaba sólo publicación, así que un proyecto guardado de tipo `budget`
    // habría abierto la hoja saltandose el derecho mientras la tarjeta daba paywall.
    /else if \(_wsWs4Access\(p\.type\)\.ok\)/.test(fnSrc('_wsxOpen')));
  ok('7.6 un tipo SIN entrada de catálogo falla CERRADO, no abierto',
    // El default era `ok:true` «porque decide el owner»: un default abierto en una
    // función de autorización. Añadir un tipo y olvidar su línea en el mapa lo
    // dejaba accesible para todo el mundo, en silencio.
    R(fdr, '_wsWs4Access("un_tipo_que_no_existe").ok') === false
    && R(fdr, '_wsWs4Access("un_tipo_que_no_existe").reason') === 'unpublished'
    && R(prem, '_wsWs4Access("networth").ok') === false);
  // Y las claves de apertura que el despachador acepta siguen siendo las del mapa.
  ok('7.7 una superficie no publicada deniega con «no publicado», no con «Premium»',
    R(free, '_wsToolAccess("assets").reason') === 'unpublished'
    && R(free, '_wsToolAccess("projection").reason') === 'unpublished'
    && R(free, '_wsToolAccess("budget").reason') === 'entitlement');
}

// ════════════════════════════════════════════════════════════════════════════
// 8 · LA PORTADA FREE DE WORKSPACE
// ════════════════════════════════════════════════════════════════════════════
// CIERRE WORKSPACE PREMIUM — esta sección cambia de contrato, y el cambio es la
// decisión de producto: la portada ya NO tiene dos accesos vivos. Las afirmaciones
// que aquí se invierten (8.1 y 8.7) decían literalmente «dos tarjetas Free» y «los
// dos accesos abren la capacidad de verdad»; mantenerlas habría fosilizado como
// contrato justo lo que se acaba de retirar, que es la lección que este proyecto
// lleva pagada diez veces.
console.log('\n8 · Portada Free: una card, ocho capacidades, un CTA y ningún acceso:');
{
  ['es', 'en'].forEach(lg => {
    const c = ctx('free', lg);
    const html = R(c, '_renderWorkspaceFreeCover()');
    ok('8.1 ' + lg + ' · ningún acceso a capacidades: no hay tarjeta que abrir',
      html.indexOf('data-wsfc-open') === -1
      && html.indexOf('data-wsfc-count') === -1
      && html.indexOf('wsfc-item') === -1,
      html.slice(0, 120));
    ok('8.2 ' + lg + ' · UN solo CTA, por el owner canónico de planes, sin paso intermedio',
      (html.match(/data-premium-cta="workspace\.full"/g) || []).length === 1
      && (html.match(/wsfc-cta/g) || []).length === 2
      && html.indexOf('data-wsfc-upgrade') === -1
      && html.indexOf('data-wsfc-skip') === -1
      && html.indexOf('wsfc-skip') === -1);
    ok('8.2b ' + lg + ' · y declara su origen para la medición del embudo',
      /data-premium-source="workspace:free_cover"/.test(html));
    ok('8.3 ' + lg + ' · el CTA dice «Descubrir Workspace completo», no «Ver Premium»',
      html.indexOf(R(c, 't("wsfc_cta")')) !== -1
      && !/Ver Premium|See Premium/.test(html),
      R(c, 't("wsfc_cta")'));
    // 8.4 — NUEVE capacidades, y son las NUEVE PUBLICADAS. No se compara contra una
    // lista escrita en el test: se deriva del catálogo, así que despublicar una
    // entrada y dejarla anunciada en la portada sale como fallo.
    const PUB8 = PUBLIC.length;
    ok('8.4 ' + lg + ' · publica las NUEVE capacidades como acciones, no como permisos',
      html.indexOf('data-wsfc-caps="' + PUB8 + '"') !== -1
      && PUB8 === N_CAPS
      && html.indexOf('data-wsfc-premium') === -1
      && !/wsfc-cap[^>]*(button|role="button")/.test(html),
      (/data-wsfc-caps="(\d+)"/.exec(html) || [])[1]);
    ok('8.4b ' + lg + ' · y las nueve aparecen con su nombre, ninguno vacío',
      (function () {
        const names = (html.match(/class="wsfc-cap-name">([^<]*)</g) || []).map(x => x.replace(/.*>([^<]*)<$/, '$1'));
        return names.length === N_CAPS && names.every(n => n.trim().length > 2);
      })(), html.slice(html.indexOf('wsfc-caps'), html.indexOf('wsfc-caps') + 160));
    ok('8.5 ' + lg + ' · y no nombra Seguimiento de precios, que sigue interno',
      html.indexOf(R(c, 't("wsapp_assets_n")')) === -1
      && !/seguimiento de precios|price watchlist/i.test(html));
    ok('8.6 ' + lg + ' · sin precios en la portada: el precio vive en el paywall',
      !/59|7,99|7\.99|€\s*\/|\/año|\/year|\/mes|\/month/.test(html));
    // §2 pide retirar tres cosas por su nombre. Se comprueban por LITERAL, no por
    // clase: renombrar la clase y dejar el texto no arreglaría nada.
    ok('8.6b ' + lg + ' · fuera «Empieza ahora», «Incluido» y «Con Premium»',
      !/Empieza ahora|Start now/.test(html)
      && html.indexOf(R(c, 't("wstier_free")')) === -1
      && html.indexOf(R(c, 't("wstier_premium")')) === -1
      && !/Con Premium|With Premium/.test(html));
    // 8.7 SE INVIERTE: era «los dos accesos abren la capacidad de verdad».
    ok('8.7 ' + lg + ' · Free ya no puede abrir Interés compuesto ni Portfolio inmobiliario',
      (function () {
        const out = ['compound', 'realestate'].map(k => { R(c, '__opened.length = 0; _wsOpenTool(' + JSON.stringify(k) + ')'); return R(c, 'JSON.stringify(__opened)'); });
        return out.join('|') === '[]|[]';
      })());
  });
  // 8.8 SE INVIERTE. Vigilaba que los controles de la portada estuvieran en el
  // `closest()` del despachador, porque no estarlo los dejaba muertos —fue un
  // defecto real—. Ya no hay controles que despachar aquí: las dos aperturas se
  // fueron con las tarjetas gratuitas y el cierre del aviso con el aviso. Lo
  // único pulsable es el CTA, y lo despacha el owner canónico de conversión.
  ok('8.8 la portada no tiene controles en el despachador: sólo el CTA canónico',
    !/\[data-wsfc-open\]/.test(app) && !/\[data-wsfc-notice-close\]/.test(app.replace(/^\s*\/\/.*$/gm, ''))
    && /data-premium-cta="workspace\.full"/.test(app)
    && /\[data-ws-sync-retry\]/.test(app),
    'el CTA va por `_initFounderUI` → `openAurixPremiumModal`, no por `_wshWireOnce`');
  // 8.9 SE INVIERTE, y era el P0 FREE BOUNDARY: la portada NO es de un solo uso.
  ok('8.9 la portada NO se gasta: no queda estado de «ya la has visto»',
    !/_wsFreeCoverSeen\s*=/.test(app.replace(/\/\/[^\n]*/g, '')),
    'un guard no se gasta');
  ok('8.10 y sigue decidiéndose por el plan, sin bloquear la sección',
    !/hasAurixPremiumAccess/.test(fnSrc('renderWorkspace')));
  // ── EL AVISO SE RETIRÓ, Y NO SE SUSTITUYE ────────────────────────────────
  // 8.11–8.16 certificaban el aviso «Workspace ahora forma parte de Premium…»:
  // a quién se le enseñaba, que fuera una sola vez y que no bloqueara el pago.
  // El founder lo retira, así que la afirmación correcta es que NO existe — ni
  // él ni un sustituto. Lo que sí se conserva es lo que el aviso protegía: que
  // los datos guardados siguen ahí, y eso lo certifica el ciclo de vida del
  // documento (5.x de AURIX-WORKSPACE-OPERATIVE y la sonda de primera pantalla).
  {
    const c = ctx('free', 'es');
    R(c, 'localStorage.setItem("aurix_ws_projects_v1", JSON.stringify([{ id: "p1", type: "compound_growth" }]))');
    const html = R(c, '_renderWorkspaceFreeCover()');
    ok('8.11 con trabajo guardado NO se pinta ningún aviso de cambio de plan',
      html.indexOf('wsfc-notice') === -1 && !/forma parte de Premium|now part of Premium/.test(html));
    ok('8.12 y no queda lógica del aviso en el bundle',
      !/_wsfcNoticeDue|_wsfcHasPriorWork|_WSFC_NOTICE_KEY|data-wsfc-notice-close/.test(app.replace(/^\s*\/\/.*$/gm, '')));
    ok('8.13 ni se ha sustituido por otro cartel: la portada son cuatro piezas',
      (html.match(/class="wsfc-(eyebrow|title|sub|caps|cta-wrap)"/g) || []).length === 5
      && html.indexOf('role="status"') === -1 && html.indexOf('role="alert"') === -1);
  }
  // ── §4 · LA RENDIJA DEL GUARD, CERRADA ────────────────────────────────────
  // El despachador dejaba montada la vista `tool` si su gate la concedía. Existía
  // porque el plan Free incluía dos capacidades. Ya no incluye ninguna, así que la
  // excepción sólo podría dejar pasar un derecho mal revocado.
  ok('8.17 sin Premium confirmado, el despachador no deja NINGUNA vista interior',
    !/_openOk/.test(fnSrc('renderWorkspaceHome'))
    && /_wsPrem === false\)\s*\{[\s\S]*?_wshView = 'free_cover';/.test(fnSrc('renderWorkspaceHome')),
    'la rendija `_wshView === "tool" && _wsToolAccess(...).ok` debe estar retirada');
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
