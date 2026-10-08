'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-COHERENCE-PREMIUM — coherencia de cifras y trabajo conservado
// ════════════════════════════════════════════════════════════════════════════
// Ejecuta los owners REALES (extraídos de app.js) de cada defecto cerrado en la
// rama aurix/coherence-premium. Comportamiento, no forma del código:
//   1 · un cierre de posición sobrevive a la recarga (y el heredado se reconoce)
//   2 · Escenarios: sin base o sin horizonte no hay cifra, gráfico ni guardado
//   3 · Diario: filas, vista previa y resumen en la divisa del DOCUMENTO
//   4 · «Tus planes»: sin petición en vuelo no hay «Comprobando…» eterno
//   5 · Intelligence: la pregunta mostrada no rota al volver a la pestaña
//   6 · Guardar: re-emitir el mismo valor no repinta la barra (no se pierde el clic)
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0, fail=0; function ok(n,c,info){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(info?'  ['+info+']':''));} }
function sandbox(extra) {
  const sb = Object.assign({ Math, Number, String, Object, Array, JSON, Date, Intl, Set, Map, isFinite,
    console: { warn(){}, error(){}, log(){} } }, extra || {});
  vm.createContext(sb); return sb;
}
const load = (sb, names) => names.forEach(n => vm.runInContext(fnSrc(n), sb));

console.log('AURIX-COHERENCE-PREMIUM\n');

// ── 1 · CIERRE DE POSICIÓN DURABLE ──────────────────────────────────────────
console.log('1 · Una retirada total no resucita al recargar:');
{
  const sb = sandbox();
  vm.runInContext('function inferPriceSource(){ return "manual"; } function inferProviderId(){ return null; }'
    + 'function _aurixUsableQuantity(q){ if (q == null || String(q).trim() === "") return NaN; const n = Number(q); return (!Number.isFinite(n) || n < 0) ? NaN : n; }', sb);
  load(sb, ['convertToNewModel', '_aurixHoldingIsClosed', '_aurixSalvageHolding', 'convertFromNewToFlat',
            '_closePosition', 'isClosedAsset']);
  vm.runInContext('var assets = []; function activeAssets(){ return assets.filter(a => !isClosedAsset(a)); }', sb);
  const cash = { id: 'c1', name: 'Efectivo', ticker: 'EUR', type: 'cash', qty: 250, price: 1, assetCurrency: 'EUR',
                 costBasis: 250, realizedPnL: 0, transactions: [{ type: 'deposit', qty: 250 }, { type: 'withdrawal', qty: 250 }] };
  const stock = { id: 's1', name: 'Microsoft', ticker: 'MSFT', type: 'stock', qty: 31, price: 400, assetCurrency: 'USD',
                  costBasis: 9000, realizedPnL: 0, transactions: [{ type: 'buy', qty: 30 }, { type: 'buy', qty: 2 }, { type: 'sell', qty: 1 }] };
  sb.__in = [cash, stock];
  vm.runInContext('_closePosition(__in[0], 1700000000000);', sb);
  const reloaded = vm.runInContext('(() => { const m = convertToNewModel(JSON.parse(JSON.stringify(__in))); '
    + 'const flat = convertFromNewToFlat(JSON.parse(JSON.stringify(m.assets)), JSON.parse(JSON.stringify(m.holdings))); '
    + 'assets = flat; return { flat, active: activeAssets().map(a => a.id) }; })()', sb);
  const c = reloaded.flat.find(a => a.id === 'c1');
  ok('1.1 la posición cerrada vuelve CERRADA tras guardar y recargar',
    c && c.lifecycleStatus === 'closed' && c.closedAt === 1700000000000, JSON.stringify(c && { s: c.lifecycleStatus, at: c.closedAt }));
  ok('1.2 …con su historial intacto (nunca se borra)', c && c.transactions.length === 2);
  ok('1.3 y deja de contar como activa; la abierta sigue (Microsoft 30+2−1 = 31)',
    JSON.stringify(reloaded.active) === '["s1"]' && reloaded.flat.find(a => a.id === 's1').qty === 31);
  // Filas guardadas ANTES del arreglo: sin estado, pero con la huella exacta de `_closePosition`.
  const legacy = vm.runInContext('convertFromNewToFlat([{ id: "c2", name: "Efectivo", symbol: "EUR", type: "cash" }],'
    + ' [{ id: "c2", asset_id: "c2", quantity: 0, costBasis: 0, transactions: [{ type: "buy", qty: 250 }, { type: "sell", qty: 250 }] }])', sb);
  ok('1.4 una fila heredada a cero cuyas operaciones netean a cero se reconoce cerrada', legacy[0].lifecycleStatus === 'closed');
  // Revisión financiera: cantidad BLANQUEADA a 0 en disco con compras vivas ⇒ no es un cierre.
  const laundered = vm.runInContext('convertFromNewToFlat([{ id: "c3", name: "X", symbol: "X", type: "stock" }],'
    + ' [{ id: "c3", asset_id: "c3", quantity: 0, costBasis: 0, transactions: [{ type: "buy", qty: 2 }] }])', sb);
  ok('1.4b cantidad 0 con compras vivas NO se cierra (la reparación por operaciones sigue)', !laundered[0].lifecycleStatus);
  const unknown = vm.runInContext('convertFromNewToFlat([{ id: "c4", name: "Y", symbol: "Y", type: "stock" }],'
    + ' [{ id: "c4", asset_id: "c4", quantity: "   ", costBasis: 0, transactions: [{ type: "buy", qty: 1 }, { type: "sell", qty: 1 }] }])', sb);
  ok('1.4c una cantidad DESCONOCIDA no es un cero: no se cierra', !unknown[0].lifecycleStatus);
  const noTx = vm.runInContext('convertFromNewToFlat([{ id: "z", name: "Z", symbol: "Z", type: "stock" }],'
    + ' [{ id: "z", asset_id: "z", quantity: 0, costBasis: 0, transactions: [] }])', sb);
  ok('1.5 un activo a cero SIN operaciones no se toca (no hay prueba de venta)', !noTx[0].lifecycleStatus);
  const open = vm.runInContext('convertToNewModel([__in[1]]).holdings[0]', sb);
  ok('1.6 una posición abierta no gana campos nuevos en el holding', !('lifecycleStatus' in open) && !('closedAt' in open));
}

