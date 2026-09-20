// ════════════════════════════════════════════════════════════════════════════
// AURIX CHAT · EL OWNER FINANCIERO SERVER-SIDE  —  HOY NO EXISTE
// ════════════════════════════════════════════════════════════════════════════
// ESTE FICHERO ES LA COSTURA, Y SU ESTADO ACTUAL ES «BLOQUEADO». No es un TODO:
// es el punto exacto donde la conversación está detenida, escrito para que
// quien la reanude sepa qué tiene que existir y por qué no vale cualquier cosa.
//
// ── POR QUÉ EL NAVEGADOR NO PUEDE SER LA FUENTE ──────────────────────────
// La versión anterior recibía el fact envelope del cliente. Eso NO es autoridad
// financiera: todo lo que se construye en el navegador se puede manipular, y el
// validador determinista derivaba su lista de permitidos DEL MISMO envelope, de
// modo que un cliente manipulado autorizaba sus propias cifras. Podía mentirse
// sólo a sí mismo —el aislamiento entre cuentas nunca dependió de esto— pero
// «Aurix te dijo que tu rentabilidad es X» dejaba de ser una afirmación de
// Aurix. En un producto financiero eso no se puede publicar.
//
// ── POR QUÉ NO SE RESUELVE PORTANDO EL MOTOR ─────────────────────────────
// Los hechos certificados los produce una cadena de 18 owners y ~2.580 líneas
// en `app.js` —`_aurixInvestableSnapshots` → `_aurixEligibleInvestableSeries`
// (filtro de confianza WN.9/WN.13 + recorte WN.12 + guardia de retención) →
// `_aurixTwrChain` (Modified-Dietz flow-neutral) → `_aurixInvestablePerformance`
// (siete guardas, cobertura, confianza) → `_aurixFactLedger` (materialidad,
// puerta de evidencia, dedup por raíz causal, prioridad) → `_aurixIntelligenceCore`—
// y 35 harness los certifican. Reescribirlos en Deno o en SQL sería, por
// definición, un SEGUNDO CEREBRO FINANCIERO: el principio central del SPEC lo
// prohíbe con estas palabras, «ningún módulo crea una segunda rentabilidad,
// exposición, liquidez o historia». Dos implementaciones divergen; no es una
// hipótesis, es lo que este proyecto ya ha pagado varias veces.
//
// ── QUÉ HAY HOY EN EL SERVIDOR, MEDIDO ───────────────────────────────────
//   · `portfolio_snapshots`: valor por usuario cada 15 min (total, inmueble,
//     valores por categoría, número de activos). Son los DATOS DE ENTRADA de la
//     cadena, no sus hechos.
//   · La Edge Function `portfolio-snapshot` calcula ese VALOR y nada más: cero
//     coincidencias de TWR, Modified-Dietz, flow-neutral, coversNominal,
//     materialidad o drawdown en sus 546 líneas.
//   · Ninguna RPC de `db/` produce hechos financieros por usuario.
//   · `/api/read/*` publica agregados de plataforma, nunca la cartera de nadie.
// Conclusión: ninguna de las tres vías que el founder planteó (RPC/owner
// server-side reutilizable · snapshot certificado y firmado · mecanismo
// equivalente existente) está disponible. Firmar un payload calculado por el
// cliente tampoco crea autoridad: seguiría siendo el cliente quien lo calculó.
//
// ── QUÉ TIENE QUE EXISTIR PARA LEVANTAR EL BLOQUEO ───────────────────────
// Un owner server-side que, sobre los MISMOS datos autoritativos, produzca los
// MISMOS hechos con los MISMOS periodos, la MISMA cobertura y el MISMO
// aislamiento que la cadena del bundle — y que sea LA MISMA implementación, no
// otra. El camino realista es extraer esa cadena a un módulo compartido que
// corra igual en el navegador y en Deno, y certificarla con los 35 harness que
// ya existen. Eso es un SPEC propio, no un apaño dentro de éste.
//
// Mientras tanto esta función devuelve SIEMPRE «no disponible», y el endpoint
// responde 503 antes de gastar un token. Fail-closed por construcción: no hay
// ninguna ruta que produzca hechos, así que no hay ninguna que los invente.

/**
 * @typedef {Object} ServerFact
 * @property {string} factId
 * @property {string} label
 * @property {string} value
 * @property {string|null} period
 * @property {string|null} coverage
 *
 * @typedef {Object} ServerFactsResult
 * @property {boolean} ok
 * @property {string} [reason]
 * @property {{ version: string, facts: ServerFact[] }} [envelope]
 */

// Declarado y exportado para que el gate pueda demostrar que sigue apagado.
export const SERVER_FACTS_AVAILABLE = false;

/**
 * Construye el fact envelope DEFINITIVO a partir de datos autoritativos del
 * servidor. `userId` viene del JWT; nunca del cuerpo de la petición.
 * @param {unknown} _admin  cliente service-role
 * @param {string}  _userId
 * @returns {Promise<ServerFactsResult>}
 */
export async function serverFacts(_admin, _userId) {
  if (!SERVER_FACTS_AVAILABLE) {
    return { ok: false, reason: 'no_server_fact_owner' };
  }
  // Inalcanzable hoy. Cuando exista el owner compartido, aquí se le pide el
  // envelope YA construido y certificado: este fichero no calcula nada.
  return { ok: false, reason: 'no_server_fact_owner' };
}
