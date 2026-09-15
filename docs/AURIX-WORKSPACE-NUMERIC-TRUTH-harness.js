'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-WORKSPACE-NUMERIC-TRUTH-harness — SPEC WORKSPACE COMPLETION · §4 / §B-A
// ════════════════════════════════════════════════════════════════════════════
// EL DEFECTO QUE ESTE GATE FIJA, y estaba VIVO en una herramienta PREMIUM
// PUBLICADA (`loan_simulation`):
//
//   Los handlers de Workspace guardan `el.value` CRUDO desde WS.15A —es lo que
//   permite borrar un campo—, así que los motores reciben TEXTO. Pero `calculateLoan`
//   lo leía con `Number()`, que no entiende el formato español:
//     · tipo «3,5» ⇒ NaN ⇒ 0 ⇒ la rama SIN INTERÉS (P/n). 250.000 a 30 años salían
//       694,44 al mes en vez de 1.122,61: un 38 % menos, presentado como su cuota.
//     · principal «250.000» ⇒ Number lo lee 250 ⇒ cuota de 1,12.
//   WS.15A había dado el parseo tolerante a los importes y a los años de compound,
//   pero la TASA no lo tenía en NINGUNO de los tres motores (compound, loan,
//   scenario). Mismo olvido, tres sitios.
//
// Y el segundo, que apareció al corregir el primero: `_wsNum` decidía por IDIOMA y
// sólo por idioma, así que en español «3.5» se leía 35 — un error de 10× SILENCIOSO
// en el campo más sensible que hay aquí, y frecuente porque muchos teclados
// decimales de Android emiten PUNTO aunque el usuario esté en español.
//
// LO QUE ES REAL AQUÍ: `_wsNum`, `_wsNumOrNull`, `calculateLoan`,
// `calculateCompoundGrowth` y `projectScenario`, ejecutados sobre los bytes de
// app.js. Nada stubeado: la lección de `formatBase` dice que un gate que stubea la
// integración que certifica no es evidencia.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c,info){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(info?'  ['+info+']':''));} }
const near = (a,b,tol) => Number.isFinite(a) && Math.abs(a-b) <= (tol==null?0.01:tol);
const FNS = ['_wsNum','_wsNumOrNull','calculateLoan','calculateCompoundGrowth','projectScenario'];
function ctx(langCode) {
  const sb = { Math, Number, String, isFinite, isNaN, parseFloat, JSON, Array, Object,
               console: { warn(){}, log(){} } };
  vm.createContext(sb);
  sb.lang = langCode;
  sb.t = k => k;
  FNS.forEach(n => vm.runInContext(fnSrc(n), sb));
  return sb;
}
const ES = ctx('es'), EN = ctx('en');
const run = (e, c) => vm.runInContext(e, c);
const num = (c, v) => run('_wsNum(' + JSON.stringify(v) + ')', c);
const orNull = (c, v) => run('_wsNumOrNull(' + JSON.stringify(v) + ')', c);
const loan = (c, o) => run('calculateLoan(' + JSON.stringify(o) + ')', c);
const comp = (c, init, m, retTxt, yrs) =>
  run('calculateCompoundGrowth(' + JSON.stringify(init) + ',' + JSON.stringify(m)
      + ', _wsNum(' + JSON.stringify(retTxt) + ')/100, ' + JSON.stringify(yrs) + ')', c);

console.log('AURIX-WORKSPACE-NUMERIC-TRUTH — SPEC WORKSPACE COMPLETION · el número que el usuario escribe\n');

