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
// SPEC SECURE-SNAPSHOT-ENDPOINT — server-to-server invocation secret. The function performs its OWN
// authentication (see authorizeCaller) because the platform gateway cannot do it for us here: the new
// Supabase API keys (sb_secret_… / sb_publishable_…) are OPAQUE tokens, not JWTs, so `verify_jwt = true`
// would reject the scheduler's call outright. Set as a function secret; the SAME value is stored in Vault
// so pg_net can present it. Never in the repo, never in a response, never logged.
// It must be a REAL project secret key: verified in production, the gateway itself answers 401 "Invalid
// API key" to an `apikey` it does not recognise, so an arbitrary string never even reaches this gate. The
// two layers compose — gateway: is this a key of this project? here: is it the one allowed to invoke?
const INVOKE_KEY = Deno.env.get('AURIX_SNAPSHOT_INVOKE_KEY') || '';
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

// Physical-gold valuation constants — MIRROR app.js EXACTLY (assetNativeValue / _goldGrams / _goldPurity).
// The backend must value XAU by grams × purity × (spot/OZ_TO_G), NOT qty × spotPerOz (which treats grams
// as troy ounces at 24k and inflates gold ~31×). Keep these byte-identical to app.js.
const OZ_TO_G = 31.1034768;
const PURITY_TABLE: Record<string, number> = { '10': 0.4167, '14': 0.5833, '18': 0.7500, '21': 0.8750, '22': 0.9167, '24': 1.0000 };
function goldPurity(k: any): number { const v = PURITY_TABLE[String(k)]; return (v != null) ? v : ((Number(k) || 0) / 24); }
function goldGrams(qty: number, unit: string): number { if (unit === 'oz') return qty * OZ_TO_G; if (unit === 'kg') return qty * 1000; return qty; }

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
  // SPEC ASSET-LEVEL-HISTORICAL-DATA-FOUNDATION — misma valoración, un nivel más fino.
  // El bucle de abajo YA calcula el USD de cada posición para sumarlo a su bucket; esto
  // sólo conserva ese número junto a la identidad canónica de la posición en lugar de
  // dejar que se pierda en el agregado. No cambia ni una cifra: se escribe DESPUÉS del
  // mismo guard de valoración que decide si el valor entra en `total`/`categories`, así
  // que una posición sin precio válido no aparece aquí — y su ausencia significa "no se
  // pudo valorar", nunca 0 USD. Sin esta serie, la evolución por activo no se puede
  // reconstruir después: el precio histórico de un proveedor externo no es determinista
  // ni auditable, y dos dispositivos no obtendrían el mismo número.
  const assetValues: Record<string, number> = {};
  const warnings: string[] = [];
  let total = 0, realEstate = 0, count = 0, priced = 0, unpriced = 0, fxCount = 0, dropped = 0;
  let anyStale = false, anyClosed = false, anyCrypto = false;
  // SPEC CHART-INTEGRITY.LB-1 (server-side) — `dropped` counts ACTIVE, non-zero holdings that were EXCLUDED
  // from `total` (orphan / non-finite qty / non-finite value = missing price with no stored fallback or
  // missing FX). It is DISTINCT from `unpriced` (which also counts stale-but-valued holdings that fell back
  // to the stored catalog price and ARE in the total, exactly like app.js). dropped>0 ⇒ the total is a
  // PARTIAL valuation and MUST NOT be persisted (mirrors the client valuation-completeness contract).
  for (const h of holdings) {
    if (!h) continue;
    const asset = byId.get(h.asset_id);
    if (!asset) { unpriced++; dropped++; warnings.push('orphan_holding:' + h.asset_id); continue; }   // salvage not replicated server-side
    const qty = Number(h.quantity);                                    // quantity lives on HOLDINGS
    if (qty === 0) continue;                                           // zero-quantity position — legitimately excluded
    if (!Number.isFinite(qty)) { dropped++; warnings.push('invalid_qty:' + (asset.symbol || h.asset_id)); continue; }   // corrupt quantity ⇒ incomplete
    const bucket = bucketOf(asset.type || 'other');
    const cur = String(asset.assetCurrency || 'USD').toUpperCase();
    const storedPrice = Number(asset.currentPrice);                    // catalog price field = currentPrice
    let valueUSD: number = NaN;
    let staleness = 'live';
    const symU = String(asset.symbol || asset.ticker || '').toUpperCase();
    if (bucket === 'liquidity') {
      // cash: qty is the amount in assetCurrency (no market price)
      if (cur === 'USD') valueUSD = qty;
      else { const fx = fxToUsd(cur, prices); if (Number.isFinite(fx)) { valueUSD = qty * fx; fxCount++; } else { valueUSD = Number.isFinite(storedPrice) && storedPrice > 0 ? qty * storedPrice : NaN; staleness = 'stale'; warnings.push('fx_missing:' + cur); } }
    } else if (symU === 'XAU' && asset.karat) {
      // PHYSICAL GOLD — MIRROR app.js assetNativeValue EXACTLY: grams(unit) × purity(karat) × (spotPerOz / OZ_TO_G).
      // spotPerOz = fresh XAU/USD (registry key) if available (backend revalues while the app is closed),
      // else the catalog currentPrice (the SAME input app.js uses) — so on a closed day this reconciles to the app.
      const grams = goldGrams(qty, String(asset.goldUnit || 'g'));
      const purity = goldPurity(asset.karat);
      const freshXau = prices.get('XAU/USD') || prices.get('XAU');
      const spotPerOz = (freshXau && Number.isFinite(freshXau.price)) ? freshXau.price : storedPrice;
      if (freshXau) priced++; else { staleness = 'stale'; unpriced++; }
      const nativeUSD = grams * purity * (spotPerOz / OZ_TO_G);   // XAU spot is USD/oz ⇒ nativeUSD is USD
      // app currency step (XAU assetCurrency is normally USD; mirror the non-USD branch for parity)
      valueUSD = (cur === 'USD') ? nativeUSD : (Number.isFinite(fxToUsd(cur, prices)) ? nativeUSD * fxToUsd(cur, prices) : NaN);
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
    if (!Number.isFinite(valueUSD)) { unpriced++; dropped++; warnings.push('unpriced:' + (asset.symbol || h.asset_id)); continue; }   // excluded from total ⇒ partial valuation (LB-1)
    if (staleness !== 'live') anyStale = true;
    categories[bucket] = (categories[bucket] || 0) + valueUSD;
    // La identidad es `asset_id` (la clave del join catálogo⋈holdings, la misma que ya
    // usan los flujos de capital). Nunca ticker ni nombre: cambian, colisionan entre
    // cadenas y no son identidad. Se redondea a la misma precisión que el resto de
    // importes publicados. Si dos holdings apuntaran al mismo activo, se suman: el peso
    // del activo es lo que se quiere medir, no el de cada lote.
    const _aid = String(h.asset_id);
    assetValues[_aid] = +(((assetValues[_aid] || 0) + valueUSD).toFixed(2));
    total += valueUSD;
    if (bucket === 'real_estate') realEstate += valueUSD;
    count++;
  }
  const market_state = anyCrypto && !anyClosed ? 'crypto_24_7' : (anyClosed ? (anyCrypto ? 'mixed' : 'closed') : 'open');
  const price_staleness = anyStale ? (market_state === 'closed' ? 'last_close' : 'stale') : 'live';
  return { total: +total.toFixed(2), realEstate: +realEstate.toFixed(2), categories, assetValues, count,
    priced_asset_count: priced, unpriced_asset_count: unpriced, dropped_asset_count: dropped, fx_conversions: fxCount,
    holdings_count: holdings.length, catalog_count: catalog.length, warnings: warnings.slice(0, 20),
    market_state, price_staleness };
}

