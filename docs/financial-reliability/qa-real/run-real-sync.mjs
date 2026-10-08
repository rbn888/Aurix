#!/usr/bin/env node
/**
 * AURIX · SPEC 1 — VERIFICACIÓN REAL (cuenta SINTÉTICA, backend de PRODUCCIÓN autorizado, código CANDIDATO).
 * NO despliega nada: sirve en http://localhost:PORT el sitio ensamblado de la rama (scripts/aurix-build-site.mjs)
 * con el `config.js` PÚBLICO de producción (sólo clave publicable), y abre DOS perfiles de navegador
 * independientes (A y B) con la MISMA cuenta sintética. Sólo escribe documentos de prueba con prefijo «QA-SPEC1-».
 *
 *   QA_EMAIL=correo.sintetico@… PORT=5599 node docs/financial-reliability/qa-real/run-real-sync.mjs
 * El script pide el código del correo: se escribe en /tmp/aurix-qa-otp.txt (o se pega cuando lo pida).
 * Comprueba: (1) guardar en A → aparece en B (perfil limpio); (2) borrar en A → no reaparece en B tras recargar
 * ni en un perfil C limpio; (3) la fila remota queda con tombstone (no se borra nada).
 */
import { createServer } from 'node:http';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'));
const EMAIL = process.env.QA_EMAIL; const PORT = +(process.env.PORT || 5599);
if (process.env.DRY !== '1' && (!EMAIL || !/\+|qa|test|synthetic|sintetic/i.test(EMAIL))) { console.error('QA_EMAIL debe ser un correo SINTÉTICO de verificación (alias +qa…).'); process.exit(2); }
const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);
const SITE = '/tmp/aurix-qa-real-site';
execFileSync('node', [join(ROOT, 'scripts/aurix-build-site.mjs'), SITE], { stdio: 'inherit' });
// config.js PÚBLICO de producción (lo mismo que descarga cualquier navegador): URL de Supabase y clave publicable.
const cfg = await (await fetch('https://app.aurixsystem.io/config.js')).text();
if (/service_role|sk_live|sk_test/.test(cfg)) { console.error('config.js inesperado'); process.exit(2); }
await writeFile(join(SITE, 'config.js'), cfg);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => { try { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = normalize(join(SITE, p)); if (!f.startsWith(SITE)) return res.writeHead(403).end(); res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(await readFile(f)); } catch (_) { res.writeHead(404).end(); } });
await new Promise(r => server.listen(PORT, '127.0.0.1', r));
const O = `http://localhost:${PORT}/`;
let pass = 0; const fails = []; const ok = (n, c, i) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n); console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } };
const otp = async () => {
  const f = '/tmp/aurix-qa-otp.txt'; try { await rm(f); } catch (_) {}
  console.log('\n>>> Escribe el código recibido en ' + EMAIL + ' en ' + f + '  (echo 12345678 > ' + f + ')');
  for (let i = 0; i < 600; i++) { if (existsSync(f)) { const c = readFileSync(f, 'utf8').trim(); if (/^\d{6,8}$/.test(c)) return c; } await new Promise(r => setTimeout(r, 1000)); }
  throw new Error('sin código');
};
const browser = await chromium.launch();
const profile = async () => { const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } }); const p = await ctx.newPage(); p.on('pageerror', e => console.log('   [pageerror]', e.message.slice(0, 160))); return { ctx, p }; };
// PERFIL A: inicio de sesión real por correo.
const A = await profile();
if (process.env.DRY === '1') {   // ensayo: carga real contra producción SIN enviar ningún correo
  await A.p.goto(O + 'login.html'); await A.p.waitForTimeout(2500);
  await A.p.fill('#email', 'ensayo+qa@example.invalid');   // se escribe, NO se envía
  const st = await A.p.evaluate(() => ({ form: !!document.getElementById('email') && !document.getElementById('auth-submit').disabled, sb: typeof window.supabase !== 'undefined', url: typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL.replace(/https:\/\/([a-z0-9]{4}).*/, 'https://$1…') : null }));
  console.log('DRY', JSON.stringify(st)); await browser.close(); server.close(); process.exit(st.form && st.sb ? 0 : 1);
}
await A.p.goto(O + 'login.html'); await A.p.fill('#email', EMAIL); await A.p.click('#auth-submit');
await A.p.waitForSelector('#otpSection', { state: 'visible', timeout: 20000 });
await A.p.fill('#otp-code', await otp()); await A.p.click('#otp-submit');
await A.p.waitForURL(/index\.html/, { timeout: 30000 }); await A.p.waitForTimeout(7000);
const who = await A.p.evaluate(() => ({ uid: currentUser && currentUser.id, email: currentUser && currentUser.email, prem: hasAurixPremiumAccess() }));
ok('A: sesión real con la cuenta sintética', who.email === EMAIL, JSON.stringify(who));
ok('A: la cuenta sintética tiene Premium (override qa)', who.prem === true, JSON.stringify(who));
// Perfil B y C reciben SÓLO la sesión (como otro dispositivo ya autenticado): sin ningún dato de Workspace.
const authKeys = await A.p.evaluate(() => Object.keys(localStorage).filter(k => /^sb-.*-auth-token$/.test(k)).map(k => [k, localStorage.getItem(k)]));
const seed = async S => { await S.p.goto(O + 'login.html'); await S.p.evaluate(kv => { localStorage.clear(); kv.forEach(([k, v]) => localStorage.setItem(k, v)); }, authKeys); await S.p.goto(O + 'index.html'); await S.p.waitForTimeout(8000); };
// 1 · Guardar en A.
const NAME = 'QA-SPEC1-' + Date.now();
const saved = await A.p.evaluate(async NAME => {
  const id = 'ws4_qa_' + Date.now();
  _ws4Persist({ id, type: 'monthly_budget', customName: NAME, inputs: { currency: 'EUR', salary: 1000, housing: 250 }, results: { income: 1000, expenses: 250 }, currency: 'EUR', bodyVersion: 1, revision: 0, createdAt: Date.now(), updatedAt: Date.now() });
  await _wsDocsPush('aurix_ws_projects_v1');
  const { data } = await supabaseClient.from('workspace_documents').select('doc_id,revision,deleted_at,body').eq('user_id', currentUser.id).eq('doc_id', id);
  return { id, row: data && data[0] ? { rev: data[0].revision, del: data[0].deleted_at, bodyRev: data[0].body && data[0].body.revision } : null };
}, NAME);
ok('1a · A guarda y la fila remota existe con revisión en el cuerpo', saved.row && saved.row.del == null && typeof saved.row.bodyRev === 'number', JSON.stringify(saved));
// 1 · Recuperar en B (perfil limpio).
const B = await profile(); await seed(B);
const inB = await B.p.evaluate(id => ({ has: _ws4Projects().some(x => x.id === id), name: (_ws4Projects().find(x => x.id === id) || {}).customName, ccy: _wsDocCurrencyOf(_ws4Projects().find(x => x.id === id)) }), saved.id);
ok('1b · B (perfil limpio) recupera el documento con su nombre y moneda', inB.has && inB.name === NAME && inB.ccy === 'EUR', JSON.stringify(inB));
// 2 · Borrar en A → tombstone remoto.
const del = await A.p.evaluate(async id => { _ws4Tombstone(id); await _wsDocsPush('aurix_ws_projects_v1'); const { data } = await supabaseClient.from('workspace_documents').select('doc_id,deleted_at').eq('user_id', currentUser.id).eq('doc_id', id); return data && data[0]; }, saved.id);
ok('2a · A borra: la fila remota queda con tombstone (no se borra nada)', del && del.deleted_at != null, JSON.stringify(del));
await B.p.reload(); await B.p.waitForTimeout(8000);
ok('2b · B recarga: el documento NO reaparece', await B.p.evaluate(id => !_ws4Projects().some(x => x.id === id), saved.id));
const C = await profile(); await seed(C);
ok('2c · C (perfil limpio nuevo): el documento borrado NO se recupera ni se ofrece como ambiguo', await C.p.evaluate(id => !_ws4Projects().some(x => x.id === id) && !_wsRecoverable().some(x => x.docId === id), saved.id));
await browser.close(); server.close();
console.log('\n' + (fails.length ? 'NO-GO' : 'GO') + ` — ${pass}/${pass + fails.length}`);
await writeFile('/tmp/aurix-qa-real-result.txt', JSON.stringify({ when: new Date().toISOString(), pass, fails, saved, inB }, null, 2));
process.exit(fails.length ? 1 : 0);
