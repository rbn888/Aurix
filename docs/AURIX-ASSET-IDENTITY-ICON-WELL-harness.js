'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ASSET-IDENTITY-ICON-WELL-harness — DASHBOARD EXCELLENCE V1 · BLOCK 2 (S1 + D1)
// ════════════════════════════════════════════════════════════════════════════
// One shared icon-well primitive for asset logos across BOTH families, replacing the pattern
// where a real logo cost the icon every support surface.
//
// This gate resolves the CSS CASCADE instead of checking that a declaration exists. That is
// the whole point: the deepest cause of D1 was a LATER rule at equal specificity
// (`.cat-card-visual img { background: transparent !important }`, plus a global
// `img { background: transparent !important }`) which meant a well declared upstream would
// look applied in the file and paint nothing on screen. A presence-only assertion would have
// passed on a broken fix. For every logo surface we therefore compute the WINNING background
// by (important, specificity, document order) and require it to be the well.
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const root = path.join(__dirname, '..');
const cssRaw = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, '');   // comments never participate in the cascade

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra !== undefined ? '  →  ' + extra : '')); } }

// ── minimal rule model ──────────────────────────────────────────────────────
const rules = [];
css.replace(/([^{}]+)\{([^{}]*)\}/g, (m, sel, body, idx) => {
  const selectors = sel.split(',').map(s => s.trim()).filter(Boolean);
  if (!selectors.length || selectors[0].startsWith('@')) return '';
  const decls = {};
  body.replace(/([-\w]+)\s*:\s*([^;]+);?/g, (_, p, v) => { decls[p.trim()] = v.trim(); return ''; });
  rules.push({ selectors, decls, order: idx });
  return '';
});
// Specificity: (ids, classes/attrs/pseudo-classes, elements). Enough for these selectors.
function specificity(sel) {
  const ids = (sel.match(/#[\w-]+/g) || []).length;
  const classes = (sel.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)(?:not|hover|focus|is|where)?[\w-]+(\([^)]*\))?/g) || [])
    .filter(t => !/^::/.test(t)).length;
  const elements = (sel.replace(/\.[\w-]+|#[\w-]+|\[[^\]]+\]|:[\w-]+(\([^)]*\))?/g, ' ').match(/\b[a-z][\w-]*\b/gi) || []).length;
  return ids * 10000 + classes * 100 + elements;
}
// Does `sel` apply to the element described by `target`? We only need the exact selector or a
// strictly less specific one that still matches (e.g. `img` for an <img> based well).
function appliesTo(sel, target) {
  if (sel === target.selector) return true;
  return (target.alsoMatched || []).includes(sel);
}
// Winning declaration for `prop` on a target, per the real cascade.
function winner(target, prop) {
  let best = null;
  for (const r of rules) {
    for (const sel of r.selectors) {
      if (!appliesTo(sel, target)) continue;
      const raw = r.decls[prop];
      if (raw === undefined) continue;
      const important = /!important/.test(raw);
      const cand = { value: raw.replace(/\s*!important\s*/, '').trim(), important, spec: specificity(sel), order: r.order, sel };
      if (!best) { best = cand; continue; }
      if (cand.important !== best.important) { if (cand.important) best = cand; continue; }
      if (cand.spec !== best.spec) { if (cand.spec > best.spec) best = cand; continue; }
      if (cand.order >= best.order) best = cand;
    }
  }
  return best;
}

// The six logo surfaces the primitive must own. `alsoMatched` lists lower-specificity
// selectors that also match the same element and therefore compete in the cascade.
const SURFACES = [
  { name: 'Dashboard category card (D1)', selector: '.cat-card-visual img', alsoMatched: ['img'] },
  { name: 'Dashboard holdings / Asset Detail', selector: '.asset-badge-logo', alsoMatched: ['img'] },
  { name: 'Market row / Seguimiento', selector: '.asset-icon.has-logo', alsoMatched: [] },
  { name: 'Search suggestions', selector: '.sugg-badge.has-logo', alsoMatched: [] },
  { name: 'Add Asset', selector: '.add-v2-asset-icon.has-logo', alsoMatched: [] },
  { name: 'Text fallback', selector: '.logo-fallback', alsoMatched: [] },
];

// ── colour maths ────────────────────────────────────────────────────────────
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const cr = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const over = (fg, a, bg) => fg.map((c, i) => c * a + bg[i] * (1 - a));
const tokenOf = n => { const m = new RegExp('\\' + n + ':\\s*([^;]+);').exec(css); return m ? m[1].trim() : null; };
function colorOf(v, depth) {
  depth = depth || 0; if (!v || depth > 6) return null;
  v = v.trim();
  const a = /^var\(\s*(--[\w-]+)\s*\)$/.exec(v);
  if (a) return colorOf(tokenOf(a[1]), depth + 1);
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) return { rgb: [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)), a: 1 };
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v);
  if (m) return { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] };
  return null;
}
const canvas = colorOf(tokenOf('--elev-0')).rgb;
const compose = (tok, backdrop) => { const c = colorOf(tokenOf(tok)); return c.a === 1 ? c.rgb : over(c.rgb, c.a, backdrop); };
const cardPlane = compose('--elev-1', canvas);
const wellOnCard = (function () { const c = colorOf(tokenOf('--asset-well')); return c.a === 1 ? c.rgb : over(c.rgb, c.a, cardPlane); })();
const catCard = over(hex('#1e2c4a'), 0.50, canvas);                      // .cat-card blue-glass, approximated
const wellOnCat = (function () { const c = colorOf(tokenOf('--asset-well')); return c.a === 1 ? c.rgb : over(c.rgb, c.a, catCard); })();
const OLD_PLATE = hex('#0d1322');                                        // the gradient floor this block removed

