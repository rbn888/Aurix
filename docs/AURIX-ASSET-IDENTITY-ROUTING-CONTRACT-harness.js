'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ASSET-IDENTITY-ROUTING-CONTRACT-harness — SPEC 70 (ASSET IDENTITY, PRICING & ROUTING)
// ════════════════════════════════════════════════════════════════════════════
// Contract: Search → identity → routing must be unambiguous and lossless for every V1 fund/ETF.
// CANARY IE00BYX5NX33 (Fidelity MSCI World). Proves:
//  • an EXACT ISIN resolves EXACTLY ONE share class (no "three indistinguishable options");
//  • each result carries full identity (commercial name, manager, currency, share class, ISIN, type);
//  • the disambiguating subtitle covers BOTH funds AND ETFs (plain items still fall back to ticker);
//  • every V1 fund routes to the Fondos/ETF section (fund→etf via _aurixDisplayCategory, SPEC 66/68);
//  • the search merge dedupes by ISIN across sources (source pin);
//  • commercial names are short (not the truncated legal name).
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing fn ' + n); return braceSlice(app, i); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

// Sandbox with the real fund DB + helpers + a TYPE_META stub (no 'fund'/'commodity', as in prod).
const ctx = { console: { log() {} }, Array, String, Object, Number };
ctx.TYPE_META = { crypto: {}, stock: {}, etf: {}, metal: {}, cash: {}, real_estate: {}, other: {} };
vm.createContext(ctx);
vm.runInContext(app.match(/const _AURIX_FUND_DB = \[[\s\S]*?\n\];/)[0], ctx);
vm.runInContext(app.match(/const _AURIX_FUND_MANAGER_LABEL = \{[\s\S]*?\};/)[0], ctx);
vm.runInContext('const _AURIX_FUND_DISCOVERY = true;', ctx);
['_aurixIsIsin', '_aurixParseFundMeta', '_aurixSearchFundsLocal', '_aurixSearchSubtitle', '_aurixDisplayCategory'].forEach(f => vm.runInContext(fnSrc(f), ctx));
const fl  = q => vm.runInContext('_aurixSearchFundsLocal', ctx)(q);
const sub = a => vm.runInContext('_aurixSearchSubtitle', ctx)(a);
const cat = t => vm.runInContext('_aurixDisplayCategory', ctx)(t);
const DB  = vm.runInContext('_AURIX_FUND_DB', ctx);

console.log('AURIX-ASSET-IDENTITY-ROUTING-CONTRACT — SPEC 70\n');

// ── 1 CANARY IE00BYX5NX33 ────────────────────────────────────────────────────
console.log('1 — CANARY IE00BYX5NX33 (Fidelity MSCI World):');
const canary = fl('IE00BYX5NX33');
ok('1.1 exact ISIN → EXACTLY ONE result (unambiguous)', canary.length === 1, 'n=' + canary.length);
const c = canary[0] || {};
ok('1.2 type is fund', c.type === 'fund');
ok('1.3 commercial name (short, not legal-truncated)', c.name === 'Fidelity MSCI World');
ok('1.4 carries manager', c.manager === 'Fidelity');
ok('1.5 carries currency', c.assetCurrency === 'EUR');
ok('1.6 carries share class', c.shareClass === 'P Acc EUR');
ok('1.7 carries ISIN', c.isin === 'IE00BYX5NX33');
ok('1.8 subtitle disambiguates (manager · shareClass · ISIN)', sub(c) === 'Fidelity · P Acc EUR · IE00BYX5NX33');
ok('1.9 routes to Fondos/ETF (fund → etf)', cat(c.type) === 'etf');

// ── 2 additional canary IE0031786142 ─────────────────────────────────────────
console.log('2 — additional canary IE0031786142:');
const c2 = fl('IE0031786142');
ok('2.1 exact ISIN → exactly one result', c2.length === 1, 'n=' + c2.length);
ok('2.2 full identity + routes to etf', c2[0] && c2[0].type === 'fund' && c2[0].isin === 'IE0031786142' && cat(c2[0].type) === 'etf');

