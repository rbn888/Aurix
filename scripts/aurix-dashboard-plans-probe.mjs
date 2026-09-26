#!/usr/bin/env node
/**
 * AURIX · «TUS PLANES» EN EL DASHBOARD — LOS RECORRIDOS, EN NAVEGADOR REAL
 * ════════════════════════════════════════════════════════════════════════════
 * El contrato de DATOS (qué entra, qué cifras, cuándo no se afirma el vacío)
 * vive en `docs/AURIX-DASHBOARD-PLANS-harness.js`. Aquí se ejercita lo que sólo
 * un navegador puede responder: que la sección aparezca donde tiene que
 * aparecer, que «Continuar» abra LA MISMA instancia, que el retorno vuelva al
 * Dashboard, y que guardar, renombrar y borrar en Workspace se vean al volver —
 * sin duplicados y sin resurrecciones.
 *
 * LO QUE ESTO **NO** ES: no es una sesión autenticada. La persona se monta
 * escribiendo la superficie SANEADA del resolver, que es la única palanca
 * honesta del cliente; el sandbox no puede iniciar sesión (OTP-only).
 *
 *   node scripts/aurix-dashboard-plans-probe.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const OUT = join(ROOT, 'docs', 'ws-dashboard-plans');
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
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

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

console.log('AURIX · «TUS PLANES» — Chromium + WebKit');
console.log('origen: ' + ORIGIN + '  (copia de trabajo)\n');
mkdirSync(OUT, { recursive: true });

// Documentos de PRUEBA, nunca reales: dos presupuestos distintos, un nombre
// largo, y una plantilla de cada uno de los cuatro tipos publicados.
const DOCS = [
  { id: 'd1', type: 'monthly_budget',  customName: 'Presupuesto de casa', updatedAt: 500, revision: 1, inputs: { salary: 2500, housing: 700, food: 300 } },
  { id: 'd2', type: 'monthly_budget',  customName: 'Presupuesto del viaje a Japón con nombre deliberadamente largo', updatedAt: 400, revision: 1, inputs: { salary: 800, food: 200 } },
  { id: 'd3', type: 'receivables_app', customName: 'Clientes 2026', updatedAt: 300, revision: 1, inputs: { items: [{ id: 'r1', personOrCompany: 'ACME', concept: 'Web', units: 1, unitPrice: 1000, paidAmount: 400 }] } },
  { id: 'd4', type: 'real_estate_portfolio', customName: 'Cartera Madrid', updatedAt: 200, revision: 1, inputs: { properties: [{ id: 'p1', name: 'Piso Centro', ptype: 'flat', buy: 200000, value: 250000 }] } },
  { id: 'd5', type: 'trade_journal',   customName: 'Diario cripto', updatedAt: 100, revision: 1, inputs: { currency: 'EUR', trades: [{ id: 't1', asset: 'BTC', atype: 'crypto', buy: 1, qty: 1, currency: 'EUR' }] } },
];

async function mount(page) {
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(`typeof updateDashboardPlans === 'function' && typeof switchTab === 'function'`, null, { timeout: 60000 });
  await page.waitForTimeout(700);
  await page.evaluate(`(function(){
    var bl=document.getElementById('bootLoader'); if(bl) bl.remove();
    var ar=document.getElementById('appRoot'); if(ar) ar.style.opacity='1';
    return true; })()`);
}
// La persona, por la superficie saneada del resolver. Nada más.
const persona = (page, prem) => page.evaluate(`(function(){
  var f = Object.create(null);
  if (${prem}) _AURIX_ENT_CANON.forEach(function(k){ f[k] = (k !== 'workspace.catalog_preview'); });
  _aurixEnt = { loaded:true, loading:false, error:null, plan:${prem ? "'premium'" : "'free'"}, status:'none', source:'default', validUntil:null, features:f, sources:Object.create(null), fetchedAt:Date.now() };
  return true; })()`);
const seed = (page, docs) => page.evaluate(`(function(){ localStorage.setItem('aurix_ws_projects_v1', ${JSON.stringify(JSON.stringify(docs))}); return true; })()`);
const paint = page => page.evaluate(`(function(){ _wsPlansWireOnce(); updateDashboardPlans(); return true; })()`);
const read = page => page.evaluate(`(function(){
  var sec=document.getElementById('wsPlansSection');
  var vis=getComputedStyle(sec).display!=='none';
  var cards=[].slice.call(sec.querySelectorAll('.wspl-card'));
  var grid=sec.querySelector('.wspl-grid');
  return JSON.stringify({
    visible: vis, html: sec.innerHTML.length,
    n: cards.length,
    ids: cards.map(function(c){ return c.getAttribute('data-wspl-id'); }),
    names: cards.map(function(c){ return (c.querySelector('.wspl-name')||{}).textContent || ''; }),
    types: cards.map(function(c){ return (c.querySelector('.wspl-type')||{}).textContent || ''; }),
    metrics: cards.map(function(c){ return [].slice.call(c.querySelectorAll('.wspl-m')).map(function(m){ return m.textContent.trim(); }); }),
    cols: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
    note: (sec.querySelector('.wspl-note')||{}).textContent || '',
    hasTemplatesLink: !!sec.querySelector('[data-wspl-templates]'),
    hasRetry: !!sec.querySelector('[data-ws-sync-retry]'),
    title: (sec.querySelector('.wspl-title')||{}).textContent || '',
    spill: cards.some(function(c){ var cb=c.getBoundingClientRect();
      return [].slice.call(c.querySelectorAll('*')).some(function(e){ var b=e.getBoundingClientRect();
        return b.width && (b.right > cb.right + 1 || b.left < cb.left - 1); }); }),
    taps: cards.map(function(c){ var g=c.querySelector('.wspl-go'); var b=g?g.getBoundingClientRect():null;
      return b?Math.round(Math.min(b.width,b.height)):0; }),
  });})()`).then(JSON.parse);

for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  const browser = await launcher.launch();
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 700 ? 2 : 1, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await mount(page);
    const tag = `${ENG}.${w}×${h}`;

    // ── FREE: NI SECCIÓN, NI HUECO, NI CANDADO ──────────────────────────────
    await seed(page, DOCS); await persona(page, false); await paint(page);
    let g = await read(page);
    ok(`${tag} Free · la sección no existe: sin hueco, sin candado, sin teaser`,
      g.visible === false && g.html === 0 && g.n === 0, JSON.stringify({ vis: g.visible, html: g.html }));

    // ── PREMIUM SIN DOCUMENTOS ──────────────────────────────────────────────
    await seed(page, []); await persona(page, true);
    await page.evaluate(`(function(){ _wsDocTableState='yes'; return true; })()`);
    await paint(page);
    g = await read(page);
    ok(`${tag} Premium vacío · una línea con acceso a Plantillas, no una card`,
      g.visible === true && g.n === 0 && g.hasTemplatesLink === true && /no has guardado/i.test(g.note),
      JSON.stringify({ n: g.n, nota: g.note }));

    // ── PREMIUM CON VARIOS DOCUMENTOS ───────────────────────────────────────
    await seed(page, DOCS); await paint(page);
    g = await read(page);
    ok(`${tag} Premium · las CINCO plantillas guardadas, con su nombre propio`,
      g.n === 5 && JSON.stringify(g.ids) === JSON.stringify(['d1', 'd2', 'd3', 'd4', 'd5'])
      && g.names[0] === 'Presupuesto de casa' && g.names[1].indexOf('Japón') !== -1,
      JSON.stringify({ n: g.n, ids: g.ids }));
    ok(`${tag} dos presupuestos distintos: mismo tipo, nombres e identidades propias`,
      g.types[0] === g.types[1] && g.names[0] !== g.names[1] && g.ids[0] !== g.ids[1],
      JSON.stringify({ tipos: g.types.slice(0, 2), nombres: g.names.slice(0, 2) }));
    ok(`${tag} hasta DOS métricas por plan, y el diario sólo su recuento`,
      g.metrics.every(m => m.length <= 2) && g.metrics[4].length === 1,
      JSON.stringify(g.metrics));
    ok(`${tag} rejilla ${w >= 1024 ? '3' : '1'} columna(s)`,
      g.cols === (w >= 1024 ? 3 : 1), 'columnas=' + g.cols);
    ok(`${tag} nada se pinta fuera de su card y «Continuar» es táctil`,
      g.spill === false && g.taps.every(x => x >= 44), JSON.stringify({ spill: g.spill, taps: g.taps }));
    // Se captura la SECCIÓN, no el pliegue del Dashboard: «Tus planes» vive
    // debajo de las categorías y una captura del viewport superior no la enseña.
    await page.evaluate(`document.getElementById('wsPlansSection').scrollIntoView({block:'center'})`);
    await page.waitForTimeout(200);
    try { await page.locator('#wsPlansSection').screenshot({ path: join(OUT, `plans-${ENG.toLowerCase()}-${w}x${h}.png`) }); }
    catch (_) { await page.screenshot({ path: join(OUT, `plans-${ENG.toLowerCase()}-${w}x${h}.png`) }); }
    await ctx.close();
  }

  // ── LOS RECORRIDOS, EN UN SOLO CONTEXTO ───────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await mount(page); await seed(page, DOCS); await persona(page, true);
    await page.evaluate(`(function(){ _wsDocTableState='yes'; switchTab('dashboard'); _wsPlansWireOnce(); updateDashboardPlans(); return true; })()`);
    await page.waitForTimeout(250);

    // Abrir desde el Dashboard → la MISMA instancia, y el retorno preparado.
    let r = await page.evaluate(`(function(){
      document.querySelector('#wsPlansSection [data-wspl-open="d1"]').click();
      return JSON.stringify({ tab: currentTab, view: (document.querySelector('#aurixWorkspace .aurix-wsh')||{}).getAttribute
        ? document.querySelector('#aurixWorkspace .aurix-wsh').getAttribute('data-wsh-view') : null,
        tool: _wsToolActive, editId: _wsToolEditId, back: _wsReturnTab,
        doc: (document.querySelector('#aurixWorkspace .wsh-bar-doc')||{}).textContent || '' });
    })()`).then(JSON.parse);
    ok(`${ENG}.abrir · «Continuar» lleva a LA MISMA instancia`,
      r.tab === 'workspace' && r.view === 'tool' && r.tool === 'budget' && r.editId === 'd1'
      && r.doc === 'Presupuesto de casa', JSON.stringify(r));
    ok(`${ENG}.abrir · el retorno queda apuntado al Dashboard`, r.back === 'dashboard', r.back);

    // Editar, guardar y volver: el Dashboard enseña la cifra nueva.
    r = await page.evaluate(`(function(){
      _wsToolInputs.salary = '3.000'; _wsToolDirty = true;
      _wsToolCommit(null, false);
      document.querySelector('#aurixWorkspace .wsh-bar-back').click();
      _wsPlansWireOnce(); updateDashboardPlans();
      var c = document.querySelector('#wsPlansSection [data-wspl-id="d1"]');
      return JSON.stringify({ tab: currentTab, n: _ws4Projects().length,
        metric: c ? (c.querySelector('.wspl-m b')||{}).textContent : null,
        first: document.querySelector('#wsPlansSection .wspl-card').getAttribute('data-wspl-id'),
        // Y lo PINTADO, no sólo la variable: ver abajo por qué.
        mainShown: (function(){ var m = document.querySelector('main');
          return !!m && getComputedStyle(m).display !== 'none' && m.getBoundingClientRect().height > 100; })() });
    })()`).then(JSON.parse);
    // ── ESTE ASSERT PASABA CON LA PANTALLA EN NEGRO ─────────────────────────
    // Comprobaba `currentTab === 'dashboard'`, y esa variable se ponía aunque el
    // despachador NO montara nada: `_applyTab` guarda el nombre de la pestaña
    // antes de decidir qué pintar. Así que medía la intención, no el resultado,
    // y certificó en verde un Resumen sin contenido. Ahora se exige el id REAL
    // (`home`) y, sobre todo, que el Resumen esté PINTADO.
    ok(`${ENG}.volver · «Volver» devuelve al Dashboard, y el Dashboard se PINTA`,
      r.tab === 'home' && r.mainShown === true, JSON.stringify(r));
    ok(`${ENG}.guardar · la cifra editada se ve al volver, y sin duplicar el documento`,
      r.n === 5 && /3\.?000|3,000/.test(String(r.metric)) && r.first === 'd1', JSON.stringify(r));

    // Renombrar: el Dashboard lo refleja sin tocar la identidad.
    r = await page.evaluate(`(function(){
      var list = _ws4ProjectsRaw();
      var p = list.find(function(x){ return x.id === 'd1'; });
      p.customName = 'Presupuesto renombrado'; _wsDocStamp(p); _ws4SaveAll(list);
      updateDashboardPlans();
      var c = document.querySelector('#wsPlansSection [data-wspl-id="d1"]');
      return JSON.stringify({ name: c ? c.querySelector('.wspl-name').textContent : null, n: _ws4Projects().length });
    })()`).then(JSON.parse);
    ok(`${ENG}.renombrar · el nombre nuevo aparece y el id no cambia`,
      r.name === 'Presupuesto renombrado' && r.n === 5, JSON.stringify(r));

    // Eliminar: tombstone, y una «recarga» (relectura del almacén) no resucita.
    r = await page.evaluate(`(function(){
      _ws4Tombstone('d1'); updateDashboardPlans();
      var afterDelete = document.querySelectorAll('#wsPlansSection .wspl-card').length;
      // «Recarga»: se vuelve a leer el almacén desde cero, que es lo que hace un
      // arranque. Si el borrado fuera un recorte del array en memoria, aquí
      // reaparecería.
      updateDashboardPlans();
      var afterReload = document.querySelectorAll('#wsPlansSection .wspl-card').length;
      var raw = JSON.parse(localStorage.getItem('aurix_ws_projects_v1') || '[]');
      var tomb = raw.find(function(x){ return x.id === 'd1'; });
      return JSON.stringify({ afterDelete: afterDelete, afterReload: afterReload,
        tombstoned: !!(tomb && tomb.deletedAt), ids: [].slice.call(document.querySelectorAll('#wsPlansSection .wspl-card')).map(function(c){ return c.getAttribute('data-wspl-id'); }) });
    })()`).then(JSON.parse);
    ok(`${ENG}.eliminar · desaparece, deja tombstone y NO resucita al releer`,
      r.afterDelete === 4 && r.afterReload === 4 && r.tombstoned === true && r.ids.indexOf('d1') === -1,
      JSON.stringify(r));

    // Cambio de cuenta: el almacén de la cuenta anterior deja de estar, y la
    // sección no arrastra nada porque no tiene estado propio.
    r = await page.evaluate(`(function(){
      localStorage.removeItem('aurix_ws_projects_v1');
      updateDashboardPlans();
      return JSON.stringify({ n: document.querySelectorAll('#wsPlansSection .wspl-card').length,
        html: document.getElementById('wsPlansSection').innerHTML.indexOf('Presupuesto') });
    })()`).then(JSON.parse);
    ok(`${ENG}.cuenta · sin el almacén anterior no queda ni un resto en la sección`,
      r.n === 0 && r.html === -1, JSON.stringify(r));

    // Sincronización sin confirmar / con error: NO se afirma el vacío.
    // Hace falta SESIÓN: sin cuenta no hay nada remoto que esperar y el vacío
    // local SÍ es la respuesta honesta — eso se comprueba justo debajo.
    r = await page.evaluate(`(function(){
      _wsDocTableState = 'unknown'; updateDashboardPlans();
      var sinSesion = document.querySelector('#wsPlansSection .wspl-note').textContent;
      currentUser = { id: 'u_test' }; supabaseClient = supabaseClient || {};
      _wsDocTableState = 'unknown'; updateDashboardPlans();
      return JSON.stringify({ sinSesion: sinSesion,
        loading: document.querySelector('#wsPlansSection .wspl-note').textContent });
    })()`).then(JSON.parse);
    ok(`${ENG}.sync · SIN sesión el vacío local es la respuesta honesta`,
      /no has guardado/i.test(r.sinSesion), JSON.stringify(r));
    const rSync = r;
    r = await page.evaluate(`(function(){
      _wsDocTableState = 'unknown'; updateDashboardPlans();
      var loading = document.querySelector('#wsPlansSection .wspl-note').textContent;
      _wsDocSyncSet('aurix_ws_projects_v1', 'error'); _wsDocTableState = 'unknown'; updateDashboardPlans();
      var err = document.querySelector('#wsPlansSection .wspl-note').textContent;
      return JSON.stringify({ loading: loading, err: err, retry: !!document.querySelector('#wsPlansSection [data-ws-sync-retry]') });
    })()`).then(JSON.parse);
    ok(`${ENG}.sync · sin respuesta todavía NO se dice «no tienes planes»`,
      /Comprobando/i.test(r.loading) && !/no has guardado/i.test(r.loading), JSON.stringify(r));
    ok(`${ENG}.sync · con error se dice el error y se ofrece reintentar`,
      /no se han podido cargar/i.test(r.err) && r.retry === true, JSON.stringify(r));

    // Perder Premium OCULTA la sección y no borra nada.
    r = await page.evaluate(`(function(){
      localStorage.setItem('aurix_ws_projects_v1', ${JSON.stringify(JSON.stringify(DOCS))});
      _wsDocTableState = 'yes'; updateDashboardPlans();
      var conPlan = document.querySelectorAll('#wsPlansSection .wspl-card').length;
      _aurixEnt.features = Object.create(null); updateDashboardPlans();
      var sinPlan = getComputedStyle(document.getElementById('wsPlansSection')).display;
      var docs = JSON.parse(localStorage.getItem('aurix_ws_projects_v1') || '[]').length;
      return JSON.stringify({ conPlan: conPlan, sinPlan: sinPlan, docs: docs });
    })()`).then(JSON.parse);
    ok(`${ENG}.derecho · perder Premium OCULTA la sección y no borra un solo documento`,
      r.conPlan === 5 && r.sinPlan === 'none' && r.docs === 5, JSON.stringify(r));
    await ctx.close();
  }

  // ══ §7 · CATEGORÍAS VACÍAS ════════════════════════════════════════════════
  // La visibilidad sale del INVENTARIO canónico de posiciones activas, no del
  // valor ni de la cotización: un activo sin precio sigue siendo una posición.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await mount(page);
    const setAssets = (list) => page.evaluate(`(function(){
      assets = ${JSON.stringify(list)};
      try { updateCategoryCards(); } catch (_) {}
      var g=document.getElementById('categoriesGrid');
      return JSON.stringify({
        cards: [].slice.call(g.querySelectorAll('.cat-card[data-type]')).map(function(c){return c.dataset.type;}),
        empty: g.querySelectorAll('.cat-empty').length,
        cta: g.querySelectorAll('[data-cat-empty-add]').length,
        cols: getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length });})()`).then(JSON.parse);

    let r = await setAssets([]);
    ok(`${ENG}.cat · cero activos confirmados: UN estado con «Añadir activo», no seis cards`,
      r.cards.length === 0 && r.empty === 1 && r.cta === 1, JSON.stringify(r));

    r = await setAssets([{ id: 'a1', name: 'AAPL', type: 'stock', qty: 3, price: 100 }]);
    ok(`${ENG}.cat · la primera posición muestra SU categoría y sólo esa`,
      JSON.stringify(r.cards) === JSON.stringify(['stock']) && r.empty === 0, JSON.stringify(r));

    r = await setAssets([{ id: 'a1', name: 'AAPL', type: 'stock', qty: 3, price: 100 },
                         { id: 'a2', name: 'BTC', type: 'crypto', qty: 1 }]);
    ok(`${ENG}.cat · una posición SIN cotización no vacía su categoría`,
      r.cards.indexOf('crypto') !== -1 && r.cards.length === 2, JSON.stringify(r));

    r = await setAssets([{ id: 'a1', name: 'AAPL', type: 'stock', qty: 3, price: 100 },
                         { id: 'a3', name: 'Oro', type: 'metal', qty: 0.0001, price: 0 }]);
    ok(`${ENG}.cat · valor cero tampoco vacía una categoría`,
      r.cards.indexOf('metal') !== -1, JSON.stringify(r));

    r = await setAssets([{ id: 'a1', name: 'AAPL', type: 'stock', qty: 3, price: 100 },
                         { id: 'a2', name: 'BTC', type: 'crypto', qty: 0, lifecycleStatus: 'closed' }]);
    ok(`${ENG}.cat · la última posición CERRADA oculta su categoría, sin borrar nada`,
      r.cards.indexOf('crypto') === -1 && r.cards.indexOf('stock') !== -1, JSON.stringify(r));

    r = await setAssets([{ id: 'c1', type: 'crypto', qty: 1, price: 1 },
                         { id: 's1', type: 'stock', qty: 1, price: 1 },
                         { id: 'm1', type: 'metal', qty: 1, price: 1 }]);
    const orderOk = await page.evaluate(`(function(){
      var order = (_catOrder.length === CAT_DEFAULT_ORDER.length ? _catOrder : CAT_DEFAULT_ORDER);
      var shown = [].slice.call(document.querySelectorAll('#categoriesGrid .cat-card[data-type]')).map(function(c){return c.dataset.type;});
      return JSON.stringify(shown) === JSON.stringify(order.filter(function(x){return shown.indexOf(x)!==-1;}));})()`);
    ok(`${ENG}.cat · el orden se conserva (es un filtro, no una lista nueva)`, orderOk === true, JSON.stringify(r.cards));
    ok(`${ENG}.cat · escritorio nunca pasa de tres columnas`, r.cols <= 3, 'columnas=' + r.cols);

    // ── CARGANDO NO ES VACÍO ────────────────────────────────────────────────
    const notReady = await page.evaluate(`(function(){
      assets = null;
      var g=document.getElementById('categoriesGrid');
      try { updateCategoryCards(); } catch (_) {}
      return JSON.stringify({ empty: g.querySelectorAll('.cat-empty').length });})()`).then(JSON.parse);
    ok(`${ENG}.cat · inventario no disponible NO se afirma como vacío`,
      notReady.empty === 0, JSON.stringify(notReady));
    await ctx.close();
  }

  // ════════════════════════════════════════════════════════════════════════
  // WORKSPACE PREMIUM V2 · §16 §17 §18 §21 §22 — LO QUE SÓLO VE UN NAVEGADOR
  // ════════════════════════════════════════════════════════════════════════
  // La rejilla, el menú y el interruptor de visibilidad no se pueden certificar leyendo la
  // hoja de estilos: hay que MEDIR columnas en cada ancho y EJERCITAR el menú con teclado.
  // Los seis anchos son los del §47, incluidos 360 y 375, que es donde rompen las cosas.
  {
    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx2.newPage();
    await mount(page);
    await seed(page, DOCS); await persona(page, true); await paint(page);

    // §18 — 1 / 2 / 3 columnas REALES, medidas por el motor de layout.
    const want = [[360, 1], [375, 1], [390, 1], [768, 2], [1024, 3], [1440, 3]];
    for (const [w, cols] of want) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(90);
      const got = await page.evaluate(`(function(){
        var g=document.querySelector('#wsPlansSection .wspl-grid');
        return g ? getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length : 0; })()`);
      ok(`${ENG}.v2.grid ${w}px → ${cols} columna(s)`, got === cols, 'medidas=' + got);
    }

    // §47 — a 360 px, con el nombre deliberadamente largo, nada se sale y el ⋯ es táctil.
    await page.setViewportSize({ width: 360, height: 780 });
    await page.waitForTimeout(120);
    const tight = await page.evaluate(`(function(){
      var sec=document.getElementById('wsPlansSection');
      var cards=[].slice.call(sec.querySelectorAll('.wspl-card'));
      var spill=cards.some(function(c){ var cb=c.getBoundingClientRect();
        return [].slice.call(c.querySelectorAll('*')).some(function(e){ var b=e.getBoundingClientRect();
          return b.width && (b.right > cb.right + 1 || b.left < cb.left - 1); }); });
      // el ⋯ no puede solaparse con el nombre: son hermanos en la misma fila
      var over=cards.some(function(c){ var n=c.querySelector('.wspl-name'), m=c.querySelector('.wspl-menu');
        if(!n||!m) return true; var a=n.getBoundingClientRect(), b=m.getBoundingClientRect();
        return a.right > b.left + 0.5; });
      var taps=cards.map(function(c){ var m=c.querySelector('.wspl-menu');
        if(!m) return 0; var r=m.getBoundingClientRect(), af=getComputedStyle(m,'::after');
        return Math.round(Math.min(parseFloat(af.width)||r.width, parseFloat(af.height)||r.height)); });
      var doc=document.documentElement;
      return JSON.stringify({ spill:spill, over:over, taps:taps, hscroll: doc.scrollWidth > doc.clientWidth + 1 });})()`).then(JSON.parse);
    ok(`${ENG}.v2.360 nada se pinta fuera de su card`, tight.spill === false, JSON.stringify(tight));
    ok(`${ENG}.v2.360 el ⋯ no se solapa con el nombre`, tight.over === false, JSON.stringify(tight.over));
    ok(`${ENG}.v2.360 el ⋯ tiene 44 px de área táctil`, tight.taps.every(x => x >= 44), JSON.stringify(tight.taps));
    ok(`${ENG}.v2.360 sin scroll horizontal`, tight.hscroll === false);

    // §16 — el título se VE en mayúsculas y el DOM sigue siendo una frase.
    const ttl = await page.evaluate(`(function(){
      var h=document.querySelector('#wsPlansSection .wspl-title');
      return JSON.stringify({ txt:h.textContent, tt:getComputedStyle(h).textTransform });})()`).then(JSON.parse);
    ok(`${ENG}.v2.título en mayúsculas de presentación, no en el DOM`,
      ttl.tt === 'uppercase' && ttl.txt === 'Tus planes', JSON.stringify(ttl));

    // §17 — cada tarjeta trae el acento de SU capacidad, y no todas el mismo.
    const acc = await page.evaluate(`(function(){
      return JSON.stringify([].slice.call(document.querySelectorAll('#wsPlansSection .wspl-card'))
        .map(function(c){ return [c.getAttribute('data-wspl-accent'),
          getComputedStyle(c.querySelector('.wspl-ico')).color]; }));})()`).then(JSON.parse);
    ok(`${ENG}.v2.acento · cada tarjeta declara el suyo`, acc.every(a => !!a[0]), JSON.stringify(acc));
    ok(`${ENG}.v2.acento · el color del icono cambia de verdad entre capacidades`,
      new Set(acc.map(a => a[1])).size >= 3, JSON.stringify(acc.map(a => a[1])));

    // §21 — el menú se abre, se cierra con Escape y devuelve el foco.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(90);
    await page.click('#wsPlansSection .wspl-card[data-wspl-id="d1"] .wspl-menu');
    await page.waitForTimeout(120);
    const opened = await page.evaluate(`(function(){
      var m=document.getElementById('wsPlansMenu');
      return JSON.stringify({ open:!!m, items: m ? [].slice.call(m.querySelectorAll('[data-wsplmenu-act]')).map(function(b){return b.getAttribute('data-wsplmenu-act');}) : [],
        inView: m ? (m.getBoundingClientRect().right <= innerWidth + 1 && m.getBoundingClientRect().bottom <= innerHeight + 1) : false });})()`).then(JSON.parse);
    ok(`${ENG}.v2.menú · se abre con las cinco acciones`,
      opened.open && opened.items.join(',') === 'open,rename,dup,unpin,del', JSON.stringify(opened.items));
    ok(`${ENG}.v2.menú · cabe en pantalla`, opened.inView === true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
    const closed = await page.evaluate(`(function(){
      return JSON.stringify({ open: !!document.getElementById('wsPlansMenu'),
        focus: document.activeElement ? (document.activeElement.className||'') : '' });})()`).then(JSON.parse);
    ok(`${ENG}.v2.menú · Escape lo cierra y devuelve el foco al ⋯`,
      closed.open === false && /wspl-menu/.test(closed.focus), JSON.stringify(closed));

    // §22 — «Quitar del Dashboard» OCULTA y NO BORRA, y el viaje de vuelta existe.
    await page.click('#wsPlansSection .wspl-card[data-wspl-id="d1"] .wspl-menu');
    await page.waitForTimeout(120);
    await page.click('#wsPlansMenu [data-wsplmenu-act="unpin"]');
    await page.waitForTimeout(200);
    const after = await page.evaluate(`(function(){
      var ids=[].slice.call(document.querySelectorAll('#wsPlansSection .wspl-card')).map(function(c){return c.getAttribute('data-wspl-id');});
      var raw=JSON.parse(localStorage.getItem('aurix_ws_projects_v1')||'[]');
      var d=raw.find(function(x){return x.id==='d1';});
      return JSON.stringify({ ids:ids, exists:!!d, hidden:!!(d&&d.dashHidden), deleted:!!(d&&d.deletedAt),
        inputs: d ? JSON.stringify(d.inputs) : null });})()`).then(JSON.parse);
    ok(`${ENG}.v2.quitar · desaparece de la sección`, after.ids.indexOf('d1') < 0, JSON.stringify(after.ids));
    ok(`${ENG}.v2.quitar · el documento SIGUE existiendo, sin tombstone y con sus datos`,
      after.exists && after.hidden && !after.deleted && after.inputs === JSON.stringify(DOCS[0].inputs), JSON.stringify(after));
    ok(`${ENG}.v2.quitar · el resto de planes no se ve afectado`, after.ids.length === 4, JSON.stringify(after.ids));
    // y sobrevive a un repintado (es una preferencia persistida, no un estado de pantalla)
    await paint(page);
    await page.waitForTimeout(120);
    const again = await page.evaluate(`(function(){
      return JSON.stringify([].slice.call(document.querySelectorAll('#wsPlansSection .wspl-card')).map(function(c){return c.getAttribute('data-wspl-id');}));})()`).then(JSON.parse);
    ok(`${ENG}.v2.quitar · sigue oculto tras repintar`, again.indexOf('d1') < 0, JSON.stringify(again));
    // el interruptor inverso, por su owner
    await page.evaluate(`(function(){ _wsPlanDashSet('d1', false); return true; })()`);
    await page.waitForTimeout(180);
    const back = await page.evaluate(`(function(){
      var ids=[].slice.call(document.querySelectorAll('#wsPlansSection .wspl-card')).map(function(c){return c.getAttribute('data-wspl-id');});
      var raw=JSON.parse(localStorage.getItem('aurix_ws_projects_v1')||'[]');
      var d=raw.find(function(x){return x.id==='d1';});
      return JSON.stringify({ ids:ids, flag: d ? ('dashHidden' in d) : null });})()`).then(JSON.parse);
    ok(`${ENG}.v2.volver · «Añadir al Dashboard» lo devuelve y limpia la marca`,
      back.ids.indexOf('d1') >= 0 && back.flag === false, JSON.stringify(back));

    // §44 — un presupuesto sin datos no pinta barra.
    await seed(page, [{ id: 'z1', type: 'monthly_budget', customName: 'Vacío', updatedAt: 9, revision: 1, inputs: {} }]);
    await paint(page);
    await page.waitForTimeout(120);
    const bare = await page.evaluate(`(function(){
      var sec=document.getElementById('wsPlansSection');
      return JSON.stringify({ n: sec.querySelectorAll('.wspl-card').length,
        share: sec.querySelectorAll('.wspl-share').length,
        metrics: sec.querySelectorAll('.wspl-m').length });})()`).then(JSON.parse);
    ok(`${ENG}.v2.sin datos · tarjeta sí, barra NO, cifras NO`,
      bare.n === 1 && bare.share === 0 && bare.metrics === 0, JSON.stringify(bare));

    await page.screenshot({ path: join(OUT, `v2-${ENG}-1440.png`) }).catch(() => {});
    await ctx2.close();
  }
  await browser.close();
}

server.close();
console.log('\n════════════════════════════════════════════════');
console.log(pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { console.log('\nFAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); console.log('\nRESULT: NO-GO'); process.exit(1); }
console.log('\nRESULT: GO — capturas en docs/ws-dashboard-plans/');
process.exit(0);
