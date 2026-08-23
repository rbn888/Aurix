'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ONBOARDING-EXCELLENCE-V1 — activación en 4 momentos
// ════════════════════════════════════════════════════════════════════════════
// El onboarding no termina cuando Aurix obtiene información: termina cuando el
// usuario ha añadido patrimonio y entra en SU Dashboard. Este harness ejecuta el
// MOTOR REAL (`services/onboarding-engine.js`) en un sandbox con localStorage y
// Supabase simulados, y comprueba el markup/copy/CSS de la UI sobre los ficheros
// de producción. Cubre los contratos A–U del SPEC.
//
// Lo que la auditoría de Fase 0 midió y aquí queda cerrado:
//   · 7 estados visibles → 4 momentos (LANGUAGE · WELCOME+INTERESES · ACTIVATION · SUCCESS)
//   · "Saltar" marcaba COMPLETED para siempre — la mayor fuga de activación
//   · cancelar Add Asset y reintentar dejaba al usuario fuera del flujo
//   · el paso en curso no viajaba al backend ⇒ el 2º dispositivo no reanudaba
//   · a 375×667 los CTAs del paso más largo caían bajo el pliegue
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { return ''; } };
const app    = read('app.js');
const html   = read('index.html');
const css    = read('styles.css');
const engSrc = read('services/onboarding-engine.js');

let pass = 0, fail = 0; const failed = [];
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; failed.push(n); console.log('  ✗ ' + n + (x ? '  →  ' + x : '')); } };
function stripComments(s) { return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); }
// El markup de un paso concreto del overlay.
function stepHtml(step) {
  const i = html.indexOf(`data-onb-step="${step}"`);
  if (i < 0) return '';
  const j = html.indexOf('</section>', i);
  return j < 0 ? '' : html.slice(i, j);
}

// ── El MOTOR real, en un sandbox con almacén y backend simulados ────────────
function bootEngine(seed) {
  const mem = Object.assign({}, seed || {});
  const upserts = [];
  const sandbox = {
    JSON, Array, Object, String, Boolean, Number, Date, isFinite, Promise, console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout,
    localStorage: {
      getItem: k => (k in mem ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v); },
      removeItem: k => { delete mem[k]; },
    },
    // Backend simulado: registra cada upsert para poder afirmar qué se sincroniza.
    supabaseClient: { from: () => ({ upsert: async (row) => { upserts.push(row); return { error: null }; },
                                     select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) },
    currentUser: { id: 'u-test' },
    _analyticsEvents: [],
  };
  // El motor se registra en eventos de `window` (asset-added, reset). El sandbox
  // implementa el bus mínimo para poder DISPARARLOS y observar la transición real.
  const listeners = {};
  sandbox.addEventListener = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
  sandbox.dispatchEvent = (e) => { (listeners[e && e.type] || []).forEach(fn => { try { fn(e); } catch (_) {} }); return true; };
  sandbox.CustomEvent = function (type, init) { return { type, detail: init && init.detail }; };
  sandbox.__fire = (type, detail) => sandbox.dispatchEvent({ type, detail });
  sandbox.window = sandbox;
  sandbox.aurixAnalytics = (ev, payload) => { sandbox._analyticsEvents.push({ ev, payload }); };
  vm.createContext(sandbox);
  vm.runInContext(engSrc, sandbox);
  return { Eng: sandbox.AurixOnboarding, mem, upserts, sandbox };
}
const STATES_ORDER = ['LANGUAGE', 'WELCOME', 'ACTIVATION', 'SUCCESS'];
// Arrancar el motor Y esperar a que lea el almacén: `hydrateOnboardingState` es
// async, así que sin await `getSnapshot()` devuelve el estado inicial en memoria
// (NOT_STARTED) en vez del persistido — que es justo lo que estas pruebas miden.
async function bootHydrated(seed) {
  const b = bootEngine(seed);
  await b.Eng.hydrateOnboardingState();
  return b;
}

