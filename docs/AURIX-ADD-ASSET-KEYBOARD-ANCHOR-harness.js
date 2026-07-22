'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ADD-ASSET-KEYBOARD-ANCHOR-harness — SPEC 62
// ════════════════════════════════════════════════════════════════════════════
// On iOS Safari the Add Asset search sheet (#modalOverlay > .modal[data-mode="asset"])
// drifted DOWN with an empty gap above when the keyboard opened: the overlay is
// position:fixed; inset:0 (pinned to the LAYOUT viewport, which iOS does NOT shrink
// for the keyboard) and the sheet is bottom-anchored (align-items:flex-end) / centered,
// so the focused input ends up behind the keyboard and Safari scroll-shifts the overlay.
//
// FIX (source-asserted — the keyboard/visual-viewport shrink can't be simulated in the
// node gate; final anchoring is validated on-device): a PURE-CSS layout-owner rule that
// top-anchors the sheet (align-self:flex-start) only while an input inside it has focus,
// scoped to asset + gold (Metals) modes, inside @media ≤768. No JS/timers/resize/
// visualViewport/transform hacks; Real Estate + Cash + desktop untouched; the single
// .modal-body scroll owner and SPEC 58 pinch-zoom are preserved.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, i) => { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } };

console.log('AURIX-ADD-ASSET-KEYBOARD-ANCHOR — SPEC 62\n');

// Isolate the SPEC 62 block so the assertions describe the actual fix, not stray matches.
const specIdx = css.indexOf('SPEC 62 — ADD ASSET MOBILE');
const spec = specIdx >= 0 ? css.slice(specIdx, specIdx + 2600) : '';
// The exclusion assertions (6/7) must inspect the CSS RULES only — the SPEC 62 comment
// intentionally NAMES real_estate / #liquidityOverlay in its "EXCLUDED BY CONSTRUCTION"
// note, so scope those checks to the code after the comment's closing `*/`.
const rulesIdx = specIdx >= 0 ? css.indexOf('*/', specIdx) : -1;
const specRules = rulesIdx >= 0 ? css.slice(rulesIdx + 2, rulesIdx + 2 + 900) : '';

// 1. The fix exists and is anchored to the SPEC.
ok('1 SPEC 62 keyboard-anchor block present in styles.css', specIdx >= 0);

// 2. Owner untouched: the base overlay is still the position:fixed flex root (the
//    anchoring root the fix overrides — resting layout preserved).
const overlayBase = (css.match(/\.modal-overlay\s*\{[^}]*\}/) || [''])[0];
ok('2 owner intact: .modal-overlay stays position:fixed flex root',
  /position:\s*fixed/.test(overlayBase) && /display:\s*flex/.test(overlayBase) && /align-items:\s*center/.test(overlayBase));

// 3. Resting bottom-sheet anchor preserved (keyboard-closed layout byte-identical):
//    the ≤520 bottom-sheet family still pins #modalOverlay to flex-end.
ok('3 resting bottom-sheet anchor preserved (#modalOverlay align-items:flex-end unchanged)',
  /#modalOverlay[\s\S]{0,240}align-items:\s*flex-end/.test(css));

// 4. The fix top-anchors the sheet on focus via align-self:flex-start.
ok('4 fix top-anchors on focus (align-self: flex-start under :focus-within)',
  /:focus-within\s*\{[^}]*align-self:\s*flex-start/.test(spec));

// 5. Scoped to the asset (search) sheet AND gold (Metals) — the SPEC "Aplicar a" set.
ok('5 scoped to asset + gold sheet (data-mode="asset" / "gold")',
  /\.modal\[data-mode="asset"\]:focus-within/.test(spec) && /\.modal\[data-mode="gold"\]:focus-within/.test(spec));

// 6. Real Estate excluded by construction — the fix never matches data-mode="real_estate".
ok('6 Real Estate excluded (no data-mode="real_estate" in the SPEC 62 rules)',
  specRules.length > 0 && !/data-mode="real_estate"/.test(specRules));

// 7. Cash/Liquidity excluded — the fix does not touch #liquidityOverlay.
ok('7 Cash/Liquidity excluded (#liquidityOverlay not referenced by the fix rules)',
  specRules.length > 0 && !/#liquidityOverlay/.test(specRules));

// 8. Desktop untouched — the entire fix lives inside @media (max-width: …).
//    (There must be a ≤768 media query wrapping the focus-within rule, and no
//     unguarded focus-within align-self leaking to desktop.)
ok('8 desktop untouched (fix is inside @media ≤768 only)',
  /@media\s*\(max-width:\s*768px\)\s*\{[\s\S]{0,400}#modalOverlay > \.modal\[data-mode="asset"\]:focus-within/.test(css));

// 9. Notch/safe-area top gap on the small-phone (≤520) top-anchored sheet.
ok('9 ≤520 top-anchored sheet clears the notch (margin-top: safe-area-inset-top)',
  /@media\s*\(max-width:\s*520px\)\s*\{[\s\S]{0,400}#modalOverlay > \.modal\[data-mode="asset"\]:focus-within[\s\S]{0,180}margin-top:\s*env\(safe-area-inset-top/.test(css));

// 10. Pure CSS — no JS keyboard machinery introduced (SPEC forbids timers / resize /
//     visualViewport recalc / scrollTo / auto-blur). app.js still has ZERO visualViewport
//     usage and no add-asset keyboard scrollTo/reset was added.
ok('10 no visualViewport handling introduced (pure CSS fix)', !/visualViewport/.test(app));

// 11. Single scroll owner preserved: the sheet body (.modal-body) is still the sole
//     overflow-y:auto surface on mobile (no double-scroll introduced).
ok('11 single scroll owner preserved (.modal-body overflow-y:auto on mobile)',
  /\.modal-body\s*\{[^}]*overflow-y:\s*auto/.test(css));

// 12. SPEC 58 pinch-zoom NOT regressed by this change (body.modal-open still permits pinch).
const modalOpen = (css.match(/body\.modal-open\s*\{[^}]*\}/) || [''])[0];
ok('12 SPEC 58 pinch-zoom intact (body.modal-open touch-action allows pinch-zoom)',
  /pinch-zoom/.test(modalOpen) && !/touch-action:\s*none/.test(modalOpen));

// 13. Search auto-zoom guard intact (16px input keeps the sheet from being dragged on focus).
ok('13 search input anti-zoom guard intact (font-size:16px on the mobile search field)',
  /\.search-field-wrap input\s*\{[^}]*font-size:\s*16px/.test(css));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('GATE: GO — all ' + pass + ' assertions passed');
process.exit(0);
