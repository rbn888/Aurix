// AURIX — CIERRE DE MONEDA Y VALORACIÓN · sonda focal.
// Datos REALES de la API desplegada (identidad exacta de listado de v840) · cartera SINTÉTICA local.
// 1) Market (filas y vista previa): cada precio en la moneda REAL de su cotización, nunca «$» genérico.
// 2) CAD por el motor FX existente: una posición MSFT.TO entra CONVERTIDA en el patrimonio total.
// 3) Una moneda que el motor no cubre: el alta se bloquea ANTES de guardar, con el motivo.
// 4) Invariantes frente a la base (BASE=worktree v840): MSFT, IWDA.AS y Workspace intactos.
//   node scripts/aurix-currency-valuation-probe.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || '';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
function serve(root) {
  const s = createServer(async (req, res) => { try { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = normalize(join(root, p)); let b = await readFile(f); if (f.endsWith('app.js')) b = Buffer.from(String(b).replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;').replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0')); res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }).end(b); } catch (_) { res.writeHead(404).end(); } });
  return new Promise(r => s.listen(0, '127.0.0.1', () => r({ s, url: `http://127.0.0.1:${s.address().port}/index.html` })));
}
const { chromium, webkit } = await import('/tmp/aurix-pw/node_modules/playwright/index.mjs');
let pass = 0, fail = 0, skip = 0; const fails = [];
const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d === undefined ? '' : '  ' + String(d).slice(0, 300))); console.log('  ✗', n, d === undefined ? '' : String(d).slice(0, 300)); } };

