# AURIX · M.04 BILLING — PLAN DE ENSAYO (DIAGNÓSTICO / APPLY / ROLLBACK / RESTAURACIÓN)

> **ESTADO: ENSAYO EJECUTADO Y SUPERADO EN ENTORNO AISLADO (2026-09-07).**
> El ciclo completo corrió contra un PostgreSQL 17.11 local y desechable, en
> socket Unix y **sin ningún listener TCP**. Ocho puertas PASS, `PRE.data_fp ==
> POST.data_fp`. Ver §11.
>
> **Producción NO ha sido tocada** y sigue fuera de alcance: nada de Supabase,
> Stripe ni Vercel. Aplicar M.04 en producción exige una autorización aparte.
>
> Redactado 2026-09-07 · corregido el mismo día (directiva *CORRECCIÓN
> PREPARATORIA*) · ejecutado el mismo día · rama `main` · sin commit.

---

## 0. Por qué existe este plan, y qué cambió en la corrección

M.04 está congelado hasta que haya un rollback explícito y un plan de ensayo
certificable. Dos razones concretas le dan forma al documento.

**La primera: la asimetría de `subscriptions`.**
`aurix_billing_apply_event()` escribe en `public.subscriptions`, que es una tabla
de B1 y no de M.04. Retirar los objetos de M.04 no deshace esas escrituras. Un
rollback que sólo haga `DROP` deja cuentas en `plan='premium'`,
`provider='stripe'` y un `provider_customer_id` que ya no tiene tabla de mapeo
donde resolverse — un estado que ninguna capa sabe interpretar y que la UI
seguiría leyendo como Premium. **Rollback estructural y restauración de datos son
dos pasos distintos, y el segundo es obligatorio.**

**La segunda, y es la que motivó la corrección: el estado inicial no se puede dar
por limpio.** La versión anterior de este plan iba de "limpio" a "aplicado" sin
comprobar de dónde partía. No vale: el APPLY usa `create table if not exists`,
que **no-opea** sobre una tabla preexistente. Sobre un estado a medias, terminar
sin error no significa nada. Ahora el ensayo **empieza por un diagnóstico** que
clasifica el estado y decide el camino, y **el APPLY se verifica a sí mismo antes
de comitear**.

### Lo que la corrección añadió

| | Qué | Dónde |
|---|---|---|
| **A** | Diagnóstico determinista → `LIMPIO` / `PARCIAL` / `COMPLETO` | `01_diagnose_m04_state.sql` (nuevo) |
| **B** | La barrera del rollback pasa de declaración a **evidencia verificable** | rollback + cadena de *gates* |
| **D1** | **Atomicidad**: el APPLY es una transacción | APPLY canónico |
| **D2** | **Auto-verificación**: `APPLY VERIFIED` o `FAIL`, nunca "terminó sin error" | APPLY canónico + `04` |
| **D3** | `notify pgrst` **NO se implementa**: diferido por directiva | declarado en APPLY, rollback y `04` |

Y dos artefactos que la **ejecución** demostró necesarios (§11.3), sólo de
ensayo y nunca aplicables a producción: `00b_seed_pre_state.sql` (sin un PRE con
contenido el ensayo pasaba por vacuidad) y `05b_writer_live_mutation.sql` (sin
una mutación *persistida* del writer, el rollback no tenía asimetría que dejar
al descubierto).

---

## 1. Cadena de puertas (*gates*) — el mecanismo que une todo

Sin esto, cada paso era una promesa. Ahora cada paso **escribe una fila** que el
siguiente **exige**, y esas filas son la evidencia del ensayo.

`m04_rehearsal.run` guarda un `run_id` por ensayo. `m04_rehearsal.gates` guarda
una fila por puerta con `verdict ∈ (PASS, FAIL, BLOCKED)` y su `run_id`.

| Puerta | La escribe | Exige antes |
|---|---|---|
| `DIAGNOSE` | `01` | — (abre el run) |
| `PRE_CAPTURE` | `02` | `DIAGNOSE = PASS` |
| `VERIFY_PRE` | `03` | `DIAGNOSE` + `PRE_CAPTURE` |
| `POST_APPLY` | `04` | `VERIFY_PRE` |
| `WRITER` | `05` | `POST_APPLY` |
| `ROLLBACK` | rollback | `VERIFY_PRE` **+ integridad del snapshot** |
| `RESTORE` | `06` | `VERIFY_PRE` **+ integridad del snapshot** |
| `VERIFY_POST` | `07` | `ROLLBACK` + `RESTORE` |

Todas comparan el `run_id`: **una captura PRE de un ensayo anterior no autoriza
el rollback de éste.** Y una puerta sólo se escribe si el paso llegó al final —
si una aserción falla, el `raise` aborta y la fila no existe. La ausencia de la
fila **es** el bloqueo del paso siguiente.

Dos puertas no se exigen a propósito:

- El rollback **no** exige `WRITER`. Tiene que seguir sirviendo como **salida de
  emergencia** a mitad del ensayo; que las pruebas no se hayan corrido es
  información (avisa por `notice`), no un impedimento para retirar M.04.
- `06` (restore) **no** exige `ROLLBACK`. Restaurar `subscriptions` sin retirar
  M.04 es una operación legítima por sí misma. Es `07` quien exige las dos.

---

## 2. A · Diagnóstico del estado M.04

**Fichero nuevo:** `db/m04_rehearsal/01_diagnose_m04_state.sql`
**Ejecución: sin `-1`.** La evidencia se **comitea antes** de que el fichero
falle; un diagnóstico que se lleva su propia evidencia al abortar no es un
diagnóstico.

