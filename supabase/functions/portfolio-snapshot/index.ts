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

// USD per unit of a non-USD currency, from the price snapshot. The endpoint's registry resolves FX pairs
// in the Yahoo form `<CUR>USD=X` (e.g. EURUSD=X → USD per 1 EUR) — NOT `<CUR>/USD`. NaN if absent.
function fxToUsd(cur: string, prices: Map<string, { price: number; currency: string }>): number {
  const c = (cur || 'USD').toUpperCase();
  if (c === 'USD') return 1;
  const p = prices.get(`${c}USD=X`);
  return p && Number.isFinite(p.price) ? p.price : NaN;
}

// Value one user's portfolio in USD. AURIX stores the NEW model in user_portfolios as TWO columns:
//   assets   = catalog: [{ id, symbol, type, currentPrice, assetCurrency, ... }]
//   holdings = quantities: [{ id, asset_id, quantity, costBasis, ... }]
// A position is holdings ⋈ assets on holdings.asset_id === assets.id — EXACTLY app.js convertFromNewToFlat
// (qty=holding.quantity, price=asset.currentPrice, type=asset.type, ticker=asset.symbol,
// assetCurrency=asset.assetCurrency). Revalued at fresh USD prices where available; else the catalog price.
function valueUser(row: any, prices: Map<string, { price: number; currency: string }>, now: Date) {
  const catalog: any[] = Array.isArray(row.assets) ? row.assets : [];
  const holdings: any[] = Array.isArray(row.holdings) ? row.holdings : [];
  const byId = new Map<any, any>(catalog.map((a: any) => [a && a.id, a]));   // catalog keyed by id
  const categories: Record<string, number> = {};
  const warnings: string[] = [];
  let total = 0, realEstate = 0, count = 0, priced = 0, unpriced = 0, fxCount = 0;
  let anyStale = false, anyClosed = false, anyCrypto = false;
  for (const h of holdings) {
    if (!h) continue;
    const asset = byId.get(h.asset_id);
    if (!asset) { unpriced++; warnings.push('orphan_holding:' + h.asset_id); continue; }   // salvage not replicated server-side
    const qty = Number(h.quantity);                                    // quantity lives on HOLDINGS
    if (!Number.isFinite(qty) || qty === 0) continue;
    const bucket = bucketOf(asset.type || 'other');
    const cur = String(asset.assetCurrency || 'USD').toUpperCase();
    const storedPrice = Number(asset.currentPrice);                    // catalog price field = currentPrice
    let valueUSD: number = NaN;
    let staleness = 'live';
    if (bucket === 'liquidity') {
      // cash: qty is the amount in assetCurrency (no market price)
      if (cur === 'USD') valueUSD = qty;
      else { const fx = fxToUsd(cur, prices); if (Number.isFinite(fx)) { valueUSD = qty * fx; fxCount++; } else { valueUSD = Number.isFinite(storedPrice) && storedPrice > 0 ? qty * storedPrice : NaN; staleness = 'stale'; warnings.push('fx_missing:' + cur); } }
    } else {
      const sym = String(asset.symbol || asset.ticker || '').toUpperCase();
      const fresh = sym ? prices.get(sym) : undefined;
      const unit = fresh ? fresh.price : storedPrice;                  // price per unit in its quote currency
      const quoteCur = fresh ? (fresh.currency || 'USD').toUpperCase() : cur;
      if (fresh) priced++; else { staleness = 'stale'; unpriced++; }
      const native = qty * unit;
      if (quoteCur === 'USD') valueUSD = native;
      else { const fx = fxToUsd(quoteCur, prices); if (Number.isFinite(fx)) { valueUSD = native * fx; fxCount++; } else { valueUSD = NaN; staleness = 'stale'; warnings.push('fx_missing:' + quoteCur); } }
      if ((bucket === 'stock' || bucket === 'etf' || bucket === 'fund') && !isUsEquityOpenNow(now)) { staleness = staleness === 'live' ? 'last_close' : staleness; anyClosed = true; }
      if (bucket === 'crypto') anyCrypto = true;
    }
    if (!Number.isFinite(valueUSD)) { unpriced++; warnings.push('unpriced:' + (asset.symbol || h.asset_id)); continue; }
    if (staleness !== 'live') anyStale = true;
    categories[bucket] = (categories[bucket] || 0) + valueUSD;
    total += valueUSD;
    if (bucket === 'real_estate') realEstate += valueUSD;
    count++;
  }
  const market_state = anyCrypto && !anyClosed ? 'crypto_24_7' : (anyClosed ? (anyCrypto ? 'mixed' : 'closed') : 'open');
  const price_staleness = anyStale ? (market_state === 'closed' ? 'last_close' : 'stale') : 'live';
  return { total: +total.toFixed(2), realEstate: +realEstate.toFixed(2), categories, count,
    priced_asset_count: priced, unpriced_asset_count: unpriced, fx_conversions: fxCount,
    holdings_count: holdings.length, catalog_count: catalog.length, warnings: warnings.slice(0, 20),
    market_state, price_staleness };
}

Deno.serve(async () => {
  if (!SUPABASE_URL || !SERVICE_ROLE) return new Response('missing env', { status: 500 });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const now = new Date();
  const { data: rows, error } = await admin.from('user_portfolios').select('user_id, assets, holdings');
  if (error) return new Response('read error: ' + error.message, { status: 500 });

  // Collect all symbols + non-USD FX pairs across users' CATALOGS, fetch fresh prices once.
  const allSymbols: string[] = [];
  for (const r of rows ?? []) for (const a of (Array.isArray(r.assets) ? r.assets : [])) {
    if (!a) continue;
    const s = a.symbol || a.ticker; if (s) allSymbols.push(String(s).toUpperCase());
    const cur = String(a.assetCurrency || 'USD').toUpperCase(); if (cur !== 'USD') allSymbols.push(cur + 'USD=X');   // FX pair in the endpoint's Yahoo form (EURUSD=X)
  }
  const prices = await fetchPrices(allSymbols);

  let inserted = 0, skipped = 0, empty = 0;
  const dryRunSamples: any[] = [];
  for (const r of rows ?? []) {
    const v = valueUser(r, prices, now);
    // DRY_RUN visibility WITHOUT `functions logs`: return a per-user, secrets-free sample in the response.
    if (DRY_RUN) dryRunSamples.push({ user: String(r.user_id || '').slice(0, 8), valuationTs: now.toISOString(),
      total_value_usd: v.total, real_estate: v.realEstate, asset_count: v.count,
      holdings_count: v.holdings_count, catalog_count: v.catalog_count,
      priced_asset_count: v.priced_asset_count, unpriced_asset_count: v.unpriced_asset_count,
      fx_conversions: v.fx_conversions, category_values: v.categories,
      market_state: v.market_state, price_staleness: v.price_staleness, warnings: v.warnings });
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
  return new Response(JSON.stringify({ ok: true, dryRun: DRY_RUN, users: (rows ?? []).length, inserted, skipped, empty,
    ...(DRY_RUN ? { samples: dryRunSamples } : {}) }), { headers: { 'content-type': 'application/json' } });
});
