'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-BOOT-STORAGE-DEGRADATION-harness — P0 Android/Chrome/incognito flicker
// ════════════════════════════════════════════════════════════════════════════
// CONTRACT: "With storage absent, blocked, limited or non-persistent, Aurix must complete the bootstrap
// ONCE and keep a stable render — no reload/redirect loop, no disappearing UI."
// ROOT CAUSE: the build-coherence boot reload's one-reload anti-loop guard lives in sessionStorage; app.js
// reloaded even when that marker could NOT persist → in non-durable-storage contexts it reloaded on every
// boot forever. FIX: confirm the marker persisted (write + read-back) before reloading; else degrade (no
// reload). index.html already guards this via its _storageOk probe.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing fn ' + n); return braceSlice(app, i); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

// The decision core runs in a bare sandbox (pure function).
const ctx = { Object, Number, JSON };
vm.createContext(ctx);
vm.runInContext(fnSrc('_aurixResolveBuildCoherence'), ctx);
const decide = (e, iv, rv, xv, rs, cap) => vm.runInContext('_aurixResolveBuildCoherence', ctx)(e, iv, rv, xv, rs, cap);
const CAP_OK = { registrationComplete: true, required: { a: true } };

console.log('AURIX-BOOT-STORAGE-DEGRADATION — P0\n');

// ── 1 anti-loop decision: at most ONE auto-reload per expected version ────────
console.log('1 — one-reload cap (never loop):');
ok('1.1 coherent build (versions match + caps) → no reload', decide(579, 579, 579, 579, null, CAP_OK).action === 'none');
ok('1.2 version mismatch, first time → exactly one reload', (() => { const d = decide(580, 579, 579, 579, null, CAP_OK); return d.action === 'reload' && d.nextReloadState.n === 1; })());
ok('1.3 mismatch, ALREADY reloaded once → recoverable, NOT a 2nd reload', decide(580, 579, 579, 579, { v: 580, n: 1 }, CAP_OK).action === 'recoverable');
ok('1.4 no expected version → coherent no-op (never reload blind)', decide(null, 579, 579, 579, null, CAP_OK).action === 'none');

// ── 2 durability guard in decide(): NEVER reload unless the marker persisted ──
console.log('2 — storage-durability guard before reload (app.js):');
const boot = app.slice(app.indexOf("if (dec.action === 'reload') {"), app.indexOf("if (dec.action === 'reload') {") + 1400);
ok('2.1 writes the anti-loop marker AND reads it back (_armed)', /sessionStorage\.setItem\(MK, _mv\); _armed = \(sessionStorage\.getItem\(MK\) === _mv\)/.test(boot));
ok('2.2 when NOT armed → does NOT reload (return before aurixApplyBuildUpdate)', /if \(!_armed\) \{[\s\S]{0,400}return;\s*\}/.test(boot) && boot.indexOf('if (!_armed)') < boot.indexOf('aurixApplyBuildUpdate()'));
ok('2.3 degraded path surfaces update-available (no silent break, no loop)', /!_armed[\s\S]{0,160}__AURIX_BUILD_UPDATE_AVAILABLE = true/.test(boot) && /storage not durable — skipping coherence reload/.test(boot));

// ── 3 index.html mirrors the guard (skip coherence reload when storage blocked) ──
console.log('3 — index.html storage guard (existing):');
ok('3.1 index probes storage (_storageOk) before its coherence reload', /_storageOk = \(function \(\) \{ try \{ var k = '__aurix_probe__'; sessionStorage\.setItem/.test(html));
ok('3.2 index skips the coherence reload when storage blocked (no loop)', /storage blocked — skipping coherence reload \(degraded, no loop\)/.test(html));

// ── 4 redirect owner stays bounded (no index⇄login loop) — regression guard ──
console.log('4 — redirect bound intact (no regression):');
ok('4.1 storage-independent _arl redirect bound present (app.js + login.html)', /_AURIX_REDIRECT_URL_PARAM/.test(app) && /_AURIX_REDIRECT_URL_PARAM/.test(fs.readFileSync(path.join(root, 'login.html'), 'utf8')));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