// SPEC.36 — bounded, retry-safe scheduled capture. BOUNDED: the user_portfolios read is paginated in fixed
// batches up to MAX_USERS (never an unbounded scan). ACTIVE-ONLY: rows with no catalog AND no holdings are
// skipped before valuation. RETRY-SAFE: every per-user step is wrapped so one malformed/failing portfolio can
// NEVER abort the run (the loop continues; the scheduler stays healthy). IDEMPOTENT: a unique index on
// (user_id, minute-bucket) is the hard floor — a re-run within the same minute hits 23505 and is counted as a
// skip, not an error, so reruns are safe and produce no duplicates.
const PAGE = 1000;                    // Supabase select cap per request
const MAX_USERS = 20000;              // hard upper bound on processed rows per run (bounded execution)

// ════════════════════════════════════════════════════════════════════════════
// SPEC SECURE-SNAPSHOT-ENDPOINT — CALLER AUTHENTICATION (own gate, fail-CLOSED)
// ════════════════════════════════════════════════════════════════════════════
// This endpoint reads EVERY user's portfolio with the service role and, in DRY_RUN, returns per-user
// valuations. It previously ran with `verify_jwt = false` and NO check of its own — the handler did not
// even receive the Request — so it was invocable anonymously. This gate is the fix.
//
// Contract: the caller presents the private invocation secret in the `apikey` header. Rejection is
// unconditional and happens BEFORE any privileged work: no createClient, no user_portfolios read, no
// valuation, no price fetch, no insert, and no DRY_RUN sample ever reaches an unauthenticated caller.
//
// Fail-CLOSED by design: a missing or implausible INVOKE_KEY rejects EVERY request (503). A deploy that
// forgets the secret is therefore inert-but-secure, never open. A PUBLISHABLE key is refused on both
// sides — as the presented credential and as the configured expectation — since it ships in the
// frontend bundle and would grant server privileges to anyone who reads it.
function timingSafeEqualStr(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;          // length is not secret (key length is fixed by format)
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;                                   // constant time over equal-length inputs
}
function authorizeCaller(req: Request): { ok: boolean; status: number; reason: string } {
  if (!INVOKE_KEY || INVOKE_KEY.length < 20) return { ok: false, status: 503, reason: 'not_configured' };
  if (INVOKE_KEY.indexOf('sb_publishable_') === 0) return { ok: false, status: 503, reason: 'misconfigured_publishable' };
  const presented = (req && req.headers) ? (req.headers.get('apikey') || '') : '';
  if (!presented) return { ok: false, status: 401, reason: 'missing_apikey' };
  if (presented.indexOf('sb_publishable_') === 0) return { ok: false, status: 403, reason: 'publishable_rejected' };
  if (!timingSafeEqualStr(presented, INVOKE_KEY)) return { ok: false, status: 403, reason: 'invalid_apikey' };
  return { ok: true, status: 200, reason: 'ok' };
}

