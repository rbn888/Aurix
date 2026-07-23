// POST /api/waitlist
// Persists a "Request Access" lead from the AURIX landing and sends EXACTLY ONE
// transactional welcome email. No sequences, no campaigns, no automation chains.
//
// Flow:
//   1. Validate { name, email, locale, source } (JSON, ≤ 2KB, origin-checked).
//   2. Insert into public."Correos usuario" (historical table, renamed from waitlist) via the Supabase
//      REST API using the service_role key (server-side only — RLS denies the public key).
//   3. Duplicate email (unique) → friendly "already on the waitlist", no new row.
//   4. Welcome email is sent only when welcome_email_sent_at IS NULL, then the
//      column is stamped so it is never sent twice (one email per address).
//
// Required env (Vercel):  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional env:           RESEND_API_KEY, WAITLIST_FROM, WAITLIST_ALLOWED_ORIGINS

const ALLOWED_ORIGINS = (process.env.WAITLIST_ALLOWED_ORIGINS ||
  'https://aurixsystem.io,https://www.aurixsystem.io,https://rbn888.github.io')
  .split(',').map(s => s.trim()).filter(Boolean);

function corsOrigin(req) {
  const o = (req && req.headers && req.headers.origin) || '';
  if (o && (ALLOWED_ORIGINS.includes(o) || /^http:\/\/localhost(:\d+)?$/.test(o))) return o;
  return ALLOWED_ORIGINS[0];
}

const MAX_BYTES = 2048;
const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ozcasyufbknnuemllwso.supabase.co';
// Historical email table, physically renamed by the owner from "waitlist" to "Correos usuario" (capital +
// space → a quoted SQL identifier; percent-encoded here for the PostgREST path). Single source of truth for
// every captured email — landing (here) and login OTP (public.persist_access_email RPC) both write to it.
const WAITLIST_TABLE_PATH = 'Correos%20usuario';

// Lightweight in-memory per-IP rate limit — best-effort (per serverless
// instance), same pattern as api/verify-pin.js. Max 5 submissions / IP / hour.
const MAX_SUBMISSIONS = 5;
const RATE_WINDOW_MS  = 60 * 60 * 1000;
const submissions = {};

function clean(v, max) { return (typeof v === 'string' ? v : '').trim().slice(0, max); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  corsOrigin(req));
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const origin = req.headers.origin || '';
  if (!origin || !(ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin))) {
    return res.status(403).json({ ok: false, error: 'forbidden_origin' });
  }

  // ── Per-IP rate limit (max 5 / hour) ───────────────────────────────────────
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
             (req.socket && req.socket.remoteAddress) || 'unknown';
  const now = Date.now();
  const rec = submissions[ip];
  if (rec && (now - rec.firstAttempt) < RATE_WINDOW_MS) {
    if (rec.count >= MAX_SUBMISSIONS) {
      return res.status(429).json({ ok: false, error: 'rate_limited' });
    }
    rec.count++;
  } else {
    submissions[ip] = { count: 1, firstAttempt: now };
  }

  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (!ct.startsWith('application/json')) return res.status(415).json({ ok: false, error: 'unsupported_media' });

  const lenHeader = parseInt(req.headers['content-length'] || '0', 10);
  if (Number.isFinite(lenHeader) && lenHeader > MAX_BYTES) {
    return res.status(413).json({ ok: false, error: 'payload_too_large' });
  }

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ ok: false, error: 'invalid_body' });
  }

  // ── Validate + normalize ───────────────────────────────────────────────────
  const name   = clean(body.name, 120);
  const email  = clean(body.email, 200).toLowerCase();
  const locale = (clean(body.locale, 5).toLowerCase() === 'es') ? 'es' : 'en';
  const source = clean(body.source, 60) || 'landing';

  if (name.length < 2)       return res.status(422).json({ ok: false, error: 'invalid_name' });
  if (!EMAIL_RE.test(email))  return res.status(422).json({ ok: false, error: 'invalid_email' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) {
    console.error('[waitlist] SUPABASE_SERVICE_ROLE_KEY is not set');
    return res.status(500).json({ ok: false, error: 'server_misconfigured' });
  }
  const sbHeaders = {
    'Content-Type': 'application/json',
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
  };

  // ── Insert (service_role bypasses RLS); detect duplicate; learn email state ─
  let duplicate = false;
  let needsEmail = false;
  try {
    const ins = await fetch(`${SUPABASE_URL}/rest/v1/${WAITLIST_TABLE_PATH}`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({ name, email, locale, source, status: 'waitlist' }),
    });

    if (ins.status === 201) {
      // New lead — welcome_email_sent_at is null → send the one welcome email.
      needsEmail = true;
    } else if (ins.status === 409) {
      // Already on the waitlist. Send the welcome email only if a prior attempt
      // never stamped welcome_email_sent_at (i.e. it is still null).
      duplicate = true;
      const q = await fetch(
        `${SUPABASE_URL}/rest/v1/${WAITLIST_TABLE_PATH}?email=eq.${encodeURIComponent(email)}&select=welcome_email_sent_at`,
        { headers: sbHeaders }
      );
      if (q.ok) {
        const rows = await q.json().catch(() => []);
        needsEmail = Array.isArray(rows) && rows[0] && !rows[0].welcome_email_sent_at;
      }
    } else {
      const detail = await ins.text().catch(() => '');
      console.error('[waitlist] insert failed', ins.status, detail.slice(0, 300));
      return res.status(502).json({ ok: false, error: 'store_failed' });
    }
  } catch (e) {
    console.error('[waitlist] insert error', (e && e.message) || e);
    return res.status(502).json({ ok: false, error: 'store_failed' });
  }

  // ── Welcome email (one only) ───────────────────────────────────────────────
  let emailed = false;
  if (needsEmail) {
    emailed = await sendWelcomeEmail({ email, locale }).catch((e) => {
      console.error('[waitlist] welcome email error', (e && e.message) || e);
      return false; // lead is stored regardless — never fail the request on email
    });
    if (emailed) {
      // Stamp idempotently: only set if still null (guards against races/retries).
      try {
        await fetch(
          `${SUPABASE_URL}/rest/v1/${WAITLIST_TABLE_PATH}?email=eq.${encodeURIComponent(email)}&welcome_email_sent_at=is.null`,
          {
            method: 'PATCH',
            headers: { ...sbHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({ welcome_email_sent_at: new Date().toISOString() }),
          }
        );
      } catch (e) {
        console.error('[waitlist] stamp welcome_email_sent_at failed', (e && e.message) || e);
      }
    }
  }

  return res.status(200).json({ ok: true, duplicate, emailed });
}

