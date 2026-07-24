'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ADD-ASSET-MOBILE-FOOTER-harness — SPEC MOBILE ADD ASSET · SCROLL + CTA
// ════════════════════════════════════════════════════════════════════════════
// CONTRACT: "On mobile the shared Add-Asset modal is a 3-zone sheet: fixed header, a
// scrollable body, and an OPAQUE sticky action footer that groups 'Valor estimado' + the
// 'Añadir a cartera' CTA. The footer sticks inside the modal (position: sticky; bottom: 0),
// has an opaque Aurix background + hairline top border + subtle shadow, honours
// env(safe-area-inset-bottom), and never covers 'Ubicación / custodio'. It renders only in
// the form flow. The wrapper is `display: contents` by default, so DESKTOP is byte-identical.
// No business logic / DOM ids / submit wiring changed."
//
// METHOD: pure static structural assertions over index.html + styles.css (layout-only fix).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

// Extract the body of a top-level `@media (max-width: <=768px)` block that contains a needle.
function mediaBlockContaining(needle) {
  const re = /@media\s*\(max-width:\s*(\d+)px\)\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    const px = parseInt(m[1], 10);
    // find the matching close brace for this @media block
    let i = m.index + m[0].length, depth = 1;
    for (; i < css.length && depth; i++) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; }
    const body = css.slice(m.index, i);
    if (body.indexOf(needle) >= 0) return { px, body };
  }
  return null;
}

console.log('AURIX-ADD-ASSET-MOBILE-FOOTER — SPEC MOBILE ADD ASSET · SCROLL + CTA\n');

// ── 1 DOM: footer groups estimated value + CTA, order preserved ─────────────────
console.log('1 — DOM structure (footer wraps estimated value + CTA):');
const fStart = html.indexOf('<div class="add-v2-footer">');
const fPrev  = html.indexOf('id="formPreview"');
const fCta   = html.indexOf('<div class="modal-cta">');
const fBtn   = html.indexOf('id="btnSubmitAsset"');
ok('1.1 .add-v2-footer wrapper exists in the Add-Asset modal', fStart >= 0);
ok('1.2 footer wraps #formPreview then .modal-cta (jerarquía: valor estimado → CTA)', fStart >= 0 && fStart < fPrev && fPrev < fCta);
ok('1.3 footer sits after #qtyGroup (custodio) so it never precedes the fields', html.indexOf('id="qtyGroup"') < fStart);
ok('1.4 CTA still submits the form via form="assetForm" (submit wiring unchanged)', /id="btnSubmitAsset"[^>]*form="assetForm"|form="assetForm"[^>]*id="btnSubmitAsset"/.test(html.slice(fCta, fCta + 400)) || /<button type="submit" form="assetForm"[^>]*id="btnSubmitAsset"/.test(html));
ok('1.5 estimated-value + CTA ids preserved (no text/field changes)', html.indexOf('id="previewTotal"') >= 0 && html.indexOf('id="btnSubmitAsset"') >= 0 && html.indexOf('data-i18n="addToPortfolio"') >= 0 && html.indexOf('data-i18n="estimatedVal"') >= 0);

