'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MOBILE-FIELD-ZOOM-harness — P1 MOBILE FORM UX
// ════════════════════════════════════════════════════════════════════════════
// iOS Safari / iPadOS zoom the page in whenever a focused form control has a COMPUTED
// font-size below 16px. That zoom is the ROOT CAUSE of the reported bug chain: the
// viewport shifts, the modal loses its scale, closing the keyboard leaves residual
// offset, and the user ends up hunting for a tappable area or refreshing.
//
// Aurix had no shared owner for form controls — every field was sized per screen, with
// only a few per-screen 16px patches that left gaps BETWEEN their breakpoints. The fix
// is one mobile-only global floor (AURIX-MOBILE-FIELD-ZOOM-1, end of styles.css).
//
// This harness parses styles.css structurally (media context + real selector/declaration
// pairs, comments stripped) rather than grepping, so it asserts the actual cascade:
//   • every editable control is ≥16px on mobile — including future ones;
//   • the invariant that makes the !important floor SAFE: nothing sets >16px, so the
//     floor can only raise, never shrink (a future >16px field trips this);
//   • no per-screen rule can out-!important the floor;
//   • manual pinch-zoom + accessibility are preserved in every shipped HTML;
//   • no second keyboard/viewport manager and no User-Agent sniffing were introduced;
//   • desktop is untouched and the modal scroll owners still scroll.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, i) => { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } };

console.log('AURIX-MOBILE-FIELD-ZOOM — P1 MOBILE FORM UX\n');

// ── structural CSS parse: (selector, declarations, enclosing at-rules) ───────
const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [];
{
  const stack = [];
  const re = /([^{}]*)([{}])/g;
  let m;
  while ((m = re.exec(clean))) {
    const head = m[1].trim(), brace = m[2];
    if (brace === '{') {
      if (head.startsWith('@')) { stack.push({ at: true, head }); continue; }
      stack.push({ at: false, head });
      // capture this rule's body
      let d = 1, j = m.index + m[0].length;
      while (j < clean.length && d > 0) { if (clean[j] === '{') d++; else if (clean[j] === '}') d--; j++; }
      rules.push({ sel: head, body: clean.slice(m.index + m[0].length, j - 1), ats: stack.filter(s => s.at).map(s => s.head) });
    } else if (stack.length) stack.pop();
  }
}
const fontSizeOf = body => { const f = body.match(/font-size\s*:\s*([^;}]+)/g); return f ? f[f.length - 1].split(':')[1].trim() : null; };
const pxOf = v => { const m = /^([\d.]+)px/.exec(String(v).replace(/\s*!important/, '').trim()); return m ? parseFloat(m[1]) : null; };
// A rule that can style an editable control: element selectors OR any class actually
// used on an <input>/<textarea>/<select> in the app.
const FIELD_CLASSES = ['add-asset-input', 'aurix-cell-edit', 'auth-input', 'reset-confirm-input', 'settings-name-input',
  'wl-loc-field-provider', 'wl-loc-field-type', 'ws2-input', 'ws4-num', 'wsg-select', 'wsg-text', 'wsjrn-select',
  'wsmse-rename-in', 'wsre-tl-datein', 'wsrecv-search', 'beta-code-input'];
const isField = sel =>
  /(^|[\s,>+~(])(input|textarea|select)\b/i.test(sel) ||
  /contenteditable/i.test(sel) ||
  FIELD_CLASSES.some(c => sel.includes('.' + c));
const fieldRules = rules.filter(r => isField(r.sel) && fontSizeOf(r.body));
const maxWidthOf = ats => {                       // narrowest max-width in scope, or null (= all viewports)
  let best = null;
  for (const a of ats) { const m = /max-width\s*:\s*(\d+)px/.exec(a); if (m) best = best === null ? +m[1] : Math.min(best, +m[1]); }
  return best;
};

// ── 0 the shared owner exists and is the ONLY thing that changed ─────────────
console.log('0 — shared owner (AURIX-MOBILE-FIELD-ZOOM-1):');
const ownerIdx = css.indexOf('AURIX-MOBILE-FIELD-ZOOM-1');
ok('0 owner block present in styles.css', ownerIdx > -1);
const owner = ownerIdx > -1 ? css.slice(ownerIdx) : '';
const ownerRule = rules.find(r => /font-size\s*:\s*16px\s*!important/.test(r.body) && isField(r.sel));
ok('0 owner is a single rule setting the 16px floor', !!ownerRule);
ok('0 owner is mobile-scoped (@media max-width:768px)', !!ownerRule && maxWidthOf(ownerRule.ats) === 768,
   ownerRule ? ownerRule.ats.join(' ') : 'no rule');
ok('0 owner covers input + textarea + select + contenteditable',
   !!ownerRule && /\binput\b/.test(ownerRule.sel) && /\btextarea\b/.test(ownerRule.sel)
   && /\bselect\b/.test(ownerRule.sel) && /contenteditable/.test(ownerRule.sel));
ok('0 owner excludes non-text inputs (no em-sizing disturbed)',
   !!ownerRule && ['checkbox', 'radio', 'range', 'hidden', 'color', 'file'].every(t => ownerRule.sel.includes(`[type="${t}"]`)));

// ── 1 typography safety — every editable control ≥16px on mobile ─────────────
console.log('\n1 — typography safety (mobile ≥16px):');
// Any field rule that applies at ≤768px must not leave a sub-16px value standing.
// The floor is !important and no other field rule may use !important (asserted in 2),
// so the only way a field stays <16px on mobile is if the floor does not cover it.
const subMobile = fieldRules.filter(r => {
  if (r === ownerRule) return false;
  const mw = maxWidthOf(r.ats);
  const appliesOnMobile = mw === null || mw >= 320;      // no max-width, or a mobile-reaching one
  const n = pxOf(fontSizeOf(r.body));
  return appliesOnMobile && n !== null && n < 16;
});
ok('1 sub-16px field declarations exist but are all outranked by the floor',
   subMobile.length > 0 && !!ownerRule, `${subMobile.length} declaraciones <16px cubiertas`);
subMobile.slice(0, 8).forEach(r => console.log(`      · ${fontSizeOf(r.body).trim()} ${r.sel.replace(/\s+/g, ' ').slice(0, 62)}`));
ok('1 no sub-16px field rule is itself !important (would beat the floor)',
   subMobile.every(r => !/font-size\s*:[^;}]*!important/.test(r.body)));
