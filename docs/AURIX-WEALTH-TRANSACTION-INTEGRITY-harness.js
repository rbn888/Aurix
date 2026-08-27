'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-WEALTH-TRANSACTION-INTEGRITY — P0 LIQUIDEZ ↔ TRANSACCIONES ↔ FLUJOS
// ════════════════════════════════════════════════════════════════════════════
// El founder observó casos ambiguos alrededor de ~3.000 € de liquidez: +500,
// operaciones posteriores de +500 / eliminación / venta, un Sell 600, sospecha
// de interacción USDC ↔ liquidez y diferencias entre el saldo visible y las
// transacciones. Este harness NO asume que los síntomas siguen ahí: ejecuta los
// OWNERS REALES extraídos del bundle y determina qué está abierto HOY.
//
// Owners ejecutados (nunca reimplementados):
//   aurixCashOperation · _aurixCaptureFlow / _aurixAmendFlow / _aurixRevokeFlow
//   _aurixLoadCapitalFlows · _closePosition / _reactivatePosition / isClosedAsset
//   _aurixUsableQuantity · assetNativeValue / assetValueUSD / totalValueUSD
//   _ledgerTrade · _aurixLedgerAssetRemoval · _aurixTwrChain
//
// La aritmética financiera la hace el código de producción. El harness sólo
// aporta ENTRADAS y comprueba INVARIANTES.
//
// Cobertura (casos A–J del SPEC). Lo ya demostrado en
// AURIX-CASH-LEDGER-PERFORMANCE-TRUTH (A/B, edit, delete, dos depósitos, sync)
// y en AURIX-INT-INVESTABLE-PERFORMANCE (H/I: depósito ≠ rendimiento, retirada
// ≠ pérdida, trade ≠ capital, inmueble fuera) NO se repite aquí; este gate
// cubre lo que aquellos no ven: el CICLO DE VIDA de la fila de liquidez, la
// frontera stablecoin ↔ cash, el Sell 600, y la eliminación de una posición.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

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
function slice(a, b) { const i = app.indexOf(a); if (i < 0) return ''; const j = app.indexOf(b, i); return j < 0 ? '' : app.slice(i, j); }
function stripComments(s) { return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); }
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-6 : e);

// ── Owners reales con dependencias inyectadas ───────────────────────────────
let FLOWS = [];
const usdToEur = 0.92;                                  // 1 USD = 0,92 EUR
const _aurixSaveCapitalFlows    = (arr) => { FLOWS = arr; };
const _aurixLoadCapitalFlowsRaw = () => FLOWS.slice();
const _aurixCapitalFlowsPush    = () => true;
const _aurixLoadCapitalFlows = new Function('localStorage', '_aurixPortfolioEpoch', '_AURIX_CAPITAL_FLOWS_KEY',
  fnSource('_aurixLoadCapitalFlows') + '\n;return _aurixLoadCapitalFlows;')(
    { getItem: () => JSON.stringify(FLOWS) }, () => 0, 'aurixCapitalFlows');
const _aurixNewFlowId   = new Function(fnSource('_aurixNewFlowId') + '\n;return _aurixNewFlowId;')();
const _aurixCaptureFlow = new Function('_aurixLoadCapitalFlowsRaw', '_aurixSaveCapitalFlows', '_aurixCapitalFlowsPush', 'IS_DEV',
  fnSource('_aurixCaptureFlow') + '\n;return _aurixCaptureFlow;')(
    _aurixLoadCapitalFlowsRaw, _aurixSaveCapitalFlows, _aurixCapitalFlowsPush, false);
const _aurixAmendFlow = new Function('_aurixLoadCapitalFlowsRaw', '_aurixSaveCapitalFlows', '_aurixCapitalFlowsPush',
  fnSource('_aurixAmendFlow') + '\n;return _aurixAmendFlow;')(
    _aurixLoadCapitalFlowsRaw, _aurixSaveCapitalFlows, _aurixCapitalFlowsPush);
const _aurixRevokeFlow = new Function('_aurixLoadCapitalFlowsRaw', '_aurixSaveCapitalFlows', '_aurixCapitalFlowsPush',
  fnSource('_aurixRevokeFlow') + '\n;return _aurixRevokeFlow;')(
    _aurixLoadCapitalFlowsRaw, _aurixSaveCapitalFlows, _aurixCapitalFlowsPush);

