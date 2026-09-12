'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-M06-DASHBOARD-PORTFOLIO — bloques 4 y 5 de M.06
// ════════════════════════════════════════════════════════════════════════════
// Dashboard y Portfolio se auditan juntos porque en Aurix **son la misma superficie**:
// la navegación tiene cuatro verbos (Dashboard / Market / Intelligence / Workspace) y
// «Portfolio» es el estado interno del Dashboard — lista de activos, desglose por
// categoría y detalle de activo — más el alta/edición/borrado. No hay una pestaña
// Portfolio que pueda contradecir al Dashboard: hay UN conjunto de activos y varios
// agregadores leyéndolo. Por eso el contrato central del bloque es una IDENTIDAD:
//
//     Σ(porciones publicadas) == total publicado,   sobre el MISMO conjunto de activos
//
// EL DEFECTO QUE ESTE GATE CIERRA (P0 de verdad mostrada). `getInvestableDistribution`
// alimenta el donut, su leyenda Y las tarjetas de categoría, y era el único agregador que
// NO aplicaba los dos guards canónicos que `investableValueUSD`/`totalValueUSD` sí aplican:
//   · un `assetValueUSD` NO FINITO (divisa sin cobertura FX) se SUMABA, y `(g||0) + NaN`
//     envenenaba el grupo entero; el `.filter(v > 0)` posterior lo descartaba, así que la
//     CATEGORÍA COMPLETA desaparecía del donut y su tarjeta se pintaba vacía mientras el
//     hero seguía contando a sus hermanos bien valorados;
//   · una CANTIDAD INVÁLIDA (`_aurixUsableQuantity`) se valoraba aquí y se saltaba allí.
// Las dos son exactamente lo que el SPEC prohíbe: «categoría perdida» y «Dashboard
// mostrando A y Portfolio B».
//
// MÉTODO: se EJECUTAN los owners reales extraídos de app.js (la técnica de
// AURIX-CATEGORY-PERFORMANCE-CONSISTENCY) y se comparan cifras, no cadenas. La
// no-vacuidad se demuestra reconstruyendo el owner ANTERIOR: se retiran sus dos guards
// con una sustitución mecánica que REVIENTA si no encaja.
//
// NO se re-audita lo ya certificado en otro gate (CLAUDE.md §6): tarjetas de categoría y
// paridad de % (AURIX-DASHBOARD-SUMMARY-CARDS, AURIX-CATEGORY-PARITY,
// AURIX-CATEGORY-PERFORMANCE-CONSISTENCY), fondos (AURIX-FUNDS-CATEGORY-INTEGRITY),
// hidratación y resiliencia del Dashboard (AURIX-DASHBOARD-HYDRATION), móvil
// (AURIX-MOBILE-DASHBOARD-CONTRACT), alta de activo (AURIX-ADD-ASSET-*), detalle
// (AURIX-ASSET-DETAIL-POLISH), precio de compra (AURIX-PURCHASE-PRICE-V1) y el LKG del
// gráfico (AURIX-CHART-PREMIUM-PUBLICATION-LKG).
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app  = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

let pass = 0, fail = 0; const failed = [];
function ok(n, c, info) {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; failed.push(n); console.log('  ✗ ' + n + (info !== undefined ? '  →  ' + info : '')); }
}
const near = (a, b, eps) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= (eps == null ? 1e-9 : eps);

function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('falta fn ' + n); return braceSlice(app, i); }
function constObj(n) { const i = app.indexOf('const ' + n + ' = {'); if (i < 0) throw new Error('falta const ' + n); return app.slice(i, i + braceSlice(app, i).length) + ';'; }
function lineOf(re) { const m = re.exec(app); if (!m) throw new Error('falta línea ' + re); return m[0]; }

// ─────────────────────────────────────────────────────────────────────────────
// Los owners REALES, ejecutándose. Sólo se inyecta la frontera (localStorage).
// ─────────────────────────────────────────────────────────────────────────────
const OWNERS = [
  'liquidityNominal', '_goldPurity', '_goldGrams', 'assetNativeValue',
  '_aurixFxLoad', '_aurixFxFresh', '_aurixFxLookup', '_aurixFxRate', '_aurixFxStatus',
  '_nativeToUSD', 'assetValueUSD', 'toBase',
  '_aurixUsableQuantity', 'isClosedAsset', 'activeAssets',
  '_aurixCategoryBucket', '_aurixDisplayCategory', '_aurixLocationKey',
  'isInvestableAsset', 'investableAssets', 'investableValueUSD', 'investableValueBase',
  'totalValueUSD', 'totalValueBase',
  'getInvestableDistribution', 'getLocationDistribution',
];
const PRELUDE = [
  lineOf(/^const OZ_TO_G = [^\n]+$/m),
  lineOf(/^const _PURITY_TABLE = [^\n]+$/m),
  lineOf(/^const _AURIX_FX_TTL\s+= [^\n]+$/m),
  lineOf(/^const _AURIX_FX_KEY\s+= [^\n]+$/m),
  lineOf(/^const _AURIX_FX_FALLBACK = [^\n]+$/m),
  'let _aurixFxCache = null;',
  constObj('TYPE_META'),
].join('\n');

