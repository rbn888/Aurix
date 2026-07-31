'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-FIRST-PAINT-GAP-INTEGRITY-harness — SPEC P0 CHART FIRST PAINT + INTERMITTENT GAP INTEGRITY
// ════════════════════════════════════════════════════════════════════════════
// UN SOLO harness owner para los DOS síntomas, que comparten pipeline (hidratación → merge → autoridad de
// fuente → decisión READY/PARTIAL → primera publicación).
//
// CONTRATO 1 — FIRST PAINT. Mientras alguna fuente necesaria siga pendiente y el resultado pueda acabar en
// READY, la publicación se RETIENE (placeholder premium limpio, animación no consumida) y la PRIMERA serie
// visible es la definitiva. Los holds ya certificados (v598 builder, v579 pintor, SPEC.28 presentación)
// estaban acotados a `range === '24h'`, así que 7D/30D/1A/TOTAL seguían publicando el frame provisional del
// arranque durable (SPEC.35): línea neutra + retorno suprimido → repintado a rojo/verde al reconciliar.
// El pintor MÓVIL no tenía hold en NINGÚN rango. Owner único de la condición: _aurixChartPublicationSourcesPending().
//
// CONTRATO 2 — INTEGRIDAD DE LA LÍNEA. La rama 24H de _aurixApplyRangeSourceAuthority descartaba EN BLOQUE
// toda la familia backend cuando el frontend tenía ≥2 puntos en la ventana (REGLA 1 y el fall-through legado
// .11), incluidos los snapshots que eran las ÚNICAS observaciones dentro de un hueco de frontend ≥ el suelo
// de hueco de observación ⇒ el hueco se REABRÍA y la línea salía partida. La REGLA 2 tenía el defecto
// simétrico: al dar la autoridad al backend tiraba los puntos de frontend que puenteaban un agujero del
// propio cron. Un solo owner arregla las dos direcciones y conserva el descarte donde el punto no puentea
// nada (protección del falso −0,85 % de .11 y punto solitario). Ningún punto se inventa ni se interpola.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(startIdx) { let k = app.indexOf('{', startIdx), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(startIdx, k); }
function fnSrc(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing fn ' + name); return braceSlice(i); }
function konstSrc(name) {
  const m = new RegExp('const ' + name + '\\s*=\\s*').exec(app);
  if (!m) throw new Error('missing const ' + name);
  const i = m.index, eq = m.index + m[0].length, first = app[eq];
  if (first === '{' || first === '[') { const body = braceSlice(eq); const semi = app.indexOf(';', eq + body.length); return app.slice(i, semi + 1); }
  const semi = app.indexOf(';', eq); return app.slice(i, semi + 1);
}
// código sin comentarios — los asserts "ya no existe" nunca deben leer un comentario
const bare = app.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }
function section(t) { console.log('\n' + t); }

const MIN = 60000, H = 36e5, D = 864e5, NOW = 1_800_000_000_000;

const CONSTS = ['_AURIX_SNAP_NEAR_MS', '_AURIX_SNAP_NEAR_FRAC', '_AURIX_SNAP_FE_AUTHORITY_MS',
  '_AURIX_CHART_EPOCH_TRUST', '_AURIX_CHART_EPOCH_BAND_LO', '_AURIX_CHART_24H_FE_AUTHORITY',
  '_AURIX_CHART_SEGMENT_SOURCE_AUTHORITY', '_AURIX_CHART_24H_COVERAGE_AWARE_AUTHORITY',
  '_AURIX_24H_COVERAGE_THR', '_AURIX_24H_MIN_BACKEND_POINTS', '_AURIX_VP_GAP_FLOOR_MS',
  '_AURIX_VP_GAP_MEDIAN_MULT', '_AURIX_OBS_GAP_MIN_MS', '_AURIX_OBS_GAP_MAX_MS', '_AURIX_EMG_RANGE_MS',
  '_AURIX_BACKEND_SNAPSHOTS_ENABLED', '_AURIX_BACKEND_SNAPSHOTS_AUTOLOAD',
  '_AURIX_CHART_FIRSTPAINT_HOLD_ALL_RANGES'];
