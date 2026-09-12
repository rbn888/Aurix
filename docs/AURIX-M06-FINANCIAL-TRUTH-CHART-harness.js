'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-M06-FINANCIAL-TRUTH-CHART — bloques 6 y 7 de M.06
// ════════════════════════════════════════════════════════════════════════════
// DOS contratos que se auditan juntos porque el segundo es la superficie del primero:
//
//   6 · UNA SOLA VERDAD FINANCIERA. Cada concepto (patrimonio total, invertible, valor por
//       activo, cantidad usable, rendimiento del periodo, % del badge) tiene UN owner y sus
//       consumidores DELEGAN. No se exige que todas las superficies muestren el mismo número
//       —miden conceptos distintos— sino que no haya dos motores contestando a la misma
//       pregunta ni un fallback que cambie el SIGNIFICADO del dato en silencio.
//
//   7 · CHART INTEGRATION. El badge y la serie hablan del mismo periodo, y el estado visible
//       del retorno es honesto.
//
// P1 CERRADO — «CALCULANDO…» ERA UN ESTADO TERMINAL. El motor ya clasificaba el bloqueo en
// códigos explícitos (SPEC.21 C6) y su propio comentario prometía «never a bare generic
// Calculando», pero la proyección de presentación tenía tres salidas y su caída final era,
// literalmente, `return 'CALCULATING'`. Una serie ESTABLE, con línea dibujada, ventana
// COMPLETA y fuentes asentadas, cuyo badge está bloqueado por algo que no se va a resolver,
// se quedaba en «Calculando…» para siempre: una afirmación falsa sobre lo que la app hace.
// El arreglo es de PRESENTACIÓN — `_aurixResolveFinalRenderSeriesContract` queda byte a byte
// intacto, igual que el epoch, el reductor y los guards de cobertura.
//
// P1 CERRADO — la bandera `?aurix_pce_founder=1` se guardaba en localStorage y cambiaba la
// FUENTE DE DATOS del gráfico en ese dispositivo para siempre.
//
// MÉTODO: se ejecutan los owners REALES con el cargador ya probado de
// AURIX-CHART-FIRST-PAINT-GAP-INTEGRITY (mismo patrón, misma lista de dependencias ampliada).
// No se re-audita lo certificado en otro gate: contrato de retorno unificado, deadlock,
// readiness de publicación, cobertura de valoración, LKG del gráfico, reductor v708, paridad
// de categorías ni la identidad Σ==total del Dashboard (AURIX-M06-DASHBOARD-PORTFOLIO).
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function braceSlice(startIdx) { let k = app.indexOf('{', startIdx), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(startIdx, k); }
function fnSrc(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('falta fn ' + name); return braceSlice(i); }
function konstSrc(name) {
  const m = new RegExp('const ' + name + '\\s*=\\s*').exec(app);
  if (!m) throw new Error('falta const ' + name);
  const i = m.index, eq = m.index + m[0].length, first = app[eq];
  if (first === '{') { const body = braceSlice(eq); const semi = app.indexOf(';', eq + body.length); return app.slice(i, semi + 1); }
  // arrays y literales de una línea: hasta el `;` de cierre de la propia declaración
  const semi = app.indexOf(';', eq); return app.slice(i, semi + 1);
}
let pass = 0, fail = 0; const failed = [];
function ok(n, c, info) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; failed.push(n); console.log('  ✗ ' + n + (info !== undefined ? '  →  ' + info : '')); } }
function section(t) { console.log('\n' + t); }
const D = 864e5, H = 36e5;

// ── Sandbox con los owners reales ──────────────────────────────────────────
const CONSTS = ['_AURIX_EMG_RANGE_MS', '_AURIX_EMG_MIN_POINTS', '_AURIX_ALL_MIN_TRUST_POINTS',
  '_AURIX_CHART_RETURN_CONTRACT_UNIFICATION', '_AURIX_CHART_CANONICAL_REFRESH_DETERMINISM',
  '_AURIX_CHART_RELIABILITY_DEADLOCK_RESOLUTION', '_AURIX_CHART_SHORT_HISTORY_DISPLAY',
  '_AURIX_CHART_SHORT_HISTORY_MIN_DAYS', '_AURIX_BACKEND_SNAPSHOTS_ENABLED',
  '_AURIX_BACKEND_SNAPSHOTS_AUTOLOAD', '_AURIX_PUBLICATION_STATE',
  '_AURIX_LB2_BLOCK_ON_HYDRATION_FAILED', '_AURIX_CHART_BLOCK_ON_CANONICAL_READ_FAILED',
  '_AURIX_RETURN_PENDING_TEXT', '_AURIX_HIST_PARTIAL_TEXT', '_AURIX_HIST_AVAILABLE_TEXT',
  '_AURIX_RETURN_INSUFFICIENT_HISTORY_TEXT', '_AURIX_RETURN_UNAVAILABLE_TEXT',
  '_AURIX_RETURN_TRANSIENT_CODES', '_AURIX_RETURN_HISTORY_CODES', '_AURIX_RETURN_HISTORY_REASON_RE',
  '_AURIX_PCE_FOUNDER_KEY'];
