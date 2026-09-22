'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-WORKSPACE-OPERATIVE — la cabecera compartida y el retorno, ejecutados
// ════════════════════════════════════════════════════════════════════════════
// QUÉ CUBRE ESTE GATE Y QUÉ NO. La GEOMETRÍA de la primera pantalla —dónde cae el
// primer campo, si una celda se sale de su fila, si un texto se pinta fuera de su
// tarjeta— no se puede responder sin un motor de layout, y tiene su propio owner:
// `scripts/aurix-ws-firstscreen-probe.mjs`, que la mide en Chromium y en WebKit.
// Aquí vive lo que SÍ es contrato de código y puede fosilizarse en CI:
//   · que las ocho capacidades publicadas usen UNA cabecera y no ocho,
//   · que esa cabecera no vuelva a ser una tarjeta de presentación,
//   · que el retorno nombre su origen REAL, incluido el Dashboard preparado,
//   · que el nombre del documento abierto se publique y no se confunda con el
//     nombre de la plantilla,
//   · y que el ciclo de vida (Guardar / Guardar como / Renombrar / Eliminar)
//     siga exactamente donde estaba.
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
function konstSrc(name){ const m=new RegExp('^const '+name+'\\s*=','m').exec(app);
  if(!m) throw new Error('missing const '+name); const i=m.index;
  let k=i, depth=0, started=false; for(;k<app.length;k++){ const c=app[k]; if(c==='('||c==='{'||c==='[') {depth++;started=true;} else if(c===')'||c==='}'||c===']') depth--; else if(c===';'&&(!started||depth===0)) { k++; break; } }
  return app.slice(i,k); }
let pass=0, fail=0; function ok(n,c,info){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(info?'  ['+info+']':''));} }

console.log('AURIX-WORKSPACE-OPERATIVE — cabecera compacta, retorno y ciclo de vida\n');

// ── EL DICCIONARIO REAL, no un stub que siempre acierta ────────────────────
function ctx(langCode) {
  const sb = { Math, Number, String, Object, Array, JSON, Date, Intl, console: { warn(){}, error(){} } };
  vm.createContext(sb);
  const tI = app.indexOf('const T = {');
  let k = app.indexOf('{', tI), d = 0, end = -1;
  for (; k < app.length; k++) { if (app[k] === '{') d++; else if (app[k] === '}') { d--; if (!d) { end = k + 1; break; } } }
  vm.runInContext('var lang = ' + JSON.stringify(langCode) + ';', sb);
  vm.runInContext(app.slice(tI, end) + ';', sb);
  vm.runInContext('function t(k){ var dd=T[lang]||T.es; var v=dd[k]; if(v===undefined) v=T.es[k]; return v; }', sb);
  vm.runInContext('function _intccEsc(x){ return String(x == null ? "" : x).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c])); }', sb);
  vm.runInContext('var _wsReturnTab = "tools", _wsToolEditId = null, _wsToolActive = "compound", _wsToolDirty = false;', sb);
  vm.runInContext('var __PROJ = []; function _ws4Projects(){ return __PROJ; }', sb);
  vm.runInContext('function _wsCanPersist(){ return true; }', sb);
  ['_WS_TABS', '_WS_BACK_ORIGINS'].forEach(n => vm.runInContext(konstSrc(n), sb));
  ['_wsTabOk', '_wsBackOrigin', '_wsBackLabel', '_wsBackShort', '_wsToolDocName',
   '_wsSurfaceHeadHtml', '_wsToolSaveBarHtml'].forEach(n => vm.runInContext(fnSrc(n), sb));
  return sb;
}
const R = (c, e) => vm.runInContext(e, c);

