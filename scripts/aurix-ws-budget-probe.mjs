#!/usr/bin/env node
/**
 * AURIX · PRESUPUESTO MENSUAL — EL PILOTO DEL ESTÁNDAR WORKSPACE, EN NAVEGADOR REAL
 * ════════════════════════════════════════════════════════════════════════════
 * El contrato de DATOS (qué cifra sale del motor, qué NO se pinta sin dato, que no haya una
 * segunda matemática) vive en `docs/AURIX-WORKSPACE-BUDGET-PILOT-harness.js`. Aquí se mide lo
 * que una hoja de estilos leída NO demuestra: que las columnas existan de verdad en cada ancho,
 * que en móvil el orden sea el diseñado y no el del DOM, que nada desborde su tarjeta, y —lo
 * más importante— que escribir en un campo mueva el resumen Y el anillo, que es la prueba de
 * que sigue habiendo un solo camino de cálculo.
 *
 * Se escribe con eventos de TECLADO reales, no con `new Event('input')`: la edición numérica de
 * Workspace tiene su propio owner y un evento sintético no ejercita el mismo camino.
 *
 * ACOMODACIÓN DECLARADA: sin sesión OTP el guard de auth programa un rebote a login.html. Es
 * comportamiento CORRECTO del producto y ajeno a lo que se mide, así que se cancela por su
 * propio owner. No se parchea producto.
 *
 *   node scripts/aurix-ws-budget-probe.mjs
 *   AURIX_WS_URL=https://app.aurixsystem.io AURIX_WS_RESOLVE=dominio=IP node scripts/…
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const OUT = join(ROOT, 'docs', 'workspace-visual-qa');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = normalize(join(ROOT, p));
    if (!f.startsWith(ROOT)) { res.writeHead(403).end('no'); return; }
    const b = await readFile(f);
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }).end(b);
  } catch (_) { res.writeHead(404).end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));

const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
let chromium, webkit;
try { ({ chromium, webkit } = await import(PW)); }
catch (e) {
  console.error('\n✗ SIN MOTORES — ' + PW + '\n  mkdir -p /tmp/aurix-pw && cd /tmp/aurix-pw && npm init -y && npm i playwright && npx playwright install webkit chromium');
  server.close(); process.exit(1);
}
const PUBLIC_URL = String(process.env.AURIX_WS_URL || '').replace(/\/$/, '');
const RESOLVE = String(process.env.AURIX_WS_RESOLVE || '');
const ORIGIN = PUBLIC_URL || `http://127.0.0.1:${server.address().port}`;
const AUTH_PATCH = x => String(x)
  .replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')
  .replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0');

let pass = 0; const fails = [];
const ok = (n, c, i) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (i ? '  [' + i + ']' : '')); console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } };

console.log('AURIX · PRESUPUESTO — piloto del estándar Workspace');
console.log('origen: ' + ORIGIN + (PUBLIC_URL ? '  (BYTES DESPLEGADOS)' : '  (copia de trabajo)') + '\n');
mkdirSync(OUT, { recursive: true });

async function newCtx(browser, opts) {
  const ctx = await browser.newContext(opts);
  if (PUBLIC_URL) await ctx.route('**/app.js*', async route => {
    const r = await route.fetch();
    await route.fulfill({ response: r, body: AUTH_PATCH(await r.text()) });
  });
  return ctx;
}
async function open(page) {
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction("typeof _wsOpenTool === 'function' && typeof _AURIX_ENT_CANON !== 'undefined'", null, { timeout: 60000 });
  await page.waitForTimeout(900);
  await page.evaluate(`(function(){
    try { _aurixCancelLoginRedirect('probe'); _aurixMarkSessionConfirmed(); } catch (_) {}
    var bl = document.getElementById('bootLoader'); if (bl) bl.remove();
    var ar = document.getElementById('appRoot'); if (ar) ar.style.opacity = '1';
    var f = Object.create(null); _AURIX_ENT_CANON.forEach(function(k){ f[k] = (k !== 'workspace.catalog_preview'); });
    _aurixEnt = { loaded:true, loading:false, error:null, plan:'premium', status:'none', source:'default', validUntil:null, features:f, sources:Object.create(null), fetchedAt:Date.now() };
    switchTab('workspace'); _wsOpenTool('budget'); return true; })()`);
  await page.waitForTimeout(600);
}
// Lo que se mide de la caja. `spill` pregunta por DESBORDAMIENTO real y no por `overflow:hidden`:
// un `<span>` con `nowrap` pinta fuera de su caja sin recortarla y su rectángulo sigue midiendo
// bien, así que la contención hay que preguntarla hijo contra tarjeta.
const geom = page => page.evaluate(`(function(){
  const q = s => document.querySelector(s);
  const body = q('.wsbud-body'), ed = q('.wsbud-col-edit'), vw = q('.wsbud-col-view');
  const top = q('.wsbud-top-card'), dn = q('.wsbud-donut'), f0 = q('.wsbud-col-edit .ws4-num');
  const rect = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { t: Math.round(r.top), l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }; };
  const spill = [];
  document.querySelectorAll('.wsh-tool-view .wsh-card').forEach(card => {
    const cb = card.getBoundingClientRect();
    card.querySelectorAll('*').forEach(e => { const r = e.getBoundingClientRect();
      if (r.width && (r.right > cb.right + 1 || r.left < cb.left - 1)) spill.push((e.className || e.tagName) + ''); });
  });
  // intersección entre las dos columnas: si se solapan, la rejilla no está separando nada
  let overlap = false;
  if (ed && vw) { const a = ed.getBoundingClientRect(), b = vw.getBoundingClientRect();
    overlap = !(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1); }
  return JSON.stringify({
    display: body ? getComputedStyle(body).display : null,
    tracks: body ? getComputedStyle(body).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
    edit: rect(ed), view: rect(vw), top: rect(top), donut: rect(dn), field: rect(f0),
    sideBySide: !!(ed && vw && Math.abs(rect(ed).t - rect(vw).t) < 6 && rect(ed).l !== rect(vw).l),
    overlap: overlap, spill: spill.slice(0, 4),
    hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    kpiTones: [].slice.call(document.querySelectorAll('.wsbud-kpi')).map(k => getComputedStyle(k, '::before').backgroundColor),
    arcs: document.querySelectorAll('.wsbud-arc').length,
    centre: (q('.wsbud-donut-c') || { textContent: '' }).textContent.replace(/\\s+/g, ' ').trim(),
  });})()`).then(JSON.parse);

