'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-INSTITUTIONAL-DISPLAY-NAME-harness — SPEC 52 (presentation-only display name)
// ════════════════════════════════════════════════════════════════════════════
// Proves, against the REAL app.js source: a SINGLE display-name owner (getDisplayName);
// same commercial name regardless of discovery provider (Apple Inc./Corporation/", Inc."/
// ASSET_DB "Apple" → "Apple"); preservation of every class distinguisher for funds/ETFs
// (Acc/Dist, Hedged, currency, class letter, UCITS, ETF — returned unchanged); no
// regression for crypto/index/metal; the legal name is never mutated; and the global
// overlay bypass is removed (gs-row-name now routes through getDisplayName). Pure/no DOM.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(s, i) { let k = (s[i] === '[' || s[i] === '{') ? i : s.indexOf('{', i); const open = s[k], close = open === '[' ? ']' : '}'; let d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === open) d++; else if (c === close) { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing fn ' + n); return braceSlice(app, i); }
function konstSrc(n) { const m = new RegExp('const ' + n + '\\s*=\\s*').exec(app); if (!m) throw new Error('missing const ' + n); const eq = m.index + m[0].length, first = app[eq]; if (first === '{' || first === '[') { const body = braceSlice(app, eq); const semi = app.indexOf(';', eq + body.length); return app.slice(m.index, semi + 1); } const semi = app.indexOf(';', eq); return app.slice(m.index, semi + 1); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const ctx = { console: { log() {} }, Math, JSON, String, Array, Object, RegExp };
ctx.lang = 'es';
ctx.T = { es: { metalNames: { XAU: 'Oro', XAG: 'Plata' } } };
vm.createContext(ctx);
['_AURIX_INSTITUTIONAL_DISPLAY_NAME', '_AURIX_LEGAL_SUFFIXES'].forEach(c => vm.runInContext(konstSrc(c), ctx));
['_aurixStripLegalSuffix', '_aurixInstitutionalDisplayName', 'getDisplayName'].forEach(f => vm.runInContext(fnSrc(f), ctx));
const dn = a => vm.runInContext('getDisplayName', ctx)(a);
const strip = s => vm.runInContext('_aurixStripLegalSuffix', ctx)(s);

console.log('\nAURIX-INSTITUTIONAL-DISPLAY-NAME — SPEC 52');

// ── 0 único owner + flag + overlay bypass eliminado ────────────────────────────
ok('0 SPEC 52 marker + flag + single getDisplayName owner', app.indexOf('SPEC 52 — INSTITUTIONAL DISPLAY NAME') >= 0
  && /const _AURIX_INSTITUTIONAL_DISPLAY_NAME = true;/.test(app)
  && (app.match(/^function getDisplayName\(/gm) || []).length === 1);
ok('0 overlay global enrutado por getDisplayName (bypass eliminado)', app.indexOf('gs-row-name">${_gsEscape((typeof getDisplayName') >= 0
  && app.indexOf('gs-row-name">${_gsEscape(item.name)}') < 0);

// ── 1 mismo nombre independiente del proveedor (acciones) ──────────────────────
{
  const variants = ['Apple Inc.', 'Apple Corporation', 'Apple, Inc.', 'Apple Inc', 'Apple'];
  const outs = variants.map(nm => dn({ type: 'stock', ticker: 'AAPL', name: nm }));
  ok('1 todas las formas de "Apple*" → "Apple"', outs.every(o => o === 'Apple'), outs.join(' | '));
  ok('1 ASSET_DB corto == Yahoo legal despues de política', dn({ type: 'stock', ticker: 'MSFT', name: 'Microsoft Corporation' }) === dn({ type: 'stock', ticker: 'MSFT', name: 'Microsoft' }));
}

// ── 2 misma entrada → nombre estable en todas las vistas (función determinista) ─
{
  const a = { type: 'stock', ticker: 'NVDA', name: 'NVIDIA Corporation' };
  ok('2 determinista (idéntico en cada llamada/vista)', dn(a) === 'NVIDIA' && dn(a) === dn(a));
}

// ── 3 conservación Acc / Dist (fondos/ETF sin tocar) ───────────────────────────
{
  ok('3 fondo EUR Acc intacto', dn({ type: 'fund', ticker: 'VG-WLD', name: 'Vanguard Global Stock Index Fund EUR Acc' }) === 'Vanguard Global Stock Index Fund EUR Acc');
  ok('3 clase Dist intacta', dn({ type: 'fund', ticker: 'X', name: 'DWS Top Dividende LD' }) === 'DWS Top Dividende LD');
}

// ── 4 conservación Hedged / Unhedged ───────────────────────────────────────────
{
  ok('4 "EUR Hedged Acc" intacto', dn({ type: 'fund', ticker: 'VG-GB', name: 'Vanguard Global Bond Index Fund EUR Hedged Acc' }) === 'Vanguard Global Bond Index Fund EUR Hedged Acc');
}

// ── 5 conservación de divisa que diferencia clases + clase A + UCITS + ETF ──────
{
  ok('5 clase A(acc)USD intacta', dn({ type: 'fund', ticker: 'FT-TECH', name: 'Franklin Technology Fund A(acc)USD' }) === 'Franklin Technology Fund A(acc)USD');
  ok('5 UCITS ETF USD (Acc) intacto', dn({ type: 'etf', ticker: 'IWDA', name: 'iShares Core MSCI World UCITS ETF USD (Acc)' }) === 'iShares Core MSCI World UCITS ETF USD (Acc)');
  const eur = dn({ type: 'fund', ticker: 'FT', name: 'Franklin Technology Fund A(acc)EUR' });
  const usd = dn({ type: 'fund', ticker: 'FT', name: 'Franklin Technology Fund A(acc)USD' });
  ok('5 divisa que diferencia clases se conserva (EUR≠USD visibles)', eur !== usd && /EUR/.test(eur) && /USD/.test(usd));
}

// ── 6 no regresión: crypto / index / metal ─────────────────────────────────────
{
  ok('6 crypto intacto', dn({ type: 'crypto', ticker: 'BTC', name: 'Bitcoin' }) === 'Bitcoin');
  ok('6 index intacto', dn({ type: 'index', ticker: '^GSPC', name: 'S&P 500' }) === 'S&P 500');
  ok('6 metal traducido (rama metal preservada)', dn({ type: 'metal', ticker: 'XAU', name: 'Oro (Gold)' }) === 'Oro');
}

// ── 7 stripping conservador (no sobre-recorta marcas ambiguas) ─────────────────
{
  ok('7 "Realty Income Corporation" → "Realty Income"', dn({ type: 'stock', ticker: 'O', name: 'Realty Income Corporation' }) === 'Realty Income');
  ok('7 "Prologis, Inc." → "Prologis"', dn({ type: 'stock', ticker: 'PLD', name: 'Prologis, Inc.' }) === 'Prologis');
  ok('7 "ASML Holding" NO se recorta (Holding no es sufijo legal)', dn({ type: 'stock', ticker: 'ASML', name: 'ASML Holding' }) === 'ASML Holding');
  ok('7 "Visa" sin sufijo → intacto', dn({ type: 'stock', ticker: 'V', name: 'Visa' }) === 'Visa');
  ok('7 "Toyota Motor Co., Ltd." → "Toyota Motor" (multi-sufijo)', dn({ type: 'stock', ticker: 'TM', name: 'Toyota Motor Co., Ltd.' }) === 'Toyota Motor');
}

// ── 8 el nombre legal NO se muta (presentación pura) ───────────────────────────
{
  const a = { type: 'stock', ticker: 'AAPL', name: 'Apple Inc.' };
  const before = a.name;
  dn(a);
  ok('8 a.name intacto tras getDisplayName', a.name === before && a.name === 'Apple Inc.');
}

// ── 9 flag OFF ⇒ comportamiento previo (a.name verbatim) ───────────────────────
{
  const ctx2 = { console: { log() {} }, Math, JSON, String, Array, Object, RegExp, lang: 'es', T: ctx.T };
  vm.createContext(ctx2);
  vm.runInContext('const _AURIX_INSTITUTIONAL_DISPLAY_NAME = false;', ctx2);
  vm.runInContext(konstSrc('_AURIX_LEGAL_SUFFIXES'), ctx2);
  ['_aurixStripLegalSuffix', '_aurixInstitutionalDisplayName', 'getDisplayName'].forEach(f => vm.runInContext(fnSrc(f), ctx2));
  const off = vm.runInContext('getDisplayName', ctx2);
  ok('9 flag OFF → nombre verbatim (Apple Inc.)', off({ type: 'stock', ticker: 'AAPL', name: 'Apple Inc.' }) === 'Apple Inc.');
  ok('9 flag OFF → metal aún traducido', off({ type: 'metal', ticker: 'XAU', name: 'Oro (Gold)' }) === 'Oro');
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  (' + pass + ' passed, ' + fail + ' failed)\n');
process.exit(fail === 0 ? 0 : 1);
