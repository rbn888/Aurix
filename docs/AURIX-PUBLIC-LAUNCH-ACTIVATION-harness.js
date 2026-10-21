'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-PUBLIC-LAUNCH-ACTIVATION-harness — SPEC LANZAMIENTO 1
// ════════════════════════════════════════════════════════════════════════════
// Public access opens automatically at a FIXED UTC timestamp (Thu 23 Jul 2026
// 19:00 Europe/Madrid = 2026-07-23T17:00:00.000Z). Before it: landing shows a
// single "Enter Aurix" CTA, disabled, with only the remaining HOURS; the app OTP
// stays invite-gated (private). At the timestamp the CTA enables and the app OTP
// opens to everyone — no reload, no deploy. Rollback: PUBLIC_LAUNCH_ENABLED=false.
//
// RE-DECIDIDO (RETIRADA DEL LAUNCH GATE, 2026-10-19). El lanzamiento ya ocurrió y el
// gate seguía vivo decidido por el RELOJ DEL CLIENTE: un dispositivo con la fecha
// anterior al 23-jul veía «Lanzamiento en N h», los 5 CTA bloqueados y el muro de
// invitación en login.html. Ahora: la landing NO tiene gate (ni cuenta atrás, ni
// bloqueo, ni toast, ni listeners) y en login.html el acceso público depende SÓLO
// del flag `PUBLIC_LAUNCH_ENABLED`, nunca de una fecha. El camino de invitación
// privada (§5) sigue intacto y se aplica si alguien vuelve a sólo-invitación.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const lApp = fs.readFileSync(path.join(root, 'landing', 'app.js'), 'utf8');
const lHtml = fs.readFileSync(path.join(root, 'landing', 'index.html'), 'utf8');
const lCss = fs.readFileSync(path.join(root, 'landing', 'styles.css'), 'utf8');
const login = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, i) => { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } };
const AT = '2026-07-23T17:00:00.000Z';

console.log('AURIX-PUBLIC-LAUNCH-ACTIVATION — SPEC LANZAMIENTO 1\n');

// ── 1. SIN FECHA — ninguna superficie depende de PUBLIC_LAUNCH_AT ni del reloj ─
ok('1 landing: sin PUBLIC_LAUNCH_* ni isPublicLaunchOpen (el gate no existe)',
  !/PUBLIC_LAUNCH|isPublicLaunchOpen|publicLaunchRemainingHours/.test(lApp));
ok('1 app(login): PUBLIC_LAUNCH_ENABLED true y SIN PUBLIC_LAUNCH_AT',
  /const PUBLIC_LAUNCH_ENABLED = true;/.test(login) && !/PUBLIC_LAUNCH_AT/.test(login));
// Comportamiento, no regex: se ejecuta la función REAL de login.html con tres relojes.
(function () {
  const m = /function isPublicLaunchOpen\(\) \{[^\n]*\}/.exec(login);
  const run = (enabled, nowMs) => {
    if (!m) return null;
    const FakeDate = { now: () => nowMs, parse: Date.parse };
    return new Function('Date', 'PUBLIC_LAUNCH_ENABLED', m[0] + '; return isPublicLaunchOpen();')(FakeDate, enabled);
  };
  const atMs = Date.parse(AT);
  ok('2 login: abierto con reloj normal, ATRASADO (antes del 23-jul) y ADELANTADO',
    run(true, Date.now()) === true && run(true, atMs - 90 * 86400000) === true && run(true, Date.parse('2099-01-01T00:00:00Z')) === true,
    m ? m[0] : 'función no encontrada');
  ok('2b login: sólo-invitación sigue siendo un modo deliberado (flag false → cerrado, con cualquier reloj)',
    run(false, Date.now()) === false && run(false, atMs - 90 * 86400000) === false);
})();
ok('3 launch time is NOT computed from deploy time and NOT stored in localStorage',
  !/24\s*\*\s*60\s*60\s*1000|Date\.now\(\)\s*\+\s*24/.test(lApp) && !/localStorage[^\n]*launch/i.test(lApp) && !/localStorage[^\n]*launch/i.test(login));

