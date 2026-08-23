'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CASH-LEDGER-PERFORMANCE-TRUTH — P0 CONTRATO ECONÓMICO DE LA LIQUIDEZ
// ════════════════════════════════════════════════════════════════════════════
// Origen: en cuenta real, una operación de liquidez publicó ≈ −6 % / −5.000 USD
// de rentabilidad 24H durante horas, y después "se arregló sola". El probe de la
// fase forense demostró que ese autocorrectado no era reconciliación sino
// CADUCIDAD: la ventana 24H se deslizaba y el escalón salía de ella.
//
// Este harness ejecuta los OWNERS REALES extraídos del bundle —`aurixCashOperation`,
// `_aurixFlowNeutralize`, `_aurixMergePortfolio`, `_aurixRemoteLosesEconomicGround`,
// `convertFromNewToFlat`— con dependencias inyectadas. Las series y los importes son
// ENTRADAS; el cálculo lo hace el código de producción, nunca una reimplementación.
//
// Contratos cubiertos (A–P del SPEC):
//   A 3000+500=3500 · B 3500−500=3000 · C depósito sin rentabilidad
//   D retirada sin pérdida · E edit no duplica · F delete revierte
//   G dos depósitos · H buy interno · I sell interno · J estado parcial no publica
//   K sync converge · L reload · M segundo dispositivo · N remoto atrasado
//   O sin cash sin regresión · P el caso −6,0241 % / −5.000 USD
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { return ''; } };
const app = read('app.js');

let pass = 0, fail = 0; const failed = [];
function ok(n, c, extra) {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; failed.push(n); console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); }
}
function fnSource(name) {
  const i = app.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0, st = false;
  for (let k = i; k < app.length; k++) {
    if (app[k] === '{') { d++; st = true; }
    else if (app[k] === '}') { d--; if (st && !d) return app.slice(i, k + 1); }
  }
  return '';
}
function between(a, b) { const i = app.indexOf(a); if (i < 0) return ''; const j = app.indexOf(b, i); return j < 0 ? '' : app.slice(i, j); }
// Los asserts de AUSENCIA se hacen sobre el código, no sobre los comentarios: el
// bloque que documenta un arreglo nombra por fuerza aquello que retiró.
function stripComments(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); }

const BASE = 83000, DEPOSIT = 540, CASH_START = 3000, H = 36e5, T0 = 1_700_000_000_000;

console.log('\nAURIX-CASH-LEDGER-PERFORMANCE-TRUTH — contrato económico de la liquidez');
console.log('Escenario: invertible ' + BASE + ' USD · cash ' + CASH_START + ' · aportación ' + DEPOSIT + ' USD\n');

// ── Owners reales, con sus dependencias inyectadas ──────────────────────────
let FLOWS = [], PUSHED = [], BUMPS = [];
const _aurixSaveCapitalFlows   = (arr) => { FLOWS = arr; };
const _aurixLoadCapitalFlowsRaw = () => FLOWS.slice();
const _aurixCapitalFlowsPush   = (list) => { PUSHED.push(...(list || [])); return true; };
const _aurixLoadCapitalFlows   = new Function('localStorage', '_aurixPortfolioEpoch', '_AURIX_CAPITAL_FLOWS_KEY',
  fnSource('_aurixLoadCapitalFlows') + '\n;return _aurixLoadCapitalFlows;')(
    { getItem: () => JSON.stringify(FLOWS) }, () => 0, 'aurixCapitalFlows');
const _aurixNewFlowId = new Function(fnSource('_aurixNewFlowId') + '\n;return _aurixNewFlowId;')();
const _aurixCaptureFlow = new Function('_aurixLoadCapitalFlowsRaw', '_aurixSaveCapitalFlows', '_aurixCapitalFlowsPush', 'IS_DEV',
  fnSource('_aurixCaptureFlow') + '\n;return _aurixCaptureFlow;')(
    _aurixLoadCapitalFlowsRaw, _aurixSaveCapitalFlows, _aurixCapitalFlowsPush, false);
const _aurixAmendFlow = new Function('_aurixLoadCapitalFlowsRaw', '_aurixSaveCapitalFlows', '_aurixCapitalFlowsPush',
  fnSource('_aurixAmendFlow') + '\n;return _aurixAmendFlow;')(
    _aurixLoadCapitalFlowsRaw, _aurixSaveCapitalFlows, _aurixCapitalFlowsPush);
