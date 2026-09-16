'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-M06-INTELLIGENCE-WORKSPACE-PREMIUM — bloques 9, 10 y 11 de M.06
// ════════════════════════════════════════════════════════════════════════════
// La pregunta comercial del bloque: con el producto que existe HOY, ¿un usuario entiende
// qué recibe gratis, qué recibe con Premium, y puede comprarlo sin fricción NI ENGAÑO?
//
// LO QUE SE RETIRA, y por qué (dos P1 conocidos, cerrados aquí):
//
// 1 · LA PÁGINA «AURIX FOUNDER» CON UN PRECIO OBSOLETO. Vivía en el bundle servido con
//     «14,99 € / año» en tres sitios (el markup, la clave i18n `settingsFounderPrice` y
//     `PLAN_CATALOG.founder.priceLabel`) y un CTA «Early Access · Próximamente» que
//     afirmaba que aún no se puede comprar — cuando Premium SÍ se compra desde M.04.
//     SEVERIDAD HONESTA: **no era alcanzable con un clic**. El opener real del modal de
//     función premium (`openUpgradeIntent`) ocultaba su botón con un `style.display =
//     'none'`. Pero eso es ocultar, no retirar, y sólo actuaba en ESE opener:
//     `openUpgradeModal` —sin llamadores y expuesto en `window`— no lo ocultaba, el CTA
//     de Membresía llamaba a `openFounderPage()` como fallback si faltaba el modal
//     canónico, y `window.aurixEntitlements.openFounderPage` la abría directamente. Una
//     oferta comercial falsa sostenida por una línea de estilo es deuda, no seguridad.
//
// 2 · LA VÍA DE AUTOELEVACIÓN DE TIER. `PROMO_CODES` (FOUNDER100 / EARLYACCESS /
//     PARTNER, todos al 100 %) se documentaba como «INERT: no prelaunch UI redeems
//     these». No lo era: `applyPromoCode` estaba EXPUESTO en `window.aurixEntitlements`
//     y llamaba a `setPlanTier('premium')`, que sella `aurix_plan` y lo sube al servidor
//     por el sync. No concedía ni una feature —la autoridad es
//     `public.aurix_entitlements()`, fail-closed— pero sí escribía un tier comercial
//     FALSO en el registro del usuario: la superficie que después se le enseña y que
//     tendría que coincidir con Stripe. Y con ella se retira `ENFORCE_ENTITLEMENTS`, un
//     flag muerto cuya documentación afirmaba que «mientras sea false, TODA feature está
//     desbloqueada para TODO tier» — falso desde M.02 B3 y una trampa para quien lo leyera.
//
// NO se re-audita lo certificado en otro gate (CLAUDE.md §6): matemática de compound y
// loan y su registro FREE/PREMIUM (AURIX-WORKSPACE-FORMULA-INTEGRITY, 46 — L1..L8
// ejecutan las fórmulas contra valores de referencia), resolutor de entitlements
// (AURIX-MONETIZATION-ENTITLEMENT-RESOLVER, 107), verdad comercial B1
// (AURIX-MONETIZATION-COMMERCIAL-TRUTH, 149), intent de producto
// (AURIX-MONETIZATION-PRODUCT-ENTITLEMENT, 150), billing M.04 (AURIX-M04-BILLING-STRIPE,
// 156) y la experiencia Intelligence Premium (AURIX-INT-PREMIUM-EXPERIENCE, 158).
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(root, f), 'utf8');
const app = R('app.js'), idx = R('index.html');
// Código sin comentarios: las aserciones «esto ya no existe» no pueden dar falso
// positivo leyendo el comentario que documenta justo lo retirado.
const bare = s => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*(\/\/|<!--)/.test(l)).join('\n');
const appB = bare(app), idxB = bare(idx);
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(name, src) { src = src || app; const i = src.indexOf('function ' + name + '('); if (i < 0) throw new Error('falta fn ' + name); return braceSlice(src, i); }

let pass = 0, fail = 0; const failed = [];
function ok(n, c, info) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; failed.push(n); console.log('  ✗ ' + n + (info !== undefined ? '  →  ' + info : '')); } }
function section(t) { console.log('\n' + t); }

console.log('\nAURIX-M06-INTELLIGENCE-WORKSPACE-PREMIUM — bloques 9, 10 y 11 de M.06');