// ── 2 · ESCENARIOS: UNA VALIDACIÓN PARA TODA LA SALIDA ──────────────────────
console.log('\n2 · Escenarios sin base declarada no publican proyecciones:');
{
  const mk = params => {
    const sb = sandbox();
    sb.__params = params;
    vm.runInContext('var lang="es"; function t(k){ return k; } function _intccEsc(x){ return String(x); }'
      + 'function formatBase(v){ return Math.round(v) + " €"; } function _wsbParams(){ return __params; }'
      // La moneda del documento la certifica docs/financial-reliability/probe-doc-currency.mjs en navegador;
      // aquí se certifica la VALIDACIÓN, así que el importe sigue saliendo por el formatBase de este sandbox.
      + 'function _wsbMoney(v){ return formatBase(v); }'
      + 'function _wsNum(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }'
      + 'function _wsNumOrNull(v){ if (v === "" || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; }'
      + 'var _WS_PROJ_CONV = { NOMINAL12: "n12" }, _WS_PROJ_CONV_DEFAULT = "eff", _WSB_MAX_SCENARIOS = 3;'
      + 'function _wsProject(o){ const c = o.monthly * 12 * o.years; const f = o.initial + c; return { final: f, contributed: c, growth: 0, series: [], assumptions: [] }; }'
      + 'function _wsScenarios(){ return []; }'
      + 'function _wsbChartHtml(){ return "<svg data-chart></svg>"; } function _wsbConclusion(){ return "conclusión"; }', sb);
    load(sb, ['_wsbBase', '_wsbCompare', '_wsbCardsHtml', '_wsbImpactInnerHtml', '_wsbTailHtml']);
    return sb;
  };
  const scen = '[{ id: "A", name: "A", monthly: 200 }]';
  const none = mk({ baseManual: '', years: '10', ret: '5' });
  const cmp0 = vm.runInContext('_wsbCompare(' + scen + ')', none);
  ok('2.1 sin base: la comparación se declara NO publicable', cmp0.publishable === false);
  ok('2.2 …las tarjetas no publican cifra ni botón de guardar',
    !/data-wsh-save/.test(vm.runInContext('_wsbCardsHtml(_wsbCompare(' + scen + '))', none))
    && /<b>—<\/b>/.test(vm.runInContext('_wsbCardsHtml(_wsbCompare(' + scen + '))', none)));
  ok('2.3 …el impacto dice qué falta en vez de un rango desde cero',
    /wsb_need_inputs/.test(vm.runInContext('_wsbImpactInnerHtml(_wsbCompare(' + scen + '))', none)));
  ok('2.4 …y no hay gráfico ni conclusión', vm.runInContext('_wsbTailHtml(_wsbCompare(' + scen + '))', none) === '');
  const noYears = mk({ baseManual: '1000', years: '0', ret: '5' });
  ok('2.5 sin horizonte, tampoco', vm.runInContext('_wsbCompare(' + scen + ').publishable', noYears) === false);
  const full = mk({ baseManual: '1000', years: '1', ret: '0' });
  const cmp1 = vm.runInContext('_wsbCompare(' + scen + ')', full);
  ok('2.6 con base y horizonte se publica todo (1.000 + 200×12 = 3.400)',
    cmp1.publishable === true && cmp1.rows[0].projected === 3400
    && /data-chart/.test(vm.runInContext('_wsbTailHtml(_wsbCompare(' + scen + '))', full))
    && /data-wsh-save/.test(vm.runInContext('_wsbCardsHtml(_wsbCompare(' + scen + '))', full)));
  ok('2.7 guardar escenario respeta la misma validación',
    /if \(!cmpS\.publishable\) return;/.test(fnSrc('_wsbSaveScenario')));
}