const _aurixRevokeFlow = new Function('_aurixLoadCapitalFlowsRaw', '_aurixSaveCapitalFlows', '_aurixCapitalFlowsPush',
  fnSource('_aurixRevokeFlow') + '\n;return _aurixRevokeFlow;')(
    _aurixLoadCapitalFlowsRaw, _aurixSaveCapitalFlows, _aurixCapitalFlowsPush);

// EL OWNER ECONÓMICO ÚNICO.
const cashOp = new Function('_nativeToUSD', '_aurixNewFlowId', '_aurixCaptureFlow', '_aurixAmendFlow', '_aurixRevokeFlow', '_aurixBumpPortfolioMeta',
  fnSource('aurixCashOperation') + '\n;return aurixCashOperation;')(
    (v) => v, _aurixNewFlowId, _aurixCaptureFlow, _aurixAmendFlow, _aurixRevokeFlow, (r) => BUMPS.push(r));

const _WSC_INTERNAL_KINDS = { asset_add: 1, asset_remove: 1, import_baseline: 1, internal_buy: 1, internal_sell: 1, internal_transfer: 1, qty_edit: 1 };
const _aurixFlowIsInternal = new Function('_WSC_INTERNAL_KINDS',
  fnSource('_aurixFlowIsInternal') + '\n;return _aurixFlowIsInternal;')(_WSC_INTERNAL_KINDS);
const flowNeutralize = new Function('investableValueBase', '_aurixLoadCapitalFlows', 'toBase', '_aurixFlowIsInternal',
  fnSource('_aurixFlowNeutralize') + '\n;return _aurixFlowNeutralize;')(
    () => BASE, () => _aurixLoadCapitalFlows(), (v) => v, _aurixFlowIsInternal);

const newCash = (qty) => ({ id: 'cash-eur', type: 'cash', assetCurrency: 'EUR', qty, price: 1, costBasis: qty, transactions: [] });
const flat = (base, n, startTs, stepMs) => Array.from({ length: n }, (_, i) => ({ ts: startTs + i * stepMs, value: base }));
const withStep = (s, at, amt) => s.map((p, i) => ({ ts: p.ts, value: i >= at ? p.value + amt : p.value }));
function returnOf(series) {
  const nz = flowNeutralize(series, '24h');
  const adj = nz.adjusted, first = adj[0], last = adj[adj.length - 1];
  return { pct: first > 0 ? +(((last - first) / first) * 100).toFixed(4) : null, abs: +(last - first).toFixed(2),
           neutralized: nz.totalOffset, recorded: nz.recordedNeutralized, shape: nz.shapeTransfers,
           unmatched: nz.unmatchedFlows, unmatchedTotal: nz.unmatchedFlowTotal };
}
// El predicado exacto del gate, tal y como quedó en `_aurixPerformanceSanityCheck`.
const gatePublishes = (r) => !((r.unmatched || 0) > 0);