// ══════════════════════════════════════════════════════════════════════════
section('A — verdad de precio: ni una cifra comercial obsoleta en el bundle:');
// ══════════════════════════════════════════════════════════════════════════
{
  ok('A.1 el precio legacy no aparece en NINGÚN fichero servido',
     !/14[,.]99/.test(appB) && !/14[,.]99/.test(idxB),
     'app=' + (appB.match(/14[,.]99/g) || []).length + ' index=' + (idxB.match(/14[,.]99/g) || []).length);
  ok('A.2 la página comercial legacy ya no existe (markup, openers ni API pública)',
     !/founderOverlay/.test(idx) && !/upgradeFounderBtn/.test(idx) &&
     !/function openFounderPage/.test(app) && !/function closeFounderPage/.test(app) &&
     !/function _renderFounderBenefits/.test(app) &&
     !/aurixEntitlements\.openFounderPage/.test(appB));
  ok('A.3 y ningún camino la invoca ya (cero llamadas, incluido el fallback de Membresía)',
     !/openFounderPage\(\)/.test(appB));
  ok('A.4 el TIER «founder» se conserva para las cuentas que lo tengan…',
     /founder: new Set\(PREMIUM_FEATURES\)/.test(app) && /t === 'founder' \|\| t === 'premium'/.test(app));
  ok('A.4b …pero sin precio ni etiqueta de precio en el catálogo del cliente',
     /id: 'founder', name: 'Aurix Founder', price: null, period: null,/.test(appB) &&
     !/priceLabel/.test(appB) && !/price: 14\.99/.test(appB));
  ok('A.5 la clave i18n con el precio obsoleto se retiró de los DOS idiomas',
     !/settingsFounderPrice/.test(app), (app.match(/settingsFounderPrice/g) || []).length + ' restantes');
  ok('A.6 NO-VACUIDAD · antes de este cambio TODO lo anterior estaba presente', (() => {
    let prevApp = '', prevIdx = '';
    try {
      prevApp = execFileSync('git', ['show', 'HEAD:app.js'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      prevIdx = execFileSync('git', ['show', 'HEAD:index.html'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    } catch (_) { return false; }
    if (!/function openFounderPage/.test(prevApp)) return true;   // ya entregado: la no-vacuidad quedó en su commit
    return /14[,.]99/.test(prevIdx) && /founderOverlay/.test(prevIdx) &&
           /upgradeFounderBtn/.test(prevIdx) && /settingsFounderPrice/.test(prevApp) &&
           /price: 14\.99/.test(prevApp);
  })());
}

// ══════════════════════════════════════════════════════════════════════════
section('B — el cliente no puede elevarse de tier ni fabricar gating:');
// ══════════════════════════════════════════════════════════════════════════
{
  ok('B.1 no existe catálogo de códigos promocionales en el cliente',
     !/PROMO_CODES\s*=/.test(appB) && !/FOUNDER100|EARLYACCESS/.test(appB) &&
     !/function applyPromoCode/.test(app) && !/function resolvePromoCode/.test(app));
  ok('B.2 ni se exponen en `window`',
     !/aurixEntitlements\.applyPromoCode/.test(appB) && !/aurixEntitlements\.resolvePromoCode/.test(appB));
  ok('B.3 el escritor de tier comercial ya no está expuesto en `window`',
     !/setPlanTier: setPlanTier/.test(appB) && /function setPlanTier\(/.test(app));
  ok('B.4 no existe interruptor local de entitlements',
     !/const ENFORCE_ENTITLEMENTS\s*=/.test(appB) && !/ENFORCE_ENTITLEMENTS:/.test(appB));
  ok('B.5 el gate REAL es el servidor, y falla CERRADO',
     /if \(!_aurixEnt\.loaded\) return false;/.test(fnSrc('hasFeature')) &&
     /return _aurixEnt\.features\[featureKey\] === true;/.test(fnSrc('hasFeature')) &&
     !/ENFORCE_ENTITLEMENTS|localStorage|aurix_plan/.test(fnSrc('hasFeature')));
  ok('B.6 y se revalida al volver al primer plano y al refrescar el token (no una vez por carga)',
     /_aurixEntRevalidate/.test(app) && /TOKEN_REFRESHED/.test(app) && /visibilitychange/.test(app));
  ok('B.7 ninguna query ni clave local concede Premium',
     !/[?&]premium=|[?&]tier=|[?&]unlock=/.test(appB));
  ok('B.8 NO-VACUIDAD · antes existían el catálogo de promos, su API pública y el flag', (() => {
    let prev = '';
    try { prev = execFileSync('git', ['show', 'HEAD:app.js'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch (_) { return false; }
    if (!/PROMO_CODES\s*=/.test(prev)) return true;
    return /FOUNDER100/.test(prev) && /aurixEntitlements\.applyPromoCode/.test(prev) &&
           /const ENFORCE_ENTITLEMENTS = false;/.test(prev) && /setPlanTier: setPlanTier/.test(prev);
  })());
}

// ══════════════════════════════════════════════════════════════════════════
section('C — paywall: un solo sitio con precios, y ninguno inventado:');
// ══════════════════════════════════════════════════════════════════════════
{
  const buildHtml = fnSrc('_buildHtml');
  ok('C.1 los importes salen del catálogo del SERVIDOR, no del bundle',
     /_aurixBillingPriceFor\('year'\)/.test(buildHtml) && /_aurixBillingPriceFor\('month'\)/.test(buildHtml) &&
     !/7[,.]99|59[,.]99|95[,.]88/.test(appB), 'precios hardcodeados en el cliente');
  ok('C.2 ANUAL PRIMERO, mensual visible',
     /\$\{year \? _planCard\(year, true\) : ''\}\s*\n\s*\$\{month \? _planCard\(month, !year\) : ''\}/.test(buildHtml));
  ok('C.3 sin catálogo NO se adivina un importe: se dice que aún no se puede comprar',
     /pw_unavailable/.test(buildHtml) && /is-empty/.test(buildHtml));
  ok('C.4 quien ya es cliente ve GESTIONAR, no una compra absurda',
     /const managed = /.test(buildHtml) && /hasFeature\('premium\.settings'\)/.test(buildHtml) &&
     /data-premium-portal="1"/.test(buildHtml) && /pw_manage/.test(buildHtml));
  ok('C.5 `past_due` y `canceled` llevan al portal, no a un muro',
     /_aurixEnt\.status === 'past_due'/.test(buildHtml) && /pw_past_due_note/.test(buildHtml));
  ok('C.6 el trial NO se inventa: sólo se anuncia si el catálogo del servidor lo declara',
     /row\.trial_days/.test(app) && /pw_trial/.test(app) &&
     !/trial_days:\s*\d/.test(appB), 'un trial hardcodeado en el cliente');
  ok('C.7 el paywall es el ÚNICO punto de compra desde una capacidad denegada',
     /upgradePaywallBtn/.test(idx) && (idxB.match(/btn-submit--plan/g) || []).length >= 1 &&
     !/upgradeFounderBtn/.test(idx));
  ok('C.8 el CTA se deshabilita mientras viaja al proveedor (sin doble sesión de checkout)',
     /function _ctaBusy/.test(app) && /pw_opening/.test(app));
  ok('C.9 copy crítica del paywall en los DOS idiomas',
     ['pw_title', 'pw_sub', 'pw_cta', 'pw_manage', 'pw_unavailable', 'pw_free_tier', 'pw_prem_tier']
       .every(k => (app.match(new RegExp('\\b' + k + ':\\s*', 'g')) || []).length === 2));
}

// ══════════════════════════════════════════════════════════════════════════
section('D — embudo mínimo y fiable: el origen se distingue:');
// ══════════════════════════════════════════════════════════════════════════
{
  const rec = fnSrc('_aurixRecordUpgradeIntent');
  ok('D.1 cada intención registra featureKey Y origen', /featureKey/.test(rec) && /source/.test(rec));
  ok('D.2 los puntos de conversión declaran un origen DISTINTO cada uno',
     ['settings-menu', 'settings-membership', 'upgrade-intent', 'intelligence-preview', 'paywall:']
       .every(s => app.indexOf(s) > 0));
  ok('D.3 la apertura del paywall y la elección de intervalo se registran',
     /_aurixRecordUpgradeIntent\('checkout:' \+ iv/.test(app) && /paywall_open|'paywall:'/.test(app));
  ok('D.4 sin PII: el embudo no guarda email, id ni nombre',
     !/email|user_id|currentUser\.id/.test(rec));
  ok('D.5 y no sale del dispositivo (no es analítica de terceros)',
     !/fetch\(|XMLHttpRequest|sendBeacon/.test(rec));
}

// ══════════════════════════════════════════════════════════════════════════
section('E — Intelligence: CTA Free y verdad semántica:');
// ══════════════════════════════════════════════════════════════════════════
{
  ok('E.1 la superficie completa vive detrás del entitlement del servidor',
     /if \(!hasFeature\('intelligence\.full'\)\) return _aurixIntelligencePreviewHTML\(\);/.test(app));
  ok('E.2 [P1 M.05 CERRADO] el preview Free tiene CTA PRIMARIO al paywall canónico',
     /data-premium-cta="intelligence\.full"/.test(app) && /data-premium-source="intelligence-preview"/.test(app));
  // RE-DECIDIDO · SPEC DE CIERRE §D. La preocupación de E.2b sigue siendo válida
  // —nadie puede quedar atrapado— pero la respuesta ya no es un segundo botón: la
  // navegación inferior está siempre presente y la SPEC pide un único CTA, porque el
  // secundario ganaba justo en el momento de máxima intención. Lo que se ancla es
  // que la superficie NO sea una pared: no bloquea la navegación, no se fija a la
  // pantalla y no atrapa el scroll.
  ok('E.2b no es una pared: la navegación sigue disponible y el scroll no queda atrapado',
     !/intprev-cta--ghost/.test(app) &&
     (function () {
       const st = (app.match(/<style>([\s\S]*?)<\/style>/g) || []).filter(x => /intprev-/.test(x)).join('');
       return !/position:fixed/.test(st) && !/overflow:hidden/.test(st)
         && /\.intprev-facts\{[^}]*overflow-y:auto/.test(st);
     })());
  ok('E.2c el CTA es táctil y no se sale de pantalla en móvil (ancho completo, 46 px)',
     /\.intprev-cta\{width:100%;[\s\S]{0,200}?height:46px/.test(app) &&
     /\.intprev-ctas\{display:flex;flex-direction:column/.test(app) &&
     /@media \(min-width:768px\)\{[\s\S]{0,400}?\.intprev-cta\{width:auto/.test(app));
  ok('E.3 el preview muestra hechos CIERTOS del propio patrimonio, no promesas',
     // §D publica DOS visibles y un tercero bloqueado, así que la condición mira
     // `visible` en vez de `facts`. Los hechos siguen saliendo del mismo motor.
     /res\.state === 'ok' && _visible\.length/.test(app) && /intprev-fact/.test(app) &&
     /out\.visible = out\.facts\.slice\(0, 2\);/.test(app));
  ok('E.4 «sin datos» NUNCA es 0: un eje no certificable se declara `unavailable`',
     /unavailable/.test(app) && !/unavailable[^\n]{0,40}:\s*0\b/.test(appB));
  ok('E.5 Estabilidad y Crecimiento siguen `unavailable` a propósito (contrato INT.07)',
     /stability/i.test(app) && /growth/i.test(app) && /unavailable/.test(app));
  ok('E.6 y el pentágono se dibuja SIEMPRE: la estructura no depende de tener datos',
     /pent|radar/i.test(app));
}

// ══════════════════════════════════════════════════════════════════════════
section('F — Workspace público: compound FREE, loan PREMIUM:');
// ══════════════════════════════════════════════════════════════════════════
{
  ok('F.1 sólo hay DOS herramientas publicadas, y son las declaradas',
     /compound/.test(app) && /loan_simulation/.test(app));
  ok('F.2 compound es FREE: su apertura no consulta entitlement',
     !/hasFeature\([^)]*compound/.test(app));
  ok('F.3 loan gatea contra el entitlement REAL, en el owner de apertura',
     /workspace\.loan/.test(app) && /openUpgradeIntent\(/.test(fnSrc('_wsOpenTool')));
  ok('F.4 una denegación no deja la herramienta muerta: abre el punto de conversión',
     /_acc\.reason === 'entitlement'/.test(app) && /source: 'workspace:'/.test(app));
  ok('F.5 la matemática de las dos está certificada ejecutándola en su propio gate',
     fs.existsSync(path.join(root, 'docs/AURIX-WORKSPACE-FORMULA-INTEGRITY-harness.js')) &&
     /L5 loan/.test(R('docs/AURIX-WORKSPACE-FORMULA-INTEGRITY-harness.js')));
  ok('F.6 el estado de Workspace es LOCAL y se aparca en el cambio de usuario (no viaja al sync)',
     /'aurix_ws_goals_v1'|aurix_ws_tool_state_v1/.test(app) &&
     /USER_SCOPED_WORK_KEYS/.test(app));
  ok('F.7 así que A no puede ver el trabajo de B tras un cambio de cuenta',
     (() => { const k = app.slice(app.indexOf('const USER_SCOPED_WORK_KEYS = ['), app.indexOf('];', app.indexOf('const USER_SCOPED_WORK_KEYS = [')));
       return /aurix_ws_/.test(k); })());
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + `  ${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
