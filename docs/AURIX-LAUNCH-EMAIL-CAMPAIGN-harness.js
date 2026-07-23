'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-LAUNCH-EMAIL-CAMPAIGN-harness — SPEC "Aurix is now live." campaign
// ════════════════════════════════════════════════════════════════════════════
// Validates the reusable institutional template, the exact approved content, and the safety guards of
// the idempotent sender — WITHOUT sending anything (no network, no credentials). The actual send is
// a human-triggered, irreversible action (run scripts/aurix-send-campaign.mjs with production env).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(root, 'email', 'aurix-base-template.html'), 'utf8');
const scr = fs.readFileSync(path.join(root, 'scripts', 'aurix-send-campaign.mjs'), 'utf8');
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

console.log('AURIX-LAUNCH-EMAIL-CAMPAIGN — SPEC\n');

// ── 1 reusable institutional template ────────────────────────────────────────
console.log('1 — reusable base template:');
// Shared shell slots (V1: CTA/fallback/unsubscribe moved into the renderer's ACTION_BLOCK / FOOTER_NOTE).
['{{PREHEADER}}', '{{TITLE}}', '{{BODY_HTML}}', '{{ACTION_BLOCK}}', '{{CLOSING}}', '{{FOOTER_NOTE}}', '{{YEAR}}']
  .forEach(slot => ok('1 slot present ' + slot, tpl.includes(slot)));
