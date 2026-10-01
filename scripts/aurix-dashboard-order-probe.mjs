#!/usr/bin/env node
/**
 * AURIX · DASHBOARD — ORDEN PERSISTENTE, «TUS PLANES» Y APERTURA DESDE ARRIBA
 * ════════════════════════════════════════════════════════════════════════════
 * Lo que sólo un navegador puede responder sobre la especificación de orden:
 *   1. reordenar Patrimonio y Tus planes (arrastre de ratón, arrastre táctil,
 *      teclado y el menú «Mover antes/después») y que el orden SOBREVIVA a una
 *      recarga, con las categorías ocultas en su hueco y lo nuevo al final;
 *   2. que no exista camino para soltar una tarjeta en el otro grupo;
 *   3. que el agarre no abra nada y que el scroll táctil sobre la tarjeta no
 *      reordene ni abra;
 *   4. geometría de las tarjetas de Tus planes (misma altura y CTA alineado en
 *      la fila en PC; una columna sin solapes en móvil);
 *   5. abrir un documento desde un Dashboard desplazado: documento correcto,
 *      inicio visible, editar no devuelve arriba, volver recupera el origen.
 *
 * NO es una sesión autenticada (OTP-only): la persona se monta por la superficie
 * saneada del resolver y los documentos son de PRUEBA.
 *
 *   node scripts/aurix-dashboard-order-probe.mjs
 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const OUT = join(ROOT, 'docs', 'dashboard-order');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const abs = normalize(join(ROOT, p)); if (!abs.startsWith(ROOT)) return res.writeHead(403).end();
    let body = await readFile(abs);
    if (abs.endsWith('app.js')) body = Buffer.from(String(body)
      .replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')
      .replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0')
      // Sin sesión OTP el guard redirige a login y PURGA el estado local (incluidas las dos
      // claves de orden): es el aislamiento correcto, pero aquí borraría lo que se está midiendo.
      .replace('function _aurixDoLoginRedirect(reason, clearState) {', 'function _aurixDoLoginRedirect(reason, clearState) { return false;'));
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

let pass = 0; const fails = []; const skipped = [];
// LÍMITE DECLARADO, no un verde: WebKit automatizado de ESCRITORIO (> 768 px) congela el hilo
// principal del Dashboard también en `main` (docs/AURIX-ONBOARDING-CLOSE-INCIDENTS.md §1, rama
// onboarding/premium). Un caso que no responde en su plazo se anota como NO EJECUTADO.
async function guarded(name, ctx, fn, ms) {
  let timer;
  const to = new Promise(r => { timer = setTimeout(() => r('__timeout'), ms || 90000); });
  let r;
  try { r = await Promise.race([fn(), to]); } catch (e) { r = e; }
  clearTimeout(timer);
  if (r === '__timeout' || (r instanceof Error && /closed|crash/i.test(r.message))) {
    skipped.push(name); console.log('  ⚠ ' + name + ' — NO EJECUTADO (congelación WebKit escritorio, preexistente)');
    await Promise.race([ctx.close().catch(() => {}), new Promise(r => setTimeout(r, 5000))]); return false;
  }
  if (r instanceof Error) throw r;
  return true;
}
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (info ? '  [' + info + ']' : '')); console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };

// Tres categorías con posiciones (las otras tres quedan OCULTAS) e importes grandes.
const ASSETS = (types) => JSON.stringify(types.map((tp, i) => ({
  id: 'fx_' + tp, type: tp, name: 'Activo ' + tp, ticker: ['AAPL', 'BTC', 'EUR', 'VWCE'][i] || 'X',
  quantity: 1, buyPrice: [1234567.89, 25000, 12.5, 90][i] || 1, currentPrice: [1234567.89, 31000, 12.5, 95][i] || 1, assetCurrency: 'EUR',
})));
const DOCS = [
  { id: 'b1', type: 'monthly_budget', customName: 'Casa', updatedAt: 500, revision: 1,
    inputs: { salary: 128500, housing: 41200, food: 9300, transport: 2400, leisure: 3100 } },
  { id: 'r1', type: 'receivables_app', customName: 'Clientes del estudio de arquitectura 2026 — cartera completa', updatedAt: 400, revision: 1,
    inputs: { items: [
      { id: 'i1', personOrCompany: 'ACME', concept: 'Web', units: 1, unitPrice: 6000, paidAmount: 2000 },
      { id: 'i2', personOrCompany: 'B', concept: 'Diseño', units: 1, unitPrice: 2400, paidAmount: 0, dueDate: '2024-01-15' } ] } },
  { id: 'j1', type: 'trade_journal', customName: 'Diario', updatedAt: 300, revision: 1,
    inputs: { currency: 'EUR', trades: [{ id: 't1', asset: 'BTC', atype: 'crypto', buy: 1, qty: 1, currency: 'EUR' }] } },
  { id: 'e1', type: 'monthly_budget', customName: 'Vacío', updatedAt: 200, revision: 1, inputs: {} },
];

async function mount(page, o) {
  o = o || {};
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(`typeof updateCategoryCards === 'function' && typeof _aurixReorderStep === 'function'`, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  await page.evaluate(`(function(){
    var bl = document.getElementById('bootLoader'); if (bl) bl.remove();
    var ar = document.getElementById('appRoot'); if (ar) ar.style.opacity = '1';
    try { switchLang(${JSON.stringify(o.lang || 'es')}); } catch (_) {}
    activeCategory = null;
    assets = JSON.parse(${JSON.stringify(ASSETS(o.types || ['stock', 'crypto', 'cash']))});
    var f = Object.create(null);
    _AURIX_ENT_CANON.forEach(function (k) { f[k] = (k !== 'workspace.catalog_preview'); });
    _aurixEnt = { loaded: true, loading: false, error: null, plan: 'premium', status: 'active', source: 'plan',
                  validUntil: null, features: f, sources: Object.create(null), fetchedAt: Date.now() };
    _wsDocTableState = 'yes';
    ${o.docs ? `localStorage.setItem('aurix_ws_projects_v1', ${JSON.stringify(JSON.stringify(o.docs))});` : ''}
    switchTab('home'); _wsPlansWireOnce(); updateCategoryCards();
    return true; })()`);
  await page.waitForTimeout(450);
}
const catOrder = page => page.evaluate(`[].slice.call(document.querySelectorAll('#categoriesGrid .cat-card[data-type]')).map(function(c){ return c.dataset.type; })`);
const planOrder = page => page.evaluate(`[].slice.call(document.querySelectorAll('#wsPlansGrid .wspl-card')).map(function(c){ return c.getAttribute('data-wspl-id'); })`);
const stored = (page, k) => page.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(k)}) || 'null')`);
const center = (page, sel) => page.evaluate(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; e.scrollIntoView({block:'center', behavior:'instant'}); var r=e.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}; })()`);
// Clic por coordenadas: una categoría sin precio es `aria-disabled` y Playwright se niega a
// pulsarla con `page.click`, aunque el agarre sí deba responder.
async function clickAt(page, sel) {
  const c = await center(page, sel); await page.waitForTimeout(60);
  const c2 = await page.evaluate(`(function(){ var r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}; })()`);
  if (!c || !c2) return false;
  await page.mouse.click(c2.x, c2.y); return true;
}
async function mouseDrag(page, fromSel, toSel) {
  const a = await center(page, fromSel); await page.waitForTimeout(80);
  const a2 = await page.evaluate(`(function(){ var r=document.querySelector(${JSON.stringify(fromSel)}).getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}; })()`);
  const b = await page.evaluate(`(function(){ var r=document.querySelector(${JSON.stringify(toSel)}).getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}; })()`);
  if (!a || !b) return false;
  await page.mouse.move(a2.x, a2.y); await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(a2.x + (b.x - a2.x) * i / 12, a2.y + (b.y - a2.y) * i / 12); await page.waitForTimeout(16); }
  await page.mouse.up(); await page.waitForTimeout(120);
  return true;
}
async function touchDrag(cdp, page, fromSel, toSel) {
  const a = await center(page, fromSel); await page.waitForTimeout(80);
  const a2 = await page.evaluate(`(function(){ var r=document.querySelector(${JSON.stringify(fromSel)}).getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}; })()`);
  const b = await page.evaluate(`(function(){ var r=document.querySelector(${JSON.stringify(toSel)}).getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}; })()`);
  if (!a || !b) return false;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a2.x, y: a2.y }] });
  for (let i = 1; i <= 14; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a2.x + (b.x - a2.x) * i / 14, y: a2.y + (b.y - a2.y) * i / 14 }] }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
  return true;
}

const ONLY_ENG = process.env.AURIX_ENG || '';           // 'CR' | 'WK' para una pasada dirigida
const ONLY_SEC = String(process.env.AURIX_SEC || '1234'); // secciones a ejecutar
for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  if (ONLY_ENG && ONLY_ENG !== ENG) continue;
  const browser = await launcher.launch();

  // ══ 1 · ORDEN, RECARGA, OCULTAS Y NUEVAS — escritorio, ratón ══════════════
  if (ONLY_SEC.includes('1')) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const T = `${ENG}.1440`;
    const ran1 = await guarded(T + ' (orden y recarga)', ctx, async () => {
    await mount(page, { docs: DOCS });
    const c0 = await catOrder(page);
    ok(`${T} patrimonio por defecto: sólo las tres categorías con posiciones`, JSON.stringify(c0) === '["stock","crypto","cash"]', JSON.stringify(c0));
    await mouseDrag(page, '#categoriesGrid .cat-card[data-type="cash"] .dash-grip', '#categoriesGrid .cat-card[data-type="stock"]');
    const c1 = await catOrder(page);
    const s1 = await stored(page, 'portfolio_cat_order');
    if (c1[0] !== 'cash') console.log('    diag', await page.evaluate(`JSON.stringify({ busy: _aurixReorderBusy, y: scrollY, grip: (function(){ var g=document.querySelector('#categoriesGrid .cat-card[data-type="cash"] .dash-grip').getBoundingClientRect(); var e=document.elementFromPoint(g.left+8,g.top+14); return [Math.round(g.left),Math.round(g.top), e && e.tagName, e && String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className)]; })() })`));
    ok(`${T} arrastre desde el agarre: Liquidez pasa delante`, c1[0] === 'cash', JSON.stringify(c1));
    ok(`${T} se guarda el orden COMPLETO (ocultas en su hueco), no sólo lo visible`,
      Array.isArray(s1) && s1.length === 6 && s1.indexOf('real_estate') !== -1 && s1.indexOf('cash') < s1.indexOf('stock'), JSON.stringify(s1));
    ok(`${T} el arrastre no abrió la categoría`, await page.evaluate('activeCategory === null'));
    // Plans: teclado sobre el agarre y arrastre.
    const p0 = await planOrder(page);
    await page.focus('#wsPlansGrid .wspl-card[data-wspl-id="b1"] .dash-grip');
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(80);
    const p1 = await planOrder(page);
    ok(`${T} teclado (flecha) en el agarre mueve el plan un puesto`, p1[1] === 'b1' && p1[0] === p0[1], JSON.stringify({ p0, p1 }));
    ok(`${T} el foco sigue en el agarre del plan movido`, await page.evaluate(`document.activeElement && document.activeElement.closest('.wspl-card').getAttribute('data-wspl-id') === 'b1'`));
    await mouseDrag(page, '#wsPlansGrid .wspl-card[data-wspl-id="e1"] .dash-grip', '#wsPlansGrid .wspl-card[data-wspl-id="j1"]');
    const p2 = await planOrder(page);
    const sp = await stored(page, 'aurix_plan_order');
    ok(`${T} arrastre de un plan dentro de su grupo, guardado por identidad «kind:id»`,
      p2.indexOf('e1') < p2.indexOf('j1') && Array.isArray(sp) && sp.every(x => /^(workspace|goal):/.test(x)), JSON.stringify({ p2, sp }));
    ok(`${T} arrastrar un plan no lo abre`, await page.evaluate(`currentTab === 'home'`));
    // Entre grupos: soltar un plan encima de las categorías no cambia NINGUNO de los dos.
    const before = JSON.stringify([await catOrder(page), await planOrder(page)]);
    await mouseDrag(page, '#wsPlansGrid .wspl-card[data-wspl-id="r1"] .dash-grip', '#categoriesGrid .cat-card[data-type="crypto"]');
    const after = JSON.stringify([await catOrder(page), await planOrder(page)]);
    ok(`${T} no hay camino entre grupos: soltar un plan en Patrimonio no mueve nada`, before === after, before + ' → ' + after);
    // Tocar el agarre sin arrastrar: menú «Mover…», y no abre. Se usa la tarjeta CENTRAL, que es
    // la única que ofrece las dos direcciones.
    const mid = (await catOrder(page))[1];
    await clickAt(page, '#categoriesGrid .cat-card[data-type="' + mid + '"] .dash-grip');
    await page.waitForTimeout(120);
    const menu = await page.evaluate(`(function(){ var m=document.getElementById('dashReorderMenu'); return m ? [].slice.call(m.querySelectorAll('[data-wsmenu-act]')).map(function(b){return b.getAttribute('data-wsmenu-act');}) : null; })()`);
    ok(`${T} clic en el agarre: menú Mover antes/después y la categoría NO se abre`,
      JSON.stringify(menu) === '["before","after"]' && await page.evaluate('activeCategory === null'), JSON.stringify(menu));
    const cm = await catOrder(page);
    await clickAt(page, '#dashReorderMenu [data-wsmenu-act="after"]'); await page.waitForTimeout(80);
    const c2 = await catOrder(page);
    // Alt+flechas en la tarjeta (teclado) para Patrimonio: la primera pasa a segunda.
    const first = c2[0];
    await page.focus('#categoriesGrid .cat-card[data-type="' + first + '"]');
    await page.keyboard.press('Alt+ArrowRight'); await page.waitForTimeout(80);
    const c3 = await catOrder(page);
    ok(`${T} menú y Alt+flechas reordenan Patrimonio`, c2[2] === mid && cm[1] === mid && c3[1] === first, JSON.stringify({ cm, c2, c3 }));
    ok(`${T} Alt+flecha no abrió la categoría`, await page.evaluate('activeCategory === null'));
    const expectCats = await catOrder(page), expectPlans = await planOrder(page);

    // ── RECARGA ── el orden sale del almacén, no se re-deriva.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await mount(page, {});
    ok(`${T} recarga · Patrimonio conserva el orden`, JSON.stringify(await catOrder(page)) === JSON.stringify(expectCats), JSON.stringify([await catOrder(page), expectCats]));
    ok(`${T} recarga · Tus planes conserva el orden`, JSON.stringify(await planOrder(page)) === JSON.stringify(expectPlans), JSON.stringify([await planOrder(page), expectPlans]));
    // Una categoría que estaba OCULTA vuelve en su hueco; un documento nuevo va al final; uno borrado se descarta.
    await page.evaluate(`(function(){
      assets = assets.concat([{ id: 'fx_etf', type: 'etf', name: 'Activo etf', ticker: 'VWCE', quantity: 1, buyPrice: 90, currentPrice: 95, assetCurrency: 'EUR' }]);
      var list = JSON.parse(localStorage.getItem('aurix_ws_projects_v1'));
      list.push({ id: 'n1', type: 'monthly_budget', customName: 'Nuevo', updatedAt: 9999, revision: 1, inputs: { salary: 10 } });
      localStorage.setItem('aurix_ws_projects_v1', JSON.stringify(list));
      _ws4Tombstone('j1');
      updateCategoryCards(); return true; })()`);
    await page.waitForTimeout(200);
    const c4 = await catOrder(page), p4 = await planOrder(page);
    const full = await stored(page, 'portfolio_cat_order');
    const expectWithEtf = full.filter(x => expectCats.indexOf(x) !== -1 || x === 'etf');
    ok(`${T} categoría que vuelve a tener posiciones: reaparece en su hueco guardado`, JSON.stringify(c4) === JSON.stringify(expectWithEtf), JSON.stringify({ c4, full }));
    ok(`${T} documento nuevo al final y borrado descartado`, p4[p4.length - 1] === 'n1' && p4.indexOf('j1') === -1, JSON.stringify(p4));
    // Guardar descarta lo borrado y conserva lo quitado del Dashboard.
    await page.evaluate(`(function(){ _wsPlanDashSet('r1', true, 'workspace'); return true; })()`);
    await page.focus('#wsPlansGrid .wspl-card[data-wspl-id="n1"] .dash-grip');
    await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(80);
    const sp2 = await stored(page, 'aurix_plan_order');
    ok(`${T} al guardar: «j1» (borrado) fuera, «r1» (quitado del Dashboard) conserva su hueco`,
      sp2.indexOf('workspace:j1') === -1 && sp2.indexOf('workspace:r1') !== -1, JSON.stringify(sp2));
    // Sincronización: viaja en ui_state y una fila sin el campo no borra el local.
    const sync = await page.evaluate(`(function(){
      var ui = _collectUiState();
      var had = JSON.stringify(ui.planOrder);
      _applyRemoteUiState({ catOrder: ui.catOrder });   // fila antigua, sin planOrder
      var kept = localStorage.getItem('aurix_plan_order') === had;
      _applyRemoteUiState({ catOrder: ['cash','etf','stock','crypto','metal','real_estate'], planOrder: ['workspace:e1','workspace:b1'] });
      var dom = [].slice.call(document.querySelectorAll('#categoriesGrid .cat-card[data-type]')).map(function(c){ return c.dataset.type; });
      var pl = [].slice.call(document.querySelectorAll('#wsPlansGrid .wspl-card')).map(function(c){ return c.getAttribute('data-wspl-id'); });
      return JSON.stringify({ inPayload: Array.isArray(ui.planOrder) && ui.planOrder.length > 0, kept: kept, dom: dom, pl: pl });
    })()`).then(JSON.parse);
    ok(`${T} sync · planOrder viaja en ui_state y una fila sin él no lo borra`, sync.inPayload && sync.kept, JSON.stringify(sync));
    ok(`${T} sync · el orden remoto se aplica al Dashboard ya pintado`, sync.dom[0] === 'cash' && sync.dom[1] === 'etf' && sync.pl[0] === 'e1' && sync.pl[1] === 'b1', JSON.stringify(sync));
    // Cuentas: la clave se purga en el cambio de usuario.
    const purge = await page.evaluate(`(function(){ return PORTFOLIO_KEYS.indexOf('aurix_plan_order') !== -1 && PORTFOLIO_KEYS.indexOf('portfolio_cat_order') !== -1; })()`);
    ok(`${T} aislamiento · las dos claves de orden se purgan al cambiar de cuenta`, purge);
    // Fallo al guardar: se dice y se ofrece reintentar; nunca se aparenta.
    const failT = await page.evaluate(`(async function(){
      var orig = _flushStatePersistence, calls = 0;
      _flushStatePersistence = async function(){ calls++; return calls === 1 ? 'fail' : 'ok'; };
      var bl = _bootLoadComplete; _bootLoadComplete = true;
      _aurixOrderFlushSoon(0);
      await new Promise(function(r){ setTimeout(r, 120); });
      var tst = document.querySelector('[data-toast-tag="dash-order"]');
      var txt = tst ? tst.textContent : '';
      var btn = tst ? tst.querySelector('.aurix-toast-act') : null;
      if (btn) btn.click();
      await new Promise(function(r){ setTimeout(r, 120); });
      _flushStatePersistence = orig; _bootLoadComplete = bl;
      return JSON.stringify({ txt: txt, retried: calls === 2, gone: !document.querySelector('[data-toast-tag="dash-order"].is-open') });
    })()`).then(JSON.parse);
    ok(`${T} fallo de guardado: aviso con «Reintentar», y reintentar vuelve a guardar`, /No se ha podido guardar el orden/.test(failT.txt) && failT.retried, JSON.stringify(failT));
    }, 240000);
    if (ran1) await ctx.close();
  }

  // ══ 2 · MÓVIL — arrastre táctil (Chromium), menú (WebKit), scroll sin efectos ══
  if (ONLY_SEC.includes('2')) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: ENG === 'CR', reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await mount(page, { docs: DOCS });
    const T = `${ENG}.390`;
    if (ENG === 'CR') {
      const cdp = await ctx.newCDPSession(page);
      await touchDrag(cdp, page, '#categoriesGrid .cat-card[data-type="cash"] .dash-grip', '#categoriesGrid .cat-card[data-type="stock"]');
      const c = await catOrder(page);
      ok(`${T} arrastre TÁCTIL desde el agarre reordena Patrimonio sin abrir`, c[0] === 'cash' && await page.evaluate('activeCategory === null'), JSON.stringify(c));
      // Deslizar sobre el CUERPO de una tarjeta es scroll: ni reordena ni abre.
      const before = JSON.stringify(await catOrder(page));
      const y0 = await page.evaluate('window.scrollY');
      const box = await page.evaluate(`(function(){ var r=document.querySelector('#categoriesGrid .cat-card[data-type="crypto"]').getBoundingClientRect(); return {x:r.left+r.width*0.6, y:r.top+r.height/2}; })()`);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y }] });
      for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x, y: box.y - i * 22 }] }); await page.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(250);
      const y1 = await page.evaluate('window.scrollY');
      ok(`${T} deslizar sobre la tarjeta hace scroll y no reordena ni abre`,
        y1 > y0 && JSON.stringify(await catOrder(page)) === before && await page.evaluate('activeCategory === null'), JSON.stringify({ y0, y1 }));
      await touchDrag(cdp, page, '#wsPlansGrid .wspl-card[data-wspl-id="j1"] .dash-grip', '#wsPlansGrid .wspl-card[data-wspl-id="b1"]');
      const p = await planOrder(page);
      ok(`${T} arrastre TÁCTIL de un plan, sin abrirlo`, p[0] === 'j1' && await page.evaluate(`currentTab === 'home'`), JSON.stringify(p));
    } else {
      await page.tap('#wsPlansGrid .wspl-card[data-wspl-id="b1"] .dash-grip'); await page.waitForTimeout(150);
      const has = await page.evaluate(`!!document.querySelector('#dashReorderMenu [data-wsmenu-act="after"]')`);
      if (has) await page.tap('#dashReorderMenu [data-wsmenu-act="after"]');
      await page.waitForTimeout(120);
      const p = await planOrder(page);
      ok(`${T} toque en el agarre: alternativa táctil «Mover después», sin abrir el plan`, has && p[1] === 'b1' && await page.evaluate(`currentTab === 'home'`), JSON.stringify(p));
    }
    // Geometría móvil: una columna; agarre, menú y CTA sin solaparse; nada fuera de la tarjeta.
    const geo = await page.evaluate(`(function(){
      var cards=[].slice.call(document.querySelectorAll('#wsPlansGrid .wspl-card'));
      var cols=getComputedStyle(document.getElementById('wsPlansGrid')).gridTemplateColumns.split(' ').filter(Boolean).length;
      var I=function(a,b){ return a.left<b.right-0.5 && b.left<a.right-0.5 && a.top<b.bottom-0.5 && b.top<a.bottom-0.5; };
      var bad=[];
      cards.forEach(function(c){ var cb=c.getBoundingClientRect();
        var g=c.querySelector('.dash-grip').getBoundingClientRect(), m=c.querySelector('.wspl-menu').getBoundingClientRect(), go=c.querySelector('.wspl-go').getBoundingClientRect(), nm=c.querySelector('.wspl-name').getBoundingClientRect();
        if (I(g,m)||I(g,go)||I(m,go)||I(nm,m)||I(nm,g)) bad.push(c.getAttribute('data-wspl-id')+':overlap');
        [].slice.call(c.querySelectorAll('*')).forEach(function(e){ var b=e.getBoundingClientRect(); if(b.width && (b.right>cb.right+1||b.left<cb.left-1)) bad.push(c.getAttribute('data-wspl-id')+':spill:'+e.className); });
      });
      return JSON.stringify({ cols: cols, bad: bad.slice(0,6) }); })()`).then(JSON.parse);
    ok(`${T} una columna, sin solapes de agarre/menú/CTA y nada fuera de la tarjeta`, geo.cols === 1 && geo.bad.length === 0, JSON.stringify(geo));
    await ctx.close();
  }

  // ══ 3 · GEOMETRÍA EN FILA Y CAPTURAS — ES/EN × anchos ══════════════════════
  for (const lang of (ONLY_SEC.includes('3') ? (process.env.AURIX_LANG ? [process.env.AURIX_LANG] : ['es', 'en']) : [])) {
    for (const [w, h] of [[360, 740], [390, 844], [768, 1024], [1024, 768], [1440, 900]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 700 ? 2 : 1, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      const T = `${ENG}.${lang}.${w}`;
      const ran = await guarded(T, ctx, async () => {
      await mount(page, { docs: DOCS, lang, types: ['stock', 'crypto', 'cash', 'etf'] });
      if (process.env.AURIX_TRACE) console.log('    · ' + T + ' montado');
      const g = await page.evaluate(`(function(){
        var cards=[].slice.call(document.querySelectorAll('#wsPlansGrid .wspl-card'));
        var rows={}; cards.forEach(function(c){ var r=c.getBoundingClientRect(); var k=Math.round(r.top); (rows[k]=rows[k]||[]).push(c); });
        var rowBad=[];
        Object.keys(rows).forEach(function(k){ var rs=rows[k]; if(rs.length<2) return;
          var hs=rs.map(function(c){return Math.round(c.getBoundingClientRect().height);});
          var go=rs.map(function(c){return Math.round(c.querySelector('.wspl-go').getBoundingClientRect().bottom);});
          var hero=rs.map(function(c){return Math.round(c.querySelector('.wspl-slot-hero').getBoundingClientRect().top);});
          if (Math.max.apply(0,hs)-Math.min.apply(0,hs)>1) rowBad.push('h:'+hs);
          if (Math.max.apply(0,go)-Math.min.apply(0,go)>1) rowBad.push('cta:'+go);
          if (Math.max.apply(0,hero)-Math.min.apply(0,hero)>1) rowBad.push('hero:'+hero);
        });
        var spill=cards.some(function(c){ var cb=c.getBoundingClientRect(); return [].slice.call(c.querySelectorAll('*')).some(function(e){ var b=e.getBoundingClientRect(); return b.width && (b.right>cb.right+1||b.left<cb.left-1||b.bottom>cb.bottom+1); }); });
        var types=cards.filter(function(c){ return c.querySelector('.wspl-type'); }).length;
        var nan=/NaN|undefined|Infinity/.test(document.getElementById('wsPlansSection').textContent);
        var recv=document.querySelector('#wsPlansGrid [data-wspl-id="r1"]');
        var recvTxt=recv?recv.textContent:'';
        return JSON.stringify({ n: cards.length, rows: Object.keys(rows).length, rowBad: rowBad, spill: spill, types: types, nan: nan,
          recvPct: /\\d+\\s?%/.test(recvTxt), recvOver: /Vencido|Overdue/.test(recvTxt),
          spend: !!document.querySelector('#wsPlansGrid [data-wspl-id="b1"] svg.wspl-spend'),
          empty: !!document.querySelector('#wsPlansGrid [data-wspl-id="e1"] .wspl-empty') }); })()`).then(JSON.parse);
      ok(`${T} misma altura, cifra y CTA alineados en cada fila; nada fuera; sin subtítulo; sin NaN`,
        g.n === 4 && g.rowBad.length === 0 && !g.spill && g.types === 0 && !g.nan, JSON.stringify(g));
      if (w === 1440) ok(`${T} Cobros: % cobrado y vencido; Presupuesto: reparto; vacío: estado explícito`, g.recvPct && g.recvOver && g.spend && g.empty, JSON.stringify(g));
      await page.evaluate(`document.getElementById('wsPlansSection').scrollIntoView({block:'start', behavior:'instant'}); window.scrollBy({top:-260, behavior:'instant'})`);
      await page.waitForTimeout(150);
      await page.screenshot({ path: join(OUT, `order-${ENG}-${lang}-${w}x${h}.png`) });
      });
      if (ran) await ctx.close();
    }
  }

  // ══ 4 · ABRIR DESDE ARRIBA — Dashboard desplazado → documento → editar → volver ══
  for (const [w, h, rm] of (ONLY_SEC.includes('4') ? [[390, 844, 'reduce'], [1440, 900, 'no-preference']] : [])) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 700 ? 2 : 1, reducedMotion: rm });
    const page = await ctx.newPage();
    const T = `${ENG}.${w}.${rm}`;
    const ran4 = await guarded(T + ' (apertura)', ctx, async () => {
    await mount(page, { docs: DOCS });
    // El origen se mide JUSTO antes del clic y el clic no vuelve a desplazar: medir antes de
    // centrar el punto de clic hacía que la sonda comparase contra un scroll que nunca fue el origen.
    await page.evaluate(`document.querySelector('#wsPlansGrid [data-wspl-id="b1"] .wspl-slot-hero').scrollIntoView({block:'center', behavior:'instant'})`);
    await page.waitForTimeout(150);
    const y0 = await page.evaluate('Math.round(window.scrollY)');
    const top0 = await page.evaluate(`Math.round(document.querySelector('#wsPlansGrid [data-wspl-id="b1"]').getBoundingClientRect().top)`);
    // Pulsar la TARJETA (no el CTA) también abre.
    const hp = await page.evaluate(`(function(){ var r=document.querySelector('#wsPlansGrid [data-wspl-id="b1"] .wspl-slot-hero').getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}; })()`);
    await page.mouse.click(hp.x, hp.y);
    await page.waitForTimeout(rm === 'reduce' ? 250 : 600);
    const r = await page.evaluate(`(function(){
      var bar=document.querySelector('#aurixWorkspace .wsh-bar'); var b=bar?bar.getBoundingClientRect():null;
      var ae=document.activeElement;
      return JSON.stringify({ tab: currentTab, tool: _wsToolActive, edit: _wsToolEditId, y: Math.round(window.scrollY),
        doc: (document.querySelector('#aurixWorkspace .wsh-bar-doc')||{}).textContent||'',
        barVisible: !!b && b.top >= 0 && b.top < innerHeight,
        top: !!document.querySelector('#aurixWorkspace [data-wsbud-top]') && document.querySelector('#aurixWorkspace [data-wsbud-top]').getBoundingClientRect().top < innerHeight,
        focusInput: !!(ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) }); })()`).then(JSON.parse);
    ok(`${T} abrir desde un Dashboard desplazado (y=${y0}): documento correcto e inicio visible`,
      y0 > 200 && r.tab === 'workspace' && r.tool === 'budget' && r.edit === 'b1' && r.doc === 'Casa' && r.y === 0 && r.barVisible && r.top && !r.focusInput, JSON.stringify(r));
    // Editar NO devuelve arriba.
    const ed = await page.evaluate(`(async function(){
      var inp=document.querySelector('#aurixWorkspace [data-wstool-input]') || document.querySelector('#aurixWorkspace input[inputmode]');
      window.scrollTo({top: 420, behavior:'instant'});
      await new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); });
      var y1=Math.round(window.scrollY);
      if (inp) { inp.focus({preventScroll:true}); inp.value = '1234'; inp.dispatchEvent(new Event('input', {bubbles:true})); }
      await new Promise(function(r){ setTimeout(r, 200); });
      return JSON.stringify({ found: !!inp, y1: y1, y2: Math.round(window.scrollY) }); })()`).then(JSON.parse);
    // «No devuelve arriba», que es el contrato: WebKit no tiene anclaje de scroll y el resumen del
    // Presupuesto, que está ENCIMA del campo, se repinta con la cifra nueva — un ajuste de unos
    // píxeles por cambio de altura es preexistente y no es un salto al inicio.
    ok(`${T} editar un campo no devuelve arriba`, ed.found && ed.y1 > 0 && ed.y2 > ed.y1 - 40 && ed.y2 > 100, JSON.stringify(ed));
    // Volver recupera la posición de origen.
    await page.evaluate(`document.querySelector('#aurixWorkspace .wsh-bar-back').click()`);
    await page.waitForTimeout(rm === 'reduce' ? 250 : 600);
    // Se mide lo que el usuario VE —dónde queda la tarjeta de la que salió—, no `scrollY`: si el
    // Dashboard crece por encima al repintarse, el anclaje de scroll del navegador mueve `scrollY`
    // precisamente para que la tarjeta no se mueva.
    const back = await page.evaluate(`JSON.stringify({ tab: currentTab, y: Math.round(window.scrollY),
      top: Math.round(document.querySelector('#wsPlansGrid [data-wspl-id="b1"]').getBoundingClientRect().top) })`).then(JSON.parse);
    ok(`${T} volver al Dashboard recupera la posición de origen (la tarjeta, donde estaba)`, back.tab === 'home' && Math.abs(back.top - top0) <= 2, JSON.stringify({ back, y0, top0 }));
    });
    if (ran4) await ctx.close();
  }
  await browser.close();
}
server.close();
console.log('\n' + pass + ' passed, ' + fails.length + ' failed' + (skipped.length ? ', ' + skipped.length + ' no ejecutados: ' + skipped.join(', ') : ''));
if (fails.length) { console.log('\nFALLOS:'); fails.forEach(f => console.log('  - ' + f)); }
console.log('\nRESULT: ' + (fails.length ? 'NO-GO' : 'GO'));
process.exit(fails.length ? 1 : 0);
