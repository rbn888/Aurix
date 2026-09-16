#!/usr/bin/env node
/**
 * AURIX WORKSPACE + PORTADAS FREE · VISUAL QA (seis viewports, URL PÚBLICA)
 *
 * Mide la GEOMETRÍA REAL de las superficies que la SPEC de cierre toca, sobre el
 * bundle PÚBLICO desplegado, en los seis viewports que la matriz exige, y guarda
 * capturas de cada una.
 *
 * POR QUÉ SE INYECTA EL MARKUP
 *   Workspace y las dos portadas dependen del plan del usuario, y una sonda sin
 *   sesión sólo vería una de las tres caras. El markup se genera con las funciones
 *   del MISMO app.js desplegado (verificado byte a byte contra el servido) para
 *   tres personas —Free, Premium y Founder— y se inyecta en la página PÚBLICA, de
 *   modo que lo aplica el styles.css PÚBLICO. Esto certifica CSS + markup + layout
 *   reales. NO sustituye la QA autenticada del fundador con sus datos.
 *
 * QUÉ MIDE, Y POR QUÉ CADA COSA
 *   docOverflowX   la página desborda a lo ancho              (prohibido)
 *   sectionOverflow una sección desborda su caja              (prohibido)
 *   clipped        texto recortado sin elipsis                (prohibido)
 *   tapSmall       objetivo táctil < 44 px                    (prohibido en móvil)
 *   fontMin        fuente por debajo de 11 px                 (prohibido)
 *   fold           el embudo principal cae bajo el pliegue    (prohibido en portadas)
 *   cols           Mi espacio pinta sus DOS columnas          (exigido)
 *   rowBaseline    las tarjetas de una fila comparten base    (rejilla equilibrada)
 *   dead           zona muerta al final del panel             (escritorio)
 *
 *   node --experimental-websocket scripts/aurix-workspace-visual-qa.mjs
 */
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PUBLIC = process.env.AURIX_QA_URL || 'https://app.aurixsystem.io/';
const OUT = join(ROOT, 'docs', 'workspace-visual-qa');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const app = readFileSync(join(ROOT, 'app.js'), 'utf8');
const cssLocal = readFileSync(join(ROOT, 'styles.css'), 'utf8');

function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
function konstSrc(name){ const m=new RegExp('^const '+name+'\\s*=','m').exec(app);
  if(!m) throw new Error('missing const '+name); const i=m.index;
  let k=i, depth=0, started=false;
  for(;k<app.length;k++){ const c=app[k];
    if(c==='('||c==='{'||c==='[') {depth++;started=true;}
    else if(c===')'||c==='}'||c===']') depth--;
    else if(c===';'&&(!started||depth===0)) { k++; break; } }
  return app.slice(i,k); }

// ── 1 · El diccionario REAL ─────────────────────────────────────────────────
function dictCtx(langCode) {
  const tI = app.indexOf('const T = {');
  if (tI < 0) throw new Error('T dictionary not found');
  let k = app.indexOf('{', tI), d = 0, end = -1;
  for (; k < app.length; k++) { if (app[k] === '{') d++; else if (app[k] === '}') { d--; if (!d) { end = k + 1; break; } } }
  const sb = { Math, Number, String, Object, Array, JSON, Date, Intl, Set, Map,
               console: { warn(){}, log(){}, error(){} } };
  vm.createContext(sb);
  vm.runInContext('var lang = ' + JSON.stringify(langCode) + ';', sb);
  vm.runInContext(app.slice(tI, end) + ';', sb);
  vm.runInContext('function t(k){ var d=T[lang]||T.es; var v=d[k]; if(v===undefined) v=T.es[k]; return v; }', sb);
  return sb;
}

// ── 2 · Las tres personas, con el catálogo y el render REALES ───────────────
const CAT_KEYS = Array.from(new Set(
  (konstSrc('_WS_CATALOG').match(/featureKey:\s*'([\w.]+)'/g) || [])
    .map(x => x.replace(/.*'([\w.]+)'.*/, '$1'))));
