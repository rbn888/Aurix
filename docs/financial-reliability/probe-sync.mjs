#!/usr/bin/env node
/**
 * AURIX · SONDA DE RECUPERACIÓN DE DOCUMENTOS (Workspace) — demo aislada con Supabase FALSO.
 *   AURIX_DEMO_URL=http://127.0.0.1:8766/ node docs/financial-reliability/probe-sync.mjs
 * Certifica el CONTRATO del cliente (lectura por cuenta, fusión por revisión, sin sustituir lo
 * local, sin escribir si la cuenta cambió en vuelo, aislamiento al cambiar de cuenta). NO certifica
 * la sincronización real con producción ni dos dispositivos físicos.
 */
const O = String(process.env.AURIX_DEMO_URL || 'http://127.0.0.1:8766/').replace(/\/?$/, '/');
const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
const { chromium, webkit } = await import(PW);
let pass = 0; const fails = [];
const ok = (n, c, i) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (i ? '  [' + i + ']' : '')); console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } };
for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]].filter(e => (process.env.ENGINES || 'CR,WK').split(',').includes(e[0]))) {
  const browser = await launcher.launch(); const T = ENG; console.log('\n══ ' + T + ' ══');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  let first = true;
  const login = async email => {
    if (first) { await p.goto(O + 'demo.html'); await p.check('input[value="premium"]').catch(() => {}); await p.click('[data-demo=onboarding]'); await p.waitForURL(/login\.html/); first = false; }
    else await p.goto(O + 'login.html');
    await p.waitForTimeout(800); await p.fill('#email', email); await p.click('#auth-submit'); await p.waitForSelector('#otpSection', { state: 'visible' });
    await p.fill('#otp-code', '24681357'); await p.click('#otp-submit'); await p.waitForURL(/index\.html/, { timeout: 15000 }); await p.waitForTimeout(4500);
  };
  await login('a.sintetica@example.com');
  const prem = await p.evaluate(() => _wsCanPersist());
  ok(`${T} (prerrequisito) la cuenta sintética A es Premium en la demo`, prem);
  // A guarda un documento: se sube a la tabla falsa con su revisión.
  await p.evaluate(() => { const d = { id: 'ws4_sync_a', type: 'compound_growth', customName: 'Plan de A', inputs: { initial: 1000, currency: 'EUR' }, results: { final: 1000, currency: 'EUR' }, currency: 'EUR', bodyVersion: 1, revision: 0, createdAt: 1, updatedAt: 1 }; _ws4Persist(d); });
  await p.evaluate(() => _wsDocsPush('aurix_ws_projects_v1')); await p.waitForTimeout(300);
  // DISPOSITIVO NUEVO: el almacén local de documentos se vacía y se recarga.
  await p.evaluate(() => { localStorage.removeItem('aurix_ws_projects_v1'); });
  await p.reload(); await p.waitForTimeout(5000);
  const got = await p.evaluate(() => _ws4Projects().map(x => x.id + '@' + x.revision + ':' + x.currency).join(','));
  ok(`${T} recarga sin datos locales: el documento de A vuelve desde la tabla (misma moneda y revisión)`, got === 'ws4_sync_a@1:EUR', got);
  ok(`${T} «Tus planes» no se queda en «Comprobando» tras la lectura`, await p.evaluate(() => !_wsDocsPullInFlight && _wsPlansEmptyState() !== 'loading'));
  // Edición local MÁS NUEVA que la remota: la lectura no la pisa.
  await p.evaluate(() => { const d = _ws4Projects().find(x => x.id === 'ws4_sync_a'); d.customName = 'Plan de A editado'; _ws4Persist(d); _wsDocsPulledFor = null; });
  await p.evaluate(() => _wsDocsPull()); 
  ok(`${T} una edición local más nueva no la pisa una lectura antigua`, await p.evaluate(() => _ws4Projects().find(x => x.id === 'ws4_sync_a').customName === 'Plan de A editado'));
  // Subida PENDIENTE/FALLIDA: una revisión remota mayor no pisa la edición local aún no subida.
  const pend = await p.evaluate(async () => {
    const d = _ws4Projects().find(x => x.id === 'ws4_sync_a');
    const remote = Object.assign({}, d, { customName: 'Remoto más nuevo', revision: (d.revision || 1) + 10 });
    await supabaseClient.from('workspace_documents').upsert([{ user_id: currentUser.id, doc_id: 'ws4_sync_a', kind: 'ws_project', body: remote, revision: remote.revision, deleted_at: null, currency: 'EUR', body_version: 1, updated_at: new Date().toISOString() }], { onConflict: 'user_id,doc_id' });
    d.customName = 'Local sin subir'; localStorage.setItem('aurix_ws_projects_v1', JSON.stringify(_ws4ProjectsRaw().map(x => x.id === d.id ? d : x)));
    _wsDocSync['aurix_ws_projects_v1'] = { state: 'error', at: 0 };
    await _wsDocsPull();
    const n1 = _ws4Projects().find(x => x.id === 'ws4_sync_a').customName;
    _wsDocSync['aurix_ws_projects_v1'] = { state: 'saved', at: Date.now() };
    await _wsDocsPull();
    return [n1, _ws4Projects().find(x => x.id === 'ws4_sync_a').customName];
  });
  ok(`${T} con la subida fallida no se pisa lo local; confirmada la subida, el remoto más nuevo sí entra`, pend[0] === 'Local sin subir' && pend[1] === 'Remoto más nuevo', JSON.stringify(pend));
  // Las PREFERENCIAS (borradores de todas las herramientas) no se aplican al leer.
  const prefs = await p.evaluate(async () => {
    localStorage.setItem('aurix_ws_tool_state_v1', JSON.stringify({ receivables_app: { items: [{ id: 'cobro_local' }] } }));
    await supabaseClient.from('workspace_documents').upsert([{ user_id: currentUser.id, doc_id: 'pref:aurix_ws_tool_state_v1', kind: 'ws_pref', body: { key: 'aurix_ws_tool_state_v1', value: { monthly_budget: {} } }, revision: 99999999999, deleted_at: null, currency: 'EUR', body_version: 1, updated_at: new Date().toISOString() }], { onConflict: 'user_id,doc_id' });
    await _wsDocsPull();
    return localStorage.getItem('aurix_ws_tool_state_v1');
  });
  ok(`${T} los borradores locales de herramientas no los sustituye una preferencia remota`, /cobro_local/.test(prefs || ''), prefs);
  // Colección remota VACÍA para otra clase: lo local sobrevive.
  await p.evaluate(() => { localStorage.setItem('aurix_ws_goals_v1', JSON.stringify([{ id: 'wsg_local', name: 'Sólo local', type: 'wealth', target: 10, currency: 'EUR', revision: 1 }])); });
  await p.evaluate(() => _wsDocsPull());
  ok(`${T} una colección remota vacía no borra los objetivos locales`, await p.evaluate(() => _wsgGoals().some(g => g.id === 'wsg_local')));
  // CAMBIO DE CUENTA DURANTE LA LECTURA: la respuesta se descarta.
  const raced = await p.evaluate(async () => {
    localStorage.removeItem('aurix_ws_projects_v1');
    const realFrom = supabaseClient.from.bind(supabaseClient); const realUser = currentUser;
    supabaseClient.from = (t) => { const q = realFrom(t); const realEq = q.eq.bind(q); q.eq = (...a) => { const r = realEq(...a); return { then: (res, rej) => new Promise(z => setTimeout(z, 300)).then(() => r).then(res, rej) }; }; return q; };
    const pr = _wsDocsPull();
    currentUser = { id: 'otra-cuenta' };
    const out = await pr;
    currentUser = realUser; supabaseClient.from = realFrom;
    return { out, docs: localStorage.getItem('aurix_ws_projects_v1') };
  });
  ok(`${T} si la cuenta cambia con la lectura en vuelo, no se escribe nada`, raced.out === false && raced.docs == null, JSON.stringify(raced));
  // AISLAMIENTO AL CAMBIAR DE CUENTA (cuentas sintéticas).
  await p.evaluate(() => { _wsbParamsSet({ baseManual: '123456', currency: 'EUR' }); localStorage.setItem('aurix_ws_prefrev_aurix_ws_pinned_v1', '9999999999'); });
  await p.evaluate(() => { signOut(); }).catch(() => {}); await p.waitForTimeout(1500);
  await login('b.sintetica@example.com');
  const b = await p.evaluate(() => ({ scn: localStorage.getItem('aurix_ws_scn_params_v1'), rev: localStorage.getItem('aurix_ws_prefrev_aurix_ws_pinned_v1'), docs: _ws4Projects().map(x => x.id) }));
  ok(`${T} la cuenta B no lee los parámetros de Escenarios ni las revisiones de A, ni sus documentos`, b.scn == null && b.rev == null && !b.docs.includes('ws4_sync_a'), JSON.stringify(b));
  // La demo da un id NUEVO en cada acceso (limitación del adaptador), así que «volver como A» no se
  // puede ejercitar aquí. Lo demostrable: lo de A queda APARCADO a su nombre, no borrado.
  const parked = await p.evaluate(() => Object.keys(localStorage).filter(k => /^aurix_ws_scn_params_v1__parked_|^aurix_ws_prefrev_aurix_ws_pinned_v1__parked_/.test(k)).length);
  ok(`${T} los parámetros y revisiones de A quedan aparcados (no borrados) al entrar B`, parked >= 2, String(parked));
  ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | ').slice(0, 200));
  await browser.close();
}
console.log('\n' + (fails.length ? 'NO-GO' : 'GO') + ` — ${pass}/${pass + fails.length}`);
if (fails.length) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
