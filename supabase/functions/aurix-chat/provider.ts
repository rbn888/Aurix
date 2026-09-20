// ════════════════════════════════════════════════════════════════════════════
// AURIX CHAT · INTERFAZ DE PROVEEDOR (+ MOCK)
// ════════════════════════════════════════════════════════════════════════════
// El proveedor entra por UNA puerta. Dos razones, y las dos son del founder:
//  1) «Construye localmente con interfaz de proveedor y mock de pruebas»: sin
//     clave autorizada, todo lo que se puede probar se prueba contra el mock, y
//     NINGÚN test consume tokens reales.
//  2) Si mañana cambia el modelo o el proveedor, cambia este fichero y nada más.
//
// PROVEEDOR Y MODELO AUTORIZADOS: OpenAI · gpt-5.6-luna. Verificado en la ficha
// pública antes de escribir una línea de integración (2026-09-20):
//   · salida estructurada .......... sí (`structured_outputs`, JSON schema)
//   · límite de tokens de salida ... sí (techo 128.000; aquí se usan 450)
//   · streaming .................... sí
//   · REST plano ................... sí (`v1/chat/completions`) ⇒ Deno `fetch`,
//     sin SDK, que es lo que una Edge Function necesita
//   · no entrenamiento en API ...... sí, POR DEFECTO. La API no se usa para
//     entrenar modelos salvo aceptación expresa del cliente.
//   · retención ..................... el DEFECTO es retención estándar: puede
//     haber hasta 30 días de conservación para control de abusos. La retención
//     cero (ZDR) NO es el estado por defecto: requiere APROBACIÓN PREVIA de
//     OpenAI y condiciones adicionales. No es exacto decir que exija sin más un
//     tier concreto, y por eso aquí se describe como lo que es: una aprobación
//     que hay que pedir.
//
// DECISIÓN DEL FOUNDER PARA FOUNDER QA: se acepta temporalmente la retención
// estándar, con el acceso limitado a la cuenta founder y sin enviar nombre,
// email ni ningún identificador personal. Esta decisión NO autoriza abrir la
// conversación a usuarios Premium: antes del lanzamiento público quedan como
// gates separados la revisión legal y de privacidad, la actualización de la
// política, la decisión sobre ZDR o Modified Abuse Monitoring, y una nueva
// autorización del founder.
/**
 * @typedef {Object} ChatRequest
 * @property {string} system
 * @property {string} user
 * @property {number} maxOutputTokens
 * @property {AbortSignal} [signal]
 *
 * @typedef {Object} ChatResponse
 * @property {boolean} ok
 * @property {string} text
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {string} [reason]
 *
 * @typedef {Object} Provider
 * @property {string} name
 * @property {string} model
 * @property {(req: ChatRequest) => Promise<ChatResponse>} complete
 */
export const PROVIDER = 'openai';
export const MODEL = 'gpt-5.6-luna';
const ENDPOINT = 'https://api.openai.com/v1/chat/completions';


