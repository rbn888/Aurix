'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-M03-LANGUAGE-PERSISTENCE — SPEC M.03 · B
// ════════════════════════════════════════════════════════════════════════════
// EL DEFECTO, en una línea: la landing arranca en inglés por defecto, escribía su
// idioma en CADA arranque y ponía `?lang=en` en todos los CTA. El app-side trata
// `?lang=` como una ELECCIÓN del usuario y por tanto la hace ganar, así que quien
// había elegido español DENTRO de Aurix volvía a entrar por la landing y se
// encontraba la app en inglés. No era un fallo de persistencia: era la landing
// afirmando una elección que nadie había hecho.
//
// Este gate EJECUTA los tres resolutores reales —el de la landing, el de
// `index.html` y el de `login.html`— extraídos de los ficheros de producción, y
// comprueba la precedencia declarada:
//     `?lang=` (elección explícita) > `portfolio_lang` persistido > `?langhint=` > es
//
// UNA SOLA AUTORIDAD: el valor vive en `portfolio_lang` y en ningún otro sitio. Los
// parámetros no son una segunda autoridad, son un canal de traspaso entre orígenes
// (localStorage no se comparte entre aurixsystem.io y app.aurixsystem.io).
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const app = read('app.js'), idx = read('index.html'), login = read('login.html'), land = read('landing/app.js');

let pass = 0, fail = 0; const failed = [];
function ok(n, c, info) {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; failed.push(n); console.log('  ✗ ' + n + (info ? '  →  ' + info : '')); }
}
function between(src, from, to, label) {
  const i = src.indexOf(from); if (i < 0) throw new Error('missing start ' + label);
  const j = src.indexOf(to, i); if (j < 0) throw new Error('missing end ' + label);
  return src.slice(i, j + to.length);
}
function fnSrc(src, name) {
  const s = 'function ' + name + '('; const i = src.indexOf(s);
  if (i < 0) throw new Error('missing fn ' + name);
  let d = 0, st = false;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') { d++; st = true; }
    else if (src[k] === '}') { d--; if (st && !d) return src.slice(i, k + 1); }
  }
  throw new Error('unbalanced ' + name);
}
// localStorage real-enough: sólo string, y con la misma API que usan los tres.
function store(init) {
  const m = Object.assign({}, init || {});
  return { _m: m,
    getItem: k => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; } };
}

console.log('\nAURIX-M03-LANGUAGE-PERSISTENCE — SPEC M.03 · B\n');

// ── 1 · LANDING: elección explícita vs idioma por defecto ───────────────────
console.log('1 · LANDING — sólo se afirma una elección que existe:');
const LANDING_SRC =
  between(land, "var LS_KEY = 'aurix_lang';", 'var langExplicit = false;', 'landing lang vars') + '\n' +
  fnSrc(land, 'detectLang') + '\n' +
  between(land, 'function appUrlForLang()', '}', 'appUrlForLang') + '\n' +
  "var APP_URL = 'https://app.aurixsystem.io/';\n";
