#!/usr/bin/env node
/**
 * AURIX · CIERRE DEL ONBOARDING — cobertura de los comportamientos NUEVOS
 * ════════════════════════════════════════════════════════════════════════════
 * Sobre el artefacto de demo aislado (local por defecto; AURIX_DEMO_URL=https://… para el
 * publicado). Navegadores automatizados: Chromium (320/390/430 y 1280/1440) y WebKit móvil
 * (390). WebKit de ESCRITORIO queda fuera: la página del Dashboard se congela con ancho >768
 * (ruta de escritorio, `AURIX_MOBILE_SAFE`), incidencia previa documentada aparte.
 *   · idioma de entrada: navegador es/en, preferencia guardada, elección desde la landing;
 *   · selector ES|EN del acceso con correo y código escritos: no borra, no reenvía, traduce;
 *   · recorrido bienvenida → primer activo → confirmación → Dashboard, con retroceso,
 *     omisión, reanudación, doble pulsación, recarga y llegada arriba;
 *   · categorías NO interactivas; selector ES|EN del onboarding; LANGUAGE guardado ⇒ WELCOME;
 *   · usuario existente sin reapertura; cero peticiones fuera del origen; sin desbordamiento.
 *   AURIX_PW=/ruta/playwright/index.mjs node scripts/aurix-onboarding-close-probe.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const PUBLIC = String(process.env.AURIX_DEMO_URL || '').replace(/\/$/, '');
let O = PUBLIC, server = null;
if (!O) {
  const SITE = '/tmp/aurix-onboarding-close-site';
  execFileSync('node', [join(ROOT, 'scripts/aurix-build-demo.mjs'), SITE], { stdio: 'ignore', env: Object.assign({}, process.env, { AURIX_DEMO_BASE: '/' }) });
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
  server = createServer(async (req, res) => { try { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = normalize(join(SITE, p)); if (!f.startsWith(SITE)) return res.writeHead(403).end(); const b = await readFile(f); res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }).end(b); } catch (_) { res.writeHead(404).end('nf'); } });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  O = `http://127.0.0.1:${server.address().port}`;
}
const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
let chromium, webkit;
try { ({ chromium, webkit } = await import(PW)); } catch (e) { console.error('✗ SIN MOTORES — ' + PW); if (server) server.close(); process.exit(2); }
let pass = 0; const fails = [];
const ok = (n, c, i) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (i ? ' [' + i + ']' : '')); console.log('  ✗ ' + n + (i ? ' [' + i + ']' : '')); } };
const step = p => p.evaluate(() => { const o = document.getElementById('onboardingOverlay'); const m = o && o.querySelector('.modal'); return o && o.classList.contains('open') && m ? m.getAttribute('data-step') : 'closed'; });
const hscroll = p => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
console.log('AURIX · CIERRE DEL ONBOARDING — ' + O + (server ? '  (artefacto local)' : '  (PUBLICADO)'));

async function visitor(L, w, h, locale) {
  const ctx = await L.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900, locale });
  const ext = []; ctx.on('request', r => { const u = r.url(); if (!u.startsWith(O) && !/^(data|blob|about):/.test(u)) ext.push(u); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  return { ctx, p, ext, errs };
}
async function toLogin(p, query) {
  await p.goto(O + '/demo.html'); await p.click('[data-demo="onboarding"]'); await p.waitForURL(/login\.html/);
  if (query) { await p.goto(O + '/login.html' + query); }
  await p.waitForTimeout(600);
}

for (const [E, launcher] of [['CR', chromium], ['WK', webkit]]) {
  const browser = await launcher.launch();
  console.log('\n══ ' + E + ' ══');
  // ── IDIOMA DE ENTRADA ──
  for (const [locale, want] of [['es-ES', 'es'], ['en-US', 'en'], ['fr-FR', 'en']]) {
    const v = await visitor(browser, 390, 844, locale); await toLogin(v.p);
    const g = await v.p.evaluate(() => ({ html: document.documentElement.lang, on: (document.querySelector('.lg-lang-btn.is-on') || {}).textContent }));
    ok(`${E} entrada directa sin idioma, navegador ${locale} ⇒ ${want.toUpperCase()} marcado`, g.html === want && g.on === want.toUpperCase(), JSON.stringify(g));
    await v.ctx.close();
  }
  { const v = await visitor(browser, 390, 844, 'es-ES');
    await v.p.goto(O + '/demo.html'); await v.p.click('[data-demo="onboarding"]'); await v.p.waitForURL(/login\.html/);
    await v.p.evaluate(() => localStorage.setItem('portfolio_lang', 'en')); await v.p.reload(); await v.p.waitForTimeout(500);
    ok(`${E} preferencia guardada (en) gana al navegador (es)`, (await v.p.evaluate(() => document.documentElement.lang)) === 'en');
    await v.p.goto(O + '/login.html?lang=es'); await v.p.waitForTimeout(500);
    const g = await v.p.evaluate(() => ({ html: document.documentElement.lang, stored: localStorage.getItem('portfolio_lang'), choice: sessionStorage.getItem('aurix_lang_choice') }));
    ok(`${E} elección explícita desde la landing (?lang=es) gana a la guardada sin sobrescribirla`, g.html === 'es' && g.stored === 'en' && g.choice === 'es', JSON.stringify(g));
    await v.p.goto(O + '/login.html?lang=FR'); await v.p.waitForTimeout(400);
    ok(`${E} un valor no admitido (?lang=FR) se ignora`, (await v.p.evaluate(() => document.documentElement.lang)) === 'es');
    await v.ctx.close(); }

  // ── SELECTOR DEL ACCESO CON ESTADO ──
  { const v = await visitor(browser, 390, 844, 'es-ES'); const p = v.p; await toLogin(p);
    await p.fill('#email', 'auditor@example.com');
    await p.click('[data-lg-lang="en"]'); await p.waitForTimeout(200);
    let g = await p.evaluate(() => ({ email: document.getElementById('email').value, btn: document.getElementById('auth-submit').innerText, lang: document.documentElement.lang, sends: window.__AURIX_DEMO_RUNTIME__.otpSends || 0, pressed: document.querySelector('[data-lg-lang="en"]').getAttribute('aria-pressed') }));
    ok(`${E} acceso: cambiar a EN conserva el correo, traduce y no envía nada`, g.email === 'auditor@example.com' && /Send access code/.test(g.btn) && g.lang === 'en' && g.sends === 0 && g.pressed === 'true', JSON.stringify(g));
    await p.click('#auth-submit'); await p.waitForSelector('#otpSection', { state: 'visible' });
    await p.fill('#otp-code', '11111111'); await p.click('#otp-submit'); await p.waitForTimeout(900);
    await p.fill('#otp-code', '1357');
    const before = await p.evaluate(() => ({ err: document.getElementById('otp-error').innerText, sends: window.__AURIX_DEMO_RUNTIME__.otpSends }));
    await p.click('[data-lg-lang="es"]'); await p.waitForTimeout(200);
    g = await p.evaluate(() => ({ code: document.getElementById('otp-code').value, otpVisible: getComputedStyle(document.getElementById('otpSection')).display !== 'none', err: document.getElementById('otp-error').innerText, title: document.querySelector('#otpSection .auth-title').textContent, sends: window.__AURIX_DEMO_RUNTIME__.otpSends, lang: document.documentElement.lang }));
    ok(`${E} verificación: cambiar a ES conserva código y paso, traduce el error y no reenvía`, g.code === '1357' && g.otpVisible && /Código incorrecto/.test(g.err) && /Introduce tu código/.test(g.title) && g.sends === before.sends && g.lang === 'es', JSON.stringify({ g, before }));
    ok(`${E} acceso sin desbordamiento horizontal`, !(await hscroll(p)));
    await v.ctx.close(); }

  // ── RECORRIDO COMPLETO SIN PANTALLA DE IDIOMA ──
  const widths = E === 'CR' ? [[320, 640], [390, 844], [430, 932], [1280, 800], [1440, 900]] : [[390, 844]];
  for (const [w, h] of widths) {
    const T = `${E}.${w}`;
    const v = await visitor(browser, w, h, 'es-ES'); const p = v.p;
    try {
      await toLogin(p);
      await p.click('[data-lg-lang="en"]'); await p.fill('#email', 'auditor@example.com'); await p.click('#auth-submit'); await p.waitForSelector('#otpSection', { state: 'visible' });
      await p.fill('#otp-code', '24681357'); await p.click('#otp-submit'); await p.waitForURL(/index\.html/);
      await p.waitForSelector('#onboardingOverlay.open', { timeout: 20000 });
      const g0 = await p.evaluate(() => ({ lang: document.documentElement.lang, appLang: lang, pl: document.getElementById('onbProgressLabel').textContent, chips: document.querySelectorAll('#onboardingOverlay button[data-onb-interest]').length, ex: document.querySelectorAll('.onb-cat-examples li').length, q: /What do you want to track|¿Qué quieres controlar/.test(document.getElementById('onboardingOverlay').textContent), tog: (document.querySelector('.onb-langtoggle-btn.is-on') || {}).textContent }));
      ok(`${T} empieza en BIENVENIDA (sin pantalla de idioma) y en el idioma elegido en el acceso`, (await step(p)) === 'WELCOME' && g0.lang === 'en' && g0.appLang === 'en' && /Step 1 of 2/.test(g0.pl) && g0.tog === 'EN', JSON.stringify(g0));
      ok(`${T} categorías como ejemplos NO interactivos y sin la pregunta`, g0.chips === 0 && g0.ex === 6 && !g0.q, JSON.stringify(g0));
      ok(`${T} bienvenida sin desbordamiento horizontal`, !(await hscroll(p)));
      await p.click('[data-onb-langswitch="es"]', { force: true }); await p.waitForTimeout(300);
      const g1 = await p.evaluate(() => ({ st: document.querySelector('.modal--onboarding').getAttribute('data-step'), lang, pl: document.getElementById('onbProgressLabel').textContent, t: document.getElementById('onbTitle').textContent }));
      ok(`${T} el selector ES|EN del onboarding cambia el idioma y conserva el paso`, g1.st === 'WELCOME' && g1.lang === 'es' && /Paso 1 de 2/.test(g1.pl) && /Todo tu patrimonio\. Una sola visión/.test(g1.t), JSON.stringify(g1));
      await p.locator('#onboardingOverlay [data-onb-next]:visible').first().click({ force: true }); await p.waitForTimeout(400);
      ok(`${T} avanza a PRIMER ACTIVO`, (await step(p)) === 'ACTIVATION');
      await p.locator('#onboardingOverlay [data-onb-back]:visible').first().click({ force: true }); await p.waitForTimeout(350);
      ok(`${T} retrocede a BIENVENIDA`, (await step(p)) === 'WELCOME');
      await p.locator('#onboardingOverlay [data-onb-next]:visible').first().click({ force: true }); await p.waitForTimeout(350);
      await p.click('#onbSkipBtn', { force: true }); await p.waitForTimeout(500);
      ok(`${T} omitir deja entrar sin completar`, (await step(p)) === 'closed' && (await p.evaluate(() => window.AurixOnboarding.getSnapshot().completed)) === false);
      await p.reload(); await p.waitForSelector('#onboardingOverlay.open', { timeout: 20000 });
      ok(`${T} se reanuda en PRIMER ACTIVO y en español`, (await step(p)) === 'ACTIVATION' && (await p.evaluate(() => lang)) === 'es');
      await p.click('#onbAddAssetBtn', { force: true }); await p.waitForTimeout(600);
      await p.locator('#modalOverlay button').filter({ hasText: 'Liquidez' }).first().click(); await p.waitForTimeout(500);
      await p.fill('#liquidityQty', '2500');
      await p.evaluate(() => { const b = document.querySelector('#liquidityOverlay .btn-submit'); b.click(); b.click(); });
      await p.waitForTimeout(1400);
      const s = await p.evaluate(() => ({ n: assets.length, st: document.querySelector('.modal--onboarding').getAttribute('data-step'), t: document.getElementById('onbSuccessTitle').textContent, sum: document.getElementById('onbSuccessSummary').textContent.replace(/\s+/g, ' '), prim: document.querySelector('[data-onb-step=SUCCESS] .onb-cta--primary').id }));
      ok(`${T} doble pulsación ⇒ un registro; confirmación con resumen fiel y «Ver mi patrimonio» principal`, s.n === 1 && s.st === 'SUCCESS' && s.t === 'Tu primera posición, registrada' && /Liquidez/.test(s.sum) && /2500,00\s?€/.test(s.sum) && /EUR/.test(s.sum) && /USD/.test(s.sum) && s.prim === 'onbGoDashboardBtn', JSON.stringify(s));
      const cut = await p.evaluate(() => [...document.querySelectorAll('[data-onb-step=SUCCESS] .onb-cta')].map(b => b.scrollWidth > b.clientWidth + 1 || b.getBoundingClientRect().right > innerWidth));
      ok(`${T} acciones de la confirmación sin cortes`, cut.every(x => !x) && !(await hscroll(p)), JSON.stringify(cut));
      await p.evaluate(() => document.getElementById('onbGoDashboardBtn').click()); await p.waitForTimeout(900);
      const d = await p.evaluate(() => ({ y: Math.max(scrollY, document.body.scrollTop, document.documentElement.scrollTop), st: window.AurixOnboarding.getSnapshot().state }));
      ok(`${T} llega al Dashboard arriba con el onboarding completado`, d.y === 0 && d.st === 'COMPLETED' && (await step(p)) === 'closed', JSON.stringify(d));
      await p.reload(); await p.waitForTimeout(4500);
      ok(`${T} recarga: sin reapertura, registro y español conservados`, (await step(p)) === 'closed' && (await p.evaluate(() => assets.length)) === 1 && (await p.evaluate(() => lang)) === 'es');
      ok(`${T} cero peticiones fuera del origen de la demo`, v.ext.length === 0, v.ext.slice(0, 3).join(' '));
      ok(`${T} sin errores de página`, v.errs.length === 0, v.errs.slice(0, 2).join(' | '));
    } catch (e) { ok(`${T} recorrido sin atascos`, false, String(e.message).split('\n')[0]); }
    await v.ctx.close();
  }

  // ── ESTADO GUARDADO ANTIGUO Y USUARIO EXISTENTE ──
  { const v = await visitor(browser, 390, 844, 'es-ES'); const p = v.p;
    await toLogin(p); await p.fill('#email', 'a@example.com'); await p.click('#auth-submit'); await p.waitForSelector('#otpSection', { state: 'visible' });
    await p.evaluate(() => { localStorage.setItem('aurix_onboarding_step', 'LANGUAGE'); });
    await p.fill('#otp-code', '24681357'); await p.click('#otp-submit'); await p.waitForURL(/index\.html/);
    await p.waitForSelector('#onboardingOverlay.open', { timeout: 20000 });
    ok(`${E} un paso LANGUAGE guardado se reanuda en BIENVENIDA`, (await step(p)) === 'WELCOME');
    await v.ctx.close(); }
  { const v = await visitor(browser, 390, 844, 'es-ES'); const p = v.p;
    await p.goto(O + '/demo.html'); await p.click('[data-demo="wealth"]'); await p.waitForURL(/index\.html/); await p.waitForTimeout(4000);
    const a = await step(p); await p.reload(); await p.waitForTimeout(4000);
    ok(`${E} usuario existente (onboarding completado): no se reabre, ni al recargar`, a === 'closed' && (await step(p)) === 'closed');
    ok(`${E} usuario existente: cero peticiones fuera del origen`, v.ext.length === 0, v.ext.slice(0, 3).join(' '));
    await v.ctx.close(); }
  await browser.close();
}
if (server) server.close();
console.log('\n' + pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { console.log('\nFALLOS:\n  ' + fails.join('\n  ') + '\n\nRESULT: NO-GO'); process.exit(1); }
console.log('RESULT: GO');