// Las aserciones de ALCANCE describen el cambio de ESTE bloque, así que miran el diff de ESTE
// bloque, no el del árbol de trabajo: leerlo del árbol hacía que cualquier bloque posterior
// (BLOCK 3 añadió @media y selectores legítimos fuera de identidad de activo) las rompiera
// aunque BLOCK 2 siguiera intacto. Ambos commits del bloque llevan el marcador "(BLOCK 2)";
// mientras el bloque aún no esté commiteado se cae al árbol de trabajo, que es lo correcto.
// Toda llamada a git envuelta: en un checkout SHALLOW (CI, fetch-depth 1) el padre del commit
// no existe y `git diff <sha>^ <sha>` lanza. Sin historia se cae al árbol de trabajo.
const PATHS = '-- styles.css index.html version.json';
const sh = cmd => { try { return execSync(cmd, { cwd: root, stdio: ['pipe', 'pipe', 'ignore'] }).toString(); } catch (_) { return null; } };
const B2 = (sh('git log --format=%H --fixed-strings --grep=' + JSON.stringify('(BLOCK 2)')) || '').trim().split('\n').filter(Boolean);
const b2Diff = B2.length ? B2.map(s => sh('git diff -U0 ' + s + '^ ' + s + ' ' + PATHS)) : [null];
const diff = (B2.length && b2Diff.every(p => p !== null)) ? b2Diff.join('\n') : (sh('git diff -U0 ' + PATHS) || '');

console.log('AURIX-ASSET-IDENTITY-ICON-WELL — DASHBOARD EXCELLENCE V1 · BLOCK 2\n');

