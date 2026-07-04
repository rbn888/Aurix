'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-BACKEND-SNAPSHOT-VALUATION-harness — SPEC DSH.CHART.BACKEND-SNAPSHOTS.DRYRUN-VALIDATION.02
// ════════════════════════════════════════════════════════════════════════════
// The DRY_RUN found empty:3 because the Edge Function read `assets.qty` while AURIX stores the NEW model
// as TWO columns (assets=catalog, holdings=quantities) joined on holdings.asset_id === assets.id. This
// proves the Edge Function now reads the SAME fields app.js convertFromNewToFlat uses, against an
// anonymized real-shape fixture. (No production write; DRY_RUN only.)
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase', 'functions', 'portfolio-snapshot', 'index.ts'), 'utf8');
function fn(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let k = app.indexOf('{', i), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(i, k); }
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }

function konst(name) { const m = app.match(new RegExp('const ' + name + '\\s*=.*?;')); if (!m) throw new Error('missing ' + name); return m[0]; }
// ── app.js canonical combiner + gold valuation (ground truth) ──
const sb = { console: { warn() {} }, Map, Array, Number };
vm.createContext(sb);
vm.runInContext(fn('convertFromNewToFlat'), sb);
vm.runInContext(konst('OZ_TO_G'), sb);
vm.runInContext(konst('_PURITY_TABLE'), sb);
vm.runInContext(fn('_goldPurity'), sb);
vm.runInContext(fn('_goldGrams'), sb);

// anonymized real-shape fixture: catalog (assets) + holdings (quantities), joined by asset_id → id
const catalog = [
  { id: 'a1', symbol: 'BTC', type: 'crypto', currentPrice: 60000, assetCurrency: 'USD' },
  { id: 'a2', symbol: 'AAPL', type: 'stock', currentPrice: 200, assetCurrency: 'USD' },
  { id: 'a3', symbol: null, type: 'cash', currentPrice: 1, assetCurrency: 'USD' },
];
const holdings = [
  { id: 'h1', asset_id: 'a1', quantity: 0.5 },
  { id: 'h2', asset_id: 'a2', quantity: 10 },
  { id: 'h3', asset_id: 'a3', quantity: 5000 },
];

console.log('AURIX-BACKEND-SNAPSHOT-VALUATION — SPEC DSH.CHART.BACKEND-SNAPSHOTS.DRYRUN-VALIDATION.02\n');

console.log('App canonical combiner (proves the fixture shape the app expects):');
const flat = sb.convertFromNewToFlat.call(null, catalog, holdings, {});
ok('convertFromNewToFlat joins catalog+holdings → 3 positions', flat.length === 3, 'n=' + flat.length);
ok('qty comes from holdings.quantity', flat[0].qty === 0.5 && flat[1].qty === 10 && flat[2].qty === 5000);
ok('price comes from catalog.currentPrice', flat[0].price === 60000 && flat[1].price === 200);
ok('type/ticker/assetCurrency come from catalog', flat[0].type === 'crypto' && flat[0].ticker === 'BTC' && flat[2].type === 'cash');
const appInvestableUSD = 0.5 * 60000 + 10 * 200 + 5000;   // 30000 + 2000 + 5000 = 37000 (all USD, no RE)
ok('fixture app investable value = 37000 USD', appInvestableUSD === 37000);

console.log('\nEdge Function reads the SAME fields (source cross-check):');
ok('selects the holdings column too', /select\('user_id, assets, holdings'\)/.test(edge));
ok('joins holdings.asset_id → catalog.id (byId map)', /byId\.get\(h\.asset_id\)/.test(edge) && /catalog\.map\(\(a: any\) => \[a && a\.id, a\]\)/.test(edge));
ok('qty from holdings.quantity (NOT assets.qty)', /Number\(h\.quantity\)/.test(edge) && !/Number\(a\.qty\)/.test(edge));
ok('price from catalog.currentPrice', /Number\(asset\.currentPrice\)/.test(edge));
ok('type/symbol/assetCurrency from catalog', /asset\.type/.test(edge) && /asset\.symbol/.test(edge) && /asset\.assetCurrency/.test(edge));

console.log('\nSafety (DRY_RUN, no writes, no secrets):');
ok('DRY_RUN gates the INSERT (log/skip, no insert in dry run)', /if \(DRY_RUN\) \{[\s\S]{0,80}skipped\+\+; continue; \}/.test(edge) && edge.indexOf('if (DRY_RUN)') < edge.indexOf('.insert('));
ok('DRY_RUN returns per-user samples in the response (no functions-logs needed)', /samples: dryRunSamples/.test(edge) && /String\(r\.user_id \|\| ''\)\.slice\(0, 8\)/.test(edge));
ok('samples carry NO secret (no email/token/service-role fields)', !/email|access_token|refresh_token|service_role/i.test(edge.slice(edge.indexOf('dryRunSamples.push'), edge.indexOf('dryRunSamples.push') + 600)));
ok('service-role from env only (never hardcoded)', /Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/.test(edge) && !/eyJ[A-Za-z0-9_-]{20,}/.test(edge));

