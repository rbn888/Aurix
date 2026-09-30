'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-INTELLIGENCE-VNEXT-harness — SPEC «INTELLIGENCE VNEXT»
// ════════════════════════════════════════════════════════════════════════════
// Gate del SPEC VNEXT. Cubre, por su número de sección:
//
//   §6  · RADAR ADAPTATIVO — nunca «sin datos», nunca 0 falso, y «Factores
//         observables» cuando quedan menos de tres dimensiones certificadas.
//   §9  · EXPLORA contextual — el rótulo lleva la cifra de ESA cuenta, y sólo si
//         está certificada.
//   §10 · QUESTION ENGINE — responder abre un periodo de silencio; lo levanta un
//         cambio material y nada más. Cross-device por construcción.
//   §14–§16 · «TU EVOLUCIÓN» viva — la card de cobertura muerta se sustituye por
//         una lectura de estabilidad con explicación real, y sólo si se certifica.
//   §17 · VENTANAS ADAPTATIVAS — no se nombra un periodo que el historial no cubre.
//   §18 · «Puede que no hayas visto esto» no republica la magnitud del anillo.
//   §34 · la matriz de pruebas que el SPEC enumera, caso por caso.
//   §37 · ES + EN para toda copy nueva.
//
// QUÉ SE ESTUBEA Y POR QUÉ. Los OWNERS FINANCIEROS del radar
// (`_aurixHealthSnapshot`, `_aurixRegisteredCategoryBreadth`, `_aurixPeakRetention`)
// entran como dobles deterministas: lo que aquí se certifica es la ADAPTACIÓN de la
// card al número de dimensiones certificadas, no el cálculo de cada eje — eso lo
// ejecuta de verdad AURIX-INT-PREMIUM-EXPERIENCE (13B.11/13B.11b) sobre el owner
// real, y duplicarlo aquí sería el gate redundante que la política prohíbe.
// Lo que NO se estubea es nada de lo que este gate afirma: `_intccRadarSvg`,
// `_intv7RadarHtml`, `_intv15StableRows`, `_intv15MemoryIsStable`,
// `_intv15ExploreLabel`, `_aurixIntelQuestions`, `_intv4MemoryHtml` y
// `_intv4DiscoveryHtml` son el código de producción, ejecutado.
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
// Tolera la ALINEACIÓN del bloque de constantes (`const X   = …`): buscar
// `'const '+name+' ='` fallaba en las que llevan espacios de columna.
function konstSrc(name){ const m=new RegExp('\\nconst '+name+'\\s*=').exec(app);
  const i=m?m.index+1:-1; if(i<0) throw new Error('missing const '+name);
  let k=i, depth=0, started=false; for(;k<app.length;k++){ const c=app[k]; if(c==='('||c==='{'||c==='[') {depth++;started=true;} else if(c===')'||c==='}'||c===']') depth--; else if(c===';'&&(!started||depth===0)) { k++; break; } }
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c,info){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(info?'  ['+info+']':''));} }
const count = (s, re) => (String(s).match(re) || []).length;
const DAY = 864e5, T0 = 1750000000000;

// ── DICCIONARIOS REALES, los dos, extraídos de app.js ───────────────────────
// No es un stub de copy: son las cadenas que se despliegan. Un rótulo que falte en
// UNO de los dos idiomas produce texto vacío y los asserts de §37 lo ven.
function dictOf(langIdx) {
  // Cada clave aparece dos veces en app.js (ES primero, EN después) con la misma
  // indentación. Se toma la ocurrencia por índice de idioma, que es la técnica que
  // ya usan los gates de Intelligence: anclar por vecino encontraba el idioma
  // equivocado en silencio.
  const KEYS = ['intv16_axis_not_measured','intv18_health_measures','intv18_health_cause','intv18_health_cause_declared','intv7_axis_unavailable','intcc_radar_title',
    'intcc_dim_breadth','intcc_dim_liq','intcc_dim_conc','intcc_dim_stab','intcc_dim_growth',
    'intv7_pending_obs','intv7_pending_scale',
    // SPEC «Evolución real»: las claves de cobertura, límite y «ninguna comparación»
    // se retiraron; las que las sustituyen tienen que existir en los dos idiomas.
    'intv4_memory_title','intv4_memory_empty','intv16_stable_flows',
    'intv17_first_ref','intv17_head_both','intv17_head_liq','intv17_head_mix',
    'intv17_ev_liq','intv17_ev_mix','intv17_longer','intv17_in_today',
    'intv15_qc_concentration','intv15_qc_top3','intv15_qc_liq_dir','intv15_qc_liq_level',
    'intv15_qc_changed','intv15_qc_flows_vs_market',
    'intv16_ans_liq_lead','intv16_ans_liq_scope','intv16_ans_liq_coverage','intv16_ans_liq_limit',
    'intv16_ans_top3_lead','intv16_ans_top3_mean',
    'intv16_ans_conc_lead','intv16_ans_conc_mean','intv16_list_and',
    'intv16_health_scope','intv16_health_aria','intv17_health_metric',
    'intcc_chip_limit_spread','intcc_chip_ctx_intent',
    'intv4_q_q_concentration','intv4_q_q_liquidity','intv4_q_q_diversification',
    'intv4_q_q_what_changed','intv4_q_q_performance','intv4_q_q_current_value',
    'intv4_w_eff','intv4_w_capital','intv4_w_liqconc','intv4_discovery_title',
    'intcc_drivers_title','intcc_drv_explain_asset','intcc_drv_explain_cash',
    'intcc_drv_kind_eng','intcc_drv_kind_liq','intcc_drv_none',
    'intv15_drv_dependency','intv15_drv_category',
    'intv4_brief_title','intv4_brief_empty','intv4_brief_stale','intv4_brief_stale_note',
    'intv15_brief_settled'];
  const out = {};
  for (const k of KEYS) {
    const needle = '\n    ' + k + ':';
    const hits = []; let i = app.indexOf(needle);
    while (i >= 0) { hits.push(i); i = app.indexOf(needle, i + 1); }
    if (hits.length < 2) throw new Error('key not present in BOTH dictionaries: ' + k);
    // La línea se toma VERBATIM, con su coma y su comentario de cola si lo tiene:
    // reescribirla es como este gate se quedaría con una copia rancia de la copy.
    const start = hits[langIdx] + 1;                  // sin el salto de línea inicial
    const line = app.slice(start, app.indexOf('\n', start)).trim();
    if (!/,(\s*\/\/.*)?$/.test(line)) throw new Error('unexpected dictionary line for ' + k + ': ' + line);
    out[k] = line;
  }
  return out;
}
const SRC_ES = dictOf(0), SRC_EN = dictOf(1);
// El VALOR, para los asserts que comparan cadenas literales. Se evalúa en un
// sandbox propio para no arrastrar el comentario de cola.
function dictValues(src) {
  const box = {}; vm.createContext(box);
  vm.runInContext('globalThis.__V = {\n' + Object.keys(src).map(k => src[k]).join('\n') + '\n};', box);
  return vm.runInContext('__V', box);
}
const VAL_ES = dictValues(SRC_ES);

function makeCtx(lang) {
  const sb = { Math, Number, JSON, Array, String, Object, Set, Map, Date, isFinite, Intl,
    console: { warn(){}, log(){}, debug(){} }, window: {} };
  vm.createContext(sb);
  const src = (lang === 'en') ? SRC_EN : SRC_ES;
  vm.runInContext('const __T = {\n' + Object.keys(src).map(k => src[k]).join('\n') + '\n};', sb);
  vm.runInContext('function t(k){ return __T[k]; }', sb);
  vm.runInContext('function _intv4T(k){ const v = __T[k];'
    + ' return (typeof v === "function") ? v.apply(null, [].slice.call(arguments, 1)) : v; }', sb);
  sb.lang = lang || 'es';
  ['_AURIX_CAUSAL_ROOT','_AURIX_FACT_FAMILY','_AURIX_TODAY_HISTORICAL_RANGES','_AURIX_TODAY_MAX_AGE_MS',
   '_AURIX_FACT_STATUS','_AURIX_FACT_MATERIAL','_AURIX_AI_AVAIL','_AURIX_AI_DIM',
   '_AURIX_AI_LABEL','_AURIX_INTEL_FIELDS','_AURIX_INTEL_PROVENANCE',
   '_AURIX_INTEL_QUESTION_LIMIT','_AURIX_INTEL_Q_AFTER_ANSWER_MS','_AURIX_INTEL_Q_COOLDOWN_MS',
   '_AURIX_INTEL_Q_DECLINED_MS','_AURIX_INTEL_PAUSE_MS','_INTV4_MEMORY_MAX',
   '_INTV4_MEMORY_WINDOW_ORDER','_INTV7_RADAR_DIMS','_AURIX_INTEL_EXCLUSIVE_CLAIMS']
    .forEach(n => vm.runInContext(konstSrc(n), sb));
  ['_intccClamp','_intccEsc','_aurixPctNum','_aurixPctLabel','_intv4Num','_intv4Money',
   '_intccRadarSvg','_intv7PendingReasonKey','_intccHealthExplainHtml','_intv7RadarAxes','_intv7RadarHtml',
   '_intv15StableRows','_intv15MemoryIsStable','_intv15ExploreLabel',
   '_intv16EvidenceDays','_intv16StabilityByRoot','_intv17Evolution','_intv17EvId','_intv17HoyEvents','_intv17IsHoyEvent','_intv16StableDays','_intv16EvDates','_intv16StableWindow',
   '_intv4MemoryEvents','_intv4MemoryDeclared','_intv4MemoryDiversify','_intv4MemoryRows',
   '_intv4MemoryHtml','_intv4WowText','_intv4DiscoveryHtml','_aurixIntelQuestions',
   '_intccIsMonetary','_intccPctLabel','_intv5DriversHtml','_intv5MattersHtml','_intv5Chips',
   '_intccScoreRingHtml','_aurixIntelReadOwned','_aurixIntelWriteOwned','_aurixIntelStore',
   '_aurixIntelOwner','_aurixIntelCtxMerge','_aurixIntelContext','_aurixIntelRecordAnswer',
   '_aurixIntelPauseQuestions',
   '_aurixIntelDecline','_aurixIntelCtxReadPolicy','_aurixIntelCtxRecord',
   '_aurixListJoin','_intv16AnswerLead','_intv16NormTxt','_intv16AnswerIsTautology',
   '_intv16ReadableDims','_intv4AnswerHtml','_aurixTodayEventAt','_aurixTodayIsRecentClaim','_aurixTodayDatedAt',
   '_aurixTodayFresh']
    .forEach(n => vm.runInContext(fnSrc(n), sb));
  // La COPY de los hechos es otra capa y tiene su propio gate: aquí sólo hace
  // falta que un evento temporal produzca texto para que el pool no esté vacío.
  sb._intv4FactText = () => 'hecho con texto';
  sb._intv4WhyText = () => '';
  // §8/§12 — los owners de SELECCIÓN tienen su propio gate (el ranking real lo
  // ejecuta AURIX-ADVANCED-INTELLIGENCE-CLOSURE). Aquí entran como dobles para
  // poder ejercitar lo que VNEXT añade: las dos líneas interpretativas de Factores
  // y el discriminador del estado vacío de «Lo que importa hoy».
  sb.__drivers = { items: [], pct: 0, topCategory: null };
  sb.buildPortfolioDrivers = () => sb.__drivers;
  sb.__matters = { stories: [], rankedBy: 'engine', stale: false };
  sb._intv5MattersStories = () => sb.__matters;
  sb._intv4FindingRows = () => [];
  sb._intv4StoryHtml = () => '<div class="intv4-story"></div>';
  // Fecha DEPENDIENTE del instante: con un stub constante los dos extremos de la
  // ventana salían iguales y los asserts de «de fecha a fecha» no medían nada.
  sb._intccDate = (ts) => 'D' + Math.round(Number(ts) / 864e5);
  sb._intv4RangeLabel = () => '30 d';
  sb._aurixFactPeriodNamedAs = () => '30d';
  sb._aurixFactPeriodDegraded = () => false;
  sb.formatBase = v => String(v);
  // Owners financieros del radar: dobles deterministas (ver cabecera).
  sb.__snap = null; sb.__breadth = null; sb.__peak = null;
  sb._aurixHealthSnapshot = () => sb.__snap;
  sb._aurixEffectiveDiversification = () => null;
  sb._aurixRegisteredCategoryBreadth = () => sb.__breadth;
  sb._aurixPeakRetention = () => sb.__peak;
  return sb;
}
const sb = makeCtx('es');
const run = (expr, ctx) => vm.runInContext(expr, ctx || sb);

// Dimensiones para `_intccRadarSvg`: el catálogo real, con las que se declaran
// no disponibles marcadas como tal — exactamente lo que `_intv7RadarAxes` emite.
const LABELS = { diversification: 'Amplitud de categorías', stability: 'Estabilidad',
  liquidity: 'Liquidez', growth: 'Crecimiento', concentration: 'Concentración' };
const ORDER = ['diversification', 'stability', 'liquidity', 'growth', 'concentration'];
const DIMS = (unavailable, display) => ORDER.map(k => ({ key: k, label: LABELS[k], suffix: '%',
  unavailable: (unavailable || []).indexOf(k) !== -1,
  display: (display && display[k] != null) ? display[k] : null }));
const RADAR = (values, unavailable, display) =>
  run('_intccRadarSvg(' + JSON.stringify(values) + ', ' + JSON.stringify(DIMS(unavailable, display)) + ')');

console.log('AURIX-INTELLIGENCE-VNEXT — SPEC «INTELLIGENCE VNEXT» + CIERRE CORRECTIVO\n');

