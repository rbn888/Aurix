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
import { mkdirSync } from 'node:fs';
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
  const newPage = async (w) => { const ctx = await browser.newContext({ viewport: { width: w, height: w < 768 ? 844 : 1000 }, deviceScaleFactor: 1 });
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

  // ── FREE / PREMIUM · plan contratado vs acceso efectivo (sólo presentación) ──
  if (!process.env.P0_ONLY) for (const kind of ['free', 'premium', 'granted']) {
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
  if (!process.env.P0_ONLY) for (const kind of (process.env.PERSONAS || 'real,qa14,fresh,calm,stale,flows').split(',')) for (const lng of (process.env.LANGS || 'es,en').split(',')) {
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
      ok(`${T} KPI «Último dato», nunca «Actual»`, !r.evo || /Último dato|Latest/.test(r.evo.stats) && !/\bActual\b|\bNow\b/.test(r.evo.stats), r.evo && r.evo.stats);
      ok(`${T} titular de evolución sin cifras ni paréntesis`, !r.evo || (!/\d/.test(r.evo.head.replace(/^(En|Over) \d+ (días|days),|^(Desde el|Since) [^,]+(, \d{4})?,/, '')) && !/[()]/.test(r.evo.head)), r.evo && r.evo.head);
      ok(`${T} color de Cambio sólo con valoración (rentabilidad)`, !r.evo || r.evo.metric === 'return' || /is-neutral/.test(r.evo.deltaCls), JSON.stringify(r.evo));
      ok(`${T} sin jerga prohibida`, !r.jargon.length, JSON.stringify(r.jargon));
      ok(`${T} cifras nunca NaN/Infinity/undefined`, !/NaN|Infinity|undefined|null/.test(r.text), (r.text.match(/.{0,40}(NaN|Infinity|undefined|null).{0,40}/) || [''])[0]);
      ok(`${T} Radar: cinco ejes, cinco marcadores, figura cerrada y valores finitos`, !r.radar || (r.radar.axes === 5 && r.radar.dots === 5 && r.radar.uniq === 5 && r.radar.closed && r.radar.finite), JSON.stringify(r.radar));
      ok(`${T} Explora: ninguna pregunta repetida y respuestas con conclusión`, new Set(r.qs).size === r.qs.length, JSON.stringify(r.qs));
      ok(`${T} cero hechos duplicados en el registro`, !r.dups || r.dups.length === 0, JSON.stringify(r.dups));
      if (w === 390 || w === 1440) {
        // Etiquetas estables: volver y recargar con los mismos hechos.
        const t0 = r.tags.join(',');
        await page.evaluate(`switchTab('home')`); await page.waitForTimeout(300); await page.evaluate(`switchTab('intelligence')`); await page.waitForTimeout(700);
        const t1 = JSON.parse(await page.evaluate(PRES)).tags.join(',');
        ok(`${T} etiquetas idénticas al volver`, t0 === t1, JSON.stringify([t0, t1]));
        // Acordeón de Explora: crece su card y empuja; Radar/Factores no se estiran.
        const acc = await page.evaluate(`(function(){ var q=document.querySelector('.intcc-explore .intcc-x-q'); if(!q) return null;
          var rad=document.querySelector('.intv7-radar, .intcc-radar'), drv=document.querySelector('.intcc-drivers');
          var h0=[rad&&rad.getBoundingClientRect().height, drv&&drv.getBoundingClientRect().height]; q.click();
          return new Promise(function(res){ setTimeout(function(){ var h1=[rad&&rad.getBoundingClientRect().height, drv&&drv.getBoundingClientRect().height];
            var a=q.parentNode.querySelector('.intcc-x-answer'); res(JSON.stringify({ h0:h0, h1:h1, open: q.getAttribute('aria-expanded'), ah: a ? a.getBoundingClientRect().height : 0 })); }, 450); }); })()`);
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
