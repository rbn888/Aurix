#!/usr/bin/env node
/**
 * AURIX · CIERRE COHERENCIA Y LENGUAJE — sonda visual focal
 * ════════════════════════════════════════════════════════════════════════════
 * Las frases nuevas son más largas («En los últimos 7 días, la liquidez pasó del
 * 33,0% al 30,0% de tu cartera financiera; en los últimos 30 días, …»). Esta sonda
 * pinta el HTML REAL que generan `_intv4DiscoveryHtml` y `_intv21LogHtml` (volcado
 * por docs/AURIX-INTEL-COHERENCE-LANGUAGE-harness.js) dentro del contenedor real de
 * Intelligence con `styles.css` real, y mide lo PINTADO: sin desplazamiento
 * horizontal, el texto dentro de su card, sin recorte (scrollHeight ≤ clientHeight)
 * y sin solape entre las dos cards. ES/EN · 360/390/768/1440 · Chromium y WebKit.
 *
 *   AURIX_COHERENCE_DUMP=/tmp/coh.json node docs/AURIX-INTEL-COHERENCE-LANGUAGE-harness.js
 *   COH_DUMP=/tmp/coh.json node scripts/aurix-intel-coherence-render-probe.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
let PWm;
try { PWm = await import(PW); } catch (e) { console.error('✗ SIN MOTOR\nRESULT: NO EJECUTADO (entorno, no candidato)'); process.exit(2); }
const dump = JSON.parse(readFileSync(process.env.COH_DUMP || '/tmp/coh_dump.json', 'utf8'));
const css = readFileSync(join(root, 'styles.css'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };

for (const E of (process.env.ENGINES || 'CR,WK').split(',')) {
  const browser = await (E === 'WK' ? PWm.webkit : PWm.chromium).launch({ headless: true });
  for (const w of [360, 390, 768, 1440]) for (const lng of ['es', 'en']) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } });
    await page.setContent(`<!doctype html><html lang="${lng}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head>
      <body><main><div class="aurix-intcc aurix-intv6 aurix-intv21" style="padding:12px">${dump[lng].disc}${dump[lng].log}</div></main></body></html>`);
    const m = await page.evaluate(() => {
      const r = e => e.getBoundingClientRect();
      const disc = document.querySelector('.intv4-discovery'), log = document.querySelector('.intv21-log');
      const txts = [...document.querySelectorAll('.intv4-wow-text, .intv21-log-txt')];
      return {
        hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        inCard: txts.every(t => { const c = t.closest('.intcc-card'); const a = r(t), b = r(c); return a.left >= b.left - 1 && a.right <= b.right + 1 && a.bottom <= b.bottom + 1; }),
        clipped: txts.filter(t => t.scrollHeight > t.clientHeight + 1 || t.scrollWidth > t.clientWidth + 1).length,
        overlap: (() => { const a = r(disc), b = r(log); return !(a.bottom <= b.top + 1 || b.bottom <= a.top + 1); })(),
        visible: txts.every(t => r(t).height > 0 && getComputedStyle(t).visibility !== 'hidden'),
        wowLines: Math.round(r(document.querySelector('.intv4-wow-text')).height / parseFloat(getComputedStyle(document.querySelector('.intv4-wow-text')).lineHeight)),
        wowText: document.querySelector('.intv4-wow-text').textContent,
      };
    });
    const tag = `${E} ${w}px ${lng}`;
    ok(tag + ' sin scroll horizontal', !m.hscroll);
    ok(tag + ' texto dentro de su card', m.inCard);
    ok(tag + ' sin recorte', m.clipped === 0, String(m.clipped));
    ok(tag + ' cards sin solape', !m.overlap);
    ok(tag + ' texto visible y completo', m.visible && /30 (días|days)/.test(m.wowText));
    console.log(`  · ${tag}: descubrimiento en ${m.wowLines} líneas`);
    await page.close();
  }
  await browser.close();
}
console.log('\n' + (fail === 0 ? '✓ PASS' : '✗ FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