const _aurixFxRate         = () => NaN;                 // sólo USD/EUR en este escenario
const _nativeToUSD         = new Function('usdToEur', '_aurixFxRate', fnSource('_nativeToUSD') + '\n;return _nativeToUSD;')(usdToEur, _aurixFxRate);
const _aurixUsableQuantity = new Function(fnSource('_aurixUsableQuantity') + '\n;return _aurixUsableQuantity;')();
const isClosedAsset        = new Function(fnSource('isClosedAsset') + '\n;return isClosedAsset;')();
const _closePosition       = new Function(fnSource('_closePosition') + '\n;return _closePosition;')();
const _reactivatePosition  = new Function('isClosedAsset', fnSource('_reactivatePosition') + '\n;return _reactivatePosition;')(isClosedAsset);
const liquidityNominal     = new Function(fnSource('liquidityNominal') + '\n;return liquidityNominal;')();
// El oro NO se estipula: pureza, unidad y onza troy son los del bundle, porque de
// ahí depende que el importe de una eliminación sea el valorado y no `qty × price`.
const OZ_TO_G       = Number((app.match(/const OZ_TO_G = ([\d.]+);/) || [])[1]);
const _PURITY_TABLE = new Function('return ' + (app.match(/const _PURITY_TABLE = (\{[^}]+\});/) || [])[1] + ';')();
const _goldPurity   = new Function('_PURITY_TABLE', fnSource('_goldPurity') + '\n;return _goldPurity;')(_PURITY_TABLE);
const _goldGrams    = new Function('OZ_TO_G', fnSource('_goldGrams') + '\n;return _goldGrams;')(OZ_TO_G);
const assetNativeValue     = new Function('liquidityNominal', '_goldGrams', '_goldPurity', 'OZ_TO_G',
  fnSource('assetNativeValue') + '\n;return assetNativeValue;')(liquidityNominal, _goldGrams, _goldPurity, OZ_TO_G);
const assetValueUSD        = new Function('assetNativeValue', 'usdToEur', '_aurixFxRate',
  fnSource('assetValueUSD') + '\n;return assetValueUSD;')(assetNativeValue, usdToEur, _aurixFxRate);

// EL OWNER ECONÓMICO ÚNICO de la liquidez.
let BUMPS = [];
const cashOp = new Function('_nativeToUSD', '_aurixNewFlowId', '_aurixCaptureFlow', '_aurixAmendFlow',
                            '_aurixRevokeFlow', '_aurixBumpPortfolioMeta', '_reactivatePosition',
  fnSource('aurixCashOperation') + '\n;return aurixCashOperation;')(
    _nativeToUSD, _aurixNewFlowId, _aurixCaptureFlow, _aurixAmendFlow, _aurixRevokeFlow,
    (r) => BUMPS.push(r), _reactivatePosition);

// El owner del efecto económico de una compra/venta NO-cash.
let JOURNAL = [];
const _ledgerTrade = new Function('_aurixJournalAppend', '_nativeToUSD', '_aurixCaptureFlow', 'window',
  fnSource('_ledgerTrade') + '\n;return _ledgerTrade;')(
    (type, id, d) => JOURNAL.push({ type, id, d }), _nativeToUSD, _aurixCaptureFlow, {});

const _aurixTwrChain = new Function(fnSource('_aurixTwrChain') + '\n;return _aurixTwrChain;')();

// El patrimonio publicado, con la MISMA lista que los porcentajes.
let ASSETS = [];
const activeAssets  = () => ASSETS.filter(a => !isClosedAsset(a));
const totalValueUSD = new Function('activeAssets', '_aurixUsableQuantity', 'assetValueUSD',
  fnSource('totalValueUSD') + '\n;return totalValueUSD;')(activeAssets, _aurixUsableQuantity, assetValueUSD);

const _aurixCategoryBucket = new Function(fnSource('_aurixCategoryBucket') + '\n;return _aurixCategoryBucket;')();
const isInvestableAsset    = new Function('_aurixCategoryBucket', fnSource('isInvestableAsset') + '\n;return isInvestableAsset;')(_aurixCategoryBucket);
const removalSrc = fnSource('_aurixLedgerAssetRemoval');
const _aurixAssetRemovalFlowId = new Function(fnSource('_aurixAssetRemovalFlowId') + '\n;return _aurixAssetRemovalFlowId;')();
const _aurixLedgerAssetRemoval = removalSrc
  ? new Function('_aurixUsableQuantity', '_aurixAssetRemovalFlowId', 'aurixCashOperation', 'isInvestableAsset',
                 'assetValueUSD', 'assetNativeValue', '_aurixCaptureFlow',
      removalSrc + '\n;return _aurixLedgerAssetRemoval;')(
        _aurixUsableQuantity, _aurixAssetRemovalFlowId, cashOp, isInvestableAsset,
        assetValueUSD, assetNativeValue, _aurixCaptureFlow)
  : null;

