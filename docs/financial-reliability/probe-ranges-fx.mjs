#!/usr/bin/env node
/**
 * AURIX · QUÉ VE UNA CUENTA AFECTADA EN 24H / 7D / 30D / 1A / TOTAL (SPEC 1, verificación previa a integrar)
 *   AURIX_DEMO_URL=http://127.0.0.1:8766/ node docs/financial-reliability/probe-ranges-fx.mjs
 * Motor REAL del gráfico (`buildProductionPortfolioChart`, con la puerta de preparación del 24H) sobre la
 * demo aislada, con historia sintética DENSA: diaria hasta −10 d, horaria hasta −36 h y cada 15 min
 * después. Cartera: 10.000 € en liquidez + acción USD (10.000 $, ruido ±0,05 %). Puntos anteriores al
 * «despliegue» valorados con el ancla 0,92 y sin base; posteriores, al tipo fechado 1,1197 con base.
 * Escenarios: control sólo USD · EUR actualizado ahora · hace 30 h · hace 8 d · hace 370 d.
 */
const O = String(process.env.AURIX_DEMO_URL || 'http://127.0.0.1:8766/').replace(/\/?$/, '/');
const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
const { chromium, webkit } = await import(PW);
let pass = 0; const fails = [];
const ok = (n, c, i) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (i ? '  [' + i + ']' : '')); console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } };
const RANGES = ['24h', '7d', '30d', '1y', 'all'];
const SCEN = [['control sólo USD', false, 0], ['EUR · actualizado ahora', true, 0.2], ['EUR · hace 30 h', true, 30], ['EUR · hace 8 d', true, 192], ['EUR · hace 370 d', true, 370 * 24]];
const out = {};
for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]].filter(e => (process.env.ENGINES || 'CR,WK').split(',').includes(e[0]))) {
  const browser = await launcher.launch(); console.log('\n══ ' + ENG + ' ══');
  for (const [name, eur, agoH] of SCEN) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(O + 'demo.html'); await p.check('input[value="premium"]'); await p.click('[data-demo=wealth]');
    await p.waitForURL(/index\.html/); await p.waitForTimeout(5000);
    await p.evaluate(({ eur, agoH, RANGES }) => {
      const H = 3600e3, D = 24 * H, now = Date.now(), B = now - agoH * H;
      _applyCurrencyChange('USD');
      assets = [
        { id: 'c1', name: eur ? 'Euros' : 'Dólares', ticker: eur ? 'EUR' : 'USD', type: 'cash', qty: 10000, price: 1, assetCurrency: eur ? 'EUR' : 'USD', costBasis: 10000, transactions: [{ type: 'buy', qty: 10000, price: 1, ts: now - 500 * D }] },
        { id: 's1', name: 'Acción USD', ticker: 'SUSD', type: 'stock', qty: 100, price: 100, assetCurrency: 'USD', costBasis: 10000, transactions: [{ type: 'buy', qty: 100, price: 100, ts: now - 500 * D }] } ];
      const ch = [];
      const push = t => { const st = +(10000 * (1 + 0.0005 * Math.sin(t / (7 * H)))).toFixed(2);
        const dated = eur && t >= B, liq = !eur ? 10000 : (dated ? 11197 : +(10000 / 0.92).toFixed(2));
        const pt = { ts: t, total: +(st + liq).toFixed(2), crypto: 0, stock: st, etf: 0, fund: 0, metal: 0, real_estate: 0, liquidity: liq, other: 0 };
        if (dated) { pt.fxBasis = 'dated'; pt.fxEurUsd = 1.1197; } else if (!eur && t >= now - 0.2 * H) pt.fxBasis = 'na';
        ch.push(pt); };
      for (let t = now - 400 * D; t < now - 10 * D; t += D) push(t);
      for (let t = now - 10 * D; t < now - 36 * H; t += H) push(t);
      for (let t = now - 36 * H; t <= now - 60e3; t += 15 * 60e3) push(t);
      categoryHistory = ch; portfolioHistory = ch.map(x => ({ ts: x.ts, value: x.total }));
      _aurixCanonicalCatHistory = categoryHistory; _aurixBackendSnapshots = [];
      localStorage.setItem('aurixCapitalFlows', '[]');
      localStorage.setItem('aurix_fx_rates_v1', JSON.stringify({ ts: now, rates: { EUR: 1.1197 }, at: { EUR: now } }));
      _aurixFxCache = null; _aurixFxSyncEur(); try { render(true); } catch (_) {} try { updateChart(true); } catch (_) {}
    }, { eur, agoH, RANGES });
    await p.waitForTimeout(1500);
    // Lo que VE el usuario: se pulsa cada rango y se lee el badge tras el repintado real.
    const res = {};
    for (const k of RANGES) {
      await p.locator('.range-btn[data-range="' + k + '"]').first().click(); await p.waitForTimeout(1300);
      res[k] = await p.evaluate(k => {
        const el = document.getElementById('chartChange'); const c = buildProductionPortfolioChart(k); const perf = _aurixInvestablePerformance(k);
        const pub = (typeof _aurixPublishedChartFor === 'function') ? _aurixPublishedChartFor(k) : null;
        return { pct: c.returnPct, pubPct: pub ? pub.returnPct : 'n/a', state: c.returnState, shown: (el.textContent || '').trim().slice(0, 24),
                 note: (el.getAttribute('data-fx-explain') || '').slice(0, 40), perf: perf.valid ? 'ok ' + perf.returnPct : 'no (' + perf.fallbackReason + ')' };
      }, k);
    }
    out[ENG + '|' + name] = res;
    console.log('  ' + name); for (const k of RANGES) console.log('    ' + k.padEnd(4) + ' ' + JSON.stringify(res[k]));
    if (errs.length) console.log('    ERR ' + errs.join(' | ').slice(0, 200));
    await ctx.close();
  }
  await browser.close();
}
if (process.env.ASSERT !== '0') {
  for (const key of Object.keys(out)) {
    const [ENG, name] = key.split('|'); const r = out[key];
    const pub = k => Number.isFinite(r[k].pct) && /[+−-]\d/.test(r[k].shown), lim = k => !Number.isFinite(r[k].pct) && !/[+−-]\d+[.,]\d+ ?%/.test(r[k].shown) && /Sin variación comparable/.test(r[k].note);
    if (name === 'control sólo USD') ok(`${ENG} control sólo USD: 24H y 7D publicados, ningún rango limitado por el tipo`, pub('24h') && pub('7d') && RANGES.every(k => r[k].why !== 'fx_basis_change' && !r[k].note), JSON.stringify(r));
    if (name === 'EUR · actualizado ahora') ok(`${ENG} recién actualizado: los 5 rangos sin variación y con explicación`, RANGES.every(lim), JSON.stringify(r));
    if (name === 'EUR · hace 30 h') ok(`${ENG} actualizado hace 30 h: 24H publicado; 7D/30D/1A/TOTAL limitados`, pub('24h') && !r['24h'].note && ['7d', '30d', '1y', 'all'].every(lim), JSON.stringify(r));
    if (name === 'EUR · hace 8 d') ok(`${ENG} actualizado hace 8 d: 24H y 7D publicados; 30D/1A/TOTAL limitados`, pub('24h') && pub('7d') && ['30d', '1y', 'all'].every(lim), JSON.stringify(r));
    if (name === 'EUR · hace 370 d') ok(`${ENG} actualizado hace 370 d: 1A publicado; TOTAL sigue limitado`, pub('1y') && lim('all'), JSON.stringify(r));
  }
  console.log('\n' + (fails.length ? 'NO-GO' : 'GO') + ` — ${pass}/${pass + fails.length}`);
  if (fails.length) process.exit(1);
}