// ── 3 EVERY V1 fund: lossless identity + unambiguous exact-ISIN + correct routing ──
console.log('3 — all V1 funds (identity + exact-ISIN + routing):');
let idOk = 0, isinOk = 0, routeOk = 0, nameOk = 0;
DB.forEach(f => {
  if (f.legalName && f.shareClass && f.manager && f.currency && f.isin) idOk++;
  const r = fl(f.isin);
  if (r.length === 1 && r[0].isin === f.isin) isinOk++;                 // exact ISIN → single exact match
  if (cat('fund') === 'etf') routeOk++;                                 // fund routes to Fondos/ETF
  if (f.name && f.name.length <= 42) nameOk++;                          // commercial (short — never a truncated long legal string)
});
ok('3.1 every fund has full identity (legalName+shareClass+manager+currency+ISIN)', idOk === DB.length, idOk + '/' + DB.length);
ok('3.2 every fund ISIN resolves to exactly one exact match', isinOk === DB.length, isinOk + '/' + DB.length);
ok('3.3 every fund routes to Fondos/ETF', routeOk === DB.length, routeOk + '/' + DB.length);
ok('3.4 every fund shows a commercial (short ≤42, never a truncated long legal name) name', nameOk === DB.length, nameOk + '/' + DB.length);

// ── 4 money-market funds V1 present with identity ────────────────────────────
console.log('4 — money-market funds V1:');
const mm = DB.filter(f => f.category === 'money_market');
ok('4.1 at least one money-market fund catalogued', mm.length >= 1, 'n=' + mm.length);
ok('4.2 money-market funds carry full identity + route to etf', mm.every(f => f.isin && f.shareClass && f.manager) && cat('fund') === 'etf');

// ── 5 subtitle covers ETF too; plain items fall back to ticker ───────────────
console.log('5 — ETF disambiguation (no regression for plain items):');
ok('5.1 ETF with metadata → rich subtitle', sub({ type: 'etf', ticker: 'CSPX', manager: 'iShares', shareClass: 'Acc', isin: 'IE00B5BMR087' }) === 'iShares · Acc · IE00B5BMR087');
ok('5.2 plain ETF (no metadata) → ticker (unchanged)', sub({ type: 'etf', ticker: 'VOO' }) === 'VOO');
ok('5.3 stock → ticker (unchanged)', sub({ type: 'stock', ticker: 'AAPL' }) === 'AAPL');

// ── 6 search merge dedupes by ISIN across sources (source pin) ───────────────
console.log('6 — ISIN-first dedupe in the search merge:');
const merge = app.slice(app.indexOf('const funds = _aurixSearchFundsLocal(query);'), app.indexOf('const funds = _aurixSearchFundsLocal(query);') + 900);
ok('6.1 merge keys by ISIN when present (collapses same-ISIN variants)', /const isin = item\.isin \? String\(item\.isin\)\.toUpperCase\(\)\.trim\(\) : '';/.test(merge) && /'ISIN:' \+ isin/.test(merge));

// ── 7 AUTOMATIC NAV pricing contract (funds are NOT frozen/manual when a source exists) ──
console.log('7 — automatic NAV pricing owner + provider-key adoption:');
// The single owner that maps an ISIN → the priceable NAV symbol Yahoo serves (Morningstar 0P* preferred).
const yfs = fnSrc('_yahooFundSymbolByISIN');
ok('7.1 _yahooFundSymbolByISIN queries the search endpoint by ISIN', /\/api\/search\/assets\?q=\$\{encodeURIComponent\(isin\)\}/.test(yfs));
ok('7.2 it prefers the Morningstar 0P* NAV code', /\^0P\[A-Z0-9\]\+/.test(yfs));
// selectAsset must resolve + ADOPT the automatic symbol for a curated fund (ISIN, no marketSymbol),
// instead of dropping to MANUAL — so pricing, persistence and refresh use the automatic path.
const sa = fnSrc('selectAsset');
ok('7.3 selectAsset resolves the automatic symbol for a fund w/ ISIN & no marketSymbol',
   /entry\.type === 'fund' && entry\.isin && !entry\.marketSymbol/.test(sa) && /_yahooFundSymbolByISIN\(entry\.isin\)/.test(sa));
ok('7.4 the resolved symbol is ADOPTED as the provider key (persists + refreshes)',
   /entry\.marketSymbol\s*=\s*_fundSym;/.test(sa) && /pendingMarketSymbol = _fundSym;/.test(sa));
ok('7.5 it prices via the standard quote resolver (automatic NAV, not manual)', /resolveSymbolQuote\(_fundSym\)/.test(sa));
// Persistence: the submit stamps marketSymbol from the selected asset (so the adopted 0P* survives reopen).
ok('7.6 submit persists marketSymbol from the selected asset', /const \{ ticker, type, coinId[^}]*marketSymbol[^}]*\} = selectedDbAsset;/.test(app) && /coinId, marketSymbol,/.test(app));
// MC-7 remains the EXPLICIT manual fallback ONLY when no automatic symbol resolves (price stays null).
ok('7.7 MC-7 manual path stays as the explicit fallback (labelled "Manual NAV")', /Manual NAV — no provider price for this fund/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
