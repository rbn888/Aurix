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
vm.runInContext(fn('hasAurixPremiumAccess'), sb);
vm.runInContext(fn('_aurixPremiumPreviewHTML'), sb);
const has = u => { sb.__u = u; return vm.runInContext('hasAurixPremiumAccess(__u)', sb); };
const previewLang = (s, l) => { sb.lang = l; return vm.runInContext('_aurixPremiumPreviewHTML(' + JSON.stringify(s) + ')', sb); };
const count = (h, re) => (h.match(re) || []).length;

console.log('AURIX-PREMIUM-PREVIEW-OWNER (FINAL POLISH)\n');

console.log('Owner override (authenticated email only):');
ok('owner rbn892@gmail.com → full access', has({ email: 'rbn892@gmail.com' }) === true);
ok('owner email case/space-insensitive', has({ email: '  RBN892@Gmail.com ' }) === true);
ok('other email → NO premium (preview)', has({ email: 'someone@else.com' }) === false);
ok('premium/isPremium/subscriptionActive honored', has({ email: 'x@y.com', premium: true }) === true && has({ email: 'x@y.com', isPremium: true }) === true && has({ email: 'x@y.com', subscriptionActive: true }) === true);
ok('null/undefined/no-email → NO premium', has(null) === false && has(undefined) === false && has({}) === false);
ok('helper depends only on user (no localStorage/global secret)', !/localStorage|sessionStorage|window\.|SECRET|unlock/i.test(fn('hasAurixPremiumAccess')));

function check(section, l, C) {
  const h = previewLang(section, l);
  console.log('\n' + section + ' [' + l + ']:');
  ok('badge = ' + C.badge + ' (NOT "Aurix Premium")', h.indexOf(C.badge) >= 0 && !/Aurix Premium/i.test(h));
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

check('intelligence', 'es', { badge: 'CAPA INTELIGENTE', title: 'Aurix Intelligence se está preparando', subtitle: 'Aurix ya está analizando tu información patrimonial.', text: 'Aunque todavía no veas esta sección completa, Aurix ya está organizando tus datos, calculando tu exposición y preparando una inteligencia personalizada sobre tu cartera.', key: 'Tu análisis no empieza cuando se desbloquea la sección. Empieza desde el primer dato que registras en Aurix.', bullets: ['Salud patrimonial', 'Riesgo y concentración', 'Diversificación', 'Liquidez', 'Drivers de evolución', 'Insights personalizados'], cta: 'Volver al Dashboard' });
check('workspace', 'es', { badge: 'ESPACIO DE TRABAJO', title: 'Aurix Workspace se está preparando', subtitle: 'Tus futuras herramientas patrimoniales estarán conectadas a tu cartera real.', text: 'Aurix está preparando un espacio donde podrás planificar, simular escenarios y trabajar con tu patrimonio desde una única plataforma.', key: 'Workspace no será una zona aislada. Estará conectado a tu patrimonio real, tus activos y tu evolución.', bullets: ['Planificación patrimonial', 'Calculadoras financieras', 'Simuladores', 'Objetivos', 'Escenarios', 'Herramientas avanzadas'], cta: 'Volver al Dashboard' });
check('intelligence', 'en', { badge: 'INTELLIGENCE LAYER', title: 'Aurix Intelligence is getting ready', subtitle: 'Aurix is already analyzing your wealth information.', text: "Even though you can't see this section in full yet, Aurix is already organizing your data, calculating your exposure and preparing personalized intelligence about your portfolio.", key: "Your analysis doesn't start when the section unlocks. It starts with the first piece of data you record in Aurix.", bullets: ['Portfolio Health', 'Risk and concentration', 'Diversification', 'Liquidity', 'Wealth drivers', 'Personalized insights'], cta: 'Back to Dashboard' });
check('workspace', 'en', { badge: 'WEALTH WORKSPACE', title: 'Aurix Workspace is getting ready', subtitle: 'Your future wealth tools will be connected to your real portfolio.', text: 'Aurix is preparing a space where you will be able to plan, simulate scenarios and work with your wealth from a single platform.', key: "Workspace won't be an isolated area. It will be connected to your real wealth, your assets and your evolution.", bullets: ['Wealth planning', 'Financial calculators', 'Simulators', 'Goals', 'Scenarios', 'Advanced tools'], cta: 'Back to Dashboard' });

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
ok('renderIntelligenceTab returns preview when NOT premium', /if \(!hasAurixPremiumAccess\(_aurixCurrentAuthUser\(\)\)\) return _aurixPremiumPreviewHTML\('intelligence'\);/.test(app));
ok('renderWorkspace shows preview when NOT premium', /!hasAurixPremiumAccess\(_aurixCurrentAuthUser\(\)\)\) \{[\s\S]{0,140}_aurixPremiumPreviewHTML\('workspace'\)/.test(app));
ok('header stability: workspace preview does NOT go full-bleed (no logo shift)', /const _wsFullBleed = \(tab === 'workspace'\) && !\(typeof hasAurixPremiumAccess === 'function' && !hasAurixPremiumAccess\(_aurixCurrentAuthUser\(\)\)\);/.test(app) && /classList\.toggle\('workspace-active', _wsFullBleed\)/.test(app));
ok('i18n by lang (ES default)', /typeof lang !== 'undefined' && lang === 'en'/.test(app));
ok('payments untouched (entitlement enforcement still off)', /const ENFORCE_ENTITLEMENTS = false;/.test(app));

console.log('\nFree "Aurix Premium" menu item — intrigue/coming-soon (owner = normal):');
ok('click on menuPremium NO-OPs for Free (no modal, no navigation)', /const _premiumUser = \(typeof hasAurixPremiumAccess === 'function'\) && hasAurixPremiumAccess\(_aurixCurrentAuthUser\(\)\);\s*if \(!_premiumUser\) \{ e\.preventDefault\(\); return; \}/.test(app));
ok('owner branch still opens the premium modal', /if \(!_premiumUser\) \{ e\.preventDefault\(\); return; \}[\s\S]{0,600}openAurixPremiumModal\(\{ source: 'settings-menu' \}\)/.test(app));
ok('menu identity: Free → menu-item--premium-locked; owner → normal', /premiumEl\.classList\.add\('menu-item--premium-locked'\)/.test(app) && /premiumEl\.classList\.remove\('menu-item--premium-locked'\)/.test(app));
ok('Free label = "Aurix Premium" + discreet próximamente/coming soon (i18n)', /Aurix Premium <span class="menu-premium-soon">' \+ \(_en \? 'coming soon' : 'próximamente'\)/.test(app));
ok('locked state does NOT read as pay/unlock/denied', !/pagar|\bpay\b|desbloquea|unlock|acceso denegado|access denied/i.test(app.slice(app.indexOf("menu-item--premium-locked'"), app.indexOf("menu-item--premium-locked'") + 400)));
ok('CSS: .menu-item--premium-locked blurred + not-allowed + subtle golden', /\.menu-item--premium-locked\{[\s\S]{0,220}cursor:not-allowed/.test(css) && /\.menu-item--premium-locked\{[\s\S]{0,220}filter:blur/.test(css));
ok('CSS: .menu-premium-soon discreet label exists', /\.menu-premium-soon\{/.test(css));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
