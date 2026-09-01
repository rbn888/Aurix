'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-WORKSPACE-FORMULA-INTEGRITY-harness — SPEC P0 WORKSPACE FORMULA INTEGRITY
// ════════════════════════════════════════════════════════════════════════════
// UNKNOWN ≠ ZERO, en la TERCERA superficie: las fórmulas PUBLICADAS de Workspace.
//
// El defecto, reproducido con los owners reales ANTES de tocar nada. `assetValueUSD`
// lee la cantidad a través de `assetNativeValue` = qty × price, y `null * 200` es
// 0 FINITO, así que:
//
//   ASSET.QTY('AAPL')      → 0        (una cantidad que nadie conoce, publicada como 0)
//   ASSET.PNL_PCT('AAPL')  → −100     (sobre costBasis 5000)
//   PORTFOLIO.PNL_PCT()    → −82,76 % (una válida + una desconocida)
//   PORTFOLIO.WORST()      → 'MSFT'   (una posición sin valorar gana el ranking)
//
// Y numerador y denominador venían de universos DISTINTOS entre agregadores:
// con qty {} / 'abc', `_aw8PortfolioUnrealizedTotal` excluía la posición de pnl Y de
// cost (25 % sobre 800), mientras `_wp5PortfolioAnalytics` la mantenía en el coste
// → PORTFOLIO.COST publicaba 5800. Dos cifras de la misma cartera, incoherentes.
//
// Y `_buildWorkspaceRiskCategories` afirmaba "Baja diversificación (3 posiciones)"
// habiendo 4 registros abiertos: un hecho literalmente falso.
//
// EL CONTRATO, reutilizando la regla canónica de UNKNOWN QUANTITY INTEGRITY sin
// crear una segunda definición:
//   qty > 0              → se valora normalmente, exactamente como antes
//   qty === 0 / −0       → posición cerrada legítima, NO se convierte en UNKNOWN
//   qty < 0 / UNKNOWN    → #N/A (la semántica que PORTFOLIO.CAGR ya usaba), nunca 0
//   agregados de cartera → fail-closed si alguna posición no es certificable
//   panel de riesgo      → no afirma nada; enuncia la parcialidad
//
// Este gate EJECUTA los owners reales extraídos de app.js. No reimplementa ninguno.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

let pass = 0, fail = 0;
function ok(n, c, info) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } }

function fnSrc(n) {
  const s = 'function ' + n + '('; const i = app.indexOf(s);
  if (i < 0) throw new Error('missing ' + n);
  let p = app.indexOf('(', i), pd = 0;
  for (; p < app.length; p++) { if (app[p] === '(') pd++; else if (app[p] === ')') { pd--; if (!pd) { p++; break; } } }
  let k = app.indexOf('{', p), d = 0;
  for (; k < app.length; k++) { if (app[k] === '{') d++; else if (app[k] === '}') { d--; if (!d) { k++; break; } } }
  return app.slice(i, k);
}
function konstSrc(name) {
  const s = 'const ' + name + ' ='; const i = app.indexOf(s);
  if (i < 0) throw new Error('missing const ' + name);
  let k = i, depth = 0, started = false;
  for (; k < app.length; k++) { const c = app[k];
    if (c === '(' || c === '{' || c === '[') { depth++; started = true; }
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (c === ';' && (!started || depth === 0)) { k++; break; } }
  return app.slice(i, k);
}

let sb = null, buildErr = null;
try {
  sb = { Math, Number, JSON, Array, Object, String, isFinite, Infinity, NaN, Set,
    console: { warn() {}, log() {}, debug() {} }, window: {} };
  vm.createContext(sb);
  sb.usdToEur = 0.92; sb.OZ_TO_G = 31.1034768;
  sb._goldGrams = q => q; sb._goldPurity = () => 1; sb._aurixFxRate = () => NaN;
  sb.normalizeSymbol = s => String(s || '').toUpperCase();
  sb._aurixCategoryBucket = a => (a && a.type) || 'other';
  sb.toBase = v => v;
  vm.runInContext('var baseCurrency = "USD";', sb);
  // i18n stub: devuelve la CLAVE, así el gate afirma sobre QUÉ mensaje se emite y nunca
  // sobre su redacción — una aserción sobre texto traducible sería una aserción vacua.
  sb.t = (k) => { const f = (...a) => k + '(' + a.join(',') + ')'; f.toString = () => k; return f; };
  vm.runInContext('var assets = []; var WORKSPACE_RUNTIME = { stale: false };', sb);
  vm.runInContext('function _AwEvalError(code){ this.code = code; } _AwEvalError.prototype = Object.create(Error.prototype);', sb);
  ['_aurixUsableQuantity', 'liquidityNominal', 'assetNativeValue', 'assetValueUSD', '_nativeToUSD',
   'costBasisUSD', 'realizedPnLUSD', 'isClosedAsset', 'activeAssets',
   'buildPortfolioAllocations', 'buildPortfolioExposure',
   '_aw8Qty', '_aw8QtyCertifiable', '_aw8PortfolioUnrealizedTotal', '_wp5PortfolioAnalytics', '_aw8AssetByTicker',
   '_buildWorkspaceRiskCategories',
   'isInvestableAsset', 'investableAssets', 'investableValueUSD', '_aurixHealthSnapshot'].forEach(n => vm.runInContext(fnSrc(n), sb));
  vm.runInContext(konstSrc('_AW8_FINANCIAL_FUNCTIONS').replace('const _AW8_FINANCIAL_FUNCTIONS =', 'var _AW8F ='), sb);
} catch (e) { buildErr = String((e && e.message) || e); }

const setAssets = list => { sb.__l = list; vm.runInContext('assets = __l;', sb); };
function call(fn, args) {
  sb.__args = (args || []).map(v => ({ type: typeof v === 'string' ? 'str' : 'num', value: v }));
  try { return { ok: true, v: vm.runInContext('_AW8F[' + JSON.stringify(fn) + '](__args)', sb) }; }
  catch (e) { return { ok: false, code: (e && e.code) || 'THROW' }; }
}
const isNA = r => r.ok === false && r.code === '#N/A';
const near = (a, b) => Math.abs(a - b) <= 0.0101;
const A = (over) => Object.assign({ id: 'a', ticker: 'AAPL', symbol: 'AAPL', type: 'stock',
  qty: 5, price: 200, costBasis: 800, assetCurrency: 'USD' }, over || {});
