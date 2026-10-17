'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX v843 · CHART INSTITUTIONAL CLOSURE — presentación del gráfico patrimonial, ejecutada.
// ════════════════════════════════════════════════════════════════════════════
// Reproducido en la app real (arranque autenticado, Supabase simulado con latencia de producción,
// 61 días de snapshots a 15 min, Chromium y WebKit, escritorio y móvil):
//   1. La retención de primera publicación VACIABA el host del gráfico contando con un skin del markup
//      que no llega a la superficie visible ⇒ 5,6 s de rectángulo vacío con el patrimonio ya pintado,
//      y vacío INDEFINIDO si una lectura no responde.
//   2. 1A con menos de un año de historia: el productor declara `insufficient_return_history`, la FRC
//      certifica la curva (TRUSTED_RETURN) y ese estado no tenía texto ⇒ «Calculando…» para siempre.
//   3. «Historial disponible» y «Rendimiento no disponible» significan lo mismo (curva válida, rentabilidad
//      no certificable) y el primero no explicaba nada ⇒ un texto: «Rentabilidad no calculable».
// Aquí se ejecutan los owners REALES de la presentación (extraídos del bundle) con la FRC simulada.
const fs = require('fs'), path = require('path'), vm = require('vm');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
const idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let pass = 0, fail = 0; const failed = [];
function ok(n, c, info) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; failed.push(n); console.log('  ✗ ' + n + (info !== undefined ? '  →  ' + info : '')); } }
function fnSrc(name) {
  const i = app.indexOf('\nfunction ' + name + '('); if (i < 0) throw new Error('missing ' + name);
  let d = 0, st = false; for (let k = i; k < app.length; k++) { if (app[k] === '{') { d++; st = true; } else if (app[k] === '}') { d--; if (st && !d) return app.slice(i, k + 1); } }
}
function constLine(name) { const m = new RegExp('\\nconst ' + name + ' = [^\\n]*').exec(app); if (!m) throw new Error('missing const ' + name); return m[0]; }
function dict(code) {   // los textos REALES del diccionario de cada idioma
  const start = app.indexOf(code === 'es' ? "chartCalculating:    'Calculando…'" : "chartCalculating:    'Calculating…'");
  const block = app.slice(start, app.indexOf('chartTipValue', start));
  const o = {}; for (const m of block.matchAll(/(\w+):\s*'([^']*)'/g)) o[m[1]] = m[2]; return o;
}
function world({ pres, pending = false, lang = 'es' }) {
  const ctx = { T: { es: dict('es'), en: dict('en') }, lang,
    _aurixResolveFinalRenderSeriesContract: () => ({}), _aurixResolveReturnPresentation: () => pres,
    _aurixChartPublicationSourcesPending: () => ({ pending }) };
  vm.createContext(ctx);
  vm.runInContext(['_AURIX_RETURN_PENDING_TEXT', '_AURIX_HIST_PARTIAL_TEXT', '_AURIX_HIST_AVAILABLE_TEXT',
    '_AURIX_RETURN_INSUFFICIENT_HISTORY_TEXT', '_AURIX_RETURN_UNAVAILABLE_TEXT'].map(constLine).join('\n') + '\n' +
    ['_aurixChartStateI18n', '_aurixReturnPendingHTML', '_aurixReturnPresentationText', '_aurixHistoryPresentationBadge'].map(fnSrc).join('\n'), ctx);
  return ctx;
}
const badge = (w, emg) => vm.runInContext('_aurixHistoryPresentationBadge(' + JSON.stringify(emg) + ', "desktop")', w);
const READY_SHORT = { state: 'ready', range: '1y', returnState: 'insufficient_return_history' };

console.log('\nAURIX v843 · CHART INSTITUTIONAL CLOSURE\n');
console.log('— 1A / ventana más larga que la historia');
let b = badge(world({ pres: 'TRUSTED_RETURN' }), READY_SHORT);
ok('FRC certifica la curva + productor declara historia insuficiente ⇒ «Historial insuficiente» (antes «Calculando…» perpetuo)',
  b.pres === 'INSUFFICIENT_HISTORY' && /Historial insuficiente/.test(b.html) && b.className === 'chart-change flat', JSON.stringify(b));
