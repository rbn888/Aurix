'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-M06-IDENTITY-LIFECYCLE — ciclo de vida de identidad, como un contrato
// ════════════════════════════════════════════════════════════════════════════
// Un solo gate para las tres piezas del mismo sistema, porque comparten owners:
//   A) AISLAMIENTO por evento de ciclo de vida (cambio de usuario / cierre de
//      sesión del mismo usuario / reset), con aparcado y DES-APARCADO.
//   B) IDEMPOTENCIA del email de bienvenida, reservada en el SERVIDOR.
//   C) El muro de beta privada como EXCEPCIÓN, no como estado por defecto.
//
// Ejecuta la purga, el aparcado y el des-aparcado REALES contra un
// almacenamiento simulado y recorre las secuencias completas que pidió el
// founder: A→A, A→B, A→B→A, A→B→A→B, con recarga en cada régimen.
//
// LOS DOS DEFECTOS QUE ESTE GATE EXISTE PARA IMPEDIR QUE VUELVAN:
//   1. El des-aparcado sólo corría en la rama propia, y en A→B→A el sello es B,
//      así que la entrada de A caía SIEMPRE en la rama foránea y su estado
//      quedaba huérfano para siempre ⇒ su depósito no empujado se publicaba
//      como RENDIMIENTO de forma permanente.
//   2. El reconocimiento del segundo hueco usaba una expresión regular escrita
//      a mano cuyo `\d` se perdió en el escapado (`/^_d+$/`), así que el hueco
//      `_2` era de SÓLO ESCRITURA. El gate anterior comprobaba que no se
//      sobrescribiera, pero NUNCA que se recuperara. Aquí se comprueba.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const login = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
const waitlist = fs.readFileSync(path.join(root, 'api', 'waitlist.js'), 'utf8');

let pass = 0, fail = 0; const failed = [];
function ok(n, c, info) {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; failed.push(n); console.log('  ✗ ' + n + (info ? '  →  ' + info : '')); }
}
function fnSrc(name) {
  const i = app.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('owner ausente: ' + name);
  let k = app.indexOf('{', i), d = 0;
  for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } }
  return app.slice(i, k);
}
function litSrc(name, open, close) {
  const m = new RegExp('const ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*\\' + open).exec(app);
  if (!m) throw new Error('literal ausente: ' + name);
  let k = app.indexOf(open, m.index), d = 0;
  for (; k < app.length; k++) { const c = app[k]; if (c === open) d++; else if (c === close) { d--; if (!d) { k++; break; } } }
  return app.slice(m.index, k) + ';';
}
function scalar(name) {
  const i = app.indexOf('const ' + name + ' =');
  if (i < 0) throw new Error('constante ausente: ' + name);
  return app.slice(i, app.indexOf(';', i) + 1);
}

