#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// AURIX · SECRET SCAN (SECURITY HARDENING V3) — fail-closed en el gate de Pages.
// ════════════════════════════════════════════════════════════════════════════
// El repo es PÚBLICO: un secreto que entra en un commit queda expuesto en cuanto se empuja (así
// ocurrió con las claves de Twelve Data de abril de 2026, que siguen en el historial y exigen
// rotación manual). Este escaneo revisa los ficheros VERSIONADOS del árbol (`git ls-files`) en
// cada push a main y bloquea el deploy si aparece la forma de una credencial privilegiada.
//
// Nunca imprime un secreto: sólo fichero:línea, el tipo y los 4 primeros caracteres.
// No sustituye a la «push protection» de GitHub (acción manual del founder): ésa actúa ANTES
// de que el commit llegue al remoto; esto es la segunda red.
//
//   node scripts/aurix-secret-scan.mjs            → escanea el árbol versionado
//   node scripts/aurix-secret-scan.mjs <ficheros>  → escanea sólo esos (lo usa el harness)
import { readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Formas de alta confianza. Las fixtures de los harnesses (`whsec_test_m04_…`, `service-key`)
// no encajan a propósito: los secretos reales no llevan guiones bajos en su cuerpo.
export const PATTERNS = [
  ['stripe_secret_key',     /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{20,}/g],
  ['stripe_webhook_secret', /\bwhsec_[0-9A-Za-z]{24,}/g],
  ['github_token',          /\bgh[pousr]_[0-9A-Za-z]{30,}/g],
  ['github_pat',            /\bgithub_pat_[0-9A-Za-z_]{40,}/g],
  ['aws_access_key',        /\bAKIA[0-9A-Z]{16}\b/g],
  ['private_key',           /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----/g],
  ['resend_api_key',        /\bre_[0-9A-Za-z]{8,}_[0-9A-Za-z]{16,}/g],
  ['supabase_secret_key',   /\bsb_secret_[0-9A-Za-z_-]{20,}/g],
  // Una clave de proveedor asignada en código (así entró la de Twelve Data).
  ['hardcoded_api_key',     /\b(?:[A-Z0-9_]*API_KEY|apikey|api_key)\s*[:=]\s*['"`][0-9a-f]{32,}['"`]/gi],
];
const JWT_RE = /\beyJ[0-9A-Za-z_-]{8,}\.(eyJ[0-9A-Za-z_-]{8,})\.[0-9A-Za-z_-]{8,}/g;

const SKIP = [/^vendor\//, /\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|otf|mp4|zip|gz)$/i];

export function scanText(text, file) {
  const hits = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 20000) continue;            // línea minificada: no es donde se pegan claves
    for (const [kind, re] of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) hits.push({ file, line: i + 1, kind, preview: m[0].slice(0, 4) + '…' });
    }
    JWT_RE.lastIndex = 0;
    let j;
    while ((j = JWT_RE.exec(line))) {
      try {
        const payload = JSON.parse(Buffer.from(j[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
        if (payload && payload.role === 'service_role') hits.push({ file, line: i + 1, kind: 'supabase_service_role_jwt', preview: 'eyJ…' });
      } catch (_) { /* no es un JWT decodificable: no es un hallazgo */ }
    }
  }
  return hits;
}

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const explicit = process.argv.slice(2);
  const files = explicit.length ? explicit : trackedFiles();
  const hits = [];
  let scanned = 0;
  for (const f of files) {
    if (SKIP.some(re => re.test(f))) continue;
    const p = explicit.length ? f : join(root, f);
    let st; try { st = statSync(p); } catch (_) { continue; }
    if (!st.isFile() || st.size > 8 * 1024 * 1024) continue;
    hits.push(...scanText(readFileSync(p, 'utf8'), f));
    scanned++;
  }
  if (hits.length) {
    console.error(`SECRET SCAN: ${hits.length} posible(s) credencial(es) en ${scanned} ficheros — deploy bloqueado.`);
    for (const h of hits) console.error(`  ✗ ${h.file}:${h.line}  ${h.kind}  ${h.preview}`);
    console.error('Retira el valor del árbol, ROTA la credencial (el repo es público) y vuelve a empujar.');
    process.exit(1);
  }
  console.log(`SECRET SCAN OK — ${scanned} ficheros versionados, 0 credenciales.`);
}
