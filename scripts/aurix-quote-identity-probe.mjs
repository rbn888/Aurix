// AURIX — P1 IDENTIDAD DE COTIZACIONES EN MARKET · sonda focal.
// 1) El juez `_aurixMktQuoteMatches` con respuestas del contrato de /api/prices/snapshot (servidor nuevo
//    con `requested`/`providerId` y servidor anterior sin ellos).
// 2) La pestaña Market de punta a punta con respuestas FIXTURE del contrato (búsqueda real del proxy):
//    ninguna fila recibe la cotización de otro instrumento; precio, 24H, gráfico y vista previa coherentes;
//    la ordenación por precio no trata «—» como cero.
// 3) Datos REALES del servidor desplegado: ningún precio cruzado entre instrumentos con el mismo símbolo.
// 4) Invariantes de cartera frente a la base (BASE=worktree v838): Market es lo único que cambia.
//   node scripts/aurix-quote-identity-probe.mjs        (ROOT=… para ejecutar sobre otra versión)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || '';
const API = 'https://isa-portfolio-ten.vercel.app';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
function serve(root) {
  const s = createServer(async (req, res) => { try { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = normalize(join(root, p)); let b = await readFile(f); if (f.endsWith('app.js')) b = Buffer.from(String(b).replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;').replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0')); res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }).end(b); } catch (_) { res.writeHead(404).end(); } });
  return new Promise(r => s.listen(0, '127.0.0.1', () => r({ s, url: `http://127.0.0.1:${s.address().port}/index.html` })));
}
const { chromium, webkit } = await import('/tmp/aurix-pw/node_modules/playwright/index.mjs');
let pass = 0, fail = 0, skip = 0; const fails = [];
const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d === undefined ? '' : '  ' + String(d).slice(0, 300))); console.log('  ✗', n, d === undefined ? '' : String(d).slice(0, 300)); } };

// Contrato del servidor NUEVO (fixture): cada símbolo pedido devuelve `requested` y la identidad del
// proveedor que lo sirvió, con la MISMA resolución que el servidor real (recorta el sufijo de bolsa
// hacia su entrada canónica; «USDC» es la cripto usd-coin). Precios sintéticos y distintos por
// instrumento para detectar cualquier cruce.
const REG = {
  USDC: { symbol: 'USDC', assetType: 'crypto', providerId: 'usd-coin', price: 0.9997, change24h: 0.02 },
  MSFT: { symbol: 'MSFT', assetType: 'stock', providerId: 'MSFT', price: 529.05, change24h: -1.93 },
  AAPL: { symbol: 'AAPL', assetType: 'stock', providerId: 'AAPL', price: 343.46, change24h: 0.43 },
  'IWDA.AS': { symbol: 'IWDA', assetType: 'etf', providerId: 'IWDA.AS', price: 130.55, change24h: -0.12 },
};
function fixtureSnapshot(url, legacy) {
  const syms = decodeURIComponent((url.split('symbols=')[1] || '').split('&')[0]).split(',').filter(Boolean);
  const snapshot = [];
  for (const raw of syms) {
    const up = raw.toUpperCase();
    let e = REG[up] || REG[up.replace(/\.[A-Z]{1,3}$/, '')];
    if (!e && /^[A-Z0-9.\-^=]{1,24}$/.test(up)) e = { symbol: up, assetType: /\.[A-Z]{1,3}$/.test(up) ? 'etf' : 'stock', providerId: up, price: 10 + (up.length * 3.7), change24h: 1.5 };
    if (!e) continue;
    const o = { symbol: e.symbol, assetType: e.assetType, price: e.price, currency: 'USD', change24h: e.change24h, timestamp: Date.now(), source: e.assetType === 'crypto' ? 'coingecko' : 'yahoo', stale: false, confidence: 1 };
    if (!legacy) { o.requested = raw; o.providerId = e.providerId; }
    snapshot.push(o);
  }
  return JSON.stringify({ generatedAt: Date.now(), partial: false, snapshot });
}

