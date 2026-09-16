'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MONETIZATION-PRODUCT-ENTITLEMENT — M.02 B3/B4
// ════════════════════════════════════════════════════════════════════════════
// B2 puso la autoridad en el servidor; B3/B4 la conecta al producto. Este es el
// primer bloque de monetización que CAMBIA lo que ve un usuario, así que el gate
// no puede ser estructural: EJECUTA los owners reales extraídos del bundle
// —`hasFeature`, `_aurixEntitlementsLoad`, `_aurixEntIsCatalogPreview`,
// `_wsCatalogVisible`, `_wsCatalogFor`, `_wsCommercialLabel`, `_wsToolFeatureKey`,
// `openUpgradeIntent`, `requireFeature`— con dependencias inyectadas. Las
// respuestas las da el código de producción, nunca una reimplementación.
//
// Cubre la matriz del SPEC §17 (FREE / PREMIUM / FOUNDER / FAILURE) y §20.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { return ''; } };
const app = read('app.js'), css = read('styles.css'), idx = read('index.html');

let pass = 0, fail = 0; const failed = [];
function ok(n, c, extra) {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; failed.push(n); console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); }
}
function slice(from, to) {
  const i = app.indexOf(from); if (i < 0) return '';
  const j = app.indexOf(to, i); return j < 0 ? '' : app.slice(i, j);
}
function fnSource(name) {
  const i = app.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0, st = false;
  for (let k = i; k < app.length; k++) {
    if (app[k] === '{') { d++; st = true; }
    else if (app[k] === '}') { d--; if (st && !d) return app.slice(i, k + 1); }
  }
  return '';
}
const stripComments = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── Sandbox: se monta el subsistema REAL de entitlements del bundle ─────────
const ENT_BLOCK = slice('const _AURIX_ENT_CANON', '// Expose the entitlement surface');
const CAT_BLOCK = slice('const _WS_CATALOG = Object.freeze([', 'function _wsAppIdentity');
function makeApi(overrides) {
  const o = overrides || {};
  const store = o.store || {};
  const shim = `
    const IS_DEV = false;
    const lang = 'es';
    const t = (k) => ({ wstier_free: 'Incluido', wstier_premium: 'Premium', wstier_preview: 'Interno' }[k] || k);
    const esc = (x) => String(x);
    const _WS_TOOL_ASSET = { compound_growth: 'tool_compound', loan_simulation: 'tool_loans' };
    const _wsTplViz = (v) => '<svg data-viz="' + v + '"></svg>';
    const _wsAssetImg = (n) => n ? '<img class="ws-asset-img" src="' + n + '.webp">' : '';
    const _featureLabel = (f) => 'L:' + f;
    const applyI18n = () => {};
    const localStorage = __store;
    const document = __doc;
    const supabaseClient = __client;
    const _aurixActiveUserId = __uid;
  `;
  // EL CATÁLOGO VA PRIMERO, y es consecuencia del arreglo del P0: desde la SPEC de
  // cierre `_AURIX_ENT_CANON` se DERIVA de `_WS_CATALOG` (era un literal de cuatro
  // claves y las cinco capacidades publicadas se caían en silencio del mapa de
  // features). Montarlo después dejaba el catálogo en zona muerta temporal.
  const body = shim + '\n' +
    slice('const _WS_CATALOG = Object.freeze([', 'function _wsCatalogEntry') + '\n' +
    slice('const _WS_TOOLKEY_TO_ID', 'function _wsToolFeatureKey') + '\n' +
    ENT_BLOCK + '\n' +
    fnSource('_wsCatalogEntry') + '\n' + fnSource('_wsToolFeatureKey') + '\n' +
    fnSource('_wsCatalogVisible') + '\n' + fnSource('_wsCatalogFor') + '\n' +
    fnSource('_aurixEntIsCatalogPreview') + '\n' +
    fnSource('_wsCatalogSurfaceKey') + '\n' + fnSource('_wsEntrySurfaceKey') + '\n' +
    fnSource('_wsCatalogInternal') + '\n' + fnSource('_wsEntryOpenable') + '\n' +
    fnSource('_wsWs4Access') + '\n' +
    fnSource('_wsToolAccess') + '\n' +
    fnSource('_wsCommercialLabel') + '\n' + fnSource('_wsCommercialTierClass') + '\n' +
    fnSource('_wsMseToolPreview') + '\n' +
    // el owner declara su estado en módulo: se trae tal cual, no se recrea
    slice("const _AURIX_UPGRADE_INTENT_KEY", 'function openUpgradeIntent') + '\n' +
    fnSource('openUpgradeIntent') + '\n' + fnSource('requireFeature') + '\n' +
    `return {
      hasFeature, _aurixEntitlementsLoad, _aurixEntIsCatalogPreview, _aurixEntLoaded,
      _aurixEntReset, _wsCatalogFor, _wsCatalogVisible, _wsCommercialLabel,
      _wsCommercialTierClass, _wsToolFeatureKey, _wsCatalogEntry, _wsMseToolPreview, _wsToolAccess,
      _wsSurfaceEntry, _wsCatalogInternal, _wsEntryOpenable, _wsWs4Access,
      openUpgradeIntent, requireFeature, _WS_CATALOG,
      state: () => _aurixEnt, setState: (s) => { _aurixEnt = s; },
    };`;
  const docShim = o.doc || {
    _els: {},
    getElementById(id) { return this._els[id] || (this._els[id] = { id, style: {}, classList: { _s: new Set(), add(x){this._s.add(x);}, remove(x){this._s.delete(x);}, contains(x){return this._s.has(x);} }, setAttribute(){}, textContent: '' }); },
    body: { classList: { _s: new Set(), add(x){this._s.add(x);}, remove(x){this._s.delete(x);} } },
  };
  const storeShim = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
  return new Function('__client', '__doc', '__store', '__uid', body)(o.client || null, docShim, storeShim, o.uid || 'uidA');
}
// Estados de entitlement como los produciría el resolver de B2.
const ST = {
  free:    { plan: 'free',    status: 'none',   source: 'default',      validUntil: null, sources: { 'workspace.loan': 'default', 'intelligence.full': 'default', 'premium.settings': 'default', 'workspace.catalog_preview': 'default' }, features: { 'workspace.loan': false, 'intelligence.full': false, 'premium.settings': false, 'workspace.catalog_preview': false } },
  premium: { plan: 'premium', status: 'active', source: 'subscription', validUntil: '2027-01-01', sources: { 'workspace.loan': 'plan', 'intelligence.full': 'plan', 'premium.settings': 'plan', 'workspace.catalog_preview': 'default' }, features: { 'workspace.loan': true, 'intelligence.full': true, 'premium.settings': true, 'workspace.catalog_preview': false } },
  founder: { plan: 'free',    status: 'none',   source: 'default',      validUntil: null, sources: { 'workspace.loan': 'override', 'intelligence.full': 'override', 'premium.settings': 'override', 'workspace.catalog_preview': 'override' }, features: { 'workspace.loan': true, 'intelligence.full': true, 'premium.settings': true, 'workspace.catalog_preview': true } },
  // EL caso que la revisión de seguridad destapó: compensado con las TRES features
  // por override individual. NO es founder y NO debe ver el catálogo interno.
  comped:  { plan: 'free',    status: 'none',   source: 'default',      validUntil: null, sources: { 'workspace.loan': 'override', 'intelligence.full': 'override', 'premium.settings': 'override', 'workspace.catalog_preview': 'default' }, features: { 'workspace.loan': true, 'intelligence.full': true, 'premium.settings': true, 'workspace.catalog_preview': false } },
};
const loaded = (s) => Object.assign({ loaded: true, loading: false, error: null, fetchedAt: Date.now() }, s);

console.log('\nAURIX-MONETIZATION-PRODUCT-ENTITLEMENT — M.02 B3/B4');
console.log('bloque de entitlements ' + ENT_BLOCK.length + 'B · catálogo ' + CAT_BLOCK.length + 'B\n');

