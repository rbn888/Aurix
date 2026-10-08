#!/usr/bin/env node
/**
 * AURIX · CORRECCIÓN FX SIN RENTABILIDAD FICTICIA (SPEC 1, cierre) — demo aislada, navegador real.
 *   AURIX_DEMO_URL=http://127.0.0.1:8766/ node docs/financial-reliability/probe-fx-correction.mjs
 * Fixture SINTÉTICO, mercado CONSTANTE: 10.000 € en liquidez + 100 acciones USD a 100 $. Histórico
 * «antiguo» de 3 días: puntos de CLIENTE con el ancla 0,92 (10.000/0,92 + 10.000 = 20.869,57 $) y,
 * entre ellos, snapshots de SERVIDOR al tipo real (21.197 $). Arranque con tipo FECHADO 1,1197.
 * Contrato (tras la revisión financiera): NO se corrige con un apunte — se LIMITA con explicación.
 *   ventana que empieza en un punto antiguo (cliente o servidor) ⇒ sin variación publicada
 *   (control: el mismo cálculo sin el límite daría +1,57 % ficticio)
 *   ventana que empieza DESPUÉS del cambio, EUR real 1,1197 → 1,15: (11.500 − 11.197)/21.197 = +1,43 %
 * NO certifica snapshots reales del servidor: la demo no tiene `portfolio_snapshots` (ver registro).
 */