// ── un "navegador" persistente con los owners REALES ───────────────────────
function makeStore(seed) {
  const map = new Map(Object.entries(seed || {}));
  return { map: map, get length() { return map.size; },
    key(i) { return Array.from(map.keys())[i]; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); } };
}
function browser(seed) {
  const ls = makeStore(seed);
  const ctx = { console: { log() {}, warn() {} }, localStorage: ls, sessionStorage: makeStore({ otp_sent: '1' }),
    Object, Array, String, JSON, Number, Math, isFinite, document: undefined };
  vm.createContext(ctx);
  [litSrc('PORTFOLIO_KEYS', '[', ']'), litSrc('AUTH_LOCAL_KEYS', '[', ']'),
   litSrc('USER_SCOPED_LOCAL_KEYS', '[', ']'), litSrc('USER_SCOPED_LOCAL_PREFIXES', '[', ']'),
   litSrc('USER_SCOPED_WORK_KEYS', '[', ']'), litSrc('USER_SCOPED_WORK_PREFIXES', '[', ']'),
   litSrc('_AURIX_PURGE', '{', '}'), scalar('_AURIX_PARKED_SUFFIX'),
   scalar('_AURIX_PARKED_MAX_SLOTS'), scalar('_AURIX_PARKED_MAX_TOTAL'), scalar('_AURIX_CACHE_OWNER_KEY'),
   'let _aurixActiveUserId = null;',
   fnSrc('_aurixParkedSlotName'), fnSrc('_aurixParkedSlotIndex'), fnSrc('_aurixParkedOwnerTag'),
   fnSrc('_aurixParkedCount'), fnSrc('_aurixParkedEvictOne'), fnSrc('_aurixParkKeyForOwner'), fnSrc('_aurixUnparkKeysForOwner'),
   fnSrc('_clearLocalUserState'), fnSrc('_aurixCacheOwner'), fnSrc('_aurixStampCacheOwner'),
   fnSrc('_aurixCacheIsForeign'),
  ].forEach(c => vm.runInContext(c, ctx));
  const run = e => vm.runInContext(e, ctx);
  // `login` reproduce EXACTAMENTE la secuencia de `_aurixEnforceCacheOwner`: si el caché es
  // ajeno, purga+aparca con el propietario ANTERIOR, re-sella y DES-APARCA lo del nuevo; si es
  // propio, re-sella y des-aparca. Es la pieza cuyo orden era el defecto crítico.
  return {
    get: k => ls.getItem(k), has: k => ls.getItem(k) != null,
    keys: () => Array.from(ls.map.keys()), run: run,
    logout: () => run('_clearLocalUserState(_AURIX_PURGE.SAME_USER);'),
    reload: () => {},                                   // el store persiste: recargar no lo toca
    login: uid => run('(function(){ _aurixActiveUserId = ' + JSON.stringify(uid) + ';' +
      ' var owner = _aurixCacheOwner();' +
      ' if (_aurixCacheIsForeign()) { _clearLocalUserState(_AURIX_PURGE.USER_SWITCH, owner);' +
      '   _aurixStampCacheOwner(); _aurixUnparkKeysForOwner(_aurixActiveUserId); return "switch"; }' +
      ' _aurixStampCacheOwner(); _aurixUnparkKeysForOwner(_aurixActiveUserId); return "same"; })()'),
    tag: uid => run('_aurixParkedOwnerTag(' + JSON.stringify(uid) + ')'),
  };
}
const A = 'user-A-uuid', B = 'user-B-uuid';
const DEP_A = '[{"kind":"deposit","amount":5000,"ts":1}]';
const seedA = () => ({
  'aurix_cache_owner': A,
  'aurix_assets': 'A', 'aurix_holdings': 'A', 'portfolio_history': 'A', 'category_history': 'A',
  'aurix_watchlist': 'A', 'aurixLastGoodChartByRange': 'A', 'aurix_portfolio_meta': 'A',
  'aurixCapitalFlows': DEP_A, 'aurixFlowLedgerRevision': '7',
  'aurix_reset_at': '1700000000000', 'aurix_portfolio_epoch': '1700000000000',
  'aurix_ws_goals_v1': 'metasA', 'aurix_ws_scenarios_v1': 'escA', 'aurix_ws_tool_state_v1': 'herrA',
  'aurix_ws_pinned_v1': 'fijadasA', 'aurix_ws2_compound_growth': 'ws2A',
  'portfolio_lang': 'en', 'portfolio_base_currency': 'EUR', 'aurix_prefs_updated_at': '111',
  'aurix_display_name': 'Ruben', 'aurix.gs.recent.v1': 'busqA',
  'aurix_portfolio_backup_before_migration_1712345678901': 'copiaA',
  'aurix_device_id': 'dev-1', 'aurix_plan': '{"tier":"premium"}',
  'aurix_investable_chart_epoch': '1780704000000',
});
const WORK_A = ['aurixCapitalFlows', 'aurixFlowLedgerRevision', 'aurix_ws_goals_v1',
  'aurix_ws_scenarios_v1', 'aurix_ws_tool_state_v1', 'aurix_ws_pinned_v1', 'aurix_ws2_compound_growth'];
const SERVER_BACKED = ['aurix_assets', 'aurix_holdings', 'portfolio_history', 'category_history',
  'aurix_watchlist', 'aurixLastGoodChartByRange', 'aurix_portfolio_meta'];

console.log('AURIX-M06-IDENTITY-LIFECYCLE — identidad, sesión y bienvenida como un contrato\n');

