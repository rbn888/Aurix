#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// AURIX — BUILD DE DEMO AISLADO (auditoría sin cuenta)
// ════════════════════════════════════════════════════════════════════════════
// Parte del MISMO ensamblado que publica producción (`aurix-build-site.mjs`, con su
// allowlist y su verificación fail-closed) y lo transforma en un sitio de demo que
// NO puede hablar con ningún servicio de Aurix:
//   · `config.js` se sustituye: sin URL ni clave de Supabase, API en un host `.invalid`;
//   · los hosts de producción se reescriben a `.invalid` en TODO el artefacto;
//   · cada HTML lleva una CSP con `connect-src 'self'` (el navegador no sale del origen),
//     `noindex`, y como PRIMER script `demo/aurix-demo-runtime.js` (Supabase falso,
//     red externa bloqueada, marca «Demo · Datos ficticios»);
//   · Supabase JS deja de cargarse; Chart.js, lightweight-charts e Inter se copian dentro
//     del artefacto, así que la demo no pide nada a terceros.
// El código de producción NO cambia: este script sólo existe para generar el artefacto,
// y la demo no se puede activar en producción porque su runtime no se publica allí.
// Al final VERIFICA (fail-closed) que no quede ningún host ni credencial de producción.
//
//   node scripts/aurix-build-demo.mjs [/ruta/de/salida]      (por defecto /tmp/aurix-demo-site)
//   AURIX_DEMO_BASE=/aurix-demo/   prefijo de ruta del alojamiento (GitHub Pages de proyecto)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, extname, isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = (() => { const a = process.argv[2] || '/tmp/aurix-demo-site'; return isAbsolute(a) ? a : join(root, a); })();
const BASE = process.env.AURIX_DEMO_BASE || '/aurix-demo/';
const API_HOST = 'demo-api.aurix.invalid';
const ver = JSON.parse(readFileSync(join(root, 'version.json'), 'utf8'));
const VERSION = String(ver.appjs), BUILD = String(ver.build);

// 1 · el ensamblado de producción, tal cual (allowlist + verificación de referencias)
execFileSync('node', [join(root, 'scripts/aurix-build-site.mjs'), out], { stdio: 'inherit' });

// 2 · ficheros propios de la demo
mkdirSync(join(out, 'demo'), { recursive: true });
writeFileSync(join(out, 'demo/aurix-demo-runtime.js'),
  readFileSync(join(root, 'demo/aurix-demo-runtime.js'), 'utf8').replace(/__AURIX_DEMO_VERSION__/g, VERSION).replace(/__AURIX_DEMO_BUILD__/g, BUILD));
cpSync(join(root, 'demo/demo-start.js'), join(out, 'demo/demo-start.js'));
// Logos con licencia libre servidos en local (CC0: spothq/cryptocurrency-icons) en la ruta a la que la
// demo reescribe jsDelivr. Sin ellos, la app muestra su fallback de letra, como antes.
if (existsSync(join(root, 'demo/no-logo'))) cpSync(join(root, 'demo/no-logo'), join(out, 'demo/no-logo'), { recursive: true });
cpSync(join(root, 'demo/demo.html'), join(out, 'demo.html'));
writeFileSync(join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
writeFileSync(join(out, 'config.js'), [
  '// AURIX DEMO — configuración SIN servicios. No hay Supabase ni API reales:',
  '// `demo/aurix-demo-runtime.js` sustituye el cliente y contesta la API localmente.',
  "const SUPABASE_URL = 'https://demo-db.aurix.invalid';",
  "const SUPABASE_ANON_KEY = 'demo-no-key';",
  `window.AURIX_API_BASE = 'https://${API_HOST}';`,
  "window.AURIX_CHAT_URL = '';",
  'window.AURIX_DEMO = true;',
  '',
].join('\n'));

// 3 · dependencias de terceros, dentro del artefacto
const VENDOR = {
  'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js': 'vendor/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js': 'vendor/lightweight-charts.standalone.production.js',
};
mkdirSync(join(out, 'vendor/fonts'), { recursive: true });
for (const [u, f] of Object.entries(VENDOR)) {
  const r = await fetch(u); if (!r.ok) throw new Error('vendor ' + u + ' ' + r.status);
  writeFileSync(join(out, f), Buffer.from(await r.arrayBuffer()));
}
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
let fontCss = await (await fetch('https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;900&display=swap', { headers: { 'user-agent': UA } })).text();
let fi = 0;
for (const m of [...fontCss.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)]) {
  const name = 'inter-' + (fi++) + '.woff2';
  const r = await fetch(m[1]); if (!r.ok) throw new Error('font ' + r.status);
  writeFileSync(join(out, 'vendor/fonts', name), Buffer.from(await r.arrayBuffer()));
  fontCss = fontCss.replace(m[1], 'fonts/' + name);
}
writeFileSync(join(out, 'vendor/inter.css'), fontCss);

