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
        h1: 'Comprende mejor tu patrimonio.', cap: '', hot: 'Salud: A vigilar · Ver análisis en AURIX Intelligence', rest: 'Resto de la cartera financiera' },
  en: { head: 'Microsoft, Bitcoin and Apple outweigh your other 9 investments combined.', stat: 'Your 3 largest investments hold 69% of your financial portfolio.',
        h1: 'Understand your wealth better.', cap: 'Interface shown in Spanish', hot: 'Health: Worth watching · View analysis in AURIX Intelligence', rest: 'Rest of the financial portfolio' },
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
        var ws=[].slice.call(document.querySelectorAll('.ip-bars li')).map(function(li){ return parseFloat(li.style.getPropertyValue('--w')); });
        var heroImg=q('.hero-visual img'), hot=q('.hero-hotspot');
        return { ovx: document.documentElement.scrollWidth - innerWidth, H: innerHeight, lang: document.documentElement.lang,
          h1: R(q('.hero-title')), sub: R(q('.hero-sub')), cta1: R(q('.hero-cta .btn-primary')), cta2: R(q('.hero-cta .btn-ghost')),
          h1t: q('.hero-title').textContent, head: q('.ip-head').textContent, stat: norm(q('.ip-stat').getAttribute('aria-label')), rest: q('.is-rest .ip-name').textContent,
          rowLabels: [].slice.call(document.querySelectorAll('.ip-row')).map(function(b){ return b.getAttribute('aria-label'); }),
          kicker: q('.ip-kicker').textContent,
          pcts: [].slice.call(document.querySelectorAll('.ip-pct .ip-num')).map(function(e){return e.getAttribute('data-ip-final')}), ws: ws,
          fsHead: fs('.ip-head'), fsPct: fs('.ip-pct'), fsName: fs('.ip-name'), fsStat: fs('.ip-stat-pre'),
          orb: R(q('.lp-orb')), headR: R(q('.ip-head')),
          hero: heroImg ? heroImg.currentSrc.split('/').pop() : '', heroR: R(heroImg),
          hot: { href: hot.getAttribute('href'), aria: hot.getAttribute('aria-label'), r: R(hot), target: hot.getAttribute('target'), hit: parseFloat(getComputedStyle(hot, '::before').height) },
          mob: { hdr: R(q('#siteHeader')), eye: R(q('.hero-eyebrow')), kick: R(q('.ip-kicker')), slot: R(q('.lp-orb-slot')), glow: R(q('.lp-orb-glow')), headW: R(q('.ip-head')).w, inner: q('#intelDemo').clientWidth - parseFloat(getComputedStyle(q('#intelDemo')).paddingLeft) - parseFloat(getComputedStyle(q('#intelDemo')).paddingRight), ctaFs: parseFloat(getComputedStyle(q('.hero-cta .btn-primary')).fontSize) },
          zOrb: parseInt(getComputedStyle(q('.lp-orb')).zIndex, 10), zHeader: parseInt(getComputedStyle(q('#siteHeader')).zIndex, 10),
          appLinks: [].slice.call(document.querySelectorAll('[data-app-link]')).map(function(a){ return { href: a.getAttribute('href'), premium: a.getAttribute('data-app-intent')==='premium' }; }),
          headerApp: document.querySelectorAll('#siteHeader [data-app-link]').length,
          support: [].slice.call(document.querySelectorAll('[data-legal-link="support"]')).map(function(a){return a.getAttribute('href')}),
          cap: (function(){ var c=q('.how-market-fig .shot-caption'); return { t: c.textContent, vis: getComputedStyle(c).display!=='none' && c.getBoundingClientRect().height>0 }; })(),
          gone: { menuApp: !!q('#mobileMenu [data-app-link]'), marketLink: !!q('.how-market-fig a'), zoom: !!q('.how-market-fig img') && getComputedStyle(q('.how-market-fig img')).cursor === 'zoom-in', how: !!q('#how'), steps: !!q('.steps'), free: !!q('.intel-free'), photo: !!q('.ip-link') || !!q('a[href*="intelligence-full"]'), demoFoot: !!q('.ip-demo'), note: !!q('.benefit-note'), heroCap: !!q('.hero-visual .shot-caption'), navHow: !!q('a[href="#how"]') },
          demoMentions: (document.body.innerText.match(/Cartera de demostración|Demo portfolio/g) || []).length,
          imgsNoDim: [].slice.call(document.images).filter(function(i){ return !i.getAttribute('width') || !i.getAttribute('height'); }).length,
        }; })()`);

      ok(`${T} · L sin desbordamiento horizontal`, m.ovx <= 0, m.ovx);
      ok(`${T} · A H1, descripción y CTA principal en el primer pantallazo`, m.h1.b <= m.H && m.sub.b <= m.H && m.cta1.b <= m.H, { h1: m.h1.b, sub: m.sub.b, cta: m.cta1.b, H: m.H });
      if (h >= 667) ok(`${T} · A CTA secundario en el primer pantallazo`, m.cta2.b <= m.H, { cta2: m.cta2.b, H: m.H });
      ok(`${T} · A idioma activo y H1`, m.lang === lang && m.h1t.indexOf(E.h1) === 0, m.h1t);
      ok(`${T} · A cabecera sin CTA de registro`, m.headerApp === 0, m.headerApp);
      ok(`${T} · E panel con el texto del motor y 69 % junto a la conclusión`, m.head === E.head && m.stat === E.stat && m.rest === E.rest && /Premium/.test(m.kicker), { head: m.head, stat: m.stat, rest: m.rest });
      ok(`${T} · E cifras 29/22/18/31 y suma 100`, m.pcts.map(x => parseInt(x, 10)).join() === '29,22,18,31' && m.ws.reduce((a, b) => a + b, 0) === 100, { p: m.pcts, w: m.ws });
      const sufx = lang === 'es' ? '\u00a0%' : '%';
      ok(`${T} · K nombre accesible con el valor final (29/22/18/31 y 69)`, m.rowLabels.join('|') === ['Microsoft 29', 'Bitcoin 22', 'Apple 18', E.rest + ' 31'].map(x => x + sufx).join('|'), m.rowLabels);
      if (w < 768) ok(`${T} · E tamaños móviles (titular/%/frase ≥16, etiqueta ≥15)`, m.fsHead >= 16 && m.fsPct >= 16 && m.fsStat >= 16 && m.fsName >= 15, { head: m.fsHead, pct: m.fsPct, name: m.fsName, stat: m.fsStat });
      const orbMax = w >= 1024 ? 96 : (w >= 768 ? 80 : 64);
      ok(`${T} · H esfera ≤${orbMax}px y sin pisar el titular en reposo`, m.orb.w <= orbMax + 0.5 && (m.orb.l >= m.headR.r || m.orb.r <= m.headR.l || m.orb.t >= m.headR.b || m.orb.b <= m.headR.t), { orb: m.orb, head: m.headR });
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
      if (w < 768) {
        const k = m.mob.kick, sl = m.mob.slot, gl = m.mob.glow;
        ok(`${T} · MÓVIL rótulo y esfera en la misma fila sin colisión; conclusión a todo el ancho; halo sin invadir la conclusión`,
          sl.t < k.b && sl.b > k.t && sl.l - k.r >= 12 && m.mob.headW >= m.mob.inner - 4 && gl.b <= m.headR.t && gl.r <= m.H * 10, { k, sl, headW: m.mob.headW, inner: m.mob.inner, glowB: gl.b, headT: m.headR.t });
      }
      ok(`${T} · 17 la esfera pasa por DEBAJO de la cabecera (nunca la tapa)`, m.zOrb < m.zHeader, { orb: m.zOrb, header: m.zHeader });
      ok(`${T} · 6 enlaces a la app con lang/langhint e intent Premium`, m.appLinks.length >= 4 && m.appLinks.every(a => /[?&](lang|langhint)=(es|en)/.test(a.href) && (a.premium ? /intent=premium/.test(a.href) : !/intent=/.test(a.href))), m.appLinks);
      ok(`${T} · 6 Soporte con ?lang=`, m.support.length >= 2 && m.support.every(s => s.endsWith('support.html?lang=' + lang)), m.support);
      ok(`${T} · B base del hero en el idioma activo (V3 escritorio · V4 móvil)`, new RegExp(w < 768 ? `hero-dashboard-v4-base-m-${lang}\\.jpg$` : `hero-dashboard-v3-base-${lang}(-2x)?\\.jpg$`).test(m.hero), m.hero);
      ok(`${T} · 7 todas las imágenes con width/height`, m.imgsNoDim === 0, m.imgsNoDim);
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
      const low = await page.evaluate(`(function(){ var C=${CONTRAST}; return ['.ip-kicker','.ip-hint','.ip-cons','.ip-stat-pre','.shot-caption','.trust-item p','.plan-sub-alt','.hero-eyebrow','.benefit-item p']
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
    const st = () => page.evaluate(() => ({ on: [...document.querySelectorAll('.ip-bars li.is-on')].map(l => l.dataset.ipKey),
      pressed: [...document.querySelectorAll('[data-ip-select][aria-pressed="true"]')].map(b => b.dataset.ipSelect),
      dim: [...document.querySelectorAll('.ip-bars li')].map(l => +getComputedStyle(l).opacity), reset: !document.querySelector('[data-ip-reset]').hidden }));
    const act = async sel => { const l = page.locator(sel).first(); await l.scrollIntoViewIfNeeded(); if (touch) await l.tap(); else await l.click(); await page.waitForTimeout(320); };
    await act('[data-ip-select="msft"]');
    let s = await st();
    ok(`${T} · G seleccionar Microsoft la resalta y atenúa el resto`, s.on.join() === 'msft' && s.pressed.join() === 'msft' && s.dim.filter(o => o < 0.9).length === 3 && s.dim.every(o => o >= 0.45) && s.reset, s);
    await act('.ip-stat');
    s = await st();
    ok(`${T} · G seleccionar el 69 % resalta las tres posiciones`, s.on.join() === 'msft,btc,aapl' && s.pressed.join() === 'top3', s);
    await act('.ip-stat');
    s = await st();
    ok(`${T} · G volver a pulsar recupera el estado inicial`, s.on.length === 0 && s.pressed.length === 0 && !s.reset && s.dim.every(o => o > 0.99), s);
    if (!touch) {
      await page.focus('[data-ip-select="btc"]'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
      s = await st();
      const foc = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
      ok(`${T} · G teclado: Enter selecciona y el foco es visible`, s.on.join() === 'btc' && foc !== 'none', { s, foc });
      await page.keyboard.press('Escape'); await page.waitForTimeout(150);
      s = await st();
      ok(`${T} · G teclado: Escape restablece`, s.on.length === 0, s);
      await page.focus('[data-ip-select="rest"]'); await page.keyboard.press('Space'); await page.waitForTimeout(150);
      await page.click('[data-ip-reset]'); await page.waitForTimeout(150);
      s = await st();
      ok(`${T} · G «Ver todo» restablece y devuelve el foco al 69 %`, s.on.length === 0 && await page.evaluate(() => document.activeElement.classList.contains('ip-stat')), s);
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
      for (let k = 0; k < 30; k++) { await page.waitForTimeout(250); const b = await page.evaluate(ORB); if (Math.hypot(b.cx - a.cx, b.cy - a.cy) < 14) return b; a = b; }
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
  // V3 · entrada de Intelligence: una vez, sin reinicios, interacción durante la entrada, scroll rápido
  { const T = `${engine} V3 Intelligence`;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage();
    await page.goto(BASE + '?lang=es', { waitUntil: 'networkidle' });
    const is = () => page.evaluate(() => ({ nums: [...document.querySelectorAll('.ip-num')].map(n => n.textContent).join(), fill: document.querySelector('.ip-fill').style.transform,
      w: [...document.querySelectorAll('.ip-pct')].map(e => Math.round(e.getBoundingClientRect().width)).join() }));
    const before = await is();
    await page.evaluate(() => { const e = document.getElementById('intelDemo'); scrollTo(0, e.getBoundingClientRect().top + scrollY - 120); });
    await page.waitForTimeout(330); const mid = await is();
    await page.waitForTimeout(1300); const end = await is();
    ok(`${T} · cuenta desde cero y llega exacto a 69/29/22/18/31`, before.nums === '0,0,0,0,0' && mid.nums !== '69,29,22,18,31' && /scaleX/.test(mid.fill) && end.nums === '69,29,22,18,31' && !end.fill, { before, mid, end });
    ok(`${T} · sin saltos: el ancho de cada porcentaje no cambia durante el conteo`, mid.w === end.w, { mid: mid.w, end: end.w });
    await page.click('[data-ip-select="btc"]'); await page.waitForTimeout(200); await page.click('[data-ip-select="btc"]');
    await scrollTo(page, 0); await page.waitForTimeout(400);
    await page.evaluate(() => { const e = document.getElementById('intelDemo'); scrollTo(0, e.getBoundingClientRect().top + scrollY - 120); }); await page.waitForTimeout(500);
    const back = await is();
    ok(`${T} · seleccionar, subir o bajar no la reinicia`, back.nums === '69,29,22,18,31' && !back.fill, back);
    await ctx.close();
    // interactuar durante la entrada completa los valores y ejecuta la selección
    const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const p2 = await c2.newPage();
    await p2.goto(BASE + '?lang=es', { waitUntil: 'networkidle' });
    await p2.evaluate(() => { const e = document.getElementById('intelDemo'); scrollTo(0, e.getBoundingClientRect().top + scrollY - 120); });
    await p2.waitForTimeout(140); await p2.click('[data-ip-select="msft"]'); await p2.waitForTimeout(40);
    const ia = await p2.evaluate(() => ({ nums: [...document.querySelectorAll('.ip-num')].map(n => n.textContent).join(), on: [...document.querySelectorAll('.ip-bars li.is-on')].map(l => l.dataset.ipKey).join(), fill: document.querySelector('.ip-fill').style.transform }));
    ok(`${T} · pulsar durante la entrada: valores finales al instante y selección aplicada`, ia.nums === '69,29,22,18,31' && ia.on === 'msft' && !ia.fill, ia);
    await c2.close();
    // scroll rápido: nada queda atascado ni a medias
    const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true }); const p3 = await c3.newPage();
    await p3.goto(BASE + '?lang=en', { waitUntil: 'networkidle' });
    for (const y of [700, 1600, 2600, 4000, 9000]) { await scrollTo(p3, y); await p3.waitForTimeout(40); }
    await p3.waitForTimeout(1500); await scrollTo(p3, 0); await p3.waitForTimeout(1700);
    await p3.evaluate(() => { const e = document.getElementById('intelDemo'); scrollTo(0, e.getBoundingClientRect().top + scrollY - 100); }); await p3.waitForTimeout(1500);
    const fr = await p3.evaluate(() => ({ val: document.querySelector('.hero-val').textContent, clip: document.querySelector('.hero-curve').style.clipPath, nums: [...document.querySelectorAll('.ip-num')].map(n => n.textContent).join(), fill: document.querySelector('.ip-fill').style.transform }));
    ok(`${engine} V3 · scroll rápido: hero e Intelligence terminan completos`, fr.val === '$186,055.38' && !fr.clip && fr.nums === '69,29,22,18,31' && !fr.fill, fr);
    await c3.close(); }

  // K · movimiento reducido: esfera estática en su hueco en todo el recorrido
  { const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }); const page = await ctx.newPage();
    await page.goto(BASE + '?lang=es', { waitUntil: 'networkidle' });
    const an = await page.evaluate(() => ['.lp-orb-glow', '.lp-orb-ring--1', '.lp-orb-ring--2', '.lp-orb-swirl', '.lp-orb-ecg path'].map(s => getComputedStyle(document.querySelector(s)).animationName));
    const G = await geom(page), all = [];
    for (let y = G.intel.t - 72; y <= G.trk.t + 200; y += 60) { await scrollTo(page, y); await settle(page, 80); all.push(await page.evaluate(ORB)); }
    await scrollTo(page, 0); await page.waitForTimeout(150);
    const rmH = await page.evaluate(() => ({ val: document.querySelector('.hero-val').textContent, clip: document.querySelector('.hero-curve').style.clipPath, mask: document.querySelector('.hero-donut').style.maskImage, nums: [...document.querySelectorAll('.ip-num')].map(n => n.textContent).join(), fill: document.querySelector('.ip-fill').style.transform }));
    ok(`${engine} · K movimiento reducido: hero e Intelligence con sus valores finales directamente`, rmH.val === '186.055,38\u00a0US$' && !rmH.clip && !rmH.mask && rmH.nums === '69,29,22,18,31' && !rmH.fill, rmH);
    ok(`${engine} · K movimiento reducido: sin animación y estática en su hueco`, an.every(a => a === 'none') && all.every(s => Math.abs(s.dx) < 0.5 && Math.abs(s.dy) < 0.5), { an, moved: all.filter(s => Math.abs(s.dx) >= 0.5).length });
    await ctx.close(); }
  // K · sin JS: legible y navegable
  { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false }); const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'load' });
    const r = await page.evaluate(() => ({ hidden: [...document.querySelectorAll('.reveal')].filter(e => getComputedStyle(e).opacity !== '1').length,
      head: document.querySelector('.ip-head').textContent, hero: document.querySelector('.hero-visual img').currentSrc.split('/').pop(),
      hot: document.querySelector('.hero-hotspot').getAttribute('href'), rows: document.querySelectorAll('.ip-row').length,
      val: document.querySelector('.hero-val').textContent, valVis: getComputedStyle(document.querySelector('.hero-val')).visibility, clip: getComputedStyle(document.querySelector('.hero-curve')).clipPath,
      nums: [...document.querySelectorAll('.ip-num')].map(n => n.textContent).join() }));
    ok(`${engine} · K sin JS: nada oculto, panel, hero EN completo (cifra, curva) y enlace a Intelligence`, r.hidden === 0 && r.head === EXPECT.en.head && /hero-dashboard-v4-base-m-en/.test(r.hero) && r.hot === '#intelligence' && r.rows === 4
      && r.val === '$186,055.38' && r.valVis === 'visible' && (r.clip === 'none' || r.clip === '') && r.nums === '69,29,22,18,31', r);
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
