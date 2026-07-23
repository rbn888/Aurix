'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-ACCESS-EMAIL-CAPTURE-harness — HOTFIX P0 (guaranteed email capture before OTP)
// ════════════════════════════════════════════════════════════════════════════
// CONTRACT: "Every valid email entered to access Aurix is persisted into the HISTORICAL table
// (public.waitlist — the card the owner sees as 'correos usuario') BEFORE the OTP is requested, via ONE
// shared owner used by every entry point (submit + resend). Persistence is normalized (trim+lowercase) and
// idempotent (no duplicate; existing rows / testers / owner untouched). If persistence is not confirmed the
// OTP is NOT sent (CASO C) and a human, table-name-free message is shown. No new table is created; the RPC
// is SECURITY DEFINER, cannot enumerate/read/edit other rows, and never exposes the service_role key."
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const login = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'db', 'access_email_persist_1.sql'), 'utf8');
const waitlistSql = fs.readFileSync(path.join(root, 'db', 'waitlist_1.sql'), 'utf8');

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }
function region(src, startNeedle, endNeedle) { const a = src.indexOf(startNeedle); if (a < 0) return ''; const b = endNeedle ? src.indexOf(endNeedle, a + 1) : src.length; return src.slice(a, b > a ? b : src.length); }

console.log('AURIX-ACCESS-EMAIL-CAPTURE — HOTFIX P0\n');

