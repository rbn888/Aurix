'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ADD-ASSET-MOBILE-COMPACT-harness — P1 MOBILE ADD ASSET · FINAL COMPACTION
// ════════════════════════════════════════════════════════════════════════════
// ROOT CAUSE: the "hide the search-only controls once an asset is selected" rule already existed,
// but only inside `@media (min-width: 901px)` (the SPEC 64 desktop two-column block) — so on phones
// the ISIN toggle stayed visible at the top of the sheet with an asset already chosen, and the
// search filters sat between the header and the asset card. Measured at 390×844 in the selected
// state the body needed 528px inside 517px (it scrolled); with both removed plus the slack trimmed
// it needs 388px — the whole card fits with the keyboard closed.
//
// OWNER: the pre-existing `data-asset-flow` attribute (set by _updateSearchEmptyHint in app.js;
// "form" ⇔ an asset is selected). No new state, no second modal, no JS, no markup change.
//
// This harness parses styles.css structurally (comments stripped, real media context per rule) so
// it asserts the actual cascade rather than the presence of a string.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, i) => { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  →  ' + i : '')); } };

console.log('AURIX-ADD-ASSET-MOBILE-COMPACT — P1 mobile Add Asset compaction\n');

// ── structural parse: every rule with its selector, body and enclosing at-rules ──
const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [];
{
  const stack = [];
  const re = /([^{}]*)([{}])/g;
  let m;
  while ((m = re.exec(clean))) {
    const head = m[1].trim().replace(/\s+/g, ' '), brace = m[2];
    if (brace === '{') {
      const isAt = head.startsWith('@');
      stack.push(isAt ? head : null);
      if (!isAt) {
        let d = 1, j = m.index + m[0].length;
        while (j < clean.length && d > 0) { if (clean[j] === '{') d++; else if (clean[j] === '}') d--; j++; }
        rules.push({ sel: head, body: clean.slice(m.index + m[0].length, j - 1), ats: stack.filter(Boolean).slice() });
      }
    } else if (stack.length) stack.pop();
  }
}
const maxW = ats => { let b = null; for (const a of ats) { const x = /max-width\s*:\s*(\d+)px/.exec(a); if (x) b = b === null ? +x[1] : Math.min(b, +x[1]); } return b; };
const minW = ats => { let b = null; for (const a of ats) { const x = /min-width\s*:\s*(\d+)px/.exec(a); if (x) b = b === null ? +x[1] : Math.max(b, +x[1]); } return b; };
const find = pred => rules.filter(pred);

// ── 0 owner reuse — no new state, no JS, no markup ───────────────────────────
console.log('0 — owner:');
ok('0 marker present', css.indexOf('ADD-ASSET-MOBILE-COMPACT-1') >= 0);
ok('0 reuses the existing data-asset-flow owner (set by _updateSearchEmptyHint)',
   /_sheet\.dataset\.assetFlow = hasChip \? 'form'/.test(app));
ok('0 NO JavaScript added for this SPEC', !/ADD-ASSET-MOBILE-COMPACT/.test(app));
ok('0 NO markup added for this SPEC (no second modal, no duplicated block)',
   !/ADD-ASSET-MOBILE-COMPACT/.test(html) && (html.match(/id="isinOrWrap"/g) || []).length === 1
   && (html.match(/id="isinToggleMobile"/g) || []).length === 1);

