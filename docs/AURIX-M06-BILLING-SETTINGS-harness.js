'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-M06-BILLING-SETTINGS — bloques 12 y 13 de M.06
// ════════════════════════════════════════════════════════════════════════════
// M.04 ya está certificado E2E y es GO. Este gate NO lo repite: pregunta otra cosa —
// después de todos los cambios de M.06, ¿la experiencia de cuenta, membresía y billing
// sigue siendo coherente y honesta? Es decir, audita los CONSUMIDORES, no el motor.
//
// Se EJECUTA la máquina de estados de presentación del entitlement sobre los nueve
// regímenes del SPEC (Free, mensual, anual, cancelación programada, past_due, canceled,
// catálogo caído, cargando, error) y se comprueba qué afirma cada superficie.
//
// LO QUE ESTE BLOQUE CORRIGE: «Exportar datos» pintaba su subtítulo con
// `settingsImportSub`, la clave de OTRA acción. El texto renderizado era correcto en los
// dos idiomas —así que no había defecto visible— pero el día que Importar se habilite y
// su subtítulo cambie, el de Exportar cambiaría CON ella, en silencio. Clave neutra propia.
//
// LO QUE ESTE BLOQUE DOCUMENTA Y NO TOCA: con `cancel_at_period_end`, la tarjeta dice
// «Tu plan Premium está activo · cancela cuando quieras» a alguien que YA canceló. El
// acceso es correcto (se conserva hasta el final del periodo, que es el contrato
// certificado) pero el matiz falta. Y falta porque **el cliente no tiene la señal**: el
// escritor de M.04 SÍ guarda `cancel_at_period_end` en la tabla de suscripción, pero el
// resolutor de entitlements sólo expone `valid_until`, que está puesto para CUALQUIER
// entitlement premium y por tanto no permite distinguir «renueva» de «termina». Exponerlo
// es tocar el RPC de M.04, y el SPEC lo prohíbe sin evidencia de regresión: queda como
// residual con su owner exacto. STOP en esa subparte.
//
// NO se re-audita lo certificado en otro gate (CLAUDE.md §6): resolutor de entitlements
// (AURIX-MONETIZATION-ENTITLEMENT-RESOLVER, 107), billing M.04 (AURIX-M04-BILLING-STRIPE,
// 156), verdad comercial B1 (AURIX-MONETIZATION-COMMERCIAL-TRUTH, 149), intent de producto
// (150), Account Center i18n (AURIX-ACCOUNT-CENTER, 48) y la retirada del escaparate
// legacy (AURIX-M06-INTELLIGENCE-WORKSPACE-PREMIUM, 44).
const fs = require('fs'), vm = require('vm'), path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(root, f), 'utf8');
const app = R('app.js'), idx = R('index.html');
const bare = s => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*(\/\/|<!--)/.test(l)).join('\n');
const appB = bare(app), idxB = bare(idx);
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n, src) { src = src || app; const i = src.indexOf('function ' + n + '('); if (i < 0) throw new Error('falta fn ' + n); return braceSlice(src, i); }
function konstSrc(n) { const m = new RegExp('const ' + n + '\\s*=\\s*').exec(app); if (!m) throw new Error('falta const ' + n); const i = m.index, eq = m.index + m[0].length; if (app[eq] === '{' || app[eq] === '[') { const b = braceSlice(eq); return app.slice(i, app.indexOf(';', eq + b.length) + 1); } return app.slice(i, app.indexOf(';', eq) + 1); }

let pass = 0, fail = 0; const failed = [];
function ok(n, c, info) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; failed.push(n); console.log('  ✗ ' + n + (info !== undefined ? '  →  ' + info : '')); } }
function section(t) { console.log('\n' + t); }

// ── Los consumidores REALES de presentación, ejecutándose ──────────────────
const ctx = { console: { log() {}, warn() {} }, Object, String, Number, Date, Array, isFinite,
  t: k => k, IS_DEV: false, document: { getElementById: () => null } };
