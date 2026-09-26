'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-TRUTH-CONTINUITY — SPRINT P0 CHART TRUTH, CONTINUITY & RESILIENCE
// ════════════════════════════════════════════════════════════════════════════
// UNA corrección y DOS pendientes, todos medidos sobre el pipeline REAL de app.js.
//
// Lo que este fichero NO hace, a propósito: fijar como contrato el valor que hoy produce un defecto
// abierto. Un assert que exija «el baseline NO está dibujado» se pondría rojo el día que alguien lo
// arregle bien — es la lección que la memoria de Aurix lleva registrada diez veces: los gates fosilizan
// como contrato lo que era una limitación. Aquí los dos pendientes se fijan por sus INVARIANTES DE
// SEGURIDAD: lo que cualquier corrección futura tendrá que seguir cumpliendo, y lo que ninguna puede
// romper. Los invariantes de la sección P2 son exactamente los que tumbaron dos intentos de corrección
// en este mismo sprint, así que no son decorativos: ya han cazado código real.
//
// C  (CORREGIDO) · TOTAL no puede afirmar «toda la historia» sobre una lectura truncada.
// P1 (PENDIENTE) · cola autoritativa rancia en 24H: descarta las únicas observaciones del tramo reciente.
// P2 (PENDIENTE) · un % publicado puede medirse sobre un punto que no se dibuja (DOS owners).
//
// Se mide COMPORTAMIENTO (series, extremos, elegibilidad, cobertura, flujos), nunca literales.
const L = require('./_aurix-chart-replay-lib.cjs');
const MIN = 60e3, HOUR = 36e5, DAY = 864e5;
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }
function section(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 74 - t.length))); }

const B_NOW = Date.UTC(2026, 8, 22, 21, 18, 0);
const B_EPOCH = 1780704000000;   // AURIX_INVESTABLE_CHART_EPOCH — suelo deliberado, no se toca

// ════════════════════════════════════════════════════════════════════════════
// 0 · EL BANCO DE PRUEBAS TIENE QUE ESTAR VIVO
// ════════════════════════════════════════════════════════════════════════════
// La neutralización de flujos estaba MUERTA en el sandbox: faltaban `_aurixLoadCapitalFlowsLive`,
// `_aurixFlowDuplicateIds`, `_aurixFlowIsDerived`, `_aurixFlowDupKey` y `_aurixLocalPortfolioEpoch`, así
// que `_aurixLoadCapitalFlows` lanzaba, los try/catch se lo tragaban y `_aurixNetFlowsInWindow` devolvía
// `hasLedger:false` SIEMPRE — y con ello `_aurixPortfolioEpoch` también lanzaba, dejando muerto el suelo
// de epoch. Un harness que certifica rentabilidad con el ledger apagado no certifica nada: es la lección
// [feedback_harness_no_stubear_lo_certificado]. Se comprueba ANTES que nada: si esto se rompe, nada de
// lo que hay debajo es evidencia.
section('0 · el pipeline certificado NO está stubeado');
{
  const NOW = 1_800_000_000_000;
  const ctx = L.newSession({ now: NOW });
  L.setTruth(ctx, { local: [], remote: [], backend: [], flows: [{ ts: NOW - 3 * HOUR, amountUSD: 5000, id: 'f1' }] });
  const flows = L.call(ctx, '_aurixLoadCapitalFlows()');
  const net = L.call(ctx, '_aurixNetFlowsInWindow(' + (NOW - DAY) + ',' + NOW + ')');
  ok('0.1 el ledger de flujos se LEE de verdad (no lanza y no se traga en un catch)', flows.length === 1);
  ok('0.2 la neutralización de flujos está VIVA', net.hasLedger === true && net.net === 5000, JSON.stringify(net));
  ok('0.3 la cadena de epoch resuelve sin lanzar', L.call(ctx, '_aurixPortfolioEpoch()') === 0 &&
    L.call(ctx, '_aurixInvestableChartEpoch()') === L.call(ctx, 'AURIX_INVESTABLE_CHART_EPOCH'));
  // …y que el ledger cambia el resultado, no sólo que se lee: un depósito NO puede publicarse como
  // rendimiento. Sin esto, 0.1/0.2 podrían pasar con la neutralización desconectada aguas abajo.
  const t0 = NOW - 20 * HOUR, pts = [];
  for (let i = 0; i <= 40; i++) pts.push({ ts: t0 + i * 30 * MIN, total: i < 20 ? 100000 : 110000 });
  const c2 = L.newSession({ now: NOW });
  L.setTruth(c2, { local: [], remote: pts, backend: [], flows: [{ ts: t0 + 20 * 30 * MIN, amountUSD: 10000, id: 'dep' }] });
  L.setPhase(c2, { outcome: 'ok-row', loaded: true, canon: true, be: 'ready' }, { remote: pts });
  const A = JSON.stringify({ ts: pts[0].ts, value: pts[0].total });
  const Z = JSON.stringify({ ts: pts[pts.length - 1].ts, value: pts[pts.length - 1].total });
  const per = L.call(c2, '_aurixComputePeriodReturn("24h", ' + A + ', ' + Z + ')');
  ok('0.4 una APORTACIÓN no se publica como rendimiento (la neutralización actúa, no sólo se lee)',
    per.returnState === 'ok' && Math.abs(per.grossPct - 10) < 0.01 && Math.abs(per.returnPct) < 0.01,
    'bruto=' + per.grossPct + '% → publicado=' + per.returnPct + '% · flujos=' + per.netFlows);
}

