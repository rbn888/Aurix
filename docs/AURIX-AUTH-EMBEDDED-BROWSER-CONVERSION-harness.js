'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-AUTH-EMBEDDED-BROWSER-CONVERSION — continuidad de acceso
// ════════════════════════════════════════════════════════════════════════════
// Embedded-browser guidance must remain optional; email and OTP stay usable.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const login = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

let pass = 0, fail = 0; const failed = [];
function ok(n, c, extra) {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; failed.push(n); console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); }
}
function fnSource(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0, st = false;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') { d++; st = true; }
    else if (src[k] === '}') { d--; if (st && !d) return src.slice(i, k + 1); }
  }
  return '';
}

// EL detector REAL, extraído del fichero servido (no una reimplementación).
const detectSrc = fnSource(login, 'detectEmbeddedBrowser');
const detect = detectSrc
  ? new Function('navigator', detectSrc + '\n;return detectEmbeddedBrowser;')
  : null;
const on = (ua) => detect ? detect({ userAgent: ua })() : null;

console.log('\nAURIX-AUTH-EMBEDDED-BROWSER-CONVERSION — una autenticación por entorno aislado\n');

// ── 1 · FAIL OPEN: los navegadores reales NUNCA se interceptan ───────────────
console.log('1 — Fail open (lo que jamás debe interceptarse):');
{
  ok('1.0 el detector existe y es extraíble', !!detectSrc);
  const REALES = {
    'Safari iOS':      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Chrome iOS':      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
    'Chrome Android':  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    'Safari macOS':    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    'Chrome desktop':  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Firefox desktop': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0',
    'Firefox iOS':     'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
    'Edge desktop':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
    'PWA standalone':  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  };
  Object.keys(REALES).forEach(k => ok('1.x ' + k + ' → login normal', on(REALES[k]) === false, 'interceptado'));
  ok('1.y un UA vacío o ausente NO intercepta (ante la duda, abrir)',
     on('') === false && on(undefined) === false);
  ok('1.z un fallo del entorno devuelve false, nunca lanza',
     (() => { try { return detect({ get userAgent() { throw new Error('x'); } })() === false; } catch (_) { return false; } })());
}

// ── 2 · Las WebViews que sí se reconocen ────────────────────────────────────
console.log('\n2 — Navegadores internos reconocidos (alta confianza):');
{
  const EMB = {
    'Instagram':        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.0.0 (iPhone15,2; iOS 17_5; es_ES)',
    'Facebook iOS':     'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/460.0.0.0;FBBV/1;FBDV/iPhone15,2]',
    'Facebook Android': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/460.0.0.0;]',
    'X / Twitter':      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone',
    'TikTok':           'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 musical_ly_2023 TikTok/32.5.3',
    'Telegram Android': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36 TelegramWebview/1',
    'LINE':             'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Line/14.5.0',
  };
  Object.keys(EMB).forEach(k => ok('2.x ' + k + ' → interstitial', on(EMB[k]) === true, 'no detectado'));
  // Límite DECLARADO, no un olvido: Telegram en iOS no se anuncia en el UA.
  ok('2.z LÍMITE DECLARADO · Telegram iOS no es detectable por UA ⇒ login normal (fail open)',
     on('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148') === false);
}