// ── Utilidades del harness (invariantes, no aritmética financiera) ──────────
const T0 = 1_700_000_000_000, H = 36e5;
function newCash(curr, qty, extra) {
  return Object.assign({ id: 'cash-' + curr, name: curr, ticker: curr === 'EUR' ? '€' : '$', type: 'cash',
    qty: qty, price: 1, assetCurrency: curr, costBasis: qty, transactions: [] }, extra || {});
}
// SALDO ≡ LEDGER: el saldo almacenado debe poder reconstruirse desde las
// transacciones del holding (compras − ventas). Es el invariante, no un cálculo.
function ledgerBalance(a) {
  return +(a.transactions || []).reduce((s, t) => s + (t.type === 'sell' ? -Number(t.qty || 0) : Number(t.qty || 0)), 0).toFixed(2);
}
const reconciled = (a) => near(ledgerBalance(a), Number(a.qty), 0.005);
const flowsFor   = (id) => _aurixLoadCapitalFlows().filter(f => f.assetId === id);
const netFlow    = (id) => +flowsFor(id).reduce((s, f) => s + Number(f.amountUSD || 0), 0).toFixed(6);
function reset() { FLOWS = []; ASSETS = []; JOURNAL = []; BUMPS = []; }

console.log('\nAURIX-WEALTH-TRANSACTION-INTEGRITY — liquidez ↔ transacciones ↔ flujos ↔ patrimonio');
console.log('Owners reales extraídos del bundle. 1 USD = 0,92 EUR.\n');

// ── 1 · CASOS A / B — alta y retirada de liquidez ───────────────────────────
console.log('1 — Alta y retirada (A, B):');
{
  reset();
  // 3.000 € preexistentes (creados antes de que la liquidez tuviera ledger).
  const eur = newCash('EUR', 3000, { transactions: [] });
  ASSETS.push(eur);
  const r1 = cashOp('deposit', { asset: eur, amount: 500, currency: 'EUR', ts: T0 });
  ok('1.1 A · 3.000 + 500 = 3.500', r1.ok === true && near(eur.qty, 3500), 'qty=' + eur.qty + ' reason=' + r1.reason);
  ok('1.2 A · el saldo es reconstruible desde las transacciones', reconciled(eur), 'ledger=' + ledgerBalance(eur));
  ok('1.3 A · el saldo preexistente entró como ASIENTO DE APERTURA identificable',
     eur.transactions.filter(t => t.opening === true).length === 1 && near(eur.transactions.find(t => t.opening).qty, 3000));
  ok('1.4 A · la apertura NO emitió flujo de capital (ese dinero ya estaba dentro)',
     flowsFor(eur.id).length === 1 && flowsFor(eur.id)[0].kind === 'deposit');
  // El ledger almacena importes con 2 decimales (`+amountUSD.toFixed(2)`), así que
  // la tolerancia es el céntimo — no un margen de conveniencia.
  ok('1.5 A · el flujo externo es +500 € convertidos UNA vez a USD',
     near(netFlow(eur.id), 500 / usdToEur, 0.005), 'netUSD=' + netFlow(eur.id));
  ok('1.6 A · costBasis sigue al nominal (un depósito no es plusvalía)', near(eur.costBasis, 3500));

  const r2 = cashOp('withdrawal', { asset: eur, amount: 500, currency: 'EUR', ts: T0 + H });
  ok('1.7 B · 3.500 − 500 = 3.000', r2.ok === true && near(eur.qty, 3000), 'qty=' + eur.qty);
  ok('1.8 B · reconciliado, y el ledger externo neto vuelve a 0', reconciled(eur) && near(netFlow(eur.id), 0, 1e-6),
     'ledger=' + ledgerBalance(eur) + ' net=' + netFlow(eur.id));
  ok('1.9 B · retirar más de lo que hay se rechaza, no se clampa a 0',
     cashOp('withdrawal', { asset: eur, amount: 9999, currency: 'EUR', ts: T0 + 2 * H }).reason === 'insufficient_balance' && near(eur.qty, 3000));
}

// ── 2 · CASO C — el Sell 600 ─────────────────────────────────────────────────
console.log('\n2 — Sell 600 (C):');
{
  reset();
  const eur  = newCash('EUR', 3500, { transactions: [{ type: 'buy', qty: 3500, price: 1, ts: T0 - H }] });
  const usdc = { id: 'usdc', name: 'USD Coin', ticker: 'USDC', type: 'crypto', qty: 600, price: 1,
                 assetCurrency: 'USD', costBasis: 600, transactions: [{ type: 'buy', qty: 600, price: 1, ts: T0 - H }] };
  ASSETS.push(eur, usdc);
  const before = { usdcQty: usdc.qty, usdcTx: usdc.transactions.length, total: totalValueUSD() };
  const r = cashOp('withdrawal', { asset: eur, amount: 600, currency: 'EUR', ts: T0 });
  ok('2.1 C · 3.500 − 600 = 2.900', r.ok === true && near(eur.qty, 2900), 'qty=' + eur.qty);
  ok('2.2 C · la retirada es identificable como tal (sell con flowId, nunca huérfana)',
     (() => { const t = eur.transactions[eur.transactions.length - 1]; return t.type === 'sell' && near(t.qty, 600) && !!t.flowId; })());
  ok('2.3 C · el flujo es −600 € (una sola conversión) y lleva el MISMO flowId',
     near(netFlow(eur.id), -600 / usdToEur, 0.005) && flowsFor(eur.id)[0].flowId === r.flowId, 'net=' + netFlow(eur.id));
  ok('2.4 C · saldo ≡ ledger tras la retirada', reconciled(eur), 'ledger=' + ledgerBalance(eur));
  ok('2.5 C · NINGÚN otro activo fue modificado',
     usdc.qty === before.usdcQty && usdc.transactions.length === before.usdcTx && flowsFor('usdc').length === 0);
  ok('2.6 C · el patrimonio bajó exactamente el importe retirado, no más',
     near(totalValueUSD(), before.total - 600 / usdToEur, 1e-6), 'total=' + totalValueUSD());
}

