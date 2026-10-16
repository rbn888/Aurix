// AURIX — CIERRE QUIRÚRGICO DE UTILIDAD · sonda focal única.
// Bloques A (confianza) · B (documentos) · C (Market/Comparador) · D (Diario), sobre los bytes del
// repo servidos en local, sesión/Premium simulados y datos SINTÉTICOS (nunca cuentas reales).
// Matriz: Chromium + WebKit · ES + EN · 390 + 1440 (+ Free y movimiento reducido en Chromium).
// C1 usa los datos REALES del proxy de búsqueda (vía Node, origen de la app); sin red se declara SKIP.
//   node scripts/aurix-utility-close-probe.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const server = createServer(async (req, res) => { try { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = normalize(join(ROOT, p)); let b = await readFile(f); if (f.endsWith('app.js')) b = Buffer.from(String(b).replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;').replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0')); res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }).end(b); } catch (_) { res.writeHead(404).end(); } });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL0 = `http://127.0.0.1:${server.address().port}/index.html`;
const { chromium, webkit } = await import('/tmp/aurix-pw/node_modules/playwright/index.mjs');

let pass = 0, fail = 0, skip = 0; const fails = [];
const ok = (n, c, d) => { if (c) { pass++; } else { fail++; fails.push(n + (d === undefined ? '' : '  ' + String(d).slice(0, 300))); console.log('  ✗', n, d === undefined ? '' : String(d).slice(0, 300)); } };

const N = Date.now();
const BUD = (id, name, ccy, extra) => Object.assign({ id, type: 'monthly_budget', customName: name, currency: ccy, revision: 1, createdAt: N - 9e7, updatedAt: N - 36e5, dashPinned: true,
  inputs: { currency: ccy, periodKey: '2026-10', rows: [{ id: 'salary', type: 'income', label: 'Nómina', amount: '2400', order: 0 }, { id: 'rent', type: 'expense', labelKey: 'wsbud_rent', label: null, amount: '900', order: 1 }, { id: 'food', type: 'expense', label: 'Comida', amount: '400', order: 2 }] } }, extra || {});
const GOAL = (id, name, target, current, extra) => Object.assign({ id, type: 'home', name, target: String(target), current: String(current), monthly: '500', targetYear: '', mode: 'manual', currency: 'EUR', createdAt: N - 9e7, updatedAt: N - 1e6, revision: 1 }, extra || {});
const JRN = { id: 'j_old', type: 'trade_journal', customName: 'Diario QA', currency: 'EUR', revision: 1, createdAt: N - 9e7, updatedAt: N - 1e6, dashHidden: true, inputs: { currency: 'EUR', trades: [
  { id: 't1', asset: 'NVDA', atype: 'stock', buy: 90, sell: 119, qty: 20, fee: 5, currency: 'EUR', notes: 'earnings' },
  { id: 't2', asset: 'BTC', atype: 'crypto', buy: 52000, sell: 61000, qty: 0.5, fee: 20, currency: 'EUR', sellDate: '10/03/2026' },
  { id: 't3', asset: 'SPY', atype: 'etf', buy: 480, sell: 455, qty: 8, fee: 0, currency: 'EUR', notes: 'stop loss' },
  { id: 't4', asset: 'Una empresa con un nombre bastante largo SA', atype: 'other', buy: 10, sell: 10, qty: 1234.5678, fee: 0, currency: 'EUR' }] } };
const legacyBud = BUD('b_old', 'Antiguo QA', 'EUR'); delete legacyBud.currency; delete legacyBud.inputs.currency;
const SEED = {
  aurix_ws_projects_v1: [BUD('b_eur', 'Casa QA', 'EUR'), BUD('b_usd', 'USD QA', 'USD'), legacyBud, JRN],
  aurix_ws_goals_v1: [GOAL('g_over', 'Superado QA', 70000, 120000, { dashPinned: true }), GOAL('g_eq', 'Igual QA', 70000, 70000), GOAL('g_under', 'Debajo QA', 70000, 20000)],
  aurix_ws_pinned_v1: [{ ref: 'tool:loan', ts: 5 }],
};
const ASSETS = [{ id: 'a_msft', type: 'stock', ticker: 'MSFT', marketSymbol: 'MSFT', name: 'Microsoft', qty: 10, price: 400, costBasis: 3000, assetCurrency: 'USD', transactions: [] }];

