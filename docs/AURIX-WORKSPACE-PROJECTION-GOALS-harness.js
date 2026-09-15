'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-WORKSPACE-PROJECTION-GOALS — SPEC WORKSPACE COMPLETION · §B-A / §B-D
// ════════════════════════════════════════════════════════════════════════════
// EL MOTOR COMPARTIDO y EL PROGRESO DE UN OBJETIVO, los dos ejecutados sobre los
// bytes de app.js.
//
// LO QUE HABÍA, y son defectos financieros REALES, no deuda estética:
//
// 1 · TRES MOTORES PARA LA MISMA MATEMÁTICA (`calculateCompoundGrowth`,
//     `projectScenario`, y el solver de `calculateGoalProgress`), con el MISMO
//     defecto de parseo de tasa que hubo que corregir tres veces, y con dos
//     convenciones distintas sin declararlas en ninguna parte. Un usuario que
//     compara una proyección de Objetivos con una de Escenarios estaba comparando
//     dos matemáticas y nada se lo decía.
//
// 2 · UNA RENTABILIDAD INVENTADA EN OBJETIVOS: `const r = 0.05 / 12`, fija, para
//     TODOS los tipos — incluido el FONDO DE EMERGENCIA, que por definición está
//     en liquidez. Efecto medible: fecha estimada optimista y aportación necesaria
//     más baja que la real, sobre un supuesto que el usuario nunca eligió.
//
// 3 · «EN CAMINO» SIN PLAZO QUE CUMPLIR: sin fecha objetivo bastaba `monthly > 0`.
//     Aportar un euro al mes declaraba el objetivo en camino de nada.
//
// 4 · Y SIN SOLUCIÓN NO SE DECÍA: el bucle acababa sin encontrar mes y el estado
//     podía seguir siendo `on-track`.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
function konstSrc(name){ const s='const '+name+' ='; const i=app.indexOf(s); if(i<0) throw new Error('missing const '+name);
  let k=i, depth=0, started=false; for(;k<app.length;k++){ const c=app[k]; if(c==='('||c==='{'||c==='[') {depth++;started=true;} else if(c===')'||c==='}'||c===']') depth--; else if(c===';'&&(!started||depth===0)) { k++; break; } }
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c,info){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(info?'  ['+info+']':''));} }
const near = (a,b,tol) => Number.isFinite(a) && Math.abs(a-b) <= (tol==null?0.01:tol);
const KONSTS = ['_WS_PROJ_CONV','_WS_PROJ_CONV_DEFAULT','_WS_PROJ_TIMING','_WS_PROJ_TIMING_DEFAULT','_WSG_ZERO_RETURN_TYPES','_WSG_TYPES',
                '_WSB_HORIZON','_WSB_RETURN','_WSB_MAX_SCENARIOS','_WSB_PARAMS_KEY','_WSH_SCENARIOS_KEY'];
const FNS = ['_wsNum','_wsNumOrNull','_wsProjMonthlyRate','_wsProject','calculateCompoundGrowth',
             'projectScenario','_wsgThisYear','_wsgAssumedRatePct','_wsgTargetAmount','calculateGoalProgress',
             '_wshReadStore','_wsbParams','_wsbParamsSet','_wsbBase','_wsbScenarios','_wsbCompare'];
function ctx(langCode) {
  const sb = { Math, Number, String, isFinite, isNaN, parseFloat, JSON, Array, Object, Date,
               console: { warn(){}, log(){} } };
  vm.createContext(sb);
  sb.lang = langCode || 'es'; sb.t = k => k; sb.baseCurrency = 'EUR';
  sb.__store = {};
  sb.localStorage = {
    getItem: k => (Object.prototype.hasOwnProperty.call(sb.__store, k) ? sb.__store[k] : null),
    setItem: (k, v) => { sb.__store[k] = String(v); },
    removeItem: k => { delete sb.__store[k]; },
  };
  sb._wsDocsQueue = () => {};
  KONSTS.forEach(n => vm.runInContext(konstSrc(n), sb));
  FNS.forEach(n => vm.runInContext(fnSrc(n), sb));
  return sb;
}
const ES = ctx('es'), EN = ctx('en');
const run = (e, c) => vm.runInContext(e, c || ES);
const P = (o, c) => run('_wsProject(' + JSON.stringify(o) + ')', c);
const G = (g, w) => run('calculateGoalProgress(' + JSON.stringify(g) + ', ' + JSON.stringify(w == null ? 0 : w) + ')');
const YEAR = run('_wsgThisYear()');

