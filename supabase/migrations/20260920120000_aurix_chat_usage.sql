-- ════════════════════════════════════════════════════════════════════════════
-- AURIX CHAT · CONTABILIDAD DE USO  (SPEC SUPREME CLOSURE §8.7)
-- NO APLICADA. Paso manual declarado en el informe de entrega.
-- ════════════════════════════════════════════════════════════════════════════
-- Por qué existe una tabla y no un contador en memoria: un isolate de Edge no
-- sobrevive entre peticiones, así que un presupuesto diario en memoria no es un
-- presupuesto. Y la idempotencia tiene que sobrevivir a un reintento del
-- cliente, que es justo cuando el isolate puede ser otro.
--
-- ── ESTA TABLA NO GUARDA NADA CONVERSACIONAL. NI UN CARÁCTER. ──────────────
-- La versión anterior guardaba `answer` para poder devolverla ante un doble
-- envío sin volver a pagarla. Era una comodidad de coste comprada con datos del
-- usuario: la respuesta ES su patrimonio, en texto, en una tabla, para siempre.
-- Una purga posterior no arregla haberlo escrito. La columna se ELIMINA.
--
-- Consecuencia asumida: un reintento con la misma clave ya no puede devolver el
-- texto de antes, así que responde 409 y el cliente vuelve a preguntar. Se paga
-- una llamada de más en un caso raro a cambio de no almacenar conversación.
--
-- LO ÚNICO QUE VIVE AQUÍ es contabilidad: quién (para cuota y RLS), cuánto,
-- cuándo, en qué estado y con qué código de error. Nada de pregunta, respuesta,
-- fact envelope, prompt, cartera ni PII.
create table if not exists public.aurix_chat_usage (
  id               bigserial   primary key,
  request_id       uuid        not null,
  user_id          uuid        not null references auth.users(id) on delete cascade,
  day              date        not null,
  -- HMAC-SHA256 de (usuario + clave) con un secreto que sólo vive en la Edge
  -- Function. No se guarda la clave: se deriva del texto de la pregunta, así que
  -- guardarla sería guardar una huella de la pregunta.
  -- POR QUÉ HMAC Y NO SHA-256 PLANO: un hash plano no es reversible pero sí
  -- CONFIRMABLE — todo el preimagen salvo el texto está en esta misma fila—, y
  -- un volcado permitía probar un diccionario de preguntas y confirmar cuál hizo
  -- cada usuario. Sin el pepper no se puede recalcular nada.
  idempotency_hash text        not null,
  status           text        not null default 'reserved',   -- reserved | ok | blocked | provider_error
  error_code       text,                                      -- código corto, nunca texto del proveedor
  in_tokens        integer     not null default 0,
  out_tokens       integer     not null default 0,
  usd              numeric(12,6) not null default 0,
  model            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.aurix_chat_usage is
  'AURIX CHAT — contabilidad de uso. NO contiene pregunta, respuesta, fact envelope, prompt, cartera ni PII. Sólo cuota, coste y estado. Escrita exclusivamente por la Edge Function aurix-chat con service-role.';

-- La idempotencia es POR USUARIO y POR DÍA. El `day` va en el índice porque la
-- lectura de replay también lo filtra: sin él, una fila de ayer con la misma
-- clave no se veía en el select pero sí chocaba en el insert, y el usuario
-- recibía un `429 already_generating` PERMANENTE. Los dos extremos tienen que
-- acotar la misma ventana o no es una ventana.
create unique index if not exists aurix_chat_usage_user_idem
  on public.aurix_chat_usage (user_id, day, idempotency_hash);
create index if not exists aurix_chat_usage_user_day
  on public.aurix_chat_usage (user_id, day);

alter table public.aurix_chat_usage enable row level security;

-- ── LA RLS ES LA ÚNICA BARRERA, NO EL GRANT ────────────────────────────────
-- En este proyecto las default privileges dan SELECT a `anon` sobre las tablas
-- nuevas de `public` (lección de CROSS-DEVICE), así que el grant NO protege
-- nada. Se revoca explícitamente Y se deja la RLS sin política de lectura para
-- roles de cliente: sólo el service-role de la Edge Function toca esta tabla.
revoke all on public.aurix_chat_usage from anon, authenticated;

-- Ninguna política = ningún acceso para anon/authenticated con RLS activa.
-- `service_role` la ignora por definición, que es exactamente el único camino
-- que debe existir.

-- ── SUMA GLOBAL POR AGREGADO ───────────────────────────────────────────────
-- La función leía todas las filas y las sumaba en Deno. Este proyecto recorta
-- las lecturas a 1000 filas (ficha HISTORICAL CONTINUITY), así que a partir de
-- ahí el presupuesto global dejaba de crecer y el tope no volvía a saltar
-- NUNCA. Se suma en SQL, donde no hay recorte.
create or replace function public.aurix_chat_spend_total()
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(usd), 0)::numeric from public.aurix_chat_usage;
$$;
revoke all on function public.aurix_chat_spend_total() from public, anon, authenticated;

-- NO HAY PURGA, y es a propósito: no se programa la limpieza de algo que no
-- debería haberse guardado. Aquí no hay contenido conversacional que purgar.
-- Si algún día se quiere acotar la contabilidad, un `delete` por antigüedad es
-- higiene de tamaño, no de privacidad.
