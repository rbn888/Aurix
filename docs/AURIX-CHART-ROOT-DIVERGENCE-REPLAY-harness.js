'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-ROOT-DIVERGENCE-REPLAY — SPEC P0 CHART RELIABILITY LAST-BULLET
// ════════════════════════════════════════════════════════════════════════════
// EL SÍNTOMA (producción, misma cuenta): la primera entrada mostraba 24H aparentemente continuo;
// salir y volver partía la serie en dos segmentos, y 7D dejaba un fragmento aislado en el presente.
// Cambiaba entre reconstrucciones de la MISMA cuenta.
//
// ROOT DIVERGENCE — S0 (SOURCE ASSEMBLY), no en el clasificador ni en el renderer.
// `_aurixChartPublicationSourcesPending` declaraba «UNKNOWN HISTORY ≠ COMPLETE HISTORY» y lo aplicaba
// a la pierna BACKEND, pero la pierna CANÓNICA trataba `_aurixRemoteLoadOutcome === 'failed'` como
// SETTLED. Con la fila de `user_portfolios` sin leer, `_aurixCanonicalCatHistory` sigue null y
// `_aurixHistorySourceForDisplay` devuelve la CACHÉ LOCAL — en un dispositivo recién abierto, sólo la
// sesión en curso. Eso se publicaba como definitivo: pocos puntos, un solo segmento, `continuous`.
// Al aterrizar un resync con éxito aparecía la historia real con su hueco: dos segmentos.
// EL HUECO NO APARECÍA AL REENTRAR: APARECÍA LA HISTORIA.
//
// Este harness ejecuta el pipeline REAL de app.js (nada stubeado dentro de lo certificado) sobre UNA
// verdad financiera congelada, recorre S0→S8 y exige:
//   1. INVARIANTE: todo estado de ensamblaje incompleto RETIENE o publica la serie IDÉNTICA a la del
//      estado completo. Misma verdad ⇒ una sola serie publicada.
//   2. El defecto queda FIJADO: con el toggle de rollback en OFF la divergencia reaparece (prueba que
//      el test discrimina y que el fix es la causa del PASS).
//   3. CERO puntos sintéticos y CERO bridge del hueco real en todo lo publicado.
const L = require('./_aurix-chart-replay-lib.cjs');
const MIN = 60e3, HOUR = 36e5, DAY = 864e5;
const NOW = 1_800_000_000_000;
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }

const fe = (t, v) => ({ ts: t, total: +v.toFixed(2), real_estate: 0 });
const bs = (t, v) => ({ ts: t, total_value_usd: +v.toFixed(2), real_estate: 0 });

// ── LA VERDAD FINANCIERA CONGELADA (patrón SPEC §7.30) ───────────────────────
// El dispositivo estuvo cerrado durante la noche ⇒ la historia REAL tiene un hueco de 12 h dentro de
// las últimas 30 h. La caché local sólo retiene la sesión en curso (2 h). El canónico remoto retiene
// todo. El backend retiene la semana anterior. NADA de esto se inventa: son las tres fuentes reales.
function frozenTruth() {
  const local = [], remote = [], backend = [];
  for (let t = NOW - 30 * HOUR; t <= NOW - 14 * HOUR; t += 10 * MIN) remote.push(fe(t, 10100 + ((t - (NOW - 30 * HOUR)) / HOUR) * 4));   // ayer
  for (let t = NOW - 2 * HOUR; t <= NOW; t += 5 * MIN) { const p = fe(t, 10300 + ((t - (NOW - 2 * HOUR)) / HOUR) * 3); remote.push(p); local.push(p); }  // sesión en curso
  for (let t = NOW - 7 * DAY; t <= NOW - 31 * HOUR; t += 15 * MIN) backend.push(bs(t, 9800 + ((t - (NOW - 7 * DAY)) / DAY) * 30));       // semana previa
  return { local, remote, backend, flows: [] };
}
const TRUTH = frozenTruth();

