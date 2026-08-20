// SPEC MKT-EXCELLENCE.ASSET-DISCOVERY-IDENTITY.V1 — shared CoinGecko coin catalog (identity index)
// ════════════════════════════════════════════════════════════════════════════════════════════════
// ONE cached artifact powers BOTH halves of crypto identity, so neither costs a per-keystroke call:
//   • id → chains/contracts   (enrich a textual search result with its network/contract when it has one)
//   • contract → {coinId, network}   (exact reverse lookup for CONTRACT SEARCH, zero upstream calls)
// Source: CoinGecko /coins/list?include_platform=true — ONE request per instance per TTL, never per
// query. The demo API key is used when the backend has it (same env var + header as api/prices/history).
//
// HONESTY RULES BAKED IN:
//   • A coin present on SEVERAL chains has NO single network → `primaryChain` stays null. We never pick
//     one and never claim a contract the user did not ask about.
//   • While the catalog is cold, chain/contract fields are simply ABSENT (never guessed) and the caller
//     reports `catalogState`. Absent evidence is reported as absent, not as "no contract".
//   • Failure is remembered with a backoff so a rate-limited upstream is never hammered.
const CATALOG_URL = 'https://api.coingecko.com/api/v3/coins/list?include_platform=true';
const TTL_MS        = 12 * 60 * 60 * 1000;   // identity/contract mappings are stable; 12 h is conservative
const ERROR_TTL_MS  = 5 * 60 * 1000;         // after a failure, retry at most every 5 min
const FETCH_TIMEOUT = 20000;
const MAX_CHAINS_PER_COIN = 8;               // bounds memory; a coin with more is still marked multi-chain

// CoinGecko platform id → human label + on-chain (GeckoTerminal) network id. Extensible by design:
// an unknown platform id still resolves (label prettified from the id) so no chain is silently dropped.
const NETWORKS = [
  { cg: 'ethereum',              gt: 'eth',         label: 'Ethereum',   family: 'evm' },
  { cg: 'base',                  gt: 'base',        label: 'Base',       family: 'evm' },
  { cg: 'arbitrum-one',          gt: 'arbitrum',    label: 'Arbitrum',   family: 'evm' },
  { cg: 'optimistic-ethereum',   gt: 'optimism',    label: 'Optimism',   family: 'evm' },
  { cg: 'polygon-pos',           gt: 'polygon_pos', label: 'Polygon',    family: 'evm' },
  { cg: 'binance-smart-chain',   gt: 'bsc',         label: 'BNB Chain',  family: 'evm' },
  { cg: 'avalanche',             gt: 'avax',        label: 'Avalanche',  family: 'evm' },
  { cg: 'solana',                gt: 'solana',      label: 'Solana',     family: 'solana' },
  { cg: 'tron',                  gt: 'tron',        label: 'Tron',       family: 'tron' },
];
const BY_CG = new Map(NETWORKS.map(n => [n.cg, n]));

export function networkLabel(cgId) {
  const hit = BY_CG.get(String(cgId || ''));
  if (hit) return hit.label;
  const raw = String(cgId || '').trim();
  if (!raw) return null;
  return raw.split(/[-_]/).map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
}
export function networksForFamily(family) { return NETWORKS.filter(n => n.family === family); }
export function networkByCg(cgId) { return BY_CG.get(String(cgId || '')) || null; }

// Address shape → chain family. Architecture is multi-chain: EVM is one family among several, never
// the definition of "a contract".
export function detectAddressFamily(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  if (/^0x[0-9a-fA-F]{40}$/.test(s)) return 'evm';
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(s)) return 'tron';
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return 'solana';
  return null;
}
export function looksLikeContractAddress(input) { return detectAddressFamily(input) != null; }

const state = {
  status: 'idle',           // idle | loading | ready | error
  at: 0,                    // when the current maps were built (or when the error happened)
  error: null,
  coins: 0,
  contracts: 0,
  byContract: new Map(),    // lowercased address → { coinId, cg }
  byId: new Map(),          // coinId → { symbol, name, chains: [[cg, address], ...] }
  inflight: null,
};

function fresh() { return state.status === 'ready' && (Date.now() - state.at) < TTL_MS; }
function errorCoolingDown() { return state.status === 'error' && (Date.now() - state.at) < ERROR_TTL_MS; }

