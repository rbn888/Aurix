'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-SNAPSHOT-USER-HEALTH-harness — SPEC FASE 2.7 · P0 PER-USER CONTINUITY
// ════════════════════════════════════════════════════════════════════════════
// The P0 this closes is BLINDNESS, not a valuation bug. The capturer can refuse
// to insert for ONE account on every */15 tick, forever, while other accounts
// insert, the GLOBAL watchdog stays HEALTHY (it reads max(ts) across all users)
// and the user's app looks fine (app.js salvages an orphaned holding; the
// capturer counts it as dropped). The three silent branches wrote no row and
// logged no line, so nobody could name the dark account or the reason.
//
// This certifies the observability AND, just as hard, that it changed nothing:
//   · LB-1 intact — a partial valuation is still never persisted;
//   · valueUser byte-identical — no total, category or asset value moves;
//   · no server-side salvage, no unvalued position turned into 0;
//   · the health write happens AFTER every financial write and every failure of
//     it is swallowed: observability can never cost a snapshot;
//   · last_success_at advances ONLY on a real insert; the failure counter
//     increments atomically in SQL and resets on recovery;
//   · anon/publishable can read nothing, and no user can observe another;
//   · the global watchdog contract is preserved, gaining ONE additive field;
//   · app.js is untouched, so Chart, Performance, Category History Reader and
//     Preview V1 cannot have moved.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const BASELINE = '9882523';
const TS_PATH = path.join(ROOT, 'supabase', 'functions', 'portfolio-snapshot', 'index.ts');
const ts = fs.readFileSync(TS_PATH, 'utf8');
const sql = fs.readFileSync(path.join(ROOT, 'db', 'portfolio_snapshot_user_health_1.sql'), 'utf8');
const sqlV1 = fs.readFileSync(path.join(ROOT, 'db', 'portfolio_snapshot_watchdog_1.sql'), 'utf8');

let pass = 0, fail = 0, skipped = 0;
function ok(n, c, info) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } }
function skip(n, why) { skipped++; console.log('  ⊘ SKIP ' + n + '  [' + why + ']'); }

// ── executing the REAL bodies (same convention as the sibling capturer harnesses) ──
// Extract from the TYPE-STRIPPED source: a return annotation like `: string[]`
// or an inline object type would close the brace matcher early and truncate.
function fnSrcFrom(src, name) {
  const s = 'function ' + name + '('; const i = src.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let p = src.indexOf('(', i), pd = 0; for (; p < src.length; p++) { if (src[p] === '(') pd++; else if (src[p] === ')') { pd--; if (!pd) { p++; break; } } }
  let k = src.indexOf('{', p), d = 0; for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) { k++; break; } } }
  return src.slice(i, k);
}
// Arrow-function extractor for `const <name> = (...) => { … };`
function arrowSrcFrom(src, name) {
  const s = 'const ' + name + ' = ('; const i = src.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let k = src.indexOf('{', src.indexOf('=>', i)), d = 0;
  for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) { k++; break; } } }
  return src.slice(i, k) + ';';
}
// TS→JS by LITERAL list, never a generic regex: an annotation `:` and a ternary
// `:` are indistinguishable without a real parser, and an approximate regex
// mutilates the body silently — the worst possible harness failure, because it
// would then be testing code that is not production's. If a signature changes,
// assertTranspiled turns this red instead of measuring something else.
const TS_STRIP = [
  ['function normalizeWarnings(ws: any): string[] {', 'function normalizeWarnings(ws) {'],
  ['const HEALTH_WARN_ALLOW: Record<string, string> = {', 'const HEALTH_WARN_ALLOW = {'],
  ["] as const;", '];'],
  ['const out: string[] = [];', 'const out = [];'],
  ['const seen = new Set<string>();', 'const seen = new Set();'],
  ['let entry: string;', 'let entry;'],
  ['const noteHealth = (uid: any, outcome: string, dropped?: any, positions?: any, warnings?: any, snapshotAt?: any) => {',
   'const noteHealth = (uid, outcome, dropped, positions, warnings, snapshotAt) => {'],
  ['const userHealth: any[] = [];', 'const userHealth = [];'],
  ['(HEALTH_OUTCOMES as readonly string[])', 'HEALTH_OUTCOMES'],
];
function deTs(src) { let out = src; for (const [a, b] of TS_STRIP) out = out.split(a).join(b); return out; }
const TS_JS = deTs(ts);
function assertTranspiled(src) {
  const bad = src.split('\n').filter(l => /(: any|: string|: number|: boolean|Record<|Set<|as const|as readonly)/.test(l) && !/^\s*\/\//.test(l));
  return bad.length ? bad[0].trim().slice(0, 110) : null;
}

// Build a live sandbox holding the REAL normalizeWarnings + the REAL noteHealth.
let sandbox = null, buildErr = null;
try {
  const CONSTS = [
    ts.match(/const HEALTH_OUTCOMES = \[[^\]]*\]/)[0] + ';',
    fnSrcFrom(TS_JS, 'normalizeWarnings').replace(/^function/, 'function'),
  ];
  const allowSrc = (function () {
    const i = TS_JS.indexOf('const HEALTH_WARN_ALLOW = {'); const j = TS_JS.indexOf('};', i);
    return TS_JS.slice(i, j + 2);
  })();
  const nums = ['HEALTH_WARN_MAX', 'HEALTH_WARN_VALUE_MAX', 'HEALTH_UPSERT_CHUNK']
    .map(n => TS_JS.match(new RegExp('const ' + n + ' = \\d+')) [0] + ';');
  const src = [allowSrc].concat(nums).concat(CONSTS).concat([
    'const userHealth = [];',
    deTs(arrowSrcFrom(ts, 'noteHealth')),
    'return { userHealth: userHealth, noteHealth: noteHealth, normalizeWarnings: normalizeWarnings, HEALTH_OUTCOMES: HEALTH_OUTCOMES };',
  ]).join('\n');
  const leftover = assertTranspiled(src);
  if (leftover) throw new Error('TypeScript no despojado (¿cambió una firma?): ' + leftover);
  sandbox = new Function(src)();
} catch (e) { buildErr = String((e && e.message) || e); }

