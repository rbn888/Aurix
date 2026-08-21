'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-SEARCH-CLASS-SHARE-ALIAS — MICRO-FIX BRK.B
// ════════════════════════════════════════════════════════════════════════════
// Yahoo indexa las clases de acción US con GUION (BRK-B). La consulta se enviaba
// verbatim, así que la convención que el usuario escribe (BRK.B) no encontraba el
// instrumento mientras el nombre ("Berkshire") sí. Este harness ejecuta la función
// REAL de normalización del endpoint y fija que sea estrecha: nada de sufijos de
// mercado, nada de tickers reales reescritos.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { return ''; } };
const src = read('api/search/assets.js');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x ? '  → ' + x : '')); } };
function fnSource(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0, st = false;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') { d++; st = true; }
    else if (src[k] === '}') { d--; if (st && !d) return src.slice(i, k + 1); }
  }
  return '';
}

console.log('AURIX-SEARCH-CLASS-SHARE-ALIAS — MICRO-FIX BRK.B\n');

// Se reconstruye con sus DOS dependencias reales, extraídas del propio fichero.
const dotRe   = /const CLASS_SHARE_DOT = ([^;]+);/.exec(src);
const aliasMp = /const COMPACT_ALIASES = (Object\.freeze\(\{[^}]*\}\));/.exec(src);
let alias = null;
try {
  alias = new Function('CLASS_SHARE_DOT', 'COMPACT_ALIASES',
    fnSource('aliasQuery') + '\n;return aliasQuery;')(eval(dotRe[1]), eval(aliasMp[1]));
} catch (_) {}

console.log('1 — El normalizador existe y es el owner único de la traducción:');
ok('1.1 la función de alias es ejecutable', typeof alias === 'function');
ok('1.2 se aplica a la consulta, en la ÚNICA petición que ya existía',
   /q=\$\{encodeURIComponent\(aliasQuery\(q\)\)\}/.test(src)
   && (src.match(/await fetch\(/g) || []).length === 1);
ok('1.3 la respuesta NO se reescribe: el símbolo de Yahoo viaja intacto',
   !/ticker:\s*aliasQuery|symbol:\s*aliasQuery/.test(src));
ok('1.4 no se ha añadido ningún proveedor ni endpoint',
   (src.match(/https:\/\/query1\.finance\.yahoo\.com/g) || []).length === 1);

if (typeof alias === 'function') {
  console.log('\n2 — Contrato focal: las cuatro formas convergen al mismo instrumento:');
  ok('2.1 BRK.B → BRK-B (el símbolo que Yahoo sí indexa)', alias('BRK.B') === 'BRK-B', alias('BRK.B'));
  ok('2.2 BRK-B intacto (ya funcionaba)',                  alias('BRK-B') === 'BRK-B', alias('BRK-B'));
  ok('2.3 BRKB → BRK-B (forma compacta, mapa explícito)',  alias('BRKB')  === 'BRK-B', alias('BRKB'));
  ok('2.4 "Berkshire" intacto: las consultas por nombre no se tocan',
     alias('Berkshire') === 'Berkshire' && alias('Berkshire Hathaway') === 'Berkshire Hathaway');
  ok('2.5 minúsculas y espacios sobrantes también convergen',
     alias(' brk.b ') === 'BRK-B' && alias('brkb') === 'BRK-B');
  ok('2.6 la clase A es simétrica (mismo defecto, misma regla)',
     alias('BRK.A') === 'BRK-A' && alias('BRKA') === 'BRK-A');

  console.log('\n3 — La regla es estrecha: cero colisiones con lo que ya funcionaba:');
  ok('3.1 AAPL sin regresión', alias('AAPL') === 'AAPL');
  const intl = ['CSPX.L', '4GLD.DE', 'IWDA.AS', 'VWCE.DE', 'SXR8.DE', 'VUAA.L', 'SGLN.L',
                'BRK.MX', 'SAN.MC', 'NESN.SW', 'ASML.AS', 'MC.PA', 'ENI.MI', '0700.HK',
                '7203.T', '000001.SS', 'SHOP.TO', 'ABC.V', 'BMW.F'];
  ok('3.2 ningún listado internacional se reescribe (sufijo de mercado intacto)',
     intl.every(s => alias(s) === s), intl.filter(s => alias(s) !== s).join(','));
  ok('3.3 los índices no se tocan', ['^GSPC', '^GDAXI', '^N225', '^STOXX50E'].every(s => alias(s) === s));
  ok('3.4 los pares y los códigos con barra no se tocan',
     alias('XAU/USD') === 'XAU/USD' && alias('ETH-USD') === 'ETH-USD');
  ok('3.5 los códigos de fondo (0P*) no se tocan', alias('0P0000OMNF.SW') === '0P0000OMNF.SW');
  ok('3.6 un ISIN no se toca', alias('IE00B5BMR087') === 'IE00B5BMR087');
  ok('3.7 los tickers de 4 letras que ACABAN en A o B no se rompen',
     ['NVDA', 'TSLA', 'META', 'ABNB', 'CVNA', 'AVGO'].every(s => alias(s) === s),
     ['NVDA', 'TSLA', 'META', 'ABNB', 'CVNA', 'AVGO'].filter(s => alias(s) !== s).join(','));
  ok('3.8 un prefijo de más de 4 letras con .B no entra en la regla',
     alias('ABCDE.B') === 'ABCDE.B');
  ok('3.9 un sufijo de una letra que NO es A/B no entra en la regla',
     alias('XYZ.L') === 'XYZ.L' && alias('XYZ.T') === 'XYZ.T' && alias('XYZ.F') === 'XYZ.F');
  ok('3.10 el mapa compacto es cerrado: sólo dos entradas verificadas',
     Object.keys(eval(aliasMp[1])).length === 2, Object.keys(eval(aliasMp[1])).join(','));
  ok('3.11 el mapa NO contiene formas que sean tickers reales por sí mismas',
     !Object.keys(eval(aliasMp[1])).some(k => ['NVDA', 'TSLA', 'META', 'AAPL', 'BF', 'HEI', 'STZ'].includes(k)));
  ok('3.12 una cadena vacía o basura no revienta ni inventa',
     alias('') === '' && alias(null) === '' && alias(undefined) === '');

  console.log('\n4 — La familia entera de clases de acción US queda cubierta:');
  ok('4.1 BF.B → BF-B (Brown-Forman: hoy devuelve 0 resultados con el punto)',
     alias('BF.B') === 'BF-B', alias('BF.B'));
  ok('4.2 otras clases conocidas del mismo patrón',
     alias('LEN.B') === 'LEN-B' && alias('HEI.A') === 'HEI-A' && alias('STZ.B') === 'STZ-B');
}

console.log('\n5 — Alcance: nada más se ha tocado:');
ok('5.1 el corte de resultados sigue igual', /const MAX_RESULTS    = 7;/.test(src));
ok('5.2 el filtro de quoteType sigue igual',
   /qt\.quoteType === 'EQUITY' \|\| qt\.quoteType === 'ETF'/.test(src));
ok('5.3 CORS y validación de entrada intactos',
   /if \(!q \|\| q\.length > 64\) return res\.status\(400\)/.test(src)
   && /Access-Control-Allow-Origin/.test(src));
ok('5.4 el ranking del cliente no se ha tocado',
   (read('app.js').match(/^function _aurixRankSearchResults\(/gm) || []).length === 1);
ok('5.5 el universo de Market no se ha tocado',
   /const MARKET_ETFS\s*=\s*\[/.test(read('app.js')) && /'CNDX\.L'/.test(read('app.js')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