const B = (over) => Object.assign({ id: 'b', ticker: 'MSFT', symbol: 'MSFT', type: 'stock',
  qty: 10, price: 50, costBasis: 400, assetCurrency: 'USD' }, over || {});

// los 10 estados que el contrato distingue
const UNKNOWN = [['null', null], ["''", ''], ["'   '", '   '], ['false', false], ['true', true],
                 ['[]', []], ['[5]', [5]], ['{}', {}], ["'abc'", 'abc'], ["'5x'", '5x'], ['undefined', undefined]];
const NEGATIVE = [['-3', -3], ["'-3'", '-3'], ['-0.5', -0.5]];
const VALID_POS = [['5', 5], ["'5'", '5'], ["' 5 '", ' 5 '], ['0.5', 0.5], ['2.5', 2.5], ['1e-9', 1e-9]];
const REAL_ZERO = [['0', 0], ['-0', -0], ["'0'", '0']];

console.log('\n════ AURIX-WORKSPACE-FORMULA-INTEGRITY ════\n');
console.log('0 · Los owners reales se ejecutan:');
ok('0.1 owners de Workspace + regla canónica cargados desde app.js', sb !== null && !buildErr, buildErr || '');
if (buildErr) { console.log('\n✗ FAIL  sin los owners reales no se puede afirmar nada\n'); process.exit(1); }

// ── 1-12 · los doce estados de la cantidad ────────────────────────────────
console.log('\n1–12 · Los doce estados, sobre la fórmula publicada ASSET.QTY:');
{
  const q = (v) => { setAssets([A({ qty: v })]); return call('ASSET.QTY', ['AAPL']); };
  ok('1 cantidad positiva válida ⇒ se publica su valor',
    VALID_POS.every(([, v]) => { const r = q(v); return r.ok && Number.isFinite(r.v) && r.v > 0; }),
    VALID_POS.filter(([, v]) => !q(v).ok).map(String).join('|'));
  ok('2 cantidad 0 ⇒ se publica 0 (posición cerrada legítima, NO #N/A)',
    (function () { const r = q(0); return r.ok && r.v === 0; })());
  ok('3 cantidad −0 ⇒ mismo trato que 0', (function () { const r = q(-0); return r.ok && r.v === 0; })());
  ok('4 cantidad negativa ⇒ #N/A, nunca un número',
    NEGATIVE.every(([, v]) => isNA(q(v))), NEGATIVE.filter(([, v]) => !isNA(q(v))).map(String).join('|'));
  ok('5 null ⇒ #N/A', isNA(q(null)));
  ok("6 '' ⇒ #N/A", isNA(q('')));
  ok('7 whitespace ⇒ #N/A', isNA(q('   ')));
  ok('8 false ⇒ #N/A', isNA(q(false)));
  ok('9 [] ⇒ #N/A', isNA(q([])));
  ok('10 objeto / no numérica ⇒ #N/A',
    [{}, 'abc', '5x', undefined, true, [5]].every(v => isNA(q(v))),
    [{}, 'abc', '5x', undefined, true, [5]].filter(v => !isNA(q(v))).map(String).join('|'));
  ok('11 string numérico legacy válido sigue funcionando igual que antes',
    (function () { const r = q('5'); const r2 = q(' 5 '); return r.ok && r.v === 5 && r2.ok && r2.v === 5; })());
  ok('12 decimal válido intacto',
    (function () { const r = q(0.5), r2 = q(2.5); return r.ok && r.v === 0.5 && r2.ok && r2.v === 2.5; })());
}

// ── 13-14 · las dos cifras que se publicaban fabricadas ──────────────────
console.log('\n13–14 · Lo que se publicaba fabricado ya no se publica:');
{
  ok('13 ASSET.QTY sobre UNKNOWN no publica 0 (ni ningún número)',
    UNKNOWN.every(([, v]) => { setAssets([A({ qty: v })]); return isNA(call('ASSET.QTY', ['AAPL'])); }),
    UNKNOWN.filter(([l, v]) => { setAssets([A({ qty: v })]); return !isNA(call('ASSET.QTY', ['AAPL'])); }).map(x => x[0]).join('|'));
  ok('13b …y tampoco ASSET.VALUE / ASSET.PNL / ASSET.PNL_PCT',
    UNKNOWN.every(([, v]) => { setAssets([A({ qty: v, costBasis: 5000 })]);
      return isNA(call('ASSET.VALUE', ['AAPL'])) && isNA(call('ASSET.PNL', ['AAPL'])) && isNA(call('ASSET.PNL_PCT', ['AAPL'])); }));
  ok('14 PORTFOLIO.PNL_PCT con una válida + una UNKNOWN no publica porcentaje',
    UNKNOWN.every(([, v]) => { setAssets([A(), B({ qty: v, costBasis: 5000 })]); return isNA(call('PORTFOLIO.PNL_PCT', [])); }),
    UNKNOWN.filter(([l, v]) => { setAssets([A(), B({ qty: v, costBasis: 5000 })]);
      return !isNA(call('PORTFOLIO.PNL_PCT', [])); }).map(x => x[0]).join('|'));
  ok('14b …ni el −100 % / −106 % concretos que se observaron',
    (function () {
      setAssets([A({ qty: null, costBasis: 5000 })]);
      const a = call('ASSET.PNL_PCT', ['AAPL']);
      setAssets([A(), B({ qty: -3, costBasis: 5000 })]);
      const b = call('PORTFOLIO.PNL_PCT', []);
      return isNA(a) && isNA(b);
    })());
  ok('14c toda la familia PORTFOLIO cae junta: PNL, UNREALIZED, COST, WINRATE, BEST, WORST',
    (function () {
      setAssets([A(), B({ qty: null, costBasis: 5000 })]);
      return ['PORTFOLIO.PNL', 'PORTFOLIO.UNREALIZED', 'PORTFOLIO.COST',
              'PORTFOLIO.WINRATE', 'PORTFOLIO.BEST', 'PORTFOLIO.WORST'].every(f => isNA(call(f, [])));
    })());
  ok('14d una posición sin valorar ya no puede ganar el ranking WORST',
    (function () { setAssets([A(), B({ qty: null, costBasis: 5000 })]);
      const r = call('PORTFOLIO.WORST', []); return isNA(r) && r.v !== 'MSFT'; })());
}

