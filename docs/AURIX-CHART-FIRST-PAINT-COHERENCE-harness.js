'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-FIRST-PAINT-COHERENCE-harness — SPEC P0 CHART RELIABILITY & PREMIUM FIRST PAINT
// ════════════════════════════════════════════════════════════════════════════
// Dos defectos demostrados en iPhone/WebKit (demo aislada, motor real), certificados aquí por
// COMPORTAMIENTO ejecutando el código real — no por regex: el aserto previo del LKG comprobaba que el
// badge no RETENÍA un frame restaurado, y seguía verde mientras el contrato lo RE-JUZGABA.
//  1 · LKG + «Calculando…»: en reentrada el frame LKG (curva + color certificados) se republicaba
//      verbatim, pero el badge evaluaba el contrato con la readiness VIVA (hidratación en curso) ⇒ curva
//      roja terminada con «Calculando…» 1–2 s. El frame lleva su propia readiness; el resto de puertas,
//      no: un LKG sin retorno certificado sigue sin %.
//  2 · Publicación antes del primer render del boot: el autostart del gráfico lite y el repintado de
//      foreground pintaban curva/badge/tarjetas desde la caché local SIN auth mientras el hero seguía en
//      skeleton. Antes del primer render no se publica; sin boot (sandbox) o boot terminado ⇒ como antes.
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

// ── 1 · badge de un frame LKG durante la hidratación ────────────────────────
console.log('\n1 · LKG restaurado mientras la hidratación está en curso');
{
  const sb = { Math, Number, JSON, Array, Object, String, isFinite, console: { log(){}, warn(){} },
    _AURIX_BACKEND_SNAPSHOTS_ENABLED: true, _aurixBackendSnapshotsState: 'loading',
    _aurixSourceSetComplete: () => true,
    _aurixBuildContinuityValidatedSeries: () => null,                 // el contrato cae a los puntos del frame
    _aurixMarkReturnPainted(){},
    _aurixChartPublicationSourcesPending: () => ({ pending: true, reason: 'backend_hydration_in_progress' }),
    _aurixHistoryPresentationBadge: () => ({ html: '<span class="wsc-metric-calc">Calculando…</span>', className: 'chart-change calculating' }),
    _aurixFxReturnPreparing: () => false,
    _aurixChartStateI18n: (k, f) => f,
    _aurixReturnInsufficientText: () => 'Historial insuficiente',
    _aurixEmergencyBadgeText: e => (e.badgeReturnPct >= 0 ? '+' : '') + e.badgeReturnPct.toFixed(2) + '%',
  };
  vm.createContext(sb);
  vm.runInContext(konstSrc('_AURIX_PUBLICATION_STATE'), sb);
  vm.runInContext(fnSrc('_aurixResolvePublicationReadiness'), sb);
  vm.runInContext(konstSrc('_AURIX_CHART_RETURN_CONTRACT_UNIFICATION'), sb);
  vm.runInContext(fnSrc('_aurixResolveChartReturnContract'), sb);
  vm.runInContext(fnSrc('_aurixEmergencyPaintBadgeNode'), sb);
  const PAINT = vm.runInContext('_aurixEmergencyPaintBadgeNode', sb);
  const frame = (o) => Object.assign({ range: '24h', state: 'ready', returnState: 'ok', badgeReturnPct: -1.09, returnPct: -1.09,
    points: [{ ts: 1, value: 100 }, { ts: 2, value: 99 }, { ts: 3, value: 98.9 }] }, o || {});
  const node = () => ({ innerHTML: '', className: 'chart-change' });

  const el = node(); PAINT(el, frame({ _aurixLkgRestored: true }), 'mobile');
  ok('el LKG publica su % con la curva (no «Calculando…»)', /-1\.09%/.test(el.innerHTML) && !/Calculando/.test(el.innerHTML), el.innerHTML);
  ok('…con el tono de su signo', el.className === 'chart-change down', el.className);

  const el2 = node(); PAINT(el2, frame(), 'mobile');
  ok('un frame VIVO durante la hidratación sigue retenido (nada publicado)', el2.innerHTML === '' && el2.className === 'chart-change', el2.innerHTML);

  const el3 = node(); PAINT(el3, frame({ _aurixLkgRestored: true, returnState: 'insufficient_return_history', badgeReturnPct: null, returnPct: null }), 'mobile');
  ok('un LKG sin retorno certificado NO gana un % (las demás puertas siguen)', !/%/.test(el3.innerHTML), el3.innerHTML);

  sb._aurixBackendSnapshotsState = 'ready'; sb._aurixChartPublicationSourcesPending = () => ({ pending: false, reason: null });
  const el4 = node(); PAINT(el4, frame(), 'mobile');
  ok('con las fuentes asentadas el frame vivo publica igual que antes', /-1\.09%/.test(el4.innerHTML) && el4.className === 'chart-change down', el4.innerHTML);

  sb._aurixBackendSnapshotsState = 'failed';
  const el5 = node(); PAINT(el5, frame(), 'mobile');
  ok('hidratación FALLIDA: el frame vivo sigue sin % (STALE_HISTORY intacto)', !/%/.test(el5.innerHTML), el5.innerHTML);
}

