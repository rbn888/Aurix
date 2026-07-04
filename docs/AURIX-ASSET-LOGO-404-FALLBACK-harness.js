'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ASSET-LOGO-404-FALLBACK-harness — SPEC DSH.PROD.CONSOLE-404.AUDIT.06
// ════════════════════════════════════════════════════════════════════════════
// The prod console 404 for financialmodelingprep/.../IWDA.png is an OPTIONAL asset logo (FMP has no
// European ETF IWDA). It is handled by a SILENT, SINGLE-SHOT fallback (the <img> is removed and the
// premium initial/monogram is revealed) — no retry loop, no layout shift, no UI degrade, and completely
// independent of the data pipeline (backend snapshots / autoload / merge / auth / SAVE). This regression
// guard proves the fallback stays silent + bounded. NO runtime change (both 404s are benign console noise).
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fn(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let k = app.indexOf('{', i), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(i, k); }
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }

const sb = { console: { warn() {} }, RegExp, String };
sb.CLEAN_LOGO_OVERRIDE = {};   // stub (only the crypto branch reads it; missing key ⇒ CDN URL)
vm.createContext(sb);
['_resolveLogoBySymbol', 'getAssetLogo', '_aurixIconImgError', '_aurixIconImgOk'].forEach(n => vm.runInContext(fn(n), sb));
const call = (f, ...a) => { sb.__a = a; return vm.runInContext(f + '.apply(null, __a)', sb); };

console.log('AURIX-ASSET-LOGO-404-FALLBACK — SPEC DSH.PROD.CONSOLE-404.AUDIT.06\n');

console.log('404 #1 source — optional ETF logo (financialmodelingprep IWDA.png):');
ok('getAssetLogo(etf IWDA, no stored image) → FMP image-stock URL (the 404 source)',
  call('getAssetLogo', { ticker: 'IWDA', type: 'etf' }) === 'https://financialmodelingprep.com/image-stock/IWDA.png');
ok('a STORED provider image (any https, incl uuid/FMP filename) is used as-is',
  call('getAssetLogo', { image: 'https://financialmodelingprep.com/image-stock/IWDA.png', ticker: 'IWDA', type: 'etf' }) === 'https://financialmodelingprep.com/image-stock/IWDA.png');
ok('an https stored logo ending in a uuid is returned (candidate for the 2nd 404)',
  call('getAssetLogo', { image: 'https://cdn.example.com/logos/1a2b3c4d-81f4-fe802e2ec28c.png', type: 'etf', ticker: 'X' }) === 'https://cdn.example.com/logos/1a2b3c4d-81f4-fe802e2ec28c.png');

console.log('\nFallback is SILENT + SINGLE-SHOT (no retry loop, no UI degrade):');
{ let removed = 0, classRemoved = null;
  const host = { classList: { remove: c => { classRemoved = c; } } };
  const img = { parentElement: host, remove: function () { removed++; this.parentElement = null; } };
  call('_aurixIconImgError', img);
  ok('onerror removes the <img> exactly once (element gone ⇒ cannot re-fire ⇒ no loop)', removed === 1);
  ok('reveals the premium fallback (host loses has-logo)', classRemoved === 'has-logo');
  // calling again on the (already-removed) node is safe / no throw
  let threw = false; try { call('_aurixIconImgError', { parentElement: null, remove() {} }); } catch (_) { threw = true; }
  ok('handler is defensive on an already-removed node (no throw)', !threw); }

console.log('\nHandler does NOT re-assign img.src (that is what would loop) — source guard:');
ok('_aurixIconImgError never sets img.src (removes, does not retry)', !/\.src\s*=/.test(fn('_aurixIconImgError')));
// the crypto retry chain (_logoFallback) is bounded and terminates (different surface)
ok('_logoFallback is bounded: step counter + terminal _logoFinalHide + onerror nulled',
  /dataset\.fallbackStep/.test(app) && /_logoFinalHide\(img\)/.test(app) && /img\.onerror = null;/.test(app));

console.log('\nPipeline independence (image 404s never touch data):');
ok('logo resolver is pure string-building (no fetch/supabase/insert/select)',
  !/(supabaseClient|fetch\(|\.insert\(|\.select\()/.test(fn('getAssetLogo') + fn('_resolveLogoBySymbol') + fn('_aurixIconImgError')));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
