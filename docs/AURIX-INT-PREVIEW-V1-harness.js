'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-INT-PREVIEW-V1-harness — SPEC AURIX FASE 2.4 · Intelligence Preview V1
// ════════════════════════════════════════════════════════════════════════════
// The activation leak: Dashboard "Ver análisis" → Intelligence → a dead
// "PRÓXIMAMENTE" card with six generic bullets and none of the user's data.
// This certifies the replacement landing surface:
//   · it states only facts the Fase 2.3 certification declared publishable TODAY
//     (single-position concentration, liquidity weight, ONE allowed watch area);
//   · concentration and liquidity are measured over INVESTABLE wealth, so real
//     estate never contaminates the denominator;
//   · it is FAIL-CLOSED — an incomplete valuation yields zero facts and a hold
//     state, never a degraded figure;
//   · it publishes NO health score, NO attribution, NO temporal delta, NO cause;
//   · it changes NO entitlement surface, and full Intelligence for the owner is
//     reached by exactly the same gate as before.
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

const sb = { Math, Number, JSON, Array, String, Object, isFinite, console:{warn:()=>{},log:()=>{},debug:()=>{}}, window:{} };
vm.createContext(sb);

// ── leaf stubs (never the logic under test) ───────────────────────────────────
sb.assets = [];
sb.activeAssets = () => sb.assets.filter(a => a && a.lifecycleStatus !== 'closed');
sb.isClosedAsset = a => !!a && a.lifecycleStatus === 'closed';
sb.liquidityNominal = a => Number((a && a.qty) || 0);
sb.assetValueUSD = a => { if (!a) return 0; if (a.type === 'cash') return Number(a.qty) || 0;
  const v = Number(a.qty) * Number(a.price); return Number.isFinite(v) ? v : NaN; };
sb.getDisplayName = a => (a && (a.name || a.symbol || a.ticker)) || '—';
sb.TYPE_META = { crypto:{label:'Cripto'}, stock:{label:'Acciones'}, cash:{label:'Liquidez'}, etf:{label:'ETF'}, real_estate:{label:'Inmuebles'} };
sb._aurixCategoryBucket = a => String((a && a.type) || '').toLowerCase();
sb._aurixDisplayCategory = tp => String(tp || '').toLowerCase();
sb.toBase = v => v;            // base-currency conversion is not what this gate proves
sb.baseCurrency = 'EUR';
// i18n: the preview copy under test, shaped exactly like T[lang].
sb.t = k => ({
  intprev_badge:  'Inteligencia · tu cartera',
  intprev_title:  'Esto es lo que Aurix ya entiende de tu patrimonio',
  intprev_f_conc: (pct, name) => `El ${pct}% de tu patrimonio invertible depende de ${name}.`,
  intprev_f_liq:  pct => `La liquidez representa el ${pct}% de tu patrimonio invertible.`,
  intprev_q_label:'La pregunta siguiente',
  intprev_q:      '¿Cómo ha cambiado esta exposición en el tiempo?',
  intprev_premium:'Aurix ya lee tu estructura. El movimiento de esa estructura, su causa y su vigilancia continua llegan con Aurix Premium.',
  intprev_cta:    'Volver al Dashboard',
  intprev_hold_empty_t:'Aurix todavía no tiene con qué leer tu patrimonio',
  intprev_hold_empty_b:'Registra tu primer activo y esta lectura aparecerá aquí, calculada sobre tus datos reales.',
  intprev_hold_inc_t:  'Aurix no puede confirmar ahora la valoración completa de tu cartera',
  intprev_hold_inc_b:  'Cuando todos tus activos tengan precio y divisa disponibles, esta lectura aparecerá aquí. Aurix prefiere no mostrar una cifra que no pueda demostrar.',
  intprev_hold_none_t: 'Aurix está leyendo tu estructura patrimonial',
  intprev_hold_none_b: 'Todavía no hay un hecho que Aurix pueda afirmar con la precisión suficiente sobre tu cartera actual.',
  intcc_w_dep_t:'Dependencia de activo principal', intcc_w_dep_b:name=>`Buena parte de tu patrimonio invertible se apoya en ${name}.`,
  intcc_w_liq_t:'Liquidez reducida',               intcc_w_liq_b:'Tu liquidez inmediata es baja frente al resto del patrimonio.',
  intcc_w_crypto_t:'Exposición cripto',            intcc_w_crypto_b:pct=>`La cripto representa cerca del ${pct}% de tu patrimonio invertible.`,
  intcc_w_sector_t:'Exposición sectorial',         intcc_w_sector_b:label=>`${label} concentra una parte relevante de tu patrimonio invertible.`,
  intcc_w_div_t:'Diversificación limitada',        intcc_w_div_b:'Tu patrimonio se reparte entre muy pocas categorías.',
}[k]);
// Valuation completeness is stubbed so the fail-closed BRANCHES can be driven
// directly; a static assertion below proves the preview really calls it.
sb.__val = { totalActive: 3, complete: true, reason: 'COMPLETE' };
sb._aurixAssessValuationCompleteness = () => sb.__val;

