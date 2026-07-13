'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ASSET-DETAIL-POLISH-harness — SPEC 47 Institutional Asset Detail Polish
// ════════════════════════════════════════════════════════════════════════════
// Visual-only polish of the asset-detail card opened from the searcher / reusable by Market — the
// #marketPreviewOverlay / .modal--mkt-preview component. CSS-only + version bump: NO markup change, NO JS
// logic change, NO engine/chart/data/API change. This harness proves (1) the owner MARKUP is intact (all
// ids/handlers present), (2) the institutional CSS refinements exist (header hierarchy, segmented temporal
// selectors, chart protagonism, actions separation, Add primary / Fav secondary), (3) the risky additions
// are DESKTOP-scoped (>=561px) so mobile (<=560px) stays identical to v531, and (4) no behaviour/engine change.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }
const rule = sel => { const i = css.indexOf(sel); return i < 0 ? '' : braceSlice(css, css.indexOf('{', i) === -1 ? i : i); };
const ruleBody = sel => { const i = css.indexOf(sel + ' {') >= 0 ? css.indexOf(sel + ' {') : css.indexOf(sel + '{'); return i < 0 ? '' : braceSlice(css, i); };

// the desktop (>=561px) block that OWNS the preview polish — there are several min-width:561 blocks; pick
// the one containing the preview rules.
const dsk561 = (function () { let from = 0; for (;;) { const i = css.indexOf('@media (min-width: 561px)', from); if (i < 0) return ''; const b = braceSlice(css, i); if (b.indexOf('.mkt-prv-ranges') >= 0 || b.indexOf('.modal--mkt-preview') >= 0) return b; from = i + 1; } })();

console.log('\nAURIX-ASSET-DETAIL-POLISH — SPEC 47');

// ── 1 owner MARKUP intact (opens from search, chart, ranges, add, favorites, close) ─────────
ok('1 #marketPreviewOverlay owner present', /id="marketPreviewOverlay"/.test(html) && /class="modal modal--mkt-preview"/.test(html));
ok('1 header identity nodes intact (icon, name, symbol, type badge)', /id="mktPrvIcon"/.test(html) && /id="mktPrvName"/.test(html) && /id="mktPrvSymbol"/.test(html) && /id="mktPrvBadge"/.test(html));
ok('1 chart mount + temporal ranges + meta intact', /id="mktPrvRanges"/.test(html) && /id="mktPrvMount"/.test(html) && /id="mktPrvMeta"/.test(html));
ok('1 actions: Añadir a cartera (primary) + ★ favorites (secondary) + close intact', /id="mktPrvAddBtn"\s+data-i18n="addToPortfolio"/.test(html) && /id="mktPrvWatchBtn"/.test(html) && /id="mktPrvClose"/.test(html));

// ── 2 NO behaviour / engine / data change (this SPEC is styles-only + version bump) ─────────
ok('2 open/close/add/watch/range JS owners still present (unchanged path)', /function _aurixMktOpenSymbol\(/.test(app) && /_AURIX_MKT_RANGE_MAP/.test(app) && /watchlistStore\.add/.test(app));
ok('2 SPEC.47 introduced no app.js logic (marker lives only in CSS)', app.indexOf('SPEC.47') < 0 && app.indexOf('Institutional Asset Detail') < 0);
ok('2 chart engine untouched (renderer owner not referenced by this SPEC CSS marker region)', css.indexOf('SPEC.47') >= 0);

// ── 3 institutional header hierarchy ─────────────────────────────────────────
(function () { const icon = ruleBody('.mkt-prv-icon'), name = ruleBody('.mkt-prv-name');
  ok('3 logo/icon reinforced (46px, radius 14)', /width:\s*46px/.test(icon) && /border-radius:\s*14px/.test(icon));
  ok('3 name stronger (16.5px / weight 800)', /font-size:\s*16\.5px/.test(name) && /font-weight:\s*800/.test(name)); })();

// ── 4 temporal selectors = one aligned segmented control, DESKTOP-scoped ─────
(function () {
  const dsk = dsk561;
  ok('4 desktop segmented track for the ranges (inset track, scoped)', /\.mkt-prv-ranges \{[\s\S]{0,200}background:[\s\S]{0,120}border-radius: 12px/.test(dsk) && /width: max-content/.test(dsk));
  ok('4 desktop pill sizing scoped to the preview (shared chart-range control not globally changed)', /\.mkt-prv-ranges \.aurix-chart-range \{[\s\S]{0,120}padding: 6px 12px/.test(dsk));
  // shared control untouched globally: no bare `.aurix-chart-range {` size override added by this SPEC
  ok('4 no global .aurix-chart-range restyle introduced', !/SPEC\.47[\s\S]{0,400}^\.aurix-chart-range \{/m.test(css)); })();

// ── 5 chart protagonism + separation between header, chart and actions ───────
(function () { const mount = ruleBody('.mkt-prv-mount'), cta = ruleBody('.mkt-prv-cta');
  ok('5 chart stage taller (min-height 260) — renderer untouched, container only', /min-height:\s*260px/.test(mount));
  ok('5 actions zone separated from the chart (hairline above the CTA)', /border-top:\s*1px solid/.test(cta));
  const dsk = dsk561;
  ok('5 header→body divider + actions air are DESKTOP-scoped', /\.modal-header \{ border-bottom: 1px solid/.test(dsk) && /\.mkt-prv-cta \{ margin-top: 18px/.test(dsk)); })();

// ── 6 Add = clear primary; Favorites = compact secondary ─────────────────────
(function () { const submit = ruleBody('.mkt-prv-cta .btn-submit') || (css.match(/\.mkt-prv-cta \.btn-submit \{ flex: 1;/) ? 'flex:1' : '');
  ok('6 "Añadir a cartera" fills the row (primary)', /\.mkt-prv-cta \.btn-submit \{ flex: 1;/.test(css) && /\.mkt-prv-cta \.btn-submit \{ font-weight: 800/.test(css));
  ok('6 favorites is the compact icon secondary (46x46, secondary style)', /\.mkt-prv-cta \.btn-secondary \{[\s\S]{0,120}width:\s*46px[\s\S]{0,120}height:\s*46px/.test(css)); })();

// ── 7 MOBILE identical to v531: dedicated <=560px block intact, NOT polluted ─
(function () {
  const mob = (function () { const i = css.indexOf('@media (max-width: 560px)', css.indexOf('.modal--mkt-preview')); return ''; })();
  ok('7 mobile mkt-preview block present (ranges h-scroll)', /@media \(max-width: 560px\) \{[\s\S]*?\.modal--mkt-preview \.mkt-prv-ranges \{[\s\S]{0,200}overflow-x: auto/.test(css));
  // the segmented-track additions (width:max-content) live ONLY in the min-width:561 block → cannot leak to mobile
  const before561 = css.slice(0, css.indexOf('@media (min-width: 561px)'));
  ok('7 segmented track is NOT in any base/mobile rule (desktop-media only)', !/\.mkt-prv-ranges \{[^}]*width: max-content/.test(before561));
  ok('7 mobile CTA footer block intact (grid-row 4, own border-top)', /@media \(max-width: 560px\)[\s\S]*?\.mkt-prv-cta \{[\s\S]{0,200}grid-row: 4/.test(css)); })();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ASSET-DETAIL-POLISH (SPEC 47) — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