// ── 3 · DIARIO EN LA DIVISA DEL DOCUMENTO ───────────────────────────────────
console.log('\n3 · Diario: la misma operación se lee en una sola moneda:');
{
  const sb = sandbox();
  vm.runInContext('var lang = "es", baseCurrency = "EUR"; function t(k){ return k; }'
    + 'function _intccEsc(x){ return String(x == null ? "" : x); }'
    + 'function formatBase(a){ return formatCurrency(a, baseCurrency); }'
    + 'function _wsFormatInputNumber(v){ return String(v); } function _wsFieldUnit(u){ return u === "€" ? "BASE" : u; }'
    + 'function _aurixCurrencyGlyph(c){ return ({ EUR: "€", USD: "$", GBP: "£" })[c] || c; }'
    + 'function _wsToolStateGet(){ return null; } function _wsNum(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }'
    + 'var _wsJrnEditId = null, _wsJrnDraft = null;'
    + 'var _wsToolInputs = { currency: "USD", trades: [{ id: "t1", asset: "AAPL", atype: "stock", buy: 100, sell: 135, qty: 1, fee: 0, currency: "USD" }] };', sb);
  load(sb, ['formatCurrency', '_wsJrnMoney', '_wsJrnPct', 'calculateTradeJournal', '_wsJrnNewDraft', '_wsJrnPreviewHtml',
            '_wsFieldUnitHtml', '_wsJrnFormHtml', '_wsJrnListHtml', '_wsJrnSummaryHtml']);
  const res = vm.runInContext('calculateTradeJournal(_wsToolInputs.trades)', sb);
  const list = vm.runInContext('_wsJrnListHtml(calculateTradeJournal(_wsToolInputs.trades))', sb);
  const sum = vm.runInContext('_wsJrnSummaryHtml(calculateTradeJournal(_wsToolInputs.trades))', sb);
  ok('3.1 con divisa base EUR, un diario en USD pinta sus filas en US$ (no en €)',
    /100,00\s*US\$/.test(list) && /\+35,00\s*US\$/.test(list) && !/€/.test(list), list.replace(/\s+/g, ' ').slice(0, 200));
  ok('3.2 el resumen y las filas dicen la MISMA moneda (+35 USD, no +35 EUR)',
    res.netProfit === 35 && /\+35,00\s*US\$/.test(sum) && !/€/.test(sum));
  const form = vm.runInContext('_wsJrnFormHtml()', sb);
  ok('3.3 la unidad de los campos es la del diario ($), no la de la base', /data-ws-unit="sm">\$</.test(form) && !/BASE/.test(form));
  ok('3.4 con operaciones, la divisa ya no se elige', !/data-wsjrn-input="currency"/.test(form));
  vm.runInContext('_wsToolInputs = { currency: "EUR", trades: [] }; _wsJrnDraft = null;', sb);
  ok('3.5 con el diario vacío se puede elegir la divisa del documento',
    /data-wsjrn-input="currency"/.test(vm.runInContext('_wsJrnFormHtml()', sb)));
  // Captura v801: un borrador creado con la base (USD) antes de abrir un diario en EUR.
  {
    const c2 = sandbox();
    vm.runInContext('var lang = "es", baseCurrency = "USD"; function t(k){ return k; } function _intccEsc(x){ return String(x == null ? "" : x); }'
      + 'function formatBase(a){ return formatCurrency(a, baseCurrency); } function _wsFormatInputNumber(v){ return String(v); }'
      + 'function _wsFieldUnit(u){ return u; } function _aurixCurrencyGlyph(c){ return ({ EUR: "€", USD: "$" })[c] || c; }'
      + 'function _wsToolStateGet(){ return null; } function _wsNum(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }'
      + 'function _wsSurfaceHeadHtml(){ return ""; } function _wsToolDocName(){ return ""; } function _wsToolSavedListHtml(){ return ""; } function _wsToolSaveBarHtml(){ return ""; }'
      + 'var _WS_TOOL_ACCENT = { journal: "x" }, _wsJrnEditId = null, _wsJrnDraft = { currency: "USD", buy: "", qty: "", sell: "", fee: "" };'
      + 'var _wsToolInputs = { currency: "EUR", trades: [{ id: "t1", asset: "BTC", atype: "crypto", buy: 52000, sell: 61000, qty: 0.5, fee: 20, currency: "EUR" }] };', c2);
    load(c2, ['formatCurrency', '_wsJrnMoney', '_wsJrnPct', 'calculateTradeJournal', '_wsJrnNewDraft', '_wsJrnPreviewHtml', '_wsFieldUnitHtml',
              '_wsJrnFormHtml', '_wsJrnListHtml', '_wsJrnSummaryHtml', '_wsJrnChartHtml', '_wsJournalDefaults', '_renderJournalTool']);
    const html = vm.runInContext('_renderJournalTool()', c2);
    const units = [...html.matchAll(/class="ws4-field-unit"[^>]*>([^<]*)</g)].map(m => m[1]);
    ok('3.7 un borrador creado con la base (USD) se alinea con el diario en EUR al abrirlo',
      units.length === 3 && units.every(u => u === '€') && vm.runInContext('_wsJrnDraft.currency', c2) === 'EUR', JSON.stringify(units));
  }
  ok('3.6 la vista previa de una operación abierta usa la divisa del borrador',
    /US\$/.test(vm.runInContext('_wsJrnPreviewHtml({ buy: "10", qty: "2", fee: "", sell: "", currency: "USD" })', sb)));
}

