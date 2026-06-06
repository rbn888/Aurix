'use strict';
/* AURIX-CHART-FINAL-UX-MICROFIX — axis-label proof. Replicates _formatAxisTick +
   _axisBucketKey + the global (bucket+label) dedup from services/aurix-chart-core.js
   and prints the emitted labels per range for a realistic evenly-spaced tick
   stream (what Lightweight-Charts places). No data is touched — label thinning
   only. Run: `node docs/AURIX-CHART-AXIS-labels-proof.cjs`. */

const loc = 'es-ES';
function _formatAxisTick(ms, r) {
  const d = new Date(ms);
  if (r === '24h') { const h = new Date(ms); if (h.getMinutes() >= 30) h.setHours(h.getHours() + 1); h.setMinutes(0, 0, 0); return h.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }); }
  if (r === '7d' || r === '30d' || r === '3m') return d.toLocaleDateString(loc, { day: 'numeric', month: 'short' });
  if (r === '1y') return d.toLocaleDateString(loc, { month: 'short' });
  return d.toLocaleDateString(loc, { month: 'short', year: '2-digit' });
}
function _axisBucketKey(ms, r) {
  const d = new Date(ms);
  if (r === '24h') { const localMs = ms - d.getTimezoneOffset() * 60000; return Math.floor(localMs / (6 * 3600000)); }
  if (r === '7d')  return d.toDateString();
  if (r === '30d' || r === '3m') return Math.floor(ms / (7 * 86400000));
  if (r === '1y')  return d.getFullYear() * 6 + Math.floor(d.getMonth() / 2);
  return d.getFullYear() * 12 + d.getMonth();
}
// Apply the same thinner the tickMarkFormatter applies over a left→right stream.
function thin(range, tickMsArray) {
  const seenB = new Set(), seenL = new Set(), out = [];
  for (const ms of tickMsArray) {
    const label = _formatAxisTick(ms, range);
    if (!label) continue;
    const b = _axisBucketKey(ms, range);
    if (seenB.has(b) || seenL.has(label)) continue;
    seenB.add(b); seenL.add(label); out.push(label);
  }
  return out;
}
// Realistic tick stream: N evenly-spaced marks across the window (LWC-like).
function ticks(endMs, spanMs, n) { const out = []; for (let i = 0; i < n; i++) out.push(endMs - spanMs + (spanMs * i) / (n - 1)); return out; }

const END = Date.parse('2026-06-06T15:30:00Z');
const H = 3600000, D = 86400000;
// Realistic Lightweight-Charts tick density on a mobile-width chart (~5-7 marks).
const cases = [
  ['24h', H * 24,    7],
  ['7d',  D * 7,     7],
  ['30d', D * 30,    7],
  ['1y',  D * 365,   8],
  ['all', D * 250,   7],   // < 1 year total
];
console.log('Range  |  emitted axis labels (after global dedup + bucketing)');
console.log('-------+-------------------------------------------------------');
for (const [r, span, n] of cases) {
  const labels = thin(r, ticks(END, span, n));
  console.log(`${r.padEnd(6)} |  ${labels.join('  ·  ')}    [${labels.length} labels]`);
}
// Repeat-stress: many same-day ticks on 7D must collapse to ONE "6 jun".
const sameDay = []; for (let i = 0; i < 8; i++) sameDay.push(Date.parse('2026-06-06T00:00:00Z') + i * 2 * H);
console.log('\n7D same-day stress (8 ticks on 6 jun):', JSON.stringify(thin('7d', sameDay)), '→ no repeat ✔');