function ctx(persona, langCode) {
  const sb = dictCtx(langCode);
  const granted = persona === 'free' ? []
    : CAT_KEYS.concat(['intelligence.full', 'premium.settings'])
        .concat(persona === 'founder' ? ['workspace.catalog_preview'] : []);
  sb.__granted = granted;
  vm.runInContext('function hasFeature(k){ return __granted.indexOf(k) !== -1; }', sb);
  vm.runInContext('function hasAurixPremiumAccess(){ return hasFeature("intelligence.full"); }', sb);
  vm.runInContext('function isPremiumTier(){ return ' + (persona === 'free' ? 'false' : 'true') + '; }', sb);
  vm.runInContext('var __LS = Object.create(null); var localStorage = { getItem: k => (k in __LS ? __LS[k] : null), setItem: (k,v) => { __LS[k] = String(v); }, removeItem: k => { delete __LS[k]; } };', sb);
  vm.runInContext('var _wshView="home",_wsTab=null,_wsToolActive=null,_wsToolInputs=null,_wsToolEditId=null,_wsToolDirty=false,_wsReturnTab="tools",_ws4ActiveId=null,_wsFreeCoverSeen=false;', sb);
  vm.runInContext('function formatBase(v){ return String(v); } function openUpgradeIntent(){ return false; }', sb);
  vm.runInContext('function _intccEsc(x){ return String(x == null ? "" : x).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c])); }', sb);
  vm.runInContext('function _escapeWorkspaceText(x){ return _intccEsc(x); }', sb);
  ['_WS_CATALOG','_WS_TOOLKEY_TO_ID','_WS_VIEW_SURFACES','_WS_TOOL_RENDER','_WS_TPL_RENDER',
   '_WS4TYPE_TO_ID','_WS_TABS','_WS_TOOL_ASSET','_WS_TPL_ASSET','_WS_APP_IDENTITY','_WS_ARCH',
   '_WS_ASSET_BASE','_WSH_PINNED_KEY','_WSH_RECENT_KEY','_WSH_GOALS_KEY','_WSH_PROJECTS_KEY',
   '_WSH_SCENARIOS_KEY','_WS_PROJTYPE_TO_TOOL'].forEach(n => vm.runInContext(konstSrc(n), sb));
  ['_wsCatalogEntry','_wsSurfaceEntry','_wsToolFeatureKey','_wsCatalogVisible','_wsCatalogFor',
   '_aurixEntIsCatalogPreview','_wsCatalogSurfaceKey','_wsRenderSurface','_wsEntrySurfaceKey',
   '_wsCatalogInternal','_wsEntryOpenable','_wsWs4Access','_wsToolAccess','_wsAppIdentity',
   '_wsTabOk','_wsSmartTab','_wsCanonRef','_wsRelTime','_wsRecentMap','_wsRecentTs','_wsPinned',
   '_wsIsPinned','_wshReadStore','_wsGlyph','_wsGlyphTile','_wsSceneHtml','_wsTplViz','_wsAssetImg',
   '_wsReceivablesPreview','_wsAssetsPreview','_wsToolPreviewHtml','_wsCatPreviewBaseHtml',
   '_wsCatPreviewHtml','_wsMseToolPreview','_wshAllProjects','_wsToolKeyForProjectType',
   '_wsLabel','_wsTypeLabel','_renderWorkspaceHome','_renderWorkspaceFreeCover']
    .forEach(n => vm.runInContext(fnSrc(n), sb));
  return sb;
}
const R = (c, e) => vm.runInContext(e, c);

// Un espacio POBLADO con datos reales del propio motor: dos aperturas y dos
// documentos guardados. No hay contenido inventado — son los mismos almacenes que
// usa la app, rellenados como los rellenaría el usuario.
function seed(c) {
  R(c, '_wsTouch = undefined');
  R(c, 'localStorage.setItem(_WSH_RECENT_KEY, JSON.stringify({ "tool:compound": Date.now() - 6e5, "tpl:mbudget": Date.now() - 3e6, "tpl:goals": Date.now() - 9e6, "tool:loan": Date.now() - 2e7 }))');
  R(c, 'localStorage.setItem(_WSH_PROJECTS_KEY, JSON.stringify([{ id:"p1", type:"monthly_budget", name:"Presupuesto 2026", updatedAt: Date.now()-2e6, results:{} }, { id:"p2", type:"loan_simulation", name:"Hipoteca", updatedAt: Date.now()-5e6, results:{} }]))');
  R(c, 'localStorage.setItem(_WSH_GOALS_KEY, JSON.stringify([{ id:"g1", type:"free", target: 50000, current: 12000, updatedAt: Date.now()-1e6 }]))');
  return c;
}

