'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-P0-PERFORMANCE-TRUTH — una sola verdad financiera, aislada por usuario
// ════════════════════════════════════════════════════════════════════════════
// Aurix tenía dos motores contestando a la misma pregunta: el gráfico exigía
// cobertura proporcional al rango y recortaba el régimen de construcción; el
// owner que ESCRIBE `performance_state` sólo exigía 90 segundos de historia y un
// ratio de magnitud ≤3. Resultado medido en producción: seis cuentas publicando
// un rendimiento ANUAL sin tener un año (una de cinco días), y un baseline que
// era el instante de alta de la cartera.
//
// Este gate EJECUTA las dos guardas reales extraídas de `app.js` contra los
// regímenes medidos, y afirma además el aislamiento por usuario: cada cuenta se
// juzga con SU serie, y ninguna hereda ancla ni cobertura de otra.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
let pass = 0, fail = 0; const failed = [];
function ok(n, c, info) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; failed.push(n); console.log('  ✗ ' + n + (info ? '  →  ' + info : '')); } }
function fn(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let k = app.indexOf('{', i), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(i, k); }
function konst(name) { const m = app.match(new RegExp('const ' + name + '\\s*=.*?;')); if (!m) throw new Error('missing ' + name); return m[0]; }
function objConst(name) { const m = app.match(new RegExp('const ' + name + '\\s*=\\s*\\{[\\s\\S]*?\\};')); if (!m) throw new Error('missing ' + name); return m[0]; }

const DAY = 864e5;
// Sandbox: las dos guardas + su tabla de rangos + una serie elegible inyectable POR USUARIO.
const S = { console, Math, Array, Number, isFinite, Infinity, JSON, String };
vm.createContext(S);
vm.runInContext(objConst('_AURIX_EMG_RANGE_MS'), S);
['_AURIX_RETURN_RANGE_COVERAGE_MIN', '_AURIX_BASELINE_CONSTRUCTION_FRAC'].forEach(c => vm.runInContext(konst(c), S));
vm.runInContext('let __SERIES = {}; function _aurixEligibleInvestableSeries(r){ return { series: (__SERIES[__USER] || []) }; } let __USER = "A";', S);
[ '_aurixRangeSpanShortfall', '_aurixBaselineInConstructionRegime' ].forEach(n => vm.runInContext(fn(n), S));
const setUser = (u) => { S.__USER = u; vm.runInContext('__USER = ' + JSON.stringify(u) + ';', S); };
const setSeries = (u, vals) => { S.__V = vals; vm.runInContext('__SERIES[' + JSON.stringify(u) + '] = ' + JSON.stringify(vals.map(v => ({ value: v }))) + ';', S); };
const shortfall = (r, ms) => vm.runInContext('_aurixRangeSpanShortfall(' + JSON.stringify(r) + ',' + ms + ')', S);
const construction = (r, b) => vm.runInContext('_aurixBaselineInConstructionRegime(' + JSON.stringify(r) + ',' + b + ')', S);

console.log('AURIX-P0-PERFORMANCE-TRUTH — un solo owner financiero autoritativo\n');

console.log('1 · la cobertura tiene que ser proporcional al rango PEDIDO');
ok('1.1 una cuenta de ~41 días NO puede afirmar 1Y', shortfall('1y', 41 * DAY) === true);
ok('1.2 una cuenta de 5 días NO puede afirmar 1Y ni 30D',
  shortfall('1y', 5 * DAY) === true && shortfall('30d', 5 * DAY) === true);
ok('1.3 una cuenta de 5 días SÍ puede afirmar 24H y 7D si su span los cubre',
  shortfall('24h', 5 * DAY) === false && shortfall('7d', 6.1 * DAY) === false);
ok('1.4 una cuenta con 26 días afirma 30D (≥80%) y con 20 no',
  shortfall('30d', 26 * DAY) === false && shortfall('30d', 20 * DAY) === true);
ok('1.5 con un año real de historia, 1Y sí', shortfall('1y', 366 * DAY) === false);
ok('1.6 ALL nunca queda sin cobertura: su ventana es la vida de la cuenta',
  shortfall('all', 1) === false && shortfall('all', 400 * DAY) === false);
ok('1.7 un span no demostrable falla CERRADO', shortfall('30d', NaN) === true && shortfall('30d', -1) === true);
ok('1.8 un rango desconocido no inventa exigencia', shortfall('7y', 10 * DAY) === false);