async function page(browser, root, { w = 1440, h = 900, lang = 'es', snap = 'fixture' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800 });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => { if (!/access control checks|Load failed|Failed to fetch/.test(e.message)) errs.push(e.message); });
  await p.addInitScript(`try{ localStorage.setItem('portfolio_lang', ${JSON.stringify(lang)}); }catch(_){}`);
  await p.route(/isa-portfolio-ten\.vercel\.app\/api\//, async route => {
    const u = route.request().url();
    try {
      if (/\/api\/prices\/snapshot/.test(u) && snap !== 'real') return route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: fixtureSnapshot(u, snap === 'legacy') });
      const r = await fetch(u, { headers: { Origin: 'https://app.aurixsystem.io', Accept: 'application/json' } });
      route.fulfill({ status: r.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: await r.text() });
    } catch (_) { route.abort(); }
  });
  await p.goto(root.url, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction("typeof _aurixMktOpenSymbol==='function' && typeof _AURIX_ENT_CANON!=='undefined'", null, { timeout: 60000 });
  await p.waitForTimeout(700);
  await p.evaluate(`(function(){ try{_aurixCancelLoginRedirect('p');_aurixMarkSessionConfirmed();}catch(_){} var bl=document.getElementById('bootLoader'); if(bl) bl.remove(); var ar=document.getElementById('appRoot'); if(ar) ar.style.opacity='1'; })()`);
  const ev = s => p.evaluate(s);
  return { ctx, p, errs, ev };
}
async function marketRows(P, q) {
  const once = async () => {
    const inp = P.p.locator('#marketSearchInput'); await inp.fill(''); await inp.fill(q);
    await P.p.waitForFunction(() => document.querySelectorAll('#marketList .market-row').length > 2, null, { timeout: 20000 }).catch(() => {});
    await P.p.waitForTimeout(2500);
    return P.p.evaluate(() => [...document.querySelectorAll('#marketList .market-row')].map(r => {
      const pr = r.querySelector('.col-price'), ch = r.querySelector('.col-change'), cc = r.querySelector('.col-chart');
      const txt = el => el ? [...el.childNodes].filter(n => !(n.classList && n.classList.contains('intcc-sr-only'))).map(n => n.textContent).join('').trim() : '';
      return { n: (r.querySelector('.mkt-id-name') || {}).textContent || '', tk: ((r.querySelector('.mkt-id-meta') || {}).textContent || '').split('·')[0].trim(),
        meta: (r.querySelector('.mkt-id-meta') || {}).textContent || '', price: txt(pr), chg: txt(ch), sr: !!(r.querySelector('.col-chart .intcc-sr-only')),   // «Cotización no disponible» vive en la celda del gráfico vacía
        chart: cc ? cc.className : '', key: cc ? (cc.getAttribute('data-spark-key') || '') : '' };
    }));
  };
  let r = await once();
  if (!r.some(x => /Cripto|Crypto|Token/.test(x.meta))) { await P.p.waitForTimeout(2500); await P.ev(`try{ _mktDiscCache.clear(); }catch(_){}`); r = await once(); }
  return r;
}
const num = s => { const m = String(s || '').replace(/[^\d.,-]/g, ''); if (!m) return null; const v = Number(m.replace(/,/g, '')); return Number.isFinite(v) ? v : null; };

