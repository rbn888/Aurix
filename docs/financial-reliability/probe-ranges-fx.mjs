#!/usr/bin/env node
/**
 * AURIX · QUÉ VE UNA CUENTA AFECTADA EN 24H / 7D / 30D / 1A / TOTAL (SPEC 1, verificación previa a integrar)
 *   AURIX_DEMO_URL=http://127.0.0.1:8766/ node docs/financial-reliability/probe-ranges-fx.mjs
 * Motor REAL del gráfico (`buildProductionPortfolioChart`, con la puerta de preparación del 24H) sobre la
 * demo aislada, con historia sintética DENSA: diaria hasta −10 d, horaria hasta −36 h y cada 15 min
 * después. Cartera: 10.000 € en liquidez + acción USD (10.000 $, ruido ±0,05 %). Puntos anteriores al
 * «despliegue» valorados con el ancla 0,92 y sin base; posteriores, al tipo fechado 1,1197 con base.
 * Escenarios: control sólo USD · EUR actualizado ahora · hace 30 h · hace 8 d · hace 40 d · hace 370 d ·
 * USD con una retirada hace 3 d (curva baja, rentabilidad sube ⇒ explicación).
 * P0 CHART FINAL RELIABILITY: TOTAL se publica «desde fecha fiable» cuando el subperiodo posterior al cambio
 * de base lo certifica (≥ 21 d); antes sigue limitado.
 * FINAL CHART UX POLISH: lo limitado por el tipo dice «Rentabilidad en preparación» con una explicación por
 * rango (toque/clic/teclado); los demás neutros conservan su etiqueta (escenario «USD · cuenta nueva 4 d»).
 *   LANG_UI=en · VW=390 (badge móvil) · OUT_JSON=/ruta (vuelca cifras para comparar builds)
 */