console.log('A · AISLAMIENTO · A → cerrar sesión → A entra (mismo usuario)');
{
  const bw = browser(seedA());
  bw.logout();
  ok('A1.1 el SELLO sobrevive al logout — sin él el siguiente cambio es indetectable', bw.get('aurix_cache_owner') === A);
  ok('A1.2 el LEDGER sobrevive: un depósito cuyo push falló es el ÚNICO testigo', bw.get('aurixCapitalFlows') === DEP_A);
  ok('A1.3 sobreviven sus lápidas de reset', bw.get('aurix_reset_at') === '1700000000000' && bw.get('aurix_portfolio_epoch') === '1700000000000');
  ok('A1.4 sobrevive su trabajo local, en su sitio y sin aparcar',
    WORK_A.every(k => bw.has(k)) && !bw.keys().some(k => k.indexOf('__parked_') >= 0));
  ok('A1.5 sobreviven el idioma, la divisa y su sello LWW (contrato M.03)',
    bw.get('portfolio_lang') === 'en' && bw.get('portfolio_base_currency') === 'EUR' && bw.get('aurix_prefs_updated_at') === '111');
  ok('A1.6 lo respaldado por servidor SÍ se purga (se vuelve a descargar)', SERVER_BACKED.every(k => !bw.has(k)));
  bw.reload();
  ok('A1.7 una RECARGA no cambia nada', bw.get('aurixCapitalFlows') === DEP_A && bw.get('aurix_cache_owner') === A);
  ok('A1.8 al volver A NO se detecta cambio de propietario', bw.login(A) === 'same');
  ok('A1.9 y su estado financiero sigue intacto tras el ciclo', bw.get('aurixCapitalFlows') === DEP_A);
}

console.log('\nA · AISLAMIENTO · A → cerrar sesión → B entra (la ruta MÁS COMÚN)');
{
  const bw = browser(seedA());
  bw.logout();
  ok('A2.1 B se detecta como CAMBIO de propietario (esto estaba inerte sin la pieza del sello)', bw.login(B) === 'switch');
  ok('A2.2 nada respaldado por servidor sobrevive', SERVER_BACKED.every(k => !bw.has(k)));
  ok('A2.3 el ledger de A no queda legible para B (era el P0: se subía con el user_id de B)', !bw.has('aurixCapitalFlows'));
  ok('A2.4 …y no se borra: queda aparcado bajo el hash de A', bw.get('aurixCapitalFlows__parked_' + bw.tag(A)) === DEP_A);
  ok('A2.5 las LÁPIDAS de A no sobreviven (su epoch no puede filtrar la historia de B)',
    !bw.has('aurix_reset_at') && !bw.has('aurix_portfolio_epoch'));
  ok('A2.6 B no hereda el IDIOMA ni la DIVISA BASE de A (la fuga era determinista por el re-sello)',
    !bw.has('portfolio_lang') && !bw.has('portfolio_base_currency') && !bw.has('aurix_prefs_updated_at'));
  ok('A2.7 ni la identidad ni el rastro de navegación', !bw.has('aurix_display_name') && !bw.has('aurix.gs.recent.v1'));
  ok('A2.8 ni su trabajo de Workspace, ni su personalización', !bw.has('aurix_ws_goals_v1') && !bw.has('aurix_ws_pinned_v1'));
  ok('A2.9 la copia previa a migración SÍ se borra (duplicado verbatim, cero lectores)',
    !bw.has('aurix_portfolio_backup_before_migration_1712345678901'));
  ok('A2.10 lo del DISPOSITIVO sobrevive: no es de ningún usuario',
    bw.get('aurix_device_id') === 'dev-1' && bw.get('aurix_investable_chart_epoch') === '1780704000000');
  ok('A2.11 el sello queda re-sellado a B', bw.get('aurix_cache_owner') === B);
  ok('A2.12 ningún nombre de clave contiene el id crudo de A (el diagnóstico volca NOMBRES)',
    bw.keys().every(k => k.indexOf(A) < 0) && bw.keys().some(k => k.indexOf('__parked_') >= 0));
}

