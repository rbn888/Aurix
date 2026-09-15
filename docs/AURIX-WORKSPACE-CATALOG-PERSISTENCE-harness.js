'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-WORKSPACE-CATALOG-PERSISTENCE — SPEC WORKSPACE COMPLETION · §1 / §4
// ════════════════════════════════════════════════════════════════════════════
// DOS COSAS, y las dos eran agujeros REALES en HEAD:
//
// 1 · EL GATE NO CUBRÍA TRES SUPERFICIES. `_wsOpenTool` tenía su gate de
//     publicación + entitlement desde M.02, pero Objetivos, Escenarios y
//     Proyección NO pasan por él: se abrían asignando `_wshView` en SEIS sitios
//     distintos (catálogo, navegación, elemento fijado, proyecto guardado…) y
//     ninguno comprobaba nada. La protección existía para siete claves y no para
//     estas tres, así que una ruta directa las abría sin derecho.
//
// 2 · NO HABÍA PERSISTENCIA POR CUENTA. Las diez claves `aurix_ws_*_v1` son
//     localStorage de UN dispositivo —lo dice app.js en dos sitios— y ésa fue la
//     razón por la que WORKSPACE-LAUNCH-V1 publicó sólo las dos calculadoras. Las
//     seis plantillas del catálogo canónico guardan trabajo del usuario. Doce
//     `setItem` repartidos y ningún owner: nadie podía saber que algo se había
//     guardado, así que no había forma de sincronizar ni de publicar un estado
//     honesto.
//
// Y la regla que gobierna la publicación: `published` sólo puede ser true cuando
// existe un derecho REAL que la conceda. Los dos SQL están escritos y SIN APLICAR.
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
function konstSrc(name){ const s='const '+name+' ='; const i=app.indexOf(s); if(i<0) throw new Error('missing const '+name);
  let k=i, depth=0, started=false; for(;k<app.length;k++){ const c=app[k]; if(c==='('||c==='{'||c==='[') {depth++;started=true;} else if(c===')'||c==='}'||c===']') depth--; else if(c===';'&&(!started||depth===0)) { k++; break; } }
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c,info){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(info?'  ['+info+']':''));} }

console.log('AURIX-WORKSPACE-CATALOG-PERSISTENCE — §1 catálogo y gate · §4 persistencia\n');