const FNS = ['_aurixChartStateI18n', '_aurixReturnPendingHTML', '_aurixChartPublicationSourcesPending',
  '_aurix24hReconcileInFlight', '_aurixResolvePublicationReadiness',
  '_aurixResolveChartReturnContract', '_aurixBuildContinuityValidatedSeries',
  '_aurixShortHistoryDisplay', '_aurixVisualTrustGate', '_aurixStableDisplayAnchor',
  '_aurixCanonicalReturnAnchorIndex', '_aurixResolveReliabilityDeadlock',
  '_aurixConfirmedBridgeGaps', '_aurixVerticalJumps', '_aurixCapitalStepBreaks',
  '_aurixSparseRampBreaks', '_aurixSplitAtGaps', '_aurixStructuralBreaks',
  '_aurixRegimeBoundaryBreaks', '_aurixRealGapFloorMs',
  '_aurixResolveFinalRenderSeriesContract',
  // los owners NUEVOS de presentación (el fix de este bloque)
  '_aurixResolveReturnPresentation', '_aurixReturnPresentationText',
  '_aurixHistoryPresentationBadge', '_aurixExpectedBadgeLabel', '_aurixClassifyDomPresentation',
  // la bandera founder
  '_aurixPceFounderStore', '_aurixPceFounderOwner', '_aurixPceFounderMode', '_aurixPceFounderClear',
  '_aurixPceFounderInit'];

function store(init) {
  const m = Object.assign({}, init || {});
  return { _m: m, getItem: k => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } };
}
const session = { local: store(), sess: store(), search: '' };
const ctx = {
  console: { log() {}, warn() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date, Set, Object, RegExp, String,
  currentUser: null, _aurixCanonicalHistoryLoaded: true, _aurixRemoteLoadOutcome: 'ok-row',
  _aurixBackendSnapshotsState: 'ready', _aurixActiveUserId: null,
  T: undefined, lang: undefined,
  localStorage: session.local,
  window: { sessionStorage: session.sess, location: { get search() { return session.search; } } },
  updateChart() {}, _aurixPceOverlayMount() {}, _aurixReconInvalidate() {},
};
vm.createContext(ctx);
const missing = [];
CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (_) { missing.push('const ' + c); } });
FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (_) { missing.push('fn ' + f); } });
const G = n => vm.runInContext(n, ctx);
const has = n => { try { return typeof G(n) === 'function'; } catch (_) { return false; } };

console.log('\nAURIX-M06-FINANCIAL-TRUTH-CHART — bloques 6 y 7 de M.06');
if (missing.length) console.log('  (no extraídos: ' + missing.join(', ') + ')');

