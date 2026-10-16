// AURIX — CIERRE DE LISTADOS CON BOLSA · sonda focal.
// La app (bytes del repo) habla con el HANDLER REAL de /api/prices/snapshot del mismo repo, ejecutado en
// este proceso contra los proveedores reales: así se prueban juntos servidor y cliente sin desplegar.
// Alta real · guardado · recarga · actualización de cartera · valoración · vista previa de Market.
// Cartera SINTÉTICA local (nunca cuentas reales).
//   node --experimental-default-type=module scripts/aurix-listing-quote-probe.mjs
//   (ROOT=… y API_ROOT=… para ejecutarla sobre otra versión, p. ej. el worktree de v839)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = process.env.ROOT || HERE;
const API_ROOT = process.env.API_ROOT || ROOT;
const BASE = process.env.BASE || '';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
function serve(root) {
  const s = createServer(async (req, res) => { try { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = normalize(join(root, p)); let b = await readFile(f); if (f.endsWith('app.js')) b = Buffer.from(String(b).replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;').replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0')); res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }).end(b); } catch (_) { res.writeHead(404).end(); } });
  return new Promise(r => s.listen(0, '127.0.0.1', () => r({ s, url: `http://127.0.0.1:${s.address().port}/index.html` })));
}
async function snapHandler(apiRoot) {
  const { default: h } = await import(join(apiRoot, 'api/prices/snapshot.js') + '?v=' + Math.random());
  return async (symbols) => {
    const out = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } };
    await h({ method: 'GET', headers: { origin: 'https://app.aurixsystem.io' }, query: { symbols } }, out);
    return { status: out.statusCode, body: JSON.stringify(out.body || {}) };
  };
}
const { chromium, webkit } = await import('/tmp/aurix-pw/node_modules/playwright/index.mjs');
let pass = 0, fail = 0, skip = 0; const fails = [];
const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d === undefined ? '' : '  ' + String(d).slice(0, 300))); console.log('  ✗', n, d === undefined ? '' : String(d).slice(0, 300)); } };