// ── MOCK ───────────────────────────────────────────────────────────────────
// Determinista y OFFLINE. No imita al modelo: imita su CONTRATO, que es lo
// único que el resto del sistema puede asumir. Devuelve una frase construida a
// partir del propio envelope, de modo que el validador determinista tiene algo
// real que validar — y los tests de «el modelo inventó una cifra» pueden
// forzarla con `AURIX_CHAT_MOCK_MODE`.
/** @returns {Provider} */
export function mockProvider() {
  return {
    name: 'mock',
    model: 'mock-1',
    /** @param {ChatRequest} req @returns {Promise<ChatResponse>} */
    async complete(req) {
      // Gancho SÓLO para el gate: si existe, cuenta la llamada. En producción
      // no está definido y esta línea es un no-op. Permite afirmar «el
      // proveedor NO se llamó» sin inferirlo de un efecto lateral.
      // Recibe la PETICIÓN para que el gate pueda afirmar qué se le envió al
      // modelo —hechos del servidor en `system`, mensaje del usuario aparte—
      // sin inferirlo del texto de vuelta.
      try { if (typeof __noteProviderCall === 'function') __noteProviderCall(req); } catch (_) {}
      const mode = Deno.env.get('AURIX_CHAT_MOCK_MODE') || 'echo_facts';
      const inTok = Math.ceil((req.system.length + req.user.length) / 4);
      // Los hechos viajan en el bloque `FACTS:` del prompt de sistema: el mock
      // los lee y compone una respuesta que SÓLO contiene cifras del envelope.
      const m = req.system.match(/FACTS:\s*(\[[\s\S]*?\])\s*$/m);
      let facts = [];
      try { facts = m ? JSON.parse(m[1]) : []; } catch (_) { facts = []; }
      let text;
      if (mode === 'hallucinate') {
        // Para el test del validador: una cifra que NO está en el envelope.
        text = 'Tu patrimonio ha crecido un 99,99 % este año.';
      } else if (mode === 'fail') {
        // Para el test del camino de error: el proveedor no responde.
        return { ok: false, text: '', inputTokens: 0, outputTokens: 0, reason: 'network' };
      } else if (mode === 'empty') {
        text = '';
      } else if (!facts.length) {
        text = 'No tengo ningún hecho certificado con el que responder a eso.';
      } else {
        const f = facts[0] || {};
        text = `${f.label ?? 'Dato'}: ${f.value ?? '—'}.`;
      }
      return { ok: true, text, inputTokens: inTok, outputTokens: Math.ceil(text.length / 4) };
    },
  };
}

// ── PROVEEDOR REAL ─────────────────────────────────────────────────────────
// No se instancia sin clave. Sin `OPENAI_API_KEY` la función cae al mock y lo
// DECLARA en su respuesta: nunca finge una respuesta de modelo.
/** @param {string} apiKey @returns {Provider} */
export function openAiProvider(apiKey) {
  return {
    name: PROVIDER,
    model: MODEL,
    /** @param {ChatRequest} req @returns {Promise<ChatResponse>} */
    async complete(req) {
      let res;
      try {
        res = await fetch(ENDPOINT, {
          method: 'POST',
          signal: req.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: MODEL,
            // `store:false` — que OpenAI no conserve la petición para sus
            // propias superficies. Es lo mínimo que se puede pedir sin ZDR, va
            // en CADA llamada y no depende de ninguna configuración de cuenta.
            store: false,
            max_completion_tokens: req.maxOutputTokens,
            messages: [
              { role: 'system', content: req.system },
              { role: 'user', content: req.user },
            ],
          }),
        });
      } catch (e) {
        // Abortar el fetch cierra la conexión; que eso DETENGA la facturación
        // del proveedor no está documentado, así que no se promete.
        const aborted = !!(e && e.name === 'AbortError');
        return { ok: false, text: '', inputTokens: 0, outputTokens: 0, reason: aborted ? 'aborted' : 'network' };
      }
      if (!res.ok) return { ok: false, text: '', inputTokens: 0, outputTokens: 0, reason: 'http_' + res.status };
      let body;
      try { body = await res.json(); } catch (_) { return { ok: false, text: '', inputTokens: 0, outputTokens: 0, reason: 'bad_json' }; }
      const choices = (body && body.choices) || [];
      const usage = (body && body.usage) || {};
      const text = String((choices[0] && choices[0].message && choices[0].message.content) || '');
      return {
        ok: !!text, text,
        inputTokens: Number(usage.prompt_tokens) || 0,
        outputTokens: Number(usage.completion_tokens) || 0,
        reason: text ? undefined : 'empty_completion',
      };
    },
  };
}

/** @returns {{ provider: Provider, isMock: boolean }} */
export function resolveProvider() {
  const key = Deno.env.get('OPENAI_API_KEY') || '';
  if (!key || key.length < 20) return { provider: mockProvider(), isMock: true };
  return { provider: openAiProvider(key), isMock: false };
}
