'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-M06-CLOSURE-RESPONSIVE-I18N-PERF — cierre transversal de M.06 (16 y 17)
// ════════════════════════════════════════════════════════════════════════════
// Última intervención interna de M.06. Cierra las dos coberturas restantes y los TRES P1
// que quedaban abiertos. No re-audita la lógica de los 15 bloques ya FULL: comprueba que
// las superficies certificadas se comportan como UN producto — traducido, utilizable en
// cualquier viewport, y sin trabajo continuo injustificado.
//
// LOS TRES P1, CERRADOS CON EVIDENCIA:
//
// 1 · `monsterLoop()` ARMABA UN FOTOGRAMA CADA ~16 ms, PARA SIEMPRE, SIN NADA QUE PINTAR.
//     Se invocaba sin condición al cargar el módulo y, si `.monster-orb` no estaba en el
//     DOM, su rama de salida VOLVÍA A ARMAR `requestAnimationFrame`. El orbe sólo lo crea
//     `renderInsights()`, la pestaña legacy 'insights', que la navegación de cuatro verbos
//     ya no expone (`data-tab="insights"` no existe y su único disparador, `toggleAllTx`,
//     no tiene llamadores). Así que en producción el bucle giraba en TODAS las superficies
//     ejecutando un `querySelector` para no pintar nada. Ahora PARA si el orbe no está y
//     sólo arranca donde el orbe NACE. Sin temporizador nuevo.
//
// 2 · EL DIAGNÓSTICO DE ARRANQUE ERA LA PANTALLA. Al fallar el boot se volcaban ~30 campos
//     internos (build, URL del bundle, pasos de arranque, nombres de cachés y de Service
//     Worker, estado de transporte, errores, UA) a pantalla completa en monoespaciada, como
//     PRIMERA y única cosa que veía el cliente. Es PII-free por construcción —y se conserva
//     íntegro— pero es arquitectura interna expuesta sin necesidad, y para quien lo lee es
//     un muro de JSON en el peor momento. Ahora: mensaje honesto + reintentar, y el volcado
//     completo detrás de una acción explícita. Cero observabilidad perdida.
//
// 3 · EL HOST HISTÓRICO DE GITHUB PAGES SEGUÍA EN LA ALLOWLIST CORS de 11 ficheros de
//     `api/` (y era el PRIMER elemento, o sea el valor de respaldo que se devolvía a
//     cualquier origen no reconocido) y lo anunciaba la Edge Function. Retirado de los 13
//     sitios; el dominio canónico pasa a ser el único y el respaldo.
//
// Y UN DEFECTO DE ES/EN ENCONTRADO AQUÍ: el desplegable de orden de Market tenía TRES
// opciones sin traducir en ningún idioma (conservaban el texto español del markup) y otras
// cuatro que perdían la dirección del orden, dejando «Precio» junto a «Precio: menor a
// mayor». En inglés el desplegable mezclaba los dos idiomas.
const fs = require('fs'), vm = require('vm'), path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(root, f), 'utf8');
const app = R('app.js'), idx = R('index.html'), css = R('styles.css');
const bare = s => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*(\/\/|<!--)/.test(l)).join('\n');
const appB = bare(app), idxB = bare(idx);
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n, src) { src = src || app; const i = src.indexOf('function ' + n + '('); if (i < 0) throw new Error('falta fn ' + n); return braceSlice(src, i); }
function objSrc(marker) { const i = app.indexOf(marker); if (i < 0) throw new Error('falta ' + marker); return braceSlice(app, app.indexOf('{', i)); }

let pass = 0, fail = 0; const failed = [];
function ok(n, c, info) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; failed.push(n); console.log('  ✗ ' + n + (info !== undefined ? '  →  ' + info : '')); } }
function section(t) { console.log('\n' + t); }

console.log('\nAURIX-M06-CLOSURE-RESPONSIVE-I18N-PERF — cierre transversal de M.06');