async function unit(browser, root) {
  const P = await page(browser, root);
  const J = s => P.ev(`JSON.stringify(${s})`).then(JSON.parse);
  const has = await P.ev(`typeof _aurixMktQuoteMatches === 'function'`);
  if (!has) { ok('U0 existe un juez de identidad de cotización', false, 'no hay _aurixMktQuoteMatches'); await P.ctx.close(); return; }
  const cases = [
    ['USD Coin (crypto · usd-coin) ← USDC crypto usd-coin', { type: 'crypto', coinId: 'usd-coin', symbol: 'USDC' }, { requested: 'USDC', symbol: 'USDC', assetType: 'crypto', providerId: 'usd-coin' }, 'USDC', true],
    ['USDATA (acción, ticker USDC) ← USDC crypto', { type: 'stock', symbol: 'USDC', marketSymbol: 'USDC' }, { requested: 'USDC', symbol: 'USDC', assetType: 'crypto', providerId: 'usd-coin' }, 'USDC', false],
    ['USDC bridged (otro coinId) ← USDC usd-coin', { type: 'crypto', coinId: 'bridged-usdc-base', symbol: 'USDC' }, { requested: 'USDC', symbol: 'USDC', assetType: 'crypto', providerId: 'usd-coin' }, 'USDC', false],
    ['MSFT NASDAQ ← MSFT', { type: 'stock', symbol: 'MSFT', marketSymbol: 'MSFT' }, { requested: 'MSFT', symbol: 'MSFT', assetType: 'stock', providerId: 'MSFT' }, 'MSFT', true],
    ['MSFT.TO ← entrada canónica MSFT (recortada)', { type: 'stock', symbol: 'MSFT.TO', marketSymbol: 'MSFT.TO' }, { requested: 'MSFT.TO', symbol: 'MSFT', assetType: 'stock', providerId: 'MSFT' }, 'MSFT.TO', false],
    ['MSFT.NE ← entrada canónica MSFT', { type: 'stock', symbol: 'MSFT.NE', marketSymbol: 'MSFT.NE' }, { requested: 'MSFT.NE', symbol: 'MSFT', assetType: 'stock', providerId: 'MSFT' }, 'MSFT.NE', false],
    ['Apple (Backpack) cripto ← AAPL acción', { type: 'crypto', coinId: 'apple-backpack-securities', symbol: 'AAPL' }, { requested: 'AAPL', symbol: 'AAPL', assetType: 'stock', providerId: 'AAPL' }, 'AAPL', false],
    ['ETF frente a cotización de acción con el mismo símbolo: familia valor (permitido sólo con símbolo exacto)', { type: 'etf', symbol: 'IWDA.AS', marketSymbol: 'IWDA.AS' }, { requested: 'IWDA.AS', symbol: 'IWDA', assetType: 'etf', providerId: 'IWDA.AS' }, 'IWDA.AS', true],
    ['servidor anterior · MSFT exacto', { type: 'stock', symbol: 'MSFT', marketSymbol: 'MSFT' }, { symbol: 'MSFT', assetType: 'stock' }, 'MSFT', true],
    ['servidor anterior · MSFT.TO ← MSFT', { type: 'stock', symbol: 'MSFT.TO', marketSymbol: 'MSFT.TO' }, { symbol: 'MSFT', assetType: 'stock' }, 'MSFT.TO', false],
    ['servidor anterior · cripto sin id del proveedor → no demostrable', { type: 'crypto', coinId: 'usd-coin', symbol: 'USDC' }, { symbol: 'USDC', assetType: 'crypto' }, 'USDC', false],
    ['cripto sin coinId en la fila → no demostrable', { type: 'crypto', symbol: 'BTC' }, { requested: 'BTC', symbol: 'BTC', assetType: 'crypto', providerId: 'bitcoin' }, 'BTC', false],
    ['petición distinta a la respuesta', { type: 'stock', symbol: 'MSFT', marketSymbol: 'MSFT' }, { requested: 'MSFT.TO', symbol: 'MSFT', assetType: 'stock', providerId: 'MSFT' }, 'MSFT', false],
    ['metal por su símbolo exacto', { type: 'metal', symbol: 'XAU/USD', marketSymbol: 'XAU/USD' }, { requested: 'XAU/USD', symbol: 'XAU/USD', assetType: 'commodity', providerId: 'XAU/USD' }, 'XAU/USD', true],
  ];
  for (const [n, it, hit, req, want] of cases) ok(`U ${n} → ${want ? 'suya' : '«—»'}`, (await J(`_aurixMktQuoteMatches(${JSON.stringify(it)}, ${JSON.stringify(hit)}, ${JSON.stringify(req)})`)) === want);
  await P.ctx.close();
}