const note = (...a) => { sandbox.userHealth.length = 0; sandbox.noteHealth.apply(null, a); return sandbox.userHealth[0] || null; };
const warn = w => sandbox.normalizeWarnings(w);

// SQL comparison at the level that matters: statements, not comments.
const sqlNorm = s => s.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
// Executable surface only. The comments in both files deliberately NAME what the code
// must not do ("no server-side salvage", "no amounts, no positions", "rpc error, throw"),
// so any assertion of the form "this word appears nowhere" must read the CODE, never the
// rationale — otherwise the gate punishes the documentation for being explicit.
const TS_CODE = ts.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
// Also drop TRAILING inline comments, but only when they carry no quote character —
// that protects `origin: 'https://…'` (whose `//` lives inside a string literal) while
// removing notes like `// salvage not replicated server-side`.
const TS_EXEC = TS_CODE.replace(/\/\/[^\n'"]*$/gm, '');
const SQL_CODE = sql.replace(/--[^\n]*/g, '');
const NEW_N = sqlNorm(sql), V1_N = sqlNorm(sqlV1);
const has = (re, s) => (s instanceof RegExp ? s : new RegExp(s)).test(re);

console.log('\n════ AURIX-SNAPSHOT-USER-HEALTH ════\n');

console.log('0 · The real bodies execute (no reimplementation in this harness):');
ok('0.1 normalizeWarnings + noteHealth extracted and runnable from index.ts', sandbox !== null, buildErr || '');
if (!sandbox) { console.log('\n✗ FAIL  cannot continue without the real bodies\n'); process.exit(1); }
ok('0.2 the canonical vocabulary is exactly the six agreed outcomes',
  JSON.stringify(sandbox.HEALTH_OUTCOMES) === JSON.stringify(['INSERTED','INACTIVE','EMPTY','INCOMPLETE','SKIPPED','ERROR']),
  JSON.stringify(sandbox.HEALTH_OUTCOMES));

// ── 1–5 · Outcomes are emitted at the exact existing branches ────────────────
console.log('\n1–5 · Every branch that skips an insert now says so:');
{
  // Structural: the emission sits ON the pre-existing branch line, so it cannot
  // drift from the decision it reports.
  const branches = [
    ['1 INSERTED', /\} else \{ inserted\+\+; noteHealth\(r\.user_id, 'INSERTED', v\.dropped_asset_count, v\.count, v\.warnings, now\.toISOString\(\)\); \}/],
    ['3 INACTIVE', /if \(!hasCatalog && !hasHoldings\) \{ inactive\+\+; noteHealth\(r\.user_id, 'INACTIVE'\); continue; \}/],
    // EMPTY vs INCOMPLETE is decided on the same line (see 20b.6): total 0 caused by
    // unvaluable positions is a LB-1 victim, not an empty portfolio.
    ['4 EMPTY/INCOMPLETE', /v\.total <= 0\) \{ empty\+\+; noteHealth\(r\.user_id, Number\(v\.dropped_asset_count\) > 0 \? 'INCOMPLETE' : 'EMPTY', v\.dropped_asset_count, v\.count, v\.warnings\); continue; \}/],
    ['5 INCOMPLETE', /dropped_asset_count\) > 0\) \{ incompleteRej\+\+; noteHealth\(r\.user_id, 'INCOMPLETE', v\.dropped_asset_count, v\.count, v\.warnings\); continue; \}/],
  ];
  branches.forEach(([label, re]) => ok(label + ' is emitted on its own existing branch line', re.test(ts)));
  ok('1.2 INSERTED carries the snapshot instant it actually wrote',
    /noteHealth\(r\.user_id, 'INSERTED'[^)]*now\.toISOString\(\)\)/.test(ts));
  ok('2.1 last_success_at advances ONLY on INSERTED (single place, in SQL)',
    has(NEW_N, /last_success_at = case when excluded\.last_outcome = 'inserted' then v_now else h\.last_success_at end/));
  ok('2.2 an unsuccessful attempt still records the attempt',
    has(NEW_N, /last_attempt_at = v_now/) && /last_attempt_at\s+timestamptz not null/.test(sql));
  ok('2.3 first-ever row: last_success_at is NULL unless the attempt inserted',
    has(NEW_N, /case when d\.outcome = 'inserted' then v_now else null end/));
}

