// AURIX — P1 IDENTIDAD DE ACTIVOS · sonda focal única.
// Alta REAL (formulario de alta, `assetForm`) sobre los bytes del repo en local, carteras SINTÉTICAS,
// matriz Chromium+WebKit · ES+EN · 390+1440 · Premium+Free · cuenta vacía y cartera poblada.
// La búsqueda (casos 7–11) usa los datos REALES del proxy vía Node; sin red se declara SKIP.
// Invariantes: misma cartera cargada (activos, cantidades, coste, historial y valor) que en la base.
//   node scripts/aurix-asset-identity-probe.mjs            (BASE=/ruta/a/worktree-v836 para invariantes)
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

const TOK = { id: 'a_tok', type: 'crypto', ticker: 'MSFT', marketSymbol: 'MSFT', coinId: 'microsoft-robinhood-tokenized-stock', name: 'Microsoft • Robinhood Token', qty: 2, price: 400, costBasis: 700, assetCurrency: 'USD', transactions: [{ type: 'buy', qty: 2, price: 350, ts: 1 }] };
const BRK = { id: 'a_brk', type: 'stock', ticker: 'BRK-B', marketSymbol: 'BRK-B', name: 'Berkshire Hathaway Inc.', qty: 1, price: 450, costBasis: 400, assetCurrency: 'USD', transactions: [{ type: 'buy', qty: 1, price: 400, ts: 2 }] };
const OLDBTC = { id: 'a_oldbtc', type: 'crypto', ticker: 'BTC', marketSymbol: 'BTC', name: 'Bitcoin', qty: 0.1, price: 60000, costBasis: 5000, assetCurrency: 'USD', transactions: [{ type: 'buy', qty: 0.1, price: 50000, ts: 3 }] };
const SAN = { id: 'a_san', type: 'stock', ticker: 'SAN', marketSymbol: 'SAN.MC', name: 'Banco Santander', qty: 100, price: 6, costBasis: 500, assetCurrency: 'EUR', transactions: [{ type: 'buy', qty: 100, price: 5, ts: 4 }] };
const IBE = { id: 'a_ibe', type: 'stock', ticker: 'IBE', name: 'Iberdrola', qty: 10, price: 12, costBasis: 100, assetCurrency: 'EUR', transactions: [{ type: 'buy', qty: 10, price: 10, ts: 5 }] };
const VGW = { id: 'a_vgw', type: 'fund', ticker: 'VG-WLD', name: 'Vanguard Global Stock Index', marketSymbol: null, qty: 4, price: 50, costBasis: 180, assetCurrency: 'EUR', transactions: [{ type: 'buy', qty: 4, price: 45, ts: 6 }] };
const POP = [TOK, BRK, OLDBTC, SAN, IBE, VGW];