// Fases por las que pasa el ensamblaje asíncrono de fuentes para UNA MISMA verdad persistida.
// `complete` es la única que conoce las tres fuentes; el resto son conocimiento PARCIAL.
const PHASES = [
  { n: 'remote_load_not_settled',      outcome: null,     loaded: false, canon: false, be: 'idle',    complete: false },
  { n: 'canonical_reconcile_in_flight', outcome: 'ok-row', loaded: false, canon: false, be: 'loading', complete: false },
  { n: 'canonical_read_FAILED',         outcome: 'failed', loaded: false, canon: false, be: 'ready',   complete: false },
  { n: 'canonical_ok_backend_loading',  outcome: 'ok-row', loaded: true,  canon: true,  be: 'loading', complete: false },
  { n: 'canonical_ok_backend_failed',   outcome: 'ok-row', loaded: true,  canon: true,  be: 'failed',  complete: false },
  { n: 'COMPLETE_source_set',           outcome: 'ok-row', loaded: true,  canon: true,  be: 'ready',   complete: true },
];

function build(phase, range, overrides) {
  const c = L.newSession({ now: NOW, constOverrides: overrides || {} });
  L.setTruth(c, TRUTH);
  c._aurixCanonicalCatHistory = phase.canon ? TRUTH.remote.map(p => Object.assign({}, p)) : null;
  c._aurixRemoteLoadOutcome = phase.outcome;
  c._aurixCanonicalHistoryLoaded = phase.loaded;
  L.setHydration(c, phase.be);
  return L.publishedSeries(c, range, 'desktop');
}

const RANGES = ['24h', '7d', '30d', '1y', 'all'];
console.log('AURIX-CHART-ROOT-DIVERGENCE-REPLAY — SPEC P0 CHART RELIABILITY LAST-BULLET\n');

// ── 0. El espejo del harness describe el código real ─────────────────────────
console.log('0. El modelo de publicación está fijado contra app.js:');
{
  const v = L.assertNoDefinitiveEscape();
  ok('sin puertas de escape que publiquen con fuentes pendientes (escritorio y móvil)', v.length === 0, v.join(' | ') || 'gate íntegro en ambas superficies');
}

// ── 1. Replay S0→S8 del par que producía el síntoma ──────────────────────────
console.log('1. Replay S0→S8 — canonical_read_FAILED vs COMPLETE_source_set (misma verdad):');
{
  const A = build(PHASES[2], '24h'), B = build(PHASES[5], '24h');
  const sA = A.stages, sB = B.stages;
  console.log('   S0 source      A=' + sA.S0_source.count + 'pts  B=' + sB.S0_source.count + 'pts');
  console.log('   S4 rangeClip   A=' + sA.S4_rangeClipped.count + 'pts  B=' + sB.S4_rangeClipped.count + 'pts');
  console.log('   S6 continuity  A=' + sA.S6_continuity.segments + 'seg/' + sA.S6_continuity.continuityState + '  B=' + sB.S6_continuity.segments + 'seg/' + sB.S6_continuity.continuityState);
  console.log('   S8 publication A=' + A.kind + '  B=' + B.kind);
  ok('S0 es la PRIMERA etapa donde los dos ciclos difieren (la caché local no es la historia)',
    sA.S0_source.count !== sB.S0_source.count, 'A=' + sA.S0_source.count + ' B=' + sB.S0_source.count);
  ok('la verdad completa SÍ contiene un hueco real ⇒ 2 segmentos (no se puentea)',
    sB.S6_continuity.segments === 2 && sB.S6_continuity.continuityState === 'segmented_real_gap', sB.S6_continuity.continuityState);
  ok('el conjunto truncado parecía continuo ⇒ era falsa continuidad, no un hueco nuevo',
    sA.S6_continuity.segments === 1 && sA.S6_continuity.continuityState === 'continuous', sA.S6_continuity.continuityState);
  ok('S8 retiene el conjunto truncado: NO se publica historia desconocida', A.kind === 'HELD', A.kind + ' / ' + sA.S8_publication.reason);
  ok('el motivo de retención nombra la causa', sA.S8_publication.reason === 'canonical_read_failed', String(sA.S8_publication.reason));
}

