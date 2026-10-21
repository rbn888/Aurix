#!/usr/bin/env node
/**
 * AURIX · CIERRE QUIRÚRGICO — PRESUPUESTO MENSUAL (superficie única) + INVARIANTES ANTES/DESPUÉS
 * ════════════════════════════════════════════════════════════════════════════
 * Navegador real (Chromium y WebKit) sobre la app servida en local. Cubre lo que el cierre AÑADE:
 *   · C4 — Ingresos / Gastos / Disponible abren el editor correcto; Disponible nunca es un campo;
 *     teclado, nombre accesible, Escape, «Listo» y foco de vuelta a quien abrió;
 *   · C5 — desglose → editor sobre ESA partida (nombre, importe, lápiz); «+ Ingreso / + Gasto»;
 *     hoja inferior en móvil, modal ligero en escritorio; foco atrapado; borrar pide confirmación
 *     por ENCIMA del editor;
 *   · C2 — guardado y sin cambios = sólo el estado (sin botón deshabilitado); con cambios vuelve;
 *   · C3 — moneda: documento nuevo elige al momento; documento guardado PREGUNTA (sin conversión,
 *     mismos números), Cancelar/Escape no toca nada, Confirmar es una edición más y se guarda por la
 *     persistencia de siempre; un documento ANTIGUO sin moneda conserva su aviso;
 *   · C6 — la lectura con tono positivo / cero / negativo;
 *   · C7 — 360/390/768/1024/1440 en dos motores: sin scroll horizontal ni scroll anidado, nada
 *     fuera de su caja, ≥44 px, ≥12 px, primera pantalla, muchas filas, nombres largos e importes
 *     grandes, ES/EN y reduced-motion.
 * Y los INVARIANTES con fixtures idénticos contra el árbol de referencia (`AURIX_BASE_REF`, por
 * defecto `fa6f5e1` = producción anterior): totales, disponible, %, reparto del anillo, documento
 * guardado, cálculo de categorías y publicación/navegación del Dashboard.
 *   AURIX_PW=/ruta/playwright/index.mjs node scripts/aurix-ws-budget-surface-probe.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync, mkdtempSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const OUT = join(ROOT, 'docs', 'workspace-visual-qa');
const BASE_REF = process.env.AURIX_BASE_REF || 'fa6f5e1';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const AUTH_PATCH = x => String(x)
  .replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')
  .replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0');
async function serve(root) {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      const f = normalize(join(root, p));
      if (!f.startsWith(root)) { res.writeHead(403).end('no'); return; }
      let b = await readFile(f);
      if (f.endsWith('app.js')) b = Buffer.from(AUTH_PATCH(String(b)));
      res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(b);
    } catch (_) { res.writeHead(404).end('nf'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}
const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
let chromium, webkit;
try { ({ chromium, webkit } = await import(PW)); } catch (e) { console.error('\n✗ SIN MOTORES — ' + PW); process.exit(2); }
const ONLY = (process.env.AURIX_ENGINES || 'CR,WK').split(',');

let pass = 0; const fails = [];
const ok = (n, c, i) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (i ? '  [' + i + ']' : '')); console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } };
mkdirSync(OUT, { recursive: true });

// ── FIXTURES (idénticos para el antes y el después) ─────────────────────────────────────────────
const F = {
  typical: { salary: 2500, extra: 0, otherinc: 0, housing: 700, food: 350, transport: 120, utilities: 110, leisure: 150, education: 50, otherexp: 100, periodKey: '2026-08' },
  rows: { rows: [
    { id: 'i1', type: 'income', label: 'Nómina principal', amount: 3200, order: 0 },
    { id: 'i2', type: 'income', label: 'Alquiler cobrado', amount: '1.250,50', order: 1 },
    { id: 'g1', type: 'expense', label: 'Hipoteca de la vivienda habitual con seguro de vida vinculado', amount: 1180.4, color: '#4D8DFF', order: 2 },
    { id: 'g2', type: 'expense', label: 'Colegio', amount: 640, color: '#37c7b8', order: 3 },
    { id: 'g3', type: 'expense', label: 'Colegio', amount: 0, color: '#8a7dff', order: 4 },
    { id: 'g4', type: 'expense', label: null, labelKey: 'wsbud_new_expense', amount: 9999999.99, color: '#e0b15c', order: 5 } ], periodKey: '' },
  zero: { rows: [{ id: 'a', type: 'income', label: 'x', amount: 1000, order: 0 }, { id: 'b', type: 'expense', label: 'y', amount: 1000, color: '#4D8DFF', order: 1 }] },
  neg: { rows: [{ id: 'a', type: 'income', label: 'x', amount: 800, order: 0 }, { id: 'b', type: 'expense', label: 'y', amount: 1200, color: '#4D8DFF', order: 1 }] },
  noinc: { rows: [{ id: 'b', type: 'expense', label: 'y', amount: 300, color: '#4D8DFF', order: 0 }] },
  empty: {},
};
F.many = { rows: [{ id: 'in0', type: 'income', label: 'Ingreso', amount: 9000, order: 0 }]
  .concat(Array.from({ length: 40 }, (_, i) => ({ id: 'x' + i, type: 'expense', label: 'Partida número ' + (i + 1), amount: 50 + i * 7, color: ['#4D8DFF', '#37c7b8', '#8a7dff', '#e0b15c', '#e07a9f', '#6fcf97', '#7c89a3'][i % 7], order: i + 1 }))) };

const PREMIUM = uid => `(function(){
  try { _aurixCancelLoginRedirect('probe'); _aurixMarkSessionConfirmed(); } catch (_) {}
  var bl = document.getElementById('bootLoader'); if (bl) bl.remove();
  var ar = document.getElementById('appRoot'); if (ar) ar.style.opacity = '1';
  var f = Object.create(null); _AURIX_ENT_CANON.forEach(function(k){ f[k] = (k !== 'workspace.catalog_preview'); });
  _aurixEnt = { loaded:true, loading:false, error:null, plan:'premium', status:'active', source:'default', validUntil:null, features:f, sources:Object.create(null), fetchedAt:Date.now() };
  try { _aurixActiveUserId = ${JSON.stringify(uid)}; _aurixStampCacheOwner(); } catch (_) {}
  return true; })()`;
async function boot(page, origin, { lang = 'es', init = '' } = {}) {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await page.addInitScript(`try{ localStorage.setItem('portfolio_lang', ${JSON.stringify(lang)}); ${init} }catch(_){}`);
  await page.goto(origin + '/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction("typeof _wsOpenTool === 'function' && typeof _AURIX_ENT_CANON !== 'undefined'", null, { timeout: 90000 });
  await page.waitForTimeout(800);
  await page.evaluate(PREMIUM('probe-surface'));
}
const J = (page, expr) => page.evaluate(`(function(){ try { return JSON.stringify((function(){ ${expr} })()); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`).then(JSON.parse);
const openBudget = (page, id) => page.evaluate(`(function(){ switchTab('workspace'); _wsOpenTool('budget'${id ? ', ' + JSON.stringify(id) : ''}); return true; })()`).then(() => page.waitForTimeout(400));
const setInputs = (page, inp) => page.evaluate(`(function(){ _wsToolInputs = Object.assign(JSON.parse(${JSON.stringify(JSON.stringify(inp))}), { currency: (_wsToolInputs && _wsToolInputs.currency) || 'EUR' }); _wsToolRepaint(); return true; })()`).then(() => page.waitForTimeout(250));
const active = page => J(page, `var e = document.activeElement; return e ? { tag: e.tagName, open: e.getAttribute('data-wsbud-open'), amt: e.getAttribute('data-wsbud-amt'), nameIn: e.getAttribute('data-wsbud-name-in'), edit: e.getAttribute('data-wsbud-edit'), focus: e.getAttribute('data-wsbud-focus'), inEd: !!e.closest('.wsbud-ed'), ccy: e.hasAttribute('data-wsbud-ccy') } : null;`);
const edState = page => J(page, `var l = document.querySelector('.wsbud-ed'); if (!l) return null; var p = l.querySelector('.wsbud-ed-panel').getBoundingClientRect(), lr = l.getBoundingClientRect();
  return { mode: l.getAttribute('data-wsbud-ed'), lists: [].slice.call(l.querySelectorAll('[data-wsbud-list]')).map(function(x){ return x.getAttribute('data-wsbud-list'); }),
    rows: l.querySelectorAll('.wsbud-row').length, panel: { l: p.left, r: p.right, t: p.top, b: p.bottom, w: p.width }, layer: { l: lr.left, t: lr.top, w: lr.width, h: lr.height }, vw: innerWidth, vh: innerHeight,
    role: l.querySelector('.wsbud-ed-panel').getAttribute('role'), modal: l.querySelector('.wsbud-ed-panel').getAttribute('aria-modal'), title: (l.querySelector('#wsbudEdTitle') || {}).textContent };`);

// ════════════════════════════════ INVARIANTES ANTES / DESPUÉS ════════════════════════════════
const DASH_ASSETS = (() => {
  const B = Date.now() - 60 * 864e5;
  const A = (id, type, ticker, name, qty, price, extra = {}) => ({ id, type, ticker, name, qty, price, assetCurrency: 'USD', costBasis: +(qty * price * 0.9).toFixed(2), change24h: 0, transactions: [{ type: 'buy', qty, price: price * 0.9, ts: B }], createdAt: B, marketSymbol: ticker, ...extra });
  return [A('s1', 'stock', 'MSFT', 'Microsoft', 125, 428), A('s2', 'stock', 'AAPL', 'Apple', 134, 250), A('e1', 'etf', 'SPY', 'SPDR', 10, 700), A('c1', 'crypto', 'BTC', 'Bitcoin', 0.62, 66016, { coinId: 'bitcoin' }), A('m1', 'metal', 'XAU', 'Gold', 2, 2541)];
})();
const BUD_SNAPSHOT = `
  var out = {};
  var FX = ${JSON.stringify(F)};
  Object.keys(FX).forEach(function(k){
    var inp = JSON.parse(JSON.stringify(FX[k])); var res = calculateMonthlyBudget(inp);
    var d = document.createElement('div'); d.innerHTML = _wsBudgetDonutHtml(res);
    var top = document.createElement('div'); top.innerHTML = _wsBudgetTopHtml(inp);
    out[k] = { income: res.income, expenses: res.expenses, free: res.free, saveRate: res.saveRate, deficit: res.deficit, applicable: res.applicable,
      items: res.items.map(function(i){ return [i.id, i.name, i.value, i.color, res.expenses > 0 ? Math.round(i.value / res.expenses * 100) : null]; }),
      arcs: [].slice.call(d.querySelectorAll('.wsbud-arc')).map(function(a){ return [a.getAttribute('data-wsbud-seg'), a.getAttribute('stroke'), a.getAttribute('stroke-dasharray'), a.getAttribute('stroke-dashoffset')]; }),
      centre: (d.querySelector('.wsbud-donut-c') || { textContent: '' }).textContent.replace(/\\s+/g, ' ').trim(),
      kpis: [].slice.call(top.querySelectorAll('.wsbud-kpi b')).map(function(b){ return b.textContent.trim(); }),
      reading: _wsBudgetReading(res) };
  });
  return out;`;
async function snapshotTree(browser, origin) {
  const snap = {};
  { // presupuesto: cálculo, anillo, KPI y lectura
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await boot(page, origin);
    await openBudget(page);
    snap.budget = await J(page, BUD_SNAPSHOT);
    // documento guardado → reabrir: mismos inputs, results, tipo y moneda
    const docs = {};
    for (const k of ['typical', 'rows', 'many']) {
      docs[k] = await J(page, `switchTab('workspace'); _wsOpenTool('budget'); _wsToolInputs = Object.assign(JSON.parse(${JSON.stringify(JSON.stringify(F[k]))}), { currency: 'EUR' });
        _wsToolCommit('Inv ' + ${JSON.stringify(k)}, true, null); var id = _wsToolEditId;
        var p = JSON.parse(localStorage.getItem(_WSH_PROJECTS_KEY)).find(function(x){ return x.id === id; });
        _wsOpenTool('budget', id); var reopened = JSON.parse(JSON.stringify(_wsToolInputs));
        return { idShape: /^ws4_/.test(String(id)) || typeof id === 'string', type: p.type, currency: p.currency, inputs: p.inputs, results: p.results, keys: Object.keys(p).sort(), reopened: reopened };`);
    }
    snap.docs = docs;
    await ctx.close();
  }
  { // Dashboard: categorías, publicación y navegación
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await boot(page, origin, { init: `localStorage.setItem('portfolio_assets', ${JSON.stringify(JSON.stringify(DASH_ASSETS))});` });
    await page.evaluate(`(function(){ switchTab('home'); try { updateCategoryCards(); } catch(_){} try { renderMiniCompositionDonut(); } catch(_){} try { renderAurixSignal(); } catch(_){} })()`);
    await page.waitForTimeout(1800);
    snap.dash = await J(page, `
      var cards = [].slice.call(document.querySelectorAll('.cat-card')).map(function(c){ var q = function(s){ var e = c.querySelector(s); return e ? e.textContent.replace(/\\s+/g, ' ').trim() : null; };
        return [c.getAttribute('data-type'), q('.cat-card-name'), q('.cat-card-value'), q('.cat-card-return'), q('.cat-card-return-m'), q('.market-status')]; });
      var perf = {}; ['stock','etf','crypto','metal','fund','cash'].forEach(function(t){ try { perf[t] = JSON.stringify(_aurixCatReturnDisplay(t)); } catch (e) { perf[t] = 'x'; } });
      return { cards: cards, perf: perf, total: (document.getElementById('totalValue') || {}).textContent, signal: (document.getElementById('aurixSignalMsg') || {}).textContent,
        cta: (document.getElementById('aurixSignalCtaLabel') || {}).textContent, signalHidden: document.getElementById('aurixSignal').hidden,
        donutSegs: [].slice.call(document.querySelectorAll('#microCompositionDonut .mcd-seg, #microCompositionDonut .mcd-segs circle')).map(function(s){ return [s.getAttribute('stroke'), s.getAttribute('stroke-dasharray')]; }) };`);
    await page.click('#microCompositionDonut').catch(() => {});
    await page.waitForTimeout(500);
    snap.dash.donutOpens = await J(page, `var m = document.querySelector('.modal--composition'); var ov = m && m.closest('.modal-overlay'); return !!(ov && ov.classList.contains('open'));`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.evaluate(`(function(){ var o = document.querySelector('.modal-overlay.open'); if (o && typeof closeModal === 'function') try { closeModal(); } catch(_){} })()`);
    await page.click('#aurixSignalCta').catch(() => {});
    await page.waitForTimeout(600);
    snap.dash.ctaGoesTo = await J(page, `var a = document.querySelector('.bottom-nav .item.active, [data-tab].active'); return a ? a.getAttribute('data-tab') : (typeof currentTab !== 'undefined' ? currentTab : null);`);
    await ctx.close();
  }
  return snap;
}
const strip = d => { const o = JSON.parse(JSON.stringify(d)); return o; };
const eqJ = (a, b) => JSON.stringify(a) === JSON.stringify(b);

if (ONLY.includes('CR')) {
  console.log('\n══ INVARIANTES · referencia ' + BASE_REF + ' frente a la copia de trabajo ══');
  let baseRoot = process.env.AURIX_BASE_ROOT || '';
  if (!baseRoot) { baseRoot = mkdtempSync(join(tmpdir(), 'aurix-base-')); execSync(`git -C "${ROOT}" archive ${BASE_REF} | tar -x -C "${baseRoot}"`); }
  if (!existsSync(join(baseRoot, 'app.js'))) { ok('árbol de referencia disponible', false, baseRoot); }
  else {
    const A = await serve(normalize(baseRoot)), Bv = await serve(ROOT);
    const browser = await chromium.launch();
    const before = await snapshotTree(browser, A.origin), after = await snapshotTree(browser, Bv.origin);
    await browser.close(); A.server.close(); Bv.server.close();
    for (const k of Object.keys(F)) {
      const a = before.budget[k], b = after.budget[k];
      ok(`INV.${k} totales, disponible, tasa y déficit idénticos`, eqJ([a.income, a.expenses, a.free, a.saveRate, a.deficit, a.applicable], [b.income, b.expenses, b.free, b.saveRate, b.deficit, b.applicable]), JSON.stringify([a.free, b.free]));
      ok(`INV.${k} partidas, colores y porcentajes idénticos`, eqJ(a.items, b.items));
      ok(`INV.${k} reparto del anillo idéntico (segmentos, color, longitud y desplazamiento)`, eqJ(a.arcs, b.arcs) && a.centre === b.centre);
      ok(`INV.${k} cifras del resumen y lectura idénticas`, eqJ(a.kpis, b.kpis) && a.reading === b.reading, JSON.stringify([a.kpis, b.kpis]));
    }
    for (const k of Object.keys(before.docs)) {
      const a = before.docs[k], b = after.docs[k];
      ok(`INV.doc.${k} documento guardado idéntico (tipo, moneda, inputs, results y forma)`, eqJ([a.type, a.currency, a.inputs, a.results, a.keys], [b.type, b.currency, b.inputs, b.results, b.keys]), JSON.stringify([a.results, b.results]));
      ok(`INV.doc.${k} reabrir devuelve el mismo borrador`, eqJ(a.reopened, b.reopened));
    }
    ok('INV.dash cards de categoría: mismos nombres, importes, % y estado de mercado', eqJ(before.dash.cards, after.dash.cards), JSON.stringify(after.dash.cards[0]));
    ok('INV.dash cálculo del % por categoría idéntico', eqJ(before.dash.perf, after.dash.perf));
    ok('INV.dash publicación: patrimonio, salud y acción idénticas', eqJ([before.dash.total, before.dash.signal, before.dash.cta, before.dash.signalHidden], [after.dash.total, after.dash.signal, after.dash.cta, after.dash.signalHidden]), after.dash.signal);
    ok('INV.dash micro-donut: mismos segmentos', eqJ(before.dash.donutSegs, after.dash.donutSegs) && after.dash.donutSegs.length > 0, String(after.dash.donutSegs.length));
    ok('INV.dash navegación: el donut abre la composición y «Ver análisis» lleva al mismo sitio', before.dash.donutOpens === after.dash.donutOpens && before.dash.ctaGoesTo === after.dash.ctaGoesTo && !!after.dash.ctaGoesTo, JSON.stringify([after.dash.donutOpens, after.dash.ctaGoesTo]));
  }
}

// ════════════════════════════════ CONTRATOS NUEVOS (dos motores) ════════════════════════════════
const W = await serve(ROOT);
for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  if (!ONLY.includes(ENG)) continue;
  const browser = await launcher.launch();
  console.log('\n══ ' + ENG + ' ══');

  for (const [w, h] of [[390, 844], [1440, 1000]]) {
    const T = `${ENG}.${w}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce', hasTouch: w < 900 });
    const page = await ctx.newPage();
    await boot(page, W.origin);
    await openBudget(page);

    // ── C4 · Ingresos → su editor; Escape; foco de vuelta ──
    const aria = await J(page, `return [].slice.call(document.querySelectorAll('[data-wsbud-open]')).map(function(b){ return [b.tagName, b.getAttribute('data-wsbud-open'), b.getAttribute('aria-label')]; });`);
    ok(`${T}.C4 las tres cifras son botones con nombre accesible claro`,
      aria.length === 3 && aria.every(a => a[0] === 'BUTTON') && /Ingresos totales.*Editar ingresos/.test(aria[0][2]) && /Gastos totales.*Editar gastos/.test(aria[1][2]) && /Disponible.*Revisar ingresos y gastos/.test(aria[2][2]), JSON.stringify(aria));
    ok(`${T}.C4 Disponible no es un campo editable en ningún sitio`, await J(page, `return !document.querySelector('.wsbud-kpi input, [data-wsbud-amt="free"], [data-wsbud-open="all"] input');`));
    await page.click('[data-wsbud-open="income"]'); await page.waitForTimeout(300);
    let ed = await edState(page), a = await active(page);
    ok(`${T}.C4 «Ingresos» abre SÓLO el editor de ingresos, con el foco en su primer importe`, ed && ed.mode === 'income' && eqJ(ed.lists, ['income']) && a.inEd && !!a.amt, JSON.stringify([ed && ed.lists, a]));
    ok(`${T}.C5 el editor es un diálogo modal con título`, ed.role === 'dialog' && ed.modal === 'true' && /Ingresos/.test(ed.title));
    ok(`${T}.C5 la capa cubre la ventana entera (posición fija real)`, Math.abs(ed.layer.l) < 1 && Math.abs(ed.layer.t) < 1 && Math.abs(ed.layer.w - ed.vw) < 1 && Math.abs(ed.layer.h - ed.vh) < 1, JSON.stringify(ed.layer));
    if (w < 768) ok(`${T}.C5 móvil: hoja inferior a todo lo ancho`, Math.abs(ed.panel.b - ed.vh) <= 1 && Math.abs(ed.panel.w - ed.vw) <= 1, JSON.stringify(ed.panel));
    else ok(`${T}.C5 escritorio: modal ligero centrado y contenido`, ed.panel.w <= 561 && Math.abs(ed.panel.l - (ed.vw - ed.panel.r)) <= 2 && ed.panel.t > 0 && ed.panel.b < ed.vh, JSON.stringify(ed.panel));
    ok(`${T}.C7 con el editor abierto la página no se desplaza detrás`, await J(page, `return getComputedStyle(document.documentElement).overflowY === 'hidden';`));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    a = await active(page);
    ok(`${T}.C4 Escape cierra y el foco vuelve a «Ingresos»`, !(await edState(page)) && a.open === 'income', JSON.stringify(a));
    ok(`${T}.C7 al cerrar, la página vuelve a desplazarse`, await J(page, `return getComputedStyle(document.documentElement).overflowY !== 'hidden';`));

    // ── Gastos con teclado; foco atrapado; «Listo» ──
    await page.focus('[data-wsbud-open="expense"]'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    ed = await edState(page);
    ok(`${T}.C4 «Gastos» con teclado abre SÓLO el editor de gastos`, ed && ed.mode === 'expense' && eqJ(ed.lists, ['expense']));
    let escaped = false;
    for (let i = 0; i < 40; i++) { await page.keyboard.press(i % 9 === 8 ? 'Shift+Tab' : 'Tab'); const x = await J(page, `return !!(document.activeElement && document.activeElement.closest('.wsbud-ed-panel'));`); if (!x) { escaped = true; break; } }
    ok(`${T}.C5 el foco no se escapa del editor con Tab / Mayús+Tab`, !escaped);
    await page.click('.wsbud-ed-done'); await page.waitForTimeout(200);
    a = await active(page);
    ok(`${T}.C5 «Listo» cierra y devuelve el foco a «Gastos»`, !(await edState(page)) && a.open === 'expense', JSON.stringify(a));

    // ── Disponible → los dos ──
    await page.click('[data-wsbud-open="all"]'); await page.waitForTimeout(300);
    ed = await edState(page);
    ok(`${T}.C4 «Disponible» abre el editor conjunto (ingresos y gastos)`, ed && ed.mode === 'all' && eqJ(ed.lists, ['income', 'expense']) && ed.rows === 10, JSON.stringify(ed && ed.lists));
    // borrar con importe: confirmación POR ENCIMA del editor, cancelar conserva
    await page.click('.wsbud-ed [data-wsbud-del="housing"]'); await page.waitForTimeout(250);
    const top = await J(page, `var m = document.querySelector('#wsConfirmModal .ws-modal'); if (!m) return null; var r = m.getBoundingClientRect(); var e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!(e && e.closest('#wsConfirmModal'));`);
    ok(`${T}.C5 borrar una partida con importe pide confirmación, visible sobre el editor`, top === true, String(top));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    ok(`${T}.C5 Escape en la confirmación cancela y el editor sigue abierto con la fila`, !!(await edState(page)) && await J(page, `return !!document.querySelector('.wsbud-ed [data-wsbud-amt="housing"]');`));
    await page.click('.wsbud-ed-x'); await page.waitForTimeout(200);

    // ── C5 · desglose → editor sobre ESA partida ──
    await page.click('.wsbud-br-a[data-wsbud-edit="food"]'); await page.waitForTimeout(300);
    a = await active(page);
    ok(`${T}.C5 tocar el importe de una partida abre el editor en ESE importe`, a.amt === 'food' && a.inEd, JSON.stringify(a));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    a = await active(page);
    ok(`${T}.C5 …y al cerrar el foco vuelve a esa partida`, a.edit === 'food' && a.focus === 'amt', JSON.stringify(a));
    await page.click('.wsbud-br-n[data-wsbud-edit="transport"]'); await page.waitForTimeout(300);
    a = await active(page);
    ok(`${T}.C5 tocar el nombre abre el editor con ESE nombre en edición`, a.nameIn === 'transport', JSON.stringify(a));
    await page.keyboard.press('Escape'); await page.waitForTimeout(150); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await page.click('.wsbud-br-ed[data-wsbud-edit="leisure"]'); await page.waitForTimeout(300);
    a = await active(page);
    ok(`${T}.C5 el lápiz edita nombre (y el importe queda al lado)`, a.nameIn === 'leisure' && await J(page, `return !!document.querySelector('.wsbud-ed [data-wsbud-amt="leisure"]');`), JSON.stringify(a));
    await page.keyboard.press('Escape'); await page.waitForTimeout(150); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    ok(`${T}.C5 desde el desglose no se puede borrar nada`, await J(page, `return !document.querySelector('.wsbud-main [data-wsbud-del]');`));
    // + Gasto / + Ingreso
    const n0 = await J(page, `return _wsBudgetRows(_wsToolInputs).length;`);
    await page.click('[data-wsbud-new="expense"]'); await page.waitForTimeout(300);
    a = await active(page);
    const n1 = await J(page, `return _wsBudgetRows(_wsToolInputs).length;`);
    ok(`${T}.C5 «+ Gasto» abre el editor de gastos con la partida nueva lista para nombrar`, (await edState(page)).mode === 'expense' && !!a.nameIn && n1 === n0 + 1, JSON.stringify([a, n0, n1]));
    await page.keyboard.type('Mascota'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    const mid = await J(page, `var r = _wsBudgetRows(_wsToolInputs).find(function(x){ return x.label === 'Mascota'; }); return r && r.id;`);
    await page.click(`.wsbud-ed [data-wsbud-amt="${mid}"]`); await page.keyboard.type('45'); await page.keyboard.press('Tab'); await page.waitForTimeout(200);
    const masc = await J(page, `var r = _wsBudgetRows(_wsToolInputs).find(function(x){ return x.label === 'Mascota'; }); return r ? { amt: _wsNum(r.amount), br: !!document.querySelector('.wsbud-br[data-wsbud-br="' + r.id + '"]') } : null;`);
    ok(`${T}.C5 nombre e importe nuevos llegan al desglose sin cerrar el editor`, masc && masc.amt === 45 && masc.br, JSON.stringify(masc));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await page.click('[data-wsbud-new="income"]'); await page.waitForTimeout(300);
    ok(`${T}.C5 «+ Ingreso» abre el panel de ingresos con la partida nueva`, (await edState(page)).mode === 'income' && !!(await active(page)).nameIn);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150); await page.keyboard.press('Escape'); await page.waitForTimeout(200);

    // ── C2 · estado de guardado ──
    await page.evaluate(`_wsToolCommit('Superficie', true, null)`); await page.waitForTimeout(300);
    let sb = await J(page, `var b = document.querySelector('[data-wstool-savebar] .wsg-savebtn'), s = document.querySelector('[data-wstool-savebar] .wsg-savestate'); return { btn: b ? getComputedStyle(b).display : 'none', st: s ? s.textContent.trim() : '', menu: !!document.querySelector('[data-wstool-savebar] .wsg-menu') };`);
    ok(`${T}.C2 guardado y sin cambios: sólo el estado (sin botón deshabilitado) y el menú ···`, sb.btn === 'none' && /Guardado/.test(sb.st) && sb.menu, JSON.stringify(sb));
    await page.click('[data-wsbud-open="expense"]'); await page.waitForTimeout(250);
    const hf = await page.$('.wsbud-ed [data-wsbud-amt="housing"]'); await hf.click({ clickCount: 3 }); await page.keyboard.type('701'); await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    sb = await J(page, `var b = document.querySelector('[data-wstool-savebar] .wsg-savebtn'), s = document.querySelector('[data-wstool-savebar] .wsg-savestate'); return { btn: b ? getComputedStyle(b).display : 'none', dis: b ? b.disabled : null, st: s ? s.textContent.trim() : '' };`);
    ok(`${T}.C2 con cambios vuelve «Guardar» activo y el estado lo dice`, sb.btn !== 'none' && sb.dis === false && sb.st.length > 0 && !/^Guardado$/.test(sb.st), JSON.stringify(sb));

    // ── C3 · moneda de un documento GUARDADO ──
    await page.evaluate(`_wsToolCommit(null, false, null)`); await page.waitForTimeout(300);
    const id = await page.evaluate('_wsToolEditId');
    const c0kpi = await J(page, `return [].slice.call(document.querySelectorAll('.wsbud-kpi b')).map(function(b){ return b.textContent.trim(); });`);
    const rows0 = await J(page, `return _wsBudgetRows(_wsToolInputs).map(function(r){ return [r.id, r.amount]; });`);
    const c0 = await J(page, `var s = document.querySelector('.wsh-bar-ccy [data-wsbud-ccy]'); return { sel: !!s, val: s && s.value, plain: !!document.querySelector('.wsh-bar-ccy [data-wsccy-scope]'), ccy: _wsDocCcy() };`);
    const B0 = c0.ccy, X1 = B0 === 'USD' ? 'EUR' : 'USD', X2 = 'GBP' === B0 ? 'EUR' : 'GBP';
    ok(`${T}.C3 un presupuesto guardado ofrece cambiar la moneda, pero por la vía que pregunta`, c0.sel && !c0.plain && !!B0 && c0.val === B0, JSON.stringify(c0));
    await page.selectOption('.wsh-bar-ccy [data-wsbud-ccy]', X1); await page.waitForTimeout(250);
    const md = await J(page, `var m = document.getElementById('wsConfirmModal'); return m ? m.textContent.replace(/\\s+/g, ' ') : null;`);
    ok(`${T}.C3 al elegir otra moneda se pide confirmación explícita: sin conversión, mismos números`, !!md && /no se convierten/.test(md) && md.indexOf(B0) >= 0 && md.indexOf(X1) >= 0 && /tipo de cambio/.test(md), md && md.slice(0, 160));
    await page.click('[data-wsmodal="cancel"]'); await page.waitForTimeout(250);
    let c1 = await J(page, `var s = document.querySelector('.wsh-bar-ccy [data-wsbud-ccy]'); return { val: s.value, ccy: _wsDocCcy(), dirty: _wsToolDirty, rows: _wsBudgetRows(_wsToolInputs).map(function(r){ return [r.id, r.amount]; }), stored: JSON.parse(localStorage.getItem(_WSH_PROJECTS_KEY)).find(function(p){ return p.id === ${JSON.stringify(id)}; }).currency };`);
    ok(`${T}.C3 Cancelar deja el documento intacto (selector, moneda, borrador y guardado)`, c1.val === B0 && c1.ccy === B0 && c1.dirty === false && eqJ(c1.rows, rows0) && c1.stored === B0, JSON.stringify(c1));
    await page.selectOption('.wsh-bar-ccy [data-wsbud-ccy]', X2); await page.waitForTimeout(250);
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    c1 = await J(page, `return { val: document.querySelector('.wsh-bar-ccy [data-wsbud-ccy]').value, ccy: _wsDocCcy(), dirty: _wsToolDirty };`);
    ok(`${T}.C3 Escape en la confirmación también cancela`, c1.val === B0 && c1.ccy === B0 && c1.dirty === false, JSON.stringify(c1));
    await page.selectOption('.wsh-bar-ccy [data-wsbud-ccy]', X1); await page.waitForTimeout(250);
    await page.click('[data-wsmodal="ok"]'); await page.waitForTimeout(350);
    const c2 = await J(page, `return { ccy: _wsDocCcy(), dirty: _wsToolDirty, rows: _wsBudgetRows(_wsToolInputs).map(function(r){ return [r.id, r.amount]; }), kpi: [].slice.call(document.querySelectorAll('.wsbud-kpi b')).map(function(b){ return b.textContent.trim(); }), stored: JSON.parse(localStorage.getItem(_WSH_PROJECTS_KEY)).find(function(p){ return p.id === ${JSON.stringify(id)}; }).currency };`);
    ok(`${T}.C3 Confirmar cambia la moneda SIN tocar un número y deja el cambio pendiente de guardar`, c2.ccy === X1 && c2.dirty === true && eqJ(c2.rows, rows0) && c2.kpi.join(' ') !== c0kpi.join(' ') && c2.stored === B0, JSON.stringify(c2));
    await page.evaluate(`_wsToolCommit(null, false, null)`); await page.waitForTimeout(300);
    const c3 = await J(page, `var p = JSON.parse(localStorage.getItem(_WSH_PROJECTS_KEY)).find(function(p){ return p.id === ${JSON.stringify(id)}; }); return { cur: p.currency, icur: p.inputs.currency, rows: (p.inputs.rows || []).map(function(r){ return [r.id, r.amount]; }), sameId: _wsToolEditId === ${JSON.stringify(id)} };`);
    ok(`${T}.C3 Guardar persiste la moneda nueva por el camino de siempre, mismo documento y mismos importes`, c3.cur === X1 && c3.icur === X1 && c3.sameId && eqJ(c3.rows, rows0), JSON.stringify(c3));
    await page.evaluate(`switchTab('home')`); await openBudget(page, id);
    ok(`${T}.C3 salir y volver: el documento se abre en la moneda confirmada`, (await J(page, `return [_wsDocCcy(), document.querySelector('.wsh-bar-ccy [data-wsbud-ccy]').value];`)).join() === X1 + ',' + X1);

    // ── C3 · documento NUEVO: elige al momento (sin pregunta) ──
    await page.evaluate(`switchTab('home')`); await openBudget(page);
    const nsel = await J(page, `return !!document.querySelector('.wsh-bar-ccy [data-wsccy-scope="tool"]') && !document.querySelector('.wsh-bar-ccy [data-wsbud-ccy]');`);
    ok(`${T}.C3 un presupuesto nuevo elige moneda directamente`, nsel);
    const N0 = await page.evaluate('_wsDocCcy()'), NX = N0 === 'GBP' ? 'EUR' : 'GBP';
    await page.selectOption('.wsh-bar-ccy [data-wsccy-scope="tool"]', NX); await page.waitForTimeout(300);
    ok(`${T}.C3 …y se aplica sin confirmación`, (await J(page, `return [_wsDocCcy(), !!document.getElementById('wsConfirmModal')];`)).join() === NX + ',false');

    // ── C6 · la lectura con tono ──
    for (const [k, tone, re] of [['typical', 'pos', /te queda el 37%/], ['zero', 'zero', /igualan tus ingresos/], ['neg', 'neg', /superan tus ingresos en/], ['noinc', 'neg', /superan tus ingresos en/]]) {
      await setInputs(page, F[k]);
      const ins = await J(page, `var p = document.querySelector('.wsbud-insight'); return p ? { tone: p.getAttribute('data-tone'), txt: p.textContent.trim() } : null;`);
      ok(`${T}.C6 lectura «${k}»: tono ${tone} y el texto de siempre`, ins && ins.tone === tone && re.test(ins.txt), JSON.stringify(ins));
    }
    await ctx.close();
  }

  // ── C3 · documento ANTIGUO sin moneda: conserva su aviso completo ──
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const legacy = { id: 'ws4_nocur', type: 'monthly_budget', customName: 'Sin moneda', inputs: F.typical, results: { income: 2500, expenses: 1580, free: 920 }, bodyVersion: 1, revision: 1, createdAt: 1, updatedAt: 2 };
    await boot(page, W.origin, { init: `if (!localStorage.getItem('__s')) { localStorage.setItem('aurix_ws4_projects', ${JSON.stringify(JSON.stringify([legacy]))}); localStorage.setItem('__s', '1'); }` });
    const key = await page.evaluate('_WSH_PROJECTS_KEY');
    if (key !== 'aurix_ws4_projects') await page.evaluate(`localStorage.setItem(_WSH_PROJECTS_KEY, ${JSON.stringify(JSON.stringify([legacy]))})`);
    await openBudget(page, 'ws4_nocur');
    const lg = await J(page, `return { pending: !!document.querySelector('[data-wsccy-pending]'), barSel: !!document.querySelector('.wsh-bar-ccy select[data-wsbud-ccy], .wsh-bar-ccy select[data-wsccy-scope]'), ccy: _wsDocCcy(), kpi: document.querySelector('.wsbud-kpi b').textContent };`);
    ok(`${ENG}.C3 un documento antiguo sin moneda conserva su aviso y no se le asigna ninguna`, lg.pending && !lg.barSel && !lg.ccy, JSON.stringify(lg));
    await ctx.close();
  }

  // ── C7 · matriz de anchos, fixtures y estados ──
  const GEO = `
    var q = function(s){ return document.querySelector(s); };
    var spill = [];
    document.querySelectorAll('.wsh-tool-view .wsh-card, .wsbud-ed-panel, .wsbud-insight, .wsh-barwrap').forEach(function(card){ var cb = card.getBoundingClientRect();
      if (!cb.width) return; card.querySelectorAll('*').forEach(function(e){ var r = e.getBoundingClientRect(); if (r.width && (r.right > cb.right + 1 || r.left < cb.left - 1)) spill.push(String(e.className && e.className.baseVal != null ? e.className.baseVal : e.className || e.tagName).slice(0, 28)); }); });
    var nested = []; document.querySelectorAll('.wsh-tool-view *').forEach(function(e){ var cs = getComputedStyle(e); var dc = e.closest('details'); if (dc && !dc.open && !e.closest('summary')) return; if (e.getBoundingClientRect().width && /(auto|scroll)/.test(cs.overflowY + cs.overflowX) && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1) && !e.classList.contains('wsbud-ed-body')) nested.push(String(e.className).slice(0, 28)); });
    var small = []; document.querySelectorAll('.wsbud-kpi.is-btn, .wsbud-br-n, .wsbud-br-a, .wsbud-br-ed, .wsbud-add, .wsh-bar-ccy select, .wsbud-ed-x, .wsbud-ed-done, .wsbud-ed [data-wsbud-amt], .wsbud-ed .wsbud-del, .wsbud-ed .wsbud-name, .wsbud-empty-cta').forEach(function(e){ var r = e.getBoundingClientRect(); if (r.width && (r.height < 43.5 || r.width < 43.5)) small.push(String(e.className).slice(0, 22) + ':' + Math.round(r.width) + 'x' + Math.round(r.height)); });
    var tiny = []; document.querySelectorAll('.wsh-tool-view *').forEach(function(e){ if (e.children.length === 0 && e.textContent.trim() && e.getBoundingClientRect().width && parseFloat(getComputedStyle(e).fontSize) < 12) tiny.push(String(e.className).slice(0, 22)); });
    var R = function(s){ var e = q(s); if (!e) return null; var r = e.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right }; };
    var amts = [].slice.call(document.querySelectorAll('.wsbud-br-a')).map(function(b){ return { full: b.scrollWidth <= b.clientWidth + 1, txt: b.textContent }; });
    return { hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, spill: spill.slice(0, 5), nested: nested.slice(0, 4), small: small.slice(0, 5), tiny: tiny.slice(0, 4),
      bar: R('.wsh-barwrap'), top: R('.wsbud-top-card'), main: R('.wsbud-main'), br0: R('.wsbud-br'), vh: innerHeight, amtsCut: amts.filter(function(a){ return !a.full; }).map(function(a){ return a.txt; }).slice(0, 3) };`;
  for (const w of [360, 390, 768, 1024, 1440]) {
    for (const lang of (w === 390 || w === 1440) ? ['es', 'en'] : ['es']) {
      const h = w < 768 ? (w === 360 ? 740 : 844) : w === 768 ? 1024 : 900;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 700 ? 2 : 1, reducedMotion: 'reduce', hasTouch: w < 900 });
      const page = await ctx.newPage();
      await boot(page, W.origin, { lang });
      await openBudget(page);
      for (const fx of ['typical', 'rows', 'many', 'empty']) {
        const T = `${ENG}.${w}.${lang}.${fx}`;
        if (fx !== 'typical') await setInputs(page, F[fx]);
        const g = await J(page, GEO);
        ok(`${T} sin scroll horizontal, sin scroll anidado y nada fuera de su caja`, !g.hscroll && g.nested.length === 0 && g.spill.length === 0, JSON.stringify([g.nested, g.spill]));
        ok(`${T} objetivos ≥ 44 px y texto ≥ 12 px`, g.small.length === 0 && g.tiny.length === 0, JSON.stringify([g.small, g.tiny]));
        ok(`${T} importes completos en el desglose (sin recorte)`, g.amtsCut.length === 0, JSON.stringify(g.amtsCut));
        if (fx === 'typical') ok(`${T} primera pantalla: identidad y controles, resumen y comienzo del desglose`, g.bar.b < g.vh && g.top.b < g.vh && g.main.t < g.vh && g.br0 && g.br0.t < g.vh, JSON.stringify([g.top.b, g.br0 && g.br0.t, g.vh]));
        if (fx === 'many' || fx === 'rows') {
          await page.evaluate(`_wsBudgetEditorOpen('all')`); await page.waitForTimeout(250);
          const e = await J(page, GEO + '');
          const body = await J(page, `var b = document.querySelector('.wsbud-ed-body'), p = document.querySelector('.wsbud-ed-panel').getBoundingClientRect(); return { scrolls: b.scrollHeight > b.clientHeight, inside: p.top >= 0 && p.bottom <= innerHeight + 1, hs: b.scrollWidth > b.clientWidth + 1, rows: b.querySelectorAll('.wsbud-row').length, dur: getComputedStyle(document.querySelector('.wsbud-ed-panel')).transitionDuration };`);
          ok(`${T} editor abierto: cabe en la ventana, sin desbordes, un solo scroll (el suyo) y ≥44 px`, body.inside && !body.hs && e.spill.length === 0 && e.small.length === 0 && body.rows === (fx === 'many' ? 41 : 6), JSON.stringify([body, e.spill, e.small]));
          if (fx === 'many') ok(`${T} reduced-motion: el editor no anima`, /^0s(,\s*0s)*$/.test(body.dur), body.dur);
          if (w === 390 && lang === 'es' && fx === 'many') await page.screenshot({ path: join(OUT, `budsurf-${ENG}-${w}-editor-many.png`) }).catch(() => {});
          await page.evaluate(`_wsBudgetEditorClose()`); await page.waitForTimeout(150);
        }
        if ((w === 390 || w === 1440) && fx === 'typical') {
          await page.screenshot({ path: join(OUT, `budsurf-${ENG}-${w}-${lang}.png`), fullPage: true }).catch(() => {});
          await page.evaluate(`_wsBudgetEditorOpen('all')`); await page.waitForTimeout(250);
          await page.screenshot({ path: join(OUT, `budsurf-${ENG}-${w}-${lang}-editor.png`) }).catch(() => {});
          await page.evaluate(`_wsBudgetEditorClose()`); await page.waitForTimeout(150);
        }
      }
      if (lang === 'en' && w === 390) {
        const en = await J(page, `_wsToolInputs = null; _wsToolRepaint(); return { kpi: document.querySelector('[data-wsbud-open="income"]').getAttribute('aria-label'), add: document.querySelector('[data-wsbud-new="expense"]').textContent.trim(), ins: (document.querySelector('.wsbud-insight') || {}).textContent };`);
        await page.evaluate(`_wsBudgetEditorOpen('all')`); await page.waitForTimeout(200);
        const ent = await J(page, `return [document.getElementById('wsbudEdTitle').textContent, document.querySelector('.wsbud-ed-done').textContent.trim()];`);
        ok(`${ENG}.EN resumen, acciones, lectura y editor en inglés`, /Total income.*Edit income/.test(en.kpi) && /Expense/.test(en.add) && /of your income is left over/.test(en.ins) && ent.join() === 'Income and expenses,Done', JSON.stringify([en, ent]));
      }
      await ctx.close();
    }
  }
  await browser.close();
}
W.server.close();
console.log('\n════════════════════════════════════════════════');
console.log(pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { console.log('\nFAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); console.log('\nRESULT: NO-GO'); process.exit(1); }
console.log('\nRESULT: GO — capturas en docs/workspace-visual-qa/budsurf-*.png');
process.exit(0);
