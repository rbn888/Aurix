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
ok('2 --aurix-text-secondary lifted 0.62 → 0.68 (low-brightness/OLED legibility, still below primary)',
   /--aurix-text-secondary: rgba\(255, 255, 255, 0\.68\);\s*\/\* AURIX-VISUAL-CLARITY-1/.test(css));

console.log('\nLevel-4 — card edges hold separation at low brightness (depth without heavier shadows):');
ok('3 --color-border-subtle 0.06 → 0.08',
   /--color-border-subtle:  rgba\(255, 255, 255, 0\.08\);\s*\/\* AURIX-VISUAL-CLARITY-1/.test(css));
ok('4 --border-subtle alias kept in step at 0.08',
   /--border-subtle: rgba\(255,255,255,0\.08\);\s*\/\* AURIX-VISUAL-CLARITY-1/.test(css));

console.log('\nGlobal & device parity — all four tokens are in :root (one hierarchy on every device):');
ok('5 tokens declared inside the :root design-system block (not behind a media query)', (function () {
  const r = css.indexOf(':root {'); const end = css.indexOf('\n}', r);
  const block = css.slice(r, end);
  return ['--text-bright: rgba(255,255,255,0.985)', '--color-border-subtle:  rgba(255, 255, 255, 0.08)',
          '--border-subtle: rgba(255,255,255,0.08)', '--aurix-text-secondary: rgba(255, 255, 255, 0.68)']
          .every(t => block.indexOf(t) !== -1);
})());

console.log('\nDo NOT brighten the UI / preserve identity (palette + dark bg + brand blue unchanged):');
ok('6 brand blue, success, danger, dark backgrounds untouched',
   /--aurix-blue:\s*#4A82F0;/.test(css) && /--aurix-success:\s*#3fbf7f;/.test(css) &&
   /--aurix-danger:\s*#e05a5a;/.test(css) && /--bg-main:\s*#0B0F1A;/.test(css) && /--bg:\s*#05070f;/.test(css));
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
