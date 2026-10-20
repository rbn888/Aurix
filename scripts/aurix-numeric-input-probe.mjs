// AURIX · LOTE 1 · P0 INTEGRIDAD NUMÉRICA — sonda de pulsaciones reales y persistencia.
// Teclea de verdad (teclado de Playwright) en los campos numéricos de cartera, envía los
// formularios reales y lee lo PERSISTIDO en `assets`. Chromium + WebKit · 390 + 1440 · ES + EN.
// Carteras SINTÉTICAS (scripts/_ffn-lib.mjs): nunca datos de un usuario real.
// Uso: node scripts/aurix-numeric-input-probe.mjs
import { serve, chromium, webkit, page } from './_ffn-lib.mjs';

let pass = 0; const fails = [];
const ok = (n, c, info) => { if (c) pass++; else { fails.push(n + (info ? '  [' + info + ']' : '')); console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };

const BASE = [
  { id: 'a_btc', type: 'crypto', ticker: 'BTC', marketSymbol: 'BTC', coinId: 'bitcoin', name: 'Bitcoin', qty: 0.123456789012, price: 65000.12, costBasis: 8024.69, assetCurrency: 'USD', transactions: [{ type: 'buy', qty: 0.123456789012, price: 65000.12, ts: 1 }] },
  { id: 'a_xrp', type: 'crypto', ticker: 'XRP', marketSymbol: 'XRP', coinId: 'ripple', name: 'XRP', qty: 100, price: 2.345, costBasis: 200, assetCurrency: 'USD', transactions: [{ type: 'buy', qty: 100, price: 2, ts: 2 }] },
  { id: 'a_old', type: 'stock', ticker: 'OLD', marketSymbol: 'OLD', name: 'Legado', qty: 1, price: 2446.77, costBasis: 244677, assetCurrency: 'USD', transactions: [{ type: 'buy', qty: 1, price: 244677, ts: 3 }] },
  { id: 'a_re', type: 'real_estate', ticker: 'RE', name: 'Piso', qty: 250000.5, price: 1, costBasis: 250000.5, rent: 1200, assetCurrency: 'EUR', transactions: [] },
];
const BTC = { ticker: 'BTC', name: 'Bitcoin', type: 'crypto', coinId: 'bitcoin', marketSymbol: 'BTC', assetCurrency: 'USD' };

const { s, url } = await serve();
for (const [ENG, L] of [['CR', chromium], ['WK', webkit]]) {
  const browser = await L.launch();
  for (const w of [390, 1440]) for (const lang of ['es', 'en']) {
    const T = `${ENG}.${w}.${lang}`;
    const P = await page(browser, url, { w, lang, assets: BASE });
    const { p, ev } = P;
    const row = id => ev(`JSON.stringify(assets.find(a => a.id === ${JSON.stringify(id)}) || null)`).then(JSON.parse);
    const btc = () => ev(`JSON.stringify(assets.filter(a => a.ticker === 'BTC' && a.type === 'crypto'))`).then(JSON.parse);
    const typeIn = async (sel, txt) => { await p.fill(sel, ''); await p.click(sel); await p.keyboard.type(txt); };
    const hint = sel => ev(`(function(){ var el = document.querySelector(${JSON.stringify(sel)}); var h = el && el.__aurixNumHint; return h && !h.hidden ? h.textContent : ''; })()`);
    const open = () => ev(`modalOverlay.classList.contains('open')`);
    const closeAll = () => ev(`(function(){ try { if (modalOverlay.classList.contains('open')) closeModal(); } catch (_) {} try { closeTxModal(); } catch (_) {} try { closeAssetDetailModal(); } catch (_) {} })()`);
    // Alta real de BTC: abre el formulario con la selección, fija el precio de mercado (lo que haría la
    // consulta de precio), TECLEA cantidad y precio de compra, sale del campo y envía.
    const addBtc = async (qtyTxt, ppTxt, submits = 1) => {
      await closeAll();
      await ev(`_openAddAssetWithFund(${JSON.stringify(BTC)})`); await p.waitForTimeout(450);
      await ev(`pendingPrice = 65000; pendingCurrency = 'USD';`);
      await typeIn('#assetQty', qtyTxt);
      if (ppTxt != null) await typeIn('#assetPurchasePrice', ppTxt);
      await p.click('#assetQty'); await p.keyboard.press('Tab');   // blur real
      const shownQty = await ev(`qtyInput.value`);
      const before = (await btc())[0];
      const hints = [];
      for (let i = 0; i < submits; i++) { await ev(`assetForm.requestSubmit()`); await p.waitForTimeout(300); hints.push(await hint('#assetQty')); }
      const after = (await btc())[0];
      const added = +(after.qty - before.qty).toPrecision(12);
      const lastTx = after.transactions[after.transactions.length - 1];
      return { shownQty, added, txPrice: added ? lastTx.price : null, txQty: added ? lastTx.qty : null, hints, stillOpen: await open() };
    };

    // ── 0 · legado del parser antiguo (precio crudo sin marca): se sigue corrigiendo como en producción
    { const r = await row('a_old');
      ok(`${T} 0 operación legada 244677 se muestra 2446.77, como en v851`, r.transactions[0].price === 2446.77, JSON.stringify(r.transactions[0])); }
    // ── A · decimales en cantidad y precio de compra (el defecto confirmado) ──────────────
    const dec = lang === 'es' ? ',' : '.';
    for (const [q, want] of [['0.2', 0.2], ['0,2', 0.2], ['0.0015', 0.0015], ['1.5', 1.5]]) {
      const r = await addBtc(q, '300.50');
      ok(`${T} A cantidad «${q}» se guarda ${want}`, r.txQty === want && r.added === want, JSON.stringify(r));
      ok(`${T} A precio de compra «300.50» se guarda 300.5`, r.txPrice === 300.5, JSON.stringify(r));
      ok(`${T} A al salir del campo se ve en forma canónica`, r.shownQty === String(want).replace('.', dec), r.shownQty);
      ok(`${T} A el alta cierra el formulario`, r.stillOpen === false);
    }
    // ── B · importes grandes y miles explícitos ───────────────────────────────────────────
    { const r = await addBtc('2', lang === 'es' ? '1.234.567,89' : '1,234,567.89');
      ok(`${T} B precio grande con miles y decimales`, r.txPrice === 1234567.89, JSON.stringify(r)); }
    // ── C · ambiguo de miles en UNIDADES: se detiene, lo dice, y sólo el segundo envío confirma ──
    { const amb = lang === 'es' ? '1.000' : '1,000';
      const r1 = await addBtc(amb, null, 1);
      ok(`${T} C «${amb}» no se guarda en el primer envío`, r1.added === 0 && r1.stillOpen === true, JSON.stringify(r1));
      ok(`${T} C y la pista lo explica antes de guardar`, /1000|1,000/.test(r1.hints[0]) && r1.hints[0].length > 10, r1.hints[0]);
      await ev(`assetForm.requestSubmit()`); await p.waitForTimeout(300);
      const after = (await btc())[0];
      ok(`${T} C el segundo envío confirma: se guarda 1000`, after.transactions[after.transactions.length - 1].qty === 1000, JSON.stringify(after.transactions.slice(-1))); }
    // ── C2 · un entero NO ambiguo no se confirma aunque su forma canónica lo parezca ───────
    { const r = await addBtc(lang === 'es' ? '12345' : '2500', null, 1);
      ok(`${T} C2 «${lang === 'es' ? '12345' : '2500'}» se guarda al primer envío, sin pedir confirmación`, r.added === (lang === 'es' ? 12345 : 2500) && r.stillOpen === false && !r.hints[0], JSON.stringify(r)); }
    // ── C3 · precio legítimo > 100.000 sobrevive a varios renders y a recargar ──────────────
    { const r = await addBtc('1', lang === 'es' ? '700000' : '700000');
      await ev('render(true); render(true);');
      const tx = (await btc())[0].transactions.slice(-1)[0];
      ok(`${T} C3 precio de compra 700000 (BRK.A) intacto tras renders`, r.txPrice === 700000 && tx.price === 700000 && tx.pv === 2, JSON.stringify(tx)); }
    // ── D · el decimal ambiguo se lee como decimal y se dice ───────────────────────────────
    { const amb = lang === 'es' ? '1,234' : '1.234';
      await closeAll(); await ev(`_openAddAssetWithFund(${JSON.stringify(BTC)})`); await p.waitForTimeout(450);
      await typeIn('#assetQty', amb);
      ok(`${T} D «${amb}» = 1,234 con pista visible`, (await ev(`_aurixReadNumberInput(qtyInput)`)) === 1.234 && (await hint('#assetQty')).length > 10, await hint('#assetQty')); }
    // ── E · inválidos, vacío y negativo: nunca un alta silenciosa ───────────────────────────
    for (const bad of ['', '-5', '1.2.3']) {
      const r = await addBtc(bad, null);
      ok(`${T} E «${bad}» no guarda nada`, r.added === 0, JSON.stringify(r));
    }
    { await typeIn('#assetQty', '12abc'); ok(`${T} E letras filtradas al teclear`, (await ev('qtyInput.value')) === '12'); }
    { await typeIn('#assetQty', '1.2.3'); await p.keyboard.press('Tab');
      ok(`${T} E texto inválido lo dice bajo el campo`, (await hint('#assetQty')).length > 10, await hint('#assetQty')); }
    await closeAll();

    // ── F · liquidez con decimales ─────────────────────────────────────────────────────────
    { const before = await ev(`assets.filter(a => a.type === 'cash').length`);
      await ev(`openLiquidityModal()`); await p.waitForTimeout(300);
      await typeIn('#liquidityQty', lang === 'es' ? '1500,50' : '1,500.50');
      await ev(`liquidityForm.requestSubmit()`); await p.waitForTimeout(400);
      const cash = await ev(`JSON.stringify(assets.filter(a => a.type === 'cash').map(a => a.qty))`).then(JSON.parse);
      ok(`${T} F liquidez «${lang === 'es' ? '1500,50' : '1,500.50'}» se guarda 1500.5`, cash.length === before + 1 && cash.includes(1500.5), JSON.stringify(cash)); }

    // ── G · editar inmueble y guardar SIN cambios: valor y alquiler idénticos (===) ────────
    { await ev(`openEditRealEstateModal('a_re')`); await p.waitForTimeout(400);
      await p.click('#reRent'); await p.keyboard.press('Tab');           // tocar y salir no es cambiar
      await ev(`assetForm.requestSubmit()`); await p.waitForTimeout(400);
      const r = await row('a_re');
      ok(`${T} G inmueble sin cambios: valor 250000.5 y alquiler 1200 intactos`, r.qty === 250000.5 && r.rent === 1200, JSON.stringify({ qty: r.qty, rent: r.rent })); }
    // ── H · cambio de idioma con el formulario abierto ─────────────────────────────────────
    { const other = lang === 'es' ? 'en' : 'es';
      await ev(`openEditRealEstateModal('a_re')`); await p.waitForTimeout(400);
      await ev(`switchLang(${JSON.stringify(other)})`); await p.waitForTimeout(300);
      await ev(`assetForm.requestSubmit()`); await p.waitForTimeout(400);
      let r = await row('a_re');
      ok(`${T} H rellenado y sin tocar: sobrevive al cambio de idioma`, r.qty === 250000.5 && r.rent === 1200, JSON.stringify({ qty: r.qty, rent: r.rent }));
      await ev(`switchLang(${JSON.stringify(lang)})`); await p.waitForTimeout(300);
      await ev(`openEditRealEstateModal('a_re')`); await p.waitForTimeout(400);
      await typeIn('#reRent', lang === 'es' ? '1.300' : '1,300');
      await ev(`switchLang(${JSON.stringify(other)})`); await p.waitForTimeout(300);
      await ev(`assetForm.requestSubmit()`); await p.waitForTimeout(400);
      r = await row('a_re');
      ok(`${T} H tecleado: se lee en el idioma en que se tecleó (1300)`, r.rent === 1300, JSON.stringify({ rent: r.rent }));
      await ev(`switchLang(${JSON.stringify(lang)})`); await p.waitForTimeout(300); await closeAll(); }

    // ── I · editar una operación y guardar SIN cambios: qty y precio idénticos (===) ───────
    { await ev(`openAssetDetailModal('a_btc')`); await p.waitForTimeout(400);
      const n0 = (await row('a_btc')).transactions.length;
      await ev(`(function(){ var b = document.querySelector('#adTxList .ad-tx-edit[data-index="0"]') || document.querySelector('#adTxList .ad-tx-edit'); if (b) b.click(); })()`); await p.waitForTimeout(400);
      const shown = await ev(`txQtyInput.value + ' / ' + txPriceInput.value`);
      await ev(`txForm.requestSubmit()`); await p.waitForTimeout(400);
      const tx = (await row('a_btc')).transactions;
      ok(`${T} I edición sin cambios: 0.123456789012 BTC a 65000.12 intactos`, tx.length === n0 && tx[0].qty === 0.123456789012 && tx[0].price === 65000.12, shown + ' → ' + JSON.stringify(tx[0]));
      await closeAll(); }
    // ── J · precio SUGERIDO de una operación nueva (XRP a 2,345) ───────────────────────────
    { await ev(`openTxModal('a_xrp')`); await p.waitForTimeout(300);
      await typeIn('#txQty', '10');
      await ev(`txForm.requestSubmit()`); await p.waitForTimeout(400);
      const tx = (await row('a_xrp')).transactions; const last = tx[tx.length - 1];
      ok(`${T} J precio sugerido 2.345 se guarda 2.345 (no 2345)`, last.qty === 10 && last.price === 2.345, JSON.stringify(last));
      await closeAll(); }
    // ── K · añadir a posición con decimales ────────────────────────────────────────────────
    { const q0 = (await row('a_btc')).qty;
      await ev(`openAddModal('a_btc')`); await p.waitForTimeout(300);
      await typeIn('#addQty', '0.5');
      await ev(`document.getElementById('addForm').requestSubmit()`); await p.waitForTimeout(400);
      const q1 = (await row('a_btc')).qty;
      ok(`${T} K añadir «0.5» suma 0.5`, Math.abs(q1 - q0 - 0.5) < 1e-12, `${q0} → ${q1}`); }
    // ── L · autorrelleno ISIN del precio manual: exacto, también por debajo de 1e-4 ────────
    for (const px of [45.1234, 0.00001234, 123.45]) {
      await closeAll(); await ev(`openModal({ skipPicker: true }); enterManualMode('IE00B4L5Y983', { price: ${px}, name: 'Fondo' })`); await p.waitForTimeout(300);
      ok(`${T} L precio ISIN ${px} se lee ${px}`, (await ev(`_aurixReadNumberInput(document.getElementById('manualPrice'))`)) === px, await ev(`document.getElementById('manualPrice').value`));
    }
    await closeAll();

    // ── M · identidad y duplicados: todas las altas de BTC caen en UNA fila ────────────────
    ok(`${T} M sin filas BTC duplicadas tras todas las altas`, (await btc()).length === 1, String((await btc()).length));
    ok(`${T} M sin errores de página`, P.errs.length === 0, P.errs.slice(0, 3).join(' | '));
    await P.ctx.close();
  }
  await browser.close();
}
s.close();
console.log(`\n${pass} passed · ${fails.length} failed`);
console.log(fails.length ? 'RESULT: FAIL' : 'RESULT: PASS');
process.exit(fails.length ? 1 : 0);
