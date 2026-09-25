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
  var stage=q('.wsfc-stage'), panel=q('.wsfc-panel'), capsUl=q('.wsfc-caps');
  if(!stage||!panel||!capsUl) return {mounted:false};
  var sr=R(stage), panelR=R(panel), capEls=qa('.wsfc-cap'), caps=capEls.map(R);
  var head=R(q('.wsfc-eyebrow')), title=q('.wsfc-title'), sub=R(q('.wsfc-sub'));
  var wrap=R(q('.wsfc-cta-wrap')), ctaEl=q('.wsfc-cta'), cta=R(ctaEl);
  var navEl=document.getElementById('bottomNav');
  var navVis=!!navEl&&getComputedStyle(navEl).display!=='none'&&navEl.getBoundingClientRect().height>0;
  var nav=navVis?R(navEl):null;
  var textEls=qa('.wsfc-title,.wsfc-sub,.wsfc-eyebrow,.wsfc-cap-name,.wsfc-cta');
  // ── FILAS IGUALES Y REJILLA DECLARADA ────────────────────────────────────
  var cols=getComputedStyle(capsUl).gridTemplateColumns.split(' ').filter(Boolean).length;
  var rows={}, ragged=false, misaligned=false;
  caps.forEach(function(c,i){ var k=Math.round(c.t); (rows[k]=rows[k]||[]).push(i); });
  Object.keys(rows).forEach(function(k){
    var idx=rows[k]; var h0=caps[idx[0]].h, w0=caps[idx[0]].w;
    idx.forEach(function(i){ if(Math.abs(caps[i].h-h0)>1||Math.abs(caps[i].w-w0)>1) ragged=true; });
  });
  // Los iconos alineados: mismo tamaño y mismo desplazamiento respecto a su celda.
  var icos=qa('.wsfc-cap-ico').map(R);
  var i0=icos[0];
  icos.forEach(function(ic,i){ if(!i0||Math.abs(ic.w-i0.w)>0.5||Math.abs(ic.h-i0.h)>0.5) misaligned=true;
    if(Math.abs((ic.l-caps[i].l)-(i0.l-caps[0].l))>0.5) misaligned=true; });
  // ── NO SON BOTONES, Y SE MIDE ────────────────────────────────────────────
  var fakeBtn = capEls.some(function(e){
    var cs=getComputedStyle(e);
    return e.tagName!=='LI' || cs.cursor==='pointer' || e.hasAttribute('tabindex')
      || e.getAttribute('role')==='button' || !!e.querySelector('button,a,[tabindex]');
  });
  // ── LAS CELDAS, MÁS OSCURAS QUE EL PANEL ────────────────────────────────
  // SIN '\\d': esto vive dentro de un template literal de JS, y ahí '\\d' no es un
  // escape válido — se convierte en 'd' y el regex pasa a buscar la letra d. El
  // resultado era NaN y la comprobación de color daba rojo siempre.
  var lum=function(c){ var m=String(c).match(/[0-9.]+/g)||[0,0,0]; return 0.2126*(+m[0])+0.7152*(+m[1])+0.0722*(+m[2]); };
  var panelBg=getComputedStyle(panel).backgroundColor, capBg=capEls[0]?getComputedStyle(capEls[0]).backgroundColor:'';
  var scaled=qa('.wsfc-stage,.wsfc-panel,.wsfc-caps,.wsfc-cap,.wsfc-cta').some(function(e){
    var tr=getComputedStyle(e).transform; return tr&&tr!=='none'&&/matrix\\(\\s*(?!1,\\s*0,\\s*0,\\s*1)/.test(tr); });
  var minFont=Math.min.apply(null, textEls.map(function(e){ return parseFloat(getComputedStyle(e).fontSize)||99; }));
  var nameFont=Math.min.apply(null, qa('.wsfc-cap-name').map(function(e){ return parseFloat(getComputedStyle(e).fontSize)||99; }));
  var hidden=qa('.wsfc-stage,.wsfc-panel,.wsfc-caps').filter(function(e){ return getComputedStyle(e).overflow==='hidden'; }).length;
  var ellipsis=qa('.wsfc-cap-name').filter(function(e){ return getComputedStyle(e).textOverflow==='ellipsis' || e.scrollWidth>e.clientWidth+1; }).length;
  // El HUECO más grande entre dos bloques consecutivos del panel: §A prohíbe los
  // grandes vacíos, y un reparto automático los produce sin que nada «falle».
  var blocks=[head,R(title),sub,R(capsUl),wrap].filter(Boolean).sort(function(a,b){return a.t-b.t;});
  var maxGap=0; for(var i=1;i<blocks.length;i++) maxGap=Math.max(maxGap, +(blocks[i].t-blocks[i-1].b).toFixed(1));
  return {
    mounted:true, caps:caps.length, cols:cols,
    capsInPanel: capEls.every(function(e){ return ins(R(e), panelR); }),
    ctaInPanel: ins(wrap, panelR),
    panelInStage: !!panelR && panelR.t>=sr.t-0.5 && panelR.b<=sr.b+0.5,
    capsFits: capsUl.scrollHeight<=capsUl.clientHeight+1,
    stageFits: stage.scrollHeight<=stage.clientHeight+1,
    stageBox: stage.clientHeight, stageContent: stage.scrollHeight,
    ragged: ragged, misaligned: misaligned, fakeBtn: fakeBtn,
    capDarker: lum(capBg) < lum(panelBg),
    panelBg: panelBg, capBg: capBg,
    neighbourHit: (function(){ for(var i=1;i<blocks.length;i++) if(hit(blocks[i-1],blocks[i])) return true; return false; })(),
    maxGap: maxGap,
    ctaWhole: !!cta&&cta.t>=sr.t-0.5&&cta.b<=sr.b+0.5,
    ctaInFlow: !!wrap&&getComputedStyle(q('.wsfc-cta-wrap')).position==='static',
    ctaAboveNav: (nav&&cta)?cta.b<=nav.t+0.5:!!cta,
    ctaGapToNav: (nav&&cta)?+(nav.t-cta.b).toFixed(1):null,
    ctaH: cta?cta.h:0,
    scrollTop: stage.scrollTop,
    docOverflowX: document.documentElement.scrollWidth>window.innerWidth+1,
    stageOverflowX: stage.scrollWidth>stage.clientWidth+1,
    clipped: textEls.filter(function(e){ return e.scrollWidth>e.clientWidth+1; }).length,
    ellipsis: ellipsis,
    scaled: scaled, minFont: minFont, nameFont: nameFont, overflowHidden: hidden,
    openers: root.querySelectorAll('[data-wsfc-open]').length,
    notice: root.querySelectorAll('.wsfc-notice,[data-wsfc-notice-close]').length,
    titleTxt: title?(title.textContent||'').trim():'',
    names: qa('.wsfc-cap-name').map(function(e){ return (e.textContent||'').trim(); }),
  };
})()`;

// Un solo sitio crea contextos, así que el parche de auth no se puede olvidar en
// ninguno de los puntos de montaje.
async function newCtx(browser, opts) {
  const ctx = await browser.newContext(opts);
  if (PUBLIC_URL) await ctx.route('**/app.js*', async route => {
    const r = await route.fetch();
    await route.fulfill({ response: r, body: AUTH_PATCH(await r.text()) });
  });
  return ctx;
}

// El título APROBADO, literal. Si alguien lo cambia sin pasar por el founder,
// esto se pone rojo en los doce viewports a la vez.
const EXPECTED_TITLE = {
  es: 'Organiza, calcula y planifica tu patrimonio',
  en: 'Organize, calculate and plan your wealth',
};

const VIEWPORTS = [[360, 740], [390, 844], [430, 932], [768, 1024], [1366, 768], [1440, 900]];

async function mount(page, L) {
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
      // OCHO → NUEVE (2026-09-25): el comparador de rentabilidad se publica
      // como novena capacidad al mudarse de Intelligence.
      if (!g || !g.mounted || g.caps !== 9) { ok(`${tag} la portada monta con sus NUEVE capacidades`, false, JSON.stringify(g && { m: g.mounted, c: g.caps })); await ctx.close(); continue; }
      ok(`${tag} monta las NUEVE capacidades, con su nombre y sin accesos`,
        g.caps === 9 && g.openers === 0 && g.names.every(n => n.length > 3),
        JSON.stringify({ caps: g.caps, accesos: g.openers, nombres: g.names }));
      ok(`${tag} el aviso de cambio de plan ya no existe`,
        g.notice === 0, 'quedan ' + g.notice + ' restos del aviso');
      ok(`${tag} el título es el aprobado`,
        g.titleTxt === EXPECTED_TITLE[L], JSON.stringify(g.titleTxt));
      // §A fija la rejilla: 2×4 en móvil y en anchos intermedios, 4×2 sólo cuando
      // los nombres caben cómodamente (escritorio).
      ok(`${tag} rejilla ${w >= 1024 ? '4×2' : '2×4'}`,
        g.cols === (w >= 1024 ? 4 : 2), 'columnas=' + g.cols);
      ok(`${tag} celdas iguales por fila, iconos alineados y padding consistente`,
        g.ragged === false && g.misaligned === false,
        JSON.stringify({ desiguales: g.ragged, iconos: g.misaligned }));
      ok(`${tag} las capacidades son contenido, no falsos botones`,
        g.fakeBtn === false, 'li sin cursor, sin tabindex, sin rol de botón');
      ok(`${tag} las celdas son MÁS OSCURAS que el panel, no más claras`,
        g.capDarker === true, JSON.stringify({ panel: g.panelBg, celda: g.capBg }));
      ok(`${tag} cabe entera sin scroll vertical ni horizontal`,
        g.stageFits && !g.docOverflowX && !g.stageOverflowX && g.scrollTop === 0,
        JSON.stringify({ caja: g.stageBox, contenido: g.stageContent, docX: g.docOverflowX, stageX: g.stageOverflowX }));
      ok(`${tag} nada se pinta fuera de su caja ni pisa a su vecino`,
        g.capsFits && g.capsInPanel && g.ctaInPanel && g.panelInStage && g.neighbourHit === false,
        JSON.stringify({ capsCaben: g.capsFits, enPanel: g.capsInPanel, cta: g.ctaInPanel, solape: g.neighbourHit }));
      // ── SIN GRANDES VACÍOS, Y SIN PEGAR EL CTA A LA NAVEGACIÓN ────────────
      ok(`${tag} espaciado controlado: ningún hueco desproporcionado entre bloques`,
        g.maxGap <= 34, 'mayor hueco=' + g.maxGap);
      ok(`${tag} el CTA está entero, en el flujo, y no pegado a la navegación`,
        g.ctaWhole && g.ctaInFlow && g.ctaAboveNav && g.ctaH >= 52
        && (g.ctaGapToNav === null || g.ctaGapToNav >= 8),
        JSON.stringify({ entero: g.ctaWhole, enFlujo: g.ctaInFlow, sobreNav: g.ctaAboveNav, alto: g.ctaH, holgura: g.ctaGapToNav }));
      ok(`${tag} el encaje NO se fuerza: sin scale, sin overflow:hidden, sin texto diminuto`,
        g.scaled === false && g.overflowHidden === 0 && g.minFont >= 11 && g.clipped === 0,
        JSON.stringify({ scale: g.scaled, hidden: g.overflowHidden, minPx: g.minFont, recortado: g.clipped }));
      ok(`${tag} nombres legibles (≥14 px) y sin elipsis`,
        g.nameFont >= 14 && g.ellipsis === 0,
        JSON.stringify({ px: g.nameFont, elipsis: g.ellipsis }));
      await page.screenshot({ path: join(OUT, `wsfc-${ENG.toLowerCase()}-${w}x${h}-${L}.png`) });
      await ctx.close();
    }
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
      g.stageFits === false && g.capsFits && g.capsInPanel && g.neighbourHit === false && g.overflowHidden === 0 && g.clipped === 0,
      JSON.stringify({ desplaza: !g.stageFits, capsCaben: g.capsFits, solape: g.neighbourHit, recortado: g.clipped }));
    // Y al final del recorrido nada queda inalcanzable.
    await page.evaluate(`(function(){ var s=document.querySelector('#aurixWorkspace .wsfc-stage'); s.scrollTop=s.scrollHeight; })()`);
    await page.waitForTimeout(200);
    const g2 = await page.evaluate(MEASURE);
    ok(`${ENG}.altura excepcional · al final del recorrido el CTA es alcanzable y entero`,
      g2.ctaWhole && g2.ctaAboveNav && g2.ctaH >= 52, JSON.stringify({ entero: g2.ctaWhole, sobreNav: g2.ctaAboveNav }));
    await ctx.close();
  }

  // ══ LAS DOS PORTADAS FREE SON LA MISMA CASA ══════════════════════════════
  // El fundador lo vio antes que ninguna medida: «el botón de menú cambia de
  // posición», «Workspace empieza más abajo», «parecen sistemas diferentes».
  // Y era cierto y medible: `workspace-active` libera el shell —quita el
  // max-width y el padding de `.app` y da al header su propio gutter— y eso se
  // aplicaba también a la PORTADA, no sólo al interior. Diferencias medidas
  // antes del arreglo: inicio del contenido 46 vs 58 px (390), margen lateral
  // 32 vs 12 (768) y 112 vs 170 (1440), ancho 1216 vs 1100.
  // Se compara coordenada a coordenada, en las dos pestañas, mismo viewport.
  for (const [w, h] of [[360, 740], [390, 844], [768, 1024], [1440, 900]]) {
    const ctx = await newCtx(browser, { viewport: { width: w, height: h }, deviceScaleFactor: w < 700 ? 2 : 1, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await mount(page, 'es');
    const geo = async (tab) => {
      await page.evaluate(`(function(){ switchTab(${JSON.stringify(tab)}); return true; })()`);
      await page.waitForTimeout(500);
      return page.evaluate(`(function(){
        var R = function(e){ if(!e) return null; var r = e.getBoundingClientRect();
          return { t: Math.round(r.top), l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }; };
        // La SUPERFICIE visible de cada portada (el panel), no su contenedor:
        // comparar el contenedor de una con la tarjeta de la otra daba números
        // que no se parecían a lo que se ve.
        var host = document.querySelector('#aurixWorkspace .wsfc-panel, #tabPlaceholder .intprev-card');
        var cta  = document.querySelector('#aurixWorkspace .wsfc-cta, #tabPlaceholder .intprev-cta');
        // NINGUNA de las dos puede nombrar el plan: el precio y el plan viven en
        // el paywall. Se busca el nombre, no una clase concreta.
        var surf = document.querySelector('#aurixWorkspace .wsfc-panel, #tabPlaceholder .intprev-card');
        var names = surf ? /premium|incluido|included/i.test(surf.textContent || '') : false;
        var ctaCs = cta ? getComputedStyle(cta) : null;
        return JSON.stringify({ menu: R(document.getElementById('menuToggle')), host: R(host),
          radius: ctaCs ? ctaCs.borderRadius : null, minH: ctaCs ? ctaCs.minHeight : null,
          bg: ctaCs ? ctaCs.backgroundImage.slice(0, 60) : null,
          names: names, docH: document.documentElement.scrollHeight, vh: window.innerHeight });})()`).then(JSON.parse);
    };
    const I = await geo('intelligence');
    const W = await geo('workspace');
    const tag = `${ENG}.${w}×${h} portadas`;
    ok(`${tag} · el botón de menú está EN EL MISMO SITIO en las dos`,
      I.menu && W.menu && I.menu.t === W.menu.t && I.menu.l === W.menu.l && I.menu.w === W.menu.w,
      JSON.stringify({ int: I.menu, ws: W.menu }));
    // NO se exige la misma ALTURA de inicio: las dos portadas centran su panel
    // en el escenario y dicen cosas de largo distinto, así que igualar el top
    // exigiría un hueco artificial — justo lo que el encargo prohíbe. Lo que sí
    // se exige es que la columna sea la misma.
    ok(`${tag} · el panel arranca dentro del primer viewport en las dos`,
      I.host.t >= 0 && W.host.t >= 0 && I.host.t < I.vh && W.host.t < W.vh,
      JSON.stringify({ int: I.host.t, ws: W.host.t }));
    ok(`${tag} · mismos márgenes laterales y mismo ancho de columna`,
      Math.abs(I.host.l - W.host.l) <= 1 && Math.abs(I.host.w - W.host.w) <= 1,
      JSON.stringify({ int: [I.host.l, I.host.w], ws: [W.host.l, W.host.w] }));
    ok(`${tag} · el CTA es el MISMO componente (radio, alto y familia de color)`,
      I.radius === W.radius && I.minH === W.minH &&
      /gradient/.test(String(I.bg)) && I.bg === W.bg,
      JSON.stringify({ int: [I.radius, I.minH, I.bg], ws: [W.radius, W.minH, W.bg] }));
    // RE-DECIDIDO sobre la marcha: llegué a poner un distintivo «PREMIUM» en las
    // dos portadas para que el dorado fuera coherente, y DOS gates lo rechazaron
    // —la portada no nombra el plan; eso es del paywall—. Tienen razón y la
    // regla se queda: lo que se comparte es la geometría y el componente, no una
    // etiqueta comercial.
    ok(`${tag} · ninguna de las dos nombra el plan (eso es del paywall)`,
      I.names === false && W.names === false, JSON.stringify({ int: I.names, ws: W.names }));
    // Y ninguna obliga a desplazar para existir en móvil.
    if (w <= 430) {
      ok(`${tag} · ninguna de las dos desborda el alto del móvil`,
        I.docH <= I.vh + 1 && W.docH <= W.vh + 1, JSON.stringify({ int: [I.docH, I.vh], ws: [W.docH, W.vh] }));
    }
    await page.evaluate(`(function(){ switchTab('intelligence'); return true; })()`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT, `par-intelligence-${w}x${h}-${ENG}.png`) });
    await page.evaluate(`(function(){ switchTab('workspace'); return true; })()`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT, `par-workspace-${w}x${h}-${ENG}.png`) });
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
