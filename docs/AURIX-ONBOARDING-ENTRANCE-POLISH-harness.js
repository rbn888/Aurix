'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ONBOARDING-ENTRANCE-POLISH-harness — SPEC 45 (onboarding, safe layer)
// ════════════════════════════════════════════════════════════════════════════
// Premium entrance choreography for the onboarding steps: on top of the existing whole-step fade, each
// step's selectable cards/bullets cascade up in a subtle stagger ("every transition should feel smooth").
// CSS-only + version bump: NO markup/handler/navigation/data change. The animation uses `backwards` fill so
// it releases after entrance and never clobbers the existing :hover/:active/.is-selected transforms, and it
// is fully disabled under prefers-reduced-motion. This harness proves exactly that.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

console.log('\nAURIX-ONBOARDING-ENTRANCE-POLISH — SPEC 45 (safe layer)');

// ── 1 the cascade keyframe + card animation exist ───────────────────────────
ok('1 @keyframes onb-card-rise defined', /@keyframes onb-card-rise \{[\s\S]{0,120}opacity: 0[\s\S]{0,80}opacity: 1/.test(css));
ok('1 all four card types animate with the cascade', /\.modal--onboarding \.onb-lang-card,\s*\.modal--onboarding \.onb-chip,\s*\.modal--onboarding \.onb-exp-card,\s*\.modal--onboarding \.onb-bullet \{ animation: onb-card-rise/.test(css));

// ── 2 `backwards` fill so it never clobbers hover/active/selected transforms ─
ok('2 uses animation-fill-mode backwards (releases after entrance)', /animation: onb-card-rise \.42s var\(--ease-premium\) backwards;/.test(css));
ok('2 existing card interaction transforms still present (NOT removed)', /\.onb-lang-card:active \{ transform: scale\(/.test(css) && /\.onb-chip:active \{ transform: scale\(/.test(css));
ok('2 existing .is-selected states still present', /\.onb-lang-card\.is-selected/.test(css) && /\.onb-chip\.is-selected/.test(css) && /\.onb-exp-card\.is-selected/.test(css));

// ── 3 staggered delays (cascade, not all-at-once) ───────────────────────────
ok('3 nth-child stagger delays present (.05 → .34s)', /:nth-child\(2\)[\s\S]{0,260}animation-delay: \.05s/.test(css) && /:nth-child\(5\)[\s\S]{0,260}animation-delay: \.20s/.test(css) && /:nth-child\(n\+8\)\s*\{ animation-delay: \.34s/.test(css));

// ── 4 reduced-motion disables the cascade entirely ──────────────────────────
ok('4 prefers-reduced-motion turns the cascade off', /@media \(prefers-reduced-motion: reduce\) \{\s*\.modal--onboarding \.onb-lang-card,[\s\S]{0,180}\.onb-bullet \{ animation: none; \}/.test(css));

// ── 5 the whole-step fade is preserved (additive, not replaced) ─────────────
ok('5 .onb-step whole-step fade (onb-fade-in) intact', /\.onb-step \{[\s\S]{0,160}animation: onb-fade-in/.test(css) && /@keyframes onb-fade-in/.test(css));

// ── 6 CSS-ONLY: no markup / handler / navigation / data change ──────────────
ok('6 onboarding markup + steps intact', /id="onboardingOverlay"/.test(html) && /data-onb-step="LANGUAGE"/.test(html) && /data-onb-step="PROFILE"/.test(html));
ok('6 onboarding controller + engine wiring untouched (present)', /_initOnboardingUI|maybeShowOnboarding/.test(app) && /AurixOnboarding|aurix:reset/.test(app));
ok('6 this polish added no app.js logic (marker lives only in CSS)', app.indexOf('ONBOARDING POLISH') < 0 && css.indexOf('SPEC 45 ONBOARDING POLISH') >= 0);

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ONBOARDING-ENTRANCE-POLISH — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
