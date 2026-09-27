/**
 * AURIX · ESTADO DE MERCADO — LA VERDAD, O NADA
 * ════════════════════════════════════════════════════════════════════════════
 * INCIDENCIA QUE LO ORIGINA: el Dashboard mostró «Mercado abierto» para ACCIONES
 * y para FONDOS/ETF un DOMINGO. Aurix no puede mentir sobre el estado de un
 * mercado, así que este harness existe para que esa mentira no pueda volver.
 *
 * Lo que había era una ventana de minutos sobre el reloj LOCAL del usuario, sin
 * día de la semana y sin festivos, cableada a «NYSE en hora de España» y aplicada
 * a cualquier acción o ETF. Tres afirmaciones falsas en una.
 *
 * Aquí se EJECUTA la función real contra instantes FIJOS —no contra el reloj—, y
 * se exige lo siguiente:
 *   · fin de semana ⇒ cerrado, siempre;
 *   · la ventana se mide en la zona del MERCADO, no en la del usuario;
 *   · los festivos del NYSE están computados, incluido el Viernes Santo;
 *   · las medias sesiones cierran a las 13:00;
 *   · cripto es 24/7;
 *   · un activo que no se puede atribuir a un mercado NO publica estado;
 *   · una categoría MIXTA no afirma un estado absoluto.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
let pass = 0, fail = 0;
function ok(n, c, info) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } }
function section(s) { console.log('\n' + s); }
function fnSrc(name) {
  const s = 'function ' + name + '('; const i = app.indexOf(s);
  if (i < 0) throw new Error('falta ' + name);
  let d = 0, q = null, j = app.indexOf('{', i);
  for (let k = j; k < app.length; k++) {
    const ch = app[k];
    if (q) { if (ch === '\\') { k++; continue; } if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
    if (ch === '{') d++; else if (ch === '}') { d--; if (!d) return app.slice(i, k + 1); }
  }
  throw new Error('sin cerrar ' + name);
}
function konstSrc(name) {
  const m = new RegExp('const ' + name + ' =').exec(app);
  if (!m) throw new Error('falta const ' + name);
  let i = m.index, d = 0, q = null;
  for (let k = app.indexOf('=', i); k < app.length; k++) {
    const ch = app[k];
    if (q) { if (ch === '\\') { k++; continue; } if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
    if ('([{'.includes(ch)) d++; else if (')]}'.includes(ch)) d--;
    else if (ch === ';' && d === 0) return app.slice(i, k + 1);
  }
  throw new Error('sin cerrar const ' + name);
}
const sb = { console, Math, Number, String, Object, Date, Intl, isFinite, isNaN, RegExp, Array };
vm.createContext(sb);
['_AURIX_US_MARKET_TZ', '_AURIX_NON_US_SUFFIX'].forEach(n => vm.runInContext(konstSrc(n), sb));
['_aurixExchangeWallClock', '_aurixEasterMonthDay', '_aurixCivilWeekday', '_aurixNthWeekdayOfMonth',
 '_aurixLastWeekdayOfMonth', '_aurixObservedFixed', '_aurixUsMarketHolidayKind', '_aurixUsMarketSession',
 '_aurixAssetMarketKind', 'getMarketStatus', '_aurixCategoryMarketStatus'].forEach(n => vm.runInContext(fnSrc(n), sb));
const R = e => vm.runInContext(e, sb);
// Un instante se expresa en UTC para que la prueba no dependa de la zona de la máquina.
const at = iso => `_aurixUsMarketSession(new Date(${JSON.stringify(iso)}))`;

// ════════════════════════════════════════════════════════════════════════════
section('1 · La incidencia reportada: un domingo NO es un día de mercado');
// ════════════════════════════════════════════════════════════════════════════
{
  // 2026-09-27 fue DOMINGO. 21:01 en España son 15:01 en Nueva York: justo dentro
  // de la ventana vieja Y dentro de la nueva, así que sólo el día lo distingue.
  ok('1.1 domingo a las 15:01 de Nueva York ⇒ cerrado', R(at('2026-09-27T19:01:00Z')) === 'closed', R(at('2026-09-27T19:01:00Z')));
  ok('1.2 sábado a media sesión ⇒ cerrado', R(at('2026-09-26T17:00:00Z')) === 'closed', R(at('2026-09-26T17:00:00Z')));
  // Y el mismo minuto de reloj, un día laborable, SÍ abre: la prueba discrimina.
  ok('1.3 lunes a las 15:01 de Nueva York ⇒ abierto', R(at('2026-09-28T19:01:00Z')) === 'open', R(at('2026-09-28T19:01:00Z')));
}

// ════════════════════════════════════════════════════════════════════════════
section('2 · La ventana se mide en la zona del MERCADO, no del usuario');
// ════════════════════════════════════════════════════════════════════════════
{
  // 13:29 UTC = 09:29 en Nueva York (horario de verano): aún cerrado por un minuto.
  ok('2.1 un minuto antes de la apertura ⇒ cerrado', R(at('2026-09-28T13:29:00Z')) === 'closed');
  ok('2.2 en el minuto de apertura ⇒ abierto', R(at('2026-09-28T13:30:00Z')) === 'open');
  ok('2.3 en el minuto de cierre ⇒ cerrado', R(at('2026-09-28T20:00:00Z')) === 'closed');
  ok('2.4 un minuto antes del cierre ⇒ abierto', R(at('2026-09-28T19:59:00Z')) === 'open');
  // INVIERNO: el mismo reloj UTC cae una hora distinta en Nueva York. Si alguien
  // volviera a cablear un desplazamiento fijo, esto se pondría rojo.
  ok('2.5 en enero, 14:30 UTC son 09:30 en Nueva York ⇒ abierto', R(at('2027-01-04T14:30:00Z')) === 'open', R(at('2027-01-04T14:30:00Z')));
  ok('2.6 …y 13:30 UTC son 08:30, todavía cerrado', R(at('2027-01-04T13:30:00Z')) === 'closed', R(at('2027-01-04T13:30:00Z')));
}

// ════════════════════════════════════════════════════════════════════════════
section('3 · Los festivos están computados, no listados a mano');
// ════════════════════════════════════════════════════════════════════════════
{
  const hol = (y, m, d) => R(`_aurixUsMarketHolidayKind(${y}, ${m}, ${d})`);
  ok('3.1 Año Nuevo', hol(2027, 1, 1) === 'full', String(hol(2027, 1, 1)));
  ok('3.2 MLK es el tercer lunes de enero', hol(2027, 1, 18) === 'full', String(hol(2027, 1, 18)));
  ok('3.3 Washington es el tercer lunes de febrero', hol(2027, 2, 15) === 'full', String(hol(2027, 2, 15)));
  // Pascua 2027 = 28 de marzo ⇒ Viernes Santo = 26 de marzo. Es el festivo que
  // obliga a computar, y por eso el calendario no caduca.
  ok('3.4 Viernes Santo sale de Pascua', hol(2027, 3, 26) === 'full', String(hol(2027, 3, 26)));
  ok('3.5 Memorial es el último lunes de mayo', hol(2027, 5, 31) === 'full', String(hol(2027, 5, 31)));
  ok('3.6 Juneteenth', hol(2027, 6, 18) === 'full' || hol(2027, 6, 19) === 'full', JSON.stringify([hol(2027,6,18), hol(2027,6,19)]));
  ok('3.7 Acción de Gracias es el cuarto jueves de noviembre', hol(2027, 11, 25) === 'full', String(hol(2027, 11, 25)));
  ok('3.8 …y el día siguiente es MEDIA sesión', hol(2027, 11, 26) === 'half', String(hol(2027, 11, 26)));
  ok('3.9 un martes cualquiera no es festivo', hol(2027, 10, 12) === null, String(hol(2027, 10, 12)));
  // La observancia: 4 de julio de 2026 cae sábado ⇒ se observa el viernes 3.
  ok('3.10 un festivo en sábado se observa el viernes', hol(2026, 7, 3) === 'full', String(hol(2026, 7, 3)));
  // Y el efecto en la sesión: un festivo pleno cierra aunque sea laborable.
  ok('3.11 el festivo cierra la sesión', R(at('2027-01-01T16:00:00Z')) === 'closed', R(at('2027-01-01T16:00:00Z')));
  // Media sesión: 26/11/2027 cierra a las 13:00 de Nueva York (18:00 UTC).
  ok('3.12 la media sesión está abierta a las 12:59', R(at('2027-11-26T17:59:00Z')) === 'open', R(at('2027-11-26T17:59:00Z')));
  ok('3.13 …y cerrada a las 13:00', R(at('2027-11-26T18:00:00Z')) === 'closed', R(at('2027-11-26T18:00:00Z')));
}

// ════════════════════════════════════════════════════════════════════════════
section('4 · Sin mercado atribuido no se publica estado');
// ════════════════════════════════════════════════════════════════════════════
{
  const kind = o => R('_aurixAssetMarketKind(' + JSON.stringify(o) + ')');
  ok('4.1 cripto es cripto', kind({ type: 'crypto', ticker: 'BTC' }) === 'crypto');
  ok('4.2 un ticker sin sufijo es estadounidense', kind({ type: 'stock', marketSymbol: 'AAPL' }) === 'us');
  ok('4.3 una clase de acción NO es un sufijo de mercado', kind({ type: 'stock', marketSymbol: 'BRK.B' }) === 'us', String(kind({ type: 'stock', marketSymbol: 'BRK.B' })));
  ok('4.4 una cotización de Londres es OTRO mercado', kind({ type: 'etf', marketSymbol: 'IWDA.L' }) === 'other');
  ok('4.5 …y una de Fráncfort también', kind({ type: 'etf', marketSymbol: 'EUNL.DE' }) === 'other');
  ok('4.6 sin símbolo no hay mercado', kind({ type: 'stock', marketSymbol: '' }) === null);
  ok('4.7 un metal o una casa no tienen sesión', kind({ type: 'metal' }) === null && kind({ type: 'real_estate' }) === null);
  // Y el efecto: `getMarketStatus` NO afirma sesión de un mercado que no atribuye.
  const gms = (t, a) => R('getMarketStatus(' + JSON.stringify(t) + (a ? ', ' + JSON.stringify(a) : '') + ')');
  ok('4.8 un ETF europeo no recibe el estado de Nueva York', gms('etf', { type: 'etf', marketSymbol: 'IWDA.L' }) === null, String(gms('etf', { type: 'etf', marketSymbol: 'IWDA.L' })));
  ok('4.9 cripto sigue siendo 24/7', gms('crypto') === '24/7');
  ok('4.10 sin activo, una acción no publica estado', gms('stock') === null, String(gms('stock')));
  ok('4.11 con activo estadounidense sí publica uno de los dos', ['open','closed'].indexOf(gms('stock', { type: 'stock', marketSymbol: 'AAPL' })) !== -1);
}

// ════════════════════════════════════════════════════════════════════════════
section('5 · Una categoría MIXTA no afirma nada');
// ════════════════════════════════════════════════════════════════════════════
{
  const cat = (t, list) => R('_aurixCategoryMarketStatus(' + JSON.stringify(t) + ', ' + JSON.stringify(list) + ')');
  const US = { type: 'stock', marketSymbol: 'AAPL' };
  const UK = { type: 'stock', marketSymbol: 'VOD.L' };
  const SIN = { type: 'stock', marketSymbol: '' };
  ok('5.1 todas estadounidenses ⇒ hay estado', ['open','closed'].indexOf(cat('stock', [US, { type:'stock', marketSymbol:'MSFT' }])) !== -1, String(cat('stock', [US])));
  ok('5.2 una de Londres dentro ⇒ NO se afirma nada', cat('stock', [US, UK]) === null, String(cat('stock', [US, UK])));
  ok('5.3 una sin atribuir dentro ⇒ tampoco', cat('stock', [US, SIN]) === null, String(cat('stock', [US, SIN])));
  ok('5.4 todas de Londres ⇒ tampoco: ese mercado no está modelado', cat('stock', [UK]) === null, String(cat('stock', [UK])));
  ok('5.5 una categoría vacía no habla', cat('stock', []) === null, String(cat('stock', [])));
  ok('5.6 cripto es 24/7 sin depender de la lista', cat('crypto', []) === '24/7');
  ok('5.7 los ETF se miden por su propio tipo, no por las acciones',
    cat('etf', [{ type: 'etf', marketSymbol: 'IWDA.L' }, US]) === null, String(cat('etf', [{ type:'etf', marketSymbol:'IWDA.L' }, US])));
  // Y el efecto en la superficie: si deja de ser afirmable, el badge se RETIRA.
  ok('5.8 un badge que deja de ser afirmable se retira del DOM',
    /if \(stEl && !st\) stEl\.remove\(\);/.test(app));
}

// ════════════════════════════════════════════════════════════════════════════
section('6 · Lo que ya no queda en el código');
// ════════════════════════════════════════════════════════════════════════════
{
  const src = fnSrc('getMarketStatus') + fnSrc('_aurixUsMarketSession');
  ok('6.1 no queda una ventana cableada a la hora de España',
    !/15 \* 60 \+ 30/.test(src) && !/22 \* 60/.test(src), src.slice(0, 120));
  ok('6.2 la sesión no lee el reloj local con `getHours`', !/getHours\(\)/.test(src));
  ok('6.3 la zona del mercado está declarada, no supuesta',
    /_AURIX_US_MARKET_TZ/.test(fnSrc('_aurixUsMarketSession')) && /America\/New_York/.test(konstSrc('_AURIX_US_MARKET_TZ')));
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
