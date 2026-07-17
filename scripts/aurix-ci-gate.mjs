#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// AURIX deploy gate — SPEC CHART-INTEGRITY.CI (fail-closed)
// ════════════════════════════════════════════════════════════════════════════
// Runs the full chart-engine harness suite (docs/*harness*.js), with the P0 chart-integrity harnesses
// FIRST (fast fail). Any harness that exits non-zero OR prints a failure summary fails the whole gate.
// The Pages workflow makes `deploy` depend on this job, so a red suite blocks the deploy — no
// continue-on-error, no ignored exit codes. Deployment fails closed.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(root, 'docs');

// P0 chart-integrity harnesses — run first so a core-integrity regression fails fast.
const P0 = [
  'AURIX-VALUATION-COMPLETENESS-CONTRACT-harness.js',   // LB-1
  'AURIX-PUBLICATION-READINESS-CONTRACT-harness.js',    // LB-2
  'AURIX-BACKEND-CONTINUITY-HEALTH-harness.js',         // LB-3
  'AURIX-MULTI-RANGE-INTEGRITY-CONTRACT-harness.js',    // Phase 7
  'AURIX-SNAPSHOT-WRITE-GUARD-harness.js',
  'AURIX-SNAPSHOT-GUARD-PARITY-harness.js',
  'AURIX-CHART-PRODUCTION-CERTIFICATION-harness.js',
  'AURIX-MULTI-RANGE-FINANCIAL-CERTIFICATION-harness.js',
];

const all = readdirSync(docs).filter(f => /harness.*\.js$/.test(f));
const ordered = [...P0.filter(f => all.includes(f)), ...all.filter(f => !P0.includes(f))];

const FAIL_RE = /[1-9]\d* failed|^FAIL\b|NO-GO/m;
let passed = 0; const failures = [];
const t0 = Date.now();

for (const f of ordered) {
  const res = spawnSync('node', [join(docs, f)], { encoding: 'utf8', timeout: 120000 });
  const out = (res.stdout || '') + (res.stderr || '');
  const tail = out.split('\n').filter(Boolean).slice(-4).join('\n');
  const bad = res.status !== 0 || FAIL_RE.test(tail);
  if (bad) { failures.push({ f, status: res.status, tail: tail.slice(-300) }); process.stdout.write('✗'); }
  else { passed++; process.stdout.write('.'); }
}
process.stdout.write('\n');

const dur = Math.round((Date.now() - t0) / 1000);
const total = ordered.length;
console.log(JSON.stringify({
  gate: 'AURIX-CHART-INTEGRITY', commit: process.env.GITHUB_SHA || null,
  total, passed, failed: failures.length, skipped: 0, durationSec: dur,
  p0Gate: failures.some(x => P0.includes(x.f)) ? 'FAIL' : 'PASS',
}, null, 2));

if (failures.length) {
  console.error('\nFAILED HARNESSES:');
  for (const x of failures) console.error(`  ✗ ${x.f} (exit ${x.status})\n    ${x.tail.replace(/\n/g, '\n    ')}`);
  console.error(`\nGATE RESULT: NO-GO — ${failures.length}/${total} harnesses failed. Deploy blocked.`);
  process.exit(1);
}
console.log(`\nGATE RESULT: GO — ${passed}/${total} harnesses passed in ${dur}s. Deploy allowed.`);
process.exit(0);
