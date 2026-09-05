# AURIX-FOUNDER-READ-1 — frontera de lectura para Founder Platform

Estado: **implementado, validado en local y con el cupo de funciones RESUELTO ·
NO desplegado.** Falta sólo lo que es del propietario: SQL, variable y deploy.
Contrato: `aurix.read.v1`. Solo lectura. Aurix no recibe escritura de nadie.

## Dónde vive la frontera

| Fichero | Papel |
|---|---|
| `api/read/[surface].js` | `GET /api/read/overview` y `GET /api/read/health` — UNA función, dos rutas |
| `api/_founder-read-handlers.mjs` | los dos handlers: método, credencial, contrato, forma |
| `api/_founder-read-token.mjs` | `AURIX_FOUNDER_READ_TOKEN`: ≥32, sin fallback, sin compartir, tiempo constante |
| `api/_founder-read-source.mjs` | única fuente: RPC `founder_read_overview` / `founder_read_health` con service-role |
| `db/founder_read_aggregates_1.sql` | las dos funciones `stable` + `security definer` (se pega en el editor SQL) |
| `scripts/aurix-founder-read-gate.mjs` | gate propio, in-process, sin red ni base de datos |
| `scripts/aurix-founder-read-token.mjs` | genera la credencial por stdout; no escribe nada |

El prefijo `_` es **load-bearing**: bajo `api/` todo fichero sin `_` se convierte
en función serverless de Vercel.

## Propiedades que el gate protege

Solo `GET` (cualquier otro método → 405) · sin CORS · sin cookies · credencial
propia que no comparte valor con ningún otro secreto del proyecto (si lo
comparte, la lectura queda deshabilitada) · fail-closed sin excepciones (sin
variable, corta o compartida → 401) · un subsistema ausente devuelve
`available: false` con motivo, **nunca un cero** · ni PII, ni email, ni
`user_id`, ni símbolos, ni importes, ni cantidades, ni AUM, ni el texto de
`warnings`, ni la suscripción declarada · la service-role solo viaja en
cabeceras y nunca se serializa.

```
node scripts/aurix-founder-read-gate.mjs     # GATE OK
```

## Sin capacidad de escritura

Los handlers solo exportan `GET` y las funciones SQL son `stable` y no escriben.
Founder Platform observa Aurix; no puede cambiar nada en Aurix. No existe
contrato de control para Aurix (Booking sí tiene uno, `booking.control.v1`, y es
un puerto distinto de otro producto).

## Cupo de funciones — RESUELTO, sin subir de plan y sin tocar ninguna ruta viva

Vercel Hobby admite **12 Serverless Functions** y `api/` estaba EXACTAMENTE en 12
tras M.04 (`15122d2`). El rechazo por cupo llega **después** de un build en
verde, en `Deploying outputs...`, y deja **todas** las rutas en 404. Dos cosas lo
resuelven a coste cero:

1. **Una función, dos rutas.** `api/read/[surface].js` sirve `overview` y
   `health` desde una sola entrada, con el segmento dinámico que el router de
   Vercel resuelve de forma nativa —cero rewrites—. **Las rutas que Founder
   espera no cambian**, así que `lib/products/aurix-client.ts` no se toca.
   Mismo patrón que `api/billing/[op].js`, en producción desde M.04.
2. **El hueco existía ya.** `api/verify-pin.js` era un huérfano: el sistema de
   PIN se retiró del producto en `8174c90` ("Supabase auth is the sole gate") y
   el endpoint se quedó ocupando una de las 12 plazas sin un solo llamante en
   `app.js`, `login.html`, `landing/` ni en ningún gate o harness. Pasa a
   `api/_verify-pin.js`: **el código queda intacto** y sólo sale del enrutado,
   igual que `api/debug/_health.js`. Reponerlo es renombrar un fichero.

Cuenta final: **12 Serverless + 1 Edge**, idéntica a la de antes de este trabajo.
La sección G del gate la calcula desde el sistema de ficheros, así que el error
de M.04 ya no puede repetirse en silencio.

## Activación — pasos de propietario, ninguno ejecutado

Host de producción de la API: **`https://isa-portfolio-ten.vercel.app`**
(`window.AURIX_API_BASE`, `config.js:10`). La app vive en otro sitio
—`app.aurixsystem.io`, GitHub Pages— y no sirve `/api/*`.

1. Aplicar `db/founder_read_aggregates_1.sql` en el Supabase de producción
   (editor SQL; es aditivo, idempotente y re-ejecutable).
2. Generar la credencial con `node scripts/aurix-founder-read-token.mjs` y
   definir `AURIX_FOUNDER_READ_TOKEN` en el entorno de Vercel del proyecto de la
   API. Mismo valor en Founder Platform. Nunca `NEXT_PUBLIC`, nunca commiteada.
3. Desplegar por el camino certificado del proyecto.

Mientras no estén los tres, Founder Platform muestra `not_configured` /
`not_applied` de forma explícita: no hay ningún dato inventado en ninguna
pantalla.