ok('1 email-safe: no <script>', !/<script/i.test(tpl));
ok('1 email-safe: no remote fonts/CSS/img (no https link/@import/remote src)', !/@import|fonts\.googleapis|<link[^>]+stylesheet|src=["']https?:/i.test(tpl));
ok('1 dark palette tokens (#030712 bg, #080D18 surface, #2684FF electric)', /#030712/.test(tpl) && /#080D18/.test(tpl) && /#2684FF/.test(tpl));
ok('1 container 600px, blue border + subtle blue shadow', /max-width:600px/.test(tpl) && /border:1px solid #2684FF/.test(tpl) && /box-shadow:0 0 40px rgba\(38,132,255/.test(tpl));
ok('1 Outlook bulletproof CTA (VML roundrect in shared renderer ctaBlock)', /v:roundrect/.test(fs.readFileSync(path.join(root, 'scripts', 'aurix-email.mjs'), 'utf8')));
ok('1 preheader is hidden (display:none)', /display:none;[^"]*mso-hide:all/.test(tpl));
ok('1 wordmark AURIX in header', /letter-spacing:4px[^>]*>?[\s\S]{0,40}AURIX|>AURIX<\/span>/.test(tpl));

// ── 2 exact approved content (meaning unaltered) ─────────────────────────────
console.log('2 — exact campaign content:');
ok('2 subject "Aurix is now live."', /const SUBJECT\s*=\s*'Aurix is now live\.'/.test(scr));
ok('2 preheader exact', /const PREHEADER\s*=\s*'The wait is over\. Your access to Aurix is now ready\.'/.test(scr));
ok('2 title "Aurix is now live."', /const TITLE\s*=\s*'Aurix is now live\.'/.test(scr));
ok('2 CTA text "Enter Aurix →"', /const CTA_TEXT\s*=\s*'Enter Aurix →'/.test(scr));
ok('2 CTA + fallback URL = https://aurixsystem.io', /const CTA_URL\s*=\s*'https:\/\/aurixsystem\.io'/.test(scr) && /const FALLBACK\s*=\s*'https:\/\/aurixsystem\.io'/.test(scr));
ok('2 closing "See you inside."', /const CLOSING\s*=\s*'See you inside\.'/.test(scr));
['The wait is over.', 'Aurix is officially open, and you can now access the platform.', 'stocks, ETFs, funds, crypto, precious metals, real estate, cash', 'This is just the beginning.', 'Thank you for being part of our journey from the very beginning.', 'Your access is now ready.']
  .forEach(frag => ok('2 body contains: "' + frag.slice(0, 32) + '…"', scr.includes(frag)));
ok('2 no emojis / no discount / no urgency copy', !/😀|🚀|🔥|discount|% off|hurry|limited time|act now/i.test(scr));

// ── 3 rendered launch email (committed preview) has NO unresolved slots + exact content ──
console.log('3 — rendered launch email (no unresolved slots):');
const rendered = fs.readFileSync(path.join(root, 'email', 'aurix-launch-live.rendered.html'), 'utf8');
ok('3 zero unresolved {{SLOT}} in the rendered launch email', (rendered.match(/\{\{[A-Z_]+\}\}/g) || []).length === 0);
ok('3 rendered launch shows the CTA + fallback URL', /Enter Aurix/.test(rendered) && /https:\/\/aurixsystem\.io/.test(rendered));

// ── 4 safety + idempotency guards in the sender ──────────────────────────────
console.log('4 — sender safety & idempotency:');
ok('4 campaign id aurix_launch_live_2026_07_23', /aurix_launch_live_2026_07_23/.test(scr));
ok('4 default mode is the SAFE dry-run (send/test/render opt-in)', /: 'dry-run'/.test(scr) && /--send/.test(scr) && /--test/.test(scr));
ok('4 normalize (trim + lowercase) + dedupe by normalized email', /trim\(\)\.toLowerCase\(\)/.test(scr) && /seen\.has\(email\)/.test(scr) && /seen\.add\(email\)/.test(scr));
ok('4 suppression exclusion set (unsubscribed/bounced/complained/…)', /SUPPRESSED_STATUS/.test(scr) && /unsubscribed[\s\S]{0,80}complained/.test(scr));
ok('4 invalid-email exclusion', /EMAIL_RE\.test\(email\)/.test(scr));
ok('4 internal/test exclusion in mass mode', /INTERNAL_RE/.test(scr));
ok('4 idempotency: check ledger before send', /alreadySent\(email\)/.test(scr) && /status=eq\.sent/.test(scr));
ok('4 idempotency: mark sent ONLY after provider id', /r\.ok[\s\S]{0,80}logSend\(email, 'sent', r\.id\)/.test(scr));
ok('4 recipients sent INDIVIDUALLY (no BCC mass)', /to: \[email\]/.test(scr) && !/\bbcc:/i.test(scr));
ok('4 List-Unsubscribe header present', /List-Unsubscribe/.test(scr));
ok('4 rate limit + batch pacing', /RATE_MS/.test(scr) && /BATCH_SIZE/.test(scr) && /sleep\(RATE_MS\)/.test(scr));
ok('4 abnormal error-rate circuit breaker', /windowErrors \/ windowTotal > 0\.25/.test(scr));
ok('4 immediate STOP file to halt pending batches', /STOP_FILE/.test(scr) && /\.campaign-stop/.test(scr));
ok('4 refuses to send without RESEND_API_KEY', /RESEND_API_KEY not set/.test(scr) && /refusing to send/.test(scr));
ok('4 reuses existing infra only (Supabase waitlist + Resend, no new service)', /rest\/v1\/\$\{pathq\}/.test(scr) && /sb\('waitlist\?select/.test(scr) && /api\.resend\.com\/emails/.test(scr));
ok('4 ledger writes only safe fields (no secrets/credentials)',
   /body: JSON\.stringify\(\{ campaign_id: CAMPAIGN_ID, email, status, provider_message_id: providerMessageId \|\| null, error: error \|\| null \}\)/.test(scr));

// ── 5 idempotency ledger schema ──────────────────────────────────────────────
console.log('5 — idempotency ledger (db):');
const sql = fs.readFileSync(path.join(root, 'db', 'email_campaign_sends.sql'), 'utf8');
ok('5 table email_campaign_sends', /create table if not exists public\.email_campaign_sends/.test(sql));
ok('5 unique (campaign_id, email) where status=sent', /unique index[\s\S]{0,160}\(campaign_id, email\)[\s\S]{0,60}where status = 'sent'/.test(sql));
ok('5 RLS enabled, service-role only (no policies)', /enable row level security/.test(sql) && !/create policy/i.test(sql));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