function landingCtx(init) {
  const sb = { localStorage: store(init), console: { log() {}, warn() {} } };
  vm.createContext(sb);
  vm.runInContext(LANDING_SRC, sb);
  vm.runInContext('lang = detectLang();', sb);
  return sb;
}
{
  const fresh = landingCtx({});
  ok('1.1 visitante nuevo: la landing se pinta en inglés y NO afirma elección',
    fresh.lang === 'en' && fresh.langExplicit === false &&
    vm.runInContext('appUrlForLang()', fresh) === 'https://app.aurixsystem.io/?langhint=en',
    vm.runInContext('appUrlForLang()', fresh));
  // EL CASO DE LA REGRESIÓN: `aurix_lang` lo escribía también el arranque por
  // defecto, así que su presencia NO puede marcar una elección.
  const legacy = landingCtx({ aurix_lang: 'en' });
  ok('1.2 un `aurix_lang` heredado del arranque por defecto NO cuenta como elección',
    legacy.langExplicit === false &&
    vm.runInContext('appUrlForLang()', legacy) === 'https://app.aurixsystem.io/?langhint=en');
  const chosen = landingCtx({ aurix_lang: 'en', aurix_lang_choice: 'es' });
  ok('1.3 con elección explícita la landing SÍ la afirma, y gana a lo que hubiera',
    chosen.lang === 'es' && chosen.langExplicit === true &&
    vm.runInContext('appUrlForLang()', chosen) === 'https://app.aurixsystem.io/?lang=es');
  ok('1.4 el toggle es lo ÚNICO que marca la elección (y la persiste)',
    /applyLang\(b\.getAttribute\('data-lang'\), true\)/.test(land) &&
    /if \(explicit === true\) \{/.test(land) &&
    /localStorage\.setItem\(LS_CHOICE_KEY, lang\)/.test(land) &&
    // la clave de elección es NUEVA: no se puede contaminar con contenedores viejos
    /LS_CHOICE_KEY = 'aurix_lang_choice'/.test(land));
  ok('1.5 el arranque NO marca elección (applyLang sin el segundo argumento)',
    /applyLang\(detectLang\(\)\);/.test(land));
}

// ── 2 · APP (index.html): precedencia determinista ─────────────────────────
console.log('\n2 · APP — precedencia `?lang=` > persistido > `?langhint=` > es:');
const IDX_SRC = between(idx, 'var _qs = new URLSearchParams(location.search);',
                             "var lang = localStorage.getItem('portfolio_lang') || 'es';", 'index resolver');
function resolveIdx(search, init) {
  const st = store(init);
  const sb = { localStorage: st, location: { search }, URLSearchParams,
    document: { documentElement: {} } };
  vm.createContext(sb);
  vm.runInContext(IDX_SRC, sb);
  return { lang: vm.runInContext('lang', sb), stored: st.getItem('portfolio_lang') };
}
{
  ok('2.1 sin nada: español (el fallback existente, intacto)',
    resolveIdx('', {}).lang === 'es');
  ok('2.2 `?lang=` es una ELECCIÓN y gana a la preferencia persistida',
    (() => { const r = resolveIdx('?lang=en', { portfolio_lang: 'es' });
      return r.lang === 'en' && r.stored === 'en'; })());
  // ── EL CASO DEL SPEC ──────────────────────────────────────────────────────
  ok('2.3 EL CASO DEL SPEC: elegí español en Aurix, vuelvo por la landing en inglés ⇒ SIGO en español',
    (() => { const r = resolveIdx('?langhint=en', { portfolio_lang: 'es' });
      return r.lang === 'es' && r.stored === 'es'; })(),
    JSON.stringify(resolveIdx('?langhint=en', { portfolio_lang: 'es' })));
  ok('2.3b y el simétrico: elegí inglés en Aurix y la landing sugiere español',
    (() => { const r = resolveIdx('?langhint=es', { portfolio_lang: 'en' });
      return r.lang === 'en' && r.stored === 'en'; })());
  ok('2.4 sin preferencia previa, el hint SÍ se aplica (el visitante nuevo no aterriza en otro idioma)',
    (() => { const r = resolveIdx('?langhint=en', {});
      return r.lang === 'en' && r.stored === 'en'; })());
  ok('2.5 un valor basura no concede nada',
    resolveIdx('?lang=fr&langhint=de', {}).lang === 'es' &&
    resolveIdx('?lang=fr', { portfolio_lang: 'en' }).lang === 'en');
  ok('2.6 la elección se PERSISTE, así que sobrevive al rebote por login y a la sesión siguiente',
    resolveIdx('?lang=en', {}).stored === 'en');
  // La pantalla de recuperación pre-bootstrap usa la MISMA precedencia.
  ok('2.7 el resolutor pre-bootstrap del diagnóstico usa la misma precedencia',
    (() => { const b = fnSrc(idx, 'bootLang');
      return b.indexOf('lang=(es|en)') < b.indexOf("getItem('portfolio_lang')")
        && b.indexOf("getItem('portfolio_lang')") < b.indexOf('langhint=(es|en)'); })());
}

// ── 3 · LOGIN: el mismo criterio en la ruta de acceso ──────────────────────
console.log('\n3 · LOGIN — mismo criterio, misma clave:');
const LOGIN_SRC = between(login, 'const LOGIN_LANG = (function () {', "return 'es';\n    })();", 'login resolver');
function resolveLogin(search, init) {
  const st = store(init);
  const sb = { localStorage: st, location: { search }, URLSearchParams };
  vm.createContext(sb);
  vm.runInContext(LOGIN_SRC, sb);
  return { lang: vm.runInContext('LOGIN_LANG', sb), stored: st.getItem('portfolio_lang') };
}
{
  ok('3.1 `?lang=` gana y se persiste', (() => { const r = resolveLogin('?lang=en', { portfolio_lang: 'es' });
    return r.lang === 'en' && r.stored === 'en'; })());
  ok('3.2 la preferencia persistida gana al hint',
    resolveLogin('?langhint=en', { portfolio_lang: 'es' }).lang === 'es');
  ok('3.3 sin preferencia, el hint se aplica y se persiste (index.html hereda el idioma)',
    (() => { const r = resolveLogin('?langhint=en', {});
      return r.lang === 'en' && r.stored === 'en'; })());
  ok('3.4 sin nada, español', resolveLogin('', {}).lang === 'es');
  ok('3.5 el rebote a index lleva el idioma YA RESUELTO como elección',
    /lang=' \+ \(LOGIN_LANG === 'en' \? 'en' : 'es'\)/.test(login));
}

// ── 4 · LA AUTORIDAD SIGUE SIENDO UNA ──────────────────────────────────────
console.log('\n4 · Una sola autoridad, y sobrevive a la sesión:');
{
  ok('4.1 `switchLang` sigue siendo el owner único y persiste en la clave de siempre',
    /function switchLang\(newLang\)/.test(app) &&
    /localStorage\.setItem\(LANG_KEY, lang\);/.test(fnSrc(app, 'switchLang')) &&
    /const LANG_KEY = 'portfolio_lang';/.test(app) &&
    /let lang = localStorage\.getItem\(LANG_KEY\) \|\| 'es';/.test(app));
  ok('4.2 una elección explícita se SELLA para ganar al estado remoto (LWW)',
    /_touchPrefs\(\)/.test(fnSrc(app, 'switchLang')));
  ok('4.3 el idioma NO se borra al cerrar sesión (no está en PORTFOLIO_KEYS)',
    (() => { const k = between(app, 'const PORTFOLIO_KEYS = [', '];', 'portfolio keys');
      return !/portfolio_lang/.test(k) && !/aurix_prefs_updated_at/.test(k); })());
  ok('4.4 no se ha creado una segunda autoridad de idioma en la app',
    (() => { const w = (app.match(/setItem\(LANG_KEY/g) || []).length
                     + (app.match(/setItem\('portfolio_lang'/g) || []).length;
      return w === 2; })(),   // switchLang + _applyRemotePrefs (la rama LWW remota)
    'escrituras=' + ((app.match(/setItem\(LANG_KEY/g) || []).length
      + (app.match(/setItem\('portfolio_lang'/g) || []).length));
  ok('4.5 el idioma se propaga al motor de onboarding en UN solo sentido',
    /AurixOnboarding\.setLanguage\(lang\)/.test(fnSrc(app, 'switchLang')));
  // NO-VACUIDAD: con el comportamiento anterior (un único `?lang=` puesto siempre)
  // el caso 2.3 daba inglés. Se demuestra ejecutando el resolutor ANTERIOR.
  ok('4.6 NON-VACUITY — con el resolutor anterior, el caso del SPEC devolvía inglés',
    (() => {
      const OLD = "var _p = new URLSearchParams(location.search).get('lang');\n" +
        "if (_p === 'en' || _p === 'es') localStorage.setItem('portfolio_lang', _p);\n" +
        "var lang = localStorage.getItem('portfolio_lang') || 'es';";
      const st = store({ portfolio_lang: 'es' });
      const sb = { localStorage: st, location: { search: '?lang=en' }, URLSearchParams };
      vm.createContext(sb); vm.runInContext(OLD, sb);
      return vm.runInContext('lang', sb) === 'en'; })());
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + `  ${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
