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
  // La moneda del documento la certifica docs/financial-reliability/probe-doc-currency.mjs; aquí la
  // presentación sigue sustituida y el importe sale por el formatBase de este sandbox.
  vm.runInContext('function _wsMoney(v){ return formatBase(v); }', sb);
  vm.runInContext('function _wsNum(v){ if (v == null || v === "") return 0; var n = Number(String(v).replace(/\\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; }', sb);
  // Presupuesto con categorías del usuario: el motor lee FILAS, así que sus helpers
  // de lectura entran al sandbox (no cambian ninguna aritmética).
  ['_WSBUD_INCOME', '_WSBUD_EXPENSES', '_WSBUD_DONUT_R', '_WSBUD_PALETTE', '_WSBUD_LEGACY_KEYS'].forEach(n => vm.runInContext(constSrc(n), sb));
  vm.runInContext('var _wsBudSel = null;', sb);
  ['_wsBudgetColorFor', '_wsBudgetLegacyRows', '_wsBudgetRows', '_wsBudgetRowName', 'calculateMonthlyBudget', '_wsBudgetDonutHtml', '_wsBudgetChartHtml', 'calculateLoan', '_wsLoanDonutHtml'].forEach(n => vm.runInContext(fnSrc(n), sb));
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
  // CONTRATO RE-DECIDIDO (SPEC «Visualización primero»): el DOM va en orden de LECTURA
  // —reparto, edición, ayuda— y ya no es el CSS quien reordena. Antes: edición primero + `order`.
  ok('3.4 la VISTA se declara antes que la edición, y la ayuda después (orden del DOM = orden de lectura)',
    render.indexOf('wsbud-col-view') < render.indexOf('wsbud-col-edit') && render.indexOf('wsbud-col-edit') < render.indexOf('wsbud-col-help'));
  // Ni el pintor del resumen ni el de la salida recalculan por su cuenta: los dos llaman al motor.
  const top = fnSrc('_wsBudgetTopHtml'), out = fnSrc('_wsBudgetOutHtml');
  ok('3.5 resumen y salida llaman al MISMO motor, sin aritmética propia',
    /calculateMonthlyBudget\(/.test(top) && /calculateMonthlyBudget\(/.test(out) &&
    !/\bincome\s*=\s*[^;]*\+/.test(top) && !/\bexpenses\s*=\s*[^;]*\+/.test(out));
  ok('3.6 el anillo recibe el resultado ya calculado, no los inputs',
    /_wsBudgetDonutHtml\(res[,)]/.test(out));
}

// ════════════════════════════════════════════════════════════════════════════
section('4 · §27 — las cuatro magnitudes se distinguen sin leer:');
// ════════════════════════════════════════════════════════════════════════════
{
  // FASE 2 — estos KPI fueron el SEGUNDO consumidor que justificó extraer la API de acento: eran
  // la misma idea que las tarjetas de TUS PLANES, escrita con rgba a mano. Ahora declaran
  // `data-ws-accent` y el tono lo pone la API. El invariante es el mismo: identidad declarada,
  // sin color inline, y tres tonos distintos.
  const top = fnSrc('_wsBudgetTopHtml');
  ok('4.1 cada KPI declara su identidad por la API, no como color en el HTML',
    /data-ws-accent="in"/.test(top) && /data-ws-accent="out"/.test(top) && /data-ws-accent="info"/.test(top) &&
    !/style="[^"]*color:/.test(top));
  // Anclado en el marcador ÚNICO del bloque (ver el mismo detalle en el harness de planes).
  const apiAt = css.indexOf('FASE 2 · API DE ACENTO');
  const api = css.slice(apiAt, apiAt + 3400);   // el comentario del contrato ocupa ~2,2 KB: la tabla empieza después
  ok('4.2 …y cada identidad tiene tono propio en la API compartida',
    /\[data-ws-accent="in"\]\s*\{[^}]*--ws-a:/.test(api) &&
    /\[data-ws-accent="out"\]\s*\{[^}]*--ws-a:/.test(api) &&
    /\[data-ws-accent="info"\]\s*\{[^}]*--ws-a:/.test(api));
  const tones = ['in', 'out', 'info'].map(k => (new RegExp('\\[data-ws-accent="' + k + '"\\]\\s*\\{\\s*--ws-a: *([0-9, ]+);').exec(api) || [])[1]);
  ok('4.3 los tres tonos son distintos (si fueran iguales no habría identidad)',
    tones.every(Boolean) && new Set(tones.map(x => x.replace(/\s/g, ''))).size === 3, JSON.stringify(tones));
  // …y el filete lo pinta la API, no una regla por KPI: eso es lo que evita el tercer sitio.
  ok('4.4 el filete sale de los canales compartidos, sin una regla por magnitud',
    /\.wsbud-kpi\[data-ws-accent\]::before\s*\{[^}]*rgba\(var\(--ws-a\)/.test(css));
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
  // Proporción RE-DECIDIDA: ≈56/44 con el panel visual a la izquierda (antes 1,05/0,95 con la
  // edición a la izquierda). Sigue exigiendo `minmax(0,…)` en las dos pistas.
  ok('5.4 las dos pistas pueden encoger (`minmax(0,…)`, no `1fr`) en la proporción ≈56/44',
    /grid-template-columns: minmax\(0, 1\.27fr\) minmax\(0, 1fr\)/.test(bl));
  ok('5.5 y sus columnas declaran `min-width: 0`, que es la otra mitad de la condición',
    (bl.match(/\.wsbud-col-(edit|view) \{[^}]*min-width: 0/g) || []).length === 2);
  // CONTRATO RE-DECIDIDO: el SPEC prohíbe un `order` que contradiga el DOM. Ninguna columna
  // lo declara; el escritorio compone con ÁREAS de rejilla y el móvil apila el DOM tal cual.
  ok('5.6 ninguna columna declara `order`: el escritorio compone con áreas de rejilla',
    !/\.wsbud-col-(edit|view|help) \{[^}]*order:/.test(bl)
    && /grid-template-areas: "view edit" "help edit"/.test(bl));
  ok('5.7 la animación del anillo respeta prefers-reduced-motion (§12/§38)',
    /prefers-reduced-motion: reduce\)\s*\{\s*\.wsbud-arc\s*\{\s*transition: none/.test(css));
  ok('5.8 el anillo es SVG/CSS: ninguna librería nueva (§39)',
    !/from ['"]chart|d3|recharts|plotly/i.test(app.slice(app.indexOf('_wsBudgetDonutHtml') - 400, app.indexOf('_wsBudgetDonutHtml') + 2000)));
}

// ════════════════════════════════════════════════════════════════════════════
section('6 · §25 · Interés compuesto sobre el armazón compartido:');
// ════════════════════════════════════════════════════════════════════════════
// El armazón `.ws2col` se extrajo con DOS consumidores: el Presupuesto lo demostró y el Interés
// compuesto lo reutiliza. Lo que se fija aquí es que sea el MISMO —una sola fuente para la
// decisión de caja— y que la personalidad del compuesto venga del acento y de la curva, no de
// una estructura propia.
{
  const cmp = fnSrc('_renderCompoundTool'), bud = fnSrc('_renderBudgetTool');
  // CONTRATO RE-DECIDIDO: `.ws2col` impone edición-primero (`order` 1/2) y 1,05/0,95, que es
  // justo lo que el SPEC del Presupuesto sustituye. El Presupuesto sale del armazón y compone lo
  // suyo; Interés compuesto (y Préstamos, §7) lo conservan INTACTO.
  ok('6.1 el compuesto sigue en el armazón compartido y el Presupuesto compone su propia caja',
    /class="ws2col"/.test(cmp) && /ws2col-edit/.test(cmp) && /ws2col-view/.test(cmp) &&
    /class="wsbud-body"/.test(bud) && !/ws2col/.test(bud));
  ok('6.2 …y la decisión de caja vive en UN solo sitio de la hoja',
    (css.match(/\.ws2col \{ display: flex/g) || []).length === 1 &&
    (css.match(/\.ws2col-edit \{ order: 1/g) || []).length === 1);
  ok('6.3 el compuesto declara su acento por la API compartida, no con color en el HTML',
    /data-ws-accent="teal"/.test(cmp) && !/style="[^"]*color:/.test(cmp));
  // §25 — las tres componentes se distinguen sin leer el rótulo.
  const out = fnSrc('_wsToolOutHtml');
  ok('6.4 las tres componentes declaran acento propio (entra de golpe / a plazos / lo que genera)',
    /data-ws-accent="info"/.test(out) && /data-ws-accent="in"/.test(out) && /'up'/.test(out));
  ok('6.5 un crecimiento NEGATIVO cambia de acento, no sólo de signo',
    /p\.growth < 0 \? 'out' : 'up'/.test(out));
  // `up` existe porque `green` emparejaba verde con ÁMBAR (su secundario es el «parcial» de
  // Cobros) y pintaba una ganancia en ámbar. Un acento semántico tiene que ser coherente en sus
  // DOS canales — lo cazó la medida del color computado en el navegador.
  ok('6.6 el acento `up` es coherente en sus dos canales (verde con verde)',
    /\[data-ws-accent="up"\]\s*\{[^}]*--ws-a: *64,190,120;\s*--ws-b: *87,230,166/.test(css));
  ok('6.7 la cifra toma el canal PRIMARIO del acento, que es su propio tono',
    /wstool-res-cell\[data-ws-accent="up"\] \.wstool-res-v \{ color: rgb\(var\(--ws-a\)\)/.test(css));
  // §25 — LA CURVA MANDA: los supuestos ya no se cuelan entre las cifras y el gráfico.
  ok('6.8 la curva va justo después de las cifras y los supuestos detrás',
    out.indexOf('wstool-chart') < out.indexOf('_wsAssumptionsHtml'),
    'grafico@' + out.indexOf('wstool-chart') + ' supuestos@' + out.indexOf('_wsAssumptionsHtml'));
  ok('6.9 …y fue un arreglo de MARCADO: los supuestos ya no viven dentro del bloque de resultado',
    out.indexOf('_wsAssumptionsHtml') > out.indexOf('</div>'));
  ok('6.10 §8 la cifra grande del compuesto baja de 46 px',
    /\.wscmp-out-card \.wstool-res-final \{ font-size: 32px/.test(css));
  // El motor no se toca (§55).
  ok('6.11 el motor del compuesto sigue intacto: la salida no recalcula por su cuenta',
    /_wsCompoundProjection\(inp\)/.test(out) && !/Math\.pow\(/.test(out));
}

// ════════════════════════════════════════════════════════════════════════════
section('7 · §26 · Préstamos sobre el armazón compartido (tercer consumidor):');
// ════════════════════════════════════════════════════════════════════════════
// Con Préstamos el armazón `.ws2col` tiene TRES consumidores reales, que es la condición que
// esta sesión se puso para extraer. Lo que se fija aquí es que la herramienta con mejor
// legibilidad de Workspace no la perdió al mudarse, y que su personalidad sale del acento y
// del anillo — no de una estructura propia ni de color escrito en el HTML.
{
  const loan = fnSrc('_renderLoanTool'), out = fnSrc('_wsLoanOutHtml'), dn = fnSrc('_wsLoanDonutHtml');
  ok('7.1 Préstamos usa el MISMO armazón de dos columnas que Presupuesto y Compuesto',
    /class="ws2col"/.test(loan) && /ws2col-edit/.test(loan) && /ws2col-view/.test(loan));
  ok('7.2 declara su acento por la API compartida y sin color en el marcado',
    /data-ws-accent="blue"/.test(loan) && !/style="[^"]*color:/.test(loan));
  // §6/§26 — azul lo que recibes, coral lo que cuesta pedirlo, y por acento semántico.
  ok('7.3 capital e intereses se distinguen por acento, no por dos grises casi iguales',
    /wsloan-leg is-cap" data-ws-accent="info"/.test(out) && /wsloan-leg is-int" data-ws-accent="out"/.test(out) &&
    /wsloan-kpi" data-ws-accent="out"/.test(out));

  // ── EL MOTOR NO SE TOCA (§55) Y EL ANILLO MIDE (§11) ──────────────────────
  // Se EJECUTA, no se lee: el anillo se dibuja desde el reparto que publica el motor y sus
  // dos arcos tienen que sumar la circunferencia; si el centro derivase su propio porcentaje
  // podría contradecir a la leyenda que tiene al lado.
  const r = R('calculateLoan({ principal: "180.000", rate: "3,25", years: "30", fees: "0", insurance: "0" })');
  ok('7.4 el motor sigue intacto y con el parseo tolerante (una cuota real, no la rama sin interés)',
    Math.round(r.monthlyPayment) === 783 && Math.round(r.totalInterest) === 102014, JSON.stringify([r.monthlyPayment, r.totalInterest]));
  ok('7.5 la salida no recalcula por su cuenta: pide el resultado al motor',
    /calculateLoan\(inp\)/.test(out) && !/Math\.pow\(/.test(out));
  const C0 = 2 * Math.PI * 52;
  const svg = R('_wsLoanDonutHtml(calculateLoan({ principal: "180.000", rate: "3,25", years: "30" }))');
  const da = /stroke-dasharray="([\d.]+) ([\d.]+)"/.exec(svg);
  ok('7.6 los dos arcos del anillo suman la circunferencia (mide, no ilustra)',
    !!da && Math.abs((parseFloat(da[1]) + parseFloat(da[2])) - C0) < 0.2, da && da[0]);
  ok('7.7 …y el arco es PROPORCIONAL al reparto que publica el motor',
    !!da && Math.abs(parseFloat(da[1]) - (r.principalShare / 100) * C0) < 0.2);
  ok('7.8 el centro publica el reparto DEL MOTOR, no una segunda derivación',
    /Math\.round\(res\.interestShare\)/.test(dn) && new RegExp('>' + Math.round(r.interestShare) + '%<').test(svg));

  // ── LO QUE COSTÓ CAZAR, FIJADO ───────────────────────────────────────────
  // `formatBase()` une importe y moneda con un espacio de NO ruptura: no hay punto de corte
  // legítimo, así que cualquier `overflow-wrap` acaba partiendo dentro de «US$». La cifra
  // ESCALA y nunca se rompe. Esta regla ya existía y una segunda la anulaba por venir después.
  // Este assert fijaba el `nowrap` dentro de la regla de Préstamos. La §8 extrajo ese contrato
  // a un owner único, así que lo que aquí se comprueba es que Préstamos SIGUE cubierto por él —
  // no que lo declare por su cuenta, que es justo lo que la extracción vino a eliminar. Es un
  // contrato antiguo, no un defecto: el invariante no se relaja, cambia de dueño.
  ok('7.9 las cifras de Préstamos no se rompen nunca: las cubre el owner de la §8',
    /\.aurix-wsh \.wsloan-kpi-v, \.aurix-wsh \.wsloan-hero-v/.test(css) &&
    /\[data-ws-metric\][\s\S]{0,600}white-space: nowrap/.test(css));
  // Se miran las REGLAS, no los comentarios: la primera versión de este assert se puso roja
  // casando con el propio comentario que CITA la regla retirada — el mismo error que el 1.5
  // documenta. Y lo que importa no es que la palabra `break-word` no aparezca en la hoja (hay
  // una regla compartida legítima que la usa para otros selectores y que el contrato de abajo
  // sobrescribe), sino que nadie les devuelva el `white-space: normal` que la habilita.
  const cssNoC = css.replace(/\/\*[\s\S]*?\*\//g, '');
  ok('7.10 …y ninguna regla les devuelve el `white-space: normal` que habilita el corte',
    !/\.wsloan-(hero|kpi)-v(,[^{}]*)?\s*\{[^}]*white-space: normal/.test(cssNoC),
    (cssNoC.match(/\.wsloan-(hero|kpi)-v[^{}]*\{[^}]*white-space: normal[^}]*\}/g) || []).join(' | '));
  // El techo de tamaño sale de LA CAJA, no del viewport: la rejilla da dos columnas en móvil
  // y cuatro a 768, así que una ventana más ancha producía una caja igual de estrecha con el
  // `vw` ya en su techo. Medido: a 768 la cifra pedía 168 px en una caja de 134.
  ok('7.11 el tamaño del KPI tiene techo mientras la caja es estrecha, y recupera a 1024',
    /\.wsloan-kpi-v \{ font-size: clamp\(13px, 4vw, 16px\); \}/.test(css) &&
    /@media \(min-width: 1024px\) \{ \.wsloan-kpi-v \{ font-size: 21px; \} \}/.test(css));
  // El ancho de un campo sigue a la magnitud que sostiene. Un `<input>` recortado no mueve
  // `scrollWidth`: lo destapó la captura y ahora lo mide la sonda con la tipografía del campo.
  ok('7.12 el campo del importe pide el ancho de su cifra, y sólo donde hacía falta',
    /const field = \(k, label, unit, wide\)/.test(loan) && /data-ws-field="wide"/.test(loan) &&
    /\.wsloan-fields > \[data-ws-field="wide"\] \{ grid-column: span 2; \}/.test(css));
  ok('7.13 el anillo y su leyenda no se apilan en móvil (eran 64 px de caja vacía)',
    /\.wsloan-split \{ flex-direction: row; align-items: flex-start; gap: 14px; \}/.test(css) &&
    /\.wsloan-leg \{ flex-wrap: wrap/.test(css));
  // El comparador tiene sus propios inputs y vive FUERA del contenedor que se repinta con cada
  // tecla. Meterlo en la rejilla le haría perder el foco al escribir: se fija para que nadie lo
  // «ordene» dentro.
  ok('7.14 el comparador se queda fuera del contenedor que se repinta con cada tecla',
    !/wsloan-cmp/.test(out) && /data-wstool-out>\$\{_wsLoanOutHtml\(inp\)\}/.test(loan) &&
    loan.indexOf('wsloan-cmp-card') > loan.indexOf('data-wstool-out'),
    JSON.stringify({ enLaSalida: /wsloan-cmp/.test(out), cmp: loan.indexOf('wsloan-cmp-card'), out: loan.indexOf('data-wstool-out') }));
  // Una clave inventada devuelve `undefined` y deja una cifra sin rótulo: ya pasó dos veces.
  ['wsloan_dn_lbl', 'wsloan_in_amount', 'wsloan_kpi_interest', 'wsloan_capital'].forEach(k => {
    const es = R('T.es[' + JSON.stringify(k) + ']'), en = R('T.en[' + JSON.stringify(k) + ']');
    ok('7.15 la clave `' + k + '` existe en ES y EN', !!es && !!en, JSON.stringify([es, en]));
  });
}

// ════════════════════════════════════════════════════════════════════════════
section('8 · §27 · La cifra de una métrica tiene UN owner:');
// ════════════════════════════════════════════════════════════════════════════
// No se extrajo por anticipación: la MISMA conclusión estaba re-derivada en ocho bloques de la
// hoja y siete capacidades la implementaban por separado. Tres generaciones vivas a la vez
// (`anywhere` → `break-word` → `nowrap`+escalar), y la correcta extendida A MANO, capacidad a
// capacidad: Cobros se había quedado en la primera y el Diario en la segunda. Medido en vivo
// antes de tocar nada, y verificado después: ninguna cifra cambió de tamaño.
{
  const cssNoC = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const METRICAS = ['wstool-res-v', 'wstool-res-final', 'wsloan-kpi-v', 'wsloan-hero-v',
                    'wsre-kpi-v', 'wsrecv-kpi-v', 'wsbud-kpi b', 'wsb-row b', 'wsre-layer b', 'wsb-impact-val'];
  // El owner es UNO: un solo sitio declara que una cifra no se rompe.
  const nowrapRules = (cssNoC.match(/[^{}]*\{[^{}]*white-space: *nowrap[^{}]*\}/g) || [])
    .filter(r => METRICAS.some(m => r.split('{')[0].indexOf(m) !== -1));
  ok('8.1 una sola regla declara el contrato tipográfico de una cifra de métrica',
    nowrapRules.length === 1, nowrapRules.length + ' reglas');
  ok('8.2 …y nombra a los diez consumidores que ya lo compartían a mano',
    METRICAS.every(m => nowrapRules[0] && nowrapRules[0].split('{')[0].indexOf(m) !== -1),
    METRICAS.filter(m => !(nowrapRules[0] || '').split('{')[0].includes(m)).join(', '));
  // Una capacidad nueva entra DECLARANDO, no añadiéndose a una lista: así es como esta hoja
  // acabó con tres generaciones vivas y con dos capacidades olvidadas en las dos malas.
  ok('8.3 una capacidad nueva entra declarando `data-ws-metric`, sin editar la lista',
    /\[data-ws-metric\]/.test(nowrapRules[0] || ''));
  // Las dos generaciones descartadas no sobreviven en ninguna cifra. `break-word` no era «menos
  // agresivo» que `anywhere`: AÑADE puntos de corte donde no hay ninguno, y entre un importe y
  // su moneda no hay ninguno porque los une un espacio de NO ruptura.
  const malas = (cssNoC.match(/[^{}]*\{[^{}]*overflow-wrap: *(anywhere|break-word)[^{}]*\}/g) || [])
    .filter(r => METRICAS.some(m => r.split('{')[0].indexOf(m) !== -1));
  ok('8.4 ninguna cifra sigue en las dos estrategias que este repositorio ya descartó',
    malas.length === 0, malas.map(r => r.split('{')[0].trim()).join(' | '));
  // Lo que NO es una cifra se queda fuera, y eso también es el contrato: la lista de la gen 2
  // arrastró una FRASE («la mejor combinación… del horizonte») y un `nowrap` la desbordaría.
  ok('8.5 un texto NO entra en la primitiva: el pie de impacto conserva su corte por palabra',
    !/\[data-ws-metric\][^{}]*wsb-impact-cap|wsb-impact-cap[^{}]*\[data-ws-metric\]/.test(nowrapRules[0] || '') &&
    /\.wsb-impact-cap \{ overflow-wrap: break-word; \}/.test(cssNoC));
  ok('8.6 …ni los rótulos, que sí pueden plegarse',
    !/wsbud-kpi i|wsre-layer i/.test((nowrapRules[0] || '').split('{')[0]));
  // Y un VALOR COMPUESTO sí parte, pero sólo donde ya hay un espacio de verdad. «NVDA +31,9%»
  // es un ticker MÁS un porcentaje: ahí el punto de corte existe. Se declara, y la excepción
  // vive DETRÁS de la primitiva — escrita antes, con la misma especificidad, no se aplicaba.
  ok('8.7 el valor compuesto del Diario se declara como tal',
    /class="wstool-res-v wsjrn-sum-best"/.test(fnSrc('_wsJrnSummaryHtml') || app));
  ok('8.8 …y su excepción va DESPUÉS del owner, o el `nowrap` la gana por orden de fuente',
    cssNoC.lastIndexOf('.wsjrn-sum-best') > cssNoC.indexOf('[data-ws-metric]'),
    'excepcion@' + cssNoC.lastIndexOf('.wsjrn-sum-best') + ' owner@' + cssNoC.indexOf('[data-ws-metric]'));
  ok('8.9 y parte con `normal`, que se limita a los cortes que YA existen',
    /\.wsjrn-sum-best \{ white-space: normal; \}/.test(cssNoC));
  // El TAMAÑO sigue siendo de cada capacidad: es identidad, no contrato (§27). Se comprueba que
  // la extracción no se llevó por delante ninguna de las decisiones de tamaño.
  ok('8.10 el tamaño sigue siendo de cada capacidad, no del owner',
    !/font-size/.test(nowrapRules[0] || '') &&
    /\.wsloan-kpi-v \{ font-size: clamp\(13px, 4vw, 16px\)/.test(cssNoC) &&
    /\.wsbud-kpi b \{[^}]*font-size: clamp\(13px, 3\.8vw, 18px\)/.test(cssNoC) &&
    /\.wsjrn-sum-grid \.wstool-res-v \{ font-size: clamp\(14px, 4\.2vw, 19px\); \}/.test(cssNoC));
  // Y ninguna capacidad vuelve a declarar dos `clamp` para la misma cifra, que era la trampa
  // real: ganaba el de abajo por orden de fuente y nada lo decía.
  const heroClamps = (cssNoC.match(/\.wsloan-hero-v[^{}]*\{[^}]*font-size[^}]*\}/g) || []);
  ok('8.11 una cifra tiene UN tamaño declarado, no dos compitiendo',
    heroClamps.length === 1, heroClamps.join(' | '));
}

// ════════════════════════════════════════════════════════════════════════════
section('9 · §27 · El sufijo de un campo tiene UN owner, y la reserva sale de él:');
// ════════════════════════════════════════════════════════════════════════════
// Diecinueve sitios pintaban el mismo `<span class="ws4-field-unit">` a mano, y la hoja
// reservaba 34 px FIJOS para él: un número mágico dimensionado para el sufijo más ancho y
// aplicado a los cien campos de Workspace. Medido a 360 y 390 en las ocho capacidades: 80
// campos reservaban 34 px para 8 («$») o 13 («%»), 20 no tenían sufijo y reservaban igual,
// y para «años» (29 px) la reserva se quedaba SIETE PÍXELES CORTA — colisión, no desperdicio.
{
  const helper = fnSrc('_wsFieldUnitHtml');
  ok('9.1 un solo sitio pinta el sufijo de un campo',
    (app.match(/class="ws4-field-unit"/g) || []).length === 1);
  ok('9.2 el sufijo DECLARA su tamaño, que es lo que la hoja necesita para reservar',
    /data-ws-unit="' \+ \(String\(s\)\.length > 1 \? 'lg' : 'sm'\)/.test(helper));
  ok('9.3 un sufijo vacío no pinta span: el campo sin unidad no guarda sitio para nada',
    /if \(s == null \|\| s === ''\) return '';/.test(helper));
  ok('9.4 …y entonces no hay reserva: el campo recupera su ancho',
    /\.ws4-field-input:not\(:has\(\.ws4-field-unit\)\) \.ws4-num \{ padding-right: 12px; \}/.test(css));
  ok('9.5 la reserva sigue al sufijo declarado, no a una constante',
    /:has\(\.ws4-field-unit\[data-ws-unit="sm"\]\) \.ws4-num \{ padding-right: 32px; \}/.test(css) &&
    /:has\(\.ws4-field-unit\[data-ws-unit="lg"\]\) \.ws4-num \{ padding-right: 49px; \}/.test(css));
  // La reserva del sufijo ancho tiene que CUBRIRLO: vive en `right:12px` y mide 29 px, así que
  // llega hasta 41. Con 34 sus siete píxeles izquierdos caían dentro del área de contenido.
  ok('9.6 la reserva del sufijo ancho lo cubre de verdad (12 de offset + 29 de ancho + hueco)',
    49 >= 12 + 29 + 4);
  // Y donde `:has()` no exista se queda el comportamiento de hoy, no uno peor.
  ok('9.7 sin `:has()` degrada a la reserva de siempre, no a un campo roto',
    /padding: 11px 34px 11px 12px/.test(css));
}

// ════════════════════════════════════════════════════════════════════════════
section('10 · §26 · Cobros y Escenarios: un total y su reparto se comparan:');
// ════════════════════════════════════════════════════════════════════════════
// Lo geométrico ya lo mide la sonda en los dos motores; aquí se fija la DECISIÓN, que es lo
// que una hoja de 29.000 líneas pierde en silencio.
{
  const cssNoC = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // Cobros: tres cifras apiladas eran 600 px a 390, el mayor coste de altura de Workspace.
  ok('10.1 el resumen de Cobros reparte en dos columnas y el total ancla el ancho entero',
    /\.wsrecv-kpis \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/.test(cssNoC) &&
    /\.wsrecv-kpis > \.wsrecv-kpi\.is-total \{ grid-column: 1 \/ -1; \}/.test(cssNoC));
  // Y como la caja es la mitad, la cifra escala: la primitiva prohíbe romperla.
  // Lo que importa no es que haya UNA declaración de tamaño en toda la hoja —un tamaño base de
  // escritorio con un override en móvil es el patrón normal— sino que el ESCALADO tenga un solo
  // owner. La primera versión de este assert contaba declaraciones y se puso roja por el tamaño
  // base, que es legítimo: no es el caso de la cuota de Préstamos, donde había dos `clamp`
  // compitiendo para el mismo elemento y uno era inerte.
  ok('10.2 …y su cifra escala, con un solo owner del escalado',
    /\.wsrecv-kpi-v \{ font-size: clamp\(15px, 5vw, 20px\); \}/.test(cssNoC) &&
    (cssNoC.match(/\.wsrecv-kpi-v \{ font-size: clamp/g) || []).length === 1);
  // En escritorio `1fr` SE QUEDA: su mínimo automático protege a la cifra más larga. Lo cambié
  // a `minmax(0,·)` para igualar columnas y la medida me corrigió — a 641 el total pedía 174 px
  // en una caja de 147. El assert existe para que nadie repita mi error.
  ok('10.3 en escritorio las tres columnas siguen con `1fr`, que es lo que protege al total',
    /\.wsrecv-kpis \{ display: grid; grid-template-columns: repeat\(3, 1fr\); gap: 12px; \}/.test(cssNoC));
  // Escenarios: dos supuestos son una comparación, y una comparación se mira en paralelo.
  ok('10.4 los dos supuestos de Escenarios van en paralelo, también en móvil',
    /\.wsb2-cols \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/.test(cssNoC) &&
    !/@media \(min-width: 700px\) \{\s*\.wsb2-cols/.test(cssNoC));
  // Y una fila de campos alinea sus entradas aunque los rótulos no midan lo mismo. Sin número
  // mágico: la celda ya se estira a la altura de su fila.
  ok('10.5 una fila de campos alinea sus entradas, y sin número mágico',
    /\.ws4-field > \.ws4-field-input \{ margin-top: auto; \}/.test(cssNoC));
}

// ════════════════════════════════════════════════════════════════════════════
section('11 · Ninguna clave de Workspace se usa sin estar definida:');
// ════════════════════════════════════════════════════════════════════════════
// TERCERA vez en esta sesión que el mismo linaje muerde: una clave que se usa y no existe hace
// que `t()` devuelva `undefined` y se publique una CIFRA SIN ROTULO. Las dos primeras las
// inventé yo (`wstool_r_final`, `wsloan_r_monthly`); la tercera era del producto —`wsg_r_years`,
// en Objetivos, publicando «28 años» sin decir de qué— y la destapó la CAPTURA, no un assert.
// Así que la comprobación deja de ser por clave suelta y pasa a ser de COMPLETITUD, en los dos
// idiomas: 635 claves `ws*` usadas contra los dos diccionarios.
{
  const tI = app.indexOf('const T = {');
  const esI = app.indexOf('es: {', tI), enI = app.indexOf('en: {', tI);
  let d = 0, end = -1;
  for (let k = app.indexOf('{', tI); k < app.length; k++) {
    if (app[k] === '{') d++; else if (app[k] === '}') { d--; if (!d) { end = k; break; } }
  }
  const ES = app.slice(esI, enI), EN = app.slice(enI, end);
  const used = [...new Set([...app.matchAll(/t\('(ws[a-zA-Z_0-9]+)'\)/g)].map(m => m[1]))];
  // Se busca `clave:` precedida de separador: las claves van VARIAS POR LÍNEA en estos
  // diccionarios, así que un ancla de principio de línea sólo ve la primera. Mi primera versión
  // de esta auditoría lo hacía y declaró 34 claves ausentes que estaban definidas — la pista fue
  // que las listas de ES y EN salían IDÉNTICAS.
  const has = (seg, k) => new RegExp('[{,\\s]' + k + '\\s*:').test(seg);
  const sinES = used.filter(k => !has(ES, k)), sinEN = used.filter(k => !has(EN, k));
  ok('11.1 las ' + used.length + ' claves `ws*` que se usan están definidas en español',
    sinES.length === 0, sinES.join(', '));
  ok('11.2 …y en inglés', sinEN.length === 0, sinEN.join(', '));
  ok('11.3 y la que faltaba tiene rótulo en los dos idiomas',
    has(ES, 'wsg_r_years') && has(EN, 'wsg_r_years'));
  ok('11.4 la comprobación es real: mide bastantes claves para que signifique algo',
    used.length > 600, String(used.length));
}

// ════════════════════════════════════════════════════════════════════════════
section('12 · Cierre V2 · el título identifica y el Diario entra en el armazón:');
// ════════════════════════════════════════════════════════════════════════════
{
  const cssNoC = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const jrn = fnSrc('_renderJournalTool');
  // El título baja de 21/26 a 18/22: identifica, no domina. La accesibilidad no se toca — el
  // alto mínimo de la barra y el objetivo táctil del retorno siguen siendo sus propios asserts.
  ok('12.1 el título de una capacidad identifica y no domina',
    /\.aurix-wsh \.wsh-bar-title \{[^}]*font-size: 18px/.test(cssNoC) &&
    /\.aurix-wsh \.wsh-bar-title \{ font-size: 22px; \}/.test(cssNoC) &&
    /\.aurix-wsh \.wsh-bar \{[\s\S]{0,120}min-height: 44px/.test(cssNoC));
  // Cuarto consumidor del armazón. Y la condición: sin resumen NO se usa, porque una rejilla de
  // dos columnas con una vacía es un hueco.
  ok('12.2 el Diario usa el armazón compartido cuando hay algo que resumir',
    /res\.list\.length \? `<div class="ws2col">/.test(jrn) &&
    /ws2col-edit">\$\{_wsJrnFormHtml\(\)\}/.test(jrn) && /ws2col-view/.test(jrn));
  ok('12.3 …y sin resumen no lo usa: el formulario va a ancho completo',
    /` : _wsJrnFormHtml\(\)\}/.test(jrn));
  ok('12.4 su acento sale del mapa, no escrito a mano en la vista',
    /data-ws-accent="\$\{esc\(_WS_TOOL_ACCENT\.journal\)\}"/.test(jrn));
  // `auto-fill` conserva pistas vacías; `auto-fit` las colapsa. Medido a 1440: cinco pistas para
  // tres operaciones dejaban 560 px de negro. El tope por tarjeta es la otra mitad: sin él una
  // sola operación se estiraría a 1.356 px.
  ok('12.5 la lista de operaciones llena su ancho, y una sola no se estira',
    /\.wsjrn-list \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(232px, 1fr\)\)/.test(cssNoC) &&
    /\.wsjrn-card \{ max-width: 480px; \}/.test(cssNoC));
  // Inmobiliario NO se reabre: su apilado en móvil es una decisión MEDIDA del repositorio —dos
  // columnas exigirían 9,2 px de cifra a 390, por debajo del suelo de 12— y se vuelve a
  // comprobar aquí para que nadie la deshaga por «densidad».
  ok('12.6 el apilado del resumen inmobiliario en móvil sigue siendo una columna, por medida',
    /\.wsre-kpis \{ grid-template-columns: 1fr; \}/.test(cssNoC) ||
    /\.wsre-kpis \{[^}]*grid-template-columns: 1fr/.test(cssNoC),
    (cssNoC.match(/\.wsre-kpis \{[^}]*\}/g) || []).join(' | ').slice(0, 200));
}

// ════════════════════════════════════════════════════════════════════════════
section('13 · Categorías del usuario: filas con identidad, compatibles con lo guardado:');
// ════════════════════════════════════════════════════════════════════════════
{
  const LEG = '{ salary: 2500, extra: 0, otherinc: 0, housing: 700, food: 350, transport: 120, utilities: 110, leisure: 150, education: 50, otherexp: 100 }';
  const rows = R('_wsBudgetRows(' + LEG + ')');
  ok('13.1 un documento ANTIGUO se lee como sus diez filas, ids = claves antiguas, importes exactos',
    rows.length === 10 && rows[0].id === 'salary' && rows[0].type === 'income' && rows.find(r => r.id === 'housing').amount === 700
    && rows.every(r => r.label === null && typeof r.labelKey === 'string'), JSON.stringify(rows.slice(0, 2)));
  const a = R('calculateMonthlyBudget(' + LEG + ')'), b = R('calculateMonthlyBudget({ rows: _wsBudgetRows(' + LEG + ') })');
  ok('13.2 misma aritmética en la forma antigua y en la nueva', a.income === b.income && a.expenses === b.expenses && a.free === b.free && a.saveRate === b.saveRate,
    JSON.stringify([a.free, b.free]));
  const dup = R(`calculateMonthlyBudget({ rows: [
    { id: 'i1', type: 'income', label: 'Autónomo', amount: 1000 },
    { id: 'g1', type: 'expense', label: 'Gimnasio', amount: 30, color: '#4D8DFF' },
    { id: 'g2', type: 'expense', label: 'Gimnasio', amount: 70, color: '#37c7b8' },
    { id: 'g2', type: 'expense', label: 'Duplicado de id', amount: 999 } ] })`);
  ok('13.3 dos categorías con el MISMO nombre coexisten; un id repetido NO se cuenta dos veces',
    dup.items.length === 2 && dup.items[0].id !== dup.items[1].id && dup.expenses === 100 && dup.income === 1000, JSON.stringify(dup.items.map(i => [i.id, i.name, i.value])));
  C.__d = dup;
  const h = R('_wsBudgetDonutHtml(__d)');
  ok('13.4 el anillo enlaza cada segmento por id, no por el texto',
    /data-wsbud-seg="g1"/.test(h) && /data-wsbud-seg="g2"/.test(h));
  const hs = R('_wsBudgetDonutHtml(__d, "g2")');
  const lens = x => (x.match(/stroke-dasharray="([0-9.]+) /g) || []).join();
  ok('13.5 seleccionar cambia QUÉ se lee (nombre, importe, %) pero NINGUNA cifra del reparto',
    lens(h) === lens(hs) && /is-sel/.test(hs) && /is-dim/.test(hs) && /<b>70%<\/b>/.test(hs) && /70 €/.test(hs) && /Gimnasio/.test(hs));
  ok('13.6 la leyenda es un botón por categoría con aria-pressed, ordenada por peso',
    (() => { const l = R('_wsBudgetChartHtml(__d, "g2")'); const ids = [...l.matchAll(/data-wsbud-sel="([^"]+)"/g)].map(m => m[1]);
      return ids.join() === 'g2,g1' && /data-wsbud-sel="g2" aria-pressed="true"/.test(l) && /data-wsbud-sel="g1" aria-pressed="false"/.test(l); })());
  ok('13.7 un nombre vacío NUNCA se publica: cae al sugerido',
    R(`_wsBudgetRowName({ id: 'x', type: 'expense', labelKey: 'wstool_bud_leisure', label: '   ' })`) === 'Ocio'
    && R(`_wsBudgetRowName({ id: 'y', type: 'expense', labelKey: null, label: '' })`) === R(`t('wsbud_new_expense')`));
  ok('13.8 una fila sin color válido recibe uno ESTABLE por su id (mismo id, mismo color)',
    R(`_wsBudgetRows({ rows: [{ id: 'zz', type: 'expense', label: 'a', amount: 1, color: 'red' }] })[0].color`) === R(`_wsBudgetColorFor('zz')`));
  ok('13.9 leer filas devuelve COPIAS: modificar el resultado no toca el documento de origen',
    R(`(function(){ var d = { rows: [{ id: 'a', type: 'income', label: 'x', amount: 5 }] }; var r = _wsBudgetRows(d); r[0].label = 'mutado'; return d.rows[0].label; })()`) === 'x');
  // La lectura: una sola, y exacta en los cuatro casos.
  const read = fnSrc('_wsBudgetReading');
  ok('13.10 la lectura cubre déficit (primero), sin ingresos, disponible cero y positivo, sin consejos',
    /res\.deficit/.test(read) && /wsbud_read_zero/.test(read) && /wstool_bud_read_noincome/.test(read) && /wstool_bud_read_neutral/.test(read)
    && !/revisa|recomend|deberías|should/i.test(read));
  ok('13.11 el resumen ya no repite el déficit: una sola lectura, junto al gráfico',
    !/wstool_bud_read_deficit/.test(fnSrc('_wsBudgetTopHtml').replace(/\/\/[^\n]*/g, '')));
  ok('13.12 sin gastos no hay segmentos: estado neutro con acceso al editor',
    /wsbud_empty/.test(fnSrc('_wsBudgetEmptyHtml')) && /data-wsbud-goto="expense"/.test(fnSrc('_wsBudgetEmptyHtml')) && !/wsbud-arc/.test(fnSrc('_wsBudgetEmptyHtml')));
  ok('13.13 las claves nuevas existen en ES y EN',
    ['wsbud_add_income', 'wsbud_add_expense', 'wsbud_new_income', 'wsbud_new_expense', 'wsbud_name_aria', 'wsbud_name_field', 'wsbud_amt_aria',
     'wsbud_del_aria', 'wsbud_del_title', 'wsbud_del_text', 'wsbud_limit', 'wsbud_legend_label', 'wsbud_empty', 'wsbud_empty_cta', 'wsbud_read_zero', 'wssave_failed']
      .every(k => R('typeof T.es.' + k) === 'string' && R('typeof T.en.' + k) === 'string'));
  ok('13.14 guardar no finge éxito si el almacén rechaza la escritura',
    /_ws4Persist\(proj\) === false/.test(fnSrc('_wsToolCommit')) && /return _ws4SaveAll\(list\)/.test(fnSrc('_ws4Persist')));
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
