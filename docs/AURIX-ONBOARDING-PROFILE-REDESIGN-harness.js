'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ONBOARDING-PROFILE-REDESIGN-harness — SPEC 45 Investor Profile (commit 2)
// ════════════════════════════════════════════════════════════════════════════
// The four risk "chips" become premium identity CARDS (financial name + one personality line +
// a risk-meter icon slot, illustration-ready, no empty holes). Age drops to a visually subordinate
// block below with a helper line. Markup + CSS + copy ONLY — the delegated selection handlers,
// persistence and navigation are untouched: every card keeps the SAME data-onb-risk hook, the same
// is-selected/is-active classes and the same #onbRiskChips container; age keeps data-onb-age /
// #onbAgeChips. This harness proves the new structure, the preserved hooks, the exact approved copy
// (ES+EN), the subordinate age block, the responsive + reduced-motion CSS, and the intact flow.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }
// PROFILE <section> slice
const pStart = html.indexOf('data-onb-step="PROFILE"');
const profile = html.slice(pStart, html.indexOf('</section>', pStart) + 10);

console.log('\nAURIX-ONBOARDING-PROFILE-REDESIGN — SPEC 45 (Investor Profile)');

// ── 1 new structure: 4 identity cards in a grid, chips gone ──────────────────
ok('1 profile grid keeps the #onbRiskChips container', /class="onb-profile-grid" id="onbRiskChips"/.test(profile));
ok('1 exactly 4 identity cards', (profile.match(/class="onb-profile-card/g) || []).length === 4);
ok('1 old risk .onb-chip[data-onb-risk] is gone from PROFILE', !/onb-chip[^"]*"[^>]*data-onb-risk/.test(profile) && !/data-onb-risk[^>]*class="onb-chip/.test(profile));
ok('1 each card has icon slot + name + desc', (profile.match(/class="onb-pc-icon"/g) || []).length === 4 && (profile.match(/class="onb-pc-name"/g) || []).length === 4 && (profile.match(/class="onb-pc-desc"/g) || []).length === 4);
ok('1 icon slot is a 4-bar risk meter per card', (profile.match(/class="onb-pc-bar"/g) || []).length === 16);

// ── 2 hooks preserved — selection/persistence contract is byte-identical ─────
ok('2 all four data-onb-risk values present', /data-onb-risk="conservative"/.test(profile) && /data-onb-risk="balanced"/.test(profile) && /data-onb-risk="growth"/.test(profile) && /data-onb-risk="aggressive"/.test(profile));
ok('2 balanced stays the default (is-active)', /class="onb-profile-card is-active" data-onb-risk="balanced"/.test(profile));
ok('2 age hooks intact (#onbAgeChips + all data-onb-age + prefer_not_say default)', /id="onbAgeChips"/.test(profile) && (profile.match(/data-onb-age=/g) || []).length === 5 && /data-onb-age="prefer_not_say"[^>]*is-active|is-active[^>]*data-onb-age="prefer_not_say"/.test(profile));

// ── 3 approved copy (ES) ─────────────────────────────────────────────────────
ok('3 ES headline = approved', /onbProfileTitle:\s*'¿Cómo prefieres invertir\?'/.test(app));
ok('3 ES sub = approved', /onbProfileSub:\s*'Aurix adaptará la experiencia a tu enfoque\. Podrás cambiarlo cuando quieras\.'/.test(app));
ok('3 ES four personality lines = approved', /onbRiskConservativeDesc:\s*'Prioriza preservar capital y reducir volatilidad\.'/.test(app) && /onbRiskBalancedDesc:\s*'Busca crecer manteniendo el riesgo bajo control\.'/.test(app) && /onbRiskGrowthDesc:\s*'Prioriza la apreciación del patrimonio a largo plazo\.'/.test(app) && /onbRiskAggressiveDesc:\s*'Acepta mayor volatilidad buscando mayor crecimiento\.'/.test(app));
ok('3 ES age helper = approved', /onbAgeHelper:\s*'Solo para personalizar tu experiencia\.'/.test(app));

// ── 4 approved copy (EN) ─────────────────────────────────────────────────────
ok('4 EN headline + sub', /onbProfileTitle:\s*'How do you prefer to invest\?'/.test(app) && /onbProfileSub:\s*'Aurix will tailor the experience to your approach\. You can change it anytime\.'/.test(app));
ok('4 EN four personality lines', /onbRiskConservativeDesc:\s*'Prioritizes preserving capital and reducing volatility\.'/.test(app) && /onbRiskBalancedDesc:\s*'Seeks growth while keeping risk under control\.'/.test(app) && /onbRiskGrowthDesc:\s*'Prioritizes long-term wealth appreciation\.'/.test(app) && /onbRiskAggressiveDesc:\s*'Accepts higher volatility in pursuit of higher growth\.'/.test(app));
ok('4 EN age helper', /onbAgeHelper:\s*'Only to personalize your experience\.'/.test(app));

// ── 5 cards wire the copy via data-i18n (name + desc) ────────────────────────
ok('5 names bound to onbRisk* keys', /data-i18n="onbRiskConservative"/.test(profile) && /data-i18n="onbRiskBalanced"/.test(profile) && /data-i18n="onbRiskGrowth"/.test(profile) && /data-i18n="onbRiskAggressive"/.test(profile));
ok('5 descs bound to onbRisk*Desc keys', /data-i18n="onbRiskConservativeDesc"/.test(profile) && /data-i18n="onbRiskBalancedDesc"/.test(profile) && /data-i18n="onbRiskGrowthDesc"/.test(profile) && /data-i18n="onbRiskAggressiveDesc"/.test(profile));

// ── 6 age is a visually subordinate block with helper ────────────────────────
ok('6 age chips wrapped in a subordinate .onb-profile-age block', /class="onb-profile-age"[\s\S]*id="onbAgeChips"/.test(profile));
ok('6 helper line present, bound to onbAgeHelper', /class="onb-age-helper" data-i18n="onbAgeHelper"/.test(profile));
ok('6 CSS makes age subordinate (hairline top border, muted helper)', /\.onb-profile-age \{[\s\S]{0,120}border-top: 1px solid/.test(css) && /\.onb-age-helper \{[\s\S]{0,140}color: rgba\(255,255,255,0\.40\)/.test(css));

// ── 7 CSS: premium card + states + risk-meter fill ───────────────────────────
ok('7 desktop grid = 2 columns', /\.onb-profile-grid \{[\s\S]{0,120}grid-template-columns: repeat\(2, 1fr\)/.test(css));
ok('7 mobile (<=768px) collapses to a single column', /@media \(max-width: 768px\) \{[\s\S]{0,400}\.onb-profile-grid \{ grid-template-columns: 1fr; \}/.test(css));
ok('7 card has hover / focus-visible / active / is-selected / is-active states', /\.onb-profile-card:hover/.test(css) && /\.onb-profile-card:focus-visible/.test(css) && /\.onb-profile-card:active/.test(css) && /\.onb-profile-card\.is-selected/.test(css) && /\.onb-profile-card\.is-active:not\(\.is-selected\)/.test(css));
ok('7 risk-meter fills 1/2/3/4 bars by data-onb-risk', /\[data-onb-risk="conservative"\] \.onb-pc-bar:nth-child\(-n\+1\)/.test(css) && /\[data-onb-risk="balanced"\] \.onb-pc-bar:nth-child\(-n\+2\)/.test(css) && /\[data-onb-risk="growth"\] \.onb-pc-bar:nth-child\(-n\+3\)/.test(css) && /\[data-onb-risk="aggressive"\] \.onb-pc-bar \{/.test(css));

// ── 8 entrance + reduced-motion (accessible) ─────────────────────────────────
ok('8 cards cascade in via onb-card-rise', /\.modal--onboarding \.onb-profile-card \{ animation: onb-card-rise/.test(css));
ok('8 reduced-motion disables card animation + bar transition', /@media \(prefers-reduced-motion: reduce\) \{\s*\.modal--onboarding \.onb-profile-card \{ animation: none; \}\s*\.onb-profile-card, \.onb-pc-bar \{ transition: none; \}/.test(css));

// ── 9 flow intact: PROFILE keeps back/next + delegated handlers unchanged ────
ok('9 PROFILE keeps back + continue footer', /data-onb-back data-i18n="onbBack"/.test(profile) && /data-onb-next data-i18n="onbContinue"/.test(profile));
ok('9 delegated risk/age handlers untouched (attribute-based, in app.js)', /e\.target\.closest\('\[data-onb-risk\]'\)/.test(app) && /e\.target\.closest\('\[data-onb-age\]'\)/.test(app));

// ── 10 markup/CSS-only: no app.js logic added by this SPEC ────────────────────
ok('10 marker lives in CSS/markup, not app.js logic', app.indexOf('SPEC 45 INVESTOR PROFILE') < 0 && (css.indexOf('SPEC 45 INVESTOR PROFILE') >= 0 || html.indexOf('SPEC 45 INVESTOR PROFILE') >= 0));

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ONBOARDING-PROFILE-REDESIGN — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