async function page(browser, root, { w = 1440, h = 900, lang = 'es', assets = [], hkd = false, noCad = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800 });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => { if (!/access control checks|Load failed|Failed to fetch/.test(e.message)) errs.push(e.message); });
  await p.addInitScript(`try{ localStorage.setItem('portfolio_lang', ${JSON.stringify(lang)}); if(!sessionStorage.getItem('__s')){ localStorage.removeItem('aurix_fx_rates_v1'); localStorage.setItem('aurix_assets', ${JSON.stringify(JSON.stringify(assets))}); localStorage.setItem('portfolio_assets', ${JSON.stringify(JSON.stringify(assets))}); sessionStorage.setItem('__s','1'); } }catch(_){}`);
  await p.route(/isa-portfolio-ten\.vercel\.app\/api\//, async route => {
    const u = route.request().url();
    try {
      const r = await fetch(u, { headers: { Origin: 'https://app.aurixsystem.io', Accept: 'application/json' } });
      let body = await r.text();
      // Moneda que el motor FX NO cubre (HKD): la cotización exacta de un listado de Hong Kong.
      // Sin tipo CAD (el proveedor no lo entrega en este arranque y nunca se obtuvo antes).
      if (noCad && /\/api\/prices\/snapshot/.test(u)) { try { const j = JSON.parse(body); j.snapshot = (j.snapshot || []).filter(x => x.symbol !== 'CADUSD=X'); body = JSON.stringify(j); } catch (_) {} }
      if (hkd && /\/api\/prices\/snapshot/.test(u) && /0700\.HK/.test(decodeURIComponent(u))) body = JSON.stringify({ snapshot: [{ requested: '0700.HK', symbol: '0700.HK', assetType: 'stock', providerId: '0700.HK', price: 512.5, currency: 'HKD', change24h: 0.4, timestamp: Date.now(), source: 'yahoo', stale: false, confidence: 1 }] });
      route.fulfill({ status: r.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body });
    } catch (_) { route.abort(); }
  });
  const setup = async () => {
    await p.waitForFunction("typeof _openAddAssetWithFund==='function' && typeof _AURIX_ENT_CANON!=='undefined'", null, { timeout: 60000 });
    await p.waitForTimeout(900);
    await p.evaluate(`(function(){ try{_aurixCancelLoginRedirect('p');_aurixMarkSessionConfirmed();}catch(_){} var bl=document.getElementById('bootLoader'); if(bl) bl.remove(); var ar=document.getElementById('appRoot'); if(ar) ar.style.opacity='1'; })()`);
    await p.evaluate(`(async function(){ try { await _aurixFxRefresh(); } catch(_){} })()`);
  };
  await p.goto(root.url, { waitUntil: 'domcontentloaded' }); await setup();
  const ev = s => p.evaluate(s);
  const rows = () => ev(`JSON.stringify(assets.map(function(a){ var v = assetValueUSD(a); return { s: a.marketSymbol, ccy: a.assetCurrency || 'USD', px: a.price, q: a.qty, cb: Math.round(a.costBasis || 0), val: Number.isFinite(v) ? Math.round(v * 100) / 100 : null, n: (a.transactions || []).length }; }))`).then(JSON.parse);
  const add = async sel => {
    await ev(`_openAddAssetWithFund(${JSON.stringify(sel)})`);
    await p.waitForFunction(() => (typeof pendingPrice !== 'undefined' && pendingPrice > 0), null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(500);
    await ev(`(function(){ qtyInput.value='2'; qtyInput.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await ev(`assetForm.requestSubmit()`); await p.waitForTimeout(700);
    const status = await ev(`(document.getElementById('lookupStatus') || {}).textContent || ''`);
    try { await ev(`(function(){ var o=document.getElementById('modalOverlay'); if (o && o.classList.contains('open') && typeof closeModal==='function') closeModal(); })()`); } catch (_) {}
    return status;
  };
  return { ctx, p, errs, ev, rows, add };
}
async function marketRows(P, q) {
  const once = async () => {
    const inp = P.p.locator('#marketSearchInput'); await inp.fill(''); await inp.fill(q);
    await P.p.waitForFunction(() => document.querySelectorAll('#marketList .market-row').length > 2, null, { timeout: 20000 }).catch(() => {});
    await P.p.waitForTimeout(2600);
    return P.p.evaluate(() => [...document.querySelectorAll('#marketList .market-row')].map(r => ({ n: (r.querySelector('.mkt-id-name') || {}).textContent || '',
      tk: ((r.querySelector('.mkt-id-meta') || {}).textContent || '').split('·')[0].trim(), price: ((r.querySelector('.col-price') || {}).textContent || '').trim(),
      key: (r.querySelector('.col-chart') || { getAttribute: () => '' }).getAttribute('data-spark-key') || '' })));
  };
  let r = await once(); if (r.length < 3) { await P.p.waitForTimeout(2500); await P.ev(`try{ _mktDiscCache.clear(); }catch(_){}`); r = await once(); }
  return r;
}
const num = s => { const m = String(s || '').replace(/[^\d.,-]/g, ''); if (!m) return null; const v = Number(m.replace(/,/g, '')); return Number.isFinite(v) ? v : null; };

async function marketFormat(ENG, browser, root, w, lang) {
  const T = `${ENG}.${w}.${lang}`;
  const P = await page(browser, root, { w, h: w < 800 ? 844 : 900, lang });
  await P.ev(`switchTab('market')`); await P.p.waitForTimeout(1200);
  const ms = await marketRows(P, 'MSFT');
  const m = ms.find(r => r.tk === 'MSFT'), mto = ms.find(r => r.tk === 'MSFT.TO');
  ok(`${T} MSFT en USD con «US$», nunca «$» genérico`, m && /^US\$\d/.test(m.price), JSON.stringify(m));
  ok(`${T} MSFT.TO en su moneda real (CAD) con «CA$»`, mto && /^CA\$\d/.test(mto.price), JSON.stringify(mto));
  ok(`${T} MSFT.TO no hereda precio ni minigráfico de MSFT`, mto && m && num(mto.price) !== num(m.price) && mto.key !== m.key, JSON.stringify([m, mto]));
  const ap = await marketRows(P, 'apple');
  const ato = ap.find(r => r.tk === 'AAPL.TO'), apc = ap.find(r => r.tk === 'APC.DE');
  ok(`${T} AAPL.TO en CAD («CA$»)`, !ato || /^CA\$\d/.test(ato.price), JSON.stringify(ato));
  ok(`${T} APC.DE en EUR («€»), sin convertir como si fuera USD`, !apc || /^€\d/.test(apc.price), JSON.stringify(apc));
  const nowhere = [...ms, ...ap].filter(r => /^\$/.test(r.price));
  ok(`${T} ninguna fila con «$» genérico`, nowhere.length === 0, JSON.stringify(nowhere.slice(0, 3)));
  // Vista previa: la misma moneda que la fila abierta
  const rowsEl = P.p.locator('#marketList .market-row'); const n = await rowsEl.count();
  for (let i = 0; i < n; i++) { const tk = (await rowsEl.nth(i).locator('.mkt-id-meta').textContent()).trim(); if (/^APC\.DE/.test(tk)) { await rowsEl.nth(i).click(); break; } }
  await P.p.waitForTimeout(1000);
  const pv = await P.ev(`(function(){ var e=document.getElementById('mktPrvPrice'); return e ? e.textContent.trim() : ''; })()`);
  ok(`${T} vista previa de APC.DE: el mismo precio en «€» que su fila`, !apc || (pv === apc.price), JSON.stringify({ pv, row: apc && apc.price }));
  await P.ev(`try{ _aurixMktClose(); }catch(_){}`);
  ok(`${T} sin errores de página`, !P.errs.length, P.errs.join(' | '));
  await P.ctx.close();
}

async function valuation(ENG, browser, root, lang) {
  const T = `${ENG}.${lang}`;
  const P = await page(browser, root, { lang });
  const stTO = await P.add({ ticker: 'MSFT.TO', name: 'Microsoft Corporation', type: 'stock', marketSymbol: 'MSFT.TO' });
  await P.add({ ticker: 'MSFT', name: 'Microsoft Corporation', type: 'stock', marketSymbol: 'MSFT' });
  await P.add({ ticker: 'IWDA.AS', name: 'iShares Core MSCI World UCITS ETF', type: 'etf', marketSymbol: 'IWDA.AS' });
  const r = await P.rows(); const to = r.find(x => x.s === 'MSFT.TO');
  const cad = await P.ev(`JSON.stringify(_aurixFxLookup('CAD'))`).then(JSON.parse);
  ok(`${T} CAD por el motor FX existente: tipo vivo de CADUSD=X`, cad && cad.status === 'live' && cad.rate > 0.5 && cad.rate < 1, JSON.stringify(cad));
  ok(`${T} MSFT.TO: identidad y moneda CAD exactas, y valor CONVERTIDO (precio × cantidad × CADUSD)`, to && to.ccy === 'CAD' && to.val != null && Math.abs(to.val - to.px * to.q * cad.rate) < 0.02, JSON.stringify({ to, cad, stTO }));
  const total = await P.ev('Math.round(totalValueUSD() * 100) / 100');
  const sum = Math.round(r.reduce((a, x) => a + (x.val || 0), 0) * 100) / 100;
  ok(`${T} total patrimonial = suma de las tres posiciones (CAD incluida, ninguna excluida)`, r.every(x => x.val != null) && Math.abs(total - sum) < 0.05, JSON.stringify({ total, sum, r }));
  ok(`${T} sin errores de página`, !P.errs.length, P.errs.join(' | '));
  await P.ctx.close();
  // Moneda que el motor no cubre → alta bloqueada antes de guardar
  const Q = await page(browser, root, { lang, hkd: true });
  const st = await Q.add({ ticker: '0700.HK', name: 'Tencent Holdings', type: 'stock', marketSymbol: '0700.HK' });
  const rr = await Q.rows();
  ok(`${T} HKD (no cubierta por el motor FX): el alta se bloquea antes de guardar, con el motivo`, !rr.some(x => x.s === '0700.HK') && (lang === 'en' ? /not yet supported in the total valuation/ : /todavía no es compatible con la valoración total/).test(st), JSON.stringify({ st, rr }));
  await Q.ctx.close();
  // Sin tipo CAD real (ni vivo ni conocido): nunca un tipo inventado → el alta CAD se bloquea.
  const Z = await page(browser, root, { lang, noCad: true });
  const cz = await Z.ev(`JSON.stringify(_aurixFxLookup('CAD'))`).then(JSON.parse);
  const sz = await Z.add({ ticker: 'MSFT.TO', name: 'Microsoft Corporation', type: 'stock', marketSymbol: 'MSFT.TO' });
  const rz = await Z.rows();
  ok(`${T} sin tipo CAD real: desconocido (nunca un fijo inventado) y alta MSFT.TO bloqueada con el motivo`, cz.rate === null && cz.status === 'unknown' && !rz.some(x => x.s === 'MSFT.TO') && (lang === 'en' ? /Fetching the exchange rate/ : /Obteniendo el tipo de cambio/).test(sz), JSON.stringify({ cz, sz, rz }));   // moneda CON par: se pide el tipo y se dice que se reintente
  await Z.ctx.close();
}

async function invariants(browser) {
  if (!BASE) { skip++; console.log('  · SKIP invariantes (sin BASE)'); return; }
  const A = [{ id: 'a1', type: 'stock', ticker: 'MSFT', marketSymbol: 'MSFT', name: 'Microsoft', qty: 10, price: 400, costBasis: 3000, assetCurrency: 'USD', transactions: [{ type: 'buy', qty: 10, price: 300, ts: 1 }] },
             { id: 'a2', type: 'etf', ticker: 'IWDA.AS', marketSymbol: 'IWDA.AS', name: 'iShares MSCI World', qty: 20, price: 100, costBasis: 1800, assetCurrency: 'EUR', transactions: [{ type: 'buy', qty: 20, price: 90, ts: 3 }] }];
  const take = async root => { const P = await page(browser, root, { assets: A }); await P.ev(`refreshPrices()`); await P.p.waitForTimeout(5000);
    const v = await P.ev(`JSON.stringify({ a: assets.map(function(a){ return [a.id, a.qty, a.costBasis, a.assetCurrency, a.price, JSON.stringify(a.transactions || [])]; }), total: Math.round(totalValueBase() * 100) / 100, pl: Math.round((typeof totalPnLBase === 'function' ? totalPnLBase() : 0) * 100) / 100,
      ws: [JSON.stringify(calculateMonthlyBudget({ currency:'EUR', rows:[{id:'s',type:'income',label:'N',amount:'2400'},{id:'r',type:'expense',label:'A',amount:'900'}] })), JSON.stringify(calculateLoan({ principal:'180000', rate:'3,25', years:'30', fees:'0', insurance:'0' })).length, JSON.stringify(calculateTradeJournal([{id:'t',asset:'N',atype:'stock',buy:90,sell:119,qty:20,fee:5,currency:'EUR'}]))] })`);
    await P.ctx.close(); return JSON.parse(v); };
  const b = await serve(BASE), c = await serve(ROOT);
  const B = await take(b), C = await take(c); b.s.close(); c.s.close();
  ok('INV MSFT e IWDA.AS: mismos precios, cantidades, coste, moneda e historial que v840', JSON.stringify(B.a) === JSON.stringify(C.a), JSON.stringify([B.a, C.a]).slice(0, 300));
  ok('INV mismo patrimonio total y P&L', B.total === C.total && B.pl === C.pl, JSON.stringify({ B: [B.total, B.pl], C: [C.total, C.pl] }));
  ok('INV Workspace: cálculos idénticos', JSON.stringify(B.ws) === JSON.stringify(C.ws));
}

const root = await serve(ROOT);
const cr = await chromium.launch();
for (const [w, lang] of [[1440, 'es'], [390, 'en']]) { try { await marketFormat('CR', cr, root, w, lang); } catch (e) { ok(`CR.${w}.${lang} formato sin excepción`, false, e.message); } }
for (const lang of ['es', 'en']) { try { await valuation('CR', cr, root, lang); } catch (e) { ok(`CR.${lang} valoración sin excepción`, false, e.message); } }
try { await invariants(cr); } catch (e) { ok('invariantes sin excepción', false, e.message); }
await cr.close();
const wk = await webkit.launch();
for (const [w, lang] of [[390, 'es'], [1440, 'en']]) { try { await marketFormat('WK', wk, root, w, lang); } catch (e) { ok(`WK.${w}.${lang} formato sin excepción`, false, e.message); } }
try { await valuation('WK', wk, root, 'en'); } catch (e) { ok('WK valoración sin excepción', false, e.message); }
await wk.close();
root.s.close();
console.log(`\n${pass} passed, ${fail} failed${skip ? `, ${skip} skipped` : ''}`);
if (fails.length) { console.log('FAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); }
process.exit(fail ? 1 : 0);
