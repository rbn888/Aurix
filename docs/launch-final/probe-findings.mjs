// CIERRE PARA LANZAMIENTO · tres hallazgos sobre la demo (código equivalente a producción).
// A · tras registrar la primera liquidez, «Lo que importa hoy» no afirma ausencia de cambios.
// B · el paywall no promete retomar documentos en otro dispositivo.
// C · el comparador sin índice elegido no presenta un «+0 %» como medición.
// Uso: node probe-findings.mjs [baseURL]  (por defecto http://127.0.0.1:8777)
import { chromium, webkit } from '/tmp/aurix-pw/node_modules/playwright/index.mjs';
const BASE = process.argv[2] || 'http://127.0.0.1:8777';
let ok = 0, ko = 0; const fail = []; const chk = (c, n, x) => { if (c) ok++; else { ko++; fail.push(n + (x ? ' ' + x : '')); } };
async function start(b, W, kind, plan) {
  const p = await (await b.newContext({ viewport: { width: W, height: W < 900 ? 844 : 900 }, hasTouch: W < 900 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`${BASE}/demo.html`); await p.check(`input[value="${plan}"]`); await p.click(`[data-demo=${kind}]`); await p.waitForURL(/index\.html/); await p.waitForTimeout(4500);
  return { p, errs };
}
for (const [E, eng] of [['CR', chromium], ['WK', webkit]]) { const b = await eng.launch();
  for (const W of [390, 1440]) for (const L of ['es', 'en']) { const T = `${E}.${W}.${L}`;
    // A
    { const { p, errs } = await start(b, W, 'empty', 'premium'); await p.evaluate(l => switchLang(l), L); await p.waitForTimeout(400);
      // El modal real de «Añadir liquidez» (en móvil se llega por otra hoja; se abre su owner).
      await p.evaluate(() => openLiquidityModal()); await p.waitForTimeout(800);
      await p.locator('.modal--liquidity .liq-btn[data-curr="EUR"]').click(); await p.locator('#liquidityQty').fill('10000'); await p.locator('.modal--liquidity .btn-submit').click(); await p.waitForTimeout(2500);
      await p.evaluate(() => switchTab('intelligence')); await p.waitForTimeout(2500);
      const r = await p.evaluate(() => { const c = document.querySelector('.intv5-matters'); return { n: assets.length, st: c && c.getAttribute('data-empty-state'), txt: c ? c.innerText : '' }; });
      chk(r.n === 1 && r.st === 'intv20_brief_no_ref', `${T} A: primera liquidez → espera de referencia`, JSON.stringify(r));
      chk(!/no hay ningún cambio|no hay movimientos|nothing in your wealth|no new movements/i.test(r.txt), `${T} A: no afirma ausencia de cambios`, r.txt);
      chk(!errs.length, `${T} A sin errores`, errs[0]); await p.context().close(); }
    // B
    { const { p, errs } = await start(b, W, 'wealth', 'free'); await p.evaluate(l => { switchLang(l); openUpgradeIntent({ featureKey: 'workspace.budget', source: 'probe' }); }, L); await p.waitForTimeout(2000);
      const txt = await p.evaluate(() => [...document.querySelectorAll('[role=dialog], .modal-overlay.open, .paywall, [class*="paywall"]')].filter(e => e.offsetParent || getComputedStyle(e).display !== 'none').map(e => e.innerText).join('\n'));
      chk(txt.length > 40, `${T} B: paywall abierto`, txt.slice(0, 80));
      chk(!/otro dispositivo|cualquier dispositivo|another device|any device/i.test(txt), `${T} B: sin promesa multi-dispositivo`);
      chk(!errs.length, `${T} B sin errores`, errs[0]); await p.context().close(); }
    // C
    { const { p, errs } = await start(b, W, 'wealth', 'premium'); await p.evaluate(l => { switchLang(l); switchTab('workspace'); }, L); await p.waitForTimeout(1000);
      await p.evaluate(() => _wsOpenTool('comparator')); await p.waitForTimeout(2000);
      const r = await p.evaluate(() => ({ sel: _intv14CmpState().benchmarkId, axis: [...document.querySelectorAll('.intv14-cmp-axis-t')].map(e => e.textContent.trim()) }));
      chk(r.sel == null && r.axis.length >= 2, `${T} C: sin comparador, escala presente`, JSON.stringify(r));
      chk(!r.axis.some(x => /^[+−-]?0 ?%$/.test(x)) && r.axis.some(x => /^(Inicio|Start)$/.test(x)), `${T} C: el origen es «Inicio/Start», ningún «0 %»`, JSON.stringify(r.axis));
      chk(!errs.length, `${T} C sin errores`, errs[0]); await p.context().close(); }
  }
  await b.close(); }
console.log(ko ? `NO-GO — ${ok}/${ok + ko}\n  ✗ ` + fail.join('\n  ✗ ') : `GO — ${ok}/${ok}`); process.exit(ko ? 1 : 0);
