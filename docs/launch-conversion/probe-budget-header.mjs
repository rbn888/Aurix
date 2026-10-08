#!/usr/bin/env node
/**
 * AURIX · SPEC 2 — PRESUPUESTO: cabecera compacta (moneda + periodo) y tres cifras debajo.
 *   AURIX_DEMO_URL=http://127.0.0.1:8777/ node docs/launch-conversion/probe-budget-header.mjs
 */
const O = String(process.env.AURIX_DEMO_URL || 'http://127.0.0.1:8777/').replace(/\/?$/, '/');
const { chromium, webkit } = await import(process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs');
let pass = 0; const fails = []; const ok = (n, c, i) => { if (c) { pass++; } else { fails.push(n); console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } };
for (const [E, eng] of [['CR', chromium], ['WK', webkit]]) { const b = await eng.launch();
  for (const W of [320, 390, 1440]) for (const L of ['es', 'en']) {
    const T = `${E}.${W}.${L}`;
    const p = await (await b.newContext({ viewport: { width: W, height: 860 }, hasTouch: W < 900 })).newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(O + 'demo.html'); await p.check('input[value="premium"]'); await p.click('[data-demo=wealth]'); await p.waitForURL(/index\.html/); await p.waitForTimeout(4500);
    await p.evaluate(l => { switchLang(l); localStorage.removeItem('aurix_ws_tool_state_v1'); switchTab('workspace'); }, L); await p.waitForTimeout(800);
    await p.evaluate(() => _wsOpenTool('budget')); await p.waitForTimeout(800);
    const m = await p.evaluate(() => {
      const card = document.querySelector('[data-wsbud-top]'); const ctl = card && card.querySelector('.wsbud-controls');
      const kpis = card ? [...card.querySelectorAll('.wsbud-kpi')] : [];
      const ccySel = ctl && ctl.querySelector('select[data-wsccy-scope]'); const per = ctl && ctl.querySelector('[data-wsbud-period]');
      const r = c => c.getBoundingClientRect();
      const ctlBottom = ctl ? r(ctl).bottom : 0, kTop = kpis.length ? Math.min(...kpis.map(k => r(k).top)) : 0;
      const over = document.documentElement.scrollWidth > innerWidth || (card && [...card.querySelectorAll('*')].some(e => { const q = r(e); return q.width && q.right > r(card).right + 1; }));
      return { rowBefore: !!document.querySelector('.wsccy-row:not(.is-pending)'), ccySel: !!ccySel, per: !!per, kpis: kpis.length, order: ctlBottom <= kTop + 1, over, labels: ctl ? ctl.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) : '' };
    });
    ok(`${T} moneda y periodo en la cabecera compacta, sin fila aparte`, m.ccySel && m.per && !m.rowBefore, JSON.stringify(m));
    ok(`${T} tres cifras inmediatamente debajo de la cabecera`, m.kpis === 3 && m.order, JSON.stringify(m));
    ok(`${T} sin desbordamiento`, !m.over, JSON.stringify(m));
    // La moneda sigue siendo elegible en un documento nuevo y queda fija al guardarlo.
    const cc = await p.evaluate(async () => {
      const sel = document.querySelector('.wsbud-controls select[data-wsccy-scope]'); sel.value = 'GBP'; sel.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      return { ccy: _wsDocCcy(), unit: (document.querySelector('.ws4-field-unit') || {}).textContent };
    });
    ok(`${T} elegir GBP en un presupuesto nuevo cambia su moneda`, cc.ccy === 'GBP', JSON.stringify(cc));
    await p.evaluate(() => { _wsToolCommit('QA cabecera', true, null); }); await p.waitForTimeout(500);
    const fixed = await p.evaluate(() => ({ sel: !!document.querySelector('.wsbud-controls select[data-wsccy-scope]'), txt: (document.querySelector('.wsbud-ccy-fixed') || {}).textContent }));
    ok(`${T} guardado: la moneda queda fija (sin selector) y se muestra`, !fixed.sel && fixed.txt === 'GBP', JSON.stringify(fixed));
    ok(`${T} sin errores de página`, !errs.length, errs.join('|').slice(0, 120));
    if (E === 'CR' && L === 'es') { await p.evaluate(() => { const d = _ws4Projects().find(x => x.customName === 'QA cabecera'); _ws4Tombstone(d.id); localStorage.removeItem('aurix_ws_tool_state_v1'); _wsOpenTool('budget'); window.scrollTo(0, 0); }); await p.waitForTimeout(600); await p.screenshot({ path: `/tmp/aurix-shots/after/budget-${W}.png` }); }
    await p.close();
  }
  await b.close(); }
console.log((fails.length ? 'NO-GO' : 'GO') + ` — ${pass}/${pass + fails.length}`); process.exit(fails.length ? 1 : 0);