console.log('AURIX-WORKSPACE-PROJECTION-GOALS — §A motor compartido · §D objetivos\n');

// ════════════════════════════════════════════════════════════════════════════
// 1 · LA CONVENCIÓN ES EXPLÍCITA Y NO SE REINTERPRETA
// ════════════════════════════════════════════════════════════════════════════
console.log('1 · Convención declarada, y lo guardado conserva la suya:');
{
  ok('1.1 las dos convenciones se declaran por su NOMBRE, no por un booleano',
    run('_WS_PROJ_CONV.NOMINAL12') === 'nominal_annual_monthly_compounding'
    && run('_WS_PROJ_CONV.EFFECTIVE') === 'effective_annual');
  ok('1.2 la de una simulación NUEVA es la anual EFECTIVA (§A)',
    run('_WS_PROJ_CONV_DEFAULT') === run('_WS_PROJ_CONV.EFFECTIVE'));
  ok('1.3 y la aportación al FINAL del mes (§A)',
    run('_WS_PROJ_TIMING_DEFAULT') === run('_WS_PROJ_TIMING.END'));
  // LA MATEMÁTICA DE CADA CONVENCIÓN, comprobada contra su fórmula.
  ok('1.4 nominal/12 es R/12 exacto',
    near(run('_wsProjMonthlyRate(0.06, _WS_PROJ_CONV.NOMINAL12)'), 0.06 / 12, 1e-12));
  ok('1.5 efectiva es (1+R)^(1/12)−1 exacto',
    near(run('_wsProjMonthlyRate(0.06, _WS_PROJ_CONV.EFFECTIVE)'), Math.pow(1.06, 1 / 12) - 1, 1e-12));
  ok('1.6 y son DISTINTAS: por eso no se pueden intercambiar en silencio',
    run('_wsProjMonthlyRate(0.06, _WS_PROJ_CONV.NOMINAL12)')
      !== run('_wsProjMonthlyRate(0.06, _WS_PROJ_CONV.EFFECTIVE)'));
  // EL VALOR CERTIFICADO DE WORKSPACE-LAUNCH-V1, INTACTO bajo su convención.
  ok('1.7 una simulación guardada (nominal/12) sigue dando 141.922,47',
    near(P({ initial: '1000', monthly: '300', years: '20', annualRatePct: '6',
             convention: 'nominal_annual_monthly_compounding' }).final, 141922.47, 0.01),
    String(P({ initial: '1000', monthly: '300', years: '20', annualRatePct: '6',
               convention: 'nominal_annual_monthly_compounding' }).final));
  ok('1.8 y una NUEVA con la efectiva da otra cifra, que es el punto de versionarlo',
    !near(P({ initial: '1000', monthly: '300', years: '20', annualRatePct: '6' }).final, 141922.47, 1),
    String(P({ initial: '1000', monthly: '300', years: '20', annualRatePct: '6' }).final));
  ok('1.9 la convención usada VIAJA en el resultado, así que la superficie la puede decir',
    P({ initial: '1', monthly: '0', years: '1', annualRatePct: '1' }).assumptions.convention === 'effective_annual');
  // Y el consumidor de interés compuesto respeta la convención GUARDADA.
  ok('1.10 el owner de la proyección de compound cae a nominal/12 cuando el documento no la trae',
    /convention: i\.convention \|\| _WS_PROJ_CONV\.NOMINAL12/.test(fnSrc('_wsCompoundProjection')));
  ok('1.11 …y una simulación nueva nace con la efectiva declarada',
    /convention: _WS_PROJ_CONV\.EFFECTIVE/.test(fnSrc('_wsToolDefaults')));
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · LOS CUATRO COMPONENTES, SEPARADOS
// ════════════════════════════════════════════════════════════════════════════
console.log('\n2 · Capital inicial, aportaciones, crecimiento y valor final:');
{
  const r = P({ initial: '1000', monthly: '300', years: '20', annualRatePct: '6' });
  ok('2.1 los cuatro existen y suman exactamente el final',
    near(r.initial + r.contributed + r.growth, r.final, 0.01),
    JSON.stringify({ i: r.initial, c: r.contributed, g: r.growth, f: r.final }));
  ok('2.2 el capital inicial NO se mete dentro de «aportado»',
    r.initial === 1000 && r.contributed === 300 * 240,
    JSON.stringify({ initial: r.initial, contributed: r.contributed }));
  ok('2.3 tasa 0 ⇒ crecimiento exactamente 0, nada inventado',
    (() => { const z = P({ initial: '1000', monthly: '300', years: '10', annualRatePct: '0' });
      return near(z.growth, 0, 0.01) && near(z.final, 37000, 0.01); })());
  ok('2.4 horizonte 0 ⇒ el capital inicial',
    near(P({ initial: '1000', monthly: '300', years: '0', annualRatePct: '6' }).final, 1000, 0.01));
  // UNA PÉRDIDA SUPUESTA ES UNA ENTRADA VÁLIDA y no se recorta a cero: recortarla
  // ocultaría la pérdida que el propio usuario ha supuesto.
  ok('2.5 una rentabilidad supuesta NEGATIVA produce crecimiento negativo',
    (() => { const n = P({ initial: '100000', monthly: '0', years: '10', annualRatePct: '-3' });
      return n.growth < 0 && n.final < 100000 && Number.isFinite(n.final); })(),
    JSON.stringify(P({ initial: '100000', monthly: '0', years: '10', annualRatePct: '-3' }).growth));
  ok('2.6 y una pérdida total (−100 %) no produce NaN ni infinito',
    Number.isFinite(P({ initial: '1000', monthly: '0', years: '5', annualRatePct: '-100' }).final));
  ok('2.7 la serie tiene un punto por año y arranca en el capital inicial',
    (() => { const x = P({ initial: '1000', monthly: '300', years: '5', annualRatePct: '6' });
      return x.series.length === 6 && near(x.series[0].value, 1000, 0.01)
        && near(x.series[5].value, x.final, 0.01); })());
  // Aportación a principio de mes gana exactamente un periodo de interés.
  ok('2.8 principio de mes = final de mes × (1+r), exacto',
    (() => { const e = P({ initial: '0', monthly: '100', years: '3', annualRatePct: '12' });
      const b = P({ initial: '0', monthly: '100', years: '3', annualRatePct: '12',
                    contributionTiming: 'begin_of_month' });
      return near(b.final, e.final * (1 + e.assumptions.monthlyRate), 0.01); })());
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · VACÍO NO ES CERO, Y LOS SUPUESTOS NO SE OCULTAN
// ════════════════════════════════════════════════════════════════════════════
console.log('\n3 · Lo que no se ha declarado se nombra:');
{
  const u = P({ initial: '', monthly: '300', years: '20' });
  ok('3.1 los campos sin rellenar se listan en `unknowns`',
    u.unknowns.indexOf('initial') !== -1 && u.unknowns.indexOf('rate') !== -1,
    JSON.stringify(u.unknowns));
  ok('3.2 y la proyección se declara INCOMPLETA', u.complete === false);
  ok('3.3 un cero ESCRITO no es un campo ausente',
    (() => { const z = P({ initial: '0', monthly: '0', years: '5', annualRatePct: '0' });
      return z.complete === true && z.unknowns.length === 0; })(),
    JSON.stringify(P({ initial: '0', monthly: '0', years: '5', annualRatePct: '0' }).unknowns));
  const a = P({ initial: '100000', monthly: '0', years: '10', annualRatePct: '6', costPct: '1', inflationPct: '2' });
  ok('3.4 los costes declaran su BASE y el neto resultante',
    a.assumptions.costBase === 'annual_on_capital' && a.assumptions.netAnnualRatePct === 5,
    JSON.stringify(a.assumptions));
  ok('3.5 la inflación declara su base y NO se mezcla en la serie nominal',
    a.assumptions.inflationBase === 'annual_constant'
    && a.realFinal != null && a.realFinal < a.final
    && near(a.series[10].value, a.final, 0.01),
    JSON.stringify({ nominal: a.final, real: a.realFinal }));
  ok('3.6 sin costes ni inflación, sus bases son null y no se afirman',
    (() => { const b = P({ initial: '1000', monthly: '0', years: '5', annualRatePct: '6' });
      return b.assumptions.costBase === null && b.assumptions.inflationBase === null
        && b.realFinal === null; })());
  ok('3.7 el motor no lee reloj ni aleatoriedad (determinista, sin Monte Carlo)',
    !/Date\.now|Math\.random|new Date/.test(fnSrc('_wsProject')));
  ok('3.8 dos llamadas idénticas dan resultados idénticos',
    JSON.stringify(P({ initial: '1000', monthly: '300', years: '20', annualRatePct: '6' }))
      === JSON.stringify(P({ initial: '1000', monthly: '300', years: '20', annualRatePct: '6' })));
  ok('3.9 la moneda viaja con la proyección',
    P({ initial: '1', monthly: '0', years: '1', annualRatePct: '1', currency: 'USD' }).assumptions.currency === 'USD');
}

// ════════════════════════════════════════════════════════════════════════════
// 4 · OBJETIVOS · LA RENTABILIDAD NO SE INVENTA
// ════════════════════════════════════════════════════════════════════════════
console.log('\n4 · Ningún objetivo proyecta una rentabilidad que el usuario no eligió:');
{
  ok('4.1 el 5 % fijo ha desaparecido del motor de objetivos',
    !/const r = 0\.05 \/ 12/.test(app) && !/0\.05 \/ 12/.test(fnSrc('calculateGoalProgress')));
  ok('4.2 emergencia y libre asumen CERO por defecto (§D)',
    run('_wsgAssumedRatePct({ type: "emergency" })') === 0
    && run('_wsgAssumedRatePct({ type: "free" })') === 0);
  ok('4.3 los demás tipos NO asumen nada: null, que no es cero',
    run('_wsgAssumedRatePct({ type: "wealth" })') === null
    && run('_wsgAssumedRatePct({ type: "fire" })') === null
    && run('_wsgAssumedRatePct({ type: "home" })') === null);
  ok('4.4 una tasa ELEGIDA explícitamente se respeta, también en emergencia',
    run('_wsgAssumedRatePct({ type: "emergency", ret: "2" })') === 2
    && run('_wsgAssumedRatePct({ type: "wealth", ret: "7,5" })') === 7.5);
  ok('4.5 y un cero explícito se distingue de la ausencia',
    run('_wsgAssumedRatePct({ type: "wealth", ret: "0" })') === 0
    && run('_wsgAssumedRatePct({ type: "wealth", ret: "" })') === null);
  // El efecto MEDIBLE del defecto: sin el 5 % fantasma, el fondo de emergencia
  // necesita más aportación y tarda más, que es la verdad.
  ok('4.6 sin rentabilidad supuesta la meta tarda MÁS que con el 5 % inventado',
    (() => { const zero = G({ type: 'emergency', monthlyExpenses: '2000', coverMonths: '6',
                              current: '0', monthly: '200' });
      const five = G({ type: 'emergency', monthlyExpenses: '2000', coverMonths: '6',
                       current: '0', monthly: '200', ret: '5' });
      return zero.months != null && five.months != null && zero.months > five.months; })(),
    JSON.stringify([G({ type: 'emergency', monthlyExpenses: '2000', coverMonths: '6', current: '0', monthly: '200' }).months,
                    G({ type: 'emergency', monthlyExpenses: '2000', coverMonths: '6', current: '0', monthly: '200', ret: '5' }).months]));
  ok('4.7 la tasa supuesta viaja en el progreso para que la superficie la declare',
    G({ type: 'emergency', monthlyExpenses: '100', coverMonths: '3', current: '0', monthly: '10' }).assumedRatePct === 0);
}

// ════════════════════════════════════════════════════════════════════════════
// 5 · OBJETIVOS · CINCO TIPOS FUNCIONALMENTE DISTINTOS
// ════════════════════════════════════════════════════════════════════════════
console.log('\n5 · Cada tipo calcula su meta con sus propios campos:');
{
  ok('5.1 los cinco tipos siguen declarados', 
    JSON.stringify(run('_WSG_TYPES')) === JSON.stringify(['wealth','emergency','home','fire','free']));
  ok('5.2 emergencia: gastos esenciales × meses de cobertura',
    (() => { const e = G({ type: 'emergency', monthlyExpenses: '2000', coverMonths: '6' });
      return e.target === 12000 && e.targetBasis === 'expenses_x_months'; })(),
    JSON.stringify(G({ type: 'emergency', monthlyExpenses: '2000', coverMonths: '6' })));
  ok('5.3 vivienda: entrada + gastos, DISTINTO del precio completo',
    (() => { const d = G({ type: 'home', downPayment: '50000', purchaseCosts: '12000' });
      const p = G({ type: 'home', price: '250000' });
      return d.target === 62000 && d.targetBasis === 'down_payment_plus_costs'
        && p.target === 250000 && p.targetBasis === 'full_price'; })());
  ok('5.4 FIRE: gasto anual / tasa de retirada supuesta',
    (() => { const f = G({ type: 'fire', annualSpend: '24000', withdrawalRatePct: '4' });
      return f.target === 600000 && f.targetBasis === 'annual_spend_over_swr'; })(),
    JSON.stringify(G({ type: 'fire', annualSpend: '24000', withdrawalRatePct: '4' })));
  ok('5.5 FIRE sin tasa de retirada NO tiene número, y lo dice (no garantiza nada)',
    (() => { const f = G({ type: 'fire', annualSpend: '24000' });
      return f.state === 'needs-rate' && f.targetBasis === 'swr_missing'; })(),
    JSON.stringify(G({ type: 'fire', annualSpend: '24000' }).state));
  ok('5.6 una tasa de retirada de 0 no produce una división por cero',
    (() => { const f = G({ type: 'fire', annualSpend: '24000', withdrawalRatePct: '0' });
      return f.state === 'needs-rate' && Number.isFinite(f.target); })());
  ok('5.7 libre y patrimonio usan el importe declarado',
    G({ type: 'free', target: '10000' }).targetBasis === 'declared_target'
    && G({ type: 'wealth', target: '500000' }).target === 500000);
  ok('5.8 sin ningún campo, no hay meta y el estado es «faltan datos»',
    G({ type: 'free' }).state === 'no-data' && G({ type: 'emergency' }).state === 'no-data');
}

// ════════════════════════════════════════════════════════════════════════════
// 6 · OBJETIVOS · «EN CAMINO» SE DEMUESTRA
// ════════════════════════════════════════════════════════════════════════════
console.log('\n6 · Ningún estado afirma un cumplimiento que no se ha calculado:');
{
  const Y = YEAR;
  ok('6.1 SIN fecha objetivo el estado es `no-date`, nunca `on-track`',
    (() => { const n = G({ type: 'free', target: '10000', current: '1000', monthly: '200' });
      return n.state === 'no-date' && n.hasDate === false; })(),
    G({ type: 'free', target: '10000', current: '1000', monthly: '200' }).state);
  ok('6.2 …pero el tiempo estimado SÍ se publica cuando existe',
    G({ type: 'free', target: '10000', current: '1000', monthly: '200' }).months != null);
  ok('6.3 sin solución el estado es `no-solution` y no hay tiempo estimado',
    (() => { const n = G({ type: 'free', target: '10000', current: '1000', monthly: '0' });
      return n.state === 'no-solution' && n.months === null && n.etaYear === null; })(),
    JSON.stringify(G({ type: 'free', target: '10000', current: '1000', monthly: '0' })));
  ok('6.4 con fecha, `on-track` exige que la PROYECCIÓN alcance la meta',
    (() => { const good = G({ type: 'wealth', target: '100000', current: '50000',
                              monthly: '2200', targetYear: Y + 2, ret: '0' });
      return good.state === 'on-track' && good.projectedAtDate >= good.target; })(),
    JSON.stringify(G({ type: 'wealth', target: '100000', current: '50000', monthly: '2200', targetYear: Y + 2, ret: '0' })));
  ok('6.5 y si no la alcanza es `behind`, con el DÉFICIT computado',
    (() => { const bad = G({ type: 'wealth', target: '100000', current: '50000',
                             monthly: '100', targetYear: Y + 2, ret: '0' });
      return bad.state === 'behind' && bad.gapAtDate < 0
        && near(bad.projectedAtDate, 50000 + 100 * 24, 0.01); })(),
    JSON.stringify(G({ type: 'wealth', target: '100000', current: '50000', monthly: '100', targetYear: Y + 2, ret: '0' })));
  ok('6.6 la aportación NECESARIA se publica con fecha, y cuadra con la meta',
    (() => { const b = G({ type: 'wealth', target: '100000', current: '50000',
                           monthly: '100', targetYear: Y + 2, ret: '0' });
      return near(b.requiredMonthly, 50000 / 24, 0.01); })(),
    String(G({ type: 'wealth', target: '100000', current: '50000', monthly: '100', targetYear: Y + 2, ret: '0' }).requiredMonthly));
  ok('6.7 una fecha en el PASADO no cuenta como plazo (no se inventa cumplimiento)',
    G({ type: 'free', target: '10000', current: '1000', monthly: '200', targetYear: Y - 1 }).hasDate === false);
  ok('6.8 alcanzado es alcanzado: 100 %, sin pendiente y sin aportación necesaria',
    (() => { const r = G({ type: 'free', target: '1000', current: '1200' });
      return r.state === 'reached' && r.pct === 100 && r.remaining === 0 && r.requiredMonthly === 0; })());
  ok('6.9 el progreso nunca pasa de 100 ni baja de 0',
    G({ type: 'free', target: '1000', current: '999.99' }).pct <= 100
    && G({ type: 'free', target: '1000', current: '0' }).pct === 0);
  // Y el capital de una meta es de ESA meta: no se agrega como patrimonio nuevo.
  ok('6.10 el progreso no lee ni suma otras metas',
    !/_wsgGoals\(\)|_wshReadStore/.test(fnSrc('calculateGoalProgress')));
  // Las seis lecturas tienen su clave en los DOS idiomas.
  const RK = ['wsg_read_behind_req','wsg_read_nodate','wsg_read_nosolution','wsg_read_needsrate',
              'wsg_state_nodate','wsg_state_nosolution','wsg_state_needsrate'];
  const occ = k => (app.match(new RegExp('\\n    ' + k + ':', 'g')) || []).length;
  ok('6.11 las claves de los estados nuevos existen en ES y EN',
    RK.every(k => occ(k) === 2), JSON.stringify(RK.map(k => k + ':' + occ(k))));
  ok('6.12 y ninguna de ellas afirma que se vaya a llegar',
    !/wsg_state_nodate:\s*'[^']*camino/i.test(app) && !/wsg_state_nosolution:\s*'[^']*camino/i.test(app));
}

