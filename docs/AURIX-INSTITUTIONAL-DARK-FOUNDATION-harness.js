'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-INSTITUTIONAL-DARK-FOUNDATION-harness — DASHBOARD EXCELLENCE V1 · BLOCK 1
// ════════════════════════════════════════════════════════════════════════════
// Scope: S2 + S3 + S5 + S8 + D2 of the DASHBOARD EXCELLENCE V1 audit, token-only.
// One canonical surface ladder (canvas + 3 elevation levels) with every legacy name
// aliased onto it, the global ± glow removed, the wealth figure on the canonical top
// text token with no halo, and the self-referential --aurix-blue-hover cycle fixed.
//
// The ratios are not asserted against hardcoded expectations copied from a comment:
// this harness RE-DERIVES every WCAG contrast from the token values it parses out of
// styles.css, compositing alpha overlays over the real canvas, so a future edit that
// silently flattens the ladder or darkens a surface fails here.
//
// Proves the SPEC's A–I contract plus the two things that make this block safe: the
// figures/CTAs that live on the content plane keep AA, and nothing about geometry,
// responsive behaviour, the Chart Engine, snapshots or the watchdog moved.
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const version = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra !== undefined ? '  →  ' + extra : '')); } }

// ── token plumbing ──────────────────────────────────────────────────────────
const rootBlock = (function () {
  const i = css.indexOf(':root {');
  let d = 0, k = css.indexOf('{', i);
  for (; k < css.length; k++) { if (css[k] === '{') d++; else if (css[k] === '}') { d--; if (!d) break; } }
  return css.slice(i, k);
})();
// strip comments so a hex quoted inside a comment is never parsed as a value
const rootClean = rootBlock.replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = {};
rootClean.replace(/(--[\w-]+)\s*:\s*([^;]+);/g, (_, k, v) => { tokens[k] = v.trim(); return ''; });

// Resolve a token through var() chains. Returns null on a cycle or a dangling name.
function resolve(name, seen) {
  seen = seen || new Set();
  if (seen.has(name)) return null;                       // cycle
  seen.add(name);
  let v = tokens[name];
  if (v === undefined) return null;                      // dangling
  const m = /^var\(\s*(--[\w-]+)\s*\)$/.exec(v);
  if (m) return resolve(m[1], seen);
  return v;
}

// ── colour maths (WCAG 2.x relative luminance) ──────────────────────────────
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
const over = (fg, a, bg) => fg.map((c, i) => c * a + bg[i] * (1 - a));
function parseColor(v) {
  if (!v) return null;
  let m = /^#([0-9a-f]{6})$/i.exec(v.trim());
  if (m) return { rgb: [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)), a: 1 };
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v.trim());
  if (m) return { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] };
  return null;
}
const canvasC = parseColor(resolve('--elev-0'));
// A token's effective plane = itself if opaque, else composited over the canvas.
function plane(name) {
  const c = parseColor(resolve(name));
  if (!c) return null;
  return c.a === 1 ? c.rgb : over(c.rgb, c.a, canvasC.rgb);
}
const vsCanvas = name => ratio(plane(name), canvasC.rgb);

console.log('AURIX-INSTITUTIONAL-DARK-FOUNDATION — DASHBOARD EXCELLENCE V1 · BLOCK 1\n');
console.log('Canvas resolved from --elev-0: ' + resolve('--elev-0') + '\n');

// ── A. un único canvas efectivo ─────────────────────────────────────────────
console.log('A — un único canvas efectivo:');
const canvasTokens = ['--bg', '--bg-main', '--aurix-bg', '--elev-0', '--color-bg-primary'];
const canvasValues = canvasTokens.map(t => resolve(t));
ok('A1 --bg / --bg-main / --aurix-bg / --color-bg-primary resuelven todos a --elev-0',
   canvasValues.every(v => v === resolve('--elev-0')), JSON.stringify(canvasValues));
