'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-PRE-HYDRATION-CONTINUITY-harness — SPEC P0 CHART PRE-HYDRATION
// FALSE CONTINUITY
// ════════════════════════════════════════════════════════════════════════════
// UNKNOWN HISTORY ≠ COMPLETE HISTORY.
//
// EL INCIDENTE, reproducido con los owners reales y los timestamps reales
// (hueco 2026-08-24 23:00 → 2026-08-25 13:00 = 14 h):
//
//   ESTADO 1 · mañana, `_aurixBackendSnapshots` vacío
//     61 puntos, TODOS posteriores a las 13:00, intervalo máx 0,01 h
//     → 1 segmento, línea continua y aparentemente completa
//
//   ESTADO 2 · tarde, las MISMAS filas ya hidratadas
//     622 puntos, ya incluye el tramo del día anterior, intervalo máx 14,00 h
//     → 2 segmentos, gráfico partido
//
// Los límites del hueco NO cambiaron. Lo único que cambió fue la COMPOSICIÓN de
// la serie mostrada: `_aurixHistorySourceForDisplay` devuelve SÓLO el frontend
// mientras el backend no ha hidratado (`_aurixMergeSnapshotSources` tiene el
// fast-path `if (!beRaw.length) return fe`). El hueco no apareció: apareció la
// HISTORIA que lo rodea. El estado de la tarde era el CORRECTO.
//
// LA CAUSA de que se publicara esa historia truncada como definitiva: el gate del
// gráfico, `_aurixChartPublicationSourcesPending`, enumeraba `idle` y `loading` y
// OMITÍA `failed`, mientras el gate del RETORNO, `_aurixResolvePublicationReadiness`,
// ya bloqueaba los tres. Dos políticas donde el comentario del propio gate promete
// que «the chart area and the return publish as a single unit». Y los reintentos de
// hidratación NO tienen tope, así que en una red inestable `failed` reincide para
// siempre: por eso el síntoma se dio en móvil y no en el escritorio que hidrató a
// la primera.
//
// EL FIX: el gate del gráfico DELEGA en la política que ya existía para el retorno.
// Una sola definición, su mismo toggle. No se toca el clasificador de huecos, ni sus
// umbrales, ni el merge, ni la geometría, ni un solo valor financiero. Un hueco real
// sigue siendo un hueco después de `ready`.
//
// Este gate EJECUTA los owners reales extraídos de app.js.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

let pass = 0, fail = 0;
function ok(n, c, info) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } }

function fnSrc(n) {
  const s = 'function ' + n + '('; const i = app.indexOf(s);
  if (i < 0) throw new Error('missing ' + n);
  let p = app.indexOf('(', i), pd = 0;
  for (; p < app.length; p++) { if (app[p] === '(') pd++; else if (app[p] === ')') { pd--; if (!pd) { p++; break; } } }
  let k = app.indexOf('{', p), d = 0;
  for (; k < app.length; k++) { if (app[k] === '{') d++; else if (app[k] === '}') { d--; if (!d) { k++; break; } } }
  return app.slice(i, k);
}
function konstSrc(name) {
  const s = 'const ' + name + ' ='; const i = app.indexOf(s);
  if (i < 0) throw new Error('missing const ' + name);
  let k = i, depth = 0, started = false;
  for (; k < app.length; k++) { const c = app[k];
    if (c === '(' || c === '{' || c === '[') { depth++; started = true; }
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (c === ';' && (!started || depth === 0)) { k++; break; } }
  return app.slice(i, k);
}

let sb = null, buildErr = null;
try {
  sb = { Math, Number, Array, Object, String, isFinite, JSON, console: { log() {}, warn() {} } };
  vm.createContext(sb);
  vm.runInContext(`
    var _AURIX_CHART_FIRSTPAINT_HOLD_ALL_RANGES = true;
    var _AURIX_BACKEND_SNAPSHOTS_ENABLED = true, _AURIX_BACKEND_SNAPSHOTS_AUTOLOAD = true;
    var _AURIX_LB2_BLOCK_ON_HYDRATION_FAILED = true;
    const _AURIX_VP_GAP_MEDIAN_MULT = 8, _AURIX_OBS_GAP_MIN_MS = 8*36e5, _AURIX_OBS_GAP_MAX_MS = 30*864e5;
    const _AURIX_SNAP_NEAR_MS = 5*60000, _AURIX_SNAP_NEAR_FRAC = 0.002, _AURIX_SNAP_FE_AUTHORITY_MS = 5*60000;
    var currentUser = { id: 'u1' }, _aurixRemoteLoadOutcome = 'ok-row', _aurixCanonicalHistoryLoaded = true;
    var _aurixBackendSnapshotsState = 'ready';
  `, sb);
  vm.runInContext(konstSrc('_AURIX_PUBLICATION_STATE'), sb);
  ['_aurixResolvePublicationReadiness', '_aurixChartPublicationSourcesPending',
   '_aurixNormalizeBackendSnapshot', '_aurixMergeSnapshotSources', '_aurixRealGapFloorMs']
    .forEach(n => vm.runInContext(fnSrc(n), sb));
} catch (e) { buildErr = String((e && e.message) || e); }

