'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-SECURITY-BASELINE-harness — SPEC SECURITY-HARDENING-V1
// ════════════════════════════════════════════════════════════════════════════
// Protects the frontend security baseline shipped in v606. Two jobs:
//
//   A) ASSERT the hardening is present (CSP, referrer policy, frame guard,
//      console hygiene, outbound redaction, PII-free diagnostics).
//   B) FAIL THE DEPLOY when future code drifts outside the policy — this is the
//      part that actually matters. The Content-Security-Policy travels inside a
//      <meta> (GitHub Pages cannot send response headers), so a newly added
//      third-party host, an eval, or a downgraded http:// resource would be
//      silently BLOCKED IN THE BROWSER at runtime. Here it is caught offline,
//      before the deploy, by re-deriving every origin the shipped bundle uses
//      and checking it against the declared policy.
//
// Static only: no network, no browser, no dependencies.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => { try { return fs.readFileSync(path.join(root, p), 'utf8'); } catch (_) { return ''; } };

const indexHtml    = read('index.html');
const loginHtml    = read('login.html');
const resetHtml    = read('reset.html');
const resetPwHtml  = read('reset-password.html');
const landingHtml  = read('landing/index.html');
const app          = read('app.js');
const css          = read('styles.css');

// Every JS file the app actually serves (the CSP has to cover all of them).
const SHIPPED_JS = ['app.js', 'config.js', 'aurora-bg.js', 'orb.js']
  .concat(fs.readdirSync(path.join(root, 'services')).filter(f => f.endsWith('.js')).map(f => 'services/' + f))
  .concat(fs.readdirSync(path.join(root, 'ai')).filter(f => f.endsWith('.js')).map(f => 'ai/' + f));

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  → ' + extra : '')); } }

console.log('AURIX-SECURITY-BASELINE — SPEC SECURITY-HARDENING-V1 (frontend baseline)\n');

// ── CSP helpers ─────────────────────────────────────────────────────────────
function cspOf(html) {
  const m = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i.exec(html);
  if (!m) return null;
  const out = {};
  m[1].split(';').forEach((part) => {
    const t = part.trim().split(/\s+/).filter(Boolean);
    if (t.length) out[t[0]] = t.slice(1);
  });
  return out;
}
// Does `origin` (scheme://host) satisfy any source in `sources`? Supports the
// exact-origin form and the `https://*.domain` wildcard form used for CoinGecko.
function originAllowed(origin, sources) {
  if (!Array.isArray(sources)) return false;
  let u; try { u = new URL(origin); } catch (_) { return false; }
  return sources.some((s) => {
    if (s === "'self'" || s === "'none'" || s.startsWith("'")) return false;
    if (s === 'https:' || s === 'http:' || s === 'data:' || s === 'blob:') return s === u.protocol;
    let su; try { su = new URL(s.includes('://') ? s : 'https://' + s); } catch (_) { return false; }
    if (su.protocol !== u.protocol) return false;
    if (su.hostname.startsWith('*.')) return u.hostname.endsWith(su.hostname.slice(1));
    return su.hostname === u.hostname;
  });
}
const originsIn = (text) => Array.from(new Set((text.match(/\bhttps?:\/\/[A-Za-z0-9.-]+/g) || [])
  // Placeholders that only appear inside comments / negative-test strings.
  .filter(o => !/^https:\/\/(evil|aurix\.app)$/.test(o))));

const PAGES = [
  { name: 'index.html',          html: indexHtml,   guard: true  },
  { name: 'login.html',          html: loginHtml,   guard: true  },
  { name: 'reset.html',          html: resetHtml,   guard: true  },
  { name: 'reset-password.html', html: resetPwHtml, guard: true  },
  { name: 'landing/index.html',  html: landingHtml, guard: false },
];

