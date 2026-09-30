#!/usr/bin/env node
/**
 * AURIX INTELLIGENCE · EVOLUCIÓN REAL Y CERO REPETICIÓN — sonda focal
 * ════════════════════════════════════════════════════════════════════════════
 * Navegador real (Chromium) sobre la app servida en local, con personas montadas
 * por los almacenes REALES (`portfolio_history`, `category_history`) y filas de
 * servidor (`_aurixBackendSnapshots`) como las entrega el loader. Cubre los diez
 * casos del SPEC a 390 y 1440 px, ES y EN.
 *   AURIX_EVO_BASELINE=/tmp/x.json  → escribe la línea base (HEAD)
 *   AURIX_EVO_COMPARE=/tmp/x.json   → exige Radar/Factores/Explora/Hero y Salud idénticos
 */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const OUT = join(ROOT, 'docs', 'intelligence-acceptance');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
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
let chromium;
try { ({ chromium } = await import(PW)); }
catch (e) { console.error('\n✗ SIN MOTOR\nRESULT: NO EJECUTADO (entorno, no candidato)'); process.exit(2); }
let pass = 0; const fails = [];
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); }
  else { fails.push(n + (info ? '  [' + info + ']' : '')); console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };
mkdirSync(OUT, { recursive: true });

const DAY = 864e5;
const W = { crypto: 0.6656, stock: 0.0619, etf: 0.1857, liquidity: 0.0402 };
const ASSETS = [
  { id: 'a1', ticker: 'BTC', name: 'Bitcoin', type: 'crypto', qty: 0.5, price: 60000, assetCurrency: 'USD' },
  { id: 'a2', ticker: 'ETH', name: 'Ethereum', type: 'crypto', qty: 5, price: 3000, assetCurrency: 'USD' },
  { id: 'a3', ticker: 'VWCE', name: 'Vanguard FTSE All-World', type: 'etf', qty: 100, price: 120, assetCurrency: 'USD' },
  { id: 'a4', ticker: 'AAPL', name: 'Apple', type: 'stock', qty: 20, price: 200, assetCurrency: 'USD' },
  { id: 'a5', ticker: 'USD', name: 'Efectivo', type: 'cash', qty: 2600, price: 1, assetCurrency: 'USD' }];