// ── 15-16 · numerador y denominador del MISMO universo ───────────────────
console.log('\n15–16 · Numerador y denominador salen del mismo universo:');
{
  ok('15 los dos agregadores excluyen exactamente el mismo conjunto',
    UNKNOWN.concat(NEGATIVE).every(([, v]) => {
      setAssets([A(), B({ qty: v, costBasis: 5000 })]);
      const u = vm.runInContext('_aw8PortfolioUnrealizedTotal()', sb);
      const w = vm.runInContext('_wp5PortfolioAnalytics()', sb);
      return u.partial === w.partial && u.partial === 1 && u.cost === w.cost;
    }),
    UNKNOWN.concat(NEGATIVE).filter(([l, v]) => { setAssets([A(), B({ qty: v, costBasis: 5000 })]);
      const u = vm.runInContext('_aw8PortfolioUnrealizedTotal()', sb);
      const w = vm.runInContext('_wp5PortfolioAnalytics()', sb);
      return !(u.partial === w.partial && u.cost === w.cost); }).map(x => x[0]).join('|'));
  ok('15b la incoherencia concreta medida antes (PNL_PCT 25 % sobre COST 5800) es inalcanzable',
    (function () {
      setAssets([A(), B({ qty: {}, costBasis: 5000 })]);   // el caso que la producía
      return isNA(call('PORTFOLIO.PNL_PCT', [])) && isNA(call('PORTFOLIO.COST', []));
    })());
  ok('16 ninguna rentabilidad > 100 % por inconsistencia de filtros en el caso reproducido',
    (function () {
      // el caso 53.000 / 50.000: BTC válido + una cantidad FABRICADA (true)
      const rows = [{ ticker: 'BTC', symbol: 'BTC', type: 'crypto', qty: 0.5, price: 100000, costBasis: 40000, assetCurrency: 'USD' },
                    { ticker: 'ETH', symbol: 'ETH', type: 'crypto', qty: true, price: 3000, costBasis: 2000, assetCurrency: 'USD' }];
      sb.__rows = rows;
      const keep = vm.runInContext('__rows.filter(a => Number.isFinite(_aurixUsableQuantity(a && a.qty)))', sb);
      sb.__keep = keep;
      const total = keep.reduce((s, a) => { sb.__a = a; const v = vm.runInContext('assetValueUSD(__a)', sb);
        return Number.isFinite(v) ? s + v : s; }, 0);
      const expo = vm.runInContext('buildPortfolioExposure(__keep)', sb);
      const ratio = (Number(expo.crypto || 0) / total) * 100;
      return keep.length === 1 && total === 50000 && near(ratio, 100) && ratio <= 100;
    })());
  ok('16b …y el mismo universo alimenta allocations (una posición fabricada no pesa)',
    (function () {
      const alloc = vm.runInContext('buildPortfolioAllocations(__keep, 50000)', sb);
      return alloc.length === 1 && alloc[0].symbol === 'BTC';
    })());
}

