'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-PUBLIC-LAUNCH-ACTIVATION-harness — SPEC LANZAMIENTO 1
// ════════════════════════════════════════════════════════════════════════════
// Public access opens automatically at a FIXED UTC timestamp (Thu 23 Jul 2026
// 19:00 Europe/Madrid = 2026-07-23T17:00:00.000Z). Before it: landing shows a
// single "Enter Aurix" CTA, disabled, with only the remaining HOURS; the app OTP
// stays invite-gated (private). At the timestamp the CTA enables and the app OTP
// opens to everyone — no reload, no deploy. Rollback: PUBLIC_LAUNCH_ENABLED=false.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const lApp = fs.readFileSync(path.join(root, 'landing', 'app.js'), 'utf8');
const lHtml = fs.readFileSync(path.join(root, 'landing', 'index.html'), 'utf8');
const lCss = fs.readFileSync(path.join(root, 'landing', 'styles.css'), 'utf8');
const login = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, i) => { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } };
const AT = '2026-07-23T17:00:00.000Z';

console.log('AURIX-PUBLIC-LAUNCH-ACTIVATION — SPEC LANZAMIENTO 1\n');

// ── 1. SINGLE FIXED TIMESTAMP, synced across both deploys ───────────────────
ok('1 landing config: PUBLIC_LAUNCH_AT fixed UTC + ENABLED true',
  lApp.includes("PUBLIC_LAUNCH_AT      = '" + AT + "'") && /PUBLIC_LAUNCH_ENABLED\s*=\s*true/.test(lApp));
ok('1 app(login) config: same PUBLIC_LAUNCH_AT + ENABLED true (in sync)',
  login.includes("PUBLIC_LAUNCH_AT       = '" + AT + "'") && /PUBLIC_LAUNCH_ENABLED\s*=\s*true/.test(login));
ok('2 open logic is enabled && now>=AT in both surfaces',
  /PUBLIC_LAUNCH_ENABLED === true && Date\.now\(\) >= PUBLIC_LAUNCH_AT_MS/.test(lApp) &&
  /PUBLIC_LAUNCH_ENABLED === true && Date\.now\(\) >= PUBLIC_LAUNCH_AT_MS/.test(login));
ok('3 launch time is NOT computed from deploy time and NOT stored in localStorage',
  !/24\s*\*\s*60\s*60\s*1000|Date\.now\(\)\s*\+\s*24/.test(lApp) && !/localStorage[^\n]*launch/i.test(lApp) && !/localStorage[^\n]*launch/i.test(login));

// ── 2. LANDING — single "Enter Aurix" CTA, no public "Request Access" ───────
ok('4 landing header CTA is a single Enter Aurix (cta.enter) with the launch gate hook',
  /data-launch-cta[^>]*data-i18n="cta\.enter"|data-i18n="cta\.enter"[^>]*data-launch-cta/.test(lHtml));
ok('5 no "Request Access" (cta.request) remains as a header / hero / mobile-actions CTA',
  !/mobile-actions[\s\S]{0,160}cta\.request/.test(lHtml) && !/header-right[\s\S]{0,160}cta\.request/.test(lHtml) && !/hero-cta-mobile[\s\S]{0,160}cta\.request/.test(lHtml));
ok('6 launch CTAs carry data-launch-cta (gate hook) — at least the header + hero + mobile',
  (lHtml.match(/data-launch-cta/g) || []).length >= 3);

// ── 3. COUNTDOWN — hours only, ceil, discreet, i18n ES+EN ───────────────────
ok('7 countdown element #launchCountdown exists (starts hidden)',
  /id="launchCountdown"[^>]*hidden|hidden[^>]*id="launchCountdown"/.test(lHtml));
ok('8 i18n launch.count present ES + EN and shows only hours (X h, no days/min/sec)',
  /'launch\.count':\s*'Lanzamiento en \{h\} h'/.test(lApp) && /'launch\.count':\s*'Launching in \{h\} h'/.test(lApp));
ok('9 remaining uses Math.ceil so it never shows 0 h while still closed',
  /Math\.max\(0,\s*Math\.ceil\(\(PUBLIC_LAUNCH_AT_MS - Date\.now\(\)\) \/ 3600000\)\)/.test(lApp));