const setState = st => { sb.__st = st; vm.runInContext('_aurixBackendSnapshotsState = __st;', sb); };
const chartGate = () => vm.runInContext('_aurixChartPublicationSourcesPending()', sb);
const returnGate = () => vm.runInContext('_aurixResolvePublicationReadiness({ backendEnabled: true, hydrationState: _aurixBackendSnapshotsState })', sb);
const merge = (fe, be) => { sb.__fe = fe; sb.__be = be; return vm.runInContext('_aurixMergeSnapshotSources(__fe, __be)', sb); };
const floorMs = (pts, r) => { sb.__p = pts.map(p => ({ time: p.ts, value: p.value })); sb.__r = r || '24h';
  return vm.runInContext('_aurixRealGapFloorMs(__p, __r)', sb); };

// ── el incidente, con sus timestamps REALES ────────────────────────────────
const M = 60000, H = 36e5;
const LAST_BEFORE = Date.UTC(2026, 7, 24, 23, 0);
const FIRST_AFTER = Date.UTC(2026, 7, 25, 13, 0);
const GAP_MS = FIRST_AFTER - LAST_BEFORE;                        // 14 h exactas
const backendRows = (function () {
  const a = [];
  for (let t = Date.UTC(2026, 7, 24, 12, 0); t <= LAST_BEFORE; t += 15 * M) a.push({ ts: t, total: 10000, value: 10000, source: 'backend_snapshot', market_state: 'closed' });
  for (let t = FIRST_AFTER; t <= Date.UTC(2026, 7, 25, 18, 0); t += 15 * M) a.push({ ts: t, total: 10000, value: 10000, source: 'backend_snapshot', market_state: 'open' });
  return a;
})();
const feOnly = (untilH, untilM) => { const a = [];
  for (let t = FIRST_AFTER; t <= Date.UTC(2026, 7, 25, untilH, untilM || 0); t += 30000) a.push({ ts: t, value: 10000 });
  return a; };
// una cuenta SIN hueco: backend continuo cada 15 min
const backendNoGap = (function () { const a = [];
  for (let t = Date.UTC(2026, 7, 24, 18, 0); t <= Date.UTC(2026, 7, 25, 18, 0); t += 15 * M) a.push({ ts: t, total: 10000, value: 10000, source: 'backend_snapshot' });
  return a; })();

function segmentos(fe, be, range) {
  const src = merge(fe, be).filter(p => p && Number.isFinite(p.ts)).sort((a, b) => a.ts - b.ts);
  const nowRef = src.length ? src[src.length - 1].ts : 0;
  const spanMs = { '24h': 24 * H, '7d': 7 * 864e5 }[range || '24h'];
  const win = src.filter(p => p.ts >= nowRef - spanMs);
  const thr = floorMs(win, range || '24h');
  let cortes = 0, maxIv = 0;
  for (let i = 1; i < win.length; i++) { const d = win[i].ts - win[i - 1].ts; if (d > maxIv) maxIv = d; if (d > thr) cortes++; }
  return { n: win.length, cortes, segmentos: cortes + 1, thr, maxIv, cruzaHueco: !!(win.length && win[0].ts <= LAST_BEFORE) };
}

console.log('\n════ AURIX-CHART-PRE-HYDRATION-CONTINUITY ════\n');
console.log('0 · Los owners reales se ejecutan:');
ok('0.1 gates de publicación + merge + clasificador cargados desde app.js', sb !== null && !buildErr, buildErr || '');
if (buildErr) { console.log('\n✗ FAIL  sin los owners reales no se puede afirmar nada\n'); process.exit(1); }

// ── 1 · idle / loading: no se publica historia definitiva ─────────────────
console.log('\n1 · Con la hidratación en curso NO se publica historia ni retorno definitivos:');
{
  ['idle', 'loading'].forEach(st => {
    setState(st);
    const c = chartGate(), r = returnGate();
    ok('1.' + st + ' ⇒ el gráfico NO publica (motivo diagnosticable)',
      c.pending === true && !!c.reason, JSON.stringify(c));
    ok('1.' + st + ' ⇒ el retorno tampoco publica',
      r.publishable === false && !!r.blocker, JSON.stringify(r));
  });
  ok('1.3 y el motivo es el MISMO en los dos gates (una sola política)',
    (function () {
      return ['idle', 'loading', 'failed'].every(st => { setState(st);
        return chartGate().reason === returnGate().blocker; });
    })());
}