async function page(browser, { w, h, lang, premium = true, reduced = false, seed = SEED }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => { if (!/access control checks|Load failed|Failed to fetch/.test(e.message)) errs.push(e.message); });
  const all = Object.assign({}, seed, { aurix_assets: ASSETS, portfolio_assets: ASSETS });
  await p.addInitScript(`try{ localStorage.setItem('portfolio_lang', ${JSON.stringify(lang)}); if(!sessionStorage.getItem('__s')){ ${Object.entries(all).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(v))});`).join('')} sessionStorage.setItem('__s','1'); } }catch(_){}`);
  const setup = async () => {
    await p.waitForFunction("typeof _wsOpenTool==='function' && typeof _AURIX_ENT_CANON!=='undefined'", null, { timeout: 60000 });
    await p.waitForTimeout(700);
    await p.evaluate(`(function(){ try{_aurixCancelLoginRedirect('p');_aurixMarkSessionConfirmed();}catch(_){} var bl=document.getElementById('bootLoader'); if(bl) bl.remove(); var ar=document.getElementById('appRoot'); if(ar) ar.style.opacity='1';
      var f=Object.create(null); _AURIX_ENT_CANON.forEach(function(k){ f[k]=${premium ? "(k!=='workspace.catalog_preview')" : 'false'}; });
      _aurixEnt={loaded:true,loading:false,error:null,plan:'${premium ? 'premium' : 'free'}',status:'${premium ? 'active' : 'none'}',source:'default',validUntil:null,features:f,sources:Object.create(null),fetchedAt:Date.now()};
      try{ _aurixActiveUserId='qa-u1'; _aurixStampCacheOwner(); }catch(_){} })()`);
  };
  await p.goto(URL0, { waitUntil: 'domcontentloaded' }); await setup();
  const ev = s => p.evaluate(s);
  const reload = async () => { await p.reload({ waitUntil: 'domcontentloaded' }); await setup(); await ev(`try{ _aurixEntApplyToUi(_aurixEnt.features); }catch(_){}`); await p.waitForTimeout(900); };
  const ws = async () => { await ev(`switchTab('workspace')`); await p.waitForTimeout(700); };
  return { ctx, p, errs, ev, reload, ws };
}
const sw = P => P.ev('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1');

async function run(ENG, browser, w, lang) {
  const T = `${ENG}.${w}.${lang}`, H = w < 800 ? 844 : 900, en = lang === 'en';
  const P = await page(browser, { w, h: H, lang });
  // ── A1/A2 Escenarios
  await P.ws(); await P.ev(`_wsOpenSurface('scenario')`); await P.p.waitForTimeout(700);
  const typ = async (k, v) => { const l = P.p.locator(`[data-wsb-param=${k}]`); await l.click(); await l.press('ControlOrMeta+a'); await l.press('Backspace'); if (v !== '') await l.type(v, { delay: 10 }); await P.p.waitForTimeout(150); };
  await typ('baseManual', '50000');
  const scn = () => P.p.evaluate(() => ({ title: (document.querySelector('.wsb-compare .wsh-title') || {}).textContent || '', inh: (document.querySelector('[data-wsb2-inherit]') || {}).textContent || '', alt: (document.querySelector('[data-wsb-param="altRet"]') || {}).value,
    all: document.querySelector('[data-wsh-view=scenario]').textContent }));
  for (const y of ['1', '10', '15', '30']) {
    await typ('years', y); const s = await scn();
    const want = en ? (y === '1' ? 'Comparison over 1 year' : `Comparison over ${y} years`) : (y === '1' ? 'Comparativa a 1 año' : `Comparativa a ${y} años`);
    ok(`${T} A1 horizonte ${y}: título y textos del estado activo, número gramatical`, s.title === want && !(y !== '10' && /10 años|10 years|10-year/.test(s.all)) && !/\b1 años\b|\b1 years\b/.test(s.all), s.title);
  }
  await typ('ret', '5'); let s = await scn();
  ok(`${T} A2 rentabilidad 6→5: la heredada y la alternativa sin tocar dicen 5 sin guardar`, /5%/.test(s.inh) && !/6%/.test(s.inh) && s.alt === '5', JSON.stringify({ inh: s.inh, alt: s.alt }));
  await typ('ret', ''); s = await scn();
  ok(`${T} A2 borrar el número no restaura el valor antiguo ni fija un cero`, (await P.ev(`document.querySelector('[data-wsb-param="ret"]').value`)) === '', s.inh);
  await typ('ret', '5');
  ok(`${T} B6 «Guardar comparación» vive en la barra común y una sola vez`, (await P.ev(`JSON.stringify([document.querySelectorAll('[data-wsb2-save]').length, !!document.querySelector('.wsh-bar-actions [data-wsb2-save]')])`)) === '[1,true]');
  // ── A3 Objetivos (lista)
  await P.ev(`_wsOpenSurface('goals')`); await P.p.waitForTimeout(700);
  const gl = JSON.parse(await P.ev(`JSON.stringify([].slice.call(document.querySelectorAll('[data-wsg-cardid]')).map(function(c){ return [c.getAttribute('data-wsg-cardid'), c.textContent.replace(/\\s+/g,' ')]; }))`));
  const gt = id => (gl.find(x => x[0] === id) || [])[1] || '';
  ok(`${T} A3 superado: «alcanzado», excedente y sin fecha estimada`, (en ? /Goal reached/ : /Objetivo alcanzado/).test(gt('g_over')) && /\+\D{0,3}50[.,]000/.test(gt('g_over')) && !(en ? /Estimated date/ : /Fecha estimada/).test(gt('g_over')), gt('g_over').slice(0, 200));
  ok(`${T} A3 igual a la meta: alcanzado`, (en ? /Goal reached/ : /Objetivo alcanzado/).test(gt('g_eq')), gt('g_eq').slice(0, 160));
  ok(`${T} A3 por debajo: sigue con su fecha estimada`, (en ? /Estimated date/ : /Fecha estimada/).test(gt('g_under')) && /29%/.test(gt('g_under')), gt('g_under').slice(0, 160));
  // ── B3/B7 crear objetivo y publicarlo con otro ya publicado
  await P.ev(`(function(){ var d=document.querySelector('details.wsg-newgoal'); if(d) d.open=true; })()`); await P.p.waitForTimeout(150);
  await P.p.locator('input.wsg-text').first().fill('Nuevo QA'); await P.p.locator('[data-wsg-create]').first().click(); await P.p.waitForTimeout(500);
  const crt = JSON.parse(await P.ev(`JSON.stringify({ open: !!(document.querySelector('details.wsg-newgoal')||{}).open, focus: !!(document.activeElement && document.activeElement.hasAttribute('data-wsg-dash')) })`));
  ok(`${T} B7 tras crear: formulario plegado y foco en el objetivo nuevo`, !crt.open && crt.focus, JSON.stringify(crt));
  await P.p.locator('[data-wsg-dash]').click(); await P.p.waitForTimeout(400);
  const pub = JSON.parse(await P.ev(`JSON.stringify(_wsgGoals().filter(function(g){return g.dashPinned===true;}).map(function(g){return g.name;}))`));
  ok(`${T} B3 «Añadir al Dashboard» publica aunque ya haya otro objetivo publicado`, pub.indexOf('Nuevo QA') >= 0 && pub.indexOf('Superado QA') >= 0, JSON.stringify(pub));
  // ── A3/A5 Dashboard
  await P.ev(`switchTab('dashboard')`); await P.p.waitForTimeout(1000);
  const dash = JSON.parse(await P.ev(`JSON.stringify([].slice.call(document.querySelectorAll('#wsPlansGrid .wspl-card')).map(function(c){ return { t: c.textContent.replace(/\\s+/g,' '), aria: [].slice.call(c.querySelectorAll('[aria-label]')).map(function(e){return e.getAttribute('aria-label');}).join(' | ') }; }))`));
  const dc = name => dash.find(x => x.t.indexOf(name) >= 0) || { t: '', aria: '' };
  ok(`${T} A3 Dashboard: el superado dice alcanzado y su excedente; misma lectura que el documento`, (en ? /goal reached/ : /objetivo alcanzado/).test(dc('Superado QA').t) && /\+\D{0,3}50[.,]000/.test(dc('Superado QA').t), dc('Superado QA').t.slice(0, 200));
  ok(`${T} A5 reparto accesible en la moneda del documento: EUR`, /€/.test(dc('Casa QA').aria) && !/US\$|\$9/.test(dc('Casa QA').aria), dc('Casa QA').aria);
  ok(`${T} A5 …USD en dólares`, /US\$|\$/.test(dc('USD QA').aria), dc('USD QA').aria);
  ok(`${T} A5 …documento antiguo sin moneda: sin símbolo (no se infiere)`, /900[.,]00(,|$| )/.test(dc('Antiguo QA').aria) && !/€|\$/.test((dc('Antiguo QA').aria.split('|').find(x => /900/.test(x)) || '')), dc('Antiguo QA').aria);
  ok(`${T} A6 esqueleto del total oculto a lectores mientras no hay dato; publicado al pintar`, (await P.ev(`document.getElementById('totalValue').getAttribute('aria-hidden')`)) === null);
  // ── B1 recargar dentro de un documento (abierto desde el Dashboard)
  await P.p.locator('#wsPlansGrid .wspl-card', { hasText: 'Casa QA' }).locator('.wspl-go').click(); await P.p.waitForTimeout(800);
  await P.reload();
  const rl = JSON.parse(await P.ev(`JSON.stringify({ tab: currentTab, view: _wshView, tool: _wsToolActive, id: _wsToolEditId, back: _wsReturnTab, y: Math.round(scrollY) })`));
  ok(`${T} B1 recargar reabre la misma instancia, arriba, con su origen`, rl.tab === 'workspace' && rl.view === 'tool' && rl.tool === 'budget' && rl.id === 'b_eur' && rl.back === 'dashboard' && rl.y < 40, JSON.stringify(rl));
  await P.p.goBack(); await P.p.waitForTimeout(800);
  ok(`${T} B1 atrás del navegador vuelve al origen (Dashboard)`, (await P.ev(`currentTab`)) === 'home');
  await P.ev(`history.replaceState({ aurixWork: 1, aurixWs: { v: 'tool', tool: 'budget', id: 'no_existe', back: 'space', u: null } }, '')`); await P.reload();
  ok(`${T} B1 documento inexistente: cae a Workspace sin abrir nada`, (await P.ev(`JSON.stringify([currentTab, _wshView, _wsToolEditId])`)) === '["workspace","home",null]');
  // ── B2 Mi espacio
  await P.ev(`_wsTab='space'; _wshView='home'; _wshRepaintHome()`); await P.p.waitForTimeout(500);
  const ms = JSON.parse(await P.ev(`JSON.stringify([].slice.call(document.querySelectorAll('.wsh-mse2-card[data-wsmse-cap]')).map(function(c){return [c.getAttribute('data-wsmse-cap'), c.classList.contains('is-saved')];}))`));
  ok(`${T} B2 Diario guardado sin estrella aparece en Mi espacio (una card, sin favorito)`, ms.filter(x => x[0] === 'journal').length === 1 && ms.find(x => x[0] === 'journal')[1] === false, JSON.stringify(ms));
  ok(`${T} B2 favorito sin documentos sigue presente`, (await P.ev(`!!document.querySelector('.wsh-mse2-card[data-wsmse-type="fav"]')`)) === true);
  // ── B4 menú ⋯
  const mb = P.p.locator('.wsh-mse2-card[data-wsmse-cap="budget"] [data-wscap-menu]');
  if (await mb.count()) {
    await mb.focus(); await mb.press('Enter'); await P.p.waitForTimeout(200);
    const m1 = JSON.parse(await P.ev(`JSON.stringify({ exp: document.querySelector('.wsh-mse2-card[data-wsmse-cap="budget"] [data-wscap-menu]').getAttribute('aria-expanded'), pop: document.querySelector('.wsh-mse2-card[data-wsmse-cap="budget"] [data-wscap-menu]').getAttribute('aria-haspopup'), names: [].slice.call(document.querySelectorAll('#wsCapMenu [role=menuitem]')).every(function(b){return b.textContent.trim().length>0;}), f0: document.activeElement && document.activeElement.getAttribute('data-wsmenu-act') })`));
    await P.p.keyboard.press('ArrowDown'); const f1 = await P.ev(`document.activeElement && document.activeElement.getAttribute('data-wsmenu-act')`);
    await P.p.keyboard.press('Escape'); await P.p.waitForTimeout(150);
    const m2 = JSON.parse(await P.ev(`JSON.stringify({ open: !!document.getElementById('wsCapMenu'), exp: document.querySelector('.wsh-mse2-card[data-wsmse-cap="budget"] [data-wscap-menu]').getAttribute('aria-expanded'), back: document.activeElement && document.activeElement.hasAttribute('data-wscap-menu') })`));
    ok(`${T} B4 ⋯: haspopup/expanded, ítems con nombre, flechas, Escape cierra y devuelve el foco`, m1.exp === 'true' && m1.pop === 'menu' && m1.names && f1 && f1 !== m1.f0 && !m2.open && m2.exp === 'false' && m2.back, JSON.stringify({ m1, f1, m2 }));
  } else ok(`${T} B4 ⋯ presente`, false, 'sin menú de presupuesto');
  // ── B5 filas vacías del presupuesto
  await P.ev(`_wsOpenTool('budget','b_eur')`); await P.p.waitForTimeout(500);
  const tot0 = await P.ev(`JSON.stringify(calculateMonthlyBudget(_wsToolInputs)).slice(0, 60)`);
  await P.p.locator('[data-wsbud-add="expense"]').click(); await P.p.waitForTimeout(250); await P.p.keyboard.press('Escape');
  await P.p.locator('[data-wsbud-add="expense"]').click(); await P.p.waitForTimeout(250); await P.p.keyboard.press('Escape');
  const nEmpty = await P.ev(`_wsBudgetRows(_wsToolInputs).filter(_wsBudRowEmpty).length`);
  ok(`${T} B5 «Añadir gasto» dos veces no apila filas vacías`, nEmpty === 1, String(nEmpty));
  await P.ev(`_wsToolCommit(null, false)`); await P.p.waitForTimeout(300);
  const sv = JSON.parse(await P.ev(`JSON.stringify({ empty: (_ws4Projects().find(function(x){return x.id==='b_eur';}).inputs.rows||[]).filter(_wsBudRowEmpty).length, rows: (_ws4Projects().find(function(x){return x.id==='b_eur';}).inputs.rows||[]).length, tot: JSON.stringify(calculateMonthlyBudget(_wsToolInputs)).slice(0, 60) })`));
  ok(`${T} B5 guardar no persiste la fila vacía, conserva las heredadas y no cambia totales`, sv.empty === 0 && sv.rows === 3 && sv.tot === tot0, JSON.stringify(sv));
  // ── C2/C3 Market
  // Las recargas de B1 fijan la sesión SIMULADA después del arranque y el aislamiento por cuenta aparca la
  // caché de activos (en real la sesión existe antes): se repone la cartera sintética en memoria.
  await P.ev(`assets.splice(0, assets.length, ...${JSON.stringify(ASSETS)})`);
  const mk = async (item) => { await P.ev(`_aurixMktOpenSymbol(${JSON.stringify(item.symbol)}, ${JSON.stringify(item)})`); await P.p.waitForTimeout(400);
    const r = JSON.parse(await P.ev(`JSON.stringify({ add: document.getElementById('mktPrvAddBtn').textContent, pos: !document.getElementById('mktPrvPosBtn').hidden })`)); await P.ev(`_aurixMktClose()`); return r; };
  const own = await mk({ symbol: 'MSFT', ticker: 'MSFT', marketSymbol: 'MSFT', type: 'stock', name: 'Microsoft Corporation' });
  ok(`${T} C2 activo poseído: «En cartera» + Ver posición`, (en ? /In portfolio/ : /En cartera/).test(own.add) && own.pos, JSON.stringify(own));
  const tok = await mk({ symbol: 'MSFT', ticker: 'MSFT', type: 'crypto', coinId: 'microsoft-robinhood-tokenized-stock', name: 'Microsoft • Robinhood Token' });
  ok(`${T} C2 el token derivado NO se confunde con la acción poseída`, !/cartera ·|portfolio ·/.test(tok.add) && !tok.pos, JSON.stringify(tok));
  const ccy = await mk({ symbol: 'MSFT', ticker: 'MSFT', marketSymbol: 'MSFT', type: 'stock', name: 'Microsoft Corporation', currency: 'EUR' });
  ok(`${T} C2 misma acción en OTRA moneda que la posición: no dice «En cartera» (el alta crearía otra fila)`, !ccy.pos, JSON.stringify(ccy));
  const not = await mk({ symbol: 'AAPL', ticker: 'AAPL', marketSymbol: 'AAPL', type: 'stock', name: 'Apple Inc.' });
  ok(`${T} C2 activo no poseído conserva «Añadir»`, (en ? /^Add to portfolio$/ : /^Añadir a cartera$/).test(not.add) && !not.pos, JSON.stringify(not));
  const rowTxt = JSON.parse(await P.ev(`JSON.stringify([{symbol:'AAA', price:null, change24h: 5.2},{symbol:'BBB', price: 10, change24h: -96.1}].map(function(i){ var d=document.createElement('div'); d.innerHTML=renderMarketItem(i,0); return (d.querySelector('.col-change')||{}).textContent.trim(); }))`));
  ok(`${T} C3 sin precio no hay variación; un cambio extremo con precio se muestra`, rowTxt[0] === '—' && /96[.,]10/.test(rowTxt[1]), JSON.stringify(rowTxt));
  // ── C4 Comparador
  await P.ws(); await P.ev(`_wsOpenTool('comparator')`); await P.p.waitForTimeout(700);
  const c4 = JSON.parse(await P.ev(`(function(){ var c=document.querySelector('.intv14-cmp'); return JSON.stringify(c ? { st: c.getAttribute('data-state'), why: !!c.querySelector('[data-cmp-why]'), avail: c.querySelector('[data-cmp-avail]') ? c.querySelector('[data-cmp-avail]').textContent : '', zero: /[+−-]?0[.,]0+ ?%/.test(c.textContent) } : null); })()`));
  ok(`${T} C4 sin rentabilidad certificada: causa concreta y periodos disponibles, sin ceros`, c4 && c4.st === 'no_return' && c4.why && c4.avail.length > 0 && !c4.zero, JSON.stringify(c4));
  // ── D Diario
  await P.ev(`_wsOpenTool('journal','j_old')`); await P.p.waitForTimeout(600);
  const rows = () => P.p.evaluate(() => [...document.querySelectorAll('[data-wsjrn-listbody] .wsjrn-card')].map(c => c.querySelector('.wsjrn-asset').textContent.slice(0, 4)));
  const r0 = await rows();
  ok(`${T} D2 operaciones antiguas sin fecha abren y dicen «Sin fecha»; dd/mm/aaaa heredado se lee`, r0.length === 4 && (await P.ev(`[].slice.call(document.querySelectorAll('.wsjrn-date.is-none')).length`)) === 3 && r0[0] === 'BTC', JSON.stringify(r0));
  await P.p.locator('[data-wsjrn-filter="q"]').fill('stop'); await P.p.waitForTimeout(120);
  ok(`${T} D3 búsqueda por nota`, JSON.stringify(await rows()) === '["SPY"]');
  await P.p.locator('[data-wsjrn-filter="q"]').fill('zzz'); await P.p.waitForTimeout(120);
  ok(`${T} D3 vacío específico de búsqueda`, (await P.ev(`(document.querySelector('.wsjrn-empty-f')||{}).textContent||''`)).indexOf('zzz') >= 0);
  await P.p.locator('[data-wsjrn-filter="q"]').fill(''); await P.p.locator('[data-wsjrn-filter="res"]').selectOption('loss'); await P.p.waitForTimeout(120);
  ok(`${T} D3 filtro perdedoras y contador real`, JSON.stringify(await rows()) === '["SPY"]' && /1 (de|of) 4/.test(await P.ev(`document.querySelector('.wsjrn-count').textContent`)));
  await P.p.locator('[data-wsjrn-filter="res"]').selectOption('all'); await P.p.locator('[data-wsjrn-filter="type"]').selectOption('crypto'); await P.p.waitForTimeout(120);
  ok(`${T} D3 filtro por tipo`, JSON.stringify(await rows()) === '["BTC"]');
  await P.p.locator('[data-wsjrn-filter="type"]').selectOption('all'); await P.p.locator('[data-wsjrn-filter="sort"]').selectOption('ret'); await P.p.waitForTimeout(120);
  ok(`${T} D3 orden por rentabilidad`, (await rows())[0] === 'NVDA');
  await P.p.locator('[data-wsjrn-filter="sort"]').selectOption('date');
  const calc0 = await P.ev(`JSON.stringify(calculateTradeJournal(_wsToolInputs.trades).list.map(function(x){return [x.id,x.invested,x.pl,x.ret,x.status];}))`);
  await P.p.locator('.wsjrn-form-card [data-wsjrn-input="asset"]').fill('AAPL'); await P.p.locator('.wsjrn-form-card [data-wsjrn-input="buy"]').fill('150'); await P.p.locator('.wsjrn-form-card [data-wsjrn-input="sell"]').fill('171,5'); await P.p.locator('.wsjrn-form-card [data-wsjrn-input="qty"]').fill('3'); await P.p.locator('.wsjrn-form-card [data-wsjrn-input="sellDate"]').fill('2026-10-01');
  await P.p.locator('[data-wsjrn-add]').click(); await P.p.waitForTimeout(250);
  ok(`${T} D2 nueva operación fechada: primera por fecha, con fecha localizada`, (await rows())[0] === 'AAPL' && (en ? /Oct 1, 2026/ : /1 oct 2026/).test(await P.ev(`document.querySelector('[data-wsjrn-listbody] .wsjrn-date').textContent`)));
  const n0 = await P.ev('_wsToolInputs.trades.length'); await P.p.locator('[data-wsjrn-act="dup"]').first().click(); await P.p.waitForTimeout(200);
  ok(`${T} D2 duplicar no contabiliza sin confirmar (copia en el formulario)`, (await P.ev('_wsToolInputs.trades.length')) === n0 && (await P.ev(`document.querySelector('.wsjrn-form-card [data-wsjrn-input="asset"]').value`)) === 'AAPL');
  await P.ev(`_wsJrnCancel()`);
  ok(`${T} D5 los cálculos de las operaciones existentes no cambian`, (await P.ev(`JSON.stringify(calculateTradeJournal(_wsToolInputs.trades.filter(function(x){return /^t[1-4]$/.test(x.id);})).list.map(function(x){return [x.id,x.invested,x.pl,x.ret,x.status];}))`)) === calc0);
  ok(`${T} D4 una sola nota de separación de la cartera`, (await P.ev(`document.querySelectorAll('.wsjrn-sep-note').length`)) === 1);
  if (w < 800) ok(`${T} D3 acciones táctiles ≥44 px`, (await P.ev(`[].slice.call(document.querySelectorAll('.wsjrn-card-acts button')).every(function(b){ var r=b.getBoundingClientRect(); return r.width>=43.5 && r.height>=43.5; })`)) === true);
  await P.ev(`_wsToolCommit(null, false)`); await P.p.waitForTimeout(250); await P.reload();
  ok(`${T} D5/B1 guardar, recargar y reabrir: el mismo Diario con sus 5 operaciones`, (await P.ev(`JSON.stringify([_wshView, _wsToolActive, _wsToolEditId, (_wsToolInputs.trades||[]).length])`)) === '["tool","journal","j_old",5]');
  ok(`${T} sin desbordamiento horizontal`, await sw(P));
  ok(`${T} sin errores de página`, !P.errs.length, P.errs.join(' | '));
  await P.ctx.close();
}

async function runC1(browser) {
  const P = await page(browser, { w: 1440, h: 900, lang: 'es', seed: {} });
  let net = true;
  await P.p.route(/isa-portfolio-ten\.vercel\.app\/api\/search/, async route => { try { const r = await fetch(route.request().url(), { headers: { Origin: 'https://app.aurixsystem.io', Accept: 'application/json' } }); route.fulfill({ status: r.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: await r.text() }); } catch (e) { net = false; route.abort(); } });
  const q1 = async s => JSON.parse(await P.ev(`(async function(){ var r = await searchAllAssets(${JSON.stringify(s)}); return JSON.stringify((r||[]).slice(0,8).map(function(a){ return { t: a.ticker, n: a.name, ty: a.type, sub: _aurixSearchSubtitle(a) }; })); })()`));
  // El proxy limita ráfagas: una respuesta vacía se reintenta una vez (no relaja el resultado).
  const q = async s => { let r = await q1(s); if (!r.length) { await P.p.waitForTimeout(1500); r = await q1(s); } return r; };
  const msft = await q('MSFT');
  if (!net || msft.length < 3) { skip++; console.log('  · SKIP C1 (sin red hacia el proxy de búsqueda)'); await P.ctx.close(); return; }
  ok('C1 MSFT: Microsoft Corporation primero', msft[0].t === 'MSFT' && /Microsoft Corporation/.test(msft[0].n) && msft[0].ty === 'stock', JSON.stringify(msft.slice(0, 3)));
  const iTok = msft.findIndex(x => /token/i.test(x.n)), iTo = msft.findIndex(x => x.t === 'MSFT.TO');
  ok('C1 MSFT: las otras cotizaciones de la acción van antes que sus tokens', iTo > 0 && (iTok === -1 || iTo < iTok), JSON.stringify(msft.map(x => x.t + '/' + x.ty)));
  const aapl = await q('AAPL'); ok('C1 AAPL: Apple Inc. primero', aapl[0].t === 'AAPL' && aapl[0].ty === 'stock', JSON.stringify(aapl[0]));
  const btc = await q('BTC'); ok('C1 BTC: Bitcoin primero', btc[0].t === 'BTC' && /^Bitcoin$/.test(btc[0].n), JSON.stringify(btc[0]));
  const eth = await q('ETH'); ok('C1 ETH: Ethereum primero', eth[0].t === 'ETH' && /^Ethereum$/.test(eth[0].n), JSON.stringify(eth[0]));
  const spy = await q('SPY'); ok('C1 SPY: el ETF primero', spy[0].t === 'SPY' && spy[0].ty === 'etf', JSON.stringify(spy[0]));
  const brk = await q('BRK.B'); ok('C1 BRK.B (varias clases): la acción BRK-B antes que el token BRK.B', brk[0].ty === 'stock' && /Berkshire/.test(brk[0].n), JSON.stringify(brk.slice(0, 2)));
  const tokRow = brk.find(x => x.ty === 'crypto' && /dinari/i.test(x.n));
  ok('C1 el token se etiqueta como derivado, no como la acción', !tokRow || /Token derivado/.test(tokRow.sub), JSON.stringify(tokRow));
  const ondo = await q('ondo'); ok('C1 ONDO (token canónico) primero y SIN etiqueta de derivado', ondo[0] && ondo[0].t === 'ONDO' && !/Token derivado/.test(ondo[0].sub), JSON.stringify(ondo[0]));
  const usdc = await q('usd coin'); ok('C1 «usd coin»: USDC canónico primero', usdc[0] && usdc[0].t === 'USDC' && usdc[0].ty === 'crypto', JSON.stringify(usdc.slice(0, 2)));
  await P.ctx.close();
}

async function runFree(browser) {
  const P = await page(browser, { w: 1440, h: 900, lang: 'es', premium: false });
  await P.ev(`history.replaceState({ aurixWork: 1, aurixWs: { v: 'tool', tool: 'journal', id: 'j_old', back: 'space', u: null } }, '')`); await P.reload();
  ok('FREE B1 no restaura una capacidad Premium', (await P.ev(`JSON.stringify([_wshView === 'tool', _wsToolEditId])`)) === '[false,null]');
  await P.ev(`switchTab('workspace')`); await P.p.waitForTimeout(600); await P.ev(`_wsOpenTool('comparator')`); await P.p.waitForTimeout(500);
  ok('FREE C4 el comparador sigue con su permiso actual (no se abre)', (await P.ev(`_wshView === 'tool' && _wsToolActive === 'comparator'`)) === false);
  ok('FREE sin errores de página', !P.errs.length, P.errs.join(' | '));
  await P.ctx.close();
}

async function runReduced(browser) {
  const P = await page(browser, { w: 390, h: 844, lang: 'es', reduced: true });
  await P.ws(); await P.ev(`_wsOpenSurface('scenario')`); await P.p.waitForTimeout(600);
  const l = P.p.locator('[data-wsb-param=years]'); await l.click(); await l.press('ControlOrMeta+a'); await l.press('Backspace'); await l.type('15');
  const b = P.p.locator('[data-wsb-param=baseManual]'); await b.click(); await b.type('50000'); await P.p.waitForTimeout(150);
  ok('REDUCED A1/A2 con movimiento reducido el dato se actualiza igual', /15 años/.test(await P.ev(`(document.querySelector('.wsb-compare .wsh-title')||{}).textContent||''`)));
  await P.ctx.close();
}

for (const [ENG, B] of [['CR', chromium], ['WK', webkit]]) {
  const browser = await B.launch();
  for (const w of [390, 1440]) for (const lang of ['es', 'en']) {
    try { await run(ENG, browser, w, lang); } catch (e) { ok(`${ENG}.${w}.${lang} sin excepción`, false, e.message); }
  }
  if (ENG === 'CR') { try { await runC1(browser); } catch (e) { ok('C1 sin excepción', false, e.message); } try { await runFree(browser); } catch (e) { ok('FREE sin excepción', false, e.message); } try { await runReduced(browser); } catch (e) { ok('REDUCED sin excepción', false, e.message); } }
  await browser.close();
}
server.close();
console.log(`\n${pass} passed, ${fail} failed${skip ? `, ${skip} skipped` : ''}`);
if (fails.length) { console.log('FAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); }
process.exit(fail ? 1 : 0);