Inspecciona los cinco objetos —`billing_customers`, `billing_prices`,
`billing_events`, `aurix_billing_link_customer`, `aurix_billing_apply_event`— y
no sólo su existencia, sino la forma necesaria para decidir si **corresponde al
M.04 esperado**: conjunto de columnas con sus tipos, número de CHECK por tabla
(2 / 7 / 2), definición de la clave primaria, FK a `auth.users`, los dos índices
únicos, los triggers de `updated_at`, RLS activa, políticas (y si son
*restrictive* o *permissive*), privilegios de `anon`/`authenticated`, firma
exacta de cada función, `security definer`, `search_path` fijado, tipo de retorno
y `execute` concedido sólo a `service_role`.

Dos comprobaciones merecen mención aparte porque son las que detectan lo que un
catálogo por sí solo no ve:

- **El cuerpo de las funciones.** Se exige que `prosrc` contenga los nueve
  *outcomes* del contrato (`missing_period`, `other_subscription`,
  `unknown_status`, `unknown_price`, `unknown_customer`, `ignored_type`, `stale`,
  `duplicate`, `invalid_payload`) y, en `link_customer`, el fail-closed de handle
  ajeno. **Una firma idéntica con un cuerpo ANTERIOR —sin los guards de periodo,
  sin el desempate de segundo— es indistinguible por catálogo**, y es exactamente
  lo que un intento fallido puede dejar.
- **Restos.** Cualquier relación `billing_*` que no sea una de las tres, y
  cualquier función `aurix_billing*` cuya (nombre, firma) no sea una de las dos.
  Una sobrecarga sobrante no es inocua: **sobreviviría al `DROP` del rollback** y
  dejaría M.04 medio retirado sin que nada lo delatase.

### La clasificación

```
LIMPIO    ⇔  0 de los 5 objetos presentes  Y  0 restos
COMPLETO  ⇔  5 de 5 presentes  Y  0 fallos de forma  Y  0 restos
PARCIAL   ⇔  todo lo demás
```

Está construida **por eliminación**: `LIMPIO` y `COMPLETO` exigen condiciones
positivas y exhaustivas, y **todo lo que no las cumple cae en `PARCIAL`**. No
existe ninguna rama por la que un estado no previsto pueda acabar pareciendo
limpio — que es el requisito literal de la directiva.

`gate DIAGNOSE = PASS` **sólo** con `LIMPIO`. `COMPLETO` y `PARCIAL` quedan
`BLOCKED`, y sin ese `PASS` el paso 2 se niega a capturar, con lo que la cadena
entera queda cortada.

### Qué entrega

`m04_rehearsal.diagnose_findings`, una fila por comprobación con **esperado y
encontrado lado a lado** y las que fallan primero. Sin esa tabla, "está parcial"
no es evidencia con la que diseñar nada.

**Este fichero no repara.** No crea, no borra y no altera ningún objeto M.04 ni
ninguna fila de negocio: sólo lee catálogos y escribe su propia evidencia.
Diseñar la reparación de un `PARCIAL` todavía desconocido es un bloque posterior,
y hacerlo aquí a ciegas es la forma de convertir un diagnóstico en un incidente.

---

## 3. B · Barrera bloqueante del rollback

**Fichero:** `db/monetization_m04_billing_stripe_1_rollback.sql`

La versión anterior se contentaba con un opt-in de sesión: el operador declaraba
"tengo un snapshot" y el `DROP` arrancaba. **Eso no es una barrera, es una
casilla.** Una declaración no se distingue de un error de buena fe, y el fallo
que hay detrás —dejar cuentas premium huérfanas sin forma de volver atrás— es
irreversible.

Ahora hay **dos puertas independientes**, y las dos están **dentro de la
transacción** a propósito: aunque alguien ejecute el fichero sin
`ON_ERROR_STOP`, el `raise` aborta y los `DROP` no llegan a comitear.

**Puerta 1 · intención** (necesaria, insuficiente): sigue exigiendo
`set aurix.m04_rollback_ack = 'TENGO-SNAPSHOT-PRE-DE-SUBSCRIPTIONS'`. Sirve para
que nadie ejecute el fichero por inercia. Nada más.

**Puerta 2 · hecho verificable** — se comprueba, aquí y ahora, que la captura PRE:

| Requisito | Cómo se comprueba |
|---|---|
| **existe** | `run`, `gates`, `manifest` y `subscriptions_pre` presentes |
| **es de este ensayo** | `run_id` del gate y del manifiesto == `run_id` en curso |
| **superó VERIFY PRE** | `gate VERIFY_PRE = PASS` del mismo run |
| **tiene nº de filas registrado** | `manifest.row_count` no nulo |
| **tiene huella registrada** | `manifest.data_fp` no nulo ni vacío |
| **está COMPLETA** | filas del espejo **==** `manifest.row_count` |
| **sigue siendo FIEL** | huella **recalculada sobre el espejo** == `manifest.data_fp` |
| **la evidencia no fue alterada** | `gate.detail` **==** los valores del manifiesto |

Las dos últimas son las que convierten esto en una barrera real. Que el snapshot
**exista** no basta: pudo ser truncado o editado después de verificarse. Y el
cruce `gate ↔ manifest` detecta que alguien haya reescrito uno de los dos por su
cuenta — sin él, un manifiesto editado podría "validar" un espejo que ya no es el
que se verificó.

