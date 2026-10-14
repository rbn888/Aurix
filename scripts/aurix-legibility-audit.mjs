#!/usr/bin/env node
/**
 * AURIX · AUDITORÍA DE LEGIBILIDAD (demo aislada, sin red) — contraste real, objetivos táctiles, desbordamiento
 *   AURIX_DEMO_URL=http://127.0.0.1:8776/ ENGINES=CR VWS=390,1440 LANGS=es node scripts/aurix-legibility-audit.mjs
 * Recorre las superficies con cuentas Free y Premium (fixtures de la demo; el plan lo resuelve el runtime
 * de entitlements real, no una clase manipulada) y mide, por cada texto VISIBLE:
 *   · contraste WCAG del color del texto contra su fondo EFECTIVO (composición de los fondos de todos los
 *     ancestros, con su alfa y su `opacity`; los degradados se aproximan por la media de sus paradas y se
 *     marcan `~`); umbral 4,5:1 normal · 3:1 grande (≥ 24 px o ≥ 18,66 px en negrita);
 *   · objetivos táctiles < 44 px en controles (botón, enlace-botón, [role=button], input);
 *   · desbordamiento horizontal de la página;
 *   · separación de superficies: tarjeta vs lienzo y panel vs tarjeta (ratio de luminancia).
 * Agrupa por selector (tag.clase) y sale con código 1 si hay fallos de contraste (P0 < 3:1 en texto
 * normal, P1 < 4,5:1). OUT_JSON=/ruta vuelca el detalle; STRICT=0 sólo informa.
 */
const O = String(process.env.AURIX_DEMO_URL || 'http://127.0.0.1:8776/').replace(/\/?$/, '/');
const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
const { chromium, webkit } = await import(PW);
const ENGINES = (process.env.ENGINES || 'CR').split(','), VWS = (process.env.VWS || '390,1440').split(',').map(Number);
const LANGS = (process.env.LANGS || 'es').split(','), ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const fs = await import('node:fs');

