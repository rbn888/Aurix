#!/usr/bin/env node
/**
 * AURIX INTELLIGENCE V2 · PROFUNDIDAD SIN REPETICIÓN — sonda focal
 * ════════════════════════════════════════════════════════════════════════════
 * Navegador real sobre la app servida en local. Personas montadas por los
 * almacenes REALES (`portfolio_assets`, `portfolio_history`, `category_history`),
 * filas de servidor (`_aurixBackendSnapshots`) y la memoria por posición
 * (`_aurixAssetMemory`, las 4 filas que entrega `_aurixHydrateAssetMemory`).
 * Cada persona es COHERENTE: un precio por activo y por instante alimenta a la
 * vez los snapshots, las filas `asset_values`, el histórico local y el cambio 24 h.
 *
 *   qa14     · el estado de las capturas: 14 posiciones, 5,2 efectivas, Salud 33,
 *              Microsoft 29 %, Bitcoin 22 %, Apple 18 % (top-3 69 %), acciones 51 %,
 *              liquidez 7 %; 44 días de historia.
 *   fresh    · cuenta nueva: un punto, sin servidor.
 *   calm     · cartera estable (movimientos < 0,3 %).
 *   volatile · movimientos grandes en 24 h.
 *   flows    · compra de Bitcoin hace 10 días (flujo dentro de la ventana).
 *   stale    · último dato de hace 5 días.
 *
 *   AURIX_V2_BASELINE=/tmp/x.json → escribe Salud/Radar/Factores (correr sobre HEAD)
 *   AURIX_V2_COMPARE=/tmp/x.json  → exige Salud/Radar/Factores idénticos a la base
 *   ENGINES=CR,WK · FULL=1 (360/390/768/1024/1440 en todas las personas)
 */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const OUT = process.env.AURIX_V2_SHOTS || join(ROOT, 'docs', 'intelligence-acceptance', 'v2');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const AUTH_PATCH = x => String(x)
  .replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')
  .replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0');
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const abs = normalize(join(ROOT, p)); if (!abs.startsWith(ROOT)) return res.writeHead(403).end();
    let body = await readFile(abs);
    if (abs.endsWith('app.js')) body = Buffer.from(AUTH_PATCH(String(body)));
    res.writeHead(200, { 'content-type': MIME[extname(abs)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch (_) { res.writeHead(404).end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
let PWm;
try { PWm = await import(PW); } catch (e) { console.error('\n✗ SIN MOTOR\nRESULT: NO EJECUTADO (entorno, no candidato)'); process.exit(2); }
let pass = 0; const fails = [];
const ok = (n, c, info) => { if (c) { pass++; if (process.env.VERBOSE) console.log('  ✓ ' + n); }
  else { fails.push(n + (info ? '  [' + String(info).slice(0, 400) + ']' : '')); console.log('  ✗ ' + n + (info ? '  [' + String(info).slice(0, 400) + ']' : '')); } };
mkdirSync(OUT, { recursive: true });

const DAY = 864e5, H = 3600e3;
// [id, ticker, name, type, weight %, cambio 24 h %, deriva 30 d %]
const QA = [
  ['a1', 'MSFT', 'Microsoft', 'stock', 29, 0.8, 3.0],
  ['a2', 'BTC', 'Bitcoin', 'crypto', 22, -2.4, -5.0],
  ['a3', 'AAPL', 'Apple', 'stock', 18, 0.4, 2.0],
  ['a4', 'ETH', 'Ethereum', 'crypto', 13.5, 3.1, 6.0],
  ['a5', 'USD', 'Efectivo', 'cash', 7, 0, 0],
  ['a6', 'NVDA', 'NVIDIA', 'stock', 4, 1.2, 8.0],
  ['a7', 'SOL', 'Solana', 'crypto', 0.8, -6.1, -9.0],
  ['a8', 'ADA', 'Cardano', 'crypto', 0.8, -1.5, -4.0],
  ['a9', 'LINK', 'Chainlink', 'crypto', 0.8, 2.2, 1.0],
  ['a10', 'VWCE', 'Vanguard FTSE All-World', 'etf', 0.9, 0.3, 1.5],
  ['a11', 'IUSA', 'iShares S&P 500', 'etf', 0.8, 0.5, 2.5],
  ['a12', 'GLD', 'SPDR Gold', 'metal', 0.8, -0.2, 1.0],
  ['a13', 'PHAU', 'WisdomTree Gold', 'metal', 0.8, -0.3, 0.8],
  ['a14', 'FND', 'Fondo Global', 'fund', 0.8, 0.1, 0.5],
];
const TOTAL = 100000;
function persona(kind) {
  const now = Date.now();
  let spec = QA.map(r => r.slice());
  if (kind === 'calm') spec = spec.map(r => { r[5] = r[5] * 0.08; r[6] = r[6] * 0.1; return r; });
  if (kind === 'volatile') spec = spec.map(r => { r[5] = r[3] === 'cash' ? 0 : r[5] * 3.2; return r; });
  if (kind === 'fresh') spec = spec.slice(0, 4).map((r, i) => { r[4] = [50, 30, 15, 5][i]; return r; });
  const days = kind === 'fresh' ? 0 : 44;
  const endAt = kind === 'stale' ? now - 5 * DAY : now - H;
  // precio(t) por activo: deriva lineal hasta −24 h y el cambio 24 h en el último día
  const priceNow = {}, qty = {};
  spec.forEach(r => { priceNow[r[0]] = r[3] === 'cash' ? 1 : (r[1] === 'BTC' ? 60000 : (r[1] === 'ETH' ? 3000 : 100 + r[4])); qty[r[0]] = TOTAL * r[4] / 100 / priceNow[r[0]]; });
  // flows: la posición de BTC tenía 1/3 menos de cantidad antes de hace 10 días
  const buyAt = now - 10 * DAY, btcBefore = qty.a2 * (2 / 3);
  const price = (r, t) => {
    if (r[3] === 'cash') return 1;
    const pNow = priceNow[r[0]], c = r[5] / 100, d = r[6] / 100;
    const ref = endAt;                                     // «ahora» de la persona
    const p24 = pNow / (1 + c);
    if (t >= ref - DAY) return p24 + (pNow - p24) * Math.min(1, (t - (ref - DAY)) / DAY);
    return p24 * Math.exp(d * (t - (ref - DAY)) / (30 * DAY));
  };
  const q = (r, t) => (kind === 'flows' && r[0] === 'a2' && t < buyAt) ? btcBefore : qty[r[0]];
  const bucket = t2 => ({ cash: 'liquidity' })[t2] || t2;
  const at = (t) => {
    const vals = {}, cv = { crypto: 0, stock: 0, etf: 0, fund: 0, metal: 0, real_estate: 0, liquidity: 0, other: 0 };
    let tot = 0;
    spec.forEach(r => { const v = +(q(r, t) * price(r, t)).toFixed(2); vals[r[0]] = v; cv[bucket(r[3])] += v; tot += v; });
    Object.keys(cv).forEach(k => cv[k] = +cv[k].toFixed(2));
    return { vals, cv, tot: +tot.toFixed(2) };
  };
  const hist = [], cats = [], server = [];
  const steps = [];
  if (kind === 'fresh') steps.push(endAt);
  else { for (let i = days; i >= 1; i--) steps.push(endAt - i * DAY); steps.push(endAt); }
  steps.forEach(ts => { const s = at(ts); hist.push({ ts, value: s.tot }); cats.push(Object.assign({ ts, total: s.tot }, s.cv)); });
  // Cadencia del cron real en el último día (*/15); cada 6 h antes, para no inflar la persona.
  if (kind !== 'fresh') for (let ts = endAt - days * DAY; ts <= endAt + 1; ts += (endAt - ts <= 26 * H ? 15 * 60e3 : 6 * H)) { const s = at(ts); server.push({ ts, total_value_usd: s.tot, real_estate: 0, category_values: s.cv, confidence: 'high' }); }
  const srvTs = server.map(x => x.ts);
  const firstAtOrAfter = (t) => srvTs.find(x => x >= t);
  const memTs = kind === 'fresh' ? [] : Array.from(new Set([srvTs[srvTs.length - 1], firstAtOrAfter(now - DAY), firstAtOrAfter(now - 7 * DAY), firstAtOrAfter(now - 30 * DAY), srvTs[0]].filter(Number.isFinite))).sort((a, b) => a - b);
  const memRows = memTs.map(ts => ({ ts, values: at(ts).vals, re: 0 }));
  const assets = spec.map(r => {
    const tx = [{ type: 'buy', qty: (kind === 'flows' && r[0] === 'a2') ? btcBefore : qty[r[0]], price: price(r, now - 60 * DAY), ts: now - 60 * DAY }];
    if (kind === 'flows' && r[0] === 'a2') tx.push({ type: 'buy', qty: qty.a2 - btcBefore, price: price(r, buyAt), ts: buyAt });
    return { id: r[0], ticker: r[1], name: r[2], type: r[3], qty: qty[r[0]], price: priceNow[r[0]], assetCurrency: 'USD',
      change24h: r[3] === 'cash' ? null : r[5], transactions: tx, createdAt: now - 60 * DAY,
      ...(r[3] === 'crypto' ? { coinId: r[2].toLowerCase() } : { marketSymbol: r[1] }) };
  });
  return { hist, cats, server, memRows, assets, lineage: kind !== 'fresh', now };
}

async function inject(page, P, tab) {
  await page.evaluate(`(function(){
    var bl=document.getElementById('bootLoader'); if(bl) bl.remove(); var ar=document.getElementById('appRoot'); if(ar) ar.style.opacity='1';
    var fe=Object.create(null); _AURIX_ENT_CANON.forEach(function(k){ fe[k]=(k!=='workspace.catalog_preview'); });
    _aurixEnt={loaded:true,loading:false,error:null,plan:'premium',status:'active',source:'default',validUntil:null,features:fe,sources:Object.create(null),fetchedAt:Date.now()};
    try { _aurixActiveUserId='probe-v2'; _aurixStampCacheOwner(); } catch(_) {}
    var srv=${JSON.stringify(P.server)}; if (srv.length) { _aurixBackendSnapshots = srv; _aurixSetBackendSnapshotsState('ready'); }
    var mem=${JSON.stringify(P.memRows)}; if (typeof _aurixAssetMemory !== 'undefined' && mem.length >= 2) _aurixAssetMemory = { userId: 'probe-v2', rows: mem, state: 'ready', at: Date.now() };
    if (${P.lineage}) { var rec=_aurixLineageRead(); rec.since=Date.now()-16*864e5; rec.adoptedAt=rec.since; _aurixLineageWrite(rec); _aurixLineageColumnSeen=true; }
    switchTab(${JSON.stringify(tab)}); return true; })()`);
}
async function mount(page, kind, lng) {
  const P = persona(kind);
  await page.addInitScript(`try{ localStorage.setItem('portfolio_lang', ${JSON.stringify(lng)});
    localStorage.setItem('portfolio_assets', ${JSON.stringify(JSON.stringify(P.assets))});
    localStorage.setItem('portfolio_history', ${JSON.stringify(JSON.stringify(P.hist))});
    localStorage.setItem('category_history', ${JSON.stringify(JSON.stringify(P.cats))}); }catch(_){}`);
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(`typeof switchTab === 'function' && typeof _renderIntelligenceCommandCenter === 'function'`, null, { timeout: 60000 });
  await page.waitForTimeout(900);
  await inject(page, P, 'intelligence');
  await page.waitForTimeout(1400);
  return P;
}
const READ = `(function(){
  var vis = function(e){ if(!e) return false; var r=e.getBoundingClientRect(); var cs=getComputedStyle(e); return r.width>0 && r.height>0 && cs.display!=='none' && cs.visibility!=='hidden'; };
  var pick = function(s){ return [].slice.call(document.querySelectorAll(s)).filter(vis)[0] || null; };
  var txt = function(e){ return e ? e.textContent.replace(/\\s+/g,' ').trim() : ''; };
  var hash = function(s){ var h=0; for (var i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return h; };
  var root = document.querySelector('.aurix-intcc');
  var kids = root ? [].slice.call(root.children).filter(vis) : [];
  var cards = kids.map(function(e){ var r=e.getBoundingClientRect(); return { full: e.className, c: e.className.split(' ').filter(function(x){ return /^(intcc-|intv)/.test(x); }).slice(0,2).join('.'), l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top+scrollY), b: Math.round(r.bottom+scrollY), sw: e.scrollWidth - e.clientWidth }; });
  var overlaps = [];
  for (var i=0;i<cards.length;i++) for (var j=i+1;j<cards.length;j++) { var a=cards[i], b=cards[j]; if (a.l < b.r-1 && b.l < a.r-1 && a.t < b.b-1 && b.t < a.b-1) overlaps.push(a.c+'×'+b.c); }
  var health = pick('.intcc-hero-score') || pick('.intcc-m-health');
  var radar = pick('.intv7-radar') || pick('.intcc-radar'); var drv = pick('.intcc-drivers');
  var hoy = pick('.intv5-matters'); var evo = pick('.intv21-evo'); var mv = pick('.intv21-movers'); var sc = pick('.intv21-scen');
  var ex = pick('.intcc-explore'); var log = pick('.intv21-log'); var tagsBox = pick('.intv21-tags');
  var reg = (typeof debugAurixIntelFacts === 'function') ? debugAurixIntelFacts() : null;
  var avail = {}; try { _INTV21_EVO_METRICS.forEach(function(m){ avail[m] = _INTV21_EVO_WINS.filter(function(w){ return !!_intv21EvoSeries(m,w); }); }); } catch(_){}
  var att = null; try { att = _intv21Attribution(); } catch(_){}
  var scn = null; try { scn = _intv21Scenarios(_intv21Weights()).map(function(s){ return { id: s.id, impact: +s.impact.toFixed(3), names: s.names }; }); } catch(_){}
  return JSON.stringify({
    err: null, screen: txt(root), cards: cards, overlaps: overlaps,
    hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    healthVal: health ? txt(health.querySelector('.intcc-score-val')) : null, healthBadge: txt(pick('.intcc-health-badge')),
    radarHash: radar ? hash(radar.outerHTML.replace(/\\s+/g,' ')) : 0, driversHash: drv ? hash(drv.outerHTML.replace(/\\s+/g,' ')) : 0,
    drvText: txt(drv),
    tags: tagsBox ? [].slice.call(tagsBox.querySelectorAll('.intv21-tag')).map(function(t){ return { id: t.getAttribute('data-tag'), dim: t.getAttribute('data-dim'), label: txt(t.querySelector('.intv21-tag-go')), go: t.querySelector('.intv21-tag-go').getAttribute('data-intv21-go'), fit: t.scrollWidth <= t.clientWidth + 1 && t.getBoundingClientRect().right <= tagsBox.getBoundingClientRect().right + 1 }; }) : [],
    hoy: hoy ? { items: Number(hoy.getAttribute('data-items')), rows: [].slice.call(hoy.querySelectorAll('.intv4-story')).map(function(s){ return { k: s.getAttribute('data-kind') || 'core', f: s.getAttribute('data-fact'), t: txt(s) }; }), text: txt(hoy) } : null,
    evo: evo ? { metric: evo.getAttribute('data-metric'), win: evo.getAttribute('data-win'), kind: evo.getAttribute('data-kind'), pts: Number(evo.getAttribute('data-points')),
      metrics: [].slice.call(evo.querySelectorAll('[data-intv21-evo-metric]')).map(function(b){ return b.getAttribute('data-intv21-evo-metric'); }),
      wins: [].slice.call(evo.querySelectorAll('[data-intv21-evo-win]')).map(function(b){ return b.getAttribute('data-intv21-evo-win'); }),
      evRows: document.querySelectorAll('.intv4-memory .intv15-stable-row').length, head: txt(pick('.intv4-memory .intv15-stable-head')) } : null,
    avail: avail,
    movers: mv ? { range: mv.getAttribute('data-range'), rows: [].slice.call(mv.querySelectorAll('.intv21-mv-row')).map(function(r){ return txt(r); }) } : null,
    att: att ? { range: att.range, sum: +att.sum.toFixed(3), twr: +att.twr.toFixed(3), ups: att.ups.map(function(x){ return x.name + ' ' + x.c.toFixed(3); }), downs: att.downs.map(function(x){ return x.name + ' ' + x.c.toFixed(3); }) } : null,
    scen: sc ? { id: sc.getAttribute('data-scen'), impact: Number(sc.getAttribute('data-impact')), text: txt(sc) } : null, scn: scn,
    explore: ex ? [].slice.call(ex.querySelectorAll('.intcc-x-q')).map(function(b){ return { id: b.getAttribute('data-intcc-q'), label: txt(b) }; }) : [],
    log: log ? Number(log.getAttribute('data-items')) : 0,
    dups: reg ? reg.duplicates : null, nFacts: reg ? reg.facts.length : 0,
    factsBad: reg ? reg.facts.filter(function(f){ return !f.factId || !f.family || !f.owner; }).length : null,
  });
})()`;
const ORDER = ['intcc-hero', 'intcc-radar', 'intcc-drivers', 'intcc-explore', 'intcc-watch', 'intcc-timeline', 'intv21-movers', 'intv21-scen', 'intv21-log'];
const orderOf = (cards) => cards.map(c => ORDER.findIndex(o => c.c.split('.').indexOf(o) !== -1 || c.c.indexOf(o) === 0)).filter(i => i >= 0);
const BASE = process.env.AURIX_V2_BASELINE, CMP = process.env.AURIX_V2_COMPARE;
const prior = CMP && existsSync(CMP) ? JSON.parse(readFileSync(CMP, 'utf8')) : null;
const baseline = {};
const ENGINES = (process.env.ENGINES || 'CR,WK').split(',');
const FULL = !!process.env.FULL;
const PERSONAS = (process.env.PERSONAS || 'qa14,fresh,calm,volatile,flows,stale').split(',');
for (const E of ENGINES) {
  const browser = await (E === 'WK' ? PWm.webkit : PWm.chromium).launch({ headless: true });
  for (const kind of PERSONAS) for (const lng of (process.env.LANGS || 'es,en').split(',')) {
    const widths = process.env.WIDTHS ? process.env.WIDTHS.split(',').map(Number) : ((kind === 'qa14' || FULL) ? [360, 390, 768, 1024, 1440] : [390, 1440]);
    for (const w of widths) {
      const T = `[${E} ${kind} ${lng} ${w}]`;
      const ctx = await browser.newContext({ viewport: { width: w, height: w < 768 ? 844 : 1000 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const errs = []; page.on('pageerror', e => errs.push(e.message));
      const P = await mount(page, kind, lng);
      const r = JSON.parse(await page.evaluate(READ));
      const key = [kind, lng, w].join('|');
      if (E === 'CR') baseline[key] = { hv: r.healthVal, hb: r.healthBadge, radar: r.radarHash, drivers: r.driversHash };
      if (BASE) { await ctx.close(); continue; }
      ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | '));
      ok(`${T} sin scroll horizontal ni cards solapadas`, !r.hscroll && r.overlaps.length === 0 && r.cards.every(c => c.sw <= 1 || /intcc-m-hero|intcc-hero/.test(c.full)), JSON.stringify(r.overlaps) + JSON.stringify(r.cards.filter(c => c.sw > 1 && !/intcc-m-hero|intcc-hero/.test(c.full))));
      ok(`${T} cero hechos duplicados por fact_id/familia/periodo`, Array.isArray(r.dups) && r.dups.length === 0 && r.factsBad === 0, JSON.stringify(r.dups));
      ok(`${T} nunca «No hay nada que destacar» como contenido`, !/nada que destacar|nothing to highlight/i.test(r.screen));
      const ord = orderOf(r.cards);
      ok(`${T} orden: Intelligence+Salud → Radar/Factores/Explora → Hoy/Evolución → Movió/Escenarios → Registro`, ord.every((x, i) => i === 0 || x >= ord[i - 1]), JSON.stringify(r.cards.map(c => c.c)));
      if (prior && prior[key]) {
        const p = prior[key];
        ok(`${T} Salud, Radar y Factores idénticos a HEAD`, p.hv === r.healthVal && p.hb === r.healthBadge && p.radar === r.radarHash && p.drivers === r.driversHash,
          JSON.stringify({ p, now: { hv: r.healthVal, hb: r.healthBadge, radar: r.radarHash, drivers: r.driversHash } }));
      }
      ok(`${T} Hoy publica entre 2 y 4 hechos`, r.hoy && r.hoy.items >= 2 && r.hoy.items <= 4, JSON.stringify(r.hoy));
      ok(`${T} etiquetas del hero: ≤3, dimensiones distintas, sin cifras, contenidas`, r.tags.length <= 3 && new Set(r.tags.map(t => t.dim)).size === r.tags.length
        && r.tags.every(t => !/\d/.test(t.label) && t.fit), JSON.stringify(r.tags));
      const ux = await page.evaluate(`(function(){ var vis=function(e){ return e && e.getBoundingClientRect().width>0; };
        var mh=document.querySelector('.intcc-m-health'); var hl=mh && vis(mh) ? [].slice.call(mh.querySelectorAll('.intcc-m-health-tag')).map(function(e){ return e.textContent.trim().toLowerCase(); }) : [];
        var tl=[].slice.call(document.querySelectorAll('.intv21-tag')).filter(vis).map(function(e){ return e.querySelector('.intv21-tag-go').textContent.trim().toLowerCase(); });
        var links=[].slice.call(document.querySelectorAll('[data-intel-see-changes]')).filter(vis).map(function(a){ return !!document.getElementById(String(a.getAttribute('href')).replace('#','')); });
        return { dup: tl.filter(function(x){ return hl.indexOf(x) !== -1; }), links: links }; })()`);
      ok(`${T} ninguna etiqueta del hero repite una etiqueta visible de Salud; todo enlace del hero tiene destino`, ux.dup.length === 0 && ux.links.every(Boolean), JSON.stringify(ux));
      ok(`${T} Tu evolución: titular + ≤2 evidencias`, !r.evo || r.evo.evRows <= 2, JSON.stringify(r.evo));
      if (kind === 'qa14') {
        ok(`${T} QA · Salud 33`, r.healthVal === '33', r.healthVal);
        ok(`${T} QA · 2–3 etiquetas; «Concentración elevada» visible una sola vez (hero, o Salud en móvil)`, r.tags.length >= 2 && (r.tags.some(t => t.id === 'tag_conc' && /Concentración elevada|High concentration/.test(t.label))
          || (w <= 640 && /Concentración elevada|High concentration/.test(r.screen))), JSON.stringify(r.tags));
        ok(`${T} QA · Hoy: rentabilidad 24 h, contribución y movimiento de precio, distinguidos`, r.hoy.rows.some(x => x.k === 'return') && r.hoy.rows.some(x => x.k === 'driver' && /contribu/i.test(x.t))
          && r.hoy.rows.some(x => x.k === 'mover' && /precio|price/i.test(x.t))
          // cripto cotiza 24/7 («24 h»); acciones/ETF/metales dicen «última sesión»
          && r.hoy.rows.filter(x => x.k === 'mover').every(x => /Solana|Bitcoin|Ethereum|Cardano|Chainlink/.test(x.t) ? /24 h/.test(x.t) : /última sesión|last session/.test(x.t)), JSON.stringify(r.hoy.rows));
        ok(`${T} QA · Escenarios: Microsoft −10 % ≈ −2,9 %, Top 3 ≈ −6,9 %, Acciones ≈ −5,1 %`, r.scn && Math.abs(r.scn.find(s => s.id === 'top1').impact + 2.9) < 0.01
          && Math.abs(r.scn.find(s => s.id === 'top3').impact + 6.9) < 0.01 && Math.abs(r.scn.find(s => s.id === 'class').impact + 5.1) < 0.01
          && /−2[.,]9%/.test(r.scen.text) && /(hipotético, no una previsión|not a forecast)/i.test(r.scen.text), JSON.stringify({ scn: r.scn, t: r.scen && r.scen.text }));
        ok(`${T} QA · Tu evolución ofrece 7D, 30D y Desde inicio en rentabilidad y las cinco métricas`, r.avail.return && r.avail.return.join() === '7d,30d,all'
          && ['value', 'top', 'liquidity', 'diversification'].every(m => (r.avail[m] || []).length) && r.evo && r.evo.pts >= 2, JSON.stringify({ a: r.avail, e: r.evo }));
        ok(`${T} QA · Qué movió: contribuciones certificadas que concilian con la rentabilidad flow-neutral (mismo signo, ≤ máx(0,1 pp, 10 %))`, r.movers && r.att && Math.abs(r.att.sum - r.att.twr) <= Math.max(0.1, 0.1 * Math.abs(r.att.twr))
          && (Math.sign(r.att.sum) === Math.sign(r.att.twr))
          && r.movers.rows.length >= 2, JSON.stringify({ m: r.movers, a: r.att }));
        ok(`${T} QA · Explora: 3–4 preguntas contextuales con Microsoft y Bitcoin`, r.explore.length >= 3 && r.explore.length <= 4 && r.explore.filter(q => /^ctx_/.test(q.id)).length >= 3
          && r.explore.some(q => q.id === 'ctx_top2' && /Microsoft/.test(q.label) && /Bitcoin/.test(q.label)), JSON.stringify(r.explore));
      }
      if (kind === 'qa14' && w === 1440) {
        // Revisión financiera · casos adversariales.
        const adv = JSON.parse(await page.evaluate(`(function(){
          var out = {};
          // 1 · ORO FÍSICO: 1 g de 18 k comprado hace 10 días a 2.400 $/oz. Su flujo real son
          //     ≈ 58 $ (no 2.400): nunca puede salir como una contribución de −1 pp.
          var keep = assets.slice(), mem = JSON.parse(JSON.stringify(_aurixAssetMemory));
          var now = Date.now();
          assets.push({ id: 'xau1', ticker: 'XAU', name: 'Oro físico', type: 'metal', karat: 18, goldUnit: 'g', qty: 1, price: 2400, assetCurrency: 'USD',
            transactions: [{ type: 'buy', qty: 1, price: 2400, ts: now - 10 * 864e5 }] });
          _aurixAssetMemory.rows[_aurixAssetMemory.rows.length - 1].values.xau1 = +(1 * 0.75 * 2400 / 31.1035).toFixed(2);
          var a = _intv21Attribution();
          var g = a ? a.ups.concat(a.downs).filter(function(x){ return x.id === 'xau1'; })[0] : null;
          out.gold = { published: !!a, c: g ? +g.c.toFixed(4) : null };
          assets.length = 0; keep.forEach(function(x){ assets.push(x); }); _aurixAssetMemory = mem;
          // 2 · LIQUIDEZ: sin linaje que cubra la ventana no hay liquidez histórica.
          out.liqAll = !!_intv21EvoSeries('liquidity', 'all');
          out.liqCov = _aurixClassificationValidity('liquidity', _aurixAssetMemory.rows[0].ts, now).validity;
          return JSON.stringify(out); })()`));
        ok(`${T} revisión · oro físico: el flujo se valora en gramos y quilates (nunca −1 pp por 1 g)`, !adv.gold.published || adv.gold.c == null || Math.abs(adv.gold.c) < 0.1, JSON.stringify(adv.gold));
        ok(`${T} revisión · liquidez histórica sólo con linaje que cubra la ventana`, adv.liqAll === false && adv.liqCov !== 'no_reclassification_recorded'
          && !r.explore.some(q => q.id === 'ctx_liq_start'), JSON.stringify(adv));
      }
      if (kind === 'fresh') {
        ok(`${T} cuenta nueva: sin Qué movió y sin rentabilidad inventada`, !r.movers && !(r.hoy.rows || []).some(x => x.k === 'return' || x.k === 'driver'), JSON.stringify(r.hoy));
      }
      if (kind === 'stale') {
        ok(`${T} datos obsoletos: Hoy no publica precios ni contribución de 24 h`, !(r.hoy.rows || []).some(x => x.k === 'driver' || x.k === 'mover' || x.k === 'return'), JSON.stringify(r.hoy.rows));
      }
      if (kind === 'flows') {
        ok(`${T} flujos: la compra no cuenta como contribución (o la card no aparece)`, !r.att || Math.abs(r.att.sum - r.att.twr) <= Math.max(0.1, 0.1 * Math.abs(r.att.twr)), JSON.stringify(r.att));
      }
      if (kind === 'volatile') {
        ok(`${T} volátil: Hoy nombra el activo que más pesó y el mayor movimiento de precio`, r.hoy.rows.some(x => x.k === 'driver') && r.hoy.rows.some(x => x.k === 'mover'), JSON.stringify(r.hoy.rows));
      }
      // Interacción, persistencia, recarga y vuelta: una vez por motor e idioma en QA (390 y 1440).
      if (kind === 'qa14' && (w === 390 || w === 1440)) {
        await page.screenshot({ path: join(OUT, `${E}-${kind}-${lng}-${w}.png`), fullPage: true });
        const before = await page.evaluate(`document.querySelector('.intv21-evo') && document.querySelector('.intv21-evo').getAttribute('data-metric')`);
        await page.locator('.intv21-evo [data-intv21-evo-metric="liquidity"]:visible').first().click();
        await page.waitForTimeout(250);
        const after = await page.evaluate(`(function(){ var e=document.querySelector('.intv21-evo'); return e ? [e.getAttribute('data-metric'), e.getAttribute('data-kind'), document.activeElement && document.activeElement.getAttribute('data-intv21-evo-metric'), document.querySelectorAll('.aurix-intcc').length] : null; })()`);
        ok(`${T} evolución: cambiar de métrica actualiza sólo el módulo y conserva el foco`, before && after && after[0] === 'liquidity' && after[1] === 'dots' && after[2] === 'liquidity' && after[3] === 1, JSON.stringify([before, after]));
        const plot = page.locator('.intv21-evo-plot:visible').first();
        await plot.scrollIntoViewIfNeeded(); await page.waitForTimeout(150);
        const bb = await plot.boundingBox();
        await page.mouse.move(bb.x + bb.width * 0.98, bb.y + bb.height / 2); await page.waitForTimeout(120);
        const tip = await page.evaluate(`(function(){ var t=[].slice.call(document.querySelectorAll('.intv21-evo-tip.is-on')); return t.length ? t[0].textContent : ''; })()`);
        ok(`${T} tooltip: fecha real y valor del punto`, /\d/.test(tip) && /%/.test(tip), tip);
        await plot.focus(); await page.keyboard.press('Home');
        const kb = await page.evaluate(`(function(){ var p=document.querySelector('.intv21-evo-plot'); return p ? p.getAttribute('data-tip') : null; })()`);
        ok(`${T} teclado: Inicio lleva al primer punto`, kb === '0', kb);
        await page.locator('.intv21-scen [data-intv21-scen="top3"]').first().click(); await page.waitForTimeout(200);
        const sc2 = await page.evaluate(`document.querySelector('.intv21-scen').getAttribute('data-scen')`);
        ok(`${T} escenario: el selector cambia el escenario`, sc2 === 'top3', sc2);
        // «Entendido» en Qué ha cambiado: el hecho pasa a ser HISTORIA y vive sólo en el Registro.
        const ackFact = await page.evaluate(`(function(){ var b=[].slice.call(document.querySelectorAll('.intv4-changed [data-intel-ack]')).filter(function(e){ return e.getBoundingClientRect().width>0; })[0];
          return b ? b.closest('[data-fact]').getAttribute('data-fact') : null; })()`);
        if (ackFact) {
          await page.locator('.intv4-changed [data-intel-ack]:visible').first().click(); await page.waitForTimeout(400);
          const lg = await page.evaluate(`(function(){ var f=${JSON.stringify(ackFact)};
            var inLog=[].slice.call(document.querySelectorAll('.intv21-log [data-fact]')).filter(function(e){ return e.getAttribute('data-fact')===f; });
            var inChg=[].slice.call(document.querySelectorAll('.intv4-changed [data-fact]')).filter(function(e){ return e.getAttribute('data-fact')===f; });
            var inEvo=String((document.querySelector('.intv4-memory')||{getAttribute:function(){return '';}}).getAttribute('data-evo-keys')||'').split(',').indexOf(f) !== -1;
            var link=document.querySelector('[data-intel-see-changes]');
            return { log: inLog.length, evo: inEvo, state: inLog[0] && inLog[0].getAttribute('data-state'), chg: inChg.length, href: link && link.getAttribute('href'), dups: (debugAurixIntelFacts()||{}).duplicates }; })()`);
          // Un hecho revisado es historia: lo publica el Registro, o Tu evolución si lo reclama como titular. Nunca los dos.
          const lk = await page.evaluate(`[].slice.call(document.querySelectorAll('[data-intel-see-changes]')).filter(function(a){ return a.getBoundingClientRect().width>0; }).every(function(a){ return !!document.getElementById(String(a.getAttribute('href')).replace('#','')); })`);
          ok(`${T} tras revisar, el enlace de historial del hero sólo existe si su destino existe`, lk === true, String(lk));
          ok(`${T} revisar un cambio lo saca de Qué ha cambiado y queda con UN dueño (Registro o Evolución)`, (lg.log + (lg.evo ? 1 : 0)) === 1 && (!lg.log || lg.state === 'reviewed') && lg.chg === 0
            && (!lg.href || lg.href === '#aurix-intel-log' || lg.href === '#aurix-intel-changes') && Array.isArray(lg.dups) && lg.dups.length === 0, JSON.stringify(lg));
        }
        const tagId = await page.evaluate(`(function(){ var t=[].slice.call(document.querySelectorAll('.intv21-tag')).filter(function(e){ return e.getBoundingClientRect().width>0; })[0]; return t ? t.getAttribute('data-tag') : null; })()`);
        if (tagId) { await page.locator(`.intv21-tag[data-tag="${tagId}"] .intv21-tag-x:visible`).first().click(); await page.waitForTimeout(200); }
        // recarga + vuelta a Intelligence
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(`typeof switchTab === 'function'`, null, { timeout: 60000 }); await page.waitForTimeout(900);
        await inject(page, P, 'home');
        await page.waitForTimeout(500);
        await page.evaluate(`switchTab('intelligence')`); await page.waitForTimeout(1200);
        const per = await page.evaluate(`(function(){ var e=document.querySelector('.intv21-evo'), s=document.querySelector('.intv21-scen');
          return { m: e && e.getAttribute('data-metric'), s: s && s.getAttribute('data-scen'), tags: [].slice.call(document.querySelectorAll('.intv21-tag')).map(function(t){ return t.getAttribute('data-tag'); }), n: document.querySelectorAll('.aurix-intcc').length,
            dups: (debugAurixIntelFacts()||{}).duplicates }; })()`);
        ok(`${T} recarga y vuelta: métrica, escenario y etiqueta oculta persisten; cero duplicados`, per.n === 1 && per.s === 'top3' && (!tagId || per.tags.indexOf(tagId) === -1) && Array.isArray(per.dups) && per.dups.length === 0
          && per.m === 'liquidity', JSON.stringify(per));
      }
      if (process.env.SHOTS_ALL) await page.screenshot({ path: join(OUT, `${E}-${kind}-${lng}-${w}.png`), fullPage: true });
      await ctx.close();
    }
  }
  await browser.close();
}
if (BASE) { await writeFile(BASE, JSON.stringify(baseline, null, 1)); console.log('baseline → ' + BASE); process.exit(0); }
server.close();
console.log(`\n${pass}/${pass + fails.length}`);
if (fails.length) { console.log('\nRESULT: NO-GO'); process.exit(1); }
console.log('RESULT: GO');
process.exit(0);