const FNS = ['_aurixNormalizeBackendSnapshot', '_aurixMergeSnapshotSources', '_aurixTrustedChartSource',
  '_aurixSourceFamily', '_aurixFrontendUsableInWindow', '_aurix24hSourceCoverage',
  '_aurix24hStripNonAuthoritativePreservingHoles', '_aurixApplyRangeSourceAuthority',
  '_aurixEnforceSegmentSourceAuthority', '_aurixRealGapFloorMs', '_aurix24hReconcileInFlight',
  '_aurixChartPublicationSourcesPending'];
// globales de sesión que los predicados leen con `typeof … !== 'undefined'` (inyectables por escenario)
const ctx = {
  console: { log() {}, warn() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date, Set, Object,
  currentUser: null, _aurixCanonicalHistoryLoaded: true, _aurixRemoteLoadOutcome: 'ok-row',
  _aurixBackendSnapshotsState: 'ready',
};
vm.createContext(ctx);
const missing = [];
CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (_) { missing.push('const ' + c); } });
FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (_) { missing.push('fn ' + f); } });
const G = n => vm.runInContext(n, ctx);
const has = n => { try { return typeof G(n) === 'function'; } catch (_) { return false; } };
function setSession(s) { Object.keys(s).forEach(k => { ctx[k] = s[k]; }); }

// ── generadores de datos realistas ─────────────────────────────────────────
// frontend (histórico canónico/local): cadencia de 60 s mientras la app está abierta
function feRun(t0, durMs, v0, dv) { const o = []; for (let t = t0, i = 0; t <= t0 + durMs; t += 60000, i++) o.push({ ts: t, total: +(v0 + i * dv).toFixed(2), real_estate: 0 }); return o; }
// backend portfolio_snapshots: cadencia real del cron (*/15), forma CRUDA de la tabla
function beRun(t0, t1, v0, dv) { const o = []; for (let t = t0, i = 0; t <= t1; t += 15 * MIN, i++) o.push({ ts: t, total_value_usd: +(v0 + i * dv).toFixed(2), real_estate: 0, confidence: 'scheduled', market_state: 'closed' }); return o; }
function maxGap(a) { const t = (a || []).filter(p => p && Number.isFinite(p.ts)).map(p => p.ts).sort((x, y) => x - y); let g = 0; for (let i = 1; i < t.length; i++) g = Math.max(g, t[i] - t[i - 1]); return g; }
function famCount(a, f) { return (a || []).filter(p => G('_aurixSourceFamily')(p) === f).length; }
function obsFloor(a, r) { const t = (a || []).filter(p => p && Number.isFinite(p.ts)).map(p => ({ time: p.ts, value: 1 })).sort((x, y) => x.time - y.time); return G('_aurixRealGapFloorMs')(t, r); }
// La continuidad se juzga SOBRE LA VENTANA DEL RANGO, que es lo único que se dibuja (la extracción de
// ventana la hace después buildValidatedHistoricalSeries stage-10). Un hueco anterior a la ventana —el
// salto de una cuenta legacy hasta su historia reciente— nunca llega a la línea visible.
function inWindow(a, range) {
  const span = G('_AURIX_EMG_RANGE_MS')[range];
  const ts = (a || []).filter(p => p && Number.isFinite(p.ts)).map(p => p.ts);
  if (!ts.length) return [];
  const nowRef = Math.max.apply(null, ts);
  const start = (range === 'all' || !Number.isFinite(span)) ? -Infinity : nowRef - span;
  return a.filter(p => p && Number.isFinite(p.ts) && p.ts >= start);
}
// pipeline real hasta la autoridad de fuente (las etapas que deciden qué puntos sobreviven al hueco)
function pipeline(fe, beRaw, range) {
  const merged = G('_aurixMergeSnapshotSources')(fe, beRaw);
  const epoch = G('_aurixTrustedChartSource')(merged);
  const auth = G('_aurixApplyRangeSourceAuthority')(epoch.slice(), range);
  const win = inWindow(auth, range);
  const floor = obsFloor(win, range);
  return { merged, epoch, auth, win, floor, gap: maxGap(win),
    split: maxGap(win) >= floor, mergedGap: maxGap(inWindow(merged, range)) };
}
// ¿alguna observación válida dentro del intervalo? (la única razón legítima de un hueco)
function observationsIn(all, t0, t1) { return all.filter(p => p && Number.isFinite(p.ts) && p.ts > t0 && p.ts < t1).length; }