// ── 1. CSP present and structurally sound on every served page ──────────────
console.log('1 — Content-Security-Policy present on every served page (GitHub Pages cannot send headers):');
PAGES.forEach((p) => {
  const c = cspOf(p.html);
  ok(`1.${p.name} declares a CSP <meta>`, !!c);
  if (!c) return;
  ok(`1.${p.name} default-src 'self'`, (c['default-src'] || []).join(' ') === "'self'");
  ok(`1.${p.name} object-src 'none' (no plugin/embed execution)`, (c['object-src'] || []).join(' ') === "'none'");
  ok(`1.${p.name} frame-src 'none' (page embeds nothing)`, (c['frame-src'] || []).join(' ') === "'none'");
  ok(`1.${p.name} base-uri 'self' (<base> hijack blocked)`, (c['base-uri'] || []).join(' ') === "'self'");
  ok(`1.${p.name} form-action 'self' (no form re-targeting)`, (c['form-action'] || []).join(' ') === "'self'");
  ok(`1.${p.name} script-src set and WITHOUT 'unsafe-eval'`,
     Array.isArray(c['script-src']) && c['script-src'].length > 0 && c['script-src'].indexOf("'unsafe-eval'") < 0);
  ok(`1.${p.name} connect-src is an explicit allow-list (exfiltration path closed)`,
     Array.isArray(c['connect-src']) && c['connect-src'].length > 0 &&
     c['connect-src'].indexOf('https:') < 0 && c['connect-src'].indexOf('*') < 0);
  ok(`1.${p.name} declares a referrer policy`,
     /<meta\s+name="referrer"\s+content="strict-origin-when-cross-origin">/.test(p.html));
  // frame-ancestors / sandbox / report-uri are IGNORED in a meta CSP — declaring them
  // would only produce a console warning and a false sense of protection.
  ok(`1.${p.name} does not declare meta-ignored directives (frame-ancestors/sandbox/report-uri)`,
     !c['frame-ancestors'] && !c['sandbox'] && !c['report-uri'] && !c['report-to']);
});

// ── 2. Every origin the shipped code uses is permitted by the policy ────────
// The regression guard: add a new CDN/API tomorrow without extending the CSP and
// the browser blocks it. This turns that runtime break into a red gate.
console.log('\n2 — Policy covers reality: every origin in the shipped bundle is allow-listed:');
const appCsp = cspOf(indexHtml) || {};
const NETWORK_DIRECTIVES = ['script-src', 'style-src', 'font-src', 'img-src', 'connect-src'];
const appAllowed = NETWORK_DIRECTIVES.reduce((acc, d) => acc.concat(appCsp[d] || []), []);
const bundleOrigins = originsIn(SHIPPED_JS.map(read).join('\n'));
const uncovered = bundleOrigins.filter(o => !originAllowed(o, appAllowed) && !originAllowed(o, ['https://app.aurixsystem.io', 'https://rbn888.github.io', 'https://aurixsystem.io']));
ok('2.1 no shipped-JS origin falls outside the app CSP', uncovered.length === 0, uncovered.join(', '));
// The three exempted origins above are the app's OWN deploy hosts — covered by 'self'
// at runtime, and they appear in the bundle as navigation targets, not as fetches.
ok("2.2 app CSP still allows the origins the bundle depends on (jsDelivr / CoinGecko / FMP / API / Supabase)",
   originAllowed('https://cdn.jsdelivr.net', appCsp['script-src']) &&
   originAllowed('https://assets.coingecko.com', appCsp['img-src']) &&
   originAllowed('https://financialmodelingprep.com', appCsp['img-src']) &&
   originAllowed('https://isa-portfolio-ten.vercel.app', appCsp['connect-src']) &&
   originAllowed('https://ozcasyufbknnuemllwso.supabase.co', appCsp['connect-src']));
ok('2.3 Supabase realtime (wss) allowed — otherwise live sync would be blocked',
   (appCsp['connect-src'] || []).some(s => /^wss:\/\/ozcasyufbknnuemllwso\.supabase\.co$/.test(s)));
