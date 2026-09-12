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
ok('1 code is the hero (large, letter-spaced, high-contrast plate)', /letter-spacing:6px/.test(otp) && /font-size:34px/.test(otp));
// P0 — the code must NEVER split across lines on mobile. A numeric code is one unbreakable word, so a
// browser overflows rather than wraps; Gmail (mobile app + web) injects word-break/overflow-wrap on
// content that reaches the edge, and THAT is what split it. Measured with an injected
// `word-break:break-all`, the old 40px/10px code broke into 2 lines at 320/375/390px; 34px/6px holds one
// line at every width. Both defences are pinned: the inline nowrap (outranks an injected class rule) and
// the size that keeps the code clear of the edge in the first place.
ok('1 P0 code can never wrap (inline nowrap + break guards)',
   /white-space:nowrap/.test(otp) && /word-break:keep-all/.test(otp) && /overflow-wrap:normal/.test(otp));
ok('1 P0 headroom: code sized well inside the plate (≤34px, ≤6px tracking)',
   !/font-size:(3[5-9]|[4-9]\d)px/.test(otp) && !/letter-spacing:([7-9]|\d{2,})px/.test(otp));
ok('1 uses Supabase token variable {{ .Token }}', /\{\{ \.Token \}\}/.test(otp));
ok('1 NO buttons / NO opening links (no CTA in body)', !/v:roundrect/.test(otp) && !/aurix-cta-a">/.test(otp));
ok('1 transactional footer — NO unsubscribe / NO waitlist line', !/Unsubscribe/.test(otp) && !/waitlist/i.test(otp));
ok('1 no unresolved OUR slots', ourSlots(otp).length === 0, ourSlots(otp).join(','));
ok('1 renderOtpEmail sets footerNote empty + otp code block', /footerNote: ''/.test(renderer) && /actionBlock: otpCodeBlock\(codeVar\)/.test(renderer));

// ── 2 Welcome email (emotional, brand) ───────────────────────────────────────
console.log('2 — welcome email:');
ok('2 title "Welcome to Aurix."', /Welcome to Aurix\./.test(welcome));
// Tightened to 4 paragraphs / ~60 words (was 7 / ~95) — same message, reads in seconds.
['Thank you for joining us. Your journey with Aurix begins today.', 'Our mission is simple:', 'stocks, ETFs, funds, crypto, precious metals, real estate and cash', 'This is only the beginning:']
  .forEach(frag => ok('2 body: "' + frag.slice(0, 30) + '…"', welcome.includes(frag)));
ok('2 body reduced ~30–40% vs the original 7 paragraphs', (welcome.match(/<p style="margin:0 0 16px 0;">/g) || []).length === 4);
ok('2 signature "The Aurix Team"', /The Aurix Team/.test(welcome));
// TRANSACTIONAL (triggered by the user's own registration), not an opt-in campaign: no unsubscribe, and
// no "you joined the waitlist" line — which was also untrue for someone who had just signed up. The launch
// campaign keeps marketingFooter(), asserted in AURIX-LAUNCH-EMAIL-CAMPAIGN.
ok('2 transactional footer — NO unsubscribe, NO waitlist line', !/Unsubscribe/.test(welcome) && !/joined the Aurix waitlist/i.test(welcome));
ok('2 primary CTA present (the reader had nowhere to go)', /aurix-cta-a/.test(welcome) && /Enter Aurix/.test(welcome) && /https:\/\/app\.aurixsystem\.io/.test(welcome));
ok('2 duplicate "Welcome to Aurix." above the footer removed (title + <title> only)',
   (welcome.match(/Welcome to Aurix\./g) || []).length === 2 && !/>Welcome to Aurix\.<\/td>/.test(welcome));
ok('2 no unresolved OUR slots', ourSlots(welcome).length === 0, ourSlots(welcome).join(','));
// Both shipped artefacts must stay byte-identical to the shared renderer — no hand-edited drift.
ok('2 artefacts are exactly the renderer output (single owner, no drift)', (() => {
  try {
    const { execFileSync } = require('child_process');
    const out = execFileSync(process.execPath, ['--input-type=module', '-e',
      "import{renderOtpEmail,renderWelcomeEmail}from'./scripts/aurix-email.mjs';" +
      "import fs from 'node:fs';" +
      "process.stdout.write(String(renderOtpEmail()===fs.readFileSync('email/aurix-otp-code.html','utf8'))+','+String(renderWelcomeEmail()===fs.readFileSync('email/aurix-welcome.html','utf8'))+','+String(renderWelcomeEmail('es')===fs.readFileSync('email/aurix-welcome-es.html','utf8')));"],
      { cwd: root, encoding: 'utf8' });
    return out.trim() === 'true,true,true';
  } catch (e) { return false; }
})());

// ── 3 welcome automation (trigger, timing, idempotency, safety) ──────────────
console.log('3 — welcome automation (cron):');
ok('3 campaign id aurix_welcome_v1', /aurix_welcome_v1/.test(cron));
ok('3 ~30 min after first access (DELAY_MS = 30*60*1000)', /DELAY_MS\s*=\s*30 \* 60 \* 1000/.test(cron) && /windowMax = now - DELAY_MS/.test(cron));
ok('3 trigger = first access via auth.users.created_at', /admin\/users/.test(cron) && /created = Date\.parse\(u\.created_at/.test(cron));
// M.06 · P0 — ESTOS DOS ASSERTS CERTIFICABAN EL DEFECTO. Describían literalmente el patrón
// que mandaba una bienvenida cada 15 minutos: «comprueba el libro antes de enviar» (una lectura
// FAIL-OPEN, que ante un error concluía "nunca enviada" y enviaba) y «registra después de que
// Resend confirme» (claim-after-send: perder el registro = reenvío en la pasada siguiente, para
// siempre). El contrato correcto es RESERVA ANTES DEL ENVÍO sobre el índice único parcial, y
// FAIL-CLOSED en toda lectura. Se EJECUTA en AURIX-M06-ONBOARDING-LANGUAGE-EMAIL; aquí sólo se
// pinan las señales de fuente para que el patrón viejo no pueda volver.
// Las aserciones NEGATIVAS se evalúan sobre el código SIN comentarios: la cabecera del fichero
// cita a propósito los patrones retirados para documentar el defecto, y no deben dar falso positivo.
const cronCode = cron.replace(/^\s*\/\/.*$/gm, '');
ok('3 ONLY new accounts — suelo DURO en código; el env sólo puede subirlo',
   /const ACCOUNT_EPOCH_MS = Date\.parse\('/.test(cron) &&
   /FLOOR\s*=\s*Math\.max\(ACCOUNT_EPOCH_MS,\s*Date\.parse\(process\.env\.WELCOME_FLOOR_AT/.test(cron) &&
   /created < FLOOR\)\s*continue;/.test(cron));
ok('3 idempotencia IMPUESTA: reserva atómica ANTES del envío (índice único parcial)',
   cron.indexOf("status: 'sent' }") < cron.indexOf('api.resend.com/emails') &&
   /claim\.status === 409/.test(cron) && /skipped_duplicate\+\+/.test(cron));
ok('3 FAIL-CLOSED: sin prueba de que no se envió, no se envía',
   /return Array\.isArray\(j\) \? j : null;/.test(cron) &&
   (cron.match(/stats\.skipped_unverified\+\+/g) || []).length >= 4 &&
   !/q\.ok \? await q\.json\(\) : \[\]/.test(cronCode));
ok('3 un fallo TRANSITORIO libera la reserva; un 4xx permanente no se reintenta; y un 2xx sin id no la libera',
   /retryable\s*=\s*st >= 500 \|\| st === 429 \|\| st === 401 \|\| st === 403/.test(cron) &&
   /status: retryable \? 'failed_retryable' : 'sent'/.test(cron) &&
   /if \(send\.ok\) \{/.test(cron) && !/send\.ok && data\?\.id/.test(cronCode));
ok('3 un solo libro para los DOS senders (el otro es api/waitlist.js)',
   /welcome_email_sent_at,locale/.test(cron) && /skipped_other_sender\+\+/.test(cron));
ok('3 SAFE by default — disabled unless WELCOME_CRON_ENABLED=true', /WELCOME_CRON_ENABLED !== 'true'\) return[\s\S]{0,60}disabled: true/.test(cron));
ok('3 dry mode (?dry=1) sends nothing', /const dry =[\s\S]{0,40}dry\b/.test(cron) && /if \(dry\) continue;/.test(cron));
ok('3 CRON_SECRET auth guard', /CRON_SECRET/.test(cron) && /unauthorized/.test(cron));
ok('3 reuses existing infra (Supabase admin + Resend + shared welcome template)', /api\.resend\.com\/emails/.test(cron) && /aurix-welcome\.html/.test(cron));
ok('3 GET-only serverless handler (Vercel ESM, matches api/ pattern)', /export default async function handler/.test(cron) && /method !== 'GET'/.test(cron));

// ── 4 cron scheduling (founder-configured on Vercel; NOT in repo vercel.json) ──
console.log('4 — cron scheduling:');
// Vercel Cron cadence + includeFiles are configured by the founder on Vercel (plan-dependent: */15
// needs Pro) — kept OUT of the committed vercel.json so it never breaks the shared build. The endpoint
// is a standard, deployable serverless function usable by a Vercel Cron OR a manual/dashboard trigger.
ok('4 repo vercel.json is valid JSON (no plan-limited cron that would break the build)', (() => { try { JSON.parse(R('vercel.json')); return true; } catch (_) { return false; } })());
ok('4 cron endpoint is a deployable serverless GET function', /export default async function handler/.test(cron) && /req\.method !== 'GET'/.test(cron));

// ── 5 auth flow untouched (no change to login/OTP send logic) ────────────────
console.log('5 — no auth/other-flow change:');
ok('5 login OTP logic present + untouched (signInWithOtp/verifyOtp)', /signInWithOtp/.test(R('login.html')) && /verifyOtp/.test(R('login.html')));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