Si algo falla: **`ROLLBACK = BLOCKED`**, con el motivo concreto. No continúa en
silencio. El mismo bloque de comprobaciones está en `06` (restore), porque
restaurar desde un espejo no verificado es tan peligroso como no restaurar: se
sobrescribiría `subscriptions` con un estado que nadie ha demostrado que sea el
PRE.

**Restauración y rollback siguen separados.** El rollback no invoca `06` ni lo
sustituye; lo que hace es negarse a empezar si la restauración no va a ser
posible. Y la protección transaccional se conserva íntegra: `TRUNCATE` + `INSERT`
en una transacción, con el escalado a volcado externo documentado en §7.

---

## 4. APPLY canónico — reutilizado, con D1 y D2 dentro

**Fichero:** `db/monetization_m04_billing_stripe_1.sql`
**Ejecución: sin `-1`** (el fichero ya es dueño de su transacción).

### Orden interno y dependencias

| # | Objeto | Depende de |
|---|---|---|
| 1 | `public.billing_customers` | `auth.users` (FK, `on delete cascade`) · `aurix_touch_updated_at()` |
| 2 | `public.billing_prices` | `aurix_touch_updated_at()` |
| 3 | `public.billing_events` | `auth.users` (FK, `on delete set null`) |
| 4 | `aurix_billing_link_customer(uuid,text,text)` | tabla 1 |
| 5 | `aurix_billing_apply_event(...14 args)` | tablas 1, 2, 3 **y `public.subscriptions` (B1)** |

Dependencias **externas**, que deben existir antes: `subscriptions`,
`plan_features`, `entitlement_overrides` y `aurix_touch_updated_at()` (B1);
`aurix_entitlements()` / `aurix_commercial_state()` (B2, no modificados); los
roles `anon`/`authenticated`/`service_role`; y el esquema `auth` con `users` y
`uid()`.

Sigue siendo **aditivo e idempotente**, y deja `billing_prices` **vacía a
propósito** (los `price_id` de Stripe no existen hasta crearlos; sembrar
placeholders es el fallo que la migración evita).

### D1 · Atomicidad — qué cambió exactamente

**Cambio:** `begin;` inmediatamente antes de la sección 1 y `commit;` justo
después de los `grant` de la sección 5. Más una nota en la cabecera.

**Por qué:** Postgres ejecuta DDL de forma transaccional, así que los cinco
objetos y sus privilegios pasan a aterrizar **todo o nada**.

**Qué riesgo elimina:** el fichero es idempotente, e **idempotente no es lo mismo
que atómico**. Ejecutado por trozos —o en un cliente que autocommitea cada
sentencia— podía dejar un M.04 **PARCIAL**: tablas creadas, y los `grant` o el
writer no. Una re-ejecución posterior habría no-opeado sobre la forma
equivocada e informado de éxito. Ése es el estado por el que este bloque está
congelado.

**Qué comportamiento conserva:** todo. Sigue siendo idempotente y aditivo,
re-ejecutarlo sobre un M.04 correcto sigue siendo un no-op, y sigue sin tocar
B1/B2.

### D2 · Auto-verificación — qué cambió exactamente

**Cambio:** un bloque `do $$ … $$;` al final de la sección 5, **dentro de la
transacción**, antes del `commit;`.

**Qué afirma:** existencia **y forma** — CHECK por tabla (2/7/2), las tres claves
primarias (incluida la de `billing_events`, que **es** la idempotencia), los dos
índices únicos, RLS en las tres, **exactamente una** concesión al cliente
(`billing_prices`/`SELECT` a `authenticated`), las dos funciones por firma
exacta, `security definer`, `search_path` fijado, `execute` sólo para
`service_role`, y cero sobrecargas sobrantes.

**Resultado objetivo:** o imprime `M.04 APPLY VERIFIED`, o lanza. Y como está
antes del `commit;`, **una forma que no cuadra significa que no se comitea
nada**. Terminar sin error ha dejado de ser evidencia de algo.

**Qué riesgo elimina:** que `create table if not exists` no-opee sobre una tabla
preexistente a medias y el APPLY reporte éxito sin haber creado los CHECK, el
índice único o la RLS que faltaban.

**Qué comportamiento conserva:** el bloque sólo **lee** catálogos y es
**autocontenido** —no depende del andamiaje del ensayo—, así que se comporta
igual dondequiera que se ejecute el fichero. Ninguna tabla, columna, constraint,
política, grant ni cuerpo de función fue modificado.

### D3 · Diferido

**No se implementa `notify pgrst, 'reload schema'` en esta fase.** Es una
cuestión de **visibilidad**, no de la seguridad ni de la reversibilidad que se
está certificando. Queda declarado en la cabecera del APPLY, en el punto 7 de
"lo que el rollback no revierte" y en `04`. **Consecuencia asumida:** tras un
APPLY o un rollback, una sonda HTTP puede seguir describiendo el estado
anterior — y por eso todo VERIFY de este plan se hace por **catálogo**
(`to_regclass`, `pg_proc`), nunca por HTTP.

---

## 5. Captura PRE, restauración y VERIFY

### 5.1 PRE — `02_pre_capture.sql`

Captura estructura (`fp_struct()`: columnas + CHECK + índices + triggers +
políticas + RLS + grants), filas y valores (espejo `subscriptions_pre`), número
de filas y **huella determinista** (`fp_data()`), todo anotado en
`m04_rehearsal.manifest` con su `run_id`.

Tres decisiones de determinismo, y las tres importan:

