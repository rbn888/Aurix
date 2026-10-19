# AURIX-PREMIUM-ACCESS-V1 · Activación

Accesos Premium gratuitos concedidos desde Founder (`aurix.premium-control.v1`).
Rama de Aurix: `aurix/premium-access-ready` (rebasada sobre `origin/main`).
Rama de Founder: `founder/premium-access-ready` (sobre Partner Engine V2).

Nada de esto toca suscripciones, Stripe, precios ni checkout. La concesión es
una fila no comercial en `entitlement_overrides` que el resolver de siempre
suma al plan pagado, y caduca sola.

## 0 · Antes de empezar

- Pruebas locales en verde:
  - `node docs/AURIX-PREMIUM-ACCESS-V1-harness.js`
  - `PGLITE_MODULE=…/pglite/dist/index.js node scripts/aurix-premium-access-sql.mjs`

## 1 · Credencial propia

Genera un valor aleatorio de al menos 32 caracteres, distinto de cualquier
otro secreto. Si coincide con otro, el control se desactiva solo.

```bash
openssl rand -hex 32
```

- Aurix (Vercel → Production): `AURIX_PREMIUM_CONTROL_TOKEN=<valor>`
- Founder (`.env.local`): `AURIX_PREMIUM_CONTROL_TOKEN=<mismo valor>`

El valor no se pega en ningún chat, ticket ni commit.

## 2 · Base de datos (Supabase, editor SQL)

1. Pega `db/premium_access_grants_1.sql` ENTERO y ejecútalo de una vez.
   Termina sin `PREMIUM-ACCESS SELF-CHECK FAIL`.
2. Verificación (solo lectura):

   ```sql
   select to_regprocedure('public.aurix_premium_access_apply(uuid,timestamptz,uuid,text,integer,boolean,text,text,text)') is not null as apply_ok,
          to_regprocedure('public.aurix_premium_access_lookup(text)') is not null as lookup_ok,
          exists (select 1 from public.plan_features where plan = 'premium' and allowed) as catalog_ok;
   ```

   Las tres deben ser `true`.

## 3 · Despliegue

1. Merge de `aurix/premium-access-ready` y deploy de Aurix. No añade ninguna
   función de Vercel: `/api/control/premium-access` se reescribe a
   `api/read/[surface].mjs`.
2. Comprobación sin credencial (debe dar 401):
   `curl -s -o /dev/null -w "%{http_code}" -X POST https://<aurix>/api/control/premium-access`
3. Merge y arranque de Founder con el token del paso 1. Sin token, la
   pantalla Aurix → Accesos Premium no aparece.

## 4 · Prueba de humo (con una cuenta de prueba propia)

1. Founder → Aurix → Accesos Premium → buscar el correo de la cuenta de prueba.
   Correo verificado; sin acceso gratuito.
2. Conceder 7 días con motivo «prueba de activación». En Aurix, esa cuenta ve
   Premium (Workspace, Intelligence) sin pagar nada.
3. Ampliar 1 día: el vencimiento se mueve exactamente 1 día. Repetir el mismo
   clic no lo amplía otra vez.
4. Revocar: Premium desaparece al instante. Una suscripción pagada, si la hay,
   sigue intacta.
5. Conceder «Sin caducidad»: aparece como permanente, sin fecha de fin. Revocar.
6. El historial muestra todas las operaciones, con el permanente señalado.

## 5 · Rollback

1. Cortar ya las concesiones vigentes (opcional, no afecta a pagos): el bloque
   comentado al principio de `db/premium_access_grants_1_rollback.sql`.
2. Ejecutar `db/premium_access_grants_1_rollback.sql`.
3. Quitar `AURIX_PREMIUM_CONTROL_TOKEN` de los dos entornos.

Sin el paso 1, las concesiones ya hechas siguen vigentes hasta su fecha.

## Sin caducidad

`permanent: true` (solo al conceder o sustituir) escribe `expires_at = NULL`,
la forma nativa de `entitlement_overrides`, que el resolver ya trata como
vigente. Dura hasta una revocación manual. Ampliar un permanente se rechaza
(`permanent_grant`).

## Interacción con afiliación

Un Premium gratuito (vigente, caducado o revocado) NO convierte a nadie en
cliente pagador anterior en el Programa Influencers. Eso lo resuelve
`founder_read_affiliates_2.sql` (rama `aurix/partner-engine-v2`), que publica
`paidBefore` aparte de `premiumBefore`. El programa clásico sigue usando
`premiumBefore`, sin cambios.
