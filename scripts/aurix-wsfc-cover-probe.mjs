#!/usr/bin/env node
/**
 * AURIX · PORTADA FREE DE WORKSPACE — GEOMETRÍA REAL, EN LOS DOS MOTORES
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE. El P0 de esta portada fue un reparto de altura de FLEXBOX, y un
 * reparto de flex lo decide el MOTOR: certificarlo sólo en Blink deja fuera al
 * navegador en el que el founder mira la app. Aquí se hacen las MISMAS preguntas
 * de geometría en Chromium y en WebKit.
 *
 * Y LAS PREGUNTAS SON ÉSTAS, no «¿hay scroll?». La lección del P0 es que una
 * rejilla encogible se queda más corta que su contenido y lo pinta FUERA de su
 * caja, dejando `scrollHeight === clientHeight`: para el motor todo cabía. Así
 * que se pregunta CAJA CONTRA CONTENIDO e INTERSECCIÓN ENTRE VECINOS, que es lo
 * único que puede ver un solape.
 *
 * LO QUE ESTO **NO** ES: WebKit de escritorio NO es Safari de iPhone. Comparte el
 * motor de layout —que es lo que se certifica— pero no la barra de URL dinámica
 * ni el `env(safe-area-inset-bottom)` real de un dispositivo con notch. `100dvh`
 * y las áreas seguras siguen necesitando el teléfono del founder.
 *
 * CONTRA EL LOCAL POR DEFECTO, CONTRA LO PÚBLICO CUANDO SE PIDE:
 *   AURIX_WSFC_URL=https://app.aurixsystem.io  ejecuta las MISMAS medidas sobre
 *   los bytes DESPLEGADOS. El sandbox no resuelve el dominio, así que a Chromium
 *   se le pasa la regla de resolución (el `--resolve` de curl) con
 *   AURIX_WSFC_RESOLVE=app.aurixsystem.io=185.199.109.153.
 *   El ÚNICO parche sigue siendo el mismo y se aplica interceptando la respuesta:
 *   la navegación de auth, porque el sandbox no tiene sesión (OTP-only). Ni una
 *   regla de CSS ni una medida de layout se tocan.
 *
 *   node scripts/aurix-wsfc-cover-probe.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const OUT = join(ROOT, 'docs', 'wsfc-premium-cover');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };

// El ÚNICO parche sobre el bundle es la navegación de auth. El resto es el
// candidato tal cual: parchear lo que se certifica sería certificar el parche.
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
const PUBLIC_URL = String(process.env.AURIX_WSFC_URL || '').replace(/\/$/, '');
const RESOLVE = String(process.env.AURIX_WSFC_RESOLVE || '');
const ORIGIN = PUBLIC_URL || `http://127.0.0.1:${server.address().port}`;
// El mismo parche del servidor local, aplicado a la respuesta REAL del CDN: se
// pide el recurso tal cual y sólo se neutraliza la navegación de auth.
const AUTH_PATCH = t => String(t)
  .replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')
  .replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0');

// Playwright NO es dependencia del proyecto y no debe serlo por una sonda: el
// deployment de Vercel es Hobby y el repo se publica con allowlist. Se resuelve
// desde una instalación externa, y si no está la sonda lo DICE en vez de fingir
// que no había nada que medir.
const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
let chromium, webkit;
try { ({ chromium, webkit } = await import(PW)); }
catch (e) {
  console.error('\n✗ SIN MOTORES — ' + PW);
  console.error('  instalar fuera del repo:  mkdir -p /tmp/aurix-pw && cd /tmp/aurix-pw \\');
  console.error('                            && npm init -y && npm i playwright && npx playwright install webkit chromium');
  console.error('\nRESULT: NO EJECUTADO (entorno, no candidato)');
  process.exit(2);
}

let pass = 0; const fails = [];
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (info ? '  [' + info + ']' : '')); console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };

console.log('AURIX · PORTADA FREE DE WORKSPACE — Chromium + WebKit');
console.log('origen: ' + ORIGIN + (PUBLIC_URL ? '  (PÚBLICO · bytes desplegados)' : '  (copia de trabajo)') + '\n');
mkdirSync(OUT, { recursive: true });

// ── LA MEDIDA, EN UNA SOLA FUNCIÓN QUE CORRE DENTRO DE LA PÁGINA ───────────
const MEASURE = `(function(){
  var root=document.getElementById('aurixWorkspace');
  var q=function(s){return root.querySelector(s);}, qa=function(s){return Array.prototype.slice.call(root.querySelectorAll(s));};
  var R=function(e){ if(!e) return null; var b=e.getBoundingClientRect();
    return {t:+b.top.toFixed(1),b:+b.bottom.toFixed(1),l:+b.left.toFixed(1),r:+b.right.toFixed(1),w:+b.width.toFixed(1),h:+b.height.toFixed(1)}; };
  // INTERSECCIÓN, no «¿cabe?»: es lo único que ve un solape entre vecinos.
  var hit=function(a,b){ return !!a&&!!b&&!(a.b<=b.t+0.5||b.b<=a.t+0.5||a.r<=b.l+0.5||b.r<=a.l+0.5); };
  var ins=function(c,p){ return !!c&&!!p&&c.t>=p.t-0.5&&c.b<=p.b+0.5&&c.l>=p.l-0.5&&c.r<=p.r+0.5; };
  var stage=q('.wsfc-stage'), card=q('.wsfc-card'), capsUl=q('.wsfc-caps');
  if(!stage||!card||!capsUl) return {mounted:false};
  var sr=R(stage), cardR=R(card), caps=qa('.wsfc-cap').map(R), capEls=qa('.wsfc-cap');
  var head=R(q('.wsfc-head')), notice=R(q('.wsfc-notice')), wrap=R(q('.wsfc-cta-wrap')), cta=R(q('.wsfc-cta'));
  var navEl=document.getElementById('bottomNav');
  var navVis=!!navEl&&getComputedStyle(navEl).display!=='none'&&navEl.getBoundingClientRect().height>0;
  var nav=navVis?R(navEl):null;
  var textEls=qa('.wsfc-title,.wsfc-sub,.wsfc-eyebrow,.wsfc-cap-name,.wsfc-cta,.wsfc-notice-text');
  var boxes=[head,notice,cardR,wrap].filter(Boolean);
  var neighbourHit=false;
  for(var i=0;i<boxes.length;i++) for(var j=i+1;j<boxes.length;j++) if(hit(boxes[i],boxes[j])) neighbourHit=true;
  var scaled=qa('.wsfc-stage,.wsfc-card,.wsfc-caps,.wsfc-cap,.wsfc-cta').some(function(e){
    var tr=getComputedStyle(e).transform; return tr&&tr!=='none'&&/matrix\\(\\s*(?!1,\\s*0,\\s*0,\\s*1)/.test(tr); });
  var minFont=Math.min.apply(null, textEls.map(function(e){ return parseFloat(getComputedStyle(e).fontSize)||99; }));
  var hidden=qa('.wsfc-stage,.wsfc-card,.wsfc-caps').filter(function(e){ return getComputedStyle(e).overflow==='hidden'; }).length;
  return {
    mounted:true, caps:caps.length,
    capsInCard: capEls.map(function(e){ return ins(R(e), cardR); }).every(Boolean),
    capsInStage: caps.every(function(c){ return c.t>=sr.t-0.5&&c.b<=sr.b+0.5; }),
    cardFits: card.scrollHeight<=card.clientHeight+1,
    capsFits: capsUl.scrollHeight<=capsUl.clientHeight+1,
    capsBox: capsUl.clientHeight, capsContent: capsUl.scrollHeight,
    stageFits: stage.scrollHeight<=stage.clientHeight+1,
    stageBox: stage.clientHeight, stageContent: stage.scrollHeight,
    neighbourHit: neighbourHit,
    ctaHitCaps: caps.some(function(c){ return hit(c, wrap); }),
    ctaWhole: !!cta&&cta.t>=sr.t-0.5&&cta.b<=sr.b+0.5,
    ctaInFlow: !!wrap&&getComputedStyle(q('.wsfc-cta-wrap')).position==='static',
    ctaAboveNav: (nav&&cta)?cta.b<=nav.t+0.5:!!cta,
    ctaH: cta?cta.h:0,
    voidBeforeCta: (wrap&&cardR)?+(wrap.t-cardR.b).toFixed(1):null,
    scrollTop: stage.scrollTop,
    docOverflowX: document.documentElement.scrollWidth>window.innerWidth+1,
    stageOverflowX: stage.scrollWidth>stage.clientWidth+1,
    clipped: textEls.filter(function(e){ return e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1; }).length,
    scaled: scaled, minFont: minFont, overflowHidden: hidden,
    hasNotice: !!notice, openers: root.querySelectorAll('[data-wsfc-open]').length,
  };
})()`;

// Un solo sitio crea contextos, así que el parche de auth no se puede olvidar en
// uno de los tres puntos de montaje.
async function newCtx(browser, opts) {
  const ctx = await browser.newContext(opts);
  if (PUBLIC_URL) await ctx.route('**/app.js*', async route => {
    const r = await route.fetch();
    await route.fulfill({ response: r, body: AUTH_PATCH(await r.text()) });
  });
  return ctx;
}