// ════════════════════════════════════════════════════════════════════════════
// 7 · UN SOLO PARSEO DE TASA EN LOS TRES MOTORES
// ════════════════════════════════════════════════════════════════════════════
console.log('\n7 · La tasa se lee igual en compound, escenarios y objetivos:');
{
  const rate = txt => [
    P({ initial: '100000', monthly: '0', years: '10', annualRatePct: txt }).final,
    run('projectScenario("100000","0", _wsNum(' + JSON.stringify(txt) + ')/100, "10").projected'),
    G({ type: 'wealth', target: '999999999', current: '100000', monthly: '0', ret: txt }).assumedRatePct,
  ];
  ok('7.1 «7,5» y «7.5» dan el MISMO resultado en los tres',
    (() => { const a = rate('7,5'), b = rate('7.5');
      return near(a[0], b[0], 0.01) && near(a[1], b[1], 0.01) && a[2] === b[2]; })(),
    JSON.stringify([rate('7,5'), rate('7.5')]));
  ok('7.2 y ninguno interpreta una tasa con coma como 0 %',
    (() => { const a = rate('7,5'), z = rate('0');
      return a[0] > z[0] + 1000 && a[1] > z[1] + 1000 && a[2] !== z[2]; })());
  ok('7.3 objetivos ya NO tiene solver propio con su propia capitalización',
    /_wsProjMonthlyRate\(/.test(fnSrc('calculateGoalProgress')));
  ok('7.4 y el motor compartido es el que proyecta el interés compuesto',
    /_wsProject\(/.test(fnSrc('_wsCompoundProjection')));
}

// ════════════════════════════════════════════════════════════════════════════
// 8 · ESCENARIOS · PARÁMETROS COMUNES Y NINGÚN SUPUESTO INVENTADO (§C)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n8 · Escenarios · lo que el usuario elige y lo que Aurix no inventa:');
{
  const C = ctx('es');
  const cmp = () => vm.runInContext('_wsbCompare(_wsbScenarios())', C);
  const set = patch => vm.runInContext('_wsbParamsSet(' + JSON.stringify(patch) + ')', C);
  // SIN BASE DECLARADA no se proyecta desde cero: cero sería un dato.
  const c0 = cmp();
  ok('8.1 sin patrimonio de partida declarado, la base es DESCONOCIDA',
    c0.base.known === false && c0.base.source === null,
    JSON.stringify(c0.base));
  ok('8.2 y el porcentaje se declara NO APLICABLE en vez de dividir por cero',
    c0.pctApplicable === false);
  set({ baseManual: '120000' });
  const c1 = cmp();
  ok('8.3 una base declarada a mano se acepta y se marca como declarada',
    c1.base.known === true && c1.base.value === 120000 && c1.base.source === 'declared');
  ok('8.4 …y entonces el porcentaje sí aplica', c1.pctApplicable === true);
  // LAS DOS CAUSAS DE LA DIFERENCIA, y suman exactamente el total.
  ok('8.5 la diferencia se separa en aportaciones y crecimiento, y cuadra exacto',
    c1.rows.length > 0 && c1.rows.every(r => near(r.byContribution + r.byGrowth, r.diff, 0.01)),
    JSON.stringify(c1.rows.map(r => ({ d: +r.diff.toFixed(2), c: +r.byContribution.toFixed(2), g: +r.byGrowth.toFixed(2) }))));
  ok('8.6 la parte por aportaciones es exactamente lo aportado de más',
    c1.rows.every(r => near(r.byContribution, r.contributed - c1.reference.contributed, 0.01)));
  ok('8.7 y la referencia es el mismo patrimonio SIN aportar nada',
    c1.reference.contributed === 0 && near(c1.reference.initial, 120000, 0.01));
  // HORIZONTE Y TASA: editables y COMUNES.
  set({ years: '20', ret: '4,5' });
  const c2 = cmp();
  ok('8.8 el horizonte es editable', c2.years === 20);
  ok('8.9 la tasa es editable y admite decimal con coma', c2.ratePct === 4.5);
  ok('8.10 y los dos son COMUNES: todas las series tienen el mismo horizonte',
    c2.rows.every(r => r.series.length === c2.years + 1),
    JSON.stringify(c2.rows.map(r => r.series.length)));
  ok('8.11 la convención de la comparación se declara',
    c2.assumptions.convention === vm.runInContext('_WS_PROJ_CONV_DEFAULT', C));
  ok('8.12 nunca más de tres escenarios',
    c2.rows.length <= vm.runInContext('_WSB_MAX_SCENARIOS', C));
  // Y LOS SUPUESTOS INVENTADOS, RETIRADOS.
  ok('8.13 el 6 % y los 10 años ya NO se usan como constante en el cálculo',
    !/projectScenario\(bl\.wealth, 0, _WSB_RETURN, _WSB_HORIZON\)/.test(app)
    && !/projectScenario\(bl\.wealth, s\.monthly, _WSB_RETURN, _WSB_HORIZON/.test(app));
  ok('8.14 …siguen existiendo sólo como valor INICIAL del formulario',
    /_WSB_HORIZON = 10;/.test(app) && /_WSB_RETURN = 0\.06;/.test(app)
    && /\(o\.years != null && String\(o\.years\) !== ''\) \? o\.years : _WSB_HORIZON/.test(app));
  ok('8.15 las etiquetas de «estabilidad» ya no se pintan en ninguna tarjeta',
    !/wsb-pill is-\$\{esc\(s\.stabKey\)\}/.test(app)
    && !/t\('wsb_stab_' \+ s\.stabKey\)/.test(app));
  ok('8.16 y el titular prescriptivo «tu mejor escenario» ha desaparecido',
    !/Tu mejor escenario supera/.test(app) && !/Your best scenario beats/.test(app)
    && !/wsb_impact_best/.test(app));
  ok('8.17 el rango se nombra por la APORTACIÓN, no por un juicio',
    /wsb_impact_highest:\s*'Aportación más alta'/.test(app)
    && /wsb_impact_nocontrib:\s*'Sin aportar nada'/.test(app));
  // Una simulación GUARDADA lleva sus supuestos, así que reabrirla no la
  // reinterpreta con los parámetros de otro día.
  ok('8.18 el escenario guardado persiste su tasa, horizonte y convención',
    /annualRatePct: cmpS\.ratePct/.test(app) && /years: cmpS\.years/.test(app)
    && /convention: cmpS\.convention/.test(app) && /baseSource: cmpS\.base\.source/.test(app));
  ok('8.19 …y también el desglose de las dos causas',
    /diffByContribution: Math\.round\(rowS\.byContribution\)/.test(app)
    && /diffByGrowth: Math\.round\(rowS\.byGrowth\)/.test(app));
  const CK = ['wsb_params_title','wsb_p_base','wsb_p_years','wsb_p_ret','wsb_base_missing',
              'wsb_by_contrib','wsb_by_growth','wsb_impact_nocontrib','wsb_impact_highest',
              'wsb_impact_spread','wsb_pct_na','wsb_asm_common','wsb_asm_base_declared',
              'wsb_asm_base_imported','wsb_asm_base_unknown'];
  const occ = k => (app.match(new RegExp('\\n    ' + k + ':', 'g')) || []).length;
  ok('8.20 las quince claves nuevas existen en ES y EN',
    CK.every(k => occ(k) === 2), JSON.stringify(CK.filter(k => occ(k) !== 2)));
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
