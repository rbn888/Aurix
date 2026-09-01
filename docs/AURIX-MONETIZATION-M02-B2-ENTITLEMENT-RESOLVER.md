# AURIX MONETIZATION V1 · M.02 — B2 SERVER ENTITLEMENT RESOLVER

Continúa `docs/AURIX-MONETIZATION-M02-B1-COMMERCIAL-TRUTH.md`. Baseline `main` @ `0dce0ff`, B1 aplicado y
verificado en producción.

**B2 no cambia nada de lo que ve un usuario.** No activa enforcement, no mueve la frontera Free/Premium,
no añade paywall. Añade **una función** al servidor.

---

## QUÉ FALTABA

B1 dejó la verdad comercial en el servidor, y B1 **no decide nada**: `aurix_commercial_state()` publica
hechos (plan, status, periodo) y interpretar esos hechos no era todavía trabajo de nadie. Esta es la
pieza que lo hace, y es **la única autoridad**: `public.aurix_entitlements()`.

```
subscriptions  →  plan_features  →  entitlement_overrides  →  conjunto efectivo
```

**La frontera que codifica:** el cliente puede **preguntar** «¿qué puedo usar?». Nunca puede **decidir**
«soy Premium». Desde B2, **toda decisión nueva de entitlement pasa por el resolver** — cualquier
superficie que quiera gatear una capacidad consume `features`, no un flag local.

---

## CONTRATO

Una función, cero parámetros, `SECURITY DEFINER`, identidad tomada de `auth.uid()`, `EXECUTE` sólo para
`authenticated`. **Devuelve siempre exactamente una fila**: "sin respuesta" no puede confundirse con
"Premium", así que no hay caso de cero filas que malinterpretar.

| Campo | Qué es |
|---|---|
| `plan` | plan comercial efectivo: `free` \| `premium` |
| `subscription_status` | saneado: `none` \| status conocido \| `unrecognized` |
| `features` | `feature_key → boolean`. Todas las claves canónicas, siempre presentes |
| `feature_sources` | `feature_key → plan \| override \| default` — responde al **por qué** |
| `source` | cómo se decidió el plan: `subscription` \| `default` |
| `valid_until` | cuándo caduca el entitlement. `null` = sin cota / no premium |

No sale de aquí: `provider_customer_id`, `provider_subscription_id`, `last_event_id`, importes, metadata
de proveedor. El cuerpo de la función **no llega a leer** esas columnas.

### `features` es la ÚNICA autoridad de acceso. `plan` NUNCA es una puerta.

Los dos campos pueden discrepar legítimamente, y quien los consuma tiene que saber a cuál obedecer.

- `plan` es un **hecho comercial** (¿esta cuenta paga?) y se conserva a propósito incluso cuando el acceso
  está revocado: un `'*'` deny por abuso deja `plan='premium'` porque el cliente **sigue pagando de
  verdad**, y el MRR no debe mentir.
- `features` es la **decisión**.

La dirección peligrosa es la otra: si `plan_features` se vaciara o fuera ilegible, el resolver seguiría
publicando `plan='premium'` con el mapa de features **vacío**. Un consumidor escrito como
`if (ent.plan === 'premium')` —la migración natural desde el booleano `hasAurixPremiumAccess` de hoy—
concedería **todo** durante la caída del catálogo, que es precisamente el fail-open que este bloque existe
para evitar.

**Para B3 y todo lo que venga después: se gatea con `features[key] === true`. Nunca con `plan`.**
Certificado como escenario S24.

`subscription_status` se **cualifica por plan**: sin `plan='premium'` se publica `none`. Los DEFAULT de B1
(`plan 'free'`, `status 'active'`) producirían si no un `active` sobre una fila Free, que diría "tiene
suscripción activa" justo cuando no la tiene — y en la superficie que decide. El status crudo no se pierde:
sigue en `aurix_commercial_state()` de B1, que es donde vive el historial comercial.

Las claves canónicas se derivan de `plan_features` (`select distinct feature_key`), no de una lista dura
en el resolver: añadir una capacidad en B5 fluye sin tocar esta función. Se mantienen exclusivamente las
tres de B1 — `workspace.loan`, `intelligence.full`, `premium.settings`. Compound sigue siendo
comportamiento Free y no necesita entitlement.