// ── 2 · nada se publica antes del primer render del boot ─────────────────────
console.log('\n2 · primer render del boot');
{
  const calls = { chart: 0, perf: 0, donut: 0, cards: 0, badges: 0 };
  const win = { AURIX_MOBILE_SAFE: true };
  const sb = { Math, Number, JSON, Array, Object, String, console: { log(){}, warn(){} }, window: win, document: {},
    setTimeout: (f) => { f(); return 1; }, clearTimeout(){}, requestAnimationFrame: (f) => f(),
    activeRange: '24h', _aurixMobileChartState: {}, _aurixMobileLiteToken: 0, _aurixMobileLiteTimer: null,
    renderAurixMobileLiteChart: () => { calls.chart++; }, _aurixMobileSetPerfIndicator: () => { calls.perf++; },
    renderAurixMobileDonutLite: () => { calls.donut++; }, updateCategoryCards: () => { calls.cards++; },
    _aurixFindReturnBadgeNodes: () => { calls.badges++; return []; }, _aurixPaintReturnBadge(){}, _aurixNodeIsVisible: () => true };
  vm.createContext(sb);
  vm.runInContext('let _aurixBootFinished = false;', sb);
  vm.runInContext(fnSrc('_aurixDashboardFirstRenderPending'), sb);
  vm.runInContext(fnSrc('scheduleAurixMobileLite'), sb);
  vm.runInContext(fnSrc('_aurixRepaintReturnBadges'), sb);
  const run = () => { const b = Object.assign({}, calls); vm.runInContext('scheduleAurixMobileLite("24h"); _aurixRepaintReturnBadges("fg-pageshow");', sb);
    return { chart: calls.chart - b.chart, perf: calls.perf - b.perf, cards: calls.cards - b.cards, badges: calls.badges - b.badges }; };

  let d = run();
  ok('sin boot (sandbox de unidad) ⇒ pinta como antes', d.chart === 1 && d.perf === 1 && d.cards === 1 && d.badges === 1, JSON.stringify(d));
  win.__aurixBootReady = { auth: false, dashboard: false };
  d = run();
  ok('boot en curso sin primer render ⇒ ni curva, ni badge, ni tarjetas, ni repintado de foreground', d.chart === 0 && d.perf === 0 && d.cards === 0 && d.badges === 0, JSON.stringify(d));
  win.__aurixBootReady.auth = true;
  d = run();
  ok('auth resuelta pero sin render ⇒ sigue sin publicar (el hero aún es skeleton)', d.chart === 0 && d.badges === 0, JSON.stringify(d));
  win.__aurixBootReady.dashboard = true;
  d = run();
  ok('tras el primer render ⇒ publica', d.chart === 1 && d.perf === 1 && d.cards === 1 && d.badges === 1, JSON.stringify(d));
  win.__aurixBootReady.dashboard = false; vm.runInContext('_aurixBootFinished = true;', sb);
  d = run();
  ok('boot forzado por fallo/failsafe ⇒ no bloquea para siempre', d.chart === 1 && d.badges === 1, JSON.stringify(d));
  ok('el paso 6 del boot sigue siendo un disparador del primer pintado móvil',
     /if \(window\.AURIX_MOBILE_SAFE\) \{[\s\S]{0,1500}?try \{ scheduleAurixMobileLite\(\); \} catch \(_\) \{\}/.test(app));
  ok('…y va DESPUÉS de marcar el dashboard renderizado',
     app.indexOf('window.__aurixBootReady.dashboard = true;') < app.indexOf('try { scheduleAurixMobileLite(); } catch (_) {}'));
}

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail === 0 ? 0 : 1);