const O = String(process.env.AURIX_DEMO_URL || 'http://127.0.0.1:8766/').replace(/\/?$/, '/');
const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
const { chromium, webkit } = await import(PW);
let pass = 0; const fails = [];
const ok = (n, c, i) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (i ? '  [' + i + ']' : '')); console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } };
const RANGES = ['24h', '7d', '30d', '1y', 'all'];
const LANG = process.env.LANG_UI === 'en' ? 'en' : 'es', VW = Number(process.env.VW || 1440);
const SCEN = [['USD · cuenta nueva 4 d', 'new', 0], ['control sólo USD', false, 0], ['EUR · actualizado ahora', true, 0.2], ['EUR · hace 30 h', true, 30], ['EUR · hace 8 d', true, 192], ['EUR · hace 40 d', true, 40 * 24], ['EUR · hace 370 d', true, 370 * 24], ['USD · retirada hace 3 d', 'wd', 0]];
const out = {};
for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]].filter(e => (process.env.ENGINES || 'CR,WK').split(',').includes(e[0]))) {
  const browser = await launcher.launch(); console.log('\n══ ' + ENG + ' ══');
  for (const [name, eur, agoH] of SCEN) {
    const ctx = await browser.newContext({ viewport: { width: VW, height: VW < 768 ? 844 : 900 } }); const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(O + 'demo.html'); await p.check('input[value="premium"]'); await p.click('[data-demo=wealth]');
    await p.waitForURL(/index\.html/); await p.waitForTimeout(5000);
    await p.evaluate(({ eur, agoH, RANGES, LANG }) => {
      const H = 3600e3, D = 24 * H, now = Date.now(), B = now - agoH * H;
      const fresh = eur === 'new'; if (fresh) eur = false;
      if (lang !== LANG) switchLang(LANG);
      const wd = eur === 'wd'; if (wd) eur = false; const W = now - 3 * D;
      _applyCurrencyChange('USD');
      assets = [
        { id: 'c1', name: eur ? 'Euros' : 'Dólares', ticker: eur ? 'EUR' : 'USD', type: 'cash', qty: 10000, price: 1, assetCurrency: eur ? 'EUR' : 'USD', costBasis: 10000, transactions: [{ type: 'buy', qty: 10000, price: 1, ts: now - 500 * D }] },
        { id: 's1', name: 'Acción USD', ticker: 'SUSD', type: 'stock', qty: 100, price: 100, assetCurrency: 'USD', costBasis: 10000, transactions: [{ type: 'buy', qty: 100, price: 100, ts: now - 500 * D }] } ];
      const ch = [];
      const push = t => { const st = wd ? +(10000 + (t - (now - 400 * D)) / D * 5).toFixed(2) : +(10000 * (1 + 0.0005 * Math.sin(t / (7 * H)))).toFixed(2);
        const dated = eur && t >= B, liq = wd ? (t >= W ? 5000 : 10000) : (!eur ? 10000 : (dated ? 11197 : +(10000 / 0.92).toFixed(2)));
        const pt = { ts: t, total: +(st + liq).toFixed(2), crypto: 0, stock: st, etf: 0, fund: 0, metal: 0, real_estate: 0, liquidity: liq, other: 0 };
        if (dated) { pt.fxBasis = 'dated'; pt.fxEurUsd = 1.1197; } else if (!eur && t >= now - 0.2 * H) pt.fxBasis = 'na';
        ch.push(pt); };
      if (!fresh) for (let t = now - 400 * D; t < now - 10 * D; t += D) push(t);
      for (let t = now - (fresh ? 4 * D : 10 * D); t < now - 36 * H; t += H) push(t);
      for (let t = now - 36 * H; t <= now - 60e3; t += 15 * 60e3) push(t);
      categoryHistory = ch; portfolioHistory = ch.map(x => ({ ts: x.ts, value: x.total }));
      _aurixCanonicalCatHistory = categoryHistory; _aurixBackendSnapshots = [];
      localStorage.setItem('aurixCapitalFlows', wd ? JSON.stringify([{ id: 'qa-wd-1', ts: W, amountUSD: -5000, kind: 'withdrawal' }]) : '[]');
      localStorage.setItem('aurix_fx_rates_v1', JSON.stringify({ ts: now, rates: { EUR: 1.1197 }, at: { EUR: now } }));
      _aurixFxCache = null; _aurixFxSyncEur(); try { render(true); } catch (_) {} try { updateChart(true); } catch (_) {}
      if (fresh) categoryHistory.forEach(x => { x.fxBasis = 'na'; });   // cuenta nacida con v806: ningún límite del tipo
    }, { eur, agoH, RANGES, LANG });
    await p.waitForTimeout(1500);
    // Lo que VE el usuario: se pulsa cada rango y se lee el badge tras el repintado real.
    const res = {};
    for (const k of RANGES) {
      await p.locator('.range-btn[data-range="' + k + '"]:visible').first().click(); await p.waitForTimeout(1300);
      res[k] = await p.evaluate(k => {
        const el = ['chartChange', 'chartChangeMobile'].map(id => document.getElementById(id)).find(n => n && n.offsetParent) || document.getElementById('chartChange');
        // Contención del texto PINTADO (incluido el «*»): dentro de la fila de controles y del viewport, sin
        // intersección con los rangos ni con el selector %/€ y por encima del gráfico. En móvil la columna del
        // badge es fija (92 px) para que los rangos no se muevan; un estado de texto ocupa el hueco libre de
        // debajo de los rangos, así que se mide contra la FILA y contra los vecinos, no contra esa columna.
        const tx = (el.firstElementChild || el).getBoundingClientRect(), row = (el.closest('.chart-controls, .chart-header') || el.parentElement).getBoundingClientRect();
        const hit = q => [...document.querySelectorAll(q)].filter(b => b.offsetParent && !b.contains(el)).map(b => b.getBoundingClientRect())
          .some(b => !(b.right <= tx.left || b.left >= tx.right || b.bottom <= tx.top || b.top >= tx.bottom));
        const fit = tx.left >= row.left - 0.5 && tx.right <= row.right + 0.5 && tx.right <= innerWidth + 0.5 && tx.bottom <= row.bottom + 1.5
          && !hit('.range-btn') && !hit('.perf-btn') && !hit('canvas');
        const fitWhy = Math.round(tx.left) + ',' + Math.round(tx.right) + ',' + Math.round(tx.top) + ',' + Math.round(tx.bottom) + ' row ' + Math.round(row.left) + ',' + Math.round(row.right) + ',' + Math.round(row.bottom);
        const a11y = el.getAttribute('tabindex') === '0' && el.getAttribute('role') === 'button' && !!el.getAttribute('aria-description'); const c = buildProductionPortfolioChart(k); const perf = _aurixInvestablePerformance(k);
        const pub = (typeof _aurixPublishedChartFor === 'function') ? _aurixPublishedChartFor(k) : null;
        // Control independiente del «desde»: base = primer punto POSTERIOR al último punto sin base declarada.
        const lastOld = categoryHistory.filter(x => !x.fxBasis).map(x => x.ts).pop();
        const bp = Number.isFinite(c.returnSinceTs) ? c.points.find(q => q.ts === c.returnSinceTs) : null;
        const lp = c.points[c.points.length - 1];
        const indep = bp ? +(((lp.value - bp.value) / bp.value) * 100).toFixed(4) : null;
        return { fit: fit, fitWhy: fitWhy, a11y: a11y, cls: el.className, pct: c.returnPct, pubPct: pub ? pub.returnPct : 'n/a', state: c.returnState, shown: (el.textContent || '').trim().slice(0, 34),
                 note: (el.getAttribute('data-fx-explain') || '').slice(0, 400), perf: perf.valid ? 'ok ' + perf.returnPct : 'no (' + perf.fallbackReason + ')',
                 since: Number.isFinite(c.returnSinceTs) ? c.returnSinceTs : null, sinceAfterBoundary: bp ? (lastOld == null || bp.ts > lastOld) && c.points.filter(q => q.ts > lastOld && q.ts < bp.ts).length === 0 : null,
                 indep: indep, line: +(((lp.value - c.points[0].value) / c.points[0].value) * 100).toFixed(4) };
      }, k);
    }
    if (process.env.SHOT) { const el = p.locator('#chartChangeMobile:visible, #chartChange:visible').first(); const box = await el.boundingBox(); if (box) await p.screenshot({ path: process.env.SHOT + '/' + ENG + '-' + VW + '-' + LANG + '-' + name.replace(/[^a-z0-9]+/gi, '_') + '.png', clip: { x: 0, y: Math.max(0, box.y - 120), width: VW, height: 260 } }); }
    out[ENG + '|' + name] = res;
    console.log('  ' + name); for (const k of RANGES) console.log('    ' + k.padEnd(4) + ' ' + JSON.stringify(res[k]));
    // Teclado: Enter sobre el badge preparado abre la explicación (TOTAL, último rango pulsado).
    if (/preparación|being prepared/.test(res.all.shown)) {
      await p.evaluate(() => { const el = ['chartChange', 'chartChangeMobile'].map(id => document.getElementById(id)).find(n => n && n.offsetParent); el.focus(); });
      await p.keyboard.press('Enter'); await p.waitForTimeout(150);
      res.all.kbd = await p.evaluate(() => { const b = document.getElementById('aurixFxBubble'); return b ? b.textContent.slice(0, 30) : null; });
      await p.keyboard.press('Escape');
    }
    if (errs.length) console.log('    ERR ' + errs.join(' | ').slice(0, 200));
    await ctx.close();
  }
  await browser.close();
}
if (process.env.OUT_JSON) (await import('node:fs')).writeFileSync(process.env.OUT_JSON, JSON.stringify(out, null, 1));
if (process.env.ASSERT !== '0') {
  for (const key of Object.keys(out)) {
    const [ENG, name] = key.split('|'); const r = out[key];
    const since = k => Number.isFinite(r[k].pct) && Number.isFinite(r[k].since) && r[k].sinceAfterBoundary === true && Math.abs(r[k].pct - r[k].indep) < 1e-3
      && /desde \d\d\/\d\d\/\d\d|since \d\d\/\d\d\/\d\d/.test(r[k].shown) && /^(Rentabilidad desde|Return since)/.test(r[k].note);
    const PREP = LANG === 'en' ? /^Return being prepared$/ : /^Rentabilidad en preparación$/, PNOTE = LANG === 'en' ? /^We are building/ : /^Estamos construyendo/;
    const pub = k => Number.isFinite(r[k].pct) && /[+−-]\d/.test(r[k].shown) && !Number.isFinite(r[k].since) && !PREP.test(r[k].shown),
      lim = k => !Number.isFinite(r[k].pct) && PREP.test(r[k].shown) && PNOTE.test(r[k].note) && / flat$/.test(r[k].cls) && r[k].a11y;
    ok(`${ENG} ${name}: badge contenido en ${VW}px en los cinco rangos`, RANGES.every(k => r[k].fit), JSON.stringify(RANGES.map(k => r[k].fit)));
    if (name === 'USD · cuenta nueva 4 d') ok(`${ENG} cuenta nueva sin límite del tipo: ningún rango dice «en preparación» ni lleva nota del tipo`, RANGES.every(k => !PREP.test(r[k].shown) && !PNOTE.test(r[k].note) && !/comparable/.test(r[k].note)), JSON.stringify(r));
    if (name === 'EUR · actualizado ahora') ok(`${ENG} TOTAL en preparación: Enter abre la explicación`, PNOTE.test(r.all.kbd || ''), String(r.all.kbd));
    if (name === 'EUR · hace 30 h' || name === 'EUR · hace 8 d') ok(`${ENG} ${name}: la nota es la del rango (30 d / TOTAL ≥ 21 d)`, /30 (días|days)|30-day/.test(r['30d'].note) && /21 (días|days)/.test(r.all.note), r['30d'].note + ' | ' + r.all.note);
    if (name === 'control sólo USD') ok(`${ENG} control sólo USD: 24H y 7D publicados, ningún rango limitado por el tipo`, pub('24h') && pub('7d') && RANGES.every(k => r[k].why !== 'fx_basis_change' && !r[k].note), JSON.stringify(r));
    if (name === 'EUR · actualizado ahora') ok(`${ENG} recién actualizado: los 5 rangos sin variación y con explicación`, RANGES.every(lim), JSON.stringify(r));
    if (name === 'EUR · hace 30 h') ok(`${ENG} actualizado hace 30 h: 24H publicado; 7D/30D/1A/TOTAL limitados`, pub('24h') && !r['24h'].note && ['7d', '30d', '1y', 'all'].every(lim), JSON.stringify(r));
    if (name === 'EUR · hace 8 d') ok(`${ENG} actualizado hace 8 d: 24H y 7D publicados; 30D/1A/TOTAL limitados`, pub('24h') && pub('7d') && ['30d', '1y', 'all'].every(lim), JSON.stringify(r));
    if (name === 'EUR · hace 40 d') ok(`${ENG} actualizado hace 40 d: 30D publicado; 1A limitado; TOTAL «desde fecha fiable» certificado`, pub('30d') && lim('1y') && since('all'), JSON.stringify(r));
    if (name === 'EUR · hace 370 d') ok(`${ENG} actualizado hace 370 d: 1A publicado; TOTAL «desde fecha fiable» (nunca como toda la historia)`, pub('1y') && since('all'), JSON.stringify(r));
    if (name === 'USD · retirada hace 3 d') ok(`${ENG} retirada: 7D curva baja y % sube ⇒ explicación accesible; sin «desde» ni nota de tipo`, pub('7d') && r['7d'].line < 0 && r['7d'].pct > 0 && /^(La curva muestra|The chart shows)/.test(r['7d'].note) && RANGES.every(k => !/comparable/.test(r[k].note)), JSON.stringify(r));
    ok(`${ENG} ${name}: «desde» sólo en TOTAL y sólo con un % certificado`, RANGES.every(k => k === 'all' ? (/desde|since/.test(r[k].shown) === Number.isFinite(r[k].pct) || !Number.isFinite(r[k].since)) : !Number.isFinite(r[k].since) && !/desde|since/.test(r[k].shown)), JSON.stringify(r));
  }
  console.log('\n' + (fails.length ? 'NO-GO' : 'GO') + ` — ${pass}/${pass + fails.length}`);
  if (fails.length) process.exit(1);
}