async function e2e(ENG, browser, root, w, lang, snap) {
  const T = `${ENG}.${w}.${lang}.${snap}`;
  const P = await page(browser, root, { w, h: w < 800 ? 844 : 900, lang, snap });
  await P.ev(`switchTab('market')`); await P.p.waitForTimeout(1200);
  const find = (rows, pred) => rows.find(pred) || null;
  const usdc = await marketRows(P, 'USDC');
  const coin = find(usdc, r => r.tk === 'USDC' && /^(USD Coin|USDC)$/.test(r.n)), usdata = find(usdc, r => /USDATA/i.test(r.n));
  const bridged = usdc.filter(r => /bridged/i.test(r.n));
  if (snap === 'fixture') ok(`${T} USD Coin conserva SU precio (0,9997)`, coin && num(coin.price) === 0.9997, JSON.stringify(coin));
  else ok(`${T} servidor anterior: USD Coin no demostrable → «—» (nunca un precio ajeno)`, coin && coin.price === '—', JSON.stringify(coin));
  ok(`${T} USDATA NO recibe el precio de USD Coin («—»)`, usdata && usdata.price === '—' && usdata.chg === '—' && usdata.sr, JSON.stringify(usdata));
  ok(`${T} versiones bridged no heredan el precio raíz`, bridged.length > 0 && bridged.every(r => r.price === '—'), JSON.stringify(bridged.slice(0, 2)));
  ok(`${T} sin cotización: sin gráfico ni tendencia`, [usdata, ...bridged].filter(Boolean).every(r => /col-chart--none/.test(r.chart) && !r.key), JSON.stringify(usdata));
  const ms = await marketRows(P, 'MSFT');
  const m = find(ms, r => r.tk === 'MSFT'), mto = find(ms, r => r.tk === 'MSFT.TO'), mne = find(ms, r => r.tk === 'MSFT.NE');
  ok(`${T} MSFT NASDAQ conserva su precio y 24H de la MISMA cotización`, m && num(m.price) === 529.05 && /1[.,]93/.test(m.chg), JSON.stringify(m));
  ok(`${T} MSFT.TO y MSFT.NE no reciben el precio de NASDAQ`, (!mto || (mto.price === '—' && mto.chg === '—')) && (!mne || (mne.price === '—' && mne.chg === '—')), JSON.stringify([mto, mne]));
  ok(`${T} MSFT.TO tiene clave de histórico propia (no comparte gráfico con MSFT)`, !mto || mto.key !== m.key, JSON.stringify([m && m.key, mto && mto.key]));
  const tokM = ms.filter(r => /Token derivado|Derivative token/.test(r.meta));
  ok(`${T} tokens de Microsoft: sin el precio de la acción`, tokM.every(r => num(r.price) !== 529.05), JSON.stringify(tokM.slice(0, 2)));
  for (const q of ['apple', 'AAPL']) {
    const ap = await marketRows(P, q);
    const inc = find(ap, r => r.tk === 'AAPL' && /^Apple Inc\.?$/.test(r.n)), bp = ap.filter(r => r.tk === 'AAPL' && /Backpack|Robinhood|Dinari/i.test(r.n));
    ok(`${T} ${q}: Apple NASDAQ conserva su precio`, inc && num(inc.price) === 343.46, JSON.stringify(inc));
    ok(`${T} ${q}: los tokens «AAPL» no heredan el precio ni el gráfico de la acción`, bp.every(r => num(r.price) !== 343.46 && r.key !== inc.key), JSON.stringify(bp.slice(0, 2)));
    const ato = find(ap, r => r.tk === 'AAPL.TO');
    ok(`${T} ${q}: AAPL.TO no recibe el precio de NASDAQ`, !ato || num(ato.price) !== 343.46, JSON.stringify(ato));
  }
  // la vista previa coincide con la fila abierta (MSFT.TO sin cotización)
  if (mto) {
    await P.ev(`(function(){ var r=[].slice.call(document.querySelectorAll('#marketList .market-row')); })()`);
    const ms2 = await marketRows(P, 'MSFT');
    const rowsEl = P.p.locator('#marketList .market-row'); const n = await rowsEl.count();
    for (let i = 0; i < n; i++) { const tk = await rowsEl.nth(i).locator('.mkt-id-meta').textContent(); if (/^MSFT\.TO/.test(tk.trim())) { await rowsEl.nth(i).click(); break; } }
    await P.p.waitForTimeout(900);
    const head = await P.ev(`(function(){ var o=document.getElementById('marketPreviewOverlay'); if(!o||!o.classList.contains('open')) return null; var t=o.textContent; return { has529: /529[.,]05/.test(t), sym: (_aurixMktItem||{}).marketSymbol || (_aurixMktItem||{}).symbol }; })()`);
    ok(`${T} vista previa de MSFT.TO: no muestra el precio de MSFT`, head && !head.has529 && /MSFT\.TO/.test(head.sym || ''), JSON.stringify(head));
    await P.ev(`try{ _aurixMktClose(); }catch(_){}`); void ms2;
  }
  // ordenación por precio: «—» al final, nunca como cero
  await P.ev(`_aurixMktSortBy='price'; renderCurrentMarketView()`); await P.p.waitForTimeout(600);
  const sorted = await P.p.evaluate(() => [...document.querySelectorAll('#marketList .market-row .col-price')].map(c => [...c.childNodes].filter(n => !(n.classList && n.classList.contains('intcc-sr-only'))).map(n => n.textContent).join('').trim()));
  const firstDash = sorted.indexOf('—');
  ok(`${T} ordenar por precio: «—» al final, ninguna cifra después`, firstDash === -1 || sorted.slice(firstDash).every(x => x === '—'), JSON.stringify(sorted.slice(0, 12)));
  ok(`${T} sin errores de página`, !P.errs.length, P.errs.join(' | '));
  await P.ctx.close();
}

