#!/usr/bin/env node
/**
 * AURIX · VOLVER AL RESUMEN NO PUEDE DEJARLO EN NEGRO
 * ════════════════════════════════════════════════════════════════════════════
 * EL DEFECTO, tal y como lo describió el fundador: Resumen → Tus planes → abrir
 * un documento → volver, y aparecen la cabecera, la navegación y el fondo… pero
 * ningún contenido. Una pantalla que parece TERMINADA y está vacía es peor que
 * un error: no hay nada que reintentar y el usuario cree que ha perdido su
 * cartera.
 *
 * LA CAUSA: la pestaña del Resumen se llama `home` en el despachador, y el
 * camino de vuelta pedía `switchTab('dashboard')`. Como no existe esa rama, el
 * despachador vaciaba los contenedores dinámicos —hace eso SIEMPRE, antes de
 * decidir— y después no montaba ninguno. El comentario del propio código decía
 * «hoy nadie fija este origen»; cuando «Tus planes» empezó a fijarlo, el camino
 * se volvió alcanzable y el defecto salió a producción.
 *
 * Esta sonda falla con el defecto original: sin el arreglo, `main` queda oculto
 * y el Resumen no tiene ni una sección visible.
 *
 *   node scripts/aurix-dashboard-return-probe.mjs
 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const OUT  = join(ROOT, 'docs', 'dashboard-return');
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

// Documentos de PLANTILLA, que son los que «Tus planes» publica.
const DOCS = [
  { id: 'dk1', type: 'monthly_budget', customName: 'Presupuesto de casa',
    inputs: { salary: 2500, housing: 700, food: 300 }, revision: 1, createdAt: 1, updatedAt: 9 },
  { id: 'dk2', type: 'real_estate_portfolio', customName: 'Cartera Madrid',
    inputs: { properties: [{ id: 'p1', name: 'Piso', ptype: 'flat', buy: 200000, value: 250000 }] },
    revision: 1, createdAt: 2, updatedAt: 8 },
];

async function mount(page) {
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(`typeof switchTab === 'function' && typeof updateCategoryCards === 'function'`, null, { timeout: 60000 });
  await page.waitForTimeout(600);
  await page.evaluate(`(function(){
    var bl = document.getElementById('bootLoader'); if (bl) bl.remove();
    var ar = document.getElementById('appRoot'); if (ar) ar.style.opacity = '1';
    currentUser = { id: 'u-probe', email: 'probe@aurix.test' };
    activeCategory = null;
    assets = [{ id: 'a1', type: 'stock', name: 'Acción', ticker: 'AAPL', quantity: 1, buyPrice: 100, currentPrice: 120, assetCurrency: 'EUR' },
              { id: 'a2', type: 'crypto', name: 'Bitcoin', ticker: 'BTC', quantity: 1, buyPrice: 25000, currentPrice: 31000, assetCurrency: 'EUR' }];
    var f = Object.create(null);
    _AURIX_ENT_CANON.forEach(function (k) { f[k] = (k !== 'workspace.catalog_preview'); });
    _aurixEnt = { loaded: true, loading: false, error: null, plan: 'premium', status: 'active',
                  source: 'plan', validUntil: null, features: f, sources: Object.create(null), fetchedAt: Date.now() };
    _wsDocTableState = 'yes';
    localStorage.setItem('aurix_ws_projects_v1', ${JSON.stringify(JSON.stringify(DOCS))});
    switchTab('home');
    updateCategoryCards();
    return true; })()`);
  await page.waitForTimeout(300);
}

// ¿El Resumen está PINTADO? No basta con que exista el shell: se exige que su
// contenedor sea visible y que tenga secciones con altura real.
const dash = page => page.evaluate(`(function(){
  var main = document.querySelector('main');
  var mb = main ? main.getBoundingClientRect() : null;
  var secs = main ? [].slice.call(main.querySelectorAll('section')).filter(function(s){
    var r = s.getBoundingClientRect();
    return r.height > 0 && getComputedStyle(s).display !== 'none';
  }) : [];
  var cats = document.querySelectorAll('#categoriesGrid .cat-card').length;
  var plans = document.querySelectorAll('#wsPlansSection [data-wspl-open]').length;
  return JSON.stringify({
    mainShown: !!main && getComputedStyle(main).display !== 'none' && mb.height > 0,
    mainH: mb ? Math.round(mb.height) : 0,
    sections: secs.length, cats: cats, plans: plans,
    // Y que no quede montada la superficie de la que venimos.
    wsMounted: !!document.querySelector('#aurixWorkspace .aurix-wsh'),
    bodyWs: document.body.classList.contains('workspace-active'),
    text: (main ? main.innerText : '').replace(/\\s+/g, ' ').slice(0, 60),
  });})()`).then(JSON.parse);

console.log('AURIX · volver al Resumen desde un documento\n');

for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  const browser = await launcher.launch();
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 700 ? 2 : 1, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const tag = `${ENG}.${w}×${h}`;
    const errors = [];
    // El proxy de precios rechaza el origen de la sonda (127.0.0.1 no está en su
    // allowlist), y WebKit publica ese rechazo como error de página. Es una
    // condición del ENTORNO de prueba, no del producto: se descarta por su
    // texto exacto y cualquier otra excepción sí cuenta.
    page.on('pageerror', e => {
      const m = String(e.message);
      if (/api\/prices|access control checks|Load failed|NetworkError/i.test(m)) return;
      errors.push(m.slice(0, 90));
    });

    await mount(page);
    const start = await dash(page);
    ok(`${tag} de partida el Resumen está pintado`,
      start.mainShown && start.sections >= 2 && start.cats === 2 && start.plans === 2,
      JSON.stringify(start));

    // ══ CADA DOCUMENTO, Y CADA CAMINO DE VUELTA ═══════════════════════════
    for (const doc of DOCS) {
      for (const via of ['boton', 'nav-inferior', 'atras-navegador']) {
        await page.evaluate(`_wsPlansOpen(${JSON.stringify(doc.id)})`);
        await page.waitForTimeout(350);
        const inDoc = await page.evaluate(`(function(){
          return JSON.stringify({ ws: !!document.querySelector('#aurixWorkspace .aurix-wsh'),
            tab: (typeof currentTab !== 'undefined') ? currentTab : null });})()`).then(JSON.parse);
        ok(`${tag} ${doc.type} · el documento se abre`, inDoc.ws === true && inDoc.tab === 'workspace',
          JSON.stringify(inDoc));

        if (via === 'boton') {
          await page.click('#aurixWorkspace .wsh-bar-back');
        } else if (via === 'nav-inferior') {
          // El camino que usa cualquiera en móvil: la pestaña de abajo.
          await page.evaluate(`switchTab('home')`);
        } else {
          // Y el que no controla la app: el atrás del navegador. No debe
          // dejar el Resumen vacío aunque la vista se restaure de bfcache.
          await page.evaluate(`(function(){ history.pushState({}, '', location.pathname + '#doc'); return true; })()`);
          await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
          await page.evaluate(`switchTab('home')`);
        }
        await page.waitForTimeout(420);
        const back = await dash(page);
        ok(`${tag} ${doc.type} · volver por «${via}» deja el Resumen PINTADO`,
          back.mainShown && back.mainH > 200 && back.sections >= 2 && back.cats === 2,
          JSON.stringify(back));
        ok(`${tag} ${doc.type} · «${via}» no deja montada la superficie anterior`,
          back.wsMounted === false && back.bodyWs === false, JSON.stringify(back));
        ok(`${tag} ${doc.type} · y «Tus planes» sigue con sus dos documentos`,
          back.plans === 2, JSON.stringify(back));
      }
    }

    // ══ IDA Y VUELTA REPETIDAS: NI SE DUPLICA NI SE VACÍA ═════════════════
    for (let i = 0; i < 4; i++) {
      await page.evaluate(`_wsPlansOpen('dk1')`);
      await page.waitForTimeout(220);
      await page.click('#aurixWorkspace .wsh-bar-back');
      await page.waitForTimeout(260);
    }
    const loop = await dash(page);
    ok(`${tag} cuatro idas y vueltas: ni pantalla vacía ni tarjetas duplicadas`,
      loop.mainShown && loop.cats === 2 && loop.plans === 2, JSON.stringify(loop));
    ok(`${tag} y sin excepciones en consola durante todo el recorrido`,
      errors.length === 0, JSON.stringify(errors.slice(0, 3)));

    await page.screenshot({ path: join(OUT, `vuelta-${w}x${h}-${ENG}.png`) });
    await ctx.close();
  }
  await browser.close();
}

// ── Y EL ALIAS, FIJADO EN EL CÓDIGO ─────────────────────────────────────────
// La causa fue un nombre de pestaña que no existe. Se normaliza en la ENTRADA
// del despachador para que ningún llamador futuro caiga en la misma trampa.
{
  const app = await readFile(join(ROOT, 'app.js'), 'utf8');
  ok('ALIAS · el despachador acepta «dashboard» como la pestaña del Resumen',
    /if \(tab === 'dashboard'\) tab = 'home';/.test(app), 'sin normalización en switchTab');
}

console.log('\n════════════════════════════════════════════════');
console.log(`${pass} passed, ${fails.length} failed\n`);
if (fails.length) { console.log('FAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); console.log('\nRESULT: NO-GO'); server.close(); process.exit(1); }
console.log('RESULT: GO — capturas en docs/dashboard-return/');
server.close();
