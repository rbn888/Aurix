#!/usr/bin/env node
/**
 * AURIX · SONDA DE MONEDA DE DOCUMENTO (Workspace) — navegador real sobre la demo aislada.
 *   AURIX_DEMO_URL=http://127.0.0.1:8766/ AURIX_PW=/tmp/aurix-pw/node_modules/playwright/index.mjs \
 *     node docs/financial-reliability/probe-doc-currency.mjs
 * Fixtures sintéticos: B/C (base EUR → USD con documentos en EUR), E (documentos antiguos sin
 * moneda), F (fallo de almacenamiento y reintento). Los esperados están escritos a mano, no se
 * derivan del código probado: 1.000 € siguen siendo 1.000 € tras cambiar la base a USD.
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
    const T = ENG + '.' + W;
    console.log('\n══ ' + T + ' ══');
    const ctx = await browser.newContext({ viewport: { width: W, height: 860 }, hasTouch: W < 900 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(O + 'demo.html'); await p.check('input[value="premium"]'); await p.click('[data-demo=wealth]');
    await p.waitForURL(/index\.html/); await p.waitForTimeout(5000);
    await p.evaluate(() => { _applyCurrencyChange('EUR'); switchLang('es'); switchTab('workspace'); }); await p.waitForTimeout(1200);
    const txt = sel => p.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
    const save = async (btnSel, name) => {
      await p.locator(btnSel).first().click(); await p.waitForTimeout(500);
      const inp = p.locator('.ws-modal-overlay input'); if (await inp.count()) { await inp.first().fill(name); await p.keyboard.press('Enter'); }
      else { const upd = p.locator('.ws-modal-overlay button').filter({ hasText: /Actualizar|Update/ }); if (await upd.count()) await upd.first().click(); }
      await p.waitForTimeout(700);
    };

    // ── B/C · documentos nuevos nacen en la base visible y la conservan ──
    await p.evaluate(() => _wsOpenTool('compound')); await p.waitForTimeout(600);
    ok(`${T} compuesto nuevo nace en EUR (selector editable, unidad €)`, await p.evaluate(() => _wsDocCcy() === 'EUR' && !!document.querySelector('.wsccy-row:not(.is-pending) select') && /€/.test(document.querySelector('[data-wstool-input="initial"]').closest('.ws4-field-input').textContent)));
    await p.evaluate(() => { const el = document.querySelector('[data-wstool-input="initial"]'); el.value = '1000'; el.dispatchEvent(new Event('input', { bubbles: true })); const m = document.querySelector('[data-wstool-input="monthly"]'); m.value = '0'; m.dispatchEvent(new Event('input', { bubbles: true })); const r = document.querySelector('[data-wstool-input="ret"]'); r.value = '0'; r.dispatchEvent(new Event('input', { bubbles: true })); });
    await save('[data-wstool-save]', 'Compuesto EUR');
    const cmp = await p.evaluate(() => { const d = _ws4Projects().find(x => x.customName === 'Compuesto EUR'); return d && { cur: d.currency, ic: d.inputs.currency, rc: d.results.currency, fin: d.results.final }; });
    ok(`${T} compuesto guardado: moneda EUR en documento, entradas y resultado; 1.000 sin aportes ni tasa = 1.000`, cmp && cmp.cur === 'EUR' && cmp.ic === 'EUR' && cmp.rc === 'EUR' && cmp.fin === 1000, JSON.stringify(cmp));
    ok(`${T} documento guardado: la moneda ya no se puede cambiar`, await p.evaluate(() => !document.querySelector('.wsccy-row')));

    await p.evaluate(() => _wsOpenTool('loan')); await p.waitForTimeout(500);
    await p.evaluate(() => { const set = (k, v) => { const el = document.querySelector('[data-wstool-input="' + k + '"]'); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }; set('principal', '1000'); set('rate', '0'); set('years', '1'); set('fees', '0'); set('insurance', '0'); });
    await save('[data-wstool-save]', 'Préstamo EUR');
    const loan = await p.evaluate(() => { const d = _ws4Projects().find(x => x.customName === 'Préstamo EUR'); return d && { cur: d.currency, mp: d.results.monthlyPayment }; });
    ok(`${T} préstamo 1.000 a 0 % / 1 año = 83 €/mes (redondeo guardado) en EUR`, loan && loan.cur === 'EUR' && loan.mp === 83, JSON.stringify(loan));

    await p.evaluate(() => { localStorage.removeItem('aurix_ws_tool_state_v1'); _wsOpenTool('budget'); }); await p.waitForTimeout(500);
    await save('[data-wstool-save]', 'Presupuesto EUR');
    ok(`${T} presupuesto guardado en EUR`, await p.evaluate(() => (_ws4Projects().find(x => x.customName === 'Presupuesto EUR') || {}).currency === 'EUR'));
    await p.evaluate(() => { _wsgPrefill = 'wealth'; _wsOpenSurface('goals'); }); await p.waitForTimeout(600);
    await p.evaluate(() => { const r = document.querySelector('.wsh-wsg'); const s = (k, v) => { const e = r.querySelector('[data-wsg-form="' + k + '"]'); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }; s('name', 'Objetivo EUR'); s('target', '1000'); s('current', '250'); s('monthly', '0'); });
    await p.locator('[data-wsg-create]').first().click(); await p.waitForTimeout(700);
    const goal = await p.evaluate(() => { const g = _wsgGoals().find(x => x.name === 'Objetivo EUR'); return g && { cur: g.currency, pct: calculateGoalProgress(g, 0).pct }; });
    ok(`${T} objetivo nace en EUR y 250/1.000 = 25 %`, goal && goal.cur === 'EUR' && goal.pct === 25, JSON.stringify(goal));

    await p.evaluate(() => { localStorage.removeItem('aurix_ws_scn_params_v1'); _wsOpenSurface('scenario'); }); await p.waitForTimeout(600);
    await p.evaluate(() => { const el = document.querySelector('[data-wsb-param="baseManual"]'); el.value = '10000'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    ok(`${T} comparación nueva nace en EUR (selector editable)`, await p.evaluate(() => _wsbDocCcy() === 'EUR' && !!document.querySelector('.wsccy-row:not(.is-pending) select')));
    await save('[data-wsb2-save]', 'Comparación EUR');
    ok(`${T} comparación guardada en EUR`, await p.evaluate(() => { const d = _ws4Projects().find(x => x.customName === 'Comparación EUR'); return !!d && d.currency === 'EUR' && d.inputs.currency === 'EUR'; }));
    // CAMBIO DE BASE: EUR → USD. Nada guardado cambia de moneda ni de importe.
    await p.evaluate(() => _applyCurrencyChange('USD')); await p.waitForTimeout(900);
    const after = await p.evaluate(() => ({
      cmp: (d => d && [d.currency, d.results.final].join('|'))(_ws4Projects().find(x => x.customName === 'Compuesto EUR')),
      goal: (g => g && [g.currency, g.target].join('|'))(_wsgGoals().find(x => x.name === 'Objetivo EUR')),
    }));
    ok(`${T} tras pasar la base a USD los documentos siguen en EUR con los mismos importes`, after.cmp === 'EUR|1000' && after.goal === 'EUR|1000', JSON.stringify(after));
    await p.evaluate(() => { const d = _ws4Projects().find(x => x.customName === 'Compuesto EUR'); _wsOpenTool('compound', d.id); }); await p.waitForTimeout(600);
    const shown = await p.evaluate(() => ({ unit: document.querySelector('[data-wstool-input="initial"]').closest('.ws4-field-input').textContent.trim(), final: (document.querySelector('.wstool-res-final') || {}).textContent }));
    ok(`${T} reabierto con base USD: unidad € y resultado «1.000,00 €» (no «$»)`, /€/.test(shown.unit) && /1\.?000,00\s*€/.test(shown.final || '') && !/\$/.test(shown.final || ''), JSON.stringify(shown));
    await p.evaluate(() => { const el = document.querySelector('[data-wstool-input="initial"]'); el.value = '1200'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await save('[data-wstool-save]', '');
    ok(`${T} re-guardar con base USD conserva EUR (antes re-sellaba la base)`, await p.evaluate(() => { const d = _ws4Projects().find(x => x.customName === 'Compuesto EUR'); return d.currency === 'EUR' && d.results.currency === 'EUR' && d.results.final === 1200; }));
    const plans = await p.evaluate(() => { try { return _wsPlansDocs().filter(d => d.customName === 'Presupuesto EUR').map(d => _wsPlanMetrics(d).map(m => m.v).join(' ')).join(' | ') + ' || ' + _wsPlanMetrics(_ws4Projects().find(x => x.customName === 'Compuesto EUR')).map(m => m.v).join(' ') + ' || ' + _wsToolDocSummary(_ws4Projects().find(x => x.customName === 'Préstamo EUR')).map(m => m.v).join(' '); } catch (e) { return 'ERR ' + e.message; } });
    ok(`${T} «Tus planes» (presupuesto), tarjeta del compuesto y «Mis documentos» (préstamo) en € con base USD`, /^[^|]*€[^|]* \|\| [^|]*€[^|]* \|\| .*€/.test(plans) && !/\$/.test(plans), plans);
    await p.evaluate(() => { _wsOpenSurface('goals'); }); await p.waitForTimeout(500);
    const gkpi = await p.evaluate(() => { const g = _wsgGoals().find(x => x.name === 'Objetivo EUR'); return _wsGoalMetrics(g).map(m => m.v).join(' ') + ' / ' + (document.querySelector('[data-wsg-cardid="' + g.id + '"]') || {}).textContent; });
    ok(`${T} objetivo EUR sigue en € con base USD (métricas y tarjeta)`, /250,00\s*€/.test(gkpi) && /1\.?000,00\s*€/.test(gkpi) && !/US\$|\$\s?\d|\d\s?\$/.test(gkpi), gkpi.slice(0, 160));
    // Documento NUEVO tras el cambio: nace en USD.
    await p.evaluate(() => { localStorage.removeItem('aurix_ws_tool_state_v1'); _wsOpenTool('budget'); }); await p.waitForTimeout(500);
    ok(`${T} presupuesto nuevo con base USD nace en USD`, await p.evaluate(() => _wsDocCcy() === 'USD'));

    await p.evaluate(() => _wsbOpenDoc(_ws4Projects().find(x => x.customName === 'Comparación EUR').id)); await p.waitForTimeout(600);
    const scn = await p.evaluate(() => ({ c: _wsbDocCcy(), out: (document.querySelector('[data-wsb2-out]') || {}).textContent || '' }));
    ok(`${T} comparación reabierta con base USD sigue en € (no $)`, scn.c === 'EUR' && /€/.test(scn.out) && !/\$/.test(scn.out), scn.c + ' ' + scn.out.replace(/\s+/g, ' ').slice(0, 120));
    await p.evaluate(() => {
      const list = JSON.parse(localStorage.getItem('aurix_ws_projects_v1') || '[]');
      list.push({ id: 'ws4_legacy_scn', type: 'scenario_compare', customName: 'Comparación antigua', inputs: { baseMode: 'manual', baseManual: '3000', years: 10, ret: 6, baseMonthly: '0', altMonthly: '100', altRet: 6 }, results: { baseFinal: 1, altFinal: 2, diff: 1 }, revision: 1, createdAt: 1, updatedAt: 1 });
      localStorage.setItem('aurix_ws_projects_v1', JSON.stringify(list));
      _wsbOpenDoc('ws4_legacy_scn');
    }); await p.waitForTimeout(600);
    const ls = await p.evaluate(() => ({ c: _wsbDocCcy(), pending: !!document.querySelector('.wsccy-row.is-pending'), out: (document.querySelector('[data-wsb2-out]') || {}).textContent || '' }));
    ok(`${T} comparación antigua: no hereda la del borrador anterior, queda sin confirmar y sin símbolo`, ls.c === null && ls.pending && !/[€$]/.test(ls.out), JSON.stringify({ c: ls.c, p: ls.pending, o: ls.out.replace(/\s+/g, ' ').slice(0, 80) }));
    // ── E · documentos ANTIGUOS sin moneda: no se les asigna la base ──
    await p.evaluate(() => {
      const list = JSON.parse(localStorage.getItem('aurix_ws_projects_v1') || '[]');
      list.push({ id: 'ws4_legacy_cmp', type: 'compound_growth', customName: 'Antiguo sin moneda', inputs: { initial: 5000, monthly: 0, ret: 0, years: 5 }, results: { final: 5000, contributed: 5000 }, revision: 1, createdAt: 1, updatedAt: 1 });
      localStorage.setItem('aurix_ws_projects_v1', JSON.stringify(list));
      const gl = JSON.parse(localStorage.getItem('aurix_ws_goals_v1') || '[]');
      gl.push({ id: 'wsg_legacy', type: 'wealth', name: 'Objetivo antiguo', target: 2000, current: 500, monthly: 0, mode: 'manual', createdAt: 1, updatedAt: 1 });
      localStorage.setItem('aurix_ws_goals_v1', JSON.stringify(gl));
    });
    await p.evaluate(() => _wsOpenTool('compound', 'ws4_legacy_cmp')); await p.waitForTimeout(600);
    const leg = await p.evaluate(() => ({ ccy: _wsDocCcy(), pending: !!document.querySelector('.wsccy-row.is-pending'), final: (document.querySelector('.wstool-res-final') || {}).textContent, unit: document.querySelector('[data-wstool-input="initial"]').closest('.ws4-field-input').textContent.trim(), sel: (document.querySelector('.wsccy-row.is-pending select') || {}).value }));
    ok(`${T} antiguo sin moneda: «sin confirmar», sin preselección, cifra sin símbolo y sin unidad`, leg.ccy === null && leg.pending && leg.sel === '' && /^5\.?000,00$/.test((leg.final || '').trim()) && !/[€$]/.test(leg.unit), JSON.stringify(leg));
    const legPlan = await p.evaluate(() => _wsPlanMetrics(_ws4Projects().find(x => x.id === 'ws4_legacy_cmp')).map(m => m.v).join(' '));
    ok(`${T} «Tus planes» no le inventa símbolo al antiguo`, /5\.?000/.test(legPlan) && !/[€$]/.test(legPlan), legPlan);
    await p.locator('.wsccy-row.is-pending [data-wsccy-confirm]').first().click(); await p.waitForTimeout(300);
    ok(`${T} confirmar sin elegir no asigna nada`, await p.evaluate(() => _wsDocCurrencyOf(_ws4Projects().find(x => x.id === 'ws4_legacy_cmp')) === null));
    await p.selectOption('.wsccy-row.is-pending select', 'GBP'); await p.waitForTimeout(200);
    ok(`${T} elegir sin confirmar no asigna nada`, await p.evaluate(() => _wsDocCurrencyOf(_ws4Projects().find(x => x.id === 'ws4_legacy_cmp')) === null));
    await p.locator('.wsccy-row.is-pending [data-wsccy-confirm]').first().click(); await p.waitForTimeout(500);
    const conf = await p.evaluate(() => { const d = _ws4Projects().find(x => x.id === 'ws4_legacy_cmp'); return { c: d.currency, ic: d.inputs.currency, init: d.inputs.initial, fin: d.results.final, shown: (document.querySelector('.wstool-res-final') || {}).textContent }; });
    ok(`${T} confirmar GBP declara la moneda sin tocar importes (5.000 → 5.000 £)`, conf.c === 'GBP' && conf.ic === 'GBP' && conf.init === 5000 && conf.fin === 5000 && /5\.?000,00\s*(£|GBP)/.test(conf.shown || ''), JSON.stringify(conf));
    await p.evaluate(() => _wsOpenSurface('goals')); await p.waitForTimeout(500);
    const lg = await p.evaluate(() => { const c = document.querySelector('[data-wsg-cardid="wsg_legacy"]'); return { pending: !!(c && c.querySelector('.wsccy-row.is-pending')), m: _wsGoalMetrics(_wsgGoals().find(x => x.id === 'wsg_legacy')).map(x => x.v).join(' ') }; });
    ok(`${T} objetivo antiguo: pendiente y métricas sin símbolo`, lg.pending && /500,00/.test(lg.m) && !/[€$]/.test(lg.m), JSON.stringify(lg));

    ok(`${T} evidencia: filas reales del Diario/Precios sí; el sello del último guardado NO acredita la moneda`, await p.evaluate(() =>
      _wsDocCurrencyOf({ type: 'trade_journal', currency: 'EUR', results: { currency: 'USD' }, inputs: {} }) === 'USD'
      && _wsDocCurrencyOf({ type: 'monthly_budget', currency: 'EUR', inputs: {} }) === null
      && _wsDocCurrencyOf({ type: 'compound_growth', currency: 'EUR', results: { currency: 'EUR' }, inputs: {} }) === null
      && _wsDocCurrencyOf({ type: 'compound_growth', inputs: { currency: 'EUR' } }) === 'EUR'));
    // CASO: documento creado con base EUR y RE-GUARDADO por la versión anterior tras pasar la base a USD
    // ⇒ sello «USD» sobre importes tecleados en euros. No se acredita: sin confirmar, importes intactos.
    await p.evaluate(() => {
      const list = JSON.parse(localStorage.getItem('aurix_ws_projects_v1') || '[]');
      list.push({ id: 'ws4_resealed', type: 'monthly_budget', customName: 'Re-sellado', currency: 'USD', inputs: { salary: 2500, housing: 700 }, results: { income: 2500, expenses: 700, free: 1800 }, revision: 3, createdAt: 1, updatedAt: 2 });
      localStorage.setItem('aurix_ws_projects_v1', JSON.stringify(list));
    });
    await p.evaluate(() => _wsOpenTool('budget', 'ws4_resealed')); await p.waitForTimeout(500);
    const rs = await p.evaluate(() => ({ ccy: _wsDocCcy(), pending: !!document.querySelector('.wsccy-row.is-pending'), plan: _wsPlanMetrics(_ws4Projects().find(x => x.id === 'ws4_resealed')).map(m => m.v).join(' '), inp: JSON.stringify(_ws4Projects().find(x => x.id === 'ws4_resealed').inputs) }));
    ok(`${T} base cambiada ANTES del último guardado: «sin confirmar», sin $ ni €, importes intactos`, rs.ccy === null && rs.pending && !/[€$]/.test(rs.plan) && /1\.?800/.test(rs.plan) && rs.inp === '{"salary":2500,"housing":700}', JSON.stringify(rs));
    // ── F · fallo de almacenamiento: nada se marca guardado y el trabajo se conserva ──
    await p.evaluate(() => _wsOpenTool('compound', _ws4Projects().find(x => x.customName === 'Compuesto EUR').id)); await p.waitForTimeout(500);
    await p.evaluate(() => { const el = document.querySelector('[data-wstool-input="initial"]'); el.value = '7777'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await p.evaluate(() => { const real = Storage.prototype.setItem; window.__realSet = real; Storage.prototype.setItem = function (k, v) { if (k === 'aurix_ws_projects_v1') throw new Error('QuotaExceededError'); return real.call(this, k, v); }; });
    await save('[data-wstool-save]', '');
    const f1 = await p.evaluate(() => ({ st: (document.querySelector('.wsg-savestate') || {}).textContent, err: !!document.querySelector('.wsg-reqerr'), init: _wsToolInputs.initial, stored: _ws4Projects().find(x => x.customName === 'Compuesto EUR').inputs.initial }));
    ok(`${T} fallo al guardar: no dice «Guardado», muestra el error y conserva lo escrito`, !/^Guardado$/.test((f1.st || '').trim()) && f1.err && String(f1.init) === '7777' && Number(f1.stored) === 1200, JSON.stringify(f1));
    await p.evaluate(() => { Storage.prototype.setItem = window.__realSet; });
    await save('[data-wstool-save]', '');
    ok(`${T} reintento tras el fallo: guarda 7.777`, await p.evaluate(() => Number(_ws4Projects().find(x => x.customName === 'Compuesto EUR').inputs.initial) === 7777 && /Guardado/.test(document.querySelector('.wsg-savestate').textContent)));
    // Objetivo: el fallo no descarta la copia de trabajo
    await p.evaluate(() => _wsOpenSurface('goals')); await p.waitForTimeout(400);
    await p.evaluate(() => { const g = _wsgGoals().find(x => x.name === 'Objetivo EUR'); _wsgEnsureWorking(g.id).current = '400'; _wsgDirty[g.id] = true; Storage.prototype.setItem = function (k, v) { if (k === 'aurix_ws_goals_v1') throw new Error('Quota'); return window.__realSet.call(this, k, v); }; _wsgSaveGoal(g.id); });
    const gf = await p.evaluate(() => { const g = _wsgGoals().find(x => x.name === 'Objetivo EUR'); return { working: !!_wsgWorking[g.id], dirty: !!_wsgDirty[g.id], stored: g.current }; });
    await p.evaluate(() => { Storage.prototype.setItem = window.__realSet; });
    ok(`${T} objetivo: fallo de escritura conserva la edición pendiente`, gf.working && gf.dirty && Number(gf.stored) === 250, JSON.stringify(gf));

    // ── RECARGA · todo sobrevive ──
    await p.reload(); await p.waitForTimeout(5000);
    const rl = await p.evaluate(() => ({ base: baseCurrency, cmp: (d => d && d.currency + '|' + d.inputs.initial)(_ws4Projects().find(x => x.customName === 'Compuesto EUR')), leg: (d => d && d.currency)(_ws4Projects().find(x => x.id === 'ws4_legacy_cmp')), goal: (g => g && g.currency)(_wsgGoals().find(x => x.name === 'Objetivo EUR')) }));
    ok(`${T} tras recargar: base USD, documentos EUR/GBP intactos`, rl.base === 'USD' && rl.cmp === 'EUR|7777' && rl.leg === 'GBP' && rl.goal === 'EUR', JSON.stringify(rl));
    // ── EN ──
    await p.evaluate(() => { switchLang('en'); switchTab('workspace'); _wsOpenSurface('goals'); }); await p.waitForTimeout(700);
    const en = await p.evaluate(() => (document.querySelector('[data-wsg-cardid="wsg_legacy"] .wsccy-row') || {}).textContent || '');
    ok(`${T} EN: aviso «Currency not confirmed»`, /Currency not confirmed/.test(en), en.slice(0, 80));
    await p.evaluate(() => switchLang('es'));
    ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | ').slice(0, 200));
    await ctx.close();
  }
  await browser.close();
}
console.log('\n' + (fails.length ? 'NO-GO' : 'GO') + ` — ${pass}/${pass + fails.length}`);
if (fails.length) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
