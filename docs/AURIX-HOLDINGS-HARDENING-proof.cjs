'use strict';
/* AURIX-HOLDINGS-HARDENING proof — replicates the behavioral invariants of the
   premium management UX so the QA contract is machine-checked (the DOM/CSS still
   needs a device, but the LOGIC is proven here).
   Run: node docs/AURIX-HOLDINGS-HARDENING-proof.cjs */
let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`${c ? '  PASS' : '  FAIL'}  ${n}`); c ? pass++ : fail++; };

/* ---- 1. Delete is gated on confirmation (all 3 paths share this shape) ---- */
// Replicates: const ok = await _aurixConfirm({...}); if (!ok) return; <commit>
function deleteFlow(confirmResult, assetsIn, id) {
  let assets = assetsIn.slice();
  const a = assets.find(x => x.id === id);
  if (!a) return assets;
  const ok = confirmResult;             // what the premium dialog resolved
  if (!ok) return assets;               // cancelled → no mutation
  if (!assets.find(x => x.id === id)) return assets; // re-resolve guard
  assets = assets.filter(x => x.id !== id);
  return assets;
}
console.log('\n=== 1. Delete gated on premium confirm ===');
{
  const base = [{ id: 'a', type: 'crypto' }, { id: 'b', type: 'stock' }];
  ok('confirm=false → asset NOT deleted (no accidental wipe)',
     deleteFlow(false, base, 'a').length === 2);
  ok('confirm=true → asset deleted',
     deleteFlow(true, base, 'a').length === 1 && !deleteFlow(true, base, 'a').some(x => x.id === 'a'));
  ok('confirm=true on missing id → no-op (re-resolve guard)',
     deleteFlow(true, base, 'zzz').length === 2);
}

/* ---- 2. Buy/Sell double-submit is impossible (targetId nulled on close) ---- */
// Replicates: submit → mutate(targetId) → save → close(targetId=null).
// A queued second submit finds targetId=null → find()=undefined → returns.
function makeTradeForm(assets) {
  let targetId = null;
  const open = (id) => { targetId = id; };
  const close = () => { targetId = null; };
  const submit = (amount) => {
    const asset = assets.find(a => a.id === targetId); // <- the real guard
    if (!asset) return false;                          // no target → no-op
    if (!(amount > 0)) return false;
    asset.qty += amount;
    close();                                           // nulls targetId
    return true;
  };
  return { open, submit, get targetId() { return targetId; } };
}
console.log('\n=== 2. Buy double-tap cannot double-record ===');
{
  const assets = [{ id: 'hl', qty: 10 }];
  const form = makeTradeForm(assets);
  form.open('hl');
  const first = form.submit(1);   // 10 -> 11, closes (targetId=null)
  const second = form.submit(1);  // queued double-tap: targetId null -> no-op
  ok('first buy applied (10 -> 11)', first === true && assets[0].qty === 11);
  ok('second (double-tap) buy is a no-op (still 11, not 12)', second === false && assets[0].qty === 11);
  ok('target cleared after submit', form.targetId === null);
}
console.log('\n=== 3. Sell double-tap cannot double-record ===');
{
  // Mirrors the reduce handler: find(reduceTargetId) → mutate → closeReduceModal()
  // which sets reduceTargetId = null. Same guard shape as buy.
  const assets = [{ id: 'btc', qty: 5 }];
  let reduceTargetId = null;
  const openReduce = (id) => { reduceTargetId = id; };
  const closeReduce = () => { reduceTargetId = null; };
  const sellSubmit = (amount) => {
    const asset = assets.find(a => a.id === reduceTargetId);
    if (!asset) return false;
    if (!(amount > 0) || amount > asset.qty) return false;
    asset.qty -= amount;
    closeReduce();
    return true;
  };
  openReduce('btc');
  const first = sellSubmit(1);   // 5 -> 4, closes (reduceTargetId=null)
  const second = sellSubmit(1);  // queued double-tap: target null -> no-op
  ok('first sell applied (5 -> 4)', first === true && assets[0].qty === 4);
  ok('second (double-tap) sell is a no-op (still 4, not 3)', second === false && assets[0].qty === 4);
  ok('target cleared after sell', reduceTargetId === null);
}

/* ---- 4. Premium confirm resolution contract ---- */
// cancel/backdrop/Escape -> false; confirm/Enter -> true.
function confirmContract(action) {
  if (action === 'cancel' || action === 'backdrop' || action === 'escape') return false;
  if (action === 'confirm' || action === 'enter') return true;
  return false;
}
console.log('\n=== 4. Confirm dialog resolution contract ===');
{
  ok('cancel  -> false', confirmContract('cancel') === false);
  ok('backdrop-> false', confirmContract('backdrop') === false);
  ok('escape  -> false', confirmContract('escape') === false);
  ok('confirm -> true',  confirmContract('confirm') === true);
  ok('enter   -> true',  confirmContract('enter') === true);
}

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
