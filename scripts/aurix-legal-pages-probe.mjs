#!/usr/bin/env node
/**
 * AURIX · SOPORTE Y LEGALES, PÚBLICAS DE VERDAD (M.04 §2)
 * ════════════════════════════════════════════════════════════════════════════
 * QUÉ VIGILA, y por qué no basta con «existe el fichero»: estas tres páginas
 * van a ser las URL que el fundador copie en Stripe, así que la afirmación que
 * hay que demostrar es que ABREN CONTENIDO REAL SIN SESIÓN, en los dos idiomas,
 * en móvil y en escritorio, y que la dirección de soporte publicada es
 * EXACTAMENTE la que existe. Una errata en el correo no rompe nada visible: hace
 * que el soporte no llegue a nadie, y eso no lo caza ningún gate de sintaxis.
 * (La había: `aurixsystemoficial@` con una efe.)
 *
 * RE-DECIDIDO (cierre mínimo de páginas legales, 2026-10-26): el contenido público
 * NO lleva avisos de borrador, huecos «PENDIENTE» ni notas internas. Lo que falta
 * (los datos del titular) se declara con UNA nota profesional en el Aviso legal
 * (`#titular`), única ubicación de esos datos; Privacidad y Condiciones enlazan ahí.
 * Ver docs/AURIX-LEGAL-PAGES.md.
 *
 *   node scripts/aurix-legal-pages-probe.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const served = [];
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const abs = normalize(join(ROOT, p)); if (!abs.startsWith(ROOT)) return res.writeHead(403).end();
    const body = await readFile(abs);
    served.push(p);
    res.writeHead(200, { 'content-type': MIME[extname(abs)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch (_) { served.push('404:' + req.url); res.writeHead(404).end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
let chromium, webkit;
try { ({ chromium, webkit } = await import(PW)); }
catch (e) { console.error('\n✗ SIN MOTORES — ' + PW + '\nRESULT: NO EJECUTADO (entorno, no candidato)'); process.exit(2); }

let pass = 0; const fails = [];
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (info ? '  [' + info + ']' : '')); console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };

// La dirección REAL. Escrita una sola vez aquí para que la prueba no pueda
// heredar la errata que está buscando.
const MAIL = ['aurixsystem', 'official', '@gmail.com'].join('');
const PAGES = [
  { file: 'privacy.html',      es: 'Política de privacidad',  en: 'Privacy policy',   owner: true },
  { file: 'terms.html',        es: 'Condiciones de servicio', en: 'Terms of service', owner: true },
  { file: 'legal-notice.html', es: 'Aviso legal',             en: 'Legal notice' },
  { file: 'support.html',      es: 'Soporte',                 en: 'Support' },
];
// El orden del pie en las cuatro páginas (y en la landing): Privacidad · Condiciones · Aviso legal · Soporte.
const FOOT = ['privacy.html', 'terms.html', 'legal-notice.html', 'support.html'];
const OWNER_NOTE = {
  es: 'Información del titular: los datos identificativos exigibles se incorporarán antes del inicio de la prestación comercial definitiva.',
  en: 'Service operator information: the required identification details will be added before the definitive commercial launch.',
};
const INTERNAL = /BORRADOR|DRAFT|PENDIENTE|PENDING|TODO|lg-todo|\$\{|\{\{/;
const VIEWPORTS = [[360, 740], [390, 844], [768, 1024], [1440, 900]];

// Lo que se mide en cada página, sobre lo PINTADO.
const MEASURE = `(function(){
  var small = [], taps = [], clipped = [], spill = [];
  var all = document.querySelectorAll('body *');
  for (var i = 0; i < all.length; i++) {
    var e = all[i], b = e.getBoundingClientRect();
    if (!b.width || !b.height) continue;
    var cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    var fs = parseFloat(cs.fontSize) || 99;
    var hasText = false;
    for (var k = 0; k < e.childNodes.length; k++) {
      if (e.childNodes[k].nodeType === 3 && e.childNodes[k].textContent.trim()) { hasText = true; break; }
    }
    if (hasText && fs < 12) small.push((e.className || e.tagName).toString().split(' ')[0] + '=' + fs);
    // Destinos táctiles: los CONTROLES. Un enlace dentro de un párrafo no lo es
    // —WCAG exceptúa explícitamente los enlaces en línea— y exigirle 34 px
    // obligaría a inflar el interlineado de todo el texto legal.
    if (e.matches && e.matches('button, .lg-back, .lg-action, .lg-brand, .lg-foot a')) {
      var m = Math.min(b.width, b.height);
      if (m < 34) taps.push((e.className || e.tagName).toString().split(' ')[0] + '=' + Math.round(m));
    }
    // Un <span> con nowrap pinta fuera de su caja sin recortar: 'scrollWidth'
    // es lo único que lo delata.
    if (hasText && e.scrollWidth > e.clientWidth + 1) clipped.push((e.className || e.tagName).toString().split(' ')[0] + ':' + e.scrollWidth + '>' + e.clientWidth);
    // Y el texto, dentro de su tarjeta.
    var card = e.closest ? e.closest('.lg-card') : null;
    if (card && hasText && !e.querySelector('*')) {
      var cb = card.getBoundingClientRect();
      if (b.right > cb.right - 1 || b.left < cb.left + 1) spill.push((e.className || e.tagName).toString().split(' ')[0]);
    }
  }
  var u = function(a){ return Array.from(new Set(a)); };
  return {
    lang: document.documentElement.lang,
    title: document.title,
    // El título del bloque VISIBLE, no el primero del DOM: las dos versiones
    // conviven en la página y el español va antes, así que un querySelector
    // ingenuo devolvería siempre el español y la prueba del inglés sería falsa.
    h1: ((document.querySelector('[data-lang-block="' + (document.documentElement.lang === 'en' ? 'en' : 'es') + '"] .lg-title')) || {}).textContent || '',
    text: document.body.innerText,
    draft: !!document.querySelector('.lg-draft'),
    todos: document.querySelectorAll('.lg-todo').length,
    foot: Array.prototype.map.call(document.querySelectorAll('.lg-foot a[data-lg-link]'), function(a){ return a.getAttribute('data-lg-link'); }),
    ownerLinks: Array.prototype.filter.call(document.querySelectorAll('a[data-lg-hash="titular"]'), function(a){ return a.offsetParent !== null; }).map(function(a){ return a.getAttribute('href'); }),
    owner: (function(){ var o = document.getElementById('titular'); if (!o) return null; var p = Array.prototype.filter.call(o.querySelectorAll('p'), function(x){ return x.offsetParent !== null; });
      var cs = p[0] ? getComputedStyle(p[0]) : null; return { vis: o.offsetParent !== null, text: p.map(function(x){ return x.textContent.trim(); }), fs: cs ? parseFloat(cs.fontSize) : 0, color: cs ? cs.color : '', h2: (o.querySelector('h2') || {}).innerText || '' }; })(),
    toc: Array.prototype.filter.call(document.querySelectorAll('.lg-toc a'), function(a){ return a.offsetParent !== null; }).map(function(a){ return a.getAttribute('href'); }),
    headings: Array.prototype.filter.call(document.querySelectorAll('h1, h2'), function(h){ return h.offsetParent !== null; }).map(function(h){ return h.tagName; }),
    // Los enlaces internos que la página ofrece.
    hrefs: Array.prototype.map.call(document.querySelectorAll('a[href]'), function(a){ return a.getAttribute('href'); }),
    scripts: Array.prototype.map.call(document.querySelectorAll('script[src]'), function(s){ return s.getAttribute('src'); }),
    docOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    small: u(small), taps: u(taps), clipped: u(clipped), spill: u(spill),
  };
})`;

console.log('AURIX · soporte y legales — públicas, en dos idiomas y sin sesión\n');

for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  const browser = await launcher.launch();
  for (const [w, h] of VIEWPORTS) {
    // CONTEXTO LIMPIO: sin sesión, sin almacenamiento heredado. Es la condición
    // que hay que demostrar —«accesibles sin sesión»—, no un detalle del montaje.
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 700 ? 2 : 1, reducedMotion: 'reduce', locale: 'es-ES' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message).slice(0, 80)));
    for (const P of PAGES) {
      const tag = `${ENG}.${w}×${h} ${P.file}`;
      const resp = await page.goto(ORIGIN + '/' + P.file, { waitUntil: 'domcontentloaded' });
      // Visitante NUEVO en cada página: la elección de idioma se recuerda a
      // propósito (se comprueba al final), y sin limpiar aquí la elección de la
      // página anterior contaminaría la prueba del idioma por defecto.
      await page.evaluate(`(function(){ try { localStorage.clear(); } catch (_) {} })()`);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(140);
      const g = await page.evaluate(MEASURE + '()');

      ok(`${tag} abre sin sesión y con contenido real`,
        resp.status() === 200 && g.h1.trim().length > 0 && g.text.length > 600 && errors.length === 0,
        JSON.stringify({ http: resp.status(), h1: g.h1.trim(), chars: g.text.length, err: errors }));
      // No carga la app: si cargara `app.js` heredaría su arranque, su auth y su
      // redirección a login — y dejaría de ser una página pública.
      ok(`${tag} no carga la app (ni auth, ni redirección a login)`,
        g.scripts.length === 1 && /legal\.js/.test(g.scripts[0]) &&
        !/app\.js|supabase/.test(g.scripts.join(',')), JSON.stringify(g.scripts));
      ok(`${tag} publica la dirección de soporte EXACTA`,
        g.text.includes(MAIL) && !/oficial@/.test(g.text),
        (g.text.match(/aurixsystem\S*@\S+/g) || ['(ninguna)']).join(' '));
      // El contexto es `es-ES`, así que el idioma del navegador manda y se ve
      // español. No se afirma «español por defecto» a secas: eso sería falso
      // para un usuario con el navegador en inglés, que es a quien sirve la
      // versión EN.
      ok(`${tag} un navegador en español la abre en español, sin tocar nada`,
        g.lang === 'es' && g.h1.trim() === P.es, JSON.stringify({ lang: g.lang, h1: g.h1.trim() }));
      // Contenido público limpio: sin aviso de borrador, sin huecos y sin rótulos internos.
      ok(`${tag} ES: sin borrador, sin «PENDIENTE» ni notas internas visibles`,
        !g.draft && g.todos === 0 && !INTERNAL.test(g.text), (g.text.match(INTERNAL) || ['—'])[0]);
      ok(`${tag} un solo h1 y secciones h2 (estructura de encabezados)`,
        g.headings[0] === 'H1' && g.headings.filter(x => x === 'H1').length === 1 && g.headings.filter(x => x === 'H2').length >= 3, g.headings.join(','));
      ok(`${tag} pie: Privacidad · Condiciones · Aviso legal · Soporte`, JSON.stringify(g.foot) === JSON.stringify(FOOT), JSON.stringify(g.foot));
      if (P.owner) ok(`${tag} identifica al titular enlazando al Aviso legal (#titular), sin repetir datos`,
        g.ownerLinks.length === 1 && /^legal-notice\.html\?lang=es#titular$/.test(g.ownerLinks[0]), JSON.stringify(g.ownerLinks));
      if (P.file === 'legal-notice.html') {
        ok(`${tag} titular: sólo la nota aprobada (ES), legible y con contraste`,
          g.owner && g.owner.vis && g.owner.text.length === 1 && g.owner.text[0] === OWNER_NOTE.es && g.owner.fs >= 15 && /rgba?\(25[0-5], 25[0-5], 25[0-5]/.test(g.owner.color), JSON.stringify(g.owner));
        ok(`${tag} índice con ancla directa a la información del titular`, g.toc.includes('#titular') && g.toc.length >= 6, JSON.stringify(g.toc));
      }
      ok(`${tag} sin desbordamiento horizontal, sin recortes y sin texto fuera de su tarjeta`,
        g.docOverflowX === false && g.clipped.length === 0 && g.spill.length === 0,
        JSON.stringify({ docX: g.docOverflowX, recortado: g.clipped, fuera: g.spill }));
      ok(`${tag} legible y tocable: ≥12 px y objetivos ≥34 px`,
        g.small.length === 0 && g.taps.length === 0,
        JSON.stringify({ pequeno: g.small, toque: g.taps }));

      // ── EL IDIOMA ─────────────────────────────────────────────────────────
      await page.click('[data-set-lang="en"]');
      await page.waitForTimeout(120);
      const en = await page.evaluate(MEASURE + '()');
      ok(`${tag} el inglés cambia el CONTENIDO, no sólo un rótulo`,
        en.lang === 'en' && en.h1.trim() === P.en && /AURIX —/.test(en.title) &&
        !en.text.includes(P.es), JSON.stringify({ lang: en.lang, h1: en.h1.trim(), title: en.title }));
      ok(`${tag} EN: sin borrador, sin «PENDING» ni notas internas visibles`,
        !en.draft && en.todos === 0 && !INTERNAL.test(en.text), (en.text.match(INTERNAL) || ['—'])[0]);
      if (P.owner) ok(`${tag} EN: el enlace al titular conserva idioma y ancla`,
        en.ownerLinks.length === 1 && /^legal-notice\.html\?lang=en#titular$/.test(en.ownerLinks[0]), JSON.stringify(en.ownerLinks));
      if (P.file === 'legal-notice.html') ok(`${tag} titular: sólo la nota aprobada (EN)`,
        en.owner && en.owner.vis && en.owner.text.length === 1 && en.owner.text[0] === OWNER_NOTE.en, JSON.stringify(en.owner));
      // Y el idioma elegido viaja a las otras páginas: cambiar a inglés en
      // Soporte y aterrizar en Privacidad en español sería cambiar de idioma a
      // mitad de lectura.
      ok(`${tag} el idioma elegido viaja en los enlaces internos`,
        en.hrefs.filter(x => /\.html\?lang=en$/.test(x)).length >= 2,
        JSON.stringify(en.hrefs));
    }
    // ── LA NAVEGACIÓN ENTRE ELLAS FUNCIONA DE VERDAD ────────────────────────
    await page.goto(ORIGIN + '/support.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(`(function(){ try { localStorage.clear(); } catch (_) {} })()`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.click('.lg-foot a[href^="privacy.html"]');
    await page.waitForTimeout(160);
    ok(`${ENG}.${w}×${h} el pie navega entre las tres páginas (nada de enlaces muertos)`,
      /privacy\.html/.test(page.url()) &&
      (await page.evaluate(`(document.querySelector('[data-lang-block="es"] .lg-title')||{}).textContent`) || '').length > 0,
      page.url());
    // Desde Privacidad, «Responsable» lleva al bloque del titular y lo deja a la vista.
    await page.goto(ORIGIN + '/privacy.html', { waitUntil: 'domcontentloaded' });
    await page.click('[data-lang-block="es"] a[data-lg-hash="titular"]');
    await page.waitForTimeout(250);
    const own = await page.evaluate(`(function(){ var o = document.getElementById('titular'); var r = o ? o.getBoundingClientRect() : null; return { url: location.pathname + location.hash, inView: !!r && r.top >= 0 && r.top < innerHeight }; })()`);
    ok(`${ENG}.${w}×${h} Privacidad → Aviso legal#titular, a la vista`, own.url === '/legal-notice.html#titular' && own.inView, JSON.stringify(own));
    // Teclado: el índice del Aviso legal se recorre con Tab y su enlace al titular funciona con Enter.
    await page.goto(ORIGIN + '/legal-notice.html', { waitUntil: 'domcontentloaded' });
    await page.focus('[data-lang-block="es"] .lg-toc a[href="#titular"]');
    const foc = await page.evaluate(`getComputedStyle(document.activeElement).outlineStyle`);
    await page.keyboard.press('Enter'); await page.waitForTimeout(250);
    const kb = await page.evaluate(`(function(){ var r = document.getElementById('titular').getBoundingClientRect(); return { hash: location.hash, inView: r.top >= 0 && r.top < innerHeight }; })()`);
    ok(`${ENG}.${w}×${h} índice por teclado: foco visible y Enter lleva al titular`, foc !== 'none' && kb.hash === '#titular' && kb.inView, JSON.stringify({ foc, kb }));
    // Y la elección de idioma SOBREVIVE al salto: quien pone la página en
    // inglés y abre Condiciones no debe encontrarse el texto en español.
    await page.goto(ORIGIN + '/support.html', { waitUntil: 'domcontentloaded' });
    await page.click('[data-set-lang="en"]');
    await page.waitForTimeout(100);
    await page.goto(ORIGIN + '/terms.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(140);
    ok(`${ENG}.${w}×${h} el idioma elegido se recuerda al cambiar de página`,
      (await page.evaluate(`document.documentElement.lang`)) === 'en',
      await page.evaluate(`document.documentElement.lang`));
    await ctx.close();
  }
  await browser.close();
}

// ── Y LA APP LAS ENLAZA ─────────────────────────────────────────────────────
// De nada sirve publicarlas si no se llega a ellas desde el producto.
{
  const idx = await readFile(join(ROOT, 'index.html'), 'utf8');
  ok('APP · Ajustes enlaza soporte, privacidad y condiciones',
    /href="support\.html"/.test(idx) && /href="privacy\.html"/.test(idx) && /href="terms\.html"/.test(idx));
  ok('APP · el correo de soporte de la app es el EXACTO (la errata costaba todo el soporte)',
    idx.includes('mailto:' + MAIL) && !/aurixsystemoficial/.test(idx),
    (idx.match(/mailto:[^"]+/g) || []).join(' '));
  const land = await readFile(join(ROOT, 'landing/index.html'), 'utf8');
  ok('WEB · la landing ya no tiene enlaces legales desactivados: apuntan a páginas reales',
    !/data-todo="legal-(privacy|terms)"/.test(land) &&
    /app\.aurixsystem\.io\/privacy\.html/.test(land) &&
    /app\.aurixsystem\.io\/terms\.html/.test(land));
  const footer = land.slice(land.indexOf('data-i18n="footer.legal"'), land.indexOf('footer-col--social'));
  const legalOrder = [...footer.matchAll(/data-legal-link="([a-z-]+)"/g)].map(m => m[1]);
  ok('WEB · LEGAL del footer: Privacidad · Condiciones · Aviso legal · Soporte',
    JSON.stringify(legalOrder) === JSON.stringify(['privacy', 'terms', 'legal-notice', 'support']), JSON.stringify(legalOrder));
  // Y el ensamblado del sitio tiene que publicarlas: si no están en la allowlist,
  // el enlace de la app resuelve a 404 en producción con el gate en verde.
  const build = await readFile(join(ROOT, 'scripts/aurix-build-site.mjs'), 'utf8');
  ok('DEPLOY · las cuatro páginas y sus assets están en la allowlist de publicación',
    ['support.html', 'privacy.html', 'terms.html', 'legal-notice.html', 'legal.css', 'legal.js']
      .every(f => new RegExp("'" + f.replace('.', '\\.') + "'").test(build)));
}

console.log('\n════════════════════════════════════════════════');
console.log(`${pass} passed, ${fails.length} failed\n`);
if (fails.length) { console.log('FAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); console.log('\nRESULT: NO-GO'); server.close(); process.exit(1); }
console.log('RESULT: GO');
server.close();
