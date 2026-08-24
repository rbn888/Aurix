'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-SNAPSHOT-ENDPOINT-AUTH-harness — SPEC SECURE-SNAPSHOT-ENDPOINT
// ════════════════════════════════════════════════════════════════════════════
// P0 security regression. `portfolio-snapshot` was deployed with verify_jwt = false AND no check of its
// own — the handler did not even receive the Request — so the endpoint was invocable anonymously while
// reading every user's portfolio with the service role and, in DRY_RUN, returning per-user valuations.
// This certifies the function's own auth gate: apikey-based, fail-CLOSED, publishable-key-refusing, and
// evaluated BEFORE any privileged operation. Pure auth — the financial valuation is untouched.
const fs = require('fs'), vm = require('vm'), path = require('path');
const SRC = path.join(__dirname, '..', 'supabase', 'functions', 'portfolio-snapshot', 'index.ts');
const ts = fs.readFileSync(SRC, 'utf8');
const CRON = fs.readFileSync(path.join(__dirname, '..', 'db', 'portfolio_snapshots_cron_1.sql'), 'utf8');
// NOTE: extract from the TYPE-STRIPPED source. A return annotation like `: { ok: boolean; … }` contains
// a brace, which would otherwise close the body matcher immediately and truncate the function.
function fnSrcFrom(src, name){ const s='function '+name+'('; const i=src.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=src.indexOf('(',i), pd=0; for(;p<src.length;p++){ if(src[p]==='(')pd++; else if(src[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=src.indexOf('{',p), d=0; for(;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d){k++;break;}}}
  return src.slice(i,k); }
function fnSrc(name){ return fnSrcFrom(ts, name); }
// minimal TS→JS: drop parameter/return type annotations from the two auth helpers (they use only simple
// annotations by design, so the real bodies run verbatim — no reimplementation in this harness).
function deTs(src){
  return src
    .replace(/\(req: Request\)/g, '(req)')
    .replace(/\(a: string, b: string\)/g, '(a, b)')
    .replace(/\): \{ ok: boolean; status: number; reason: string \}/g, ')')
    .replace(/\): boolean/g, ')');
}
const TS_JS = deTs(ts);
let pass=0,fail=0; function ok(n,c,info){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(info?'  ['+info+']':''));} }

const SECRET       = 'sb_secret_' + 'K7bQ2v9XmR4tN8wZ1cJ6hF3sL0yA5pD';   // fixture only — not a real key
const PUBLISHABLE  = 'sb_publishable_' + 'aB3dE6gH9jK2mN5pQ8sT1vW4xZ7yC0';
function ctx(invokeKey){
  const sb = { TextEncoder, console:{log:()=>{},error:()=>{}} };
  vm.createContext(sb);
  vm.runInContext('const INVOKE_KEY = ' + JSON.stringify(invokeKey) + ';', sb);
  vm.runInContext(fnSrcFrom(TS_JS, 'timingSafeEqualStr'), sb);
  vm.runInContext(fnSrcFrom(TS_JS, 'authorizeCaller'), sb);
  return vm.runInContext('authorizeCaller', sb);
}
// a Request stand-in with only what the gate touches
function req(headers){
  const h = new Map(Object.entries(headers || {}).map(([k,v]) => [k.toLowerCase(), v]));
  return { headers: { get: k => (h.has(String(k).toLowerCase()) ? h.get(String(k).toLowerCase()) : null) } };
}

console.log('AURIX-SNAPSHOT-ENDPOINT-AUTH — SPEC SECURE-SNAPSHOT-ENDPOINT\n');