// ── real functions under test ────────────────────────────────────────────────
vm.runInContext(konstSrc('_INT_PREVIEW_WATCH_ALLOWED'), sb);
['isInvestableAsset','investableAssets','investableValueUSD','getInvestableDistribution',
 '_intRealEstatePresence','buildLiquidityView','_aurixHealthSnapshot','_intccWatchAreas',
 '_aurixIntelligencePreviewFacts','_aurixIntelligencePreviewHTML']
  .forEach(n => vm.runInContext(fnSrc(n), sb));

const facts = () => vm.runInContext('_aurixIntelligencePreviewFacts()', sb);
const html  = () => vm.runInContext('_aurixIntelligencePreviewHTML()', sb);
const setPortfolio = (list, val) => {
  sb.assets = list;
  sb.__val = val || { totalActive: list.filter(a => a && a.lifecycleStatus !== 'closed').length, complete: true, reason: 'COMPLETE' };
};

console.log('AURIX-INT-PREVIEW-V1 — SPEC FASE 2.4 · Intelligence Preview V1\n');

// ── 1 · the dead screen is gone ──────────────────────────────────────────────
console.log('1 · Dead screen removed:');
{
  const gate = app.slice(app.indexOf('function renderIntelligenceTab('), app.indexOf('function renderIntelligenceTab(') + 1400);
  ok('1.1 non-premium branch returns the Intelligence preview',
    /!hasAurixPremiumAccess\(_aurixCurrentAuthUser\(\)\)\)\s*return\s+_aurixIntelligencePreviewHTML\(\);/.test(gate), 'gate line');
  ok('1.2 Intelligence no longer routes to the shared PRÓXIMAMENTE card',
    !/_aurixPremiumPreviewHTML\('intelligence'\)/.test(app));
  ok('1.3 Workspace STILL uses the shared preview (untouched contract)',
    /_aurixPremiumPreviewHTML\('workspace'\)/.test(app));
  setPortfolio([{ name:'BTC', type:'crypto', qty:1, price:60000 }, { name:'EUR', type:'cash', qty:10000 }]);
  const h = html();
  ok('1.4 rendered preview contains no PRÓXIMAMENTE / COMING SOON',
    !/PRÓXIMAMENTE|COMING SOON/i.test(h));
  ok('1.5 rendered preview is the new scoped surface', /data-aurix-preview="intelligence"/.test(h) && /intprev-card/.test(h));
}

// ── 2 · real, personalised data ──────────────────────────────────────────────
console.log('\n2 · Real portfolio data:');
{
  setPortfolio([
    { name:'BTC',  type:'crypto', qty:1,     price:60000 },   // 60000
    { name:'AAPL', type:'stock',  qty:100,   price:200   },   // 20000
    { name:'EUR',  type:'cash',   qty:20000              },   // 20000  → 100000 investable
  ]);
  const f = facts(), h = html();
  ok('2.1 state ok with facts', f.state === 'ok' && f.facts.length >= 2, JSON.stringify(f.facts.map(x=>x.kind)));
  ok('2.2 concentration fact names the real top position and its real weight',
    /El 60% de tu patrimonio invertible depende de BTC\./.test(h), h.match(/El \d+% de[^<]*/)?.[0]);
  ok('2.3 liquidity fact states the canonical cash weight',
    /La liquidez representa el 20% de tu patrimonio invertible\./.test(h), h.match(/La liquidez[^<]*/)?.[0]);
  ok('2.4 the contextual question is present exactly once',
    (h.match(/¿Cómo ha cambiado esta exposición en el tiempo\?/g) || []).length === 1);
  ok('2.5 facts carry stable instrumentation hooks',
    /data-preview-fact="concentration"/.test(h) && /data-preview-fact="liquidity"/.test(h)
    && /data-preview-event="intelligence_preview_view"/.test(h) && /data-preview-event="preview_cta_click"/.test(h));
}