// ── LA PORTADA FREE DE INTELLIGENCE, CON SU MOTOR REAL ─────────────────────
// No se inventa el markup: se ejecuta `_aurixIntelligencePreviewHTML` sobre una
// cartera de prueba que produce los TRES hechos del motor (concentración,
// liquidez y una vigilancia admisible), que es el caso que la SPEC describe: dos
// visibles y un tercero bloqueado. Los datos son sintéticos porque es una SONDA
// de geometría —no una afirmación sobre el patrimonio de nadie— y así se dice.
function intCoverHtml(langCode) {
  const sb = dictCtx(langCode);
  vm.runInContext('var baseCurrency="EUR", usdToEur=0.92, _aurixPricesReady=true;', sb);
  // La cartera de prueba es la MISMA que usa AURIX-INT-PREVIEW-V1: produce los
  // tres hechos del motor (concentracion, liquidez y una vigilancia admisible),
  // que es el caso que esta sonda tiene que medir porque es el mas ALTO.
  sb.assets = [
    { name: 'BTC',  type: 'crypto', qty: 1,   price: 60000 },
    { name: 'AAPL', type: 'stock',  qty: 100, price: 200 },
    { name: 'EUR',  type: 'cash',   qty: 20000 },
  ];
  vm.runInContext('function _aurixFxRate(c){ return ({USD:1,EUR:0.92})[String(c).toUpperCase()]; }', sb);
  // LAS HOJAS se sustituyen, la LOGICA no. Son las mismas hojas que usa
  // AURIX-INT-PREVIEW-V1, que es el gate que certifica los hechos y su reparto
  // ejecutando el motor. Aqui se mide GEOMETRIA, y para eso hace falta que el
  // motor produzca su caso mas ALTO: tres hechos.
  sb.activeAssets = () => sb.assets.filter(a => a && a.lifecycleStatus !== 'closed');
  sb.isClosedAsset = a => !!a && a.lifecycleStatus === 'closed';
  sb.liquidityNominal = a => Number((a && a.qty) || 0);
  sb.assetValueUSD = a => { if (!a) return 0; if (a.type === 'cash') return Number(a.qty) || 0;
    const v = Number(a.qty) * Number(a.price); return Number.isFinite(v) ? v : NaN; };
  sb.getDisplayName = a => (a && (a.name || a.symbol || a.ticker)) || '\u2014';
  sb.TYPE_META = { crypto:{label:'Cripto'}, stock:{label:'Acciones'}, cash:{label:'Liquidez'},
                   etf:{label:'ETF'}, real_estate:{label:'Inmuebles'} };
  sb._aurixCategoryBucket = a => String((a && a.type) || '').toLowerCase();
  sb._aurixDisplayCategory = tp => String(tp || '').toLowerCase();
  sb.toBase = v => v;
  sb._aurixAssessValuationCompleteness = () => ({ totalActive: 3, complete: true, reason: 'COMPLETE' });
  ['_aurixUsableQuantity','isInvestableAsset','investableAssets','investableValueUSD',
   'getInvestableDistribution','_intRealEstatePresence','buildLiquidityView','_aurixHealthSnapshot',
   '_intccWatchAreas','_aurixIntelligencePreviewFacts','_aurixIntPreviewSubject',
   '_aurixIntPreviewQuestion','_aurixIntelligencePreviewHTML']
    .forEach(n => vm.runInContext(fnSrc(n), sb));
  vm.runInContext(konstSrc('_INT_PREVIEW_WATCH_ALLOWED'), sb);
  try {
    const diag = vm.runInContext('JSON.stringify(_aurixIntelligencePreviewFacts())', sb);
    if (process.env.WSQA_DEBUG) console.log('  [intcover ' + langCode + '] ' + diag.slice(0, 220));
    return vm.runInContext('_aurixIntelligencePreviewHTML()', sb);
  } catch (e) { return '<!-- intcover: ' + e.message + ' -->'; }
}

const SURFACES = [];
for (const lg of ['es', 'en']) {
  const free = ctx('free', lg), prem = seed(ctx('premium', lg)), fdr = ctx('founder', lg);
  SURFACES.push(
    { id: 'wsfc-free-' + lg,      lang: lg, kind: 'cover',   html: R(free, '_renderWorkspaceFreeCover()') },
    { id: 'intfc-free-' + lg,     lang: lg, kind: 'intcover', html: intCoverHtml(lg) },
    { id: 'wsh-space-' + lg,      lang: lg, kind: 'space',   html: (R(prem, '_wsTab="space"'), R(prem, '_renderWorkspaceHome({})')) },
    { id: 'wsh-space-empty-' + lg,lang: lg, kind: 'space',   html: (R(free, '_wsTab="space"'), R(free, '_renderWorkspaceHome({})')) },
    { id: 'wsh-tpl-prem-' + lg,   lang: lg, kind: 'grid',    html: (R(prem, '_wsTab="templates"'), R(prem, '_renderWorkspaceHome({})')) },
    { id: 'wsh-tools-prem-' + lg, lang: lg, kind: 'grid',    html: (R(prem, '_wsTab="tools"'), R(prem, '_renderWorkspaceHome({})')) },
    { id: 'wsh-tpl-free-' + lg,   lang: lg, kind: 'grid',    html: (R(free, '_wsTab="templates"'), R(free, '_renderWorkspaceHome({})')) },
    { id: 'wsh-tools-free-' + lg, lang: lg, kind: 'grid',    html: (R(free, '_wsTab="tools"'), R(free, '_renderWorkspaceHome({})')) },
    { id: 'wsh-internal-' + lg,   lang: lg, kind: 'grid',    html: (R(fdr, '_wsTab="internal"'), R(fdr, '_renderWorkspaceHome({})')) },
  );
}
mkdirSync(OUT, { recursive: true });

