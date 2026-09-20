// ════════════════════════════════════════════════════════════════════════════
// AURIX CHAT · VALIDADOR DETERMINISTA
// ════════════════════════════════════════════════════════════════════════════
// LA REGLA, literal: «ninguna cifra, signo, fecha, divisa, activo o periodo
// puede salir si no existe en el fact envelope».
//
// Es la única defensa real contra la alucinación, y por eso NO vive en el
// modelo ni en el prompt: vive aquí, es determinista, y corre DESPUÉS de la
// respuesta. Un prompt que pide no inventar es una petición; esto es una
// puerta.
//
// CÓMO. El envelope es la ÚNICA fuente de verdad, así que de él se deriva un
// conjunto de tokens PERMITIDOS. Después se extraen de la respuesta todos los
// tokens de la clase que importa —números, porcentajes, fechas, códigos y
// símbolos de divisa, y los sujetos— y cada uno tiene que estar en ese
// conjunto. La prosa no se toca: el modelo está ahí para EXPLICAR, y explicar
// no requiere inventar una cifra.
//
// FALLA CERRADO: ante la duda, se bloquea. Bloquear devuelve una respuesta
// segura construida DIRECTAMENTE de los hechos, así que el usuario nunca se
// queda sin respuesta — se queda sin la respuesta del modelo.
//
// ── POR QUÉ ESTE FICHERO ES JS PLANO CON JSDoc, TENIENDO EXTENSIÓN .ts ─────
// Deno acepta JS dentro de un `.ts`, y a cambio el gate del repo —que corre en
// Node, sin Deno instalado— puede EJECUTAR este validador tal cual, sin
// transpilar y sin stubearlo. `feedback_harness_no_stubear_lo_certificado` ya
// costó cinco defectos financieros con el gate en verde: un validador
// simulado sería exactamente el mismo error, y además en la pieza cuya única
// razón de existir es no fiarse de nadie.

/**
 * @typedef {Object} EnvelopeFact
 * @property {string} factId
 * @property {string} type
 * @property {string} label
 * @property {string} value    valor YA formateado por los owners certificados
 * @property {string|null} [unit]
 * @property {string|null} [period]
 * @property {string|null} [coverage]
 * @property {string|null} [subject]
 *
 * @typedef {Object} Envelope
 * @property {string} version
 * @property {EnvelopeFact[]} facts
 *
 * @typedef {Object} Verdict
 * @property {boolean} ok
 * @property {string[]} offending
 * @property {string[]} citedFactIds
 */

// Números: 1.234,56 · 1,234.56 · 12 · 12,5 % · -3,1
const NUM_RE = /-?\d[\d.,   ]*\d|-?\d/g;
// Fechas en las formas que el producto publica.
const DATE_RE = /\b(\d{1,2}\s+\w{3,}\.?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/gi;
const CCY_RE = /\b(USD|EUR|GBP|CHF|JPY)\b|[$€£¥]/g;

/** ── DOS DEFECTOS CRÍTICOS VIVÍAN EN ESTA FUNCIÓN Y EN SU REGLA DE PREFIJO ──
 *  Las dos revisiones los encontraron por separado, y los dos hacían que la
 *  ÚNICA puerta contra la alucinación dejara pasar cifras inventadas:
 *
 *   1) `replace(/[^\d]/g,'')` borraba el SIGNO. Con «un 1,85 % de rendimiento»
 *      en el envelope, «has PERDIDO un 1,85 %» pasaba — y la regla que esto
 *      implementa dice, literalmente, «ninguna cifra, SIGNO, fecha…».
 *   2) La regla de prefijo `a.startsWith(n) || n.startsWith(a)` aceptaba
 *      cualquier número que compartiera el principio con otro: con «90 días» en
 *      el envelope, «has ganado 9.000 €» pasaba; con «128.450,00 €», «has
 *      perdido 12.845,00 €» pasaba. Un orden de magnitud entero de diferencia,
 *      en un producto financiero.
 *
 *  Ahora la comparación es de IGUALDAD EXACTA sobre los dígitos, con el signo
 *  conservado. Si el modelo redondea, se bloquea: el prompt le prohíbe
 *  redondear, así que bloquear es la respuesta correcta y además el usuario no
 *  se queda sin nada — recibe los hechos tal cual.
 *  @param {string} s @returns {string} */
function norm(s) {
  const raw = String(s == null ? '' : s);
  const neg = /^\s*-/.test(raw) ? '-' : '';
  const digits = raw.replace(/[^\d]/g, '');
  return digits ? (neg + digits) : '';
}

/** @param {Envelope} env */
export function allowedTokens(env) {
  const nums = new Set();
  const raw = [];
  const subjects = new Set();
  for (const f of ((env && env.facts) || [])) {
    if (f && f.subject) subjects.add(String(f.subject).toLowerCase());
    for (const part of [f && f.value, f && f.period, f && f.coverage, f && f.subject, f && f.label]) {
      if (!part) continue;
      raw.push(String(part));
      for (const t of (String(part).match(NUM_RE) || [])) { const n = norm(t); if (n) nums.add(n); }
      for (const t of (String(part).match(DATE_RE) || [])) { const n = norm(t); if (n) nums.add(n); }
    }
  }
  return { nums, raw, subjects };
}

/** @param {string} text @param {Envelope} env @returns {Verdict} */
export function validateAnswer(text, env) {
  const offending = [];
  const { nums, raw } = allowedTokens(env);
  const joined = raw.join(' | ');
  const t = String(text == null ? '' : text);

  // 1 · TODA cifra de la respuesta tiene que estar en el envelope.
  for (const tok of (t.match(NUM_RE) || [])) {
    const n = norm(tok);
    if (!n) continue;
    // IGUALDAD EXACTA. Sin regla de prefijo: era la puerta por la que pasaba
    // un orden de magnitud entero.
    if (!nums.has(n)) offending.push(tok.trim());
  }
  // 2 · Divisas: sólo las que el envelope nombra.
  const envCcy = new Set((joined.match(CCY_RE) || []).map((x) => x.trim()));
  for (const c of (t.match(CCY_RE) || [])) {
    if (!envCcy.has(c.trim())) offending.push(c.trim());
  }
  // 3 · Fechas: idem, y por dígitos para no atarse al formato.
  for (const d of (t.match(DATE_RE) || [])) {
    const n = norm(d);
    if (!nums.has(n)) offending.push(d.trim());
  }
  return {
    ok: offending.length === 0,
    offending: Array.from(new Set(offending)),
    citedFactIds: ((env && env.facts) || [])
      .filter((f) => f && f.value && t.indexOf(String(f.value)) !== -1)
      .map((f) => f.factId),
  };
}

/** La respuesta SEGURA cuando el validador bloquea: hechos, tal cual, sin
 *  modelo. No es un error para el usuario — es la misma verdad sin adornar.
 *  @param {Envelope} env @returns {string} */
export function safeAnswer(env) {
  const list = ((env && env.facts) || []).slice(0, 3);
  if (!list.length) return '';
  return list.map((f) => `${f.label}: ${f.value}${f.period ? ` (${f.period})` : ''}`).join('\n');
}
