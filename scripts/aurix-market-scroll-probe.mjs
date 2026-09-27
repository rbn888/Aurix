#!/usr/bin/env node
/**
 * AURIX · §26 — QUE SE ENTIENDA QUE HAY MÁS ABAJO
 * ════════════════════════════════════════════════════════════════════════════
 * INCIDENCIA: la lista de Market «parece cortada abajo y apenas se entiende que
 * puede hacerse scroll». Era cierto: el contenedor desplaza pero no lo DICE, y en
 * móvil la barra está oculta a propósito por una decisión anterior, así que el
 * indicio no podía ser la barra.
 *
 * Lo que se exige aquí son los TRES estados, y sobre todo el primero:
 *   · sin nada que desplazar, NINGÚN indicio — un degradado permanente atenuaría
 *     la última fila con la lista entera a la vista, o sea insinuaría un scroll
 *     que no existe;
 *   · con contenido por debajo, el desvanecido aparece;
 *   · al llegar al final, desaparece.
 *
 * ANDAMIO: el sandbox no tiene precios de mercado, así que la lista llega con una
 * sola fila y no desborda. Las filas que esta sonda añade son ANDAMIO DE PRUEBA
 * para forzar el desbordamiento —miden el mecanismo, que es código propio— y no
 * dato de producto: nada de lo que se inyecta se publica como precio ni se guarda.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
               '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon' };
const server = createServer((req, res) => {
  const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!existsSync(p) || p.indexOf(ROOT) !== 0) { res.statusCode = 404; return res.end('no'); }
  res.setHeader('content-type', MIME[extname(p)] || 'application/octet-stream');
  res.end(readFileSync(p));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
let chromium, webkit;
try { ({ chromium, webkit } = await import(PW)); }
catch (e) { console.error('\n✗ SIN MOTORES — ' + PW); process.exit(2); }

let pass = 0; const fails = [];
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n); console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };
const AUTH = t => String(t)
  .replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')
  .replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0');

console.log('AURIX · §26 — indicio de scroll en Market\n');

for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  const browser = await launcher.launch();
  for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 700 ? 2 : 1, reducedMotion: 'reduce' });
    await ctx.route('**/app.js*', async route => {
      const r = await route.fetch(); await route.fulfill({ response: r, body: AUTH(await r.text()) });
    });
    const page = await ctx.newPage();
    await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(`typeof switchTab === 'function' && typeof _aurixMarketScrollHint === 'function'`, null, { timeout: 60000 });
    await page.waitForTimeout(900);
    await page.evaluate(`(function(){ var bl=document.getElementById('bootLoader'); if(bl) bl.remove();
      var ar=document.getElementById('appRoot'); if(ar) ar.style.opacity='1'; return true; })()`);
    await page.evaluate(`(function(){ lang='es'; switchTab('market'); return true; })()`);
    await page.waitForTimeout(1800);
    const g = await page.evaluate(`(function(){
      var l = document.getElementById('marketList');
      if (!l) return { sinLista: true };
      var mask = function(){ var cs = getComputedStyle(l); return cs.maskImage || cs.webkitMaskImage || 'none'; };
      var out = {};
      _aurixMarketScrollHint(l);
      out.estadoSinDesbordar = l.getAttribute('data-scroll');
      out.maskSinDesbordar = mask();
      out.desbordaDeVerdad = l.scrollHeight > l.clientHeight + 2;
      for (var i = 0; i < 40; i++) { var d = document.createElement('div'); d.className = 'market-row'; d.style.height = '56px'; d.textContent = 'andamio ' + i; l.appendChild(d); }
      _aurixMarketScrollHint(l);
      out.estadoConMas = l.getAttribute('data-scroll');
      out.maskConMas = mask();
      out.overflowY = getComputedStyle(l).overflowY;
      l.scrollTop = l.scrollHeight;
      return new Promise(function(res){ setTimeout(function(){
        out.estadoAlFinal = l.getAttribute('data-scroll');
        out.maskAlFinal = mask();
        // Y que el scroll REAL dispare el recálculo por sí solo, sin llamar a la función.
        l.scrollTop = 0;
        setTimeout(function(){ out.estadoAlVolverArriba = l.getAttribute('data-scroll'); res(out); }, 180);
      }, 220); }); })()`);
    const tag = `${ENG}.${w}`;
    ok(`${tag} la lista existe y es un contenedor desplazable`, !g.sinLista && g.overflowY === 'auto', JSON.stringify(g.overflowY));
    ok(`${tag} sin nada que desplazar NO se insinúa scroll`,
      g.desbordaDeVerdad === true || (g.estadoSinDesbordar === null && g.maskSinDesbordar === 'none'),
      JSON.stringify([g.desbordaDeVerdad, g.estadoSinDesbordar, g.maskSinDesbordar]));
    ok(`${tag} con contenido por debajo, el indicio aparece`,
      g.estadoConMas === 'more' && /gradient/.test(g.maskConMas || ''), JSON.stringify([g.estadoConMas, g.maskConMas]));
    ok(`${tag} al llegar al final, el indicio desaparece`,
      g.estadoAlFinal === 'end' && g.maskAlFinal === 'none', JSON.stringify([g.estadoAlFinal, g.maskAlFinal]));
    ok(`${tag} y el propio scroll recalcula el estado, sin que nadie lo pida`,
      g.estadoAlVolverArriba === 'more', JSON.stringify(g.estadoAlVolverArriba));
    await ctx.close();
  }
  await browser.close();
}
server.close();

console.log('\n════════════════════════════════════════════════');
console.log(`${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log('\nRESULT: NO-GO'); process.exit(1); }
console.log('\nRESULT: GO');