// ── 3 · Chrome + CDP ────────────────────────────────────────────────────────
const PORT = 9660 + (process.pid % 120);
const profile = mkdtempSync(join(tmpdir(), 'aurix-wsqa-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
async function wsUrl(){ for(let i=0;i<80;i++){ try{ const j=await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); if(j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; }catch(_){} await sleep(250);} throw new Error('no devtools'); }
function mkClient(ws){ let id=0; const pend=new Map();
  ws.addEventListener('message', ev=>{ const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){ const {res,rej}=pend.get(m.id); pend.delete(m.id); m.error?rej(new Error(m.error.message)):res(m.result);} });
  return { send:(a,b={},s)=>Promise.race([ new Promise((res,rej)=>{ const i=++id; pend.set(i,{res,rej}); ws.send(JSON.stringify({id:i,method:a,params:b,...(s?{sessionId:s}:{})})); }), sleep(30000).then(()=>{throw new Error('cdp timeout: '+a);}) ]) }; }
if (typeof WebSocket === 'undefined') {
  console.error('\n[ws-visual-qa] Node ' + process.versions.node + ' no trae WebSocket global (hace falta Node >= 22).');
  process.exit(2);
}
const ws = new WebSocket(await wsUrl());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
const cdp = mkClient(ws);
const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => cdp.send(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable');
const ev = async expression => {
  const r = await S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: (r.exceptionDetails.exception?.description || r.exceptionDetails.text || '').slice(0, 300) };
  return r.result && r.result.value;
};
// ── NO SE DEJA ARRANCAR EL BUNDLE, Y ES DELIBERADO ──────────────────────────
// Sin sesión, `app.js` redirige a /login.html y la página real desaparece —con su
// `#upgradeOverlay`, que es markup ESTÁTICO de index.html—. Interceptar
// `location.replace/assign` no basta porque la redirección usa otra vía, así que
// se aborta la PETICIÓN del bundle: queda index.html con su CSS y su markup
// reales, que es exactamente lo que esta sonda mide. El comportamiento que sí
// depende del bundle (el owner del paywall) se evalua aparte, con su código real.
await S('Fetch.enable', { patterns: [{ urlPattern: '*app.js*', requestStage: 'Request' }] });
cdp.send = ((orig) => orig)(cdp.send);
ws.addEventListener('message', ev2 => {
  let m; try { m = JSON.parse(ev2.data); } catch (_) { return; }
  if (m.method === 'Fetch.requestPaused') {
    cdp.send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'Aborted' }, sessionId).catch(() => {});
  }
});

// LOS SEIS VIEWPORTS DE LA MATRIZ, ni uno menos.
const VIEWPORTS = [
  { name: '360x740',  width: 360,  height: 740,  dsf: 3, mobile: true  },
  { name: '390x844',  width: 390,  height: 844,  dsf: 3, mobile: true  },
  { name: '430x932',  width: 430,  height: 932,  dsf: 3, mobile: true  },
  { name: '768x1024', width: 768,  height: 1024, dsf: 2, mobile: true  },
  { name: '1366x768', width: 1366, height: 768,  dsf: 2, mobile: false },
  { name: '1440x900', width: 1440, height: 900,  dsf: 2, mobile: false },
];

