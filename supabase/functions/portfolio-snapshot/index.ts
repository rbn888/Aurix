// ════════════════════════════════════════════════════════════════════════════
// AURIX backend portfolio snapshot — SPEC DSH.CHART.BACKEND-SNAPSHOTS.V1.01
// ════════════════════════════════════════════════════════════════════════════
// Deploy-READY, NOT deployed. Supabase Edge Function (Deno). Captures a portfolio value snapshot per
// user on a schedule (pg_cron / dashboard) so long-range history exists even while the app is closed.
//
// SECURITY:
//   • Service-role key is read from the ENV (SUPABASE_SERVICE_ROLE_KEY) — NEVER hardcoded, NEVER shipped
//     to the frontend. This function runs server-side only.
//   • Writes ONLY the new append-only table `portfolio_snapshots` (service-role bypasses its RLS, which
//     otherwise forbids client writes). NEVER touches user_portfolios / holdings / category_history.
//   • Fresh prices come from the EXISTING public price snapshot endpoint (no secret): GET
//     `${AURIX_PRICE_API_BASE}/api/prices/snapshot?symbols=...` → { snapshot:[{symbol,price,currency}] }.
//
// DRY RUN: set env DRY_RUN=1 to compute + log values WITHOUT inserting — use it to verify the server
// valuation matches the app's displayed "Valor total" before enabling real inserts.
//
// Deploy + schedule: see docs/AURIX-CHART-BACKEND-SNAPSHOTS-V1.md (activation).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;               // env only — never hardcode
const PRICE_API_BASE = Deno.env.get('AURIX_PRICE_API_BASE') || 'https://isa-portfolio-ten.vercel.app';
const DRY_RUN = (Deno.env.get('DRY_RUN') || '') === '1';
const NEAR_MS = 5 * 60_000;          // skip if a snapshot exists within 5 min…
const NEAR_FRAC = 0.002;             // …and within 0.2% value (matches the frontend merge dedup)

// Investable buckets (real_estate is tracked but EXCLUDED from investable; kept in the snapshot so the
// chart computes investable = total - real_estate exactly like the app).
const INVESTABLE_TYPES = new Set(['crypto', 'stock', 'etf', 'fund', 'metal', 'liquidity', 'cash', 'other']);
function bucketOf(type: string): string {
  const t = (type || '').toLowerCase();
  if (t === 'stock') return 'stock';
  if (t === 'etf') return 'etf';
  if (t === 'fund') return 'fund';
  if (t === 'crypto') return 'crypto';
  if (t === 'metal') return 'metal';
  if (t === 'cash' || t === 'liquidity') return 'liquidity';
  if (t === 'real_estate' || t === 'realestate' || t === 'property') return 'real_estate';
  return 'other';
}

// Market/staleness classification per bucket (crypto 24/7; equities/funds closed ⇒ last_close).
function isUsEquityOpenNow(now: Date): boolean {
  // Rough US market-hours check in UTC (Mon–Fri, 13:30–20:00 UTC ≈ 09:30–16:00 ET, no holidays).
  const d = now.getUTCDay(); if (d === 0 || d === 6) return false;
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  return mins >= 13 * 60 + 30 && mins <= 20 * 60;
}

async function fetchPrices(symbols: string[]): Promise<Map<string, { price: number; currency: string }>> {
  const map = new Map<string, { price: number; currency: string }>();
  const uniq = Array.from(new Set(symbols.filter(Boolean)));
  if (!uniq.length) return map;
  try {
    const url = `${PRICE_API_BASE}/api/prices/snapshot?symbols=${encodeURIComponent(uniq.join(','))}`;
    const res = await fetch(url, { headers: { origin: 'https://rbn888.github.io' } });
    if (!res.ok) return map;
    const j = await res.json();
    for (const p of (j.snapshot || [])) {
      if (p && p.symbol && Number.isFinite(p.price)) map.set(String(p.symbol).toUpperCase(), { price: Number(p.price), currency: (p.currency || 'USD').toUpperCase() });
    }
  } catch (_) { /* leave map partial */ }
  return map;
}