// Mide en el navegador. Devuelve violaciones agrupadas.
const AUDIT = () => {
  const parse = c => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (top, base) => ({ r: top.r * top.a + base.r * (1 - top.a), g: top.g * top.a + base.g * (1 - top.a), b: top.b * top.a + base.b * (1 - top.a), a: 1 });
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const gradAvg = img => { const cs = (img.match(/rgba?\([^)]+\)/g) || []).map(parse).filter(Boolean); if (!cs.length) return null;
    const n = cs.length; return { r: cs.reduce((s, c) => s + c.r, 0) / n, g: cs.reduce((s, c) => s + c.g, 0) / n, b: cs.reduce((s, c) => s + c.b, 0) / n, a: cs.reduce((s, c) => s + c.a, 0) / n }; };
  const CANVAS = { r: 4, g: 5, b: 7, a: 1 };
  const bgOf = el => {           // fondo efectivo bajo el texto
    const chain = []; for (let n = el; n && n.nodeType === 1; n = n.parentElement) chain.push(n);
    let base = CANVAS, approx = false, op = 1;
    for (let i = chain.length - 1; i >= 0; i--) {
      const cs = getComputedStyle(chain[i]);
      op *= parseFloat(cs.opacity || '1');
      const bc = parse(cs.backgroundColor); if (bc && bc.a > 0) base = over(bc, base);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && /gradient/.test(cs.backgroundImage)) { const g = gradAvg(cs.backgroundImage); if (g && g.a > 0) { base = over(g, base); approx = true; } }
    }
    return { bg: base, approx, op };
  };
  const sig = el => { const c = String(el.className && el.className.baseVal != null ? el.className.baseVal : el.className || '').trim().split(/\s+/).filter(x => x && !/^is-|^has-/.test(x)).slice(0, 2).join('.'); return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (c ? '.' + c : ''); };
  // Visible DE VERDAD: con caja, dentro de la página, sin ancestro a opacidad ~0, oculto o inerte
  // (los modales cerrados viven en el DOM con opacity 0 / pointer-events none).
  const vis = el => { const r = el.getBoundingClientRect(); if (r.width <= 1 || r.height <= 1) return false;   // incluye lo oculto «sólo para lectores» (clip 1×1)
    if (r.right < 0 || r.left > innerWidth || r.bottom + scrollY < 0) return false;
    let op = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false; op *= parseFloat(cs.opacity || '1');
      if (n.hasAttribute('inert')) return false; }
    if (op < 0.05) return false;
    return getComputedStyle(el).pointerEvents !== 'none' || el.tagName !== 'BUTTON'; };
  const groups = {};
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  let node; while ((node = walker.nextNode())) {
    const txt = node.textContent.replace(/\s+/g, ' ').trim(); if (txt.length < 1 || !/[\p{L}\p{N}€$%]/u.test(txt)) continue;
    const el = node.parentElement; if (!el || seen.has(el) || !vis(el)) continue; seen.add(el);
    // Lo `aria-hidden` SE VE (ejes y etiquetas de gráficos, chevrons): su contraste también cuenta.
    if (el.closest('#aurixDemoBadge, .aurix-demo-badge, [data-demo-mark], script, style, noscript')) continue;
    if (el.closest('.aurix-premium-overlay:not(.is-open)')) continue;
    const cs = getComputedStyle(el);
    // Texto SVG (ejes, etiquetas de gráficos): su color es `fill` (+ fill-opacity), no `color`.
    const isSvgText = el instanceof SVGElement;
    let fc = parse(isSvgText ? cs.fill : cs.color); if (!fc) continue;
    if (isSvgText) fc = { ...fc, a: fc.a * parseFloat(cs.fillOpacity || '1') };
    if (cs.webkitTextFillColor && /rgba?\(0, 0, 0, 0\)|transparent/.test(cs.webkitTextFillColor)) continue;   // texto con background-clip (wordmark)
    const { bg, approx, op } = bgOf(el);
    const eff = over({ ...fc, a: fc.a * op }, bg);
    const r = ratio(eff, bg);
    const fsz = parseFloat(cs.fontSize), fw = parseInt(cs.fontWeight, 10) || 400;
    const large = fsz >= 24 || (fsz >= 18.66 && fw >= 700);
    const need = large ? 3 : 4.5;
    if (op < 0.05) continue;
    if (r + 1e-6 < need) {
      const k = sig(el) + (approx ? ' ~' : '');
      const g = groups[k] || (groups[k] = { n: 0, min: 99, need, sample: '', color: isSvgText ? cs.fill : cs.color, bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`, fs: fsz, approx });
      g.n++; if (r < g.min) { g.min = +r.toFixed(2); g.sample = txt.slice(0, 50); g.color = isSvgText ? cs.fill : cs.color; g.bg = `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`; g.fs = fsz; }
    }
  }
  // Objetivos táctiles
  const small = {};
  document.querySelectorAll('button, a[href], [role="button"], input:not([type=hidden]), select, textarea, [tabindex="0"]').forEach(el => {
    if (!vis(el) || el.closest('[aria-hidden="true"], .aurix-premium-overlay:not(.is-open), #aurixDemoBadge')) return;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (el.tagName === 'A' && cs.display === 'inline' && el.closest('p, li, span')) return;   // enlace dentro de texto: exento (WCAG 2.5.8 inline)
    if (r.width < 24 && r.height < 24 && el.closest('.chart-tooltip, .wsc-tip')) return;
    // El área de toque incluye un ::after posicionado que la amplía (sistema de legibilidad).
    let w = r.width, h = r.height; const pa = getComputedStyle(el, '::after');
    if (pa && pa.content && pa.content !== 'none' && pa.position === 'absolute' && pa.pointerEvents !== 'none') { w = Math.max(w, parseFloat(pa.width) || 0); h = Math.max(h, parseFloat(pa.height) || 0); }
    if (h < 44 || w < 44) { const k = sig(el); const s = small[k] || (small[k] = { n: 0, w: Math.round(w), h: Math.round(h) }); s.n++; }
  });
  const overflow = document.documentElement.scrollWidth > innerWidth + 1;
  return { groups, small, overflow, docW: document.documentElement.scrollWidth };
};

const SURFACES = {
  login: async (p) => { await p.goto(O + 'login.html'); await p.waitForTimeout(1200); },
  onboarding: async (p) => { await p.goto(O + 'demo.html'); await p.check('input[value="free"]'); await p.click('[data-demo=onboarding]'); await p.waitForURL(/login/);
    await p.fill('#email', 'aud' + Math.random().toString(36).slice(2, 7) + '@aurix.invalid'); await p.click('#auth-submit'); await p.locator('#otp-code').waitFor(); await p.fill('#otp-code', '24681357'); await p.click('#otp-submit');
    await p.waitForURL(/index/); await p.waitForSelector('.onb-cta--primary:visible', { timeout: 12000 }); await p.waitForTimeout(800); },
};
const APP = (plan, tab, extra) => async (p) => {
  await p.goto(O + 'demo.html'); await p.check(`input[value="${plan}"]`); await p.click('[data-demo=wealth]'); await p.waitForURL(/index\.html/); await p.waitForTimeout(3500);
  if (p.__lang === 'en') { await p.evaluate(() => switchLang('en')); await p.waitForTimeout(400); }
  if (tab !== 'dashboard') { await p.evaluate(t => switchTab(t), tab); await p.waitForTimeout(1500); }
  if (extra) await extra(p);
};
for (const plan of ['free', 'premium']) {
  for (const tab of ['dashboard', 'market', 'intelligence', 'workspace']) SURFACES[tab + ':' + plan] = APP(plan, tab);
  SURFACES['settings:' + plan] = APP(plan, 'dashboard', async p => { await p.evaluate(() => openSettingsPanel()); await p.waitForTimeout(900); });
  SURFACES['addasset:' + plan] = APP(plan, 'dashboard', async p => { await p.evaluate(() => openModal()); await p.waitForTimeout(700); });
}
SURFACES['market-all:free'] = APP('free', 'market', async p => { await p.evaluate(() => { const t = [...document.querySelectorAll('.market-tab')].find(x => /todo|all/i.test(x.textContent)); if (t) t.click(); }); await p.waitForTimeout(1500); });
SURFACES['paywall:free'] = APP('free', 'dashboard', async p => { await p.evaluate(async () => { await _aurixBillingPricesLoad({ force: true }); openAurixPremiumModal({ source: 'audit' }); }); await p.waitForTimeout(700); });
for (const k of ['budget', 'loan', 'compound', 'goals']) SURFACES['ws-' + k + ':premium'] = APP('premium', 'workspace', async p => { await p.evaluate(k => _wsOpenTool(k), k); await p.waitForTimeout(1500); });

const report = {}; let p0 = 0, p1 = 0;
for (const ENG of ENGINES) {
  const b = await (ENG === 'WK' ? webkit : chromium).launch();
  for (const VW of VWS) for (const lng of LANGS) for (const [name, go] of Object.entries(SURFACES)) {
    if (ONLY && !ONLY.some(o => name.startsWith(o))) continue;
    const ctx = await b.newContext({ viewport: { width: VW, height: VW < 768 ? 844 : 900 }, locale: lng === 'en' ? 'en-GB' : 'es-ES', hasTouch: VW < 1100, isMobile: VW < 768 && ENG === 'CR' });
    const p = await ctx.newPage(); p.__lang = lng; const errs = []; p.on('pageerror', e => errs.push(e.message));
    try { await go(p); } catch (e) { console.log(`  ! ${name} ${VW} no navegable: ${e.message.split('\n')[0]}`); await ctx.close(); continue; }
    if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); await p.screenshot({ path: `${process.env.SHOTS}/${name.replace(':', '-')}-${VW}-${lng}-${ENG}.png`, fullPage: true }); }
    const r = await p.evaluate(AUDIT);
    const tag = `${ENG}.${VW}.${lng} ${name}`; report[tag] = r;
    const g = Object.entries(r.groups).sort((a, b) => a[1].min - b[1].min);
    const bad0 = g.filter(([, v]) => v.min < 3 && v.need === 4.5).length, bad1 = g.length - bad0; p0 += bad0; p1 += bad1;
    console.log(`\n── ${tag}  contraste: ${g.length ? g.length + ' grupos (' + bad0 + ' P0)' : 'OK'} · objetivos <44: ${Object.keys(r.small).length} · overflow: ${r.overflow ? 'SÍ ' + r.docW : 'no'}${errs.length ? ' · pageerrors ' + errs.length : ''}`);
    g.slice(0, Number(process.env.TOP || 12)).forEach(([k, v]) => console.log(`   ${v.min.toFixed(2)}/${v.need} ×${v.n}  ${k}  «${v.sample}»  ${v.color} on ${v.bg} ${v.fs}px`));
    if (process.env.SMALL) Object.entries(r.small).slice(0, 15).forEach(([k, v]) => console.log(`   tap ${v.w}×${v.h} ×${v.n}  ${k}`));
    await ctx.close();
  }
  await b.close();
}
if (process.env.OUT_JSON) fs.writeFileSync(process.env.OUT_JSON, JSON.stringify(report, null, 1));
console.log(`\nRESUMEN: grupos P0 (<3:1 texto normal) ${p0} · P1 (<AA) ${p1}`);
process.exit(process.env.STRICT === '0' ? 0 : (p0 + p1 ? 1 : 0));
