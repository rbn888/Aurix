'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ONBOARDING-LIQUIDITY-MODAL-STACKING-harness — HOTFIX P0
// ════════════════════════════════════════════════════════════════════════════
// The "Añadir liquidez" modal opened during onboarding rendered BEHIND the onboarding overlay.
// ROOT CAUSE: the add-asset picker hands off to the liquidity FORM by closing itself and opening
// #liquidityOverlay in the same tick; the onboarding close-handoff MutationObserver re-mounted the
// onboarding overlay (z-index 250) the instant the picker closed → in front of the liquidity modal
// (z-index 100) + a double overlay. FIX (two independent guarantees):
//   1. the observer watches BOTH #modalOverlay AND #liquidityOverlay and only re-mounts onboarding
//      when NEITHER add-flow modal is open (the batched callback sees liquidity already open);
//   2. #liquidityOverlay z-index is raised ABOVE #onboardingOverlay so the modal + backdrop always
//      render in front, even if some other path re-mounts onboarding while liquidity is open.
// Read-only source/CSS assertions.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }
function zOf(sel) { const m = new RegExp(sel.replace(/[.#]/g, '\\$&') + '\\s*\\{[^}]*?z-index:\\s*(\\d+)').exec(css); return m ? parseInt(m[1], 10) : null; }

console.log('AURIX-ONBOARDING-LIQUIDITY-MODAL-STACKING — HOTFIX P0\n');

// ── 1 z-index stacking guarantee ─────────────────────────────────────────────
console.log('1 — stacking (liquidity modal above onboarding):');
const zOnb = zOf('#onboardingOverlay');
const zLiq = zOf('#liquidityOverlay');
ok('1.1 #onboardingOverlay has a z-index', Number.isFinite(zOnb), 'z=' + zOnb);
ok('1.2 #liquidityOverlay has a z-index', Number.isFinite(zLiq), 'z=' + zLiq);
ok('1.3 liquidity z-index > onboarding z-index (renders in front)', Number.isFinite(zLiq) && Number.isFinite(zOnb) && zLiq > zOnb, 'liq=' + zLiq + ' onb=' + zOnb);

// ── 2 onboarding close-handoff observer no longer re-mounts during the liquidity handoff ──
console.log('2 — onboarding re-mount handoff (watches both overlays):');
// Isolate the observer block for precise assertions.
const blockStart = app.indexOf('// ── Add-asset modal close handoff');
const block = blockStart >= 0 ? app.slice(blockStart, blockStart + 3200) : '';
ok('2.1 observer references the liquidity overlay', /getElementById\('liquidityOverlay'\)/.test(block));
ok('2.2 re-mount gated on NEITHER add-flow modal open (anyFlowOpen guard)', /anyFlowOpen/.test(block) && /if \(anyFlowOpen\) return;/.test(block));
ok('2.3 anyFlowOpen considers BOTH modalOverlay and liquidityOverlay', /_addAssetOv && _addAssetOv\.classList\.contains\('open'\)/.test(block) && /_liquidityOv && _liquidityOv\.classList\.contains\('open'\)/.test(block));
ok('2.4 observes the liquidity overlay for class changes', /mo\.observe\(_liquidityOv,\s*\{ attributes: true, attributeFilter: \['class'\] \}\)/.test(block));
ok('2.5 still re-mounts onboarding when the flow is dismissed (continuation intact)', /awaitingAsset = false;[\s\S]{0,420}_openOnboardingOverlay\(\)/.test(block));
ok('2.6 awaitingAsset single-use guard preserved', /if \(!awaitingAsset\) return;/.test(block));

// ── 3 no collateral changes ──────────────────────────────────────────────────
console.log('3 — scope guard (liquidity logic + onboarding steps untouched):');
ok('3.1 openLiquidityModal still opens the same overlay (logic untouched)', /liquidityOverlay\.classList\.add\('open'\)/.test(app));
ok('3.2 onboarding overlay z-index unchanged (250)', zOnb === 250, 'z=' + zOnb);

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