async function realData(browser, root) {
  const P = await page(browser, root, { snap: 'real' });
  await P.ev(`switchTab('market')`); await P.p.waitForTimeout(1200);
  const usdc = await marketRows(P, 'USDC');
  if (usdc.length < 3) { skip++; console.log('  · SKIP datos reales (sin red)'); await P.ctx.close(); return; }
  const coin = usdc.find(r => r.tk === 'USDC' && /^(USD Coin|USDC)$/.test(r.n)), usdata = usdc.find(r => /USDATA/i.test(r.n));
  ok('REAL USDATA nunca muestra el precio de USD Coin', !usdata || usdata.price === '—' || !coin || coin.price === '—' || num(usdata.price) !== num(coin.price), JSON.stringify([coin, usdata]));
  const ms = await marketRows(P, 'MSFT');
  const m = ms.find(r => r.tk === 'MSFT');
  ok('REAL MSFT.TO / MSFT.NE nunca muestran la cotización de MSFT NASDAQ', ms.filter(r => /^MSFT\.(TO|NE)$/.test(r.tk)).every(r => r.price === '—' || num(r.price) !== num(m && m.price)), JSON.stringify(ms.slice(0, 3)));
  const ap = await marketRows(P, 'apple');
  const inc = ap.find(r => r.tk === 'AAPL' && /^Apple Inc\.?$/.test(r.n));
  ok('REAL los tokens «AAPL» nunca muestran la cotización de la acción', ap.filter(r => r.tk === 'AAPL' && r !== inc).every(r => r.price === '—' || num(r.price) !== num(inc && inc.price)), JSON.stringify(ap.filter(r => r.tk === 'AAPL').slice(0, 3)));
  ok('REAL sin errores de página', !P.errs.length, P.errs.join(' | '));
  await P.ctx.close();
}