vm.createContext(ctx);
vm.runInContext([
  // El conjunto canónico de claves se DERIVA del catálogo desde la SPEC de cierre
  // (era un literal de cuatro claves y las cinco capacidades publicadas se caían en
  // silencio), así que sus dos fuentes tienen que entrar ANTES que él.
  konstSrc('_WS_CATALOG'), konstSrc('_AURIX_ENT_CANON_EXTRA'),
  konstSrc('_AURIX_ENT_CANON'), konstSrc('_AURIX_ENT_TTL_MS'),
  "let _aurixEnt = { loaded:false, loading:false, error:null, plan:'free', status:'none', source:'default', validUntil:null, features:Object.create(null), sources:Object.create(null), fetchedAt:0 };",
  fnSrc('hasFeature'), fnSrc('_aurixEntLoaded'), fnSrc('_aurixMenuTier'),
  // `getPlan`/`planStatus` NO entran: leen el plan LOCAL (`aurix_plan`), que ningún
  // servidor escribe. `planStatus()` además no tiene ni un llamador (se asserta en B.3b),
  // así que el estado local no puede filtrarse a una decisión comercial.
  fnSrc('planTierName'), fnSrc('isPremiumTier'),
].join('\n'), ctx);
const G = n => vm.runInContext(n, ctx);
// Pone el estado del entitlement tal y como lo dejaría una lectura del servidor.
function setEnt(o) {
  const feats = Object.create(null);
  G('_AURIX_ENT_CANON').forEach(k => { feats[k] = !!(o.features && o.features[k]); });
  ctx.__e = Object.assign({ loaded: true, loading: false, error: null, plan: 'free', status: 'none',
    source: 'rpc', validUntil: null, features: feats, sources: Object.create(null), fetchedAt: Date.now() }, o, { features: feats });
  vm.runInContext('_aurixEnt = globalThis.__e;', ctx);
}
const PREM = { 'workspace.loan': true, 'intelligence.full': true, 'premium.settings': true };
const view = () => ({ tier: G('_aurixMenuTier')(), badge: G('_aurixMenuTier')() === 'premium' ? 'PREMIUM' : 'FREE',
  loan: G('hasFeature')('workspace.loan'), intel: G('hasFeature')('intelligence.full'),
  manage: G('hasFeature')('premium.settings'), status: G('_aurixEnt').status });

console.log('\nAURIX-M06-BILLING-SETTINGS — bloques 12 y 13 de M.06');