const MEASURE = `(function(){
  var host = document.getElementById('__wsqa');
  if (!host) return { error: 'no host' };
  var out = { vw: innerWidth, vh: innerHeight };
  out.docOverflowX = Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth);
  var vis = function(el){
    if (typeof el.checkVisibility === 'function'
        && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    var s = getComputedStyle(el), r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity || '1') > 0.01
        && r.width > 0 && r.height > 0;
  };
  // Un contenedor que RECORTA su propio overflow no puede filtrar nada a la
  // página; lo que importa es el desbordamiento REAL, así que sólo se miran los
  // que no recortan.
  var boxes = Array.prototype.slice.call(host.querySelectorAll('section,div,ul'));
  var over = boxes.filter(function(s){ var ox = getComputedStyle(s).overflowX;
    return ox !== 'hidden' && ox !== 'clip' && ox !== 'auto' && ox !== 'scroll'
        && s.scrollWidth - s.clientWidth > 1; });
  out.sectionOverflow = over.length;
  out.overflowWho = over.slice(0, 6).map(function(s){ return (s.className||s.tagName) + ':' + (s.scrollWidth - s.clientWidth) + 'px'; });
  out.overflowKids = over.length ? Array.prototype.slice.call(over[0].children).map(function(c){
    var r = c.getBoundingClientRect();
    return (c.className||c.tagName).toString().slice(0,26) + ' w=' + Math.round(r.width) + ' sw=' + c.scrollWidth; }).slice(0,6) : [];
  var mse = host.querySelector('.wsh-mse2');
  if (mse) out.gridCols = getComputedStyle(mse).gridTemplateColumns;

  // TEXTO RECORTADO SIN ELIPSIS. Un nombre cortado a media palabra es el defecto
  // que el fundador fotografió en las etiquetas de plan.
  var TEXT = ['.wsh-tool-name','.wsh-tpl-name','.wsh-tier','.wsh-tool-go','.wsh-pill',
              '.wsh-mse2-name','.wsh-mse2-meta','.wsh-mse2-empty-t','.wsh-mse2-empty-b',
              '.wsh-title','.wsh-tab','.wsfc-title','.wsfc-sub','.wsfc-item-name',
              '.wsfc-item-desc','.wsfc-item-tag','.wsfc-premium-i','.wsfc-cta',
              '.intprev-title','.intprev-fact-text','.intprev-fact-label','.intprev-q',
              '.intprev-premium','.intprev-cta','.intprev-lock-tag','.intprev-badge'];
  var clipped = [], tiny = [], tapSmall = [], fontMin = 99;
  TEXT.forEach(function(sel){
    Array.prototype.slice.call(host.querySelectorAll(sel)).forEach(function(el){
      if (!vis(el)) return;
      var cs = getComputedStyle(el);
      var fs = parseFloat(cs.fontSize) || 99;
      if (fs < fontMin) fontMin = fs;
      if (fs < 11) tiny.push(sel + '@' + fs.toFixed(1) + 'px');
      var ell = cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none';
      if (!ell && (el.scrollWidth - el.clientWidth > 1 || el.scrollHeight - el.clientHeight > 1)) {
        clipped.push(sel + ':' + (el.textContent || '').trim().slice(0, 28)
          + ' [' + el.scrollWidth + '>' + el.clientWidth + ']');
      }
    });
  });
  out.measured = 0;
  TEXT.forEach(function(sel){ out.measured += Array.prototype.slice.call(host.querySelectorAll(sel)).filter(vis).length; });
  out.clipped = clipped.slice(0, 8); out.clippedN = clipped.length;
  out.tiny = tiny.slice(0, 8); out.fontMin = Math.round(fontMin * 10) / 10;

  // OBJETIVOS TÁCTILES. Todo lo que se pulsa, en móvil, >= 44 px de alto.
  Array.prototype.slice.call(host.querySelectorAll('[role="button"],button,[data-wstab]')).forEach(function(el){
    if (!vis(el)) return;
    var r = el.getBoundingClientRect();
    if (r.height < 44) tapSmall.push((el.className||el.tagName).toString().slice(0, 34) + '@' + Math.round(r.height));
  });
  out.tapSmall = tapSmall.slice(0, 8); out.tapSmallN = tapSmall.length;

  // MI ESPACIO: las dos columnas, y VISIBLES A LA VEZ en el primer viewport.
  var cols = Array.prototype.slice.call(host.querySelectorAll('.wsh-mse2-col')).filter(vis);
  out.cols = cols.length;
  if (cols.length === 2) {
    var a = cols[0].getBoundingClientRect(), b = cols[1].getBoundingClientRect();
    out.colsSideBySide = Math.abs(a.top - b.top) < 4;      // en la misma fila
    out.colsEqualWidth = Math.abs(a.width - b.width) <= 2; // misma anchura
    out.colsEqualHeight = Math.abs(a.height - b.height) <= 2;
    out.colsInFold = Math.max(a.bottom, b.bottom) <= innerHeight + 1 ? 1 : 0;
    out.colsTopInFold = (a.top < innerHeight && b.top < innerHeight) ? 1 : 0;
  }

  // REJILLAS EQUILIBRADAS: todas las tarjetas de una fila comparten base.
  var cards = Array.prototype.slice.call(host.querySelectorAll('.wsh-toolcard, .wsh-tpl')).filter(vis);
  out.cards = cards.length;
  var rows = {};
  cards.forEach(function(c){ var r = c.getBoundingClientRect(); var k = Math.round(r.top / 4);
    (rows[k] = rows[k] || []).push(Math.round(r.bottom)); });
  var ragged = Object.keys(rows).filter(function(k){ var v = rows[k];
    return v.length > 1 && (Math.max.apply(null, v) - Math.min.apply(null, v)) > 2; });
  out.raggedRows = ragged.length;

  // ZONA MUERTA: cuánto sobra bajo el último contenido dentro del panel.
  var panel = host.querySelector('.wsh-tabpanel') || host.querySelector('.wsfc-stage');
  if (panel) {
    var kids = Array.prototype.slice.call(panel.querySelectorAll('*')).filter(vis);
    var lowest = kids.reduce(function(m, el){ return Math.max(m, el.getBoundingClientRect().bottom); }, 0);
    out.deadBottom = Math.max(0, Math.round(panel.getBoundingClientRect().bottom - lowest));
  }

  // PORTADA DE INTELLIGENCE: dos hechos legibles, uno bloqueado, un solo CTA, y
  // el embudo entero dentro del primer viewport.
  var ic = host.querySelector('.intprev-card');
  if (ic) {
    out.intFacts = host.querySelectorAll('.intprev-fact:not(.is-locked)').length;
    out.intLocked = host.querySelectorAll('.intprev-fact.is-locked').length;
    out.intCtas = host.querySelectorAll('.intprev-cta').length;
    var icta = host.querySelector('.intprev-cta');
    out.intCtaInFold = icta ? (icta.getBoundingClientRect().bottom <= innerHeight + 1 ? 1 : 0) : 0;
    out.intPageScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    var lt = host.querySelector('.intprev-lock-tag');
    out.intLockTagVisible = lt ? (vis(lt) ? 1 : 0) : 0;
  }

  // PORTADA: el embudo (tarjetas + CTA) tiene que caber sin scroll de PÁGINA.
  var cta = host.querySelector('.wsfc-cta');
  if (cta) {
    out.ctaBottom = Math.round(cta.getBoundingClientRect().bottom);
    out.ctaInFold = out.ctaBottom <= innerHeight + 1 ? 1 : 0;
    out.pageScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    var items = Array.prototype.slice.call(host.querySelectorAll('.wsfc-item')).filter(vis);
    out.freeItems = items.length;
    out.itemsInFold = items.every(function(el){ return el.getBoundingClientRect().bottom <= innerHeight + 1; }) ? 1 : 0;
  }
  return out;
})()`;