// ── 3 · CASO D — vender USDC no fabrica euros ────────────────────────────────
console.log('\n3 — Venta de USDC (D):');
{
  reset();
  const eur  = newCash('EUR', 3000, { transactions: [{ type: 'buy', qty: 3000, price: 1, ts: T0 - H }] });
  const usdc = { id: 'usdc', name: 'USD Coin', ticker: 'USDC', type: 'crypto', qty: 600, price: 1,
                 assetCurrency: 'USD', costBasis: 600, transactions: [{ type: 'buy', qty: 600, price: 1, ts: T0 - H }] };
  ASSETS.push(eur, usdc);
  const eurBefore = JSON.stringify(eur);
  // La ruta real de venta no-cash: transacción en el activo + owner del flujo.
  usdc.transactions.push({ type: 'sell', qty: 600, price: 1, ts: T0 });
  _ledgerTrade(usdc, 'sell', 600, 1, T0, 0);
  _closePosition(usdc, T0);
  ok('3.1 D · la venta total CIERRA la posición (nunca la borra: el historial sobrevive)',
     isClosedAsset(usdc) && usdc.qty === 0 && usdc.transactions.length === 2);
  ok('3.2 D · el EUR cash quedó BYTE-IDÉNTICO (no hay contrapartida automática)',
     JSON.stringify(eur) === eurBefore);
  ok('3.3 D · no se fabricó liquidez: ni un solo flujo deposit en todo el ledger',
     _aurixLoadCapitalFlows().every(f => f.kind !== 'deposit'));
  ok('3.4 D · el movimiento se registró como asset_remove (interno, neutralizable)',
     flowsFor('usdc').length === 1 && flowsFor('usdc')[0].kind === 'asset_remove' && flowsFor('usdc')[0].amountUSD < 0);
  ok('3.5 D · la posición cerrada sale del patrimonio publicado sin arrastrar el cash',
     near(totalValueUSD(), 3000 / usdToEur, 1e-6), 'total=' + totalValueUSD());
  // El contrato de la ruta, en el código: la rama no-cash sólo toca `asset`.
  const sellBranch = stripComments(slice('if (_isCashReduce) {', 'const sellToastName'));
  ok('3.6 D · la rama de venta no-cash no escribe en ningún otro activo',
     sellBranch.indexOf('_ledgerTrade') > -1 && !/assets\s*\[|assets\.find|assetCurrency\s*===/.test(sellBranch.split('} else {')[1] || ''));
}

// ── 4 · CASO E — frontera stablecoin ↔ cash ─────────────────────────────────
console.log('\n4 — Frontera stablecoin ↔ cash (E):');
{
  reset();
  const usdc = { id: 'usdc', name: 'USD Coin', ticker: 'USDC', type: 'crypto', qty: 600, price: 1,
                 assetCurrency: 'USD', costBasis: 600, transactions: [] };
  const r = cashOp('deposit', { asset: usdc, amount: 500, currency: 'USD', ts: T0 });
  ok('4.1 E · el owner económico RECHAZA un activo que no es cash',
     r.ok === false && r.reason === 'not_a_cash_asset' && usdc.qty === 600);
  // El selector de reutilización del alta de liquidez, tal cual está escrito.
  const sel = slice('let existingCash = assets.find(', ';');
  ok('4.2 E · el alta de liquidez sólo reutiliza filas type=cash de la MISMA moneda',
     /a\.type === 'cash'/.test(sel) && /a\.assetCurrency === curr/.test(sel), sel.trim());
  ok('4.3 E · y USDC está catalogado como crypto, así que no puede caer en ese selector',
     /ticker: 'USDC',\s*name: 'USD Coin',\s*type: 'crypto'/.test(app));
  ok('4.4 E · nadie más en la app crea o reclasifica un activo como cash',
     (app.match(/type:\s*'cash'/g) || []).length === 1 && !/\.type\s*=\s*'cash'/.test(app));
}

// ── 5 · CASO F — depósitos encadenados, nada se sobrescribe ─────────────────
console.log('\n5 — 3.000 → +500 → +500 → eliminar 500 (F):');
{
  reset();
  const eur = newCash('EUR', 3000, { transactions: [] });
  ASSETS.push(eur);
  const a = cashOp('deposit', { asset: eur, amount: 500, currency: 'EUR', ts: T0 });
  const b = cashOp('deposit', { asset: eur, amount: 500, currency: 'EUR', ts: T0 + H });
  ok('5.1 F · cada depósito SUMA (3.000 → 3.500 → 4.000), nunca sustituye', near(eur.qty, 4000), 'qty=' + eur.qty);
  ok('5.2 F · dos aportaciones idénticas son dos eventos distintos y distinguibles',
     a.flowId !== b.flowId && flowsFor(eur.id).length === 2);
  ok('5.3 F · reconciliado en cada paso', reconciled(eur), 'ledger=' + ledgerBalance(eur));
  const d = cashOp('delete', { asset: eur, flowId: b.flowId });
  ok('5.4 F · anular el segundo depósito deja 3.500 exactos', d.ok === true && near(eur.qty, 3500), 'qty=' + eur.qty);
  ok('5.5 F · el PRIMER depósito sigue intacto (no fue sobrescrito)',
     eur.transactions.some(t => t.flowId === a.flowId && near(t.qty, 500)));
  ok('5.6 F · el asiento de apertura de los 3.000 sigue intacto',
     eur.transactions.filter(t => t.opening === true).length === 1 && near(eur.transactions.find(t => t.opening).qty, 3000));
  ok('5.7 F · el evento anulado NO se borra del ledger: lleva tombstone',
     _aurixLoadCapitalFlowsRaw().some(f => f.flowId === b.flowId && f.deletedAt) &&
     !_aurixLoadCapitalFlows().some(f => f.flowId === b.flowId));
  ok('5.8 F · saldo ≡ ledger después de anular', reconciled(eur), 'ledger=' + ledgerBalance(eur));
  const e = cashOp('edit', { asset: eur, flowId: a.flowId, amount: 800 });
  ok('5.9 F · corregir una aportación no añade otra: mismo flowId, revisión +1',
     e.ok === true && near(eur.qty, 3800) && reconciled(eur) &&
     _aurixLoadCapitalFlowsRaw().filter(f => f.flowId === a.flowId).length === 1, 'qty=' + eur.qty);
}

// ── 6 · CICLO DE VIDA DE LA FILA DE LIQUIDEZ ────────────────────────────────
// Retirar TODO cierra la fila. El alta de liquidez REUTILIZA la fila por moneda,
// así que el siguiente ingreso cae sobre una posición cerrada.
console.log('\n6 — Reingreso tras vaciar la liquidez:');
{
  reset();
  const eur = newCash('EUR', 500, { transactions: [{ type: 'buy', qty: 500, price: 1, ts: T0 - H }] });
  const btc = { id: 'btc', ticker: 'BTC', type: 'crypto', qty: 1, price: 10000, assetCurrency: 'USD', costBasis: 10000, transactions: [] };
  ASSETS.push(eur, btc);
  cashOp('withdrawal', { asset: eur, amount: 500, currency: 'EUR', ts: T0 });
  _closePosition(eur, T0);                                  // lo hace la ruta real al quedar el saldo a 0
  ok('6.1 vaciar la liquidez cierra la fila y la saca del patrimonio',
     isClosedAsset(eur) && near(totalValueUSD(), 10000), 'total=' + totalValueUSD());
  const r = cashOp('deposit', { asset: eur, amount: 500, currency: 'EUR', ts: T0 + H });
  ok('6.2 el reingreso vuelve a poner 500 € en el saldo', r.ok === true && near(eur.qty, 500), 'qty=' + eur.qty);
  ok('6.3 y la fila vuelve a estar ACTIVA', !isClosedAsset(eur), 'lifecycleStatus=' + eur.lifecycleStatus);
  ok('6.4 EL DINERO APARECE EN EL PATRIMONIO PUBLICADO (Σ posiciones valoradas)',
     near(totalValueUSD(), 10000 + 500 / usdToEur, 1e-6), 'total=' + totalValueUSD());
  ok('6.5 y sigue siendo reconciliable con sus transacciones', reconciled(eur), 'ledger=' + ledgerBalance(eur));
  // NO-VACUIDAD: sin la reactivación, el saldo existe pero el patrimonio lo ignora.
  const shadow = Object.assign({}, eur, { lifecycleStatus: 'closed' });
  const saved = ASSETS.slice(); ASSETS = [shadow, btc];
  const blind = totalValueUSD(); ASSETS = saved;
  ok('6.6 no-vacuidad · con la fila cerrada el mismo saldo NO se publicaría (' + blind.toFixed(2) + ' USD)',
     near(blind, 10000) && blind < totalValueUSD() - 1);
}

// ── 7 · ELIMINAR UNA POSICIÓN — contrapartida en el ledger ──────────────────
// Eliminar saca valor del patrimonio. Si el ledger no registra la salida, la
// caída se lee como pérdida de mercado: pérdida FABRICADA.
console.log('\n7 — Eliminación de una posición:');
{
  const series = (v0, v1) => [{ ts: T0, value: v0 }, { ts: T0 + H, value: v1 }];
  const pctOf = (pts, fl) => { const c = _aurixTwrChain(pts, fl); return c.values.length ? c.values[c.values.length - 1] - 100 : null; };
  ok('7.1 reproducción · una caída de 500 sin flujo se lee como −5 % de mercado',
     near(pctOf(series(10000, 9500), []), -5, 0.01), 'pct=' + pctOf(series(10000, 9500), []));
  ok('7.2 con la contrapartida registrada, la misma caída es 0 %',
     near(pctOf(series(10000, 9500), [{ ts: T0 + H, amount: -500 }]), 0, 0.01));

  ok('7.3 existe UN owner de la contrapartida de una eliminación, y reutiliza los owners de importe',
     !!removalSrc && /aurixCashOperation\(\s*'withdrawal'/.test(removalSrc) &&
     /assetValueUSD\(asset\)/.test(removalSrc) && /_aurixCaptureFlow\('asset_remove'/.test(removalSrc));
  if (_aurixLedgerAssetRemoval) {
    reset();
    const eur = newCash('EUR', 500, { transactions: [{ type: 'buy', qty: 500, price: 1, ts: T0 - H }] });
    ASSETS.push(eur);
    _aurixLedgerAssetRemoval(eur, T0);
    ok('7.4 eliminar liquidez emite una RETIRADA por el saldo exacto',
       flowsFor(eur.id).length === 1 && flowsFor(eur.id)[0].kind === 'withdrawal' &&
       near(netFlow(eur.id), -500 / usdToEur, 0.005), 'net=' + netFlow(eur.id));
    reset();
    const btc = { id: 'btc', ticker: 'BTC', type: 'crypto', qty: 2, price: 5000, assetCurrency: 'USD', costBasis: 8000, transactions: [] };
    ASSETS.push(btc);
    _aurixLedgerAssetRemoval(btc, T0);
    ok('7.5 eliminar un activo no-cash emite asset_remove por su valor actual',
       flowsFor('btc').length === 1 && flowsFor('btc')[0].kind === 'asset_remove' && near(flowsFor('btc')[0].amountUSD, -10000));
    // ORO FÍSICO: la cantidad son gramos y el precio es por onza troy con pureza
    // aparte. `qty × price` (lo que usa la ruta de venta) diría −240.000.
    reset();
    const gold = { id: 'xau', ticker: 'XAU', type: 'metal', qty: 100, goldUnit: 'g', karat: 18,
                   price: 2400, assetCurrency: 'USD', costBasis: 5000, transactions: [] };
    ASSETS.push(gold);
    const goldValued = assetValueUSD(gold);
    _aurixLedgerAssetRemoval(gold, T0);
    ok('7.5b oro físico · el importe es la CONTRIBUCIÓN VALORADA (' + goldValued.toFixed(2) + ' USD), no qty × price (240.000)',
       flowsFor('xau').length === 1 && near(flowsFor('xau')[0].amountUSD, -goldValued, 0.005) &&
       Math.abs(flowsFor('xau')[0].amountUSD) < 10000, 'flow=' + flowsFor('xau')[0].amountUSD);
    ok('7.5c y ese valorado coincide con lo que el activo aportaba al patrimonio',
       near(goldValued, 100 * _goldPurity(18) * (2400 / OZ_TO_G), 1e-9));
    reset();
    // Divisa sin cobertura FX ⇒ `assetValueUSD` no es finito ⇒ ningún flujo inventado.
    const chf = { id: 'chf-etf', ticker: 'XX', type: 'etf', qty: 10, price: 100, assetCurrency: 'CHF', costBasis: 900, transactions: [] };
    _aurixLedgerAssetRemoval(chf, T0);
    ok('7.5d una valoración no cubierta (divisa sin FX) NO emite flujo alguno',
       !Number.isFinite(assetValueUSD(chf)) && _aurixLoadCapitalFlows().length === 0);
    reset();
    // INMUEBLE: fuera del denominador invertible, así que su valor nunca estuvo en
    // la serie. Registrar su salida restaría 380.000 de una cartera de 20.000.
    const piso = { id: 'casa', ticker: 'CASA', type: 'real_estate', qty: 380000, price: 1,
                   assetCurrency: 'EUR', costBasis: 380000, transactions: [] };
    _aurixLedgerAssetRemoval(piso, T0);
    ok('7.5e eliminar un INMUEBLE no emite flujo (no está en el denominador invertible)',
       !isInvestableAsset(piso) && _aurixLoadCapitalFlows().length === 0, 'flows=' + _aurixLoadCapitalFlows().length);
    ok('7.5f y el perímetro lo decide el owner canónico, no un `type ===` propio',
       /isInvestableAsset\(asset\)/.test(removalSrc) && !/real_estate/.test(stripComments(removalSrc)));
    // RESURRECCIÓN. Una eliminación es REVERSIBLE: el merge de cartera conserva el
    // local cuando tiene más filas (`lc > rc`), así que un activo eliminado en un
    // dispositivo vuelve desde el otro y puede eliminarse otra vez. La salida de
    // capital NO puede contarse dos veces por un solo activo.
    reset();
    const rebtc = { id: 'btc', ticker: 'BTC', type: 'crypto', qty: 2, price: 5000, assetCurrency: 'USD', costBasis: 8000, transactions: [] };
    _aurixLedgerAssetRemoval(rebtc, T0);
    rebtc.price = 6000;                                   // resucita y el mercado se movió
    _aurixLedgerAssetRemoval(rebtc, T0 + 5 * H);
    ok('7.5g eliminar DOS veces el mismo activo (resurrección por sync) emite UNA sola salida',
       flowsFor('btc').length === 1 && near(flowsFor('btc')[0].amountUSD, -10000),
       'flows=' + flowsFor('btc').length + ' net=' + netFlow('btc'));
    ok('7.5h la identidad de la salida está anclada al ACTIVO, no al reloj',
       flowsFor('btc')[0].id === _aurixAssetRemovalFlowId(rebtc) && !/:\d{10,}:/.test(flowsFor('btc')[0].id),
       'id=' + flowsFor('btc')[0].id);
    reset();
    const recash = newCash('EUR', 500, { transactions: [{ type: 'buy', qty: 500, price: 1, ts: T0 - H }] });
    _aurixLedgerAssetRemoval(recash, T0);
    recash.qty = 500; recash.lifecycleStatus = 'active';   // vuelve desde el otro dispositivo
    _aurixLedgerAssetRemoval(recash, T0 + 5 * H);
    ok('7.5i lo mismo para la liquidez: una sola retirada, nunca dos por la misma fila',
       flowsFor(recash.id).length === 1 && near(netFlow(recash.id), -500 / usdToEur, 0.005),
       'flows=' + flowsFor(recash.id).length + ' net=' + netFlow(recash.id));
    reset();
    const ghost = { id: 'ghost', ticker: 'X', type: 'crypto', qty: null, price: 100, assetCurrency: 'USD', costBasis: 0, transactions: [] };
    const closed = newCash('EUR', 0, { lifecycleStatus: 'closed' });
    _aurixLedgerAssetRemoval(ghost, T0);
    _aurixLedgerAssetRemoval(closed, T0);
    ok('7.6 una cantidad no certificable (o un saldo 0) NO fabrica flujo alguno',
       _aurixLoadCapitalFlows().length === 0);
  } else {
    ok('7.4 eliminar liquidez emite una RETIRADA por el saldo exacto', false, '_aurixLedgerAssetRemoval no existe');
    ok('7.5 eliminar un activo no-cash emite asset_remove por su valor actual', false, '_aurixLedgerAssetRemoval no existe');
    ok('7.6 una cantidad no certificable (o un saldo 0) NO fabrica flujo alguno', false, '_aurixLedgerAssetRemoval no existe');
  }

  // Las DOS rutas de eliminación vivas deben usar el owner y un contexto destructivo
  // explícito: sin él, `saveData` bloquea la reducción y `save()` restaura la fila
  // desde disco — la eliminación no persiste.
  const cardRoute = stripComments(slice('const deleteBtn = e.target.closest', 'liquidityClose'));
  const mngRoute  = stripComments(fnSource('_mngDelete'));
  const adsRoute  = stripComments(fnSource('_adsDeleteActive'));
  ok('7.7 la ✕ de la tarjeta emite la contrapartida antes de quitar la fila',
     /_aurixLedgerAssetRemoval\(/.test(cardRoute));
  ok('7.8 y persiste con contexto destructivo explícito (si no, el guard la revierte)',
     /save\('delete-asset'\)/.test(cardRoute) && !/\bsave\(\)\s*;/.test(cardRoute.split('assets = assets.filter')[1] || ''));
  ok('7.9 las OTRAS dos rutas vivas (Gestionar y pantalla de detalle) emiten la misma contrapartida por el mismo owner',
     /_aurixLedgerAssetRemoval\(/.test(mngRoute) && /save\('delete-asset'\)/.test(mngRoute) &&
     /_aurixLedgerAssetRemoval\(/.test(adsRoute) && /save\('delete-asset'\)/.test(adsRoute));
  // Barrido: TODA línea que quita una fila del array por id debe llevar la
  // contrapartida inmediatamente antes. Así una cuarta ruta futura rompe el gate.
  const dropRe = /assets = assets\.filter\(\s*[ax] => [ax]\.id !== \w+\s*\)/g;
  const drops = []; let m;
  while ((m = dropRe.exec(app)) !== null) drops.push(m.index);
  ok('7.11 las TRES rutas de eliminación vivas están cubiertas, y ninguna otra quita una fila sin contrapartida',
     drops.length === 3 && drops.every(i => app.slice(Math.max(0, i - 500), i).indexOf('_aurixLedgerAssetRemoval(') > -1),
     'rutas=' + drops.length);
  ok('7.10 "delete-asset" es un contexto destructivo autorizado del guard de persistencia',
     /_AURIX_DESTRUCTIVE_CONTEXTS = \[[^\]]*'delete-asset'/.test(app));
}

// ── 8 · INVARIANTES TRANSVERSALES ───────────────────────────────────────────
console.log('\n8 — Invariantes transversales:');
{
  const src = fnSource('aurixCashOperation');
  ok('8.1 el owner económico de la liquidez es único y exportado',
     src.length > 0 && /window\.aurixCashOperation = aurixCashOperation/.test(app));
  // Tres entradas de UI (alta de liquidez, "+" y "−" contextuales) + la
  // contrapartida de una eliminación. Ninguna hace aritmética por su cuenta.
  ok('8.2 cuatro call sites en producto, todos delegando (ninguna aritmética en la UI)',
     (stripComments(app).match(/aurixCashOperation\('(deposit|withdrawal)'/g) || []).length === 4 &&
     /_aurixLedgerAssetRemoval[\s\S]{0,600}aurixCashOperation\('withdrawal'/.test(app));
  ok('8.3 edit/delete de liquidez NO están cableados a la UI (no se abren en este bloque)',
     !/aurixCashOperation\('(edit|delete)'/.test(app));
  ok('8.4 el asiento de apertura no puede confundirse con una operación manual: el historial de transacciones NO se muestra para cash',
     /if \(isRE \|\| isCash\) \{\s*txSection\.style\.display = 'none';/.test(app));
  ok('8.5 la apertura queda marcada (`opening: true`) para poder distinguirla siempre',
     /opening: true/.test(src));
  ok('8.6 el precio de la liquidez es siempre 1 (nunca una cotización)', /asset\.price = 1;/.test(src));
  ok('8.7 sin clamps ni Math.abs sobre el saldo en el owner',
     !/Math\.abs\(Number\(asset\.qty/.test(src) && !/Number\(asset\.qty\s*\|\|\s*0\)\s*<\s*0/.test(src));
  ok('8.8 la cantidad no certificable sigue siendo fail-closed en el total publicado',
     /Number\.isFinite\(_aurixUsableQuantity\(a && a\.qty\)\)/.test(fnSource('totalValueUSD')) &&
     !Number.isFinite(_aurixUsableQuantity(null)) && !Number.isFinite(_aurixUsableQuantity(-3)) &&
     !Number.isFinite(_aurixUsableQuantity(true)));
  ok('8.9 un depósito nunca entra en valor sin entrar en coste (P&L no lo lee como plusvalía)',
     /asset\.costBasis = Math\.max\(0, \+\(Number\(asset\.costBasis \|\| 0\) \+ signed\)/.test(src));
  // Cierre del sistema: patrimonio = Σ posiciones valoradas, sin duplicar dinero.
  reset();
  const eur = newCash('EUR', 1000, { transactions: [{ type: 'buy', qty: 1000, price: 1, ts: T0 - H }] });
  const btc = { id: 'btc', ticker: 'BTC', type: 'crypto', qty: 1, price: 10000, assetCurrency: 'USD', costBasis: 10000, transactions: [] };
  ASSETS.push(eur, btc);
  cashOp('deposit', { asset: eur, amount: 500, currency: 'EUR', ts: T0 });
  const sum = activeAssets().reduce((s, a) => s + assetValueUSD(a), 0);
  ok('8.10 PORTFOLIO VALUE = Σ posiciones valoradas, sin contrapartida ficticia',
     near(totalValueUSD(), sum, 1e-9) && near(totalValueUSD(), 10000 + 1500 / usdToEur, 1e-6), 'total=' + totalValueUSD());
  ok('8.11 y el flujo externo del depósito aparece UNA sola vez en el ledger',
     _aurixLoadCapitalFlows().length === 1);
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
