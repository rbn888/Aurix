'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-UCITS-FUND-DISCOVERY-harness — SPEC 48 (Asset Search Engine, discovery only)
// ════════════════════════════════════════════════════════════════════════════
// Proves the fund-discovery layer against the REAL app.js source: fund-intent detection,
// name/manager/ISIN resolution over the curated seed, manager/currency parsing from a
// fund name, relevance ranking (exact first), the fund display subtitle, catalog
// integrity (no dup tickers/ISINs, valid ISIN shape), and NON-REGRESSION for
// stocks/ETFs/indices/crypto (fund paths never fire for non-fund queries). Pure /
// deterministic — no network, no DOM. Nothing modified.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(s, i) { let d = 0, k = s.indexOf('{', i); const openIsBracket = s[i] === '['; if (openIsBracket) k = i; let open = s[k]; let close = open === '[' ? ']' : '}'; for (; k < s.length; k++) { const c = s[k]; if (c === open) d++; else if (c === close) { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing fn ' + n); return braceSlice(app, i); }
function konstSrc(n) {
  const m = new RegExp('const ' + n + '\\s*=\\s*').exec(app);
  if (!m) throw new Error('missing const ' + n);
  const eq = m.index + m[0].length, first = app[eq];
  if (first === '{' || first === '[') { const body = braceSlice(app, eq); const semi = app.indexOf(';', eq + body.length); return app.slice(m.index, semi + 1); }
  const semi = app.indexOf(';', eq); return app.slice(m.index, semi + 1);
}
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const ctx = { console: { log() {} }, Math, JSON, Array, Object, String, Number, isFinite, RegExp, Date };
vm.createContext(ctx);
['_AURIX_FUND_DISCOVERY', '_AURIX_FUND_MANAGER_LABEL', '_AURIX_FUND_KEYWORDS', '_AURIX_FUND_DB'].forEach(c => vm.runInContext(konstSrc(c), ctx));
['_aurixParseFundMeta', '_aurixIsIsin', '_aurixLooksLikeFundQuery', '_aurixSearchFundsLocal', '_aurixRankSearchResults', '_aurixSearchSubtitle'].forEach(f => vm.runInContext(fnSrc(f), ctx));
const call = (n, ...a) => vm.runInContext(n, ctx)(...a);
const DB = vm.runInContext('_AURIX_FUND_DB', ctx);

console.log('\nAURIX-UCITS-FUND-DISCOVERY — SPEC 48');

// ── 0 presence / wiring ───────────────────────────────────────────────────────
ok('0 flag + funcs + fund route + typeLabel + subtitle wired', app.indexOf('SPEC 48 — UCITS FUND DISCOVERY') >= 0
  && /const _AURIX_FUND_DISCOVERY = true;/.test(app)
  && app.indexOf("filter === 'fund'") >= 0
  && /typeLabel: \{ crypto: 'Cripto'.*fund: 'Fondo' \}/.test(app)
  && /typeLabel: \{ crypto: 'Crypto'.*fund: 'Fund' \}/.test(app)
  && app.indexOf('_aurixSearchSubtitle(a) : a.ticker') >= 0);

// ── 1 búsqueda por nombre parcial ──────────────────────────────────────────────
{
  const r = call('_aurixSearchFundsLocal', 'vanguard glob');
  ok('1 nombre parcial "vanguard glob" → Vanguard Global', r.length >= 1 && r.some(x => /Vanguard Global/i.test(x.name)));
  ok('1 resultado lleva type=fund + manager + currency', r[0] && r[0].type === 'fund' && r[0].manager === 'Vanguard' && r[0].assetCurrency === 'EUR');
}

// ── 2 búsqueda por nombre completo ─────────────────────────────────────────────
{
  // SPEC 53B — nombres comerciales cortos; el nombre visible es "Vanguard US 500 Stock Index".
  const full = 'Vanguard US 500 Stock Index';
  const r = call('_aurixSearchFundsLocal', full.toLowerCase());
  ok('2 nombre comercial completo → encontrado', r.some(x => x.name === full));
  const ranked = call('_aurixRankSearchResults', r, full);
  ok('2 coincidencia exacta de nombre rankea primero', ranked[0] && ranked[0].name === full);
}

