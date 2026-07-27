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
ok('5.4 Ayuda usa EXACTAMENTE el correo indicado',
   /mailto:aurixsystemoficial@gmail\.com\?subject=Soporte%20Aurix/.test(html));
ok('5.5 el cuerpo del correo es el pedido y no adjunta datos ni diagnóstico',
   /body=Hola%2C%20equipo%20de%20Aurix%3A%0A%0ANecesito%20ayuda%20con%3A/.test(html) &&
   !/mailto:[^"]*AurixDiagShare|mailto:[^"]*diagnostic/.test(html));

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

console.log('\nRESULT: ' + (fail === 0 ? 'ALL PASS ✓' : 'FAIL ✗') + '  (' + pass + ' passed, ' + fail + ' failed)');
process.exit(fail === 0 ? 0 : 1);
