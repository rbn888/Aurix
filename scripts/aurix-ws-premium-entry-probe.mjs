#!/usr/bin/env node
/**
 * AURIX · LA ENTRADA A WORKSPACE CUANDO EL PLAN YA ESTÁ CONFIRMADO (§4)
 * ════════════════════════════════════════════════════════════════════════════
 * QUÉ VIGILA. El derecho lo resuelve el SERVIDOR y llega tarde: el shell se
 * pinta antes de saber el plan. Eso crea una ventana en la que la pantalla
 * afirma algo que ya no es cierto, y las dos formas de equivocarse son de
 * gravedad muy distinta:
 *
 *   · enseñar la portada Free —o un CTA de compra— a quien YA ha pagado: es
 *     cobrar y no entregar, y el usuario no tiene forma de saber que es un
 *     residuo de pintado;
 *   · enseñar el interior a quien NO ha pagado: es regalar el producto.
 *
 * Así que no se comprueba «existe un guard», se comprueba el COMPORTAMIENTO en
 * la secuencia real: espera → respuesta del servidor → repintado, con el
 * resolver de verdad y sólo la RED simulada. Estubar el resolver sería estubar
 * exactamente lo que se quiere certificar.
 *
 *   node scripts/aurix-ws-premium-entry-probe.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const abs = normalize(join(ROOT, p)); if (!abs.startsWith(ROOT)) return res.writeHead(403).end();
    let body = await readFile(abs);
    if (abs.endsWith('app.js')) body = Buffer.from(String(body)
      .replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')
      .replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0'));
    res.writeHead(200, { 'content-type': MIME[extname(abs)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch (_) { res.writeHead(404).end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
let chromium, webkit;
try { ({ chromium, webkit } = await import(PW)); }
catch (e) { console.error('\n✗ SIN MOTORES — ' + PW + '\nRESULT: NO EJECUTADO (entorno, no candidato)'); process.exit(2); }

let pass = 0; const fails = [];
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (info ? '  [' + info + ']' : '')); console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };

// El montaje deja la app EXACTAMENTE como está al arrancar con sesión y sin
// respuesta todavía del resolver: hay usuario, hay cliente, y el entitlement
// está sin cargar y sin error. Es el estado real, no uno inventado.
async function mount(page, plan) {
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(`typeof renderWorkspaceHome === 'function'`, null, { timeout: 60000 });
  await page.waitForTimeout(600);
  await page.evaluate(`(function(){
    var bl = document.getElementById('bootLoader'); if (bl) bl.remove();
    var ar = document.getElementById('appRoot'); if (ar) ar.style.opacity = '1';
    document.getElementById('aurixWorkspace').style.display = 'block';
    currentUser = { id: 'u-probe', email: 'probe@aurix.test' };
    // SÓLO LA RED. El resolver, el gate y el repintado son los de producción.
    window.__ENT_PLAN = ${JSON.stringify(plan)};
    window.__ENT_CALLS = 0;
    supabaseClient = {
      rpc: function (name) {
        window.__ENT_CALLS++;
        if (name !== 'aurix_entitlements') return Promise.resolve({ data: null, error: { message: 'no' } });
        var f = Object.create(null);
        _AURIX_ENT_CANON.forEach(function (k) { f[k] = (window.__ENT_PLAN === 'premium' && k !== 'workspace.catalog_preview'); });
        return Promise.resolve({ data: [{ plan: window.__ENT_PLAN, subscription_status: window.__ENT_PLAN === 'premium' ? 'active' : 'none',
          source: 'plan', valid_until: null, features: f, feature_sources: {} }], error: null });
      },
      auth: { getSession: function(){ return Promise.resolve({ data: { session: null } }); } },
      from: function(){ return { select: function(){ return { eq: function(){ return { eq: function(){ return Promise.resolve({ data: [], error: null }); } }; } }; } }; },
    };
    // Estado de partida: NO se sabe el plan todavía.
    _aurixEnt = { loaded: false, loading: false, error: null, plan: 'free', status: 'none',
                  source: 'default', validUntil: null, features: Object.create(null),
                  sources: Object.create(null), fetchedAt: 0 };
    _aurixEntLastSig = null;
    _wshView = 'home';
    switchTab('workspace');
    return true; })()`);
  await page.waitForTimeout(250);
}
const view = page => page.evaluate(`(function(){
  var root = document.getElementById('aurixWorkspace');
  var wsh = root.querySelector('.aurix-wsh');
  var txt = root.innerText || '';
  return JSON.stringify({
    view: wsh ? wsh.getAttribute('data-wsh-view') : null,
    // Lo que de verdad importa que NO esté: una portada comercial o un botón de
    // comprar delante de alguien que ya ha pagado.
    cover: !!root.querySelector('[data-wsh-view="free_cover"], .wsfc-cover'),
    buyCta: root.querySelectorAll('[data-wsh-lock], [data-premium-buy], .wsh-tier.is-premium').length,
    tabs: root.querySelectorAll('[data-wstab]').length,
    tools: root.querySelectorAll('[data-wsh-cta], [data-wsh-nav]').length,
    pending: !!root.querySelector('[data-wsh-view="pending"]'),
    txt: txt.slice(0, 160),
  });})()`).then(JSON.parse);

console.log('AURIX · entrada a Workspace con el plan confirmado\n');

for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  const browser = await launcher.launch();
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 700 ? 2 : 1, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const tag = `${ENG}.${w}×${h}`;

    // ══ 1 · MIENTRAS NO SE SABE, NO SE AFIRMA NADA ═════════════════════════
    await mount(page, 'premium');
    const p0 = await view(page);
    ok(`${tag} sin respuesta del servidor: espera neutra, ni portada Free ni interior`,
      p0.pending === true && p0.cover === false && p0.buyCta === 0 && p0.tabs === 0,
      JSON.stringify(p0));

    // ══ 2 · EL SERVIDOR CONTESTA PREMIUM: SE REPINTA SOLO ══════════════════
    // Se llama al OWNER REAL del repintado (el mismo que corre al refrescar el
    // token y al volver la pestaña al primer plano). La sonda no pinta nada.
    await page.evaluate(`_aurixEntRevalidate('probe')`);
    await page.waitForTimeout(400);
    const p1 = await view(page);
    ok(`${tag} al confirmarse Premium el interior aparece SOLO, sin recargar`,
      p1.cover === false && p1.pending === false && p1.tabs >= 2,
      JSON.stringify(p1));
    ok(`${tag} …y no queda ni un CTA de compra residual`,
      p1.buyCta === 0, JSON.stringify(p1));

    // ══ 3 · VOLVER A LA PESTAÑA NO RESUCITA LA PORTADA ═════════════════════
    // Es el caso que el SPEC nombra: «al regresar o recargar». La revalidación
    // corre en cada vuelta a primer plano y no debe degradar a quien ha pagado.
    await page.evaluate(`(function(){ _wshView='home'; switchTab('dashboard'); switchTab('workspace'); return true; })()`);
    await page.evaluate(`_aurixEntRevalidate('visible')`);
    await page.waitForTimeout(350);
    const p2 = await view(page);
    ok(`${tag} volver a Workspace con Premium confirmado NO devuelve la portada`,
      p2.cover === false && p2.buyCta === 0 && p2.tabs >= 2, JSON.stringify(p2));

    // ══ 4 · UN FALLO DE RED DESPUÉS NO DEGRADA A QUIEN HA PAGADO ═══════════
    // Ya hubo una lectura buena del servidor. Que la siguiente falle es cobertura
    // móvil, no una cancelación: degradar aquí sería una afirmación comercial
    // FALSA contra un cliente de pago.
    await page.evaluate(`(function(){
      supabaseClient.rpc = function(){ return Promise.reject(new Error('network')); };
      return true; })()`);
    await page.evaluate(`_aurixEntRevalidate('offline')`);
    await page.waitForTimeout(350);
    const p3 = await view(page);
    ok(`${tag} un fallo de red posterior no degrada a un cliente de pago`,
      p3.cover === false && p3.buyCta === 0, JSON.stringify(p3));

    // ══ 5 · Y SIN PLAN, LA FRONTERA SIGUE CERRADA ══════════════════════════
    await mount(page, 'free');
    await page.evaluate(`_aurixEntRevalidate('probe')`);
    await page.waitForTimeout(400);
    const f1 = await view(page);
    ok(`${tag} FREE · la portada es la única vista, y el interior no se monta`,
      f1.cover === true && f1.tabs === 0, JSON.stringify(f1));
    // La portada tiene que ofrecer la compra, y de forma alcanzable en móvil:
    // una frontera sin salida comercial es una pared.
    const cta = await page.evaluate(`(function(){
      var root = document.getElementById('aurixWorkspace');
      var b = root.querySelector('[data-wsh-lock], .wsfc-cta, [data-wsfc-cta]');
      if (!b) return JSON.stringify({ found: false });
      var r = b.getBoundingClientRect();
      var nav = document.getElementById('bottomNav');
      var floor = (nav && getComputedStyle(nav).display !== 'none') ? nav.getBoundingClientRect().top : window.innerHeight;
      return JSON.stringify({ found: true, top: Math.round(r.top), bottom: Math.round(r.bottom),
        floor: Math.round(floor), tap: Math.round(Math.min(r.width, r.height)),
        // Y sin exponer nada privado: ni documentos, ni cifras del usuario.
        docs: root.querySelectorAll('[data-wspl-open], [data-wsx-open], .wsg-card, .wsre-card').length });})()`).then(JSON.parse);
    ok(`${tag} FREE · el acceso a Premium se ve y se toca sin desplazar`,
      cta.found === true && cta.bottom <= cta.floor + 0.5 && cta.tap >= 44, JSON.stringify(cta));
    ok(`${tag} FREE · la portada no expone documentos ni datos privados`,
      cta.docs === 0, JSON.stringify(cta));
    // Acceso DIRECTO a una capacidad sin derecho: se deniega por el resolver, no
    // por esconder la tarjeta.
    const direct = await page.evaluate(`(function(){
      window.__UP = [];
      var _o = openUpgradeIntent;
      openUpgradeIntent = function(o){ window.__UP.push(o); return false; };
      var opened = _wsOpenTool('loan');
      var surf = _wsOpenSurface('scenario');
      openUpgradeIntent = _o;
      var wsh = document.querySelector('#aurixWorkspace .aurix-wsh');
      return JSON.stringify({ up: window.__UP.map(function(x){ return x && x.featureKey; }),
        view: wsh ? wsh.getAttribute('data-wsh-view') : null, surf: surf });})()`).then(JSON.parse);
    ok(`${tag} FREE · la ruta directa a una capacidad se DENIEGA y ofrece comprar`,
      direct.view === 'free_cover' && direct.surf === false &&
      direct.up.indexOf('workspace.loan') !== -1 && direct.up.indexOf('workspace.scenarios') !== -1,
      JSON.stringify(direct));

    // ══ 6 · EL RETORNO DEL CHECKOUT NO CONCEDE NADA POR SÍ SOLO ═══════════
    // `?billing=success` sólo significa «vuelve a preguntarle al servidor». Si
    // la app se lo creyera, bastaría con escribir ese parámetro en la barra de
    // direcciones para verse Premium. Y si el webhook aún no ha llegado, la
    // espera tiene que ser honesta y ACOTADA, no un «¡activado!» anticipado ni
    // un polling eterno.
    await mount(page, 'free');   // el servidor todavía dice Free
    const ret = await page.evaluate(`(function(){
      window.__TOASTS = [];
      var _t = _aurixBillingToast;
      _aurixBillingToast = function(msg, kind){ window.__TOASTS.push(String(msg)); return _t ? undefined : undefined; };
      history.replaceState({}, '', location.pathname + '?billing=success');
      _aurixBillingReturnFlow();
      return JSON.stringify({ urlAfter: location.search });})()`).then(JSON.parse);
    ok(`${tag} checkout · el parámetro de retorno se limpia de la URL al instante`,
      ret.urlAfter.indexOf('billing=success') === -1, JSON.stringify(ret));
    await page.waitForTimeout(600);
    const mid = await page.evaluate(`(function(){
      return JSON.stringify({ toasts: window.__TOASTS.slice(), premium: hasAurixPremiumAccess() });})()`).then(JSON.parse);
    ok(`${tag} checkout · mientras el servidor no confirma, se dice «confirmando» y NO se concede`,
      /Confirmando|Confirming/i.test(mid.toasts.join(' ')) &&
      !/activado|activated/i.test(mid.toasts.join(' ')) && mid.premium === false,
      JSON.stringify(mid));
    // Ahora el webhook «llega»: el servidor pasa a decir Premium.
    await page.evaluate(`(function(){ window.__ENT_PLAN = 'premium'; return true; })()`);
    await page.waitForTimeout(3200);   // cae dentro de la ventana de reintentos
    const done = await page.evaluate(`(function(){
      return JSON.stringify({ toasts: window.__TOASTS.slice(), premium: hasAurixPremiumAccess(),
        calls: window.__ENT_CALLS });})()`).then(JSON.parse);
    ok(`${tag} checkout · cuando el SERVIDOR lo confirma, y sólo entonces, se anuncia activado`,
      /activado|activated/i.test(done.toasts.join(' ')) && done.premium === true,
      JSON.stringify(done));
    const v = await view(page);
    ok(`${tag} checkout · y la interfaz pasa a Premium sin recargar ni CTA residual`,
      v.cover === false && v.buyCta === 0, JSON.stringify(v));
    // El reintento está ACOTADO: no puede quedarse llamando para siempre.
    // Esto decía «≤6 intentos», y esa cifra era la LIMITACIÓN de entonces, no el
    // contrato: con seis intentos repartidos en huecos crecientes, el objetivo
    // de reflejar Premium en ≤2 s era imposible por construcción. Lo que hay que
    // fijar es que la espera esté acotada —por número Y por ventana—, y eso es
    // lo que se comprueba ahora. La latencia la mide
    // `scripts/aurix-billing-activation-probe.mjs`, que es su sitio.
    ok(`${tag} checkout · la espera es finita, declarada y congelada`,
      await page.evaluate(`(function(){
        var w = _AURIX_BILLING_WAIT;
        if (!w || !Object.isFrozen(w)) return false;
        var total = w.firstMs + w.everyMs * (w.maxTries - 1);
        return w.maxTries > 0 && w.maxTries <= 40 && w.everyMs > 0 && total <= 60000;
      })()`));

    // El embudo queda registrado hasta el final, y la confirmación sólo cuenta
    // cuando la dice el SERVIDOR. Sin importes, sin documentos, sin PII.
    const funnel = await page.evaluate(`(function(){
      // El embudo tiene su PROPIO registro: mezclarlo con el de intenciones
      // obligaba a agujerear la regla que protege esa línea base.
      var K = _AURIX_FUNNEL_KEY + (_aurixActiveUserId ? ('_' + _aurixActiveUserId) : '');
      var raw = localStorage.getItem(K); var arr = raw ? (JSON.parse(raw) || []) : [];
      var steps = arr.map(function(e){ return e.step; });
      return JSON.stringify({ steps: steps, all: arr.length,
        // Ni un importe, ni un nombre de documento, ni un correo en el ledger.
        clean: !/@|\\d+[,.]\\d{2}|presupuesto|budget/i.test(JSON.stringify(arr)) });})()`).then(JSON.parse);
    ok(`${tag} checkout · el embudo registra el retorno y la confirmación, y no se duplica`,
      funnel.steps.indexOf('returned') !== -1 && funnel.steps.indexOf('confirmed') !== -1 &&
      funnel.steps.filter(x => x === 'returned').length === 1 &&
      funnel.steps.filter(x => x === 'confirmed').length === 1,
      JSON.stringify(funnel.steps));
    ok(`${tag} checkout · y el registro no lleva importes, documentos ni correos`,
      funnel.clean === true, JSON.stringify(funnel).slice(0, 140));

    // ══ 6b · CUANDO LA ESPERA SE AGOTA, HAY SALIDA ════════════════════════
    // El 24/09/2026 una compra REAL se quedó sin activar: el webhook apuntaba a
    // un host que responde 405, así que el servidor nunca supo del pago. Lo que
    // el usuario encontró fue un aviso que se desvanecía y ninguna acción. Aquí
    // se comprueba que ahora el aviso SE QUEDA, que ofrece volver a preguntar
    // al servidor, y que NO ofrece pagar otra vez.
    await mount(page, 'free');
    const timeout = await page.evaluate(`(function(){
      // Se agota la espera por el camino real del retorno.
      _aurixBillingPendingNotice();
      var el = document.querySelector('.aurix-toast.has-action');
      return JSON.stringify({ shown: !!el,
        txt: el ? (el.textContent || '') : '',
        act: el ? (el.querySelector('.aurix-toast-act') || {}).textContent : null,
        // Ni un botón de compra en el aviso.
        buy: el ? el.querySelectorAll('[data-premium-buy],[data-premium-cta]').length : -1 });})()`).then(JSON.parse);
    ok(`${tag} espera agotada · el aviso se queda y ofrece «Comprobar estado»`,
      timeout.shown === true && /Comprobar estado|Check status/i.test(String(timeout.act)) &&
      /confirmando|being confirmed|activará|activated/i.test(timeout.txt),
      JSON.stringify(timeout));
    ok(`${tag} espera agotada · y NO empuja a pagar otra vez`,
      timeout.buy === 0, JSON.stringify(timeout));
    // Y no se desvanece: a los 7 s sigue ahí (el toast normal dura ≤6 s).
    await page.waitForTimeout(7000);
    ok(`${tag} espera agotada · el aviso no se desvanece solo`,
      await page.evaluate(`!!document.querySelector('.aurix-toast.has-action')`));
    // «Comprobar estado» pregunta AL SERVIDOR. Si dice premium, se aplica.
    await page.evaluate(`(function(){ window.__ENT_PLAN = 'premium'; return true; })()`);
    await page.click('.aurix-toast-act');
    await page.waitForTimeout(700);
    const rechecked = await page.evaluate(`(function(){
      return JSON.stringify({ premium: hasAurixPremiumAccess(),
        toasts: [].slice.call(document.querySelectorAll('.aurix-toast')).map(function(e){ return e.textContent; }) });})()`).then(JSON.parse);
    ok(`${tag} espera agotada · «Comprobar estado» activa Premium cuando el servidor lo confirma`,
      rechecked.premium === true, JSON.stringify(rechecked).slice(0, 160));
    const v6 = await view(page);
    ok(`${tag} espera agotada · y la interfaz pasa a Premium sin recargar`,
      v6.cover === false && v6.buyCta === 0, JSON.stringify(v6));
    // Y si el servidor SIGUE diciendo Free, se dice, con soporte y sin cobrar.
    await mount(page, 'free');
    await page.evaluate(`_aurixBillingRecheck()`);
    await page.waitForTimeout(700);
    const still = await page.evaluate(`(function(){
      var el = document.querySelector('.aurix-toast.has-action');
      return JSON.stringify({ shown: !!el, txt: el ? el.textContent : '',
        act: el ? (el.querySelector('.aurix-toast-act') || {}).textContent : null,
        premium: hasAurixPremiumAccess() });})()`).then(JSON.parse);
    ok(`${tag} espera agotada · si sigue sin constar, lo dice y ofrece soporte (no pagar)`,
      still.shown === true && /soporte|support/i.test(String(still.act)) && still.premium === false,
      JSON.stringify(still).slice(0, 180));

    // ══ 7 · «TUS PLANES» TAMBIÉN DEPENDE DEL DERECHO ══════════════════════
    // Tres sitios reaccionaban a un plan confirmado y sólo uno refrescaba esta
    // sección, así que comprar desde el Resumen dejaba el derecho concedido y
    // la sección sin aparecer hasta cambiar de pestaña. Un owner, y se
    // comprueba que los tres pasan por él.
    ok(`${tag} el repintado por plan confirmado es UN owner, y refresca «Tus planes»`,
      await page.evaluate(`(function(){
        var src = String(_aurixEntApplyToUi);
        return /updateDashboardPlans/.test(src) && /switchTab/.test(src) && /_aurixRenderMenuIdentity/.test(src);})()`));

    await ctx.close();
  }
  await browser.close();
}

// ── Y EL ARRANQUE HACE LO MISMO QUE EL REGRESO ──────────────────────────────
// El caso «recargar» vive en el bloque de restauración de sesión, que una sonda
// no puede ejercitar sin una sesión real. Lo que sí se puede fijar es que ese
// camino REPINTA con el mismo owner y no se olvida de sembrar la firma — el
// defecto que dejaba a un founder en el preview Free hasta cambiar de pestaña.
{
  const app = await readFile(join(ROOT, 'app.js'), 'utf8');
  const boot = app.slice(app.indexOf('_aurixEntitlementsLoad({ force: true }).then(() => {'),
                         app.indexOf('_aurixEntitlementsLoad({ force: true }).then(() => {') + 1400);
  ok('BOOT · la primera lectura del servidor repinta por el MISMO owner que el resto',
    /_aurixEntApplyToUi\(_aurixEnt\.features\)/.test(boot), boot.slice(0, 160));
  // Y no queda ninguna copia suelta del gesto: tres sitios hacían lo mismo de
  // tres maneras y sólo uno refrescaba «Tus planes».
  // Los caminos de COBRO —la espera del retorno, la reanudación al volver a
  // primer plano y «Comprobar estado»— ya no llaman al owner cada uno por su
  // lado: pasan por `_aurixBillingConfirmed`, que es quien lo llama. Por eso lo
  // que se fija no es un RECUENTO de llamadas (subía y bajaba con cada camino
  // nuevo y no decía nada), sino que ningún camino repinte por su cuenta.
  const applyCalls = (app.match(/_aurixEntApplyToUi\(/g) || []).length;
  ok('BOOT · todos los caminos que confirman plan pasan por el owner único',
    applyCalls >= 4 &&
    /function _aurixBillingConfirmed\(st, step\) \{[\s\S]{0,600}_aurixEntApplyToUi\(/.test(app) &&
    ['_aurixEntRevalidate'].every(fn => new RegExp(fn + '[\\s\\S]{0,1800}_aurixEntApplyToUi\\(').test(app)) &&
    ['_aurixBillingAwaitServer', '_aurixBillingResumeIfPending', '_aurixBillingRecheck']
      .every(fn => new RegExp(fn + '[\\s\\S]{0,1200}_aurixBillingConfirmed\\(').test(app)),
    'definición + ' + (applyCalls - 1) + ' llamadas');
}

console.log('\n════════════════════════════════════════════════');
console.log(`${pass} passed, ${fails.length} failed\n`);
if (fails.length) { console.log('FAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); console.log('\nRESULT: NO-GO'); server.close(); process.exit(1); }
console.log('RESULT: GO');
server.close();
