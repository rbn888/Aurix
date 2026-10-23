#!/usr/bin/env node
/**
 * AURIX · LANDING COMERCIAL V1/V2 — gate único de la landing (herramienta, no se publica).
 * SPEC: docs/AURIX-LANDING-COMMERCIAL-V1-SPEC.md §7 y §V2.27.
 *
 * Chromium + WebKit · 360×640 · 375×667 · 390×844 · 412×915 · 768×1024 · 1440×900 · ES/EN, más:
 * interacciones del panel (ratón, teclado, táctil), enlace «Ver análisis», recorrido de la esfera
 * (reposo, salida, un único looping, acompañamiento, despedida, vuelta), evasión del ratón, cambio de
 * tamaño e idioma, movimiento reducido y sin JS. En cada paso del recorrido se comprueba que la esfera
 * no pisa ningún texto, botón ni enlace.
 * INTELLIGENCE V2 + PREMIUM (docs/AURIX-LANDING-INTELLIGENCE-PREMIUM-SPEC.md): copy aprobado literal, captura
 * real con la esfera viva en su hueco, pregunta de «Explora» (ratón, teclado, toque, Escape, texto accesible),
 * pie del Radar, Premium con las dos modalidades y `plan=` en sus enlaces.
 *
 *   node scripts/aurix-landing-probe.mjs                       # local (sirve landing/)
 *   SHOTS=/ruta  node scripts/aurix-landing-probe.mjs          # + capturas 390/1440 ES/EN
 *   RECORD=/ruta node scripts/aurix-landing-probe.mjs --record # sólo graba el recorrido (vídeo)
 *   LANDING_DIR=/otra/landing · BASE=https://… · HOST_IP=…     # otra copia / URL pública
 */
