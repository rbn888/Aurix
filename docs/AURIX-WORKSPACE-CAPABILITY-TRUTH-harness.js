'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-WORKSPACE-CAPABILITY-TRUTH — SPEC WORKSPACE COMPLETION · §E / §F / §G
// ════════════════════════════════════════════════════════════════════════════
// TRES CAPACIDADES, CINCO DEFECTOS FINANCIEROS REALES. Ninguno lo cubría un gate,
// y dos estaban en superficies PUBLICADAS (inmobiliario es Free, préstamos Premium).
//
// §E · PORTFOLIO INMOBILIARIO
//   1. EL AGREGADO ERA UNA MEDIA DE PORCENTAJES. Un piso de 500.000 al 2,4 % y un
//      garaje de 50.000 al 10,1 % daban «6,2 % de rentabilidad media». La real es
//      3,1 %. Un factor 2× de sobreafirmación sobre la cartera del usuario.
//   2. LA AMORTIZACIÓN DE PRINCIPAL SE CONTABA COMO GASTO OPERATIVO, así que el
//      resultado del inmueble y el coste de su deuda se leían como una sola cifra.
//   3. `_wsJrnPct(null)` imprimía «+0,0 %»: un cero falso donde no hay denominador.
//
// §F · PRESUPUESTO
//   4. CON INGRESOS CERO la tasa de ahorro devolvía 0 y se pintaba «0 %», que
//      afirma que no ahorras nada cuando la razón no se puede calcular. Y la
//      lectura daba veredictos («margen sólido») con umbrales no documentados.
//
// §G · PRÉSTAMOS
//   5. LA COMPARACIÓN NO HEREDABA EL SEGURO: el escenario A lo incluía en su cuota
//      y el B no, así que la diferencia se abarataba EXACTAMENTE en el seguro y B
//      parecía mejor de lo que es, por una variable que nadie estaba comparando.
//      Y el KPI del tipo se llamaba «Interés medio», que no es lo que se calcula.
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

function ctx(lang) {
  const sb = { Math, Number, String, isFinite, isNaN, parseFloat, JSON, Array, Object,
               console: { warn(){}, log(){} } };
  vm.createContext(sb);
  sb.lang = lang || 'es';
  ['_WSBUD_INCOME','_WSBUD_EXPENSES'].forEach(n => { try { vm.runInContext(konstSrc(n), sb); } catch (_) {} });
  ['_wsNum','_wsCanonicalNumStr','_wsNumInLang','_wsCanonicalizeInputs','_wsNumOrNull','_wsJrnPct','calculateLoan',
   'calculateRealEstatePortfolio','calculateMonthlyBudget','calculateAssetPrices','calculateTradeJournal']
    .forEach(n => vm.runInContext(fnSrc(n), sb));
  return sb;
}
const ES = ctx('es'), EN = ctx('en');
const run = (e, c) => vm.runInContext(e, c || ES);
const RE = props => run('calculateRealEstatePortfolio(' + JSON.stringify(props) + ')');
const BUD = inp => run('calculateMonthlyBudget(' + JSON.stringify(inp) + ')');
const LOAN = (o, c) => run('calculateLoan(' + JSON.stringify(o) + ')', c);

console.log('AURIX-WORKSPACE-CAPABILITY-TRUTH — §E inmobiliario · §F presupuesto · §G préstamos\n');