// ── 2 · ready: aparece la serie fusionada ────────────────────────────────
console.log('\n2 · Con `ready` se publica la serie FUSIONADA:');
{
  setState('ready');
  const c = chartGate(), r = returnGate();
  ok('2.1 ambos gates publican', c.pending === false && r.publishable === true);
  const e2 = segmentos(feOnly(18, 0), backendRows, '24h');
  ok('2.2 la serie ya incluye el tramo anterior al hueco',
    e2.cruzaHueco === true && e2.n > 600, JSON.stringify({ n: e2.n, cruza: e2.cruzaHueco }));
}

// ── 3 · el hueco real de 14 h sigue siendo un hueco ──────────────────────
console.log('\n3 · El hueco REAL de 14 h sigue representado como hueco:');
{
  const e = segmentos(feOnly(18, 0), backendRows, '24h');
  ok('3.1 tras `ready`, dos segmentos y el intervalo máximo es el hueco real',
    e.segmentos === 2 && Math.abs(e.maxIv - GAP_MS) < 60000,
    JSON.stringify({ segmentos: e.segmentos, maxIvH: (e.maxIv / H).toFixed(2) }));
  ok('3.2 el umbral con la cadencia real (~15 min) es el suelo de 8 h, no un valor inventado',
    Math.abs(e.thr - 8 * H) < 1000, (e.thr / H).toFixed(2) + 'h');
  ok('3.3 el fix NO oculta el hueco: sigue partido después de hidratar', e.segmentos > 1);
}

// ── 4 · 24H y 7D coherentes ──────────────────────────────────────────────
console.log('\n4 · 24H y 7D clasifican el mismo par de timestamps igual:');
{
  const a = segmentos(feOnly(18, 0), backendRows, '24h');
  const b = segmentos(feOnly(18, 0), backendRows, '7d');
  ok('4.1 mismo umbral en ambos rangos (range-invariante)', Math.abs(a.thr - b.thr) < 1000,
    (a.thr / H).toFixed(2) + 'h vs ' + (b.thr / H).toFixed(2) + 'h');
  ok('4.2 ambos parten el mismo hueco', a.segmentos > 1 && b.segmentos > 1);
}