1. **`to_jsonb(fila)`** en vez de una lista de columnas escrita a mano: una lista
   a mano **ignora en silencio** una columna añadida después, y esa columna es
   justo donde se esconderá la diferencia que buscamos.
2. **`set timezone = 'UTC'`** en la función: `jsonb` renderiza `timestamptz`
   según el TimeZone de la sesión, así que sin fijarlo la misma fila da dos
   huellas y el ensayo produce un **FAIL inventado**.
3. **`fp_of(regclass)`** — la relación es un **parámetro**, no `public.subscriptions`
   clavado. Es lo que permite recalcular la huella **del espejo** más tarde, y esa
   es la comprobación que convierte la barrera del rollback en un hecho.

**Se niega a sobrescribir una captura previa**: una PRE pisada por otra
posterior al APPLY convertiría el ensayo en un PASS automático.

**El espejo en la misma BD no es la autoridad.** Vive en el mismo dominio de
fallo que el original —el mismo `TRUNCATE` equivocado, el mismo `DROP SCHEMA`, el
mismo `docker volume rm` se lleva los dos— y no puede demostrar que no fue
editado. Se queda sólo como instrumento de la comparación SQL; la **autoridad es
un volcado externo** con su `sha256` anotado antes del APPLY:

```
mkdir -p evidence/m04
pg_dump "$REHEARSAL_DB_URL" --schema-only --no-owner --no-privileges \
        --table=public.subscriptions  > evidence/m04/subscriptions_PRE.schema.sql
pg_dump "$REHEARSAL_DB_URL" --data-only  --no-owner --no-privileges \
        --table=public.subscriptions  > evidence/m04/subscriptions_PRE.data.sql
psql "$REHEARSAL_DB_URL" -At -c "select * from m04_rehearsal.manifest" \
                                      > evidence/m04/subscriptions_PRE.manifest.txt
shasum -a 256 evidence/m04/subscriptions_PRE.*  > evidence/m04/subscriptions_PRE.sha256
```

### 5.2 RESTORE — `06_restore_subscriptions.sql`

**`TRUNCATE` + `INSERT … SELECT * FROM` el espejo**, en una transacción. No un
upsert quirúrgico, por dos trampas reales:

**Trampa 1 — el trigger.** `subscriptions_touch_updated_at` es `BEFORE UPDATE` y
hace `new.updated_at := now()` **incondicionalmente**. Restaurar por `UPDATE` es
**imposible** de casar con el PRE: el trigger pisa el `updated_at` que acabas de
escribir. Habría que desactivarlo, y un fichero corrido a trozos puede dejarlo
**desactivado para siempre**. **Un `INSERT` no dispara ese trigger.**

**Trampa 2 — los índices únicos parciales de B1**
(`subscriptions_provider_event_uidx`, `subscriptions_provider_sub_uidx`), que no
son diferibles: un upsert multifila puede colisionar **transitoriamente** con una
fila a la que aún no le ha llegado el turno y fallar por un conflicto que en el
estado final no existe. Vaciar primero elimina la clase entera de problema.

`TRUNCATE` es seguro y está verificado: **ninguna tabla tiene una FK hacia
`public.subscriptions`** (sólo la leen `aurix_commercial_state` y
`aurix_entitlements`), así que no hay `CASCADE`, y no hay secuencias que resetear.

**Precondiciones antes de vaciar nada:** la barrera de evidencia completa de §3,
más **cero filas del PRE apuntando a cuentas que ya no existen en `auth.users`**
(la FK haría fallar el `INSERT` a mitad; mejor saberlo antes).

**Si falla a mitad:** todo va en una transacción, así que Postgres revierte
`TRUNCATE` e `INSERT` **juntos** y `subscriptions` se queda como estaba **antes
de intentar restaurar** (post-APPLY, con las escrituras del writer), **nunca
medio restaurada**. Un estado conocido-sucio es diagnosticable; uno a medias no.
Escalado: **no reintentar a ciegas** → recargar el volcado externo; y si nada
funciona, en un entorno desechable la salida limpia es **destruirlo y rehacerlo**.

### 5.3 Los tres VERIFY

| Fichero | Afirma | Cualquier diferencia |
|---|---|---|
| `03_verify_pre.sql` | M.04 **ausente** (catálogo, sobrecargas incluidas) · B1/B2 en pie con sus **12 CHECK** · la captura PRE es de este run, está **completa** y su huella es **reproducible ahora** sobre la tabla viva **y sobre el espejo** | FAIL |
| `04_verify_post_apply.sql` | Los 5 objetos con la forma esperada · catálogo **vacío** · **el APPLY no tocó `subscriptions`** | FAIL |
| `07_verify_post_rollback.sql` | M.04 ausente · `subscriptions` **idéntica al PRE por dos métodos independientes** · estructura idéntica · **0 restos** · B1/B2 en pie con sus 12 CHECK | FAIL |

`04` **no duplica** la auto-verificación del APPLY: hace las dos cosas que aquel
no puede. (1) Verifica **desde fuera**, en otra transacción — un bloque que se
autoevalúa dentro de su propia transacción no puede afirmar nada sobre lo que
quedó **comiteado**. (2) Afirma que **el APPLY no mutó `subscriptions`**, que
exige el manifiesto PRE y es por tanto inalcanzable desde dentro de un APPLY
autocontenido. Esa segunda afirmación **separa causas**: si la huella cambia ahí,
la mutación es del APPLY y no del writer.

