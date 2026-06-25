/* AURIX — P0 MOBILE-BOOT-FIX — reload-guard harness.
   Models the index.html build-reload decision across a sequence of page loads with
   localStorage persisting across loads, sessionStorage persisting within a session,
   and reload() restarting the load. Proves:

     • OLD guard (de-dupe by build value) infinite-loops when a stale-cached page
       flip-flops AURIX_BUILD between two values → app never boots (splash hangs).
     • NEW guard (≤1 reload per session) caps at one reload and then BOOTS, even with
       the flip-flop — and still does the intended single reload on a normal upgrade.
     • first-ever visit never reloads.

   Run: node docs/AURIX-MOBILE-BOOT-RELOAD-harness.js                                 */
'use strict';
const fs = require('fs'), path = require('path');

// ── decision models (mirror the inline boot guards) ─────────────────────────
function decideOld(build, store) {            // store: {local, sReload}
  const stored = store.local;
  if (stored && stored !== build) {
    const alreadyReloaded = store.sReload === build;
    if (!alreadyReloaded) { store.sReload = build; store.local = build; return true; }
  } else if (!stored) { store.local = build; }
  return false;
}
function decideNew(build, store) {             // store: {local, sCount}
  const stored = store.local;
  if (stored && stored !== build) {
    const rc = store.sCount || 0;
    store.local = build;                       // always converge the stored build
    if (rc < 1) { store.sCount = rc + 1; return true; }
    return false;                             // cap reached → proceed (never loop)
  } else if (!stored) { store.local = build; }
  return false;
}

// simulate loads: buildSeq(i) returns the AURIX_BUILD the page reports on load i
function simulate(decide, store, buildSeq, maxLoads) {
  let reloads = 0;
  for (let i = 0; i < maxLoads; i++) {
    const reloaded = decide(buildSeq(i), store);
    if (reloaded) { reloads++; continue; }     // reload → next load
    return { booted: true, reloads };          // no reload → app boots
  }
  return { booted: false, reloads };           // never settled within maxLoads → loop
}

let ok = true;
const ck = (n, c, g) => { console.log((c ? '  ✓' : '  ✗') + ' ' + n + (g !== undefined ? '  [' + g + ']' : '')); if (!c) ok = false; };

console.log('AURIX P0 — Mobile boot reload guard\n');

// stale-cached index.html flip-flops between fresh v354 and cached v353
const flip = i => (i % 2 === 0) ? 'v354' : 'v353';

console.log('FLIP-FLOP (stale cache) — OLD guard loops, NEW guard boots:');
{ const old = simulate(decideOld, { local: 'v352', sReload: null }, flip, 60);
  ck('OLD never boots (infinite reload)', old.booted === false && old.reloads >= 60, 'reloads=' + old.reloads + ' booted=' + old.booted);
  const neu = simulate(decideNew, { local: 'v352', sCount: 0 }, flip, 60);
  ck('NEW boots', neu.booted === true);
  ck('NEW reloads <= 1 (loop-proof)', neu.reloads <= 1, 'reloads=' + neu.reloads); }

console.log('\nNORMAL UPGRADE (stable fresh build) — exactly one reload, then boots:');
{ const neu = simulate(decideNew, { local: 'v352', sCount: 0 }, () => 'v354', 10);
  ck('boots', neu.booted === true);
  ck('exactly 1 reload (cache purge once)', neu.reloads === 1, 'reloads=' + neu.reloads); }

console.log('\nFIRST-EVER VISIT (no stored build) — no reload:');
{ const neu = simulate(decideNew, { local: null, sCount: 0 }, () => 'v354', 10);
  ck('boots immediately', neu.booted === true && neu.reloads === 0, 'reloads=' + neu.reloads); }

console.log('\nSAME BUILD (no change) — no reload:');
{ const neu = simulate(decideNew, { local: 'v354', sCount: 0 }, () => 'v354', 10);
  ck('boots immediately', neu.booted === true && neu.reloads === 0); }

console.log('\nLIVE FILES — loop-proof guard present, old per-build guard removed:');
{ const root = path.join(__dirname, '..');
  for (const f of ['index.html', 'login.html', 'reset-password.html', 'reset.html']) {
    const s = fs.readFileSync(path.join(root, f), 'utf8');
    const hasCap = s.indexOf('aurix_build_reload_count') >= 0 && /rc\s*<\s*1/.test(s);
    const noOld = s.indexOf("'aurix_build_reload'") < 0 && s.indexOf('alreadyReloaded') < 0;
    ck(f + ' has reload-count cap + old guard removed', hasCap && noOld, hasCap ? (noOld ? 'ok' : 'old guard remains') : 'cap missing');
  } }

console.log('\nRESULT:', ok ? 'ALL PASS ✓ — mobile boot can no longer hang in a reload loop' : 'FAIL ✗');
process.exit(ok ? 0 : 1);
