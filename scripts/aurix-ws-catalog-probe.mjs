#!/usr/bin/env node
/**
 * AURIX · CATÁLOGO DE WORKSPACE — LO QUE SE VE ANTES DE ELEGIR
 * ════════════════════════════════════════════════════════════════════════════
 * El catálogo es la pantalla donde el usuario ELIGE, así que lo que se mide aquí
 * no es si «cabe» sino si cada entrada se reconoce y se puede accionar.
 *
 * Lo primero que fija esta sonda es el defecto que la motivó: el FAVORITO estaba
 * posicionado en absoluto sobre la esquina de la tarjeta, o sea SOBRE la preview.
 * Ninguna medida de desbordamiento lo veía —nada se salía de nada— y la captura sí.
 * Y moverlo de sitio en el marcado NO bastó: había TRES reglas declarando su
 * colocación y las dos últimas ganaban por orden de fuente, así que la estrella
 * seguía en y=200 cuando su fila estaba en y=390. Por eso lo que se mide es la
 * INTERSECCIÓN real entre el botón y la preview DE SU MISMA TARJETA, no la
 * presencia de una regla.
 *
 * Ejecuta Chromium y WebKit sobre la copia de trabajo, o sobre los bytes
 * desplegados con AURIX_WS_URL + AURIX_WS_RESOLVE (WebKit no admite regla de
 * resolución y se declara omitido, como en la sonda de primera pantalla).
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const PUBLIC_URL = process.env.AURIX_WS_URL || '';
const RESOLVE = process.env.AURIX_WS_RESOLVE || '';
const ROOT = process.cwd();
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
               '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon' };
let server = null;
if (!PUBLIC_URL) {
  server = createServer((req, res) => {
    const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!existsSync(p) || p.indexOf(ROOT) !== 0) { res.statusCode = 404; return res.end('no'); }
    res.setHeader('content-type', MIME[extname(p)] || 'application/octet-stream');
    res.end(readFileSync(p));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
}
const ORIGIN = PUBLIC_URL || `http://127.0.0.1:${server.address().port}`;

const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
let chromium, webkit;
try { ({ chromium, webkit } = await import(PW)); }
catch (e) { console.error('\n✗ SIN MOTORES — ' + PW); process.exit(2); }

const AUTH_PATCH = t => String(t)
  .replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')
  .replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0');

let pass = 0; const fails = [];
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n); console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };

const VIEWPORTS = [[360, 740], [390, 844], [768, 1024], [1440, 900]];

// Lo que se mide de cada tarjeta del catálogo, DENTRO de ella misma.
const MEASURE = `(function(){
  var wsh = document.querySelector('#aurixWorkspace .aurix-wsh');
  if (!wsh) return { mounted: false };
  var R = function(e){ var b = e.getBoundingClientRect(); return { t:b.top, b:b.bottom, l:b.left, r:b.right, w:b.width, h:b.height }; };
  var inter = function(a, c){ return !(a.r <= c.l + 0.5 || c.r <= a.l + 0.5 || a.b <= c.t + 0.5 || c.b <= a.t + 0.5); };
  var cards = [].slice.call(wsh.querySelectorAll('.wsh-tpl, .wsh-toolcard'));
  var solape = [], sinAccion = [], toqueCorto = [], sinPreview = [], sinNombre = [], fueraDeCaja = [];
  cards.forEach(function(card, i){
    var cb = R(card);
    var pin = card.querySelector('.wsh-pin');
    // PREVIEWS de esta tarjeta, excluyendo lo que viva dentro del propio botón
    // (su estrella es un <svg> y contarla daría un solape permanente y falso).
    var pvs = [].slice.call(card.querySelectorAll('.wsh-pv-wrap, .wspv, .ws-asset-img, .wsh-toolcover, .wsh-toolcard-ic'))
      .filter(function(e){ return !(pin && pin.contains(e)); });
    if (pin) {
      var pb = R(pin);
      pvs.forEach(function(pv){ var vb = R(pv); if (!vb.w || !vb.h) return; if (inter(pb, vb)) solape.push(i + ':' + (typeof pv.className === 'string' ? pv.className.split(' ')[0] : pv.tagName)); });
      if (Math.min(pb.w, pb.h) < 44) toqueCorto.push(i + ':' + Math.round(Math.min(pb.w, pb.h)));
      if (pb.l < cb.l - 0.5 || pb.r > cb.r + 0.5 || pb.t < cb.t - 0.5 || pb.b > cb.b + 0.5) fueraDeCaja.push('pin' + i);
    }
    if (!pvs.filter(function(e){ var b = R(e); return b.w > 20 && b.h > 20; }).length) sinPreview.push(String(i));
    if (!card.querySelector('.wsh-tool-go, .wsh-pill, .wsh-tier')) sinAccion.push(String(i));
    var nm = card.querySelector('.wsh-tpl-name, .wsh-tool-name');
    if (!nm || !(nm.textContent || '').trim()) sinNombre.push(String(i));
  });
  return { mounted: true, n: cards.length, solape: solape, sinAccion: sinAccion, toqueCorto: toqueCorto,
    sinPreview: sinPreview, sinNombre: sinNombre, fueraDeCaja: fueraDeCaja,
    docX: document.documentElement.scrollWidth > window.innerWidth + 1 };
})`;

async function mount(page) {
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  if (PUBLIC_URL && /login\.html/.test(page.url())) throw new Error('origen no ejercitable sin sesión');
  await page.waitForFunction(`typeof renderWorkspaceHome === 'function' && typeof switchTab === 'function'`, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(`(function(){ var bl=document.getElementById('bootLoader'); if(bl) bl.remove();
    var ar=document.getElementById('appRoot'); if(ar) ar.style.opacity='1';
    document.getElementById('aurixWorkspace').style.display='block'; return true; })()`);
}
async function asPremium(page, L) {
  await page.evaluate(`(function(){
    lang = ${JSON.stringify(L)};
    var f = Object.create(null);
    _AURIX_ENT_CANON.forEach(function(k){ f[k] = (k !== 'workspace.catalog_preview'); });
    _aurixEnt = { loaded:true, loading:false, error:null, plan:'premium', status:'active', source:'plan', validUntil:null, features:f, sources:Object.create(null), fetchedAt:Date.now() };
    _wshView = 'home'; switchTab('workspace'); return true; })()`);
  await page.waitForTimeout(400);
}

console.log('AURIX · CATÁLOGO DE WORKSPACE — favorito, preview y acción');
console.log('origen: ' + ORIGIN + (PUBLIC_URL ? '  (PÚBLICO · bytes desplegados)' : '  (copia de trabajo)') + '\n');

for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  if (ENG === 'WK' && PUBLIC_URL && RESOLVE) { console.log('  (WebKit omitido contra lo público: no admite regla de resolución)'); continue; }
  const browser = await launcher.launch({ args: (ENG === 'CR' && RESOLVE) ? ['--host-resolver-rules=MAP ' + RESOLVE.split('=')[0] + ' ' + RESOLVE.split('=')[1]] : [] });
  for (const [w, h] of VIEWPORTS) {
    for (const L of ['es', 'en']) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 700 ? 2 : 1, reducedMotion: 'reduce' });
      if (PUBLIC_URL) await ctx.route('**/app.js*', async route => {
        const r = await route.fetch(); await route.fulfill({ response: r, body: AUTH_PATCH(await r.text()) });
      });
      else await ctx.route('**/app.js*', async route => {
        const r = await route.fetch(); await route.fulfill({ response: r, body: AUTH_PATCH(await r.text()) });
      });
      const page = await ctx.newPage();
      await mount(page); await asPremium(page, L);
      for (const tab of ['tools', 'templates']) {
        await page.evaluate(`(function(){ _wshView='home'; _wsTab=${JSON.stringify(tab)}; _wshRepaintHome(); return true; })()`);
        await page.waitForTimeout(420);
        const g = await page.evaluate(`(${MEASURE})()`);
        const tag = `${ENG}.${w}×${h} ${L.toUpperCase()} ${tab}`;
        ok(`${tag} el catálogo se monta con sus entradas`, g.mounted === true && g.n > 0, JSON.stringify(g.n));
        // §7 — EL FAVORITO NO PISA LA PREVIEW. La invariante de esta sonda.
        ok(`${tag} el favorito NO se pinta encima de la preview`, g.solape.length === 0, JSON.stringify(g.solape));
        ok(`${tag} …y conserva 44 px de zona pulsable`, g.toqueCorto.length === 0, JSON.stringify(g.toqueCorto));
        ok(`${tag} …y no se sale de su tarjeta`, g.fueraDeCaja.length === 0, JSON.stringify(g.fueraDeCaja));
        // Se reconoce sin leer: cada entrada tiene preview, nombre y una acción.
        ok(`${tag} cada entrada tiene preview, nombre y una acción`,
          g.sinPreview.length === 0 && g.sinNombre.length === 0 && g.sinAccion.length === 0,
          JSON.stringify({ sinPreview: g.sinPreview, sinNombre: g.sinNombre, sinAccion: g.sinAccion }));
        ok(`${tag} sin desbordamiento horizontal del documento`, g.docX === false);
      }
      await ctx.close();
    }
  }
  await browser.close();
}
if (server) server.close();

console.log('\n════════════════════════════════════════════════');
console.log(`${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log('\nRESULT: NO-GO'); process.exit(1); }
console.log('\nRESULT: GO');