ok('A2 los tres near-black legacy (#080C16 / #0A0E1A / #0E131F) ya no se asignan a ningún token',
   !/--[\w-]+\s*:\s*#(080C16|0A0E1A|0E131F)\b/i.test(rootClean));
ok('A3 html y body siguen pintando el lienzo por token, no por literal',
   /html\s*\{[^}]*background:\s*var\(--bg-main\)/.test(css) && /\bbody\s*\{[^}]*background:\s*var\(--bg-main\)/.test(css));

// ── B. jerarquía de superficies coherente ───────────────────────────────────
console.log('\nB — jerarquía de superficies (ratios RE-DERIVADOS de los tokens):');
const r1 = vsCanvas('--elev-1'), r2 = vsCanvas('--elev-2'), r3 = vsCanvas('--elev-3');
console.log('    elev-1 ' + r1.toFixed(3) + ' · elev-2 ' + r2.toFixed(3) + ' · elev-3 ' + r3.toFixed(3));
ok('B1 escalera estrictamente creciente sobre el lienzo', r1 > 1.05 && r2 > r1 && r3 > r2);
ok('B2 nivel 1 ≈1.22 — plano de contenido (techo medido: 1.247 hunde el rojo a AA)', r1 >= 1.19 && r1 <= 1.24, r1.toFixed(3));
ok('B3 nivel 2 ≈1.45 — chrome elevado', r2 >= 1.40 && r2 <= 1.50, r2.toFixed(3));
ok('B4 nivel 3 ≈1.70 — tope', r3 >= 1.63 && r3 <= 1.77, r3.toFixed(3));
ok('B5 mejora real frente al estado previo (surface-2 medía 1.119, bg-card 1.197)', r1 > 1.197);
ok('B6 las DOS familias caen en el MISMO plano (fin del 1.07 entre --bg-card y --surface-2)', (function () {
  const solid1 = ratio(plane('--elev-1-solid'), plane('--elev-1'));
  const solid2 = ratio(plane('--elev-2-solid'), plane('--elev-2'));
  return solid1 < 1.02 && solid2 < 1.02;
})());
ok('B7 el material alpha sigue siendo alpha (el anidado deliberado compone hacia arriba)', (function () {
  const a1 = parseColor(resolve('--elev-1')), a2 = parseColor(resolve('--elev-2'));
  if (!a1 || !a2 || a1.a >= 1 || a2.a >= 1) return false;
  const nested = over(a1.rgb, a1.a, plane('--elev-1'));
  return ratio(nested, plane('--elev-1')) > 1.25;        // una card dentro de otra sube de nivel de verdad
})());
ok('B8 el tinte conserva el carácter azul-negro Aurix (no gris neutro)', (function () {
  const p = plane('--elev-1');                            // delta cromático contra el lienzo
  const d = p.map((v, i) => v - canvasC.rgb[i]);
  return (d[2] - d[0]) >= 6;                              // el azul sube claramente más que el rojo
})());
ok('B9 el hairline mantiene su separación sobre el nuevo plano', (function () {
  const b = parseColor(resolve('--border-subtle'));
  return b && ratio(over(b.rgb, b.a, plane('--elev-1')), plane('--elev-1')) >= 1.25;
})());

// ── C. aliases legacy siguen resolviendo ────────────────────────────────────
console.log('\nC — aliases legacy resuelven (sin ciclos ni nombres colgando):');
const legacy = ['--bg', '--bg-card', '--bg-card-2', '--surface-1', '--surface-2', '--surface-3',
                '--bg-main', '--aurix-bg', '--color-bg-primary', '--color-bg-surface', '--color-bg-elevated',
                '--border-subtle', '--border-strong', '--accent', '--text', '--text-bright', '--text-muted'];
legacy.forEach(t => ok('C · ' + t + ' → ' + (resolve(t) || 'SIN RESOLVER'), !!parseColor(resolve(t)) || /^(rgba?|#)/i.test(String(resolve(t)))));
ok('C0 ningún token de :root se autorreferencia (ciclo ⇒ guaranteed-invalid)',
   Object.keys(tokens).every(t => resolve(t) !== null || !/^var\(/.test(tokens[t])));
ok('C1 --surface-2 (el material de card por defecto) apunta al nivel 1', resolve('--surface-2') === resolve('--elev-1'));
ok('C2 --surface-3 (hover de card) sube al nivel 2', resolve('--surface-3') === resolve('--elev-2'));
ok('C3 --bg-card sigue siendo OPACO (lo consumen modales/dropdowns sobre contenido)',
   parseColor(resolve('--bg-card')).a === 1);

// ── D. el ciclo --aurix-blue-hover ya no existe ─────────────────────────────
console.log('\nD — token defectuoso S8:');
ok('D1 --aurix-blue-hover ya no se autorreferencia', !/--aurix-blue-hover:\s*var\(--aurix-blue-hover\)/.test(css));
ok('D2 resuelve a un color válido', !!parseColor(resolve('--aurix-blue-hover')));
ok('D3 misma familia de azul que --aurix-blue (no una nueva familia)', (function () {
  const b = parseColor(resolve('--aurix-blue')), h = parseColor(resolve('--aurix-blue-hover'));
  if (!b || !h) return false;
  const hue = ([r, g, bl]) => Math.round(Math.atan2(Math.sqrt(3) * (g - bl), 2 * r - g - bl) * 180 / Math.PI);
  return Math.abs(hue(b.rgb) - hue(h.rgb)) <= 8 && lum(h.rgb) > lum(b.rgb);   // mismo tono, un paso más claro
})());
ok('D4 legible sobre los dos planos donde puede aparecer', (function () {
  const h = parseColor(resolve('--aurix-blue-hover')).rgb;
  return ratio(h, plane('--elev-1')) >= 4.5 && ratio(h, plane('--elev-2')) >= 4.5;
})());

// ── E. .positive / .negative sin glow ───────────────────────────────────────
console.log('\nE — glow global de cifras (S5):');
ok('E1 .positive ya no lleva text-shadow', !/^\.positive\s*\{[^}]*text-shadow/m.test(css));
ok('E2 .negative ya no lleva text-shadow', !/^\.negative\s*\{[^}]*text-shadow/m.test(css));
ok('E3 el color y la semántica de estado se conservan',
   /\.summary-perf\.positive\s*\{\s*color:\s*var\(--green\)/.test(css) && /\.summary-perf\.negative\s*\{\s*color:\s*var\(--red\)/.test(css));
ok('E4 el estado sigue distinguiéndose por color con holgura sobre el plano de contenido', (function () {
  const g = parseColor(resolve('--aurix-success')).rgb, r = parseColor(resolve('--aurix-danger')).rgb;
  return ratio(g, plane('--elev-1')) >= 4.5 && ratio(r, plane('--elev-1')) >= 4.5;
})());

// ── F. Total Value ──────────────────────────────────────────────────────────
console.log('\nF — Total Value (D2):');
const summaryRule = (function () { const i = css.search(/^\.summary-total\s*\{/m); const j = css.indexOf('}', i); return css.slice(i, j); })();
ok('F1 .summary-total consume el token canónico de texto de máximo nivel', /color:\s*var\(--text-bright\)/.test(summaryRule));
ok('F2 .summary-total sin text-shadow', !/text-shadow/.test(summaryRule));
ok('F3 el override del hero ya no apila halo azul + blanco', !/\.summary-hero-zone\s+\.summary-total\s*\{\s*text-shadow/.test(css));
ok('F4 peso, tamaño, tabular numerals y animación intactos',
   /font-size:\s*clamp\(28px, 4vw, 42px\)/.test(summaryRule) && /font-variant-numeric:\s*tabular-nums/.test(summaryRule) &&
   /animation:\s*summaryFadeUp/.test(summaryRule) && /font-weight:\s*var\(--font-weight-medium\)/.test(summaryRule));
ok('F5 la cifra gana nitidez sin perder contraste sobre el hero', (function () {
  const t = parseColor(resolve('--text-bright'));
  return ratio(over(t.rgb, t.a, plane('--elev-1')), plane('--elev-1')) >= 7;
})());

// ── G/H/I. lo que NO se ha movido ───────────────────────────────────────────
// Las aserciones de ALCANCE describen el cambio de ESTE bloque, así que deben mirar el diff de
// este bloque — no el del árbol de trabajo. Leerlo del árbol hacía que cualquier bloque
// posterior (BLOCK 3 añadió @media y colores legítimos) las rompiera aunque BLOCK 1 siguiera
// perfecto. Se ancla al commit propio buscándolo por su marcador; antes de existir el commit
// (primera ejecución, cambio aún sin commitear) cae al árbol de trabajo, que es lo correcto.
console.log('\nG/H/I — alcance: geometría, motores y materiales ad-hoc:');
// Toda llamada a git envuelta: en un checkout SHALLOW (CI, fetch-depth 1) el padre del commit
// no existe y `git diff <sha>^ <sha>` lanza. Sin historia se cae al árbol de trabajo.
const PATHS = '-- styles.css index.html version.json';
const sh = cmd => { try { return execSync(cmd, { cwd: root, stdio: ['pipe', 'pipe', 'ignore'] }).toString(); } catch (_) { return null; } };
const shasOf = marker => (sh('git log --format=%H --fixed-strings --grep=' + JSON.stringify(marker)) || '').trim().split('\n').filter(Boolean);
function blockDiff(marker) {
  const shas = shasOf(marker);
  const parts = shas.length ? shas.map(s => sh('git diff -U0 ' + s + '^ ' + s + ' ' + PATHS)) : [null];
  if (shas.length && parts.every(p => p !== null)) return parts.join('\n');
  return sh('git diff -U0 ' + PATHS) || '';
}
function blockFiles(marker) {
  const shas = shasOf(marker);
  const parts = shas.length ? shas.map(s => sh('git diff --name-only ' + s + '^ ' + s)) : [null];
  if (shas.length && parts.every(p => p !== null)) return [...new Set(parts.join('\n').trim().split('\n'))].filter(Boolean);
  return (sh('git diff --name-only') || '').trim().split('\n').filter(Boolean);
}
const diff = blockDiff('(BLOCK 1)');
const added = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));
const removed = diff.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---'));
// Se comparan DECLARACIONES CSS reales, no texto del diff: un filtro por substring daba
// falsos positivos (`var(--text-bright)` contiene "right", y las líneas de continuación de
// un comentario de bloque no empiezan por `*`). Aquí se extrae `propiedad: valor` y se
// compara el NOMBRE de la propiedad contra la lista, que es lo que la aserción afirma.
const declOf = l => {
  const m = /^[+-]\s*(--)?([a-z-]+)\s*:\s*([^;]*);?\s*$/.exec(l.replace(/\/\*[\s\S]*?\*\//g, ''));
  return m ? { custom: !!m[1], prop: m[2], value: m[3].trim() } : null;
};
const GEOM = new Set(['padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'width', 'height',
  'min-height', 'max-height', 'min-width', 'max-width', 'top', 'left', 'right', 'bottom', 'gap',
  'grid-template-columns', 'grid-template-rows', 'flex', 'flex-direction', 'display', 'position',
  'font-size', 'line-height', 'letter-spacing', 'z-index', 'transform', 'overflow', 'border-radius']);
const geomTouched = added.concat(removed).map(declOf).filter(Boolean)
  .filter(d => !d.custom && GEOM.has(d.prop));
ok('G1 ninguna propiedad de geometría/responsive en el diff', geomTouched.length === 0,
   geomTouched.map(d => d.prop + ': ' + d.value).join(' | ').slice(0, 300));
ok('G2 ninguna @media añadida o eliminada', !added.concat(removed).some(l => /@media/.test(l.replace(/\/\*[\s\S]*?\*\//g, ''))));
const filesTouched = blockFiles('(BLOCK 1)');
// Superficie de producto permitida: la hoja de estilos, el cache-bust y la versión servida.
// docs/*.js son artefactos de validación (este gate y el harness de tokens preexistente, que
// necesitó aprender la nueva indirección de alias); no son código de producto.
ok('H1 el diff sólo toca styles.css, el cache-bust y los harness de validación',
   filesTouched.every(f => ['styles.css', 'index.html', 'version.json'].includes(f) || /^docs\/.*-harness\.js$/.test(f)),
   filesTouched.join(', '));
ok('H2 app.js / Chart Engine intacto', !filesTouched.includes('app.js'));
ok('H3 snapshots, watchdog y backend intactos', !filesTouched.some(f => f.startsWith('db/') || f.startsWith('supabase/') || f.startsWith('api/')));
const strayColors = (function () {
  // Sólo declaraciones reales (los hex citados en comentarios no son materiales nuevos).
  // Los únicos literales de color que este bloque puede introducir son la escalera y el hover.
  const allowed = /^(rgba\(165,196,255,0\.\d+\)|#191E27|#252C39|#6595F2|#040507)$/i;
  return added.map(declOf).filter(Boolean)
    .filter(d => /(#[0-9a-f]{3,8}\b|rgba?\()/i.test(d.value))
    .filter(d => !allowed.test(d.value));
})();
ok('I1 ningún color nuevo fuera del bloque de escalera de :root', strayColors.length === 0,
   strayColors.map(d => d.prop + ': ' + d.value).join(' | ').slice(0, 300));
ok('I2 la escalera vive en :root, no en reglas de componente',
   /--elev-0:/.test(rootClean) && !/\.[\w-]+\s*\{[^}]*--elev-[0-3]\s*:/.test(css));

// ── contraste crítico preservado sobre el nuevo plano ───────────────────────
console.log('\nContraste crítico sobre el nuevo plano de contenido (AA = 4.5):');
[['--text', 7], ['--text-muted', 4.5], ['--aurix-success', 4.5], ['--aurix-danger', 4.5], ['--accent', 4.5]].forEach(([t, min]) => {
  const c = parseColor(resolve(t));
  const r = ratio(c.a === 1 ? c.rgb : over(c.rgb, c.a, plane('--elev-1')), plane('--elev-1'));
  ok('· ' + t + ' = ' + r.toFixed(2) + ':1 (mínimo ' + min + ')', r >= min, r.toFixed(2));
});

// ── cache-bust coherente (el deploy es el push) ─────────────────────────────
console.log('\nCache-bust / deploy:');
const cssV = /styles\.css\?v=(\d+)/.exec(html);
const buildIdx = /var BUILD = '([^']+)'/.exec(html);
// El invariante es "el CSS cambió ⇒ el bust subió respecto al 645 que había antes de este
// bloque", no un número fijo: los bloques posteriores lo siguen subiendo (BLOCK 2 → 647).
ok('CB1 styles.css?v= subido por encima de 645 (el CSS cambió)', cssV && +cssV[1] >= 646, cssV && cssV[1]);
ok('CB2 AURIX_BUILD subido y coherente con version.json', buildIdx && buildIdx[1] === version.build, (buildIdx && buildIdx[1]) + ' vs ' + version.build);
ok('CB3 appjs NO subido (app.js no se tocó)', version.appjs === 614, String(version.appjs));

console.log('\n' + (fail === 0 ? 'RESULT: ALL PASS ✓' : 'RESULT: FAIL ✗') + '  (' + pass + ' passed, ' + fail + ' failed)');
process.exit(fail === 0 ? 0 : 1);
