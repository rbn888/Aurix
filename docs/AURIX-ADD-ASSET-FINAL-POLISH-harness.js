'use strict';
// AURIX-ADD-ASSET-FINAL-POLISH-harness — SPEC 59 (source contract; visual states validated on-device)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8'), css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
console.log('AURIX-ADD-ASSET-FINAL-POLISH — SPEC 59\n');
// 1. Resting state: picker entry no longer opens the panel via a filter-btn.click() (which called showDefaultSuggestions).
ok('1 picker entry sets category without btn.click() auto-open', !/if \(filterKey\) \{ try \{ const btn = document\.querySelector\('\.filter-btn/.test(app) && /SPEC 59 — engage the category WITHOUT opening the suggestions panel/.test(app));
// 2. Popular capped at 6.
ok('2 popular capped to 6 cards', /\.slice\(0, 6\);\s*\/\/ SPEC 59/.test(app));
// 3. Popular grid 2 columns on mobile.
ok('3 popular is a 2-column grid (mobile)', /#addV2PopularChips \{\s*display: grid; grid-template-columns: 1fr 1fr/.test(css));
// 4. Header subtitle hidden on mobile.
ok('4 header subtitle hidden on mobile', /\.modal\[data-mode="asset"\] \.modal-subtitle \{ display: none; \}/.test(css));
// 5. ISIN placed right below search via order.
ok('5 ISIN ordered right below Search (order 2/3 before tabs order 4)', /\.isin-toggle-mobile\s*\{ order: 2; \}/.test(css) && /#isinOrWrap\s*\{ order: 3; \}/.test(css) && /\.search-filters\s*\{ order: 4; \}/.test(css));
// 6. Panel uses Aurix cool tokens (no warm --bg-card in the mobile asset suggestions).
ok('6 search panel uses cool tokens (not warm --bg-card)', /\.modal\[data-mode="asset"\] \.asset-suggestions \{\s*background: rgba\(13, 18, 30/.test(css));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('GATE: GO'); process.exit(0);
