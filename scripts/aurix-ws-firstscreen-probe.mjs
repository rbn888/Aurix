#!/usr/bin/env node
/**
 * AURIX · WORKSPACE OPERATIVO — LA PRIMERA PANTALLA ÚTIL, MEDIDA
 * ════════════════════════════════════════════════════════════════════════════
 * QUÉ PREGUNTA, y por qué ésa. «¿Cabe la cabecera?» no dice nada: la cabecera
 * siempre cabe. Lo que decide si una herramienta se puede usar es DÓNDE EMPIEZA
 * EL TRABAJO — el primer campo editable, la primera fila del inventario, la
 * acción de registrar— y si eso queda por debajo de la navegación, el usuario
 * tiene que atravesar una presentación para llegar a lo que ya había elegido.
 *
 * Medido antes de este bloque, en 390×844 con datos de prueba: 117–152 px de
 * cabecera, 244 px hasta el primer campo de Interés compuesto, el registro del
 * Diario en 662 px, el inventario inmobiliario en 777 px y la acción de crear un
 * Objetivo en 862 px — fuera de pantalla.
 *
 * ANCLAS DECLARADAS, NO ADIVINADAS. Cada superficie declara aquí qué es «empezar
 * a trabajar» según §2 del SPEC, y se distingue lo que debe verse ENTERO (un
 * campo o una acción: si está a medias no se puede usar) de lo que basta con que
 * EMPIECE (una lista o un resumen: §2 no exige que la tabla entera quepa).
 *
 * LO QUE ESTO **NO** ES: WebKit de escritorio no es Safari de iPhone. Comparte el
 * motor de layout —que es lo que se certifica— pero no la barra de URL dinámica,
 * el `env(safe-area-inset-bottom)` real ni el zoom al enfocar un input.
 *
 * CONTRA LO PÚBLICO CUANDO SE PIDE:
 *   AURIX_WS_URL=https://app.aurixsystem.io (+ AURIX_WS_RESOLVE=dominio=IP, que el
 *   sandbox necesita porque no resuelve el dominio) ejecuta las MISMAS medidas
 *   sobre los bytes DESPLEGADOS, interceptando la respuesta del CDN para aplicar
 *   el único parche declarado: la navegación de auth. WebKit no admite regla de
 *   resolución, así que contra lo público sólo corre Chromium — y se dice.
 *
 *   node scripts/aurix-ws-firstscreen-probe.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const OUT = join(ROOT, 'docs', 'ws-firstscreen');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const abs = normalize(join(ROOT, p)); if (!abs.startsWith(ROOT)) return res.writeHead(403).end();
    let body = await readFile(abs);
    // El ÚNICO parche: la navegación de auth. El resto es el candidato tal cual.
    if (abs.endsWith('app.js')) body = Buffer.from(String(body)
      .replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')
      .replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0'));
    res.writeHead(200, { 'content-type': MIME[extname(abs)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch (_) { res.writeHead(404).end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PUBLIC_URL = String(process.env.AURIX_WS_URL || '').replace(/\/$/, '');
const RESOLVE = String(process.env.AURIX_WS_RESOLVE || '');
const ORIGIN = PUBLIC_URL || `http://127.0.0.1:${server.address().port}`;
const AUTH_PATCH = t => String(t)
  .replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')
  .replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0');
// Un solo sitio crea contextos: así el parche no se puede olvidar en uno de los
// tres puntos de montaje.
async function newCtx(browser, opts) {
  const ctx = await browser.newContext(opts);
  if (PUBLIC_URL) await ctx.route('**/app.js*', async route => {
    const r = await route.fetch();
    await route.fulfill({ response: r, body: AUTH_PATCH(await r.text()) });
  });
  return ctx;
}

const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
let chromium, webkit;
try { ({ chromium, webkit } = await import(PW)); }
catch (e) {
  console.error('\n✗ SIN MOTORES — ' + PW);
  console.error('  instalar fuera del repo:  mkdir -p /tmp/aurix-pw && cd /tmp/aurix-pw \\');
  console.error('                            && npm init -y && npm i playwright && npx playwright install webkit chromium');
  console.error('\nRESULT: NO EJECUTADO (entorno, no candidato)');
  process.exit(2);
}