async function invariants(browser) {
  if (!BASE) { skip++; console.log('  · SKIP invariantes (sin BASE)'); return; }
  const A = [{ id: 'a1', type: 'stock', ticker: 'MSFT', marketSymbol: 'MSFT', name: 'Microsoft', qty: 10, price: 400, costBasis: 3000, assetCurrency: 'USD', transactions: [{ type: 'buy', qty: 10, price: 300, ts: 1 }] },
             { id: 'a2', type: 'crypto', ticker: 'BTC', marketSymbol: 'BTC', coinId: 'bitcoin', name: 'Bitcoin', qty: 0.5, price: 60000, costBasis: 20000, assetCurrency: 'USD', transactions: [{ type: 'buy', qty: 0.5, price: 40000, ts: 2 }] },
             { id: 'a3', type: 'etf', ticker: 'IWDA.AS', marketSymbol: 'IWDA.AS', name: 'iShares MSCI World', qty: 20, price: 100, costBasis: 1800, assetCurrency: 'EUR', transactions: [{ type: 'buy', qty: 20, price: 90, ts: 3 }] }];
  const snap = async r => { const P = await page(browser, r, { snap: 'fixture' });
    await P.ev(`localStorage.setItem('aurix_assets', ${JSON.stringify(JSON.stringify(A))}); localStorage.setItem('portfolio_assets', ${JSON.stringify(JSON.stringify(A))});`);
    await P.p.reload({ waitUntil: 'domcontentloaded' }); await P.p.waitForFunction("typeof totalValueBase==='function'", null, { timeout: 60000 }); await P.p.waitForTimeout(1500);
    const v = await P.ev(`JSON.stringify({ a: assets.map(function(a){ return [a.id, a.qty, a.costBasis, a.assetCurrency, JSON.stringify(a.transactions||[])]; }), total: totalValueBase() })`); await P.ctx.close(); return v; };
  const b = await serve(BASE), c = await serve(ROOT);
  const vb = await snap(b), vc = await snap(c); b.s.close(); c.s.close();
  const B = JSON.parse(vb), C = JSON.parse(vc);
  ok('INV cartera: mismos activos, cantidades, coste, moneda e historial', JSON.stringify(B.a) === JSON.stringify(C.a), vc.slice(0, 160));
  ok('INV cartera: misma valoración total con las mismas cotizaciones', B.total === C.total, `${B.total} vs ${C.total}`);
}

const root = await serve(ROOT);
const cr = await chromium.launch();
try { await unit(cr, root); } catch (e) { ok('unidad sin excepción', false, e.message); }
for (const [w, lang] of [[1440, 'es'], [390, 'en']]) { try { await e2e('CR', cr, root, w, lang, 'fixture'); } catch (e) { ok(`CR.${w}.${lang} sin excepción`, false, e.message); } }
try { await e2e('CR', cr, root, 1440, 'es', 'legacy'); } catch (e) { ok('CR legacy sin excepción', false, e.message); }
try { await realData(cr, root); } catch (e) { ok('datos reales sin excepción', false, e.message); }
try { await invariants(cr); } catch (e) { ok('invariantes sin excepción', false, e.message); }
await cr.close();
const wk = await webkit.launch();
for (const [w, lang] of [[390, 'es'], [1440, 'en']]) { try { await e2e('WK', wk, root, w, lang, 'fixture'); } catch (e) { ok(`WK.${w}.${lang} sin excepción`, false, e.message); } }
await wk.close();
root.s.close();
console.log(`\n${pass} passed, ${fail} failed${skip ? `, ${skip} skipped` : ''}`);
if (fails.length) { console.log('FAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); }
process.exit(fail ? 1 : 0);
