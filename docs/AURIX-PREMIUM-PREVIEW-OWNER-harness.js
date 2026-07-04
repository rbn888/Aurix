'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-PREMIUM-PREVIEW-OWNER-harness — Launch-1 preview gates + owner premium override
// ════════════════════════════════════════════════════════════════════════════
// Owner (rbn892@gmail.com, by AUTHENTICATED email) → full access; everyone else → premium preview for
// Intelligence + Workspace. No price / Founder / "blocked" / "access denied". Corrected copy. No console-
// forgeable global secret / localStorage unlock (helper depends on the user's email).
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
const preview = s => { sb.lang = 'es'; return vm.runInContext('_aurixPremiumPreviewHTML(' + JSON.stringify(s) + ')', sb); };   // default ES
const previewLang = (s, l) => { sb.lang = l; return vm.runInContext('_aurixPremiumPreviewHTML(' + JSON.stringify(s) + ')', sb); };

console.log('AURIX-PREMIUM-PREVIEW-OWNER\n');

console.log('Owner override (authenticated email only):');
ok('owner rbn892@gmail.com → full access', has({ email: 'rbn892@gmail.com' }) === true);
ok('owner email is case/space-insensitive', has({ email: '  RBN892@Gmail.com ' }) === true);
ok('other email → NO premium (preview)', has({ email: 'someone@else.com' }) === false);
ok('other email with premium flag → premium', has({ email: 'x@y.com', premium: true }) === true);
ok('isPremium / subscriptionActive honored', has({ email: 'x@y.com', isPremium: true }) === true && has({ email: 'x@y.com', subscriptionActive: true }) === true);
ok('null / undefined / no-email → NO premium (safe default)', has(null) === false && has(undefined) === false && has({}) === false);

console.log('\nNo console-forgeable secret / localStorage unlock:');
ok('helper depends ONLY on user.email/flags (no localStorage / global code / secret string)',
  !/localStorage|sessionStorage|window\.|AURIX_[A-Z_]*SECRET|unlock/i.test(fn('hasAurixPremiumAccess')));

console.log('\nIntelligence preview copy (corrected):');
{ const h = preview('intelligence');
  ok('title', /Aurix Intelligence se está preparando/.test(h));
  ok('subtitle', /Aurix ya está analizando tu información patrimonial\./.test(h));
  ok('body text', /ya está organizando tus datos, calculando tu exposición/.test(h));
  ok('key corrected message present', /Aurix ya está procesando tu información patrimonial y preparando tus futuras áreas Premium\./.test(h));
  ['Salud patrimonial', 'Concentración y diversificación', 'Liquidez', 'Riesgos detectados', 'Drivers de evolución', 'Timeline patrimonial', 'Insights personalizados'].forEach(b => ok('bullet: ' + b, h.indexOf(b) >= 0));
  ok('CTA Volver al Dashboard → switchTab(home)', /Volver al Dashboard/.test(h) && /switchTab\('home'\)/.test(h)); }

console.log('\nWorkspace preview copy:');
{ const h = preview('workspace');
  ok('title', /Aurix Workspace se está preparando/.test(h));
  ok('subtitle', /Tus futuras herramientas patrimoniales estarán conectadas a tu cartera real\./.test(h));
  ok('body text', /planificar, simular escenarios y trabajar con tu patrimonio/.test(h));
  ['Planificación patrimonial', 'Calculadoras financieras', 'Simuladores', 'Objetivos', 'Escenarios', 'Herramientas avanzadas'].forEach(b => ok('bullet: ' + b, h.indexOf(b) >= 0));
  ok('CTA Volver al Dashboard', /Volver al Dashboard/.test(h)); }

console.log('\nForbidden content NOT present (no price/Founder/blocked/denied/old copy):');
{ const both = preview('intelligence') + preview('workspace') + fn('_aurixPremiumPreviewHTML');
  ok('no price/€/$ ', !/[€$]|precio|\bprice\b|\/mes|\/month/i.test(both));
  ok('no Founder', !/founder/i.test(both));
  ok('no "acceso denegado" / "bloqueado" / "access denied" / "locked"', !/acceso denegado|bloquead|access denied|\blocked\b/i.test(both));
  ok('the OLD (wrong) copy is gone', !/más precisa será tu inteligencia|Cuanto más patrimonio/i.test(both)); }

console.log('\ni18n — EN preview follows the chosen language (lang="en"):');
{ const hi = previewLang('intelligence', 'en');
  ok('EN intelligence title', /Aurix Intelligence is getting ready/.test(hi));
  ok('EN intelligence subtitle', /Aurix is already analyzing your wealth information\./.test(hi));
  ok('EN intelligence text', /organizing your data, calculating your exposure/.test(hi));
  ok('EN key message', /Aurix is already processing your wealth information and preparing your future Premium areas\./.test(hi));
  ['Portfolio Health', 'Concentration and diversification', 'Liquidity', 'Detected risks', 'Wealth drivers', 'Wealth timeline', 'Personalized insights'].forEach(b => ok('EN intel bullet: ' + b, hi.indexOf(b) >= 0));
  ok('EN CTA Back to Dashboard', /Back to Dashboard/.test(hi));
  const hw = previewLang('workspace', 'en');
  ok('EN workspace title', /Aurix Workspace is getting ready/.test(hw));
  ok('EN workspace subtitle', /Your future wealth tools will be connected to your real portfolio\./.test(hw));
  ok('EN workspace text', /plan, simulate scenarios and work with your wealth from a single platform/.test(hw));
  ['Wealth planning', 'Financial calculators', 'Simulators', 'Goals', 'Scenarios', 'Advanced tools'].forEach(b => ok('EN ws bullet: ' + b, hw.indexOf(b) >= 0));
  ok('EN preview has NO Spanish copy leaking', !/se está preparando|Volver al Dashboard|Salud patrimonial|Planificación patrimonial/.test(hi + hw)); }
{ // ES still intact (default + explicit)
  const es = previewLang('intelligence', 'es');
  ok('ES still correct when lang=es (title + CTA + key message)', /Aurix Intelligence se está preparando/.test(es) && /Volver al Dashboard/.test(es) && /preparando tus futuras áreas Premium/.test(es)); }

console.log('\nGate wiring (source):');
ok('preview follows chosen language (reads lang, ES default)', /typeof lang !== 'undefined' && lang === 'en'/.test(app) && /const dict = EN \? COPY\.en : COPY\.es;/.test(app));
ok('renderIntelligenceTab returns preview when NOT premium', /if \(!hasAurixPremiumAccess\(_aurixCurrentAuthUser\(\)\)\) return _aurixPremiumPreviewHTML\('intelligence'\);/.test(app));
ok('renderWorkspace shows preview when NOT premium', /!hasAurixPremiumAccess\(_aurixCurrentAuthUser\(\)\)\) \{[\s\S]{0,120}_aurixPremiumPreviewHTML\('workspace'\)/.test(app));
ok('reads the authenticated user (currentUser), not a flag', /function _aurixCurrentAuthUser\(\)[\s\S]{0,120}currentUser/.test(app));
ok('did NOT enable global entitlement enforcement (payments untouched)', /const ENFORCE_ENTITLEMENTS = false;/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