// ── 4 · «TUS PLANES»: NADA DE «COMPROBANDO…» ETERNO ─────────────────────────
console.log('\n4 · Tus planes: el estado vacío no espera una lectura que nadie lanza:');
{
  const st = (table, worst, pull) => {
    const sb = sandbox();
    sb.__w = worst;
    // La lectura de documentos ya tiene llamador (SPEC 1): su estado entra al sandbox.
    vm.runInContext('var _wsDocsPullInFlight = ' + (pull === 'flight') + ', _wsDocsPullFailed = ' + (pull === 'failed') + ', _wsDocsPullSkippedAbsent = ' + (pull === 'remote' ? 1 : 0) + ';', sb);
    vm.runInContext('var _wsDocTableState = ' + JSON.stringify(table) + '; function _wsDocsSession(){ return "u1"; }'
      + 'function _wsDocSyncWorst(){ return __w; }', sb);
    load(sb, ['_wsPlansEmptyState']);
    return vm.runInContext('_wsPlansEmptyState()', sb);
  };
  ok('4.1 tabla sin confirmar y nada en vuelo ⇒ vacío, no cargando', st('unknown', 'idle') === 'empty');
  ok('4.2 una escritura en vuelo sí es «comprobando»', st('unknown', 'saving') === 'loading');
  ok('4.3 un error sigue siendo error (no «no tienes planes»)', st('unknown', 'error') === 'error');
  ok('4.4 la lectura de documentos EN VUELO es «comprobando»', st('unknown', 'idle', 'flight') === 'loading');
  ok('4.5 una lectura fallida es error con reintento, no «no tienes planes»', st('yes', 'idle', 'failed') === 'error');
  ok('4.6 documentos remotos que este dispositivo no recupera ⇒ se dice, no «no tienes planes»', st('yes', 'idle', 'remote') === 'remote_only');
}

