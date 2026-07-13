'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ASSET-FLOW-STATE-ISOLATION-harness — SPEC 45 (asset-flow half)
// ════════════════════════════════════════════════════════════════════════════
// The shared add-asset modal leaked state between categories: selectedDbAsset + the preview
// (_addV4RenderPreview) were only reset in openModal()/clearSelectedAsset(), and NEITHER was called on an
// in-modal category switch (picker route OR filter bar) — so Metales showed Bitcoin, Crypto showed Apple,
// and a stale preview/selection/search survived. Fix: one _addV2ResetForCategory() invoked at BOTH
// category-switch chokepoints. This harness proves (source-level) the reset exists, is wired at both
// chokepoints, isolates every leak-prone var, keeps the flows correct (Liquidity own flow, RE clears,
// preview follows the active selection), touches no data/model/calc, and the dropdown stays custom Aurix.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing ' + n); return braceSlice(app, i); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const reset = fnSrc('_addV2ResetForCategory');
// the picker click handler + filter-btn handler bodies (locate by anchor)
const pickerH = app.slice(app.indexOf("picker.addEventListener('click'"), app.indexOf("picker.addEventListener('click'") + 1500);
const filterH = app.slice(app.indexOf('filterBtns.forEach(btn => {'), app.indexOf('filterBtns.forEach(btn => {') + 2200);

console.log('\nAURIX-ASSET-FLOW-STATE-ISOLATION — SPEC 45');

// ── 0 single reset owner ─────────────────────────────────────────────────────
ok('0 _addV2ResetForCategory single owner', (app.match(/^function _addV2ResetForCategory\(/gm) || []).length === 1);

// ── 1 reset isolates EVERY leak-prone var (selection, preview, suggestions, search) ─
ok('1 reset clears the selected asset + preview (via clearSelectedAsset)', /clearSelectedAsset\(\)/.test(reset));
ok('1 reset closes the suggestions dropdown', /closeSuggestions\(\)/.test(reset));
ok('1 reset empties suggestion caches + focus index', /currentSuggestions = \[\]/.test(reset) && /renderedSuggestions = \[\]/.test(reset) && /focusedSuggIdx = -1/.test(reset));
ok('1 reset clears the search input', /searchInput\.value = ''/.test(reset));
ok('1 reset exits manual mode if active', /isManualMode && typeof exitManualMode/.test(reset));

// ── 2 wired at the PICKER category-switch chokepoint (after liquidity return, before metal/asset) ─
ok('2 picker calls _addV2ResetForCategory on every category switch', /_addV2ResetForCategory\(\);/.test(pickerH));
ok('2 …AFTER the liquidity early-return, BEFORE the metal/asset routes', pickerH.indexOf("pick === 'liquidity'") < pickerH.indexOf('_addV2ResetForCategory();') && pickerH.indexOf('_addV2ResetForCategory();') < pickerH.indexOf("pick === 'metal'"));

// ── 3 wired at the FILTER-BAR chokepoint (non-RE category switch clears the selection) ─
ok('3 filter-bar clears the prior selection on a non-RE category switch', filterH.indexOf("else { try { if (typeof clearSelectedAsset === 'function') clearSelectedAsset()") >= 0 && filterH.indexOf('if (isRealEstateMode) enterSearchMode();') >= 0);
ok('3 the typed query is kept for re-search under the new filter (not wiped by clearSelectedAsset)', filterH.indexOf('const q = searchInput.value.trim();') >= 0 && fnSrc('clearSelectedAsset').indexOf("searchInput.value = ''") < 0);

// ── 4 Liquidity opens its OWN flow directly (never the selector / success) ───
ok('4 liquidity → closeModal() + openLiquidityModal() + return (own flow)', /if \(pick === 'liquidity'\) \{\s*closeModal\(\);\s*if \(typeof openLiquidityModal === 'function'\) openLiquidityModal\(\);\s*return;/.test(pickerH));

// ── 5 Real estate route initializes clean (enterRealEstateMode → clearSelectedAsset) ─
ok('5 RE route enters its own mode', /pick === 'real_estate'[\s\S]{0,140}enterRealEstateMode\(\)/.test(pickerH));
ok('5 enterRealEstateMode clears the selection', /clearSelectedAsset\(\)/.test(fnSrc('enterRealEstateMode')));

// ── 6 PREVIEW belongs to the active category (reads selectedDbAsset; empty when none) ─
(function () { const pv = fnSrc('_addV4RenderPreview');
  ok('6 preview renders from selectedDbAsset', /selectedDbAsset/.test(pv));
  ok('6 preview shows the empty placeholder when no selection (no stale asset)', /empty\.hidden = false/.test(pv) && /body\.hidden\s*=\s*true/.test(pv)); })();

// ── 7 reset is UX/state ONLY — no data / model / calc / portfolio / API touch ─
ok('7 reset touches no data/model/calc/portfolio/supabase', !/\bassets\b|\.push\(|supabase|portfolio|valuation|computeSnapshot|categoryHistory/.test(reset));

// ── 8 dropdown stays a CUSTOM Aurix component (not a native/browser <select>) ─
ok('8 results dropdown is a custom .asset-suggestions div', /id="assetSuggestions"/.test(html) && /class="asset-suggestions"/.test(html));
ok('8 no native <select> in the add-asset form', !/<select[\s>]/.test(html.slice(html.indexOf('id="addV2Picker"'), html.indexOf('id="assetSuggestions"') + 4000)));

// ── 9 regression: openModal still does the full clean-state reset (fresh open per category) ─
(function () { const om = fnSrc('openModal');
  ok('9 openModal full reset intact (selectedDbAsset null + caches + search cleared)', /selectedDbAsset\s*=\s*null/.test(om) && /currentSuggestions\s*=\s*\[\]/.test(om) && /searchInput\.value\s*=\s*''/.test(om)); })();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ASSET-FLOW-STATE-ISOLATION (SPEC 45) — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