// ── 2. CANONICAL SERIES INVARIANT por timeframe ──────────────────────────────
console.log('\n2. CANONICAL SERIES INVARIANT — misma verdad ⇒ UNA sola serie publicada por timeframe:');
for (const range of RANGES) {
  const results = PHASES.map(p => ({ p, r: build(p, range) }));
  const published = results.filter(x => x.r.kind === 'PUBLISHED');
  const hashes = new Set(published.map(x => x.r.hash));
  ok(range.toUpperCase() + ' — un único hash publicado', hashes.size <= 1,
    'publican ' + published.length + '/' + results.length + ' estados, hashes=' + hashes.size + ' [' + published.map(x => x.p.n).join(', ') + ']');
  const complete = results.find(x => x.p.complete);
  ok(range.toUpperCase() + ' — el conjunto COMPLETO sí publica (no hay deadlock)', complete.r.kind === 'PUBLISHED', complete.r.kind);
  for (const x of results) {
    if (x.p.complete) continue;
    ok(range.toUpperCase() + ' — ' + x.p.n + ': retiene o coincide',
      x.r.kind === 'HELD' || x.r.kind === 'BUILDING' || x.r.hash === complete.r.hash, x.r.kind);
  }
}

// ── 3. El defecto queda FIJADO (el test discrimina) ──────────────────────────
console.log('\n3. Defecto fijado — con el toggle de rollback en OFF la divergencia REAPARECE:');
{
  const OFF = { _AURIX_CHART_BLOCK_ON_CANONICAL_READ_FAILED: 'false' };
  let reappeared = 0;
  for (const range of RANGES) {
    const A = build(PHASES[2], range, OFF), B = build(PHASES[5], range, OFF);
    if (A.kind === 'PUBLISHED' && B.kind === 'PUBLISHED' && A.hash !== B.hash) reappeared++;
  }
  ok('rollback OFF ⇒ misma verdad publica DOS series distintas en los 5 timeframes', reappeared === RANGES.length, reappeared + '/' + RANGES.length);
  const A = build(PHASES[2], '24h', OFF);
  ok('rollback OFF ⇒ 24H publica la falsa continuidad de 1 segmento',
    A.kind === 'PUBLISHED' && A.stages.S6_continuity.segments === 1, A.kind + '/' + A.stages.S6_continuity.segments + 'seg');
}

// ── 4. Prohibiciones absolutas (SPEC §4) ─────────────────────────────────────
console.log('\n4. Prohibiciones absolutas — nada se inventa para tapar el hueco:');
{
  let synth = 0, bridged = 0, checked = 0;
  for (const range of RANGES) for (const p of PHASES) {
    const r = build(p, range);
    if (r.kind !== 'PUBLISHED') continue;
    checked++;
    if ((r.series.syntheticPoints || 0) !== 0) synth++;
    // un hueco real presente en la verdad publicada debe seguir segmentando
    const gap = r.stages.S7_plotted.largestGapMs, floor = r.stages.S6_continuity.realGapFloorMs;
    if (gap > floor && r.series.segments < 2) bridged++;
  }
  ok('CERO puntos sintéticos en todo lo publicado', synth === 0, synth + ' de ' + checked + ' series');
  ok('CERO bridge de un hueco real (gap > floor ⇒ ≥2 segmentos)', bridged === 0, bridged + ' de ' + checked + ' series');
  ok('el umbral de hueco no se tocó: sigue siendo el de producción',
    L.call(L.newSession({}), '_AURIX_OBS_GAP_MIN_MS') === 8 * HOUR && L.call(L.newSession({}), '_AURIX_VP_GAP_MEDIAN_MULT') === 8);
}

// ── 5. Cuenta nueva sin fila remota ('no-row') sigue publicando ──────────────
// 'no-row' (PGRST116) es conocimiento COMPLETO, no desconocido: no existe fila remota, así que la
// caché local ES la verdad canónica. Retenerlo dejaría a toda cuenta nueva sin gráfico para siempre.
console.log('\n5. Cuenta nueva (no-row) — conocimiento completo, no desconocido:');
{
  const c = L.newSession({ now: NOW });
  const own = [];
  for (let t = NOW - 6 * HOUR; t <= NOW; t += 10 * MIN) own.push(fe(t, 5000 + ((t - (NOW - 6 * HOUR)) / HOUR) * 8));
  L.setTruth(c, { local: own, remote: null, backend: [], flows: [] });
  c._aurixCanonicalCatHistory = null; c._aurixRemoteLoadOutcome = 'no-row'; c._aurixCanonicalHistoryLoaded = false;
  L.setHydration(c, 'ready');
  const r = L.publishedSeries(c, '24h', 'desktop');
  ok('no-row publica (la caché local ES canónica)', r.kind === 'PUBLISHED', r.kind + ' / ' + r.stages.S8_publication.reason);
  ok('no-row no fabrica segmentos ni puntos', r.kind !== 'PUBLISHED' || r.series.syntheticPoints === 0);
}