// ════════════════════════════════════════════════════════════════════════════
// 1 · UNA CABECERA, NO OCHO
// ════════════════════════════════════════════════════════════════════════════
console.log('1 · Las ocho capacidades comparten cabecera:');
{
  // Los renderizadores de las OCHO capacidades publicadas. Las superficies
  // internas (Proyección, hojas legacy, Seguimiento de precios) conservan su
  // cabecera antigua a propósito: no son alcance de este bloque y cambiarlas
  // sería tocar lo que la SPEC pide preservar.
  const IN_SCOPE = ['_renderCompoundTool', '_renderLoanTool', '_renderBudgetTool',
    '_renderJournalTool', '_renderRealEstateTool', '_renderReceivablesTool',
    '_renderScenarioBuilder', '_renderGoals'];
  IN_SCOPE.forEach(fn => {
    const src = fnSrc(fn);
    ok('1.1 ' + fn + ' usa la cabecera compartida y ya no monta la tarjeta antigua',
      /_wsSurfaceHeadHtml\(/.test(src) && src.indexOf('wsb-header') === -1,
      src.indexOf('wsb-header') !== -1 ? 'conserva .wsb-header' : 'no llama a _wsSurfaceHeadHtml');
  });
  // El detalle de un inmueble es la MISMA capacidad y también se unificó.
  ok('1.2 el detalle de un inmueble comparte la barra, con su propio retorno',
    /_wsSurfaceHeadHtml\(\{[\s\S]{0,400}data-wsre-back/.test(fnSrc('_wsReDetailHtml')),
    'el detalle debe volver a la cartera, no a Herramientas');
  // Y lo que NO es alcance sigue como estaba: si esto se volviera verde por su
  // cuenta, alguien habría tocado superficies internas sin pedirlo.
  ok('1.3 las superficies internas conservan su cabecera (fuera de alcance)',
    /wsb-header/.test(fnSrc('_renderWealthProjection')) && /wsb-header/.test(fnSrc('_renderAssetPricesTool')));
  ok('1.4 la barra NO es una tarjeta: no lleva la clase del panel de cristal',
    !/class="wsh-card[^"]*wsh-bar|class="wsh-bar[^"]*wsh-card/.test(fnSrc('_wsSurfaceHeadHtml')));
  ok('1.5 ningún chip de plan dentro de la cabecera de una capacidad abierta',
    IN_SCOPE.every(fn => !/_wsSurfaceHeadHtml\([\s\S]{0,300}_wsTierChip/.test(fnSrc(fn))));
  // §1 pide retirar el título de sección REPETIDO. El caso real era doble: el
  // «DATOS DE ENTRADA» de compound y loan, y la lista del Diario, que se titulaba
  // con el nombre de la propia herramienta.
  ok('1.6 sin «datos de entrada» repetido bajo el título de la herramienta',
    !/ws4_inputs_title/.test(fnSrc('_renderCompoundTool')) && !/ws4_inputs_title/.test(fnSrc('_renderLoanTool')));
  // Se mide sobre el CÓDIGO, no sobre los comentarios: la clave retirada se cita
  // a propósito en la nota de al lado para que nadie la reintroduzca sin leer por
  // qué se fue, y un regex sobre el fichero entero la encontraría ahí.
  {
    const jrnList = fnSrc('_wsJrnListHtml').replace(/^\s*\/\/.*$/gm, '');
    ok('1.7 la lista del Diario tiene título propio, no el de la herramienta',
      /wsjrn_list_title/.test(jrnList) && !/wstool_journal_n/.test(jrnList));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · EL RETORNO NOMBRA SU ORIGEN REAL
// ════════════════════════════════════════════════════════════════════════════
console.log('\n2 · Volver a donde se venía:');
{
  const EXPECT = {
    tools:      { es: ['Volver a Herramientas', 'Herramientas'], en: ['Back to Tools', 'Tools'] },
    templates:  { es: ['Volver a Plantillas', 'Plantillas'],     en: ['Back to Templates', 'Templates'] },
    space:      { es: ['Volver a Mi espacio', 'Mi espacio'],     en: ['Back to My space', 'My space'] },
    internal:   { es: ['Volver a Interno', 'Interno'],           en: ['Back to Internal', 'Internal'] },
    dashboard:  { es: ['Volver al Dashboard', 'Dashboard'],      en: ['Back to Dashboard', 'Dashboard'] },
  };
  ['es', 'en'].forEach(lg => {
    const c = ctx(lg);
    Object.keys(EXPECT).forEach(origin => {
      R(c, '_wsReturnTab = ' + JSON.stringify(origin) + ';');
      const long = R(c, '_wsBackLabel()'), short = R(c, '_wsBackShort()');
      ok('2.1 ' + lg + '/' + origin + ' · etiqueta larga y corta, traducidas',
        long === EXPECT[origin][lg][0] && short === EXPECT[origin][lg][1],
        JSON.stringify([long, short]));
    });
    // FALLA A HERRAMIENTAS, no a una cadena vacía: un origen inventado no puede
    // dejar el botón sin destino ni sin nombre.
    R(c, '_wsReturnTab = "inventado";');
    ok('2.2 ' + lg + ' · un origen desconocido cae en Herramientas, no en vacío',
      R(c, '_wsBackOrigin()') === 'tools' && !!R(c, '_wsBackShort()'));
  });
  // El retorno a DASHBOARD está preparado y lo despacha el MISMO owner: no hay un
  // segundo camino de vuelta escondido. Nadie lo fija todavía, y eso es correcto.
  ok('2.3 el retorno al Dashboard existe en el owner único de «Volver»',
    /_wsBackOrigin\(\) === 'dashboard'/.test(fnSrc('_wshWireOnce'))
    && /switchTab\('dashboard'\)/.test(fnSrc('_wshWireOnce')));
  // 2.4 SE ACTUALIZA: el punto de enganche YA TIENE quien lo escriba. «Tus
  // planes» (§B del cierre visual) abre una plantilla desde el Dashboard, así
  // que el retorno tiene que volver ahí. Lo que se sigue vigilando es que haya
  // UN solo escritor y que sea ése — no que no haya ninguno.
  ok('2.4 el origen `dashboard` lo escribe EXACTAMENTE un sitio: «Continuar»',
    (app.replace(/^\s*\/\/.*$/gm, '').match(/_wsReturnTab = 'dashboard'/g) || []).length === 1
    && /_wsReturnTab = 'dashboard';/.test(fnSrc('_wsPlansOpen')));
  // El `aria-label` lleva el destino COMPLETO aunque la barra enseñe la corta:
  // un usuario de lector de pantalla oye «Volver a Plantillas», no «Plantillas».
  {
    const c = ctx('es'); R(c, '_wsReturnTab = "templates";');
    const html = R(c, '_wsSurfaceHeadHtml({ title: "X" })');
    ok('2.5 la barra publica la etiqueta corta y el destino completo en el aria',
      /aria-label="Volver a Plantillas"/.test(html) && />Plantillas</.test(html));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · EL DOCUMENTO ABIERTO SE NOMBRA, Y NO SE CONFUNDE CON LA PLANTILLA
// ════════════════════════════════════════════════════════════════════════════
console.log('\n3 · Nombre del documento:');
{
  const c = ctx('es');
  ok('3.1 sin documento guardado no se inventa un nombre',
    R(c, '_wsToolDocName()') === '' && R(c, '_wsSurfaceHeadHtml({ title: "Interés compuesto" })').indexOf('wsh-bar-doc') === -1);
  R(c, '__PROJ = [{ id: "p1", customName: "Mi plan 2030" }]; _wsToolEditId = "p1";');
  ok('3.2 con documento abierto, la barra publica SU nombre',
    R(c, '_wsToolDocName()') === 'Mi plan 2030');
  const html = R(c, '_wsSurfaceHeadHtml({ title: "Interés compuesto", doc: _wsToolDocName() })');
  ok('3.3 y es distinguible del tipo de plantilla: dos elementos, dos clases',
    /wsh-bar-title">Interés compuesto</.test(html) && /wsh-bar-doc">Mi plan 2030</.test(html));
  // Un documento sin nombre propio no puede publicar una cadena vacía como si
  // fuera un nombre: el hueco desaparece y queda sólo el tipo.
  R(c, '__PROJ = [{ id: "p1", customName: "" }];');
  ok('3.4 un documento sin nombre no pinta una etiqueta vacía',
    R(c, '_wsToolDocName()') === ''
    && R(c, '_wsSurfaceHeadHtml({ title: "X", doc: _wsToolDocName() })').indexOf('wsh-bar-doc') === -1);
}

// ════════════════════════════════════════════════════════════════════════════
// 4 · LA AYUDA CONSERVA LO QUE LA CABECERA DEJA DE ENSEÑAR
// ════════════════════════════════════════════════════════════════════════════
console.log('\n4 · Nada se pierde, se repliega:');
{
  ['es', 'en'].forEach(lg => {
    const c = ctx(lg);
    const html = R(c, '_wsSurfaceHeadHtml({ title: "X", help: [t("wstool_compound_d"), t("wsre_local_note")] })');
    ok('4.1 ' + lg + ' · la ayuda es un <details> nativo (teclado y lector de pantalla)',
      /<details class="wsh-bar-help">/.test(html) && /<summary class="wsh-bar-helpsum"/.test(html)
      && /aria-label="/.test(html.slice(html.indexOf('helpsum'))));
    ok('4.2 ' + lg + ' · y publica los textos que la barra ya no enseña',
      html.indexOf(R(c, 't("wstool_compound_d")')) !== -1 && html.indexOf(R(c, 't("wsre_local_note")')) !== -1);
    ok('4.3 ' + lg + ' · sin textos de ayuda no se pinta un control vacío',
      R(c, '_wsSurfaceHeadHtml({ title: "X", help: ["", "   "] })').indexOf('wsh-bar-help') === -1);
  });
  // Las capacidades que tenían subtítulo o nota lo han MOVIDO, no borrado.
  const MOVED = [['_renderCompoundTool', 'wstool_compound_d'], ['_renderLoanTool', 'wsloan_sub'],
    ['_renderBudgetTool', 'wstool_budget_d'], ['_renderJournalTool', 'wstool_journal_d'],
    ['_renderRealEstateTool', 'wsre_d'], ['_renderRealEstateTool', 'wsre_local_note'],
    ['_renderReceivablesTool', 'wsrecv_sub'], ['_renderScenarioBuilder', 'wsb_subtitle'],
    ['_renderGoals', 'wsg_subtitle']];
  MOVED.forEach(([fn, key]) => {
    const src = fnSrc(fn);
    ok('4.4 ' + fn + ' conserva «' + key + '», ahora en la ayuda',
      new RegExp('_wsSurfaceHeadHtml\\([\\s\\S]{0,400}' + key).test(src), 'el texto no puede desaparecer');
  });
}

// ════════════════════════════════════════════════════════════════════════════
// 5 · EL CICLO DE VIDA DEL DOCUMENTO SIGUE DONDE ESTABA
// ════════════════════════════════════════════════════════════════════════════
console.log('\n5 · Guardar, Guardar como, Renombrar y Eliminar:');
{
  const c = ctx('es');
  R(c, '__PROJ = [{ id: "p1", customName: "Mi plan" }]; _wsToolEditId = null; _wsToolDirty = false;');
  const fresh = R(c, '_wsToolSaveBarHtml()');
  ok('5.1 sin documento abierto se ofrece Guardar y nada más',
    /data-wstool-save\b/.test(fresh) && fresh.indexOf('data-wstool-saveas') === -1
    && fresh.indexOf('data-wstool-rename') === -1 && fresh.indexOf('data-wstool-delete') === -1);
  R(c, '_wsToolEditId = "p1"; _wsToolDirty = true;');
  const open = R(c, '_wsToolSaveBarHtml()');
  ok('5.2 con documento abierto están las cuatro acciones',
    /data-wstool-save\b/.test(open) && /data-wstool-saveas/.test(open)
    && /data-wstool-rename/.test(open) && /data-wstool-delete/.test(open));
  // «Guardar como» crea otra instancia; «Guardar» actualiza. Es la diferencia que
  // impide que renombrar una simulación destruya la anterior.
  ok('5.3 «Guardar» actualiza y «Guardar como» fuerza instancia nueva',
    /_wsToolCommit\(null, false\)/.test(fnSrc('_wsToolSave'))
    && /_wsToolCommit\([^)]*true\)/.test(fnSrc('_wsToolSaveAs'))
    && /forceNew \? null : \(_wsToolEditId[\s\S]{0,80}|!forceNew && _wsToolEditId/.test(fnSrc('_wsToolCommit')));
  // Y el estado de guardado sigue siendo honesto: pendiente ≠ guardado.
  ok('5.4 el estado distingue sin guardar / pendiente / guardado',
    /state = _wsToolEditId \? \(_wsToolDirty \? 'dirty' : 'saved'\) : 'unsaved'/.test(fnSrc('_wsToolSaveBarHtml')));
}

// ════════════════════════════════════════════════════════════════════════════
// 6 · LEGIBILIDAD Y TOQUE: LO QUE SÍ ES CONTRATO DE HOJA DE ESTILOS
// ════════════════════════════════════════════════════════════════════════════
console.log('\n6 · El suelo de §3, declarado en la hoja:');
{
  // Una regla `wsh-bar*` sin `.aurix-wsh` delante podría alcanzar cualquier otra
  // sección el día que alguien reutilice el nombre. Se mide selector a selector.
  {
    const loose = (css.match(/^[^@}{\n][^{\n]*\.wsh-bar[\w-]*[^{\n]*\{/gm) || [])
      .filter(l => l.indexOf('.aurix-wsh') === -1);
    ok('6.1 el CSS de la barra está ACOTADO a Workspace', loose.length === 0, JSON.stringify(loose));
  }
  ok('6.2 el título vive en la banda de §3 (21 móvil / 26 escritorio)',
    /\.aurix-wsh \.wsh-bar-title \{[\s\S]{0,200}font-size: 21px/.test(css)
    && /\.aurix-wsh \.wsh-bar-title \{ font-size: 26px; \}/.test(css));
  ok('6.3 el retorno conserva 44 px reales aunque se lea discreto',
    /\.aurix-wsh \.wsh-bar-back \{[\s\S]{0,400}min-height: 44px/.test(css));
  ok('6.4 la acción primaria de Workspace es un objetivo táctil',
    /\.aurix-wsh \.wsh-cta \{[\s\S]{0,120}min-height: 44px/.test(css));
  ok('6.5 los campos operativos de Workspace son de 16 px',
    /\.aurix-wsh \.ws4-num[^{]*\{[\s\S]{0,80}font-size: 16px/.test(css));
  // El suelo de 12 px sustituye al de 11 px ANTERIOR, y sólo dentro de Workspace.
  ok('6.6 el suelo tipográfico de Workspace sube a 12 px y se declara',
    /WORKSPACE OPERATIVO · §3 — SUELO DE LEGIBILIDAD/.test(css)
    && /\.aurix-wsh \.wsre-kpi-k,/.test(css));
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
