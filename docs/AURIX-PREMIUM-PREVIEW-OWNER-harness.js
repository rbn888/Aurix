'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-PREMIUM-PREVIEW-OWNER-harness — launch previews (V2 polish) + owner override
// ════════════════════════════════════════════════════════════════════════════
// Owner (rbn892@gmail.com, authenticated email) → full access; else → premium preview. V2: premium hero
// card, section badges (no "Aurix Premium"), orb, mini-card bullets, electric CTA, i18n ES/EN, header
// stability (workspace preview does NOT go full-bleed). No price / Founder / "blocked" / "access denied".
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
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

console.log('AURIX-PREMIUM-PREVIEW-OWNER (V2)\n');

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
  C.bullets.forEach(b => ok('bullet: ' + b, h.indexOf('>' + b + '</li>') >= 0 || h.indexOf(b) >= 0));
  ok('CTA ' + C.cta + ' → switchTab(home)', h.indexOf('>' + C.cta + '</button>') >= 0 && /switchTab\('home'\)/.test(h));
  ok('premium structure: card + orb + mini-card bullets + electric CTA + bg', /apx-card/.test(h) && /apx-orb/.test(h) && /apx-bullet/.test(h) && /apx-cta/.test(h) && /radial-gradient/.test(h));
  ok('no price/Founder/blocked/denied', !/[€$]|precio|\bprice\b|founder|acceso denegado|bloquead|access denied|\blocked\b/i.test(h));
}

check('intelligence', 'es', { badge: 'CAPA INTELIGENTE', title: 'Aurix Intelligence se está preparando', subtitle: 'Aurix ya está analizando tu información patrimonial.', text: 'Aunque todavía no veas esta sección completa, Aurix ya está organizando tus datos, calculando tu exposición y preparando una inteligencia personalizada sobre tu cartera.', key: 'Tu análisis no empieza cuando se desbloquea la sección. Empieza desde el primer dato que registras en Aurix.', bullets: ['Salud patrimonial', 'Riesgo y concentración', 'Diversificación', 'Liquidez', 'Drivers de evolución', 'Timeline patrimonial', 'Insights personalizados'], cta: 'Volver al Dashboard' });
check('workspace', 'es', { badge: 'ESPACIO DE TRABAJO', title: 'Aurix Workspace se está preparando', subtitle: 'Tus futuras herramientas patrimoniales estarán conectadas a tu cartera real.', text: 'Aurix está preparando un espacio donde podrás planificar, simular escenarios y trabajar con tu patrimonio desde una única plataforma.', key: 'Workspace no será una zona aislada. Estará conectado a tu patrimonio real, tus activos y tu evolución.', bullets: ['Planificación patrimonial', 'Calculadoras financieras', 'Simuladores', 'Objetivos', 'Escenarios', 'Herramientas avanzadas'], cta: 'Volver al Dashboard' });
check('intelligence', 'en', { badge: 'INTELLIGENCE LAYER', title: 'Aurix Intelligence is getting ready', subtitle: 'Aurix is already analyzing your wealth information.', text: "Even though you can't see this section in full yet, Aurix is already organizing your data, calculating your exposure and preparing personalized intelligence about your portfolio.", key: "Your analysis doesn't start when the section unlocks. It starts with the first piece of data you record in Aurix.", bullets: ['Portfolio Health', 'Risk and concentration', 'Diversification', 'Liquidity', 'Wealth drivers', 'Wealth timeline', 'Personalized insights'], cta: 'Back to Dashboard' });
check('workspace', 'en', { badge: 'WEALTH WORKSPACE', title: 'Aurix Workspace is getting ready', subtitle: 'Your future wealth tools will be connected to your real portfolio.', text: 'Aurix is preparing a space where you will be able to plan, simulate scenarios and work with your wealth from a single platform.', key: "Workspace won't be an isolated area. It will be connected to your real wealth, your assets and your evolution.", bullets: ['Wealth planning', 'Financial calculators', 'Simulators', 'Goals', 'Scenarios', 'Advanced tools'], cta: 'Back to Dashboard' });

console.log('\nShared layout + i18n isolation:');
{ const esI = previewLang('intelligence', 'es'), enI = previewLang('intelligence', 'en'), esW = previewLang('workspace', 'es');
  ok('Intelligence & Workspace share the same component classes (identical layout)', /apx-card/.test(esI) && /apx-card/.test(esW) && /apx-wrap/.test(esI) && /apx-wrap/.test(esW));
  ok('reduced-motion + responsive present', /prefers-reduced-motion/.test(esI) && /max-width:640px/.test(esI));
  ok('EN carries no Spanish leak', !/se está preparando|Volver al Dashboard|Salud patrimonial|CAPA INTELIGENTE/.test(enI)); }

console.log('\nGates + owner + header stability (source):');
ok('renderIntelligenceTab returns preview when NOT premium', /if \(!hasAurixPremiumAccess\(_aurixCurrentAuthUser\(\)\)\) return _aurixPremiumPreviewHTML\('intelligence'\);/.test(app));
ok('renderWorkspace shows preview when NOT premium', /!hasAurixPremiumAccess\(_aurixCurrentAuthUser\(\)\)\) \{[\s\S]{0,140}_aurixPremiumPreviewHTML\('workspace'\)/.test(app));
ok('header stability: workspace preview does NOT go full-bleed (no logo shift)', /const _wsFullBleed = \(tab === 'workspace'\) && !\(typeof hasAurixPremiumAccess === 'function' && !hasAurixPremiumAccess\(_aurixCurrentAuthUser\(\)\)\);/.test(app) && /classList\.toggle\('workspace-active', _wsFullBleed\)/.test(app));
ok('i18n by lang (ES default)', /typeof lang !== 'undefined' && lang === 'en'/.test(app));
ok('payments untouched (entitlement enforcement still off)', /const ENFORCE_ENTITLEMENTS = false;/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
