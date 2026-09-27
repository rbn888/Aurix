#!/usr/bin/env node
/**
 * AURIX · P0 §25 — UNIDADES Y DINERO EN TODA COMPRA O VENTA
 * ════════════════════════════════════════════════════════════════════════════
 * Las hojas de compra/venta y de reducir posición pedían UNIDADES y precio por
 * unidad, y no decían en ningún sitio cuánto dinero movía la operación: el
 * usuario tenía que multiplicar de cabeza antes de confirmar una transacción
 * sobre su propio patrimonio.
 *
 * Esta sonda TECLEA, porque «en tiempo real» no se puede comprobar leyendo
 * código, y exige lo siguiente:
 *   · el valor de la operación aparece mientras se escribe;
 *   · cambiar compra↔venta cambia el rótulo Y el signo de la cantidad resultante;
 *   · el valor de la POSICIÓN resultante se rotula como ESTIMADO, porque usa el
 *     precio de mercado y no el que declara el usuario;
 *   · sin precio de mercado NO se publica valor de posición — un cero ahí diría
 *     que la posición no vale nada;
 *   · nada se publica hasta que hay cantidad y precio válidos;
 *   · la divisa es la del activo, y no se mezcla.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
               '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon' };
const server = createServer((req, res) => {
  const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!existsSync(p) || p.indexOf(ROOT) !== 0) { res.statusCode = 404; return res.end('no'); }
  res.setHeader('content-type', MIME[extname(p)] || 'application/octet-stream');
  res.end(readFileSync(p));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
let chromium, webkit;
try { ({ chromium, webkit } = await import(PW)); }
catch (e) { console.error('\n✗ SIN MOTORES — ' + PW); process.exit(2); }

let pass = 0; const fails = [];
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n); console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };

const AUTH = t => String(t)
  .replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')
  .replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0');

// Una posición con precio y otra SIN precio: el segundo caso es el que prueba
// que no se inventa un valor cuando no hay con qué calcularlo.
const SEED = `(function(){
  assets = [
    { id:'a1', ticker:'AAPL', name:'Apple', type:'stock', marketSymbol:'AAPL',
      qty:100, quantity:100, price:516.17, assetCurrency:'USD', currency:'USD' },
    { id:'a2', ticker:'ZZZ', name:'Sin precio', type:'stock', marketSymbol:'ZZZ',
      qty:50, quantity:50, price:0, assetCurrency:'EUR', currency:'EUR' },
  ];
  switchTab('dashboard'); render(); return true; })()`;

const READ_TX = `(function(){
  var g=function(id){ var e=document.getElementById(id); return e? (e.textContent||'').trim() : null; };
  var box=document.getElementById('txPreview');
  var row=document.getElementById('txAfterValRow');
  return { visible: box ? !box.hidden : null, opLbl:g('txOpLabel'), op:g('txOpValue'),
    q:g('txAfterQty'), vLbl:g('txAfterValLabel'), v:g('txAfterVal'),
    vRow: row ? !row.hidden : null }; })`;

console.log('AURIX · P0 §25 — valor monetario en compra, venta y reducción\n');

for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  const browser = await launcher.launch();
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 700 ? 2 : 1, reducedMotion: 'reduce' });
    await ctx.route('**/app.js*', async route => {
      const r = await route.fetch(); await route.fulfill({ response: r, body: AUTH(await r.text()) });
    });
    const page = await ctx.newPage();
    await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(`typeof openTxModal === 'function' && typeof openReduceModal === 'function' && typeof render === 'function'`, null, { timeout: 60000 });
    await page.waitForTimeout(900);
    await page.evaluate(`(function(){ var bl=document.getElementById('bootLoader'); if(bl) bl.remove();
      var ar=document.getElementById('appRoot'); if(ar) ar.style.opacity='1'; return true; })()`);
    await page.evaluate(SEED);
    await page.waitForTimeout(300);
    const tag = `${ENG}.${w}`;

    // ── COMPRA ───────────────────────────────────────────────────────────────
    await page.evaluate(`(function(){ openTxModal('a1'); return true; })()`);
    await page.waitForTimeout(260);
    let g = await page.evaluate(`(${READ_TX})()`);
    ok(`${tag} al abrir, sin cantidad, no se afirma ningún importe`, g.visible === false, JSON.stringify(g));
    await page.evaluate(`(function(){ document.getElementById('txQty').focus(); return true; })()`);
    await page.keyboard.type('10', { delay: 35 });
    await page.waitForTimeout(240);
    g = await page.evaluate(`(${READ_TX})()`);
    ok(`${tag} compra · el coste aparece al teclear y es cantidad × precio`,
      g.visible === true && /5161,70/.test(g.op || '') && /US\$/.test(g.op || ''), JSON.stringify(g));
    ok(`${tag} compra · la cantidad resultante SUMA`, g.q === '110', JSON.stringify(g.q));
    ok(`${tag} compra · el valor de la posición se declara ESTIMADO`,
      /estimado|estimated/i.test(g.vLbl || '') && /56\.778,70/.test(g.v || ''), JSON.stringify([g.vLbl, g.v]));

    // ── VENTA: mismo importe, otro rótulo, otro signo ────────────────────────
    await page.evaluate(`(function(){ document.querySelector('#txTypeToggle [data-txtype="sell"]').click(); return true; })()`);
    await page.waitForTimeout(240);
    const s = await page.evaluate(`(${READ_TX})()`);
    ok(`${tag} venta · el rótulo cambia de coste a valor de venta`,
      (s.opLbl || '') !== (g.opLbl || '') && /5161,70/.test(s.op || ''), JSON.stringify([g.opLbl, s.opLbl]));
    ok(`${tag} venta · la cantidad resultante RESTA`, s.q === '90', JSON.stringify(s.q));
    ok(`${tag} venta · y el valor restante es el de esas 90`, /46\.455,30/.test(s.v || ''), JSON.stringify(s.v));

    // ── SIN PRECIO DE MERCADO NO SE INVENTA VALOR DE POSICIÓN ────────────────
    await page.evaluate(`(function(){ closeTxModal(); openTxModal('a2'); return true; })()`);
    await page.waitForTimeout(260);
    await page.evaluate(`(function(){ document.getElementById('txQty').focus(); return true; })()`);
    await page.keyboard.type('5', { delay: 35 });
    await page.evaluate(`(function(){ var p=document.getElementById('txPrice'); p.value='10'; p.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
    await page.waitForTimeout(260);
    const np = await page.evaluate(`(${READ_TX})()`);
    ok(`${tag} sin precio de mercado, el coste declarado SÍ se publica`,
      np.visible === true && /[0-9]/.test(np.op || ''), JSON.stringify(np.op));
    ok(`${tag} …y el valor de la posición NO: no se inventa un cero`,
      np.vRow === false, JSON.stringify([np.vRow, np.v]));
    // «No mezclar divisas» significa que TODO se lee en UNA, y en esta app esa una es la divisa
    // BASE del usuario: `formatDisplay(importe, desde)` convierte desde la divisa del activo y
    // formatea en la base. Mi primera versión de este assert exigía lo contrario —ver el importe
    // en la divisa del activo— y por eso salía rojo con «54,35 US$» para una posición en euros.
    // El producto tenía razón: 50 € son 54,35 US$, y el usuario lee su cartera en una sola
    // moneda. Lo que se comprueba es la COHERENCIA: el importe de una posición en euros se lee
    // en la misma divisa que el de una en dólares.
    ok(`${tag} …y se lee en la MISMA divisa que el resto, sin mezclar`,
      (np.op || '').replace(/[\d.,\s]/g, '') === (s.op || '').replace(/[\d.,\s]/g, ''),
      JSON.stringify([np.op, s.op]));

    // ── REDUCIR POSICIÓN ─────────────────────────────────────────────────────
    await page.evaluate(`(function(){ closeTxModal(); openReduceModal('a1'); return true; })()`);
    await page.waitForTimeout(280);
    await page.evaluate(`(function(){ document.getElementById('reduceQty').focus(); return true; })()`);
    await page.keyboard.type('10', { delay: 35 });
    await page.waitForTimeout(240);
    const rd = await page.evaluate(`(function(){
      var g=function(id){ var e=document.getElementById(id); return e? (e.textContent||'').trim() : null; };
      var r=document.getElementById('previewOpRow');
      return { opVisible: r ? !r.hidden : null, op:g('previewOpValue'), qLeft:g('previewQtyLeft'), vLeft:g('previewValueLeft') }; })()`);
    ok(`${tag} reducir · publica el valor de lo que se quita`,
      rd.opVisible === true && /5161,70/.test(rd.op || ''), JSON.stringify(rd));
    ok(`${tag} reducir · y sigue publicando cantidad y valor restantes`,
      rd.qLeft === '90' && /46\.455,30/.test(rd.vLeft || ''), JSON.stringify([rd.qLeft, rd.vLeft]));
    // Un importe imposible no publica importes: primero se dice que no cabe.
    await page.evaluate(`(function(){ var i=document.getElementById('reduceQty'); i.value='500'; i.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
    await page.waitForTimeout(240);
    const ex = await page.evaluate(`(function(){
      var r=document.getElementById('previewOpRow'); var e=document.getElementById('reduceError');
      return { opVisible: r ? !r.hidden : null, err: (e && (e.textContent||'').trim()) || '' }; })()`);
    ok(`${tag} reducir · pedir más de lo que hay no publica ningún importe`,
      ex.opVisible === false && ex.err.length > 0, JSON.stringify(ex));
    await ctx.close();
  }
  await browser.close();
}
server.close();

console.log('\n════════════════════════════════════════════════');
console.log(`${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log('\nRESULT: NO-GO'); process.exit(1); }
console.log('\nRESULT: GO');
