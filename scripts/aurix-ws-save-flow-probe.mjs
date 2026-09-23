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

  await ctx.close();
  await browser.close();
}
server.close();
console.log('\n════════════════════════════════════════════════');
console.log(pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { console.log('\nFAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); console.log('\nRESULT: NO-GO'); process.exit(1); }
console.log('\nRESULT: GO');
process.exit(0);