---

## PRECEDENCIA

```
1. canonical subscription     → ¿hay un entitlement premium VÁLIDO?
2. plan feature matrix        → ¿qué incluye ese plan?
3. applicable override        → global '*' primero, luego la clave específica
4. sanitized effective result → lo que recibe el cliente
```

El paso 3 distingue las dos direcciones del override global, y **no** son simétricas:

- **Un DENY global (`'*'`, `allowed=false`) es ABSOLUTO**: cortocircuita y no consulta siquiera los
  overrides por feature. La primera versión aplicaba "gana el específico" en ambos casos, y eso **rompía
  el único caso de uso que el deny global tiene**: soporte cortando un abuso. Un grant por feature
  olvidado de una sesión de QA (`intelligence.full`, `true`, sin caducidad) sobrevivía a
  `('*', false, 'support')` y el kill switch no mataba nada. Detectado en revisión adversarial.
- **Un ALLOW global sí se refina** con los específicos: `'*'` allow más un `workspace.loan` deny deniega
  exactamente esa feature. Aquí la especificidad sí manda.

Ambas direcciones son necesarias: una es acceso founder/comp, la otra es abuso y devoluciones.

- Un override fuera de su ventana `[starts_at, expires_at)` **no tiene efecto en ninguna dirección**: un
  grant expirado no concede, y una denegación expirada no deniega.
- Un override que nombra una feature ausente de `plan_features` se **ignora**: un derecho tiene que
  existir en el catálogo antes de poder concederse, así que un override no puede inventar capacidades.
- `allowed` nulo no decide nada.

---

## FAIL-CLOSED

Sin evidencia válida ⇒ **Free**. Los valores iniciales de la función *son* el estado denegado, y sólo una
cadena completa de condiciones explícitas los mueve. Nunca Premium por: ausencia de fila, sesión
inexistente, plan desconocido, status desconocido, periodo expirado, trial vencido pero aún marcado
`trialing`, fila premium parcial, override malformado, catálogo vacío o dato legacy.

Dos decisiones deliberadas:

1. **`is not distinct from 'lifetime'`, no `=`.** Es la misma trampa de lógica trivaluada que la
   constraint `premium_bound` de B1 tuvo que cerrar: con la columna a NULL, `=` da NULL y el `or` entero
   se vuelve indeterminado.
2. **Un trial vencido que sigue marcado `trialing` es estado RANCIO ⇒ no premium.** Prefiere «un webhook
   tardío degrada el acceso un momento» sobre «un trial sin cerrar concede Premium indefinidamente».

El resolver **no confía en las CHECK de B1**: valida plan y status contra su propia lista blanca. Un
fail-closed que depende de una constraint de otra capa no es fail-closed — y la certificación lo
demuestra retirando esas constraints.

Una caída comercial puede **degradar** acceso. No puede concederlo.

---

## FOUNDER NO ES UN PLAN

Una cuenta founder/comp/QA recibe `feature_sources = 'override'` mientras `plan` sigue `free` y `source`
sigue `default`. Ese es todo el punto: la cuenta puede usarlo todo y **nunca aparece como suscriptor de
pago**, así que MRR/ARR, recuento de Premium y conversión quedan limpios. No existe ni puede existir
`plan='founder'` (la CHECK de B1 lo impide y el resolver no lo contempla).

**Preparado para Founder Preview (B4), no implementado:** `features` + `feature_sources` ya permiten
pintar cada herramienta con su estado comercial **real** (Incluido / Premium / Preview) sin convertir al
founder en cliente y sin alterar lo que ve un usuario normal. B2 no toma ninguna decisión que lo dificulte.

---

## AUDITORÍA DE AUTORIDAD LEGACY (§10)

Todos los puntos donde Aurix decide Premium/founder hoy, clasificados. **B2 no retira ninguno** — eso es
B3/B4. Lo que cambia es que ya existe la autoridad a la que migrarlos.

### A · Autoridad REAL, a sustituir por el resolver
| Owner | Línea | Nota |
|---|---|---|
| `hasAurixPremiumAccess(user)` | `app.js:50426` | Allowlist de email (`rbn892@gmail.com`) **más** `user.premium \|\| user.isPremium \|\| user.subscriptionActive`. **Es el gate real.** |
| call sites | `21510` (renderWorkspace), `50331` (`_wsFullBleed`), `50689` (Intelligence), `60467` y `63956` (badge/menú) | Los 5 consumidores vivos. B3/B4 los repunta a `features` |

