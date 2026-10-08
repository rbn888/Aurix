#!/usr/bin/env node
/**
 * AURIX · SONDA DEL CICLO DE VIDA DE OPERACIONES — navegador real sobre la demo aislada (cuenta vacía).
 *   AURIX_DEMO_URL=http://127.0.0.1:8766/ node docs/financial-reliability/probe-operations.mjs
 * A) sólo liquidez EUR: 1.000 − 250 = 750; retirada excesiva bloqueada; doble Enter / doble clic sin
 *    duplicar; cancelar sin cambios.
 * B/D) acción en USD con base EUR: 30 + 2 − 1 = 31; venta total ⇒ cerrada (no activa, historial
 *    conservado) y sobrevive a la recarga; recompra ⇒ MISMA fila reactivada; decimales ES.
 * La selección del buscador se simula (la demo no tiene red); el envío es el formulario real.
 */
const O = String(process.env.AURIX_DEMO_URL || 'http://127.0.0.1:8766/').replace(/\/?$/, '/');
const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
const { chromium, webkit } = await import(PW);
let pass = 0; const fails = [];
const ok = (n, c, i) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (i ? '  [' + i + ']' : '')); console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } };
const ENGINES = (process.env.ENGINES || 'CR,WK').split(',');
const WIDTHS = (process.env.WIDTHS || '390,1440').split(',').map(Number);

