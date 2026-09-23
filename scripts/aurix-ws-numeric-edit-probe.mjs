#!/usr/bin/env node
/**
 * AURIX · EDICIÓN NUMÉRICA REAL — TECLADO Y PORTAPAPELES, NO `.value`
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE, y por qué las sondas anteriores daban verde con el defecto
 * vivo: comprobaban el parser llamando a `_wsNum`, o escribían `el.value` y
 * despachaban un `input` a mano. Ese camino NO pasa por el navegador, así que
 * no puede ver un `preventDefault()` sobre una tecla — que es exactamente lo
 * que estaba roto: un manejador global de la hoja de cálculo legacy cancelaba
 * Delete y Backspace en TODA la pestaña Workspace, y también secuestraba
 * Cmd/Ctrl+A. El carácter no «reaparecía»: nunca llegaba a borrarse, y ni
 * siquiera se emitía un evento `input`.
 *
 * Aquí se pulsan teclas de verdad (`keyboard.press` / `keyboard.type`) y se
 * pega de verdad, en las OCHO capacidades y en los DOS motores.
 *
 * LO QUE ESTO **NO** DEMUESTRA: no es Safari de iPhone. Comparte el motor
 * (WebKit) pero no el teclado del sistema, la autocorrección ni el zoom al
 * enfocar. La aceptación en el dispositivo del fundador sigue pendiente.
 *
 *   node scripts/aurix-ws-numeric-edit-probe.mjs
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
catch (e) {
  console.error('\n✗ SIN MOTORES — ' + PW + '\n  mkdir -p /tmp/aurix-pw && cd /tmp/aurix-pw && npm init -y && npm i playwright && npx playwright install webkit chromium');
  console.error('\nRESULT: NO EJECUTADO (entorno, no candidato)'); process.exit(2);
}

let pass = 0; const fails = [];
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (info ? '  [' + info + ']' : '')); console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };

// Las OCHO capacidades, con UN campo numérico representativo de cada una y la
// forma de abrirlas. El campo se elige del formulario que el usuario usa de
// verdad, no de uno de adorno.
const CAPS = [
  { id: 'compound',    open: `_wsOpenTool('compound')`,       sel: '.wstool-inputs-card .ws4-num' },
  { id: 'loan',        open: `_wsOpenTool('loan')`,           sel: '.wsloan-fields .ws4-num' },
  { id: 'budget',      open: `_wsOpenTool('budget')`,         sel: '.wstool-fields .ws4-num' },
  { id: 'journal',     open: `_wsOpenTool('journal')`,        sel: '[data-wsjrn-input="buy"]' },
  { id: 'realestate',  open: `_wsOpenTool('realestate')`,     sel: '[data-wsre-input="buy"]' },
  { id: 'receivables', open: `_wsOpenTool('receivables')`,    sel: '[data-wsrecv-input="unitPrice"]' },
  { id: 'scenario',    open: `_wsOpenSurface('scenario')`,    sel: '.wsb-params .ws4-num' },
  { id: 'goals',       open: `_wsOpenSurface('goals')`,       sel: '.wsg-form .ws4-num' },
];

async function mount(page) {
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(`typeof renderWorkspaceHome === 'function' && typeof switchTab === 'function'`, null, { timeout: 60000 });
  await page.waitForTimeout(700);
  await page.evaluate(`(function(){
    var bl=document.getElementById('bootLoader'); if(bl) bl.remove();
    var ar=document.getElementById('appRoot'); if(ar) ar.style.opacity='1';
    document.getElementById('aurixWorkspace').style.display='block';
    var f=Object.create(null);
    _AURIX_ENT_CANON.forEach(function(k){ f[k] = (k !== 'workspace.catalog_preview'); });
    _aurixEnt={loaded:true,loading:false,error:null,plan:'premium',status:'active',source:'plan',validUntil:null,features:f,sources:Object.create(null),fetchedAt:Date.now()};
    switchTab('workspace'); return true; })()`);
  await page.waitForTimeout(300);
}
const openCap = (page, cap) => page.evaluate(`(function(){ _wshView='home'; renderWorkspaceHome(); ${cap.open}; renderWorkspaceHome(); return true; })()`)
  .then(() => page.waitForTimeout(260));
const put = (page, sel, v) => page.evaluate(`(function(){ var el=document.querySelector('#aurixWorkspace ' + ${JSON.stringify(sel)}); if(!el) return false; el.blur(); el.value=${JSON.stringify(v)}; return true; })()`);
const read = (page, sel) => page.evaluate(`(function(){ var el=document.querySelector('#aurixWorkspace ' + ${JSON.stringify(sel)});
  return JSON.stringify({ v: el.value, s: el.selectionStart, focused: document.activeElement === el,
    font: parseFloat(getComputedStyle(el).fontSize), im: el.getAttribute('inputmode') }); })()`).then(JSON.parse);

console.log('AURIX · EDICIÓN NUMÉRICA — teclado real en Chromium y WebKit');
console.log('origen: ' + ORIGIN + '  (copia de trabajo)\n');

for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  const browser = await launcher.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await mount(page);

  for (const cap of CAPS) {
    await openCap(page, cap);
    const full = '#aurixWorkspace ' + cap.sel;
    const exists = await page.evaluate(`!!document.querySelector(${JSON.stringify(full)})`);
    const tag = `${ENG}.${cap.id}`;
    if (!exists) { ok(`${tag} el campo numérico existe`, false, cap.sel); continue; }

    // ── EL CONTRATO LITERAL DE §3 ────────────────────────────────────────
    await put(page, cap.sel, '1000');
    await page.click(full); await page.waitForTimeout(60);
    await page.keyboard.press('End');
    await page.keyboard.press('Backspace');
    const a1 = await read(page, cap.sel);
    await page.keyboard.type('1');
    const a2 = await read(page, cap.sel);
    ok(`${tag} 1000 → borrar último → 100 → escribir 1 → 1001`,
      a1.v === '100' && a2.v === '1001', JSON.stringify({ tras_borrar: a1.v, tras_escribir: a2.v }));

    // ── BORRAR TODO: VACÍO, Y SIGUE VACÍO TRAS BLUR ──────────────────────
    await put(page, cap.sel, '1000');
    await page.click(full); await page.waitForTimeout(60);
    await page.keyboard.press('End');
    for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace');
    const cleared = await read(page, cap.sel);
    await page.evaluate(`document.querySelector(${JSON.stringify(full)}).blur()`);
    await page.waitForTimeout(120);
    const afterBlur = await read(page, cap.sel);
    ok(`${tag} borrar todo deja vacío, y el blur no resucita el valor ni fuerza 0`,
      cleared.v === '' && afterBlur.v === '', JSON.stringify({ tras_borrar: cleared.v, tras_blur: afterBlur.v }));

    // ── UN DÍGITO EN MEDIO, SIN SALTOS DE CURSOR ─────────────────────────
    await put(page, cap.sel, '1234');
    await page.click(full); await page.waitForTimeout(60);
    await page.evaluate(`(function(){ var el=document.querySelector(${JSON.stringify(full)}); el.setSelectionRange(2,2); return true; })()`);
    await page.keyboard.press('Backspace');
    await page.keyboard.type('9');
    const mid = await read(page, cap.sel);
    ok(`${tag} cambiar un dígito intermedio respeta el cursor (1234 → 1934)`,
      mid.v === '1934', JSON.stringify({ resultado: mid.v }));

    // ── SELECCIONAR UN RANGO Y SUSTITUIRLO ───────────────────────────────
    await put(page, cap.sel, '1234');
    await page.click(full); await page.waitForTimeout(60);
    await page.evaluate(`(function(){ var el=document.querySelector(${JSON.stringify(full)}); el.setSelectionRange(1,3); return true; })()`);
    await page.keyboard.type('55');
    const range = await read(page, cap.sel);
    ok(`${tag} seleccionar un rango y escribir encima lo sustituye (1234 → 1554)`,
      range.v === '1554', JSON.stringify({ resultado: range.v }));

    // ── PEGAR DE VERDAD ──────────────────────────────────────────────────
    await put(page, cap.sel, '');
    await page.click(full); await page.waitForTimeout(60);
    // `insertText` es la ruta de pegado del navegador: pasa por beforeinput.
    await page.keyboard.insertText('2500');
    const pasted = await read(page, cap.sel);
    ok(`${tag} pegar un importe lo deja tal cual y mantiene el foco`,
      pasted.v === '2500' && pasted.focused === true, JSON.stringify(pasted));

    // ── DECIMAL LOCAL Y CEROS ────────────────────────────────────────────
    await put(page, cap.sel, '');
    await page.click(full); await page.waitForTimeout(60);
    await page.keyboard.type('3,5');
    const dec = await read(page, cap.sel);
    ok(`${tag} el decimal local se escribe entero, sin reescribirlo a cada tecla`,
      dec.v === '3,5' && dec.focused === true, JSON.stringify(dec));
    await put(page, cap.sel, '');
    await page.click(full); await page.waitForTimeout(60);
    await page.keyboard.type('0');
    const zero = await read(page, cap.sel);
    ok(`${tag} un cero escrito se conserva como cero`, zero.v === '0', JSON.stringify(zero));

    // ── EL FOCO SOBREVIVE AL RECÁLCULO ───────────────────────────────────
    await put(page, cap.sel, '');
    await page.click(full); await page.waitForTimeout(60);
    await page.keyboard.type('12345');
    await page.waitForTimeout(200);
    const still = await read(page, cap.sel);
    ok(`${tag} el campo conserva foco y cursor mientras la superficie recalcula`,
      still.focused === true && still.v === '12345' && still.s === 5, JSON.stringify(still));

    // ── MÓVIL: TAMAÑO Y TECLADO ──────────────────────────────────────────
    ok(`${tag} input ≥16 px y teclado numérico en móvil`,
      still.font >= 16 && still.im === 'decimal', JSON.stringify({ px: still.font, inputmode: still.im }));
  }

  // ── EL GUARD QUE CAUSÓ EL P0, EN SU FORMA GENERAL ────────────────────────
  // No basta con que los ocho campos vayan bien hoy: lo que rompió fue un
  // manejador GLOBAL que cancelaba teclas de edición. Se comprueba la regla.
  {
    await openCap(page, CAPS[0]);
    const full = '#aurixWorkspace ' + CAPS[0].sel;
    await put(page, CAPS[0].sel, '1000');
    await page.click(full); await page.waitForTimeout(60);
    const notPrevented = await page.evaluate(`(function(){
      var el = document.querySelector(${JSON.stringify(full)});
      var ev = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      return !ev.defaultPrevented; })()`);
    ok(`${ENG}.global · ningún manejador global cancela Backspace dentro de un campo`,
      notPrevented === true, 'defaultPrevented sobre un input enfocado');
    const selectAllOk = await page.evaluate(`(function(){
      var el = document.querySelector(${JSON.stringify(full)});
      var ev = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      return !ev.defaultPrevented; })()`);
    ok(`${ENG}.global · tampoco secuestra «seleccionar todo» dentro de un campo`,
      selectAllOk === true, 'Ctrl/Cmd+A cancelado');
    // Y fuera de un campo, los atajos de la hoja legacy siguen siendo suyos: el
    // arreglo no puede desactivarlos, sólo dejar de pisar la escritura.
    const outsideStillOwned = await page.evaluate(`(function(){
      var body = document.getElementById('aurixWorkspace');
      var ev = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
      body.dispatchEvent(ev);
      return ev.defaultPrevented; })()`);
    ok(`${ENG}.global · fuera de un campo, el atajo de la hoja legacy sigue vivo`,
      outsideStillOwned === true, 'el arreglo no debe desactivar la hoja, sólo dejar de pisar la escritura');
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
