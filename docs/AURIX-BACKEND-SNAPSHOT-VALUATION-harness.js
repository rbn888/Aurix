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

// ── app.js canonical combiner (ground truth for the field mapping) ──
const sb = { console: { warn() {} }, Map, Array };
vm.createContext(sb);
vm.runInContext(fn('convertFromNewToFlat'), sb);

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

console.log('\nNo frontend/app runtime change (this fix is Edge-Function-only):');
ok('app.js autoload still OFF (backend snapshots NO-OP in prod)', /const _AURIX_BACKEND_SNAPSHOTS_AUTOLOAD = false;/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
