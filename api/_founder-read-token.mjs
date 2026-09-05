// ════════════════════════════════════════════════════════════════════════════
// AURIX-FOUNDER-READ-1 · credencial de la frontera de lectura Founder
// ════════════════════════════════════════════════════════════════════════════
// Llave ÚNICA de `/api/read/*`: la superficie de SOLO LECTURA que Aurix publica
// para un consumidor concreto —Founder Platform— y para nadie más.
//
// Servidor a servidor. `Authorization: Bearer <AURIX_FOUNDER_READ_TOKEN>`.
//   · Sin cookies: aquí no hay navegador.
//   · Sin query string: acabaría en los logs de acceso.
//   · Sin fallback: ninguna otra credencial de este proyecto abre esta puerta.
//
// FRONTERA PROPIA, SIN JERARQUÍAS. Si el valor coincide con cualquier otro
// secreto del proyecto (service-role, Resend, proveedores de precio, CRON_SECRET,
// PIN_HASH…), la lectura queda DESHABILITADA: reutilizar una credencial entre
// fronteras es exactamente lo que esta frontera existe para impedir.
//
// FAIL-CLOSED sin excepciones: sin variable, con menos de 32 caracteres o
// compartida ⇒ 401 siempre. No hay modo abierto.
//
// NO CONCEDE ESCRITURA. Los handlers que la usan solo exportan GET.
//
// El prefijo `_` mantiene este fichero fuera del enrutado de Vercel: es un
// módulo, no un endpoint. `.mjs` lo hace ESM sin ambigüedad (el paquete no
// declara "type": "module"), de modo que el gate ejecuta EXACTAMENTE este
// código y no una copia.
// ════════════════════════════════════════════════════════════════════════════

import { timingSafeEqual } from 'node:crypto';

const MIN_LENGTH = 32;

// Todo secreto conocido del proyecto. Compartir valor con cualquiera de ellos
// deshabilita la lectura Founder.
const FOREIGN_SECRET_ENVS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_KEY',
  'RESEND_API_KEY',
  'TWELVE_API_KEY',
  'COINGECKO_DEMO_API_KEY',
  'CRON_SECRET',
  'PIN_HASH',
];

/** true si alguien ha reutilizado otro secreto del proyecto como token Founder. */
export function readTokenSharesAnotherSecret() {
  const token = process.env.AURIX_FOUNDER_READ_TOKEN;
  if (!token) return false;
  return FOREIGN_SECRET_ENVS.some((name) => {
    const other = process.env[name];
    return typeof other === 'string' && other.length > 0 && other === token;
  });
}

function secret() {
  const token = process.env.AURIX_FOUNDER_READ_TOKEN;
  if (!token || token.length < MIN_LENGTH) return null;
  if (readTokenSharesAnotherSecret()) return null;
  return token;
}

export function readTokenConfigured() {
  return secret() !== null;
}

function timingSafeEqualString(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Comparación en tiempo constante contra `AURIX_FOUNDER_READ_TOKEN`. */
export function verifyReadToken(provided) {
  const token = secret();
  if (!token || typeof provided !== 'string') return false;
  return timingSafeEqualString(token, provided);
}

/** Token de `Authorization: Bearer <token>`. Solo de esa cabecera. */
export function bearerToken(header) {
  if (!header || typeof header !== 'string') return null;
  const parts = header.trim().split(/\s+/);
  if ((parts[0] || '').toLowerCase() !== 'bearer') return null;
  const value = parts.slice(1).join(' ');
  return value.length > 0 ? value : null;
}

export function readTokenAuthorized(req) {
  const provided = bearerToken(req && req.headers && req.headers.authorization);
  if (provided === null) return false;
  return verifyReadToken(provided);
}

/**
 * Preámbulo común de los handlers de lectura Founder.
 *
 * NO ES UNA API DE NAVEGADOR: no se emite `Access-Control-Allow-Origin` (ni
 * permisivo ni allow-list), así que ningún navegador puede leer la respuesta
 * aunque alguien conozca el token. Tampoco se responde a OPTIONS.
 *
 * Devuelve true si el handler debe continuar; si devuelve false, ya ha
 * respondido (401 genérico / 405).
 */
export function guardFounderRead(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Vary', 'Authorization');

  if (req.method !== 'GET') {
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } });
    return false;
  }
  if (!readTokenAuthorized(req)) {
    // Respuesta genérica: no se distingue "token incorrecto" de "esta
    // instalación no tiene credencial configurada".
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    return false;
  }
  return true;
}
