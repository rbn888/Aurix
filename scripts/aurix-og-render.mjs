#!/usr/bin/env node
/**
 * AURIX · carátula Open Graph — renderiza scripts/og/aurix-og.html a landing/og-aurix-v3-{es,en}.png
 * (1200×630, PNG opaco). Usa los estilos reales de la landing. Comprueba márgenes seguros (≥60 px),
 * esfera y halo completos dentro del lienzo, y que el texto cabe sin desbordar.
 *   node scripts/aurix-og-render.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript' };
const server = createServer(async (req, res) => { try { const p = normalize(join(ROOT, decodeURIComponent(req.url.split('?')[0]))); if (!p.startsWith(ROOT)) return res.writeHead(403).end();
  const b = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); } catch (_) { res.writeHead(404).end(); } });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/scripts/og/aurix-og.html`;
const browser = await chromium.launch();
let fails = 0;
for (const lang of ['es', 'en']) {
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })).newPage();
  await page.goto(base + '?lang=' + lang, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400);
  const m = await page.evaluate(() => { const R = s => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    return { brand: R('.og-brand .brand'), copy: R('.og-copy .hero-title'), glow: R('.og-orb .lp-orb-glow'), orb: R('.og-orb .lp-orb'), font: getComputedStyle(document.querySelector('.hero-title')).fontFamily }; });
  const inSafe = b => b.l >= 60 && b.t >= 60 && b.r <= 1140 && b.b <= 570;
  const ok = inSafe(m.brand) && inSafe(m.copy) && inSafe(m.orb) && m.glow.l >= 0 && m.glow.t >= 0 && m.glow.r <= 1200 && m.glow.b <= 630 && m.copy.r < m.glow.l;
  console.log(`${ok ? '✓' : '✗'} ${lang}: márgenes ≥60 px, esfera y halo completos, texto sin invadir la esfera`, ok ? '' : JSON.stringify(m));
  if (!ok) fails++;
  await page.screenshot({ path: join(ROOT, 'landing', `og-aurix-v3-${lang}.png`), type: 'png', omitBackground: false });
  await page.context().close();
}
await browser.close(); server.close();
console.log(fails ? 'RESULT: NO-GO' : 'RESULT: GO'); process.exit(fails ? 1 : 0);
