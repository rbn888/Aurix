'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-DASHBOARD-SUMMARY-CARDS-harness — SPEC Dashboard Summary Cards (Web) Premium Layout
// ════════════════════════════════════════════════════════════════════════════
// Desktop-only, presentation-only polish of the Dashboard category cards (owner: updateCategoryCards).
// (1) Allocation row + bar removed from the DESKTOP card (already represented by the hero donut) — hidden in
// the >=769px block, mobile untouched (base rule already hid it). (2) The category return % is shown UNDER
// the market indicator, REUSING the exact category-DETAIL number (computeCategoryPerformance over the same
// asset set the detail header uses) — same period/format/sign/color, NO new calc. (3) Icons flow into the
// freed foot; amount nudged for balance. Card stays a clickable <button>; market states + mobile identical.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing ' + n); return braceSlice(app, i); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }
// the desktop media block (>=769px) that OWNS the card layout — there are many @media(min-width:769px)
// blocks; pick the one that actually contains the category-card rules.
const desktopBlock = (function () {
  let from = 0;
  for (;;) {
    const i = css.indexOf('@media (min-width: 769px)', from);
    if (i < 0) return '';
    const block = braceSlice(css, i);
    if (block.indexOf('.cat-card .cat-card-return') >= 0 || block.indexOf('.cat-card .cat-card-weight') >= 0) return block;
    from = i + 1;
  }
})();
const uc = fnSrc('updateCategoryCards');
const rd = fnSrc('_aurixCatReturnDisplay');

console.log('\nAURIX-DASHBOARD-SUMMARY-CARDS — desktop premium layout');