// ════════════════════════════════════════════════════════════════════════════
// 1 · EL CATÁLOGO CANÓNICO
// ════════════════════════════════════════════════════════════════════════════
console.log('1 · Una capacidad, un ID, un hogar público:');
function catCtx(founder) {
  const sb = { Math, Number, String, Object, Array, JSON, console: { warn(){} } };
  vm.createContext(sb);
  sb._aurixEntIsCatalogPreview = () => !!founder;
  sb.hasFeature = k => !!founder;
  ['_WS_CATALOG','_WS_TOOLKEY_TO_ID','_WS_VIEW_SURFACES'].forEach(n => vm.runInContext(konstSrc(n), sb));
  ['_wsCatalogEntry','_wsSurfaceEntry','_wsToolFeatureKey','_wsCatalogVisible','_wsCatalogFor','_wsToolAccess']
    .forEach(n => vm.runInContext(fnSrc(n), sb));
  return sb;
}
const FREE = catCtx(false), FOUNDER = catCtx(true);
const run = (e, c) => vm.runInContext(e, c);
const CAT = run('_WS_CATALOG', FREE);
{
  // El catálogo declarado por la SPEC, con su tier. OCHO y no nueve: Seguimiento de
  // precios se queda INTERNA por la regla que §J trae consigo (ver 1.9).
  const SPEC = {
    tpl_realestate: ['template', 'free'],
    tpl_mbudget:    ['template', 'premium'], tpl_receivables: ['template', 'premium'],
    tpl_journal:    ['template', 'premium'], tpl_goals:       ['template', 'premium'],
    compound_growth: ['tool', 'free'], loan_simulation: ['tool', 'premium'],
    scenario:        ['tool', 'premium'],
  };
  ok('1.1 las ocho capacidades publicables del catálogo canónico existen con su kind y su tier',
    Object.keys(SPEC).every(id => { const e = CAT.find(x => x.id === id);
      return e && e.kind === SPEC[id][0] && e.commercialTier === SPEC[id][1]; }),
    JSON.stringify(Object.keys(SPEC).filter(id => { const e = CAT.find(x => x.id === id);
      return !(e && e.kind === SPEC[id][0] && e.commercialTier === SPEC[id][1]); })));
  ok('1.2 toda entrada Premium declara su featureKey (nada «Premium» decorativo)',
    CAT.filter(e => e.commercialTier === 'premium').every(e => !!e.featureKey),
    JSON.stringify(CAT.filter(e => e.commercialTier === 'premium' && !e.featureKey).map(e => e.id)));
  ok('1.3 y las Free NO declaran ninguna: lo incluido no se gatea',
    CAT.filter(e => e.commercialTier === 'free').every(e => !e.featureKey));
  // UN HOGAR. Dos entradas publicadas para la misma superficie hacen que
  // `_wsSurfaceEntry` devuelva null y el acceso DENIEGUE — es fail-closed, no un
  // reparto. Así que no puede haberlas.
  ok('1.4 ninguna superficie tiene DOS entradas publicadas peleándose por ella',
    (() => { const opens = {}; let dup = false;
      CAT.filter(e => e.published && e.opens).forEach(e => {
        if (opens[e.opens]) dup = true; opens[e.opens] = e.id; });
      return !dup; })());
  ok('1.5 cada plantilla Premium declara qué superficie abre',
    ['tpl_mbudget','tpl_receivables','tpl_journal','tpl_goals']
      .every(id => !!(CAT.find(e => e.id === id) || {}).opens),
    JSON.stringify(['tpl_mbudget','tpl_receivables','tpl_journal','tpl_goals']
      .map(id => id + ':' + (CAT.find(e => e.id === id) || {}).opens)));
  // ── §J · LA EXCEPCIÓN DE SEGUIMIENTO DE PRECIOS, DECLARADA ────────────────
  // §J pide que aporte valor distinto a Market y que, si sigue siendo redundante,
  // se mantenga interna «explicando la excepción al fundador; no vender una copia».
  // Las dos condiciones se cumplen: la watchlist ya existe en Market —y además
  // sincroniza— y lo construido aquí responde la misma pregunta que el Diario. Así
  // que el gate no exige publicarla: exige que siga interna Y que el motivo esté
  // escrito, porque una decisión sin motivo escrito se revierte sin darse cuenta.
  ok('1.9 Seguimiento de precios sigue interna y sin clave vendible',
    (() => { const e = CAT.find(x => x.id === 'tpl_assets');
      return e && e.published === false && e.featureKey === null
        && e.commercialTier === 'undecided'; })(),
    JSON.stringify(CAT.find(x => x.id === 'tpl_assets')));
  ok('1.10 …y su excepción está EXPLICADA en el catálogo, no sólo aplicada',
    /§J · SE QUEDA INTERNA, Y LA EXCEPCIÓN SE EXPLICA/.test(app)
    && /no vender una copia/.test(app) && /la watchlist/i.test(app));
  // ── LA CONDICIÓN DE DIVISAS, PEGADA A LA ENTRADA ──────────────────────────
  // Los totales de Diario y Precios suman importes con `currency` POR FILA sin
  // convertir. Hoy no hace daño (internas + formulario en EUR), pero el día que
  // alguien las publique el campo ya estará ahí. La condición vive junto a la
  // entrada del catálogo y no en un informe, y este gate impide que se pierda.
  ok('1.10b la condición de divisas está escrita junto a las dos entradas afectadas',
    /CONDICIÓN DE PUBLICACIÓN, Y VA AQUÍ A PROPÓSITO/.test(app)
    && /sin cerrar antes/.test(app)
    && /misma condición de divisas que `tpl_assets`/.test(app));
  ok('1.10c y las dos siguen internas mientras la condición no se cierre',
    ['tpl_assets', 'tpl_journal'].every(id => (CAT.find(e => e.id === id) || {}).published === false));
  ok('1.11 su matemática SÍ se corrigió, aunque siga interna',
    /§J \/ §E — EL AGREGADO SALE DE IMPORTES/.test(app)
    && /averageReturnBasis/.test(app));
  // Los INTERNOS que la SPEC nombra, y que no pueden publicarse por solapamiento.
  const MUST_STAY_INTERNAL = ['financial_calc','investment_analyzer','tpl_property',
    'tpl_networth','tpl_business','tpl_projection','tpl_fire','tpl_scenario',
    'monthly_budget','trade_journal','receivables','asset_prices','real_estate_portfolio','goal'];
  ok('1.6 los catorce internos declarados siguen sin publicar',
    MUST_STAY_INTERNAL.every(id => { const e = CAT.find(x => x.id === id); return e && e.published === false; }),
    JSON.stringify(MUST_STAY_INTERNAL.filter(id => (CAT.find(x => x.id === id) || {}).published !== false)));
  ok('1.7 un usuario normal NO ve ni una entrada interna',
    run('_wsCatalogFor("tool")', FREE).every(e => e.published === true)
    && run('_wsCatalogFor("template")', FREE).every(e => e.published === true));
  ok('1.8 y el founder SÍ ve el inventario completo',
    run('_wsCatalogFor("tool")', FOUNDER).length + run('_wsCatalogFor("template")', FOUNDER).length === CAT.length);
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · NADA SE PUBLICA ANTES DE QUE EXISTA SU DERECHO
// ════════════════════════════════════════════════════════════════════════════
console.log('\n2 · Publicar exige un derecho real, no una etiqueta:');
{
  const planSql = read('db/workspace_premium_2_plan_features.sql');
  const docSql  = read('db/workspace_documents_1.sql');
  const NEW_KEYS = ['workspace.budget','workspace.receivables','workspace.journal',
                    'workspace.goals','workspace.scenarios'];
  ok('2.1 las cinco claves nuevas se conceden a premium y se NIEGAN a free en el SQL',
    NEW_KEYS.every(k => new RegExp("'premium',\\s*'" + k.replace('.', '\\.') + "',\\s*true").test(planSql)
                     && new RegExp("'free',\\s*'" + k.replace('.', '\\.') + "',\\s*false").test(planSql)),
    JSON.stringify(NEW_KEYS.filter(k => !new RegExp("'premium',\\s*'" + k.replace('.', '\\.') + "',\\s*true").test(planSql))));
  ok('2.2 el SQL es idempotente y no destruye filas existentes',
    /on conflict \(plan, feature_key\) do update/.test(planSql)
    && !/delete from public\.plan_features/i.test(planSql)
    && !/truncate/i.test(planSql));
  ok('2.3 …y declara que está SIN APLICAR',
    /SIN APLICAR/.test(planSql) && /SIN APLICAR/.test(docSql.toUpperCase().replace('NOT YET APPLIED','SIN APLICAR')));
  // MIENTRAS NO SE APLIQUE, NO SE PUBLICA. Es la condición que impide vender algo
  // que el resolver denegaría.
  ok('2.4 ninguna capacidad que dependa del SQL nuevo está publicada',
    CAT.filter(e => NEW_KEYS.indexOf(e.featureKey) !== -1).every(e => e.published === false),
    JSON.stringify(CAT.filter(e => NEW_KEYS.indexOf(e.featureKey) !== -1 && e.published).map(e => e.id)));
  ok('2.4b y el SQL NO concede la clave de la capacidad que se quedó interna',
    !/'premium',\s*'workspace\.prices'/.test(planSql)
    && /Seguimiento de precios: NO SE INCLUYE/.test(planSql),
    'workspace.prices no puede venderse si no se publica');
  ok('2.5 y lo que YA estaba publicado sigue publicado (el estado público previo se conserva)',
    ['compound_growth','loan_simulation','tpl_realestate']
      .every(id => (CAT.find(e => e.id === id) || {}).published === true));
  // La tabla de documentos: aditiva, fail-closed y sin DELETE desde el cliente.
  ok('2.6 la tabla de documentos es aditiva y no toca nada existente',
    /create table if not exists public\.workspace_documents/.test(docSql)
    && !/alter table public\.(user_portfolios|portfolio_snapshots|capital_flows)/.test(docSql)
    && !/drop table/i.test(docSql));
  ok('2.7 RLS activada Y forzada, con política por usuario',
    /enable row level security/.test(docSql) && /force  row level security/.test(docSql)
    && /auth\.uid\(\) = user_id/.test(docSql));
  ok('2.8 sin política DELETE: un borrado es tombstone, no destrucción',
    !/for delete/i.test(docSql) && /deleted_at/.test(docSql));
  ok('2.9 y `anon` queda sin privilegios (la lección de U1: la RLS no puede ser la única barrera)',
    /revoke all privileges on table public\.workspace_documents\s+from anon/.test(docSql));
  ok('2.10 la autoridad es la REVISIÓN, no el reloj',
    /revision/.test(docSql) && /nunca el arbitro|never the arbiter/i.test(docSql));
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · EL GATE CUBRE TAMBIÉN LAS RUTAS DIRECTAS
// ════════════════════════════════════════════════════════════════════════════
console.log('\n3 · Objetivos, Escenarios y Proyección ya no se abren a mano:');
{
  ok('3.1 no queda ningún `_wshView = ' + "'goals'" + '` suelto en app.js',
    !/_wshView = 'goals'/.test(app) && !/_wshView = 'scenario'/.test(app)
    && !/_wshView = 'planning'/.test(app));
  ok('3.2 existe UN owner de apertura de superficie y consulta el acceso',
    /function _wsOpenSurface\(/.test(app) && /const acc = _wsToolAccess\(k\);/.test(app));
  ok('3.3 las cuatro superficies de vista están declaradas',
    JSON.stringify(run('_WS_VIEW_SURFACES', FREE)) === JSON.stringify(['goals','scenario','projection','planning']));
  // Y resuelven a una entrada real del catálogo, que es lo que permite decidir.
  ok('3.4 cada superficie de vista resuelve a una entrada del catálogo',
    ['goals','scenario','projection','planning'].every(k => !!run('_wsSurfaceEntry(' + JSON.stringify(k) + ')', FREE)),
    JSON.stringify(['goals','scenario','projection','planning']
      .map(k => k + ':' + JSON.stringify(!!run('_wsSurfaceEntry(' + JSON.stringify(k) + ')', FREE)))));
  // FAIL-CLOSED para un usuario normal mientras sigan internas.
  ok('3.5 un usuario normal NO puede abrir Escenarios hoy (no publicado)',
    run('_wsToolAccess("scenario")', FREE).ok === false
    && run('_wsToolAccess("scenario")', FREE).reason === 'unpublished');
  ok('3.6 …ni Objetivos', run('_wsToolAccess("goals")', FREE).ok === false);
  ok('3.7 y «no publicado» NO se disfraza de «Premium»',
    run('_wsToolAccess("goals")', FREE).reason === 'unpublished',
    run('_wsToolAccess("goals")', FREE).reason);
  ok('3.8 el founder sí puede abrirlas', run('_wsToolAccess("scenario")', FOUNDER).ok === true);
  // Lo ya publicado no se rompe.
  ok('3.9 compound sigue abierto para todos y realestate sigue siendo Free',
    run('_wsToolAccess("compound")', FREE).ok === true
    && run('_wsToolAccess("realestate")', FREE).ok === true);
  ok('3.10 el upgrade sólo se ofrece cuando la razón ES comercial',
    /if \(acc\.reason === 'entitlement'\)/.test(fnSrc('_wsOpenSurface')));
}

// ════════════════════════════════════════════════════════════════════════════
// 4 · PERSISTENCIA: UN OWNER, Y UN ESTADO QUE NO MIENTE
// ════════════════════════════════════════════════════════════════════════════
console.log('\n4 · Guardar, y decir la verdad sobre dónde:');
{
  ok('4.1 ningún escritor de Workspace hace `setItem` por su cuenta',
    (app.match(/localStorage\.setItem\(_WSH_/g) || []).length === 0,
    String((app.match(/localStorage\.setItem\(_WSH_/g) || []).length));
  ok('4.2 los doce pasan por el owner único',
    (app.match(/_wshWriteStore\(/g) || []).length >= 12,
    String((app.match(/_wshWriteStore\(/g) || []).length));
  // El estado, con las dos formas de éxito SEPARADAS.
  function syncCtx(tableState, syncState) {
    const sb = { Math, Number, String, Object, Array, JSON, Date, console: { warn(){} } };
    vm.createContext(sb);
    sb.t = k => ({ ws_sync_idle: 'idle', ws_sync_saving: 'saving',
                   ws_sync_saved_synced: 'synced', ws_sync_saved_local: 'local',
                   ws_sync_error: 'error', ws_sync_retry: 'retry' })[k] || '';
    sb._intccEsc = x => String(x);
    // El estado es ahora POR DOCUMENTO, así que su owner y su tabla de severidad
    // entran también: sin ellos el estado global no se puede derivar.
    vm.runInContext(konstSrc('_WS_SYNC_SEVERITY'), sb);
    vm.runInContext('var _wsDocSync = Object.create(null);', sb);
    vm.runInContext(fnSrc('_wsDocSyncWorst'), sb);
    vm.runInContext(fnSrc('_wsSyncStatus'), sb);
    vm.runInContext(fnSrc('_wsSyncBadgeHtml'), sb);
    vm.runInContext('var _wsDocTableState = ' + JSON.stringify(tableState)
      + '; var _wsDocSyncState = ' + JSON.stringify(syncState) + '; var _wsDocSyncAt = 0;', sb);
    return sb;
  }
  const st = (tbl, sy) => vm.runInContext('_wsSyncStatus()', syncCtx(tbl, sy));
  ok('4.3 guardado SIN tabla remota se llama «en este dispositivo», nunca sincronizado',
    st('no', 'saved').labelKey === 'ws_sync_saved_local' && st('no', 'saved').synced === false,
    JSON.stringify(st('no', 'saved')));
  ok('4.4 guardado sin sesión tampoco se llama sincronizado',
    st('unknown', 'local_only').labelKey === 'ws_sync_saved_local'
    && st('unknown', 'local_only').synced === false);
  ok('4.5 sólo se llama sincronizado cuando la escritura remota OCURRIÓ',
    st('yes', 'saved').labelKey === 'ws_sync_saved_synced' && st('yes', 'saved').synced === true);
  ok('4.6 …y una tabla que «debería existir» no basta: hace falta que haya escrito',
    st('unknown', 'saved').synced === false && st('yes', 'saving').synced === false,
    JSON.stringify([st('unknown', 'saved').labelKey, st('yes', 'saving').labelKey]));
  ok('4.7 los cinco estados que §4 pide existen y son distinguibles',
    new Set(['idle','saving','saved','error','local_only']
      .map(x => st('yes', x).labelKey)).size >= 4
    && st('yes', 'error').labelKey === 'ws_sync_error');
  ok('4.8 el error ofrece reintentar, y ningún otro estado lo hace',
    st('yes', 'error').canRetry === true
    && ['idle','saving','saved','local_only'].every(x => st('yes', x).canRetry === false));
  ok('4.9 la insignia publica el estado en el DOM para que la QA lo pueda leer',
    /data-ws-sync="/.test(vm.runInContext('_wsSyncBadgeHtml()', syncCtx('yes', 'saved')))
    && /data-ws-synced="1"/.test(vm.runInContext('_wsSyncBadgeHtml()', syncCtx('yes', 'saved')))
    && /data-ws-synced="0"/.test(vm.runInContext('_wsSyncBadgeHtml()', syncCtx('no', 'saved'))));
  // Y el detalle que evita una petición por tecla.
  ok('4.10 las subidas se agrupan por pausa, no una por pulsación',
    /_WS_DOC_PUSH_DEBOUNCE_MS/.test(app) && /clearTimeout\(_wsDocTimers\[key\]\)/.test(app)
    && /_wsDocsQueue\(key\)/.test(fnSrc('_wshWriteStore')));
  ok('4.11 sólo un error de ESQUEMA retira la tabla; un fallo de red se reintenta',
    /const schema = \/relation\|does not exist\|pgrst205\|42p01\|schema cache\//.test(app)
    && /if \(schema\) _wsDocTableState = 'no';/.test(app));
  ok('4.12 la lectura remota AÑADE y ACTUALIZA, nunca sustituye la lista local',
    (() => { const src = fnSrc('_wsDocsPull');
      return /remoteRev > \(Number\(cur\.revision\) \|\| 1\)/.test(src)
        && !/localStorage\.setItem\(key, JSON\.stringify\(mine/.test(src)
        && /if \(r\.deleted_at\) continue;/.test(src); })());
  ok('4.13 un documento sin id estable NO se sube (subirlo duplicaría en cada guardado)',
    /if \(!id\) return null;/.test(fnSrc('_wsDocRows')));
  // AISLAMIENTO: ya resuelto, y no se reimplementa. Se comprueba que sigue cubierto.
  ok('4.14 las diez claves de Workspace siguen en el aparcado por cuenta',
    (() => { const k = konstSrc('USER_SCOPED_WORK_KEYS');
      return ['goals','scenarios','projects','planning','tool_state','pinned','recent',
              'space_hidden','space_top','goal_funding']
        .every(n => k.indexOf('aurix_ws_' + n + '_v1') !== -1); })(),
    konstSrc('USER_SCOPED_WORK_KEYS').replace(/\s+/g, ' ').slice(0, 120));
  ok('4.15 la procedencia viaja con el documento (plan/simulación, nunca medición)',
    (() => { const src = fnSrc('_wsDocRows');
      return /nature:/.test(src) && /'simulated'/.test(src) && /'declared'/.test(src)
        && !/'observed'/.test(src); })());
  ok('4.16 y la moneda en que se escribió, para que un cambio de base no reinterprete',
    /currency: ccy/.test(fnSrc('_wsDocRows')) && /body_version/.test(fnSrc('_wsDocRows')));
}

// ════════════════════════════════════════════════════════════════════════════
// 5 · PARIDAD i18n
// ════════════════════════════════════════════════════════════════════════════
console.log('\n5 · Las claves nuevas existen en los dos idiomas:');
{
  const KEYS = ['ws_sync_idle','ws_sync_saving','ws_sync_saved_synced','ws_sync_saved_local',
                'ws_sync_error','ws_sync_retry'];
  const occ = k => (app.match(new RegExp('\\n    ' + k + ':', 'g')) || []).length;
  ok('5.1 las seis claves de estado están en ES y en EN',
    KEYS.every(k => occ(k) === 2), JSON.stringify(KEYS.map(k => k + ':' + occ(k))));
  ok('5.2 y ninguna dice «sincronizado» en la variante local',
    !/ws_sync_saved_local:\s*'[^']*incroniz/.test(app)
    && !/ws_sync_saved_local:\s*'[^']*ynced/.test(app));
}

// ════════════════════════════════════════════════════════════════════════════
// 6 · «SINCRONIZADO» ES POR DOCUMENTO Y EXIGE CONFIRMACIÓN DEL SERVIDOR
// ════════════════════════════════════════════════════════════════════════════
// El estado era UNA variable global para todo Workspace, y eso permitía la
// afirmación falsa más fácil: sincronizas el presupuesto, abres el diario, y la
// insignia sigue diciendo «guardado y sincronizado» sobre un documento que nunca
// se ha subido.
console.log('\n6 · La insignia habla del documento que se está mirando:');
{
  function syncCtx() {
    const sb = { Math, Number, String, Object, Array, JSON, Date, console: { warn(){} } };
    vm.createContext(sb);
    sb.t = k => k; sb._intccEsc = x => String(x);
    vm.runInContext(konstSrc('_WS_SYNC_SEVERITY'), sb);
    vm.runInContext('var _wsDocSync = Object.create(null); var _wsDocTableState = "unknown";'
      + ' var _wsDocSyncState = "idle"; var _wsDocSyncAt = 0;', sb);
    ['_wsDocSyncWorst', '_wsSyncStatus', '_wsSyncBadgeHtml'].forEach(n => vm.runInContext(fnSrc(n), sb));
    sb.set = (k, st) => { vm.runInContext('_wsDocSync[' + JSON.stringify(k) + '] = { state: '
      + JSON.stringify(st) + ', at: 1 };', sb); };
    sb.table = v => vm.runInContext('_wsDocTableState = ' + JSON.stringify(v) + ';', sb);
    return sb;
  }
  const S = (c, k) => vm.runInContext('_wsSyncStatus(' + JSON.stringify(k == null ? null : k) + ')', c);
  {
    const c = syncCtx(); c.set('aurix_ws_goals_v1', 'saved');
    ok('6.1 un documento guardado SIN confirmación de la tabla no está sincronizado',
      S(c, 'aurix_ws_goals_v1').synced === false
      && S(c, 'aurix_ws_goals_v1').labelKey === 'ws_sync_saved_local',
      JSON.stringify(S(c, 'aurix_ws_goals_v1')));
    c.table('yes');
    ok('6.2 …y sólo con la confirmación del servidor se llama sincronizado',
      S(c, 'aurix_ws_goals_v1').synced === true
      && S(c, 'aurix_ws_goals_v1').labelKey === 'ws_sync_saved_synced');
    ok('6.3 OTRO documento que nunca se subió no hereda ese «sincronizado»',
      S(c, 'aurix_ws_projects_v1').synced === false
      && S(c, 'aurix_ws_projects_v1').labelKey === 'ws_sync_idle',
      JSON.stringify(S(c, 'aurix_ws_projects_v1')));
  }
  {
    // La insignia sin clave toma el PEOR estado, nunca el mejor.
    const c = syncCtx(); c.table('yes');
    c.set('aurix_ws_goals_v1', 'saved'); c.set('aurix_ws_projects_v1', 'error');
    ok('6.4 la insignia global publica el PEOR estado conocido, no el último',
      S(c, null).labelKey === 'ws_sync_error' && S(c, null).synced === false,
      JSON.stringify(S(c, null)));
    c.set('aurix_ws_projects_v1', 'saving');
    ok('6.5 con algo pendiente tampoco afirma sincronización',
      S(c, null).labelKey === 'ws_sync_saving' && S(c, null).synced === false);
    c.set('aurix_ws_projects_v1', 'saved');
    ok('6.6 y sólo cuando TODOS están guardados lo afirma',
      S(c, null).labelKey === 'ws_sync_saved_synced' && S(c, null).synced === true);
  }
  ok('6.7 «sincronizado» se marca SÓLO tras un upsert sin error del servidor',
    (() => { const src = fnSrc('_wsDocsPush');
      // el único `saved` del push va después de la comprobación de error
      const i = src.indexOf("_wsDocSyncSet(key, 'saved')");
      const j = src.indexOf('if (error)');
      return i > j && j > -1
        && /_wsDocTableState = 'yes';\s*\n\s*_wsDocSyncSet\(key, 'saved'\)/.test(src); })(),
    'no puede marcarse al encolar ni al enviar');
  ok('6.8 el hueco del DOM declara de qué documento habla',
    /el\.getAttribute\('data-ws-sync-slot'\)/.test(fnSrc('_wsSyncBadgeRefresh')));
}

// ════════════════════════════════════════════════════════════════════════════
// 7 · UNA DIVISA POR DOCUMENTO · LA SOLUCIÓN MÍNIMA SEGURA
// ════════════════════════════════════════════════════════════════════════════
// Los totales del Diario y de Precios sumaban importes de filas con divisas
// DISTINTAS sin convertir, y los pintaban con el símbolo de la divisa base: un
// total que no es de ninguna moneda. Convertir habría exigido elegir un owner de
// tipo de cambio Y una política de fecha, y publicar un agregado con un tipo no
// declarado es el defecto que este bloque ha estado cerrando.
console.log('\n7 · Un documento, una moneda; y la mezcla no se suma:');
{
  function ccyCtx() {
    const sb = { Math, Number, String, isFinite, isNaN, parseFloat, JSON, Array, Object, Set, Intl,
                 console: { warn(){} } };
    vm.createContext(sb);
    sb.lang = 'es'; sb.baseCurrency = 'EUR';
    ['_wsNum', 'formatCurrency', 'calculateTradeJournal', 'calculateAssetPrices']
      .forEach(n => vm.runInContext(fnSrc(n), sb));
    vm.runInContext('function formatBase(a){ return formatCurrency(a, baseCurrency); }', sb);
    return sb;
  }
  const C = ccyCtx();
  const TJ = rows => vm.runInContext('calculateTradeJournal(' + JSON.stringify(rows) + ')', C);
  const AP = rows => vm.runInContext('calculateAssetPrices(' + JSON.stringify(rows) + ')', C);
  const ONE = [{ qty: '10', buy: '100', sell: '120', currency: 'EUR' },
               { qty: '5',  buy: '200', sell: '180', currency: 'EUR' }];
  const MIX = [{ qty: '10', buy: '100', sell: '120', currency: 'EUR' },
               { qty: '5',  buy: '200', sell: '180', currency: 'USD' }];
  ok('7.1 con UNA divisa el diario publica sus totales y la declara',
    (() => { const r = TJ(ONE);
      return r.currencyMixed === false && r.currency === 'EUR'
        && r.netProfit === 100 && r.totalsPublishable === true; })(),
    JSON.stringify(TJ(ONE).currency));
  ok('7.2 con divisas MEZCLADAS no publica ningún total',
    (() => { const r = TJ(MIX);
      return r.currencyMixed === true && r.currency === null
        && r.netProfit === null && r.totalInvested === null && r.avgReturn === null
        && r.totalsPublishable === false; })(),
    JSON.stringify({ neto: TJ(MIX).netProfit, inv: TJ(MIX).totalInvested, avg: TJ(MIX).avgReturn }));
  ok('7.3 …y dice CUÁLES hay, en vez de callarlo',
    JSON.stringify(TJ(MIX).currencies.slice().sort()) === JSON.stringify(['EUR', 'USD']));
  ok('7.4 cada operación sigue leyéndose en SU divisa (eso sí es cierto)',
    TJ(MIX).list[0].currency === 'EUR' && TJ(MIX).list[1].currency === 'USD');
  ok('7.5 Seguimiento de precios aplica la MISMA regla',
    (() => { const one = AP([{ quantity: '10', buyPrice: '100', sellPrice: '120', currency: 'EUR' }]);
      const mix = AP([{ quantity: '10', buyPrice: '100', sellPrice: '120', currency: 'EUR' },
                      { quantity: '10', buyPrice: '100', sellPrice: '120', currency: 'GBP' }]);
      return one.currencyMixed === false && one.netProfitLoss != null
        && mix.currencyMixed === true && mix.netProfitLoss === null
        && mix.totalInvested === null && mix.averageReturnPct === null; })(),
    JSON.stringify(AP([{ quantity: '10', buyPrice: '100', sellPrice: '120', currency: 'EUR' },
                       { quantity: '10', buyPrice: '100', sellPrice: '120', currency: 'GBP' }]).netProfitLoss));
  ok('7.6 el formateador HONRA la divisa que recibe, no la base',
    (() => { const es = vm.runInContext('_wsJrnMoney(1000, "USD")', (() => {
        const sb = ccyCtx(); vm.runInContext(fnSrc('_wsJrnMoney'), sb); return sb; })());
      return /US\$|\$/.test(es) && !/€/.test(es); })(),
    'una operación en dólares no se pinta con el símbolo de la divisa base');
  ok('7.7 no se ha introducido ninguna conversión FX ni ninguna fecha de tipo',
    !/exchangeRate|fxRate|convertCurrency/.test(fnSrc('calculateTradeJournal'))
    && !/exchangeRate|fxRate|convertCurrency/.test(fnSrc('calculateAssetPrices')),
    'la solución mínima segura NO convierte: declara');
  ok('7.8 y la divisa por operación ya no se elige en el formulario',
    !/sel\('currency', t\('wsjrn_f_ccy'\), ccys\)/.test(app));
  const CK = ['wsjrn_mixed_ccy', 'wsjrn_doc_ccy', 'wsjrn_doc_ccy_hint'];
  const occ = k => (app.match(new RegExp('\\n    ' + k + ':', 'g')) || []).length;
  ok('7.9 la copy de la mezcla existe en ES y EN',
    CK.every(k => occ(k) === 2), JSON.stringify(CK.map(k => k + ':' + occ(k))));
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
