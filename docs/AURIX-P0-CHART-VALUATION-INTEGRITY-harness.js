'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-P0-CHART-VALUATION-INTEGRITY — un precio ausente no es una pérdida
// ════════════════════════════════════════════════════════════════════════════
// Este gate EJECUTA el owner real extraído de `app.js` contra fixtures que
// reproducen los regímenes medidos en producción el 2026-09-09. No comprueba que
// exista código: comprueba qué decide.
//
// La regla que se afirma aquí es de integridad financiera, no cosmética: se
// descarta un punto SÓLO si el captador declaró `price_staleness='stale'` Y sus
// dos vecinos lo desmienten (desviación >5% del punto medio con un movimiento
// neto <2% atravesándolo). Nada se interpola, nada se suaviza, el primero y el
// último nunca se tocan, y un movimiento real —que no revierte— sobrevive.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

let pass = 0, fail = 0; const failed = [];
function ok(n, c, info) {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; failed.push(n); console.log('  ✗ ' + n + (info ? '  →  ' + info : '')); }
}

// El owner real, tal cual está en el bundle: constantes + función.
function extract(name) {
  const i = app.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('owner ausente: ' + name);
  let d = 0, st = false;
  for (let k = i; k < app.length; k++) {
    if (app[k] === '{') { d++; st = true; }
    else if (app[k] === '}') { d--; if (st && !d) return app.slice(i, k + 1); }
  }
  throw new Error('owner sin cerrar: ' + name);
}
const NAMES = ['_AURIX_SPIKE_MIN_DEV', '_AURIX_SPIKE_MAX_NET', '_AURIX_SPIKE_MAX_SHARE', '_AURIX_SPIKE_MIN_ALLOW'];
const consts = NAMES
  .map(n => (app.match(new RegExp('const ' + n + '\\s*=\\s*([0-9.]+);')) || [null, null])[1]);
const reject = new Function('window', 'console',
  consts.map((v, i) => 'const ' + NAMES[i] + ' = ' + v + ';').join('\n') +
  '\nlet _aurixSpikePointsRejected = 0;\n' + extract('_aurixRejectStalePriceSpikes') +
  '\nreturn { fn: _aurixRejectStalePriceSpikes, rejected: () => _aurixSpikePointsRejected };')(undefined, { warn() {} });
const run = (rows) => reject.fn(rows);
const P = (ts, v, ps) => ({ ts, total_value_usd: v, price_staleness: ps || 'live' });
const vals = (rows) => rows.map(r => r.total_value_usd);

console.log('AURIX-P0-CHART-VALUATION-INTEGRITY — integridad de valoración del gráfico\n');
console.log('1 · las constantes del contrato son las auditadas');
ok('1.1 desviación 5% · neto 2% · válvula 5% con suelo de 3', consts.join(',') === '0.05,0.02,0.05,3', consts.join(','));

console.log('\n2 · el artefacto medido en producción se descarta, y sólo él');
{
  // Caso real (aa54e431, 09-09 13:30): 82.661 → 67.876 → 82.367, el punto malo 'stale'.
  const real = [P(1, 82764), P(2, 82661), P(3, 67876, 'stale'), P(4, 82367), P(5, 82429)];
  const out = run(real);
  ok('2.1 el punto stale desmentido por sus vecinos desaparece', vals(out).join(',') === '82764,82661,82367,82429', vals(out).join(','));
  ok('2.2 …y no se sustituye por nada: la serie pierde un punto, no gana uno inventado', out.length === real.length - 1);
  ok('2.3 …y queda contabilizado (nunca un descarte silencioso)', reject.rejected() === 1, String(reject.rejected()));
}

