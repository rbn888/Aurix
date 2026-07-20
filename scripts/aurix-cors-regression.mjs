#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// AURIX CORS regression check — SPEC FIX PRODUCTION CORS FOR CANONICAL APP DOMAIN
// ════════════════════════════════════════════════════════════════════════════
// Root cause this guards against: the price proxy's CORS allow-list once fell out
// of sync with the canonical app domain (deployed env still pinned the old
// GitHub-Pages origin), so the browser at app.aurixsystem.io had its HTTP-200
// price responses blocked — crypto + gold showed "no disponible" (equities
// masked it via local fallback). This was a CONFIG/ENV drift, not a code bug, so
// only a live check against production catches a recurrence.
//
// Fails (exit 1) if the canonical app origin is NOT reflected in
// `access-control-allow-origin` by BOTH price entrypoints:
//   - POST /api/prices                       (crypto provider route)
//   - GET  /api/prices/snapshot?symbols=...   (equity + gold route)
//
// Overridable via env for staging/preview targets:
//   AURIX_API_BASE     default https://isa-portfolio-ten.vercel.app
//   AURIX_APP_ORIGIN   default https://app.aurixsystem.io
const BASE   = (process.env.AURIX_API_BASE   || 'https://isa-portfolio-ten.vercel.app').replace(/\/+$/, '');
const ORIGIN = (process.env.AURIX_APP_ORIGIN || 'https://app.aurixsystem.io').replace(/\/+$/, '');
const TIMEOUT_MS = 15000;

const checks = [
  {
    name: 'POST /api/prices (crypto)',
    url: `${BASE}/api/prices`,
    init: { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify({ providers: ['coingecko:bitcoin'] }) },
  },
  {
    name: 'GET /api/prices/snapshot (equity+gold)',
    url: `${BASE}/api/prices/snapshot?symbols=${encodeURIComponent('AAPL')}`,
    init: { method: 'GET', headers: { Origin: ORIGIN } },
  },
];

const failures = [];
for (const c of checks) {
  try {
    const res = await fetch(c.url, { ...c.init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const acao = res.headers.get('access-control-allow-origin');
    if (!res.ok) { failures.push(`${c.name}: HTTP ${res.status} (expected 200)`); continue; }
    if (acao !== ORIGIN) {
      failures.push(`${c.name}: access-control-allow-origin="${acao}" (expected "${ORIGIN}")`);
    } else {
      console.log(`✓ ${c.name} → ${acao}`);
    }
  } catch (err) {
    failures.push(`${c.name}: request failed — ${err && err.message ? err.message : err}`);
  }
}

if (failures.length) {
  console.error(`\nCORS REGRESSION — canonical origin "${ORIGIN}" not accepted by ${failures.length}/${checks.length} entrypoint(s) on ${BASE}:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error('\nLikely cause: the Vercel project (isa-portfolio) ALLOWED_ORIGINS env is missing the canonical app origin, or a stale legacy ALLOWED_ORIGIN is overriding it. Fix the env var and redeploy production.');
  process.exit(1);
}
console.log(`\nCORS OK — "${ORIGIN}" accepted by both price entrypoints on ${BASE}.`);