async function page(browser, root, { w, h, lang, premium = true, assets = POP }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800 });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => { if (!/access control checks|Load failed|Failed to fetch/.test(e.message)) errs.push(e.message); });
  await p.addInitScript(`try{ localStorage.setItem('portfolio_lang', ${JSON.stringify(lang)}); if(!sessionStorage.getItem('__s')){ localStorage.setItem('aurix_assets', ${JSON.stringify(JSON.stringify(assets))}); localStorage.setItem('portfolio_assets', ${JSON.stringify(JSON.stringify(assets))}); sessionStorage.setItem('__s','1'); } }catch(_){}`);
  await p.goto(root.url, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction("typeof _openAddAssetWithFund==='function' && typeof _AURIX_ENT_CANON!=='undefined'", null, { timeout: 60000 });
  await p.waitForTimeout(700);
  await p.evaluate(`(function(){ try{_aurixCancelLoginRedirect('p');_aurixMarkSessionConfirmed();}catch(_){} var bl=document.getElementById('bootLoader'); if(bl) bl.remove(); var ar=document.getElementById('appRoot'); if(ar) ar.style.opacity='1';
    var f=Object.create(null); _AURIX_ENT_CANON.forEach(function(k){ f[k]=${premium ? "(k!=='workspace.catalog_preview')" : 'false'}; });
    _aurixEnt={loaded:true,loading:false,error:null,plan:'${premium ? 'premium' : 'free'}',status:'${premium ? 'active' : 'none'}',source:'default',validUntil:null,features:f,sources:Object.create(null),fetchedAt:Date.now()}; })()`);
  const ev = s => p.evaluate(s);
  const rows = async () => JSON.parse(await ev(`JSON.stringify(assets.map(function(a){ return { id: a.id, type: a.type, t: a.ticker, c: a.coinId || null, q: +Number(a.qty).toFixed(8), cb: Math.round(Number(a.costBasis) || 0), ccy: a.assetCurrency || 'USD', n: (a.transactions || []).length }; }))`));
  // El alta REAL: abre el formulario con la selección, fija precio/moneda (lo que haría la consulta de
  // precio) y la cantidad, y envía el formulario. `twice` = doble toque / reintento.
  const add = async (sel, qty, px, twice) => {
    await ev(`_openAddAssetWithFund(${JSON.stringify(sel)})`); await p.waitForTimeout(400);
    await ev(`pendingPrice = ${px}; pendingCurrency = ${JSON.stringify(sel.assetCurrency || 'USD')};`);
    await ev(`(function(){ qtyInput.value = '${qty}'; qtyInput.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await ev(`assetForm.requestSubmit()${twice ? '; try { assetForm.requestSubmit(); } catch (_) {}' : ''}`); await p.waitForTimeout(500);
    try { await ev(`(function(){ var o=document.getElementById('modalOverlay'); if (o && o.classList.contains('open') && typeof closeModal==='function') closeModal(); })()`); } catch (_) {}
    return rows();
  };
  return { ctx, p, errs, ev, rows, add };
}
const by = (list, pred) => list.filter(pred);

async function run(ENG, browser, root, w, lang, premium) {
  const T = `${ENG}.${w}.${lang}.${premium ? 'P' : 'F'}`;
  // ── cartera POBLADA
  const P = await page(browser, root, { w, h: w < 800 ? 844 : 900, lang, premium });
  const r0 = await P.rows();
  ok(`${T} carga intacta: 6 posiciones con sus cantidades, coste e historial`, r0.length === 6 && JSON.stringify(r0.map(x => [x.id, x.q, x.cb, x.n])) === JSON.stringify([['a_tok', 2, 700, 1], ['a_brk', 1, 400, 1], ['a_oldbtc', 0.1, 5000, 1], ['a_san', 100, 500, 1], ['a_ibe', 10, 100, 1], ['a_vgw', 4, 180, 1]]), JSON.stringify(r0));
  // fondo del catálogo curado (guardado sin marketSymbol ni ISIN): recompra desde la búsqueda (trae ISIN)
  // y desde Market (trae símbolo) → su MISMA fila, por el ISIN del catálogo.
  let rf = await P.add({ ticker: 'VG-WLD', name: 'Vanguard Global Stock Index', type: 'fund', marketSymbol: null, isin: 'IE00B03HD191', assetCurrency: 'EUR' }, 1, 50);
  ok(`${T} fondo curado recomprado desde la búsqueda: su fila (ISIN del catálogo), sin duplicar`, rf.find(x => x.id === 'a_vgw').q === 5 && by(rf, x => x.t === 'VG-WLD').length === 1, JSON.stringify(by(rf, x => x.t === 'VG-WLD')));
  rf = await P.add({ ticker: 'VG-WLD', name: 'Vanguard Global Stock Index', type: 'fund', marketSymbol: 'VG-WLD', assetCurrency: 'EUR' }, 1, 50);
  ok(`${T} fondo curado recomprado desde Market: su fila, sin duplicar`, rf.find(x => x.id === 'a_vgw').q === 6 && by(rf, x => x.t === 'VG-WLD').length === 1, JSON.stringify(by(rf, x => x.t === 'VG-WLD')));
  // 1/2 · acción MSFT (sin coinId) junto a un token cripto «MSFT»
  let r = await P.add({ ticker: 'MSFT', name: 'Microsoft Corporation', type: 'stock', marketSymbol: 'MSFT' }, 3, 400);
  const tok = r.find(x => x.id === 'a_tok'), st = r.find(x => x.type === 'stock' && x.t === 'MSFT');
  ok(`${T} 1/2 acción MSFT sin coinId NO se suma al token MSFT: dos filas, el token intacto`, tok && tok.q === 2 && tok.cb === 700 && tok.n === 1 && st && st.q === 3 && st.c === null, JSON.stringify(r));
  // 3 · la misma acción otra vez → su posición
  r = await P.add({ ticker: 'MSFT', name: 'Microsoft Corporation', type: 'stock', marketSymbol: 'MSFT' }, 1, 410);
  const st2 = by(r, x => x.type === 'stock' && x.t === 'MSFT');
  ok(`${T} 3 la misma acción canónica usa la posición existente (sin fila nueva)`, st2.length === 1 && st2[0].q === 4 && st2[0].cb === 1610 && st2[0].n === 2 && r.find(x => x.id === 'a_tok').q === 2, JSON.stringify(st2));
  // 1 (al revés) · el token cripto añadido no se suma a la acción
  r = await P.add({ ticker: 'MSFT', name: 'Microsoft • Robinhood Token', type: 'crypto', coinId: 'microsoft-robinhood-tokenized-stock', marketSymbol: 'MSFT' }, 1, 400);
  ok(`${T} 1 token MSFT añadido: va a SU fila (coinId), la acción no cambia`, r.find(x => x.id === 'a_tok').q === 3 && by(r, x => x.type === 'stock' && x.t === 'MSFT')[0].q === 4, JSON.stringify(r));
  // 4 · mismo ticker, otra moneda
  r = await P.add({ ticker: 'MSFT', name: 'Microsoft Corporation', type: 'stock', marketSymbol: 'MSFT', assetCurrency: 'EUR' }, 2, 380);
  ok(`${T} 4 mismo ticker en otra moneda: fila separada, nada se mezcla`, by(r, x => x.type === 'stock' && x.t === 'MSFT').length === 2 && by(r, x => x.t === 'MSFT' && x.ccy === 'EUR')[0].q === 2 && by(r, x => x.t === 'MSFT' && x.ccy === 'USD' && x.type === 'stock')[0].q === 4, JSON.stringify(r));
  // 5 · mismo ticker, otro mercado (MSFT.TO)
  r = await P.add({ ticker: 'MSFT.TO', name: 'Microsoft Corporation', type: 'stock', marketSymbol: 'MSFT.TO' }, 1, 30);
  ok(`${T} 5 otro mercado (MSFT.TO): fila separada (conservador)`, by(r, x => x.t === 'MSFT.TO').length === 1 && by(r, x => x.type === 'stock' && x.t === 'MSFT' && x.ccy === 'USD')[0].q === 4, JSON.stringify(r));
  // 6 · BRK.B ≡ BRK-B en la misma clase y moneda; el token BRK.B no
  r = await P.add({ ticker: 'BRK.B', name: 'Berkshire Hathaway Inc.', type: 'stock', marketSymbol: 'BRK.B' }, 1, 460);
  ok(`${T} 6 BRK.B se resuelve en la posición BRK-B (misma clase y moneda)`, r.find(x => x.id === 'a_brk').q === 2 && by(r, x => /^BRK/.test(x.t)).length === 1, JSON.stringify(by(r, x => /^BRK/.test(x.t))));
  r = await P.add({ ticker: 'BRK.B', name: 'Berkshire Hathaway Class B (Dinari)', type: 'crypto', coinId: 'berkshire-hathaway-class-b-dinari', marketSymbol: 'BRK.B' }, 1, 460);
  ok(`${T} 6 …y el token BRK.B no toca la acción`, r.find(x => x.id === 'a_brk').q === 2 && by(r, x => /^BRK/.test(x.t)).length === 2, JSON.stringify(by(r, x => /^BRK/.test(x.t))));
  // ambigüedad · cripto antigua sin coinId
  r = await P.add({ ticker: 'BTC', name: 'Bitcoin', type: 'crypto', coinId: 'bitcoin', marketSymbol: 'BTC' }, 1, 60000);   // entero: «0.05» en es-ES se lee 5 (separador de miles)
  ok(`${T} antigua sin coinId + Bitcoin (mismo ticker Y nombre): se suma a la existente, sin reescribir su identidad`, r.find(x => x.id === 'a_oldbtc').q === 1.1 && r.find(x => x.id === 'a_oldbtc').c === null && by(r, x => x.t === 'BTC').length === 1, JSON.stringify(by(r, x => x.t === 'BTC')));
  r = await P.add({ ticker: 'BTC', name: 'batcat', type: 'crypto', coinId: 'batcat', marketSymbol: 'BTC' }, 1000, 0.01);
  ok(`${T} antigua sin coinId + otra cripto «BTC» de distinto nombre: posición separada (ambigua → conservador)`, r.find(x => x.id === 'a_oldbtc').q === 1.1 && by(r, x => x.t === 'BTC').length === 2, JSON.stringify(by(r, x => x.t === 'BTC')));
  // v838 — acción y ETF con el mismo ticker y moneda NO se fusionan sin un identificador canónico común.
  r = await P.add({ ticker: 'SAN', name: 'Banco Santander', type: 'etf', marketSymbol: 'SAN.MC', assetCurrency: 'EUR' }, 5, 6);
  ok(`${T} acción y ETF con igual ticker/moneda sin ID canónico común: posiciones separadas`, r.find(x => x.id === 'a_san').q === 100 && by(r, x => x.t === 'SAN').length === 2, JSON.stringify(by(r, x => x.t === 'SAN')));
  // v838 — una fila antigua SIN símbolo de mercado: ticker + moneda no basta → separada.
  r = await P.add({ ticker: 'IBE', name: 'Iberdrola', type: 'stock', marketSymbol: 'IBE.MC', assetCurrency: 'EUR' }, 3, 12);
  ok(`${T} fila antigua sin símbolo de mercado: ticker + moneda no basta, posición separada`, r.find(x => x.id === 'a_ibe').q === 10 && by(r, x => x.t === 'IBE').length === 2, JSON.stringify(by(r, x => x.t === 'IBE')));
  // 14 · doble toque / reintento
  const before = by(await P.rows(), x => x.id === 'a_san')[0].q;   // (la fila SAN.MC · acción)
  r = await P.add({ ticker: 'SAN', name: 'Banco Santander', type: 'stock', marketSymbol: 'SAN.MC', assetCurrency: 'EUR' }, 10, 6, true);
  ok(`${T} 14 doble envío del alta suma UNA vez`, r.find(x => x.id === 'a_san').q === before + 10, String(r.find(x => x.id === 'a_san').q));
  // 12/13 · «En cartera» en Market
  const mk = async item => { await P.ev(`_aurixMktOpenSymbol(${JSON.stringify(item.symbol)}, ${JSON.stringify(item)})`); await P.p.waitForTimeout(300);
    const v = JSON.parse(await P.ev(`JSON.stringify({ add: document.getElementById('mktPrvAddBtn').textContent, pos: !document.getElementById('mktPrvPosBtn').hidden, id: document.getElementById('mktPrvPosBtn').getAttribute('data-asset-id') })`)); await P.ev(`_aurixMktClose()`); return v; };
  const ownStock = await mk({ symbol: 'MSFT', ticker: 'MSFT', marketSymbol: 'MSFT', type: 'stock', name: 'Microsoft Corporation' });
  const stockId = by(await P.rows(), x => x.type === 'stock' && x.t === 'MSFT' && x.ccy === 'USD')[0].id;
  ok(`${T} 12 la acción poseída: «En cartera» y abre SU posición (no la del token)`, ownStock.pos && ownStock.id === stockId, JSON.stringify(ownStock));
  const ownTok = await mk({ symbol: 'MSFT', ticker: 'MSFT', type: 'crypto', coinId: 'microsoft-robinhood-tokenized-stock', name: 'Microsoft • Robinhood Token' });
  ok(`${T} 13 el token: «En cartera» por SU fila, nunca por la acción`, ownTok.pos && ownTok.id === 'a_tok', JSON.stringify(ownTok));
  const otherTok = await mk({ symbol: 'MSFT', ticker: 'MSFT', type: 'crypto', coinId: 'microsoft-ondo-tokenized-stock', name: 'Microsoft (Ondo Tokenized Stock)' });
  ok(`${T} 13 otro token derivado de Microsoft que no tengo: sin «En cartera»`, !otherTok.pos, JSON.stringify(otherTok));
  ok(`${T} sin desbordamiento horizontal`, await P.ev('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1'));
  ok(`${T} sin errores de página`, !P.errs.length, P.errs.join(' | '));
  await P.ctx.close();
  // ── cuenta VACÍA
  const E = await page(browser, root, { w, h: w < 800 ? 844 : 900, lang, premium, assets: [] });
  let e = await E.add({ ticker: 'MSFT', name: 'Microsoft Corporation', type: 'stock', marketSymbol: 'MSFT' }, 1, 400);
  e = await E.add({ ticker: 'MSFT', name: 'Microsoft • Robinhood Token', type: 'crypto', coinId: 'microsoft-robinhood-tokenized-stock', marketSymbol: 'MSFT' }, 1, 400);
  ok(`${T} vacía: acción y token MSFT, dos posiciones de una unidad`, e.length === 2 && e.every(x => x.q === 1) && new Set(e.map(x => x.type)).size === 2, JSON.stringify(e));
  const nf = await (async () => { await E.ev(`_aurixMktOpenSymbol('AAPL', { symbol: 'AAPL', ticker: 'AAPL', marketSymbol: 'AAPL', type: 'stock', name: 'Apple Inc.' })`); await E.p.waitForTimeout(250); const v = await E.ev(`document.getElementById('mktPrvPosBtn').hidden`); await E.ev(`_aurixMktClose()`); return v; })();
  ok(`${T} vacía: un activo no poseído no dice «En cartera»`, nf === true);
  ok(`${T} vacía: sin errores de página`, !E.errs.length, E.errs.join(' | '));
  await E.ctx.close();
}

async function runSearch(browser, root) {
  const P = await page(browser, root, { w: 1440, h: 900, lang: 'es', assets: [] });
  let net = true;
  await P.p.route(/isa-portfolio-ten\.vercel\.app\/api\/search/, async route => { try { const r = await fetch(route.request().url(), { headers: { Origin: 'https://app.aurixsystem.io', Accept: 'application/json' } }); route.fulfill({ status: r.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: await r.text() }); } catch (e) { net = false; route.abort(); } });
  const q1 = async s => JSON.parse(await P.ev(`(async function(){ var r = await searchAllAssets(${JSON.stringify(s)}); return JSON.stringify((r||[]).slice(0,8).map(function(a){ return { t: a.ticker, n: a.name, ty: a.type, sub: _aurixSearchSubtitle(a) }; })); })()`));
  const q = async s => { let r = await q1(s); if (!r.length) { await P.p.waitForTimeout(1500); r = await q1(s); } return r; };
  const msft = await q('MSFT');
  if (!net || msft.length < 3) { skip++; console.log('  · SKIP búsqueda (sin red hacia el proxy)'); await P.ctx.close(); return; }
  const iTok = msft.findIndex(x => x.ty === 'crypto');
  ok('7 MSFT: la acción canónica primero y sus tokens detrás de las cotizaciones de la acción', msft[0].t === 'MSFT' && msft[0].ty === 'stock' && (iTok === -1 || iTok > msft.findIndex(x => x.t === 'MSFT.TO')), JSON.stringify(msft.map(x => x.t + '/' + x.ty)));
  const apple = await q('apple'); const iInc = apple.findIndex(x => /^Apple Inc\.?$/.test(x.n)), iMeme = apple.findIndex(x => x.ty === 'crypto' && x.t === 'APPLE');
  ok('8 apple: Apple Inc. antes que las memecoins APPLE', iInc === 0 && (iMeme === -1 || iMeme > iInc), JSON.stringify(apple.map(x => x.t + '/' + x.n.slice(0, 18))));
  const aapl = await q('AAPL');
  ok('AAPL: Apple Inc. primero', aapl[0] && aapl[0].t === 'AAPL' && aapl[0].ty === 'stock', JSON.stringify(aapl.slice(0, 3)));
  const appleAll = JSON.parse(await P.ev(`(async function(){ var r = await searchAllAssets('apple'); return JSON.stringify((r||[]).map(function(a){ return { t: a.ticker, n: a.name, ty: a.type, sub: _aurixSearchSubtitle(a) }; })); })()`));
  const bp = appleAll.findIndex(x => /Backpack Securities/i.test(x.n));
  ok('Apple (Backpack Securities): detrás de Apple Inc. y etiquetada «Token derivado»', bp === -1 || (bp > 0 && /Token derivado/.test(appleAll[bp].sub)), JSON.stringify(appleAll[bp] || null));
  const usdc = await q('USDC'); const iU = usdc.findIndex(x => x.ty === 'crypto' && x.t === 'USDC'), iD = usdc.findIndex(x => /USDATA/i.test(x.n));
  ok('9 USDC: el USDC canónico antes que USDATA', iU === 0 && (iD === -1 || iD > iU), JSON.stringify(usdc.slice(0, 3).map(x => x.t + '/' + x.n)));
  const ondo = await q('ondo');
  ok('10 ONDO: primero y SIN etiqueta de derivado', ondo[0].t === 'ONDO' && !/Token derivado/.test(ondo[0].sub), JSON.stringify(ondo[0]));
  const uc = await q('usd coin');
  ok('11 stablecoin canónica sin rango (catálogo) no se hunde: «usd coin» → USDC', uc[0] && uc[0].t === 'USDC' && uc[0].ty === 'crypto', JSON.stringify(uc.slice(0, 2)));
  const gold = await q('gold');
  ok('ranking gold: el instrumento principal (Gold.com) antes que memecoins sin rango llamadas «Gold»', gold[0] && gold[0].ty !== 'crypto', JSON.stringify(gold.slice(0, 3).map(x => x.t + '/' + x.ty + '/' + x.n)));
  const brk = await q('BRK.B');
  ok('6 búsqueda BRK.B: la acción BRK-B primero', brk[0] && brk[0].ty === 'stock' && /Berkshire/.test(brk[0].n), JSON.stringify(brk[0]));
  for (const [s, rx] of [['BTC', /^Bitcoin$/], ['ETH', /^Ethereum$/]]) { const r = await q(s); ok(`búsqueda ${s}: el canónico primero`, r[0] && rx.test(r[0].n), JSON.stringify(r[0])); }
  const spy = await q('SPY'); ok('búsqueda SPY: el ETF primero', spy[0] && spy[0].ty === 'etf', JSON.stringify(spy[0]));
  const bri = usdc.findIndex(x => /bridged/i.test(x.n));
  ok('USDC: las versiones bridged detrás del USDC raíz', bri === -1 || bri > 0, JSON.stringify(usdc.map(x => x.n.slice(0, 20))));
  ok('búsqueda sin errores de página', !P.errs.length, P.errs.join(' | '));
  await P.ctx.close();
  // ── La pestaña MARKET (donde v837 fallaba: el orden «featured» ponía la cripto primero), con y sin rango.
  for (const norank of [false, true]) {
    const M = await page(browser, root, { w: 390, h: 844, lang: 'es', assets: [] });
    await M.p.route(/isa-portfolio-ten\.vercel\.app\/api\//, async route => { try { const r = await fetch(route.request().url(), { headers: { Origin: 'https://app.aurixsystem.io', Accept: 'application/json' } }); let body = await r.text();
      if (norank && /search\/crypto/.test(route.request().url())) { const j = JSON.parse(body); (j.results || []).forEach(x => { x.marketCapRank = null; }); body = JSON.stringify(j); }
      route.fulfill({ status: r.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body }); } catch (_) { route.abort(); } });
    await M.ev(`switchTab('market')`); await M.p.waitForTimeout(1200);
    const mrows1 = async qq => { const inp = M.p.locator('#marketSearchInput'); await inp.fill(''); await inp.fill(qq);
      await M.p.waitForFunction(() => document.querySelectorAll('#marketList .market-row').length > 2, null, { timeout: 20000 }).catch(() => {}); await M.p.waitForTimeout(2200);
      return M.p.evaluate(() => [...document.querySelectorAll('#marketList .market-row')].map(r => ({ n: (r.querySelector('.mkt-id-name') || {}).textContent || '', m: (r.querySelector('.mkt-id-meta') || {}).textContent || '' }))); };
    // El proxy limita ráfagas: si una búsqueda llega sin NINGUNA fila cripto, se reintenta una vez tras
    // vaciar la caché de búsqueda de Market (disponibilidad del dato, no el criterio de orden).
    const mrows = async qq => { let r = await mrows1(qq); if (!r.some(x => /Cripto|Crypto|Token/.test(x.m))) { await M.p.waitForTimeout(2500); await M.ev(`try{ _mktDiscCache.clear(); }catch(_){}`); r = await mrows1(qq); } return r; };
    const tag = norank ? 'Market sin rango' : 'Market';
    const ma = await mrows('apple'); ok(`${tag} · apple → Apple Inc. primero`, ma[0] && /^Apple Inc\.?$/.test(ma[0].n), JSON.stringify(ma.slice(0, 3)));
    const mb = ma.findIndex(x => /Backpack Securities/i.test(x.n)); ok(`${tag} · Backpack detrás y «Token derivado»`, mb === -1 || (mb > 0 && /Token derivado/.test(ma[mb].m)), JSON.stringify(ma[mb] || null));
    const mA = await mrows('AAPL'); ok(`${tag} · AAPL → Apple Inc. primero`, mA[0] && /^Apple Inc\.?$/.test(mA[0].n), JSON.stringify(mA.slice(0, 3)));
    const mm = await mrows('MSFT'); ok(`${tag} · MSFT → Microsoft Corporation primero`, mm[0] && /^Microsoft Corporation$/.test(mm[0].n), JSON.stringify(mm.slice(0, 2)));
    const mu = await mrows('USDC'); const iUD = mu.findIndex(x => /USDATA/i.test(x.n)), iBr = mu.findIndex(x => /bridged/i.test(x.n));
    ok(`${tag} · USDC → USD Coin primero; USDATA y bridged detrás`, mu[0] && /^(USD Coin|USDC)$/.test(mu[0].n) && iUD !== 0 && iBr !== 0, JSON.stringify(mu.slice(0, 3)));
    ok(`${tag} · sin errores de página`, !M.errs.length, M.errs.join(' | '));
    await M.ctx.close();
  }
}

async function invariants(browser) {
  if (!BASE) { skip++; console.log('  · SKIP invariantes (sin BASE)'); return; }
  const snap = async root => { const P = await page(browser, root, { w: 1440, h: 900, lang: 'es' });
    const v = await P.ev(`JSON.stringify({ a: assets.map(function(a){ return [a.id, a.type, a.ticker, a.qty, a.costBasis, a.assetCurrency, JSON.stringify(a.transactions || [])]; }), total: totalValueBase(), inv: (typeof investableAssets === 'function' ? investableAssets().length : null),
      ws: [JSON.stringify(calculateMonthlyBudget({ currency:'EUR', rows:[{id:'s',type:'income',label:'N',amount:'2400'},{id:'r',type:'expense',label:'A',amount:'900'}] })), JSON.stringify(calculateLoan({ principal:'180000', rate:'3,25', years:'30', fees:'0', insurance:'0' })).length, JSON.stringify(calculateTradeJournal([{id:'t',asset:'N',atype:'stock',buy:90,sell:119,qty:20,fee:5,currency:'EUR'}]))] })`);
    await P.ctx.close(); return v; };
  const b = await serve(BASE), c = await serve(ROOT);
  const vb = await snap(b), vc = await snap(c);
  b.s.close(); c.s.close();
  const B = JSON.parse(vb), C = JSON.parse(vc);
  ok('INV misma cartera cargada: activos, cantidades, coste, moneda e historial', JSON.stringify(B.a) === JSON.stringify(C.a), vc.slice(0, 200));
  ok('INV mismo valor total', B.total === C.total, `${B.total} vs ${C.total}`);
  ok('INV Workspace: cálculos idénticos (presupuesto, préstamo, Diario)', JSON.stringify(B.ws) === JSON.stringify(C.ws));
}

const root = await serve(ROOT);
for (const [ENG, Bw] of [['CR', chromium], ['WK', webkit]]) {
  const browser = await Bw.launch();
  for (const w of [390, 1440]) for (const lang of ['es', 'en']) {
    try { await run(ENG, browser, root, w, lang, true); } catch (e) { ok(`${ENG}.${w}.${lang}.P sin excepción`, false, e.message); }
  }
  try { await run(ENG, browser, root, 390, 'es', false); } catch (e) { ok(`${ENG}.free sin excepción`, false, e.message); }
  if (ENG === 'CR') { try { await runSearch(browser, root); } catch (e) { ok('búsqueda sin excepción', false, e.message); } try { await invariants(browser); } catch (e) { ok('invariantes sin excepción', false, e.message); } }
  await browser.close();
}
root.s.close();
console.log(`\n${pass} passed, ${fail} failed${skip ? `, ${skip} skipped` : ''}`);
if (fails.length) { console.log('FAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); }
process.exit(fail ? 1 : 0);