// ── Fixtures: objetos `emg` con la MISMA forma que publica el constructor real ──
function pts(n, t0, stepMs, v0, dv) { const o = []; for (let i = 0; i < n; i++) o.push({ ts: t0 + i * stepMs, value: +(v0 + i * dv).toFixed(2) }); return o; }
const NOW = 1_800_000_000_000;
// 30D con ventana COMPLETA y badge BLOQUEADO: el caso exacto del P1.
function emg30dBlocked() {
  const p = pts(40, NOW - 30 * D, (30 * D) / 39, 10000, 5);
  // `state:'ready'` es la forma REAL del régimen del P1: el constructor tiene una serie válida
  // (por eso se dibuja la línea) y lo que está bloqueado es SÓLO el retorno.
  return { range: '30d', state: 'ready', points: p, currentValue: p[p.length - 1].value,
    returnState: 'pending_flow_reconciliation', badgeReturnPct: null, returnPct: null,
    returnValue: null, coverageRatio: 1, displayedRangeState: 'full',
    historyTooShortForRange: false, finalPointCount: p.length,
    returnSuppressedReason: 'pending_flow_reconciliation', color: 'flat', chartHash: 'h30' };
}
// 30D publicable: el mismo régimen pero con retorno de confianza.
function emg30dOk() {
  const e = emg30dBlocked();
  return Object.assign(e, { state: 'ready', returnState: 'ok', badgeReturnPct: 1.95,
    returnPct: 1.95, returnValue: 195, returnSuppressedReason: null });
}
// 1A con historia real muy corta (el régimen del epoch de junio).
function emg1yShort() {
  const p = pts(6, NOW - 5 * D, D, 10000, 20);
  return { range: '1y', state: 'calculating', reason: 'insufficient_requested_range_history',
    points: p, currentValue: p[p.length - 1].value,
    returnState: 'insufficient_return_history', badgeReturnPct: null, returnPct: null,
    returnValue: null, coverageRatio: 0.02, displayedRangeState: 'partial_history',
    historyTooShortForRange: true, finalPointCount: p.length,
    returnSuppressedReason: 'insufficient_requested_range_history', color: 'flat', chartHash: 'h1y' };
}
const frcOf = e => G('_aurixResolveFinalRenderSeriesContract')(e, e.range, 'desktop');
const badgeOf = e => G('_aurixHistoryPresentationBadge')(e, 'desktop');
const textOf = e => String(badgeOf(e).html).replace(/<[^>]+>/g, '').trim();
const isCalc = s => /calculando|calculating/i.test(String(s));

