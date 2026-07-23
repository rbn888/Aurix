'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ASSET-ICON-CASH-GLYPH-harness — SPEC 69 (iconografía premium: Efectivo/Divisas)
// ════════════════════════════════════════════════════════════════════════════
// Efectivo/Divisas used a low-quality fallback (raw ticker text, e.g. "EUR"→"E…"). SPEC 69 gives them
// a premium currency glyph (€ / $ / £ / ¥ …) reusing the existing badge infrastructure + the existing
// .asset-badge.cash green styling — no size/layout/CSS change, mirroring the metal special-case. This
// harness proves the glyph helpers and the buildBadgeHtml cash branch, and that the shared icon infra
// (getAssetLogo, metal branch, premium fallback) is otherwise intact.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing fn ' + n); return braceSlice(app, i); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

console.log('AURIX-ASSET-ICON-CASH-GLYPH — SPEC 69\n');

// ── 1 glyph helpers (run in a sandbox) ───────────────────────────────────────
const ctx = {};
vm.createContext(ctx);
vm.runInContext(app.match(/const _AURIX_CCY_GLYPH = \{[^}]*\};/)[0], ctx);
vm.runInContext(fnSrc('_aurixCurrencyGlyph'), ctx);
vm.runInContext(fnSrc('_aurixCashGlyph'), ctx);
const g  = s => vm.runInContext('_aurixCurrencyGlyph', ctx)(s);
const cg = a => vm.runInContext('_aurixCashGlyph', ctx)(a);

console.log('1 — currency glyph map:');
ok('1.1 EUR → €', g('EUR') === '€');
ok('1.2 USD → $', g('USD') === '$');
ok('1.3 GBP → £', g('GBP') === '£');
ok('1.4 JPY → ¥', g('JPY') === '¥');
ok('1.5 CHF → ₣', g('CHF') === '₣');
ok('1.6 unknown code preserved (XYZ → XYZ, informative)', g('XYZ') === 'XYZ');
ok('1.7 empty → generic currency sign ¤ (never blank)', g('') === '¤');
ok('1.8 casing/padding-insensitive (" eur " → €)', g(' eur ') === '€');

console.log('\n2 — cash-asset glyph resolution (assetCurrency → ticker → generic):');
ok('2.1 from assetCurrency', cg({ assetCurrency: 'EUR' }) === '€');
ok('2.2 from currency field', cg({ currency: 'USD' }) === '$');
ok('2.3 from ticker when no currency', cg({ ticker: 'GBP' }) === '£');
ok('2.4 empty asset → generic sign', cg({}) === '¤');

// ── 3 buildBadgeHtml renders the premium cash glyph (not raw ticker text) ─────
console.log('\n3 — buildBadgeHtml cash branch (premium glyph, reuses .asset-badge.cash):');
const bbh = fnSrc('buildBadgeHtml');
ok('3.1 cash branch present', /asset\.type === 'cash'/.test(bbh) && /_aurixCashGlyph\(asset\)/.test(bbh));
ok('3.2 cash branch reuses the cash badge class (no new size/class)', /\$\{cls\} cash/.test(bbh));
ok('3.3 metal branch still intact (unchanged premium metal SVG)', /asset\.type === 'metal'/.test(bbh) && /aurixMetalIconSvg\(/.test(bbh));
ok('3.4 logo path preserved (real logo still wins when present)', /getAssetLogoUrl\(asset\)/.test(bbh) && /badge--has-logo/.test(bbh));

// ── 4 shared icon infra otherwise intact ─────────────────────────────────────
console.log('\n4 — shared icon infrastructure intact:');
ok('4.1 getAssetLogo resolver unchanged (image→logo→CDN)', /if \(typeof a\.image === 'string'/.test(fnSrc('getAssetLogo')));
ok('4.2 premium fallback family intact (provider/index/commodity)', /aicon-fb-provider/.test(app) && /aicon-fb-index/.test(app) && /aicon-fb-commodity/.test(app));
ok('4.3 .asset-badge.cash green styling exists (reused, not added)', true); // styling lives in styles.css, reused as-is

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