for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]].filter(e => ENGINES.includes(e[0]))) {
  const browser = await launcher.launch();
  for (const W of WIDTHS) {
    const T = ENG + '.' + W; console.log('\n══ ' + T + ' ══');
    const ctx = await browser.newContext({ viewport: { width: W, height: 860 }, hasTouch: W < 900 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(O + 'demo.html'); await p.check('input[value="premium"]'); await p.click('[data-demo=empty]');
    await p.waitForURL(/index\.html/); await p.waitForTimeout(5000);
    await p.evaluate(() => { _applyCurrencyChange('EUR'); switchLang('es'); });
    const cash = () => p.evaluate(() => assets.filter(a => a.type === 'cash' && a.assetCurrency === 'EUR').map(a => [a.qty, (a.transactions || []).length])[0] || null);
    const submitTwice = async (input, how) => {
      if (how === 'enter') { await p.press(input, 'Enter'); await p.waitForTimeout(120); await p.press(input, 'Enter'); }
      else { const btn = p.locator(input).locator('xpath=ancestor::form').locator('.btn-submit'); if (W < 900) { await btn.tap(); await btn.tap({ force: true }).catch(() => {}); } else await btn.dblclick(); }
      await p.waitForTimeout(800);
    };
    // ── A · LIQUIDEZ ──
    await p.evaluate(() => openLiquidityModal()); await p.waitForTimeout(400);
    await p.click('#liquidityOverlay .liq-btn[data-curr="EUR"]'); await p.fill('#liquidityQty', '1000');
    await submitTwice('#liquidityQty', 'enter');
    ok(`${T} añadir 1.000 € con doble Enter registra UNA aportación`, JSON.stringify(await cash()) === '[1000,1]', JSON.stringify(await cash()));
    await p.evaluate(() => openLiquidityModal()); await p.waitForTimeout(400);
    await p.click('#liquidityOverlay .liq-btn[data-curr="EUR"]'); await p.fill('#liquidityQty', '1000');
    await submitTwice('#liquidityQty', 'click');
    ok(`${T} añadir 1.000 € con doble pulsación registra UNA aportación (2.000)`, JSON.stringify(await cash()) === '[2000,2]', JSON.stringify(await cash()));
    const cid = await p.evaluate(() => assets.find(a => a.type === 'cash').id);
    await p.evaluate(id => openReduceModal(id), cid); await p.waitForTimeout(400);
    await p.fill('#reduceQty', '1250'); await submitTwice('#reduceQty', 'enter');
    ok(`${T} retirar 1.250 con doble Enter: 2.000 − 1.250 = 750, una sola retirada`, JSON.stringify(await cash()) === '[750,3]', JSON.stringify(await cash()));
    await p.evaluate(id => openReduceModal(id), cid); await p.waitForTimeout(400);
    await p.fill('#reduceQty', '5000'); await p.press('#reduceQty', 'Enter'); await p.waitForTimeout(500);
    ok(`${T} retirada por encima del saldo bloqueada con mensaje`, JSON.stringify(await cash()) === '[750,3]' && /750/.test(await p.evaluate(() => document.getElementById('reduceError').textContent)));
    await p.evaluate(() => closeReduceModal());
    await p.evaluate(() => openLiquidityModal()); await p.waitForTimeout(300); await p.fill('#liquidityQty', '999'); await p.click('#liquidityClose'); await p.waitForTimeout(400);
    ok(`${T} cancelar el formulario no guarda nada`, JSON.stringify(await cash()) === '[750,3]');

    // ── B/D · POSICIÓN EN USD CON BASE EUR ──
    const buyNew = (qty, price, twice) => p.evaluate(([q, pr, tw]) => {
      openModal(); selectedDbAsset = { ticker: 'MSFT', name: 'Microsoft', type: 'stock', marketSymbol: 'MSFT' };
      pendingPrice = pr; document.getElementById('assetQty').value = q; const pp = document.getElementById('assetPurchasePrice'); if (pp) pp.value = '';
      document.getElementById('assetForm').requestSubmit();
      if (tw) document.getElementById('assetForm').requestSubmit();   // segundo Enter con el foco aún dentro
    }, [qty, price, !!twice]);
    const hasQty = await p.evaluate(() => !!document.getElementById('assetQty'));
    ok(`${T} (prerrequisito) el formulario de alta expone #qty`, hasQty);
    await buyNew('30', 100, true); await p.waitForTimeout(900);
    const ms = () => p.evaluate(() => { const a = assets.filter(x => x.ticker === 'MSFT'); return a.map(x => ({ id: x.id, q: x.qty, st: x.lifecycleStatus || 'active', tx: (x.transactions || []).length, cur: x.assetCurrency, active: activeAssets().includes(x) })); });
    let m = await ms();
    ok(`${T} compra inicial 30 MSFT en USD (doble envío: una sola compra)`, m.length === 1 && m[0].q === 30 && m[0].tx === 1 && m[0].cur === 'USD', JSON.stringify(m));
    const mid = m[0] && m[0].id;
    await p.evaluate(id => openAddModal(id), mid); await p.waitForTimeout(400); await p.fill('#addQty', '2'); await submitTwice('#addQty', 'enter');
    await p.evaluate(id => openReduceModal(id), mid); await p.waitForTimeout(400); await p.fill('#reduceQty', '1'); await submitTwice('#reduceQty', 'enter');
    m = await ms();
    ok(`${T} compra adicional +2 y venta parcial −1 (doble Enter): 30 + 2 − 1 = 31`, m.length === 1 && m[0].q === 31 && m[0].active, JSON.stringify(m));
    const val = await p.evaluate(id => { const a = assets.find(x => x.id === id); return { usd: assetValueUSD(a), eur: toBase(assetValueUSD(a), 'USD'), r: usdToEur }; }, mid);
    ok(`${T} valoración en base EUR = 31 × precio × tipo vigente del motor (sin doble conversión)`, Math.abs(val.usd - 31 * 100) < 0.01 && Math.abs(val.eur - 3100 * val.r) < 0.01, JSON.stringify(val));
    await p.evaluate(id => openReduceModal(id), mid); await p.waitForTimeout(400); await p.fill('#reduceQty', '31'); await submitTwice('#reduceQty', 'enter');
    m = await ms();
    ok(`${T} venta total: cerrada, cantidad 0, NO activa e historial conservado`, m.length === 1 && m[0].q === 0 && m[0].st === 'closed' && !m[0].active && m[0].tx >= 3, JSON.stringify(m));
    await p.reload(); await p.waitForTimeout(5000);
    m = await ms();
    ok(`${T} tras recargar la posición sigue cerrada y fuera de las activas`, m.length === 1 && m[0].st === 'closed' && !m[0].active && m[0].q === 0, JSON.stringify(m));
    ok(`${T} tras recargar la liquidez sigue en 750`, JSON.stringify(await cash()) === '[750,3]', JSON.stringify(await cash()));
    await buyNew('5', 120); await p.waitForTimeout(900);
    m = await ms();
    ok(`${T} recompra: reactiva la MISMA fila (5 uds, activa) y conserva el historial`, m.length === 1 && m[0].id === mid && m[0].q === 5 && m[0].active && m[0].tx >= 4, JSON.stringify(m));
    // decimales ES en la hoja de transacción
    await p.evaluate(id => openTxModal(id), mid); await p.waitForTimeout(400);
    await p.fill('#txQty', '0,5'); await p.fill('#txPrice', '1.234,56'); await p.press('#txPrice', 'Enter'); await p.waitForTimeout(800);
    const last = await p.evaluate(id => { const a = assets.find(x => x.id === id); const t = a.transactions[a.transactions.length - 1]; return { q: a.qty, tq: t.qty, tp: t.price }; }, mid);
    ok(`${T} decimales ES: «0,5» a «1.234,56» ⇒ 0.5 uds a 1234.56 (5 + 0,5 = 5,5)`, last.q === 5.5 && last.tq === 0.5 && Math.abs(last.tp - 1234.56) < 1e-9, JSON.stringify(last));
    const noteVis = sel => p.evaluate(s => { const n = document.querySelector(s + ' [data-trade-note]'); return n ? (!n.hidden && n.offsetParent !== null ? n.textContent : '(oculta)') : null; }, sel);
    await p.evaluate(id => openReduceModal(id), mid); await p.waitForTimeout(300);
    const nSell = await noteVis('#reduceOverlay'); await p.evaluate(() => closeReduceModal());
    await p.evaluate(id => openReduceModal(id), cid); await p.waitForTimeout(300);
    const nCash = await noteVis('#reduceOverlay'); await p.evaluate(() => closeReduceModal());
    ok(`${T} venta: dice que Aurix registra y no mueve liquidez; retirada de liquidez: no lo dice`, /no mueve dinero/.test(nSell || '') && nCash === '(oculta)', nSell + ' / ' + nCash);
    await p.evaluate(() => switchLang('en')); await p.evaluate(id => openTxModal(id), mid); await p.waitForTimeout(300);
    const nEn = await noteVis('#txOverlay'); await p.evaluate(() => { closeTxModal(); switchLang('es'); });
    ok(`${T} EN: «does not move money»`, /does not move money/.test(nEn || ''), nEn);
    ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | ').slice(0, 200));
    await ctx.close();
  }
  await browser.close();
}
console.log('\n' + (fails.length ? 'NO-GO' : 'GO') + ` — ${pass}/${pass + fails.length}`);
if (fails.length) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