b = badge(world({ pres: 'CALCULATING' }), READY_SHORT);
ok('lo mismo cuando la FRC no trae evidencia (CALCULATING)', b.pres === 'INSUFFICIENT_HISTORY');
b = badge(world({ pres: 'TRUSTED_RETURN', pending: true }), READY_SHORT);
ok('con fuentes EN VUELO no se declara nada terminal (sigue «Calculando…»)', !/Historial insuficiente/.test(b.html) && /Calculando/.test(b.html), JSON.stringify(b));
b = badge(world({ pres: 'CALCULATING' }), { state: 'ready', range: '1y', returnState: 'ok' });
ok('sin esa declaración del productor el comportamiento previo no cambia', b.pres === 'CALCULATING');
b = badge(world({ pres: 'PARTIAL_HISTORY' }), READY_SHORT);
ok('un estado terminal ya decidido por la FRC no se toca («Historial parcial»)', b.pres === 'PARTIAL_HISTORY' && /Historial parcial/.test(b.html));
b = badge(world({ pres: 'TRUSTED_RETURN', lang: 'en' }), READY_SHORT);
ok('EN: «Insufficient history»', /Insufficient history/.test(b.html));
ok('nunca publica un porcentaje ni color direccional', !/%/.test(badge(world({ pres: 'TRUSTED_RETURN' }), READY_SHORT).html));

console.log('— Texto de «curva válida sin rentabilidad certificable»');
for (const [lng, txt] of [['es', 'Rentabilidad no calculable'], ['en', 'Return not calculable']]) {
  const w = world({ pres: 'AVAILABLE_HISTORY', lang: lng });
  ok(lng + ': AVAILABLE_HISTORY ⇒ «' + txt + '»', vm.runInContext('_aurixReturnPresentationText("AVAILABLE_HISTORY")', w) === txt);
  ok(lng + ': RETURN_UNAVAILABLE ⇒ el MISMO texto', vm.runInContext('_aurixReturnPresentationText("RETURN_UNAVAILABLE")', w) === txt);
  ok(lng + ': «Historial parcial»/«insuficiente» se conservan (describen cobertura)',
    vm.runInContext('_aurixReturnPresentationText("PARTIAL_HISTORY")', w) !== txt && vm.runInContext('_aurixReturnPresentationText("INSUFFICIENT_HISTORY")', w) !== txt);
}

console.log('— Retención: skin de carga en el host visible');
{
  const ctx = { T: { es: dict('es'), en: dict('en') }, lang: 'es' }; vm.createContext(ctx);
  vm.runInContext(constLine('_AURIX_CHART_HOLD_SVG') + '\n' + fnSrc('_aurixChartStateI18n') + '\n' + fnSrc('_aurixChartHoldSkeleton'), ctx);
  let writes = 0, html = '';
  const host = { querySelector: (s) => (s === '.chart-loading-skin.wsc-hold' && /wsc-hold/.test(html)) ? {} : null };
  Object.defineProperty(host, 'innerHTML', { get: () => html, set: (v) => { writes++; html = v; } });
  ctx.__h = host;
  vm.runInContext('_aurixChartHoldSkeleton(__h); _aurixChartHoldSkeleton(__h); _aurixChartHoldSkeleton(__h);', ctx);
  ok('pinta el MISMO skin del producto (chart-loading-skin + línea fantasma)', /chart-loading-skin wsc-hold/.test(html) && /chart-loading-skin__stroke/.test(html));
  ok('no publica curva, porcentaje ni copy de estado', !/wsc-line|wsc-metric|%|Calculando|Histórico en construcción/.test(html));
  ok('una retención que se repinta NO lo reescribe (sin parpadeo; la nota de espera no se reinicia)', writes === 1, writes);
  ok('nota de espera larga localizada (ES/EN)', /tardando más de lo habitual/.test(html) && /taking longer than usual/.test(app));
}
ok('escritorio: la puerta de publicación usa el skin (no vacía el host)', /_aurixSetChartSkin\(surface, 'loading'\);[\s\S]{0,80}_aurixChartHoldSkeleton\(hostEl\);/.test(app));
ok('móvil: la retención quiet usa el skin', /if \(opts && opts\.quiet\) \{ _aurixChartHoldSkeleton\(host\); return; \}/.test(app));
ok('móvil: el host lite nace con el skin (sin frame vacío al crearlo)', /host\.style\.cssText = [^\n]+\n[\s\S]{0,300}_aurixChartHoldSkeleton\(host\);[\s\S]{0,40}area\.appendChild\(host\);/.test(app));
ok('móvil: el markup inicial ya trae el skin (primer frame)', /id="wealthCurveMobile"><div class="chart-loading-skin wsc-hold"/.test(idx));
ok('móvil: fuera el placeholder falso «Gráfico temporalmente desactivado en móvil»', !/Gráfico temporalmente desactivado en móvil<\/div>/.test(app));
ok('CSS: la nota aparece sólo tras una espera larga y respeta reduced-motion',
  /\.wsc-hold-slow \{[\s\S]{0,300}opacity: 0;[\s\S]{0,120}animation: wscHoldSlow \.4s[^;]*12s forwards;/.test(css) && /prefers-reduced-motion: reduce\) \{ \.wsc-hold-slow \{ animation-duration: 0s; \} \}/.test(css));
ok('preservado: la animación de trazado de la curva definitiva no cambia (420 ms, one-shot)', /animation: aurixLineDraw \.42s/.test(css));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('FALLARON: ' + failed.join(' · ')); process.exit(1); }