// ══════════════════════════════════════════════════════════════════════════
section('A — los nueve estados de membresía, ejecutados:');
// ══════════════════════════════════════════════════════════════════════════
{
  setEnt({ plan: 'free', status: 'none', features: {} });
  let v = view();
  ok('A.1 Free: badge FREE y ninguna capacidad premium', v.badge === 'FREE' && !v.loan && !v.intel && !v.manage, JSON.stringify(v));

  setEnt({ plan: 'premium', status: 'active', features: PREM, validUntil: '2026-10-13T00:00:00Z' });
  v = view();
  ok('A.2 Premium mensual activo: badge PREMIUM y las tres capacidades', v.badge === 'PREMIUM' && v.loan && v.intel && v.manage, JSON.stringify(v));
  ok('A.3 Premium anual activo: idéntico (el intervalo no cambia el acceso)',
     (() => { setEnt({ plan: 'premium', status: 'active', features: PREM, validUntil: '2027-09-13T00:00:00Z' }); const w = view(); return w.badge === 'PREMIUM' && w.loan && w.manage; })());

  // D · cancelación programada: el acceso se CONSERVA (contrato certificado en M.04).
  setEnt({ plan: 'premium', status: 'active', features: PREM, validUntil: '2026-10-13T00:00:00Z' });
  v = view();
  ok('A.4 cancelación programada: sigue Premium durante el periodo pagado (cero pérdida falsa)',
     v.badge === 'PREMIUM' && v.loan && v.manage);
  ok('A.4b RESIDUAL DECLARADO · el cliente no puede distinguir «renueva» de «termina»',
     !/cancel_at_period_end/.test(appB) && /valid_until/.test(app) &&
     /cancel_at_period_end/.test(R('db/monetization_m04_billing_stripe_1.sql')) &&
     !/cancel_at_period_end/.test(R('db/monetization_entitlement_resolver_1.sql')),
     'la señal existe en la tabla de M.04 y NO en el resolutor: exponerla es tocar el RPC');

  setEnt({ plan: 'premium', status: 'past_due', features: {} });
  v = view();
  ok('A.5 past_due: el acceso ya NO se concede y el estado se conserva para el portal',
     !v.loan && !v.intel && v.status === 'past_due', JSON.stringify(v));
  setEnt({ plan: 'free', status: 'canceled', features: {} });
  v = view();
  ok('A.6 canceled: Free, sin capacidades, con su estado', v.badge === 'FREE' && !v.loan && v.status === 'canceled');

  // H · cargando e I · error de primera lectura ⇒ FAIL CLOSED.
  vm.runInContext("_aurixEnt = { loaded:false, loading:true, error:null, plan:'free', status:'none', source:'default', validUntil:null, features:Object.create(null), sources:Object.create(null), fetchedAt:0 };", ctx);
  v = view();
  ok('A.7 cargando: nada se afirma (fail-closed), ni premium ni capacidades', v.badge === 'FREE' && !v.loan && !v.intel);
  vm.runInContext("_aurixEnt = { loaded:false, loading:false, error:'network', plan:'free', status:'none', source:'default', validUntil:null, features:Object.create(null), sources:Object.create(null), fetchedAt:0 };", ctx);
  ok('A.8 error de PRIMERA lectura: fail-closed, nunca premium sin evidencia', !view().loan && view().badge === 'FREE');
  // …pero un fallo de TRANSPORTE tras una lectura buena NO degrada a un cliente que pagó.
  setEnt({ plan: 'premium', status: 'active', features: PREM });
  vm.runInContext("_aurixEnt.error = 'network'; _aurixEnt.fetchedAt = 0;", ctx);
  v = view();
  ok('A.9 revalidación fallida con lectura previa: se CONSERVA el premium (no lo degrada la cobertura)',
     v.badge === 'PREMIUM' && v.loan && v.manage, JSON.stringify(v));
  ok('A.9b y ese contrato está en el owner, distinguiendo «no lo sé» de «lo supe y no pude refrescarlo»',
     /if \(_aurixEnt\.loaded\) \{[\s\S]{0,900}_aurixEnt\.error = msg;[\s\S]{0,200}_aurixEnt\.fetchedAt = 0;/.test(app) &&
     /_aurixEntReset\(msg\)/.test(app));
  // G · catálogo caído: no se inventa precio (owner del paywall).
  ok('A.10 catálogo caído: se dice que aún no se puede comprar, sin adivinar importe',
     /pw_unavailable/.test(fnSrc('_buildHtml')) && !/7[,.]99|59[,.]99/.test(appB));
}

// ══════════════════════════════════════════════════════════════════════════
section('B — la autoridad: acceso del servidor, precio del catálogo:');
// ══════════════════════════════════════════════════════════════════════════
{
  ok('B.1 el tier que se MUESTRA sale del entitlement, no de `aurix_plan`',
     /const _entTier = \(typeof _aurixMenuTier === 'function'\) \? _aurixMenuTier\(\) : 'free';/.test(app) &&
     !/plan\s*=\s*getPlan\(\)/.test(bare(fnSrc('_settingsPopulate'))));
  ok('B.2 `_aurixMenuTier` falla cerrado y sólo devuelve lo que el servidor dijo',
     /if \(!_aurixEntLoaded\(\)\) return 'free';/.test(fnSrc('_aurixMenuTier')) &&
     /_aurixEnt\.plan === 'premium'/.test(fnSrc('_aurixMenuTier')));
  ok('B.3 `getPlan()` sigue existiendo para el backup local y NO decide nada comercial',
     /function getPlan\(/.test(app) && !/getPlan\(\)/.test(bare(fnSrc('_aurixMenuTier'))) &&
     !/getPlan\(\)/.test(bare(fnSrc('hasFeature'))));
  ok('B.3b el estado LOCAL del plan no tiene ni un consumidor (no puede filtrarse)',
     (appB.match(/planStatus\(\)/g) || []).length === 1,
     'planStatus() sólo debe aparecer en su propia definición');
  ok('B.4 sólo se aceptan las claves canónicas y sólo el booleano estricto `true`',
     /feats\[k\] = row\.features\[k\] === true;/.test(app) &&
     // Los valores se escriben CRUDOS (sin la coerción del helper): es `hasFeature` quien
     // tiene que rechazar un "true" de texto, un 1 o un objeto.
     ["true", 1, {}, [], "yes"].every(v => {
       ctx.__f = Object.create(null); ctx.__f['workspace.loan'] = v;
       vm.runInContext("_aurixEnt = { loaded:true, loading:false, error:null, plan:'premium', status:'active', source:'rpc', validUntil:null, features:globalThis.__f, sources:Object.create(null), fetchedAt:Date.now() };", ctx);
       return G('hasFeature')('workspace.loan') === false;
     }));
  ok('B.5 una clave inventada no concede nada',
     (() => { setEnt({ plan: 'premium', status: 'active', features: PREM }); return G('hasFeature')('workspace.inventada') === false; })());
  ok('B.6 y el acceso se revalida al volver al foco y al refrescar el token',
     /_aurixEntRevalidate/.test(app) && /TOKEN_REFRESHED/.test(app) && /visibilitychange/.test(app));
  ok('B.7 el badge se REPINTA cuando el entitlement aterriza (el FREE inicial no se queda)',
     (app.match(/_aurixRenderMenuIdentity\(\)/g) || []).length >= 4);
}

// ══════════════════════════════════════════════════════════════════════════
section('C — consumidores de checkout y portal:');
// ══════════════════════════════════════════════════════════════════════════
{
  ok('C.1 Free → paywall → intervalo → UN solo owner de checkout',
     (appB.match(/_aurixBillingCheckout\(/g) || []).length >= 1 &&
     /data-premium-buy="\$\{esc\(row\.billing_interval\)\}"/.test(app));
  ok('C.2 cliente → GESTIONAR → UN solo owner de portal',
     /data-premium-portal/.test(app) && /_aurixBillingPortal/.test(app));
  ok('C.3 el checkout registra la intención con su intervalo y su origen',
     /_aurixRecordUpgradeIntent\('checkout:' \+ iv, source \|\| 'paywall'\)/.test(app));
  ok('C.4 el CTA se bloquea durante el viaje (sin segunda sesión de checkout)',
     /function _ctaBusy/.test(app) && /disabled = true/.test(fnSrc('_ctaBusy')));
  ok('C.5 quien ya paga NO recibe una compra absurda: ve gestionar',
     /const managed = /.test(fnSrc('_buildHtml')) && /pw_manage/.test(fnSrc('_buildHtml')));
  ok('C.6 sin URL del proveedor no se finge nada (fail-closed en el consumidor)',
     /checkout/.test(app) && /catch/.test(fnSrc('_aurixBillingCheckout')));
  ok('C.7 los secretos de Stripe NO están en el cliente',
     !/sk_live|sk_test|whsec_/.test(app) && !/sk_live|sk_test|whsec_/.test(idx));
  // El patrón corto chocaba con claves i18n legítimas (`intcc_sub_healthy`). Se ancla a la
  // forma REAL de un identificador de Stripe: 14+ caracteres alfanuméricos mezclados.
  ok('C.8 ni identificadores de cliente de facturación en el bundle',
     !/\bcus_[A-Za-z0-9]{14,}\b/.test(app) && !/\bsub_[A-Za-z0-9]{14,}\b/.test(app) &&
     !/\bprice_[A-Za-z0-9]{14,}\b/.test(app) && !/\bcs_(test|live)_[A-Za-z0-9]{10,}\b/.test(app));
}

// ══════════════════════════════════════════════════════════════════════════
section('D — aislamiento entre cuentas en la superficie comercial:');
// ══════════════════════════════════════════════════════════════════════════
{
  // A (free) → B (premium) → A (free): la presentación la decide SIEMPRE la última
  // lectura del servidor, así que no hay nada que heredar.
  setEnt({ plan: 'free', status: 'none', features: {} });
  const a1 = view();
  setEnt({ plan: 'premium', status: 'active', features: PREM });
  const b = view();
  setEnt({ plan: 'free', status: 'none', features: {} });
  const a2 = view();
  ok('D.1 A(free) → B(premium) → A(free): A no hereda el badge ni las capacidades de B',
     a1.badge === 'FREE' && b.badge === 'PREMIUM' && a2.badge === 'FREE' && !a2.loan && !a2.manage,
     JSON.stringify([a1.badge, b.badge, a2.badge]));
  ok('D.2 el estado del entitlement se REINICIA en el cambio de usuario',
     /_aurixEntReset/.test(app) && /_aurixEnt = \{/.test(fnSrc('_aurixEntReset')));
  ok('D.3 y el plan local viaja en las claves que la purga ya cubre',
     (() => { const pk = app.slice(app.indexOf('const PORTFOLIO_KEYS = ['), app.indexOf('];', app.indexOf('const PORTFOLIO_KEYS = [')));
       const us = app.slice(app.indexOf('const USER_SCOPED_LOCAL_KEYS = ['), app.indexOf('];', app.indexOf('const USER_SCOPED_LOCAL_KEYS = [')));
       return /aurix_subscription_updated_at/.test(us) || /aurix_subscription_updated_at/.test(pk); })());
}

// ══════════════════════════════════════════════════════════════════════════
section('E — Notificaciones / Exportar / Importar: verdad de producto:');
// ══════════════════════════════════════════════════════════════════════════
{
  ok('E.1 Notificaciones NO es un cartel: es una lista con estado vacío honesto',
     /id="acNotificationsList"/.test(idx) && /data-i18n="acNoNotifications"/.test(idx) &&
     /data-i18n="acSoon"/.test(idx));
  ok('E.2 Exportar e Importar están DESHABILITADOS en el markup (no sólo en apariencia)',
     /id="settingsExportBtn" disabled/.test(idx) && /id="settingsImportBtn" disabled/.test(idx));
  ok('E.3 y el handler es además un no-op explícito: ningún flujo puede correr',
     /#settingsExportBtn'\)\) \{[\s\S]{0,600}return;\s*\n\s*\}/.test(app) &&
     !/exportPortfolioBackup\(\);/.test(appB));
  ok('E.4 no parecen navegables: el chevron se oculta en estado deshabilitado',
     /\.settings-action\[disabled\] \.settings-action-chevron \{ display: none; \}/.test(R('styles.css')) &&
     /\.settings-action\[disabled\] \{ opacity: 0\.5; cursor: not-allowed; \}/.test(R('styles.css')));
  ok('E.5 [P1 CERRADO] cada subtítulo usa su PROPIA clave neutra, no la de otra acción',
     (idx.match(/data-i18n="settingsComingSoon"/g) || []).length === 2 &&
     !/settings-action-sub" data-i18n="settingsImportSub"/.test(idx));
  ok('E.5b y la clave neutra existe en los DOS idiomas',
     (app.match(/settingsComingSoon:\s*'/g) || []).length === 2);
  ok('E.6 ninguno se presenta como capacidad Premium actual',
     !/data-premium-cta[^>]*settingsExportBtn|settingsExportBtn[^>]*data-premium-cta/.test(idx) &&
     !/settingsImportBtn[^>]*premium/.test(idx));
  ok('E.7 NO-VACUIDAD · antes los dos subtítulos compartían la clave de Importar', (() => {
    let prev = '';
    try { prev = execFileSync('git', ['show', 'HEAD:index.html'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch (_) { return false; }
    if (/settingsComingSoon/.test(prev)) return true;   // ya entregado
    return (prev.match(/data-i18n="settingsImportSub"/g) || []).length === 2;
  })());
}

// ══════════════════════════════════════════════════════════════════════════
section('F — cero rutas comerciales legacy reintroducidas:');
// ══════════════════════════════════════════════════════════════════════════
{
  ok('F.1 sin página Founder, sin precio legacy y sin su clave i18n',
     !/founderOverlay/.test(idx) && !/14[,.]99/.test(idxB) && !/settingsFounderPrice/.test(app));
  ok('F.2 sin promos de cliente ni escritor de tier expuesto',
     !/PROMO_CODES\s*=/.test(appB) && !/applyPromoCode/.test(appB.replace(/aurixEntitlements\.applyPromoCode/g, '')) &&
     !/setPlanTier: setPlanTier/.test(appB));
  ok('F.3 sin interruptor local de entitlements', !/const ENFORCE_ENTITLEMENTS\s*=/.test(appB));
  ok('F.4 Membresía y paywall cuentan la MISMA historia: un solo modal con precios',
     /planFounderCta/.test(idx) && /openAurixPremiumModal/.test(app) &&
     (app.match(/openAurixPremiumModal\(\{ source:/g) || []).length >= 4);
  ok('F.5 ninguna query ni clave local concede premium',
     !/[?&](premium|tier|unlock|founder)=/.test(appB));
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + `  ${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
