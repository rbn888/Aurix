'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-INT-TRUTH-FOUNDATION-harness — SPEC INT.01 · Intelligence Truth Foundation
// ════════════════════════════════════════════════════════════════════════════
// Intelligence is the future Premium surface, and before INT.01 it was the only
// surface with ZERO gate coverage. The Foundation Audit demonstrated four ways it
// could publish something financially false:
//
//   1. TWO health scores over the SAME snapshot (_aurixHealthScore vs a private
//      _intccHealthScore) diverging up to ~25 points, with the tone crossing:
//      "solid" in Workspace, "to watch" in Intelligence, one tap apart.
//   2. Growth computed as (last − first)/first over portfolioHistory, so a
//      10.000 € DEPOSIT on 10.000 € published "+100%" with 0% market return.
//   3. The radar's Growth axis FABRICATED from portfolio composition
//      (45 + cryptoPct*0.25 + …) when no return was measurable — a synthetic
//      "Crecimiento 70/100" on a two-day-old portfolio.
//   4. A Timeline mixing valid events with a drawdown computed on GROSS wealth
//      (a 30.000 € withdrawal published as "fell 30%") and liquidity crossings
//      read from `categoryHistory`, a source the code itself declares NOT a
//      display authority.
//
// A directed financial review of the first INT.01 implementation then found that
// wiring the existing flow-neutral TWR engine was ALSO unsafe — not because its
// arithmetic is wrong but because its INPUT is raw `portfolioHistory`, i.e. TOTAL
// net worth INCLUDING REAL ESTATE, unfiltered by epoch/trust. So INT.01 closes
// with Intelligence publishing NO return figure at all, and sections 2–4 below
// certify that barrier — including executable proof of the finding itself.
//
// The review also found this gate had HIDDEN the defects by stubbing away the
// very conditions under test (a pass-through `formatBase`, epoch 0). The currency
// chain is now the real code with a non-USD base currency. Section 11 proves the
// gate is NOT VACUOUS: reverting each protection makes its assertion fail.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
function konstSrc(name){ const s='const '+name+' ='; const i=app.indexOf(s); if(i<0) throw new Error('missing const '+name);
  let k=i, depth=0, started=false; for(;k<app.length;k++){ const c=app[k]; if(c==='('||c==='{'||c==='[') {depth++;started=true;} else if(c===')'||c==='}'||c===']') depth--; else if(c===';'&&(!started||depth===0)) { k++; break; } }
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c,info){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(info?'  ['+info+']':''));} }

const DAY = 86400000;
// Fixed base instant so the suite is deterministic.
const T0 = 1750000000000;
const USD_TO_EUR = 0.92;

// ── i18n stub: shaped exactly like T[lang], only the keys these owners read ──
const T = {
  healthScoreEmpty: '—',
  healthScoreSolid: 'Salud sólida', healthScoreModerate: 'Atención moderada',
  healthScoreElevated: 'Riesgo elevado', healthScoreHigh: 'Riesgo alto',
  healthScoreExplainSolid: 'exp-solid', healthScoreExplainModerate: 'exp-moderate',
  healthScoreExplainElevated: 'exp-elevated', healthScoreExplainHigh: 'exp-high',
  intcc_band_empty: '—',
  intcc_band_excellent: 'Excelente', intcc_band_good: 'Buena',
  intcc_band_watch: 'A vigilar', intcc_band_limited: 'Limitada',
  intcc_dim_div: 'Diversificación', intcc_dim_liq: 'Liquidez',
  intcc_dim_conc: 'Concentración', intcc_dim_stab: 'Estabilidad',
  intcc_dim_growth: 'Crecimiento',
  intv7_axis_unavailable: 'sin datos',
  intcc_radar_title: 'Radar',
  intcc_tl_cross: amt => `Tu patrimonio superó ${amt}`,
  intcc_tl_ath: 'Máximo histórico de tu patrimonio',
  intcc_tl_drop: pct => `Tu patrimonio retrocedió un ${pct}%`,
  intcc_tl_liq10: 'Tu liquidez bajó del 10%',
  intcc_tl_liq_up: 'Tu liquidez subió por encima del 15%',
  intcc_read_healthy: 'saludable', intcc_read_balanced: 'equilibrada',
  intcc_read_growing: 'Tu cartera está generando rendimiento',
  intcc_read_attention: 'atención', intcc_read_concentrated: 'concentrado',
  intcc_sub_healthy: 's-healthy', intcc_sub_balanced: 's-balanced',
  intcc_sub_growing: pct => `rendimiento ${pct}%`,
  intcc_sub_attention: 's-attention',
  intcc_sub_concentrated: name => `s-conc ${name}`,
};

// The axis labels above are a COPY of the production dictionary, and a stale copy
// is how this gate broke when INT.07 renamed the axis. Pin the copy to app.js:
// drift now fails here instead of silently asserting against a label nobody ships.
for (const k of ['intcc_dim_div','intcc_dim_liq','intcc_dim_conc','intcc_dim_stab',
                 'intcc_dim_growth','intv7_axis_unavailable']) {
  const m = app.match(new RegExp('\\n\\s*' + k + ":\\s*'([^']+)'"));
  if (!m) throw new Error('i18n key missing from app.js: ' + k);
  if (m[1] !== T[k]) throw new Error('stale harness label for ' + k + ': harness="' + T[k] + '" app="' + m[1] + '"');
}