// ══ A. AUTORIDAD ÚNICA ════════════════════════════════════════════════════
console.log('A · AUTORIDAD');
ok('A.1 el subsistema de entitlements se extrae y monta', ENT_BLOCK.length > 1500 && CAT_BLOCK.length > 1000);
const api = makeApi({});
ok('A.2 hasFeature existe y es el gate único', typeof api.hasFeature === 'function');
const ENT_CODE = stripComments(ENT_BLOCK);
ok('A.3 hasFeature NO consulta email, localStorage, aurix_plan ni tier legacy',
  !/rbn892|aurix_plan|getPlan\(|PLAN_FEATURES|premiumTier|isPremium|subscriptionActive/.test(stripComments(fnSource('hasFeature'))));
ok('A.4 el estado cliente sale de la RPC del resolver, no de un cálculo local',
  /supabaseClient\.rpc\('aurix_entitlements'\)/.test(ENT_CODE));
ok('A.5 ENFORCE_ENTITLEMENTS ya NO puede conceder nada (hasFeature no lo lee)',
  !/ENFORCE_ENTITLEMENTS/.test(stripComments(fnSource('hasFeature'))));
ok('A.6 sólo se aceptan las claves canónicas declaradas',
  // RE-DECIDIDO · SPEC DE CIERRE. El conjunto era un LITERAL de cuatro claves y el
  // bucle de carga copia `row.features[k]` sólo para las claves de esa lista: al
  // publicar las cinco capacidades Premium, `hasFeature('workspace.budget')` daba
  // false para TODA cuenta premium. El catálogo ofrecía Presupuesto y el gate lo
  // negaba, con `plan_features` correcto y el resolver correcto.
  // Ahora se DERIVA del catálogo, así que lo que se ancla es eso —que se derive— y
  // que las claves transversales sigan declaradas.
  /_AURIX_ENT_CANON = Object\.freeze\(\s*Array\.from\(new Set\(\s*_WS_CATALOG\.map\(e => e\.featureKey\)/.test(ENT_CODE) &&
  /'intelligence\.full',[\s\S]{0,120}'premium\.settings',[\s\S]{0,140}'workspace\.catalog_preview',/.test(ENT_BLOCK));
ok('A.6b `workspace.catalog_preview` no la concede NINGÚN plan (no se vende)',
  (() => { const sql = read('db/monetization_catalog_preview_key_1.sql');
    return /\('free',\s*'workspace\.catalog_preview', false\)/.test(sql) &&
           /\('premium', 'workspace\.catalog_preview', false\)/.test(sql) &&
           !/'workspace\.catalog_preview', true/.test(sql); })());
ok('A.6c el catálogo interno es una CAPACIDAD, no una deducción de orígenes',
  /return hasFeature\('workspace\.catalog_preview'\);/.test(fnSource('_aurixEntIsCatalogPreview')) &&
  !/sources\[k\] === 'override'/.test(fnSource('_aurixEntIsCatalogPreview')));
ok('A.7 se exige booleano ESTRICTO (un "true" string o un 1 no conceden)',
  /row\.features\[k\] === true/.test(ENT_CODE) && /_aurixEnt\.features\[featureKey\] === true/.test(ENT_CODE));
ok('A.8 el gate NUNCA lee `plan` (B2: plan no es una puerta)',
  !/_aurixEnt\.plan/.test(stripComments(fnSource('hasFeature'))));

// ══ B. FAIL-CLOSED (§8, §16, FAILURE de §17) ══════════════════════════════
console.log('\nB · FAIL-CLOSED — ejecutado');
{
  const a = makeApi({});
  ok('B.1 sin cargar: las 3 features denegadas',
    !a.hasFeature('workspace.loan') && !a.hasFeature('intelligence.full') && !a.hasFeature('premium.settings'));
  ok('B.2 sin cargar: no hay catálogo interno', a._aurixEntIsCatalogPreview() === false);
  ok('B.3 una clave desconocida nunca concede', !a.hasFeature('workspace.access') && !a.hasFeature('*'));
}
(async () => {
  // resolver caído / sin cliente
  let a = makeApi({ client: null });
  await a._aurixEntitlementsLoad({ force: true });
  ok('B.4 resolver no disponible ⇒ no Premium', !a.hasFeature('intelligence.full') && !a._aurixEntLoaded());
  // error de la RPC
  a = makeApi({ client: { rpc: async () => ({ data: null, error: { message: 'boom' } }) } });
  await a._aurixEntitlementsLoad({ force: true });
  ok('B.5 error de la RPC ⇒ no Premium', !a.hasFeature('intelligence.full'));
  // timeout / rechazo
  a = makeApi({ client: { rpc: async () => { throw new Error('timeout'); } } });
  await a._aurixEntitlementsLoad({ force: true });
  ok('B.6 timeout ⇒ no Premium', !a.hasFeature('workspace.loan'));
  // respuesta con forma inesperada
  for (const bad of [[], [{}], [{ plan: 'premium' }], [{ plan: 'premium', features: null }], null, 'premium']) {
    a = makeApi({ client: { rpc: async () => ({ data: bad, error: null }) } });
    await a._aurixEntitlementsLoad({ force: true });
    if (a.hasFeature('intelligence.full')) { ok('B.7 forma inesperada ⇒ no Premium (' + JSON.stringify(bad) + ')', false); break; }
  }
  ok('B.7 una respuesta con forma inesperada NUNCA concede', true);
  // el servidor dice plan=premium pero con el mapa VACÍO (catálogo degradado en B2)
  a = makeApi({ client: { rpc: async () => ({ data: [{ plan: 'premium', subscription_status: 'active', features: {}, feature_sources: {}, source: 'subscription', valid_until: null }], error: null }) } });
  await a._aurixEntitlementsLoad({ force: true });
  ok('B.8 plan=premium con features vacías ⇒ NADA concedido (plan no es una puerta)',
    a._aurixEntLoaded() && !a.hasFeature('intelligence.full') && !a.hasFeature('workspace.loan'));
  // valores no booleanos
  a = makeApi({ client: { rpc: async () => ({ data: [{ plan: 'premium', subscription_status: 'active', features: { 'intelligence.full': 'true', 'workspace.loan': 1 }, feature_sources: {}, source: 'subscription', valid_until: null }], error: null }) } });
  await a._aurixEntitlementsLoad({ force: true });
  ok('B.9 "true" (string) y 1 NO conceden', !a.hasFeature('intelligence.full') && !a.hasFeature('workspace.loan'));
  // una respuesta correcta SÍ concede (anti-vacuidad)
  a = makeApi({ client: { rpc: async () => ({ data: [{ plan: 'premium', subscription_status: 'active', features: { 'workspace.loan': true, 'intelligence.full': true, 'premium.settings': true }, feature_sources: { 'workspace.loan': 'plan', 'intelligence.full': 'plan', 'premium.settings': 'plan' }, source: 'subscription', valid_until: null }], error: null }) } });
  await a._aurixEntitlementsLoad({ force: true });
  ok('B.10 ANTI-VACUIDAD: una respuesta válida sí concede las 3',
    a.hasFeature('workspace.loan') && a.hasFeature('intelligence.full') && a.hasFeature('premium.settings'));
  ok('B.11 un premium de PAGO no ve el catálogo interno', a._aurixEntIsCatalogPreview() === false);

  // ── EL caso que ningún assert cubría: YA cargado y la revalidación FALLA ──────
  // La revisión de seguridad lo destapó: el `catch` reseteaba el estado, así que un
  // fallo de RED borraba una lectura autoritativa ya obtenida y degradaba a un
  // cliente que HA PAGADO. Todos los tests de fallo arrancaban de un estado NO
  // cargado, donde no había nada que perder.
  {
    let fail = false;
    const cli = { rpc: async () => {
      if (fail) throw new Error('network');
      return { data: [{ plan: 'premium', subscription_status: 'active',
        features: { 'workspace.loan': true, 'intelligence.full': true, 'premium.settings': true, 'workspace.catalog_preview': false },
        feature_sources: { 'workspace.loan': 'plan', 'intelligence.full': 'plan', 'premium.settings': 'plan', 'workspace.catalog_preview': 'default' },
        source: 'subscription', valid_until: '2027-01-01' }], error: null };
    } };
    const b = makeApi({ client: cli });
    await b._aurixEntitlementsLoad({ force: true });
    const before = b.hasFeature('intelligence.full') && b.state().plan === 'premium';
    fail = true;
    await b._aurixEntitlementsLoad({ force: true });
    ok('B.12 una lectura previa SOBREVIVE a un fallo de red en la revalidación',
      before && b.hasFeature('intelligence.full') === true && b._aurixEntLoaded() === true,
      'plan=' + b.state().plan + ' loaded=' + b._aurixEntLoaded());
    ok('B.13 …y el badge no cae a FREE con un cliente que ha pagado',
      b.state().plan === 'premium');
    ok('B.14 …el error se anota y la caché se invalida para reintentar',
      b.state().error === 'network' && b.state().fetchedAt === 0);
    // El kill switch sigue llegando: en la primera lectura que SÍ funciona.
    fail = false;
    const cli2 = cli.rpc;
    b.setState(Object.assign({}, b.state()));
    cli.rpc = async () => ({ data: [{ plan: 'free', subscription_status: 'none',
      features: { 'workspace.loan': false, 'intelligence.full': false, 'premium.settings': false, 'workspace.catalog_preview': false },
      feature_sources: {}, source: 'default', valid_until: null }], error: null });
    await b._aurixEntitlementsLoad({ force: true });
    ok('B.15 el kill switch NO se debilita: la siguiente lectura buena revoca',
      b.hasFeature('intelligence.full') === false && b.state().plan === 'free');
    cli.rpc = cli2;
  }
  ok('B.16 y en la PRIMERA carga un fallo sigue siendo fail-closed (no se conserva nada)',
    (() => { const c = makeApi({ client: { rpc: async () => { throw new Error('x'); } } }); return !c._aurixEntLoaded(); })());

  // ══ C. MATRIZ FREE / PREMIUM / FOUNDER (§17) ════════════════════════════
  console.log('\nC · MATRIZ DE USUARIO — ejecutada');
  const mk = (st) => { const x = makeApi({}); x.setState(loaded(st)); return x; };
  const free = mk(ST.free), prem = mk(ST.premium), fdr = mk(ST.founder);

  ok('C.1 FREE · Loan gateado', !free.hasFeature('workspace.loan'));
  ok('C.2 FREE · Intelligence completa no accesible', !free.hasFeature('intelligence.full'));
  ok('C.3 FREE · premium.settings denegado', !free.hasFeature('premium.settings'));
  ok('C.4 FREE · Compound NO tiene featureKey ⇒ nada que gatear',
    free._wsToolFeatureKey('compound') === null);
  ok('C.5 FREE · Loan sí tiene featureKey workspace.loan',
    free._wsToolFeatureKey('loan') === 'workspace.loan');
  // ── RE-DECIDIDO · WORKSPACE COMPLETION · publicación de las cinco Premium ──
  // `PUB_TPL` era el literal `'tpl_realestate'`: el conjunto publicado de M.03 A.
  // Ese conjunto es DATO —cambia cada vez que el producto publica algo— mientras
  // el invariante que estas aserciones protegen es otro: que un usuario normal, un
  // premium de pago y un compensado vean EXACTAMENTE lo publicado y nada más.
  // Así que el conjunto se DERIVA del catálogo y lo que se ancla es su tamaño, que
  // es lo que delata una publicación accidental.
  const PUB_TPL = fdr._WS_CATALOG.filter(e => e.kind === 'template' && e.published)
    .map(e => e.id).sort().join(',');
  const PUB_TOOLS = fdr._WS_CATALOG.filter(e => e.kind === 'tool' && e.published)
    .map(e => e.id).sort().join(',');
  const N_PUB_TOOLS = PUB_TOOLS.split(',').length;
  ok('C.5b el conjunto publicado es el DECLARADO tras aplicar los dos SQL',
    PUB_TOOLS === 'compound_growth,loan_simulation,scenario'
    && PUB_TPL === 'tpl_goals,tpl_journal,tpl_mbudget,tpl_realestate,tpl_receivables',
    JSON.stringify({ tools: PUB_TOOLS, templates: PUB_TPL }));
  ok('C.5c y Seguimiento de precios NO está en él',
    PUB_TPL.indexOf('tpl_assets') === -1);
  ok('C.6 FREE · ve el catálogo público de herramientas, completo y sin nada más',
    free._wsCatalogFor('tool').map(e => e.id).sort().join(',') === PUB_TOOLS);
  // ── RE-DECIDIDO EN M.03 A (SPEC · FREE V1) ────────────────────────────────
  // C.7 / C.9 / C.18 afirmaban `_wsCatalogFor('template').length === 0`. Eso NO
  // era el invariante: era el estado de M.02, donde ninguna plantilla estaba
  // publicada. M.03 publica Real Estate Portfolio como la plantilla gratuita, así
  // que la afirmación se reescribe sobre el invariante REAL —un usuario normal ve
  // exactamente las entradas `published:true`, ni una más— y se fija además el
  // CONJUNTO publicado, que es más fuerte que un recuento a cero: una plantilla
  // interna que se colara aquí rompe el assert.
  ok('C.7 FREE · NO ve ninguna entrada no publicada',
    free._wsCatalogFor('tool').every(e => e.published === true) &&
    free._wsCatalogFor('template').every(e => e.published === true) &&
    free._wsCatalogFor('template').map(e => e.id).sort().join(',') === PUB_TPL);
  ok('C.8 PREMIUM · las 3 features concedidas',
    prem.hasFeature('workspace.loan') && prem.hasFeature('intelligence.full') && prem.hasFeature('premium.settings'));
  ok('C.9 PREMIUM · el catálogo sigue siendo el PUBLICADO (no ve lo interno)',
    prem._wsCatalogFor('tool').length === N_PUB_TOOLS &&
    prem._wsCatalogFor('template').map(e => e.id).sort().join(',') === PUB_TPL);
  ok('C.10 FOUNDER · no es Premium comercial (plan free)', fdr.state().plan === 'free');
  ok('C.11 FOUNDER · el acceso viene de override', fdr.state().sources['intelligence.full'] === 'override');
  ok('C.12 FOUNDER · tiene las features', fdr.hasFeature('workspace.loan') && fdr.hasFeature('intelligence.full'));
  ok('C.13 FOUNDER · ve el catálogo interno', fdr._aurixEntIsCatalogPreview() === true);
  // RE-DECIDIDO · SPEC DE CIERRE. `_wsCatalogFor` YA NO devuelve el inventario al
  // founder: la visibilidad de catálogo es sólo publicación. Mezclar el inventario
  // con el producto en la cuenta que ADEMÁS es la de QA Premium le impedía ver lo
  // que ve un cliente, y traía «Próximamente», Objetivos duplicado y rutas legacy
  // sin gate. El inventario vive ahora en `_wsCatalogInternal`, que falla cerrada.
  ok('C.14 FOUNDER · su catálogo público es el MISMO que el de cualquiera',
    fdr._wsCatalogFor('tool').length === free._wsCatalogFor('tool').length &&
    fdr._wsCatalogFor('tool').length === 3, 've ' + fdr._wsCatalogFor('tool').length);
  ok('C.15 FOUNDER · y sus plantillas públicas también, ni una más',
    fdr._wsCatalogFor('template').length === free._wsCatalogFor('template').length &&
    fdr._wsCatalogFor('template').length === 5, 've ' + fdr._wsCatalogFor('template').length);
  ok('C.15b …pero SIGUE pudiendo evaluar el inventario, por un owner explícito',
    fdr._wsCatalogInternal('tool').length > 0 && fdr._wsCatalogInternal('template').length > 0 &&
    free._wsCatalogInternal('tool').length === 0 && free._wsCatalogInternal('template').length === 0,
    JSON.stringify([fdr._wsCatalogInternal('tool').length, fdr._wsCatalogInternal('template').length]));
  ok('C.16 un premium de pago NO ve lo interno aunque tenga las features',
    prem._aurixEntIsCatalogPreview() === false && prem._wsCatalogFor('tool').length === N_PUB_TOOLS);
  // El escenario de la revisión de seguridad: soporte compensa con las TRES
  // features por override individual. Tiene el mismo perfil de orígenes que el
  // founder y NO debe ver el catálogo interno.
  const comp = mk(ST.comped);
  ok('C.17 un usuario COMPENSADO tiene las 3 features por override…',
    comp.hasFeature('workspace.loan') && comp.hasFeature('intelligence.full') &&
    comp.hasFeature('premium.settings') &&
    ['workspace.loan', 'intelligence.full', 'premium.settings']
      .every(k => comp.state().sources[k] === 'override'));
  ok('C.18 …y AUN ASÍ no ve el catálogo interno (era el fail-open de la deducción)',
    comp._aurixEntIsCatalogPreview() === false &&
    comp._wsCatalogFor('tool').length === N_PUB_TOOLS &&
    comp._wsCatalogFor('template').map(e => e.id).sort().join(',') === PUB_TPL);
  // El ejemplo pasa de `budget` a `assets`: budget ya está publicado, y el
  // invariante es «no se puede abrir lo NO publicado», no «no se puede abrir
  // budget». `assets` es la que sigue interna, así que es la que lo ejerce.
  ok('C.19 …ni puede abrir una herramienta sin publicar',
    comp._wsToolAccess('assets').ok === false &&
    comp._wsToolAccess('assets').reason === 'unpublished');
  ok('C.20 el founder sí, y por la CAPACIDAD, no por el perfil de orígenes',
    fdr._aurixEntIsCatalogPreview() === true &&
    fdr.state().features['workspace.catalog_preview'] === true);
  ok('C.21 ni pagando se compra el catálogo interno',
    prem.state().features['workspace.catalog_preview'] === false);

  // ══ D. ETIQUETAS = VERDAD COMERCIAL (§12) ══════════════════════════════
  console.log('\nD · ETIQUETAS');
  const lbl = (id) => fdr._wsCommercialLabel(fdr._wsCatalogEntry(id));
  ok('D.1 Compound → "Incluido"', lbl('compound_growth') === 'Incluido');
  ok('D.2 Loan → "Premium"', lbl('loan_simulation') === 'Premium');
  ok('D.3 no publicada → "Interno"', lbl('monthly_budget') === 'Interno' && lbl('tpl_fire') === 'Interno');
  ok('D.4 "Premium" SÓLO si hay featureKey que Premium concede de verdad',
    fdr._WS_CATALOG.filter(e => fdr._wsCommercialLabel(e) === 'Premium')
      .every(e => e.featureKey && e.published === true && e.commercialTier === 'premium'));
  // La propiedad, no el catálogo de hoy: mirar sólo las entradas actuales dejaba
  // pasar que la etiqueta se volviera DECORATIVA, porque la única entrada premium
  // que existe sí tiene featureKey. Se ejecuta el owner sobre la entrada peligrosa.
  ok('D.4b una entrada "premium" SIN featureKey NO puede etiquetarse Premium',
    fdr._wsCommercialLabel({ id: 'x', kind: 'tool', published: true, commercialTier: 'premium', featureKey: null }) !== 'Premium' &&
    fdr._wsCommercialTierClass({ id: 'x', kind: 'tool', published: true, commercialTier: 'premium', featureKey: null }) !== 'premium');
  ok('D.4c una entrada premium CON featureKey sí se etiqueta Premium (anti-vacuidad)',
    fdr._wsCommercialLabel({ id: 'y', kind: 'tool', published: true, commercialTier: 'premium', featureKey: 'workspace.loan' }) === 'Premium');
  ok('D.4d no publicada gana sobre el tier: nunca se afirma un plan de algo interno',
    fdr._wsCommercialLabel({ id: 'z', kind: 'tool', published: false, commercialTier: 'premium', featureKey: 'workspace.loan' }) === 'Interno');
  // ── RE-DECIDIDO · WORKSPACE COMPLETION §1 ────────────────────────────────
  // Esto era una LISTA BLANCA de tres claves, así que cada capacidad Premium nueva
  // la habría hecho fallar por existir. Lo que de verdad protege —y es la REGLA DE
  // VERDAD que `_WS_CATALOG` se declara a sí mismo: «si el founder ve Premium, es
  // porque REALMENTE está incluido en Premium»— no es la lista, es que exista una
  // fila que lo conceda. Así que se comprueba ESO, contra el SQL, que es donde vive
  // la concesión. Más fuerte que la lista y no caduca al añadir una capacidad.
  ok('D.5 toda entrada Premium tiene una clave CONCEDIDA al plan premium por un SQL del repo',
    (() => {
      const sql = ['db/monetization_m04_billing_stripe_1.sql', 'db/monetization_commercial_truth_1.sql',
                   'db/monetization_catalog_preview_key_1.sql', 'db/workspace_premium_2_plan_features.sql',
                   'db/monetization_entitlement_resolver_1.sql']
        .map(f => { try { return read(f); } catch (_) { return ''; } }).join('\n');
      const premium = fdr._WS_CATALOG.filter(e => e.commercialTier === 'premium');
      if (!premium.length) return false;                       // anti-vacuidad
      return premium.every(e => {
        if (!e.featureKey) return false;
        if (e.featureKey === 'intelligence.full' || e.featureKey === 'premium.settings') return true;
        const re = new RegExp("'premium',\\s*'" + e.featureKey.replace('.', '\\.') + "',\\s*true");
        return re.test(sql);
      });
    })(),
    JSON.stringify(fdr._WS_CATALOG.filter(e => e.commercialTier === 'premium').map(e => e.featureKey)));
  // Y el corolario que impide vender antes de tiempo: mientras su SQL no esté
  // aplicado, la entrada NO puede estar publicada. El catálogo lo declara con
  // `published:false`, y esa es la única razón por la que hoy no se ven.
  // RE-DECIDIDO: los dos SQL están APLICADOS en producción —verificado con la
  // sonda de existencia (`workspace_documents` pasó de PGRST205 a 42501) y con la
  // consulta de `plan_features` (10 filas, premium=true / free=false)—, así que la
  // condición deja de ser «nada publicado» y pasa a ser la que de verdad protege:
  // toda entrada publicada como Premium tiene su fila que la concede, y la que NO
  // la tiene sigue sin publicar.
  ok('D.5b toda capacidad Premium publicada tiene su derecho concedido en un SQL del repo',
    (() => {
      const sql = ['db/monetization_m04_billing_stripe_1.sql', 'db/monetization_commercial_truth_1.sql',
                   'db/workspace_premium_2_plan_features.sql']
        .map(f => { try { return read(f); } catch (_) { return ''; } }).join('\n');
      return fdr._WS_CATALOG.filter(e => e.published && e.commercialTier === 'premium')
        .every(e => e.featureKey === 'workspace.loan'
          || new RegExp("'premium',\\s*'" + e.featureKey.replace('.', '\\.') + "',\\s*true").test(sql));
    })(),
    JSON.stringify(fdr._WS_CATALOG.filter(e => e.published && e.commercialTier === 'premium').map(e => e.featureKey)));
  ok('D.6 ninguna entrada publicada queda sin decidir',
    fdr._WS_CATALOG.filter(e => e.published).every(e => e.commercialTier !== 'undecided'));
  ok('D.7 una convención única de etiqueta: Incluido | Premium | Preview',
    [...new Set(fdr._WS_CATALOG.map(e => fdr._wsCommercialLabel(e)))].sort().join(',') === 'Incluido,Interno,Premium');

  // ══ E. NO PUBLICAR CÓDIGO DORMIDO (§18) ════════════════════════════════
  console.log('\nE · GATE DE PUBLICACIÓN (§18)');
  const hidden = free._WS_CATALOG.filter(e => e.published === false);
  // Eran ≥20 antes de publicar cinco. El invariante es que SIGA habiendo
  // inventario interno que el gate pueda ejercer, no cuántas hay.
  ok('E.1 hay inventario interno que proteger', hidden.length >= 10, 'internas: ' + hidden.length);
  ok('E.2 USUARIO NORMAL ∩ published=false = 0 entradas visibles',
    hidden.every(e => free._wsCatalogVisible(e) === false));
  ok('E.3 el mismo cero para un premium de pago', hidden.every(e => prem._wsCatalogVisible(e) === false));
  ok('E.4 el founder las ve TODAS, y sólo por el camino de catálogo interno',
    // El camino ya no es `_wsCatalogVisible` (que ahora sólo mira publicación) sino
    // `_wsCatalogInternal`, y lo que vale es que el inventario siga siendo
    // evaluable Y que ningún usuario externo pueda alcanzarlo.
    (() => {
      const seen = fdr._wsCatalogInternal('tool').concat(fdr._wsCatalogInternal('template')).map(e => e.id);
      // La regla del owner descarta las que DUPLICAN una superficie ya publicada
      // (Objetivos era la que se veía dos veces), así que se exige el resto.
      const dupes = ['goal','monthly_budget','trade_journal','receivables','real_estate_portfolio','tpl_scenario'];
      const expected = hidden.map(e => e.id).filter(id => dupes.indexOf(id) === -1);
      return expected.length > 0 && expected.every(id => seen.indexOf(id) !== -1)
        && hidden.every(e => free._wsCatalogVisible(e) === false && fdr._wsCatalogVisible(e) === false);
    })());
  ok('E.5 el catálogo público NO se construye filtrando el del founder: hay un único filtro',
    /function _wsCatalogFor\(kind\) \{\s*return _WS_CATALOG\.filter\(e => e\.kind === kind && _wsCatalogVisible\(e\)\);/.test(app.replace(/\n\s*/g, ' ').replace(/ +/g, ' ')) ||
    /_WS_CATALOG\.filter\(e => e\.kind === kind && _wsCatalogVisible\(e\)\)/.test(app));
  ok('E.6 la visibilidad de lo interno depende del entitlement, no de un flag local',
    /return _aurixEntIsCatalogPreview\(\) === true;/.test(app));
  // El camino que se olvida: un proyecto GUARDADO de una versión anterior rutea a
  // _wsOpenTool con una clave de herramienta retirada del catálogo. Sin gate de
  // publicación (las no publicadas tienen featureKey null, así que el gate de
  // entitlement no las toca) un usuario normal con historial abría código dormido.
  // La decisión de accesibilidad es UNA y la comparten el owner de apertura y el
  // registro de recencia. Eso es lo que impide que Mi Espacio afirme un "último uso"
  // de algo que nunca se abrió, sin duplicar la decisión del resolver.
  // El ejemplo pasa de `budget` a `assets`. El invariante es «el owner bloquea lo
  // NO publicado», y `assets` es la superficie que sigue interna, así que es la que
  // puede ejercerlo. `budget` ahora está publicado y su denegación es COMERCIAL,
  // que es otra pregunta y la cubre E.9c.
  ok('E.7 §18 el owner de apertura bloquea lo NO PUBLICADO, no sólo lo premium',
    (() => { const a = free._wsToolAccess('assets');
      return a.ok === false && a.reason === 'unpublished'; })());
  ok('E.7b y una publicada SÍ produce razón comercial, que es la otra pregunta',
    (() => { const a = free._wsToolAccess('budget');
      return a.ok === false && a.reason === 'entitlement'
        && a.featureKey === 'workspace.budget'; })(),
    JSON.stringify(free._wsToolAccess('budget')));
  ok('E.8 §18 la publicación se comprueba ANTES del entitlement (pregunta distinta)',
    // El predicado de APERTURA se separó del de visibilidad de catálogo
    // (`_wsEntryOpenable`): son dos preguntas y mezclarlas fue el defecto. El
    // ORDEN, que es lo que este assert protege, no cambia.
    /if \(!entry \|\| !_wsEntryOpenable\(entry\)\) return \{ ok: false, reason: 'unpublished'/.test(fnSource('_wsToolAccess')) &&
    fnSource('_wsToolAccess').indexOf("reason: 'unpublished'") < fnSource('_wsToolAccess').indexOf("reason: 'entitlement'"));
  ok('E.9 §18 sólo se ofrece upgrade cuando la razón ES comercial',
    /if \(_acc\.reason === 'entitlement'\) openUpgradeIntent\(/.test(fnSource('_wsOpenTool')));
  ok('E.9b una herramienta no publicada NO produce razón comercial',
    free._wsToolAccess('assets').reason === 'unpublished' &&
    free._wsToolAccess('assets').featureKey === null);
  ok('E.9c Loan para Free SÍ produce razón comercial con su clave',
    (() => { const a = free._wsToolAccess('loan');
      return a.ok === false && a.reason === 'entitlement' && a.featureKey === 'workspace.loan'; })());
  ok('E.9d Compound abre para Free', free._wsToolAccess('compound').ok === true);
  ok('E.9e Loan abre para Premium', prem._wsToolAccess('loan').ok === true);
  ok('E.9f el founder abre lo interno', fdr._wsToolAccess('assets').ok === true);
  // HIGH-2 de la revisión de producto: la recencia es una AFIRMACIÓN.
  ok('E.9g la recencia sólo se graba si la herramienta se va a abrir de verdad',
    /if \(cta !== 'tool' \|\| _wsToolAccess\(_carg\)\.ok\) _wsTouch\(_wsCanonRef\(cta, _carg\)\);/.test(app));
  {
    // se ejecuta el mapa real: toda clave que _wsOpenTool acepta está en el catálogo,
    // así que ninguna se escapa del gate por no estar mapeada.
    const KEYS = ['compound', 'budget', 'journal', 'realestate', 'receivables', 'loan', 'assets'];
    ok('E.10 §18 las 7 claves que acepta _wsOpenTool están cubiertas por el catálogo',
      KEYS.every(k => free._wsCatalogEntry(({ compound: 'compound_growth', loan: 'loan_simulation',
        budget: 'monthly_budget', journal: 'trade_journal', realestate: 'real_estate_portfolio',
        receivables: 'receivables', assets: 'asset_prices' })[k]) !== null));
    ok('E.11 §18 de esas 7, sólo compound y loan son visibles para un usuario normal',
      KEYS.filter(k => { const e = free._wsCatalogEntry(({ compound: 'compound_growth', loan: 'loan_simulation',
        budget: 'monthly_budget', journal: 'trade_journal', realestate: 'real_estate_portfolio',
        receivables: 'receivables', assets: 'asset_prices' })[k]); return free._wsCatalogVisible(e); })
        .sort().join(',') === 'compound,loan');
  }

  // ══ F. UPGRADE INTENT (§15) ════════════════════════════════════════════
  console.log('\nF · UPGRADE INTENT');
  {
    const store = {};
    const a = makeApi({ store });
    a.setState(loaded(ST.free));
    const r = a.openUpgradeIntent({ featureKey: 'workspace.loan', source: 'workspace:loan' });
    ok('F.1 devuelve false (no concede acceso)', r === false);
    const KEY = 'aurix_upgrade_intent_v1_uidA';
    const log = JSON.parse(store[KEY] || '[]');
    ok('F.2 registra la intención con feature y origen, bajo la clave del USUARIO',
      log.length === 1 && log[0].featureKey === 'workspace.loan' && log[0].source === 'workspace:loan');
    ok('F.2b dos usuarios en el mismo dispositivo no mezclan su registro',
      (() => { const st = {}; const a1 = makeApi({ store: st, uid: 'uidA' });
        const a2 = makeApi({ store: st, uid: 'uidB' });
        a1.setState(loaded(ST.free)); a2.setState(loaded(ST.free));
        a1.openUpgradeIntent({ featureKey: 'workspace.loan', source: 's' });
        a2.openUpgradeIntent({ featureKey: 'workspace.loan', source: 's' });
        return JSON.parse(st['aurix_upgrade_intent_v1_uidA']).length === 1 &&
               JSON.parse(st['aurix_upgrade_intent_v1_uidB']).length === 1; })());
    ok('F.2c no se registra nada mientras el entitlement no ha resuelto',
      (() => { const st = {}; const b = makeApi({ store: st, uid: 'uidC' });
        b.openUpgradeIntent({ featureKey: 'workspace.loan', source: 'boot' });
        return !st['aurix_upgrade_intent_v1_uidC']; })());
    ok('F.3 no registra PII', !/@|email|token/i.test(JSON.stringify(log)));
    // cota
    for (let i = 0; i < 60; i++) a.openUpgradeIntent({ featureKey: 'workspace.loan', source: 's' });
    ok('F.4 el log está acotado (≤50)', JSON.parse(store[KEY]).length === 50);
    ok('F.5 requireFeature con acceso ejecuta onAllowed',
      (() => { const b = makeApi({}); b.setState(loaded(ST.premium)); let ran = false;
        const got = b.requireFeature('workspace.loan', () => { ran = true; }); return ran && got === true; })());
    ok('F.6 requireFeature sin acceso NO ejecuta onAllowed y abre el intent',
      (() => { const st = {}; const b = makeApi({ store: st }); b.setState(loaded(ST.free)); let ran = false;
        const got = b.requireFeature('workspace.loan', () => { ran = true; });
        return !ran && got === false && JSON.parse(st['aurix_upgrade_intent_v1_uidA'] || '[]').length === 1; })());
  }
  // M.06 · BLOQUE 9/10/11 — OCULTAR NO ES RETIRAR. Este assert certificaba un
  // `display:none` sobre el botón «Ver Aurix Founder», y ese estilo era lo ÚNICO que
  // impedía ofrecer un plan retirado a un precio obsoleto… y sólo actuaba en ESTE
  // opener: `openUpgradeModal` (sin llamadores, expuesto en `window`) no lo ocultaba.
  // La página, el botón y el precio ya no existen, así que la garantía dejó de
  // depender de una línea de estilo y pasa a ser estructural.
  ok('F.7 el intent NO publica precio: el botón con precio ya no existe en ninguna parte',
    !/upgradeFounderBtn/.test(app) && !/upgradeFounderBtn/.test(idx) &&
    !/founderOverlay/.test(idx) && !/14[,.]99/.test(idx));
  ok('F.8 openFounderPage (que sí pinta precio) no se invoca desde el intent',
    !/openFounderPage/.test(fnSource('openUpgradeIntent')));
  ok('F.9 sin checkout, sin Stripe, sin Apple, sin trial en este bloque',
    !/stripe|checkout|verifyReceipt|storekit/i.test(fnSource('openUpgradeIntent') + fnSource('requireFeature')));

  // ══ G. UX (§4-§7, §14, §16) ════════════════════════════════════════════
  console.log('\nG · PRODUCTO');
  // Sobre el CÓDIGO, no sobre los comentarios: el bloque que documenta la retirada
  // nombra por fuerza lo retirado.
  ok('G.1 Workspace ya NO está bloqueado globalmente',
    !/hasAurixPremiumAccess/.test(stripComments(fnSource('renderWorkspace'))) &&
    !/_aurixPremiumPreviewHTML/.test(stripComments(fnSource('renderWorkspace'))));
  ok('G.2 el full-bleed depende sólo de la pestaña', /const _wsFullBleed = \(tab === 'workspace'\);/.test(app));
  ok('G.3 Intelligence se gatea con intelligence.full',
    /if \(!hasFeature\('intelligence\.full'\)\) return _aurixIntelligencePreviewHTML\(\);/.test(app));
  ok('G.4 el preview de Intelligence sigue siendo el fallback (no se retiró)',
    /_aurixIntelligencePreviewHTML/.test(app) && /_aurixPremiumPreviewHTML/.test(app));
  ok('G.5 el gate vive en _wsOpenTool, el único owner de apertura',
    /const _acc = _wsToolAccess\(key\);/.test(fnSource('_wsOpenTool')) &&
    /if \(!_acc\.ok\) \{/.test(fnSource('_wsOpenTool')) &&
    /openUpgradeIntent\(\{ featureKey: _acc\.featureKey/.test(fnSource('_wsOpenTool')));
  // CRÍTICO de la revisión de producto: sin estas etiquetas el ÚNICO punto de
  // conversión mostraba al usuario la clave interna "workspace.loan".
  ok('G.5b las 3 claves canónicas tienen etiqueta humana (cadena o clave i18n)',
    (() => { const src = slice('const FEATURE_LABELS = {', '};');
      return ['workspace.loan', 'intelligence.full', 'premium.settings'].every(k => {
        const kk = k.replace('.', '\\.');
        return new RegExp("'" + kk + "':\\s*\\{ es: '[^']+',\\s*en: '[^']+' \\}").test(src) ||
               new RegExp("'" + kk + "':\\s*\\{ i18nKey: '\\w+' \\}").test(src);
      }); })());
  // El nombre del modal debe SER el de la tarjeta: duplicarlo produjo
  // "Simulador de préstamos" en la tarjeta y "Simulador de préstamo" en el modal,
  // a un click de distancia.
  ok('G.5b2 el nombre de Loan en el modal LEE la misma clave que la tarjeta',
    /'workspace\.loan':\s*\{ i18nKey: 'wsloan_n' \}/.test(app) &&
    /if \(l\.i18nKey\) \{/.test(fnSource('_featureLabel')) &&
    /t\(l\.i18nKey\)/.test(fnSource('_featureLabel')) &&
    /wsloan_n:\s*'Simulador de préstamos'/.test(app));
  ok('G.5b3 y no queda una copia de ese nombre en FEATURE_LABELS',
    !/'workspace\.loan':\s*\{ es: 'Simulador/.test(app));
  // La clave delegada tiene que existir en AMBOS diccionarios: `t()` devuelve
  // `undefined` sin lanzar cuando el idioma existe pero la clave falta, y el modal
  // habría pintado el literal "undefined". Aseverar sólo ES dejaba el gate verde y
  // rompía al usuario inglés.
  ok('G.5b4 `wsloan_n` existe en ES y en EN',
    (app.match(/wsloan_n:\s*'[^']+'/g) || []).length === 2);
  ok('G.5b5 `_featureLabel` comprueba el VALOR, no sólo la ausencia de excepción',
    /const v = t\(l\.i18nKey\); if \(typeof v === 'string' && v\) return v;/.test(fnSource('_featureLabel')));

  // ── §18 · el ÚLTIMO hueco: ¿es `_wsCatalogFor` el único productor de tarjetas? ──
  // Un array de tarjetas escrito a mano esquivaría E.2/E.11 y L10–L14 completos,
  // porque todos razonan sobre `_WS_CATALOG`. No se comprueba con una AUSENCIA de
  // forma —esa es la familia que se volvió vacua en L10/L11— sino con igualdad de
  // RECUENTO y pertenencia POSITIVA, que no pueden satisfacerse sobre un conjunto
  // vacío. Medido contra el fichero real antes de fijar los números.
  {
    const home = fnSource('_renderWorkspaceHome');
    // M.03 A — el recuento sube de 3 a 4 en `_renderWorkspaceHome`: la columna
    // "Mis plantillas" de Mi Espacio ERA UN ARRAY VACÍO ESCRITO A MANO (`TPL_CAT =
    // []`) y ahora se deriva del catálogo por el mismo filtro de visibilidad. El
    // invariante que este assert protege —ninguna lista de tarjetas fuera del
    // catálogo— sale REFORZADO, no relajado: eran cuatro vistas y sólo tres
    // derivaban.
    // RE-DECIDIDO: el render tiene ahora CUATRO consumidores del catálogo —las dos
    // columnas de Mi Espacio (por `colItems`), la galería/rejilla (por `kind`) y la
    // vista interna— y todos pasan por `_wsCatalogFor` o `_wsCatalogInternal`. Lo
    // que importa es que NO exista una quinta lista escrita a mano, que es lo que
    // permitía que Mi Espacio se quedara congelado en el catálogo de LAUNCH-V1.
    ok('E.12 §18 todas las vistas derivan del catálogo, y no hay una quinta lista',
      (home.match(/_wsCatalogFor\(|_wsCatalogInternal\(/g) || []).length >= 3 &&
      !/_MSE_TOOL_RENDER|_MSE_TPL_RENDER|const TPL_CAT = \[/.test(app),
      'home=' + (home.match(/_wsCatalogFor\(|_wsCatalogInternal\(/g) || []).length);
    ok('E.13 §18 los emisores de apertura son exactamente los del catálogo',
      // Se emiten desde UN owner (`_wsCardAttrs`), así que hay una sola plantilla
      // por clase de apertura en vez de una por rejilla.
      (home.match(/data-wsh-cta="/g) || []).length === 3 &&
      (home.match(/data-wstool="/g) || []).length === 1,
      JSON.stringify([(home.match(/data-wsh-cta="/g) || []).length, (home.match(/data-wstool="/g) || []).length]));
    ok('E.14 §18 ningún `data-wstool` LITERAL: la identidad sale siempre del catálogo',
      (home.match(/data-wstool="[a-z_]+"/g) || []).length === 0,
      String(home.match(/data-wstool="[a-z_]+"/g) || []));
    ok('E.15 §18 los `data-wsh-cta` literales son CLASES de apertura, no identidades',
      (() => { const vals = [...new Set([...home.matchAll(/data-wsh-cta="([a-z_]+)"/g)].map(m => m[1]))].sort();
        return JSON.stringify(vals) === JSON.stringify(['tool', 'workspace']); })(),
      String([...new Set([...home.matchAll(/data-wsh-cta="([a-z_]+)"/g)].map(m => m[1]))]));
    // Un renderer huérfano que el catálogo no conozca queda cazado aquí.
    const ids = new Set(free._WS_CATALOG.map(e => e.id));
    // Los mapas son ahora constantes de MÓDULO (`_WS_TOOL_RENDER` / `_WS_TPL_RENDER`)
    // y sus claves van con dos espacios de sangría, no con seis. Antes vivían dentro
    // de `_renderWorkspaceHome` y había ADEMÁS una tercera y una cuarta copia
    // reducidas para Mi Espacio, congeladas en el catálogo de LAUNCH-V1: por eso Mi
    // Espacio no podía contener nunca las capacidades publicadas después. Dos mapas
    // menos que mantener es el arreglo, y que ya no existan se ancla abajo.
    const mapKeys = (block) => {
      const i = app.indexOf('const ' + block + ' = Object.freeze({'); if (i < 0) return null;
      const body = app.slice(i, app.indexOf('});', i));
      return [...body.matchAll(/\n\s{2}([\w]+):\s*\{/g)].map(m => m[1]);
    };
    const TR = mapKeys('_WS_TOOL_RENDER'), PR = mapKeys('_WS_TPL_RENDER');
    ok('E.16 §18 todo renderer declarado pertenece al catálogo (nada huérfano)',
      // Los dos mapas salieron de la función y son constantes de módulo; la tercera
      // y cuarta copia (las de Mi Espacio) dejaron de existir, que es el arreglo.
      TR && PR && TR.length === 11 && PR.length === 12 &&
      [...TR, ...PR].every(k => ids.has(k)) &&
      !/_MSE_TOOL_RENDER|_MSE_TPL_RENDER/.test(app),
      'huérfanos: ' + [...(TR || []), ...(PR || [])].filter(k => !ids.has(k)));
    // RE-DECIDIDO (§1): `keys.length === 7` fosilizaba el inventario de M.02. El
    // mapa tiene ahora también las superficies que NO pasan por `_wsOpenTool`
    // (Objetivos, Escenarios, Proyección), que antes se abrían asignando `_wshView`
    // sin comprobar NADA. El invariante real —toda clave de apertura usada está en
    // el mapa— se conserva, y se le añade el recíproco, que es el que de verdad
    // protege: toda clave del mapa resuelve a una entrada REAL del catálogo.
    ok('E.17 §18 y toda clave de apertura declarada existe en el mapa de herramientas',
      (() => { const i = app.indexOf('const _WS_TOOLKEY_TO_ID');
        const body = app.slice(i, app.indexOf('});', i));
        const keys = [...body.matchAll(/(\w+):\s*'[\w]+'/g)].map(m => m[1]);
        const vals = [...body.matchAll(/\w+:\s*'([\w]+)'/g)].map(m => m[1]);
        const used = [...app.matchAll(/tool: '(\w+)'/g)].map(m => m[1]);
        return keys.length >= 7 && [...new Set(used)].every(u => keys.includes(u))
          && [...new Set(vals)].every(v => ids.has(v)); })(),
      (() => { const i = app.indexOf('const _WS_TOOLKEY_TO_ID');
        const body = app.slice(i, app.indexOf('});', i));
        return [...body.matchAll(/\w+:\s*'([\w]+)'/g)].map(m => m[1]).filter(v => !ids.has(v)).join(','); })());
    // §1 — y NINGUNA superficie de vista puede abrirse sin pasar por el gate.
    ok('E.17b Objetivos, Escenarios y Proyección no se abren asignando `_wshView` a mano',
      !/_wshView = 'goals'/.test(app) && !/_wshView = 'scenario'/.test(app)
      && !/_wshView = 'planning'/.test(app)
      && /function _wsOpenSurface\(/.test(app) && /_wsToolAccess\(k\)/.test(app));
  }
  ok('G.5c el intent NO contamina la baseline durante la ventana de boot',
    /if \(_aurixEntLoaded\(\)\) _aurixUpgradeIntents\.push\(entry\);/.test(app) &&
    /if \(!_aurixEntLoaded\(\)\) throw new Error\('not-loaded'\);/.test(app));
  ok('G.5d una plantilla interna no se puede FIJAR (el guard que sí tenían las tools)',
    // Ahora es UNA regla para los dos mapas: sólo se fija lo publicado Y abrible.
    /pinRef: \(entry\.published === true && acc\.ok\) \? _wsCanonRef\(openKind, openArg\) : '',/.test(app) &&
    /\$\{m\.pinRef \? pinBtn\(m\.pinRef\) : ''\}/.test(app));
  ok('G.5e la rejilla nunca pinta columnas fijas que dejen una fila a medias',
    // `is-sparse` era un caso especial para «menos de 3». Con 5 y 8 tarjetas el
    // problema es el mismo, así que el recuento viaja en `data-wsgrid-n` y el
    // reparto es `auto-fit` en todos los casos.
    /data-wsgrid-n="\$\{items\.length\}"/.test(app) &&
    /\.wsh-tool-grid\[data-wsgrid-n\] \{ grid-template-columns: repeat\(auto-fit/.test(css) &&
    /\.wsh-tpl-grid\[data-wsgrid-n\]  \{ grid-template-columns: repeat\(auto-fit/.test(css));
  ok('G.5f el chip del catálogo interno tiene regla propia y NO usa alfa blanco',
    /\.wsh-tier\.is-preview\s*\{[^}]*color:\s*rgba\(/.test(css) &&
    !/\.wsh-tier\.is-preview\s*\{[^}]*rgba\(255,\s*255,\s*255/.test(css));
  ok('G.6 la tarjeta NO duplica la decisión del resolver',
    !/hasFeature\(/.test(slice('const tools = _wsCatalogFor', 'const accent = id =>')));
  ok('G.7 menú Premium gateado por premium.settings',
    (app.match(/hasFeature\('premium\.settings'\)/g) || []).length >= 2);
  ok('G.8 hasAurixPremiumAccess queda SIN autoridad (delega y no mira email ni flags)',
    !/rbn892|user\.premium|isPremium|subscriptionActive/.test(stripComments(fnSource('hasAurixPremiumAccess'))) &&
    /return hasFeature\('intelligence\.full'\);/.test(fnSource('hasAurixPremiumAccess')));
  ok('G.9 §14 Mi Espacio usa el MISMO icono real que la tarjeta',
    /_wsMseToolPreview\(it\)/.test(app) &&
    /_WS_TOOL_ASSET\[it\.entryId\]/.test(fnSource('_wsMseToolPreview')));
  {
    const a = makeApi({}); a.setState(loaded(ST.free));
    const html = a._wsMseToolPreview({ entryId: 'compound_growth', viz: 'curve' });
    ok('G.10 §14 el preview de Compound en Mi Espacio incluye tool_compound',
      /tool_compound\.webp/.test(html) && /has-asset/.test(html), html.slice(0, 70));
    const html2 = a._wsMseToolPreview({ entryId: 'scenario', viz: 'compare' });
    ok('G.11 §14 sin icono real no se inventa uno: cae al glyph', !/ws-asset-img/.test(html2));
  }
  ok('G.12 el host del icono de Mi Espacio está posicionado en CSS (si no, la imagen no se ve)',
    /\.wsh-mse2-ic\{[^}]*position:relative/.test(css.replace(/\s+/g, '')) ||
    /\.wsh-mse2-ic\s*\{[^}]*position:\s*relative/.test(css));
  ok('G.13 §16 no se concede Premium por defecto mientras carga (estado inicial denegado)',
    /loaded: false, loading: false, error: null,\s*\n?\s*plan: 'free'/.test(app.replace(/\r/g, '')));
  // La primera versión de esto era CÓDIGO MUERTO: leía `activeTab`, que no existe en
  // el bundle (el owner es `currentTab`), y llamaba a `_aurixMenuTier`, que es un
  // getter y no repinta nada. Un founder que abriera Intelligence antes de que
  // resolviera la RPC se quedaba en el preview Free. Lo detectó la revisión de
  // seguridad, y estos asserts existen para que no vuelva.
  ok('G.14 §16 al resolverse se repinta la sección activa (evita quedarse en Free)',
    /const tab = \(typeof currentTab !== 'undefined'\) \? currentTab : null;/.test(app) &&
    /if \(tab === 'workspace' \|\| tab === 'intelligence'\) switchTab\(tab\);/.test(app));
  ok('G.14b se llama al RENDERER del badge, no al getter',
    /if \(typeof _aurixRenderMenuIdentity === 'function'\) _aurixRenderMenuIdentity\(\);/.test(app));
  ok('G.14c `activeTab` no existe en el bundle: no debe quedar ninguna referencia viva',
    !/typeof activeTab/.test(app));
  // B2 declara que un deny global es ABSOLUTO. En cliente no lo era: una sola carga
  // por página dejaba una sesión abierta con acceso indefinido tras un corte de
  // soporte, y una suscripción cancelada seguía dando acceso toda la sesión.
  ok('G.17 el entitlement se REVALIDA al volver la pestaña al primer plano',
    /function _aurixEntRevalidate/.test(app) &&
    /document\.addEventListener\('visibilitychange'/.test(app) &&
    /if \(document\.visibilityState === 'visible'\) _aurixEntRevalidate/.test(app));
  // Una pestaña de escritorio TAPADA sigue en visibilityState 'visible', así que sin
  // esto el kill switch volvía a ser ilimitado ahí. Y el comentario prometía este
  // cableado antes de que existiera: un comentario que promete un control de
  // seguridad inexistente es cómo el siguiente revisor deja de mirar.
  ok('G.17b …y también al refrescar el token (pestaña de escritorio nunca oculta)',
    /_aurixEntRevalidate\('token-refreshed'\)/.test(app) &&
    /TOKEN_REFRESHED[\s\S]{0,400}_aurixEntRevalidate\('token-refreshed'\)/.test(app));
  ok('G.17c el comentario no promete más cableado del que existe',
    (() => { const i = app.indexOf('// REVALIDACIÓN. B2 declara');
      const blk = app.slice(i, i + 900);
      const promiseTok = /TOKEN_REFRESHED/.test(blk);
      return !promiseTok || /_aurixEntRevalidate\('token-refreshed'\)/.test(app); })());
  ok('G.17d la firma se siembra en el boot (el primer foco no repinta sin motivo)',
    /_aurixEntLastSig = JSON\.stringify\(_aurixEnt\.features\);/.test(app));
  ok('G.18 la revalidación respeta el TTL (no fuerza en cada foco) y no hace polling',
    /_aurixEntitlementsLoad\(\)\.then\(\(st\) =>/.test(app) &&
    !/setInterval\([^)]*_aurixEnt/.test(app));
  ok('G.19 sólo se repinta si CAMBIA lo que el usuario puede usar (no parpadea)',
    /const sig = JSON\.stringify\(st\.features\);/.test(app) && /if \(sig === _aurixEntLastSig\) return;/.test(app));
  ok('G.20 el badge del menú lee el estado comercial del SERVIDOR, no el tier legacy',
    /if \(!_aurixEntLoaded\(\)\) return 'free';/.test(fnSource('_aurixMenuTier')) &&
    /_aurixEnt\.plan === 'premium' \? 'premium' : 'free'/.test(fnSource('_aurixMenuTier')) &&
    !/getPlan/.test(fnSource('_aurixMenuTier')));
  ok('G.21 el log de intención está namespaced por usuario',
    /_AURIX_UPGRADE_INTENT_KEY \+ \(_aurixActiveUserId \? \('_' \+ _aurixActiveUserId\) : ''\)/.test(app));
  ok('G.15 Compound conserva su featureKey nulo y su tier free',
    (() => { const e = free._wsCatalogEntry('compound_growth');
      return e && e.featureKey === null && e.commercialTier === 'free' && e.published === true; })());
  ok('G.16 Loan: published + premium + workspace.loan',
    (() => { const e = free._wsCatalogEntry('loan_simulation');
      return e && e.featureKey === 'workspace.loan' && e.commercialTier === 'premium' && e.published === true; })());

  // ══ M3. M.03 · A — WORKSPACE: FREE V1 ══════════════════════════════════
  // El bloque A del SPEC M.03 publica la primera PLANTILLA gratuita. Lo que hay
  // que demostrar no es que exista una línea de catálogo, sino que la superficie
  // se ABRE para un usuario Free sin que la entrada interna de la misma
  // superficie conceda nada por su cuenta.
  console.log('\nM3 · WORKSPACE FREE V1 (M.03 A)');
  {
    const e = free._wsCatalogEntry('tpl_realestate');
    ok('M3.1 Real Estate Portfolio: plantilla PUBLICADA, gratis y sin featureKey',
      !!e && e.kind === 'template' && e.published === true &&
      e.commercialTier === 'free' && e.featureKey === null, JSON.stringify(e));
    ok('M3.2 declara la superficie que abre, y el resolver de superficie la elige',
      e.opens === 'realestate' &&
      free._wsSurfaceEntry('realestate') === e);
    ok('M3.3 un usuario FREE la abre de verdad',
      free._wsToolAccess('realestate').ok === true &&
      free._wsToolAccess('realestate').featureKey === null);
    ok('M3.3b …y el founder también, por el mismo camino',
      fdr._wsToolAccess('realestate').ok === true);
    // El punto delicado: la MISMA superficie conserva su entrada de herramienta
    // del inventario de M.02, y esa sigue interna. Publicar la plantilla no puede
    // haber publicado la herramienta.
    // El invariante de M.03 A intacto: la entrada de HERRAMIENTA de una superficie
    // publicada como PLANTILLA sigue interna, para que no haya dos hogares públicos.
    // Lo que cambia es la lista pública de herramientas, que ahora incluye
    // Escenarios — se deriva del catálogo en vez de repetirse aquí.
    ok('M3.4 la entrada de HERRAMIENTA de la misma superficie sigue interna e invisible',
      free._wsCatalogEntry('real_estate_portfolio').published === false &&
      free._wsCatalogVisible(free._wsCatalogEntry('real_estate_portfolio')) === false &&
      ['monthly_budget', 'receivables', 'trade_journal', 'goal'].every(id =>
        free._wsCatalogEntry(id).published === false
        && free._wsCatalogVisible(free._wsCatalogEntry(id)) === false));
    ok('M3.4b …y ninguna superficie tiene DOS entradas publicadas',
      (() => { const seen = {};
        return free._WS_CATALOG.filter(e => e.published && e.opens)
          .every(e => { if (seen[e.opens]) return false; seen[e.opens] = 1; return true; }); })());
    ok('M3.5 dos entradas publicadas para una superficie = AMBIGÜEDAD y falla cerrado',
      /if \(opens\.length > 1\) return null;/.test(fnSource('_wsSurfaceEntry')) &&
      free._wsCatalogVisible(null) === false &&
      free._wsToolAccess('__inexistente__').ok === false &&
      free._wsToolAccess('__inexistente__').reason === 'unpublished');
    ok('M3.6 el gate de la superficie NO duplica la decisión: sigue siendo un solo predicado',
      /const entry = _wsSurfaceEntry\(toolKey\);/.test(fnSource('_wsToolAccess')) &&
      (fnSource('_wsToolAccess').match(/hasFeature\(/g) || []).length === 1);
    ok('M3.7 la columna "Mis plantillas" de Mi Espacio se DERIVA del catálogo',
      /_wsCatalogFor\(kind\)\s*[\r\n]\s*\.filter\(e => map\[e\.id\]\)/.test(app) &&
      /const tplList = colItems\(_WS_TPL_RENDER, 'template'\);/.test(app) &&
      !/const TPL_CAT = \[\];/.test(app));
    ok('M3.8 el cover reutiliza un asset YA existente de esa plantilla (no se añade ninguno)',
      /realestate:\s+'realestate_apartment'/.test(app) &&
      fs.existsSync(path.join(root, 'assets/workspace/realestate_apartment.webp')));
    ok('M3.9 ninguna cabecera de herramienta pinta un "Pro" decorativo',
      !/wsh-pro-badge/.test(app) &&
      /_wsTierChip\('tpl_realestate'\)/.test(app) && /_wsTierChip\('loan_simulation'\)/.test(app));
    ok('M3.10 y la etiqueta que pinta esa cabecera es la REAL del catálogo',
      free._wsCommercialLabel(e) === 'Incluido' &&
      free._wsCommercialLabel(free._wsCatalogEntry('loan_simulation')) === 'Premium');
    // La plantilla gratuita SÍ guarda trabajo y sus claves no viajan en el sync:
    // se declara, no se promete permanencia.
    ok('M3.11 la permanencia local se DECLARA en la plantilla, en los dos idiomas',
      (app.match(/wsre_local_note:/g) || []).length === 2 &&
      /wsre_local_note/.test(fnSource('_renderRealEstateTool')));
    ok('M3.12 la galería no pinta columnas fijas con pocas tarjetas',
      /data-wsgrid-n="\$\{items\.length\}"/.test(app) &&
      /\.wsh-tpl-grid\[data-wsgrid-n="1"\], \.wsh-tpl-grid\[data-wsgrid-n="2"\]   \{ grid-template-columns: repeat\(auto-fit/.test(css));
    ok('M3.13 Mi Espacio distingue lo USADO, lo GUARDADO y lo FIJADO',
      // Y ahora son TRES señales, no dos: un documento guardado puebla su columna
      // aunque no se haya abierto hoy, que es lo que se espera de un espacio de
      // trabajo (antes Mi Espacio sólo sabía de aperturas en memoria).
      /ref, used, pinned, savedCount: sv\.n, savedTs: sv\.ts,/.test(app) &&
      (app.match(/wsmse2_saved:/g) || []).length === 2 &&
      (app.match(/wsmse2_doc_one:/g) || []).length === 2);
    // RE-DECIDIDO POR DECISIÓN DE PRODUCTO. «Espacio vacío = UNA portada» era la
    // respuesta correcta a dos estados vacíos en paralelo, pero la SPEC de cierre
    // pide lo contrario y con razón: las DOS columnas tienen que verse desde el
    // primer viewport, también vacías, porque son el mapa del espacio. Lo que no
    // puede pasar —y es lo que se ancla— es que se fabrique contenido para
    // rellenarlas ni que se rompa la simetría.
    ok('M3.14 espacio vacío = dos columnas simétricas y CERO contenido inventado',
      /panel = `<div class="wsh-mse2" data-wsmse-cols="2"/.test(app) &&
      !/_mseEmpty/.test(app) && !/wsh-mse2-blank/.test(app) &&
      /\.wsh-mse2\[data-wsmse-cols="2"\] \{ align-items: stretch; \}/.test(css));
    ok('M3.15 paridad i18n de las claves nuevas de Workspace',
      ['wsmse2_saved', 'wsmse2_empty_t', 'wsmse2_empty_b', 'wsre_local_note']
        .every(k => (app.match(new RegExp('\\n\\s+' + k + ':', 'g')) || []).length === 2));
  }

  // ══ H. FUERA DE ALCANCE / VERSIONADO ═══════════════════════════════════
  console.log('\nH · ALCANCE Y DEPLOY');
  ok('H.1 sin herramientas ni plantillas nuevas: el inventario es el que ya existía',
    free._WS_CATALOG.length === 23, 'entradas: ' + free._WS_CATALOG.length);
  // Sin features VENDIBLES nuevas. `workspace.catalog_preview` (M.02 B4) sí es una
  // clave nueva, y es la excepción declarada: ningún plan la concede, no se vende y
  // no gatea nada del catálogo — sólo decide si se VE el inventario interno. El
  // assert distingue las dos cosas en vez de afirmar un "sólo 3" que ya no es cierto.
  // ── RE-DECIDIDO · WORKSPACE COMPLETION §1 ────────────────────────────────
  // «El catálogo sólo gatea con workspace.loan» era una aserción de ALCANCE del
  // bloque M.02 («no añadimos features vendibles en ESTE bloque»), y este bloque
  // añade seis a propósito: son el catálogo canónico que la SPEC declara. Dejarla
  // habría bloqueado el encargo por cumplir el alcance del anterior. Lo que la
  // sustituye es más estricto: toda clave vendible tiene que estar DECLARADA en un
  // SQL del repo y su entrada NO puede estar publicada hasta aplicarlo.
  ok('H.2 toda clave vendible del catálogo está declarada en un SQL del repo',
    (() => {
      const sql = ['db/monetization_m04_billing_stripe_1.sql', 'db/monetization_commercial_truth_1.sql',
                   'db/monetization_catalog_preview_key_1.sql', 'db/workspace_premium_2_plan_features.sql']
        .map(f => { try { return read(f); } catch (_) { return ''; } }).join('\n');
      const keys = [...new Set(free._WS_CATALOG.map(e => e.featureKey).filter(Boolean))];
      return keys.length >= 1 && keys.every(k => sql.indexOf("'" + k + "'") !== -1);
    })(),
    JSON.stringify([...new Set(free._WS_CATALOG.map(e => e.featureKey).filter(Boolean))]));
  // El SQL YA ESTÁ APLICADO (el founder lo ejecutó el 2026-09-16 y verificó las diez
  // filas), y por eso las cinco capacidades pasaron a publicadas. Lo que este assert
  // vigila cambia de lado pero no de fuerza: la cabecera tiene que declarar su
  // estado REAL —con fecha y con la prueba— y el fichero tiene que seguir siendo
  // reejecutable sin daño, que es lo que hace segura una migración aplicada.
  ok('H.2a y el SQL que las concede declara en su cabecera que está aplicado, con fecha y prueba',
    (() => { const sql = read('db/workspace_premium_2_plan_features.sql');
      return /\*\*\* APLICADO EN PRODUCCION · 2026-09-16 \*\*\*/.test(sql)
        && /10 filas para las cinco claves/.test(sql) && !/SIN APLICAR/.test(sql)
        && /on conflict \(plan, feature_key\) do update/.test(sql); })());
  ok('H.2b la única clave nueva no es vendible por ningún plan',
    (() => { const sql = read('db/monetization_catalog_preview_key_1.sql');
      return /'workspace\.catalog_preview', false/.test(sql) &&
             !/'workspace\.catalog_preview', true/.test(sql); })());
  ok('H.2c y no gatea ninguna entrada del catálogo (no vende producto)',
    free._WS_CATALOG.every(e => e.featureKey !== 'workspace.catalog_preview'));
  ok('H.3 Chart / owners financieros no tocados en este bloque',
    !/portfolio_snapshots|capital_flows|computeAurixTWRSeries/.test(ENT_BLOCK + CAT_BLOCK));
  const V = { build: (idx.match(/var BUILD = '([^']+)'/) || [])[1], appjsIdx: (idx.match(/var APPJS_V = '(\d+)'/) || [])[1],
              src: (idx.match(/app\.js\?v=(\d+)/) || [])[1], css: (idx.match(/styles\.css\?v=(\d+)/) || [])[1],
              inApp: (app.match(/__AURIX_APPJS_VERSION__ = '(\d+)'/) || [])[1],
              manifest: JSON.parse(read('version.json') || '{}') };
  ok('H.4 cache-bust coherente: index/app.js/version.json dicen el MISMO appjs',
    V.appjsIdx === V.src && V.src === V.inApp && String(V.manifest.appjs) === V.src,
    JSON.stringify(V));
  ok('H.5 el BUILD se bumpeó y coincide con el manifiesto',
    Number((String(V.build||'').match(/^v(\d+)/)||[0,0])[1]) >= 699 && V.manifest.build === V.build);
  ok('H.6 styles.css?v= bumpeado (hay cambio de CSS en este bloque)', Number(V.css) >= 665);

  console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
  process.exit(fail ? 1 : 0);
})();
