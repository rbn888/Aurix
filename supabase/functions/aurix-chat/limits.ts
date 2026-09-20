// ════════════════════════════════════════════════════════════════════════════
// AURIX CHAT · LÍMITES — SERVER-SIDE Y CONFIGURABLES
// ════════════════════════════════════════════════════════════════════════════
// El founder lo pidió con estas palabras: «configurables server-side, no
// constantes dispersas por frontend». Así que viven AQUÍ, en un solo objeto,
// cada uno puede sobreescribirse por variable de entorno de la función, y el
// frontend no conoce ninguno: si el cliente quisiera saltárselos tendría que
// convencer a este fichero, no a un `if` de app.js.
//
// FAIL-CLOSED: un valor de entorno ilegible NO desactiva el límite, cae al
// valor por defecto. Un límite que se apaga por un typo no es un límite.
/** @param {string} name @param {number} fallback @returns {number} */
function num(name, fallback) {
  const raw = Deno.env.get(name);
  if (raw == null || raw === '') return fallback;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}
/** @param {string} name @param {boolean} fallback @returns {boolean} */
function flag(name, fallback) {
  const raw = Deno.env.get(name);
  if (raw == null || raw === '') return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

export const LIMITS = {
  // ── ACCESO ────────────────────────────────────────────────────────────
  // Canary: SOLO la cuenta founder hasta que el founder autorice Premium.
  // Lista de ids separados por coma; VACÍA ⇒ nadie pasa (fail-closed: un
  // despliegue que olvide la lista queda inerte, nunca abierto).
  canaryUserIds: (Deno.env.get('AURIX_CHAT_CANARY_USER_IDS') || '')
    .split(',').map((x) => x.trim()).filter(Boolean),
  // Kill switch server-side. Independiente del feature flag.
  killed: flag('AURIX_CHAT_KILL', false),
  enabled: flag('AURIX_CHAT_ENABLED', true),

  // ── COSTE POR USUARIO Y DÍA ───────────────────────────────────────────
  maxQuestionsPerUserDay: num('AURIX_CHAT_MAX_Q_DAY', 20),
  maxUsdPerUserDay: num('AURIX_CHAT_MAX_USD_DAY', 0.03),
  // Presupuesto GLOBAL del canary. Al superarlo, la función deja de llamar al
  // proveedor para todo el mundo.
  maxUsdGlobal: num('AURIX_CHAT_MAX_USD_GLOBAL', 5),

  // ── COSTE POR LLAMADA ─────────────────────────────────────────────────
  maxInputTokens: num('AURIX_CHAT_MAX_IN_TOKENS', 2500),
  maxOutputTokens: num('AURIX_CHAT_MAX_OUT_TOKENS', 450),
  // Una llamada por mensaje normalmente; una SEGUNDA sólo cuando la intención
  // no se pudo resolver de forma determinista.
  maxCallsPerMessage: num('AURIX_CHAT_MAX_CALLS_MSG', 2),
  maxConcurrentPerUser: num('AURIX_CHAT_MAX_CONCURRENT', 1),
  maxCharsPerMessage: num('AURIX_CHAT_MAX_CHARS', 800),
  maxTurnsInWindow: num('AURIX_CHAT_MAX_TURNS', 6),
  timeoutMs: num('AURIX_CHAT_TIMEOUT_MS', 20000),

  // ── CIRCUIT BREAKER ───────────────────────────────────────────────────
  // Un proveedor caído NO puede ralentizar Intelligence: tras N fallos
  // consecutivos la función deja de intentarlo durante `breakerCooldownMs`.
  breakerFailures: num('AURIX_CHAT_BREAKER_FAILS', 5),
  breakerCooldownMs: num('AURIX_CHAT_BREAKER_COOLDOWN_MS', 60000),

  // ── PRECIO DEL MODELO (para el presupuesto, no para facturar) ─────────
  // USD por millón de tokens. Verificado en la ficha pública del modelo el
  // 2026-09-20: 0,20 entrada / 1,20 salida. Si el precio cambia, cambia AQUÍ y
  // el presupuesto sigue siendo correcto sin tocar una línea de lógica.
  usdPerMInput: num('AURIX_CHAT_USD_PER_M_IN', 0.20),
  usdPerMOutput: num('AURIX_CHAT_USD_PER_M_OUT', 1.20),
};

/** @param {number} inTokens @param {number} outTokens @returns {number} */
export function estimateUsd(inTokens, outTokens) {
  return (inTokens / 1e6) * LIMITS.usdPerMInput + (outTokens / 1e6) * LIMITS.usdPerMOutput;
}
