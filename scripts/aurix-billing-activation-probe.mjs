#!/usr/bin/env node
/**
 * AURIX · LA TRANSICIÓN FREE → PREMIUM, MEDIDA
 * ════════════════════════════════════════════════════════════════════════════
 * QUÉ CERTIFICA, Y QUÉ NO PUEDE CERTIFICAR.
 *
 * El 24/09/2026 una compra REAL se pagó y no activó nada. La causa fue de
 * configuración (el webhook apuntaba a un host sin función), pero al arreglarla
 * quedó al descubierto que el CLIENTE tampoco estaba a la altura: la espera
 * tenía huecos crecientes de hasta quince segundos, no sobrevivía a salir de la
 * aplicación, y una excepción de red se llevaba por delante los reintentos Y el
 * aviso final. Esta sonda mide justo eso, con el resolver DE PRODUCCIÓN y sólo
 * la red simulada — estubar el resolver sería estubar lo que se quiere probar.
 *
 * Las cuatro afirmaciones del SPEC, separadas a propósito:
 *   · evento procesado        → lo dice `/api/billing/status`, no esta sonda;
 *   · derecho persistido      → ídem;
 *   · TRANSICIÓN SIN INTERVENCIÓN → esto es lo que se mide AQUÍ;
 *   · recorrido completo desde un checkout real → NO se puede simular: exige
 *     una cuenta Free real, una sesión de pago y un webhook de verdad. Queda
 *     declarado como bloqueado, no dado por bueno.
 *
 * Y el objetivo con número: reflejar Premium en ≤2 s desde que el SERVIDOR lo
 * confirma. Se mide en milisegundos y se imprime, no se declara.
 *
 *   node scripts/aurix-billing-activation-probe.mjs
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

let pass = 0; const fails = []; const times = [];
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (info ? '  [' + info + ']' : '')); console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };

// El OBJETIVO declarado, en un sitio y con nombre. Si alguien lo cambia, que lo
// cambie a sabiendas.
const TARGET_MS = 2000;

// ── MONTAJE ────────────────────────────────────────────────────────────────
// Cuenta autenticada cuyo servidor dice FREE, que es el punto de partida del
// recorrido que interesa. Se simula la RED y nada más: el resolver, el gate,
// la espera y el repintado son los de producción.
async function mount(page) {
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(`typeof renderWorkspaceHome === 'function' && typeof _aurixBillingReturnFlow === 'function'`, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  await page.evaluate(`(function(){
    var bl = document.getElementById('bootLoader'); if (bl) bl.remove();
    var ar = document.getElementById('appRoot'); if (ar) ar.style.opacity = '1';
    document.getElementById('aurixWorkspace').style.display = 'block';
    currentUser = { id: 'u-probe', email: 'probe@aurix.test' };
    _aurixActiveUserId = 'u-probe';
    try { localStorage.removeItem('aurix_billing_pending_v1_u-probe'); } catch (_) {}
    window.__ENT_PLAN = 'free';
    window.__ENT_CALLS = 0;
    window.__RPC_FAIL = false;
    supabaseClient = {
      rpc: function (name) {
        window.__ENT_CALLS++;
        if (name !== 'aurix_entitlements') return Promise.resolve({ data: null, error: { message: 'no' } });
        // Un fallo de TRANSPORTE se simula como rechazo, que es lo que hacía
        // desaparecer la espera entera antes del \`catch\`.
        if (window.__RPC_FAIL) return Promise.reject(new Error('network'));
        var f = Object.create(null);
        _AURIX_ENT_CANON.forEach(function (k) { f[k] = (window.__ENT_PLAN === 'premium' && k !== 'workspace.catalog_preview'); });
        return Promise.resolve({ data: [{ plan: window.__ENT_PLAN,
          subscription_status: window.__ENT_PLAN === 'premium' ? 'active' : 'none',
          source: 'plan', valid_until: null, features: f, feature_sources: {} }], error: null });
      },
      auth: { getSession: function(){ return Promise.resolve({ data: { session: null } }); } },
      from: function(){ return { select: function(){ return { eq: function(){ return { eq: function(){ return Promise.resolve({ data: [], error: null }); } }; } }; } }; },
    };
    _aurixEnt = { loaded: false, loading: false, error: null, plan: 'free', status: 'none',
                  source: 'default', validUntil: null, features: Object.create(null),
                  sources: Object.create(null), fetchedAt: 0 };
    _aurixEntLastSig = null;
    _wshView = 'home';
    switchTab('workspace');

    // ── EL CRONÓMETRO ─────────────────────────────────────────────────────
    // No se mide una variable: se mide cuándo el interior Premium está PINTADO
    // —pestañas presentes y sin portada comercial— muestreando por frame.
    window.__W = { flipAt: null, premiumAt: null, clicks: 0 };
    (function loop(){
      try {
        var root = document.getElementById('aurixWorkspace');
        var painted = !!root && root.querySelectorAll('[data-wstab]').length > 0
                      && !root.querySelector('.wsfc-cover, [data-wsh-view="free_cover"]');
        if (painted && window.__W.premiumAt === null && window.__W.flipAt !== null) {
          window.__W.premiumAt = performance.now();
        }
      } catch (_) {}
      requestAnimationFrame(loop);
    })();
    // Cualquier pulsación en el aviso se CUENTA: «sin intervención» hay que
    // demostrarlo, no suponerlo.
    document.addEventListener('click', function (e) {
      try { if (e.target && e.target.closest && e.target.closest('.aurix-toast')) window.__W.clicks++; } catch (_) {}
    }, true);
    return true; })()`);
  await page.waitForTimeout(200);
}
// ESPERAR A QUE ESTÉ PINTADO. Con una CADENA, Playwright evalúa JavaScript en
// texto y la CSP de la app —que es la de producción, `<meta>` incluida— lo
// PROHÍBE: la espera se rechaza al instante y la sonda mide cero. Pasando una
// función se serializa y se llama, sin `eval`. El fallo era mudo, así que se
// deja escrito: en esta app, `waitForFunction` con cadena no espera nada.
const waitPremium = (page, ms) => page.waitForFunction(
  () => !!(window.__W && window.__W.premiumAt !== null), null, { timeout: ms });
// El servidor pasa a conceder el derecho. Ése es el instante cero de la medida.
const flip = page => page.evaluate(`(function(){
  window.__W.flipAt = performance.now(); window.__ENT_PLAN = 'premium'; return true; })()`);
const read = page => page.evaluate(`(function(){
  var root = document.getElementById('aurixWorkspace');
  return JSON.stringify({
    premium: hasAurixPremiumAccess(),
    tabs: root.querySelectorAll('[data-wstab]').length,
    cover: !!root.querySelector('.wsfc-cover, [data-wsh-view="free_cover"]'),
    ms: (window.__W.premiumAt !== null && window.__W.flipAt !== null)
          ? Math.round(window.__W.premiumAt - window.__W.flipAt) : null,
    clicks: window.__W.clicks,
    calls: window.__ENT_CALLS,
    toast: (function(){ var e = document.querySelector('.aurix-toast.has-action');
      return e ? { txt: e.textContent || '', act: (e.querySelector('.aurix-toast-act')||{}).textContent || '' } : null; })(),
    pending: (function(){ try { return localStorage.getItem('aurix_billing_pending_v1_u-probe'); } catch (_) { return null; } })(),
  });})()`).then(JSON.parse);
// Volver a primer plano, tal y como lo emite el navegador.
const foreground = page => page.evaluate(`(function(){
  document.dispatchEvent(new Event('visibilitychange'));
  return true; })()`);

console.log('AURIX · transición Free → Premium: cuánto tarda y quién la dispara\n');
console.log(`  objetivo declarado: Premium visible en ≤${TARGET_MS} ms desde la confirmación del servidor\n`);

const ONLY = process.env.AURIX_ONLY || '';
for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]].filter(([e]) => !ONLY || ONLY === e)) {
  const browser = await launcher.launch();
  for (const [w, h] of (ONLY ? [[390, 844]] : [[390, 844], [1440, 900]])) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 700 ? 2 : 1, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const tag = `${ENG}.${w}×${h}`;
    const HEAVY = (ENG === 'CR' && w === 390);   // los tramos largos, una vez

    // ══ 1 · EL WEBHOOK LLEGÓ ANTES QUE EL USUARIO ══════════════════════════
    // Caso frecuente: Stripe entrega mientras el navegador todavía redirige.
    // Al volver, el primer intento es inmediato y no debería verse espera.
    await mount(page);
    await flip(page);
    await page.evaluate(`(function(){
      history.replaceState({}, '', location.pathname + '?billing=success');
      _aurixBillingReturnFlow(); return true; })()`);
    await waitPremium(page, 8000).catch(() => {});
    const s1 = await read(page);
    times.push([`${tag} antes del retorno`, s1.ms]);
    ok(`${tag} 1 · confirmado ANTES del retorno: Premium sin espera y sin pulsar`,
      s1.premium === true && s1.cover === false && s1.clicks === 0 && s1.ms !== null && s1.ms <= TARGET_MS,
      JSON.stringify(s1));
    ok(`${tag} 1b · y la marca de espera se retira al confirmarse`,
      s1.pending === null, String(s1.pending));

    // ══ 2 · EL WEBHOOK LLEGA DURANTE LA ESPERA ═════════════════════════════
    await mount(page);
    await page.evaluate(`(function(){
      history.replaceState({}, '', location.pathname + '?billing=success');
      _aurixBillingReturnFlow(); return true; })()`);
    await page.waitForTimeout(500);
    const mid = await read(page);
    ok(`${tag} 2a · mientras el servidor dice Free NO se concede nada`,
      mid.premium === false && mid.tabs === 0, JSON.stringify(mid));
    ok(`${tag} 2b · y la espera deja marca, para poder reanudarla`,
      typeof mid.pending === 'string' && /"at":\d+/.test(mid.pending), String(mid.pending));
    await page.waitForTimeout(3500);   // el webhook tarda ~4 s
    await flip(page);
    await waitPremium(page, 8000).catch(() => {});
    const s2 = await read(page);
    times.push([`${tag} durante la espera (4 s)`, s2.ms]);
    ok(`${tag} 2 · confirmado a los 4 s: Premium solo, en ≤${TARGET_MS} ms y sin pulsar`,
      s2.premium === true && s2.cover === false && s2.clicks === 0 && s2.ms !== null && s2.ms <= TARGET_MS,
      JSON.stringify(s2));

    // ══ 2c · EL PEOR CASO, A PROPÓSITO ═════════════════════════════════════
    // Las medidas de arriba son afortunadas: la confirmación cae a mitad de
    // hueco. El peor caso es que caiga JUSTO DESPUÉS de una consulta, y hay que
    // medirlo, porque es el que decide si el objetivo se cumple o no. Los
    // detección no puede llegar antes de la consulta siguiente. El momento se
    // deriva de la propia cadencia: si alguien la cambia, esto sigue midiendo
    // el peor caso y no un punto afortunado que se quedó escrito.
    await mount(page);
    const every = await page.evaluate(`_AURIX_BILLING_WAIT.everyMs`);
    await page.evaluate(`(function(){
      history.replaceState({}, '', location.pathname + '?billing=success');
      _aurixBillingReturnFlow(); return true; })()`);
    await page.waitForTimeout(every + 60);
    await flip(page);
    await waitPremium(page, 8000).catch(() => {});
    const s2c = await read(page);
    times.push([`${tag} PEOR CASO (justo tras una consulta)`, s2c.ms]);
    ok(`${tag} 2c · incluso en el peor punto del ciclo, Premium en ≤${TARGET_MS} ms`,
      s2c.premium === true && s2c.clicks === 0 && s2c.ms !== null && s2c.ms <= TARGET_MS,
      JSON.stringify(s2c));

    // ══ 3 · EL HUECO QUE ANTES DURABA NUEVE SEGUNDOS ═══════════════════════
    // Con la cadencia anterior los intentos caían en 0 · 1,2 · 3,7 · 8,7 · 17,7 s.
    // Una confirmación a los ~9,3 s no se veía hasta los 17,7. Este tramo es
    // el que FALLA con el código anterior, y por eso se ejecuta de verdad.
    if (HEAVY) {
      await mount(page);
      await page.evaluate(`(function(){
        history.replaceState({}, '', location.pathname + '?billing=success');
        _aurixBillingReturnFlow(); return true; })()`);
      await page.waitForTimeout(9300);
      await flip(page);
      await waitPremium(page, 12000).catch(() => {});
      const s3 = await read(page);
      times.push([`${tag} en el hueco viejo (9,3 s)`, s3.ms]);
      ok(`${tag} 3 · confirmado a los 9,3 s —el hueco muerto de antes— en ≤${TARGET_MS} ms`,
        s3.premium === true && s3.ms !== null && s3.ms <= TARGET_MS, JSON.stringify(s3));
    }

    // ══ 4 · SALIR DE LA APP Y VOLVER ═══════════════════════════════════════
    // El caso del fundador: se paga, se sale, el webhook llega tarde. Antes,
    // volver no preguntaba nada (revalidación perezosa con TTL de 5 minutos) y
    // recargar borraba hasta el aviso. Ahora volver a primer plano reanuda.
    await mount(page);
    await page.evaluate(`(function(){
      history.replaceState({}, '', location.pathname + '?billing=success');
      _aurixBillingReturnFlow(); return true; })()`);
    await page.waitForTimeout(800);
    // El servidor confirma mientras la app está en segundo plano.
    await flip(page);
    await page.evaluate(`(function(){ window.__W.premiumAt = null; window.__W.flipAt = null; return true; })()`);
    await page.waitForTimeout(100);
    await page.evaluate(`(function(){ window.__W.flipAt = performance.now(); return true; })()`);
    await foreground(page);
    await waitPremium(page, 8000).catch(() => {});
    const s4 = await read(page);
    times.push([`${tag} al volver a primer plano`, s4.ms]);
    ok(`${tag} 4 · volver a primer plano activa Premium SOLO, sin pulsar nada`,
      s4.premium === true && s4.cover === false && s4.clicks === 0 && s4.ms !== null && s4.ms <= TARGET_MS,
      JSON.stringify(s4));

    // ══ 5 · Y VOLVER ATRÁS (bfcache, sin `visibilitychange`) ═══════════════
    await mount(page);
    await page.evaluate(`(function(){
      history.replaceState({}, '', location.pathname + '?billing=success');
      _aurixBillingReturnFlow(); return true; })()`);
    await page.waitForTimeout(600);
    await flip(page);
    await page.evaluate(`(function(){ window.__W.premiumAt = null; window.__W.flipAt = performance.now();
      window.dispatchEvent(new Event('pageshow')); return true; })()`);
    await waitPremium(page, 8000).catch(() => {});
    const s5 = await read(page);
    ok(`${tag} 5 · «pageshow» (volver atrás en Safari) también reanuda la espera`,
      s5.premium === true && s5.clicks === 0, JSON.stringify(s5));

    // ══ 6 · SI EL SERVIDOR NUNCA LO DICE, NO SE CONCEDE NADA ═══════════════
    // Y las llamadas están ACOTADAS: seis vueltas a primer plano como mucho.
    await mount(page);
    await page.evaluate(`(function(){
      history.replaceState({}, '', location.pathname + '?billing=success');
      _aurixBillingReturnFlow(); return true; })()`);
    await page.waitForTimeout(700);
    const before = (await read(page)).calls;
    for (let k = 0; k < 10; k++) { await foreground(page); await page.waitForTimeout(120); }
    await page.waitForTimeout(400);
    const s6 = await read(page);
    ok(`${tag} 6 · sin confirmación del servidor, NO hay Premium (ni local ni provisional)`,
      s6.premium === false && s6.tabs === 0, JSON.stringify(s6));
    ok(`${tag} 6b · y diez vueltas a primer plano gastan como mucho seis consultas`,
      (s6.calls - before) <= 6 + 2, `antes ${before}, después ${s6.calls}`);

    // ══ 7 · LA MARCA CADUCA ════════════════════════════════════════════════
    // Media hora. Pasada, ni se pregunta ni se queda ahí para siempre.
    // Se remonta antes de medir: la espera del caso anterior SIGUE viva y sus
    // consultas se contarían como si las hubiera hecho la reanudación.
    await mount(page);
    await page.evaluate(`(function(){
      localStorage.setItem('aurix_billing_pending_v1_u-probe',
        JSON.stringify({ at: Date.now() - 31 * 60 * 1000, resumes: 0 }));
      window.__CALLS0 = window.__ENT_CALLS;
      return _aurixBillingResumeIfPending('probe'); })()`);
    await page.waitForTimeout(300);
    const s7 = await page.evaluate(`(function(){ return JSON.stringify({
      key: localStorage.getItem('aurix_billing_pending_v1_u-probe'),
      spent: window.__ENT_CALLS - window.__CALLS0 });})()`).then(JSON.parse);
    ok(`${tag} 7 · una marca de hace media hora se caduca y no gasta consultas`,
      s7.key === null && s7.spent === 0, JSON.stringify(s7));

    // ══ 8 · UN FALLO DE RED NO SE LLEVA LA ESPERA ══════════════════════════
    // Antes, la promesa del reintento no tenía `catch`: una excepción mataba la
    // cadena y con ella el aviso final. El usuario se quedaba sin espera Y sin
    // salida, sin nada en pantalla que dijera por qué.
    await mount(page);
    await page.evaluate(`(function(){
      window.__RPC_FAIL = true;
      history.replaceState({}, '', location.pathname + '?billing=success');
      _aurixBillingReturnFlow(); return true; })()`);
    await page.waitForTimeout(2200);
    await page.evaluate(`(function(){ window.__RPC_FAIL = false; return true; })()`);
    await flip(page);
    await waitPremium(page, 9000).catch(() => {});
    const s8 = await read(page);
    ok(`${tag} 8 · un fallo de red durante la espera no la mata: al volver la red, activa`,
      s8.premium === true && s8.clicks === 0, JSON.stringify(s8));

    // ══ 9 · LA ESPERA SE AGOTA DE VERDAD, Y DEJA SALIDA ════════════════════
    // Se ejecuta la ventana REAL una vez. Es lenta a propósito: acortarla con
    // constantes de prueba certificaría unos números que no son los que corren.
    if (HEAVY) {
      await mount(page);
      const win = await page.evaluate(`JSON.stringify(_AURIX_BILLING_WAIT)`).then(JSON.parse);
      const total = win.firstMs + win.everyMs * (win.maxTries - 1);
      await page.evaluate(`(function(){
        history.replaceState({}, '', location.pathname + '?billing=success');
        _aurixBillingReturnFlow(); return true; })()`);
      const t0 = Date.now();
      await page.waitForFunction(() => !!document.querySelector('.aurix-toast.has-action'), null, { timeout: total + 8000 }).catch(() => {});
      const waited = Date.now() - t0;
      times.push([`${tag} la espera completa hasta el aviso`, waited]);
      const s9 = await read(page);
      ok(`${tag} 9 · la espera se agota dentro de su ventana declarada y publica el aviso`,
        s9.toast !== null && waited <= total + 5000, `esperado ≤${total + 5000} ms, medido ${waited} ms`);
      ok(`${tag} 9b · el aviso ofrece «Comprobar estado» y NO empuja a pagar otra vez`,
        /Comprobar estado|Check status/i.test(String(s9.toast && s9.toast.act)) &&
        !/pagar|pay|comprar|buy/i.test(String(s9.toast && s9.toast.txt)),
        JSON.stringify(s9.toast));
      ok(`${tag} 9c · y la marca sigue ahí: agotarse no es rendirse`,
        typeof s9.pending === 'string', String(s9.pending));
      // Y después de agotada, volver a primer plano SIGUE recuperando solo.
      await flip(page);
      await page.evaluate(`(function(){ window.__W.premiumAt = null; window.__W.flipAt = performance.now(); return true; })()`);
      await foreground(page);
      await waitPremium(page, 8000).catch(() => {});
      const s9d = await read(page);
      times.push([`${tag} primer plano tras agotarse la espera`, s9d.ms]);
      ok(`${tag} 9d · agotada la espera, volver a primer plano AÚN activa solo`,
        s9d.premium === true && s9d.clicks === 0 && s9d.ms !== null && s9d.ms <= TARGET_MS,
        JSON.stringify(s9d));
    }

    // ══ 10 · «COMPROBAR ESTADO» SIGUE SIENDO LA SALIDA MANUAL ══════════════
    // Se conserva, y se conserva como lo que es: recuperación manual. Tenerla
    // no demuestra que la automática funcione, así que no puede anunciarse como
    // si lo hiciera.
    await mount(page);
    await page.evaluate(`_aurixBillingPendingNotice()`);
    await page.waitForTimeout(200);
    const s10 = await read(page);
    ok(`${tag} 10 · la salida manual existe y no se presenta como activación automática`,
      s10.toast !== null && /Comprobar estado|Check status/i.test(String(s10.toast.act)) &&
      !/autom/i.test(String(s10.toast.txt)), JSON.stringify(s10.toast));
    await page.evaluate(`(function(){ window.__ENT_PLAN = 'premium'; return true; })()`);
    await page.click('.aurix-toast-act');
    await page.waitForTimeout(800);
    const s10b = await read(page);
    ok(`${tag} 10b · y cuando el servidor confirma, activa igual que el camino automático`,
      s10b.premium === true && s10b.cover === false, JSON.stringify(s10b));
    // Dos reanudaciones seguidas no dejan dos avisos apilados.
    await mount(page);
    await page.evaluate(`(function(){ _aurixBillingPendingNotice(); _aurixBillingPendingNotice(); return true; })()`);
    await page.waitForTimeout(200);
    ok(`${tag} 10c · reanudar dos veces no apila dos avisos del mismo asunto`,
      await page.evaluate(`document.querySelectorAll('.aurix-toast.has-action').length === 1`));

    await ctx.close();
  }
  await browser.close();
}

// ══ 11 · LO QUE SE FIJA EN EL CÓDIGO ═══════════════════════════════════════
// Las medidas de arriba prueban puntos concretos del tiempo. Lo que garantiza
// que NO haya un hueco peor en ningún otro punto es la cadencia misma, y eso se
// fija aquí. El gate anterior fijaba «≤6 intentos», que era la limitación que
// hacía imposible el objetivo: se sustituye por el invariante que de verdad
// importa —hueco acotado y espera acotada—, no por uno más laxo.
{
  const app = await readFile(join(ROOT, 'app.js'), 'utf8');
  const m = app.match(/const _AURIX_BILLING_WAIT = Object\.freeze\(\{[\s\S]{0,400}?\}\);/);
  ok('11.1 la cadencia está declarada y congelada en un solo sitio', !!m);
  if (m) {
    const every = Number((m[0].match(/everyMs:\s*(\d+)/) || [])[1]);
    const tries = Number((m[0].match(/maxTries:\s*(\d+)/) || [])[1]);
    const first = Number((m[0].match(/firstMs:\s*(\d+)/) || [])[1]);
    const total = first + every * (tries - 1);
    ok(`11.2 el hueco entre intentos es CONSTANTE y ≤${TARGET_MS} ms (medido: ${every})`,
      Number.isFinite(every) && every > 0 && every <= TARGET_MS, 'everyMs=' + every);
    ok(`11.3 la espera está acotada por número y por ventana (${tries} intentos / ${total} ms)`,
      Number.isFinite(tries) && tries > 0 && tries <= 40 && total <= 60000, `tries=${tries} total=${total}`);
  }
  // Sin polling eterno: ningún `setInterval` en el bloque de cobro.
  const blk = app.slice(app.indexOf('// ── VUELTA DEL CHECKOUT'), app.indexOf('function _aurixEntIsCatalogPreview'));
  ok('11.4 la espera no usa `setInterval`: no hay bucle que pueda quedarse suelto',
    !/setInterval\s*\(/.test(blk), 'setInterval en el bloque de cobro');
  ok('11.5 las reanudaciones por primer plano están acotadas y la marca caduca',
    /_AURIX_BILLING_PENDING_MAX_RESUMES = \d+/.test(app) &&
    /_AURIX_BILLING_PENDING_TTL_MS = /.test(app) &&
    /resumes >= _AURIX_BILLING_PENDING_MAX_RESUMES/.test(blk), 'sin cota de reanudaciones');
  // Nada concede Premium sin pasar por el resolver: ni la marca, ni el retorno.
  ok('11.6 ningún camino concede Premium sin que lo diga el resolver del servidor',
    /_aurixBillingConfirmed\(st, /.test(blk) &&
    (blk.match(/st\.plan === 'premium'/g) || []).length >= 3 &&
    !/_aurixEnt\.plan\s*=\s*'premium'/.test(blk), 'concesión local en el bloque de cobro');
  // Los tres caminos —espera, reanudación y salida manual— confirman IGUAL.
  ok('11.7 espera, reanudación y «Comprobar estado» confirman por el mismo owner',
    ['_aurixBillingAwaitServer', '_aurixBillingResumeIfPending', '_aurixBillingRecheck']
      .every(fn => new RegExp(fn + '[\\s\\S]{0,1200}_aurixBillingConfirmed\\(').test(blk)));
}

console.log('\n── TIEMPOS MEDIDOS ────────────────────────────────');
for (const [k, v] of times) console.log(`  ${String(v).padStart(6)} ms   ${k}`);
console.log(`\n  límite del objetivo: ${TARGET_MS} ms desde la confirmación del servidor`);
console.log('  LÍMITE DE ESTA SONDA: la red está simulada y el servidor es local.');
console.log('  NO acredita el recorrido desde un checkout real ni la entrega del webhook.');

console.log('\n════════════════════════════════════════════════');
console.log(`${pass} passed, ${fails.length} failed\n`);
if (fails.length) { console.log('FAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); console.log('\nRESULT: NO-GO'); server.close(); process.exit(1); }
console.log('RESULT: GO');
server.close();
