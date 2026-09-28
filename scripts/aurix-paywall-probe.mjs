#!/usr/bin/env node
/**
 * AURIX · EL PAYWALL — QUÉ PROMETE, Y SI LO PROMETIDO EXISTE
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE. El paywall es la única superficie del producto donde una frase
 * falsa cuesta dinero de verdad: quien la lee está a un clic de pagar. El gate de
 * billing ya comprueba el ARMAZÓN comercial (precios del catálogo, anual primero,
 * sin escasez fabricada). Lo que nadie medía es lo que el usuario LEE: que el
 * recuento de capacidades coincida con el catálogo, que no se prometa producto
 * futuro, y que la comparativa «Ya incluido en Free» —que gastaba media pantalla
 * en explicar lo que el usuario YA tiene— haya desaparecido.
 *
 * LO QUE NO SE TOCA, y se comprueba que sigue intacto: importe, divisa,
 * recurrencia, equivalencia mensual, el destino de los botones, el foco, Escape y
 * los tres estados honestos (comprar / gestionar / sin catálogo).
 *
 * LOS PRECIOS SON DE PRUEBA Y SE INYECTAN EN EL CLIENTE. El sandbox no tiene
 * sesión (OTP-only) ni puede leer `billing_prices`, así que se escribe la MISMA
 * superficie que escribiría el servidor. Ninguna cifra de este fichero llega al
 * producto: son la entrada del render, no su contenido.
 *
 *   node scripts/aurix-paywall-probe.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const OUT = join(ROOT, 'docs', 'paywall');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const AUTH_PATCH = x => String(x)
  .replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')
  .replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0');

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const abs = normalize(join(ROOT, p)); if (!abs.startsWith(ROOT)) return res.writeHead(403).end();
    let body = await readFile(abs);
    if (abs.endsWith('app.js')) body = Buffer.from(AUTH_PATCH(String(body)));
    res.writeHead(200, { 'content-type': MIME[extname(abs)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch (_) { res.writeHead(404).end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PUBLIC_URL = String(process.env.AURIX_PW_URL || '').replace(/\/$/, '');
const RESOLVE = String(process.env.AURIX_PW_RESOLVE || '');
const ORIGIN = PUBLIC_URL || `http://127.0.0.1:${server.address().port}`;
const TAGDIR = String(process.env.AURIX_PW_TAG || 'after');

const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
let chromium, webkit;
try { ({ chromium, webkit } = await import(PW)); }
catch (e) {
  console.error('\n✗ SIN MOTORES — ' + PW + '\n  mkdir -p /tmp/aurix-pw && cd /tmp/aurix-pw && npm init -y && npm i playwright && npx playwright install webkit chromium');
  console.error('\nRESULT: NO EJECUTADO (entorno, no candidato)');
  process.exit(2);
}

let pass = 0; const fails = [];
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (info ? '  [' + info + ']' : '')); console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };

console.log('AURIX · PAYWALL — Chromium + WebKit');
console.log('origen: ' + ORIGIN + (PUBLIC_URL ? '  (BYTES DESPLEGADOS)' : '  (copia de trabajo)') + '\n');
mkdirSync(OUT, { recursive: true });

// LA MISMA FORMA QUE DEVUELVE `billing_prices`, con importes de prueba.
const ROWS = [
  { billing_interval: 'year',  amount_cents: 6999, currency: 'EUR', trial_days: 0 },
  { billing_interval: 'month', amount_cents: 799,  currency: 'EUR', trial_days: 0 },
];

// EL IDIOMA SE FIJA ANTES DE ARRANCAR, no con `switchLang()` a posteriori. Dos
// razones, y la segunda es la que manda:
//   · es el camino REAL — quien tiene la app en inglés la abre ya en inglés,
//     no la cambia cada vez;
//   · `switchLang('en')` NO VUELVE en WebKit a 1024 px de ancho, y BLOQUEA el
//     hilo: ni el propio `evaluate` ni ninguno posterior contestan. Repro mínimo
//     —WebKit, viewport 1024×768, cargar index.html, esperar a `switchLang`,
//     llamarlo con 'en'— y el mismo resultado sobre los bytes de HEAD, así que
//     NO lo introduce este bloque. El owner del idioma repinta el Dashboard en
//     la pestaña activa, que es motor EXCLUIDO de este alcance: queda declarado
//     como pendiente con su evidencia, y esta sonda deja de depender de él para
//     poder medir lo que sí es suyo.
async function mount(page, lng) {
  await page.addInitScript(`try { localStorage.setItem('portfolio_lang', ${JSON.stringify(lng)}); } catch (_) {}`);
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(`typeof openAurixPremiumModal === 'function' && typeof switchTab === 'function'`, null, { timeout: 60000 });
  await page.waitForTimeout(700);
  await page.evaluate(`(function(){
    var bl=document.getElementById('bootLoader'); if(bl) bl.remove();
    var ar=document.getElementById('appRoot'); if(ar) ar.style.opacity='1';
    return true; })()`);
  // Y se comprueba que arrancó en el idioma pedido: si el arranque lo ignorara,
  // media sonda estaría midiendo español creyendo que mide inglés.
  const got = await page.evaluate(`(function(){ return lang; })()`);
  if (got !== lng) { fails.push('mount: la app arrancó en ' + got + ' y se pidió ' + lng); console.log('  ✗ mount idioma ' + got + ' ≠ ' + lng); }
  await page.waitForTimeout(200);
}
// La persona + el catálogo, por las MISMAS superficies que escribirían el
// resolver y el servidor. `_aurixBillingPricesLoad` se neutraliza para que el
// repintado asíncrono no borre las filas inyectadas.
const setup = (page, { prem, rows, customer }) => page.evaluate(`(function(){
  var f = Object.create(null);
  if (${!!prem}) _AURIX_ENT_CANON.forEach(function(k){ f[k] = (k !== 'workspace.catalog_preview'); });
  _aurixEnt = { loaded:true, loading:false, error:null, plan:${prem ? "'premium'" : "'free'"}, status:'none', source:'default', validUntil:null, features:f, sources:Object.create(null), fetchedAt:Date.now() };
  _aurixBillingPrices = { loaded:true, loading:false, error:null, rows:${JSON.stringify(rows)}, fetchedAt:Date.now() };
  _aurixBillingPricesLoad = function(){ return Promise.resolve(_aurixBillingPrices); };
  if (${!!customer}) { try { localStorage.setItem('aurix_billing_customer_v1', JSON.stringify({ id:'cus_test' })); } catch(_){} }
  return true; })()`);

const open = page => page.evaluate(`(function(){ openAurixPremiumModal({ source:'probe' }); return true; })()`)
  .then(() => page.waitForTimeout(500));
const close = page => page.evaluate(`(function(){ closeAurixPremiumModal(); return true; })()`)
  .then(() => page.waitForTimeout(350));

const read = page => page.evaluate(`(function(){
  var m = document.querySelector('.aurix-premium-modal');
  if (!m) return JSON.stringify({ present:false });
  var R = function(e){ if(!e) return null; var r=e.getBoundingClientRect();
    return { t:Math.round(r.top), l:Math.round(r.left), w:Math.round(r.width), h:Math.round(r.height), b:Math.round(r.bottom) }; };
  var ov = document.querySelector('.aurix-premium-overlay');
  var text = (m.textContent || '').replace(/\\s+/g,' ').trim();
  var buys = [].slice.call(m.querySelectorAll('[data-premium-buy]'));
  var val  = [].slice.call(m.querySelectorAll('.aurix-premium-value-item'));
  // Contraste real: relación entre el color del texto y el fondo OPACO efectivo
  // (se sube por los ancestros hasta encontrar uno sin transparencia).
  var lum = function(c){ var p=c.match(/[\\d.]+/g).map(Number);
    var f=function(v){ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); };
    return 0.2126*f(p[0])+0.7152*f(p[1])+0.0722*f(p[2]); };
  var bgOf = function(e){ var n=e; while(n && n!==document.documentElement){ var c=getComputedStyle(n).backgroundColor;
    var p=c.match(/[\\d.]+/g); if(p && (p.length<4 || Number(p[3])>=0.98)) return c; n=n.parentElement; }
    return 'rgb(12,18,34)'; };
  var ratio = function(e){ if(!e) return null; var cs=getComputedStyle(e);
    var a=lum(cs.color), b=lum(bgOf(e)); var hi=Math.max(a,b), lo=Math.min(a,b);
    return Math.round(((hi+0.05)/(lo+0.05))*100)/100; };
  var big = function(e){ var cs=getComputedStyle(e); var px=parseFloat(cs.fontSize);
    return px>=24 || (px>=18.66 && Number(cs.fontWeight)>=700); };
  var texts = [].slice.call(m.querySelectorAll('h2,h3,p,li,span,button'))
    .filter(function(e){ return e.children.length===0 && (e.textContent||'').trim().length>1; });
  var worst = null;
  texts.forEach(function(e){ var r=ratio(e); if(r==null) return; var need = big(e) ? 3 : 4.5;
    if (r < need && (!worst || r < worst.r)) worst = { r:r, need:need, txt:(e.textContent||'').trim().slice(0,46), fs:getComputedStyle(e).fontSize }; });
  // Solape / desbordamiento dentro de la caja del modal.
  var spill = [].slice.call(m.querySelectorAll('*')).some(function(e){
    var b=e.getBoundingClientRect(); var mb=m.getBoundingClientRect();
    return b.width>0 && (b.right > mb.right + 1 || b.left < mb.left - 1); });
  return JSON.stringify({
    present:true, box:R(m), overlayScroll: ov ? ov.scrollHeight > ov.clientHeight + 1 : false,
    modalScroll: m.scrollHeight > m.clientHeight + 1,
    text: text,
    hasComparison: !!m.querySelector('.aurix-premium-comparison'),
    hasFreeCol:   !!m.querySelector('.aurix-premium-compare-col.is-free'),
    valueItems: val.length,
    valueTitles: val.map(function(e){ return ((e.querySelector('.aurix-premium-value-t')||{}).textContent||'').trim(); }),
    valueExamples: val.map(function(e){ return ((e.querySelector('.aurix-premium-value-eg')||{}).textContent||'').trim(); }),
    buys: buys.map(function(b){ return b.getAttribute('data-premium-buy'); }),
    buyLabels: buys.map(function(b){ return (b.textContent||'').trim(); }),
    amounts: [].slice.call(m.querySelectorAll('.aurix-premium-price-amount')).map(function(e){ return (e.textContent||'').trim(); }),
    pers: [].slice.call(m.querySelectorAll('.aurix-premium-price-per')).map(function(e){ return (e.textContent||'').trim(); }),
    notes: [].slice.call(m.querySelectorAll('.aurix-premium-plan-note')).map(function(e){ return (e.textContent||'').trim(); }),
    featured: !!m.querySelector('.aurix-premium-plan.is-featured'),
    firstPlanIsYear: (function(){ var p=m.querySelector('.aurix-premium-plan [data-premium-buy]'); return p ? p.getAttribute('data-premium-buy') : null; })(),
    portal: !!m.querySelector('[data-premium-portal]'),
    trust: ((m.querySelector('.aurix-premium-trust-1')||{}).textContent||'').trim(),
    micro: ((m.querySelector('.aurix-premium-microcopy')||{}).textContent||'').trim(),
    closeTap: (function(){ var c=m.querySelector('.aurix-premium-close'); if(!c) return 0;
      var r=c.getBoundingClientRect(); return Math.round(Math.min(r.width,r.height)); })(),
    dialog: m.getAttribute('role') + '/' + m.getAttribute('aria-modal') + '/' + (m.getAttribute('aria-labelledby')||''),
    focus: document.activeElement ? document.activeElement.className : '',
    worst: worst, spill: spill,
  });})()`).then(JSON.parse);

async function newCtx(browser, opts) {
  const ctx = await browser.newContext(opts);
  if (PUBLIC_URL) await ctx.route('**/app.js*', async route => {
    const r = await route.fetch();
    await route.fulfill({ response: r, body: AUTH_PATCH(await r.text()) });
  });
  return ctx;
}

