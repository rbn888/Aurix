'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ASSET-PRICE-REFRESH-REACHABILITY-harness — SPEC 56
// ════════════════════════════════════════════════════════════════════════════
// Root cause: the 30s refresh pricer getUnifiedMarketPrice() only consulted the in-memory
// MARKET_DATA universe + a fixed STOCKS_UNIVERSE batch, and NEVER sent an asset's own
// marketSymbol to /snapshot. So a held UCITS fund (0P* Morningstar code) — priceable by the
// backend on the exact same endpoint the ADD path uses — got null every cycle → frozen price.
// Fix: getUnifiedMarketPrice() now falls back to a per-symbol /snapshot (_fetchSymbolSnapshotFC2)
// for any held symbol outside the curated universe → refresh reaches parity with add.
// This proves the CATEGORY behaviour (any non-universe symbol), not a single ISIN.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, i) => { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } };

// Extract the FC-2 pricer block (batch fallback + per-symbol snapshot + getUnifiedMarketPrice).
const S = 'const _fc2FallbackCache';
const E = '// FC-4: crypto portfolio pricing';
const src = app.slice(app.indexOf(S), app.indexOf(E));
if (!src || app.indexOf(S) < 0 || app.indexOf(E) < 0) { console.log('1 failed'); console.error('extraction failed'); process.exit(1); }

// Source contract: the fix (step 3 per-symbol snapshot) is present.
ok('source: _fetchSymbolSnapshotFC2 helper exists', /_fetchSymbolSnapshotFC2\s*\(/.test(src));
ok('source: getUnifiedMarketPrice calls the per-symbol snapshot fallback', /await\s+_fetchSymbolSnapshotFC2\(symbol\)/.test(src));

const FUND = '0P0001ABCD.F';   // a UCITS fund Morningstar code — NOT in MARKET_DATA nor STOCKS_UNIVERSE

function makeEnv() {
  const reqs = [];
  const sb = {
    Date, Number, Map, encodeURIComponent, console: { log() {}, error() {} }, IS_DEV: false,
    PRICES_PROXY: 'https://api.test/api/prices',
    STOCKS_UNIVERSE: ['AAPL', 'MSFT'],
    MARKET_DATA: [],                                   // fund not pre-cached
    normalizeSymbol: s => String(s == null ? '' : s).toUpperCase().trim(),
    AbortSignal: { timeout: () => null },
    fetch: async (url) => {
      reqs.push(url);
      const symbols = decodeURIComponent((url.split('symbols=')[1] || ''));
      let snap = [];
      if (symbols.includes('AAPL')) snap = [{ symbol: 'AAPL', price: 100, change24h: 1 }, { symbol: 'MSFT', price: 200, change24h: 2 }];
      else if (symbols.includes('0P0001ABCD')) snap = [{ symbol: FUND, price: 15.42, change24h: 0.31 }];  // backend CAN price the fund by its own symbol
      return { ok: true, json: async () => ({ snapshot: snap }) };
    },
  };
  vm.createContext(sb);
  vm.runInContext(src + '\n; globalThis.__gump = getUnifiedMarketPrice;', sb);
  sb.__reqs = reqs;
  return sb;
}

(async () => {
  console.log('AURIX-ASSET-PRICE-REFRESH-REACHABILITY — SPEC 56\n');

  // 1. THE FIX — a fund symbol outside the universe is now priced on refresh, and the refresh
  //    actually SENT the fund's own symbol to /snapshot (the regression that caused the freeze).
  { const sb = makeEnv();
    const r = await vm.runInContext('__gump(' + JSON.stringify(FUND) + ')', sb);
    const sentOwnSymbol = sb.__reqs.some(u => decodeURIComponent(u).includes('symbols=' + FUND) || decodeURIComponent(u).includes('0P0001ABCD'));
    ok('1 UCITS fund (0P*) gets a live price on refresh (was frozen/null)', !!r && r.price === 15.42, JSON.stringify(r));
    ok('2 refresh SENDS the fund\'s own symbol to /snapshot (parity with add path)', sentOwnSymbol, 'reqs=' + sb.__reqs.length); }

  // 3. No regression: a universe symbol still resolves from the batch (no per-symbol call needed).
  { const sb = makeEnv();
    const r = await vm.runInContext('__gump("AAPL")', sb);
    const perSymbolCalls = sb.__reqs.filter(u => decodeURIComponent(u).includes('symbols=AAPL') && !decodeURIComponent(u).includes('MSFT')).length;
    ok('3 universe symbol still priced from batch (no regression)', !!r && r.price === 100, JSON.stringify(r));
    ok('4 batch path used for universe symbol (per-symbol fallback not needed)', perSymbolCalls === 0, 'dedicated per-symbol calls=' + perSymbolCalls); }

  // 5. Per-symbol result is cached (no fetch storm on repeated 30s cycles).
  { const sb = makeEnv();
    await vm.runInContext('__gump(' + JSON.stringify(FUND) + ')', sb);
    const after1 = sb.__reqs.length;
    await vm.runInContext('__gump(' + JSON.stringify(FUND) + ')', sb);
    ok('5 per-symbol snapshot is cached (2nd cycle issues no new request)', sb.__reqs.length === after1, 'reqs 1st=' + after1 + ' 2nd=' + sb.__reqs.length); }

  // 6. Truly unknown symbol → null, gracefully (never throws, never freezes the loop).
  { const sb = makeEnv();
    const r = await vm.runInContext('__gump("ZZ_NOT_A_SYMBOL")', sb);
    ok('6 unknown symbol → null (graceful, no throw)', r === null, JSON.stringify(r)); }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log(fail + ' failed'); process.exit(1); }
  console.log('GATE: GO — all ' + pass + ' assertions passed');
  process.exit(0);
})();