// ─────────────────────────────────────────────────────────────────────────────
// Welcome email via Resend REST API. No SDK dependency (global fetch, Node 24).
// Returns true if accepted, false if skipped (no key) or failed.
// ─────────────────────────────────────────────────────────────────────────────
async function sendWelcomeEmail({ email, locale }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn('[waitlist] RESEND_API_KEY not set — welcome email skipped');
    return false;
  }
  const from = process.env.WAITLIST_FROM || 'Aurix <hello@aurixsystem.io>';
  const { subject, html, text } = welcomeContent(locale);

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from, to: [email], subject, html, text }),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    console.error('[waitlist] resend failed', r.status, detail.slice(0, 300));
    return false;
  }
  return true;
}

// Premium, minimal, no hype, no promises. One email, localized by locale.
function welcomeContent(locale) {
  const COPY = {
    en: {
      subject: 'Welcome to Aurix',
      heading: 'Welcome to Aurix.',
      paras: [
        'Your request has been received and you are now part of the Aurix early access list.',
        'Aurix is currently in private beta as we continue building the future of Wealth Intelligence.',
        'We will contact selected users as new access waves become available.',
      ],
      closing: 'Welcome to the next generation of Wealth Intelligence.',
      sign: 'The Aurix Team',
      tagline: 'Wealth Intelligence Platform',
      footer: 'You are receiving this because you requested access at aurixsystem.io.',
    },
    es: {
      subject: 'Bienvenido a Aurix',
      heading: 'Bienvenido a Aurix.',
      paras: [
        'Hemos recibido tu solicitud y ya formas parte de la lista de acceso anticipado de Aurix.',
        'Aurix se encuentra actualmente en beta privada mientras seguimos construyendo el futuro de la Inteligencia Patrimonial.',
        'Nos pondremos en contacto contigo cuando se abran nuevas fases de acceso.',
      ],
      closing: 'Bienvenido a la próxima generación de Inteligencia Patrimonial.',
      sign: 'Equipo Aurix',
      tagline: 'Plataforma de inteligencia patrimonial',
      footer: 'Recibes este correo porque solicitaste acceso en aurixsystem.io.',
    },
  };
  const c = COPY[locale] || COPY.en;

  const text = `${c.heading}\n\n${c.paras.join('\n\n')}\n\n${c.closing}\n\n${c.sign}\nAurix · ${c.tagline}\n\n${c.footer}`;

  const paraHtml = c.paras
    .map(p => `<p style="font:400 15px/1.7 Arial,sans-serif;color:#b9c6e0;margin:0 0 16px;">${p}</p>`)
    .join('');

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#05070f;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${c.paras[0]}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05070f;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0b1020;border:1px solid rgba(138,178,255,.18);border-radius:18px;overflow:hidden;">
        <tr><td style="padding:32px 36px 10px;">
          <div style="font:800 20px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;letter-spacing:.22em;color:#ffffff;">AURIX</div>
          <div style="font:600 11px/1 Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#7db8ff;margin-top:8px;">${c.tagline}</div>
        </td></tr>
        <tr><td style="padding:20px 36px 8px;">
          <p style="font:700 20px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:#f4f7fc;margin:0 0 18px;">${c.heading}</p>
          ${paraHtml}
          <p style="font:500 15px/1.7 Arial,sans-serif;color:#dfe9fb;margin:22px 0 0;">${c.closing}</p>
          <p style="font:600 15px/1.6 Arial,sans-serif;color:#ffffff;margin:26px 0 2px;">${c.sign}</p>
        </td></tr>
        <tr><td style="padding:20px 36px 28px;border-top:1px solid rgba(255,255,255,.07);">
          <p style="font:400 12px/1.6 Arial,sans-serif;color:#6f7d99;margin:0;">${c.footer}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject: c.subject, html, text };
}