// Value one user's portfolio in USD from stored holdings revalued at fresh prices.
// MIRRORS app.js investable valuation (assetValueUSD): valueUSD = qty × freshPrice (USD-quoted).
// NOTE (verify at deploy): non-USD-quoted instruments and the exact `assets` field names must match your
// schema. FX for non-USD is applied via `fxUsdPerUnit` when the price endpoint returns a non-USD currency;
// if no rate is available the asset is valued at its STORED price and marked price_staleness:'stale'.
function valueUser(row: any, prices: Map<string, { price: number; currency: string }>, now: Date) {
  const assets: any[] = Array.isArray(row.assets) ? row.assets : [];
  const categories: Record<string, number> = {};
  let total = 0, realEstate = 0, count = 0, anyStale = false, anyClosed = false, anyCrypto = false;
  for (const a of assets) {
    if (!a) continue;
    const type = (a.type || 'other');
    const bucket = bucketOf(type);
    const qty = Number(a.qty);
    if (!Number.isFinite(qty)) continue;
    let valueUSD: number;
    let staleness = 'live';
    if (bucket === 'liquidity') {
      // cash/liquidity: qty is the amount in assetCurrency (no market price)
      const cur = (a.assetCurrency || 'USD').toUpperCase();
      valueUSD = cur === 'USD' ? qty : qty * (Number(a.fxUsdPerUnit) || Number(a.price) || NaN);
      if (!Number.isFinite(valueUSD)) { valueUSD = Number(a.price) * qty; staleness = 'stale'; }
    } else {
      const sym = String(a.symbol || a.ticker || '').toUpperCase();
      const fresh = sym ? prices.get(sym) : undefined;
      if (fresh) {
        const native = qty * fresh.price;
        valueUSD = fresh.currency === 'USD' ? native : native * (Number(a.fxUsdPerUnit) || NaN);
        if (!Number.isFinite(valueUSD)) { valueUSD = qty * Number(a.price); staleness = 'stale'; }
      } else {
        valueUSD = qty * Number(a.price);   // no fresh price → stored (stale)
        staleness = 'stale';
      }
      if (bucket === 'stock' || bucket === 'etf' || bucket === 'fund') { if (!isUsEquityOpenNow(now)) { staleness = staleness === 'live' ? 'last_close' : staleness; anyClosed = true; } }
      if (bucket === 'crypto') anyCrypto = true;
    }
    if (!Number.isFinite(valueUSD)) continue;
    if (staleness !== 'live') anyStale = true;
    categories[bucket] = (categories[bucket] || 0) + valueUSD;
    total += valueUSD;
    if (bucket === 'real_estate') realEstate += valueUSD;
    count++;
  }
  const market_state = anyCrypto && !anyClosed ? 'crypto_24_7' : (anyClosed ? (anyCrypto ? 'mixed' : 'closed') : 'open');
  const price_staleness = anyStale ? (market_state === 'closed' ? 'last_close' : 'stale') : 'live';
  return { total: +total.toFixed(2), realEstate: +realEstate.toFixed(2), categories, count, market_state, price_staleness };
}

Deno.serve(async () => {
  if (!SUPABASE_URL || !SERVICE_ROLE) return new Response('missing env', { status: 500 });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const now = new Date();
  const { data: rows, error } = await admin.from('user_portfolios').select('user_id, assets');
  if (error) return new Response('read error: ' + error.message, { status: 500 });

  // Collect all symbols across users, fetch fresh prices once.
  const allSymbols: string[] = [];
  for (const r of rows ?? []) for (const a of (Array.isArray(r.assets) ? r.assets : [])) { const s = a && (a.symbol || a.ticker); if (s) allSymbols.push(String(s).toUpperCase()); }
  const prices = await fetchPrices(allSymbols);

  let inserted = 0, skipped = 0, empty = 0;
  for (const r of rows ?? []) {
    const v = valueUser(r, prices, now);
    if (!Number.isFinite(v.total) || v.total <= 0) { empty++; continue; }

    // near-duplicate guard: skip if the latest snapshot is within NEAR_MS and NEAR_FRAC value.
    const { data: last } = await admin.from('portfolio_snapshots')
      .select('ts,total_value_usd').eq('user_id', r.user_id).order('ts', { ascending: false }).limit(1);
    if (last && last[0]) {
      const dt = now.getTime() - new Date(last[0].ts).getTime();
      const dv = Math.abs(Number(last[0].total_value_usd) - v.total);
      if (dt <= NEAR_MS && dv <= NEAR_FRAC * (Math.abs(v.total) || 1)) { skipped++; continue; }
    }

    if (DRY_RUN) { console.log('[DRY_RUN]', r.user_id, JSON.stringify(v)); skipped++; continue; }

    const { error: insErr } = await admin.from('portfolio_snapshots').insert({
      user_id: r.user_id, ts: now.toISOString(), total_value_usd: v.total, real_estate: v.realEstate,
      category_values: v.categories, asset_count: v.count, source: 'backend_snapshot',
      confidence: 'scheduled', market_state: v.market_state, price_staleness: v.price_staleness, schema_version: 1,
    });
    if (insErr) { console.error('[insert]', r.user_id, insErr.message); } else { inserted++; }
  }
  return new Response(JSON.stringify({ ok: true, dryRun: DRY_RUN, users: (rows ?? []).length, inserted, skipped, empty }), { headers: { 'content-type': 'application/json' } });
});