// ════════════════════════════════════════════════════════════════════════════
// 1 · LA MISMA CIFRA, ESCRITA COMO SEA, VALE LO MISMO
// ════════════════════════════════════════════════════════════════════════════
console.log('1 · Un decimal es un decimal en los dos idiomas:');
{
  ok('1.1 «3,5» vale 3,5 en ES y en EN', num(ES, '3,5') === 3.5 && num(EN, '3,5') === 3.5,
    JSON.stringify([num(ES, '3,5'), num(EN, '3,5')]));
  ok('1.2 «3.5» vale 3,5 en ES y en EN (el defecto de 10× que había en ES)',
    num(ES, '3.5') === 3.5 && num(EN, '3.5') === 3.5,
    JSON.stringify([num(ES, '3.5'), num(EN, '3.5')]));
  ok('1.3 «0,5» y «,5» y «.5» son medio, no cinco ni cero',
    num(ES, '0,5') === 0.5 && num(ES, ',5') === 0.5 && num(ES, '.5') === 0.5
    && num(EN, '0.5') === 0.5 && num(EN, '.5') === 0.5 && num(EN, ',5') === 0.5);
  // Y la agrupación de miles sigue leyéndose como miles en su idioma.
  ok('1.4 «250.000» son doscientos cincuenta mil en ES', num(ES, '250.000') === 250000);
  ok('1.5 «250,000» son doscientos cincuenta mil en EN', num(EN, '250,000') === 250000);
  ok('1.6 un separador REPETIDO siempre es agrupación',
    num(ES, '1.234.567') === 1234567 && num(EN, '1,234,567') === 1234567);
  ok('1.7 con los dos separadores manda la convención del idioma',
    near(num(ES, '1.234,56'), 1234.56) && near(num(EN, '1,234.56'), 1234.56),
    JSON.stringify([num(ES, '1.234,56'), num(EN, '1,234.56')]));
  ok('1.8 los negativos válidos se conservan', num(ES, '-1500') === -1500 && num(EN, '-1500') === -1500);
  ok('1.9 basura y vacío dan 0 en el parser de CÁLCULO, nunca NaN',
    [ '', '-', 'abc', '   ' ].every(v => num(ES, v) === 0 && num(EN, v) === 0));
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · VACÍO NO ES CERO
// ════════════════════════════════════════════════════════════════════════════
console.log('\n2 · Vacío y desconocido se distinguen de un cero declarado:');
{
  ok('2.1 el campo vacío es null, no 0', orNull(ES, '') === null && orNull(ES, '   ') === null);
  ok('2.2 un cero ESCRITO por el usuario es 0', orNull(ES, '0') === 0 && orNull(EN, '0') === 0);
  ok('2.3 texto sin dígitos es null, no 0', orNull(ES, 'abc') === null && orNull(ES, '-') === null);
  ok('2.4 y el parser de cálculo sigue dando 0, que es lo que las sumas esperan',
    num(ES, '') === 0 && orNull(ES, '') === null);
  ok('2.5 un número real pasa por los dos igual',
    orNull(ES, '1.234,56') === num(ES, '1.234,56'));
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · PRÉSTAMO — LA CUOTA NO DEPENDE DE CÓMO SE TECLEE EL TIPO
// ════════════════════════════════════════════════════════════════════════════
console.log('\n3 · Préstamo 250.000 a 30 años al 3,5 %:');
{
  const EXPECTED = 1122.61;   // amortización francesa P·r/(1−(1+r)⁻ⁿ), r = 3,5/12/100
  const variants = [
    ['ES', ES, { principal: '250000',  rate: '3,5', years: '30' }],
    ['ES', ES, { principal: '250000',  rate: '3.5', years: '30' }],
    ['ES', ES, { principal: '250.000', rate: '3,5', years: '30' }],
    ['EN', EN, { principal: '250000',  rate: '3.5', years: '30' }],
    ['EN', EN, { principal: '250000',  rate: '3,5', years: '30' }],
    ['EN', EN, { principal: '250,000', rate: '3.5', years: '30' }],
  ];
  ok('3.1 las seis grafías del mismo préstamo dan la MISMA cuota',
    variants.every(([, c, o]) => near(loan(c, o).monthlyPayment, EXPECTED, 0.01)),
    JSON.stringify(variants.map(([l, c, o]) => l + ':' + loan(c, o).monthlyPayment.toFixed(2))));
  // La rama sin interés sigue existiendo y SÓLO se alcanza con un tipo REAL de 0.
  ok('3.2 el tipo 0 da P/n, y ya no se llega ahí por un error de parseo',
    near(loan(ES, { principal: '250000', rate: '0', years: '30' }).monthlyPayment, 250000 / 360, 0.01)
    && !near(loan(ES, { principal: '250000', rate: '3,5', years: '30' }).monthlyPayment, 250000 / 360, 1),
    String(loan(ES, { principal: '250000', rate: '0', years: '30' }).monthlyPayment));
  ok('3.3 inputs vacíos dan 0 sin NaN en ningún campo publicado',
    (() => { const r = loan(ES, { principal: '', rate: '', years: '' });
      return Object.keys(r).every(k => typeof r[k] !== 'number' || Number.isFinite(r[k])); })(),
    JSON.stringify(loan(ES, { principal: '', rate: '', years: '' })));
  // RECONCILIACIÓN: el total de la cuota base tiene que cuadrar con principal + intereses.
  ok('3.4 principal + intereses reconcilian con el total de las cuotas base',
    (() => { const r = loan(ES, { principal: '250000', rate: '3,5', years: '30' });
      const base = r.monthlyPayment - (r.monthlyInsurance || 0);
      return near(base * 360, 250000 + r.totalInterest, 0.5); })(),
    JSON.stringify((() => { const r = loan(ES, { principal: '250000', rate: '3,5', years: '30' });
      return { base: r.monthlyPayment, interest: r.totalInterest }; })()));
  ok('3.5 el seguro NO se mete dentro de los intereses',
    (() => { const a = loan(ES, { principal: '250000', rate: '3,5', years: '30' });
      const b = loan(ES, { principal: '250000', rate: '3,5', years: '30', insurance: '30' });
      return near(a.totalInterest, b.totalInterest, 0.01)
        && near(b.monthlyPayment - a.monthlyPayment, 30, 0.01); })(),
    JSON.stringify([loan(ES, { principal: '250000', rate: '3,5', years: '30' }).totalInterest,
                    loan(ES, { principal: '250000', rate: '3,5', years: '30', insurance: '30' }).totalInterest]));
}

// ════════════════════════════════════════════════════════════════════════════
// 4 · INTERÉS COMPUESTO — LAS REGRESIONES YA CERTIFICADAS, INTACTAS
// ════════════════════════════════════════════════════════════════════════════
console.log('\n4 · Interés compuesto (valores certificados en WORKSPACE-LAUNCH-V1):');
{
  ok('4.1 1.000 + 300/mes al 6 % en 20 años ⇒ 141.922,47',
    near(comp(ES, '1000', '300', '6', '20').final, 141922.47, 0.01),
    String(comp(ES, '1000', '300', '6', '20').final));
  ok('4.2 …y lo mismo en inglés', near(comp(EN, '1000', '300', '6', '20').final, 141922.47, 0.01));
  ok('4.3 el aportado es exacto y no incluye crecimiento: 73.000',
    comp(ES, '1000', '300', '6', '20').contributed === 73000);
  ok('4.4 tasa 0 ⇒ 37.000 aportados sin crecimiento inventado',
    (() => { const r = comp(ES, '1000', '300', '0', '10');
      return r.contributed === 37000 && near(r.final, 37000, 0.01) && near(r.interest, 0, 0.01); })(),
    JSON.stringify(comp(ES, '1000', '300', '0', '10')).slice(0, 90));
  ok('4.5 horizonte 0 ⇒ el capital inicial, ni más ni menos',
    near(comp(ES, '1000', '300', '6', '0').final, 1000, 0.01));
  ok('4.6 una tasa tecleada «6,5» ya no vale 0 ni 65',
    (() => { const a = comp(ES, '1000', '300', '6,5', '20').final;
      const b = comp(ES, '1000', '300', '6.5', '20').final;
      return near(a, b, 0.01) && a > 141922.47 && a < 200000; })(),
    JSON.stringify([comp(ES, '1000', '300', '6,5', '20').final, comp(ES, '1000', '300', '6.5', '20').final]));
  ok('4.7 basura ⇒ 0 sin NaN en ninguna salida',
    (() => { const r = comp(ES, 'abc', 'xyz', 'nope', '??');
      return Number.isFinite(r.final) && Number.isFinite(r.contributed) && Number.isFinite(r.interest); })());
  // SEPARACIÓN DE COMPONENTES (§B): inicial, aportado y crecimiento no se mezclan.
  ok('4.8 inicial + aportaciones + crecimiento = valor final',
    (() => { const r = comp(ES, '1000', '300', '6', '20');
      return near(r.contributed + r.interest, r.final, 0.01); })());
}

// ════════════════════════════════════════════════════════════════════════════
// 5 · ESCENARIOS — EL TERCER MOTOR TENÍA EL MISMO DEFECTO
// ════════════════════════════════════════════════════════════════════════════
console.log('\n5 · Escenarios comparten el parseo, no una segunda verdad:');
{
  const proj = (c, base, m, retTxt, yrs) =>
    run('projectScenario(' + JSON.stringify(base) + ',' + JSON.stringify(m)
        + ', _wsNum(' + JSON.stringify(retTxt) + ')/100, ' + JSON.stringify(yrs) + ')', c);
  ok('5.1 una tasa tecleada con coma ya no proyecta como 0 %',
    (() => { const a = proj(ES, '100000', '500', '7,5', '10').projected;
      const z = proj(ES, '100000', '500', '0', '10').projected;
      return a > z + 1000; })(),
    JSON.stringify([proj(ES, '100000', '500', '7,5', '10').projected,
                    proj(ES, '100000', '500', '0', '10').projected]));
  ok('5.2 las dos grafías de la misma tasa proyectan igual',
    near(proj(ES, '100000', '500', '7,5', '10').projected,
         proj(ES, '100000', '500', '7.5', '10').projected, 0.01));
  ok('5.3 tasa 0 ⇒ base + aportaciones, sin crecimiento inventado',
    near(proj(ES, '100000', '500', '0', '10').projected, 100000 + 500 * 120, 0.01),
    String(proj(ES, '100000', '500', '0', '10').projected));
  ok('5.4 horizonte 0 ⇒ la base',
    near(proj(ES, '100000', '500', '7,5', '0').projected, 100000, 0.01));
  ok('5.5 dos escenarios IDÉNTICOS proyectan idéntico (comparación sin ruido)',
    proj(ES, '100000', '500', '6', '10').projected === proj(ES, '100000', '500', '6', '10').projected);
  ok('5.6 base 0 no produce NaN ni infinito',
    Number.isFinite(proj(ES, '0', '500', '6', '10').projected));
}

// ════════════════════════════════════════════════════════════════════════════
// 6 · LA UNIDAD DEL CAMPO NO MIENTE SOBRE LA MONEDA
// ════════════════════════════════════════════════════════════════════════════
console.log('\n6 · Moneda coherente entre el campo y el resultado:');
{
  const sb = { Math, Number, String, JSON, console: { warn(){} } };
  vm.createContext(sb);
  sb._AURIX_CCY_GLYPH = { EUR: '€', USD: 'US$' };
  sb.getCurrencySymbol = c => sb._AURIX_CCY_GLYPH[c] || '€';
  sb.baseCurrency = 'USD';
  vm.runInContext(fnSrc('_wsFieldUnit'), sb);
  vm.runInContext(fnSrc('_wsToolCcy'), sb);
  ok('6.1 un campo declarado en «€» se pinta en la divisa BASE del usuario',
    vm.runInContext('_wsFieldUnit("€")', sb) === 'US$',
    vm.runInContext('_wsFieldUnit("€")', sb));
  ok('6.2 una unidad que no es moneda no se toca',
    vm.runInContext('_wsFieldUnit("%")', sb) === '%'
    && vm.runInContext('_wsFieldUnit("años")', sb) === 'años'
    && vm.runInContext('_wsFieldUnit("")', sb) === '');
  sb.baseCurrency = 'EUR';
  ok('6.3 en euros sigue siendo «€», sin mapa nuevo',
    vm.runInContext('_wsFieldUnit("€")', sb) === '€');
  // Y NO queda ningún literal € en los sitios de render de unidad de Workspace.
  ok('6.4 ningún render de unidad de campo conserva un «€» hardcodeado',
    !/ws4-field-unit">€</.test(app),
    (app.match(/ws4-field-unit">[^$][^<]{0,4}</g) || []).slice(0, 4).join(' '));
  ok('6.5 y todos pasan por el owner único',
    (app.match(/ws4-field-unit">\$\{esc\(_wsFieldUnit\(/g) || []).length
      === (app.match(/class="ws4-field-unit"/g) || []).length,
    JSON.stringify({ through: (app.match(/ws4-field-unit">\$\{esc\(_wsFieldUnit\(/g) || []).length,
                     total: (app.match(/class="ws4-field-unit"/g) || []).length }));
}

// ════════════════════════════════════════════════════════════════════════════
// 7 · EL ESTADO DE EDICIÓN SIGUE SIENDO TEXTO (se puede borrar un campo)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n7 · Ningún handler vuelve a coaccionar el valor en cada tecla:');
{
  // WS.15A: el valor CRUDO se guarda; el número se deriva al calcular. Si un
  // handler vuelve a `_wsNum(el.value)`, borrar el último dígito escribe un CERO
  // REAL en el estado y el campo reaparece con «0» — el defecto que §4 describe.
  const handlers = ['_wsToolOnInput', '_ws4OnInput', '_wsgOnInput', '_wsJrnOnInput',
                    '_wsReOnInput', '_wsRecvOnInput', '_wsApOnInput', '_wsLoanCmpInput'];
  const coercing = handlers.filter(h => /=\s*_wsNum\(el\.value\)/.test(fnSrc(h)));
  ok('7.1 los ocho handlers guardan el valor crudo en edición', coercing.length === 0,
    JSON.stringify(coercing));
  ok('7.2 y todos escriben `el.value`, no un número derivado',
    handlers.every(h => /=\s*el\.value/.test(fnSrc(h))),
    JSON.stringify(handlers.filter(h => !/=\s*el\.value/.test(fnSrc(h)))));
  ok('7.3 los tres motores leen con el parser tolerante, no con Number()',
    !/const P = Math\.max\(0, Number\(o\.principal\)/.test(app)
    && !/const r    = \(Number\(annualReturn\) \|\| 0\) \/ 12;/.test(app));
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
