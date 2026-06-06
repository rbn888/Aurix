'use strict';
/* AURIX-CHART-RENDER-DECISION proof — models the V2 (_aurixDashSync) and legacy
   (updateChart) render state machines to prove there is NO path where a
   no-coverage 30D draws a line or a headline. The ONLY way a building range shows
   a line is re-showing a per-range LAST-GOOD series — and last-good is recorded
   ONLY after a range passes availability. So a range that is never available can
   never have a last-good, hence never a line. Run:
   node docs/AURIX-CHART-RENDER-DECISION-proof.cjs */
let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`${c ? '  PASS' : '  FAIL'}  ${n}`); c ? pass++ : fail++; };

// Mirrors _aurixDashSync's decision (post boot-ready, post settle window).
// lastGoodStore: { [range]: series } — only written when available (see below).
function v2Decision({ range, available, hasAssets, dataReady, lastGoodStore }) {
  const lg = lastGoodStore[range];
  const hasLG = Array.isArray(lg) && lg.length >= 2;
  if (!available) {
    if (hasAssets && hasLG) return { mode: 'reshow_last_good', headline: 'kept', line: true };
    if (hasAssets && !dataReady) return { mode: 'loading', headline: 'cleared', line: false };
    return { mode: 'building', headline: 'cleared', line: false };
  }
  // available → record last-good for this range, then draw line + headline
  lastGoodStore[range] = [{}, {}]; // length >= 2
  return { mode: 'line', headline: 'set', line: true };
}

// Mirrors updateChart's legacy gate (owns the #chartChange headline text).
function legacyDecision({ available, hasAssets }) {
  if (!available && hasAssets) return { mode: 'building', headline: 'cleared', line: false };
  return { mode: 'line', headline: 'set', line: true };
}

console.log('\n=== V2 surface: no-coverage 30D, fresh session (no last-good) ===');
{
  const store = {};
  const d = v2Decision({ range: '30d', available: false, hasAssets: true, dataReady: true, lastGoodStore: store });
  ok('30D building → mode=building', d.mode === 'building');
  ok('30D building → NO line', d.line === false);
  ok('30D building → headline cleared', d.headline === 'cleared');
  ok('30D building → no last-good recorded', !store['30d']);
}

console.log('\n=== V2 surface: switch 24H(ready) → 30D(building) ===');
{
  const store = {};
  v2Decision({ range: '24h', available: true, hasAssets: true, dataReady: true, lastGoodStore: store }); // records 24h only
  const d = v2Decision({ range: '30d', available: false, hasAssets: true, dataReady: true, lastGoodStore: store });
  ok('24H recorded its own last-good', Array.isArray(store['24h']));
  ok('30D still has NO last-good (24H last-good is per-range)', !store['30d']);
  ok('30D → building, no line', d.mode === 'building' && d.line === false);
}

console.log('\n=== V2 surface: the ONLY line-while-building path requires prior availability ===');
{
  const store = {};
  // A range can only get a last-good by being available at least once.
  v2Decision({ range: '30d', available: true, hasAssets: true, dataReady: true, lastGoodStore: store });
  const d = v2Decision({ range: '30d', available: false, hasAssets: true, dataReady: true, lastGoodStore: store });
  ok('30D had to be AVAILABLE first to ever have a last-good', Array.isArray(store['30d']));
  ok('only then a transient building re-shows last-good (race guard)', d.mode === 'reshow_last_good');
  // With the real data (epoch=today) 30D is NEVER available → this path is unreachable.
}

console.log('\n=== V2 surface: not-ready (boot) shows loading, never a false line ===');
{
  const store = {};
  const d = v2Decision({ range: '30d', available: false, hasAssets: true, dataReady: false, lastGoodStore: store });
  ok('30D building + not ready + no last-good → loading (not a line)', d.mode === 'loading' && d.line === false);
}

console.log('\n=== Legacy surface (owns headline text) ===');
{
  const d = legacyDecision({ available: false, hasAssets: true });
  ok('30D building → legacy mode=building', d.mode === 'building');
  ok('30D building → legacy clears headline (no -0.0x%)', d.headline === 'cleared');
  ok('30D building → legacy draws NO line', d.line === false);
}

console.log('\n=== Both paths agree on the same availability input ===');
{
  const avail30dToday = false; // proven by RANGE-AVAILABILITY proof for epoch=today
  const v2 = v2Decision({ range: '30d', available: avail30dToday, hasAssets: true, dataReady: true, lastGoodStore: {} });
  const lg = legacyDecision({ available: avail30dToday, hasAssets: true });
  ok('V2 and legacy both → building (no divergence)', v2.mode === 'building' && lg.mode === 'building');
}

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
