// ════════════════════════════════════════════════════════════════════════════
// AURIX-FOUNDER-READ-1 · acceso a la verdad canónica (solo servidor)
// ════════════════════════════════════════════════════════════════════════════
// Los dos handlers de `/api/read/*` no consultan tablas: llaman a UNA función
// de agregación por endpoint (`db/founder_read_aggregates_1.sql`) que devuelve
// ya contados los agregados que Founder necesita. Por qué así:
//
//   · `auth.users` no es accesible por PostgREST; solo una función
//     SECURITY DEFINER puede contarla, y devuelve NÚMEROS, nunca filas.
//   · una sola llamada por endpoint = una ida y vuelta, sin N+1 ni cómputo
//     duplicado, con el conteo hecho donde viven los datos.
//   · el PII no sale nunca de Postgres: no hay email, nombre ni user_id que
//     este proceso pueda filtrar por accidente.
//
// La service-role NUNCA sale de aquí: se usa como cabecera de una petición
// server-to-server y no aparece en ninguna respuesta.
//
// SUBSISTEMA AUSENTE ⇒ `null`. Si la función de agregación no está aplicada en
// el proyecto, se devuelve `{ available: false }` explícito: nunca un cero.
//
// El prefijo `_` mantiene este fichero fuera del enrutado de Vercel; `.mjs` lo
// hace ESM sin ambigüedad, así que el gate puede importarlo y ejecutarlo tal
// cual corre en producción.
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ozcasyufbknnuemllwso.supabase.co';

/** Timeout duro: un endpoint de observación nunca debe colgar al consumidor. */
const TIMEOUT_MS = 8_000;

export const CONTRACT = 'aurix.read.v1';

/**
 * Llama a una función de agregación y devuelve `{ ok, data | reason }`.
 * Nunca lanza: el handler siempre tiene algo honesto que serializar.
 */
export async function callAggregate(fn) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return { ok: false, reason: 'not_configured' };

  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, reason: 'unreachable' };
  }

  if (!res.ok) {
    // 404 PGRST202 = la función no está aplicada en este proyecto. Es un estado
    // legítimo ("subsistema no disponible"), no un error del consumidor.
    const detail = await res.text().catch(() => '');
    const missing = res.status === 404 || detail.includes('PGRST202');
    return { ok: false, reason: missing ? 'not_applied' : 'source_error' };
  }

  let body;
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: 'source_error' };
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, reason: 'source_error' };
  }
  return { ok: true, data: body };
}

/** Traduce el motivo interno al estado que ve Founder. Sin internals. */
export function unavailable(reason) {
  return { available: false, reason };
}

/**
 * Identidad del despliegue.
 *
 * `version.json` es la fuente de verdad de la versión servida de la app. Si el
 * fichero no viaja con esta función (Vercel solo empaqueta lo que traza), no se
 * inventa nada: `build`/`appjs` van a null y se marca `available: false`. La
 * identidad del despliegue (commit, rama) siempre está disponible por entorno.
 */
export function platformIdentity() {
  let version = null;
  try {
    const raw = readFileSync(path.join(process.cwd(), 'version.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') version = parsed;
  } catch {
    version = null;
  }
  return {
    available: version !== null,
    build: version && typeof version.build === 'string' ? version.build : null,
    appjs: version && Number.isFinite(version.appjs) ? version.appjs : null,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    ref: process.env.VERCEL_GIT_COMMIT_REF || null,
    checkedAt: new Date().toISOString(),
  };
}
