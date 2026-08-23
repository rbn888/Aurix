'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ASSET-LEVEL-HISTORY-FOUNDATION — la serie por posición empieza a existir
// ════════════════════════════════════════════════════════════════════════════
// Aurix puede atribuir el cambio de patrimonio a nivel de CATEGORÍA, pero no a
// nivel de POSICIÓN: no hay serie temporal por activo. Y no se puede reconstruir
// después — exigiría precios históricos de un proveedor externo, que no es
// determinista ni auditable. Esta base la empieza a capturar.
//
// LO QUE ESTE HARNESS PROTEGE, y es lo delicado: que añadir el dato NO cambie ni
// una cifra existente. Ejecuta el `valueUser` REAL del capturador server-side
// (transpilado desde el TypeScript de la Edge Function) y compara el resultado
// contra los invariantes de `total_value_usd`, `category_values` y el guard de
// completitud LB-1.
//
// Write-only por contrato: ningún consumidor de producto lee `asset_values`.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { return ''; } };
const fn  = read('supabase/functions/portfolio-snapshot/index.ts');
const sql = read('db/portfolio_snapshots_asset_values_1.sql');
const app = read('app.js');

let pass = 0, fail = 0; const failed = [];
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; failed.push(n); console.log('  ✗ ' + n + (x ? '  →  ' + x : '')); } };

// ── El owner REAL, ejecutado ────────────────────────────────────────────────
// `valueUser` es TypeScript de Deno. Se extrae la función y se despojan las
// anotaciones de tipo para poder EJECUTARLA en Node: el cuerpo, la aritmética y
// los guards son los mismos que corren en producción.
function extractFn(name, source) {
  const src = source || fn;
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0, st = false;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') { d++; st = true; }
    else if (src[k] === '}') { d--; if (st && !d) return src.slice(i, k + 1); }
  }
  return '';
}
// Despoja las anotaciones de tipo para poder ejecutar el cuerpo en Node. Se hace
// en dos pasos porque la FIRMA lleva genéricos anidados (`Map<string, {…}>`) que
// una sola pasada de regex no cierra bien: primero se reescribe la lista de
// parámetros completa, después las anotaciones simples del cuerpo.
// Despoja las anotaciones de TypeScript para poder EJECUTAR el owner en Node.
// Deliberadamente por lista LITERAL y no por regex genérica: un `:` de anotación y el
// de un ternario (`? v : x`) son indistinguibles sin parsear TypeScript de verdad, y
// una regex aproximada mutila el cuerpo en silencio — que es el peor fallo posible en
// un harness (pasaría a probar un código que no es el de producción).
// Si la firma del capturador cambia, `assertTranspiled` lo detecta y el harness se
// pone rojo en vez de medir otra cosa.
const TS_STRIP = [
  ['function bucketOf(type: string): string {',          'function bucketOf(type) {'],
  ['function goldPurity(k: any): number {',              'function goldPurity(k) {'],
  ['function goldGrams(qty: number, unit: string): number {', 'function goldGrams(qty, unit) {'],
  ['function isUsEquityOpenNow(now: Date): boolean {',   'function isUsEquityOpenNow(now) {'],
  ['function fxToUsd(cur: string, prices: Map<string, { price: number; currency: string }>): number {',
   'function fxToUsd(cur, prices) {'],
  ['function valueUser(row: any, prices: Map<string, { price: number; currency: string }>, now: Date) {',
   'function valueUser(row, prices, now) {'],
  ['const catalog: any[] =',        'const catalog ='],
  ['const holdings: any[] =',       'const holdings ='],
  ['new Map<any, any>(',            'new Map('],
  ['const categories: Record<string, number> = {}',   'const categories = {}'],
  ['const assetValues: Record<string, number> = {}',  'const assetValues = {}'],
  ['const warnings: string[] = []', 'const warnings = []'],
  ['catalog.map((a: any) =>',       'catalog.map((a) =>'],
  ['let valueUSD: number =',        'let valueUSD ='],
];
function deTypeScript(src) {
  let out = src;
  for (const [from, to] of TS_STRIP) out = out.split(from).join(to);
  // Red de seguridad SÓLO para declaraciones (`let|const x: T = …`). Es segura porque
  // ancla en la palabra clave, así que no puede confundir un ternario con una anotación.
  out = out.replace(/\b(let|const|var)\s+(\w+)\s*:\s*[\w<>\[\]{}, ;|]+?\s*=/g, '$1 $2 =');
  return out;
}
// ORDEN OBLIGATORIO: despojar tipos ANTES de extraer. Si se extrae primero, la `{`
// de un tipo inline (`Map<string, { price: number }>`) abre y cierra el conteo de
// llaves antes que el cuerpo real y la función sale truncada.
const FN_JS = deTypeScript(fn);
const SRC = ['bucketOf', 'goldPurity', 'goldGrams', 'isUsEquityOpenNow', 'fxToUsd', 'valueUser']
  .map(n => extractFn(n, FN_JS)).join('\n');