// ── 0. integridad sintáctica de la hoja ─────────────────────────────────────
// Añadido tras un fallo real de esta sesión: al sustituir una declaración por un comentario se
// perdió una `}`, lo que dejó `@media (min-width: 1024px)` sin cerrar y habría tirado un bloque
// entero de CSS de escritorio en producción. Ningún assert de contenido lo detecta — una hoja
// desbalanceada sigue conteniendo todos los tokens correctos. El gate de CI del repo lo paró;
// este gate debe pararlo antes.
console.log('0 — integridad estructural de styles.css:');
const braces = { open: (cssRaw.match(/\{/g) || []).length, close: (cssRaw.match(/\}/g) || []).length };
ok('0a llaves balanceadas', braces.open === braces.close, '{ ' + braces.open + ' vs } ' + braces.close);
// NO se asserta paridad literal de `/*` vs `*/`: styles.css ya traía de antes un cierre
// duplicado benigno (L~25053, profundidad final 0, los 216 harnesses pasan) y afirmarlo sería
// asertar sobre una premisa falsa. El invariante que importa es el que rompí: que la hoja siga
// balanceada DESPUÉS de quitar comentarios, que es como la lee cualquier parser.
ok('0b la hoja sigue balanceada tras eliminar comentarios (como la lee un parser)', (function () {
  const stripped = cssRaw.replace(/\/\*[\s\S]*?\*\//g, '');
  return (stripped.match(/\{/g) || []).length === (stripped.match(/\}/g) || []).length;
})());
ok('0c ninguna regla queda sin cerrar tras el último bloque', (function () {
  let d = 0; for (const ch of cssRaw) { if (ch === '{') d++; else if (ch === '}') d--; if (d < 0) return false; } return d === 0;
})());

console.log('  --asset-well      ' + tokenOf('--asset-well') + '  → ' + tokenOf('--elev-3'));
console.log('  --asset-well-ring ' + tokenOf('--asset-well-ring') + '\n');

// ── 1/2/3. una única primitiva, resuelta por CASCADA ────────────────────────
console.log('1-3 — la primitiva gana la cascada en las SEIS superficies de identidad de activo:');
SURFACES.forEach(s => {
  const w = winner(s, 'background');
  const okWell = !!w && /var\(--asset-well\)/.test(w.value);
  ok(s.name + ' [' + s.selector + '] → ' + (w ? w.value : 'SIN background') + (w ? '  (gana: ' + w.sel + ')' : ''), okWell);
});
console.log('  · y ninguna anula ya el soporte:');
SURFACES.forEach(s => {
  const w = winner(s, 'background');
  ok(s.selector + ' no resuelve a transparent/none', !!w && !/^(transparent|none)$/.test(w.value), w && w.value);
});
ok('1b el ring gana también la cascada en las seis', SURFACES.every(s => {
  const b = winner(s, 'border') || winner(s, 'border-color');
  return b && /var\(--asset-well-ring\)/.test(b.value);
}));
ok('3b los plates por tipo convergen en la primitiva (sin gradiente propio)',
   !/\.aicon--(crypto|stock|etf|fund)\.has-logo\s*,?[\s\S]{0,120}?radial-gradient/.test(css));
ok('3c una sola familia de material: el well se declara por token, no por componente',
   (css.match(/background:\s*var\(--asset-well\)/g) || []).length >= 6 &&
   !/--asset-well\s*:/.test(css.replace(/:root[\s\S]*?\n\}/, '')));

// ── 4. logos oscuros ────────────────────────────────────────────────────────
console.log('\n4 — soporte real para logos oscuros (el well como disco delimitado):');
console.log('    well sobre plano de card ' + cr(wellOnCard, cardPlane).toFixed(3) + ' · sobre category card ' + cr(wellOnCat, catCard).toFixed(3));
ok('4a el well se distingue de la card que lo aloja (antes el plate era MÁS OSCURO que ella)',
   cr(wellOnCard, cardPlane) >= 1.30 && cr(OLD_PLATE, cardPlane) < 1.15, cr(wellOnCard, cardPlane).toFixed(3));
ok('4b el well se distingue sobre una category card', cr(wellOnCat, catCard) >= 1.50, cr(wellOnCat, catCard).toFixed(3));
ok('4c el hairline delimita un logo OPACO', (function () {
  const r = colorOf(tokenOf('--asset-well-ring'));
  return cr(over(r.rgb, r.a, wellOnCard), wellOnCard) >= 1.30;
})());
ok('4d un glifo negro mejora ~78% frente al plate anterior (1.13 → 2.01) — mejor, no resuelto',
   cr([0, 0, 0], wellOnCard) > cr([0, 0, 0], OLD_PLATE) * 1.4, cr([0, 0, 0], wellOnCard).toFixed(2));