// ── 17 · el panel de riesgo no afirma sobre datos parciales ──────────────
console.log('\n17 · El panel de riesgo no publica un recuento ni un porcentaje falsos:');
{
  const risk = (uncert) => {
    sb.__d = { portfolio: { totalValue: 22550, assetCount: 3, uncertifiablePositions: uncert,
      exposure: { crypto: 20000, stock: 2000 }, allocations: [{ symbol: 'BTC', value: 20000, allocation: 0.89 }] } };
    vm.runInContext('function getDerivedFinancialSnapshot(){ return __d; }', sb);
    return vm.runInContext('_buildWorkspaceRiskCategories()', sb);
  };
  const flat = r => r.map(c => c.signals.map(s => String(s.text)).join(',')).join(' | ');
  ok('17.1 con una posición no certificable NO se afirma "N posiciones"',
    !/wsLowDiversification/.test(flat(risk(1))), flat(risk(1)));
  ok('17.2 …ni un porcentaje de concentración o exposición',
    !/wsConcentrationAbove|wsDominantWeight|wsCryptoExposureHigh|wsCryptoExposureMid|wsEquityWeight/.test(flat(risk(1))),
    flat(risk(1)));
  ok('17.3 …ni una conclusión tranquilizadora fabricada',
    !/wsBalancedExposure|wsExposureNormal|wsStableSignal/.test(flat(risk(1))), flat(risk(1)));
  ok('17.4 en su lugar enuncia la parcialidad, en las tres categorías',
    (function () { const r = risk(1);
      return r.length === 3 && r.every(c => c.signals.length === 1 && String(c.signals[0].text) === 'wsDataPartial'); })(),
    flat(risk(1)));
  ok('17.5 con el universo COMPLETO el panel se comporta exactamente como antes',
    (function () { const f = flat(risk(0));
      return /wsConcentrationAbove/.test(f) && /wsLowDiversification/.test(f)
        && /wsCryptoExposureHigh/.test(f) && !/wsDataPartial/.test(f); })(), flat(risk(0)));
  ok('17.6 la clave de parcialidad existe en AMBOS locales (no es un texto huérfano)',
    (app.match(/wsDataPartial:\s*'[^']+'/g) || []).length === 2,
    String((app.match(/wsDataPartial:\s*'[^']+'/g) || []).length));
  ok('17.7 el owner común publica el recuento no certificable, y el panel lo consume',
    /uncertifiablePositions: portfolioAssets\.length - _valuableAssets\.length,/.test(app)
    && /portfolio\.uncertifiablePositions/.test(fnSrc('_buildWorkspaceRiskCategories')));
}

// ── 18 · las plantillas oficiales respetan el contrato ───────────────────
console.log('\n18 · Las plantillas publicadas no pueden publicar una cifra fabricada:');
{
  const TEMPLATE_FNS = ['PORTFOLIO.PNL_PCT', 'PORTFOLIO.PNL', 'ASSET.QTY', 'ASSET.PNL_PCT'];
  ok('18.1 las plantillas siguen insertando esas fórmulas (no se ha eliminado nada)',
    TEMPLATE_FNS.every(f => app.indexOf('=' + f + '(') !== -1),
    TEMPLATE_FNS.filter(f => app.indexOf('=' + f + '(') === -1).join(','));
  ok('18.2 y cada una de ellas devuelve #N/A ante una cantidad no certificable',
    (function () {
      setAssets([A({ qty: null, costBasis: 5000 })]);
      return isNA(call('PORTFOLIO.PNL_PCT', [])) && isNA(call('PORTFOLIO.PNL', []))
        && isNA(call('ASSET.QTY', ['AAPL'])) && isNA(call('ASSET.PNL_PCT', ['AAPL']));
    })());
  ok('18.3 #N/A es la semántica que ya existía (misma que PORTFOLIO.CAGR), no un texto nuevo',
    /'PORTFOLIO\.CAGR'\(args\)[\s\S]{0,200}?throw new _AwEvalError\('#N\/A'\)/.test(app)
    && (app.match(/_AwEvalError\('#N\/A'\)/g) || []).length > 1);
}

// ── 19 · las carteras completamente válidas no se mueven ────────────────
console.log('\n19 · Comportamiento previo intacto cuando todo es certificable:');
{
  setAssets([A(), B()]);   // AAPL 5x200=1000 cost 800 · MSFT 10x50=500 cost 400
  const pnl = call('PORTFOLIO.PNL', []), pct = call('PORTFOLIO.PNL_PCT', []);
  const cost = call('PORTFOLIO.COST', []), win = call('PORTFOLIO.WINRATE', []);
  ok('19.1 PORTFOLIO.PNL / PNL_PCT / COST / WINRATE con los mismos números de antes',
    pnl.ok && near(pnl.v, 300) && pct.ok && near(pct.v, 25)
    && cost.ok && near(cost.v, 1200) && win.ok && near(win.v, 100),
    JSON.stringify([pnl.v, pct.v, cost.v, win.v]));
  // Con rendimientos DISTINTOS, para que el ranking sea observable: A +25 %, B −50 %.
  // (Con dos posiciones empatadas gana la primera en ambos extremos — desempate
  // preexistente que este SPEC no toca.)
  ok('19.2 BEST / WORST siguen resolviendo el ticker correcto de cada extremo',
    (function () {
      setAssets([A(), B({ price: 20, costBasis: 400 })]);   // B: 10x20=200 sobre coste 400 ⇒ −50 %
      const b = call('PORTFOLIO.BEST', []), w = call('PORTFOLIO.WORST', []);
      return b.ok && w.ok && b.v === 'AAPL' && w.v === 'MSFT';
    })());
  ok('19.3 ASSET.* sobre una posición válida, idénticos',
    (function () {
      setAssets([A({ costBasis: 5000 })]);
      const q = call('ASSET.QTY', ['AAPL']), v = call('ASSET.VALUE', ['AAPL']);
      const p = call('ASSET.PNL', ['AAPL']), pc = call('ASSET.PNL_PCT', ['AAPL']);
      return q.v === 5 && v.v === 1000 && near(p.v, -4000) && near(pc.v, -80);
    })());
  ok('19.4 una posición INEXISTENTE sigue devolviendo 0, no #N/A (contrato previo)',
    (function () { setAssets([A()]);
      return call('ASSET.QTY', ['ZZZZ']).v === 0 && call('ASSET.VALUE', ['ZZZZ']).v === 0
        && call('ASSET.PNL', ['ZZZZ']).v === 0 && call('ASSET.PNL_PCT', ['ZZZZ']).v === 0; })());
  ok('19.5 una posición con costBasis 0 sigue ignorada por los agregados (convención previa)',
    (function () { setAssets([A(), B({ costBasis: 0 })]);
      const r = call('PORTFOLIO.PNL', []); return r.ok && near(r.v, 200); })(),
    'una cantidad UNKNOWN con costBasis 0 no entra al recorrido, así que no bloquea la cartera');
  ok('19.6 una cartera vacía no lanza',
    (function () { setAssets([]); const r = call('PORTFOLIO.PNL_PCT', []); return r.ok && r.v === 0; })());
  ok('19.7 el guard reutiliza la regla canónica: no hay una segunda definición',
    (app.match(/function _aurixUsableQuantity\(/g) || []).length === 1
    && /function _aw8Qty\(a\) \{\s*return _aurixUsableQuantity\(a && a\.qty\);/.test(app)
    && (app.match(/function _aw8QtyCertifiable\(/g) || []).length === 1);
  ok('19.8 no se ha introducido clamp, abs ni coalescencia a cero en los owners tocados',
    ['_aw8PortfolioUnrealizedTotal', '_wp5PortfolioAnalytics', '_aw8QtyCertifiable']
      .every(n => !/Math\.abs|\|\| 0\)\s*;?\s*$/.test(fnSrc(n).split('\n').filter(l => /qty/.test(l)).join('\n'))));
}

// ── 20 · Los dos caminos [alto] que la revisión adversarial encontró ─────
console.log('\n20 · Lo que la revisión encontró abierto en la superficie declarada:');
{
  // 20.1-20.4 — el MISMO registro de fórmulas seguía publicando recuento y pesos sobre el
  // universo parcial: =PORTFOLIO.ASSETS() devolvía 3 habiendo 4 abiertas y =ALLOCATION()
  // dividía por un denominador parcial, mientras =PORTFOLIO.PNL() ya daba #N/A al lado.
  const withSnap = (uncert) => {
    sb.__d = { portfolio: { totalValue: 3000, assetCount: 3, uncertifiablePositions: uncert,
      exposure: { stock: 2000, etf: 1000 }, allocations: [{ symbol: 'AAPL', value: 1000, allocation: 0.3333 }] } };
    vm.runInContext('function getDerivedFinancialSnapshot(){ return __d; }', sb);
  };
  const UNIVERSE_FNS = [['PORTFOLIO.VALUE', []], ['PORTFOLIO.ASSETS', []],
                        ['EXPOSURE', ['stock']], ['ALLOCATION', ['AAPL']]];
  withSnap(1);
  ok('20.1 con el universo PARCIAL, las cuatro fórmulas de universo devuelven #N/A',
    UNIVERSE_FNS.every(([f, a]) => isNA(call(f, a))),
    UNIVERSE_FNS.filter(([f, a]) => !isNA(call(f, a))).map(x => x[0]).join(','));
  // Las dos familias leen fuentes distintas —el snapshot derivado una, el `assets` global la
  // otra—, así que el fixture las alinea: ésa es justamente la coexistencia que se prohíbe.
  ok('20.2 …así que ya no coexiste un recuento "3 de 4" con un #N/A en la celda de al lado',
    (function () {
      setAssets([A(), B(), B({ id: 'c', ticker: 'VWCE', symbol: 'VWCE' }), B({ id: 'd', ticker: 'GHOST', symbol: 'GHOST', qty: null })]);
      withSnap(1);
      return isNA(call('PORTFOLIO.ASSETS', [])) && isNA(call('PORTFOLIO.PNL', []))
        && isNA(call('ALLOCATION', ['AAPL'])) && isNA(call('ASSET.QTY', ['GHOST']));
    })());
  withSnap(0);
  ok('20.3 con el universo COMPLETO devuelven exactamente lo de antes',
    (function () {
      const v = call('PORTFOLIO.VALUE', []), n = call('PORTFOLIO.ASSETS', []);
      const e = call('EXPOSURE', ['stock']), al = call('ALLOCATION', ['AAPL']);
      return v.ok && v.v === 3000 && n.ok && n.v === 3 && e.ok && e.v === 2000
        && al.ok && near(al.v, 0.3333);
    })());
  ok('20.4 el gate de las cuatro lee el MISMO campo que el resto de la familia',
    (app.match(/uncertifiablePositions \|\| 0\) > 0\) throw new _AwEvalError\('#N\/A'\)/g) || []).length === 4,
    String((app.match(/uncertifiablePositions \|\| 0\) > 0\) throw new _AwEvalError\('#N\/A'\)/g) || []).length));

  // 20.5-20.8 — el gate del panel de riesgo había caído en CÓDIGO MUERTO: la pantalla que
  // se renderiza es _aurixWorkspaceIntelligence, que consume _aurixHealthSnapshot, y allí
  // `assetCount` se contaba SIN filtrar mientras `totUSD` ya venía filtrado.
  const health = (rows) => { sb.__r = rows; vm.runInContext('assets = __r;', sb);
    return vm.runInContext('_aurixHealthSnapshot()', sb); };
  const R = (qty) => ({ id: 'x' + String(qty), ticker: 'T' + String(qty), symbol: 'T' + String(qty),
    type: 'stock', qty: qty, price: 200, costBasis: 800, assetCurrency: 'USD' });
  ok('20.5 la superficie VIVA cuenta el mismo universo que valora',
    (function () {
      const h = health([R(5), R(6), R(7), Object.assign(R(8), { qty: null })]);
      return h.assetCount === 3 && h.uncertifiablePositions === 1;
    })(), JSON.stringify((function(){ const h = health([R(5), R(6), R(7), Object.assign(R(8), { qty: null })]);
      return { assetCount: h.assetCount, uncert: h.uncertifiablePositions }; })()));
  ok('20.6 …y expone la señal de parcialidad para que la superficie pueda enunciarla',
    (function () { const h = health([R(5), Object.assign(R(9), { qty: '' })]);
      return h.uncertifiablePositions === 1; })());
  ok('20.7 con todo certificable, el recuento y la señal son los de antes',
    (function () { const h = health([R(5), R(6), R(7)]);
      return h.assetCount === 3 && h.uncertifiablePositions === 0; })());
  ok('20.8 el campo existe ya en el objeto POR DEFECTO (el gate no nace apagado)',
    /assetCount:      0,\s*\n(\s*\/\/[^\n]*\n)*\s*uncertifiablePositions: 0,/.test(app));
  ok('20.9 _aurixHealthSnapshot filtra por la regla canónica, no por una copia',
    /_aurixUsableQuantity\(a && a\.qty\)/.test(fnSrc('_aurixHealthSnapshot')));
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + '  ' + pass + ' passed, ' + fail + ' failed\n');

// ════════════════════════════════════════════════════════════════════════════
// WORKSPACE-LAUNCH-V1 — catálogo público + matemática de las DOS que salen
// ════════════════════════════════════════════════════════════════════════════
// Workspace V1 sale deliberadamente pequeño. Lo que este bloque protege no es el
// diseño sino la REGLA: sólo se publica lo que tiene matemática comprobada y NO
// guarda trabajo del usuario, porque `aurix_ws_*_v1` no viaja en el sync y
// publicar lo demás prometería una permanencia que la arquitectura no da.
(function workspaceLaunchScope() {
// ── RE-DECIDIDO por SPEC MONETIZATION M.02 B3/B4 ─────────────────────────────
// M.01B declaraba la frontera comercial como PRESENTACIÓN y lo congelaba así.
// B3/B4 la convierte en un gate REAL, y además sustituye los catálogos escritos a
// mano por `_WS_CATALOG`, la fuente única con estado comercial. Varias aserciones
// de abajo se apoyaban en los literales de esos arrays; al hacerse el catálogo
// declarativo, esos literales desaparecen y las aserciones de AUSENCIA pasarían por
// vacuidad. Así que se repuntan al catálogo, que es donde vive la verdad.
// Perezoso: este scope se evalúa antes de que `app` esté inicializado.
let _CATALOG_CACHE = null;
function catalog() {
  if (_CATALOG_CACHE) return _CATALOG_CACHE;
  const i = app.indexOf('const _WS_CATALOG = Object.freeze([');
  const j = app.indexOf(']);', i);
  const body = i < 0 ? '' : app.slice(i, j);
  _CATALOG_CACHE = [...body.matchAll(/\{\s*id:\s*'([\w.]+)'\s*,\s*kind:\s*'(\w+)'\s*,\s*published:\s*(true|false)\s*,\s*featureKey:\s*(null|'[\w.]+')\s*,\s*commercialTier:\s*'(\w+)'/g)]
    .map(m => ({ id: m[1], kind: m[2], published: m[3] === 'true',
                 featureKey: m[4] === 'null' ? null : m[4].replace(/'/g, ''), tier: m[5] }));
  return _CATALOG_CACHE;
}

  const fs = require('fs'), path = require('path');
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const fn = (n) => { const i = app.indexOf('function ' + n + '('); if (i < 0) return '';
    let k = app.indexOf('{', i), d = 0; for (; k < app.length; k++) { const c = app[k];
      if (c === '{') d++; else if (c === '}') { d--; if (!d) return app.slice(i, k + 1); } } return ''; };
  let p2 = 0, f2 = 0;
  const OK = (n, c, extra) => { if (c) { p2++; console.log('  \u2713 ' + n); }
    else { f2++; console.log('  \u2717 ' + n + (extra ? '  \u2192  ' + extra : '')); } };
  const near = (a, b) => Math.abs(a - b) < 0.01;

  console.log('\nWORKSPACE-LAUNCH-V1 \u2014 alcance de lanzamiento:');

  // ── Matemática de las dos publicadas, EJECUTADA ──────────────────────────
  const _wsNum = v => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const calcComp = new Function('_wsNum', fn('calculateCompoundGrowth') + ';return calculateCompoundGrowth;')(_wsNum);
  const calcLoan = new Function(fn('calculateLoan') + ';return calculateLoan;')();

  OK('L1 compound \u00b7 1.000 + 300/mes al 6% en 20a \u21d2 aportado exacto 73.000',
     near(calcComp(1000, 300, 0.06, 20).contributed, 73000));
  OK('L2 compound \u00b7 tasa 0% \u21d2 sin crecimiento inventado',
     near(calcComp(1000, 300, 0, 10).final, 37000) && near(calcComp(1000, 300, 0, 10).interest, 0));
  OK('L3 compound \u00b7 horizonte 0 \u21d2 devuelve el capital inicial, no NaN',
     near(calcComp(1000, 300, 0.06, 0).final, 1000));
  OK('L4 compound \u00b7 entradas basura \u21d2 0, nunca NaN',
     Number.isFinite(calcComp('abc', null, 0.06, 5).final));
  OK('L5 loan \u00b7 180.000 al 3,25% en 30a \u21d2 cuota francesa y saldo que CIERRA en 0',
     (() => { const r = calcLoan({ principal: 180000, rate: 3.25, years: 30 });
       return near(r.base, 783.37) && r.table.length === 360 && near(r.table[359].balance, 0); })());
  OK('L6 loan \u00b7 tasa 0% \u21d2 principal/n y CERO intereses',
     (() => { const r = calcLoan({ principal: 180000, rate: 0, years: 30 });
       return near(r.base, 500) && near(r.totalInterest, 0); })());
  OK('L7 loan \u00b7 inputs inv\u00e1lidos \u21d2 0 sin NaN ni divisi\u00f3n por cero',
     (() => { const r = calcLoan({ principal: -5, rate: 'abc', years: 0 });
       return r.base === 0 && r.n === 0 && r.principal === 0; })());

  // ── Divisa: el defecto corregido ─────────────────────────────────────────
  const comp = fn('_renderCompoundTool'), loan = fn('_renderLoanTool');
  OK('L8 ning\u00fan campo monetario de compound/loan tiene el s\u00edmbolo hardcodeado',
     !/'\u20ac'/.test(comp) && !/'\u20ac'/.test(loan) &&
     /_wsToolCcy\(\)/.test(comp) && /_wsToolCcy\(\)/.test(loan));
  OK('L9 la unidad se delega en el owner de divisa que ya exist\u00eda',
     /getCurrencySymbol\(baseCurrency\)/.test(fn('_wsToolCcy')));

  // ── Catálogo público ─────────────────────────────────────────────────────
  // ── RE-DECIDIDO por M.02 B3/B4, y por una raz\u00f3n incómoda: estas dos aserciones
  // hab\u00edan pasado a ser VACUAS. Compraban su garant\u00eda buscando literales
  // (`data-wstool="budget"`, `data-wsh-cta="scenario"`) en app.js, y al volverse
  // declarativo el cat\u00e1logo esos atributos se emiten interpolados
  // (`data-wstool="${esc(r.tool)}"`), as\u00ed que los literales desaparecieron y las
  // comprobaciones de AUSENCIA pasaban sin comprobar nada. Lo detect\u00f3 la revisi\u00f3n
  // de seguridad. Se repuntan a la PROPIEDAD, sobre el cat\u00e1logo, que es donde
  // ahora vive la decisi\u00f3n de publicaci\u00f3n.
  const HIDDEN_IDS = ['trade_journal', 'real_estate_portfolio', 'receivables', 'asset_prices',
                      'monthly_budget', 'scenario', 'goal', 'financial_calc', 'investment_analyzer'];
  OK('L10 ninguna herramienta oculta est\u00e1 publicada en el cat\u00e1logo',
     HIDDEN_IDS.every(id => { const e = catalog().find(x => x.id === id); return e && e.published === false; }),
     HIDDEN_IDS.filter(id => { const e = catalog().find(x => x.id === id); return !e || e.published !== false; }).join(','));
  OK('L11 ni una sola plantilla publicada, y el filtro de visibilidad es \u00daNICO',
     catalog().filter(e => e.kind === 'template').every(e => e.published === false) &&
     /return _WS_CATALOG\.filter\(e => e\.kind === kind && _wsCatalogVisible\(e\)\);/.test(app));
  OK('L11b lo NO publicado s\u00f3lo es visible con cat\u00e1logo interno, y eso lo decide el servidor',
     /if \(entry\.published === true\) return true;/.test(fn('_wsCatalogVisible')) &&
     /return _aurixEntIsCatalogPreview\(\) === true;/.test(fn('_wsCatalogVisible')));
  OK('L11c y el owner de apertura bloquea lo no publicado (proyecto guardado incluido)',
     /if \(entry && !_wsCatalogVisible\(entry\)\) return \{ ok: false, reason: 'unpublished'/.test(fn('_wsToolAccess')) &&
     /const _acc = _wsToolAccess\(key\);/.test(fn('_wsOpenTool')));
  OK('L12 s\u00ed est\u00e1n las DOS autorizadas, y ahora en el CAT\u00c1LOGO (no en un literal)',
     catalog().filter(e => e.published).map(e => e.id).sort().join(',') === 'compound_growth,loan_simulation');
  // L13 SUPERADO por MONETIZATION-V1 · M.01B: Plantillas vuelve como secci\u00f3n
  // estructural (bloque M m\u00e1s abajo). La regla que L13 proteg\u00eda \u2014no dejar una
  // secci\u00f3n vac\u00eda\u2014 sigue viva: ahora se cumple pintando su estado honesto en
  // lugar de una rejilla de cero tarjetas (M3\u2013M5).
  // L14 tambi\u00e9n era vacua: el c\u00f3digo ya no escribe `soon: true` sino
  // `soon: !openAttr`. La regla que proteg\u00eda \u2014que nada PUBLICADO parezca
  // deshabilitado\u2014 se comprueba ahora sobre el cat\u00e1logo: toda entrada publicada
  // tiene ruta de apertura, luego `soon` es false para todas ellas.
  OK('L14 nada PUBLICADO parece deshabilitado: todo lo publicado tiene ruta de apertura',
     (() => { const pub = catalog().filter(e => e.published);
       const home = fn('_renderWorkspaceHome');
       return pub.length === 2 && pub.every(e => new RegExp(e.id + ":\\s*\\{[^}]*tool: '").test(home))
              && /soon: !openAttr/.test(home); })());
  OK('L15 Mi Espacio no puede resucitar una oculta por uso previo',
     /const TPL_CAT = \[\];/.test(app) &&
     !/\{ ref: 'tpl:scenario'[\s\S]{0,40}viz: 'compare'/.test(app));

  // ── NADA BORRADO: los owners siguen vivos y dormidos ─────────────────────
  const KEPT = ['_renderBudgetTool', '_renderJournalTool', '_renderRealEstateTool',
                '_renderReceivablesTool', '_renderAssetPricesTool', '_wsRenderTool',
                '_wsBudgetOutHtml', '_wsToolStateType'];
  OK('L16 CERO c\u00f3digo borrado: los renderers ocultos siguen existiendo',
     KEPT.every(n => (app.match(new RegExp('function ' + n + '\\(', 'g')) || []).length === 1),
     KEPT.filter(n => !(app.match(new RegExp('function ' + n + '\\(', 'g')) || []).length).join(','));
  OK('L17 y su despachador sigue sabiendo abrirlas (reponer = una l\u00ednea de cat\u00e1logo)',
     /_wsToolActive === 'budget' \? _renderBudgetTool\(\)/.test(fn('_wsRenderTool')));

  // ── GLOBAL-POLISH-V1: lo que el fast-close final destapó ─────────────────
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  OK('G1 Mi Espacio no pinta una columna cuyo cat\u00e1logo est\u00e1 vac\u00edo',
     /TPL_CAT\.length \? column\('wsmse2_tpl_title'/.test(app));
  OK('G2 \u2026as\u00ed que el CTA a la pesta\u00f1a retirada s\u00f3lo vive dentro de esa rama condicional',
     (() => {
       const m = /const _mseCols = \[([\s\S]*?)\];/.exec(app);
       if (!m) return false;
       const tplLine = m[1].split('\n').find(l => l.includes("'templates'"));
       return !!tplLine && tplLine.includes('TPL_CAT.length ?');
     })());
  OK('G3 con una sola columna la rejilla no deja hueco del 50%',
     /\.wsh-mse2\.is-single\{ grid-template-columns:1fr; \}/.test(css) &&
     /is-single/.test(app));
  OK('G4 las superficies de las DOS herramientas p\u00fablicas no usan alfa BLANCO (gris gen\u00e9rico)',
     !/\.wsh-tool \{[^}]*background: rgba\(255,255,255/.test(css) &&
     !/\.wsh-toolcard \{[^}]*background: rgba\(255,255,255/.test(css) &&
     !/\.wsloan-kpi \{[^}]*background: rgba\(255,255,255/.test(css) &&
     !/\.ws4-num \{[\s\S]{0,400}?background: rgba\(255,255,255/.test(css));
  OK('G5 \u2026y su tono es el de la escalera de elevaci\u00f3n, con la MISMA alfa',
     (() => {
       const rule = (sel) => { const i = css.indexOf(sel); if (i < 0) return '';
         const j = css.indexOf('}', i); return j < 0 ? '' : css.slice(i, j); };
       // `.wsh-tool {` aparece antes en una regla agrupada sin background
       // (`.wsh-tpl, .wsh-tool`), as\u00ed que se ancla la regla propia por su inicio de l\u00ednea.
       return /background: rgba\(165,196,255,0\.025\)/.test(rule('\n.wsh-tool {')) &&
              /background: rgba\(165,196,255,0\.025\)/.test(rule('.wsh-toolcard {')) &&
              /background: rgba\(165,196,255,0\.025\)/.test(rule('.wsloan-kpi {')) &&
              /background: rgba\(165,196,255,0\.075\)/.test(rule('.ws4-num {'));
     })());

  // ══ MONETIZATION-V1 · M.01B — superficie de monetización de Workspace ═════
  // Lo que protege este bloque: la arquitectura de TRES secciones vuelve a ser
  // visible sin publicar contenido inventado, y la frontera FREE/PREMIUM se
  // declara en UNA sola fuente y es SÓLO presentación. Nada de seguridad
  // comercial falsa: mientras no exista un entitlement real, loan se abre.
  console.log('\nMONETIZATION-V1 \u00b7 M.01B \u2014 superficie de monetizaci\u00f3n:');

  const tabsSrc = /const TABS = \[[\s\S]*?\];/.exec(app);
  OK('M1 las TRES secciones estructurales est\u00e1n en la barra de Workspace',
     !!tabsSrc && /'space'/.test(tabsSrc[0]) && /'templates'/.test(tabsSrc[0]) && /'tools'/.test(tabsSrc[0]),
     tabsSrc ? tabsSrc[0] : 'TABS no encontrado');
  OK('M2 sin desv\u00edo silencioso: `templates` ya no cae a Herramientas',
     !/if \(tab === 'templates'\) tab = 'tools'/.test(app));
  OK('M3 los tres tabs son estados v\u00e1lidos en TODOS los puntos que leen _wsTab (persistencia coherente)',
     (app.match(/=== 'space' \|\| _wsTab === 'templates' \|\| _wsTab === 'tools'/g) || []).length >= 1 &&
     (app.match(/'space' \|\| _wsReturnTab === 'templates' \|\| _wsReturnTab === 'tools'/g) || []).length >= 1);
  const home = fn('_renderWorkspaceHome');
  OK('M4 NO se publica ninguna plantilla: cero entradas template con published=true',
     catalog().filter(e => e.kind === 'template').length >= 12 &&
     catalog().filter(e => e.kind === 'template').every(e => e.published === false) &&
     /const TPL_CAT = _wsCatalogFor\('tool'\)|const TPL_CAT = \[\];/.test(home));
  OK('M5 con cat\u00e1logo vac\u00edo NO se pinta una rejilla de cero tarjetas',
     /const body = gallery\.length[\s\S]{0,200}wsh-tpl-grid wsh-gallery[\s\S]{0,80}: `<div class="wsh-tplarch">/.test(home));
  OK('M6 el estado de Plantillas no finge contenido: sin card, sin viz, sin "pr\u00f3ximamente", sin banner de upgrade',
     (() => { const m = /<div class="wsh-tplarch">[\s\S]*?<\/div>`/.exec(home); if (!m) return false;
       const b = m[0];
       return !/wsh-tpl\b/.test(b) && !/wsh-pv-wrap/.test(b) && !/wsh_soon/.test(b) &&
              !/upgrade/i.test(b) && !/premium/i.test(b); })());
  OK('M7 su \u00fanica acci\u00f3n apunta a una pesta\u00f1a que EXISTE (cero enlaces muertos)',
     (() => { const m = /wsh-tplarch-cta" data-wstab="([a-z]+)"/.exec(home);
       return !!m && !!tabsSrc && tabsSrc[0].includes("'" + m[1] + "'"); })());

  // ── Frontera comercial: UNA fuente, y s\u00f3lo presentaci\u00f3n ──────────────────
  const reg = /const _WS_APP_IDENTITY = \{[\s\S]*?\n\};/.exec(app);
  OK('M8 compound se declara FREE y loan PREMIUM en el registro de identidad',
     !!reg && /compound_growth:[^\n]*premiumTier: 'free'/.test(reg[0]) &&
     /loan_simulation:[^\n]*premiumTier: 'premium'/.test(reg[0]));
  OK('M9 el chip lee el CATÁLOGO único, y `premiumTier` ya no decide nada',
     /_wsCommercialTierClass\(_wsCatalogEntry\(id\)\)/.test(fn('_wsToolTier')) &&
     /_wsCatalogEntry\(id\)/.test(fn('_wsTierChip')) &&
     !/premiumTier/.test(fn('_wsToolTier')) && !/premiumTier/.test(fn('_wsTierChip')));
  OK('M10 un tier no decidido NUNCA afirma un plan: se etiqueta Preview, no Premium/Incluido',
     (() => { const l = fn('_wsCommercialLabel'), c = fn('_wsCommercialTierClass');
       // published!==true o tier undecided ⇒ 'preview' ANTES de mirar el tier, y
       // 'premium' exige featureKey (si no, la etiqueta sería decorativa).
       return /published !== true \|\| entry\.commercialTier === 'undecided'/.test(l) &&
              /wstier_preview/.test(l) &&
              /commercialTier === 'premium' && entry\.featureKey/.test(l) &&
              /published !== true \|\| entry\.commercialTier === 'undecided'/.test(c); })());
  // M11 INVERTIDO por M.02 B3/B4. M.01B declaraba "la ruta de apertura de loan NO
  // gatea nada" porque no exist\u00eda entitlement real; ahora existe y gatea. La regla
  // que M.01B proteg\u00eda \u2014no fabricar gating sin autoridad\u2014 sigue viva: el gate no
  // inventa nada, pregunta al resolver server-side.
  OK('M11 la apertura de loan S\u00cd gatea, contra el entitlement real (no un flag local)',
     /const _acc = _wsToolAccess\(key\);/.test(fn('_wsOpenTool')) &&
     /if \(featureKey && !hasFeature\(featureKey\)\) return \{ ok: false, reason: 'entitlement'/.test(fn('_wsToolAccess')) &&
     /openUpgradeIntent\(/.test(fn('_wsOpenTool')));
  OK('M11b el gate vive en el OWNER de apertura, no duplicado en cada tarjeta',
     !/hasFeature\(/.test(home));
  OK('M12 no se ha fabricado gating comercial: el master switch sigue apagado',
     /const ENFORCE_ENTITLEMENTS = false;/.test(app));
  OK('M13 loan NO parece deshabilitada: publicada, con ruta de apertura y sin soon/lock',
     (() => { const e = catalog().find(x => x.id === 'loan_simulation');
       if (!e || !e.published || e.featureKey !== 'workspace.loan') return false;
       return /loan_simulation:\s*\{[^}]*tool: 'loan'[^}]*\}/.test(home) &&
              !/is-locked|lock-icon/i.test(home) && /soon: !openAttr/.test(home); })());
  OK('M14 el chip vive en el MISMO pie que "Abrir \u203a": la tarjeta no cambia de altura',
     /<div class="wsh-toolcard-foot">[\s\S]{0,220}\$\{_wsTierChip\(tl\.id\)\}/.test(home));

  // ── UX: lenguaje visual de Aurix ─────────────────────────────────────────
  OK('M15 el chip Premium reutiliza el oro institucional del plan, no un gradiente comercial',
     /\.wsh-tier\.is-premium \{[^}]*rgba\(244,196,90/.test(css) &&
     !/\.wsh-tier[^{]*\{[^}]*gradient/.test(css));
  OK('M16 ning\u00fan chip usa alfa BLANCO (blanco sobre el lienzo = gris gen\u00e9rico)',
     !/\.wsh-tier[^{]*\{[^}]*rgba\(255,255,255/.test(css));
  OK('M17 la tarjeta Premium no se aten\u00faa ni pierde el hover (nada de "deshabilitado por error")',
     !/\.wsh-toolcard[^{]*:has\(\.wsh-tier\.is-premium\)/.test(css) &&
     !/\.wsh-tier\.is-premium[^}]*opacity/.test(css));
  OK('M18 el estado de Plantillas es una nota compacta, no un gran estado vac\u00edo',
     /\.wsh-tplarch \{[^}]*max-width: 560px/.test(css) &&
     !/\.wsh-tplarch \{[^}]*min-height/.test(css));

  // ── i18n: ninguna clave nueva puede publicarse a medias ──────────────────
  const K = ['wstpl_arch_t', 'wstpl_arch_b', 'wstpl_arch_cta', 'wstier_free', 'wstier_premium'];
  OK('M19 las claves nuevas existen en ES y EN (nunca un `undefined` en la UI)',
     K.every(k => (app.match(new RegExp('\\n\\s*' + k + ':', 'g')) || []).length === 2),
     K.filter(k => (app.match(new RegExp('\\n\\s*' + k + ':', 'g')) || []).length !== 2).join(','));
  OK('M20 y las tres etiquetas de secci\u00f3n siguen traducidas en los dos idiomas',
     ['wstab_space', 'wstab_templates', 'wstab_tools'].every(k =>
       (app.match(new RegExp('\\n\\s*' + k + ':', 'g')) || []).length === 2));

  console.log('  \u2192 ' + p2 + ' passed, ' + f2 + ' failed');
  if (f2) process.exitCode = 1;
})();

process.exit(fail ? 1 : 0);