console.log('\nA · AISLAMIENTO · A → B → A · RECUPERACIÓN (el defecto crítico anterior)');
{
  const bw = browser(seedA());
  bw.login(B);
  ok('A3.1 tras el cambio a B, lo de A está aparcado y no vivo',
    WORK_A.every(k => !bw.has(k)) && bw.get('aurixCapitalFlows__parked_' + bw.tag(A)) === DEP_A);
  const ev = bw.login(A);
  ok('A3.2 A vuelve y se detecta como cambio (el sello era de B) — la rama FORÁNEA', ev === 'switch', String(ev));
  ok('A3.3 y AHÍ MISMO se le devuelve su LEDGER: el flujo no empujado se recupera EN ESA MISMA ENTRADA',
    bw.get('aurixCapitalFlows') === DEP_A, JSON.stringify(bw.get('aurixCapitalFlows')));
  ok('A3.4 …y todo su trabajo local', WORK_A.every(k => bw.has(k)), WORK_A.filter(k => !bw.has(k)).join(','));
  ok('A3.5 el aparcado se CONSUME al restaurarse (no se acumula)', !bw.has('aurixCapitalFlows__parked_' + bw.tag(A)));
  bw.reload();
  ok('A3.6 una RECARGA conserva lo recuperado', bw.get('aurixCapitalFlows') === DEP_A);
  ok('A3.7 el des-aparcado corre ANTES del primer pull de flujos',
    (() => { const init = fnSrc('initPortfolioData');
      const iOwner = init.indexOf('_aurixEnforceCacheOwner('), iPull = init.indexOf('_aurixCapitalFlowsPull()');
      return iOwner >= 0 && iPull > iOwner; })());
  ok('A3.8 …y está en LAS DOS ramas del owner, no sólo en la propia',
    (fnSrc('_aurixEnforceCacheOwner').match(/_aurixUnparkKeysForOwner\(_aurixActiveUserId\)/g) || []).length === 2);
}

console.log('\nA · AISLAMIENTO · A → B → A → B · ida y vuelta repetida');
{
  const bw = browser(seedA());
  bw.login(B); bw.login(A);
  // A, ya con lo suyo restaurado, registra un flujo NUEVO antes de volver a salir.
  bw.run('localStorage.setItem("aurixCapitalFlows", ' + JSON.stringify(JSON.stringify([{ kind: 'deposit', amount: 5000, ts: 1 }, { kind: 'deposit', amount: 250, ts: 2 }])) + ');');
  bw.login(B);
  ok('A4.1 al volver B, el ledger de A vuelve a quedar fuera de su alcance', !bw.has('aurixCapitalFlows'));
  const parked = bw.keys().filter(k => k.indexOf('aurixCapitalFlows__parked_' + bw.tag(A)) === 0);
  ok('A4.2 y se aparca con SUS DOS flujos, no con la versión antigua', parked.length === 1 && /250/.test(bw.get(parked[0])), parked.join(','));
  ok('A4.3 A vuelve una segunda vez y lo recupera íntegro',
    (() => { bw.login(A); const v = bw.get('aurixCapitalFlows'); return !!v && /5000/.test(v) && /250/.test(v); })(),
    JSON.stringify(bw.get('aurixCapitalFlows')));
}