// PERSONAS
//   young1  · cuenta de 44 días con UN solo punto (historial y servidor)
//   local44 · 44 días de serie de nivel local, servidor no hidratado
//   dense   · 44 días de filas de servidor válidas, linaje de cuenta desde hace 16 días
//   jump    · como dense, con +3,2 % en las últimas 24 h
function persona(kind) {
  const now = Date.now(); const hist = [], cats = [], server = [];
  const days = 44;
  const pts = (kind === 'young1') ? [0] : Array.from({ length: days + 1 }, (_, k) => days - k);
  for (const i of pts) {
    const ts = now - i * DAY; const total = 64600 * (1 + Math.sin(((days - i) / days) * Math.PI) * -0.05);
    hist.push({ ts, value: +total.toFixed(2) });
    cats.push({ ts, total: +total.toFixed(2), crypto: +(total * W.crypto).toFixed(2), stock: +(total * W.stock).toFixed(2), etf: +(total * W.etf).toFixed(2), fund: 0, metal: 0, real_estate: 0, liquidity: +(total * W.liquidity).toFixed(2), other: 0 });
  }
  const mk = (ts) => { const total = 64600; const cv = {}; let s = 0; for (const k in W) { cv[k] = +(total * W[k]).toFixed(2); s += cv[k]; } cv.crypto = +(cv.crypto + (total - s)).toFixed(2); return { ts, total_value_usd: total, real_estate: 0, category_values: cv, confidence: 'high' }; };
  if (kind === 'young1') server.push(mk(now - 2 * 3600e3));
  if (kind === 'dense' || kind === 'jump') for (let i = days * 4; i >= 0; i--) server.push(mk(now - i * 6 * 3600e3));
  if (kind === 'jump') { const last = hist[hist.length - 1]; last.value = +(hist[hist.length - 2].value * 1.032).toFixed(2);
    const lc = cats[cats.length - 1]; const f = last.value / lc.total; for (const k in lc) if (k !== 'ts') lc[k] = +(lc[k] * f).toFixed(2); }
  return { hist, cats, server, lineage: kind === 'dense' || kind === 'jump', createdAt: now - 44 * DAY };
}
async function mount(page, kind, lng) {
  const P = persona(kind);
  await page.addInitScript(`try{ localStorage.setItem('portfolio_lang', ${JSON.stringify(lng)});
    localStorage.setItem('portfolio_assets', ${JSON.stringify(JSON.stringify(ASSETS))});
    localStorage.setItem('portfolio_history', ${JSON.stringify(JSON.stringify(P.hist))});
    localStorage.setItem('category_history', ${JSON.stringify(JSON.stringify(P.cats))}); }catch(_){}`);
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(`typeof switchTab === 'function' && typeof _renderIntelligenceCommandCenter === 'function'`, null, { timeout: 60000 });
  await page.waitForTimeout(900);
  await page.evaluate(`(function(){
    var bl=document.getElementById('bootLoader'); if(bl) bl.remove(); var ar=document.getElementById('appRoot'); if(ar) ar.style.opacity='1';
    var fe=Object.create(null); _AURIX_ENT_CANON.forEach(function(k){ fe[k]=(k!=='workspace.catalog_preview'); });
    _aurixEnt={loaded:true,loading:false,error:null,plan:'premium',status:'active',source:'default',validUntil:null,features:fe,sources:Object.create(null),fetchedAt:Date.now()};
    try { _aurixActiveUserId='probe-evo'; _aurixStampCacheOwner(); } catch(_) {}
    var srv=${JSON.stringify(P.server)}; if (srv.length) { _aurixBackendSnapshots = srv; _aurixSetBackendSnapshotsState('ready'); }
    if (${P.lineage}) { var rec=_aurixLineageRead(); rec.since=Date.now()-16*864e5; rec.adoptedAt=rec.since; _aurixLineageWrite(rec); _aurixLineageColumnSeen=true; }
    switchTab('intelligence'); return true; })()`);
  await page.waitForTimeout(1200);
}
const READ = `(function(){
  var scr = document.querySelector('.aurix-intcc') || document.querySelector('#aurixIntelligence') || document.body;
  var vis = function(e){ if(!e) return false; var r=e.getBoundingClientRect(); var cs=getComputedStyle(e); return r.width>0 && r.height>0 && cs.display!=='none' && cs.visibility!=='hidden'; };
  var pick = function(s){ return [].slice.call(document.querySelectorAll(s)).filter(vis)[0] || null; };
  var txt = function(e){ return e ? e.textContent.replace(/\\s+/g,' ').trim() : ''; };
  var mem = pick('.intv4-memory'), ch = pick('.intv4-changed'), hoy = pick('.intv5-matters'), radar = pick('.intv7-radar');
  var health = pick('.intcc-hero-score') || pick('.intcc-m-health');
  var ht = health ? health.querySelector('.intcc-hero-health-label, .intcc-card-title') : null;
  var rt = radar ? radar.querySelector('.intcc-card-title') : null;
  var sty = function(e){ if(!e) return null; var c=getComputedStyle(e), b=getComputedStyle(e,'::before'); return [c.fontFamily,c.fontSize,c.fontWeight,c.letterSpacing,c.textTransform,c.color,b.width,b.backgroundColor].join('|'); };
  var strip = function(e){ if(!e) return ''; var c=e.cloneNode(true); c.querySelectorAll('.intcc-hero-score, [data-review-pending]').forEach(function(x){ x.removeAttribute('data-review-pending'); }); var s=c.querySelector('.intcc-hero-score'); if(s) s.remove(); return c.innerHTML.replace(/\\s+/g,' '); };
  var hash = function(s){ var h=0; for (var i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return h; };
  var screen = txt(scr);
  var cashPct = null; try { cashPct = _aurixHealthSnapshot().cashPct; } catch(_){}
  var cards = [].slice.call(document.querySelectorAll('.aurix-intcc .intcc-card, .aurix-intcc > section')).filter(vis).map(function(e){ var r=e.getBoundingClientRect(); return { c:e.className.split(' ').slice(0,3).join('.'), t:Math.round(r.top+scrollY), b:Math.round(r.bottom+scrollY), l:Math.round(r.left), r:Math.round(r.right), h:Math.round(r.height), empty: !txt(e) }; });
  return JSON.stringify({
    screen: screen, mem: txt(mem), memClass: mem ? mem.className : '', changed: ch ? txt(ch) : null, hoy: txt(hoy),
    healthText: txt(health), healthVal: health ? txt(health.querySelector('.intcc-score-val')) : null,
    healthBadge: txt(document.querySelector('.intcc-health-badge')), healthState: health ? (health.closest('[data-health-state]')||health).getAttribute('data-health-state') : null,
    healthMetric: !!document.querySelector('.intv17-health-metric'),
    healthTitle: txt(ht), healthTitleStyle: sty(ht), radarTitleStyle: sty(rt),
    radarHash: radar ? hash(radar.outerHTML.replace(/\\s+/g,' ')) : 0,
    driversHash: (function(){ var d=pick('.intcc-drivers, .intv5-drivers, [data-state="drivers"]'); return d ? hash(d.outerHTML.replace(/\\s+/g,' ')) : 0; })(),
    exploreHash: (function(){ var d=pick('.intcc-explore, .intv5-explore, [data-state="explore"]'); return d ? hash(d.outerHTML.replace(/\\s+/g,' ')) : 0; })(),
    heroHash: (function(){ var d=pick('.intcc-hero') || pick('.intcc-m-hero'); return d ? hash(strip(d)) : 0; })(),
    pending: (document.querySelector('[data-review-pending]')||{getAttribute:function(){return null;}}).getAttribute('data-review-pending'),
    seeChanges: txt(pick('[data-intel-see-changes]')),
    cashPct: cashPct, cards: cards, hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 });
})()`;
const FORBIDDEN = [/días observando/i, /days observing/i, /no puede comparar ninguna/i, /cannot compare any/i,
  /compara los extremos del periodo/i, /movimiento que fuese y volviese/i, /días de historial certificado/i,
  /days of certified history/i, /todavía no compara el peso/i, /Reparto del peso entre posiciones/i,
  /Weight spread across positions/i, /ya neutralizadas tus aportaciones/i, /El nivel es una afirmación/i,
  /El porcentaje mide cómo se reparte/i, /no puede decirte qué activo explicó/i, /cannot tell you which asset/i];

