#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// AURIX backend continuity health check — SPEC CHART-INTEGRITY.LB-3
// ════════════════════════════════════════════════════════════════════════════
// Verifies the portfolio_snapshots scheduler (pg_cron */15) is actually producing rows — the external
// dependency the chart's cross-session continuity relies on. Metadata only (a single latest ts); never
// reads balances or PII. Safe for staging, production monitoring and CI smoke checks.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/aurix-backend-health.mjs [--json] [--max-age-min N]
//
// Exit codes:  0 = HEALTHY or LATE (cron alive)   1 = STALE/UNAVAILABLE/UNAUTHORIZED (alert)
//              2 = UNKNOWN (no credentials / empty table / pre-activation — not a hard failure)
// The same thresholds as app.js _aurixBackendHealth: cadence 15 min, late ≤ 2×, stale ≤ 8×.

const CADENCE_MS = 15 * 60000, LATE_FACTOR = 2, STALE_FACTOR = 8;
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const maxAgeIdx = args.indexOf('--max-age-min');
const maxAgeMs = maxAgeIdx >= 0 ? Number(args[maxAgeIdx + 1]) * 60000 : null;

const URL = process.env.SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

function emit(status, reason, extra, code) {
  const out = Object.assign({ status, reason, expectedCadenceMs: CADENCE_MS, checkedAt: new Date().toISOString() }, extra || {});
  if (asJson) console.log(JSON.stringify(out));
  else console.log(`[LB-3 backend-health] ${status} — ${reason}` + (extra && extra.ageMs != null ? ` (age ${Math.round(extra.ageMs/60000)}m)` : ''));
  process.exit(code);
}

if (!URL || !KEY) emit('UNKNOWN', 'no_credentials', { note: 'set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to run' }, 2);

const endpoint = `${URL.replace(/\/$/, '')}/rest/v1/portfolio_snapshots?select=ts&order=ts.desc&limit=1`;
try {
  const res = await fetch(endpoint, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/json' } });
  if (res.status === 401 || res.status === 403) emit('UNAUTHORIZED', 'rls_or_auth_denied', { httpStatus: res.status }, 1);
  if (!res.ok) emit('UNAVAILABLE', 'fetch_error', { httpStatus: res.status }, 1);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) emit('UNKNOWN', 'no_rows_yet', { rowCount: 0 }, 2);
  const latestTs = new Date(rows[0].ts).getTime();
  const ageMs = Date.now() - latestTs;
  const staleLimit = maxAgeMs != null ? maxAgeMs : CADENCE_MS * STALE_FACTOR;
  if (ageMs <= CADENCE_MS * LATE_FACTOR) emit('HEALTHY', 'fresh', { ageMs, latestTs: rows[0].ts }, 0);
  if (ageMs <= staleLimit) emit('LATE', 'behind_schedule', { ageMs, latestTs: rows[0].ts }, 0);
  emit('STALE', 'cron_late_or_dead', { ageMs, latestTs: rows[0].ts }, 1);
} catch (e) {
  emit('UNAVAILABLE', 'network_exception', { error: String(e && e.message || e).slice(0, 120) }, 1);
}
