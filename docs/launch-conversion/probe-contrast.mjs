#!/usr/bin/env node
/**
 * AURIX · SPEC 2 — CONTRASTE MEDIDO (WCAG 2.x) del texto visible en las pantallas prioritarias.
 * Color de texto efectivo (con opacidad acumulada) sobre el primer fondo opaco de sus ancestros
 * (aproximación: los degradados se toman por su color de fondo base; fondo de página por defecto #05070c).
 * Normal ≥ 4,5:1 · grande (≥ 24 px, o ≥ 18,66 px en negrita) ≥ 3:1.
 *   LANDING=http://127.0.0.1:8778/ AURIX_DEMO_URL=http://127.0.0.1:8777/ node docs/launch-conversion/probe-contrast.mjs
 */
const L = process.env.LANDING || 'http://127.0.0.1:8778/', O = String(process.env.AURIX_DEMO_URL || 'http://127.0.0.1:8777/').replace(/\/?$/, '/');
const { chromium } = await import(process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs');
const MEASURE = () => {
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const bgOf = el => { let stack = []; for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 0.95) break; } } let bg = { r: 5, g: 7, b: 12, a: 1 }; for (let i = stack.length - 1; i >= 0; i--) bg = blend(stack[i], bg); return bg; };
  const opa = el => { let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
  const out = [];
  document.querySelectorAll('body *').forEach(el => {
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1); if (!own) return;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight * 3) return;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') return;
    if (/background-clip/.test('') || cs.webkitBackgroundClip === 'text') return;   // texto con degradado (logotipo): no medible así
    const o = opa(el); if (o < 0.15) return;                                        // decorativo / oculto por animación
    const c = parse(cs.color); if (!c || c.a === 0) return;   // texto con degradado (color transparente): no medible así
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;   // controles deshabilitados: exentos (WCAG 1.4.3)
    const bg = bgOf(el); const fg = blend({ ...c, a: c.a * o }, bg);
    const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const px = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700, large = px >= 24 || (px >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    if (ratio < need) out.push({ t: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40), cls: String(el.className || el.tagName).slice(0, 40), ratio: +ratio.toFixed(2), need, px });
  });
  return out;
};
const b = await chromium.launch(); const res = {};
for (const W of [390, 1440]) {
  const p = await (await b.newContext({ viewport: { width: W, height: W < 900 ? 844 : 900 }, hasTouch: W < 900, reducedMotion: 'reduce' })).newPage();
  await p.goto(L + 'index.html?lang=es'); await p.waitForTimeout(1200); res['landing.' + W] = await p.evaluate(MEASURE);
  await p.goto(O + 'login.html?lang=es'); await p.waitForTimeout(1200); res['login.' + W] = await p.evaluate(MEASURE);
  await p.goto(O + 'demo.html'); await p.check('input[value="free"]'); await p.click('[data-demo=wealth]'); await p.waitForURL(/index\.html/); await p.waitForTimeout(5000);
  await p.evaluate(() => switchLang('es')); await p.waitForTimeout(800); res['dashboard.' + W] = await p.evaluate(MEASURE);
  await p.evaluate(() => switchTab('intelligence')); await p.waitForTimeout(2000); res['intel-free.' + W] = await p.evaluate(MEASURE);
  await p.evaluate(() => switchTab('workspace')); await p.waitForTimeout(1500); res['ws-free.' + W] = await p.evaluate(MEASURE);
  await p.evaluate(() => openUpgradeIntent({ featureKey: 'workspace.loan', source: 'audit' })); await p.waitForTimeout(1200); res['paywall.' + W] = await p.evaluate(MEASURE);
  await p.close();
}
await b.close();
let total = 0; for (const k in res) { total += res[k].length; console.log(k.padEnd(16), res[k].length ? res[k].slice(0, 8).map(x => `${x.ratio}<${x.need} «${x.t}» .${x.cls}`).join(' ; ') : 'OK'); }
console.log('\n' + (total ? 'FALLOS: ' + total : 'GO — todo el texto medido cumple'));
process.exit(total ? 1 : 0);