// 4 · transformación de cada fichero de texto
const CSP = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-src 'none'; form-action 'self'; manifest-src 'self'; "
  + "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self'";
const HOSTS = [
  [/isa-portfolio-ten\.vercel\.app/g, API_HOST],
  [/ozcasyufbknnuemllwso\.supabase\.co/g, 'demo-db.aurix.invalid'],
  [/(?:www\.|app\.)?aurixsystem\.io/g, 'aurix-production.invalid'],
  // Logos de activos de terceros: en la demo se piden al PROPIO origen (404) y la app usa su
  // glifo de respaldo. Así no hay ni un intento de petición a un tercero.
  [/https:\/\/assets\.coingecko\.com\//g, 'demo/no-logo/cg/'],
  [/https:\/\/financialmodelingprep\.com\//g, 'demo/no-logo/fmp/'],
  [/(?:[a-z0-9-]+\.)*coingecko\.com/g, 'demo-provider.invalid'],
  [/(?:[a-z0-9-]+\.)*financialmodelingprep\.com/g, 'demo-provider.invalid'],
  [/https:\/\/rbn888\.github\.io\/Aurix\//g, 'https://aurix-production.invalid/'],
];
function walk(d) { return readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; }); }
const TEXT = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.md', '.txt']);
for (const f of walk(out)) {
  if (!TEXT.has(extname(f)) || f.includes('/vendor/')) continue;
  let s = readFileSync(f, 'utf8'); const s0 = s;
  for (const [re, to] of HOSTS) s = s.replace(re, to);
  // Logos de cripto desde jsDelivr: en la demo no se piden (la app ya tiene su glifo de respaldo).
  if (!f.endsWith('.html')) s = s.replace(/https:\/\/cdn\.jsdelivr\.net\//g, 'demo/no-logo/jsd/').replace(/cdn\.jsdelivr\.net/g, 'demo-cdn.aurix.invalid');
  if (f.endsWith('.js') || f.endsWith('.html')) s = s.split("'/Aurix/'").join(`'${BASE}'`).split('"/Aurix/"').join(`"${BASE}"`);
  if (f.endsWith('.html')) {
    s = s.replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/, `<meta http-equiv="Content-Security-Policy" content="${CSP}">`);
    if (!/http-equiv="Content-Security-Policy"/.test(s)) s = s.replace(/<head>/i, `<head>\n  <meta http-equiv="Content-Security-Policy" content="${CSP}">`);
    if (!/name="robots"/.test(s)) s = s.replace(/<head>/i, '<head>\n  <meta name="robots" content="noindex, nofollow, noarchive">');
    s = s.replace(/<head>/i, '<head>\n  <script src="demo/aurix-demo-runtime.js"></script>');
    s = s.replace(/\s*<script[^>]*src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"]*"[^>]*><\/script>/g, '');
    for (const [u, v] of Object.entries(VENDOR)) s = s.split(u).join(v);
    s = s.replace(/\s*<link rel="preconnect" href="https:\/\/fonts\.(googleapis|gstatic)\.com"[^>]*>/g, '');
    s = s.replace(/<link rel="preload" as="style" href="https:\/\/fonts\.googleapis\.com[^"]*">/g, '');
    s = s.replace(/<link href="https:\/\/fonts\.googleapis\.com[^"]*" rel="stylesheet">/g, '<link href="vendor/inter.css" rel="stylesheet">');
  }
  if (s !== s0) writeFileSync(f, s);
}

// 5 · verificación fail-closed
const bad = [];
const FORBID = [/coingecko\.com/, /financialmodelingprep\.com/, /rbn888\.github\.io\/Aurix/, /supabase\.co/, /vercel\.app/, /aurixsystem\.io/, /sb_publishable/, /sk_(live|test)_/, /whsec_/, /cdn\.jsdelivr\.net/, /fonts\.(googleapis|gstatic)\.com/];
for (const f of walk(out)) {
  if (!TEXT.has(extname(f))) continue;
  const s = readFileSync(f, 'utf8'), rel = relative(out, f);
  FORBID.forEach(re => { if (re.test(s)) bad.push(rel + ' ⇢ ' + re); });
  if (f.endsWith('.html') && !rel.startsWith('vendor')) {
    if (!/<head>\s*<script src="demo\/aurix-demo-runtime\.js"><\/script>/i.test(s)) bad.push(rel + ' ⇢ el runtime de demo no es el primer script');
    if (!s.includes("connect-src 'self'\"")) bad.push(rel + ' ⇢ CSP sin connect-src self');
    if (!/name="robots" content="noindex/.test(s)) bad.push(rel + ' ⇢ sin noindex');
  }
}
if (bad.length) { console.error('\n✗ DEMO NO AISLADA:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`\n✓ demo ensamblada en ${out} · v${VERSION} (${BUILD}) · base ${BASE} · sin hosts ni credenciales de producción`);