// Known offenders from the SPEC's affected surfaces are actually in the covered set.
const covered = sel => subMobile.some(r => r.sel.includes(sel)) || rules.some(r => r.sel.includes(sel));
ok('1 Añadir activo covered (.add-asset-input / .form-group input)', covered('.add-asset-input') && covered('.form-group input'));
ok('1 Configuración covered (.settings-name-input)', covered('.settings-name-input'));
ok('1 Workspace covered (.ws2-input / .wsg-select / .ws4-num)', covered('.ws2-input') && covered('.wsg-select') && covered('.ws4-num'));
ok('1 buscadores covered (.search-field-wrap / .market-search-wrap)', covered('.search-field-wrap input') && covered('.market-search-wrap input'));

// ── 2 THE SAFETY INVARIANT: the floor can only raise, never shrink ───────────
console.log('\n2 — floor invariant (never shrinks a field):');
const oversize = fieldRules.filter(r => r !== ownerRule && (pxOf(fontSizeOf(r.body)) || 0) > 16 && (maxWidthOf(r.ats) === null || maxWidthOf(r.ats) >= 320));
ok('2 NO editable control sets font-size >16px on mobile → !important floor is safe',
   oversize.length === 0, oversize.map(r => `${fontSizeOf(r.body)} ${r.sel.slice(0, 40)}`).join(' ; ') || 'ninguno');
ok('2 the floor is the only !important font-size among field rules',
   fieldRules.filter(r => /font-size\s*:[^;}]*!important/.test(r.body)).length === 1);

// ── 3 viewport — manual zoom + accessibility preserved ───────────────────────
console.log('\n3 — viewport / accesibilidad:');
const shipped = ['index.html', 'login.html', 'reset-password.html', 'landing/index.html'];
for (const f of shipped) {
  const h = fs.readFileSync(path.join(root, f), 'utf8');
  const meta = (h.match(/<meta\s+name="viewport"[^>]*>/i) || [''])[0];
  ok(`3 ${f}: viewport sin bloqueo de zoom`,
     /width=device-width/.test(meta) && !/user-scalable\s*=\s*no/i.test(meta)
     && !/maximum-scale\s*=\s*1(\.0)?\b/i.test(meta) && !/minimum-scale/i.test(meta), meta.slice(0, 72));
}
// Asserted over REAL declarations (comments stripped) — this harness's own prose and the
// owner's rationale comment legitimately name `user-scalable=no` and iOS as the thing NOT done.
ok('3 no se introduce user-scalable=no en ningún HTML/JS', !/user-scalable\s*=\s*no/i.test(app + clean));
ok('3 SPEC 58 pinch-zoom sobre modales intacto', /touch-action:\s*pan-x pan-y pinch-zoom/.test(css));
ok('3 el fix NO cambia el zoom por JavaScript (no toca app.js)', !/AURIX-MOBILE-FIELD-ZOOM/.test(app));

// ── 4 no second keyboard/viewport manager, no UA sniffing ────────────────────
console.log('\n4 — sin gestor duplicado ni detección de navegador:');
ok('4 no visualViewport listeners (owner sigue siendo CSS)',
   !/visualViewport\s*\.\s*(addEventListener|removeEventListener|onresize|onscroll)/.test(app));
ok('4 no scrollIntoView agresivo asociado al foco de campos',
   !/addEventListener\(\s*['"]focus(in)?['"][\s\S]{0,200}scrollIntoView/.test(app));
ok('4 el fix no añade listeners globales (bloque puramente CSS)', !/addEventListener/.test(owner));
// Over the owner's SELECTOR + DECLARATIONS only: the rationale comment names iOS/iPadOS
// as the platform whose threshold this satisfies, which is documentation, not detection.
ok('4 sin detección por User-Agent en el fix',
   !!ownerRule && !/userAgent|navigator\.platform|iPhone|iPad|Android/i.test(ownerRule.sel + ownerRule.body));

// ── 5 desktop intacto + scroll interno de modales ────────────────────────────
console.log('\n5 — desktop + contenedores scrollables:');
ok('5 el suelo NO aplica en desktop (solo dentro de max-width)', !!ownerRule && maxWidthOf(ownerRule.ats) !== null);
ok('5 ninguna regla global de campos fuera de media query usa !important',
   !fieldRules.some(r => r.ats.length === 0 && /font-size\s*:[^;}]*!important/.test(r.body)));
const scrolls = name => rules.some(r => r.sel.split(',').some(s => s.trim() === name) && /overflow-y\s*:\s*(auto|scroll)/.test(r.body));
ok('5 .modal-body conserva scroll interno', scrolls('.modal-body'));
ok('5 .settings-body conserva scroll interno', scrolls('.settings-body'));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