La rama `user.premium / isPremium / subscriptionActive` **no tiene escritor hoy** (R3 de Phase A): sigue
latente y se vuelve auto-concesión el día que alguien mapee `user_metadata` sobre el objeto user. El
resolver es lo que hace innecesaria esa rama.

### B · Presentación únicamente (no conceden derecho)
`_aurixPremiumPreviewHTML` / `_aurixIntelligencePreviewHTML` (fallback fail-closed) ·
`_WS_APP_IDENTITY[].premiumTier` + `_wsToolTier` / `_wsTierChip` (chip del catálogo) ·
`AURIX_PREMIUM_UI_ENABLED = false` (`app.js:62908`) · `PLAN_CATALOG` (`62747`) · el modal Premium y sus
precios · `FOUNDER.founderSlotsTaken`.

### C · Legacy / muerto (cero consumidores reales)
`hasFeature()` (`62837`) — devuelve **siempre true** con `ENFORCE_ENTITLEMENTS = false`; su único
consumidor es `requireFeature()` (`63930`), que a su vez no tiene ninguno ·
`PLAN_FEATURES` (`62740`, donde `founder === premium`) · `PREMIUM_FEATURES` (`62727`) ·
`PLAN_LIMITS` · `PROMO_CODES` + `applyPromoCode` (`62871`, dormido, concesión local) ·
`localStorage.aurix_plan` · `user_portfolios.subscription` (columna intacta, escritor retirado en B7) ·
`window.aurixEntitlements` (superficie pública que hoy sólo publica estado cliente).

### D · Test / dev, NO comercial
`aurix_pce_founder` — toggle de diagnóstico del Chart. No mezclar pese al nombre.

**Ninguno de A–D concede entitlement en el resolver.** Siguen existiendo por compatibilidad.

---

## CERTIFICACIÓN

El comportamiento se certifica **ejecutando el resolver** contra Postgres real con filas reales:
`db/monetization_b2_resolver_certification.sql`, **24 de 24 escenarios PASS** contra producción, dentro
de una transacción revertida (cero filas persistidas). No es una reimplementación: las respuestas las da
la función.

La certificación es **autorreparable y no se fía del rollback**. Retira cuatro CHECK de B1 para poder
escribir estados que B1 hace inalcanzables, y eso es una carga explosiva: si el bloque se ejecutara sin la
transacción (un `begin;` que no entró, un cliente que trocea sentencias, un *highlight* parcial en el
editor SQL), producción se quedaría sin esas constraints — y **re-aplicar B1 no las repone**, porque viven
dentro de un `create table if not exists` que no-opea. Así que ahora: exige una **precondición** (0/0/12) y
se niega a correr si no se cumple, **repone** las 4 CHECK y el seed por sí misma, y **verifica** la
reposición antes de terminar. Detectado en revisión adversarial.

| | Escenario | Resultado |
|---|---|---|
| S1 | sin fila | free, las 3 denegadas |
| S2 | premium vigente | las 3 según `plan_features`, `source=plan` |
| S3 | periodo expirado | free |
| S4 | `canceled` / `past_due` / `expired` | free |
| S5 · S6 | trial vigente · trial rancio | premium · **free** |
| S7 | lifetime | premium, `valid_until` null |
| S8 | override deny sobre feature del plan | quita **una**, no toca el resto |
| S9 · S10 | override expirado · aún no vigente | sin efecto |
| S11 | override allow en usuario free | concede y **el plan sigue free** |
| S12 | override global `'*'` | las 3, plan sigue free |
| S13 | global allow + específico deny | gana el específico |
| S14 | deny global sobre premium de pago | features revocadas, **hecho comercial conservado** |
| S15 | override de clave fuera del catálogo | ignorado (3 claves, no 4) |
| S16 | aislamiento A/B | B no hereda nada de A |
| S17 | sin sesión | free |
| S18 | status desconocido · `plan='founder'` · fila premium parcial | free — **con las CHECK de B1 retiradas** |
| S19 | privacidad | sin provider IDs, sin event ID, sin importe |
| S20 | deny global `'*'` + allow específico preexistente | **todo denegado** — el kill switch mata de verdad |
| S21 | aislamiento de OVERRIDES A/B | B no hereda el `'*'` de A |
| S22 | `cancel_at_period_end` con periodo vigente | **sigue premium** — no se castiga a quien ya pagó |
| S23 | `expires_at` exactamente `= now()` | fuera de ventana (semiabierta) |
| S24 | catálogo `plan_features` vacío | cero features (fail-closed) y `plan` conserva el hecho comercial |
| RESTORE | reposición | 4 CHECK y seed repuestos, 0 filas de prueba |