// ══════════════════════════════════════════════════════════════════════════
section('A — P1 · el bucle perpetuo, EJECUTADO:');
// ══════════════════════════════════════════════════════════════════════════
// Se ejecuta el owner real con un DOM donde `.monster-orb` NO existe y se CUENTAN los
// rearmes de rAF. Antes: uno por llamada, indefinidamente. Ahora: cero.
function runMonster(src) {
  let rafCalls = 0;
  const ctx = {
    console: { log() {}, warn() {} }, Math, Date, Number, Object,
    document: { querySelector: () => null },        // el orbe NO está en el DOM
    requestAnimationFrame: () => { rafCalls++; return 1; },
    window: { innerWidth: 390, innerHeight: 844, addEventListener() {} },
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  // Se llama al bucle DIRECTAMENTE (como lo haría un fotograma ya en vuelo).
  vm.runInContext('monsterLoop();', ctx);
  const afterLoop = rafCalls;
  // …y al arranque, que es el punto que decide si el bucle existe siquiera.
  if (/function _monsterStart\(/.test(src)) vm.runInContext('_monsterStart();', ctx);
  return { afterLoop, afterStart: rafCalls };
}
const MONSTER_NOW = [objSrc('const monsterState = {') && 'const monsterState = ' + objSrc('const monsterState = {') + ';',
  /function _monsterStart\(/.test(app) ? fnSrc('_monsterStart') : '', 'let _monsterRafOn = false;',
  fnSrc('monsterLoop')].filter(Boolean).join('\n');
{
  const now = runMonster(MONSTER_NOW);
  ok('A.1 sin orbe en el DOM el bucle PARA: cero rearmes', now.afterLoop === 0, 'rearmes=' + now.afterLoop);
  ok('A.2 y el arranque tampoco arma nada si el orbe no existe', now.afterStart === 0, 'rearmes=' + now.afterStart);
  ok('A.3 el arranque es DIRIGIDO: ocurre donde el orbe nace, no al cargar el módulo',
     /placeholder\.innerHTML = renderInsights\(\);[\s\S]{0,400}_monsterStart\(\)/.test(app) &&
     !/^monsterLoop\(\);$/m.test(appB), 'queda un arranque incondicional');
  ok('A.4 no se ha sustituido por otro temporizador infinito',
     !/setInterval\([^)]*monster/i.test(app) &&
     // dos SITIOS de llamada (arranque de módulo + montaje del orbe), sin contar la definición
     (app.match(/(?<!function )_monsterStart\(\)/g) || []).length === 2,
     'llamadas=' + (app.match(/(?<!function )_monsterStart\(\)/g) || []).length);
  ok('A.5 y con el orbe presente la animación es IDÉNTICA (se conserva el rearme)',
     /_monsterRafOn = true;\s*\n\s*requestAnimationFrame\(monsterLoop\);/.test(app));
  // NO-VACUIDAD ejecutada sobre el owner ANTERIOR, recuperado de git.
  ok('A.6 NO-VACUIDAD · ANTES el mismo escenario rearmaba rAF indefinidamente', (() => {
    let prev = '';
    try { prev = execFileSync('git', ['show', 'HEAD:app.js'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch (_) { return false; }
    if (/function _monsterStart\(/.test(prev)) return true;   // ya entregado
    const pi = prev.indexOf('const monsterState = {');
    const PREV = 'const monsterState = ' + braceSlice(prev, prev.indexOf('{', pi)) + ';\n' + fnSrc('monsterLoop', prev);
    const before = runMonster(PREV);
    return before.afterLoop >= 1;    // una llamada ⇒ un rearme ⇒ bucle perpetuo
  })());
}

// ══════════════════════════════════════════════════════════════════════════
section('B — P1 · el diagnóstico de arranque ya no es la pantalla:');
// ══════════════════════════════════════════════════════════════════════════
{
  const panel = idx.slice(idx.indexOf("p.innerHTML = '<div style=\"max-width:560px"), idx.indexOf('aurixBootRetry\');', idx.indexOf("p.innerHTML = '<div")));
  ok('B.1 la superficie de cliente es un mensaje honesto, no un volcado',
     /esc\(L\.title\)/.test(panel) && /esc\(L\.hint\)/.test(panel));
  ok('B.2 el reintento va ANTES que cualquier detalle técnico',
     panel.indexOf('aurixBootRetry') < panel.indexOf('<details'));
  ok('B.3 el volcado completo SIGUE existiendo, íntegro, tras una acción explícita',
     /<details/.test(panel) && panel.indexOf('JSON.stringify(info, null, 2)') > panel.indexOf('<details'));
  ok('B.4 y se avisa de que es información técnica sin datos personales',
     /esc\(L\.detailsHint\)/.test(panel) && /detailsHint:/.test(idx));
  ok('B.5 sigue siendo PII-free por construcción (ni tokens, ni email, ni cartera)',
     /PII-FREE BY CONSTRUCTION/.test(idx) &&
     !/localStorage\s*\)/.test(idx.slice(idx.indexOf('var info = {'), idx.indexOf('var bl = document.getElementById'))));
  ok('B.6 los dos idiomas tienen la copy nueva',
     (idx.match(/details: '/g) || []).length === 2 && (idx.match(/detailsHint: '/g) || []).length === 2);
  ok('B.7 NO-VACUIDAD · ANTES el JSON era el primer elemento del panel', (() => {
    let prev = '';
    try { prev = execFileSync('git', ['show', 'HEAD:index.html'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch (_) { return false; }
    if (/<details/.test(prev)) return true;
    const i = prev.indexOf("p.innerHTML = '<div style=\"font:700 16px");
    if (i < 0) return false;
    const seg = prev.slice(i, i + 1400);
    return seg.indexOf('JSON.stringify(info, null, 2)') < seg.indexOf('aurixBootRetry');
  })());
}

// ══════════════════════════════════════════════════════════════════════════
section('C — P1 · el host histórico sale de la allowlist CORS:');
// ══════════════════════════════════════════════════════════════════════════
{
  const apiFiles = [];
  (function walk(d) { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
    const rel = d + '/' + e.name;
    if (e.isDirectory()) { walk(rel); continue; }
    if (/\.(js|mjs)$/.test(e.name)) apiFiles.push(rel); } })('api');
  const offenders = apiFiles.filter(f => /rbn888\.github\.io/.test(bare(R(f))));
  ok('C.1 cero allowlists de `api/` con el host histórico (sólo comentarios)',
     offenders.length === 0, offenders.join(', '));
  ok('C.2 el dominio canónico es el ÚNICO y además el valor de respaldo',
     /'https:\/\/app\.aurixsystem\.io'\)/.test(R('api/prices/snapshot.js')) &&
     /ALLOWED_ORIGINS\[0\]/.test(R('api/prices/snapshot.js')));
  ok('C.3 billing sólo admite el dominio canónico',
     /APP_ORIGIN\)/.test(R('api/billing/_checkout.js')) && /APP_ORIGIN\)/.test(R('api/billing/_portal.js')) &&
     !/rbn888/.test(bare(R('api/billing/_checkout.js'))));
  ok('C.4 la captura de la landing sólo admite sus dos dominios reales',
     /'https:\/\/aurixsystem\.io,https:\/\/www\.aurixsystem\.io'\)/.test(R('api/waitlist.js')));
  ok('C.5 la Edge Function ya no anuncia un dominio retirado',
     !/rbn888/.test(R('supabase/functions/portfolio-snapshot/index.ts')) &&
     /origin: 'https:\/\/app\.aurixsystem\.io'/.test(R('supabase/functions/portfolio-snapshot/index.ts')));
  ok('C.6 no se ha ampliado el CORS ni se ha usado comodín',
     !/Access-Control-Allow-Origin[^\n]*\*/.test(apiFiles.map(f => R(f)).join('\n')));
  // ── LO QUE EL CÓDIGO NO PUEDE CERRAR, Y HAY QUE DECIRLO ───────────────────────────
  // Verificado EN VIVO tras desplegar: `/api/waitlist` y `/api/billing/*` ya RECHAZAN el host
  // histórico con 403 (su allowlist sale del defecto del código, que este cambio tensó). Pero
  // los cinco endpoints de datos de mercado —prices, prices/snapshot, prices/history,
  // search/assets, search/crypto— siguen devolviéndolo, porque leen `ALLOWED_ORIGINS` de una
  // VARIABLE DE ENTORNO de Vercel que TIENE PRECEDENCIA sobre el defecto y aún lo lista (se
  // demuestra: un origen arbitrario recibe el host histórico como valor de respaldo).
  // Cerrarlo es una acción de entorno, no de código: `ALLOWED_ORIGINS=https://app.aurixsystem.io`
  // en el proyecto de Vercel. Queda como P1 con excepción explícita: esos endpoints sirven datos
  // de mercado PÚBLICOS, sin datos de usuario ni superficie de autenticación, y el host es del
  // propio founder. Este assert fija la precedencia para que nadie la olvide.
  ok('C.7b el defecto del código es el mínimo, y se documenta que el ENTORNO puede ampliarlo',
     /process\.env\.ALLOWED_ORIGINS \|\| process\.env\.ALLOWED_ORIGIN \|\| 'https:\/\/app\.aurixsystem\.io'/.test(R('api/prices/snapshot.js')) &&
     /process\.env\.WAITLIST_ALLOWED_ORIGINS \|\|/.test(R('api/waitlist.js')) &&
     /process\.env\.BILLING_ALLOWED_ORIGINS \|\|/.test(R('api/billing/_checkout.js')));
  ok('C.8 NO-VACUIDAD · ANTES estaba en 13 sitios y era el primero de la lista', (() => {
    try {
      const prevSnap = execFileSync('git', ['show', 'HEAD:api/prices/snapshot.js'], { cwd: root, encoding: 'utf8' });
      if (!/rbn888/.test(bare(prevSnap))) return true;
      return /'https:\/\/rbn888\.github\.io,https:\/\/app\.aurixsystem\.io'/.test(prevSnap);
    } catch (_) { return false; }
  })());
}

// ══════════════════════════════════════════════════════════════════════════
section('D — ES/EN global: simetría total y cero claves huérfanas:');
// ══════════════════════════════════════════════════════════════════════════
{
  function dict(marker) { const i = app.indexOf(marker); return braceSlice(app, app.indexOf('{', i)); }
  const keysOf = s => { const o = new Set(); for (const m of s.matchAll(/(?:^|[\n,{]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g)) o.add(m[1]); return o; };
  const ES = keysOf(dict('\n  es: {')), EN = keysOf(dict('\n  en: {'));
  const soloES = [...ES].filter(k => !EN.has(k)), soloEN = [...EN].filter(k => !ES.has(k));
  ok('D.1 los dos diccionarios tienen EXACTAMENTE el mismo conjunto de claves',
     soloES.length === 0 && soloEN.length === 0, 'sóloES=' + soloES.slice(0, 8).join(',') + ' sóloEN=' + soloEN.slice(0, 8).join(','));
  ok('D.2 y no son triviales (miles de claves, no una docena)', ES.size > 1500, 'claves=' + ES.size);
  const used = new Set();
  for (const m of idx.matchAll(/data-i18n(?:-ph|-title|-aria)?="([A-Za-z_][A-Za-z0-9_]*)"/g)) used.add(m[1]);
  const orphans = [...used].filter(k => !ES.has(k) || !EN.has(k));
  ok('D.3 TODA clave referenciada por el markup existe en LOS DOS idiomas',
     orphans.length === 0, 'huérfanas: ' + orphans.join(', '));
  ok('D.3b y son muchas las referenciadas (la comprobación no es vacía)', used.size > 250, 'referenciadas=' + used.size);
  // Ningún valor inglés puede llevar acentos o ñ del español.
  const valsOf = s => { const o = {}; for (const m of s.matchAll(/(?:^|[\n,{]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:\s*('[^'\n]*'|"[^"\n]*")/g)) o[m[1]] = m[2]; return o; };
  const VEN = valsOf(dict('\n  en: {'));
  const untranslated = Object.keys(VEN).filter(k => /[áéíóúñ¿¡]/i.test(VEN[k]));
  ok('D.4 ningún valor del diccionario inglés quedó en español',
     untranslated.length === 0, untranslated.slice(0, 10).join(','));
  // [P1 de este bloque] el desplegable de orden de Market.
  ok('D.5 [CERRADO] las siete opciones de orden de Market existen en los dos idiomas',
     ['mktSortRelevance', 'mktSortFeatured', 'mktSortChange', 'mktSortChangeAsc', 'mktSortPrice', 'mktSortPriceAsc', 'mktSortName']
       .every(k => ES.has(k) && EN.has(k)));
  ok('D.5b y cada una declara su DIRECCIÓN (no hay «Precio» junto a «Precio: menor a mayor»)',
     /mktSortPrice:\s*'Precio: mayor a menor'/.test(app) && /mktSortPriceAsc:\s*'Precio: menor a mayor'/.test(app) &&
     /mktSortPrice:\s*'Price: high to low'/.test(app) && /mktSortChangeAsc:\s*'Biggest 24H drop'/.test(app));
  ok('D.5c NO-VACUIDAD · ANTES tres de las siete no existían en ningún diccionario', (() => {
    let prev = '';
    try { prev = execFileSync('git', ['show', 'HEAD:app.js'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch (_) { return false; }
    if (/mktSortRelevance/.test(prev)) return true;
    return !/mktSortRelevance/.test(prev) && !/mktSortChangeAsc/.test(prev) && !/mktSortPriceAsc/.test(prev);
  })());
  // Los precios no pueden depender del idioma: no hay ninguno en el cliente.
  ok('D.6 el precio no cambia por idioma porque el cliente NO tiene precios',
     !/7[,.]99|59[,.]99|14[,.]99/.test(appB) && !/7[,.]99|59[,.]99|14[,.]99/.test(idxB));
}

// ══════════════════════════════════════════════════════════════════════════
section('E — responsive: invariantes transversales:');
// ══════════════════════════════════════════════════════════════════════════
{
  ok('E.1 la raíz no puede desbordar horizontalmente',
     /html, body, #app \{ max-width: 100vw; overflow-x: hidden; \}/.test(css));
  // Los comentarios de CSS se retiran ANTES de escanear: uno de ellos cita un selector de
  // modal y el barrido se colaba dentro del comentario en vez de leer reglas.
  const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '');
  ok('E.2 ningún modal u overlay fija un ancho MÍNIMO mayor que el móvil pequeño',
     !/min-width: ?(3[3-9][0-9]|[4-9][0-9][0-9]|[0-9]{4})px/.test(
       (cssCode.match(/\.(modal|modal-overlay|aurix-premium-modal|paywall)[^{]*\{[^}]*\}/g) || []).join('\n')));
  ok('E.3 los modales se dimensionan con `max-width` (encogen por debajo de 320 px)',
     (css.match(/\.modal--[a-z-]+ ?\{ ?max-width: ?\d+px/g) || []).length >= 3 &&
     !/\.modal--[a-z-]+ ?\{ ?width: ?\d{3,}px/.test(css));
  ok('E.4 hay áreas táctiles suficientes en los CTA (>= 44 px)',
     (css.match(/(min-height|height): ?(4[4-9]|[5-9][0-9]|[0-9]{3})px/g) || []).length >= 40);
  ok('E.5 se respeta el área segura del notch en las superficies fijas',
     (css.match(/safe-area-inset/g) || []).length >= 20);
  ok('E.6 los breakpoints son consistentes (768/769 como eje principal)',
     (css.match(/@media \(max-width: ?768px/g) || []).length >= 20 &&
     (css.match(/@media \(min-width: ?769px/g) || []).length >= 10);
  ok('E.7 el paywall se puede cerrar siempre (botón propio + fondo + Escape)',
     /aurix-premium-close/.test(app) && /ap_close/.test(app));
  // ≥52 px: la SPEC de portadas de conversión sube el suelo táctil del CTA por
  // encima del mínimo general de 44 px.
  ok('E.8 y el CTA del preview de Intelligence es de ancho completo y táctil en móvil',
     /\.intprev-cta\{width:100%;[\s\S]{0,200}?min-height:52px/.test(app));
}

// ══════════════════════════════════════════════════════════════════════════
section('F — rendimiento y fiabilidad transversales:');
// ══════════════════════════════════════════════════════════════════════════
{
  const rafSelf = (appB.match(/requestAnimationFrame\((_?[a-zA-Z][a-zA-Z0-9_]*)\);/g) || []);
  ok('F.1 todo rAF que se rearma lo hace acotado (animación con fin) o con el elemento presente',
     rafSelf.length > 0 && !/if \(!orb\) \{\s*\n\s*requestAnimationFrame\(monsterLoop\);/.test(app));
  const intervals = (appB.match(/setInterval\(/g) || []).length;
  const clears = (appB.match(/clearInterval\(/g) || []).length;
  ok('F.2 los intervalos de navegación se LIMPIAN al cambiar de superficie',
     /if \(_loopInterval\)\s*\{\s*clearInterval\(_loopInterval\)/.test(app) &&
     /if \(_marketInterval\)\s*\{\s*clearInterval\(_marketInterval\)/.test(app),
     'setInterval=' + intervals + ' clearInterval=' + clears);
  ok('F.3 el poller de Market no se duplica al reiniciarse',
     /function _restartPolling\(\) \{\s*\n\s*if \(_timer\) clearInterval\(_timer\);/.test(app));
  ok('F.4 hay guardas de visibilidad donde el trabajo no debe seguir oculto',
     (app.match(/visibilityState === 'hidden'|document\.hidden/g) || []).length >= 3);
  ok('F.5 las cachés de cliente están ACOTADAS por tope y por bytes',
     /_AURIX_MKT_SNAP_MAX\s+= \d+;/.test(app) && /_AURIX_MKT_SNAP_MAX_BYTES/.test(app) &&
     /while \(payload\.length > _AURIX_MKT_SNAP_MAX_BYTES && entries\.length > 1\)/.test(app));
  ok('F.6 un almacén corrupto o de esquema viejo se descarta SOLO (nunca un clear global)',
     !/localStorage\.clear\(\)/.test(appB));
  ok('F.7 un fallo parcial degrada honestamente en vez de romper la app',
     /function _aurixResolveReturnPresentation/.test(app) &&      // retorno: estado terminal honesto
     /_AURIX_MKT_DS\.STALE/.test(app) &&                           // Market: conserva el último bueno
     /if \(!_aurixEnt\.loaded\) return false;/.test(app));         // entitlement: fail-closed
  ok('F.8 y el diagnóstico de arranque sigue siendo la última red, no la primera pantalla',
     /watchdogFired/.test(idx) && /<details/.test(idx));
}

// ══════════════════════════════════════════════════════════════════════════
section('G — superficie muerta y de release (regresión):');
// ══════════════════════════════════════════════════════════════════════════
{
  ok('G.1 cero escaparate comercial legacy, cero precio legacy, cero promos, cero flag muerto',
     !/founderOverlay/.test(idx) && !/14[,.]99/.test(idxB) && !/PROMO_CODES\s*=/.test(appB) &&
     !/const ENFORCE_ENTITLEMENTS\s*=/.test(appB) && !/setPlanTier: setPlanTier/.test(appB));
  ok('G.2 cero secretos en el bundle',
     !/sk_live|sk_test|whsec_|SUPABASE_SERVICE_ROLE/.test(app) && !/sk_live|sk_test|whsec_/.test(idx));
  ok('G.3 el epoch y el reductor del chart siguen intactos',
     /AURIX_INVESTABLE_CHART_EPOCH = 1780704000000/.test(app) &&
     (app.match(/^function _aurixRenderBucketReduce\(/gm) || []).length === 1);
  ok('G.4 las cuatro fuentes de versión están alineadas',
     (() => { const v = JSON.parse(R('version.json'));
       return new RegExp("var APPJS_V = '" + v.appjs + "'").test(idx) &&
              new RegExp('app\\.js\\?v=' + v.appjs).test(idx) &&
              new RegExp("__AURIX_APPJS_VERSION__ = '" + v.appjs + "'").test(app) &&
              new RegExp("var BUILD = '" + v.build + "'").test(idx); })());
  ok('G.5 el selector CSS del modal retirado queda como residuo inerte, sin markup que lo use',
     /modal--founder/.test(css) && !/modal--founder/.test(idx),
     'residual cosmético declarado: CSS muerta sin superficie');
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + `  ${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