// ── sandbox factory (one per scenario family, so mutants cannot leak) ────────
// INT.01 REVIEW LESSON — the first version of this gate stubbed away precisely
// the conditions it needed to certify: `formatBase` was a pass-through (hiding
// that the real one FORMATS without CONVERTING) and `_aurixPortfolioEpoch`
// returned 0. A directed financial review found five defects the gate was blind
// to. So the currency chain below is the REAL code — real `formatBase`, real
// `formatCurrency`, real `toBase`, a NON-USD base currency and a real FX rate.
function makeCtx(extraFns) {
  const sb = { Math, Number, JSON, Array, String, Object, Set, Date, isFinite, Intl,
    console: { warn(){}, log(){}, debug(){} }, window: {} };
  vm.createContext(sb);
  sb.t = k => T[k];
  sb._escapeWorkspaceText = s => String(s == null ? '' : s);
  sb.portfolioHistory = [];
  sb.categoryHistory = [];
  sb.__flows = [];
  sb._aurixLoadCapitalFlows = () => sb.__flows;
  sb._aurixPortfolioEpoch = () => 0;
  sb.lang = 'es';
  sb.baseCurrency = 'EUR';
  sb.usdToEur = USD_TO_EUR;
  sb._aurixFxRate = c => ({ USD: 1, EUR: USD_TO_EUR })[String(c).toUpperCase()];
  ['formatCurrency','formatBase','toBase'].forEach(n => vm.runInContext(fnSrc(n), sb));
  vm.runInContext(konstSrc('_AURIX_TWR_COVERAGE_JUMP'), sb);
  ['_aurixUsdSnapshotsForRange','_aurixTwrChain','computeAurixTWRSeries','_intccClamp','_intccEsc',
   '_aurixHealthScore','_intccScoreTone','_intccHealthScore','_intccGrowthPct',
   '_intccRadar','_intccRadarSvg','_intccTimeline','_intccReading','_intccIdentity','_intv4T']
    .forEach(n => vm.runInContext(fnSrc(n), sb));
  (extraFns || []).forEach(src => vm.runInContext(src, sb));
  return sb;
}
const sb = makeCtx();
const run = (expr, ctx) => vm.runInContext(expr, ctx || sb);

// Daily snapshot series helper: USD values at T0 + i days (production shape).
const series = vals => vals.map((v, i) => ({ ts: T0 + i * DAY, value: v }));

// Snapshot shape produced by _aurixHealthSnapshot(), built directly: what is
// under test is the SCORE, not the snapshot builder.
function snapOf(o) {
  return {
    assetCount: o.assetCount != null ? o.assetCount : 4,
    totUSD: o.totUSD != null ? o.totUSD : 100000,
    categoryCount: o.categoryCount != null ? o.categoryCount : 3,
    cryptoPct: o.cryptoPct || 0,
    cashPct: o.cashPct != null ? o.cashPct : 10,
    topInvestedAsset: o.top1 == null ? null : { pctTotal: o.top1, type: o.top1Type || 'crypto', name: 'TOP' },
    topCategory: o.topCat == null ? null : { pctTotal: o.topCat, type: o.topCatType || 'crypto', label: 'Cripto' },
    worstAsset: o.worst24h == null ? null : { change24h: o.worst24h },
  };
}
const SNAP = snapOf({ top1: 40, topCat: 45, cryptoPct: 20 });

console.log('AURIX-INT-TRUTH-FOUNDATION — SPEC INT.01 · Intelligence Truth Foundation\n');