En `07`, la comparación es **en ambos sentidos y por dos caminos**: huella `md5`
sobre `to_jsonb`, y `EXCEPT` nativo `live − PRE` **y** `PRE − live`. Sin la
dirección `PRE − live`, una fila del PRE que se **perdiera** daría PASS; y los
dos caminos comparan por mecanismos distintos, así que el fallo de uno no puede
ocultar el del otro.

---

## 6. Writer / idempotencia — sin Stripe

**Fichero:** `05_writer_idempotency_tests.sql` (exige `POST_APPLY = PASS`).

Ejecuta las dos funciones contra Postgres real dentro de `begin; … rollback;`,
con resultados en una tabla `TEMP`. Reutiliza el patrón ya certificado en
`db/monetization_b2_resolver_certification.sql`. **Al terminar la base queda
exactamente como estaba**, y el gate `WRITER` se escribe **después** del
`rollback;` — dentro, el propio rollback se lo llevaría. Como cualquier aserción
fallida aborta antes, **la existencia de esa fila es la prueba de que las 18
pasaron**.

Sin Stripe **no es una limitación, es el punto**: el writer decide desde
`billing_customers` y `billing_prices`, no desde el payload, así que un evento
fabricado a mano ejerce el mismo camino que uno firmado.

| # | Escenario | Se exige |
|---|---|---|
| L1 | `link_customer` crea el mapeo | devuelve el handle, 1 fila |
| L2 | **Idempotencia**: segunda llamada con otro handle | conserva el original, **no acumula customers** |
| L3 | Handle ya usado por otra cuenta | **raise**, sin re-apuntar (fuga entre cuentas) |
| L4 | Argumento nulo | raise |
| A1 | Camino feliz | `applied`, premium/active, **precio e intervalo del catálogo** |
| A2 | **Mismo `event_id` dos veces** | 1ª válida, 2ª `duplicate`; **la fila entera no cambia**, 1 fila en el ledger |
| A3 | **Rechazo reintentable** | `unknown_customer` → se crea el mapeo → **el MISMO `event_id` aplica** |
| A4 | **Periodo ausente** | `missing_period` reintentable y **0 filas nuevas** |
| A5 | `trialing` sin `trial_end` | `missing_period` |
| A6 | Precio no mapeado | `unknown_price`, no concede |
| A7 | Status desconocido (`paused`) | **degrada** a free/expired — nunca congela conservando Premium |
| A8 | **Empate de segundo** | un `created` no pisa a un `updated` del mismo `ts` → `stale` |
| A9 | Evento estrictamente antiguo | `stale` |
| A10 | Tipo ignorado | `ignored_type`, rastro, **0 escritura** |
| A11 | `deleted` de **otra** suscripción | `other_subscription`; la cuenta **no** se degrada |
| A12 | `deleted` de la suya | free, y **precio/intervalo a `null`** |
| A13 | Status vacío | `invalid_payload` |
| A14 | El ledger | **13 filas exactas**, 0 eventos resueltos sin `user_id` |
| PRIV | Privilegios | el cliente no ejecuta el writer, no escribe precios, no ve tablas sensibles, **sí** lee el catálogo |

**No cubierto — residual declarado:**

- **Serialización del `for update` entre dos reintentos concurrentes.** Una
  transacción no puede competir consigo misma. Exige **dos sesiones `psql`**:
  la 1 abre transacción y llama con `evt_X` sin comitear; la 2 llama con `evt_X`
  y debe **bloquearse** hasta el commit de la 1 y devolver `duplicate`. Manual.
- Firma de Stripe y extractor de `api/billing/webhook.mjs`. No es SQL.
- RLS **tal como la aplica PostgREST con un JWT real**.

---

## 7. Entorno aislado — método mínimo desechable (**NO creado**)

**Postgres local en contenedor, en loopback, sin ninguna credencial de Aurix.**

```
docker run -d --name m04-rehearsal \
  -e POSTGRES_PASSWORD=<local-only> -e POSTGRES_DB=m04_rehearsal \
  -p 127.0.0.1:55432:5432 postgres:15
export REHEARSAL_DB_URL='postgresql://postgres:<local-only>@127.0.0.1:55432/m04_rehearsal'
```

`-p 127.0.0.1:55432` (no `0.0.0.0`) y puerto no estándar: **no hay ruta de red
hacia producción**. Bootstrap: `00_bootstrap_local_stub.sql` crea **lo mínimo**
—roles `nologin`, `auth.users` reducida, `auth.uid()` estándar—.

**No se crea `public.user_portfolios` a propósito**: es la **prueba positiva** de
que este entorno no es Aurix, y **los siete scripts del ensayo se niegan a correr
si la encuentran**. Es más fiable que mirar el nombre de la base o la URL, porque
no depende de cómo se conectó el operador.

**Verificación de no-productividad:** (1) ese guard en cada script; (2)
`inet_server_addr()` debe ser loopback o socket Unix; (3) `REHEARSAL_DB_URL`
contiene `127.0.0.1` y en esa shell **no** se exporta ninguna `SUPABASE_*` ni
`STRIPE_*`; (4) **nunca `supabase db query --linked`** — `--linked` apunta al
proyecto vinculado, que es producción.

**Destrucción:** `docker rm -f m04-rehearsal && docker volume prune -f`, y
`docker ps -a --filter name=m04-rehearsal` debe devolver 0 filas. Sin volumen
persistente, el borrado se lleva los datos. `evidence/m04/` se conserva y **no
contiene secretos**: estructura, huellas y filas de un `subscriptions` de fixture.

