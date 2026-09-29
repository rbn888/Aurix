#!/usr/bin/env node
/**
 * AURIX INTELLIGENCE · LOS CONTROLES, ACCIONADOS DE VERDAD
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE. La sonda de coherencia mide el ESTADO CERRADO: lo que se ve al
 * entrar. Los defectos que quedaban sólo aparecen al TOCAR algo — un panel de
 * Explora que se abre encima del radar, un acuse que parece funcionar y no
 * persiste, una pregunta declinada que reaparece. Medir la pantalla quieta no
 * los ve, y por eso sobrevivieron.
 *
 * QUÉ ACCIONA, en navegador real y en los dos motores:
 *   1 · abre CADA pregunta de Explora, una por una, y mide que el panel se quede
 *       DENTRO del flujo: que ensanche su tarjeta, que empuje lo de abajo, que
 *       no se superponga a nada y que no recorte ni desborde;
 *   2 · recorre «Ver más» → historial → «Entendido» → salir de Intelligence →
 *       volver → RECARGAR, y comprueba que el acuse persiste y que Hero, Hoy y
 *       Qué ha cambiado cuentan lo mismo en cada paso;
 *   3 · responde una pregunta y declina otra, y comprueba que ninguna reaparece.
 *
 * LO QUE NO ES: una sesión autenticada. El sandbox es OTP-only, así que el
 * derecho Premium se monta por la superficie saneada del resolver y la
 * persistencia que se certifica es la LOCAL por propietario — que es la que un
 * navegador puede demostrar. El contraste con la cuenta del founder sigue
 * pendiente y declarado.
 *
 *   node scripts/aurix-intelligence-interaction-probe.mjs
 *   AURIX_INTEL_VP=390x844 node scripts/aurix-intelligence-interaction-probe.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const OUT = join(ROOT, 'docs', 'intelligence-truth');
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
let chromium, webkit;
try { ({ chromium, webkit } = await import(PW)); }
catch (e) { console.error('\n✗ SIN MOTORES — ' + PW + '\nRESULT: NO EJECUTADO (entorno, no candidato)'); process.exit(2); }

let pass = 0; const fails = [];
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); }
  else { fails.push(n + (info ? '  [' + info + ']' : '')); console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };
mkdirSync(OUT, { recursive: true });

const DAY = 864e5;
function fixture(days) {
  const now = Date.now();
  const assets = [
    { id: 'a1', ticker: 'BTC', name: 'Bitcoin',  type: 'crypto', qty: 0.5, price: 60000, assetCurrency: 'USD' },
    { id: 'a2', ticker: 'ETH', name: 'Ethereum', type: 'crypto', qty: 5,   price: 3000,  assetCurrency: 'USD' },
    { id: 'a3', ticker: 'VWCE',name: 'Vanguard FTSE All-World', type: 'etf', qty: 100, price: 120, assetCurrency: 'USD' },
    { id: 'a4', ticker: 'AAPL',name: 'Apple',    type: 'stock',  qty: 20,  price: 200,   assetCurrency: 'USD' },
    { id: 'a5', ticker: 'USD', name: 'Efectivo', type: 'cash',   qty: 2600,price: 1,     assetCurrency: 'USD' },
  ];
  const hist = [], cats = [];
  for (let i = days; i >= 0; i--) {
    const ts = now - i * DAY, ph = (days - i) / days;
    const f = 1 + Math.sin(ph * Math.PI) * -0.09 + ph * 0.004, tot = 64600 * f;
    hist.push({ ts, value: +tot.toFixed(2) });
    cats.push({ ts, total: +tot.toFixed(2), crypto: +(tot * 0.6656).toFixed(2),
      stock: +(tot * 0.0619).toFixed(2), etf: +(tot * 0.1857).toFixed(2), fund: 0,
      metal: 0, real_estate: 0, liquidity: +(tot * 0.0402).toFixed(2), other: 0 });
  }
  return { assets, hist, cats };
}
// LA PERSONA NECESITA IDENTIDAD, NO SÓLO DERECHO. El acuse y las respuestas se
// guardan POR CUENTA (`_aurixIntelWriteOwned` se niega sin owner, y hace bien:
// no se escribe dato de cuenta sin cuenta). Una persona con entitlement premium
// pero sin identidad no existe en producción —Intelligence está tras el gate, y
// quien lo pasa está autenticado—, así que montarla así medía una pantalla que
// nadie ve. Se fija el MISMO identificador que deja una sesión real, que es la
// palanca honesta: no se stubea el acuse, se le da la cuenta que le falta.
const OWNER_A = 'probe-owner-a';
const OWNER_B = 'probe-owner-b';
const persona = (owner) => `(function(){
  var bl=document.getElementById('bootLoader'); if(bl) bl.remove();
  var ar=document.getElementById('appRoot'); if(ar) ar.style.opacity='1';
  var fe=Object.create(null);
  _AURIX_ENT_CANON.forEach(function(k){ fe[k]=(k!=='workspace.catalog_preview'); });
  _aurixEnt={loaded:true,loading:false,error:null,plan:'premium',status:'active',
             source:'default',validUntil:null,features:fe,sources:Object.create(null),fetchedAt:Date.now()};
  try { _aurixActiveUserId = ${JSON.stringify(owner)}; _aurixStampCacheOwner(); } catch(_) {}
  return true; })()`;
const PREMIUM = persona(OWNER_A);

async function boot(page, lng, days) {
  const f = fixture(days);
  await page.addInitScript(`try{
    localStorage.setItem('portfolio_lang', ${JSON.stringify(lng)});
    localStorage.setItem('portfolio_assets', ${JSON.stringify(JSON.stringify(f.assets))});
    localStorage.setItem('portfolio_history', ${JSON.stringify(JSON.stringify(f.hist))});
    localStorage.setItem('category_history', ${JSON.stringify(JSON.stringify(f.cats))});
  }catch(_){}`);
}
async function openIntel(page) {
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(`typeof switchTab === 'function' && typeof _renderIntelligenceCommandCenter === 'function'`, null, { timeout: 60000 });
  await page.waitForTimeout(900);
  await page.evaluate(PREMIUM);
  await page.evaluate(`(function(){ switchTab('intelligence'); return true; })()`);
  await page.waitForTimeout(1300);
}

// ── 1 · CADA PREGUNTA, ABIERTA DE VERDAD ────────────────────────────────────
// Se mide DENTRO DEL FLUJO: que la respuesta esté contenida en su tarjeta, que
// al abrirla la tarjeta CREZCA y el radar BAJE (o no se mueva, si va arriba),
// que no se superponga a ninguna otra sección y que no aparezca scroll lateral.
const geomOf = page => page.evaluate(`(function(){
  var R=function(e){ if(!e) return null; var r=e.getBoundingClientRect();
    return { t:Math.round(r.top+(window.scrollY||0)), l:Math.round(r.left), w:Math.round(r.width),
             h:Math.round(r.height), b:Math.round(r.bottom+(window.scrollY||0)), r:Math.round(r.right) }; };
  var vis=function(e){ if(!e) return false; var b=e.getBoundingClientRect(); var cs=getComputedStyle(e);
    return b.width>0 && b.height>0 && cs.display!=='none' && cs.visibility!=='hidden'; };
  var pick=function(sel){ return [].slice.call(document.querySelectorAll(sel)).filter(vis)[0]||null; };
  var doc=document.documentElement;
  return JSON.stringify({
    explore:R(pick('.intcc-explore')), radar:R(pick('.intv7-radar')),
    drivers:R(pick('.intv5-drivers, .intcc-drivers')), today:R(pick('.intv5-matters, .intv4-brief')),
    changed:R(pick('.intv4-changed')), evolution:R(pick('.intv4-memory, .intv15-evolution')),
    hscroll: doc.scrollWidth > doc.clientWidth + 1,
    docH: doc.scrollHeight,
  });})()`).then(JSON.parse);

const answerGeom = (page, id) => page.evaluate(`(function(){
  var a=document.getElementById('intcc-x-' + ${JSON.stringify(id)});
  var btn=document.querySelector('[data-intcc-q="' + ${JSON.stringify(id)} + '"]');
  var item=btn?btn.closest('.intcc-x-item'):null;
  var card=btn?btn.closest('.intcc-explore'):null;
  if(!a||!card) return JSON.stringify({missing:true});
  var R=function(e){var r=e.getBoundingClientRect();
    return {t:Math.round(r.top+(window.scrollY||0)),l:Math.round(r.left),w:Math.round(r.width),
            h:Math.round(r.height),b:Math.round(r.bottom+(window.scrollY||0)),r:Math.round(r.right)};};
  var cs=getComputedStyle(a); var ab=R(a), cb=R(card);
  // ¿Se sale de su tarjeta? ¿Está en flujo o flotando?
  return JSON.stringify({
    open: a.getBoundingClientRect().height > 0,
    ans: ab, card: cb, item: item?R(item):null,
    position: cs.position, zIndex: cs.zIndex, overflow: cs.overflow,
    insideCard: ab.t >= cb.t - 1 && ab.b <= cb.b + 1 && ab.l >= cb.l - 1 && ab.r <= cb.r + 1,
    clipped: a.scrollHeight > a.clientHeight + 1,
    expanded: a.getAttribute('aria-hidden'),
    btnExpanded: btn ? btn.getAttribute('aria-expanded') : null,
    focus: document.activeElement ? (document.activeElement.getAttribute('data-intcc-q') || document.activeElement.className) : null,
  });})()`).then(JSON.parse);

const VP = process.env.AURIX_INTEL_VP ? process.env.AURIX_INTEL_VP.split('x').map(Number) : [1440, 900];
console.log('AURIX INTELLIGENCE · interacción real — ' + VP.join('×'));
console.log('origen: ' + ORIGIN + '\n');

for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  for (const lng of ['es', 'en']) {
    const browser = await launcher.launch();
    const ctx = await browser.newContext({ viewport: { width: VP[0], height: VP[1] },
      deviceScaleFactor: VP[0] < 700 ? 2 : 1, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await boot(page, lng, 42);
    await openIntel(page);
    const tag = `${ENG}.${VP[0]}×${VP[1]} ${lng.toUpperCase()}`;

    // ════════ 1 · EXPLORA: CADA PREGUNTA, ABIERTA ════════
    const ids = await page.evaluate(`(function(){
      return [].slice.call(document.querySelectorAll('[data-intcc-q]')).map(function(b){
        return b.getAttribute('data-intcc-q'); });})()`);
    ok(`${tag} Explora ofrece preguntas`, ids.length >= 1, JSON.stringify(ids));
    const before = await geomOf(page);
    for (const id of ids) {
      await page.click(`[data-intcc-q="${id}"]`);
      await page.waitForTimeout(420);
      const g = await answerGeom(page, id);
      const after = await geomOf(page);
      ok(`${tag} «${id}» abre`, g.open === true && !g.missing, JSON.stringify(g).slice(0, 160));
      // EN FLUJO, NO FLOTANDO: nada de `absolute`/`fixed` sobre el resto.
      ok(`${tag} «${id}» queda EN FLUJO (no flota sobre el resto)`,
        g.position !== 'absolute' && g.position !== 'fixed',
        JSON.stringify({ position: g.position, z: g.zIndex }));
      ok(`${tag} «${id}» cabe dentro de su tarjeta`, g.insideCard === true,
        JSON.stringify({ ans: g.ans, card: g.card }));
      ok(`${tag} «${id}» no recorta su contenido`, g.clipped === false,
        JSON.stringify({ overflow: g.overflow }));
      // Y NO SE REPITE A SÍ MISMA: ninguna línea puede estar ya contenida en
      // otra anterior de la misma respuesta (dos owners, la misma frase).
      const dup = await page.evaluate(`(function(){
        var a=document.getElementById('intcc-x-' + ${JSON.stringify(id)});
        if(!a) return null;
        var norm=function(t){ return String(t||'').toLowerCase()
          .normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]/g,''); };
        var ps=[].slice.call(a.querySelectorAll('p')).map(function(e){ return norm(e.textContent); })
          .filter(Boolean);
        var bad=[];
        for (var i=0;i<ps.length;i++) for (var j=0;j<i;j++)
          if (ps[j]===ps[i] || ps[j].indexOf(ps[i])!==-1) bad.push(i);
        return JSON.stringify({ n: ps.length, bad: bad });})()`).then(x => x ? JSON.parse(x) : null);
      ok(`${tag} «${id}» no repite una frase que ya había dicho`,
        !dup || dup.bad.length === 0, JSON.stringify(dup));
      // LA TARJETA CRECE Y EMPUJA. En una columna, el radar va DESPUÉS de
      // Explora y tiene que bajar; en la rejilla de escritorio van en la MISMA
      // fila, así que lo que se exige es que no se solapen.
      const sameRow = before.radar && before.explore
        && Math.min(before.radar.b, before.explore.b) - Math.max(before.radar.t, before.explore.t) > 0;
      if (sameRow) {
        ok(`${tag} «${id}» no invade el radar (misma fila)`,
          after.radar && after.explore && (after.explore.r <= after.radar.l + 1 || after.radar.r <= after.explore.l + 1),
          JSON.stringify({ explore: after.explore, radar: after.radar }));
      } else if (before.radar && before.explore && before.radar.t > before.explore.t) {
        ok(`${tag} «${id}» empuja al radar hacia abajo`,
          after.radar.t >= before.radar.t, JSON.stringify({ antes: before.radar.t, ahora: after.radar.t }));
      }
      ok(`${tag} «${id}» no produce scroll horizontal`, after.hscroll === false);
      // EL FOCO NO SALTA. Con RATÓN, WebKit no enfoca un `<button>` al pulsarlo
      // —es la convención de Safari en macOS, no un defecto del producto—, así
      // que lo que se exige es que el foco no se vaya a OTRO control. La prueba
      // de verdad es la del TECLADO, y se hace aparte, más abajo.
      ok(`${tag} «${id}» el foco no salta a otro control`,
        g.focus === id || !g.focus || /intcc-x-q/.test(String(g.focus)),
        String(g.focus));
      // Y NINGUNA SECCIÓN SE SUPERPONE A OTRA tras abrir.
      const boxes = ['explore', 'radar', 'drivers', 'today', 'changed', 'evolution']
        .map(k => [k, after[k]]).filter(x => !!x[1]);
      const overlaps = [];
      for (let i = 0; i < boxes.length - 1; i++) for (let j = i + 1; j < boxes.length; j++) {
        const A = boxes[i][1], B = boxes[j][1];
        const ox = Math.min(A.r, B.r) - Math.max(A.l, B.l);
        const oy = Math.min(A.b, B.b) - Math.max(A.t, B.t);
        if (ox > 2 && oy > 2) overlaps.push(boxes[i][0] + '×' + boxes[j][0]);
      }
      ok(`${tag} «${id}» ninguna sección se superpone a otra`, overlaps.length === 0,
        JSON.stringify(overlaps));
      await page.click(`[data-intcc-q="${id}"]`);
      await page.waitForTimeout(260);
    }
    // ════════ 1b · EL CAMINO DE TECLADO ════════
    // Enfocar con Tab y abrir con Enter: el control tiene que quedarse con el
    // foco y declarar su estado, y la respuesta tiene que ser alcanzable DESPUÉS
    // del botón —no antes, no en otra parte del documento—.
    {
      const kid = ids[0];
      await page.evaluate(`(function(){ document.querySelector('[data-intcc-q="' + ${JSON.stringify(kid)} + '"]').focus(); return true; })()`);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(420);
      const k = await page.evaluate(`(function(){
        var b=document.querySelector('[data-intcc-q="' + ${JSON.stringify(kid)} + '"]');
        var a=document.getElementById('intcc-x-' + ${JSON.stringify(kid)});
        return JSON.stringify({ focused: document.activeElement === b,
          expanded: b.getAttribute('aria-expanded'),
          controls: b.getAttribute('aria-controls'),
          open: a.classList.contains('is-open'),
          h: Math.round(a.getBoundingClientRect().height),
          after: !!(b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING) });})()`).then(JSON.parse);
      ok(`${tag} teclado · Enter abre y el foco SE QUEDA en el control`,
        k.focused === true && k.open === true && k.h > 0, JSON.stringify(k));
      ok(`${tag} teclado · el control declara su estado y a quién gobierna`,
        k.expanded === 'true' && k.controls === 'intcc-x-' + kid && k.after === true,
        JSON.stringify(k));
      await page.keyboard.press('Enter');
      await page.waitForTimeout(380);
      const k2 = await page.evaluate(`(function(){
        var b=document.querySelector('[data-intcc-q="' + ${JSON.stringify(kid)} + '"]');
        var a=document.getElementById('intcc-x-' + ${JSON.stringify(kid)});
        var inn=a.querySelector('.intcc-x-answer-in');
        return JSON.stringify({ expanded: b.getAttribute('aria-expanded'),
          open: a.classList.contains('is-open'),
          hidden: inn ? getComputedStyle(inn).visibility : null });})()`).then(JSON.parse);
      ok(`${tag} teclado · Enter cierra, y cerrada NO es navegable`,
        k2.open === false && k2.expanded === 'false' && k2.hidden === 'hidden',
        JSON.stringify(k2));
    }
    await page.click(`[data-intcc-q="${ids[0]}"]`).catch(() => {});
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT, `inter-explore-${lng}-${VP[0]}x${VP[1]}-${ENG}.png`), fullPage: true });

    // ════════ 2 · «VER MÁS» → «ENTENDIDO» → NAVEGAR → VOLVER → RECARGAR ════════
    // El recorrido completo, con sus tres verificaciones de coherencia en cada
    // parada: Hero, «Hoy» y «Qué ha cambiado» tienen que contar LO MISMO.
    const state = () => page.evaluate(`(function(){
      var q=function(s){ var e=document.querySelector(s); return e?(e.textContent||'').replace(/\\s+/g,' ').trim():null; };
      var see=[].slice.call(document.querySelectorAll('[data-intel-see-changes]')).filter(function(e){
        var r=e.getBoundingClientRect(); return r.width>0 && r.height>0; })[0] || null;
      var vis=function(e){ var r=e.getBoundingClientRect(); var cs=getComputedStyle(e);
        return r.width>0 && r.height>0 && cs.display!=='none' && cs.visibility!=='hidden'; };
      var acks=[].slice.call(document.querySelectorAll('[data-intel-ack]')).filter(vis);
      var done=[].slice.call(document.querySelectorAll('[data-intel-reviewed="1"]')).filter(vis);
      var rows=[].slice.call(document.querySelectorAll('[data-reviewed]')).filter(vis);
      return JSON.stringify({
        heroSub: q('.intcc-hero-sub, .intv4-hero-sub, .intcc-m-hero-sub'),
        seeCount: see ? Number(see.getAttribute('data-count')) : null,
        seeText: see ? (see.textContent||'').trim() : null,
        pendingAcks: acks.length, reviewedMarks: done.length,
        changedRows: rows.length,
        reviewedRows: rows.filter(function(r){ return r.getAttribute('data-reviewed')==='1'; }).length,
        todayEmpty: q('.intv5-matters .intcc-empty-body, .intv4-brief .intcc-empty-body'),
        todayKey: (document.querySelector('.intv5-matters, .intv4-brief')||{}).getAttribute
          ? (document.querySelector('.intv5-matters, .intv4-brief')||{}).getAttribute('data-empty-state') : null,
      });})()`).then(JSON.parse);

    const s0 = await state();
    const coherent = (st, where) => {
      // Si el hero anuncia pendientes, «Hoy» no puede negarlos y tiene que haber
      // tantos acuses pendientes como cuenta el hero.
      const claims = Number(st.seeCount || 0);
      const denies = /no hay ning[úu]n cambio|nothing in your wealth worth/i.test(st.todayEmpty || '');
      ok(`${tag} ${where} · hero y «Hoy» coherentes`, !(claims > 0 && denies),
        JSON.stringify({ seeCount: st.seeCount, hoy: (st.todayEmpty || '').slice(0, 60) }));
      ok(`${tag} ${where} · el recuento del hero = acuses pendientes abajo`,
        claims === st.pendingAcks, JSON.stringify({ hero: claims, pendientes: st.pendingAcks }));
    };
    ok(`${tag} hay al menos un cambio que acusar`, (s0.pendingAcks || 0) >= 1, JSON.stringify(s0));
    coherent(s0, 'inicio');

    if ((s0.pendingAcks || 0) >= 1) {
      // «Ver más» — es un ENLACE al historial y NO puede acusar nada.
      ok(`${tag} «Ver más» existe y declara su recuento`,
        s0.seeCount !== null && s0.seeCount >= 1, JSON.stringify({ see: s0.seeText, n: s0.seeCount }));
      await page.locator('[data-intel-see-changes]:visible').first().click();
      await page.waitForTimeout(500);
      const sNav = await state();
      ok(`${tag} navegar al historial NO acusa nada`,
        sNav.pendingAcks === s0.pendingAcks,
        JSON.stringify({ antes: s0.pendingAcks, despues: sNav.pendingAcks }));

      // «Entendido»
      const ackId = await page.evaluate(`(function(){
        var vis=[].slice.call(document.querySelectorAll('[data-intel-ack]')).filter(function(e){
          var r=e.getBoundingClientRect(); return r.width>0 && r.height>0; });
        return vis[0]?vis[0].getAttribute('data-intel-ack'):null; })()`);
      await page.locator('[data-intel-ack]:visible').first().click();
      await page.waitForTimeout(900);
      const s1 = await state();
      ok(`${tag} «Entendido» reduce los pendientes`,
        s1.pendingAcks === s0.pendingAcks - 1,
        JSON.stringify({ antes: s0.pendingAcks, despues: s1.pendingAcks, id: ackId }));
      ok(`${tag} …y el hecho SIGUE en el historial, marcado como revisado`,
        s1.changedRows >= s0.changedRows && s1.reviewedRows >= 1,
        JSON.stringify({ antes: { filas: s0.changedRows, rev: s0.reviewedRows },
                         despues: { filas: s1.changedRows, rev: s1.reviewedRows } }));
      coherent(s1, 'tras acusar');

      // NAVEGAR FUERA Y VOLVER
      await page.evaluate(`(function(){ switchTab('home'); return true; })()`);
      await page.waitForTimeout(700);
      await page.evaluate(`(function(){ switchTab('intelligence'); return true; })()`);
      await page.waitForTimeout(1200);
      const s2 = await state();
      ok(`${tag} el acuse SOBREVIVE a salir y volver`,
        s2.pendingAcks === s1.pendingAcks && s2.reviewedRows >= 1,
        JSON.stringify({ tras: s1.pendingAcks, vuelta: s2.pendingAcks, rev: s2.reviewedRows }));
      coherent(s2, 'tras volver');

      // RECARGAR
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(`typeof switchTab === 'function' && typeof _renderIntelligenceCommandCenter === 'function'`, null, { timeout: 60000 });
      await page.waitForTimeout(900);
      await page.evaluate(PREMIUM);
      await page.evaluate(`(function(){ switchTab('intelligence'); return true; })()`);
      await page.waitForTimeout(1300);
      const s3 = await state();
      ok(`${tag} el acuse SOBREVIVE a la recarga`,
        s3.pendingAcks === s1.pendingAcks && s3.reviewedRows >= 1,
        JSON.stringify({ tras: s1.pendingAcks, recarga: s3.pendingAcks, rev: s3.reviewedRows }));
      coherent(s3, 'tras recargar');
      await page.screenshot({ path: join(OUT, `inter-ack-${lng}-${VP[0]}x${VP[1]}-${ENG}.png`), fullPage: true });
    }

    // ════════ 2b · SI EL ACUSE NO SE PUEDE GUARDAR, EL BOTÓN LO DICE ════════
    // «No dejes un botón que parece responder y no cambia nada». El control se
    // marca revisado en el acto para que la acción no parezca perdida; si la
    // escritura falla eso sería una MENTIRA, así que tiene que revertirse y
    // avisar. Se fuerza el fallo por la única vía real: sin cuenta no se escribe
    // dato de cuenta (`_aurixIntelWriteOwned` se niega, y hace bien).
    {
      await page.evaluate(`(function(){ _aurixActiveUserId = null;
        try { localStorage.removeItem(_AURIX_CACHE_OWNER_KEY); } catch(_) {}
        var ph=document.getElementById('tabPlaceholder')||document.querySelector('.tab-placeholder--intel');
        if (ph) { ph.innerHTML = renderIntelligenceTab();
          if (typeof _initIntelligenceCommandCenter === 'function') _initIntelligenceCommandCenter(); }
        return true; })()`);
      await page.waitForTimeout(700);
      const hasAck = await page.evaluate(`(function(){ return !!document.querySelector('[data-intel-ack]'); })()`);
      if (hasAck) {
        await page.locator('[data-intel-ack]:visible').first().click();
        await page.waitForTimeout(700);
        const fail = await page.evaluate(`(function(){
          var b=document.querySelector('[data-intel-ack]');
          return JSON.stringify({ reverted: !!(b && !b.classList.contains('is-done')
            && b.getAttribute('aria-disabled') !== 'true'),
            flagged: !!(b && b.getAttribute('data-ack-failed') === '1'),
            warned: !!document.querySelector('.intv12-ack-error') });})()`).then(JSON.parse);
        ok(`${tag} un acuse que NO se puede guardar revierte y lo dice`,
          fail.reverted && fail.flagged && fail.warned, JSON.stringify(fail));
      }
      // Se restituye la cuenta para lo que viene.
      await page.evaluate(PREMIUM);
      await page.evaluate(`(function(){ switchTab('intelligence'); return true; })()`);
      await page.waitForTimeout(1200);
    }

    // ════════ 3 · PREGUNTA RESPONDIDA Y DECLINADA, SIN REAPARICIÓN ════════
    const qOf = () => page.evaluate(`(function(){
      var c=document.querySelector('.intv12-qcard');
      var opts=[].slice.call(document.querySelectorAll('[data-intel-answer]'));
      return JSON.stringify({ present: !!c,
        text: c?(c.textContent||'').replace(/\\s+/g,' ').trim().slice(0,90):null,
        opts: opts.map(function(o){ return o.getAttribute('data-intel-answer'); }) });})()`).then(JSON.parse);
    let q0 = await qOf();
    if (q0.present && q0.opts.length) {
      const first = q0.opts.find(o => o !== '__decline') || q0.opts[0];
      await page.click(`[data-intel-answer="${first}"]`);
      await page.waitForTimeout(1100);
      const q1 = await qOf();
      ok(`${tag} una pregunta RESPONDIDA no se vuelve a plantear igual`,
        !q1.present || q1.text !== q0.text, JSON.stringify({ antes: q0.text, ahora: q1.text }));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(`typeof switchTab === 'function'`, null, { timeout: 60000 });
      await page.waitForTimeout(900);
      await page.evaluate(PREMIUM);
      await page.evaluate(`(function(){ switchTab('intelligence'); return true; })()`);
      await page.waitForTimeout(1300);
      const q2 = await qOf();
      ok(`${tag} …tampoco tras recargar`,
        !q2.present || q2.text !== q0.text, JSON.stringify({ original: q0.text, recarga: q2.text }));
      // Y «Prefiero no responder» sobre la que quede.
      const q3 = await qOf();
      if (q3.present && q3.opts.indexOf('__decline') !== -1) {
        const before = q3.text;
        await page.click('[data-intel-answer="__decline"]');
        await page.waitForTimeout(1100);
        const q4 = await qOf();
        ok(`${tag} «Prefiero no responder» retira la pregunta`,
          !q4.present || q4.text !== before, JSON.stringify({ antes: before, ahora: q4.text }));
      }
    } else {
      console.log(`  · ${tag} sin pregunta abierta en esta pasada (no se fuerza)`);
    }
    await ctx.close();
    await browser.close();
  }
}
server.close();
console.log('\n════════════════════════════════════════════════');
console.log(pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { console.log('\nFAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); console.log('\nRESULT: NO-GO'); process.exit(1); }
console.log('\nRESULT: GO — capturas en docs/intelligence-truth/');
process.exit(0);
