#!/usr/bin/env node
/**
 * AURIX · LOW BRIGHTNESS QA (simulación; NO sustituye a un dispositivo físico)
 *   AURIX_DEMO_URL=http://127.0.0.1:8776/ VWS=390,1440 node scripts/aurix-low-brightness-probe.mjs
 * Para cada superficie (Free y Premium) toma las cards/paneles reales y compone su fondo, su borde y
 * el PEOR texto que contienen. Después aplica dos modelos de visualización sobre la luminancia relativa:
 *   · brillo bajo: L' = 0,25·L + 0,002   (pantalla al ~25 %, interior)
 *   · exterior:    L' = 1,00·L + 0,040   (reflejo ambiental sobre la pantalla)
 * y mide la diferencia de LUMINOSIDAD PERCEPTUAL (CIELAB ΔL*) en ambos: separación card/lienzo o
 * borde/lienzo y peor texto de cada card, con umbrales por modelo (ver MIN). Umbrales calibrados con la
 * referencia de calidad del SPEC (la card de Intelligence en v822). VERBOSE=1 imprime todos los pares.
 */
const O = String(process.env.AURIX_DEMO_URL || 'http://127.0.0.1:8776/').replace(/\/?$/, '/');
const { chromium } = await import(process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs');
const VWS = (process.env.VWS || '390,1440').split(',').map(Number);
const SEL = '.dashboard-top, .cat-card, .wsdisc-card, .intcc-card, .intcc-hero, .wsh-card, .wsh-tool, .market-section, .bottom-nav, .aurix-premium-modal, .wspl-card, .intprev-card';
const MEASURE = (SEL) => {
  const parse = c => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (t, s) => ({ r: t.r * t.a + s.r * (1 - t.a), g: t.g * t.a + s.g * (1 - t.a), b: t.b * t.a + s.b * (1 - t.a), a: 1 });
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const avgGrad = img => { const cs = (img.match(/rgba?\([^)]+\)/g) || []).map(parse); if (!cs.length) return null; const n = cs.length; return { r: cs.reduce((s, c) => s + c.r, 0) / n, g: cs.reduce((s, c) => s + c.g, 0) / n, b: cs.reduce((s, c) => s + c.b, 0) / n, a: cs.reduce((s, c) => s + c.a, 0) / n }; };
  const bgUnder = el => { const ch = []; for (let n = el; n; n = n.parentElement) ch.push(n); let base = { r: 4, g: 5, b: 7, a: 1 };
    for (let i = ch.length - 1; i >= 0; i--) { const cs = getComputedStyle(ch[i]); const bc = parse(cs.backgroundColor); if (bc && bc.a) base = over(bc, base); if (/gradient/.test(cs.backgroundImage)) { const g = avgGrad(cs.backgroundImage); if (g) base = over(g, base); } } return base; };
  const out = [];
  document.querySelectorAll(SEL).forEach(el => {
    const r = el.getBoundingClientRect(); if (r.width < 60 || r.height < 30) return; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.1) return;
    const parentBg = el.parentElement ? bgUnder(el.parentElement) : { r: 4, g: 5, b: 7 };
    const surf = bgUnder(el);
    const bc = parse(cs.borderTopColor), bw = parseFloat(cs.borderTopWidth) || 0;
    let border = (bc && bw && cs.borderTopStyle !== 'none') ? over(bc, parentBg) : null;
    // Un anillo interior (box-shadow inset 0 0 0 Npx) delimita igual que un borde.
    if (!border) { const m = cs.boxShadow.match(/(rgba?\([^)]+\))\s+0px\s+0px\s+0px\s+(\d+(?:\.\d+)?)px\s+inset/); if (m) border = over(parse(m[1]), surf); }
    let worst = null;
    el.querySelectorAll('*').forEach(t => { if (!t.childNodes.length || ![...t.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return;
      const tr = t.getBoundingClientRect(); if (tr.width < 2) return; const tcs = getComputedStyle(t); if (tcs.visibility === 'hidden') return;
      let op = 1; for (let n = t; n && n !== el.parentElement; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity || '1'); if (op < 0.05) return;
      const fc = parse(tcs.color); if (!fc) return; const bg = bgUnder(t); const eff = over({ ...fc, a: fc.a * op }, bg);
      const L1 = lum(eff), L2 = lum(bg); if (!worst || Math.abs(L1 - L2) < Math.abs(worst.L1 - worst.L2)) worst = { L1, L2, txt: t.textContent.trim().slice(0, 30) }; });
    const k = String(el.className).split(' ')[0];
    out.push({ k, surf: lum(surf), parent: lum(parentBg), canvas: lum({ r: 4, g: 5, b: 7 }), border: border ? lum(border) : null, worst });
  });
  return out;
};
// Modelos de visualización sobre la luminancia relativa Y, normalizados a la adaptación del ojo
// (el blanco de la pantalla en esa condición): brillo bajo en interior y reflejo exterior.
const MODELS = { dim: Y => (0.25 * Y + 0.001) / 0.251, exterior: Y => (Y + 0.04) / 1.04 };
// Luminosidad perceptual CIELAB L* (0–100): a diferencia de la razón WCAG, sí describe cuánto se
// DISTINGUEN dos negros casi iguales cuando la pantalla está tenue o lavada por el reflejo.
const Lstar = Y => (Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : Y * 24389 / 27);
const R = (a, b) => Math.abs(Lstar(a) - Lstar(b));
// Umbrales calibrados con la REFERENCIA (card de Intelligence en v822, ver informe): separación de
// superficie o borde ≥ 3 ΔL* (diferencia claramente perceptible) y texto ≥ 40 ΔL*.
// Por modelo: lo que logra la card de Intelligence en v822 (borde 11,6 / 4,7 ΔL*) y lo que logra un
// texto terciario en AA (≈ 43 / 35 ΔL*).
const MIN = { dim: { surf: 10, text: 43 }, exterior: { surf: 4.5, text: 33 } };
const b = await chromium.launch(); const fails = []; let checks = 0;
for (const VW of VWS) for (const plan of ['free', 'premium']) for (const tab of ['dashboard', 'market', 'intelligence', 'workspace', 'paywall']) {
  if (tab === 'paywall' && plan === 'premium') continue;
  const p = await (await b.newContext({ viewport: { width: VW, height: VW < 768 ? 844 : 900 } })).newPage();
  await p.goto(O + 'demo.html'); await p.check(`input[value="${plan}"]`); await p.click('[data-demo=wealth]'); await p.waitForURL(/index/); await p.waitForTimeout(3200);
  if (tab === 'paywall') { await p.evaluate(async () => { await _aurixBillingPricesLoad({ force: true }); openAurixPremiumModal({ source: 'lb' }); }); await p.waitForTimeout(600); }
  else if (tab !== 'dashboard') { await p.evaluate(t => switchTab(t), tab); await p.waitForTimeout(1200); }
  const rows = await p.evaluate(MEASURE, SEL); const seen = new Set();
  for (const r of rows) { if (seen.has(r.k)) continue; seen.add(r.k);
    for (const [m, f] of Object.entries(MODELS)) {
      const cs = R(f(r.surf), f(r.canvas)), bs = r.border != null ? R(f(r.border), f(r.parent)) : null, ts = r.worst ? R(f(r.worst.L1), f(r.worst.L2)) : null;
      const okSurf = Math.max(cs, bs == null ? 0 : bs) >= MIN[m].surf, okText = ts == null || ts >= MIN[m].text; checks += 2;
      const line = `${VW} ${plan} ${tab} ${r.k.padEnd(18)} ${m.padEnd(8)} ΔL* card/lienzo ${cs.toFixed(1)} borde ${bs == null ? '—' : bs.toFixed(1)} peor-texto ${ts == null ? '—' : ts.toFixed(1)} «${r.worst ? r.worst.txt : ''}»`;
      if (!okSurf || !okText) { fails.push(line); } if (process.env.VERBOSE || !okSurf || !okText) console.log((okSurf && okText ? '  ✓ ' : '  ✗ ') + line);
    } }
  await p.context().close();
}
await b.close();
console.log(`\n${fails.length ? 'NO-GO — ' + fails.length + ' pares indistinguibles' : 'GO'} (${checks} comprobaciones)`);
process.exit(fails.length ? 1 : 0);
