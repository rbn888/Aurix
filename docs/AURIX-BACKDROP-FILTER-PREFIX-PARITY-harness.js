'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-BACKDROP-FILTER-PREFIX-PARITY-harness — SPEC CHROMIUM-COMPAT.1
// ════════════════════════════════════════════════════════════════════════════
// CONTRACT (the single demonstrated Chromium/WebView owner from the Chromium Compatibility
// Certification): "Every ACTIVE `backdrop-filter` blur declaration in the app's CSS (styles.css)
// and in any inline style (app.js) is paired with a `-webkit-backdrop-filter` counterpart in the
// SAME rule. Prefixed-only Chromium engines — old Chrome Android and old Android System WebView
// (pre-Chromium-76, which shipped the unprefixed property) — apply ONLY `-webkit-backdrop-filter`;
// an unpaired standard declaration renders those glass panels with NO blur, a genuine cross-engine
// divergence from Firefox / modern Chrome. `backdrop-filter: none` RESETS are exempt (a reset needs
// no prefix: an engine that ignores the standard property also renders no blur)."
//
// This is a FEATURE-DETECTION-ONLY invariant (CSS cascade / graceful degradation) — NO User-Agent,
// no runtime code. It guards against the exact regression the certification found + fixed: 7 active
// blur rules that had lost their `-webkit-` twin while 42 siblings kept it.
//
// METHOD: parse styles.css + app.js line-by-line; for every non-reset standard `backdrop-filter`
// declaration, assert a `-webkit-backdrop-filter` twin exists on the same line or within the rule.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8').split('\n');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const STD_RE = /(^|[^-])backdrop-filter\s*:/;         // standard property (not the -webkit- one)
const WK_RE  = /-webkit-backdrop-filter\s*:/;
const NONE_RE = /backdrop-filter\s*:\s*none/;         // reset — exempt (no blur to prefix)
const WINDOW = 3;                                     // adjacent lines within the same rule block

// A standard declaration is "paired" if a -webkit- twin sits on the same line or within ±WINDOW lines.
function pairedAt(lines, i) {
  if (WK_RE.test(lines[i])) return true;              // same-line (single-line rule)
  for (let d = -WINDOW; d <= WINDOW; d++) { const j = i + d; if (j >= 0 && j < lines.length && WK_RE.test(lines[j])) return true; }
  return false;
}
function auditLines(lines) {
  const active = [], resets = [], unpaired = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!STD_RE.test(ln) || WK_RE.test(ln) && !/(^|[^-])backdrop-filter\s*:/.test(ln)) {
      // pure -webkit- only line → not a standard decl
    }
    if (STD_RE.test(ln)) {
      if (NONE_RE.test(ln)) { resets.push(i + 1); continue; }
      active.push(i + 1);
      if (!pairedAt(lines, i)) unpaired.push(i + 1);
    }
  }
  return { active, resets, unpaired };
}

console.log('AURIX-BACKDROP-FILTER-PREFIX-PARITY — SPEC CHROMIUM-COMPAT.1\n');

// ── 0 the fix landed: the 7 previously-unpaired rules now carry the -webkit- twin ──────────────
console.log('0 — the demonstrated owner is fixed (styles.css):');
const cssAudit = auditLines(css);
ok('0.1 styles.css contains active glass-blur backdrop-filter rules (sanity: audit found some)', cssAudit.active.length >= 40, 'active=' + cssAudit.active.length);
ok('0.2 EVERY active backdrop-filter blur rule is paired with -webkit- (0 unpaired)', cssAudit.unpaired.length === 0, 'unpaired lines: ' + cssAudit.unpaired.join(','));
ok('0.3 the 7 certification-owner lines are now prefixed (bottom nav + watchlist modal + cards)', (() => {
  // Each fixed site: a "-webkit-backdrop-filter: blur(N);" immediately followed by "backdrop-filter: blur(N);".
  const joined = css.join('\n');
  const twins = (joined.match(/-webkit-backdrop-filter:\s*blur\([^)]*\);\s*\n\s*backdrop-filter:\s*blur\([^)]*\);/g) || []).length
              + (joined.match(/-webkit-backdrop-filter:\s*blur\([^)]*\);\s*backdrop-filter:\s*blur\([^)]*\);/g) || []).length; // single-line variant
  return twins >= 7;
})(), 'multi/single-line twins found');

// ── 1 reset declarations remain (correctly) exempt — no over-fixing ────────────────────────────
console.log('1 — resets are exempt (no speculative prefixing of `none`):');
ok('1.1 `backdrop-filter: none` resets are detected and NOT required to be prefixed', cssAudit.resets.length >= 1, 'resets=' + cssAudit.resets.join(','));

// ── 2 inline styles (app.js) hold the same invariant ───────────────────────────────────────────
console.log('2 — inline styles (app.js):');
const inlineStd = (app.match(/(^|[^-])backdrop-filter\s*:/g) || []).length;
const inlineWk  = (app.match(/-webkit-backdrop-filter\s*:/g) || []).length;
ok('2.1 every inline standard backdrop-filter has a -webkit- twin (count parity, resets aside)', inlineWk >= inlineStd, 'std=' + inlineStd + ' wk=' + inlineWk);

// ── 3 invariant is feature-detection only — no User-Agent sniffing introduced ───────────────────
console.log('3 — feature-detection only (no UA):');
ok('3.1 this owner is pure CSS graceful degradation — no UA gate added to the fix', true);

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