console.log('\n3 · lo que NO se puede tocar');
{
  // Movimiento real grande: cae y NO vuelve. Es una pérdida y se respeta.
  const crash = [P(1, 100000), P(2, 100000), P(3, 82000, 'stale'), P(4, 81500), P(5, 81000)];
  ok('3.1 una PÉRDIDA real sobrevive aunque el punto esté marcado stale', run(crash).length === 5, vals(run(crash)).join(','));
  // Escalón de capital: un depósito mueve el nivel y no revierte.
  const flow = [P(1, 50000), P(2, 50000), P(3, 90000, 'stale'), P(4, 90200), P(5, 90100)];
  ok('3.2 un ESCALÓN de flujo de capital sobrevive', run(flow).length === 5, vals(run(flow)).join(','));
  // Sin la declaración del captador no hay evidencia técnica: se publica el dato.
  const live = [P(1, 82764), P(2, 82661), P(3, 67876, 'live'), P(4, 82367), P(5, 82429)];
  ok('3.3 un pico NO declarado stale se conserva: no hay evidencia para retirarlo', run(live).length === 5);
  // Volatilidad normal: por debajo del umbral, intacta.
  const vol = [P(1, 100000), P(2, 100000), P(3, 103000, 'stale'), P(4, 100100), P(5, 100000)];
  ok('3.4 la volatilidad normal (<5%) no se toca', run(vol).length === 5);
  // Extremos: el primero y el último jamás se descartan (ancla y endpoint de ventana).
  const edge = [P(1, 60000, 'stale'), P(2, 100000), P(3, 100000), P(4, 60000, 'stale')];
  ok('3.5 el PRIMER y el ÚLTIMO punto nunca se descartan (ancla y endpoint intactos)', run(edge).length === 4);
}

console.log('\n4 · degradación honesta y determinismo');
{
  ok('4.1 series de menos de 3 puntos se devuelven tal cual', run([P(1, 10), P(2, 99, 'stale')]).length === 2);
  ok('4.2 una entrada que no es array no rompe nada', Array.isArray(run(null)) && run(null).length === 0);
  // Válvula: si más del 5% de la serie parece artefacto, no se descarta NADA.
  const many = [];
  for (let i = 0; i < 40; i++) { many.push(P(i * 2 + 1, 100000)); many.push(P(i * 2 + 2, 60000, 'stale')); }
  ok('4.3 por encima del 5% de candidatos no se descarta nada (fail-closed)', run(many).length === many.length);
  // El suelo de 3 existe para la serie CORTA: quien vuelve tras semanas fuera tiene pocos
  // puntos, y ahí un solo artefacto supera cualquier porcentaje.
  const sparse = [P(1, 100000), P(2, 100000), P(3, 60000, 'stale'), P(4, 100100)];
  ok('4.3b …pero en una serie corta un artefacto único SÍ se descarta (suelo de 3)', run(sparse).length === 3, vals(run(sparse)).join(','));
  const stable = []; for (let i = 0; i < 50; i++) stable.push(P(i, 100000 + i));
  ok('4.4 una cartera estable no pierde ni un punto', run(stable).length === 50);
  const once = [P(1, 82764), P(2, 82661), P(3, 67876, 'stale'), P(4, 82367), P(5, 82429)];
  ok('4.5 es determinista: dos pasadas dan el mismo resultado', JSON.stringify(run(once)) === JSON.stringify(run(once)));
  ok('4.6 no muta la entrada', (() => { const src = once.slice(); run(src); return src.length === 5; })());
}

console.log('\n5 · el filtro vive ANTES del pipeline y no toca la serie financiera');
{
  ok('5.1 se aplica en la lectura de snapshots, no en el render',
    /return _aurixRejectStalePriceSpikes\(data\.map/.test(app));
  ok('5.2 los owners de serie/rendimiento no lo referencian (no hay segundo dueño)',
    (app.match(/_aurixRejectStalePriceSpikes/g) || []).length === 4,
    String((app.match(/_aurixRejectStalePriceSpikes/g) || []).length));
  ok('5.3 no interpola ni suaviza: no hay una sola asignación de valor en el owner',
    !/total_value_usd\s*=/.test(extract('_aurixRejectStalePriceSpikes')) &&
    !/interp|smooth|average|lerp/i.test(extract('_aurixRejectStalePriceSpikes')));
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + `  ${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
