// AURIX — «VER POSICIÓN» DESDE MARKET · sonda focal única.
// Bytes del repo en local, sesión/Premium simulados y cartera SINTÉTICA (nunca cuentas reales).
// Matriz: Chromium + WebKit · 390 + 1440 · BTC + un valor cotizado (MSFT).
//   node scripts/aurix-market-position-probe.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const server = createServer(async (req, res) => { try { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = normalize(join(ROOT, p)); let b = await readFile(f); if (f.endsWith('app.js')) b = Buffer.from(String(b).replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')); res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); } });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL0 = `http://127.0.0.1:${server.address().port}/index.html`;
const { chromium, webkit } = await import('/tmp/aurix-pw/node_modules/playwright/index.mjs');

let pass = 0, fail = 0; const fails = [];
const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d === undefined ? '' : '  ' + String(d).slice(0, 300))); console.log('  ✗', n, d === undefined ? '' : String(d).slice(0, 300)); } };

const BTC = { id: 'a_btc', type: 'crypto', ticker: 'BTC', marketSymbol: 'BTC', coinId: 'bitcoin', name: 'Bitcoin', qty: 0.1, price: 60000, costBasis: 5000, assetCurrency: 'USD', transactions: [{ type: 'buy', qty: 0.1, price: 50000, ts: 3 }] };
// Mismo ticker, otra identidad (token): «Ver posición» del valor cotizado NO puede abrir esta fila.
const TOK = { id: 'a_tok', type: 'crypto', ticker: 'MSFT', marketSymbol: 'MSFT', coinId: 'microsoft-robinhood-tokenized-stock', name: 'Microsoft • Robinhood Token', qty: 2, price: 400, costBasis: 700, assetCurrency: 'USD', transactions: [{ type: 'buy', qty: 2, price: 350, ts: 1 }] };
const MSFT = { id: 'a_msft', type: 'stock', ticker: 'MSFT', marketSymbol: 'MSFT', name: 'Microsoft', qty: 10, price: 400, costBasis: 3000, assetCurrency: 'USD', transactions: [{ type: 'buy', qty: 10, price: 300, ts: 2 }] };
const ASSETS = [TOK, BTC, MSFT];
const CASES = [
  { key: 'BTC', id: 'a_btc', tab: 'crypto', item: { symbol: 'BTC', ticker: 'BTC', coinId: 'bitcoin', type: 'crypto', name: 'Bitcoin', marketSymbol: 'BTC' } },
  { key: 'MSFT', id: 'a_msft', tab: 'stocks', item: { symbol: 'MSFT', ticker: 'MSFT', marketSymbol: 'MSFT', type: 'stock', name: 'Microsoft Corporation' } },
];

async function page(browser, w) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 800 ? 844 : 900 }, hasTouch: w < 800 });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => { if (!/access control checks|Load failed|Failed to fetch/.test(e.message)) errs.push(e.message); });
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|access control|Access-Control-Allow-Origin|CORS|net::|Load failed|Failed to fetch|Content Security Policy/.test(m.text())) errs.push('console: ' + m.text()); });
  // La búsqueda no sale a la red: respuesta fija y vacía (la sonda mide la vuelta, no el proveedor).
  await p.route(/\/api\/search/, r => r.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: '{"results":[]}' }));
  await p.addInitScript(`try{ localStorage.setItem('portfolio_lang','es'); if(!sessionStorage.getItem('__s')){ localStorage.setItem('aurix_assets', ${JSON.stringify(JSON.stringify(ASSETS))}); localStorage.setItem('portfolio_assets', ${JSON.stringify(JSON.stringify(ASSETS))}); sessionStorage.setItem('__s','1'); } }catch(_){}`);
  await p.goto(URL0, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction("typeof _aurixMktOpenSymbol==='function' && typeof _AURIX_ENT_CANON!=='undefined'", null, { timeout: 60000 });
  await p.waitForTimeout(700);
  await p.evaluate(`(function(){ try{_aurixCancelLoginRedirect('p');_aurixMarkSessionConfirmed();}catch(_){} var bl=document.getElementById('bootLoader'); if(bl) bl.remove(); var ar=document.getElementById('appRoot'); if(ar) ar.style.opacity='1';
    var f=Object.create(null); _AURIX_ENT_CANON.forEach(function(k){ f[k]=(k!=='workspace.catalog_preview'); });
    _aurixEnt={loaded:true,loading:false,error:null,plan:'premium',status:'active',source:'default',validUntil:null,features:f,sources:Object.create(null),fetchedAt:Date.now()};
    try{ _aurixActiveUserId='qa-u1'; _aurixStampCacheOwner(); _aurixEntApplyToUi(f); }catch(_){} })()`);
  return { ctx, p, errs, ev: s => p.evaluate(s) };
}

