'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ADVANCED-INTELLIGENCE-CLOSURE-harness — SPEC ADVANCED INTELLIGENCE
// «CIERRE DEFINITIVO DE COHERENCIA, UTILIDAD Y PRESENTACIÓN»
// ════════════════════════════════════════════════════════════════════════════
// Gate focal del cierre. Cubre, por su número de sección del SPEC:
//
//   §4  · operaciones ≠ posiciones — el defecto «Tienes 2 posiciones registradas»
//   §5  · procedencia temporal y coste desconocido (fail-closed, sin qty × 1)
//   §6  · Salud visible desde el primer activo, sin frase bajo el estado
//   §7  · titular, bandeja de revisión y orden de lectura del hero
//   §8  · etiquetas con evidencia, y el contexto declarado como CONTEXTO
//   §9  · preguntas: la que faltaba, y el cooldown que una operación reabre
//   §11 · radar: cinco marcadores, figura cerrada, centro no medible
//   §12 · un peso positivo pequeño NO es 0 %
//   §14 · «Lo que importa hoy»: lado cero, periodo en la frase, cero metadatos
//   §15 · la Memoria no guarda preguntas pendientes
//   §17 · «Lo que Aurix ha visto» deja de publicar una no-noticia
//   §19 · UN solo recorrido del Core por pintura
//   §20 · lenguaje de producto (fuera «deliberada», «material», «no es un resultado»)
//
// EL RENDERER ES REAL. Se ejecuta `_renderIntelligenceCommandCenter` completo
// sobre las dos cuentas de referencia del SPEC y sobre los casos límite que
// enumera, y se leen su HTML y sus `data-*`. La maquinaria de sandbox es la misma
// que usa AURIX-INTEL-TRACEABILITY: mismo extractor de fuentes, mismos
// diccionarios REALES de los dos idiomas, mismos owners cargados sin stubear
// ninguno de los que se certifican (ver feedback_harness_no_stubear_lo_certificado).
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
// El gate se lee a sí mismo para poder afirmar que una certificación previa
// SIGUE existiendo, sin duplicar su medición aquí.
const s_self = fs.readFileSync(__filename, 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
function blockOf(a,z){ const i=app.indexOf(a); if(i<0) throw new Error('missing '+a);
  const e=app.indexOf(z,i); return app.slice(i,e+z.length); }
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
function konstSrc(name){ const s='const '+name+' ='; const i=app.indexOf(s); if(i<0) throw new Error('missing const '+name);
  let k=i, depth=0, started=false; for(;k<app.length;k++){ const c=app[k]; if(c==='('||c==='{'||c==='[') {depth++;started=true;} else if(c===')'||c==='}'||c===']') depth--; else if(c===';'&&(!started||depth===0)) { k++; break; } }
  return app.slice(i,k); }
const PC01_SRC = blockOf('const _AURIX_AI_AVAIL = Object.freeze({',
  "        + 'unavailable never becomes 0; no aggregate wealth-health score.',\n  });\n}");
const ENGINE_SRC = blockOf('const _AURIX_INTEL_FIELDS = Object.freeze({',
  "        + 'It may never change a financial value, its availability or its coverage.',\n  });\n}");
const bareOf = t => t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
let pass=0,fail=0; function ok(n,c,info){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(info?'  ['+info+']':''));} }


// ── UN `ok` QUE RECIBE UNA PROMESA PASA SIEMPRE ────────────────────────────
// La revisión de seguridad lo demostró con una línea: `!!(async()=>false)()`
// es `true`. Todos los asserts que ejercitaban un camino asíncrono estaban
// PASANDO SIN PROBAR NADA — el peor defecto posible en un gate, porque su
// verde era exactamente igual al verde de verdad. `okA` encola la promesa y
// se resuelve ANTES del resumen; ningún assert asíncrono puede volver a
// colarse en silencio.
const _pending = [];
function okA(n, promise, info) {
  _pending.push(Promise.resolve(promise).then(
    (v) => ok(n, v === true, info),
    (e) => ok(n, false, 'THREW ' + ((e && e.message) || e))));
}
async function drainAsserts() { await Promise.all(_pending); }
const DAY = 86400000, HOUR = 36e5, MIN = 60000;
const T0 = 1750000000000;
const NOW = Date.now();                 // the certified exposure reader checks freshness against the real clock

// ── REAL copy, lifted out of both dictionaries ──────────────────────────────
// Not a stub: the actual `intv4_*` block from each language, plus the few
// `intcc_*`/`healthScore*` keys the header still uses. If a key the renderer
// needs is missing from a dictionary, the render below produces empty text and
// the assertions catch it.
// The two dictionaries each declare the same keys, in order (ES first, EN
// second), and the keys the renderer needs sit on BOTH sides of any single
// anchor — so pick occurrence 0 for ES and occurrence 1 for EN rather than
// scanning from an anchor, which silently found nothing and blanked a language.
function keyOccurrences(k) {
  const out = [], needle = '    ' + k + ':';
  let i = app.indexOf(needle);
  while (i >= 0) { out.push(i); i = app.indexOf(needle, i + 1); }
  return out;
}
function extractDict(langIdx) {
  const start = keyOccurrences('intv4_brief_title')[langIdx];
  const endKey = app.indexOf('intv5_cat_other:', start);
  const end = app.indexOf('\n', endKey);
  const body = app.slice(start, end).replace(/,\s*$/, '');
  const extraKeys = ['intcc_health_title','intcc_health_suffix','intcc_disclaimer',
    'intcc_empty_title','intcc_empty_body','healthScoreSolid','healthScoreModerate',
    'healthScoreElevated','healthScoreHigh','healthScoreEmpty','healthScoreExplainSolid',
    'healthScoreExplainModerate','healthScoreExplainElevated','healthScoreExplainHigh',
    'intcc_band_empty','intcc_eyebrow','intcc_radar_title','intcc_drivers_title','intcc_drv_explain_asset',
    'intcc_drv_explain_cash','intcc_drv_kind_eng','intcc_drv_kind_liq','intcc_drv_none',
    'intcc_chip_div','intcc_chip_liq','intcc_chip_conc','intcc_chip_watch',
    // CHECKPOINT B — el limitador y la dimensión no medible: sin estas claves
    // el renderer emite una etiqueta VACÍA, que es el defecto que venían a cerrar.
    'intcc_chip_limit_spread','intcc_chip_nodata','intv4_brief_stale','intv4_brief_stale_note',
    'intcc_read_attention','intcc_read_concentrated','intcc_read_growing','intcc_read_healthy',
    'intcc_read_balanced','intcc_sub_attention','intcc_sub_concentrated','intcc_sub_growing',
    'intcc_sub_healthy','intcc_sub_balanced',
    // INT.07 — the semantic pentagon publishes these, so the gate must see the
    // REAL strings from BOTH dictionaries (a missing one blanks an axis label).
    'intcc_dim_div','intcc_dim_liq','intcc_dim_conc','intcc_dim_stab','intcc_dim_growth',
    // A2 — el primer eje ya no se llama «Diversificación». Sin esta clave el
    // renderer produce una etiqueta VACÍA y el pentágono parece de cuatro ejes.
    'intcc_dim_breadth',
    // A2 — el enlace de trazabilidad del hero. Sin la clave el renderer emite un
    // enlace VACÍO, que es peor que no tenerlo.
    'intel_see_changes','intel_now_novelty','intel_sub_review','intel_now_reviewed','intel_sub_reviewed','intel_now_no_news','intel_sub_no_news','intel_ack_done','intel_ack','intel_ack_aria',
    'intv7_axis_unavailable','intv7_axis_span_days','intv7_radar_legend','intv7_radar_pending',
    // M.03 C — el disclosure del radar es POR EJE y con su causa, así que el gate
    // necesita las cuatro cadenas reales: sin ellas el renderer produce texto vacío
    // y 13B.9 dejaría de ver los nombres.
    'intv7_pending_obs','intv7_pending_scale','intv7_pending_generic','intv7_stab_meaning',
    // SPEC AURIX INTELLIGENCE — la lectura del hero, el índice de dispersión, los descubrimientos y
    // la pregunta contextual publican estas claves. Si falta una en CUALQUIERA de los
    // dos idiomas, `extractDict` revienta aquí y 13.6 ve el texto vacío: es
    // exactamente para eso.
    // HERO FINALIZATION · SALUD quedó minimalista (título + anillo + % + UN estado),
    // así que las claves del detalle, de las etiquetas de reparto y de la chip de
    // cobertura se retiraron con su superficie. Las que quedan son las que se
    // publican de verdad.
    'intel_disp_title','intel_disp_na','intel_disp_na_single','intel_disp_na_uncert',
    'intel_disp_na_generic','intel_disp_depth',
    'intel_h_v_weak','intel_h_v_watch','intel_h_v_stable','intel_h_v_balanced',
    'intel_h_v_solid','intel_h_v_excellent','intel_dock_label',
    'intel_now_monitoring','intel_sub_monitoring',
    'intel_now_material','intel_now_discovery','intel_now_changed',
    'intel_now_stable','intel_now_history','intel_now_context',
    'intel_sub_material','intel_sub_changed','intel_sub_history',
    'intel_d_apparent','intel_d_conc_rising','intel_d_capital','intel_d_intent','intel_d_liq_need',
    // §17 — `intel_d_persisting` RETIRADA con su descubrimiento: «esta lectura
    // sigue igual tras 11 observaciones» no dice qué condición, ni durante qué
    // periodo (las «observaciones» eran visitas), ni por qué importa.
    'intel_d_combined',
    'intel_q_conc_intent','intel_q_conc_why','intel_q_coverage','intel_q_coverage_why',
    'intel_q_liq_need','intel_q_liq_why','intel_q_goal','intel_q_goal_why','intel_q_thanks',
    'intel_opt_deliberate','intel_opt_not_deliberate','intel_opt_complete','intel_opt_partial',
    'intel_opt_none_known','intel_opt_planned','intel_opt_imminent','intel_opt_preserve',
    'intel_opt_grow','intel_opt_income','intel_opt_undecided',
    'intel_ctx_partial','intel_radar_more',
    // SPEC AURIX INTELLIGENCE · SALUD V2 — la card vuelve a llamarse Salud y publica
    // estado + confianza + componentes; y las preguntas ganan declinar y pausar.
    'intel_h_no_positions','intel_h_coverage','intel_h_d_empty','intel_h_note_deliberate',
    'intel_opt_decline','intel_q_pause','intel_q_paused','intel_q_declined',
    // ── CIERRE · lo que este SPEC añade a la superficie ─────────────────────
    // §7 el acceso al historial · §8 la etiqueta de contexto · §9 la pregunta de
    // liquidez no registrada y sus opciones · §15 los recuerdos declarados, que
    // hasta ahora este gate no leía y por eso no podía ver que la Memoria
    // publicaba una pregunta pendiente como si fuera un hito.
    'intel_see_history','intcc_chip_ctx_intent','intel_ack_failed','intel_h_two_positions',
    'intel_q_unregistered_liquidity','intel_q_unregistered_liquidity_why',
    // SUPREME CLOSURE §4.2 — la puerta de liquidez. Sin estas cuatro claves el
    // renderer pinta dos botones SIN texto, que es exactamente el defecto que
    // este gate tiene que poder ver.
    'intel_liq_cta_title','intel_liq_cta_body','intel_liq_cta_add','intel_liq_cta_later',
    // §4.6 — la referencia declarada de «Qué ha cambiado».
    'intv4_changed_ref_since','intv4_changed_ref_24h',
    // §4.3 — la pregunta del caso «sólo conozco el valor actual».
    'intv4_q_q_current_value',
    // §4.5 — la etiqueta de periodo que sí existe. Las de los periodos largos se
    // retiraron con la parada de la variedad temporal (SC.5.12 lo fija).
    'intv4_r_90d',
    'intel_opt_flexibility','intel_opt_yes','intel_opt_no',
    'intv9_disc_title','intv9_mem_intent_deliberate','intv9_mem_intent_not_deliberate',
    'intv9_mem_goal_preserve','intv9_mem_goal_grow','intv9_mem_goal_income',
    'intv9_mem_goal_flexibility','intv9_mem_horizon_short','intv9_mem_horizon_medium',
    'intv9_mem_horizon_long','intv9_mem_liq_none_known','intv9_mem_liq_planned',
    'intv9_mem_liq_imminent','intv9_mem_coverage_complete','intv9_mem_coverage_partial',
    'intv9_mem_unregistered_liquidity_yes','intv9_mem_unregistered_liquidity_no'];
  const missing = [];
  const extras = extraKeys.map(k => {
    const occ = keyOccurrences(k);
    const i = occ[langIdx];
    if (i == null) { missing.push(k); return null; }
    return app.slice(i, app.indexOf('\n', i)).trim().replace(/,$/, '');
  }).filter(Boolean).join(',\n');
  if (missing.length) throw new Error('i18n keys missing for lang ' + langIdx + ': ' + missing.join(','));
  // eslint-disable-next-line no-new-func
  return new Function('return ({' + body + ',\n' + extras + '})')();
}
const DICT = { es: extractDict(0), en: extractDict(1) };

const CONSTS = ['_AURIX_OBS_CLASS','_AURIX_EV_GAP','_AURIX_CATBREADTH_TAXONOMY','_AURIX_FLOW_INTENT','_AURIX_FLOW_INTENT_EXTERNAL','_AURIX_BUCKET_MAP_KEY','_AURIX_LINEAGE_KEY','_AURIX_LINEAGE_MAX','_AURIX_CATHIST_CANONICAL','_AURIX_CATHIST_REAL_ESTATE_KEY','_AURIX_CATHIST_INVESTABLE',
  '_AURIX_CATHIST_RECON_ABS_TOL','_AURIX_CATHIST_RECON_REL_TOL','_AURIX_CATHIST_WINDOWS','_AURIX_BACKEND_CADENCE_MS','_AURIX_BACKEND_STALE_FACTOR',
  '_AURIX_CAPITAL_FLOWS_KEY','_WSC_INTERNAL_KINDS','_AURIX_WN12_BOUNDED_RANGE_SPAN_GUARD',
  '_AURIX_WN12_MIN_SPAN_RETENTION','_AURIX_WN12_BOUNDED_RANGES','_AURIX_RETURN_MIN_HISTORY_MS',
  '_AURIX_RETURN_COMPARABLE_RATIO','_AURIX_INVPERF_UNEXPLAINED_JUMP_PCT','_AURIX_INVPERF_HIGH_CONFIDENCE_OBS','_AURIX_FLOW_MATCH_REL_TOL',
  '_AURIX_FACT_STATUS','_AURIX_FACT_FAMILY','_AURIX_CAUSAL_ROOT','_AURIX_FACT_MATERIAL','_AURIX_REGISTERED_OP_KINDS','_AURIX_REGISTERED_OP_BATCH_MIN',
  '_AURIX_RANK_WEIGHTS','_AURIX_NOVELTY_WINDOW_MS','_AURIX_FACT_CONTRACT_VERSION','_AURIX_INTCORE_STORY_LIMIT','_AURIX_INTCORE_STORY_MIN_PRIORITY','_INTV7_RADAR_DIMS','TYPE_META','_AURIX_QUESTION_CATALOG',
  '_INTV4_DEPTH','_INTV4_DEFAULT_DEPTH','_INTV4_BRIEF_MAX','_INTV4_EXPLORE_MAX','_INTV4_MEMORY_MAX','_INTV4_MEMORY_WINDOW_ORDER',
  '_INTV4_SHOWN_KEY','_AURIX_INTEL_HEALTH_POSITIVE','_INTCC_HEALTH_DIM_LABEL','_AURIX_INTEL_DISC_MAX','_AURIX_INTEL_DIM_ROOT',
  '_AURIX_LOSS_TIER','_AURIX_LOSS_IMPACT_STRUCTURAL_SHARE','_INTV4_EXPLORE_PERIOD_WEEKS','_INTV4_PERIMETER','_INTV5_TIER','_AURIX_TODAY_MAX_AGE_MS','_AURIX_TODAY_STALE_MS','_AURIX_GAP_SURFACE','_AURIX_ROOT_READABLE'];
const FNS = ['_intv4ExploreRotation','_intv4ExploreSeed','_intv4Perimeter','_intv4ActiveReviewFindings','_aurixNow','_aurixTodayDatedAt','_aurixTodayFresh','_aurixTodayDataStale','_intv5RecencyTier','_aurixLossImpactShare','_aurixLossSeverityTier','_aurixEpisodeOf','_aurixIntelResolveCertified','_aurixIntelAcknowledge','_aurixIntelCtxRecord','_aurixIntelReadOwned','_aurixIntelWriteOwned','_aurixIntelStore','_aurixIntelOwner','_aurixIntelCtxMerge','_aurixLoadCapitalFlowsRaw','_aurixLoadCapitalFlowsLive','_aurixFlowIsDerived','_aurixFlowDupKey','_aurixFlowUnpairableDerived','_aurixFlowDuplicateIds','_aurixFlowDuplicateReport','_aurixFlowIntentOf','_aurixEvidence','_aurixCashLedgerAuthority','_aurixRegisteredOperations','_aurixStrictInvestableBucket','_aurixRegisteredCategoryBreadth','_aurixEventIdentity','_aurixCanonicalFindings','_intv4FindingRows','_aurixLineageRead','_aurixClassificationValidity','_aurixAssetBucketById','toBase','formatCurrency','formatBase','_aurixUsableQuantity','_aurixCategoryBucket',
  'isClosedAsset','activeAssets','isInvestableAsset','investableAssets','investableValueUSD',
  'liquidityNominal','assetNativeValue','assetValueUSD','_aurixPointValuationIncomplete',
  '_aurixFlowIsInternal','_aurixLoadCapitalFlows','_aurixInvestableSnapshots',
  '_aurixEligibleInvestableSeries','_aurixTwrChain','_aurixFlowCounterpartObserved','_aurixInvestablePerformance','_aurixCatHistRows',
  '_aurixCatHistValidatePoint','_aurixCatExposurePct','_aurixCatHistWindow','_aurixCatExposureDelta',
  '_aurixFactClamp01','_aurixEffectiveDiversification','_aurixFactLedger','_aurixIntelligenceStories',
  '_aurixWowInsights','_aurixContextualQuestions','_aurixWhatChanged','_aurixFactPeriodNamedAs','_aurixFactPeriodDegraded','_aurixFactEnvelope','_aurixIntelligenceCore',
  '_aurixHealthScore','_intccScoreTone','_intccHealthLimiters','_intccHealthScore','_intccClamp','_intccEsc','_intccDate','_intccDateTime',
  '_intccOrbHtml','_intv4T','_intv4Money','_intv4Num','_intv4RangeLabel','_intv4WindowLabel','_intv4CatLabel','_intv5CatLabel',
  '_intv4FactText','_intv4WhyText','_intv4WowText','_intv4StoryHtml','_intv4BriefHtml',
  '_intv4ChangedRef','_intv4ChangedHtml','_intv4DiscoveryHtml','_intv4ExploreHtml','_intv4AnswerHtml',
  // SPEC FINAL SURFACE — owners nuevos que el renderer llama: el puente
  // dimensión→raíz, la card de descubrimientos y el contexto declarado de la
  // Memoria. Sin ellos el render lanza y este gate se cae entero.
  '_aurixIntelRootsOf','_intv9DiscoveriesHtml','_intv4MemoryDeclared','_intv4MemoryDiversify','_intv4MemoryRows','_intelDiscoveryText',
  '_intelQuestionText','_aurixIntelContext','_aurixIntelCtxRecord','_aurixIntelReadOwned',
  '_aurixIntelWriteOwned','_aurixIntelOwner','_aurixIntelStore','_aurixIntelMarkAsked',
  '_intv4MemoryEvents','_intv4MemoryClaims','_intv4MemoryHtml',
  '_intv4QualityHtml','_intv4ReadShown','_intv4RecordShown',
  // INT.05 — the restored cockpit modules and the legacy components they reuse.
  '_intccScoreRingHtml','_intccIsMonetary','_intTop3Investable','buildPortfolioDrivers',
  // §6 · la guarda de hidratación (una hidratación pendiente NO es cero activos) y
  // §12 · la etiqueta de porcentaje que distingue un cero real de un «<1%».
  '_intccHydrationPending','_intccPctLabel',
  // §10 — el writer del ledger: la fila que viaja a `capital_flows`.
  '_aurixFlowRowFromLocal',
  // El formateador CANÓNICO de porcentaje, compartido por Dashboard, Workspace e
  // Intelligence: el redondeo es de renderizado y hay UNA sola función.
  '_aurixPctNum','_aurixPctLabel',
  
  '_intelCoherentState','_intv5MattersStories','_intv5Reading','_intv5Chips','_intv5StructureHtml','_aurixGapsBySurface','_intv5DriversHtml','_intv5MattersHtml','_intv7RadarAxes','_intv7PendingReasonKey','_intv7RadarHtml','_intccRadarSvg','_aurixPeakRetention','getInvestableDistribution','_aurixDisplayCategory',
  '_renderIntelligenceCommandCenter'];

function makeCtx(opts) {
  const o = opts || {};
  const sb = { Math, Number, JSON, Array, String, Object, Set, Map, Date, isFinite, Intl,
    console: { warn(){}, log(){}, debug(){} } };
  vm.createContext(sb);
  sb.baseCurrency = o.baseCurrency || 'USD';
  sb.usdToEur = 0.92;
  sb.lang = o.lang || 'es';
  sb._aurixFxRate = c => ({ USD: 1, EUR: 0.92 })[String(c).toUpperCase()];
  // ── EL RELOJ DE LA FIXTURE ────────────────────────────────────────────
  // «Hoy» se mide contra un reloj, no contra el último snapshot (checkpoint F).
  // Las fixtures de este gate mezclan filas ancladas a una constante con flujos
  // anclados a `Date.now()`, así que sin fijar el presente unas serían de hoy y
  // otras de hace un año. Se declara: el presente de la fixture es el final de
  // su propia serie. Producción sigue usando `Date.now()`; esto vive sólo aquí.
  sb._aurixNow = () => {
    // La serie de observación que construye el Core sale de `categoryHistory`
    // —las filas LOCALES—, y es ésa la que fecha las ventanas de los hechos.
    // Estas fixtures anclan las filas locales a una constante y los snapshots
    // de servidor a `Date.now()`: hay quince meses entre unas y otros. Tomar el
    // máximo de los dos dejaba todos los hechos «viejos» y vaciaba las cards.
    // El presente de la fixture es el final de la serie que la fecha.
    const rows = (o.rows && o.rows.length) ? o.rows : (o.serverRows || []);
    const last = rows.length ? rows[rows.length - 1] : null;
    const ts = last && (last.ts != null ? last.ts : last.time);
    return Number.isFinite(ts) ? ts : Date.now();
  };
  sb.t = k => DICT[sb.lang][k];
  // EL ESCAPER ES EL REAL, no un pass-through. `<1%` (§12) contiene un `<`, así
  // que un stub que no escapa publicaría en el gate un HTML distinto del de
  // producción — exactamente el defecto de
  // feedback_harness_no_stubear_lo_certificado (un `formatBase` pass-through dejó
  // pasar cinco defectos financieros con el gate en verde).
  sb._escapeWorkspaceText = s => String(s == null ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  sb.reducedMotion = true;
  sb.__rows = o.rows || [];
  sb.categoryHistory = sb.__rows;
  sb._aurixHistorySourceForDisplay = () => sb.__rows;
  sb._aurixPortfolioEpoch = () => (o.epoch || 0);
  sb.investableValueBase = () => 0;
  sb.canDisplayCanonicalReturn = () => (o.canDisplay === undefined ? { ok: true } : o.canDisplay);
  sb.activeRange = 'all';
  sb._aurixBackendSnapshots = o.serverRows || [];
  sb._aurixBackendSnapshotsState = o.hydration || 'ready';
  sb._aurixBackendHealthSnapshot = () => ({ status: 'ok' });
  sb.assets = o.assets || [];
  sb._aurixHealthSnapshot = () => (o.snap === undefined ? null : o.snap);
  sb.getDisplayName = a => (a && (a.name || a.ticker || a.id)) || '—';
  sb.__store = {};
  sb.localStorage = {
    getItem: k => (Object.prototype.hasOwnProperty.call(sb.__store, k) ? sb.__store[k] : null),
    setItem: (k, v) => { sb.__store[k] = String(v); },
    removeItem: k => { delete sb.__store[k]; },
  };
  // SPEC ADVANCED INTELLIGENCE · A1 — PRECONDICIONES DE LA PUERTA DE EVIDENCIA.
  // Una transición histórica de exposición sólo se publica si los dos extremos son
  // COMPARABLES: mismo epoch y clasificación estable y cubierta por el linaje. No
  // son stubs de lo que se certifica aquí (la superficie y su deduplicación): son
  // la evidencia que en producción aporta el observador de linaje. Los casos
  // adversariales las anulan con `o.lineage` / `o.flowsComplete`.
  sb._aurixCapitalFlowsComplete = () => (o.flowsComplete === undefined ? true : !!o.flowsComplete);
  sb.__lineage = (o.lineage === undefined) ? { since: 0, entries: [] } : o.lineage;
  // A1 — la cobertura de linaje es de la CUENTA, no del dispositivo: sin la
  // columna remota leída, la validez de clasificación es DESCONOCIDA y la
  // transición se suprime. Aquí se declara vista salvo que el caso la niegue,
  // que es la precondición equivalente a tener el SQL aplicado en producción.
  vm.runInContext('var _aurixLineageColumnSeen = ' + ((o.lineageAccountWide === false) ? 'false' : 'true') + ';', sb);
  // ── EL MOTOR ENTRA EN EL MISMO CONTEXTO QUE LA SUPERFICIE ────────────────
  // Los dos bloques se cargan ENTEROS (PC.01 + Intelligence Engine) antes que la
  // lista de consts, porque declaran varias de ellas por su cuenta: por eso esos
  // seis nombres NO están en `CONSTS`. Cargarlos aquí es lo que hace que
  // `_renderIntelligenceCommandCenter` corra con motor REAL en este gate —la
  // traceability lo corre sin él, por su camino fail-closed— y es donde vive casi
  // todo lo que este SPEC cierra: la frontera motor↔presentación.
  vm.runInContext(PC01_SRC, sb);
  vm.runInContext(ENGINE_SRC, sb);
  CONSTS.forEach(n => vm.runInContext(konstSrc(n), sb));
  FNS.forEach(n => vm.runInContext(fnSrc(n), sb));
  if (o.flows) vm.runInContext('__store[_AURIX_CAPITAL_FLOWS_KEY] = ' + JSON.stringify(JSON.stringify(o.flows)), sb);
  if (sb.__lineage) vm.runInContext('__store[_AURIX_LINEAGE_KEY] = ' + JSON.stringify(JSON.stringify(sb.__lineage)), sb);
  if (o.shown) vm.runInContext('__store[_INTV4_SHOWN_KEY] = ' + JSON.stringify(JSON.stringify(o.shown)), sb);
  return sb;
}
const run = (e, c) => vm.runInContext(e, c);
const render = (o) => { const c = makeCtx(o); return { html: run('_renderIntelligenceCommandCenter()', c), ctx: c }; };
const coreOf = (o) => { const c = makeCtx(o); return run('_aurixIntelligenceCore({ presentationHistory: _intv4ReadShown() })', c); };
const attrs = (html, re) => { const out = []; let m; const r = new RegExp(re, 'g'); while ((m = r.exec(html))) out.push(m[1]); return out; };
const section = (html, cls) => {
  const i = html.indexOf('class="intcc-card ' + cls);
  if (i < 0) { const j = html.indexOf(cls); return j < 0 ? '' : html.slice(j, j + 2600); }
  return html.slice(i, i + 4000);
};

// ── fixtures ────────────────────────────────────────────────────────────────
const row = (d, total, re) => ({ ts: T0 + d * DAY, total, real_estate: re || 0 });
const inv = vals => vals.map((v, i) => row(i, v, 0));
function srvRow(ts, cats) { let tot = 0; for (const k in cats) tot += cats[k];
  return { ts, total_value_usd: +tot.toFixed(2), real_estate: cats.real_estate || 0, category_values: Object.assign({}, cats) }; }
function srvHistory(endTs, spanDays, a, b) {
  const rows = [], step = 6 * HOUR, n = Math.floor((spanDays * DAY) / step);
  for (let i = 0; i <= n; i++) { const f = n === 0 ? 1 : i / n; const c = {};
    for (const k of Object.keys(a)) c[k] = +((a[k] || 0) + ((b[k] != null ? b[k] : a[k]) - (a[k] || 0)) * f).toFixed(2);
    rows.push(srvRow(endTs - (n - i) * step, c)); }
  return rows;
}
const SNAP = { assetCount: 12, totUSD: 100000, categoryCount: 5, cashPct: 12, cryptoPct: 39, realEstatePct: 0,
  topInvestedAsset: { name: 'BTC', ticker: 'BTC', type: 'crypto', pctTotal: 53 },
  topCategory: { type: 'crypto', label: 'Cripto', pctTotal: 53 }, worstAsset: null, bestAsset: null };
const DRIVERS = { items: [], pct: 71 };
const LOPSIDED = [
  { id: 'a1', type: 'crypto', qty: 1, price: 53000 }, { id: 'a2', type: 'stock', qty: 100, price: 120 },
  { id: 'a3', type: 'stock', qty: 50, price: 100 }, { id: 'a4', type: 'etf', qty: 30, price: 90 },
  { id: 'a5', type: 'etf', qty: 20, price: 80 }, { id: 'a6', type: 'crypto', qty: 5, price: 200 },
  { id: 'a7', type: 'metal', qty: 10, price: 60 }, { id: 'a8', type: 'stock', qty: 10, price: 50 },
  { id: 'a9', type: 'fund', qty: 10, price: 40 }, { id: 'a10', type: 'stock', qty: 10, price: 30 },
  { id: 'a11', type: 'etf', qty: 10, price: 20 }, { id: 'a12', type: 'cash', qty: 5000 },
];
// A mature account: real history, a real market move, a real deposit, a real
// exposure drift the certified reader can see.
const MATURE = {
  rows: inv([10000, 10200, 10400, 10600, 10800, 11000]),
  flows: [{ id: 'd1', ts: T0 + 1.5 * DAY, amountUSD: 400, kind: 'deposit' }],
  serverRows: srvHistory(NOW, 10, { crypto: 31000, stock: 40000, liquidity: 29000 },
                                   { crypto: 39000, stock: 40000, liquidity: 21000 }),
  assets: LOPSIDED, snap: SNAP, drivers: DRIVERS,
};
// A brand-new account: structure only, no measurable history.
const YOUNG = { rows: [], flows: [], serverRows: [], assets: LOPSIDED, snap: SNAP, drivers: DRIVERS };
// A portfolio with NO wow evidence at all: few, evenly-weighted positions (so the
// nominal-vs-effective insight cannot fire) and no history. Note that LOPSIDED
// DOES legitimately produce a day-1 structural insight — that is correct, and it
// is why this separate fixture is needed to test genuine absence.
const EVEN_NO_HISTORY = {
  rows: [], flows: [], serverRows: [],
  assets: [{ id: 'e1', type: 'stock', qty: 1, price: 1000 }, { id: 'e2', type: 'stock', qty: 1, price: 1000 },
           { id: 'e3', type: 'etf', qty: 1, price: 1000 }],
  snap: { assetCount: 3, totUSD: 3000, categoryCount: 2, cashPct: 0, cryptoPct: 0, realEstatePct: 0,
          topInvestedAsset: { name: 'A', ticker: 'A', type: 'stock', pctTotal: 34 },
          topCategory: { type: 'stock', label: 'Acciones', pctTotal: 67 }, worstAsset: null, bestAsset: null },
  drivers: { items: [], pct: 100 },
};


// ── AÑADIDOS A LA MAQUINARIA ────────────────────────────────────────────────
// La traceability corre el renderer SIN el motor (`_aurixIntel` no está en su
// lista, así que la superficie recorre su camino fail-closed). Este gate necesita
// las dos mitades a la vez —motor y presentación— porque casi todo lo que el SPEC
// cierra vive en su frontera: las etiquetas leen contexto, la pregunta la elige el
// motor y la pinta la superficie, y la Salud sale de `_aurixIntelHealth`.

const num = (h, re) => { const m = h.match(re); return m ? m[1] : null; };
const count = (h, re) => (h.match(re) || []).length;
const textOf = h => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

// ── LAS DOS CUENTAS DE REFERENCIA DEL §2 ────────────────────────────────────
// Fixtures EQUIVALENTES, no fotografías: el SPEC lo dice expresamente («los
// porcentajes observados no son resultados que deban fijarse artificialmente en
// pruebas»). Lo que se reproduce es la ESTRUCTURA — quién domina, qué falta, qué
// procedencia tiene cada operación— y las cifras salen de los owners reales.
const NOW2 = Date.now();
const DAY_START = Date.UTC(new Date(NOW2).getUTCFullYear(), new Date(NOW2).getUTCMonth(), new Date(NOW2).getUTCDate());

// CUENTA A · Bitcoin dominante, Solana incorporada hoy, Apple con un peso
// positivo MUY pequeño y CERO liquidez registrada.
const A_ASSETS = [
  { id: 'btc', name: 'Bitcoin', ticker: 'BTC', type: 'crypto', qty: 1, price: 60000 },
  { id: 'sol', name: 'Solana', ticker: 'SOL', type: 'crypto', qty: 40, price: 150 },
  { id: 'aapl', name: 'Apple', ticker: 'AAPL', type: 'stock', qty: 1, price: 180 },
];
const A_TOT = 60000 + 6000 + 180;
const A_SNAP = { assetCount: 3, totUSD: A_TOT, categoryCount: 2, cashPct: 0, cryptoPct: 99.73,
  realEstatePct: 0, uncertifiablePositions: 0,
  topInvestedAsset: { name: 'Bitcoin', ticker: 'BTC', type: 'crypto', pctTotal: 90.7 },
  topCategory: { type: 'crypto', label: 'Cripto', pctTotal: 99.7 }, worstAsset: null, bestAsset: null };
const CUENTA_A = {
  assets: A_ASSETS, snap: A_SNAP, rows: [], serverRows: [],
  // La compra de Solana de HOY, con procedencia conocida (el dispositivo que la hizo).
  flows: [{ id: 'f-sol', ts: NOW2 - 2 * HOUR, recordedAt: NOW2 - 2 * HOUR, amountUSD: 6000,
            kind: 'asset_add', assetId: 'sol', source: 'user' }],
};

// CUENTA B · Bitcoin, Ethereum, Apple, Microsoft y euros como liquidez, con DOS
// operaciones cuya procedencia NO se conoce — el camino cross-device normal
// mientras `capital_flows.recorded_at` siga sin aplicar. Es EXACTAMENTE el estado
// que publicaba «Tienes 2 posiciones registradas en tu cartera».
const B_ASSETS = [
  { id: 'btc', name: 'Bitcoin', ticker: 'BTC', type: 'crypto', qty: 0.5, price: 60000 },
  { id: 'eth', name: 'Ethereum', ticker: 'ETH', type: 'crypto', qty: 5, price: 3000 },
  { id: 'aapl', name: 'Apple', ticker: 'AAPL', type: 'stock', qty: 100, price: 180 },
  { id: 'msft', name: 'Microsoft', ticker: 'MSFT', type: 'stock', qty: 50, price: 400 },
  { id: 'eur', name: 'Euros', ticker: 'EUR', type: 'cash', qty: 10000, price: 1, assetCurrency: 'EUR' },
];
const B_TOT = 30000 + 15000 + 18000 + 20000 + (10000 / 0.92);
const B_SNAP = { assetCount: 5, totUSD: B_TOT, categoryCount: 3, cashPct: 11.6, cryptoPct: 47.9,
  realEstatePct: 0, uncertifiablePositions: 0,
  topInvestedAsset: { name: 'Bitcoin', ticker: 'BTC', type: 'crypto', pctTotal: 32 },
  topCategory: { type: 'crypto', label: 'Cripto', pctTotal: 47.9 }, worstAsset: null, bestAsset: null };
const CUENTA_B = {
  assets: B_ASSETS, snap: B_SNAP,
  rows: inv([80000, 82000, 85000, 88000, 90000, 93869]),
  serverRows: srvHistory(NOW2, 20, { crypto: 40000, stock: 35000, liquidity: 11000 },
                                    { crypto: 45000, stock: 38000, liquidity: 10869 }),
  flows: [
    // Movimiento de liquidez ANTIGUO: es el que dominaba «Lo que importa hoy».
    { id: 'dep1', ts: NOW2 - 40 * DAY, recordedAt: NOW2 - 40 * DAY, amountUSD: 10869.57, kind: 'deposit', source: 'user' },
    // DOS operaciones SIN procedencia (`recordedAt` ausente ⇒ desconocida).
    { id: 'op1', ts: NOW2 - 3 * DAY, amountUSD: 18000, kind: 'asset_add', assetId: 'aapl', source: 'user' },
    { id: 'op2', ts: NOW2 - 3 * DAY, amountUSD: 20000, kind: 'asset_add', assetId: 'msft', source: 'user' },
  ],
};

// CUENTA C · DOS operaciones registradas HOY con procedencia conocida. Es la
// TANDA (`positions_registered_today`), que es el caso EXACTO del §9 —registras y
// la pregunta se reevalúa— y el que ninguna de las dos cuentas de referencia
// producía: A tiene una sola operación y las dos de B están a −3 días y sin
// procedencia. La revisión financiera demostró que sin esta fixture los asserts de
// reactividad pasaban por ausencia de caso.
const CUENTA_C = {
  assets: B_ASSETS, snap: B_SNAP, rows: inv([80000, 85000, 90000, 93869]), serverRows: [],
  flows: [
    { id: 'c1', ts: NOW2 - 3 * HOUR, recordedAt: NOW2 - 3 * HOUR, amountUSD: 18000,
      kind: 'asset_add', assetId: 'aapl', source: 'user' },
    { id: 'c2', ts: NOW2 - 2 * HOUR, recordedAt: NOW2 - 2 * HOUR, amountUSD: 20000,
      kind: 'asset_add', assetId: 'msft', source: 'user' },
  ],
};

// Liquidez REAL por debajo del 1 %: 150 US$ sobre 60.150 = 0,2494 %. `snap.cashPct`
// ya no viene redondeado del owner, así que la fixture lleva el valor crudo — que
// es exactamente lo que el owner produciría con estos activos.
const LIQ_SUB1 = {
  assets: [{ id: 'btc', name: 'Bitcoin', ticker: 'BTC', type: 'crypto', qty: 1, price: 60000 },
           { id: 'eur', name: 'Euros', ticker: 'EUR', type: 'cash', qty: 150, price: 1 }],
  snap: { assetCount: 2, totUSD: 60150, categoryCount: 2, cashPct: (150 / 60150) * 100,
    cryptoPct: 100, realEstatePct: 0, uncertifiablePositions: 0,
    topInvestedAsset: { name: 'Bitcoin', ticker: 'BTC', type: 'crypto', pctTotal: 100 },
    topCategory: { type: 'crypto', label: 'Cripto', pctTotal: 99.75 } },
  rows: [], serverRows: [], flows: [],
};

console.log('AURIX ADVANCED INTELLIGENCE · CIERRE — gate focal\n');

// ════════════════════════════════════════════════════════════════════════════
// §4 · OPERACIONES ≠ POSICIONES
// ════════════════════════════════════════════════════════════════════════════
console.log('§4 · operaciones ≠ posiciones');
{
  const FT = (v, lang) => run('_intv4FactText(' + JSON.stringify({
    semanticKey: 'positions_registered_today', value: (v.operations || 2),
    values: Object.assign({ operations: 2, amountKind: null, grossUSD: null }, v),
    window: { range: 'today' } }) + ')', makeCtx({ lang: lang || 'es' }));

  // EL DEFECTO, ejecutado: procedencia desconocida (el camino cross-device
  // NORMAL) + dos operaciones en el ledger ⇒ la frase que el founder vio.
  const nd = FT({ provenanceKnown: false, side: 'in' });
  // La revisión financiera pilló que corregir el SUSTANTIVO no bastaba: «Tienes 2
  // operaciones registradas en tu cartera» es un STOCK, y la lista está filtrada
  // por la ventana reciente, así que en una cuenta con 40 operaciones históricas el
  // total era falso. Lo único cierto de todas las filas de esa rama es que son
  // RECIENTES. El assert comprueba las tres cosas: ni «posiciones», ni un verbo de
  // posesión de inventario, y el recuento que el hecho declara.
  ok('4.1 dos EVENTOS del ledger no se publican como posiciones NI como un inventario',
    /^Hay 2 incorporaciones recientes en tu cartera$/.test(nd)
    && !/posicion/i.test(nd) && !/^Tienes/.test(nd), nd);
  ok('4.1en …y lo mismo en inglés',
    (() => { const en = FT({ provenanceKnown: false, side: 'in' }, 'en');
      return /^There are 2 recent additions in your portfolio$/.test(en)
        && !/position/i.test(en) && !/^You have/.test(en); })(),
    FT({ provenanceKnown: false, side: 'in' }, 'en'));
  ok('4.2 NINGUNA de las siete frases de tanda dice «posiciones»',
    [{ provenanceKnown: false, side: 'in' }, { provenanceKnown: false, side: 'out' },
     { provenanceKnown: false, side: 'mixed' },
     { provenanceKnown: true, recordedToday: true, side: 'in', recordedRecent: true },
     { provenanceKnown: true, recordedToday: true, side: 'out', recordedRecent: true },
     { provenanceKnown: true, recordedToday: false, side: 'in', recordedRecent: true },
     { provenanceKnown: true, recordedToday: true, side: 'in', recordedRecent: true,
       grossUSD: 38000, amountKind: 'recorded_cost' }]
      .every(v => { const es = FT(v), en = FT(v, 'en');
        return !!es && !!en && !/posicion/i.test(es) && !/position/i.test(en); }),
    JSON.stringify([FT({ provenanceKnown: false, side: 'in' }),
                    FT({ provenanceKnown: true, recordedToday: true, side: 'in', recordedRecent: true })]));
  ok('4.3 el LADO sigue siendo visible: un alta y una baja no dicen lo mismo',
    FT({ provenanceKnown: false, side: 'in' }) !== FT({ provenanceKnown: false, side: 'out' })
    && /retirada/.test(FT({ provenanceKnown: false, side: 'out' }))
    && /removal/.test(FT({ provenanceKnown: false, side: 'out' }, 'en')));
  ok('4.4 y el recuento sigue siendo el que el hecho declara (no se inventa un total)',
    /\b5\b/.test(FT({ operations: 5, provenanceKnown: false, side: 'in' })),
    FT({ operations: 5, provenanceKnown: false, side: 'in' }));

  // Y en la cuenta REAL de referencia, con el renderer completo.
  const rB = render(CUENTA_B);
  ok('4.5 CUENTA B (4 inversiones + liquidez) NUNCA se describe como 2 posiciones',
    !/2 posiciones/.test(textOf(rB.html)) && !/Tienes 2 posiciones/.test(rB.html),
    (textOf(rB.html).match(/Tienes [^.]{0,60}/) || [''])[0]);
  ok('4.6 el inventario de posiciones lo publica su owner canónico (Factores, posiciones VIVAS)',
    (() => { const drv = section(rB.html, 'intcc-drivers');
      const names = attrs(drv, 'class="intcc-drv-name">([^<]+)');
      return names.length === 3 && /Bitcoin|Microsoft|Apple|Ethereum/.test(names.join('|')); })(),
    JSON.stringify(attrs(section(rB.html, 'intcc-drivers'), 'class="intcc-drv-name">([^<]+)')));
}

// ════════════════════════════════════════════════════════════════════════════
// §5 · PROCEDENCIA TEMPORAL Y COSTE DESCONOCIDO
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§5 · procedencia temporal · coste desconocido');
{
  const OP = (v, lang) => run('_intv4FactText(' + JSON.stringify({
    semanticKey: 'operation_registered_msft', value: 1,
    values: Object.assign({ operations: 1, name: 'Microsoft', side: 'in' }, v),
    window: { range: 'today' } }) + ')', makeCtx({ lang: lang || 'es' }));
  ok('5.1 fecha económica de HOY ⇒ «Hoy has comprado»',
    /^Hoy has comprado Microsoft/.test(OP({ provenanceKnown: true, recordedToday: true,
      recordedRecent: true, effectiveToday: true })));
  ok('5.2 registro de hoy con fecha económica ANTIGUA ⇒ «Hoy has registrado», nunca «comprado»',
    (() => { const s = OP({ provenanceKnown: true, recordedToday: true, recordedRecent: true, effectiveToday: false });
      return /^Hoy has registrado Microsoft/.test(s) && !/comprado/.test(s); })());
  ok('5.3 procedencia DESCONOCIDA ⇒ nunca «hoy» (fail-closed, sin migración aplicada)',
    (() => { const s = OP({ provenanceKnown: false }), e = OP({ provenanceKnown: false }, 'en');
      return !/[Hh]oy/.test(s) && !/[Tt]oday/.test(e); })(), JSON.stringify([OP({ provenanceKnown: false })]));
  ok('5.4 una fila LEGACY sin `recordedAt` no se convierte en una operación de hoy',
    (() => { const c = makeCtx({ assets: B_ASSETS, snap: B_SNAP,
        flows: [{ id: 'l1', ts: NOW2 - 400 * DAY, amountUSD: 1000, kind: 'asset_add', assetId: 'aapl', source: 'user' }] });
      const reg = run('_aurixRegisteredOperations(' + DAY_START + ',' + NOW2 + ', null, ' + (NOW2 - DAY) + ')', c);
      return reg.ops.length === 0 || reg.ops.every(o => o.recordedToday === false && o.provenanceKnown === false); })());
  ok('5.5 la migración de `recorded_at` sigue DECLARADA como no aplicada, y el cliente no la envía',
    /\*\*\* NOT YET APPLIED/.test(fs.readFileSync(path.join(ROOT, 'db/capital_flows_2_recorded_at.sql'), 'utf8'))
    && !/recorded_at:/.test(app));
  // §5.2 — ni qty × 1 ni Number(null) ⇒ 0 como coste.
  ok('5.6 sin importe certificado se publica el ACTO y NINGUNA cifra',
    (() => { const s = OP({ provenanceKnown: true, recordedToday: true, recordedRecent: true,
        effectiveToday: true, grossUSD: null, amountKind: null });
      return !/\d/.test(s) && /Microsoft/.test(s); })(),
    OP({ provenanceKnown: true, recordedToday: true, recordedRecent: true, effectiveToday: true, grossUSD: null, amountKind: null }));
  ok('5.7 `Number(null)` NO se convierte en un coste de cero',
    (() => { const s = OP({ provenanceKnown: true, recordedToday: true, recordedRecent: true,
        effectiveToday: true, grossUSD: null });
      const z = OP({ provenanceKnown: true, recordedToday: true, recordedRecent: true,
        effectiveToday: true, grossUSD: 0, amountKind: 'recorded_cost' });
      return !/0,00|0\.00/.test(s) && s !== z; })());
  ok('5.8 el ledger NO fabrica un importe con qty × 1: sin precio no hay flujo',
    (() => { const t = fnSrc('_ledgerTrade');
      return /\(Number\(qty\) \|\| 0\) \* \(Number\(price\) \|\| 0\)/.test(t) && /usd > 0/.test(t); })());
  ok('5.9 un activo sin precio no se valora: `qty * price` es NaN, nunca `qty * 1`',
    (() => { const c = makeCtx({});
      const v = run('assetValueUSD({ id: "x", type: "stock", qty: 10 })', c);
      return !Number.isFinite(v); })());
}

// ════════════════════════════════════════════════════════════════════════════
// §10 · RECORDED_AT · PROCEDENCIA DE LA OPERACIÓN
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§10 · recorded_at · procedencia');
{
  const wr = fnSrc('_aurixFlowRowFromLocal');
  const push = fnSrc('_aurixCapitalFlowsPush');
  const pull = fnSrc('_aurixCapitalFlowsPull');
  const sql = fs.readFileSync(path.join(ROOT, 'db/capital_flows_2_recorded_at.sql'), 'utf8');

  ok('10.A la migración es ADITIVA e IDEMPOTENTE: ni backfill, ni DML, ni borrado',
    /add column if not exists recorded_at timestamptz/i.test(sql)
    && !/\bupdate\s+public\.capital_flows/i.test(sql)
    && !/\binsert\s+into\b/i.test(sql)
    && !/\bdelete\b/i.test(sql) && !/\bdrop\b/i.test(sql)
    && !/\btruncate\b/i.test(sql));
  ok('10.B el writer envía la procedencia SÓLO si existe: nunca la fabrica',
    /if \(withRecorded && Number\.isFinite\(Number\(f\.recordedAt\)\)\)/.test(wr)
    && /row\.recorded_at = new Date\(Number\(f\.recordedAt\)\)\.toISOString\(\);/.test(wr)
    && !/recorded_at[^;]*Date\.now\(\)/.test(wr));
  ok('10.C …y una fila legacy sin procedencia OMITE la columna (no la pone a hoy)',
    (() => { const c = makeCtx({});
      const legacy = { id: 'l1', ts: 1700000000000, kind: 'deposit', amountUSD: 100, revision: 1 };
      const fresh  = Object.assign({}, legacy, { id: 'f1', recordedAt: 1789000000000 });
      const r1 = run('_aurixFlowRowFromLocal(' + JSON.stringify(legacy) + ', false, true)', c);
      const r2 = run('_aurixFlowRowFromLocal(' + JSON.stringify(fresh) + ', false, true)', c);
      const r3 = run('_aurixFlowRowFromLocal(' + JSON.stringify(fresh) + ', false, false)', c);
      return !('recorded_at' in r1) && r2.recorded_at === new Date(1789000000000).toISOString()
        && !('recorded_at' in r3); })(),
    JSON.stringify((() => { const c = makeCtx({});
      return run('_aurixFlowRowFromLocal(' + JSON.stringify({ id: 'l1', ts: 1700000000000,
        kind: 'deposit', amountUSD: 100, revision: 1 }) + ', false, true)', c); })()));
  ok('10.D la columna se descubre ESCRIBIENDO, y un fallo transitorio no concluye nada',
    /let _aurixFlowRecordedColumn = 'unknown';/.test(app)
    && /const isSchemaError = \(err\) =>/.test(push)
    && /if \(!isSchemaError\(error\)\) break;/.test(push)
    && /_aurixFlowRecordedColumn = 'yes';/.test(push)
    && /_aurixFlowRecordedColumn = 'no';/.test(push));
  ok('10.E la lectura sólo pide la columna cuando la escritura demostró que existe',
    /_aurixFlowRecordedColumn === 'yes' \? ', recorded_at' : ''/.test(pull));
  ok('10.F la hidratación cross-device conserva la procedencia, y su ausencia NO la borra',
    /const _rec = r\.recorded_at \? new Date\(r\.recorded_at\)\.getTime\(\) : NaN;/.test(pull)
    && /if \(Number\.isFinite\(_rec\)\) remote\.recordedAt = _rec;/.test(pull)
    && /Object\.assign\(cur, remote\)/.test(pull));
  ok('10.G la dirección de la operación no la toca nada de esto',
    /side: String\(f\.kind\) === 'asset_remove' \? 'out' : 'in'/.test(fnSrc('_aurixRegisteredOperations')));
  ok('10.H dedup e idempotencia intactas: upsert por (user_id, flow_id) y dedup por revisión',
    /onConflict: 'user_id,flow_id'/.test(push)
    && /\(Number\(f\.revision\) \|\| 1\) > \(Number\(cur\.revision\) \|\| 1\)/.test(fnSrc('_aurixRegisteredOperations')));
  // El invariante que de verdad protege al usuario, y no depende de la migración.
  ok('10.I SIN procedencia NUNCA se publica «hoy» (fail-closed, verificado antes)',
    (() => { const c = makeCtx({});
      const noProv = run('_intv4FactText(' + JSON.stringify({ semanticKey: 'operation_registered_x',
        value: 1, values: { operations: 1, name: 'Microsoft', side: 'in', provenanceKnown: false },
        window: { range: 'today' } }) + ')', c);
      return !!noProv && !/[Hh]oy/.test(noProv); })());
  ok('10.J y la fecha ECONÓMICA sigue siendo `ts`: la procedencia no la sustituye',
    /ts:         new Date\(Number\(f\.ts\) \|\| Date\.now\(\)\)\.toISOString\(\)/.test(wr)
    && /effectiveAt: Number\(f\.ts\), recordedAt: rec/.test(fnSrc('_aurixRegisteredOperations')));
}

// ════════════════════════════════════════════════════════════════════════════
// §6 · SALUD
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§6 · Salud visible desde el primer activo');
{
  const DISPF = (div0, snap0) => { const c = makeCtx({});
    return run('_aurixIntelDispersion(' + JSON.stringify(div0) + ',' + JSON.stringify(snap0) + ')', c); };
  const D = (o) => Object.assign({ status: 'available', reason: '', positions: 6, hhi: 0.18,
    effectiveN: 5.56, topWeightPct: 22 }, o || {});
  const S = (o) => Object.assign({ totUSD: 1e5, assetCount: 6, uncertifiablePositions: 0 }, o || {});

  ok('6.1 DOS posiciones publican cifra: el dominio matemático empieza en dos',
    (() => { const x = DISPF(D({ positions: 2, hhi: 0.68, effectiveN: 1.47 }), S({ assetCount: 2 }));
      return x.availability === 'available' && x.value === 47 && x.reason === ''; })(),
    JSON.stringify(DISPF(D({ positions: 2, hhi: 0.68, effectiveN: 1.47 }), S({ assetCount: 2 }))));
  ok('6.2 …y los extremos de N=2 son los definicionales, sin suelo artificial',
    DISPF(D({ positions: 2, hhi: 0.5, effectiveN: 2 }), S({ assetCount: 2 })).value === 100
    && DISPF(D({ positions: 2, hhi: 0.9802, effectiveN: 1.02 }), S({ assetCount: 2 })).value === 2);
  ok('6.3 UNA posición sigue siendo el extremo definicional, no una incógnita',
    (() => { const c = makeCtx({});
      const h = run('_aurixIntelHealth(' + JSON.stringify(D({ positions: 1, hhi: 1, effectiveN: 1, topWeightPct: 100 }))
        + ',' + JSON.stringify(S({ assetCount: 1 })) + ', null, null)', c);
      return h.state === 'single_position' && h.ring === 0 && h.ringPublishable === true; })());
  // ── LO QUE LA REVISIÓN FINANCIERA ENCONTRÓ AL ABRIR EL DOMINIO A N=2 ─────
  // Las bandas 40/60 están calibradas sobre N≥3. Con N=2 el índice es función
  // monótona del peso dominante, así que 75/25 daba 60 → `weight_spread` →
  // «EQUILIBRADA» con el 75 % en UNA posición; y peor, `weight_spread`/`weight_uneven`
  // son bandas POSITIVAS, así que además silenciaban el titular de atención y
  // habilitaban etiquetas verdes.
  // Mi primera corrección forzaba `weight_in_few`, y la REVERIFICACIÓN encontró su
  // precio: una cartera 50/50 publica anillo 100 —el índice es correcto— con la
  // palabra «A vigilar», y eso rompe la invariante central de SALUD V2 (el estado
  // sale de LA MISMA magnitud que el anillo). N=2 recibe por tanto su estado
  // DEFINICIONAL, como N=1, con texto que dice el HECHO —cuántas posiciones
  // sostienen el patrimonio— y por eso convive con cualquier valor del anillo.
  ok('6.3b con DOS posiciones el estado es DEFINICIONAL y convive con cualquier anillo',
    (() => { const c = makeCtx({});
      const st = (hhi, effN) => run('_aurixIntelHealth('
        + JSON.stringify(D({ positions: 2, hhi: hhi, effectiveN: effN, topWeightPct: 75 })) + ','
        + JSON.stringify(S({ assetCount: 2 })) + ', null, null)', c);
      const a = st(0.625, 1.6);          // 75/25 → índice 60
      const b = st(0.5, 2);              // 50/50 → índice 100
      const POS = run('JSON.stringify(_AURIX_INTEL_HEALTH_POSITIVE)', c);
      return a.state === 'two_positions' && b.state === 'two_positions'
        && a.ring === 60 && b.ring === 100 && a.ringPublishable === true
        && JSON.parse(POS).indexOf('two_positions') === -1; })(),
    JSON.stringify((() => { const c = makeCtx({});
      return run('_aurixIntelHealth(' + JSON.stringify(D({ positions: 2, hhi: 0.625, effectiveN: 1.6 }))
        + ',' + JSON.stringify(S({ assetCount: 2 })) + ', null, null)', c); })()));
  ok('6.3b2 …y su texto NO es una palabra del vocabulario de bandas',
    (() => { const w = [DICT.es.intel_h_v_weak, DICT.es.intel_h_v_watch,
        DICT.es.intel_h_v_stable, DICT.es.intel_h_v_balanced];
      const lbl = DICT.es.intel_h_two_positions;
      return !!lbl && !!DICT.en.intel_h_two_positions && w.indexOf(lbl) === -1
        && /dos posiciones/i.test(lbl); })(),
    JSON.stringify([DICT.es.intel_h_two_positions, DICT.en.intel_h_two_positions]));
  ok('6.3b3 y en la superficie el anillo y la palabra no se contradicen (50/50 → 100)',
    (() => { const even = { assets: [
        { id: 'btc', name: 'Bitcoin', type: 'crypto', qty: 0.5, price: 60000 },
        { id: 'eth', name: 'Ethereum', type: 'crypto', qty: 10, price: 3000 }],
      snap: { assetCount: 2, totUSD: 60000, categoryCount: 1, cashPct: 0, cryptoPct: 100,
        realEstatePct: 0, uncertifiablePositions: 0,
        topInvestedAsset: { name: 'Bitcoin', ticker: 'BTC', type: 'crypto', pctTotal: 50 },
        topCategory: { type: 'crypto', label: 'Cripto', pctTotal: 100 } },
      rows: [], serverRows: [], flows: [] };
      const h = render(even).html;
      const t0 = textOf(h);
      return /data-health-state="two_positions"/.test(h)
        && /100/.test((h.match(/class="intcc-score-val">([^<]*)</) || [, ''])[1])
        && /dos posiciones/i.test(t0)
        && !/A vigilar|Equilibrada|Estable|Débil/.test(t0)
        && attrs(h, 'class="intcc-chip is-(good)"').length === 0; })(),
    JSON.stringify({ band: 'two_positions',
      chips: attrs(render({ assets: [
        { id: 'btc', name: 'Bitcoin', type: 'crypto', qty: 0.5, price: 60000 },
        { id: 'eth', name: 'Ethereum', type: 'crypto', qty: 10, price: 3000 }],
      snap: { assetCount: 2, totUSD: 60000, categoryCount: 1, cashPct: 0, cryptoPct: 100,
        realEstatePct: 0, uncertifiablePositions: 0,
        topInvestedAsset: { name: 'Bitcoin', ticker: 'BTC', type: 'crypto', pctTotal: 50 },
        topCategory: { type: 'crypto', label: 'Cripto', pctTotal: 100 } },
      rows: [], serverRows: [], flows: [] }).html, 'class="intcc-chip is-([a-z]+)"') }));
  ok('6.3c …y con TRES o más las bandas certificadas siguen intactas',
    (() => { const c = makeCtx({});
      const st = (hhi, effN, pos) => run('_aurixIntelHealth('
        + JSON.stringify(D({ positions: pos, hhi: hhi, effectiveN: effN, topWeightPct: 30 })) + ','
        + JSON.stringify(S({ assetCount: pos })) + ', null, null)', c);
      return st(1 / 9, 9, 9).state === 'weight_spread'
        && st(0.66, 1.52, 3).state === 'weight_in_few'; })());
  ok('6.4 sin división por cero, NaN ni Infinity en ningún N',
    [0, 1, 2, 3, 9].every(n => { const x = DISPF(D({ positions: n, hhi: n ? 1 / n : null, effectiveN: n || null }), S({ assetCount: n }));
      return x.value === null || (Number.isFinite(x.value) && x.value >= 0 && x.value <= 100); }));
  ok('6.5 una posición NO VALORABLE sigue bloqueando la cifra (patrimonio parcial)',
    DISPF(D(), S({ uncertifiablePositions: 1 })).value === null);

  // La CARD, ejecutada.
  const rA = render(CUENTA_A);
  ok('6.6 CUENTA A publica la card de Salud con anillo, % y UN estado',
    /class="intcc-hero-health-label"/.test(rA.html)
    && /class="intcc-health-badge/.test(rA.html)
    && /class="intcc-score-val">\d+<\/span><span class="intcc-score-suffix">%/.test(rA.html),
    (rA.html.match(/intcc-score-val">[^<]*/) || [''])[0]);
  ok('6.7 y NADA debajo del estado: ni detalle de disponibilidad ni nota de contexto',
    !/intv8-disp-detail/.test(rA.html) && !/intv8-h-note/.test(rA.html));
  ok('6.8 la frase «Marcaste esta concentración como deliberada» no existe en ninguna superficie',
    !/deliberada/i.test(textOf(rA.html)) && !/intel_h_note_deliberate/.test(fnSrc('_renderIntelligenceCommandCenter')));
  ok('6.9 con UN activo la card aparece igual (no hay mínimo de posiciones para verla)',
    (() => { const one = { assets: [A_ASSETS[0]], snap: { assetCount: 1, totUSD: 60000, categoryCount: 1,
        cashPct: 0, cryptoPct: 100, realEstatePct: 0, uncertifiablePositions: 0,
        topInvestedAsset: { name: 'Bitcoin', ticker: 'BTC', type: 'crypto', pctTotal: 100 },
        topCategory: { type: 'crypto', label: 'Cripto', pctTotal: 100 } }, rows: [], serverRows: [], flows: [] };
      const h = render(one).html;
      return /class="intcc-health-badge/.test(h) && !/is-empty/.test(h); })());
  ok('6.10 CERO activos CONFIRMADO: la card se oculta y se dice que no hay nada que analizar',
    (() => { const h = render({ assets: [], snap: null, rows: [], serverRows: [], flows: [] }).html;
      return /is-empty/.test(h) && !/intcc-health-badge/.test(h) && !/data-hydrating/.test(h); })());
  ok('6.11 HIDRATACIÓN PENDIENTE ≠ cero activos: la card aparece con «—» y «Datos insuficientes»',
    (() => { const c = makeCtx({ assets: [], snap: null });
      c.supabaseClient = {}; c.currentUser = { id: 'u1' };
      run('function _aurixPersistenceReady() { return false; }', c);
      const h = run('_renderIntelligenceCommandCenter()', c);
      return /data-hydrating="1"/.test(h) && /intcc-health-badge/.test(h)
        && /Datos insuficientes/.test(h) && !/is-empty/.test(h)
        && !/\d+<\/span><span class="intcc-score-suffix">%/.test(h); })(),
    (() => { const c = makeCtx({ assets: [], snap: null });
      c.supabaseClient = {}; c.currentUser = { id: 'u1' };
      run('function _aurixPersistenceReady() { return false; }', c);
      return run('_renderIntelligenceCommandCenter()', c).slice(0, 220); })());
  ok('6.12 y una sesión ya reconciliada NO se confunde con una hidratación en vuelo',
    (() => { const c = makeCtx({ assets: [], snap: null });
      c.supabaseClient = {}; c.currentUser = { id: 'u1' };
      run('function _aurixPersistenceReady() { return true; }', c);
      return /is-empty/.test(run('_renderIntelligenceCommandCenter()', c)); })());
  ok('6.13 NINGUNA respuesta del usuario puede subir la Salud',
    (() => { const c = makeCtx({});
      const dd = JSON.stringify(D({ positions: 3, hhi: 0.66, effectiveN: 1.52, topWeightPct: 80 }));
      const ss = JSON.stringify(S({ assetCount: 3 }));
      const bare0 = run('_aurixIntelHealth(' + dd + ',' + ss + ', null, null)', c);
      const ctx = { fields: { experience: { value: 'experienced' },
        concentration_intent: { value: 'deliberate' } } };
      const withCtx = run('_aurixIntelHealth(' + dd + ',' + ss + ', null, ' + JSON.stringify(ctx) + ')', c);
      return bare0.ring === withCtx.ring && bare0.state === withCtx.state; })());
}

// ════════════════════════════════════════════════════════════════════════════
// §7 · HERO · TITULAR, BANDEJA Y ORDEN DE LECTURA
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§7 · hero · titular, revisiones y orden');
{
  const src0 = fnSrc('_renderIntelligenceCommandCenter');
  ok('7.1 el orden del cuerpo es eyebrow → titular → frase → revisiones → etiquetas',
    (() => { const i = src0.indexOf('intcc-eyebrow'), j = src0.indexOf('intcc-hero-title'),
        k = src0.indexOf('intcc-hero-sub'), l = src0.indexOf('${seeChangesHtml}'), m = src0.indexOf('intcc-chips');
      return i >= 0 && i < j && j < k && k < l && l < m; })());
  // §7 pide DOS piezas: el recuento («1 cambio merece revisión») y el acceso («Ver
  // cambio»). Estaban las dos, pero el CTA repetía el recuento, así que la misma
  // frase salía dos veces a medio centímetro. El recuento vive en la frase y el
  // control en su verbo; el número sigue en `data-count` para el gate y la QA.
  ok('7.2 el recuento y el acceso son piezas distintas, y ninguna repite a la otra',
    (() => { const sub1 = DICT.es.intel_sub_review(1), sub3 = DICT.es.intel_sub_review(3);
      const cta1 = DICT.es.intel_see_changes(1), cta3 = DICT.es.intel_see_changes(3);
      return /^1 cambio merece revisión\.$/.test(sub1) && /^3 cambios merecen revisión\.$/.test(sub3)
        && /^Ver cambio ↓$/.test(cta1) && /^Ver cambios ↓$/.test(cta3)
        && !/material/i.test(sub1 + sub3 + cta1 + cta3); })(),
    JSON.stringify([DICT.es.intel_sub_review(1), DICT.es.intel_see_changes(1)]));
  ok('7.2en …y en inglés igual, sin «material»',
    (() => { const a0 = DICT.en.intel_sub_review(1) + DICT.en.intel_sub_review(4);
      const b0 = DICT.en.intel_see_changes(1) + DICT.en.intel_see_changes(4);
      return !/material/i.test(a0 + b0) && /review/i.test(a0) && /See change/.test(b0); })(),
    JSON.stringify([DICT.en.intel_sub_review(1), DICT.en.intel_see_changes(1)]));
  ok('7.2b y en la superficie el recuento se pronuncia UNA sola vez',
    (() => { const t0 = textOf(render(CUENTA_B).html);
      return (t0.match(/cambio merece revisión/g) || []).length <= 2; })(),
    String((textOf(render(CUENTA_B).html).match(/cambio merece revisión/g) || []).length));
  // §7 · NINGÚN ESTADO CONTRADICTORIO A LA VEZ. La captura de este cierre volvió a
  // enseñar SALUD 87 · EQUILIBRADA, tres señales verdes y «Tu patrimonio requiere
  // atención»: la bandeja de revisión sobreescribía el estado y su titular
  // contextual se buscaba con el estado CRUDO, salteándose la capa de coherencia.
  ok('7.2c con Salud positiva el titular NO puede decir «requiere atención» sin razón',
    (() => { const h = render(CUENTA_B).html;
      const band = num(h, /data-health-state="([^"]*)"/);
      const t0 = textOf(h);
      return band === 'weight_spread'
        && !/requiere atención/i.test(t0)
        && /Hay una novedad|Todo revisado|Sin novedades|equilibrio/i.test(t0); })(),
    JSON.stringify({ band: num(render(CUENTA_B).html, /data-health-state="([^"]*)"/),
      title: num(render(CUENTA_B).html, /class="intcc-hero-title">([^<]*)</) }));
  ok('7.2d el titular de la bandeja lee el estado COHERENTE, no el crudo del motor',
    /\}\[coherentState\];/.test(fnSrc('_intv5Reading'))
    && /CONTEXTUAL\.indexOf\(coherentState\)/.test(fnSrc('_intv5Reading')));
  ok('7.3 la palabra «material» no llega a ninguna superficie visible',
    (() => { const h = render(CUENTA_B).html; return !/\bmaterial(es)?\b/i.test(textOf(h)); })(),
    (textOf(render(CUENTA_B).html).match(/[^.]{0,40}material[^.]{0,40}/i) || [''])[0]);
  ok('7.4 sin pendientes pero con historial el espacio publica un acceso REAL al historial',
    /intel_see_history/.test(src0) && /is-quiet/.test(src0) && /reviewedCount > 0/.test(src0));
  ok('7.5 y sin historial no se pinta control: nada que no lleve a ninguna parte',
    /reviewedCount > 0 \?[\s\S]{0,400}: ''\)/.test(src0));
  ok('7.6 el destino del CTA es la sección de cambios, y navegar NO acusa nada',
    /href="#aurix-intel-changes"/.test(src0)
    && !/data-intel-see-changes[^>]*data-intel-ack/.test(src0));
  // La revisión financiera lo encontró: `reviewedCount` se derivaba de
  // `core.findingsAll.length` (CRUDO) menos `findingCount` (filtrado POR COPY), así
  // que un hallazgo sin frase contaba en uno y no en el otro y el hero podía
  // anunciar «1 cambio ya revisado · Ver el historial» para algo que ni está
  // revisado ni el destino puede pintar. Ahora sale de la MISMA lista.
  ok('7.4b el número del historial sale de la lista que el destino RENDERIZA',
    /_intv4FindingRows\(core, \{ all: true \}\)\.filter\(x => x\.reviewed\)\.length/.test(src0)
    && !/reading\.allCount \|\| 0\) - findingCount/.test(src0));
  ok('7.7 el hero no publica dos estados contradictorios a la vez',
    /activeReviewCount > 0\) \{\s*\n\s*nowState = 'review_pending';/.test(fnSrc('_intv5Reading')));
}

// ════════════════════════════════════════════════════════════════════════════
// §8 · ETIQUETAS
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§8 · etiquetas con evidencia');
{
  const CHIPS = (facts, score, intel) => { const c = makeCtx({});
    return run('_intv5Chips(' + JSON.stringify({ ledger: { facts: facts } }) + ','
      + JSON.stringify(score || {}) + ',' + JSON.stringify(intel || null) + ')', c); };
  const F = (k, v, values) => ({ semanticKey: k, value: v, values: values || {} });

  ok('8.1 SIN el hecho de concentración NO se publica «Concentración controlada»',
    CHIPS([]).length === 0, JSON.stringify(CHIPS([])));
  ok('8.2 con el hecho y un top-1 bajo SÍ se publica',
    CHIPS([F('top_position_weight', 20)]).some(ch => ch.label === DICT.es.intcc_chip_conc));
  ok('8.3 con un top-1 alto NO se publica',
    !CHIPS([F('top_position_weight', 70)]).some(ch => ch.label === DICT.es.intcc_chip_conc));
  ok('8.4 «Liquidez suficiente» NO se afirma si el usuario declaró necesidad INMINENTE',
    (() => { const base = CHIPS([F('cash_weight', 8)]);
      const withNeed = CHIPS([F('cash_weight', 8)], {}, { context: { fields: {
        liquidity_need: { value: 'imminent', provenance: 'user_answer' } } } });
      return base.some(ch => ch.label === DICT.es.intcc_chip_liq)
        && !withNeed.some(ch => ch.label === DICT.es.intcc_chip_liq); })());
  ok('8.5 …ni si declaró liquidez que Aurix todavía no ve',
    !CHIPS([F('cash_weight', 8)], {}, { context: { fields: {
      unregistered_liquidity: { value: 'yes', provenance: 'user_answer' } } } })
      .some(ch => ch.label === DICT.es.intcc_chip_liq));
  // El chip usa la MISMA normalización que el anillo de Salud —(effectiveN−1)/(N−1)—
  // así que no pueden contradecirse, y exige N≥3 porque por debajo de eso Salud
  // publica `weight_in_few` POR DEFINICIÓN. `ratio` (con su suelo 1/N) ya no decide.
  const EFF = (positions, effectiveN) => F('effective_holdings', 0,
    { positions: positions, effectiveN: effectiveN, ratio: effectiveN / positions });
  ok('8.6 «Diversificación adecuada» exige el reparto REESCALADO, no el ratio con suelo',
    CHIPS([EFF(6, 2.0)]).length === 0
    && CHIPS([EFF(6, 4.5)]).some(ch => ch.label === DICT.es.intcc_chip_div));
  // La QA visual lo encontró con N=1 (ratio 1/1) y la revisión financiera con N=2:
  // el suelo del ratio es 1/N, así que 90/10 daba 0,61 ≥ 0,60 y publicaba
  // «✓ Diversificación adecuada» junto a «Bitcoin pesa el 90 %».
  ok('8.6b con UNA posición el ratio 1/1 es degenerado: no se publica',
    !CHIPS([EFF(1, 1)]).some(ch => ch.label === DICT.es.intcc_chip_div));
  ok('8.6b2 …y con DOS tampoco, por alto que salga el ratio sin reescalar',
    (() => { const ninetyTen = EFF(2, 1.2195);            // ratio 0,61 · reescalado 0,22
      const fiftyFifty = EFF(2, 2);                        // ratio 1,00 · reescalado 1,00
      return !CHIPS([ninetyTen]).some(ch => ch.label === DICT.es.intcc_chip_div)
        && !CHIPS([fiftyFifty]).some(ch => ch.label === DICT.es.intcc_chip_div); })(),
    JSON.stringify([CHIPS([EFF(2, 1.2195)]), CHIPS([EFF(2, 2)])]));
  ok('8.6c la cartera de UN activo no publica NINGUNA etiqueta verde',
    (() => { const one = { assets: [A_ASSETS[0]], snap: { assetCount: 1, totUSD: 60000,
        categoryCount: 1, cashPct: 0, cryptoPct: 100, realEstatePct: 0, uncertifiablePositions: 0,
        topInvestedAsset: { name: 'Bitcoin', ticker: 'BTC', type: 'crypto', pctTotal: 100 },
        topCategory: { type: 'crypto', label: 'Cripto', pctTotal: 100 } },
        rows: [], serverRows: [], flows: [] };
      const h = render(one).html;
      return attrs(h, 'class="intcc-chip is-(good)"').length === 0
        && /data-health-state="single_position"/.test(h); })(),
    JSON.stringify(attrs(render({ assets: [A_ASSETS[0]], snap: { assetCount: 1, totUSD: 60000,
      categoryCount: 1, cashPct: 0, cryptoPct: 100, realEstatePct: 0, uncertifiablePositions: 0,
      topInvestedAsset: { name: 'Bitcoin', ticker: 'BTC', type: 'crypto', pctTotal: 100 },
      topCategory: { type: 'crypto', label: 'Cripto', pctTotal: 100 } }, rows: [], serverRows: [],
      flows: [] }).html, 'class="intcc-chip is-([a-z]+)"')));
  ok('8.7 una concentración declarada intencionada es CONTEXTO NEUTRAL, no aprobación',
    (() => { const ch = CHIPS([F('top_position_weight', 80)], { band: 'weight_in_few' },
        { context: { fields: { concentration_intent: { value: 'deliberate', provenance: 'user_answer' } } } });
      const ctx = ch.find(x => x.tone === 'context');
      return !!ctx && !/deliberada/i.test(ctx.label)
        && !ch.some(x => x.tone === 'good' && x.label === DICT.es.intcc_chip_conc); })(),
    JSON.stringify(CHIPS([F('top_position_weight', 80)], { band: 'weight_in_few' },
      { context: { fields: { concentration_intent: { value: 'deliberate', provenance: 'user_answer' } } } })));
  ok('8.8 …y la etiqueta de contexto NO lleva marca de verificación',
    /\.intcc-chip\.is-context::before \{ content: none; \}/.test(css)
    && /\.intcc-chip\.is-context \{[^}]*box-shadow: none/.test(css));
  ok('8.9 las etiquetas envuelven en varias líneas sin colisionar ni desbordar',
    /\.intcc-hero \.intcc-chips \{[^}]*row-gap/.test(css)
    && /\.intcc-hero \.intcc-chips \.intcc-chip \{[^}]*white-space: normal/.test(css));
  // ── EL HALLAZGO CRÍTICO DE LA REVISIÓN, Y EL ASSERT QUE FALTABA ──────────
  // La composición MÓVIL pinta las señales dentro de la card de Salud y su `<li>`
  // imprime un «✓» literal, así que la etiqueta neutral nueva salía como
  // «✓ Concentración declarada como decisión propia» EN VERDE y DENTRO del juicio
  // de salud. El assert anterior sólo miraba el chip de ESCRITORIO.
  // El contexto se siembra CON DUEÑO: `_aurixIntelReadOwned` falla cerrado con un
  // sello nulo (lección de M.06), así que sin `currentUser` la lectura devolvería
  // vacío y este assert pasaría por vacuidad. Se declara el dueño y se comprueba
  // que el chip LLEGA a la superficie antes de comprobar DÓNDE.
  const ctxRender = () => { const c = makeCtx(Object.assign({}, CUENTA_A));
    c.currentUser = { id: 'u-ctx' };
    run('var _aurixActiveUserId = "u-ctx";', c);
    run("__store[_AURIX_INTEL_CTX_KEY] = " + JSON.stringify(JSON.stringify({
      // `concentration_intent` declara `subjectRequired`, así que sin sujeto el
      // saneado del contexto lo descarta — y el assert habría pasado vacío.
      owner: 'u-ctx', schema: 1, fields: { concentration_intent: { value: 'deliberate',
        provenance: 'user_answer', answeredAt: NOW2 - DAY, subject: 'Bitcoin',
        purpose: 'interpretation_of_concentration', changes: 'interpretation' } },
      asked: {}, declined: {}, ack: {} })), c);
    return run('_renderIntelligenceCommandCenter()', c); };
  ok('8.7b el contexto declarado LLEGA a la superficie (no-vacuidad del caso móvil)',
    (() => { const h = ctxRender();
      return h.indexOf(DICT.es.intcc_chip_ctx_intent) >= 0
        && (h.match(/intcc-chip is-context/g) || []).length >= 1; })(),
    JSON.stringify((ctxRender().match(/intcc-chip is-[a-z]+/g) || [])));
  ok('8.7b2 …y en MÓVIL NO entra en la lista de Salud, que imprime un ✓ por fila',
    (() => { const h = ctxRender();
      const i = h.indexOf('intcc-m-health');
      const mHealth = h.slice(i, h.indexOf('</section>', i));
      return mHealth.indexOf(DICT.es.intcc_chip_ctx_intent) === -1
        && !/intcc-m-concl-row is-context/.test(h)
        && /intcc-m-hero[\s\S]{0,1200}intcc-chip is-context/.test(h); })(),
    JSON.stringify((ctxRender().match(/intcc-m-concl-row is-[a-z]+/g) || [])));
  // La reverificación señaló el segundo orden: el chip se gateaba SÓLO por la banda,
  // así que quien declaró deliberada su concentración con BTC al 91 % seguía
  // viéndolo tras reequilibrar. Ahora exige que EXISTA una concentración material
  // de la que hablar — el hecho del Core, que sólo entra por encima de su umbral.
  ok('8.7d sin concentración material NO se publica el contexto declarado (premisa rancia)',
    (() => { const ctxIntent = { context: { fields: { concentration_intent: {
        value: 'deliberate', provenance: 'user_answer', subject: 'Bitcoin' } } } };
      const withConc = CHIPS([F('top_position_weight', 80)], { band: 'weight_in_few' }, ctxIntent);
      const rebalanced = CHIPS([], { band: 'weight_in_few' }, ctxIntent);
      const tiny = CHIPS([F('top_position_weight', 12)], { band: 'weight_in_few' }, ctxIntent);
      return withConc.some(c => c.tone === 'context')
        && !rebalanced.some(c => c.tone === 'context')
        && !tiny.some(c => c.tone === 'context'); })(),
    JSON.stringify(CHIPS([], { band: 'weight_in_few' }, { context: { fields: {
      concentration_intent: { value: 'deliberate', provenance: 'user_answer', subject: 'Bitcoin' } } } })));
  // ── CHECKPOINT B · LA REGLA CAMBIÓ, Y CON ELLA LO QUE HAY QUE MEDIR ────
  // Este assert exigía `goodChips.map(...)` LITERAL: fosilizaba la
  // implementación, no el invariante. Y el invariante de entonces —«sólo
  // confirmaciones»— es justo lo que el checkpoint B corrige: la lista tiene
  // que poder decir qué limita la cifra. Lo que NO puede cambiar es que el
  // «✓» signifique confirmado.
  ok('8.7c el «✓» de la lista de Salud sólo acompaña a una CONFIRMACIÓN',
    (() => { const src0 = fnSrc('_renderIntelligenceCommandCenter');
      const m = src0.match(/intcc-m-concl-check"[^>]*>\$\{([^}]*)\}/);
      return !!m && /c\.tone === 'good' \? '✓'/.test(m[1]); })());
  ok('8.7f …y ninguna fila NO verificada lo lleva, medido sobre el HTML pintado',
    (() => { const h = render(CUENTA_B).html;
      const rows = h.match(/<li class="intcc-m-concl-row is-([a-z]+)"><span class="intcc-m-concl-check"[^>]*>([^<]*)</g) || [];
      return rows.every((r) => /is-good"/.test(r) === /✓/.test(r)); })(),
    JSON.stringify((render(CUENTA_B).html.match(/intcc-m-concl-row is-[a-z]+/g) || [])));
  // NO-VACUIDAD. Sin esto, 8.7f pasa con la lista vacía y con el limitador
  // nunca emitido — que es exactamente el defecto que el checkpoint B cierra.
  ok('8.7g el limitador SE EMITE de verdad: Salud publica por qué no es mayor',
    (() => { const h = render(CUENTA_B).html;
      return /class="intcc-chip is-limit"/.test(h)
        && /equivale a/.test(h) && /con el mismo peso/.test(h)
        && /registradas/.test(h); })(),
    JSON.stringify(attrs(render(CUENTA_B).html, 'class="intcc-chip is-([a-z]+)"')));
  ok('8.7g2 la frase del limitador es LENGUAJE DE USUARIO, no la fórmula leída',
    (() => { const es = DICT.es.intcc_chip_limit_spread('2,5', 4);
      const en = DICT.en.intcc_chip_limit_spread('2.5', 4);
      return !/^Tu peso/.test(es) && !/tu peso se reparte/i.test(es)
        && /equivale a 2,5 posiciones con el mismo peso, de las 4 registradas/.test(es)
        && !/^Your weight/.test(en) && /equally weighted/.test(en)
        // …y sigue diciendo EXACTAMENTE lo que el owner calcula: los dos términos.
        && es.indexOf('2,5') !== -1 && es.indexOf('4') !== -1; })(),
    DICT.es.intcc_chip_limit_spread('2,5', 4));
  ok('8.7h el limitador sale del MISMO owner que la cifra, no de una derivación',
    /limiters:\s*_intccHealthLimiters\(h\)/.test(fnSrc('_intccHealthScore'))
    && /\(\(score && score\.limiters\) \|\| \[\]\)/.test(fnSrc('_intv5Chips')));
  ok('8.7i con el anillo NO publicable no se añade una segunda frase encima del estado',
    /h\.ringPublishable && Number\.isFinite\(h\.ring\) && h\.ring < 100/.test(fnSrc('_intccHealthLimiters')));
  ok('8.7j una dimensión no medible se DECLARA, nunca se penaliza',
    (() => { const src0 = fnSrc('_intccHealthLimiters');
      return /!== _AURIX_AI_AVAIL\.AVAILABLE/.test(src0)
        && /tone: 'unknown'/.test(src0) && !/tone: 'warn'/.test(src0); })());
  ok('8.7e el contexto declarado sigue SIN entrar en la lista de Salud',
    /goodChips = chips\.filter\(c => c && c\.tone !== 'context'\)/.test(fnSrc('_renderIntelligenceCommandCenter')));
  ok('8.10 en la CUENTA A no se fabrica una etiqueta verde para rellenar',
    (() => { const h = render(CUENTA_A).html;
      const chips = attrs(h, 'class="intcc-chip is-(good)"');
      return chips.length === 0; })(),
    JSON.stringify(attrs(render(CUENTA_A).html, 'class="intcc-chip is-([a-z]+)"')));
}

// ════════════════════════════════════════════════════════════════════════════
// §9 · PREGUNTAS
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§9 · preguntas contextuales');
{
  const engine = () => { const c = makeCtx({}); return c; };
  const QS = (model, ctx, pol) => { const c = engine();
    return run('_aurixIntelQuestions(' + JSON.stringify(model) + ',' + JSON.stringify(ctx || { fields: {} })
      + ', 4, ' + JSON.stringify(pol || { now: NOW2 }) + ')', c); };
  const M = (o) => Object.assign({
    concentration: { availability: 'available', semanticLabel: 'dominant_position',
      topContributor: { name: 'Bitcoin' } },
    liquidity: { availability: 'available', cashPct: 12, changePp: null, semanticLabel: 'stable' },
    diversification: { availability: 'available' },
    structure: { availability: 'available' },
    evolution: { availability: 'available' } }, o || {});

  ok('9.1 CUENTA A: concentración cripto certificada y sin contexto ⇒ SÍ hay pregunta',
    QS(M()).some(q => q.field === 'concentration_intent'), JSON.stringify(QS(M()).map(q => q.field)));
  ok('9.2 CERO liquidez registrada abre la pregunta que faltaba (la ve Aurix o no la ve)',
    QS(M({ liquidity: { availability: 'available', cashPct: 0, semanticLabel: 'stable' } }))
      .some(q => q.field === 'unregistered_liquidity'),
    JSON.stringify(QS(M({ liquidity: { availability: 'available', cashPct: 0, semanticLabel: 'stable' } })).map(q => q.field)));
  ok('9.3 …y con liquidez registrada esa pregunta NO existe (no se pregunta por preguntar)',
    !QS(M()).some(q => q.field === 'unregistered_liquidity'));
  ok('9.4 la prioridad ofrece las CINCO opciones del SPEC, incluida flexibilidad',
    (() => { const q = QS(M()).find(x => x.field === 'primary_goal');
      return !!q && q.options.length === 5 && q.options.indexOf('flexibility') !== -1
        && q.options.indexOf('undecided') !== -1; })(),
    JSON.stringify((QS(M()).find(x => x.field === 'primary_goal') || {}).options));
  ok('9.5 «¿Eres experto?» NO es una pregunta del dock',
    !(fnSrc('_aurixIntelQuestions').match(/field: 'experience'/)));
  ok('9.6 una respuesta EQUIVALENTE ya dada cierra la pregunta',
    !QS(M(), { fields: { concentration_intent: { value: 'deliberate', answeredAt: 1 } } })
      .some(q => q.field === 'concentration_intent'));
  ok('9.7 UNA sola pregunta llega a la superficie',
    (() => { const h = render(CUENTA_A).html;
      return count(h, /data-intel-q="/g) <= 1; })(),
    String(count(render(CUENTA_A).html, /data-intel-q="/g)));
  ok('9.8 el rechazo se respeta 90 días y la pausa 30',
    QS(M(), { fields: {}, declined: { concentration_intent: NOW2 - DAY } }).every(q => q.field !== 'concentration_intent')
    && QS(M(), { fields: {}, pausedAt: NOW2 - DAY }).length === 0);
  ok('9.9 el cooldown de una pregunta MOSTRADA se respeta…',
    !QS(M(), { fields: {}, asked: { q_concentration_intent: { at: NOW2 - 2 * DAY, count: 1 } } })
      .some(q => q.field === 'concentration_intent'));
  ok('9.10 …y una OPERACIÓN REAL posterior a esa impresión lo reabre UNA vez',
    (() => { const asked = { q_concentration_intent: { at: NOW2 - 2 * DAY, count: 1 } };
      const reopened = QS(M(), { fields: {}, asked: asked }, { now: NOW2, materialActionAt: NOW2 - HOUR });
      const notReopened = QS(M(), { fields: {}, asked: asked }, { now: NOW2, materialActionAt: NOW2 - 5 * DAY });
      return reopened.some(q => q.field === 'concentration_intent')
        && !notReopened.some(q => q.field === 'concentration_intent'); })());
  ok('9.11 el instante de la operación sale del LEDGER, no de la pintura',
    (() => { const f = bareOf(fnSrc('_aurixIntel'));
      return /positions_registered_today/.test(f) && /operation_registered_/.test(f)
        && /recordedAt/.test(f) && !/Date\.now\(\)[^;]*materialActionAt/.test(f); })());
  // ── EL CASO QUE FALTABA, Y EL DEFECTO QUE ESCONDÍA ───────────────────────
  // Para una TANDA el hecho fija `recordedAt`/`effectiveAt` a null por contrato, y
  // mi cadena caía a `window.startAt` = `min(medianoche UTC, ahora−24h)`: un valor
  // que SE MUEVE entre pinturas. Con las dos cuentas de referencia el assert pasaba
  // por ausencia de tanda. Ahora se ejercita con CUENTA_C y se comprueba que la
  // señal (a) existe, (b) sale del ledger y (c) NO se mueve al repintar.
  ok('9.12 un repintado NO cuenta como acción: la señal sale del LEDGER y no se mueve',
    (() => { const c = makeCtx(CUENTA_C);
      const a = run('_aurixIntel({ depth: "premium" }).questionPolicy.materialActionAt', c);
      const b = run('_aurixIntel({ depth: "premium" }).questionPolicy.materialActionAt', c);
      const winFloor = Math.min(DAY_START, NOW2 - DAY);
      return a === b && Number.isFinite(a)
        && Math.abs(a - (NOW2 - 2 * HOUR)) < 60000        // el instante REAL de la 2ª operación
        && a !== winFloor; })(),
    JSON.stringify({ at: run('_aurixIntel({ depth: "premium" }).questionPolicy.materialActionAt', makeCtx(CUENTA_C)),
      expected: NOW2 - 2 * HOUR, winFloor: Math.min(DAY_START, NOW2 - DAY) }));
  ok('9.12b la TANDA publica su instante en el hecho, no lo deriva el lector',
    (() => { const c = makeCtx(CUENTA_C);
      const core0 = run('_aurixIntelligenceCore({})', c);
      const f = (core0.ledger.facts || []).find(x => x.semanticKey === 'positions_registered_today');
      return !!f && Number.isFinite(f.values.lastActionAt)
        && f.values.recordedAt === null && f.values.effectiveAt === null; })(),
    JSON.stringify((() => { const c = makeCtx(CUENTA_C);
      const f = ((run('_aurixIntelligenceCore({})', c).ledger.facts) || [])
        .find(x => x.semanticKey === 'positions_registered_today');
      return f ? { lastActionAt: f.values.lastActionAt, recordedAt: f.values.recordedAt } : null; })()));
  ok('9.12c sin timestamp del ledger NO hay reapertura (fail-closed, sin reloj)',
    (() => { const f = bareOf(fnSrc('_aurixIntel'));
      return !/window\.startAt/.test(f.slice(f.indexOf('materialActionAt = (()'), f.indexOf('return at;')))
        && /Number\.isFinite\(v\.lastActionAt\)/.test(f); })());
  ok('9.12d y la tanda REGISTRADA HOY reabre la pregunta mostrada hace dos días',
    (() => { const asked = { q_concentration_intent: { at: NOW2 - 2 * DAY, count: 1 } };
      const c = makeCtx(CUENTA_C);
      const at = run('_aurixIntel({ depth: "premium" }).questionPolicy.materialActionAt', c);
      const q = QS(M(), { fields: {}, asked: asked }, { now: NOW2, materialActionAt: at });
      return q.some(x => x.field === 'concentration_intent'); })());
  ok('9.13 una pregunta NO modifica automáticamente la Salud (sólo lenguaje y prioridad)',
    (() => { const c = engine();
      const F = run('JSON.stringify(_AURIX_INTEL_FIELDS)', c);
      return !/"changes":"value"/.test(F) && /"changes":"interpretation"/.test(F); })());
  ok('9.14 «todavía no lo tengo claro» es un APLAZAMIENTO: no cierra la pregunta para siempre',
    QS(M(), { fields: { primary_goal: { value: 'undecided', answeredAt: 1 } } })
      .some(q => q.field === 'primary_goal')
    && !QS(M(), { fields: { primary_goal: { value: 'grow', answeredAt: 1 } } })
        .some(q => q.field === 'primary_goal'));
  ok('9.15 la pregunta vive en UN solo nodo del DOM (móvil y escritorio comparten card)',
    (() => { const h = render(CUENTA_A).html;
      return count(h, /class="intcc-card intv12-qcard"/g) <= 1; })());
}

// ════════════════════════════════════════════════════════════════════════════
// §10 · ACUSE DE RECIBO
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§10 · acuse de recibo');
{
  const init = fnSrc('_initIntelSeeChanges');
  ok('10.1 un guardado FALLIDO no se presenta como guardado',
    /const _ackSaved = \(typeof _aurixIntelAcknowledge === 'function'\)/.test(init)
    && /if \(!_ackSaved\) \{/.test(init));
  ok('10.2 …y el optimismo visual se revierte de forma EXPLÍCITA, con aviso',
    /ack\.classList\.remove\('is-done'\)/.test(init)
    && /intv12-ack-error/.test(init)
    && /intel_ack_failed/.test(init)
    && /role', 'status'/.test(init));
  ok('10.3 al fallar NO se repinta (un repintado borraría el aviso) y el botón sigue accionable',
    (() => { const i = init.indexOf('if (!_ackSaved)');
      const j = init.indexOf('return;', i);
      const k = init.indexOf('renderIntelligenceTab', i);
      return i >= 0 && j > i && (k === -1 || j < k)
        && /ack\.removeAttribute\('aria-disabled'\)/.test(init); })());
  ok('10.4 un reintento con éxito limpia el aviso anterior',
    /querySelector\('\.intv12-ack-error'\); if \(old\) old\.remove\(\)/.test(init));
  ok('10.5 el aviso existe en los DOS idiomas y no es una alerta crítica',
    !!DICT.es.intel_ack_failed && !!DICT.en.intel_ack_failed
    && /\.intv12-ack-error \{[^}]*color: #f3cf9a/.test(css));
  ok('10.6 el owner devuelve FALSO cuando no puede atribuir el acuse a un dueño',
    /return okw;/.test(fnSrc('_aurixIntelAcknowledge'))
    && /if \(!conceptId\) return false;/.test(fnSrc('_aurixIntelAcknowledge')));
  // CHECKPOINT H — la lista sigue siendo el HISTORIAL completo (`all: true`);
  // lo único que se añade es la exclusión de lo que «Lo que importa hoy» ya
  // reclamó, que no borra nada: mueve el hecho de superficie.
  ok('10.7 el acuse NO borra la fila del historial: cambia de estado',
    /rows\.map\(x => `/.test(fnSrc('_intv4ChangedHtml'))
    && /_intv4FindingRows\(core, \{ all: true \}\)/.test(fnSrc('_intv4ChangedHtml'))
    && /reviewed: all \? !active\.has\(id\) : false/.test(fnSrc('_intv4FindingRows')));
}

// ════════════════════════════════════════════════════════════════════════════
// §11 · RADAR
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§11 · radar · cinco puntos y figura cerrada');
{
  const RADAR = (vals, dims) => { const c = makeCtx({});
    return run('_intccRadarSvg(' + JSON.stringify(vals) + ',' + JSON.stringify(dims) + ')', c); };
  const DIMS = (unav) => ['diversification', 'stability', 'liquidity', 'growth', 'concentration']
    .map(k => ({ key: k, label: k, suffix: '%', unavailable: (unav || []).indexOf(k) !== -1, display: null }));
  const FIVE = { diversification: 40, stability: 70, liquidity: 30, growth: 55, concentration: 60 };

  const h5 = RADAR(FIVE, DIMS([]));
  ok('11.1 cinco valores ⇒ cinco marcadores, cinco segmentos y figura CERRADA con relleno',
    count(h5, /class="intcc-radar-dot"/g) === 5
    && /data-svg-edges="5"/.test(h5) && /data-svg-neutral="0"/.test(h5)
    && /intcc-radar-area/.test(h5) && !/stroke-dasharray/.test(h5),
    JSON.stringify({ dots: count(h5, /class="intcc-radar-dot"/g),
      edges: num(h5, /data-svg-edges="(\d+)"/), neutral: num(h5, /data-svg-neutral="(\d+)"/) }));
  ok('11.2 exactamente UN marcador por eje, en los cinco',
    (() => { const axes = attrs(h5, 'class="intcc-radar-dot" cx="[^"]*" cy="[^"]*" r="[^"]*" data-axis="([^"]+)"');
      return new Set(axes).size === 5 && axes.length === 5; })(),
    JSON.stringify(attrs(h5, 'data-axis="([^"]+)" data-availability')));

  // La geometría, comprobada por coordenadas REALES.
  const cx = 110, cy = 106, R = 100;   // §4 — el marco crece dentro de la misma card
  const radiusOf = (html, axis) => { const m = html.match(new RegExp(
    'class="intcc-radar-dot[^"]*" cx="([\\d.]+)" cy="([\\d.]+)" r="[^"]*" data-axis="' + axis + '"'));
    if (!m) return null; const dx = Number(m[1]) - cx, dy = Number(m[2]) - cy;
    return Math.sqrt(dx * dx + dy * dy) / R; };
  const hZero = RADAR({ diversification: 100, stability: 70, liquidity: 0, growth: 55, concentration: 60 }, DIMS([]));
  ok('11.3 un 0 % REAL se dibuja en el límite interior, NUNCA en el centro',
    (() => { const r = radiusOf(hZero, 'liquidity'); return r !== null && r > 0.28 && r < 0.32; })(),
    String(radiusOf(hZero, 'liquidity')));
  ok('11.4 un 100 % NO toca el vértice exterior',
    (() => { const r = radiusOf(hZero, 'diversification'); return r !== null && r > 0.88 && r <= 0.901; })(),
    String(radiusOf(hZero, 'diversification')));
  ok('11.5 un valor pequeño (1/7 ≈ 14 %) queda cerca del interior pero SEPARADO del cero',
    (() => { const h = RADAR(Object.assign({}, FIVE, { diversification: 14 }), DIMS([]));
      const rSmall = radiusOf(h, 'diversification'), rZero = radiusOf(hZero, 'liquidity');
      return rSmall > rZero + 0.04 && rSmall < 0.42; })(),
    JSON.stringify({ small: radiusOf(RADAR(Object.assign({}, FIVE, { diversification: 14 }), DIMS([])), 'diversification'),
                     zero: radiusOf(hZero, 'liquidity') }));
  ok('11.6 dos valores bajos simultáneos conservan puntos DIFERENCIADOS (ejes distintos)',
    (() => { const h = RADAR({ diversification: 3, stability: 70, liquidity: 4, growth: 55, concentration: 60 }, DIMS([]));
      const m = [...h.matchAll(/class="intcc-radar-dot" cx="([\d.]+)" cy="([\d.]+)"/g)]
        .map(x => [Number(x[1]), Number(x[2])]);
      let minD = Infinity;
      for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++)
        minD = Math.min(minD, Math.hypot(m[i][0] - m[j][0], m[i][1] - m[j][1]));
      return m.length === 5 && minD > 8; })());
  ok('11.7 NINGÚN marcador cae en el centro exacto, con cualquier combinación',
    [{}, { liquidity: 0, diversification: 0, stability: 0, growth: 0, concentration: 0 }]
      .every(ov => { const h = RADAR(Object.assign({}, FIVE, ov), DIMS([]));
        return !new RegExp('cx="' + cx + '" cy="' + cy + '"').test(h)
          && !/cx="110.0" cy="106.0"/.test(h); }));

  // Datos desconocidos.
  const hUnk = RADAR({ diversification: 40, liquidity: 30, concentration: 60 }, DIMS(['stability', 'growth']));
  // SUPREME CLOSURE §5 RE-DECIDE ESTA ASERCIÓN, y conviene dejar escrito por qué:
  // era el ejemplo de manual de un gate que FOSILIZA COMO CONTRATO LO QUE ERA UNA
  // LIMITACIÓN. §11 metió el estado «sin datos» dentro de la figura (marcador
  // hueco) y el gate lo convirtió en requisito; la QA del founder sobre la
  // pantalla real leyó ese hueco como un defecto de pintado, no como un límite
  // declarado. Ahora los cinco marcadores son IDÉNTICOS y la limitación vive
  // íntegramente en el texto. Lo que el gate mide pasa a ser eso.
  ok('11.8 dos ejes sin datos ⇒ cinco marcadores IDÉNTICOS, sin hueco ni muesca',
    count(hUnk, /class="intcc-radar-dot"/g) === 5
    && !/intcc-radar-dot is-unknown/.test(hUnk)
    && /data-svg-unknown="2"/.test(hUnk)
    && count(hUnk, /data-availability="unknown"/g) === 2
    && count(hUnk, /data-availability="measured"/g) === 3,
    JSON.stringify({ dots: count(hUnk, /class="intcc-radar-dot"/g),
      unknown: count(hUnk, /data-availability="unknown"/g) }));
  ok('11.8b …y los cinco ejes se enumeran en la descripción accesible',
    (() => { const m = hUnk.match(/aria-label="([^"]+)"/);
      if (!m) return false;
      const a = m[1];
      return /data-svg-a11y-axes="5"/.test(hUnk)
        && (a.match(/:/g) || []).length >= 5
        && (a.match(/sin datos/g) || []).length === 2; })(),
    JSON.stringify((hUnk.match(/aria-label="([^"]+)"/) || [])[1] || null));
  // §6 RE-DECIDE EL TRATAMIENTO: el tramo que toca un eje sin datos era DISCONTINUO
  // y en la pantalla real hacía que el gráfico entero pareciese roto. Pasa a sólido
  // NEUTRAL —mismo grosor, color apagado, sin resplandor—, así que la trayectoria
  // se sigue de un vistazo y sigue sin poder leerse como una medición.
  ok('11.9 la figura se recorre completa y los CINCO segmentos son idénticos',
    /data-svg-edges="5"/.test(hUnk) && /data-svg-neutral="4"/.test(hUnk)
    && count(hUnk, /class="intcc-radar-edge"/g) === 5
    && !/intcc-radar-edge is-unknown/.test(hUnk)
    && !/stroke-dasharray/.test(hUnk)
    && count(hUnk, /<g class="intcc-radar-edges">/g) === 1,
    JSON.stringify({ edges: num(hUnk, /data-svg-edges="(\d+)"/), neutral: num(hUnk, /data-svg-neutral="(\d+)"/),
      drawn: count(hUnk, /class="intcc-radar-edge"/g) }));
  ok('11.10 el quinto eje cierra con el primero (la trayectoria es un ciclo)',
    (() => { const src0 = fnSrc('_intccRadarSvg');
      return /const j = \(i \+ 1\) % n;/.test(src0) && /for \(let i = 0; i < n; i\+\+\)/.test(src0); })());
  ok('11.11 el eje desconocido se sitúa en el límite INTERIOR de referencia',
    (() => { const r = radiusOf(hUnk, 'stability'); return r !== null && r > 0.28 && r < 0.32; })(),
    String(radiusOf(hUnk, 'stability')));
  ok('11.12 y NO se rellena área con un eje desconocido dentro',
    !/intcc-radar-area/.test(hUnk));
  ok('11.13 «sin datos» se dice con palabras, no con un número',
    count(hUnk, /class="intcc-radar-val is-unavailable"/g) === 2 && /sin datos/.test(hUnk));
  // Los tres estados siguen siendo TRES — lo que cambia es el canal. Ya no los
  // distingue el relleno del marcador (que ahora es uno solo) sino el TEXTO: un
  // cero real imprime «0%», un valor pequeño imprime su cifra, y un eje sin dato
  // imprime la palabra. Eso es lo que el §5 pide y lo que un lector de pantalla
  // puede seguir; un relleno no lo es.
  ok('11.14 los TRES estados se distinguen POR TEXTO: 0 real, valor pequeño, «sin datos»',
    (() => { const h = RADAR({ diversification: 14, stability: 70, liquidity: 0, concentration: 60 },
        DIMS(['growth']));
      const zero = /data-axis="liquidity" data-availability="measured"/.test(h);
      const small = /data-axis="diversification" data-availability="measured"/.test(h);
      const unk = /data-axis="growth" data-availability="unknown"/.test(h);
      return zero && small && unk && />0%</.test(h) && /sin datos/.test(h)
        && count(h, /class="intcc-radar-dot"/g) === 5
        && !/intcc-radar-dot is-unknown/.test(h); })(),
    RADAR({ diversification: 14, stability: 70, liquidity: 0, concentration: 60 }, DIMS(['growth'])).slice(0, 200));
  ok('11.15 todos los ejes sin datos: cinco marcadores, cinco segmentos, CERO relleno',
    (() => { const h = RADAR({}, DIMS(['diversification', 'stability', 'liquidity', 'growth', 'concentration']));
      return count(h, /class="intcc-radar-dot"/g) === 5
        && count(h, /data-availability="unknown"/g) === 5
        && /data-svg-edges="5"/.test(h) && /data-svg-neutral="5"/.test(h)
        && !/intcc-radar-area/.test(h)
        && count(h, /class="intcc-radar-val is-unavailable"/g) === 5
        && ((((h.match(/aria-label="([^"]+)"/) || [])[1]) || '').match(/sin datos/g) || []).length === 5; })());
  ok('11.16 la zona central excluida NO forma parte de la retícula medible',
    (() => { const src0 = fnSrc('_intccRadarSvg');
      // Los anillos se mapean por la MISMA transformación de la serie y los ejes
      // arrancan del anillo interior, no del centro.
      return /rings \+= `<polygon class="intcc-radar-ring" points="\$\{poly\(rBand\(f\)\)\}"\/>`/.test(src0)
        && /x1="\$\{ix\.toFixed\(1\)\}" y1="\$\{iy\.toFixed\(1\)\}"/.test(src0)
        && !/x1="\$\{cx\}" y1="\$\{cy\}"/.test(src0); })());
  // §7 — el halo pasa a ser un DISCO opaco del color del lienzo INMEDIATAMENTE
  // BAJO el marcador. Como anillo dibujado encima se solapaba con el contorno del
  // hueco y lo mordía: en la captura a 3× los «sin datos» parecían iconos con una
  // muesca. Debajo cumple lo que el orden de capas persigue —ninguna línea
  // atraviesa el centro de un marcador— sin comerse el marcador.
  ok('11.17 el orden de capas es retícula → segmentos → marcador con su halo → etiquetas',
    (() => { const s0 = hUnk;
      const i1 = s0.indexOf('intcc-radar-grid');
      const i3 = s0.indexOf('<g class="intcc-radar-edges">'), i5 = s0.indexOf('intcc-radar-halos');
      const i4 = s0.indexOf('intcc-radar-dots'), i6 = s0.indexOf('intcc-radar-labels');
      return i1 < i3 && i3 < i5 && i5 < i4 && i4 < i6; })(),
    JSON.stringify({ grid: hUnk.indexOf('intcc-radar-grid'), edges: hUnk.indexOf('<g class="intcc-radar-edges">'),
      halos: hUnk.indexOf('intcc-radar-halos'), dots: hUnk.indexOf('intcc-radar-dots') }));
  ok('11.18 el halo es un DISCO opaco bajo el marcador: corta las líneas sin morderlo',
    /\.intcc-radar-halo \{ fill: #111726; stroke: none; \}/.test(css)
    && count(h5, /class="intcc-radar-halo"/g) === 5
    && h5.indexOf('intcc-radar-halos') < h5.indexOf('intcc-radar-dots'));
  ok('11.19 la transformación gráfica NO altera el dato publicado',
    (() => { const s0 = fnSrc('_intccRadarSvg');
      return /d\.display != null \? String\(d\.display\) : \(radar\[d\.key\] \+ \(d\.suffix \|\| ''\)\)/.test(s0)
        && !/rOf\([^)]*\)[^;]*radar-val/.test(s0); })());
  ok('11.20 coordenadas ESTABLES con datos iguales (sin jitter al refrescar)',
    RADAR(FIVE, DIMS([])) === RADAR(FIVE, DIMS([])));
  ok('11.21 la transición se declara y respeta `prefers-reduced-motion`',
    /\.intcc-radar-area, \.intcc-radar-edge, \.intcc-radar-halo, \.intcc-radar-dot \{/.test(css)
    && /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,260}\.intcc-radar-dot \{ transition: none/.test(css));
  // §7 — MISMO diámetro exterior para los cinco, en los tres viewports.
  // §5 — UNA SOLA REGLA POR VIEWPORT. Que no exista ninguna declaración
  // `.is-unknown` en el CSS del radar ES la aserción: mientras exista, alguien
  // puede reintroducir el hueco sin que nada se ponga rojo.
  ok('11.22 los cinco marcadores comparten diámetro, relleno y brillo en los tres viewports',
    /\.intv6-radar \.intcc-radar-dot \{ r: 4; \}/.test(css)
    && /\.intcc-radar-dot \{ r: 4\.4px; fill: #e2edff; \}/.test(css)
    && !/intcc-radar-dot\.is-unknown/.test(css)
    && !/intcc-radar-edge\.is-unknown/.test(css)
    && !/intcc-radar-halo\.is-unknown/.test(css)
    && !/intcc-radar-axis\.is-unavailable/.test(css));
  ok('11.23 en las DOS cuentas de referencia el radar publica sus cinco ejes',
    [CUENTA_A, CUENTA_B].every(f => { const h = render(f).html;
      return /data-axes="5"/.test(h) && count(h, /class="intcc-radar-dot[" ]/g) === 5
        && /data-svg-edges="5"/.test(h); }),
    JSON.stringify([CUENTA_A, CUENTA_B].map(f => { const h = render(f).html;
      return { axes: num(h, /data-axes="(\d+)"/), dots: count(h, /class="intcc-radar-dot[" ]/g),
               edges: num(h, /data-svg-edges="(\d+)"/) }; })));
  // §11/§12 — el redondeo dejó de vivir en el owner: `_aurixHealthSnapshot`
  // conserva `cashPct` crudo y el eje lo rotula con el formateador canónico. Antes,
  // una liquidez real del 0,25 % llegaba como 0 y el eje decía «0 %» — la
  // afirmación de que no hay nada.
  ok('11.23b el eje de liquidez no rotula un CERO que no es cero',
    (() => { const r = run('_intv7RadarAxes()', makeCtx(LIQ_SUB1));
      return r.display && r.display.liquidity === '<1%' && Number(r.values.liquidity) > 0; })(),
    JSON.stringify((() => { const r = run('_intv7RadarAxes()', makeCtx(LIQ_SUB1));
      return { d: r.display, v: r.values.liquidity }; })()));
  ok('11.23c …y un CERO REAL sigue rotulando 0 %',
    (() => { const h = render(CUENTA_A).html; return />0%</.test(h); })());
  // ════════════════════════════════════════════════════════════════════════
  // CIERRE FINAL · CASO DE ACEPTACIÓN DEL SPEC Y TAMAÑO REAL
  // ════════════════════════════════════════════════════════════════════════
  // 2,2/7 · concentración 31 % · liquidez 7 % · Estabilidad y Crecimiento sin
  // datos, que es exactamente la captura autenticada de 390 px que abrió este
  // cierre. Era el caso en que el radar «parecía un símbolo pequeño».
  const ACC = RADAR({ diversification: 31, liquidity: 7, concentration: 31 },
    DIMS(['stability', 'growth']).map(d => Object.assign({}, d,
      { display: d.key === 'diversification' ? '2,2 / 7' : null })));
  ok('11.25 CASO DE ACEPTACIÓN · cinco coordenadas, cinco marcadores y cinco segmentos',
    count(ACC, /class="intcc-radar-dot[" ]/g) === 5
    && count(ACC, /class="intcc-radar-halo[" ]/g) === 5
    && /data-svg-edges="5"/.test(ACC) && /data-svg-axes="5"/.test(ACC),
    JSON.stringify({ dots: count(ACC, /class="intcc-radar-dot[" ]/g),
      edges: num(ACC, /data-svg-edges="(\d+)"/) }));
  ok('11.25b …tres medidos y dos desconocidos, diferenciados SÓLO por texto',
    count(ACC, /class="intcc-radar-dot"/g) === 5
    && count(ACC, /data-availability="measured"/g) === 3
    && count(ACC, /data-availability="unknown"/g) === 2
    && count(ACC, /class="intcc-radar-edge"/g) === 5
    && !/is-unknown/.test(ACC)
    && /data-svg-neutral="4"/.test(ACC)
    && count(ACC, /class="intcc-radar-val is-unavailable"/g) === 2
    && ((((ACC.match(/aria-label="([^"]+)"/) || [])[1]) || '').match(/sin datos/g) || []).length === 2,
    JSON.stringify({ dots: count(ACC, /class="intcc-radar-dot"/g),
      unknown: count(ACC, /data-availability="unknown"/g),
      edges: count(ACC, /class="intcc-radar-edge"/g),
      labels: count(ACC, /class="intcc-radar-val is-unavailable"/g) }));
  ok('11.25c …y el dato publicado es el REAL, no la coordenada',
    /2,2 \/ 7/.test(ACC) && />31%</.test(ACC) && />7%</.test(ACC));
  ok('11.25d ningún marcador en el centro ni en el vértice exterior',
    (() => { const rs = [...ACC.matchAll(/class="intcc-radar-dot[^"]*" cx="([\d.]+)" cy="([\d.]+)"/g)]
        .map(m => Math.hypot(Number(m[1]) - cx, Number(m[2]) - cy) / R);
      return rs.length === 5 && rs.every(r => r >= 0.29 && r <= 0.901); })(),
    JSON.stringify([...ACC.matchAll(/class="intcc-radar-dot[^"]*" cx="([\d.]+)" cy="([\d.]+)"/g)]
      .map(m => +(Math.hypot(Number(m[1]) - cx, Number(m[2]) - cy) / R).toFixed(3))));
  // §4 — EL TAMAÑO, comprobable sin navegador: el marco mide 2·R·sen(72°) unidades
  // de viewBox, y el SVG ocupa el 100 % de su envoltorio (el tope de 280px en
  // móvil se retiró), así que la fracción del ancho útil de la card es
  // exactamente la fracción del viewBox. Medido después en el navegador: 52,5 %.
  ok('11.26 el marco exterior ocupa entre el 50 % y el 58 % del ancho del viewBox',
    (() => { const vb = (ACC.match(/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/) || []);
      if (!vb.length) return false;
      const frac = (2 * R * Math.sin(72 * Math.PI / 180)) / Number(vb[3]);
      return frac >= 0.50 && frac <= 0.58; })(),
    JSON.stringify({ viewBox: (ACC.match(/viewBox="[^"]*"/) || [''])[0],
      frac: +((2 * R * Math.sin(72 * Math.PI / 180)) / Number((ACC.match(/viewBox="[^ ]+ [^ ]+ ([\d.]+)/) || [, 1])[1])).toFixed(3) }));
  ok('11.26b …y en móvil el SVG ya no está capado por debajo de su card',
    /\.intcc-radar-svg \{ max-width: 100%; \}/.test(css)
    && !/\.intcc-radar-svg \{ max-width: 280px; \}/.test(css));
  ok('11.26c la retícula son como mucho cinco anillos, y ninguna línea va partida',
    count(ACC, /class="intcc-radar-ring/g) <= 5
    && count(ACC, /class="intcc-radar-ring/g) >= 4
    && !/stroke-dasharray/.test(ACC)
    && !/\.intcc-radar-axis\.is-unavailable \{[^}]*stroke-dasharray/.test(css),
    String(count(ACC, /class="intcc-radar-ring/g)));
  // ── §1 · ORDEN RESPONSIVE ───────────────────────────────────────────────
  // El bloque de orden es el que declara `.intcc-hero { order: 1; }`: hay varios
  // `@media (max-width: 1023px)` en el fichero y sólo uno lleva la escalera.
  const MOBILE_ORDER = (() => {
    const blocks = css.split('@media (max-width: 1023px)').slice(1);
    return blocks.find(b0 => /\.intcc-hero\s*\{ order: 1; \}/.test(b0)) || '';
  })();
  const ordOf = (sel) => {
    const r = MOBILE_ORDER.match(new RegExp(sel.replace('.', '\\.') + '\\s*\\{ order: (\\d+); \\}'));
    return r ? Number(r[1]) : null;
  };
  // LO QUE IMPORTA ES LA SECUENCIA, NO EL NÚMERO. Fijar los valores absolutos
  // convertía en contrato una numeración contigua, de modo que insertar una card
  // en su sitio —lo que el §6 pide para el comparador— ponía el gate en rojo sin
  // que el orden de lectura hubiera cambiado. Se mide la secuencia RELATIVA, que
  // es la que el founder aprobó, y además se exige que no haya empates: un
  // `order` repetido dejaría la composición en manos del orden del DOM (N.8c).
  ok('1.1 MÓVIL · Factores → Explora → Radar → Comparador → Hoy → Evolución → Cambios',
    (() => { const seq = ['.intcc-hero', '.intv12-qcard', '.intcc-drivers', '.intcc-explore',
        '.intcc-radar', '.intv14-cmp', '.intcc-watch', '.intcc-timeline', '.intv4-changed'];
      const v = seq.map(ordOf);
      if (v.some(x => x === null)) return false;
      for (let i = 1; i < v.length; i++) if (!(v[i] > v[i - 1])) return false;
      return true; })(),
    JSON.stringify({ hero: ordOf('.intcc-hero'), q: ordOf('.intv12-qcard'),
      drivers: ordOf('.intcc-drivers'), explore: ordOf('.intcc-explore'),
      radar: ordOf('.intcc-radar'), comparador: ordOf('.intv14-cmp'), watch: ordOf('.intcc-watch'),
      memoria: ordOf('.intcc-timeline'), changed: ordOf('.intv4-changed') }));
  ok('1.1b …y en ≤640px la cabecera sigue siendo Inteligencia → Salud → Pregunta',
    (() => { const b0 = css.split('@media (max-width: 640px)')
        .find(x => /\.intcc-m-hero\s*\{ order: 0; \}/.test(x)) || '';
      return /\.intcc-m-hero\s*\{ order: 0; \}/.test(b0)
        && /\.intcc-m-health\s*\{ order: 1; \}/.test(b0)
        && /\.intv12-qcard\s*\{ order: 2; \}/.test(b0); })(),
    JSON.stringify((css.match(/\.intcc-m-(hero|health)\s*\{ order: \d+; \}/g) || [])));
  ok('1.2 ESCRITORIO · la rejilla no se toca: Radar · Factores · Explora en su fila',
    /\.intcc-radar     \{ grid-column: 1 \/ 5;  grid-row: 2; \}/.test(css)
    && /\.intcc-drivers   \{ grid-column: 5 \/ 9;  grid-row: 2; \}/.test(css)
    && /\.intcc-explore   \{ grid-column: 9 \/ 13; grid-row: 2; \}/.test(css));
  ok('1.3 y no hay un segundo radar ni un nodo duplicado',
    (() => { const h = render(CUENTA_A).html;
      return count(h, /class="intcc-card intcc-radar/g) === 1
        && count(h, /<svg class="intcc-radar-svg/g) === 1; })(),
    String(count(render(CUENTA_A).html, /<svg class="intcc-radar-svg/g)));
  ok('11.24 ES y EN dibujan la MISMA geometría (la copy no mueve un punto)',
    (() => { const a = render(Object.assign({}, CUENTA_A, { lang: 'es' })).html;
      const b = render(Object.assign({}, CUENTA_A, { lang: 'en' })).html;
      const g = h => (h.match(/class="intcc-radar-dot[^"]*" cx="[\d.]+" cy="[\d.]+"/g) || []).join('|');
      return g(a) === g(b) && g(a).length > 0; })());
}

// ════════════════════════════════════════════════════════════════════════════
// §12 · FACTORES PRINCIPALES
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§12 · factores principales');
{
  const rA = render(CUENTA_A);
  const drv = section(rA.html, 'intcc-drivers');
  ok('12.1 un peso positivo pequeño NO se publica como 0 %',
    (() => { const pcts = attrs(drv, 'class="intcc-drv-pct"[^>]*>([^<]+)<');
      return pcts.length === 3 && pcts.indexOf('0%') === -1 && pcts.indexOf('&lt;1%') !== -1; })(),
    JSON.stringify(attrs(drv, 'class="intcc-drv-pct"[^>]*>([^<]+)<')));
  ok('12.2 un CERO real sí imprime 0 %',
    (() => { const c = makeCtx({});
      return run('_intccPctLabel(0)', c) === '0%' && run('_intccPctLabel(-0)', c) === '0%'; })());
  ok('12.3 y un dato ausente no se convierte en cero',
    (() => { const c = makeCtx({}); return run('_intccPctLabel(null)', c) === '—'
      && run('_intccPctLabel(NaN)', c) === '—'; })());
  ok('12.4 el peso crudo viaja para poder auditarlo',
    /data-pct-raw="0\.27\d*"/.test(drv), (drv.match(/data-pct-raw="[^"]*"/g) || []).join(','));
  ok('12.5 el orden es por exposición, de mayor a menor',
    (() => { const raw = attrs(drv, 'data-pct-raw="([\\d.]+)"').map(Number);
      return raw.length === 3 && raw[0] > raw[1] && raw[1] > raw[2]; })(),
    JSON.stringify(attrs(drv, 'data-pct-raw="([\\d.]+)"')));
  // ── LÍMITE DECLARADO, para que nadie lo «arregle» a medias ───────────────
  // `_aurixHealthSnapshot` publica `cashPct` con `Math.round`, así que el hecho
  // `cash_weight` del Core —y por tanto «Tu liquidez es el 0 % de tu cartera»—
  // puede decir 0 % sobre una liquidez real del 0,3 %. Es el MISMO defecto que
  // §12 corrige en Factores, pero su owner es el snapshot canónico, compartido con
  // el Dashboard, con Workspace y con `_aurixHealthScore` (que además tiene una
  // penalización atada a `cashPct === 0`). Corregirlo SÓLO en Intelligence crearía
  // la divergencia entre superficies que INT.01 existe para no repetir: dos
  // pantallas a un toque de distancia diciendo «<1 %» y «0 %» del mismo dinero.
  // Este assert FIJA la frontera: el hecho sigue leyendo el owner canónico y NO se
  // le pone una precisión propia. El día que se decida, se decide en el snapshot y
  // para todas las superficies a la vez.
  // ── EL REDONDEO ES DE RENDERIZADO, NO DEL OWNER ─────────────────────────
  // `_aurixHealthSnapshot` hacía `Math.round(cashEntry.pct)`, así que truncaba el
  // dato EN EL OWNER: el Dashboard decía «0 %», `_aurixHealthScore` aplicaba la
  // penalización de `cashPct === 0` —que existe para «no tienes NADA»— e
  // Intelligence heredaba la misma falsedad. Ahora el owner guarda el peso crudo y
  // las tres superficies redondean con la MISMA función.
  // UN solo contexto: crear uno por llamada compila ~200 funciones cada vez.
  const _pctCtx = makeCtx({});
  const PCTN = (v) => run('_aurixPctNum(' + JSON.stringify(v) + ')', _pctCtx);
  const PCTL = (v) => run('_aurixPctLabel(' + JSON.stringify(v) + ')', _pctCtx);
  ok('12.7 el formateador distingue los cuatro casos: 0 · sub-1 % · 1 % · >1 %',
    PCTL(0) === '0%' && PCTL(0.2494) === '<1%' && PCTL(1) === '1%' && PCTL(11.57) === '12%'
    && PCTN(0) === '0' && PCTN(0.2494) === '<1' && PCTN(1) === '1' && PCTN(11.57) === '12',
    JSON.stringify([PCTL(0), PCTL(0.2494), PCTL(1), PCTL(11.57)]));
  ok('12.7a …y un dato AUSENTE no se convierte en un cero real',
    PCTL(null) === '—' && PCTL(NaN) === '—' && PCTL(true) === '—'
    && PCTN(null) === null,
    JSON.stringify([PCTL(null), PCTL(NaN), PCTL(true)]));
  ok('12.7b el OWNER ya no redondea: el peso llega crudo a todos sus consumidores',
    /if \(cashEntry\)   out\.cashPct   = Number\(cashEntry\.pct\);/.test(app)
    && !/out\.cashPct   = Math\.round/.test(app));
  ok('12.7c el score distingue CERO REAL de un positivo por debajo del 1 %',
    (() => { const c = makeCtx({});
      const sc = (cash) => run('_aurixHealthScore(' + JSON.stringify({
        assetCount: 6, totUSD: 1e5, categoryCount: 4, cashPct: cash, cryptoPct: 10,
        realEstatePct: 0, topInvestedAsset: { name: 'A', type: 'etf', pctTotal: 22 },
        topCategory: { type: 'etf', pctTotal: 40 }, worstAsset: null, bestAsset: null }) + ')', c).score;
      // La penalización de «sin liquidez» son 5 puntos y sólo puede aplicarse al
      // cero REAL. Ni la fórmula ni el umbral cambian: cambia el dato de entrada.
      return sc(0) === sc(0.2494) - 5 && sc(0.2494) === sc(1) && sc(1) === sc(11.57); })(),
    JSON.stringify((() => { const c = makeCtx({});
      const sc = (cash) => run('_aurixHealthScore(' + JSON.stringify({
        assetCount: 6, totUSD: 1e5, categoryCount: 4, cashPct: cash, cryptoPct: 10,
        realEstatePct: 0, topInvestedAsset: { name: 'A', type: 'etf', pctTotal: 22 },
        topCategory: { type: 'etf', pctTotal: 40 }, worstAsset: null, bestAsset: null }) + ')', c).score;
      return { zero: sc(0), sub1: sc(0.2494), one: sc(1), over: sc(11.57) }; })()));
  ok('12.7d Dashboard e Intelligence usan LA MISMA función de formato',
    /function _intccPctLabel\(raw\) \{ return _aurixPctLabel\(raw\); \}/.test(app)
    && /valEl\('healthMetCash'\)\.textContent = _aurixPctLabel\(snap\.cashPct\);/.test(app)
    && /const liqValue = _aurixPctLabel\(cashPct\);/.test(app));
  ok('12.7e y sobre la MISMA cartera las tres superficies dicen lo mismo',
    (() => { const c = makeCtx(LIQ_SUB1);
      const radar = run('_intv7RadarAxes()', c).display.liquidity;
      const core0 = run('_aurixIntelligenceCore({})', c);
      const cw = ((core0.ledger.facts) || []).find(x => x.semanticKey === 'cash_weight');
      const txt = cw ? run('_intv4FactText(' + JSON.stringify(cw) + ')', c) : '';
      const dash = run('_aurixPctLabel(_aurixHealthSnapshot().cashPct)', c);
      return radar === '<1%' && dash === '<1%' && /el <1% de tu cartera financiera/.test(txt)
        && Number(cw.value) > 0 && Number(cw.value) < 1; })(),
    JSON.stringify((() => { const c = makeCtx(LIQ_SUB1);
      const core0 = run('_aurixIntelligenceCore({})', c);
      const cw = ((core0.ledger.facts) || []).find(x => x.semanticKey === 'cash_weight');
      return { radar: run('_intv7RadarAxes()', c).display.liquidity,
               dashboard: run('_aurixPctLabel(_aurixHealthSnapshot().cashPct)', c),
               fact: cw ? { value: cw.value, txt: run('_intv4FactText(' + JSON.stringify(cw) + ')', c) } : null }; })()));
  ok('12.7f un CERO REAL sigue diciendo 0 % en las tres',
    (() => { const h = render(CUENTA_A).html; const t0 = textOf(h);
      return /0%/.test(h) && /el 0% de tu cartera/.test(t0)
        && PCTL(0) === '0%'; })(),
    (textOf(render(CUENTA_A).html).match(/[^.]{0,40}liquidez es el[^.]{0,30}/i) || [''])[0]);
  ok('12.6 la sección habla de PATRIMONIO, no repite «invertible»',
    !/invertible/i.test(textOf(drv)) && !/investable/i.test(textOf(section(render(Object.assign({}, CUENTA_A, { lang: 'en' })).html, 'intcc-drivers'))),
    textOf(drv).slice(0, 160));
}

// ════════════════════════════════════════════════════════════════════════════
// §14 · LO QUE IMPORTA HOY
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§14 · lo que importa hoy');
{
  const CM = (v, lang, win) => run('_intv4FactText(' + JSON.stringify({
    semanticKey: 'recorded_capital_net', value: v.net || 0,
    values: Object.assign({ events: 1, amountPublishable: true }, v),
    window: win || { range: 'today', startAt: NOW2 - HOUR, endAt: NOW2 } }) + ')',
    makeCtx({ lang: lang || 'es' }));

  // ── EL VERBO ES «REGISTRAR», NO «AÑADIR» ─────────────────────────────────
  // §14 propone «Has añadido 10.869,57 US$ de liquidez», y la revisión financiera
  // demostró por qué no se puede: `_aurixCashLedgerAuthority` declara que un
  // `deposit` puede ser dinero nuevo O el REGISTRO de efectivo que ya tenías, y su
  // regla C5 fija el vocabulario — «registrado», NUNCA «aportado». «Añadir» es una
  // afirmación de INCREMENTO: es la lección A1/P0 («Has aportado X de capital
  // nuevo») con un verbo más suave. Se cumple lo que §14 pide de verdad —nombrar
  // SÓLO el lado que existe, sin el cero— con el verbo que el owner autoriza.
  ok('14.1 el LADO CERO no se publica, y el verbo no afirma dinero nuevo',
    (() => { const s = CM({ inUSD: 10869.57, outUSD: 0 });
      return /^Has registrado una entrada de liquidez de/.test(s)
        && !/0,00|salidas/.test(s) && !/añadid|aportad/i.test(s); })(),
    CM({ inUSD: 10869.57, outUSD: 0 }));
  ok('14.2 una salida se dice como salida, sin afirmar destino',
    (() => { const s = CM({ inUSD: 0, outUSD: -2000 });
      return /^Has registrado una salida de liquidez de/.test(s) && !/entrada/.test(s); })(),
    CM({ inUSD: 0, outUSD: -2000 }));
  ok('14.3 con los dos lados se nombran los dos, claramente',
    (() => { const s = CM({ inUSD: 10869.57, outUSD: -2000 });
      return /entradas de liquidez por/.test(s) && /salidas por/.test(s); })(),
    CM({ inUSD: 10869.57, outUSD: -2000 }));
  ok('14.3en …y en inglés el verbo también es «recorded»',
    (() => { const i = CM({ inUSD: 500, outUSD: 0 }, 'en'), o = CM({ inUSD: 0, outUSD: -500 }, 'en');
      return /^You recorded a cash inflow of/.test(i) && /^You recorded a cash outflow of/.test(o)
        && !/added|contributed/i.test(i + o); })(),
    JSON.stringify([CM({ inUSD: 500, outUSD: 0 }, 'en'), CM({ inUSD: 0, outUSD: -500 }, 'en')]));
  ok('14.4 el recuento sin cifra concuerda en número',
    (() => { const one = CM({ events: 1, amountPublishable: false });
      const two = CM({ events: 2, amountPublishable: false });
      return /1 movimiento de liquidez/.test(one) && /2 movimientos de liquidez/.test(two)
        && !/movimientos de liquidez/.test(one); })(), JSON.stringify([CM({ events: 1, amountPublishable: false }),
      CM({ events: 2, amountPublishable: false })]));
  ok('14.4en …y en inglés también',
    /1 cash movement$/.test(CM({ events: 1, amountPublishable: false }, 'en'))
    && /3 cash movements$/.test(CM({ events: 3, amountPublishable: false }, 'en')),
    JSON.stringify([CM({ events: 1, amountPublishable: false }, 'en')]));
  ok('14.5 una ventana ANCHA lleva su periodo DENTRO de la frase',
    (() => { const s = CM({ inUSD: 10869.57, outUSD: 0 }, 'es',
        { range: 'all', startAt: NOW2 - 40 * DAY, endAt: NOW2 });
      return /desde el/.test(s); })(),
    CM({ inUSD: 10869.57, outUSD: 0 }, 'es', { range: 'all', startAt: NOW2 - 40 * DAY, endAt: NOW2 }));
  ok('14.6 …y una ventana del día NO añade fecha (no se decora lo obvio)',
    !/desde el/.test(CM({ inUSD: 500, outUSD: 0 })));
  // La revisión financiera encontró que la rama DEGRADADA retornaba antes del
  // sufijo, y que el mismo diff le había quitado la línea «Ventana: …»: el saldo
  // era MENOS información temporal que antes, en el eje que §14 viene a arreglar.
  ok('14.6b la rama sin importe publicable TAMBIÉN lleva su periodo',
    (() => { const s0 = CM({ events: 1, amountPublishable: false }, 'es',
        { range: 'all', startAt: NOW2 - 40 * DAY, endAt: NOW2 });
      const s1 = CM({ events: 1, amountPublishable: false });
      return /1 movimiento de liquidez desde el/.test(s0) && !/desde el/.test(s1); })(),
    CM({ events: 1, amountPublishable: false }, 'es', { range: 'all', startAt: NOW2 - 40 * DAY, endAt: NOW2 }));
  ok('14.7 «VENTANA:» desaparece de la superficie: los metadatos no son copy',
    (() => { const h = render(CUENTA_B).html;
      // Lo prohibido es el METADATO como línea propia («VENTANA: TODO EL PERIODO
      // REGISTRADO»), no el periodo DENTRO de una frase: «tu rendimiento fue del
      // 17,34 % en todo el periodo registrado» es una frase completa y correcta, y
      // §14 pide exactamente eso («integrar el periodo dentro de la frase»).
      return !/intv4-story-meta/.test(h)
        && !/\bVentana:/i.test(textOf(h))
        && !/^\s*(VENTANA|WINDOW)\b/im.test(textOf(h)); })(),
    JSON.stringify({ meta: /intv4-story-meta/.test(render(CUENTA_B).html),
      ventana: (textOf(render(CUENTA_B).html).match(/[^.]{0,40}entana[^.]{0,40}/) || [''])[0],
      periodo: (textOf(render(CUENTA_B).html).match(/[^.]{0,40}PERIODO[^.]{0,40}/i) || [''])[0] }));
  // §4.4 RE-DECIDE LA FIXTURE, no la aserción. «Lo que importa hoy» deja de
  // publicar la rentabilidad de TODO EL PERIODO y la liquidez estática, y en la
  // cuenta B eso era justo lo que llenaba la card: ahora se encoge, que es lo
  // que el §4.4 pide («un vacío compacto» antes que inventar actualidad). La
  // ventana declarada se comprueba donde SIGUE habiendo una historia de hoy.
  // CHECKPOINT H — el hecho puede vivir en «hoy» o en «qué ha cambiado», pero
  // nunca en las dos. La ventana tiene que estar declarada allá donde caiga.
  ok('14.8 …pero la ventana sigue DECLARADA para la QA y el gate, caiga donde caiga',
    (() => { const h = render(CUENTA_C).html;
      const w = h.match(/data-window="([^"]*)"/g) || [];
      return w.length > 0 && w.some((x) => x !== 'data-window=""'); })(),
    (render(CUENTA_C).html.match(/data-window="[^"]*"/g) || []).join(','));
  ok('14.8b …y en una cuenta cuyo único contenido era un estado, la card se ENCOGE',
    (() => { const h = render(CUENTA_B).html;
      const m = section(h, 'intcc-watch');
      return !/class="intv4-story"/.test(m) && /data-items="0"/.test(m); })(),
    section(render(CUENTA_B).html, 'intcc-watch').slice(0, 260));
  ok('14.9 «No es un resultado», «no son rendimiento» y el resto de coletillas, fuera',
    (() => { const t0 = textOf(render(CUENTA_B).html);
      return !/no un resultado/i.test(t0) && !/no son rendimiento/i.test(t0)
        && !/Sobre datos de tu propia cartera/i.test(t0)
        && !/permite decidir sin vender/i.test(t0); })(),
    (textOf(render(CUENTA_B).html).match(/[^.]{0,50}no un resultado[^.]{0,30}/i) || [''])[0]);
  ok('14.10 lo que SÍ se conserva es la aclaración que evita una lectura falsa',
    /El importe es el coste de la operación, no su valoración actual\./ === undefined
      ? false : DICT.es.intv4_why_recorded_operation === 'El importe es el coste de la operación, no su valoración actual.');
  ok('14.11 una operación de HOY se ordena por encima de un movimiento de liquidez antiguo',
    (() => { const c = makeCtx({});
      const today = run('_intv5RecencyTier(' + JSON.stringify({ window: { range: 'today' }, values: {} }) + ')', c);
      const old = run('_intv5RecencyTier(' + JSON.stringify({ window: { range: 'all' }, values: {} }) + ')', c);
      return today < old; })());
  ok('14.12 si no hay actualidad certificable no se recicla historia para llenar',
    (() => { const h = render(EVEN_NO_HISTORY).html;
      const m = section(h, 'intv5-matters');
      const items = Number(num(m, /data-items="(\d+)"/));
      return Number.isFinite(items) && items <= 3; })(),
    num(section(render(EVEN_NO_HISTORY).html, 'intv5-matters'), /data-items="(\d+)"/));
}

// ════════════════════════════════════════════════════════════════════════════
// §15 · MEMORIA PATRIMONIAL
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§15 · memoria patrimonial');
{
  const DECL = (fields) => { const c = makeCtx({});
    return run('_intv4MemoryDeclared(' + JSON.stringify({ context: { fields: fields } }) + ', [])', c); };
  const ua = (v, at) => ({ value: v, provenance: 'user_answer', answeredAt: at || 1000 });

  ok('15.1 una PREGUNTA PENDIENTE no es un recuerdo: `undecided` no publica fila',
    DECL({ primary_goal: ua('undecided') }).length === 0,
    JSON.stringify(DECL({ primary_goal: ua('undecided') })));
  ok('15.2 y la frase «Todavía no has decidido tu prioridad» no existe en el diccionario',
    DICT.es.intv9_mem_goal_undecided === undefined && DICT.en.intv9_mem_goal_undecided === undefined);
  ok('15.3 una prioridad DECLARADA sí crea un recuerdo fechado',
    (() => { const r = DECL({ primary_goal: ua('grow', 12345) });
      return r.length === 1 && r[0].at === 12345 && /hacerlo crecer/i.test(r[0].txt); })(),
    JSON.stringify(DECL({ primary_goal: ua('grow', 12345) })));
  ok('15.4 …y cambiarla registra el valor nuevo sin reescribir la historia anterior',
    (() => { const r = DECL({ primary_goal: ua('preserve', 999) });
      return r.length === 1 && /preservar/i.test(r[0].txt); })());
  ok('15.5 la concentración declarada se reformula sin la palabra «deliberada»',
    (() => { const r = DECL({ concentration_intent: ua('deliberate') });
      return r.length === 1 && !/deliberada/i.test(r[0].txt)
        && /decisión propia/i.test(r[0].txt); })(), JSON.stringify(DECL({ concentration_intent: ua('deliberate') })));
  ok('15.6 la liquidez no registrada es un recuerdo legítimo en los dos idiomas',
    DECL({ unregistered_liquidity: ua('yes') }).length === 1
    && !!DICT.en.intv9_mem_unregistered_liquidity_yes);
  ok('15.7 un valor INFERIDO o por defecto nunca se presenta como recuerdo',
    DECL({ primary_goal: { value: 'grow', provenance: 'inferred', answeredAt: 1 } }).length === 0);
  ok('15.8 el scroll interior sólo aparece cuando el contenido DESBORDA de verdad',
    /\.intv10-mem-scroll \{ overflow-x: hidden/.test(css)
    && /\.intv4-memory\[data-scroll="1"\] \.intv10-mem-scroll \{ max-height: 268px; overflow-y: auto; \}/.test(css)
    // «No hay techo incondicional» se comprueba por LÍNEA, no con un negativo
    // suelto: el selector largo contiene el corto, así que un `!test` global daba
    // falso positivo sobre la propia regla condicional.
    && css.split('\n').filter(l => /\.intv10-mem-scroll/.test(l) && /max-height/.test(l))
        .every(l => /data-scroll="1"/.test(l) || /max-height: none/.test(l)),
    JSON.stringify(css.split('\n').filter(l => /\.intv10-mem-scroll/.test(l) && /max-height/.test(l))));
  ok('15.9 la card declara cuántos recuerdos hay y si va a recortar',
    /data-rows="\$\{rows\.length\}"/.test(fnSrc('_intv4MemoryHtml'))
    && /data-scroll="\$\{rows\.length > 4 \? '1' : '0'\}"/.test(fnSrc('_intv4MemoryHtml')));
  // CHECKPOINT G — la fila publica ahora FECHA · PERIODO. El invariante no es
  // el literal de la plantilla: es que sin fecha no se estampa una, y que el
  // periodo sólo se imprime si el hecho lo nombra.
  ok('15.10 no se estampa la fecha de hoy sobre historia antigua',
    (() => { const src0 = fnSrc('_intv4MemoryHtml');
      return /\(r\.at \|\| r\.period\) \? `<span class="intcc-tl-date">/.test(src0)
        && /r\.at \? _intccDate\(r\.at\) : ''/.test(src0)
        && /r\.period \? _intv4RangeLabel\(r\.period\) : ''/.test(src0); })());
  ok('15.11 el PERIODO es visible, no sólo un data-attribute',
    (() => { const h = render(CUENTA_B).html;
      const rows = h.match(/<li class="intcc-tl-item"[^>]*data-period="([^"]+)"[\s\S]*?<\/li>/g) || [];
      return rows.length === 0 || rows.every((r) => /class="intcc-tl-date"/.test(r)); })());
}

// ════════════════════════════════════════════════════════════════════════════
// §17 · LO QUE AURIX HA VISTO
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§17 · lo que Aurix ha visto');
{
  ok('17.1 la salida genérica «esta lectura sigue igual tras N observaciones» NO EXISTE',
    DICT.es.intel_d_persisting === undefined && DICT.en.intel_d_persisting === undefined
    && !/reading_persists_across_observations/.test(fnSrc('_intelDiscoveryText')));
  ok('17.2 …y su descubrimiento ya no se emite',
    !/disc_persisting_/.test(fnSrc('_aurixIntelDiscoveries')));
  ok('17.3 pero la SEÑAL sigue viva donde hace falta: prioridad y coherencia del hero',
    /persisting: seen\.filter/.test(fnSrc('_aurixIntelMemory'))
    && /memory\.persisting/.test(fnSrc('_intv5Reading')));
  ok('17.4 «Sobre datos de tu propia cartera» se retira; la evidencia queda declarada',
    DICT.es.intv9_disc_evidence === undefined
    && /data-evidence="/.test(fnSrc('_intv9DiscoveriesHtml'))
    && !/intv9-disc-ev/.test(fnSrc('_intv9DiscoveriesHtml')));
  ok('17.5 abrir la página no puede contar como una observación publicable',
    (() => { const h = render(CUENTA_B).html;
      return !/observacion/i.test(textOf(h)) && !/observation/i.test(textOf(render(Object.assign({}, CUENTA_B, { lang: 'en' })).html)); })(),
    (textOf(render(CUENTA_B).html).match(/[^.]{0,40}observ[^.]{0,40}/i) || [''])[0]);
  ok('17.6 sin patrón útil la sección no se renderiza ni deja placeholder',
    (() => { const c = makeCtx({});
      return run('_intv9DiscoveriesHtml({ discoveries: [] }, s => s, [], [])', c) === ''; })());
}

// ════════════════════════════════════════════════════════════════════════════
// §19 · REACTIVIDAD Y COSTE
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§19 · reactividad · un solo recorrido del Core');
{
  ok('19.1 el motor RECIBE el Core del renderer: un recorrido del ledger por pintura',
    /core: core,/.test(fnSrc('_renderIntelligenceCommandCenter'))
    && /o\.core && typeof o\.core === 'object'/.test(fnSrc('_aurixIntel'))
    && /Object\.assign\(\{\}, o, \{ core \}\)/.test(fnSrc('_aurixIntel')));
  ok('19.2 y el Core que ve el motor es el MISMO que el de la superficie (mismos acuses y pausa)',
    (() => { const f = bareOf(fnSrc('_renderIntelligenceCommandCenter'));
      const iCore = f.indexOf('acknowledged: _ackMap'), iIntel = f.indexOf('core: core,');
      return iCore >= 0 && iIntel > iCore; })());
  ok('19.3 no se añade polling ni ningún temporizador nuevo',
    !/setInterval/.test(fnSrc('_renderIntelligenceCommandCenter'))
    && !/setInterval/.test(fnSrc('_aurixIntel')));
  ok('19.4 la operación guardada llega a la superficie en la pintura siguiente',
    (() => { const h = render(CUENTA_A).html;
      // La compra de Solana de hoy tiene procedencia conocida ⇒ se puede afirmar el día.
      return /Solana/.test(textOf(h)); })(),
    (textOf(render(CUENTA_A).html).match(/[^.]{0,80}Solana[^.]{0,40}/) || [''])[0]);
  ok('19.5 el mismo estado renderiza el MISMO HTML (determinista, sin dobles eventos)',
    render(CUENTA_A).html === render(CUENTA_A).html);
}

// ════════════════════════════════════════════════════════════════════════════
// §20 · LENGUAJE DE PRODUCTO · ES/EN
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§20 · lenguaje de producto');
{
  const BANNED_ES = [/\bdeliberada\b/i, /\bmaterial(es)?\b/i, /esta lectura/i,
    /sobre datos de tu propia cartera/i, /no un resultado/i, /VENTANA:/i];
  const BANNED_EN = [/\bdeliberate\b/i, /\bmaterial\b/i, /this reading/i,
    /from your own portfolio data/i, /not a result/i, /Window:/i];
  [['es', BANNED_ES], ['en', BANNED_EN]].forEach(([lang, banned]) => {
    [CUENTA_A, CUENTA_B].forEach((fx, i) => {
      const t0 = textOf(render(Object.assign({}, fx, { lang: lang })).html);
      ok('20.' + lang + (i + 1) + ' ninguna expresión prohibida en la superficie visible',
        banned.every(re => !re.test(t0)),
        JSON.stringify(banned.filter(re => re.test(t0)).map(String)));
    });
  });
  ok('20.3 «invertible» no se repite: el perímetro lo traduce a lenguaje de producto',
    (() => { const t0 = textOf(render(CUENTA_B).html);
      return (t0.match(/invertible/gi) || []).length === 0; })(),
    (textOf(render(CUENTA_B).html).match(/[^.]{0,40}invertible[^.]{0,40}/i) || [''])[0]);
  ok('20.4 ES y EN publican la MISMA semántica financiera (mismos estados y cifras)',
    (() => { const a = render(Object.assign({}, CUENTA_B, { lang: 'es' })).html;
      const b = render(Object.assign({}, CUENTA_B, { lang: 'en' })).html;
      const sig = h => JSON.stringify({
        health: num(h, /data-health-state="([^"]*)"/),
        state: num(h, /data-intel-state="([^"]*)"/),
        pending: num(h, /data-review-pending="(\d+)"/),
        score: num(h, /class="intcc-score-val">([^<]*)</),
        axes: num(h, /data-measured="(\d+)"/) });
      return sig(a) === sig(b); })(),
    JSON.stringify([num(render(Object.assign({}, CUENTA_B, { lang: 'es' })).html, /class="intcc-score-val">([^<]*)</),
                    num(render(Object.assign({}, CUENTA_B, { lang: 'en' })).html, /class="intcc-score-val">([^<]*)</)]));
  // ── EL PERÍMETRO NO SE PUEDE PERDER, Y ESTE ASSERT LO FOSILIZABA ─────────
  // Mi primera versión mapeaba «Tu rendimiento invertible fue» → «Tu rendimiento
  // fue», y la revisión financiera lo declaró CRÍTICO: el denominador de esa cifra
  // EXCLUYE el inmueble por contrato (INT.02), así que para un usuario con un piso
  // registrado «Tu rendimiento fue del +8,4 %» afirma el rendimiento de TODO su
  // patrimonio. Y el assert no podía verlo porque todas sus fixtures tienen
  // `realEstatePct: 0` — fosilizaba como contrato justo el caso que no ejercita,
  // que es la lección repetida de este proyecto. §16 da la salida explícita: «si es
  // necesario preservar el perímetro: El rendimiento de tu cartera financiera fue…».
  ok('20.5 el rendimiento retira el adjetivo INTERNO pero conserva el PERÍMETRO',
    (() => { const es = run("_intv4T('intv4_f_return', '-2,58', 'las últimas 24 h')", makeCtx({ lang: 'es' }));
      const en = run("_intv4T('intv4_f_return', '-2.58', 'the last 24h')", makeCtx({ lang: 'en' }));
      return !/invertible/.test(es) && !/investable/.test(en)
        && /cartera financiera/.test(es) && /financial portfolio/.test(en)
        && !/^Tu rendimiento fue/.test(es) && !/^Your return was/.test(en); })(),
    JSON.stringify([run("_intv4T('intv4_f_return', '-2,58', 'las últimas 24 h')", makeCtx({ lang: 'es' })),
                    run("_intv4T('intv4_f_return', '-2.58', 'the last 24h')", makeCtx({ lang: 'en' }))]));
  // Y el caso que faltaba: una cuenta CON inmueble registrado. Ninguna frase puede
  // hablar de «tu rendimiento» a secas sobre una cifra que excluye el piso.
  ok('20.5b con un inmueble registrado la frase sigue acotando el perímetro',
    (() => { const withRE = Object.assign({}, CUENTA_B, {
        assets: B_ASSETS.concat([{ id: 'flat', name: 'Piso', type: 'real_estate', qty: 1, price: 320000 }]),
        snap: Object.assign({}, B_SNAP, { realEstatePct: 77 }) });
      const t0 = textOf(render(withRE).html);
      return !/[Tt]u rendimiento fue del/.test(t0)
        && !/rendimiento de tu patrimonio/i.test(t0); })(),
    (textOf(render(Object.assign({}, CUENTA_B, {
      assets: B_ASSETS.concat([{ id: 'flat', name: 'Piso', type: 'real_estate', qty: 1, price: 320000 }]),
      snap: Object.assign({}, B_SNAP, { realEstatePct: 77 }) })).html)
      .match(/[^.]{0,60}rendimiento[^.]{0,40}/i) || [''])[0]);
}

// ════════════════════════════════════════════════════════════════════════════
// §18 · RESPONSABILIDAD · NADA SE REPITE LITERALMENTE
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§18 · cada sección hace su trabajo');
{
  [['A', CUENTA_A], ['B', CUENTA_B]].forEach(([name, fx]) => {
    const h = render(fx).html;
    const sentences = (h.match(/class="(?:intv4-story-head|intv4-chg-text|intv9-disc-text|intv4-mem-what|intcc-hero-title|intcc-hero-sub)">([^<]+)</g) || [])
      .map(s => s.replace(/^[^>]*>/, '').trim()).filter(s => s.length > 12);
    const dupes = sentences.filter((s, i) => sentences.indexOf(s) !== i);
    ok('18.' + name + ' ninguna frase se publica literalmente en dos superficies',
      dupes.length === 0, JSON.stringify(dupes));
  });
  ok('18.3 sin cambio material no se emite superficie de cambios (ni card ni línea)',
    (() => { const h = render(EVEN_NO_HISTORY).html;
      return /data-changed-state="/.test(h)
        && (!/intv4-changed/.test(h) || /data-findings="[1-9]/.test(h)); })(),
    num(render(EVEN_NO_HISTORY).html, /data-changed-state="([^"]*)"/));
}


// ════════════════════════════════════════════════════════════════════════════
// SUPREME CLOSURE · §4.1–§4.7 + CHECKPOINT B
// ════════════════════════════════════════════════════════════════════════════
// Lo que este SPEC decide POR ENCIMA del cierre anterior. Se añade a este fichero
// y no a uno nuevo a propósito: es la MISMA superficie, con la misma maquinaria
// y las mismas cuentas de referencia, y CLAUDE.md §6 pide no multiplicar gates
// que validan esencialmente lo mismo.
console.log('\nSC · §4.1 · la respuesta más reciente sustituye a la anterior');
{
  const ctxOf = (fields) => { const c = makeCtx({});
    run('_aurixActiveUserId = "sc-user"', c);
    run('_aurixIntelWriteOwned(_AURIX_INTEL_CTX_KEY, ' + JSON.stringify({ fields }) + ', {})', c);
    return run('_aurixIntelContext({})', c); };
  const COMPLETE_OLD = { wealth_coverage: { value: 'complete', provenance: 'user_answer', answeredAt: 1000 },
    unregistered_liquidity: { value: 'yes', provenance: 'user_answer', answeredAt: 9000 } };
  const COMPLETE_NEW = { wealth_coverage: { value: 'complete', provenance: 'user_answer', answeredAt: 9000 },
    unregistered_liquidity: { value: 'yes', provenance: 'user_answer', answeredAt: 1000 } };
  ok('SC.1.1 «tengo liquidez sin registrar» invalida «todo está registrado» como estado ACTUAL',
    (() => { const c = ctxOf(COMPLETE_OLD);
      return c.fields.wealth_coverage.superseded === true
        && c.fields.wealth_coverage.supersededBy === 'unregistered_liquidity'
        && c.fields.unregistered_liquidity.superseded !== true; })(),
    JSON.stringify(ctxOf(COMPLETE_OLD).fields));
  ok('SC.1.2 …y la regla es SIMÉTRICA: manda la más reciente, no un campo concreto',
    (() => { const c = ctxOf(COMPLETE_NEW);
      return c.fields.unregistered_liquidity.superseded === true
        && c.fields.wealth_coverage.superseded !== true; })());
  ok('SC.1.3 la anterior se CONSERVA como historial, no se borra',
    (() => { const c = ctxOf(COMPLETE_OLD);
      return c.fields.wealth_coverage.value === 'complete'
        && Number(c.fields.wealth_coverage.answeredAt) === 1000
        && c.answered === 2; })());
  ok('SC.1.4 un par NO contradictorio no supersede nada',
    (() => { const c = ctxOf({ wealth_coverage: { value: 'complete', provenance: 'user_answer', answeredAt: 1000 },
        unregistered_liquidity: { value: 'no', provenance: 'user_answer', answeredAt: 9000 } });
      return c.fields.wealth_coverage.superseded !== true
        && c.fields.unregistered_liquidity.superseded !== true; })());
  ok('SC.1.5 sin fecha NO se supersede: se falla hacia CONSERVAR, nunca hacia ocultar',
    (() => { const c = ctxOf({ wealth_coverage: { value: 'complete', provenance: 'user_answer' },
        unregistered_liquidity: { value: 'yes', provenance: 'user_answer', answeredAt: 9000 } });
      return c.fields.wealth_coverage.superseded !== true; })());
  ok('SC.1.6 el sello VIAJA al modelo que consumen las superficies',
    /superseded: ctx\.fields\[k\]\.superseded === true/.test(fnSrc('_aurixIntel')));
}

console.log('\nSC · §4.2 · confirmar liquidez fuera de Aurix abre una puerta');
{
  const withCtx = (fields, ack) => { const o = Object.assign({}, CUENTA_B);
    const c = makeCtx(o);
    run('_aurixActiveUserId = "sc-liq"', c);
    run('_aurixIntelWriteOwned(_AURIX_INTEL_CTX_KEY, ' + JSON.stringify({ fields, ack: ack || {} }) + ', {})', c);
    return run('_renderIntelligenceCommandCenter()', c); };
  const YES = { unregistered_liquidity: { value: 'yes', provenance: 'user_answer', answeredAt: NOW2 - DAY } };
  const NO  = { unregistered_liquidity: { value: 'no',  provenance: 'user_answer', answeredAt: NOW2 - DAY } };
  const hYes = withCtx(YES);
  ok('SC.2.1 al confirmar liquidez fuera de Aurix aparece la puerta, con sus dos controles',
    /data-liq-cta="1"/.test(hYes)
    && /data-liq-cta-act="add"/.test(hYes) && /data-liq-cta-act="later"/.test(hYes)
    && hYes.indexOf(DICT.es.intel_liq_cta_add) !== -1
    && hYes.indexOf(DICT.es.intel_liq_cta_later) !== -1,
    (hYes.match(/data-liq-cta="[^"]*"/g) || []).join(','));
  ok('SC.2.2 responder que NO tiene liquidez sin registrar no abre ninguna puerta',
    !/data-liq-cta="1"/.test(withCtx(NO)));
  ok('SC.2.3 «Ahora no» la cierra, y el acuse viaja con el resto del contexto',
    !/data-liq-cta="1"/.test(withCtx(YES,
      { 'ctx:unregistered_liquidity': { at: NOW2, state: 'acknowledged', episodeId: 'ctx:unregistered_liquidity' } })));
  ok('SC.2.4 §4.1 manda también aquí: una respuesta superseded no abre la puerta',
    !/data-liq-cta="1"/.test(withCtx({
      unregistered_liquidity: { value: 'yes', provenance: 'user_answer', answeredAt: 1000 },
      wealth_coverage: { value: 'complete', provenance: 'user_answer', answeredAt: 9000 } })));
  ok('SC.2.5 NO se inventa importe ni se registra nada: sólo se abre el formulario existente',
    (() => { const f = fnSrc('_initIntelligenceCommandCenter');
      return /openLiquidityModal\(\)/.test(f)
        && !/amountUSD/.test(f) && !/_aurixRecordFlow|addLiquidity\(/.test(f); })());
  ok('SC.2.6 la pregunta NO se repite aunque todavía no haya añadido la liquidez',
    (() => { const q = fnSrc('_aurixIntelQuestions');
      return /!known\.unregistered_liquidity/.test(q); })());
}

console.log('\nSC · §4.3 · una pregunta sólo existe si su respuesta existe');
{
  const cat = konstSrc('_AURIX_QUESTION_CATALOG');
  // LA REVISIÓN FINANCIERA RE-DECIDIÓ ESTA. Endurecer la puerta arreglaba la
  // mitad equivocada: el §4.3 exige separar CUATRO cosas y Aurix sólo conoce dos
  // (el ledger de capital contiene únicamente movimientos de LIQUIDEZ; la
  // rotación interna no deja rastro). Con la puerta dura, la respuesta seguía
  // siendo dos párrafos que el usuario tenía que restar de cabeza. La pregunta
  // sale del catálogo y su copy se va con ella: una clave sin consumidor es una
  // promesa olvidada esperando a que alguien la vuelva a cablear.
  ok('SC.3.1 la pregunta por el origen del crecimiento NO se hace: Aurix no puede separarlo',
    !/q_capital_flows/.test(app)
    && DICT.es.intv4_q_q_capital_flows === undefined
    && DICT.en.intv4_q_q_capital_flows === undefined);
  ok('SC.3.2 «frente a su propia historia» exige una comparación histórica certificada',
    /q_historical[\s\S]{0,420}requiresAny: \['investable_all_time_high', 'investable_prior_high', 'investable_level_change'\]/.test(cat));
  ok('SC.3.3 existe la pregunta del caso «sólo conozco el valor actual»',
    /q_current_value/.test(cat)
    && typeof DICT.es.intv4_q_q_current_value === 'string'
    && typeof DICT.en.intv4_q_q_current_value === 'string');
  ok('SC.3.4 …y NUNCA convive con la histórica: comparten raíz causal',
    (() => { const hist = /id: 'q_historical'[\s\S]{0,120}causalRoot: ([A-Z_.]+)/.exec(cat);
      const curr = /id: 'q_current_value'[\s\S]{0,120}causalRoot: ([A-Z_.]+)/.exec(cat);
      return !!hist && !!curr && hist[1] === curr[1]; })());
  ok('SC.3.5 …y cede el sitio en cuanto hay una comparación real que ofrecer',
    (() => { const hist = /id: 'q_historical'[\s\S]{0,400}?interest: ([\d.]+)/.exec(cat);
      const curr = /id: 'q_current_value'[\s\S]{0,400}?interest: ([\d.]+)/.exec(cat);
      return !!hist && !!curr && Number(curr[1]) < Number(hist[1]); })());
  // EJECUTADO, no leído: un catálogo declarativo puede estar bien escrito y su
  // puerta no aplicarse. Se corre el owner con un ledger que tiene el nivel y
  // NADA más, que es el caso que el §4.3 nombra.
  ok('SC.3.6 con SÓLO el nivel: nada de historia, y la pregunta publicada es la del valor actual',
    (() => { const c = makeCtx({});
      const ledger = { facts: [{ semanticKey: 'investable_level', family: 'wealth_level',
        causalRoot: 'wealth_level', priority: 0.5, value: 1000 }], gaps: [] };
      const q = run('_aurixContextualQuestions(' + JSON.stringify(ledger) + ', {})', c);
      const ids = q.selected.map(x => x.id);
      return ids.indexOf('q_current_value') !== -1 && ids.indexOf('q_historical') === -1; })(),
    JSON.stringify((() => { const c = makeCtx({});
      const ledger = { facts: [{ semanticKey: 'investable_level', family: 'wealth_level',
        causalRoot: 'wealth_level', priority: 0.5, value: 1000 }], gaps: [] };
      return run('_aurixContextualQuestions(' + JSON.stringify(ledger) + ', {})', c).selected.map(x => x.id); })()));
  ok('SC.3.7 con máximo registrado SÍ se puede preguntar por la historia, y desplaza a la otra',
    (() => { const c = makeCtx({});
      const ledger = { facts: [
        { semanticKey: 'investable_level', family: 'wealth_level', causalRoot: 'wealth_level', priority: 0.5, value: 1000 },
        { semanticKey: 'investable_all_time_high', family: 'wealth_level', causalRoot: 'wealth_level', priority: 0.6, value: 1200 }], gaps: [] };
      const ids = run('_aurixContextualQuestions(' + JSON.stringify(ledger) + ', {})', c).selected.map(x => x.id);
      return ids.indexOf('q_historical') !== -1 && ids.indexOf('q_current_value') === -1; })());
  ok('SC.3.8 …ni siquiera con capital registrado Y rendimiento certificado a la vez',
    (() => { const c = makeCtx({});
      const withBoth = run('_aurixContextualQuestions(' + JSON.stringify({ facts: [
        { semanticKey: 'recorded_capital_net', family: 'capital_flow',
          causalRoot: 'external_capital', priority: 0.7, value: 500 },
        { semanticKey: 'investable_return_all', family: 'performance', causalRoot: 'investable_return',
          priority: 0.9, value: 4.2 }], gaps: [] }) + ', {})', c);
      return withBoth.selected.every(x => x.id !== 'q_capital_flows'); })());
  // `requiresAny` sigue vivo y sigue siendo necesario: lo usa la pregunta
  // histórica. Se ejerce que la puerta por PREFIJO funciona de verdad.
  ok('SC.3.9 la puerta `requiresAny` acepta claves por PREFIJO de familia',
    /const findAny = keys =>/.test(fnSrc('_aurixContextualQuestions'))
    && /\/_\$\/\.test\(k\)/.test(fnSrc('_aurixContextualQuestions')));
}

console.log('\nSC · §4.4 · «lo que importa hoy» no cambia al refrescar');
{
  ok('SC.4.1 la novedad se mide en DÍAS COMPLETOS, no en milisegundos',
    /const ageDays = Math\.floor\(age \/ 864e5\);/.test(fnSrc('_aurixFactLedger'))
    && /_aurixFactClamp01\(\(ageDays \* 864e5\) \/ _AURIX_NOVELTY_WINDOW_MS\)/.test(fnSrc('_aurixFactLedger')));
  ok('SC.4.2 …y la marca de presentación se sella al DÍA, no al instante',
    /const dayStamp = Math\.floor\(now \/ 864e5\) \* 864e5;/.test(fnSrc('_intv4RecordShown'))
    && /shownAt: dayStamp/.test(fnSrc('_intv4RecordShown')));
  ok('SC.4.3 EJECUTADO: dos pinturas seguidas de la misma jornada publican lo MISMO',
    (() => { const c = makeCtx(CUENTA_B);
      run('_aurixActiveUserId = "sc-stable"', c);
      const h1 = run('_renderIntelligenceCommandCenter()', c);
      const h2 = run('_renderIntelligenceCommandCenter()', c);
      const h3 = run('_renderIntelligenceCommandCenter()', c);
      const facts = h => (h.match(/class="intv4-story"[^>]*data-fact="([^"]*)"/g) || []).join(',');
      return facts(h1) === facts(h2) && facts(h2) === facts(h3); })(),
    (() => { const c = makeCtx(CUENTA_B); run('_aurixActiveUserId = "sc-stable"', c);
      const a = run('_renderIntelligenceCommandCenter()', c), b = run('_renderIntelligenceCommandCenter()', c);
      return JSON.stringify([(a.match(/data-fact="([^"]*)"/g) || []).slice(0, 4),
                             (b.match(/data-fact="([^"]*)"/g) || []).slice(0, 4)]); })());
  ok('SC.4.4 y sigue habiendo un techo de tres hechos',
    (() => { const ks = konstSrc('_INTV4_BRIEF_MAX'); return /= 3;/.test(ks); })());
}

console.log('\nSC · §4.5 · «Tu evolución» publica hechos, no respuestas');
{
  ok('SC.5.1 la card se llama «Tu evolución» en los dos idiomas',
    DICT.es.intv4_memory_title === 'Tu evolución' && DICT.en.intv4_memory_title === 'Your evolution');
  // CHECKPOINT G — «entre uno y cuatro hechos». El techo sube a cuatro y la
  // selección reserva como mucho uno por ventana, que es lo que convierte la
  // card en evolución y no en cuatro formas de decir la misma semana.
  ok('SC.5.2 el techo son CUATRO hechos históricos certificados',
    /const _INTV4_MEMORY_MAX = 4;/.test(app));
  const _divCtx = makeCtx(CUENTA_B);
  const _div = (rows, n) => run('_intv4MemoryDiversify(' + JSON.stringify(rows) + ', ' + n + ')', _divCtx);
  ok('SC.5.2b …y no pueden salir todos de la MISMA ventana',
    (() => { const mk = (w, k) => ({ kind: 'event', at: 1, key: k, txt: k, period: w });
      const rows = _div([mk('7d','a'), mk('7d','b'), mk('7d','c'), mk('30d','d'), mk('1y','e')], 4);
      const ws = rows.map((r) => r.period);
      return rows.length === 4 && new Set(ws.slice(0, 3)).size === 3
        && ws.indexOf('7d') < ws.indexOf('30d') && ws.indexOf('30d') < ws.indexOf('1y'); })(),
    JSON.stringify(_div([{kind:'event',at:1,key:'a',period:'7d'},{kind:'event',at:1,key:'b',period:'7d'},
       {kind:'event',at:1,key:'c',period:'7d'},{kind:'event',at:1,key:'d',period:'30d'},
       {kind:'event',at:1,key:'e',period:'1y'}], 4).map((r) => r.period)));
  ok('SC.5.2c una ventana que el catálogo no nombra no se pierde',
    (() => { const rows = _div([{ kind: 'event', at: 1, key: 'x', period: 'raro' }], 4);
      return rows.length === 1 && rows[0].period === 'raro'; })());
  ok('SC.5.3 ninguna respuesta declarada se publica como fila',
    !/_intv4MemoryDeclared/.test(fnSrc('_intv4MemoryRows'))
    && !/kind: 'declared'/.test(fnSrc('_intv4MemoryRows')));
  ok('SC.5.4 …y en la pintura real, con contexto declarado, la lista es SÓLO de hechos',
    (() => { const c = makeCtx(CUENTA_B);
      run('_aurixActiveUserId = "sc-mem"', c);
      run('_aurixIntelWriteOwned(_AURIX_INTEL_CTX_KEY, ' + JSON.stringify({ fields: {
        primary_goal: { value: 'grow', provenance: 'user_answer', answeredAt: NOW2 - DAY },
        horizon: { value: 'long', provenance: 'user_answer', answeredAt: NOW2 - 2 * DAY },
      } }) + ', {})', c);
      const h = run('_renderIntelligenceCommandCenter()', c);
      const m = section(h, 'intcc-timeline');
      return !/is-declared/.test(m) && !/data-declared-field/.test(m)
        && m.indexOf(DICT.es.intv9_mem_goal_grow) === -1; })(),
    section(render(CUENTA_B).html, 'intcc-timeline').slice(0, 300));
  ok('SC.5.5 pero lo DECLARADO no se pierde: se conserva y se declara su recuento',
    /data-declared="\$\{declared\.length\}"/.test(fnSrc('_intv4MemoryHtml'))
    && typeof run('_intv4MemoryDeclared', makeCtx({})) === 'function');
  ok('SC.5.6 cada fila declara su PERIODO y su COBERTURA',
    /data-period="\$\{esc\(r\.period \|\| ''\)\}" data-coverage="\$\{esc\(r\.coverage \|\| ''\)\}"/.test(fnSrc('_intv4MemoryHtml')));
  ok('SC.5.7 el estado vacío es COMPACTO y dice una sola frase',
    (() => { const h = render(YOUNG).html;
      return /data-compact="1"/.test(h) && !/intv6-accrue-node/.test(h)
        && h.indexOf(DICT.es.intv4_memory_empty) !== -1; })(),
    section(render(YOUNG).html, 'intcc-timeline').slice(0, 260));
  ok('SC.5.8 …y esa frase es la que el §4.5 dicta, en los dos idiomas',
    /^Aún no hay historial suficiente/.test(DICT.es.intv4_memory_empty)
    && /^There is not enough history yet/.test(DICT.en.intv4_memory_empty));
  // VARIEDAD TEMPORAL — el owner aprende los periodos largos y los publica SÓLO
  // cuando existen. Se ejerce el owner REAL, no su declaración.
  ok('SC.5.9 la variedad temporal está DETENIDA: el ledger no pide periodos largos',
    /perfRanges[\s\S]{0,2200}\['24h', '7d', '30d', 'all'\]/.test(fnSrc('_aurixFactLedger')));
  // LA REVISIÓN FINANCIERA DEJÓ FUERA 2 Y 5 AÑOS, y el gate lo fija: la
  // tolerancia de cobertura es PROPORCIONAL (20 %), así que en 5 años admitiría
  // llamar «los últimos 5 años» a una medición de cuatro. Hasta 180d el margen
  // absoluto (36 días) es MENOR que el que 1A ya concede (73), así que no se
  // relaja nada que el producto no tolerase ya.
  // NINGÚN UMBRAL FINANCIERO SE MUEVE, y esto es lo que lo demuestra: al detener
  // la variedad temporal, las dos tablas que el intento había tocado vuelven
  // EXACTAMENTE a sus valores certificados.
  ok('SC.5.9b la parada devuelve los umbrales de comparabilidad a sus valores certificados',
    (() => { const c = makeCtx({});
      const R = run('_AURIX_RETURN_COMPARABLE_RATIO', c);
      return JSON.stringify(R) === JSON.stringify({ '24h': 1.20, '7d': 1.35, '30d': 1.75, '1y': 3.00, 'all': 3.00 }); })(),
    JSON.stringify(run('_AURIX_RETURN_COMPARABLE_RATIO', makeCtx({}))));
  // LAS TRES TABLAS DE RANGO DICEN LO MISMO. Sincronizar sólo dos no cerraba la
  // trampa, la cambiaba de forma: un llamador de '90d' pasaría de recibir 30
  // días con cobertura FALSA a recibir 90 días sin guardia de retención, que es
  // la forma exacta del residual de 'all'.
  ok('SC.5.9c el guardia de retención conoce los mismos rangos que las tablas de span',
    (() => { const c = makeCtx({});
      const B = run('_AURIX_WN12_BOUNDED_RANGES', c);
      const tbl = /\{ '24h': 864e5[^}]*\}/.exec(fnSrc('_aurixInvestableSnapshots'))[0];
      // eslint-disable-next-line no-new-func
      const spans = new Function('return (' + tbl + ')')();
      return Object.keys(spans).every(k => B[k] === 1)
        && B.all === undefined; })(),
    JSON.stringify(run('_AURIX_WN12_BOUNDED_RANGES', makeCtx({}))));
  // LO QUE SÍ QUEDA: una sola tabla de spans. Eran dos literales gemelos que ya
  // discrepaban en su fallback —un nombre desconocido daba 30 días de datos con
  // la cobertura declarada como BUENA— y ahora no pueden volver a divergir. Es la
  // UNIÓN EXACTA de las dos anteriores, así que ninguna ventana se mueve.
  // LO QUE SÍ QUEDA: las dos tablas gemelas de span dicen lo MISMO. Ya no
  // coincidían —'90d' existía en el nominal y no en la selección— y el fallback
  // de ésta convertía ese nombre en 30 días de datos con la cobertura declarada
  // como BUENA. Se comparan CLAVE A CLAVE extrayéndolas de sus dos owners: no se
  // unifican en una constante porque una docena de harness del motor del gráfico
  // construyen su sandbox con estas funciones.
  ok('SC.5.10 las dos tablas de span gemelas dicen exactamente lo mismo',
    (() => { const tbl = (src0) => { const m = /\{ '24h': 864e5[^}]*\}/.exec(src0);
        // eslint-disable-next-line no-new-func
        return m ? new Function('return (' + m[0] + ')')() : null; };
      const a = tbl(fnSrc('_aurixInvestableSnapshots'));
      const b = tbl(fnSrc('_aurixInvestablePerformance'));
      return !!a && !!b && JSON.stringify(a) === JSON.stringify(b)
        && JSON.stringify(a) === JSON.stringify({ '24h': 864e5, '7d': 6048e5, '30d': 2592e6, '90d': 7776e6, '1y': 31536e6 }); })(),
    JSON.stringify([/\{ '24h': 864e5[^}]*\}/.exec(fnSrc('_aurixInvestableSnapshots'))[0],
                    /\{ '24h': 864e5[^}]*\}/.exec(fnSrc('_aurixInvestablePerformance'))[0]]));
  ok('SC.5.11 EJECUTADO: con historia corta los periodos largos NO crean hechos nuevos',
    (() => { const c = makeCtx(CUENTA_B);
      const led = run('_aurixFactLedger({})', c);
      const rets = led.facts.filter(f => /^investable_return_/.test(f.semanticKey));
      // Una sola medición por INTERVALO: dos nombres no pueden publicar el mismo
      // par (startAt, endAt).
      const wins = rets.map(f => f.window.startAt + ':' + f.window.endAt);
      return new Set(wins).size === wins.length; })(),
    JSON.stringify((() => { const c = makeCtx(CUENTA_B);
      return run('_aurixFactLedger({})', c).facts
        .filter(f => /^investable_return_/.test(f.semanticKey)).map(f => f.semanticKey); })()));
  ok('SC.5.12 …y no queda copy de periodos que nadie publica',
    ['intv4_r_180d', 'intv4_r_1y', 'intv4_r_2y', 'intv4_r_5y']
      .every(k => DICT.es[k] === undefined && DICT.en[k] === undefined)
    && typeof DICT.es.intv4_r_90d === 'string');
}

console.log('\nSC · §4.5b · HISTORIA LARGA — el caso que el diff crea y nadie medía');
{
  // LA REVISIÓN FINANCIERA SEÑALÓ ESTE HUECO POR SU NOMBRE: SC.5.11 corre sobre
  // una cuenta de historia CORTA, donde 90d/180d colapsan en 'all' y por tanto no
  // existen. El caso que el diff realmente introduce —y en el que estaba el
  // defecto alto— es el de una cuenta con ~200 días, donde 90d SÍ es una
  // medición propia. Se construye esa cuenta.
  const LARGA = (() => {
    const N = 200, rows = [];
    for (let i = 0; i < N; i++) {
      // Sube hasta el día 110 y cae después: así el retorno de 90d es
      // marcadamente NEGATIVO mientras el de todo el periodo es ligeramente
      // positivo — exactamente la configuración del hallazgo.
      const v = i < 110 ? 80000 + i * 300 : 113000 - (i - 110) * 260;
      rows.push({ ts: NOW2 - (N - 1 - i) * DAY, total: Math.round(v), real_estate: 0 });
    }
    return { assets: B_ASSETS, snap: B_SNAP, rows, serverRows: [], flows: [] };
  })();
  // ── LA RAZÓN DE LA PARADA, FIJADA COMO PRUEBA ─────────────────────────
  // Con los periodos largos pedidos, esta misma cuenta publicaba a la vez
  // all = −20,27 %, 1y = +12,33 % y 180d = +4,85 %. Tres hechos certificados,
  // dos signos, y periodos que se contienen. La causa es que 'all' es el ÚNICO
  // rango sin guardia de retención, así que el trim cosmético de WN.12 le
  // recorta el arranque hasta el pico: mide 90 días y se llama «todo el periodo
  // registrado». Esta prueba deja el defecto REPRODUCIDO para quien levante la
  // parada, y comprueba que hoy no se publica ninguna contradicción.
  ok('SC.5.13 RESIDUAL REPRODUCIDO · «todo el periodo» puede medir MENOS que un rango acotado',
    (() => { const c = makeCtx(LARGA);
      const all = run('_aurixFactLedger({ perfRanges: ["all"] })', c).facts
        .find(f => f.semanticKey === 'investable_return_all');
      const y1 = run('_aurixFactLedger({ perfRanges: ["1y"] })', c).facts
        .find(f => f.semanticKey === 'investable_return_1y');
      if (!all || !y1) return false;
      // El nombre más ancho sobre la ventana más estrecha, y con el signo opuesto.
      return all.window.spanMs < y1.window.spanMs
        && Math.sign(all.value) !== Math.sign(y1.value); })(),
    JSON.stringify((() => { const c = makeCtx(LARGA);
      const f = (r) => { const x = run('_aurixFactLedger({ perfRanges: ["' + r + '"] })', c).facts
        .find(y => y.semanticKey === 'investable_return_' + r);
        return x ? { v: x.value, days: Math.round(x.window.spanMs / DAY) } : null; };
      return { all: f('all'), y1: f('1y') }; })()));
  ok('SC.5.13b …y por eso HOY el ledger no publica ningún periodo largo',
    (() => { const c = makeCtx(LARGA);
      const names = run('_aurixFactLedger({})', c).facts
        .filter(f => /^investable_return_/.test(f.semanticKey)).map(f => f.semanticKey);
      return names.every(n => ['investable_return_24h', 'investable_return_7d',
        'investable_return_30d', 'investable_return_all'].indexOf(n) !== -1); })(),
    JSON.stringify((() => { const c = makeCtx(LARGA);
      return run('_aurixFactLedger({})', c).facts
        .filter(f => /^investable_return_/.test(f.semanticKey)).map(f => f.semanticKey); })()));
  ok('SC.5.14 …y aun así NINGÚN intervalo se publica dos veces bajo dos nombres',
    (() => { const c = makeCtx(LARGA);
      const wins = run('_aurixFactLedger({})', c).facts
        .filter(f => /^investable_return_/.test(f.semanticKey))
        .map(f => f.window.startAt + ':' + f.window.endAt);
      return wins.length > 0 && new Set(wins).size === wins.length; })());
  ok('SC.5.15 …y el nombre más ANCHO gana el intervalo compartido: «todo el periodo» nunca lo pierde',
    (() => { const src0 = fnSrc('_aurixFactLedger');
      const m = /perfRanges = Array[\s\S]{0,2200}?\[([^\]]*)\]/.exec(src0);
      if (!m) return false;
      const order = m[1].split(',').map(x => x.trim().replace(/'/g, ''));
      return order[order.length - 1] === 'all'
        && /perfByWindow\.set\(p\.startAt \+ ':' \+ p\.endAt/.test(src0); })());
  // ── EL HALLAZGO ALTO, EJERCITADO CONTRA EL OWNER REAL ────────────────────
  // Ampliar el catálogo de hechos NO puede mover lo que el hero considera «una
  // novedad». Se le da al selector un 90d enorme y un 'all' plano: si leyera el
  // catálogo entero elegiría el 90d y la lectura pasaría a DECREASING.
  ok('SC.5.16 un periodo NUEVO no puede cambiar la señal de evolución del hero',
    (() => { const c = makeCtx({});
      const FACTS = [
        { semanticKey: 'investable_return_all', family: 'performance', causalRoot: 'investable_return',
          value: 1.2, unit: 'percent', confidence: 1, window: { range: 'all' } },
        { semanticKey: 'investable_return_90d', family: 'performance', causalRoot: 'investable_return',
          value: -9.0, unit: 'percent', confidence: 1, window: { range: '90d' } }];
      const e = run('_aurixAiEvolution(' + JSON.stringify(FACTS) + ', [], { observations: 20 })', c);
      return e.returnPct === 1.2 && e.window === 'all'; })(),
    JSON.stringify((() => { const c = makeCtx({});
      const FACTS = [
        { semanticKey: 'investable_return_all', family: 'performance', causalRoot: 'investable_return',
          value: 1.2, unit: 'percent', confidence: 1, window: { range: 'all' } },
        { semanticKey: 'investable_return_90d', family: 'performance', causalRoot: 'investable_return',
          value: -9.0, unit: 'percent', confidence: 1, window: { range: '90d' } }];
      return run('_aurixAiEvolution(' + JSON.stringify(FACTS) + ', [], { observations: 20 })', c); })()));
  ok('SC.5.17 …y las ventanas que esa señal lee están DECLARADAS, no deducidas del catálogo',
    (() => { const c = makeCtx({});
      const R = run('_AURIX_AI_EVOLUTION_RANGES', c);
      return JSON.stringify(R) === JSON.stringify(['24h', '7d', '30d', 'all'])
        && /_AURIX_AI_EVOLUTION_RANGES[\s\S]{0,120}indexOf/.test(fnSrc('_aurixAiEvolution')); })(),
    JSON.stringify(run('_AURIX_AI_EVOLUTION_RANGES', makeCtx({}))));
}

console.log('\nSC · P1 · «todo el periodo registrado» no puede ser medio periodo');
{
  // EL DEFECTO, MEDIDO: 'all' es el único rango sin guardia de retención WN.12,
  // así que su trim COSMÉTICO se aplica siempre y puede dejar la serie
  // arrancando en el pico de una rampa. La cifra publicada es un TWR
  // flow-neutral REAL sobre esa ventana —no se toca—, pero se llamaba «todo el
  // periodo registrado». Y era indetectable: para 'all' no hay span nominal, así
  // que `coversNominal` vale `true` POR DEFINICIÓN.
  const RAMPA = (() => {
    const N = 200, rows = [];
    for (let i = 0; i < N; i++) {
      const v = i < 110 ? 80000 + i * 300 : 113000 - (i - 110) * 260;
      rows.push({ ts: NOW2 - (N - 1 - i) * DAY, total: Math.round(v), real_estate: 0 });
    }
    return { assets: B_ASSETS, snap: B_SNAP, rows, serverRows: [], flows: [] };
  })();
  const perf = (fx) => { const c = makeCtx(fx); return run('_aurixInvestablePerformance("all")', c); };
  ok('P1.1 el caso se REPRODUCE: el trim recorta el arranque de «todo el periodo»',
    (() => { const p = perf(RAMPA);
      const totalSpan = 199 * DAY;
      return p.valid === true && p.startsAfterRecord === true
        && p.spanMs < totalSpan * 0.8; })(),
    JSON.stringify((() => { const p = perf(RAMPA);
      return { valid: p.valid, trimmed: p.startsAfterRecord,
        diasMedidos: Math.round(p.spanMs / DAY), diasRegistrados: 199, pct: p.returnPct }; })()));
  ok('P1.2 …y `coversNominal` NO podía verlo: para «all» no hay nominal que medir',
    perf(RAMPA).coversNominal === true && perf(RAMPA).nominalMs === null);
  ok('P1.3 el owner lo DECLARA, y la bandera viaja con la ventana del hecho',
    (() => { const c = makeCtx(RAMPA);
      const f = run('_aurixFactLedger({})', c).facts
        .find(x => x.semanticKey === 'investable_return_all');
      return !!f && f.window.startsAfterRecord === true; })());
  ok('P1.4 y la FRASE deja de decir «todo el periodo»: publica el periodo EFECTIVO real',
    (() => { const c = makeCtx(RAMPA);
      const f = run('_aurixFactLedger({})', c).facts
        .find(x => x.semanticKey === 'investable_return_all');
      const txt = run('_intv4FactText(' + JSON.stringify(f) + ')', c);
      const dias = Math.round(f.window.spanMs / DAY);
      return txt.indexOf(DICT.es.intv4_r_all) === -1
        && txt.indexOf(String(dias)) !== -1
        && /d[ií]as registrados/.test(txt); })(),
    JSON.stringify((() => { const c = makeCtx(RAMPA);
      const f = run('_aurixFactLedger({})', c).facts.find(x => x.semanticKey === 'investable_return_all');
      return run('_intv4FactText(' + JSON.stringify(f) + ')', c); })()));
  ok('P1.5 …y LA CIFRA NO SE TOCA: es el mismo TWR flow-neutral que ya se medía',
    (() => { const c = makeCtx(RAMPA);
      const p = run('_aurixInvestablePerformance("all")', c);
      const f = run('_aurixFactLedger({})', c).facts.find(x => x.semanticKey === 'investable_return_all');
      return f.value === p.returnPct && p.basis === 'investable-twr'; })());
  ok('P1.6 el sobre del hecho declara la limitación por su nombre',
    (() => { const c = makeCtx(RAMPA);
      const core = run('_aurixIntelligenceCore({})', c);
      const env = Object.keys(core.factContract.byId)
        .map(k => core.factContract.byId[k])
        .find(e => e.type === 'investable_return_all');
      return !!env && env.effectivePeriod.namedAs === null
        && env.limitations.indexOf('starts_after_first_record') !== -1
        && env.requestedPeriod === 'all'; })(),
    JSON.stringify((() => { const c = makeCtx(RAMPA);
      const core = run('_aurixIntelligenceCore({})', c);
      return Object.keys(core.factContract.byId).map(k => core.factContract.byId[k])
        .filter(e => e.type === 'investable_return_all')[0]; })()));
  // LO QUE NO PUEDE ROMPERSE: una cuenta SIN recorte sigue diciendo «todo el
  // periodo registrado», que es verdad y es la copy que el producto ya tenía.
  ok('P1.7 sin recorte, «todo el periodo registrado» se sigue diciendo tal cual',
    (() => { const c = makeCtx(CUENTA_B);
      const p = run('_aurixInvestablePerformance("all")', c);
      if (p.valid !== true) return false;
      const f = run('_aurixFactLedger({})', c).facts.find(x => x.semanticKey === 'investable_return_all');
      const txt = run('_intv4FactText(' + JSON.stringify(f) + ')', c);
      return p.startsAfterRecord === false && f.window.startsAfterRecord === false
        && txt.indexOf(DICT.es.intv4_r_all) !== -1; })(),
    JSON.stringify((() => { const c = makeCtx(CUENTA_B);
      const f = run('_aurixFactLedger({})', c).facts.find(x => x.semanticKey === 'investable_return_all');
      return f ? run('_intv4FactText(' + JSON.stringify(f) + ')', c) : null; })()));
  ok('P1.8 NO se reconstruye historia: el recorte sigue recortando, sólo cambia el NOMBRE',
    (() => { const c = makeCtx(RAMPA);
      const elig = run('_aurixEligibleInvestableSeries("all")', c);
      const raw  = run('_aurixInvestableSnapshots("all")', c);
      return elig.meta.activeTrimApplied === true && elig.series.length < raw.length
        && elig.series[0].ts > raw[0].ts; })());
  ok('P1.9 `coversNominal` queda INTACTO: Estabilidad no se apaga por un recorte cosmético',
    (() => { const src0 = fnSrc('_aurixInvestablePerformance');
      // La bandera nueva es ADITIVA: la línea de `coversNominal` no cambia.
      return /out\.coversNominal = \(_nominal == null\)\s*\n\s*\? true/.test(src0)
        && /out\.startsAfterRecord = \(_rawStart !== null && tFirst > _rawStart\)/.test(src0); })());
  ok('P1.10 los tres estados del owner siguen intactos (flow-neutral, pending, value_fallback)',
    (() => { const src0 = fnSrc('_aurixInvestablePerformance');
      return /basis: 'investable-twr'/.test(src0)
        && /fallbackReason = 'insufficient_observations'|out\.fallbackReason = 'insufficient_observations'/.test(src0)
        && /out\.fallbackReason = 'baseline_not_comparable'/.test(src0)
        && /out\.fallbackReason = 'window_too_short'/.test(src0); })());
  // ── LO QUE LA REVISIÓN TUMBÓ, Y AHORA SE MIDE ─────────────────────────
  // Degradar por «se movió el arranque» a secas rompía los rangos ACOTADOS,
  // cuyo trim el guardia de retención ya había declarado inocuo: «en las
  // últimas 24 h» pasaba a «en los últimos 1 día registrados». Sólo el nombre
  // que AFIRMA COMPLETITUD puede perderlo.
  ok('P1.12 un rango ACOTADO con el arranque movido CONSERVA su nombre nominal',
    (() => { const c = makeCtx({});
      const W = (range) => ({ range, coversNominal: true, startsAfterRecord: true, spanMs: 864e5 });
      // Los rangos que el ledger publica de verdad. '1y' lo soporta el motor
      // pero `perfRanges` no lo pide, así que nunca llega a la copy (ver P1.12d,
      // que es quien impide que esa asimetría se vuelva un periodo vacío).
      return ['24h', '7d', '30d'].every(r =>
        run('_aurixFactPeriodDegraded(' + JSON.stringify(W(r)) + ')', c) === false
        && run('_intv4WindowLabel(' + JSON.stringify(W(r)) + ')', c) === DICT.es['intv4_r_' + r]); })(),
    JSON.stringify(['24h', '7d', '30d'].map(r => run('_intv4WindowLabel('
      + JSON.stringify({ range: r, coversNominal: true, startsAfterRecord: true, spanMs: 864e5 }) + ')', makeCtx({})))));
  // LA ASIMETRÍA QUE CAUSÓ EL P1, GENERALIZADA COMO INVARIANTE: un rango que el
  // ledger PIDE tiene que poder nombrarse. Si alguien añade un periodo a
  // `perfRanges` sin su copy, el hecho se publica con el periodo VACÍO — que es
  // la misma familia de defecto que «todo el periodo registrado» sobre 90 días.
  ok('P1.12d todo rango que el ledger pide tiene nombre en los DOS idiomas',
    (() => { const m = /perfRanges = Array[\s\S]{0,2200}?\[([^\]]*)\]/.exec(fnSrc('_aurixFactLedger'));
      if (!m) return false;
      const ranges = m[1].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean);
      return ranges.length > 0 && ranges.every(r =>
        typeof DICT.es['intv4_r_' + r] === 'string' && typeof DICT.en['intv4_r_' + r] === 'string'); })(),
    JSON.stringify((/perfRanges = Array[\s\S]{0,2200}?\[([^\]]*)\]/.exec(fnSrc('_aurixFactLedger')) || [, ''])[1]));
  ok('P1.12b …y «24 h» NO se convierte nunca en «1 día registrado»',
    run('_intv4WindowLabel(' + JSON.stringify({ range: '24h', coversNominal: true, startsAfterRecord: true, spanMs: 864e5 }) + ')', makeCtx({}))
      === DICT.es.intv4_r_24h);
  ok('P1.12c …pero un acotado que NO cubre su nominal sigue degradando (regla previa intacta)',
    run('_aurixFactPeriodDegraded(' + JSON.stringify({ range: '1y', coversNominal: false, spanMs: 310 * DAY }) + ')', makeCtx({})) === true);
  // La bandera mide el HECHO, no el mecanismo: el filtro de confianza WN.13
  // también deja fuera puntos INICIALES y producía el mismo nombre falso.
  ok('P1.13 el arranque movido por el FILTRO DE CONFIANZA degrada igual que el recorte',
    (() => { // Cuenta que empezó en 500 US$ y hoy vale 60.000: los primeros
      // puntos caen por `construction_baseline` (< 15 % del ancla).
      const rows = [];
      for (let i = 0; i < 10; i++) rows.push({ ts: NOW2 - (60 - i) * DAY, total: 500 + i * 30, real_estate: 0 });
      for (let i = 0; i < 40; i++) rows.push({ ts: NOW2 - (40 - i) * DAY, total: 55000 + i * 120, real_estate: 0 });
      const c = makeCtx({ assets: B_ASSETS, snap: B_SNAP, rows, serverRows: [], flows: [] });
      const elig = run('_aurixEligibleInvestableSeries("all")', c);
      const raw  = run('_aurixInvestableSnapshots("all")', c);
      const p    = run('_aurixInvestablePerformance("all")', c);
      return elig.meta.reasons.construction_baseline > 0
        && elig.series[0].ts > raw[0].ts
        && Number.isFinite(elig.meta.rawWindowStart)
        && (p.valid !== true || p.startsAfterRecord === true); })(),
    JSON.stringify((() => { const rows = [];
      for (let i = 0; i < 10; i++) rows.push({ ts: NOW2 - (60 - i) * DAY, total: 500 + i * 30, real_estate: 0 });
      for (let i = 0; i < 40; i++) rows.push({ ts: NOW2 - (40 - i) * DAY, total: 55000 + i * 120, real_estate: 0 });
      const c = makeCtx({ assets: B_ASSETS, snap: B_SNAP, rows, serverRows: [], flows: [] });
      const e = run('_aurixEligibleInvestableSeries("all")', c);
      const p = run('_aurixInvestablePerformance("all")', c);
      return { construction: e.meta.reasons.construction_baseline, valid: p.valid,
               startsAfter: p.startsAfterRecord }; })()));
  ok('P1.13b el arranque del REGISTRO se exporta: sin él nadie podía detectarlo',
    /meta\.rawWindowStart = raw\.length \? raw\[0\]\.ts : null;/.test(fnSrc('_aurixEligibleInvestableSeries')));
  ok('P1.11 la cobertura declarada en el DOM la decide el mismo owner que el nombre',
    /_aurixFactPeriodDegraded\(story\.window\)/.test(fnSrc('_intv4StoryHtml'))
    && /_aurixFactPeriodDegraded\(x\.f\.window\)/.test(fnSrc('_intv4MemoryRows')));
}

console.log('\nSC · RESIDUALES · un rendimiento sin periodo, y un drawdown sin cobertura');
{
  const RAMPA2 = (() => {
    const N = 200, rows = [];
    for (let i = 0; i < N; i++) {
      const v = i < 110 ? 80000 + i * 300 : 113000 - (i - 110) * 260;
      rows.push({ ts: NOW2 - (N - 1 - i) * DAY, total: Math.round(v), real_estate: 0 });
    }
    return { assets: B_ASSETS, snap: B_SNAP, rows, serverRows: [], flows: [] };
  })();
  // ── A · `return_positive` ──────────────────────────────────────────────
  ok('R.A1 «Tus inversiones han generado un X %» ya NO puede salir sin periodo',
    (() => { const c = makeCtx({});
      const F = (win) => ({ semanticKey: 'return_positive', value: 4.2, unit: 'percent', window: win });
      const sinVentana = run('_intv4FactText(' + JSON.stringify(F(null)) + ')', c);
      const sinRango   = run('_intv4FactText(' + JSON.stringify(F({ spanMs: 5 * DAY })) + ')', c);
      return sinVentana === '' && sinRango === ''; })(),
    JSON.stringify([run('_intv4FactText(' + JSON.stringify({ semanticKey: 'return_positive', value: 4.2, window: null }) + ')', makeCtx({}))]));
  ok('R.A2 con ventana válida publica la cifra Y su periodo',
    (() => { const c = makeCtx({});
      const txt = run('_intv4FactText(' + JSON.stringify({ semanticKey: 'return_positive', value: 4.2,
        unit: 'percent', window: { range: '30d', coversNominal: true, spanMs: 30 * DAY } }) + ')', c);
      return /4,2\s*%/.test(txt) && txt.indexOf(DICT.es.intv4_r_30d) !== -1; })(),
    run('_intv4FactText(' + JSON.stringify({ semanticKey: 'return_positive', value: 4.2, unit: 'percent',
      window: { range: '30d', coversNominal: true, spanMs: 30 * DAY } }) + ')', makeCtx({})));
  ok('R.A3 …y sobre una serie RECORTADA no lo llama «todo el periodo»',
    (() => { const c = makeCtx(RAMPA2);
      const f = run('_aurixFactLedger({})', c).facts.find(x => x.semanticKey === 'return_positive');
      if (!f) return true;                       // sin rendimiento positivo no hay caso
      const txt = run('_intv4FactText(' + JSON.stringify(f) + ')', c);
      return txt === '' || txt.indexOf(DICT.es.intv4_r_all) === -1; })(),
    JSON.stringify((() => { const c = makeCtx(RAMPA2);
      const f = run('_aurixFactLedger({})', c).facts.find(x => x.semanticKey === 'return_positive');
      return f ? run('_intv4FactText(' + JSON.stringify(f) + ')', c) : 'sin hecho'; })()));
  ok('R.A4 el hecho SIGUE transportando su ventana (no se tocó su emisión)',
    /values: Object\.assign\(\{\}, best\.values\), window: Object\.assign\(\{\}, best\.window\)/.test(fnSrc('_aurixFactLedger')));
  // ── B · Estabilidad ────────────────────────────────────────────────────
  ok('R.B1 el owner del drawdown hereda la cobertura del retorno',
    (() => { const c = makeCtx(RAMPA2);
      const r = run('_aurixPeakRetention("all")', c);
      const p = run('_aurixInvestablePerformance("all")', c);
      return r.startsAfterRecord === p.startsAfterRecord
        && (r.status !== 'available' || Number.isFinite(r.spanMs)); })(),
    JSON.stringify((() => { const c = makeCtx(RAMPA2);
      const r = run('_aurixPeakRetention("all")', c);
      return { status: r.status, startsAfter: r.startsAfterRecord, dias: r.spanMs ? Math.round(r.spanMs / DAY) : null }; })()));
  ok('R.B2 con serie recortada, el eje DECLARA su cobertura en vez de afirmar «desde siempre»',
    (() => { const c = makeCtx({});
      // Se inyecta el owner para fijar el CONTRATO de la superficie, no la
      // forma de una fixture: lo que se certifica es que una retención con
      // arranque movido publica días medidos.
      run('_aurixPeakRetention = () => ({ status: "available", retentionPct: 82, quality: "measured",'
        + ' startsAfterRecord: true, spanMs: ' + (90 * DAY) + ' })', c);
      const r = run('_intv7RadarAxes()', c);
      return typeof r.display.stability === 'string'
        && /82/.test(r.display.stability) && /90/.test(r.display.stability)
        && r.values.stability === 82; })(),
    JSON.stringify((() => { const c = makeCtx({});
      run('_aurixPeakRetention = () => ({ status: "available", retentionPct: 82, quality: "measured",'
        + ' startsAfterRecord: true, spanMs: ' + (90 * DAY) + ' })', c);
      return run('_intv7RadarAxes()', c).display; })()));
  ok('R.B3 sin recorte NO se añade ninguna coletilla: el eje queda como estaba',
    (() => { const c = makeCtx({});
      run('_aurixPeakRetention = () => ({ status: "available", retentionPct: 82, quality: "measured",'
        + ' startsAfterRecord: false, spanMs: ' + (200 * DAY) + ' })', c);
      const r = run('_intv7RadarAxes()', c);
      return r.display.stability == null && r.values.stability === 82; })());
  ok('R.B4 la cifra NO se degrada a «sin datos»: es medible y sigue certificada',
    (() => { const c = makeCtx({});
      run('_aurixPeakRetention = () => ({ status: "available", retentionPct: 82, quality: "measured",'
        + ' startsAfterRecord: true, spanMs: ' + (90 * DAY) + ' })', c);
      const r = run('_intv7RadarAxes()', c);
      return r.unavailable.indexOf('stability') === -1 && r.quality.stability === 'measured'; })());
  ok('R.B5 y la cobertura llega a la descripción accesible, no sólo al píxel',
    (() => { const c = makeCtx({});
      run('_aurixPeakRetention = () => ({ status: "available", retentionPct: 82, quality: "measured",'
        + ' startsAfterRecord: true, spanMs: ' + (90 * DAY) + ' })', c);
      const h = run('_intv7RadarHtml(s => s)', c);
      const a = (h.match(/aria-label="([^"]+)"/) || [, ''])[1];
      return /90/.test(a) && /82/.test(a); })());
}

console.log('\nSC · §4.6 · «Qué ha cambiado» declara contra qué compara');
{
  const mkRows = (startAt) => [{ f: { window: { startAt } } }];
  const refOf = (rows, now) => { const c = makeCtx({});
    return run('_intv4ChangedRef(' + JSON.stringify(rows) + ', ' + String(now) + ')', c); };
  const T = NOW2;
  // LA MARCA DE VISITA SE RETIRA COMO REFERENCIA, y costó dos intentos. La
  // revisión financiera tumbó las DOS direcciones posibles de esa rama: hacia un
  // lado afirmaba una cobertura que nadie había escaneado (visita vieja, filas
  // cortas); hacia el otro atribuía a UN día magnitudes de un mes (visita de
  // ayer, filas de 30 días) y encima en el caso común. `savedAt` es cuándo se
  // PINTÓ la pantalla: no es el extremo de medición de nada. La única referencia
  // publicable es la que sale de los datos.
  ok('SC.6.1 la referencia SALE DE LOS DATOS: la ventana más antigua de las filas',
    (() => { const r = refOf(mkRows(T - 10 * DAY), T);
      return r && r.kind === 'since' && r.at === T - 10 * DAY; })(),
    JSON.stringify(refOf(mkRows(T - 10 * DAY), T)));
  ok('SC.6.2 …y NO existe ninguna rama que pueda nombrar la marca de visita',
    !/visit/.test(fnSrc('_intv4ChangedRef'))
    && !/visitAt/.test(fnSrc('_intv4ChangedHtml'))
    && DICT.es.intv4_changed_ref_visit === undefined
    && DICT.en.intv4_changed_ref_visit === undefined);
  ok('SC.6.3 si todo cabe en 24 h, se dice así',
    (() => { const r = refOf(mkRows(T - 3 * HOUR), T);
      return r && r.kind === '24h'; })());
  ok('SC.6.4 sin ninguna ventana no se inventa referencia',
    refOf([{ f: { window: {} } }], T) === null);
  ok('SC.6.4b la referencia es la MÁS ANTIGUA de todas las filas, no la de la primera',
    (() => { const r = refOf([{ f: { window: { startAt: T - 2 * DAY } } },
                              { f: { window: { startAt: T - 34 * DAY } } }], T);
      return r && r.kind === 'since' && r.at === T - 34 * DAY; })());
  ok('SC.6.5 la línea se pinta, con su tipo declarado para el gate',
    (() => { const h = render(CUENTA_B).html;
      if (!/intv4-changed/.test(h)) return true;           // sin cambios no hay card, y es correcto
      return /class="intv4-chg-ref" data-ref="(since|24h)"/.test(h); })(),
    (render(CUENTA_B).html.match(/class="intv4-chg-ref"[^>]*>[^<]*</) || [''])[0]);
  ok('SC.6.6 las dos frases publicables existen en los dos idiomas',
    ['intv4_changed_ref_since', 'intv4_changed_ref_24h']
      .every(k => DICT.es[k] !== undefined && DICT.en[k] !== undefined));
}

console.log('\nSC · §4.7 · un patrón sin dato no es un patrón');
{
  ok('SC.7.1 la liquidez frente a una necesidad declarada nombra DATO y PERIODO',
    (() => { const c = makeCtx({});
      const txt = run('_intelDiscoveryText(' + JSON.stringify({ code: 'liquidity_fell_while_need_declared',
        values: { cashPct: 6, changePp: -4.2, window: '30D' } }) + ')', c);
      return /4,2/.test(txt) && /6%/.test(txt) && txt.indexOf(DICT.es.intv4_r_30d) !== -1; })(),
    run('_intelDiscoveryText(' + JSON.stringify({ code: 'liquidity_fell_while_need_declared',
      values: { cashPct: 6, changePp: -4.2, window: '30D' } }) + ')', makeCtx({})));
  ok('SC.7.2 …y si falta cualquiera de los tres, CALLA en vez de publicar una frase vacía',
    (() => { const c = makeCtx({});
      return ['cashPct', 'changePp', 'window'].every(drop => {
        const v = { cashPct: 6, changePp: -4.2, window: '30D' }; delete v[drop];
        return run('_intelDiscoveryText(' + JSON.stringify({ code: 'liquidity_fell_while_need_declared', values: v }) + ')', c) === '';
      }); })());
  ok('SC.7.3 un descubrimiento sin evidencia nombrable no se publica',
    (() => { const c = makeCtx({});
      const noEv = run('_intv9DiscoveriesHtml(' + JSON.stringify({ discoveries: [
        { id: 'x', code: 'concentration_crossed_upward', dimension: 'concentration',
          values: { topWeightPct: 68 }, evidence: [] }] }) + ', s => s, [], [])', c);
      const withEv = run('_intv9DiscoveriesHtml(' + JSON.stringify({ discoveries: [
        { id: 'x', code: 'concentration_crossed_upward', dimension: 'concentration',
          values: { topWeightPct: 68 }, evidence: ['top_position_weight'] }] }) + ', s => s, [], [])', c);
      return noEv === '' && /intv9-disc-item/.test(withEv); })());
}

console.log('\nSC · CHECKPOINT B · el sobre del hecho certificado');
{
  const c = makeCtx(CUENTA_B);
  const core = run('_aurixIntelligenceCore({})', c);
  const byId = (core.factContract && core.factContract.byId) || {};
  const envs = Object.keys(byId).map(k => byId[k]);
  ok('SC.B.1 el Core publica un sobre por hecho, con su versión declarada',
    core.factContract && core.factContract.version === 'fact-envelope-1'
    && envs.length === core.ledger.facts.length && envs.length > 0,
    JSON.stringify({ envs: envs.length, facts: core.ledger.facts.length }));
  ok('SC.B.2 cada sobre declara identidad, procedencia, certificación y cobertura',
    envs.every(e => typeof e.factId === 'string' && e.factId
      && typeof e.semanticIdentity === 'string' && e.semanticIdentity.indexOf('|') > 0
      && 'provenance' in e && 'certification' in e && e.coverage && 'coversNominal' in e.coverage
      && Array.isArray(e.limitations) && e.ownerVersion === 'fact-envelope-1'),
    JSON.stringify(envs[0] || null));
  ok('SC.B.3 la identidad semántica es tipo + sujeto + periodo EFECTIVO + owner/versión',
    /semanticIdentity: \[fact\.semanticKey, String\(fact\.causalRoot \|\| ''\),[\s\S]{0,180}_AURIX_FACT_CONTRACT_VERSION\]/.test(fnSrc('_aurixFactEnvelope')));
  ok('SC.B.4 un periodo que NO cubre su nombre nominal no puede nombrarse por él',
    (() => { const e1 = run('_aurixFactEnvelope(' + JSON.stringify({ semanticKey: 'k', id: 'k@1y',
        window: { range: '1y', coversNominal: false, spanMs: 34 * DAY, startAt: 1, endAt: 2 } }) + ', {})', c);
      const e2 = run('_aurixFactEnvelope(' + JSON.stringify({ semanticKey: 'k', id: 'k@1y',
        window: { range: '1y', coversNominal: true, spanMs: 365 * DAY, startAt: 1, endAt: 2 } }) + ', {})', c);
      return e1.effectivePeriod.namedAs === null && e1.requestedPeriod === '1y'
        && e1.limitations.indexOf('window_shorter_than_nominal') !== -1
        && e2.effectivePeriod.namedAs === '1y'; })());
  ok('SC.B.5 y la COPY es un consumidor de esa decisión, no una segunda fuente',
    /_aurixFactPeriodNamedAs\(win\)/.test(fnSrc('_intv4WindowLabel'))
    && /_aurixFactPeriodDegraded\(win\)/.test(fnSrc('_intv4WindowLabel')));
  // LOS DOS NULOS NO SON EL MISMO CASO, y confundirlos publicaba un periodo donde
  // antes no había ninguno. Una ventana SIN rango no autoriza «efectivo: N días»;
  // una ventana que no cubre su nominal, sí. Se ejerce la diferencia.
  ok('SC.B.5b una ventana SIN rango no publica periodo; una DEGRADADA sí',
    (() => { const c2 = makeCtx({});
      const sinRango = run('_intv4WindowLabel(' + JSON.stringify({ spanMs: 5 * DAY }) + ')', c2);
      const degradada = run('_intv4WindowLabel(' + JSON.stringify({ range: '1y', coversNominal: false, spanMs: 34 * DAY }) + ')', c2);
      const normal = run('_intv4WindowLabel(' + JSON.stringify({ range: '30d', coversNominal: true, spanMs: 30 * DAY }) + ')', c2);
      return sinRango === '' && /34/.test(degradada) && normal === DICT.es.intv4_r_30d; })(),
    JSON.stringify([run('_intv4WindowLabel(' + JSON.stringify({ spanMs: 5 * DAY }) + ')', makeCtx({})),
      run('_intv4WindowLabel(' + JSON.stringify({ range: '1y', coversNominal: false, spanMs: 34 * DAY }) + ')', makeCtx({}))]));
  ok('SC.B.6 el ámbito de la cuenta viaja en el OBJETO y NUNCA al DOM',
    (() => { const h = render(CUENTA_B).html;
      return /scope: \{ owner:/.test(fnSrc('_aurixFactEnvelope'))
        && !/data-owner=/.test(h) && !/data-scope=/.test(h) && !/data-user/.test(h); })());
  ok('SC.B.7 el contrato NO es un motor: no lee ningún owner financiero ni calcula',
    (() => { const f = fnSrc('_aurixFactEnvelope');
      return !/_aurixInvestablePerformance|_aurixHealthSnapshot|_aurixEligibleInvestableSeries|toBase\(/.test(f)
        && !/\* |\/ /.test(f.replace(/\/\/[^\n]*/g, '').replace(/864e5/g, '')); })());
  ok('SC.B.8 no añade ni una lectura: se construye sobre el ledger ya recorrido',
    /byId: ledger\.facts\.reduce/.test(fnSrc('_aurixIntelligenceCore')));
}

// ════════════════════════════════════════════════════════════════════════════
// §6 · COMPARADOR DE RENTABILIDAD
// ════════════════════════════════════════════════════════════════════════════
// Sandbox PROPIO y sin red. El adaptador de mercado se simula —es un owner ya
// certificado con su propio gate, y una llamada real haría este gate lento,
// intermitente y dependiente de que la bolsa esté abierta—, pero TODO lo que
// este SPEC añade (alineación, primera fecha común, normalización, FX
// histórico, diferencia en pp y los estados) se ejecuta de verdad.
console.log('\nSC · §6 · comparador de rentabilidad');
{
  const cmpFns = ['_aurixCmpEnabled','_aurixCmpResolvableUSD','_aurixCmpFromRegistry','_aurixCmpProviderRange','_aurixCmpLabel','_aurixCmpRecent','_aurixCmpPushRecent','_aurixCmpFxFor','_aurixCmpBenchmark','_aurixCmpMedianStep','_aurixCmpBucketize',
                  '_aurixCmpConvert',
                  '_aurixCmpAlign','_aurixComparisonSync','_intv14CmpState','_intv14CmpSetState',
                  '_intv14CmpAxisHtml','_intv14CmpSvg','_intv14ComparatorHtml','_intv4T','_intv4Num','_intccEsc','_intccDate','_intccDateTime',
                  '_aurixIntelReadOwned','_aurixIntelWriteOwned','_aurixIntelStore','_aurixIntelOwner'];
  const cmpAsync = ['_aurixCmpFxSeries','_aurixCmpBenchmarkSeries','_aurixComparison'];
  const cmpConsts = ['_AURIX_CMP_FLAG_KEY','_AURIX_CMP_FLAT_PP','_AURIX_CMP_NOMINAL_MS','_AURIX_CMP_COVERAGE_MIN','_AURIX_CMP_MIN_POINTS','_AURIX_CMP_INTRADAY','_AURIX_CMP_DISCLOSURE','ASSET_DB','_AURIX_CMP_KIND_OF','_AURIX_CMP_US_ETFS','_AURIX_CMP_USD_INDICES','_AURIX_CMP_GROUPS','_AURIX_CMP_RECENT_KEY','_AURIX_CMP_RECENT_MAX','_AURIX_CMP_CATALOG','_AURIX_CMP_FX_PAIR','_AURIX_CMP_STATE','_AURIX_CMP_PROVIDER_REASONS','_AURIX_CMP_PROVIDER_RANGE',
                     '_AURIX_CMP_RANGES','_AURIX_CMP_STATE_KEY','_INTV4_PERIMETER'];
  function afnSrc(name) {
    const s0 = 'async function ' + name + '('; const i = app.indexOf(s0);
    if (i < 0) throw new Error('missing async ' + name);
    let p = app.indexOf('(', i), pd = 0;
    for (; p < app.length; p++) { if (app[p] === '(') pd++; else if (app[p] === ')') { pd--; if (!pd) { p++; break; } } }
    let k = app.indexOf('{', p), d = 0;
    for (; k < app.length; k++) { if (app[k] === '{') d++; else if (app[k] === '}') { d--; if (!d) { k++; break; } } }
    return app.slice(i, k);
  }
  // Serie de mercado determinista: crece un 1 por mil por paso desde `from`.
  const mkMarket = (from, n, step, v0, drift) => { const out = [];
    for (let i = 0; i < n; i++) out.push({ time: from + i * step, value: v0 * (1 + drift * i) });
    return out; };
  function cmpCtx(o) {
    const opt = o || {};
    const sb = { Math, Number, JSON, Array, String, Object, Set, Map, Date, isFinite, Promise, console: { warn(){}, log(){} } };
    vm.createContext(sb);
    sb.__store = {};
    sb.localStorage = { getItem: k => (Object.prototype.hasOwnProperty.call(sb.__store, k) ? sb.__store[k] : null),
                        setItem: (k, v) => { sb.__store[k] = String(v); }, removeItem: k => { delete sb.__store[k]; } };
    // ── CHECKPOINT I.2 · LA PUERTA ES UN ENTITLEMENT, NO UNA CLAVE LOCAL ──
    // El resto de este bloque mide qué hace el comparador cuando está
    // ENCENDIDO, así que se le concede la capacidad — salvo cuando el caso
    // mide precisamente la puerta. `hasFeature` es el owner real: se inyecta
    // aquí con la misma semántica que en producción (booleano estricto, y
    // false mientras no haya evidencia).
    sb.__features = opt.noFeature ? {} : { 'intelligence.comparator': true };
    sb.hasFeature = (k) => sb.__features[k] === true;
    if (opt.localOff) sb.__store['aurix_cmp_enabled_v1'] = '0';
    sb.lang = opt.lang || 'es';
    sb.t = k => DICT[sb.lang][k];
    sb._escapeWorkspaceText = s0 => String(s0 == null ? '' : s0)
      .replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    sb._aurixActiveUserId = opt.owner || 'cmp-user';
    sb.baseCurrency = opt.base || 'USD';
    // EL ADAPTADOR SIMULADO devuelve exactamente la forma del certificado:
    // { series:[{time,value}], meta:{ currency, status } }.
    sb.__calls = [];
    sb.window = {
      AurixChartAdapters: {
        yahooHistoryAdapter: (args) => {
          sb.__calls.push(args.symbol + '@' + args.range);
          // I.10 — el camino «el proveedor LANZÓ», que es distinto de
          // «respondió sin puntos» y de «no hay adaptador».
          if (opt.providerThrows && args.symbol === opt.providerThrows) throw new Error('net');
          const f = (opt.feed || {})[args.symbol];
          if (!f) return Promise.resolve({ series: [], meta: { currency: 'USD', status: 'no_history' } });
          return Promise.resolve({ series: f.series, meta: { currency: f.currency || 'USD', status: 'ready' } });
        },
      },
    };
    if (opt.kill) sb.window.__AURIX_CMP_KILL = true;
    vm.runInContext('var window = globalThis.window;', sb);
    // LAS FUNCIONES PRIMERO. `_AURIX_CMP_CATALOG` se DERIVA del registro de
    // Market llamando a `_aurixCmpFromRegistry()` en su propia definición, así
    // que declarar las constantes antes reventaba con «is not defined».
    cmpFns.forEach(n => vm.runInContext(fnSrc(n), sb));
    cmpConsts.forEach(n => vm.runInContext(konstSrc(n), sb));
    cmpAsync.forEach(n => vm.runInContext(afnSrc(n), sb));
    // El owner del retorno se INYECTA: su certificación es suya y tiene su
    // propio gate; lo que aquí se mide es qué hace el comparador con él.
    vm.runInContext('var __perf = ' + JSON.stringify(opt.perf === undefined
      ? { valid: false, fallbackReason: 'insufficient_observations' } : opt.perf)
      + '; function _aurixInvestablePerformance(){ return __perf; }', sb);
    return sb;
  }
  const IDX = (from, n, step, drift) => ({ basis: 'flow_neutral_index', base: 100,
    intervals: n - 1, timestamps: Array.from({ length: n }, (_, i) => from + i * step),
    values: Array.from({ length: n }, (_, i) => 100 * (1 + drift * i)) });
  const T_0 = Date.UTC(2026, 0, 1), D1 = 86400000;
  const PERF_OK = { valid: true, index: IDX(T_0, 40, D1, 0.002), fallbackReason: null };
  const FEED_OK = { '^GSPC': { series: mkMarket(T_0, 40, D1, 5000, 0.001) } };

  // ── LA PUERTA, ANTES QUE NADA ────────────────────────────────────────
  // El founder autorizó publicar el CÓDIGO del comparador, no su exposición.
  // Sin mecanismo por cuenta en el cliente, el defecto es APAGADO y sólo un
  // opt-in explícito lo enciende. Esto se mide, no se declara en un comentario.
  ok('6.0a SIN la capacidad concedida, el comparador no existe para nadie',
    run('_aurixCmpEnabled()', cmpCtx({ noFeature: true })) === false);
  ok('6.0b …y con la capacidad concedida por el SERVIDOR, se enciende',
    run('_aurixCmpEnabled()', cmpCtx({})) === true);
  ok('6.0c el KILL SWITCH manda por encima de la capacidad',
    run('_aurixCmpEnabled()', cmpCtx({ kill: true })) === false);
  ok('6.0c2 un usuario FREE no puede encenderlo tocando `localStorage`',
    (() => { const c = cmpCtx({ noFeature: true });
      run('localStorage.setItem("aurix_cmp_enabled_v1", "1")', c);
      // …ni escribiendo cualquier otra cosa: la clave local sólo puede APAGAR.
      return run('_aurixCmpEnabled()', c) === false; })());
  ok('6.0c3 …y el apagado LOCAL sí funciona (vía de rollback del propio usuario)',
    run('_aurixCmpEnabled()', cmpCtx({ localOff: true })) === false);
  ok('6.0c4 sin evidencia de entitlement cargada, falla CERRADO',
    (() => { const c = cmpCtx({});
      run('hasFeature = function () { return false; }', c);
      return run('_aurixCmpEnabled()', c) === false; })());
  ok('6.0c5 la capacidad está DECLARADA en el canon, o el cliente la negaría con la BD correcta',
    /'intelligence\.comparator'/.test(konstSrc('_AURIX_ENT_CANON_EXTRA')));
  ok('6.0c6 el paso manual existe, es ADITIVO y NINGÚN plan concede la capacidad',
    (() => { const sql = fs.readFileSync(path.join(ROOT, 'db', 'intelligence_comparator_key_1.sql'), 'utf8');
      return /insert into public\.plan_features/.test(sql)
        && /\('free',\s*'intelligence\.comparator', false\)/.test(sql)
        && /\('premium',\s*'intelligence\.comparator', false\)/.test(sql)
        && /on conflict \(plan, feature_key\) do update/.test(sql)
        // …y no toca esquema, políticas ni privilegios.
        && !/\b(create|alter|drop|grant|revoke)\s+(table|policy|function|schema)/i.test(sql)
        && /NO APLICADO/.test(sql); })());
  ok('6.0c7 …y el canary local ya NO es el mecanismo: la clave sólo puede apagar',
    (() => { const src0 = fnSrc('_aurixCmpEnabled');
      return /hasFeature\('intelligence\.comparator'\)/.test(src0)
        && /=== '0'/.test(src0) && !/=== '1'/.test(src0); })());
  ok('6.0d apagado ⇒ la superficie no se pinta y NO se publica ninguna serie',
    (() => { const c = cmpCtx({ noFeature: true });
      return run('_intv14ComparatorHtml(_escapeWorkspaceText, null) === ""', c) === true
        && run('_aurixComparisonSync("all").reason', c) === 'flag_off'; })());
  // ── CHECKPOINT I.4 · EL CATÁLOGO YA NO ES CERRADO: ES DERIVADO ────────
  // Eran cuatro entradas a mano. Ahora sale del registro autoritativo de
  // Market, así que el invariante deja de ser «son exactamente estas cuatro»
  // —que fosilizaba una limitación— y pasa a ser el que importa: todo lo que
  // entra tiene identificador inequívoco, nombre, naturaleza conocida y tipo
  // de rentabilidad declarado, y nada se duplica.
  ok('6.1 el catálogo se DERIVA del registro de Market y no se mantiene dos veces',
    (() => { const c = cmpCtx({});
      const cat = run('_AURIX_CMP_CATALOG', c);
      const bySym = cat.reduce((a, b) => (a[b.id] = b.symbol, a), {});
      // El techo dejó de ser «cuantos más mejor»: la revisión financiera
      // demostró que ~20 entradas del registro no las resuelve el endpoint
      // histórico y que seis índices cotizan en otra divisa. El contrato es
      // «todo lo que se ofrece se puede comparar de verdad».
      return cat.length >= 25
        && /ASSET_DB/.test(fnSrc('_aurixCmpFromRegistry'))
        // las cuatro declaradas conservan su id: un comparador guardado sigue resolviendo
        && bySym.sp500 === '^GSPC' && bySym.ndx100 === '^NDX'
        && bySym.btc === 'BTC-USD' && bySym.gold === 'GC=F'; })(),
    JSON.stringify({ n: run('_AURIX_CMP_CATALOG', cmpCtx({})).length }));
  ok('6.1a TODA entrada tiene símbolo, nombre, naturaleza y tipo de rentabilidad',
    (() => { const cat = run('_AURIX_CMP_CATALOG', cmpCtx({}));
      const kinds = run('_AURIX_CMP_GROUPS', cmpCtx({}));
      const c2 = cmpCtx({});
      return cat.every(b => !!b.symbol && !!(b.name || b.labelKey)
          && kinds.indexOf(b.kind) !== -1 && b.returnType === 'price_return')
        // …y el nombre visible nunca sale vacío, vengan de donde vengan.
        && cat.every(b => String(run('_aurixCmpLabel(' + JSON.stringify(b) + ')', c2) || '').length > 0); })());
  ok('6.1a2 ni ids ni símbolos duplicados, y las cinco categorías están cubiertas',
    (() => { const cat = run('_AURIX_CMP_CATALOG', cmpCtx({}));
      const kinds = new Set(cat.map(b => b.kind));
      return new Set(cat.map(b => b.id)).size === cat.length
        && new Set(cat.map(b => b.symbol)).size === cat.length
        && ['index', 'etf', 'stock', 'crypto', 'metal'].every(k => kinds.has(k)); })(),
    JSON.stringify(Array.from(new Set(run('_AURIX_CMP_CATALOG', cmpCtx({})).map(b => b.kind)))));
  ok('6.1a3 FALLA CERRADA: una entrada del registro sin metadato esencial no entra',
    // `ASSET_DB` es `const` en el bundle, así que no se reasigna: se construye
    // un sandbox limpio con un registro degradado y se mide el filtro.
    (() => { const sb2 = {}; vm.createContext(sb2);
      vm.runInContext('const ASSET_DB = ['
        + '{ ticker: "X", name: "", type: "stock", marketSymbol: "X" },'
        + '{ ticker: "Y", name: "Y", type: "desconocido", marketSymbol: "Y" },'
        + '{ ticker: "Z", name: "Z", type: "stock", marketSymbol: "" }];\n'
        + konstSrc('_AURIX_CMP_KIND_OF') + '\n' + fnSrc('_aurixCmpFromRegistry'), sb2);
      return vm.runInContext('_aurixCmpFromRegistry().length', sb2) === 0; })());
  // EL FOUNDER LO PIDIÓ POR SU NOMBRE: Nasdaq 100 es ^NDX. El Composite (^IXIC)
  // es OTRO índice —3.000 valores frente a 100—. Los dos pueden ofrecerse; lo
  // que no puede pasar es que uno se publique con el nombre del otro.
  ok('6.1b Nasdaq 100 es ^NDX, y ^IXIC sólo puede llamarse Composite',
    (() => { const c = cmpCtx({});
      const cat = run('_AURIX_CMP_CATALOG', c);
      const ndx = cat.find(b => b.symbol === '^NDX');
      const ixic = cat.find(b => b.symbol === '^IXIC');
      const nameOf = (b) => String(run('_aurixCmpLabel(' + JSON.stringify(b) + ')', c) || '');
      return !!ndx && /Nasdaq 100/i.test(nameOf(ndx))
        && (!ixic || (/composite/i.test(nameOf(ixic)) && !/Nasdaq 100/i.test(nameOf(ixic)))); })(),
    JSON.stringify(run('_AURIX_CMP_CATALOG', cmpCtx({}))
      .filter(b => /NDX|IXIC/.test(b.symbol)).map(b => b.symbol + '=' + (b.name || b.labelKey))));
  ok('6.1c el tipo de rentabilidad se DECLARA y no se mezcla (ninguno finge total return)',
    (() => { const cat = run('_AURIX_CMP_CATALOG', cmpCtx({}));
      return cat.every(b => b.returnType === 'price_return')
        // I.9 — el disclosure ya no es un texto único: lo elige la naturaleza.
        && cat.every(b => !!b.kind)
        && /dividendos/.test(DICT.es.cmp_disc_index)
        && /dividendos|distribuciones/.test(DICT.es.cmp_disc_equity)
        // …y NO se mencionan dividendos donde no existen.
        && !/dividendo/.test(DICT.es.cmp_disc_price); })());
  ok('6.1d el oro y el bitcoin NO reciben la frase de dividendos',
    (() => { const c = cmpCtx({ perf: PERF_OK });
      const mk = (bid) => ({ state: 'ready', benchmarkId: bid,
        mine: [{ ts: T_0, value: 100 }, { ts: T_0 + D1, value: 104 }],
        other: [{ ts: T_0, value: 100 }, { ts: T_0 + D1, value: 106 }],
        diffPp: -2, from: T_0, to: T_0 + D1, returnType: 'price_return' });
      run('_intv14CmpSetState({ benchmarkId: "gold" })', c);
      const gold = run('_intv14ComparatorHtml(_intccEsc, ' + JSON.stringify(mk('gold')) + ')', c);
      run('_intv14CmpSetState({ benchmarkId: "sp500" })', c);
      const spx  = run('_intv14ComparatorHtml(_intccEsc, ' + JSON.stringify(mk('sp500')) + ')', c);
      return gold.indexOf(DICT.es.cmp_disc_price) !== -1 && !/dividendo/.test(gold)
        && spx.indexOf(DICT.es.cmp_disc_index) !== -1; })(),
    'disclosure por naturaleza');
  ok('6.2 SIN COMPARACIÓN el gráfico publica SÓLO la serie propia, en base 100',
    (() => { const c = cmpCtx({ perf: PERF_OK });
      const r = run('_aurixComparisonSync("all")', c);
      return r.state === 'ready' && r.other === null
        && r.mine.length === 40 && r.mine[0].value === 100; })(),
    JSON.stringify((() => { const c = cmpCtx({ perf: PERF_OK });
      const r = run('_aurixComparisonSync("all")', c);
      return { state: r.state, n: r.mine && r.mine.length, first: r.mine && r.mine[0].value, other: r.other }; })()));
  okA('6.3 seleccionar un comparador añade UNA segunda serie, y ambas arrancan en 100',
    (async () => { const c = cmpCtx({ perf: PERF_OK, feed: FEED_OK });
      const r = await run('_aurixComparison("all", "sp500", {})', c);
      return r.state === 'ready' && r.other && r.other.length === r.mine.length
        && r.mine[0].value === 100 && r.other[0].value === 100
        && r.mine[0].ts === r.other[0].ts; })());
  okA('6.4 la diferencia va en PUNTOS PORCENTUALES, no en porcentaje entre porcentajes',
    (async () => { const c = cmpCtx({ perf: PERF_OK, feed: FEED_OK });
      const r = await run('_aurixComparison("all", "sp500", {})', c);
      const mine = r.mine[r.mine.length - 1].value - 100;
      const oth  = r.other[r.other.length - 1].value - 100;
      return Math.abs(r.diffPp - (mine - oth)) < 0.011; })());
  ok('6.5 UN solo comparador: elegir otro SUSTITUYE, no acumula',
    (() => { const c = cmpCtx({ perf: PERF_OK });
      run('_intv14CmpSetState({ benchmarkId: "sp500" })', c);
      run('_intv14CmpSetState({ benchmarkId: "btc" })', c);
      const st = run('_intv14CmpState()', c);
      return st.benchmarkId === 'btc' && typeof st.benchmarkId === 'string'; })());
  ok('6.6 retirarlo devuelve el estado inicial SIN COMPARACIÓN y conserva la serie propia',
    (() => { const c = cmpCtx({ perf: PERF_OK });
      run('_intv14CmpSetState({ benchmarkId: "sp500" })', c);
      run('_intv14CmpSetState({ benchmarkId: null })', c);
      const st = run('_intv14CmpState()', c);
      const r = run('_aurixComparisonSync("all")', c);
      return st.benchmarkId === null && r.mine.length === 40; })());
  ok('6.7 un id inventado en el almacenamiento NO entra',
    (() => { const c = cmpCtx({ perf: PERF_OK });
      run('_aurixIntelWriteOwned(_AURIX_CMP_STATE_KEY, { range: "all", benchmarkId: "../evil" }, {})', c);
      return run('_intv14CmpState()', c).benchmarkId === null; })());
  ok('6.8 …y un rango inventado tampoco',
    (() => { const c = cmpCtx({ perf: PERF_OK });
      run('_aurixIntelWriteOwned(_AURIX_CMP_STATE_KEY, { range: "9999y", benchmarkId: null }, {})', c);
      return _AURIX_CMP_RANGES_OK(run('_intv14CmpState()', c).range); })());
  ok('6.9 el estado va SELLADO POR CUENTA: el comparador de A no aparece en B',
    (() => { const a = cmpCtx({ perf: PERF_OK, owner: 'user-A' });
      run('_intv14CmpSetState({ benchmarkId: "gold" })', a);
      const raw = JSON.parse(a.__store[run('_AURIX_CMP_STATE_KEY', a)]);
      const b = cmpCtx({ perf: PERF_OK, owner: 'user-B' });
      b.__store[run('_AURIX_CMP_STATE_KEY', b)] = JSON.stringify(raw);
      return raw.owner === 'user-A' && run('_intv14CmpState()', b).benchmarkId === null; })());
  // ── PUERTAS FINANCIERAS ────────────────────────────────────────────────
  okA('6.10 SIN rentabilidad certificada NO hay comparación porcentual, y se dice por qué',
    (async () => { const c = cmpCtx({ perf: { valid: false, fallbackReason: 'window_too_short' }, feed: FEED_OK });
      const r = await run('_aurixComparison("30d", "sp500", {})', c);
      return r.state === 'no_return' && r.reason === 'window_too_short'
        && r.mine === null && r.other === null; })());
  // LA QA VISUAL ENSEÑÓ ESTE DEFECTO: el estado «sin rentabilidad» ocultaba
  // TODOS los controles, y el periodo por defecto es TOTAL. Una cuenta con
  // rentabilidad en 24H pero no en TOTAL se quedaba encerrada en el estado sin
  // ninguna forma de cambiar de periodo.
  okA('6.10c …pero el SELECTOR DE PERIODO se queda: es la salida del estado',
    (async () => { const c = cmpCtx({ perf: { valid: false, fallbackReason: 'window_too_short' }, feed: FEED_OK });
      const r = await run('_aurixComparison("all", "sp500", {})', c);
      const h = run('_intv14ComparatorHtml(_intccEsc, ' + JSON.stringify(r) + ')', c);
      return /data-state="no_return"/.test(h)
        // I.5 — son SEIS desde que `90d` (3M) entra: el único periodo nuevo
        // que las dos tablas de span certifican.
        && (h.match(/data-cmp-range="/g) || []).length === 6
        && !/data-cmp-select/.test(h); })(),
    'controles en el estado no_return');
  okA('6.10b …y una serie de VALOR nunca se reinterpreta como rentabilidad',
    (async () => { const c = cmpCtx({ perf: { valid: true, index: { basis: 'value_series', base: null,
        timestamps: [T_0, T_0 + D1], values: [1000, 1100] } }, feed: FEED_OK });
      const r = await run('_aurixComparison("30d", "sp500", {})', c);
      return r.state === 'no_return'; })());
  okA('6.11 INSUFICIENCIA no produce ceros: no hay segunda serie y la propia sobrevive',
    (async () => { const c = cmpCtx({ perf: PERF_OK, feed: {} });      // el oro no cotiza en 24h
      const r = await run('_aurixComparison("24h", "gold", {})', c);
      return r.state === 'insufficient' && r.other === null
        && Array.isArray(r.mine) && r.mine.length === 40
        && r.diffPp === null; })(),
    JSON.stringify((async () => 0)) && 'ver estado');
  okA('6.12 HISTORIA PARCIAL: se usa la PRIMERA FECHA COMÚN y se declara desde cuándo',
    (async () => { // el benchmark empieza 20 días más tarde que la cartera
      const c = cmpCtx({ perf: PERF_OK, feed: { '^GSPC': { series: mkMarket(T_0 + 20 * D1, 20, D1, 5000, 0.001) } } });
      const r = await run('_aurixComparison("all", "sp500", {})', c);
      return r.state === 'ready' && r.from === T_0 + 20 * D1
        && r.availableFrom === T_0 + 20 * D1
        && r.mine[0].value === 100 && r.other[0].value === 100; })());
  ok('6.13 NUNCA se interpola: un hueco del benchmark NO se rellena',
    (() => { const c = cmpCtx({});
      // Dos series con el mismo paso pero una a la que le faltan buckets.
      const A = [{ ts: T_0, value: 100 }, { ts: T_0 + D1, value: 101 }, { ts: T_0 + 2 * D1, value: 102 }];
      const B = [{ ts: T_0, value: 50 }, { ts: T_0 + 2 * D1, value: 52 }];
      const al = run('_aurixCmpAlign(' + JSON.stringify(A) + ', ' + JSON.stringify(B) + ')', c);
      if (!al) return false;
      // El bucket que B no tiene sencillamente NO EXISTE en la salida: no se
      // rellena, no se arrastra y no se interpola. Y los pares emparejados caen
      // en el MISMO bucket — que es la unidad de alineación que el §6.2
      // autoriza («por timestamp/bucket certificado»), no el instante exacto.
      return al.mine.length === al.other.length
        && al.mine.length === 2
        && al.mine.every((p, i) => Math.floor(p.ts / al.stepMs) === Math.floor(al.other[i].ts / al.stepMs))
        // Ningún valor de B se ha inventado: los dos que salen son los dos que
        // B tenía.
        && al.other.length === B.length; })());
  okA('6.14 cambiar de periodo recalcula LAS DOS series desde el mismo inicio',
    (async () => { const c = cmpCtx({ perf: PERF_OK, feed: FEED_OK });
      const a = await run('_aurixComparison("all", "sp500", {})', c);
      const b = await run('_aurixComparison("30d", "sp500", {})', c);
      return a.mine[0].value === 100 && a.other[0].value === 100
        && b.mine[0].value === 100 && b.other[0].value === 100
        && a.from === b.from; })());
  ok('6.15 la serie propia es el ÍNDICE FLOW-NEUTRAL: un flujo no la deforma',
    (() => { const src0 = fnSrc('_aurixComparison') + fnSrc('_aurixComparisonSync');
      return /perf\.index\.basis !== 'flow_neutral_index'/.test(src0)
        && !/portfolioHistory|categoryHistory|investableValueBase/.test(src0); })());
  // ── LO QUE LA REVISIÓN FINANCIERA ROMPIÓ ───────────────────────────────
  // (1) CRÍTICO: sólo el benchmark se convertía con FX histórico. La serie
  // propia venía de snapshots convertidos con el tipo de HOY (factor constante
  // que se cancela al normalizar), o sea un índice en USD, contra un benchmark
  // en EUR. Con las dos subiendo lo mismo en USD y el euro apreciándose, la
  // card publicaba una diferencia de varios pp que NO EXISTIÓ.
  const FXS = (from, n, step, r0, drift) => { const out = [];
    for (let i = 0; i < n; i++) out.push({ time: from + i * step, value: r0 * (1 + drift * i) });
    return out; };
  okA('6.17 CRÍTICO · con base EUR se convierten LAS DOS series, no sólo el benchmark',
    (async () => {
      // Cartera y benchmark IDÉNTICOS en USD ⇒ en cualquier divisa la
      // diferencia tiene que ser CERO. Si sólo se convirtiera una, saldría la
      // deriva del euro entera.
      const same = 0.002;
      const c = cmpCtx({ base: 'EUR',
        perf: { valid: true, index: IDX(T_0, 40, D1, same), fallbackReason: null },
        feed: { '^GSPC': { series: mkMarket(T_0, 40, D1, 5000, same) },
                'EURUSD=X': { series: FXS(T_0, 40, D1, 1.05, 0.003) } } });
      const r = await run('_aurixComparison("all", "sp500", { base: "EUR" })', c);
      return r.state === 'ready' && Math.abs(r.diffPp) < 0.02 && r.fxPair === 'EURUSD=X'; })(),
    'diferencia con las dos series iguales en USD');
  okA('6.17b …y si el FX NO se aplicara a las dos, este mismo caso daría ≠ 0',
    (async () => {
      // Control negativo: el benchmark se mueve distinto, así que la diferencia
      // SÍ debe existir. Sin esto, 6.17 pasaría con un comparador roto que
      // devolviera siempre 0.
      const c = cmpCtx({ base: 'EUR',
        perf: { valid: true, index: IDX(T_0, 40, D1, 0.004), fallbackReason: null },
        feed: { '^GSPC': { series: mkMarket(T_0, 40, D1, 5000, 0.001) },
                'EURUSD=X': { series: FXS(T_0, 40, D1, 1.05, 0.003) } } });
      const r = await run('_aurixComparison("all", "sp500", { base: "EUR" })', c);
      return r.state === 'ready' && Math.abs(r.diffPp) > 1; })());
  okA('6.17c sin FX para un bucket, ese bucket se cae para las DOS (nunca se interpola)',
    (async () => { const c = cmpCtx({ base: 'EUR',
        perf: { valid: true, index: IDX(T_0, 40, D1, 0.002), fallbackReason: null },
        feed: { '^GSPC': { series: mkMarket(T_0, 40, D1, 5000, 0.001) },
                'EURUSD=X': { series: FXS(T_0, 5, D1, 1.05, 0.001) } } });   // FX sólo 5 días
      const r = await run('_aurixComparison("all", "sp500", { base: "EUR" })', c);
      return (r.state === 'ready' && r.mine.length === r.other.length && r.mine.length <= 5)
        || r.state === 'insufficient'; })());
  okA('6.17d con base USD no se pide FX en absoluto',
    (async () => { const c = cmpCtx({ base: 'USD', perf: PERF_OK, feed: FEED_OK });
      await run('_aurixComparison("all", "sp500", { base: "USD" })', c);
      return c.__calls.every(x => x.indexOf('EURUSD') === -1); })(),
    JSON.stringify(cmpCtx({}).__calls));
  // (2) ALTO: el bucket ciego emparejaba observaciones separadas semanas.
  ok('6.18 ALTO · la alineación es AS-OF con tolerancia derivada, no bucket ciego',
    (() => { const c = cmpCtx({});
      // Cartera densa (cada día) y benchmark mensual: el as-of tiene que
      // emparejar cada barra del benchmark con el punto de cartera del MISMO
      // día, no con el del final del mes.
      const mine = []; for (let i = 0; i < 90; i++) mine.push({ ts: T_0 + i * D1, value: 100 + i });
      const other = [{ ts: T_0 + 5 * D1, value: 50 }, { ts: T_0 + 35 * D1, value: 55 },
                     { ts: T_0 + 65 * D1, value: 60 }];
      const al = run('_aurixCmpAlign(' + JSON.stringify(mine) + ', ' + JSON.stringify(other) + ')', c);
      if (!al) return false;
      // Cada par tiene que caer dentro de la tolerancia, que es la resolución
      // de la serie DENSA (un día), no la del benchmark (un mes).
      return al.mine.length === 3 && al.toleranceMs === D1
        && al.mine.every((p, i) => p.ts === al.other[i].ts)
        && al.mine[0].value === 100 && al.other[0].value === 100; })(),
    JSON.stringify((() => { const c = cmpCtx({});
      const mine = []; for (let i = 0; i < 90; i++) mine.push({ ts: T_0 + i * D1, value: 100 + i });
      const other = [{ ts: T_0 + 5 * D1, value: 50 }, { ts: T_0 + 35 * D1, value: 55 }, { ts: T_0 + 65 * D1, value: 60 }];
      const al = run('_aurixCmpAlign(' + JSON.stringify(mine) + ', ' + JSON.stringify(other) + ')', c);
      return al ? { n: al.mine.length, tol: al.toleranceMs } : null; })()));
  ok('6.18b un ancla sin pareja DENTRO de la tolerancia se descarta, no se estira',
    (() => { const c = cmpCtx({});
      // La cartera tiene un hueco de 40 días justo donde cae la segunda barra.
      const mine = [{ ts: T_0, value: 100 }, { ts: T_0 + D1, value: 101 },
                    { ts: T_0 + 80 * D1, value: 150 }, { ts: T_0 + 81 * D1, value: 151 }];
      const other = [{ ts: T_0 + D1, value: 50 }, { ts: T_0 + 40 * D1, value: 55 },
                     { ts: T_0 + 81 * D1, value: 60 }];
      const al = run('_aurixCmpAlign(' + JSON.stringify(mine) + ', ' + JSON.stringify(other) + ')', c);
      // La barra de +40d no tiene punto de cartera cercano ⇒ fuera.
      return !!al && al.mine.length === 2
        && al.mine.every(p => p.ts === T_0 + D1 || p.ts === T_0 + 81 * D1); })());
  // (3) MEDIO: la diferencia se publicaba SIN SIGNO.
  ok('6.19 MEDIO · ir por detrás y ir por delante NO se leen igual',
    (() => { const c = cmpCtx({ perf: PERF_OK });
      const mk = (d) => ({ state: 'ready', mine: [{ ts: T_0, value: 100 }, { ts: T_0 + D1, value: 104 }],
        other: [{ ts: T_0, value: 100 }, { ts: T_0 + D1, value: 116 }], diffPp: d, from: T_0, to: T_0 + D1 });
      // Bitcoin y no el S&P: su nombre no lleva `&`, así que la comparación es
      // contra el texto tal cual y no contra su forma escapada.
      run('_intv14CmpSetState({ benchmarkId: "btc" })', c);
      const behind = run('_intv14ComparatorHtml(_intccEsc, ' + JSON.stringify(mk(-12)) + ')', c);
      const ahead  = run('_intv14ComparatorHtml(_intccEsc, ' + JSON.stringify(mk(12)) + ')', c);
      const bmName = DICT.es.cmp_b_btc;
      return behind !== ahead
        && behind.indexOf(DICT.es.cmp_diff_less('12', bmName)) !== -1
        && ahead.indexOf(DICT.es.cmp_diff_more('12', bmName)) !== -1
        && /data-diff-pp="-12"/.test(behind)
        // I.9 — y ninguna de las dos usa lenguaje de carrera.
        && !/POR DELANTE|POR DETR|AHEAD|BEHIND/.test(behind + ahead)
        // …ni omite contra quién se compara.
        && behind.indexOf(bmName) !== -1; })(),
    'frases de dirección');
  ok('6.19b por debajo de la tolerancia DECLARADA se dice equivalencia, no una diferencia',
    (() => { const c = cmpCtx({ perf: PERF_OK });
      const mk = (d) => ({ state: 'ready', benchmarkId: 'sp500',
        mine: [{ ts: T_0, value: 100 }, { ts: T_0 + D1, value: 104 }],
        other: [{ ts: T_0, value: 100 }, { ts: T_0 + D1, value: 104 }], diffPp: d,
        from: T_0, to: T_0 + D1 });
      run('_intv14CmpSetState({ benchmarkId: "sp500" })', c);
      const flat = run('_intv14ComparatorHtml(_intccEsc, ' + JSON.stringify(mk(0.004)) + ')', c);
      return flat.indexOf(DICT.es.cmp_diff_flat) !== -1
        && run('_AURIX_CMP_FLAT_PP', c) === 0.01; })());
  // (4) MEDIO: no se declaraba el FIN de la ventana comparable.
  ok('6.20 MEDIO · se declaran los DOS extremos de la ventana comparable',
    /out\.endsBefore = \(al\.to </.test(fnSrc('_aurixComparison'))
    && /cmp\.endsBefore/.test(fnSrc('_intv14ComparatorHtml'))
    && typeof DICT.es.cmp_ends === 'function' && typeof DICT.en.cmp_ends === 'function');
  // (5) El repintado tras un re-render de la pestaña.
  ok('6.21 tras repintar la pestaña, el comparador guardado vuelve a cargarse',
    (() => { const s0 = fnSrc('_initIntelligenceCommandCenter');
      const iWire = s0.indexOf('_intv14CmpRepaint = repaint;');
      const iCall = s0.indexOf('_intv14CmpRepaint();');
      // La llamada tiene que estar FUERA del bloque de cableado, que corre una
      // sola vez: dentro, un repintado dejaba el selector marcado y la segunda
      // línea desaparecida.
      return iWire > 0 && iCall > iWire && /SE DISPARA EN CADA PINTURA/.test(s0); })());
  // ── I.4/I.6 · EL PAR FX LO ELIGE LA COTIZACIÓN, NO LA BASE ───────────
  const MKT = (from, n, step, p0, drift) => { const out = [];
    for (let i = 0; i < n; i++) out.push({ time: from + i * step, value: p0 * (1 + drift * i) });
    return out; };
  const fxCtx = (ccy) => cmpCtx({ base: 'EUR',
    perf: { valid: true, index: IDX(T_0, 40, D1, 0.002), fallbackReason: null },
    feed: { '^GSPC': { series: MKT(T_0, 40, D1, 5000, 0.002), currency: ccy },
            'EURUSD=X': { series: MKT(T_0, 40, D1, 1.05, 0.001) } } });
  okA('6.22 CRÍTICO · un benchmark en OTRA divisa NO se convierte con el par de la base',
    (async () => { const r = await run('_aurixComparison("all", "sp500", { base: "EUR" })', fxCtx('GBP'));
      // Se DETIENE. Hoy corta todavía antes —la divisa reportada no coincide
      // con la DECLARADA en el catálogo—, que es la puerta que la revisión
      // financiera pidió: el adaptador rellena «USD» cuando el proveedor no
      // confirma nada, así que fiarse de lo reportado era fiarse de un valor
      // por defecto. Lo que importa es que NO publica.
      return r.state === 'insufficient'
        && ['quote_currency_mismatch', 'currency_not_supported'].indexOf(r.reason) !== -1; })(),
    'GBP no puede convertirse');
  okA('6.22b …y con una dirección certificada, convierte y compara',
    (async () => { const r = await run('_aurixComparison("all", "sp500", { base: "EUR" })', fxCtx('USD'));
      return r.state === 'ready' && r.quoted === 'USD' && r.fxPair === 'EURUSD=X'; })());
  okA('6.22c una divisa reportada que NO es la declarada tampoco pasa',
    (async () => { const r = await run('_aurixComparison("all", "sp500", { base: "EUR" })', fxCtx('EUR'));
      return r.state === 'insufficient' && r.reason === 'quote_currency_mismatch'; })());
  ok('6.22d el resolutor de pares es POR DIRECCIÓN y sólo publica lo certificado',
    (() => { const c = cmpCtx({});
      const f = (a, b) => run('_aurixCmpFxFor(' + JSON.stringify(a) + ',' + JSON.stringify(b) + ')', c);
      return f('USD', 'USD').same === true
        && f('USD', 'EUR').symbol === 'EURUSD=X' && f('USD', 'EUR').invert === true
        && f('EUR', 'USD').symbol === 'EURUSD=X' && f('EUR', 'USD').invert === false
        && f('GBP', 'EUR') === null && f('USD', 'JPY') === null; })());
  // ── CHECKPOINT I.3 · EL SELECTOR ES DE AURIX ────────────────────────
  {
    const c = cmpCtx({ perf: PERF_OK });
    run('_intv14CmpSetState({ benchmarkId: "btc" })', c);
    const h = run('_intv14ComparatorHtml(_intccEsc, ' + JSON.stringify(
      { state: 'ready', mine: [{ ts: T_0, value: 100 }, { ts: T_0 + D1, value: 104 }],
        other: [{ ts: T_0, value: 100 }, { ts: T_0 + D1, value: 106 }], diffPp: -2,
        from: T_0, to: T_0 + D1, returnType: 'price_return' }) + ')', c);
    ok('I3.1 el `<select>` nativo YA NO existe en la superficie',
      !/<select/.test(h) && !/data-cmp-select/.test(h));
    ok('I3.2 es un combobox ARIA: disparador con estado y UN solo `listbox`',
      /role="combobox"/.test(h) && /aria-haspopup="listbox"/.test(h)
      && /aria-expanded="false"/.test(h) && /aria-controls="intv14-cmp-panel"/.test(h)
      && (h.match(/role="listbox"/g) || []).length === 1);
    ok('I3.3 tiene BUSCADOR, y busca por nombre Y por símbolo',
      /data-cmp-search/.test(h) && /type="search"/.test(h)
      && /data-name="[^"]+"/.test(h) && /data-sym="[^"]+"/.test(h)
      && /getAttribute\('data-name'\)/.test(app) && /getAttribute\('data-sym'\)/.test(app));
    ok('I3.4 las opciones vienen AGRUPADAS por naturaleza, en el orden declarado',
      (() => { const groups = (h.match(/class="intv14-cmp-optgroup">([^<]+)</g) || [])
          .map(x => x.replace(/.*>/, '').replace(/<$/, ''));
        const want = ['cmp_g_index', 'cmp_g_etf', 'cmp_g_stock', 'cmp_g_crypto', 'cmp_g_metal']
          .map(k => DICT.es[k]);
        const idx = want.map(w => groups.indexOf(w));
        return idx.every(i => i >= 0) && idx.every((v, i) => i === 0 || v > idx[i - 1]); })(),
      JSON.stringify((h.match(/class="intv14-cmp-optgroup">([^<]+)</g) || []).map(x => x.replace(/.*>/, ''))));
    ok('I3.5 el panel se cierra con Escape, con la ✕ y al pulsar FUERA',
      /e\.key === 'Escape'/.test(app) && /data-cmp-close/.test(h)
      && /!t\.closest\('\.intv14-cmp-pick'\)/.test(app));
    ok('I3.6 navegación por teclado completa, y el foco vuelve al disparador',
      (() => { const a = app;
        return /e\.key === 'ArrowDown'/.test(a) && /e\.key === 'ArrowUp'/.test(a)
          && /e\.key === 'Home'/.test(a) && /e\.key === 'End'/.test(a)
          && /e\.key === 'Enter'/.test(a)
          && /aria-activedescendant/.test(a)
          && /if \(focusBack\) tr\.focus\(\)/.test(a); })());
    ok('I3.7 la opción elegida no se distingue SÓLO por color',
      /\.intv14-cmp-opt\[aria-selected="true"\]::after \{ content: '✓'/.test(css));
    ok('I3.8b el área táctil de 44 px cubre TAMBIÉN 834 px y cualquier puntero grueso',
    (() => { const b = (css.split('@media (pointer: coarse), (max-width: 1023px)')[1] || '').slice(0, 500);
      return /button\.intv14-cmp-trigger, button\.intv14-cmp-clear \{ min-height: 44px; \}/.test(b)
        && /\.intv14-cmp-opt \{ min-height: 44px; \}/.test(b)
        && /input\.intv14-cmp-search \{ min-height: 44px; \}/.test(b); })());
  ok('I3.8c el patrón ARIA vive en el elemento ENFOCADO, no partido en dos',
    (() => { const a = app;
      return /<input type="search"[\s\S]{0,240}role="combobox"/.test(a)
        && /aria-controls="intv14-cmp-list"/.test(a)
        && /<ul class="intv14-cmp-list" id="intv14-cmp-list" role="listbox"/.test(a)
        && !/class="intv14-cmp-trigger"[\s\S]{0,160}role="combobox"/.test(a); })());
  ok('I3.8d el bloqueo de scroll NO puede sobrevivir a un repintado ajeno',
    /function _cmpSyncLock\(\)/.test(app)
    && /if \(!p \|\| p\.hidden\) document\.documentElement\.classList\.remove\('aurix-cmp-open'\)/.test(app)
    && /_cmpSyncLock\(\);/.test(app));
  ok('I3.8e sustituir la card NO pierde el foco: se restituye en el nodo equivalente',
    /const act = document\.activeElement;/.test(app)
    && /const back = next\.querySelector\(keep\)/.test(app));
  ok('I3.8 foco visible y área táctil de 44 px en los controles del selector',
      /button\.intv14-cmp-trigger:focus-visible/.test(css)
      && /input\.intv14-cmp-search:focus-visible/.test(css)
      && /button\.intv14-cmp-trigger, button\.intv14-cmp-clear \{ min-height: 44px; \}/.test(css)
      && /\.intv14-cmp-opt \{ min-height: 44px; \}/.test(css)
      && /button\.intv14-cmp-panel-x \{[^}]*min-height: 44px/.test(css.replace(/\n/g, ' ')));
    ok('I3.9 ESCRITORIO popover anclado; MÓVIL hoja inferior con safe-area y scroll propio',
      /\.intv14-cmp-panel \{[^}]*position: absolute[^}]*top: calc\(100% \+ 8px\)[^}]*right: 0/.test(css.replace(/\n/g, ' '))
      && /\.intv14-cmp-panel \{[^}]*position: fixed[^}]*inset: auto 0 0 0/.test(css.replace(/\n/g, ' '))
      && /env\(safe-area-inset-bottom/.test(css)
      && /\.intv14-cmp-list \{[^}]*overflow-y: auto/.test(css.replace(/\n/g, ' ')));
    ok('I3.10 el panel NO se sale del viewport',
      /width: min\(340px, calc\(100vw - 32px\)\)/.test(css));
    ok('I3.11 cerrar la hoja NO deja la página bloqueada',
      /html\.aurix-cmp-open, html\.aurix-cmp-open body \{ overflow: hidden; \}/.test(css)
      && /classList\.remove\('aurix-cmp-open'\)/.test(app)
      && /classList\.add\('aurix-cmp-open'\)/.test(app));
    ok('I3.12 respeta `prefers-reduced-motion`',
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.intv14-cmp-panel \{ animation: none/.test(css));
    ok('I3.13 NO abre un endpoint nuevo ni descarga el catálogo al abrirse',
      !/fetch\(/.test(fnSrc('_intv14ComparatorHtml'))
      && /_AURIX_CMP_CATALOG\.filter/.test(fnSrc('_intv14ComparatorHtml')));
  }
  ok('I3.14 los RECIENTES son comodidad y se VALIDAN contra el catálogo',
    (() => { const c = cmpCtx({});
      run('_aurixActiveUserId = "rec-user"', c);
      run('_aurixCmpPushRecent("btc")', c);
      run('_aurixCmpPushRecent("inventado")', c);       // no está en el catálogo
      run('_aurixCmpPushRecent("gold")', c);
      const r = run('_aurixCmpRecent()', c);
      return r.length === 2 && r[0] === 'gold' && r[1] === 'btc'
        && r.indexOf('inventado') === -1; })(),
    JSON.stringify((() => { const c = cmpCtx({}); run('_aurixActiveUserId = "rec-user2"', c);
      run('_aurixCmpPushRecent("btc")', c); run('_aurixCmpPushRecent("inventado")', c);
      return run('_aurixCmpRecent()', c); })()));
  ok('I3.15 …y NO son autoridad: un reciente no selecciona nada por sí solo',
    (() => { const c = cmpCtx({});
      run('_aurixActiveUserId = "rec-user3"', c);
      run('_aurixCmpPushRecent("btc")', c);
      return run('_intv14CmpState().benchmarkId', c) === null; })());
  // ── CHECKPOINT I.7 · TOOLTIP ─────────────────────────────────────────
  {
    const c = cmpCtx({ perf: PERF_OK });
    run('_intv14CmpSetState({ benchmarkId: "btc" })', c);
    const mine = [{ ts: T_0, value: 100 }, { ts: T_0 + D1, value: 104 }, { ts: T_0 + 2 * D1, value: 99.79 }];
    const oth  = [{ ts: T_0, value: 100 }, { ts: T_0 + D1, value: 103 }, { ts: T_0 + 2 * D1, value: 100.34 }];
    const svg = run('_intv14CmpSvg(' + JSON.stringify(mine) + ',' + JSON.stringify(oth) + ', {})', c);
    ok('I7.1 el SVG publica su GEOMETRÍA y sus series ALINEADAS por índice',
      (() => { const g = (svg.match(/data-cmp-geo="([^"]+)"/) || [, ''])[1];
        const p = (svg.match(/data-cmp-series="([^"]+)"/) || [, ''])[1];
        const un = (x) => JSON.parse(x.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
        const geo = un(g), pts = un(p);
        return Number.isFinite(geo.W) && Number.isFinite(geo.t0) && Number.isFinite(geo.hi)
          && pts.length === 3 && pts[1][0] === T_0 + D1
          // MISMO ÍNDICE ⇒ MISMO BUCKET: las dos cifras no pueden ser de fechas distintas.
          && pts.every((x) => x.length === 3); })(),
      (svg.match(/data-cmp-series="[^"]{0,90}/) || [''])[0]);
    ok('I7.2 dibuja guía vertical y DOS marcadores, ocultos hasta que se lee',
      /data-cmp-guide="1"[^>]*hidden/.test(svg)
      && /data-cmp-dot="mine"[^>]*hidden/.test(svg)
      && /data-cmp-dot="other"[^>]*hidden/.test(svg));
    ok('I7.3 el plot es FOCALIZABLE y aloja un tooltip con `aria-live`',
      (() => { const h = run('_intv14ComparatorHtml(_intccEsc, ' + JSON.stringify(
          { state: 'ready', mine, other: oth, diffPp: -0.55, from: T_0, to: T_0 + 2 * D1,
            returnType: 'price_return' }) + ')', c);
        return /data-cmp-plot="1"[^>]*tabindex="0"/.test(h)
          && /data-cmp-tip="1"[^>]*role="status"[^>]*aria-live="polite"/.test(h); })());
  }
  ok('I7.4 ratón, DEDO y teclado: los tres caminos existen',
    /addEventListener\('pointermove'/.test(app) && /addEventListener\('touchstart'/.test(app)
    && /e\.key === 'ArrowRight'/.test(app) && /e\.key === 'ArrowLeft'/.test(app)
    && /_tipHide\(\)/.test(app));
  ok('I7.5 el primer toque FIJA y un toque fuera lo retira',
    /_tipPinned = true;/.test(app)
    && /if \(!plot\) \{ if \(_tipPinned\) _tipHide\(\); return; \}/.test(app));
  ok('I7.6 un gesto VERTICAL no se captura: la página sigue desplazándose',
    /\.intv14-cmp-plot \{[^}]*touch-action: pan-y/.test(css.replace(/\n/g, ' '))
    && /\{ passive: true \}/.test(app));
  ok('I7.7 la DIFERENCIA va en puntos porcentuales y con signo, nunca en %',
    (() => { const es = DICT.es.cmp_tip_pp('0,55'), en = DICT.en.cmp_tip_pp('0.55');
      return /puntos porcentuales/.test(es) && !/%/.test(es)
        && /percentage points/.test(en) && !/%/.test(en)
        && /dpp > 0 \? '\+' : '−'/.test(app); })(),
    DICT.es.cmp_tip_pp('0,55'));
  ok('I7.8 las dos rentabilidades salen del MISMO índice del array alineado',
    (() => { const src0 = app.slice(app.indexOf('function _tipShow'), app.indexOf('function _tipFromClientX'));
      return /const \[ts, mv, ov\] = d\.pts\[idx\];/.test(src0)
        && !/d\.pts\[[^\]]*\+/.test(src0.replace('d.pts[idx]', '')); })());
  ok('I7.9 el tooltip se voltea en los extremos y no se sale',
    /tip\.classList\.toggle\('is-right', frac > 0\.5\)/.test(app)
    // El ancho es el que HACE que el volteo baste: anclado a la izquierda su
    // borde llega a `50% + ancho`, así que con 48 % el peor caso cabe.
    && /\.intv14-cmp-tip \{[\s\S]*?max-width: min\(240px, 48%\)/.test(css)
    && /\.intv14-cmp-tip\.is-right \{ transform: translateX\(-10px\); \}/.test(css));
  ok('I7.10 …y NO intercepta el puntero, así que no tapa el dato de forma permanente',
    /\.intv14-cmp-tip \{[^}]*pointer-events: none/.test(css.replace(/\n/g, ' '))
    && /\.intv14-cmp-guide \{[^}]*pointer-events: none/.test(css.replace(/\n/g, ' ')));
  ok('I7.11 el separador decimal lo pone el locale, sobre la MAGNITUD',
    /_intv4Num\(Math\.abs\(retOf\(v\)\), 2\)/.test(app));
  // ── RESIDUAL 1 · EL CERO NO TIENE SIGNO ─────────────────────────────
  {
    const c = cmpCtx({ perf: PERF_OK });
    run('_intv14CmpSetState({ benchmarkId: "btc" })', c);
    const tipOf = (mine1, other1) => {
      // Se ejecuta el MISMO camino del tooltip: se compone la fila de
      // diferencia con los valores que tendría en pantalla.
      const retOf = (v) => Math.round((v - 100) * 100) / 100;
      const dppRaw = retOf(mine1) - retOf(other1);
      const FLAT = run('_AURIX_CMP_FLAT_PP', c);
      const dpp = (Math.abs(dppRaw) < FLAT) ? 0 : dppRaw;
      return (dpp === 0)
        ? DICT.es.cmp_tip_pp(run('_intv4Num(0, 2)', c))
        : ((dpp > 0 ? '+' : '−') + DICT.es.cmp_tip_pp(
            run('_intv4Num(' + Math.abs(Math.round(dpp * 100) / 100) + ', 2)', c)));
    };
    ok('R1.1 POSITIVA · una diferencia real a favor se publica con «+»',
      tipOf(104, 101).indexOf('+3') === 0, tipOf(104, 101));
    ok('R1.2 NEGATIVA · una diferencia real en contra se publica con «−»',
      tipOf(101, 104).indexOf('−3') === 0, tipOf(101, 104));
    ok('R1.3 DENTRO DE TOLERANCIA · nunca «−0,00»: cero sin signo',
      (() => { const t1 = tipOf(100.001, 100.004);     // dpp negativo minúsculo
        const t2 = tipOf(100.004, 100.001);            // …y el positivo
        return t1 === t2 && !/^[+−]/.test(t1) && /^0/.test(t1)
          && !/−0/.test(t1) && !/\+0/.test(t1); })(),
      JSON.stringify([tipOf(100.001, 100.004), tipOf(100.004, 100.001)]));
    ok('R1.4 …y la normalización usa LA MISMA tolerancia que la frase de debajo',
      (() => { const src0 = app.slice(app.indexOf('const dppRaw = retOf(mv)'),
          app.indexOf('const dppRaw = retOf(mv)') + 420);
        return /Math\.abs\(dppRaw\) < _AURIX_CMP_FLAT_PP/.test(src0)
          && /dpp === 0/.test(src0); })());
  }
  // ── CHECKPOINT I.8 · SE PUEDE LEER LA ESCALA ────────────────────────
  {
    const c = cmpCtx({});
    const mine = [{ ts: T_0, value: 100 }, { ts: T_0 + D1, value: 104 }, { ts: T_0 + 2 * D1, value: 97.5 }];
    const ax = run('_intv14CmpAxisHtml(' + JSON.stringify(mine) + ', null, _intccEsc)', c);
    ok('I8.1 el gráfico publica etiquetas de escala: techo, suelo y el origen',
      // `_intv4Num` recorta los decimales que no aportan, así que el techo es
      // «+4 %» y no «+4,00 %»: se mide lo que de verdad publica.
      (() => { const n = (ax.match(/intv14-cmp-axis-t/g) || []).length;
        return n === 3 && /is-base/.test(ax)
          && /\+4 %/.test(ax) && /−2,5 %/.test(ax) && /\+0 %/.test(ax); })(),
      ax.replace(/<[^>]+>/g, '|').slice(0, 160));
    ok('I8.2 …tres y no más: informan sin saturar',
      (run('_intv14CmpAxisHtml(' + JSON.stringify(mine) + ', null, _intccEsc)', c)
        .match(/intv14-cmp-axis-t/g) || []).length <= 3);
    ok('I8.3 el origen NO se rotula si cae fuera de la banda visible',
      (() => { const far = [{ ts: T_0, value: 140 }, { ts: T_0 + D1, value: 150 }];
        const a2 = run('_intv14CmpAxisHtml(' + JSON.stringify(far) + ', null, _intccEsc)', c);
        return !/is-base/.test(a2) && (a2.match(/intv14-cmp-axis-t/g) || []).length === 2; })());
    ok('I8.4 van en HTML, no dentro del SVG estirado (la tipografía no se deforma)',
      /<div class="intv14-cmp-axis"/.test(ax)
      && !/<text/.test(run('_intv14CmpSvg(' + JSON.stringify(mine) + ', null, {})', c)));
    ok('I8.5 las dos series se distinguen por color Y por trazo, y la leyenda también',
      /\.intv14-cmp-line\.is-other \{[^}]*stroke-dasharray/.test(css.replace(/\n/g, ' '))
      && /\.intv14-cmp-key\.is-other \.intv14-cmp-swatch \{[^}]*border-top-style: dashed/.test(css.replace(/\n/g, ' ')));
  }
  // ── CHECKPOINT I.10 · ESTADOS ───────────────────────────────────────
  ok('I10.1 un fallo del PROVEEDOR no se disfraza de «datos insuficientes»',
    (() => { const c = cmpCtx({});
      const states = run('_AURIX_CMP_STATE', c);
      return states.PROVIDER_ERROR === 'provider_error'
        && run('_AURIX_CMP_PROVIDER_REASONS', c).indexOf('adapter_unavailable') !== -1
        && /no ha respondido/.test(DICT.es.cmp_provider_error)
        && /unaffected/.test(DICT.en.cmp_provider_error); })());
  okA('I10.2 …y se ALCANZA de verdad cuando el adaptador no está',
    (async () => { const c = cmpCtx({ perf: PERF_OK });
      run('window.AurixChartAdapters = null', c);
      const r = await run('_aurixComparison("all", "sp500", {})', c);
      return r.state === 'provider_error' && r.reason === 'adapter_unavailable'; })(),
    'sin adaptador');
  okA('I10.2b …y cuando el proveedor LANZA, también es un error suyo',
    (async () => { const c = cmpCtx({ perf: PERF_OK, providerThrows: '^GSPC',
        feed: { '^GSPC': { series: [] } } });
      const r = await run('_aurixComparison("all", "sp500", {})', c);
      return r.state === 'provider_error' && r.reason === 'benchmark_fetch_failed'; })(),
    'el adaptador lanzó');
  okA('I10.3 «respondió sin puntos» sigue siendo INSUFICIENCIA, no un error',
    (async () => { const c = cmpCtx({ perf: PERF_OK, feed: {} });
      const r = await run('_aurixComparison("all", "sp500", {})', c);
      return r.state === 'insufficient' && r.reason === 'benchmark_insufficient'; })());
  ok('I10.4 la HISTORIA COMÚN PARCIAL se declara como estado propio',
    (() => { const c = cmpCtx({ perf: PERF_OK });
      run('_intv14CmpSetState({ benchmarkId: "sp500" })', c);
      const h = run('_intv14ComparatorHtml(_intccEsc, ' + JSON.stringify(
        { state: 'ready', mine: [{ ts: T_0, value: 100 }, { ts: T_0 + D1, value: 104 }],
          other: [{ ts: T_0, value: 100 }, { ts: T_0 + D1, value: 106 }], diffPp: -2,
          from: T_0, to: T_0 + D1, availableFrom: T_0, returnType: 'price_return' }) + ')', c);
      return /data-partial="1"/.test(h); })());
  ok('I10.5 una petición obsoleta se CANCELA, no sólo se descarta',
    /if \(_cmpAbort\) _cmpAbort\.abort\(\)/.test(app)
    && /new AbortController\(\)/.test(app)
    && /signal: ctl \? ctl\.signal : undefined/.test(app)
    && /seq !== _cmpSeq/.test(app));
  ok('I10.6 cargando se DECLARA, y los controles no se apagan (son la salida del estado)',
    /host\.setAttribute\('aria-busy', 'true'\)/.test(app)
    && /\.intv14-cmp\[data-loading="1"\] \.intv14-cmp-controls \{ opacity: 1; \}/.test(css));
  // ── CHECKPOINT I.1 · EL ORDEN QUE FIJÓ EL FOUNDER, MEDIDO ───────────
  {
    // ESCRITORIO · Hero/Salud → Radar·Factores·Explora → Comparador → Hoy·Evolución → Cambios.
    const rowOf = (sel, ctxSel) => {
      const re = new RegExp((ctxSel || '') + '\\' + sel.replace('.', '.') + '\\s*\\{[^}]*grid-row:\\s*(\\d+)');
      const m = css.match(re); return m ? Number(m[1]) : null;
    };
    const wCmp = (sel) => { const m = css.match(new RegExp(
      '\\.aurix-intcc:has\\(\\.intv14-cmp\\) \\' + sel + '\\s*\\{[^}]*grid-row:\\s*(\\d+)'));
      return m ? Number(m[1]) : null; };
    ok('I1.1 ESCRITORIO · el comparador va tras Radar·Factores·Explora y ANTES de Hoy/Evolución',
      (() => { const cmp = wCmp('.intv14-cmp'), watch = wCmp('.intcc-watch'),
          tl = wCmp('.intcc-timeline'), chg = wCmp('.intv4-changed');
        const radar = rowOf('.intcc-radar');
        return radar === 2 && cmp === 3 && watch === 4 && tl === 4 && chg === 5; })(),
      JSON.stringify({ radar: rowOf('.intcc-radar'), cmp: wCmp('.intv14-cmp'),
        watch: wCmp('.intcc-watch'), tl: wCmp('.intcc-timeline'), chg: wCmp('.intv4-changed') }));
    ok('I1.2 …a ANCHO COMPLETO, en su propia fila',
      /\.aurix-intcc:has\(\.intv14-cmp\) \.intv14-cmp\s*\{ grid-column: 1 \/ 13;/.test(css));
    ok('I1.3 …y con pregunta Y comparador todo baja una fila, sin solaparse',
      (() => { const q = (sel) => { const m = css.match(new RegExp(
          '\\.aurix-intcc:has\\(\\.intv12-qcard\\):has\\(\\.intv14-cmp\\) \\' + sel + '\\s*\\{[^}]*grid-row:\\s*(\\d+)'));
          return m ? Number(m[1]) : null; };
        return q('.intv14-cmp') === 4 && q('.intcc-watch') === 5 && q('.intv4-changed') === 6; })());
    ok('I1.4 SIN comparador la rejilla es la de antes, byte por byte (`:has` condicionado)',
      /\.aurix-intcc:has\(\.intv14-cmp\)/.test(css)
      && /\.intcc-watch     \{ grid-column: 1 \/ 7;  grid-row: 3; \}/.test(css));
  }
  // ── CHECKPOINT I.6 · EL CONTRATO FINANCIERO, INTACTO ────────────────
  ok('I6.1 la serie propia sigue siendo el ÍNDICE flow-neutral base 100 del owner certificado',
    /_aurixInvestablePerformance\(/.test(fnSrc('_aurixComparison'))
    && /\.index/.test(fnSrc('_aurixComparison'))
    && !/_aurixTwrChain|Modified/.test(fnSrc('_aurixComparison')));
  ok('I6.2 ninguna cantidad monetaria absoluta se compara contra un precio',
    (() => { const src0 = fnSrc('_aurixComparison') + fnSrc('_intv14CmpSvg');
      return !/totUSD|investableValueUSD|formatCurrency/.test(src0); })());
  ok('I6.3 `pending` y `value_fallback` siguen siendo incompatibles con comparar',
    (() => { const src0 = fnSrc('_aurixComparison');
      return /perf && perf\.valid/.test(src0) || /!perf\.valid/.test(src0)
        || /fallbackReason/.test(src0); })());
  ok('I6.4 misma fecha inicial y final para las DOS series (las declara el owner)',
    /out\.availableFrom = /.test(fnSrc('_aurixComparison'))
    && /out\.endsBefore = /.test(fnSrc('_aurixComparison'))
    && /out\.from = al\.from; out\.to = al\.to;/.test(fnSrc('_aurixComparison').replace(/\s+/g, ' ')));
  ok('I6.5 el join sigue siendo AS-OF con tolerancia derivada, nunca bucket ciego',
    /toleranceMs/.test(fnSrc('_aurixCmpAlign'))
    && /_aurixCmpMedianStep/.test(fnSrc('_aurixCmpAlign')));
  ok('I6.6 NUNCA se interpola ni se arrastra un valor entre buckets',
    /NO interpola/.test(app) && !/interpolate|lerp/i.test(fnSrc('_aurixCmpBucketize')));
  ok('I6.7 usar el comparador NO cambia el patrimonio: no escribe en ningún owner',
    (() => { const src0 = fnSrc('_aurixComparison') + fnSrc('_intv14CmpSetState')
        + fnSrc('_aurixCmpPushRecent');
      return !/_aurixPersist|savePortfolio|holdings\s*=|assets\s*=|upsert|supabaseClient/.test(src0); })());
  // ── CHECKPOINT P · 15/16/17 · los tres casos del comparador ────────
    const MKT2 = (from, n, step, p0, drift) => { const out = [];
      for (let i = 0; i < n; i++) out.push({ time: from + i * step, value: p0 * (1 + drift * i) });
      return out; };
    okA('P.15 comparador con historia PARCIAL: se declara desde cuándo, sin inventar',
      (async () => { const c = cmpCtx({ perf: PERF_OK,
          feed: { '^GSPC': { series: MKT2(T_0 + 20 * D1, 20, D1, 5000, 0.001) } } });
        const r = await run('_aurixComparison("all", "sp500", {})', c);
        return r.state === 'ready' && Number.isFinite(r.availableFrom) && r.availableFrom > T_0; })(),
      'historia parcial');
    okA('P.16 proveedor SIN puntos: insuficiencia declarada y la serie propia SOBREVIVE',
      (async () => { const c = cmpCtx({ perf: PERF_OK, feed: {} });
        const r = await run('_aurixComparison("all", "sp500", {})', c);
        // La propia SOBREVIVE por el camino SÍNCRONO, que es el que pinta la
        // card: el asíncrono devuelve el estado, no una serie a medias.
        const sync = run('_aurixComparisonSync("all")', c);
        return r.state === 'insufficient' && r.other === null
          && Array.isArray(sync.mine) && sync.mine.length >= 2 && sync.other === null; })(),
      'sin puntos');
    okA('P.17 cambio RÁPIDO de activo y periodo: gana la última selección',
      (async () => { const c = cmpCtx({ perf: PERF_OK,
          feed: { '^GSPC': { series: MKT2(T_0, 40, D1, 5000, 0.001) },
                  'BTC-USD': { series: MKT2(T_0, 40, D1, 40000, 0.004) } } });
        // Se lanzan las dos sin esperar y se resuelven a la vez: la del
        // benchmark pedido en último lugar tiene que traer SU símbolo.
        const [, b] = await Promise.all([
          run('_aurixComparison("30d", "sp500", {})', c),
          run('_aurixComparison("all", "btc", {})', c)]);
        return b.symbol === 'BTC-USD' && b.range === 'all'; })(),
      'última selección');
  // ── REVISIÓN FINANCIERA · LOS CUATRO P1, REPRODUCIDOS ────────────────
  ok('RF.1 el limitador de Salud CONSERVA el decimal (no dice «2 de 2»)',
    (() => { const es = DICT.es.intcc_chip_limit_spread('1,98', 2);
      return /_intv4Num\(h\.effectiveN, 1\)/.test(fnSrc('_intccHealthLimiters'))
        && !/_aurixPctNum\(h\.effectiveN/.test(fnSrc('_intccHealthLimiters'))
        && /1,98/.test(es); })(),
    'antes `_aurixPctNum` ignoraba el 2º argumento y redondeaba a entero');
  ok('RF.2 la cobertura NO se afirma desde un campo inexistente',
    // SOBRE CÓDIGO, NO SOBRE PROSA: el comentario que explica el defecto cita
    // los nombres antiguos a propósito, y medir el fichero entero los
    // encontraría ahí.
    (() => { const src0 = fnSrc('_intv4AnswerHtml').replace(/^\s*\/\/.*$/gm, '');
      return !/core\.snapshot\.uncertifiablePositions/.test(src0)
        && !/avail\.uncertifiablePositions/.test(src0)
        && /_aurixHealthSnapshot\(\) \|\| \{\}\)\.uncertifiablePositions/.test(src0)
        // …y sin owner que lo sepa, NO se afirma totalidad.
        && /else if \(coverKnown\) out\.push\(_intv4T\('intv4_dq_cover_full'\)\)/.test(src0)
        && /const coverKnown = typeof _aurixHealthSnapshot === 'function'/.test(src0); })());
  ok('RF.3 «3M» se traduce al vocabulario del PROVEEDOR antes de pedirle nada',
    (() => { const c = cmpCtx({});
      return run('_aurixCmpProviderRange("90d")', c) === '3m'
        && run('_aurixCmpProviderRange("30d")', c) === '30d'
        && /range: _aurixCmpProviderRange\(range\)/.test(fnSrc('_aurixCmpBenchmarkSeries'))
        && /range: _aurixCmpProviderRange\(range\)/.test(fnSrc('_aurixCmpFxSeries')); })(),
    'el adaptador conoce `3m`, no `90d`');
  okA('RF.3b EJECUTADO · con «90d» el adaptador recibe «3m» y la comparación sale',
    (async () => { const c = cmpCtx({ perf: PERF_OK,
        feed: { '^GSPC': { series: MKT(T_0, 40, D1, 5000, 0.001) } } });
      // El doble de adaptador SÓLO responde a rangos que conoce, igual que el real.
      run('window.AurixChartAdapters.yahooHistoryAdapter = function (a) {'
        + ' __calls.push(a.symbol + "@" + a.range);'
        + ' if (["24h","7d","30d","3m","1y","all"].indexOf(a.range) === -1)'
        + '   return Promise.resolve({ series: [], meta: { currency: "USD", status: "bad-request" } });'
        + ' return Promise.resolve({ series: ' + JSON.stringify(MKT(T_0, 40, D1, 5000, 0.001))
        + ', meta: { currency: "USD", status: "ready" } }); }', c);
      const r = await run('_aurixComparison("90d", "sp500", {})', c);
      return r.state === 'ready' && run('__calls', c).some((x) => /@3m$/.test(x)); })(),
    'rango traducido');
  okA('RF.4 una divisa REPORTADA distinta de la declarada DETIENE, no convierte',
    (async () => { const c = cmpCtx({ perf: PERF_OK, base: 'EUR',
        feed: { '^GSPC': { series: MKT(T_0, 40, D1, 5000, 0.001), currency: 'EUR' },
                'EURUSD=X': { series: MKT(T_0, 40, D1, 1.05, 0.001) } } });
      const r = await run('_aurixComparison("all", "sp500", { base: "EUR" })', c);
      return r.state === 'insufficient' && r.reason === 'quote_currency_mismatch'; })(),
    'la divisa declarada manda sobre la que el adaptador rellena');
  ok('RF.5 el catálogo SÓLO ofrece lo que el histórico resuelve y cotiza en USD',
    (() => { const cat = run('_AURIX_CMP_CATALOG', cmpCtx({}));
      const syms = cat.map(b => b.symbol);
      return cat.every(b => String(b.quoteCcy || 'USD') === 'USD')
        // fuera los índices en otra divisa y el DAX, que es de rentabilidad TOTAL
        && ['^GDAXI', '^IBEX', '^FCHI', '^N225', '^FTSE', '^STOXX50E'].every(x => syms.indexOf(x) === -1)
        // fuera los UCITS de ticker desnudo, que el histórico no resuelve
        && ['IWDA', 'VWCE', 'EUNL', 'CSPX', 'SXR8'].every(x => syms.indexOf(x) === -1)
        // …y sigue habiendo catálogo de verdad, en las cinco categorías
        && cat.length >= 25
        && ['index', 'etf', 'stock', 'crypto', 'metal']
          .every(k => cat.some(b => b.kind === k)); })(),
    JSON.stringify({ n: run('_AURIX_CMP_CATALOG', cmpCtx({})).length }));
  okA('RF.6 un fallo del FX se declara del PROVEEDOR, no del historial del usuario',
    (async () => { const c = cmpCtx({ perf: PERF_OK, base: 'EUR',
        feed: { '^GSPC': { series: MKT(T_0, 40, D1, 5000, 0.001) } } });   // sin EURUSD
      const r = await run('_aurixComparison("all", "sp500", { base: "EUR" })', c);
      return r.state === 'provider_error' && r.reason === 'fx_insufficient'; })());
  // ── CIERRE 24H · LA CAPTURA DEL FOUNDER, REPRODUCIDA ────────────────
  // MEDIDO contra el proveedor desplegado el 2026-09-21:
  //   BTC-USD@24h → 198 pts, 00:00 → 16:24  (16,4 h: el DÍA NATURAL)
  //   ^GSPC@24h   →  36 pts, 13:30 → 16:24  ( 2,9 h: la SESIÓN de hoy)
  // El botón decía «24H» y la card declaraba «disponible desde el 21 sept»,
  // una fecha sin hora. La cartera, en esa ventana recortada, hizo ≈ 0
  // mientras su 24 h real era +2,78 %.
  {
    const HH = 3600e3, MM = 60e3;
    const AHORA = Date.UTC(2026, 8, 21, 16, 24);
    const MEDIANOCHE = Date.UTC(2026, 8, 21, 0, 0);
    const APERTURA = Date.UTC(2026, 8, 21, 13, 30);
    // Cartera: 97 snapshots cada 15 min cubriendo 24 h REALES, +2,78 % total,
    // y con TODA la subida antes de medianoche (plano a partir de ahí), que es
    // exactamente lo que la captura enseña.
    const cartera = (() => { const out = [];
      for (let t = AHORA - 24 * HH; t <= AHORA; t += 15 * MM) {
        const antesDeMedianoche = t < MEDIANOCHE;
        const frac = antesDeMedianoche ? (t - (AHORA - 24 * HH)) / (MEDIANOCHE - (AHORA - 24 * HH)) : 1;
        out.push({ time: t, value: 100 * (1 + 0.0278 * frac) });
      }
      return out; })();
    const provider = (from, n, drift, p0) => { const out = [], step = (AHORA - from) / (n - 1);
      for (let i = 0; i < n; i++) out.push({ time: Math.round(from + i * step), value: p0 * (1 + drift * (i / (n - 1))) });
      return out; };
    const ctx24 = (feed) => cmpCtx({
      perf: { valid: true, fallbackReason: null, index: { basis: 'flow_neutral_index', base: 100,
        intervals: cartera.length - 1, timestamps: cartera.map(p => p.time), values: cartera.map(p => p.value) } },
      feed });

    okA('C24.1 EL CASO · «24H» con bitcoin mide el DÍA NATURAL, y se declara con HORA',
      (async () => { const c = ctx24({ 'BTC-USD': { series: provider(MEDIANOCHE, 198, 0.0586, 60000) } });
        run('_intv14CmpSetState({ benchmarkId: "btc", range: "24h" })', c);
        const r = await run('_aurixComparison("24h", "btc", {})', c);
        if (r.state !== 'ready') return false;
        const h = run('_intv14ComparatorHtml(_intccEsc, ' + JSON.stringify(r) + ')', c);
        return r.windowPartial === true                       // no cubre las 24 h
          && r.coverage < 0.75 && r.coverage > 0.6            // ~16,4/24 = 0,68
          && r.withHour === true
          && /intv14-cmp-note is-window/.test(h)
          && /data-coverage="0\.6[0-9]*"/.test(h)
          // …y la nota lleva HORA en los DOS extremos, no una fecha suelta.
          && (h.match(/\d{1,2}:\d{2}/g) || []).length >= 2
          && h.indexOf('disponible desde') === -1; })(),
      'la ventana efectiva se declara');
    okA('C24.2 …y la cifra de la cartera es la de ESA ventana, no la de 24 h',
      (async () => { const c = ctx24({ 'BTC-USD': { series: provider(MEDIANOCHE, 198, 0.0586, 60000) } });
        const r = await run('_aurixComparison("24h", "btc", {})', c);
        const ret = (s) => (s[s.length - 1].value / s[0].value - 1) * 100;
        // La cartera subió ANTES de medianoche, así que en la ventana común
        // está plana: ése es el ≈ −0,01 % de la captura. Lo que cambia es que
        // ahora la card DICE sobre qué ventana lo mide.
        return Math.abs(ret(r.mine)) < 0.05 && Math.abs(ret(r.other) - 5.86) < 0.05; })(),
      'cifras de la captura');
    okA('C24.3 S&P 500 fuera de mercado: 2,9 h de sesión ⇒ se declara, no se etiqueta 24H',
      (async () => { const c = ctx24({ '^GSPC': { series: provider(APERTURA, 36, 0.004, 5000) } });
        run('_intv14CmpSetState({ benchmarkId: "sp500", range: "24h" })', c);
        const r = await run('_aurixComparison("24h", "sp500", {})', c);
        const h = run('_intv14ComparatorHtml(_intccEsc, ' + JSON.stringify(r) + ')', c);
        return r.state === 'ready' && r.windowPartial === true
          && r.coverage < 0.2                                  // 2,9/24 ≈ 0,12
          && /intv14-cmp-note is-window/.test(h); })(),
      'sesión de 3 h');
    okA('C24.4 DENSIDAD · una comparación de 3 puntos NO se dibuja, y se dice por qué',
      (async () => { const c = ctx24({ 'BTC-USD': { series: provider(AHORA - 2 * HH, 3, 0.01, 60000) } });
        const r = await run('_aurixComparison("24h", "btc", {})', c);
        const h = run('_intv14ComparatorHtml(_intccEsc, ' + JSON.stringify(r) + ')', c);
        return r.state === 'insufficient' && r.reason === 'too_few_common_points'
          && r.mine === null && r.other === null
          && h.indexOf(DICT.es.cmp_too_few) !== -1; })(),
      'densidad mínima');
    okA('C24.5 7D con cobertura casi completa NO se declara parcial (no se grita por nada)',
      (async () => { const c = cmpCtx({ perf: PERF_OK,
          feed: { 'BTC-USD': { series: MKT(T_0, 40, D1, 60000, 0.002) } } });
        const r = await run('_aurixComparison("all", "btc", {})', c);
        // 'all' no tiene nominal ⇒ nunca se declara parcial por cobertura.
        return r.state === 'ready' && r.coverage === null && r.windowPartial === false; })());
    okA('C24.6 30D · la ventana efectiva se declara SIN hora (no es intradía)',
      (async () => { const HHb = 3600e3;
        const fin = Date.UTC(2026, 8, 21, 16, 0), ini = fin - 30 * 24 * HHb;
        const mine30 = (() => { const out = [];
          for (let t = ini; t <= fin; t += 6 * HHb) out.push({ time: t, value: 100 * (1 + 0.05 * ((t - ini) / (fin - ini))) });
          return out; })();
        const c = cmpCtx({ perf: { valid: true, fallbackReason: null,
            index: { basis: 'flow_neutral_index', base: 100, intervals: mine30.length - 1,
              timestamps: mine30.map(p => p.time), values: mine30.map(p => p.value) } },
          feed: { 'BTC-USD': { series: (() => { const o = [], from = fin - 10 * 24 * HHb;
            for (let i = 0; i < 60; i++) o.push({ time: Math.round(from + i * (fin - from) / 59), value: 60000 * (1 + 0.03 * i / 59) });
            return o; })() } } });
        run('_intv14CmpSetState({ benchmarkId: "btc", range: "30d" })', c);
        const r = await run('_aurixComparison("30d", "btc", {})', c);
        const h = run('_intv14ComparatorHtml(_intccEsc, ' + JSON.stringify(r) + ')', c);
        return r.state === 'ready' && r.windowPartial === true && r.withHour === false
          && /intv14-cmp-note is-window/.test(h)
          && (h.match(/is-window[^<]*<\/p>|is-window">[^<]*/g) || []).join('').indexOf(':') === -1; })(),
      '30D sin hora');
  }
  ok('6.16 el comparador NO crea un segundo motor de rentabilidad',
    (() => { const src0 = fnSrc('_aurixComparison') + fnSrc('_aurixComparisonSync')
        + fnSrc('_aurixCmpAlign') + fnSrc('_aurixCmpBenchmarkSeries');
      return !/_aurixTwrChain|_aurixEligibleInvestableSeries|Modified|deltaPct/.test(src0); })());
}
console.log('\nDC · H · «qué ha cambiado» no repite y declara contra qué');
{
  // Casi todo lo que el checkpoint H pide ya estaba certificado (18.3 para la
  // card vacía, SC.6.x para la referencia, 1.1/8.11 para hero = detalle). Lo
  // que NO tenía gate propio es la regla de arbitraje: si un hecho es elegible
  // en dos superficies, UN owner decide UNA ubicación — no dos derivaciones.
  const surfaces = (h) => ({
    hoy: (h.match(/<section class="intcc-card intcc-watch[\s\S]*?<\/section>/) || [''])[0],
    cambios: (h.match(/<section[^>]*intv4-changed[\s\S]*?<\/section>/) || [''])[0],
    evol: (h.match(/<section class="intcc-card intcc-timeline[\s\S]*?<\/section>/) || [''])[0],
  });
  const keysIn = (frag) => (frag.match(/data-fact="([^"]+)"|data-semantic="([^"]+)"/g) || [])
    .map((m) => m.replace(/.*="|"$/g, ''));
  [['CUENTA_B', CUENTA_B], ['CUENTA_C', CUENTA_C]].forEach(([name, acc]) => {
    const h = render(acc).html;
    const s0 = surfaces(h);
    ok('H.1 ' + name + ' · ningún hecho ocupa «hoy» y «qué ha cambiado» a la vez',
      (() => { const a = new Set(keysIn(s0.hoy)), b = keysIn(s0.cambios);
        return b.every((k) => !a.has(k)); })(),
      JSON.stringify({ hoy: keysIn(s0.hoy), cambios: keysIn(s0.cambios) }));
    ok('H.2 ' + name + ' · …ni «qué ha cambiado» y «tu evolución»',
      (() => { const a = new Set(keysIn(s0.evol)), b = keysIn(s0.cambios);
        return b.every((k) => !a.has(k)); })(),
      JSON.stringify({ evol: keysIn(s0.evol), cambios: keysIn(s0.cambios) }));
  });
  ok('H.3 el arbitraje lo hace UN owner y viaja explícito, no se deduce dos veces',
    (() => { const r = fnSrc('_renderIntelligenceCommandCenter');
      return /const publishedKeys = \[\];/.test(r)
        && /_intv4MemoryHtml\(core, esc, publishedKeys,/.test(r)
        && /const memoryClaims = _intv4MemoryClaims\(core, publishedKeys\);/.test(r)
        && /_intv9DiscoveriesHtml\(intel, esc, mattersRoots\.concat\(skipRoots\), heroDiscId\)/.test(r); })());
  ok('H.4 «Entendido» y su persistencia siguen intactos',
    /data-intel-ack/.test(app) && /_aurixIntelAcknowledge/.test(app)
    && typeof DICT.es.intel_ack === 'string' && typeof DICT.en.intel_ack === 'string');
  // Una cuenta PLANA de verdad: sin flujos, sin snapshots y con el nivel
  // inmóvil. Con la serie creciente de CUENTA_B sí hay cambio material, así
  // que el assert medía una premisa falsa.
  const PLANA = Object.assign({}, CUENTA_B, { flows: [], serverRows: [],
    rows: inv([90000, 90000, 90000, 90000, 90000, 90000]) });
  ok('H.5 sin cambio material no se emite NI card NI línea',
    (() => { const h = render(PLANA).html;
      const c = (h.match(/<section[^>]*intv4-changed[\s\S]*?<\/section>/) || [''])[0];
      return c === '' && !/data-changed-state="rows"/.test(h); })(),
    (render(PLANA).html.match(/data-changed-state="[^"]*"/) || [''])[0]);
  ok('H.6 cada cambio declara CONTRA QUÉ compara, y la referencia sale de los datos',
    /_intv4ChangedRef/.test(app)
    && /rows/.test(fnSrc('_intv4ChangedRef'))
    && !/visit|visita/i.test(fnSrc('_intv4ChangedRef')));
}

console.log('\nDC · E · Explora pregunta lo que Aurix puede contestar');
{
  // La cobertura la publica el owner de Salud, así que el sandbox tiene que
  // tenerlo: sin él, `coverKnown` es false y la parte de cobertura se calla —
  // que es justo el fail-closed que RF.2 introduce.
  const ansOf = (q, core0, uncert) => { const c = makeCtx(CUENTA_B);
    run('_aurixHealthSnapshot = function () { return { uncertifiablePositions: '
      + (uncert || 0) + ' }; }', c);
    return run('_intv4AnswerHtml(' + JSON.stringify(q) + ', '
      + JSON.stringify(core0) + ', _intccEsc)', c); };
  const DQ = { id: 'q_data_quality', family: 'data_quality', answer: { factKeys: [] } };

  ok('E.1 la pregunta de calidad ya no es «¿qué puede saber Aurix de mí?»',
    (() => { const es = DICT.es.intv4_q_q_data_quality, en = DICT.en.intv4_q_q_data_quality;
      return /qué parte de mi patrimonio puede analizar aurix/i.test(es)
        && !/saber de mí|saber Aurix de mí/i.test(es)
        && /how much of my wealth can aurix analyse/i.test(en); })(),
    DICT.es.intv4_q_q_data_quality);
  ok('E.2 …y su respuesta tiene las CUATRO partes: cobertura, historia, qué puede y qué no',
    (() => { const h = ansOf(DQ, { dataAvailability: {
        uncertifiablePositions: 0,
        observation: { spanMs: 33 * 864e5, endAt: 1 },
        roots: ['top_position', 'cash_weight'],
        gaps: [{ semanticKey: 'per_asset_attribution' }] } });
      return h.indexOf(DICT.es.intv4_dq_cover_full) !== -1
        && h.indexOf(DICT.es.intv4_dq_history(33)) !== -1
        && h.indexOf(DICT.es.intv4_dq_can(DICT.es.intcc_dim_conc + ', ' + DICT.es.intcc_dim_liq)) !== -1
        && h.indexOf(DICT.es.intv4_dq_cannot_intro) !== -1
        && h.indexOf(DICT.es.intv4_gap_per_asset_attribution) !== -1; })(),
    ansOf(DQ, { dataAvailability: {
      observation: { spanMs: 33 * 864e5, endAt: 1 }, roots: ['top_position', 'cash_weight'],
      gaps: [{ semanticKey: 'per_asset_attribution' }] } }).slice(0, 400));
  ok('E.3 con posiciones NO valorables la cobertura lo dice, y no finge totalidad',
    (() => { const h = ansOf(DQ, { dataAvailability: {
        observation: { spanMs: 864e5, endAt: 1 }, roots: [], gaps: [] } }, 2);
      return h.indexOf(DICT.es.intv4_dq_cover_partial(2)) !== -1
        && h.indexOf(DICT.es.intv4_dq_cover_full) === -1; })());
  ok('E.4 sin historia certificada lo DECLARA en vez de callar esa parte',
    (() => { const h = ansOf(DQ, { dataAvailability: {
        observation: {}, roots: [], gaps: [] } });
      return h.indexOf(DICT.es.intv4_dq_history_none) !== -1; })());
  ok('E.5 las dimensiones legibles salen de las RAÍCES del ledger, no de un catálogo aspiracional',
    (() => { const src0 = fnSrc('_intv4AnswerHtml');
      return /avail\.roots \|\| \[\]/.test(src0)
        && /_AURIX_ROOT_READABLE\[r\]/.test(src0); })());

  // ── «¿CUÁNTO VALE?» — UNA CIFRA REPETIDA NO ES UNA RESPUESTA ─────────
  const CV = { id: 'q_current_value', family: 'wealth_level',
    answer: { factKeys: ['investable_level'] } };
  const coreCV = (endAt) => ({ dataAvailability: { observation: endAt ? { endAt } : {} },
    ledger: { facts: [{ semanticKey: 'investable_level', family: 'wealth_level',
      value: 93869, values: { usd: 93869 }, window: { range: 'now' } }] } });
  ok('E.6 la respuesta añade HASTA CUÁNDO está certificada la valoración',
    (() => { const h = ansOf(CV, coreCV(1750432000000));
      return h.indexOf(DICT.es.intv4_cv_asof(run('_intccDate(1750432000000)', makeCtx(CUENTA_B)))) !== -1; })(),
    ansOf(CV, coreCV(1750432000000)).slice(0, 300));
  ok('E.7 …y SIN esa referencia la pregunta no se publica (no repite una cifra a secas)',
    ansOf(CV, coreCV(null)) === '');

  // ── «FRENTE A SU PROPIA HISTORIA» EXIGE HISTORIA EN LA RESPUESTA ─────
  const HI = { id: 'q_historical', family: 'historical_behaviour',
    answer: { factKeys: ['investable_level', 'investable_all_time_high'] } };
  const coreHI = (withHigh) => ({ dataAvailability: { observation: { endAt: 1750432000000 } },
    ledger: { facts: [{ semanticKey: 'investable_level', family: 'wealth_level', value: 93869,
        values: { usd: 93869 }, window: { range: 'now' } }].concat(withHigh
      ? [{ semanticKey: 'investable_all_time_high', family: 'wealth_level', value: 93869,
          values: { usd: 93869 }, window: { range: 'all', startAt: 1750000000000, endAt: 1750432000000 } }]
      : []) } });
  ok('E.8 sin comparación histórica PUBLICABLE la pregunta histórica NO se publica',
    ansOf(HI, coreHI(false)) === '');
  ok('E.9 NO-VACUIDAD · con el máximo certificado SÍ responde, y con la comparación dentro',
    (() => { const h = ansOf(HI, coreHI(true));
      return h !== '' && (h.match(/<p>/g) || []).length >= 2; })(),
    ansOf(HI, coreHI(true)).slice(0, 300));
  ok('E.10 la pregunta sobre el origen del crecimiento sigue RETIRADA',
    !/q_capital_flows/.test(app));
  ok('E.11 el techo de Explora siguen siendo CUATRO',
    /const _INTV4_EXPLORE_MAX = 4;/.test(app));
  ok('E.12 la rotación es determinista POR CUENTA, no por dispositivo',
    /_aurixIntelOwner\(\{\}\)/.test(fnSrc('_intv4ExploreHtml'))
    && /_INTV4_EXPLORE_PERIOD_WEEKS/.test(fnSrc('_intv4ExploreRotation')));
}

console.log('\nDC · P · matriz de fixtures · 18 cuentas');
{
  // Las dieciocho que el checkpoint P enumera. Se reutiliza el sandbox de este
  // gate: montar uno nuevo sería un segundo motor de pruebas para medir lo
  // mismo. Cada caso afirma lo que ESA cuenta debe producir, no un genérico.
  const DAYD = 864e5;
  const ramp = (n, from, to) => { const out = [];
    for (let i = 0; i < n; i++) out.push({ ts: T0 + i * DAYD, total: from + (to - from) * (i / Math.max(1, n - 1)), real_estate: 0 });
    return out; };
  const flat = (n, v) => ramp(n, v, v);
  const base = (rows, extra) => Object.assign({ assets: B_ASSETS, snap: B_SNAP, rows, serverRows: [], flows: [] }, extra || {});
  const noKeys = (h) => !/\b(intv4_|intcc_|cmp_)[a-z0-9_]{3,}\b/.test(h.replace(/<[^>]+>/g, ' '))
    && !/undefined|NaN/.test(h.replace(/<[^>]+>/g, ' '));
  const F = [
    ['P.1  3 días de historia',            base(ramp(3, 90000, 92000))],
    ['P.2  33 días',                       base(ramp(33, 90000, 99000))],
    ['P.3  más de 1 año',                  base(ramp(400, 60000, 99000))],
    ['P.4  más de 2 años',                 base(ramp(800, 40000, 99000))],
    ['P.5  base USD',                      base(ramp(60, 90000, 99000), { baseCurrency: 'USD' })],
    ['P.6  base EUR',                      base(ramp(60, 90000, 99000), { baseCurrency: 'EUR' })],
    ['P.7  sin flujos',                    base(ramp(60, 90000, 99000), { flows: [] })],
    ['P.8  con aportaciones y retiradas',  base(ramp(60, 90000, 99000), { flows: [
        { id: 'in1', ts: T0 + 10 * DAYD, recordedAt: T0 + 10 * DAYD, amountUSD: 5000, kind: 'deposit', source: 'user' },
        { id: 'out1', ts: T0 + 20 * DAYD, recordedAt: T0 + 20 * DAYD, amountUSD: -2000, kind: 'withdrawal', source: 'user' }] })],
    ['P.9  fila LEGACY sin recorded_at',   base(ramp(60, 90000, 99000), { flows: [
        { id: 'lg', ts: T0 + 5 * DAYD, amountUSD: 3000, kind: 'deposit', source: 'user' }] })],
    ['P.10 una sola posición',             base(ramp(40, 90000, 95000), {
        snap: Object.assign({}, B_SNAP, { assetCount: 1, categoryCount: 1,
          topInvestedAsset: { name: 'BTC', ticker: 'BTC', type: 'crypto', pctTotal: 100 } }) })],
    ['P.11 varias categorías',             base(ramp(40, 90000, 95000), {
        snap: Object.assign({}, B_SNAP, { assetCount: 9, categoryCount: 5 }) })],
    ['P.12 historia insuficiente',         base(flat(1, 90000))],
    ['P.13 hidratación PENDIENTE',         base([], { snap: Object.assign({}, B_SNAP, { hydrationPending: true }) })],
    ['P.14 value_fallback',                base(ramp(40, 90000, 95000), {
        snap: Object.assign({}, B_SNAP, { uncertifiablePositions: 1 }) })],
    ['P.18 aislamiento · cuenta A',        base(ramp(40, 90000, 95000), { owner: 'P-a' })],
    ['P.18 aislamiento · cuenta B',        base(ramp(40, 70000, 71000), { owner: 'P-b' })],
  ];
  F.forEach(([name, fx]) => {
    let h = '', threw = '';
    try { h = render(fx).html; } catch (e) { threw = String(e && e.message || e); }
    ok(name + ' · pinta sin excepción y sin clave cruda',
      !threw && h.length > 0 && noKeys(h), threw || (h.replace(/<[^>]+>/g, ' ')
        .match(/\b(intv4_|cmp_)[a-z0-9_]{3,}\b|undefined|NaN/) || [''])[0]);
    ok(name + ' · Salud publica cifra o «sin datos», nunca un juicio en blanco',
      (() => { const m = h.match(/data-health-state="([^"]*)"/);
        return !!m && m[1].length > 0; })(),
      (h.match(/data-health-state="[^"]*"/) || [''])[0]);
    ok(name + ' · «Hoy» no publica nada fuera de la ventana de 72 h',
      (() => { const card = (h.match(/<section class="intcc-card intcc-watch[\s\S]*?<\/section>/) || [''])[0];
        // Si hay filas, todas tienen que declarar ventana; si no hay, la card
        // se encoge o declara su estado. Ninguna de las dos puede mentir.
        return /data-items="0"/.test(card) || /data-window="/.test(card) || card === ''; })());
  });
}

console.log('\nDC · K · responsive · 390 / 834 / 1440');
{
  // Lo que un gate estático PUEDE demostrar: que no existan anchos fijos que
  // provoquen desbordamiento, que las áreas táctiles lleguen a 44 px, que el
  // padding respete las áreas seguras y que nada se recorte por CSS. Lo que NO
  // puede —píxeles reales en tres viewports— lo mide la QA visual, y se declara
  // como tal en el informe en vez de fingir aquí que está cubierto.
  const mob = css.split('@media (max-width: 640px)').slice(1).join('\n');
  ok('K.1 nada del comparador fija un ancho en px que pueda desbordar 390',
    (() => { const seg = css.slice(css.indexOf('.intv14-cmp-pick'), css.indexOf('.intv14-cmp-legend'));
      const fixed = seg.match(/(?<!max-|min-)width:\s*(\d{3,})px/g) || [];
      return fixed.length === 0; })(),
    JSON.stringify((css.slice(css.indexOf('.intv14-cmp-pick'), css.indexOf('.intv14-cmp-legend'))
      .match(/width:\s*\d{3,}px/g) || [])));
  ok('K.2 en móvil TODO lo accionable del comparador llega a 44 px',
    /button\.intv14-cmp-range \{ min-height: 44px/.test(mob)
    && /button\.intv14-cmp-trigger, button\.intv14-cmp-clear \{ min-height: 44px; \}/.test(mob)
    && /\.intv14-cmp-opt \{ min-height: 44px; \}/.test(mob));
  ok('K.3 la hoja del selector respeta el área segura inferior',
    /padding: 12px 12px calc\(12px \+ env\(safe-area-inset-bottom, 0px\)\)/.test(mob));
  ok('K.4 el gráfico y el radar se adaptan sin ancho fijo',
    /\.intv14-cmp-svg \{ display: block; width: 100%;/.test(css)
    && /\.intv14-cmp-plot \{ width: 100%;/.test(css));
  ok('K.5 ninguna card de Intelligence introduce `overflow-x: scroll`',
    !/\.aurix-intcc[^{]*\{[^}]*overflow-x:\s*(scroll|auto)/.test(css.replace(/\n/g, ' ')));
  ok('K.6 el hero móvil crece con su contenido (sin alto fijo ni truncado)',
    (() => { const i = css.indexOf('--orb-c:');
      const b = css.slice(css.lastIndexOf('{', i), css.indexOf('}', i));
      return !/height:\s*\d/.test(b) && !/line-clamp/.test(mob.slice(0, 4000)); })());
  ok('K.7 TODA card nueva declara su `order` en ≤1023px, o se pinta antes del hero',
    // Hay VARIOS bloques `1023px` en la hoja; el que importa es el que
    // declara los `order` de Intelligence. Se busca en todos.
    (() => { const blocks = css.split('@media (max-width: 1023px)').slice(1);
      return blocks.some(b => /\.intv14-cmp\s*\{ order: \d+; \}/.test(b)
        && /\.intcc-watch\s*\{ order: \d+; \}/.test(b)); })(),
    JSON.stringify((css.match(/\.(intv14-cmp|intcc-watch|intcc-timeline)\s*\{ order: \d+; \}/g) || [])));
}

console.log('\nDC · L · coherencia entre dispositivos');
{
  // La regla es la del checkpoint: los ESTADOS LOCALES de interfaz pueden
  // diferir; la VERDAD FINANCIERA no. Así que se mide qué entra en cada cosa.
  ok('L.1 la verdad financiera NO depende de nada local: el Core no lee `localStorage`',
    (() => { const src0 = fnSrc('_aurixIntelligenceCore');
      return !/localStorage/.test(src0); })());
  ok('L.2 «Lo que importa hoy» se ancla a un RELOJ, no al historial local de presentación',
    (() => { const src0 = fnSrc('_intv5MattersStories');
      return /_aurixNow\(\)/.test(src0) && !/_intv4ReadShown/.test(src0); })());
  ok('L.3 la elegibilidad de preguntas sale del LEDGER, no del dispositivo',
    (() => { const src0 = fnSrc('_aurixContextualQuestions');
      return !/localStorage|navigator|window\./.test(src0); })());
  ok('L.4 la rotación de Explora es determinista POR CUENTA',
    /_aurixIntelOwner\(\{\}\)/.test(fnSrc('_intv4ExploreHtml')));
  ok('L.5 el comparador se habilita por ENTITLEMENT del usuario, así que viaja con la cuenta',
    /hasFeature\('intelligence\.comparator'\)/.test(fnSrc('_aurixCmpEnabled')));
  ok('L.6 …y su estado y sus recientes van SELLADOS por cuenta',
    /_aurixIntelReadOwned/.test(fnSrc('_intv14CmpState'))
    && /_aurixIntelReadOwned/.test(fnSrc('_aurixCmpRecent')));
  ok('L.7 el muestreo interno NUNCA se expone: cero contadores de observación en copy',
    (() => { const leak = ['intv4_memory_coverage', 'intv4_brief_stale', 'intel_sub_no_news']
        .map(k => String(typeof DICT.es[k] === 'function' ? DICT.es[k](33) : DICT.es[k]));
      return !leak.some(t => /observacion|snapshot|bucket|muestreo/i.test(t)); })(),
    JSON.stringify(['intv4_memory_coverage'].map(k => DICT.es[k](33))));
  // El aislamiento del comparador entre cuentas ya se ejecuta en §6 (6.9,
  // «el comparador de A no aparece en B»); aquí se mide lo que aquel no
  // cubre: que el sello por cuenta esté en el OWNER y no en el llamador.
  ok('L.8 el sello por cuenta vive en el owner del estado, no en quien lo usa',
    /_aurixIntelWriteOwned\(_AURIX_CMP_STATE_KEY/.test(app)
    && /_aurixIntelWriteOwned\(_AURIX_CMP_RECENT_KEY/.test(app));
}

console.log('\nDC · M · idiomas y accesibilidad');
{
  ok('M.1 TODA clave nueva de este cierre existe en los DOS idiomas',
    (() => { const keys = ['intcc_chip_limit_spread', 'intcc_chip_nodata', 'intv4_memory_coverage',
        'intv4_brief_stale', 'intv4_brief_stale_note', 'intv4_dq_cover_full', 'intv4_dq_cover_partial',
        'intv4_dq_history', 'intv4_dq_history_none', 'intv4_dq_can', 'intv4_dq_cannot_intro',
        'intv4_cv_asof', 'cmp_diff_more', 'cmp_diff_less', 'cmp_diff_flat',
        'cmp_disc_index', 'cmp_disc_equity', 'cmp_disc_price', 'cmp_pick_none', 'cmp_pick_search',
        'cmp_pick_close', 'cmp_pick_empty', 'cmp_pick_recent', 'cmp_pick_title',
        'cmp_g_index', 'cmp_g_etf', 'cmp_g_stock', 'cmp_g_crypto', 'cmp_g_metal',
        'cmp_kind_index', 'cmp_kind_etf', 'cmp_kind_stock', 'cmp_kind_crypto', 'cmp_kind_metal',
        'cmp_tip_mine', 'cmp_tip_diff', 'cmp_tip_pp', 'cmp_range_90d',
        'cmp_provider_error', 'cmp_loading'];
      const missing = keys.filter(k => DICT.es[k] === undefined || DICT.en[k] === undefined);
      return missing.length === 0; })(),
    JSON.stringify(['intcc_chip_limit_spread', 'cmp_tip_pp', 'cmp_range_90d']
      .filter(k => DICT.es[k] === undefined || DICT.en[k] === undefined)));
  ok('M.2 …y NINGUNA se queda con el texto del otro idioma',
    (() => { const pairs = [['cmp_pick_search', 'Buscar', 'Search'], ['cmp_g_stock', 'Acciones', 'Stocks'],
        ['cmp_provider_error', 'proveedor', 'provider'], ['cmp_pick_close', 'Cerrar', 'Close']];
      return pairs.every(([k, es, en]) => String(DICT.es[k]).indexOf(es) !== -1
        && String(DICT.en[k]).indexOf(en) !== -1); })());
  ok('M.3 ninguna clave cruda llega a la superficie en ninguno de los dos idiomas',
    (() => { const bad = /\b(intv4_|intcc_|cmp_|intel_)[a-z0-9_]{3,}\b/;
      return ['es', 'en'].every((lg) => {
        const h = render(Object.assign({}, CUENTA_B, { lang: lg })).html;
        const txt = h.replace(/<[^>]+>/g, ' ');
        return !bad.test(txt) && !/undefined|NaN/.test(txt); }); })(),
    JSON.stringify(['es', 'en'].map((lg) => (render(Object.assign({}, CUENTA_B, { lang: lg })).html
      .replace(/<[^>]+>/g, ' ').match(/\b(intv4_|cmp_)[a-z0-9_]{3,}\b/) || [''])[0])));
  ok('M.4 foco visible en TODO lo accionable que este cierre añade',
    /button\.intv14-cmp-trigger:focus-visible/.test(css)
    && /input\.intv14-cmp-search:focus-visible/.test(css)
    && /button\.intv14-cmp-panel-x:focus-visible/.test(css)
    && /\.intv14-cmp-plot:focus-visible/.test(css));
  ok('M.5 el selector, los periodos y el tooltip se manejan con teclado',
    (() => { const a = app;
      return /role="combobox"/.test(a) && /aria-activedescendant/.test(a)
        && /<button type="button" class="intv14-cmp-range/.test(a)
        && /data-cmp-plot="1" tabindex="0"/.test(a)
        && /e\.key === 'ArrowRight'/.test(a); })());
  ok('M.6 nada se distingue SÓLO por color',
    /\.intv14-cmp-line\.is-other \{[^}]*stroke-dasharray/.test(css.replace(/\n/g, ' '))
    && /\.intcc-chip\.is-limit::before\s*\{\s*content: '!'/.test(css)
    && /\.intcc-chip\.is-unknown::before\s*\{\s*content: '·'/.test(css)
    && /\.intv14-cmp-opt\[aria-selected="true"\]::after\s*\{\s*content: '✓'/.test(css));
  ok('M.7 `prefers-reduced-motion` cubre TODA animación nueva',
    (() => { const blocks = css.split('@media (prefers-reduced-motion: reduce)').slice(1).join(' ');
      return /\.intv14-cmp-panel \{ animation: none/.test(blocks); })());
  ok('M.8b la pista de teclado del gráfico está ENLAZADA, no sólo definida',
    /aria-describedby="intv14-cmp-hint"/.test(app)
    && /id="intv14-cmp-hint"/.test(app)
    && /\.intcc-sr-only \{/.test(css)
    && typeof DICT.es.cmp_tip_hint === 'string' && typeof DICT.en.cmp_tip_hint === 'string');
  ok('M.8 el tooltip se anuncia a un lector de pantalla',
    /data-cmp-tip="1" role="status" aria-live="polite"/.test(app));
  ok('M.9 el panel del selector es un `listbox` con nombre accesible',
    /role="listbox" data-cmp-list="1"\s*\n?\s*aria-label=/.test(app.replace(/\s+/g, ' ')
      .replace('role="listbox" data-cmp-list="1" aria-label=', 'role="listbox" data-cmp-list="1"\naria-label=')));
}

console.log('\nDC · C y D · el radar y los factores, preservados y verificados');
{
  // Los dos checkpoints dicen «preservar»: aquí no se cambia nada, se MIDE que
  // sigue en pie lo que ya estaba certificado, más lo que el cierre añade por
  // su nombre y no tenía assert propio.
  const hA = render(CUENTA_A).html, hB = render(CUENTA_B).html;

  // ── C · RADAR ───────────────────────────────────────────────────────
  ok('C.1 ningún segmento del radar se dibuja punteado ni «roto»',
    (() => { const seg = css.slice(css.indexOf('.intcc-radar-edge'), css.indexOf('.intcc-radar-edge') + 900);
      return !/stroke-dasharray/.test(seg)
        && !/stroke-dasharray/.test((hA.match(/class="intcc-radar-edge[^"]*"[^>]*/g) || []).join(' ')); })());
  // La clase EXACTA: `intcc-radar-dot` sin comilla de cierre también casa con
  // el grupo contenedor, y contarlo así devolvía seis.
  ok('C.2 cinco marcadores y cinco segmentos en las DOS cuentas de referencia',
    [hA, hB].every((h) => (h.match(/class="intcc-radar-dot"/g) || []).length === 5
      && /data-svg-edges="5"/.test(h)),
    JSON.stringify([hA, hB].map((h) => ({
      dots: (h.match(/class="intcc-radar-dot"/g) || []).length,
      edges: (h.match(/data-svg-edges="(\d+)"/) || [, '?'])[1] }))));
  ok('C.3 los cinco marcadores comparten radio, relleno y trazo (sin `is-unknown`)',
    (() => { const dots = (hA.match(/<circle class="intcc-radar-dot"[^>]*>/g) || []);
      const cls = dots.map((d) => (d.match(/class="([^"]+)"/) || [, ''])[1]);
      const r = dots.map((d) => (d.match(/ r="([^"]+)"/) || [, ''])[1]);
      return dots.length === 5 && new Set(cls).size === 1 && new Set(r).size === 1
        && !/is-unknown/.test(hA); })(),
    JSON.stringify((hA.match(/<circle class="intcc-radar-dot"[^>]*>/g) || []).map(
      (d) => (d.match(/class="([^"]+)"/) || [, ''])[1])));
  ok('C.4 un eje sin datos se declara SÓLO con texto, nunca con un porcentaje',
    (() => { const svg = (hA.match(/<svg class="intcc-radar-svg[\s\S]*?<\/svg>/) || [''])[0];
      const unk = (svg.match(/data-availability="unavailable"/g) || []).length;
      // Si hay ejes sin datos, ninguno de ellos puede llevar un `%` en su rótulo.
      const labels = (svg.match(/class="intcc-radar-val"[^>]*>([^<]*)</g) || []).map(x => x.replace(/.*>/, ''));
      return unk === 0 || labels.some((l) => l === DICT.es.intv7_axis_unavailable); })(),
    JSON.stringify((hA.match(/class="intcc-radar-val"[^>]*>([^<]*)</g) || []).map(x => x.replace(/.*>/, ''))));
  ok('C.5 el tamaño logrado no se reduce: el marco sigue entre el 50 % y el 58 % del viewBox',
    /11\.26 el marco exterior ocupa entre el 50 % y el 58 %/.test(s_self));

  // ── D · FACTORES ────────────────────────────────────────────────────
  ok('D.1 el titular coincide con el PUESTO 1 del ranking',
    (() => { const sec = section(hB, 'intcc-drivers');
      const lead = (sec.match(/class="intcc-drv-explain">([^<]*)</) || [, ''])[1];
      const first = (sec.match(/class="intcc-drv-name">([^<]*)/) || [, ''])[1];
      return !!lead && !!first && lead.indexOf(first) !== -1; })(),
    JSON.stringify({ lead: (section(hB, 'intcc-drivers').match(/class="intcc-drv-explain">([^<]*)</) || [, ''])[1],
      first: (section(hB, 'intcc-drivers').match(/class="intcc-drv-name">([^<]*)/) || [, ''])[1] }));
  ok('D.2 el ranking y los pesos salen del MISMO owner de exposición',
    /buildPortfolioDrivers\(snap\)/.test(fnSrc('_intv5DriversHtml'))
    && !/investableValueUSD|_aurixCategoryBucket/.test(fnSrc('_intv5DriversHtml')));
  ok('D.3 va de mayor a menor, sin empates mal resueltos',
    (() => { const sec = section(hB, 'intcc-drivers');
      // OJO: `data-pct-raw` contiene guiones, así que limpiar por caracteres
      // corrompía el número. Se extrae el grupo capturado.
      const raw = (sec.match(/data-pct-raw="([^"]*)"/g) || [])
        .map(x => Number((x.match(/="([^"]*)"/) || [, ''])[1]));
      if (raw.length < 2) return true;
      for (let i = 1; i < raw.length; i++) if (!(raw[i] <= raw[i - 1])) return false;
      return true; })(),
    JSON.stringify((section(hB, 'intcc-drivers').match(/data-pct-raw="[^"]*"/g) || [])));
  ok('D.4 la sección habla de PATRIMONIO y no mezcla perímetros sin declararlo',
    (() => { const sec = section(hB, 'intcc-drivers');
      return /patrimonio/i.test(sec) || /wealth/i.test(sec); })());
  ok('D.5 cero activos ficticios: cada fila sale de una posición del snapshot',
    (() => { const sec = section(hB, 'intcc-drivers');
      const names = (sec.match(/class="intcc-drv-name">([^<]*)/g) || []).map(x => x.replace(/.*>/, ''));
      const known = (CUENTA_B.snap.topInvestedAsset ? [CUENTA_B.snap.topInvestedAsset.name] : [])
        .concat(['Bitcoin', 'Ethereum', 'Euros', 'BTC', 'ETH', 'EUR', 'Apple', 'Microsoft', 'AAPL', 'MSFT']);
      return names.length > 0 && names.every((n) => known.some((k) => n.indexOf(k) !== -1)); })(),
    JSON.stringify((section(hB, 'intcc-drivers').match(/class="intcc-drv-name">([^<]*)/g) || [])
      .map(x => x.replace(/.*>/, ''))));
}

console.log('\nDC · J · cada limitación, junto a la afirmación que limita');
{
  const G = (k) => ({ dataAvailability: { gaps: [
    { semanticKey: k, status: 'not_yet_supported' }] } });
  const by = (k) => run('_aurixGapsBySurface(' + JSON.stringify(G(k)) + ')', makeCtx(CUENTA_B));
  ok('J.1 la atribución de rendimiento ACTUAL va a «Lo que importa hoy»',
    (() => { const r = by('per_asset_attribution');
      return r.today === DICT.es.intv4_gap_per_asset_attribution
        && !r.drivers && !r.evolution; })(),
    JSON.stringify(by('per_asset_attribution')));
  ok('J.2 …y la caída DEL PERIODO también',
    (() => { const r = by('position_period_decline'); return !!r.today && !r.drivers; })());
  ok('J.3 el resultado desde la COMPRA y el MÁXIMO por posición van a «Tu evolución»',
    (() => { const a = by('position_below_cost'), b = by('position_drawdown_from_peak');
      return !!a.evolution && !a.drivers && !a.today
        && !!b.evolution && !b.drivers && !b.today; })());
  ok('J.4 NINGUNA de las cinco cae en Factores: ninguna limita la exposición',
    (() => ['per_asset_attribution', 'position_period_decline', 'position_below_cost',
            'position_drawdown_from_peak', 'position_fx_attribution']
      .every((k) => by(k).drivers === ''))());
  ok('J.5 una clave SIN destino no se publica en ningún sitio (fail-closed)',
    (() => { const r = by('clave_que_no_existe');
      return !r.today && !r.evolution && !r.drivers; })());
  ok('J.6 …y el mapa es explícito, no una heurística sobre el nombre',
    (() => { const m = run('_AURIX_GAP_SURFACE', makeCtx(CUENTA_B));
      return Object.keys(m).length === 5
        && Object.values(m).every((v) => ['today', 'evolution', 'drivers'].indexOf(v) !== -1); })());
  ok('J.7 la limitación del COMPARADOR no pasa por este mapa: es naturaleza, no hueco',
    (() => { const m = run('_AURIX_GAP_SURFACE', makeCtx(CUENTA_B));
      return Object.values(m).indexOf('comparator') === -1
        && /_AURIX_CMP_DISCLOSURE\[bm\.kind\]/.test(fnSrc('_intv14ComparatorHtml')); })());
  ok('J.8 el pie publica SÓLO la advertencia de producto',
    (() => { const h = render(CUENTA_B).html;
      const d = (h.match(/<p class="intcc-disclaimer">[\s\S]*?<\/p>/) || [''])[0];
      return d.indexOf(DICT.es.intcc_disclaimer) !== -1
        && !/intv5-honesty/.test(h)
        && !/por posici/i.test(d); })());
  ok('J.9 y la frase reescrita ya no usa el nombre interno del owner',
    (() => { const es = DICT.es.intv4_gap_position_drawdown_from_peak;
      return !/máximo conservado/i.test(es) && /máximo de tu patrimonio/.test(es)
        && !/retained peak/i.test(DICT.en.intv4_gap_position_drawdown_from_peak); })(),
    DICT.es.intv4_gap_position_drawdown_from_peak);
  // NO-VACUIDAD · que el enrutado llegue de verdad al DOM de cada card.
  ok('J.10 la limitación de HOY se pinta dentro de la card de Hoy, no en otra',
    (() => { const c = makeCtx(CUENTA_B);
      const now = 1760000000000;
      run('_aurixNow = function () { return ' + now + '; };', c);
      // La historia tiene que RENDERIZAR de verdad: `_intv4StoryHtml` devuelve
      // '' sin copy, y entonces el assert pasaría por ausencia de card.
      const core0 = { topStories: [{ semanticKey: 'cash_drift_7d', causalRoot: 'cash_weight',
          priority: 5, window: { range: '7D', endAt: now - 3600e3 },
          values: { pct: 12, deltaPp: 3 } },
          { semanticKey: 'positions_registered_today', causalRoot: 'registered_operation',
            priority: 9, value: 2, window: { range: 'today', endAt: now - 3600e3 },
            values: { operations: 2, amountKind: null, grossUSD: null } }],
        ledger: { facts: [{ semanticKey: 'cash_drift_7d' }] },
        dataAvailability: { observation: { endAt: now - 3600e3 } } };
      const h = run('_intv5MattersHtml(' + JSON.stringify(core0)
        + ', _intccEsc, "standard", [], null, {}, ' + JSON.stringify('LIMITE-HOY') + ')', c);
      return /data-items="[1-9]/.test(h)
        && /intcc-surface-limit/.test(h) && h.indexOf('LIMITE-HOY') !== -1; })(),
    'la limitación de Hoy');
  ok('J.11 …y sin contenido que acotar, la limitación NO se pinta sola',
    (() => { const c = makeCtx(CUENTA_B);
      const now = 1760000000000;
      run('_aurixNow = function () { return ' + now + '; };', c);
      const vacio = { topStories: [], ledger: { facts: [] },
        dataAvailability: { observation: { endAt: now - 3600e3 } } };
      const h = run('_intv5MattersHtml(' + JSON.stringify(vacio)
        + ', _intccEsc, "standard", [], null, {}, ' + JSON.stringify('LIMITE-HOY') + ')', c);
      return h.indexOf('LIMITE-HOY') === -1; })());
}

console.log('\nDC · R2/R3 · residuales del cierre');
{
  // ── R2 · RECONOCER LO VIEJO NO PUEDE ENTERRAR LO NUEVO ───────────────
  // El veto se construía sobre `findingsAll` —el historial COMPLETO—, así que
  // una raíz acusada en el pasado quedaba vetada para siempre y un
  // acontecimiento nuevo y material de esa misma raíz no podía volver a
  // titular «Lo que importa hoy».
  const NOWR = 1760000000000, H = 3600e3;
  const ctxR = () => { const c = makeCtx(CUENTA_B);
    run('_aurixNow = function () { return ' + NOWR + '; };', c); return c; };
  // Dos acontecimientos DISTINTOS de la MISMA raíz, separados en el tiempo.
  // Se usa un hecho con copy certificada, o la card saldría vacía por otra
  // razón y el assert pasaría por ausencia de caso.
  const FACT = { semanticKey: 'positions_registered_today', causalRoot: 'registered_operation',
    priority: 9, value: 2, window: { range: 'today', endAt: NOWR - 2 * H },
    values: { operations: 2, amountKind: null, grossUSD: null } };
  const VIEJO = { findingId: 'f-viejo', semanticKey: 'positions_registered_today',
    rootCause: 'registered_operation', conceptId: 'op-viejo' };
  const NUEVO = { findingId: 'f-nuevo', semanticKey: 'positions_registered_today',
    rootCause: 'registered_operation', conceptId: 'op-nuevo' };
  const coreR = (activos) => ({
    topStories: [FACT],
    // El historial CONSERVA los dos; lo que cambia es cuál sigue ACTIVO.
    findingsAll: [VIEJO, NUEVO],
    findings: activos,
    ledger: { facts: [FACT] },
    dataAvailability: { observation: { endAt: NOWR - 2 * H, observations: 9 } },
  });
  const cardR = (activos) => run('_intv5MattersHtml(' + JSON.stringify(coreR(activos))
    + ', _intccEsc, "standard", [], null, {}, "")', ctxR());
  ok('R2.1 con el acontecimiento NUEVO activo, «hoy» cede la raíz al destino',
    /data-items="0"/.test(cardR([NUEVO])),
    (cardR([NUEVO]).match(/data-items="\d+"/) || [''])[0]);
  ok('R2.2 REGRESIÓN · acusado el VIEJO, el NUEVO vuelve a poder publicarse',
    (() => { const h = cardR([]);          // nada activo: sólo queda historial
      return /data-items="1"/.test(h); })(),
    (cardR([]).match(/data-items="\d+"/) || [''])[0]);
  ok('R2.3 el veto se construye sobre la REVISIÓN ACTUAL, no sobre el historial',
    (() => { const src0 = fnSrc('_intv5MattersHtml');
      return /_intv4FindingRows\(core\)/.test(src0)
        && !/findingsAll/.test(src0.replace(/^\s*\/\/.*$/gm, ''))
        // …y lo mismo para la decisión «titular = hecho o significado».
        && (src0.match(/_intv4FindingRows\(core\)/g) || []).length >= 2; })());
  ok('R2.4 …y un hallazgo SIN copy publicable ya no veta una raíz que no pinta',
    (() => { const src0 = fnSrc('_intv4FindingRows');
      // `_intv4FindingRows` filtra por `!!x.txt`, así que lo que veta es
      // exactamente lo que va a rendir fila.
      return /\.filter\(x => !!x\.txt\)/.test(src0); })());

  // ── R3 · UN RELOJ ATRASADO TAMBIÉN MIENTE ────────────────────────────
  const stale = (nowAt, endAt) => run('_aurixTodayDataStale('
    + JSON.stringify({ dataAvailability: { observation: { endAt } } }) + ', ' + nowAt + ')', ctxR());
  ok('R3.1 reloj ATRASADO respecto al último dato certificado ⇒ no se publica «hoy»',
    stale(NOWR - 48 * H, NOWR) === true);
  ok('R3.2 reloj correcto y dato fresco ⇒ sí se publica',
    stale(NOWR, NOWR - 2 * H) === false);
  ok('R3.3 reloj ADELANTADO más allá de la ventana ⇒ sigue sin publicarse',
    stale(NOWR + 100 * H, NOWR) === true);
  ok('R3.4 la referencia es la observación CERTIFICADA que ya teníamos, sin fuente nueva',
    (() => { const src0 = fnSrc('_aurixTodayDataStale');
      return /if \(nowAt < o\.endAt\) return true;/.test(src0)
        && /dataAvailability && core\.dataAvailability\.observation/.test(src0)
        && !/fetch|Date\.now|performance/.test(src0); })());
  ok('R3.5 …y NO se usa para medir la antigüedad: eso volvería a rebobinar «hoy»',
    /_aurixTodayFresh\(st, _nowAt\)/.test(fnSrc('_intv5MattersStories'))
    && !/o\.endAt/.test(fnSrc('_aurixTodayFresh')));
}

console.log('\nDC · F · «hoy» tiene un borde, y el borde es el PRESENTE');
{
  // ── POR QUÉ EL ANCLA NO PUEDE SER EL ÚLTIMO SNAPSHOT ─────────────────
  // Mi primera versión medía la antigüedad contra la última observación
  // certificada. Con una cuenta parada tres semanas, un flujo de hace veinte
  // días queda «a un día» de ese snapshot y se publica como actualidad: eso
  // es rebobinar «hoy» hasta donde convenga. La verdad financiera sigue
  // anclada a datos certificados; la ACTUALIDAD se mide contra un reloj.
  const HOUR = 3600e3, DAYMS = 864e5;
  const PRESENTE = 1760000000000;
  // El reloj se FIJA en el sandbox redefiniendo la costura. Producción sólo
  // tiene `Date.now()`: no se añade ninguna variable ni puerta trasera.
  const ctxAt = (now) => { const c = makeCtx(CUENTA_B);
    run('_aurixNow = function () { return ' + now + '; };', c); return c; };
  const coreOf = (obsAgeH, factAgeH) => ({
    topStories: [
      { semanticKey: 'recorded_capital_net', causalRoot: 'capital_flow', priority: 9,
        window: { range: '30D', endAt: PRESENTE - factAgeH * HOUR }, values: {} },
    ],
    ledger: { facts: [] },
    dataAvailability: { observation: { endAt: PRESENTE - obsAgeH * HOUR } },
  });
  const sel = (obsAgeH, factAgeH, now) => run('_intv5MattersStories('
    + JSON.stringify(coreOf(obsAgeH, factAgeH)) + ', [], null, {})', ctxAt(now == null ? PRESENTE : now));

  ok('F.1 la antigüedad se mide contra el PRESENTE, con un reloj inyectable',
    (() => { const c = ctxAt(PRESENTE);
      const f = (ageH) => run('_aurixTodayFresh({ window: { endAt: '
        + (PRESENTE - ageH * HOUR) + ' } }, _aurixNow())', c);
      return f(2) === true && f(72) === true && f(73) === false && f(24 * 40) === false; })());
  ok('F.2 un ESTADO sin fecha no lo filtra esta puerta (no tiene nada que comparar)',
    run('_aurixTodayFresh({ values: {} }, _aurixNow())', ctxAt(PRESENTE)) === true);
  ok('F.2b SIN serie todavía NO se afirma rancidez: no es viejo, es que no existe',
    (() => { const c = ctxAt(PRESENTE);
      return run('_aurixTodayDataStale({ dataAvailability: { observation: { observations: 0, endAt: null } } }, _aurixNow())', c) === false
        && run('_aurixTodayDataStale({}, _aurixNow())', c) === false; })());
  ok('F.3 SIN reloj no se afirma actualidad (fail-closed)',
    run('_aurixTodayFresh({ window: { endAt: 1 } }, null)', ctxAt(PRESENTE)) === false);
  ok('F.4 el owner NO usa el último snapshot como ancla de antigüedad',
    (() => { const src0 = fnSrc('_intv5MattersStories');
      return /_aurixTodayFresh\(st, _nowAt\)/.test(src0)
        && /const _nowAt = _aurixNow\(\);/.test(src0)
        && !/_todayAnchor/.test(src0); })());
  ok('F.5 las DOS ventanas están declaradas como constantes, no incrustadas',
    /const _AURIX_TODAY_MAX_AGE_MS = 72 \* 3600 \* 1000;/.test(app)
    && /const _AURIX_TODAY_STALE_MS = 72 \* 3600 \* 1000;/.test(app));

  // ── LA FIXTURE QUE EL FOUNDER PIDIÓ ──────────────────────────────────
  // Último snapshot ANTIGUO (21 días) y un flujo PEGADO a ese snapshot (a 12 h
  // de él) pero viejo respecto al presente. Con el ancla anterior habría
  // salido publicado como actualidad.
  ok('F.6 CUENTA PARADA · un hecho pegado al último snapshot pero VIEJO no se publica',
    (() => { const r = sel(21 * 24, 21 * 24 + 12);
      return r.stale === true && r.stories.length === 0; })(),
    JSON.stringify(sel(21 * 24, 21 * 24 + 12).stories.map((x) => x.semanticKey)));
  ok('F.6b …y un hecho fechado HOY sí sobrevive a una serie de valor rancia',
    (() => { const core0 = coreOf(21 * 24, 2);      // snapshot de hace 21 d, hecho de hace 2 h
      const r = run('_intv5MattersStories(' + JSON.stringify(core0) + ', [], null, {})', ctxAt(PRESENTE));
      return r.stale === true && r.stories.length === 1; })(),
    'el timestamp certificado del hecho manda sobre la edad de la serie');
  ok('F.6c …y entonces la card DECLARA que el valor no está al día',
    (() => { const h = run('_intv5MattersHtml(' + JSON.stringify(coreOf(21 * 24, 2))
        + ', _intccEsc, "standard", [], null, {})', ctxAt(PRESENTE));
      return /intv4-brief-stale-note/.test(h)
        && h.indexOf(DICT.es.intv4_brief_stale_note) !== -1; })());
  ok('F.7 …y la card lo DECLARA en vez de callar o rellenar con historia',
    (() => { const c = ctxAt(PRESENTE);
      const h = run('_intv5MattersHtml(' + JSON.stringify(coreOf(21 * 24, 21 * 24 + 12))
        + ', _intccEsc, "standard", [], null, {})', c);
      return /data-stale="1"/.test(h)
        && h.indexOf(DICT.es.intv4_brief_stale) !== -1
        && !/recorded_capital_net/.test(h); })());
  ok('F.8 NO-VACUIDAD · con datos frescos y hecho fresco, SÍ se publica',
    (() => { const r = sel(1, 2);
      return r.stale !== true && r.stories.length === 1
        && r.stories[0].semanticKey === 'recorded_capital_net'; })(),
    JSON.stringify(sel(1, 2).stories.map((x) => x.semanticKey)));
  ok('F.9 datos FRESCOS pero hecho VIEJO: la card vive, el hecho no entra',
    (() => { const r = sel(1, 24 * 40);
      return r.stale !== true && r.stories.length === 0; })());
  ok('F.10 la guardia de frescura es independiente del filtro por hecho',
    (() => { const src0 = fnSrc('_aurixTodayDataStale');
      return /_AURIX_TODAY_STALE_MS/.test(src0)
        && /return true;/.test(src0)            // fail-closed sin observación
        && !/_AURIX_TODAY_MAX_AGE_MS/.test(src0); })());
  ok('F.11 el techo siguen siendo TRES hechos',
    /const _INTV4_BRIEF_MAX = 3;/.test(app));
}

console.log('\nDC · A · hero · una sola referencia, y verificable');
{
  // El titular decía «desde tu última visita» y el subtítulo «con la última
  // revisión». Dos referencias para una afirmación, y ninguna medible.
  const heroKeys = ['intel_now_no_news','intel_sub_no_news','intel_now_reviewed',
                    'intel_sub_reviewed','intel_now_novelty'];
  ok('A.1 NINGUNA copy del hero invoca una «última visita» (ES y EN)',
    (() => heroKeys.every((k) => {
      const hits = app.match(new RegExp("^\\s*" + k + ":\\s*(.*)$", 'gm')) || [];
      return hits.length === 2 && !hits.some((h) => /última visita|last visit/i.test(h));
    }))(),
    JSON.stringify(heroKeys.map((k) => (app.match(new RegExp("^\\s*" + k + ":", 'gm')) || []).length)));
  ok('A.2 …y la rama MUERTA que la publicaba ya no existe',
    !/case 'stable_no_change':/.test(app)
    && !/intel_(now|sub)_stable_nc/.test(app));
  ok('A.3 el estado sigue reasignándose SIEMPRE, así que retirarla no abre un hueco',
    (() => { const b = blockOf("} else if (nowState === 'stable_no_change'", "let title, sub;");
      return /nowState = hasEvidence \? 'no_news' : 'insufficient_history';/.test(b); })());
  ok('A.4 el subtítulo nombra la base REAL de la comparación, no una visita ni una revisión',
    /intel_sub_no_news:\s*'Aurix ha comparado tu patrimonio con los datos certificados/.test(app)
    && !/intel_sub_no_news:.*última revisión/.test(app));
  ok('A.5 y no se cuela un contador interno en la frase',
    (() => { const hits = app.match(/^\s*intel_sub_no_news:\s*(.*)$/gm) || [];
      return hits.length === 2 && !hits.some((h) => /observacion|observation|snapshot|bucket|\d/.test(h)); })());
  // MÓVIL · sin «…». La explicación es la que sostiene el titular: cortarla a dos
  // líneas dejaba la referencia temporal fuera de pantalla justamente en el
  // viewport donde el founder la leyó.
  ok('A.6 el hero móvil NO trunca: sin line-clamp ni ellipsis en su explicación',
    (() => { const i = css.indexOf('.intcc-m-hero-hint {');
      const b = css.slice(i, css.indexOf('}', i));
      return i > 0 && !/line-clamp|text-overflow|-webkit-box/.test(b); })());
  ok('A.7 …y su altura la manda el contenido (la fila es flex, el orbe conserva su caja)',
    // Se ancla en `--orb-c`, que sólo declara la regla de layout del hero móvil:
    // buscar `.intcc-m-hero {` a secas caía en `.aurix-intv5 .intcc-m-hero {`,
    // que es otra regla y no dice nada del alto.
    (() => { const i = css.indexOf('--orb-c:');
      const b = css.slice(css.lastIndexOf('{', i), css.indexOf('}', i));
      return i > 0 && /display: flex/.test(b) && !/height:\s*\d/.test(b)
        && /align-items: center/.test(b); })());
}

function _AURIX_CMP_RANGES_OK(r) { return ['24h','7d','30d','1y','all'].indexOf(r) !== -1; }

(async () => { await drainAsserts();
console.log('\n' + (fail === 0 ? '✓ PASS' : '✗ FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
})();