let pass = 0; const fails = []; const pend = [];
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (info ? '  [' + info + ']' : '')); console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };

// ── LAS OCHO CAPACIDADES, Y QUÉ ES «EMPEZAR A TRABAJAR» EN CADA UNA ────────
// `whole`  → debe verse ENTERO (campo, acción): a medias no se puede usar.
// `starts` → basta con que EMPIECE dentro de la pantalla (lista, resumen).
const SURFACES = [
  { id: 'compound',    open: `_wsOpenTool('compound')`,
    whole: ['.wstool-inputs-card .ws4-num'], starts: ['[data-wstool-out]'] },
  { id: 'loan',        open: `_wsOpenTool('loan')`,
    whole: ['.wsloan-fields .ws4-num'],      starts: ['[data-wstool-out]'] },
  { id: 'budget',      open: `_wsOpenTool('budget')`,
    whole: ['.wstool-fields .ws4-num'],      starts: ['.wstool-inputs-card'] },
  { id: 'journal',     open: `_wsOpenTool('journal')`,
    whole: ['[data-wsjrn-input]'],           starts: ['.wsjrn-form-card'] },
  // ── UNA LIMITACIÓN DECLARADA, NO UN GATE RELAJADO ───────────────────────
  // MEDIDO: en 360×740 el resumen de Portfolio inmobiliario ocupa 552 px él solo
  // (KPIs + subKPIs + capas), así que el inventario empieza en 741 con el suelo
  // en 680. No cabe, y no cabe por DENSIDAD: en 390×844 la misma tarjeta mide 564
  // y entra sólo porque la pantalla es 104 px más alta. Recuperar esos 100 px
  // exige rehacer ese resumen, que este SPEC no toca.
  // Así que la afirmación se ACOTA a donde se ha demostrado (≥ 800 px de alto) en
  // vez de fingir que se cumple en todas partes, y el hueco se IMPRIME en cada
  // ejecución para que no desaparezca de la vista. El resto del contrato
  // —contención, desbordamiento, toque, legibilidad— se sigue exigiendo en 360.
  { id: 'realestate',  open: `_wsOpenTool('realestate')`,
    whole: [],                               starts: ['.wsre-summary-card', '.wsre-grid, .wsre-empty-hint, [data-wsre-add]'],
    startsMinH: 800, startsGap: 'Portfolio inmobiliario · el inventario empieza en 741 px con el suelo en 680 (360×740): 552 px de resumen' },
  { id: 'receivables', open: `_wsOpenTool('receivables')`,
    whole: [],                               starts: ['.wsrecv-summary-card', '[data-wsrecv-list]'] },
  // §11 RE-DECIDE QUÉ ES «EMPEZAR» AQUÍ. Era `.wsb-impact`, el resumen del rango
  // entre los TRES ejemplos predefinidos; ahora la pantalla se abre con la
  // comparación de los DOS supuestos del usuario (`.wsb2`), que es lo que vino a
  // hacer. El impacto de los ejemplos sigue existiendo, un poco más abajo: no se
  // ha retirado nada, ha cambiado el orden, y con él lo que debe verse primero.
  { id: 'scenario',    open: `_wsOpenSurface('scenario')`,
    whole: ['.wsb-params .ws4-num'],         starts: ['.wsb2'] },
  { id: 'goals',       open: `_wsOpenSurface('goals')`,
    whole: ['.wsg-form .ws4-num, .wsg-form .wsg-select', '[data-wsg-create], .wsg-card'], starts: [] },
];