// ── 6–8 · The diagnostics survive, normalised and payload-free ───────────────
console.log('\n6–8 · The cause is diagnosable, and only the cause:');
{
  const r = note('u1', 'INCOMPLETE', 2, 3, ['orphan_holding:abc-123', 'unpriced:TSLA', 'fx_missing:CHF', 'invalid_qty:xyz']);
  ok('6.1 orphan_holding survives with its id', r.warnings.indexOf('orphan_holding:abc-123') !== -1, JSON.stringify(r.warnings));
  ok('7.1 unpriced survives with its symbol', r.warnings.indexOf('unpriced:TSLA') !== -1);
  ok('8.1 fx_missing survives with its currency', r.warnings.indexOf('fx_missing:CHF') !== -1);
  ok('8.2 invalid_qty is normalised to the canonical invalid_quantity',
    r.warnings.indexOf('invalid_quantity:xyz') !== -1 && !r.warnings.some(w => /^invalid_qty:/.test(w)), JSON.stringify(r.warnings));
  ok('8.3 the capturer still EMITS those four warnings (the source of the diagnosis)',
    /warnings\.push\('orphan_holding:'/.test(ts) && /warnings\.push\('invalid_qty:'/.test(ts)
    && /warnings\.push\('unpriced:'/.test(ts) && /warnings\.push\('fx_missing:'/.test(ts));
  // PII / payload containment.
  ok('8.4 an UNKNOWN warning prefix keeps its name and DROPS its value',
    JSON.stringify(warn(['leaked_secret:sk_live_abcdef', 'weird'])) === JSON.stringify(['leaked_secret:-', 'weird:-']),
    JSON.stringify(warn(['leaked_secret:sk_live_abcdef', 'weird'])));
  ok('8.5 values are length-bounded (never a payload)',
    warn(['unpriced:' + 'A'.repeat(500)])[0].length <= 'unpriced:'.length + 40);
  ok('8.6 the array is bounded and deduped',
    warn(Array.from({ length: 60 }, (_, i) => 'unpriced:S' + i)).length <= 12
    && warn(['unpriced:X', 'unpriced:X', 'unpriced:X']).length === 1);
  ok('8.7 whitespace is stripped so no free text can ride along',
    warn(['unpriced:AA BB\tCC'])[0] === 'unpriced:AABBCC', warn(['unpriced:AA BB\tCC'])[0]);
  ok('8.8 no amount, quantity, price, email or name is ever recorded',
    (function () { const x = note('u1', 'INCOMPLETE', 3, 1, ['unpriced:TSLA']);
      const keys = Object.keys(x).sort().join(',');
      return keys === 'dropped,outcome,positions,snapshot_at,user_id,warnings'; })(),
    Object.keys(note('u1','INCOMPLETE',3,1,['unpriced:TSLA'])).sort().join(','));
  ok('8.9 the persisted table DECLARES no PII / financial column either',
    (function () {
      const t = SQL_CODE.slice(SQL_CODE.indexOf('create table if not exists public.portfolio_snapshot_user_health'),
                               SQL_CODE.indexOf('comment on table')); 
      // `attempted_positions` is a COUNT of positions, not a position or an amount —
      // exempted by name so the check stays sharp on everything else.
      const cols = t.replace(/attempted_positions/g, 'attempted_n');
      return /user_id\s+uuid/.test(t)
        && !/email|amount|price|quantity|position|balance|total_value|full_name|display_name/i.test(cols);
    })());
}

// ── 9–11 · Counter, recovery and the SKIPPED/ERROR distinction ───────────────
console.log('\n9–11 · Counter, recovery, and SKIPPED is not ERROR:');
{
  ok('9.1 consecutive_non_success increments ATOMICALLY in SQL (no read-modify-write)',
    has(NEW_N, /consecutive_non_success = case when excluded\.last_outcome = 'inserted' then 0 else h\.consecutive_non_success \+ 1 end/));
  ok('9.2 a first observed failure starts the counter at 1',
    has(NEW_N, /case when d\.outcome = 'inserted' then 0 else 1 end/));
  ok('10.1 recovery RESETS the counter to 0 on the same expression',
    /then 0 else h\.consecutive_non_success \+ 1 end/.test(NEW_N));
  ok('10.2 the caller never computes the counter, so two overlapping runs cannot lose a failure',
    !/consecutive_non_success/.test(ts));
  ok('11.1 a duplicate-minute insert is SKIPPED (a safe no-op rerun), not ERROR',
    /=== '23505'[^\n]*\{ skipped\+\+; noteHealth\(r\.user_id, 'SKIPPED'/.test(ts));
  ok('11.2 a real insert failure is ERROR',
    /else \{ errored\+\+; console\.error\('\[insert\]', r\.user_id, insErr\.message\); noteHealth\(r\.user_id, 'ERROR'/.test(ts));
  ok('11.3 a thrown per-user exception is ERROR and still cannot abort the run',
    /catch \(e\) \{ errored\+\+; noteHealth\(r && r\.user_id, 'ERROR'\);/.test(ts));
  ok('11.4 the near-duplicate skip records the snapshot that already existed',
    /skipped\+\+; noteHealth\(r\.user_id, 'SKIPPED', v\.dropped_asset_count, v\.count, v\.warnings, last\[0\]\.ts\)/.test(ts));
  ok('11.5 the DB error message never reaches the health row (logs only)',
    !/noteHealth\([^)]*insErr\.message/.test(ts));
  ok('11.6 an unknown outcome is refused at the source, not coerced',
    note('u1', 'WHATEVER', 1, 1, []) === null);
  ok('11.7 …and refused again by the table CHECK',
    /check \(last_outcome in \('INSERTED','INACTIVE','EMPTY','INCOMPLETE','SKIPPED','ERROR'\)\)/.test(sql)
    && has(NEW_N, /upper\(e->>'outcome'\) in \('inserted','inactive','empty','incomplete','skipped','error'\)/));
}

// ── 12 · Observability can never cost a snapshot ─────────────────────────────
console.log('\n12 · snapshot path > observability path:');
{
  const iLoopEnd = ts.indexOf('  // ── Per-user observability flush');
  const iInsert = ts.indexOf("admin.from('portfolio_snapshots').insert(");
  const iResponse = ts.indexOf('return new Response(JSON.stringify({ ok: true, dryRun: DRY_RUN');
  ok('12.1 the flush runs AFTER the loop and after every financial write',
    iInsert > 0 && iLoopEnd > iInsert && iResponse > iLoopEnd);
  ok('12.2 the flush is fully guarded — rpc error AND throw are both swallowed',
    /try \{\s*const \{ error: hErr \} = await admin\.rpc\('portfolio_snapshot_user_health_upsert'/.test(ts)
    && /\} catch \(e\) \{\s*healthFailed \+= chunk\.length;/.test(ts));
  ok('12.3 a missing table/function (migration not applied yet) is survivable — same catch',
    /console\.warn\('\[user_health\]'/.test(ts)
    && !/\bthrow\b/.test(TS_CODE.slice(TS_CODE.indexOf('let healthWritten = 0'),
                                       TS_CODE.indexOf('return new Response(JSON.stringify({ ok: true'))));
  ok('12.4 noteHealth itself cannot throw into the capture path',
    /catch \(_\) \{ \/\* observability never interferes with capture \*\/ \}/.test(ts));
  ok('12.5 …proved by behaviour: hostile inputs never throw',
    (function () {
      try {
        const bad = [undefined, null, {}, 7, 'x', Symbol ? undefined : 0];
        bad.forEach(b => sandbox.noteHealth(b, 'ERROR', b, b, b, b));
        sandbox.noteHealth('u', 'ERROR', NaN, NaN, { not: 'array' }, 'not-a-date');
        sandbox.noteHealth('u', 'ERROR', -5, -5, ['unpriced:X'], 0);
        return true;
      } catch (e) { return false; }
    })());
  ok('12.6 the write is bounded per request (chunked), never one call per user',
    /HEALTH_UPSERT_CHUNK = \d+/.test(ts) && /i \+= HEALTH_UPSERT_CHUNK/.test(ts)
    && !/for \(const r of rows\)[\s\S]{0,4000}admin\.rpc\('portfolio_snapshot_user_health_upsert'/.test(ts));
  ok('12.7 DRY_RUN stays a pure read — no health write at all',
    /if \(!DRY_RUN\) \{\s*for \(let i = 0; i < userHealth\.length/.test(ts));
  ok('12.8 the run reports how much observability it wrote (forensics without PII)',
    /healthWritten, healthFailed,/.test(ts));
  ok('12.9 both counters are clamped to non-negative integers',
    note('u', 'INCOMPLETE', -7, -3, []).dropped === 0 && note('u', 'INCOMPLETE', -7, -3, []).positions === 0
    && note('u', 'INCOMPLETE', 2.9, 4.7, []).dropped === 2 && note('u', 'INCOMPLETE', 2.9, 4.7, []).positions === 4);
  ok('12.10 a missing user_id records nothing rather than a junk row', note(null, 'ERROR') === null && note('', 'ERROR') === null);
}

// ── 2-TER · The CLI migration is the SAME certified SQL ───────────────────
// The file applied by `supabase db push` lives in supabase/migrations/, but the file
// this gate certifies — and the one the reviewer read — is db/…_user_health_1.sql.
// Two copies of a migration WILL drift, and the failure mode is silent and severe:
// the gate would certify one text while production executes another. So identity is
// asserted, not assumed, and there must be exactly ONE migration.
console.log('\n2-TER · Repo-driven schema: migration ≡ certified SQL:');
{
  const MIG_DIR = path.join(ROOT, 'supabase', 'migrations');
  let files = [];
  try { files = fs.readdirSync(MIG_DIR).filter(f => /\.sql$/.test(f)).sort(); } catch (e) { files = []; }
  ok('2t.1 exactly one migration exists', files.length === 1, files.join(' '));
  ok('2t.2 its name carries a CLI-parseable version (YYYYMMDDHHMMSS_slug.sql)',
    files.length === 1 && /^\d{14}_[a-z0-9_]+\.sql$/.test(files[0]), files[0] || '(none)');
  ok('2t.3 it is BYTE-IDENTICAL to the certified db/ file — no drift possible',
    files.length === 1 && fs.readFileSync(path.join(MIG_DIR, files[0]), 'utf8') === sql,
    files.length === 1 ? 'differs' : 'no migration');
  // Everything the certified file guarantees therefore holds for what production runs:
  // one transaction, no destructive statement, no financial table written.
  ok('2t.4 …so the applied text is transactional and non-destructive by inheritance',
    /^begin;$/m.test(sql) && /^commit;$/m.test(sql)
    && !/(^|;)\s*(update|delete|truncate)\s/i.test(SQL_CODE.replace(/\s+/g, ' '))
    && !/into public\.portfolio_snapshots/i.test(SQL_CODE)
    && !/alter table public\.portfolio_snapshots/i.test(SQL_CODE));
}

// ── 13–15 · The financial capturer is untouched ──────────────────────────────
console.log('\n13–15 · LB-1 and the valuation are byte-identical:');
{
  let base = null;
  try { base = cp.execSync('git show ' + BASELINE + ':supabase/functions/portfolio-snapshot/index.ts',
    { cwd: ROOT, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore','pipe','ignore'] }).toString('utf8'); } catch (e) { base = null; }
  ok('13.1 LB-1 still rejects the WHOLE snapshot when a position could not be valued',
    /if \(Number\(v\.dropped_asset_count\) > 0\) \{ incompleteRej\+\+;[^\n]*continue; \}/.test(ts));
  ok('14.1 LB-1 is still evaluated BEFORE the near-dup guard and the insert',
    ts.indexOf('if (Number(v.dropped_asset_count) > 0)') < ts.indexOf('near-duplicate guard')
    && ts.indexOf('if (Number(v.dropped_asset_count) > 0)') < ts.indexOf("admin.from('portfolio_snapshots').insert("));
  ok('15.1 no server-side salvage was introduced — an orphan is still dropped, never 0',
    /if \(!asset\) \{ unpriced\+\+; dropped\+\+; warnings\.push\('orphan_holding:'/.test(ts)
    && !/salvage|_recovered|Activo recuperado/i.test(TS_EXEC));
  ok('15.2 the persisted snapshot row is unchanged (no new financial column, no new source of truth)',
    !/portfolio_snapshots'\)\.insert\(\{[\s\S]{0,1200}user_health/.test(ts)
    && !/insert into public\.portfolio_snapshots/i.test(sql));
  if (base === null) {
    skip('13.2 valueUser byte-identical to ' + BASELINE, BASELINE + ' not in this clone (shallow checkout)');
    skip('13.3 the valuation helpers byte-identical to ' + BASELINE, BASELINE + ' not in this clone (shallow checkout)');
  } else {
    ok('13.2 valueUser is BYTE-IDENTICAL to ' + BASELINE + ' (not one figure can move)',
      fnSrcFrom(base, 'valueUser') === fnSrcFrom(ts, 'valueUser'));
    ['bucketOf','goldPurity','goldGrams','isUsEquityOpenNow','fxToUsd','fetchPrices','timingSafeEqualStr','authorizeCaller']
      .forEach(n => ok('13.3 ' + n + ' byte-identical to ' + BASELINE, fnSrcFrom(base, n) === fnSrcFrom(ts, n)));
  }
}

// ── 16 · Migration hygiene ──────────────────────────────────────────────────
console.log('\n16 · Schema is additive, idempotent and non-destructive:');
{
  ok('16.1 idempotent creates', /create table if not exists public\.portfolio_snapshot_user_health/.test(sql)
    && /create index if not exists portfolio_snapshot_user_health_success_idx/.test(sql)
    && /create or replace function public\.portfolio_snapshot_user_health_upsert/.test(sql)
    && /add column if not exists stale_active_portfolios/.test(sql));
  ok('16.2 the only DROP is the deliberate signature change of the eval function',
    (sql.replace(/--[^\n]*/g, '').match(/\bdrop\b/gi) || []).length === 1
    && /drop function if exists public\.portfolio_snapshot_health_eval\(timestamptz, interval\)/.test(sql));
  // Statement-level, not word-level: `on delete cascade` is a column definition and
  // `do update set` is an upsert, neither is a destructive statement.
  ok('16.3 no destructive STATEMENT exists (no UPDATE/DELETE/TRUNCATE of existing data)',
    !/(^|;)\s*(update|delete|truncate)\s/i.test(SQL_CODE.replace(/\s+/g, ' ')));
  ok('16.4 portfolio_snapshots is never written or altered by this migration',
    !/alter table public\.portfolio_snapshots/i.test(sql) && !/into public\.portfolio_snapshots/i.test(sql));
  ok('16.5 NO backfill — no historical cause is invented',
    !/insert into public\.portfolio_snapshot_user_health[\s\S]{0,200}from public\.portfolio_snapshots/i.test(sql)
    && /No backfill/i.test(sql));
  ok('16.6 a user has NO row until a first observed attempt (absence ≠ a cause)',
    /no row until the first OBSERVED attempt/i.test(sql));
  ok('16.7 duplicate user_id inside one batch cannot abort the statement',
    has(NEW_N, /select distinct on \(user_id\) \* from src order by user_id/));
}

// ── 17–18 · Security ────────────────────────────────────────────────────────
console.log('\n17–18 · anon and publishable can read nothing:');
{
  ok('17.1 RLS enabled on the new table', /alter table public\.portfolio_snapshot_user_health enable row level security/.test(sql));
  ok('17.2 privileges revoked from anon AND authenticated',
    /revoke all on public\.portfolio_snapshot_user_health from anon, authenticated/.test(sql));
  ok('17.3 NO policy is created ⇒ no user can ever observe another account',
    !/create policy[\s\S]{0,120}portfolio_snapshot_user_health/i.test(sql));
  ok('17.4 the writer function is revoked too (service-role / pg_cron only)',
    /revoke all on function public\.portfolio_snapshot_user_health_upsert\(jsonb\) from public, anon, authenticated/.test(sql));
  ok('17.5 the same posture as the existing global signal (not a weaker one)',
    /revoke all on public\.portfolio_snapshot_health from anon, authenticated/.test(sqlV1)
    && /revoke all on public\.portfolio_snapshot_user_health from anon, authenticated/.test(sql));
  ok('18.1 the publishable key IS the anon role ⇒ covered by the same revoke',
    /revoke all on public\.portfolio_snapshot_user_health from anon/.test(sql));
  ok('18.2 the migration introduces no secret', !/sb_secret|service_role_key|INVOKE_KEY|vault/i.test(sql));
  // Compared against the BASELINE, never against itself — and SKIPPED, not silently
  // passed, when the baseline is unreachable. A check that cannot fail is not a check.
  (function () {
    let base = null;
    try { base = cp.execSync('git show ' + BASELINE + ':supabase/functions/portfolio-snapshot/index.ts',
      { cwd: ROOT, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore','pipe','ignore'] }).toString('utf8'); } catch (e) { base = null; }
    if (base === null) { skip('18.2b capturer reads no NEW env var', BASELINE + ' not in this clone (shallow checkout)'); return; }
    const envs = t => (t.match(/Deno\.env\.get\('([^']+)'\)/g) || []).sort().join(',');
    ok('18.2b the capturer reads no NEW env var (compared against the baseline, not itself)',
      envs(base) === envs(ts), envs(ts));
  })();
  ok('18.4 the ONE caller keeps EXECUTE explicitly — revoking from PUBLIC strips what\n        service_role inherited, and a silent 42501 would make the signal born dead',
    /grant execute on function public\.portfolio_snapshot_user_health_upsert\(jsonb\) to service_role;/.test(sql)
    && sql.indexOf('revoke all on function public.portfolio_snapshot_user_health_upsert')
       < sql.indexOf('grant execute on function public.portfolio_snapshot_user_health_upsert'));
  ok('18.3 the migration reads no secret and logs none', !/vault|decrypted_secret/i.test(sql));
}

// ── 19–21 · Watchdog V2 ─────────────────────────────────────────────────────
console.log('\n19–21 · Global contract preserved, one additive field gained:');
{
  ok('19.1 the pure classifier is NOT redefined — the global statuses cannot change',
    !/create or replace function public\.portfolio_snapshot_health_classify/.test(sql)
    && /create or replace function public\.portfolio_snapshot_health_classify/.test(sqlV1));
  // The two CTEs that feed `status` must be logically identical to v1.
  const cte = (s, name) => { const n = sqlNorm(s); const i = n.indexOf(name + ' as ('); if (i < 0) return null;
    let k = n.indexOf('(', i), d = 0; for (; k < n.length; k++) { if (n[k] === '(') d++; else if (n[k] === ')') { d--; if (!d) { k++; break; } } }
    return n.slice(i, k); };
  ok('19.2 the ACTIVE-portfolio CTE is logically identical to v1', cte(sql, 'a') === cte(sqlV1, 'a'), cte(sql, 'a'));
  ok('19.3 the GLOBAL newest-snapshot CTE is logically identical to v1', cte(sql, 's') === cte(sqlV1, 's'), cte(sql, 's'));
  ok('19.4 status is still produced by the same call with the same arguments',
    has(NEW_N, /select public\.portfolio_snapshot_health_classify\(a\.n, s\.ts, p_now, p_stale_after\)/)
    && has(V1_N, /select public\.portfolio_snapshot_health_classify\(a\.n, s\.ts, p_now, p_stale_after\)/));
  ok('19.5 the freshness threshold default is unchanged (30 min = 2 cadences)',
    /p_stale_after interval\s+default interval '30 minutes'/.test(sql)
    && /p_stale_after interval\s+default interval '30 minutes'/.test(sqlV1));
  ok('19.6 every v1 column of the singleton is still written',
    ['checked_at','status','last_snapshot_at','lag_minutes','active_portfolios','stale_after_minutes',
     'stale_since','consecutive_stale_checks','last_incident_started_at','last_incident_ended_at','last_incident_minutes']
      .every(c => new RegExp(c + '\\s*=\\s*excluded\\.' + c).test(sql)));
  ok('19.7 the incident bookkeeping (open/close/preserve) is logically identical to v1',
    sqlNorm(sql.slice(sql.indexOf("if v_status = 'STALE' then"), sql.indexOf('insert into public.portfolio_snapshot_health ('))) ===
    sqlNorm(sqlV1.slice(sqlV1.indexOf("if v_status = 'STALE' then"), sqlV1.indexOf('insert into public.portfolio_snapshot_health ('))));
  ok('20.1 stale_active_portfolios counts ACTIVE portfolios with no recent success',
    has(NEW_N, /join public\.portfolio_snapshot_user_health h on h\.user_id = up\.user_id/)
    && has(NEW_N, /h\.last_success_at is null or p_now - h\.last_success_at > p_stale_after/));
  ok('20.2 it uses the SAME canonical freshness threshold as the global signal',
    !/interval '(?!30 minutes)[^']*'/.test(sql.slice(sql.indexOf('), st as ('), sql.indexOf('select public.portfolio_snapshot_health_classify'))));
  ok('20.3 it reuses the SAME active-portfolio rule (not a second definition)',
    (sqlNorm(sql).match(/jsonb_array_length\(up\.assets\) > 0/g) || []).length === 2);
  ok('20.4 an unobserved account is NOT counted ⇒ activation cannot fake a spike',
    /join public\.portfolio_snapshot_user_health/.test(sql) && !/left join public\.portfolio_snapshot_user_health/.test(sql));
  ok('20.5 the counter is persisted on the EXISTING singleton, not a second global system',
    /stale_active_portfolios\s*=\s*excluded\.stale_active_portfolios/.test(SQL_CODE)
    && /alter table public\.portfolio_snapshot_health\s+add column if not exists stale_active_portfolios/.test(SQL_CODE)
    && !/create table if not exists public\.portfolio_snapshot_health\s*\(/.test(SQL_CODE));
  ok('21.1 a recovered account stops counting — the predicate reads last_success_at,\n        which only an INSERTED attempt advances',
    has(NEW_N, /h\.last_success_at is null or p_now - h\.last_success_at > p_stale_after/)
    && has(NEW_N, /last_success_at = case when excluded\.last_outcome = 'inserted' then v_now else h\.last_success_at end/));
  ok('21.2 nothing latches: no persistent stale flag per user that recovery must clear',
    !/is_stale|stale_flag|marked_stale/i.test(sql));
}

// ── 20-BIS · The stale counter must not be born full of false positives ─────
// Found by the adversarial financial review, and it is the whole deliverable at
// risk: Aurix NEVER deletes a fully-sold position — it becomes `closed` with qty 0
// and its asset STAYS in the catalog. So a liquidated account keeps assets[]
// non-empty ("active"), the capturer skips its zero-quantity holdings, total is 0,
// and it lands in EMPTY with last_success_at NULL forever. Counting those would
// float the metric at N-liquidated-accounts and make a genuinely dark account
// indistinguishable from the noise — the same blindness in a different hat.
console.log('\n20-BIS · "nothing to capture" is not "dark account":');
{
  const st = SQL_CODE.slice(SQL_CODE.indexOf('), st as ('), SQL_CODE.indexOf('select public.portfolio_snapshot_health_classify'));
  // The axis is NOT the outcome. Filtering by last_outcome trades a false-positive
  // floor for two false NEGATIVES, both of which are the canonical shape of the P0.
  ok('20b.1 no recent SUCCESS is the primary condition (not the last outcome)',
    /h\.last_success_at is null or p_now - h\.last_success_at > p_stale_after/.test(st)
    && !/h\.last_outcome in/.test(st), st.replace(/\s+/g, ' ').slice(0, 180));
  ok('20b.2 a liquidated account cannot count — it values 0 positions and drops none\n        (assets stay in the catalog as `closed`, so "active" alone would count it)',
    /h\.attempted_positions  > 0/.test(st) && /h\.dropped_asset_count > 0/.test(st));
  ok('20b.3 FALSE NEGATIVE (i): an OPEN position with a missing price lands in EMPTY with\n        dropped 0 and no warning — attempted_positions is what makes it visible',
    /or h\.attempted_positions  > 0/.test(st));
  ok('20b.4 FALSE NEGATIVE (ii): an account the run never REACHED keeps the previous\n        INSERTED — last_attempt_at is what makes it visible',
    /p_now - h\.last_attempt_at > p_stale_after/.test(st));
  ok('20b.5 …and the premise holds: the capturer skips zero-quantity holdings, so a\n        liquidated account really does value 0 positions',
    /if \(qty === 0\) continue;/.test(ts) && /count\+\+;/.test(ts));
  ok('20b.5b the position count is carried from the capturer, not re-derived in SQL',
    /positions: Number\.isFinite\(n\) && n > 0 \? Math\.floor\(n\) : 0/.test(ts)
    && /noteHealth\([^;]*v\.count[^;]*\)/.test(ts)
    && /greatest\(coalesce\(\(e->>'positions'\)::int, 0\), 0\)/.test(SQL_CODE));
  ok('20b.5c the three no-recent-success cases are a DISJUNCTION, so any one of them\n        surfaces the account',
    /and \(   p_now - h\.last_attempt_at > p_stale_after[\s\S]*or h\.dropped_asset_count > 0[\s\S]*or h\.attempted_positions  > 0\)/.test(st));
  ok('20b.5d a healthy account is excluded by the success test alone, so one transient\n        failure right after a success cannot light the counter',
    st.indexOf('last_success_at is null or') < st.indexOf('p_now - h.last_attempt_at > p_stale_after'));
  // FALSE NEGATIVE (iii) — the exception branch. `catch (e)` cannot see the valuation
  // result, so dropped and attempted_positions are both 0 while last_attempt_at stays
  // fresh: without an explicit disjunct, an account that throws on every tick is
  // invisible. It is the one outcome no counter can speak for.
  ok('20b.6 ERROR is sufficient on its own — the exception branch fills no counter',
    /or h\.last_outcome = 'ERROR'/.test(st));
  ok('20b.6b …and the premise holds: the catch really passes no counters',
    /catch \(e\) \{ errored\+\+; noteHealth\(r && r\.user_id, 'ERROR'\);/.test(ts));
  ok('20b.6c ERROR is an ADDITIONAL sufficient condition, not a restriction — the other\n        three disjuncts survive',
    /p_now - h\.last_attempt_at > p_stale_after/.test(st) && /h\.dropped_asset_count > 0/.test(st)
    && /h\.attempted_positions  > 0/.test(st));
  // The residual false positive is DOCUMENTED, not silently shipped: in valueUser the
  // orphan check precedes the qty check, so a liquidated account owning an orphaned
  // CLOSED holding has dropped>0 with no open position. Counted on purpose.
  ok('20b.7 the orphan-before-qty order is the premise of the documented residual',
    (function () {
      const loop = ts.slice(ts.indexOf('for (const h of holdings) {'), ts.indexOf('const market_state ='));
      return loop.indexOf('if (!asset) {') < loop.indexOf('if (qty === 0) continue;');
    })());
  ok('20b.8 …and the residual is stated in the migration rather than left as a surprise',
    /KNOWN RESIDUAL, deliberate/.test(sql) && /orphaned holding is not a clean liquidation/.test(sql));
  // Re-runnability across revisions of this same hand-applied file.
  ok('20b.9 the column added after the first revision has its own additive ALTER',
    /alter table public\.portfolio_snapshot_user_health\s+add column if not exists attempted_positions int not null default 0;/.test(SQL_CODE)
    && SQL_CODE.indexOf('add column if not exists attempted_positions')
       < SQL_CODE.indexOf('create or replace function public.portfolio_snapshot_user_health_upsert'));
  ok('20b.10 an account whose ONLY holding is orphaned reports INCOMPLETE, not EMPTY',
    /empty\+\+; noteHealth\(r\.user_id, Number\(v\.dropped_asset_count\) > 0 \? 'INCOMPLETE' : 'EMPTY'/.test(ts));
  ok('20b.11 …and a genuinely empty portfolio still reports EMPTY',
    /\? 'INCOMPLETE' : 'EMPTY'/.test(ts));
  ok('20b.12 the branch ORDER and the capture counters are untouched — only the label moved',
    /if \(!Number\.isFinite\(v\.total\) \|\| v\.total <= 0\) \{ empty\+\+;/.test(ts)
    && ts.indexOf('|| v.total <= 0)') < ts.indexOf('if (Number(v.dropped_asset_count) > 0)'));
}

// ── 2-BIS · One bad row must not cost 500 diagnostics ───────────────────────
console.log('\n2-BIS · Per-row resilience and atomic application:');
{
  ok('2b.1 a user_id orphaned from auth.users is FILTERED, not left to abort the chunk',
    /and exists \(select 1 from auth\.users u where u\.id = \(e->>'user_id'\)::uuid\)/.test(SQL_CODE));
  ok('2b.2 the FK is kept (cascade delete keeps the table clean)',
    /references auth\.users \(id\) on delete cascade/.test(SQL_CODE));
  ok('2b.3 the migration applies ATOMICALLY — a partial run cannot leave the global\n        watchdog dropped-but-not-recreated',
    /^\s*begin;/m.test(SQL_CODE) && /^\s*commit;/m.test(SQL_CODE)
    && SQL_CODE.indexOf('begin;') < SQL_CODE.indexOf('drop function if exists public.portfolio_snapshot_health_eval')
    && SQL_CODE.indexOf('commit;') > SQL_CODE.indexOf('create or replace function public.portfolio_snapshot_health_check'));
  ok('2b.4 the counter documents what it counts (observed attempts, not wall-clock ticks)',
    /Consecutive OBSERVED ATTEMPTS that did not insert — not wall-clock ticks/.test(sql));
  ok('2b.5 the table comment is honest about warnings naming an instrument',
    /`warnings` MAY name the instrument, asset id or currency/.test(sql)
    && /never HOW MUCH/.test(sql));
}

// ── 22–25 · Everything downstream is untouched ──────────────────────────────
console.log('\n22–25 · Chart, Performance, Category History Reader, Preview V1:');
{
  let appDiff = null;
  try { appDiff = cp.execSync('git diff ' + BASELINE + ' --name-only', { cwd: ROOT, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore','pipe','ignore'] }).toString('utf8').trim(); } catch (e) { appDiff = null; }
  if (appDiff === null) {
    skip('22–25 app.js untouched vs ' + BASELINE, BASELINE + ' not in this clone (shallow checkout)');
    // History-free fallback: the frontend bundle cannot be reached from this SPEC's files.
    ok('22.1 no file of this SPEC references a frontend owner',
      !/app\.js|switchTab|buildProductionPortfolioChart|_aurixCatHist|_aurixIntelligencePreview/.test(sql + ts));
  } else {
    const files = appDiff.split('\n').filter(Boolean);
    ok('22.1 app.js is NOT in the diff ⇒ Chart, Performance, Reader and Preview cannot have moved',
      files.indexOf('app.js') === -1, files.join(' '));
    ok('22.2 index.html / version.json untouched (no bundle change ⇒ no bump needed)',
      files.indexOf('index.html') === -1 && files.indexOf('version.json') === -1, files.join(' '));
    // git diff omits UNTRACKED files, so the previous form of this check passed on an
    // empty list — vacuously. Status includes them, so the confinement claim is real.
    let status = null;
    // -uall so a brand-new DIRECTORY is listed as its individual files. Without it git
    // collapses supabase/migrations/ to one entry and the allow-list would be checking a
    // directory name instead of the files actually added — a check that no longer sees.
    try { status = cp.execSync('git status --porcelain -uall', { cwd: ROOT, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore','pipe','ignore'] }).toString('utf8'); } catch (e) { status = null; }
    const touched = Array.from(new Set(files.concat(
      (status || '').split('\n').filter(Boolean).map(l => l.slice(3).trim()))));
    // ENUMERATED, never a wildcard over docs/. A pattern like AURIX-*-harness.js would
    // bless editing the detector of ANY invariant in the repo — which is exactly how a
    // weakened LB-1 assertion could slip through this very gate unnoticed. Each gate
    // below is listed because appending the observability call to a branch line moved
    // the literal it pins; touching any OTHER gate must turn this red.
    const ALLOWED = [
      'supabase/functions/portfolio-snapshot/index.ts',
      'db/portfolio_snapshot_user_health_1.sql',
      'docs/AURIX-SNAPSHOT-USER-HEALTH-harness.js',
      'docs/AURIX-BACKEND-LB1-COMPLETENESS-harness.js',
      'docs/AURIX-SNAPSHOT-ENDPOINT-AUTH-harness.js',
      'docs/AURIX-ASSET-LEVEL-HISTORY-FOUNDATION-harness.js',
      'docs/AURIX-CHART-CONTINUOUS-SERVER-SNAPSHOTS-harness.js',
      'docs/AURIX-BACKEND-SNAPSHOT-VALUATION-harness.js',
    ];
    // The migration is the ONE exception to literal enumeration: its name carries a
    // generated timestamp. The pattern is tight (one directory, one shape) and 2t.1
    // caps the count at one, so it cannot become a wildcard over the repo.
    const MIG_RE = /^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/;
    ok('22.3 every touched file is on the EXPLICIT allow-list (untracked included)',
      touched.length > 0 && touched.every(f => ALLOWED.indexOf(f) !== -1 || MIG_RE.test(f)),
      touched.filter(f => ALLOWED.indexOf(f) === -1 && !MIG_RE.test(f)).join(' ') || touched.join(' '));
    // The re-anchored assertions must still REFUSE a conditional LB-1. This is the
    // −24% invariant; a wildcard body would have let `if (!STRICT) continue;` pass.
    ok('22.5 the re-anchored gates still reject a CONDITIONAL LB-1 (no wildcard bodies)',
      (function () {
        const hostile = "if (Number(v.dropped_asset_count) > 0) { incompleteRej++; noteHealth(x); if (!STRICT) continue; }";
        const files = ['docs/AURIX-BACKEND-LB1-COMPLETENESS-harness.js',
                       'docs/AURIX-SNAPSHOT-ENDPOINT-AUTH-harness.js',
                       'docs/AURIX-ASSET-LEVEL-HISTORY-FOUNDATION-harness.js'];
        return files.every(f => {
          const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
          if (/\[\^}\]\*/.test(src)) return false;              // no wildcard body survived
          const m = src.match(/\/if \\\(Number\\\(v\\\.dropped_asset_count\\\) > 0[^/]*\//);
          if (!m) return false;
          let re; try { re = new RegExp(m[0].slice(1, -1)); } catch (e) { return false; }
          return re.test(ts) && !re.test(hostile);               // accepts real, refuses hostile
        });
      })());
    ok('22.4 the three deliverables of this SPEC are all present in the change set',
      ['supabase/functions/portfolio-snapshot/index.ts', 'db/portfolio_snapshot_user_health_1.sql',
       'docs/AURIX-SNAPSHOT-USER-HEALTH-harness.js'].every(f => touched.indexOf(f) !== -1),
      touched.join(' '));
  }
  ok('24.1 the Category History Reader contract is not referenced by this SPEC',
    !/_aurixCatHist|aurixCategoryHistory|category_values/.test(ts.slice(ts.indexOf('SPEC PER-USER SNAPSHOT CONTINUITY OBSERVABILITY'), ts.indexOf('function normalizeWarnings'))));
  ok('25.1 no entitlement, pricing, analytics or UI surface appears anywhere',
    !/premium|pricing|checkout|entitlement|analytics|innerHTML/i.test(sql)
    && !/premium|pricing|checkout|entitlement/i.test(ts));
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + '  ' + pass + ' passed, ' + fail + ' failed'
  + (skipped ? ', ' + skipped + ' skipped (baseline not reachable — run in a full clone)' : '') + '\n');
process.exit(fail ? 1 : 0);