// ════════════════════════════════════════════════════════════════════════════
// C · TOTAL — «HISTORIAL DISPONIBLE» AFIRMA QUE NO FALTA NADA   (CORREGIDO)
// ════════════════════════════════════════════════════════════════════════════
// La proyección devolvía ALL_AVAILABLE_HISTORY con que hubiera UN punto, sin mirar si la lectura
// paginada de snapshots se quedó corta — y un truncado pierde exactamente la cola ANTIGUA (la lectura es
// descendente), que es el INICIO del historial: justo lo que TOTAL dice representar. Además el propio
// `_aurixSourceSetComplete` justifica NO bloquear el retorno por truncado escribiendo que «Aurix ya lo
// representa con honestidad vía PARTIAL_HISTORY» — un control compensatorio que para TOTAL no existía
// porque la proyección de presentación llevaba `r !== 'all'`.
section('C · TOTAL no declara historia completa sobre una lectura truncada');
function caseB() {
  const pts = [];
  for (let t = B_EPOCH + 3 * HOUR; t <= B_NOW; t += 60 * MIN) {
    const f = (t - B_EPOCH) / (B_NOW - B_EPOCH);
    const v = f < 0.45 ? 67806 + (89500 - 67806) * (f / 0.45) : 89500 + 600 * Math.sin(f * 40);
    pts.push({ ts: t, total: +v.toFixed(2) });
  }
  return pts;
}
function runC(truncated, over, opts) {
  opts = opts || {};
  const pts = caseB();
  const ctx = L.newSession({ now: B_NOW, constOverrides: over || {} });
  L.setTruth(ctx, { local: [], remote: opts.canonicalOnly ? pts : [], backend: opts.canonicalOnly ? [] : pts, flows: [] });
  L.setPhase(ctx, { outcome: 'ok-row', loaded: true, canon: true, be: 'ready' }, { remote: opts.canonicalOnly ? pts : [] });
  ctx._aurixBackendSnapshotsTruncated = !!truncated;
  return L.stages(ctx, 'all');
}
{
  const FULL = runC(false), TRUNC = runC(true);
  ok('C1 lectura COMPLETA ⇒ TOTAL declara toda la historia disponible',
    FULL.__frc.historyCoverage === 'ALL_AVAILABLE_HISTORY', FULL.__frc.historyCoverage);
  ok('C2 lectura TRUNCADA de la fuente cargada ⇒ TOTAL declara historia PARCIAL',
    TRUNC.__frc.historyCoverage === 'PARTIAL_AVAILABLE_HISTORY', TRUNC.__frc.historyCoverage);
  ok('C3 el truncado NO borra ni un punto de la serie dibujada (es una etiqueta, no un filtro)',
    TRUNC.S7_plotted.count === FULL.S7_plotted.count &&
    TRUNC.S7_plotted.firstTs === FULL.S7_plotted.firstTs &&
    TRUNC.S7_plotted.lastTs === FULL.S7_plotted.lastTs);
  ok('C4 el truncado no altera el % publicado ni la elegibilidad',
    TRUNC.__frc.badgeEligible === FULL.__frc.badgeEligible && TRUNC.__frc.badgeReturnPct === FULL.__frc.badgeReturnPct);
  const OFF = runC(true, { _AURIX_ALL_TRUNCATED_COVERAGE_HONESTY: 'false' });
  ok('C5 [control negativo] con el flag OFF un TOTAL truncado vuelve a afirmar historia completa',
    OFF.__frc.historyCoverage === 'ALL_AVAILABLE_HISTORY', OFF.__frc.historyCoverage);

  // `_aurixBackendSnapshotsTruncated` es un global SIN ciclo de vida: no se reinicia al cambiar de
  // cuenta ni cuando una lectura posterior falla. Por eso la degradación exige además `backendLoaded`,
  // que es un hecho DEL BUILD. Esto cierra el caso «bandera rancia y el backend no aporta nada a la
  // línea». RESIDUAL DECLARADO, verificado por la revisión adversarial y NO cerrado aquí: si se cambia
  // de cuenta sin recarga completa, los DOS globales se quedan rancios JUNTOS (bandera + filas), así que
  // una cuenta B con historia corta y completa puede rotular «Historial parcial». Falla hacia el lado
  // conservador y NO altera ninguna cifra; cerrarlo es del owner del aislamiento multi-cuenta, no de
  // esta proyección — y si ese cambio de cuenta no fuerza recarga, la misma rancidez afectaría al MERGE
  // de datos, que es una pregunta mucho mayor que una etiqueta.
  const STALE = runC(true, null, { canonicalOnly: true });
  ok('C6 bandera rancia SIN backend cargado ⇒ no se degrada la etiqueta',
    STALE.__frc.historyCoverage === 'ALL_AVAILABLE_HISTORY', STALE.__frc.historyCoverage);
  ok('C7 …y la serie dibujada es exactamente la misma que sin bandera',
    STALE.S7_plotted.count === runC(false, null, { canonicalOnly: true }).S7_plotted.count);

  const now = Date.UTC(2026, 8, 22, 12, 0, 0);
  const flat = [];
  for (let i = 0; i < 60; i++) flat.push({ ts: now - (60 - i) * 20 * MIN, total: +(50000 + Math.sin(i / 3) * 40).toFixed(2) });
  const ctx2 = L.newSession({ now: now });
  L.setTruth(ctx2, { local: [], remote: [], backend: flat, flows: [] });
  L.setPhase(ctx2, { outcome: 'ok-row', loaded: true, canon: true, be: 'ready' }, { remote: [] });
  ctx2._aurixBackendSnapshotsTruncated = true;
  const S2 = L.stages(ctx2, 'all'), hps = S2.__frc.historyPresentationState;
  ok('C8 el estado de presentación reutiliza el vocabulario existente, nunca uno nuevo',
    ['PARTIAL_HISTORY', 'AVAILABLE_HISTORY', 'TRUSTED_RETURN', 'CALCULATING', 'UNKNOWN'].indexOf(hps) >= 0, hps);
  ok('C9 un TOTAL truncado sin % elegible NO se presenta como «historia disponible»',
    !(S2.__frc.badgeEligible === false && hps === 'AVAILABLE_HISTORY'),
    'badgeEligible=' + S2.__frc.badgeEligible + ' hps=' + hps);
}

