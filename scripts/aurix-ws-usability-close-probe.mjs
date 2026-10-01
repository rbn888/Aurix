#!/usr/bin/env node
/**
 * AURIX · WORKSPACE · CIERRE QUIRÚRGICO DE USABILIDAD Y PRESENTACIÓN
 * ════════════════════════════════════════════════════════════════════════════
 * Navegador real (Chromium y WebKit) sobre la app servida en local:
 *   §1 Cobros: dos cobros parciales, recarga, historial, legacy sin fecha, saldo
 *      completo, sobrepago/negativo/fecha futura, doble toque, filtro, duplicar,
 *      editar sin perder historial, guardar como documento y reabrir.
 *   §2 Lápiz de Inmobiliario (toque, ratón, teclado) y del Diario.
 *   §3 Mi espacio: las nueve portadas pintan contenido (también con las imágenes caídas).
 *   §4 Presupuesto: cifras intactas, «Dinero libre» fuera del reparto y explicado.
 *   §5/§6 Composición de Cobros, Inmobiliario, Presupuesto y Objetivos en
 *      360/375/390/768/1024/1440: cabecera compacta, sin scroll horizontal, nada
 *      fuera de su tarjeta; el inventario inmobiliario dentro de la primera pantalla.
 *   §7 Objetivos: cifra y barra al instante, transición sólo con cambio real.
 *   §8 Tus planes: nombre propio como título, sin «% ingresos», disponible real,
 *      renombrar se refleja; ⋯ y CTA sin solaparse.
 *   AURIX_PW=/ruta/playwright/index.mjs node scripts/aurix-ws-usability-close-probe.mjs
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
const J = (page, expr) => page.evaluate(`(function(){ try { return JSON.stringify((function(){ ${expr} })()); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`).then(JSON.parse);
const openTool = (page, key, id) => page.evaluate(`(function(){ switchTab('workspace'); _wsOpenTool(${JSON.stringify(key)}${id ? ', ' + JSON.stringify(id) : ''}); return true; })()`).then(() => page.waitForTimeout(400));
const shot = (page, name) => page.screenshot({ path: join(OUT, 'usab-' + name + '.png') });
const RECV_SEED = { receivables_app: { items: [
  { id: 'r500', personOrCompany: 'Cliente 500', concept: 'Proyecto', units: 1, unitPrice: 500, paidAmount: 0, dueDate: '' },
  { id: 'rleg', personOrCompany: 'Legacy', concept: 'Antiguo', units: 2, unitPrice: 300, paidAmount: 200, dueDate: '01/02/2020' } ] } };

for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  if (!ONLY.split(',').includes(ENG)) continue;
  const browser = await launcher.launch();
  console.log('\n══ ' + ENG + ' ══');

  // ═════════════════ §1 · COBROS ═════════════════
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(`if(!localStorage.getItem('__s')){ localStorage.setItem('aurix_ws_tool_state_v1', ${JSON.stringify(JSON.stringify(RECV_SEED))}); localStorage.setItem('__s','1'); }`);
    await boot(p); await openTool(p, 'receivables');
    const T = ENG + '.§1';
    const card = id => J(p, `var c=document.querySelector('[data-wsrecv-card="${id}"]'); if(!c) return null; return { st: c.querySelector('.wsrecv-status').textContent, amts: [].slice.call(c.querySelectorAll('.wsrecv-amt b')).map(function(b){return b.textContent}), hist: [].slice.call(c.querySelectorAll('.wsrecv-hist-row')).map(function(r){return r.textContent.replace(/\\s+/g,' ').trim()}) }`);
    const err = sel => J(p, `var e=document.querySelector('${sel} .wsg-reqerr'); return e && e.textContent`);
    const pay = async (id, amt, date) => {
      await p.locator(`[data-wsrecv-act="pay"][data-wsrecv-id="${id}"]`).click();
      await p.fill('[data-wsrecv-pay-amt]', amt); if (date) await p.fill('[data-wsrecv-pay-date]', date);
      await p.locator('[data-wsrecv-pay-save]').click(); await p.waitForTimeout(150);
    };
    const head = await J(p, `return document.querySelector('.wsrecv-list-card .wsh-title').textContent`);
    ok(`${T} la lista ya no se titula «Pendientes»`, head === 'Tus cobros', head);
    await pay('r500', '100');
    let c = await card('r500');
    ok(`${T} 500 € y cobro de 100 → pagado 100, pendiente 400, Parcial`, /^100,00/.test(c.amts[1]) && /^400,00/.test(c.amts[2]) && c.st === 'Parcial', JSON.stringify(c));
    await pay('r500', '150');
    c = await card('r500');
    ok(`${T} segundo cobro de 150 → pagado 250, pendiente 250, dos entradas con fecha`, /^250,00/.test(c.amts[1]) && /^250,00/.test(c.amts[2]) && c.hist.length === 2 && c.hist.every(h => /\d\d\/\d\d\/\d{4}/.test(h)), JSON.stringify(c));
    await p.locator('[data-wsrecv-act="pay"][data-wsrecv-id="r500"]').click();
    await p.fill('[data-wsrecv-pay-amt]', '300'); await p.locator('[data-wsrecv-pay-save]').click(); await p.waitForTimeout(80);
    ok(`${T} un cobro mayor que el saldo se rechaza`, /supera/.test(await err('.wsrecv-pay') || ''));
    await p.fill('[data-wsrecv-pay-amt]', '-5'); await p.locator('[data-wsrecv-pay-save]').click(); await p.waitForTimeout(80);
    ok(`${T} un importe negativo se rechaza`, /negativo/.test(await err('.wsrecv-pay') || ''));
    await p.fill('[data-wsrecv-pay-amt]', '10'); await p.fill('[data-wsrecv-pay-date]', '01/01/2099'); await p.locator('[data-wsrecv-pay-save]').click(); await p.waitForTimeout(80);
    ok(`${T} una fecha futura se rechaza`, /posterior/.test(await err('.wsrecv-pay') || ''));
    await p.fill('[data-wsrecv-pay-amt]', '50'); await p.fill('[data-wsrecv-pay-date]', '15/09/2026');
    await p.evaluate(`var b=document.querySelector('[data-wsrecv-pay-save]'); b.click(); _wsRecvPaySave(); b.click();`); await p.waitForTimeout(150);
    c = await card('r500');
    ok(`${T} doble toque / reintento NO duplica el cobro`, c.hist.length === 3 && /^300,00/.test(c.amts[1]), JSON.stringify(c));
    ok(`${T} el historial se ordena por fecha`, /^15\/09\/2026/.test(c.hist[0]), c.hist.join(' | '));
    await p.reload(); await p.waitForFunction("typeof _wsOpenTool==='function' && typeof _AURIX_ENT_CANON !== 'undefined'"); await p.waitForTimeout(800);
    await p.evaluate(PREMIUM('probe-a')); await openTool(p, 'receivables');
    c = await card('r500');
    ok(`${T} tras recargar: total, pagado, pendiente y estado salen del historial persistido`, /^500,00/.test(c.amts[0]) && /^300,00/.test(c.amts[1]) && /^200,00/.test(c.amts[2]) && c.st === 'Parcial' && c.hist.length === 3, JSON.stringify(c));
    let lg = await card('rleg');
    ok(`${T} registro antiguo: su cobrado se conserva como un cobro SIN FECHA (no inventada)`, lg.hist.length === 1 && /Sin fecha/.test(lg.hist[0]) && /^200,00/.test(lg.amts[1]), JSON.stringify(lg));
    ok(`${T} vencido con fecha dd/mm/aaaa (antes nunca vencía)`, lg.st === 'Vencido', lg.st);
    await p.locator('[data-wsrecv-act="pay"][data-wsrecv-id="rleg"]').click();
    await p.locator('[data-wsrecv-pay-full]').click(); await p.locator('[data-wsrecv-pay-save]').click(); await p.waitForTimeout(150);
    lg = await card('rleg');
    ok(`${T} «Saldo completo» → Cobrado, y el cobro antiguo sigue en el historial`, lg.st === 'Cobrado' && lg.hist.length === 2 && /Sin fecha/.test(lg.hist[0]), JSON.stringify(lg));
    ok(`${T} un registro cobrado ya no ofrece «Registrar cobro»`, !(await J(p, `return !!document.querySelector('[data-wsrecv-act="pay"][data-wsrecv-id="rleg"]')`)));
    await p.locator('[data-wsrecv-filter="open"]').click(); await p.waitForTimeout(80);
    let ids = await J(p, `return [].slice.call(document.querySelectorAll('[data-wsrecv-card]')).map(function(c){return c.getAttribute('data-wsrecv-card')})`);
    ok(`${T} filtro «Por cobrar» no muestra cobrados`, ids.indexOf('rleg') < 0 && ids.indexOf('r500') >= 0, ids.join());
    await p.locator('[data-wsrecv-filter="done"]').click(); await p.waitForTimeout(80);
    ids = await J(p, `return [].slice.call(document.querySelectorAll('[data-wsrecv-card]')).map(function(c){return c.getAttribute('data-wsrecv-card')})`);
    ok(`${T} filtro «Cobrados» sólo muestra cobrados`, ids.join() === 'rleg', ids.join());
    await p.locator('[data-wsrecv-filter="all"]').click(); await p.waitForTimeout(80);
    await p.locator('[data-wsrecv-act="dup"][data-wsrecv-id="r500"]').click(); await p.waitForTimeout(80);
    const dup = await J(p, `var l=_wsToolInputs.items; var d=l[l.length-1]; return { n:l.length, paid:d.paidAmount, pays:(d.payments||[]).length, id:d.id }`);
    ok(`${T} duplicar crea un registro NUEVO sin los cobros del original`, dup.n === 3 && dup.paid === 0 && dup.pays === 0 && dup.id !== 'r500', JSON.stringify(dup));
    await p.locator(`[data-wsrecv-act="del"][data-wsrecv-id="${dup.id}"]`).click(); await p.waitForTimeout(150);
    await p.locator('[data-wsmodal="ok"]').click(); await p.waitForTimeout(150);
    ok(`${T} eliminar (con confirmación) elimina ese registro`, (await J(p, `return _wsToolInputs.items.length`)) === 2);
    await p.locator('[data-wsrecv-act="edit"][data-wsrecv-id="r500"]').click(); await p.waitForTimeout(500);
    const ed = await J(p, `var f=document.querySelector('.wsrecv-form-card').getBoundingClientRect(); return { top: f.top, vh: innerHeight, active: document.activeElement.getAttribute('data-wsrecv-input'), paidField: !!document.querySelector('[data-wsrecv-input=paidAmount]') }`);
    ok(`${T} editar lleva al formulario, enfoca y no expone «ya cobrado» (el historial manda)`, ed.top > -5 && ed.top < ed.vh * 0.6 && ed.active === 'personOrCompany' && !ed.paidField, JSON.stringify(ed));
    await p.fill('[data-wsrecv-input="unitPrice"]', '200'); await p.locator('[data-wsrecv-add]').click(); await p.waitForTimeout(80);
    ok(`${T} editar: un total por debajo de lo cobrado se rechaza`, /menor/.test(await err('.wsrecv-form-card') || ''));
    await p.fill('[data-wsrecv-input="unitPrice"]', '600'); await p.locator('[data-wsrecv-add]').click(); await p.waitForTimeout(200);
    c = await card('r500');
    ok(`${T} editar recalcula (600 − 300 = 300) y conserva los tres cobros`, /^600,00/.test(c.amts[0]) && /^300,00/.test(c.amts[2]) && c.hist.length === 3, JSON.stringify(c));
    // Documento: guardar con nombre, reabrir desde el almacén.
    const saved = await J(p, `_wsToolCommit('Clientes otoño', true); var d=_ws4Projects().find(function(x){return x.customName==='Clientes otoño'}); return d ? { id: d.id, pays: (d.inputs.items.find(function(i){return i.id==='r500'})||{}).payments.length } : null`);
    ok(`${T} guardar como documento conserva el historial`, saved && saved.pays === 3, JSON.stringify(saved));
    await p.evaluate(`localStorage.removeItem('aurix_ws_tool_state_v1')`);
    await openTool(p, 'receivables', saved.id);
    c = await card('r500');
    ok(`${T} reabrir el documento recalcula desde lo persistido`, c && /^300,00/.test(c.amts[1]) && c.hist.length === 3, JSON.stringify(c));
    ok(`${T} sugerencia de nombre del primer guardado = nombre de la capacidad`, (await J(p, `return _wsToolSuggestName()`)).indexOf('Control de cobros') === 0);
    await p.evaluate(`scrollTo(0, document.querySelector('[data-wsrecv-card="r500"]').getBoundingClientRect().top + scrollY - 70)`);
    await shot(p, ENG + '-recv-390');
    ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ═════════════════ §2 · LÁPICES ═════════════════
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900 });
    const p = await ctx.newPage(); await boot(p); await openTool(p, 'realestate');
    const T = `${ENG}.§2.${w}`;
    const ed = p.locator('[data-wsre-act="edit"][data-wsre-id="pr_d2"]');
    await ed.scrollIntoViewIfNeeded();
    if (w < 900) await ed.tap(); else await ed.click();
    await p.waitForTimeout(700);
    let r = await J(p, `var f=document.querySelector('.wsre-form-card'); var rr=f.getBoundingClientRect(); return { top: rr.top, vh: innerHeight, edit:_wsReEditId, det:_wsReDetailId, active: document.activeElement.getAttribute('data-wsre-input'), val: document.activeElement.value }`);
    ok(`${T} el lápiz abre la edición de ESE inmueble, a la vista y con foco`, r.edit === 'pr_d2' && r.det === null && r.top > -5 && r.top < r.vh * 0.5 && r.active === 'name' && r.val === 'Apartamento Playa', JSON.stringify(r));
    await p.fill('[data-wsre-input="name"]', 'Apartamento Playa Norte'); await p.fill('[data-wsre-input="rent"]', '1000');
    await p.locator('[data-wsre-add]').click(); await p.waitForTimeout(700);
    r = await J(p, `var l=_wsToolInputs.properties; var x=l.find(function(q){return q.id==='pr_d2'}); var c=document.querySelector('.wsre-card[data-wsre-id="pr_d2"]'); var cr=c.getBoundingClientRect(); return { n:l.length, name:x.name, rent:x.rent, buy:x.buy, city:x.city, others: l.filter(function(q){return q.id!=='pr_d2'}).map(function(q){return q.name}).join(','), cardName: c.querySelector('.wsre-card-name').textContent, cardTop: cr.top, vh: innerHeight }`);
    ok(`${T} guardar refleja el cambio y conserva el resto de datos e inmuebles`, r.n === 3 && r.cardName === 'Apartamento Playa Norte' && r.rent === 1000 && r.buy === 175000 && r.city === 'Valencia' && r.others === 'Piso Centro,Local Comercial', JSON.stringify(r));
    ok(`${T} y vuelve a la tarjeta editada`, r.cardTop > -5 && r.cardTop < r.vh, JSON.stringify(r));
    await p.locator('.wsre-card[data-wsre-id="pr_d1"] .wsre-card-name').click(); await p.waitForTimeout(300);
    ok(`${T} tocar la tarjeta sigue abriendo el detalle (control distinto, acción distinta)`, (await J(p, `return _wsReDetailId`)) === 'pr_d1');
    await p.evaluate('_wsReBack()'); await p.waitForTimeout(200);
    await p.focus('.wsre-card[data-wsre-id="pr_d3"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
    ok(`${T} teclado: Enter sobre la tarjeta abre el detalle`, (await J(p, `return _wsReDetailId`)) === 'pr_d3');
    await p.evaluate('_wsReBack()'); await p.waitForTimeout(200);
    await p.focus('[data-wsre-act="edit"][data-wsre-id="pr_d3"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
    r = await J(p, `return { det:_wsReDetailId, edit:_wsReEditId, active: document.activeElement.getAttribute('data-wsre-input') }`);
    ok(`${T} teclado: Enter sobre el lápiz edita, no abre el detalle`, r.det === null && r.edit === 'pr_d3' && r.active === 'name', JSON.stringify(r));
    await p.locator('[data-wsre-cancel]').click(); await p.waitForTimeout(400);
    ok(`${T} cancelar vuelve a la tarjeta sin tocar nada`, (await J(p, `return _wsReEditId === null && _wsToolInputs.properties.find(function(q){return q.id==='pr_d3'}).name === 'Local Comercial'`)) === true);
    await openTool(p, 'journal');
    const jid = await J(p, `var b=document.querySelector('[data-wsjrn-act="edit"]'); return b && b.getAttribute('data-wsjrn-id')`);
    if (jid) {
      await p.locator(`[data-wsjrn-act="edit"][data-wsjrn-id="${jid}"]`).click(); await p.waitForTimeout(600);
      r = await J(p, `var f=document.querySelector('.wsjrn-form-card').getBoundingClientRect(); return { top:f.top, vh:innerHeight, edit:_wsJrnEditId, active: document.activeElement.getAttribute('data-wsjrn-input') }`);
      ok(`${T} Diario: su lápiz tenía el mismo defecto y ahora lleva al formulario con foco`, r.edit === jid && r.top > -5 && r.top < r.vh * 0.5 && !!r.active, JSON.stringify(r));
    }
    await ctx.close();
  }

  // ═════════════════ §3 · MI ESPACIO ═════════════════
  for (const [w, h, fail] of [[360, 740], [390, 844], [390, 844, true], [1024, 800], [1440, 900]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900, deviceScaleFactor: 2 });
    if (fail) await ctx.route('**/assets/workspace/*.webp', r => r.abort());
    const p = await ctx.newPage(); await boot(p);
    for (const tab of ['tools', 'templates']) {
      await p.evaluate(`switchTab('workspace'); _wsTab='${tab}'; _wshView='home'; _wshRepaintHome();`); await p.waitForTimeout(200);
      const refs = await J(p, `return [].slice.call(document.querySelectorAll('[data-wspin]')).map(function(b){return b.getAttribute('data-wspin')})`);
      await p.evaluate(`(${JSON.stringify(refs)}).forEach(function(r){ if(!_wsIsPinned(r)) _wsTogglePin(r); })`);
    }
    await p.evaluate(`_wsTab='space'; _wshRepaintHome();`); await p.waitForTimeout(1200);
    const T = `${ENG}.§3.${w}${fail ? '.sin-imagenes' : ''}`;
    const r = await J(p, `return [].slice.call(document.querySelectorAll('.wsh-mse2-pv')).map(function(pv){ var R=pv.getBoundingClientRect();
      var ink=[].slice.call(pv.querySelectorAll('path,rect,circle,img.is-loaded')).filter(function(e){ var r=e.getBoundingClientRect(); var cs=getComputedStyle(e); var painted = e.tagName==='IMG' || (cs.stroke!=='none' && parseFloat(cs.strokeWidth)>0) || (cs.fill!=='none' && cs.fill!=='rgba(0, 0, 0, 0)');
        return painted && r.width>0 && r.height>0 && r.right>R.left+1 && r.left<R.right-1 && r.bottom>R.top+1 && r.top<R.bottom-1; }).length;
      var host=pv.querySelector('.wspv-asset-host'); var failed = host && host.classList.contains('is-asset-failed');
      var scene = failed ? [].slice.call(host.querySelectorAll('*')).filter(function(e){ var r=e.getBoundingClientRect(); var cs=getComputedStyle(e); return cs.display!=='none' && cs.visibility!=='hidden' && r.width>0 && r.right>R.left && r.left<R.right && r.bottom>R.top && r.top<R.bottom; }).length : 0;
      return { n: pv.closest('.wsh-mse2-card').getAttribute('aria-label'), wh: Math.round(R.width)+'x'+Math.round(R.height), ink: ink, failed: !!failed, scene: scene }; })`);
    const bad = r.filter(x => x.ink === 0 && !(x.failed && x.scene > 0));
    ok(`${T} las nueve portadas pintan contenido dentro de su caja (ningún cuadro vacío)`, r.length === 9 && bad.length === 0, JSON.stringify(bad));
    ok(`${T} todas las cajas reservan el mismo tamaño (sin saltos al cargar)`, new Set(r.map(x => x.wh)).size === 1, r.map(x => x.wh).join());
    await shot(p, `${ENG}-myspace-${w}${fail ? '-fail' : ''}`);
    await p.locator('.wsh-mse2-card[aria-label="Simulador de préstamos"]').click(); await p.waitForTimeout(400);
    ok(`${T} abrir desde Mi espacio sigue llevando a la herramienta`, (await J(p, `return _wsToolActive`)) === 'loan');
    await ctx.close();
  }

  // ═════════════════ §4 · PRESUPUESTO ═════════════════
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const p = await ctx.newPage(); await boot(p); await openTool(p, 'budget');
    const T = ENG + '.§4';
    const r = await J(p, `return { kpis: [].slice.call(document.querySelectorAll('.wsbud-kpi b')).map(function(b){return b.textContent}), sub: (document.querySelector('.wsbud-kpi-sub')||{}).textContent,
      legend: [].slice.call(document.querySelectorAll('.wsbud-leg-n')).map(function(e){return e.textContent}), basis: (document.querySelector('.wsbud-leg-basis')||{}).textContent,
      free: (document.querySelector('.wsbud-free-note')||{}).textContent, arcs: document.querySelectorAll('.wsbud-arc').length,
      pctSum: [].slice.call(document.querySelectorAll('.wsbud-leg em')).reduce(function(s,e){ return s + parseInt(e.textContent,10); }, 0) }`);
    ok(`${T} importes intactos: 2500 / 1580 / 920`, r.kpis[0].indexOf('2500,00') === 0 && r.kpis[1].indexOf('1580,00') === 0 && r.kpis[2].indexOf('920,00') === 0, r.kpis.join());
    ok(`${T} «Dinero libre» ya no es una fila de la leyenda (no es un segmento del anillo)`, r.legend.indexOf('Dinero libre') < 0 && r.legend.length === r.arcs, JSON.stringify(r.legend));
    ok(`${T} …y se explica con importe, proporción sobre ingresos y su tratamiento`, /920,00/.test(r.free) && /37%/.test(r.free) && /No forma parte del reparto/.test(r.free), r.free);
    ok(`${T} la leyenda dice sobre qué se calcula el %, y suma ≈ 100`, /total de gastos/.test(r.basis) && r.pctSum >= 98 && r.pctSum <= 102, r.basis + ' / ' + r.pctSum);
    ok(`${T} el disponible no se rotula como «ahorro»`, /de tus ingresos/.test(r.sub) && !/ahorro/.test(r.sub), r.sub);
    await ctx.close();
  }

  // ═════════════════ §5/§6 · COMPOSICIÓN ═════════════════
  for (const [w, h] of [[360, 740], [375, 812], [390, 844], [768, 1024], [1024, 800], [1440, 1000]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900, deviceScaleFactor: w < 700 ? 2 : 1 });
    const p = await ctx.newPage(); await boot(p);
    for (const key of ['receivables', 'realestate', 'budget', 'goals']) {
      if (key === 'goals') { await p.evaluate(`switchTab('workspace'); _wsOpenSurface('goals');`); await p.waitForTimeout(400); }
      else await openTool(p, key);
      await p.evaluate('scrollTo(0,0)');
      const T = `${ENG}.§6.${w}.${key}`;
      const g = await J(p, `var bar=document.querySelector('.wsh-tool-view .wsh-bar, .wsh-bar'); var br=bar?bar.getBoundingClientRect():null;
        var title=bar&&bar.querySelector('.wsh-bar-title'); var tr=title?title.getBoundingClientRect():null;
        var spill=[]; document.querySelectorAll('#aurixWorkspace .wsh-card').forEach(function(card){ var cb=card.getBoundingClientRect(); if(!cb.width) return;
          card.querySelectorAll('*').forEach(function(e){ var r=e.getBoundingClientRect(); var cs=getComputedStyle(e); if(cs.position==='absolute'||cs.position==='fixed') return; if (r.width && (r.right>cb.right+1 || r.left<cb.left-1)) spill.push(String(e.className||e.tagName).slice(0,30)); }); });
        var edge=[]; document.querySelectorAll('#aurixWorkspace .wsh-card').forEach(function(card){ var r=card.getBoundingClientRect(); if (r.width && (r.left < 4 || r.right > innerWidth - 4)) edge.push(String(card.className).slice(0,30)); });
        var first=document.querySelector('.wsre-card, .wsrecv-card, .wsbud-donut, .wsg-card, .wsh-wsg [data-wsg-form]'); var fr=first?first.getBoundingClientRect():null;
        return { barH: br?Math.round(br.height):null, titleCut: title ? (title.scrollWidth > title.clientWidth + 1) : null, titleH: tr?Math.round(tr.height):0,
          hs: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, spill: spill.slice(0,4), edge: edge.slice(0,3), firstTop: fr?Math.round(fr.top):null, vh: innerHeight };`);
      ok(`${T} cabecera compacta (≤ 60 px) y título sin cortar`, g.barH != null && g.barH <= 60 && g.titleCut === false, JSON.stringify(g));
      ok(`${T} sin scroll horizontal ni contenido fuera de su tarjeta`, !g.hs && g.spill.length === 0, JSON.stringify(g.spill));
      ok(`${T} tarjetas con margen lateral`, g.edge.length === 0, JSON.stringify(g.edge));
      ok(`${T} la función principal empieza dentro de la primera pantalla`, g.firstTop != null && g.firstTop < g.vh * 0.75, JSON.stringify(g));
      if ([360, 390, 1440].includes(w) && ENG === 'CR' || (ENG === 'WK' && [390, 1440].includes(w))) await shot(p, `${ENG}-${key}-${w}`);
    }
    await ctx.close();
  }

  // ═════════════════ §7 · OBJETIVOS ═════════════════
  for (const rm of ['no-preference', 'reduce']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: rm });
    const p = await ctx.newPage(); await boot(p);
    await p.evaluate(`localStorage.removeItem('aurix_ws_goals_v1'); switchTab('workspace'); _wsOpenSurface('goals');`); await p.waitForTimeout(400);
    await p.evaluate(`(function(){ var r = document.querySelector('.wsh-wsg'); r.querySelector('[data-wsg-form="name"]').value='Meta'; var tg=r.querySelector('[data-wsg-form="target"]'); tg.value='10000'; tg.dispatchEvent(new Event('input',{bubbles:true})); var cu=r.querySelector('[data-wsg-form="current"]'); cu.value='2000'; cu.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('[data-wsg-create]').click(); })()`); await p.waitForTimeout(400);
    const sel = '.wsg-card [data-wsg-input="current"]';
    const T = `${ENG}.§7.${rm}`;
    await p.evaluate(`var e=document.querySelector('${sel}'); e.focus(); e.value='5000'; e.dispatchEvent(new Event('input',{bubbles:true}))`); await p.waitForTimeout(40);
    const r1 = await J(p, `var f=document.querySelector('.wsg-card .wsg-bar-fill'); return { w:f.style.width, anim:f.classList.contains('is-anim'), pct:document.querySelector('.wsg-card .wsg-pct').textContent, upd:document.querySelectorAll('.wsg-card .is-upd').length }`);
    ok(`${T} cifra y barra se actualizan en el acto (2000→5000 de 10000 = 50 %)`, r1.w === '50%' && r1.pct === '50%', JSON.stringify(r1));
    ok(`${T} ${rm === 'reduce' ? 'sin animación con reduced motion' : 'transición breve porque cambió un valor real'}`, rm === 'reduce' ? (!r1.anim && r1.upd === 0) : (r1.anim && r1.upd > 0), JSON.stringify(r1));
    await p.evaluate(`var e=document.querySelector('${sel}'); e.dispatchEvent(new Event('input',{bubbles:true}))`); await p.waitForTimeout(30);
    const r2 = await J(p, `var f=document.querySelector('.wsg-card .wsg-bar-fill'); return { anim:f.classList.contains('is-anim'), upd:document.querySelectorAll('.wsg-card .is-upd').length }`);
    ok(`${T} sin cambio de valor no se anima nada (ni bucle)`, !r2.anim && r2.upd === 0, JSON.stringify(r2));
    await ctx.close();
  }

  // ═════════════════ §8 · TUS PLANES ═════════════════
  for (const [w, h] of [[360, 740], [390, 844], [1024, 800], [1440, 1000]]) {
    const DOCS = [
      { id: 'd1', type: 'monthly_budget', customName: 'Casa', updatedAt: 500, revision: 1, inputs: { salary: 2500, housing: 700, food: 300 } },
      { id: 'd6', type: 'monthly_budget', customName: 'Presupuesto mensual', updatedAt: 450, revision: 1, inputs: { salary: 1800, housing: 600 } },
      { id: 'd3', type: 'receivables_app', customName: 'Clientes 2026', updatedAt: 300, revision: 1, inputs: { items: [{ id: 'r1', personOrCompany: 'ACME', units: 1, unitPrice: 1000, paidAmount: 400 }] } },
      { id: 'd4', type: 'real_estate_portfolio', customName: 'Cartera Madrid con un nombre bastante largo', updatedAt: 200, revision: 1, inputs: { properties: [{ id: 'p1', name: 'Piso', ptype: 'flat', buy: 200000, value: 250000 }] } },
    ];
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 700 ? 2 : 1 });
    const p = await ctx.newPage(); await boot(p);
    await p.evaluate(`localStorage.setItem('aurix_ws_projects_v1', ${JSON.stringify(JSON.stringify(DOCS))}); switchTab('home'); _wsPlansWireOnce(); updateDashboardPlans(); document.getElementById('wsPlansSection').scrollIntoView();`);
    await p.waitForTimeout(500);
    const T = `${ENG}.§8.${w}`;
    const r = await J(p, `return [].slice.call(document.querySelectorAll('.wspl-card')).map(function(c){ var m=c.querySelector('.wspl-menu').getBoundingClientRect(), g=c.querySelector('.wspl-go').getBoundingClientRect(), n=c.querySelector('.wspl-name').getBoundingClientRect(), cb=c.getBoundingClientRect();
      var over = function(a,b){ return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom; };
      return { id: c.getAttribute('data-wspl-id'), name: c.querySelector('.wspl-name').textContent, type: (c.querySelector('.wspl-type')||{}).textContent || '', nameFs: parseFloat(getComputedStyle(c.querySelector('.wspl-name')).fontSize), typeFs: c.querySelector('.wspl-type') ? parseFloat(getComputedStyle(c.querySelector('.wspl-type')).fontSize) : 0,
        hero: (c.querySelector('.wspl-hero')||{}).textContent || '', share: (c.querySelector('.wspl-share-t')||{}).textContent || '', text: c.textContent,
        clash: over(m, n) || over(m, g), goH: Math.round(g.height), spill: g.right > cb.right + 1 || n.right > cb.right + 1 }; })`);
    const by = id => r.find(x => x.id === id) || {};
    ok(`${T} el nombre del usuario es el título; el tipo, secundario y más pequeño`, by('d1').name === 'Casa' && by('d1').type === 'Presupuesto mensual' && by('d1').typeFs < by('d1').nameFs, JSON.stringify(by('d1')));
    ok(`${T} si nombre y tipo coinciden, no se repite`, by('d6').name === 'Presupuesto mensual' && by('d6').type === '', JSON.stringify(by('d6')));
    ok(`${T} ningún «% ingresos» ni barra en el presupuesto`, r.every(x => !/% ingresos/.test(x.text)) && by('d1').share === '', by('d1').text);
    ok(`${T} el presupuesto abre con su disponible real (2500 − 1000 = 1500)`, /^Disponible1500,00/.test(by('d1').hero.replace(/\s+/g, '')), by('d1').hero);
    ok(`${T} cobros: barra con significado explícito (40 % cobrado del total)`, /40% cobrado del total/.test(by('d3').share) && /^Cobrado400,00/.test(by('d3').hero.replace(/\s+/g, '')), by('d3').share + ' / ' + by('d3').hero);
    ok(`${T} ⋯ y la acción principal no se solapan con nada; nada sale de la tarjeta`, r.every(x => !x.clash && !x.spill && x.goH >= 44), JSON.stringify(r.map(x => [x.id, x.clash, x.spill, x.goH])));
    await p.evaluate(`_wsRename('workspace:d1', 'Casa nueva'); updateDashboardPlans();`); await p.waitForTimeout(200);
    ok(`${T} renombrar se refleja en el Dashboard`, (await J(p, `return document.querySelector('.wspl-card[data-wspl-id="d1"] .wspl-name').textContent`)) === 'Casa nueva');
    await p.evaluate(`updateDashboardPlans();`); await p.waitForTimeout(60);
    ok(`${T} repintar sin cambios NO vuelve a animar la entrada`, (await J(p, `return document.querySelectorAll('.wspl-card.is-enter').length`)) === 0);
    await (await p.$('#wsPlansSection')).screenshot({ path: join(OUT, `usab-${ENG}-plans-${w}.png`) });
    if (w === 390) {
      await p.locator('.wspl-card[data-wspl-id="d1"] .wspl-go').click(); await p.waitForTimeout(500);
      const o = await J(p, `return { tool:_wsToolActive, id:_wsToolEditId, doc:(document.querySelector('.wsh-bar-doc')||{}).textContent }`);
      ok(`${T} abrir desde el Dashboard conserva el nombre en la herramienta`, o.tool === 'budget' && o.id === 'd1' && /Casa nueva/.test(o.doc || ''), JSON.stringify(o));
      const saved = await J(p, `return /Casa nueva/.test((document.querySelector('.wsh-tool-view').textContent))`);
      ok(`${T} …y en «Mis documentos» de la capacidad`, saved === true);
    }
    await ctx.close();
  }
  await browser.close();
}
server.close();
console.log('\n' + pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { console.log('\nFALLOS:\n  ' + fails.join('\n  ')); console.log('\nRESULT: NO-GO'); process.exit(1); }
console.log('RESULT: GO — capturas en docs/workspace-visual-qa/usab-*.png');
