// SPEC 3 · Bloque 2 — Intelligence y acabado sobre la demo del candidato (datos ficticios).
// Perfiles: vacío, sólo liquidez, concentrado, diversificado (fixture `wealth`).
// Uso: node probe-block2.mjs [baseURL]  (por defecto http://127.0.0.1:8777, demo ensamblada).
import { chromium, webkit } from '/tmp/aurix-pw/node_modules/playwright/index.mjs';
const BASE = process.argv[2] || 'http://127.0.0.1:8777';
let ok = 0, ko = 0; const fail = [];
const chk = (c, n, extra) => { if (c) ok++; else { ko++; fail.push(n + (extra ? ' ' + extra : '')); } };
const P = {
  cash: [{ id: 'p_cash', ticker: 'EUR', name: 'EUR', type: 'cash', qty: 10000, price: 1, assetCurrency: 'EUR' }],
  conc: [{ id: 'p_btc', ticker: 'BTC', name: 'Bitcoin', type: 'crypto', qty: 0.5, price: 62000, assetCurrency: 'USD', transactions: [{ type: 'buy', qty: 0.5, price: 59000, ts: Date.now() - 30 * 864e5 }] },
         { id: 'p_cash', ticker: 'EUR', name: 'EUR', type: 'cash', qty: 1000, price: 1, assetCurrency: 'EUR' }],
};
async function open(b, W, L, name) {
  const p = await (await b.newContext({ viewport: { width: W, height: W < 900 ? 844 : 900 }, hasTouch: W < 900 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`${BASE}/demo.html`); await p.check('input[value="premium"]');
  await p.click(`[data-demo=${name === 'div' ? 'wealth' : 'empty'}]`); await p.waitForURL(/index\.html/); await p.waitForTimeout(4500);
  // Ruta propia de la app (la misma que el borrado): cartera en memoria + save + render.
  if (P[name]) { await p.evaluate(a => { assets = JSON.parse(JSON.stringify(a)); save('delete-asset'); render(true); onPortfolioChange(true); }, P[name]); await p.waitForTimeout(2500); }
  await p.evaluate(l => { switchLang(l); _applyCurrencyChange('EUR'); switchTab('dashboard'); }, L); await p.waitForTimeout(1200);
  return { p, errs };
}
const pill = p => p.evaluate(() => { const s = document.getElementById('aurixSignal'); return s && !s.hidden ? (document.getElementById('aurixSignalMsg') || {}).textContent : null; });
const intel = async p => { await p.evaluate(() => switchTab('intelligence')); await p.waitForTimeout(2500);
  return p.evaluate(() => {
    const root = document.querySelector('.aurix-intcc'); const vis = e => e && e.getBoundingClientRect().height > 0 && +getComputedStyle(e).opacity > 0.9;
    const badge = [...document.querySelectorAll('.intcc-health-badge, .intcc-m-health-badge, [class*="health-badge"]')].find(vis);
    const q = [...document.querySelectorAll('body *')].filter(e => e.childElementCount === 0 && /^¿|\?$/.test(e.textContent.trim()) && vis(e)).map(e => e.textContent.trim());
    return { empty: !!(root && root.classList.contains('is-empty')), emptyVisible: vis(document.querySelector('.intcc-empty-card')), badge: badge ? badge.textContent.trim() : null,
      dashQ: q.filter(x => /—/.test(x)), top: (document.querySelector('.intcc-drv-name, [class*="drv-name"]') || {}).textContent || null };
  }); };
const over = p => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
for (const [EN, eng] of [['CR', chromium], ['WK', webkit]]) {
  const b = await eng.launch();
  for (const W of [390, 1440]) for (const L of ['es', 'en']) {
    const T = `${EN}.${W}.${L}`;
    // VACÍO — Intelligence no puede quedar en blanco.
    { const { p, errs } = await open(b, W, L, 'empty'); const i = await intel(p);
      chk(i.empty && i.emptyVisible, T + ' vacío: Intelligence muestra su estado vacío'); chk(!errs.length, T + ' vacío sin errores', errs[0]); await p.context().close(); }
    // SÓLO LIQUIDEZ y CONCENTRADO — la Salud del Dashboard es la de Intelligence; ninguna pregunta con «—».
    for (const n of ['cash', 'conc']) { const { p, errs } = await open(b, W, L, n); const d = await pill(p); chk(!(await over(p)), `${T} ${n}: sin desbordamiento`);
      const i = await intel(p);
      chk(!!d && !!i.badge && d.indexOf(i.badge) >= 0, `${T} ${n}: Dashboard «${d}» = Intelligence «${i.badge}»`);
      chk(!/Riesgo|Risk/.test(d || ''), `${T} ${n}: sin «riesgo» del índice retirado`, d);
      chk(i.dashQ.length === 0, `${T} ${n}: ninguna pregunta con «—»`, JSON.stringify(i.dashQ)); chk(!errs.length, `${T} ${n} sin errores`, errs[0]); await p.context().close(); }
    // DIVERSIFICADO — coherencia y actualización tras modificar posiciones.
    { const { p, errs } = await open(b, W, L, 'div'); const d0 = await pill(p); const i0 = await intel(p);
      chk(!!d0 && !!i0.badge && d0.indexOf(i0.badge) >= 0, `${T} div: Dashboard «${d0}» = Intelligence «${i0.badge}»`);
      if (L === 'en') { await p.evaluate(() => { switchTab('dashboard'); setActiveCategory('crypto'); }); await p.waitForTimeout(1500);
        const q = await p.evaluate(() => [...document.querySelectorAll('.dar-qty')].map(e => e.textContent).join(' | '));
        chk(/0\.12 BTC/.test(q) && !/0,12/.test(q), `${T} div: separador decimal inglés`, q); await p.evaluate(() => setActiveCategory(null)); await p.waitForTimeout(600); }
      await p.evaluate(() => { switchTab('dashboard'); assets = assets.filter(a => a.type !== 'stock' && a.type !== 'etf'); save('delete-asset'); render(true); onPortfolioChange(true); }); await p.waitForTimeout(2000);
      const d1 = await pill(p); const i1 = await intel(p);
      chk(!!d1 && !!i1.badge && d1.indexOf(i1.badge) >= 0, `${T} div tras borrar: Dashboard «${d1}» = Intelligence «${i1.badge}»`);
      chk(i1.top !== i0.top || d1 !== d0, `${T} div tras borrar: la lectura se actualiza`, `${i0.top}→${i1.top} ${d0}→${d1}`);
      chk(!errs.length, `${T} div sin errores`, errs[0]); await p.context().close(); }
  }
  await b.close();
}
console.log(ko ? `NO-GO — ${ok}/${ok + ko}\n  ✗ ` + fail.join('\n  ✗ ') : `GO — ${ok}/${ok}`); process.exit(ko ? 1 : 0);