// ── 2. LANDING — single "Enter Aurix" CTA, no public "Request Access" ───────
// RE-DECIDIDO (LANDING COMERCIAL V2/V3, docs/AURIX-LANDING-COMMERCIAL-V1-SPEC.md §V2.1 y §V3): ni la
// cabecera ni el menú móvil llevan CTA de registro (duplicaban el del hero). Lo que este check protege
// no cambia: el registro es un único destino, la app, sin gate — desde el hero, los planes y el cierre.
ok('4 landing: sin CTA de registro en cabecera ni menú móvil; el hero lleva a la app (cta.start)',
  !/data-app-link/.test(lHtml.slice(lHtml.indexOf('class="header-right">'), lHtml.indexOf('</header>'))) &&
  !/data-app-link/.test(lHtml.slice(lHtml.indexOf('id="mobileMenu"'), lHtml.indexOf('<main'))) &&
  /class="hero-cta">\s*<a class="btn btn-primary btn-lg" href="https:\/\/app\.aurixsystem\.io\/" data-app-link data-i18n="cta\.start">/.test(lHtml));
ok('5 no "Request Access" (cta.request) remains as a header / hero / mobile-actions CTA',
  !/mobile-actions[\s\S]{0,160}cta\.request/.test(lHtml) && !/header-right[\s\S]{0,160}cta\.request/.test(lHtml) && !/hero-cta-mobile[\s\S]{0,160}cta\.request/.test(lHtml));
