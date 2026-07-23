'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-EMAIL-EXPERIENCE-V1-harness — premium OTP email + automated welcome email
// ════════════════════════════════════════════════════════════════════════════
// Part 1: institutional OTP email (Supabase Auth template; code is the hero; no buttons/links; minimal
//         transactional footer — never leave the auth flow).
// Part 2: one-time welcome email ~30 min after a NEW user's first access (idempotent, only-new-accounts,
//         safe-by-default cron). Both reuse the ONE shared shell (structure/branding) — content only varies.
// No send here (verification is render + source guards; the actual OTP-template paste + cron arming are
// founder steps needing production credentials).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(root, f), 'utf8');
const shell = R('email/aurix-base-template.html');
const renderer = R('scripts/aurix-email.mjs');
const otp = R('email/aurix-otp-code.html');
const welcome = R('email/aurix-welcome.html');
const cron = R('api/cron/welcome-email.js');
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }
const ourSlots = h => (h.match(/\{\{[A-Z_]+\}\}/g) || []);   // OUR {{SLOT}} (Supabase {{ .Token }} has a space+dot)

console.log('AURIX-EMAIL-EXPERIENCE-V1\n');

// ── 0 ONE shared institutional shell (structure + branding, reusable) ────────
console.log('0 — one shared shell:');
ok('0 shell has the reusable action slot {{ACTION_BLOCK}} + {{FOOTER_NOTE}}', shell.includes('{{ACTION_BLOCK}}') && shell.includes('{{FOOTER_NOTE}}'));
ok('0 renderer exports renderEmail + ctaBlock + otpCodeBlock', /export function renderEmail/.test(renderer) && /export function ctaBlock/.test(renderer) && /export function otpCodeBlock/.test(renderer));
ok('0 dark palette + blue border shared by every email', /#030712/.test(shell) && /border:1px solid #2684FF/.test(shell) && /box-shadow:0 0 40px rgba\(38,132,255/.test(shell));
ok('0 AURIX wordmark in the shell header', />AURIX<\/span>/.test(shell));
ok('0 email-safe (no <script>, no remote fonts/CSS)', !/<script/i.test(shell) && !/@import|fonts\.googleapis|<link[^>]+stylesheet/i.test(shell));

// ── 1 OTP email (premium, functional) ────────────────────────────────────────
console.log('1 — OTP verification email:');
ok('1 title "Your verification code"', /Your verification code/.test(otp));
ok('1 exact security copy', /Use the verification code below to securely access your Aurix account\./.test(otp) && /Never share this code with anyone\./.test(otp));
ok('1 code is the hero (large, letter-spaced, high-contrast plate)', /letter-spacing:10px/.test(otp) && /font-size:40px/.test(otp));
ok('1 uses Supabase token variable {{ .Token }}', /\{\{ \.Token \}\}/.test(otp));
ok('1 NO buttons / NO opening links (no CTA in body)', !/v:roundrect/.test(otp) && !/aurix-cta-a">/.test(otp));
ok('1 transactional footer — NO unsubscribe / NO waitlist line', !/Unsubscribe/.test(otp) && !/waitlist/i.test(otp));
ok('1 no unresolved OUR slots', ourSlots(otp).length === 0, ourSlots(otp).join(','));
ok('1 renderOtpEmail sets footerNote empty + otp code block', /footerNote: ''/.test(renderer) && /actionBlock: otpCodeBlock\(codeVar\)/.test(renderer));

// ── 2 Welcome email (emotional, brand) ───────────────────────────────────────
console.log('2 — welcome email:');
ok('2 title "Welcome to Aurix."', /Welcome to Aurix\./.test(welcome));
['Thank you for joining us.', 'Today marks the beginning of your journey with Aurix.', 'Our mission is simple:', 'stocks, ETFs, funds, crypto, precious metals, real estate, cash and more', 'This is only the beginning.', 'new intelligence capabilities, financial tools', "We're grateful to have you with us from the very beginning."]
  .forEach(frag => ok('2 body: "' + frag.slice(0, 30) + '…"', welcome.includes(frag)));
ok('2 signature "The Aurix Team"', /The Aurix Team/.test(welcome));
ok('2 marketing footer with unsubscribe (opt-in email)', /Unsubscribe/.test(welcome));
ok('2 no CTA button (prose-only per approved content)', !/v:roundrect/.test(welcome) && !/aurix-cta-a">/.test(welcome));
ok('2 no unresolved OUR slots', ourSlots(welcome).length === 0, ourSlots(welcome).join(','));

// ── 3 welcome automation (trigger, timing, idempotency, safety) ──────────────
console.log('3 — welcome automation (cron):');
ok('3 campaign id aurix_welcome_v1', /aurix_welcome_v1/.test(cron));
ok('3 ~30 min after first access (DELAY_MS = 30*60*1000)', /DELAY_MS\s*=\s*30 \* 60 \* 1000/.test(cron) && /windowMax = now - DELAY_MS/.test(cron));
ok('3 trigger = first access via auth.users.created_at', /admin\/users/.test(cron) && /created = Date\.parse\(u\.created_at/.test(cron));
ok('3 ONLY new accounts (created_at >= WELCOME_FLOOR_AT → excludes existing/historical/waitlist)', /created < FLOOR\) continue;/.test(cron) && /WELCOME_FLOOR_AT/.test(cron));
ok('3 idempotent: check ledger status=sent before send; skip duplicate', /email_campaign_sends[\s\S]{0,90}status=eq\.sent/.test(cron) && /skipped_duplicate\+\+/.test(cron));
ok('3 records sent (with provider id) after Resend confirms', /send\.ok && data\?\.id/.test(cron) && /status: 'sent', provider_message_id: data\.id/.test(cron));
ok('3 SAFE by default — disabled unless WELCOME_CRON_ENABLED=true', /WELCOME_CRON_ENABLED !== 'true'\) return[\s\S]{0,60}disabled: true/.test(cron));
ok('3 dry mode (?dry=1) sends nothing', /const dry =[\s\S]{0,40}dry\b/.test(cron) && /if \(dry\) continue;/.test(cron));
ok('3 CRON_SECRET auth guard', /CRON_SECRET/.test(cron) && /unauthorized/.test(cron));
ok('3 reuses existing infra (Supabase admin + Resend + shared welcome template)', /api\.resend\.com\/emails/.test(cron) && /aurix-welcome\.html/.test(cron));
ok('3 GET-only serverless handler (Vercel ESM, matches api/ pattern)', /export default async function handler/.test(cron) && /method !== 'GET'/.test(cron));

// ── 4 cron wiring (vercel.json) ──────────────────────────────────────────────
console.log('4 — cron scheduling:');
const vj = JSON.parse(R('vercel.json'));
ok('4 vercel.json schedules /api/cron/welcome-email', Array.isArray(vj.crons) && vj.crons.some(c => c.path === '/api/cron/welcome-email' && /\*/.test(c.schedule)));
ok('4 function includes the email template (includeFiles)', vj.functions && vj.functions['api/cron/welcome-email.js'] && /email/.test(vj.functions['api/cron/welcome-email.js'].includeFiles));

// ── 5 auth flow untouched (no change to login/OTP send logic) ────────────────
console.log('5 — no auth/other-flow change:');
ok('5 login OTP logic present + untouched (signInWithOtp/verifyOtp)', /signInWithOtp/.test(R('login.html')) && /verifyOtp/.test(R('login.html')));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