async function load() {
  const headers = { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Aurix)' };
  if (process.env.COINGECKO_DEMO_API_KEY) headers['x-cg-demo-api-key'] = process.env.COINGECKO_DEMO_API_KEY;
  const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT), headers });
  if (!res.ok) throw new Error('upstream_' + res.status);
  const list = await res.json();
  if (!Array.isArray(list)) throw new Error('upstream_malformed');
  const byContract = new Map(), byId = new Map();
  let contracts = 0;
  for (const c of list) {
    if (!c || typeof c.id !== 'string' || !c.platforms || typeof c.platforms !== 'object') continue;
    const chains = [];
    for (const [cg, addr] of Object.entries(c.platforms)) {
      const a = (typeof addr === 'string') ? addr.trim() : '';
      if (!a) continue;                                   // "" means: listed on that chain with NO contract → skip
      if (chains.length < MAX_CHAINS_PER_COIN) chains.push([cg, a]);
      const key = a.toLowerCase();
      if (!byContract.has(key)) { byContract.set(key, { coinId: c.id, cg }); contracts++; }
    }
    if (!chains.length) continue;                          // native coins (BTC/ETH/SOL) have no contract — correct
    byId.set(c.id, { symbol: typeof c.symbol === 'string' ? c.symbol.toUpperCase() : null, name: typeof c.name === 'string' ? c.name : null, chains });
  }
  state.byContract = byContract; state.byId = byId;
  state.coins = byId.size; state.contracts = contracts;
  state.status = 'ready'; state.at = Date.now(); state.error = null;
  return state;
}

function start() {
  if (state.inflight) return state.inflight;
  state.status = state.status === 'ready' ? 'ready' : 'loading';
  state.inflight = load()
    .catch(err => { state.status = 'error'; state.at = Date.now(); state.error = String(err && err.message || err); return null; })
    .finally(() => { state.inflight = null; });
  return state.inflight;
}

// Non-blocking refresh. NOT used by the textual search path: on serverless the instance is frozen as
// soon as the response is sent, so a fire-and-forget load never completes (and its failure would then
// cool down the paths that DO await the catalog). Kept for a caller that stays alive — e.g. a cron or
// a long-lived runtime.
export function warm() {
  if (fresh() || errorCoolingDown() || state.inflight) return;
  start();
}
// Blocking with a ceiling: contract lookup can afford to wait ONCE for a cold catalog (subsequent
// lookups are instant). On timeout it returns whatever the state is — the caller degrades honestly.
export async function ensure(maxWaitMs) {
  if (fresh()) return true;
  if (errorCoolingDown()) return false;
  const p = start();
  if (!p) return fresh();
  if (!(maxWaitMs > 0)) return fresh();
  let timer;
  const timeout = new Promise(r => { timer = setTimeout(() => r('timeout'), maxWaitMs); });
  try { await Promise.race([p, timeout]); } finally { clearTimeout(timer); }
  return fresh();
}

export function catalogState() {
  return { status: state.status, ageMs: state.at ? (Date.now() - state.at) : null, coins: state.coins, contracts: state.contracts, error: state.error };
}

// contract → canonical identity fragment. EXACT match only (lowercased). Never fuzzy.
export function lookupContract(address) {
  const a = String(address || '').trim().toLowerCase();
  if (!a || !fresh()) return null;
  const hit = state.byContract.get(a);
  if (!hit) return null;
  const meta = state.byId.get(hit.coinId) || null;
  return { coinId: hit.coinId, cg: hit.cg, network: networkLabel(hit.cg), symbol: meta && meta.symbol, name: meta && meta.name };
}

// coinId → chain evidence. `primaryChain`/`contract` are populated ONLY when the coin lives on exactly
// ONE chain; a multi-chain coin reports chainCount and nothing else (picking one would be an invention).
export function chainsFor(coinId) {
  if (!fresh()) return null;
  const meta = state.byId.get(String(coinId || ''));
  if (!meta || !meta.chains.length) return { chainCount: 0, primaryChain: null, contract: null, chains: [] };
  const chains = meta.chains.map(([cg, addr]) => ({ network: networkLabel(cg), networkId: cg, contract: addr }));
  const single = chains.length === 1;
  return { chainCount: chains.length, primaryChain: single ? chains[0].network : null, contract: single ? chains[0].contract : null, chains };
}

export const __testing = { state, load };
// NOTE — the leading underscore is load-bearing: Vercel turns every non-underscore file under api/
// into a Serverless Function, and this deployment sits at the plan's 12-function ceiling. Shared
// modules MUST stay underscore-prefixed (they are still bundled through the import graph).
