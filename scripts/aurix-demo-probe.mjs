#!/usr/bin/env node
/**
 * AURIX · SONDA DEL ENTORNO DE DEMO AISLADO
 * ════════════════════════════════════════════════════════════════════════════
 * Navegador real (Chromium y WebKit, móvil y escritorio) contra el artefacto de demo:
 *   · por defecto ensambla la demo en /tmp y la sirve en local;
 *   · con AURIX_DEMO_URL=https://… recorre la demo PUBLICADA (navegador sin sesión).
 * Comprueba: panel de entrada, acceso por correo simulado (correo inválido, código
 * erróneo, «usar otro email»), onboarding completo con avance, retroceso, alta de
 * liquidez, finalización y recarga; cartera ficticia en Free y Premium; Workspace
 * según plan; el cobro deshabilitado sin navegar a ningún proveedor; reinicio; dos
 * visitantes sin estado compartido; y que NINGUNA petición salga del origen de la demo.
 *   AURIX_PW=/ruta/playwright/index.mjs node scripts/aurix-demo-probe.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const PUBLIC = String(process.env.AURIX_DEMO_URL || '').replace(/\/?$/, '/');
let ORIGIN, server = null;
if (PUBLIC !== '/') ORIGIN = PUBLIC;
else {
  const SITE = '/tmp/aurix-demo-probe-site';
  execFileSync('node', [join(ROOT, 'scripts/aurix-build-demo.mjs'), SITE], { stdio: 'ignore', env: Object.assign({}, process.env, { AURIX_DEMO_BASE: '/' }) });
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
  server = createServer(async (req, res) => { try { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = normalize(join(SITE, p)); if (!f.startsWith(SITE)) return res.writeHead(403).end(); const body = await readFile(f); res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }).end(body); } catch (_) { res.writeHead(404).end('nf'); } });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  ORIGIN = `http://127.0.0.1:${server.address().port}/`;
}
const ORIGIN_HOST = new URL(ORIGIN).origin;
const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
let chromium, webkit;
try { ({ chromium, webkit } = await import(PW)); } catch (e) { console.error('✗ SIN MOTORES — ' + PW); if (server) server.close(); process.exit(2); }

let pass = 0; const fails = [];
const ok = (n, c, i) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (i ? '  [' + i + ']' : '')); console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } };
console.log('AURIX · DEMO AISLADA — ' + ORIGIN + (server ? '  (artefacto local)' : '  (PUBLICADA)'));

async function newVisitor(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900, deviceScaleFactor: w < 700 ? 2 : 1 });
  const ext = [];
  ctx.on('request', r => { const u = r.url(); if (!u.startsWith(ORIGIN_HOST) && !/^(data|blob|about):/.test(u)) ext.push(u); });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  return { ctx, p, ext, errs };
}
const step = p => p.evaluate(() => { const m = document.querySelector('#onboardingOverlay .modal'); const o = document.getElementById('onboardingOverlay'); return o && o.classList.contains('open') && m ? m.getAttribute('data-step') : 'closed'; });

for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  const browser = await launcher.launch();
  console.log('\n══ ' + ENG + ' ══');
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const T = `${ENG}.${w}`;
    // ── PANEL DE ENTRADA ──
    let v = await newVisitor(browser, w, h); let p = v.p;
    await p.goto(ORIGIN + 'demo.html');
    const panel = await p.evaluate(() => ({ robots: (document.querySelector('meta[name=robots]') || {}).content, ver: (document.querySelector('[data-ver]') || {}).textContent,
      on: !!document.querySelector('[data-demo=onboarding]'), app: !!document.querySelector('[data-demo=wealth]'), badge: (document.getElementById('aurixDemoBadge') || {}).textContent }));
    ok(`${T} panel: dos entradas, noindex, versión y marca «Demo · Datos ficticios»`, panel.on && panel.app && /noindex/.test(panel.robots || '') && /^v\d+/.test(panel.ver || '') && /Demo/.test(panel.badge || ''), JSON.stringify(panel));
    ok(`${T} robots.txt prohíbe indexar`, /Disallow: \//.test(await (await p.request.get(ORIGIN + 'robots.txt')).text()));

    // ── ACCESO POR CORREO SIMULADO ──
    await p.click('[data-demo=onboarding]'); await p.waitForURL(/login\.html/); await p.waitForTimeout(900);
    const note = await p.evaluate(() => (document.querySelector('.aurix-demo-loginnote') || {}).textContent || '');
    const code = (note.match(/\d{6,8}/) || [])[0];
    ok(`${T} el login dice que es demo y enseña el código de prueba`, !!code, note);
    await p.fill('#email', 'no-es-un-correo'); await p.waitForTimeout(300);
    ok(`${T} validación real: con un correo inválido no se puede enviar`, await p.isDisabled('#auth-submit'));
    await p.fill('#email', 'auditor@example.com'); await p.click('#auth-submit'); await p.waitForSelector('#otpSection', { state: 'visible', timeout: 10000 });
    await p.click('#otp-back'); await p.waitForTimeout(400);
    ok(`${T} «Usar otro email» vuelve al paso del correo`, await p.isVisible('#email'));
    await p.fill('#email', 'auditor@example.com'); await p.click('#auth-submit'); await p.waitForSelector('#otpSection', { state: 'visible', timeout: 10000 });
    await p.fill('#otp-code', '11111111'); await p.click('#otp-submit'); await p.waitForTimeout(1000);
    ok(`${T} validación real: código erróneo`, ((await p.textContent('#otp-error')) || '').trim().length > 0);
    await p.fill('#otp-code', code); await p.click('#otp-submit'); await p.waitForURL(/index\.html/, { timeout: 15000 });

    // ── ONBOARDING ──
    await p.waitForSelector('#onboardingOverlay.open', { timeout: 20000 });
    // El idioma se elige en el acceso: el onboarding empieza en la BIENVENIDA.
    ok(`${T} onboarding arranca en BIENVENIDA`, (await step(p)) === 'WELCOME');
    await p.locator('#onboardingOverlay [data-onb-next]:visible').first().click({ force: true }); await p.waitForTimeout(450);
    ok(`${T} avanza a ACTIVACIÓN`, (await step(p)) === 'ACTIVATION');
    await p.locator('#onboardingOverlay [data-onb-back]:visible').first().click({ force: true }); await p.waitForTimeout(450);
    ok(`${T} retrocede a BIENVENIDA`, (await step(p)) === 'WELCOME');
    await p.locator('#onboardingOverlay [data-onb-next]:visible').first().click({ force: true }); await p.waitForTimeout(450);
    await p.click('#onbAddAssetBtn', { force: true }); await p.waitForTimeout(700);
    await p.locator('#modalOverlay button:has-text("Liquidez"), #modalOverlay button:has-text("Liquidity")').click(); await p.waitForTimeout(600);
    await p.fill('#liquidityQty', '2500'); await p.click('#liquidityOverlay .btn-submit'); await p.waitForTimeout(1300);
    ok(`${T} tras el primer activo: ÉXITO`, (await step(p)) === 'SUCCESS');
    await p.click('#onbGoDashboardBtn', { force: true }); await p.waitForTimeout(900);
    const done = await p.evaluate(() => ({ st: window.AurixOnboarding.getSnapshot().state, ov: document.getElementById('onboardingOverlay').classList.contains('open'),
      row: (JSON.parse(localStorage.getItem('aurix_demo_db_v1') || '{}').user_onboarding || [])[0] }));
    ok(`${T} finaliza: COMPLETED y guardado en el almacén de demo`, done.st === 'COMPLETED' && !done.ov && done.row && done.row.onboarding_completed === true, JSON.stringify(done));
    await p.reload(); await p.waitForTimeout(5000);
    ok(`${T} al recargar no vuelve a pedir onboarding y conserva el activo`, (await step(p)) === 'closed' && (await p.evaluate(() => /2[.,]?\d{3}/.test(document.body.textContent))));
    // ── REINICIO ──
    await p.goto(ORIGIN + 'demo.html'); await p.click('[data-demo=reset]'); await p.waitForTimeout(600);
    const after = await p.evaluate(() => Object.keys(localStorage).filter(k => !/^__/.test(k)));
    ok(`${T} reiniciar deja el navegador en el estado inicial`, after.length === 0, after.join());
    ok(`${T} ninguna petición salió del origen de la demo (acceso + onboarding)`, v.ext.length === 0, v.ext.slice(0, 5).join(' '));
    ok(`${T} sin errores de página`, v.errs.length === 0, v.errs.slice(0, 3).join(' | '));
    await v.ctx.close();

    // ── APLICACIÓN DEMO · FREE Y PREMIUM ──
    for (const plan of ['free', 'premium']) {
      v = await newVisitor(browser, w, h); p = v.p;
      await p.goto(ORIGIN + 'demo.html'); if (plan === 'premium') await p.check('input[value="premium"]');
      await p.click('[data-demo=wealth]'); await p.waitForURL(/index\.html/); await p.waitForTimeout(5000);
      const TT = `${T}.${plan}`;
      const home = await p.evaluate(() => ({ plan: _aurixEnt.plan, prem: hasAurixPremiumAccess(), onb: document.getElementById('onboardingOverlay').classList.contains('open'),
        total: (document.body.textContent.match(/\d{2}\.\d{3},\d{2}\s?US\$|\$\d{2},\d{3}\.\d{2}/) || [])[0], badge: (document.getElementById('aurixDemoBadge') || {}).textContent }));
        ok(`${TT} entra directamente al Dashboard con la cartera ficticia`, !home.onb && !!home.total, JSON.stringify(home));
      ok(`${TT} plan del entorno = ${plan} (sin suscripción real) y la marca lo dice`, home.plan === plan && home.prem === (plan === 'premium') && new RegExp(plan === 'premium' ? 'Premium' : 'Free').test(home.badge || ''), JSON.stringify(home));
      for (const tab of ['market', 'intelligence', 'workspace']) { await p.evaluate(t => switchTab(t), tab); await p.waitForTimeout(1800); }
      const ws = await p.evaluate(() => ({ cover: !!document.querySelector('.wsfc, [class*="wsfc-"]'), tools: document.querySelectorAll('.wsh-toolcard, .wsh-tpl').length }));
      ok(`${TT} Workspace según plan (${plan === 'premium' ? 'herramientas' : 'portada Free'})`, plan === 'premium' ? ws.tools > 0 : ws.cover, JSON.stringify(ws));
      if (plan === 'free') {
        await p.evaluate(() => { try { _aurixBillingCheckout('month', 'demo-probe'); } catch (_) {} });
        await p.waitForTimeout(1200);
        const bill = await p.evaluate(() => ({ url: location.href, toast: [...document.querySelectorAll('.aurix-demo-toast')].map(e => e.textContent).join(' ') }));
        ok(`${TT} el cobro está deshabilitado: aviso y sin salir de la demo`, /index\.html/.test(bill.url) && /pagos están deshabilitados|payments are disabled/.test(bill.toast), JSON.stringify(bill));
      }
      ok(`${TT} ninguna petición salió del origen de la demo`, v.ext.length === 0, v.ext.slice(0, 5).join(' '));
      ok(`${TT} el guard no tuvo que bloquear nada (la app no intentó hablar con producción)`, (await p.evaluate(() => window.__AURIX_DEMO_RUNTIME__.blocked.length)) === 0);
      ok(`${TT} sin errores de página`, v.errs.length === 0, v.errs.slice(0, 3).join(' | '));
      if (plan === 'premium') {
        // Otro visitante (contexto limpio) no ve nada de éste.
        const v2 = await newVisitor(browser, w, h);
        await v2.p.goto(ORIGIN + 'index.html'); await v2.p.waitForURL(/login\.html/, { timeout: 15000 });
        ok(`${TT} un segundo visitante entra sin sesión y sin datos ajenos`, (await v2.p.evaluate(() => localStorage.getItem('portfolio_assets'))) === null);
        await v2.ctx.close();
      }
      await v.ctx.close();
    }
  }
  await browser.close();
}
if (server) server.close();
console.log('\n' + pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { console.log('\nFALLOS:\n  ' + fails.join('\n  ') + '\n\nRESULT: NO-GO'); process.exit(1); }
console.log('RESULT: GO');