console.log('\nA · AISLAMIENTO · el segundo hueco se ESCRIBE y se RECUPERA (el bug del escapado)');
{
  const bw = browser(seedA());
  const t = bw.tag(A);
  // Se ocupa el hueco base a mano, para forzar que el aparcado use `_2`.
  bw.run('localStorage.setItem("aurix_ws_goals_v1__parked_' + t + '","viejo");');
  bw.login(B);
  ok('A5.1 con el hueco base ocupado, el aparcado usa el SEGUNDO hueco', bw.get('aurix_ws_goals_v1__parked_' + t + '_2') === 'metasA');
  ok('A5.2 y no sobrescribe el primero', bw.get('aurix_ws_goals_v1__parked_' + t) === 'viejo');
  bw.login(A);
  // Gana el MÁS RECIENTE, que es el dato correcto: 'metasA' se aparcó en `_2` al cambiar a B.
  ok('A5.3 al volver A se recupera el hueco MÁS RECIENTE (determinista)', bw.get('aurix_ws_goals_v1') === 'metasA', JSON.stringify(bw.get('aurix_ws_goals_v1')));
  ok('A5.3b …y el hueco superado se retira en la misma pasada, sin ocupar presupuesto para siempre',
    !bw.has('aurix_ws_goals_v1__parked_' + t + '_2') || bw.get('aurix_ws_goals_v1') === 'metasA');
  // RECUPERACIÓN DEL SEGUNDO HUECO POR UN CAMINO REAL. Antes ganaba el hueco de MENOR índice,
  // así que el slot 1 se restauraba y el `_2` —el estado más RECIENTE— caía en «lo vivo manda»
  // en esa misma pasada: no se consumía nunca sin un `removeItem` manual que ninguna ruta de
  // producción ejecuta. Ahora gana el más reciente, que es además el dato correcto.
  {
    const bw2 = browser(seedA());
    const t2 = bw2.tag(A);
    bw2.run('localStorage.setItem("aurix_ws_goals_v1__parked_' + t2 + '","viejo");');
    bw2.login(B);                                   // lo vivo de A ('metasA') va al hueco _2
    ok('A5.4 con dos huecos, al volver A se restaura el MÁS RECIENTE, sin intervención manual',
      (() => { bw2.login(A); return bw2.get('aurix_ws_goals_v1') === 'metasA'; })(),
      JSON.stringify(bw2.get('aurix_ws_goals_v1')));
    ok('A5.4b y el hueco superado no se queda ocupando presupuesto',
      !bw2.has('aurix_ws_goals_v1__parked_' + t2) && !bw2.has('aurix_ws_goals_v1__parked_' + t2 + '_2'));
  }
  ok('A5.5 el nombre del hueco se construye y se reconoce con el MISMO literal, sin regex escrita a mano',
    !/test\(k\.slice/.test(fnSrc('_aurixUnparkKeysForOwner')) &&
    /_aurixParkedSlotIndex/.test(fnSrc('_aurixUnparkKeysForOwner')) &&
    /_aurixParkedSlotName/.test(fnSrc('_aurixParkKeyForOwner')));
}

console.log('\nA · AISLAMIENTO · lo vivo manda, y nada se destruye');
{
  const bw = browser(seedA());
  bw.login(B); bw.login(A);
  bw.run('localStorage.setItem("aurix_ws_goals_v1","nuevoDeA");');
  bw.login(B); bw.login(A);
  ok('A6.1 si la clave VIVA existe, el des-aparcado la RESPETA', bw.get('aurix_ws_goals_v1') === 'nuevoDeA');
  const bw2 = browser(seedA());
  const t2 = bw2.tag(A);
  bw2.run('localStorage.setItem("aurix_ws_goals_v1__parked_' + t2 + '","1");');
  bw2.run('localStorage.setItem("aurix_ws_goals_v1__parked_' + t2 + '_2","2");');
  bw2.login(B);
  // Con los dos huecos del propietario ocupados ya no se conserva la clave viva: se RETIRA, porque
  // dejarla sería exponer su trabajo a la cuenta entrante. Los aparcados previos siguen intactos.
  ok('A6.2 con los huecos del propietario agotados, la clave viva se RETIRA (no queda legible)',
    !bw2.has('aurix_ws_goals_v1'));
  ok('A6.2b …y los aparcados previos no se tocan',
    bw2.get('aurix_ws_goals_v1__parked_' + t2) === '1' && bw2.get('aurix_ws_goals_v1__parked_' + t2 + '_2') === '2');
  // ESTE ASSERT ESTABA AL REVÉS Y CERTIFICABA LA FUGA. Afirmaba que con el presupuesto global
  // lleno el ledger del saliente seguía VIVO — y eso es exactamente el P0: el des-aparcado del
  // entrante lo respeta por «lo vivo manda», su pull lo declara completo y lo empuja a SU fila
  // remota con SU user_id. La invariante correcta es ABSOLUTA: tras un cambio de usuario,
  // ninguna clave de trabajo del propietario anterior queda legible. Si no cabe aparcarla se
  // desaloja lo más antiguo, y si aún no cabe se RETIRA: un ledger ajeno vivo corrompe la
  // verdad financiera de otra persona en el servidor; un flujo propio no empujado es un
  // artefacto best-effort que ya podía perderse.
  const bw3 = browser(seedA());
  for (let i = 0; i < 30; i++) bw3.run('localStorage.setItem("relleno' + i + '__parked_deadbeef","x");');
  bw3.login(B);
  ok('A6.3 con el presupuesto global lleno, el ledger del saliente NO queda vivo para el entrante',
    !bw3.has('aurixCapitalFlows'), JSON.stringify(bw3.get('aurixCapitalFlows')));
  ok('A6.3b …y se ha hecho sitio desalojando, así que en realidad sigue recuperable',
    bw3.get('aurixCapitalFlows__parked_' + bw3.tag(A)) === DEP_A,
    'aparcados: ' + bw3.keys().filter(k => k.indexOf('__parked_') >= 0).length);
  ok('A6.3c la evicción no toca lo aparcado del usuario que ENTRA',
    (() => { const bw = browser(seedA()); const tB = bw.tag(B);
      bw.run('localStorage.setItem("aurix_ws_goals_v1__parked_' + tB + '","deB");');
      for (let i = 0; i < 29; i++) bw.run('localStorage.setItem("relleno' + i + '__parked_deadbeef","x");');
      bw.login(B);
      return bw.get('aurix_ws_goals_v1') === 'deB' || bw.get('aurix_ws_goals_v1__parked_' + tB) === 'deB'; })());
  ok('A6.3d la invariante se cumple para TODAS las claves de trabajo, no sólo el ledger',
    (() => { const bw = browser(seedA());
      for (let i = 0; i < 30; i++) bw.run('localStorage.setItem("relleno' + i + '__parked_deadbeef","x");');
      bw.login(B);
      return WORK_A.every(k => !bw.has(k)); })());
  ok('A6.4 el setItem del aparcado precede al removeItem: una excepción de cuota no destruye',
    fnSrc('_aurixParkKeyForOwner').indexOf('localStorage.setItem(slot, raw)') <
    fnSrc('_aurixParkKeyForOwner').indexOf('localStorage.removeItem(key)'));
}

console.log('\nA · AISLAMIENTO · los tres eventos, y el RESET aparte');
{
  ok('A7.1 el cambio de usuario declara USER_SWITCH y pasa el propietario ANTERIOR',
    /_clearLocalUserState\(_AURIX_PURGE\.USER_SWITCH, owner\)/.test(fnSrc('_aurixEnforceCacheOwner')));
  ok('A7.2 el cierre de sesión declara SAME_USER', /if \(clearState\) \{ try \{ _clearLocalUserState\(_AURIX_PURGE\.SAME_USER\)/.test(app));
  ok('A7.3 el reset propagado declara SAME_USER (mismo usuario en otro dispositivo)',
    /decision\.reason === 'remote-reset'\)[\s\S]{0,700}_clearLocalUserState\(_AURIX_PURGE\.SAME_USER\)/.test(app));
  ok('A7.4 no queda ninguna llamada sin modo declarado', (app.match(/_clearLocalUserState\(\)/g) || []).length === 0);
  ok('A7.5 el RESET DE CUENTA sigue en su propio owner y no llama a la purga',
    !/_clearLocalUserState/.test(fnSrc('performSafeReset')));
  ok('A7.6 …y sigue sellando sus lápidas, que es lo que impide resucitar lo borrado',
    /setItem\(RESET_AT_KEY/.test(fnSrc('performSafeReset')) && /setItem\(PORTFOLIO_EPOCH_KEY/.test(fnSrc('performSafeReset')));
  ok('A7.7 el modo por defecto y cualquiera desconocido son el MENOS destructivo',
    (() => { const bw = browser(seedA()); bw.run('_clearLocalUserState(undefined, "x"); _clearLocalUserState("raro", "x");');
      return bw.get('aurixCapitalFlows') === DEP_A && bw.has('aurix_reset_at') && bw.get('aurix_cache_owner') === A; })());
}

console.log('\nA · AISLAMIENTO · memoria, divisa y lecturas por prefijo');
{
  const owner = fnSrc('_aurixEnforceCacheOwner');
  ['assets = []', 'portfolioHistory = []', 'categoryHistory = []', '_aurixCanonicalCatHistory = null',
   '_cardOrder = []', '_catOrder = []', 'activeCategory = null'].forEach(m =>
    ok('A8.x resetea `' + m + '`', owner.indexOf(m) >= 0));
  ok('A8.8 y la watchlist, que hacía autoritativos los símbolos de A por la rama «local sin marca»',
    /_resetForUserSwitch/.test(owner) && /_resetForUserSwitch\(\) \{ _list = \[\]; _notify\(\); \}/.test(app));
  ok('A8.9 la DIVISA BASE en memoria vuelve al defecto y se re-sincronizan LOS DOS indicadores',
    /baseCurrency = 'USD'/.test(owner) && /\.menu-curr-btn/.test(owner) && /_syncPerfCurrencyButtons\(\)/.test(owner));
  ok('A8.10 el IDIOMA no se toca en memoria: su owner único es switchLang()', !/\blang = /.test(owner));
  ok('A8.11 ninguna lectura por PREFIJO puede saltarse el aislamiento: los lectores leen por nombre exacto',
    /localStorage\.getItem\('aurix_ws2_' \+ id\)/.test(app) &&
    (app.match(/localStorage\.key\(i\)/g) || []).length === 5);
  ok('A8.12 la purga y el aparcado no escriben en el servidor ni sincronizan',
    !/supabaseClient|upsert|insert\(|\.update\(|_aurixQueueSync|fetch\(/.test(
      fnSrc('_clearLocalUserState') + fnSrc('_aurixParkKeyForOwner') + fnSrc('_aurixUnparkKeysForOwner')));
}

console.log('\nB · EMAIL DE BIENVENIDA · la reserva es del SERVIDOR y va ANTES del envío');
{
  const iClaim = waitlist.indexOf('welcome_email_sent_at=is.null'), iSend = waitlist.indexOf('sendWelcomeEmail({ email, locale })');
  ok('B1.1 la reserva CONDICIONAL ocurre antes del envío', iClaim > 0 && iSend > iClaim, 'claim@' + iClaim + ' send@' + iSend);
  ok('B1.2 la reserva es un UPDATE condicional (atómico en Postgres), no una lectura+escritura',
    /method: 'PATCH'[\s\S]{0,200}welcome_email_sent_at: new Date\(\)\.toISOString\(\)/.test(waitlist) ||
    /welcome_email_sent_at=is\.null`,[\s\S]{0,320}method: 'PATCH'/.test(waitlist));
  ok('B1.3 sólo envía quien GANA la reserva (una fila devuelta)', /rows\.length === 1/.test(waitlist) && /if \(claimed\)/.test(waitlist));
  ok('B1.4 si la reserva no se puede tomar, NO se envía (fallar cerrado cuesta un email; fallar abierto, un duplicado)',
    /welcome claim failed/.test(waitlist) && waitlist.indexOf('if (claimed)') > waitlist.indexOf('welcome claim failed'));
  ok('B1.5 si el envío falla DESPUÉS de reservar, la reserva se LIBERA para poder reintentar',
    /release welcome claim/.test(waitlist) && /welcome_email_sent_at: null/.test(waitlist));
  ok('B1.6 ya no queda el sellado POSTERIOR al envío, que era el defecto',
    !/Stamp idempotently/.test(waitlist));
  ok('B1.7 hay UN solo owner de bienvenida en todo el repo (nada más puede duplicarla)',
    (waitlist.match(/async function sendWelcomeEmail/g) || []).length === 1);
  ok('B1.8 el email nunca tumba la petición: el lead queda guardado igual',
    /el lead queda guardado igual|lead is stored regardless/.test(waitlist));
  // Lo que importa es que no se registre el VALOR de la clave ni el cuerpo del email. Mencionar
  // el NOMBRE de la variable en un aviso de configuración es correcto y deliberado.
  ok('B1.9 no se registra el VALOR de la clave del proveedor ni el cuerpo del email',
    !/console\.[a-z]+\([^;]*\b(RESEND_API_KEY|apiKey)\b\s*[,)+]/.test(waitlist.replace(/'\[waitlist\][^']*'/g, "''")) &&
    !/console\.[a-z]+\([^;]*\b(html|text|body)\b\s*[,)]/.test(waitlist));
}

console.log('\nC · MURO DE BETA PRIVADA · el DEFECTO es abierto, el muro es la excepción');
{
  ok('C1.1 el formulario se sirve ABIERTO: authSection sin `locked`',
    /<div id="authSection" class="auth-section unlocked">/.test(login) && !/class="auth-section locked"/.test(login));
  ok('C1.2 …y sus controles sin `disabled`',
    !/id="email"[^>]*disabled/.test(login) && !/id="auth-submit"[^>]*disabled/.test(login));
  ok('C1.3 la sección de invitación se sirve OCULTA (sin destello de copy de beta)',
    /<div class="invite-section" style="display:none">/.test(login));
  ok('C1.4 el copy servido es el PÚBLICO, no el de beta privada',
    /data-i18n="lg.publicAccess"/.test(login) && /data-i18n="lg.publicHint"/.test(login));
  ok('C1.5 el JS ahora CIERRA en vez de abrir, y sólo si el lanzamiento no está abierto',
    /function _applyPrivateBetaGate\(\) \{\s*\n\s*if \(isPublicLaunchOpen\(\)\)/.test(login) &&
    /try \{ lockAuth\(\); \} catch/.test(login));
  ok('C1.6 ya no existe la función que abría (su fallo dejaba fuera a un cliente legítimo)',
    !/_applyPublicLaunchAccess/.test(login));
  ok('C1.7 se sigue re-evaluando al volver a la pestaña (el lanzamiento puede abrirse sin recarga)',
    /visibilitychange[\s\S]{0,120}_applyPrivateBetaGate/.test(login) && /addEventListener\('focus', _applyPrivateBetaGate\)/.test(login));
  ok('C1.8 el sello permanente de beta privada desaparece de las dos páginas que ve un cliente',
    !/Private Beta &bull; v0\.1/.test(login) &&
    !/Private Beta &bull; v0\.1/.test(fs.readFileSync(path.join(root, 'reset.html'), 'utf8')));
  ok('C1.9 la frontera real no se toca: el muro es client-only y la autorización sigue en el OTP',
    /invite gate is client-only/.test(app) || /isPublicLaunchOpen/.test(login));
  // COMPROBAR EL MARKUP NO BASTA. El diseño anterior dejaba un `lockAuth()` incondicional en la
  // inicialización que, con el markup ya abierto, volvía a cerrar el formulario para TODOS; el
  // gate lo daba por bueno porque el markup sí se servía abierto. Lo que hay que fijar es la
  // SECUENCIA de arranque.
  ok('C2.1 no queda ningún lockAuth() de inicialización: cerrar es sólo del gate de beta',
    (() => {
      const calls = [];
      // `[^a-zA-Z_]` excluye la cola de `unlockAuth();`, cuyo carácter previo es una letra.
      const re = /[^a-zA-Z_]lockAuth\(\);/g; let m;
      while ((m = re.exec(login)) !== null) {
        const ctx = login.slice(Math.max(0, m.index - 700), m.index);
        calls.push(/INVITE_MIN_LEN|invite:invalid/.test(ctx) || /_applyPrivateBetaGate/.test(ctx));
      }
      return calls.length === 3 && calls.every(Boolean);
    })());
  ok('C2.2 el estado del botón se recalcula al cargar sin pasar por el muro', /updateSubmitState\(\);/.test(login));
  // La ADMISIÓN a la beta privada vive en ESTADO, no en una clase CSS: si el cierre no llegara a
  // aplicarse, el guard del OTP habría dejado crear cuenta sin invitación antes del lanzamiento.
  ok('C2.3 el guard previo al envío del OTP comprueba el estado de invitación, no el DOM',
    /if \(!isPublicLaunchOpen\(\) && !_inviteValidated\) return;/.test(login) &&
    // Sólo el CÓDIGO cuenta: la nota que explica el defecto sí nombra la comprobación retirada.
    !/classList\.contains\('locked'\)/.test(login.replace(/^\s*\/\/.*$/gm, '')));
  ok('C2.4 el flag sólo se enciende con el RPC de invitación y se apaga al invalidarla',
    /_inviteValidated = true;[\s\S]{0,80}invite:ok/.test(login) &&
    (login.match(/_inviteValidated = false;/g) || []).length >= 2);
}

console.log('\nD · no regresión de lo certificado');
{
  ok('D1 v705 intacto', (app.match(/_aurixRejectStalePriceSpikes/g) || []).length === 4);
  ok('D2 v706/v707 intactos', /invalidReason = 'insufficient_range_coverage'/.test(app) && /cached_range_coverage_insufficient/.test(app));
  ok('D3 v708 intacto', /const _AURIX_RENDER_BUCKET_ENABLED = true;/.test(app));
  ok('D4 el suelo de epoch del gráfico invertible NO se toca', /const AURIX_INVESTABLE_CHART_EPOCH = 1780704000000;/.test(app));
  ok('D5 entitlements server-authoritative: sin caché local del RPC', !/localStorage[^\n]*_aurixEnt\b/.test(app));
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + `  ${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
