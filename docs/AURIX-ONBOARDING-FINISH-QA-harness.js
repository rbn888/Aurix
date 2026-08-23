'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ONBOARDING-FINISH-QA-harness — SPEC 45 final onboarding polish
// ════════════════════════════════════════════════════════════════════════════
// Closes the onboarding with a coherent, premium, responsive pass over the three remaining steps —
// LANGUAGE, INTERESTS and EXPERIENCE — plus a whole-flow QA. CSS-ONLY: no markup, JS, handler,
// persistence, navigation or engine change. This harness proves the polish (unified keyboard focus,
// one selection language, deliberate interests grid, calm secondary experience step), the responsive
// + reduced-motion coverage, and — critically — ISOLATION: Welcome and Investor Profile (incl. Age,
// which lives inside Profile since v538) are untouched, every data-onb-* hook and container id is
// intact, and no selection/persistence/flow contract moved.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }
const slice = (step) => { const s = html.indexOf('data-onb-step="' + step + '"'); return html.slice(s, html.indexOf('</section>', s) + 10); };
const LANG = slice('LANGUAGE'), INT = slice('INTERESTS'), EXP = slice('EXPERIENCE'), WEL = slice('WELCOME'), PROF = slice('PROFILE');

console.log('\nAURIX-ONBOARDING-FINISH-QA — SPEC 45 (Language / Interests / Experience + full QA)');

