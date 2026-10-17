#!/usr/bin/env node
/**
 * AURIX INTELLIGENCE · P0 TU EVOLUCIÓN · MÉTRICAS QUE DESAPARECEN — sonda focal
 * ════════════════════════════════════════════════════════════════════════════
 * A diferencia de las sondas V2/V3 (que INYECTAN `_aurixAssetMemory` ya resuelta),
 * aquí arranca la app REAL autenticada: sesión de Supabase plantada en storage y
 * TODA su red interceptada con latencias (fila `user_portfolios` con época y linaje,
 * páginas de `portfolio_snapshots`, las 5 lecturas `asset_values` de la memoria por
 * posición, `capital_flows`, entitlements). Ningún estado se escribe a mano salvo
 * las acciones del usuario (cambiar de pestaña, pulsar chips, borrar una posición).
 * Una grabadora (MutationObserver) guarda CADA composición de la card.
 *
 * Assert principal: desde que hay ≥2 métricas, ningún frame posterior termina en
 * sólo Valor salvo evidencia definitiva; y ninguna métrica vista desaparece por una
 * respuesta posterior parcial, pendiente, fallida, vencida o antigua.
 *
 *   ENGINES=CR,WK · WIDTHS=390,1440 · ONLY=<escenario> · VERBOSE=1
 * Falla en v841 (`29004c0`): «flujo sin contrapartida + 2ª lectura parcial» termina en Valor.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const abs = normalize(join(ROOT, p)); if (!abs.startsWith(ROOT)) return res.writeHead(403).end();
    res.writeHead(200, { 'content-type': MIME[extname(abs)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(await readFile(abs));
  } catch (_) { res.writeHead(404).end('nf'); } });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const closeServer = () => server.close();
let PWm; try { PWm = await import(process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs'); } catch (e) { console.error('\n✗ SIN MOTOR\nRESULT: NO EJECUTADO (entorno, no candidato)'); process.exit(2); }
const DAY = 864e5, H = 3600e3;
let FEATS = {};

// Persona: Cripto + Liquidez + Fondos/ETF (la forma de la reproducción real).
function account(uid, opt = {}) {
  const now = Date.now(), start = now - 30 * DAY, endAt = now - 10 * 60e3;
  const A = opt.assets || [['c1','BTC','Bitcoin','crypto',45],['c2','ETH','Ethereum','crypto',15],['l1','EUR','Efectivo','cash',12],['e1','VWCE','Vanguard FTSE All-World','etf',20],['f1','FND','Fondo Global','fund',8]];
  const typeOf = Object.fromEntries(A.map(r => [r[0], r[3]]));
  const wAt = (t) => { const f = (t - start) / (endAt - start); const o = {}; A.forEach(r => { o[r[0]] = r[4] * (1 + (r[0] === 'c1' ? -0.25 : 0.12) * f); }); const s = Object.values(o).reduce((a, b) => a + b, 0); Object.keys(o).forEach(k => o[k] = o[k] / s * 100); return o; };
  const tot = (t) => 50000 * (1 + 0.03 * ((t - start) / (endAt - start)) + 0.004 * Math.sin((t - start) / (11 * H)));
  const at = (t) => { const w = wAt(t), T = tot(t), vals = {}, cv = { crypto: 0, stock: 0, etf: 0, fund: 0, metal: 0, real_estate: 0, liquidity: 0, other: 0 };
    Object.keys(w).forEach(k => { const v = +(T * w[k] / 100).toFixed(2); vals[k] = v; const b = typeOf[k] === 'cash' ? 'liquidity' : typeOf[k]; cv[b] = +(cv[b] + v).toFixed(2); });
    return { vals, cv, T: +T.toFixed(2) }; };
  const hist = [], cats = [], snaps = [];
  for (let ts = start; ts <= endAt + 1; ts += DAY) { const s = at(ts); hist.push({ ts, value: s.T }); cats.push(Object.assign({ ts, total: s.T }, s.cv)); }
  for (let ts = start; ts <= endAt + 1; ts += (endAt - ts <= 26 * H ? 15 * 60e3 : 6 * H)) { const s = at(ts);
    snaps.push({ ts, total_value_usd: s.T, real_estate: 0, category_values: s.cv, source: 'cron', confidence: 'high', market_state: null, price_staleness: null, asset_values: s.vals, schema_version: 2 }); }
  const w = wAt(endAt), T = tot(endAt);
  const assets = A.map(r => { const price = r[3] === 'cash' ? 1 : (r[1] === 'BTC' ? 60000 : (r[1] === 'ETH' ? 3000 : 100));
    const v = T * w[r[0]] / 100;
    return { id: r[0], ticker: r[1], symbol: r[1], name: r[2], type: r[3], qty: v / price, price, assetCurrency: 'USD', change24h: r[3] === 'cash' ? null : 0.5,
      transactions: [{ type: 'buy', qty: v / price, price, ts: now - 60 * DAY }], createdAt: now - 60 * DAY, ...(r[3] === 'crypto' ? { coinId: r[2].toLowerCase() } : { marketSymbol: r[1] }) }; });
  const lineage = opt.lineage === false ? null : [];
  return { uid, hist, cats, snaps, assets, lineage, epoch: opt.epoch || null };
}
const jwt = (uid) => { const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return b({ alg: 'HS256', typ: 'JWT' }) + '.' + b({ sub: uid, exp: Math.floor(Date.now() / 1000) + 86400, role: 'authenticated', aud: 'authenticated' }) + '.sig'; };
// Planificador de red: `net.rule(kind)` → { delay, fail, hang, data(override) } por llamada.
async function bootPage(browser, acct, net, { width = 390, lang = 'es', seedCache = true, extraInit = '' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 1000 } });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  const sessKey = 'sb-ozcasyufbknnuemllwso-auth-token';
  const sess = { access_token: jwt(acct.uid), refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400,
    user: { id: acct.uid, aud: 'authenticated', role: 'authenticated', email: acct.uid + '@probe.test', app_metadata: {}, user_metadata: {}, created_at: new Date(Date.now() - 90 * DAY).toISOString() } };
  await ctx.addInitScript(`try{ if(!sessionStorage.getItem('__seeded')){ sessionStorage.setItem('__seeded','1');
    localStorage.setItem(${JSON.stringify(sessKey)}, ${JSON.stringify(JSON.stringify(sess))});
    localStorage.setItem('portfolio_lang', ${JSON.stringify(lang)}); localStorage.setItem('aurix_cache_owner', ${JSON.stringify(acct.uid)});
    ${seedCache ? `localStorage.setItem('portfolio_assets', ${JSON.stringify(JSON.stringify(acct.assets))});
    localStorage.setItem('portfolio_history', ${JSON.stringify(JSON.stringify(acct.hist))});
    localStorage.setItem('category_history', ${JSON.stringify(JSON.stringify(acct.cats))});` : ''} } }catch(_){}
    ${extraInit}
    window.__dx=function(){ try{ var U=_intv6Universe(); var mr=_intv21MemRows(); var rw=mr?mr.map(function(r){return _intv21RowWeights(r)?1:0;}).join(''):'-';
      var ret=['7d','30d','all'].map(function(w){ var p=_aurixInvestablePerformance(w); return p&&p.valid?1:0; }).join('');
      return 'inv'+U.invested.length+' liq'+(U.liquidity.w).toFixed(2)+' rows'+rw+' hist'+(_intv22HistoryPublishable()?1:0)+' ret'+ret; }catch(e){ return 'err:'+e.message; } };
    // GRABADORA: un frame por cada cambio de composición de «Tu evolución».
    window.__frames=[]; (function(){ var last=''; var rec=function(){ try{
      var e=document.querySelector('.intv22-evo'); var k;
      if(!e) k='none'; else if(e.classList.contains('is-pending')) k='pending';
      else k=[].slice.call(e.querySelectorAll('[data-intv21-evo-metric]')).map(function(b){return b.getAttribute('data-intv21-evo-metric')+(b.classList.contains('is-on')?'*':'');}).join(',')+'|'+e.getAttribute('data-win');
      if(k!==last){ last=k; var m=(typeof _aurixAssetMemory!=='undefined')?_aurixAssetMemory:{};
        window.__frames.push({t:Math.round(performance.now()),k:k,mem:(m.state||'')+':'+((m.rows||[]).length),
          ep:(typeof _aurixPortfolioEpoch==='function')?_aurixPortfolioEpoch():null, lin:(typeof _aurixLineageColumnSeen!=='undefined')?_aurixLineageColumnSeen:null,
          na:(typeof assets!=='undefined'&&assets)?assets.length:-1, dx:(window.__dx?window.__dx():null), hp:(typeof _aurixChartPublicationSourcesPending==='function')?(_aurixChartPublicationSourcesPending().reason||'ok'):'' }); } }catch(_){} };
      new MutationObserver(rec).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['class','data-metric','data-win']}); })();`);
  const json = (route, body, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: Object.assign({ 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' }, headers), body: JSON.stringify(body) });
  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  await ctx.route('https://ozcasyufbknnuemllwso.supabase.co/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const p = u.pathname; const m = req.method();
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const who = net.currentUid ? net.currentUid() : acct.uid; const A = net.accounts ? (net.accounts[who] || acct) : acct;
    if (p.startsWith('/auth/v1/user')) return json(route, { id: who, aud: 'authenticated', role: 'authenticated', email: who + '@probe.test' });
    if (p.startsWith('/auth/v1/')) return json(route, {});
    if (p.includes('/rpc/aurix_entitlements')) return json(route, { plan: 'premium', subscription_status: 'active', source: 'subscription', features: FEATS, feature_sources: {} });
    if (m !== 'GET' && m !== 'HEAD') return json(route, [], 201);
    const table = p.split('/rest/v1/')[1] || '';
    const sel = u.searchParams.get('select') || '';
    let kind = table === 'portfolio_snapshots' ? (sel.includes('asset_values') ? 'mem' : 'snaps') : table;
    const rule = (net.rule && net.rule(kind, u)) || {};
    if (rule.delay) await delay(rule.delay);
    if (rule.hang) return;                       // nunca responde
    if (rule.fail) return json(route, { message: 'probe fail', code: 'XX000' }, 500);
    if (table === 'user_portfolios') {
      const row = Object.assign({ user_id: A.uid, assets: A.remoteModel.assets, holdings: A.remoteModel.holdings, portfolio_history: A.hist, category_history: A.cats,
        watchlist: [], updated_at: new Date(Date.now() - 3600e3).toISOString(), portfolio_epoch_ms: A.epoch, asset_classification_lineage: A.lineage, performance_state: null }, rule.row || {});
      const accept = req.headers()['accept'] || '';
      return json(route, accept.includes('vnd.pgrst.object') ? row : [row]);
    }
    if (table === 'portfolio_snapshots') {
      let rows = (rule.rows || A.snaps).slice();
      for (const [k, v] of u.searchParams) { if (k !== 'ts') continue; }
      u.searchParams.getAll('ts').forEach(c => { const [op, ...rest] = c.split('.'); const t = Date.parse(rest.join('.')); rows = rows.filter(r => op === 'gte' ? r.ts >= t : op === 'lt' ? r.ts < t : op === 'lte' ? r.ts <= t : true); });
      const asc = (u.searchParams.get('order') || '').includes('.asc'); rows.sort((a, b) => asc ? a.ts - b.ts : b.ts - a.ts);
      const lim = Number(u.searchParams.get('limit') || 1000); rows = rows.slice(0, lim);
      const out = rows.map(r => { const o = { ts: new Date(r.ts).toISOString() }; sel.split(',').forEach(c => { if (c !== 'ts') o[c] = r[c] === undefined ? null : r[c]; }); return o; });
      return json(route, out, 200, { 'content-range': '0-' + Math.max(0, out.length - 1) + '/' + A.snaps.length });
    }
    if (table === 'capital_flows') { const fl = (A.flows || []).filter(f => !u.searchParams.get('ts') || true);
      const cur = u.searchParams.getAll('ts'); const out = cur.length ? [] : fl;   // una página y fin
      return json(route, out, 200, { 'content-range': (out.length ? '0-' + (out.length - 1) : '*') + '/' + fl.length }); }
    return json(route, []);
  });
  await ctx.route(/isa-portfolio-ten\.vercel\.app|coingecko|finnhub|yahoo|stooq/, r => r.fulfill({ status: 503, body: '{}', contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } }));
  return { ctx, page, errs };
}
// Modelo remoto {assets, holdings} producido por la PROPIA app a partir de la caché plana.
async function remoteModelOf(browser, acct) {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await ctx.route('https://ozcasyufbknnuemllwso.supabase.co/**', r => r.abort());
  await ctx.addInitScript(`localStorage.setItem('portfolio_assets', ${JSON.stringify(JSON.stringify(acct.assets))});`);
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(`typeof convertToNewModel === 'function'`, null, { timeout: 60000 });
  FEATS = JSON.parse(await page.evaluate(`JSON.stringify(Object.fromEntries(_AURIX_ENT_CANON.map(function(k){ return [k, k!=='workspace.catalog_preview']; })))`));
  const m = await page.evaluate(`(function(){ var d=getPortfolioData(); var mm=(d.source==='new')?{assets:d.assets,holdings:d.holdings}:convertToNewModel(d.legacy||[]); return JSON.stringify(mm); })()`);
  await ctx.close(); return JSON.parse(m);
}

const DAY_ = 864e5;
let pass = 0; const fails = [];
const ok = (n, c, info) => { if (c) { pass++; if (process.env.VERBOSE) console.log('  ✓ ' + n); } else { fails.push(n); console.log('  ✗ ' + n + (info ? '  [' + String(info).slice(0, 600) + ']' : '')); } };
const MEM = ['top', 'effective', 'liquidity'];
const parse = (k) => (k && k.includes('|')) ? { ms: k.split('|')[0].split(',').map(x => x.replace('*', '')), on: (k.split('|')[0].split(',').find(x => x.endsWith('*')) || '').replace('*', ''), win: k.split('|')[1] } : null;
const frames = async (page) => JSON.parse(await page.evaluate('JSON.stringify(window.__frames)')).filter(f => f.k !== 'none' && f.k !== 'pending');
const fmt = (fr) => fr.map(f => f.t + 'ms ' + f.k + ' [' + f.mem + ']').join(' → ');
// Desde la primera composición con ≥2 métricas: nunca sólo Valor y ninguna métrica perdida.
function monotonic(fr, allowLoss) {
  let peak = null; const bad = [];
  for (const f of fr) { const p = parse(f.k); if (!p) continue;
    if (!peak) { if (p.ms.length >= 2) peak = new Set(p.ms); continue; }
    if (p.ms.length === 1 && p.ms[0] === 'value') bad.push('solo-valor@' + f.t);
    for (const m of peak) if (p.ms.indexOf(m) === -1 && !(allowLoss && allowLoss.has(m))) bad.push('pierde-' + m + '@' + f.t);
    p.ms.forEach(m => peak.add(m)); }
  return { peak: peak ? [...peak] : [], bad };
}
const lat = { user_portfolios: 700, snaps: 1200, mem: 500, capital_flows: 400 };
const noCpFlow = () => [{ flow_id: 'f-1', ts: new Date(Date.now() - 5 * DAY_).toISOString(), kind: 'deposit', amount: 9000, currency: 'USD', amount_usd: 9000, asset_id: 'l1', revision: 1, deleted_at: null }];
async function open(browser, A, net, width) {
  const b = await bootPage(browser, A, net, { width });
  await b.page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  await b.page.waitForFunction(`typeof switchTab==='function' && typeof _renderIntelligenceCommandCenter==='function'`, null, { timeout: 60000 });
  await b.page.waitForTimeout(1500); await b.page.evaluate(`switchTab('intelligence')`);
  return b;
}
function netFor(sc) { let memN = 0; const net = { memN: () => memN, reset: () => { memN = 0; }, rule: (k) => {
  let r = { delay: (sc.lat && sc.lat[k]) || lat[k] || 50 };
  if (k === 'mem') { memN++; const x = sc.mem && sc.mem(memN); if (x) Object.assign(r, x); }
  if (k === 'user_portfolios' && sc.row) r.row = sc.row;
  return r; } }; return net; }

const ENGINES = (process.env.ENGINES || 'CR,WK').split(','), WIDTHS = (process.env.WIDTHS || '390,1440').split(',').map(Number), ONLY = process.env.ONLY;
for (const E of ENGINES) {
  const browser = await (E === 'WK' ? PWm.webkit : PWm.chromium).launch({ headless: true });
  const base = account('u-a'); const RM = await remoteModelOf(browser, base);
  const mk = (uid, o) => { const A = account(uid, o); A.remoteModel = JSON.parse(JSON.stringify(RM)); return A; };
  for (const W of WIDTHS) {
    const tag = (n) => `${E}@${W} ${n}`;
    // ── 1 · respuesta válida seguida de pendiente / timeout / error / parcial / antigua ──
    const TRANSIENT = {
      symptom_partial_noreturn: { flows: true, mem: (n) => n > 5 ? { rowsFn: 'last1' } : null },
      partial: { mem: (n) => n > 5 ? { rowsFn: 'last1' } : null },
      error: { mem: (n) => n > 5 ? { fail: true } : null },
      pending_hang: { mem: (n) => n > 5 ? { hang: true } : null },
      timeout_slow: { mem: (n) => n > 5 ? { delay: 9500 } : null },
      empty_success: { mem: (n) => n > 5 ? { rowsFn: 'none' } : null },
    };
    for (const [name, sc] of Object.entries(TRANSIENT)) {
      if (ONLY && ONLY !== name) continue;
      const A = mk('u-a'); if (sc.flows) A.flows = noCpFlow();
      const net = netFor({ mem: (n) => { const x = sc.mem(n); if (x && x.rowsFn) { x.rows = x.rowsFn === 'last1' ? A.snaps.slice(-1) : []; } return x; } });
      const { page, ctx, errs } = await open(browser, A, net, W);
      await page.waitForTimeout(sc.mem(6) && sc.mem(6).delay ? 15000 : 9000);
      const fr = await frames(page), r = monotonic(fr);
      ok(tag(name + ' · sin degradar tras composición válida'), r.peak.length >= 2 && !r.bad.length, r.bad.join(',') + ' :: ' + fmt(fr));
      ok(tag(name + ' · Mayor y Reparto siguen'), (() => { const p = parse(fr[fr.length - 1] && fr[fr.length - 1].k); return !!p && p.ms.indexOf('top') !== -1 && p.ms.indexOf('effective') !== -1; })(), fmt(fr));
      // Preexistente en la base (onerror inline de logos de activo, app.js ~78459, sin red de logos): ajeno a esta card.
      const errs2 = errs.filter(e => !/parentElement\.classList/.test(e));
      ok(tag(name + ' · sin errores'), !errs2.length, errs2.join('|'));
      await ctx.close();
    }
    // ── 1b · respuesta ANTIGUA: una 2ª lectura lenta y parcial adelantada por una 3ª válida ──
    if (!ONLY || ONLY === 'stale_response') {
      const A = mk('u-a'); A.flows = noCpFlow();
      const net = netFor({ mem: (n) => (n > 5 && n <= 10) ? { delay: 4000, rows: A.snaps.slice(-1) } : null });
      const { page, ctx } = await open(browser, A, net, W);
      await page.waitForTimeout(5200);
      await page.evaluate(`_aurixAssetMemory.at = Date.now() - 61000; _aurixHydrateAssetMemory();`);   // la app relanza (>60 s)
      await page.waitForTimeout(6000);
      const fr = await frames(page), r = monotonic(fr);
      ok(tag('stale_response · la respuesta antigua no degrada'), r.peak.length >= 2 && !r.bad.length, r.bad.join(',') + ' :: ' + fmt(fr));
      await ctx.close();
    }
    // ── 2 · llegada desordenada de historial, memoria y linaje ──
    const ORDER = {
      mem_first_hist_late: { lat: { snaps: 4000, mem: 100, user_portfolios: 300 } },
      hist_first_mem_late: { lat: { snaps: 200, mem: 3500, user_portfolios: 300 } },
      row_last: { lat: { snaps: 600, mem: 300, user_portfolios: 4500 } },
      mem_beyond_deadline: { lat: { mem: 9000 } },
    };
    for (const [name, sc] of Object.entries(ORDER)) {
      if (ONLY && ONLY !== name) continue;
      const A = mk('u-a'); const { page, ctx } = await open(browser, A, netFor(sc), W);
      await page.waitForTimeout(name === 'mem_beyond_deadline' ? 16000 : 10000);
      const fr = await frames(page), r = monotonic(fr), last = parse(fr[fr.length - 1] && fr[fr.length - 1].k);
      ok(tag(name + ' · monotónico'), !r.bad.length, r.bad.join(',') + ' :: ' + fmt(fr));
      ok(tag(name + ' · termina con las cuatro métricas'), !!last && ['top', 'effective', 'return', 'value'].every(m => last.ms.indexOf(m) !== -1), fmt(fr));
      await ctx.close();
    }
    // ── 3 · diez ciclos de recarga / entrada / regreso ──
    if (!ONLY || ONLY === 'cycles') {
      const A = mk('u-a'); A.flows = noCpFlow();
      const net = netFor({ mem: (n) => (n > 5 && n % 2 === 0) ? { rows: A.snaps.slice(-1) } : (n > 5 && n % 3 === 0 ? { fail: true } : null) });
      const { page, ctx } = await open(browser, A, net, W);
      await page.waitForTimeout(6000);
      const seen = [];
      for (let i = 0; i < 10; i++) {
        if (i % 3 === 2) { net.reset(); await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(`typeof switchTab==='function'`, null, { timeout: 60000 }); await page.waitForTimeout(1200); await page.evaluate(`switchTab('intelligence')`); await page.waitForTimeout(6500); }
        else { await page.evaluate(`switchTab('dashboard')`); await page.waitForTimeout(250); await page.evaluate(`switchTab('intelligence')`); await page.waitForTimeout(1500); }
        const fr = await frames(page); const r = monotonic(fr); const last = parse(fr[fr.length - 1] && fr[fr.length - 1].k);
        seen.push((last ? last.ms.join('+') : '-') + (r.bad.length ? '!' + r.bad.join(',') : ''));
      }
      ok(tag('cycles · 10 ciclos sin terminar en sólo Valor ni perder métricas'), seen.every(s => !s.includes('!') && s.includes('top') && s.includes('effective')), seen.join(' | '));
      await ctx.close();
    }
    // ── 4 · cambios rápidos 7D/30D y de métrica: selección y periodo estables ──
    if (!ONLY || ONLY === 'rapid') {
      const A = mk('u-a'); const { page, ctx } = await open(browser, A, netFor({}), W);
      await page.waitForTimeout(8000);
      const seq = ['value', '7d', 'top', '30d', 'effective', '7d', 'return', '30d', 'top', '7d', 'value', '30d'];
      for (const s of seq) { const sel = /d$/.test(s) ? `[data-intv21-evo-win="${s}"]` : `[data-intv21-evo-metric="${s}"]`;
        await page.evaluate(`(function(){ var b=document.querySelector('.intv21-evo ${sel.replace(/"/g, '\\"')}'); if(b) b.click(); })()`); await page.waitForTimeout(60); }
      await page.waitForTimeout(1500);
      await page.evaluate(`switchTab('dashboard')`); await page.waitForTimeout(200); await page.evaluate(`switchTab('intelligence')`); await page.waitForTimeout(1500);
      const st = JSON.parse(await page.evaluate(`JSON.stringify({ m: (document.querySelector('.intv22-evo')||{getAttribute:function(){return null;}}).getAttribute('data-metric'), w: (document.querySelector('.intv22-evo')||{getAttribute:function(){return null;}}).getAttribute('data-win'), f: document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-intv21-evo-metric') })`));
      const fr = await frames(page), r = monotonic(fr);
      ok(tag('rapid · selección y periodo = últimos pulsados tras regresar'), st.m === 'value' && st.w === '30d', JSON.stringify(st));
      ok(tag('rapid · ninguna métrica se pierde'), !r.bad.length, r.bad.join(','));
      await ctx.close();
    }
    // ── 5 · alta y baja de posiciones ──
    if (!ONLY || ONLY === 'positions') {
      const A = mk('u-a'); const { page, ctx } = await open(browser, A, netFor({}), W);
      await page.waitForTimeout(8000);
      // Alta: una posición nueva NO invalida lo válido.
      await page.evaluate(`(function(){ var x=JSON.parse(JSON.stringify(assets.find(function(a){return a.id==='e1';}))); x.id='n1'; x.ticker=x.symbol=x.marketSymbol='IUSA'; x.name='iShares S&P 500'; x.qty=3; assets.push(x); save('add-asset'); render(true); onPortfolioChange(true); switchTab('dashboard'); switchTab('intelligence'); })()`);
      await page.waitForTimeout(2000);
      let fr = await frames(page), r = monotonic(fr);
      ok(tag('positions · alta: no degrada'), !r.bad.length, r.bad.join(',') + ' :: ' + fmt(fr));
      // Baja: lo guardado que vio la posición borrada NO se reutiliza.
      await page.evaluate(`(function(){ _aurixConfirm = function(){ return Promise.resolve(true); }; _mngAssetId='e1'; return _mngDelete(); })()`);
      await page.waitForTimeout(800); await page.evaluate(`switchTab('dashboard'); switchTab('intelligence');`); await page.waitForTimeout(2000);
      const after = JSON.parse(await page.evaluate(`JSON.stringify({ memo: (typeof _intv22AvailMemo !== 'undefined' && _intv22AvailMemo) ? _intv22AvailMemo.ids : null, fresh: Object.keys(_intv22Availability()), shown: [].slice.call(document.querySelectorAll('[data-intv21-evo-metric]')).map(function(b){return b.getAttribute('data-intv21-evo-metric');}), names: (document.querySelector('.intv21-evo-plot')||{getAttribute:function(){return '';}}).getAttribute('data-pts') })`));
      ok(tag('positions · baja: lo publicado = lo calculable HOY (nada de la posición borrada)'), JSON.stringify(after.shown.slice().sort()) === JSON.stringify(after.fresh.slice().sort()) && !(after.memo || []).includes('e1') && !String(after.names).includes('Vanguard'), JSON.stringify(after));
      await ctx.close();
    }
    // ── 6 · cambio de cuenta durante la carga ──
    if (!ONLY || ONLY === 'account_switch') {
      const A = mk('u-a'); const B = mk('u-b'); B.snaps = []; B.flows = [];
      const accounts = { 'u-a': A, 'u-b': B }; let who = 'u-a';
      const net = netFor({ mem: (n) => n > 5 ? { delay: 3000 } : null }); net.accounts = accounts; net.currentUid = () => who;
      const { page, ctx } = await open(browser, A, net, W);
      await page.waitForTimeout(7000);
      // B entra mientras la lectura de A sigue en vuelo; su cartera no tiene memoria.
      who = 'u-b';
      await page.evaluate(`(function(){ currentUser = { id: 'u-b' }; _aurixEnforceCacheOwner('u-b'); _aurixHydrateAssetMemory(); switchTab('dashboard'); switchTab('intelligence'); })()`);
      await page.waitForTimeout(5000);
      const st = JSON.parse(await page.evaluate(`JSON.stringify({ shown: [].slice.call(document.querySelectorAll('[data-intv21-evo-metric]')).map(function(b){return b.getAttribute('data-intv21-evo-metric');}), mem: _aurixAssetMemory.userId + ':' + _aurixAssetMemory.state + ':' + (_aurixAssetMemory.rows||[]).length, asB: Object.keys(typeof _intv22StableAvail === 'function' ? _intv22StableAvail({}).avail : _intv22Availability()).filter(function(m){ return ['top','effective','liquidity'].indexOf(m) !== -1; }), memoAfter: (typeof _intv22AvailMemo !== 'undefined' && _intv22AvailMemo) ? _intv22AvailMemo.key.split('|')[0] : null })`));
      ok(tag('account_switch · nada de la cuenta anterior (ni pintado ni consultable)'), !st.shown.some(m => MEM.indexOf(m) !== -1) && st.asB.length === 0 && st.memoAfter !== 'u-a', JSON.stringify(st));
      await ctx.close();
    }
    // ── 7 · revisión financiera: (a) bloqueo NO transitorio de la historia retira valor y
    //      rentabilidad; (b) filas con un activo aún no sincronizado no retiran ni reescriben
    //      la selección; (c) lo retenido de memoria caduca a las 36 h como en el owner ──
    if (!ONLY || ONLY === 'review') {
      const A = mk('u-a');
      const { page, ctx } = await open(browser, A, netFor({}), W);
      await page.waitForTimeout(8000);
      await page.evaluate(`(function(){ var b=document.querySelector('.intv21-evo [data-intv21-evo-metric="value"]'); if(b) b.click(); })()`); await page.waitForTimeout(400);
      // (a) la hidratación de snapshots falla (estado que fija su owner al fallar un fetch)
      await page.evaluate(`_aurixSetBackendSnapshotsState('failed'); switchTab('dashboard'); switchTab('intelligence');`); await page.waitForTimeout(1200);
      const a = JSON.parse(await page.evaluate(`(function(){ var r=_aurixChartPublicationSourcesPending(); return JSON.stringify({ reason: r.reason, transient: _intv22HistoryTransient(), shown: [].slice.call(document.querySelectorAll('[data-intv21-evo-metric]')).map(function(b){return b.getAttribute('data-intv21-evo-metric');}), sel: _intv21Read().evoMetric }); })()`));
      ok(tag('review · historia no transitoria: valor y rentabilidad NO se publican desde lo guardado'), a.transient || (a.shown.indexOf('value') === -1 && a.shown.indexOf('return') === -1), JSON.stringify(a));
      ok(tag('review · historia no transitoria: la selección del usuario no se reescribe'), a.sel === 'value', JSON.stringify(a));
      await page.evaluate(`_aurixSetBackendSnapshotsState('ready'); switchTab('dashboard'); switchTab('intelligence');`); await page.waitForTimeout(1500);
      await page.evaluate(`(function(){ var b=document.querySelector('.intv21-evo [data-intv21-evo-metric="effective"]'); if(b) b.click(); })()`); await page.waitForTimeout(400);
      // (b) memoria con un activo que este dispositivo aún no conoce
      await page.evaluate(`(function(){ _aurixAssetMemory.rows = _aurixAssetMemory.rows.map(function(r){ var v=Object.assign({}, r.values, { zz9: 700 }); return { ts: r.ts, values: v, re: r.re }; }); switchTab('dashboard'); switchTab('intelligence'); })()`);
      await page.waitForTimeout(800);
      const b = JSON.parse(await page.evaluate(`JSON.stringify({ shown: [].slice.call(document.querySelectorAll('[data-intv21-evo-metric]')).map(function(b){return b.getAttribute('data-intv21-evo-metric');}), sel: _intv21Read().evoMetric, held: (document.querySelector('.intv22-evo')||{getAttribute:function(){return null;}}).getAttribute('data-mem-held') })`));
      ok(tag('review · activo aún no sincronizado: Mayor y Reparto retenidos y selección intacta'), b.shown.indexOf('top') !== -1 && b.shown.indexOf('effective') !== -1 && b.sel === 'effective' && b.held === '1', JSON.stringify(b));
      // (c) 37 h después sin memoria fresca: lo retenido caduca
      await page.evaluate(`(function(){ var t0=Date.now(); _aurixNow=function(){ return t0 + 37*3600e3; }; switchTab('dashboard'); switchTab('intelligence'); })()`); await page.waitForTimeout(1200);
      const c = JSON.parse(await page.evaluate(`(function(){ return JSON.stringify({ shown: [].slice.call(document.querySelectorAll('[data-intv21-evo-metric]')).map(function(b){return b.getAttribute('data-intv21-evo-metric');}) }); })()`));
      ok(tag('review · a las 36 h lo retenido de memoria caduca'), c.shown.indexOf('top') === -1 && c.shown.indexOf('effective') === -1, JSON.stringify(c));
      await ctx.close();
    }
    // ── 8 · re-revisión: (d) memoria que nunca se asienta (fila antigua con una posición
    //      ya inexistente) — lo fresco MÁS RECIENTE gana a lo guardado; (e) con la card
    //      retenida y la memoria sin asentar, los refrescos no repintan la pestaña ──
    if (!ONLY || ONLY === 'review2') {
      const A = mk('u-a');
      const { page, ctx } = await open(browser, A, netFor({}), W);
      await page.waitForTimeout(8000);
      await page.evaluate(`(function(){ var b=document.querySelector('.intv21-evo [data-intv21-evo-metric="top"]'); if(b) b.click(); })()`); await page.waitForTimeout(400);
      // (d) la fila más antigua nombra un activo desconocido ⇒ memoria NO asentada para siempre;
      //     llega una fila nueva (venta de media posición de Bitcoin) más reciente que lo guardado.
      await page.evaluate(`(function(){ var rs=_aurixAssetMemory.rows; rs[0]=Object.assign({}, rs[0], { values: Object.assign({}, rs[0].values, { zz9: 700 }) });
        var last=rs[rs.length-1], v=Object.assign({}, last.values); v.c1=v.c1/2; rs.push({ ts: Date.now() - 1000, values: v, re: 0 }); switchTab('dashboard'); switchTab('intelligence'); })()`);
      await page.waitForTimeout(1200);
      const d = JSON.parse(await page.evaluate(`(function(){ var pl=document.querySelector('.intv22-evo .intv21-evo-plot'); var pts=pl?JSON.parse(pl.getAttribute('data-pts')):[]; var f=_intv22Availability();
        var fl=f.top?Object.keys(f.top.series).map(function(w){ var p=f.top.series[w].pts; return p[p.length-1].ts; }):[];
        return JSON.stringify({ settled: _intv22MemSettled(), metric: document.querySelector('.intv22-evo').getAttribute('data-metric'), shownLast: pts.length?pts[pts.length-1][2]:null, freshLast: fl.length?Math.max.apply(null, fl):null }); })()`));
      ok(tag('review2 · sin asentar, lo fresco más reciente gana a lo guardado'), d.settled === false && d.metric === 'top' && d.freshLast != null && d.shownLast === d.freshLast, JSON.stringify(d));
      // (e) retenida + sin asentar: cinco refrescos no reemplazan la pestaña
      await page.evaluate(`(function(){ window.__repaints=0; new MutationObserver(function(ms){ ms.forEach(function(m){ if(m.addedNodes.length) window.__repaints++; }); }).observe(document.getElementById('tabPlaceholder'), { childList: true });
        _aurixAssetMemory.rows = _aurixAssetMemory.rows.slice(0, 1); switchTab('dashboard'); switchTab('intelligence'); })()`);
      await page.waitForTimeout(1200);
      const held = await page.evaluate(`(function(){ return (document.querySelector('.intv22-evo')||{getAttribute:function(){return null;}}).getAttribute('data-mem-held'); })()`);
      // Filas de nuevo ≥2 pero con el activo desconocido: memoria presente y SIN asentar.
      await page.evaluate(`(function(){ var r0=_aurixAssetMemory.rows[0]; _aurixAssetMemory.rows=[r0, { ts: Date.now()-500, values: r0.values, re: 0 }]; window.__repaints=0; })()`);
      for (let i = 0; i < 5; i++) { await page.evaluate(`_aurixIntelScheduleRefresh()`); await page.waitForTimeout(750); }
      const e = JSON.parse(await page.evaluate(`JSON.stringify({ repaints: window.__repaints, memRows: !!_intv21MemRows(), settled: _intv22MemSettled() })`));
      ok(tag('review2 · retenida sin asentar: los refrescos no repintan'), held === '1' && e.memRows && !e.settled && e.repaints === 0, JSON.stringify(Object.assign({ held }, e)));
      await ctx.close();
    }
  }
  await browser.close();
}
closeServer();
console.log(`\nRESULT: ${fails.length ? 'FAIL' : 'PASS'} ${pass}/${pass + fails.length}`);
if (fails.length) { console.log(fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
