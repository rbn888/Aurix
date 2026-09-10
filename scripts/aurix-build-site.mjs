#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// AURIX — ensamblado del SITIO publicable (allowlist) + verificación fail-closed
// ════════════════════════════════════════════════════════════════════════════
// M.06 · SUPERFICIE DE RELEASE — P0. `pages.yml` subía `path: '.'` y `.nojekyll`
// desactiva el filtrado de Jekyll, así que el REPO ENTERO se publicaba en el dominio
// del cliente. Verificado en vivo con HTTP 200 sobre, entre otros: `CLAUDE.md`, la SQL
// de políticas RLS (`db/supabase_rls.sql`), el checklist pre-LIVE de M.04 —que incluye
// una dirección real del founder y la nota de que hay una suscripción TEST en la base
// de PRODUCCIÓN—, el código del webhook de billing, los runbooks de `db/m04_prod/`
// con price IDs de Stripe y las definiciones de agentes de `.claude/agents/`.
// No había credenciales expuestas (todo es `process.env`), pero sí el mapa de la
// frontera de autorización y material interno en la puerta del producto.
//
// Este script publica SÓLO lo que el sitio necesita, y —esto es lo que evita el
// siguiente incidente— FALLA CERRADO si alguna referencia local de un HTML no existe
// dentro del ensamblado. Así, olvidar un asset bloquea el deploy en vez de romper
// producción en silencio.
//
// `api/` y `landing/` NO entran a propósito: los sirve Vercel, no Pages.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, posix, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Una ruta ABSOLUTA se respeta tal cual: `join(root, '/tmp/x')` la concatenaría DENTRO del repo,
// que es exactamente cómo un ensamblado de prueba acabó como directorio sin seguimiento en el árbol.
const _outArg = process.argv[2] || '_site';
const out = isAbsolute(_outArg) ? _outArg : join(root, _outArg);

// Lo que el sitio necesita, y nada más. Un fichero que no esté aquí NO se publica.
const FILES = [
  'index.html', 'login.html', 'reset.html', 'reset-password.html',
  'app.js', 'styles.css', 'config.js', 'aurora-bg.js', 'orb.js',
  'version.json', 'manifest.webmanifest', '.nojekyll',
  'icon.svg', 'icon-maskable.svg', 'apple-touch-icon.png',
  'icon-192.png', 'icon-512.png', 'icon-512-maskable.png',
];
const DIRS = ['ai', 'services', 'splash', 'assets'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const missing = [];
for (const f of FILES) {
  const src = join(root, f);
  if (!existsSync(src)) { missing.push(f); continue; }
  mkdirSync(dirname(join(out, f)), { recursive: true });
  cpSync(src, join(out, f));
}
for (const d of DIRS) {
  const src = join(root, d);
  if (!existsSync(src)) { missing.push(d + '/'); continue; }
  cpSync(src, join(out, d), { recursive: true });
}
if (missing.length) {
  console.error('FALLO: faltan en el repo entradas declaradas del sitio: ' + missing.join(', '));
  process.exit(1);
}

// ── Verificación fail-closed: toda referencia local de los HTML debe existir ──
const HTML = FILES.filter(f => f.endsWith('.html'));
const unresolved = [];
for (const h of HTML) {
  const body = readFileSync(join(out, h), 'utf8');
  const refs = new Set();
  // Comillas DOBLES y SIMPLES: `reset.html` usa `href='login.html'`, que un patrón sólo-dobles
  // no verificaba. Un 404 en producción con el gate en verde es justo lo que este paso evita.
  for (const m of body.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)) refs.add(m[1]);
  for (const m of body.matchAll(/(?:src|href)\s*=\s*'([^']+)'/g)) refs.add(m[1]);
  for (const r of refs) {
    if (/^(https?:|\/\/|#|mailto:|data:|javascript:)/.test(r)) continue;
    const clean = r.split('?')[0].split('#')[0];
    if (!clean || clean === './' || clean === '/') continue;
    const p = join(out, clean.replace(/^\.\//, '').replace(/^\//, ''));
    if (!existsSync(p)) unresolved.push(h + ' → ' + r);
  }
}
// Los iconos del manifest también tienen que estar.
try {
  const man = JSON.parse(readFileSync(join(out, 'manifest.webmanifest'), 'utf8'));
  for (const ic of (man.icons || [])) {
    const p = join(out, String(ic.src).replace(/^\.\//, ''));
    if (!existsSync(p)) unresolved.push('manifest.webmanifest → ' + ic.src);
  }
} catch (e) { unresolved.push('manifest.webmanifest ilegible: ' + e.message); }

// Y nada interno puede haberse colado.
const FORBIDDEN = ['docs', 'db', 'api', 'scripts', 'supabase', 'email', 'landing', '.claude',
  'memory', '.vercel', '.github', 'CLAUDE.md', 'package.json', 'config.example.js',
  'audit.html', 'boot-check.html', 'index-app-probe.html', 'index-no-app.html',
  'timer-proof.html', 'app-load-test.html', 'brand-aurix.html', '.env.local', '.gitignore'];
const leaked = FORBIDDEN.filter(f => existsSync(join(out, f)));

let count = 0, bytes = 0;
(function walk(d) { for (const e of readdirSync(d)) { const p = join(d, e); const st = statSync(p);
  if (st.isDirectory()) walk(p); else { count++; bytes += st.size; } } })(out);

console.log(JSON.stringify({ site: posix.basename(out), files: count, mib: +(bytes / 1048576).toFixed(2),
  unresolvedRefs: unresolved.length, leakedInternal: leaked.length }, null, 2));
if (unresolved.length) { console.error('\nREFERENCIAS SIN RESOLVER (deploy bloqueado):'); unresolved.forEach(u => console.error('  ✗ ' + u)); }
if (leaked.length) { console.error('\nMATERIAL INTERNO EN EL SITIO (deploy bloqueado):'); leaked.forEach(l => console.error('  ✗ ' + l)); }
if (unresolved.length || leaked.length) process.exit(1);
console.log('\nSITIO OK — ' + count + ' ficheros, ninguna referencia sin resolver, cero material interno.');