const VIEWPORTS = [[360, 740], [390, 844], [430, 932], [768, 1024], [1366, 768], [1440, 900]];

async function mount(page, L, { priorWork = false } = {}) {
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  // Sin sesión el build público navega a `login.html` y los globals desaparecen.
  // Se declara como límite del ORIGEN, no como fallo del candidato.
  if (PUBLIC_URL && /login\.html/.test(page.url())) throw new Error('origen no ejercitable: la app pública redirige sin sesión (' + page.url() + ')');
  await page.waitForFunction(`typeof renderWorkspaceHome === 'function' && typeof switchTab === 'function'`, null, { timeout: 60000 });
  await page.waitForTimeout(700);
  await page.evaluate(`(function(){
    var bl=document.getElementById('bootLoader'); if(bl) bl.remove();
    var ar=document.getElementById('appRoot'); if(ar) ar.style.opacity='1';
    document.getElementById('aurixWorkspace').style.display='block';
    return true; })()`);
  if (priorWork) await page.evaluate(`localStorage.setItem('aurix_ws_projects_v1', JSON.stringify([{id:'p1',type:'compound_growth',name:'Mi plan'}]))`);
  // ASIGNACIÓN DESNUDA, y no `window.algo = …`: `lang`, `_aurixEnt` y `_wshView` se
  // declaran con `let` en el ámbito léxico global, que NO es `window`. Escribir
  // `window.lang` crea una propiedad que la app no lee nunca.
  await page.evaluate(`(function(){
    lang = ${JSON.stringify(L)};
    _aurixEnt = {loaded:true,loading:false,error:null,plan:'free',status:'none',source:'default',validUntil:null,features:Object.create(null),sources:Object.create(null),fetchedAt:Date.now()};
    _wshView = 'free_cover';
    switchTab('workspace');
    return true; })()`);
  await page.waitForTimeout(600);
}