// ── 3 · investable denominator · real estate never contaminates ──────────────
console.log('\n3 · Investable denominator (real estate excluded):');
{
  // Same investable portfolio as above + a 900k property. Investable = 100k, so
  // BTC must stay 60% — NOT 6% (which is what a total-wealth denominator gives).
  setPortfolio([
    { name:'BTC',  type:'crypto',      qty:1,   price:60000 },
    { name:'AAPL', type:'stock',       qty:100, price:200   },
    { name:'EUR',  type:'cash',        qty:20000            },
    { name:'FLAT', type:'real_estate', qty:1,   price:900000 },
  ]);
  const h = html();
  ok('3.1 concentration is over investable wealth (60%), not total wealth (6%)',
    /depende de BTC/.test(h) && /El 60%/.test(h) && !/El 6%/.test(h), h.match(/El \d+% de[^<]*/)?.[0]);
  ok('3.2 liquidity is over investable wealth (20%), not total wealth (2%)',
    /el 20% de tu patrimonio invertible/.test(h), h.match(/La liquidez[^<]*/)?.[0]);
  ok('3.3 real estate never appears as a fact or a weight',
    !/FLAT/.test(h) && !/inmueble/i.test(h) && !/real.?estate/i.test(h));
}

// ── 4 · watch areas — only what the contract allows ──────────────────────────
console.log('\n4 · Watch areas restricted to the certified set:');
{
  const allow = vm.runInContext('_INT_PREVIEW_WATCH_ALLOWED', sb);
  ok('4.1 allowlist is exactly crypto + dep', JSON.stringify(allow) === '["crypto","dep"]', JSON.stringify(allow));
  ok('4.1b the excluded keys are excluded by the allowlist itself, not by luck',
    ['liq','div','sector'].every(k => allow.indexOf(k) === -1));

  // Fixture A — crypto 97%, cash 3%, 2 categories: `dep`, `liq` and `crypto` all fire.
  setPortfolio([{ name:'BTC', type:'crypto', qty:1, price:70000 }, { name:'EUR', type:'cash', qty:2000 }]);
  let f = facts(), h = html();
  let kinds = f.facts.map(x => x.kind).join(',');
  const rawA = vm.runInContext('_intccWatchAreas(_aurixHealthSnapshot(), buildLiquidityView()).map(a=>a.key).join(",")', sb);
  ok('4.2 an allowed watch area surfaces (crypto exposure)', /watch:crypto/.test(kinds), kinds);
  ok('4.3 `liq` fires upstream but never surfaces in the preview',
    /liq/.test(rawA) && !/watch:liq/.test(kinds), 'upstream=' + rawA + ' shown=' + kinds);
  ok('4.4 at most 3 facts, never a wall', f.facts.length <= 3, String(f.facts.length));
  ok('4.5 `dep` is suppressed when concentration was already stated',
    /concentration/.test(kinds) && !/watch:dep/.test(kinds), kinds);

  // Fixture B — stock 60%, cash 40%, 2 categories: `sector` and `div` fire upstream.
  setPortfolio([{ name:'AAPL', type:'stock', qty:100, price:600 }, { name:'EUR', type:'cash', qty:40000 }]);
  f = facts(); h = html();
  kinds = f.facts.map(x => x.kind).join(',');
  const rawB = vm.runInContext('_intccWatchAreas(_aurixHealthSnapshot(), buildLiquidityView()).map(a=>a.key).join(",")', sb);
  ok('4.6 `sector` fires upstream but never surfaces (wrong word for a category)',
    /sector/.test(rawB) && !/watch:sector/.test(kinds) && !/concentra una parte/.test(h),
    'upstream=' + rawB + ' shown=' + kinds);
  ok('4.7 `div` fires upstream but never surfaces',
    /div/.test(rawB) && !/watch:div/.test(kinds), 'upstream=' + rawB + ' shown=' + kinds);
}