for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  if (ENG === 'WK' && PUBLIC_URL && RESOLVE) { console.log('  (WebKit omitido contra lo público: no admite regla de resolución)'); continue; }
  const browser = await launcher.launch({ args: (ENG === 'CR' && RESOLVE) ? ['--host-resolver-rules=MAP ' + RESOLVE.split('=')[0] + ' ' + RESOLVE.split('=')[1]] : [] });

  // ── §26 · DOS COLUMNAS DE VERDAD EN ESCRITORIO ─────────────────────────────
  {
    const ctx = await newCtx(browser, { viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await open(page);
    const g = await geom(page);
    ok(`${ENG}.1440 el cuerpo son DOS columnas medidas, no una apilada`, g.tracks === 2, 'pistas=' + g.tracks);
    ok(`${ENG}.1440 edición a la IZQUIERDA y respuesta a la DERECHA, a la misma altura`,
      g.sideBySide === true && g.edit.l < g.view.l, JSON.stringify({ e: g.edit, v: g.view }));
    ok(`${ENG}.1440 las columnas no se solapan`, g.overlap === false);
    ok(`${ENG}.1440 el resumen va ENCIMA del cuerpo`, g.top.t < g.edit.t, JSON.stringify([g.top.t, g.edit.t]));
    // §8 — el primer viewport tiene que contener la experiencia útil: campos Y respuesta.
    ok(`${ENG}.1440 primer viewport: primer campo Y anillo visibles sin scroll`,
      g.field.t < 1000 && g.donut && g.donut.t + g.donut.h < 1000, JSON.stringify({ campo: g.field.t, anillo: g.donut && g.donut.t }));
    ok(`${ENG}.1440 nada se pinta fuera de su tarjeta`, g.spill.length === 0, g.spill.join(' '));
    ok(`${ENG}.1440 sin scroll horizontal`, g.hscroll === false);
    // §27 — las tres magnitudes del resumen se distinguen por tono, no sólo por rótulo.
    ok(`${ENG}.1440 §27 los tres KPI tienen tono propio y distinto`,
      g.kpiTones.length === 3 && new Set(g.kpiTones).size === 3, JSON.stringify(g.kpiTones));
    ok(`${ENG}.1440 el anillo dibuja un arco por categoría con gasto`, g.arcs === 7, 'arcos=' + g.arcs);
    ok(`${ENG}.1440 el centro NO repite el disponible del resumen`,
      /44%/.test(g.centre) && !/920/.test(g.centre), g.centre);

    // ── UN SOLO CAMINO DE CÁLCULO: escribir mueve resumen Y anillo ───────────
    const before = await page.evaluate(`(function(){ return JSON.stringify({
      kpi: document.querySelectorAll('.wsbud-kpi b')[1].textContent.trim(),
      arc: document.querySelector('.wsbud-arc').getAttribute('stroke-dasharray'),
      centre: document.querySelector('.wsbud-donut-c').textContent.replace(/\\s+/g,' ').trim() });})()`).then(JSON.parse);
    // Se escribe en un GASTO (`housing`), no en el primer campo del panel: el primer campo es
    // «Nómina» y mover ingresos no cambia el KPI de gastos ni el arco de vivienda. La primera
    // versión de esta sonda medía eso y se puso roja con razón — el defecto era la prueba.
    const fld = await page.$('[data-wstool-input="housing"]');
    await fld.click({ clickCount: 3 });
    await page.keyboard.type('1400', { delay: 18 });
    await page.keyboard.press('Tab');
    await page.waitForTimeout(350);
    const after = await page.evaluate(`(function(){ return JSON.stringify({
      kpi: document.querySelectorAll('.wsbud-kpi b')[1].textContent.trim(),
      arc: document.querySelector('.wsbud-arc').getAttribute('stroke-dasharray'),
      centre: document.querySelector('.wsbud-donut-c').textContent.replace(/\\s+/g,' ').trim() });})()`).then(JSON.parse);
    ok(`${ENG}.edit escribir en un campo mueve el resumen`, before.kpi !== after.kpi, before.kpi + ' → ' + after.kpi);
    ok(`${ENG}.edit …y mueve el anillo por el MISMO cálculo`, before.arc !== after.arc, before.arc + ' → ' + after.arc);
    ok(`${ENG}.edit …y el centro se recalcula con él`, before.centre !== after.centre, after.centre);
    // §9 — un campo se puede VACIAR del todo (y entonces vale 0, no NaN ni el valor anterior).
    await fld.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);
    // …y se LEE el mismo campo que se vació. La versión anterior leía el primer input del panel
    // (Nómina) y reportaba «2.500» como si el borrado no hubiera funcionado.
    const cleared = await page.evaluate(`(function(){ return JSON.stringify({
      val: document.querySelector('[data-wstool-input="housing"]').value,
      kpi: document.querySelectorAll('.wsbud-kpi b')[1].textContent.trim() });})()`).then(JSON.parse);
    ok(`${ENG}.edit §9 el campo se puede vaciar y el total no publica NaN`,
      cleared.val === '' && !/NaN/.test(cleared.kpi), JSON.stringify(cleared));

    await page.screenshot({ path: join(OUT, `bud-${ENG}-1440.png`) }).catch(() => {});
    await ctx.close();
  }

  // ── §33/§34 · MÓVIL Y TABLET DISEÑADOS, NO APILADOS ────────────────────────
  for (const [w, h] of [[360, 780], [375, 812], [390, 844], [768, 1024]]) {
    const ctx = await newCtx(browser, { viewport: { width: w, height: h }, deviceScaleFactor: w < 700 ? 2 : 1, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await open(page);
    const g = await geom(page);
    ok(`${ENG}.${w} una sola columna`, g.sideBySide === false, JSON.stringify({ e: g.edit.l, v: g.view.l }));
    // El orden DISEÑADO: el resumen responde arriba y la EDICIÓN va antes que la lectura profunda.
    ok(`${ENG}.${w} resumen primero, luego edición, luego el anillo`,
      g.top.t < g.edit.t && g.edit.t < g.view.t, JSON.stringify([g.top.t, g.edit.t, g.view.t]));
    // §33 — editar no puede exigir cruzar el gráfico entero.
    ok(`${ENG}.${w} el primer campo está al alcance (< 1,5 pantallas)`,
      g.field.t < h * 1.5, 'campo@' + g.field.t + ' de ' + h);
    ok(`${ENG}.${w} nada se pinta fuera de su tarjeta`, g.spill.length === 0, g.spill.join(' '));
    ok(`${ENG}.${w} sin scroll horizontal`, g.hscroll === false);
    ok(`${ENG}.${w} el anillo cabe a lo ancho`, g.donut && g.donut.w <= w - 24, 'anillo=' + (g.donut && g.donut.w));
    if (w === 390) await page.screenshot({ path: join(OUT, `bud-${ENG}-390.png`) }).catch(() => {});
    await ctx.close();
  }

  // ── §44 · SIN DATOS NO SE INVENTA NADA ─────────────────────────────────────
  {
    const ctx = await newCtx(browser, { viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await open(page);
    const empty = await page.evaluate(`(function(){
      _wsToolInputs = {};
      var top = document.querySelector('[data-wsbud-top]'); if (top) top.innerHTML = _wsBudgetTopHtml(_wsToolInputs);
      var out = document.querySelector('[data-wstool-out]'); if (out) out.innerHTML = _wsBudgetOutHtml(_wsToolInputs);
      return JSON.stringify({ donut: document.querySelectorAll('.wsbud-donut').length,
        arcs: document.querySelectorAll('.wsbud-arc').length,
        rate: (document.querySelector('.wstool-res-final') || {}).textContent,
        legend: document.querySelectorAll('.wsbud-leg').length });})()`).then(JSON.parse);
    ok(`${ENG}.vacío sin gastos NO se pinta anillo`, empty.donut === 0 && empty.arcs === 0, JSON.stringify(empty));
    ok(`${ENG}.vacío la tasa dice «no aplicable», nunca 0 %`, !/^0\s*%/.test(String(empty.rate || '').trim()), String(empty.rate));
    ok(`${ENG}.vacío tampoco hay leyenda de categorías inexistentes`, empty.legend === 0, 'leyenda=' + empty.legend);
    await ctx.close();
  }
  await browser.close();
}

server.close();
console.log('\n════════════════════════════════════════════════');
console.log(pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { console.log('\nFAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); console.log('\nRESULT: NO-GO'); process.exit(1); }
console.log('\nRESULT: GO — capturas en docs/workspace-visual-qa/');
process.exit(0);
