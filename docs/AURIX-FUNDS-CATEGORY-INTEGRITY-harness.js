'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-FUNDS-CATEGORY-INTEGRITY-harness — SPEC 66 (INTEGRIDAD COMPLETA DE FONDOS)
// ════════════════════════════════════════════════════════════════════════════
// ROOT CAUSE proven: every DISPLAY grouping used the inline `TYPE_META[type] ? type : 'other'`,
// but TYPE_META has NO 'fund' key — so a fund (type 'fund') resolved to 'other' and was INVISIBLE
// in its category, even though it summed into wealth and fed the category chart (which already
// merges etf+fund). FIX: a SINGLE resolver `_aurixDisplayCategory(type)` folds 'fund' into the
// 'etf' (Fondos/ETF) group and is used by EVERY grouping site, so a fund behaves exactly like an
// ETF across all views. This harness proves the resolver's behaviour, that every grouping site
// consumes it (single source), and that no inline grouping pattern survives.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function braceSlice(startIdx) { let k = app.indexOf('{', startIdx), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(startIdx, k); }
function fnSrc(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing fn ' + name); return braceSlice(i); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

console.log('AURIX-FUNDS-CATEGORY-INTEGRITY — SPEC 66\n');

// ── 1 resolver behaviour (run in a sandbox with the REAL TYPE_META keys — no 'fund') ──
console.log('1 — _aurixDisplayCategory single-source resolver:');
const ctx = { TYPE_META: { crypto: {}, stock: {}, etf: {}, metal: {}, cash: {}, real_estate: {}, other: {} } };
vm.createContext(ctx);
vm.runInContext(fnSrc('_aurixDisplayCategory'), ctx);
const cat = t => vm.runInContext('_aurixDisplayCategory', ctx)(t);
ok('1.1 fund → etf (Fondos/ETF group, parity with the category chart)', cat('fund') === 'etf');
ok('1.2 etf → etf (funds and ETFs share ONE display category)', cat('etf') === 'etf');
ok('1.3 fund and etf resolve to the SAME category', cat('fund') === cat('etf'));
ok('1.4 stock → stock (unchanged)', cat('stock') === 'stock');
ok('1.5 crypto → crypto (unchanged)', cat('crypto') === 'crypto');
ok('1.6 metal → metal (unchanged)', cat('metal') === 'metal');
ok('1.7 real_estate → real_estate (unchanged)', cat('real_estate') === 'real_estate');
ok('1.8 unknown type → other', cat('zzz') === 'other');
ok('1.9 casing-insensitive (FUND → etf)', cat('FUND') === 'etf');

// ── 2 SINGLE SOURCE — every display grouping site consumes the resolver ───────
console.log('2 — single source (all grouping sites use the resolver):');
ok('2.1 _aurixDisplayCategory defined once', (app.match(/function _aurixDisplayCategory\(/g) || []).length === 1);
// No inline `TYPE_META[..type] ? ..type : 'other'` grouping pattern survives in executable code
// (the only remaining occurrence is the explanatory comment inside the resolver's doc block).
const inlineHits = (app.match(/TYPE_META\[[a-z]*\.?type\] \? [a-z]*\.?type : 'other'/g) || []).length;
const commentHits = (app.match(/inline `TYPE_META\[type\] \? type : 'other'`/g) || []).length;
ok('2.2 no inline grouping pattern remains (excl. doc comment)', inlineHits === 0, 'inlineHits=' + inlineHits + ' commentHits=' + commentHits);
// The grouping consumers all reference the resolver.
['getDistribution', 'getInvestableDistribution', '_aurixPositionFromAsset'].forEach(fn => {
  ok('2.3 ' + fn + ' uses _aurixDisplayCategory', /_aurixDisplayCategory\(/.test(fnSrc(fn)));
});
ok('2.4 resolver used at ≥8 grouping sites (single source across views)', (app.match(/_aurixDisplayCategory\(/g) || []).length >= 8);

// ── 3 category history bucket keeps 'fund' its own bucket (chart merges etf+fund) ──
console.log('3 — chart/history parity (unchanged, funds already counted):');
ok('3.1 _aurixCategoryBucket maps fund → fund bucket', /if \(t === 'fund'\)\s*return 'fund';/.test(fnSrc('_aurixCategoryBucket')));
ok('3.2 category chart merges etf + fund', /case 'etf':\s*return \['etf', 'fund'\];/.test(fnSrc('_categoryBucketsForType')));

// ── 4 selector disambiguation (SPEC 66 obj 4) ────────────────────────────────
console.log('4 — fund selector shows the disambiguating share class:');
ok('4.1 _aurixSearchFundsLocal result carries shareClass', /shareClass: f\.shareClass \|\| null/.test(fnSrc('_aurixSearchFundsLocal')));
ok('4.2 subtitle shows shareClass (replaces bare currency, no redundancy)', /if \(a\.shareClass\) parts\.push\(a\.shareClass\);/.test(fnSrc('_aurixSearchSubtitle')));
ok('4.3 search-results dropdown uses the disambiguating subtitle', (app.match(/_aurixSearchSubtitle\(a\) : a\.ticker/g) || []).length >= 2);

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