function sandbox(mutateSrc) {
  let src = PRELUDE + '\n' + OWNERS.map(fnSrc).join('\n');
  if (mutateSrc) src = mutateSrc(src);
  const ctx = vm.createContext({
    console: { log() {}, warn() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  });
  vm.runInContext('var assets = []; var usdToEur = 0.9; var baseCurrency = "USD";\n' + src, ctx);
  return {
    set(list) { ctx.assets = list; vm.runInContext('assets = globalThis.__a;', Object.assign(ctx, { __a: list })); },
    call(expr) { return vm.runInContext(expr, ctx); },
    setBase(b) { vm.runInContext('baseCurrency = ' + JSON.stringify(b) + ';', ctx); },
  };
}
const S = sandbox();

// El owner ANTERIOR: los mismos bytes SIN sus dos guards. La sustitución es mecánica y
// obligatoria — si no encaja, el gate revienta en vez de certificar otra cosa.
const PREV = sandbox(src => {
  const a = '    if (!Number.isFinite(_aurixUsableQuantity(a && a.qty))) return;\n    const valUSD = assetValueUSD(a);\n    if (!Number.isFinite(valUSD)) return;\n';
  const b = '    const valUSD = assetValueUSD(a);\n';
  if (!src.includes(a)) throw new Error('EXTRACCIÓN DESINCRONIZADA: los guards de getInvestableDistribution cambiaron de forma');
  return src.replace(a, b);
});

// ── Fixtures ────────────────────────────────────────────────────────────────
const OZ = 31.1034768;
const HEALTHY = () => ([
  { id: 'a1', type: 'stock',       ticker: 'AAPL', qty: 10,  price: 100,   assetCurrency: 'USD' },
  { id: 'a2', type: 'stock',       ticker: 'SAN',  qty: 5,   price: 100,   assetCurrency: 'EUR' },
  { id: 'a3', type: 'crypto',      ticker: 'BTC',  qty: 0.5, price: 60000, assetCurrency: 'USD' },
  { id: 'a4', type: 'cash',        ticker: 'EUR',  qty: 2000,price: 1,     assetCurrency: 'EUR' },
  { id: 'a5', type: 'real_estate', ticker: 'RE',   qty: 1,   price: 380000,assetCurrency: 'USD' },
  { id: 'a6', type: 'etf',         ticker: 'VWCE', qty: 3,   price: 200,   assetCurrency: 'USD' },
  { id: 'a7', type: 'fund',        ticker: 'FND',  qty: 2,   price: 150,   assetCurrency: 'USD' },
  { id: 'a8', type: 'metal',       ticker: 'XAU',  qty: OZ,  price: 2000,  assetCurrency: 'USD', karat: 24, goldUnit: 'g' },
]);
const sumInv = d => (d || []).filter(x => !x.nonInvestable).reduce((s, x) => s + x.valueBase, 0);
const sumAll = d => (d || []).reduce((s, x) => s + x.valueBase, 0);

console.log('\nAURIX-M06-DASHBOARD-PORTFOLIO — bloques 4 y 5 de M.06\n');

// ── A · LA IDENTIDAD, SOBRE UNA CARTERA SANA ────────────────────────────────
console.log('A — identidad de cifras entre hero, donut y tarjetas:');
{
  S.set(HEALTHY());
  const inv  = S.call('investableValueBase()');
  const tot  = S.call('totalValueBase()');
  const dInv = S.call('getInvestableDistribution()');
  const dAll = S.call('getInvestableDistribution({ includeNonInvestable: true })');
  ok('A.1 Σ(porciones invertibles) == hero invertible', near(sumInv(dInv), inv), sumInv(dInv) + ' vs ' + inv);
  ok('A.2 Σ(todas las porciones, con inmueble) == patrimonio total', near(sumAll(dAll), tot), sumAll(dAll) + ' vs ' + tot);
  ok('A.3 Σ(pct invertible) == 100 exacto',
     near(dInv.reduce((s, x) => s + x.pct, 0), 100, 1e-9), String(dInv.reduce((s, x) => s + x.pct, 0)));
  ok('A.4 el inmueble queda FUERA del hero y presente como categoría con pct 0',
     near(tot - inv, 380000) && dAll.some(x => x.type === 'real_estate' && x.nonInvestable && x.pct === 0));
  ok('A.5 un fondo se pliega en el grupo de ETF (no aparece en «otros»)',
     near((dInv.find(x => x.type === 'etf') || {}).valueBase, 900) && !dInv.some(x => x.type === 'fund'));
  ok('A.6 el oro físico se valora por pureza y unidad (24K, 1 oz en gramos ⇒ 2.000)',
     near((dInv.find(x => x.type === 'metal') || {}).valueBase, 2000, 1e-6));
  ok('A.7 la liquidez en EUR se convierte UNA sola vez (2.000 EUR ⇒ 2.222,22 USD)',
     near((dInv.find(x => x.type === 'cash') || {}).valueBase, 2000 / 0.9, 1e-6));
  // Misma identidad con la divisa base cambiada: el donut no puede quedarse en USD.
  S.setBase('EUR');
  const invE = S.call('investableValueBase()'), dE = S.call('getInvestableDistribution()');
  ok('A.8 la identidad se mantiene con base EUR', near(sumInv(dE), invE), sumInv(dE) + ' vs ' + invE);
  ok('A.8b y el valor cambia de verdad al cambiar la base (no es un no-op)', !near(invE, inv));
  S.setBase('USD');
}

// ── B · EL DEFECTO: UN SOLO ACTIVO BORRABA UNA CATEGORÍA ENTERA ────────────
console.log('\nB — el defecto cerrado (categoría perdida / conjuntos distintos):');
{
  // Divisa sin cobertura FX ⇒ assetValueUSD NaN. 'SEK' no está en _AURIX_FX_FALLBACK.
  const withNaN = HEALTHY().concat([{ id: 'x1', type: 'stock', ticker: 'VOLV', qty: 4, price: 100, assetCurrency: 'SEK' }]);
  S.set(withNaN); PREV.set(withNaN.map(a => ({ ...a })));
  ok('B.0 la divisa del fixture está de verdad sin cobertura', S.call('_aurixFxStatus("SEK")') === 'unknown');
  ok('B.0b y su valoración es NO FINITA', !Number.isFinite(S.call('assetValueUSD(assets[8])')));

  const prevD = PREV.call('getInvestableDistribution()');
  const prevHero = PREV.call('investableValueBase()');
  ok('B.1 ANTES: la categoría «acciones» DESAPARECÍA del donut y de su tarjeta',
     !prevD.some(x => x.type === 'stock'), JSON.stringify(prevD.map(x => x.type)));
  ok('B.1b ANTES: y Σ porciones ya no cuadraba con el hero',
     !near(sumInv(prevD), prevHero), sumInv(prevD) + ' vs ' + prevHero);

  const d = S.call('getInvestableDistribution()'), hero = S.call('investableValueBase()');
  ok('B.2 AHORA: la categoría sigue publicada con su porción CUBIERTA',
     near((d.find(x => x.type === 'stock') || {}).valueBase, 1000 + 500 / 0.9, 1e-6),
     String((d.find(x => x.type === 'stock') || {}).valueBase));
  ok('B.2b AHORA: Σ porciones == hero, y el activo sin cobertura no está en ninguno',
     near(sumInv(d), hero) && near(hero, S.call('investableValueBase()')));
  ok('B.2c y no se INVENTA el valor que falta (el total no crece)',
     near(hero, sandboxHealthyInvestable()), hero + ' vs ' + sandboxHealthyInvestable());

  // Cantidad inválida: la regla canónica UNKNOWN ≠ ZERO.
  [['negativa', -3], ['booleana', true], ['envuelta en array', [5]], ['en blanco', '   ']].forEach(([label, q]) => {
    const list = HEALTHY().concat([{ id: 'q1', type: 'crypto', ticker: 'ETH', qty: q, price: 1000, assetCurrency: 'USD' }]);
    S.set(list); PREV.set(list.map(a => ({ ...a })));
    const pd = PREV.call('getInvestableDistribution()'), ph = PREV.call('investableValueBase()');
    const nd = S.call('getInvestableDistribution()'),    nh = S.call('investableValueBase()');
    ok('B.3 cantidad ' + label + ': AHORA donut y hero coinciden', near(sumInv(nd), nh), sumInv(nd) + ' vs ' + nh);
    ok('B.3b cantidad ' + label + ': el hero la salta y su valor no aparece',
       near(nh, sandboxHealthyInvestable()));
    if (!near(sumInv(pd), ph)) ok('B.3c cantidad ' + label + ': ANTES divergían', true);
    else ok('B.3c cantidad ' + label + ': ANTES el conjunto ya era el mismo (sin divergencia de valor)', true);
  });

  // El hermano de la misma familia YA lo hacía bien: la asimetría estaba en un solo sitio.
  ok('B.4 `getLocationDistribution` (el agregador hermano) ya saltaba los valores no finitos',
     /if \(!Number\.isFinite\(valUSD\) \|\| valUSD <= 0\) return;/.test(fnSrc('getLocationDistribution')));
  ok('B.5 no se ha creado una tercera valoración: se reutilizan las reglas canónicas',
     (app.match(/function assetValueUSD\(/g) || []).length === 1 &&
     (app.match(/function _aurixUsableQuantity\(/g) || []).length === 1 &&
     /_aurixUsableQuantity\(a && a\.qty\)/.test(fnSrc('getInvestableDistribution')));
}
function sandboxHealthyInvestable() {
  const s = sandbox(); s.set(HEALTHY()); return s.call('investableValueBase()');
}

// ── C · CICLO DE VIDA: ALTA / EDICIÓN / BORRADO / VENTA TOTAL ──────────────
console.log('\nC — la identidad sobrevive al ciclo de vida del activo:');
{
  const check = (label) => {
    const d = S.call('getInvestableDistribution({ includeNonInvestable: true })');
    const inv = S.call('investableValueBase()'), tot = S.call('totalValueBase()');
    ok('C · ' + label + ': Σ porciones == total y Σ invertibles == hero',
       near(sumAll(d), tot) && near(sumInv(d), inv), sumAll(d) + '/' + tot);
    return { d, inv, tot };
  };
  let list = HEALTHY();
  S.set(list); const base = check('estado inicial');

  list = list.concat([{ id: 'n1', type: 'stock', ticker: 'MSFT', qty: 2, price: 250, assetCurrency: 'USD' }]);
  S.set(list); const added = check('alta de un activo');
  ok('C.1 el alta se refleja en el hero y en su categoría', near(added.inv - base.inv, 500) &&
     near((added.d.find(x => x.type === 'stock')).valueBase - (base.d.find(x => x.type === 'stock')).valueBase, 500));

  list = list.map(a => a.id === 'n1' ? { ...a, qty: 4 } : a);
  S.set(list); const edited = check('edición de cantidad');
  ok('C.2 la edición sustituye, no duplica', near(edited.inv - base.inv, 1000) &&
     list.filter(a => a.id === 'n1').length === 1);

  list = list.filter(a => a.id !== 'n1');
  S.set(list); const deleted = check('borrado del activo');
  ok('C.3 el borrado devuelve EXACTAMENTE al estado anterior (sin fantasma)',
     near(deleted.inv, base.inv) && near(deleted.tot, base.tot));

  // VENTA TOTAL: la fila NO se borra (nunca se destruye historial financiero), pasa a
  // 'closed' con qty 0 — así que aporta 0 a todas las superficies sin desaparecer.
  list = list.map(a => a.id === 'a3' ? { ...a, qty: 0, lifecycleStatus: 'closed', realizedPnL: 12345 } : a);
  S.set(list); const closed = check('venta total (posición cerrada)');
  ok('C.4 una posición cerrada conserva su fila y aporta 0 (historial intacto)',
     list.some(a => a.id === 'a3' && a.lifecycleStatus === 'closed' && a.realizedPnL === 12345) &&
     near(closed.inv, base.inv - 30000) && !closed.d.some(x => x.type === 'crypto'));
  ok('C.4b y `activeAssets()` la excluye sin borrarla', S.call('activeAssets().length') === list.length - 1);

  // Cartera vacía y de un solo activo: sin ceros falsos ni categorías fabricadas.
  S.set([]);
  ok('C.5 cartera vacía ⇒ la distribución es null (estado vacío, no un cero falso)',
     S.call('getInvestableDistribution()') === null && S.call('totalValueBase()') === 0);
  S.set([{ id: 's1', type: 'crypto', ticker: 'BTC', qty: 1, price: 50000, assetCurrency: 'USD' }]);
  const one = S.call('getInvestableDistribution()');
  ok('C.6 un solo activo ⇒ una sola categoría al 100 %',
     one.length === 1 && one[0].type === 'crypto' && near(one[0].pct, 100) && near(one[0].valueBase, 50000));
  // Cartera de SÓLO inmueble: el hero invertible es 0 y el donut no publica porcentajes falsos.
  S.set([{ id: 'r1', type: 'real_estate', ticker: 'RE', qty: 1, price: 200000, assetCurrency: 'USD' }]);
  ok('C.7 cartera de sólo inmueble: hero invertible 0, patrimonio 200.000, sin pct inventado',
     S.call('investableValueBase()') === 0 && near(S.call('totalValueBase()'), 200000) &&
     S.call('getInvestableDistribution()') === null &&
     (S.call('getInvestableDistribution({ includeNonInvestable: true })') || []).every(x => x.pct === 0));
  S.set(HEALTHY());
}

// ── D · LKG / PERSISTENCIA DE EXPERIENCIA ──────────────────────────────────
console.log('\nD — last-known-good de Dashboard/Portfolio:');
{
  ok('D.1 el render arranca del estado LOCAL (localStorage es el camino caliente)',
     /function load\(\) \{[\s\S]{0,200}getPortfolioData\(\)/.test(app) &&
     /localStorage stays the hot path/.test(app));
  ok('D.2 el precio viaja PERSISTIDO con el activo, así que un refresh fallido conserva el último bueno',
     /return asset\.qty \* asset\.price;/.test(fnSrc('assetNativeValue')) &&
     !/fetch|await/.test(fnSrc('assetValueUSD')));
  ok('D.3 un fallo de refresco no pinta error crudo: degrada a «última actualización hace X»',
     /const errorText\s+= \(elapsedMin != null && typeof staleFn === 'function'\)/.test(app) &&
     /updateStaleSince/.test(app));
  ok('D.4 y ese copy existe en los DOS idiomas',
     (app.match(/updateStaleSince:/g) || []).length === 2 &&
     (app.match(/updatedRecently:/g) || []).length === 2 &&
     (app.match(/updatedNow:/g) || []).length === 2);
  ok('D.5 el refresco silencioso PARCHEA los valores en sitio en vez de reconstruir la rejilla',
     /grid\.dataset\.sig === sig && grid\.children\.length === ALL_CATEGORIES\.length/.test(app) &&
     /does NOT replay the\n  \/\/ staggered entrance animation on every refresh/.test(app));
  ok('D.6 los agregadores del Dashboard son función PURA de `assets` (no leen cachés de usuario)',
     !/localStorage/.test(fnSrc('getInvestableDistribution')) &&
     !/localStorage/.test(fnSrc('investableValueUSD')) &&
     !/localStorage/.test(fnSrc('totalValueUSD')),
     'un agregador que leyera una caché por su cuenta podría resucitar el estado de otra cuenta');
  ok('D.7 el LKG del gráfico tiene su propio owner certificado y aquí no se toca',
     fs.existsSync(path.join(root, 'docs/AURIX-CHART-PREMIUM-PUBLICATION-LKG-harness.js')));
}

// ── E · SUPERFICIE: ESTADOS, ES/EN Y NAVEGACIÓN ────────────────────────────
console.log('\nE — estados de la superficie, ES/EN y navegación:');
{
  const bothLangs = k => (app.match(new RegExp('\\b' + k + ':\\s*', 'g')) || []).length >= 2;
  ['emptyTitle', 'emptySub', 'chartNoData', 'donutTotal', 'emptyDonutLabel', 'centerInvertible',
   'catWeightLabel', 'viewHint', 'updateError'].forEach(k =>
    ok('E.1 clave de superficie en ES y EN: ' + k, bothLangs(k)));
  ok('E.2 salir a una pestaña resetea los sub-estados del Dashboard (categoría y detalle)',
     /activeAssetId\s+= null;/.test(fnSrc('_applyTab')) && /activeCategory = null;/.test(fnSrc('_applyTab')) &&
     /classList\.remove\('is-detail-view'\)/.test(fnSrc('_applyTab')));
  ok('E.3 la liquidez no publica rentabilidad (no hay coste que la sostenga)',
     /cash|liquidity/.test(fnSrc('_aurixCatReturnDisplay')) &&
     /return null/.test(fnSrc('_aurixCatReturnDisplay')));
  ok('E.4 la tarjeta no investible nunca muestra peso ni barra de participación',
     /if \(!dist\.nonInvestable\) \{/.test(app));
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + `  ${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
