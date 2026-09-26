'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-WORKSPACE-BUDGET-PILOT — §26/§27 · PRESUPUESTO COMO REFERENCE IMPLEMENTATION
// ════════════════════════════════════════════════════════════════════════════
// Presupuesto es el PILOTO del estándar Workspace, así que lo que se fija aquí no es «la pantalla
// del presupuesto»: es el contrato que las demás capacidades tendrán que cumplir cuando se
// migren, y de donde saldrán los componentes comunes (paso 3 de la dirección).
//
// LO QUE HABÍA: una columna de cinco tarjetas apiladas, todas sobre el mismo azul oscuro, con el
// gráfico al final. El usuario abría la plantilla para saber cuánto le queda y tenía que cruzar
// diez campos para llegar a la respuesta.
//
// Se mide el CONTRATO, no la apariencia: qué cifras salen del motor, qué NO se pinta cuando no hay
// dato, y que no exista una segunda matemática. La geometría (columnas reales, orden en móvil,
// desbordamiento) la mide `scripts/aurix-ws-budget-probe.mjs` en navegador, porque una hoja de
// estilos leída no demuestra un layout.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }
function section(t) { console.log('\n' + t); }

function fnSrc(name) {
  const s = 'function ' + name + '(';
  const i = app.indexOf(s);
  if (i < 0) throw new Error('falta ' + name);
  let k = app.indexOf('{', i), d = 0;
  for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) return app.slice(i, k + 1); } }
  throw new Error('sin cerrar ' + name);
}
function constSrc(name) {
  const re = new RegExp('const ' + name + '\\s*=');
  const m = re.exec(app);
  if (!m) throw new Error('falta const ' + name);
  let i = m.index, d = 0, q = null;
  for (; i < app.length; i++) {
    const c = app[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if ('([{'.includes(c)) d++;
    else if (')]}'.includes(c)) d--;
    else if (c === ';' && d === 0) break;
  }
  return app.slice(m.index, i + 1);
}

// ── el sandbox carga el motor y los pintores REALES ────────────────────────
function ctx() {
  const sb = { console, Math, JSON, Array, Number, Object, String, Boolean, isFinite, isNaN, parseInt, parseFloat, Infinity, NaN, undefined };
  vm.createContext(sb);
  const tI = app.indexOf('const T = {');
  let k = app.indexOf('{', tI), d = 0, end = -1;
  for (; k < app.length; k++) { if (app[k] === '{') d++; else if (app[k] === '}') { d--; if (!d) { end = k + 1; break; } } }
  vm.runInContext('var lang = "es";', sb);
  vm.runInContext(app.slice(tI, end) + ';', sb);
  vm.runInContext('function t(k){ var dd=T[lang]||T.es; var v=dd[k]; if(v===undefined) v=T.es[k]; return v; }', sb);
  vm.runInContext('function _intccEsc(x){ return String(x == null ? "" : x).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c])); }', sb);
  vm.runInContext('function formatBase(v){ return String(Math.round(Number(v) || 0)) + " €"; }', sb);
  vm.runInContext('function _wsNum(v){ if (v == null || v === "") return 0; var n = Number(String(v).replace(/\\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; }', sb);
  ['_WSBUD_INCOME', '_WSBUD_EXPENSES', '_WSBUD_DONUT_R'].forEach(n => vm.runInContext(constSrc(n), sb));
  ['calculateMonthlyBudget', '_wsBudgetDonutHtml', '_wsBudgetChartHtml'].forEach(n => vm.runInContext(fnSrc(n), sb));
  return sb;
}
const C = ctx();
const R = e => vm.runInContext(e, C);

// ════════════════════════════════════════════════════════════════════════════
section('1 · El motor no cambió (§43: no se toca matemática financiera):');
// ════════════════════════════════════════════════════════════════════════════
{
  const r = R('calculateMonthlyBudget({ salary: 2500, housing: 700, food: 350, transport: 120, utilities: 110, leisure: 150, education: 50, otherexp: 100 })');
  ok('1.1 ingresos, gastos y disponible siguen siendo la misma aritmética',
    r.income === 2500 && r.expenses === 1580 && r.free === 920, JSON.stringify([r.income, r.expenses, r.free]));
  ok('1.2 la tasa de ahorro sigue siendo sobre INGRESOS y con su denominador declarado',
    Math.round(r.saveRate) === 37 && r.saveRateBasis === 'share_of_income');
  const z = R('calculateMonthlyBudget({ salary: 0, housing: 100 })');
  ok('1.3 con ingresos cero la tasa NO es 0: es no aplicable (§44)',
    z.saveRate === null && z.applicable === false && z.saveRateBasis === null, JSON.stringify(z.saveRate));
  ok('1.4 un déficit se nombra como hecho aritmético', z.deficit === true && z.free === -100);
  // Ningún umbral de opinión nuevo: la lectura sigue siendo neutral. Se miran los COMENTARIOS
  // aparte, porque el de esta función documenta precisamente la escalera que se retiró — medir la
  // historia en vez del código es como este assert falló la primera vez.
  const out = fnSrc('_wsBudgetOutHtml').replace(/\/\/[^\n]*/g, '');
  ok('1.5 sigue sin escalera de veredictos («margen sólido», «buen camino»…)',
    !/margen|sólido|buen camino|excelente/i.test(out), (out.match(/margen|sólido|excelente/i) || []).join(''));
}

// ════════════════════════════════════════════════════════════════════════════
section('2 · El anillo mide, no ilustra (§11/§44):');
// ════════════════════════════════════════════════════════════════════════════
{
  const r = R('calculateMonthlyBudget({ salary: 2500, housing: 700, food: 350, transport: 120, utilities: 110, leisure: 150, education: 50, otherexp: 100 })');
  C.__r = r;
  const h = R('_wsBudgetDonutHtml(__r)');
  const arcs = (h.match(/class="wsbud-arc"/g) || []).length;
  ok('2.1 hay exactamente un arco por categoría con gasto', arcs === 7, arcs + ' arcos');
  // Los arcos tienen que SUMAR la circunferencia: si no, el anillo miente sobre el reparto.
  const lens = (h.match(/stroke-dasharray="([0-9.]+) /g) || []).map(x => parseFloat(x.replace(/[^0-9.]/g, '')));
  const total = lens.reduce((a, b) => a + b, 0);
  const circ = R('_WSBUD_DONUT_C');
  ok('2.2 los arcos suman la circunferencia completa (el reparto cierra al 100 %)',
    Math.abs(total - circ) < 0.05, total.toFixed(3) + ' vs ' + circ.toFixed(3));
  // …y cada arco es proporcional a SU cifra, no a un reparto inventado.
  const first = lens[0], expectFirst = (700 / 1580) * circ;
  ok('2.3 cada arco es proporcional a la cifra de su categoría',
    Math.abs(first - expectFirst) < 0.05, first.toFixed(3) + ' vs ' + expectFirst.toFixed(3));
  ok('2.4 usa los colores que YA declara el motor, sin paleta nueva',
    h.indexOf('#4D8DFF') >= 0 && h.indexOf('#37c7b8') >= 0);
  // El centro NO repite un KPI del resumen: publica la mayor partida, que el anillo no sabe decir.
  ok('2.5 el centro publica la MAYOR PARTIDA y su peso, no un KPI repetido',
    /Vivienda/.test(h) && /<b>44%<\/b>/.test(h) && !/920/.test(h), h.slice(h.indexOf('wsbud-donut-c'), h.indexOf('wsbud-donut-c') + 160));
  ok('2.6 y se anuncia en palabras para quien no ve el anillo (§38)',
    /role="img" aria-label="[^"]*44% Vivienda/.test(h) || /role="img" aria-label="[^"]*% /.test(h));
  // §44 — sin gastos NO se dibuja nada: ni anillo vacío, ni porción gris.
  C.__z = R('calculateMonthlyBudget({ salary: 2000 })');
  ok('2.7 sin gastos no se pinta anillo (ni un cero medido)', R('_wsBudgetDonutHtml(__z)') === '');
  C.__n = R('calculateMonthlyBudget({})');
  ok('2.8 sin datos de ninguna clase tampoco', R('_wsBudgetDonutHtml(__n)') === '');
  // El anillo no fabrica puntos ni interpola: es un filtro sobre las cifras del motor.
  const dn = fnSrc('_wsBudgetDonutHtml');
  ok('2.9 el anillo no inventa ni redondea a un mínimo visible',
    !/Math\.max\([^)]*0\.0[1-9]/.test(dn) && !/minSlice|MIN_ARC/.test(dn));
}

// ════════════════════════════════════════════════════════════════════════════
section('3 · UN solo camino de cálculo (§26: reordenar la caja, no duplicar el motor):');
// ════════════════════════════════════════════════════════════════════════════
{
  const render = fnSrc('_renderBudgetTool');
  ok('3.1 los dos contenedores de repintado siguen siendo los mismos dos',
    /data-wsbud-top/.test(render) && /data-wstool-out/.test(render));
  ok('3.2 el cuerpo declara sus dos columnas', /wsbud-col-edit/.test(render) && /wsbud-col-view/.test(render));
  ok('3.3 el resumen vive FUERA del cuerpo, así que se ve sin scroll en cualquier ancho',
    render.indexOf('wsbud-top-card') < render.indexOf('wsbud-body'));
  ok('3.4 la edición se declara antes que la vista en el DOM (y el orden lo decide el CSS)',
    render.indexOf('wsbud-col-edit') < render.indexOf('wsbud-col-view'));
  // Ni el pintor del resumen ni el de la salida recalculan por su cuenta: los dos llaman al motor.
  const top = fnSrc('_wsBudgetTopHtml'), out = fnSrc('_wsBudgetOutHtml');
  ok('3.5 resumen y salida llaman al MISMO motor, sin aritmética propia',
    /calculateMonthlyBudget\(/.test(top) && /calculateMonthlyBudget\(/.test(out) &&
    !/\bincome\s*=\s*[^;]*\+/.test(top) && !/\bexpenses\s*=\s*[^;]*\+/.test(out));
  ok('3.6 el anillo recibe el resultado ya calculado, no los inputs',
    /_wsBudgetDonutHtml\(res\)/.test(out));
}

// ════════════════════════════════════════════════════════════════════════════
section('4 · §27 — las cuatro magnitudes se distinguen sin leer:');
// ════════════════════════════════════════════════════════════════════════════
{
  const top = fnSrc('_wsBudgetTopHtml');
  ok('4.1 cada KPI declara su identidad como clase, no como color en el HTML',
    /is-in/.test(top) && /is-out/.test(top) && /is-free/.test(top) && !/style="[^"]*color:/.test(top));
  const bloc = css.slice(css.indexOf('.wsbud-kpi { position'), css.indexOf('.wsbud-kpi { position') + 900);
  ok('4.2 …y cada identidad tiene tono propio en la hoja',
    /\.wsbud-kpi\.is-in::before\s*\{[^}]*background:/.test(bloc) &&
    /\.wsbud-kpi\.is-out::before\s*\{[^}]*background:/.test(bloc) &&
    /\.wsbud-kpi\.is-free::before\s*\{[^}]*background:/.test(bloc));
  ok('4.3 los tres tonos son distintos (si fueran iguales no habría identidad)',
    new Set((bloc.match(/rgba\([0-9, .]+\)/g) || [])).size >= 3);
}

// ════════════════════════════════════════════════════════════════════════════
section('5 · §2/§7 — profundidad y densidad, sin inventar tonos:');
// ════════════════════════════════════════════════════════════════════════════
{
  const bl = css.slice(css.indexOf('.wsbud-body'), css.indexOf('.wsbud-body') + 3000);
  ok('5.1 la visualización se HUNDE respecto a la edición (escalera de elevación, no plano)',
    /\.wsbud-out-card\s*\{[^}]*background:\s*var\(--elev-0/.test(bl));
  ok('5.2 sin alfa BLANCA en las superficies nuevas (se leería como gris y rompe la escalera)',
    !/background:\s*rgba\(255,\s*255,\s*255/.test(bl));
  ok('5.3 §7 la cifra grande baja de 46 px', /\.wsbud-result \.wstool-res-final \{ font-size: 34px/.test(css));
  ok('5.4 las dos pistas pueden encoger (`minmax(0,…)`, no `1fr`)',
    /grid-template-columns: minmax\(0, 1\.05fr\) minmax\(0, 0\.95fr\)/.test(bl));
  ok('5.5 y sus columnas declaran `min-width: 0`, que es la otra mitad de la condición',
    (bl.match(/\.wsbud-col-(edit|view) \{[^}]*min-width: 0/g) || []).length === 2);
  ok('5.6 LOS DOS hijos declaran `order` (si sólo lo hiciera uno, el otro se pinta antes)',
    /\.wsbud-col-edit \{ order: 1/.test(bl) && /\.wsbud-col-view \{ order: 2/.test(bl));
  ok('5.7 la animación del anillo respeta prefers-reduced-motion (§12/§38)',
    /prefers-reduced-motion: reduce\)\s*\{\s*\.wsbud-arc\s*\{\s*transition: none/.test(css));
  ok('5.8 el anillo es SVG/CSS: ninguna librería nueva (§39)',
    !/from ['"]chart|d3|recharts|plotly/i.test(app.slice(app.indexOf('_wsBudgetDonutHtml') - 400, app.indexOf('_wsBudgetDonutHtml') + 2000)));
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