// ── 1/2 Allocation row + bar removed on DESKTOP ──────────────────────────────
ok('1 desktop hides the Allocation weight group', /\.cat-card \.cat-card-weight\s*\{\s*display:\s*none/.test(desktopBlock));
ok('2 desktop no longer renders the Allocation bar (weight was its only home)', !/\.cat-card \.cat-card-weight\s*\{\s*display:\s*block/.test(desktopBlock));

// ── 3 icons flow into the freed foot (pinned bottom, more air) ───────────────
ok('3 desktop icons pinned to freed foot (margin-top:auto + extra padding)', /\.cat-card \.cat-card-visual\s*\{[\s\S]{0,520}margin-top:\s*auto[\s\S]{0,80}padding-top:\s*18px/.test(desktopBlock));

// ── 4 the % is the SAME number/calc/format as the category DETAIL header ──────
ok('4 card return reuses computeCategoryPerformance (same as detail)', /computeCategoryPerformance\(/.test(rd) && /_aurixPositionFromAsset/.test(rd));
ok('4 card filters the SAME asset set the detail uses', /\(TYPE_META\[a\.type\] \? a\.type : 'other'\) === key/.test(rd) || /TYPE_META\[a\.type\][\s\S]{0,30}=== key/.test(rd));
ok('4 detail header also derives its % from computeCategoryPerformance', /computeCategoryPerformance\(positions\)/.test(fnSrc('_aurixCategoryPerfUpdateHeader')));
// FORMAT parity: for the SAME returnPct both produce the identical "%": sign + abs(pct).toFixed(2) + '%'.
(function () {
  const ctx = { Number, Array, Object, Math, isFinite, parseInt, console: { log() {} } };
  vm.createContext(ctx);
  vm.runInContext(fnSrc('computePositionPerformance'), ctx);
  vm.runInContext(fnSrc('computeCategoryPerformance'), ctx);
  const CCP = ps => vm.runInContext('computeCategoryPerformance', ctx)(ps);
  // a mixed stock category (same primitive assetPnLBase uses)
  const positions = [
    { category: 'stock', quantity: 2, averagePurchasePrice: 294.28, currentPrice: 313.59 },
    { category: 'stock', quantity: 2, averagePurchasePrice: 243.18, currentPrice: 242.37 },
  ];
  const agg = CCP(positions);
  const pct = agg.returnPct;
  const cardText = (pct >= 0 ? '+' : '−') + Math.abs(pct).toFixed(2) + '%';               // card formula
  const detailInner = (agg.absolutePnL >= 0 ? '+' : '−') + Math.abs(pct).toFixed(2) + '%'; // detail header inner %
  ok('4 card % string === detail % string for the same aggregate', cardText === detailInner, cardText + ' vs ' + detailInner);
  ok('4 % has 2 decimals + sign (institutional format)', /^[+−]\d+\.\d{2}%$/.test(cardText), cardText);
})();
ok('4 card text built as sign + Math.abs(pct).toFixed(2) + "%"', /Math\.abs\(pct\)\.toFixed\(2\) \+ '%'/.test(rd));

// ── 5 positive/negative format + colors identical to the detail header ───────
ok('5 up/down/flat tone from pct sign (same semantics as detail)', /pct > 0 \? 'up' : \(pct < 0 \? 'down' : 'flat'\)/.test(rd));
ok('5 card % colors === detail colors (--green / --red / --text-muted)',
   /\.cat-card \.cat-card-return\.up\s*\{\s*color:\s*var\(--green\)/.test(desktopBlock) &&
   /\.cat-card \.cat-card-return\.down\s*\{\s*color:\s*var\(--red\)/.test(desktopBlock) &&
   /\.cat-card \.cat-card-return\.flat\s*\{\s*color:\s*var\(--text-muted\)/.test(desktopBlock));
ok('5 detail header uses the same --green/--red/--text-muted tokens', /\.category-perf-change\.is-up\s*\{\s*color:\s*var\(--green\)/.test(css) && /\.category-perf-change\.is-down\s*\{\s*color:\s*var\(--red\)/.test(css));

// ── 6 no layout/height regression: return is absolutely positioned; min-height intact ─
ok('6 return % is position:absolute under the market badge (no flow/height impact)', /\.cat-card \.cat-card-return\s*\{[\s\S]{0,160}position:\s*absolute[\s\S]{0,160}top:\s*35px/.test(desktopBlock));
ok('6 card min-height unchanged (130px)', /\.cat-card\s*\{[\s\S]{0,900}min-height:\s*130px/.test(css));

// ── 7 cards stay fully clickable ─────────────────────────────────────────────
ok('7 card is still a <button data-type>', /<button class="cat-card\$\{isEmpty \? ' cat-card--empty' : ''\}" data-type="\$\{type\}"/.test(uc));
ok('7 return % never intercepts clicks (pointer-events:none)', /\.cat-card \.cat-card-return\s*\{[\s\S]{0,200}pointer-events:\s*none/.test(desktopBlock));

// ── 8 Market Open / Market Closed / 24/7 unchanged ───────────────────────────
ok('8 market-status markup unchanged (getMarketStatus + getMarketLabel + dot)', /market-status \$\{catStatus === '24\/7' \? 'crypto' : catStatus\}"><span class="dot"><\/span>\$\{getMarketLabel\(catStatus\)\}/.test(uc));
ok('8 .market-status CSS untouched (absolute top-right badge, states)', /\.market-status\s*\{[\s\S]{0,120}position:\s*absolute/.test(css) && /\.market-status\.open\s*\{\s*color:\s*var\(--aurix-success\)/.test(css));

// ── 9 mobile identical: return hidden by default; Allocation was already hidden on mobile ─
ok('9 base rule hides the return % (mobile never shows it)', /\.cat-card-return\s*\{\s*display:\s*none;\s*\}/.test(css));
ok('9 the return % SHOW rule lives INSIDE the >=769px desktop block', desktopBlock.indexOf('.cat-card .cat-card-return') >= 0 && /display:\s*inline-block/.test(desktopBlock.slice(desktopBlock.indexOf('.cat-card .cat-card-return'))));
// every `.cat-card-return` positioning/color rule in the stylesheet is inside the desktop block (the only
// other mention is the base `display:none`), so no mobile block ever styles it visible.
ok('9 no cat-card-return rule sits in any max-width mobile block', (function () {
  const mobates = css.split(/@media \(max-width:/).slice(1).map(s => s.slice(0, s.indexOf('}\n}') >= 0 ? s.indexOf('}\n}') + 3 : 4000));
  return !mobates.some(b => /\.cat-card-return\s*[.{]/.test(b) && /display:\s*(inline-block|block|flex)/.test(b));
})());

// ── 10 cash/liquidity → NO fabricated % (matches detail "Sin rendimiento de mercado") ─
ok('10 cash/liquidity return suppressed', /key === 'cash' \|\| key === 'liquidity'\) return null/.test(rd));
ok('10 no reliable % ⇒ null (never fabricated)', /agg\.returnPct == null \|\| \(agg\.state !== 'ready' && agg\.state !== 'partial'\)\) return null/.test(rd));

// ── 11 render guards: % only for non-empty populated cards; under the market badge ─
ok('11 catReturn computed only for non-empty cards', /const catReturn = isEmpty \? null : _aurixCatReturnDisplay\(type\);/.test(uc));
ok('11 return element placed right after the market status in markup', /\$\{catStatusHtml\}\s*\n\s*\$\{catReturnHtml\}/.test(uc));
ok('11 silent refresh keeps the % in sync (same calc)', /card\.querySelector\('\.cat-card-return'\)[\s\S]{0,260}_aurixCatReturnDisplay\(type\)/.test(uc));

// ── 12 scope: engines / detail / donut owner untouched by this SPEC ──────────
ok('12 getInvestableDistribution (donut/value source) not modified by SPEC', fnSrc('getInvestableDistribution').indexOf('cat-card-return') < 0 && fnSrc('getInvestableDistribution').indexOf('_aurixCatReturnDisplay') < 0);
ok('12 category detail header untouched by SPEC (still its own owner)', fnSrc('_aurixCategoryPerfUpdateHeader').indexOf('cat-card-return') < 0);

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' DASHBOARD-SUMMARY-CARDS — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
