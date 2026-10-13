#!/usr/bin/env node
/**
 * AURIX INTELLIGENCE · SPEC PRINCIPAL PREVIO AL CIERRE — sonda focal (v3)
 * ════════════════════════════════════════════════════════════════════════════
 * Navegador real sobre la app servida en local, personas compartidas con la V2
 * (`aurix-intelligence-personas.mjs`). A diferencia de la V2, aquí la sesión está
 * AUTENTICADA (`currentUser`) y la memoria por posición se hidrata con el owner
 * REAL (`_aurixHydrateAssetMemory`) sobre un cliente simulado con latencia: es la
 * única forma de ejercitar el estado «pendiente» de Explora y Tu evolución.
 *
 *   P0 · placeholders: hidratación tardía, fuentes fallidas, cuenta que cambia en
 *        vuelo (respuesta obsoleta), regreso, recarga y repintado.
 *   Presentación: etiquetas sin X y estables, KPIs completos (sin elipsis),
 *        «Último dato», jerga prohibida, null ≠ 0, precio ≠ contribución.
 *
 *   ENGINES=CR,WK · WIDTHS=390,1024,1440,360 · LANGS=es,en · PERSONAS=real,qa14,…
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { persona } from './aurix-intelligence-personas.mjs';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const OUT = process.env.AURIX_V3_SHOTS || join(ROOT, 'docs', 'intelligence-acceptance', 'v3');
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
  else { fails.push(n); console.log('  ✗ ' + n + (info ? '  [' + String(info).slice(0, 500) + ']' : '')); } };
mkdirSync(OUT, { recursive: true });

// Sesión autenticada + cliente Supabase simulado: `portfolio_snapshots` responde
// con las filas de memoria de la persona tras `delay` ms (o falla). Cada consulta
// registra la cuenta para la que se pidió, de modo que un cambio de cuenta en vuelo
// devuelve filas de la cuenta ANTERIOR.
const SESSION = (P, uid, opt) => `(function(){
  var bl=document.getElementById('bootLoader'); if(bl) bl.remove(); var ar=document.getElementById('appRoot'); if(ar) ar.style.opacity='1';
  var fe=Object.create(null); _AURIX_ENT_CANON.forEach(function(k){ fe[k]=(k!=='workspace.catalog_preview'); });
  _aurixEnt={loaded:true,loading:false,error:null,plan:'premium',status:'active',source:'default',validUntil:null,features:fe,sources:Object.create(null),fetchedAt:Date.now()};
  currentUser = { id: ${JSON.stringify(uid)} };
  try { _aurixActiveUserId=${JSON.stringify(uid)}; _aurixStampCacheOwner(); } catch(_) {}
  _aurixRemoteLoadOutcome = 'ok-row'; _aurixCanonicalHistoryLoaded = true;
  window.__memRows = window.__memRows || {}; window.__memRows[${JSON.stringify(uid)}] = ${JSON.stringify(P.memRows)};
  window.__memDelay = ${Number(opt.delay) || 0}; window.__memFail = ${opt.fail ? 'true' : 'false'}; window.__memCalls = 0;
  supabaseClient = { from: function(t){
    var asked = currentUser && currentUser.id, rows = (window.__memRows[asked] || []).slice();
    var q = { _asc: true, _gte: 0,
      select: function(){ return q; }, eq: function(){ return q; }, not: function(){ return q; },
      gte: function(k, v){ if (k === 'ts') q._gte = Date.parse(v); return q; },
      order: function(k, o){ q._asc = !!(o && o.ascending); return q; },
      limit: function(){ return q; },
      then: function(res, rej){ window.__memCalls++; var d = window.__memDelay, f = window.__memFail;
        var hit = rows.filter(function(r){ return r.ts >= q._gte; }).sort(function(a,b){ return q._asc ? a.ts-b.ts : b.ts-a.ts; }).slice(0, 1)
          .map(function(r){ return { ts: new Date(r.ts).toISOString(), asset_values: r.values, real_estate: r.re, schema_version: 2 }; });
        return new Promise(function(ok2){ setTimeout(function(){ ok2(f ? { error: { message: 'x' }, data: null } : { error: null, data: hit }); }, d); }).then(res, rej); } };
    return q; } };
  var srv=${JSON.stringify(P.server)}; if (srv.length) { _aurixBackendSnapshots = srv; }
  _aurixAssetMemory = { userId: null, rows: [], state: 'idle', at: 0 };
  ${opt.backend === 'failed' ? "_aurixSetBackendSnapshotsState('failed');" : (opt.backend === 'loading' ? "_aurixSetBackendSnapshotsState('loading');" : "_aurixSetBackendSnapshotsState('ready');")}
  if (${P.lineage}) { var rec=_aurixLineageRead(); rec.since=Date.now()-16*864e5; rec.adoptedAt=rec.since; _aurixLineageWrite(rec); _aurixLineageColumnSeen=true; }
  return true; })()`;

async function boot(page, P, lng) {
  await page.addInitScript(`try{ localStorage.setItem('portfolio_lang', ${JSON.stringify(lng)});
    localStorage.setItem('portfolio_assets', ${JSON.stringify(JSON.stringify(P.assets))});
    localStorage.setItem('portfolio_history', ${JSON.stringify(JSON.stringify(P.hist))});
    localStorage.setItem('category_history', ${JSON.stringify(JSON.stringify(P.cats))}); }catch(_){}`);
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(`typeof switchTab === 'function' && typeof _renderIntelligenceCommandCenter === 'function'`, null, { timeout: 60000 });
  await page.waitForTimeout(900);
}
const STATE = `(function(){
  var vis=function(e){ if(!e) return false; var r=e.getBoundingClientRect(); return r.width>0 && r.height>0; };
  var pend=[].slice.call(document.querySelectorAll('[data-pending="1"]')).filter(vis).map(function(e){ return e.className.split(' ').slice(0,3).join('.'); });
  var ex=document.querySelector('.intcc-explore:not(.is-pending)'), evo=document.querySelector('.intv21-evo:not(.is-pending)');
  var err=[].slice.call(document.querySelectorAll('[data-intv3-error]')).filter(vis).length;
  return JSON.stringify({ pend: pend, explore: ex ? ex.getAttribute('data-explore') : null, evo: evo ? (evo.getAttribute('data-metric')+'|'+evo.getAttribute('data-win')) : null,
    err: err, mem: _aurixAssetMemory.state + ':' + _aurixAssetMemory.userId, calls: window.__memCalls,
    trace: (window.__aurixIntelTrace||[]).slice() }); })()`;
const st = async (page) => JSON.parse(await page.evaluate(STATE));
// Un clic que no depende de que termine un desplazamiento suave ajeno (navegación de
// una etiqueta) ni del levantamiento por hover: espera hasta 10 s y, si el control
// sigue moviéndose, lo pulsa igualmente. Las aserciones de altura no cambian.
const clickSettled = async (loc) => { try { await loc.click({ timeout: 10000 }); } catch (_) { await loc.click({ force: true }); } };
// Jerga prohibida por el SPEC §8/§11 (visible, no atributos).
const JARGON = /cartera invertible|investable portfolio|frente a su propia historia|against its own history|flow-neutral|\bventana\b|\bwindow\b|\blectura\b|\breading\b|como si tuvieras|as if you had/i;
const PRES = `(function(){
  var vis=function(e){ if(!e) return false; var r=e.getBoundingClientRect(); var cs=getComputedStyle(e); return r.width>0 && r.height>0 && cs.display!=='none' && cs.visibility!=='hidden'; };
  var txt=function(e){ return e ? e.textContent.replace(/\\s+/g,' ').trim() : ''; };
  var root=document.querySelector('.aurix-intcc'); var kids=root ? [].slice.call(root.children).filter(vis) : [];
  var cards=kids.map(function(e){ var r=e.getBoundingClientRect(); return { c: e.className.split(' ').slice(0,2).join('.'), l:r.left, r:r.right, t:r.top+scrollY, b:r.bottom+scrollY }; });
  var ov=[]; for (var i=0;i<cards.length;i++) for (var j=i+1;j<cards.length;j++){ var a=cards[i], b=cards[j]; if (a.l<b.r-1 && b.l<a.r-1 && a.t<b.b-1 && b.t<a.b-1) ov.push(a.c+'×'+b.c); }
  var tags=[].slice.call(document.querySelectorAll('.intv21-tag')).filter(vis);
  var kpi=[].slice.call(document.querySelectorAll('.intv22-stats dd')).filter(vis).filter(function(d){ var cs=getComputedStyle(d); return d.scrollWidth > d.clientWidth + 1 || cs.textOverflow === 'ellipsis' && d.scrollWidth > d.clientWidth; }).map(txt);
  var evo=[].slice.call(document.querySelectorAll('.intv21-evo')).filter(vis)[0];
  var rad=[].slice.call(document.querySelectorAll('svg.intcc-radar-svg')).filter(vis)[0];
  var radar=null; if (rad) { var poly=rad.querySelector('polygon.intcc-radar-area'); var stage=rad.parentNode;
    var nums=[].slice.call(rad.querySelectorAll('.intcc-radar-area, .intcc-radar-dot, .intcc-radar-edge')).map(function(e){ return [e.getAttribute('points'), e.getAttribute('cx'), e.getAttribute('cy'), e.getAttribute('x1'), e.getAttribute('y2')].join(' '); }).join(' ').match(/-?[\\d.]+(e-?\\d+)?|NaN|Infinity/g)||[];
    var keys=[].slice.call(rad.querySelectorAll('.intcc-radar-dot')).map(function(d){ return d.getAttribute('data-axis'); });
    radar={ axes: stage.querySelectorAll('.intcc-radar-label').length, dots: keys.length, uniq: new Set(keys).size, closed: !!poly, finite: nums.length>0 && nums.every(function(n){ return isFinite(Number(n)); }) }; }
  var walker=document.createTreeWalker(root||document.body, NodeFilter.SHOW_TEXT); var jar=[]; var re=${JARGON.toString()};
  while (walker.nextNode()) { var n=walker.currentNode; if (n.parentElement && vis(n.parentElement) && re.test(n.nodeValue)) jar.push(n.nodeValue.trim().slice(0,90)); }
  var reg=(typeof debugAurixIntelFacts==='function') ? debugAurixIntelFacts() : null;
  return JSON.stringify({ pend: [].slice.call(document.querySelectorAll('[data-pending="1"]')).filter(vis).length,
    hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, overlaps: ov,
    tagX: [].slice.call(document.querySelectorAll('.intv21-tag-x, [data-intv21-hide]')).filter(vis).length,
    tags: tags.map(function(t){ return t.getAttribute('data-tag'); }), kpiClip: kpi,
    evo: evo ? { metric: evo.getAttribute('data-metric'), head: txt(evo.querySelector('.intv22-head')), stats: txt(evo.querySelector('.intv22-stats')), deltaCls: (evo.querySelector('.intv22-stats div:last-child dd')||{}).className || '' } : null,
    radar: radar, jargon: jar, qs: [].slice.call(document.querySelectorAll('.intcc-explore .intcc-x-q')).filter(vis).map(txt),
    dups: reg ? reg.duplicates : null,
    text: kids.map(function(k){ return '['+k.className.split(' ').slice(0,2).join('.')+'] '+txt(k); }).join('\\n') }); })()`;
const memRows = (page) => page.evaluate(`JSON.stringify((_aurixAssetMemory.rows||[]).map(function(r){ return r.ts; }))`);

const ENGINES = (process.env.ENGINES || 'CR,WK').split(',');
for (const E of ENGINES) {
  const browser = await (E === 'WK' ? PWm.webkit : PWm.chromium).launch({ headless: true });
  const newPage = async (w, rm) => { const ctx = await browser.newContext({ viewport: { width: w, height: w < 768 ? 844 : 1000 }, deviceScaleFactor: 1, reducedMotion: rm ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); return { ctx, page, errs }; };

  // ── P0.1 · HIDRATACIÓN TARDÍA: entrar ANTES de que llegue la memoria ─────────
  for (const w of [390, 1440]) {
    const T = `[${E} P0 tardía ${w}]`;
    const P = persona('real');
    const { ctx, page, errs } = await newPage(w);
    await boot(page, P, 'es');
    await page.evaluate(SESSION(P, 'uA', { delay: 1500 }));
    await page.evaluate(`(function(){ _aurixHydrateAssetMemory(); switchTab('intelligence'); })()`);
    await page.waitForTimeout(250);
    const s0 = await st(page);
    ok(`${T} mientras la memoria está en vuelo, Explora/Evolución muestran carga (no un vacío ni un dato)`, s0.pend.length >= 1 && s0.mem.startsWith('loading'), JSON.stringify(s0));
    // Sin ningún render() ajeno: sólo el aterrizaje de la memoria debe resolver los placeholders.
    await page.waitForTimeout(2600);
    const s1 = await st(page);
    ok(`${T} al llegar la memoria, los placeholders se resuelven SOLOS (sin navegar, sin tick de precio)`, s1.pend.length === 0 && !!s1.explore && !!s1.evo && s1.mem === 'ready:uA', JSON.stringify(s1));
    // Un repintado posterior con una fuente otra vez en vuelo conserva lo ya resuelto.
    await page.evaluate(`(function(){ _aurixAssetMemory = { userId: 'uA', rows: _aurixAssetMemory.rows, state: 'loading', at: Date.now() };
      var ph=document.getElementById('tabPlaceholder'); ph.innerHTML = renderIntelligenceTab(); _initIntelligenceCommandCenter(); })()`);
    const s2 = await st(page);
    ok(`${T} una actualización en vuelo NO vacía una card ya resuelta (mismo resultado de la misma cuenta)`, s2.pend.length === 0 && s2.explore === s1.explore && s2.evo === s1.evo, JSON.stringify(s2));
    await page.evaluate(`_aurixAssetMemory = { userId: 'uA', rows: _aurixAssetMemory.rows, state: 'ready', at: Date.now() }`);
    // Dashboard → Intelligence → volver.
    await page.evaluate(`switchTab('home')`); await page.waitForTimeout(300);
    await page.evaluate(`switchTab('intelligence')`); await page.waitForTimeout(700);
    const s3 = await st(page);
    ok(`${T} Dashboard → Intelligence: contenido inmediato y el mismo`, s3.pend.length === 0 && s3.explore === s1.explore && s3.evo === s1.evo, JSON.stringify(s3));
    ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ── P0.2 · FUENTE QUE NUNCA LLEGA: snapshots de servidor fallidos ────────────
  {
    const T = `[${E} P0 fallo 390]`;
    const P = persona('real');
    const { ctx, page, errs } = await newPage(390);
    await boot(page, P, 'es');
    await page.evaluate(SESSION(P, 'uA', { backend: 'failed' }));
    await page.evaluate(`switchTab('intelligence')`); await page.waitForTimeout(1200);
    const s = await st(page);
    ok(`${T} sin memoria posible, ningún placeholder indefinido: Intelligence se publica con lo que sí está certificado`, s.pend.length === 0, JSON.stringify(s));
    // Lectura de memoria fallida (la hidratación SÍ arranca y falla).
    await page.evaluate(SESSION(P, 'uA', { delay: 200, fail: true }));
    await page.evaluate(`(function(){ _aurixHydrateAssetMemory(); var ph=document.getElementById('tabPlaceholder'); ph.innerHTML = renderIntelligenceTab(); _initIntelligenceCommandCenter(); })()`);
    await page.waitForTimeout(1400);
    const s2 = await st(page);
    ok(`${T} memoria fallida ⇒ sin placeholder, y no se publica un cero ni un vacío definitivo`, s2.pend.length === 0 && s2.mem.startsWith('failed'), JSON.stringify(s2));
    ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ── P0.3 · RESPUESTA OBSOLETA: la cuenta cambia con la lectura en vuelo ──────
  {
    const T = `[${E} P0 obsoleta 1440]`;
    const P = persona('real'), Q = persona('qa14');
    const { ctx, page, errs } = await newPage(1440);
    await boot(page, P, 'es');
    await page.evaluate(SESSION(P, 'uA', { delay: 1200 }));
    await page.evaluate(`void _aurixHydrateAssetMemory()`);          // A en vuelo (1,2 s)
    await page.waitForTimeout(200);
    await page.evaluate(SESSION(Q, 'uB', { delay: 200 }));            // cambio a B
    await page.evaluate(`(function(){ _aurixHydrateAssetMemory(); switchTab('intelligence'); })()`);
    await page.waitForTimeout(2200);
    const s = await st(page);
    const tsB = new Set(Q.memRows.map(r => r.ts)), tsA = new Set(P.memRows.map(r => r.ts));
    const got = JSON.parse(await memRows(page));
    ok(`${T} la respuesta de A no sobrescribe a B: memoria de B lista y SÓLO con filas de B`, s.mem === 'ready:uB' && got.length >= 2 && got.every(t => tsB.has(t) && !tsA.has(t)), JSON.stringify({ s, got }));
    ok(`${T} y sin placeholders tras el cambio`, s.pend.length === 0, JSON.stringify(s));
    ok(`${T} traza de desarrollo: la lectura obsoleta queda registrada por motivo, sin datos`, (s.trace || []).some(t => t && t.r === 'stale_response') && JSON.stringify(s.trace).indexOf('uA') === -1, JSON.stringify(s.trace));
    ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ── P0.4 · RECARGA con memoria lenta y luego métrica/periodo ────────────────
  {
    const T = `[${E} P0 recarga 390]`;
    const P = persona('real');
    const { ctx, page, errs } = await newPage(390);
    await boot(page, P, 'es');
    await page.evaluate(SESSION(P, 'uA', { delay: 300 }));
    await page.evaluate(`(function(){ _aurixHydrateAssetMemory(); switchTab('intelligence'); })()`); await page.waitForTimeout(1500);
    const a = await st(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(`typeof switchTab === 'function'`, null, { timeout: 60000 }); await page.waitForTimeout(900);
    await page.evaluate(SESSION(P, 'uA', { delay: 900 }));
    await page.evaluate(`(function(){ _aurixHydrateAssetMemory(); switchTab('intelligence'); })()`); await page.waitForTimeout(2200);
    const b = await st(page);
    ok(`${T} tras recargar, mismas preguntas y misma selección de evolución`, a.explore && a.explore === b.explore && a.evo === b.evo && b.pend.length === 0, JSON.stringify({ a, b }));
    await page.locator('.intv21-evo [data-intv21-evo-metric="liquidity"]:visible').first().click(); await page.waitForTimeout(200);
    await page.locator('.intv21-evo [data-intv21-evo-win]:visible').first().click(); await page.waitForTimeout(200);
    const c = await st(page);
    ok(`${T} cambio de métrica y de periodo sin placeholder`, c.pend.length === 0 && /^liquidity\|/.test(c.evo || ''), JSON.stringify(c));
    ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ── P1 · SEGUNDO REPINTADO: resolved → pending → resolved ───────────────────
  // Un observador cuenta cada vez que Explora o Evolución, YA resueltas en esta
  // página, vuelven a un placeholder. `__probeMark` distingue recarga real (se
  // pierde) de repintado interno (sobrevive).
  const WATCH = `(function(){ if (window.__regWatch) return; window.__regWatch = 1; window.__probeMark = window.__probeMark || Math.random();
    window.__reg = { resolved: { evo: false, ex: false }, back: [] };
    var vis=function(e){ var r=e.getBoundingClientRect(); return r.width>0 && r.height>0; };
    var chk=function(){ var R=window.__reg;
      var evoOk=[].slice.call(document.querySelectorAll('.intv21-evo:not(.is-pending)')).some(vis), exOk=[].slice.call(document.querySelectorAll('.intcc-explore:not(.is-pending)')).some(vis);
      var evoP=[].slice.call(document.querySelectorAll('.intv21-evo.is-pending')).some(vis), exP=[].slice.call(document.querySelectorAll('.intcc-explore.is-pending')).some(vis);
      if (R.resolved.evo && evoP) R.back.push('evo'); if (R.resolved.ex && exP) R.back.push('explore');
      if (evoOk) R.resolved.evo = true; if (exOk) R.resolved.ex = true; };
    new MutationObserver(chk).observe(document.body, { childList: true, subtree: true }); chk(); })()`;
  const reg = async (page) => JSON.parse(await page.evaluate(`JSON.stringify({ back: (window.__reg||{back:[]}).back, mark: window.__probeMark || null, trace: (window.__aurixIntelTrace||[]).filter(function(t){ return /memo|pending/.test(t.r); }) })`));
  {
    // R1 · la cartera se actualiza (precios + una posición nueva ⇒ otra huella) mientras
    // una fuente vuelve a estar en vuelo: es la transición que deja placeholders.
    for (const w of [390, 1440]) {
      const T = `[${E} P1 huella ${w}]`;
      const P = persona('real');
      const { ctx, page, errs } = await newPage(w);
      await boot(page, P, 'es');
      await page.evaluate(SESSION(P, 'uA', { delay: 200 }));
      await page.evaluate(`(function(){ _aurixHydrateAssetMemory(); switchTab('intelligence'); })()`); await page.waitForTimeout(1500);
      await page.evaluate(WATCH);
      const s0 = await st(page);
      await page.evaluate(`(function(){ window.__memDelay = 1500;
        var m = assets.find(function(a){ return a.id === 'a1'; }); if (m) m.price = m.price * 1.35;
        assets.push({ id: 'a99', ticker: 'KO', name: 'Coca-Cola', type: 'stock', qty: 1, price: 60, assetCurrency: 'USD', change24h: 0.2, marketSymbol: 'KO', transactions: [{ type: 'buy', qty: 1, price: 60, ts: Date.now() - 864e5 }] });
        _aurixHydrateAssetMemory(); render(false); })()`);
      await page.waitForTimeout(900);
      const mid = await st(page);
      await page.waitForTimeout(1600);
      const r = await reg(page), s1 = await st(page);
      ok(`${T} la actualización de la cartera con la memoria en vuelo NO devuelve Explora/Evolución a placeholder`, r.back.length === 0 && mid.pend.length === 0 && !!s0.explore && !!s0.evo, JSON.stringify({ back: r.back, mid, trace: r.trace }));
      ok(`${T} y al terminar quedan resueltas (repintado interno, sin recarga)`, s1.pend.length === 0 && !!s1.explore && !!s1.evo && r.mark != null, JSON.stringify(s1));
      ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | '));
      await ctx.close();
    }
  }
  {
    // R2 · diez ciclos entrada / regreso / recarga, con la memoria lenta.
    const T = `[${E} P1 ciclos 390]`;
    const P = persona('real');
    const { ctx, page, errs } = await newPage(390);
    await boot(page, P, 'es');
    let reloads = 0, backs = 0, empty = 0; const log = [];
    for (let i = 0; i < 10; i++) {
      const realReload = i % 3 === 2;
      if (realReload) { await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(`typeof switchTab === 'function'`, null, { timeout: 60000 }); await page.waitForTimeout(700); reloads++; }
      const fresh = await page.evaluate(`typeof window.__regWatch === 'undefined'`);
      if (fresh) { await page.evaluate(SESSION(P, 'uA', { delay: 400 })); await page.evaluate(`_aurixHydrateAssetMemory()`); }
      await page.evaluate(`switchTab('intelligence')`); await page.evaluate(WATCH);
      await page.waitForTimeout(1300);
      await page.evaluate(`switchTab('home')`); await page.waitForTimeout(250);
      await page.evaluate(`switchTab('intelligence')`); await page.waitForTimeout(700);
      const r = await reg(page), s = await st(page);
      backs += r.back.length; if (s.pend.length || !s.explore || !s.evo) empty++;
      log.push((realReload ? 'R' : 'n') + ':' + r.back.length + ':' + s.pend.length);
    }
    ok(`${T} 10 ciclos (${reloads} recargas reales): cero regresiones a placeholder y cero cards vacías al final de cada ciclo`, backs === 0 && empty === 0, log.join(' '));
    ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  {
    // R3 · cinco cambios rápidos de métrica/periodo con la memoria refrescándose.
    const T = `[${E} P1 rápidos 1440]`;
    const P = persona('real');
    const { ctx, page, errs } = await newPage(1440);
    await boot(page, P, 'es');
    await page.evaluate(SESSION(P, 'uA', { delay: 200 }));
    await page.evaluate(`(function(){ _aurixHydrateAssetMemory(); switchTab('intelligence'); })()`); await page.waitForTimeout(1500);
    await page.evaluate(WATCH);
    await page.evaluate(`(function(){ window.__memDelay = 900; _aurixHydrateAssetMemory(); })()`);
    const seq = [['metric', 'liquidity'], ['win', '7d'], ['metric', 'effective'], ['metric', 'top'], ['win', '30d']];
    for (const [k, v] of seq) { await page.locator(`.intv21-evo [data-intv21-evo-${k}="${v}"]:visible`).first().click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(60); }
    await page.waitForTimeout(1800);
    const r = await reg(page), s = await st(page);
    ok(`${T} cinco cambios rápidos: la selección final es la última pulsada y ninguna respuesta tardía la pisa`, s.evo === 'top|30d' && r.back.length === 0 && s.pend.length === 0, JSON.stringify({ s, back: r.back }));
    ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  {
    // R4 · error parcial y actualización posterior: un fallo no borra lo válido.
    const T = `[${E} P1 error 390]`;
    const P = persona('real');
    const { ctx, page, errs } = await newPage(390);
    await boot(page, P, 'es');
    await page.evaluate(SESSION(P, 'uA', { delay: 200 }));
    await page.evaluate(`(function(){ _aurixHydrateAssetMemory(); switchTab('intelligence'); })()`); await page.waitForTimeout(1500);
    await page.evaluate(WATCH);
    const s0 = await st(page);
    await page.evaluate(`(function(){ window.__memFail = true; window.__memDelay = 300; _aurixHydrateAssetMemory(); render(false); })()`); await page.waitForTimeout(1300);
    const s1 = await st(page);
    await page.evaluate(`(function(){ window.__memFail = false; _aurixHydrateAssetMemory(); render(false); })()`); await page.waitForTimeout(1300);
    const r = await reg(page), s2 = await st(page);
    ok(`${T} lectura fallida tras una válida: ningún placeholder y Explora sigue publicada`, r.back.length === 0 && s1.pend.length === 0 && !!s1.explore, JSON.stringify({ s0, s1, back: r.back }));
    ok(`${T} la actualización posterior vuelve a dejar Evolución completa`, s2.pend.length === 0 && s2.evo === s0.evo && s2.explore === s0.explore, JSON.stringify({ s0, s2 }));
    ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  {
    // R5 · borrar una posición con una fuente en vuelo: lo guardado mencionaba una
    // posición que ya no existe ⇒ no se reutiliza (esqueleto honesto, luego resuelto).
    const T = `[${E} P1 borrado 1440]`;
    const P = persona('real');
    const { ctx, page, errs } = await newPage(1440);
    await boot(page, P, 'es');
    await page.evaluate(SESSION(P, 'uA', { delay: 200 }));
    await page.evaluate(`(function(){ _aurixHydrateAssetMemory(); switchTab('intelligence'); })()`); await page.waitForTimeout(1500);
    const mid = JSON.parse(await page.evaluate(`(function(){ var i=assets.findIndex(function(a){ return a.id==='a1'; }); assets.splice(i,1);
      _aurixAssetMemory = { userId: 'uA', rows: [], state: 'loading', at: Date.now() };
      var ph=document.getElementById('tabPlaceholder'); ph.innerHTML = renderIntelligenceTab(); _initIntelligenceCommandCenter();
      var ex=document.querySelector('.intcc-explore'), ev=document.querySelector('.intv21-evo');
      return JSON.stringify({ ex: ex ? ex.textContent : '', ev: ev ? ev.textContent : '' }); })()`));
    ok(`${T} tras borrar Microsoft, lo guardado que la mencionaba no se reutiliza mientras llega la actualización`, !/Microsoft/.test(mid.ex + mid.ev), JSON.stringify(mid).slice(0, 300));
    ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ── P2 · GRÁFICO: cadencia mixta de producción (diaria antigua + 15 min reciente) ──
  if (!process.env.P0_ONLY) {
    const T = `[${E} P2 gráfico]`;
    const P = persona('real');
    const { ctx, page, errs } = await newPage(1440);
    await boot(page, P, 'es');
    const g = JSON.parse(await page.evaluate(`(function(){
      var D=864e5, now=Date.now(), pts=[], v=100000;
      for (var t=now-70*D; t<now-35*D; t+=D) pts.push({ ts: t, v: v += 120 });            // retención: 1 fila/día
      for (var t2=now-35*D; t2<now-10*D; t2+=15*60e3) pts.push({ ts: t2, v: v += 1 });    // capturas cada 15 min
      var gapAt = now-10*D + 14*3600e3;                                                    // 14 h sin capturas (hueco REAL)
      for (var t3=gapAt; t3<now; t3+=15*60e3) pts.push({ ts: t3, v: v += 1 });
      var r = _intv22Svg({ pts: pts, unit: 'money' }, 'value');
      // regla anterior (mediana GLOBAL): cuántos cortes habría producido
      var gs=[]; for (var i=1;i<pts.length;i++) gs.push(pts[i].ts-pts[i-1].ts); var med=gs.slice().sort(function(a,b){return a-b;})[Math.floor(gs.length/2)];
      var old=gs.filter(function(x){ return x > Math.max(6*3600e3, 2.5*med); }).length;
      return JSON.stringify({ gaps: r.gaps, oldCuts: old, areas: (r.svg.match(/class="intv22-area"/g)||[]).length, bridge: /intv3-evo-bridge/.test(r.svg),
        areaSubs: ((r.svg.match(/class="intv22-area" d="([^"]+)"/)||[,''])[1].match(/Z/g)||[]).length,
        segs: ((r.svg.match(/class="intv21-evo-line"[^>]*d="([^"]+)"/)||[,''])[1].match(/M/g)||[]).length }); })()`));
    ok(`${T} la regla anterior partía la historia diaria en ${g.oldCuts} tramos sueltos (causa del «código de barras»)`, g.oldCuts >= 20, JSON.stringify(g));
    ok(`${T} ahora: sólo el hueco real de 14 h se corta, con puente discontinuo; un único path de relleno, sin rellenar el hueco`, g.gaps === 1 && g.segs === 2 && g.bridge && g.areas === 1 && g.areaSubs === 2, JSON.stringify(g));
    ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ── V6 · CONTRATO FINANCIERO ÚNICO: la liquidez no es una inversión ──────────
  if (!process.env.P0_ONLY && !process.env.P1_ONLY) for (const [w, lng] of (process.env.V6_MATRIX || '360:es,375:en,390:es,768:es,1024:es,1440:es,1440:en').split(',').map(x => x.split(':'))) {
    const W6 = Number(w), T = `[${E} V6 cash ${W6} ${lng}]`;
    if (!W6) continue;
    const P = persona('cash');
    const RM = W6 === 375;   // movimiento reducido en una de las celdas de la matriz
    const { ctx, page, errs } = await newPage(W6, RM);
    await boot(page, P, lng);
    await page.evaluate(SESSION(P, 'uA', { delay: 0 }));
    await page.evaluate(`(function(){ _aurixCapitalFlowsIncomplete = false; _aurixHydrateAssetMemory(); switchTab('intelligence'); })()`); await page.waitForTimeout(1600);
    const U = JSON.parse(await page.evaluate(`(function(){ var vis=function(e){ return e && e.getBoundingClientRect().width>0; };
      var q=function(s){ return [].slice.call(document.querySelectorAll(s)).filter(vis); };
      var txt=function(e){ return e ? e.textContent.replace(/\\s+/g,' ').trim() : ''; };
      var hero=(q('.intcc-m-hero-title')[0]||q('.intcc-hero-title')[0]);
      var drv=q('.intcc-drivers')[0];
      var evo=document.querySelector('.intv21-evo');
      var sc=document.querySelector('.intv21-scen');
      var top1=sc ? sc.querySelector('.intv22-scn-block[data-scn="top1"]') : null, top3=sc ? sc.querySelector('.intv22-scn-block[data-scn="top3"]') : null;
      return JSON.stringify({ hero: txt(hero), tags: q('.intv21-tag').map(txt),
        rank: drv ? [].slice.call(drv.querySelectorAll('.intcc-drv-row .intcc-drv-name')).map(function(n){ return n.firstChild ? n.firstChild.textContent.trim() : ''; }) : [],
        drv: txt(drv), evo: evo ? { metric: evo.getAttribute('data-metric'), head: txt(evo.querySelector('.intv22-head')), stats: txt(evo.querySelector('.intv22-stats')) } : null,
        xq: q('.intcc-explore .intcc-x-q').map(txt), xa: [].slice.call(document.querySelectorAll('.intcc-explore .intcc-x-answer')).map(txt).join(' | '),
        s1: top1 ? txt(top1) : '', s3: top3 ? txt(top3) : '' }); })()`));
    const EUROS = /Euros/;
    ok(`${T} Hero: la liquidez nunca entra en «pesan más que…»; si es la mayor partida, se dice como liquidez`, !/Euros, |Euros y|y Euros/.test(U.hero)
      && (/liquidez|cash/i.test(U.hero) || !EUROS.test(U.hero)), U.hero);
    ok(`${T} Factores: el ranking es de INVERSIONES (sin Euros) y la liquidez va aparte`, U.rank.length >= 3 && !U.rank.some(n => EUROS.test(n))
      && /(liquidez representa|cash makes up)/i.test(U.drv) && !/estabilidad|stability|oportunidades|opportunities/i.test(U.drv), JSON.stringify({ rank: U.rank, drv: U.drv.slice(0, 220) }));
    ok(`${T} Evolución (mayor posición): nunca la liquidez`, !U.evo || U.evo.metric !== 'top' || (!EUROS.test(U.evo.head) && !EUROS.test(U.evo.stats)), JSON.stringify(U.evo));
    ok(`${T} Explora: ninguna pregunta trata la liquidez como posición; la liquidez se pregunta como liquidez`, !U.xq.some(x => EUROS.test(x)) && !EUROS.test(U.xa.replace(/liquidez|cash/gi, '')), JSON.stringify(U.xq));
    ok(`${T} Escenarios: mayor posición y tres mayores son inversiones`, /Bitcoin/.test(U.s1) && !EUROS.test(U.s1) && !EUROS.test(U.s3), JSON.stringify([U.s1.slice(0, 80), U.s3.slice(0, 120)]));
    ok(`${T} etiquetas del hero sin tratar la liquidez como posición`, !U.tags.some(t => /^Euros/.test(t)), JSON.stringify(U.tags));
    // ── Fase B: composición móvil, contraste y áreas seguras ──
    const B = JSON.parse(await page.evaluate(`(function(){
      var vis=function(e){ return e && e.getBoundingClientRect().width>0; };
      var hero=[].slice.call(document.querySelectorAll('.intcc-m-hero-title, .intcc-hero-title')).filter(vis)[0];
      var lh=parseFloat(getComputedStyle(hero).lineHeight); var lines=Math.round(hero.getBoundingClientRect().height / lh);
      var tags=[].slice.call(document.querySelectorAll('.intv21-tag')).filter(vis).map(function(t){ return Math.round(t.getBoundingClientRect().top); });
      var rows=tags.filter(function(v,i,a){ return a.indexOf(v)===i; }).length;
      var lum=function(c){ var m=c.match(/[\\d.]+/g).map(Number); var a=m.length>3?m[3]:1; var bg=[22,30,50];
        var rgb=[0,1,2].map(function(i){ return m[i]*a + bg[i]*(1-a); }).map(function(v){ v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4); });
        return 0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2]; };
      var ratio=function(e){ var L=lum(getComputedStyle(e).color), B2=lum('rgb(22,30,50)'); return (Math.max(L,B2)+0.05)/(Math.min(L,B2)+0.05); };
      var sec=[].slice.call(document.querySelectorAll('.intv4-story-why, .intv21-evo-axis, .intv5-sim-lead, .intv15-drv-factor, .intv22-stats dt, .intv22-scn-kind, .intv6-y-lab')).filter(vis);
      var low=sec.map(function(e){ return [e.className.split(' ')[0], +ratio(e).toFixed(2)]; }).filter(function(x){ return x[1] < 4.5; });
      var st=[].slice.call(document.querySelectorAll('.intcc-watch .intv21-today.has-icon')).filter(vis).map(function(a){ var ic=a.querySelector('.intv3-today-icon').getBoundingClientRect(); var mk=getComputedStyle(a,'::before'); var ar=a.getBoundingClientRect();
        var mt=ar.top + parseFloat(mk.top) + parseFloat(mk.marginTop||0) + parseFloat(mk.height)/2; return Math.abs(mt - (ic.top + ic.height/2)); });
      var val=document.querySelector('.intv5-sim-value'), rng=document.querySelector('.intv5-sim-range');
      var vr=val.getBoundingClientRect(), rr=rng.getBoundingClientRect();
      var root=document.querySelector('.aurix-intcc'), last=[].slice.call(root.children).filter(vis).pop(); var pb=parseFloat(getComputedStyle(root).paddingBottom);
      return JSON.stringify({ lines: lines, rows: rows, ntags: tags.length, low: low, align: st, near: Math.abs((vr.top+vr.bottom)/2 - (rr.top+rr.bottom)/2) < 60, pb: pb,
        hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }); })()`));
    ok(`${T} hero: titular en ≤4 líneas${W6 < 768 ? ' y etiquetas en filas compactas' : ''}`, B.lines <= 4 && (W6 >= 768 || B.rows < B.ntags || B.ntags <= 1), JSON.stringify(B));
    ok(`${T} contraste ≥ 4,5:1 en los textos secundarios`, B.low.length === 0, JSON.stringify(B.low));
    ok(`${T} Hoy: la marca de dirección centrada con el icono (±3 px)`, B.align.every(d => d <= 3), JSON.stringify(B.align));
    ok(`${T} simulador: el valor forma parte del control; sin scroll horizontal`, B.near && !B.hscroll, JSON.stringify(B));
    if (W6 < 768) ok(`${T} la última card queda libre de la barra fija y el área segura (≥ 96 px de margen final)`, B.pb >= 96, String(B.pb));
    if (RM) { const anim = await page.evaluate(`(function(){ var a=[]; var hero=document.querySelector('.intcc-m-hero, .intcc-hero'); if (hero) a.push(getComputedStyle(hero,'::after').animationName);
        var t=document.querySelector('.intcc-card-title'); if (t) a.push(getComputedStyle(t,'::before').animationName);
        var b=document.querySelector('.intv6-bar, .intv6-stem'); if (b) a.push(getComputedStyle(b).animationName); return a; })()`);
      ok(`${T} movimiento reducido: sin destello, sin pulso y sin crecimiento animado`, anim.every(n => n === 'none'), JSON.stringify(anim)); }
    ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | '));
    if (process.env.DUMP) console.log(T, JSON.stringify(U, null, 1));
    await ctx.close();
  }

  // ── V5 · GEOMETRÍA ESTABLE, SIMULADOR, MONEDA Y ESQUELETOS ──────────────────
  if (!process.env.P0_ONLY && !process.env.P1_ONLY) for (const [w, lng] of (process.env.V5_MATRIX || '360:es,390:es,390:en,768:es,1024:es,1440:es,1440:en').split(',').map(x => x.split(':'))) {
    const W5 = Number(w), T = `[${E} V5 ${W5} ${lng}]`;
    if (!W5) continue;
    const P = persona('real');
    const { ctx, page, errs } = await newPage(W5);
    await boot(page, P, lng);
    // Primera carga real: los esqueletos tienen la geometría del contenido.
    await page.evaluate(SESSION(P, 'uA', { delay: 700 }));
    await page.evaluate(`(function(){ _aurixCapitalFlowsIncomplete = false; _aurixHydrateAssetMemory(); switchTab('intelligence'); })()`); await page.waitForTimeout(150);
    const sk = JSON.parse(await page.evaluate(`JSON.stringify({ evo: Math.round((document.querySelector('.intcc-timeline')||{getBoundingClientRect:function(){return{height:0};}}).getBoundingClientRect().height), ex: Math.round((document.querySelector('.intcc-explore')||{getBoundingClientRect:function(){return{height:0};}}).getBoundingClientRect().height), pend: document.querySelectorAll('[data-pending="1"]').length })`));
    await page.waitForTimeout(1500);
    const rs = JSON.parse(await page.evaluate(`JSON.stringify({ evo: Math.round(document.querySelector('.intcc-timeline').getBoundingClientRect().height), ex: Math.round(document.querySelector('.intcc-explore').getBoundingClientRect().height) })`));
    // RE-DECIDIDO (V6): en escritorio la reserva de Explora se MIDE con las respuestas reales
    // (que no existen en la primera carga) y está acotada a 1,2× la fila; el esqueleto ocupa la
    // fila y la card resuelta nunca pasa de ese tope. Evolución y móvil: ±15 %.
    ok(`${T} primera carga: esqueletos con la geometría real`, sk.pend >= 1 && Math.abs(sk.evo - rs.evo) <= 0.15 * rs.evo
      && (W5 >= 1024 ? (rs.ex <= 1.2 * sk.ex + 1 && rs.ex >= sk.ex - 1) : Math.abs(sk.ex - rs.ex) <= 0.15 * rs.ex), JSON.stringify({ sk, rs }));
    const geo = `JSON.stringify((function(){ var q=function(s){ var e=document.querySelector(s); if(!e) return null; var r=e.getBoundingClientRect(); return { t: Math.round(r.top+scrollY), h: Math.round(r.height), l: Math.round(r.left), r: Math.round(r.right), sh: e.scrollHeight - e.clientHeight }; };
      return { radar: q('.intcc-radar'), drv: q('.intcc-drivers'), ex: q('.intcc-explore'), evo: q('.intcc-timeline'), hoy: q('.intcc-watch'), scen: q('.intv21-scen') }; })())`;
    await page.mouse.move(1, 1); await page.waitForFunction(`!!document.querySelector('.aurix-intcc.is-revealed')`, null, { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(1100);
    const g0 = JSON.parse(await page.evaluate(geo));
    // V5.1 · al entrar ya hay UNA respuesta abierta (la prioritaria), sin hueco vacío.
    const x0 = JSON.parse(await page.evaluate(`JSON.stringify({ open: document.querySelectorAll('.intcc-explore .intcc-x-answer.is-open').length,
      exp: [].slice.call(document.querySelectorAll('.intcc-explore .intcc-x-q')).filter(function(b){ return b.getAttribute('aria-expanded') === 'true'; }).length,
      first: (document.querySelector('.intcc-explore .intcc-x-q[aria-expanded="true"]')||{getAttribute:function(){return null;}}).getAttribute('data-intcc-q') })`));
    // RE-DECIDIDO (V6): entra CERRADA y con las preguntas repartidas por toda la altura.
    const spread = await page.evaluate(`(function(){ var l=document.querySelector('.intcc-explore-list'), qs=l ? l.querySelectorAll('.intcc-x-item') : []; if(!l||!qs.length) return 0;
      var lr=l.getBoundingClientRect(), a=qs[0].getBoundingClientRect(), b=qs[qs.length-1].getBoundingClientRect(); return (b.bottom - a.top) / lr.height; })()`);
    ok(`${T} Explora entra cerrada (ninguna respuesta abierta) y con las preguntas repartidas`, x0.open === 0 && x0.exp === 0 && spread >= 0.75, JSON.stringify({ x0, spread }));
    // Explora: abrir / cerrar cada respuesta no mueve nada.
    const nq = await page.evaluate(`document.querySelectorAll('.intcc-explore .intcc-x-q').length`);
    let moved = [];
    for (let i = 0; i < nq; i++) {
      await page.locator('.intcc-explore .intcc-x-q').nth(i).click(); await page.mouse.move(1, 1); await page.waitForTimeout(320);
      const g = JSON.parse(await page.evaluate(geo));
      if (process.env.DBG) console.log('X', i, JSON.stringify(['radar', 'drv', 'ex', 'evo', 'hoy'].map(k => [k, g[k].t - g0[k].t, g[k].h - g0[k].h])));
      const d = ['radar', 'drv', 'ex', 'evo', 'hoy', 'scen'].filter(k => g[k] && g0[k] && (Math.abs(g[k].t - g0[k].t) > 1 || Math.abs(g[k].h - g0[k].h) > 1));
      if (d.length) moved.push(i + ':' + d.join('+'));
      const vis = await page.evaluate(`(function(){ var a=document.querySelector('.intcc-x-answer.is-open'); var z=document.querySelector('.intv6-x-answers'); if(!a) return 'closed'; if(!z) return false; var ar=a.getBoundingClientRect(), zr=z.getBoundingClientRect(), c=document.querySelector('.intcc-explore').getBoundingClientRect(); return ar.top >= zr.top - 1 && ar.top < zr.bottom && zr.bottom <= c.bottom + 1; })()`);
      if (!vis) moved.push(i + ':answer-not-visible');
    }
    ok(`${T} abrir cada respuesta de Explora no cambia ninguna altura ni posición (${nq} preguntas)`, nq >= 2 && moved.length === 0, JSON.stringify(moved));
    ok(`${T} sólo una respuesta abierta a la vez`, await page.evaluate(`document.querySelectorAll('.intcc-x-answer.is-open').length <= 1`));
    // V5.1 · si el usuario la cierra, ningún repintado (normal o con fuente en vuelo) la reabre.
    { await page.evaluate(`(function(){ var b=document.querySelector('.intcc-explore .intcc-x-q[aria-expanded="true"]'); if (b) b.click(); })()`); await page.waitForTimeout(250);
      const r1 = await page.evaluate(`(function(){ var ph=document.getElementById('tabPlaceholder'); ph.innerHTML=renderIntelligenceTab(); _initIntelligenceCommandCenter(); return document.querySelectorAll('.intcc-explore .intcc-x-answer.is-open').length; })()`);
      const r2 = await page.evaluate(`(function(){ _aurixAssetMemory = { userId: 'uA', rows: [], state: 'loading', at: Date.now() }; var ph=document.getElementById('tabPlaceholder'); ph.innerHTML=renderIntelligenceTab(); _initIntelligenceCommandCenter();
        var n=document.querySelectorAll('.intcc-explore .intcc-x-answer.is-open').length; return n; })()`);
      // La lectura forzada a mano no existe: se libera y la hidratación REAL la sustituye.
      await page.evaluate(`(function(){ _aurixAssetMemory = { userId: 'uA', rows: [], state: 'idle', at: 0 }; _aurixHydrateAssetMemory(); })()`); await page.waitForTimeout(1500);
      const r3 = await page.evaluate(`document.querySelectorAll('.intcc-explore .intcc-x-answer.is-open').length`);
      ok(`${T} cerrada por el usuario, sigue cerrada tras repintar, con memoria en vuelo y al llegar la memoria`, r1 === 0 && r2 === 0 && r3 === 0, JSON.stringify([r1, r2, r3])); }
    { const m0 = await page.evaluate(`(document.querySelector('.intcc-explore')||{}).__intv5Measures || 0`); await page.waitForTimeout(1500);
      const m1 = await page.evaluate(`(document.querySelector('.intcc-explore')||{}).__intv5Measures || 0`);
      ok(`${T} la reserva de Explora no oscila (ninguna medida nueva en reposo)`, m1 === m0 && m1 >= 1, JSON.stringify({ m0, m1 })); }
    // Evolución: misma altura en todas las métricas y periodos, sin scroll interno.
    const evoH = [];
    for (const m of await page.evaluate(`[].slice.call(document.querySelectorAll('.intv21-evo [data-intv21-evo-metric]')).map(function(b){ return b.getAttribute('data-intv21-evo-metric'); })`)) {
      await page.locator(`.intv21-evo [data-intv21-evo-metric="${m}"]`).first().click(); await page.waitForTimeout(120);
      for (const wn of await page.evaluate(`[].slice.call(document.querySelectorAll('.intv21-evo [data-intv21-evo-win]')).map(function(b){ return b.getAttribute('data-intv21-evo-win'); })`)) {
        await page.locator(`.intv21-evo [data-intv21-evo-win="${wn}"]`).first().click(); await page.waitForTimeout(100);
        const g = JSON.parse(await page.evaluate(geo));
        const hd = await page.evaluate(`(function(){ var h=document.querySelector('.intv22-head'); return h ? h.scrollHeight - h.clientHeight : 0; })()`);
        evoH.push(m + '/' + wn + ':' + g.evo.h + ':' + Math.max(g.evo.sh, hd) + ':' + (g.scen ? g.scen.t : 0));
        if (process.env.DBG) console.log(m, wn, await page.evaluate(`[].slice.call(document.querySelector('.intv21-evo').children).map(function(c){ return c.className.split(' ')[0]+':'+c.getBoundingClientRect().height.toFixed(2); }).join(' ') + ' | card ' + document.querySelector('.intcc-timeline').getBoundingClientRect().height.toFixed(2)`));
      }
    }
    const hs = evoH.map(x => Number(x.split(':')[1])), ss = evoH.map(x => Number(x.split(':')[2])), ts = evoH.map(x => Number(x.split(':')[3]));
    ok(`${T} Evolución: misma altura en todas las métricas y periodos, sin scroll interno, y nada de debajo se mueve`, Math.max(...hs) - Math.min(...hs) === 0 && ss.every(x => x <= 1) && Math.max(...ts) - Math.min(...ts) === 0, evoH.join(' '));
    // Orden y columnas: Evolución ~2/3 | Hoy ~1/3 ; Dependencias a ancho completo debajo.
    await page.mouse.move(1, 1); await page.waitForFunction(`!!document.querySelector('.aurix-intcc.is-revealed')`, null, { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(1100);
    const G = JSON.parse(await page.evaluate(geo));
    const rowOk = W5 >= 1024 ? (G.hoy.l >= G.evo.r && Math.abs(G.hoy.t - G.evo.t) <= 1 && (G.evo.r - G.evo.l) / (G.hoy.r - G.evo.l) > 0.58 && (G.evo.r - G.evo.l) / (G.hoy.r - G.evo.l) < 0.72
      && G.scen.t > G.evo.t + G.evo.h - 1 && G.scen.l === G.evo.l && G.scen.r === G.hoy.r)
      : (G.hoy.t > G.evo.t && G.scen.t > G.hoy.t);
    ok(`${T} ${W5 >= 1024 ? 'Evolución ⅔ | Hoy ⅓ en la misma fila y Dependencias a ancho completo debajo' : 'Evolución → Hoy → Dependencias'}`, rowOk, JSON.stringify(G));
    // Simulador común: un control, tres resultados, % y moneda del mismo universo.
    const sim = async (v) => JSON.parse(await page.evaluate(`(function(){ var s=document.querySelector('.intv21-scen input[type="range"]'); if(!s) return JSON.stringify({ none: true });
      s.value=${v}; s.dispatchEvent(new Event('input', { bubbles: true }));
      var W=_intv21Weights(), sc=_intv21Scenarios(W), base=(typeof investableValueBase==='function') ? investableValueBase() : 0;
      return JSON.stringify({ val: document.querySelector('.intv21-scen [data-sim-value]') ? document.querySelector('.intv21-scen [data-sim-value]').textContent : '',
        blocks: [].slice.call(document.querySelectorAll('.intv21-scen .intv22-scn-block')).map(function(b){ return { id: b.getAttribute('data-scn'), imp: Number(b.getAttribute('data-impact')), money: Number(b.getAttribute('data-money')),
          txt: b.textContent.replace(/\\s+/g,' ').trim(), dir: b.getAttribute('data-dir'), vis: b.getBoundingClientRect().height > 0 }; }),
        expect: sc.map(function(x){ return { id: x.id, imp: x.w * ${v}, money: x.w * ${v} / 100 * base }; }) }); })()`));
    const s10 = await sim(-10);
    if (s10.none) ok(`${T} Dependencias tiene un único control común (slider)`, false, 'sin slider');
    else {
      const base = JSON.parse(readFileSync('/tmp/v811-baseline.json', 'utf8'))[['real', lng, W5].join('|')];
      const b811 = base && base.scn ? JSON.parse(base.scn) : null;
      ok(`${T} −10 %: los tres resultados coinciden con los certificados de v811`, !!b811 && s10.blocks.length === 3 && s10.blocks.every((b, i) => Math.abs(b.imp - b811[i].impact) < 0.001), JSON.stringify({ s10: s10.blocks.map(b => b.imp), b811 }));
      ok(`${T} los tres resultados se ven a la vez (también en móvil, apilados)`, s10.blocks.every(b => b.vis), JSON.stringify(s10.blocks.map(b => b.vis)));
      for (const v of [-50, -25, 0, 10, 25, 50]) {
        const s = await sim(v);
        const okv = s.blocks.length === 3 && s.blocks.every((b, i) => Math.abs(b.imp - s.expect[i].imp) < 1e-9 && Math.abs(b.money - s.expect[i].money) < 0.005)
          && (v !== 0 || s.blocks.every(b => b.imp === 0 && b.money === 0 && b.dir === 'flat'))
          && s.blocks.every(b => v === 0 ? /(no cambiara|did not change)/.test(b.txt) : (v < 0 ? /(bajara|fell)/.test(b.txt) : /(subiera|rose)/.test(b.txt)));
        ok(`${T} slider ${v > 0 ? '+' : ''}${v} %: % y moneda = peso × movimiento, signo y copy coherentes`, okv, JSON.stringify({ v, s: s.blocks.map(b => [b.imp, b.money, b.dir, b.txt.slice(0, 60)]), e: s.expect }));
      }
      const pm = JSON.parse(await page.evaluate(`(function(){ var s=document.querySelector('.intv21-scen input[type="range"]'); s.value=25; s.dispatchEvent(new Event('input',{bubbles:true}));
        var a=[].slice.call(document.querySelectorAll('.intv21-scen .intv22-scn-block')).map(function(b){ return Number(b.getAttribute('data-impact')); });
        s.value=-25; s.dispatchEvent(new Event('input',{bubbles:true}));
        var b=[].slice.call(document.querySelectorAll('.intv21-scen .intv22-scn-block')).map(function(b){ return Number(b.getAttribute('data-impact')); });
        return JSON.stringify({ a: a, b: b }); })()`));
      { const fx = JSON.parse(await page.evaluate(`(function(){ var b0=baseCurrency, r0=usdToEur; baseCurrency='EUR'; usdToEur=0.9;
          var s=document.querySelector('.intv21-scen input[type="range"]'); s.value=-50; s.dispatchEvent(new Event('input',{bubbles:true}));
          var blk=document.querySelector('.intv21-scen .intv22-scn-block'); var out={ money: Number(blk.getAttribute('data-money')), w: Number(blk.getAttribute('data-w')), usd: investableValueUSD(), txt: blk.querySelector('[data-sim-money]').textContent };
          baseCurrency=b0; usdToEur=r0; s.value=-10; s.dispatchEvent(new Event('input',{bubbles:true})); return JSON.stringify(out); })()`));
        ok(`${T} cambio de moneda con la card abierta: el importe se recalcula en la moneda nueva`, Math.abs(fx.money - fx.w * -50 / 100 * fx.usd * 0.9) < 0.01 && /€/.test(fx.txt), JSON.stringify(fx)); }
      ok(`${T} caída y subida simétricas (+25 = −(−25))`, pm.a.every((x, i) => Math.abs(x + pm.b[i]) < 1e-12), JSON.stringify(pm));
      // teclado y botones
      const kb = JSON.parse(await page.evaluate(`(function(){ var s=document.querySelector('.intv21-scen input[type="range"]'); s.value=-10; s.dispatchEvent(new Event('input',{bubbles:true}));
        document.querySelector('.intv21-scen [data-sim-step="1"]').click(); var a=s.value; document.querySelector('.intv21-scen [data-sim-step="-1"]').click(); document.querySelector('.intv21-scen [data-sim-step="-1"]').click();
        var r=[].slice.call(document.querySelectorAll('.intv21-scen [data-sim-step]')).map(function(b){ var x=b.getBoundingClientRect(); return Math.min(x.width,x.height); });
        return JSON.stringify({ up: a, down: s.value, min: Math.min.apply(null, r), aria: s.getAttribute('aria-valuetext') || '', label: !!(s.getAttribute('aria-label') || s.labels && s.labels.length) }); })()`));
      ok(`${T} botones ±5 accesibles (≥44 px) y valor anunciado`, kb.up === '-5' && kb.down === '-15' && kb.min >= 44 && /15/.test(kb.aria) && kb.label, JSON.stringify(kb));
      await page.focus('.intv21-scen input[type="range"]'); await page.keyboard.press('ArrowRight');
      ok(`${T} flechas del teclado mueven el control en pasos de 5`, await page.evaluate(`document.querySelector('.intv21-scen input[type="range"]').value === '-10'`));
      await page.evaluate(`switchTab('home')`); await page.waitForTimeout(250); await page.evaluate(`switchTab('intelligence')`); await page.waitForTimeout(600);
      ok(`${T} la selección no persiste: al volver empieza en −10 %`, await page.evaluate(`document.querySelector('.intv21-scen input[type="range"]').value === '-10'`));
      // RE-DECIDIDO (V5.1): nueva frase única.
      ok(`${T} sin insignia «Hipotético» ni nota al pie; frase única junto al control`, await page.evaluate(`!document.querySelector('.intv3-scn-tag') && !document.querySelector('.intv21-scen .intv21-foot') && /compara su efecto en tus principales dependencias|compare its effect on your main dependencies/.test(document.querySelector('.intv21-scen').textContent)`));
      // V5.1 · rail bipolar: el tramo nace en 0; ningún escenario destacado por defecto.
      const bip = JSON.parse(await page.evaluate(`(function(){ var s=document.querySelector('.intv21-scen input[type="range"]'), t=document.querySelector('.intv21-scen .intv5-sim-track'), act=t.querySelector('.intv5-sim-active'), o=t.querySelector('.intv5-sim-origin');
        var get=function(v){ s.value=v; s.dispatchEvent(new Event('input',{bubbles:true})); return new Promise(function(res){ setTimeout(function(){ var a=act.getBoundingClientRect(), z=o.getBoundingClientRect(); res({ v: v, dir: t.getAttribute('data-dir'), l: Math.round(a.left), r: Math.round(a.right), w: Math.round(a.width), z: Math.round(z.left + z.width/2) }); }, 650); }); };
        var out=[]; return [-50,-10,0,10,50].reduce(function(p,v){ return p.then(function(){ return get(v).then(function(x){ out.push(x); }); }); }, Promise.resolve()).then(function(){ s.value=-10; s.dispatchEvent(new Event('input',{bubbles:true}));
          return JSON.stringify({ out: out, on: document.querySelectorAll('.intv21-scen .intv22-scn-block.is-on').length }); }); })()`));
      const by = Object.fromEntries(bip.out.map(x => [x.v, x]));
      ok(`${T} rail bipolar: −10 nace en 0 hacia la izquierda, +10 igual a la derecha, 0 sin tramo, ±50 simétricos`,
        by[-10].dir === 'down' && Math.abs(by[-10].r - by[-10].z) <= 2 && by[10].dir === 'up' && Math.abs(by[10].l - by[10].z) <= 2 && Math.abs(by[10].w - by[-10].w) <= 1
        && by[0].dir === 'flat' && by[0].w <= 1 && Math.abs(by[50].w - by[-50].w) <= 1 && by[50].w > by[10].w, JSON.stringify(bip.out));
      ok(`${T} ningún escenario aparece seleccionado por defecto`, bip.on === 0, String(bip.on));
    }
    // Moneda: importes de Explora en la moneda principal (EUR) y convertidos.
    if (W5 === 1440) {
      const cur = JSON.parse(await page.evaluate(`(function(){ baseCurrency='EUR'; usdToEur=0.9; var ph=document.getElementById('tabPlaceholder'); ph.innerHTML=renderIntelligenceTab(); _initIntelligenceCommandCenter();
        var t=[].slice.call(document.querySelectorAll('.intcc-explore .intcc-x-answer')).map(function(a){ return a.textContent; }).join(' ');
        var sc=document.querySelector('.intv21-scen .intv22-scn-block'); var ex=document.querySelector('.intcc-explore');
        return JSON.stringify({ t: t.slice(0, 900), scen: sc ? sc.textContent : '', ex: ex ? ex.className + '|' + ex.getAttribute('data-explore') : 'none', pend: _intv22Pending(), mem: _aurixAssetMemory.state + ':' + (_aurixAssetMemory.rows||[]).length }); })()`));
      // la memoria del fixture es USD: +399,51 US$ ⇒ 359,56 € con 0,9
      ok(`${T} EUR: los importes de Explora se convierten (no USD con el símbolo €)`, !/399[.,]51/.test(cur.t) && /359[.,]56/.test(cur.t) && /€/.test(cur.t + cur.scen), JSON.stringify({ ex: cur.ex, pend: cur.pend, mem: cur.mem, t: cur.t.slice(0, 200) }));
    }
    ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ── FREE / PREMIUM · plan contratado vs acceso efectivo (sólo presentación) ──
  if (!process.env.P0_ONLY && !process.env.P1_ONLY) for (const kind of ['free', 'premium', 'granted']) {
    const T = `[${E} plan ${kind} 390]`;
    const P = persona('real');
    const { ctx, page, errs } = await newPage(390);
    await boot(page, P, 'es');
    await page.evaluate(SESSION(P, 'uA', { delay: 0 }));
    const r = JSON.parse(await page.evaluate(`(function(){
      var kind=${JSON.stringify(kind)}; var fe=Object.create(null), src=Object.create(null);
      _AURIX_ENT_CANON.forEach(function(k){ var on = kind !== 'free' && k !== 'workspace.catalog_preview'; fe[k]=on; src[k]= on ? (kind==='granted' ? 'override' : 'plan') : 'default'; });
      _aurixEnt={loaded:true,loading:false,error:null,plan: kind==='premium' ? 'premium' : 'free',status: kind==='premium' ? 'active' : 'none',
        source: kind==='premium' ? 'subscription' : 'default',validUntil:null,features:fe,sources:src,fetchedAt:Date.now()};
      _aurixRenderMenuIdentity(); try { _settingsPopulate(); } catch(e) {}
      var b=document.getElementById('menuUserBadge'), c=document.getElementById('settingsTierChip'), d=document.getElementById('planCurrentDesc');
      try { window.openAurixPremiumModal({ source: 'probe' }); } catch(e) {}
      var m=document.querySelector('.aurix-premium-plans');
      return JSON.stringify({ badge: b.textContent, cta: b.getAttribute('data-premium-cta'), chip: c.textContent, desc: d.textContent,
        modal: m ? m.textContent.replace(/\\s+/g,' ').trim() : '', portal: !!document.querySelector('[data-premium-portal]'), intel: hasFeature('intelligence.full') }); })()`));
    if (kind === 'free') ok(`${T} Free ordinario: FREE con CTA, Ajustes Free, sin Intelligence completa`, r.badge === 'FREE' && r.cta && r.chip === 'FREE' && !r.intel && !/activo|concedido/.test(r.modal), JSON.stringify(r));
    if (kind === 'premium') ok(`${T} Premium de pago: PREMIUM, «plan Premium activo» con portal`, r.badge === 'PREMIUM' && !r.cta && r.chip === 'PREMIUM' && /Premium está activo/.test(r.modal) && r.portal && r.intel, JSON.stringify(r));
    if (kind === 'granted') ok(`${T} acceso concedido: menú PREMIUM sin vender, Ajustes «FREE · ACCESO PREMIUM», panel honesto sin portal`, r.badge === 'PREMIUM' && !r.cta && /FREE · ACCESO PREMIUM/.test(r.chip)
      && /plan contratado es Free/.test(r.desc) && /acceso Premium concedido/.test(r.modal) && !r.portal && r.intel, JSON.stringify(r));
    ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ── PRESENTACIÓN · matriz de personas × idioma × ancho, sesión resuelta ──────
  if (!process.env.P0_ONLY && !process.env.P1_ONLY) for (const kind of (process.env.PERSONAS || 'real,qa14,fresh,calm,stale,flows').split(',')) for (const lng of (process.env.LANGS || 'es,en').split(',')) {
    const widths = process.env.WIDTHS ? process.env.WIDTHS.split(',').map(Number) : ((kind === 'real' || kind === 'qa14') ? [390, 1024, 1440, 360] : [390, 1440]);
    for (const w of widths) {
      const T = `[${E} ${kind} ${lng} ${w}]`;
      const P = persona(kind);
      const { ctx, page, errs } = await newPage(w);
      await boot(page, P, lng);
      await page.evaluate(SESSION(P, 'uA', { delay: 0 }));
      await page.evaluate(`(function(){ if (_aurixAssetMemory) {} _aurixCapitalFlowsIncomplete = false; _aurixHydrateAssetMemory(); switchTab('intelligence'); })()`);
      await page.waitForTimeout(1600);
      const r = JSON.parse(await page.evaluate(PRES));
      if (process.env.DUMP) console.log(T + '\n' + r.text + '\n');
      if (process.env.SHOTS || ((kind === 'real' || kind === 'qa14') && lng === 'es')) await page.screenshot({ path: join(OUT, `${E}-${kind}-${lng}-${w}.png`), fullPage: true });
      ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | '));
      ok(`${T} ningún placeholder visible`, r.pend === 0, String(r.pend));
      ok(`${T} sin scroll horizontal ni cards solapadas`, !r.hscroll && r.overlaps.length === 0, JSON.stringify(r.overlaps));
      ok(`${T} etiquetas del hero sin X ni control de cierre`, r.tagX === 0, String(r.tagX));
      ok(`${T} KPIs de evolución completos (sin elipsis ni recorte)`, r.kpiClip.length === 0, JSON.stringify(r.kpiClip));
      // RE-DECIDIDO (V6): cada KPI dice QUÉ mide; nunca «Actual».
      ok(`${T} KPI con significado (nunca «Actual»)`, !r.evo || (!/\bActual\b|\bNow\b/.test(r.evo.stats)
        && (r.evo.metric !== 'top' || (/al inicio|at start/.test(r.evo.stats) && !/Peso máximo(?! )|Top weight(?! change)/.test(r.evo.stats)))), r.evo && r.evo.stats);
      ok(`${T} titular de evolución sin cifras ni paréntesis`, !r.evo || (!/\d/.test(r.evo.head.replace(/^(En|Over) \d+ (días|days),|^(Desde el|Since) [^,]+(, \d{4})?,/, '')) && !/[()]/.test(r.evo.head)), r.evo && r.evo.head);
      ok(`${T} color de Cambio sólo con valoración (rentabilidad)`, !r.evo || r.evo.metric === 'return' || /is-neutral/.test(r.evo.deltaCls), JSON.stringify(r.evo));
      ok(`${T} sin jerga prohibida`, !r.jargon.length, JSON.stringify(r.jargon));
      ok(`${T} cifras nunca NaN/Infinity/undefined`, !/NaN|Infinity|undefined|null/.test(r.text), (r.text.match(/.{0,40}(NaN|Infinity|undefined|null).{0,40}/) || [''])[0]);
      ok(`${T} Radar: cinco ejes, cinco marcadores, figura cerrada y valores finitos`, !r.radar || (r.radar.axes === 5 && r.radar.dots === 5 && r.radar.uniq === 5 && r.radar.closed && r.radar.finite), JSON.stringify(r.radar));
      ok(`${T} Explora: ninguna pregunta repetida y respuestas con conclusión`, new Set(r.qs).size === r.qs.length, JSON.stringify(r.qs));
      ok(`${T} cero hechos duplicados en el registro`, !r.dups || r.dups.length === 0, JSON.stringify(r.dups));
      // ── SPEC casi final post-v810 ─────────────────────────────────────────────
      const L = JSON.parse(await page.evaluate(`(function(){
        var vis=function(e){ if(!e) return false; var r=e.getBoundingClientRect(); return r.width>0 && r.height>0 && getComputedStyle(e).display!=='none'; };
        var root=document.querySelector('.aurix-intcc');
        var KEYS=[['hero','intcc-hero'],['hero','intcc-m-hero'],['radar','intcc-radar'],['drivers','intcc-drivers'],['explore','intcc-explore'],['evo','intcc-timeline'],['scen','intv21-scen'],['today','intcc-watch']];
        var kids=[].slice.call(root.children).filter(vis);
        var kindOf=function(e){ for (var i=0;i<KEYS.length;i++) if (e.classList.contains(KEYS[i][1])) return KEYS[i][0]; return null; };
        var dom=kids.map(kindOf).filter(Boolean);
        var visual=kids.slice().sort(function(a,b){ var A=a.getBoundingClientRect(), B=b.getBoundingClientRect(); return (Math.round(A.top)-Math.round(B.top)) || (A.left-B.left); }).map(kindOf).filter(Boolean);
        var titles=[].slice.call(root.querySelectorAll('.intcc-card .intcc-card-title, .intcc-hero-health-label')).filter(vis)
          .filter(function(h){ return !h.closest('.intv12-qcard'); })
          .map(function(h){ var c=getComputedStyle(h); return [c.fontSize, c.fontWeight, c.letterSpacing, c.color, c.textTransform].join('/'); });
        var scen=root.querySelector('.intv21-scen'), blocks=scen ? [].slice.call(scen.querySelectorAll('.intv22-scn-block')).filter(vis).map(function(b){ var r=b.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; }) : [];
        var hoy=root.querySelector('.intcc-watch');
        return JSON.stringify({ dom: dom, visual: visual, titles: titles, blocks: blocks, hoyN: hoy ? hoy.querySelectorAll('.intv4-story').length : 0,
          scenOn: scen ? scen.getAttribute('data-scen') : null, foot: scen ? !!scen.querySelector('.intv21-foot') : false, tag: scen ? /Hipotético|Hypothetical/.test(scen.textContent) : false });
      })()`));
      // RE-DECIDIDO (V5): Evolución → Hoy → Dependencias.
      const WANT = ['hero', 'radar', 'drivers', 'explore', 'evo', 'today', 'scen'];
      ok(`${T} orden definitivo en el DOM: Hero → Radar → Factores → Explora → Evolución → Hoy → Dependencias`, JSON.stringify(L.dom.filter((k, i, a) => a.indexOf(k) === i)) === JSON.stringify(WANT.filter(k => L.dom.indexOf(k) !== -1)), JSON.stringify(L.dom));
      ok(`${T} el orden visual coincide con el del DOM`, JSON.stringify(L.visual.filter((k, i, a) => a.indexOf(k) === i)) === JSON.stringify(L.dom.filter((k, i, a) => a.indexOf(k) === i)), JSON.stringify({ d: L.dom, v: L.visual }));
      ok(`${T} todos los títulos de sección comparten token (tamaño, peso, tracking, color)`, new Set(L.titles).size === 1, JSON.stringify(Array.from(new Set(L.titles))));
      // RE-DECIDIDO (V5): sin insignia ni nota; los tres resultados siempre visibles —en fila
      // desde 768 px, apilados en móvil— bajo un único control.
      ok(`${T} Dependencias: sin insignia ni nota, tres resultados ${w >= 768 ? 'en fila' : 'apilados'}`, !L.tag && !L.foot && L.blocks.length === 3
        && (w >= 768 ? L.blocks.every(b => Math.abs(b[1] - L.blocks[0][1]) <= 1) : (L.blocks[1][1] > L.blocks[0][1] && L.blocks[2][1] > L.blocks[1][1])), JSON.stringify(L));
      ok(`${T} Hoy publica como mucho tres hechos`, L.hoyN <= 3, String(L.hoyN));
      // V5.1 · cada cotización dice por qué importa (su peso) y la etiqueta lleva el hecho.
      const H51 = JSON.parse(await page.evaluate(`(function(){ var rows=[].slice.call(document.querySelectorAll('.intcc-watch .intv4-story[data-kind="mover"]'));
        var tags=[].slice.call(document.querySelectorAll('.intv21-tag')).filter(function(t){ return t.getBoundingClientRect().width>0 && t.getAttribute('data-dim') === 'movement'; }).map(function(t){ return t.textContent.trim(); });
        return JSON.stringify({ movers: rows.map(function(r){ var w=r.querySelector('.intv51-weight'); return { t: r.querySelector('.intv4-story-head').textContent, w: w ? w.textContent : null }; }),
          drivers: [].slice.call(document.querySelectorAll('.intcc-watch .intv4-story[data-kind="driver"] .intv51-weight')).length, tags: tags }); })()`));
      ok(`${T} Hoy: cada cotización lleva su peso como contexto; la contribución certificada no lo repite`, H51.drivers === 0
        && H51.movers.every(m => /^(La cotización de|.+'s price)/.test(m.t) && (/[1-9][\d.,]*\s?% (de tu cartera financiera|of your financial portfolio)\.$/.test(m.w || '') || /^(Menos del 0,1 %|Less than 0\.1%)/.test(m.w || ''))), JSON.stringify(H51));
      ok(`${T} etiqueta de movimiento: hecho con cifra y periodo, o «principal movimiento» sólo si es contribución certificada`,
        H51.tags.every(t => /^[^:]+: [+−]\d+[.,]\d\s?% · (24 h|última sesión|last session)$/.test(t) || /principal movimiento de tu cartera|portfolio's main move/.test(t)) && !H51.tags.some(t => /^Cotización de|price$/.test(t)), JSON.stringify(H51.tags));
      if (kind === 'real') ok(`${T} cuenta madura: Explora ofrece 3–4 preguntas`, r.qs.length >= 3 && r.qs.length <= 4, JSON.stringify(r.qs));
      if ((w === 1440 || w === 390) && await page.evaluate(`!!document.querySelector('.intv21-evo-plot')`)) {
        // Estabilidad: cambiar métrica/periodo no cambia la altura de Evolución ni mueve Hoy.
        const H = async () => JSON.parse(await page.evaluate(`JSON.stringify({ evo: Math.round(document.querySelector('.intcc-timeline').getBoundingClientRect().height), plot: Math.round(document.querySelector('.intv21-evo-plot').getBoundingClientRect().height), hoy: Math.round(document.querySelector('.intcc-watch') ? document.querySelector('.intcc-watch').getBoundingClientRect().top + scrollY : 0) })`));
        const h0 = await H(); const hs = [];
        for (const m of await page.evaluate(`[].slice.call(document.querySelectorAll('.intv21-evo [data-intv21-evo-metric]')).map(function(b){ return b.getAttribute('data-intv21-evo-metric'); })`)) {
          await clickSettled(page.locator(`.intv21-evo [data-intv21-evo-metric="${m}"]:visible`).first()); await page.waitForTimeout(150);
          for (const wn of await page.evaluate(`[].slice.call(document.querySelectorAll('.intv21-evo [data-intv21-evo-win]')).map(function(b){ return b.getAttribute('data-intv21-evo-win'); })`)) {
            await clickSettled(page.locator(`.intv21-evo [data-intv21-evo-win="${wn}"]:visible`).first()); await page.waitForTimeout(120);
            const h = await H(); h.k = m + '/' + wn; hs.push(h);
            const g = JSON.parse(await page.evaluate(`JSON.stringify({ areas: document.querySelectorAll('.intv21-evo .intv22-area').length, stems: document.querySelectorAll('.intv21-evo .intv21-evo-stem').length, segs: ((document.querySelector('.intv21-evo-line')||{getAttribute:function(){return '';}}).getAttribute('d').match(/M/g)||[]).length, pts: Number(document.querySelector('.intv21-evo').getAttribute('data-points')), gaps: Number(document.querySelector('.intv21-evo').getAttribute('data-gaps')) })`));
            const bars = await page.evaluate(`(function(){ var p=document.querySelector('.intv21-evo-plot'); return p.getAttribute('data-chart') === 'bars' ? p.querySelectorAll('.intv6-head, .intv6-bar').length : -1; })()`);
            // RE-DECIDIDO (V6): estructurales = una barra por observación, sin línea ni relleno.
            ok(`${T} gráfico ${m}/${wn}: ${bars >= 0 ? 'una barra por observación real' : 'un solo relleno, sin tallos, tramos = huecos reales + 1'}`,
              bars >= 0 ? (bars === g.pts && g.areas === 0 && g.segs === 0) : (g.areas === 1 && g.stems === 0 && g.segs === g.gaps + 1), JSON.stringify({ g, bars }));
          }
        }
        ok(`${T} Evolución conserva su altura y Hoy no se mueve al cambiar métrica y periodo`, hs.every(h => (w >= 1024 ? h.evo === h0.evo : Math.abs(h.evo - h0.evo) <= 1) && h.plot === h0.plot && Math.abs(h.hoy - h0.hoy) <= 1), JSON.stringify({ h0, hs }));
        // Etiquetas: cada una navega a su destino, lo selecciona y mueve el foco.
        const tagIds = await page.evaluate(`[].slice.call(document.querySelectorAll('.intv21-tag')).filter(function(t){ return t.getBoundingClientRect().width>0; }).map(function(t){ return t.querySelector('.intv21-tag-go').getAttribute('data-intv21-go'); })`);
        for (const go of tagIds) {
          await page.evaluate(`window.scrollTo(0,0)`); await page.waitForTimeout(80);
          await page.locator(`.intv21-tag-go[data-intv21-go="${go}"]:visible`).first().click(); await page.waitForTimeout(700);
          const nav = JSON.parse(await page.evaluate(`(function(){ var go=${JSON.stringify(go)}, p=go.split(':'); var a=document.activeElement; var card=a && a.closest ? a.closest('.intcc-card') : null;
            var evo=document.querySelector('.intv21-evo'), sc=document.querySelector('.intv21-scen');
            return JSON.stringify({ card: card ? card.className.split(' ').slice(0,3).join('.') : null, y: Math.round(scrollY), evo: evo ? evo.getAttribute('data-metric')+':'+evo.getAttribute('data-win') : null, scen: sc ? sc.getAttribute('data-scen') : null,
              fact: p[0]==='today' ? !!document.querySelector('.intcc-watch [data-fact="'+p.slice(1).join(':')+'"]') : null, flash: !!document.querySelector('.intv3-flash') }); })()`));
          const k = go.split(':');
          const okDest = (k[0] === 'evolution' ? /intcc-timeline/.test(nav.card) && nav.evo === k[1] + ':' + k[2]
            : k[0] === 'scenarios' ? /intv21-scen/.test(nav.card) && nav.scen === k[1]
            : k[0] === 'today' ? /intcc-watch/.test(nav.card) && nav.fact === true : /intcc-drivers/.test(nav.card));
          ok(`${T} etiqueta «${go}» lleva a su destino, lo selecciona y mueve el foco`, okDest && nav.y > 0, JSON.stringify(nav));
        }
      }
      if (w === 390 || w === 1440) {
        // Etiquetas estables: volver y recargar con los mismos hechos.
        const t0 = r.tags.join(',');
        await page.evaluate(`switchTab('home')`); await page.waitForTimeout(300); await page.evaluate(`switchTab('intelligence')`); await page.waitForTimeout(700);
        const t1 = JSON.parse(await page.evaluate(PRES)).tags.join(',');
        ok(`${T} etiquetas idénticas al volver`, t0 === t1, JSON.stringify([t0, t1]));
        // Acordeón de Explora: crece su card y empuja; Radar/Factores no se estiran.
        const acc = await page.evaluate(`(function(){ var q=document.querySelector('.intcc-explore .intcc-x-q[aria-expanded="false"]'); if(!q) return null; var _ans=document.getElementById(q.getAttribute('aria-controls'));
          var rad=document.querySelector('.intv7-radar, .intcc-radar'), drv=document.querySelector('.intcc-drivers');
          var h0=[rad&&rad.getBoundingClientRect().height, drv&&drv.getBoundingClientRect().height]; q.click();
          return new Promise(function(res){ setTimeout(function(){ var h1=[rad&&rad.getBoundingClientRect().height, drv&&drv.getBoundingClientRect().height];
            var a=_ans; res(JSON.stringify({ h0:h0, h1:h1, open: q.getAttribute('aria-expanded'), ah: a ? a.getBoundingClientRect().height : 0 })); }, 450); }); })()`);
        if (acc) { const A = JSON.parse(acc);
          ok(`${T} Explora abierta: la respuesta ocupa sitio y Radar/Factores no cambian de alto`, A.open === 'true' && A.ah > 10 && Math.abs((A.h0[0] || 0) - (A.h1[0] || 0)) < 1 && Math.abs((A.h0[1] || 0) - (A.h1[1] || 0)) < 1, acc);
          if ((kind === 'real' || kind === 'qa14') && lng === 'es') await page.screenshot({ path: join(OUT, `${E}-${kind}-${lng}-${w}-open.png`), fullPage: true }); }
      }
      await ctx.close();
    }
  }
  await browser.close();
}
server.close();
console.log(`\n${pass}/${pass + fails.length}`);
if (fails.length) { console.log('\nRESULT: NO-GO'); process.exit(1); }
console.log('RESULT: GO');
process.exit(0);
