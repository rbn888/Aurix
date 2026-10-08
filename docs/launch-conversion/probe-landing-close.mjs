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
      const imgs = qa('main img');
      const caps = qa('.shot-fig').map(f => { const i = f.querySelector('img').getBoundingClientRect(), c = f.querySelector('figcaption').getBoundingClientRect(); return c.top >= i.bottom - 1; });
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
        lang: imgs.every(i => i.getAttribute('src').endsWith('-' + document.documentElement.lang + '.jpg')),
        caps: caps.length === 4 && caps.every(Boolean),
        allVisible: qa('.reveal').every(e => +getComputedStyle(e).opacity > 0.99),
        planAligned: planBtns.length === 2 && (innerWidth < 861 || Math.abs(planBtns[0] - planBtns[1]) <= 1),
        premStarts: /Todo lo incluido en Free, más:|Everything in Free, plus:/.test(prem),
        prices: /7,99|7\.99/.test(prem) && /69,99|69\.99/.test(prem) && /5,83|5\.83/.test(prem) && /27/.test(prem),
        renew: /Suscripción renovable\. Cancela desde Gestionar mi plan\.|Renewing subscription\. Cancel from Manage my plan\./.test(prem),
      };
    });
    chk(!m.overflow, tag + ' sin desbordamiento'); chk(m.ctaFold, tag + ' CTA en el primer pliegue'); chk(m.empty === 0, tag + ' 0 claves vacías');
    chk(m.order === 'hero,section--bridge,how,plans,faq,start', tag + ' estructura ' + m.order); chk(m.removed, tag + ' secciones retiradas');
    chk(m.explore, tag + ' Explorar → #how'); chk(m.heroEager && m.restLazy && m.dims, tag + ' carga eager/lazy y dimensiones');
    chk(m.loaded && m.lang, tag + ' capturas cargadas en el idioma'); chk(m.caps, tag + ' pie fuera de la imagen');
    chk(m.allVisible, tag + ' todo visible tras recorrer'); chk(m.planAligned, tag + ' CTA de planes alineados');
    chk(m.premStarts && m.prices && m.renew, tag + ' Premium: intro, precios y renovación'); chk(errs.length === 0, tag + ' sin errores ' + errs[0]);
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
