#!/usr/bin/env node
/**
 * AURIX · EL HISTORIAL TIENE QUE SOBREVIVIR AL ARRANQUE
 * ════════════════════════════════════════════════════════════════════════════
 * EL DEFECTO QUE ESTE HARNESS EXISTE PARA QUE NO VUELVA
 *
 * `let portfolioHistory = loadHistory();` y `let categoryHistory =
 * loadCategoryHistory();` se ejecutan a nivel de módulo MUY PRONTO. Las dos
 * cargas terminan llamando a `_aurixFilterAfterEpoch` → `_aurixPortfolioEpoch`,
 * y esa función leía `_aurixRemotePortfolioEpochMs`, una `let` declarada MILES
 * DE LÍNEAS DESPUÉS. Leer una `let` antes de su inicialización no da `undefined`:
 * lanza `ReferenceError` (zona muerta temporal). Y cada cargador tiene su propio
 * `catch { return []; }` —puesto ahí para un JSON corrupto—, así que el error se
 * TRAGABA y las dos series arrancaban VACÍAS en cada arranque.
 *
 * Y NO ERA COSMÉTICO: `recordSnapshot()` compone `[...portfolioHistory, punto]`
 * y luego `saveHistory()`. Con la serie viva vacía, el primer refresco de precios
 * PERSISTÍA un punto encima de toda la historia local. Medido en sandbox con 43
 * puntos sembrados: 43 en disco → arranque → un snapshot → 1 en disco.
 *
 * POR QUÉ SE PRUEBA ASÍ, y no con un regex. Un assert que dijera «no leas la
 * variable directamente» se puede satisfacer sin arreglar nada y se rompe con
 * cualquier refactor inocente. Aquí se REPRODUCE EL PELIGRO: se ejecutan las
 * funciones REALES del bundle en un módulo donde la `let` se declara DESPUÉS del
 * punto de carga, exactamente como en app.js. Si alguien devuelve la lectura
 * directa, este harness falla con el mismo síntoma que el usuario vio.
 * Nada se stubea de lo que se certifica: `loadHistory`, `loadCategoryHistory`,
 * `_aurixFilterAfterEpoch`, `_aurixPortfolioEpoch`, `_aurixLocalPortfolioEpoch`
 * y `_aurixRemoteEpochMsSafe` son el código desplegado, recortado del fichero.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
let pass = 0; const fails = [];
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); }
  else { fails.push(n + (info ? '  [' + info + ']' : '')); console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };

function fnSrc(name) {
  const sig = 'function ' + name + '(';
  const i = app.indexOf(sig);
  if (i < 0) throw new Error('missing ' + name);
  let d = 0, started = false;
  for (let k = i; k < app.length; k++) {
    if (app[k] === '{') { d++; started = true; }
    else if (app[k] === '}') { d--; if (started && !d) return app.slice(i, k + 1); }
  }
  throw new Error('unbalanced ' + name);
}

console.log('AURIX · HISTORIAL vs ZONA MUERTA TEMPORAL DEL EPOCH\n');

// 43 puntos, como el fixture con el que se midió el defecto.
const DAY = 864e5, now = Date.now();
const HIST = [], CATS = [];
for (let i = 42; i >= 0; i--) {
  HIST.push({ ts: now - i * DAY, value: 1000 + i });
  CATS.push({ ts: now - i * DAY, total: 1000 + i, crypto: 500, stock: 0, etf: 0, fund: 0,
              metal: 0, real_estate: 0, liquidity: 500 + i, other: 0 });
}
const store = { portfolio_history: JSON.stringify(HIST), category_history: JSON.stringify(CATS) };
const localStorageStub = {
  getItem: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
};

// EL MÓDULO DE PRUEBA REPRODUCE EL ORDEN REAL: primero se CARGA, y sólo después
// se declara la `let` del epoch remoto — que es la trampa exacta de app.js.
const src = `
  const PORTFOLIO_EPOCH_KEY = 'aurix_portfolio_epoch';
  ${fnSrc('_aurixLocalPortfolioEpoch')}
  ${fnSrc('_aurixRemoteEpochMsSafe')}
  ${fnSrc('_aurixPortfolioEpoch')}
  ${fnSrc('_aurixFilterAfterEpoch')}
  ${fnSrc('loadHistory')}
  ${fnSrc('loadCategoryHistory')}
  const HISTORY_KEY = 'portfolio_history';
  const CATEGORY_HISTORY_KEY = 'category_history';
  // ── EL PUNTO DE CARGA, ANTES DE LA DECLARACIÓN ───────────────────────────
  let bootHist = [], bootCats = [], bootErr = null;
  try { bootHist = loadHistory(); bootCats = loadCategoryHistory(); }
  catch (e) { bootErr = String(e); }
  // …y AHORA la \`let\` que en app.js vive miles de líneas más abajo.
  let _aurixRemotePortfolioEpochMs = 0;
  // Después del arranque todo tiene que seguir funcionando igual que siempre.
  const lateHist = loadHistory();
  const lateEpoch = _aurixPortfolioEpoch();
  RESULT = { bootHist: bootHist.length, bootCats: bootCats.length, bootErr,
             lateHist: lateHist.length, lateEpoch };
`;
const sandbox = { localStorage: localStorageStub, console: { log() {}, warn() {} }, RESULT: null };
vm.createContext(sandbox);
let threw = null;
try { vm.runInContext(src, sandbox); } catch (e) { threw = String(e); }

ok('H.1 el módulo se evalúa: cargar el historial antes del epoch remoto no revienta',
  !threw, threw || '');
const R = sandbox.RESULT || {};
ok('H.2 EL DEFECTO: el historial NO puede arrancar vacío teniendo 43 puntos en disco',
  R.bootHist === 43, 'arrancó con ' + R.bootHist + ' puntos (disco: 43)');
ok('H.3 …y la serie de categorías tampoco',
  R.bootCats === 43, 'arrancó con ' + R.bootCats + ' puntos (disco: 43)');
ok('H.4 el error de la zona muerta no se traga en silencio: no hay error que tragar',
  !R.bootErr, R.bootErr || '');
ok('H.5 después del arranque el comportamiento es el de siempre',
  R.lateHist === 43 && R.lateEpoch === 0, JSON.stringify({ late: R.lateHist, epoch: R.lateEpoch }));

// EL EPOCH SIGUE FILTRANDO. El arreglo no puede haber desactivado la razón por la
// que esta función existe: un reset esconde lo anterior a su marca.
{
  const src2 = `
    const PORTFOLIO_EPOCH_KEY = 'aurix_portfolio_epoch';
    ${fnSrc('_aurixLocalPortfolioEpoch')}
    ${fnSrc('_aurixRemoteEpochMsSafe')}
    ${fnSrc('_aurixPortfolioEpoch')}
    ${fnSrc('_aurixFilterAfterEpoch')}
    ${fnSrc('loadHistory')}
    const HISTORY_KEY = 'portfolio_history';
    let _aurixRemotePortfolioEpochMs = 0;
    RESULT = { kept: loadHistory().length, epoch: _aurixPortfolioEpoch() };
  `;
  const cut = now - 10 * DAY;
  const store2 = Object.assign({}, store, { aurix_portfolio_epoch: String(cut) });
  const sb2 = { localStorage: { getItem: k => (k in store2 ? store2[k] : null), setItem: () => {} },
                console: { log() {}, warn() {} }, RESULT: null };
  vm.createContext(sb2);
  vm.runInContext(src2, sb2);
  ok('H.6 un reset SIGUE escondiendo lo anterior a su marca (el arreglo no lo desactiva)',
    sb2.RESULT.kept === 11 && sb2.RESULT.epoch === cut,
    JSON.stringify(sb2.RESULT) + ' esperado 11 puntos');
}

// Y la lectura remota, cuando existe, sigue mandando si es más reciente.
{
  const src3 = `
    const PORTFOLIO_EPOCH_KEY = 'aurix_portfolio_epoch';
    ${fnSrc('_aurixLocalPortfolioEpoch')}
    ${fnSrc('_aurixRemoteEpochMsSafe')}
    ${fnSrc('_aurixPortfolioEpoch')}
    let _aurixRemotePortfolioEpochMs = 0;
    _aurixRemotePortfolioEpochMs = ${now - 5 * DAY};
    RESULT = { epoch: _aurixPortfolioEpoch() };
  `;
  const sb3 = { localStorage: { getItem: () => null, setItem: () => {} },
                console: { log() {}, warn() {} }, RESULT: null };
  vm.createContext(sb3);
  vm.runInContext(src3, sb3);
  ok('H.7 el epoch REMOTO sigue mandando una vez inicializado',
    sb3.RESULT.epoch === now - 5 * DAY, JSON.stringify(sb3.RESULT));
}

console.log('\n' + (fails.length ? '✗ FAIL' : '✓ PASS') + '  ' + pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { console.log('\nFALLOS:'); fails.forEach(f => console.log('  · ' + f)); process.exit(1); }
process.exit(0);
