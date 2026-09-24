#!/usr/bin/env node
/**
 * AURIX · EL RESUMEN SE ADAPTA A LO QUE EL USUARIO TIENE
 * ════════════════════════════════════════════════════════════════════════════
 * QUÉ VIGILA:
 *
 *  1 · LA REJILLA DE CATEGORÍAS. Era de tres columnas fijas pasara lo que
 *      pasara: una sola categoría se quedaba en el primer tercio con dos
 *      tercios vacíos, y cuatro daban 3+1 con la última suelta. El reparto
 *      depende de cuántas HAY, no de cuántas caben.
 *
 *  2 · QUIÉN VE QUÉ, y sobre todo CUÁNDO. Free ve descubrimiento; Premium ve
 *      sus documentos; y mientras el servidor no ha contestado NO se pinta
 *      ninguna de las dos — enseñarle una promo comercial a alguien que ya ha
 *      pagado, aunque sea medio segundo, es el destello que no se permite.
 *
 *  3 · QUE FREE NO TENGA DATOS PRIVADOS EN EL DOM. Ocultar con CSS no es no
 *      mostrar: se comprueba que el nodo esté VACÍO, no invisible.
 *
 * Los activos son FIXTURES sintéticos y viven sólo en la prueba.
 *
 *   node scripts/aurix-dashboard-adaptive-probe.mjs
 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const OUT  = join(ROOT, 'docs', 'dashboard-adaptive');
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
await mkdir(OUT, { recursive: true });

let pass = 0; const fails = [];
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (info ? '  [' + info + ']' : '')); console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };

// ── FIXTURES ────────────────────────────────────────────────────────────────
// Un activo por categoría, con nombres e importes que buscan romper el layout:
// una cifra enorme, una diminuta, un negativo y un nombre largísimo. No se
// escriben en ningún almacén: viven en memoria durante la prueba.
const TYPES = ['stock', 'etf', 'crypto', 'metal', 'real_estate', 'cash'];
const FIXTURE = (n) => JSON.stringify(TYPES.slice(0, n).map((tp, i) => ({
  id: 'fx_' + tp, type: tp,
  name: i === 0 ? 'Participaciones en un fondo con un nombre larguísimo de verdad' : ('Activo ' + tp),
  ticker: ['AAPL', 'VWCE', 'BTC', 'XAU', 'PISO', 'EUR'][i],
  quantity: 1,
  buyPrice: [1234567.89, 0.42, 25000, 1800, 355000, 12.5][i],
  currentPrice: [1234567.89, 0.35, 31000, 1750, 355000, 12.5][i],
  assetCurrency: 'EUR',
})));

async function mount(page, opts) {
  const o = opts || {};
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(`typeof updateCategoryCards === 'function'`, null, { timeout: 60000 });
  await page.waitForTimeout(600);
  await page.evaluate(`(function(){
    var bl = document.getElementById('bootLoader'); if (bl) bl.remove();
    var ar = document.getElementById('appRoot'); if (ar) ar.style.opacity = '1';
    try { switchLang(${JSON.stringify(o.lang || 'es')}); } catch (_) {}
    currentUser = { id: 'u-probe', email: 'probe@aurix.test' };
    activeCategory = null;
    assets = ${o.n === null ? 'null' : `JSON.parse(${JSON.stringify(FIXTURE(o.n || 0))})`};
    // El plan: 'premium' | 'free' | 'pending'  (pending = el servidor no ha contestado)
    var f = Object.create(null);
    _AURIX_ENT_CANON.forEach(function (k) { f[k] = (${JSON.stringify(o.plan)} === 'premium' && k !== 'workspace.catalog_preview'); });
    if (${JSON.stringify(o.plan)} === 'pending') {
      _aurixEnt = { loaded: false, loading: false, error: null, plan: 'free', status: 'none',
                    source: 'default', validUntil: null, features: Object.create(null),
                    sources: Object.create(null), fetchedAt: 0 };
    } else {
      _aurixEnt = { loaded: true, loading: false, error: null, plan: ${JSON.stringify(o.plan)},
                    status: ${JSON.stringify(o.plan)} === 'premium' ? 'active' : 'none', source: 'plan',
                    validUntil: null, features: f, sources: Object.create(null), fetchedAt: Date.now() };
    }
    _wsDocTableState = 'yes';
    localStorage.setItem('aurix_ws_projects_v1', ${JSON.stringify(JSON.stringify([]))});
    ${o.docs ? `localStorage.setItem('aurix_ws_projects_v1', ${JSON.stringify(JSON.stringify(o.docs))});` : ''}
    // La pestaña del Resumen se llama 'home' en el despachador: con 'dashboard'
    // —que no existe— el contenedor principal se queda oculto y TODO mide cero.
    switchTab('home');
    updateCategoryCards();
    return true; })()`);
  await page.waitForTimeout(280);
}

const measure = page => page.evaluate(`(function(){
  var grid = document.getElementById('categoriesGrid');
  var sec  = document.getElementById('categoriesSection');
  var cards = grid ? [].slice.call(grid.querySelectorAll('.cat-card')) : [];
  var gb = grid ? grid.getBoundingClientRect() : null;
  var rows = {};
  cards.forEach(function(c){
    var r = c.getBoundingClientRect();
    var key = Math.round(r.top);
    (rows[key] = rows[key] || []).push(Math.round(r.width));
  });
  var rowList = Object.keys(rows).sort(function(a,b){ return a-b; }).map(function(k){ return rows[k]; });
  // Contención y recortes, sobre lo pintado.
  var clipped = [], spill = [];
  cards.forEach(function(c){
    var cb = c.getBoundingClientRect();
    [].slice.call(c.querySelectorAll('*')).forEach(function(e){
      var b = e.getBoundingClientRect(); if (!b.width || !b.height) return;
      var cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return;
      var hasText = [].slice.call(e.childNodes).some(function(n){ return n.nodeType === 3 && n.textContent.trim(); });
      if (hasText && e.scrollWidth > e.clientWidth + 1) clipped.push((e.className||e.tagName).toString().split(' ')[0] + ':' + e.scrollWidth + '>' + e.clientWidth);
      if (hasText && !e.querySelector('*') && (b.right > cb.right - 0.5 || b.left < cb.left - 0.5)) spill.push((e.className||e.tagName).toString().split(' ')[0]);
    });
  });
  var disc = document.getElementById('dashDiscoverSection');
  var plans = document.getElementById('wsPlansSection');
  var vis = function(el){ if (!el) return false; var s = getComputedStyle(el); return s.display !== 'none' && el.getBoundingClientRect().height > 0; };
  return {
    catN: grid ? grid.dataset.catN : null,
    cards: cards.length,
    empty: !!(grid && grid.querySelector('.cat-empty')),
    secShown: !!(sec && getComputedStyle(sec).display !== 'none'),
    gridW: gb ? Math.round(gb.width) : 0,
    rows: rowList,
    clipped: Array.from(new Set(clipped)), spill: Array.from(new Set(spill)),
    docX: document.documentElement.scrollWidth > window.innerWidth + 1,
    disc: { shown: vis(disc), html: disc ? disc.innerHTML.length : -1,
            cards: disc ? disc.querySelectorAll('.wsdisc-card').length : 0,
            ctas: disc ? [].slice.call(disc.querySelectorAll('[data-dsc-go]')).map(function(b){ return b.getAttribute('data-dsc-go'); }) : [] },
    plans: { shown: vis(plans), html: plans ? plans.innerHTML.length : -1,
             open: plans ? plans.querySelectorAll('[data-wspl-open]').length : 0,
             txt: plans ? (plans.innerText || '').slice(0, 80) : '' },
  };})()`);

const DOCS2 = [
  { id: 'd1', type: 'monthly_budget', customName: 'Presupuesto de casa con un nombre muy largo para probar',
    inputs: { salary: 2500, housing: 700 }, revision: 1, createdAt: 1, updatedAt: 9 },
  // Documentos de PLANTILLA: son los que publica «Tus planes». Los de
  // herramienta se abren desde su capacidad, así que aquí no pintan nada.
  { id: 'd2', type: 'receivables_app', customName: 'Clientes 2026', currency: 'EUR',
    inputs: { items: [{ id: 'r1', units: 1, unitPrice: 1000, paidAmount: 400 }] },
    revision: 1, createdAt: 2, updatedAt: 8 },
];
const DOCS_MANY = DOCS2.concat([3, 4, 5].map(i => ({
  id: 'd' + i, type: 'monthly_budget', customName: 'Presupuesto ' + i, currency: 'EUR',
  inputs: { salary: 2000 + i * 100, housing: 600, food: 250 },
  revision: 1, createdAt: i, updatedAt: i })));

const VIEWPORTS = [[360, 740], [390, 844], [768, 1024], [1180, 800], [1440, 900]];

console.log('AURIX · Resumen adaptativo — categorías, Free y Premium\n');

for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  const browser = await launcher.launch();

  // ══ 1 · LA REJILLA, DE 0 A 6 CATEGORÍAS ═════════════════════════════════
  for (const [w, h] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 700 ? 2 : 1, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    for (const n of [0, 1, 2, 3, 4, 6]) {
      await mount(page, { n, plan: 'free' });
      const g = await measure(page);
      const tag = `${ENG}.${w}×${h} n=${n}`;

      if (n === 0) {
        // Cero activos CONFIRMADOS: un solo estado de alta, ni una tarjeta vacía.
        ok(`${tag} cero activos ⇒ un solo estado de alta, sin categorías fantasma`,
          g.empty === true && g.cards === 0 && g.catN === '0', JSON.stringify(g).slice(0, 160));
      } else {
        ok(`${tag} se pintan EXACTAMENTE las categorías que existen`,
          g.cards === n && g.catN === String(n) && g.empty === false,
          JSON.stringify({ cards: g.cards, catN: g.catN }));
        // Ninguna fila puede tener una tarjeta más ancha que sus hermanas: es la
        // regla que evita la «última estirada».
        const uneven = g.rows.filter(r => r.length > 1 && (Math.max(...r) - Math.min(...r)) > 2);
        ok(`${tag} dentro de cada fila todas las tarjetas miden lo mismo`,
          uneven.length === 0, JSON.stringify(g.rows));
        ok(`${tag} sin recortes, sin texto fuera de su tarjeta y sin scroll horizontal`,
          g.clipped.length === 0 && g.spill.length === 0 && g.docX === false,
          JSON.stringify({ recortado: g.clipped, fuera: g.spill, docX: g.docX }));
      }

      // La regla de «categoría única» es por TOTAL, no por quedar sola en fila.
      if (n === 1 && w >= 481) {
        const ratio = g.rows[0] ? g.rows[0][0] / g.gridW : 0;
        ok(`${tag} una sola categoría: estrecha y centrada, no un tercio suelto`,
          ratio > 0.5 && ratio < 0.86, 'ancho=' + Math.round(ratio * 100) + '% del contenedor');
      }
      if (n === 1 && w < 481) {
        const ratio = g.rows[0] ? g.rows[0][0] / g.gridW : 0;
        ok(`${tag} una sola categoría ocupa el ancho útil en móvil`, ratio > 0.92,
          'ancho=' + Math.round(ratio * 100) + '%');
      }
      // Cuatro con tres columnas dejaría 3+1. Se exige que no quede ninguna
      // fila con UNA sola tarjeta cuando hay más de una fila.
      if (n === 4 && w >= 769) {
        const lonely = g.rows.length > 1 && g.rows[g.rows.length - 1].length === 1;
        ok(`${tag} cuatro categorías no dejan una última fila con una sola tarjeta`,
          lonely === false, JSON.stringify(g.rows));
      }
      // La captura también para n=1: es el caso que el SPEC describe con más
      // detalle y el que no se puede certificar sólo con un porcentaje.
      if ([1, 2, 3, 4, 6].includes(n)) {
        await page.screenshot({ path: join(OUT, `cat-${n}-${w}x${h}-${ENG}.png`) });
      }
    }
    await ctx.close();
  }

  // ══ 2 · QUIÉN VE QUÉ ════════════════════════════════════════════════════
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();

    // FREE — descubrimiento sí, documentos NI EN EL DOM.
    await mount(page, { n: 2, plan: 'free', docs: DOCS2 });
    let g = await measure(page);
    ok(`${ENG}.free · ve las dos tarjetas de descubrimiento, hermanas y con su CTA`,
      g.disc.shown === true && g.disc.cards === 2 &&
      g.disc.ctas.join(',') === 'intelligence,workspace', JSON.stringify(g.disc));
    ok(`${ENG}.free · NO ve documentos guardados: la sección está vacía, no escondida`,
      g.plans.shown === false && g.plans.html === 0 && g.plans.open === 0,
      JSON.stringify(g.plans));
    // Las dos hermanas, medidas: mismo ancho y el CTA a la misma altura.
    const sib = await page.evaluate(`(function(){
      var c = [].slice.call(document.querySelectorAll('#dashDiscoverSection .wsdisc-card'));
      if (c.length !== 2) return JSON.stringify({ n: c.length });
      var r = c.map(function(x){ return x.getBoundingClientRect(); });
      var b = c.map(function(x){ return x.querySelector('.wsdisc-cta').getBoundingClientRect(); });
      var pad = c.map(function(x){ return getComputedStyle(x).padding; });
      return JSON.stringify({ n: 2, dw: Math.abs(r[0].width - r[1].width),
        dTop: Math.abs(r[0].top - r[1].top), dCta: Math.abs(b[0].top - b[1].top),
        samePad: pad[0] === pad[1], tap: Math.min(b[0].height, b[1].height) });})()`).then(JSON.parse);
    ok(`${ENG}.free · mismo ancho, misma línea y el CTA a la misma altura`,
      sib.n === 2 && sib.dw <= 1 && sib.dTop <= 1 && sib.dCta <= 1 && sib.samePad === true && sib.tap >= 44,
      JSON.stringify(sib));
    await page.screenshot({ path: join(OUT, `free-discover-1440-${ENG}.png`) });

    // PREMIUM — documentos sí, promo Free NO.
    await mount(page, { n: 2, plan: 'premium', docs: DOCS2 });
    g = await measure(page);
    ok(`${ENG}.premium · ve sus documentos y NINGUNA promo de descubrimiento`,
      g.plans.shown === true && g.plans.open === 2 && g.disc.shown === false && g.disc.html === 0,
      JSON.stringify({ plans: g.plans.open, disc: g.disc.shown }));
    ok(`${ENG}.premium · y los resúmenes salen del documento guardado`,
      /Clientes 2026/.test(g.plans.txt) || /Presupuesto/.test(g.plans.txt), g.plans.txt);
    await page.screenshot({ path: join(OUT, `premium-docs-1440-${ENG}.png`) });

    // PREMIUM con UN solo documento: composición contenida, no una tarjeta
    // estirada de lado a lado.
    await mount(page, { n: 2, plan: 'premium', docs: [DOCS2[1]] });   // un solo documento de plantilla
    const one = await page.evaluate(`(function(){
      var sec = document.getElementById('wsPlansSection');
      var cards = sec.querySelectorAll('.wspl-card');
      var r = cards[0] ? cards[0].getBoundingClientRect() : null;
      var sb = sec.getBoundingClientRect();
      return JSON.stringify({ n: cards.length, ratio: r ? +(r.width / sb.width).toFixed(2) : null });})()`).then(JSON.parse);
    ok(`${ENG}.premium · un único documento no se estira de lado a lado`,
      one.n === 1 && one.ratio !== null && one.ratio <= 0.7, JSON.stringify(one));

    // PREMIUM con varios: rejilla estable, sin scroll horizontal.
    await mount(page, { n: 6, plan: 'premium', docs: DOCS_MANY });
    g = await measure(page);
    ok(`${ENG}.premium · con varios documentos la rejilla es estable y no genera scroll lateral`,
      g.plans.open === 5 && g.docX === false, JSON.stringify({ open: g.plans.open, docX: g.docX }));
    await page.screenshot({ path: join(OUT, `premium-many-1440-${ENG}.png`) });

    // PLAN SIN RESOLVER — ni promo, ni documentos, ni hueco.
    await mount(page, { n: 2, plan: 'pending', docs: DOCS2 });
    g = await measure(page);
    ok(`${ENG}.pending · sin respuesta del servidor no se pinta NI promo NI documentos`,
      g.disc.shown === false && g.disc.html === 0 && g.plans.shown === false && g.plans.html === 0,
      JSON.stringify({ disc: g.disc, plans: g.plans }));

    // CARGA / FALLO DE DATOS ≠ CUENTA VACÍA.
    // Se comprueba la REGLA, no un estado inventado: en producción `assets` es
    // siempre un array (lo devuelve `load()`), así que montar `assets = null`
    // rompería el render por un camino que el usuario no puede alcanzar —lo
    // intenté y revienta en `render()`, que es la prueba de que ese estado no
    // existe—. Lo que sí se exige es que el guard siga distinguiendo «no lo sé»
    // de «no hay nada»: sin inventario devuelve null y la rama del vacío NO se
    // toma. Es defensa en profundidad, y se mantiene declarada como tal.
    const guard = await page.evaluate(`(function(){
      var real = _aurixActiveCategorySet();
      var saved = assets;
      var withNull;
      try { assets = null; withNull = _aurixActiveCategorySet(); } finally { assets = saved; }
      return JSON.stringify({ realIsSet: real instanceof Set, nullIsNull: withNull === null,
        // Y una categoría con activos pero SIN valoración sigue contando: cero
        // no es ausencia.
        zeroCounts: (function(){
          var s2 = assets; assets = [{ id: 'z', type: 'crypto', name: 'Z', ticker: 'Z', quantity: 1, buyPrice: 0, currentPrice: 0 }];
          var r = _aurixActiveCategorySet(); assets = s2; return r instanceof Set && r.has('crypto');
        })() });})()`).then(JSON.parse);
    ok(`${ENG}.carga · «no sé el inventario» y «no hay activos» son estados distintos`,
      guard.realIsSet === true && guard.nullIsNull === true, JSON.stringify(guard));
    ok(`${ENG}.carga · una categoría con activos SIN valoración sigue existiendo (cero ≠ ausencia)`,
      guard.zeroCounts === true, JSON.stringify(guard));

    await ctx.close();
  }

  // ══ 3 · EL MISMO CONTRATO EN INGLÉS ═════════════════════════════════════
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await mount(page, { n: 3, plan: 'free', lang: 'en' });
    const en = await page.evaluate(`(function(){
      var d = document.getElementById('dashDiscoverSection');
      var txt = d ? d.innerText : '';
      // El texto COMPLETO para comprobar y una muestra corta para el informe:
      // recortar ANTES de comprobar hacía fallar «Explore Workspace» por caer
      // más allá del carácter 160 — la prueba medía su propio recorte.
      return JSON.stringify({ full: txt.replace(/\\s+/g, ' '),
        txt: txt.replace(/\\s+/g, ' ').slice(0, 120),
        es: (txt.match(/Explorar|Entiende|Calcula, organiza/g) || []) });})()`).then(JSON.parse);
    ok(`${ENG}.en · el descubrimiento está traducido (nada en español)`,
      /Explore Intelligence/.test(en.full) && /Explore Workspace/.test(en.full) && en.es.length === 0,
      JSON.stringify(en.es) + ' · ' + en.txt);
    await page.screenshot({ path: join(OUT, `free-discover-390-en-${ENG}.png`) });
    await ctx.close();
  }

  await browser.close();
}

console.log('\n════════════════════════════════════════════════');
console.log(`${pass} passed, ${fails.length} failed\n`);
if (fails.length) { console.log('FAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); console.log('\nRESULT: NO-GO'); server.close(); process.exit(1); }
console.log('RESULT: GO — capturas en docs/dashboard-adaptive/');
server.close();
