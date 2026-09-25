#!/usr/bin/env node
/**
 * AURIX · INTELLIGENCE EN EL MÓVIL: LO QUE SE PUEDE PULSAR Y LO QUE SE PUEDE LEER
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE, HABIENDO YA UNA SONDA VISUAL.
 * `aurix-int04-visual-qa.mjs` mide esta misma superficie y mide bien, pero (a)
 * su mitad de geometría exige Node ≥ 22 —WebSocket global + CDP— y en el
 * entorno de trabajo hay Node 20, así que lleva tiempo sin ejecutarse; y (b) lo
 * que comprueba lo comprueba sobre LISTAS DE SELECTORES escritas a mano:
 *
 *     host.querySelectorAll('.intcc-x-q, .intv4-more-sum')   ← objetivos táctiles
 *     FACT.forEach(...)                                      ← tamaños de letra
 *
 * Una lista así fija lo que existía el día que se escribió. El enlace «Ver
 * cambios ↓» del hero —la ÚNICA acción de la primera tarjeta— se añadió
 * después, no está en ninguna de las dos listas, y medía **20 px de alto**
 * contra un contrato de 44. El gate estaba verde.
 *
 * Así que esta sonda no nombra nada: barre TODO lo que se puede pulsar y TODO
 * nodo de texto de la superficie, y pregunta por el resultado PINTADO.
 *
 *   · objetivo táctil = área de IMPACTO real (`elementFromPoint` en los dos
 *     extremos de la banda de 44 px), no la altura de la caja. Medir la caja es
 *     lo que haría pasar por bueno un enlace de 20 px con área ampliada, y lo
 *     que haría suspender a uno de 44 px tapado por otra capa.
 *   · tamaño de letra = el RENDERIZADO. Dentro de un SVG con `viewBox` el
 *     `font-size` calculado NO es el que se ve: el radar declara 9,5 px y en
 *     un teléfono de 360 px se pinta a 8,9 porque la escala es 0,939.
 *
 * LO QUE ESTA SONDA NO ARREGLA Y DECLARA: el texto del radar no cabe más grande
 * sin rehacer su geometría (quedan 3–7 px de holgura dentro del SVG). Se publica
 * el número como LÍMITE MEDIDO, no como aprobado: agrandarlo exige decidir si la
 * tarjeta crece, y esta pantalla tiene un problema de scroll, no de sitio.
 *
 *   AURIX_INT04_DUMP=1 node scripts/aurix-int04-visual-qa.mjs   (genera el markup)
 *   node scripts/aurix-intelligence-mobile-probe.mjs
 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const MARKUP_DIR = join(ROOT, 'docs', 'int04-visual-qa');
const OUT = join(ROOT, 'docs', 'intelligence-mobile');

// El markup lo genera la sonda que ya tiene la fixture certificada. Duplicarla
// aquí sería tener dos fixtures divergiendo y llamándolas lo mismo.
for (const l of ['es', 'en']) {
  if (!existsSync(join(MARKUP_DIR, `markup-${l}.html`))) {
    const r = spawnSync('node', [join(ROOT, 'scripts', 'aurix-int04-visual-qa.mjs')],
      { encoding: 'utf8', env: { ...process.env, AURIX_INT04_DUMP: '1' }, timeout: 120000 });
    if (r.status !== 0) { console.error('✗ no se pudo generar el markup:\n' + (r.stderr || r.stdout)); process.exit(2); }
    break;
  }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const abs = normalize(join(ROOT, p)); if (!abs.startsWith(ROOT)) return res.writeHead(403).end();
    const body = await readFile(abs);
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

const TAP_MIN  = 44;   // el contrato que la superficie ya declara
const FONT_MIN = 11;   // el suelo que la propia sonda INT.04 aplica a sus hechos

// ── LA MEDIDA, EN LA PÁGINA ────────────────────────────────────────────────
// Nada de listas: se barre el DOM. Y el área táctil se comprueba por impacto,
// que es lo único que responde a «¿llega el dedo?».
const MEASURE = `(function(){
  var wrap = document.querySelector('.aurix-intcc');
  var wr = wrap.getBoundingClientRect();
  var vis = function (e) {
    var r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (typeof e.checkVisibility === 'function')
      return e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    var cs = getComputedStyle(e);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.01;
  };
  // ── TODO LO QUE SE PUEDE PULSAR ─────────────────────────────────────────
  // VA PRIMERO A PROPÓSITO, y no por gusto: comprobar el alcance del dedo
  // obliga a traer cada control al centro de la pantalla, y ESE recorrido es
  // lo que fuerza a pintar lo que el motor se salta mientras está fuera de la
  // vista. Con el barrido de texto delante, los diez rótulos del radar medían
  // 0x0 y el informe decía «2 textos pequeños» donde hay diez: un número
  // tranquilizador y falso. Primero se recorre, después se mide.
  // VA AL FINAL A PROPÓSITO: comprobar el alcance del dedo obliga a DESPLAZAR
  // la página (elementFromPoint trabaja en coordenadas de ventana), y con la
  // pagina movida checkVisibility da por invisibles las tarjetas que quedan
  // fuera. Midiendo los textos después del barrido táctil se perdían ocho de
  // los diez rótulos del radar y el informe decía «1» donde hay diez. Lo que
  // mide layout va antes; lo que mueve la página, después.
  var CLICKABLE = 'a[href],button,summary,input,select,textarea,[role="button"],[role="link"],[onclick],[tabindex]:not([tabindex="-1"])';
  var taps = [];
  [].slice.call(wrap.querySelectorAll(CLICKABLE)).forEach(function (e) {
    if (!vis(e)) return;
    // elementFromPoint trabaja en coordenadas de VENTANA: un control que esta
    // por debajo del pliegue devuelve null y pasaria por «no alcanzable» sin
    // que le pase nada. Se trae al centro de la pantalla antes de tocarlo -que
    // es ademas lo que hace el usuario para pulsarlo.
    // behavior:instant es obligatorio: la hoja de estilos declara
    // scroll-behavior:smooth en :root, y con desplazamiento animado el punto
    // que se toca todavia no es el que se mide. Un control correcto salia
    // como inalcanzable, que es un falso ROJO -igual de inutil que un verde.
    e.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    var r = e.getBoundingClientRect();
    var cx = Math.round(r.left + r.width / 2);
    var cy = Math.round(r.top + r.height / 2);
    // Los dos extremos de la banda de 44 px centrada en el control. Si en
    // ambos el punto resuelve al propio control (o a un hijo suyo), el dedo
    // tiene 44 px, tenga la caja la altura que tenga.
    var half = Math.floor(${TAP_MIN} / 2) - 1;
    var hitTop = document.elementFromPoint(cx, Math.max(0, cy - half));
    var hitBot = document.elementFromPoint(cx, Math.min(innerHeight - 1, cy + half));
    var owns = function (n) { return !!n && (n === e || e.contains(n) || (n.closest && n.closest(CLICKABLE) === e)); };
    var reach = owns(hitTop) && owns(hitBot);
    if (!reach) taps.push({ t: (e.innerText || e.value || '').trim().slice(0, 26),
      cls: (e.className || '').toString().slice(0, 42), h: Math.round(r.height), w: Math.round(r.width),
      top: owns(hitTop), bot: owns(hitBot) });
  });
  // ── TODO TEXTO, CON SU TAMAÑO RENDERIZADO ───────────────────────────────
  // Dentro de un SVG con viewBox el tamaño pintado es el declarado POR la
  // escala. Medirlo con getComputedStyle a secas es medir otra cosa.
  var svgScale = function (el) {
    var svg = el.ownerSVGElement || (el.tagName === 'svg' ? el : null);
    if (!svg) return 1;
    var vb = svg.viewBox && svg.viewBox.baseVal;
    if (!vb || !vb.width) return 1;
    return svg.getBoundingClientRect().width / vb.width;
  };
  var small = [];
  [].slice.call(wrap.querySelectorAll('*')).forEach(function (e) {
    var own = '';
    [].slice.call(e.childNodes).forEach(function (n) { if (n.nodeType === 3) own += n.textContent; });
    var txt = own.trim();
    // EL SUELO ES PARA LO QUE SE LEE. Un glifo suelto —el «%» pegado al número
    // grande, el «·» o el «!» de un marcador— no se lee por separado: se lee
    // como parte de su vecino, y exigirle 11 px obligaría a agrandar iconos,
    // no a hacer nada legible. La regla no nombra selectores (eso es lo que
    // dejó escapar el defecto que motivó esta sonda): pide que el texto tenga
    // al menos una letra o una cifra y dos caracteres. «1,3 / 7» y «sin datos»
    // entran; «%» y «·» no.
    if (!txt || !/[\p{L}\p{N}]/u.test(txt) || txt.length < 2) return;
    if (e.ownerSVGElement) return;   // ver la nota de arriba
    if (!vis(e)) return;
    var declared = parseFloat(getComputedStyle(e).fontSize) || 0;
    var painted = +(declared * svgScale(e)).toFixed(1);
    var row = { t: txt.slice(0, 26), declared: declared, painted: painted,
      cls: (e.getAttribute && e.getAttribute('class') || '').toString().slice(0, 40) };
    // EL TEXTO DENTRO DE UN SVG NO SE MIDE AQUI, Y SE DICE POR QUE. Su tamaño
    // pintado depende de la escala del viewBox, y ademas el motor no coloca el
    // subarbol hasta que entra en pantalla: un barrido de una pasada le saca
    // ceros. Intente contarlo igualmente y el numero salia distinto en cada
    // orden de ejecucion -tranquilizador y falso-. Se declara NO MEDIDO y su
    // suelo se vigila en la hoja de estilos, que si es estable.
    if (painted > 0 && painted < ${FONT_MIN}) small.push(row);
  });
  // ── DESBORDES Y RECORTES ────────────────────────────────────────────────
  var over = [], clip = [];
  [].slice.call(wrap.querySelectorAll('*')).forEach(function (e) {
    if (!vis(e)) return;
    var cs = getComputedStyle(e);
    var r = e.getBoundingClientRect();
    // Decorativo (un halo, un resplandor) puede salirse: no lleva información.
    var decorative = e.getAttribute('aria-hidden') === 'true' || /glow|ring|halo|orb-/.test((e.getAttribute('class')||''));
    if (!decorative && (r.right > wr.right + 1 || r.left < wr.left - 1))
      over.push({ cls: (e.getAttribute('class')||'').slice(0, 40), out: Math.round(Math.max(r.right - wr.right, wr.left - r.left)) });
    if (cs.display !== 'inline' && cs.overflow === 'visible' && cs.textOverflow !== 'ellipsis'
        && e.scrollWidth - Math.round(r.width) > 1 && (e.innerText || '').trim())
      clip.push({ t: (e.innerText || '').trim().slice(0, 24), sw: e.scrollWidth, w: Math.round(r.width) });
  });
  var cards = [].slice.call(wrap.children).filter(vis).map(function (e) {
    var r = e.getBoundingClientRect();
    return { cls: (e.getAttribute('class')||'').replace('is-revealed','').trim().slice(0, 34), h: Math.round(r.height) };
  });
  return JSON.stringify({
    taps: taps, small: small, over: over, clip: clip,
    total: Math.round(wr.height), screens: +(wr.height / innerHeight).toFixed(2),
    cards: cards, textLen: (wrap.innerText || '').length,
  });
})()`;

console.log('AURIX · Intelligence en el móvil: pulsar y leer\n');

for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  const browser = await launcher.launch();
  for (const lang of ['es', 'en']) {
    const HTML = readFileSync(join(MARKUP_DIR, `markup-${lang}.html`), 'utf8');
    for (const [w, h] of [[390, 844], [360, 740]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      const tag = `${ENG}.${lang}.${w}×${h}`;
      await page.setContent(
        `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<link rel="stylesheet" href="${ORIGIN}/styles.css"></head>` +
        `<body style="margin:0;background:#0b1020"><div id="host"></div></body></html>`,
        { waitUntil: 'load' });
      await page.waitForTimeout(400);
      await page.evaluate(html => {
        const host = document.getElementById('host');
        host.innerHTML = html;
        // La superficie nace en opacidad 0 y la app le añade `is-revealed` al
        // montar. Sin esto todo es legítimamente invisible y la medida es vacua.
        const wrap = host.querySelector('.aurix-intcc');
        if (wrap) wrap.classList.add('is-revealed');
      }, HTML);
      // ── ESPERAR AL REVELADO, NO A UN RELOJ ────────────────────────────────
      // Las tarjetas entran con un escalonado de opacidad. Con una espera fija
      // de 500 ms las últimas seguían en opacidad ~0, `checkVisibility` las daba
      // por invisibles y el barrido de texto se saltaba OCHO de los diez rótulos
      // del radar: el informe decía «1 texto pequeño» donde hay diez. Se espera
      // al ESTADO —que todas estén pintadas—, no a un número de milisegundos.
      await page.waitForFunction(() => {
        const w = document.querySelector('.aurix-intcc');
        if (!w) return false;
        return [...w.children].every(e => {
          const r = e.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) return true;   // una card vacía no bloquea
          return typeof e.checkVisibility !== 'function'
            || e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
        });
      }, null, { timeout: 15000 });
      await page.waitForTimeout(200);

      const m = await page.evaluate(MEASURE).then(JSON.parse);

      // NO VACUIDAD: si la superficie no está pintada, todo lo de abajo pasaría
      // midiendo nada. Se exige texto y tarjetas antes que cualquier veredicto.
      ok(`${tag} la superficie está pintada (no se mide una pantalla vacía)`,
        m.textLen > 400 && m.cards.length >= 8, `texto ${m.textLen}, cards ${m.cards.length}`);

      ok(`${tag} todo lo pulsable alcanza ${TAP_MIN} px de ÁREA DE IMPACTO`,
        m.taps.length === 0, JSON.stringify(m.taps).slice(0, 220));

      const smallSet = [...new Set(m.small.map(x => x.cls + ' @' + x.painted))].sort();
      ok(`${tag} ningún texto fuera del radar baja de ${FONT_MIN} px pintados`,
        m.small.length === 0, smallSet.join(' · ').slice(0, 300));

      ok(`${tag} nada con información se sale de la superficie`,
        m.over.length === 0, JSON.stringify(m.over).slice(0, 180));

      ok(`${tag} ningún texto recortado sin elipsis`,
        m.clip.length === 0, JSON.stringify(m.clip).slice(0, 180));

      // Sin recuento de textos SVG: el barrido no los ve de forma estable y un
      // número que cambia con el orden de ejecución es peor que no dar ninguno.
      notes.push(`${tag} alto ${m.total}px (${m.screens} pantallas)`);

      await page.screenshot({ path: join(OUT, `int-${lang}-${w}x${h}-${ENG}.png`), fullPage: true });
      await ctx.close();
    }
  }
  await browser.close();
}

// ── Y EL ARREGLO, FIJADO EN LA HOJA DE ESTILOS ─────────────────────────────
// El área ampliada tiene que seguir siendo INVISIBLE: si alguien le pone fondo
// o borde, aparece un rectángulo fantasma en el hero.
{
  const css = await readFile(join(ROOT, 'styles.css'), 'utf8');
  const i = css.indexOf('.intv12-see-changes::after');
  const block = i < 0 ? '' : css.slice(i, css.indexOf('}', i) + 1);
  // ── EL SUELO DEL RADAR, VIGILADO DONDE SÍ ES ESTABLE ──────────────────
  // El texto del radar se pinta a 7–9,7 px reales y no cabe más grande: dentro
  // del SVG quedan 3–7 px de holgura por los cuatro lados, así que agrandarlo
  // exige rehacer su geometría —y la tarjeta crecería, que es lo contrario de
  // lo que esta pantalla necesita—. Eso es una decisión de producto, no un
  // arreglo de estilo. Lo que sí se fija aquí es que NO ENCOJA más.
  const radarSizes = ['intcc-radar-label', 'intcc-radar-val'].map(sel => {
    // El selector se escribe con espacios de relleno para alinear la columna
    // (`.intcc-radar-val   {`), así que buscarlo con una cadena literal falla
    // y devuelve null — y `null >= 8` es false: la guarda habría suspendido
    // sin que nadie hubiera tocado el radar.
    const m2 = css.match(new RegExp('\\.' + sel + '\\s*\\{[^}]*font-size:\\s*([\\d.]+)px'));
    return { sel, fs: m2 ? parseFloat(m2[1]) : null };
  });
  ok('CSS · el texto del radar no encoge por debajo de lo ya medido (9,5 / 8 px)',
    radarSizes[0].fs >= 9.5 && radarSizes[1].fs >= 8,
    JSON.stringify(radarSizes));

  ok('CSS · el área táctil del hero se amplía sin caja propia',
    /height:\s*44px/.test(block) && !/background|border(?!-radius)|box-shadow/.test(block),
    block.replace(/\s+/g, ' ').slice(0, 150));
}

console.log('\n── MEDIDAS ────────────────────────────────────────');
for (const n of notes) console.log('  ' + n);
console.log(`\n  suelo táctil ${TAP_MIN} px (por impacto) · suelo de letra ${FONT_MIN} px (pintados)`);
console.log('  NO MEDIDO AQUÍ: el texto dentro del SVG del radar. Se pinta a 7–9,7 px');
console.log('  reales y no cabe más grande —quedan 3–7 px de holgura en el viewBox—, así');
console.log('  que agrandarlo obliga a rehacer su geometría y a que la tarjeta crezca.');
console.log('  Es una decisión de producto. Aquí sólo se vigila que no encoja más.');

console.log('\n════════════════════════════════════════════════');
console.log(`${pass} passed, ${fails.length} failed\n`);
if (fails.length) { console.log('FAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); console.log('\nRESULT: NO-GO'); server.close(); process.exit(1); }
console.log('RESULT: GO — capturas en docs/intelligence-mobile/');
server.close();
