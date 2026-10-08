// AURIX · Repro del primer clic perdido en Guardar (SPEC 1 §5). O=<url de demo> node …
// Demo raíz (≈ producción v759): cmp click1 modal=0. Rama: click1 modal=1.
import { chromium, webkit } from '/tmp/aurix-pw/node_modules/playwright/index.mjs';
const O = process.env.O;
for (const [en, eng] of [['CR', chromium], ['WK', webkit]]) for (const W of [390, 1440]) {
const b = await eng.launch(); const p = await (await b.newContext({ viewport: { width: W, height: 844 }, hasTouch: W < 900 })).newPage();
await p.goto(O + 'demo.html'); await p.check('input[value="premium"]'); await p.click('[data-demo=wealth]'); await p.waitForURL(/index\.html/); await p.waitForTimeout(5000);
await p.evaluate(() => switchTab('workspace')); await p.waitForTimeout(1500);
const tap = async sel => { const l = p.locator(sel).first(); await l.scrollIntoViewIfNeeded(); if (W < 900) await l.tap(); else await l.click(); await p.waitForTimeout(700); };
const out = [];
for (const [open, field, save] of [['[data-wsh-cta=tool][data-wstool=compound]', '[data-wstool-input="initial"]', '[data-wstool-save]'], ['[data-wsh-cta=scenario]', '[data-wsb-param=baseManual]', '[data-wsb2-save]']]) {
  await p.evaluate(() => { try { _wshView='home'; renderWorkspaceHome(); } catch(_){} }); await p.waitForTimeout(400);
  await tap(open); const f = p.locator(field).first(); await f.click(); await p.keyboard.press('Meta+A'); await p.keyboard.type('7777');
  await tap(save); const m1 = await p.locator('.ws-modal-overlay').count();
  if (!m1) { await tap(save); }
  out.push(open.includes('scenario') ? 'scn' : 'cmp', 'click1 modal=' + m1, 'click2 modal=' + await p.locator('.ws-modal-overlay').count());
  await p.evaluate(() => document.querySelectorAll('.ws-modal-overlay').forEach(x => x.remove()));
}
console.log(en + W, out.join(' '));
await b.close(); }