Deno.serve(async (req: Request) => {
  // AUTH FIRST — nothing privileged above this line. The body carries only a generic code: it must never
  // disclose whether the secret is unset, malformed or merely wrong beyond the coarse status.
  const auth = authorizeCaller(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }),
      { status: auth.status, headers: { 'content-type': 'application/json' } });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE) return new Response('missing env', { status: 500 });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const now = new Date();
  // BOUNDED paginated read (active-only filter applied per-row below; no unbounded full-table scan).
  const rows: any[] = [];
  for (let from = 0; from < MAX_USERS; from += PAGE) {
    const { data: page, error } = await admin.from('user_portfolios')
      .select('user_id, assets, holdings').order('user_id', { ascending: true }).range(from, from + PAGE - 1);
    if (error) return new Response('read error: ' + error.message, { status: 500 });
    if (!page || !page.length) break;
    for (const p of page) rows.push(p);
    if (page.length < PAGE) break;    // last page
  }

  // Collect all symbols + non-USD FX pairs across users' CATALOGS, fetch fresh prices once.
  const allSymbols: string[] = [];
  for (const r of rows ?? []) for (const a of (Array.isArray(r.assets) ? r.assets : [])) {
    if (!a) continue;
    const s = a.symbol || a.ticker; if (s) allSymbols.push(String(s).toUpperCase());
    if (String(s || '').toUpperCase() === 'XAU') allSymbols.push('XAU/USD');   // gold spot registry key (fresh USD/oz)
    const cur = String(a.assetCurrency || 'USD').toUpperCase(); if (cur !== 'USD') allSymbols.push(cur + 'USD=X');   // FX pair in the endpoint's Yahoo form (EURUSD=X)
  }
  const prices = await fetchPrices(allSymbols);

  let inserted = 0, skipped = 0, empty = 0, errored = 0, inactive = 0, incompleteRej = 0;
  const dryRunSamples: any[] = [];
  for (const r of rows) {
   try {   // RETRY-SAFE — one failing portfolio must never abort the whole scheduled run (SPEC.36).
    // ACTIVE-ONLY — a portfolio with neither a catalog nor holdings is not active; skip before valuation.
    const hasCatalog = Array.isArray(r.assets) && r.assets.length > 0;
    const hasHoldings = Array.isArray(r.holdings) && r.holdings.length > 0;
    if (!hasCatalog && !hasHoldings) { inactive++; continue; }
    const v = valueUser(r, prices, now);
    // DRY_RUN visibility WITHOUT `functions logs`: return a per-user, secrets-free sample in the response.
    if (DRY_RUN) dryRunSamples.push({ user: String(r.user_id || '').slice(0, 8), valuationTs: now.toISOString(),
      total_value_usd: v.total, real_estate: v.realEstate, asset_count: v.count,
      holdings_count: v.holdings_count, catalog_count: v.catalog_count,
      priced_asset_count: v.priced_asset_count, unpriced_asset_count: v.unpriced_asset_count,
      dropped_asset_count: v.dropped_asset_count,
      fx_conversions: v.fx_conversions, category_values: v.categories,
      asset_position_count: Object.keys(v.assetValues).length,
      market_state: v.market_state, price_staleness: v.price_staleness, warnings: v.warnings });
    if (!Number.isFinite(v.total) || v.total <= 0) { empty++; continue; }
    // SPEC CHART-INTEGRITY.LB-1 (server-side) — a PARTIAL valuation (≥1 active holding excluded from the
    // total) must NEVER be persisted: it would become a low endpoint/baseline just like the client-side
    // −24% incident. Skip the write so the previous VALID snapshot remains the latest (no fabrication, no
    // deletion). Recovers automatically on the next run once prices/FX resolve. Placed BEFORE the near-dup
    // and insert steps, mirroring the client's completeness-first gate.
    if (Number(v.dropped_asset_count) > 0) { incompleteRej++; continue; }

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
      // SPEC ASSET-LEVEL-HISTORICAL-DATA-FOUNDATION — la serie por posición. Sólo llega
      // aquí un snapshot COMPLETO: el guard LB-1 de arriba descarta la escritura entera
      // cuando `dropped_asset_count > 0`, así que un `asset_values` persistido contiene
      // SIEMPRE todas las posiciones activas del instante. No existe el caso "parcial".
      // La columna es NULLABLE y sin default a propósito: en los snapshots anteriores a
      // esta capacidad vale NULL = "no se capturó", que es distinto de `{}` = "no había
      // posiciones". Confundirlos convertiría el pasado en evidencia falsa de cartera vacía.
      asset_values: v.assetValues,
      confidence: 'scheduled', market_state: v.market_state, price_staleness: v.price_staleness, schema_version: 1,
    });
    if (insErr) {
      // IDEMPOTENT — a unique-violation (23505) means a snapshot already exists for this (user, minute):
      // a safe no-op rerun, NOT a failure. Any other error is a real per-user failure (logged, loop continues).
      if (String((insErr as any).code) === '23505' || /duplicate key|unique constraint/i.test(insErr.message || '')) skipped++;
      else { errored++; console.error('[insert]', r.user_id, insErr.message); }
    } else { inserted++; }
   } catch (e) { errored++; try { console.error('[user]', r && r.user_id, (e as any) && (e as any).message); } catch (_) {} }
  }
  return new Response(JSON.stringify({ ok: true, dryRun: DRY_RUN, users: rows.length, inserted, skipped, empty, inactive, errored, incompleteRej,
    ...(DRY_RUN ? { samples: dryRunSamples } : {}) }), { headers: { 'content-type': 'application/json' } });
});