// ════════════════════════════════════════════════════════════════════════════
// §2 (CIERRE CORRECTIVO) · RADAR: CINCO EJES PERMANENTES
// ════════════════════════════════════════════════════════════════════════════
// SUSTITUYE al radar adaptativo de VNext, por decisión expresa del founder. La
// regla que gobierna todo el bloque: ESTRUCTURA ≠ EVIDENCIA. El marco (cinco
// ejes, sus ángulos, sus nombres) es una CONSTANTE del producto; la evidencia
// decide únicamente qué se dibuja encima.
console.log('§2 · Radar: cinco ejes permanentes, evidencia variable:');
{
  const CASES = [
    { m: 5, values: { diversification: 30, stability: 80, liquidity: 7, growth: 40, concentration: 31 }, unav: [] },
    { m: 4, values: { diversification: 30, stability: 80, liquidity: 7, concentration: 31 }, unav: ['growth'] },
    { m: 3, values: { diversification: 30, liquidity: 7, concentration: 31 }, unav: ['stability', 'growth'] },
    { m: 2, values: { diversification: 30, liquidity: 7 }, unav: ['stability', 'growth', 'concentration'] },
    { m: 1, values: { liquidity: 7 }, unav: ['diversification', 'stability', 'growth', 'concentration'] },
    { m: 0, values: {}, unav: ORDER.slice() },
  ];
  CASES.forEach((c) => {
    const h = RADAR(c.values, c.unav);
    ok('2.1/' + c.m + ' con ' + c.m + ' métricas el MARCO sigue siendo cinco ejes y cinco nombres',
      h !== ''
      && count(h, /class="intcc-radar-axis[" ]/g) === 5
      && count(h, /class="intcc-radar-label"/g) === 5
      && /data-svg-axes="5"/.test(h) && /data-svg-a11y-axes="5"/.test(h)
      && ORDER.every(k => h.indexOf(LABELS[k]) !== -1),
      JSON.stringify({ axes: count(h, /class="intcc-radar-axis[" ]/g),
        labels: count(h, /class="intcc-radar-label"/g) }));
    // CONTRATO SUSTITUIDO (2 veces) · EL RADAR ES UNA SÍNTESIS, NO UNA TABLA.
    // (1) Marcador por eje certificado daba, con tres de cinco, TRES PUNTOS Y UN
    // SEGMENTO SUELTO: el gráfico roto de las capturas de producción. (2) «La
    // figura es todo o nada» lo arregló dejando la card VACÍA, que se lee igual
    // de rota. (3) Definitivo: la figura se cierra SIEMPRE sobre los cinco con
    // un valor visual auxiliar —neutro, determinista y confinado al SVG— y
    // NINGÚN eje publica cifra, así que no hay nada que leer como medición.
    // Lo certificado se sigue contando, y se audita en `data-svg-certified`.
    ok('2.2/' + c.m + ' …cinco marcadores SIEMPRE, cero cifras SIEMPRE',
      (() => count(h, /class="intcc-radar-dot"/g) === 5
          && count(h, /class="intcc-radar-halo"/g) === 5
          && count(h, /class="intcc-radar-val"/g) === 0
          && /data-svg-measured="5"/.test(h)
          && new RegExp('data-svg-certified="' + c.m + '"').test(h)
          && count(h, /data-availability="unknown"/g) === 0)(),
      JSON.stringify({ dots: count(h, /class="intcc-radar-dot"/g),
        vals: count(h, /class="intcc-radar-val"/g),
        cert: (h.match(/data-svg-certified="[^"]*"/) || [''])[0] }));
    ok('2.3/' + c.m + ' …sin «sin datos», sin cero fingido y sin eje atenuado',
      !/is-unavailable/.test(h) && !/is-unknown/.test(h)
      && h.indexOf(VAL_ES.intv7_axis_unavailable) === -1
      // toda cifra publicada corresponde a un valor de entrada
      && (h.match(/class="intcc-radar-val"[^>]*>([^<]*)</g) || []).every(x => /\d/.test(x)));
    ok('2.4/' + c.m + ' …el ciclo se cierra: cinco aristas, cero huecos, relleno presente',
      (() => { const e = Number((h.match(/data-svg-edges="(\d+)"/) || [, 0])[1]);
        const g = Number((h.match(/data-svg-gaps="(\d+)"/) || [, 0])[1]);
        return e === 5 && g === 0 && /data-svg-open="0"/.test(h)
          && /intcc-radar-area/.test(h)
          && count(h, /class="intcc-radar-edge"/g) === 5; })(),
      JSON.stringify({ edges: (h.match(/data-svg-edges="[^"]*"/) || [''])[0],
        gaps: (h.match(/data-svg-gaps="[^"]*"/) || [''])[0] }));
    // ── REMATE §4 · EL TEXTO SALE DEL SVG ────────────────────────────────
    // Dentro del viewBox el texto se escala con la figura: 9,5 px declarados se
    // pintaban a 7–9,7 px en un teléfono, por debajo del suelo de 11. No era un
    // ajuste pendiente sino un punto fijo —subir el tipo ensancha el texto,
    // ensancha el marco, encoge la escala—, así que los rótulos pasan a ser una
    // LEYENDA HTML. Lo que se mide aquí ya no es contención de `<text>`: es que
    // no quede texto dentro y que la leyenda enumere los cinco.
    ok('2.5/' + c.m + ' los rótulos son HTML, no texto escalado dentro del SVG',
      !/<text/.test(h)
      && /<svg class="intcc-radar-svg[^>]*aria-hidden="true"/.test(h)
      && count(h, /class="intcc-radar-vlabel"/g) === 5
      && count(h, /class="intcc-radar-label"/g) === 5
      && count(h, /class="intcc-radar-val"/g) === 0
      && !/intcc-radar-legend|intcc-radar-leg-item/.test(h)
      && ORDER.every(k => new RegExp('data-axis="' + k + '" data-measured="'
          + (c.unav.indexOf(k) === -1 ? '1' : '0') + '"').test(h)),
      (h.match(/class="intcc-radar-vlabel"[^>]*/) || [''])[0]);
    ok('2.5b/' + c.m + ' …y la FIGURA cabe entera en su marco, que se ciñe a ella',
      (() => { const vb = (h.match(/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/) || []).slice(1).map(Number);
        if (vb.length !== 4) return false;
        const pts = [];
        h.replace(/points="([^"]+)"/g, (_, p) => { p.trim().split(/\s+/).forEach(q => {
          const [a, b] = q.split(',').map(Number); pts.push([a, b]); }); return ''; });
        h.replace(/cx="(-?[\d.]+)" cy="(-?[\d.]+)"/g, (_, a, b) => { pts.push([+a, +b]); return ''; });
        return pts.length > 0 && pts.every(([x, y]) =>
          x >= vb[0] && x <= vb[0] + vb[2] && y >= vb[1] && y <= vb[1] + vb[3]); })(),
      (h.match(/viewBox="[^"]+"/) || [''])[0]);
  });
  // ── EL CASO QUE MOTIVA LA REGLA DE ADYACENCIA ────────────────────────────
  ok('2.6 tres métricas en ejes ALTERNOS dan el MISMO pentágono cerrado',
    (() => { const h = RADAR({ diversification: 30, liquidity: 7, concentration: 31 },
        ['stability', 'growth']);
      return /data-svg-edges="5"/.test(h)
        && count(h, /class="intcc-radar-edge"/g) === 5
        && /intcc-radar-area/.test(h); })(),
    (RADAR({ diversification: 30, liquidity: 7, concentration: 31 }, ['stability', 'growth'])
      .match(/data-svg-(edges|gaps)="[^"]*"/g) || []).join(' '));
  ok('2.7 dos métricas vecinas: misma figura, y la evidencia sigue contada aparte',
    (() => { const h = RADAR({ diversification: 30, stability: 80 }, ['liquidity', 'growth', 'concentration']);
      return /data-svg-edges="5"/.test(h) && /data-svg-certified="2"/.test(h); })());
  ok('2.8 dos métricas NO vecinas: ni un hueco en el ciclo',
    (() => { const h = RADAR({ diversification: 30, liquidity: 7 }, ['stability', 'growth', 'concentration']);
      return /data-svg-edges="5"/.test(h) && /data-svg-gaps="0"/.test(h); })());
  // Ya no queda cifra que rotular, así que la diferencia entre «cero medido» y
  // «sin evidencia» sólo puede sobrevivir en la GEOMETRÍA: el auxiliar es
  // neutro (media banda) y jamás el mínimo, de modo que una ausencia no se
  // dibuja nunca como el peor resultado posible.
  const radii = (h) => (h.match(/class="intcc-radar-dot" cx="(-?[\d.]+)" cy="(-?[\d.]+)"/g) || [])
    .map(m => { const n = m.match(/cx="(-?[\d.]+)" cy="(-?[\d.]+)"/);
      return Math.sqrt((+n[1] - 110) ** 2 + (+n[2] - 106) ** 2); });
  ok('2.9 un CERO CERTIFICADO se dibuja MÁS ADENTRO que una ausencia, y sin cifra',
    (() => { const h = RADAR({ diversification: 0, liquidity: 0, concentration: 0 },
        ['stability', 'growth']);
      const r = radii(h);
      return count(h, />0%</g) === 0 && count(h, /class="intcc-radar-val"/g) === 0
        && r.length === 5 && r.filter(x => x < 40).length === 3
        && r.filter(x => x > 50).length === 2
        && /data-svg-certified="3"/.test(h); })());
  ok('2.10 un valor no finito es indistinguible de la ausencia: mismo radio neutro',
    (() => { const h = RADAR({ diversification: 30, stability: null, liquidity: 7,
        growth: undefined, concentration: 31 }, []);
      const r = radii(h);
      const ref = radii(RADAR({ diversification: 30, liquidity: 7, concentration: 31 },
        ['stability', 'growth']));
      return /data-svg-measured="5"/.test(h) && r.length === 5
        && r.every((x, i) => Math.abs(x - ref[i]) < 0.01)
        && count(h, /class="intcc-radar-val"/g) === 0
        && count(h, /class="intcc-radar-label"/g) === 5; })());
  ok('2.11 los nombres y los ángulos NO dependen de los datos: misma malla siempre',
    (() => { const grid = (x) => (x.match(/<g class="intcc-radar-grid">[\s\S]*?<\/g>/) || [''])[0];
      const a = RADAR({ diversification: 30, stability: 80, liquidity: 7, growth: 40, concentration: 31 }, []);
      const b = RADAR({}, ORDER.slice());
      return grid(a) === grid(b) && grid(a).length > 100; })());
  ok('2.12 el owner no conserva NINGÚN camino a «sin datos» ni al marcador fantasma',
    (() => { const src = fnSrc('_intccRadarSvg');
      return !/intv7_axis_unavailable/.test(src) && !/is-unavailable/.test(src)
        && !/is-unknown/.test(src) && !/availability="unknown"/.test(src)
        // …y el auxiliar visual no tiene ningún camino de salida del SVG: se
        // consume en el radio y no se escribe en ningún atributo publicado.
        && /const NEUTRAL_VISUAL = 50;/.test(src)
        && (src.match(/NEUTRAL_VISUAL/g) || []).length === 2
        && /const dims = ALL_DIMS;/.test(src); })());
  // ── §2 · AUDITORÍA DE ELEGIBILIDAD DE LOS DOS EJES SIN OWNER ────────────
  // El §2 lo pide por su nombre: «no hacer Estabilidad disponible por tener
  // muchos snapshots» y «no prometer que simplemente esperar resolverá la
  // ausencia». Las dos cosas se comprueban en el código, no en la intención.
  ok('2.14 Estabilidad cuelga de la CONFIANZA del motor de retorno, no del nº de snapshots',
    (() => { const src = fnSrc('_aurixPeakRetention');
      return /perf\.confidence !== 'high'/.test(src)
        && /perf\.index\.basis !== 'flow_neutral_index'/.test(src)
        && /perf\.coversNominal === false/.test(src)
        // no hay ninguna vía que la habilite contando observaciones
        && !/observations\s*>=?\s*\d/.test(src)
        && !/vals\.length\s*>=?\s*\d/.test(src); })());
  // CONTRATO SUSTITUIDO · CRECIMIENTO YA TIENE OWNER. «No hay escala 0-100 sin
  // benchmark» sigue siendo cierto para una NOTA, y por eso no se publica
  // ninguna: lo que se afirma es la rentabilidad flow-neutral certificada y lo
  // que se dibuja es su posición, por una transformación declarada y monótona.
  ok('2.15 Crecimiento tiene owner y su cifra es la rentabilidad, no una nota',
    (() => { const ks = konstSrc('_INTV7_RADAR_DIMS');
      const src0 = fnSrc('_aurixGrowthAxis');
      return /key: 'growth',[\s\S]{0,90}owner: 'aurixGrowthAxis'/.test(ks)
        && !/pending: 'no_certifiable_scale'/.test(ks)
        && /Math\.tanh/.test(src0) && /_AURIX_GROWTH_SCALE_PP/.test(src0)
        && /perf\.confidence !== 'high'/.test(src0); })());
  ok('2.16 ninguna causa publicada promete que esperar la resuelva',
    (() => { const es = VAL_ES.intv7_pending_obs;
      const txt = (typeof es === 'function') ? es('Estabilidad') : String(es);
      return !/aparece sola|en cuanto|appears on its own|once there is/i.test(txt)
        && /confianza/i.test(txt); })(),
    (typeof VAL_ES.intv7_pending_obs === 'function') ? VAL_ES.intv7_pending_obs('Estabilidad') : '?');
  ok('2.13 …y el CSS tampoco',
    !/intcc-radar-label\.is-unavailable/.test(css)
    && !/intcc-radar-val\.is-unavailable/.test(css)
    && !/intcc-radar-dot\.is-unknown/.test(css)
    && !/intcc-radar-edge\.is-unknown/.test(css));
}

console.log('\n§2 · La card: siempre un radar, nunca una lista:');
{
  const cardWith = (o) => { const c = makeCtx('es');
    c.__snap = o.snap === undefined ? { assetCount: 4, totUSD: 100000, cashPct: 7,
      topInvestedAsset: { pctTotal: 31, name: 'MSFT' } } : o.snap;
    c.__breadth = o.breadth === undefined ? { status: 'available', effectiveCategories: 2.2,
      taxonomySize: 7, categoriesHeld: 3, topCategory: null } : o.breadth;
    c.__peak = o.peak === undefined ? null : o.peak;
    return vm.runInContext('_intv7RadarHtml(s => String(s == null ? "" : s))', c); };

  const three = cardWith({});
  ok('2.C1 con tres certificadas la card es un RADAR de cinco ejes',
    /data-state="radar"/.test(three) && /intcc-radar-svg/.test(three)
    && /data-axes="5"/.test(three) && /data-measured="5"/.test(three)
    && /data-certified="3"/.test(three)
    && /data-declared="5"/.test(three)
    && !/intv15-obs-row/.test(three) && !/data-state="observable"/.test(three));
  ok('2.C2 …y declara lo que NO puede medir, con su causa (§3 · trazabilidad)',
    /data-unavailable="stability,growth"/.test(three)
    // La causa de Crecimiento ya no es «no hay escala»: hereda la del retorno.
    && /data-pending="[^"]*growth:[a-z_]+/.test(three),
    (three.match(/data-pending="[^"]*"/) || [''])[0]);
  const one = cardWith({ snap: null });
  ok('2.C3 con UNA certificada sigue siendo el MISMO radar, con su figura entera',
    /data-state="radar"/.test(one) && /intcc-radar-svg/.test(one)
    && count(one, /class="intcc-radar-label"/g) === 5
    // Con UNA certificada la figura es la MISMA —cinco puntos y el ciclo
    // cerrado—; lo que cambia es de dónde sale cada radio, y eso no se publica.
    && count(one, /class="intcc-radar-dot"/g) === 5
    && /data-certified="1"/.test(one) && /data-measured="5"/.test(one)
    && !/intv15-obs-row/.test(one) && !/Factores observables/.test(one),
    one.slice(0, 240));
  const none = cardWith({ snap: null, breadth: null });
  // CONTRATO SUSTITUIDO · la nota «estas son las cinco dimensiones…» existía
  // para explicar una malla vacía. Ya no hay malla vacía, y el SPEC prohíbe
  // por su nombre el contenido explicativo bajo el radar: la card es el título
  // y la figura, nada más. La nota se retira del código y de la hoja.
  ok('2.C4 con CERO certificadas: la MISMA figura, y ninguna explicación bajo ella',
    /data-state="radar"/.test(none) && /data-measured="5"/.test(none)
    && /data-evidence="none"/.test(none) && /data-certified="0"/.test(none)
    && count(none, /class="intcc-radar-label"/g) === 5
    && !/class="intcc-radar-val"/.test(none)
    && count(none, /class="intcc-radar-dot"/g) === 5
    && !/intv16-radar-none/.test(none)
    && !/sin datos/.test(none),
    none.slice(0, 240));
  ok('2.C5 la nota explicativa no vuelve por ninguna combinación de evidencia',
    !/intv16-radar-none/.test(one) && !/intv16-radar-none/.test(three)
    && !/intv16-radar-none/.test(css)
    && !/intv16-radar-none/.test(fnSrc('_intv7RadarHtml')));
  ok('2.C6 un cuarto owner sube la certificación sin estrenar una figura abierta',
    (() => { const h = cardWith({ peak: { status: 'available', retentionPct: 80,
        quality: 'measured', startsAfterRecord: false } });
      // «Sube de grado» se mide en la CERTIFICACIÓN, no en el dibujo: la
      // figura ya era un pentágono cerrado con tres, y lo sigue siendo con
      // cuatro. Lo que NUNCA puede aparecer es un polígono abierto.
      return /data-state="radar"/.test(h) && /data-certified="4"/.test(h)
        && /data-svg-axes="5"/.test(h) && !/sin datos/.test(h)
        && /data-svg-edges="5"/.test(h) && /data-svg-open="0"/.test(h); })(),
    (cardWith({ peak: { status: 'available', retentionPct: 80, quality: 'measured',
      startsAfterRecord: false } }).match(/data-svg-(edges|gaps|measured)="[^"]*"/g) || []).join(' '));
  ok('2.C7 «Factores observables» queda retirada del código y de la hoja de estilos',
    !/intv7_observable_title/.test(fnSrc('_intv7RadarHtml'))
    && !/intv15-obs-list|intv15-obs-row|intv15-obs-val/.test(css)
    && !/is-observable/.test(fnSrc('_intv7RadarHtml')));
  ok('2.C8 bajo la figura no queda NADA: la card es título y radar',
    (() => { const src = fnSrc('_intv7RadarHtml');
      return !/intv16-radar-none/.test(src) && !/intcc-radar-note|intcc-radar-foot/.test(src)
        // La MENCIÓN en un comentario documenta la retirada; lo que no puede
        // existir es la REGLA, que es lo que volvería a pintar la lista.
        && !/\.intcc-radar-(legend|leg-item)[^;{]*\{/.test(css); })());
}

// ════════════════════════════════════════════════════════════════════════════
// §10 · QUESTION ENGINE — responder cierra el turno
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§10 · Question engine: responder no abre otra pregunta:');
{
  const AV = 'available';
  // Modelo mínimo con DOS preguntas elegibles a la vez: concentración dominante
  // (prioridad 0,9) y objetivo (0,55). Es el escenario del defecto reportado.
  const MODEL = { concentration: { availability: AV, semanticLabel: 'dominant_position',
      topContributor: { name: 'MSFT' } },
    liquidity: { availability: AV, cashPct: 7, changePp: null },
    diversification: { availability: AV }, structure: { availability: AV },
    evolution: { availability: AV } };
  const QS = (ctx, now, extra) => run('_aurixIntelQuestions(' + JSON.stringify(MODEL) + ', '
    + JSON.stringify(ctx) + ', 1, ' + JSON.stringify(Object.assign({ now }, extra || {})) + ')');
  const NOW = T0;
  ok('10.1 sin contexto se propone UNA pregunta (la de mayor prioridad)',
    (() => { const q = QS({ fields: {}, asked: {}, declined: {} }, NOW);
      return q.length === 1 && q[0].id === 'q_concentration_intent'; })(),
    JSON.stringify(QS({ fields: {}, asked: {}, declined: {} }, NOW).map(x => x.id)));
  // EL DEFECTO REPORTADO: se responde, se navega, se vuelve — y antes aparecía la
  // SIGUIENTE pregunta en la misma pintura, indistinguible de «me la repite».
  const ANSWERED = { fields: { concentration_intent: { value: 'deliberate',
      provenance: 'user_answer', answeredAt: NOW } }, asked: {}, declined: {} };
  ok('10.2 tras responder NO se propone ninguna otra pregunta',
    QS(ANSWERED, NOW + 60000).length === 0,
    JSON.stringify(QS(ANSWERED, NOW + 60000).map(x => x.id)));
  ok('10.3 …y sigue en silencio al volver a la sección un rato después',
    QS(ANSWERED, NOW + 6 * DAY).length === 0);
  ok('10.4 el silencio CADUCA: pasado su periodo vuelve a poder preguntar',
    (() => { const ms = Number((konstSrc('_AURIX_INTEL_Q_AFTER_ANSWER_MS')
        .match(/=\s*(\d+)\s*\*\s*864e5/) || [, 0])[1]) * DAY;
      return ms >= 7 * DAY && QS(ANSWERED, NOW + ms + DAY).length === 1; })(),
    konstSrc('_AURIX_INTEL_Q_AFTER_ANSWER_MS'));
  ok('10.5 un CAMBIO MATERIAL lo levanta: es la única excepción que el §10 admite',
    QS(ANSWERED, NOW + 60000, { materialReopen: true }).length === 1);
  ok('10.6 una respuesta INFERIDA no consume el turno: no hubo conversación',
    (() => { const inf = { fields: { concentration_intent: { value: 'deliberate',
        provenance: 'inferred', answeredAt: NOW } }, asked: {}, declined: {} };
      return QS(inf, NOW + 60000).length === 1; })());
  ok('10.7 sin reloj NO se silencia nada: el estado seguro es preguntar',
    QS(ANSWERED, 0).length >= 0 && QS({ fields: {}, asked: {}, declined: {} }, 0).length === 1);
  ok('10.8 «prefiero no responder» sigue cerrando la pregunta por su cuenta',
    (() => { const d = { fields: {}, asked: {}, declined: { concentration_intent: NOW } };
      const q = QS(d, NOW + DAY);
      return q.length === 1 && q[0].id !== 'q_concentration_intent'; })(),
    JSON.stringify(QS({ fields: {}, asked: {}, declined: { concentration_intent: T0 } }, T0 + DAY).map(x => x.id)));
  ok('10.9 la pausa explícita sigue callando todo salvo cambio material',
    (() => { const p = { fields: {}, asked: {}, declined: {}, pausedAt: NOW };
      return QS(p, NOW + DAY).length === 0
        && QS(p, NOW + DAY, { materialReopen: true }).length === 1; })());
  ok('10.10 el cooldown por pregunta MOSTRADA y sin responder sigue vigente',
    (() => { const a = { fields: {}, asked: { q_concentration_intent: { at: NOW, count: 1 } },
        declined: {} };
      const q = QS(a, NOW + DAY);
      return q.length === 1 && q[0].id !== 'q_concentration_intent'; })());
  // CROSS-DEVICE: el silencio se deriva del MÁXIMO `answeredAt`, y el merge de
  // contexto ya se queda con el `answeredAt` mayor de los dos lados. No hay estado
  // nuevo que sincronizar, que es lo que lo hace correcto entre dispositivos.
  ok('10.11 el silencio viaja entre dispositivos sin estado nuevo (máximo answeredAt)',
    /provenance !== 'user_answer'/.test(fnSrc('_aurixIntelQuestions'))
    && /at > lastAnswerAt/.test(fnSrc('_aurixIntelQuestions'))
    && /out\.fields\[k\] = \(tx > ty\) \? x/.test(fnSrc('_aurixIntelCtxMerge')));
  ok('10.12 …y la política se PUBLICA, así que la superficie no la re-deriva',
    /afterAnswerMs: _AURIX_INTEL_Q_AFTER_ANSWER_MS/.test(app)
    && /lastAnswerAt: Object\.keys\(ctx\.fields\)/.test(app));
  ok('10.13 el límite sigue siendo UNA pregunta prioritaria como máximo',
    /_AURIX_INTEL_QUESTION_LIMIT = 1/.test(konstSrc('_AURIX_INTEL_QUESTION_LIMIT')));
}

// ════════════════════════════════════════════════════════════════════════════
// §14–§16 + §5 (CIERRE CORRECTIVO) · «TU EVOLUCIÓN» ES EVOLUCIÓN
// ════════════════════════════════════════════════════════════════════════════
// La regla del §5: afirmar que algo «se mantiene» exige una COMPARACIÓN
// DEMOSTRABLE de esa dimensión. Ni la edad de la cuenta ni la ausencia de
// hallazgos la sustituyen — son exactamente las dos cosas de las que la frase de
// la captura se derivaba.
console.log('\n§5/§14–16 · «Tu evolución»: estabilidad sólo con comparación demostrable:');
{
  const AV = 'available';
  const NOWT = T0 + 60 * DAY;
  const INTEL = (o) => ({ model: {
    concentration: (o && o.conc === null) ? { availability: 'unavailable' }
      : { availability: AV, topWeightPct: 31, top3Pct: 77,
          topContributor: { name: 'Microsoft', pct: 31 } },
    liquidity: (o && o.liq === null) ? { availability: 'unavailable' }
      : { availability: AV, cashPct: 7, changePp: null },
  }, context: { fields: {} } });
  const EV = (root, days) => ({ root, category: root === 'cash_weight' ? 'liquidity' : 'stock',
    range: days + 'd', startAt: NOWT - days * DAY, endAt: NOWT,
    deltaPp: 0.8, thresholdPp: 3, endPct: 7 });
  const CORE = (o) => ({ findings: (o && o.findings) || [], temporalEvents: (o && o.events) || [],
    stabilityEvidence: (o && o.ev !== undefined) ? o.ev : [EV('cash_weight', 30), EV('category_mix', 30)],
    dataAvailability: { observation: { observations: (o && o.obs != null) ? o.obs : 12,
        spanMs: (o && o.spanMs !== undefined) ? o.spanMs : 41 * DAY },
      gaps: (o && o.noFlows === false) ? [] : [{ family: 'capital_flow',
        semanticKey: 'recorded_capital_net', status: 'available', reason: 'no_flows_in_window' }] } });
  const MEM = (core, intel, lang) => { const c = (lang === 'en') ? makeCtx('en') : sb;
    return vm.runInContext('_intv4MemoryHtml(' + JSON.stringify(core) + ', s => String(s == null ? "" : s), [], '
      + JSON.stringify(intel) + ', [], "")', c); };
  const ROWS = (core, intel) => run('_intv15StableRows(' + JSON.stringify(core) + ', '
    + JSON.stringify(intel) + ')');

  const stable = MEM(CORE({}), INTEL({}));
  ok('5.1 con comparación demostrable la card publica una LECTURA de evolución',
    /class="intcc-card intcc-timeline intv4-memory is-stable"/.test(stable)
    && /data-stable="1"/.test(stable) && /class="intv15-stable-head"/.test(stable),
    stable.slice(0, 180));
  // REMATE §2 — el titular va DE FECHA A FECHA y afirma el cambio NETO entre los
  // dos extremos, no la quietud del intervalo.
  // CONTRATO RE-DECIDIDO (SPEC «Evolución real y cero repetición», 2026-09-30).
  ok('5.2 el titular va de FECHA A FECHA (cambio neto), sin descargos del motor ni días de calendario',
    (() => { const h = (stable.match(/class="intv15-stable-head">([^<]*)</) || [, ''])[1];
      const a = 'D' + Math.round((NOWT - 30 * DAY) / 864e5), b = 'D' + Math.round(NOWT / 864e5);
      return h.indexOf('Entre el ' + a + ' y el ' + b) === 0 && /reparto de tu cartera/.test(h)
        && /apenas cambiaron/.test(h) && !/compara los dos extremos|no sobre tu rentabilidad/.test(h)
        && !/se mantiene|se ha movido|últimos \d+ días|estable/.test(h) && !/41/.test(h)
        && /data-stable-days="30"/.test(stable); })(),
    (stable.match(/class="intv15-stable-head">([^<]*)</) || [, '?'])[1]);
  // CONTRATO RE-DECIDIDO (SPEC «Evolución real y cero repetición», 2026-09-30).
  ok('5.3 SIN comparación no se afirma nada: primera referencia, sin días observados',
    (() => { const h = MEM(CORE({ ev: [] }), INTEL({}));
      return !/is-stable/.test(h) && !/se mantiene/.test(h) && /data-no-comparison="1"/.test(h)
        && /Aurix está creando tu primera referencia histórica/.test(h)
        && !/41|días observando|no puede comparar/.test(h); })(),
    MEM(CORE({ ev: [] }), INTEL({})).slice(0, 260));
  ok('5.4 …ni siquiera con 41 días y cero hallazgos pendientes (edad ≠ estabilidad)',
    (() => { const h = MEM(CORE({ ev: [], findings: [], events: [], spanMs: 41 * DAY }), INTEL({}));
      return !/is-stable/.test(h) && !/merezca tu atención/.test(h); })());
  // CONTRATO RE-DECIDIDO (SPEC «Evolución real y cero repetición», 2026-09-30).
  ok('5.5 una deriva MATERIAL de la liquidez bloquea SU afirmación, no la del reparto',
    (() => { const h = MEM(CORE({ findings: [{ semanticKey: 'cash_drift_liquidity_30d', priority: 0.8 }] }), INTEL({}));
      return /is-stable/.test(h) && !/data-stable-code="liquidity"/.test(h) && /data-stable-code="category_mix"/.test(h); })());
  ok('5.6 …y con un evento temporal en el pool, tampoco',
    (() => { const h = MEM(CORE({ events: [{ semanticKey: 'wealth_level_peak', priority: 0.7,
        causalRoot: 'wealth_level', window: { range: '30d', endAt: T0 } }] }), INTEL({}));
      return !/is-stable/.test(h); })());
  // ── LA VENTANA NO SE INFLA ───────────────────────────────────────────────
  // CONTRATO RE-DECIDIDO (SPEC «Evolución real y cero repetición», 2026-09-30).
  // Una sola ventana COMÚN (la más larga afirmable) y sólo las dimensiones medidas
  // en ella: nunca se mezclan extremos de comparaciones distintas.
  ok('5.7 la ventana afirmada es UNA y sólo lleva las dimensiones medidas en ELLA',
    (() => { const h = MEM(CORE({ ev: [EV('cash_weight', 7), EV('category_mix', 90)] }), INTEL({}));
      const head = (h.match(/class="intv15-stable-head">([^<]*)</) || [, ''])[1];
      const a90 = 'D' + Math.round((NOWT - 90 * DAY) / 864e5);
      return head.indexOf(a90) !== -1 && /data-stable-days="90"/.test(h)
        && /data-stable-codes="category_mix"/.test(h) && !/data-stable-code="liquidity"/.test(h); })(),
    (MEM(CORE({ ev: [EV('cash_weight', 7), EV('category_mix', 90)] }), INTEL({}))
      .match(/data-stable-(days|codes)="[^"]*"/g) || []).join(' '));
  ok('5.8 las fechas salen de los DOS EXTREMOS, no del nombre de la ventana (cobertura parcial)',
    (() => { const trimmed = { root: 'cash_weight', category: 'liquidity', range: '30d',
        startAt: NOWT - 9 * DAY, endAt: NOWT, deltaPp: 0.5, thresholdPp: 3 };
      const h = MEM(CORE({ ev: [trimmed] }), INTEL({}));
      return h.indexOf('D' + Math.round((NOWT - 9 * DAY) / 864e5)) !== -1
        && h.indexOf('D' + Math.round((NOWT - 30 * DAY) / 864e5)) === -1
        && /data-stable-days="9"/.test(h); })());
  // ── LAS FILAS NOMBRAN LA MEDICIÓN, NO UNA CONTINUIDAD SUPUESTA ───────────
  // CONTRATO RE-DECIDIDO (SPEC «Evolución real y cero repetición», 2026-09-30).
  ok('5.9 cada evidencia dice contra qué umbral se comparó, sin repetir la liquidez de hoy',
    /El reparto entre clases de activo cambió menos de 3 puntos porcentuales\./.test(stable)
    && /El peso de tu liquidez cambió menos de 3 puntos porcentuales\./.test(stable)
    && !/Tu liquidez está hoy|7 ?%/.test(stable),
    JSON.stringify((stable.match(/class="intv15-stable-row"[^>]*>([^<]*)</g) || []).map(x => x.slice(-60))));
  ok('5.10 ninguna fila afirma continuidad ni trayectoria: sólo el cambio entre extremos',
    !/sigue siendo|sigue concentrando|se mantiene|se ha movido|no se ha movido/.test(stable));
  // ── EL CASO QUE EL §2 PIDE POR SU NOMBRE ─────────────────────────────────
  // Dos extremos IGUALES con una desviación material por el medio producen el
  // MISMO delta que una serie plana: el lector de derivas no puede distinguirlos.
  // Lo que el gate exige no es detectarlo —no se puede con dos puntos— sino que
  // la copy NO afirme lo que no ha medido.
  // CONTRATO RE-DECIDIDO (SPEC «Evolución real y cero repetición», 2026-09-30).
  ok('5.10b dos extremos iguales con un pico intermedio: la copy afirma cambio NETO, no quietud',
    (() => { const flat = { root: 'cash_weight', category: 'liquidity', range: '30d',
        startAt: NOWT - 30 * DAY, endAt: NOWT, deltaPp: 0, thresholdPp: 3, endPct: 7 };
      const h = MEM(CORE({ ev: [flat] }), INTEL({}));
      const head = (h.match(/class="intv15-stable-head">([^<]*)</) || [, ''])[1];
      const row = (h.match(/class="intv15-stable-row"[^>]*>([^<]*)</) || [, ''])[1];
      return /is-stable/.test(h) && /^Entre el /.test(head) && /apenas cambió/.test(head)
        && !/se mantiene|estable|no se ha movido|se ha movido/.test(head + ' ' + row)
        && !/camino entre ellos|fuese y volviese/.test(h); })(),
    (MEM(CORE({ ev: [{ root: 'cash_weight', category: 'liquidity', range: '30d',
      startAt: NOWT - 30 * DAY, endAt: NOWT, deltaPp: 0, thresholdPp: 3, endPct: 7 }] }), INTEL({}))
      .match(/class="intv15-stable-head">([^<]*)</) || [, '?'])[1]);
  ok('5.11 una dimensión sin comparación NO produce fila, aunque su nivel se conozca',
    (() => { const rows = ROWS(CORE({ ev: [EV('category_mix', 30)] }), INTEL({}));
      return rows.every(r => r.code !== 'liquidity')
        && rows.some(r => r.code === 'category_mix'); })(),
    JSON.stringify(ROWS(CORE({ ev: [EV('category_mix', 30)] }), INTEL({})).map(r => r.code)));
  // CONTRATO RE-DECIDIDO (SPEC «Evolución real y cero repetición», 2026-09-30).
  ok('5.12 la fila de liquidez ya no depende del NIVEL de hoy (no lo publica)',
    (() => { const rows = ROWS(CORE({}), INTEL({ liq: null }));
      return rows.some(r => r.code === 'liquidity') && rows.every(r => !/hoy/.test(r.txt)); })());
  // CONTRATO RE-DECIDIDO (SPEC «Evolución real y cero repetición», 2026-09-30).
  ok('5.13 la card no publica límites del motor (ni trayectoria ni peso por posición)',
    !/intcc-surface-limit/.test(stable) && !/camino entre ellos|todavía no compara el peso/.test(stable));
  // CONTRATO RE-DECIDIDO (SPEC «Evolución real y cero repetición», 2026-09-30).
  // Máximo dos evidencias: las dos dimensiones comparadas. La línea de aportaciones
  // hablaba de «este periodo» sin que su ventana fuera la del titular.
  ok('5.14 las evidencias son sólo dimensiones comparadas (sin línea de aportaciones)',
    ROWS(CORE({}), INTEL({})).every(r => r.code !== 'flows') && ROWS(CORE({}), INTEL({})).length <= 2);
  // CONTRATO RE-DECIDIDO (SPEC «Evolución real y cero repetición», 2026-09-30).
  ok('5.15 sin evidencia, el estado compacto de la primera referencia',
    (() => { const h = MEM(CORE({ obs: 1, spanMs: DAY, ev: [] }), INTEL({}));
      return /is-accruing/.test(h) && /data-compact="1"/.test(h) && !/is-stable/.test(h); })());
  // CONTRATO RE-DECIDIDO (SPEC «Evolución real y cero repetición», 2026-09-30).
  ok('5.16 los días NUNCA salen de `spanMs`: sin él, la comparación se sigue leyendo y no hay cobertura',
    (() => { const h = MEM(CORE({ spanMs: null }), INTEL({}));
      return /is-stable/.test(h) && !/data-coverage-days/.test(h) && !/41/.test(h); })());
  ok('5.17 la evidencia la emite el ledger cuando la deriva está MEDIDA y bajo umbral',
    (() => { const src = fnSrc('_aurixIntelligenceCore');
      return /stabilityEvidence: ledger\.stabilityEvidence \|\| \[\]/.test(src)
        && /stabilityEvidence\.push\(\{ root: rootKey/.test(app)
        && /driftEvidence\(cat, d, range\)\.ev\.ok/.test(app); })());
  ok('5.17b la puerta devuelve FALSE sin evidencia y TRUE con ella (unidad)',
    (() => { const no = run('_intv15MemoryIsStable(' + JSON.stringify(CORE({ ev: [] })) + ')');
      const si = run('_intv15MemoryIsStable(' + JSON.stringify(CORE({})) + ')');
      return no === false && si === true; })(),
    JSON.stringify({ sinEv: run('_intv15MemoryIsStable(' + JSON.stringify(CORE({ ev: [] })) + ')'),
      conEv: run('_intv15MemoryIsStable(' + JSON.stringify(CORE({})) + ')') }));
  // CONTRATO RE-DECIDIDO (SPEC «Evolución real y cero repetición», 2026-09-30).
  ok('5.18 …y la puerta del titular EXIGE esa evidencia, por dimensión, no la ausencia de hallazgos',
    (() => { const src = fnSrc('_intv15MemoryIsStable');
      return /_intv17Evolution\(core\)/.test(src) && !/findings\.length|spanMs|observations/.test(src); })());
  // CONTRATO RE-DECIDIDO (SPEC «Evolución real y cero repetición», 2026-09-30).
  ok('5.19 la cobertura «Aurix dispone de N días» ya no se publica',
    !/Aurix dispone de|intv4-mem-coverage">Aurix/.test(stable));
  // CONTRATO RE-DECIDIDO (SPEC «Evolución real y cero repetición», 2026-09-30).
  ok('5.20 la misma lectura existe en EN, con las MISMAS cifras',
    (() => { const en = MEM(CORE({}), INTEL({}), 'en');
      const a = 'D' + Math.round((NOWT - 30 * DAY) / 864e5), b = 'D' + Math.round(NOWT / 864e5);
      return /is-stable/.test(en)
        && new RegExp('Between ' + a + ' and ' + b + ', your portfolio mix and your cash weight barely changed').test(en)
        && /Your cash weight moved by less than 3 percentage points/.test(en)
        && /Your asset-class mix moved by less than 3 percentage points/.test(en)
        && !/not the path between them|is holding|held steady|Your cash is at/.test(en); })(),
    (MEM(CORE({}), INTEL({}), 'en').match(/class="intv15-stable-head">([^<]*)</) || [, '?'])[1]);
  // CONTRATO RE-DECIDIDO (SPEC «Evolución real y cero repetición», 2026-09-30).
  ok('5.21 …y el estado sin comparación también',
    /Aurix is building your first historical reference/.test(MEM(CORE({ ev: [] }), INTEL({}), 'en'))
    && !/cannot yet compare/.test(MEM(CORE({ ev: [] }), INTEL({}), 'en')));
}

// ════════════════════════════════════════════════════════════════════════════
// §9 / §17 · EXPLORA CONTEXTUAL Y VENTANAS ADAPTATIVAS
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§9 · Explora: preguntas con el contexto de la cuenta:');
{
  const AV = 'available';
  const INTEL = (o) => ({ model: {
    concentration: Object.assign({ availability: AV, topWeightPct: 31, top3Pct: 77,
      topContributor: { name: 'Microsoft' } }, (o && o.conc) || {}),
    liquidity: Object.assign({ availability: AV, cashPct: 7, changePp: null }, (o && o.liq) || {}),
    evolution: Object.assign({ availability: 'unavailable' }, (o && o.ev) || {}),
  } });
  const CORE = (spanMs) => ({ dataAvailability: { observation: { spanMs } } });
  const L = (id, intel, core, lang) => { const c = (lang === 'en') ? makeCtx('en') : sb;
    return vm.runInContext('_intv15ExploreLabel(' + JSON.stringify({ id }) + ', '
      + JSON.stringify(core || CORE(40 * DAY)) + ', ' + JSON.stringify(intel) + ')', c); };

  // §3 — el enunciado promete SÓLO lo que la respuesta puede dar: qué IMPLICA el
  // peso, no qué lo causó (eso sería una atribución que Aurix no certifica).
  ok('9.1 concentración: la pregunta nombra la posición, su peso REAL y pregunta por su implicación',
    L('q_concentration', INTEL({})) === 'Microsoft pesa el 31% de mi cartera: ¿qué implica esa concentración?'
    && !/causando|qué lo provoca/i.test(L('q_concentration', INTEL({}))),
    L('q_concentration', INTEL({})));
  ok('9.2 …y sin NOMBRE certificado cae al rótulo genérico, nunca a un hueco',
    (() => { const g = L('q_concentration', INTEL({ conc: { topContributor: null } }));
      return g === '¿De qué posición depende más mi patrimonio?'; })(),
    L('q_concentration', INTEL({ conc: { topContributor: null } })));
  ok('9.3 …y con la dimensión no disponible, también',
    L('q_concentration', INTEL({ conc: { availability: 'unavailable' } }))
      === '¿De qué posición depende más mi patrimonio?');
  // CONTRATO SUSTITUIDO: la cifra sale del ENUNCIADO. «¿Cuánto … (77%)?» pregunta
  // cuánto y contesta 77% en el mismo renglón, así que desplegarla no aportaba
  // nada. El dato vive en la respuesta (`intv16_ans_top3_lead`), y la CONDICIÓN
  // se conserva: sin `top3Pct` certificado la pregunta no se ofrece.
  ok('9.4 tres mayores posiciones: la pregunta NO se contesta a sí misma',
    L('q_diversification', INTEL({}))
      === '¿Cuánto de mi patrimonio depende de mis tres mayores posiciones?'
    && L('q_diversification', INTEL({ conc: { top3Pct: null } })) !== null,
    L('q_diversification', INTEL({})));
  ok('9.5 liquidez SIN deriva medida: se pregunta el significado, no la dirección',
    L('q_liquidity', INTEL({})) === '¿Qué significa tener el 7% de mi patrimonio en liquidez?',
    L('q_liquidity', INTEL({})));
  ok('9.6 liquidez CON deriva medida: se puede preguntar si sube o baja',
    L('q_liquidity', INTEL({ liq: { changePp: -4 } }))
      === 'Mi liquidez es el 7%: ¿está aumentando o reduciéndose?',
    L('q_liquidity', INTEL({ liq: { changePp: -4 } })));
  // §17 — VENTANAS ADAPTATIVAS: no se nombra un periodo que el historial no cubre.
  ok('9.7 «qué ha cambiado» nombra el span REAL observado (§17)',
    L('q_what_changed', INTEL({}), CORE(40 * DAY))
      === '¿Qué ha cambiado más en mi patrimonio en los últimos 40 días?',
    L('q_what_changed', INTEL({}), CORE(40 * DAY)));
  ok('9.8 …y con un día de historial NO se nombra ningún periodo',
    L('q_what_changed', INTEL({}), CORE(DAY)) === '¿Qué ha cambiado en mi estructura?',
    L('q_what_changed', INTEL({}), CORE(DAY)));
  ok('9.9 …ni sin cobertura declarada',
    L('q_what_changed', INTEL({}), { dataAvailability: {} }) === '¿Qué ha cambiado en mi estructura?');
  ok('9.10 aportaciones vs mercado sólo si las DOS mitades están certificadas (§13)',
    (() => { const off = L('q_performance', INTEL({}));
      const on = L('q_performance', INTEL({ ev: { availability: AV, returnPct: 4.2,
        recordedCapitalNet: 12000 } }));
      return off === '¿Cuánto han rendido realmente mis inversiones?'
        && on === '¿Qué parte de mi evolución viene de mis aportaciones y qué parte del mercado?'; })(),
    JSON.stringify([L('q_performance', INTEL({})),
      L('q_performance', INTEL({ ev: { availability: AV, returnPct: 4.2, recordedCapitalNet: 12000 } }))]));
  ok('9.11 …y con sólo una mitad certificada, no se ofrece',
    L('q_performance', INTEL({ ev: { availability: AV, returnPct: 4.2 } }))
      === '¿Cuánto han rendido realmente mis inversiones?');
  ok('9.12 una pregunta sin variante contextual conserva su rótulo intacto',
    L('q_current_value', INTEL({})) === '¿Cuánto vale actualmente mi cartera financiera?');
  ok('9.13 el rótulo NO calcula nada: sale del modelo certificado y del formateador canónico',
    (() => { const src = fnSrc('_intv15ExploreLabel');
      return /intel && intel\.model/.test(src) && /_aurixPctLabel/.test(src)
        && !/[*/]\s*100/.test(src) && !/_aurixHealthSnapshot/.test(src); })());
  // §37 — ES + EN, y la cifra es la misma en los dos.
  ok('9.14 las variantes contextuales existen en EN con las MISMAS cifras',
    (() => { const en = ['q_concentration', 'q_diversification', 'q_liquidity', 'q_what_changed']
        .map(id => L(id, INTEL({}), CORE(40 * DAY), 'en'));
      return en[0] === 'Microsoft is 31% of my portfolio: what does that concentration mean?'
        && en[1] === 'How much of my wealth depends on my three largest positions?'
        && /7% of my wealth in cash/.test(en[2])
        && /last 40 days/.test(en[3]); })(),
    JSON.stringify(['q_concentration', 'q_diversification', 'q_liquidity', 'q_what_changed']
      .map(id => L(id, INTEL({}), CORE(40 * DAY), 'en'))));
}

// ════════════════════════════════════════════════════════════════════════════
// §3 (CIERRE CORRECTIVO) · LA RESPUESTA CONTESTA LA PREGUNTA
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§3 · Explora: cada par pregunta/respuesta es una unidad:');
{
  const AV = 'available';
  const INTEL = (o) => ({ model: {
    concentration: Object.assign({ availability: AV, topWeightPct: 31, top3Pct: 77,
      topContributor: { name: 'Microsoft' } }, (o && o.conc) || {}),
    liquidity: Object.assign({ availability: AV, cashPct: 4, changePp: null }, (o && o.liq) || {}),
    evolution: { availability: 'unavailable' },
  } });
  const TOP3 = [{ name: 'Microsoft', type: 'stock', pct: 31, pctRaw: 31.4, pctLabel: '31%' },
                { name: 'Bitcoin', type: 'crypto', pct: 25, pctRaw: 25.4, pctLabel: '25%' },
                { name: 'Apple', type: 'stock', pct: 21, pctRaw: 20.6, pctLabel: '21%' }];
  const CORE = { ledger: { facts: [{ semanticKey: 'f1' }] },
    dataAvailability: { observation: { spanMs: 40 * DAY } } };
  const ANS = (id, o) => { const c = makeCtx((o && o.lang) || 'es');
    c.__drivers = { items: (o && o.items !== undefined) ? o.items : TOP3, pct: 77 };
    c.buildPortfolioDrivers = () => c.__drivers;
    c.__snap = (o && o.snap !== undefined) ? o.snap
      : { assetCount: 4, totUSD: 100000, realEstatePct: 0, uncertifiablePositions: 0 };
    c._intv4FactText = () => (o && o.factText !== undefined) ? o.factText : 'Hecho certificado del ledger.';
    const q = { id, family: (o && o.family) || 'structure', answer: { factKeys: ['f1'] } };
    return vm.runInContext('_intv4AnswerHtml(' + JSON.stringify(q) + ', ' + JSON.stringify(CORE)
      + ', s => String(s == null ? "" : s), ' + JSON.stringify((o && o.intel) || INTEL({})) + ')', c); };
  const LEAD = (id, o) => { const c = makeCtx((o && o.lang) || 'es');
    c.__drivers = { items: (o && o.items !== undefined) ? o.items : TOP3, pct: 77 };
    c.buildPortfolioDrivers = () => c.__drivers;
    c.__snap = { assetCount: 4, totUSD: 100000 };
    return vm.runInContext('_intv16AnswerLead(' + JSON.stringify({ id }) + ', ' + JSON.stringify(CORE)
      + ', ' + JSON.stringify((o && o.intel) || INTEL({})) + ')', c); };

  // ── DEFECTO A · LA LIQUIDEZ TAUTOLÓGICA ──────────────────────────────────
  const liq = ANS('q_liquidity');
  ok('3.1 liquidez: la primera frase EXPLICA el saldo, no repite la cifra del título',
    /El 4% de tu cartera financiera está registrado como efectivo/.test(liq)
    && /cuyo valor no depende del precio de ningún activo/.test(liq),
    (liq.match(/<p>([^<]*)</) || [, '?'])[1]);
  // ── REMATE §1 · NO SE CARACTERIZA EL COMPLEMENTO ─────────────────────────
  // Tener un 4 % de efectivo no demuestra la naturaleza, la negociabilidad ni la
  // valoración del 96 % restante. Afirmarlo era una deducción por diferencia.
  ok('3.1b …y NO dice nada del 96 % restante: eso no se deduce del 4 %',
    !/96%/.test(liq)
    && !/se mueven con el mercado|move with the market/.test(liq)
    && !/restante/.test(liq),
    liq.replace(/<[^>]*>/g, ' ').slice(0, 150));
  ok('3.1c con inmueble registrado, el DENOMINADOR se declara',
    (() => { const h = ANS('q_liquidity', { snap: { assetCount: 5, totUSD: 100000,
        realEstatePct: 38, uncertifiablePositions: 0 } });
      return /Ese porcentaje se mide sobre tus inversiones/.test(h)
        && /Tu patrimonio inmobiliario no entra en el cálculo/.test(h); })(),
    ANS('q_liquidity', { snap: { assetCount: 5, totUSD: 100000, realEstatePct: 38,
      uncertifiablePositions: 0 } }).replace(/<[^>]*>/g, ' ').slice(0, 220));
  ok('3.1d sin inmueble no se publica esa línea (§12 · anti-ruido)',
    !/patrimonio inmobiliario/.test(liq));
  ok('3.1e con una posición SIN VALORAR, la cobertura se declara y el % se acota',
    (() => { const h = ANS('q_liquidity', { snap: { assetCount: 5, totUSD: 100000,
        realEstatePct: 0, uncertifiablePositions: 2 } });
      return /El cálculo cubre las posiciones que Aurix puede valorar/.test(h)
        && /2 quedan fuera/.test(h)
        && /describe la parte valorada y no el total registrado/.test(h); })(),
    ANS('q_liquidity', { snap: { assetCount: 5, totUSD: 100000, realEstatePct: 0,
      uncertifiablePositions: 2 } }).replace(/<[^>]*>/g, ' ').slice(0, 240));
  ok('3.1f con cobertura completa no se publica esa línea',
    !/El cálculo cubre las posiciones/.test(liq));
  ok('3.2 …y declara el límite: registrado como efectivo ≠ disponible hoy',
    /no equivale automáticamente a dinero disponible hoy/.test(liq)
    && /inmovilizado, comprometido o sujeto a alguna restricción/.test(liq));
  ok('3.3 …y NO califica suficiente ni insuficiente, ni infiere meses de gasto',
    !/suficiente|insuficiente|meses de gasto|colchón/i.test(liq));
  ok('3.4 sin liquidez certificada no hay lead inventado: la respuesta cae a la evidencia',
    (() => { const h = ANS('q_liquidity', { intel: INTEL({ liq: { availability: 'unavailable' } }) });
      return !/registrado como efectivo/.test(h) && /Hecho certificado del ledger/.test(h); })());

  // ── DEFECTO B · EL TOP-3 CONTESTADO CON LA DISPERSIÓN ────────────────────
  const top3 = ANS('q_diversification');
  ok('3.5 top-3: la respuesta nombra las posiciones y su peso CONJUNTO',
    /Tus 3 mayores posiciones son Microsoft, Bitcoin y Apple/.test(top3)
    && /juntas concentran el 77% de tu cartera financiera/.test(top3),
    (top3.match(/<p>([^<]*)</) || [, '?'])[1]);
  ok('3.6 …agregando SIN REDONDEAR y redondeando una sola vez (31,4+25,4+20,6 = 77, no 77,4)',
    (() => { const rows = LEAD('q_diversification');
      // Sumar los enteros ya redondeados daría 31+25+21 = 77 por casualidad; el
      // caso que lo distingue es 31,4+25,4+20,6 = 77,4 → 77, frente a 31+25+21=77.
      // Se prueba con un reparto donde las dos vías divergen: 31,6+25,6+20,6 = 77,8
      // → 78, mientras los redondeados darían 32+26+21 = 79.
      const alt = LEAD('q_diversification', { items: [
        { name: 'A', pct: 32, pctRaw: 31.6 }, { name: 'B', pct: 26, pctRaw: 25.6 },
        { name: 'C', pct: 21, pctRaw: 20.6 }] });
      return /77%/.test(rows[0]) && /78%/.test(alt[0]) && !/79%/.test(alt[0]); })(),
    JSON.stringify(LEAD('q_diversification', { items: [
      { name: 'A', pct: 32, pctRaw: 31.6 }, { name: 'B', pct: 26, pctRaw: 25.6 },
      { name: 'C', pct: 21, pctRaw: 20.6 }] })));
  ok('3.7 …y la consecuencia se limita al PESO: no atribuye rendimiento ni riesgo',
    /Es una afirmación sobre el PESO/.test(top3)
    && /no puede repartir tu resultado entre posiciones/.test(top3)
    && !/explica el mismo|del riesgo|diversificación completa/i.test(top3));
  ok('3.8 …y la dispersión del ledger queda DETRÁS, como evidencia, no como respuesta',
    (() => { const ps = top3.match(/<p>([^<]*)</g) || [];
      return ps.length >= 3
        && /mayores posiciones son/.test(ps[0])
        && /Hecho certificado del ledger/.test(ps[ps.length - 1]); })(),
    JSON.stringify((top3.match(/<p>([^<]*)</g) || []).map(x => x.slice(3, 45))));
  ok('3.9 con menos de dos posiciones no se inventa un conjunto',
    LEAD('q_diversification', { items: [TOP3[0]] }).length === 0
    && LEAD('q_diversification', { items: [] }).length === 0);

  // ── CONCENTRACIÓN ────────────────────────────────────────────────────────
  const conc = ANS('q_concentration');
  ok('3.10 concentración: nombra la posición, su peso y qué IMPLICA, sin atribuir resultado',
    /Microsoft concentra el 31% de tu cartera financiera/.test(conc)
    && /Es una lectura de exposición/.test(conc)
    && !/explic|atribu/i.test(conc),
    (conc.match(/<p>([^<]*)</) || [, '?'])[1]);

  // ── LA PUERTA ANTI-TAUTOLOGÍA ────────────────────────────────────────────
  ok('3.11 una respuesta contenida ENTERA en el enunciado no se publica',
    (() => { const c = makeCtx('es');
      return vm.runInContext('_intv16AnswerIsTautology(["Tu liquidez es el 4%"],'
        + ' "¿Qué significa tener el 4% de mi patrimonio en liquidez? Tu liquidez es el 4%")', c) === true; })());
  ok('3.12 …y basta con que UNA línea aporte algo para que sí se publique',
    (() => { const c = makeCtx('es');
      return vm.runInContext('_intv16AnswerIsTautology(["Tu liquidez es el 4%",'
        + ' "No puede saberse si está inmovilizada"], "Tu liquidez es el 4%")', c) === false; })());
  ok('3.13 la comparación ignora acentos, signos y espacios (mide información, no redacción)',
    (() => { const c = makeCtx('es');
      return vm.runInContext('_intv16NormTxt("El 4 % de tu Cartera…")', c)
          === vm.runInContext('_intv16NormTxt("el4%detucartera")', c); })());
  ok('3.14 sin ninguna línea la respuesta se considera vacía y el candidato se retira',
    (() => { const c = makeCtx('es');
      return vm.runInContext('_intv16AnswerIsTautology([], "lo que sea")', c) === true; })());
  ok('3.15 una pregunta sin hechos y sin lead no publica nada (no se rellena el cupo)',
    ANS('q_current_value', { factText: '' }) === '');
  // ── LA PUERTA, CABLEADA · el defecto A de extremo a extremo ──────────────
  // Una pregunta cuya ÚNICA línea de respuesta repite su enunciado no llega a la
  // pantalla. Se ejercita sobre `_intv4AnswerHtml` —no sobre el predicado— para
  // que retirar la llamada rompa el gate: probar sólo el predicado dejaba el
  // cableado sin cubrir, y una puerta que nadie invoca es una puerta abierta.
  ok('3.15b una respuesta que SÓLO repite el enunciado no se publica (cableado)',
    (() => { const c = makeCtx('es');
      c.__snap = { assetCount: 4, totUSD: 100000 };
      c.buildPortfolioDrivers = () => ({ items: [], pct: 0 });
      // `q_current_value` no tiene lead, así que su respuesta es sólo el hecho:
      // si ese hecho es el propio enunciado, no queda nada que aportar.
      const label = '¿Cuánto vale actualmente mi cartera financiera?';
      c._intv4FactText = () => label;
      const q = { id: 'q_current_value', family: 'structure', answer: { factKeys: ['f1'] } };
      const core = { ledger: { facts: [{ semanticKey: 'f1' }] },
        dataAvailability: { observation: { spanMs: 40 * DAY } } };
      const h = vm.runInContext('_intv4AnswerHtml(' + JSON.stringify(q) + ', ' + JSON.stringify(core)
        + ', s => String(s == null ? "" : s), ' + JSON.stringify(INTEL({})) + ')', c);
      return h === ''; })());
  ok('3.15c …y con UNA línea que sí aporta, la misma pregunta sí se publica',
    (() => { const c = makeCtx('es');
      c.__snap = { assetCount: 4, totUSD: 100000 };
      c.buildPortfolioDrivers = () => ({ items: [], pct: 0 });
      c._intv4FactText = () => 'Tus inversiones suman 118.400 US$ a 27 de septiembre.';
      const q = { id: 'q_current_value', family: 'structure', answer: { factKeys: ['f1'] } };
      const core = { ledger: { facts: [{ semanticKey: 'f1' }] },
        dataAvailability: { observation: { spanMs: 40 * DAY } } };
      const h = vm.runInContext('_intv4AnswerHtml(' + JSON.stringify(q) + ', ' + JSON.stringify(core)
        + ', s => String(s == null ? "" : s), ' + JSON.stringify(INTEL({})) + ')', c);
      return /118\.400/.test(h); })());

  // ── §3 · IDENTIDAD ESTABLE: EL PAR NO SE CRUZA ───────────────────────────
  ok('3.16 enunciado y respuesta se resuelven del MISMO `q` en la misma pasada',
    (() => { const src = fnSrc('_intv4ExploreHtml');
      return /_intv15ExploreLabel\(q, core, intel\)/.test(src)
        && /_intv4AnswerHtml\(q, core, esc, intel\)/.test(src)
        // …y la puerta anti-tautología compara la respuesta con SU propio enunciado
        && /_intv15ExploreLabel\(q, core, intel\)/.test(fnSrc('_intv4AnswerHtml')); })());
  ok('3.17 dos pasadas con la misma entrada dan exactamente el mismo par',
    ANS('q_liquidity') === ANS('q_liquidity')
    && ANS('q_diversification') === ANS('q_diversification'));

  // ── §37 · ES + EN ────────────────────────────────────────────────────────
  ok('3.18 los tres leads existen en EN con las MISMAS cifras',
    (() => { const l = ANS('q_liquidity', { lang: 'en' });
      const t = ANS('q_diversification', { lang: 'en' });
      const c2 = ANS('q_concentration', { lang: 'en' });
      return /4% of your financial portfolio is recorded as cash/.test(l)
        && !/remaining 96%|move with the market/.test(l)
        && /Your 3 largest positions are Microsoft, Bitcoin and Apple/.test(t)
        && /together they hold 77%/.test(t)
        && /Microsoft holds 31% of your financial portfolio/.test(c2)
        && !/explained|attribut/i.test(t + c2); })(),
    JSON.stringify([ANS('q_liquidity', { lang: 'en' }).slice(0, 80),
      ANS('q_diversification', { lang: 'en' }).slice(0, 80)]));
}

// ════════════════════════════════════════════════════════════════════════════
// §6 (CIERRE CORRECTIVO) · «HOY» NO PUBLICA UN AGREGADO HISTÓRICO
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§6 · Hoy: la fecha final de la serie no hace reciente a un acumulado:');
{
  const NOWT = T0 + 100 * DAY;
  const F = (o) => Object.assign({ semanticKey: 'recorded_capital_net',
    family: 'capital_flow', window: { range: 'all', startAt: T0, endAt: NOWT },
    values: { net: 5000, events: 4 } }, o || {});
  const R = (expr, f) => { const c = makeCtx('es');
    return vm.runInContext(expr + '(' + JSON.stringify(f) + (expr === '_aurixTodayEventAt' ? '' : '')
      + ')', c); };
  const fresh = (f) => { const c = makeCtx('es');
    return vm.runInContext('_aurixTodayFresh(' + JSON.stringify(f) + ', ' + NOWT + ')', c); };
  const recent = (f) => { const c = makeCtx('es');
    return vm.runInContext('_aurixTodayIsRecentClaim(' + JSON.stringify(f) + ')', c); };
  const dated = (f) => { const c = makeCtx('es');
    return vm.runInContext('_aurixTodayDatedAt(' + JSON.stringify(f) + ')', c); };

  // EL DEFECTO EXACTO DE LA CAPTURA: acumulado desde el primer día del registro,
  // ventana terminada hoy, sin instante de evento.
  ok('6.1 un acumulado de flujos sobre TODO el registro no es elegible para «Hoy»',
    recent(F()) === false,
    JSON.stringify({ recent: recent(F()), dated: dated(F()) }));
  ok('6.2 …aunque su ventana termine EXACTAMENTE ahora (que es lo que lo colaba)',
    dated(F()) === NOWT && fresh(F()) === true && recent(F()) === false);
  // LA DIRECCIÓN POSITIVA: un movimiento registrado hoy SÍ es noticia de hoy.
  ok('6.3 con el instante del ÚLTIMO movimiento dentro del horizonte, SÍ entra',
    (() => { const f = F({ values: { net: 5000, events: 4, lastActionAt: NOWT - 3600e3 } });
      return recent(f) === true && dated(f) === NOWT - 3600e3 && fresh(f) === true; })());
  ok('6.4 …y con ese instante FUERA del horizonte, la fecha del evento lo excluye',
    (() => { const f = F({ values: { net: 5000, events: 4, lastActionAt: T0 + DAY } });
      return recent(f) === true && dated(f) === T0 + DAY && fresh(f) === false; })(),
    JSON.stringify({ dated: dated(F({ values: { net: 5000, events: 4, lastActionAt: T0 + DAY } })) }));
  // LO QUE NO SE TOCA: una ventana NOMBRADA es una afirmación de recencia.
  ok('6.5 una deriva de 30 días que termina hoy SIGUE siendo un cambio reciente',
    (() => { const f = { semanticKey: 'cash_drift_30d', family: 'liquidity',
        window: { range: '30d', startAt: NOWT - 30 * DAY, endAt: NOWT }, values: {} };
      return recent(f) === true && fresh(f) === true; })());
  // …y una medición AS OF sobre `all` (un nivel, una rentabilidad) tampoco se
  // ve afectada: su fecha SÍ es el final de la ventana.
  ok('6.6 un NIVEL sobre todo el registro conserva su elegibilidad: no acumula eventos',
    (() => { const f = { semanticKey: 'investable_level', family: 'wealth_level',
        window: { range: 'all', startAt: T0, endAt: NOWT }, values: {} };
      return recent(f) === true; })());
  ok('6.7 el discriminador es declarado, no heurístico: familia o contador de eventos',
    (() => { const src = fnSrc('_aurixTodayIsRecentClaim');
      return /_AURIX_FACT_FAMILY\.CAPITAL_FLOW/.test(src)
        && /Number\.isFinite\(v\.events\)/.test(src)
        && /_AURIX_TODAY_HISTORICAL_RANGES/.test(src); })());
  ok('6.8 la actualidad se mide con el EVENTO por delante de la serie',
    (() => { const src = fnSrc('_aurixTodayDatedAt');
      const i = src.indexOf('const ev = _aurixTodayEventAt');
      const j = src.indexOf('Number.isFinite(w.endAt)');
      return i > 0 && j > i; })());
  ok('6.9 el instante sale del LEDGER, nunca del reloj del render',
    (() => { const src = fnSrc('_aurixCashLedgerAuthority');
      return /out\.lastFlowAt = cash\.reduce/.test(src) && !/Date\.now\(\)/.test(src); })());
  ok('6.10 …y viaja en el hecho para que la superficie no tenga que re-derivarlo',
    /lastActionAt: cashAuth\.lastFlowAt/.test(app));
  ok('6.11 el filtro se aplica en la selección de «Lo que importa hoy»',
    /\.filter\(st => _aurixTodayIsRecentClaim\(st\)\)/.test(fnSrc('_intv5MattersStories')));
}

// ════════════════════════════════════════════════════════════════════════════
// §18 / §19 · ANTI-REPETICIÓN
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§18 · «Puede que no hayas visto esto» no repite lo de arriba:');
{
  const WOW = (keys) => ({ wowInsights: keys.map(k => k === 'eff'
    ? { semanticKey: 'wow_nominal_vs_effective', values: { positions: 9, effectiveN: 4.3 } }
    : { semanticKey: 'wow_liquidity_down_while_concentrated',
        values: { cashDeltaPp: -4.2, topPositionPct: 31 } }) });
  const D = (core, texts, skip) => run('_intv4DiscoveryHtml(' + JSON.stringify(core)
    + ', s => String(s == null ? "" : s), ' + JSON.stringify(texts || [])
    + ', ' + JSON.stringify(skip || []) + ')');

  ok('18.1 la diversificación efectiva se publica si el anillo no la ha publicado',
    /data-wow="wow_nominal_vs_effective"/.test(D(WOW(['eff']), [], [])),
    D(WOW(['eff']), [], []).slice(0, 140));
  ok('18.2 …y NO se publica cuando el anillo de Salud publica esa MISMA magnitud',
    D(WOW(['eff']), [], ['wow_nominal_vs_effective']) === '');
  ok('18.3 …y entonces cede el sitio a una insight REALMENTE distinta',
    /data-wow="wow_liquidity_down_while_concentrated"/.test(
      D(WOW(['eff', 'liq']), [], ['wow_nominal_vs_effective'])));
  ok('18.4 sin nada distinto que decir el bloque se OCULTA, no se rellena',
    D({ wowInsights: [] }, [], []) === '');
  ok('18.5 el filtro de TEXTO se conserva: una conclusión ya publicada no se repite',
    D(WOW(['liq']), ['Tu liquidez bajó 4,2 pp mientras tu posición principal ya pesa el 31%'], []) === '');
  ok('18.6 la exclusión es por OWNER DE LA MAGNITUD, no por parecido de frase',
    /score && score\.score != null\) \? \['wow_nominal_vs_effective'\]/.test(app)
    && /skip\.has\(x\.semanticKey\)/.test(fnSrc('_intv4DiscoveryHtml')));
  ok('18.7 se anota como vista la clave PUBLICADA, no la primera del pool',
    /_wowKey = \(discoveryHtml\.match\(\/data-wow=/.test(app)
    && !/const wow = \(core\.wowInsights \|\| \[\]\)\[0\]/.test(app));
}

// ════════════════════════════════════════════════════════════════════════════
// §8 · FACTORES PRINCIPALES — explica, no rankea
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§8 · Factores: dependencia y clase de activo, que la lista no dice:');
{
  const DRV = (o) => { const c = makeCtx((o && o.lang) || 'es');
    c.__drivers = { items: (o && o.items) || [], pct: (o && o.pct != null) ? o.pct : 0 };
    const snap = { topCategory: (o && o.cat !== undefined) ? o.cat : { type: 'crypto', label: 'Cripto', pctTotal: 62 },
      categoryCount: (o && o.cats != null) ? o.cats : 3 };
    return vm.runInContext('_intv5DriversHtml(' + JSON.stringify(snap)
      + ', s => String(s == null ? "" : s), "")', c); };
  const P3 = [{ name: 'Microsoft', type: 'stock', pct: 31, pctRaw: 31.2, pctLabel: '31%' },
              { name: 'Bitcoin', type: 'crypto', pct: 25, pctRaw: 25.1, pctLabel: '25%' },
              { name: 'Apple', type: 'stock', pct: 21, pctRaw: 20.8, pctLabel: '21%' }];

  const three = DRV({ items: P3, pct: 77 });
  ok('8.1 con tres posiciones se publica la DEPENDENCIA conjunta, con su cifra real',
    /data-factor="dependency"/.test(three)
    && /Tus 3 mayores posiciones concentran el 77% de tu cartera financiera/.test(three)
    // §6 — sin afirmación causal: describe concentración del VALOR, no atribuye
    // el rendimiento a esas posiciones.
    && !/depende tu evolución|explican|atribu/i.test(three)
    && /el valor del conjunto se mueve sobre todo con ellas/.test(three)
    && /data-drv-dep="77"/.test(three),
    (three.match(/data-factor="dependency">([^<]*)</) || [, '?'])[1]);
  ok('8.2 …y el recuento es el REAL, nunca la constante tres',
    (() => { const two = DRV({ items: P3.slice(0, 2), pct: 56 });
      return /Tus 2 mayores posiciones concentran el 56% de tu cartera financiera/.test(two)
        && /data-drv-rows="2"/.test(two); })(),
    (DRV({ items: P3.slice(0, 2), pct: 56 }).match(/data-factor="dependency">([^<]*)</) || [, '?'])[1]);
  ok('8.3 con UNA sola posición no hay dependencia que explicar (§12 · anti-ruido)',
    (() => { const one = DRV({ items: P3.slice(0, 1), pct: 31 });
      return !/data-factor="dependency"/.test(one) && /data-drv-dep=""/.test(one); })());
  ok('8.4 sin cuota certificada tampoco se publica (fail closed)',
    !/data-factor="dependency"/.test(DRV({ items: P3, pct: 0 })));
  ok('8.5 se publica la CLASE DE ACTIVO dominante, que la lista de posiciones no dice',
    /data-factor="category"/.test(three)
    && /Por clase de activo, tu mayor exposición es Cripto, con el 62% de tu cartera financiera/.test(three)
    && /data-drv-cat="crypto"/.test(three),
    (three.match(/data-factor="category">([^<]*)</) || [, '?'])[1]);
  ok('8.6 con UNA sola categoría registrada no se publica: no explicaría nada',
    !/data-factor="category"/.test(DRV({ items: P3, pct: 77, cats: 1 })));
  ok('8.7 sin categoría certificada tampoco',
    !/data-factor="category"/.test(DRV({ items: P3, pct: 77, cat: null })));
  ok('8.8 sin posiciones no se publica ningún factor interpretativo',
    (() => { const none = DRV({ items: [], pct: 0 });
      return !/intv15-drv-factors/.test(none) && /intcc-empty-body/.test(none); })());
  ok('8.9 los dos factores comparten el denominador INVERTIBLE de las filas, y lo dicen'
    + ' con el vocabulario de producto (§20: «invertible» no se publica)',
    count(three, /de tu cartera financiera/g) === 2
    && !/invertible/i.test(three) && !/\bmaterial(es)?\b/i.test(three));
  ok('8.10 no se calcula ninguna cifra en la card: se publican las del owner',
    (() => { const src = fnSrc('_intv5DriversHtml');
      return !/[*/]\s*100/.test(src) && !/reduce\(/.test(src)
        && /drivers\.pct/.test(src) && /snap\.topCategory/.test(src); })());
  ok('8.11 los factores tienen estilo propio y se leen como nota, no como cuarta fila',
    /\.intv15-drv-factors \{/.test(css) && /\.intv15-drv-factor \{/.test(css)
    && /border-top/.test(css.slice(css.indexOf('.intv15-drv-factors'),
                                  css.indexOf('.intv15-drv-factors') + 300)));
  ok('8.12 ES + EN (§37), con las MISMAS cifras',
    (() => { const en = DRV({ items: P3, pct: 77, lang: 'en' });
      return /Your 3 largest positions hold 77% of your financial portfolio/.test(en)
        && /the value of the whole moves mainly with them/.test(en)
        && !/depends on|explained|attribut/i.test(en)
        && /By asset class, your largest exposure is Cripto, at 62% of your financial portfolio/.test(en)
        && !/\bmaterial\b/i.test(en); })(),
    (DRV({ items: P3, pct: 77, lang: 'en' }).match(/data-factor="dependency">([^<]*)</) || [, '?'])[1]);
}

// ════════════════════════════════════════════════════════════════════════════
// §12 · «LO QUE IMPORTA HOY» — ESTADO HONESTO, NUNCA RELLENO
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§12 · «Lo que importa hoy»: el vacío dice qué pasa, no que Aurix trabaje:');
{
  const M = (o) => { const c = makeCtx((o && o.lang) || 'es');
    c.__matters = { stories: [], rankedBy: 'engine', stale: !!(o && o.stale) };
    c._intv4FindingRows = () => [];
    const core = { ledger: { facts: (o && o.facts) || [] } };
    return vm.runInContext('_intv5MattersHtml(' + JSON.stringify(core)
      + ', s => String(s == null ? "" : s), "balanced", [], null, {}, "")', c); };

  ok('12.1 con el ledger YA leído y sin novedad se dice que no hay cambio material',
    (() => { const h = M({ facts: [{ semanticKey: 'cash_weight' }] });
      return /data-empty-state="intv15_brief_settled"/.test(h)
        && /no hay ningún cambio en tu patrimonio que merezca tu atención/.test(h)
        && !/está leyendo tu patrimonio/.test(h)
        // §20 del cierre anterior retiró «material» de la superficie visible: la
        // copy nueva no puede reintroducir la jerga que ya se había limpiado.
        && !/\bmaterial(es)?\b/i.test(h); })(),
    (M({ facts: [{ semanticKey: 'cash_weight' }] }).match(/class="intcc-empty-body">([^<]*)</) || [, '?'])[1]);
  ok('12.2 …y no se afirma un punto de partida que no es certificable',
    !/última revisión|last review/.test(M({ facts: [{ semanticKey: 'cash_weight' }] })));
  ok('12.3 sin NINGÚN hecho todavía se conserva la frase de lectura en curso',
    (() => { const h = M({ facts: [] });
      return /data-empty-state="intv4_brief_empty"/.test(h)
        && /está leyendo tu patrimonio/.test(h); })());
  ok('12.4 un dato rancio sigue teniendo precedencia sobre los dos anteriores',
    /data-empty-state="intv4_brief_stale"/.test(M({ facts: [{ semanticKey: 'x' }], stale: true })));
  ok('12.5 el discriminador es el LEDGER, no un reloj ni la marca de visita',
    (() => { const src = fnSrc('_intv5MattersHtml');
      return /core\.ledger && Array\.isArray\(core\.ledger\.facts\)/.test(src)
        && !/_intccReadVisitMarker|Date\.now\(\)/.test(src); })());
  ok('12.6 el estado vacío no se rellena con nada más (§12 · anti-ruido)',
    (() => { const h = M({ facts: [{ semanticKey: 'x' }] });
      return !/intv4-story-list/.test(h) && count(h, /class="intcc-empty-body"/g) === 1
        && !/intcc-surface-limit/.test(h); })());
  ok('12.7 ES + EN (§37)',
    (() => { const en = M({ facts: [{ semanticKey: 'x' }], lang: 'en' });
      return /nothing in your wealth worth your attention/.test(en)
        && !/\bmaterial\b/i.test(en); })());
}

// ════════════════════════════════════════════════════════════════════════════
// §4 (CIERRE CORRECTIVO) · DESCRIBIR SIN REGAÑAR
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§4 · Salud y avisos: una característica aceptada no es una incidencia:');
{
  const SCORE = { score: 47, tone: 'watch', band: 'weight_in_few',
    limiters: [{ tone: 'limit', key: 'spread', label: 'equivale a 2,1 posiciones de 4' }] };
  const CORE = (findings) => ({ findings: findings || [],
    ledger: { facts: [{ semanticKey: 'top_position_weight', value: 31,
      values: { pct: 31, name: 'Microsoft' } }] } });
  const INTEL = (intent) => ({ context: { fields: intent
    ? { concentration_intent: { value: intent, provenance: 'user_answer', answeredAt: T0 } } : {} } });
  const CH = (core, intel) => run('_intv5Chips(' + JSON.stringify(core) + ', '
    + JSON.stringify(SCORE) + ', ' + JSON.stringify(intel) + ')');

  ok('4.1 sin declarar nada, el limitador de reparto conserva su tono de aviso',
    (() => { const c = CH(CORE(), INTEL(null));
      const l = c.find(x => x.key === 'spread');
      return !!l && l.tone === 'limit' && !l.neutralised; })(),
    JSON.stringify(CH(CORE(), INTEL(null))));
  ok('4.2 declarada DELIBERADA y sin cambio vivo, el mismo limitador pasa a NEUTRO',
    (() => { const c = CH(CORE(), INTEL('deliberate'));
      const l = c.find(x => x.key === 'spread');
      return !!l && l.tone === 'context' && l.neutralised === 'declared_intent'; })(),
    JSON.stringify(CH(CORE(), INTEL('deliberate'))));
  ok('4.3 …y la CIFRA no se toca: el limitador sigue publicándose con su etiqueta',
    (() => { const a = CH(CORE(), INTEL(null)).find(x => x.key === 'spread');
      const b = CH(CORE(), INTEL('deliberate')).find(x => x.key === 'spread');
      return a.label === b.label && b.label.indexOf('2,1') !== -1; })());
  ok('4.4 un CAMBIO MATERIAL posterior de esa raíz restaura el aviso',
    (() => { const c = CH(CORE([{ rootCause: 'top_position', semanticKey: 'top_position_weight' }]),
        INTEL('deliberate'));
      const l = c.find(x => x.key === 'spread');
      return !!l && l.tone === 'limit'; })(),
    JSON.stringify(CH(CORE([{ rootCause: 'top_position' }]), INTEL('deliberate')).map(x => x.tone)));
  ok('4.5 declararse experto NO oculta la concentración ni sube el anillo',
    (() => { const src = fnSrc('_intv5Chips');
      // el tono es lo ÚNICO que cambia: no se filtra el limitador ni se toca `score`
      return /Object\.assign\(\{\}, l, \{ tone: 'context'/.test(src)
        && !/score\.score\s*[+*]/.test(src)
        && !/limiters[^\n]*filter\(/.test(src); })());
  ok('4.6 una respuesta SUPERADA no neutraliza nada (§4.1 sigue mandando)',
    (() => { const intel = { context: { fields: { concentration_intent: { value: 'deliberate',
        provenance: 'user_answer', answeredAt: T0, superseded: true } } } };
      const l = CH(CORE(), intel).find(x => x.key === 'spread');
      return !!l && l.tone === 'limit'; })());
  // ── EL ALCANCE DEL SCORE ─────────────────────────────────────────────────
  ok('4.7 el anillo DECLARA qué mide y qué no, en un canal real',
    (() => { const h = run('_intccScoreRingHtml({ score: 47 })');
      return /role="img"/.test(h) && !/aria-hidden/.test(h)
        && /data-health-scope="weight_dispersion"/.test(h)
        && /cómo se reparte el peso entre tus posiciones/.test(h)
        && /no es una nota a tus decisiones ni una medida de riesgo/.test(h); })(),
    (run('_intccScoreRingHtml({ score: 47 })').match(/aria-label="([^"]*)"/) || [, '?'])[1]);
  ok('4.8 …y sin la copy vuelve a ser decorativo en vez de anunciar una cifra pelada',
    (() => { const c = makeCtx('es');
      vm.runInContext('__T.intv16_health_scope = undefined;', c);
      const h = vm.runInContext('_intccScoreRingHtml({ score: 47 })', c);
      return /aria-hidden="true"/.test(h) && !/aria-label/.test(h); })());
  ok('4.8b la etiqueta VISIBLE nombra la magnitud y no repite el estado ni el título',
    (() => { const es = VAL_ES.intv17_health_metric;
      return typeof es === 'string' && es.length > 0 && es.length <= 40
        && /reparto|peso/i.test(es)
        && !/salud|débil|a vigilar|estable/i.test(es); })(),
    String(VAL_ES.intv17_health_metric));
  ok('4.9 el alcance existe en los dos idiomas (§37)',
    (() => { const en = vm.runInContext('_intccScoreRingHtml({ score: 47 })', makeCtx('en'));
      return /measures how weight is spread across your positions/.test(en)
        && /not a grade on your decisions nor a measure of risk/.test(en); })());
}

// ════════════════════════════════════════════════════════════════════════════
// §6 (CIERRE CORRECTIVO) · ANTI-REPETICIÓN ENTRE HOY Y CAMBIOS
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§6 · el mismo acontecimiento no se publica dos veces como novedad:');
{
  // CONTRATO RE-DECIDIDO (SPEC «Evolución real y cero repetición», 2026-09-30).
  ok('6.12 la exclusión se mide en «Qué ha cambiado», sobre lo que RENDERIZA (activo e historial)',
    /_intv4FindingRows\(core, \{ all: true, hoy: hoy \}\)/.test(fnSrc('_intv4ChangedHtml'))
    && /filter\(fd => !_intv17IsHoyEvent\(fd, hoy, active\.has/.test(fnSrc('_intv4FindingRows')));
  ok('6.13 …y la identidad es el EVENTO, nunca la clave semántica (sin veto por familia)',
    (() => { const src = fnSrc('_intv5MattersHtml');
      return /const _evId = \(x\) => String\(\(x && \(x\.eventId \|\| x\.conceptId\)\) \|\| ''\);/.test(src)
        && !/publishedEvents[^\n]*semanticKey/.test(src); })());
  // La REGLA es la misma; cambió su forma porque ahora el filtro también CUENTA
  // cuántas historias cedieron su sitio a «Qué ha cambiado» —lo que permite que
  // el estado vacío diga la verdad en vez de negar lo que el Hero afirma—.
  // CONTRATO RE-DECIDIDO (SPEC «Evolución real y cero repetición», 2026-09-30).
  ok('6.14 la identidad es EVENTO + HECHO (nunca raíz): un evento de raíz no arrastra a otro hecho',
    (() => { const src = fnSrc('_intv17IsHoyEvent');
      return /hoy\.pairs\.has\(id \+ '\|' \+ sk\)/.test(src) && !/causalRoot|rootCause/.test(src); })());
  ok('6.14b …y cuando TODO lo de hoy ya está abajo, la card lo dice en vez de negarlo',
    (() => { const src0 = fnSrc('_intv5MattersHtml');
      return /_cededToChanged/.test(src0)
        && /intv16_brief_in_changed/.test(src0)
        // y la frase existe en los DOS idiomas
        && (app.match(/\n\s+intv16_brief_in_changed:/g) || []).length === 2; })());
  ok('6.15 el historial revisado sigue rotulado como tal en su destino',
    /is-reviewed/.test(app) && /data-reviewed="\$\{x\.reviewed \? '1' : '0'\}"/.test(app));
}

// ════════════════════════════════════════════════════════════════════════════
// §7 (CIERRE CORRECTIVO) · PREGUNTAS: VERIFICAR EL ARREGLO EXISTENTE
// ════════════════════════════════════════════════════════════════════════════
// El §7 pide VERIFICAR, no rediagnosticar: la respuesta sí persistía y lo que
// aparecía era otra pregunta del catálogo (ya cerrado en §10). Aquí se ejercitan
// las condiciones que el §7 enumera y que no tenían assert propio.
console.log('\n§7 · persistencia, aislamiento y orden de respuestas:');
{
  // Se ejercita en el sandbox, con el store y el dueño inyectados por `env`.
  const c = makeCtx('es');
  vm.runInContext('const _AURIX_INTEL_CTX_KEY = "aurix_intel_ctx_v1";'
    + 'const _AURIX_INTEL_CTX_KEY_LEGACY = "aurix_auri_ctx_v1";', c);
  vm.runInContext('globalThis.__mk = function(){ var m = {}; return {'
    + ' getItem: function(k){ return (k in m) ? m[k] : null; },'
    + ' setItem: function(k,v){ m[k] = String(v); },'
    + ' removeItem: function(k){ delete m[k]; }, __m: m }; };', c);

  ok('7.1 el contexto lleva SELLO DE DUEÑO: otro usuario no lo lee',
    vm.runInContext('(function(){ var s = __mk();'
      + ' _aurixIntelWriteOwned(_AURIX_INTEL_CTX_KEY, { fields: { horizon: { value: "long" } } },'
      + '   { owner: "u1", store: s });'
      + ' var mine = _aurixIntelReadOwned(_AURIX_INTEL_CTX_KEY, { owner: "u1", store: s });'
      + ' var other = _aurixIntelReadOwned(_AURIX_INTEL_CTX_KEY, { owner: "u2", store: s });'
      + ' return !!mine && other === null; })()', c) === true);
  ok('7.2 sin dueño resuelto la escritura FALLA CERRADA (no se finge guardado)',
    vm.runInContext('(function(){ var s = __mk();'
      + ' return _aurixIntelWriteOwned(_AURIX_INTEL_CTX_KEY, { fields: {} }, { owner: null, store: s })'
      + '   === false; })()', c) === true);
  ok('7.3 responder PERSISTE la respuesta con su instante y su procedencia',
    vm.runInContext('(function(){ var s = __mk();'
      + ' var ok0 = _aurixIntelRecordAnswer("horizon", "long", { owner: "u1", store: s, now: 100 });'
      + ' var ctx = _aurixIntelContext({ owner: "u1", store: s });'
      + ' return ok0 === true && ctx.fields.horizon.value === "long"'
      + '   && ctx.fields.horizon.answeredAt === 100'
      + '   && ctx.fields.horizon.provenance === "user_answer"; })()', c) === true);
  ok('7.4 «prefiero no responder» se guarda y sobrevive a una nueva lectura',
    vm.runInContext('(function(){ var s = __mk();'
      + ' _aurixIntelDecline("horizon", { owner: "u1", store: s, now: 200 });'
      + ' var ctx = _aurixIntelContext({ owner: "u1", store: s });'
      + ' return ctx.declined.horizon === 200; })()', c) === true);
  // §7 — «una respuesta antigua/tardía no sobrescribe un contexto más reciente».
  // ── DEFECTO ENCONTRADO AL VERIFICAR (§7) ────────────────────────────────
  // El lector saneaba `asked`/`declined`/`pausedAt` DESPUÉS del retorno temprano
  // por «no hay campos». Quien sólo había declinado —o pausado— no tiene ningún
  // campo respondido, así que su rechazo se perdía en cada carga y la pregunta
  // volvía. Es el síntoma que el §7 manda verificar, en el estado más común de
  // quien no quiere responder.
  ok('7.4b REGRESIÓN · declinar SIN ninguna respuesta previa sobrevive a la recarga',
    vm.runInContext('(function(){ var s = __mk();'
      + ' _aurixIntelDecline("horizon", { owner: "u9", store: s, now: 700 });'
      + ' var ctx = _aurixIntelContext({ owner: "u9", store: s });'
      + ' return ctx.declined && ctx.declined.horizon === 700'
      + '   && ctx.answered === 0; })()', c) === true);
  ok('7.4c …y pausar sin haber respondido nada, también',
    vm.runInContext('(function(){ var s = __mk();'
      + ' _aurixIntelPauseQuestions({ owner: "u9", store: s, now: 800 });'
      + ' return _aurixIntelContext({ owner: "u9", store: s }).pausedAt === 800; })()', c) === true);
  ok('7.5 una respuesta TARDÍA pero más ANTIGUA no pisa a la más reciente',
    vm.runInContext('(function(){'
      + ' var nuevo = { fields: { horizon: { value: "long", answeredAt: 500 } } };'
      + ' var viejo = { fields: { horizon: { value: "short", answeredAt: 100 } } };'
      + ' var a = _aurixIntelCtxMerge(nuevo, viejo), b = _aurixIntelCtxMerge(viejo, nuevo);'
      + ' return a.fields.horizon.value === "long" && b.fields.horizon.value === "long"; })()', c) === true);
  ok('7.6 …y el merge es CONMUTATIVO, así que dos dispositivos no oscilan',
    vm.runInContext('(function(){'
      + ' var A = { fields: { horizon: { value: "long", answeredAt: 500 } }, asked: { q1: { at: 3, count: 1 } } };'
      + ' var B = { fields: { horizon: { value: "short", answeredAt: 100 } }, asked: { q1: { at: 9, count: 2 } } };'
      + ' return JSON.stringify(_aurixIntelCtxMerge(A, B)) === JSON.stringify(_aurixIntelCtxMerge(B, A)); })()', c) === true);
  ok('7.7 el silencio se deriva del MÁXIMO answeredAt del PROPIO dueño, no de un global',
    /provenance !== 'user_answer'/.test(fnSrc('_aurixIntelQuestions'))
    && /owner !== owner/.test(fnSrc('_aurixIntelReadOwned').replace('obj.owner !== owner', 'owner !== owner')));
  ok('7.8 …y un cambio material sigue pudiendo reabrir la necesidad de contexto',
    /if \(lastAnswerAt > 0 && now - lastAnswerAt < _AURIX_INTEL_Q_AFTER_ANSWER_MS\) return \[\];/
      .test(fnSrc('_aurixIntelQuestions'))
    && /now > 0 && !pol\.materialReopen/.test(fnSrc('_aurixIntelQuestions')));
  ok('7.9 no se ha creado estado ni tabla nueva para esto',
    !/_AURIX_INTEL_Q_STATE_KEY|intelligence_questions|aurix_intel_q_/.test(app));
}

// ════════════════════════════════════════════════════════════════════════════
// §25 / §36 · PRESENTACIÓN Y RESPONSIVE
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§25/§36 · presentación: el alto sigue al contenido y nada se sale de su caja:');
{
  // ── INVARIANTE CARA DEL PROYECTO ──────────────────────────────────────────
  // «Toda card de Intelligence debe declarar `order` en ≤1023px o se pinta ANTES
  // DEL HERO». Los tres estados nuevos REUTILIZAN cards existentes en vez de
  // crear superficie: es lo que hace que la invariante ya esté cumplida, y este
  // assert lo demuestra en vez de darlo por hecho.
  ok('25.1 los estados nuevos viven en cards YA pineadas: cero superficie nueva',
    /class="intcc-card intcc-radar intv6-radar intv7-radar"/.test(app)
    && /class="intcc-card intcc-timeline intv4-memory is-stable"/.test(app)
    // …y ninguna de las clases nuevas recibe una posición de rejilla propia, que
    // es cómo aparecería una card sin `order` delante del hero.
    && !/\.intv1[56]-[a-z-]+\s*\{[^}]*grid-(column|row)/.test(css)
    && !/\.is-stable\s*\{[^}]*grid-(column|row)/.test(css));
  ok('25.2 `.intcc-radar` y `.intcc-timeline` declaran su `order` bajo 1024px',
    /\.intcc-radar\s+\{ order: \d+; \}/.test(css)
    && /\.intcc-timeline\s+\{ order: \d+; \}/.test(css),
    JSON.stringify([(css.match(/\.intcc-radar\s+\{ order: \d+; \}/) || [''])[0],
                    (css.match(/\.intcc-timeline\s+\{ order: \d+; \}/) || [''])[0]]));
  ok('25.3 ninguna superficie nueva fija alto ni anima: el contenido pone la altura',
    ['intv15-stable-list', 'intv15-stable-row',
     'intv15-drv-factors', 'intv15-drv-factor'].every((cls) => {
      const i = css.indexOf('.' + cls + ' {');
      if (i < 0) return false;
      const block = css.slice(i, css.indexOf('}', i));
      return !/(^|[^-])height:\s*\d/.test(block) && !/animation/.test(block); }));
  // ── LA LECCIÓN DEL `nowrap` QUE PINTA FUERA DE SU CAJA ────────────────────
  // Costó un P0 visual en Workspace y el §2 manda preservar la contención: un
  // `<text>` de SVG no se recorta solo, así que la única garantía es que el
  // viewBox lo contenga. Con el marco fijo de cinco eso vuelve a ser una
  // constante, pero la DERIVACIÓN se conserva: es lo que lo demuestra en vez de
  // confiarlo a un número escrito a mano.
  // REMATE §4 — la contención del texto deja de ser un problema de geometría:
  // la leyenda es HTML y se pinta al tamaño que declara. Lo que se exige ahora es
  // que ese tamaño esté POR ENCIMA del suelo de legibilidad, que es lo que el
  // texto dentro del SVG no podía garantizar.
  // Los rótulos pasan de una LISTA bajo la figura a CINCO RÓTULOS junto a sus
  // vértices. El suelo de 11 px sigue siendo el contrato —es lo que motivó
  // sacarlos del SVG— y ahora se mide en sus selectores nuevos, incluido el
  // tamaño que declaran en el breakpoint de teléfono.
  ok('25.4 los rótulos del radar se declaran por encima del suelo de 11 px',
    // `.intcc-radar-val` desaparece con la cifra, así que el suelo se mide en
    // los selectores que QUEDAN: el rótulo base y el que redeclara el teléfono.
    // Pulido geométrico: el tamaño es UNA variable (`--rl-fs`) que consume la
    // única regla del rótulo; se exige el suelo en cada declaración de ella.
    (() => { const fsd = [...css.matchAll(/--rl-fs:\s*([\d.]+)px/g)].map(m => Number(m[1]));
      if (/\.intcc-radar-label \{[^}]*font-size:\s*var\(--rl-fs\)/.test(css.replace(/\s+/g, ' ')))
        return fsd.length >= 2 && fsd.every(v => v >= 11);
      const idxs = [];
      const re = /\.intcc-radar-label \{/g;
      let m; while ((m = re.exec(css))) idxs.push(m.index);
      // …y también los que el breakpoint de móvil vuelve a declarar.
      const mob = css.indexOf('@media (max-width: 480px)');
      if (mob >= 0) { const blk = css.slice(mob, css.indexOf('\n}', mob));
        const re2 = /\.intcc-radar-label \{[^}]*\}/g; let m2;
        while ((m2 = re2.exec(blk))) idxs.push(mob + m2.index); }
      if (idxs.length < 2) return false;
      return idxs.every((i) => {
        const fs = Number((css.slice(i, css.indexOf('}', i)).match(/font-size:\s*([\d.]+)px/) || [, 99])[1]);
        return fs >= 11; }); })(),
    JSON.stringify((css.match(/\.intcc-radar-label \{[^}]*font-size:\s*[\d.]+px/g) || [])
      .map(x => (x.match(/font-size:\s*[\d.]+px/) || [''])[0])));
  ok('25.4b …y el SVG no conserva ningún texto que pudiera escalarse por debajo',
    !/<text/.test(fnSrc('_intccRadarSvg'))
    && !/intcc-radar-labels/.test(fnSrc('_intccRadarSvg'))
    && /aria-hidden="true"/.test(fnSrc('_intccRadarSvg'))
    // Y la posición de cada rótulo se DERIVA de la geometría del pentágono
    // (`pt(i, R)`), no de una tabla escrita a mano que se desincronizaría.
    && /pt\(i, R\)/.test(fnSrc('_intccRadarSvg')));
  // ── §8 · CONTRASTE Y PROFUNDIDAD, MEDIDOS EN LA HOJA ────────────────────
  // «Menos azul oscuro sobre azul oscuro»: la lectura de estabilidad es un
  // RESULTADO y se apoya en una superficie más profunda que el panel, no en otro
  // azul. Se comprueba el canal AZUL del fondo, que es lo que distingue el negro
  // profundo del azul de tarjeta — no un juicio sobre una captura.
  ok('25.4b la lectura de estabilidad usa negro profundo, no otro azul de panel',
    (() => { const i = css.indexOf('.intv4-memory.is-stable .intv15-stable-list {');
      if (i < 0) return false;
      const blk = css.slice(i, css.indexOf('}', i));
      const m = blk.match(/background:\s*rgba\((\d+),(\d+),(\d+)/);
      if (!m) return false;
      const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
      // profundo: los tres canales bajos, y el azul sin dominar la mezcla
      return r <= 12 && g <= 14 && b <= 24 && (b - r) <= 14; })(),
    (css.slice(css.indexOf('.intv4-memory.is-stable .intv15-stable-list {')).match(/background:[^;]+;/) || [''])[0]);
  ok('25.4c el titular y las cifras quedan CLAROS sobre esa superficie',
    (() => { const head = css.indexOf('.intv4-memory.is-stable .intv15-stable-head {');
      const row = css.indexOf('.intv4-memory.is-stable .intv15-stable-row {');
      if (head < 0 || row < 0) return false;
      const a = (css.slice(head, css.indexOf('}', head)).match(/rgba\([^)]*,\s*([\d.]+)\)/) || [, 0])[1];
      const b = (css.slice(row, css.indexOf('}', row)).match(/rgba\([^)]*,\s*([\d.]+)\)/) || [, 0])[1];
      return Number(a) >= 0.9 && Number(b) >= 0.75 && Number(a) > Number(b); })());
  ok('25.4d …y la cobertura sigue siendo un PIE en el estado estable, y CONTENIDO sin comparación',
    (() => { const base = css.indexOf('.intv4-memory .intv4-mem-coverage {');
      const noc = css.indexOf('.intv4-memory.is-coverage[data-no-comparison="1"] .intv4-mem-coverage {');
      if (base < 0 || noc < 0) return false;
      const fa = (css.slice(base, css.indexOf('}', base)).match(/font-size:\s*([\d.]+)px/) || [, 0])[1];
      const fb = (css.slice(noc, css.indexOf('}', noc)).match(/font-size:\s*([\d.]+)px/) || [, 0])[1];
      return Number(fb) > Number(fa); })());
  // La regla `:empty { display:none }` protegía una fila que ya no existe: con
  // la superficie retirada, lo que hay que sostener es que nadie la reintroduzca
  // por la hoja de estilos.
  ok('25.5 la fila sin evidencia no sobrevive en la hoja como estilo huérfano',
    !/intv16-radar-none/.test(css));
  // ── §36 · EL RADAR ADAPTATIVO NO SE RECORTA EN NINGÚN TAMAÑO ──────────────
  // El SVG escala por su viewBox (`width:100%; height:auto`), así que demostrar la
  // contención en unidades de viewBox la demuestra en los seis anchos del §36 a la
  // vez: 360, 375, 390, 768, 1024 y 1440. Eso es lo que hace comprobable aquí algo
  // que de otro modo exigiría navegador.
  ok('25.6 el SVG escala por viewBox, así que la contención es independiente del ancho',
    /\.intcc-radar-svg \{ width: 100%; max-width: 380px; height: auto; \}/.test(css)
    && /\.intcc-radar-svg \{ max-width: 100%; \}/.test(css));
  ok('25.7 …y los cinco rótulos salen en los DOS idiomas, sin una sola cifra',
    (() => {
      const V = { diversification: 30, stability: 80, liquidity: 7, growth: 40, concentration: 31 };
      const cases = [[], ['growth'], ['stability', 'growth']];
      return ['es', 'en'].every((lang) => {
        const c = makeCtx(lang);
        return cases.every((unav) => {
          const dims = DIMS(unav);
          const vals = {}; Object.keys(V).forEach(k => { if (unav.indexOf(k) === -1) vals[k] = V[k]; });
          const h = vm.runInContext('_intccRadarSvg(' + JSON.stringify(vals) + ', '
            + JSON.stringify(dims) + ')', c);
          return count(h, /class="intcc-radar-vlabel"/g) === 5
            && count(h, /class="intcc-radar-val"/g) === 0
            && count(h, /class="intcc-radar-label"/g) === 5
            && !/<text/.test(h); }); }); })());
  // CONTRATO SUSTITUIDO con la estructura: no hay columnas que colapsar porque
  // no hay lista. Lo que el teléfono necesita ahora es que el rótulo tenga ancho
  // suficiente para no partir una palabra — que es el defecto que trajo la
  // leyenda estrecha («Ampl / itud / de / cate / goría / s»).
  ok('25.8 en teléfono el rótulo tiene ancho propio y NUNCA parte una palabra',
    (() => { const flat = css.replace(/\s+/g, ' ');
      return /\.intcc-radar-vlabel \{[^}]*white-space: nowrap/.test(flat)
        && /\.intcc-radar-label \{[^}]*overflow-wrap: normal/.test(flat)
        && !/\.intcc-radar-label \{[^}]*overflow-wrap: anywhere/.test(flat); })(),
    'el rótulo del radar no puede usar `overflow-wrap: anywhere`');
  // §3 — la etiqueta de métrica es VISIBLE, compacta y no duplica el estado.
  // Se mide la EMISIÓN, no la presencia de la cadena: con `class="…"` dentro de
  // una rama muerta el grep seguía verde. La condición tiene que ser la copy.
  // CONTRATO RE-DECIDIDO (SPEC «Evolución real y cero repetición», 2026-09-30).
  ok('25.9 «Salud» es título, anillo y estado: la etiqueta de métrica ya no se emite',
    !/intv17-health-metric/.test(fnSrc('_renderIntelligenceCommandCenter').replace(/\/\*[\s\S]*?\*\//g, '')),
    'intv17_health_metric');
}

// ════════════════════════════════════════════════════════════════════════════
// §28 · NO CHATBOT — el SPEC lo declara fuera de alcance
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§28 · Nada de este trabajo abre una superficie conversacional:');
{
  const OWNERS = ['_intccRadarSvg', '_intv7RadarHtml', '_intv15StableRows',
    '_intv15MemoryIsStable', '_intv15ExploreLabel', '_intv4DiscoveryHtml'].map(fnSrc).join('\n');
  ok('28.1 ningún owner nuevo introduce caja de texto, chat ni streaming',
    !/<textarea|<input[^>]*type="text"|contenteditable|EventSource|stream/i.test(OWNERS));
  ok('28.2 …ni un control nuevo enfocable en la card del radar',
    !/<button|<details|<summary|tabindex/.test(fnSrc('_intv7RadarHtml')));
  ok('28.3 …ni en la lectura de estabilidad',
    !/<button|<details|<summary|tabindex|onclick/.test(fnSrc('_intv4MemoryHtml')));
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
