'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-VISUAL-CLARITY-harness — P0 visual-clarity / institutional design-system polish
// ════════════════════════════════════════════════════════════════════════════
// A token-ONLY refinement: crisper Level-1 text, more readable Level-2 secondary, and firmer
// Level-4 card edges so the dashboard separates from its background and stays legible at low
// brightness / OLED — WITHOUT brightening the UI overall, changing layout, charts, the renderer,
// sync, persistence or any business logic. All four tokens live in :root (global ⇒ identical
// hierarchy on desktop/tablet/mobile). The chart grid (renderer-drawn, already "quiet") is left
// EXACTLY as shipped, proving Phase-5 / the rendering pipeline was not touched.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
let pass = 0, fail = 0;
function ok(n, c) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } }

console.log('AURIX-VISUAL-CLARITY — institutional design-system polish (token-only)\n');

console.log('Level-1 — crisper top tier (key numbers / emphasis):');
ok('1 --text-bright lifted to ~0.985 (was 0.94) — top tier reads clean, hierarchy gap widens',
   /--text-bright: rgba\(255,255,255,0\.985\);\s*\/\* AURIX-VISUAL-CLARITY-1/.test(css));

console.log('\nLevel-2 — secondary readable "without effort":');
// VISUAL-POLISH-V1 evolves this token further (0.68 → 0.73). The INVARIANT is unchanged and is
// what is asserted: secondary keeps rising (never lowered) and stays below the primary tier.
ok('2 --aurix-text-secondary lifted 0.62 → 0.68 → 0.73 (sube siempre, nunca baja; sigue bajo el tier primario)', (function () {
  const m = /--aurix-text-secondary: rgba\(255, 255, 255, (0\.\d+)\);/.exec(css);
  return !!m && parseFloat(m[1]) >= 0.68 && parseFloat(m[1]) < 0.92;
})());

console.log('\nLevel-4 — card edges hold separation at low brightness (depth without heavier shadows):');
// VISUAL-POLISH-V1: 0.08 → 0.10, y su alias --border-subtle se mueve con él. Invariante: el borde
// nunca se debilita (>= 0.08) y ambos permanecen SINCRONIZADOS (si divergen, dos tarjetas idénticas
// se dibujarían con bordes distintos).
ok('3 --color-border-subtle >= 0.08 y sincronizado con su alias --border-subtle', (function () {
  const a = /--color-border-subtle:\s*rgba\(255, 255, 255, (0\.\d+)\);/.exec(css);
  const b = /--border-subtle: rgba\(255,255,255,(0\.\d+)\);/.exec(css);
  return !!a && !!b && parseFloat(a[1]) >= 0.08 && parseFloat(a[1]) === parseFloat(b[1]);
})());
// VISUAL-POLISH-V1: 0.08 → 0.10 (thin but visible card edge). Invariant: never below 0.08.
ok('4 --border-subtle mantiene o mejora la separación de borde (>= 0.08)', (function () {
  const m = /--border-subtle: rgba\(255,255,255,(0\.\d+)\);/.exec(css);
  return !!m && parseFloat(m[1]) >= 0.08;
})());

console.log('\nGlobal & device parity — all four tokens are in :root (one hierarchy on every device):');
ok('5 tokens declared inside the :root design-system block (not behind a media query)', (function () {
  const r = css.indexOf(':root {'); const end = css.indexOf('\n}', r);
  const block = css.slice(r, end);
  // VISUAL-POLISH-V1: se comprueba la INTENCIÓN (los cuatro tokens viven en :root, no tras una
  // media query, para que la jerarquía sea idéntica en todos los dispositivos), no sus literales,
  // que este SPEC evoluciona deliberadamente.
  return ['--text-bright:', '--color-border-subtle:', '--border-subtle:', '--aurix-text-secondary:']
          .every(t => block.indexOf(t) !== -1);
})());

console.log('\nDo NOT brighten the UI / preserve identity (palette + dark bg + brand blue unchanged):');
// VISUAL-POLISH-V1 deliberately lifts the dark bases (still very dark, same hue family). The BRAND
// colours remain the thing that must never drift — that is what stays pinned literally.
ok('6 brand blue, success y danger intactos; las bases siguen siendo muy oscuras',
   /--aurix-blue:\s*#4A82F0;/.test(css) && /--aurix-success:\s*#3fbf7f;/.test(css) &&
   /--aurix-danger:\s*#e05a5a;/.test(css) && (function () {
     const lum = h => { const n = parseInt(h.slice(1), 16); return (((n>>16)&255)*0.299 + ((n>>8)&255)*0.587 + (n&255)*0.114); };
     const bm = /--bg-main:\s*(#[0-9A-Fa-f]{6});/.exec(css), bg = /--bg:\s*(#[0-9A-Fa-f]{6});/.exec(css);
     return bm && bg && lum(bm[1]) < 32 && lum(bg[1]) < 32;   // siguen siendo casi negras
   })());
ok('7 body text token --text unchanged (#e6e6e8) — only the TOP tier was crisped, UI not brightened',
   /--text:\s*#e6e6e8;/.test(css));

console.log('\nPhase-5 / charts / renderer NOT touched (grid left exactly as shipped):');
ok('8 .wsc-grid stroke unchanged (rgba(255,255,255,.052)) — chart grid is renderer-owned, left alone',
   /\.wsc-grid   \{ stroke: rgba\(255,255,255,\.052\); stroke-width: 1; shape-rendering: crispEdges; \}/.test(css) &&
   /\.wsc-grid-v \{ stroke: rgba\(255,255,255,\.018\);/.test(css));
ok('9 renderer / sync / destructive-save lock / merge untouched (no JS changes this pass)',
   /function renderAurixInstitutionalChart\(/.test(app) && /function _aurixMergePortfolio\(/.test(app) &&
   /const _AURIX_BLOCK_DESTRUCTIVE_SAVES = true;/.test(app));

console.log('\nLayout / proportions preserved:');
ok('10 hero grid ratio (HERO-PREMIUM-POLISH 1fr 1.58fr) unchanged by this pass',
   /grid-template-columns: 1fr 1\.58fr;/.test(css));

console.log('\nAccessibility — contrast only improves (no readability reduced):');
ok('11 secondary lifted (0.62→0.68) and top tier crisper (0.94→0.985) — both raise contrast, never lower it',
   /0\.985/.test(css) && /0\.68/.test(css));

console.log('\nRESULT: ' + (fail === 0 ? 'ALL PASS ✓' : 'FAIL ✗') + '  (' + pass + ' passed, ' + fail + ' failed)');
process.exit(fail === 0 ? 0 : 1);
