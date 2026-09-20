# Aurix Chat · pasos manuales

**Estado actual: NADA de esto está hecho.** La función está construida, el flag
apagado y `window.AURIX_CHAT_URL` vacío. Sin los pasos de abajo la esfera no
promete conversación y no sale un solo byte a ningún proveedor.

## Antes que nada: la conversación está BLOQUEADA

No por falta de configuración, sino por una razón de arquitectura que ningún
secreto resuelve. `facts.ts` lo documenta entero y en corto es esto:

> Los hechos certificados los produce una cadena de 18 owners y ~2.580 líneas en
> `app.js`, certificada por 35 harness. El servidor no tiene ninguno de ellos:
> `portfolio_snapshots` guarda VALOR, y la Edge Function `portfolio-snapshot` no
> calcula TWR, cobertura ni materialidad. Reescribir esa cadena en Deno o en SQL
> sería un segundo cerebro financiero, que es lo que el principio central del
> SPEC prohíbe.

Mientras `SERVER_FACTS_AVAILABLE` sea `false`, el endpoint responde **503
`conversation_unavailable`** antes de reservar coste o llamar al proveedor.
Desplegarlo hoy es seguro y es inútil: no puede contestar. **Levantar el bloqueo
es un SPEC propio**, no un paso de despliegue.

Los pasos 1–6 quedan escritos para cuando ese owner exista.

---

## 1 · Aplicar la migración

`supabase/migrations/20260920120000_aurix_chat_usage.sql`

Crea `public.aurix_chat_usage` y la función `public.aurix_chat_spend_total()`.

**Sin esto no hay cuota.** `postgrest-js` no lanza: si la tabla no existe, las
lecturas devuelven error y la función responde 503 `quota_unavailable`. Es
fail-closed, pero significa que la conversación no funciona hasta aplicarla.

La tabla **no guarda nada conversacional**: ni pregunta, ni respuesta, ni fact
envelope, ni prompt, ni cartera, ni PII. Sólo `request_id`, `user_id`, `day`,
`idempotency_hash` (HMAC-SHA256 con pepper), `status`, `error_code`, tokens,
`usd`, `model` y timestamps. Por eso **no hay purga que programar**.

Verificar:

```sql
select column_name from information_schema.columns
 where table_name = 'aurix_chat_usage' order by ordinal_position;
-- No debe aparecer ninguna columna de contenido.
select relrowsecurity from pg_class where relname = 'aurix_chat_usage';  -- t
select polname from pg_policies where tablename = 'aurix_chat_usage';    -- 0 filas
```

## 2 · Secretos de la función

```
supabase secrets set --project-ref ozcasyufbknnuemllwso \
  OPENAI_API_KEY=... \
  SUPABASE_ANON_KEY=... \
  AURIX_CHAT_CANARY_USER_IDS=<uuid-del-founder> \
  AURIX_CHAT_IDEM_PEPPER=$(openssl rand -hex 32)
```

- `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta la plataforma.
- `SUPABASE_ANON_KEY` hace falta para preguntar el entitlement **como el
  usuario**: `aurix_entitlements()` usa `auth.uid()` y con el service-role
  devolvería el estado de nadie.
- **`AURIX_CHAT_CANARY_USER_IDS` vacío ⇒ nadie entra.** Un despliegue que la
  olvide queda inerte, nunca abierto.
- **`AURIX_CHAT_IDEM_PEPPER`** (≥ 16 caracteres) es el secreto del HMAC del hash
  de idempotencia. Sin él la función responde 503 `not_configured`: no degrada a
  SHA-256 plano, porque un hash sin pepper permite confirmar desde un volcado
  qué preguntó cada usuario. **No rotar a la ligera**: al cambiarlo, las claves
  del día en curso dejan de reconocerse y un reenvío se cobra como nuevo.

Sin `OPENAI_API_KEY` la función usa el **mock** y lo declara en su respuesta
(`mock: true`). Nunca finge una respuesta de modelo.

## 3 · Desplegar

```
supabase functions deploy aurix-chat --project-ref ozcasyufbknnuemllwso
```

## 4 · Publicar la URL

En `config.js`: `window.AURIX_CHAT_URL = 'https://<ref>.supabase.co/functions/v1/aurix-chat';`

Mientras esté vacío, la esfera es decorativa: `aria-hidden`, sin foco, sin
listener y sin una sola petición.

## 5 · Límites

Todos son server-side y configurables por variable de entorno; ninguno vive en
el frontend. Valores por defecto:

| | |
|---|---|
| Preguntas por usuario/día | 20 |
| USD por usuario/día | 0,03 |
| USD global (canary) | 5 |
| Tokens de entrada / salida | 2.500 / 450 |
| Concurrencia por usuario | 1 (por reserva atómica) |
| Timeout | 20 s |

Coste medido con el precio declarado del modelo: **0,001040 USD** por llamada
nominal, **0,001160** en el peor caso, **0,0208 USD** por usuario y día.

## 6 · Retención del proveedor

Decisión del founder **sólo para Founder QA**: se acepta la retención estándar
de OpenAI.

- `/v1/chat/completions` con **`store: false`** en cada llamada.
- La API **no se usa para entrenar** salvo aceptación expresa.
- Puede haber **hasta 30 días** de conservación para control de abusos.
- Acceso limitado a la cuenta founder.
- No se envía nombre, email ni identificador personal.

La **retención cero (ZDR)** no es el estado por defecto: requiere **aprobación
previa de OpenAI** y condiciones adicionales.

**Esto no autoriza abrir la conversación a usuarios Premium.** Antes del
lanzamiento público quedan como gates separados: revisión legal y de privacidad,
actualización de la política, decisión sobre ZDR o Modified Abuse Monitoring, y
nueva autorización del founder.

## Rollback

1. `AURIX_CHAT_KILL=1` (server-side, corta antes de autenticar), o
2. vaciar `window.AURIX_CHAT_URL` (el cliente deja de tener endpoint), o
3. vaciar `AURIX_CHAT_CANARY_USER_IDS` (nadie entra).

Cualquiera de las tres, por separado, deja la conversación en cero llamadas y
cero coste.
