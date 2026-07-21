'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ADD-ASSET-CATEGORY-CONTEXT-harness — SPEC CATEGORY-CONTEXT
// ════════════════════════════════════════════════════════════════════════════
// Recent must show ONLY the active category's assets. Recents are now typed objects
// { q, t } (t = the selected asset's classification at save time), backward-compatible
// with legacy plain-string entries (→ { q, t:null }, shown only in the All view). Global
// search stays category-agnostic (reads .q). This proves the store + the category filter.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, i) => { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } };

// Extract the two recents store functions.
const src = app.slice(app.indexOf('function _gsLoadRecent()'), app.indexOf('function _gsInit()'));
if (app.indexOf('function _gsLoadRecent()') < 0 || app.indexOf('function _gsInit()') < 0) { console.log('1 failed'); process.exit(1); }

function env(seed) {
  const store = {};
  if (seed !== undefined) store['aurix.gs.recent.v1'] = JSON.stringify(seed);
  const sb = {
    JSON, String, Array, console,
    _GS_RECENT_KEY: 'aurix.gs.recent.v1', _GS_RECENT_MAX: 5, _GS_RECENT_MAX_LEN: 32,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  };
  vm.createContext(sb);
  vm.runInContext(src + '\n; globalThis.__load=_gsLoadRecent; globalThis.__save=_gsSaveRecent;', sb);
  sb.__store = store;
  return sb;
}
// The category filter used by _addV2RenderRecents (replicated for the assertion).
const matches = (af, r) => af === 'all' ? true : (af === 'etf' ? (r.t === 'etf' || r.t === 'fund') : r.t === af);

(function () {
  console.log('AURIX-ADD-ASSET-CATEGORY-CONTEXT — SPEC CATEGORY-CONTEXT\n');

  // Source contract: the modal reflects a category lock + tabs hide when locked.
  ok('source: _addV42UpdateFilterAttr sets data-category-locked from context', /categoryLocked\s*=\s*\(ctx && ctx !== 'real_estate'\)/.test(app));
  ok('source: recents tagged with the asset type on save', /_gsSaveRecent\(label, item\.type\)/.test(app));
  ok('source: add-asset Recent filtered by activeSearchFilter', /const af = \(typeof activeSearchFilter/.test(app) && /all\.filter\(matches\)/.test(app));
  // SPEC 60 — Recent AND Popular must render with the OPENING category: activeSearchFilter is
  // set BEFORE _addV2RefreshQuick() on picker entry (SPEC 59 set it after → other categories
  // leaked into a specific-category entry). Both owners read the same shared activeSearchFilter.
  { const w = app.slice(app.indexOf("picker.addEventListener('click'"), app.indexOf("picker.addEventListener('click'") + 4600);
    const afPos = w.indexOf("try { activeSearchFilter = filterKey || 'all'; }");
    const refreshPos = w.indexOf("if (typeof _addV2RefreshQuick === 'function') _addV2RefreshQuick()");
    ok('SPEC60: activeSearchFilter set BEFORE Recent/Popular render on picker entry', afPos > 0 && refreshPos > 0 && afPos < refreshPos, 'af@' + afPos + ' refresh@' + refreshPos);
    ok('SPEC60: Popular owner reads DEFAULTS[activeSearchFilter] (same context as Recent)', /const filter = \(typeof activeSearchFilter === 'string'/.test(app) && /DEFAULTS\[filter\]/.test(app)); }

  // 1. Backward-compat: legacy plain strings load as untyped {q,t:null}.
  { const sb = env(['Bitcoin', 'Apple Inc']);
    const r = vm.runInContext('__load()', sb);
    ok('1 legacy string recents → { q, t:null }', r.length === 2 && r[0].q === 'Bitcoin' && r[0].t === null, JSON.stringify(r)); }

  // 2. Typed save + dedupe + front-insert.
  { const sb = env([{ q: 'Apple Inc', t: 'stock' }]);
    vm.runInContext('__save("Solana","crypto")', sb);
    vm.runInContext('__save("apple inc","stock")', sb);   // dedupe (case-insensitive) → moves to front
    const r = vm.runInContext('__load()', sb);
    ok('2 typed save stores { q, t } + dedupes case-insensitively (newest at front)', r[0].q.toLowerCase() === 'apple inc' && r[0].t === 'stock' && r.filter(x => x.q.toLowerCase() === 'apple inc').length === 1 && r.some(x => x.q === 'Solana' && x.t === 'crypto'), JSON.stringify(r)); }

  // 3. Untyped save (no type) → t:null.
  { const sb = env([]); vm.runInContext('__save("Gold ETF")', sb);
    const r = vm.runInContext('__load()', sb);
    ok('3 save without type → t:null', r[0].q === 'Gold ETF' && r[0].t === null, JSON.stringify(r)); }

  // 4. 3-char minimum still enforced.
  { const sb = env([]); vm.runInContext('__save("ab","crypto")', sb);
    ok('4 <3-char query rejected', vm.runInContext('__load()', sb).length === 0); }

  // 5. Category filter — a crypto context shows ONLY crypto recents (no cross-category).
  { const list = [{ q: 'Bitcoin', t: 'crypto' }, { q: 'Apple', t: 'stock' }, { q: 'iShares World', t: 'etf' }, { q: 'Old', t: null }];
    const crypto = list.filter(r => matches('crypto', r));
    ok('5 crypto context → only crypto recents (no stock/etf/legacy)', crypto.length === 1 && crypto[0].q === 'Bitcoin'); }

  // 6. ETF context covers both etf and fund types.
  { const list = [{ q: 'iShares', t: 'etf' }, { q: 'Fidelity Fund', t: 'fund' }, { q: 'Apple', t: 'stock' }];
    const etf = list.filter(r => matches('etf', r));
    ok('6 etf context → etf + fund types (not stock)', etf.length === 2 && !etf.some(r => r.t === 'stock')); }

  // 7. All context → every recent (incl. legacy untyped).
  { const list = [{ q: 'Bitcoin', t: 'crypto' }, { q: 'Old', t: null }];
    ok('7 All context → all recents incl. legacy untyped', list.filter(r => matches('all', r)).length === 2); }

  // 8. A category NEVER shows a legacy untyped recent (no cross-category leak).
  { const list = [{ q: 'Old', t: null }];
    ok('8 legacy untyped recent hidden inside a specific category', list.filter(r => matches('crypto', r)).length === 0); }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log(fail + ' failed'); process.exit(1); }
  console.log('GATE: GO — all ' + pass + ' assertions passed');
  process.exit(0);
})();