// ── 5b. La condición es «canónico AUSENTE», no «la última lectura falló» ─────
// Un primer intento bloqueaba con `outcome === 'failed'` a secas. Demasiado ancho: ocultaba un
// gráfico completo y correcto cuando un refresco flaky fallaba a media sesión con el canónico YA
// cargado. Es además el MISMO predicado que ya usaba el owner paralelo del dashboard V2
// (`canDisplayCanonicalReturn`: `loaded && storeOk`), así que ahora hay UNA sola política.
console.log('\n5b. Refresco flaky con la historia canónica ya cargada:');
{
  const c = L.newSession({ now: NOW });
  L.setTruth(c, TRUTH);
  c._aurixCanonicalCatHistory = TRUTH.remote.map(p => Object.assign({}, p));
  c._aurixCanonicalHistoryLoaded = true;          // la historia canónica SÍ está en memoria
  c._aurixRemoteLoadOutcome = 'failed';           // …y el último refresco falló
  L.setHydration(c, 'ready');
  const p = L.publishedSeries(c, '24h', 'desktop');
  const g = L.call(c, '_aurixChartPublicationSourcesPending()');
  ok('no retiene: con el canónico cargado no hay historia desconocida que esperar', g.pending === false, JSON.stringify(g));
  ok('y publica la serie del conjunto completo', p.kind === 'PUBLISHED', p.kind);
  const complete = build(PHASES[5], '24h');
  ok('esa serie es IDÉNTICA a la del estado completo', p.hash === complete.hash, p.hash + ' vs ' + complete.hash);
}

