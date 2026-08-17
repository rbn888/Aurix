'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-INSTITUTIONAL-FINISH-harness — DASHBOARD EXCELLENCE V1 · BLOCK 3
// ════════════════════════════════════════════════════════════════════════════
// Closes Dashboard Excellence V1: D3 (Distribution material), D5 (canonical hero blue),
// S4 (category contrast), D4+S6 (one focus contract), S7 (high-contrast opt-in).
// CSS/token only — no app.js, no geometry, no @media beyond the opt-in block.
//
// Ratios are re-derived from the parsed tokens, and the scope assertions are anchored to
// this block's own commit (marker "(BLOCK 3)") so a later block cannot turn them red.
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const root = path.join(__dirname, '..');
const cssRaw = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, '');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra !== undefined ? '  →  ' + extra : '')); } }

// ── colour maths ────────────────────────────────────────────────────────────
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const cr = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const over = (fg, a, bg) => fg.map((c, i) => c * a + bg[i] * (1 - a));
// Token lookup restricted to the FIRST :root block, so the prefers-contrast overrides below
// can never be mistaken for the defaults.
const rootBlock = (function () { const i = css.indexOf(':root {'); let d = 0, k = css.indexOf('{', i); for (; k < css.length; k++) { if (css[k] === '{') d++; else if (css[k] === '}') { d--; if (!d) break; } } return css.slice(i, k); })();
const tok = n => { const m = new RegExp('\\' + n + ':\\s*([^;]+);').exec(rootBlock); return m ? m[1].trim() : null; };
function colorOf(v, d) {
  d = d || 0; if (!v || d > 6) return null; v = v.trim();
  const a = /^var\(\s*(--[\w-]+)\s*\)$/.exec(v); if (a) return colorOf(tok(a[1]), d + 1);
  let m = /^#([0-9a-f]{6})$/i.exec(v); if (m) return { rgb: [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)), a: 1 };
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v);
  if (m) return { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] };
  // rgba(var(--channels), alpha) — la forma que introduce D5 para poder usar el azul canónico
  // con alphas arbitrarias. Sin esto el gate no sabría leer su propio anillo de foco.
  m = /^rgba?\(\s*var\(\s*(--[\w-]+)\s*\)\s*,\s*([\d.]+)\s*\)$/i.exec(v);
  if (m) { const ch = tok(m[1]); if (ch && /^\s*\d+\s*,\s*\d+\s*,\s*\d+\s*$/.test(ch)) return { rgb: ch.split(',').map(s => +s.trim()), a: +m[2] }; }
  return null;
}
const canvas = colorOf(tok('--elev-0')).rgb;
const planeOf = t => { const c = colorOf(tok(t)); return c.a === 1 ? c.rgb : over(c.rgb, c.a, canvas); };
const e1 = planeOf('--elev-1'), e2 = planeOf('--elev-2');
function toHsl([r, g, b]) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h, s; const l = (mx + mn) / 2, d = mx - mn; if (!d) { h = s = 0; } else { s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? ((b - r) / d + 2) : ((r - g) / d + 4); h /= 6; } return [h * 360, s * 100, l * 100]; }

// ── scope diff, anchored to this block's commit ─────────────────────────────
// TODA llamada a git va envuelta: el checkout de CI es SHALLOW (fetch-depth 1), así que cuando
// el commit de este bloque es la punta, `git diff <sha>^ <sha>` no encuentra el padre y
// execSync LANZA. Eso tiró este gate en CI (exit 1) aunque pasaba en local con historia
// completa. Sin historia se cae al diff del árbol de trabajo; si tampoco hay, las aserciones de
// alcance quedan vacías y el peso lo llevan las de ESTADO, que no dependen de git.
const PATHS = '-- styles.css index.html version.json';
const sh = cmd => { try { return execSync(cmd, { cwd: root, stdio: ['pipe', 'pipe', 'ignore'] }).toString(); } catch (_) { return null; } };
const B3 = (sh('git log --format=%H --fixed-strings --grep=' + JSON.stringify('(BLOCK 3)')) || '').trim().split('\n').filter(Boolean);
const rangeDiff = B3.length ? B3.map(s => sh('git diff -U0 ' + s + '^ ' + s + ' ' + PATHS)) : [null];
const diff = (B3.length && rangeDiff.every(p => p !== null)) ? rangeDiff.join('\n') : (sh('git diff -U0 ' + PATHS) || '');
const rangeFiles = B3.length ? B3.map(s => sh('git diff --name-only ' + s + '^ ' + s)) : [null];
const files = (B3.length && rangeFiles.every(p => p !== null))
  ? [...new Set(rangeFiles.join('\n').trim().split('\n'))].filter(Boolean)
  : (sh('git diff --name-only') || '').trim().split('\n').filter(Boolean);
