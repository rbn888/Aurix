// GET /api/cron/welcome-email   (driven by pg_cron every 15 min — db/welcome_email_cron_1.sql)
// NOTE: `functions.includeFiles: "email/**"` (vercel.json) is required so this function can read the
// welcome templates. WELCOME_CRON_ENABLED + CRON_SECRET + WELCOME_FLOOR_AT live in the Vercel env.
// ════════════════════════════════════════════════════════════════════════════
// AURIX-EMAIL-EXPERIENCE-V1 · one-time welcome email, ~30 min after a NEW user's
// first successful access. Trigger proxy = auth.users.created_at (a Supabase Auth
// account is created on the first successful verifyOtp → created_at ≈ first access).
//
// ════════════════════════════════════════════════════════════════════════════
// M.06 · P0 — BIENVENIDAS REPETIDAS. ESTE ERA EL SENDER QUE NADIE MIRÓ.
// ════════════════════════════════════════════════════════════════════════════
// La auditoría anterior concluyó «un solo owner: api/waitlist.js» y arregló allí la
// idempotencia. Pero el correo repetido no salía de allí: sale de AQUÍ, de un reloj
// de 15 minutos, y su idempotencia era ADVISORIA en vez de IMPUESTA. Cuatro caminos,
// cada uno suficiente por sí solo para reenviar la bienvenida cada 15 minutos y para
// siempre:
//   1. LECTURA FAIL-OPEN. `const done = q.ok ? await q.json() : []` — si la consulta
//      al libro de envíos fallaba (tabla ausente, error de red, 5xx de PostgREST),
//      el código concluía «no se ha enviado nunca» y ENVIABA. Un fallo de lectura
//      recurrente = un correo cada 15 minutos a TODA cuenta elegible.
//   2. CLAIM-AFTER-SEND. Se enviaba y sólo DESPUÉS se insertaba la fila 'sent', con
//      el resultado del INSERT sin comprobar. Cualquier pérdida de ese registro
//      (timeout de la función, 5xx, la función muerta a mitad) dejaba el envío hecho
//      y el libro vacío ⇒ reenvío en la pasada siguiente, indefinidamente.
//   3. FALSO NEGATIVO DE ENVÍO. `send.ok && data?.id`: una respuesta 2xx sin `id`
//      parseable registraba 'failed_retryable' sobre un correo YA entregado ⇒
//      reintento garantizado.
//   4. CERO ATOMICIDAD. Leer-luego-enviar no protege de la concurrencia: dos
//      invocaciones solapadas (pg_cron + reintento de Vercel) leían las dos vacío.
// Y un quinto, de CONTRATO: este sender y `api/waitlist.js` usaban libros DISTINTOS
// (`email_campaign_sends` vs `"Correos usuario".welcome_email_sent_at`), así que la
// misma persona podía recibir DOS bienvenidas de por vida, una de cada uno.
//
// EL CONTRATO, ahora impuesto por la base de datos:
//   UN EMAIL / USUARIO AURIX → UNA SOLA BIENVENIDA EN TODA SU VIDA.
//
// Cómo se impone:
//   · RESERVA ANTES DEL ENVÍO. Se INSERTA la fila `status:'sent'` primero. El índice
//     único parcial `email_campaign_sends_sent_uniq (campaign_id, email) where
//     status='sent'` (db/email_campaign_sends.sql) convierte ese INSERT en la única
//     sección crítica: exactamente una invocación recibe 201, las demás 409 y no
//     envían. La atomicidad es de Postgres, no del orden de las llamadas.
//   · FAIL-CLOSED EN TODO. Si no se puede DEMOSTRAR que la bienvenida no se ha
//     enviado, no se envía. Perder una bienvenida cuesta un correo que un intento
//     posterior recupera; enviarla dos veces no se puede deshacer.
//   · LIBERACIÓN. Si el envío falla, la fila pasa a 'failed_retryable': deja de
//     ocupar el índice único y una pasada futura puede reintentar.
//   · UN SOLO LIBRO PARA LOS DOS SENDERS. `api/waitlist.js` reserva contra este
//     mismo libro, así que el primero que llegue es el único que envía.
//   · CUENTAS YA EXISTENTES = CERO, SIN MIGRACIÓN. `ACCOUNT_EPOCH_MS` es un suelo
//     DURO en código: toda cuenta creada antes del despliegue de este fix queda
//     permanentemente fuera, así que nadie que ya exista (y que por tanto ya recibió
//     su bienvenida, repetida o no) puede volver a ser considerado «nuevo».
//     `WELCOME_FLOOR_AT` sólo puede SUBIR ese suelo, nunca bajarlo.
//   · RADIO DE ALCANCE ACOTADO. `MAX_AGE_MS` retira de la elegibilidad a las cuentas
//     de más de 48 h: un defecto futuro en este archivo sólo puede alcanzar a las
//     cuentas de los dos últimos días, nunca al censo entero.
//
// IDIOMA (M.06 · §3): el correo sale en el idioma EXPLÍCITO de la cuenta — la señal
// manual más reciente entre `user_portfolios.preferences.lang` (owner: switchLang) y
// `user_onboarding.preferred_language` (paso LANGUAGE del onboarding); si no hay
// ninguna, el `locale` capturado en "Correos usuario"; y si tampoco, inglés.
//
// SAFE BY DEFAULT: no hace nada salvo WELCOME_CRON_ENABLED === 'true'.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, WAITLIST_FROM,
//      CRON_SECRET, WELCOME_CRON_ENABLED ('true' para armar), WELCOME_FLOOR_AT (ISO).
// Query: ?dry=1 → informa de los elegibles sin enviar nada.
import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ozcasyufbknnuemllwso.supabase.co';
const CAMPAIGN_ID  = 'aurix_welcome_v1';
const DELAY_MS     = 30 * 60 * 1000;                 // ~30 minutes after first access
// SUELO DURO. Instante del despliegue del fix de bienvenidas repetidas (M.06). Es el guard
// server-side que sustituye a un backfill: ninguna cuenta anterior vuelve a ser «nueva».
const ACCOUNT_EPOCH_MS = Date.parse('2026-09-12T18:00:00Z');
const MAX_AGE_MS   = 48 * 60 * 60 * 1000;            // elegibilidad acotada (radio de alcance)
// Tabla histórica de emails capturados: renombrada por el propietario de "waitlist" a
// "Correos usuario" (mayúscula + espacio ⇒ identificador citado; percent-encoded en la ruta).
const CAPTURE_TABLE_PATH = 'Correos%20usuario';
const EMAIL_RE     = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  // Auth: Vercel Cron sends Authorization: Bearer <CRON_SECRET> when configured.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const dry = String(req.query?.dry || '') === '1';
  if (process.env.WELCOME_CRON_ENABLED !== 'true') return res.status(200).json({ ok: true, disabled: true, note: 'set WELCOME_CRON_ENABLED=true to arm' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const RESEND_KEY  = process.env.RESEND_API_KEY;
  const FROM        = process.env.WAITLIST_FROM || 'Aurix <hello@aurixsystem.io>';
  // El env sólo puede SUBIR el suelo. Un `WELCOME_FLOOR_AT` antiguo (o ausente) no puede
  // readmitir cuentas históricas: eso es exactamente lo que produjo el P0.
  const FLOOR       = Math.max(ACCOUNT_EPOCH_MS, Date.parse(process.env.WELCOME_FLOOR_AT || '') || 0);
  if (!SERVICE_KEY) return res.status(500).json({ ok: false, error: 'no_service_key' });
  if (!dry && !RESEND_KEY) return res.status(500).json({ ok: false, error: 'no_resend_key' });

  const sb = (p, opts = {}) => fetch(`${SUPABASE_URL}${p}`, { ...opts, headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const now = Date.now();
  const windowMax = now - DELAY_MS;                    // first access must be ≥30 min ago
  const windowMin = now - MAX_AGE_MS;                  // …and not older than MAX_AGE_MS
  // Plantillas por idioma, dentro del try: ambas son salida VERBATIM del renderer
  // compartido (scripts/aurix-email.mjs) — ver el assert de no-deriva en el harness.
  // Si la castellana no viajara en el bundle, se degrada a inglés en vez de tumbar la pasada.
  let bodies = null;
  const stats = { scanned: 0, eligible: 0, sent: 0, skipped_duplicate: 0, skipped_other_sender: 0, skipped_unverified: 0, skipped_invalid: 0, failed: 0, dry };
  try {
    bodies = {
      en: { subject: 'Welcome to Aurix.',   html: readTemplate('aurix-welcome.html'),    text: WELCOME_TEXT.en },
      es: { subject: 'Bienvenido a Aurix.', html: readTemplate('aurix-welcome-es.html'), text: WELCOME_TEXT.es },
    };
    if (!bodies.es.html) bodies.es = bodies.en;
    // Sin plantilla no se envía NADA: un cuerpo vacío es peor que una bienvenida que falta.
    if (!bodies.en.html) return res.status(500).json({ ok: false, error: 'no_template', ...stats });
    // Page through Supabase Auth admin users (newest pages first is not guaranteed; we filter by window).
    for (let page = 1; page <= 20; page++) {
      const r = await sb(`/auth/v1/admin/users?page=${page}&per_page=200`);
      if (!r.ok) break;
      const j = await r.json();
      const users = Array.isArray(j?.users) ? j.users : [];
      if (!users.length) break;
      stats.scanned += users.length;
      for (const u of users) {
        const created = Date.parse(u.created_at || '') || 0;
        if (created < FLOOR)      continue;            // cuenta ya existente → NUNCA
        if (created > windowMax)  continue;            // primer acceso < 30 min → esperar
        if (created < windowMin)  continue;            // > MAX_AGE_MS → fuera (radio acotado)
        const email = String(u.email || '').trim().toLowerCase();
        if (!EMAIL_RE.test(email)) { stats.skipped_invalid++; continue; }
        stats.eligible++;

        // ── 1 · ¿Ya enviada? FAIL-CLOSED: sin prueba de que NO se envió, no se envía.
        const ledger = await readJson(sb(`/rest/v1/email_campaign_sends?select=status&campaign_id=eq.${CAMPAIGN_ID}&email=eq.${encodeURIComponent(email)}&status=eq.sent&limit=1`));
        if (!ledger) { stats.skipped_unverified++; continue; }
        if (ledger.length) { stats.skipped_duplicate++; continue; }

        // ── 2 · ¿La bienvenida la envió YA el otro sender (api/waitlist.js)?
        //        Un email / un usuario ⇒ UNA bienvenida, de cualquiera de los dos.
        const capture = await readJson(sb(`/rest/v1/${CAPTURE_TABLE_PATH}?select=welcome_email_sent_at,locale&email=eq.${encodeURIComponent(email)}&limit=1`));
        if (!capture) { stats.skipped_unverified++; continue; }
        if (capture[0] && capture[0].welcome_email_sent_at) { stats.skipped_other_sender++; continue; }
        if (dry) continue;

        // ── 3 · RESERVA ATÓMICA antes de enviar. El índice único parcial sobre
        //        status='sent' es la sección crítica: 201 gana, 409 pierde.
        const claim = await sb('/rest/v1/email_campaign_sends', {
          method: 'POST', headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ campaign_id: CAMPAIGN_ID, email, status: 'sent' }),
        });
        if (claim.status === 409) { stats.skipped_duplicate++; continue; }   // otra invocación la tiene
        if (!claim.ok)            { stats.skipped_unverified++; continue; }  // fail-closed
        const claimRow = (await claim.json().catch(() => []))[0] || null;
        if (!claimRow || !claimRow.id) { stats.skipped_unverified++; continue; }

        // ── 4 · Idioma explícito de la cuenta (o fallback determinista).
        const lang = await resolveAccountLang(sb, u.id, capture[0] ? capture[0].locale : null);
        const body = bodies[lang] || bodies.en;

        const send = await fetch('https://api.resend.com/emails', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
          body: JSON.stringify({ from: FROM, to: [email], subject: body.subject, html: body.html, text: body.text }),
        });
        const data = await send.json().catch(() => ({}));
        if (send.ok) {
          // 2xx = Resend lo ACEPTÓ. El `id` es trazabilidad, no la prueba de entrega: exigirlo
          // convertía un envío real en 'failed_retryable' y garantizaba el duplicado.
          stats.sent++;
          if (data && data.id) {
            await sb(`/rest/v1/email_campaign_sends?id=eq.${claimRow.id}`, {
              method: 'PATCH', headers: { Prefer: 'return=minimal' },
              body: JSON.stringify({ provider_message_id: data.id }),
            }).catch(() => {});
          }
        } else {
          // ── 5 · Fallo de envío. Sólo se LIBERA la reserva cuando reintentar puede
          // funcionar: 5xx, 429 y errores de credencial/permiso (401/403), que son de
          // configuración y se arreglan sin tocar la petición. Ante cualquier otro 4xx la
          // petición es inaceptable en sí misma (dirección inválida, cuerpo rechazado) y
          // reintentarla cada 15 minutos durante dos días no la haría válida: la reserva se
          // QUEDA con el error anotado, así que no se reintenta y tampoco se duplica.
          stats.failed++;
          const st = send.status;
          const retryable = st >= 500 || st === 429 || st === 401 || st === 403;
          await sb(`/rest/v1/email_campaign_sends?id=eq.${claimRow.id}`, {
            method: 'PATCH', headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
              status: retryable ? 'failed_retryable' : 'sent',
              error: (data?.message || 'http_' + st),
            }),
          }).catch(() => {});
        }
      }
      if (users.length < 200) break;
    }
    return res.status(200).json({ ok: true, campaign_id: CAMPAIGN_ID, ...stats });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e && e.message), ...stats });
  }
}