Respuesta íntegra publicada al cliente en S19 (evidencia literal):

```
(premium, active,
 {"workspace.loan": true, "premium.settings": true, "intelligence.full": true},
 {"workspace.loan": "plan", "premium.settings": "plan", "intelligence.full": "plan"},
 subscription, 2026-10-01 …)
```

El gate de CI (`docs/AURIX-MONETIZATION-ENTITLEMENT-RESOLVER-harness.js`) no puede ejecutar Postgres —
sin red, sin credenciales, repo cero-dependencias. Cubre el contrato **y gatea la propia certificación**:
que siga cubriendo los 24 escenarios, que cada uno asevere de verdad y que termine en `rollback`.

---

## RESIDUALES

1. **La certificación no corre en CI.** Es la limitación estructural del entorno, igual que en B1. Debe
   re-ejecutarse a mano tras cualquier cambio del resolver; el harness sólo garantiza que no se debilite.
2. **Nadie consume el resolver todavía.** Los 5 gates vivos siguen en `hasAurixPremiumAccess`. Hasta B3
   el resolver es autoridad **disponible**, no autoridad **ejercida**.
3. **`window.aurixEntitlements` sigue publicando estado cliente** y su nombre invita a confundirlo con
   esto. Renombrarlo o repuntarlo es B3.
4. **El trial rancio degrada acceso** si un webhook tarda. Es la decisión correcta bajo fail-closed, y es
   una decisión: si algún día molesta, la respuesta es arreglar el webhook, no relajar el resolver.
5. **`valid_until` no se usa para invalidar caché en cliente todavía** (B3 decide TTL y revalidación).
6. **La rama latente `user.premium / isPremium / subscriptionActive`** sigue en el bundle sin escritor.
   Sigue siendo auto-concesión potencial hasta que B3/B4 retire `hasAurixPremiumAccess`.
7. **La certificación sigue retirando 4 CHECK de B1 mientras corre.** Es la única forma de probar el
   fail-closed del resolver sin depender de otra capa, y ahora es autorreparable y con precondición — pero
   la carga sigue ahí. **No ejecutar ese fichero por trozos.**
8. **El ACL del resolver no se certifica dentro del fichero** (todo corre como owner). Se verifica aparte,
   con `set local role`, y queda registrado abajo.
9. ~~La precondición `0/0/12` hará que esta certificación deje de poder ejecutarse~~ — **CERRADO en M.02
   B4 (2026-09-01)**, y antes de lo previsto: el override del founder hizo que la precondición se negara a
   correr, con razón, porque el sujeto `v_a` era la cuenta más antigua, que es justo la del founder, y el
   fichero iba a borrar datos reales. Corregido eligiendo **sujetos sin estado comercial** en lugar de
   exigir la base vacía, y afirmando el retorno al **estado de partida** en vez de a cero. La protección se
   conserva y la certificación sigue siendo ejecutable con clientes en la base.
10. **La clave canónica pasó de 3 a 4** en M.02 B4: `workspace.catalog_preview`, que **ningún plan
   concede** (`db/monetization_catalog_preview_key_1.sql`). El resolver la recogió **sin un solo cambio de
   código**, porque deriva su conjunto canónico de `plan_features` — la decisión de B2 de no hardcodear las
   claves se pagó sola. Sólo se actualizó el recuento en la certificación.
10. **`plan` y `features` pueden discrepar por diseño.** Es correcto y está documentado, y es exactamente el
   sitio donde un consumidor descuidado de B3 abriría un fail-open. El gate no puede protegerlo hasta que
   exista ese consumidor.

**NEXT: M.02 B3/B4 — product entitlement integration + founder catalog preview.**
