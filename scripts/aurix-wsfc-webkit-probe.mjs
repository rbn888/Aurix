#!/usr/bin/env node
/**
 * AURIX · PORTADA FREE DE WORKSPACE — LA MISMA GEOMETRÍA, EN WEBKIT
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE, y por qué es un fichero aparte y no una bandera de la sonda
 * grande: el P0 de la portada fue un reparto de altura de FLEXBOX, y un reparto
 * de flex lo decide el MOTOR. Certificarlo sólo en Blink deja fuera al navegador
 * en el que el founder mira la app. Aquí se ejecutan las mismas preguntas de
 * geometría —caja contra contenido, e intersección entre vecinos— sobre WebKit.
 *
 * LO QUE ESTO **NO** ES, y conviene decirlo antes de que nadie lo lea como más de
 * lo que vale: WebKit de escritorio NO es Safari de iPhone. Comparte el motor de
 * layout, que es lo que se está certificando, pero no la barra de URL dinámica ni
 * el `env(safe-area-inset-bottom)` real de un dispositivo con notch. `100dvh` y
 * las áreas seguras siguen necesitando el teléfono del founder: esta sonda cubre
 * el reparto de altura, no el cromo del sistema.
 *
 *   node scripts/aurix-wsfc-webkit-probe.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const OUT = join(ROOT, 'docs', 'p0-free-boundary', 'shots-webkit');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };

// Mismo servidor y mismo ÚNICO parche que la sonda de Chrome: la navegación de
// auth. El resto del bundle es el candidato tal cual.
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const abs = normalize(join(ROOT, p)); if (!abs.startsWith(ROOT)) return res.writeHead(403).end();
    let body = await readFile(abs);
    if (abs.endsWith('app.js')) body = Buffer.from(String(body)
      .replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')
      .replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0'));
    res.writeHead(200, { 'content-type': MIME[extname(abs)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch (_) { res.writeHead(404).end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

// Playwright NO es dependencia del proyecto y no debe serlo por una sonda: el
// deployment de Vercel es Hobby y el repo se publica con allowlist. Se resuelve
// desde una instalación externa (`AURIX_PW=/ruta/a/node_modules/playwright`), y
// si no está, la sonda lo DICE en vez de fingir que no había nada que medir.
const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
let webkit;
try { ({ webkit } = await import(PW)); }
catch (e) {
  console.error('\n✗ SIN MOTOR WEBKIT — ' + PW);
  console.error('  instalar fuera del repo:  mkdir -p /tmp/aurix-pw && cd /tmp/aurix-pw \\');
  console.error('                            && npm init -y && npm i playwright && npx playwright install webkit');
  console.error('\nRESULT: NO EJECUTADO (entorno, no candidato)');
  process.exit(2);
}
const browser = await webkit.launch();
let pass = 0; const fails = [];
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n + (info ? '  [' + info + ']' : '')); } else { fails.push(n + (info ? '  [' + info + ']' : '')); console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };

console.log('AURIX · PORTADA FREE DE WORKSPACE — WebKit');
console.log('origen: ' + ORIGIN + '  (copia de trabajo)\n');
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [[360, 740], [390, 844], [430, 932], [768, 1024], [1366, 768], [1440, 900]];
for (const [w, h] of VIEWPORTS) {
  for (const L of ['es', 'en']) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 700 ? 2 : 1, isMobile: false, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(`typeof renderWorkspaceHome === 'function' && typeof switchTab === 'function'`, null, { timeout: 60000 });
    await page.waitForTimeout(800);
    await page.evaluate(`(function(){
      var bl = document.getElementById('bootLoader'); if (bl) bl.remove();
      var ar = document.getElementById('appRoot'); if (ar) ar.style.opacity = '1';
      document.getElementById('aurixWorkspace').style.display = 'block';
      return true;
    })()`);
    // ASIGNACIÓN DESNUDA, Y NO `window.algo = …`. `lang`, `_aurixEnt` y `_wshView`
    // se declaran con `let` en el ámbito global del script: viven en el ámbito
    // LÉXICO global, que no es `window`. Escribir `window.lang` crea una
    // propiedad nueva que la app no lee nunca — la primera versión de esta sonda
    // lo hizo y la portada no llegó a montarse (`cta` era null).
    await page.evaluate(`(function(){
      lang = ${JSON.stringify(L)};
      _aurixEnt = {loaded:true,loading:false,error:null,plan:'free',status:'none',source:'default',validUntil:null,features:Object.create(null),sources:Object.create(null),fetchedAt:Date.now()};
      _wshView = 'free_cover';
      switchTab('workspace');
      return true;
    })()`);
    await page.waitForTimeout(700);
    // ENTRADA: el CTA entero sin que el usuario haga nada.
    const e0 = await page.evaluate(`(function(){
      var root=document.getElementById('aurixWorkspace');
      var R=function(e){if(!e)return null;var b=e.getBoundingClientRect();
        return {t:+b.top.toFixed(1),b:+b.bottom.toFixed(1),h:+b.height.toFixed(1)};};
      var stage=root.querySelector('.wsfc-stage');
      var cta=R(root.querySelector('.wsfc-cta')), wrap=R(root.querySelector('.wsfc-cta-wrap')), sr=R(stage);
      var navEl=document.getElementById('bottomNav');
      var navVis=!!navEl && getComputedStyle(navEl).display!=='none' && navEl.getBoundingClientRect().height>0;
      var nav=navVis?R(navEl):null;
      return {ctaH:cta?cta.h:0, scrollTop:stage.scrollTop,
        ctaWhole: !!cta && cta.t>=sr.t-0.5 && cta.b<=sr.b+0.5,
        ctaAboveNav: (nav&&cta) ? cta.b<=nav.t+0.5 : !!cta,
        wrapAboveNav: (nav&&wrap) ? wrap.b<=nav.t+0.5 : !!wrap};
    })()`);
    // al final del recorrido, que es donde se comprueba que nada quede inalcanzable
    await page.evaluate(() => {
      const st = document.querySelector('#aurixWorkspace .wsfc-stage');
      if (st) st.scrollTop = st.scrollHeight;
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await page.waitForTimeout(250);
    const g = await page.evaluate(() => {
      const root = document.getElementById('aurixWorkspace');
      const q = s => root.querySelector(s), qa = s => [...root.querySelectorAll(s)];
      const R = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { t: +b.top.toFixed(1), b: +b.bottom.toFixed(1), l: +b.left.toFixed(1), r: +b.right.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
      const hit = (a, b) => !!a && !!b && !(a.b <= b.t + 0.5 || b.b <= a.t + 0.5 || a.r <= b.l + 0.5 || b.r <= a.l + 0.5);
      const ins = (c, p) => !!c && !!p && c.t >= p.t - 0.5 && c.b <= p.b + 0.5 && c.l >= p.l - 0.5 && c.r <= p.r + 0.5;
      const stage = q('.wsfc-stage'), items = q('.wsfc-items'), capsUl = q('.wsfc-caps');
      const cards = qa('.wsfc-item').map(R), shots = qa('.wsfc-item-shot').map(R);
      const names = qa('.wsfc-item-name').map(R), descs = qa('.wsfc-item-desc').map(R), opens = qa('.wsfc-item-open').map(R);
      const caps = qa('.wsfc-cap').map(R), disc = R(q('.wsfc-disc-label')), cta = R(q('.wsfc-cta'));
      const navEl = document.getElementById('bottomNav');
      const navVis = !!navEl && getComputedStyle(navEl).display !== 'none' && navEl.getBoundingClientRect().height > 0;
      const nav = navVis ? R(navEl) : null;
      const textEls = qa('.wsfc-title,.wsfc-sub,.wsfc-item-name,.wsfc-item-desc,.wsfc-item-open,.wsfc-cap-name,.wsfc-cta');
      return {
        cards: cards.length,
        imgInCard: shots.map((s, i) => ins(s, cards[i])),
        partsInCard: names.map((x, i) => ins(x, cards[i]) && ins(descs[i], cards[i]) && ins(opens[i], cards[i])),
        cardsHit: cards.length === 2 ? hit(cards[0], cards[1]) : true,
        sideBySide: cards.length === 2 ? Math.abs(cards[0].t - cards[1].t) <= 1 : false,
        gapY: cards.length === 2 ? +(cards[1].t - cards[0].b).toFixed(1) : null,
        discAfterCards: !!disc && cards.length === 2 && disc.t >= cards[1].b - 0.5,
        capsAllVisible: caps.every(c => { const sr = R(stage); return c.t >= sr.t - 0.5 && c.b <= sr.b + 0.5; }),
        capsHitCta: caps.some(c => hit(c, cta)),
        capsUnderNav: nav ? caps.some(c => c.b > nav.t + 0.5) : false,
        ctaHitAny: !cta ? true : [...cards, ...caps, disc].some(x => hit(R(q('.wsfc-cta-wrap')), x)),
        ctaReachable: !!cta && cta.b <= window.innerHeight + 0.5 && cta.t >= 0,
        ctaAboveNav: (nav && cta) ? cta.b <= nav.t + 0.5 : !!cta,
        ctaH: cta ? cta.h : 0,
        itemsFits: items.scrollHeight <= items.clientHeight + 1,
        capsFits: capsUl.scrollHeight <= capsUl.clientHeight + 1,
        itemsBox: items.clientHeight, itemsContent: items.scrollHeight,
        capsBox: capsUl.clientHeight, capsContent: capsUl.scrollHeight,
        docOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
        stageOverflowX: stage.scrollWidth > stage.clientWidth + 1,
        clipped: textEls.filter(e => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).length,
      };
    });
    const tag = `${w}×${h} ${L.toUpperCase()}`;
    if (!g || g.cards !== 2) { ok(`WK.${tag} la portada Free monta con sus dos tarjetas`, false, JSON.stringify(g && g.cards)); await ctx.close(); continue; }
    const all = a => Array.isArray(a) && a.length === 2 && a.every(Boolean);
    ok(`WK.${tag} imagen, título, descripción y «Abrir» dentro de su tarjeta`,
      g.cards === 2 && all(g.imgInCard) && all(g.partsInCard), JSON.stringify({ img: g.imgInCard, partes: g.partsInCard }));
    ok(`WK.${tag} las dos tarjetas no se tocan${w < 560 ? ' y van apiladas' : ''}`,
      g.cardsHit === false && (w < 560 ? (g.sideBySide === false && g.gapY > 0) : true),
      JSON.stringify({ solape: g.cardsHit, paralelo: g.sideBySide, sepY: g.gapY }));
    ok(`WK.${tag} el encabezado empieza tras la 2ª tarjeta y nada queda bajo el CTA ni la navegación`,
      g.discAfterCards === true && g.capsHitCta === false && g.capsUnderNav === false && g.ctaHitAny === false,
      JSON.stringify({ tras: g.discAfterCards, capsCta: g.capsHitCta, capsNav: g.capsUnderNav, ctaAlgo: g.ctaHitAny }));
    ok(`WK.${tag} al ENTRAR el CTA se ve entero y por encima de la navegación`,
      e0.ctaWhole && e0.ctaAboveNav && e0.wrapAboveNav && e0.ctaH >= 52 && e0.scrollTop === 0, JSON.stringify(e0));
    ok(`WK.${tag} al final del recorrido el CTA sigue entero y ninguna capacidad queda inalcanzable`,
      g.ctaReachable && g.ctaAboveNav && g.ctaH >= 44 && g.capsAllVisible === true,
      JSON.stringify({ alcanzable: g.ctaReachable, sobreNav: g.ctaAboveNav, alto: g.ctaH, capsVisibles: g.capsAllVisible }));
    ok(`WK.${tag} ninguna rejilla se pinta fuera de su caja`,
      g.itemsFits && g.capsFits, JSON.stringify({ tarjetas: g.itemsBox + '←' + g.itemsContent, capacidades: g.capsBox + '←' + g.capsContent }));
    ok(`WK.${tag} cero overflow horizontal y cero texto recortado`,
      !g.docOverflowX && !g.stageOverflowX && g.clipped === 0, JSON.stringify({ doc: g.docOverflowX, stage: g.stageOverflowX, recortado: g.clipped }));
    await page.screenshot({ path: join(OUT, `wsfc-wk-${w}x${h}-${L}-fin.png`) });
    await page.evaluate(() => { const st = document.querySelector('#aurixWorkspace .wsfc-stage'); if (st) st.scrollTop = 0; window.scrollTo(0, 0); });
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(OUT, `wsfc-wk-${w}x${h}-${L}-inicio.png`) });
    await ctx.close();
  }
}
await browser.close();
console.log('\n════════════════════════════════════════════════');
console.log(pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { console.log('\nFAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); console.log('\nRESULT: NO-GO'); process.exit(1); }
console.log('\nRESULT: GO — capturas en docs/p0-free-boundary/shots-webkit/');
process.exit(0);
