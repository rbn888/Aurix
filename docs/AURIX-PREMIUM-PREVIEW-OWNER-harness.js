'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-PREMIUM-PREVIEW-OWNER-harness — launch previews (FINAL POLISH) + owner override
// ════════════════════════════════════════════════════════════════════════════
// Owner (rbn892@gmail.com, authenticated email) → full access; else → premium preview.
// FINAL POLISH: single shared premium-preview-* class system (stage/card/orb/badge/grid/cta), clean
// premium-black stage (no host chrome — :has() neutralizer for #tabPlaceholder & #aurixWorkspace),
// Intelligence bullets trimmed to 6 (perfect 3x2, no "Timeline patrimonial"), compact CTA, section
// badges (no "Aurix Premium"), i18n ES/EN, header stability. Free user's "Aurix Premium" menu item is a
// blurred coming-soon intrigue state (no click/modal/navigation); owner sees it normal + clickable.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
function fn(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let k = app.indexOf('{', i), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(i, k); }
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }

const sb = { String, Boolean };
vm.createContext(sb);
// SPEC MONETIZATION M.02 B3 — `hasAurixPremiumAccess` ya NO decide: delega en
// `hasFeature()`, que deriva del resolver server-side. Se inyecta el gate para
// poder comprobar la DELEGACIÓN, que es el contrato nuevo.
sb.__hasFeatureReturns = false;
sb.__hasFeatureCalls = [];
vm.runInContext('function hasFeature(k){ __hasFeatureCalls.push(k); return __hasFeatureReturns; }', sb);
vm.runInContext(fn('hasAurixPremiumAccess'), sb);
vm.runInContext(fn('_aurixPremiumPreviewHTML'), sb);
const has = u => { sb.__u = u; return vm.runInContext('hasAurixPremiumAccess(__u)', sb); };
const withEnt = (v, u) => { sb.__hasFeatureReturns = v; sb.__hasFeatureCalls = []; const r = has(u); return r; };
const previewLang = (s, l) => { sb.lang = l; return vm.runInContext('_aurixPremiumPreviewHTML(' + JSON.stringify(s) + ')', sb); };
const count = (h, re) => (h.match(re) || []).length;

console.log('AURIX-PREMIUM-PREVIEW-OWNER (FINAL POLISH)\n');

// ── RE-ESCRITO por SPEC MONETIZATION M.02 B3 ─────────────────────────────────
// Antes esta sección certificaba la semántica que B3 viene a RETIRAR: el email del
// owner compilado en el bundle concedía acceso, y `user.premium` / `user.isPremium`
// / `user.subscriptionActive` también (una rama sin escritor que se volvía
// auto-concesión el día que alguien mapeara `user_metadata` sobre el user).
// Ahora la autoridad es `public.aurix_entitlements()` y este helper sólo delega.
// Lo que se certifica es justo lo contrario que antes, y a propósito.
console.log('Owner override RETIRADO — el helper delega en el entitlement (M.02 B3):');
ok('el email del owner ya NO concede acceso',
  withEnt(false, { email: 'rbn892@gmail.com' }) === false);
ok('ni con cualquier variante de caja/espacios',
  withEnt(false, { email: '  RBN892@Gmail.com ' }) === false);
ok('user.premium / isPremium / subscriptionActive ya NO conceden',
  withEnt(false, { email: 'x@y.com', premium: true }) === false &&
  withEnt(false, { email: 'x@y.com', isPremium: true }) === false &&
  withEnt(false, { email: 'x@y.com', subscriptionActive: true }) === false);
ok('con el entitlement CONCEDIDO devuelve true, sea quien sea el user',
  withEnt(true, null) === true && withEnt(true, {}) === true &&
  withEnt(true, { email: 'someone@else.com' }) === true);
ok('delega en la feature intelligence.full (una sola pregunta, al resolver)',
  (function () { sb.__hasFeatureReturns = false; sb.__hasFeatureCalls = []; has({ email: 'x@y.com' });
    return sb.__hasFeatureCalls.length === 1 && sb.__hasFeatureCalls[0] === 'intelligence.full'; })());
