'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ACCOUNT-CENTER-harness — SPEC ACCOUNT CENTER V1
// ════════════════════════════════════════════════════════════════════════════
// Cobertura MÍNIMA de lo que este SPEC introduce. No repite lo que ya protegen
// otros harnesses (diagnóstico, reset, idioma/moneda, persistencia): aquí sólo
// se comprueba que el Account Center reutiliza esos owners en lugar de duplicarlos.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { return ''; } };
const app = read('app.js'), html = read('index.html'), css = read('styles.css');
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '');
const appCode = app.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x ? '  → ' + x : '')); } };
function fnSource(name) {
  const i = app.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0, st = false;
  for (let k = i; k < app.length; k++) { if (app[k] === '{') { d++; st = true; } else if (app[k] === '}') { d--; if (st && !d) return app.slice(i, k + 1); } }
  return '';
}

console.log('AURIX-ACCOUNT-CENTER — SPEC ACCOUNT CENTER V1\n');

// ── 1. Menú: seis destinos, orden exacto, sin genéricos ─────────────────────
console.log('1 — Menú superior: seis opciones en el orden definitivo:');
const items = [...html.matchAll(/data-account-section="([a-z]+)"/g)].map(m => m[1]);
ok('1.1 el menú declara exactamente las cinco secciones + Salir aparte',
   JSON.stringify(items) === JSON.stringify(['account', 'notifications', 'prefs', 'data', 'help']),
   items.join(','));
ok('1.2 "Cerrar sesión" es la última opción y mantiene su owner (#menuExit)',
   /data-account-section="help"[\s\S]{0,400}id="menuExit"/.test(html) &&
   /id="menuExit" class="menu-item menu-item--danger"/.test(html));
ok('1.3 se eliminó la opción genérica "Configuración" y el CTA Premium del menú',
   !/id="menuGeneral"/.test(html) && !/id="menuPremium"/.test(html));
ok('1.4 no hay accesos a Watchlist ni Workspace en el menú',
   !/#menuPanel[\s\S]{0,900}(data-menu="watchlist"|data-menu="workspace")/.test(html));
ok('1.5 la cabecera del menú conserva nombre y estado Free/Premium (owner existente)',
   /id="menuUserName"/.test(html) && /id="menuUserBadge"/.test(html) &&
   /_aurixRenderMenuIdentity/.test(app));

// ── 2. Icono hamburguesa ↔ X ────────────────────────────────────────────────
console.log('\n2 — El icono vuelve SIEMPRE a tres líneas al cerrar:');
ok('2.1 la X la dibuja la clase `open` del botón (owner CSS ya existente)',
   /\.menu-toggle\.open \.menu-toggle-bar:nth-child\(1\)[^}]*rotate\(45deg\)/.test(cssCode));
ok('2.2 el cierre por navegación quita la clase del BOTÓN, no sólo la del panel',
   /function _closeAccountMenu\(\)[\s\S]{0,320}toggle\.classList\.remove\('open'\)/.test(app));
// Regresión concreta: el handler anterior sólo tocaba el panel y el aria, así que la
// X se quedaba visible con el menú ya cerrado.
ok('2.3 no queda ningún cierre que olvide el botón (panel sin toggle en el mismo bloque)',
   !/panel\.classList\.remove\('open'\);\s*\n\s*if \(toggle\) toggle\.setAttribute\('aria-expanded', 'false'\);\s*\n\s*openSettingsPanel\(\)/.test(appCode));