const O = String(process.env.AURIX_DEMO_URL || 'http://127.0.0.1:8766/').replace(/\/?$/, '/');
const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
const { chromium, webkit } = await import(PW);
let pass = 0; const fails = [];
const ok = (n, c, i) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (i ? '  [' + i + ']' : '')); console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } };
const H = 3600e3;
for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]].filter(e => (process.env.ENGINES || 'CR,WK').split(',').includes(e[0]))) {
  const browser = await launcher.launch(); const T = ENG; console.log('\n══ ' + T + ' ══');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(O + 'demo.html'); await p.check('input[value="premium"]'); await p.click('[data-demo=wealth]');
  await p.waitForURL(/index\.html/); await p.waitForTimeout(5000);
  // Cartera mixta y precios constantes; histórico antiguo con el ancla; tipo FECHADO en caché.
  await p.evaluate(H => {
    _applyCurrencyChange('USD');
    assets = [
      // Posiciones con su historia real (compradas hace 10 días), como las de una cuenta existente.
      { id: 'c_eur', name: 'Euros', ticker: 'EUR', type: 'cash', qty: 10000, price: 1, assetCurrency: 'EUR', costBasis: 10000, transactions: [{ type: 'buy', qty: 10000, price: 1, ts: Date.now() - 240 * H }] },
      { id: 's_usd', name: 'Acción USD', ticker: 'SUSD', type: 'stock', qty: 100, price: 100, assetCurrency: 'USD', costBasis: 10000, transactions: [{ type: 'buy', qty: 100, price: 100, ts: Date.now() - 240 * H }] } ];
    // Sin save(): el candado de integridad (correcto) bloquea escribir una cartera MENOR que la guardada.
    const now = Date.now(), legacy = 10000 / 0.92 + 10000, ch = [], ph = [];
    for (let t = now - 72 * H; t <= now - 2 * H; t += 2 * H) { ch.push({ ts: t, total: +legacy.toFixed(2), crypto: 0, stock: 10000, etf: 0, fund: 0, metal: 0, real_estate: 0, liquidity: +(legacy - 10000).toFixed(2), other: 0 }); ph.push({ ts: t, value: +legacy.toFixed(2) }); }
    localStorage.setItem('category_history', JSON.stringify(ch)); localStorage.setItem('portfolio_history', JSON.stringify(ph));
    categoryHistory = ch; portfolioHistory = ph;
    // Con sesión el gráfico lee la copia canónica REMOTA de esta misma serie; la demo no puede
    // sembrarla: se apunta a la serie local (la que el cliente genera), como tras reconciliar.
    _aurixCanonicalCatHistory = categoryHistory;
    // SNAPSHOTS DEL SERVIDOR (como en producción desde 2026-08-17): valoran EUR al tipo REAL; aquí,
    // entre los puntos del cliente (a > 60 min de ellos, así que sobreviven a la autoridad local).
    const real = 10000 * 1.1197 + 10000;
    _aurixBackendSnapshots = [];
    for (let t = now - 71 * H; t <= now - 3 * H; t += 2 * H) _aurixBackendSnapshots.push({ ts: t, total: +real.toFixed(2), total_value_usd: +real.toFixed(2), real_estate: 0, category_values: { stock: 10000, liquidity: 11197 }, source: 'backend_snapshot', confidence: 'scheduled' });
    localStorage.setItem('aurixCapitalFlows', '[]');
    // Antes del cambio: el cliente valoraba con el ancla (sin tipo fechado).
    localStorage.removeItem('aurix_fx_rates_v1'); _aurixFxCache = null; _aurixFxSyncEur();
    // ARRANQUE con tipo fechado, en el orden del arranque real: tipo → corrección → primer punto.
    localStorage.setItem('aurix_fx_rates_v1', JSON.stringify({ ts: now, rates: { EUR: 1.1197 }, at: { EUR: now } }));
    _aurixFxCache = null; _aurixFxSyncEur(); render(true);
  }, H);
  await p.waitForTimeout(500);
  const st1 = await p.evaluate(() => {
    try { recordCategorySnapshot && recordCategorySnapshot(); } catch (_) {} try { recordSnapshot(); } catch (_) {}
    const legCli = categoryHistory.filter(x => !x.fxBasis && x.ts > Date.now() - 864e5)[0], cur = categoryHistory[categoryHistory.length - 1];
    const srv = _aurixBackendSnapshots.filter(x => x.ts > Date.now() - 864e5)[0];
    const pr = (a, b) => _aurixComputePeriodReturn('24h', { ts: a.ts, value: toBase(a.total, 'USD') }, { ts: b.ts, value: toBase(b.total, 'USD') });
    const fromCli = pr(legCli, cur), fromSrv = pr(srv, cur);
    // CONTROL NEGATIVO: el mismo cálculo sin el límite (sin exposición EUR declarada) fabricaría +1,57 %.
    const keep = assets; assets = assets.filter(a => a.assetCurrency !== 'EUR'); const raw = pr(legCli, cur); assets = keep;
    const c7 = buildProductionPortfolioChart('7d'); const perf = _aurixInvestablePerformance('7d');
    const badge = document.getElementById('chartChange'); _aurixFxMarkBadge(badge);
    return { flows: _aurixLoadCapitalFlowsRaw().filter(x => /fx/.test(x.kind)).length, cli: [fromCli.returnPct, fromCli.returnSuppressedReason], srv: [fromSrv.returnPct, fromSrv.returnSuppressedReason],
             ctl: raw.returnPct, r7: [c7.returnPct, c7.returnState], perf: [perf.valid, perf.fallbackReason], last: cur, badge: badge.getAttribute('data-fx-explain'), legacyKept: categoryHistory.filter(x => Math.abs(x.total - 20869.57) < 0.01).length };
  });
  ok(`${T} no se crea ningún apunte técnico en el ledger (nada que pueda leerse como aportación)`, st1.flows === 0, String(st1.flows));
  ok(`${T} ventana desde un punto ANTIGUO de cliente: sin variación publicada (fx_basis_change), no +1,57 %`, st1.cli[0] == null && st1.cli[1] === 'fx_basis_change', JSON.stringify(st1.cli));
  ok(`${T} ventana desde un snapshot de SERVIDOR anterior: también limitada (no −/+ ficticio)`, st1.srv[0] == null && st1.srv[1] === 'fx_basis_change', JSON.stringify(st1.srv));
  ok(`${T} control negativo: sin el límite, el mismo cálculo daría +1,57 % ficticio`, Math.abs(st1.ctl - 1.569) < 0.01, String(st1.ctl));
  ok(`${T} 7D del gráfico y rentabilidad de Intelligence: no publicadas (fx_basis_change)`, st1.r7[0] == null && st1.perf[0] === false && st1.perf[1] === 'fx_basis_change', JSON.stringify([st1.r7, st1.perf]));
  ok(`${T} el punto nuevo declara su base (fxBasis 'dated', fxEurUsd 1,1197) y el histórico antiguo queda intacto`, st1.last.fxBasis === 'dated' && st1.last.fxEurUsd === 1.1197 && st1.legacyKept >= 30, JSON.stringify(st1.last));
  ok(`${T} la variación del gráfico explica la discontinuidad (accesible, no sólo hover)`, /Sin variación comparable/.test(st1.badge || ''), st1.badge);
  const facts = await p.evaluate(() => { try { const L = _aurixFactLedger(); const all = [].concat(L.facts || [], L.gaps || []); return all.filter(x => x && /investable_level_change/.test(x.semanticKey || x.key || '')).map(x => (x.reason || x.status || '') + ':' + (x.value != null ? x.value : '')); } catch (e) { return ['ERR ' + e.message]; } });
  ok(`${T} Intelligence no publica el salto como cambio de nivel patrimonial`, !facts.some(x => /^[^:]*:\s*[0-9-]/.test(x) && !/fx_basis_change|gap|incorporation|no_material/.test(x)), JSON.stringify(facts));
  // EVIDENCIA HISTÓRICA, no exposición actual (revisión financiera).
  const hist = await p.evaluate(() => {
    const b = _aurixFxBasisBoundary(), keep = assets;
    // (a) EUR vendido entero DESPUÉS del cambio: fila cerrada con operaciones anteriores ⇒ sigue limitado.
    assets = [{ id: 'c_eur', type: 'cash', qty: 0, price: 1, assetCurrency: 'EUR', lifecycleStatus: 'closed', transactions: [{ type: 'buy', qty: 10000, price: 1, ts: b - 864e5 }] },
              { id: 's_usd', type: 'stock', qty: 217, price: 100, assetCurrency: 'USD', transactions: [] }];
    const sold = _aurixFxBasisLimited(b - 3600e3);
    // (b) primer EUR añadido DESPUÉS del límite y ningún otro EUR antes ⇒ no se limita.
    assets = [{ id: 's_usd', type: 'stock', qty: 100, price: 100, assetCurrency: 'USD', transactions: [{ type: 'buy', qty: 100, price: 100, ts: b - 864e5 }] },
              { id: 'n_eur', type: 'stock', qty: 10, price: 100, assetCurrency: 'EUR', transactions: [{ type: 'buy', qty: 10, price: 100, ts: b + 3600e3 }] }];
    const later = _aurixFxBasisLimited(b - 3600e3);
    assets = keep;
    return { sold, later };
  });
  ok(`${T} EUR vendido tras el cambio (exposición actual 0): la ventana antigua SIGUE limitada`, hist.sold === true, JSON.stringify(hist));
  ok(`${T} primer EUR añadido después del cambio: no se limita sin motivo`, hist.later === false, JSON.stringify(hist));
  // MOVIMIENTO REAL DEL EUR en una ventana que empieza DESPUÉS del cambio: sí es variación.
  const real = await p.evaluate(() => {
    const first = categoryHistory[categoryHistory.length - 1];
    const now = Date.now(); localStorage.setItem('aurix_fx_rates_v1', JSON.stringify({ ts: now, rates: { EUR: 1.15 }, at: { EUR: now } }));
    _aurixFxCache = null; _aurixFxSyncEur(); try { recordCategorySnapshot && recordCategorySnapshot(); } catch (_) {} try { recordSnapshot(); } catch (_) {}
    const cur = categoryHistory[categoryHistory.length - 1];
    const c = _aurixComputePeriodReturn('24h', { ts: first.ts, value: toBase(first.total, 'USD') }, { ts: cur.ts, value: toBase(cur.total, 'USD') });
    return { r: c.returnPct, why: c.returnSuppressedReason, from: first.total, to: cur.total };
  });
  ok(`${T} ventana posterior al cambio, EUR real 1,1197 → 1,15: +1,43 % (tratamiento normal)`, Number.isFinite(real.r) && Math.abs(real.r - 1.4295) < 0.02, JSON.stringify(real));
  // TIPO ANTIGUO y AUSENCIA DE TIPO: la variación se marca aproximada y no se publica rentabilidad.
  for (const [lbl, cache] of [['tipo antiguo', { EUR: 1.1197, at: Date.now() - 3 * 864e5 }], ['sin tipo', null]]) {
    const r = await p.evaluate(c => {
      if (c) localStorage.setItem('aurix_fx_rates_v1', JSON.stringify({ ts: c.at, rates: { EUR: c.EUR }, at: { EUR: c.at } })); else localStorage.removeItem('aurix_fx_rates_v1');
      _aurixFxCache = null; _aurixFxSyncEur(); render(true); setUpdateStatus('ok');
      const badge = document.getElementById('chartChange'); _aurixFxMarkBadge(badge);
      const before = categoryHistory.length; try { recordCategorySnapshot && recordCategorySnapshot(); } catch (_) {} try { recordSnapshot(); } catch (_) {}
      const perf = _aurixInvestablePerformance('7d');
      return { badge: badge.getAttribute('data-fx-explain'), perf: perf.fallbackReason, valid: perf.valid, added: categoryHistory.length - before,
               hero: document.getElementById('totalValue').getAttribute('data-fx-explain'), cat: [...document.querySelectorAll('.cat-card-value[data-fx-approx]')].length };
    }, cache);
    ok(`${T} ${lbl}: variación marcada aproximada con explicación accesible`, /aproximada/.test(r.badge || ''), JSON.stringify(r));
    ok(`${T} ${lbl}: no se publica rentabilidad ni se persiste un punto autoritativo`, r.valid === false && r.perf === 'fx_rate_not_current' && r.added === 0, JSON.stringify(r));
    ok(`${T} ${lbl}: hero «≈» con explicación accesible y sólo las categorías afectadas marcadas`, !!r.hero && r.cat >= 1 && r.cat <= 2, JSON.stringify(r));
  }
  // Teclado: la explicación se abre con Enter sobre la cifra.
  await p.evaluate(() => document.getElementById('totalValue').focus()); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  ok(`${T} la explicación del «≈» se abre con teclado (Enter) y se cierra con Escape`, await p.evaluate(() => !!document.getElementById('aurixFxBubble')) && (await p.keyboard.press('Escape'), await p.evaluate(() => !document.getElementById('aurixFxBubble'))));
  // Cartera SÓLO USD: ni corrección ni avisos.
  const usd = await p.evaluate(() => {
    localStorage.setItem('aurixCapitalFlows', '[]'); assets = assets.filter(a => a.assetCurrency === 'USD');
    const now = Date.now(); localStorage.setItem('aurix_fx_rates_v1', JSON.stringify({ ts: now, rates: { GBP: 1.3 }, at: { GBP: now } }));
    _aurixFxCache = null; _aurixFxSyncEur(); const c = _aurixFxBasisLimited(0) ? 'limited' : null; render(true); setUpdateStatus('ok');
    const badge = document.getElementById('chartChange'); _aurixFxMarkBadge(badge);
    return { corr: c, hero: document.getElementById('totalValue').getAttribute('data-fx-approx'), badge: badge.getAttribute('data-fx-explain'), cat: document.querySelectorAll('.cat-card-value[data-fx-approx]').length };
  });
  ok(`${T} cartera sólo USD sin tipo EUR: ni límite ni avisos`, usd.corr === null && usd.hero == null && !usd.badge && usd.cat === 0, JSON.stringify(usd));
  // Inmueble en EUR con todo lo invertible en USD y tipo NO actual: lo invertible no usa EUR.
  const re = await p.evaluate(() => {
    assets.push({ id: 're_eur', name: 'Piso', ticker: 'PISO', type: 'real_estate', qty: 200000, price: 1, assetCurrency: 'EUR', costBasis: 200000, transactions: [] });
    const at = Date.now() - 3 * 864e5; localStorage.setItem('aurix_fx_rates_v1', JSON.stringify({ ts: at, rates: { EUR: 1.1197 }, at: { EUR: at } }));
    _aurixFxCache = null; _aurixFxSyncEur(); render(true); setUpdateStatus('ok');
    const badge = document.getElementById('chartChange'); _aurixFxMarkBadge(badge);
    const out = { perf: _aurixInvestablePerformance('7d').fallbackReason, hero: document.getElementById('totalValue').getAttribute('data-fx-approx'), badge: badge.getAttribute('data-fx-explain'),
      cats: [...document.querySelectorAll('.cat-card-value[data-fx-approx]')].map(v => v.closest('.cat-card').getAttribute('data-type')), present: [...document.querySelectorAll('.cat-card[data-type]')].map(c => c.getAttribute('data-type') + ':' + (c.querySelector('.cat-card-value') || {}).textContent).join(' ') };
    assets = assets.filter(a => a.id !== 're_eur'); return out;
  });
  ok(`${T} inmueble EUR + invertible USD con tipo no actual: rentabilidad, hero y variación SIN aviso; ninguna categoría invertible marcada (el inmueble no tiene tarjeta en el Dashboard)`, re.perf !== 'fx_rate_not_current' && re.hero == null && !re.badge && re.cats.every(c => c === 'real_estate'), JSON.stringify(re));
  // Base EUR con sólo activos USD y tipo caducado: el % no depende del tipo ⇒ no se suprime.
  const be = await p.evaluate(() => {
    const keep = assets; assets = [{ id: 's_usd', name: 'Acción USD', ticker: 'SUSD', type: 'stock', qty: 100, price: 100, assetCurrency: 'USD', costBasis: 10000, transactions: [{ type: 'buy', qty: 100, price: 100, ts: Date.now() - 240 * 3600e3 }] }];
    try { _applyCurrencyChange('EUR'); } catch (_) {} const at = Date.now() - 3 * 864e5; localStorage.setItem('aurix_fx_rates_v1', JSON.stringify({ ts: at, rates: { EUR: 1.1197 }, at: { EUR: at } }));
    _aurixFxCache = null; _aurixFxSyncEur(); const r = _aurixInvestablePerformance('7d').fallbackReason; assets = keep; try { _applyCurrencyChange('USD'); } catch (_) {} return r;
  });
  ok(`${T} base EUR con sólo activos USD y tipo caducado: la rentabilidad NO se suprime por el tipo`, be !== 'fx_rate_not_current', String(be));
  ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | ').slice(0, 200));
  await browser.close();
}
console.log('\n' + (fails.length ? 'NO-GO' : 'GO') + ` — ${pass}/${pass + fails.length}`);
if (fails.length) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