// ════════════════════════════════════════════════════════════════════════════
// P1 · PENDIENTE — COLA AUTORITATIVA RANCIA EN 24H
// ════════════════════════════════════════════════════════════════════════════
// Defecto demostrado: cuando la familia autoritativa deja de escribir, su cobertura del rolling-24H
// sigue alta porque MIDE EL PASADO, conserva la autoridad, y el descarte borra las únicas observaciones
// reales del tramo reciente ⇒ el endpoint retrocede horas mientras la cabecera publica el valor vivo.
// La corrección mueve el `current` de un retorno PUBLICADO y cruza dos regímenes de valoración, así que
// el §6 del SPEC la deja pendiente de autorización. Lo que se fija aquí es que, mientras tanto, el
// comportamiento sea el HONESTO: se conserva el último punto verdadero y el retorno falla cerrado.
section('P1 · pendiente 24H: endpoint verdadero conservado y retorno fallando cerrado');
{
  const A_NOW = Date.UTC(2026, 8, 21, 12, 24, 0);
  const start = A_NOW - 24 * 60 * MIN, beLast = A_NOW - 159 * MIN;
  const backend = []; for (let t = start; t <= beLast; t += 15 * MIN) backend.push({ ts: t, total: +(85000 + ((t - start) / MIN) * 1.1).toFixed(2) });
  const frontend = []; for (let i = 0; i < 5; i++) frontend.push({ ts: beLast + (36 + i * 30) * MIN, total: +(86600 + i * 450).toFixed(2) });
  const ctx = L.newSession({ now: A_NOW });
  L.setTruth(ctx, { local: frontend, remote: frontend, backend: backend, flows: [] });
  L.setPhase(ctx, { outcome: 'ok-row', loaded: true, canon: true, be: 'ready' }, { remote: frontend });
  const S = L.stages(ctx, '24h'), f = S.__frc;
  ok('P1.1 el último punto dibujado es una observación REAL persistida (nunca el valor vivo de cabecera)',
    backend.concat(frontend).some(p => p.ts === S.S7_plotted.lastTs && p.total === S.S7_plotted.lastValue),
    new Date(S.S7_plotted.lastTs).toISOString() + ' @' + S.S7_plotted.lastValue);
  ok('P1.2 cero puntos sintéticos: el hueco no se rellena ni se puentea',
    (f.diagnostics && f.diagnostics.syntheticPoints) === 0);
  ok('P1.3 con el endpoint rancio NO se publica ningún % (fail closed)',
    f.badgeEligible === false && f.badgeReturnPct == null, 'badge=' + f.badgeLabel);
  const rr = L.call(ctx, '_aurix24hReturnReadiness({financialConfidenceOk:true,baselineIsOriginal:true,' +
    'currentValueAvailable:true,returnPct:1.8,pointCount:96,coverageRatio:0.83,' +
    'endpointFreshnessMs:' + (159 * MIN) + ',largestGapMs:' + (15 * MIN) + '})');
  ok('P1.4 el owner nombra la causa exacta y sigue siendo el umbral de frescura',
    rr.publishable === false && rr.reasonCode === 'STALE_ENDPOINT' &&
    rr.configuredThreshold === L.call(ctx, '_AURIX_24H_ENDPOINT_FRESH_MS'),
    rr.reasonCode + ' @' + rr.configuredThreshold);
  ok('P1.5 el descarte de cola sigue BYTE A BYTE certificado (el pendiente quedó pendiente, no a medias)',
    !/staleTail|_AURIX_24H_STALE_AUTHORITY_TAIL_RECOVERY/.test(L.fnSrc('_aurix24hStripNonAuthoritativePreservingHoles')));
}