// Lee un array JSON de PostgREST, o null si NO se puede demostrar el contenido. Todo
// llamador trata el null como «no verificable» y no envía (fail-closed).
async function readJson(p) {
  try {
    const r = await p;
    if (!r || !r.ok) return null;
    const j = await r.json().catch(() => null);
    return Array.isArray(j) ? j : null;
  } catch (_) { return null; }
}

function readTemplate(file) {
  try { return fs.readFileSync(path.join(process.cwd(), 'email', file), 'utf8'); }
  catch (_) { return ''; }
}

// Idioma de la cuenta. Prioridad:
//   1. la señal manual MÁS RECIENTE entre `user_portfolios.preferences.lang` (owner:
//      switchLang, sellada en `preferences_updated_at`) y `user_onboarding
//      .preferred_language` (paso LANGUAGE, sellado en `updated_at`);
//   2. el `locale` capturado al pedir acceso (landing / login);
//   3. inglés.
// Nunca lanza: cualquier fuente ilegible se salta y se pasa a la siguiente.
async function resolveAccountLang(sb, userId, captureLocale) {
  let best = null, bestTs = -1;
  const consider = (v, ts) => {
    const l = (v === 'es' || v === 'en') ? v : null;
    if (l && ts >= bestTs) { best = l; bestTs = ts; }
  };
  if (userId) {
    const prefs = await readJson(sb(`/rest/v1/user_portfolios?select=preferences,preferences_updated_at&user_id=eq.${encodeURIComponent(userId)}&limit=1`));
    if (prefs && prefs[0] && prefs[0].preferences && typeof prefs[0].preferences === 'object') {
      consider(prefs[0].preferences.lang, Date.parse(prefs[0].preferences_updated_at || '') || 0);
    }
    const onb = await readJson(sb(`/rest/v1/user_onboarding?select=preferred_language,updated_at&user_id=eq.${encodeURIComponent(userId)}&limit=1`));
    if (onb && onb[0]) {
      consider(onb[0].preferred_language, Date.parse(onb[0].updated_at || '') || 0);
    }
  }
  if (best) return best;
  return (captureLocale === 'es') ? 'es' : 'en';
}