// ── A — anonymous request is refused ────────────────────────────────────────
console.log('CASO A — request sin apikey ⇒ rechazada antes de cualquier operación privilegiada');
{
  const auth = ctx(SECRET);
  const r = auth(req({}));
  ok('no apikey ⇒ not ok', r.ok === false);
  ok('status is 401', r.status === 401, 'got ' + r.status);
  ok('empty apikey header ⇒ also refused', auth(req({ apikey: '' })).ok === false);
  // the ORDER is the whole point: auth must be the first thing in the handler
  const handler = ts.slice(ts.indexOf('Deno.serve(async (req'), ts.indexOf('Deno.serve(async (req') + 700);
  ok('handler receives the Request', /Deno\.serve\(async \(req: Request\) =>/.test(ts));
  ok('authorizeCaller runs before createClient', handler.indexOf('authorizeCaller(req)') < handler.indexOf('createClient('));
  ok('…and before the user_portfolios read',
     ts.indexOf('authorizeCaller(req)') < ts.indexOf("from('user_portfolios')"));
  ok('…and before any price fetch', ts.indexOf('authorizeCaller(req)') < ts.indexOf('fetchPrices(allSymbols)'));
  ok('…and before any insert', ts.indexOf('authorizeCaller(req)') < ts.indexOf("from('portfolio_snapshots').insert"));
}

// ── B — wrong credential is refused ────────────────────────────────────────
console.log('\nCASO B — credencial incorrecta ⇒ rechazada');
{
  const auth = ctx(SECRET);
  ok('a different secret of equal length ⇒ 403',
     auth(req({ apikey: 'sb_secret_' + 'X'.repeat(SECRET.length - 10) })).status === 403);
  ok('a truncated secret ⇒ 403', auth(req({ apikey: SECRET.slice(0, -1) })).status === 403);
  ok('a secret with trailing whitespace ⇒ 403', auth(req({ apikey: SECRET + ' ' })).status === 403);
  ok('the comparison is length-checked then constant-time',
     /if \(ea\.length !== eb\.length\) return false/.test(fnSrc('timingSafeEqualStr')) &&
     /diff \|= ea\[i\] \^ eb\[i\]/.test(fnSrc('timingSafeEqualStr')));
  // a stale Authorization: Bearer must NOT grant access (the old contract is gone)
  ok('Authorization: Bearer alone grants nothing', auth(req({ authorization: 'Bearer ' + SECRET })).ok === false);
}

// ── C — the publishable key never grants server privileges ─────────────────
console.log('\nCASO C — publishable key ⇒ nunca obtiene privilegios server-side');
{
  ok('presented publishable key ⇒ 403', ctx(SECRET)(req({ apikey: PUBLISHABLE })).status === 403);
  // and it cannot even be CONFIGURED as the expected secret (it ships in the frontend bundle)
  const misconf = ctx(PUBLISHABLE);
  ok('publishable configured as the expected secret ⇒ every call refused',
     misconf(req({ apikey: PUBLISHABLE })).ok === false && misconf(req({ apikey: SECRET })).ok === false);
  ok('…and it reports as a misconfiguration, not a bad caller',
     misconf(req({ apikey: PUBLISHABLE })).status === 503);
}

// ── D — the valid secret is accepted ───────────────────────────────────────
console.log('\nCASO D — secret key válida ⇒ continúa al handler');
{
  const r = ctx(SECRET)(req({ apikey: SECRET }));
  ok('valid apikey ⇒ ok', r.ok === true);
  ok('status 200', r.status === 200);
  ok('header lookup is case-insensitive like a real Request', ctx(SECRET)(req({ APIKEY: SECRET })).ok === true);
}

// ── FAIL-CLOSED — a deploy without the secret must be inert, never open ────
console.log('\nFAIL-CLOSED — sin secreto configurado no se abre, se cierra');
{
  ok('no INVOKE_KEY ⇒ every request refused', ctx('')(req({ apikey: SECRET })).ok === false);
  ok('…with 503 (not configured), never 200', ctx('')(req({ apikey: SECRET })).status === 503);
  ok('a short/implausible secret is refused too', ctx('short')(req({ apikey: 'short' })).ok === false);
  ok('an anonymous call against an unconfigured function is still refused', ctx('')(req({})).ok === false);
}

// ── E — DRY_RUN still blocks inserts, and is now behind auth ───────────────
console.log('\nCASO E — DRY_RUN sigue bloqueando inserts y queda tras el gate');
{
  ok('DRY_RUN still short-circuits before the insert',
     ts.indexOf("if (DRY_RUN) { console.log('[DRY_RUN]'") < ts.indexOf("from('portfolio_snapshots').insert"));
  ok('DRY_RUN continues without writing', /if \(DRY_RUN\) \{ console\.log\('\[DRY_RUN\]'[\s\S]{0,80}skipped\+\+; noteHealth\([^;]*\); continue; \}/.test(ts));
  // FASE 3 — the per-user samples are unreachable without auth
  ok('samples are only built inside the handler, after the gate',
     ts.indexOf('authorizeCaller(req)') < ts.indexOf('dryRunSamples.push'));
  ok('samples are only returned in the authenticated response',
     ts.indexOf('authorizeCaller(req)') < ts.indexOf('samples: dryRunSamples'));
}

// ── F — the service role stays an internal, server-only credential ─────────
console.log('\nCASO F — service-role permanece credencial interna del servidor');
{
  ok('service role comes from the env only', /const SERVICE_ROLE = Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)!/.test(ts));
  ok('it is never used to authenticate the CALLER', !/apikey[\s\S]{0,80}SERVICE_ROLE|SERVICE_ROLE[\s\S]{0,80}presented/.test(ts));
  ok('it is never echoed in a response or log', !/(Response|console\.(log|error))\([^)]{0,120}SERVICE_ROLE/.test(ts));
  ok('the invoke secret is never echoed either',
     !/(Response|console\.(log|error))\([^)]{0,120}INVOKE_KEY/.test(ts));
  ok('the error body is generic (no reason leaked to the caller)',
     /error: 'unauthorized'/.test(ts) && !/error: auth\.reason/.test(ts));
  ok('no secret literal was committed', !/sb_secret_[A-Za-z0-9]{10}/.test(ts) && !/sb_secret_[A-Za-z0-9]{10}/.test(CRON));
}

// ── G — the financial logic is untouched ───────────────────────────────────
console.log('\nCASO G — lógica financiera intacta');
{
  ok('gold purity mirror intact', /const PURITY_TABLE[\s\S]{0,200}'24': 1\.0000/.test(ts));
  ok('gold grams × purity × spot/OZ_TO_G intact', /grams \* purity \* \(spotPerOz \/ OZ_TO_G\)/.test(ts));
  ok('LB-1 partial-valuation gate intact', /if \(Number\(v\.dropped_asset_count\) > 0\) \{ incompleteRej\+\+; noteHealth\([^;]*\); continue; \}/.test(ts));
  ok('near-duplicate guard intact', /dt <= NEAR_MS && dv <= NEAR_FRAC/.test(ts));
  ok('investable buckets unchanged', /INVESTABLE_TYPES = new Set\(\['crypto', 'stock', 'etf', 'fund', 'metal', 'liquidity', 'cash', 'other'\]\)/.test(ts));
  // ASSET-LEVEL-HISTORICAL-DATA-FOUNDATION — el insert gana `asset_values` (aditivo,
  // write-only). El invariante sigue siendo que NINGÚN campo existente desaparece o
  // cambia de significado, así que se comprueban uno a uno en vez de exigir que dos
  // sean contiguos: la adyacencia textual nunca fue el contrato.
  ok('inserted fields unchanged (+ asset_values, aditivo)',
     ['user_id:', 'ts:', 'total_value_usd:', 'real_estate:', 'category_values:', 'asset_count:',
      "source: 'backend_snapshot'", "confidence: 'scheduled'", 'market_state:', 'price_staleness:',
      'schema_version:'].every(f => ts.includes(f)) && /schema_version: \d+,/.test(ts)
     && /asset_values: v\.assetValues/.test(ts));
}

// ── CRON — pg_net presents the secret the function actually checks ─────────
console.log('\nCRON — pg_net envía la credencial que la función valida');
{
  ok('cron sends the apikey header', /'apikey', \(select decrypted_secret from vault\.decrypted_secrets where name = 'aurix_snapshot_invoke_key'\)/.test(CRON));
  ok('the stale Authorization: Bearer header is gone', !/'Authorization', 'Bearer '/.test(CRON));
  ok('only the strictly required headers remain',
     (CRON.match(/jsonb_build_object\(\s*'Content-Type', 'application\/json',\s*[\s\S]{0,400}?'apikey'/) || []).length === 1);
  ok('the secret is still read from Vault, never inlined', /vault\.decrypted_secrets/.test(CRON));
  ok('the prerequisite documents a SECRET key and refuses publishable', /NEVER a publishable key/.test(CRON));
  ok('the target function is unchanged', /functions\.supabase\.co\/portfolio-snapshot/.test(CRON));
  ok('the 15-minute cadence is unchanged', /'\*\/15 \* \* \* \*'/.test(CRON));
}

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail === 0 ? 0 : 1);