// ── 1 · SALDO Y OWNER ÚNICO (A, B) ──────────────────────────────────────────
console.log('1 — Saldo y owner económico único (A, B):');
{
  FLOWS = []; PUSHED = []; BUMPS = [];
  const cash = newCash(CASH_START);
  const r1 = cashOp('deposit', { asset: cash, amount: 500, currency: 'EUR' });
  ok('1.1 A · 3000 + 500 = 3500', r1.ok && cash.qty === 3500, 'saldo=' + cash.qty);
  const r2 = cashOp('withdrawal', { asset: cash, amount: 500, currency: 'EUR' });
  ok('1.2 B · 3500 − 500 = 3000', r2.ok && cash.qty === 3000, 'saldo=' + cash.qty);
  ok('1.3 el saldo es RECONSTRUIBLE desde el ledger del activo',
     cash.transactions.reduce((s, t) => s + (t.type === 'sell' ? -t.qty : t.qty), 0) === cash.qty,
     'declarado ' + cash.qty + ' vs derivable ' + cash.transactions.reduce((s, t) => s + (t.type === 'sell' ? -t.qty : t.qty), 0));
  ok('1.4 costBasis sigue al saldo (un depósito no es plusvalía)', cash.costBasis === 3000, 'costBasis=' + cash.costBasis);
  ok('1.5 cada operación bumpea la revisión económica', BUMPS.length === 2, BUMPS.join(','));
  ok('1.6 una retirada mayor que el saldo se rechaza, no deja saldo negativo',
     cashOp('withdrawal', { asset: cash, amount: 99999, currency: 'EUR' }).reason === 'insufficient_balance' && cash.qty === 3000);
}
{
  // Los tres botones de UI comparten owner: ya no hay dos contabilidades.
  const liq = between("liquidityForm.addEventListener('submit'", 'liquidityClose.addEventListener');
  const add = between("addForm.addEventListener('submit'", 'addClose.addEventListener');
  const red = between("reduceForm.addEventListener('submit'", 'reduceClose.addEventListener');
  ok('1.7 el modal de liquidez delega en el owner', /aurixCashOperation\('deposit'/.test(liq));
  ok('1.8 el "+" contextual delega para cash', /aurixCashOperation\('deposit'/.test(add));
  ok('1.9 el "−" contextual delega para cash', /aurixCashOperation\('withdrawal'/.test(red));
  ok('1.10 ningún handler mantiene aritmética de cash propia',
     !/existingCash\.qty\s*=\s*\+\(existingCash\.qty \+ qty\)/.test(liq),
     'el modal seguía incrementando el saldo por su cuenta');
  ok('1.11 una aportación de cash ya no se registra como compra de instrumento',
     !/_ledgerCashFlow\('deposit'/.test(add) && !/_ledgerCashFlow\('withdrawal'/.test(red),
     'buy/deposit duplicados sobre el mismo hecho');
}

// ── 2 · EDIT / DELETE (E, F) ────────────────────────────────────────────────
console.log('\n2 — Edit y delete (E, F):');
{
  FLOWS = []; PUSHED = [];
  const cash = newCash(0);
  const dep = cashOp('deposit', { asset: cash, amount: 500, currency: 'EUR' });
  const edited = cashOp('edit', { asset: cash, flowId: dep.flowId, amount: 700, currency: 'EUR' });
  const live = _aurixLoadCapitalFlows();
  ok('2.1 E · editar 500 → 700 deja UN flujo de 700 (no dos que suman 1200)',
     edited.ok && live.length === 1 && live[0].amountUSD === 700,
     live.length + ' flujos, total ' + live.reduce((s, f) => s + f.amountUSD, 0));
  ok('2.2 E · la edición conserva el MISMO flow_id y sube la revisión',
     live[0].id === dep.flowId && live[0].revision === 2, 'revision=' + live[0].revision);
  ok('2.3 E · el saldo sigue a la edición', cash.qty === 700, 'saldo=' + cash.qty);
  ok('2.4 E · y el ledger del activo también', cash.transactions.length === 1 && cash.transactions[0].qty === 700);
}
{
  FLOWS = []; PUSHED = [];
  const cash = newCash(3000);
  const dep = cashOp('deposit', { asset: cash, amount: 500, currency: 'EUR' });
  const del = cashOp('delete', { asset: cash, flowId: dep.flowId });
  ok('2.5 F · borrar la aportación devuelve el saldo a 3000', del.ok && cash.qty === 3000, 'saldo=' + cash.qty);
  ok('2.6 F · el flujo sale de la lectura económica', _aurixLoadCapitalFlows().length === 0);
  ok('2.7 F · pero NO se destruye: queda tombstone con revisión (historial financiero)',
     FLOWS.length === 1 && !!FLOWS[0].deletedAt && FLOWS[0].revision === 2,
     JSON.stringify(FLOWS.map(f => ({ del: !!f.deletedAt, rev: f.revision }))));
  ok('2.8 F · costBasis vuelve también', cash.costBasis === 3000, 'costBasis=' + cash.costBasis);
}

// ── 3 · NEUTRALIZACIÓN (C, D, G, H, I) ──────────────────────────────────────
console.log('\n3 — Neutralización de flujos (C, D, G, H, I):');
{
  FLOWS = [];
  const cash = newCash(CASH_START);
  cashOp('deposit', { asset: cash, amount: DEPOSIT, currency: 'USD' });
  FLOWS.forEach(f => { f.ts = T0 + 12 * H; });          // instante económico controlado
  const r = returnOf(withStep(flat(BASE, 24, T0, H), 12, DEPOSIT));
  ok('3.1 C · una aportación de 500 € NO genera rentabilidad',
     Math.abs(r.pct) < 0.01, 'publica ' + r.pct + ' % · neutralizado ' + r.neutralized);
  ok('3.2 C · el flujo se neutraliza aunque sea el 0,65 % del portfolio (sin RECORD_MAT)',
     r.recorded === 1, 'recordedNeutralized=' + r.recorded);
}
{
  FLOWS = [];
  const cash = newCash(CASH_START);
  cashOp('withdrawal', { asset: cash, amount: DEPOSIT, currency: 'USD' });
  FLOWS.forEach(f => { f.ts = T0 + 12 * H; });
  const r = returnOf(withStep(flat(BASE, 24, T0, H), 12, -DEPOSIT));
  ok('3.3 D · una retirada de 500 € NO genera pérdida', Math.abs(r.pct) < 0.01, 'publica ' + r.pct + ' %');
}
{
  FLOWS = [];
  const cash = newCash(CASH_START);
  cashOp('deposit', { asset: cash, amount: DEPOSIT, currency: 'USD', ts: T0 + 8 * H });
  cashOp('deposit', { asset: cash, amount: DEPOSIT, currency: 'USD', ts: T0 + 14 * H });
  let s = flat(BASE, 24, T0, H); s = withStep(s, 8, DEPOSIT); s = withStep(s, 14, DEPOSIT);
  const r = returnOf(s);
  ok('3.4 G · dos aportaciones consecutivas siguen sin generar rentabilidad',
     Math.abs(r.pct) < 0.01 && r.recorded === 2, 'pct=' + r.pct + ' recorded=' + r.recorded);
}
{
  FLOWS = [];
  _aurixCaptureFlow('asset_add', 5000, T0 + 10 * H, 'btc-1', null, 'user');
  ok('3.5 H · una compra con cash interno no es flujo externo',
     _aurixFlowIsInternal('asset_add') === true && _aurixLoadCapitalFlows()[0].kind === 'asset_add');
  FLOWS = [];
  _aurixCaptureFlow('asset_remove', -5000, T0 + 10 * H, 'btc-1', null, 'user');
  ok('3.6 I · una venta hacia cash tampoco es flujo externo',
     _aurixFlowIsInternal('asset_remove') === true && _aurixLoadCapitalFlows()[0].kind === 'asset_remove');
  ok('3.7 H/I · el owner de cash NO acepta movimientos internos (frontera explícita)',
     cashOp('internal_buy', { asset: newCash(100), amount: 10 }).reason === 'unknown_op');
}

// ── 4 · EL CASO REAL: −6,0241 % / −5.000 USD (P, J) ─────────────────────────
console.log('\n4 — El caso observado y el gate fail-closed (P, J):');
{
  // Reingreso registrado SIN contrapartida en la serie: la pérdida original
  // (overwrite de sync) nunca generó un flujo que la compensara.
  FLOWS = [];
  const cash = newCash(0);
  cashOp('deposit', { asset: cash, amount: 5000, currency: 'USD', ts: T0 + 12 * H });
  const r = returnOf(flat(BASE, 24, T0, H));            // patrimonio plano: no subió por el reingreso
  ok('4.1 P · reponer un saldo perdido ya no se resta de una serie que no subió',
     Math.abs(r.abs) < 1, 'publica ' + r.pct + ' % (' + r.abs + ' USD) — antes: −6.0241 % / −5000 USD');
  ok('4.2 P · el flujo sin contrapartida se marca unmatched en lugar de neutralizarse',
     r.unmatched === 1 && Math.abs(r.unmatchedTotal - 5000) < 1,
     'unmatched=' + r.unmatched + ' total=' + r.unmatchedTotal);
  ok('4.3 J · el gate NO publica con un flujo sin reconciliar',
     gatePublishes(r) === false, 'pending_flow_reconciliation');
}
{
  // Con AMBOS lados registrados, el mismo motor publica 0 % y el gate abre.
  FLOWS = [];
  const cash = newCash(5000);
  cashOp('withdrawal', { asset: cash, amount: 5000, currency: 'USD', ts: T0 + 6 * H });
  cashOp('deposit',    { asset: cash, amount: 5000, currency: 'USD', ts: T0 + 12 * H });
  let s = flat(BASE, 24, T0, H).map((p, i) => ({ ts: p.ts, value: (i >= 6 && i < 12) ? p.value - 5000 : p.value }));
  const r = returnOf(s);
  ok('4.4 K · con el ledger completo el retorno converge a 0 % y el gate abre',
     Math.abs(r.pct) < 0.01 && gatePublishes(r) === true, 'pct=' + r.pct + ' unmatched=' + r.unmatched);
}
{
  const sanity = fnSource('_aurixPerformanceSanityCheck');
  ok('4.5 J · el gate declara pending_flow_reconciliation', /pending_flow_reconciliation/.test(sanity));
  ok('4.6 J · y bloquea por revisión de ledger incompatible',
     /flowLedgerRevisionAtCompute/.test(sanity) && /_aurixFlowLedgerRevision\(\)/.test(sanity));
  // Assert de AUSENCIA: se despojan los comentarios primero (el bloque que explica
  // el fail-closed menciona "delay/timeout/LKG" justamente para decir que no los usa).
  ok('4.7 J · sin delays, timeouts ni LKG en el camino del gate',
     !/setTimeout|setInterval|lastKnownGood|\bLKG\b/i.test(stripComments(sanity)));
}

// ── 5 · SYNC, DISPOSITIVOS Y PERSISTENCIA (K, L, M, N) ──────────────────────
console.log('\n5 — Una sola verdad económica (K, L, M, N):');
{
  const sql = read('db/capital_flows_1.sql');
  ok('5.1 M · existe la autoridad remota del ledger económico',
     /create table if not exists public\.capital_flows/.test(sql));
  ok('5.2 M · con PK (user_id, flow_id) — idempotencia real',
     /primary key \(user_id, flow_id\)/.test(sql));
  ok('5.3 M · contrato mínimo completo',
     ['flow_id', 'ts', 'kind', 'amount', 'currency', 'amount_usd', 'asset_id', 'revision', 'deleted_at', 'updated_at']
       .every(c => new RegExp('\\b' + c + '\\b').test(sql)));
  ok('5.4 M · RLS fail-closed por usuario y sin DELETE de cliente',
     /auth\.uid\(\) = user_id/.test(sql) && /force  row level security/.test(sql)
     && !/for delete/i.test(sql));
  ok('5.5 M · el cliente empuja y lee el ledger (upsert idempotente)',
     /from\('capital_flows'\)\.upsert\(rows, \{ onConflict: 'user_id,flow_id' \}\)/.test(app)
     && /from\('capital_flows'\)\.select\(/.test(app));
  ok('5.6 M · el reader remoto resuelve por REVISIÓN, no por reloj',
     /remote\.revision\) \|\| 1\) > \(Number\(cur\.revision\)/.test(app));
  ok('5.7 M · backfill idempotente del ledger local existente',
     /function _aurixBackfillCapitalFlows/.test(app) && /_aurixCapitalFlowsPush\(local\)/.test(app));
  ok('5.8 M · el pull se engancha al ciclo de reconciliación remota',
     /_aurixCapitalFlowsPull\(\); \} catch \(_\) \{\}/.test(app));
}
{
  // Cada operación se publica al ledger remoto en el acto.
  FLOWS = []; PUSHED = [];
  const cash = newCash(0);
  const d = cashOp('deposit', { asset: cash, amount: 500, currency: 'EUR' });
  cashOp('edit', { asset: cash, flowId: d.flowId, amount: 700, currency: 'EUR' });
  cashOp('delete', { asset: cash, flowId: d.flowId });
  ok('5.9 M · alta, edición y anulación se publican todas al ledger remoto',
     PUSHED.length === 3 && PUSHED.every(f => f.id === d.flowId),
     PUSHED.length + ' push, ids: ' + [...new Set(PUSHED.map(f => f.id))].length);
}
{
  // L · reload: releer el mismo ledger no cambia la verdad económica.
  FLOWS = [];
  const cash = newCash(CASH_START);
  cashOp('deposit', { asset: cash, amount: DEPOSIT, currency: 'USD', ts: T0 + 12 * H });
  const serie = withStep(flat(BASE, 24, T0, H), 12, DEPOSIT);
  const a = returnOf(serie);
  FLOWS = JSON.parse(JSON.stringify(FLOWS));           // round-trip por almacenamiento
  const b = returnOf(serie);
  ok('5.10 L · un reload conserva la verdad económica',
     a.pct === b.pct && a.neutralized === b.neutralized && a.unmatched === b.unmatched);
}
{
  // N · remoto atrasado no puede pisar un saldo local más nuevo.
  const losesGround = new Function(fnSource('_aurixRemoteLosesEconomicGround') + '\n;return _aurixRemoteLosesEconomicGround;')();
  const merge = new Function('_shouldDistrustRemote', '_aurixRemoteUpdatedMs', '_aurixReadPortfolioMeta', '_aurixRemoteLosesEconomicGround', 'console',
    fnSource('_aurixMergePortfolio') + '\n;return _aurixMergePortfolio;')(
      () => false,
      new Function(fnSource('_aurixRemoteUpdatedMs') + '\n;return _aurixRemoteUpdatedMs;')(),
      () => ({ version: 5, updatedAt: T0 + 10 * H, syncedAt: T0 + 9 * H, deviceId: 'A' }),
      losesGround, { log() {} });
  const toFlat = new Function('_aurixSalvageHolding', 'console',
    fnSource('convertFromNewToFlat') + '\n;return convertFromNewToFlat;')(() => null, { log() {}, warn() {} });

  const catalog = [{ id: 'c1', name: 'Euros', symbol: '€', type: 'cash', assetCurrency: 'EUR' }];
  const localModel  = { assets: catalog, holdings: [{ id: 'h1', asset_id: 'c1', quantity: 3500, transactions: [{}, {}] }] };
  const remoteStale = { assets: catalog, holdings: [{ id: 'h1', asset_id: 'c1', quantity: 500, transactions: [{}] }],
                        updated_at: new Date(T0 + 11 * H).toISOString() };   // reloj MÁS reciente
  const dec = merge(localModel, remoteStale);
  const applied = dec.apply === 'remote' ? toFlat(remoteStale.assets, remoteStale.holdings, {}) : toFlat(localModel.assets, localModel.holdings, {});
  ok('5.11 N · un remoto atrasado NO sustituye un saldo local más nuevo (3000→500)',
     applied[0] && applied[0].qty === 3500,
     'decisión "' + dec.apply + ':' + dec.reason + '" ⇒ saldo ' + (applied[0] ? applied[0].qty : null));
  ok('5.12 N · y la decisión lo dice explícitamente',
     dec.apply === 'local' && dec.reason === 'remote-economically-behind', dec.reason);

  // K · en cuanto el remoto se pone al día, converge sin bloqueo.
  const remoteFresh = { assets: catalog, holdings: [{ id: 'h1', asset_id: 'c1', quantity: 3500, transactions: [{}, {}] }],
                        updated_at: new Date(T0 + 12 * H).toISOString() };
  const dec2 = merge(localModel, remoteFresh);
  ok('5.13 K · con el remoto ya reconciliado el sync converge (no se bloquea)',
     dec2.apply === 'remote' && dec2.reason === 'remote-newer', dec2.apply + ':' + dec2.reason);

  // Un remoto que AVANZA económicamente sigue aplicándose (no sobre-bloqueamos).
  const remoteAhead = { assets: catalog, holdings: [{ id: 'h1', asset_id: 'c1', quantity: 9000, transactions: [{}, {}, {}] }],
                        updated_at: new Date(T0 + 12 * H).toISOString() };
  ok('5.14 K · un remoto con MÁS capital sí se aplica', merge(localModel, remoteAhead).apply === 'remote');
}

// ── 6 · NO REGRESIÓN (O) ────────────────────────────────────────────────────
console.log('\n6 — No regresión (O):');
{
  FLOWS = [];
  const subida = flat(BASE, 24, T0, H).map((p, i) => ({ ts: p.ts, value: BASE * (1 + 0.02 * i / 23) }));
  const r = returnOf(subida);
  ok('6.1 O · sin movimientos de cash, un +2 % de mercado se publica intacto',
     Math.abs(r.pct - 2) < 0.05 && r.neutralized === 0 && gatePublishes(r), 'pct=' + r.pct);
  const plano = returnOf(flat(BASE, 24, T0, H));
  ok('6.2 O · sin flujos y sin mercado, el retorno es exactamente 0 y el gate abre',
     plano.pct === 0 && plano.unmatched === 0 && gatePublishes(plano));
}
{
  // Pass A (heurística sin ledger) intacta: mismos umbrales, mismo comportamiento.
  FLOWS = [];
  const r = returnOf(withStep(flat(BASE, 24, T0, H), 12, BASE * 0.30));
  ok('6.3 O · la heurística de forma sigue neutralizando un flujo grande sin ledger',
     r.shape >= 1 && Math.abs(r.pct) < 0.01, 'shape=' + r.shape + ' pct=' + r.pct);
  ok('6.4 O · Pass A conserva sus umbrales (materialidad sólo donde se infiere)',
     /const STEP_THR = 0\.18, SUSTAIN = 3;/.test(fnSource('_aurixFlowNeutralize')));
  ok('6.5 O · y RECORD_MAT ya no filtra la evidencia exacta del ledger',
     !/RECORD_MAT/.test(stripComments(fnSource('_aurixFlowNeutralize'))),
     'el umbral seguía descartando flujos registrados por su tamaño');
  ok('6.6 O · en su lugar, Pass B exige contrapartida observable en la serie',
     /matched\s*=\s*Math\.sign\(observed\) === Math\.sign\(base\)/.test(fnSource('_aurixFlowNeutralize')));
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