// ── 3 · Ningún OTP dentro de la WebView ─────────────────────────────────────
console.log('\n3 — El acceso permanece disponible:');
{
  const show = fnSource(login, 'showEmbeddedInterstitial');
  for (const ua of ['Twitter for iPhone', 'Android TwitterAndroid']) {
    const nodes = Object.fromEntries(['embeddedSection', 'authSection', 'otpSection', 'embOpen', 'embManual'].map(id => [id, { style: { display: id === 'otpSection' ? 'none' : '' } }]));
    const before = JSON.stringify([nodes.authSection, nodes.otpSection]);
    new Function('document', 'navigator', '_authTrace', show + ';showEmbeddedInterstitial();')(
      { getElementById: id => nodes[id] }, { userAgent: ua }, () => {});
    ok('3.1 ' + ua + ': email and OTP visibility preserved', before === JSON.stringify([nodes.authSection, nodes.otpSection]));
    ok('3.2 ' + ua + ': browser help available', nodes.embeddedSection.style.display === '');
    ok('3.3 ' + ua + ': external open only on Android', (nodes.embOpen.style.display !== 'none') === /Android/.test(ua));
  }
  ok('3.3b browser help collapsed by default', /<details><summary[^>]*data-i18n="lg.emb.title"/.test(login));
  ok('3.4 pero un usuario que YA tenía sesión en esa WebView sigue entrando',
     /if \(session && !_otpVerifyNavInProgress\) \{[\s\S]*?safeRedirect\('index\.html', 'login:getSession'\)/.test(login));
  ok('3.5 el interstitial NO llama a signInWithOtp ni a verifyOtp',
     !/signInWithOtp|verifyOtp/.test(show) && !/signInWithOtp|verifyOtp/.test(fnSource(login, '_wireEmbeddedInterstitial') || ''));
}

// ── 4 · Destino canónico sin un solo secreto ────────────────────────────────
console.log('\n4 — Destino canónico:');
{
  const tgt = fnSource(login, '_embTargetUrl');
  ok('4.1 apunta al index de la MISMA app (origen actual), no a un host fijado',
     /location\.origin/.test(tgt) && /index\.html/.test(tgt));
  ok('4.2 `source=external-browser` es informativo y NO concede acceso',
     /source=external-browser/.test(tgt) && !/token|jwt|otp|email|secret/i.test(tgt));
  ok('4.3 el idioma viaja (cross-origin no comparte localStorage), nada más',
     /lang=/.test(tgt));
  ok('4.4 NINGÚN token, OTP ni email en la URL, en todo el bloque nuevo',
     !/access_token|refresh_token|[?&](token|otp|email)=/i.test(tgt));
}

// ── 5 · Realidad de plataforma, sin promesas ────────────────────────────────
console.log('\n5 — iOS/Android: lo que de verdad se puede prometer:');
{
  const wire = fnSource(login, '_wireEmbeddedInterstitial');
  ok('5.1 el CTA usa navegación HTTPS estándar desde una interacción explícita',
     /window\.open\(url, '_blank', 'noopener'\)/.test(wire));
  // RE-DECIDIDO (aurix/coherence-premium): en ANDROID la salida existe y es estándar —un
  // `intent://` con `scheme=https` lo resuelve el sistema, no la WebView— y sin ella el
  // usuario de X volvía a la MISMA WebView: el bucle. Sigue prohibido todo lo que FUERCE
  // un navegador concreto (x-safari, googlechrome:, package=) y el intent exige estar
  // detrás de la detección de Android y llevar `browser_fallback_url`.
  ok('5.2 sin esquemas para forzar un navegador concreto',
     !/x-safari|googlechrome:|package=/i.test(login));
  ok('5.2b intent:// sólo en Android, con scheme=https y destino de respaldo',
     /isAndroid = \/Android\/i\.test/.test(wire) && /if \(isAndroid\) \{[\s\S]*intent:\/\/[\s\S]*#Intent;scheme=https;S\.browser_fallback_url=/.test(wire));
  ok('5.3 la instrucción manual se revela SIEMPRE tras el intento (no se finge éxito)',
     /embManual'\);\s*if \(man\) \{[^}]*man\.style\.display = ''; \}/.test(wire));
  ok('5.4 existe fallback de copiado sin depender de la Clipboard API',
     /navigator\.clipboard/.test(wire) && /execCommand\('copy'\)/.test(wire));
  ok('5.5 el portapapeles NO se toca sin que el usuario lo pida',
     !/clipboard[\s\S]{0,120}addEventListener\('load'/.test(login));
}

// Execute the actual clipboard handler, including rejected Clipboard API promises.
const clipboardChecks = (async () => {
  const wire = fnSource(login, '_wireEmbeddedInterstitial');
  for (const mode of ['success', 'reject', 'unavailable', 'failure']) {
    let click, removed = false;
    const copy = { addEventListener: (_, fn) => { click = fn; } };
    const document = {
      getElementById: id => id === 'embCopy' ? copy : null,
      createElement: () => ({ setAttribute() {}, style: {}, select() {} }),
      body: { appendChild() {}, removeChild() { removed = true; } },
      execCommand: () => mode !== 'failure'
    };
    const navigator = mode === 'unavailable' || mode === 'failure' ? {} : {
      clipboard: { writeText: () => mode === 'reject' ? Promise.reject(new Error('denied')) : Promise.resolve() }
    };
    new Function('document', 'navigator', '_embTargetUrl', '_authTrace', 'tL', wire + ';_wireEmbeddedInterstitial();')(
      document, navigator, () => 'https://app.aurixsystem.io/', () => {}, key => key);
    click();
    await new Promise(resolve => setImmediate(resolve));
    ok('clipboard ' + mode + ': accurate result', copy.textContent === (mode === 'failure' ? 'lg.emb.copyFailed' : 'lg.emb.copied'));
    if (mode !== 'success') ok('clipboard ' + mode + ': temporary field removed', removed);
  }
  if (fail) process.exitCode = 1;
})();

// ── 6 · ZERO REGRESSION — lo que NO se ha tocado ────────────────────────────
console.log('\n6 — Zero regression (auth preservada):');
{
  ok('6.1 SUPABASE AUTH PRESERVED · los tres flags siguen exactamente donde estaban',
     /persistSession:\s*true/.test(app) && /autoRefreshToken:\s*true/.test(app) && /detectSessionInUrl:\s*true/.test(app));
  ok('6.2 login.html sigue creando el cliente con los defaults (mismo storageKey)',
     /createClient\(SUPABASE_URL, SUPABASE_ANON_KEY\);/.test(login));
  // Sobre CÓDIGO, no sobre comentarios: el bloque nuevo documenta por qué NO toca
  // la persistencia, así que nombra `persistSession` en prosa a propósito.
  const loginCode = login.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok('6.3 no se ha introducido storage propio, storageKey ni expiración arbitraria',
     !/storageKey\s*:/.test(loginCode) && !/persistSession/.test(loginCode) &&
     !/localStorage\.setItem\(\s*['\"]sb-/.test(loginCode) &&
     !/expires_in|maxAge/.test(loginCode));
  ok('6.4 el owner de navegación post-auth sigue siendo único (_otpVerifyNavInProgress)',
     (login.match(/_otpVerifyNavInProgress/g) || []).length >= 3);
  ok('6.5 el rompe-bucles de redirección sigue intacto',
     /safeRedirect/.test(login) && /aurix_redirect_log|_authStorageKeyPresent/.test(login));
  ok('6.6 no hay login social, magic-link nuevo ni cookies cross-context',
     !/signInWithOAuth|google|apple|magiclink|document\.cookie/i.test(fnSource(login, 'detectEmbeddedBrowser') +
        fnSource(login, '_embTargetUrl') + fnSource(login, 'showEmbeddedInterstitial') + fnSource(login, '_wireEmbeddedInterstitial')));
  ok('6.7 telemetría por el owner existente (_authTrace), sin infraestructura nueva',
     /_authTrace\('embedded_browser_detected'/.test(login) && /_authTrace\('external_browser_open_attempted'/.test(login));
  ok('6.8 …y esa telemetría no registra email, OTP ni tokens',
     !/_authTrace\([^)]*email|_authTrace\([^)]*otp:|_authTrace\([^)]*token/i.test(
        /_authTrace\('embedded[\s\S]{0,400}/.exec(login)?.[0] || ''));
}

// ── 7 · Copy e i18n ─────────────────────────────────────────────────────────
console.log('\n7 — Copy ES/EN completo:');
{
  const KEYS = ['title', 'text', 'cta', 'copy', 'copied', 'micro', 'manual'];
  const es = login.slice(login.indexOf('es: {'), login.indexOf('en: {'));
  const en = login.slice(login.indexOf('en: {'));
  ok('7.1 las 7 claves existen en ES y en EN',
     KEYS.every(k => es.includes("'lg.emb." + k + "'") && en.includes("'lg.emb." + k + "'")),
     KEYS.filter(k => !es.includes("'lg.emb." + k + "'") || !en.includes("'lg.emb." + k + "'")).join(','));
  ok('7.2 el texto es de onboarding, no de error/bloqueo/incompatibilidad',
     !/error|incompatible|no soportado|not supported|bloquead|blocked/i.test(es.slice(es.indexOf("'lg.emb.title'"))
        .slice(0, 700)));
  ok('7.3 reutiliza las clases visuales del propio login (sin sistema nuevo)',
     /id="embeddedSection" class="auth-section"/.test(login) &&
     /id="embOpen"[^>]*class="auth-btn"/.test(login) && /id="embCopy"[^>]*class="auth-link"/.test(login));
  ok('7.4 el interstitial arranca oculto (sólo aparece si se detecta)',
     /id="embeddedSection" class="auth-section" style="display:none"/.test(login));
}

clipboardChecks.then(() => {
  console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
  process.exitCode = fail ? 1 : 0;
}).catch(error => { console.error(error); process.exitCode = 1; });