// ════════════════════════════════════════════════════════════════════════════
// 1 · ONE HEALTH SCORE — Intelligence cannot contradict the canonical owner
// ════════════════════════════════════════════════════════════════════════════
console.log('1 · Single canonical health score (SPEC 5.A):');
{
  ok('1.1 _intccHealthScore delegates to the canonical _aurixHealthScore',
    /_aurixHealthScore\(snap\)/.test(fnSrc('_intccHealthScore')));
  ok('1.2 _intccHealthScore no longer runs a private deduction ladder',
    !/s\s*-=\s*\d/.test(fnSrc('_intccHealthScore')));
  ok('1.3 the canonical engine keeps its own methodology (unchanged deductions)',
    /s\s*-=\s*topIsRE\s*\?\s*8\s*:\s*25/.test(fnSrc('_aurixHealthScore')));

  // Sweep a grid of real snapshot shapes. The two surfaces must agree on the
  // NUMBER and on the published SEMANTIC LABEL, for every one of them.
  const grid = [];
  [null, 30, 45, 55, 65, 80, 95].forEach(top1 => {
    [1, 2, 3, 5].forEach(cats => {
      [0, 25, 55, 70].forEach(crypto => {
        [0, 5, 40, 65, 80].forEach(cash => {
          [null, -20, 5].forEach(worst24h => {
            grid.push(snapOf({ top1, categoryCount: cats, cryptoPct: crypto, cashPct: cash,
              topCat: top1 == null ? null : Math.max(top1, 30), worst24h,
              assetCount: cats === 1 ? 1 : 4 }));
          });
        });
      });
    });
  });
  let maxDelta = 0, labelMismatch = 0, bandMismatch = 0;
  for (const s of grid) {
    const canon = run('_aurixHealthScore(' + JSON.stringify(s) + ')');
    const intel = run('_intccHealthScore(' + JSON.stringify(s) + ', { pct: 72 })');
    const d = Math.abs((canon.score || 0) - (intel.score || 0));
    if (d > maxDelta) maxDelta = d;
    if (canon.label !== intel.label) labelMismatch++;
    const expect = intel.score == null ? 'empty'
      : (intel.score >= 80 ? 'solid' : intel.score >= 60 ? 'moderate' : intel.score >= 40 ? 'elevated' : 'high');
    if (intel.band !== expect) bandMismatch++;
  }
  ok('1.4 same snapshot ⇒ identical score on both surfaces (' + grid.length + ' snapshots, max Δ = ' + maxDelta + ')',
    maxDelta === 0, 'maxDelta=' + maxDelta);
  ok('1.5 same snapshot ⇒ identical published semantic label', labelMismatch === 0, 'mismatches=' + labelMismatch);
  ok('1.6 the Intelligence band token IS the canonical 80/60/40 partition', bandMismatch === 0, 'mismatches=' + bandMismatch);

  let toneCross = 0;
  for (const s of grid) {
    const r = run('_intccHealthScore(' + JSON.stringify(s) + ', { pct: 72 })');
    if (r.score == null) continue;
    const toneExpect = r.score >= 80 ? 'green' : r.score >= 60 ? 'lime' : r.score >= 40 ? 'amber' : r.score >= 20 ? 'orange' : 'red';
    if (r.tone !== toneExpect) toneCross++;
    if ((r.band === 'solid') !== (r.tone === 'green')) toneCross++;
  }
  ok('1.7 label band and visual tone come from the SAME split (no internal crossing)',
    toneCross === 0, 'crossings=' + toneCross);

  ok('1.8 fail closed: an empty snapshot publishes no score on either surface',
    run('_intccHealthScore(' + JSON.stringify(snapOf({ assetCount: 0, totUSD: 0 })) + ', null)').score === null
    && run('_aurixHealthScore(' + JSON.stringify(snapOf({ assetCount: 0, totUSD: 0 })) + ')').score === null);
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · NO RETURN FIGURE IS PUBLISHABLE — the INT.01 barrier
// ════════════════════════════════════════════════════════════════════════════
console.log('2 · Intelligence publishes NO return figure (SPEC 5.B / 5.D):');
{
  const gSrc = fnSrc('_intccGrowthPct');
  ok('2.1 the naive portfolio-value arithmetic is gone from the owner',
    !/first\.value/.test(gSrc) && !/portfolioHistory/.test(gSrc));
  ok('2.2 the owner does not consume the contaminated TWR series either',
    !/computeAurixTWRSeries/.test(gSrc.replace(/\/\/[^\n]*/g, '')));
  // fnSrc() starts at the `function` keyword, so the contract comment lives in
  // the region immediately ABOVE it.
  const gDoc = app.slice(Math.max(0, app.indexOf('function _intccGrowthPct(') - 3200),
                         app.indexOf('function _intccGrowthPct('));
  // SUPERSEDED BY INT.02 — INT.01 froze this owner at `return null` because no
  // certified investable series existed. INT.02 built one
  // (`_aurixInvestablePerformance`), and SPEC INT.02 §6 states explicitly that it
  // replaces the "publish no return" barrier once that owner is certified. So the
  // assertion here is no longer "never a number" but "a number ONLY from the
  // certified owner". THE OWNER ITSELF IS CERTIFIED BY
  // AURIX-INT-INVESTABLE-PERFORMANCE-harness (cases A–L); this section owns only
  // the CONSUMER contract, so the owner is stubbed HERE ON PURPOSE — that is a
  // contract boundary, not a hidden condition.
  ok('2.3 the owner is sourced exclusively from _aurixInvestablePerformance',
    /_aurixInvestablePerformance\('all'\)/.test(gSrc) && /perf\.valid !== true/.test(gSrc));
  ok('2.4 the contract documents the investable owner and forbids portfolioHistory',
    /INVESTABLE/i.test(gDoc) && /real estate/i.test(gDoc) && /portfolioHistory/.test(gDoc));

  const withPerf = (perf) => {
    const m = makeCtx();
    m.__perf = perf;
    vm.runInContext('function _aurixInvestablePerformance(){ return __perf; }', m);
    vm.runInContext(fnSrc('_intccGrowthPct'), m);   // re-bind to the stub
    return run('_intccGrowthPct()', m);
  };
  ok('2.5 valid === true ⇒ Intelligence publishes exactly the owner\'s figure',
    withPerf({ valid: true, returnPct: 7.25 }) === 7.25);
  // Every fail-closed reason the owner can return must yield NO figure.
  const reasons = ['insufficient_observations', 'insufficient_clean_data', 'invalid_observation',
    'window_too_short', 'baseline_not_comparable', 'fx_unavailable', 'unexplained_capital_event',
    'interval_fallback:2', 'awaiting_canonical_history', 'error:boom'];
  let leaked = null;
  for (const rs of reasons) {
    if (withPerf({ valid: false, returnPct: null, fallbackReason: rs }) !== null) leaked = rs;
    // even if a figure is present alongside valid:false it must NOT be published
    if (withPerf({ valid: false, returnPct: 42, fallbackReason: rs }) !== null) leaked = rs + '(+figure)';
  }
  ok('2.6 every fail-closed reason yields NO figure (' + reasons.length + ' reasons)',
    leaked === null, String(leaked));
  ok('2.7 a non-finite returnPct is never published',
    withPerf({ valid: true, returnPct: NaN }) === null && withPerf({ valid: true, returnPct: null }) === null);
  ok('2.8 a missing owner fails closed', (() => {
    const m = makeCtx(); vm.runInContext(fnSrc('_intccGrowthPct'), m);
    return run('_intccGrowthPct()', m) === null; })());

  // The INT.01 finding, kept as executable knowledge: the LEGACY headless engine
  // still reads raw total-wealth USD history, so it would certify a real-estate
  // revaluation as return. It is deliberately not the publishable owner.
  sb.portfolioHistory = series([400000, 400000, 400000, 440000, 440000, 440000, 440000]);
  sb.__flows = [];   // a real-estate valuation edit writes NO capital flow
  const engine = run("computeAurixTWRSeries('all')");
  ok('2.9 FINDING (still true): the legacy engine certifies a real-estate revaluation as +' +
     (engine.deltaPct != null ? engine.deltaPct.toFixed(1) : '?') + '% return',
    engine.valid === true && engine.fallbackReason === null && engine.deltaPct > 9,
    JSON.stringify({ valid: engine.valid, reason: engine.fallbackReason, d: engine.deltaPct }));
  ok('2.10 and Intelligence never consumes it', !/computeAurixTWRSeries/.test(gSrc));

  ok('2.11 the certified TWR engine keeps its own contract',
    /_AURIX_TWR_COVERAGE_JUMP\s*=\s*40/.test(app)
    && /Modified-/.test(app) && /flow_coverage_insufficient/.test(app));
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · NO GROWTH AXIS — absent, never synthetic
// ════════════════════════════════════════════════════════════════════════════
console.log('\n3 · The return axis is absent, not fabricated (SPEC 5.E):');
{
  const radarSrc = fnSrc('_intccRadar');
  ok('3.1 the composition heuristic is gone from the owner',
    !/45\s*\+\s*crypto\s*\*\s*0\.25/.test(radarSrc) && !/\/stock\|etf\|crypto\//.test(radarSrc));
  ok('3.2 an unmeasurable axis is null, never a number',
    /growthPct\s*!=\s*null\)/.test(radarSrc) && /:\s*null/.test(radarSrc));

  // The audit's exact scenario: 2-day-old, 60%-crypto portfolio ⇒ used to be 70.
  const s = snapOf({ top1: 60, top1Type: 'crypto', topCat: 60, topCatType: 'crypto', cryptoPct: 60, categoryCount: 2, cashPct: 5 });
  sb.portfolioHistory = series([10000, 10500, 11000]);
  sb.__flows = [];
  // Driven EXPLICITLY with an uncertified return (null), not via an absent owner:
  // the point under test is the radar's handling of "no evidence".
  const radar = run('_intccRadar(' + JSON.stringify(s) + ', { pct: 80 }, null)');
  ok('3.3 an uncertified return leaves the axis null — not 70, not 55, not 50, not 0', radar.growth === null, 'growth=' + radar.growth);
  ok('3.4 the structural axes are still published',
    [radar.diversification, radar.liquidity, radar.concentration, radar.stability].every(Number.isFinite));

  // INT.02 — a CERTIFIED return does publish the axis; anything uncertified does
  // not. The axis is a function of the certified figure alone, never of history
  // shape or composition.
  const axisFor = g => run('_intccRadar(' + JSON.stringify(s) + ', { pct: 80 }, ' + JSON.stringify(g) + ')').growth;
  ok('3.5 a certified return publishes the axis; an uncertified one never does',
    Number.isFinite(axisFor(10)) && axisFor(null) === null,
    'g=10 → ' + axisFor(10) + ' | g=null → ' + axisFor(null));

  const svg = run('_intccRadarSvg(' + JSON.stringify(radar) + ')');
  // ── RE-CERTIFIED BY FOUNDER DECISION (INT.07) ────────────────────────────
  // INT.01 removed the axis outright. The founder's INT.07 contract keeps the
  // FRAME — "el marco de cinco ejes debe permanecer visible porque esas son las
  // cinco dimensiones conceptuales" — and marks the axis `unavailable` instead.
  // The INVARIANT INT.01 actually protects is unchanged and still asserted below:
  // no fabricated value, no placeholder number, and NO vertex at the centre.
  ok('3.6 the frame keeps its five conceptual axes; the absent one is attenuated',
    (svg.match(/class="intcc-radar-axis[^"]*"/g) || []).length === 5
    && (svg.match(/class="intcc-radar-axis is-unavailable"/g) || []).length === 1,
    'axes=' + (svg.match(/class="intcc-radar-axis[^"]*"/g) || []).length);
  ok('3.7 the absent dimension publishes its NAME but never a figure',
    svg.indexOf(T.intcc_dim_growth) !== -1
    && (svg.match(/class="intcc-radar-val[^"]*"/g) || []).length === 5
    && /class="intcc-radar-val is-unavailable"[^>]*>[^<0-9]+</.test(svg),
    (svg.match(/class="intcc-radar-val is-unavailable"[^>]*>([^<]*)</) || [, '?'])[1]);
  ok('3.8 the data polygon has 4 vertices — the absent axis gets NO vertex at all',
    (svg.match(/class="intcc-radar-area" points="([^"]+)"/) || [, ''])[1].trim().split(/\s+/).length === 4
    && (svg.match(/class="intcc-radar-dot"/g) || []).length === 4);
  ok('3.9 no "0", "50" or "—" placeholder value is emitted for the absent axis',
    !/intcc-radar-val[^"]*"[^>]*>(0|50|55|—|null|NaN)</.test(svg));
  ok('3.9b "unavailable" is never drawn at the centre (0 and unknown differ)',
    (() => { const pts = (svg.match(/class="intcc-radar-area" points="([^"]+)"/) || [, ''])[1].trim().split(/\s+/);
      return pts.length === 4 && pts.indexOf('110.0,106.0') === -1; })(),
    (svg.match(/class="intcc-radar-area" points="([^"]+)"/) || [, ''])[1]);
  ok('3.10 the wealth-identity cascade cannot read a fabricated return',
    /Number\.isFinite\(radar\.growth\)/.test(fnSrc('_intccIdentity')));
  ok('3.11 identity does not classify as "growth" with an absent return axis',
    run('_intccIdentity(' + JSON.stringify(s) + ', ' + JSON.stringify(radar) + ')') !== 'growth');
  // RE-CERTIFIED (INT.07): the frame no longer disappears — the founder requires
  // it always visible. What must never happen is a VALUE without evidence, so the
  // assertion moves from "no radar" to "no certified value but one".
  ok('3.12 one certified dimension ⇒ frame intact, no area, exactly one vertex',
    (() => { const one = run('_intccRadarSvg({ diversification: 50, liquidity: null, concentration: null, stability: null, growth: null })');
      return one !== '' && (one.match(/class="intcc-radar-axis[^"]*"/g) || []).length === 5
        && !/intcc-radar-area/.test(one)
        && (one.match(/class="intcc-radar-dot"/g) || []).length === 1
        && (one.match(/class="intcc-radar-val is-unavailable"/g) || []).length === 4; })());

  // Dropping an axis re-lays out every label. The viewBox is FIXED, so the only
  // real visual risk is a clipped label — and because the viewBox scales, proving
  // containment here proves it on every viewport at once.
  const fitsViewBox = svgStr => {
    const vb = (svgStr.match(/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/) || []).slice(1).map(Number);
    if (vb.length !== 4) return false;
    const [minX, minY, w, hgt] = vb;
    const coords = [];
    svgStr.replace(/<text[^>]*x="(-?[\d.]+)"[^>]*y="(-?[\d.]+)"/g, (_, x, y) => { coords.push([+x, +y]); return ''; });
    if (!coords.length) return false;
    return coords.every(([x, y]) => x >= minX - 1 && x <= minX + w + 1 && y >= minY + 4 && y <= minY + hgt - 1);
  };
  ok('3.13 every label of the 4-axis radar stays inside the fixed viewBox (no clipping)',
    fitsViewBox(svg), svg.match(/viewBox="[^"]+"/)?.[0]);
  ok('3.14 the 5-axis geometry still fits (kept intact for the future series)',
    fitsViewBox(run('_intccRadarSvg({ diversification: 100, liquidity: 100, concentration: 100, stability: 100, growth: 100 })')));
}

// ════════════════════════════════════════════════════════════════════════════
// 4 · THE HERO CANNOT NARRATE A RETURN
// ════════════════════════════════════════════════════════════════════════════
console.log('\n4 · No return narrative reaches the hero:');
{
  const readingFor = g => {
    const radar = run('_intccRadar(' + JSON.stringify(SNAP) + ', { pct: 60 }, ' + JSON.stringify(g) + ')');
    const score = run('_intccHealthScore(' + JSON.stringify(SNAP) + ', {pct:60})');
    return run('_intccReading(' + JSON.stringify(SNAP) + ', ' + JSON.stringify(score) + ', ' +
      JSON.stringify(radar) + ', { pct: 60 }, ' + JSON.stringify(g) + ')');
  };
  ok('4.1 an uncertified return can never reach the "growing" narrative',
    readingFor(null).state !== 'growing', readingFor(null).state);
  ok('4.2 the growth-percentage copy is never interpolated',
    !run('String(_intccReading(' + JSON.stringify(SNAP) + ', _intccHealthScore(' + JSON.stringify(SNAP) +
      ', {pct:60}), _intccRadar(' + JSON.stringify(SNAP) + ', {pct:60}, null), {pct:60}, null).sub)').includes('rendimiento '));
  // The corrected copy stays in place for the future series: if that state ever
  // becomes reachable it must already be truthful (return, not value advance).
  ok('4.3 the growing copy, if ever reached, speaks of RETURN not wealth advance',
    /rendimiento/.test(app.slice(app.indexOf('intcc_sub_growing:'), app.indexOf('intcc_sub_growing:') + 200))
    && /neutralizadas/.test(app.slice(app.indexOf('intcc_sub_growing:'), app.indexOf('intcc_sub_growing:') + 200)));
}

// ════════════════════════════════════════════════════════════════════════════
// 5 · TIMELINE — CURRENCY TRUTH (real formatBase, base ≠ USD)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n5 · Threshold milestones state a true amount:');
{
  ok('5.1 the real formatBase FORMATS without CONVERTING (the trap this covers)',
    run('formatBase(100000)') === run('formatCurrency(100000, "EUR")')
    && run('toBase(100000, "USD")') === 100000 * USD_TO_EUR);

  // 95.000 USD → 105.000 USD crosses the 100.000 USD mark, but in the user's own
  // currency wealth went 87.400 € → 96.600 €: it NEVER reached 100.000 €.
  sb.portfolioHistory = series([95000, 98000, 101000, 105000, 105000]);
  sb.__flows = []; sb.categoryHistory = [];
  const texts = run('_intccTimeline()').map(e => e.text).join(' | ');
  ok('5.2 no false "superó 100.000 €" when only the USD figure crossed',
    !texts.includes(run('formatBase(100000)')), texts);

  // 100.000 USD → 120.000 USD really does cross 100.000 € (92.000 → 110.400).
  sb.portfolioHistory = series([100000, 105000, 110000, 120000, 120000]);
  const texts2 = run('_intccTimeline()').map(e => e.text).join(' | ');
  ok('5.3 a real base-currency milestone IS published',
    texts2.includes(run('formatBase(100000)')), texts2);
  ok('5.4 the published amount is the amount compared (base currency, both sides)',
    /toBase\(/.test(fnSrc('_intccTimeline')));
  ok('5.5 unknown FX ⇒ no milestone at all (fail closed)',
    (() => { const m = makeCtx(); m._aurixFxRate = () => NaN; m.baseCurrency = 'GBP';
      m.portfolioHistory = series([95000, 105000, 130000, 200000, 300000]);
      return JSON.stringify(run('_intccTimeline()', m).filter(e => /superó/.test(e.text))) === '[]'; })());
}

// ════════════════════════════════════════════════════════════════════════════
// 6 · TIMELINE — A WITHDRAWAL IS NOT A DRAWDOWN
// ════════════════════════════════════════════════════════════════════════════
console.log('\n6 · No false market drawdown from a withdrawal (SPEC 5.F):');
{
  const tlSrc = fnSrc('_intccTimeline');
  sb.portfolioHistory = series([100000, 100000, 100000, 70000, 70000, 70000, 70000]);
  sb.__flows = [{ id: 'wd', ts: T0 + 2.5 * DAY, amountUSD: -30000 }];
  const tl = run('_intccTimeline()');
  const texts = tl.map(e => e.text).join(' | ');
  ok('6.1 no "wealth fell 30%" event is published for a withdrawal', !/retrocedió/.test(texts), texts);
  ok('6.2 no down-tone event at all is derived from gross value movement',
    !tl.some(e => e.tone === 'down'), texts);
  ok('6.3 the gross-value drawdown computation is gone from the owner',
    !/intcc_tl_drop/.test(tlSrc) && !/runPeak/.test(tlSrc));
}

// ════════════════════════════════════════════════════════════════════════════
// 7 · TIMELINE — NO PUBLICATION FROM A NON-AUTHORITATIVE SOURCE
// ════════════════════════════════════════════════════════════════════════════
console.log('\n7 · No events from a non-authoritative source (SPEC 5.G):');
{
  ok('7.1 _intccTimeline no longer reads categoryHistory', !/categoryHistory/.test(fnSrc('_intccTimeline')));
  ok('7.2 categoryHistory is still declared a cache / non-display source upstream',
    /categoryHistory/.test(app) && /_aurixCanonicalCatHistory/.test(app));
  sb.portfolioHistory = series([100000, 100000, 100000, 100000, 100000]);
  sb.__flows = [];
  sb.categoryHistory = [
    { ts: T0,         total: 100000, liquidity: 30000 },
    { ts: T0 + DAY,   total: 100000, liquidity: 5000  },
    { ts: T0 + 2*DAY, total: 100000, liquidity: 25000 },
  ];
  const tl = run('_intccTimeline()');
  ok('7.3 no liquidity-crossing event is published from that source',
    !/liquidez/i.test(tl.map(e => e.text).join(' | ')), tl.map(e => e.text).join(' | '));
  ok('7.4 the timeline is unaffected by categoryHistory contents',
    JSON.stringify(tl) === JSON.stringify((() => { sb.categoryHistory = []; return run('_intccTimeline()'); })()));
}

// ════════════════════════════════════════════════════════════════════════════
// 8 · CERTIFIABLE EVENTS STILL PUBLISH
// ════════════════════════════════════════════════════════════════════════════
console.log('\n8 · ATH and wealth thresholds survive (SPEC 5.H):');
{
  // USD series; base (×0.92) = 7.360 → 11.040 → 18.400 → 27.600 → 30.360 → …
  sb.portfolioHistory = series([8000, 12000, 20000, 30000, 33000, 31000, 30000]);
  sb.__flows = []; sb.categoryHistory = [];
  const tl = run('_intccTimeline()');
  const texts = tl.map(e => e.text).join(' | ');
  ok('8.1 the 10.000 € milestone is published', texts.includes(run('formatBase(10000)')), texts);
  ok('8.2 the 25.000 € milestone is published', texts.includes(run('formatBase(25000)')), texts);
  ok('8.3 the all-time high is published', /Máximo histórico/.test(texts), texts);
  const ath = tl.find(e => /Máximo histórico/.test(e.text));
  ok('8.4 the ATH carries the REAL timestamp of the peak (day 4)',
    ath && ath.ts === T0 + 4 * DAY, ath && String(ath.ts));
  ok('8.5 the ATH publishes a date, never an amount', ath && !/\d[\d.,]*\s*[€$]/.test(ath.text), ath && ath.text);
  ok('8.6 the hard cap of 5 events still holds', tl.length <= 5, 'len=' + tl.length);
  ok('8.7 events are presented newest-first', tl.every((e, i) => i === 0 || tl[i - 1].ts >= e.ts));
}

// ════════════════════════════════════════════════════════════════════════════
// 9 · FAIL CLOSED ON INSUFFICIENT DATA
// ════════════════════════════════════════════════════════════════════════════
console.log('\n9 · Insufficient data ⇒ fail closed (SPEC 5.I):');
{
  sb.portfolioHistory = []; sb.__flows = []; sb.categoryHistory = [];
  ok('9.1 no history ⇒ no return figure', run('_intccGrowthPct()') === null);
  ok('9.2 no history ⇒ empty timeline', JSON.stringify(run('_intccTimeline()')) === '[]');
  ok('9.3 no history ⇒ absent return axis',
    run('_intccRadar(' + JSON.stringify(SNAP) + ', { pct: 55 }, _intccGrowthPct())').growth === null);
  ok('9.4 empty portfolio ⇒ no score',
    run('_intccHealthScore(' + JSON.stringify(snapOf({ assetCount: 0, totUSD: 0 })) + ', null)').score === null);
  sb.portfolioHistory = [{ ts: T0, value: 50000 }];
  ok('9.5 one snapshot ⇒ no return, no timeline',
    run('_intccGrowthPct()') === null && JSON.stringify(run('_intccTimeline()')) === '[]');
  sb.portfolioHistory = [{ ts: T0, value: 0 }, { ts: T0 + 5 * DAY, value: NaN }];
  ok('9.6 corrupt series ⇒ no throw, no figure, no milestone',
    run('_intccGrowthPct()') === null && !/superó/.test(run('_intccTimeline()').map(e => e.text).join('')));
}

// ════════════════════════════════════════════════════════════════════════════
// 10 · SCOPE — nothing outside Intelligence was reopened
// ════════════════════════════════════════════════════════════════════════════
console.log('\n10 · Scope containment:');
{
  ok('10.1 the canonical health engine keeps its REAL-ESTATE-INTEL contract',
    /REAL-ESTATE-INTEL/.test(app.slice(app.indexOf('function _aurixHealthScore('), app.indexOf('function _aurixHealthScore(') + 2500)));
  ok('10.2 Intelligence still consumes the certified investable snapshot',
    /_aurixHealthSnapshot\(\)/.test(fnSrc('_renderIntelligenceCommandCenter')));
  ok('10.3 INT.01 built no Fact Ledger / Brief / What-Changed surface',
    !/_intccFactLedger|_intccBrief|_intccWhatChanged/.test(app));
  ok('10.4 _intccSinceLastVisit is still unwired (deferred, not published)',
    (app.split('_intccSinceLastVisit').length - 1) === 1);
  ok('10.5 the investable series owners were NOT modified by INT.01',
    /function _aurixEligibleInvestableSeries\(/.test(app) && /function _aurixInvestableSnapshots\(/.test(app));
}

// ════════════════════════════════════════════════════════════════════════════
// 11 · NON-VACUITY — reverting each protection must break this gate
// ════════════════════════════════════════════════════════════════════════════
console.log('\n11 · Non-vacuity: the protections are load-bearing (SPEC 5.J):');
{
  // 11.1 — the pre-INT.01 growth owner (portfolio-value arithmetic).
  {
    const m = makeCtx([`function _legacyGrowth() {
      const h = portfolioHistory;
      if (h.length < 2) return null;
      const first = h[0], last = h[h.length - 1];
      if (!(first.value > 0) || !(last.ts > first.ts)) return null;
      if (last.ts - first.ts < 3 * 86400000) return null;
      return ((last.value - first.value) / first.value) * 100;
    }`]);
    m.portfolioHistory = series([10000, 10000, 10000, 20000, 20000, 20000, 20000]);
    m.__flows = [{ id: 'dep', ts: T0 + 2.5 * DAY, amountUSD: 10000 }];
    const legacy = run('_legacyGrowth()', m);
    ok('11.1 the legacy owner DOES publish the deposit as +' + Math.round(legacy) + '% (section 2 is load-bearing)',
      Math.abs(legacy - 100) < 0.5, 'legacy=' + legacy);
  }
  // 11.2 — the fabricated growth axis.
  {
    const m = makeCtx([`function _legacyRadar(snap, drivers, growthPct) {
      const crypto = snap.cryptoPct || 0;
      const topCatType = (snap.topCategory && String(snap.topCategory.type || '')) || '';
      let growth;
      if (growthPct != null) growth = 55 + growthPct * 2.2;
      else growth = 45 + crypto * 0.25 + (/stock|etf|crypto/.test(topCatType) ? 10 : 0);
      return { growth: Math.round(_intccClamp(growth, 6, 100)) };
    }`]);
    const s = snapOf({ top1: 60, topCat: 60, topCatType: 'crypto', cryptoPct: 60, categoryCount: 2, cashPct: 5 });
    const legacy = run('_legacyRadar(' + JSON.stringify(s) + ', {pct:80}, null)', m).growth;
    ok('11.2 the legacy radar DOES fabricate "Crecimiento ' + legacy + '/100" (section 3 is load-bearing)',
      legacy === 70, 'legacy=' + legacy);
  }
  // 11.3 — the second health-score engine.
  {
    const m = makeCtx([`function _legacyScore(snap, drivers) {
      if (!snap || !snap.assetCount || snap.totUSD <= 0) return { score: null, band: 'empty' };
      const top1 = (snap.topInvestedAsset && snap.topInvestedAsset.pctTotal) || 0;
      const top3 = (drivers && drivers.pct) || 0;
      const cats = snap.categoryCount || 0, cash = snap.cashPct || 0, crypto = snap.cryptoPct || 0;
      let s = 100;
      if (top1 > 60) s -= 22; else if (top1 > 45) s -= 12; else if (top1 > 35) s -= 6;
      if (top3 > 80) s -= 12; else if (top3 > 65) s -= 6;
      if (cats <= 1) s -= 18; else if (cats === 2) s -= 9;
      if (crypto > 60) s -= 16; else if (crypto > 45) s -= 9; else if (crypto > 30) s -= 4;
      if (cash === 0) s -= 8; else if (cash < 3) s -= 5; else if (cash > 70) s -= 6;
      if (snap.assetCount === 1) s -= 15;
      s = Math.round(_intccClamp(s, 0, 100));
      let band;
      if (s >= 90) band = 'excellent'; else if (s >= 75) band = 'good';
      else if (s >= 60) band = 'watch'; else band = 'limited';
      return { score: s, band };
    }`]);
    let worst = 0, crossed = 0;
    [null, 45, 55, 65, 80, 95].forEach(top1 => [1, 2, 3, 5].forEach(cats =>
      [0, 25, 55, 70].forEach(crypto => [0, 5, 40, 80].forEach(cash => {
        const s = snapOf({ top1, categoryCount: cats, cryptoPct: crypto, cashPct: cash,
          topCat: top1 == null ? null : Math.max(top1, 30), assetCount: cats === 1 ? 1 : 4 });
        const canon = run('_aurixHealthScore(' + JSON.stringify(s) + ')', m);
        const legacy = run('_legacyScore(' + JSON.stringify(s) + ', { pct: 72 })', m);
        const d = Math.abs((canon.score || 0) - (legacy.score || 0));
        if (d > worst) worst = d;
        if (canon.score >= 80 && legacy.score < 75) crossed++;
      }))));
    ok('11.3 the legacy engines DO diverge on the same snapshot (max Δ = ' + worst + ' pts) — section 1 is load-bearing',
      worst >= 15, 'worst=' + worst);
    ok('11.4 and DO cross the semantic band ("solid" vs "to watch") on ' + crossed + ' snapshots', crossed >= 1);
  }
  // 11.5 — the gross-value drawdown event.
  {
    const m = makeCtx([`function _legacyDrawdown() {
      const h = portfolioHistory, out = [];
      let runPeak = h[0].value, worst = 0, worstTs = 0;
      for (let i = 1; i < h.length; i++) {
        if (h[i].value > runPeak) runPeak = h[i].value;
        else if (runPeak > 0) { const dd = ((runPeak - h[i].value) / runPeak) * 100; if (dd > worst) { worst = dd; worstTs = h[i].ts; } }
      }
      if (worst >= 10 && worstTs) out.push({ ts: worstTs, tone: 'down', text: t('intcc_tl_drop')(Math.round(worst)) });
      return out;
    }`]);
    m.portfolioHistory = series([100000, 100000, 100000, 70000, 70000, 70000, 70000]);
    const legacy = run('_legacyDrawdown()', m);
    ok('11.5 the legacy timeline DOES publish "retrocedió un 30%" for a withdrawal (section 6 is load-bearing)',
      legacy.length === 1 && /retrocedió un 30%/.test(legacy[0].text), JSON.stringify(legacy));
  }
  // 11.6 — the categoryHistory liquidity crossings.
  {
    const m = makeCtx([`function _legacyCatEvents() {
      const out = [], ch = categoryHistory;
      for (let i = 1; i < ch.length; i++) {
        const pT = ch[i-1].total, cT = ch[i].total;
        if (pT > 0 && cT > 0) {
          const pL = (ch[i-1].liquidity / pT) * 100, cL = (ch[i].liquidity / cT) * 100;
          if (pL >= 10 && cL < 10) { out.push({ ts: ch[i].ts, tone: 'down', text: t('intcc_tl_liq10') }); break; }
        }
      }
      return out;
    }`]);
    m.categoryHistory = [{ ts: T0, total: 100000, liquidity: 30000 }, { ts: T0 + DAY, total: 100000, liquidity: 5000 }];
    const legacy = run('_legacyCatEvents()', m);
    ok('11.6 the legacy timeline DOES publish an event from categoryHistory (section 7 is load-bearing)',
      legacy.length === 1 && /liquidez/i.test(legacy[0].text), JSON.stringify(legacy));
  }
  // 11.7 — the USD/base threshold mix-up this gate now catches.
  {
    const m = makeCtx([`function _legacyThresholds() {
      const h = portfolioHistory, out = [];
      const THRESH = [10000, 25000, 50000, 100000, 250000];
      for (const thr of THRESH) for (let i = 1; i < h.length; i++) {
        if (h[i-1].value < thr && h[i].value >= thr) { out.push({ ts: h[i].ts, text: t('intcc_tl_cross')(formatBase(thr)) }); break; }
      }
      return out;
    }`]);
    m.portfolioHistory = series([95000, 98000, 101000, 105000, 105000]);
    const legacy = run('_legacyThresholds()', m).map(e => e.text).join(' | ');
    ok('11.7 the legacy thresholds DO publish a false "' + run('formatBase(100000)', m) + '" milestone (section 5 is load-bearing)',
      legacy.includes(run('formatBase(100000)', m)), legacy);
  }
  // 11.8 — a pass-through formatBase stub would have hidden 11.7 entirely.
  {
    ok('11.8 this gate uses the REAL formatBase (a pass-through stub hid the bug before)',
      /fnSrc\('formatBase'\)|'formatCurrency','formatBase','toBase'/.test(fs.readFileSync(__filename, 'utf8'))
      && run('formatBase(100000)') !== '100000');
  }
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + `  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