const CONSTS = 'const OZ_TO_G = 31.1034768;'
  + 'const PURITY_TABLE = { "10":0.4167,"14":0.5833,"18":0.7500,"21":0.8750,"22":0.9167,"24":1.0000 };';
// Si el capturador cambia su firma, esto lo dice en voz alta.
function assertTranspiled(src) {
  const leftovers = src.split('\n').filter(l => /\b(any|Record<|Map<|: string|: number|: boolean|: Date)\b/.test(l)
                                                 && !/^\s*\/\//.test(l));
  return leftovers.length ? leftovers[0].trim().slice(0, 100) : null;
}
let valueUser = null, buildErr = null;
const leftover = assertTranspiled(SRC);
try {
  if (leftover) throw new Error('TypeScript sin despojar (¿cambió la firma del capturador?): ' + leftover);
  valueUser = new Function(CONSTS + '\n' + SRC + '\n;return valueUser;')();
} catch (e) { buildErr = String(e && e.message); }

const NOW = new Date('2026-08-24T15:00:00Z');          // mercado abierto, ts fijo
const PRICES = new Map([
  ['BTC', { price: 100000, currency: 'USD' }],
  ['ETH', { price: 3000,   currency: 'USD' }],
  ['AAPL',{ price: 200,    currency: 'USD' }],
  ['EURUSD=X', { price: 1.08, currency: 'USD' }],
]);
const ROW = {
  assets: [
    { id: 'a-btc',  symbol: 'BTC',  type: 'crypto', currentPrice: 100000, assetCurrency: 'USD' },
    { id: 'a-eth',  symbol: 'ETH',  type: 'crypto', currentPrice: 3000,   assetCurrency: 'USD' },
    { id: 'a-aapl', symbol: 'AAPL', type: 'stock',  currentPrice: 200,    assetCurrency: 'USD' },
    { id: 'a-eur',  symbol: 'EUR',  type: 'cash',   currentPrice: 1,      assetCurrency: 'EUR' },
  ],
  holdings: [
    { id: 'h1', asset_id: 'a-btc',  quantity: 0.5 },
    { id: 'h2', asset_id: 'a-eth',  quantity: 10  },
    { id: 'h3', asset_id: 'a-aapl', quantity: 20  },
    { id: 'h4', asset_id: 'a-eur',  quantity: 1000 },
  ],
};

console.log('\nAURIX-ASSET-LEVEL-HISTORY-FOUNDATION\n');
console.log('1 — El capturador conserva el valor por posición:');
ok('1.0 el owner real se puede ejecutar', !!valueUser, buildErr || '');
if (!valueUser) { console.log('\n❌ sin owner ejecutable, el resto no se puede afirmar'); process.exit(1); }

const V = valueUser(ROW, PRICES, NOW);
{
  ok('1.1 cada posición valorada tiene su entrada',
     Object.keys(V.assetValues).length === 4, JSON.stringify(V.assetValues));
  ok('1.2 los valores son los correctos (0,5 BTC = 50.000, 1.000 € = 1.080)',
     V.assetValues['a-btc'] === 50000 && V.assetValues['a-eth'] === 30000
     && V.assetValues['a-aapl'] === 4000 && V.assetValues['a-eur'] === 1080,
     JSON.stringify(V.assetValues));
  ok('2.1 la clave es la identidad canónica (asset_id), no ticker ni nombre',
     Object.keys(V.assetValues).every(k => /^a-/.test(k))
     && !Object.keys(V.assetValues).some(k => ['BTC', 'ETH', 'AAPL', 'EUR'].includes(k)));
  ok('2.2 y es la MISMA identidad que ya usan los flujos de capital',
     /asset_id:\s*f\.assetId \? String\(f\.assetId\) : null/.test(app));
  ok('3.1 el mapa describe el mismo instante lógico que el snapshot',
     /assetValues\[_aid\] = \+\(\(\(assetValues\[_aid\] \|\| 0\) \+ valueUSD\)/.test(fn)
     && fn.indexOf('assetValues[_aid]') > fn.indexOf('if (!Number.isFinite(valueUSD))'),
     'la escritura debe ir DESPUÉS del guard de valoración, en el mismo bucle');
  ok('3.2 la suma de las posiciones reconstruye el total',
     Math.abs(Object.values(V.assetValues).reduce((s, x) => s + x, 0) - V.total) < 0.01,
     'Σ=' + Object.values(V.assetValues).reduce((s, x) => s + x, 0) + ' vs total=' + V.total);
}
{
  // ── TRAMPA PARA EL LECTOR FUTURO — Σ asset_values NO es el patrimonio invertible ──
  // `asset_values` contiene TODAS las posiciones valoradas, incluidas las de real estate.
  // Eso es correcto para el capturador (guardar menos sería perder dato), pero convierte
  // `asset_values[x] / Σ asset_values` en el peso sobre el patrimonio TOTAL, no sobre el
  // INVERTIBLE — que es el denominador que usa todo lo demás en Aurix (`total − real_estate`,
  // el mismo de `category_values` y del Dashboard). Un lector que lo ignore publicaría un
  // 20 % donde el peso real es del 50 %.
  // Se fija aquí, ejecutable, en vez de en una nota: la futura SPEC de Attribution debe
  // derivar el denominador de la semántica canónica, nunca de la suma del mapa.
  const withRE = {
    assets: [...ROW.assets, { id: 'a-flat', symbol: 'FLAT', type: 'real_estate', currentPrice: 1, assetCurrency: 'USD' }],
    holdings: [...ROW.holdings, { id: 'h6', asset_id: 'a-flat', quantity: 300000 }],
  };
  const R = valueUser(withRE, PRICES, NOW);
  const sumAll = Object.values(R.assetValues).reduce((s, x) => s + x, 0);
  ok('3.3 las posiciones de real estate SÍ están en el mapa (no se pierden)',
     R.assetValues['a-flat'] === 300000 && R.realEstate === 300000);
  ok('3.4 por eso Σ asset_values = TOTAL, y NO el invertible',
     Math.abs(sumAll - R.total) < 0.01 && Math.abs(sumAll - (R.total - R.realEstate)) > 0.01,
     'Σ=' + sumAll + ' · total=' + R.total + ' · invertible=' + (R.total - R.realEstate));
  ok('3.5 el invertible se deriva de la semántica canónica (total − real_estate)',
     Math.abs((R.total - R.realEstate) - (sumAll - R.assetValues['a-flat'])) < 0.01,
     'un peso invertible correcto excluye las posiciones de real estate del numerador Y del denominador');
}

console.log('\n4 — Una posición sin valoración NO se convierte en 0:');
{
  const rowUnpriced = {
    assets: [...ROW.assets, { id: 'a-x', symbol: 'ZZZZ', type: 'stock', currentPrice: NaN, assetCurrency: 'USD' }],
    holdings: [...ROW.holdings, { id: 'h5', asset_id: 'a-x', quantity: 5 }],
  };
  const U = valueUser(rowUnpriced, PRICES, NOW);
  ok('4.1 la posición sin precio NO aparece en el mapa', !('a-x' in U.assetValues), JSON.stringify(U.assetValues));
  ok('4.2 y NO aparece como 0 (ausencia ≠ cero)', U.assetValues['a-x'] === undefined);
  ok('4.3 el capturador la cuenta como valoración parcial', U.dropped_asset_count === 1);
  ok('4.4 y un snapshot parcial NUNCA se persiste (guard LB-1 intacto)',
     /if \(Number\(v\.dropped_asset_count\) > 0\) \{ incompleteRej\+\+; continue; \}/.test(fn),
     'sin este guard, un mapa incompleto se leería como cartera menguante');
  ok('4.5 ⇒ todo asset_values persistido está completo por construcción',
     U.dropped_asset_count > 0 && Object.keys(U.assetValues).length === 4);
}

console.log('\n5/6 — Compatibilidad con lo que ya existe:');
{
  ok('5.1 la columna es NULLABLE y sin default: NULL = no capturado, no cartera vacía',
     /add column if not exists asset_values jsonb;/.test(sql)
     && !/asset_values jsonb[^;]*default/.test(sql) && !/asset_values jsonb[^;]*not null/.test(sql));
  ok('5.2 y el SQL lo declara explícitamente para quien lo lea después',
     /NULL = no capturado/.test(sql) && /comment on column/.test(sql));
  ok('5.3 la migración es aditiva e idempotente (no toca columnas ni filas existentes)',
     /add column if not exists/.test(sql)
     && !/\b(drop|update|delete|truncate)\b/i.test(sql.replace(/--.*$/gm, '')));
  ok('6.1 ningún consumidor de producto lee asset_values (write-only)',
     !/asset_values/.test(app), 'app.js no debe consumirlo todavía');
  // Se cuenta la ESCRITURA, no las menciones: el bloque que documenta la decisión
  // nombra la columna varias veces y eso no es un consumidor.
  ok('6.2 existe exactamente UNA escritura de la columna, en el insert del capturador',
     (fn.replace(/\/\/.*$/gm, '').match(/asset_values\s*:/g) || []).length === 1,
     'escrituras: ' + (fn.replace(/\/\/.*$/gm, '').match(/asset_values\s*:/g) || []).length);
}

console.log('\n7/8/9/10 — Ni una cifra existente cambia:');
{
  // Baseline con el MISMO input: los agregados deben ser idénticos a lo esperado.
  ok('7.1 category_values conserva su semántica y sus valores',
     V.categories.crypto === 80000 && V.categories.stock === 4000 && V.categories.liquidity === 1080,
     JSON.stringify(V.categories));
  ok('7.2 el mapa por activo NO altera los buckets (se escribe aparte)',
     Object.keys(V.categories).length === 3);
  ok('8.1 total_value_usd no cambia', V.total === 85080, String(V.total));
  ok('8.2 real_estate no cambia', V.realEstate === 0);
  ok('8.3 asset_count no cambia', V.count === 4);
  ok('9.1 no se ha tocado ninguna fórmula financiera del capturador',
     /const market_state = anyCrypto && !anyClosed \? 'crypto_24_7'/.test(fn)
     && /if \(bucket === 'real_estate'\) realEstate \+= valueUSD;/.test(fn));
  ok('10.1 el Chart Engine no participa: el cambio vive sólo en el capturador y el SQL',
     !/asset_values/.test(read('services/portfolio-chart-engine.js') + read('services/aurix-chart-core.js')));
}

console.log('\n11/12/13 — Honestidad histórica, idempotencia y coste:');
{
  ok('11.1 no hay backfill sintético de ninguna clase',
     !/backfill/i.test(fn) && !/asset_values/.test(sql.replace(/--[\s\S]*?$/gm, '').split('add column')[0] || ''));
  ok('11.2 el SQL no reconstruye historia (sólo añade la columna)',
     (sql.replace(/--.*$/gm, '').match(/^\s*\w+/gm) || []).filter(l => /^\s*(insert|update)/i.test(l)).length === 0);
  ok('12.1 la escritura sigue siendo idempotente por (user_id, minuto)',
     /23505/.test(fn) && /unique constraint/i.test(fn));
  {
    // Coste: una cartera de 50 posiciones con ids de ~24 caracteres.
    const sample = {}; for (let i = 0; i < 50; i++) sample['ast_' + String(i).padStart(20, '0')] = 12345.67;
    const bytes = JSON.stringify(sample).length;
    ok('13.1 el volumen por snapshot es razonable (50 posiciones)',
       bytes < 3000, bytes + ' B/snapshot ⇒ ~' + Math.round(bytes * 96 / 1024) + ' KB/día/cartera a */15');
  }
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