ok('el helper no mira email, flags del user, localStorage ni ningún secreto global',
  !/rbn892|localStorage|sessionStorage|SECRET|unlock|\.premium|isPremium|subscriptionActive/i
    .test(fn('hasAurixPremiumAccess').replace(/^\s*\/\/.*$/gm, '')));
// Era VACUO: `typeof <cualquier cosa>` siempre devuelve un string. Se comprueba que
// la función exista de verdad Y que produzca la superficie del preview.
ok('el preview compartido sigue siendo el fallback y NO se retiró',
  vm.runInContext('typeof _aurixPremiumPreviewHTML', sb) === 'function' &&
  /premium-preview-stage/.test(previewLang('intelligence', 'es')));

function check(section, l, C) {
  const h = previewLang(section, l);
  console.log('\n' + section + ' [' + l + ']:');
  ok('badge = ' + C.badge + ' (NOT "Aurix Premium")', h.indexOf(C.badge) >= 0 && !/Aurix Premium/i.test(h));
  ok('coming-soon teaser above card = ' + C.comingSoon, /class="premium-preview-coming-soon"/.test(h) && h.indexOf('>' + C.comingSoon + '</div>') >= 0);
  ok('title', h.indexOf(C.title) >= 0);
  ok('subtitle', h.indexOf(C.subtitle) >= 0);
  ok('text', h.indexOf(C.text) >= 0);
  ok('key message', h.indexOf(C.key) >= 0);
  ok('exactly 6 mini-cards (perfect 3x2)', count(h, /class="premium-preview-bullet"/g) === 6 && C.bullets.length === 6, 'n=' + count(h, /class="premium-preview-bullet"/g));
  C.bullets.forEach(b => ok('bullet: ' + b, h.indexOf(b) >= 0));
  ok('CTA ' + C.cta + ' → switchTab(home)', h.indexOf('>' + C.cta + '</button>') >= 0 && /switchTab\('home'\)/.test(h));
  ok('shared premium-preview-* system (stage+card+orb+badge+grid+cta)', /premium-preview-stage/.test(h) && /premium-preview-card/.test(h) && /premium-preview-orb/.test(h) && /premium-preview-badge/.test(h) && /premium-preview-grid/.test(h) && /premium-preview-cta/.test(h));
  ok('clean premium-black stage + subtle glow (no gradient block)', /#05070e/.test(h) && /radial-gradient/.test(h));
  ok('host chrome neutralized (:has() on #tabPlaceholder & #aurixWorkspace)', /\.tab-placeholder:has\(\.premium-preview-stage\)/.test(h) && /\.aurix-workspace:has\(\.premium-preview-stage\)/.test(h));
  ok('no price/Founder/blocked/denied', !/[€$]|precio|\bprice\b|founder|acceso denegado|bloquead|access denied|\blocked\b/i.test(h));
}

check('intelligence', 'es', { comingSoon: 'PRÓXIMAMENTE', badge: 'CAPA INTELIGENTE', title: 'Aurix Intelligence se está preparando', subtitle: 'Aurix ya está analizando tu información patrimonial.', text: 'Aunque todavía no veas esta sección completa, Aurix ya está organizando tus datos, calculando tu exposición y preparando una inteligencia personalizada sobre tu cartera.', key: 'Tu análisis no empieza cuando se desbloquea la sección. Empieza desde el primer dato que registras en Aurix.', bullets: ['Salud patrimonial', 'Riesgo y concentración', 'Diversificación', 'Liquidez', 'Drivers de evolución', 'Insights personalizados'], cta: 'Volver al Dashboard' });
check('workspace', 'es', { comingSoon: 'PRÓXIMAMENTE', badge: 'ZONA DE TRABAJO', title: 'Aurix Workspace se está preparando', subtitle: 'Tus futuras herramientas patrimoniales estarán conectadas a tu cartera real.', text: 'Aurix está construyendo un espacio donde podrás planificar, organizar, simular escenarios y trabajar con tu patrimonio desde una única plataforma.', key: 'Workspace no será una zona aislada. Será tu mesa de trabajo patrimonial, conectada a tus activos, tu evolución y tus objetivos.', bullets: ['Planificación patrimonial', 'Calculadoras financieras', 'Simuladores', 'Objetivos', 'Escenarios', 'Herramientas avanzadas'], cta: 'Volver al Dashboard' });
check('intelligence', 'en', { comingSoon: 'COMING SOON', badge: 'INTELLIGENCE LAYER', title: 'Aurix Intelligence is getting ready', subtitle: 'Aurix is already analyzing your wealth information.', text: 'Even though this section is not fully visible yet, Aurix is already organizing your data, calculating your exposure and preparing personalized intelligence for your portfolio.', key: 'Your analysis does not start when the section unlocks. It starts from the first data point you register in Aurix.', bullets: ['Portfolio Health', 'Risk and concentration', 'Diversification', 'Liquidity', 'Wealth drivers', 'Personalized insights'], cta: 'Back to Dashboard' });
check('workspace', 'en', { comingSoon: 'COMING SOON', badge: 'WEALTH WORKSPACE', title: 'Aurix Workspace is getting ready', subtitle: 'Your future wealth tools will be connected to your real portfolio.', text: 'Aurix is building a space where you will be able to plan, organize, simulate scenarios and work with your wealth from a single platform.', key: 'Workspace will not be an isolated area. It will become your wealth operating desk, connected to your assets, your evolution and your goals.', bullets: ['Wealth planning', 'Financial calculators', 'Simulators', 'Goals', 'Scenarios', 'Advanced tools'], cta: 'Back to Dashboard' });

console.log('\nIntelligence trimmed to 6 (Timeline removed):');
{ const esI = previewLang('intelligence', 'es'), enI = previewLang('intelligence', 'en');
  ok('ES intelligence has NO "Timeline patrimonial"', esI.indexOf('Timeline patrimonial') < 0);
  ok('EN intelligence has NO "Wealth timeline"', enI.indexOf('Wealth timeline') < 0); }

console.log('\nShared layout + i18n isolation + compact:');
{ const esI = previewLang('intelligence', 'es'), enI = previewLang('intelligence', 'en'), esW = previewLang('workspace', 'es');
  ok('Intelligence & Workspace share identical card + stage (same size/layout)', /premium-preview-card/.test(esI) && /premium-preview-card/.test(esW) && /max-width:820px/.test(esI) && /max-width:820px/.test(esW));
  ok('both use 3x2 grid on desktop', /grid-template-columns:repeat\(3,1fr\)/.test(esI) && /grid-template-columns:repeat\(3,1fr\)/.test(esW));
  ok('reduced-motion + responsive (1-col mobile) present', /prefers-reduced-motion/.test(esI) && /max-width:640px/.test(esI) && /grid-template-columns:1fr/.test(esI));
  ok('EN carries no Spanish leak', !/se está preparando|Volver al Dashboard|Salud patrimonial|CAPA INTELIGENTE|próximamente/.test(enI)); }

console.log('\nGates + owner + header stability (source):');
// INT.PREVIEW.V1 (SPEC 2.4): the gate is unchanged — a non-premium user still gets a preview
// surface — but Intelligence now returns the personalised INT.PREVIEW.V1 reading instead of the
// shared "PRÓXIMAMENTE" card. Workspace keeps the shared card (asserted on the next line).
// Contract of the new surface lives in docs/AURIX-INT-PREVIEW-V1-harness.js.
// ── RE-DECIDIDOS por SPEC MONETIZATION M.02 B3/B4 ────────────────────────────
// Intelligence sigue cayendo al preview cuando no hay derecho: lo que cambia es
// QUIÉN lo decide (el entitlement server-side, no un email del bundle).
ok('renderIntelligenceTab devuelve el preview cuando NO hay entitlement',
  /if \(!hasFeature\('intelligence\.full'\)\) return _aurixIntelligencePreviewHTML\(\);/.test(app));
// Workspace ya NO tiene rama de preview a nivel de SECCIÓN. Era el bloqueo global
// que impedía que cualquier usuario Free llegara a ver Compound; B4 abre la sección
// y gatea las HERRAMIENTAS. El preview compartido sigue existiendo (es el fallback
// de Intelligence y de quien lo necesite), pero ya no es el camino de Workspace.
ok('Workspace NO tiene bloqueo global de sección (abierto al plan Free)',
  !/_aurixPremiumPreviewHTML\('workspace'\)/.test(app.replace(/^\s*\/\/.*$/gm, '')) &&
  /if \(AURIX_WS_HOME\) \{ renderWorkspaceHome\(container\); return; \}/.test(app));
ok('el gate de Workspace vive en la HERRAMIENTA, no en la sección',
  /const _acc = _wsToolAccess\(key\);/.test(app) &&
  /if \(featureKey && !hasFeature\(featureKey\)\) return \{ ok: false, reason: 'entitlement'/.test(app));
// Sin rama de preview en Workspace, el motivo de la estabilidad del header
// desaparece: sólo se pinta la rejilla real, que SÍ es full-bleed. El invariante
// que queda es que la clase la siga gobernando una sola expresión.
ok('header: el full-bleed depende sólo de la pestaña, y una sola expresión lo gobierna',
  /const _wsFullBleed = \(tab === 'workspace'\);/.test(app) &&
  /classList\.toggle\('workspace-active', _wsFullBleed\)/.test(app));
ok('i18n by lang (ES default)', /typeof lang !== 'undefined' && lang === 'en'/.test(app));
ok('payments untouched (entitlement enforcement still off)', /const ENFORCE_ENTITLEMENTS = false;/.test(app));

console.log('\nFree "Aurix Premium" menu item — intrigue/coming-soon (owner = normal):');
ok('click on menuPremium NO-OPs for Free (no modal, no navigation)',
  /const _premiumUser = hasFeature\('premium\.settings'\);[^\n]*\n\s*if \(!_premiumUser\) \{ e\.preventDefault\(\); return; \}/.test(app));
ok('owner branch still opens the premium modal', /if \(!_premiumUser\) \{ e\.preventDefault\(\); return; \}[\s\S]{0,600}openAurixPremiumModal\(\{ source: 'settings-menu' \}\)/.test(app));
ok('menu identity: Free → menu-item--coming-soon; owner → normal (removed)', /premiumEl\.classList\.add\('menu-item--coming-soon'\)/.test(app) && /premiumEl\.classList\.remove\('menu-item--coming-soon'\)/.test(app));
ok('Free label = ONLY PRÓXIMAMENTE / COMING SOON (never reveals "Aurix Premium")', /premiumEl\.textContent = _en \? 'COMING SOON' : 'PRÓXIMAMENTE';/.test(app));
ok('Free branch does NOT emit "Aurix Premium"', !/premiumEl\.(innerHTML|textContent)[^\n]*Aurix Premium[^\n]*coming soon/i.test(app));
ok('owner branch keeps normal "Aurix Premium" (clickable)', /premiumEl\.textContent = \(typeof t === 'function'\) \? t\('menuPremium'\) : '✨ Aurix Premium';/.test(app));
ok('coming-soon state does NOT read as pay/unlock/denied', !/pagar|\bpay\b|desbloquea|unlock|acceso denegado|access denied/i.test(app.slice(app.indexOf("menu-item--coming-soon'"), app.indexOf("menu-item--coming-soon'") + 500)));
ok('CSS: .menu-item--coming-soon uppercase teaser, not-allowed, cool (not gold pay-now)', /\.menu-item--coming-soon\{[\s\S]{0,320}cursor:not-allowed/.test(css) && /\.menu-item--coming-soon\{[\s\S]{0,320}text-transform:uppercase/.test(css));
ok('CSS: .premium-preview-coming-soon editorial label exists', /\.premium-preview-coming-soon\{/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
