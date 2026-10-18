#!/usr/bin/env node
/**
 * AURIX · INTENCIÓN PREMIUM DESDE LA LANDING + ESTADOS DEL PAYWALL (demo aislada, sin red ni cobros)
 *   AURIX_DEMO_URL=http://127.0.0.1:8774/ ENGINES=CR,WK node scripts/aurix-premium-intent-probe.mjs
 * Recorre lo que hace un usuario real: entra por el enlace del CTA Premium (login.html?…&intent=premium),
 * acceso por correo con el código simulado, onboarding (aplazado o completo) y llegada al Dashboard.
 * Comprueba: los planes aparecen UNA vez y con origen `landing-premium`; nunca encima del onboarding;
 * una recarga, volver al Dashboard u otra pestaña no los reabren; un Premium no los ve; un CTA
 * gratuito posterior borra la intención; cerrar sesión la borra. Y los cuatro estados del catálogo:
 * comprobando (sin botón de compra), disponible (CTA por plan), no disponible y error con reintento.
 */
const O = String(process.env.AURIX_DEMO_URL || 'http://127.0.0.1:8774/').replace(/\/?$/, '/');
const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
const { chromium, webkit } = await import(PW);
let pass = 0; const fails = [];
const ok = (n, c, i) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (i ? '  [' + i + ']' : '')); console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } };
const CODE = '24681357';
const pwOpen = p => p.evaluate(() => { const o = document.querySelector('.aurix-premium-overlay'); return !!(o && o.classList.contains('is-open') && getComputedStyle(o).display !== 'none'); });
const lastSrc = p => p.evaluate(() => (window.debugAurixPremiumModal ? window.debugAurixPremiumModal().lastSource : null));
const intent = p => p.evaluate(() => { try { return sessionStorage.getItem('aurix_intent'); } catch (_) { return 'ERR'; } });

async function login(p, email, query, entry) {
  // Entrada real del CTA: sin referido la landing apunta a la RAÍZ (index.html redirige al acceso
  // sin sesión); con referido, directamente a login.html.
  if (entry === 'index') { await p.goto(O + 'index.html' + query); await p.waitForURL(/login/, { timeout: 15000 }); }
  else await p.goto(O + 'login.html' + query);
  await p.fill('#email', email); await p.click('#auth-submit');
  await p.locator('#otp-code').waitFor({ timeout: 8000 }); await p.fill('#otp-code', CODE);
  await p.click('#otp-submit');
  await p.waitForURL(/index\.html/, { timeout: 15000 });
}

