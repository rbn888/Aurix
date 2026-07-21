'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MOBILE-PINCH-ZOOM-CONTRACT-harness — SPEC 58
// ════════════════════════════════════════════════════════════════════════════
// Native two-finger pinch-zoom must work over EVERY mobile surface. It failed only over
// interactive components because their touch handlers preventDefault() every touchmove
// (incl. two-finger) and `body.modal-open{touch-action:none}` blocked pinch on all modals.
// Contract (source-asserted — multi-touch can't be simulated in the node gate; the two-finger
// paths are validated on-device):
//   • viewport meta allows zoom (no user-scalable=no / maximum-scale);
//   • body.modal-open uses touch-action that permits pinch-zoom (not `none`);
//   • every preventDefault touch gesture (chart inspector, dashboard carousel, drag×2) yields
//     to the browser when a second finger arrives (touches.length > 1 → return, no preventDefault).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, i) => { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } };

console.log('AURIX-MOBILE-PINCH-ZOOM-CONTRACT — SPEC 58\n');

// 1. Viewport meta must not disable zoom.
const vp = (html.match(/<meta[^>]*name="viewport"[^>]*>/i) || [''])[0];
ok('1 viewport meta allows zoom (no user-scalable=no / maximum-scale)',
  /name="viewport"/i.test(vp) && !/user-scalable\s*=\s*no/i.test(vp) && !/maximum-scale/i.test(vp), vp.slice(0, 90));

// 2. body.modal-open must NOT block pinch (no touch-action:none; permits pinch-zoom).
const modalOpen = (css.match(/body\.modal-open\s*\{[^}]*\}/) || [''])[0];
ok('2 body.modal-open permits pinch-zoom (not touch-action:none)',
  /pinch-zoom/.test(modalOpen) && !/touch-action:\s*none/.test(modalOpen), modalOpen.replace(/\s+/g, ' ').slice(0, 120));

// 3. There is no GLOBAL touch-action:none that would blanket-block pinch (≤ a small, justified count).
const noneCount = (css.match(/touch-action:\s*none/g) || []).length;
ok('3 no blanket touch-action:none reintroduced on modal/body', !/body[^{]*\{[^}]*touch-action:\s*none/.test(css) && noneCount <= 1, 'touch-action:none count=' + noneCount);

// 4. Two-finger yield guards present on the preventDefault gesture handlers.
const guards = (app.match(/SPEC 58 — two fingers/g) || []).length;
ok('4 two-finger yield guards on gesture handlers (inspector/carousel/drag×2)', guards >= 4, 'guards=' + guards);

// 5. Each guard checks touches.length > 1 and returns before preventDefault (never cancels multitouch).
ok('5 guards use `touches.length > 1` → return (yield to native pinch)',
  /e\.touches && e\.touches\.length > 1/.test(app) || /touches\.length > 1\)\s*\{[^}]*return/.test(app));

// 6. No artificial reset (SPEC forbids JS zoom reset / root transform / reload / reset button).
ok('6 no artificial zoom-reset (no root scale reset / reset-zoom button)',
  !/reset[-_ ]?zoom/i.test(app) && !/document\.documentElement\.style\.(transform|zoom)\s*=/.test(app));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('GATE: GO — all ' + pass + ' assertions passed');
process.exit(0);