console.log('AURIX-CHART-FIRST-PAINT-GAP-INTEGRITY — SPEC P0 first paint + gap integrity');
if (missing.length) console.log('  (no extraídos todavía: ' + missing.join(', ') + ')');

// ══════════════════════════════════════════════════════════════════════════
section('CONTRATO 1 — FIRST PAINT (owner de la condición de retención)');
// ══════════════════════════════════════════════════════════════════════════
ok('1.0 existe el predicado único _aurixChartPublicationSourcesPending', has('_aurixChartPublicationSourcesPending'));
if (has('_aurixChartPublicationSourcesPending')) {
  const P = () => G('_aurixChartPublicationSourcesPending')();
  const U = { id: 'u1' };
  // CASO 1 — cuenta madura + reconciliación pendiente ⇒ retener (cualquier rango)
  setSession({ currentUser: U, _aurixRemoteLoadOutcome: null, _aurixCanonicalHistoryLoaded: false, _aurixBackendSnapshotsState: 'idle' });
  ok('1.1 carga remota sin resolver ⇒ pendiente', P().pending === true, JSON.stringify(P()));
  setSession({ currentUser: U, _aurixRemoteLoadOutcome: 'ok-row', _aurixCanonicalHistoryLoaded: false, _aurixBackendSnapshotsState: 'ready' });
  ok('1.2 reconcile canónico en vuelo ⇒ pendiente', P().pending === true, JSON.stringify(P()));
  setSession({ currentUser: U, _aurixRemoteLoadOutcome: 'ok-row', _aurixCanonicalHistoryLoaded: true, _aurixBackendSnapshotsState: 'loading' });
  ok('1.3 hidratación de backend en vuelo ⇒ pendiente', P().pending === true, JSON.stringify(P()));
  // CASO 2 — reconciliación completa ⇒ liberar (la primera serie visible es la definitiva)
  setSession({ currentUser: U, _aurixRemoteLoadOutcome: 'ok-row', _aurixCanonicalHistoryLoaded: true, _aurixBackendSnapshotsState: 'ready' });
  ok('1.4 todo reconciliado ⇒ NO pendiente', P().pending === false, JSON.stringify(P()));
  // CASO 3 — cuenta nueva sin fila remota: es un final terminal, no una espera
  setSession({ currentUser: U, _aurixRemoteLoadOutcome: 'no-row', _aurixCanonicalHistoryLoaded: true, _aurixBackendSnapshotsState: 'ready' });
  ok('1.5 cuenta nueva (no-row) ⇒ NO pendiente (PARTIAL_HISTORY real puede publicarse)', P().pending === false, JSON.stringify(P()));
  // CASO 7 — offline / fallo real: fallback durable terminal, JAMÁS deadlock
  setSession({ currentUser: U, _aurixRemoteLoadOutcome: 'failed', _aurixCanonicalHistoryLoaded: false, _aurixBackendSnapshotsState: 'failed' });
  ok('1.6 offline: carga fallida ⇒ NO pendiente (fallback durable, sin deadlock)', P().pending === false, JSON.stringify(P()));
  setSession({ currentUser: U, _aurixRemoteLoadOutcome: 'ok-row', _aurixCanonicalHistoryLoaded: true, _aurixBackendSnapshotsState: 'failed' });
  ok('1.7 hidratación de backend fallida ⇒ NO pendiente (sin carga infinita)', P().pending === false, JSON.stringify(P()));
  // anónimo: local ES canónico ⇒ nunca espera nada (si no, deadlock permanente)
  setSession({ currentUser: null, _aurixRemoteLoadOutcome: null, _aurixCanonicalHistoryLoaded: false, _aurixBackendSnapshotsState: 'idle' });
  ok('1.8 sesión anónima ⇒ NO pendiente (sin deadlock)', P().pending === false, JSON.stringify(P()));
  setSession({ currentUser: null, _aurixRemoteLoadOutcome: 'ok-row', _aurixCanonicalHistoryLoaded: true, _aurixBackendSnapshotsState: 'ready' });
}