ok('6 CTAs de registro sin hook de gate y apuntando a la app (≥ header + hero + mobile)',
  !/data-launch-cta/.test(lHtml) && (lHtml.match(/href="https:\/\/app\.aurixsystem\.io\/[^"]*" data-app-link/g) || []).length >= 3);

// ── 3. SIN CUENTA ATRÁS — ni elemento, ni copy ES/EN ────────────────────────
ok('7 no countdown element (#launchCountdown / .launch-count) in the landing',
  !/launchCountdown|launch-count/.test(lHtml) && !/launchCountdown/.test(lApp));
ok('8 no launch copy in i18n (launch.count / cta.joinLaunch) ES + EN',
  !/'launch\.count'|'cta\.joinLaunch'|Lanzamiento en|Launching in/.test(lApp));
ok('10 no days/minutes/seconds countdown unit introduced',
  !/\{d\}\s*d|\{m\}\s*min|\{s\}\s*s\b|days? remaining|d\s*:\s*h\s*:\s*m/i.test(lApp.replace(/getElementById\('[^']*'\)/g, '')));

// ── 4. SIN GATE EN LA LANDING — ni bloqueo, ni guard de clic, ni re-cómputo ─
ok('11 nothing locks a CTA (no is-launch-locked / href neutralised to #)',
  !/is-launch-locked|launchHref/.test(lApp) && !/setAttribute\('href', '#'\)/.test(lApp));
ok('12 no click guard cancels a CTA',
  !/data-launch-cta/.test(lApp));
ok('13 no gate timer / visibility / focus / pageshow recompute',
  !/applyLaunchGate|_launchTimer/.test(lApp));
ok('14 no locked-CTA CSS',
  !/is-launch-locked/.test(lCss));

// ── 5. APP OTP GATE (login.html) — public opens at launch, private preserved ─
// RE-DECIDIDA 15 (M.06 · IDENTITY). Este guard comprobaba `authSection.classList.contains('locked')`,
// o sea la ADMISIÓN a la beta privada vivía en una clase CSS. Al dejar de servirse el markup
// bloqueado, pasaba a depender de que `lockAuth()` llegara a ejecutarse: un fallo suyo habría
// permitido `signInWithOtp` con `shouldCreateUser: true` y por tanto crear cuenta SIN invitación
// antes del lanzamiento. Ahora comprueba ESTADO —`_inviteValidated`, que sólo enciende el RPC de
// invitación— y el control de admisión ya no puede perderse por un fallo de presentación.
ok('15 second-check gate before OTP send — por ESTADO de invitación, no por una clase del DOM',
  /if \(!isPublicLaunchOpen\(\) && !_inviteValidated\) return;/.test(login) &&
  /let _inviteValidated = false;/.test(login) &&
  !/classList\.contains\('locked'\)/.test(login.replace(/^\s*\/\/.*$/gm, '')));
// ── RE-DECIDIDAS 16/17/18 (M.06 · IDENTITY) ────────────────────────────────────────────────
// Estas tres fijaban el diseño INVERSO: markup servido en BETA PRIVADA (`auth-section locked`,
// controles `disabled`, copy de invitación) y un script inline POSTERIOR que lo abría. Ese
// reparto convertía cualquier fallo de ese script —un error anterior en el mismo bloque, una
// extensión, CSP— en una DENEGACIÓN permanente para un cliente con derecho a entrar, y en el
// mejor caso en un destello visible de copy de beta privada en la puerta del producto.
// El muro es CLIENT-ONLY y no concede acceso a nada: la frontera real es el OTP del servidor
// (asserts 18b/19). Así que el DEFECTO pasa a ser ABIERTO y el muro a ser la EXCEPCIÓN que
// aplica el JS. El modo de fallo pasa de «denegación permanente» a «muro no aplicado».
ok('16 post-launch: el markup se SIRVE abierto (sin locked, sin disabled) y con copy público',
  /<div id="authSection" class="auth-section unlocked">/.test(login) &&
  !/id="email"[^>]*disabled/.test(login) && !/id="auth-submit"[^>]*disabled/.test(login) &&
  /<div class="invite-section" style="display:none">/.test(login) &&
  /data-i18n="lg\.publicAccess"/.test(login) && /data-i18n="lg\.publicHint"/.test(login));
ok('17 access mode re-checked on visibility/focus',
  /visibilitychange[\s\S]{0,120}_applyPrivateBetaGate\(\)/.test(login) && /'focus', _applyPrivateBetaGate/.test(login));
ok('18 PRIVATE path preserved: el muro sigue existiendo y lo aplica el JS en modo sólo-invitación',
  /validate_invite_code/.test(login) && /function lockAuth\(\)/.test(login) &&
  /function _applyPrivateBetaGate\(\)[\s\S]{0,200}if \(isPublicLaunchOpen\(\)\)[\s\S]{0,200}lockAuth\(\)/.test(login));
ok('18b la frontera real NO cambia: el muro nunca fue autorización, lo es el OTP del servidor',
  /signInWithOtp\(/.test(login) && /verifyOtp\(/.test(login));
ok('19 OTP engine reused unchanged (signInWithOtp shouldCreateUser + verifyOtp)',
  /signInWithOtp\(\{[\s\S]{0,80}shouldCreateUser: true/.test(login) && /verifyOtp\(/.test(login));
// RE-DECIDIDO (ONBOARDING PREMIUM): el acceso público abre con una bienvenida, no con
// «Accede a Aurix» repetido debajo por «Acceder». El contrato —acceso público en ES y EN— sigue.
ok('20 public i18n copy present ES + EN (Bienvenido a Aurix / Welcome to Aurix)',
  /'lg\.publicAccess':\s*'Bienvenido a Aurix'/.test(login) && /'lg\.publicAccess':\s*'Welcome to Aurix'/.test(login));

// ── 6. MODO SÓLO-INVITACIÓN — un único flag, sólo en la app ──────────────────
ok('21 invite-only mode is a single flag (PUBLIC_LAUNCH_ENABLED) in login.html only',
  (login.match(/const PUBLIC_LAUNCH_ENABLED\s*=/g) || []).length === 1 && !/PUBLIC_LAUNCH_ENABLED/.test(lApp));
// 22–24 (simulaciones de la fecha) retiradas: ya no hay fecha. Las sustituye el §1-2,
// que ejecuta la función real con reloj normal, atrasado y adelantado.

// ── 8. LANDING POLISH (final) — single desktop CTA, no Early Access, toast ──
ok('25 desktop single CTA: Hero CTA is mobile-only (no duplicate Enter Aurix on desktop)',
  /\.hero-cta-mobile\s*\{\s*display:\s*none;\s*\}/.test(lCss));
ok('26 "Early Access" removed from public nav (no nav.early link remains)',
  !/data-i18n="nav\.early"/.test(lHtml));
ok('27 no launch toast (JS or CSS) and no alert()',
  !/showLaunchToast|_launchToast|launch-toast/.test(lApp) && !/launch-toast/.test(lCss) && !/\balert\(/.test(lApp));
// private/invite path still reachable in markup (section kept; only the nav link removed)
ok('30 private access REMOVED from landing (HOTFIX LANDING — public launch complete, Aurix open to all: no Private Beta section, modal or Request-Access CTA)',
  !/id="early-access"/.test(lHtml) && !/id="accessModal"/.test(lHtml) && !/id="openModal"/.test(lHtml));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('GATE: GO — all ' + pass + ' assertions passed');
process.exit(0);