// ── 3 búsqueda por ISIN ────────────────────────────────────────────────────────
{
  ok('3 _aurixIsIsin reconoce ISIN válido', call('_aurixIsIsin', 'IE00B03HD191') === true && call('_aurixIsIsin', 'NOTANISIN') === false);
  const r = call('_aurixSearchFundsLocal', 'IE00B03HD191');
  ok('3 búsqueda por ISIN → el fondo correcto', r.length === 1 && r[0].isin === 'IE00B03HD191');
}

// ── 4 búsqueda por gestora ─────────────────────────────────────────────────────
{
  const r = call('_aurixSearchFundsLocal', 'amundi');
  ok('4 gestora "amundi" → ≥1 fondo Amundi', r.length >= 1 && r.every(x => x.manager === 'Amundi'));
}

// ── 5 gestoras populares ES/EU representadas ───────────────────────────────────
{
  const managers = ['vanguard', 'ishares', 'amundi', 'fidelity', 'jpmorgan', 'pictet', 'dws', 'franklin', 'invesco', 'blackrock'];
  const missing = managers.filter(m => call('_aurixLooksLikeFundQuery', m) !== true || call('_aurixSearchFundsLocal', m).length < 1);
  ok('5 todas las gestoras nombradas resuelven (intent + ≥1 fondo)', missing.length === 0, 'missing=' + missing.join(','));
}

// ── 6 fund-intent detection ────────────────────────────────────────────────────
{
  ok('6 intent TRUE para keywords/gestora/ISIN', call('_aurixLooksLikeFundQuery', 'msci world index') && call('_aurixLooksLikeFundQuery', 'pictet') && call('_aurixLooksLikeFundQuery', 'IE0032620787'));
  ok('6 intent FALSE para acción/cripto', call('_aurixLooksLikeFundQuery', 'AAPL') === false && call('_aurixLooksLikeFundQuery', 'BTC') === false);
}

// ── 7 parseo de gestora/divisa desde el nombre (para fondos de Yahoo) ──────────
{
  const m = call('_aurixParseFundMeta', 'iShares Developed World Index Fund (IE) EUR Acc');
  ok('7 parse Yahoo fund name → iShares + EUR', m.manager === 'iShares' && m.currency === 'EUR');
  const m2 = call('_aurixParseFundMeta', 'Franklin Technology Fund A(acc)USD');
  ok('7 parse → Franklin Templeton + USD', m2.manager === 'Franklin Templeton' && m2.currency === 'USD');
}

// ── 8 subtitle de fondo muestra gestora · divisa · ISIN ────────────────────────
{
  const f = { type: 'fund', ticker: 'VG-WLD', manager: 'Vanguard', assetCurrency: 'EUR', isin: 'IE00B03HD191' };
  ok('8 subtitle fondo = "Vanguard · EUR · IE00B03HD191"', call('_aurixSearchSubtitle', f) === 'Vanguard · EUR · IE00B03HD191');
  ok('8 subtitle no-fondo = ticker (sin cambios)', call('_aurixSearchSubtitle', { type: 'stock', ticker: 'AAPL' }) === 'AAPL');
}

// ── 9 relevancia: exacto → prefijo → contiene ──────────────────────────────────
{
  const items = [
    { ticker: 'ZZZ', name: 'holds aapl inside name' }, // contiene → 2
    { ticker: 'AAPLX', name: 'Apple Long Variant' },   // prefijo de ticker → 1
    { ticker: 'AAPL', name: 'Apple' },                 // exacto → 0
  ];
  const ranked = call('_aurixRankSearchResults', items, 'aapl');
  ok('9 exacto (AAPL) primero, luego prefijo (AAPLX), luego contiene (ZZZ)', ranked[0].ticker === 'AAPL' && ranked[1].ticker === 'AAPLX' && ranked[2].ticker === 'ZZZ', ranked.map(x => x.ticker).join(','));
  // estabilidad: misma puntuación conserva orden de entrada
  const stable = call('_aurixRankSearchResults', [{ ticker: 'X1', name: 'nvidia corp' }, { ticker: 'X2', name: 'nvidia holding' }], 'nvidia');
  ok('9 estable dentro del mismo tier (orden de entrada)', stable[0].ticker === 'X1' && stable[1].ticker === 'X2');
}