// ── 5 · failed terminal: sin fallback silencioso ─────────────────────────
console.log('\n5 · `failed` terminal: NO hay fallback silencioso a frontend-only:');
{
  setState('failed');
  const c = chartGate(), r = returnGate();
  ok('5.1 el gráfico NO publica con `failed` — ÉSTE era el agujero',
    c.pending === true, JSON.stringify(c));
  ok('5.2 el motivo es diagnosticable y nombra la indisponibilidad',
    c.reason === 'backend_hydration_failed', String(c.reason));
  ok('5.3 el retorno seguía bloqueado (ya lo estaba) y ahora coinciden',
    r.publishable === false && r.blocker === c.reason);
  ok('5.4 el estado declarado es de historia no certificable',
    r.state === 'STALE_HISTORY' || String(r.state).indexOf('STALE') !== -1, String(r.state));
  // La intención de este assert es que el gate DELEGUE la política en el resolver en vez de duplicarla,
  // no que el literal del contexto sea inmutable. El cierre pre-freeze añadió al MISMO resolver la
  // pierna `sourcesComplete` (conjunto de fuentes incompleto ⇒ no se publica), que es justamente
  // delegar una vez más: sigue habiendo un solo owner de la política y un solo toggle por pierna.
  ok('5.5 la política tiene UN solo toggle, no dos (se delega, no se duplica)',
    /_aurixResolvePublicationReadiness\(\{\s*backendEnabled: true, hydrationState: beSt[,\s]/.test(app)
    && (app.match(/_AURIX_LB2_BLOCK_ON_HYDRATION_FAILED/g) || []).length >= 1
    && (app.match(/function _aurixResolvePublicationReadiness\(/g) || []).length === 1);
}

// ── 6 · una cuenta SIN hueco no cambia ──────────────────────────────────
console.log('\n6 · Una cuenta sin hueco mantiene su gráfico continuo tras `ready`:');
{
  setState('ready');
  const e = segmentos(feOnly(18, 0), backendNoGap, '24h');
  ok('6.1 un solo segmento, sin cortes', e.segmentos === 1 && e.cortes === 0,
    JSON.stringify({ n: e.n, segmentos: e.segmentos }));
  ok('6.2 …y el gate no la retiene', chartGate().pending === false);
}

// ── 7-8 · el gate depende del ESTADO, no del evento que repinta ──────────
console.log('\n7–8 · Ningún repintado (divisa, reload, cambio de rango) publica historia incompleta:');
{
  // El gate es una función SIN argumentos: no puede depender de qué disparó el repintado,
  // así que un cambio EUR/USD, un reload o un cambio de temporalidad durante `loading`
  // obtienen la misma respuesta. Esto es lo que hace la retención inmune al disparador.
  ok('7.1 el gate del gráfico no recibe evento/disparador alguno (sólo estado)',
    /function _aurixChartPublicationSourcesPending\(\)/.test(app));
  ok('7.2 durante `loading`, repintar N veces da siempre pendiente',
    (function () { setState('loading');
      for (let i = 0; i < 5; i++) { if (chartGate().pending !== true) return false; }
      return true; })());
  ok('7.3 durante `failed`, idem', (function () { setState('failed');
    for (let i = 0; i < 5; i++) { if (chartGate().pending !== true) return false; } return true; })());
  ok('8.1 el cambio de divisa sólo repinta: no escribe historia ni snapshots',
    /function _applyCurrencyChange/.test(app)
    && /baseCurrency = currency;/.test(fnSrc('_applyCurrencyChange'))
    && /updateChart\(true\)/.test(fnSrc('_applyCurrencyChange'))
    && !/portfolioHistory|recordSnapshot|categoryHistory/.test(fnSrc('_applyCurrencyChange')));
  ok('8.2 el gate es consultado en el ÚNICO punto de publicación del painter',
    /if \(\(typeof _aurixChartPublicationSourcesPending === 'function'\) && _aurixChartPublicationSourcesPending\(\)\.pending\)/.test(app));
}

// ── 9 · transición determinista ─────────────────────────────────────────
console.log('\n9 · La transición BUILDING → historia real es determinista:');
{
  const seq = ['idle', 'loading', 'failed', 'loading', 'ready'];
  const publica = seq.map(st => { setState(st); return chartGate().pending === false; });
  ok('9.1 sólo el estado final `ready` publica',
    publica.join(',') === 'false,false,false,false,true', publica.join(','));
  ok('9.2 el mismo estado da siempre la misma respuesta (sin memoria oculta)',
    (function () { setState('failed'); const a = chartGate().reason;
      setState('ready'); chartGate(); setState('failed'); return chartGate().reason === a; })());
}

// ── 10 · el retorno nunca sobre una serie truncada ──────────────────────
console.log('\n10 · El retorno no se publica sobre una serie frontend truncada:');
{
  ok('10.1 en los tres estados no-ready el retorno está bloqueado',
    ['idle', 'loading', 'failed'].every(st => { setState(st); return returnGate().publishable === false; }));
  ok('10.2 …y el gráfico se retiene con él, como una sola unidad',
    ['idle', 'loading', 'failed'].every(st => { setState(st);
      return chartGate().pending === true && returnGate().publishable === false; }));
  ok('10.3 el resolver del retorno no se ha tocado (sigue siendo el owner de la política)',
    /const blockOnFailed = \(typeof _AURIX_LB2_BLOCK_ON_HYDRATION_FAILED !== 'undefined'\)/.test(app)
    && /out\.blocker = 'backend_hydration_failed'/.test(app));
}

// ── 11 · nada inventado, nada oculto ────────────────────────────────────
console.log('\n11 · Ni datos inventados ni discontinuidades ocultas:');
{
  const gate = fnSrc('_aurixChartPublicationSourcesPending');
  ok('11.1 el fix no interpola, no sintetiza ni rellena',
    !/interpolat|synthetic|backfill|fabricat/i.test(gate));
  ok('11.2 no toca el clasificador de huecos ni sus umbrales',
    !/_AURIX_OBS_GAP_MIN_MS|_AURIX_VP_GAP_MEDIAN_MULT|_aurixRealGapFloorMs/.test(gate));
  ok('11.3 no toca el merge, los snapshots ni valores financieros',
    !/_aurixMergeSnapshotSources|portfolio_snapshots|totalValueUSD|recordSnapshot/.test(gate));
  ok('11.4 el fast-path del merge que causó el síntoma sigue intacto (no se parchea el merge)',
    /if \(!beRaw\.length\) return fe;/.test(app));
  ok('11.5 el clasificador sigue siendo el mismo owner único',
    (app.match(/function _aurixRealGapFloorMs\(/g) || []).length === 1);
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + '  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
