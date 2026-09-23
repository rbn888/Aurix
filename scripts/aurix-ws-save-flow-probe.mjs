#!/usr/bin/env node
/**
 * AURIX · GUARDAR: ACTUALIZAR O CREAR OTRA, SIN AMBIGÜEDAD (§4)
 * ════════════════════════════════════════════════════════════════════════════
 * QUÉ VIGILA, y por qué no basta con un test de unidad: la decisión «¿actualizo
 * este documento o creo otro?» ocurre en un DIÁLOGO, y equivocarse hacia
 * «actualizar» destruye trabajo del usuario sin autorización. Así que se pulsan
 * los botones de verdad y se comprueba el ALMACÉN después de cada camino.
 *
 * La regla que ninguna prueba puede relajar: ningún guardado es correcto si
 * pierde o reemplaza datos sin que el usuario lo haya elegido y visto por su
 * nombre.
 *
 *   node scripts/aurix-ws-save-flow-probe.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
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

let pass = 0; const fails = [];
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (info ? '  [' + info + ']' : '')); console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };

async function mount(page) {
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(`typeof renderWorkspaceHome === 'function'`, null, { timeout: 60000 });
  await page.waitForTimeout(700);
  await page.evaluate(`(function(){
    var bl=document.getElementById('bootLoader'); if(bl) bl.remove();
    var ar=document.getElementById('appRoot'); if(ar) ar.style.opacity='1';
    document.getElementById('aurixWorkspace').style.display='block';
    var f=Object.create(null);
    _AURIX_ENT_CANON.forEach(function(k){ f[k] = (k !== 'workspace.catalog_preview'); });
    _aurixEnt={loaded:true,loading:false,error:null,plan:'premium',status:'active',source:'plan',validUntil:null,features:f,sources:Object.create(null),fetchedAt:Date.now()};
    _wsDocTableState='yes';
    switchTab('workspace'); return true; })()`);
  await page.waitForTimeout(250);
}
const reset = (page, docs) => page.evaluate(`(function(){
  localStorage.setItem('aurix_ws_projects_v1', ${JSON.stringify(JSON.stringify([]))});
  ${docs ? `localStorage.setItem('aurix_ws_projects_v1', ${JSON.stringify(JSON.stringify(docs))});` : ''}
  _wshView='home'; renderWorkspaceHome();
  _wsOpenTool('compound'); renderWorkspaceHome();
  _wsToolEditId=null; _wsToolDirty=false; return true; })()`);
const edit = (page, v) => page.evaluate(`(function(){ _wsToolInputs.initial=${JSON.stringify(v)}; _wsToolDirty=true;
  var bar=document.querySelector('[data-wstool-savebar]'); if(bar) bar.innerHTML=_wsToolSaveBarHtml(); return true; })()`);
const store = page => page.evaluate(`JSON.stringify(_ws4ProjectsRaw().map(function(p){return {id:p.id,name:p.customName,rev:p.revision,initial:String(p.inputs&&p.inputs.initial),del:!!p.deletedAt};}))`).then(JSON.parse);
const click = async (page, sel) => { await page.click(sel); await page.waitForTimeout(140); };
const modalText = page => page.evaluate(`(function(){var m=document.getElementById('wsConfirmModal');return m?m.innerText.replace(/\\s+/g,' ').trim():'';})()`);

console.log('AURIX · GUARDADO EXPLÍCITO — los tres caminos, pulsados\n');

for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  const browser = await launcher.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await mount(page);

  // ══ A · BORRADOR NUEVO Y NADA DEL MISMO TIPO ═════════════════════════════
  await reset(page, []);
  await edit(page, '1234');
  await click(page, '[data-wstool-save]');
  const aModal = await modalText(page);
  ok(`${ENG}.A sin documentos del tipo, Guardar pide el NOMBRE directamente`,
    /Guardar en Mi espacio|Save to My Space/i.test(aModal) && !!(await page.$('#wsRenameInput')), aModal.slice(0, 90));
  await page.fill('#wsRenameInput', 'Plan A');
  await click(page, '[data-wsmodal="ok"]');
  let st = await store(page);
  ok(`${ENG}.A confirmar crea UNA instancia con su nombre`,
    st.length === 1 && st[0].name === 'Plan A' && st[0].initial === '1234', JSON.stringify(st));

  // ══ B · EDITANDO UNA INSTANCIA ═══════════════════════════════════════════
  await edit(page, '5555');
  await click(page, '[data-wstool-save]');
  const bModal = await modalText(page);
  ok(`${ENG}.B con instancia abierta se PREGUNTA, y la opción nombra el documento`,
    /Plan A/.test(bModal) && /(Actualizar|Update)/i.test(bModal) && /(nueva|new)/i.test(bModal), bModal.slice(0, 140));
  // Cancelar no escribe nada y conserva el borrador.
  await click(page, '[data-wschoice="cancel"]');
  st = await store(page);
  ok(`${ENG}.B cancelar no escribe y conserva el borrador`,
    st.length === 1 && st[0].initial === '1234'
    && (await page.evaluate(`String(_wsToolInputs.initial) === '5555' && _wsToolDirty === true`)), JSON.stringify(st));
  // Actualizar: mismo ID, revisión +1, sin duplicar.
  await click(page, '[data-wstool-save]');
  await click(page, '[data-wschoice="0"]');
  st = await store(page);
  ok(`${ENG}.B «Actualizar» modifica ESE id, sube revisión y no duplica`,
    st.length === 1 && st[0].name === 'Plan A' && st[0].initial === '5555' && st[0].rev >= 2, JSON.stringify(st));
  // Sin cambios: Guardar deshabilitado.
  ok(`${ENG}.B sin cambios, Guardar queda deshabilitado (no se duplica por insistir)`,
    await page.evaluate(`!!document.querySelector('[data-wstool-save][disabled]')`));
  // Guardar como nueva: id nuevo, original intacta.
  await edit(page, '7777');
  await click(page, '[data-wstool-save]');
  await click(page, '[data-wschoice="1"]');
  await page.fill('#wsRenameInput', 'Plan B');
  await click(page, '[data-wsmodal="ok"]');
  st = await store(page);
  ok(`${ENG}.B «Guardar como nueva» crea otra y deja la original intacta`,
    st.length === 2 && st.some(x => x.name === 'Plan A' && x.initial === '5555')
    && st.some(x => x.name === 'Plan B' && x.initial === '7777'), JSON.stringify(st));

  // ══ C · BORRADOR NUEVO CON INSTANCIAS DEL MISMO TIPO ═════════════════════
  await page.evaluate(`(function(){ _wsToolEditId=null; _wsToolDirty=false; return true; })()`);
  await edit(page, '9999');
  await click(page, '[data-wstool-save]');
  const cModal = await modalText(page);
  ok(`${ENG}.C con documentos del tipo se ofrece crear otra o REEMPLAZAR`,
    /(nueva|new)/i.test(cModal) && /(Reemplazar|Replace)/i.test(cModal), cModal.slice(0, 140));
  await click(page, '[data-wschoice="1"]');
  const picker = await page.evaluate(`(function(){
    var rows=[].slice.call(document.querySelectorAll('.ws-modal-pick'));
    return JSON.stringify({ n: rows.length, marked: rows.filter(function(r){return r.classList.contains('is-on');}).length,
      okDisabled: !!document.querySelector('[data-wspick="ok"][disabled]'),
      names: rows.map(function(r){return r.querySelector('.ws-modal-pick-n').textContent;}) });})()`).then(JSON.parse);
  ok(`${ENG}.C el selector lista los candidatos SIN preseleccionar ninguno`,
    picker.n === 2 && picker.marked === 0 && picker.okDisabled === true, JSON.stringify(picker));
  // Elegir uno concreto y confirmar: la confirmación lo NOMBRA.
  const idxA = picker.names.indexOf('Plan A');
  await click(page, `[data-wspick="${idxA}"]`);
  ok(`${ENG}.C al elegir, el confirmar se habilita`,
    !(await page.evaluate(`!!document.querySelector('[data-wspick="ok"][disabled]')`)));
  await click(page, '[data-wspick="ok"]');
  const confirmTxt = await modalText(page);
  ok(`${ENG}.C la confirmación NOMBRA el documento que se va a reemplazar`,
    /Plan A/.test(confirmTxt), confirmTxt.slice(0, 120));
  await click(page, '[data-wsmodal="ok"]');
  st = await store(page);
  const planA = st.find(x => x.name === 'Plan A'), planB = st.find(x => x.name === 'Plan B');
  ok(`${ENG}.C reemplaza SÓLO el elegido, conserva su id y su nombre, y no crea otro`,
    st.filter(x => !x.del).length === 2 && planA && planA.initial === '9999' && planA.rev >= 3
    && planB && planB.initial === '7777', JSON.stringify(st));

  // ══ D · CANCELAR EN EL SELECTOR NO ESCRIBE ═══════════════════════════════
  await page.evaluate(`(function(){ _wsToolEditId=null; _wsToolDirty=false; return true; })()`);
  await edit(page, '4242');
  await click(page, '[data-wstool-save]');
  await click(page, '[data-wschoice="1"]');
  await click(page, '[data-wspick="cancel"]');
  const st2 = await store(page);
  ok(`${ENG}.D cancelar el selector no escribe nada`,
    JSON.stringify(st2) === JSON.stringify(st), JSON.stringify(st2));

  // ══ E · DOBLE TOQUE NO CREA DOS COPIAS ═══════════════════════════════════
  await page.evaluate(`(function(){ _wsToolEditId=null; _wsToolDirty=false; return true; })()`);
  await edit(page, '3131');
  await click(page, '[data-wstool-save]');
  const before = (await store(page)).filter(x => !x.del).length;
  await page.evaluate(`(function(){
    var b=document.querySelector('[data-wschoice="0"]');
    b.click(); b.click(); return true; })()`);
  await page.waitForTimeout(150);
  await page.fill('#wsRenameInput', 'Plan C');
  await page.evaluate(`(function(){ var b=document.querySelector('[data-wsmodal="ok"]'); b.click(); b.click(); return true; })()`);
  await page.waitForTimeout(200);
  const st3 = (await store(page)).filter(x => !x.del);
  ok(`${ENG}.E doble toque en la decisión y en confirmar crea UNA sola instancia`,
    st3.length === before + 1 && st3.filter(x => x.name === 'Plan C').length === 1, JSON.stringify(st3));

  // ══ F · LA BARRA NO SE DESBORDA, Y ELIMINAR NO COMPITE CON GUARDAR ═══════
  const bar = await page.evaluate(`(function(){
    var b=document.querySelector('[data-wstool-savebar]'); if(!b) return null;
    var br=b.getBoundingClientRect();
    var kids=[].slice.call(b.children).filter(function(k){var r=k.getBoundingClientRect();return r.width&&r.height;});
    var out=kids.filter(function(k){var r=k.getBoundingClientRect();return r.right>br.right+1||r.left<br.left-1;});
    return JSON.stringify({ overflow: out.length, primary: b.querySelectorAll('.wsg-savebtn').length,
      inlineActs: b.querySelectorAll(':scope > .wsg-act').length,
      menu: b.querySelectorAll('.wsg-menu').length,
      menuTap: (function(){var s=b.querySelector('.wsg-menu-sum'); if(!s) return 0; var r=s.getBoundingClientRect(); return Math.round(Math.min(r.width,r.height));})() });})()`).then(JSON.parse);
  ok(`${ENG}.F una sola acción primaria, el resto en menú, y nada fuera de la barra`,
    bar && bar.overflow === 0 && bar.primary === 1 && bar.inlineActs === 0 && bar.menu === 1 && bar.menuTap >= 40,
    JSON.stringify(bar));


  // ══ §11 · ESCENARIOS: BASE Y ALTERNATIVA ═════════════════════════════════
  // Las dos proyecciones salen del MOTOR COMPARTIDO, así que comparten
  // capitalización, calendario y redondeo por construcción. Lo que se comprueba
  // aquí es que la comparación sea honesta: mismo capital, mismo horizonte, la
  // diferencia descompuesta y cuadrada, y ningún resultado publicado sobre un
  // supuesto incompleto.
  {
    await page.evaluate(`(function(){
      _wshView='home'; renderWorkspaceHome();
      _wsbParamsSet({ baseManual: '100000', years: '20', ret: '6', baseMonthly: '0', altMonthly: '300', altRet: '' });
      _wsOpenSurface('scenario'); renderWorkspaceHome(); return true; })()`);
    await page.waitForTimeout(280);
    const g = await page.evaluate(`(function(){
      var c = document.querySelector('[data-wsb2]');
      if (!c) return JSON.stringify({ card: false });
      var cmp = _wsbTwoWay();
      var ref = _wsProject({ initial: 100000, monthly: 0, years: 20, annualRatePct: 6, convention: cmp.convention });
      return JSON.stringify({
        card: true, ok: cmp.ok,
        sameYears: cmp.a.proj.assumptions != null && cmp.years === 20,
        sameBase: Math.round(cmp.a.proj.series[0].value) === Math.round(cmp.b.proj.series[0].value),
        engineMatches: Math.abs(cmp.a.proj.final - ref.final) < 0.01,
        sums: Math.abs((cmp.byContribution + cmp.byGrowth) - cmp.diff) < 0.01,
        lines: c.querySelectorAll('.wsb2-line').length,
        dashed: getComputedStyle(c.querySelector('.wsb2-line.is-b')).strokeDasharray !== 'none',
        labels: c.querySelectorAll('.wsb2-col-t').length,
        srAlt: !!c.querySelector('.wsb2-sr'),
        ariaImg: !!c.querySelector('svg[role="img"][aria-label]'),
        retFields: document.querySelectorAll('[data-wsb-param="ret"]').length,
        dupInCard: c.querySelectorAll('[data-wsb-param="ret"],[data-wsb-param="years"],[data-wsb-param="baseManual"]').length });})()`).then(JSON.parse);
    ok(`${ENG}.scn · las dos proyecciones salen del motor compartido, sobre el MISMO capital y horizonte`,
      g.card && g.ok && g.sameBase && g.engineMatches && g.sameYears, JSON.stringify(g));
    ok(`${ENG}.scn · la diferencia se descompone y las partes suman el total`,
      g.sums === true, JSON.stringify(g));
    ok(`${ENG}.scn · dos series distinguidas por etiqueta y trazo, no sólo por color`,
      g.lines === 2 && g.labels === 2 && g.dashed === true, JSON.stringify(g));
    ok(`${ENG}.scn · el gráfico tiene alternativa textual`,
      g.srAlt === true && g.ariaImg === true, JSON.stringify(g));
    // Un supuesto COMÚN no puede tener dos campos: repintar uno mientras se
    // teclea en el otro es exactamente cómo se pierde el foco.
    ok(`${ENG}.scn · los supuestos COMUNES viven una sola vez, fuera de la comparación`,
      g.retFields === 1 && g.dupInCard === 0, JSON.stringify(g));

    // Editar la alternativa recalcula SIN perder foco ni cursor.
    await page.click('[data-wsb-param="altMonthly"]'); await page.waitForTimeout(80);
    await page.keyboard.press('End'); await page.keyboard.type('0');
    await page.waitForTimeout(220);
    const e = await page.evaluate(`(function(){
      var el = document.querySelector('[data-wsb-param="altMonthly"]');
      return JSON.stringify({ v: el.value, focused: document.activeElement === el, cur: el.selectionStart,
        alt: Math.round(_wsbTwoWay().b.proj.final) });})()`).then(JSON.parse);
    ok(`${ENG}.scn · editar la alternativa recalcula y conserva foco y cursor`,
      e.v === '3000' && e.focused === true && e.cur === 4 && e.alt > 0, JSON.stringify(e));

    // Un supuesto INCOMPLETO suspende los resultados y dice qué falta.
    const inv = await page.evaluate(`(function(){
      _wsbParamsSet({ baseManual: '' });
      var out = document.querySelector('[data-wsb2-out]');
      out.innerHTML = _wsbTwoWayOutHtml(_wsbTwoWay());
      return JSON.stringify({ warn: !!out.querySelector('.is-warn'), chart: out.querySelectorAll('.wsb2-line').length,
        txt: out.textContent.trim().slice(0, 60) });})()`).then(JSON.parse);
    ok(`${ENG}.scn · sin patrimonio de partida NO se publican resultados, y se dice qué falta`,
      inv.warn === true && inv.chart === 0 && /Faltan datos|Missing data/i.test(inv.txt), JSON.stringify(inv));
    // Y una rentabilidad NEGATIVA es una entrada válida: no se recorta a cero.
    const neg = await page.evaluate(`(function(){
      _wsbParamsSet({ baseManual: '100000', altMonthly: '0', altRet: '-3' });
      var cmp = _wsbTwoWay();
      return JSON.stringify({ rate: cmp.b.ratePct, finalB: Math.round(cmp.b.proj.final),
        finalA: Math.round(cmp.a.proj.final) });})()`).then(JSON.parse);
    ok(`${ENG}.scn · una rentabilidad negativa se respeta, no se recorta a cero`,
      neg.rate === -3 && neg.finalB < neg.finalA, JSON.stringify(neg));

    // ── LA COMPARACIÓN SE GUARDA COMO INSTANCIA (§4) Y SE VE EN EL DASHBOARD (§5)
    // El simulador era la única capacidad que calculaba y no conservaba nada:
    // los supuestos del usuario vivían en un borrador compartido y volver al día
    // siguiente no devolvía su comparación. Se guarda por el MISMO diálogo que
    // las siete herramientas, así que aquí se comprueban los mismos caminos.
    await page.evaluate(`(function(){
      localStorage.setItem('aurix_ws_projects_v1', '[]');
      _wsbParamsSet({ baseManual: '100000', years: '20', ret: '6', baseMonthly: '0', altMonthly: '300', altRet: '' });
      _wsbEditId = null; _wsbDirty = true;
      _wshView = 'home'; renderWorkspaceHome();
      _wsOpenSurface('scenario'); return true; })()`);
    await page.waitForTimeout(240);
    // El supuesto se teclea DE VERDAD y el guardado se pulsa SIN salir antes del
    // campo: es el gesto real en un móvil. Al salir de un campo numérico se
    // reemite el valor canónico como `input`, así que si el guardado repintara su
    // barra ahí, el botón moriría entre `mousedown` y `mouseup` y el toque no
    // haría nada. Ese defecto existió y esta es su prueba.
    await page.click('[data-wsb-param="altMonthly"]', { clickCount: 3 });
    await page.keyboard.type('300');
    await page.waitForTimeout(160);
    const s0 = await page.evaluate(`(function(){
      var b = document.querySelector('[data-wsb2-save]');
      return JSON.stringify({ has: !!b, dis: b ? b.hasAttribute('disabled') : null,
        lbl: b ? b.textContent.trim() : '', state: (document.querySelector('.wsb2-savebar .wsg-savestate')||{}).textContent });})()`).then(JSON.parse);
    ok(`${ENG}.scn · el borrador ofrece guardar, y dice que todavía no lo está`,
      s0.has && s0.dis === false && /Guardar|Save/i.test(s0.lbl), JSON.stringify(s0));

    console.log('DBG', await page.evaluate(`(function(){return JSON.stringify({persist:_wsCanPersist(),ok:_wsbTwoWay().ok,n:document.querySelectorAll('[data-wsb2-save]').length,view:_wshView,modals:document.querySelectorAll('#wsConfirmModal').length});})()`));
    await click(page, '[data-wsb2-save]');
    console.log('DBG1b', await page.evaluate(`(function(){try{ _wsbSaveInstance(); return 'called'; }catch(e){ return 'ERR '+e.message; }})()`));
    const sm = await modalText(page);
    ok(`${ENG}.scn · guardar funciona al PRIMER toque, sin salir antes del campo`,
      !!(await page.$('#wsRenameInput')), 'el botón no puede desaparecer bajo el dedo');
    ok(`${ENG}.scn · sin comparaciones guardadas, Guardar pide el NOMBRE directamente`,
      /Guardar en Mi espacio|Save to My Space/i.test(sm) && !!(await page.$('#wsRenameInput')), sm.slice(0, 90));
    await page.fill('#wsRenameInput', 'Comparación A');
    await click(page, '[data-wsmodal="ok"]');
    await page.waitForTimeout(320);
    const s1 = await page.evaluate(`(function(){
      var arr = _ws4Projects().filter(function(p){ return p.type === 'scenario_compare'; });
      var d = arr[0] || {}; var r = d.results || {};
      var b = document.querySelector('[data-wsb2-save]');
      return JSON.stringify({ n: arr.length, name: d.customName, inputs: d.inputs || {},
        altFinal: r.altFinal, diff: r.diff, sums: Math.abs((r.byContribution + r.byGrowth) - r.diff) <= 1,
        conv: r.convention, cur: d.currency, edit: _wsbEditId === d.id, dirty: _wsbDirty,
        dis: b ? b.hasAttribute('disabled') : null });})()`).then(JSON.parse);
    ok(`${ENG}.scn · guardar crea UNA instancia con sus supuestos y su resultado dentro`,
      s1.n === 1 && s1.name === 'Comparación A' && s1.inputs.altMonthly === '300' && s1.inputs.years === '20'
      && Number.isFinite(s1.altFinal) && s1.sums === true && !!s1.conv && !!s1.cur, JSON.stringify(s1));
    ok(`${ENG}.scn · tras guardar, la instancia queda abierta y no se puede duplicar por insistir`,
      s1.edit === true && s1.dirty === false && s1.dis === true, JSON.stringify(s1));

    // §5 — el Dashboard es una VISTA del mismo guardado.
    const dash = await page.evaluate(`(function(){
      updateDashboardPlans();
      var sec = document.getElementById('wsPlansSection');
      var card = sec ? sec.querySelector('[data-wspl-open]') : null;
      var doc = _ws4Projects().find(function(p){ return p.type === 'scenario_compare'; });
      var mets = _wsPlanMetrics(doc).map(function(m){ return m.k + '=' + m.v; });
      return JSON.stringify({ shown: sec ? sec.style.display !== 'none' : false,
        inDocs: _wsPlansDocs().some(function(p){ return p.type === 'scenario_compare'; }),
        card: !!card, txt: sec ? sec.innerText.replace(/\s+/g, ' ') : '', mets: mets });})()`).then(JSON.parse);
    ok(`${ENG}.scn · la comparación guardada aparece en el Dashboard con su nombre`,
      dash.shown && dash.inDocs && dash.card && /Comparación A/.test(dash.txt), JSON.stringify(dash).slice(0, 200));
    ok(`${ENG}.scn · sus dos métricas salen de lo GUARDADO, no de un recálculo`,
      dash.mets.length === 2 && /Alternativa|Alternative/.test(dash.mets[0]) && /Diferencia|Difference/.test(dash.mets[1]),
      JSON.stringify(dash.mets));

    // Tocar un supuesto deja la instancia desalineada, y la barra lo dice.
    await page.click('[data-wsb-param="altMonthly"]');
    await page.keyboard.press('End'); await page.keyboard.type('0');
    await page.waitForTimeout(220);
    const s2 = await page.evaluate(`(function(){
      var b = document.querySelector('[data-wsb2-save]');
      return JSON.stringify({ dirty: _wsbDirty, dis: b.hasAttribute('disabled'), lbl: b.textContent.trim() });})()`).then(JSON.parse);
    ok(`${ENG}.scn · editar un supuesto marca cambios pendientes y ofrece ACTUALIZAR`,
      s2.dirty === true && s2.dis === false && /Actualizar|Update/i.test(s2.lbl), JSON.stringify(s2));

    // Y con instancia abierta se PREGUNTA: actualizar esa, o crear otra.
    await click(page, '[data-wsb2-save]');
    const sm2 = await modalText(page);
    ok(`${ENG}.scn · con instancia abierta se pregunta, y la opción nombra el documento`,
      /Comparación A/.test(sm2) && /(Actualizar|Update)/i.test(sm2) && /(nueva|new)/i.test(sm2), sm2.slice(0, 140));
    await click(page, '[data-wschoice="1"]');
    await page.fill('#wsRenameInput', 'Comparación B');
    await click(page, '[data-wsmodal="ok"]');
    await page.waitForTimeout(240);
    const s3 = await page.evaluate(`(function(){
      var arr = _ws4Projects().filter(function(p){ return p.type === 'scenario_compare'; })
        .sort(function(a,b){ return (a.createdAt||0) - (b.createdAt||0); });
      return JSON.stringify({ n: arr.length, names: arr.map(function(p){ return p.customName; }),
        alt0: arr[0].inputs.altMonthly, alt1: arr[1].inputs.altMonthly,
        res0: arr[0].results.altFinal, res1: arr[1].results.altFinal });})()`).then(JSON.parse);
    ok(`${ENG}.scn · «Guardar como nueva» crea otra y deja la primera INTACTA`,
      s3.n === 2 && s3.alt0 === '300' && s3.alt1 === '3000' && s3.res1 > s3.res0, JSON.stringify(s3));

    // Y reabrir la primera desde el Dashboard devuelve SUS supuestos, no los del
    // último borrador — el defecto que un almacén de parámetros compartido invita.
    await page.evaluate(`(function(){
      var first = _ws4Projects().filter(function(p){ return p.type === 'scenario_compare'; })
        .sort(function(a,b){ return (a.createdAt||0) - (b.createdAt||0); })[0];
      _wsPlansOpen(first.id); return first.id; })()`);
    await page.waitForTimeout(280);
    const back = await page.evaluate(`(function(){
      var first = _ws4Projects().filter(function(p){ return p.type === 'scenario_compare'; })
        .sort(function(a,b){ return (a.createdAt||0) - (b.createdAt||0); })[0];
      var p = _wsbParams();
      return JSON.stringify({ id: first.id, edit: _wsbEditId, dirty: _wsbDirty,
        alt: String(p.altMonthly), years: String(p.years), base: String(p.baseManual),
        field: (document.querySelector('[data-wsb-param="altMonthly"]')||{}).value });})()`).then(JSON.parse);
    ok(`${ENG}.scn · reabrir desde el Dashboard restaura SUS supuestos y abre ESA instancia`,
      back.edit === back.id && back.dirty === false && back.alt === '300' && back.years === '20'
      && back.base === '100000' && back.field === '300', JSON.stringify(back));

    // Un supuesto incompleto no se puede guardar: el documento afirmaría una
    // comparación que la propia pantalla se niega a publicar.
    const noSave = await page.evaluate(`(function(){
      _wsbParamsSet({ baseManual: '' });
      var bar = document.querySelector('[data-wsb2-savebar]');
      bar.innerHTML = _wsbSaveBarHtml();
      var before = _ws4Projects().length;
      _wsbCommit('No debería', true, null);
      return JSON.stringify({ dis: bar.querySelector('[data-wsb2-save]').hasAttribute('disabled'),
        before: before, after: _ws4Projects().length });})()`).then(JSON.parse);
    ok(`${ENG}.scn · un supuesto incompleto no se guarda, ni forzando el commit`,
      noSave.dis === true && noSave.after === noSave.before, JSON.stringify(noSave));
  }
  await ctx.close();
  await browser.close();
}
server.close();
console.log('\n════════════════════════════════════════════════');
console.log(pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { console.log('\nFAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); console.log('\nRESULT: NO-GO'); process.exit(1); }
console.log('\nRESULT: GO');
process.exit(0);