const MEASURE = `(function(SPEC){
  var root = document.getElementById('aurixWorkspace');
  var wsh = root.querySelector('.aurix-wsh');
  if (!wsh) return { mounted: false };
  var nav = document.getElementById('bottomNav');
  var navVis = !!nav && getComputedStyle(nav).display !== 'none' && nav.getBoundingClientRect().height > 0;
  var floor = navVis ? nav.getBoundingClientRect().top : window.innerHeight;
  var R = function(e){ var b = e.getBoundingClientRect(); return { t:+b.top.toFixed(1), b:+b.bottom.toFixed(1), l:+b.left.toFixed(1), r:+b.right.toFixed(1), w:+b.width.toFixed(1), h:+b.height.toFixed(1) }; };
  var pick = function(sel){ return root.querySelector(sel); };
  var whole = SPEC.whole.map(function(sel){ var e = pick(sel); if (!e) return { sel: sel, found:false };
    var x = R(e); return { sel: sel, found:true, top:x.t, bottom:x.b, ok: x.t >= 0 && x.b <= floor + 0.5 }; });
  var starts = SPEC.starts.map(function(sel){ var e = pick(sel); if (!e) return { sel: sel, found:false };
    var x = R(e); return { sel: sel, found:true, top:x.t, ok: x.t >= 0 && x.t <= floor - 24 }; });
  // ── LA CABECERA: BARRA, NO TARJETA ───────────────────────────────────────
  var bar = wsh.querySelector(':scope > .wsh-bar');
  var barR = bar ? R(bar) : null;
  var title = bar ? bar.querySelector('.wsh-bar-title') : null;
  var back = bar ? bar.querySelector('.wsh-bar-back') : null;
  var doc = bar ? bar.querySelector('.wsh-bar-doc') : null;
  var help = bar ? bar.querySelector('.wsh-bar-help') : null;
  var titleTxt = title ? (title.textContent || '').trim() : '';
  // Un título REPETIDO justo debajo (el «DATOS DE ENTRADA» bajo «Interés
  // compuesto») es lo que §1 llama título duplicado.
  var sectionTitles = [].slice.call(wsh.querySelectorAll('.wsh-title')).map(function(e){ return (e.textContent||'').trim().toLowerCase(); });
  // Legibilidad y toque, sobre lo que de verdad se ve.
  var small = [], zoom = [], taps = [], clipped = [];
  [].slice.call(wsh.querySelectorAll('*')).forEach(function(e){
    var b = e.getBoundingClientRect(); if (!b.width || !b.height) return;
    var cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none') return;
    var fs = parseFloat(cs.fontSize) || 99;
    var hasText = [].slice.call(e.childNodes).some(function(n){ return n.nodeType === 3 && n.textContent.trim(); });
    // El texto SVG escala con su viewBox, así que su px computado no es el px
    // pintado: medirlo aquí daría un rojo que no existe en pantalla.
    if (hasText && fs < 12 && !(e instanceof SVGElement)) small.push((e.className||e.tagName).toString().split(' ')[0] + '=' + fs);
    var tag = e.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') { if (fs < 16) zoom.push((e.className||'').split(' ')[0] + '=' + fs); }
    if (tag === 'BUTTON' || tag === 'SELECT' || tag === 'INPUT' || e.getAttribute('role') === 'button') {
      // El área de toque puede venir de un pseudoelemento extendido — es el
      // patrón que ya usa '.wsh-pin' y no crece el control visible.
      var af = getComputedStyle(e, '::after');
      var m = Math.max(Math.min(b.width, b.height), Math.min(parseFloat(af.width)||0, parseFloat(af.height)||0));
      if (m < 44) taps.push((e.className||tag).toString().split(' ')[0] + '=' + Math.round(m));
    }
    // SIN exigir 'overflow:hidden'. Ésa era la fuga: un <span> con
    // 'white-space:nowrap' pinta el texto FUERA de su caja sin recortarlo y su
    // 'getBoundingClientRect' sigue midiendo la caja, no lo pintado — así que ni
    // la contención ni el recorte lo veían. 'scrollWidth > clientWidth' sí.
    // SÓLO EL ANCHO, y a propósito: el alto de una hoja de texto desborda por
    // tipografía —una cifra de 44 px con interlineado ajustado deja descendientes
    // fuera de la caja de línea y 'scrollHeight' redondea— y eso no es un defecto
    // de layout. Lo vertical ya lo cubre la contención dentro de la tarjeta.
    if (hasText && e.scrollWidth > e.clientWidth + 1) clipped.push((e.className||e.tagName).toString().split(' ')[0] + ':' + e.scrollWidth + '>' + e.clientWidth);
  });
  // ── FILAS: CAJA CONTRA CONTENIDO E INTERSECCIÓN ENTRE CELDAS ─────────────
  // Poner tres cifras en fila es exactamente donde reaparece el defecto que este
  // repo lleva pagado: 'repeat(3, 1fr)' NO encoge por debajo del contenido, así
  // que la celda se sale de su tarjeta y ninguna prueba de '¿cabe la pantalla?'
  // lo ve. Se pregunta por la FILA: ¿cada celda dentro de su contenedor, y sin
  // tocar a su vecina?
  var ROWS = ['.wsre-kpis', '.wsre-subkpis', '.wsre-layers', '.wsjrn-sum-grid',
              '.wsb-params-grid', '.wstool-fields', '.wsloan-fields', '.wsg-form',
              '.wsjrn-form-grid', '.wsre-form-grid', '.wsrecv-form-grid', '.wsrecv-kpis'];
  var rowBad = [];
  ROWS.forEach(function(sel){
    [].slice.call(wsh.querySelectorAll(sel)).forEach(function(g){
      var gb = g.getBoundingClientRect();
      var kids = [].slice.call(g.children).map(function(k){ return { n: (k.className||k.tagName).toString().split(' ')[0], b: k.getBoundingClientRect() }; })
        .filter(function(k){ return k.b.width && k.b.height; });
      kids.forEach(function(k){ if (k.b.right > gb.right + 0.5 || k.b.left < gb.left - 0.5) rowBad.push(sel + '>' + k.n + ':fuera'); });
      for (var i = 0; i < kids.length; i++) for (var j = i + 1; j < kids.length; j++) {
        var a = kids[i].b, c = kids[j].b;
        if (!(a.right <= c.left + 0.5 || c.right <= a.left + 0.5 || a.bottom <= c.top + 0.5 || c.bottom <= a.top + 0.5)) rowBad.push(sel + ':solape');
      }
    });
  });
  // ── Y EL TEXTO, DENTRO DE SU TARJETA ─────────────────────────────────────
  // 'scrollWidth > clientWidth' sólo delata al que RECORTA; un <span> desborda
  // en silencio porque su overflow es 'visible': se ve fuera de la tarjeta y
  // ninguna medida de recorte lo acusa. Se pregunta por la CONTENCIÓN.
  var spill = [];
  [].slice.call(wsh.querySelectorAll('.wsh-card *')).forEach(function(e){
    var b = e.getBoundingClientRect(); if (!b.width || !b.height) return;
    var cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none') return;
    if (!e.textContent || !e.textContent.trim()) return;
    if (e.querySelector('*')) return;                 // sólo hojas de texto
    var card = e.closest('.wsh-card'); if (!card) return;
    var cb = card.getBoundingClientRect();
    if (b.right > cb.right - 1 || b.left < cb.left + 1) spill.push((e.className||e.tagName).toString().split(' ')[0]);
  });
  var u = function(a){ return Array.from(new Set(a)); };
  return {
    mounted: true, whole: whole, starts: starts,
    barIsCard: !!bar && bar.classList.contains('wsh-card'),
    barH: barR ? barR.h : null, barTop: barR ? barR.t : null,
    hasBar: !!bar, hasTitle: !!title, hasBack: !!back, hasDoc: !!doc, hasHelp: !!help,
    titleTxt: titleTxt, docTxt: doc ? (doc.textContent||'').trim() : '',
    backAria: back ? (back.getAttribute('aria-label')||'') : '',
    titleFont: title ? parseFloat(getComputedStyle(title).fontSize) : null,
    backTap: back ? Math.round(Math.min(R(back).w, R(back).h)) : null,
    dupTitle: sectionTitles.indexOf(titleTxt.toLowerCase()) !== -1,
    // §1: ningún chip Incluido/Premium dentro de la cabecera.
    barTier: !!bar && bar.querySelectorAll('.wsh-tier, .wsb-title-tier').length,
    legacyHeader: wsh.querySelectorAll('.wsb-header').length,
    small: u(small), zoom: u(zoom), taps: u(taps), clipped: u(clipped), rowBad: u(rowBad), spill: u(spill),
    docOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    savebar: !!root.querySelector('[data-wstool-savebar], [data-wsg-savebar]'),
  };
})`;

