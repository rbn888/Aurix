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

import { DAY, H, QA, persona } from './aurix-intelligence-personas.mjs';
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
  var avail = {}; try { var A=_intv22Availability(); Object.keys(A).forEach(function(m){ avail[m] = A[m].wins; }); } catch(_){}
  var evoCard = pick('.intv4-memory'); var plot = pick('.intv21-evo-plot');
  var plotInfo = plot ? (function(){ var pr=plot.getBoundingClientRect(), cr=evoCard.getBoundingClientRect(); var dots=[].slice.call(plot.querySelectorAll('.intv21-evo-dot'));
    return { stems: plot.querySelectorAll('.intv21-evo-stem').length, dots: dots.length, contained: dots.every(function(d){ var r=d.getBoundingClientRect(); return r.left >= pr.left-6 && r.right <= pr.right+6 && r.top >= pr.top-6 && r.bottom <= pr.bottom+6; }) && pr.right <= cr.right + 1,
      bars: plot.getAttribute('data-chart') === 'bars', heads: plot.querySelectorAll('.intv6-head, .intv6-bar').length,
      line: !!plot.querySelector('.intv21-evo-line'), segs: ((plot.querySelector('.intv21-evo-line')||{getAttribute:function(){return '';}}).getAttribute('d').match(/L/g)||[]).length, h: Math.round(pr.height), cardH: Math.round(cr.height) }; })() : null;
  var xa = ex ? [].slice.call(ex.querySelectorAll('.intcc-x-answer')).map(function(a){ return a.textContent.replace(/\s+/g,' ').trim(); }) : [];
  var scBlocks = sc ? [].slice.call(sc.querySelectorAll('.intv22-scn-block')).filter(vis).length : 0;
  var scTabs = sc ? [].slice.call(sc.querySelectorAll('.intv22-scn-tabs .intv21-chip')).filter(vis).map(function(b){ return Math.round(b.getBoundingClientRect().height); }) : [];
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
      evRows: document.querySelectorAll('.intv4-memory .intv15-stable-row').length, head: txt(pick('.intv4-memory .intv15-stable-head')),
      stats: txt(pick('.intv22-stats')), chips: [].slice.call(evo.querySelectorAll('.intv21-chip')).map(function(b){ return txt(b); }), plot: plotInfo } : null,
    xa: xa, scBlocks: scBlocks, scTabs: scTabs, scFull: sc ? (sc.getBoundingClientRect().width > document.querySelector('.aurix-intcc').getBoundingClientRect().width * 0.8) : null,
    drvTxt: txt(drv),
    avail: avail,
    movers: mv ? { range: mv.getAttribute('data-range'), rows: [].slice.call(mv.querySelectorAll('.intv21-mv-row')).map(function(r){ return txt(r); }) } : null,
    att: att ? { range: att.range, sum: +att.sum.toFixed(3), twr: +att.twr.toFixed(3), ups: att.ups.map(function(x){ return x.name + ' ' + x.c.toFixed(3); }), downs: att.downs.map(function(x){ return x.name + ' ' + x.c.toFixed(3); }) } : null,
    scen: sc ? { id: sc.getAttribute('data-scen'), impact: Number(sc.getAttribute('data-impact')), text: txt(sc) } : null, scn: scn,
    explore: ex ? [].slice.call(ex.querySelectorAll('.intcc-x-q')).map(function(b){ return { id: b.getAttribute('data-intcc-q'), label: txt(b) }; }) : [],
    firstRef: /primera referencia|first historical reference/i.test(txt(root)),
    log: log ? Number(log.getAttribute('data-items')) : 0,
    dups: reg ? reg.duplicates : null, nFacts: reg ? reg.facts.length : 0,
    factsBad: reg ? reg.facts.filter(function(f){ return !f.factId || !f.family || !f.owner; }).length : null,
  });
})()`;
// RE-DECIDIDO (V5): … Explora → Evolución → Hoy → Dependencias → Qué movió → Registro.
const ORDER = ['intcc-hero', 'intcc-radar', 'intcc-drivers', 'intcc-explore', 'intcc-timeline', 'intcc-watch', 'intv21-scen', 'intv21-movers', 'intv21-log'];
// RE-DECIDIDO (V7 §2): en ≤1023 px, Factores antes que Radar (también en el DOM).
const ORDER_NARROW = ['intcc-hero', 'intcc-drivers', 'intcc-radar', 'intcc-explore', 'intcc-timeline', 'intcc-watch', 'intv21-scen', 'intv21-movers', 'intv21-log'];
const orderOf = (cards, w) => cards.map(c => (w < 1024 ? ORDER_NARROW : ORDER).findIndex(o => c.c.split('.').indexOf(o) !== -1 || c.c.indexOf(o) === 0)).filter(i => i >= 0);
const BASE = process.env.AURIX_V2_BASELINE, CMP = process.env.AURIX_V2_COMPARE;
const prior = CMP && existsSync(CMP) ? JSON.parse(readFileSync(CMP, 'utf8')) : null;
const baseline = {};
const ENGINES = (process.env.ENGINES || 'CR,WK').split(',');
const FULL = !!process.env.FULL;
const PERSONAS = (process.env.PERSONAS || 'real,qa14,fresh,calm,volatile,flows,stale').split(',');
for (const E of ENGINES) {
  const browser = await (E === 'WK' ? PWm.webkit : PWm.chromium).launch({ headless: true });
  for (const kind of PERSONAS) for (const lng of (process.env.LANGS || 'es,en').split(',')) {
    const widths = process.env.WIDTHS ? process.env.WIDTHS.split(',').map(Number) : ((kind === 'qa14' || kind === 'real' || FULL) ? [360, 390, 768, 1024, 1440] : [390, 1440]);
    for (const w of widths) {
      const T = `[${E} ${kind} ${lng} ${w}]`;
      const ctx = await browser.newContext({ viewport: { width: w, height: w < 768 ? 844 : 1000 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const errs = []; page.on('pageerror', e => errs.push(e.message));
      const P = await mount(page, kind, lng);
      const r = JSON.parse(await page.evaluate(READ));
      const key = [kind, lng, w].join('|');
      if (E === 'CR') baseline[key] = { hv: r.healthVal, hb: r.healthBadge, radar: r.radarHash, drivers: r.driversHash, scn: JSON.stringify(r.scn) };
      if (BASE) { await ctx.close(); continue; }
      ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | '));
      ok(`${T} sin scroll horizontal ni cards solapadas`, !r.hscroll && r.overlaps.length === 0 && r.cards.every(c => c.sw <= 1 || /intcc-m-hero|intcc-hero/.test(c.full)), JSON.stringify(r.overlaps) + JSON.stringify(r.cards.filter(c => c.sw > 1 && !/intcc-m-hero|intcc-hero/.test(c.full))));
      ok(`${T} cero hechos duplicados por fact_id/familia/periodo`, Array.isArray(r.dups) && r.dups.length === 0 && r.factsBad === 0, JSON.stringify(r.dups));
      ok(`${T} nunca «No hay nada que destacar» como contenido`, !/nada que destacar|nothing to highlight/i.test(r.screen));
      const ord = orderOf(r.cards, w);
      ok(`${T} orden: Intelligence+Salud → ${w < 1024 ? 'Factores/Radar' : 'Radar/Factores'}/Explora → Evolución/Hoy → Dependencias → Movió → Registro`, ord.every((x, i) => i === 0 || x >= ord[i - 1]), JSON.stringify(r.cards.map(c => c.c)));
      if (prior && prior[key]) {
        const p = prior[key];
        // RE-DECIDIDO (V6): Factores cambia A PROPÓSITO (ranking de inversiones, liquidez aparte);
        // Salud, Radar y los cálculos de escenarios siguen idénticos.
        ok(`${T} Salud, Radar y escenarios idénticos a HEAD`, p.hv === r.healthVal && p.hb === r.healthBadge && p.radar === r.radarHash && (p.scn == null || p.scn === JSON.stringify(r.scn)),
          JSON.stringify({ p, now: { hv: r.healthVal, hb: r.healthBadge, radar: r.radarHash, drivers: r.driversHash } }));
      }
      // RE-DECIDIDO (V2.1): 1–4 hechos actuales, sin relleno estático.
      // RE-DECIDIDO (§7 «no fabricar actividad»): sin hechos actuales Hoy publica su estado
      // honesto (dato no reciente / sin cambios) en vez de «se reparte en N posiciones».
      ok(`${T} Hoy publica entre 1 y 4 hechos (o su estado honesto vacío) y nunca la liquidez estática`, r.hoy && r.hoy.items <= 4 && (r.hoy.items >= 1 || (kind === 'stale' && /recientes|recent enough/.test(r.hoy.text)))
        && !/La liquidez es el|Cash is \d/.test(r.hoy.text) && !/No tienes liquidez registrada|You have no cash recorded/.test(r.hoy.text), JSON.stringify(r.hoy));
      ok(`${T} Tu evolución: nunca «primera referencia» si alguna métrica tiene dos observaciones`, !(Object.keys(r.avail).length && r.firstRef), JSON.stringify(r.avail));
      // RE-DECIDIDO (V6): las métricas estructurales son BARRAS (una por observación, sin línea);
      // valor y rentabilidad, línea.
      ok(`${T} gráfico: barras por observación (estructurales) o línea (valor), contenido`, !r.evo || !r.evo.plot || (r.evo.plot.contained
        && (r.evo.plot.bars ? (!r.evo.plot.line && r.evo.plot.heads === r.evo.pts) : (r.evo.plot.stems === 0 && r.evo.plot.line))), JSON.stringify(r.evo && r.evo.plot));
      ok(`${T} «Diversificación» retirada de la métrica de pesos; etiqueta de precio`, !(r.evo && r.evo.chips.some(c => /Diversificación|Diversification/.test(c)))
        && !r.tags.some(t => /Principal movimiento|Main move/.test(t.label)), JSON.stringify({ c: r.evo && r.evo.chips, t: r.tags }));
      { const nums = new Set((r.drvTxt.match(/\d+(?:[.,]\d+)?%/g) || []));
        (r.scn || []).forEach(x => nums.add(String(Math.abs(x.impact).toFixed(1)).replace('.', lng === 'en' ? '.' : ',') + '%'));
        // RE-DECIDIDO (§4): las familias «clases frente a posiciones» y «reparto entre clases»
        // responden CON los pesos de Factores por definición; el resto sigue sin repetirlos.
        const hit = r.xa.filter((a, i) => !/^x3_class_/.test((r.explore[i] || {}).id || '') && (a.match(/\d+(?:[.,]\d+)?%/g) || []).some(n => nums.has(n)));
        ok(`${T} Explora no repite cifras de Factores ni de Dependencias`, hit.length === 0 && !r.explore.some(q => /ctx_top3_drop|ctx_top2/.test(q.id)), JSON.stringify({ hit, nums: Array.from(nums) })); }
      // RE-DECIDIDO (§3): las etiquetas son HECHOS (pueden llevar su cifra) y nunca el veredicto «Concentración elevada».
      ok(`${T} etiquetas del hero: ≤3, dimensiones distintas, hechos sin veredicto, contenidas`, r.tags.length <= 3 && new Set(r.tags.map(t => t.dim)).size === r.tags.length
        && r.tags.every(t => t.fit && !/Concentración elevada|High concentration/.test(t.label)), JSON.stringify(r.tags));
      const ux = await page.evaluate(`(function(){ var vis=function(e){ return e && e.getBoundingClientRect().width>0; };
        var mh=document.querySelector('.intcc-m-health'); var hl=mh && vis(mh) ? [].slice.call(mh.querySelectorAll('.intcc-m-health-tag')).map(function(e){ return e.textContent.trim().toLowerCase(); }) : [];
        var tl=[].slice.call(document.querySelectorAll('.intv21-tag')).filter(vis).map(function(e){ return e.querySelector('.intv21-tag-go').textContent.trim().toLowerCase(); });
        var links=[].slice.call(document.querySelectorAll('[data-intel-see-changes]')).filter(vis).map(function(a){ return !!document.getElementById(String(a.getAttribute('href')).replace('#','')); });
        return { dup: tl.filter(function(x){ return hl.indexOf(x) !== -1; }), links: links }; })()`);
      ok(`${T} ninguna etiqueta del hero repite una etiqueta visible de Salud; todo enlace del hero tiene destino`, ux.dup.length === 0 && ux.links.every(Boolean), JSON.stringify(ux));
      ok(`${T} Tu evolución: titular + ≤2 evidencias`, !r.evo || r.evo.evRows <= 2, JSON.stringify(r.evo));
      if (kind === 'qa14') {
        ok(`${T} QA · Salud 33`, r.healthVal === '33', r.healthVal);
        // RE-DECIDIDO (§9): el hero publica hechos; «Concentración elevada» queda sólo como etiqueta de Salud (móvil).
        ok(`${T} QA · 2–3 etiquetas de hechos; el hero no repite el titular de las tres mayores`, r.tags.length >= 2 && !r.tags.some(t => t.id === 'tag_conc' || t.id === 'tag_top3'), JSON.stringify(r.tags));
        // RE-DECIDIDO (SPEC previo al cierre §7): el movimiento de cotización sólo de una
        // posición con peso que importa (las tres mayores de Factores). En QA la que más
        // se mueve de ellas es Bitcoin, que ya es la contribución ⇒ no hay fila de precio.
        // RE-DECIDIDO (SPEC casi final §7): compiten TODAS las posiciones, ordenadas por peso ×
        // variación y con el umbral de materialidad de la contribución (0,05 pp). Solana
        // (0,8 % × 6,1 % = 0,049 pp) no llega; Ethereum (13,5 % × 3,1 %) sí. Máximo tres hechos.
        ok(`${T} QA · Hoy: rentabilidad, contribución en pp y cotizaciones materiales, distinguidas`, r.hoy.rows.length <= 3 && r.hoy.rows.some(x => x.k === 'return')
          && r.hoy.rows.some(x => x.k === 'driver' && /(restó|sumó|took|added) \d+[.,]\d+ pp/.test(x.t))
          && r.hoy.rows.filter(x => x.k === 'mover').every(x => /cotización|price/i.test(x.t)
            && (/Solana|Bitcoin|Ethereum|Cardano|Chainlink/.test(x.t) ? /24 h/.test(x.t) : /última sesión disponible|last available session/.test(x.t)))
          && !/Solana/.test(r.hoy.text), JSON.stringify(r.hoy.rows));
        ok(`${T} QA · Escenarios: Microsoft −10 % ≈ −2,9 %, Top 3 ≈ −6,9 %, Acciones ≈ −5,1 %`, r.scn && Math.abs(r.scn.find(s => s.id === 'top1').impact + 2.9) < 0.01
          && Math.abs(r.scn.find(s => s.id === 'top3').impact + 6.9) < 0.01 && Math.abs(r.scn.find(s => s.id === 'class').impact + 5.1) < 0.01
          && /−2[.,]9%/.test(r.scen.text) && /(compara su efecto en tus principales dependencias|compare its effect on your main dependencies)/.test(r.scen.text), JSON.stringify({ scn: r.scn, t: r.scen && r.scen.text }));
        // RE-DECIDIDO (V2.1): «Desde inicio» sólo cuando empieza de verdad antes que 30D;
        // con la rentabilidad recortada al régimen comparable coincide con 30D y no se duplica.
        ok(`${T} QA · Tu evolución ofrece 7D y 30D en rentabilidad, «Desde inicio» donde existe y las cinco métricas`, r.avail.return && /^7d,30d/.test(r.avail.return.join()) && (r.avail.top || []).indexOf('all') !== -1
          && ['value', 'top', 'liquidity', 'effective'].every(m => (r.avail[m] || []).length) && r.evo && r.evo.pts >= 2, JSON.stringify({ a: r.avail, e: r.evo }));
        ok(`${T} QA · Qué movió: contribuciones certificadas que concilian con la rentabilidad flow-neutral (mismo signo, ≤ máx(0,1 pp, 10 %))`, r.movers && r.att && Math.abs(r.att.sum - r.att.twr) <= Math.max(0.1, 0.1 * Math.abs(r.att.twr))
          && (Math.sign(r.att.sum) === Math.sign(r.att.twr))
          && r.movers.rows.length >= 2, JSON.stringify({ m: r.movers, a: r.att }));
        ok(`${T} QA · Explora: sólo preguntas contextuales contestables (sin mezclar el catálogo)`, r.explore.length >= 1 && r.explore.length <= 4 && r.explore.every(q => /^x(22|3)_/.test(q.id)), JSON.stringify(r.explore));
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
      if (kind === 'real') {
        // RE-DECIDIDO (§9): el titular resume sin cifras; las cifras viven en los KPIs (assert de abajo).
        // RE-DECIDIDO (V6): «mayor inversión».
        const H1 = lng === 'en' ? /^Over 30 days, your largest investment changed from Bitcoin to Microsoft\.$/ : /^En 30 días, tu mayor inversión pasó de Bitcoin a Microsoft\.$/;
        ok(`${T} REAL · sin «primera referencia» y titular de la métrica activa (peso máximo, cambio de dominante)`, !r.firstRef && r.evo && r.evo.metric === 'top' && H1.test(r.evo.head), JSON.stringify(r.evo && r.evo.head));
        ok(`${T} REAL · ventanas reales: liquidez sólo 7D (linaje), reparto efectivo 30D, sin «Desde inicio» duplicado`, (r.avail.liquidity || []).join() === '7d'
          && (r.avail.effective || []).indexOf('30d') !== -1 && (r.avail.top || []).indexOf('all') === -1, JSON.stringify(r.avail));
        ok(`${T} REAL · Inicio · Actual · Cambio en pp`, /51[.,]6%/.test(r.evo.stats) && /28[.,]7%/.test(r.evo.stats) && /−22[.,]9 pp/.test(r.evo.stats), r.evo.stats);
        // RE-DECIDIDO (V6): mayor inversión = una barra (lollipop) por observación, nunca unidas.
        ok(`${T} REAL · una barra por observación, sin línea que las una`, r.evo.plot && r.evo.plot.bars && !r.evo.plot.line && r.evo.plot.heads === r.evo.pts, JSON.stringify(r.evo.plot));
        // RE-DECIDIDO (V5): Dependencias a ancho completo, debajo de Evolución | Hoy.
        ok(`${T} REAL · Qué movió no certificable ⇒ ausente; Dependencias a ancho completo en escritorio`, !r.movers && (w < 1024 || r.scFull === true), JSON.stringify({ m: r.movers, full: r.scFull }));
        // RE-DECIDIDO (V5): un único control y los tres resultados siempre visibles (también en móvil).
        ok(`${T} REAL · escenarios: los tres resultados visibles bajo un único control`, r.scBlocks === 3, JSON.stringify({ b: r.scBlocks, t: r.scTabs }));
        ok(`${T} REAL · Explora: 3–4 preguntas de familias distintas`, r.explore.length >= 3 && r.explore.length <= 4, JSON.stringify(r.explore));
        if (w === 390 || w === 1440) {
          const evoSwitch = async (m) => { await page.locator(`.intv21-evo [data-intv21-evo-metric="${m}"]:visible`).first().click(); await page.waitForTimeout(220);
            return JSON.parse(await page.evaluate(`JSON.stringify({ head: (document.querySelector('.intv22-head')||{}).textContent, stats: (document.querySelector('.intv22-stats')||{}).textContent.replace(/\\s+/g,' '), h: Math.round(document.querySelector('.intv21-evo-plot').getBoundingClientRect().height), win: document.querySelector('.intv21-evo').getAttribute('data-win') })`)); };
          const plotH0 = r.evo.plot.h;
          const lq = await evoSwitch('liquidity');
          ok(`${T} REAL · liquidez: titular «En 7 días … ganó peso» y KPIs 6,8% → 7,2% (+0,4 pp)`, (lng === 'en' ? /^Over 7 days, cash took up more of your portfolio\.$/ : /^En 7 días, tu liquidez ganó peso en la cartera\.$/).test(lq.head)
            && /6[.,]8%/.test(lq.stats) && /7[.,]2%/.test(lq.stats) && /\+0[.,]4 pp/.test(lq.stats) && lq.h === plotH0, JSON.stringify(lq));
          const ef = await evoSwitch('effective');
          ok(`${T} REAL · reparto: titular «más equilibrado» y KPIs 2,5 → 5,2`, (lng === 'en' ? /^Over 30 days, your money became more evenly spread\.$/ : /^En 30 días, tu dinero quedó repartido de forma más equilibrada\.$/).test(ef.head)
            && /2[.,]5/.test(ef.stats) && /5[.,]2/.test(ef.stats) && ef.h === plotH0, JSON.stringify(ef));
          await evoSwitch('top');
          const plot = page.locator('.intv21-evo-plot:visible').first(); await plot.scrollIntoViewIfNeeded(); await page.waitForTimeout(120);
          const bb = await plot.boundingBox(); await page.mouse.move(bb.x + 3, bb.y + bb.height / 2); await page.waitForTimeout(120);
          const tip = await page.evaluate(`(document.querySelector('.intv21-evo-tip.is-on')||{}).textContent || ''`);
          // RE-DECIDIDO (V6): «fecha · activo · peso».
          ok(`${T} REAL · tooltip: fecha · activo dominante · peso`, /· Bitcoin · 51[.,]6\s?%/.test(tip), tip);
          // ESTABILIDAD DE EXPLORA: scroll, acordeón, carga asíncrona, navegación y recarga.
          const ids = async () => page.evaluate(`[].slice.call(document.querySelectorAll('.intcc-explore .intcc-x-q')).map(function(b){ return b.getAttribute('data-intcc-q'); }).join(',')
            + ' | ' + [].slice.call(document.querySelectorAll('.intv21-tag')).filter(function(t){ return t.getBoundingClientRect().width > 0; }).map(function(t){ return t.getAttribute('data-tag'); }).join(',')`);
          const q0 = await ids();
          await page.mouse.wheel(0, 3000); await page.waitForTimeout(150);
          const q1 = await ids();
          await page.locator('.intcc-explore .intcc-x-q:visible').first().click(); await page.waitForTimeout(150);
          const q2 = await ids();
          await page.evaluate(`(function(){ var m=_aurixAssetMemory; _aurixAssetMemory = { userId: m.userId, rows: m.rows.map(function(r){ return Object.assign({}, r); }), state: 'ready', at: Date.now() };
            var ph=document.getElementById('tabPlaceholder')||document.querySelector('.tab-placeholder--intel'); ph.innerHTML = renderIntelligenceTab(); _initIntelligenceCommandCenter(); })()`); await page.waitForTimeout(150);
          const q3 = await ids();
          await page.evaluate(`switchTab('home')`); await page.waitForTimeout(400); await page.evaluate(`switchTab('intelligence')`); await page.waitForTimeout(900);
          const q4 = await ids();
          await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(`typeof switchTab === 'function'`, null, { timeout: 60000 }); await page.waitForTimeout(900);
          await inject(page, P, 'intelligence'); await page.waitForTimeout(1200);
          const q5 = await ids();
          ok(`${T} REAL · Explora y etiquetas idénticas tras scroll, acordeón, carga asíncrona, navegación y recarga`, q0 && [q1, q2, q3, q4, q5].every(x => x === q0), JSON.stringify([q0, q1, q2, q3, q4, q5]));
        }
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
        ok(`${T} evolución: cambiar de métrica actualiza sólo el módulo y conserva el foco`, before && after && after[0] === 'liquidity' && after[1] === 'observations' && after[2] === 'liquidity' && after[3] === 1, JSON.stringify([before, after]));
        const plot = page.locator('.intv21-evo-plot:visible').first();
        await plot.scrollIntoViewIfNeeded(); await page.waitForTimeout(150);
        const bb = await plot.boundingBox();
        await page.mouse.move(bb.x + bb.width * 0.98, bb.y + bb.height / 2); await page.waitForTimeout(120);
        const tip = await page.evaluate(`(function(){ var t=[].slice.call(document.querySelectorAll('.intv21-evo-tip.is-on')); return t.length ? t[0].textContent : ''; })()`);
        ok(`${T} tooltip: fecha real y valor del punto`, /\d/.test(tip) && /%/.test(tip), tip);
        await plot.focus(); await page.keyboard.press('Home');
        const kb = await page.evaluate(`(function(){ var p=document.querySelector('.intv21-evo-plot'); return p ? p.getAttribute('data-tip') : null; })()`);
        ok(`${T} teclado: Inicio lleva al primer punto`, kb === '0', kb);
        // RE-DECIDIDO (V5): sin pestañas; los tres resultados visibles en todos los anchos.
        { const nb = await page.evaluate(`[].slice.call(document.querySelectorAll('.intv22-scn-block')).filter(function(b){ return b.getBoundingClientRect().width > 0; }).length`);
          ok(`${T} escenario: los tres resultados visibles`, nb === 3, String(nb)); }
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
        // RE-DECIDIDO (§4): las etiquetas ya no se cierran; deben ser las MISMAS tras recargar.
        const tags0 = await page.evaluate(`[].slice.call(document.querySelectorAll('.intv21-tag')).map(function(t){ return t.getAttribute('data-tag'); }).join(',')`);
        // recarga + vuelta a Intelligence
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(`typeof switchTab === 'function'`, null, { timeout: 60000 }); await page.waitForTimeout(900);
        await inject(page, P, 'home');
        await page.waitForTimeout(500);
        await page.evaluate(`switchTab('intelligence')`); await page.waitForTimeout(1200);
        const per = await page.evaluate(`(function(){ var e=document.querySelector('.intv21-evo'), s=document.querySelector('.intv21-scen');
          return { m: e && e.getAttribute('data-metric'), s: s && s.getAttribute('data-scen'), tags: [].slice.call(document.querySelectorAll('.intv21-tag')).map(function(t){ return t.getAttribute('data-tag'); }), n: document.querySelectorAll('.aurix-intcc').length,
            dups: (debugAurixIntelFacts()||{}).duplicates }; })()`);
        ok(`${T} recarga y vuelta: métrica y escenario persisten, etiquetas idénticas; cero duplicados`, per.n === 1 && per.tags.join(',') === tags0 && Array.isArray(per.dups) && per.dups.length === 0
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