// ══════════════════════════════════════════════════════════════════════════
section('A — «Calculando…» ya NO es un estado terminal (P1 de 30D):');
// ══════════════════════════════════════════════════════════════════════════
ok('A.0 los owners de presentación existen y son ÚNICOS',
   has('_aurixResolveReturnPresentation') && has('_aurixReturnPresentationText') &&
   (app.match(/function _aurixResolveReturnPresentation\(/g) || []).length === 1 &&
   (app.match(/function _aurixReturnPresentationText\(/g) || []).length === 1);
{
  const e = emg30dBlocked(), frc = frcOf(e);
  ok('A.1 el fixture reproduce el régimen del P1: línea dibujada y badge bloqueado',
     frc.lineEligible === true && frc.badgeEligible === false, 'lineEligible=' + frc.lineEligible + ' badgeEligible=' + frc.badgeEligible);
  ok('A.1b el motor YA clasificaba el bloqueo con códigos explícitos',
     Array.isArray(frc.reasonCodes) && frc.reasonCodes.length > 0, JSON.stringify(frc.reasonCodes));
  ok('A.1c y la proyección heredada lo dejaba en CALCULATING (el terminal falso)',
     frc.historyPresentationState === 'CALCULATING' || frc.historyPresentationState === 'UNKNOWN',
     String(frc.historyPresentationState));
  const pres = G('_aurixResolveReturnPresentation')(frc);
  ok('A.2 AHORA la presentación es TERMINAL y honesta, no «Calculando…»',
     pres !== 'CALCULATING' && !isCalc(textOf(e)), pres + ' / "' + textOf(e) + '"');
  ok('A.2b sin porcentaje, sin 0 % y sin color direccional',
     !/%/.test(textOf(e)) && badgeOf(e).className === 'chart-change flat', textOf(e) + ' / ' + badgeOf(e).className);
}
{
  const e = emg30dOk(), frc = frcOf(e);
  ok('A.3 un 30D con retorno de confianza SIGUE publicando su porcentaje',
     frc.badgeEligible === true && G('_aurixResolveReturnPresentation')(frc) === 'TRUSTED_RETURN',
     String(frc.badgeLabel));
}
{
  const e = emg1yShort(), frc = frcOf(e), pres = G('_aurixResolveReturnPresentation')(frc);
  ok('A.4 1A con historia corta: estado terminal honesto, nunca «Calculando…»',
     pres !== 'CALCULATING' && !isCalc(textOf(e)), pres + ' / "' + textOf(e) + '"');
  ok('A.4b y NO publica ningún retorno (ni un 0 % que se lea como real)',
     frc.badgeEligible === false && !/%/.test(textOf(e)), textOf(e));
}
{
  // LO TRANSITORIO SIGUE SIENDO «Calculando…»: es verdad mientras algo está en vuelo.
  const transient = { badgeEligible: false, historyPresentationState: 'CALCULATING', mode: 'full',
    reasonCodes: ['badge_calculating', 'CANONICAL_NOT_READY'], reason: 'awaiting_canonical_reconcile' };
  ok('A.5 un bloqueo TRANSITORIO conserva «Calculando…»',
     G('_aurixResolveReturnPresentation')(transient) === 'CALCULATING');
  const noEvidence = { badgeEligible: false, historyPresentationState: 'UNKNOWN' };
  ok('A.5b sin evidencia NO se declara nada terminal (contexto de unidad intacto)',
     G('_aurixResolveReturnPresentation')(noEvidence) === 'CALCULATING');
  const pendingSources = { badgeEligible: false, historyPresentationState: 'CALCULATING', mode: 'full',
    reasonCodes: ['RETURN_NOT_RELIABLE'], reason: 'x' };
  ctx._aurixBackendSnapshotsState = 'loading'; ctx.currentUser = { id: 'u1' };
  ok('A.5c con fuentes aún hidratando tampoco (gana el predicado de pendiente)',
     G('_aurixResolveReturnPresentation')(pendingSources) === 'CALCULATING');
  ctx._aurixBackendSnapshotsState = 'ready'; ctx.currentUser = null;
}
{
  // La partición completa, ejercitada por código.
  // `mode:'full'` = línea estable ya dibujada, que es donde vive el régimen del P1.
  const mk = (codes, reason) => ({ badgeEligible: false, historyPresentationState: 'CALCULATING',
    mode: 'full', reasonCodes: codes, reason: reason || '' });
  const R = f => G('_aurixResolveReturnPresentation')(f);
  ok('A.6 histórico insuficiente por VANO ⇒ INSUFFICIENT_HISTORY', R(mk(['INSUFFICIENT_REAL_SPAN'])) === 'INSUFFICIENT_HISTORY');
  ok('A.6b por PUNTOS ⇒ INSUFFICIENT_HISTORY', R(mk(['INSUFFICIENT_REAL_POINTS'])) === 'INSUFFICIENT_HISTORY');
  ok('A.6c sólo arranque ⇒ INSUFFICIENT_HISTORY', R(mk(['BOOTSTRAP_ONLY_HISTORY'])) === 'INSUFFICIENT_HISTORY');
  ok('A.6d razón textual de historia (p. ej. insufficient_validated_points) ⇒ INSUFFICIENT_HISTORY',
     R(mk(['RETURN_NOT_RELIABLE'], 'insufficient_validated_points')) === 'INSUFFICIENT_HISTORY');
  ok('A.6e conflicto de fuente canónica ⇒ RETURN_UNAVAILABLE (no se le echa la culpa a la historia)',
     R(mk(['CANONICAL_SOURCE_CONFLICT'])) === 'RETURN_UNAVAILABLE');
  ok('A.6f sin ancla determinista ⇒ RETURN_UNAVAILABLE', R(mk(['NO_DETERMINISTIC_RETURN_ANCHOR'])) === 'RETURN_UNAVAILABLE');
  ok('A.6g valor actual no disponible ⇒ TRANSITORIO (el precio está en vuelo)',
     R(mk(['CURRENT_VALUE_UNAVAILABLE'])) === 'CALCULATING');
  ok('A.6h error real ⇒ RETURN_UNAVAILABLE, nunca un número',
     G('_aurixResolveReturnPresentation')({ badgeEligible: false, mode: 'error', reasonCodes: ['error'], reason: 'error:boom' }) === 'RETURN_UNAVAILABLE');
  // LO QUE SE ESTÁ CONSTRUYENDO SIGUE SIENDO TRANSITORIO — si no, el arranque en frío pasaría a
  // anunciar «Rendimiento no disponible», que es peor mentira que la que se viene a arreglar.
  ok('A.6i arranque en frío sin puntos (mode empty) ⇒ TRANSITORIO',
     G('_aurixResolveReturnPresentation')({ badgeEligible: false, mode: 'empty', reasonCodes: ['empty'], reason: 'no_points' }) === 'CALCULATING');
  ok('A.6j constructor no listo (mode building, razón no ligada a historia) ⇒ TRANSITORIO',
     G('_aurixResolveReturnPresentation')({ badgeEligible: false, mode: 'building', reasonCodes: ['building', 'RETURN_NOT_RELIABLE'], reason: 'pending' }) === 'CALCULATING');
  ok('A.6k …pero `building` CON evidencia de historia sí es terminal',
     G('_aurixResolveReturnPresentation')({ badgeEligible: false, mode: 'building', reasonCodes: ['building', 'INSUFFICIENT_REAL_SPAN'], reason: 'short_history' }) === 'INSUFFICIENT_HISTORY');
  ok('A.6l el estado terminal NO-historia exige una línea ESTABLE ya dibujada',
     G('_aurixResolveReturnPresentation')({ badgeEligible: false, mode: 'full', reasonCodes: ['RETURN_NOT_RELIABLE'], reason: 'x' }) === 'RETURN_UNAVAILABLE' &&
     G('_aurixResolveReturnPresentation')({ badgeEligible: false, mode: 'partial_clean', reasonCodes: ['RETURN_NOT_RELIABLE'], reason: 'x' }) === 'RETURN_UNAVAILABLE');
}
{
  // UN SOLO OWNER: lo que se pinta y lo que la auditoría de DOM espera salen de la misma decisión.
  const e = emg30dBlocked(), frc = frcOf(e);
  const exp = G('_aurixExpectedBadgeLabel')(frc);
  ok('A.7 el pintor y la auditoría de DOM coinciden EXACTAMENTE',
     exp.text === textOf(e), JSON.stringify(exp) + ' vs "' + textOf(e) + '"');
  ok('A.7b y la auditoría clasifica el DOM como coherente, no como defecto',
     G('_aurixClassifyDomPresentation')(exp, textOf(e), true) === 'DOM_PRESENTATION_MATCH');
  const expOk = G('_aurixExpectedBadgeLabel')(frcOf(emg30dOk()));
  ok('A.7c un % de confianza sigue proyectándose como PERCENT', expOk.kind === 'PERCENT' && /%/.test(String(expOk.text)));
}
{
  // ES/EN: el estado terminal habla el idioma del usuario.
  ctx.T = { es: { chartInsufficientHistory: 'Historial insuficiente', chartReturnUnavailable: 'Rendimiento no disponible', chartCalculating: 'Calculando…' },
            en: { chartInsufficientHistory: 'Insufficient history', chartReturnUnavailable: 'Return unavailable', chartCalculating: 'Calculating…' } };
  ctx.lang = 'en';
  ok('A.8 en inglés el estado terminal sale en inglés',
     G('_aurixReturnPresentationText')('INSUFFICIENT_HISTORY') === 'Insufficient history' &&
     G('_aurixReturnPresentationText')('RETURN_UNAVAILABLE') === 'Return unavailable');
  ctx.lang = 'es';
  ok('A.8b y en español en español',
     G('_aurixReturnPresentationText')('INSUFFICIENT_HISTORY') === 'Historial insuficiente');
  ok('A.8c las cuatro claves existen en los DOS idiomas',
     ['chartInsufficientHistory', 'chartReturnUnavailable', 'chartPartialHistory', 'chartAvailableHistory']
       .every(k => (app.match(new RegExp('\\b' + k + ':\\s*'), 'g') ? (app.match(new RegExp('\\b' + k + ':\\s*', 'g')) || []).length : 0) === 2));
  ctx.T = undefined; ctx.lang = undefined;
}
{
  // NO-VACUIDAD: la proyección ANTERIOR (tres salidas) sobre el MISMO contrato.
  const prev = frc => {
    if (frc.badgeEligible) return 'TRUSTED_RETURN';
    const hps = frc.historyPresentationState;
    if (hps === 'PARTIAL_HISTORY') return 'PARTIAL_HISTORY';
    if (hps === 'AVAILABLE_HISTORY') return 'AVAILABLE_HISTORY';
    return 'CALCULATING';
  };
  const f30 = frcOf(emg30dBlocked());
  ok('A.9 NO-VACUIDAD · ANTES el 30D bloqueado caía en CALCULATING terminal',
     prev(f30) === 'CALCULATING' && G('_aurixResolveReturnPresentation')(f30) !== 'CALCULATING');
  ok('A.9b y el owner anterior de la etiqueta no tenía forma de decir otra cosa',
     (app.match(/return 'CALCULATING';/g) || []).length >= 1 &&
     /INSUFFICIENT_HISTORY/.test(fnSrc('_aurixResolveReturnPresentation')));
}

// ══════════════════════════════════════════════════════════════════════════
section('B — una sola verdad financiera: un owner por concepto:');
// ══════════════════════════════════════════════════════════════════════════
{
  const one = n => (app.match(new RegExp('^function ' + n + '\\(', 'gm')) || []).length === 1;
  [['patrimonio total', 'totalValueUSD'], ['invertible', 'investableValueUSD'],
   ['valor por activo', 'assetValueUSD'], ['valor nativo', 'assetNativeValue'],
   ['cantidad usable', '_aurixUsableQuantity'], ['liquidez nominal', 'liquidityNominal'],
   ['bucket de categoría', '_aurixCategoryBucket'], ['categoría de display', '_aurixDisplayCategory'],
   ['rendimiento del periodo', '_aurixComputePeriodReturn'],
   ['contrato del retorno', '_aurixResolveChartReturnContract'],
   ['contrato final de render', '_aurixResolveFinalRenderSeriesContract'],
   ['rendimiento invertible', '_aurixInvestablePerformance'],
   ['rendimiento por posición', 'computePositionPerformance'],
   ['rendimiento por categoría', 'computeCategoryPerformance'],
   ['presentación del retorno', '_aurixResolveReturnPresentation'],
  ].forEach(([concepto, owner]) => ok('B.1 UN owner para ' + concepto + ' (' + owner + ')', one(owner)));

  ok('B.2 los alias históricos DELEGAN en el owner, no recalculan',
     /function getTotalPortfolioValue\(\)\s*\{\s*return totalValueUSD\(\);\s*\}/.test(app) &&
     /return investableValueUSD\(\);/.test(fnSrc('getInvestablePortfolioValue')));
  ok('B.3 el patrimonio total y el invertible se diferencian por UN predicado deliberado',
     /function isInvestableAsset\(a\) \{ return _aurixCategoryBucket\(a\) !== 'real_estate'; \}/.test(app) &&
     /investableAssets\(\) *= *|return activeAssets\(\)\.filter\(isInvestableAsset\)/.test(app));
  ok('B.4 el % del badge sale SÓLO del contrato (un único aplicador)',
     (app.match(/const applyBadge = \(o, c\) =>/g) || []).length === 1 &&
     /o\.badgeReturnPct = \(c\.returnPct != null\) \? c\.returnPct : null;/.test(app));
  ok('B.5 el pintor lee el resultado PUBLICADO para el rango activo (atomicidad badge↔línea)',
     /_aurixPublishedChartFor\(_r\)/.test(app) && /_aurixEmergencyPaintBadgeNode\(el, _pub \|\| buildProductionPortfolioChart\(_r\), surface\)/.test(app));
  ok('B.6 un flujo de capital NO se convierte en rendimiento (neutralización + contrapartida)',
     /_aurixFlowCounterpartObserved/.test(app) && /pending_flow_reconciliation/.test(app));
  ok('B.7 la liquidez no publica rentabilidad y el inmueble no entra en el invertible',
     /real_estate/.test(fnSrc('isInvestableAsset')) && /_aurixCatReturnDisplay/.test(app));
  ok('B.8 no hay un segundo motor de rendimiento contestando lo mismo',
     (app.match(/^function _aurixInvestablePerformance\(/gm) || []).length === 1 &&
     (app.match(/^function _aurixComputePeriodReturn\(/gm) || []).length === 1);
}

// ══════════════════════════════════════════════════════════════════════════
section('C — badge y serie hablan del MISMO periodo:');
// ══════════════════════════════════════════════════════════════════════════
{
  ['24h', '7d', '30d', '1y', 'all'].forEach(r => {
    const e = emg30dBlocked(); e.range = r;
    const frc = frcOf(e);
    ok('C.1 ' + r + ': el contrato final conserva el rango pedido', frc.range === r || frc.range === undefined, String(frc.range));
  });
  const e = emg30dOk(), frc = frcOf(e);
  ok('C.2 el % publicado es el del contrato del propio rango, no un fallback de TOTAL',
     frc.badgeReturnPct === 1.95 && frc.badgeEligible === true, String(frc.badgeReturnPct));
  ok('C.3 un retorno no publicable no deja pasar ningún número',
     frcOf(emg30dBlocked()).badgeReturnPct === null);
  ok('C.4 el rango del badge lo fija `activeRange`, y es el mismo que construye la serie',
     /const _r = \(typeof activeRange !== 'undefined' \? activeRange : '24h'\);/.test(app));
  ok('C.5 una línea no elegible nunca lleva color direccional',
     /colorState = 'neutral'/.test(app) && /o\.colorClass = toneClass\(o\.colorState\)/.test(app));
  ok('C.6 el reductor v708 y el epoch siguen intactos en este bloque',
     /AURIX_INVESTABLE_CHART_EPOCH = 1780704000000/.test(app) &&
     (app.match(/^function _aurixRenderBucketReduce\(/gm) || []).length === 1);
}

// ══════════════════════════════════════════════════════════════════════════
section('D — la bandera founder no contamina ni persiste (P1):');
// ══════════════════════════════════════════════════════════════════════════
{
  const KEY = G('_AURIX_PCE_FOUNDER_KEY');
  const reset = (loc, sess, search, uid) => {
    session.local = store(loc || {}); session.sess = store(sess || {});
    ctx.localStorage = session.local; ctx.window.sessionStorage = session.sess;
    session.search = search || ''; ctx._aurixActiveUserId = uid || null;
    vm.runInContext('localStorage = globalThis.__ls;', Object.assign(ctx, { __ls: session.local }));
  };
  ok('D.0 la clave ya no se LEE de localStorage en ningún sitio',
     !/localStorage\.getItem\(_AURIX_PCE_FOUNDER_KEY\)/.test(app));

  reset({}, {}, '?aurix_pce_founder=1', 'founder-1');
  G('_aurixPceFounderInit')();
  ok('D.1 la query enciende el modo SÓLO en la sesión de la pestaña',
     G('_aurixPceFounderMode')() === true && session.sess._m[KEY] === '1:founder-1' &&
     session.local._m[KEY] === undefined, JSON.stringify({ s: session.sess._m[KEY], l: session.local._m[KEY] }));
  ok('D.1b y deja el flag de runtime encendido para ESE dispositivo',
     ctx.window.__AURIX_PORTFOLIO_RECON === true);

  // Otra cuenta en la MISMA pestaña no lo hereda.
  ctx._aurixActiveUserId = 'otro-usuario';
  ok('D.2 otra cuenta en la misma pestaña NO hereda el modo founder',
     G('_aurixPceFounderMode')() === false);
  ctx._aurixActiveUserId = 'founder-1';
  ok('D.2b y el propietario que lo encendió lo conserva', G('_aurixPceFounderMode')() === true);

  // Pestaña nueva (sessionStorage vacío) sin query ⇒ apagado.
  reset({}, {}, '', 'founder-1');
  ok('D.3 una pestaña nueva sin query arranca APAGADO (no persiste)', G('_aurixPceFounderMode')() === false);

  // El residuo heredado en localStorage se RETIRA activamente.
  reset({ [KEY]: '1' }, {}, '', 'founder-1');
  ok('D.4 un dispositivo con la clave PERSISTIDA heredada ya no está en modo founder',
     G('_aurixPceFounderMode')() === false);
  G('_aurixPceFounderInit')();
  ok('D.4b y la init RETIRA ese residuo persistido', session.local._m[KEY] === undefined);

  // El botón de salida limpia las dos.
  reset({ [KEY]: '1' }, { [KEY]: '1:founder-1' }, '', 'founder-1');
  G('_aurixPceFounderClear')();
  ok('D.5 la salida explícita limpia sesión Y el residuo persistido',
     session.sess._m[KEY] === undefined && session.local._m[KEY] === undefined &&
     G('_aurixPceFounderMode')() === false);

  ok('D.6 NO-VACUIDAD · el owner anterior persistía en localStorage y bastaba con "1"',
     !/localStorage\.setItem\(_AURIX_PCE_FOUNDER_KEY, '1'\)/.test(app) &&
     /sessionStorage/.test(fnSrc('_aurixPceFounderStore')));
  ok('D.7 y sigue sin tocar la validación PCE, la persistencia ni ningún dato',
     !/AURIX_PCE_VALIDATION_MODE\s*=/.test(fnSrc('_aurixPceFounderInit')) &&
     !/save\(|supabase|portfolioHistory/.test(fnSrc('_aurixPceFounderMode')));
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + `  ${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
