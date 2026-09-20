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
    'intel_now_material','intel_now_discovery','intel_now_changed','intel_now_stable_nc',
    'intel_now_stable','intel_now_history','intel_now_context',
    'intel_sub_material','intel_sub_changed','intel_sub_stable_nc','intel_sub_history',
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
  '_INTV4_DEPTH','_INTV4_DEFAULT_DEPTH','_INTV4_BRIEF_MAX','_INTV4_EXPLORE_MAX','_INTV4_MEMORY_MAX',
  '_INTV4_SHOWN_KEY','_AURIX_INTEL_HEALTH_POSITIVE','_AURIX_INTEL_DISC_MAX','_AURIX_INTEL_DIM_ROOT',
  '_AURIX_LOSS_TIER','_AURIX_LOSS_IMPACT_STRUCTURAL_SHARE','_INTV4_EXPLORE_PERIOD_WEEKS','_INTV4_PERIMETER','_INTV5_TIER'];
const FNS = ['_intv4ExploreRotation','_intv4ExploreSeed','_intv4Perimeter','_intv4ActiveReviewFindings','_intv5RecencyTier','_aurixLossImpactShare','_aurixLossSeverityTier','_aurixEpisodeOf','_aurixIntelResolveCertified','_aurixIntelAcknowledge','_aurixIntelCtxRecord','_aurixIntelReadOwned','_aurixIntelWriteOwned','_aurixIntelStore','_aurixIntelOwner','_aurixIntelCtxMerge','_aurixLoadCapitalFlowsRaw','_aurixLoadCapitalFlowsLive','_aurixFlowIsDerived','_aurixFlowDupKey','_aurixFlowUnpairableDerived','_aurixFlowDuplicateIds','_aurixFlowDuplicateReport','_aurixFlowIntentOf','_aurixEvidence','_aurixCashLedgerAuthority','_aurixRegisteredOperations','_aurixStrictInvestableBucket','_aurixRegisteredCategoryBreadth','_aurixEventIdentity','_aurixCanonicalFindings','_intv4FindingRows','_aurixLineageRead','_aurixClassificationValidity','_aurixAssetBucketById','toBase','formatCurrency','formatBase','_aurixUsableQuantity','_aurixCategoryBucket',
  'isClosedAsset','activeAssets','isInvestableAsset','investableAssets','investableValueUSD',
  'liquidityNominal','assetNativeValue','assetValueUSD','_aurixPointValuationIncomplete',
  '_aurixFlowIsInternal','_aurixLoadCapitalFlows','_aurixInvestableSnapshots',
  '_aurixEligibleInvestableSeries','_aurixTwrChain','_aurixFlowCounterpartObserved','_aurixInvestablePerformance','_aurixCatHistRows',
  '_aurixCatHistValidatePoint','_aurixCatExposurePct','_aurixCatHistWindow','_aurixCatExposureDelta',
  '_aurixFactClamp01','_aurixEffectiveDiversification','_aurixFactLedger','_aurixIntelligenceStories',
  '_aurixWowInsights','_aurixContextualQuestions','_aurixWhatChanged','_aurixFactPeriodNamedAs','_aurixFactPeriodDegraded','_aurixFactEnvelope','_aurixIntelligenceCore',
  '_aurixHealthScore','_intccScoreTone','_intccHealthScore','_intccClamp','_intccEsc','_intccDate',
  '_intccOrbHtml','_intv4T','_intv4Money','_intv4Num','_intv4RangeLabel','_intv4WindowLabel','_intv4CatLabel','_intv5CatLabel',
  '_intv4FactText','_intv4WhyText','_intv4WowText','_intv4StoryHtml','_intv4BriefHtml',
  '_intv4ChangedRef','_intv4ChangedHtml','_intv4DiscoveryHtml','_intv4ExploreHtml','_intv4AnswerHtml',
  // SPEC FINAL SURFACE — owners nuevos que el renderer llama: el puente
  // dimensión→raíz, la card de descubrimientos y el contexto declarado de la
  // Memoria. Sin ellos el render lanza y este gate se cae entero.
  '_aurixIntelRootsOf','_intv9DiscoveriesHtml','_intv4MemoryDeclared','_intv4MemoryRows','_intelDiscoveryText',
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
  
  '_intelCoherentState','_intv5MattersStories','_intv5Reading','_intv5Chips','_intv5StructureHtml','_intv5DriversHtml','_intv5MattersHtml','_intv7RadarAxes','_intv7PendingReasonKey','_intv7RadarHtml','_intccRadarSvg','_aurixPeakRetention','getInvestableDistribution','_aurixDisplayCategory',
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
  ok('8.7c la lista de Salud en móvil sólo puede contener confirmaciones verificadas',
    /goodChips = chips\.filter\(c => c && c\.tone !== 'context'\)/.test(fnSrc('_renderIntelligenceCommandCenter'))
    && /goodChips\.map\(c => `<li class="intcc-m-concl-row/.test(fnSrc('_renderIntelligenceCommandCenter')));
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
  ok('10.7 el acuse NO borra la fila del historial: cambia de estado',
    /rows\.map\(x => `/.test(fnSrc('_intv4ChangedHtml'))
    && /_intv4FindingRows\(core, \{ all: true \}\)/.test(fnSrc('_intv4ChangedHtml')));
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
  ok('14.8 …pero la ventana sigue DECLARADA para la QA y el gate',
    /data-window="/.test(render(CUENTA_C).html),
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
  ok('15.10 no se estampa la fecha de hoy sobre historia antigua',
    /r\.at \? `<span class="intcc-tl-date">/.test(fnSrc('_intv4MemoryHtml')));
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
  ok('SC.5.2 el techo son TRES hechos históricos certificados',
    /const _INTV4_MEMORY_MAX = 3;/.test(app));
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
  const cmpFns = ['_aurixCmpEnabled','_aurixCmpBenchmark','_aurixCmpMedianStep','_aurixCmpBucketize',
                  '_aurixCmpConvert',
                  '_aurixCmpAlign','_aurixComparisonSync','_intv14CmpState','_intv14CmpSetState',
                  '_intv14CmpSvg','_intv14ComparatorHtml','_intv4T','_intv4Num','_intccEsc','_intccDate',
                  '_aurixIntelReadOwned','_aurixIntelWriteOwned','_aurixIntelStore','_aurixIntelOwner'];
  const cmpAsync = ['_aurixCmpFxSeries','_aurixCmpBenchmarkSeries','_aurixComparison'];
  const cmpConsts = ['_AURIX_CMP_FLAG_KEY','_AURIX_CMP_CATALOG','_AURIX_CMP_FX_PAIR','_AURIX_CMP_STATE',
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
    // EL COMPARADOR SE PUBLICA APAGADO. El resto de este bloque mide qué hace
    // cuando está encendido, así que se le da el opt-in explícito — salvo
    // cuando el caso mide precisamente la puerta (`opt.noOptIn`).
    if (!opt.noOptIn) sb.__store['aurix_cmp_enabled_v1'] = '1';
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
          const f = (opt.feed || {})[args.symbol];
          if (!f) return Promise.resolve({ series: [], meta: { currency: 'USD', status: 'no_history' } });
          return Promise.resolve({ series: f.series, meta: { currency: f.currency || 'USD', status: 'ready' } });
        },
      },
    };
    if (opt.kill) sb.window.__AURIX_CMP_KILL = true;
    vm.runInContext('var window = globalThis.window;', sb);
    cmpConsts.forEach(n => vm.runInContext(konstSrc(n), sb));
    cmpFns.forEach(n => vm.runInContext(fnSrc(n), sb));
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
  ok('6.0a APAGADO POR DEFECTO: sin opt-in, el comparador no existe para nadie',
    run('_aurixCmpEnabled()', cmpCtx({ noOptIn: true })) === false);
  ok('6.0b …y un opt-in explícito lo enciende',
    run('_aurixCmpEnabled()', cmpCtx({})) === true);
  ok('6.0c el KILL SWITCH manda por encima del opt-in',
    run('_aurixCmpEnabled()', cmpCtx({ kill: true })) === false);
  ok('6.0d apagado ⇒ la superficie no se pinta y NO se publica ninguna serie',
    (() => { const c = cmpCtx({ noOptIn: true });
      return run('_intv14ComparatorHtml(_escapeWorkspaceText, null) === ""', c) === true
        && run('_aurixComparisonSync("all").reason', c) === 'flag_off'; })());
  ok('6.1 el catálogo es CERRADO y con identificadores autoritativos',
    (() => { const c = cmpCtx({});
      const cat = run('_AURIX_CMP_CATALOG', c);
      const bySym = cat.reduce((a, b) => (a[b.id] = b.symbol, a), {});
      return cat.length === 4
        && bySym.sp500 === '^GSPC' && bySym.ndx100 === '^NDX'
        && bySym.btc === 'BTC-USD' && bySym.gold === 'GC=F'; })(),
    JSON.stringify(run('_AURIX_CMP_CATALOG', cmpCtx({})).map(b => b.id + '=' + b.symbol)));
  // EL FOUNDER LO PIDIÓ POR SU NOMBRE: Nasdaq 100 es ^NDX. El registro de Market
  // sólo tenía el Composite (^IXIC), que es OTRO índice —3.000 valores frente a
  // 100— y su rentabilidad no es la misma.
  ok('6.1b Nasdaq 100 es ^NDX y NUNCA el Composite ^IXIC',
    (() => { const cat = run('_AURIX_CMP_CATALOG', cmpCtx({}));
      return cat.some(b => b.symbol === '^NDX')
        && !cat.some(b => b.symbol === '^IXIC')
        && !/\^IXIC/.test(konstSrc('_AURIX_CMP_CATALOG')); })());
  ok('6.1c el tipo de rentabilidad se DECLARA y no se mezcla (ninguno finge total return)',
    (() => { const cat = run('_AURIX_CMP_CATALOG', cmpCtx({}));
      return cat.every(b => b.returnType === 'price_return')
        && typeof DICT.es.cmp_price_return === 'string'
        && /dividendos/.test(DICT.es.cmp_price_return); })());
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
        && (h.match(/data-cmp-range="/g) || []).length === 5
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
      const behind = run('_intv14ComparatorHtml(_intccEsc, ' + JSON.stringify(mk(-12)) + ')', c);
      const ahead  = run('_intv14ComparatorHtml(_intccEsc, ' + JSON.stringify(mk(12)) + ')', c);
      return behind !== ahead
        && behind.indexOf(DICT.es.cmp_diff_behind(12)) !== -1
        && ahead.indexOf(DICT.es.cmp_diff_ahead(12)) !== -1
        && /data-diff-pp="-12"/.test(behind); })(),
    'frases de dirección');
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
  ok('6.16 el comparador NO crea un segundo motor de rentabilidad',
    (() => { const src0 = fnSrc('_aurixComparison') + fnSrc('_aurixComparisonSync')
        + fnSrc('_aurixCmpAlign') + fnSrc('_aurixCmpBenchmarkSeries');
      return !/_aurixTwrChain|_aurixEligibleInvestableSeries|Modified|deltaPct/.test(src0); })());
}
function _AURIX_CMP_RANGES_OK(r) { return ['24h','7d','30d','1y','all'].indexOf(r) !== -1; }

(async () => { await drainAsserts();
console.log('\n' + (fail === 0 ? '✓ PASS' : '✗ FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
})();