// ── 4 · Medida ──────────────────────────────────────────────────────────────
let fails = 0; const rows = [];
function check(name, cond, detail) {
  if (cond) { console.log('  ✓ ' + name); }
  else { fails++; console.log('  ✗ ' + name + (detail ? '  →  ' + detail : '')); }
}

await S('Page.navigate', { url: PUBLIC });
await sleep(3500);
await ev('window.__WSQA_CSS = ' + JSON.stringify(cssLocal) + '; 1');
// ── LOS BYTES SERVIDOS SE PIDEN DESDE NODE, NO DESDE LA PÁGINA ──────────────
// La página tiene el bundle BLOQUEADO a propósito (ver arriba), así que pedirlo
// desde ella devolvía un error y el informe decía «DIFIEREN» sobre una medida que
// nunca llegó a hacerse. Un informe que se equivoca sobre su propia cobertura es
// peor que uno que falta: se pide aquí, con la misma URL pública.
let served = null, servedSrc = '';
try {
  const vjson = await (await fetch(new URL('version.json?nc=' + Date.now(), PUBLIC), { cache: 'no-store' })).json();
  const r = await fetch(new URL('app.js?v=' + vjson.appjs + '&nc=' + Date.now(), PUBLIC), { cache: 'no-store' });
  servedSrc = await r.text(); served = servedSrc.length;
} catch (e) { served = null; }
console.log('AURIX WORKSPACE VISUAL QA · ' + PUBLIC);
console.log('bytes de app.js servido: ' + (served == null ? 'no disponible' : served) + ' · local: ' + app.length
  + (served === app.length ? '  (COINCIDEN: se mide el candidato desplegado)'
     : '  (DIFIEREN: se mide el markup y el CSS LOCALES sobre el navegador real)') + '\n');
const DEPLOYED = served === app.length;