ok('2.4 el toggle base abre/cierra y sincroniza clase y aria',
   /function closeMenu\(\) \{[\s\S]{0,260}toggle\.classList\.remove\('open'\)[\s\S]{0,120}aria-expanded', 'false'/.test(app));

// ── 3. Estado único y apertura directa ──────────────────────────────────────
console.log('\n3 — Un solo estado fuente de verdad y cero pantallas intermedias:');
ok('3.1 existe UNA variable de sección activa, no booleanos paralelos',
   (app.match(/^let _aurixAccountSection = /gm) || []).length === 1 &&
   !/let (menuOpen|modalOpen|accountModalOpen) *=/.test(appCode));
const openFn = fnSource('openSettingsPanel');
ok('3.2 openSettingsPanel abre en la sección pedida (ya no fuerza "account")',
   /function openSettingsPanel\(section\)/.test(openFn) &&
   /const pane = section \|\| _aurixAccountSection \|\| 'account';/.test(openFn) &&
   !/_settingsSelectPane\('account'\);\s*\/\/ always open on Cuenta/.test(app));
ok('3.3 el handler del menú fija la sección ANTES de abrir y cierra el menú',
   /_aurixAccountSection = section;[\s\S]{0,200}_closeAccountMenu\(\);[\s\S]{0,120}openSettingsPanel\(section\)/.test(app));
ok('3.4 el rail actualiza la MISMA fuente de verdad',
   /_aurixAccountSection = item\.dataset\.settingsPane;/.test(app));
ok('3.5 un único conmutador de panes (no se creó un modal por sección)',
   (app.match(/^function _settingsSelectPane\(/gm) || []).length === 1 &&
   (html.match(/id="settingsOverlay"/g) || []).length === 1);
ok('3.6 no se usan timeouts arbitrarios para encadenar menú → tarjeta',
   !/_closeAccountMenu\(\);\s*setTimeout/.test(appCode));

// ── 4. Preferencias agrupa el perfil inversor sin duplicar owners ───────────
console.log('\n4 — Preferencias = generales + perfil inversor, sin duplicar:');
ok('4.1 el conmutador mapea "prefs" a las dos secciones',
   /const _PANE_SECTIONS = \{ prefs: \['prefs', 'profile'\] \};/.test(app));
ok('4.2 el markup de idioma/moneda y perfil inversor NO se duplicó',
   (html.match(/id="settingsSectionPrefs"/g) || []).length === 1 &&
   (html.match(/id="settingsSectionProfile"/g) || []).length === 1);
ok('4.3 "Perfil inversor" deja de ser entrada propia del rail',
   !/data-settings-pane="profile"/.test(html));

// ── 5. Secciones nuevas ─────────────────────────────────────────────────────
console.log('\n5 — Notificaciones y Ayuda: contenido honesto, sin backend:');
ok('5.1 Notificaciones existe como pane dentro del MISMO modal',
   /<section class="settings-section" data-pane="notifications"/.test(html));
ok('5.2 muestra estado vacío con el texto exacto y la etiqueta Próximamente',
   /data-i18n="acNoNotifications"/.test(html) && /data-i18n="acSoon"/.test(html) &&
   /acNoNotifications:\s*'No tienes notificaciones'/.test(app) &&
   /acSoon:\s*'Próximamente'/.test(app));
ok('5.3 no se introdujo backend, programación ni envío de notificaciones',
   !/api\/notifications|sendNotification|scheduleNotification/.test(app));
// ACCOUNT-CENTER-I18N-1 — el mailto pasa a ser NEUTRO: sólo destinatario. Antes llevaba
// asunto y cuerpo precargados en español, que es texto de producto sin traducir dentro de
// un enlace; y prerrellenar el correo del usuario no es decisión del producto.
const mailtos = [...html.matchAll(/mailto:[^"']*/g)].map(m => m[0]);
ok('5.4 Ayuda usa EXACTAMENTE el correo indicado y NADA más',
   mailtos.length === 1 && mailtos[0] === 'mailto:aurixsystemoficial@gmail.com', mailtos.join(' | '));
ok('5.5 el mailto no precarga asunto ni cuerpo (ni texto en ningún idioma)',
   !/mailto:[^"']*[?&](subject|body)=/i.test(html) &&
   !/Soporte%20Aurix|equipo%20de%20Aurix|Necesito%20ayuda/i.test(html));
ok('5.6 el enlace de soporte no adjunta datos ni diagnóstico y no lo reescribe el JS',
   !/mailto:[^"']*(AurixDiagShare|diagnostic|report)/i.test(html) &&
   !/acSupportLink[\s\S]{0,200}(href|mailto)/.test(appCode));

// ── 6. Seguridad reutiliza los owners protegidos ────────────────────────────
console.log('\n6 — Seguridad reutiliza los owners existentes, sin tocarlos:');
ok('6.1 la sección Datos y seguridad sigue siendo el mismo pane', /data-pane="data" id="settingsSectionData"/.test(html));
ok('6.2 el diagnóstico sigue apoyado en AurixDiagShare (PII-free)', /window\.AurixDiagShare/.test(app));
ok('6.3 el reset conserva su confirmación y su owner', /resetConfirmOverlay/.test(app) && /performSafeReset/.test(app));
ok('6.4 exportar/importar siguen deshabilitados como "Próximamente"', /id="settingsImportBtn"/.test(html));

// ── 7. Responsive y foco ────────────────────────────────────────────────────
console.log('\n7 — Web y móvil comparten lógica; sólo cambia el layout:');
ok('7.1 en móvil también se muestra SÓLO la sección activa (antes se apilaban todas)',
   /@media \(max-width: 768px\)[\s\S]{0,2200}\.settings-body--nav \.settings-panes > \.settings-section\{ display:none; \}/.test(cssCode) &&
   /@media \(max-width: 768px\)[\s\S]{0,2400}\.settings-section\.is-active\{ display:flex; \}/.test(cssCode));
ok('7.2 el rail sigue oculto en móvil (la navegación es el menú)',
   /@media \(max-width: 768px\)[\s\S]{0,200}\.settings-nav\{ display:none; \}/.test(cssCode));
ok('7.3 el foco entra al cierre de la tarjeta al abrir',
   /getElementById\('settingsClose'\); if \(c\) setTimeout\(\(\) => c\.focus\(\), 0\)/.test(app));
ok('7.4 el foco vuelve al botón de menú al cerrar',
   /getElementById\('menuToggle'\); if \(t\) t\.focus\(\{ preventScroll: true \}\)/.test(app));
ok('7.5 el bloqueo de scroll del body se libera al cerrar (sin scroll atascado)',
   /function closeSettingsPanel\(\)[\s\S]{0,600}document\.body\.classList\.remove\('modal-open'\)/.test(app));

// ── 8. i18n COMPLETO del Account Center ─────────────────────────────────────
// SPEC ACCOUNT CENTER I18N COMPLETE. El criterio no es "las capturas están bien":
// es que NINGÚN texto del Account Center se resuelva fuera del diccionario, y que el
// cambio de idioma no exija recargar. Los dos defectos reales que esto fija:
//   (a) traducción paralela — ternarios `lang === 'es' ? 'Sesión activa' : …` dentro de
//       _settingsPopulate, invisibles para applyI18n();
//   (b) `removeAttribute('data-i18n')` sobre el estado de sesión, que lo sacaba del
//       sistema para siempre → mezcla de idiomas con la tarjeta abierta.
console.log('\n8 — i18n completo: cero literales y cambio inmediato ES↔EN:');

// Bloques exactos del Account Center en el markup.
const acMenu  = html.slice(html.indexOf('<div id="menuPanel"'), html.indexOf('</header>'));
const acModal = html.slice(html.indexOf('<div class="modal-overlay" id="settingsOverlay">'), html.indexOf('id="founderOverlay"'));
const acHtml  = acMenu + acModal;

// Diccionarios ES / EN tal y como los declara app.js (una sola fuente, sin duplicar).
const _iT = app.indexOf('const T = {');
const _esS = app.indexOf('es: {', _iT), _enS = app.indexOf('en: {', _iT);
const dictEs = app.slice(_esS, _enS), dictEn = app.slice(_enS, app.indexOf('\n};', _enS));
const dictHas = (blk, k) => new RegExp('(?:^|[\\s{,])' + k + '\\s*:', 'm').test(blk);
const dictVal = (blk, k) => {
  const m = blk.match(new RegExp('(?:^|[\\s{,])' + k + "\\s*:\\s*('[^']*'|\"[^\"]*\")", 'm'));
  return m ? m[1].slice(1, -1) : null;
};

// 8.1 — toda clave usada en el Account Center existe en AMBOS diccionarios.
const acKeys = [...new Set([...acHtml.matchAll(/data-i18n(?:-aria|-ph|-title)?="([A-Za-z0-9_]+)"/g)].map(m => m[1]))];
const missingKeys = acKeys.filter(k => !dictHas(dictEs, k) || !dictHas(dictEn, k));
ok('8.1 las ' + acKeys.length + ' claves del Account Center existen en ES y en EN',
   acKeys.length >= 50 && missingKeys.length === 0, missingKeys.join(','));

// 8.2 — cobertura mínima obligatoria del SPEC, concepto a concepto, en los dos idiomas.
const REQUIRED = [
  'settingsTitle', 'acProfile', 'acNotifications', 'acPreferences', 'acSecurity', 'acHelp',
  'menuLogout', 'acContactSupport', 'acNoNotifications', 'acSoon', 'settingsLang',
  'settingsCurrency', 'settingsProfileTitle', 'settingsProfileRisk', 'settingsProfileExperience',
  'settingsProfileAge', 'settingsExport', 'settingsImport', 'settingsDiag', 'settingsReset',
  'settingsStatus', 'settingsDisplayName', 'settingsEmail',
  'settingsSessionActive', 'settingsSessionNone',
];
const reqMissing = REQUIRED.filter(k => !dictHas(dictEs, k) || !dictHas(dictEn, k));
ok('8.2 la cobertura mínima del SPEC (' + REQUIRED.length + ' conceptos) está en los dos idiomas',
   reqMissing.length === 0, reqMissing.join(','));
// ...y traducida de verdad: ningún valor EN puede llevar acentos/ñ del español.
const notTranslated = REQUIRED.filter(k => { const v = dictVal(dictEn, k); return v && /[áéíóúñ¿¡]/i.test(v); });
ok('8.3 ningún valor EN quedó en español (acentos/ñ en el diccionario inglés)',
   notTranslated.length === 0, notTranslated.join(','));

// 8.4 — cero literales visibles sin clave en el markup del Account Center.
const bareText = [];
for (const m of acHtml.matchAll(/<(button|span|div|h3|h4|p|a|label)\b([^>]*)>([^<>]*[A-Za-zÁÉÍÓÚáéíóúñÑ][^<>]*)</g)) {
  const attrs = m[2], txt = m[3].trim();
  if (!txt || /data-i18n[="]/.test(attrs)) continue;
  // Exentos por naturaleza, no por excepción: nombres de idioma en su propio idioma
  // (convención universal), códigos de moneda, nombres de tier y marca.
  if (/^(Español|English|USD|EUR|FREE|PREMIUM|FOUNDER|Aurix Free|Aurix Premium|—|·)$/.test(txt)) continue;
  if (/id="settingsBuildVersion"/.test(attrs)) continue;   // valor de build, no copy
  bareText.push(txt.slice(0, 40));
}
ok('8.4 no queda texto visible hardcodeado en el markup del Account Center',
   bareText.length === 0, bareText.join(' | '));

// 8.5 — cero atributos accesibles hardcodeados (los lee un lector de pantalla: son copy).
const bareAttr = [];
for (const m of acHtml.matchAll(/(aria-label|placeholder|title)="([^"]+)"/g)) {
  const tag = acHtml.slice(acHtml.lastIndexOf('<', m.index), acHtml.indexOf('>', m.index) + 1);
  const need = 'data-i18n-' + (m[1] === 'aria-label' ? 'aria' : m[1] === 'placeholder' ? 'ph' : 'title');
  if (!tag.includes(need)) bareAttr.push(m[1] + '="' + m[2] + '"');
}
ok('8.5 todo aria-label/placeholder/title del Account Center se resuelve por clave',
   bareAttr.length === 0, bareAttr.join(' | '));

// 8.6 — sin traducción paralela: ningún ternario de idioma pinta texto en la región
// del Account Center. Se permite elegir LOCALE para fechas (no es copy).
const acJsStart = app.indexOf('function _settingsPopulate()');
const acJsEnd   = app.indexOf('function exportPortfolioBackup(');
const acJs = appCode.slice(acJsStart, acJsEnd);
const langTernaries = acJs.split('\n')
  .filter(l => /lang *===? *'es'/.test(l))
  .filter(l => !/toLocaleString|toLocaleDate|es-ES|en-GB/.test(l));
ok('8.6 cero ternarios `lang === \'es\'` pintando texto en el Account Center',
   langTernaries.length === 0, langTernaries.map(l => l.trim().slice(0, 60)).join(' | '));
ok('8.7 los textos derivados usan el helper existente (_settingsT), no un traductor nuevo',
   /statusKey = session \? 'settingsSessionActive' : 'settingsSessionNone'/.test(app) &&
   /_settingsT\(statusKey\)/.test(app) &&
   /descKey = isPremiumTier\(plan\.tier\) \? 'settingsPlanDescPremium' : 'settingsPlanDescFree'/.test(app) &&
   /_settingsT\(descKey\)/.test(app) &&
   (app.match(/^function _settingsT\(/gm) || []).length === 1 &&
   !/const (AC_T|ACCOUNT_T|_acT) *=/.test(appCode));
// Los literales de los toasts sólo pueden vivir en el diccionario. El assert mira la
// LLAMADA, no el fichero entero: `resetDoneToast` es una clave antigua de otra pantalla
// que comparte texto y no debe hacer fallar esto.
ok('8.8 los toasts del reset también salen del diccionario',
   /_settingsT\('settingsResetDoneToast'\)/.test(app) && /_settingsT\('settingsResetFailToast'\)/.test(app) &&
   !/_aurixShowToast\(\s*(isEs|isEsFail|lang)/.test(appCode) &&
   !/_aurixShowToast\(\s*['"][^'"]*[A-Za-zÁÉÍÓÚáéíóúñÑ]{4,}/.test(appCode));

// 8.9 — el estado de sesión vuelve al sistema: se RELIGA la clave en vez de borrarla.
ok('8.9 el estado de sesión se religa a su clave (ya no se saca del i18n con removeAttribute)',
   /setAttribute\('data-i18n', statusKey\)/.test(app) &&
   !/statusEl\.removeAttribute\('data-i18n'\)/.test(appCode));
ok('8.10 la descripción del plan también queda religada a su clave',
   /setAttribute\('data-i18n', descKey\)/.test(app));

// 8.11 — cambio inmediato: switchLang (owner único) re-deriva el Account Center.
const switchSrc = fnSource('switchLang');
ok('8.11 switchLang re-deriva el Account Center con el owner de repintado existente',
   /_settingsPopulate\(\)/.test(switchSrc) && /applyI18n\(\)/.test(switchSrc));
ok('8.12 no hay recarga/logout para aplicar el idioma',
   !/location\.reload|location\.href *=/.test(switchSrc) && !/signOut|logout/i.test(switchSrc));
ok('8.13 sigue habiendo UN solo owner de idioma (switchLang) y una sola pasada applyI18n',
   (app.match(/^function switchLang\(/gm) || []).length === 1 &&
   (app.match(/^function applyI18n\(/gm) || []).length === 1);
ok('8.14 applyI18n cubre texto y los tres tipos de atributo (aria/placeholder/title)',
   /\[data-i18n\]/.test(app) && /\[data-i18n-aria\]/.test(app) &&
   /\[data-i18n-ph\]/.test(app) && /\[data-i18n-title\]/.test(app));

// 8.15 — web y móvil comparten el mismo texto: ningún pane inyecta copy desde CSS
// (un `content:` con texto sería intraducible y sólo aparecería en un breakpoint).
const acCss = cssCode.match(/\.(settings|menu-item|ac-empty|ac-soon)[^{]*\{[^}]*\}/g) || [];
ok('8.15 ningún selector del Account Center inyecta texto por CSS `content:`',
   !acCss.some(r => /content: *['"][^'"]*[A-Za-zÁÉÍÓÚáéíóúñÑ]{3,}/.test(r)));

console.log('\nRESULT: ' + (fail === 0 ? 'ALL PASS ✓' : 'FAIL ✗') + '  (' + pass + ' passed, ' + fail + ' failed)');
process.exit(fail === 0 ? 0 : 1);