// ── 10 NO REGRESIÓN acciones/etf/índice/cripto ─────────────────────────────────
{
  ok('10 query de acción NO inyecta fondos', call('_aurixSearchFundsLocal', 'AAPL').length === 0 && call('_aurixSearchFundsLocal', 'TSLA').length === 0);
  ok('10 query de cripto NO inyecta fondos', call('_aurixSearchFundsLocal', 'BTC').length === 0);
  // rank preserva el conjunto (mismos elementos, sin perder ni duplicar) para lista no-fondo
  const nonFund = [{ ticker: 'SPY', name: 'SPDR S&P 500' }, { ticker: 'QQQ', name: 'Invesco QQQ' }, { ticker: 'VTI', name: 'Vanguard Total' }];
  const out = call('_aurixRankSearchResults', nonFund.slice(), 'spy');
  ok('10 rank conserva todos los items no-fondo', out.length === 3 && ['SPY', 'QQQ', 'VTI'].every(t => out.some(x => x.ticker === t)));
}

// ── 11 sin duplicados en el catálogo (tickers e ISINs únicos) ──────────────────
{
  const tks = DB.map(f => f.ticker), isins = DB.map(f => f.isin).filter(Boolean);
  ok('11 tickers únicos en el seed', new Set(tks).size === tks.length);
  ok('11 ISINs únicos en el seed', new Set(isins).size === isins.length);
  ok('11 ISINs presentes tienen forma ISO válida', isins.every(x => call('_aurixIsIsin', x)), isins.filter(x => !call('_aurixIsIsin', x)).join(','));
  ok('11 cada entrada tiene ticker+name+manager+currency+type-implícito', DB.every(f => f.ticker && f.name && f.manager && f.currency));
}

// ── 12 tiempo de respuesta equivalente (búsqueda local O(n) trivial) ───────────
{
  const t0 = Date.now();
  for (let i = 0; i < 5000; i++) call('_aurixSearchFundsLocal', 'vanguard');
  const ms = Date.now() - t0;
  ok('12 5000 búsquedas locales < 500ms (coste despreciable)', ms < 500, ms + 'ms');
}

// ── 13 SPEC 50 — corrección de datos: ISIN válido (forma + dígito de control),
//    todos los 18 con ISIN, únicos, sin registros CONFLICT (ISINs malos ausentes) ──
{
  // Validador ISIN con dígito de control (Luhn sobre expansión de letras A=10..Z=35).
  const validIsinCheck = s => {
    if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(s)) return false;
    let digits = '';
    for (const ch of s) digits += (ch >= 'A' && ch <= 'Z') ? (ch.charCodeAt(0) - 55).toString() : ch;
    let sum = 0, dbl = false;
    for (let i = digits.length - 1; i >= 0; i--) { let d = +digits[i]; if (dbl) { d *= 2; if (d > 9) d -= 9; } sum += d; dbl = !dbl; }
    return sum % 10 === 0;
  };
  const allIsins = DB.map(f => f.isin);
  ok('13 catálogo lanzamiento = 25 registros, todos con ISIN', DB.length === 25 && allIsins.every(x => typeof x === 'string' && x.length === 12), 'n=' + DB.length);
  ok('13 todos los ISIN pasan el dígito de control', allIsins.every(validIsinCheck), allIsins.filter(x => !validIsinCheck(x)).join(','));
  ok('13 ISINs únicos', new Set(allIsins).size === allIsins.length);
  // ISINs corregidos presentes (los productos/clases correctos de SPEC 49)
  const mustHave = ['IE0008248795', 'LU0270904781', 'LU0109392836', 'LU0056508442', 'IE00BYX5NX33', 'LU0210534227', 'LU0052864419'];
  ok('13 ISINs corregidos/rellenados presentes', mustHave.every(x => allIsins.indexOf(x) >= 0), mustHave.filter(x => allIsins.indexOf(x) < 0).join(','));
  // ISINs CONFLICT (incorrectos) ausentes → ya no hay registros CONFLICT
  const mustNotHave = ['IE0007987690', 'LU0270904983', 'LU0260870158', 'LU0171310443'];
  ok('13 ISINs CONFLICT (incorrectos) eliminados', mustNotHave.every(x => allIsins.indexOf(x) < 0), mustNotHave.filter(x => allIsins.indexOf(x) >= 0).join(','));
  // el nombre/divisa de los ex-CONFLICT sigue coherente con el producto previsto
  const byTicker = t => DB.find(f => f.ticker === t) || {};
  ok('13 VG-EUR sigue Eurozone EUR (ISIN Eurozone real)', byTicker('VG-EUR').isin === 'IE0008248795' && /Eurozone/i.test(byTicker('VG-EUR').name) && byTicker('VG-EUR').currency === 'EUR');
  ok('13 FT-TECH y BGF-WT clase USD (nombre USD ↔ ISIN USD)', byTicker('FT-TECH').currency === 'USD' && byTicker('FT-TECH').isin === 'LU0109392836' && byTicker('BGF-WT').currency === 'USD' && byTicker('BGF-WT').isin === 'LU0056508442');
}