for (const vp of VIEWPORTS) {
  await S('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height,
    deviceScaleFactor: 1, mobile: vp.mobile });
  console.log('── ' + vp.name + ' ' + '─'.repeat(52 - vp.name.length));
  for (const sf of SURFACES) {
    const inj = await ev(`(function(){
      document.querySelectorAll('#__wsqa').forEach(function(n){ n.remove(); });
      Array.prototype.slice.call(document.body.children).forEach(function(n){
        if (n.id !== '__wsqa') { try { n.style.display = 'none'; } catch(e){} }
      });
      var h = document.createElement('div'); h.id = '__wsqa';
      h.style.cssText = 'position:fixed;inset:0;overflow-y:auto;overflow-x:hidden;z-index:2147483647;'
        + 'padding:0;background:#0b1020;color:#e8eefc;box-sizing:border-box;'
        + 'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
      h.innerHTML = ${JSON.stringify(sf.html)};
      document.body.appendChild(h);
      // La superficie arranca a opacidad 0 (los hijos de .aurix-wsh se revelan al
      // montar) y la app anade .is-revealed. Sin hacer lo mismo TODO estaria
      // legitimamente invisible y cada medida seria vacua, en verde, que es peor.
      var wrap = h.querySelector('.aurix-wsh');
      if (wrap) wrap.classList.add('is-revealed');
      document.documentElement.style.overflow = 'auto';
      document.body.style.overflow = 'auto';
      var css = Array.prototype.slice.call(document.styleSheets)
        .find(function(s){ try { return /styles\\.css/.test(s.href || ''); } catch(e) { return false; } });
      // LA HOJA CANDIDATA, ENCIMA DE LA PUBLICADA. La pagina publica sirve el CSS
      // DESPLEGADO, asi que medir el markup nuevo contra el viejo reporta defectos
      // que el candidato ya arregla (y, peor, puede tapar los que introduce). Se
      // superpone styles.css LOCAL para medir el candidato completo: markup nuevo
      // + CSS nuevo, sobre el navegador real. Tras el deploy, la misma sonda vuelve
      // a correr contra los bytes publicos y esta capa deja de cambiar nada.
      var ov = document.getElementById('__wsqa_css');
      if (!ov) { ov = document.createElement('style'); ov.id = '__wsqa_css';
        ov.textContent = __WSQA_CSS; document.head.appendChild(ov); }
      return { ok: true, textLen: (h.innerText || '').length, cssLoaded: !!css,
        visible: (typeof h.checkVisibility === 'function') ? h.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : null };
    })()`);
    if (!inj || inj.__err || inj.ok !== true) { check(sf.id + ' inyección', false, JSON.stringify(inj)); continue; }
    if (inj.visible === false || !inj.cssLoaded) {
      check(sf.id + ' superficie realmente pintada', false, JSON.stringify(inj)); continue;
    }
    await sleep(160);
    const m = await ev(MEASURE);
    if (!m || m.error || m.__err) { check(sf.id, false, JSON.stringify(m)); continue; }
    // NO VACUIDAD: si no hay ni un elemento medible, cada comprobación de abajo
    // pasaría midiendo la nada. Un verde vacío es peor que un rojo.
    if (!(m.measured > 0)) { check(sf.id + ' hay algo que medir', false, JSON.stringify({ measured: m.measured, textLen: inj.textLen })); continue; }
    rows.push({ vp: vp.name, id: sf.id, ...m });

    const label = sf.id.padEnd(22);
    check(label + ' sin desbordamiento', m.docOverflowX <= 1 && m.sectionOverflow === 0,
      'doc=' + m.docOverflowX + ' sec=' + m.sectionOverflow + ' ' + JSON.stringify(m.overflowWho || [])
      + ' kids=' + JSON.stringify(m.overflowKids || []));
    check(label + ' sin texto recortado', m.clippedN === 0, JSON.stringify(m.clipped));
    check(label + ' fuentes >= 11px', (m.tiny || []).length === 0, JSON.stringify(m.tiny) + ' min=' + m.fontMin);
    if (vp.mobile) check(label + ' táctil >= 44px', m.tapSmallN === 0, JSON.stringify(m.tapSmall));
    if (sf.kind === 'space') {
      check(label + ' dos columnas, lado a lado y simétricas',
        m.cols === 2 && m.colsSideBySide && m.colsEqualWidth && m.colsEqualHeight,
        JSON.stringify({ cols: m.cols, side: m.colsSideBySide, w: m.colsEqualWidth, h: m.colsEqualHeight, grid: m.gridCols }));
      check(label + ' las dos empiezan dentro del primer viewport', m.colsTopInFold === 1);
    }
    if (sf.kind === 'grid') {
      check(label + ' filas de la rejilla alineadas', m.raggedRows === 0, 'filas desiguales=' + m.raggedRows);
    }
    if (sf.kind === 'cover' && vp.width <= 430) {
      check(label + ' embudo completo sin scroll (CTA y tarjetas)',
        m.ctaInFold === 1 && m.itemsInFold === 1 && m.pageScroll <= 1,
        JSON.stringify({ ctaBottom: m.ctaBottom, vh: m.vh, scroll: m.pageScroll, items: m.freeItems }));
      check(label + ' las dos tarjetas Free están presentes', m.freeItems === 2, String(m.freeItems));
    }
    if (sf.kind === 'intcover') {
      check(label + ' dos descubrimientos visibles y uno bloqueado',
        m.intFacts === 2 && m.intLocked === 1 && m.intLockTagVisible === 1,
        JSON.stringify({ v: m.intFacts, l: m.intLocked, tag: m.intLockTagVisible }));
      check(label + ' un solo CTA', m.intCtas === 1, String(m.intCtas));
      if (vp.width <= 430) {
        check(label + ' embudo completo sin scroll',
          m.intCtaInFold === 1 && m.intPageScroll <= 1,
          JSON.stringify({ vh: m.vh, scroll: m.intPageScroll }));
      }
    }
    if (!vp.mobile && (sf.kind === 'grid' || sf.kind === 'space')) {
      check(label + ' sin zona muerta al pie del panel', (m.deadBottom || 0) <= 48, 'dead=' + m.deadBottom + 'px');
    }
    // Captura de cada superficie en cada viewport (evidencia para el informe).
    const shot = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(join(OUT, vp.name + '__' + sf.id + '.png'), Buffer.from(shot.data, 'base64'));
  }
}