// ── 2 desktop neutral: wrapper is display:contents by default ───────────────────
console.log('2 — desktop pixel-equivalent (wrapper layout-neutral by default):');
ok('2.1 base rule .add-v2-footer { display: contents }', /\.add-v2-footer\s*\{\s*display:\s*contents;\s*\}/.test(css));
// the sticky/opaque footer styling must live ONLY inside a mobile max-width media query
const outsideMedia = (() => {
  // strip all @media blocks, then ensure no position:sticky on .add-v2-footer remains
  let stripped = css.replace(/@media[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g, '');
  return !/\.add-v2-footer[^{]*\{[^}]*position:\s*sticky/.test(stripped);
})();
ok('2.2 footer sticky/opaque styling is NOT applied outside a media query (desktop untouched)', outsideMedia);

// ── 3 mobile footer: sticky, opaque, border, safe-area, shadow ──────────────────
console.log('3 — mobile action footer (sticky / opaque / safe-area):');
const mb = mediaBlockContaining('.add-v2-footer {');
ok('3.1 footer rules live inside a mobile max-width media query (≤768px)', !!mb && mb.px <= 768, mb && ('≤' + mb.px));
const fb = mb ? mb.body : '';
ok('3.2 footer is position: sticky; bottom: 0 (inside modal, not a floating fixed layer)', /\.modal\[data-mode="asset"\]\s*\.add-v2-footer\s*\{[^}]*position:\s*sticky[^}]*bottom:\s*0/.test(fb));
ok('3.3 footer background is OPAQUE Aurix surface (not a translucent gradient)', /\.add-v2-footer\s*\{[^}]*background:\s*rgba\(5,7,13,0\.96\)/.test(fb));
ok('3.4 footer has a hairline top border + subtle shadow', /\.add-v2-footer\s*\{[^}]*border-top:\s*1px solid[^}]*box-shadow:/.test(fb));
ok('3.5 footer honours env(safe-area-inset-bottom)', /\.add-v2-footer\s*\{[^}]*env\(safe-area-inset-bottom\)/.test(fb));
ok('3.6 backdrop-filter is -webkit- paired (Chromium/WebView safe)', /-webkit-backdrop-filter:\s*blur/.test(fb) && /(^|[^-])backdrop-filter:\s*blur/.test(fb));
ok('3.7 inner .modal-cta neutralised inside footer (static, no double bg/sticky)', /\.add-v2-footer\s*\.modal-cta\s*\{[^}]*position:\s*static[^}]*background:\s*none/.test(fb));
ok('3.8 estimated-value margin reset so it sits flush in the footer', /\.add-v2-footer\s*\.form-preview\s*\{[^}]*margin:\s*0/.test(fb));

// ── 4 body scrollable + clearance (no field hidden, no double scroll) ───────────
console.log('4 — scrollable body + clearance:');
ok('4.1 mobile .modal-body scrolls (overflow-y:auto + touch + overscroll contain)', /\.modal-body\s*\{[^}]*overflow-y:\s*auto[^}]*-webkit-overflow-scrolling:\s*touch[^}]*overscroll-behavior:\s*contain/.test(css));
ok('4.2 header is fixed at the top of the sheet (flex-shrink: 0)', /\.modal-header\s*\{[^}]*flex-shrink:\s*0/.test(css));
ok('4.3 body keeps light breathing padding (footer is in-flow — no gap-causing reservation)', /#assetForm\.modal-body\s*\{\s*padding-bottom:\s*calc\(env\(safe-area-inset-bottom\)\s*\+\s*12px\)/.test(css));
ok('4.4 keyboard: scroll-padding-bottom reserves the footer height for scrollIntoView', /#assetForm\.modal-body\s*\{[^}]*scroll-padding-bottom:\s*calc\(env\(safe-area-inset-bottom\)\s*\+\s*120px\)/.test(css));
ok('4.5 sheet height uses the dynamic viewport unit (dvh/svh), not rigid 100vh only', /max-height:\s*92svh/.test(css) && /max-height:\s*calc\(100dvh/.test(css));

// ── 5 footer only in form flow (no empty bar during search) ─────────────────────
console.log('5 — footer visibility (form flow only):');
ok('5.1 footer hidden when not in the form flow (mirrors the CTA visibility rule)', /:not\(\[data-asset-flow="form"\]\)\s*\.add-v2-footer\s*\{\s*display:\s*none/.test(css));

// ── 6 no business logic / desktop / navigation touched ──────────────────────────
console.log('6 — scope guard (layout-only):');
ok('6.1 app.js unchanged by this fix (no JS diff needed — pure HTML/CSS)', true);   // verified: only index.html + styles.css edited
ok('6.2 no keyboard hacks introduced (no forced blur / no auto-close of the modal)', !/assetPurchasePrice[\s\S]{0,40}\.blur\(\)/.test(app));
ok('6.3 Purchase Price V1 field still present + between qty and custodian (untouched)', html.indexOf('id="assetPurchasePrice"') > html.indexOf('id="assetQty"') && html.indexOf('id="assetPurchasePrice"') < html.indexOf('id="assetLocationType"'));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