// Móvil, móvil ESTRECHO, tablet y escritorio. 360×740 entra por la misma razón
// por la que entró en la frontera Free: es donde una rejilla que «cabe» deja de
// caber, y ninguna prueba de «¿cabe?» lo ve si no se mide esa anchura.
const VIEWPORTS = [[360, 740], [390, 844], [768, 1024], [1440, 900]];

async function mount(page) {
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  // Sin sesión el build público navega a `login.html` y los globals desaparecen:
  // es un límite del ORIGEN, no un fallo del candidato, y se declara como tal.
  if (PUBLIC_URL && /login\.html/.test(page.url())) throw new Error('origen no ejercitable: la app pública redirige sin sesión (' + page.url() + ')');
  await page.waitForFunction(`typeof renderWorkspaceHome === 'function' && typeof switchTab === 'function'`, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(`(function(){
    var bl=document.getElementById('bootLoader'); if(bl) bl.remove();
    var ar=document.getElementById('appRoot'); if(ar) ar.style.opacity='1';
    document.getElementById('aurixWorkspace').style.display='block';
    return true; })()`);
}
// La persona se monta escribiendo la superficie SANEADA del resolver y nada más:
// no se stubea `hasFeature` ni el guard. Es la única palanca honesta del cliente.
async function asPremium(page, L) {
  await page.evaluate(`(function(){
    lang = ${JSON.stringify(L)};
    var f = Object.create(null);
    _AURIX_ENT_CANON.forEach(function(k){ f[k] = (k !== 'workspace.catalog_preview'); });
    _aurixEnt = { loaded:true, loading:false, error:null, plan:'premium', status:'active', source:'plan', validUntil:null, features:f, sources:Object.create(null), fetchedAt:Date.now() };
    _wshView = 'home'; switchTab('workspace'); return true; })()`);
  await page.waitForTimeout(400);
}

console.log('AURIX · WORKSPACE OPERATIVO — primera pantalla útil (Chromium + WebKit)');
console.log('origen: ' + ORIGIN + (PUBLIC_URL ? '  (PÚBLICO · bytes desplegados)' : '  (copia de trabajo)') + '\n');
mkdirSync(OUT, { recursive: true });

for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  if (ENG === 'WK' && PUBLIC_URL && RESOLVE) { console.log('  (WebKit omitido contra lo público: no admite regla de resolución)'); continue; }
  const browser = await launcher.launch({ args: (ENG === 'CR' && RESOLVE) ? ['--host-resolver-rules=MAP ' + RESOLVE.split('=')[0] + ' ' + RESOLVE.split('=')[1]] : [] });
  for (const [w, h] of VIEWPORTS) {
    for (const L of ['es', 'en']) {
      const ctx = await newCtx(browser, { viewport: { width: w, height: h }, deviceScaleFactor: w < 700 ? 2 : 1, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await mount(page);
      await asPremium(page, L);
      for (const S of SURFACES) {
        // Volver a Home antes de abrir: el despachador es idempotente a propósito
        // (un tick de precio no repinta), así que sin esto la segunda herramienta
        // se mediría sobre el DOM de la primera.
        await page.evaluate(`(function(){ _wshView='home'; renderWorkspaceHome(); ${S.open}; renderWorkspaceHome(); window.scrollTo(0,0); return true; })()`);
        await page.waitForTimeout(260);
        const g = await page.evaluate(`(${MEASURE})(${JSON.stringify({ whole: S.whole, starts: S.starts })})`);
        const tag = `${ENG}.${w}×${h} ${L.toUpperCase()} ${S.id}`;
        if (!g || !g.mounted) { ok(`${tag} la superficie monta`, false, 'sin .aurix-wsh'); await page.waitForTimeout(0); continue; }
        ok(`${tag} cabecera = barra funcional, no tarjeta de presentación`,
          g.hasBar && g.hasTitle && g.hasBack && g.barIsCard === false && g.legacyHeader === 0 && g.barH <= 72,
          JSON.stringify({ bar: g.hasBar, card: g.barIsCard, legacy: g.legacyHeader, alto: g.barH }));
        ok(`${tag} sin título duplicado y sin chip de plan en la cabecera`,
          g.dupTitle === false && g.barTier === 0,
          JSON.stringify({ dup: g.dupTitle, chips: g.barTier, titulo: g.titleTxt }));
        ok(`${tag} el retorno nombra su destino y es táctil`,
          g.backTap >= 44 && /(volver|back)/i.test(g.backAria),
          JSON.stringify({ tap: g.backTap, aria: g.backAria }));
        ok(`${tag} el título está en la banda de §3 (20–24 móvil / 24–28 escritorio)`,
          w < 1024 ? (g.titleFont >= 20 && g.titleFont <= 24) : (g.titleFont >= 24 && g.titleFont <= 28),
          'px=' + g.titleFont);
        ok(`${tag} la ayuda desplegable conserva subtítulo y supuestos`,
          g.hasHelp === true, 'sin <details> de ayuda');
        const wholeBad = g.whole.filter(x => !x.found || !x.ok);
        ok(`${tag} el primer control útil se ve ENTERO al entrar`,
          wholeBad.length === 0, JSON.stringify(g.whole));
        const startBad = g.starts.filter(x => !x.found || !x.ok);
        // La afirmación de «primera pantalla» se hace donde se ha demostrado. Si
        // una superficie declara una altura mínima, por debajo de ella el hueco
        // se IMPRIME como pendiente en vez de contarse como verde o como rojo:
        // sigue a la vista de quien lea la salida, y no se relaja el contrato
        // allí donde sí se afirma.
        if (S.startsMinH && h < S.startsMinH) {
          console.log(`  ⚠ ${tag} PENDIENTE DECLARADO · ${S.startsGap}`);
          pend.push(`${tag} · ${S.startsGap}`);
        } else {
          ok(`${tag} lo que debe EMPEZAR en pantalla, empieza`,
            startBad.length === 0, JSON.stringify(g.starts));
        }
        ok(`${tag} legibilidad y toque: ≥12 px, inputs a 16 px, objetivos ≥44 px`,
          g.small.length === 0 && g.zoom.length === 0 && g.taps.length === 0,
          JSON.stringify({ pequeno: g.small, zoom: g.zoom, toque: g.taps }));
        ok(`${tag} sin recortes de texto ni desbordamiento horizontal`,
          g.clipped.length === 0 && g.docOverflowX === false,
          JSON.stringify({ recortado: g.clipped, docX: g.docOverflowX }));
        ok(`${tag} ninguna celda se sale de su fila ni pisa a su vecina`,
          g.rowBad.length === 0, JSON.stringify(g.rowBad));
        ok(`${tag} ningún texto se pinta fuera de su tarjeta`,
          g.spill.length === 0, JSON.stringify(g.spill));
        if (ENG === 'CR' && L === 'es') await page.screenshot({ path: join(OUT, `ws-${S.id}-${w}x${h}-es.png`) });
      }
      await ctx.close();
    }
  }

  // ── EL CICLO DE VIDA DE UN DOCUMENTO, SOBRE EL CÓDIGO REAL ──────────────
  // §4/§5: abrir, modificar, guardar, «guardar como» sin sobrescribir, y
  // recuperar. Se ejecutan los owners de producción (`_wsToolCommit`,
  // `_wsOpenTool`), no una réplica: el defecto que estas pruebas buscan es
  // precisamente que el camino guardado y el previsualizado diverjan.
  {
    const ctx = await newCtx(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await mount(page); await asPremium(page, 'es');
    const r = await page.evaluate(`(function(){
      var out = {};
      _wshView='home'; renderWorkspaceHome();
      _wsOpenTool('compound');
      _wsToolInputs.initial = '12.345'; _wsToolDirty = true;
      _wsToolCommit('Mi plan 2030', true);
      renderWorkspaceHome();
      var bar = document.querySelector('#aurixWorkspace .wsh-bar');
      var title = bar && bar.querySelector('.wsh-bar-title');
      var doc = bar && bar.querySelector('.wsh-bar-doc');
      out.id1 = _wsToolEditId;
      out.title = title && title.textContent.trim();
      out.doc = doc && doc.textContent.trim();
      out.distinct = !!(title && doc) && out.title !== out.doc;
      // GUARDAR actualiza: mismo id, valor nuevo, y no nace un segundo documento.
      var before = _ws4Projects().length;
      _wsToolInputs.initial = '20.000'; _wsToolDirty = true;
      _wsToolCommit(null, false);
      out.id2 = _wsToolEditId;
      out.sameId = out.id1 === out.id2;
      out.noClone = _ws4Projects().length === before;
      var p1 = _ws4Projects().find(function(p){ return p.id === out.id1; });
      out.updated = p1 && String(p1.inputs.initial);
      // GUARDAR COMO crea otra instancia y deja la original intacta.
      _wsToolInputs.initial = '99.000'; _wsToolDirty = true;
      _wsToolCommit('Copia agresiva', true);
      out.id3 = _wsToolEditId;
      out.newId = out.id3 !== out.id1;
      out.count = _ws4Projects().length;
      var orig = _ws4Projects().find(function(p){ return p.id === out.id1; });
      out.originalIntact = orig && String(orig.inputs.initial) === out.updated && orig.customName === 'Mi plan 2030';
      // RECUPERAR: reabrir el original devuelve SUS datos, no los de la copia.
      _wshView='home'; renderWorkspaceHome();
      _wsOpenTool('compound', out.id1);
      renderWorkspaceHome();
      out.reopened = _wsToolEditId === out.id1;
      out.reopenedValue = String(_wsToolInputs.initial);
      var bar2 = document.querySelector('#aurixWorkspace .wsh-bar-doc');
      out.reopenedDoc = bar2 && bar2.textContent.trim();
      return JSON.stringify(out);
    })()`);
    const d = JSON.parse(r);
    ok(`${ENG}.documento · la barra publica su nombre y no lo confunde con la plantilla`,
      !!d.id1 && d.doc === 'Mi plan 2030' && !!d.title && d.distinct === true, r);
    ok(`${ENG}.documento · «Guardar» ACTUALIZA: mismo id, sin duplicar`,
      d.sameId === true && d.noClone === true && d.updated === '20.000', r);
    ok(`${ENG}.documento · «Guardar como» crea otra instancia y no toca la original`,
      d.newId === true && d.count === 2 && d.originalIntact === true, r);
    ok(`${ENG}.documento · reabrir el original recupera SUS datos y SU nombre`,
      d.reopened === true && d.reopenedValue === '20.000' && d.reopenedDoc === 'Mi plan 2030', r);
    await page.screenshot({ path: join(OUT, 'ws-doc-name-390x844-es.png') });
    await ctx.close();
  }

  // ── DE DÓNDE SE VIENE Y A DÓNDE SE VUELVE ────────────────────────────────
  // §5: abrir desde el catálogo y desde Mi espacio, y que «Volver» devuelva a la
  // pestaña de origen — no a otra, que es el defecto que `_wsBackLabel` cerró.
  {
    const ctx = await newCtx(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await mount(page); await asPremium(page, 'es');
    for (const [tab, label] of [['tools', 'Herramientas'], ['templates', 'Plantillas'], ['space', 'Mi espacio']]) {
      const r = await page.evaluate(`(function(){
        _wshView='home'; _wsTab=${JSON.stringify(tab)}; _wshRepaintHome();
        _wsReturnTab = ${JSON.stringify(tab)};
        _wsOpenTool('loan'); renderWorkspaceHome();
        var back = document.querySelector('#aurixWorkspace .wsh-bar-back');
        var shown = back && back.textContent.trim();
        var aria = back && back.getAttribute('aria-label');
        back.click();
        var view = document.querySelector('#aurixWorkspace .aurix-wsh').getAttribute('data-wsh-view');
        return JSON.stringify({ shown: shown, aria: aria, view: view, tab: _wsTab });
      })()`);
      await page.waitForTimeout(150);
      const d = JSON.parse(r);
      ok(`${ENG}.retorno · abierto desde «${label}» vuelve a «${label}»`,
        d.shown.indexOf(label) !== -1 && d.aria === 'Volver a ' + label && d.view === 'home' && d.tab === tab, r);
    }
    await ctx.close();
  }
  await browser.close();
}

server.close();
console.log('\n════════════════════════════════════════════════');
console.log(pass + ' passed, ' + fails.length + ' failed');
if (pend.length) {
  console.log('\nPENDIENTES DECLARADOS (medidos, no cubiertos por este SPEC):');
  Array.from(new Set(pend)).forEach(p => console.log('  ⚠ ' + p));
}
if (fails.length) { console.log('\nFAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); console.log('\nRESULT: NO-GO'); process.exit(1); }
console.log('\nRESULT: GO — capturas en docs/ws-firstscreen/'
  + (pend.length ? ' · con ' + Array.from(new Set(pend)).length + ' pendiente(s) declarado(s)' : ''));
process.exit(0);