// Las nueve capacidades PUBLICADAS salen del catálogo del propio candidato, no
// de una lista escrita aquí: si mañana se publica una décima, este número sube
// solo y el assert de recuento persigue al producto.
const capsOf = page => page.evaluate(`(function(){
  return _WS_CATALOG.filter(function(e){ return e.published === true; }).length; })()`);

const VIEWPORTS = [[360, 740], [375, 812], [390, 844], [768, 1024], [1024, 768], [1440, 900]];

// UN NAVEGADOR POR IDIOMA, NO UNO POR MOTOR. Con los dos idiomas dentro del
// mismo proceso se abren 26 contextos seguidos, y WebKit se queda colgado
// SIEMPRE en el vigesimotercero: ni excepción ni assert rojo, el driver deja de
// responder y la sonda se eterniza — que es peor que fallar, porque parece que
// sigue trabajando. Es un límite del motor de pruebas, no del candidato: las
// mismas medidas pasan en los dos idiomas cuando cada uno estrena proceso.
// No se reduce la cobertura: se reparte.
for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  if (ENG === 'WK' && PUBLIC_URL && RESOLVE) { console.log('  (WebKit omitido contra lo público: no admite regla de resolución)'); continue; }

  for (const lng of ['es', 'en']) {
    const browser = await launcher.launch({ args: (ENG === 'CR' && RESOLVE) ? ['--host-resolver-rules=MAP ' + RESOLVE.split('=')[0] + ' ' + RESOLVE.split('=')[1]] : [] });
    for (const [w, h] of VIEWPORTS) {
      const ctx = await newCtx(browser, { viewport: { width: w, height: h }, deviceScaleFactor: w < 700 ? 2 : 1, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await mount(page, lng);
      const nCaps = await capsOf(page);
      await setup(page, { prem: false, rows: ROWS, customer: false });
      await open(page);
      const r = await read(page);
      const tag = `${ENG}.${w}×${h} ${lng.toUpperCase()}`;

      ok(`${tag} el paywall abre`, r.present === true);
      if (!r.present) { await ctx.close(); continue; }

      // ── §8 · LO QUE SE RETIRA ──────────────────────────────────────────────
      ok(`${tag} la comparativa «Ya incluido en Free» NO existe`,
        r.hasComparison === false && r.hasFreeCol === false,
        JSON.stringify({ comp: r.hasComparison, free: r.hasFreeCol }));
      ok(`${tag} y su espacio explica valor Premium, con ejemplo comprobable`,
        r.valueItems >= 2 && r.valueExamples.every(x => x.length > 8),
        JSON.stringify({ n: r.valueItems, eg: r.valueExamples }));
      // Lo cazó este mismo fichero en su primera pasada: un parámetro que a veces
      // era clave i18n y a veces texto ya resuelto hacía `t('Las 9 capacidades…')`
      // y publicaba «undefined» en la pantalla que cobra. Vale para cualquier
      // clave que se rompa en el futuro, no sólo para aquella.
      ok(`${tag} ni una clave sin resolver en la pantalla que cobra`,
        !/undefined|\[object |NaN/.test(r.text), r.text.slice(0, 200));
      // Ninguna promesa abierta sobre producto futuro.
      ok(`${tag} ninguna promesa sobre lo que Aurix publique en el futuro`,
        !/a partir de ahora|próximamente|proximamente|from now on|coming soon|and whatever/i.test(r.text),
        r.text.slice(0, 120));

      // ── §8 · LO QUE SE AFIRMA TIENE QUE SER CIERTO ─────────────────────────
      // El recuento escrito tiene que ser el del CATÁLOGO. Se lee el número que
      // aparece junto a «capacidades»/«capabilities», sea cifra o palabra.
      const WORD = { 8: /\bocho\b|\beight\b/i, 9: /\bnueve\b|\bnine\b/i, 10: /\bdiez\b|\bten\b/i };
      const wrong = Object.keys(WORD).map(Number).filter(n => n !== nCaps && WORD[n].test(r.text));
      ok(`${tag} el recuento de capacidades coincide con el catálogo (${nCaps})`,
        wrong.length === 0 && (new RegExp('\\b' + nCaps + '\\b').test(r.text) || WORD[nCaps].test(r.text)),
        JSON.stringify({ nCaps, wrong, has: r.text.slice(0, 160) }));

      // ── LO COMERCIAL, INTACTO ──────────────────────────────────────────────
      ok(`${tag} anual primero y destacado`,
        r.firstPlanIsYear === 'year' && r.featured === true,
        JSON.stringify({ first: r.firstPlanIsYear, feat: r.featured }));
      ok(`${tag} los dos importes salen del catálogo, con su divisa y recurrencia`,
        r.buys.join(',') === 'year,month' && r.amounts.length === 2 &&
        r.amounts.every(a => /69[.,]99|7[.,]99/.test(a) && /€|EUR/.test(a)) && r.pers.length === 2,
        JSON.stringify({ buys: r.buys, amounts: r.amounts, pers: r.pers }));
      ok(`${tag} la equivalencia mensual y el ahorro se siguen calculando`,
        r.notes.some(n => /5[.,]83|8[.,]33|27|%/.test(n)), JSON.stringify(r.notes));
      ok(`${tag} renovación/cargo y el aviso de Stripe siguen ahí`,
        r.trust.length > 10 && r.micro.length > 10, JSON.stringify({ t: r.trust, m: r.micro }));

      // ── ACCESIBILIDAD Y GEOMETRÍA ──────────────────────────────────────────
      ok(`${tag} el diálogo se declara y se etiqueta`,
        r.dialog === 'dialog/true/aurixPremiumTitle', r.dialog);
      ok(`${tag} el foco entra en el diálogo al abrir`,
        /aurix-premium-close/.test(r.focus), r.focus);
      ok(`${tag} el cierre es un objetivo táctil usable`, r.closeTap >= 34, String(r.closeTap));
      ok(`${tag} nada se pinta fuera de la caja del modal`, r.spill === false);
      ok(`${tag} si no cabe, se DESPLAZA (nunca se recorta)`,
        r.box.t >= -1 && (r.box.h <= h + 1 || r.modalScroll || r.overlayScroll),
        JSON.stringify({ box: r.box, vh: h, ms: r.modalScroll, os: r.overlayScroll }));
      ok(`${tag} contraste: normal ≥4,5:1 · grande y controles ≥3:1`,
        r.worst === null, r.worst ? JSON.stringify(r.worst) : '');

      await page.screenshot({ path: join(OUT, `${TAGDIR}-paywall-${lng}-${w}x${h}-${ENG}.png`), fullPage: w < 700 });

      // ── ESCAPE Y DEVOLUCIÓN DE FOCO ────────────────────────────────────────
      if (w === 390) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        const gone = await page.evaluate(`(function(){ var o=document.querySelector('.aurix-premium-overlay');
          return !o || getComputedStyle(o).display === 'none' || !o.classList.contains('is-open'); })()`);
        ok(`${tag} Escape cierra el diálogo`, gone === true);
      }
      await ctx.close();
    }
    await browser.close();
  }

  // ── LOS OTROS DOS ESTADOS HONESTOS, una vez por motor ────────────────────
  {
    const browser = await launcher.launch({ args: (ENG === 'CR' && RESOLVE) ? ['--host-resolver-rules=MAP ' + RESOLVE.split('=')[0] + ' ' + RESOLVE.split('=')[1]] : [] });
    const ctx = await newCtx(browser, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await mount(page, 'es');

    await setup(page, { prem: true, rows: ROWS, customer: true });
    await open(page);
    const m = await read(page);
    ok(`${ENG}.cliente · gestionar plan, sin ofrecer una segunda compra`,
      m.portal === true && m.buys.length === 0, JSON.stringify({ portal: m.portal, buys: m.buys }));
    ok(`${ENG}.cliente · tampoco aquí hay comparativa Free`, m.hasComparison === false);
    await page.screenshot({ path: join(OUT, `${TAGDIR}-paywall-managed-1440x900-${ENG}.png`) });
    await close(page);

    await setup(page, { prem: false, rows: [], customer: false });
    await page.evaluate(`(function(){ try { localStorage.removeItem('aurix_billing_customer_v1'); } catch(_){} return true; })()`);
    await open(page);
    const e = await read(page);
    ok(`${ENG}.sin catálogo · no se ofrece comprar, y se dice`,
      e.buys.length === 0 && /disponible|available/i.test(e.text),
      JSON.stringify({ buys: e.buys }));
    await page.screenshot({ path: join(OUT, `${TAGDIR}-paywall-empty-1440x900-${ENG}.png`) });
    await ctx.close();
    await browser.close();
  }
}

server.close();
console.log('\n════════════════════════════════════════════════');
console.log(pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { console.log('\nFAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); console.log('\nRESULT: NO-GO'); process.exit(1); }
console.log('\nRESULT: GO — capturas en docs/paywall/');
process.exit(0);