import { createServer } from 'node:http';
import { readFile, mkdir, rename, readdir } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// LANDING_DIR permite comparar con otra copia de landing/ (p. ej. la publicada, para el «antes»).
const ROOT = normalize(process.env.LANDING_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', 'landing'));
const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
let PWm;
try { PWm = await import(PW); } catch (_) { console.error('✗ SIN MOTOR (playwright en ' + PW + ')\nRESULT: NO EJECUTADO'); process.exit(2); }
const SHOTS = process.env.SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const RECORD = process.argv.includes('--record') ? (process.env.RECORD || '/tmp/aurix-landing-record') : '';

let BASE = process.env.BASE || '';
let server = null;
if (!BASE) {
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
  server = createServer(async (req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const abs = normalize(join(ROOT, p)); if (!abs.startsWith(ROOT)) return res.writeHead(403).end();
    try { const b = await readFile(abs); res.writeHead(200, { 'content-type': MIME[extname(abs)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(b); }
    catch (_) { res.writeHead(404).end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = `http://127.0.0.1:${server.address().port}/`;
}
const launchArgs = process.env.HOST_IP ? { args: [`--host-resolver-rules=MAP aurixsystem.io ${process.env.HOST_IP}`] } : {};

const VPS = [[360, 640], [375, 667], [390, 844], [412, 915], [430, 932], [768, 1024], [1440, 900]];
const EXPECT = {
  es: { head: 'Microsoft, Bitcoin y Apple pesan más que tus otras 9 inversiones juntas.', stat: 'Tus 3 mayores inversiones reúnen el 69 % de tu cartera financiera.',
        h1: 'Comprende mejor tu patrimonio.', cap: '', hot: 'Salud: A vigilar · Ver análisis en AURIX Intelligence',
        ta: 'Convierte tus inversiones en información,', tb: 'toma mejores decisiones desde hoy.',
        isub: 'Obtén tu análisis al instante y descubre qué riesgos podrías estar ignorando',
        h1b: 'Decide con más información.', sub: 'Reúne tus inversiones en un solo lugar y descubre qué está pasando con tu dinero.',
        qs: [{ q: '¿Estoy repartido entre varias clases o sigo dependiendo de pocas inversiones?', a: ['Repartes entre 4 clases de inversión, pero no tanto entre posiciones: el peso sigue recayendo en tus tres mayores inversiones.', 'Clases: Acciones, Cripto, Fondos/ETF y Metales. Tres mayores: Microsoft, Bitcoin y Apple.'] },
             { q: '¿Qué parte de mi cartera está entre Acciones y Cripto?', a: ['Acciones y Cripto reúnen hoy el 92% de tu cartera financiera.', 'Acciones, 51%; Cripto, 41%.'] },
             { q: '¿Cuánto han rendido realmente mis inversiones?', a: ['El rendimiento de tu cartera financiera fue del 0,19% en el último día registrado'] }],
        radar: 'Historial analizado: 1 día', login: 'Entrar',
        year: '69,99\u00a0€', month: '7,99\u00a0€', ctaY: 'Elegir anual', ctaM: 'Elegir mensual' },
  en: { head: 'Microsoft, Bitcoin and Apple outweigh your other 9 investments combined.', stat: 'Your 3 largest investments hold 69% of your financial portfolio.',
        h1: 'Understand your wealth better.', cap: 'Interface shown in Spanish', hot: 'Health: Worth watching · View analysis in AURIX Intelligence',
        ta: 'Turn your investments into insights,', tb: 'make better-informed decisions today.',
        isub: 'Get your analysis instantly and discover risks you might be ignoring.',
        h1b: 'Make better\u2011informed decisions.', sub: 'Bring your investments together in one place and see what’s happening with your money.',
        qs: [{ q: 'Am I spread across several investment classes, or do I still depend on a few investments?', a: ['You spread across 4 investment classes, but less so across positions: the weight still rests on your three largest investments.', 'Classes: Stocks, Crypto, ETF / Funds and Metals. Three largest: Microsoft, Bitcoin and Apple.'] },
             { q: 'How much of my portfolio is in Stocks and Crypto?', a: ['Stocks and Crypto together hold 92% of your financial portfolio today.', 'Stocks, 51%; Crypto, 41%.'] },
             { q: 'How much have my investments actually returned?', a: ['The return of your financial portfolio was 0.19% over the last recorded day'] }],
        radar: 'History analysed: 1 day', login: 'Log in',
        year: '€69.99', month: '€7.99', ctaY: 'Choose annual', ctaM: 'Choose monthly' },
};

let pass = 0; const fails = [];
const ok = (name, cond, info) => { if (cond) pass++; else { fails.push(name); console.log('  ✗ ' + name + (info !== undefined ? '  [' + String(typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 320) + ']' : '')); } };
const notes = [];

// Contraste WCAG del texto contra el fondo de la página (#05070f), mezclando el alfa del color.
const CONTRAST = `(function(){
  function parse(c){ var m=c.match(/rgba?\\(([^)]+)\\)/); if(!m) return null; var p=m[1].split(',').map(function(x){return parseFloat(x)}); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}; }
  function lin(v){ v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4); }
  function L(c){ return 0.2126*lin(c.r)+0.7152*lin(c.g)+0.0722*lin(c.b); }
  var bg={r:5,g:7,b:15};
  return function(el){ var cs=getComputedStyle(el); var c=parse(cs.color); if(!c) return 0; var o=parseFloat(cs.opacity)||1; var a=c.a*o;
    var f={r:c.r*a+bg.r*(1-a), g:c.g*a+bg.g*(1-a), b:c.b*a+bg.b*(1-a)}; var l1=L(f), l2=L(bg); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); };
})()`;

// Estado de la esfera + ¿pisa algún texto, botón o enlace? (rectángulos reales de los nodos de texto)
const ORB = `(function(){
  var orb=document.querySelector('.lp-orb'), slot=document.querySelector('.lp-orb-slot');
  var r=orb.getBoundingClientRect(), sr=slot.getBoundingClientRect(), cs=getComputedStyle(orb);
  var vis = cs.visibility!=='hidden' && parseFloat(cs.opacity) > 0.05;
  var sh = r.width*0.06, box={l:r.left+sh,t:r.top+sh,r:r.right-sh,b:r.bottom-sh};
  var hits=[];
  if (vis) {
    var w=document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT, null), n;
    while ((n=w.nextNode())) {
      if (!n.nodeValue.trim()) continue; var el=n.parentElement; if (!el || el.closest('.lp-orb-slot')) continue;
      var st=getComputedStyle(el); if (st.visibility==='hidden' || parseFloat(st.opacity)===0) continue;
      var rg=document.createRange(); rg.selectNodeContents(n); var rs=rg.getClientRects();
      for (var i=0;i<rs.length;i++){ var q=rs[i]; if (q.width<1||q.height<1) continue; if (q.right>box.l && q.left<box.r && q.bottom>box.t && q.top<box.b) hits.push(n.nodeValue.trim().slice(0,30)); }
    }
    [].slice.call(document.querySelectorAll('main a, main button')).forEach(function(e){ if (e.closest('.lp-orb-slot')) return; var q=e.getBoundingClientRect(); if (!q.width) return;
      if (q.right>box.l && q.left<box.r && q.bottom>box.t && q.top<box.b) hits.push('<'+e.tagName.toLowerCase()+'>'+(e.textContent||'').trim().slice(0,20)); });
  }
  var ben=document.querySelector('#intelligence .benefits').getBoundingClientRect();
  var eb=document.querySelector('.lp-ecg-base'), ebs=getComputedStyle(eb), er=eb.getBoundingClientRect();
  var ecg = vis && ebs.visibility!=='hidden' && parseFloat(ebs.opacity)>0.9 && ebs.stroke!=='none' && er.width > r.width*0.4;
  return { ecg:ecg, cx:(r.left+r.right)/2, cy:(r.top+r.bottom)/2, w:r.width, dx:(r.left+r.right)/2-(sr.left+sr.right)/2, dy:(r.top+r.bottom)/2-(sr.top+sr.bottom)/2,
    vis:vis, op:parseFloat(cs.opacity||'1'), hits:hits, contL:ben.left, contR:ben.right, vw:document.documentElement.clientWidth, ovx:document.documentElement.scrollWidth-innerWidth, sy:scrollY };
})()`;
const settle = (page, ms = 60) => page.waitForTimeout(ms);
async function scrollTo(page, y) { await page.evaluate(y => window.scrollTo(0, y), y); }
async function geom(page) {
  return page.evaluate(() => {
    const sy = scrollY, g = s => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); return { t: r.top + sy, b: r.bottom + sy }; };
    return { intel: g('#intelligence'), panel: g('#intelDemo'), ben: g('#intelligence .benefits'), trk: g('#tracking .section-title'), vh: innerHeight };
  });
}

if (RECORD) { await record(); }
else { await gate(); }
if (server) server.close();

async function gate() {
for (const engine of ['chromium', 'webkit']) {
  const browser = await PWm[engine].launch(launchArgs);
  for (const lang of ['es', 'en']) {
    const E = EXPECT[lang];
    for (const [w, h] of VPS) {
      const T = `${engine} ${lang} ${w}×${h}`;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800, isMobile: engine === 'chromium' && w < 800 });
      const page = await ctx.newPage();
      const heroReqs = [];
      page.on('request', r => { if (/hero-dashboard/.test(r.url())) heroReqs.push(r.url().split('/').pop()); });
      const extReqs = []; page.on('request', r => { const u = new URL(r.url()); if (!/^(127\.0\.0\.1|localhost)$/.test(u.hostname) && !/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname) && u.protocol !== 'data:' && r.url().indexOf(BASE) !== 0) extReqs.push(r.method() + ' ' + u.hostname); });
      await page.addInitScript(() => {
        window.__cls = 0;
        try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (_) {}
      });
      await page.goto(BASE + '?lang=' + lang, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);

      const m = await page.evaluate(`(function(){
        var q=function(s){return document.querySelector(s)}; var R=function(e){ if(!e) return null; var r=e.getBoundingClientRect(); return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height}; };
        var fs=function(s){ var e=q(s); return e? parseFloat(getComputedStyle(e).fontSize) : 0; };
        var norm=function(s){ return (s||'').replace(/[ \\t\\n\\r]+/g,' ').trim(); };
        var heroImg=q('.hero-visual img'), hot=q('.hero-hotspot');
        return { ovx: document.documentElement.scrollWidth - innerWidth, H: innerHeight, lang: document.documentElement.lang,
          h1: R(q('.hero-title')), sub: R(q('.hero-sub')), cta1: R(q('.hero-cta .btn-primary')), cta2: R(q('.hero-cta .btn-ghost')),
          h1t: q('.hero-title').textContent, subT: norm(q('.hero-sub').textContent),
          iv2: (function(){ var t=q('#intelligence .iv2-title'), sp=t.querySelectorAll('span'), br=q('.iv2-br'), shot=q('.iv2-shot'), base=q('.iv2-base'), slot=q('.lp-orb-slot');
            var cs=getComputedStyle(shot), br0=base.getBoundingClientRect(), sr=slot.getBoundingClientRect(), sec=q('#intelligence').getBoundingClientRect();
            var vis=function(e){ return !!e && getComputedStyle(e).display!=='none' && e.getBoundingClientRect().width>0; };
            var qs=[].slice.call(document.querySelectorAll('[data-iv2-toggle]')).filter(vis);
            return { ta: norm(sp[0].textContent), tb: norm(sp[1].textContent), accent: getComputedStyle(sp[1]).color, white: getComputedStyle(sp[0]).color,
              brShown: getComputedStyle(br).display!=='none', lines: Math.round(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight)),
              sub: norm(q('.iv2-sub').textContent), headPs: document.querySelectorAll('.intel-head p').length, fsSub: fs('.iv2-sub'),
              src: base.currentSrc.split('/').pop(), imgW: br0.width,
              orbN: document.querySelectorAll('.lp-orb').length, slot: { cx:(sr.left+sr.right)/2, cy:(sr.top+sr.bottom)/2, w: sr.width },
              want: { cx: br0.left + parseFloat(cs.getPropertyValue('--iv2-cx'))/100*br0.width, cy: br0.top + parseFloat(cs.getPropertyValue('--iv2-cy'))/100*br0.height,
                      w: parseFloat(cs.getPropertyValue('--iv2-ow'))/100*br0.width },
              qLabels: qs.map(function(b){ return b.getAttribute('aria-label'); }), qHits: qs.map(function(b){ return Math.max(b.getBoundingClientRect().height, parseFloat(getComputedStyle(b, '::before').height) || 0); }),
              qCtl: qs.map(function(b){ var a = document.getElementById(b.getAttribute('aria-controls')); return !!a && a.classList.contains('iv2-ans') && a.getAttribute('data-q') === b.getAttribute('data-q') && b.getAttribute('aria-expanded') === 'false'; }),
              ans: qs.map(function(b){ var a = document.getElementById(b.getAttribute('aria-controls')); return a ? [].slice.call(a.querySelectorAll('p')).map(function(p){ return norm(p.textContent); }) : null; }),
              stat: getComputedStyle(q('.iv2-static')).display, frame: getComputedStyle(shot).boxShadow,
              arcVis: vis(q('.iv2-arc')),
              rn: (function(){ var n=q('.iv2-radar-note'), r=n.getBoundingClientRect(); return { t: norm(n.textContent), vis: vis(n), fs: parseFloat(getComputedStyle(n).fontSize),
                inImg: r.left >= br0.left && r.right <= br0.left + br0.width * 0.36 && r.top >= br0.top && r.bottom <= br0.bottom, cap: !!q('.iv2-note') }; })(),
              mMore: vis(q('.iv2-m-more')), imgTopInSection: br0.top - sec.top };
          })(),
          plans2: (function(){ var y=q('.plan-mode--year').getBoundingClientRect(), m=q('.plan-mode--month').getBoundingClientRect(), by=q('.plan-mode--year .btn').getBoundingClientRect(), bm=q('.plan-mode--month .btn').getBoundingClientRect();
            var py=q('.plan-mode--year .plan-price').getBoundingClientRect(), pm=q('.plan-mode--month .plan-price').getBoundingClientRect(), fr=q('.plan:not(.plan--premium)'), frr=fr.getBoundingClientRect(), last=[].slice.call(fr.children).filter(function(c){ return c.getBoundingClientRect().height > 0; }).pop().getBoundingClientRect();
            var feats=q('.plan--premium .plan-list').getBoundingClientRect(), cw=q('.plan--premium').clientWidth - parseFloat(getComputedStyle(q('.plan--premium')).paddingLeft) - parseFloat(getComputedStyle(q('.plan--premium')).paddingRight);
            return { cols: Math.abs(y.top - m.top) < 1 && y.right <= m.left, yearLeft: y.left < m.left, btnRow: Math.abs(by.top - bm.top) < 1, priceRow: Math.abs(py.bottom - pm.bottom) < 2, featsBelow: feats.top > Math.max(y.bottom, m.bottom),
              cw: Math.round(cw), freeGap: Math.round(frr.bottom - last.bottom), stacked: m.top >= y.bottom - 1 }; })(),
          plans: (function(){ var y=q('.plan-mode--year'), m=q('.plan-mode--month'); return { y: y ? norm(y.querySelector('.plan-price b').textContent) : null, m: m ? norm(m.querySelector('.plan-price b').textContent) : null,
            yR: R(y), mR: R(m), firstIsYear: !!y && !!m && (y.compareDocumentPosition(m) & 4) > 0, ctaY: y ? norm(y.querySelector('.btn').textContent) : null, ctaM: m ? norm(m.querySelector('.btn').textContent) : null,
            yPrimary: !!y && y.querySelector('.btn').classList.contains('btn-primary'), lists: document.querySelectorAll('.plan--premium .plan-list').length }; })(),
          orb: R(q('.lp-orb')),
          hero: heroImg ? heroImg.currentSrc.split('/').pop() : '', heroR: R(heroImg),
          hot: { href: hot.getAttribute('href'), aria: hot.getAttribute('aria-label'), r: R(hot), target: hot.getAttribute('target'), hit: parseFloat(getComputedStyle(hot, '::before').height) },
          mob: { hdr: R(q('#siteHeader')), eye: R(q('.hero-eyebrow')), ctaFs: parseFloat(getComputedStyle(q('.hero-cta .btn-primary')).fontSize) },
          zOrb: parseInt(getComputedStyle(q('.lp-orb')).zIndex, 10), zHeader: parseInt(getComputedStyle(q('#siteHeader')).zIndex, 10),
          appLinks: [].slice.call(document.querySelectorAll('[data-app-link]')).map(function(a){ return { href: a.getAttribute('href'), premium: a.getAttribute('data-app-intent')==='premium', plan: a.getAttribute('data-app-plan') }; }),
          headerApp: document.querySelectorAll('#siteHeader [data-app-link]').length,
          login: (function(){ var ls=document.querySelectorAll('#siteHeader [data-app-login]'), l=ls[0]; if (!l) return { n: 0 }; var r=l.getBoundingClientRect(), lt=document.querySelector('.header-right .lang-toggle').getBoundingClientRect(), hd=document.getElementById('siteHeader').getBoundingClientRect();
            return { n: ls.length, t: norm(l.textContent), href: l.getAttribute('href'), vis: r.width > 0 && r.right <= innerWidth && r.left >= 0, afterLang: r.left >= lt.right - 0.5, inHdr: r.top >= hd.top && r.bottom <= hd.bottom, hit: Math.max(r.height, parseFloat(getComputedStyle(l, '::before').height) || 0), hdrH: Math.round(hd.height) }; })(),
          planOrder: (function(){ var pr=q('.plan--premium'), fr=q('.plan--free'); var a=pr.getBoundingClientRect(), b=fr.getBoundingClientRect(); return { premFirst: !!(pr.compareDocumentPosition(fr) & 4) && a.bottom <= b.top, sameCol: Math.abs(a.left - b.left) < 1 && Math.abs(a.width - b.width) < 1 }; })(),
          support: [].slice.call(document.querySelectorAll('[data-legal-link="support"]')).map(function(a){return a.getAttribute('href')}),
          cap: (function(){ var c=q('.how-market-fig .shot-caption'); return { t: c.textContent, vis: getComputedStyle(c).display!=='none' && c.getBoundingClientRect().height>0 }; })(),
          gone: { menuApp: !!q('#mobileMenu [data-app-link]'), marketLink: !!q('.how-market-fig a'), zoom: !!q('.how-market-fig img') && getComputedStyle(q('.how-market-fig img')).cursor === 'zoom-in', how: !!q('#how'), steps: !!q('.steps'), free: !!q('.intel-free'), photo: !!q('a[href*="intelligence-full"]'), panel: !!q('.intel-panel') || !!q('.ip-bars'), demoFoot: !!q('.ip-demo'), note: !!q('.benefit-note'), heroCap: !!q('.hero-visual .shot-caption'), navHow: !!q('a[href="#how"]') },
          demoMentions: (document.body.innerText.match(/Cartera de demostración|Demo portfolio/g) || []).length,
          imgsNoDim: [].slice.call(document.images).filter(function(i){ return !i.getAttribute('width') || !i.getAttribute('height'); }).length,
        }; })()`);

      ok(`${T} · L sin desbordamiento horizontal`, m.ovx <= 0, m.ovx);
      ok(`${T} · A H1, descripción y CTA principal en el primer pantallazo`, m.h1.b <= m.H && m.sub.b <= m.H && m.cta1.b <= m.H, { h1: m.h1.b, sub: m.sub.b, cta: m.cta1.b, H: m.H });
      if (h >= 667) ok(`${T} · A CTA secundario en el primer pantallazo`, m.cta2.b <= m.H, { cta2: m.cta2.b, H: m.H });
      ok(`${T} · A idioma activo y H1`, m.lang === lang && m.h1t.indexOf(E.h1) === 0, m.h1t);
      ok(`${T} · A cabecera sin CTA de registro`, m.headerApp === 0, m.headerApp);
      ok(`${T} · A «${E.login}» en la cabecera, a la derecha de ES | EN, visible sin desbordar, área ≥44 px; entrada normal de la app con idioma, sin intención ni modalidad`,
        m.login.n === 1 && m.login.t === E.login && m.login.vis && m.login.afterLang && m.login.inHdr && m.login.hit >= 44 - 0.5
        && /^https:\/\/app\.aurixsystem\.io\/\?(lang|langhint)=(es|en)$/.test(m.login.href), m.login);
      ok(`${T} · P Premium arriba y Free debajo, en el mismo contenedor`, m.planOrder.premFirst && m.planOrder.sameCol, m.planOrder);
      // INTELLIGENCE V2 · copy aprobado literal, jerarquía y captura real con la esfera viva en su hueco.
      const V = m.iv2, desk = w >= 1024;
      ok(`${T} · V2 copy aprobado literal (título y una sola frase bajo él)`, V.ta === E.ta && V.tb === E.tb && V.sub === E.isub && V.headPs === 1, { ta: V.ta, tb: V.tb, sub: V.sub, ps: V.headPs });
      ok(`${T} · V2 segunda parte del título en azul, primera en blanco`, V.accent !== V.white && /rgb\(125, 184, 255\)/.test(V.accent), { a: V.accent, w: V.white });
      ok(`${T} · V2 salto tras la coma sólo desde 768 px`, V.brShown === (w >= 768), V.brShown);
      if (desk) ok(`${T} · V2 escritorio: título en dos líneas (una por frase)`, V.lines === 2, V.lines);
      ok(`${T} · V2 frase bajo el título legible (≥17 px)`, V.fsSub >= 17, V.fsSub);
      ok(`${T} · V2 captura del idioma activo (${desk ? 'escritorio' : 'móvil real'})`, new RegExp(desk ? `^intelligence-v2-${lang}(-2x)?\\.jpg$` : `^intelligence-v2-m-head-${lang}\\.jpg$`).test(V.src), V.src);
      ok(`${T} · V2 una sola esfera, centrada en el hueco de la captura (≤2 px) y a su tamaño (≤1 px)`, V.orbN === 1 && Math.abs(V.slot.cx - V.want.cx) <= 2 && Math.abs(V.slot.cy - V.want.cy) <= 2 && Math.abs(V.slot.w - V.want.w) <= 1, { slot: V.slot, want: V.want, n: V.orbN });
      ok(`${T} · V2 las tres preguntas de Explora como controles reales (nombre = pregunta del motor, ≥44 px, aria-expanded/aria-controls)`,
        JSON.stringify(V.qLabels) === JSON.stringify(E.qs.map(x => x.q)) && V.qHits.every(x => x >= 44 - 0.5) && V.qCtl.every(Boolean), { labels: V.qLabels, hits: V.qHits, ctl: V.qCtl });
      ok(`${T} · V2 las tres respuestas del motor como texto accesible`, JSON.stringify(V.ans) === JSON.stringify(E.qs.map(x => x.a)), V.ans);
      ok(`${T} · V2 con JS no se muestra la alternativa estática`, V.stat === 'none', V.stat);
      ok(`${T} · V2 arco de Salud sólo con la captura de escritorio`, V.arcVis === desk, V.arcVis);
      ok(`${T} · ACABADO marco azul discreto en reposo (Intelligence)`, /rgba\(110, 160, 255, 0\.3\)/.test(V.frame), V.frame);
      ok(`${T} · HERO copy aprobado literal intacto (título y subtítulo)`, m.h1t.replace(/\s+/g, ' ').trim() === (E.h1 + E.h1b) && m.subT === E.sub, { h1: m.h1t, sub: m.subT });
      ok(`${T} · RADAR sin pie exterior; nota «${E.radar}» dentro de su tarjeta, legible (≥12 px), sólo con la captura de escritorio`,
        !V.rn.cap && V.rn.t === E.radar && (desk ? (V.rn.vis && V.rn.inImg && V.rn.fs >= 12) : !V.rn.vis), V.rn);
      ok(`${T} · V2 móvil/tablet: Factores y Explora reales bajo la cabecera; escritorio: pantalla completa`, V.mMore === !desk, V.mMore);
      if (!desk) ok(`${T} · V2 móvil legible: la captura a ≥0,85 de su escala`, V.imgW / 378 >= 0.85, +(V.imgW / 378).toFixed(3));
      ok(`${T} · V2 la conclusión empieza en el primer pantallazo de la sección`, V.imgTopInSection + 72 < m.H, { top: Math.round(V.imgTopInSection), H: m.H });
      // PREMIUM · dos modalidades visibles, anual primero y destacado, una sola lista.
      const P = m.plans;
      ok(`${T} · P 69,99/año y 7,99/mes visibles sin interactuar`, P.y === E.year && P.m === E.month && P.yR && P.yR.h > 0 && P.mR && P.mR.h > 0, P);
      ok(`${T} · P anual primero, destacado (botón principal) y botones «${E.ctaY}» / «${E.ctaM}»`, P.firstIsYear && P.yPrimary && P.ctaY === E.ctaY && P.ctaM === E.ctaM, P);
      ok(`${T} · P una sola lista de funciones Premium`, P.lists === 1, P.lists);
      const P2 = m.plans2;
      if (P2.cw >= 380) ok(`${T} · P escritorio compacto: Anual y Mensual en dos columnas (Anual primero), precios y botones alineados, funciones debajo`, P2.cols && P2.yearLeft && P2.btnRow && P2.priceRow && P2.featsBelow, P2);
      else ok(`${T} · P anchura insuficiente: modalidades apiladas (Anual arriba)`, P2.stacked && !P2.cols, P2);
      ok(`${T} · P Free sin estirar (sin hueco artificial bajo su contenido)`, P2.freeGap <= 40, P2.freeGap);
      ok(`${T} · F eliminados: registro del menú móvil, ampliación de Market, pasos, bloque Free, foto, pie de demo, nota, pie del hero, «Cómo empezar»`, Object.values(m.gone).every(v => !v), m.gone);
      ok(`${T} · F «Cartera de demostración» no se repite en el texto`, m.demoMentions === 0, m.demoMentions);
      ok(`${T} · C enlace «Ver análisis»: #intelligence, misma pestaña, rótulo del idioma, área ≥44 px, dentro de la imagen`,
        m.hot.href === '#intelligence' && !m.hot.target && m.hot.aria === E.hot && m.hot.hit >= 44 && m.hot.r.l >= m.heroR.l && m.hot.r.r <= m.heroR.r && m.hot.r.t >= m.heroR.t && m.hot.r.b <= m.heroR.b, m.hot);
      if (w <= 860) {
        const g = m.mob.eye.t - m.mob.hdr.b, c1 = m.cta1, c2 = m.cta2, mid = x => (x.l + x.r) / 2;
        ok(`${T} · MÓVIL hueco cabecera → antetítulo ≈32 px`, g >= 28 && g <= 36, g);
        ok(`${T} · MÓVIL botones del hero centrados, mismo ancho ≤280 px, 48–56 px de alto, texto 16 px, 10–12 px de separación`,
          Math.abs(mid(c1) - w / 2) <= 1 && Math.abs(mid(c2) - w / 2) <= 1 && Math.abs(c1.w - c2.w) <= 0.5 && c1.w <= 280.5 && c1.h >= 48 && c1.h <= 56 && c2.h >= 48 && m.mob.ctaFs >= 15.5 && (c2.t - c1.b) >= 10 && (c2.t - c1.b) <= 12.5, { c1, c2, fs: m.mob.ctaFs });
      }
      ok(`${T} · 17 la esfera pasa por DEBAJO de la cabecera (nunca la tapa)`, m.zOrb < m.zHeader, { orb: m.zOrb, header: m.zHeader });
      ok(`${T} · 6 enlaces a la app con lang/langhint e intent Premium`, m.appLinks.length >= 4 && m.appLinks.every(a => /[?&](lang|langhint)=(es|en)/.test(a.href) && (a.premium ? /intent=premium/.test(a.href) : !/intent=/.test(a.href))), m.appLinks);
      ok(`${T} · P cada modalidad lleva su plan=annual|monthly y el CTA gratuito ninguno`, m.appLinks.filter(a => a.premium).map(a => (a.href.match(/[?&]plan=(\w+)/) || [])[1]).join() === 'annual,monthly' && m.appLinks.filter(a => !a.premium).every(a => !/[?&]plan=/.test(a.href)), m.appLinks);
      ok(`${T} · 6 Soporte con ?lang=`, m.support.length >= 2 && m.support.every(s => s.endsWith('support.html?lang=' + lang)), m.support);
      ok(`${T} · B base del hero en el idioma activo (V3 escritorio · V4 móvil)`, new RegExp(w < 768 ? `hero-dashboard-v4-base-m-${lang}\\.jpg$` : `hero-dashboard-v3-base-${lang}(-2x)?\\.jpg$`).test(m.hero), m.hero);
      ok(`${T} · 7 todas las imágenes con width/height`, m.imgsNoDim === 0, m.imgsNoDim);
      ok(`${T} · 7 sin consultas a otros servidores por visita (sólo recursos locales y fuentes)`, !BASE.startsWith('http://127.0.0.1') || extReqs.length === 0, extReqs.slice(0, 5));
      const cls = await page.evaluate('window.__cls');
      ok(`${T} · 7 sin saltos de maquetación (CLS < 0.1)`, cls < 0.1, cls);
      const wrong = heroReqs.filter(u => !u.includes('-' + lang)).length;
      if (wrong) notes.push(`${T}: el hero pidió también ${wrong} imagen(es) del otro idioma antes del cambio`);
      ok(`${T} · 20 pie «Interface shown in Spanish» sólo en EN`, lang === 'en' ? (m.cap.vis && m.cap.t === E.cap) : !m.cap.vis, m.cap);

      // C · anclas: el primer texto del destino queda bajo la cabecera
      for (const id of ['intelligence', 'plans', 'faq']) {
        await page.evaluate(id => { location.hash = '#' + id; }, id);
        await page.evaluate(() => new Promise(res => { let last = -1, same = 0; const t0 = Date.now();
          (function tick(){ const y = scrollY; same = (y === last) ? same + 1 : 0; last = y; if (same >= 6 || Date.now() - t0 > 3000) res(); else setTimeout(tick, 50); })(); }));
        const a = await page.evaluate(id => { const hd = document.getElementById('siteHeader').getBoundingClientRect(); const t = document.getElementById(id).querySelector('h2,h3,.eyebrow,p').getBoundingClientRect(); return { hb: hd.bottom, tt: t.top }; }, id);
        ok(`${T} · C ancla #${id}`, a.tt >= a.hb - 1, a);
        await page.evaluate(() => { history.replaceState(null, '', location.pathname + location.search); window.scrollTo(0, 0); });
      }
      // K · contraste y foco
      const low = await page.evaluate(`(function(){ var C=${CONTRAST}; return ['.iv2-sub','.plan-mode-name','.plan-mode-note','.shot-caption','.trust-item p','.hero-eyebrow','.benefit-item p']
        .map(function(s){ var e=document.querySelector(s); if(!e||!e.textContent.trim()||getComputedStyle(e).display==='none') return null; var c=C(e); return c<4.5? s+':'+c.toFixed(2) : null; }).filter(Boolean); })()`);
      ok(`${T} · K contraste AA del texto secundario`, low.length === 0, low);
      if (w === 1440) {
        await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
        const foc = await page.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e); return { tag: e.tagName, ow: cs.outlineStyle, w: parseFloat(cs.outlineWidth) }; });
        ok(`${T} · K foco visible por teclado`, foc.ow !== 'none' && foc.w >= 1, foc);
      }
      if (SHOTS && (w === 390 || w === 1440) && engine === 'chromium') {
        await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(800);
        await page.screenshot({ path: join(SHOTS, `${lang}-${w}-hero.png`) });
        await page.evaluate(() => { const e = document.getElementById('intelligence'); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 72); });
        await page.waitForTimeout(1200);
        await page.screenshot({ path: join(SHOTS, `${lang}-${w}-intelligence.png`) });
        const H2 = await page.evaluate(() => document.documentElement.scrollHeight);
        await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(1500);
        await page.screenshot({ path: join(SHOTS, `${lang}-${w}-full.png`), fullPage: true });
        void H2;
      }
      await ctx.close();
    }
  }

  // G · interacciones del panel (ratón + teclado en escritorio, toques en móvil)
  for (const [w, h, touch] of [[1440, 900, false], [390, 844, true]]) {
    const T = `${engine} ${w}×${h}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch && engine === 'chromium' });
    const page = await ctx.newPage();
    await page.goto(BASE + '?lang=es', { waitUntil: 'networkidle' });
    // V2 · las tres preguntas de «Explora»: UNA abierta cada vez (como en el producto), su card real y su
    // respuesta en texto; las demás no están disponibles mientras tanto; volver a pulsar / Escape cierran.
    const st = () => page.evaluate(() => { const vis = e => !!e && e.offsetParent !== null;
      const btns = [...document.querySelectorAll('[data-iv2-toggle]')].filter(vis);
      const host = [...document.querySelectorAll('.iv2-shot, .iv2-m-explore')].find(h => [...h.querySelectorAll('[data-iv2-toggle]')].some(vis) || h.hasAttribute('data-open') && vis(h));
      const lay = [...document.querySelectorAll('.iv2-open')].filter(o => getComputedStyle(o).display !== 'none' && getComputedStyle(o).visibility === 'visible' && +getComputedStyle(o).opacity > 0.99 && vis(o.parentElement));
      const ans = [...document.querySelectorAll('.iv2-ans')].filter(a => !a.hidden && vis(a));
      return { open: host ? host.getAttribute('data-open') : null, btns: btns.map(b => b.getAttribute('data-q') + ':' + b.getAttribute('aria-expanded')),
        layers: lay.map(o => o.getAttribute('data-q') + '=' + o.currentSrc.split('/').pop() + (o.complete && o.naturalWidth ? '' : '(sin cargar)')),
        ans: ans.map(a => a.getAttribute('data-q') + '=' + [...a.querySelectorAll('p')].map(p => p.textContent.trim()).join(' | ')),
        focus: document.activeElement && document.activeElement.getAttribute('data-q') && document.activeElement.hasAttribute('data-iv2-toggle') ? document.activeElement.getAttribute('data-q') : null }; });
    const tog = async k => { const l = page.locator(`[data-iv2-toggle][data-q="${k}"]:visible`).first(); await l.scrollIntoViewIfNeeded(); if (touch) await l.tap(); else await l.click(); await page.waitForTimeout(450); };
    // Relativo a la propia demostración (la cabecera sticky de móvil cambia de alto al desplazar y movería todo).
    const orbAt = () => page.evaluate(() => { const f = document.getElementById('intelDemo').getBoundingClientRect(), r = document.querySelector('.lp-orb-slot').getBoundingClientRect();
      return [Math.round(r.left - f.left), Math.round(r.top - f.top), Math.round(r.width), Math.round(f.height)]; });
    let s = await st();
    ok(`${T} · V2 al cargar: tres preguntas cerradas, ninguna capa ni respuesta`, s.open === null && s.btns.join() === '1:false,2:false,3:false' && !s.layers.length && !s.ans.length, s);
    const orb0 = await orbAt();
    for (const k of [1, 2, 3]) {
      await tog(k); await page.waitForTimeout(250); s = await st();
      const E2 = EXPECT.es.qs[k - 1];
      ok(`${T} · V2 pregunta ${k}: abre su card real y su respuesta exacta; las otras no están disponibles`,
        s.open === String(k) && s.btns.join() === `${k}:true` && s.layers.length === 1 && s.layers[0].startsWith(k + '=intelligence-v2-' + (w < 1024 ? 'm-explore-' : '') + 'open' + k + '-es') && !/sin cargar/.test(s.layers[0])
        && s.ans.length === 1 && s.ans[0] === k + '=' + E2.a.join(' | '), s);
      ok(`${T} · V2 pregunta ${k}: abrir no mueve la esfera ni la demostración`, JSON.stringify(await orbAt()) === JSON.stringify(orb0), { before: orb0, after: await orbAt() });
      await tog(k); s = await st();
      ok(`${T} · V2 pregunta ${k}: volver a pulsar la cierra`, s.open === null && s.btns.join() === '1:false,2:false,3:false' && !s.ans.length, s);
    }
    // Respuesta larga: se desplaza dentro (rueda / teclado / dedo) y, al final, el desplazamiento vuelve a la página.
    { await tog(1); const a = page.locator('.iv2-ans[data-q="1"]:visible');
      const m0 = await a.evaluate(e => ({ sh: e.scrollHeight, ch: e.clientHeight, fs: parseFloat(getComputedStyle(e).fontSize) }));
      ok(`${T} · V2 texto de la respuesta legible (≥13 px)`, m0.fs >= 13, m0);
      if (m0.sh > m0.ch + 1) {
        const bb = await a.boundingBox(); await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
        if (!touch) { await page.mouse.wheel(0, 60); await page.waitForTimeout(300); }
        else { await a.evaluate(e => { e.scrollTop = 0; }); await page.evaluate(([x, y]) => window.__tp = [x, y], [bb.x, bb.y]); await a.evaluate(e => e.scrollBy(0, 60)); await page.waitForTimeout(200); }
        const t1 = await a.evaluate(e => e.scrollTop);
        await a.focus(); await page.keyboard.press('End'); await page.waitForTimeout(250);
        const t2 = await a.evaluate(e => ({ top: e.scrollTop, max: e.scrollHeight - e.clientHeight }));
        ok(`${T} · V2 respuesta larga: se desplaza dentro (${touch ? 'gesto' : 'rueda'} y teclado)`, t1 > 0 && t2.top >= t2.max - 1, { t1, t2 });
        if (!touch) { const y0 = await page.evaluate(() => scrollY); await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.wheel(0, 400); await page.waitForTimeout(500);
          ok(`${T} · V2 al final de la respuesta el desplazamiento vuelve a la página (no se bloquea)`, (await page.evaluate(() => scrollY)) > y0 + 50, { y0 }); }
      } else notes.push(`${T}: la respuesta 1 cabe sin desplazamiento (${m0.sh}/${m0.ch})`);
      await tog(1); }
    if (!touch) {
      await page.locator('[data-iv2-toggle][data-q="2"]:visible').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300); s = await st();
      const foc = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
      ok(`${T} · V2 teclado: Enter abre la pregunta 2 y el foco es visible`, s.open === '2' && foc !== 'none', { s, foc });
      await page.keyboard.press('Escape'); await page.waitForTimeout(300); s = await st();
      ok(`${T} · V2 teclado: Escape cierra y devuelve el foco a su control`, s.open === null && s.focus === '2', s);
      await tog(3); await page.click('.site-header .lang-btn[data-lang="en"]'); await page.waitForTimeout(600); s = await st();
      ok(`${T} · V2 cambio de idioma con una respuesta abierta: card y respuesta en EN`, s.layers.length === 1 && /open3-en/.test(s.layers[0]) && s.ans[0] === '3=' + EXPECT.en.qs[2].a.join(' | '), s);
      await page.click('.site-header .lang-btn[data-lang="es"]'); await page.waitForTimeout(400); s = await st();
      ok(`${T} · V2 y de vuelta a ES sin restos del inglés`, /open3-es/.test(s.layers[0] || '') && s.ans[0] === '3=' + EXPECT.es.qs[2].a.join(' | '), s);
      await tog(3);
    }
    // ARCO DE SALUD (escritorio): se dibuja UNA vez al entrar en pantalla, ≈1 s, y termina en su valor.
    if (w >= 1024) {
      const ap = await browser.newPage({ viewport: { width: w, height: h } });
      await ap.goto(BASE + '?lang=es', { waitUntil: 'networkidle' });
      const arc = () => ap.evaluate(() => { const fg = document.querySelector('.iv2-arc-fg'); return { off: parseFloat(getComputedStyle(fg).strokeDashoffset), armed: fg.classList.contains('is-armed'), run: fg.classList.contains('is-run'),
        want: 326.726 * (1 - parseFloat(getComputedStyle(document.querySelector('.iv2-arc')).getPropertyValue('--iv2-arc-frac'))), color: getComputedStyle(fg).stroke }; });
      const a0 = await arc();
      await ap.evaluate(() => { const f = document.getElementById('intelDemo'); scrollTo(0, f.getBoundingClientRect().top + scrollY - 120); });
      await ap.waitForTimeout(450); const a1 = await arc(); await ap.waitForTimeout(1300); const a2 = await arc();
      await ap.evaluate(() => scrollTo(0, 0)); await ap.waitForTimeout(400); await ap.evaluate(() => { const f = document.getElementById('intelDemo'); scrollTo(0, f.getBoundingClientRect().top + scrollY - 120); }); await ap.waitForTimeout(300); const a3 = await arc();
      ok(`${T} · SALUD arco: vacío antes de verse, se dibuja al entrar y termina en su valor (≈1 s)`, a0.armed && a0.off > 326 && a1.off < 326 && a1.off > a2.off + 1 && Math.abs(a2.off - a2.want) < 0.6, { a0, a1, a2 });
      ok(`${T} · SALUD arco: una sola vez (no se reinicia al subir y bajar)`, !a3.armed && Math.abs(a3.off - a3.want) < 0.6, a3);
      ok(`${T} · SALUD arco: color semántico del estado «A vigilar» (naranja)`, a2.color === 'rgb(230, 132, 60)', a2.color);
      await ap.close();
    }
    // C · «Ver análisis» en la imagen y «Descubrir Intelligence» llegan a Intelligence sin ocultar el título
    for (const sel of ['.hero-hotspot', '.hero-cta .btn-ghost']) {
      await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);
      const pagesBefore = ctx.pages().length, urlBefore = page.url().split('#')[0];
      if (touch) await page.locator(sel).tap(); else await page.locator(sel).click();
      await page.evaluate(() => new Promise(res => { let last = -1, same = 0; const t0 = Date.now();
        (function tick(){ const y = scrollY; same = (y === last) ? same + 1 : 0; last = y; if (same >= 8 || Date.now() - t0 > 4000) res(); else setTimeout(tick, 50); })(); }));
      const a = await page.evaluate(() => { const hd = document.getElementById('siteHeader').getBoundingClientRect(); const t = document.querySelector('#intelligence .section-title').getBoundingClientRect(); return { hb: hd.bottom, tt: t.top, hash: location.hash }; });
      ok(`${T} · C ${sel} → título de Intelligence visible bajo la cabecera, misma página`, a.hash === '#intelligence' && a.tt >= a.hb && a.tt < h * 0.6 && ctx.pages().length === pagesBefore && page.url().split('#')[0] === urlBefore, a);
      if (sel === '.hero-cta .btn-ghost') {
        await page.waitForTimeout(1500);
        const o = await page.evaluate(ORB);
        ok(`${T} · H fase 1: al aterrizar la esfera sigue en su hueco`, Math.abs(o.dx) < 3 && Math.abs(o.dy) < 3 && o.vis, o);
      }
    }
    await ctx.close();
  }

  // H/I/J · recorrido de la esfera en escritorio
  for (const [w, h] of [[1440, 900], [1920, 1080]]) {
    if (engine === 'webkit' && w === 1920) continue;
    const T = `${engine} ${w}×${h}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto(BASE + '?lang=es', { waitUntil: 'networkidle' });
    const G = await geom(page);
    const start = G.intel.t - 72, end = G.trk.t + 0.2 * h;
    const samples = [];
    for (let y = start; y <= end; y += 18) { await scrollTo(page, y); await settle(page, 70); samples.push(await page.evaluate(ORB)); }
    await page.waitForTimeout(900); samples.push(await page.evaluate(ORB));
    const hitsF = samples.filter(s => s.hits.length);
    ok(`${T} · I bajando: la esfera no pisa texto, botones ni enlaces`, hitsF.length === 0, hitsF.slice(0, 3).map(s => ({ sy: s.sy, hits: s.hits })));
    const right = samples.filter(s => s.vis && s.cx > s.contR + 10), left = samples.filter(s => s.vis && s.cx < s.contL - 10);
    ok(`${T} · H fase 2: se desprende hacia el margen derecho`, right.length > 0, samples.length);
    ok(`${T} · V3 el electrocardiograma se ve en todo el vuelo`, samples.filter(s => s.vis).every(s => s.ecg), samples.filter(s => s.vis && !s.ecg).length);
    ok(`${T} · H fase 4: acompaña los beneficios en el margen izquierdo`, left.length >= 5, left.length);
    // un único looping: en el margen derecho la x se aparta del eje del recorrido y vuelve
    const rx = right.map(s => s.cx), span = rx.length ? Math.max(...rx) - Math.min(...rx) : 0;
    ok(`${T} · H fase 3: hace el looping en el margen derecho`, span >= 12, { span });
    const lastS = samples[samples.length - 1];
    ok(`${T} · H fase 5: se despide antes de Seguimiento`, !lastS.vis, lastS);
    ok(`${T} · L sin desbordamiento horizontal durante el vuelo`, samples.every(s => s.ovx <= 0), samples.filter(s => s.ovx > 0).slice(0, 3).map(s => ({ sy: s.sy, ovx: s.ovx, cx: Math.round(s.cx), w: Math.round(s.w), vw: s.vw })));
    // reverso
    const back = [];
    for (let y = end; y >= start; y -= 18) { await scrollTo(page, y); await settle(page, 70); back.push(await page.evaluate(ORB)); }
    await page.waitForTimeout(3500); const home = await page.evaluate(ORB);
    const hitsB = back.filter(s => s.hits.length);
    ok(`${T} · I subiendo: la esfera no pisa texto, botones ni enlaces`, hitsB.length === 0, hitsB.slice(0, 3).map(s => ({ sy: s.sy, hits: s.hits })));
    ok(`${T} · H fase 6: vuelve a su hueco`, Math.abs(home.dx) < 3 && Math.abs(home.dy) < 3 && home.vis, home);
    // el looping no se repite con pequeñas oscilaciones: pasado el giro, se oscila DENTRO de su tramo
    const st = () => page.evaluate(() => document.querySelector('.lp-orb').__lp.state());
    let S = await st();
    const ease = u => u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    const qOf = e => { let lo = 0, hi = 1; for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (ease(mid) < e) lo = mid; else hi = mid; } return lo; };
    const sOf = q => S.s0 + q * (S.s1 - S.s0);
    for (let y = S.s0; y <= sOf(qOf(S.loopB + 0.05)); y += 14) { await scrollTo(page, y); await settle(page, 70); }
    await scrollTo(page, sOf(qOf(S.loopB + 0.05)));   // el último paso de 14 px puede quedarse antes del objetivo: se llega exacto
    await page.waitForTimeout(1500);
    S = await st();
    const loopedOnce = S.loopDone;
    const osc = [];
    for (let k = 0; k < 4; k++) for (const e of [S.loopA + 0.25 * (S.loopB - S.loopA), S.loopA + 0.75 * (S.loopB - S.loopA)]) {
      await scrollTo(page, sOf(qOf(e))); await page.waitForTimeout(800); osc.push({ o: await page.evaluate(ORB), s: await st() });
    }
    ok(`${T} · H el looping no se repite al oscilar el scroll sobre su tramo`, loopedOnce && osc.every(x => x.s.loopDone && Math.abs(x.o.cx - x.s.RG) < 3 && !x.o.hits.length),
      { loopedOnce, xs: osc.map(x => Math.round(x.o.cx)), RG: Math.round(S.RG), hits: osc.flatMap(x => x.o.hits) });
    // evasión del ratón en la fase de acompañamiento (se busca por estado: margen izquierdo, quieta)
    const findLeft = async () => { const g = await geom(page); let o = null;
      for (let y = g.ben.t - 0.7 * h; y <= g.trk.t; y += 30) { await scrollTo(page, y); await page.waitForTimeout(90); o = await page.evaluate(ORB); if (o.vis && o.cx < o.contL - 10 && o.op > 0.95) break; }
      let a = await page.evaluate(ORB);
      // quieta DE VERDAD (≤3 px en 250 ms): con 14 px se aceptaba una esfera que aún alcanzaba su sitio (WebKit) y se medía esa deriva
      for (let k = 0; k < 40; k++) { await page.waitForTimeout(250); const b = await page.evaluate(ORB); if (Math.hypot(b.cx - a.cx, b.cy - a.cy) <= 3) return b; a = b; }
      return a; };
    let o1 = await findLeft();
    if (o1.vis && o1.cx < o1.contL) {
      await page.mouse.move(o1.cx + 18, o1.cy + 4); await page.waitForTimeout(600);
      const o2 = await page.evaluate(ORB);
      ok(`${T} · 16 ratón: se aparta del puntero sin pisar texto ni salir de pantalla`, Math.hypot(o2.cx - o1.cx, o2.cy - o1.cy) >= 6 && !o2.hits.length && o2.cx > 0, { o1: [o1.cx, o1.cy], o2: [o2.cx, o2.cy], hits: o2.hits });
      await page.mouse.move(w / 2, h - 20); await page.waitForTimeout(2600);
      const o3 = await page.evaluate(ORB);
      ok(`${T} · 16 ratón: después recupera su trayectoria`, Math.hypot(o3.cx - o1.cx, o3.cy - o1.cy) < 14, { o1: [o1.cx, o1.cy], o3: [o3.cx, o3.cy] });
    } else ok(`${T} · 16 ratón: esfera visible en el margen izquierdo para probar la evasión`, false, o1);
    // J · cambio de idioma y de tamaño a mitad del recorrido
    await page.click('.site-header .lang-btn[data-lang="en"]'); await page.waitForTimeout(1200);
    const oL = await page.evaluate(ORB);
    ok(`${T} · J tras cambiar a EN sigue sin pisar contenido`, !oL.hits.length, oL.hits);
    await page.setViewportSize({ width: 900, height: 900 }); await page.waitForTimeout(1800);
    const G2 = await geom(page);
    const narrow = [];
    for (let y = G2.intel.t - 72; y <= G2.trk.t; y += 40) { await scrollTo(page, y); await settle(page, 60); narrow.push(await page.evaluate(ORB)); }
    ok(`${T} · J ventana estrecha (900 px): se queda en su hueco con movimiento local`, narrow.every(s => Math.abs(s.dx) < 14 && Math.abs(s.dy) < 14 && !s.hits.length), narrow.filter(s => Math.abs(s.dx) >= 14 || s.hits.length).slice(0, 2));
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(1200);
    const G3 = await geom(page);
    void G3; const oR = await findLeft();
    ok(`${T} · J al volver a ${w} px recalcula y retoma el margen izquierdo`, oR.vis && oR.cx < oR.contL && !oR.hits.length, oR);
    await ctx.close();
  }

  // H/I · móvil y tablet: sin vuelo, en su hueco, sin tapar nada; un toque da un impulso corto
  for (const [w, h] of [[390, 844], [768, 1024]]) {
    const T = `${engine} ${w}×${h}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: engine === 'chromium' });
    const page = await ctx.newPage();
    await page.goto(BASE + '?lang=en', { waitUntil: 'networkidle' });
    const G = await geom(page), all = [];
    for (let y = G.intel.t - 72; y <= G.trk.t; y += 36) { await scrollTo(page, y); await settle(page, 60); all.push(await page.evaluate(ORB)); }
    ok(`${T} · H móvil: la esfera no vuela ni tapa contenido`, all.every(s => Math.abs(s.dx) < 14 && Math.abs(s.dy) < 14 && !s.hits.length), all.filter(s => Math.abs(s.dx) >= 14 || s.hits.length).slice(0, 2));
    await page.evaluate(() => { const e = document.querySelector('.lp-orb-slot'); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 200); }); await page.waitForTimeout(600);
    const before = await page.evaluate(ORB);
    await page.touchscreen.tap(before.cx, before.cy); await page.waitForTimeout(120);
    const kicked = await page.evaluate(ORB); await page.waitForTimeout(2200);
    const rest = await page.evaluate(ORB);
    ok(`${T} · 16 toque en la esfera: movimiento corto y vuelve`, Math.hypot(kicked.dx, kicked.dy) >= 2 && Math.hypot(kicked.dx, kicked.dy) < 16 && Math.hypot(rest.dx, rest.dy) < 2, { kicked: [kicked.dx, kicked.dy], rest: [rest.dx, rest.dy] });
    const sy0 = await page.evaluate(() => scrollY);
    await page.evaluate(() => window.scrollBy(0, 300)); await page.waitForTimeout(200);
    ok(`${T} · 16 el scroll sigue libre tras tocar la esfera`, (await page.evaluate(() => scrollY)) > sy0 + 200);
    await ctx.close();
  }

  // V3 · entrada del dashboard del hero: una vez, coordinada, estado final exacto, idioma al vuelo
  { const T = `${engine} V3 hero`;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage();
    await page.goto(BASE + '?lang=es', { waitUntil: 'domcontentloaded' });
    const hs = () => page.evaluate(() => ({ val: document.querySelector('.hero-val').textContent, vis: getComputedStyle(document.querySelector('.hero-val')).visibility,
      clip: document.querySelector('.hero-curve').style.clipPath, mask: document.querySelector('.hero-donut').style.maskImage, t: performance.now(),
      cta: !!document.querySelector('.hero-cta .btn-primary') && getComputedStyle(document.querySelector('.hero-cta .btn-primary')).pointerEvents !== 'none' }));
    await page.waitForFunction(() => document.documentElement.classList.contains('lp-armed'), null, { timeout: 5000 });
    await page.waitForTimeout(380); const mid = await hs();
    await page.waitForTimeout(1500); const end = await hs();
    ok(`${T} · se anima: la cifra cuenta, la curva y el donut se revelan`, mid.val !== '186.055,38\u00a0US$' && /inset/.test(mid.clip) && /conic/.test(mid.mask) && mid.cta, mid);
    ok(`${T} · termina exacto: 186.055,38 US$, curva y donut completos`, end.val === '186.055,38\u00a0US$' && !end.clip && !end.mask && end.vis === 'visible', end);
    await scrollTo(page, 1600); await page.waitForTimeout(400); await scrollTo(page, 0); await page.waitForTimeout(500);
    const again = await hs();
    ok(`${T} · no se repite al volver a subir`, again.val === end.val && !again.clip && !again.mask, again);
    await ctx.close();
    // idioma durante la animación: la cifra se resuelve al instante en el formato del nuevo idioma
    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const p2 = await ctx2.newPage();
    await p2.goto(BASE + '?lang=es', { waitUntil: 'domcontentloaded' });
    await p2.waitForFunction(() => document.documentElement.classList.contains('lp-armed'), null, { timeout: 5000 }); await p2.waitForTimeout(250);
    await p2.click('.site-header .lang-btn[data-lang="en"]'); await p2.waitForTimeout(60);
    const sw = await p2.evaluate(() => ({ val: document.querySelector('.hero-val').textContent, clip: document.querySelector('.hero-curve').style.clipPath, mask: document.querySelector('.hero-donut').style.maskImage, img: document.querySelector('.hero-base').currentSrc.split('/').pop() }));
    ok(`${T} · cambio de idioma durante la entrada: cifra final en EN al instante`, sw.val === '$186,055.38' && !sw.clip && !sw.mask, sw);
    await ctx2.close(); }
  // V3 · alineación: base + capas + cifra HTML == captura completa de la misma sesión (misma caja)
  for (const lang of ['es', 'en']) for (const [w, h, m] of [[1440, 900, false], [390, 1700, true]]) {
    const T = `${engine} V3 alineación ${lang} ${w}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 }); const page = await ctx.newPage();
    await page.goto(BASE + '?lang=' + lang, { waitUntil: 'networkidle' }); await page.waitForTimeout(2200);
    const el = await page.$('#heroShot'); const A = await el.screenshot();
    const ref = m ? `assets/hero-dashboard-v4-full-m-${lang}.jpg` : `assets/hero-dashboard-v3-full-${lang}-2x.jpg`;
    await page.evaluate(src => { const sh = document.getElementById('heroShot'); sh.querySelectorAll('.hero-layer, .hero-val').forEach(e => e.style.visibility = 'hidden');
      sh.querySelectorAll('picture source').forEach(x => x.srcset = src); const im = sh.querySelector('.hero-base'); im.srcset = src; im.src = src; }, ref);
    await page.waitForTimeout(1000); const B = await el.screenshot();
    const d = await page.evaluate(async ([a64, b64]) => { const load = s2 => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s2; });
      const a = await load('data:image/png;base64,' + a64), b = await load('data:image/png;base64,' + b64); const W = a.width, H = a.height;
      const g = i => { const c = new OffscreenCanvas(W, H); const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, W, H).data; };
      const d1 = g(a), d2 = g(b); let sum = 0, big = 0; for (let i = 0; i < d1.length; i += 4) { const v = (Math.abs(d1[i] - d2[i]) + Math.abs(d1[i+1] - d2[i+1]) + Math.abs(d1[i+2] - d2[i+2])) / 3; sum += v; if (v > 48) big++; }
      return { mean: +(sum / (W * H)).toFixed(2), bigPct: +(big / (W * H) * 100).toFixed(3) }; }, [A.toString('base64'), B.toString('base64')]);
    ok(`${T} · capas alineadas sin duplicados ni costuras (≈ captura completa)`, d.mean < 2 && d.bigPct < 1, d);
    await ctx.close();
  }
  // V3 · scroll rápido: el hero termina completo (la entrada animada de Intelligence se retiró con su panel).
  {
    // scroll rápido: nada queda atascado ni a medias
    const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true }); const p3 = await c3.newPage();
    await p3.goto(BASE + '?lang=en', { waitUntil: 'networkidle' });
    for (const y of [700, 1600, 2600, 4000, 9000]) { await scrollTo(p3, y); await p3.waitForTimeout(40); }
    await p3.waitForTimeout(1500); await scrollTo(p3, 0); await p3.waitForTimeout(1700);
    await p3.evaluate(() => { const e = document.getElementById('intelDemo'); scrollTo(0, e.getBoundingClientRect().top + scrollY - 100); }); await p3.waitForTimeout(1500);
    const fr = await p3.evaluate(() => ({ val: document.querySelector('.hero-val').textContent, clip: document.querySelector('.hero-curve').style.clipPath, base: document.querySelector('.iv2-base').complete }));
    ok(`${engine} V3 · scroll rápido: hero completo e Intelligence cargada`, fr.val === '$186,055.38' && !fr.clip && fr.base, fr);
    await c3.close(); }

  // ACABADO · el MISMO tratamiento exterior del Dashboard en las cinco (reposo y hover), estáticas sin enlace ni zoom.
  { const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage();
    await page.goto(BASE + '?lang=es', { waitUntil: 'networkidle' });
    const SEL = { dashboard: '#heroShot', intelligence: '.iv2-shot', seguimiento: '#tracking .shot-fig:not(.how-market-fig)', market: '.how-market-fig', workspace: '#workspace .shot-fig, .section--how2 .shot-fig:not(.how-market-fig):last-of-type' };
    const look = async (sel, hover) => { const l = page.locator(sel).first(); await l.scrollIntoViewIfNeeded(); if (hover) { const b = await l.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + 8); } else await page.mouse.move(2, 2);
      await page.waitForTimeout(450); return l.evaluate(e => { const c = getComputedStyle(e); return { sh: c.boxShadow, bg: c.backgroundColor, r: c.borderRadius, tr: c.transitionDuration + ' ' + c.transitionProperty,
        cur: getComputedStyle(e.querySelector('img') || e).cursor, link: !!e.querySelector('a:not(.hero-hotspot)') }; }); };
    const ref = { rest: await look(SEL.dashboard, false), hover: await look(SEL.dashboard, true) };
    for (const [k, sel] of Object.entries(SEL)) {
      const a = await look(sel, false), b = await look(sel, true);
      ok(`${engine} · ACABADO ${k}: idéntico al Dashboard en reposo y al pasar el ratón (fondo, borde, difuminado, brillo, transición)`,
        a.sh === ref.rest.sh && b.sh === ref.hover.sh && a.bg === ref.rest.bg && a.r === ref.rest.r && a.tr === ref.rest.tr && a.sh !== b.sh, { a, b, ref });
      if (k === 'seguimiento' || k === 'market' || k === 'workspace') ok(`${engine} · ACABADO ${k}: imagen estática con cursor normal, sin enlace ni zoom`, a.cur === 'auto' || a.cur === 'default' ? !a.link : false, a);
    }
    await ctx.close(); }
  // K · movimiento reducido: esfera estática en su hueco en todo el recorrido
  { const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }); const page = await ctx.newPage();
    await page.goto(BASE + '?lang=es', { waitUntil: 'networkidle' });
    const an = await page.evaluate(() => ['.lp-orb-glow', '.lp-orb-ring--1', '.lp-orb-ring--2', '.lp-orb-swirl', '.lp-orb-ecg path'].map(s => getComputedStyle(document.querySelector(s)).animationName));
    const G = await geom(page), all = [];
    for (let y = G.intel.t - 72; y <= G.trk.t + 200; y += 60) { await scrollTo(page, y); await settle(page, 80); all.push(await page.evaluate(ORB)); }
    await scrollTo(page, 0); await page.waitForTimeout(150);
    const rmH = await page.evaluate(() => ({ val: document.querySelector('.hero-val').textContent, clip: document.querySelector('.hero-curve').style.clipPath, mask: document.querySelector('.hero-donut').style.maskImage }));
    ok(`${engine} · K movimiento reducido: hero con sus valores finales directamente`, rmH.val === '186.055,38\u00a0US$' && !rmH.clip && !rmH.mask, rmH);
    await page.locator('[data-iv2-toggle][data-q="2"]:visible').scrollIntoViewIfNeeded(); await page.locator('[data-iv2-toggle][data-q="2"]:visible').click(); await page.waitForTimeout(30);
    const rmI = await page.evaluate(() => { const o = document.querySelector('.iv2-shot .iv2-open[data-q="2"]'); const cs = getComputedStyle(o); const a = document.getElementById('iv2dA2');
      const fg = document.querySelector('.iv2-arc-fg'), fcs = getComputedStyle(fg); return { op: cs.opacity, tr: cs.transitionDuration, ans: !a.hidden, armed: fg.classList.contains('is-armed'), off: parseFloat(fcs.strokeDashoffset),
        want: 326.726 * (1 - parseFloat(getComputedStyle(document.querySelector('.iv2-arc')).getPropertyValue('--iv2-arc-frac'))) }; });
    ok(`${engine} · K movimiento reducido: las preguntas funcionan y la card cambia sin transición`, rmI.op === '1' && /^0s(, 0s)*$/.test(rmI.tr) && rmI.ans, rmI);
    ok(`${engine} · K movimiento reducido: arco de Salud con su valor final, sin animación`, !rmI.armed && Math.abs(rmI.off - rmI.want) < 0.6, rmI);
    ok(`${engine} · K movimiento reducido: sin animación y estática en su hueco`, an.every(a => a === 'none') && all.every(s => Math.abs(s.dx) < 0.5 && Math.abs(s.dy) < 0.5), { an, moved: all.filter(s => Math.abs(s.dx) >= 0.5).length });
    await ctx.close(); }
  // K · sin JS: legible y navegable
  { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false }); const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'load' });
    const r = await page.evaluate(() => ({ hidden: [...document.querySelectorAll('.reveal')].filter(e => getComputedStyle(e).opacity !== '1').length,
      hero: document.querySelector('.hero-visual img').currentSrc.split('/').pop(),
      hot: document.querySelector('.hero-hotspot').getAttribute('href'),
      iv2: document.querySelector('.iv2-base').currentSrc.split('/').pop(),
      iv2Q: [...document.querySelectorAll('[data-iv2-toggle]')].filter(b => b.offsetParent !== null).length, iv2Ans: [...document.querySelectorAll('.iv2-ans')].every(a => a.hidden),
      stat: [...document.querySelectorAll('.iv2-static-item')].filter(e => e.offsetParent !== null).map(e => e.innerText.replace(/\s+/g, ' ').trim()),
      otherBtns: [...document.querySelectorAll('button:not([data-iv2-toggle])')].filter(b => !b.hidden).length,
      orb: document.querySelectorAll('.iv2-shot .lp-orb').length,
      val: document.querySelector('.hero-val').textContent, valVis: getComputedStyle(document.querySelector('.hero-val')).visibility, clip: getComputedStyle(document.querySelector('.hero-curve')).clipPath,
    }));
    ok(`${engine} · K sin JS: nada oculto, hero EN completo (cifra, curva) y enlace a Intelligence`, r.hidden === 0 && /hero-dashboard-v4-base-m-en/.test(r.hero) && r.hot === '#intelligence'
      && r.val === '$186,055.38' && r.valVis === 'visible' && (r.clip === 'none' || r.clip === ''), r);
    ok(`${engine} · K sin JS: Intelligence real, esfera en su hueco, sin el control añadido y con los demás botones`, /intelligence-v2-m-head-en/.test(r.iv2) && r.iv2Q === 0 && r.iv2Ans === true && r.otherBtns > 0 && r.orb === 1, r);
    ok(`${engine} · K sin JS: las tres preguntas con su respuesta, en texto`, r.stat.length === 3 && EXPECT.en.qs.every((x, k) => r.stat[k] === [x.q, ...x.a].join(' ')), r.stat);
    await ctx.close(); }
  await browser.close();
}
if (notes.length) { console.log('\nNotas (no bloquean):'); [...new Set(notes.map(n => n.replace(/^(\w+) (es|en) \d+×\d+: /, '$2: ')))].forEach(n => console.log('  · ' + n)); }
console.log(`\n${pass} comprobaciones OK · ${fails.length} fallo(s)`);
console.log(fails.length ? 'RESULT: NO-GO' : 'RESULT: GO');
process.exitCode = fails.length ? 1 : 0;
}