for (const [ENG, L] of [['CR', chromium], ['WK', webkit]].filter(e => (process.env.ENGINES || 'CR,WK').split(',').includes(e[0]))) {
  const b = await L.launch(); console.log('\n══ ' + ENG + ' ══');
  for (const VW of (process.env.VWS || '390,1440').split(',').map(Number)) {
    const vp = { width: VW, height: VW < 768 ? 844 : 900 };
    console.log('── ' + VW + ' px');

    // 1 · Cuenta NUEVA desde el CTA Premium: onboarding primero, planes al aplazarlo, una sola vez.
    for (const entry of ['index', 'login'])
    { const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
      await p.goto(O + 'demo.html'); await p.check('input[value="free"]'); await p.click('[data-demo=onboarding]'); await p.waitForURL(/login/);
      console.log('   entrada: ' + entry);
      await login(p, 'nuevo' + VW + ENG + entry + '@aurix.invalid', '?lang=es&intent=premium', entry);
      ok('cuenta nueva · el parámetro sale de la URL', !/intent=/.test(p.url()), p.url());
      await p.waitForSelector('#onbSkipBtn', { state: 'visible', timeout: 12000 }).catch(() => {});
      await p.waitForTimeout(1500);
      const onbVisible = await p.locator('#onbSkipBtn').isVisible().catch(() => false);
      ok('cuenta nueva · el onboarding se muestra primero', onbVisible);
      ok('cuenta nueva · sin planes encima del onboarding', !(await pwOpen(p)));
      if (onbVisible) await p.click('#onbSkipBtn');
      await p.waitForTimeout(900);
      ok('cuenta nueva · al aplazar el onboarding aparecen los planes', await pwOpen(p));
      ok('cuenta nueva · con origen landing-premium', (await lastSrc(p)) === 'landing-premium', await lastSrc(p));
      ok('cuenta nueva · intención consumida', (await intent(p)) === null, await intent(p));
      ok('cuenta nueva · el paywall no compra solo (ningún botón ocupado)', await p.evaluate(() => ![...document.querySelectorAll('[data-premium-buy]')].some(x => x.disabled)));
      await p.click('.aurix-premium-stayfree'); await p.waitForTimeout(400);
      ok('cuenta nueva · «Seguir con el plan gratuito» cierra', !(await pwOpen(p)));
      await p.reload(); await p.waitForTimeout(4000);
      ok('cuenta nueva · una recarga no reabre los planes', !(await pwOpen(p)));
      ok('sin errores de página', errs.length === 0, errs.slice(0, 2).join(' | '));
      await ctx.close(); }

    // 1c · Onboarding COMPLETO: alta del primer activo (el modal real abierto; la búsqueda no existe en
    // la demo, así que el alta se notifica con el evento real `aurix:asset-added`) y «Ir al Dashboard».
    { const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage();
      await p.goto(O + 'demo.html'); await p.check('input[value="free"]'); await p.click('[data-demo=onboarding]'); await p.waitForURL(/login/);
      await login(p, 'completo' + VW + ENG + '@aurix.invalid', '?lang=en&intent=premium', 'login');
      await p.waitForSelector('.onb-cta--primary:visible', { timeout: 12000 }); await p.waitForTimeout(800);
      await p.locator('.onb-cta--primary:visible').first().click(); await p.waitForTimeout(600);
      await p.click('#onbAddAssetBtn'); await p.waitForTimeout(700);
      ok('onboarding completo · con el alta abierta no aparecen los planes', !(await pwOpen(p)));
      await p.evaluate(() => { assets.push({ id: 'probe_a1', ticker: 'USD', name: 'Cash', type: 'cash', qty: 1000, price: 1, assetCurrency: 'USD' });
        try { save(); } catch (_) {} window.dispatchEvent(new CustomEvent('aurix:asset-added')); try { closeModal(); } catch (_) {} });
      await p.waitForSelector('#onbGoDashboardBtn:visible', { timeout: 8000 }).catch(() => {});
      ok('onboarding completo · éxito sin planes encima', !(await pwOpen(p)));
      await p.click('#onbGoDashboardBtn').catch(() => {}); await p.waitForTimeout(900);
      ok('onboarding completo · «Ir al Dashboard» abre los planes una vez', await pwOpen(p) && (await lastSrc(p)) === 'landing-premium', String(await lastSrc(p)));
      await ctx.close(); }

    // 2 · Free EXISTENTE entrando por el CTA Premium; luego CTA gratuito, otra pestaña y cierre de sesión.
    { const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage();
      await p.goto(O + 'demo.html'); await p.check('input[value="free"]'); await p.click('[data-demo=wealth]'); await p.waitForURL(/index\.html/); await p.waitForTimeout(3500);
      ok('Free existente · sin intención no hay paywall automático', !(await pwOpen(p)));
      await p.goto(O + 'index.html?lang=es&intent=premium'); await p.waitForTimeout(4500);
      ok('Free existente · los planes se abren al resolver permisos', await pwOpen(p));
      ok('Free existente · origen landing-premium', (await lastSrc(p)) === 'landing-premium', await lastSrc(p));
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      ok('Free existente · Escape cierra', !(await pwOpen(p)));
      const p2 = await ctx.newPage(); await p2.goto(O + 'index.html'); await p2.waitForTimeout(4000);
      ok('Free existente · otra pestaña no reabre los planes', !(await pwOpen(p2))); await p2.close();
      await p.evaluate(() => { const b = document.querySelector('[data-nav="intelligence"], .nav-btn[data-tab="intelligence"]'); if (b) b.click(); }); await p.waitForTimeout(600);
      await p.evaluate(() => { const b = document.querySelector('[data-nav="dashboard"], .nav-btn[data-tab="dashboard"]'); if (b) b.click(); }); await p.waitForTimeout(600);
      ok('Free existente · volver al Dashboard no los reabre', !(await pwOpen(p)));
      // Premium pulsado y LUEGO el gratuito: el enlace posterior manda.
      await p.goto(O + 'index.html?lang=es&intent=premium'); await p.evaluate(() => {});
      await p.goto(O + 'index.html?lang=es'); await p.waitForTimeout(4000);
      ok('CTA gratuito posterior · borra la intención y no abre planes', !(await pwOpen(p)) && (await intent(p)) === null, String(await intent(p)));
      await p.evaluate(() => sessionStorage.setItem('aurix_intent', 'premium'));
      await p.evaluate(() => signOut().catch(() => {})); await p.waitForTimeout(1500);
      ok('cerrar sesión · borra la intención', (await intent(p).catch(() => null)) === null);
      await ctx.close(); }

    // 3 · PREMIUM entrando por el CTA Premium: abre la app, sin otra suscripción.
    { const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage();
      await p.goto(O + 'demo.html'); await p.check('input[value="premium"]'); await p.click('[data-demo=wealth]'); await p.waitForURL(/index\.html/); await p.waitForTimeout(3000);
      await p.goto(O + 'index.html?lang=en&intent=premium'); await p.waitForTimeout(4500);
      ok('Premium · no se le ofrecen planes', !(await pwOpen(p)));
      ok('Premium · la intención se descarta', (await intent(p)) === null, String(await intent(p)));
      ok('Premium · sin tarjetas de descubrimiento Free', await p.evaluate(() => { const s = document.getElementById('dashDiscoverSection'); return !s || s.style.display === 'none' || !s.innerHTML.trim(); }));
      await ctx.close(); }

    // 4 · Estados del catálogo + CTA por plan + cierre siempre visible (móvil).
    { const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage();
      await p.goto(O + 'demo.html'); await p.check('input[value="free"]'); await p.click('[data-demo=wealth]'); await p.waitForURL(/index\.html/); await p.waitForTimeout(3500);
      const st = await p.evaluate(async () => {
        const out = {}; await _aurixBillingPricesLoad({ force: true }); const keep = JSON.parse(JSON.stringify(_aurixBillingPrices));
        const look = () => { const el = document.querySelector('.aurix-premium-plans'); return { cls: el ? el.className : '', buy: document.querySelectorAll('[data-premium-buy]').length, txt: (el ? el.textContent : '').trim().slice(0, 80), retry: !!document.querySelector('[data-premium-retry]') }; };
        _aurixBillingPrices = { loaded: false, loading: true, error: null, rows: [], fetchedAt: 0 };
        const realLoad = _aurixBillingPricesLoad; window._aurixBillingPricesLoad = () => new Promise(() => {});
        try { _aurixBillingPricesLoad = () => new Promise(() => {}); } catch (_) {}
        openAurixPremiumModal({ source: 'probe' }); out.checking = look(); closeAurixPremiumModal();
        _aurixBillingPrices = { loaded: true, loading: false, error: 'network', rows: [], fetchedAt: 0 };
        openAurixPremiumModal({ source: 'probe' }); out.error = look(); closeAurixPremiumModal();
        _aurixBillingPrices = { loaded: true, loading: false, error: null, rows: [], fetchedAt: Date.now() };
        openAurixPremiumModal({ source: 'probe' }); out.empty = look(); closeAurixPremiumModal();
        try { _aurixBillingPricesLoad = realLoad; } catch (_) {}
        _aurixBillingPrices = keep;
        openAurixPremiumModal({ source: 'probe' }); out.ready = look();
        out.labels = [...document.querySelectorAll('[data-premium-buy]')].map(x => x.getAttribute('data-premium-buy') + '=' + x.textContent.trim());
        const cards = [...document.querySelectorAll('.aurix-premium-plans .aurix-premium-plan')].map(c => c.getBoundingClientRect());
        const btns = [...document.querySelectorAll('[data-premium-buy]')].map(c => c.getBoundingClientRect());
        out.sameRow = cards.length === 2 && Math.abs(cards[0].top - cards[1].top) < 1;
        out.heightsEq = cards.length === 2 && Math.abs(cards[0].height - cards[1].height) < 1;
        out.btnAligned = btns.length === 2 && Math.abs(btns[0].top - btns[1].top) < 1;
        out.hscroll = document.querySelector('.aurix-premium-modal').scrollWidth > document.querySelector('.aurix-premium-modal').clientWidth + 1;
        out.text = document.querySelector('.aurix-premium-modal').textContent;
        const m = document.querySelector('.aurix-premium-modal'); m.scrollTop = m.scrollHeight; await new Promise(r => setTimeout(r, 100));
        const c = document.querySelector('.aurix-premium-close').getBoundingClientRect();
        out.closeVisible = c.top >= 0 && c.bottom <= innerHeight && c.width >= 30; out.closeRect = [Math.round(c.top), Math.round(c.bottom), Math.round(c.width), innerHeight].join(',');
        return out;
      });
      ok('comprobando · sin botón de compra y con hueco reservado', st.checking.buy === 0 && /is-checking/.test(st.checking.cls), JSON.stringify(st.checking));
      ok('comprobando · NO dice «no disponible»', !/no está disponible|not available/i.test(st.checking.txt), st.checking.txt);
      ok('error · explicación + reintento, sin compra', st.error.retry && st.error.buy === 0, JSON.stringify(st.error));
      ok('vacío de verdad · «no disponible», sin reintento', /no está disponible|not available/i.test(st.empty.txt) && !st.empty.retry, st.empty.txt);
      ok('disponible · dos planes con CTA explícito por plan', st.ready.buy === 2 && st.labels.some(l => /^year=.*(anual|annual)/i.test(l)) && st.labels.some(l => /^month=.*(mensual|monthly)/i.test(l)), st.labels.join(' | '));
      ok('disponible · anual primero en el DOM', /^year=/.test(st.labels[0] || ''), st.labels[0]);
      if (VW >= 768) {
        ok('escritorio · tarjetas en la misma fila y misma altura', st.sameRow && st.heightsEq);
        ok('escritorio · botones alineados', st.btnAligned);
      }
      ok('sin desplazamiento horizontal', !st.hscroll);
      ok('sin «9 capacidades» ni recuento', !/\b\d+ capacidades|\b\d+ published capabilities/i.test(st.text));
      ok('precios del catálogo y equivalente anual', /69,99|69\.99/.test(st.text) && /7,99|7\.99/.test(st.text) && /5,83|5\.83/.test(st.text) && /27\s?%/.test(st.text));
      ok('cierre visible tras desplazar hasta el final', st.closeVisible, st.closeRect);
      // Reintento real: el catálogo vuelve y aparecen los planes.
      const rt = await p.evaluate(async () => {
        closeAurixPremiumModal(); await new Promise(r => setTimeout(r, 250));
        _aurixBillingPrices = { loaded: true, loading: false, error: 'network', rows: [], fetchedAt: 0 };
        openAurixPremiumModal({ source: 'probe' }); await new Promise(r => setTimeout(r, 50));
        document.querySelector('[data-premium-retry]').click();
        await new Promise(r => setTimeout(r, 1500));
        return document.querySelectorAll('[data-premium-buy]').length;
      });
      ok('reintento · recupera los planes', rt === 2, String(rt));
      await ctx.close(); }

    // 5 · Tarjetas Free: con cartera vacía ceden el sitio; con datos, dos tarjetas hermanas.
    { const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage();
      await p.goto(O + 'demo.html'); await p.check('input[value="free"]'); await p.click('[data-demo=empty]'); await p.waitForURL(/index\.html/); await p.waitForTimeout(3500);
      ok('cartera vacía · sin tarjetas de descubrimiento', await p.evaluate(() => { const s = document.getElementById('dashDiscoverSection'); return !s || s.style.display === 'none'; }));
      await p.goto(O + 'demo.html'); await p.check('input[value="free"]'); await p.click('[data-demo=wealth]'); await p.waitForURL(/index\.html/); await p.waitForTimeout(3500);
      const d = await p.evaluate(() => { const cs = [...document.querySelectorAll('.pgw-card')].map(c => c.getBoundingClientRect()); const ctas = [...document.querySelectorAll('.pgw-cta')].map(c => c.textContent.trim().replace(/\s*›$/, ''));
        return { n: cs.length, eqH: cs.length === 2 && Math.abs(cs[0].height - cs[1].height) < 1, h: cs.map(c => Math.round(c.height)), ctas, over: cs.some(c => c.right > innerWidth + 0.5) }; });
      ok('con datos · dos tarjetas de igual altura', d.n === 2 && d.eqH, JSON.stringify(d.h));
      ok('con datos · CTA «Explorar Intelligence» / «Explorar Workspace»', /Explorar Intelligence|Explore Intelligence/.test(d.ctas[0] || '') && /Explorar Workspace|Explore Workspace/.test(d.ctas[1] || ''), d.ctas.join(' | '));
      ok('con datos · dentro del viewport', !d.over);
      // SE RE-DECIDE (CIERRE PREMIUM DEL EMBUDO FREE): la promo compacta (≤ 190 px) se sustituye por el
      // Premium Gateway, con visual protagonista. Lo que se exige en móvil es que sean un par que no
      // desborda: el ancho del viewport y el CTA dentro de la tarjeta.
      if (VW < 768) ok('móvil · gateway apilado, sin desbordar y con el CTA dentro', !d.over && d.n === 2, JSON.stringify(d.h));
      await p.click('.pgw-cta[data-dsc-go="workspace"]'); await p.waitForTimeout(700);
      ok('el CTA conserva su destino contextual (no abre el paywall)', !(await pwOpen(p)) && await p.evaluate(() => (typeof currentTab !== 'undefined' ? currentTab : '') === 'workspace'), await p.evaluate(() => typeof currentTab !== 'undefined' ? currentTab : '?'));
      await ctx.close(); }
  }
  await b.close();
}
console.log('\n' + (fails.length ? 'NO-GO — ' + fails.length + ' fallos:\n  ' + fails.join('\n  ') : 'GO — ' + pass + '/' + pass));
process.exit(fails.length ? 1 : 0);
