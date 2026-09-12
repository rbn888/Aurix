'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-EXPORT-DISABLED-harness — SPEC 67 (desactivar temporalmente "Exportar datos")
// ════════════════════════════════════════════════════════════════════════════
// "Exportar datos" must stay VISIBLE and in the same place/design, shown as disabled/"Próximamente",
// with NO export interaction and NO call into the export flow while disabled. The export code
// (exportPortfolioBackup) must remain intact (not removed). Read-only source assertions.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const app  = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function braceSlice(src, startIdx) { let k = src.indexOf('{', startIdx), d = 0; for (; k < src.length; k++) { const c = src[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return src.slice(startIdx, k); }
function fnSrc(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing fn ' + name); return braceSlice(app, i); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

console.log('AURIX-EXPORT-DISABLED — SPEC 67\n');

// The export button block in index.html.
const btnIdx = html.indexOf('id="settingsExportBtn"');
const btnBlock = btnIdx >= 0 ? html.slice(html.lastIndexOf('<button', btnIdx), html.indexOf('</button>', btnIdx) + 9) : '';

ok('1 export option STILL PRESENT (visible, same place)', btnIdx >= 0 && /class="settings-action"/.test(btnBlock));
ok('2 export label unchanged ("Exportar datos")', /data-i18n="settingsExport"/.test(btnBlock));
ok('3 export button is DISABLED', /id="settingsExportBtn"\s+disabled/.test(html));
// M.06 · BLOQUE 12/13 — este assert fijaba como CONTRATO que el subtítulo de Exportar
// REUTILIZARA `settingsImportSub`, la clave de otra acción. El texto renderizado era
// correcto en los dos idiomas, así que no había defecto visible; pero el día que Importar
// se habilite y su subtítulo cambie, el de Exportar cambiaría CON ella, en silencio. Ahora
// cada acción usa `settingsComingSoon`, una clave NEUTRA propia, y `settingsExportSub`
// sigue reservada para cuando Exportar se reactive (ver assert 5).
ok('4 shown as "Próximamente" via a NEUTRAL key (not another action\'s)',
   /data-i18n="settingsComingSoon"/.test(btnBlock) && !/data-i18n="settingsExportSub"/.test(btnBlock) &&
   !/data-i18n="settingsImportSub"/.test(btnBlock));

// The Settings click handler must NOT invoke the export flow while disabled.
const handlerHasExportCall = /#settingsExportBtn'\)\)\s*\{[\s\S]{0,240}exportPortfolioBackup\(\)/.test(app);
ok('5 click handler does NOT call exportPortfolioBackup() while disabled', !handlerHasExportCall);
ok('6 export handler branch still exists (guarded no-op return)', /e\.target\.closest\('#settingsExportBtn'\)\)\s*\{[\s\S]{0,700}return;/.test(app));

// The export code itself must remain intact (SPEC: do not remove).
ok('7 exportPortfolioBackup() still DEFINED (code intact, not removed)', /function exportPortfolioBackup\(/.test(app) && fnSrc('exportPortfolioBackup').length > 40);

// The rest of Settings data section is untouched (reset + import still there).
ok('8 rest of Settings untouched (reset + import buttons present)', /id="settingsResetBtn"/.test(html) && /id="settingsImportBtn"/.test(html));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
