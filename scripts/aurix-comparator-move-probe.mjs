#!/usr/bin/env node
/**
 * AURIX · EL COMPARADOR CAMBIA DE CASA: DE INTELLIGENCE A WORKSPACE
 * ════════════════════════════════════════════════════════════════════════════
 * Comparar tu rentabilidad con un índice es una HERRAMIENTA —eliges qué y en
 * qué plazo y obtienes un resultado—, no una lectura que Intelligence te ofrece
 * sin pedirla. Así que se muda. Lo que una mudanza rompe en silencio es el
 * CABLEADO, y aquí estaba el riesgo real:
 *
 *   los listeners del comparador vivían DENTRO de `_initIntelligenceCommandCenter`,
 *   con un guardia de una sola vez. Montados desde Workspace sin extraerlos, la
 *   card se pinta entera y ningún botón hace nada — salvo que el usuario haya
 *   abierto Intelligence antes en esa sesión, que es la peor clase de fallo:
 *   intermitente y dependiente de por dónde entraste.
 *
 * Por eso esto no comprueba que exista la función: PULSA. Cambia de rango, abre
 * el selector de índice, y exige que la superficie reaccione en una sesión que
 * NUNCA ha abierto Intelligence.
 *
 * Y comprueba la otra mitad, que es la que convierte una mudanza en un duplicado
 * si nadie la vigila: que Intelligence ya no la pinta.
 *
 *   node scripts/aurix-comparator-move-probe.mjs
 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const OUT  = join(ROOT, 'docs', 'comparator-move');
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

let pass = 0; const fails = [];
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (info ? '  [' + info + ']' : '')); console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };

// Tres personas, y las tres importan:
//   founder → tiene `workspace.catalog_preview` (ve lo interno) y la clave
//             heredada del comparador. Es quien puede abrirlo HOY.
//   premium → paga, pero la entrada sigue interna: no debe verla NI abrirla.
//   free    → igual, y además sin ninguna clave.
async function mount(page, persona) {
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof renderWorkspaceHome === 'function' && typeof _wsOpenTool === 'function',
    null, { timeout: 60000 });
  await page.waitForTimeout(500);
  await page.evaluate((p) => {
    const bl = document.getElementById('bootLoader'); if (bl) bl.remove();
    const ar = document.getElementById('appRoot'); if (ar) ar.style.opacity = '1';
    document.getElementById('aurixWorkspace').style.display = 'block';
    currentUser = { id: 'u-probe', email: 'probe@aurix.test' };
    _aurixActiveUserId = 'u-probe';
    try { usdToEur = 0.92; } catch (_) {}
    const f = Object.create(null);
    _AURIX_ENT_CANON.forEach((k) => {
      if (p === 'free') { f[k] = false; return; }
      // Premium: todo lo que Premium concede. NI `catalog_preview` (marca de
      // cuenta fundadora) NI la clave heredada del comparador.
      if (k === 'workspace.catalog_preview') { f[k] = (p === 'founder'); return; }
      if (k === 'intelligence.comparator')   { f[k] = (p === 'founder'); return; }
      f[k] = true;
    });
    _aurixEnt = { loaded: true, loading: false, error: null,
      plan: p === 'free' ? 'free' : 'premium', status: p === 'free' ? 'none' : 'active',
      source: 'plan', validUntil: null, features: f, sources: Object.create(null), fetchedAt: Date.now() };
    _aurixEntLastSig = null;
    _wshView = 'home';
    switchTab('workspace');
    return true;
  }, persona);
  await page.waitForTimeout(300);
}
const view = page => page.evaluate(() => {
  const root = document.getElementById('aurixWorkspace');
  const cmp = root.querySelector('.intv14-cmp');
  return JSON.stringify({
    view: (root.querySelector('.aurix-wsh') || {}).getAttribute
      ? root.querySelector('.aurix-wsh').getAttribute('data-wsh-view') : null,
    cmp: !!cmp,
    head: !!root.querySelector('.wsh-cmp-view .wsh-bar'),
    title: (root.querySelector('.wsh-bar-title') || {}).textContent || '',
    ranges: root.querySelectorAll('[data-cmp-range]').length,
    active: (root.querySelector('[data-cmp-range].is-active') || {}).getAttribute
      ? root.querySelector('[data-cmp-range].is-active').getAttribute('data-cmp-range') : null,
    picker: !!root.querySelector('[data-cmp-open]'),
    state: (root.querySelector('.intv14-cmp') || {}).getAttribute
      ? root.querySelector('.intv14-cmp').getAttribute('data-state') : null,
    toolActive: (typeof _wsToolActive !== 'undefined') ? _wsToolActive : null,
  });
}).then(JSON.parse);

console.log('AURIX · el comparador, en su casa nueva\n');
console.log('  NO CUBIERTO AQUÍ: el selector de índice (la fixture no trae historia,');
console.log('  así que la card se pinta en `no_return`). Lo cubre el harness del');
console.log('  comparador, que llama al owner con datos.\n');

for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  const browser = await launcher.launch();
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 700 ? 2 : 1, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const tag = `${ENG}.${w}×${h}`;
    const errors = [];
    page.on('pageerror', e => {
      const m = String(e.message);
      if (/api\/prices|access control checks|Load failed|NetworkError/i.test(m)) return;
      errors.push(m.slice(0, 90));
    });

    // ══ 1 · LA CUENTA FUNDADORA LA ABRE ═══════════════════════════════════
    await mount(page, 'founder');
    const acc = await page.evaluate(() => JSON.stringify(_wsToolAccess('comparator')));
    ok(`${tag} founder · el gate concede la apertura`, JSON.parse(acc).ok === true, acc);
    await page.evaluate(() => _wsOpenTool('comparator'));
    await page.waitForTimeout(600);
    const v1 = await view(page);
    ok(`${tag} founder · la herramienta se abre y se pinta con la cabecera compartida`,
      v1.toolActive === 'comparator' && v1.cmp === true && v1.head === true && v1.ranges >= 3,
      JSON.stringify(v1));
    ok(`${tag} founder · y su cabecera la nombra como capacidad, no como clave`,
      /Comparador de rentabilidad|Return comparator/.test(v1.title), v1.title);

    // ══ 2 · Y SUS CONTROLES RESPONDEN SIN HABER ABIERTO INTELLIGENCE ══════
    // Esta sesión nunca pintó la pestaña Intelligence. Con el cableado sin
    // extraer, aquí no pasaría NADA al pulsar.
    const before = v1.active;
    const other = await page.evaluate((cur) => {
      const all = [...document.querySelectorAll('[data-cmp-range]')].map(b => b.getAttribute('data-cmp-range'));
      return all.find(r => r !== cur) || null;
    }, before);
    ok(`${tag} hay un rango distinto al activo con el que probar`, !!other, String(other));
    if (other) {
      await page.click(`[data-cmp-range="${other}"]`);
      await page.waitForTimeout(700);
      const v2 = await view(page);
      ok(`${tag} founder · cambiar de rango RESPONDE (el cableado viaja con la mudanza)`,
        v2.active === other, `antes ${before} · pedido ${other} · ahora ${v2.active}`);
    }
    // ── LO QUE ESTA SONDA NO CUBRE, DICHO EN VOZ ALTA ──────────────────
    // Sin historia de patrimonio la card se pinta en `no_return`, y en ese
    // estado NO hay selector de índice que abrir. La primera versión de esto
    // envolvía la prueba del selector en un `if (v1.picker)` y el `if` nunca
    // se cumplía: cero asertos ejecutados y la sonda en verde, que es la forma
    // más barata de creerse cubierto. Se afirma el estado REAL y se declara lo
    // que queda fuera; el selector lo cubre el harness del comparador, que
    // llama a `_intv14ComparatorHtml` con datos.
    ok(`${tag} founder · la card se pinta en su estado honesto sin historia`,
      v1.state === 'no_return' && v1.picker === false,
      JSON.stringify({ state: v1.state, picker: v1.picker }));

    // ══ 3 · INTELLIGENCE YA NO LO PINTA ═══════════════════════════════════
    // La otra mitad de una mudanza: si la casa vieja lo sigue enseñando, no es
    // una mudanza, es un duplicado — y dos superficies con el mismo estado
    // acaban diciendo cosas distintas.
    await page.evaluate(() => { switchTab('intelligence'); });
    await page.waitForTimeout(1200);
    ok(`${tag} Intelligence no pinta ninguna card del comparador`,
      await page.evaluate(() => document.querySelectorAll('.intv14-cmp').length === 0));

    // ══ 4 · PREMIUM NO LA VE NI LA ABRE (sigue interna) ═══════════════════
    await mount(page, 'premium');
    const accP = await page.evaluate(() => JSON.stringify(_wsToolAccess('comparator')));
    ok(`${tag} premium · el gate la deniega por NO PUBLICADA, no por derecho`,
      JSON.parse(accP).ok === false && JSON.parse(accP).reason === 'unpublished', accP);
    await page.evaluate(() => _wsOpenTool('comparator'));
    await page.waitForTimeout(400);
    const v4 = await view(page);
    ok(`${tag} premium · pedirla no abre nada`, v4.cmp === false && v4.toolActive !== 'comparator',
      JSON.stringify(v4));
    // Y no se le ofrece comprar algo que no está publicado: sería mentir.
    ok(`${tag} premium · y no se le propone mejorar de plan por algo no publicado`,
      await page.evaluate(() => {
        const K = (typeof _AURIX_UPGRADE_INTENT_KEY !== 'undefined' ? _AURIX_UPGRADE_INTENT_KEY : '') + '_u-probe';
        const raw = localStorage.getItem(K);
        return !raw || raw.indexOf('comparator') === -1;
      }));
    ok(`${tag} premium · la rejilla de herramientas no la enseña`,
      await page.evaluate(() => {
        const root = document.getElementById('aurixWorkspace');
        return root.querySelectorAll('[data-wstool="comparator"], [data-ws-tool="return_comparator"]').length === 0;
      }));

    // ══ 5 · FREE, IGUAL ═══════════════════════════════════════════════════
    await mount(page, 'free');
    const accF = await page.evaluate(() => JSON.stringify(_wsToolAccess('comparator')));
    ok(`${tag} free · denegada igual, y sin decir que es Premium`,
      JSON.parse(accF).ok === false && JSON.parse(accF).reason === 'unpublished', accF);

    ok(`${tag} sin excepciones en consola durante todo el recorrido`,
      errors.length === 0, JSON.stringify(errors.slice(0, 3)));

    await mount(page, 'founder');
    await page.evaluate(() => _wsOpenTool('comparator'));
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(OUT, `cmp-${w}x${h}-${ENG}.png`), fullPage: true });
    await ctx.close();
  }
  await browser.close();
}

// ── Y EL ORDEN QUE PROTEGE A QUIEN YA PAGA ────────────────────────────────
{
  const app = await readFile(join(ROOT, 'app.js'), 'utf8');
  const sql = await readFile(join(ROOT, 'db', 'workspace_comparator_1.sql'), 'utf8');
  // Mientras el SQL esté sin aplicar, la entrada NO puede estar publicada: si lo
  // estuviera, una cuenta Premium vería una capacidad que se le deniega.
  const entry = app.slice(app.indexOf("{ id: 'return_comparator'"), app.indexOf('\n', app.indexOf("{ id: 'return_comparator'")));
  const pending = /PENDIENTE DE APLICAR/.test(sql);
  ok('ORDEN · con el SQL sin aplicar, la entrada sigue interna',
    !pending || /published: false/.test(entry), entry.trim().slice(0, 120));
  ok('ORDEN · y la clave que la abre hoy es la heredada, no una que nadie concede',
    /featureKey: 'intelligence\.comparator'/.test(entry), entry.trim().slice(0, 120));
  ok('SQL · declara la clave nueva para premium y la niega a free',
    /\('premium', 'workspace\.comparator', true\)/.test(sql) &&
    /\('free',\s+'workspace\.comparator', false\)/.test(sql));
  // El cableado es UNO y con guardia: montarlo en cada apertura no puede
  // duplicar listeners.
  ok('CABLEADO · un solo guardia, y el montaje es idempotente',
    /function _initComparatorWiring\(\) \{\s*\n\s*if \(!_intv14CmpWired\) \{/.test(app) &&
    (app.match(/_initComparatorWiring\(\);/g) || []).length === 1);
}

console.log('\n════════════════════════════════════════════════');
console.log(`${pass} passed, ${fails.length} failed\n`);
if (fails.length) { console.log('FAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); console.log('\nRESULT: NO-GO'); server.close(); process.exit(1); }
console.log('RESULT: GO — capturas en docs/comparator-move/');
server.close();
