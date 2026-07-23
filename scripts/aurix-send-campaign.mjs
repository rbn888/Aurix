#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// AURIX-EMAIL-CAMPAIGN-1 — idempotent, safe mass sender for "Aurix is now live."
// ════════════════════════════════════════════════════════════════════════════
// Reuses the EXISTING infrastructure only — no new services:
//   • Waitlist source : Supabase public.waitlist  (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
//   • Provider        : Resend                      (RESEND_API_KEY + WAITLIST_FROM)
//   • Template        : email/aurix-base-template.html  (reusable base, slots injected here)
//   • Idempotency     : Supabase public.email_campaign_sends  (db/email_campaign_sends.sql)
//
// MODES (default is the SAFE one):
//   --dry-run   (DEFAULT) compute + print the eligible/excluded sets. NO send, NO writes.
//   --render    write the rendered launch email to email/aurix-launch-live.rendered.html and exit.
//   --test      send ONLY to the internal addresses in AURIX_TEST_EMAILS.
//   --send      full controlled mass send to the deduped, eligible, not-already-sent waitlist.
//
// SAFETY: recipients are sent INDIVIDUALLY (never BCC → never exposed to each other); before each
// send the ledger is checked (skip if already 'sent' for this campaign); a 'sent' row is written
// ONLY after Resend returns an id; batched with a rate limit; aborts if the provider error rate is
// abnormal; an immediate STOP is available by creating the file email/.campaign-stop.
//
// Usage:  node scripts/aurix-send-campaign.mjs --dry-run
//         node scripts/aurix-send-campaign.mjs --test
//         node scripts/aurix-send-campaign.mjs --send
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODE = process.argv.includes('--send') ? 'send'
           : process.argv.includes('--test') ? 'test'
           : process.argv.includes('--render') ? 'render'
           : 'dry-run';

