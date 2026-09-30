#!/usr/bin/env node
/**
 * AURIX · PRESUPUESTO MENSUAL — VISUALIZACIÓN PRIMERO + CATEGORÍAS DEL USUARIO
 * ════════════════════════════════════════════════════════════════════════════
 * Navegador real (Chromium y WebKit) sobre la app servida en local. Cubre:
 *   · composición: móvil apila resumen → anillo → edición; escritorio ≈56/44 con
 *     el panel visual a la izquierda; sin overflow, sin recortes, bottom-nav libre;
 *   · casos A–T del SPEC (legacy, renombrar, duplicados por nombre, borrar con y
 *     sin confirmación, guardar/abrir/duplicar/recargar/Dashboard, otro
 *     dispositivo, dos cuentas, cero/negativo, nombres largos, selección por
 *     ratón/toque/teclado, edición en vivo, vaciar y reescribir, fallo de
 *     persistencia);
 *   · ES/EN, foco, objetivos táctiles, contraste y reduced-motion.
 *   AURIX_PW=/ruta/playwright/index.mjs node scripts/aurix-ws-budget-custom-probe.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const OUT = join(ROOT, 'docs', 'workspace-visual-qa');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const AUTH_PATCH = x => String(x)
  .replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')
  .replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0');
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = normalize(join(ROOT, p));
    if (!f.startsWith(ROOT)) { res.writeHead(403).end('no'); return; }
    let b = await readFile(f);
    if (f.endsWith('app.js')) b = Buffer.from(AUTH_PATCH(String(b)));
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(b);
  } catch (_) { res.writeHead(404).end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
let chromium, webkit;
try { ({ chromium, webkit } = await import(PW)); }
catch (e) { console.error('\n✗ SIN MOTORES — ' + PW); server.close(); process.exit(2); }
const ONLY = process.env.AURIX_ENGINES || 'CR,WK';

let pass = 0; const fails = [];
const ok = (n, c, i) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (i ? '  [' + i + ']' : '')); console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } };
mkdirSync(OUT, { recursive: true });

const LEGACY = { salary: 2500, extra: 0, otherinc: 0, housing: 700, food: 350, transport: 120, utilities: 110, leisure: 150, education: 50, otherexp: 100, periodKey: '2026-08' };
const PREMIUM = (uid) => `(function(){
  try { _aurixCancelLoginRedirect('probe'); _aurixMarkSessionConfirmed(); } catch (_) {}
  var bl = document.getElementById('bootLoader'); if (bl) bl.remove();
  var ar = document.getElementById('appRoot'); if (ar) ar.style.opacity = '1';
  var f = Object.create(null); _AURIX_ENT_CANON.forEach(function(k){ f[k] = (k !== 'workspace.catalog_preview'); });
  _aurixEnt = { loaded:true, loading:false, error:null, plan:'premium', status:'active', source:'default', validUntil:null, features:f, sources:Object.create(null), fetchedAt:Date.now() };
  try { _aurixActiveUserId = ${JSON.stringify(uid)}; _aurixStampCacheOwner(); } catch (_) {}
  return true; })()`;
async function boot(page, { lang = 'es', seed = null, uid = 'probe-a' } = {}) {
  await page.addInitScript(`try{ localStorage.setItem('portfolio_lang', ${JSON.stringify(lang)});
    ${seed ? `if (!localStorage.getItem('__seeded')) { localStorage.setItem(${JSON.stringify(seed.key)}, ${JSON.stringify(JSON.stringify(seed.value))}); localStorage.setItem('__seeded','1'); }` : ''} }catch(_){}`);
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction("typeof _wsOpenTool === 'function' && typeof _AURIX_ENT_CANON !== 'undefined'", null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(PREMIUM(uid));
}
const openTool = (page, id) => page.evaluate(`(function(){ switchTab('workspace'); _wsOpenTool('budget'${id ? ', ' + JSON.stringify(id) : ''}); return true; })()`).then(() => page.waitForTimeout(350));
const J = (page, expr) => page.evaluate(`(function(){ try { return JSON.stringify((function(){ ${expr} })()); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`).then(JSON.parse);
const state = page => J(page, `
  var q = function(s){ return document.querySelector(s); };
  var names = [].slice.call(document.querySelectorAll('[data-wsbud-list] .wsbud-row')).map(function(r){
    var n = r.querySelector('.wsbud-name, .wsbud-name-in'); var a = r.querySelector('[data-wsbud-amt]');
    return { id: r.getAttribute('data-wsbud-row'), name: n ? (n.value || n.textContent).trim() : '', amt: a ? a.value : null, sel: r.classList.contains('is-sel') }; });
  return { rows: names,
    kpis: [].slice.call(document.querySelectorAll('.wsbud-kpi b')).map(function(b){ return b.textContent.trim(); }),
    legend: [].slice.call(document.querySelectorAll('.wsbud-leg')).map(function(b){ return { id: b.getAttribute('data-wsbud-sel'), n: (b.querySelector('.wsbud-leg-n')||{}).textContent, pressed: b.getAttribute('aria-pressed') }; }),
    arcs: [].slice.call(document.querySelectorAll('.wsbud-arc')).map(function(a){ return { id: a.getAttribute('data-wsbud-seg'), cls: a.getAttribute('class') }; }),
    centre: (q('.wsbud-donut-c') || { textContent: '' }).textContent.replace(/\\s+/g, ' ').trim(),
    reading: (q('.wsbud-reading') || { textContent: '' }).textContent.trim(),
    empty: !!q('.wsbud-empty'), dirty: _wsToolDirty, editId: _wsToolEditId,
    toolText: (q('.wsh-tool-view') || { textContent: '' }).textContent };`);
const rowAmt = (id) => `[data-wsbud-amt="${id}"]`;
async function rename(page, id, text, key = 'Enter') {
  await page.click(`[data-wsbud-rename="${id}"]`);
  await page.waitForSelector(`[data-wsbud-name-in="${id}"]`);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  if (text === '') await page.keyboard.press('Backspace'); else await page.keyboard.type(text, { delay: 5 });
  await page.keyboard.press(key);
  await page.waitForTimeout(150);
}
async function typeAmt(page, id, text) {
  const el = await page.$(rowAmt(id));
  await el.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  if (text) await page.keyboard.type(text, { delay: 5 });
  await page.waitForTimeout(120);
}

// ── contraste WCAG (texto sobre el fondo efectivo más cercano con color opaco o casi) ──
const CONTRAST = `
  function rgb(s){ var m = String(s).match(/rgba?\\(([^)]+)\\)/); if (!m) return null; var p = m[1].split(',').map(parseFloat); return { r:p[0], g:p[1], b:p[2], a: p.length > 3 ? p[3] : 1 }; }
  function lum(c){ var f = function(v){ v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }; return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); }
  function bgOf(el){ var base = { r: 5, g: 8, b: 16, a: 1 }; var stack = []; for (var e = el; e && e.nodeType === 1; e = e.parentElement) { var c = rgb(getComputedStyle(e).backgroundColor); if (c && c.a > 0) stack.push(c); if (c && c.a >= 0.95) break; }
    var out = base; for (var i = stack.length - 1; i >= 0; i--) { var c = stack[i]; out = { r: c.r*c.a + out.r*(1-c.a), g: c.g*c.a + out.g*(1-c.a), b: c.b*c.a + out.b*(1-c.a), a: 1 }; } return out; }
  function ratio(el){ var c = rgb(getComputedStyle(el).color), b = bgOf(el); if (!c) return 21; var fg = { r: c.r*c.a + b.r*(1-c.a), g: c.g*c.a + b.g*(1-c.a), b: c.b*c.a + b.b*(1-c.a) };
    var L1 = lum(fg), L2 = lum(b); return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05); }`;

for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  if (!ONLY.split(',').includes(ENG)) continue;
  const browser = await launcher.launch();
  console.log('\n══ ' + ENG + ' ══');

  // ════════════════ COMPOSICIÓN EN LOS SEIS ANCHOS (+ zoom 125 % y apaisado) ════════════════
  for (const [w, h, tag] of [[360, 780], [375, 812], [390, 844], [768, 1024], [1024, 800], [1440, 1000], [312, 675, 'zoom125'], [844, 390, 'landscape']]) {
    for (const lang of (w === 390 || w === 1440 || w === 360) ? ['es', 'en'] : ['es']) {
      const T = `${ENG}.${tag || w}.${lang}`;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 700 ? 2 : 1, reducedMotion: 'reduce', hasTouch: w < 900 });
      const page = await ctx.newPage();
      await boot(page, { lang });
      await openTool(page);
      const g = await J(page, `${CONTRAST}
        var q = function(s){ return document.querySelector(s); };
        var R = function(e){ if (!e) return null; var r = e.getBoundingClientRect(); return { t: r.top + scrollY, l: r.left, r: r.right, b: r.bottom + scrollY, w: r.width, h: r.height }; };
        var top = R(q('.wsbud-top-card')), view = R(q('.wsbud-col-view')), edit = R(q('.wsbud-col-edit')), help = R(q('.wsbud-col-help')), dn = R(q('.wsbud-donut svg')), dc = R(q('.wsbud-donut-c b'));
        var spill = []; document.querySelectorAll('.wsh-tool-view .wsh-card').forEach(function(card){ var cb = card.getBoundingClientRect();
          card.querySelectorAll('*').forEach(function(e){ var r = e.getBoundingClientRect(); if (r.width && (r.right > cb.right + 1 || r.left < cb.left - 1)) spill.push(String(e.className || e.tagName).slice(0, 40)); }); });
        var small = []; document.querySelectorAll('.wsbud-leg, .wsbud-name, .wsbud-del, .wsbud-add, [data-wsbud-amt], .wsbud-perchip-sel').forEach(function(e){ var r = e.getBoundingClientRect(); if (r.width && (r.height < 43.5 || r.width < 43.5)) small.push(String(e.className).slice(0, 24) + ':' + Math.round(r.width) + 'x' + Math.round(r.height)); });
        var tiny = []; document.querySelectorAll('.wsbud-leg-n, .wsbud-leg b, .wsbud-leg em, .wsbud-donut-c i, .wsbud-donut-c em, .wsbud-name, .wsbud-reading, .wsbud-kpi i').forEach(function(e){ if (parseFloat(getComputedStyle(e).fontSize) < 12) tiny.push(e.className); });
        var low = []; document.querySelectorAll('.wsbud-leg-n, .wsbud-leg b, .wsbud-leg em, .wsbud-donut-c i, .wsbud-donut-c b, .wsbud-donut-c em, .wsbud-name, .wsbud-reading, .wsbud-kpi i, .wsbud-kpi b, .wsbud-add, .wsbud-chart-title').forEach(function(e){ var k = ratio(e); if (k < 4.5) low.push(String(e.className || e.tagName).slice(0, 20) + '=' + k.toFixed(2)); });
        var nav = [].slice.call(document.querySelectorAll('.mobile-nav, .bottom-nav, nav')).map(function(n){ return n.getBoundingClientRect(); }).filter(function(r){ return r.height > 0 && r.bottom >= innerHeight - 2 && r.top > innerHeight / 2; })[0];
        var hole = dn ? { l: dn.l + dn.w * 0.26, r: dn.r - dn.w * 0.26, t: dn.t + dn.h * 0.26, b: dn.b - dn.h * 0.26 } : null;
        return { top: top, view: view, edit: edit, help: help, dn: dn, dc: dc, hole: hole, spill: spill.slice(0, 5), small: small.slice(0, 6), tiny: tiny.slice(0, 4), low: low.slice(0, 6),
          hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, vw: innerWidth, vh: innerHeight, navTop: nav ? nav.top : null,
          order: getComputedStyle(q('.wsbud-col-view')).order + ',' + getComputedStyle(q('.wsbud-col-edit')).order,
          dom: (function(){ var b = q('.wsbud-body'); return [].slice.call(b.children).map(function(c){ return c.className.split(' ')[0]; }).join('>'); })() };`);
      ok(`${T} DOM en orden de lectura (reparto → edición → ayuda) y sin \`order\``,
        g.dom === 'wsbud-col-view>wsbud-col-edit>wsbud-col-help' && g.order === '0,0', g.dom + ' / ' + g.order);
      ok(`${T} sin scroll horizontal`, g.hscroll === false);
      ok(`${T} nada se pinta fuera de su tarjeta`, g.spill.length === 0, g.spill.join(' '));
      ok(`${T} el anillo cabe entero en su ancho y su cifra dentro del hueco`,
        g.dn && g.dn.l >= 0 && g.dn.r <= g.vw && g.dc && g.dc.l >= g.hole.l - 2 && g.dc.r <= g.hole.r + 2, JSON.stringify({ dn: g.dn, dc: g.dc }));
      ok(`${T} objetivos táctiles ≥ 44 px`, g.small.length === 0, g.small.join(' '));
      ok(`${T} ningún texto del Presupuesto baja de 12 px`, g.tiny.length === 0, g.tiny.join(' '));
      ok(`${T} contraste ≥ 4,5:1 en cifras, nombres y lectura`, g.low.length === 0, g.low.join(' '));
      if (w >= 1024 && tag !== 'landscape') {
        ok(`${T} escritorio: panel visual a la IZQUIERDA y edición a la derecha, a la misma altura`,
          Math.abs(g.view.t - g.edit.t) < 4 && g.view.r <= g.edit.l, JSON.stringify({ v: g.view, e: g.edit }));
        const share = g.view.w / (g.view.w + g.edit.w);
        ok(`${T} el panel visual es ligeramente protagonista (≈56 %)`, share > 0.53 && share < 0.59, share.toFixed(3));
        ok(`${T} la ayuda vive bajo el reparto, en la columna izquierda`, g.help.t >= g.view.b - 1 && g.help.r <= g.edit.l, JSON.stringify(g.help));
        if (w === 1440) ok(`${T} anillo claramente mayor que antes (208 px)`, g.dn.w >= 280, 'w=' + g.dn.w);
      } else {
        ok(`${T} apilado: resumen → anillo → edición`, g.top.b <= g.view.t + 1 && g.view.b <= g.edit.t + 1, JSON.stringify([g.top.b, g.view.t, g.view.b, g.edit.t]));
        if (!tag && w < 700) ok(`${T} el anillo aparece en la primera pantalla`, g.dn.t < g.vh, 'anillo@' + Math.round(g.dn.t) + ' de ' + g.vh);
      }
      // La navegación inferior no tapa el final: se baja del todo y se mide la barra de guardado.
      if (w < 1024) {
        const end = await J(page, `document.documentElement.style.scrollBehavior = 'auto'; var sb = document.querySelector('[data-wstool-savebar]');
          for (var e = sb; e; e = e.parentElement) { var cs = getComputedStyle(e); if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight) e.scrollTop = e.scrollHeight; }
          window.scrollTo(0, document.documentElement.scrollHeight); var b = sb.getBoundingClientRect();
          var nav = [].slice.call(document.querySelectorAll('nav, .mobile-nav, .bottom-nav')).map(function(n){ return n.getBoundingClientRect(); }).filter(function(r){ return r.height > 0 && r.bottom >= innerHeight - 2 && r.top > innerHeight / 2; })[0];
          return { b: b.bottom, nav: nav ? nav.top : innerHeight };`);
        ok(`${T} la navegación inferior no oculta el final de la herramienta`, end.b <= end.nav + 1, JSON.stringify(end));
      }
      if (!tag && (w === 390 || w === 1440 || w === 360)) {
        await page.evaluate('window.scrollTo(0,0)');
        await page.screenshot({ path: join(OUT, `budc-${ENG}-${w}-${lang}.png`), fullPage: true }).catch(() => {});
      }
      await ctx.close();
    }
  }

  // ════════════════ CASOS A–T (390 móvil con toque; 1440 escritorio con ratón) ════════════════
  for (const [w, h] of [[390, 844], [1440, 1000]]) {
    const T = `${ENG}.${w}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce', hasTouch: w < 900 });
    const page = await ctx.newPage();
    // A · un documento guardado con la forma ANTIGUA (claves fijas, sin filas).
    const legacyDoc = { id: 'ws4_legacy_1', type: 'monthly_budget', customName: 'Agosto antiguo', inputs: LEGACY,
      results: { income: 2500, expenses: 1580, free: 920 }, bodyVersion: 1, revision: 3, createdAt: 1, updatedAt: 2 };
    await boot(page, { seed: { key: 'aurix_ws4_projects', value: [legacyDoc] } });
    const projKey = await page.evaluate('_WSH_PROJECTS_KEY');
    if (projKey !== 'aurix_ws4_projects') { await page.evaluate(`localStorage.setItem(_WSH_PROJECTS_KEY, ${JSON.stringify(JSON.stringify([legacyDoc]))})`); }
    await openTool(page, 'ws4_legacy_1');
    let s = await state(page);
    ok(`${T}.A legacy: se abre con sus diez categorías y nombres sugeridos`,
      s.rows.length === 10 && s.rows[0].name === 'Nómina' && s.rows.find(r => r.id === 'education').name === 'Formación', JSON.stringify(s.rows.map(r => r.name)));
    ok(`${T}.A legacy: importes EXACTOS y mismos totales`,
      s.rows.find(r => r.id === 'housing').amt === '700' && s.kpis[0].indexOf('2500') !== -1 && s.kpis[1].indexOf('1580') !== -1, JSON.stringify(s.kpis));
    ok(`${T}.A abrir un documento antiguo no lo ensucia`, s.dirty === false && s.editId === 'ws4_legacy_1');
    const stored0 = await J(page, `return JSON.parse(localStorage.getItem(_WSH_PROJECTS_KEY)).find(function(p){ return p.id === 'ws4_legacy_1'; }).inputs;`);
    ok(`${T}.A leer NO migra el almacén (sin escritura destructiva)`, !('rows' in stored0) && stored0.housing === 700);

    // B · Formación → Baile y 50 (ya es 50: se pone 55 y luego 50 para ver el cambio)
    await rename(page, 'education', 'Baile');
    await typeAmt(page, 'education', '55'); await typeAmt(page, 'education', '50');
    s = await state(page);
    const bai = s.legend.find(l => l.id === 'education');
    ok(`${T}.B «Formación» → «Baile»: editor, leyenda y anillo por el MISMO id`,
      s.rows.find(r => r.id === 'education').name === 'Baile' && bai && bai.n === 'Baile' && s.arcs.some(a => a.id === 'education'), JSON.stringify(bai));
    ok(`${T}.B renombrar ensucia el borrador pero no crea documento ni cambia el periodo`,
      s.dirty === true && s.editId === 'ws4_legacy_1' && (await page.evaluate('_wsToolInputs.periodKey')) === '2026-08');
    // C · Nómina → Autónomo
    await rename(page, 'salary', 'Autónomo');
    s = await state(page);
    ok(`${T}.C «Nómina» → «Autónomo»`, s.rows.find(r => r.id === 'salary').name === 'Autónomo');
    // Escape restaura, y vacío restaura el último válido
    await rename(page, 'salary', 'Otra cosa', 'Escape');
    s = await state(page);
    ok(`${T} Escape restaura el nombre anterior`, s.rows.find(r => r.id === 'salary').name === 'Autónomo', s.rows[0].name);
    await rename(page, 'salary', '', 'Enter');
    s = await state(page);
    ok(`${T} un nombre vacío restaura el último válido`, s.rows.find(r => r.id === 'salary').name === 'Autónomo', s.rows[0].name);
    const focusAfter = await page.evaluate(`(document.activeElement && document.activeElement.getAttribute('data-wsbud-rename')) || ''`);
    ok(`${T} tras confirmar, el foco vuelve al nombre (teclado no se pierde)`, focusAfter === 'salary', focusAfter);

    // D · dos gastos con el mismo nombre y cantidades distintas
    const before = (await state(page)).rows.map(r => r.id);
    await page.click('[data-wsbud-add="expense"]');
    await page.keyboard.type('Gimnasio'); await page.keyboard.press('Enter');
    let ids = (await state(page)).rows.map(r => r.id).filter(x => before.indexOf(x) === -1);
    const g1 = ids[0];
    await typeAmt(page, g1, '30');
    await page.click('[data-wsbud-add="expense"]');
    await page.keyboard.type('Gimnasio'); await page.keyboard.press('Enter');
    ids = (await state(page)).rows.map(r => r.id).filter(x => before.indexOf(x) === -1);
    const g2 = ids.find(x => x !== g1);
    await typeAmt(page, g2, '70');
    s = await state(page);
    const gyms = s.legend.filter(l => l.n === 'Gimnasio');
    ok(`${T}.D dos «Gimnasio» coexisten con ids distintos (no se deduplica por nombre)`,
      !!g1 && !!g2 && g1 !== g2 && gyms.length === 2 && s.arcs.filter(a => a.id === g1 || a.id === g2).length === 2, JSON.stringify(gyms));
    const colors = await J(page, `return _wsBudgetRows(_wsToolInputs).filter(function(r){ return r.id === ${JSON.stringify(g1)} || r.id === ${JSON.stringify(g2)}; }).map(function(r){ return r.color; });`);
    ok(`${T}.D cada fila nueva recibe su color estable`, colors.length === 2 && colors.every(c => /^#[0-9a-f]{6}$/i.test(c)), JSON.stringify(colors));
    // E · eliminar un gasto nuevo y vacío: sin confirmación
    await page.click('[data-wsbud-add="expense"]'); await page.keyboard.press('Enter');
    const g3 = (await state(page)).rows.map(r => r.id).find(x => before.indexOf(x) === -1 && x !== g1 && x !== g2);
    await page.click(`[data-wsbud-del="${g3}"]`); await page.waitForTimeout(150);
    s = await state(page);
    const modalE = await page.$('#wsConfirmModal');
    ok(`${T}.E una fila vacía se elimina directamente`, !modalE && !s.rows.some(r => r.id === g3));
    // F · eliminar un gasto con cantidad y CANCELAR
    await page.click('[data-wsbud-del="housing"]'); await page.waitForTimeout(150);
    const modalF = await page.$('#wsConfirmModal');
    if (modalF) await page.click('[data-wsmodal="cancel"]');
    await page.waitForTimeout(150);
    s = await state(page);
    ok(`${T}.F con importe pide confirmación, y cancelar conserva la fila`, !!modalF && s.rows.some(r => r.id === 'housing' && r.amt === '700'));

    // R · cambiar una cantidad actualiza en el acto resumen, leyenda y centro
    const r0 = await state(page);
    await typeAmt(page, 'housing', '1400');
    const r1 = await state(page);
    ok(`${T}.R un importe mueve resumen, leyenda y centro al instante`,
      r0.kpis[1] !== r1.kpis[1] && r0.centre !== r1.centre, r0.kpis[1] + ' → ' + r1.kpis[1] + ' / ' + r1.centre);
    // S · vaciar del todo y reescribir, sin ceros fantasma
    await typeAmt(page, 'housing', '');
    const s0 = await state(page);
    await page.keyboard.type('75', { delay: 5 }); await page.keyboard.press('Tab'); await page.waitForTimeout(150);
    const s1 = await state(page);
    ok(`${T}.S vaciar deja el campo vacío (no «0») y reescribir da el número exacto`,
      s0.rows.find(r => r.id === 'housing').amt === '' && s1.rows.find(r => r.id === 'housing').amt === '75' && !/NaN/.test(s0.kpis.join('')),
      JSON.stringify([s0.rows.find(r => r.id === 'housing').amt, s1.rows.find(r => r.id === 'housing').amt]));
    await typeAmt(page, 'housing', '700'); await page.keyboard.press('Tab');

    // Q · selección: ratón/toque sobre el segmento, teclado en la leyenda, Escape, fuera
    const arcBox = await J(page, `var a = document.querySelector('.wsbud-arc[data-wsbud-seg="housing"]'); var r = a.getBoundingClientRect();
      var len = a.getTotalLength ? 0 : 0; return { x: r.left, y: r.top, w: r.width, h: r.height };`);
    // Un punto SOBRE el trazo de «housing»: el primer segmento arranca arriba (−90°) y avanza en horario.
    const ptOf = () => J(page, `document.documentElement.style.scrollBehavior = 'auto'; var svg = document.querySelector('.wsbud-donut svg'); svg.scrollIntoView({ block: 'center' }); var r = svg.getBoundingClientRect();
      var rows = calculateMonthlyBudget(_wsToolInputs); var its = rows.items.filter(function(i){ return i.value > 0; });
      var off = 0; for (var i = 0; i < its.length && its[i].id !== 'housing'; i++) off += its[i].value / rows.expenses;
      var mid = off + (its[i].value / rows.expenses) / 2; var ang = -Math.PI / 2 + mid * 2 * Math.PI; var k = r.width / 120;
      return { x: r.left + (60 + Math.cos(ang) * 52) * k, y: r.top + (60 + Math.sin(ang) * 52) * k };`);
    await ptOf(); await page.waitForTimeout(400);
    const pt = await ptOf();  // se mide DESPUÉS de que el desplazamiento se asiente (WebKit re-desplaza al enfocar)
    if (w < 900) await page.touchscreen.tap(pt.x, pt.y); else await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(150);
    s = await state(page);
    const selArc = s.arcs.find(a => a.id === 'housing');
    ok(`${T}.Q ${w < 900 ? 'toque' : 'ratón'} sobre el segmento: resalta, atenúa el resto y el centro dice nombre, importe y %`,
      selArc && /is-sel/.test(selArc.cls) && s.arcs.filter(a => a.id !== 'housing').every(a => /is-dim/.test(a.cls))
      && /Vivienda/i.test(s.centre) && /700/.test(s.centre) && /%/.test(s.centre), s.centre);
    ok(`${T}.Q …y resalta también la fila del editor y la de la leyenda`,
      s.rows.find(r => r.id === 'housing').sel === true && (s.legend.find(l => l.id === 'housing') || {}).pressed === 'true');
    if (w < 900) await page.touchscreen.tap(pt.x, pt.y); else await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(150);
    s = await state(page);
    ok(`${T}.Q pulsar de nuevo vuelve al estado general`, !s.arcs.some(a => /is-sel|is-dim/.test(a.cls)) && /la mayor partida/.test(s.centre), s.centre);
    // teclado
    await page.focus('.wsbud-leg[data-wsbud-sel="food"]');
    await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    s = await state(page);
    const focusVis = await J(page, `var e = document.activeElement; var cs = getComputedStyle(e); return { sel: e.getAttribute('data-wsbud-sel'), outline: cs.outlineStyle + ' ' + cs.outlineWidth };`);
    ok(`${T}.Q teclado: Enter en la leyenda selecciona y el foco se conserva`, /Alimentación/i.test(s.centre) && focusVis.sel === 'food', JSON.stringify(focusVis));
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    s = await state(page);
    ok(`${T}.Q Escape devuelve el estado general`, !s.arcs.some(a => /is-sel/.test(a.cls)));
    await page.focus('.wsbud-leg[data-wsbud-sel="food"]'); await page.keyboard.press('Space'); await page.waitForTimeout(120);
    await page.mouse.click(5, h - 5 > 0 ? 200 : 200); await page.waitForTimeout(150);
    s = await state(page);
    ok(`${T}.Q pulsar fuera devuelve el estado general`, !s.arcs.some(a => /is-sel/.test(a.cls)));
    const kfv = await J(page, `var b = document.querySelector('.wsbud-leg'); b.focus(); var cs = getComputedStyle(b); return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2;`);
    ok(`${T} foco visible en la leyenda`, kfv === true);

    // O · gastos > ingresos: una sola lectura, sin tasa negativa
    await typeAmt(page, 'salary', '1000'); await page.keyboard.press('Tab');
    s = await state(page);
    const defCount = (s.toolText.match(/superan tus ingresos/g) || []).length;
    ok(`${T}.O déficit: la lectura aparece UNA vez y nombra la diferencia`, defCount === 1 && /superan tus ingresos en/.test(s.reading), defCount + ' · ' + s.reading);
    ok(`${T}.O …y el resumen no publica una tasa de ahorro negativa`, !/-\d+% ahorro/.test(s.toolText));
    // M · ingresos 0
    await typeAmt(page, 'salary', '0'); await page.keyboard.press('Tab');
    s = await state(page);
    ok(`${T}.M ingresos 0: sin tasa inventada, sin NaN ni ∞`, !/ahorro/.test(s.kpis.join(' ') + (await page.evaluate(`(document.querySelector('.wsbud-kpi-sub')||{textContent:''}).textContent`))) && !/NaN|Infinity/.test(s.toolText), s.reading);
    // N · gastos 0
    const expIds = s.rows.filter(r => !['salary', 'extra', 'otherinc'].includes(r.id)).map(r => r.id);
    await page.evaluate(`(function(){ var rows = _wsBudgetRows(_wsToolInputs).map(function(r){ return r.type === 'expense' ? Object.assign({}, r, { amount: 0 }) : Object.assign({}, r, { amount: r.id === 'salary' ? 2000 : r.amount }); }); _wsBudgetSetRows(rows); _wsBudgetRepaint(); })()`);
    s = await state(page);
    ok(`${T}.N gastos 0: estado neutro, cero segmentos y la frase breve`, s.empty && s.arcs.length === 0 && /Añade tus gastos para ver el reparto/.test(s.toolText));
    await page.click('[data-wsbud-goto]'); await page.waitForTimeout(200);
    const goto = await page.evaluate(`(document.activeElement && document.activeElement.getAttribute('data-wsbud-amt')) || ''`);
    ok(`${T}.N …con acceso inmediato al editor de gastos`, !!goto && expIds.includes(goto), goto);
    ok(`${T} disponible 0 tiene lectura propia, exacta y neutra`, await page.evaluate(`(function(){ var r = calculateMonthlyBudget({ rows: [{ id:'a', type:'income', label:'x', amount: 100 }, { id:'b', type:'expense', label:'y', amount: 100, color:'#4D8DFF' }] }); return _wsBudgetReading(r) === t('wsbud_read_zero'); })()`));
    // restaura cifras
    await page.evaluate(`(function(){ var rows = _wsBudgetRows(_wsToolInputs).map(function(r){ var v = ({ salary: 2500, housing: 700, food: 350, transport: 120, utilities: 110, leisure: 150, education: 50, otherexp: 100 })[r.id]; if (v == null && r.id === ${JSON.stringify(g1)}) v = 30; if (v == null && r.id === ${JSON.stringify(g2)}) v = 70; return v != null ? Object.assign({}, r, { amount: v }) : r; }); _wsBudgetSetRows(rows); _wsBudgetRepaint(); })()`);

    // G · guardar, salir, volver
    await page.evaluate(`_wsToolCommit('Doc A', false, null)`);
    await page.waitForTimeout(250);
    const idA = await page.evaluate('_wsToolEditId');
    ok(`${T}.G guardar un legacy lo ACTUALIZA (mismo id) y marca guardado`, idA === 'ws4_legacy_1' && (await page.evaluate('_wsToolDirty')) === false);
    const storedA = await J(page, `return JSON.parse(localStorage.getItem(_WSH_PROJECTS_KEY)).find(function(p){ return p.id === 'ws4_legacy_1'; });`);
    ok(`${T}.G el documento guarda filas con id/tipo/label/importe/color/orden, y conserva periodo`,
      Array.isArray(storedA.inputs.rows) && storedA.inputs.rows.every(r => r.id && (r.type === 'income' || r.type === 'expense') && 'label' in r && 'amount' in r && Number.isFinite(r.order))
      && storedA.inputs.periodKey === '2026-08' && storedA.inputs.rows.find(r => r.id === 'education').label === 'Baile', JSON.stringify(storedA.inputs.rows.slice(0, 2)));
    ok(`${T}.G y ningún importe se perdió al pasar a la forma nueva`, storedA.results.income === 2500 && storedA.results.expenses === 1580 + 100 && storedA.inputs.housing === 700,
      JSON.stringify(storedA.results));
    await page.evaluate(`switchTab('dashboard')`); await page.waitForTimeout(200);
    await openTool(page, 'ws4_legacy_1');
    s = await state(page);
    ok(`${T}.G salir y volver: nombres e importes intactos`, s.rows.find(r => r.id === 'education').name === 'Baile'
      && s.rows.find(r => r.id === 'salary').name === 'Autónomo' && s.rows.filter(r => r.name === 'Gimnasio').length === 2
      && s.rows.find(r => r.id === g2).amt === '70');

    // H · abrir A, abrir B y guardar B sin contaminación
    await page.evaluate(`(function(){ var list = JSON.parse(localStorage.getItem(_WSH_PROJECTS_KEY)); list.push({ id: 'ws4_b', type: 'monthly_budget', customName: 'Doc B',
      inputs: { rows: [{ id: 'bi', type: 'income', label: 'Beca', amount: 900, order: 0 }, { id: 'bx', type: 'expense', label: 'Piso compartido', amount: 400, color: '#37c7b8', order: 1 }], periodKey: '2026-07' },
      results: { income: 900, expenses: 400, free: 500 }, bodyVersion: 1, revision: 1, createdAt: 5, updatedAt: 6 }); localStorage.setItem(_WSH_PROJECTS_KEY, JSON.stringify(list)); })()`);
    await openTool(page, 'ws4_legacy_1');
    await openTool(page, 'ws4_b');
    s = await state(page);
    ok(`${T}.H abrir B pinta B entero antes de nada (nada visible de A)`,
      s.rows.length === 2 && s.rows[0].name === 'Beca' && !/Baile|Gimnasio|Autónomo/.test(s.toolText.replace(/Doc A|Agosto antiguo/g, '')) && s.editId === 'ws4_b', JSON.stringify(s.rows));
    await typeAmt(page, 'bx', '450'); await page.keyboard.press('Tab');
    await page.evaluate(`_wsToolCommit('Doc B', false, null)`);
    const both = await J(page, `var l = JSON.parse(localStorage.getItem(_WSH_PROJECTS_KEY)); return { a: l.find(function(p){ return p.id === 'ws4_legacy_1'; }), b: l.find(function(p){ return p.id === 'ws4_b'; }) };`);
    ok(`${T}.H guardar B no escribe datos de A (y A sigue intacto)`,
      both.b.inputs.rows.length === 2 && both.b.inputs.rows[1].amount === '450' && both.b.inputs.periodKey === '2026-07'
      && both.a.inputs.rows.find(r => r.id === 'education').label === 'Baile' && both.a.inputs.rows.length === 12, JSON.stringify(both.b.inputs.rows));

    // I · duplicar y modificar sólo la copia
    await page.evaluate(`_wsxAct('dup', 'workspace:ws4_b')`); await page.waitForTimeout(150);
    const dupId = await J(page, `var l = JSON.parse(localStorage.getItem(_WSH_PROJECTS_KEY)).filter(function(p){ return p.type === 'monthly_budget' && !p.deletedAt && p.id !== 'ws4_b' && p.id !== 'ws4_legacy_1'; }); return l.length ? l[l.length - 1].id : null;`);
    await openTool(page, dupId);
    s = await state(page);
    ok(`${T}.I duplicar conserva nombres e importes con ID de documento nuevo`, !!dupId && dupId !== 'ws4_b' && s.rows[0].name === 'Beca' && s.rows[1].amt === '450');
    await rename(page, 'bx', 'Alquiler copia');
    await page.evaluate(`_wsToolCommit(null, false, null)`);
    const afterDup = await J(page, `var l = JSON.parse(localStorage.getItem(_WSH_PROJECTS_KEY)); return { o: l.find(function(p){ return p.id === 'ws4_b'; }).inputs.rows[1].label, c: l.find(function(p){ return p.id === ${JSON.stringify(dupId)}; }).inputs.rows[1].label };`);
    ok(`${T}.I modificar la copia no toca el original`, afterDup.o === 'Piso compartido' && afterDup.c === 'Alquiler copia', JSON.stringify(afterDup));
    // renombrar el DOCUMENTO no toca las categorías
    await page.evaluate(`(function(){ var l = JSON.parse(localStorage.getItem(_WSH_PROJECTS_KEY)); var p = l.find(function(x){ return x.id === 'ws4_b'; }); p.customName = 'B renombrado'; localStorage.setItem(_WSH_PROJECTS_KEY, JSON.stringify(l)); })()`);
    const rn = await J(page, `var p = JSON.parse(localStorage.getItem(_WSH_PROJECTS_KEY)).find(function(x){ return x.id === 'ws4_b'; }); return p.inputs.rows.map(function(r){ return r.label; });`);
    ok(`${T} renombrar el documento no modifica sus categorías`, JSON.stringify(rn) === JSON.stringify(['Beca', 'Piso compartido']));

    // J · recargar y abrir desde el Dashboard
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction("typeof _wsOpenTool === 'function' && typeof _AURIX_ENT_CANON !== 'undefined'", null, { timeout: 60000 });
    await page.waitForTimeout(800);
    await page.evaluate(PREMIUM('probe-a'));
    await page.evaluate(`switchTab('dashboard'); try { updateDashboardPlans(); } catch (_) {}`); await page.waitForTimeout(400);
    const card = await J(page, `var c = document.querySelector('.wspl-card[data-wspl-id="ws4_legacy_1"]'); return c ? { txt: c.textContent.replace(/\\s+/g, ' ').trim() } : null;`);
    ok(`${T}.J la tarjeta del Dashboard muestra el nombre elegido y métricas con sentido, sin categorías`,
      !!card && /Doc A/.test(card.txt) && !/Baile|Gimnasio|Autónomo/.test(card.txt), card && card.txt.slice(0, 140));
    const btn = await page.$('[data-wspl-open="ws4_legacy_1"]');
    if (btn) { await btn.scrollIntoViewIfNeeded(); await btn.click(); }
    await page.waitForTimeout(500);
    s = await state(page);
    ok(`${T}.J abrir desde «Tus planes» tras recargar carga nombres, importes y periodo`,
      s.editId === 'ws4_legacy_1' && s.rows.find(r => r.id === 'education').name === 'Baile' && s.rows.find(r => r.id === g1).amt === '30'
      && (await page.evaluate('_wsToolInputs.periodKey')) === '2026-08', JSON.stringify({ id: s.editId, n: s.rows.length }));

    // K · mismo documento en otro dispositivo de la misma cuenta: el cuerpo que se sube lleva las filas
    const body = await J(page, `var rows = _wsDocRows(_WSH_PROJECTS_KEY, 'probe-a'); var d = rows.find(function(r){ return r.doc_id === 'ws4_legacy_1'; }); return d ? d.body : null;`);
    ok(`${T}.K el cuerpo sincronizado contiene filas, nombres y periodo`, body && Array.isArray(body.inputs.rows) && body.inputs.rows.some(r => r.label === 'Baile') && body.inputs.periodKey === '2026-08');
    {
      const ctx2 = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
      const p2 = await ctx2.newPage();
      await boot(p2, { seed: { key: projKey, value: [body] } });
      await openTool(p2, 'ws4_legacy_1');
      const s2 = await state(p2);
      ok(`${T}.K otro dispositivo abre el mismo documento con los mismos nombres e importes`,
        s2.rows.find(r => r.id === 'education').name === 'Baile' && s2.rows.filter(r => r.name === 'Gimnasio').length === 2 && s2.kpis[0] === s.kpis[0], JSON.stringify(s2.kpis));
      await ctx2.close();
    }
    // L · dos cuentas sin cruces
    await page.evaluate(`(function(){ _aurixEnforceCacheOwner('probe-b'); _aurixStampCacheOwner(); })()`);
    await page.waitForTimeout(200);
    await openTool(page);
    const lb = await J(page, `return { docs: _ws4Projects().filter(function(p){ return p.type === 'monthly_budget'; }).length, names: _wsBudgetRows(_wsToolInputs).map(function(r){ return _wsBudgetRowName(r); }) };`);
    ok(`${T}.L otra cuenta no ve documentos ni categorías de la anterior`, lb.docs === 0 && !lb.names.some(n => /Baile|Gimnasio|Autónomo|Beca/.test(n)), JSON.stringify(lb));

    // T · fallo de persistencia: se informa y no se finge éxito
    await page.evaluate(PREMIUM('probe-b'));
    await openTool(page);
    await typeAmt(page, 'housing', '800'); await page.keyboard.press('Tab');
    const tres = await J(page, `var orig = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v){ if (k === _WSH_PROJECTS_KEY) throw new Error('QuotaExceededError'); return orig.apply(this, arguments); };
      try { _wsToolCommit('Doc T', true, null); } finally { Storage.prototype.setItem = orig; }
      var err = document.querySelector('.wsh-tool-view .wsg-reqerr[role="alert"]');
      return { err: err ? err.textContent : null, dirty: _wsToolDirty, editId: _wsToolEditId, amt: document.querySelector('[data-wsbud-amt="housing"]').value };`);
    ok(`${T}.T fallo al guardar: se dice, el borrador sigue sucio y los datos siguen en pantalla`,
      !!tres.err && /No se ha podido guardar/.test(tres.err) && tres.dirty === true && tres.editId === null && tres.amt === '800', JSON.stringify(tres));

    // P · nombres largos a 360
    if (w === 390) {
      await page.setViewportSize({ width: 360, height: 780 });
      await openTool(page);
      await rename(page, 'leisure', 'Actividades extraescolares de los niños y gimnasio');
      await page.focus('.wsbud-leg');
      const pl = await J(page, `var spill = []; document.querySelectorAll('.wsh-tool-view .wsh-card').forEach(function(card){ var cb = card.getBoundingClientRect();
          card.querySelectorAll('*').forEach(function(e){ var r = e.getBoundingClientRect(); if (r.width && (r.right > cb.right + 1 || r.left < cb.left - 1)) spill.push(String(e.className || e.tagName).slice(0, 30)); }); });
        var n = document.querySelector('[data-wsbud-rename="leisure"]');
        return { hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, spill: spill.slice(0, 4), full: n.textContent.trim(), stored: _wsBudgetRows(_wsToolInputs).find(function(r){ return r.id === 'leisure'; }).label };`);
      ok(`${T}.P nombre largo a 360: se parte por palabras, completo, sin overflow ni desbordes`,
        !pl.hscroll && pl.spill.length === 0 && pl.full === 'Actividades extraescolares de los niños y gimnasio' && pl.stored === pl.full, JSON.stringify(pl));
      await page.evaluate('window.scrollTo(0,0)');
      await page.screenshot({ path: join(OUT, `budc-${ENG}-360-long.png`), fullPage: true }).catch(() => {});
    }
    // reduced motion
    const rm = await page.evaluate(`getComputedStyle(document.querySelector('.wsbud-arc') || document.body).transitionDuration`);
    ok(`${T} prefers-reduced-motion: el anillo no anima`, /^0s(,\s*0s)*$/.test(rm) || rm === '0s', rm);
    await ctx.close();
  }

  // Selección y edición en EN (comprobación de idioma)
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await boot(page, { lang: 'en' });
    await openTool(page);
    const s = await state(page);
    ok(`${ENG}.EN nombres sugeridos, lectura y botones en inglés`,
      s.rows[0].name === 'Salary' && /of your income is left over/.test(s.reading) && /Add expense/.test(s.toolText) && /largest category/.test(s.centre), JSON.stringify([s.rows[0].name, s.reading]));
    await ctx.close();
  }
  await browser.close();
}
server.close();
console.log('\n════════════════════════════════════════════════');
console.log(pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { console.log('\nFAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); console.log('\nRESULT: NO-GO'); process.exit(1); }
console.log('\nRESULT: GO — capturas en docs/workspace-visual-qa/budc-*.png');
process.exit(0);