ok('10 no days/minutes/seconds countdown unit introduced',
  !/\{d\}\s*d|\{m\}\s*min|\{s\}\s*s\b|days? remaining|d\s*:\s*h\s*:\s*m/i.test(lApp.replace(/getElementById\('[^']*'\)/g, '')));

// ── 4. LANDING GATE — lock before, auto-enable after, robust recompute ──────
ok('11 gate locks CTA before launch (aria-disabled + is-launch-locked + href neutralised)',
  /setAttribute\('aria-disabled', 'true'\)/.test(lApp) && /classList\.add\('is-launch-locked'\)/.test(lApp) && /setAttribute\('href', '#'\)/.test(lApp));
ok('12 capture-phase click guard cancels activation of a locked CTA (protection beyond visual)',
  /addEventListener\('click', function \(e\) \{[\s\S]{0,200}data-launch-cta[\s\S]{0,120}!isPublicLaunchOpen\(\)[\s\S]{0,60}preventDefault/.test(lApp));
ok('13 auto-enable: gate re-runs on a timer + visibility + focus + pageshow (no reload needed)',
  /setTimeout\(applyLaunchGate/.test(lApp) && /visibilitychange[\s\S]{0,80}applyLaunchGate/.test(lApp) && /'focus', applyLaunchGate/.test(lApp) && /'pageshow', applyLaunchGate/.test(lApp));
ok('14 locked-CTA CSS is real (pointer-events:none + disabled look)',
  /\.btn\.is-launch-locked\s*\{[^}]*pointer-events:\s*none/.test(lCss));

// ── 5. APP OTP GATE (login.html) — public opens at launch, private preserved ─
ok('15 second-check gate before OTP send (blocks public with no invite until launch)',
  /if \(!isPublicLaunchOpen\(\) && authSection\.classList\.contains\('locked'\)\) return;/.test(login));
ok('16 post-launch: email/OTP unlocked for everyone + invite UI hidden + public copy',
  /function _applyPublicLaunchAccess\(\)[\s\S]{0,400}unlockAuth\(\)[\s\S]{0,400}invite-section[\s\S]{0,200}display = 'none'/.test(login) &&
  /lg\.publicAccess/.test(login) && /lg\.publicHint/.test(login));
ok('17 launch access re-checked on visibility/focus (device suspended across launch)',
  /visibilitychange[\s\S]{0,80}_applyPublicLaunchAccess\(\)/.test(login) && /'focus', _applyPublicLaunchAccess/.test(login));
ok('18 PRIVATE path preserved: invite RPC + email lock unchanged (pre-launch = private)',
  /validate_invite_code/.test(login) && /function lockAuth\(\)/.test(login) && /class="auth-section locked"/.test(login));
ok('19 OTP engine reused unchanged (signInWithOtp shouldCreateUser + verifyOtp)',
  /signInWithOtp\(\{[\s\S]{0,80}shouldCreateUser: true/.test(login) && /verifyOtp\(/.test(login));
ok('20 public i18n copy present ES + EN (Accede a Aurix / Access Aurix)',
  /'lg\.publicAccess':\s*'Accede a Aurix'/.test(login) && /'lg\.publicAccess':\s*'Access Aurix'/.test(login));

// ── 6. ROLLBACK — single flag ───────────────────────────────────────────────
ok('21 rollback is a single flag (PUBLIC_LAUNCH_ENABLED) in each surface',
  /PUBLIC_LAUNCH_ENABLED\s*=\s*true/.test(lApp) && /PUBLIC_LAUNCH_ENABLED\s*=\s*true/.test(login));

// ── 7. PURE-LOGIC SIMULATIONS ───────────────────────────────────────────────
(function () {
  const atMs = Date.parse(AT);
  const open = (enabled, now) => enabled === true && now >= atMs;
  const hours = (now) => Math.max(0, Math.ceil((atMs - now) / 3600000));
  ok('22 SIM before launch → closed, hours>0 (never 0 while closed)',
    open(true, atMs - 3600000) === false && hours(atMs - 1) === 1 && hours(atMs - 3600000) === 1);
  ok('23 SIM at/after launch → open, hours 0',
    open(true, atMs) === true && open(true, atMs + 1) === true && hours(atMs) === 0);
  ok('24 SIM disabled flag → closed even after AT (rollback)',
    open(false, atMs + 999999) === false);
})();

// ── 8. LANDING POLISH (final) — single desktop CTA, no Early Access, toast ──
ok('25 desktop single CTA: Hero CTA is mobile-only (no duplicate Enter Aurix on desktop)',
  /\.hero-cta-mobile\s*\{\s*display:\s*none;\s*\}/.test(lCss));
ok('26 "Early Access" removed from public nav (no nav.early link remains)',
  !/data-i18n="nav\.early"/.test(lHtml));
ok('27 locked navbar CTA shows an elegant toast reusing launch.count (no alert/modal)',
  /function showLaunchToast\(\)/.test(lApp) && /_launchToastEl[\s\S]{0,220}t\('launch\.count'\)/.test(lApp) && !/\balert\(/.test(lApp));
ok('28 toast scoped to the navbar CTA (.header-right) — mobile Hero CTA behaviour unchanged',
  /closest\('\.header-right'\)\)\s*showLaunchToast\(\)/.test(lApp));
ok('29 toast is a small fixed pill, not a full-screen modal/overlay',
  /\.launch-toast\s*\{[^}]*position:\s*fixed/.test(lCss) && !/\.launch-toast\s*\{[^}]*inset:\s*0/.test(lCss));
// private/invite path still reachable in markup (section kept; only the nav link removed)
ok('30 private access REMOVED from landing (HOTFIX LANDING — public launch complete, Aurix open to all: no Private Beta section, modal or Request-Access CTA)',
  !/id="early-access"/.test(lHtml) && !/id="accessModal"/.test(lHtml) && !/id="openModal"/.test(lHtml));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('GATE: GO — all ' + pass + ' assertions passed');
process.exit(0);