async function page(browser, root, snap, { w = 1440, h = 900, lang = 'es', assets = [] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800 });
  const p = await ctx.newPage(); const errs = []; const served = [];
  p.on('pageerror', e => { if (!/access control checks|Load failed|Failed to fetch/.test(e.message)) errs.push(e.message); });
  await p.addInitScript(`try{ localStorage.setItem('portfolio_lang', ${JSON.stringify(lang)}); if(!sessionStorage.getItem('__s')){ localStorage.setItem('aurix_assets', ${JSON.stringify(JSON.stringify(assets))}); localStorage.setItem('portfolio_assets', ${JSON.stringify(JSON.stringify(assets))}); sessionStorage.setItem('__s','1'); } }catch(_){}`);
  await p.route(/isa-portfolio-ten\.vercel\.app\/api\//, async route => {
    const u = route.request().url();
    try {
      if (/\/api\/prices\/snapshot/.test(u)) {
        const symbols = decodeURIComponent((u.split('symbols=')[1] || '').split('&')[0]);
        const r = await snap(symbols); served.push([symbols, r.body.slice(0, 400)]);
        return route.fulfill({ status: r.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: r.body });
      }
      const r = await fetch(u, { headers: { Origin: 'https://app.aurixsystem.io', Accept: 'application/json' } });
      route.fulfill({ status: r.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: await r.text() });
    } catch (_) { route.abort(); }
  });
  const setup = async () => {
    await p.waitForFunction("typeof _openAddAssetWithFund==='function' && typeof _AURIX_ENT_CANON!=='undefined'", null, { timeout: 60000 });
    await p.waitForTimeout(800);
    await p.evaluate(`(function(){ try{_aurixCancelLoginRedirect('p');_aurixMarkSessionConfirmed();}catch(_){} var bl=document.getElementById('bootLoader'); if(bl) bl.remove(); var ar=document.getElementById('appRoot'); if(ar) ar.style.opacity='1'; })()`);
    // Como al arrancar la app: el tipo de cambio ya está pedido antes de operar (CAD entra por el motor FX).
    await p.evaluate(`(async function(){ try { await _aurixFxRefresh(); } catch(_){} })()`);
  };
  await p.goto(root.url, { waitUntil: 'domcontentloaded' }); await setup();
  const ev = s => p.evaluate(s);
  const rows = () => ev(`JSON.stringify(assets.map(function(a){ return { s: a.marketSymbol, t: a.type, ccy: a.assetCurrency || 'USD', px: a.price, q: a.qty, cb: Math.round(a.costBasis || 0), val: Math.round(assetValueUSD(a) * 100) / 100, n: (a.transactions || []).length }; }))`).then(JSON.parse);
  // Alta REAL: la selección dispara la consulta de precio de la app (resolveSymbolQuote → /snapshot).
  const add = async sel => {
    await ev(`_openAddAssetWithFund(${JSON.stringify(sel)})`);
    await p.waitForFunction(() => (typeof pendingPrice !== 'undefined' && pendingPrice > 0) || /error|no/i.test((document.getElementById('lookupStatus') || {}).className || ''), null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(600);
    const pend = JSON.parse(await ev(`JSON.stringify({ px: typeof pendingPrice !== 'undefined' ? pendingPrice : null, ccy: typeof pendingCurrency !== 'undefined' ? pendingCurrency : null })`));
    await ev(`(function(){ qtyInput.value='2'; qtyInput.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await ev(`assetForm.requestSubmit()`); await p.waitForTimeout(700);
    try { await ev(`(function(){ var o=document.getElementById('modalOverlay'); if (o && o.classList.contains('open') && typeof closeModal==='function') closeModal(); })()`); } catch (_) {}
    return pend;
  };
  const refresh = async () => { await ev(`refreshPrices()`); await p.waitForTimeout(5000); };
  const reload = async () => { await p.reload({ waitUntil: 'domcontentloaded' }); await setup(); await p.waitForTimeout(1200); };
  return { ctx, p, errs, ev, rows, add, refresh, reload, served };
}
const SEL = {
  MSFT: { ticker: 'MSFT', name: 'Microsoft Corporation', type: 'stock', marketSymbol: 'MSFT' },
  'MSFT.TO': { ticker: 'MSFT.TO', name: 'Microsoft Corporation', type: 'stock', marketSymbol: 'MSFT.TO' },
  'AAPL.TO': { ticker: 'AAPL.TO', name: 'Apple Inc.', type: 'stock', marketSymbol: 'AAPL.TO' },
  'IWDA.AS': { ticker: 'IWDA.AS', name: 'iShares Core MSCI World UCITS ETF', type: 'etf', marketSymbol: 'IWDA.AS' },
};

async function run(ENG, browser, root, snap, lang) {
  const T = `${ENG}.${lang}`;
  const P = await page(browser, root, snap, { lang });
  // Lo que el servidor sirve para cada listado (identidad exacta)
  const truth = {};
  const direct = JSON.parse((await snap(Object.keys(SEL).join(','))).body).snapshot || [];
  for (const k of Object.keys(SEL)) truth[k] = direct.find(x => String(x.requested).toUpperCase() === k) || null;
  ok(`${T} servidor: cada listado servido por SU identidad (proveedor = símbolo pedido)`, Object.keys(SEL).every(k => truth[k] && String(truth[k].providerId).toUpperCase() === k), JSON.stringify(truth));
  const pend = {};
  for (const k of Object.keys(SEL)) pend[k] = await P.add(SEL[k]);
  let r = await P.rows();
  const by = s => r.find(x => x.s === s);
  for (const k of Object.keys(SEL)) {
    ok(`${T} alta ${k}: precio y moneda de SU listado (${truth[k] && truth[k].price} ${truth[k] && truth[k].currency})`, by(k) && truth[k] && by(k).px === truth[k].price && by(k).ccy === String(truth[k].currency).toUpperCase(), JSON.stringify({ row: by(k), pend: pend[k] }));
  }
  ok(`${T} MSFT.TO y AAPL.TO no llevan el precio de NASDAQ`, by('MSFT.TO').px !== by('MSFT').px && by('AAPL.TO').ccy !== 'USD', JSON.stringify([by('MSFT'), by('MSFT.TO'), by('AAPL.TO')]));
  const before = JSON.stringify(r.map(x => [x.s, x.ccy, x.q, x.cb, x.n]));
  await P.refresh(); r = await P.rows();
  ok(`${T} actualización: cada posición conserva su listado y moneda`, Object.keys(SEL).every(k => by(k) && by(k).ccy === String(truth[k].currency).toUpperCase() && Math.abs(by(k).px - truth[k].price) / truth[k].price < 0.05), JSON.stringify(r));
  await P.reload(); await P.refresh(); r = await P.rows();
  ok(`${T} guardar + recargar + actualizar: mismas posiciones, cantidades, coste e historial`, JSON.stringify(r.map(x => [x.s, x.ccy, x.q, x.cb, x.n])) === before, JSON.stringify(r));
  // Valoración: en una moneda que cubre el motor de cambio (AURIX-FX-1: USD·EUR·GBP·CHF·JPY) el valor
  // es cantidad × precio de SU listado; en otra (CAD) la política EXISTENTE es «no cubierto» (NaN →
  // null): la posición sigue visible, nunca 0, nunca un cambio inventado ni el precio de otro listado.
  // Cierre de moneda: CAD entra por el motor FX (CADUSD=X), así que también se valora convertida.
  const FX = { USD: 1, EUR: 1, GBP: 1, CHF: 1, JPY: 1, CAD: 1 };
  ok(`${T} valoración: monedas cubiertas = cantidad × precio de su listado; CAD «no cubierto» (no 0, no precio ajeno)`, r.every(x => FX[x.ccy] ? (Number.isFinite(x.val) && x.val > 0) : (x.val === null && x.q > 0 && x.px > 0)), JSON.stringify(r));
  const total = await P.ev('Math.round(totalValueBase() * 100) / 100');
  const covered = Math.round(r.filter(x => FX[x.ccy]).reduce((a, x) => a + x.val, 0) * 100) / 100;
  ok(`${T} total = suma de las posiciones cubiertas (la no cubierta no entra como 0 ni con precio ajeno)`, Number.isFinite(total) && Math.abs(total - covered) < 0.05, JSON.stringify({ total, covered }));   // suma de valores ya redondeados
  ok(`${T} sin errores de página`, !P.errs.length, P.errs.join(' | '));
  await P.ctx.close();
}

// Un servidor que todavía RECORTA el sufijo (v839): el cliente nuevo no puede aceptar el listado ajeno.
async function runLegacy(browser, root, legacySnap) {
  const MSFT_TO_CAD = { id: 'a_to', type: 'stock', ticker: 'MSFT.TO', marketSymbol: 'MSFT.TO', name: 'Microsoft Corporation', qty: 3, price: 36.5, costBasis: 100, assetCurrency: 'CAD', transactions: [{ type: 'buy', qty: 3, price: 33, ts: 1 }] };
  const P = await page(browser, root, legacySnap, { assets: [MSFT_TO_CAD] });
  const pend = await P.add(SEL['AAPL.TO']);
  let r = await P.rows();
  ok('LEGACY alta AAPL.TO con un servidor que sirve AAPL: no hay cotización exacta → no nace con el precio de NASDAQ', !r.some(x => x.s === 'AAPL.TO' && x.px === 343.46) && !(pend.px > 0 && pend.ccy === 'USD'), JSON.stringify({ r, pend }));
  await P.refresh(); r = await P.rows();
  const to = r.find(x => x.s === 'MSFT.TO');
  ok('LEGACY actualización de MSFT.TO con un servidor que sirve MSFT: conserva su último precio (36,5 CAD), nunca el de NASDAQ', to && to.px === 36.5 && to.ccy === 'CAD', JSON.stringify(to));
  ok('LEGACY la posición sin cotización exacta sigue visible (no desaparece ni pasa a 0)', to && to.q === 3 && to.px > 0, JSON.stringify(to));
  await P.ctx.close();
}

// Moneda: una cotización exacta en otra moneda que la de la posición no se aplica.
async function runCcy(browser, root, snap) {
  const MSFT_TO_USD = { id: 'a_to', type: 'stock', ticker: 'MSFT.TO', marketSymbol: 'MSFT.TO', name: 'Microsoft Corporation', qty: 2, price: 529.05, costBasis: 1000, assetCurrency: 'USD', transactions: [{ type: 'buy', qty: 2, price: 500, ts: 1 }] };
  const P = await page(browser, root, snap, { assets: [MSFT_TO_USD] });
  await P.refresh(); const r = await P.rows();
  const to = r.find(x => x.s === 'MSFT.TO');
  ok('MONEDA una cotización en CAD no se aplica a una posición declarada en USD (no se mezclan monedas)', to && to.ccy === 'USD' && to.px === 529.05, JSON.stringify(to));
  await P.ctx.close();
}

// Vista previa de Market sin cotización: «—» con su significado accesible.
async function runPreview(browser, root, snap) {
  const P = await page(browser, root, snap, { lang: 'es' });
  await P.ev(`_aurixMktOpenSymbol('ZZZZ.TO', { symbol: 'ZZZZ.TO', ticker: 'ZZZZ.TO', marketSymbol: 'ZZZZ.TO', type: 'stock', name: 'Sin cotización QA', _fromSearch: true })`);
  await P.p.waitForTimeout(800);
  const v = await P.ev(`(function(){ var e=document.getElementById('mktPrvPrice'); return e ? JSON.stringify({ txt: e.textContent, sr: !!e.querySelector('.intcc-sr-only') }) : 'null'; })()`);
  const o = JSON.parse(v);
  ok('PREVIEW sin cotización: «—» y «Cotización no disponible» accesible', o && /^—/.test(o.txt) && o.sr && /Cotización no disponible/.test(o.txt), v);
  await P.ev(`_aurixMktClose()`);
  await P.ctx.close();
}

async function invariants(browser, snapNew) {
  if (!BASE) { skip++; console.log('  · SKIP invariantes (sin BASE)'); return; }
  const A = [{ id: 'a1', type: 'stock', ticker: 'MSFT', marketSymbol: 'MSFT', name: 'Microsoft', qty: 10, price: 400, costBasis: 3000, assetCurrency: 'USD', transactions: [{ type: 'buy', qty: 10, price: 300, ts: 1 }] },
             { id: 'a2', type: 'etf', ticker: 'IWDA.AS', marketSymbol: 'IWDA.AS', name: 'iShares MSCI World', qty: 20, price: 100, costBasis: 1800, assetCurrency: 'EUR', transactions: [{ type: 'buy', qty: 20, price: 90, ts: 3 }] }];
  const snapBase = await snapHandler(BASE);
  const take = async (root, snap) => { const P = await page(browser, root, snap, { assets: A }); await P.refresh();
    const v = await P.ev(`JSON.stringify({ a: assets.map(function(a){ return [a.id, a.qty, a.costBasis, a.assetCurrency, a.price, JSON.stringify(a.transactions || [])]; }), total: Math.round(totalValueBase() * 100) / 100,
      ws: [JSON.stringify(calculateMonthlyBudget({ currency:'EUR', rows:[{id:'s',type:'income',label:'N',amount:'2400'},{id:'r',type:'expense',label:'A',amount:'900'}] })), JSON.stringify(calculateLoan({ principal:'180000', rate:'3,25', years:'30', fees:'0', insurance:'0' })).length, JSON.stringify(calculateTradeJournal([{id:'t',asset:'N',atype:'stock',buy:90,sell:119,qty:20,fee:5,currency:'EUR'}]))] })`);
    await P.ctx.close(); return JSON.parse(v); };
  const b = await serve(BASE), c = await serve(ROOT);
  const B = await take(b, snapBase), C = await take(c, snapNew); b.s.close(); c.s.close();
  ok('INV listados canónicos (MSFT, IWDA.AS): mismos precios, cantidades, coste, moneda e historial que v839', JSON.stringify(B.a) === JSON.stringify(C.a), JSON.stringify([B.a, C.a]).slice(0, 300));
  ok('INV mismo valor total', B.total === C.total, `${B.total} vs ${C.total}`);
  ok('INV Workspace: cálculos idénticos', JSON.stringify(B.ws) === JSON.stringify(C.ws));
}

const root = await serve(ROOT);
const snapNew = await snapHandler(API_ROOT);
const cr = await chromium.launch();
for (const lang of ['es', 'en']) { try { await run('CR', cr, root, snapNew, lang); } catch (e) { ok(`CR.${lang} sin excepción`, false, e.message); } }
if (BASE) { try { await runLegacy(cr, root, await snapHandler(BASE)); } catch (e) { ok('legacy sin excepción', false, e.message); } }
try { await runCcy(cr, root, snapNew); } catch (e) { ok('moneda sin excepción', false, e.message); }
try { await runPreview(cr, root, snapNew); } catch (e) { ok('preview sin excepción', false, e.message); }
try { await invariants(cr, snapNew); } catch (e) { ok('invariantes sin excepción', false, e.message); }
await cr.close();
const wk = await webkit.launch();
for (const lang of ['es', 'en']) { try { await run('WK', wk, root, snapNew, lang); } catch (e) { ok(`WK.${lang} sin excepción`, false, e.message); } }
await wk.close();
root.s.close();
console.log(`\n${pass} passed, ${fail} failed${skip ? `, ${skip} skipped` : ''}`);
if (fails.length) { console.log('FAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); }
process.exit(fail ? 1 : 0);