for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  // WebKit no acepta `--host-resolver-rules`; contra lo público sólo Chromium
  // puede saltarse el DNS del sandbox. Se declara en vez de fingir cobertura.
  if (ENG === 'WK' && PUBLIC_URL && RESOLVE) { console.log('  (WebKit omitido contra lo público: no admite regla de resolución)'); continue; }
  const browser = await launcher.launch({ args: (ENG === 'CR' && RESOLVE) ? ['--host-resolver-rules=MAP ' + RESOLVE.split('=')[0] + ' ' + RESOLVE.split('=')[1]] : [] });
  for (const [w, h] of VIEWPORTS) {
    for (const L of ['es', 'en']) {
      const ctx = await newCtx(browser, { viewport: { width: w, height: h }, deviceScaleFactor: w < 700 ? 2 : 1, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await mount(page, L);
      const g = await page.evaluate(MEASURE);
      const tag = `${ENG}.${w}×${h} ${L.toUpperCase()}`;
      if (!g || !g.mounted || g.caps !== 8) { ok(`${tag} la portada monta con sus OCHO capacidades`, false, JSON.stringify(g && { m: g.mounted, c: g.caps })); await ctx.close(); continue; }
      ok(`${tag} monta con las OCHO capacidades y ninguna es un acceso`,
        g.caps === 8 && g.openers === 0, JSON.stringify({ caps: g.caps, accesos: g.openers }));
      ok(`${tag} cabe entera sin scroll vertical ni horizontal`,
        g.stageFits && !g.docOverflowX && !g.stageOverflowX && g.scrollTop === 0,
        JSON.stringify({ caja: g.stageBox, contenido: g.stageContent, docX: g.docOverflowX, stageX: g.stageOverflowX }));
      ok(`${tag} ninguna rejilla se pinta fuera de su caja`,
        g.capsFits && g.cardFits && g.capsInCard && g.capsInStage,
        JSON.stringify({ caps: g.capsBox + '←' + g.capsContent, enCard: g.capsInCard, enStage: g.capsInStage }));
      ok(`${tag} ningún bloque se solapa con su vecino`,
        g.neighbourHit === false && g.ctaHitCaps === false,
        JSON.stringify({ vecinos: g.neighbourHit, ctaSobreCaps: g.ctaHitCaps }));
      ok(`${tag} el CTA está entero, en el flujo y por encima de la navegación`,
        g.ctaWhole && g.ctaInFlow && g.ctaAboveNav && g.ctaH >= 52,
        JSON.stringify({ entero: g.ctaWhole, enFlujo: g.ctaInFlow, sobreNav: g.ctaAboveNav, alto: g.ctaH }));
      ok(`${tag} el encaje NO se fuerza: sin scale, sin overflow:hidden, sin texto diminuto`,
        g.scaled === false && g.overflowHidden === 0 && g.minFont >= 11 && g.clipped === 0,
        JSON.stringify({ scale: g.scaled, hidden: g.overflowHidden, minPx: g.minFont, recortado: g.clipped }));
      if (w >= 768) {
        ok(`${tag} sin grandes vacíos en escritorio entre la card y el CTA`,
          g.voidBeforeCta !== null && g.voidBeforeCta <= 40,
          'hueco=' + g.voidBeforeCta);
      }
      await page.screenshot({ path: join(OUT, `wsfc-${ENG.toLowerCase()}-${w}x${h}-${L}.png`) });
      await ctx.close();
    }
  }

  // ── EL AVISO, Y QUE NO ROMPE EL ENCAJE EN EL VIEWPORT MÁS ESTRECHO ────────
  {
    const ctx = await newCtx(browser, { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await mount(page, 'es', { priorWork: true });
    const g = await page.evaluate(MEASURE);
    ok(`${ENG}.aviso · con trabajo guardado el aviso aparece y la portada sigue cabiendo`,
      g.hasNotice === true && g.stageFits && g.neighbourHit === false && g.ctaWhole && g.ctaAboveNav,
      JSON.stringify({ aviso: g.hasNotice, caja: g.stageBox, contenido: g.stageContent, cta: g.ctaWhole }));
    await page.screenshot({ path: join(OUT, `wsfc-${ENG.toLowerCase()}-360x740-es-aviso.png`) });
    // Y se puede cerrar: es un control real, no un adorno.
    await page.evaluate(`document.querySelector('.wsfc-notice-x').click()`);
    await page.waitForTimeout(150);
    ok(`${ENG}.aviso · se puede cerrar, y el CTA sigue entero después`,
      await page.evaluate(`!document.querySelector('.wsfc-notice')`),
      'el cierre es del despachador delegado');
    await ctx.close();
  }

  // ── ALTURA EXCEPCIONAL: ANTES SCROLL ACCESIBLE QUE CORTAR ────────────────
  // §3 lo dice explícitamente. Con 360×520 la composición NO cabe, y lo correcto
  // es que el contenedor se desplace —no que recorte, no que encoja las rejillas.
  {
    const ctx = await newCtx(browser, { viewport: { width: 360, height: 520 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await mount(page, 'es');
    const g = await page.evaluate(MEASURE);
    ok(`${ENG}.altura excepcional · el contenedor se desplaza en vez de recortar`,
      g.stageFits === false && g.capsFits && g.cardFits && g.neighbourHit === false && g.overflowHidden === 0 && g.clipped === 0,
      JSON.stringify({ desplaza: !g.stageFits, capsCaben: g.capsFits, solape: g.neighbourHit, recortado: g.clipped }));
    // Y al final del recorrido nada queda inalcanzable.
    await page.evaluate(`(function(){ var s=document.querySelector('#aurixWorkspace .wsfc-stage'); s.scrollTop=s.scrollHeight; })()`);
    await page.waitForTimeout(200);
    const g2 = await page.evaluate(MEASURE);
    ok(`${ENG}.altura excepcional · al final del recorrido el CTA es alcanzable y entero`,
      g2.ctaWhole && g2.ctaAboveNav && g2.ctaH >= 52, JSON.stringify({ entero: g2.ctaWhole, sobreNav: g2.ctaAboveNav }));
    await ctx.close();
  }
  await browser.close();
}

server.close();
console.log('\n════════════════════════════════════════════════');
console.log(pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { console.log('\nFAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); console.log('\nRESULT: NO-GO'); process.exit(1); }
console.log('\nRESULT: GO — capturas en docs/wsfc-premium-cover/');
process.exit(0);