const CAMPAIGN_ID   = process.env.CAMPAIGN_ID   || 'aurix_launch_live_2026_07_23';
const SUPABASE_URL  = process.env.SUPABASE_URL  || 'https://ozcasyufbknnuemllwso.supabase.co';
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const RESEND_KEY    = process.env.RESEND_API_KEY || '';
const FROM          = process.env.WAITLIST_FROM || 'Aurix <hello@aurixsystem.io>';
const UNSUB_BASE    = process.env.UNSUBSCRIBE_BASE || 'mailto:unsubscribe@aurixsystem.io?subject=unsubscribe';
const TEST_EMAILS   = (process.env.AURIX_TEST_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const BATCH_SIZE    = Number(process.env.CAMPAIGN_BATCH_SIZE || 40);
const RATE_MS       = Number(process.env.CAMPAIGN_RATE_MS || 600);   // ~1.6 req/s (within Resend limits)
const STOP_FILE     = path.join(ROOT, 'email', '.campaign-stop');

// ── Exact approved campaign content (do NOT alter the meaning) ────────────────
const SUBJECT   = 'Aurix is now live.';
const PREHEADER = 'The wait is over. Your access to Aurix is now ready.';
const TITLE     = 'Aurix is now live.';
const CTA_TEXT  = 'Enter Aurix →';
const CTA_URL   = 'https://aurixsystem.io';
const FALLBACK  = 'https://aurixsystem.io';
const CLOSING   = 'See you inside.';
const BODY_PARAS = [
  'The wait is over.',
  'Aurix is officially open, and you can now access the platform.',
  'From today, you can bring your entire wealth together in one private platform—track stocks, ETFs, funds, crypto, precious metals, real estate, cash and more, all from a single place.',
  'This is just the beginning. Aurix will continue to evolve with new intelligence features, financial tools and powerful capabilities over the coming months.',
  'Thank you for being part of our journey from the very beginning.',
  'Your access is now ready.',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPPRESSED_STATUS = new Set(['unsubscribed', 'suppressed', 'bounced', 'complained', 'archived', 'deleted', 'blocked']);
const INTERNAL_RE = /(@example\.|@test\.|\+test@|^test@|noreply@|no-reply@|@aurixsystem\.io$)/i;  // internal/test guard (mass mode)

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function normalizeEmail(e) { return String(e || '').trim().toLowerCase(); }

function renderHtml(unsubscribeUrl) {
  const tpl = fs.readFileSync(path.join(ROOT, 'email', 'aurix-base-template.html'), 'utf8');
  const bodyHtml = BODY_PARAS.map(p => `<p style="margin:0 0 16px 0;">${esc(p)}</p>`).join('\n              ');
  const out = tpl
    .replaceAll('{{PREHEADER}}', esc(PREHEADER))
    .replaceAll('{{TITLE}}', esc(TITLE))
    .replaceAll('{{BODY_HTML}}', bodyHtml)
    .replaceAll('{{CTA_TEXT}}', esc(CTA_TEXT))
    .replaceAll('{{CTA_URL}}', CTA_URL)
    .replaceAll('{{FALLBACK_URL}}', esc(FALLBACK))
    .replaceAll('{{CLOSING}}', esc(CLOSING))
    .replaceAll('{{UNSUBSCRIBE_URL}}', unsubscribeUrl)
    .replaceAll('{{YEAR}}', '2026');
  return out;
}
function plainText() {
  return `${TITLE}\n\n${BODY_PARAS.join('\n\n')}\n\n${CTA_TEXT} ${CTA_URL}\n${FALLBACK}\n\n${CLOSING}\n\nThe Aurix Team`;
}

async function sb(pathq, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathq}`, {
    ...opts,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  return res;
}
async function fetchWaitlist() {
  const res = await sb('waitlist?select=email,status,notes&limit=100000');
  if (!res.ok) throw new Error('waitlist read failed: ' + res.status);
  return res.json();
}
async function alreadySent(email) {
  const res = await sb(`email_campaign_sends?select=email&campaign_id=eq.${encodeURIComponent(CAMPAIGN_ID)}&email=eq.${encodeURIComponent(email)}&status=eq.sent&limit=1`);
  if (!res.ok) return false;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}
async function logSend(email, status, providerMessageId, error) {
  try {
    await sb('email_campaign_sends', { method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ campaign_id: CAMPAIGN_ID, email, status, provider_message_id: providerMessageId || null, error: error || null }) });
  } catch (_) { /* logging must never crash the run */ }
}
async function sendOne(email, html, text) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM, to: [email], subject: SUBJECT, html, text,
      headers: { 'List-Unsubscribe': `<${UNSUB_BASE}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data && data.id) return { ok: true, id: data.id };
  // 429 / 5xx → retryable; 4xx (invalid) → permanent.
  return { ok: false, retryable: res.status === 429 || res.status >= 500, error: (data && (data.message || data.error)) || ('http_' + res.status) };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log(`\nAURIX campaign · id=${CAMPAIGN_ID} · mode=${MODE}\n`);

  // ── render mode: no network, no creds needed ──
  if (MODE === 'render') {
    const outPath = path.join(ROOT, 'email', 'aurix-launch-live.rendered.html');
    fs.writeFileSync(outPath, renderHtml(UNSUB_BASE));
    const unresolved = (fs.readFileSync(outPath, 'utf8').match(/\{\{[A-Z_]+\}\}/g) || []);
    console.log('rendered →', path.relative(ROOT, outPath));
    console.log('unresolved slots:', unresolved.length ? unresolved.join(',') : 'NONE ✓');
    console.log('subject:', SUBJECT, '| preheader:', PREHEADER, '| cta:', CTA_TEXT, '→', CTA_URL);
    process.exit(unresolved.length ? 1 : 0);
  }

  if (!SERVICE_KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY not set — cannot read the waitlist. Aborting (no send).'); process.exit(2); }
  if (MODE !== 'dry-run' && !RESEND_KEY) { console.error('RESEND_API_KEY not set — refusing to send. Aborting.'); process.exit(2); }

  // ── build the eligible, deduped recipient set ──
  const rows = await fetchWaitlist();
  const seen = new Set();
  const eligible = [];
  const counts = { found: rows.length, invalid: 0, suppressed: 0, internal: 0, duplicate: 0 };
  for (const r of rows) {
    const email = normalizeEmail(r.email);
    if (!EMAIL_RE.test(email)) { counts.invalid++; continue; }
    if (SUPPRESSED_STATUS.has(String(r.status || '').toLowerCase())) { counts.suppressed++; continue; }
    if (MODE !== 'test' && INTERNAL_RE.test(email)) { counts.internal++; continue; }
    if (seen.has(email)) { counts.duplicate++; continue; }
    seen.add(email);
    eligible.push(email);
  }

  let recipients = eligible;
  if (MODE === 'test') {
    if (!TEST_EMAILS.length) { console.error('AURIX_TEST_EMAILS not set — nothing to test-send. Aborting.'); process.exit(2); }
    recipients = TEST_EMAILS.filter(e => EMAIL_RE.test(e));
    console.log('TEST MODE → sending only to internal addresses:', recipients.join(', '));
  }

  console.log('waitlist found      :', counts.found);
  console.log('excluded invalid    :', counts.invalid);
  console.log('excluded suppressed :', counts.suppressed);
  console.log('excluded internal   :', counts.internal);
  console.log('excluded duplicate  :', counts.duplicate);
  console.log('eligible (deduped)  :', eligible.length);

  if (MODE === 'dry-run') {
    // Also report how many are already sent (idempotency preview) without sending.
    let already = 0;
    for (const e of eligible) { if (await alreadySent(e)) already++; }
    console.log('already sent (skip) :', already);
    console.log('would send now      :', eligible.length - already);
    console.log('\nDRY RUN — no email sent, no rows written. Re-run with --test then --send.');
    process.exit(0);
  }

  // ── controlled send ──
  const stats = { sent: 0, skipped_duplicate: 0, failed_retryable: 0, failed_permanent: 0 };
  let windowErrors = 0, windowTotal = 0;
  for (let i = 0; i < recipients.length; i++) {
    if (fs.existsSync(STOP_FILE)) { console.error(`\nSTOP file present (${path.relative(ROOT, STOP_FILE)}) — halting pending batches at ${i}/${recipients.length}.`); break; }
    const email = recipients[i];
    if (MODE === 'send' && await alreadySent(email)) { stats.skipped_duplicate++; await logSend(email, 'skipped_duplicate'); continue; }

    const unsub = UNSUB_BASE + (UNSUB_BASE.includes('?') ? '&' : '?') + 'e=' + encodeURIComponent(email);
    const r = await sendOne(email, renderHtml(unsub), plainText());
    windowTotal++;
    if (r.ok) { stats.sent++; if (MODE === 'send') await logSend(email, 'sent', r.id); }
    else if (r.retryable) { stats.failed_retryable++; windowErrors++; if (MODE === 'send') await logSend(email, 'failed_retryable', null, r.error); }
    else { stats.failed_permanent++; windowErrors++; if (MODE === 'send') await logSend(email, 'failed_permanent', null, r.error); }

    // Abnormal error-rate circuit breaker (per 25-send window).
    if (windowTotal >= 25) {
      if (windowErrors / windowTotal > 0.25) { console.error(`\nABORT — provider error rate ${(windowErrors / windowTotal * 100).toFixed(0)}% over last ${windowTotal}. Stopping to protect deliverability. Re-run to resume (idempotent).`); break; }
      windowErrors = 0; windowTotal = 0;
    }
    await sleep(RATE_MS);
    if ((i + 1) % BATCH_SIZE === 0) { console.log(`  …batch ${Math.ceil((i + 1) / BATCH_SIZE)} done (${i + 1}/${recipients.length})`); await sleep(RATE_MS * 2); }
  }

  console.log('\nRESULT:', JSON.stringify(stats, null, 2));
  console.log('campaign_id:', CAMPAIGN_ID, '| idempotent: re-run sends only pending/failed-retryable.');
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e && e.message); process.exit(1); });
