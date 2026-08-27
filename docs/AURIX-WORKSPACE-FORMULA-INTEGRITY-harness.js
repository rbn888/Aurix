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
  const HIDDEN = ['journal', 'realestate', 'receivables', 'assets', 'budget'];
  OK('L10 ninguna herramienta oculta tiene punto de entrada en el cat\u00e1logo',
     HIDDEN.every(k => !app.includes('data-wstool="' + k + '"')),
     HIDDEN.filter(k => app.includes('data-wstool="' + k + '"')).join(','));
  OK('L11 ni scenario / goals / planning / workspace-templates',
     ['scenario', 'goals', 'planning', 'workspace'].every(c => !app.includes('data-wsh-cta="' + c + '"')));
  OK('L12 s\u00ed est\u00e1n las DOS autorizadas',
     app.includes('data-wstool="compound"') && app.includes('data-wstool="loan"'));
  OK('L13 sin secci\u00f3n vac\u00eda: la pesta\u00f1a Plantillas no se pinta y un tab guardado cae a Herramientas',
     /const TABS = \[\['space', 'wstab_space'\], \['tools', 'wstab_tools'\]\]/.test(app) &&
     /if \(tab === 'templates'\) tab = 'tools'/.test(app));
  OK('L14 sin "coming soon" ni cards deshabilitadas en Herramientas',
     !/soon: true/.test(app));
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
  console.log('  \u2192 ' + p2 + ' passed, ' + f2 + ' failed');
  if (f2) process.exitCode = 1;
})();

process.exit(fail ? 1 : 0);
