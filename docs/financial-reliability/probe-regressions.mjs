#!/usr/bin/env node
/**
 * AURIX · REGRESIONES QUE DEBEN SEGUIR CERRADAS (SPEC 1 §6) — demo aislada, navegador real.
 *   AURIX_DEMO_URL=http://127.0.0.1:8766/ node docs/financial-reliability/probe-regressions.mjs
 * Complementa los harnesses (COHERENCE-PREMIUM, CATALOG-PERSISTENCE, DASHBOARD-PLANS,
 * UNKNOWN-QUANTITY) con lo que sólo se ve en un navegador: WebKit de escritorio sin cuelgue, el
 * idioma no pisa la moneda base, e Intelligence se repinta al cambiar los datos.
 */
const O = String(process.env.AURIX_DEMO_URL || 'http://127.0.0.1:8766/').replace(/\/?$/, '/');
const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
const { chromium, webkit } = await import(PW);
let pass = 0; const fails = [];
const ok = (n, c, i) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (i ? '  [' + i + ']' : '')); console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } };
for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  const browser = await launcher.launch();
  for (const W of [390, 1440]) {
    const T = ENG + '.' + W; console.log('\n══ ' + T + ' ══');
    const ctx = await browser.newContext({ viewport: { width: W, height: 860 }, hasTouch: W < 900 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(O + 'demo.html'); await p.check('input[value="premium"]'); await p.click('[data-demo=wealth]');
    await p.waitForURL(/index\.html/); await p.waitForTimeout(5000);
    await p.evaluate(() => _applyCurrencyChange('USD'));
    const t0 = Date.now();
    const r = await Promise.race([p.evaluate(() => { switchLang('en'); renderWealthCurve && renderWealthCurve(); return { lang, base: baseCurrency }; }), new Promise(z => setTimeout(() => z('TIMEOUT'), 15000))]);
    ok(`${T} cambiar a EN y repintar la curva no cuelga (${Date.now() - t0} ms)`, r !== 'TIMEOUT' && Date.now() - t0 < 5000, JSON.stringify(r));
    ok(`${T} el idioma no pisa la moneda base (USD sigue USD)`, r && r.base === 'USD' && r.lang === 'en');
    await p.reload(); await p.waitForTimeout(5000);
    ok(`${T} tras recargar: idioma EN y base USD conservados`, await p.evaluate(() => lang === 'en' && baseCurrency === 'USD'));
    await p.evaluate(() => { switchLang('es'); switchTab('intelligence'); }); await p.waitForTimeout(2500);
    const before = await p.evaluate(() => (document.querySelector('.tab-placeholder--intel') || document.body).textContent.length);
    await p.evaluate(() => { const a = assets.find(x => x.type !== 'cash' && !isClosedAsset(x)); if (a) { a.qty = a.qty * 3; save(); onPortfolioChange(true); } });
    await p.waitForTimeout(3500);
    const sig = await p.evaluate(() => typeof _intelRefreshSig !== 'undefined' ? String(_intelRefreshSig).slice(0, 40) : 'n/a');
    ok(`${T} Intelligence sigue viva y con contenido tras cambiar los datos`, before > 0 && sig !== 'n/a' && await p.evaluate(() => !!document.querySelector('.tab-placeholder--intel')), sig);
    ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | ').slice(0, 200));
    await ctx.close();
  }
  await browser.close();
}
console.log('\n' + (fails.length ? 'NO-GO' : 'GO') + ` — ${pass}/${pass + fails.length}`);
if (fails.length) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