section('CONTRATO 1 — los tres sitios de publicación dejan de estar acotados a 24H');
// builder (v598): la retención del primer frame vale para todos los rangos
ok('1.9 builder: la retención del primer frame NO está acotada a 24H',
  /_holdFirstPaint\s*=/.test(bare) && !/_hold(24h)?FirstPaint\s*=\s*\(?\s*\(?r\s*===\s*'24h'/.test(bare),
  (/_hold\w*FirstPaint\s*=\s*[^;]{0,120};/.exec(bare) || ['no encontrado'])[0].replace(/\s+/g, ' '));
// pintor de escritorio (v579)
const holdDesktop = /if\s*\([^{]*!_frc\.badgeEligible[^{]*\)\s*\{/.exec(bare);
ok('1.10 pintor escritorio: hold sin `emg.range === \'24h\'` y sobre el predicado único',
  !!holdDesktop && !/emg\.range\s*===\s*'24h'/.test(holdDesktop[0]) && /_aurixChartPublicationSourcesPending/.test(holdDesktop[0]),
  holdDesktop ? holdDesktop[0].replace(/\s+/g, ' ').slice(0, 170) : 'no encontrado');
// pintor móvil (nunca tuvo hold: paridad obligatoria)
const mobileFn = (function () { try { return fnSrc('renderAurixMobileLiteChart'); } catch (_) { return ''; } })();
ok('1.11 pintor móvil: tiene el MISMO hold que escritorio (paridad)',
  /_aurixChartPublicationSourcesPending/.test(mobileFn), 'renderAurixMobileLiteChart no consulta el predicado');
// SPEC.28: el estado de presentación no puede publicar PARTIAL_HISTORY como estado transitorio
const frcSrc = (function () { try { return fnSrc('_aurixResolveFinalRenderSeriesContract'); } catch (_) { return ''; } })();
const presRule = /if\s*\([^\n]*PublicationSourcesPending[^\n]*\)\s*return\s*'CALCULATING'/.test(frcSrc.replace(/\/\/[^\n]*/g, ''));
ok('1.12 SPEC.28: PARTIAL_HISTORY retenido en CUALQUIER rango mientras haya fuentes pendientes', presRule,
  'la proyección de presentación sigue acotada a 24H');
// la animación es one-shot sobre el primer 'ready' genuino: el hold pinta 'building', así que no se consume
ok('1.13 animación one-shot: sólo se dispara al entrar en ready por primera vez (no la consume el hold)',
  /state\s*===\s*'ready'\s*&&\s*!fromLastGood\s*&&\s*!suppressReveal\s*&&\s*prev\s*!==\s*'ready'/.test(bare));
// prohibiciones explícitas del SPEC: la retención se decide SÓLO por estado, nunca por tiempo transcurrido
const predSrc = has('_aurixChartPublicationSourcesPending') ? fnSrc('_aurixChartPublicationSourcesPending').replace(/\/\/[^\n]*/g, '') : '';
ok('1.14 la retención se decide por estado, sin timers/delays/tiempo transcurrido',
  !!predSrc && !/setTimeout|setInterval|Date\.now|performance\.now/.test(predSrc));
// el pintor móvil reutiliza SU idiom de convergencia ya existente (el mismo de sus ramas 'pending'
// hermanas), no un delay nuevo: reconcile e hidratación ya llaman a scheduleAurixMobileLite.
const mobilePendingBranches = (mobileFn.match(/_aurixMobileLiteEmptyRetries\s*<\s*6/g) || []).length;
ok('1.15 el hold móvil reutiliza el retry de convergencia existente (no un delay nuevo)',
  mobilePendingBranches >= 2 && /_aurixForceMergedChartRepaint[\s\S]{0,600}?scheduleAurixMobileLite/.test(bare),
  'ramas pending con el retry existente = ' + mobilePendingBranches);

// ══════════════════════════════════════════════════════════════════════════
section('CONTRATO 2 — INTEGRIDAD DE LA LÍNEA (autoridad de fuente 24H)');
// ══════════════════════════════════════════════════════════════════════════
if (missing.some(m => /_aurix24hStripNonAuthoritativePreservingHoles/.test(m))) {
  ok('2.0 existe el descarte 24H que preserva puentes de hueco', false, '_aurix24hStripNonAuthoritativePreservingHoles ausente');
} else ok('2.0 existe el descarte 24H que preserva puentes de hueco', true);

// CASO 4 — frontend con hueco + backend continuo cada 15 min: el backend SOBREVIVE y la serie final es continua
{
  const fe = feRun(NOW - 24 * H, 2 * H, 9800, 0.3).concat(feRun(NOW - 11 * H, 11 * H, 10050, 0.2));  // hueco de 11 h (app cerrada)
  const be = beRun(NOW - 22 * H, NOW - 11 * H, 9840, 1.1);                                            // cron cada 15 min dentro del hueco
  const p = pipeline(fe, be, '24h');
  ok('2.1 [24H] el puente de backend dentro del hueco de frontend SOBREVIVE a la autoridad',
    famCount(p.auth, 'backend') > 0, 'backend tras autoridad = ' + famCount(p.auth, 'backend') + ' (merge tenía ' + famCount(p.merged, 'backend') + ')');
  ok('2.2 [24H] la serie final es CONTINUA (no se reabre el hueco)', !p.split,
    'maxGap=' + (p.gap / H).toFixed(2) + 'h ≥ suelo=' + (p.floor / H).toFixed(2) + 'h');
  ok('2.3 [24H] sin puntos inventados: cada punto final viene de una fuente real',
    p.auth.every(q => p.merged.indexOf(q) >= 0) && p.auth.length <= p.merged.length);
  ok('2.4 [24H] el extremo final sigue siendo frontend (retorno/baseline intactos)',
    G('_aurixSourceFamily')(p.auth[p.auth.length - 1]) === 'frontend');
}
// mismo caso en 7D (rango largo ya certificado — no debe cambiar)
{
  const fe = feRun(NOW - 7 * D, 4 * H, 9500, 0.4).concat(feRun(NOW - 4 * D, 3 * H, 9700, 0.3)).concat(feRun(NOW - 2 * H, 2 * H, 10000, 0.2));
  const be = beRun(NOW - 7 * D + 5 * H, NOW - 3 * H, 9520, 0.06);
  const p = pipeline(fe, be, '7d');
  ok('2.5 [7D] continuidad de rango largo preservada (SPEC.38 intacto)', !p.split && famCount(p.auth, 'backend') > 0,
    'gap=' + (p.gap / H).toFixed(2) + 'h suelo=' + (p.floor / H).toFixed(2) + 'h backend=' + famCount(p.auth, 'backend'));
}
// CASO 4b — el backend no puede ganar la autoridad con cobertura CIEGA A HUECOS y tirar el frontend que puentea
{
  const fe = feRun(NOW - 13 * H, 2 * H, 10000, 0.2);                                   // sesión que puentea el agujero del cron
  const be = beRun(NOW - 24 * H, NOW - 20 * H, 9900, 1).concat(beRun(NOW - 4 * H, NOW, 10100, 1));  // cron caído 16 h
  const p = pipeline(fe, be, '24h');
  ok('2.6 [24H] la autoridad de backend NO descarta el frontend que puentea su propio agujero',
    famCount(p.auth, 'frontend') === fe.length, 'frontend tras autoridad = ' + famCount(p.auth, 'frontend') + '/' + fe.length);
  ok('2.7 [24H] y el backend se conserva íntegro (nada se pierde por la corrección)',
    famCount(p.auth, 'backend') === famCount(p.merged, 'backend'),
    'backend ' + famCount(p.auth, 'backend') + '/' + famCount(p.merged, 'backend'));
  // el punto SOLITARIO de la familia no autoritativa (que no puentea nada) se sigue descartando
  {
    const lone = [{ ts: NOW - 30 * MIN, total: 10000, real_estate: 0 }];
    const beHole = beRun(NOW - 24 * H, NOW - 18 * H, 9800, 1).concat(beRun(NOW - 8 * H, NOW - 2 * H, 9900, 1));
    const q = pipeline(lone, beHole, '24h');
    ok('2.7b [24H] punto de frontend solitario ⇒ sigue descartado (sin alternancia de fuentes)',
      famCount(q.auth, 'frontend') === 0, 'frontend superviviente = ' + famCount(q.auth, 'frontend'));
  }
}
// CASO 5 — hueco realmente SIN observaciones: la segmentación legítima se preserva
{
  const fe = feRun(NOW - 6 * D, 4 * H, 9600, 0.3).concat(feRun(NOW - 2 * H, 2 * H, 10000, 0.2));
  const be = beRun(NOW - 6 * D, NOW - 6 * D + 3 * H, 9600, 0.2);                        // nada entre medias: apagón real
  const p = pipeline(fe, be, '7d');
  ok('2.8 [7D] hueco sin observaciones ⇒ segmentación legítima preservada', p.split,
    'gap=' + (p.gap / H).toFixed(2) + 'h suelo=' + (p.floor / H).toFixed(2) + 'h');
  ok('2.9 [7D] y no se rellena con nada sintético',
    observationsIn(p.auth, NOW - 6 * D + 4 * H, NOW - 2 * H) === 0);
}
// CASO 6 — cuenta legacy (histórico largo) y cuenta nueva: mismo contrato de continuidad
{
  const legacyFe = feRun(NOW - 300 * D, 6 * H, 4000, 0.5).concat(feRun(NOW - 26 * H, 2 * H, 9900, 0.3)).concat(feRun(NOW - 10 * H, 10 * H, 10000, 0.2));
  const legacyBe = beRun(NOW - 24 * H, NOW - 10 * H, 9950, 0.6);
  const pl = pipeline(legacyFe, legacyBe, '24h');
  const newFe = feRun(NOW - 26 * H, 2 * H, 9900, 0.3).concat(feRun(NOW - 10 * H, 10 * H, 10000, 0.2));
  const pn = pipeline(newFe, legacyBe, '24h');
  ok('2.10 [24H] cuenta legacy y cuenta nueva: mismo contrato de continuidad', !pl.split && !pn.split,
    'legacy split=' + pl.split + ' nueva split=' + pn.split);
}
// CASO 8 — sin regresión: el descarte 24H sigue siendo idéntico donde el frontend es DENSO (nada que puentear)
{
  const fe = feRun(NOW - 20 * H, 20 * H, 10000, 0.05);                                   // frontend denso, sin huecos
  const be = beRun(NOW - 20 * H, NOW, 9990, 0.05);                                       // backend compitiendo intradía
  const p = pipeline(fe, be, '24h');
  ok('2.11 [24H] frontend denso ⇒ CERO backend intradía (sin dientes; .11 byte-identical)',
    famCount(p.auth, 'backend') === 0, 'backend superviviente = ' + famCount(p.auth, 'backend'));
  ok('2.12 [24H] frontend denso ⇒ ninguna alternancia de familias en la serie final',
    new Set(p.auth.map(q => G('_aurixSourceFamily')(q))).size === 1);
}
// CASO 8b — todos los rangos siguen produciendo serie utilizable (sin regresión de contratos)
{
  const fe = feRun(NOW - 30 * D, 5 * H, 8000, 0.4).concat(feRun(NOW - 20 * H, 2 * H, 9900, 0.3)).concat(feRun(NOW - 6 * H, 6 * H, 10000, 0.2));
  const be = beRun(NOW - 30 * D, NOW - 6 * H, 8010, 0.05);
  let allOk = true, detail = [];
  ['24h', '7d', '30d', '1y', 'all'].forEach(r => {
    const p = pipeline(fe, be, r);
    const good = p.auth.length >= 2 && p.auth.every(q => Number.isFinite(q.ts));
    if (!good) allOk = false;
    detail.push(r + ':' + p.auth.length + (p.split ? '/split' : ''));
  });
  ok('2.13 24H/7D/30D/1A/TOTAL siguen entregando serie válida', allOk, detail.join(' '));
}

section('PROHIBICIONES DEL SPEC');
const stripSrc = has('_aurix24hStripNonAuthoritativePreservingHoles') ? fnSrc('_aurix24hStripNonAuthoritativePreservingHoles').replace(/\/\/[^\n]*/g, '') : '';
ok('3.1 el descarte 24H no fabrica ni interpola puntos',
  !!stripSrc && !/interpolat|synthetic|push\(\s*\{/.test(stripSrc));
ok('3.2 el descarte 24H sólo filtra (preserva orden y objetos originales)',
  !!stripSrc && /\.filter\(/.test(stripSrc) && !/\.push\(|\.splice\(|\.reverse\(/.test(stripSrc));
ok('3.3 no se ocultó nada con CSS ni con tiempo en la retención',
  !/PublicationSourcesPending[\s\S]{0,300}?(display\s*:\s*none|visibility\s*:\s*hidden)/.test(bare));

console.log('\n' + (fail === 0 ? 'RESULT: GO' : 'RESULT: NO-GO') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