// ── 1 unified, accessible keyboard focus across every control ────────────────
ok('1 :focus-visible ring on lang + interests + exp controls', /\.onb-lang-card:focus-visible,\s*#onbInterestsGrid \.onb-chip:focus-visible,\s*\.onb-exp-card:focus-visible \{[\s\S]{0,140}box-shadow: 0 0 0 3px rgba\(74, 130, 240, 0\.30\)/.test(css));

// ── 2 one selection language: shared corner check (lang + exp + interests) ───
ok('2 single shared ::after check owner (glyph ✓, reflow-free absolute)', /\.onb-lang-card::after,\s*\.onb-exp-card::after,\s*#onbInterestsGrid \.onb-chip::after \{[\s\S]{0,120}content: '✓';[\s\S]{0,120}position: absolute/.test(css));
ok('2 selected state fills the check blue for all three', /\.onb-lang-card\.is-selected::after,\s*\.onb-exp-card\.is-selected::after,\s*#onbInterestsGrid \.onb-chip\.is-selected::after \{[\s\S]{0,120}background: var\(--aurix-blue\)/.test(css));
ok('2 the old Language-only empty-content dot is gone', !/\.onb-lang-card::after \{\s*content: '';/.test(css));

// ── 3 Language — institutional locale pill ───────────────────────────────────
ok('3 locale code rendered as a quiet pill', /\.onb-lang-native \{[\s\S]{0,120}border-radius: 999px;[\s\S]{0,120}border: 1px solid rgba\(255, 255, 255, 0\.14\)/.test(css));

// ── 4 Interests — deliberate tile grid, scoped so Age chips are untouched ────
ok('4 interests = 3-col grid on desktop', /#onbInterestsGrid \{[\s\S]{0,120}grid-template-columns: repeat\(3, 1fr\)/.test(css));
ok('4 interests collapses to 2 cols <=768px', /@media \(max-width: 768px\) \{\s*#onbInterestsGrid \{ grid-template-columns: repeat\(2, 1fr\); \}/.test(css));
ok('4 interests chips become centered tiles (radius 14, flex center)', /#onbInterestsGrid \.onb-chip \{[\s\S]{0,160}border-radius: 14px/.test(css) && /#onbInterestsGrid \.onb-chip \{[\s\S]{0,160}justify-content: center/.test(css));
ok('4 grid rule is scoped to #onbInterestsGrid only (Age chips #onbAgeChips not targeted)', css.indexOf('#onbAgeChips { display: grid') < 0 && css.indexOf('#onbAgeChips .onb-chip { border-radius: 14px') < 0);

// ── 5 Experience — reserve for the check, calm secondary rhythm ──────────────
ok('5 experience reserves room for the corner check', /\.onb-exp-card \{ padding-right: 40px; \}/.test(css));
ok('5 experience desc line-height tightened', /\.onb-exp-desc \{ line-height: 1\.4; \}/.test(css));

// ── 6 responsive + reduced-motion ────────────────────────────────────────────
ok('6 <=360px tightens interests + drops the corner check (fill signals selection)', /@media \(max-width: 360px\) \{[\s\S]{0,220}#onbInterestsGrid \.onb-chip::after \{ display: none; \}/.test(css));
ok('6 reduced-motion freezes the new ::after transitions', /@media \(prefers-reduced-motion: reduce\) \{\s*\.onb-lang-card::after,\s*\.onb-exp-card::after,\s*#onbInterestsGrid \.onb-chip::after \{ transition: none; \}/.test(css));
ok('6 entrance cascade untouched (still animates the 4 card types)', /\.modal--onboarding \.onb-lang-card,\s*\.modal--onboarding \.onb-chip,\s*\.modal--onboarding \.onb-exp-card,\s*\.modal--onboarding \.onb-bullet \{ animation: onb-card-rise/.test(css));

// ── 7 ISOLATION — the three polished steps keep every markup hook ────────────
ok('7 LANGUAGE keeps both lang cards + disabled continue', /data-onb-lang="es"/.test(LANG) && /data-onb-lang="en"/.test(LANG) && /id="onbLangContinue"[^>]*disabled/.test(LANG));
// ONBOARDING-EXCELLENCE-V1 — los intereses ya no son un paso propio: viven dentro
// de WELCOME. Lo que este harness debe seguir defendiendo NO es dónde están, sino
// que conservan sus 6 chips, su id y sus hooks — que es lo que hace que el pulido
// de v539 y su consumidor (`_aurixBuildStarterWatchlist`) sigan funcionando.
ok('7 los 6 chips de intereses + #onbInterestsGrid siguen intactos (ahora dentro de WELCOME)',
   (WEL.match(/data-onb-interest=/g) || []).length === 6 && /id="onbInterestsGrid"/.test(WEL));
ok('7 EXPERIENCE keeps its 3 data-onb-exp cards + tag/name/desc', (EXP.match(/data-onb-exp=/g) || []).length === 3 && (EXP.match(/class="onb-exp-tag"/g) || []).length === 3 && (EXP.match(/class="onb-exp-desc"/g) || []).length === 3);

// ── 8 ISOLATION — Welcome + Investor Profile (incl. Age) untouched ───────────
ok('8 WELCOME still the convergence hero + rail (not regressed)', /class="onb-welcome-hero"/.test(WEL) && (WEL.match(/class="onb-wh-dot"/g) || []).length === 5 && (WEL.match(/class="onb-wr-step"/g) || []).length === 3);
ok('8 PROFILE still 4 identity cards + Age subordinate block inside it', (PROF.match(/class="onb-profile-card/g) || []).length === 4 && /class="onb-profile-age"/.test(PROF) && /id="onbAgeChips"/.test(PROF));
// El invariante real de v538 era que la EDAD no se convirtiera en un paso propio.
// Sigue vigente. El recuento de secciones baja a 6 porque INTERESTS se fusionó en
// WELCOME (ONBOARDING-EXCELLENCE-V1); EXPERIENCE y PROFILE permanecen en el DOM
// para Ajustes aunque salgan del recorrido.
ok('8 la edad NO es un paso propio, y las secciones del overlay son las esperadas',
   (html.match(/data-onb-step="/g) || []).length === 6 && html.indexOf('data-onb-step="AGE"') < 0,
   (html.match(/data-onb-step="/g) || []).length + ' secciones');

// ── 9 flow intact — delegated handlers + nav untouched ───────────────────────
ok('9 delegated lang/interest/exp handlers untouched (attribute-based, app.js)', /e\.target\.closest\('\[data-onb-lang\]'\)/.test(app) && /e\.target\.closest\('\[data-onb-interest\]'\)/.test(app) && /e\.target\.closest\('\[data-onb-exp\]'\)/.test(app));
// El control de "saltar" sigue existiendo, pero su semántica cambió: ya no completa
// el onboarding, lo DIFIERE (ONBOARDING-EXCELLENCE-V1). Aquí se comprueba que los
// controles de navegación siguen presentes en el recorrido vigente.
ok('9 avanzar/retroceder/diferir siguen presentes en el flujo',
   /data-onb-next/.test(WEL) && /data-onb-back/.test(html) && /id="onbSkipBtn"/.test(html));

// ── 10 CSS-only — no app.js logic added by this SPEC ─────────────────────────
ok('10 marker lives in CSS, not app.js logic', app.indexOf('SPEC 45 ONBOARDING FINISH') < 0 && css.indexOf('SPEC 45 ONBOARDING FINISH') >= 0);
// El assert original congelaba el markup del onboarding: era el guard de aislamiento
// de un SPEC CSS-only (v539), correcto entonces. ONBOARDING-EXCELLENCE-V1 cambia el
// markup DELIBERADAMENTE, así que congelarlo dejaría de describir la realidad. Lo que
// se conserva es lo que ese guard protegía de verdad: que los HOOKS por atributo con
// los que trabajan los handlers delegados sigan existiendo, uno a uno.
ok('10 todos los hooks por atributo del onboarding siguen presentes',
   // `data-onb-next` / `data-onb-back` son atributos booleanos: se buscan sin '='.
   ['data-onb-step=', 'data-onb-lang=', 'data-onb-interest=', 'data-onb-exp=',
    'data-onb-risk=', 'data-onb-age=', 'data-onb-next', 'data-onb-back']
     .every(h => html.indexOf(h) >= 0));

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ONBOARDING-FINISH-QA — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