// ── 1 single shared owner ─────────────────────────────────────────────────────
console.log('1 — single shared owner (no duplicated inserts):');
ok('1.1 persistAccessEmail defined exactly once', (login.match(/async function persistAccessEmail\s*\(/g) || []).length === 1);
ok('1.2 writes via the public RPC persist_access_email (no client insert, no service key)',
  /client\.rpc\(\s*['"]persist_access_email['"]/.test(login) && !/SERVICE_ROLE_KEY|service_role_key|SUPABASE_SERVICE|sb_secret/i.test(login));
ok('1.3 called from ≥2 entry points (submit + resend)', (login.match(/persistAccessEmail\(/g) || []).length >= 3); // 1 def + 2 calls

// ── 2 submit path: persist BEFORE OTP, block on failure (CASO C) ───────────────
console.log('2 — email submit path (persist → confirm → OTP):');
const submit = region(login, 'submitBtn.onclick = async () =>', "otpCodeEl.addEventListener('input'");
ok('2.1 submit persists BEFORE signInWithOtp', submit.indexOf('persistAccessEmail(') >= 0 && submit.indexOf('persistAccessEmail(') < submit.indexOf('client.auth.signInWithOtp'));
ok('2.2 submit BLOCKS the OTP when persistence fails (guard + return before OTP)',
  /if \(!persisted\)\s*\{[\s\S]{0,240}return;\s*\}/.test(submit) && submit.search(/if \(!persisted\)/) < submit.indexOf('client.auth.signInWithOtp'));
ok('2.3 submit normalizes the email (trim already applied + lowercase)', /const normalizedEmail = email\.toLowerCase\(\)/.test(submit) && /persistAccessEmail\(normalizedEmail/.test(submit));
ok('2.4 submit shows the human retry message (no table/SQL detail)', /errorEl\.innerText\s*=\s*tL\('lg\.err\.persist'\)/.test(submit));

// ── 3 resend path: persist BEFORE OTP too ──────────────────────────────────────
console.log('3 — resend path (persist → confirm → OTP):');
const resend = region(login, "otpResendEl.addEventListener('click'", 'localStorage restore');
const resendBody = resend || region(login, "otpResendEl.addEventListener('click'", null);
ok('3.1 resend persists BEFORE signInWithOtp', resendBody.indexOf('persistAccessEmail(') >= 0 && resendBody.indexOf('persistAccessEmail(') < resendBody.indexOf('client.auth.signInWithOtp'));
ok('3.2 resend blocks re-send when persistence fails', /if \(!_persistedResend\)\s*\{[\s\S]{0,240}return;\s*\}/.test(resendBody) && resendBody.search(/if \(!_persistedResend\)/) < resendBody.indexOf('client.auth.signInWithOtp'));
ok('3.3 resend normalizes (trim + lowercase)', /persistAccessEmail\(String\(email\)\.trim\(\)\.toLowerCase\(\)/.test(resendBody));

// ── 4 human messages present + leak-free ────────────────────────────────────────
console.log('4 — error messaging:');
ok('4.1 ES message exact', login.includes("'lg.err.persist': 'No hemos podido preparar tu acceso. Inténtalo de nuevo en unos segundos.'"));
ok('4.2 EN message exact', login.includes("'lg.err.persist': 'We couldn’t prepare your access. Please try again in a few seconds.'"));
ok('4.3 no table name / SQL / Supabase internals leaked to the user copy', !/waitlist|correos_usuario|SQLSTATE|row-level|RLS|supabase/i.test(login.match(/'lg\.err\.persist':[^\n]*/g).join(' ')));

// ── 5 migration SQL — RPC contract ──────────────────────────────────────────────
console.log('5 — migration SQL (public.persist_access_email):');
ok('5.1 SECURITY DEFINER + pinned search_path', /create or replace function public\.persist_access_email/.test(sql) && /security definer/.test(sql) && /set search_path = public/.test(sql));
ok('5.2 normalizes (lower + btrim) and validates before persisting', /lower\(btrim\(coalesce\(p_email/.test(sql) && /raise exception 'invalid_email'/.test(sql));
ok('5.3 idempotent upsert onto the EXISTING email UNIQUE (on conflict do nothing)', /insert into public\."Correos usuario"/.test(sql) && /on conflict \(email\) do nothing/.test(sql));
ok('5.4 inserts a NEUTRAL row (name \'\' for NOT NULL) — never overwrites history', /values \('',\s*v_email/.test(sql));
ok('5.5 returns void → cannot enumerate whether an email already exists', /returns void/.test(sql));
ok('5.6 grants EXECUTE to anon/authenticated, revokes from public (function only, not the table)',
  /revoke all\s+on function public\.persist_access_email\(text, text\) from public/.test(sql) && /grant\s+execute\s+on function public\.persist_access_email\(text, text\) to anon, authenticated/.test(sql));

// ── 6 no new table / no data loss / reuse historical table ───────────────────────
console.log('6 — reuse historical table, create nothing new, delete nothing:');
ok('6.1 creates NO table (function only)', !/create table/i.test(sql));
ok('6.2 targets the historical table public."Correos usuario" ONLY (no parallel table)', /public\."Correos usuario"/.test(sql) && !/access_emails|user_emails|leads|waitlist_emails/i.test(sql));
ok('6.3 the historical table\'s email UNIQUE constraint exists (documented origin: waitlist_1.sql, preserved through the physical rename)', /email\s+text\s+not null unique/.test(waitlistSql));
ok('6.4 never deletes/drops data (no delete/drop table/truncate)', !/delete from|drop table|truncate/i.test(sql));
ok('6.5 does not touch auth.users / portfolios / onboarding', !/auth\.users|user_portfolios|user_onboarding/.test(sql));

// ── 7 rollback documented + reversible ──────────────────────────────────────────
console.log('7 — rollback:');
ok('7.1 rollback block present (drop function) and preserves captured emails', /drop function if exists public\.persist_access_email/.test(sql) && /NEVER deletes captured emails/i.test(sql));

// ── 8 no regression to OTP engine / invite gate / public-launch ──────────────────
console.log('8 — no regression (OTP engine, invite gate, public launch intact):');
ok('8.1 OTP engine unchanged (signInWithOtp shouldCreateUser + verifyOtp still present)', /signInWithOtp\(\{[\s\S]{0,80}shouldCreateUser: true/.test(login) && /verifyOtp\(/.test(login));
ok('8.2 invite gate untouched (validate_invite_code RPC still used)', /validate_invite_code/.test(login));
ok('8.3 public-launch gate untouched (isPublicLaunchOpen still gates the submit)', /isPublicLaunchOpen\(\)/.test(login));
ok('8.4 client is table-agnostic: login.html names NO physical table, writes only via the RPC', !/rest\/v1\/(waitlist|Correos)/.test(login) && !/from\(\s*['"](waitlist|Correos)/.test(login) && /client\.rpc\(\s*['"]persist_access_email/.test(login));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