// ── 5. logos claros ────────────────────────────────────────────────────────
console.log('\n5 — logos claros sin anillo ni halo excesivo:');
ok('5a un logo blanco no compite con el well', cr([255, 255, 255], wellOnCard) >= 10, cr([255, 255, 255], wellOnCard).toFixed(2));
ok('5b el ring es un hairline, no un borde (alpha ≤ 0.13)', colorOf(tokenOf('--asset-well-ring')).a <= 0.13);
// Se comparan DECLARACIONES, no texto del diff: una línea de continuación de comentario de
// bloque no empieza por `*`, así que un comentario que MENCIONA "gradient" daba falso positivo.
const addedDecls = diff
  .split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))
  .map(l => /^\+\s*(--)?([a-z-]+)\s*:\s*([^;]*);?\s*$/.exec(l.replace(/\/\*[\s\S]*?\*\//g, '')))
  .filter(Boolean).map(m => ({ custom: !!m[1], prop: m[2], value: m[3].trim() }));
ok('5c la primitiva no añade sombra, glow ni glassmorphism',
   !addedDecls.some(d => (d.prop === 'box-shadow' && !/^none/.test(d.value)) ||
                         (d.prop === 'backdrop-filter' && !/^none/.test(d.value)) ||
                         (d.prop === 'filter' && !/^none/.test(d.value)) ||
                         /(drop-shadow|blur\(|gradient)/.test(d.value)),
   addedDecls.filter(d => /(drop-shadow|blur\(|gradient)/.test(d.value)).map(d => d.prop).join(','));
ok('5d el logo nunca se manipula: filter sigue en none donde ya lo estaba',
   /\.cat-card-visual img\s*\{[^}]*filter:\s*none\s*!important/.test(css) &&
   /\.asset-badge-logo\s*\{[^}]*filter:\s*none\s*!important/.test(css));
ok('5e ningún invert() global', !/filter:\s*[^;]*invert\(/i.test(css));

// ── 6. fallbacks ────────────────────────────────────────────────────────────
console.log('\n6 — los fallbacks siguen funcionando:');
ok('6a el fallback premium sin logo sigue intacto', /\.asset-icon:not\(\.has-logo\)[\s\S]{0,200}?radial-gradient/.test(css));
ok('6b el fallback de texto comparte la primitiva y su inicial es legible', (function () {
  const w = winner({ selector: '.logo-fallback', alsoMatched: [] }, 'color');
  const c = colorOf(w && w.value);
  return !!c && cr(over(c.rgb, c.a, wellOnCard), wellOnCard) >= 4.5;
})());
ok('6c la capa de fallback y el ocultado del texto con logo siguen en su sitio',
   /\.aurix-aicon-fallback\s*\{[\s\S]*?inset:\s*0/.test(css) && /\.badge--has-logo \.asset-badge-text\s*\{\s*display:\s*none/.test(css));
ok('6d el contenedor de la píldora sigue sin superficie (el well va en el logo, no en un botón)',
   /\.badge--has-logo\s*\{[^}]*background:\s*(none|transparent)\s*!important/.test(css));

// ── 7/8. geometría y alcance ────────────────────────────────────────────────
console.log('\n7-8 — geometría intacta y alcance limitado a identidad de activo:');
const lines = diff.split('\n').filter(l => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
const declOf = l => {
  const m = /^[+-]\s*(--)?([a-z-]+)\s*:\s*([^;]*);?\s*$/.exec(l.replace(/\/\*[\s\S]*?\*\//g, ''));
  return m ? { custom: !!m[1], prop: m[2], value: m[3].trim() } : null;
};
const GEOM = new Set(['width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'padding',
  'margin', 'top', 'left', 'right', 'bottom', 'gap', 'display', 'position', 'font-size', 'line-height',
  'grid-template-columns', 'flex', 'flex-direction', 'border-radius', 'inset', 'object-fit', 'transform']);
const geom = lines.map(declOf).filter(Boolean).filter(d => !d.custom && GEOM.has(d.prop));
ok('7a ninguna propiedad de geometría en el diff', geom.length === 0, geom.map(d => d.prop + ': ' + d.value).join(' | ').slice(0, 240));
ok('7b ninguna @media tocada', !lines.some(l => /@media/.test(l.replace(/\/\*[\s\S]*?\*\//g, ''))));
ok('7c el ring no cuesta layout: box-sizing es border-box global', /\*,\s*\*::before,\s*\*::after\s*\{[^}]*box-sizing:\s*border-box/.test(css));
const b2Files = B2.length ? B2.map(s => sh('git diff --name-only ' + s + '^ ' + s)) : [null];
const files = (B2.length && b2Files.every(p => p !== null))
  ? [...new Set(b2Files.join('\n').trim().split('\n'))].filter(Boolean)
  : (sh('git diff --name-only') || '').trim().split('\n').filter(Boolean);
ok('8a el diff sólo toca styles.css, el cache-bust y los harness', files.every(f =>
   ['styles.css', 'index.html', 'version.json'].includes(f) || /^docs\/.*-harness\.js$/.test(f)), files.join(', '));
ok('8b app.js / Chart Engine / snapshots / watchdog / backend intactos',
   !files.includes('app.js') && !files.some(f => /^(db|supabase|api)\//.test(f)));
ok('8c sólo se han tocado selectores de identidad de activo', (function () {
  const touched = new Set();
  diff.split('\n').forEach(l => { const m = /^[+-]\s*(\.[\w.\- >:()]+)\s*[,{]\s*$/.exec(l); if (m) touched.add(m[1].trim()); });
  const ALLOWED = /(asset-icon|sugg-badge|add-v2-asset-icon|asset-badge|asset-badge-logo|cat-card-visual|logo-fallback|badge--has-logo|aicon--|has-logo)/;
  const strays = [...touched].filter(s => !ALLOWED.test(s));
  return strays.length === 0;
})());

// ── 9. Institutional Dark Foundation intacto ────────────────────────────────
console.log('\n9 — Institutional Dark Foundation (BLOCK 1) intacto:');
ok('9a la escalera conserva sus valores', tokenOf('--elev-0') === '#040507' &&
   /rgba\(165,196,255,0\.131\)/.test(tokenOf('--elev-1')) && /rgba\(165,196,255,0\.203\)/.test(tokenOf('--elev-2')) &&
   /rgba\(165,196,255,0\.261\)/.test(tokenOf('--elev-3')));
ok('9b los alias legacy siguen apuntando a la escalera',
   /var\(--elev-0\)/.test(tokenOf('--bg')) && /var\(--elev-1\)/.test(tokenOf('--surface-2')) && /var\(--elev-2\)/.test(tokenOf('--surface-3')));
// Generalizado a propósito: la versión anterior sólo miraba la regla base y el override del
// hero, y por eso BLOCK 1 dejó vivo un tercer halo en `.hero-left .summary-total` dentro de
// `@media (min-width: 1024px)` que además ganaba por especificidad. Ahora se recorre CUALQUIER
// regla cuyo selector contenga .summary-total, .positive o .negative.
const glowRules = rules.filter(r => r.selectors.some(s => /\.(summary-total|positive|negative)\b/.test(s)))
  .filter(r => r.decls['text-shadow'] && !/^none/.test(r.decls['text-shadow']));
ok('9c ninguna regla de Total Value ni de cifras ± conserva text-shadow (en ningún viewport)',
   glowRules.length === 0, glowRules.map(r => r.selectors.join(',') + ' → ' + r.decls['text-shadow']).join(' | ').slice(0, 240));
// El nivel concreto es una decisión de diseño (se bajó de elev-3 a elev-2 porque 1.86 contra
// la card leía como botón); el INVARIANTE es que el well salga de la escalera y no redefina
// ni un token de la fundación.
ok('9d el well REUTILIZA la escalera, no redefine ningún token de la fundación',
   /^var\(--elev-[123]\)$/.test(tokenOf('--asset-well')) && !lines.some(l => /^[+-]\s*--elev-[0-3]\s*:/.test(l)),
   tokenOf('--asset-well'));

console.log('\n' + (fail === 0 ? 'RESULT: ALL PASS ✓' : 'RESULT: FAIL ✗') + '  (' + pass + ' passed, ' + fail + ' failed)');
process.exit(fail === 0 ? 0 : 1);
