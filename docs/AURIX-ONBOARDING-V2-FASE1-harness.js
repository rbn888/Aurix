'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ONBOARDING-V2-FASE1-harness — premium category selector + Liquidez form fix (shared picker)
// ════════════════════════════════════════════════════════════════════════════
// FASE 1 (crítica): "Activo de inversión" → Acciones/Criptomonedas/Fondos·ETF; "Oro físico" → "Metales";
// premium 7-card selector; search only AFTER a category (Step 2); Liquidez routes to a FORM (openLiquidityModal),
// never straight to the success screen. Shared by onboarding first-asset + the dashboard "+" add modal.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} }
// the add-v2 picker grid section of index.html
const grid = (function(){ const i=html.indexOf('<div class="add-v2-grid">'); const j=html.indexOf('</div>', i); return html.slice(i, j+6); })();

console.log('AURIX-ONBOARDING-V2-FASE1 — premium category selector + Liquidez form\n');

console.log('The 7 premium category cards (and the generic "asset" card is gone):');
['stocks','crypto','fund','metal','liquidity','real_estate','other'].forEach(p =>
  ok('1 picker card data-pick="'+p+'" present', new RegExp('data-pick="'+p+'"').test(grid)));
ok('2 "Activo de inversión" generic card REMOVED from the picker (no data-pick="asset")', !/data-pick="asset"/.test(grid));
ok('3 "Oro físico" card REMOVED (replaced by Metales: no data-pick="gold")', !/data-pick="gold"/.test(grid));
ok('4 "Otros activos" is disabled (coming soon)', /data-pick="other"[^>]*\bdisabled\b/.test(grid));

console.log('\ni18n — new category labels (ES + EN), Oro→Metales:');
ok('5 ES: Acciones/Criptomonedas/Fondos·ETF/Metales/Liquidez/Inmuebles/Otros',
   /addV2_pick_stocks_title:\s*'Acciones'/.test(app) && /addV2_pick_crypto_title:\s*'Criptomonedas'/.test(app) &&
   /addV2_pick_fund_title:\s*'Fondos \/ ETF'/.test(app) && /addV2_pick_metal_title:\s*'Metales'/.test(app) &&
   /addV2_pick_re_title:\s*'Inmuebles'/.test(app) && /addV2_pick_other_title:\s*'Otros activos'/.test(app));
ok('6 EN: Stocks/Crypto/Funds·ETF/Metals',
   /addV2_pick_stocks_title:\s*'Stocks'/.test(app) && /addV2_pick_crypto_title:\s*'Crypto'/.test(app) &&
   /addV2_pick_fund_title:\s*'Funds \/ ETF'/.test(app) && /addV2_pick_metal_title:\s*'Metals'/.test(app));
ok('7 "Oro físico"/"Physical gold" no longer the metal label (Metales/Metals)',
   !/addV2_pick_gold_title:\s*'Oro físico'/.test(app) && !/addV2_pick_gold_title:\s*'Physical gold'/.test(app) &&
   /addV2_pick_metal_sub:\s*'Oro, plata, lingotes, monedas y joyería'/.test(app));

console.log('\nRouting — each category routes correctly (in-place, modal not re-opened):');
const wire = app.slice(app.indexOf("picker.addEventListener('click'"), app.indexOf("picker.addEventListener('click'") + 3000);
ok('8 Liquidez → openLiquidityModal (a FORM), never the success screen',
   /if \(pick === 'liquidity'\) \{[\s\S]*?openLiquidityModal\(\)/.test(wire) && /function openLiquidityModal/.test(app) && /liquidityQtyInput/.test(app));
ok('9 Metales → metal picker sheet (choose Oro/Plata first, not straight to gold)',
   /if \(pick === 'metal' \|\| pick === 'gold'\) \{[\s\S]*?_addV2Activate\('metal-picker'\)/.test(wire));
ok('10 Acciones/Criptomonedas/Fondos → asset surface with the matching filter pre-engaged',
   /const filterKey = \{ stocks: 'stock', crypto: 'crypto', fund: 'etf', asset: null \}\[pick\];/.test(wire) &&
   /\.filter-btn\[data-filter="' \+ filterKey \+ '"\]/.test(wire));
ok('11 Inmuebles → real_estate form', /if \(pick === 'real_estate'\) \{[\s\S]*?enterRealEstateMode/.test(wire));

console.log('\nSearch only AFTER a category (Step 2) — no search box on the selector itself:');
ok('12 the picker grid contains NO search input (search lives in the form step)',
   !/<input[^>]*search/i.test(grid) && !/type="search"/.test(grid) && !/searchInput/.test(grid));
ok('13 financial picks activate the FORM step (where the search lives), not the picker',
   /_addV2Activate\('form'\)/.test(wire));

console.log('\nNo regression — existing add flows + contextual modal intact:');
ok('14 openContextualModal (FAB / category entry points) + metal picker + RE flow unchanged',
   /function openContextualModal\(type\)/.test(app) && /function _aurixRenderMetalPicker/.test(app) && /function enterRealEstateMode/.test(app));
ok('15 selectAsset / openModal / closeModal still present (add Bitcoin/Apple/ETF/metal/RE/liquidez unaffected)',
   /function selectAsset\(/.test(app) && /function openModal\(/.test(app) && /function closeModal\(/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
