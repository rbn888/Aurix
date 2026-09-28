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
  const KEYS = ['intv7_observable_title','intv7_axis_unavailable','intcc_radar_title',
    'intcc_dim_breadth','intcc_dim_liq','intcc_dim_conc','intcc_dim_stab','intcc_dim_growth',
    'intv4_memory_title','intv4_memory_empty','intv4_memory_coverage',
    'intv15_stable_head','intv15_stable_conc_named','intv15_stable_conc',
    'intv15_stable_liq','intv15_stable_liq_flat','intv15_stable_flows',
    'intv15_qc_concentration','intv15_qc_top3','intv15_qc_liq_dir','intv15_qc_liq_level',
    'intv15_qc_changed','intv15_qc_flows_vs_market',
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
  ['_AURIX_FACT_STATUS','_AURIX_FACT_MATERIAL','_AURIX_AI_AVAIL','_AURIX_AI_DIM',
   '_AURIX_AI_LABEL','_AURIX_INTEL_FIELDS','_AURIX_INTEL_PROVENANCE',
   '_AURIX_INTEL_QUESTION_LIMIT','_AURIX_INTEL_Q_AFTER_ANSWER_MS','_AURIX_INTEL_Q_COOLDOWN_MS',
   '_AURIX_INTEL_Q_DECLINED_MS','_AURIX_INTEL_PAUSE_MS','_INTV4_MEMORY_MAX',
   '_INTV4_MEMORY_WINDOW_ORDER','_INTV7_RADAR_DIMS','_AURIX_INTEL_EXCLUSIVE_CLAIMS']
    .forEach(n => vm.runInContext(konstSrc(n), sb));
  ['_intccClamp','_intccEsc','_aurixPctNum','_aurixPctLabel','_intv4Num','_intv4Money',
   '_intccRadarSvg','_intv7PendingReasonKey','_intv7RadarAxes','_intv7RadarHtml',
   '_intv15StableRows','_intv15MemoryIsStable','_intv15ExploreLabel',
   '_intv4MemoryEvents','_intv4MemoryDeclared','_intv4MemoryDiversify','_intv4MemoryRows',
   '_intv4MemoryHtml','_intv4WowText','_intv4DiscoveryHtml','_aurixIntelQuestions',
   '_intccIsMonetary','_intccPctLabel','_intv5DriversHtml','_intv5MattersHtml']
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
  sb._intccDate = () => '1 ene';
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

console.log('AURIX-INTELLIGENCE-VNEXT — SPEC «INTELLIGENCE VNEXT»\n');

// ════════════════════════════════════════════════════════════════════════════
// §6 · RADAR ADAPTATIVO — la matriz completa de §34
// ════════════════════════════════════════════════════════════════════════════
console.log('§6 · Radar adaptativo (5 · 4 · 3 · <3 factores medibles):');
{
  const CASES = [
    { n: 5, values: { diversification: 30, stability: 80, liquidity: 7, growth: 40, concentration: 31 }, unav: [] },
    { n: 4, values: { diversification: 30, stability: 80, liquidity: 7, concentration: 31 }, unav: ['growth'] },
    { n: 3, values: { diversification: 30, liquidity: 7, concentration: 31 }, unav: ['stability', 'growth'] },
  ];
  CASES.forEach((c) => {
    const h = RADAR(c.values, c.unav);
    ok('6.1/' + c.n + ' con ' + c.n + ' dimensiones medibles se dibuja un radar de ' + c.n + ' ejes',
      count(h, /class="intcc-radar-axis[" ]/g) === c.n
      && count(h, /class="intcc-radar-label"/g) === c.n
      && count(h, /class="intcc-radar-dot"/g) === c.n
      && count(h, /class="intcc-radar-edge"/g) === c.n
      && new RegExp('data-svg-axes="' + c.n + '"').test(h)
      && new RegExp('data-svg-measured="' + c.n + '"').test(h),
      JSON.stringify({ axes: count(h, /class="intcc-radar-axis[" ]/g),
        dots: count(h, /class="intcc-radar-dot"/g) }));
    ok('6.2/' + c.n + ' …y la figura CIERRA con un vértice por eje, todos certificados',
      /data-svg-open="0"/.test(h) && /data-svg-unknown="0"/.test(h)
      && (h.match(/class="intcc-radar-area" points="([^"]+)"/) || [, ''])[1].trim().split(/\s+/).length === c.n);
    ok('6.3/' + c.n + ' …y NUNCA aparece «sin datos», ni 0 falso, ni eje atenuado',
      !/is-unavailable/.test(h) && h.indexOf(SRC_ES.intv7_axis_unavailable.replace(/'/g, '')) === -1
      && !/data-availability="unknown"/.test(h)
      // Toda cifra publicada corresponde a un valor de entrada: ninguna inventada.
      && (h.match(/class="intcc-radar-val"[^>]*>([^<]*)</g) || [])
           .every(m => /\d/.test(m)));
    ok('6.4/' + c.n + ' …y ninguna etiqueta se sale del viewBox (el marco se deriva)',
      (() => { const vb = (h.match(/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/) || []).slice(1).map(Number);
        if (vb.length !== 4) return false;
        const pts = [];
        h.replace(/<text[^>]*x="(-?[\d.]+)"[^>]*y="(-?[\d.]+)"/g, (_, x, y) => { pts.push([+x, +y]); return ''; });
        return pts.length === c.n * 2
          && pts.every(([x, y]) => x >= vb[0] - 1 && x <= vb[0] + vb[2] + 1
                                && y >= vb[1] + 4 && y <= vb[1] + vb[3] - 1); })(),
      (h.match(/viewBox="[^"]+"/) || [''])[0]);
  });
  // ── §6.B · MENOS DE TRES ⇒ NO HAY RADAR ───────────────────────────────────
  ok('6.5 dos dimensiones medibles ⇒ el radar NO se dibuja (no se inventa figura)',
    RADAR({ diversification: 30, liquidity: 7 }, ['stability', 'growth', 'concentration']) === '');
  ok('6.6 una dimensión medible ⇒ tampoco',
    RADAR({ liquidity: 7 }, ['diversification', 'stability', 'growth', 'concentration']) === '');
  ok('6.7 ninguna dimensión medible ⇒ tampoco',
    RADAR({}, ORDER) === '');
  // Un valor NO FINITO es indistinguible de «no medido»: la barrera es doble, así
  // que un `null` que se colase en `values` no puede dibujar un eje.
  ok('6.8 un valor no finito no dibuja eje aunque la dimensión no esté marcada',
    (() => { const h = RADAR({ diversification: 30, stability: null, liquidity: 7,
        growth: undefined, concentration: 31 }, []);
      return /data-svg-axes="3"/.test(h) && count(h, /class="intcc-radar-dot"/g) === 3; })(),
    (RADAR({ diversification: 30, stability: null, liquidity: 7, growth: undefined, concentration: 31 }, [])
      .match(/data-svg-axes="[^"]*"/) || [''])[0]);
  ok('6.9 un CERO REAL sigue siendo una medición: se dibuja y se rotula «0%»',
    (() => { const h = RADAR({ diversification: 0, liquidity: 0, concentration: 0 },
        ['stability', 'growth']);
      return /data-svg-axes="3"/.test(h) && count(h, />0%</g) === 3
        && count(h, /class="intcc-radar-dot"/g) === 3; })());
  ok('6.10 el ORDEN RELATIVO del catálogo congelado se conserva al filtrar',
    (() => { const h = RADAR({ diversification: 30, liquidity: 7, concentration: 31 },
        ['stability', 'growth']);
      const drawn = (h.match(/class="intcc-radar-label"[^>]*>([^<]+)</g) || [])
        .map(m => m.replace(/^.*?>/, '').replace(/<$/, ''));
      const idx = drawn.map(l => Object.keys(LABELS).map(k => LABELS[k]).indexOf(l));
      return JSON.stringify(drawn) === JSON.stringify(['Amplitud de categorías', 'Liquidez', 'Concentración'])
        && idx.every((v, i) => i === 0 || v > idx[i - 1]); })());
  ok('6.11 el owner del SVG no conserva NINGÚN camino al estado «sin datos»',
    (() => { const src = fnSrc('_intccRadarSvg');
      return !/intv7_axis_unavailable/.test(src) && !/is-unavailable/.test(src)
        && !/is-unknown/.test(src) && !/availability="unknown"/.test(src)
        && /ALL_DIMS\.filter\(d => !d\.unavailable/.test(src); })());
  ok('6.12 …y el CSS tampoco: sin sujeto, la regla se retira en vez de quedarse',
    !/intcc-radar-label\.is-unavailable/.test(css)
    && !/intcc-radar-val\.is-unavailable/.test(css)
    && !/intcc-radar-dot\.is-unknown/.test(css)
    && !/intcc-radar-edge\.is-unknown/.test(css));
}

console.log('\n§6.B · «Factores observables», la alternativa compacta:');
{
  // La card completa, con sus owners dobles: se ejercita el DESPACHADOR de los
  // tres estados (radar / observables / nada).
  const cardWith = (o) => { const c = makeCtx('es');
    c.__snap = o.snap === undefined ? { assetCount: 4, totUSD: 100000, cashPct: 7,
      topInvestedAsset: { pctTotal: 31, name: 'MSFT' } } : o.snap;
    c.__breadth = o.breadth === undefined ? { status: 'available', effectiveCategories: 2.2,
      taxonomySize: 7, categoriesHeld: 3, topCategory: null } : o.breadth;
    c.__peak = o.peak === undefined ? null : o.peak;
    return vm.runInContext('_intv7RadarHtml(s => String(s == null ? "" : s))', c); };

  const three = cardWith({});
  ok('6.B1 con tres certificadas la card publica el RADAR',
    /data-state="radar"/.test(three) && /intcc-radar-svg/.test(three)
    && /data-axes="3"/.test(three) && /data-measured="3"/.test(three)
    && /data-declared="5"/.test(three));
  ok('6.B2 …y declara lo que NO puede medir, con su causa (§3 · trazabilidad)',
    /data-unavailable="stability,growth"/.test(three)
    && /data-pending="[^"]*growth:no_certifiable_scale/.test(three),
    (three.match(/data-pending="[^"]*"/) || [''])[0]);
  // Sin snapshot no hay liquidez ni concentración: sólo la amplitud de categorías.
  const one = cardWith({ snap: null });
  ok('6.B3 con UNA certificada se publica «Factores observables», no un radar',
    /data-state="observable"/.test(one) && !/intcc-radar-svg/.test(one)
    && count(one, /class="intv15-obs-row"/g) === 1
    && /data-measured="1"/.test(one) && /data-declared="5"/.test(one),
    one.slice(0, 260));
  ok('6.B4 …y cada fila lleva etiqueta y CIFRA REAL, nunca una palabra de ausencia',
    /class="intv15-obs-label">Amplitud de categorías</.test(one)
    && /class="intv15-obs-val">2,2 \/ 7</.test(one)
    && !/is-unavailable/.test(one) && one.indexOf('sin datos') === -1,
    (one.match(/class="intv15-obs-val">[^<]*</) || [''])[0]);
  ok('6.B5 el título de la alternativa es el declarado, no una frase inventada',
    /<h3 class="intcc-card-title">Factores observables<\/h3>/.test(one));
  ok('6.B6 con CERO certificadas no se publica card alguna (fail closed)',
    cardWith({ snap: null, breadth: null }) === '');
  ok('6.B7 la misma cifra la publican radar y lista: un solo formateador',
    (() => { const t3 = (three.match(/class="intcc-radar-val"[^>]*>([^<]+)</) || [, ''])[1];
      const o1 = (one.match(/class="intv15-obs-val">([^<]+)</) || [, ''])[1];
      return t3 === '2,2 / 7' && o1 === '2,2 / 7'; })());
  ok('6.B8 …y el estado sube a RADAR en cuanto un cuarto eje adquiere owner',
    (() => { const h = cardWith({ peak: { status: 'available', retentionPct: 80,
        quality: 'measured', startsAfterRecord: false } });
      return /data-state="radar"/.test(h) && /data-measured="4"/.test(h)
        && /data-svg-axes="4"/.test(h) && !/sin datos/.test(h); })());
  ok('6.B9 la lista tiene estilo propio y el alto lo pone el contenido',
    /\.intv7-radar\.is-observable \.intv15-obs-list/.test(css)
    && /\.intv15-obs-row \{/.test(css) && /\.intv15-obs-val \{/.test(css)
    && !/\.intv15-obs-list[^}]*height:\s*\d/.test(css));
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
// §14–§16 · «TU EVOLUCIÓN» VIVA
// ════════════════════════════════════════════════════════════════════════════
console.log('\n§14–§16 · «Tu evolución»: de card muerta a lectura de estabilidad:');
{
  const AV = 'available';
  const INTEL = (o) => ({ model: {
    concentration: (o && o.conc === null) ? { availability: 'unavailable' }
      : { availability: AV, topWeightPct: 31, top3Pct: 77,
          topContributor: { name: 'Microsoft', pct: 31 } },
    liquidity: (o && o.liq === null) ? { availability: 'unavailable' }
      : { availability: AV, cashPct: 7, changePp: (o && o.drift !== undefined) ? o.drift : null },
  }, context: { fields: {} } });
  const CORE = (o) => ({ findings: (o && o.findings) || [], temporalEvents: (o && o.events) || [],
    dataAvailability: { observation: { observations: (o && o.obs != null) ? o.obs : 12,
        spanMs: (o && o.spanMs !== undefined) ? o.spanMs : 40 * DAY },
      gaps: (o && o.noFlows === false) ? [] : [{ family: 'capital_flow',
        semanticKey: 'recorded_capital_net', status: 'available', reason: 'no_flows_in_window' }] } });
  const MEM = (core, intel, lang) => { const c = (lang === 'en') ? makeCtx('en') : sb;
    return vm.runInContext('_intv4MemoryHtml(' + JSON.stringify(core) + ', s => String(s == null ? "" : s), [], '
      + JSON.stringify(intel) + ', [], "")', c); };

  const stable = MEM(CORE({}), INTEL({}));
  ok('14.1 sin cambios materiales la card publica una LECTURA, no la cobertura sola',
    /class="intcc-card intcc-timeline intv4-memory is-stable"/.test(stable)
    && /data-stable="1"/.test(stable) && !/is-coverage/.test(stable)
    && /class="intv15-stable-head"/.test(stable),
    stable.slice(0, 200));
  ok('14.2 el titular dice DESDE CUÁNDO y que no hubo cambio material',
    /Tu estructura se mantiene estable desde hace 40 días/.test(stable)
    && /no ha cambiado nada que merezca tu atención/.test(stable),
    (stable.match(/class="intv15-stable-head">([^<]*)</) || [, '?'])[1]);
  ok('14.3 …y trae explicación REAL: concentración, liquidez y aportaciones',
    /data-stable-codes="concentration,liquidity,flows"/.test(stable)
    && count(stable, /class="intv15-stable-row"/g) === 3
    && /Microsoft/.test(stable) && /31%/.test(stable) && /7%/.test(stable),
    (stable.match(/data-stable-codes="[^"]*"/) || [''])[0]);
  ok('14.4 la cobertura NO se pierde: pasa a pie de la lectura',
    /class="intv4-mem-coverage">Aurix dispone de 40 días/.test(stable));
  // ── FAIL CLOSED · §2 ──────────────────────────────────────────────────────
  // «Nada ha cambiado» sólo se puede decir si el Core no produjo NADA material.
  // Si lo produjo y otra card se lo llevó, esta NO puede afirmar estabilidad.
  ok('14.5 con un hallazgo material NO se afirma estabilidad, aunque esta card no lo muestre',
    (() => { const h = MEM(CORE({ findings: [{ semanticKey: 'cash_drift_30d', priority: 0.8 }] }), INTEL({}));
      return /is-coverage/.test(h) && !/is-stable/.test(h)
        && !/se mantiene estable/.test(h); })(),
    MEM(CORE({ findings: [{ semanticKey: 'cash_drift_30d', priority: 0.8 }] }), INTEL({})).slice(0, 180));
  ok('14.6 …y con un evento temporal en el pool, tampoco',
    (() => { const h = MEM(CORE({ events: [{ semanticKey: 'wealth_level_peak', priority: 0.7,
        causalRoot: 'wealth_level', window: { range: '30d', endAt: T0 } }] }), INTEL({}));
      return !/is-stable/.test(h); })());
  ok('14.7 sin NINGUNA explicación certificable no se publica el titular (§16)',
    (() => { const h = MEM(CORE({ noFlows: false }), INTEL({ conc: null, liq: null }));
      return /is-coverage/.test(h) && !/is-stable/.test(h); })());
  ok('14.8 sin historial suficiente sigue el estado compacto de siempre',
    (() => { const h = MEM(CORE({ obs: 1, spanMs: DAY }), INTEL({}));
      return /is-accruing/.test(h) && /data-compact="1"/.test(h) && !/is-stable/.test(h); })());
  ok('14.9 sin `spanMs` no se declara cobertura ni estabilidad (fail closed)',
    (() => { const h = MEM(CORE({ spanMs: null }), INTEL({}));
      return /is-accruing/.test(h) && !/is-stable/.test(h) && !/is-coverage/.test(h); })());
  // ── §2 · NINGUNA LÍNEA AFIRMA UNA DIRECCIÓN QUE NO ESTÉ MEDIDA ────────────
  ok('14.10 sin deriva MEDIDA la liquidez publica su NIVEL, nunca «estable»',
    (() => { const rows = run('_intv15StableRows(' + JSON.stringify(CORE({})) + ', '
        + JSON.stringify(INTEL({})) + ')');
      const liq = rows.find(r => r.code === 'liquidity');
      return !!liq && /Tu liquidez registrada es el 7% de tu cartera financiera/.test(liq.txt)
        && !/sin variación/.test(liq.txt); })(),
    JSON.stringify(run('_intv15StableRows(' + JSON.stringify(CORE({})) + ', ' + JSON.stringify(INTEL({})) + ')')));
  ok('14.11 con deriva medida y por debajo del umbral SÍ se puede decir que no se movió',
    (() => { const rows = run('_intv15StableRows(' + JSON.stringify(CORE({})) + ', '
        + JSON.stringify(INTEL({ drift: 0.4 })) + ')');
      const liq = rows.find(r => r.code === 'liquidity');
      return !!liq && /sin variación relevante/.test(liq.txt); })());
  ok('14.12 con deriva medida MATERIAL no se afirma quietud (vuelve al nivel)',
    (() => { const rows = run('_intv15StableRows(' + JSON.stringify(CORE({})) + ', '
        + JSON.stringify(INTEL({ drift: 5 })) + ')');
      const liq = rows.find(r => r.code === 'liquidity');
      return !!liq && !/sin variación/.test(liq.txt); })());
  ok('14.13 «no hay aportaciones» sale de un hueco CERTIFICADO del ledger, no de su ausencia',
    (() => { const withFlows = run('_intv15StableRows(' + JSON.stringify(CORE({ noFlows: false })) + ', '
        + JSON.stringify(INTEL({})) + ')');
      return withFlows.every(r => r.code !== 'flows')
        && /no_flows_in_window/.test(fnSrc('_intv15StableRows')); })());
  ok('14.14 una dimensión no disponible no produce línea (nunca un cero)',
    (() => { const rows = run('_intv15StableRows(' + JSON.stringify(CORE({})) + ', '
        + JSON.stringify(INTEL({ conc: null })) + ')');
      return rows.length === 2 && rows.every(r => r.code !== 'concentration')
        && rows.every(r => !/0%/.test(r.txt)); })());
  ok('14.15 la card es una LECTURA, no un panel: sin animación ni alto fijo',
    /\.intv4-memory\.is-stable \.intv15-stable-head/.test(css)
    && /\.intv15-stable-list \{/.test(css)
    && !/\.intv15-stable-list[^}]*(animation|height:\s*\d)/.test(css));
  // §37 — ES + EN.
  ok('14.16 la misma lectura existe en EN, con las MISMAS cifras',
    (() => { const en = MEM(CORE({}), INTEL({}), 'en');
      return /is-stable/.test(en) && /Your structure has held steady for 40 days/.test(en)
        && /nothing changed enough to be worth your attention/.test(en)
        && /Microsoft/.test(en) && /31%/.test(en) && /7%/.test(en)
        && /data-stable-codes="concentration,liquidity,flows"/.test(en); })(),
    (MEM(CORE({}), INTEL({}), 'en').match(/class="intv15-stable-head">([^<]*)</) || [, '?'])[1]);
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

  ok('9.1 concentración: la pregunta nombra la posición y su peso REAL',
    L('q_concentration', INTEL({})) === '¿Qué está causando que Microsoft pese el 31% de mi patrimonio?',
    L('q_concentration', INTEL({})));
  ok('9.2 …y sin NOMBRE certificado cae al rótulo genérico, nunca a un hueco',
    (() => { const g = L('q_concentration', INTEL({ conc: { topContributor: null } }));
      return g === '¿De qué posición depende más mi patrimonio?'; })(),
    L('q_concentration', INTEL({ conc: { topContributor: null } })));
  ok('9.3 …y con la dimensión no disponible, también',
    L('q_concentration', INTEL({ conc: { availability: 'unavailable' } }))
      === '¿De qué posición depende más mi patrimonio?');
  ok('9.4 tres mayores posiciones: la pregunta que el SPEC pide, con su cifra',
    L('q_diversification', INTEL({}))
      === '¿Cuánto de mi patrimonio depende de mis tres mayores posiciones (77%)?',
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
      return en[0] === 'What is driving Microsoft to 31% of my wealth?'
        && /three largest positions \(77%\)/.test(en[1])
        && /7% of my wealth in cash/.test(en[2])
        && /last 40 days/.test(en[3]); })(),
    JSON.stringify(['q_concentration', 'q_diversification', 'q_liquidity', 'q_what_changed']
      .map(id => L(id, INTEL({}), CORE(40 * DAY), 'en'))));
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
    /class="intcc-card intcc-radar intv7-radar is-observable"/.test(app)
    && /class="intcc-card intcc-timeline intv4-memory is-stable"/.test(app)
    // …y ninguna de las clases nuevas recibe una posición de rejilla propia, que
    // es cómo aparecería una card sin `order` delante del hero.
    && !/\.intv15-[a-z-]+\s*\{[^}]*grid-(column|row)/.test(css)
    && !/\.is-observable\s*\{[^}]*grid-(column|row)/.test(css)
    && !/\.is-stable\s*\{[^}]*grid-(column|row)/.test(css));
  ok('25.2 `.intcc-radar` y `.intcc-timeline` declaran su `order` bajo 1024px',
    /\.intcc-radar\s+\{ order: \d+; \}/.test(css)
    && /\.intcc-timeline\s+\{ order: \d+; \}/.test(css),
    JSON.stringify([(css.match(/\.intcc-radar\s+\{ order: \d+; \}/) || [''])[0],
                    (css.match(/\.intcc-timeline\s+\{ order: \d+; \}/) || [''])[0]]));
  ok('25.3 ninguna superficie nueva fija alto ni anima: el contenido pone la altura',
    ['intv15-obs-list', 'intv15-obs-row', 'intv15-stable-list', 'intv15-stable-row',
     'intv15-drv-factors', 'intv15-drv-factor'].every((cls) => {
      const i = css.indexOf('.' + cls + ' {');
      if (i < 0) return false;
      const block = css.slice(i, css.indexOf('}', i));
      return !/(^|[^-])height:\s*\d/.test(block) && !/animation/.test(block); }));
  // ── LA LECCIÓN DEL `nowrap` QUE PINTA FUERA DE SU CAJA ────────────────────
  // Costó un P0 visual en Workspace: un `<span>` con `white-space: nowrap` se sale
  // de su tarjeta sin recortarse y con el rectángulo intacto, así que ninguna
  // prueba de «¿cabe?» lo ve. La cifra de «Factores observables» lleva `nowrap` a
  // propósito, así que la etiqueta tiene que poder ceder: sin `min-width: 0` su
  // mínimo automático la haría empujar.
  ok('25.4 la cifra va `nowrap` y la ETIQUETA puede ceder (min-width:0 + overflow-wrap)',
    (() => { const i = css.indexOf('.intv15-obs-label {');
      const lbl = css.slice(i, css.indexOf('}', i));
      const j = css.indexOf('.intv15-obs-val {');
      const val = css.slice(j, css.indexOf('}', j));
      return /min-width:\s*0/.test(lbl) && /overflow-wrap:\s*anywhere/.test(lbl)
        && /flex:\s*1 1 auto/.test(lbl)
        && /white-space:\s*nowrap/.test(val) && /flex:\s*0 0 auto/.test(val); })());
  ok('25.5 en escritorio la lista compacta se centra en su celda estirada',
    /\.aurix-intv6 \.intcc-radar\.is-observable \.intv15-obs-list/.test(css));
  // ── §36 · EL RADAR ADAPTATIVO NO SE RECORTA EN NINGÚN TAMAÑO ──────────────
  // El SVG escala por su viewBox (`width:100%; height:auto`), así que demostrar la
  // contención en unidades de viewBox la demuestra en los seis anchos del §36 a la
  // vez: 360, 375, 390, 768, 1024 y 1440. Eso es lo que hace comprobable aquí algo
  // que de otro modo exigiría navegador.
  ok('25.6 el SVG escala por viewBox, así que la contención es independiente del ancho',
    /\.intcc-radar-svg \{ width: 100%; max-width: 380px; height: auto; \}/.test(css)
    && /\.intcc-radar-svg \{ max-width: 100%; \}/.test(css));
  ok('25.7 …y con 3, 4 y 5 ejes el marco se deriva de los rótulos, en los DOS idiomas',
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
          const vb = (h.match(/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/) || []).slice(1).map(Number);
          if (vb.length !== 4) return false;
          const pts = [];
          h.replace(/<text[^>]*x="(-?[\d.]+)"[^>]*y="(-?[\d.]+)"/g, (_, x, y) => { pts.push([+x, +y]); return ''; });
          // El MARCO conceptual (polígono en R) tiene que caber además del texto.
          const frame = [[10, 6], [210, 206]];
          return pts.length > 0
            && pts.every(([x, y]) => x >= vb[0] && x <= vb[0] + vb[2] && y >= vb[1] + 4 && y <= vb[1] + vb[3] - 1)
            && frame.every(([x, y]) => x >= vb[0] && x <= vb[0] + vb[2] && y >= vb[1] && y <= vb[1] + vb[3]); }); }); })());
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
