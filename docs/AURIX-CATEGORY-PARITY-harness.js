'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CATEGORY-PARITY-harness — SPEC 68 (VALIDACIÓN FUNCIONAL DE TODAS LAS CATEGORÍAS)
// ════════════════════════════════════════════════════════════════════════════
// Every asset category must behave identically: no invisible assets, no wealth/chart desync between
// the card an asset shows in and the chart that card draws. THE invariant that guarantees this:
//
//   for every stored asset type T:
//     _aurixCategoryBucket({type:T})  ∈  _categoryBucketsForType( _aurixDisplayCategory(T) )
//     AND  _aurixDisplayCategory(T) is a REAL card (present in TYPE_META)
//
// i.e. the history bucket an asset's value lands in is ALWAYS included in the chart of the category
// card the asset is listed under. This is the exact property that the fund bug (SPEC 66) and the
// commodity bug (SPEC 68) violated. Read-only: runs the three real taxonomy functions in a sandbox.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function braceSlice(startIdx) { let k = app.indexOf('{', startIdx), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(startIdx, k); }
function fnSrc(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing fn ' + name); return braceSlice(i); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

// Sandbox with the REAL TYPE_META keys (crypto/stock/etf/metal/cash/real_estate/other — NO fund, NO commodity).
const TYPE_META_KEYS = ['crypto', 'stock', 'etf', 'metal', 'cash', 'real_estate', 'other'];
const ctx = { TYPE_META: {}, String, Array, Number };
TYPE_META_KEYS.forEach(k => { ctx.TYPE_META[k] = { label: k }; });
vm.createContext(ctx);
vm.runInContext(fnSrc('_aurixDisplayCategory'), ctx);
vm.runInContext(fnSrc('_aurixCategoryBucket'), ctx);
vm.runInContext(fnSrc('_categoryBucketsForType'), ctx);
const disp   = t => vm.runInContext('_aurixDisplayCategory', ctx)(t);
const bucket = t => vm.runInContext('_aurixCategoryBucket', ctx)({ type: t });
const chart  = c => vm.runInContext('_categoryBucketsForType', ctx)(c);

console.log('AURIX-CATEGORY-PARITY — SPEC 68\n');

// Every asset type that can be created/stored across the app (search catalogs, manual add, gold, cash,
// legacy/index). The invariant must hold for ALL of them.
const TYPES = ['crypto', 'stock', 'etf', 'fund', 'metal', 'commodity', 'real_estate', 'cash', 'other', 'index', ''];

console.log('1 — display category is always a REAL card (no asset lands in a phantom category):');
TYPES.forEach(t => {
  const d = disp(t);
  ok(`1 "${t || '(empty)'}" → card "${d}" exists in TYPE_META`, TYPE_META_KEYS.indexOf(d) >= 0, 'display=' + d);
});

console.log('\n2 — wealth/chart PARITY (asset\'s history bucket is inside its card\'s chart):');
TYPES.forEach(t => {
  const d = disp(t), b = bucket(t), ch = chart(d);
  ok(`2 "${t || '(empty)'}" bucket "${b}" ∈ chart(${d})=[${ch}]`, ch.indexOf(b) >= 0, 'bucket=' + b + ' chart=' + JSON.stringify(ch));
});

console.log('\n3 — the two known folds are correct (regression locks):');
ok('3.1 fund folds to etf (SPEC 66)', disp('fund') === 'etf');
ok('3.2 commodity folds to metal (SPEC 68)', disp('commodity') === 'metal');
ok('3.3 commodity bucket (metal) is inside the Metales chart', chart(disp('commodity')).indexOf(bucket('commodity')) >= 0);

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