// ── 5 · LA PREGUNTA NO ROTA AL NAVEGAR ──────────────────────────────────────
console.log('\n5 · Intelligence: la pregunta mostrada sigue siendo la pregunta:');
{
  const src = fnSrc('_aurixIntelQuestions');
  ok('5.1 la pregunta ya mostrada en ESTA sesión no cae en su propio cooldown',
    /_intelMarkedQuestionId === item\.id\) return true/.test(src)
    && src.indexOf('_intelMarkedQuestionId === item.id') > src.indexOf('const d = declined[item.field]'),
    'después de «declinada» (que sigue mandando) y antes del cooldown');
}

// ── 6 · GUARDAR NO PIERDE EL PRIMER CLIC ────────────────────────────────────
console.log('\n6 · Re-emitir el mismo valor al salir del campo no es una edición:');
{
  const sb = sandbox();
  let barWrites = 0;
  const bar = { _inner: '', firstElementChild: null,
    set innerHTML(h) { barWrites++; this._inner = h; this.firstElementChild = { h }; }, get innerHTML() { return this._inner; } };
  sb.__bar = bar;
  vm.runInContext('var _wsToolInputs = { initial: "250.000" }, _wsToolDirty = false, _wsToolActive = "compound";'
    + 'function _wsNumOrNull(v){ if (v === "" || v == null) return null; const n = Number(String(v).replace(/\\./g, "")); return Number.isFinite(n) ? n : null; }'
    + 'function _wsToolStateSet(){} function _wsToolOutHtmlFor(){ return ""; } function _wsBudgetTopHtml(){ return ""; }'
    + 'function _wsToolSaveBarHtml(){ return _wsToolDirty ? "<b>dirty</b>" : "<b>clean</b>"; }'
    + 'var document = { querySelector: () => ({ querySelector: s => s === "[data-wstool-savebar]" ? __bar : null }) };', sb);
  load(sb, ['_wsToolSaveBarSync', '_wsToolOnInput']);
  vm.runInContext('_wsToolOnInput({ getAttribute: () => "initial", value: "250000" })', sb);
  ok('6.1 el valor canónico re-emitido (250.000 → 250000) no ensucia el documento',
    vm.runInContext('_wsToolDirty', sb) === false && barWrites === 0);
  vm.runInContext('_wsToolOnInput({ getAttribute: () => "initial", value: "260000" })', sb);
  ok('6.2 una edición real sí lo ensucia y pinta la barra una vez', vm.runInContext('_wsToolDirty', sb) === true && barWrites === 1);
  vm.runInContext('_wsToolOnInput({ getAttribute: () => "initial", value: "270000" })', sb);
  ok('6.3 la siguiente pulsación no reemplaza un botón idéntico', barWrites === 1);
}

// ── 7 · NINGUNA EXPORTACIÓN GLOBAL SE LLAMA A SÍ MISMA ──────────────────────
// Una función de nivel superior ES la propiedad global: `window.X = (r) => X(r)`
// reemplaza la declaración por una flecha recursiva. En WebKit (JSC, 'use strict',
// llamadas de cola propias) eso no desborda: CUELGA el hilo. Era el cuelgue de
// escritorio de `switchLang` (vía renderWealthCurve → auditAurixRenderVsCanonical).
console.log('\n7 · Ninguna exportación a window sustituye su propia función por una recursión:');
{
  const decl = new Set([...app.matchAll(/^(?:async )?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map(m => m[1]));
  const bad = [];
  for (const m of app.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=(?!=)\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{?\s*(?:return\s+)?([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (m[1] === m[2] && decl.has(m[1])) bad.push(m[1]);
  }
  ok('7.1 ninguna `window.X = (…) => X(…)` sobre una función declarada', bad.length === 0, bad.join(', '));
  ok('7.2 app.js sigue en modo estricto (por eso el patrón cuelga JSC en vez de lanzar)', /^'use strict';/.test(app));
}

console.log('\n' + (fail ? 'FAIL' : 'PASS') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