// ── 5c. Recuperación garantizada: EJECUTANDO el latch, no inspeccionándolo ───
// La pierna backend siempre tuvo reintento + `_aurixForceMergedChartRepaint`. La canónica no tenía
// ninguno, así que retener sin cerrar el latch podía dejar el gráfico oculto más tiempo del debido:
// sólo la rama «aplicar remoto» del resync repinta la curva, y una pestaña que ya tiene el foco no
// dispara ningún evento de primer plano.
// SE EJECUTA EN EL ORDEN QUE EL CÓDIGO FUERZA SIEMPRE: `loadPortfolioFromBackend` fija el outcome y
// notifica, y sólo DESPUÉS el llamante ejecuta `_mergeRemoteState`. Un latch que se consuma en el
// primer paso repinta la RETENCIÓN y deja sin repintar el instante publicable — verificar por grep
// que «la función menciona el repintado» no distingue ese caso.
console.log('\n5c. Latch de recuperación — ejecutado en el orden real del código:');
{
  const c = L.newSession({ now: NOW });
  L.setTruth(c, TRUTH);
  const note = () => L.call(c, '_aurixNoteCanonicalOutcome()');
  const gate = () => L.call(c, '_aurixChartPublicationSourcesPending()');

  // PASO 1 — boot: la lectura de user_portfolios falla y no hay historia canónica.
  c._aurixCanonicalCatHistory = null; c._aurixCanonicalHistoryLoaded = false; c._aurixRemoteLoadOutcome = 'failed';
  L.setHydration(c, 'ready');
  note();
  ok('paso 1 (lectura falla): retiene y NO repinta', gate().pending === true && c.__repaints.length === 0,
    gate().reason + ' / repaints=' + c.__repaints.length);

  // PASO 2 — resync acierta: el outcome pasa a 'ok-row' pero el merge AÚN NO ha corrido.
  c._aurixRemoteLoadOutcome = 'ok-row';
  note();
  ok('paso 2 (outcome ok, merge pendiente): sigue pendiente y NO gasta el latch',
    gate().pending === true && c.__repaints.length === 0, gate().reason + ' / repaints=' + c.__repaints.length);

  // PASO 3 — el merge fusiona el store canónico: AQUÍ el gráfico se vuelve publicable.
  c._aurixCanonicalCatHistory = TRUTH.remote.map(p => Object.assign({}, p));
  c._aurixCanonicalHistoryLoaded = true;
  note();
  ok('paso 3 (canónico fusionado): repinta EXACTAMENTE una vez', c.__repaints.length === 1, 'repaints=' + c.__repaints.length);
  ok('y ese repintado ocurre en un estado PUBLICABLE (no repinta la retención)',
    c.__repaints.length === 1 && c.__repaints[0].pending === false, JSON.stringify(c.__repaints[0] || null));

  // PASO 4 — llamadas posteriores no repintan en bucle.
  note(); note();
  ok('paso 4: no repinta de nuevo sin una retención previa', c.__repaints.length === 1, 'repaints=' + c.__repaints.length);

  // La recuperación cubre TAMBIÉN la pierna backend, porque el predicado es el gate entero. Se
  // modela el CABLEADO REAL: la rama de éxito de la hidratación llama al owner con `force`.
  const c2 = L.newSession({ now: NOW });
  L.setTruth(c2, TRUTH);
  c2._aurixCanonicalCatHistory = TRUTH.remote.map(p => Object.assign({}, p));
  c2._aurixCanonicalHistoryLoaded = true; c2._aurixRemoteLoadOutcome = 'ok-row';
  L.setHydration(c2, 'loading'); L.call(c2, '_aurixNoteCanonicalOutcome()');
  ok('pierna backend: retiene sin repintar', c2.__repaints.length === 0);
  L.setHydration(c2, 'ready'); L.call(c2, '_aurixNoteCanonicalOutcome({ force: true })');
  ok('pierna backend: al hidratar, repinta en estado publicable',
    c2.__repaints.length === 1 && c2.__repaints[0].pending === false, JSON.stringify(c2.__repaints[0] || null));
  L.call(c2, '_aurixNoteCanonicalOutcome()');
  ok('…y ese aterrizaje DESARMA el latch: el resync siguiente no repinta de nuevo',
    c2.__repaints.length === 1, 'repaints=' + c2.__repaints.length);

  // SESIÓN SANA COMPLETA, en el orden real de producción y sin ningún fallo: la hidratación aterriza
  // DESPUÉS del merge, así que el gate SÍ estuvo pendiente por `backend_hydration_in_progress`.
  // Debe haber EXACTAMENTE UN repintado (el del aterrizaje) y ninguno espurio al volver al primer
  // plano. Con el latch sin desarmar, aquí salían dos.
  {
    const h = L.newSession({ now: NOW });
    L.setTruth(h, TRUTH);
    const n = (o) => L.call(h, '_aurixNoteCanonicalOutcome(' + (o ? JSON.stringify(o) : '') + ')');
    h._aurixCanonicalCatHistory = null; h._aurixCanonicalHistoryLoaded = false; h._aurixRemoteLoadOutcome = 'ok-row';
    L.setHydration(h, 'idle');
    n();                                                          // lectura OK, merge aún no
    h._aurixCanonicalCatHistory = TRUTH.remote.map(p => Object.assign({}, p));
    h._aurixCanonicalHistoryLoaded = true; L.setHydration(h, 'loading');
    n();                                                          // merge hecho, hidratación en vuelo
    ok('sesión sana: nada publicable todavía ⇒ 0 repintados', h.__repaints.length === 0, 'repaints=' + h.__repaints.length);
    L.setHydration(h, 'ready'); n({ force: true });                // aterriza la hidratación (cableado real)
    ok('sesión sana: el aterrizaje repinta UNA vez', h.__repaints.length === 1, 'repaints=' + h.__repaints.length);
    n(); n();                                                     // primer plano / resyncs posteriores
    ok('sesión sana: CERO repintados espurios después', h.__repaints.length === 1, 'repaints=' + h.__repaints.length);
  }

  // Y una sesión que arranca ya completamente reconciliada no repinta nunca.
  const c3 = L.newSession({ now: NOW });
  L.setTruth(c3, TRUTH);
  c3._aurixCanonicalCatHistory = TRUTH.remote.map(p => Object.assign({}, p));
  c3._aurixCanonicalHistoryLoaded = true; c3._aurixRemoteLoadOutcome = 'ok-row';
  L.setHydration(c3, 'ready'); L.call(c3, '_aurixNoteCanonicalOutcome()');
  ok('un arranque ya reconciliado no dispara repintados espurios', c3.__repaints.length === 0);

  // DISCRIMINACIÓN — el predicado ANTERIOR (réplica de una sola pierna:
  // `outcome === 'failed' && !canonLoaded`) falla esta misma secuencia. Se emula aquí para que el
  // test demuestre que detecta el defecto, en vez de pasar por una razón ajena.
  {
    const d = L.newSession({ now: NOW });
    L.setTruth(d, TRUTH);
    let latch = false; const rep = [];
    const legReplicaNote = () => {
      const canonAvailable = d._aurixCanonicalHistoryLoaded === true;
      const blocked = !!(d.currentUser && d.currentUser.id) && d._aurixRemoteLoadOutcome === 'failed' && !canonAvailable;
      if (blocked) { latch = true; return; }
      if (!latch) return;
      latch = false; rep.push(L.call(d, '_aurixChartPublicationSourcesPending()'));
    };
    d._aurixCanonicalCatHistory = null; d._aurixCanonicalHistoryLoaded = false; d._aurixRemoteLoadOutcome = 'failed';
    L.setHydration(d, 'ready'); legReplicaNote();
    d._aurixRemoteLoadOutcome = 'ok-row'; legReplicaNote();                       // paso 2
    d._aurixCanonicalCatHistory = TRUTH.remote.map(p => Object.assign({}, p));
    d._aurixCanonicalHistoryLoaded = true; legReplicaNote();                      // paso 3
    ok('el predicado antiguo se gastaba en el paso 2 y repintaba la RETENCIÓN',
      rep.length === 1 && rep[0].pending === true, JSON.stringify(rep.map(x => x.reason)));
    ok('…dejando el instante publicable SIN repintar (el test discrimina)',
      !rep.some(x => x.pending === false), 'repaints publicables=' + rep.filter(x => x.pending === false).length);
  }

  // El cableado tiene que existir en los cuatro bordes de estado, y el del merge DESPUÉS del store.
  const appjs = require('fs').readFileSync(require('path').join(L.ROOT, 'app.js'), 'utf8');
  const hooks = (appjs.match(/_aurixNoteCanonicalOutcome\(\);/g) || []).length;
  ok('cableado en cada transición de estado canónico', hooks >= 4, hooks + ' puntos de llamada');
  // Sobre el CUERPO de la función y por ORDEN de aparición, no por distancia en caracteres: un
  // comentario añadido entre ambas sentencias no debe romper el assert (ni hacerlo pasar).
  {
    const hyd = L.fnSrc('_aurixHydrateBackendSnapshots');
    const iReady = hyd.indexOf("_aurixSetBackendSnapshotsState('ready')");
    const iNote = hyd.indexOf('_aurixNoteCanonicalOutcome({ force: true })');
    ok('la rama de éxito de la hidratación pasa por el ÚNICO owner de la recuperación',
      iReady > -1 && iNote > iReady, 'ready@' + iReady + ' note@' + iNote);
    ok('el repintado directo sobrevive SÓLO como fallback del catch (un throw no puede marcar failed)',
      /catch \(_\) \{ try \{ _aurixForceMergedChartRepaint\(\)/.test(hyd));
  }
  ok('el hook del merge corre DESPUÉS de fusionar el store canónico (no antes)',
    /_aurixLocalCanonicalHash\s+= _aurixRemoteCanonicalHash;[\s\S]{0,400}_aurixNoteCanonicalOutcome\(\)/.test(appjs)
    && !/_aurixCanonicalHistoryLoaded = true;\s*\n\s*\/\/ SPEC P0 CHART RELIABILITY[\s\S]{0,120}_aurixNoteCanonicalOutcome/.test(appjs));
}

// ── 6. Sesión anónima intacta (no hay autoridad remota que esperar) ──────────
console.log('\n6. Sesión anónima — sin cambio de comportamiento:');
{
  const c = L.newSession({ now: NOW, anonymous: true });
  L.setTruth(c, { local: TRUTH.remote, remote: null, backend: [], flows: [] });
  c._aurixRemoteLoadOutcome = 'failed';
  L.setHydration(c, 'failed');
  const p = L.call(c, '_aurixChartPublicationSourcesPending()');
  ok('anónimo nunca queda pendiente por la pierna canónica', p.pending === false, JSON.stringify(p));
}

console.log('\n' + (fail ? 'FAIL' : 'PASS') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