// ════════════════════════════════════════════════════════════════════════════
// P2 · PENDIENTE — UN % PUBLICADO MEDIDO SOBRE UN PUNTO QUE NO SE DIBUJA
// ════════════════════════════════════════════════════════════════════════════
// DOS owners reproducidos: el paso 5 (`_aurixStableDisplayAnchor`, que recibe el veredicto anterior a la
// promoción del 9.5) y el paso 4 (`_aurixShortHistoryDisplay`, que tira el fragmento inicial por su
// cuenta). La corrección evidente —no ocultar el prefijo cuando el badge va a publicar— se intentó DOS
// veces y la revisión adversarial la tumbó las dos: los pasos 6/6.5/6.6/6.7 re-derivan sus decisiones
// del conjunto de puntos y varios umbrales son RELATIVOS a N, así que devolver el prefijo podía dejar
// FUERA el valor actual (línea terminando dos meses atrás con badge +152 % y `state: ready`) o borrar
// clusters reales al subir `fragMax = max(3, 0.15·N)`.
//
// De ahí que aquí no se fije el defecto sino los INVARIANTES DE SEGURIDAD que cualquier corrección
// futura tendrá que respetar — y que son exactamente los que cazaron los dos intentos fallidos.
section('P2 · invariantes de seguridad que cualquier corrección futura debe respetar');
{
  const beds = [];
  // (a) régimen del defecto original: rampa larga de construcción + cuerpo estable
  beds.push(['rampa larga + cuerpo estable', caseB(), B_NOW]);
  // (b) régimen que tumbó el segundo intento: prefijo de construcción grande + cluster real + puntos frescos
  {
    const pts = [];
    for (let i = 0; i < 400; i++) pts.push({ ts: B_EPOCH + 3 * HOUR + i * 30 * MIN, total: 20000 + i * 0.065 });
    for (let i = 0; i < 40; i++) pts.push({ ts: B_NOW - 22 * DAY + i * 30 * MIN, total: 50000 + i });
    for (let i = 0; i < 4; i++) pts.push({ ts: B_NOW - 40 * MIN + i * 10 * MIN, total: 50400 + i });
    beds.push(['prefijo grande + isla real + cola fresca', pts, B_NOW]);
  }
  // (c) fragmento inicial pequeño separado por un hueco largo (el owner del paso 4)
  {
    const pts = [];
    for (let i = 0; i < 100; i++) pts.push({ ts: B_EPOCH + 3 * HOUR + i * 30 * MIN, total: +(67806 + i * 12).toFixed(2) });
    for (let t = B_EPOCH + 30 * DAY; t <= B_NOW; t += 30 * MIN) pts.push({ ts: t, total: +(89500 + 600 * Math.sin((t - B_EPOCH) / 1e9)).toFixed(2) });
    beds.push(['fragmento inicial tras hueco largo', pts, B_NOW]);
  }
  const RANGES = ['24h', '7d', '30d', '1y', 'all'];
  const FLOWS = [{ ts: B_EPOCH + 30 * DAY, amountUSD: 12000, id: 'dep1' }];
  let endpointMissing = 0, orphan = 0, synth = 0, fabricated = 0, checked = 0;
  for (const [, pts] of beds) {
    for (const flows of [[], FLOWS]) {
      const ctx = L.newSession({ now: B_NOW });
      L.setTruth(ctx, { local: [], remote: pts, backend: [], flows: flows });
      L.setPhase(ctx, { outcome: 'ok-row', loaded: true, canon: true, be: 'ready' }, { remote: pts });
      for (const r of RANGES) {
        const S = L.stages(ctx, r), f = S.__frc, e = S.__emg;
        const drawn = f.renderPoints || [];
        checked++;
        // EL INVARIANTE QUE TUMBÓ EL SEGUNDO INTENTO: si se publica un %, el VALOR ACTUAL sobre el que
        // se calcula tiene que estar dibujado. Un baseline oculto es un defecto; un ENDPOINT oculto es
        // peor, porque el usuario ve una recta que terminó hace meses junto a un porcentaje de hoy.
        if (f.badgeEligible && drawn.length >= 2 && Number.isFinite(e.currentTs)) {
          if (drawn[drawn.length - 1].ts !== e.currentTs) endpointMissing++;
        }
        if (f.badgeReturnPct != null && !f.badgeEligible) orphan++;
        if ((f.diagnostics && f.diagnostics.syntheticPoints) !== 0) synth++;
        const srcTs = new Set((e.points || []).map(q => q.ts));
        if (drawn.some(q => !srcTs.has(q.ts))) fabricated++;
      }
    }
  }
  ok('P2.1 si se publica un %, el VALOR ACTUAL está dibujado (endpoint nunca oculto)',
    endpointMissing === 0, endpointMissing + ' de ' + checked);
  ok('P2.2 ningún % publicado sin elegibilidad (fail closed)', orphan === 0, orphan + ' de ' + checked);
  ok('P2.3 cero puntos sintéticos en todos los rangos', synth === 0, synth + ' de ' + checked);
  ok('P2.4 ningún punto dibujado fuera de la serie construida', fabricated === 0, fabricated + ' de ' + checked);
  // NO se añade aquí un assert de «la línea no omite puntos interiores»: sería la NEGACIÓN de
  // `multi_segment_legit_preserved_small_islands_dropped` (SPEC.13/17), que descarta islas interiores a
  // propósito. Pasaría verde hoy sólo porque ningún banco lo ejercita, y se pondría rojo el día que un
  // caso legítimo descartara una isla. Es justo la fosilización que este fichero evita.
  // TAMPOCO se cubre la MAGNITUD de la ventana, y conviene decirlo: en el banco (b), rango `all`, HEAD
  // publica hoy un % con 4 puntos dibujados sobre 444 reales. Eso es el pendiente P2, no una regresión,
  // y ningún assert de aquí lo impide — una corrección futura tendrá que traer su propia medida.
  ok('P2.5 el espejo de publicación sigue fijado contra app.js (sin puertas de escape)',
    L.assertNoDefinitiveEscape().length === 0, L.assertNoDefinitiveEscape().join(' '));
}