// Muestra cada frame desde el toque hasta que el detalle está puesto: en ningún frame visible del
// Resumen puede verse hero, planes, descubrir ni slider por encima de la posición.
const FRAMES = `new Promise(res => { const out = []; const t0 = performance.now();
  (function tick(){ const main = document.querySelector('main'); const op = main ? +getComputedStyle(main).opacity : 0;
    const shown = main && getComputedStyle(main).display !== 'none' && op > 0.01;
    const vis = sel => { const e = document.querySelector(sel); return !!(e && e.offsetHeight > 0 && getComputedStyle(e).display !== 'none'); };
    if (shown) out.push({ hero: vis('.dashboard-top'), plans: vis('#wsPlansSection'), disc: vis('#dashDiscoverSection'), slider: vis('.portfolio-slider-card'), cats: vis('#categoriesSection'), ad: vis('#assetDetailSection') });
    if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else res(JSON.stringify(out)); })(); })`;
const STATE = `JSON.stringify({ tab: currentTab, mtab: currentMarketTab, tf: _aurixMktTimeframe, q: (document.getElementById('marketSearchInput')||{}).value, sq: _marketSearchQuery, y: Math.round(scrollY), ly: Math.round((document.getElementById('marketList')||{}).scrollTop||0) })`;

async function run(ENG, browser, w) {
  for (const C of CASES) {
    const T = `${ENG}.${w}.${C.key}`;
    const P = await page(browser, w);
    // Dashboard primero (planes montados en Premium), luego Market con estado no trivial.
    await P.ev(`switchTab('home')`); await P.p.waitForTimeout(500);
    await P.ev(`switchTab('market')`); await P.p.waitForTimeout(600);
    await P.p.click(`.market-tab[data-market="all"]`); await P.p.waitForTimeout(400);
    await P.ev(`_aurixMktTimeframe = '7D'`);
    for (const via of ['back', 'volver']) {
      // Atrás: lista desplazada (el scroll owner es #marketList) y ventana al fondo. Volver: con búsqueda.
      if (via === 'volver') { await P.p.fill('#marketSearchInput', 'micro'); await P.p.waitForTimeout(700); }
      await P.ev(`(function(){ var l=document.getElementById('marketList'); if(l) l.scrollTop = ${via === 'back' ? 400 : 0}; window.scrollTo(0, 9999); })()`);
      await P.p.waitForTimeout(100);
      await P.ev(`_aurixMktOpenSymbol(${JSON.stringify(C.item.symbol)}, ${JSON.stringify(C.item)})`); await P.p.waitForTimeout(400);
      // Market tal y como está al tocar «Ver posición» (la ficha abierta ya fija la ventana: body.modal-open).
      const before = JSON.parse(await P.ev(STATE));
      if (via === 'back') ok(`${T} la prueba desplaza Market de verdad`, before.ly >= 300, JSON.stringify(before));
      const btnId = await P.ev(`document.getElementById('mktPrvPosBtn').getAttribute('data-asset-id')`);
      ok(`${T}.${via} identidad: el botón apunta a SU fila (no a otra con el mismo ticker)`, btnId === C.id, btnId);
      const framesP = P.ev(FRAMES);
      await P.p.click('#mktPrvPosBtn');
      const frames = JSON.parse(await framesP);
      const bad = frames.filter(f => f.hero || f.plans || f.disc || f.slider || f.cats);
      ok(`${T}.${via} ningún frame pinta hero/planes/descubrir/slider/categorías`, frames.length > 0 && !bad.length, JSON.stringify(bad[0] || frames.length));
      ok(`${T}.${via} el detalle está visible desde el primer frame del Resumen`, frames.length > 0 && frames.every(f => f.ad), JSON.stringify(frames[0]));
      await P.p.waitForTimeout(400);
      const d = JSON.parse(await P.ev(`JSON.stringify({ act: activeAssetId, name: document.querySelector('#assetDetailSection')?.textContent.includes(${JSON.stringify(ASSETS.find(a => a.id === C.id).name)}),
        y: Math.round(scrollY), head: Math.round(document.querySelector('#assetDetailSection .ad2-head').getBoundingClientRect().top),
        hdr: Math.round((document.querySelector('.header')||document.body).getBoundingClientRect().bottom),
        above: [...document.querySelector('main').children].filter(e => e.id !== 'assetDetailSection' && e.offsetHeight > 0 && e.getBoundingClientRect().top < document.getElementById('assetDetailSection').getBoundingClientRect().top).map(e => e.id || e.className) })`));
      ok(`${T}.${via} abre la posición exacta`, d.act === C.id && d.name, JSON.stringify(d));
      ok(`${T}.${via} cabecera del detalle arriba del viewport sin scroll manual`, d.y === 0 && d.head >= 0 && d.head <= Math.max(d.hdr, 0) + 48 && !d.above.length, JSON.stringify(d));
      ok(`${T}.${via} sin desbordamiento horizontal (detalle)`, await P.ev('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1'));
      if (via === 'back') await P.p.goBack(); else await P.p.click('#adsBack');
      await P.p.waitForTimeout(700);
      const after = JSON.parse(await P.ev(STATE));
      ok(`${T}.${via} vuelve a Market con pestaña, periodo, búsqueda y scroll`, after.tab === 'market' && after.mtab === before.mtab && after.tf === before.tf && after.q === before.q && after.sq === before.sq && Math.abs(after.y - before.y) <= 2 && Math.abs(after.ly - before.ly) <= 2, JSON.stringify({ before, after }));
    }
    // Una vez vuelto, Atrás ya no reabre nada ni cambia de pestaña por sorpresa.
    ok(`${T} historial: tras la vuelta no queda la posición abierta`, await P.ev(`activeAssetId === null && _mktPosReturn === null`));
    // Apertura del Dashboard intacta: el Resumen vuelve completo.
    await P.ev(`switchTab('home')`); await P.p.waitForTimeout(600);
    const home = JSON.parse(await P.ev(`JSON.stringify({ hero: document.querySelector('.dashboard-top').offsetHeight > 0, plans: document.getElementById('wsPlansSection').offsetHeight > 0, slider: getComputedStyle(document.querySelector('.portfolio-slider-card')).display !== 'none', ad: document.getElementById('assetDetailSection').style.display })`));
    ok(`${T} Dashboard después: hero y planes visibles, slider según viewport, detalle cerrado`, home.hero && home.plans && home.slider === (w < 769) && home.ad === 'none', JSON.stringify(home));
    ok(`${T} sin errores de página/consola`, !P.errs.length, P.errs.join(' | '));
    await P.ctx.close();
  }
}

for (const [ENG, L] of [['chromium', chromium], ['webkit', webkit]]) {
  const b = await L.launch();
  for (const w of [390, 1440]) await run(ENG, b, w);
  await b.close();
}
server.close();
console.log(`\nMARKET-POSITION: ${pass}/${pass + fail} PASS` + (fail ? `\n  FALLOS:\n  - ${fails.join('\n  - ')}` : ''));
process.exit(fail ? 1 : 0);