// ── 14 SPEC 53B — nombres comerciales cortos, altas nuevas, monetarios, tope ───
{
  const byTicker = t => DB.find(f => f.ticker === t) || {};
  // caps: 20–30 índice + 3–5 monetarios
  const mmf = DB.filter(f => f.category === 'money_market');
  const idx = DB.filter(f => f.category !== 'money_market');
  ok('14 dentro de tope (índice 20-30, MMF 3-5)', idx.length >= 20 && idx.length <= 30 && mmf.length >= 3 && mmf.length <= 5, 'idx=' + idx.length + ' mmf=' + mmf.length);
  // nombres comerciales cortos: sin coletillas legales largas en el título
  const bad = DB.filter(f => /\bFund\b|Institutional|Index Solutions|Acc\b|Dist\b|\bUCITS\b|A\(acc\)/.test(f.name));
  ok('14 nombres visibles cortos (sin "Fund/Acc/Institutional/…" en título)', bad.length === 0, bad.map(f => f.name).join(' | '));
  ok('14 pero conserva "Hedged" cuando es definitorio (VG-GB)', /Hedged/.test(byTicker('VG-GB').name));
  // metadatos legales conservados
  ok('14 legalName + shareClass como metadatos en todos', DB.every(f => f.legalName && f.shareClass));
  // altas nuevas de índice presentes
  ok('14 Fidelity S&P 500 (nuevo) presente', byTicker('FID-500').isin === 'IE00BYX5MX67' && /Fidelity S&P 500/.test(byTicker('FID-500').name));
  ok('14 MyInvestor Nasdaq 100 (nuevo) presente', byTicker('MI-NDX').isin === 'ES0165265002');
  // fondos monetarios presentes y buscables por "monetario"/nombre
  ok('14 5 monetarios presentes (Groupama/AXA/Amundi/BNP/BlackRock)', ['GRP-TRES', 'AXA-TCT', 'AM-LIQ', 'BNP-IC', 'BLK-ICS'].every(t => byTicker(t).isin));
  ok('14 monetario encontrable por "monetario"', call('_aurixSearchFundsLocal', 'monetario').length >= 3);
  ok('14 monetario encontrable por gestora ("groupama")', call('_aurixSearchFundsLocal', 'groupama').some(x => x.isin === 'FR0000989626'));
  // nuevas búsquedas comerciales típicas resuelven
  ok('14 "nasdaq" → MyInvestor Nasdaq 100', call('_aurixSearchFundsLocal', 'nasdaq').some(x => x.isin === 'ES0165265002'));
  ok('14 "fidelity s&p 500" → Fidelity S&P 500 Index', call('_aurixSearchFundsLocal', 'fidelity s&p 500').some(x => x.isin === 'IE00BYX5MX67'));
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  (' + pass + ' passed, ' + fail + ' failed)\n');
process.exit(fail === 0 ? 0 : 1);