// Grabación del recorrido (vídeo): scroll real de una persona, escritorio y móvil.
async function record() {
  await mkdir(RECORD, { recursive: true });
  const browser = await PWm.chromium.launch(launchArgs);
  for (const [name, w, h, touch] of [['escritorio-1440', 1440, 900, false], ['movil-390', 390, 844, true]]) {
    const dir = join(RECORD, '.' + name); await mkdir(dir, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, recordVideo: { dir, size: { width: w, height: h } } });
    const page = await ctx.newPage();
    await page.goto(BASE + '?lang=es', { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
    if (touch) await page.locator('.hero-cta .btn-ghost').tap(); else await page.locator('.hero-cta .btn-ghost').click();
    await page.waitForTimeout(2200);
    if (!touch) { const o = await page.evaluate(ORB); await page.mouse.move(o.cx + 40, o.cy + 60, { steps: 12 }); await page.waitForTimeout(800); }
    const G = await geom(page);
    for (let y = G.intel.t - 72; y <= G.trk.t + 0.3 * h; y += 6) { await scrollTo(page, y); await page.waitForTimeout(16); }
    await page.waitForTimeout(1200);
    if (!touch) {
      await scrollTo(page, G.ben.t - 0.4 * h); await page.waitForTimeout(1500);
      const o = await page.evaluate(ORB); await page.mouse.move(o.cx + 20, o.cy, { steps: 8 }); await page.waitForTimeout(1200); await page.mouse.move(w / 2, h - 30, { steps: 10 }); await page.waitForTimeout(1800);
    } else {
      await page.evaluate(() => { const e = document.querySelector('.lp-orb-slot'); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 220); }); await page.waitForTimeout(800);
      const o = await page.evaluate(ORB); await page.touchscreen.tap(o.cx, o.cy); await page.waitForTimeout(1600);
    }
    for (let y = await page.evaluate(() => scrollY); y >= G.intel.t - 72; y -= 8) { await scrollTo(page, y); await page.waitForTimeout(16); }
    await page.waitForTimeout(2000);
    const v = page.video(); await ctx.close();
    const src = await v.path(); await rename(src, join(RECORD, `esfera-${name}.webm`));
  }
  await browser.close();
  console.log('Grabaciones en ' + RECORD + ': ' + (await readdir(RECORD)).filter(f => f.endsWith('.webm')).join(', '));
}