const BASE = process.env.AURIX_EVO_BASELINE, CMP = process.env.AURIX_EVO_COMPARE;
const prior = CMP && existsSync(CMP) ? JSON.parse(readFileSync(CMP, 'utf8')) : null;
const baseline = {};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const lng of ['es', 'en']) for (const [w, h] of [[390, 844], [1440, 1000]]) for (const kind of ['young1', 'local44', 'dense', 'jump']) {
  const T = `[${lng} ${w} ${kind}]`;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await mount(page, kind, lng);
  const r = JSON.parse(await page.evaluate(READ));
  const key = lng + w + kind;
  baseline[key] = { radar: r.radarHash, drivers: r.driversHash, explore: r.exploreHash, hero: r.heroHash, hv: r.healthVal, hb: r.healthBadge, hs: r.healthState };
  if (BASE) { await ctx.close(); continue; }
  console.log('\n' + T + '  evo=«' + r.mem.slice(0, 110) + '»');
  // 7 · ningún párrafo retirado, en ninguna superficie
  const hit = FORBIDDEN.filter(re => re.test(r.screen)).map(String);
  ok(`${T} 7 · no reaparece ninguna frase retirada`, hit.length === 0, hit.join(' '));
  // 1 · días observados sólo con observaciones
  if (kind === 'young1' || kind === 'local44') {
    ok(`${T} 1 · sin dos observaciones comparables: estado breve, sin número de días`,
      /(creando tu primera referencia histórica|building your first historical reference)/i.test(r.mem) && !/\d+\s*(días|days)/i.test(r.mem), r.mem);
  }
  // 2 · 3 · con historial comparable hay lectura real, y una dimensión no bloquea a otra
  if (kind === 'dense' || kind === 'jump') {
    ok(`${T} 2 · con historial comparable, Tu evolución publica una lectura real (nunca «ninguna dimensión»)`,
      !/is-coverage|is-accruing/.test(r.memClass) && !/no puede comparar|cannot compare|primera referencia|first historical/i.test(r.mem) && r.mem.length > 20,
      r.memClass + ' · ' + r.mem.slice(0, 120));
    if (kind === 'dense') {
      // 3 · una dimensión sin medir NO bloquea a la otra: con el reparto bloqueado
      // (hueco de una categoría) o con deriva material, la liquidez se sigue afirmando.
      const u = JSON.parse(await page.evaluate(`(function(){
        var base = _aurixIntelligenceCore({});
        var mk = function(extraGaps, extraFacts){ return Object.assign({}, base, {
          ledger: Object.assign({}, base.ledger, { facts: (base.ledger.facts||[]).concat(extraFacts||[]) }),
          dataAvailability: Object.assign({}, base.dataAvailability, { gaps: (base.dataAvailability.gaps||[]).concat(extraGaps||[]) }) }); };
        var codes = function(c){ var e=_intv17Evolution(c); return e ? e.range + ':' + e.rows.map(function(x){return x.code;}).join(',') : 'none'; };
        return JSON.stringify({ both: codes(base),
          mixGap: codes(mk([{ semanticKey: 'exposure_drift_etf_7D', status: 'insufficient_history', reason: 'x' }, { semanticKey: 'exposure_drift_etf_24H', status: 'insufficient_history', reason: 'x' }])),
          mixFact: codes(mk([], [{ semanticKey: 'exposure_drift_crypto_7D', causalRoot: _AURIX_CAUSAL_ROOT.CATEGORY_MIX, window: { range: '7D' } }, { semanticKey: 'exposure_drift_crypto_24H', causalRoot: _AURIX_CAUSAL_ROOT.CATEGORY_MIX, window: { range: '24H' } }])),
          none: codes(Object.assign({}, base, { stabilityEvidence: [] })) }); })()`));
      ok(`${T} 3 · reparto bloqueado por una categoría sin medir ⇒ la liquidez se sigue publicando`, /^7D:liquidity$/.test(u.mixGap) && /category_mix/.test(u.both), JSON.stringify(u));
      ok(`${T} 3 · deriva material del reparto ⇒ no se afirma su estabilidad, pero sí la de la liquidez`, /^7D:liquidity$/.test(u.mixFact), JSON.stringify(u));
      ok(`${T} 3 · sin ninguna evidencia no hay lectura inventada`, u.none === 'none', JSON.stringify(u));
    }
  }
  // 6 · la evolución no republica la liquidez actual
  if (Number.isFinite(r.cashPct)) {
    const pct = String(Math.round(r.cashPct));
    ok(`${T} 6 · Tu evolución no vuelve a publicar la liquidez actual`,
      !/(Tu liquidez está hoy|Your cash is at)/i.test(r.mem) && !new RegExp('\\b' + pct + '(,\\d)?\\s?%').test(r.mem), r.mem.slice(0, 160));
  }
  // 8 · Salud: título + anillo + estado; título idéntico al resto
  ok(`${T} 8 · Salud sin subtítulo y con el título SALUD/HEALTH del sistema`,
    !r.healthMetric && /^(salud|health)$/i.test(r.healthTitle) && r.healthTitleStyle === r.radarTitleStyle, JSON.stringify([r.healthTitle, r.healthTitleStyle, r.radarTitleStyle]));
  ok(`${T} sin scroll horizontal`, r.hscroll === false);
  // 9 · 10 · lo congelado sigue idéntico a HEAD
  if (prior && prior[key]) {
    const b = prior[key];
    ok(`${T} 9 · porcentaje y estado de Salud idénticos a HEAD`, b.hv === r.healthVal && b.hb === r.healthBadge && b.hs === r.healthState, JSON.stringify([b.hv, r.healthVal, b.hb, r.healthBadge]));
    ok(`${T} 10 · Radar, Factores y Explora idénticos a HEAD`, b.radar === r.radarHash && b.drivers === r.driversHash && b.explore === r.exploreHash,
      JSON.stringify([[b.radar, r.radarHash], [b.drivers, r.driversHash], [b.explore, r.exploreHash]]));
    ok(`${T} 10 · Hero idéntico a HEAD (fuera del bloque de Salud)`, kind === 'jump' || b.hero === r.heroHash, JSON.stringify([b.hero, r.heroHash]));
  }
  // 4 · 5 · Hoy y Qué ha cambiado no publican el mismo acontecimiento; vacío ⇒ sin card ni hueco
  if (kind === 'jump') {
    // El fixture no hace que el Core elija el 24h como historia de Hoy (elige el
    // de 30 días, que Hoy no titula por no ser actual). Se reproduce el estado del
    // founder INYECTANDO en la selección de Hoy el hecho de 24h del propio Core.
    const d = JSON.parse(await page.evaluate(`(function(){
      var orig = _intv5MattersStories;
      var core = _aurixIntelligenceCore({});
      var f24 = (core.ledger.facts||[]).find(function(f){ return f.semanticKey === 'investable_return_24h'; });
      var fd24 = (core.findings||[]).find(function(f){ return f.semanticKey === 'investable_return_24h'; });
      var inject = function(all){ window._intv5MattersStories = function(c, s, i, a){ var r = orig(c, s, i, a);
          var add = [Object.assign({}, f24, { eventId: fd24 && fd24.eventId, conceptId: fd24 && fd24.conceptId })];
          if (all) (c.findings||[]).forEach(function(fd){ if (fd.semanticKey !== 'investable_return_24h') { var f=(c.ledger.facts||[]).find(function(x){return x.semanticKey===fd.semanticKey;}); if (f) add.push(Object.assign({}, f, { eventId: fd.eventId, conceptId: fd.conceptId })); } });
          r.stories = add.concat(r.stories); return r; }; };
      _intv5MattersStories = undefined; inject(false); _intv5MattersStories = window._intv5MattersStories;
      var h1 = document.createElement('div'); h1.innerHTML = _renderIntelligenceCommandCenter();
      inject(true); _intv5MattersStories = window._intv5MattersStories;
      var h2 = document.createElement('div'); h2.innerHTML = _renderIntelligenceCommandCenter();
      _intv5MattersStories = orig;
      var t = function(e){ return e ? e.textContent.replace(/\\s+/g,' ').trim() : null; };
      return JSON.stringify({ n: (core.findings||[]).length,
        hoy1: t(h1.querySelector('.intv5-matters')), ch1: t(h1.querySelector('.intv4-changed')), pend1: (h1.querySelector('[data-review-pending]')||{getAttribute:function(){return null;}}).getAttribute('data-review-pending'),
        acks1: [].slice.call(h1.querySelectorAll('.intv4-changed [data-intel-ack]')).length,
        ch2: t(h2.querySelector('.intv4-changed')), pend2: (h2.querySelector('[data-review-pending]')||{getAttribute:function(){return null;}}).getAttribute('data-review-pending'),
        see2: t(h2.querySelector('[data-intel-see-changes]')) }); })()`));
    const has24 = s => /(24 h|24h|24 hours|últimas 24)/i.test(s || '');
    ok(`${T} 4 · Hoy titula el 24h y «Qué ha cambiado» no lo repite; el otro acontecimiento se conserva`,
      has24(d.hoy1) && d.ch1 && !has24(d.ch1) && d.ch1.length > 20, JSON.stringify({ hoy: d.hoy1 && d.hoy1.slice(0, 90), ch: d.ch1 && d.ch1.slice(0, 120) }));
    ok(`${T} 4 · Hoy sólo el titular: sin subtítulo explicativo`, !/neutralizad|already neutralised|Es el rendimiento|This is the return/i.test(d.hoy1 || ''), d.hoy1);
    ok(`${T} 4 · el contador del hero cuenta lo que «Qué ha cambiado» muestra, y «Entendido» sólo en sus filas`,
      Number(d.pend1) === d.n - 1 && d.acks1 === d.n - 1, JSON.stringify([d.n, d.pend1, d.acks1]));
    ok(`${T} 5 · si sólo duplicaría a Hoy, «Qué ha cambiado» no se pinta y el hero no enlaza a nada`,
      d.ch2 === null && Number(d.pend2) === 0 && !d.see2, JSON.stringify([d.ch2 && d.ch2.slice(0, 60), d.pend2, d.see2]));
    // 5 · sin hueco: la composición no deja una card vacía donde estaba
    await page.evaluate(`(function(){ var orig=_intv5MattersStories; var core=_aurixIntelligenceCore({});
      _intv5MattersStories = function(c,s,i,a){ var r=orig(c,s,i,a); var add=[]; (c.findings||[]).forEach(function(fd){ var f=(c.ledger.facts||[]).find(function(x){return x.semanticKey===fd.semanticKey;}); if(f) add.push(Object.assign({}, f, { eventId: fd.eventId, conceptId: fd.conceptId })); }); r.stories=add.concat(r.stories); return r; };
      var host=document.querySelector('.aurix-intelligence-screen'); host.innerHTML=_renderIntelligenceCommandCenter(); })()`);
    await page.waitForTimeout(300);
    const g = JSON.parse(await page.evaluate(READ));
    const emptyCards = g.cards.filter(c => c.empty || c.h < 8);
    const overl = g.cards.some((a, i) => g.cards.some((b, j) => j > i && a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1));
    ok(`${T} 5 · sin «Qué ha cambiado» no queda card vacía ni solape`, g.changed === null && emptyCards.length === 0 && !overl, JSON.stringify(emptyCards));
    await page.screenshot({ path: join(OUT, `evo-dedup-${lng}-${w}.png`), fullPage: true }).catch(() => {});
  }
  if (kind === 'dense') await page.screenshot({ path: join(OUT, `evo-${lng}-${w}.png`), fullPage: true }).catch(() => {});
  await ctx.close();
}
await browser.close();
server.close();
if (BASE) { await writeFile(BASE, JSON.stringify(baseline, null, 1)); console.log('baseline → ' + BASE); process.exit(0); }
console.log('\n' + pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { console.log('\nFAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); console.log('\nRESULT: NO-GO'); process.exit(1); }
console.log('\nRESULT: GO — capturas en docs/intelligence-acceptance/evo-*.png');
process.exit(0);
