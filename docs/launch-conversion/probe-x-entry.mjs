#!/usr/bin/env node
/**
 * AURIX · SPEC 2 — ENTRADA DESDE X (navegador integrado). AUTOMATIZADO con user-agent emulado: NO equivale
 * a un iPhone o Android físicos (la WebView real y su menú no se pueden ejercitar aquí).
 *   AURIX_DEMO_URL=http://127.0.0.1:8777/ node docs/launch-conversion/probe-x-entry.mjs
 */
const O = String(process.env.AURIX_DEMO_URL || 'http://127.0.0.1:8777/').replace(/\/?$/, '/');
const { webkit, chromium } = await import(process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs');
let pass = 0; const fails = []; const ok = (n, c, i) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n); console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } };
const UA = {
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/10.53',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36 TwitterAndroid',
};
for (const [os, eng] of [['ios', webkit], ['android', chromium]]) {
  const b = await eng.launch(); const p = await (await b.newContext({ userAgent: UA[os], viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
  await p.goto(O + 'login.html?lang=es'); await p.waitForTimeout(1200);
  const st = await p.evaluate(() => { const v = id => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; };
    return { emb: v('embeddedSection'), open: v('embOpen'), copyPrimary: (document.getElementById('embCopy') || {}).className, manual: v('embManual'), manualText: (document.getElementById('embManual') || {}).textContent, auth: v('authSection') }; });
  if (os === 'ios') {
    ok('iOS (X): interstitial visible y sin formulario de acceso', st.emb && !st.auth, JSON.stringify(st));
    ok('iOS (X): NO se ofrece «Abrir en el navegador» (reabriría el mismo bloqueo)', !st.open, JSON.stringify(st));
    ok('iOS (X): «Copiar enlace» es la acción principal y la instrucción se ve desde el principio', st.copyPrimary === 'auth-btn' && st.manual && /Safari/.test(st.manualText), JSON.stringify(st));
  } else {
    ok('Android (X): se mantiene la salida real «Abrir en el navegador» (intent://)', st.emb && st.open, JSON.stringify(st));
  }
  await b.close();
}
console.log('\n' + (fails.length ? 'NO-GO' : 'GO') + ` — ${pass}/${pass + fails.length}`); process.exit(fails.length ? 1 : 0);
