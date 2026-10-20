// AURIX · LOTE 1 P0 — TRANSICIÓN DEL DESPLIEGUE: cliente antiguo (≤ v851) y nuevo sobre la MISMA cartera.
// Una pestaña que aún ejecuta el app.js anterior divide entre 100, a ciegas, todo precio de operación
// > 100.000 y guarda. Esta sonda ejecuta los DOS clientes reales:
//   1. cliente NUEVO: alta real por el formulario de una compra legítima a 700.000 (BRK.A);
//   2. cliente ANTIGUO (árbol de OLD_REF, por defecto 3d7b546 = v851) abre esa cartera, repinta y guarda;
//   3. cliente NUEVO abre lo que guardó el antiguo → el precio y el coste vuelven a ser los escritos,
//      y el legado sin marca se sigue corrigiendo como en producción.
// Uso: git worktree add /tmp/aurix-v851 3d7b546 && OLD_ROOT=/tmp/aurix-v851 node scripts/aurix-numeric-transition-probe.mjs
// Carteras SINTÉTICAS: nunca datos de un usuario real.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { ROOT, chromium, webkit, page } from './_ffn-lib.mjs';

const OLD_ROOT = process.env.OLD_ROOT || '/tmp/aurix-v851';
if (!existsSync(join(OLD_ROOT, 'app.js'))) { console.error('✗ Falta el árbol antiguo en ' + OLD_ROOT + ' (git worktree add ' + OLD_ROOT + ' 3d7b546)'); process.exit(2); }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
// Mismo servidor que _ffn-lib (incluidos sus dos parches de redirección), pero con raíz elegible.
async function serveAt(root) {
  const s = createServer(async (req, res) => { try { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = normalize(join(root, p)); let b = await readFile(f); if (f.endsWith('app.js')) b = Buffer.from(String(b).replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;').replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0')); res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(b); } catch { res.writeHead(404); res.end(); } });
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  return { s, url: `http://127.0.0.1:${s.address().port}/index.html` };
}

let pass = 0; const fails = [];
const ok = (n, c, info) => { if (c) pass++; else { fails.push(n); console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };
const NEW = await serveAt(ROOT), OLD = await serveAt(OLD_ROOT);
const LEGACY = { id: 'a_old', type: 'stock', ticker: 'OLD', marketSymbol: 'OLD', name: 'Legado', qty: 1, price: 2446.77, costBasis: 244677, assetCurrency: 'USD', transactions: [{ type: 'buy', qty: 1, price: 244677, ts: 3 }] };
const BRK = { ticker: 'BRK-A', name: 'Berkshire Hathaway A', type: 'stock', marketSymbol: 'BRK-A', assetCurrency: 'USD' };
const snapshot = ev => ev(`JSON.stringify(assets)`).then(JSON.parse);
const brk = list => list.find(a => a.ticker === 'BRK-A');

for (const [ENG, L] of [['CR', chromium], ['WK', webkit]]) {
  const browser = await L.launch();
  for (const lang of ['es', 'en']) {
    const T = `${ENG}.${lang}`;
    // 1 · cliente nuevo: alta real
    const A = await page(browser, NEW.url, { w: 1440, lang, assets: [LEGACY] });
    ok(`${T} 1 el nuevo sirve el contrato nuevo`, await A.ev(`typeof _aurixLegacyClippedPrice === 'function'`));
    await A.ev(`_openAddAssetWithFund(${JSON.stringify(BRK)})`); await A.p.waitForTimeout(450);
    await A.ev(`pendingPrice = 720000; pendingCurrency = 'USD';`);
    await A.p.fill('#assetQty', ''); await A.p.click('#assetQty'); await A.p.keyboard.type('1');
    await A.p.fill('#assetPurchasePrice', ''); await A.p.click('#assetPurchasePrice'); await A.p.keyboard.type('700000');
    await A.ev(`assetForm.requestSubmit()`); await A.p.waitForTimeout(400); await A.ev(`render(true); save();`);
    const fromNew = await snapshot(A.ev);
    const t1 = brk(fromNew).transactions[0];
    ok(`${T} 1 nuevo: compra 700000 con marca y precio escrito`, t1.price === 700000 && t1.pv === 2 && t1.pvPrice === 700000, JSON.stringify(t1));
    await A.ctx.close();
    // 2 · cliente antiguo: abre esa cartera, repinta y guarda
    const B = await page(browser, OLD.url, { w: 1440, lang, assets: fromNew });
    ok(`${T} 2 el antiguo es de verdad el cliente anterior`, await B.ev(`typeof _aurixLegacyClippedPrice === 'undefined' && typeof sanitizeTransactionPrices === 'function'`));
    await B.ev(`render(true); render(true); save();`); await B.p.waitForTimeout(300);
    const fromOld = await snapshot(B.ev);
    const t2 = brk(fromOld).transactions[0];
    ok(`${T} 2 antiguo: recorta a 7000 y conserva la marca y pvPrice (el riesgo, reproducido)`, t2.price === 7000 && t2.pv === 2 && t2.pvPrice === 700000, JSON.stringify(t2));
    ok(`${T} 2 antiguo: lo persiste (holdings en localStorage)`, await B.ev(`(localStorage.getItem('aurix_holdings') || '').indexOf('"pvPrice":700000') >= 0`));
    await B.ctx.close();
    // 3 · cliente nuevo: abre lo que guardó el antiguo
    const C = await page(browser, NEW.url, { w: 1440, lang, assets: fromOld });
    await C.ev(`render(true);`);
    const back = await snapshot(C.ev);
    const b = brk(back), t3 = b.transactions[0];
    ok(`${T} 3 nuevo: precio restituido a 700000`, t3.price === 700000, JSON.stringify(t3));
    ok(`${T} 3 nuevo: coste de la posición restituido a 700000`, b.costBasis === 700000, String(b.costBasis));
    ok(`${T} 3 legado sin marca: 2446.77 como en v851`, back.find(a => a.id === 'a_old').transactions[0].price === 2446.77);
    await C.ev(`save();`);
    ok(`${T} 3 nuevo: el guardado siguiente persiste el precio restituido`, await C.ev(`JSON.parse(localStorage.getItem('aurix_holdings') || '[]').some(h => (h.transactions || []).some(t => t.pv === 2 && t.price === 700000))`));
    ok(`${T} sin errores de página`, A.errs.length === 0 && C.errs.length === 0, [...A.errs, ...C.errs].slice(0, 3).join(' | '));
    await C.ctx.close();
  }
  await browser.close();
}
NEW.s.close(); OLD.s.close();
console.log(`\n${pass} passed · ${fails.length} failed`);
console.log(fails.length ? 'RESULT: FAIL' : 'RESULT: PASS');
process.exit(fails.length ? 1 : 0);