**Alternativa rechazada, con causa:** un segundo proyecto Supabase o una branch.
Es alcanzable por red, exige credenciales reales y sus claves son **confundibles**
con las de producción — precisamente el error que este ensayo existe para no
cometer.

---

## 8. F · Plan final y bifurcación

**DIAGNÓSTICO → VERIFY PRE → APPLY → AUTO-VERIFY → WRITER/IDEMPOTENCY → ROLLBACK/RESTORE → VERIFY POST**

| Paso | Acción | Fichero | `-1` | PASS |
|---|---|---|---|---|
| 0 | Entorno + bootstrap + B1, B2, catálogo | `00_bootstrap_local_stub.sql` | — | `BOOTSTRAP OK`, servidor loopback |
| 1 | **DIAGNÓSTICO** | `01_diagnose_m04_state.sql` | **no** | `LIMPIO` ⇒ `gate DIAGNOSE=PASS` |
| 2 | **PRE**: espejo + huellas + manifiesto | `02_pre_capture.sql` | **no** | `PRE CAPTURADO`, live = espejo = manifiesto |
| 2b | **Volcado externo + sha256** (la autoridad) | comandos §5.1 | — | 3 ficheros en `evidence/m04/` + `.sha256` |
| 3 | **VERIFY PRE** | `03_verify_pre.sql` | sí | `VERIFY PRE = PASS` |
| 4 | **APPLY** (atómico, se auto-verifica) | `db/monetization_m04_billing_stripe_1.sql` | **no** | `M.04 APPLY VERIFIED` |
| 5 | **AUTO-VERIFY externo** | `04_verify_post_apply.sql` | sí | `APPLY VERIFIED (gate independiente)` |
| 6 | **WRITER / IDEMPOTENCIA** | `05_writer_idempotency_tests.sql` | **no** | 18 escenarios + `PRIVILEGIOS: PASS` |
| 7 | **ROLLBACK** (barrera de evidencia) | `db/monetization_m04_billing_stripe_1_rollback.sql` | **no** | `M04 ROLLBACK ESTRUCTURAL: OK` |
| 8 | **RESTORE** de `subscriptions` | `06_restore_subscriptions.sql` | **no** | `RESTORE OK`, `data_fp` = PRE |
| 9 | **VERIFY POST** | `07_verify_post_rollback.sql` | sí | `PASS`: 0 objetos M.04, huellas iguales, `EXCEPT` 0/0 |

**Regla de invocación:** los ficheros que abren su propia transacción se ejecutan
**sin `-1`**; anidar un `BEGIN` sobre otro hace que su `commit`/`rollback` interno
deje de significar lo que dice.

**FAIL = cualquier diferencia.** Todos los scripts abortan con `raise` en la
primera aserción incumplida; no hay grados.

### La bifurcación del paso 1

| Clase | Qué pasa |
|---|---|
| **LIMPIO** | `gate DIAGNOSE=PASS`. Puede continuar al paso 2 **cuando exista autorización**. |
| **PARCIAL** | **STOP.** `BLOCKED`, el fichero falla ruidosamente, **no se repara automáticamente**. Se entrega `diagnose_findings` para diseñar después una reparación específica. |
| **COMPLETO** | **STOP.** `BLOCKED`, **no se reaplica automáticamente**. Se entrega la evidencia para decidir el siguiente paso. |

En los dos casos de STOP la evidencia **ya está comiteada** antes de que el
fichero falle, y sin `DIAGNOSE=PASS` la cadena de puertas corta el paso 2 y, con
él, todo lo demás.

### Artefactos y evidencias a revisar antes de autorizar la ejecución

1. Los 9 ficheros de M.04, leídos línea a línea (**ninguno se ha ejecutado**).
2. La tabla *"lo que el rollback NO revierte"* (§3 del fichero de rollback),
   **aceptada explícitamente**.
3. El método de entorno del §7 y su prueba de no-productividad.
4. Confirmación de que la versión de Postgres del contenedor coincide con la de
   Supabase.

### Evidencias que producirá la ejecución

`evidence/m04/subscriptions_PRE.{schema,data}.sql`, `…manifest.txt`, `…sha256`;
la salida de los pasos 0→9; `m04_rehearsal.diagnose_findings`;
`m04_rehearsal.gates` con las ocho puertas; y `m04_rehearsal.manifest` con las
tres fases (`PRE`, `POST_APPLY`, `POST`), donde **`PRE.data_fp == POST.data_fp`**
es la afirmación central del ensayo.

---

## 9. G · Revisión estática — resultado

Revisada la coherencia entre APPLY, diagnóstico, PRE capture, VERIFY PRE,
POST-APPLY, writer tests, rollback, restore, POST-ROLLBACK y esta documentación.
Comprobado que todo objeto `m04_rehearsal.*` que un fichero usa lo crea `01` o
`02`, ambos anteriores a todos sus consumidores; que los `$$` y los bloques
`do`/`end` están balanceados en los 9 ficheros; y que no quedan referencias a los
nombres de fichero anteriores a la renumeración.

**Resultado: PASS**, con tres defectos encontrados y corregidos en esta misma
pasada y dos residuales declarados.

### Defectos encontrados y corregidos

