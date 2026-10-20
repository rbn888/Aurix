#!/usr/bin/env node
/**
 * AURIX · ONBOARDING & FIRST INTELLIGENCE ACTIVATION — contratos (SPEC MAESTRO V1)
 * ════════════════════════════════════════════════════════════════════════════
 * Estático + estado ejecutado en sandbox. El recorrido real (tiempos, scroll, navegación,
 * otros modales, viewports, WebKit) lo certifica la sonda multi-viewport sobre la demo.
 *   A · copy ES/EN de WELCOME / ACTIVATION / SUCCESS y nota retirada
 *   B · selector de tipos: retoque acotado a #addV2Picker
 *   C · ventana: marcado, accesibilidad y CSS (centrada, sin bloquear el scroll del body)
 *   D · cuándo nace `pending` y cuándo se muestra (gates)
 *   E · persistencia: monótona, sellada con el dueño, sincronizada y purgada por cuenta
 *   F · destino: Intelligence sin paywall directo y sin tocar motores ni frontera
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' [' + info + ']' : '')); } };
const count = (re, s) => (s.match(re) || []).length;
const step = name => { const m = new RegExp('<section class="onb-step" data-onb-step="' + name + '">([\\s\\S]*?)</section>').exec(html); return m ? m[1] : ''; };
const ctrl = (() => { const a = app.indexOf("var _FINTEL_KEY = 'aurix_first_intel_v1';"); const b = app.indexOf('window._aurixFirstIntel = _aurixFirstIntel;'); return a > 0 && b > a ? app.slice(a, b) : ''; })();

console.log('\nA — Copy del recorrido:');
{
  const pairs = [
    ['onbWelcomeTitle', "'Empecemos por conocer tus inversiones.'", `"Let's start with your investments."`],
    ['onbWelcomeSub', "'Registra las inversiones que ya tienes. AURIX te ayudará a comprender mejor tu patrimonio.'", "'Add the investments you already own. AURIX will help you better understand your wealth.'"],
    ['onbActTitle', "'Añade tu primer activo.'", "'Add your first asset.'"],
    ['onbActSub', "'Con tus datos, AURIX podrá ofrecerte una primera lectura de tu patrimonio.'", "'With your data, AURIX can offer you a first reading of your wealth.'"],
    ['onbAddAssetBtn', "'+ Añadir activo'", "'+ Add asset'"],
    ['onbSuccessTitle', "'Tu inversión se ha registrado correctamente.'", "'Your investment has been added successfully.'"],
    ['onbSuccessSub', "'Tu patrimonio ya está actualizado en AURIX.'", "'Your wealth information is now updated in AURIX.'"],
    ['onbAddAnother', "'+ Añadir otro activo'", "'+ Add another asset'"],
    ['onbGoDashboard', "'Ver mi patrimonio'", "'View my wealth'"],
    ['fintelTitle', "'Tu primer análisis está listo.'", "'Your first analysis is ready.'"],
    ['fintelDesc', "'AURIX ya ha analizado tus inversiones. Descubre qué revelan sobre tu patrimonio y qué merece tu atención.'", "'AURIX has analyzed your investments. Discover what they reveal about your wealth and what deserves your attention.'"],
    ['fintelCta', "'Ver mi análisis'", "'View my analysis'"],
    ['fintelLater', "'Ahora no, ir a mi Dashboard'", "'Not now, go to my Dashboard'"],
    ['fintelClose', "'Cerrar'", "'Close'"],
  ];
  for (const [k, es, en] of pairs) ok(`A.1 ${k} ES/EN exactos`, app.includes(k + ':') && app.includes(es) && app.includes(en), k);
  ok('A.2 la bienvenida ya no repite el titular de la landing', !/Todo tu patrimonio\. Una sola visión|All your wealth\. A single view/.test(app + step('WELCOME')));
  // Sólo en ACTIVATION: los avisos informativos de otros sitios (p. ej. el de la operación) se conservan.
  ok('A.3 ACTIVATION sin la nota «no mueve dinero» (marcado y claves retirados)',
     !/onb-note|onbActNote|mueve dinero|move money/.test(step('ACTIVATION')) && !/onbActNote/.test(app) && /tradeRecordNote:/.test(app));
  ok('A.4 se conservan progreso, secuencia, categorías, ES|EN y las dos acciones de SUCCESS',
     /data-onb-langswitch="es"/.test(html) && count(/class="onb-wr-step"/g, step('WELCOME')) === 3 &&
     count(/<li style="--onb-cat/g, step('WELCOME')) === 6 && /id="onbAddAnotherBtn"/.test(step('SUCCESS')) &&
     /id="onbGoDashboardBtn"/.test(step('SUCCESS')) && /id="onbSuccessSummary"/.test(step('SUCCESS')) && /id="onbSuccessChip"/.test(step('SUCCESS')));
  ok('A.5 SUCCESS no promociona Intelligence ni abre otro popup', !/fintel|Ver mi análisis|View my analysis/.test(step('SUCCESS')));
}

console.log('\nB — Selector de tipos (retoque, no rediseño):');
{
  ok('B.1 superficie charcoal SÓLO en #addV2Picker (el subselector de metales no cambia)',
     /#addV2Picker \.add-v2-card:not\(\.is-disabled\) \{\s*background: linear-gradient\(180deg, rgba\(14,20,36/.test(css));
  ok('B.2 azul eléctrico en hover y foco, no en las tarjetas en reposo',
     /#addV2Picker \.add-v2-card:not\(\.is-disabled\):hover \{[^}]*border-color: rgba\(91,140,255/.test(css) &&
     /#addV2Picker \.add-v2-card:focus-visible \{ outline: 2px solid #8fb6ff/.test(css));
  ok('B.3 mismo marcado: 7 tarjetas, mismos data-pick', count(/class="add-v2-card[^"]*" data-pick=/g, html) === 7);
}

console.log('\nC — Ventana: marcado, accesibilidad y CSS:');
{
  const m = /<div class="fintel-overlay" id="firstIntelOverlay" hidden>([\s\S]*?)\n<\/div>\n/.exec(html);
  const mk = m ? m[1] : '';
  ok('C.1 diálogo modal etiquetado y enfocable', /role="dialog" aria-modal="true" aria-labelledby="fintelTitle" aria-describedby="fintelDesc" tabindex="-1"/.test(mk));
  ok('C.2 cierre accesible, CTA y acción secundaria', /id="fintelClose" data-i18n-aria="fintelClose"/.test(mk) && /id="fintelCta"/.test(mk) && /id="fintelLater"/.test(mk));
  ok('C.3 sin cifras, gráfico ni ilustración', !/\d/.test(mk.replace(/<[^>]+>/g, '')) && !/<(svg|canvas|img)\b/.test(mk));
  ok('C.4 fija y centrada en el viewport, con velo discreto', /\.fintel-overlay \{\s*position: fixed; inset: 0;[^}]*align-items: center; justify-content: center;/.test(css));
  ok('C.5 si no cabe, desplaza por DENTRO (alto acotado al viewport)', /\.fintel-card \{[^}]*max-height: calc\(100dvh[^}]*overflow-y: auto/.test(css));
  ok('C.6 bloqueo de scroll sin `position:fixed` (no devuelve el Dashboard arriba)', /body\.aurix-fintel-lock \{ overflow: hidden; \}/.test(css) && !/fintel[\s\S]{0,400}modal-open'\)\.add/.test(ctrl));
  ok('C.7 acciones ≥44 px y reduced-motion', /\.fintel-close \{[^}]*width: 44px; height: 44px/.test(css) && /\.fintel-later \{[^}]*min-height: 44px/.test(css) && /prefers-reduced-motion: reduce\) \{\s*\.fintel-overlay, \.fintel-card \{ transition: none; \}/.test(css));
  ok('C.8 Escape cierra y el foco circula sólo entre sus acciones', /e\.key === 'Escape'[^\n]*_close\('escape'\)/.test(ctrl) && /e\.preventDefault\(\);\s*const i = f\.indexOf\(document\.activeElement\)/.test(ctrl));
}

console.log('\nD — Cuándo nace `pending` y cuándo se muestra:');
{
  ok('D.1 «Ver mi patrimonio» la deja pendiente (y registra onboarding_completed)',
     /closest\('#onbGoDashboardBtn'\)[\s\S]{0,200}_aurixRecordFunnelStep\('onboarding_completed'\)[\s\S]{0,80}_aurixFirstIntel\.markPending\(\)/.test(app));
  ok('D.2 primer activo: sólo prev 0, guardado de USUARIO y onboarding a medias',
     /d\.prev !== 0\) return/.test(ctrl) && /ctx !== 'mutation'\) return/.test(ctrl) && /st !== S\.WELCOME && st !== S\.ACTIVATION && st !== S\.SUCCESS\) return/.test(ctrl));
  ok('D.3 retraso de 3 s acumulado sólo con Dashboard libre', /DELAY_MS = 3000/.test(ctrl) && /if \(wasFree\) visibleMs \+= dt;/.test(ctrl) && /visibleMs < DELAY_MS/.test(ctrl));
  ok('D.4 bloqueos: splash, pestaña, documento oculto, reset, modales, paywall, alta y edición visible',
     ['__AURIX_SPLASH_HIDDEN', "currentTab !== 'home'", 'document.hidden', '_aurixResetInProgress', "'modal-open'", "'aurix-premium-lock'", "'onb-addflow'", '.modal-overlay.open', '.aurix-premium-overlay.is-open', "'.modal-overlay:not(.open), [hidden], [aria-hidden=\"true\"]'"].every(x => ctrl.includes(x)));
  ok('D.5 sólo con una lectura Free REAL del motor de la portada', /const r = _aurixIntelligencePreviewFacts\(\);\s*return !!\(r && r\.state === 'ok' && Array\.isArray\(r\.visible\) && r\.visible\.length > 0\)/.test(ctrl));
  ok('D.6 se reanuda tras cargar la cuenta, sin reloj si no hay ventana pendiente',
     /addEventListener\('aurix:portfolio-ready', \(\) => _start\(\)\)/.test(ctrl) && /if \(timer \|\| open \|\| _aurixFintelRead\(\) !== 'pending'\) return;/.test(ctrl));
}

console.log('\nE — Persistencia (ejecutada):');
{
  const store = {};
  const sb = {
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    currentUser: { id: 'u-A' }, flushes: 0, stamped: 0, JSON, Date,
  };
  sb.scheduleStateFlush = () => { sb.flushes++; };
  sb._touchUiState = () => { sb.stamped++; };
  vm.createContext(sb);
  const fns = ctrl.slice(0, ctrl.indexOf('const _aurixFirstIntel'));
  vm.runInContext(fns, sb);
  vm.runInContext('var _aurixFirstIntel = { kick: function () { kicks++; } }; var kicks = 0;', sb);
  const R = () => vm.runInContext('_aurixFintelRead()', sb);
  const Wr = (s, o) => vm.runInContext(`_aurixFintelWrite(${JSON.stringify(s)}, ${JSON.stringify(o || null)})`, sb);
  ok('E.1 sin registro ⇒ no elegible', R() === null);
  ok('E.2 ausente → pendiente → consumido', Wr('pending') && R() === 'pending' && Wr('consumed') && R() === 'consumed');
  ok('E.3 nunca retrocede (ni desde remoto)', !Wr('pending') && !Wr('pending', { fromRemote: true }) && R() === 'consumed');
  ok('E.4 un cambio LOCAL programa el flush SIN re-sellar ui_state (no gana el LWW del Workspace)', sb.flushes === 2 && sb.stamped === 0);
  vm.runInContext("localStorage.removeItem('aurix_first_intel_v1')", sb);
  vm.runInContext("_aurixFintelMergeRemote({ firstIntel: 'pending' }); _aurixFintelMergeRemote({ firstIntel: 'consumed' }); _aurixFintelMergeRemote({ firstIntel: 'pending' }); _aurixFintelMergeRemote({ firstIntel: 'bogus' }); _aurixFintelMergeRemote(null)", sb);
  ok('E.4b fusión remota monótona, tolerante y sin flush propio', R() === 'consumed' && sb.flushes === 2 && vm.runInContext('kicks', sb) === 2);
  sb.currentUser = { id: 'u-B' };
  ok('E.5 sellado con el dueño: la cuenta B no hereda el estado de A', R() === null);
  sb.currentUser = null;
  ok('E.6 sin sesión no se escribe', !Wr('pending'));
  ok('E.7 viaja en ui_state y la fusión remota es monótona',
     /let firstIntel = null;\s*try \{ firstIntel = _aurixFintelRead\(\); \}/.test(app) && /try \{ _aurixFintelMergeRemote\(ui\); \} catch \(_\) \{\}/.test(app) &&
     /if \(remoteUi\) _aurixFintelMergeRemote\(remoteUi\);\s*if \(remoteUi && remoteUiTs > localUiTs\)/.test(app));
  ok('E.8 purgada al cambiar de usuario (USER_SCOPED_LOCAL_KEYS)', /const USER_SCOPED_LOCAL_KEYS = \[[\s\S]*?'aurix_first_intel_v1',[\s\S]*?\];/.test(app));
  ok('E.9 se consume al MOSTRARSE, no antes', /ov\.hidden = false;\s*open = true;\s*_aurixFintelWrite\('consumed'\);/.test(ctrl) && count(/_aurixFintelWrite\('consumed'\)/g, ctrl) === 1);
}

console.log('\nF — Destino y frontera:');
{
  ok('F.1 el CTA cierra y abre Intelligence', /_close\('cta'\);\s*try \{ switchTab\('intelligence'\); \}/.test(ctrl));
  ok('F.2 sin paywall, upgrade ni entitlements en la ventana', !/openAurixPremiumModal|openUpgradeIntent|openPremiumModal|hasAurixPremiumAccess|entitlement|checkout/i.test(ctrl));
  ok('F.3 no publica ni calcula cifras: sólo pregunta si hay lectura', count(/_aurixIntelligencePreviewFacts\(/g, ctrl) === 1 && !/visible\[0\]|\.text\b/.test(ctrl));
  ok('F.4 embudo con el registro existente, sin datos financieros',
     ['first_intel_available', 'first_intel_shown', 'first_intel_cta', 'first_intel_entered', "'first_intel_dismiss_' + reason"].every(x => ctrl.includes(x)) && /_aurixRecordFunnelStep\(step\)/.test(ctrl));
}

console.log(`\n${fail ? '✗' : '✅'} FIRST-INTELLIGENCE-ACTIVATION — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