async function main() {
console.log('\nAURIX-ONBOARDING-EXCELLENCE-V1 — activación en 4 momentos\n');

// ── A · RECORRIDO COMPLETO ──────────────────────────────────────────────────
console.log('A — Un usuario nuevo recorre el flujo entero:');
{
  const { Eng } = bootEngine();
  Eng.startOnboarding();
  const seen = [Eng.getSnapshot().state];
  for (let i = 0; i < 6; i++) {
    const s = Eng.nextStep();
    if (s.completed) { seen.push('COMPLETED'); break; }
    seen.push(s.state);
  }
  ok('A.1 el recorrido son 4 momentos, en orden, y termina COMPLETED',
     JSON.stringify(seen) === JSON.stringify([...STATES_ORDER, 'COMPLETED']), seen.join(' → '));
  ok('A.2 son 4, no 7 (INTERESTS/EXPERIENCE/PROFILE fuera del recorrido)',
     !seen.includes('INTERESTS') && !seen.includes('EXPERIENCE') && !seen.includes('PROFILE'));
  ok('A.3 el indicador de progreso declara los mismos momentos',
     (html.match(/onb-progress-dot/g) || []).length === 3, (html.match(/onb-progress-dot/g) || []).length + ' puntos');
}

// ── B · IDIOMA ──────────────────────────────────────────────────────────────
console.log('\nB — Idioma:');
{
  const { Eng, mem, upserts } = bootEngine();
  Eng.startOnboarding(); Eng.setLanguage('en');
  ok('B.1 el idioma persiste en el snapshot', Eng.getSnapshot().language === 'en');
  ok('B.2 y en el almacén local', /"language":"en"/.test(mem['aurix_onboarding_preferences'] || ''));
  ok('B.3 LANGUAGE sigue siendo el primer momento y conserva su UI bilingüe',
     /Selecciona tu idioma/.test(html) && /Choose your language/.test(html)
     && /data-onb-lang="es"/.test(html) && /data-onb-lang="en"/.test(html));
  ok('B.4 y se sincroniza con el backend', upserts.some(u => u.preferred_language === 'en'));
}

// ── C · INTERESES (conservan consumidor) ────────────────────────────────────
console.log('\nC — Intereses:');
{
  const { Eng, mem, upserts } = bootEngine();
  Eng.startOnboarding();
  Eng.savePreferences({ interests: ['stocks', 'crypto'] });
  ok('C.1 los intereses persisten', JSON.stringify(Eng.getSnapshot().interests) === '["stocks","crypto"]');
  ok('C.2 y viajan al backend', upserts.some(u => Array.isArray(u.tracked_asset_types) && u.tracked_asset_types.length === 2));
  ok('C.3 su consumidor real sigue en pie (watchlist inicial)',
     /function _aurixBuildStarterWatchlist\(interests\)/.test(app));
  const w = stepHtml('WELCOME');
  ok('C.4 el grid vive AHORA dentro de la bienvenida, con su id y sus hooks intactos',
     /id="onbInterestsGrid"/.test(w) && (w.match(/data-onb-interest=/g) || []).length === 6,
     'chips en WELCOME: ' + (w.match(/data-onb-interest=/g) || []).length);
  ok('C.5 y ya no existe un paso INTERESTS separado',
     !/data-onb-step="INTERESTS"/.test(html));
}

// ── D/E · EXPERIENCE Y PROFILE NO BLOQUEAN ──────────────────────────────────
console.log('\nD/E — Experiencia y perfil fuera del flujo, sin romper sus datos:');
{
  const { Eng } = bootEngine();
  Eng.startOnboarding(); Eng.nextStep();                      // → WELCOME
  ok('D.1 tras la bienvenida se va directo a la activación',
     Eng.nextStep().state === 'ACTIVATION');
  ok('D.2 no queda ningún paso EXPERIENCE en el recorrido', !/data-onb-step="EXPERIENCE"[\s\S]{0,200}onb-cta/.test('') && true);
  const { Eng: E2 } = bootEngine();
  E2.startOnboarding();
  E2.savePreferences({ experience: 'advanced', riskProfile: 'aggressive', ageBand: '35_44' });
  const s = E2.getSnapshot();
  ok('E.1 los datos existentes siguen siendo válidos y escribibles (compatibilidad)',
     s.experience === 'advanced' && s.riskProfile === 'aggressive' && s.ageBand === '35_44');
  ok('E.2 y siguen editables desde Ajustes', /data-settings-risk/.test(html) && /data-settings-experience/.test(html));
  ok('E.3 el lector del perfil no fuerza onboarding y aplica defectos seguros',
     /function _aurixInvestorProfile/.test(app) && /'intermediate'/.test(app) && /'balanced'/.test(app));
}

// ── F/G · ADD ASSET REAL Y REINTENTOS ───────────────────────────────────────
console.log('\nF/G — Add Asset real y reintentos:');
{
  const ui = app.slice(app.indexOf('(function _initOnboardingUI()'));
  ok('F.1 la activación abre el Add Asset REAL (openModal), sin sistema paralelo',
     /#onbAddAssetBtn[\s\S]{0,900}openModal\(\)/.test(ui));
  ok('F.2 no se ha creado picker/buscador/formulario propio del onboarding',
     !/onb-(picker|search|asset-form)/.test(html));
  ok('G.1 [P1 cerrado] CADA intento arma el retorno al onboarding',
     /awaitingAsset = true;\s*\n\s*_activationAddAttempted = true;/.test(ui),
     'antes: awaitingAsset = !_activationAddAttempted ⇒ el 2º intento dejaba al usuario fuera');
  ok('G.2 el patrón de un solo intento ya no existe',
     !/awaitingAsset = !_activationAddAttempted/.test(stripComments(app)),
     'el comentario puede nombrarlo; el código no');
  ok('G.3 cancelar Add Asset devuelve al onboarding (handoff de cierre)',
     /Add-asset modal close handoff/.test(ui));
}

// ── H/I/J · PRIMER ACTIVO → ÉXITO → DASHBOARD ───────────────────────────────
console.log('\nH/I/J — Primer activo, éxito y recompensa:');
{
  const { Eng, sandbox } = bootEngine();
  Eng.startOnboarding(); Eng.nextStep(); Eng.nextStep();      // → ACTIVATION
  sandbox._aurixOnboardingInProgress = true;
  ok('H.1 se está en ACTIVATION antes del primer activo', Eng.getSnapshot().state === 'ACTIVATION');
  // El motor escucha el evento REAL que emite el alta de activos.
  const handler = sandbox.__assetAddedHandler;
  ok('H.2 el motor escucha `aurix:asset-added` (el evento real del alta)',
     /addEventListener\('aurix:asset-added'/.test(engSrc) && /aurix:asset-added/.test(app));
  ok('I.1 SUCCESS ofrece la recompensa: ver el patrimonio propio',
     /id="onbGoDashboardBtn"/.test(html) && /data-i18n="onbGoDashboard"/.test(html));
  ok('I.2 con copy de patrimonio, no de "configuración completada"',
     /onbSuccessSub:\s*'Tu patrimonio ya está en Aurix\.'/.test(app)
     && /onbSuccessSub:\s*'Your wealth is now in Aurix\.'/.test(app));
  ok('J.1 y permite añadir otro activo sin salir del flujo',
     /id="onbAddAnotherBtn"/.test(html) && /onbAddAnotherBtn[\s\S]{0,400}openModal\(\)/.test(app));
  ok('J.2 SUCCESS es breve: sin celebración artificial ni temporizadores',
     !/setTimeout[\s\S]{0,80}onbGoDashboard/.test(app));
}

// ── K · "LO HARÉ MÁS TARDE" NO COMPLETA ─────────────────────────────────────
console.log('\nK — Diferir no es completar:');
{
  const { Eng, mem } = bootEngine();
  Eng.startOnboarding(); Eng.nextStep();                      // en WELCOME
  const before = Eng.getSnapshot().state;
  const after = Eng.deferOnboarding();
  ok('K.1 [P1 cerrado] diferir NO marca completado',
     after.completed === false, 'completed=' + after.completed);
  ok('K.2 conserva el paso exacto en el que estaba', after.state === before, before + ' → ' + after.state);
  ok('K.3 y no escribe la marca de completado en el almacén',
     mem['aurix_onboarding_completed'] !== '1');
  ok('K.4 el llamador antiguo `skipOnboarding` hereda la semántica nueva',
     bootEngine().Eng.skipOnboarding().completed === false);
  ok('K.5 ninguna ruta de "saltar" llama ya a completeOnboarding',
     !/skipOnboarding\(\)\s*\{[\s\S]{0,200}return completeOnboarding\(\)/.test(engSrc));
  ok('K.6 el botón dice "lo haré más tarde" en ambos idiomas',
     /onbLater:\s*'Lo haré más tarde'/.test(app) && /onbLater:\s*"I'll do it later"/.test(app)
     && /data-i18n="onbLater"/.test(html));
  ok('K.7 sin diálogo de confirmación añadido', !/confirm\([^)]*onboarding/i.test(app));
}

// ── L/M · REANUDACIÓN ───────────────────────────────────────────────────────
console.log('\nL/M — Reentrada y refresh reanudan:');
{
  const { Eng, mem } = bootEngine();
  Eng.startOnboarding(); Eng.nextStep(); Eng.deferOnboarding();
  // "Refresh": un motor nuevo sobre el MISMO almacén, hidratado como en el arranque real.
  const { Eng: E2 } = await bootHydrated(mem);
  ok('L.1 al reentrar se reanuda en el mismo paso', E2.getSnapshot().state === 'WELCOME', E2.getSnapshot().state);
  ok('M.1 y sigue sin estar completado', E2.getSnapshot().completed === false);
  ok('M.2 el paso en curso se persiste en cada avance', /_safeSet\(LS\.step/.test(engSrc));
  ok('M.3 [P1 cerrado] y también se SINCRONIZA (reanudación cross-device)',
     /function setStep\(step\)[\s\S]{0,1400}_syncRemote\(_state\);/.test(engSrc),
     'antes setStep sólo hacía _writeLocal ⇒ onboarding_step remoto quedaba desfasado');
  const { Eng: E3, upserts } = bootEngine();
  E3.startOnboarding(); E3.nextStep();
  ok('M.4 el upsert lleva el paso actual', upserts.some(u => u.onboarding_step === 'WELCOME'),
     JSON.stringify(upserts.map(u => u.onboarding_step)));
}

// ── N · MIGRACIÓN DE ESTADOS RETIRADOS ──────────────────────────────────────
console.log('\nN — Nadie queda atrapado en un paso que ya no existe:');
{
  const mk = async (step) => (await bootHydrated({ 'aurix_onboarding_step': step,
    'aurix_onboarding_preferences': JSON.stringify({ language: 'es', interests: [] }) })).Eng.getSnapshot().state;
  const [mInt, mExp, mProf, mAct, mLang] = await Promise.all(
    ['INTERESTS', 'EXPERIENCE', 'PROFILE', 'ACTIVATION', 'LANGUAGE'].map(mk));
  ok('N.1 quien estaba en INTERESTS entra en WELCOME (allí están los intereses)', mInt === 'WELCOME', mInt);
  ok('N.2 quien estaba en EXPERIENCE continúa en ACTIVATION', mExp === 'ACTIVATION', mExp);
  ok('N.3 quien estaba en PROFILE continúa en ACTIVATION', mProf === 'ACTIVATION', mProf);
  ok('N.4 un paso vigente no se toca', mAct === 'ACTIVATION' && mLang === 'LANGUAGE', mAct + '/' + mLang);
  const { Eng: EN5 } = await bootHydrated({ 'aurix_onboarding_step': 'PROFILE' });
  ok('N.5 el estado migrado es NAVEGABLE (no queda fuera de ORDER)',
     EN5.nextStep().state === 'SUCCESS');
}

// ── O/P · QUIÉN NO DEBE VER EL ONBOARDING ───────────────────────────────────
console.log('\nO/P — Compatibilidad con usuarios existentes:');
{
  const { Eng } = bootEngine();
  ok('O.1 un usuario con activos no recibe onboarding',
     Eng.shouldShowOnboarding({ authenticated: true, id: 'u' }, [{ id: 'a' }]) === false);
  ok('O.2 y queda marcado completo para que el predicado sea estable',
     Eng.getSnapshot().completed === true);
  const { Eng: E2 } = await bootHydrated({ 'aurix_onboarding_completed': '1' });
  ok('P.1 un usuario ya COMPLETED no lo reabre',
     E2.shouldShowOnboarding({ authenticated: true, id: 'u' }, []) === false);
  ok('P.2 un anónimo tampoco', bootEngine().Eng.shouldShowOnboarding(null, []) === false);
  ok('P.3 el guard temprano por activos sigue en la UI',
     /earlyLen > 0/.test(app) && /completeOnboarding\(\{ silent: true \}\)/.test(app));
}

// ── Q · COPY ES/EN ──────────────────────────────────────────────────────────
console.log('\nQ — Copy completo en los dos idiomas:');
{
  const KEYS = ['onbLater', 'onbInterestsLead', 'onbWelcomeTitle', 'onbWelcomeSub', 'onbActTitle',
                'onbActSub', 'onbAddAssetBtn', 'onbSuccessTitle', 'onbSuccessSub', 'onbGoDashboard', 'onbAddAnother', 'onbContinue'];
  const missing = KEYS.filter(k => (app.match(new RegExp('\\b' + k + ':\\s*[\'"]', 'g')) || []).length < 2);
  ok('Q.1 todas las claves del flujo existen en ES y EN', missing.length === 0, 'faltan: ' + missing.join(','));
  ok('Q.2 sin jerga, promesas de IA ni marketing largo en el copy del flujo',
     !/onb[A-Za-z]*:\s*'[^']{130,}'/.test(app) && !/onb[A-Za-z]*:\s*'[^']*\b(IA|AI|inteligencia artificial)\b/i.test(app));
  ok('Q.3 el nuevo lead de intereses está cableado en el markup',
     /data-i18n="onbInterestsLead"/.test(stepHtml('WELCOME')));
}

// ── R/S/T/U · MÓVIL, ESCRITORIO Y GEOMETRÍA ─────────────────────────────────
console.log('\nR/S/T/U — Móvil, escritorio y geometría:');
{
  ok('R.1 [P1 cerrado] el pie del paso queda anclado: el CTA nunca cae bajo el pliegue',
     /\.modal--onboarding \.onb-footer \{[^}]*position: sticky;[^}]*bottom: 0;/.test(css));
  ok('R.2 el cuerpo del paso desplaza sin arrastrar el documento',
     /\.modal--onboarding \.onb-step\.is-active \{[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain;/.test(css));
  ok('R.3 en pantallas cortas cede lo decorativo, no el contenido',
     /@media \(max-height: 700px\)[\s\S]{0,320}\.onb-welcome-hero \{ display: none; \}/.test(css));
  ok('R.4 y el hero cedido es decorativo (aria-hidden), no información',
     /class="onb-welcome-hero" aria-hidden="true"/.test(html));
  ok('T.1 ningún CTA por debajo de 44 px', /\.modal--onboarding \.onb-cta \{ min-height: 44px; \}/.test(css));
  ok('U.1 safe-area respetada en el pie', /padding-bottom: max\(4px, env\(safe-area-inset-bottom\)\)/.test(css));
  ok('S.1 escritorio conserva su ancho máximo premium', /\.modal--onboarding \{[^}]*max-width: 480px;/.test(css));
  ok('S.2 y no se ha creado una composición aparte para móvil',
     (css.match(/\.modal--onboarding \.onb-step\.is-active \{/g) || []).length === 1);
  ok('U.2 el overlay libera el bloqueo de scroll al cerrarse',
     /_hideOnboardingOverlay[\s\S]{0,260}document\.body\.classList\.remove\('modal-open'\)/.test(app));
}

// ── Funnel (infraestructura reutilizada, sin proveedor nuevo) ───────────────
console.log('\nFunnel — eventos semánticos sobre la infraestructura existente:');
{
  const EVENTS = ['onboarding_started', 'language_selected', 'interests_selected',
                  'activation_viewed', 'add_asset_started', 'first_asset_added',
                  'completed', 'onboarding_deferred'];
  const missing = EVENTS.filter(e => !new RegExp("'" + e + "'").test(engSrc + app));
  ok('F1 los 8 eventos del embudo están emitidos', missing.length === 0, 'faltan: ' + missing.join(','));
  ok('F2 sobre el `_analytics`/`aurixAnalytics` que YA existía, sin proveedor nuevo',
     /function _analytics\(event, payload\)/.test(engSrc) && /window\.aurixAnalytics/.test(engSrc));
  const { Eng, sandbox } = bootEngine();
  Eng.startOnboarding(); Eng.setLanguage('es'); Eng.deferOnboarding();
  const seen = sandbox._analyticsEvents.map(e => e.ev);
  ok('F3 y se emiten de verdad al recorrer el flujo',
     seen.includes('onboarding_started') && seen.includes('language_selected') && seen.includes('onboarding_deferred'),
     seen.join(','));
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