console.log('\n2 · el ancla no puede ser el alta de la cartera');
setSeries('A', [85465, 196777, 202474, 210000, 215000, 227682, 230000, 235683]);
setUser('A');
ok('2.1 el baseline de construcción medido en producción (85.465 vs mediana ~215K) se rechaza',
  construction('all', 85465.43) === true);
ok('2.2 …y el baseline real de 30D de esa misma cuenta se acepta', construction('30d', 202474.43) === false);
setSeries('B', [50000, 60000, 70000, 80000, 90000, 100000]);
setUser('B');
ok('2.3 una cartera que se DOBLA de verdad conserva su rendimiento (ancla cerca de la mediana)',
  construction('all', 50000) === false);
setSeries('C', [137, 85465, 196777, 210000, 227682]);
setUser('C');
ok('2.4 una rampa de alta (137 → 227K) se rechaza como ancla', construction('all', 137.33) === true);
setSeries('D', [100000, 100000]);
setUser('D');
ok('2.5 sin cuerpo de serie (<3 puntos) no se juzga: no se censura por falta de datos',
  construction('all', 10) === false);
ok('2.6 un baseline no positivo no dispara la guarda', construction('all', 0) === false && construction('all', -5) === false);

console.log('\n3 · aislamiento estricto por usuario');
setSeries('A', [85465, 196777, 202474, 210000, 215000, 227682, 230000, 235683]);
setSeries('B', [300, 310, 320, 330, 340]);
setUser('A');
const aRejectsOwn = construction('all', 85465.43);
const aAcceptsOwn = construction('all', 210000);
setUser('B');
const bJudgedWithB = construction('all', 310);        // 310 vs mediana 320 ⇒ aceptado
const bRejectsLow = construction('all', 100);         // 100 < 0.55×320 ⇒ rechazado
ok('3.1 cada cuenta se juzga contra SU propia serie, no contra la de otra',
  aRejectsOwn === true && aAcceptsOwn === false && bJudgedWithB === false && bRejectsLow === true);
setUser('A');
ok('3.2 volver a A no arrastra el juicio de B (A→B→A determinista)',
  construction('all', 85465.43) === true && construction('all', 210000) === false);
ok('3.3 un usuario sin serie no hereda la del anterior: no se juzga',
  (setSeries('Z', []), setUser('Z'), construction('all', 1) === false));

console.log('\n4 · el contrato es global, sin excepciones por cuenta');
{
  const src = fn('_aurixRangeSpanShortfall') + fn('_aurixBaselineInConstructionRegime');
  ok('4.1 ninguna guarda contiene user ids, fechas ni valores de cartera hardcodeados',
    !/[0-9a-f]{8}-[0-9a-f]{4}/.test(src) && !/202[0-9]-[0-9]{2}-[0-9]{2}/.test(src) &&
    !/85465|227682|196777/.test(src));
  ok('4.2 las dos autoridades son las del gráfico (0.80 y 0.55), no números nuevos',
    /_AURIX_RETURN_RANGE_COVERAGE_MIN\s*=\s*0\.80/.test(app) && /_AURIX_BASELINE_CONSTRUCTION_FRAC\s*=\s*0\.55/.test(app));
  ok('4.3 las dos guardas están CABLEADAS en el owner que escribe performance_state',
    /_aurixRangeSpanShortfall\(r, windowMs\)\) invalidReason = 'insufficient_range_coverage'/.test(app) &&
    /_aurixBaselineInConstructionRegime\(r, baselineValue\)\) invalidReason = 'baseline_construction_regime'/.test(app));
  ok('4.4 leen la serie elegible del usuario, no un dataset paralelo',
    /_aurixEligibleInvestableSeries\(range\)/.test(fn('_aurixBaselineInConstructionRegime')));
  ok('4.5 las causas nuevas NO se declaran transitorias (no preservan un % anterior)',
    !/insufficient_range_coverage|baseline_construction_regime/.test(
      (app.match(/const _AURIX_24H_TRANSIENT_PENDING_CAUSES = \[[\s\S]*?\];/) || [''])[0]));
  ok('4.6 el gráfico (v705) no se toca: su owner de descarte sigue intacto',
    /function _aurixRejectStalePriceSpikes\(rows\)/.test(app) &&
    /return _aurixRejectStalePriceSpikes\(data\.map/.test(app));
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + `  ${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