| | Defecto | Corrección |
|---|---|---|
| 1 | **`psql -1` sobre ficheros que abren su propia transacción** (`02`, `05`, `06`, APPLY, rollback). Anidaba un `BEGIN` sobre otro; en `05` el `rollback;` interno y el `COMMIT` de psql dejaban de significar lo mismo. | Regla de invocación explícita por fichero y en `00`. |
| 2 | **Choque de PK en el manifiesto al reabrir un run.** `02` insertaba `'PRE'` sin `on conflict`: tras un ensayo cerrado con el manifiesto en pie, el paso 2 fallaba por una razón ajena a la captura. | `delete` de las filas de runs anteriores + `on conflict (fase) do update`. |
| 3 | Referencias de fichero obsoletas tras la renumeración (`01_pre_capture` → `02_pre_capture`, etc.). | Todas actualizadas. |

### Los cuatro caminos prohibidos

| Camino | ¿Bloqueado? | Cómo |
|---|---|---|
| **APPLY sobre PARCIAL sin autorización** | Sí, por dos vías | `DIAGNOSE=BLOCKED` corta la cadena en `02`; y si alguien ejecutase el APPLY suelto, su auto-verificación **no comitea** una forma que no cuadre. |
| **Reaplicar sobre COMPLETO** | Sí, procedimentalmente | `DIAGNOSE=BLOCKED` corta la cadena; `04` exige `VERIFY_PRE`, que no existirá. |
| **Rollback sin snapshot PRE verificado** | Sí, técnicamente | Dos puertas **dentro de la transacción**: intención + evidencia (existe / de este run / `VERIFY_PRE=PASS` / filas / huella / completa / fiel / no alterada). |
| **Declarar PASS con estado ambiguo** | Sí | Clasificación por eliminación (ambiguo ⇒ `PARCIAL`) y puertas que sólo se escriben si el paso llegó al final. |

### Residuales de la revisión

**R1 · El APPLY ejecutado suelto no consulta la cadena de puertas.** Es
autocontenido a propósito (§4, D2), así que técnicamente puede invocarse sin
diagnóstico. Mitigado, no eliminado: sobre `PARCIAL` su auto-verificación
**falla y no comitea**, y `04` se niega después sin `VERIFY_PRE`. Sobre
`COMPLETO` es un no-op genuinamente inocuo —todo el fichero es
`if not exists` / `or replace` / `drop … if exists; create …`—; el riesgo no es
daño, es la falsa impresión de haber hecho algo. **No se ha añadido al APPLY un
"niégate si M.04 ya existe" porque eso rompería su idempotencia**, que es una
propiedad declarada del artefacto. El control es el procedimiento.

**R2 · La barrera del rollback acopla el rollback al esquema `m04_rehearsal`.**
Hoy es lo correcto —el rollback debe ser imposible sin snapshot verificado—, pero
tiene una consecuencia que hay que decidir antes de usarlo en producción: el
`02_pre_capture.sql` lleva el guard anti-producción, así que **hoy no existe
ningún camino autorizado para un rollback en producción**. Cuando se autorice,
hará falta un cambio deliberado y aparte (parametrizar el guard). Se declara en
vez de dejar un portillo.

---

## 11. Ejecución real — 2026-09-07

### 11.1 Entorno

PostgreSQL **17.11** (Homebrew, aarch64), instalado sólo para esto. Clúster
efímero en `/tmp/m04_rehearsal_pg/data`, arrancado con `-h '' -c
listen_addresses=''`: **el servidor no abrió NINGÚN socket TCP** (`lsof` sobre el
pid: cero TCP/UDP; `psql -h 127.0.0.1 -p 5432` → *connection refused*).
`inet_server_addr()` y `inet_server_port()` devuelven NULL. Sin
`SUPABASE_*`/`STRIPE_*`/`DATABASE_URL` en la shell. Destruido al terminar.

### 11.2 Resultado

**M.04 REHEARSAL PASS**, certificado en una **segunda corrida limpia** sobre una
base recién creada, con los artefactos ya corregidos y **cero intervención a
mitad**:

| Puerta | Veredicto |
|---|---|
| `DIAGNOSE` | PASS · `LIMPIO` (0/5 objetos, 0 restos) |
| `PRE_CAPTURE` | PASS · 3 filas |
| `VERIFY_PRE` | PASS |
| APPLY (D2, dentro de su transacción) | **`M.04 APPLY VERIFIED`** |
| `POST_APPLY` | PASS · `subscriptions` intacta |
| `WRITER` | PASS · **18/18** escenarios + privilegios |
| `ROLLBACK` | PASS · 0 restos, B1/B2 en pie |
| `RESTORE` | PASS |
| `VERIFY_POST` | PASS · `EXCEPT` 0/0 en ambos sentidos |

Trazas de huella de la corrida de certificación:
`PRE = e518abd5…` → `DIRTY = 228e7090…` (4 filas, el writer escribió de verdad)
→ `POST = e518abd5…`. **La igualdad PRE/POST no es vacua: la huella se movió en
medio.**

**La asimetría se observó en vivo**, que era el objeto del ejercicio: tras el
rollback quedaban **0 tablas M.04** y `subscriptions` seguía con la cuenta
ascendida a `premium/stripe` y con la fila fabricada para una cuenta que antes no
tenía ninguna. Sólo el paso de RESTORE lo deshizo.

Y la prueba más fina de que el restore por `INSERT` era la decisión correcta: el
`updated_at` de la cuenta mutada volvió al valor **exacto** del PRE
(`18:24:55.383993+02`). Por `UPDATE`, el trigger `BEFORE UPDATE` lo habría
pisado y la igualdad habría sido imposible.

**Barrera del rollback, cuatro pruebas negativas, las cuatro bloquearon** sin
borrar ni una tabla, y con la evidencia repuesta byte a byte después:

