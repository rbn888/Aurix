// SPEC 2 · cierre de la landing — sonda focalizada. Uso: node probe-landing-close.mjs [baseURL]
// (por defecto http://127.0.0.1:8778/index.html, la carpeta landing/ servida en estático).
import { chromium, webkit } from '/tmp/aurix-pw/node_modules/playwright/index.mjs';
const BASE = process.argv[2] || 'http://127.0.0.1:8778/index.html';
let ok = 0, ko = 0; const fail = [];
const chk = (c, name) => { if (c) ok++; else { ko++; fail.push(name); } };
for (const [en, eng] of [['CR', chromium], ['WK', webkit]]) {
  const b = await eng.launch();
  for (const L of ['es', 'en']) for (const W of [320, 390, 1440]) {
    const tag = `${en}.${L}.${W}`;
    const p = await (await b.newContext({ viewport: { width: W, height: W < 900 ? 844 : 900 }, hasTouch: W < 900 })).newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(`${BASE}?lang=${L}`); await p.waitForTimeout(900);
    for (let y = 0; y < 7000; y += 350) { await p.mouse.wheel(0, 350); await p.waitForTimeout(70); }
    await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(700);
    const m = await p.evaluate(() => {
      const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
      const cta = q('.hero-cta .btn-primary').getBoundingClientRect();
      const imgs = qa('main img').filter(i => i.getBoundingClientRect().width > 0);
      const caps = qa('.shot-fig').filter(f => f.getBoundingClientRect().width > 0).map(f => { const i = f.querySelector('img').getBoundingClientRect(), c = f.querySelector('figcaption').getBoundingClientRect(); return c.top >= i.bottom - 1; });
      const planBtns = qa('.plan .btn').map(x => Math.round(x.getBoundingClientRect().top));
      const prem = q('.plan--premium').innerText;
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        ctaFold: cta.bottom <= innerHeight && cta.width > 0,
        empty: qa('[data-i18n]').filter(e => !e.textContent.trim()).length,
        order: qa('main > section').map(s => s.id || s.className.split(' ').pop()).join(','),
        removed: !q('#benefits') && !q('.frag-grid') && !q('#community') && !q('.pain-line'),
        explore: q('.hero-cta .btn-ghost').getAttribute('href') === '#how',
        heroEager: !imgs[0].hasAttribute('loading') && imgs[0].getAttribute('fetchpriority') === 'high',
        restLazy: imgs.slice(1).every(i => i.getAttribute('loading') === 'lazy'),
        dims: imgs.every(i => +i.getAttribute('width') > 0 && +i.getAttribute('height') > 0),
        loaded: imgs.every(i => i.complete && i.naturalWidth > 0),
        lang: imgs.filter(i => i.hasAttribute('data-i18n-src')).every(i => i.getAttribute('src').endsWith('-' + document.documentElement.lang + '.jpg')),
        // Capturas nuevas en su sitio exacto; posiciones y presupuesto conservados; sin «datos de ejemplo» en las reales.
        placed: qa('main img').map(i => i.getAttribute('src')).join() === 'assets/dashboard.jpg,assets/positions-' + document.documentElement.lang + '.jpg,assets/market.jpg,assets/intelligence.jpg,assets/workspace-' + document.documentElement.lang + '.jpg'
          && !!q('#how .how-row + .how-market + .how-row--rev') && /Reúne todo tu patrimonio|Bring all your wealth together/.test(q('.how-market').previousElementSibling.innerText)
          && /Tus mercados, a la vista\.|Your markets, at a glance\./.test(q('.how-market').innerText) && !q('.how-market .btn') && !/€|\$\d/.test(q('.how-market-copy').innerText)
          && (innerWidth < 861 ? q('.how-market-fig').getBoundingClientRect().width === 0 : Math.abs(q('.hero-visual').getBoundingClientRect().width - 1000) <= 1 && Math.abs(q('.how-market-fig').getBoundingClientRect().width - 1000) <= 1 && [q('.hero-visual'), q('.how-market-fig')].every(f => { const r = f.getBoundingClientRect(), c = f.parentElement.getBoundingClientRect(); return Math.abs((r.left - c.left) - (c.right - r.right)) <= 1; }))
          && !!q('.hero .hero-visual img[src="assets/dashboard.jpg"]') && /Descubre qué merece tu atención|Find out what deserves your attention/.test(q('img[src="assets/intelligence.jpg"]').closest('.how-row').innerText)
          && ['assets/dashboard.jpg', 'assets/intelligence.jpg'].every(s => { const f = q('img[src="' + s + '"]'); return !/ejemplo|sample/i.test(f.alt + f.closest('figure').innerText); }),
        ratio: imgs.every(i => Math.abs(i.getBoundingClientRect().width / i.getBoundingClientRect().height - i.naturalWidth / i.naturalHeight) < 0.02 && Math.abs(i.naturalWidth / i.naturalHeight - i.getAttribute('width') / i.getAttribute('height')) < 0.01),
        caps: caps.length === imgs.length && caps.length >= 4 && caps.every(Boolean),
        allVisible: qa('.reveal').every(e => +getComputedStyle(e).opacity > 0.99),
        planAligned: planBtns.length === 2 && (innerWidth < 861 || Math.abs(planBtns[0] - planBtns[1]) <= 1),
        premStarts: /Todo lo incluido en Free, más:|Everything in Free, plus:/.test(prem),
        prices: /7,99|7\.99/.test(prem) && /69,99|69\.99/.test(prem) && /5,83|5\.83/.test(prem) && /27/.test(prem),
        renew: /Suscripción renovable\. Cancela desde Gestionar mi plan\.|Renewing subscription\. Cancel from Manage my plan\./.test(prem),
        noCard: !/Sin tarjeta para empezar|No card needed to start/i.test(document.body.innerText),
        premCta: (q('.plan--premium .btn').textContent.trim() === (document.documentElement.lang === 'es' ? 'Crear cuenta y descubrir Premium' : 'Create an account and explore Premium')),
        ctaDest: qa('[data-app-link]').every(a => a.href.startsWith('https://app.aurixsystem.io/') && a.href.includes('lang=' + document.documentElement.lang)),
        noDemo: !qa('a').some(a => /demo/i.test(a.href)),
        meta: !/operating system|sistema operativo/i.test(document.title + document.querySelector('meta[name=description]').content) && /inteligencia patrimonial|wealth intelligence/i.test(document.title),
      };
    });
    chk(!m.overflow, tag + ' sin desbordamiento'); chk(m.ctaFold, tag + ' CTA en el primer pliegue'); chk(m.empty === 0, tag + ' 0 claves vacías');
    chk(m.order === 'hero,section--bridge,how,plans,faq,start', tag + ' estructura ' + m.order); chk(m.removed, tag + ' secciones retiradas');
    chk(m.explore, tag + ' Explorar → #how'); chk(m.heroEager && m.restLazy && m.dims, tag + ' carga eager/lazy y dimensiones');
    chk(m.loaded && m.lang, tag + ' capturas cargadas en el idioma'); chk(m.placed, tag + ' capturas en su ubicación'); chk(m.ratio, tag + ' proporción y dimensiones reservadas'); chk(m.caps, tag + ' pie fuera de la imagen');
    chk(m.allVisible, tag + ' todo visible tras recorrer'); chk(m.planAligned, tag + ' CTA de planes alineados');
    chk(m.premStarts && m.prices && m.renew, tag + ' Premium: intro, precios y renovación'); chk(m.noCard, tag + ' sin «sin tarjeta»'); chk(m.premCta, tag + ' CTA Premium'); chk(m.ctaDest, tag + ' CTA → app con idioma'); chk(m.noDemo, tag + ' sin demos'); chk(m.meta, tag + ' título/descr. vigentes'); chk(errs.length === 0, tag + ' sin errores ' + errs[0]);
    await p.close();
  }
  // Sin JS: nada queda oculto por la animación de entrada.
  const p = await (await b.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } })).newPage();
  await p.goto(BASE); await p.waitForTimeout(500);
  chk(await p.evaluate(() => [...document.querySelectorAll('.reveal')].every(e => +getComputedStyle(e).opacity > 0.99)), en + ' sin JS: contenido visible');
  await b.close();
}
console.log(ko ? `NO-GO — ${ok}/${ok + ko}\n  ✗ ` + fail.join('\n  ✗ ') : `GO — ${ok}/${ok}`);
process.exit(ko ? 1 : 0);