// ════════════════════════════════════════════════════════════════════════════
// 1 · §E · EL AGREGADO SALE DE IMPORTES, NO DE PORCENTAJES
// ════════════════════════════════════════════════════════════════════════════
console.log('1 · Inmobiliario · la rentabilidad del conjunto:');
{
  // El caso que destapa el defecto: dos inmuebles de tamaño MUY distinto.
  const PROPS = [
    { buy: 500000, value: 520000, rent: 1250, expenses: 250, mortgage: 300000, payment: 1400 },
    { buy: 50000,  value: 52000,  rent: 450,  expenses: 30,  mortgage: 0,      payment: 0 },
  ];
  const r = RE(PROPS);
  const meanOfPercents = (r.list[0].netYield + r.list[1].netYield) / 2;
  ok('1.1 el agregado es Σ(resultado operativo anual) / Σ(coste), exacto',
    near(r.portfolioNetYield, r.noiAnnualTotal / r.buyTotal * 100, 1e-9)
    && near(r.portfolioNetYield, 3.0982, 0.01),
    JSON.stringify({ agregado: r.portfolioNetYield, media: meanOfPercents }));
  ok('1.2 y NO es la media de los porcentajes (que sobreafirmaba el doble)',
    Math.abs(r.portfolioNetYield - meanOfPercents) > 2,
    JSON.stringify({ correcto: +r.portfolioNetYield.toFixed(2), mediaVieja: +meanOfPercents.toFixed(2) }));
  ok('1.3 `avgYield` conserva su clave pero ya publica el agregado correcto',
    near(r.avgYield, r.portfolioNetYield, 1e-9),
    JSON.stringify({ avgYield: r.avgYield, portfolio: r.portfolioNetYield }));
  ok('1.4 sin base de coste el agregado es null, no 0 %',
    RE([{ rent: 500, expenses: 50 }]).portfolioNetYield === null);
  ok('1.5 …y sin equity el cash-on-cash también',
    RE([{ buy: 1000, rent: 10, mortgage: 5000 }]).portfolioCashOnCash === null);
  ok('1.6 un inmueble sin coste no publica rentabilidad propia',
    RE([{ rent: 500, expenses: 50 }]).list[0].netYield === null
    && RE([{ rent: 500, expenses: 50 }]).list[0].grossYield === null);
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · §E · TRES CAPAS: OPERATIVO, DEUDA, APRECIACIÓN
// ════════════════════════════════════════════════════════════════════════════
console.log('\n2 · Inmobiliario · la cuota no es un gasto operativo:');
{
  const one = RE([{ buy: 200000, value: 230000, rent: 1000, expenses: 200, mortgage: 120000, payment: 700 }]).list[0];
  ok('2.1 el resultado operativo es renta − gastos, y NO conoce la deuda',
    one.noiMonthly === 800 && near(one.noiAnnual, 9600, 0.01));
  ok('2.2 el servicio de la deuda va aparte, con su propio nombre',
    one.debtServiceMonthly === 700);
  ok('2.3 el flujo tras deuda es la resta de los dos, y cuadra',
    one.cashflowMonthly === 100 && near(one.noiMonthly - one.debtServiceMonthly, one.cashflowMonthly, 0.01));
  ok('2.4 la rentabilidad neta se mide sobre el COSTE y con el operativo, sin deuda',
    near(one.netYield, 9600 / 200000 * 100, 0.01),
    String(one.netYield));
  ok('2.5 …así que dos inmuebles idénticos con y sin hipoteca rinden IGUAL',
    (() => { const a = RE([{ buy: 200000, rent: 1000, expenses: 200, mortgage: 0, payment: 0 }]).list[0];
      const b = RE([{ buy: 200000, rent: 1000, expenses: 200, mortgage: 150000, payment: 900 }]).list[0];
      return near(a.netYield, b.netYield, 1e-9) && a.cashflowMonthly !== b.cashflowMonthly; })(),
    'la deuda cambia el FLUJO, no la rentabilidad del activo');
  ok('2.6 la apreciación es latente y NO entra en el flujo de caja',
    one.appreciation === 30000
    && !String(fnSrc('calculateRealEstatePortfolio')).match(/cashflowMonthly = [^;]*appreciation/));
  ok('2.7 un inmueble sin valor declarado no finge apreciación',
    (() => { const x = RE([{ buy: 100000, rent: 500 }]).list[0];
      return x.appreciation === null && x.valueIsDeclared === false && x.value === 100000; })());
  ok('2.8 el agregado de apreciación sólo cuenta los que TIENEN valor declarado',
    (() => { const m = RE([{ buy: 100000, value: 120000, rent: 0 }, { buy: 100000, rent: 0 }]);
      return m.appreciationTotal === 20000 && m.valuesDeclared === 1 && m.count === 2; })(),
    JSON.stringify(RE([{ buy: 100000, value: 120000, rent: 0 }, { buy: 100000, rent: 0 }]).appreciationTotal));
  ok('2.9 el semáforo describe el SIGNO del flujo, no un umbral de rentabilidad',
    (() => { const src = fnSrc('calculateRealEstatePortfolio');
      return !/netYield >= 5/.test(src)
        && RE([{ buy: 1, rent: 0, expenses: 10 }]).list[0].status === 'red'
        && RE([{ buy: 1, rent: 10, expenses: 0 }]).list[0].status === 'green'; })());
  ok('2.10 el equity es valor − hipoteca, y el total también',
    (() => { const m = RE([{ buy: 100000, value: 150000, mortgage: 60000, rent: 0 }]);
      return m.list[0].equity === 90000 && m.equityTotal === 90000; })());
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · §E · «—» ES DATO AUSENTE Y «+0,0 %» UN CERO REAL
// ════════════════════════════════════════════════════════════════════════════
console.log('\n3 · Un porcentaje no calculable no se imprime como cero:');
{
  ok('3.1 null y NaN dan guion, no «+0,0 %»',
    run('_wsJrnPct(null)') === '—' && run('_wsJrnPct(undefined)') === '—'
    && run('_wsJrnPct(NaN)') === '—' && run('_wsJrnPct(Infinity)') === '—',
    JSON.stringify([run('_wsJrnPct(null)'), run('_wsJrnPct(NaN)')]));
  ok('3.2 un cero REAL sigue imprimiéndose como cero',
    run('_wsJrnPct(0)') === '+0,0%' && run('_wsJrnPct(0)', EN) === '+0.0%',
    JSON.stringify([run('_wsJrnPct(0)'), run('_wsJrnPct(0)', EN)]));
  ok('3.3 los valores normales no cambian de formato',
    run('_wsJrnPct(3.098)') === '+3,1%' && run('_wsJrnPct(-2.5)') === '-2,5%',
    JSON.stringify([run('_wsJrnPct(3.098)'), run('_wsJrnPct(-2.5)')]));
  ok('3.4 y el resultado GUARDADO conserva el null en vez de redondearlo a 0',
    /avgYield: r\.portfolioNetYield == null \? null :/.test(app));
}

// ════════════════════════════════════════════════════════════════════════════
// 4 · §F · PRESUPUESTO · INGRESOS CERO NO ES AHORRO CERO
// ════════════════════════════════════════════════════════════════════════════
console.log('\n4 · Presupuesto · la razón sin denominador no existe:');
{
  const z = BUD({ salary: '0', housing: '700' });
  ok('4.1 con ingresos 0 la tasa de ahorro es null, no 0',
    z.saveRate === null && z.applicable === false,
    JSON.stringify({ saveRate: z.saveRate, applicable: z.applicable }));
  ok('4.2 y su denominador se declara ausente', z.saveRateBasis === null);
  const n = BUD({ salary: '2000', housing: '700', food: '300' });
  ok('4.3 con ingresos la tasa es (ingresos − gastos)/ingresos, exacta',
    near(n.saveRate, (2000 - 1000) / 2000 * 100, 0.01) && n.saveRateBasis === 'share_of_income',
    JSON.stringify({ saveRate: n.saveRate, basis: n.saveRateBasis }));
  ok('4.4 el déficit se marca como hecho, no se disfraza de ahorro',
    (() => { const d = BUD({ salary: '1000', housing: '1500' });
      return d.deficit === true && d.free === -500 && d.saveRate < 0; })(),
    JSON.stringify(BUD({ salary: '1000', housing: '1500' }).free));
  ok('4.5 la superficie escribe «no aplicable» en vez de un 0 %',
    /res\.saveRate == null \? t\('wstool_bud_na'\)/.test(fnSrc('_wsBudgetOutHtml')));
  // LOS VEREDICTOS SIN CRITERIO, RETIRADOS.
  ok('4.6 los umbrales de «margen sólido» / «buen camino» ya no deciden la lectura',
    !/rate >= 30 \? t\('wstool_bud_read_high'\)/.test(app)
    && !/rate >= 10 \? t\('wstool_bud_read_mid'\)/.test(app));
  ok('4.7 la lectura es neutral y nombra el presupuesto como origen',
    /wstool_bud_read_neutral:\s*'Según tu presupuesto/.test(app)
    && /wstool_bud_basis_plan:\s*'Son cifras de TU PRESUPUESTO, no un saldo bancario/.test(app));
  ok('4.8 y el denominador se explica, con el disponible fuera del reparto',
    /wstool_bud_basis_denom:/.test(app) && /wstool_bud_basis_notcat:/.test(app));
  const KEYS = ['wstool_bud_na','wstool_bud_read_neutral','wstool_bud_read_deficit',
                'wstool_bud_read_noincome','wstool_bud_basis_title','wstool_bud_basis_plan',
                'wstool_bud_basis_denom','wstool_bud_basis_notcat'];
  const occ = k => (app.match(new RegExp('\\n    ' + k + ':', 'g')) || []).length;
  ok('4.9 las ocho claves nuevas existen en ES y EN',
    KEYS.every(k => occ(k) === 2), JSON.stringify(KEYS.map(k => k + ':' + occ(k))));
}

// ════════════════════════════════════════════════════════════════════════════
// 5 · §G · PRÉSTAMOS · LA COMPARACIÓN COMPARA UNA SOLA COSA
// ════════════════════════════════════════════════════════════════════════════
console.log('\n5 · Préstamos · lo que no se compara se mantiene constante:');
{
  const INP = { principal: '250000', rate: '3,5', years: '30', insurance: '25', fees: '3000' };
  const A = LOAN(INP);
  const Bwrong = LOAN({ principal: '250000', rate: '3,5', years: '20' });
  const Bright = LOAN({ principal: '250000', rate: '3,5', years: '20', insurance: '25', fees: '3000' });
  ok('5.1 el escenario B hereda seguro y gastos: no son variables comparadas',
    /insurance: inp\.insurance, fees: inp\.fees/.test(fnSrc('_wsLoanCmpOutHtml')));
  ok('5.2 la contaminación era EXACTAMENTE el seguro mensual',
    near((Bright.monthlyPayment - A.monthlyPayment) - (Bwrong.monthlyPayment - A.monthlyPayment), 25, 0.01),
    JSON.stringify({ conSeguro: +(Bright.monthlyPayment - A.monthlyPayment).toFixed(2),
                     sinSeguro: +(Bwrong.monthlyPayment - A.monthlyPayment).toFixed(2) }));
  ok('5.3 y la CUOTA NUEVA en absoluto se publica, no sólo su diferencia',
    /wsloan_cmp_newpay/.test(fnSrc('_wsLoanCmpOutHtml'))
    && /wsloan_cmp_newpay:\s*'Cuota del escenario B'/.test(app));
}

// ════════════════════════════════════════════════════════════════════════════
// 6 · §G · EL CONTRATO SE DECLARA Y NO SE LLAMA TAE
// ════════════════════════════════════════════════════════════════════════════
console.log('\n6 · Préstamos · qué préstamo es el que se está simulando:');
{
  ok('6.1 el KPI del tipo ya no dice «interés medio»',
    !/wsloan_kpi_rate:\s*'Interés medio'/.test(app) && !/wsloan_kpi_rate:\s*'Average rate'/.test(app));
  ok('6.2 …dice TIPO NOMINAL ANUAL, en los dos idiomas',
    /wsloan_kpi_rate:\s*'Tipo nominal anual'/.test(app)
    && /wsloan_kpi_rate:\s*'Nominal annual rate'/.test(app));
  ok('6.3 el contrato se declara: cuota constante, tipo fijo, nominal, mensual',
    /wsloan_ct_fixed:\s*'Cuota constante y tipo fijo/.test(app)
    && /wsloan_ct_nominal:[^\n]*no una TAE/.test(app)
    && /wsloan_ct_monthly:\s*'Pagos mensuales/.test(app));
  ok('6.4 y se nombra lo que NO incluye',
    /wsloan_ct_excluded:[^\n]*No incluye/.test(app));
  ok('6.5 los gastos iniciales NO se financian: no suben la cuota',
    (() => { const a = LOAN({ principal: '200000', rate: '3', years: '25' });
      const b = LOAN({ principal: '200000', rate: '3', years: '25', fees: '5000' });
      return near(a.monthlyPayment, b.monthlyPayment, 0.01)
        && near(b.totalPaid - a.totalPaid, 5000, 0.01); })(),
    'misma cuota, mayor desembolso total');
  ok('6.6 el seguro va en la cuota pero NO genera intereses',
    (() => { const a = LOAN({ principal: '200000', rate: '3', years: '25' });
      const b = LOAN({ principal: '200000', rate: '3', years: '25', insurance: '30' });
      return near(a.totalInterest, b.totalInterest, 0.01)
        && near(b.monthlyPayment - a.monthlyPayment, 30, 0.01); })());
  ok('6.7 «un punto porcentual» y no «un 1 %»',
    /wsloan_ins_rate:[^\n]*punto porcentual/.test(app)
    && /wsloan_ins_rate:[^\n]*percentage point/.test(app)
    && !/wsloan_ins_rate:[^\n]*del 1% en el tipo/.test(app));
  ok('6.8 …y la simulación que respalda esa frase suma 1 pp, no multiplica',
    /rate: res\.annual \+ 1/.test(fnSrc('_wsLoanInsights')));
  ok('6.9 la lectura publica como máximo TRES consecuencias',
    /return out\.slice\(0, 3\)/.test(fnSrc('_wsLoanInsights')));
  // RECONCILIACIÓN: la tabla tiene que cerrar contra los totales publicados.
  ok('6.10 la amortización reconcilia principal, intereses y saldo final',
    (() => { const r = LOAN({ principal: '250000', rate: '3,5', years: '30' });
      const sp = r.table.reduce((a, x) => a + x.principal, 0);
      const si = r.table.reduce((a, x) => a + x.interest, 0);
      const last = r.table[r.table.length - 1];
      return near(sp, r.principal, 0.5) && near(si, r.totalInterest, 0.5)
        && near(last.balance, 0, 0.01)
        && near(last.payment, last.principal + last.interest, 0.01); })(),
    JSON.stringify((() => { const r = LOAN({ principal: '250000', rate: '3,5', years: '30' });
      return { sp: r.table.reduce((a, x) => a + x.principal, 0), p: r.principal }; })()));
  ok('6.11 y el desembolso total es principal + intereses + seguro + gastos',
    (() => { const r = LOAN({ principal: '250000', rate: '3,5', years: '30', insurance: '25', fees: '3000' });
      return near(r.totalPaid, r.principal + r.totalInterest + r.totalInsurance + r.fees, 0.01); })());
  const CK = ['wsloan_ct_title','wsloan_ct_fixed','wsloan_ct_nominal','wsloan_ct_monthly',
              'wsloan_ct_fees','wsloan_ct_ins','wsloan_ct_excluded','wsloan_cmp_newpay'];
  const occ = k => (app.match(new RegExp('\\n    ' + k + ':', 'g')) || []).length;
  ok('6.12 las ocho claves del contrato existen en ES y EN',
    CK.every(k => occ(k) === 2), JSON.stringify(CK.map(k => k + ':' + occ(k))));
}

// ════════════════════════════════════════════════════════════════════════════
// 7 · §E · LAS TRES CAPAS SE PUBLICAN, NO SÓLO SE CALCULAN
// ════════════════════════════════════════════════════════════════════════════
console.log('\n7 · Inmobiliario · el usuario ve la separación:');
{
  const src = fnSrc('_wsReSummaryHtml');
  ok('7.1 la vista publica operativo, deuda y flujo como tres filas',
    /wsre_l_noi/.test(src) && /wsre_l_debt/.test(src) && /wsre_l_cf/.test(src));
  ok('7.2 la apreciación se publica aparte y sólo si hay valor declarado',
    /r\.valuesDeclared > 0 \?/.test(src) && /wsre_l_appr/.test(src));
  ok('7.3 y los denominadores se explican en la propia superficie',
    /wsre_basis_yield/.test(src) && /wsre_basis_debt/.test(src) && /wsre_basis_appr/.test(src));
  ok('7.4 la explicación dice que el agregado NO es la media de rentabilidades',
    /wsre_basis_yield:[^\n]*no la media de las rentabilidades/.test(app));
  ok('7.5 …y que el valor actual es DECLARADO, no una valoración certificada',
    /wsre_basis_declared_all:[^\n]*no una valoración certificada/.test(app));
  const LK = ['wsre_l_noi','wsre_l_debt','wsre_l_cf','wsre_l_appr','wsre_basis_title',
              'wsre_basis_yield','wsre_basis_debt','wsre_basis_appr',
              'wsre_basis_declared_all','wsre_basis_declared_some'];
  const occ = k => (app.match(new RegExp('\\n    ' + k + ':', 'g')) || []).length;
  ok('7.6 las diez claves existen en ES y EN',
    LK.every(k => occ(k) === 2), JSON.stringify(LK.map(k => k + ':' + occ(k))));
}

// ════════════════════════════════════════════════════════════════════════════
// 8 · LOS HALLAZGOS DE LA REVISIÓN FINANCIERA, COMO REGRESIÓN
// ════════════════════════════════════════════════════════════════════════════
// Catorce, y ninguno lo cubría un gate. El crítico lo introdujo la propia
// corrección anterior: la pantalla de interés compuesto mostraba una convención y
// el guardado usaba otra.
console.log('\n8 · Regresión de la revisión financiera:');
{
  // ── [crítico] UN DOCUMENTO, UNA PROYECCIÓN ────────────────────────────────
  // `_wsToolSave` y la vista previa del catálogo llamaban a
  // `calculateCompoundGrowth` (NOMINAL12 cableado) mientras la herramienta pintaba
  // `_wsProject` (efectiva). Con los defaults nuevos la pantalla decía 139.238,73 €
  // y la tarjeta 141.922 € para el MISMO documento: 2.684 € de diferencia.
  ok('8.1 nadie llama ya al owner con la convención cableada',
    (app.match(/calculateCompoundGrowth\(/g) || []).length === 1,
    'sólo su propia declaración: ' + (app.match(/calculateCompoundGrowth\(/g) || []).length);
  ok('8.2 el guardado y la vista previa usan el MISMO owner que la pantalla',
    /const pr = _wsCompoundProjection\(_wsToolInputs\);/.test(app)
    && /const pr = _wsCompoundProjection\(inp\);/.test(app));
  ok('8.3 y lo guardado lleva su convención, para que reabrirlo no lo reinterprete',
    /convention: pr\.assumptions\.convention/.test(app)
    && /annualRatePct: pr\.assumptions\.annualRatePct/.test(app));
  ok('8.4 el capital inicial se guarda SEPARADO de las aportaciones',
    /initial: Math\.round\(pr\.initial\)/.test(app)
    && /contributedOnly: Math\.round\(pr\.contributed\)/.test(app));

  // ── [alto] UN RATIO, UN CONJUNTO ──────────────────────────────────────────
  const mixed = RE([{ buy: 240000, rent: 1250, expenses: 180 }, { rent: 900, expenses: 100 }]);
  ok('8.5 el yield agregado no mezcla un numerador de todos con un denominador de algunos',
    near(mixed.portfolioNetYield, (1250 - 180) * 12 / 240000 * 100, 0.01),
    JSON.stringify({ publicado: mixed.portfolioNetYield, correcto: (1250 - 180) * 12 / 240000 * 100 }));
  ok('8.6 …y declara a cuántos inmuebles cubre',
    mixed.yieldCoverage === 1 && mixed.count === 2 && mixed.yieldCoversAll === false);
  ok('8.7 `avgYield` es null sin base de coste (el `: 0` anulaba el arreglo de `_wsJrnPct`)',
    RE([{ rent: 900, expenses: 100 }]).avgYield === null,
    JSON.stringify(RE([{ rent: 900, expenses: 100 }]).avgYield));

  // ── [alto] UN ESCENARIO INCOMPLETO NO SE COMPARA ──────────────────────────
  ok('8.8 sin principal o sin plazo, la comparación de préstamo no se publica',
    /if \(bPrincipal == null \|\| bPrincipal <= 0 \|\| bYears == null \|\| bYears <= 0\)/.test(app)
    && /wsloan_cmp_incomplete/.test(app));
  ok('8.9 …porque heredar el seguro hacía creíble un escenario inexistente',
    (() => { const b = LOAN({ principal: '250000', rate: '3,5', years: '', insurance: '25' });
      return near(b.monthlyPayment, 25, 0.01); })(),
    'plazo vacío ⇒ cuota = sólo el seguro');

  // ── [alto] EL TEXTO PERSISTIDO NO PUEDE DEPENDER DEL IDIOMA ACTIVO ────────
  ok('8.10 la forma canónica se lee igual en los dos idiomas',
    [250000, 3.5, 1234.567, 0.125, 12500.75, -1500, 3.125].every(v => {
      const c = run('_wsCanonicalNumStr(' + v + ')');
      return run('_wsNum(' + JSON.stringify(c) + ')', ES) === v
          && run('_wsNum(' + JSON.stringify(c) + ')', EN) === v; }),
    JSON.stringify([250000, 3.5, 1234.567, 0.125, 3.125].map(v => {
      const c = run('_wsCanonicalNumStr(' + v + ')');
      return [c, run('_wsNum(' + JSON.stringify(c) + ')', ES), run('_wsNum(' + JSON.stringify(c) + ')', EN)]; })));
  ok('8.11 el caso de TRES decimales, que era el que seguía ambiguo, se desambigua',
    run('_wsCanonicalNumStr(1234.567)') === '1234.5670'
    && run('_wsNum("1234.5670")', ES) === 1234.567 && run('_wsNum("1234.5670")', EN) === 1234.567);
  ok('8.12 y el estado se canoniza al perder el foco, no al escribir',
    /const n = _wsNumOrNull\(raw\);/.test(app) && /el\.value = _wsCanonicalNumStr\(n\);/.test(app)
    && /if \(raw === ''\) return;/.test(app));

  // ── [alto] EL FORMULARIO DE OBJETIVOS TAMBIÉN PARSEA TOLERANTE ────────────
  // ── LA ASERCIÓN ES DE COMPORTAMIENTO, NO UN REGEX ─────────────────────────
  // La versión anterior era un regex NEGATIVO sobre la forma exacta de
  // `_wsgFormValues` (`/target: Number\(v\('target'\)\)/`). `_wsgCreate` —la función
  // que de verdad PERSISTE el objetivo— duplicaba la lectura con `val` en vez de
  // `v`, así que el gate no podía verla y declaraba cerrado un defecto vivo: una
  // meta de 250.000 € se guardaba como 250 €. Tercera vez en este fichero que un
  // assert mide una CADENA y no una CONDUCTA.
  // Ahora se EJECUTA el camino de creación sobre un formulario simulado, así que
  // sólo puede pasar si el objetivo guardado vale lo que el usuario escribió.
  ok('8.13 crear un objetivo guarda lo que el usuario escribió, no una lectura inglesa',
    (() => {
      const sb = { Math, Number, String, Object, Array, JSON, Date, console: { warn(){} } };
      vm.createContext(sb);
      sb.lang = 'es'; sb.t = k => k;
      // Un formulario REAL en miniatura: los mismos `data-wsg-form` y los valores
      // tal como los deja el `focusout` que los formatea.
      const fields = { type: 'wealth', name: 'Piso', target: '250.000', current: '10.000',
                       monthly: '1.500', year: '2032' };
      sb.document = {
        querySelector: () => ({ querySelector: sel => {
          const m = /data-wsg-form="([^"]+)"/.exec(sel);
          return (m && fields[m[1]] != null) ? { value: fields[m[1]] } : null;
        } }),
        // `_wsgCreate` repinta el contenedor al terminar; devolver null hace que se
        // salte esa rama sin tocar el DOM, que es lo que interesa aquí.
        getElementById: () => null,
      };
      let saved = null;
      sb._wsgPersist = g => { saved = g; };
      sb._wshReveal = () => {};
      sb._renderGoals = () => '';
      vm.runInContext('var _wsgPrefill = null;', sb);
      ['_wsNum', '_wsgFormValues', '_wsgCreate'].forEach(n => vm.runInContext(fnSrc(n), sb));
      vm.runInContext('_wsgCreate()', sb);
      return saved && saved.target === 250000 && saved.current === 10000
          && saved.monthly === 1500 && saved.targetYear === 2032;
    })(),
    'la meta guardada tiene que ser 250000, no 250 ni 0');
  ok('8.14 y los dos caminos leen el formulario por UN owner, no dos',
    /const v = _wsgFormValues\(root\);/.test(fnSrc('_wsgCreate'))
    && !/Number\(val\('target'\)\)/.test(app),
    'dos derivaciones de una decisión siempre divergen');
  // ── [medio] `formatBase(null)` ERA «0,00 €» ────────────────────────────────
  // El null de `target`/`remaining` llegaba a `Intl.NumberFormat.format`, que
  // coacciona a 0: el cero falso no se había eliminado, se había movido una capa.
  ok('8.15b un importe ausente se escribe con guion, no como 0,00',
    /const money = v => \(v == null \|\| !Number\.isFinite\(Number\(v\)\)\) \? '—' : formatBase\(v\);/.test(app)
    && /value: money\(prog\.target\)/.test(app) && /value: money\(prog\.remaining\)/.test(app));
  ok('8.15c y «tiene plazo» se deriva UNA vez, desde el motor',
    /const hasDate = prog\.hasDate === true;/.test(fnSrc('_wsgCardOutHtml'))
    && !/const hasDate = g\.targetYear && g\.targetYear > _wsgThisYear\(\);/.test(app));
  // ── EL PARQUE INSTALADO, SIN ADIVINAR ─────────────────────────────────────
  ok('8.15d lo guardado se canoniza sólo cuando NO es ambiguo entre idiomas',
    (() => {
      const sb = { Math, Number, String, Object, Array, JSON, isFinite, isNaN, parseFloat, console: { warn(){} } };
      vm.createContext(sb);
      vm.runInContext('var lang = "es";', sb);
      ['_wsNum', '_wsCanonicalNumStr', '_wsNumInLang', '_wsCanonicalizeInputs'].forEach(n => vm.runInContext(fnSrc(n), sb));
      const out = vm.runInContext('_wsCanonicalizeInputs(' + JSON.stringify({
        claro: '250000', coma: '3,5', mixto: '1.234,56', ambiguo: '250.000',
        ambiguo2: '1,234', texto: 'Piso centro' }) + ')', sb);
      return out.claro === '250000' && out.coma === '3.5' && out.mixto === '1.234,56'
        && out.ambiguo === '250.000' && out.ambiguo2 === '1,234' && out.texto === 'Piso centro'
        && vm.runInContext('lang', sb) === 'es';
    })(),
    'las ambiguas se dejan intactas y el idioma activo no se toca');
  ok('8.15e la canonización cubre también los valores enormes (1e21)',
    (() => { const c = run('_wsCanonicalNumStr(1e21)');
      return !/[eE]/.test(c) && run('_wsNum(' + JSON.stringify(c) + ')', ES) === 1e21
        && run('_wsNum(' + JSON.stringify(c) + ')', EN) === 1e21; })(),
    run('_wsCanonicalNumStr(1e21)'));

  // ── [medio] CEROS FALSOS QUE VOLVÍAN POR EL CAMINO DE GUARDADO ────────────
  ok('8.15 el presupuesto no persiste un 0 % donde dijo «no aplicable»',
    /saveRate: r\.saveRate == null \? null : Math\.round\(r\.saveRate\)/.test(app));
  ok('8.16 la etiqueta de cobros dice «no aplicable», no «0%»',
    /r\.porcentajeCobrado == null \? t\('wstool_bud_na'\)/.test(app));
  ok('8.17 y el mejor activo no se publica como «+null%»',
    /\(r\.bestName && r\.bestPct != null\)/.test(app));

  // ── [medio] `null` NO COMPITE EN UNA COMPARACIÓN ──────────────────────────
  const AP = rows => run('calculateAssetPrices(' + JSON.stringify(rows) + ')');
  ok('8.18 una operación sin rentabilidad calculable no gana el «peor»',
    (() => { const r = AP([{ assetName: 'REGALO', quantity: '10', buyPrice: '', sellPrice: '5' },
                           { assetName: 'REAL', quantity: '10', buyPrice: '100', sellPrice: '88' }]);
      return r.worst && r.worst.assetName === 'REAL' && r.unrankedCount === 1; })(),
    JSON.stringify(AP([{ assetName: 'REGALO', quantity: '10', buyPrice: '', sellPrice: '5' },
                       { assetName: 'REAL', quantity: '10', buyPrice: '100', sellPrice: '88' }]).worst));
  ok('8.19 su rentabilidad es null, no 0',
    AP([{ quantity: '10', buyPrice: '', sellPrice: '5' }]).list[0].returnPct === null);
  ok('8.20 y el ranking no la coloca como si rindiera cero',
    /closed\.filter\(x => x\.returnPct != null\)\.slice\(\)/.test(app));

  // ── [medio] EL DIARIO TENÍA LA MISMA ETIQUETA CON OTRA DEFINICIÓN ─────────
  const TJ = rows => run('calculateTradeJournal(' + JSON.stringify(rows) + ')');
  ok('8.21 «Rentabilidad media» significa lo MISMO en Diario y en Precios',
    (() => { const rows = [{ qty: '1', buy: '100000', sell: '102000' },
                           { qty: '1', buy: '1000', sell: '3000' }];
      const j = TJ(rows);
      const a = AP([{ quantity: '1', buyPrice: '100000', sellPrice: '102000' },
                    { quantity: '1', buyPrice: '1000', sellPrice: '3000' }]);
      return near(j.avgReturn, a.averageReturnPct, 0.01) && j.avgReturn < 10; })(),
    JSON.stringify([TJ([{ qty: '1', buy: '100000', sell: '102000' }, { qty: '1', buy: '1000', sell: '3000' }]).avgReturn,
                    AP([{ quantity: '1', buyPrice: '100000', sellPrice: '102000' },
                        { quantity: '1', buyPrice: '1000', sellPrice: '3000' }]).averageReturnPct]));
  ok('8.22 …y ya no es la media aritmética de porcentajes (que daba +101 %)',
    (() => { const j = TJ([{ qty: '1', buy: '100000', sell: '102000' }, { qty: '1', buy: '1000', sell: '3000' }]);
      return j.avgReturn != null && j.avgReturn < 10 && j.avgReturnBasis === 'pnl_over_invested'; })());
  ok('8.23 sin invertido es null, no 0',
    TJ([{ qty: '1', buy: '', sell: '100' }]).avgReturn === null);

  // ── [medio] FIRE INTERNO: LA TASA LA PONE EL USUARIO ─────────────────────
  ok('8.24 la plantilla FIRE ya no proyecta con un 5 % cableado',
    !/projectScenario\(cur, monthly, 0\.05, y\)/.test(app)
    && /_ws4FireYears\(cur, monthly, needed, annualRatePct\)/.test(app));
  ok('8.25 …ni asume una tasa de retirada del 4 % con un «× 25» implícito',
    !/\(v\.annualSpend \|\| 0\) \* 25/.test(app)
    && /const swr = _wsNumOrNull\(v\.withdrawalRatePct\);/.test(app));
  ok('8.26 sin tasa de retirada NO da número, igual que Objetivos',
    /ws4_read_fire_needsrate/.test(app));

  // ── [medio] LA CONCLUSIÓN DE ESCENARIOS NO DICTAMINA ─────────────────────
  ok('8.27 el umbral de 500 y el `stabKey` muerto han desaparecido',
    !/max\.monthly >= 500/.test(app) && !/s\.stabKey === 'balanced'/.test(app));
  ok('8.28 …y la conclusión dice la consecuencia calculada',
    /wsb_concl_spread:\s*'Aportar \{m\} al mes/.test(app));

  // ── LAS PREFERENCIAS SE FUSIONAN POR REVISIÓN ────────────────────────────
  ok('8.29 el pull de preferencias compara revisión en vez de sobrescribir',
    /if \(!\(remoteRev > localRev\)\) continue;/.test(app)
    && /_WS_PREF_REV_PREFIX/.test(app));
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