// Alternativa en texto plano — en paso con email/aurix-welcome{,-es}.html (misma copy, mismo CTA).
const WELCOME_TEXT = {
  en: 'Welcome to Aurix.\n\nThank you for joining us. Your journey with Aurix begins today.\n\n'
    + 'Our mission is simple: help you understand, organize and grow your wealth from one private, intelligent platform.\n\n'
    + 'Track your stocks, ETFs, funds, crypto, precious metals, real estate and cash — all in one place.\n\n'
    + 'This is only the beginning: new intelligence and financial tools are coming over the next months.\n\n'
    + 'Enter Aurix: https://app.aurixsystem.io\n\nThe Aurix Team',
  es: 'Bienvenido a Aurix.\n\nGracias por unirte. Tu recorrido con Aurix empieza hoy.\n\n'
    + 'Nuestra misión es simple: ayudarte a entender, organizar y hacer crecer tu patrimonio desde una sola plataforma privada e inteligente.\n\n'
    + 'Sigue tus acciones, ETFs, fondos, cripto, metales preciosos, inmuebles y liquidez — todo en un mismo lugar.\n\n'
    + 'Esto es solo el principio: en los próximos meses llegarán nuevas herramientas de inteligencia y análisis financiero.\n\n'
    + 'Entrar en Aurix: https://app.aurixsystem.io\n\nEl equipo de Aurix',
};
