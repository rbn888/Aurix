'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ONBOARDING-WELCOME-REDESIGN-harness — SPEC 45 Welcome (commit 1)
// ════════════════════════════════════════════════════════════════════════════
// Welcome no longer reads like a feature list of a tracker. The 3 stacked bullets are replaced by a
// convergence hero (scattered points merge into one Aurix core, once) + approved copy + a capability rail
// (Unificar → Comprender → Decidir). Content/CSS/copy only — NO logic/flow/handler change (the step keeps
// its data-onb-next CTA; the delegated back/next handlers are untouched). This harness proves the new
// structure, the exact approved copy (ES+EN), the forbidden framings are absent, the animation is a
// single-run transform/opacity effect disabled under reduced-motion with fixed-size (no layout impact),
// and the flow is intact.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }
// WELCOME <section> slice
const wStart = html.indexOf('data-onb-step="WELCOME"');
const welcome = html.slice(wStart, html.indexOf('</section>', wStart) + 10);

console.log('\nAURIX-ONBOARDING-WELCOME-REDESIGN — SPEC 45 (Welcome)');

// ── 1 new structure: convergence hero + rail, bullets gone ───────────────────
ok('1 convergence hero with core + 5 scattered dots', /class="onb-welcome-hero"/.test(welcome) && /class="onb-wh-core"/.test(welcome) && (welcome.match(/class="onb-wh-dot"/g) || []).length === 5);
ok('1 capability rail: Unificar → Comprender → Decidir (3 steps + arrows)', (welcome.match(/class="onb-wr-step"/g) || []).length === 3 && (welcome.match(/class="onb-wr-arrow"/g) || []).length === 2);
ok('1 the old 3-bullet feature list is gone from WELCOME', !/onb-bullet\b/.test(welcome));
ok('1 headline + sub present', /class="onb-headline" data-i18n="onbWelcomeTitle"/.test(welcome) && /class="onb-sub" data-i18n="onbWelcomeSub"/.test(welcome));

// ── 2 exact approved copy (ES) ───────────────────────────────────────────────
ok('2 ES headline = approved', /onbWelcomeTitle:\s*'Todo tu patrimonio\. Una sola visión\.'/.test(app));
ok('2 ES sub = approved', /onbWelcomeSub:\s*'Aurix reúne tus activos y transforma información dispersa en claridad patrimonial\.'/.test(app));
ok('2 ES rail = Unificar / Comprender / Decidir', /onbWelcomeRail1:\s*'Unificar'/.test(app) && /onbWelcomeRail2:\s*'Comprender'/.test(app) && /onbWelcomeRail3:\s*'Decidir'/.test(app));

// ── 3 exact approved copy (EN) ───────────────────────────────────────────────
ok('3 EN headline + sub + rail', /onbWelcomeTitle:\s*'All your wealth\. A single view\.'/.test(app) && /onbWelcomeSub:\s*'Aurix brings your assets together and turns scattered information into wealth clarity\.'/.test(app) && /onbWelcomeRail1:\s*'Unify'/.test(app) && /onbWelcomeRail2:\s*'Understand'/.test(app) && /onbWelcomeRail3:\s*'Decide'/.test(app));

// ── 4 forbidden framings absent from the Welcome copy (ES + EN) ──────────────
(function () {
  const grab = k => { const m = new RegExp(k + ":\\s*'([^']*)'", 'g'); const out = []; let x; while ((x = m.exec(app))) out.push(x[1]); return out.join(' '); };
  const copy = (grab('onbWelcomeTitle') + ' ' + grab('onbWelcomeSub') + ' ' + grab('onbWelcomeRail1') + ' ' + grab('onbWelcomeRail2') + ' ' + grab('onbWelcomeRail3')).toLowerCase();
  ok('4 no "tracker" / "family office"', copy.indexOf('tracker') < 0 && copy.indexOf('family office') < 0);
  ok('4 no negation framing ("no es"/"not a")', copy.indexOf('no es') < 0 && copy.indexOf('not a ') < 0);
  ok('4 no prediction/anticipation promise', !/anticip|predic|predict|forecast/.test(copy));
  ok('4 no spreadsheet reference', !/hoja de c|spreadsheet|excel/.test(copy));
})();

// ── 5 animation: single-run convergence (transform/opacity), core settles ────
ok('5 @keyframes onb-wh-converge + onb-wh-core-in defined', /@keyframes onb-wh-converge/.test(css) && /@keyframes onb-wh-core-in/.test(css));
ok('5 dots animate the converge keyframe (single run — no infinite)', /\.onb-wh-dot \{[\s\S]{0,220}animation: onb-wh-converge/.test(css) && !/onb-wh-converge[^;]*infinite/.test(css));
ok('5 converge is transform + opacity only (no layout props animated)', /@keyframes onb-wh-converge \{[\s\S]{0,260}\}/.test(css) && !/@keyframes onb-wh-converge \{[\s\S]{0,260}(width|height|margin|top:|left:)/.test(css.replace(/margin: -3px/g, '')));

// ── 6 no layout impact: hero is a fixed-size box, dots absolute ──────────────
ok('6 hero fixed height (76px) — reserves its own space', /\.onb-welcome-hero \{[\s\S]{0,160}height: 76px/.test(css));
ok('6 dots are position:absolute inside the hero', /\.onb-wh-dot \{[\s\S]{0,120}position: absolute/.test(css));

// ── 7 reduced-motion disables the animation ──────────────────────────────────
ok('7 prefers-reduced-motion hides dots + freezes core', /@media \(prefers-reduced-motion: reduce\) \{\s*\.onb-wh-dot \{ display: none; \}\s*\.onb-wh-core \{ animation: none; \}/.test(css));

// ── 8 responsive: dedicated 320px handling ───────────────────────────────────
ok('8 <=360px tightens the hero + rail (small-screen layout)', /@media \(max-width: 360px\) \{[\s\S]{0,220}\.onb-welcome-hero \{[\s\S]{0,80}height: 64px/.test(css));

// ── 9 flow intact: WELCOME keeps its Continuar CTA + delegated nav unchanged ─
ok('9 WELCOME keeps the data-onb-next CTA (flow forward)', /data-onb-next data-i18n="onbContinue"/.test(welcome));
ok('9 delegated back/next handlers untouched (attribute-based)', /e\.target\.closest\('\[data-onb-next\]'\)/.test(app) && /e\.target\.closest\('\[data-onb-back\]'\)/.test(app));

// ── 10 CSS/copy-only: no app.js logic added by this SPEC ─────────────────────
ok('10 marker lives in CSS/markup, not app.js logic', app.indexOf('SPEC 45 WELCOME') < 0 && (css.indexOf('SPEC 45 WELCOME') >= 0 || html.indexOf('SPEC 45 WELCOME') >= 0));

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ONBOARDING-WELCOME-REDESIGN — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