| | Manipulación | Resultado |
|---|---|---|
| N1 | sin opt-in de sesión | `BLOCKED` puerta 1/2 |
| N2 | `VERIFY_PRE` degradado a `FAIL` | `BLOCKED` puerta 2/2 |
| N3 | manifiesto alterado tras verificarse | `BLOCKED` por el cruce gate↔manifest |
| N4 | espejo alterado (fila extra) | `BLOCKED` por captura incompleta |

Y `07` ejecutado **antes** del restore bloqueó en vez de dar PASS, que es lo que
impide certificar un rollback estructural sin restauración.

### 11.3 Lo que la ejecución encontró (y la revisión estática no)

Tres defectos reales, los tres en mis propios artefactos, ninguno en lógica
productiva:

1. **`text || "char"` es ambiguo.** `fp_struct()` concatenaba `t.tgenabled`, que
   es de tipo `"char"` de 1 byte: Postgres se niega a resolver el operador y la
   función **no se podía ni crear**. Corregido con `::text`. La revisión estática
   no podía verlo porque exige el analizador de tipos de Postgres.

2. **`pg_get_function_identity_arguments()` incluye los NOMBRES de los
   parámetros** (`p_user_id uuid, …`), no sólo los tipos. Las tres comprobaciones
   de identidad de función —en el D2 del APPLY, en el diagnóstico y en `04`—
   comparaban contra una lista de tipos desnudos, así que **daban FAIL contra un
   M.04 perfectamente aplicado**. Un falso FAIL en una puerta fail-closed hace
   tanto daño como un falso PASS: habría bloqueado el bloque entero atribuyendo
   el fallo a la migración. Corregido a `to_regprocedure()`, que resuelve por
   tipos — que es lo que de verdad identifica una función en Postgres.
   **Esto lo destapó D1:** el APPLY abortó en su propia verificación y dejó 0
   tablas, demostrando la atomicidad de paso.

3. **El ensayo pasaba por vacuidad.** `05` es transaccional y no deja residuo, así
   que `subscriptions` llegaba al rollback sin una sola mutación: el restore no
   tenía nada que restaurar y el `EXCEPT` comparaba la tabla consigo misma.
   **Habría dado PASS sin demostrar la reversibilidad.** De ahí `00b` y `05b`.

Nota sobre el método de evidencia del §5.1: el `sha256` de un `pg_dump` de
PostgreSQL 17 **no** sirve para comparar dos volcados tomados en momentos
distintos — pg_dump emite un *nonce* aleatorio en sus líneas `\restrict` /
`\unrestrict` en cada invocación. Sirve para detectar que un fichero guardado
fue manipulado, que es para lo que está. Para comparar volcados hay que
normalizar esas líneas (hecho: payload idéntico, `3a9b211f…` en los dos).

---

## 10. Riesgos y bloqueos

**B1 · CERRADO (2026-09-07).** Era "ningún artefacto ha sido ejecutado". El
ciclo completo se ejecutó contra PostgreSQL 17.11 real y aislado, y la corrida de
certificación pasó sin intervención (§11). Los tres defectos que tenía están
corregidos y vueltos a ejecutar.

**B2 · El stub de `auth` no es Supabase.** `service_role` con `bypassrls`,
`auth.users` reducida, sin PostgREST ni JWT. El ensayo **no** prueba RLS por el
camino HTTP.

**B3 · Producción no está en el estado PRE, y sigue sin saberse en cuál está.**
**Sigue abierto y es ahora el bloqueo principal.**
El bloqueo de M.04 continúa abierto: se aplicó a mano el 2026-09-05 y la sonda
externa sigue en `PGRST205`. **Este ensayo no lo responde** — pero ahora el
diagnóstico del paso 1 **es exactamente la herramienta que lo respondería**, y su
sonda por catálogo (`to_regclass`, no HTTP) es la que separa "no existe" de
"existe y PostgREST no lo anuncia". Ejecutarlo contra producción exige levantar
el guard anti-producción y una autorización que **no** forma parte de este
encargo.

**B4 · La reparación de `PARCIAL` no existe, por directiva.** Si el diagnóstico
devuelve `PARCIAL`, el ensayo para y hay que diseñar la reparación con la
evidencia en la mano. Es trabajo posterior, y es el que bloquea el camino de
producción.

**B5 · Constantes acopladas.** 12 (CHECK de B1), 2/7/2 (CHECK de M.04), 13 (filas
del ledger), 18 (escenarios), 5 (objetos), 1 (concesión al cliente) y las dos
firmas de función están escritas a mano. Es intencionado —fallan ruidosamente—
pero exigen mantenimiento si B1 o M.04 cambian.

**B6 · Concurrencia del `for update` sin cubrir** (§6, prueba manual de dos
sesiones).

**B7 · CERRADO.** `psql`/`pg_dump` 17.11 verificados en uso. La evidencia se
escribió en `/tmp/m04_evidence` en vez de `evidence/m04/` para no dejar volcados
sin seguimiento en el árbol de git; las huellas quedan en este documento.

**B8 · CERRADO.** `gen_random_uuid()` sin extensión funciona; verificado en 17.11.

**B9 · Las huellas son por corrida, no constantes.** Incluyen `created_at` /
`updated_at`, así que dos ejecuciones del ensayo dan `data_fp` distintos
(`af6fbc4f…` la primera, `e518abd5…` la de certificación). Es correcto —lo que
se compara es PRE contra POST **dentro** de una corrida— pero no vale copiar una
huella de un run a otro.