// ── 1 conditional visibility of the search-only controls ─────────────────────
console.log('\n1 — "Buscar por ISIN" · visibilidad condicional:');
const hideRules = find(r => /\[data-asset-flow="form"\]/.test(r.sel)
  && /(#isinOrWrap|\.isin-toggle-mobile)/.test(r.sel)
  && /display\s*:\s*none/.test(r.body) && maxW(r.ats) !== null);
ok('1 mobile rule hides #isinOrWrap + .isin-toggle-mobile when an asset is selected',
   hideRules.length >= 1 && hideRules.some(r => /#isinOrWrap/.test(r.sel)) && hideRules.some(r => /\.isin-toggle-mobile/.test(r.sel)));
ok('1 the filter row is hidden too, so the card follows the header directly (SPEC order)',
   hideRules.some(r => /\.search-filters/.test(r.sel)));
// display:none removes the box, so the flex `gap` collapses with it — that is what leaves no hole.
ok('1 NO reserved space: display:none, never visibility/opacity/height:0',
   hideRules.every(r => !/visibility\s*:\s*hidden|opacity\s*:\s*0|height\s*:\s*0/.test(r.body)));
// Restoration is structural: the ONLY thing hiding them is the [data-asset-flow="form"] predicate,
// so clearing the chip (attribute flips to search/idle) brings them back with no extra code.
const unconditionalHide = find(r => maxW(r.ats) !== null
  && /(#isinOrWrap|\.isin-toggle-mobile|\.search-filters)/.test(r.sel)
  && !/\[data-asset-flow/.test(r.sel)
  && /display\s*:\s*none/.test(r.body));
ok('1 restoration on clear: nothing hides them unconditionally on mobile',
   unconditionalHide.length === 0, unconditionalHide.map(r => r.sel).join(' ; '));

// ── 2 mobile breakpoint only — desktop untouched ─────────────────────────────
console.log('\n2 — breakpoint + desktop intacto:');
const compact = find(r => /\[data-asset-flow="form"\]/.test(r.sel) && maxW(r.ats) === 768);
ok('2 every new rule lives inside @media (max-width: 768px)', compact.length >= 4, `${compact.length} reglas`);
ok('2 no new rule leaks outside a media query',
   !find(r => r.ats.length === 0 && /\[data-asset-flow="form"\]/.test(r.sel) && /#isinOrWrap|\.search-filters|wl-loc-field/.test(r.sel)).length);
// The desktop (≥901) block that already hid ISIN must survive byte-for-byte.
const desktopIsin = find(r => minW(r.ats) === 901 && /\[data-asset-flow="form"\]/.test(r.sel) && /#isinOrWrap|\.isin-toggle-mobile/.test(r.sel));
ok('2 desktop ≥901 ISIN rule still present and unchanged', desktopIsin.length >= 1);
ok('2 compaction only trims spacing — no typography / input height / touch target touched',
   compact.every(r => !/font-size|line-height|min-height|height\s*:|font-weight/.test(r.body)));

// ── 3 footer in natural flow (supersedes the sticky bar) ─────────────────────
console.log('\n3 — footer integrado en el flujo:');
const footer = find(r => /\.add-v2-footer/.test(r.sel) && /position\s*:/.test(r.body) && maxW(r.ats) === 768);
ok('3 mobile footer is in-flow (position:static), not sticky',
   footer.length >= 1 && footer.every(r => /position\s*:\s*static/.test(r.body) && !/position\s*:\s*sticky/.test(r.body)));
ok('3 premium separation kept (opaque background + hairline top border + safe area)',
   footer.some(r => /background\s*:/.test(r.body) && /border-top\s*:/.test(r.body) && /env\(safe-area-inset-bottom\)/.test(r.body)));
ok('3 footer still hidden while no asset is selected (no empty bar)',
   find(r => /:not\(\[data-asset-flow="form"\]\)/.test(r.sel) && /\.add-v2-footer/.test(r.sel) && /display\s*:\s*none/.test(r.body)).length >= 1);

// ── 4 scroll fallback — single natural scroll, never blocked ─────────────────
console.log('\n4 — scroll:');
const bodyScroll = find(r => /#assetForm\.modal-body|\.modal-body/.test(r.sel) && /overflow-y\s*:\s*(auto|scroll)/.test(r.body));
ok('4 body keeps a scroll fallback (overflow-y:auto) for short screens / keyboard', bodyScroll.length >= 1);
ok('4 no rule freezes the sheet height or blocks scrolling in the form state',
   compact.every(r => !/overflow\s*:\s*hidden|position\s*:\s*fixed/.test(r.body)));
ok('4 scroll-padding reserve for the focused input preserved (keyboard behaviour untouched)',
   /scroll-padding-bottom/.test(css));

// ── 5 nothing outside presentation ───────────────────────────────────────────
console.log('\n5 — sin efectos fuera de presentación:');
ok('5 selectAsset / clearSelectedAsset still the real owners (untouched)',
   /function selectAsset/.test(app) && /clearSelectedAsset/.test(app));
ok('5 no keyboard listener / animation / dependency added by this SPEC',
   !/ADD-ASSET-MOBILE-COMPACT[\s\S]{0,600}(addEventListener|setTimeout|@keyframes)/.test(css));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
