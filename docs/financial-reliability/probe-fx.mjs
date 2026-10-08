#!/usr/bin/env node
/**
 * AURIX · SONDA DEL TIPO EUR/USD — navegador real sobre la demo aislada (cuenta vacía).
 *   AURIX_DEMO_URL=http://127.0.0.1:8766/ node docs/financial-reliability/probe-fx.mjs
 * La demo no tiene red: la caché FX se siembra con un tipo SINTÉTICO fechado (1,1197 USD/EUR) y se
 * ejercitan los tres estados — actual, último conocido (no actual) y sin tipo. Esperados a mano:
 * 100 USD con base EUR = 100 / 1,1197 = 89,31 €; nunca 92 € (el ancla 0,92) si hay tipo.
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
    await p.goto(O + 'demo.html'); await p.check('input[value="premium"]'); await p.click('[data-demo=empty]');
    await p.waitForURL(/index\.html/); await p.waitForTimeout(5000);
    await p.evaluate(() => { switchLang('es'); _applyCurrencyChange('EUR');
      assets.push({ id: 'fx_usd', name: 'Acción USD', ticker: 'FXU', type: 'stock', qty: 1, price: 100, assetCurrency: 'USD', costBasis: 100, transactions: [] });
      assets.push({ id: 'fx_eur', name: 'Efectivo', ticker: 'EUR', type: 'cash', qty: 1000, price: 1, assetCurrency: 'EUR', costBasis: 1000, transactions: [] }); });
    const seed = (rateAt) => p.evaluate(at => {
      if (at === null) localStorage.setItem('aurix_fx_rates_v1', JSON.stringify({ ts: Date.now(), rates: { GBP: 1.3 }, at: { GBP: Date.now() } }));
      else localStorage.setItem('aurix_fx_rates_v1', JSON.stringify({ ts: at, rates: { EUR: 1.1197, GBP: 1.3 }, at: { EUR: at, GBP: at } }));
      _aurixFxCache = null; _aurixFxSyncEur(); render(true); setUpdateStatus('ok');
      const a = assets.find(x => x.id === 'fx_usd');
      return { r: usdToEur, st: _aurixFxEurState().status, usdInEur: toBase(assetValueUSD(a), 'USD'), note: document.getElementById('settingsFxNote').textContent,
               hero: document.getElementById('updateText').textContent, approx: document.getElementById('totalValue').getAttribute('data-fx-approx'), guard: _aurixFxApproxUsed(activeAssets()) };
    }, rateAt);
    const live = await seed(Date.now() - 60000);
    ok(`${T} tipo actual: 100 USD = 89,31 € (no 92 €), estado «live»`, live.st === 'live' && Math.abs(live.usdInEur - 89.31) < 0.01, JSON.stringify(live));
    ok(`${T} Ajustes muestra valor, fuente y fecha del tipo`, /1 € = 1,1197 \$ · Yahoo Finance · \d{2}\/\d{2}\/\d{4}/.test(live.note), live.note);
    ok(`${T} con tipo actual el hero no se marca aproximado`, !/cambio no actual/.test(live.hero) && live.approx == null && live.guard === false, live.hero);
    const stale = await seed(Date.now() - 3 * 86400000);
    ok(`${T} tipo no actual: se usa el último conocido CON su fecha y se dice`, stale.st === 'stale' && Math.abs(stale.usdInEur - 89.31) < 0.01 && /no actual.*1,1197/.test(stale.note), JSON.stringify(stale));
    ok(`${T} …y el hero marca el total como aproximado (≈) y el snapshot del cliente no se persiste`, /cambio no actual/.test(stale.hero) && stale.approx === 'stale' && stale.guard === true, stale.hero);
    const vis = await p.evaluate(() => { const n = document.querySelector('.update-fx-note'); return n ? getComputedStyle(n).display : 'absent'; });
    ok(`${T} texto corto del hero: oculto en móvil (el hero no cambia de forma), visible en escritorio; «≈» y etiqueta accesible siempre`, (W < 768 ? vis === 'none' : vis !== 'none' && vis !== 'absent') && await p.evaluate(() => /no es actual|not current/.test(document.getElementById('totalValue').getAttribute('aria-label') || '')), vis);
    const none = await seed(null);
    ok(`${T} sin tipo: se dice que no hay tipo y que el total es aproximado (nunca 1:1)`, none.st === 'none' && /Sin tipo de cambio EUR\/USD/.test(none.note) && /cambio no actual/.test(none.hero) && none.approx === 'none' && Math.abs(none.usdInEur - 100) > 1, JSON.stringify(none));
    // Frescura POR PAR: GBP sin fecha reciente no es «live» aunque el refresco global sea de ahora.
    const gbp = await p.evaluate(() => { localStorage.setItem('aurix_fx_rates_v1', JSON.stringify({ ts: Date.now(), rates: { EUR: 1.1197, GBP: 1.3 }, at: { EUR: Date.now(), GBP: Date.now() - 3 * 86400000 } })); _aurixFxCache = null; _aurixFxSyncEur(); return _aurixFxStatus('GBP'); });
    ok(`${T} un par que no llegó en el último refresco (GBP) no se declara actual`, gbp !== 'live', gbp);
    // Flujos DERIVADOS de transacciones pasadas en EUR: deterministas (ancla 0,92), no con el tipo de hoy.
    const bf = await p.evaluate(() => {
      assets.push({ id: 'fx_eurstock', name: 'Acción EUR', ticker: 'FXE', type: 'stock', qty: 10, price: 1000, assetCurrency: 'EUR', costBasis: 10000, transactions: [{ type: 'buy', qty: 10, price: 1000, ts: Date.now() - 40 * 86400000 }] });
      const run = () => { _aurixBackfillFlowsFromTransactions(); return _aurixLoadCapitalFlows().filter(f => f.assetId === 'fx_eurstock').map(f => +Number(f.amountUSD).toFixed(2)); };
      const a1 = run();
      localStorage.setItem('aurix_fx_rates_v1', JSON.stringify({ ts: Date.now(), rates: { EUR: 1.05 }, at: { EUR: Date.now() } })); _aurixFxCache = null; _aurixFxSyncEur();
      const a2 = run();
      assets = assets.filter(x => x.id !== 'fx_eurstock');
      return { a1, a2 };
    });
    ok(`${T} flujo derivado de una compra pasada de 10.000 € = 10.869,57 $ y no cambia al cambiar el tipo de hoy`, bf.a1.length === 1 && bf.a1[0] === 10869.57 && JSON.stringify(bf.a1) === JSON.stringify(bf.a2), JSON.stringify(bf));
    // Una cartera SÓLO en EUR con base EUR no necesita el tipo: no se le pone ningún aviso.
    const onlyEur = await p.evaluate(() => { assets = assets.filter(x => x.id !== 'fx_usd'); render(true); setUpdateStatus('ok'); return { hero: document.getElementById('updateText').textContent, approx: document.getElementById('totalValue').getAttribute('data-fx-approx') }; });
    ok(`${T} cartera sólo EUR con base EUR: sin aviso aunque falte el tipo`, !/cambio no actual/.test(onlyEur.hero) && onlyEur.approx == null, onlyEur.hero);
    await p.evaluate(() => switchLang('en')); await p.evaluate(() => { localStorage.setItem('aurix_fx_rates_v1', JSON.stringify({ ts: Date.now(), rates: { GBP: 1.3 }, at: { GBP: Date.now() } })); _aurixFxCache = null; _aurixFxSyncEur(); setUpdateStatus('ok'); });
    ok(`${T} EN: «No EUR/USD exchange rate available»`, /No EUR\/USD exchange rate available/.test(await p.evaluate(() => document.getElementById('settingsFxNote').textContent)));
    await p.evaluate(() => switchLang('es'));
    ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | ').slice(0, 200));
    await ctx.close();
  }
  await browser.close();
}
console.log('\n' + (fails.length ? 'NO-GO' : 'GO') + ` — ${pass}/${pass + fails.length}`);
if (fails.length) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