// ── 5 · fail-closed ──────────────────────────────────────────────────────────
console.log('\n5 · Fail-closed:');
{
  const base = [{ name:'BTC', type:'crypto', qty:1, price:60000 }, { name:'EUR', type:'cash', qty:40000 }];
  ok('5.0 the preview really consults the valuation gate',
    /_aurixAssessValuationCompleteness\(/.test(fnSrc('_aurixIntelligencePreviewFacts')));

  setPortfolio(base, { totalActive: 2, complete: false, reason: 'MISSING_FX' });
  let f = facts(), h = html();
  ok('5.1 incomplete valuation ⇒ zero facts', f.facts.length === 0 && f.state === 'incomplete', JSON.stringify(f));
  ok('5.2 incomplete valuation ⇒ hold state says what is missing, states no figure',
    /precio y divisa/.test(h) && !/El \d+%/.test(h) && !/representa el \d+%/.test(h));

  setPortfolio(base, { totalActive: 2, complete: false, reason: 'VALUATION_NOT_READY' });
  ok('5.3 valuation not ready ⇒ still zero facts', facts().facts.length === 0);

  setPortfolio([], { totalActive: 0, complete: true, reason: 'EMPTY' });
  f = facts(); h = html();
  ok('5.4 empty portfolio ⇒ dedicated empty hold, not a fabricated fact',
    f.state === 'empty' && f.facts.length === 0 && /Registra tu primer activo/.test(h), JSON.stringify(f));

  // Real-estate-only: no investable wealth ⇒ every weight would divide by zero.
  setPortfolio([{ name:'FLAT', type:'real_estate', qty:1, price:400000 }], { totalActive:1, complete:true, reason:'COMPLETE' });
  f = facts(); h = html();
  ok('5.5 real-estate-only ⇒ hold, never a 0% weight',
    f.facts.length === 0 && f.state === 'incomplete' && !/ 0%/.test(h), JSON.stringify(f));

  // Cash at 0% must not be stated as a fact about the user's finances.
  setPortfolio([{ name:'BTC', type:'crypto', qty:1, price:60000 }]);
  h = html();
  ok('5.6 zero liquidity is omitted, not published as "0%"',
    !/La liquidez representa/.test(h) && !/el 0%/.test(h));
}

// ── 6 · nothing uncertified is published ────────────────────────────────────
console.log('\n6 · No uncertified claim:');
{
  setPortfolio([
    { name:'BTC',  type:'crypto', qty:1,   price:70000 },
    { name:'AAPL', type:'stock',  qty:100, price:200   },
    { name:'EUR',  type:'cash',   qty:10000            },
  ]);
  const h = html();
  const src = fnSrc('_aurixIntelligencePreviewFacts') + fnSrc('_aurixIntelligencePreviewHTML');
  ok('6.1 no numeric health score in the output', !/\b\d{1,3}\s*\/\s*100\b/.test(h) && !/score/i.test(h));
  ok('6.2 no health engine is consulted at all',
    !/_aurixHealthScore|_intccHealthScore/.test(src));
  ok('6.3 no causal claim ("porque" / "impulsad" / "debido a" / "gracias a")',
    !/porque|impulsad|debido a|gracias a|because|driven by/i.test(h));
  ok('6.4 no temporal delta is asserted (no "ha subido/bajado/pasó de … a")',
    !/ha subido|ha bajado|ha crecido|pasó de|desde tu última/i.test(h));
  ok('6.5 no asset-level attribution claim', !/más contribuy|contributed most/i.test(h));
  ok('6.6 no series/history primitive is read',
    !/categoryHistory|portfolioHistory|asset_values|category_values|_intccTimeline|_intccSinceLastVisit/.test(src));
  ok('6.7 the Premium line promises no figure and no date',
    /llegan con Aurix Premium/.test(h) && !/próximamente/i.test(h));
}

// ── 7 · commercial surfaces untouched ───────────────────────────────────────
console.log('\n7 · No commercial or entitlement change:');
{
  setPortfolio([{ name:'BTC', type:'crypto', qty:1, price:60000 }, { name:'EUR', type:'cash', qty:40000 }]);
  const h = html();
  ok('7.1 CTA goes to the Dashboard — no checkout, no founder page, no upgrade modal',
    /switchTab\('home'\)/.test(h) && !/openFounderPage|openUpgradeModal|checkout|stripe/i.test(h));
  ok('7.2 no price anywhere in the preview', !/14,99|14\.99|59\s?€|8,99|€\s?\d/.test(h));
  ok('7.3 entitlement gate unchanged — hasAurixPremiumAccess still decides',
    /function hasAurixPremiumAccess/.test(app) && /!hasAurixPremiumAccess\(_aurixCurrentAuthUser\(\)\)/.test(app));
  ok('7.4 ENFORCE_ENTITLEMENTS still false (not activated by this SPEC)',
    /ENFORCE_ENTITLEMENTS\s*=\s*false/.test(app));
  ok('7.5 PLAN_CATALOG premium price still null (pricing untouched)',
    /premium:\s*\{[^}]*price:\s*null/.test(app));
  ok('7.6 full Intelligence path for the owner is unchanged',
    /_renderIntelligenceCommandCenter\(\)/.test(app) && /_renderPremiumIntelligence\(\)/.test(app));
  ok('7.7 the preview creates no new financial metric',
    !/function _aurix(Health|Range|Return)|_wscPaint|buildProductionPortfolioChart/.test(fnSrc('_aurixIntelligencePreviewFacts')));
}

// ── 8 · layout contract (mobile-first, one scoped surface) ──────────────────
console.log('\n8 · Layout contract:');
{
  setPortfolio([{ name:'BTC', type:'crypto', qty:1, price:60000 }, { name:'EUR', type:'cash', qty:40000 }]);
  const h = html();
  // Every selector in the embedded stylesheet must be namespaced: either an
  // .intprev-* rule or the single documented host neutraliser.
  const css = (h.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
  const selectors = css.split('}').map(s => s.split('{')[0].trim()).filter(Boolean)
    .filter(s => !/^@/.test(s) && !/^(from|to|\d+%)$/.test(s));
  const stray = selectors.filter(s => !/^\.intprev-/.test(s) && s !== '.tab-placeholder:has(.intprev-stage)');
  ok('8.1 every selector is namespaced to .intprev- (or the host neutraliser)',
    stray.length === 0, stray.join(' | '));
  ok('8.1b the shared premium-preview styles are not redefined or leaked into',
    !/\.premium-preview/.test(h));
  ok('8.2 mobile-first: base rules unconditioned, desktop behind min-width',
    /@media \(min-width:768px\)/.test(h) && !/@media \(max-width/.test(h));
  ok('8.3 reduced-motion respected', /prefers-reduced-motion/.test(h));
  ok('8.4 host container neutralised via :has, no global override',
    /\.tab-placeholder:has\(\.intprev-stage\)/.test(h));
  ok('8.5 single card, no scroll trap (no fixed height on the stage)',
    (h.match(/class="intprev-card"/g) || []).length === 1 && !/\.intprev-stage\{[^}]*height:\d/.test(h));
  ok('8.6 output is well-formed (tags balanced)',
    (h.match(/<div/g)||[]).length === (h.match(/<\/div>/g)||[]).length
    && (h.match(/<section/g)||[]).length === (h.match(/<\/section>/g)||[]).length
    && (h.match(/<ul/g)||[]).length === (h.match(/<\/ul>/g)||[]).length);
}

// ── 9 · i18n parity ─────────────────────────────────────────────────────────
console.log('\n9 · i18n parity:');
{
  const keys = ['intprev_badge','intprev_title','intprev_f_conc','intprev_f_liq','intprev_q_label','intprev_q',
    'intprev_premium','intprev_cta','intprev_hold_empty_t','intprev_hold_empty_b','intprev_hold_inc_t',
    'intprev_hold_inc_b','intprev_hold_none_t','intprev_hold_none_b'];
  const missing = keys.filter(k => (app.split(k + ':').length - 1) < 2);
  ok('9.1 every preview key exists in BOTH language dictionaries', missing.length === 0, missing.join(','));
  ok('9.2 no hardcoded Spanish copy in the renderer outside the t() fallbacks',
    (fnSrc('_aurixIntelligencePreviewHTML').match(/tx\('intprev_/g) || []).length >= 8);
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + `  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
