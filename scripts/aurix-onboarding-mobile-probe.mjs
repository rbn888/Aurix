#!/usr/bin/env node
/**
 * AURIX · EL ONBOARDING EN EL MÓVIL: ¿LLEGA EL DEDO?
 * ════════════════════════════════════════════════════════════════════════════
 * La familia de harnesses del onboarding (EXCELLENCE-V1 y las seis anteriores)
 * ejecuta el MOTOR real y comprueba markup, copy y CSS leyendo los ficheros.
 * Eso cubre la lógica y el contenido, pero no puede responder a la única
 * pregunta que decide si alguien completa la activación en un teléfono: si el
 * dedo acierta. Y ahí había dos fallos, los dos en el paso que más importa:
 *
 *   · «Lo haré más tarde» medía 27 px de alto contra un objetivo de 44;
 *   · los chips de intereses medían 43 px en 390 y 41 px en 360 — y `interests`
 *     es el ÚNICO dato del onboarding con consumidor real: alimenta
 *     `_aurixBuildStarterWatchlist`. Fallar el toque ahí es empezar con la
 *     watchlist equivocada, no perder un adorno.
 *
 * SE MIDE POR IMPACTO, NO POR LA CAJA. `elementFromPoint` en los dos extremos
 * de la banda de 44 px: es lo único que responde «¿llega el dedo?». Medir la
 * altura de la caja daría por malo un control con área ampliada y por bueno uno
 * de 44 px tapado por otra capa.
 *
 * Y NO SE NOMBRA NINGÚN SELECTOR: se barre todo lo pulsable del overlay. Un
 * control nuevo entra en la medida el día que se añade, no el día que alguien
 * se acuerda de añadirlo a una lista.
 *
 *   node scripts/aurix-onboarding-mobile-probe.mjs
 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const OUT  = join(ROOT, 'docs', 'onboarding-mobile');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const abs = normalize(join(ROOT, p)); if (!abs.startsWith(ROOT)) return res.writeHead(403).end();
    let body = await readFile(abs);
    if (abs.endsWith('app.js')) body = Buffer.from(String(body)
      .replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')
      .replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0'));
    res.writeHead(200, { 'content-type': MIME[extname(abs)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch (_) { res.writeHead(404).end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
let chromium, webkit;
try { ({ chromium, webkit } = await import(PW)); }
catch (e) { console.error('\n✗ SIN MOTORES — ' + PW + '\nRESULT: NO EJECUTADO (entorno, no candidato)'); process.exit(2); }
await mkdir(OUT, { recursive: true });

let pass = 0; const fails = []; const notes = [];
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (info ? '  [' + info + ']' : '')); console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };

const TAP_MIN  = 44;
const FONT_MIN = 11;
// Los cuatro momentos del recorrido vigente. EXPERIENCE y PROFILE siguen en el
// markup pero salieron de la presentación: no se miden, porque medir lo que no
// se enseña es justo cómo un gate acaba defendiendo una pantalla retirada.
const STEPS = ['LANGUAGE', 'WELCOME', 'ACTIVATION', 'SUCCESS'];

const MEASURE = `(function(){
  var ov = document.getElementById('onboardingOverlay');
  var vis = function (e) {
    var r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    return (typeof e.checkVisibility === 'function')
      ? e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true;
  };
  var CLICKABLE = 'a[href],button,summary,input,select,textarea,[role="button"],[role="link"],[tabindex]:not([tabindex="-1"])';
  var taps = [];
  [].slice.call(ov.querySelectorAll(CLICKABLE)).forEach(function (e) {
    if (!vis(e)) return;
    e.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    var r = e.getBoundingClientRect();
    var cx = Math.round(r.left + r.width / 2);
    var cy = Math.round(r.top + r.height / 2);
    var half = Math.floor(${TAP_MIN} / 2) - 1;
    var hitTop = document.elementFromPoint(cx, Math.max(0, cy - half));
    var hitBot = document.elementFromPoint(cx, Math.min(innerHeight - 1, cy + half));
    var owns = function (n) { return !!n && (n === e || e.contains(n) || (n.closest && n.closest(CLICKABLE) === e)); };
    if (!(owns(hitTop) && owns(hitBot)))
      taps.push({ t: (e.innerText || e.value || '').trim().slice(0, 24),
        cls: (e.className || '').toString().slice(0, 34), h: Math.round(r.height) });
  });
  var small = [];
  [].slice.call(ov.querySelectorAll('*')).forEach(function (e) {
    var own = '';
    [].slice.call(e.childNodes).forEach(function (n) { if (n.nodeType === 3) own += n.textContent; });
    var txt = own.trim();
    // El suelo es para lo que se LEE: un glifo suelto se lee con su vecino.
    if (!txt || !/[\\p{L}\\p{N}]/u.test(txt) || txt.length < 2) return;
    if (!vis(e)) return;
    var fs = parseFloat(getComputedStyle(e).fontSize) || 0;
    if (fs > 0 && fs < ${FONT_MIN}) small.push({ t: txt.slice(0, 22), fs: fs, cls: (e.className || '').toString().slice(0, 30) });
  });
  var modal = ov.querySelector('.modal');
  var mb = modal.getBoundingClientRect();
  var sec = [].slice.call(ov.querySelectorAll('.onb-step')).filter(vis)[0];
  // El CTA nunca bajo el pliegue: contrato del onboarding, y aquí se comprueba
  // sobre el resultado pintado, no sobre la regla de CSS que lo pretende.
  var ctas = [].slice.call(ov.querySelectorAll('button, [role="button"]')).filter(vis)
    .map(function (e) { return e.getBoundingClientRect(); }).sort(function (a, b) { return b.bottom - a.bottom; });
  return JSON.stringify({
    step: sec ? sec.getAttribute('data-onb-step') : null,
    taps: taps, small: small,
    modalH: Math.round(mb.height), vp: innerHeight,
    lastCtaBottom: ctas.length ? Math.round(ctas[0].bottom) : null,
    textLen: (modal.innerText || '').length,
  });
})()`;

console.log('AURIX · onboarding en el móvil: ¿llega el dedo?\n');

for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  const browser = await launcher.launch();
  for (const [w, h] of [[390, 844], [360, 740]]) {
    for (const step of STEPS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      const tag = `${ENG}.${w}×${h}.${step}`;
      await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!document.getElementById('onboardingOverlay'), null, { timeout: 60000 });
      await page.waitForTimeout(700);
      // Se abre el overlay REAL de la página real y se fija el paso. No se
      // inyecta markup: lo que se mide es el mismo DOM que ve el usuario.
      await page.evaluate((st) => {
        const bl = document.getElementById('bootLoader'); if (bl) bl.remove();
        const ar = document.getElementById('appRoot'); if (ar) ar.style.opacity = '1';
        const ov = document.getElementById('onboardingOverlay');
        ov.classList.add('open');
        ov.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
        const m = ov.querySelector('.modal'); if (m) m.setAttribute('data-step', st);
        if (typeof applyI18n === 'function') applyI18n();
      }, step);
      await page.waitForTimeout(450);

      const m = await page.evaluate(MEASURE).then(JSON.parse);

      ok(`${tag} el paso está pintado (no se mide un overlay vacío)`,
        m.step === step && m.textLen > 30, `paso ${m.step}, texto ${m.textLen}`);
      ok(`${tag} todo lo pulsable alcanza ${TAP_MIN} px de ÁREA DE IMPACTO`,
        m.taps.length === 0, JSON.stringify(m.taps).slice(0, 220));
      ok(`${tag} ningún texto por debajo de ${FONT_MIN} px`,
        m.small.length === 0, JSON.stringify(m.small).slice(0, 200));
      ok(`${tag} el último botón no cae bajo el pliegue`,
        m.lastCtaBottom !== null && m.lastCtaBottom <= m.vp,
        `fondo ${m.lastCtaBottom} · pantalla ${m.vp}`);

      notes.push(`${tag} modal ${m.modalH}px / pantalla ${m.vp}px · último botón a ${m.lastCtaBottom}px`);
      await page.screenshot({ path: join(OUT, `onb-${step}-${w}x${h}-${ENG}.png`) });
      await ctx.close();
    }
  }
  await browser.close();
}

// ── Y LOS DOS ARREGLOS, FIJADOS ────────────────────────────────────────────
{
  const css = await readFile(join(ROOT, 'styles.css'), 'utf8');
  const chip = css.slice(css.indexOf('.onb-chip {'), css.indexOf('}', css.indexOf('.onb-chip {')));
  ok('CSS · los chips de intereses tienen suelo táctil propio',
    /min-height:\s*44px/.test(chip), chip.replace(/\s+/g, ' ').slice(0, 120));
  const skip = css.slice(css.indexOf('.onb-skip::after'), css.indexOf('}', css.indexOf('.onb-skip::after')) + 1);
  ok('CSS · la salida del onboarding amplía el toque sin caja propia',
    /height:\s*44px/.test(skip) && !/background|border(?!-radius)|box-shadow/.test(skip),
    skip.replace(/\s+/g, ' ').slice(0, 120));
}

console.log('\n── MEDIDAS ────────────────────────────────────────');
for (const n of notes) console.log('  ' + n);
console.log(`\n  suelo táctil ${TAP_MIN} px (por impacto) · suelo de letra ${FONT_MIN} px`);
console.log('  LÍMITE: se fija el paso por atributo; NO recorre el flujo con OTP real,');
console.log('  así que no dice nada sobre el disparo ni sobre la persistencia.');

console.log('\n════════════════════════════════════════════════');
console.log(`${pass} passed, ${fails.length} failed\n`);
if (fails.length) { console.log('FAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); console.log('\nRESULT: NO-GO'); server.close(); process.exit(1); }
console.log('RESULT: GO — capturas en docs/onboarding-mobile/');
server.close();