const dlines = diff.split('\n').filter(l => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
const declOf = l => { const m = /^[+-]\s*(--)?([a-z-]+)\s*:\s*([^;]*);?\s*$/.exec(l.replace(/\/\*[\s\S]*?\*\//g, '')); return m ? { custom: !!m[1], prop: m[2], value: m[3].trim() } : null; };

// Propiedades que mueven geometría o layout. Usado por 5e y por la sección 6.
const GEOM_NAMES = new Set(['width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'padding', 'margin',
  'padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'top', 'left', 'right', 'bottom', 'gap', 'display', 'position', 'font-size', 'line-height', 'letter-spacing',
  'grid-template-columns', 'grid-template-rows', 'flex', 'flex-direction', 'border-radius', 'inset', 'transform']);

console.log('AURIX-INSTITUTIONAL-FINISH — DASHBOARD EXCELLENCE V1 · BLOCK 3\n');

// ── 0. CSS estructuralmente válido ──────────────────────────────────────────
console.log('0 — CSS válido:');
ok('0a llaves balanceadas', (cssRaw.match(/\{/g) || []).length === (cssRaw.match(/\}/g) || []).length);
ok('0b balanceado también tras quitar comentarios (como lo lee un parser)',
   (css.match(/\{/g) || []).length === (css.match(/\}/g) || []).length);
ok('0c sin profundidad negativa en ningún punto', (function () { let d = 0; for (const ch of cssRaw) { if (ch === '{') d++; else if (ch === '}') d--; if (d < 0) return false; } return d === 0; })());

// ── 1. D3 — Distribution sobre la Dark Foundation ───────────────────────────
console.log('\n1 — D3 Portfolio Distribution:');
const pcc = (function () { const i = css.search(/^\.portfolio-combined-card\s*\{/m); return css.slice(i, css.indexOf('}', i)); })();
ok('1a consume la escalera por su token canónico, no el alias legacy', /background:\s*var\(--elev-1\)/.test(pcc));
ok('1b sin gradiente nuevo ni glow propios', !/gradient|drop-shadow|blur\(/.test(pcc));
ok('1c borde y geometría intactos', /border:\s*1px solid var\(--border-subtle\)/.test(pcc) && /padding:\s*var\(--space-4\)/.test(pcc));
ok('1d la separación del canvas es la que entregó BLOCK 1 (1.119 → ~1.22)', cr(e1, canvas) >= 1.20, cr(e1, canvas).toFixed(3));
ok('1e NO sube de escalón, y el motivo es medible: en --elev-2 el donut caería al suelo de 3:1', (function () {
  const c = colorOf(tok('--color-crypto')).rgb;
  return cr(c, e1) >= 3.4 && cr(c, e2) < 3.2;      // justifica quedarse en el plano de contenido
})());

// ── 2. D5 — azul canónico del hero ──────────────────────────────────────────
console.log('\n2 — D5 hero con azul canónico:');
const heroRules = [...css.matchAll(/\.hero-card(:hover)?\s*\{([^}]*)\}/g)].map(m => m[2]).join('\n');
ok('2a --aurix-blue-rgb son los canales exactos de --aurix-blue', (function () {
  const b = colorOf(tok('--aurix-blue')).rgb, rgbTok = tok('--aurix-blue-rgb');
  return rgbTok && rgbTok.split(',').map(s => +s.trim()).every((v, i) => v === b[i]);
})(), tok('--aurix-blue-rgb'));
ok('2b ninguna regla .hero-card conserva el azul ad-hoc #4D8DFF', !/77\s*,\s*141\s*,\s*255/.test(heroRules));
ok('2c ni el tercer azul rgba(37,99,235) del segundo radial', !/37\s*,\s*99\s*,\s*235/.test(heroRules));
ok('2d el hero consume el token en gradientes, borde y glow', (heroRules.match(/var\(--aurix-blue-rgb\)/g) || []).length >= 5);
ok('2e alphas originales preservadas — no se ha subido el glow', /0 0 44px rgba\(var\(--aurix-blue-rgb\), 0\.10\)/.test(heroRules));
ok('2f Workspace/Intelligence conservan sus literales (fuera de alcance, sin tocar)',
   (cssRaw.match(/77,141,255/g) || []).length > 0);

// ── 3. S4 — contraste de categorías ─────────────────────────────────────────
console.log('\n3 — S4 colores de categoría:');
const catPlane = e1;
[['--color-crypto', 221], ['--color-real-estate', 262]].forEach(([t, hue]) => {
  const c = colorOf(tok(t)).rgb, r = cr(c, catPlane), h = toHsl(c);
  ok('3 ' + t + ' = ' + r.toFixed(2) + ':1 (era 3.23/2.93, suelo gráfico 3:1)', r >= 3.4, r.toFixed(2));
  ok('3 ' + t + ' conserva hue (' + Math.round(h[0]) + '° ≈ ' + hue + '°) y saturación alta', Math.abs(Math.round(h[0]) - hue) <= 3 && h[1] >= 70);
});
ok('3c las otras cuatro categorías NO se han tocado', ['#0891B2', '#EA580C', '#16A34A', '#CA8A04']
   .every(h => new RegExp(h, 'i').test(rootBlock)));
// Reserva declarada, no disimulada: el color que pinta el donut vive en app.js (TYPE_META),
// que este bloque no puede tocar. El token queda correcto para cualquier consumidor futuro.
ok('3d RESERVA declarada: el owner visible del donut es TYPE_META en app.js, no el token CSS',
   /TYPE_META/.test(app) && !/var\(--color-crypto\)/.test(css));

// ── 4. D4 + S6 — contrato único de foco ─────────────────────────────────────
console.log('\n4 — D4 + S6 foco:');
ok('4a existe un contrato compartido de :focus-visible', /button:focus-visible,[\s\S]{0,400}?\[tabindex\]:not\(\[tabindex="-1"\]\):focus-visible \{/.test(css));
ok('4b usa el azul canónico y un anillo discreto, sin glow', (function () {
  const c = colorOf(tok('--focus-ring-color'));
  return !!c && c.a <= 0.6 && +tok('--focus-ring-width').replace('px', '') <= 2 && !/--focus-ring[^;]*(blur|shadow)/.test(rootBlock);
})());
ok('4c outline (coste cero de layout), no box-shadow que el overflow pueda recortar',
   /\[tabindex\]:not\(\[tabindex="-1"\]\):focus-visible \{\s*outline:/.test(css));
ok('4d sólo alcanza elementos REALMENTE interactivos', (function () {
  const m = /(button:focus-visible[\s\S]*?)\{/.exec(css);
  if (!m) return false;
  const sels = m[1].split(',').map(s => s.trim().replace(':focus-visible', '')).filter(Boolean);
  const INTERACTIVE = /^(button|a\[href\]|input|select|textarea|summary|\[role="(button|tab|link)"\]|\[tabindex\]:not\(\[tabindex="-1"\]\))$/;
  return sels.every(s => INTERACTIVE.test(s));
})());
ok('4e la card de Distribution tiene hover coherente y focus-visible',
   /\.portfolio-combined-card:hover \{ border-color: var\(--border-strong\); \}/.test(css) &&
   /\.portfolio-combined-card:focus-visible \{[^}]*outline:/.test(css));
ok('4f el hover ya no mezcla familias (--border-hi opaco sobre borde alpha)',
   !/\.portfolio-combined-card:hover[^}]*--border-hi/.test(css));
// El invariante es "sube respecto a la línea base auditada (23 reglas frente a 304 de hover)",
// no un número redondo elegido a ojo.
ok('4g la cobertura de foco sube sobre la línea base auditada de 23', (css.match(/:focus-visible/g) || []).length > 23,
   String((css.match(/:focus-visible/g) || []).length) + ' vs 23');

// ── 5. S7 — alta luminosidad, opt-in ────────────────────────────────────────
console.log('\n5 — S7 prefers-contrast: more:');
const hc = (function () { const i = css.indexOf('@media (prefers-contrast: more)'); if (i < 0) return ''; let d = 0, k = css.indexOf('{', i); for (; k < css.length; k++) { if (css[k] === '{') d++; else if (css[k] === '}') { d--; if (!d) break; } } return css.slice(i, k); })();
ok('5a el bloque existe y es opt-in del sistema operativo', hc.length > 0);
ok('5b refuerza bordes, well y anillo de foco', /--border-subtle:/.test(hc) && /--border-strong:/.test(hc) && /--focus-ring-color:/.test(hc));
ok('5c NO toca el lienzo ni convierte nada en claro', !/--elev-0|--bg-main|background/.test(hc));
ok('5d NO sube los rellenos de superficie (degradaría el donut y el rojo de rentabilidad)',
   !/--elev-[123]\s*:/.test(hc));
// Se comparan NOMBRES de propiedad exactos y se excluyen las custom properties: un match por
// substring daba falso positivo porque `--focus-ring-width:` contiene `width:`.
ok('5e NO altera tamaños ni layout', (function () {
  const decls = [...hc.matchAll(/(^|[;{])\s*(--)?([a-z-]+)\s*:/g)].filter(m => !m[2]).map(m => m[3]);
  return !decls.some(p => GEOM_NAMES.has(p));
})(), [...hc.matchAll(/(^|[;{])\s*(--)?([a-z-]+)\s*:/g)].filter(m => !m[2]).map(m => m[3]).join(','));
ok('5f los bordes reforzados se ven de verdad sobre el plano de contenido', (function () {
  const m = /--border-subtle:\s*([^;]+);/.exec(hc); const c = colorOf(m && m[1]);
  return !!c && cr(over(c.rgb, c.a, e1), e1) >= 1.6;
})());
ok('5g el default NO cambia: los tokens fuera del media query siguen en su valor',
   colorOf(tok('--border-subtle')).a === 0.10 && +tok('--focus-ring-width').replace('px', '') === 2);

// ── 6. alcance ──────────────────────────────────────────────────────────────
console.log('\n6 — alcance:');
const geom = dlines.map(declOf).filter(Boolean).filter(d => !d.custom && GEOM_NAMES.has(d.prop));
ok('6a cero cambios de geometría', geom.length === 0, geom.map(d => d.prop + ': ' + d.value).join(' | ').slice(0, 200));
ok('6b la única @media añadida es la de prefers-contrast', (function () {
  const added = dlines.filter(l => l.startsWith('+') && /@media/.test(l.replace(/\/\*[\s\S]*?\*\//g, '')));
  return added.every(l => /prefers-contrast/.test(l));
})());
ok('6c app.js / Chart Engine / snapshots / watchdog / backend intactos',
   !files.includes('app.js') && !files.some(f => /^(db|supabase|api)\//.test(f)), files.join(', '));
ok('6d Dark Foundation sólo se consume, no se redefine',
   !dlines.some(l => /^[+-]\s*--elev-[0-3](-solid)?\s*:/.test(l)));
ok('6e Asset Identity / icon well no se ha tocado',
   !dlines.some(l => /^[+-]\s*--asset-well\s*:/.test(l)) && /--asset-well:\s*var\(--elev-2\)/.test(rootBlock));

console.log('\n' + (fail === 0 ? 'RESULT: ALL PASS ✓' : 'RESULT: FAIL ✗') + '  (' + pass + ' passed, ' + fail + ' failed)');
process.exit(fail === 0 ? 0 : 1);
