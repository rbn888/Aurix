// GET /api/cron/welcome-email   (drive with a Vercel Cron ~every 15 min, or a manual/dashboard trigger)
// NOTE: the cron schedule + `functions.includeFiles: "email/**"` are configured by the founder on Vercel
// when arming (kept OUT of the committed vercel.json — a */15 cron needs a Pro plan and would otherwise
// fail the shared build). includeFiles is required so this function can read email/aurix-welcome.html.
// ════════════════════════════════════════════════════════════════════════════
// AURIX-EMAIL-EXPERIENCE-V1 · one-time welcome email, ~30 min after a NEW user's
// first successful access. Trigger proxy = auth.users.created_at (a Supabase Auth
// account is created on the first successful verifyOtp → created_at ≈ first access).
//
// SAFE BY DEFAULT: does nothing unless WELCOME_CRON_ENABLED === 'true'. Only new
// accounts (created_at >= WELCOME_FLOOR_AT) whose first access was ≥30 min ago and
// that have NO prior 'sent' row for campaign 'aurix_welcome_v1' in
// public.email_campaign_sends are emailed — never existing/historical/waitlist
// users, never twice. Reuses the EXISTING infra only (Supabase Admin + Resend +
// the shared institutional welcome template). No auth/login/DB-schema change.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, WAITLIST_FROM,
//      CRON_SECRET, WELCOME_CRON_ENABLED ('true' to arm), WELCOME_FLOOR_AT (ISO).
// Query: ?dry=1 → report eligible count, send nothing.
import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ozcasyufbknnuemllwso.supabase.co';
const CAMPAIGN_ID  = 'aurix_welcome_v1';
const DELAY_MS     = 30 * 60 * 1000;                 // ~30 minutes after first access
const SUBJECT      = 'Welcome to Aurix.';
const EMAIL_RE     = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  // Auth: Vercel Cron sends Authorization: Bearer <CRON_SECRET> when configured.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const dry = String(req.query?.dry || '') === '1';
  if (process.env.WELCOME_CRON_ENABLED !== 'true') return res.status(200).json({ ok: true, disabled: true, note: 'set WELCOME_CRON_ENABLED=true to arm' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const RESEND_KEY  = process.env.RESEND_API_KEY;
  const FROM        = process.env.WAITLIST_FROM || 'Aurix <hello@aurixsystem.io>';
  const FLOOR       = Date.parse(process.env.WELCOME_FLOOR_AT || '2026-07-23T00:00:00Z') || 0;
  if (!SERVICE_KEY) return res.status(500).json({ ok: false, error: 'no_service_key' });
  if (!dry && !RESEND_KEY) return res.status(500).json({ ok: false, error: 'no_resend_key' });

  const sb = (p, opts = {}) => fetch(`${SUPABASE_URL}${p}`, { ...opts, headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const now = Date.now();
  const windowMax = now - DELAY_MS;                    // first access must be ≥30 min ago
  const html = fs.readFileSync(path.join(process.cwd(), 'email', 'aurix-welcome.html'), 'utf8');
  const text = 'Welcome to Aurix.\n\nThank you for joining us.\nToday marks the beginning of your journey with Aurix.\n\nThe Aurix Team';

  const stats = { scanned: 0, eligible: 0, sent: 0, skipped_duplicate: 0, skipped_invalid: 0, failed: 0, dry };
  try {
    // Page through Supabase Auth admin users (newest pages first is not guaranteed; we filter by window).
    for (let page = 1; page <= 20; page++) {
      const r = await sb(`/auth/v1/admin/users?page=${page}&per_page=200`);
      if (!r.ok) break;
      const j = await r.json();
      const users = Array.isArray(j?.users) ? j.users : [];
      if (!users.length) break;
      stats.scanned += users.length;
      for (const u of users) {
        const created = Date.parse(u.created_at || '') || 0;
        if (created < FLOOR) continue;                 // existing/historical account → never
        if (created > windowMax) continue;             // first access <30 min ago → wait
        const email = String(u.email || '').trim().toLowerCase();
        if (!EMAIL_RE.test(email)) { stats.skipped_invalid++; continue; }
        stats.eligible++;

        // Idempotency: skip if already sent this campaign.
        const q = await sb(`/rest/v1/email_campaign_sends?select=email&campaign_id=eq.${CAMPAIGN_ID}&email=eq.${encodeURIComponent(email)}&status=eq.sent&limit=1`);
        const done = q.ok ? await q.json() : [];
        if (Array.isArray(done) && done.length) { stats.skipped_duplicate++; continue; }
        if (dry) continue;

        const send = await fetch('https://api.resend.com/emails', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
          body: JSON.stringify({ from: FROM, to: [email], subject: SUBJECT, html, text }),
        });
        const data = await send.json().catch(() => ({}));
        if (send.ok && data?.id) {
          stats.sent++;
          await sb('/rest/v1/email_campaign_sends', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ campaign_id: CAMPAIGN_ID, email, status: 'sent', provider_message_id: data.id }) });
        } else {
          stats.failed++;
          await sb('/rest/v1/email_campaign_sends', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ campaign_id: CAMPAIGN_ID, email, status: 'failed_retryable', error: (data?.message || 'http_' + send.status) }) });
        }
      }
      if (users.length < 200) break;
    }
    return res.status(200).json({ ok: true, campaign_id: CAMPAIGN_ID, ...stats });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e && e.message), ...stats });
  }
}