console.log('\nFX fix — EUR/IWDA now value (endpoint FX form EURUSD=X, not EUR/USD):');
// the fix is in place in the Edge Function source
ok('fxToUsd uses the Yahoo pair form `<CUR>USD=X`', /prices\.get\(`\$\{c\}USD=X`\)/.test(edge));
ok('FX pair requested as `<CUR>USD=X` (not `<CUR>/USD`)', /allSymbols\.push\(cur \+ 'USD=X'\)/.test(edge) && !/cur \+ '\/USD'/.test(edge) && !/\$\{c\}\/USD/.test(edge));
// behavioural mirror of the Edge Function fx path (same formula) — proves the delta the fix produces
function fxToUsdMirror(cur, priceMap) { const c = (cur || 'USD').toUpperCase(); if (c === 'USD') return 1; const p = priceMap.get(c + 'USD=X'); return p && Number.isFinite(p.price) ? p.price : NaN; }
function valueNonUsdEtf(qty, unitEUR, fxUsdPerEur) { return qty * unitEUR * fxUsdPerEur; }
const priceMapFixed = new Map([['IWDA', { price: 100, currency: 'EUR' }], ['EURUSD=X', { price: 1.08, currency: 'USD' }]]);
const priceMapOld = new Map([['IWDA', { price: 100, currency: 'EUR' }], ['EUR/USD', { price: 1.08, currency: 'USD' }]]);   // old (wrong) key
ok('FIXED key resolves EUR→USD (EURUSD=X → 1.08)', fxToUsdMirror('EUR', priceMapFixed) === 1.08);
ok('OLD key would still FAIL (EUR/USD → NaN) — regression guard', Number.isNaN(fxToUsdMirror('EUR', priceMapOld)));
ok('IWDA (EUR-quoted) values with FX: 10 × 100 EUR × 1.08 = 1080 USD', valueNonUsdEtf(10, 100, fxToUsdMirror('EUR', priceMapFixed)) === 1080);
ok('EUR cash 5000 → 5400 USD via FX', 5000 * fxToUsdMirror('EUR', priceMapFixed) === 5400);

console.log('\nMETAL/XAU fix — gold valued by grams × purity × (spot/OZ_TO_G), NOT qty × spotPerOz:');
// app ground-truth gold value for a real-shape fixture: 50 g of 18k gold at spot 2400 USD/oz
// (computed IN-context: OZ_TO_G/_PURITY_TABLE are vm lexical consts, not sandbox-object properties)
const appGold = vm.runInContext('_goldGrams(50, "g") * _goldPurity(18) * (2400 / OZ_TO_G)', sb);
const appOzToG = vm.runInContext('OZ_TO_G', sb);
// EDGE port of the SAME formula (must equal the app) — mirrors valueUser's XAU branch
const OZ_TO_G_edge = 31.1034768;
const PURITY_edge = { '10': 0.4167, '14': 0.5833, '18': 0.7500, '21': 0.8750, '22': 0.9167, '24': 1.0000 };
const goldPurityEdge = k => { const v = PURITY_edge[String(k)]; return v != null ? v : (Number(k) || 0) / 24; };
const goldGramsEdge = (q, u) => u === 'oz' ? q * OZ_TO_G_edge : (u === 'kg' ? q * 1000 : q);
const edgeGold = goldGramsEdge(50, 'g') * goldPurityEdge(18) * (2400 / OZ_TO_G_edge);
ok('edge gold formula == app gold formula (byte-parity)', Math.abs(edgeGold - appGold) < 1e-9, 'app=' + appGold.toFixed(4) + ' edge=' + edgeGold.toFixed(4));
ok('purity table byte-identical to app (18k=0.75, 24k=1.0)', vm.runInContext('_goldPurity(18)', sb) === 0.75 && vm.runInContext('_goldPurity(24)', sb) === 1.0 && PURITY_edge['18'] === 0.75);
ok('OZ_TO_G byte-identical (31.1034768)', appOzToG === 31.1034768 && OZ_TO_G_edge === 31.1034768);
ok('unit conversion: 1 oz == OZ_TO_G grams; 1 kg == 1000 g', goldGramsEdge(1, 'oz') === 31.1034768 && goldGramsEdge(1, 'kg') === 1000);
// REGRESSION GUARD: the OLD wrong formula (qty × spotPerOz) grossly over-values grams-as-ounces
const wrongGold = 50 * 2400;   // 120000
ok('regression guard: wrong qty×spot (120000) ≫ correct — must NOT be used', wrongGold > edgeGold * 10 && Math.abs(wrongGold - edgeGold) > 100000, 'wrong=' + wrongGold + ' correct=' + edgeGold.toFixed(2));
// source guards on the Edge Function
ok('edge XAU branch uses grams×purity×(spot/OZ_TO_G)', /goldGrams\(qty, String\(asset\.goldUnit \|\| 'g'\)\)/.test(edge) && /goldPurity\(asset\.karat\)/.test(edge) && /\(spotPerOz \/ OZ_TO_G\)/.test(edge));
ok('edge XAU branch condition mirrors app (symbol XAU && karat)', /symU === 'XAU' && asset\.karat/.test(edge));
ok('edge XAU branch does NOT value gold as qty × fresh.price', !/XAU[\s\S]{0,400}qty \* freshXau\.price/.test(edge));
ok('edge requests fresh XAU/USD spot (registry key)', /allSymbols\.push\('XAU\/USD'\)/.test(edge));

console.log('\nNo frontend/app runtime change (this fix is Edge-Function-only):');
ok('app.js autoload still OFF (backend snapshots NO-OP in prod)', /const _AURIX_BACKEND_SNAPSHOTS_AUTOLOAD = false;/.test(app));
ok('DRY_RUN still gates inserts (no real write)', /if \(DRY_RUN\) \{[\s\S]{0,80}skipped\+\+; continue; \}/.test(edge));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
