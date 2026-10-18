// Scaffolding compartido de la sonda del embudo Free (servidor local + personas simuladas).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = process.env.ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
export async function serve() {
  const s = createServer(async (req, res) => { try { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = normalize(join(ROOT, p)); let b = await readFile(f); if (f.endsWith('app.js')) b = Buffer.from(String(b).replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;').replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0')); res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(b); } catch { res.writeHead(404); res.end(); } });
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  return { s, url: `http://127.0.0.1:${s.address().port}/index.html` };
}
export const { chromium, webkit } = await import('/tmp/aurix-pw/node_modules/playwright/index.mjs');
// Carteras SINTÉTICAS de sonda (nunca datos de un usuario real).
export const PORTFOLIO = [
  { id: 'a_btc', type: 'crypto', ticker: 'BTC', marketSymbol: 'BTC', coinId: 'bitcoin', name: 'Bitcoin', qty: 0.5, price: 60000, costBasis: 20000, assetCurrency: 'USD', transactions: [{ type: 'buy', qty: 0.5, price: 40000, ts: 1 }] },
  { id: 'a_msft', type: 'stock', ticker: 'MSFT', marketSymbol: 'MSFT', name: 'Microsoft', qty: 10, price: 400, costBasis: 3000, assetCurrency: 'USD', transactions: [{ type: 'buy', qty: 10, price: 300, ts: 2 }] },
  { id: 'a_cash', type: 'cash', ticker: 'EUR', name: 'Cuenta', qty: 1, price: 1, nominal: 3000, amount: 3000, assetCurrency: 'EUR', transactions: [] },
];
export const QUIET_RE = /access control checks|Access-Control-Allow-Origin|Load failed|Failed to fetch|Failed to load resource|CORS|net::|Content Security Policy/;
export async function page(browser, url, { w, h, lang = 'es', premium = false, assets = PORTFOLIO, reduced = false }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h || (w < 800 ? (w <= 360 ? 740 : 844) : (w < 1100 ? 1024 : 900)) }, hasTouch: w < 800, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => { if (!QUIET_RE.test(e.message)) errs.push(e.message); });
  p.on('console', m => { if (m.type() === 'error' && !QUIET_RE.test(m.text())) errs.push('console: ' + m.text()); });
  await p.route(/vercel\.app\/api\//, r => r.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: '{}' }));
  await p.addInitScript(`try{ localStorage.setItem('portfolio_lang', ${JSON.stringify(lang)}); if(!sessionStorage.getItem('__s')){ localStorage.setItem('aurix_assets', ${JSON.stringify(JSON.stringify(assets))}); localStorage.setItem('portfolio_assets', ${JSON.stringify(JSON.stringify(assets))}); sessionStorage.setItem('__s','1'); } }catch(_){}`);
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction("typeof _renderDashboardDiscover==='function' && typeof _AURIX_ENT_CANON!=='undefined'", null, { timeout: 60000 });
  await p.waitForTimeout(700);
  await p.evaluate(`(function(){ try{_aurixCancelLoginRedirect('p');_aurixMarkSessionConfirmed();}catch(_){} var bl=document.getElementById('bootLoader'); if(bl) bl.remove(); var ar=document.getElementById('appRoot'); if(ar) ar.style.opacity='1';
    var f=Object.create(null); _AURIX_ENT_CANON.forEach(function(k){ f[k]=${premium ? "(k!=='workspace.catalog_preview')" : 'false'}; });
    _aurixEnt={loaded:true,loading:false,error:null,plan:'${premium ? 'premium' : 'free'}',status:'${premium ? 'active' : 'none'}',source:'default',validUntil:null,features:f,sources:Object.create(null),fetchedAt:Date.now()};
    try{ _aurixActiveUserId='qa-u1'; _aurixStampCacheOwner(); _aurixEntApplyToUi(f); }catch(_){} })()`);
  await p.evaluate(`switchTab('home')`); await p.waitForTimeout(600);
  return { ctx, p, errs, ev: s => p.evaluate(s) };
}