// ════════════════════════════════════════════════════════════════════════════
// FRC · REEMPLAZO DE LOS DIENTES QUE SE PIERDEN AL DES-CONGELARLO
// ════════════════════════════════════════════════════════════════════════════
// Tres gates fijaban `_aurixResolveFinalRenderSeriesContract` byte a byte desde SPECs que prometían no
// tocarlo, y este sprint lo edita legítimamente (la proyección de cobertura de TOTAL), así que sale de
// esas tres listas con causa. Eso pierde dientes de verdad: el resto de harnesses del FRC están verdes
// también sobre los regímenes rotos, o sea que no discriminan por sí solos. Se compensa aquí fijando lo
// que esas listas protegían realmente —que nadie mueva el ORDEN ni la naturaleza del contrato—, además
// de los invariantes de comportamiento de P2.
section('FRC · el contrato de render no cambia de forma ni de orden');
{
  const src = L.fnSrc('_aurixResolveFinalRenderSeriesContract');
  const bare = src.replace(/\/\/[^\n]*/g, '');
  const at = n => bare.indexOf(n);
  ok('FRC.1 la cadena de sub-puertas conserva su orden fijo (4 → 5 → 6)',
    at('_aurixShortHistoryDisplay') > 0 && at('_aurixStableDisplayAnchor') > at('_aurixShortHistoryDisplay') &&
    at('_aurixVisualTrustGate') > at('_aurixStableDisplayAnchor'));
  ok('FRC.2 el contrato de retorno se sigue resolviendo ANTES de cualquier recorte visual',
    at('_aurixResolveChartReturnContract') > 0 && at('_aurixResolveChartReturnContract') < at('_aurixShortHistoryDisplay'));
  // …y esto se COMPRUEBA EJECUTANDO, no leyendo: una cadena literal se rompería con cualquier refactor
  // equivalente, y no se rompería con un cambio de comportamiento escrito de otra forma.
  {
    const c = L.newSession({ now: B_NOW });
    const emg = JSON.stringify({ range: '24h', partialReturnTrusted: true, partialReturnPct: 5,
      baselineTs: B_NOW - 10 * DAY, baselineValue: 100, currentValue: 105, finalPointCount: 500,
      displayedActualSpanMs: 10 * DAY, coverageRatio: 0.3 });
    const na = r => L.call(c, '_aurixResolveReliabilityDeadlock(' + emg + ', {state:"calculating"}, ' + JSON.stringify(r) + ').branch');
    ok('FRC.3 la promoción del deadlock sigue EXCLUYENDO 24H y TOTAL (ejecutado, no leído)',
      na('24h') === 'NA' && na('all') === 'NA' && na('1y') === 'PARTIAL',
      '24h=' + na('24h') + ' all=' + na('all') + ' 1y=' + na('1y'));
  }
  ok('FRC.4 el descarte 24H sigue siendo un filtro puro',
    /\.filter\(/.test(L.fnSrc('_aurix24hStripNonAuthoritativePreservingHoles')) &&
    !/\.push\(|\.splice\(|\.reverse\(/.test(L.fnSrc('_aurix24hStripNonAuthoritativePreservingHoles').replace(/\/\/[^\n]*/g, '')));
}

console.log('\n' + (fail ? 'FAIL' : 'PASS') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
