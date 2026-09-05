import { createHash } from 'crypto';

// AURIX-APP-DOMAIN-READY-1: allowlist (comma-separated) instead of a single
// origin, so the GitHub Pages app (rbn888.github.io) and the future
// app.aurixsystem.io app are both accepted during migration. ALLOWED_ORIGINS
// overrides the legacy ALLOWED_ORIGIN env var when present.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || 'https://rbn888.github.io,https://app.aurixsystem.io')
  .split(',').map(s => s.trim()).filter(Boolean);
// Reflect the request Origin only when it is allow-listed (never wildcard '*');
// localhost (any port) is accepted for local dev. Unknown origins fall back to
// the first configured origin so existing behaviour is preserved.
function corsOrigin(req) {
  const o = (req && req.headers && req.headers.origin) || '';
  if (o && (ALLOWED_ORIGINS.includes(o) || /^http:\/\/localhost(:\d+)?$/.test(o))) return o;
  return ALLOWED_ORIGINS[0];
}

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000;

const attempts = {};

function hashPin(pin) {
  return createHash('sha256').update(pin).digest('hex');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  corsOrigin(req));
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const now = Date.now();
  const record = attempts[ip];

  if (record) {
    if (now - record.firstAttempt < WINDOW_MS) {
      if (record.count >= MAX_ATTEMPTS) {
        return res.status(429).json({ success: false, error: 'rate_limited' });
      }
      record.count++;
    } else {
      attempts[ip] = { count: 1, firstAttempt: now };
    }
  } else {
    attempts[ip] = { count: 1, firstAttempt: now };
  }

  const PIN_HASH = process.env.PIN_HASH;

  try {
    const { pin } = req.body || {};

    if (typeof pin !== 'string') {
      return res.status(200).json({ success: false });
    }

    const incomingHash = hashPin(pin.trim());

    if (incomingHash === PIN_HASH) {
      return res.status(200).json({ success: true });
    } else {
      return res.status(200).json({ success: false });
    }

  } catch {
    return res.status(200).json({ success: false });
  }
}