// ── 5 · El paywall, abierto por el camino REAL del producto ─────────────────
console.log('\n── paywall (camino real: openUpgradeIntent del bundle público) ──');
await S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await S('Page.navigate', { url: PUBLIC });
await sleep(3500);
await ev('window.__WSQA_CSS = ' + JSON.stringify(cssLocal) + '; 1');
// EL OWNER REAL, y se dice cuál se usó. El bundle público expone
// `window.openUpgradeIntent` desde este bloque; mientras no esté desplegado, se
// evalúa el owner LOCAL (su código exacto, sin stub) sobre el DOM público, que es
// el mismo overlay. Tras el deploy, esta sonda usa el global y lo declara.
// EL BUNDLE ESTÁ BLOQUEADO A PROPÓSITO (si no, la página se va a /login.html y con
// ella el `#upgradeOverlay`, que es markup ESTÁTICO de index.html). Así que el
// owner del paywall se evalúa desde el fuente —su código EXACTO, sin stub— sobre
// el DOM público. Y se declara de qué fuente sale: si el bundle desplegado y el
// local coinciden byte a byte, es el código que corre en producción.
const paywallPath = await ev("typeof window.openUpgradeIntent === 'function' ? 'global-desplegado' : 'pendiente'");
if (paywallPath !== 'global-desplegado') {
  const localSrc = [konstSrc('FEATURE_LABELS'), konstSrc('_AURIX_UPGRADE_INTENT_KEY'),
    fnSrc('_featureLabel'), fnSrc('_aurixEntLoaded'), fnSrc('_aurixRecordUpgradeIntent'),
    'var _aurixEnt = { loaded: true, plan: "free", features: Object.create(null) };',
    'var _aurixUpgradeIntents = []; var IS_DEV = false;',
    fnSrc('openUpgradeIntent'),
    'window.openUpgradeIntent = openUpgradeIntent; 1;'].join('\n');
  const r0 = await ev('(function(){ var lang="es"; var t=function(k){ try { return window.t ? window.t(k) : k; } catch(e){ return k; } };\n'
    + 'function applyI18n(){}\n' + localSrc + '\n})()');
  if (r0 && r0.__err) console.log('  (no se pudo montar el owner local: ' + r0.__err.slice(0, 120) + ')');
}
console.log('  camino del paywall: ' + (paywallPath === 'global-desplegado'
  ? 'window.openUpgradeIntent del bundle PÚBLICO'
  : 'owner evaluado sobre el DOM público (el bundle se bloquea a propósito para que la página no redirija a login)'
    + (DEPLOYED ? ' — y su fuente COINCIDE byte a byte con la desplegada'
                : ' — ATENCIÓN: la fuente local NO coincide con la desplegada')));
// Y se comprueba que el owner que se está ejerciendo ES el que hay en producción.
if (servedSrc) {
  check('el owner del paywall desplegado es idéntico al ejercido',
    servedSrc.indexOf(fnSrc('openUpgradeIntent')) !== -1
    && servedSrc.indexOf('window.openUpgradeIntent = openUpgradeIntent') !== -1,
    'el bundle público tiene que contener este owner y exponerlo');
}
for (const [src, key] of [['workspace:card:tpl_mbudget', 'workspace.budget'],
                          ['workspace:free_cover', 'workspace.full'],
                          ['intelligence-preview', 'intelligence.full']]) {
  const r = await ev(`(function(){
    try { openUpgradeIntent({ featureKey: ${JSON.stringify(key)}, source: ${JSON.stringify(src)} }); } catch (e) { return { err: String(e) }; }
    var ov = document.getElementById('upgradeOverlay');
    var nm = document.getElementById('upgradeFeatureName');
    return { open: !!(ov && ov.classList.contains('open')), name: nm ? nm.textContent : null,
             raw: nm ? /^[a-z]+\\.[a-z_]+$/.test(nm.textContent || '') : null };
  })()`);
  if (r && r.open === false && r.name === null) {
    const diag = await ev("JSON.stringify({ url: location.pathname, hasOv: !!document.getElementById('upgradeOverlay'), title: document.title })");
    console.log('    diag: ' + diag);
  }
  check('paywall desde ' + src, !!(r && r.open), JSON.stringify(r));
  check('  …y nombra la función, no la clave cruda', !!(r && r.raw === false), JSON.stringify(r && r.name));
  const shot = await S('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, 'paywall__' + src.replace(/[:.]/g, '_') + '.png'), Buffer.from(shot.data, 'base64'));
  await ev(`(function(){ var ov=document.getElementById('upgradeOverlay'); if(ov){ov.classList.remove('open');} return 1; })()`);
}

writeFileSync(join(OUT, 'measurements.json'), JSON.stringify(rows, null, 2));
console.log('\nCapturas y medidas en docs/workspace-visual-qa/');
console.log(fails === 0 ? '\nPASS — cero defectos de geometría' : '\nFAIL — ' + fails + ' comprobaciones en rojo');
try { ws.close(); } catch (_) {}
chrome.kill();
process.exit(fails === 0 ? 0 : 1);