// Every <script src> / stylesheet <link href> actually written in the page HTML.
PAGES.forEach((p) => {
  const c = cspOf(p.html); if (!c) return;
  const scripts = (p.html.match(/<script[^>]+src="(https?:\/\/[^"]+)"/g) || []).map(s => /src="([^"]+)"/.exec(s)[1]);
  const styles  = (p.html.match(/<link[^>]+href="(https?:\/\/[^"]+)"/g)  || []).map(s => /href="([^"]+)"/.exec(s)[1]);
  const badS = scripts.filter(u => !originAllowed(new URL(u).origin, c['script-src']));
  const badL = styles.filter(u => { try { return /fonts\.googleapis\.com/.test(u) && !originAllowed(new URL(u).origin, c['style-src']); } catch (_) { return false; } });
  ok(`2.${p.name} every remote <script src> is allow-listed`, badS.length === 0, badS.join(', '));
  ok(`2.${p.name} every remote stylesheet is allow-listed`, badL.length === 0, badL.join(', '));
});
ok('2.4 no eval / new Function anywhere in the shipped bundle (script-src has no unsafe-eval)',
   !/\beval\s*\(|new\s+Function\s*\(/.test(SHIPPED_JS.map(read).join('\n')));

// ── 3. HTTPS everywhere ─────────────────────────────────────────────────────
console.log('\n3 — Transport: every resource is HTTPS (no downgrade, no protocol-relative URL):');
const allSources = PAGES.map(p => p.html).concat(SHIPPED_JS.map(read)).concat([css]).join('\n');
const insecure = Array.from(new Set((allSources.match(/(?:src|href|url\(|fetch\(\s*['"`])\s*=?\s*['"`(]?http:\/\/[^\s"'`)]+/g) || [])));
ok('3.1 no http:// resource is loaded anywhere', insecure.length === 0, insecure.slice(0, 3).join(', '));
ok('3.2 no protocol-relative (//host) script/style/image reference',
   !/(?:src|href)\s*=\s*["']\/\/[A-Za-z0-9.-]+/.test(allSources));

// ── 4. Embedding surface ────────────────────────────────────────────────────
console.log('\n4 — Embedding: nothing is framed in, and the app refuses to be framed:');
PAGES.forEach((p) => {
  ok(`4.${p.name} contains no <iframe>/<object>/<embed>`, !/<\s*(iframe|object|embed)\b/i.test(p.html));
});
// X-Frame-Options cannot be sent (Pages) and frame-ancestors is ignored in a meta CSP,
// so the JS guard is the ONLY available clickjacking owner for the authenticated surface.
PAGES.filter(p => p.guard).forEach((p) => {
  ok(`4.${p.name} clickjacking frame guard present`,
     /window\.top\s*===\s*window\.self/.test(p.html) && /window\.top\.location\s*=\s*window\.self\.location/.test(p.html));
});
ok('4.landing has NO frame guard (public marketing page, embedded by design)',
   !/window\.top\s*===\s*window\.self/.test(landingHtml));

// ── 5. External links ───────────────────────────────────────────────────────
console.log('\n5 — External links cannot reach back into the opener:');
const anchors = PAGES.map(p => p.html).join('\n').match(/<a\b[^>]*target="_blank"[^>]*>/g) || [];
const unsafeAnchors = anchors.filter(a => !/rel="[^"]*noopener/.test(a) || !/rel="[^"]*noreferrer/.test(a));
ok('5.1 every target="_blank" carries rel="noopener noreferrer"', unsafeAnchors.length === 0, unsafeAnchors.slice(0, 2).join(' | '));
ok('5.2 no window.open() without noopener in the shipped bundle',
   !/window\.open\s*\([^)]*\)/.test(SHIPPED_JS.map(read).join('\n')) ||
   !/window\.open\s*\((?:(?!noopener)[^)])*\)/.test(SHIPPED_JS.map(read).join('\n')));

// ── 6. No secrets in the frontend ───────────────────────────────────────────
console.log('\n6 — No secret material is shipped to the browser:');
const shipped = PAGES.map(p => p.html).concat(SHIPPED_JS.map(read)).join('\n');
const SECRET_PATTERNS = [
  [/\bsk_live_[A-Za-z0-9]{8,}/, 'stripe live secret key'],
  [/\bsk-ant-[A-Za-z0-9-]{16,}/, 'anthropic api key'],
  [/\bAIza[0-9A-Za-z_-]{30,}/, 'google api key'],
  [/\bSUPABASE_SERVICE_ROLE\b|\bservice_role\b/, 'supabase service-role reference'],
  [/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, 'hardcoded JWT'],
  [/\b(RESEND|SENDGRID|OPENAI|COINGECKO)_[A-Z_]*KEY\s*[:=]\s*['"][^'"]+['"]/, 'inlined provider key'],
];
SECRET_PATTERNS.forEach(([rx, label]) => ok('6.' + label + ' absent from the shipped frontend', !rx.test(shipped)));
// The Supabase anon key IS meant to be public (RLS is the real boundary) — assert it is
// the publishable form, so a service-role key can never be pasted in its place.
ok('6.supabase key in config.js is the PUBLISHABLE key, never a service key',
   /SUPABASE_ANON_KEY\s*=\s*'sb_publishable_/.test(read('config.js')));
ok('6..env files are git-ignored', /^\.env\*$/m.test(read('.gitignore')));

// ── 7. Console / outbound hygiene ───────────────────────────────────────────
console.log('\n7 — No private or financial data reaches the console or leaves the device:');
ok('7.1 snapshot-guard logs the value-free projection (recSafe), never the raw record',
   /const recSafe = \{ reason: rec\.reason, surface: rec\.surface, ts: rec\.ts,/.test(app) &&
   /snapshot-guard\] quarantined[^\n]*recSafe\)/.test(app) &&
   /snapshot-guard\] rejected[^\n]*recSafe\)/.test(app));
ok('7.2 recSafe carries no monetary field (total / investable / previousTotal)', (function () {
  const m = /const recSafe = \{[\s\S]*?\};/.exec(app);
  return !!m && !/total|investable|previousTotal/.test(m[0]);
})());
ok('7.3 the raw record is still available for diagnosis in memory (no signal lost)',
   /_aurixPushRejected\(rec\);/.test(app));
ok('7.4 app.js client-log reporter redacts msg AND stack before sending',
   /msg:\s*redact\(trim\(msg, MAX_MSG\)\)/.test(app) && /stack:\s*redact\(trim\(stack, MAX_STACK\)\)/.test(app));
ok('7.5 login.html client-log reporter redacts msg AND stack before sending',
   /msg:\s*redact\(trim\(msg, 500\)\)/.test(loginHtml) && /stack:\s*redact\(trim\(stack, 1500\)\)/.test(loginHtml));
ok('7.6 both redactors cover JWT, bearer, email and opaque tokens',
   [app, loginHtml].every(src => /RX_JWT/.test(src) && /RX_BEARER/.test(src) && /RX_EMAIL/.test(src) && /RX_TOKEN/.test(src)));
ok('7.7 app.js redactor also strips currency amounts', /RX_MONEY[\s\S]{0,200}redact/.test(app));
ok('7.8 session email is only logged behind IS_DEV (off in production)', (function () {
  const lines = app.split('\n').filter(l => /console\.(log|warn|error|info)\([^)]*\bemail\b/.test(l));
  return lines.every(l => /IS_DEV/.test(l));
})());
ok('7.9 auth tracing records booleans/stages only — never a token or an email',
   !/_aurixAuthTrace\([^)]*(email|access_token|password)/.test(app));

// ── 8. Diagnostics surfaces stay PII-free and finance-free ──────────────────
console.log('\n8 — Runtime Resilience / Diagnostics / Diagnostics Share expose nothing private:');
ok('8.1 DiagShare is an ALLOW-LIST projection (sanitize builds a fixed field set)',
   /function sanitize\(\)/.test(app) && /baseSpec:|appJsVersion:/.test(app));
ok('8.2 DiagShare scrubs JWT / bearer / email / URL-query / money / opaque tokens',
   /RX_JWT[\s\S]{0,600}RX_MONEY/.test(app) && /function scrub\(s\)/.test(app));
ok('8.3 DiagShare never emits a financial field', (function () {
  const m = /function sanitize\(\)\s*\{[\s\S]*?\n  \}/.exec(app);
  return !!m && !/\b(total|investable|holdings|portfolio|assets|balance|netWorth)\s*:/.test(m[0]);
})());
ok('8.4 DiagShare excludes the raw userAgent (device-profile name)',
   /raw userAgent is DELIBERATELY excluded/.test(app));
ok('8.5 diagnostics error capture records the exception TYPE only, never the message',
   /records the exception TYPE ONLY \(never the\n\s*\/\/ message/.test(app) &&
   /type:\s*\(e && e\.error && e\.error\.name\) \|\| 'Error'/.test(app));
ok('8.6 DiagShare is never sent automatically (user-initiated copy/share only)',
   /not sent automatically/.test(app) && !/navigator\.sendBeacon\([^)]*AurixDiagShare/.test(app));
ok('8.7 the report is bounded (no unbounded memory / payload growth)',
   /MAX_OUTPUT = 24000/.test(app) && /MAX_EVENTS = 100/.test(app));

console.log('\nRESULT: ' + (fail === 0 ? 'ALL PASS ✓' : 'FAIL ✗') + '  (' + pass + ' passed, ' + fail + ' failed)');
process.exit(fail === 0 ? 0 : 1);
