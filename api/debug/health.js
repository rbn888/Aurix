// GET /api/debug/health
// Returns the in-memory OBSERVABILITY snapshot for the current Vercel
// function instance. Counters are per-instance and reset on cold start —
// this endpoint is for ops/debugging, not durable monitoring.

import { OBSERVABILITY, PRICE_CACHE } from '../prices.js';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://rbn888.github.io';

function avg(b) {
  return b.count > 0 ? Math.round(b.sum / b.count) : 0;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'method_not_allowed' });

  const p = OBSERVABILITY.pricing;
  const s = OBSERVABILITY.snapshot;
  const totalCacheReads = p.cacheHits + p.cacheMisses;

  return res.status(200).json({
    instanceStartedAt: OBSERVABILITY.startedAt,
    uptimeMs:          Date.now() - OBSERVABILITY.startedAt,
    pricing: {
      providerRequests: p.providerRequests,
      providerFailures: p.providerFailures,
      providerLatencyMs: {
        coingecko:  { avg: avg(p.providerLatencyMs.coingecko),  total: p.providerLatencyMs.coingecko.sum  },
        twelvedata: { avg: avg(p.providerLatencyMs.twelvedata), total: p.providerLatencyMs.twelvedata.sum },
        yahoo:      { avg: avg(p.providerLatencyMs.yahoo),      total: p.providerLatencyMs.yahoo.sum      },
      },
      cacheHits:        p.cacheHits,
      cacheMisses:      p.cacheMisses,
      cacheHitRatio:    totalCacheReads > 0 ? p.cacheHits / totalCacheReads : null,
      cacheSize:        PRICE_CACHE.size,
      partialResponses: p.partialResponses,
      rateLimitHits:    p.rateLimitHits,
    },
    snapshot: {
      snapshotRequests:   s.requestCount,
      symbolsRequested:   s.symbolsRequested,
      symbolsResolved:    s.resolvedTotal,
      partialPayloads:    s.partialResponses,
      partialRatio:       s.requestCount > 0 ? s.partialResponses / s.requestCount : null,
      snapshotLatencyMs:  { avg: avg(s.latencyMs), total: s.latencyMs.sum },
    },
    health: {
      providerHealthy:
        (p.providerRequests.coingecko + p.providerRequests.twelvedata + p.providerRequests.yahoo) > 0 &&
        (p.providerFailures.coingecko + p.providerFailures.twelvedata + p.providerFailures.yahoo) === 0,
      cacheWorking: totalCacheReads > 0,
    },
  });
}
