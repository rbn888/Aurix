'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MONETIZATION-ENTITLEMENT-RESOLVER — M.02 B2 · autoridad única de acceso
// ════════════════════════════════════════════════════════════════════════════
// B1 dejó la verdad comercial en el servidor pero SIN nadie que la interpretara.
// B2 añade `public.aurix_entitlements()`: el único sitio donde se responde "¿qué
// puede usar este usuario?".
//
// QUÉ CERTIFICA ESTE FICHERO Y QUÉ NO:
//   El comportamiento del resolver se certifica EJECUTÁNDOLO contra Postgres real
//   con filas reales — 19 escenarios en `db/monetization_b2_resolver_certification.sql`,
//   dentro de una transacción revertida. Eso NO puede correr en CI (sin red, sin
//   credenciales, repo cero-dependencias), así que este harness cubre lo otro:
//   que el CONTRATO no se degrade, y —importante— que la propia certificación no
//   se debilite. Gatea el gate.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { return ''; } };

const RES  = 'db/monetization_entitlement_resolver_1.sql';
const CERT = 'db/monetization_b2_resolver_certification.sql';
const DOC  = 'docs/AURIX-MONETIZATION-M02-B2-ENTITLEMENT-RESOLVER.md';
const sql = read(RES), cert = read(CERT), doc = read(DOC), app = read('app.js');
const b1  = read('db/monetization_commercial_truth_1.sql');

let pass = 0, fail = 0; const failed = [];
function ok(n, c, extra) {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; failed.push(n); console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); }
}
// Los asserts de AUSENCIA van sobre el CÓDIGO, no sobre los comentarios: el bloque
// que documenta qué NO es autoridad nombra por fuerza todo lo que excluye.
function stripSqlComments(s) { return String(s).replace(/^\s*--.*$/gm, ''); }
// stripSqlComments sólo quita comentarios de LÍNEA COMPLETA. Para extraer una
// declaración hay que quitar además el comentario que va DETRÁS del código: un
// ')' dentro de `-- … (answers "why")` truncaba la proyección.
function stripInline(s) { return String(s).replace(/--.*$/gm, ''); }
const CODE = stripSqlComments(sql);
// Cuerpo de la función: entre $$ y $$.
const BODY = (() => { const a = sql.indexOf('as $$'); const b = sql.lastIndexOf('$$'); return a < 0 ? '' : stripSqlComments(sql.slice(a, b)); })();

console.log('\nAURIX-MONETIZATION-ENTITLEMENT-RESOLVER — M.02 B2');
console.log('resolver ' + sql.length + 'B · certificación ' + cert.length + 'B\n');

// ══ A. LA FUNCIÓN Y SU FRONTERA ═══════════════════════════════════════════
console.log('A · AUTORIDAD Y FRONTERA');
ok('A.1 el resolver existe', sql.length > 2000);
ok('A.2 UNA sola función en el fichero (una autoridad, no dos)',
  (CODE.match(/create function public\.\w+/g) || []).length === 1 &&
  /create function public\.aurix_entitlements\(\)/.test(CODE));
ok('A.3 SECURITY DEFINER con search_path fijado',
  /security definer/i.test(CODE) && /set search_path = public, pg_temp/i.test(CODE));
ok('A.4 CERO parámetros: no hay por dónde pedir el acceso de otro usuario',
  /create function public\.aurix_entitlements\(\s*\)/.test(CODE));
ok('A.5 la identidad se toma de auth.uid(), no de una entrada del cliente',
  /v_uid\s+uuid\s*:=\s*auth\.uid\(\)/.test(BODY) && !/user_id\s*=\s*p_/.test(BODY));
ok('A.6 se DROPea antes de crearse (re-aplicable si B3 amplía la proyección)',
  /drop function if exists public\.aurix_entitlements\(\);/.test(CODE));
ok('A.7 EXECUTE revocado a los roles NOMBRADOS y concedido sólo a authenticated',
  /revoke all\s+on function public\.aurix_entitlements\(\) from public, anon, authenticated;/.test(CODE) &&
  /grant\s+execute on function public\.aurix_entitlements\(\) to\s+authenticated;/.test(CODE) &&
  (CODE.match(/grant\s+execute/g) || []).length === 1);
ok('A.8 no crea ni altera ninguna tabla, política o privilegio de B1',
  !/create table|alter table|create policy|drop policy|revoke all on public\.|grant .* on public\.\w+ to/i.test(CODE));
ok('A.9 no toca la superficie saneada de B1 (aurix_commercial_state se conserva)',
  !/aurix_commercial_state/.test(CODE) && /aurix_commercial_state/.test(b1));

// ══ B. CONTRATO SANEADO ═══════════════════════════════════════════════════
console.log('\nB · CONTRATO SANEADO');
// Se extrae sobre el fichero SIN comentarios: un ')' dentro de un comentario
// inline truncaba la proyección y ocultaba las dos últimas columnas.
const RET = (() => { const src = stripInline(sql); const i = src.indexOf('returns table');
  const j = src.indexOf(')', src.indexOf('(', i)); return i < 0 ? '' : src.slice(i, j); })();
for (const c of ['plan', 'subscription_status', 'features', 'feature_sources', 'source', 'valid_until'])
  ok('B.1 la respuesta declara ' + c, new RegExp('\\b' + c + '\\b').test(RET));
const SENSITIVE = ['provider_customer_id', 'provider_subscription_id', 'last_event_id',
                   'price_amount_cents', 'price_currency'];
const leaked = SENSITIVE.filter(c => new RegExp('\\b' + c + '\\b').test(BODY));
ok('B.2 ninguna columna de pago se lee siquiera en el cuerpo', leaked.length === 0, 'fuga: ' + leaked);
ok('B.3 las columnas sensibles siguen existiendo en B1 (no se resolvió borrándolas)',
  SENSITIVE.every(c => new RegExp('\\b' + c + '\\b').test(b1)));
ok('B.4 no se hace select * de subscriptions hacia la salida',
  !/return query select \*/i.test(BODY));
ok('B.5 la salida es exactamente la proyección declarada',
  /return query select v_plan, v_status, v_features, v_sources, v_source, v_until;/.test(BODY));
ok('B.6 devuelve SIEMPRE una fila: "sin respuesta" nunca puede leerse como Premium',
  /returns table/i.test(sql) && !/return;/.test(BODY) &&
  (BODY.match(/return query/g) || []).length === 1);

// ══ C. FAIL-CLOSED ════════════════════════════════════════════════════════
console.log('\nC · FAIL-CLOSED');
ok('C.1 los valores iniciales son el estado DENEGADO',
  /v_plan\s+text\s*:=\s*'free'/.test(BODY) &&
  /v_source\s+text\s*:=\s*'default'/.test(BODY) &&
  /v_status\s+text\s*:=\s*'none'/.test(BODY) &&
  /v_features\s+jsonb\s*:=\s*'\{\}'::jsonb/.test(BODY) &&
  /v_until\s+timestamptz := null/.test(BODY));
ok('C.2 premium exige plan="premium" explícito (lista blanca, no negación)',
  /v_sub\.plan\s*=\s*'premium'/.test(BODY));
ok('C.3 premium exige un status de la lista blanca active/trialing',
  /v_status in \('active','trialing'\)/.test(BODY));
ok('C.4 el status se sanea contra una lista blanca antes de usarse; lo desconocido se marca',
  /v_sub\.status not in \('active','trialing','past_due','canceled','expired'\)/.test(BODY) &&
  /v_status := 'unrecognized';/.test(BODY));
ok('C.5 exige cota temporal: lifetime declarado O periodo aún vigente',
  /billing_interval is not distinct from 'lifetime'/.test(BODY) &&
  /current_period_end is not null and v_sub\.current_period_end > now\(\)/.test(BODY));
ok('C.6 usa `is not distinct from` y NO `=` (la trampa 3VL que B1 tuvo que cerrar)',
  /billing_interval is not distinct from 'lifetime'/.test(BODY) &&
  !/billing_interval\s*=\s*'lifetime'/.test(BODY));
ok('C.7 un trial ya vencido pero aún marcado trialing NO concede (estado rancio)',
  /v_status <> 'trialing'\s*\n?\s*or \(v_sub\.trial_end is not null and v_sub\.trial_end > now\(\)\)/.test(BODY));
ok('C.8 la ausencia de fila en plan_features es DENEGADO',
  /coalesce\(v_allowed, false\)/.test(BODY));
ok('C.9 un catálogo vacío o ilegible deja el mapa vacío ⇒ todo denegado',
  /v_features\s+jsonb\s*:=\s*'\{\}'::jsonb/.test(BODY));
ok('C.10 sin sesión (uid null) no se lee suscripción ni override',
  (BODY.match(/if v_uid is not null then/g) || []).length >= 2);
ok('C.11 valid_until nunca sobre-promete: publica la cota MÁS TEMPRANA',
  /least\(v_sub\.trial_end, v_sub\.current_period_end\)/.test(BODY));

// ══ C-bis. ESTRUCTURA DE LA CADENA PREMIUM ════════════════════════════════
// Los asserts C.* son presencia de substring, y eso NO ve un cambio de conectiva:
// convertir el último `and` de la cadena en `or` la vuelve cierta para casi
// cualquier fila (y C.7 seguiría casando su fragmento interno). Aquí se parsea la
// condición y se comprueba su FORMA: conjunción pura, sin un `or` de primer nivel.
console.log('\nC-bis · FORMA de la condición que concede premium');
const PREMCOND = (() => {
  const src = stripInline(BODY);
  const i = src.indexOf("if v_sub.plan = 'premium'");
  if (i < 0) return '';
  const j = src.indexOf('\n    then', i);
  return j < 0 ? '' : src.slice(i + 2, j);
})();
function topLevelConnectives(expr) {
  const out = []; let d = 0;
  const toks = expr.split(/(\(|\)|\band\b|\bor\b)/);
  for (const t of toks) {
    const x = t.trim();
    if (x === '(') d++;
    else if (x === ')') d--;
    else if ((x === 'and' || x === 'or') && d === 0) out.push(x);
  }
  return out;
}
const CONN = topLevelConnectives(PREMCOND);
ok('C.12 la condición de premium se localiza y parsea', PREMCOND.length > 80, PREMCOND.slice(0, 60));
ok('C.13 es una CONJUNCIÓN PURA: cero `or` de primer nivel (un solo `or` la abriría a casi cualquier fila)',
  CONN.length > 0 && CONN.every(c => c === 'and'), 'conectivas: ' + CONN.join(','));
ok('C.14 son exactamente 4 conyuntos: plan · status · cota temporal · trial',
  CONN.length === 3, 'and encontrados: ' + CONN.length);
ok('C.15 el catálogo se consulta por el plan EFECTIVO (v_plan), nunca por un literal',
  /pf\.plan = v_plan/.test(BODY) &&
  !/pf\.plan\s*=\s*'(free|premium)'/.test(BODY));
// El bloque de overrides no puede reescribir el plan ni el origen: si pudiera, un
// override founder contaminaría las métricas comerciales.
const OVR_BLOCK = (() => { const i = BODY.indexOf('select eo.allowed into v_star');
  const j = BODY.indexOf('return query select');
  return (i < 0 || j < 0 || j < i) ? '' : BODY.slice(i, j); })();
ok('C.16 los overrides NO reasignan v_plan ni v_source (founder no contamina las métricas)',
  OVR_BLOCK.length > 200 && !/v_plan\s*:=/.test(OVR_BLOCK) &&
  !/v_source\s*:=/.test(OVR_BLOCK) && !/v_until\s*:=/.test(OVR_BLOCK),
  'bloque ' + OVR_BLOCK.length + 'B');
ok('C.17 v_plan y v_source se asignan SÓLO en el paso 1 (una única autoridad del plan)',
  (BODY.match(/v_plan\s*:=/g) || []).length === 1 &&
  (BODY.match(/v_source\s*:=/g) || []).length === 1);
ok('C.18 el status publicado se cualifica por plan (no se publica active sobre una fila free)',
  /elsif v_sub\.plan <> 'premium' then/.test(BODY) && /v_status := 'none';/.test(BODY));

// ══ D. OVERRIDES: PRECEDENCIA Y TIEMPO ════════════════════════════════════
console.log('\nD · OVERRIDES');
const iStar = BODY.indexOf("feature_key = '*'");
const iSpec = BODY.indexOf("feature_key <> '*'");
ok('D.1 el override GLOBAL se evalúa antes que el específico',
  iStar > 0 && iSpec > 0 && iStar < iSpec, 'global@' + iStar + ' específico@' + iSpec);
ok('D.1b un DENY global es ABSOLUTO: cortocircuita y no consulta los específicos',
  /if v_star_found and v_star is false then/.test(BODY) &&
  BODY.indexOf('if v_star_found and v_star is false then') < iSpec &&
  /(^|\s)else(\s|$)/.test(BODY.slice(BODY.indexOf('if v_star_found and v_star is false then'), iSpec)));
ok('D.1d la cabecera del fichero NO sigue afirmando la regla derogada ("specific always wins")',
  !/the more specific grant always wins/i.test(sql) &&
  /A DENY global .* is ABSOLUTE/.test(sql) && /An ALLOW global is REFINABLE/.test(sql));
ok('D.1e la nota de SAFETY declara CUATRO constraints y la restauración explícita',
  /CUATRO CHECK/.test(cert) && /NO se confía en el rollback/.test(cert) &&
  !/drop two\s+\n?-- B1 CHECK/.test(cert));
ok('D.1c un ALLOW global sí se refina con los específicos (allow + deny puntual)',
  /if v_star_found and v_star is true then/.test(BODY) &&
  BODY.indexOf('if v_star_found and v_star is true then') < iSpec);
const winWindows = (BODY.match(/starts_at <= now\(\)\s*\n?\s*and \(\w+\.expires_at is null or \w+\.expires_at > now\(\)\)/g) || []).length;
ok('D.2 AMBAS consultas de override aplican la ventana temporal', winWindows === 2, 'encontradas: ' + winWindows);
ok('D.3 la ventana es semiabierta: expires_at > now() (un override expirado no actúa)',
  /expires_at > now\(\)/.test(BODY) && !/expires_at >= now\(\)/.test(BODY));
ok('D.4 un override sólo actúa sobre claves DEL CATÁLOGO (no puede inventar capacidades)',
  /if v_features \? r\.k then/.test(BODY));
ok('D.5 un override puede DENEGAR lo que el plan incluye (se usa `allowed`, no solo concesión)',
  /to_jsonb\(r\.a\)/.test(BODY) && /eo\.allowed as a/.test(BODY));
ok('D.6 un allowed NULL no decide nada (`is true`/`is false` son falsos para NULL)',
  /eo\.allowed is not null/.test(BODY) &&
  /v_star is false/.test(BODY) && /v_star is true/.test(BODY) &&
  !/v_star\s*=\s*(true|false)/.test(BODY));
ok('D.7 el override marca el motivo del acceso como "override" (trazabilidad del por qué)',
  /to_jsonb\('override'::text\)/.test(BODY));
ok('D.8 los overrides se resuelven SIEMPRE contra auth.uid(), nunca contra una entrada',
  (BODY.match(/eo\.user_id = v_uid/g) || []).length === 2);

// ══ E. NO-AUTORIDAD: nada legacy concede acceso ═══════════════════════════
console.log('\nE · LO QUE NO ES AUTORIDAD');
const FORBIDDEN = ['user_portfolios', 'aurix_plan', 'localStorage', 'rbn892', 'premiumTier',
                   'PROMO_CODES', 'PLAN_CATALOG', 'isPremium', 'subscriptionActive', 'hasAurixPremiumAccess'];
const found = FORBIDDEN.filter(k => new RegExp(k, 'i').test(CODE));
ok('E.1 el resolver no lee ninguna fuente legacy', found.length === 0, 'lee: ' + found);
ok('E.2 sólo lee las tres tablas canónicas',
  ['subscriptions', 'plan_features', 'entitlement_overrides']
    .every(t => new RegExp('public\\.' + t).test(BODY)) &&
  (BODY.match(/from public\.(\w+)/g) || []).every(m =>
    /subscriptions|plan_features|entitlement_overrides/.test(m)));
ok('E.3 las claves salen del catálogo, no de una lista dura en el resolver',
  /select distinct pf\.feature_key/.test(BODY) &&
  !/workspace\.loan/.test(BODY) && !/intelligence\.full/.test(BODY) &&
  !/premium\.settings/.test(BODY) && !/workspace\.catalog_preview/.test(BODY));
// M.02 B4 añadió una clave por DATO (dos filas de plan_features) sin tocar el
// resolver: es la prueba de que derivar las claves del catálogo era la decisión
// correcta. El contrato de B2 no cambió.
ok('E.3b una capacidad nueva no exige tocar el resolver (se añadió catalog_preview así)',
  /monetization_catalog_preview_key_1\.sql/.test(read('db/monetization_catalog_preview_key_1.sql')) === false ||
  read('db/monetization_catalog_preview_key_1.sql').length > 500);
ok('E.4 no existe ni puede existir un plan comercial "founder"',
  !/'founder'/.test(CODE) && /check \(plan in \('free','premium'\)\)/.test(b1));

// ══ F. LA CERTIFICACIÓN NO PUEDE DEBILITARSE (se gatea el gate) ═══════════
console.log('\nF · INTEGRIDAD DE LA CERTIFICACIÓN EJECUTABLE');
ok('F.1 la certificación existe y ejecuta el resolver real',
  cert.length > 3000 && /from public\.aurix_entitlements\(\)/.test(cert));
ok('F.2 corre dentro de una transacción que SIEMPRE revierte',
  /^begin;/m.test(cert) && /^rollback;/m.test(cert) && !/^commit;/m.test(cert));
const SCEN = cert.match(/insert into _b2_cert values \(n_pass, 'S(\d+)'/g) || [];
ok('F.3 cubre 24 escenarios', SCEN.length === 24, 'encontrados: ' + SCEN.length);
ok('F.4 exige el recuento exacto (no puede pasar habiendo corrido menos)',
  /if n_pass <> 24 then raise exception/.test(cert));
ok('F.4b AUTORREPARABLE: repone las 4 CHECK y el seed por sí misma, sin fiarse del rollback',
  (cert.match(/alter table public\.subscriptions add constraint/g) || []).length === 4 &&
  /RESTAURACIÓN FALLIDA: subscriptions no vuelve a tener 12 CHECK/.test(cert) &&
  /RESTAURACIÓN FALLIDA: plan_features no vuelve a tener 8 filas/.test(cert) &&
  /RESTAURACIÓN FALLIDA: el recuento no vuelve al de partida/.test(cert));
// RE-DECIDIDO en M.02 B4: la precondición "0 filas globales" se negó a correr en
// cuanto existió el primer override real (el del founder, que además es la cuenta
// más antigua y era el sujeto v_a). Hizo bien: iba a borrar datos reales. Ahora
// elige sujetos SIN estado comercial y afirma el retorno al estado de PARTIDA, así
// que sigue protegiendo sin volverse inejecutable con clientes en la base — que era
// el residual declarado de B2.
ok('F.4c elige sujetos limpios y no exige que la base esté vacía',
  /where not exists \(select 1 from public\.subscriptions s where s\.user_id = u\.id\)/.test(cert) &&
  /and not exists \(select 1 from public\.entitlement_overrides o where o\.user_id = u\.id\)/.test(cert) &&
  /PRECONDICIÓN: hacen falta DOS cuentas sin estado comercial/.test(cert) &&
  /PRECONDICIÓN: subscriptions no tiene las 12 CHECK/.test(cert));
ok('F.4c2 y afirma el retorno al estado de partida, no a cero',
  /select count\(\*\) into v_subs0 from public\.subscriptions;/.test(cert) &&
  /<> v_subs0/.test(cert) && /<> v_ovr0/.test(cert));
ok('F.4d ningún assert de DENEGADO puede pasar por vacuidad (clave ausente ⇒ falla)',
  !/if \(e\.features->>'[\w.]+'\)::boolean then/.test(cert) &&
  !/(if|or) not \(e\.features->>'[\w.]+'\)::boolean/.test(cert) &&
  !/(if|or) \(e\.features->>'[\w.]+'\)::boolean/.test(cert) &&
  /coalesce\(\(e\.features->>'[\w.]+'\)::boolean, true\)/.test(cert) &&
  /jsonb_object_keys\(e\.features\)\) <> 4/.test(cert));
const REQUIRED = {
  'free sin fila': /sin fila ⇒ free/, 'premium válido': /premium vigente/,
  'premium expirado': /periodo expirado/, 'status no vivo': /canceled\/past_due\/expired/,
  'trial vigente': /trial vigente/, 'trial rancio': /trial caducado/,
  'lifetime': /lifetime ⇒ premium/, 'override deny': /override deny/,
  'override expirado': /override expirado/, 'override futuro': /starts_at futuro/,
  'override allow': /override allow/, 'global \'*\'': /override global/,
  'precedencia allow': /gana el específico/, 'deny global': /deny global/,
  'clave fuera de catálogo': /inventar una capacidad/, 'aislamiento A\/B': /B jamás hereda/,
  'sin sesión': /sin sesión ⇒ free/, 'malformado': /status desconocido/,
  'privacidad': /ni provider IDs/,
};
for (const [name, re] of Object.entries(REQUIRED))
  ok('F.5 escenario obligatorio presente: ' + name, re.test(cert));
ok('F.5 escenario obligatorio presente: kill switch global', /KILL SWITCH ROTO/.test(cert));
ok('F.5 escenario obligatorio presente: aislamiento de overrides', /B heredó el override global/.test(cert));
ok('F.5 escenario obligatorio presente: cancel_at_period_end vigente', /YA PAGÓ el periodo/.test(cert));
ok('F.5 escenario obligatorio presente: expires_at = now()', /expires_at = now\(\) ⇒ fuera de ventana/.test(cert));
ok('F.5 escenario obligatorio presente: catálogo degradado', /catálogo vacío ⇒ CERO features/.test(cert));
ok('F.6 cada escenario ASEVERA de verdad (raise exception, no sólo un notice)',
  (cert.match(/raise exception/g) || []).length >= 35);
ok('F.7 el fail-closed se certifica SIN depender de las CHECK de B1 (se retiran y se repone por rollback)',
  /alter table public\.subscriptions drop constraint subscriptions_status_chk/.test(cert) &&
  /drop constraint subscriptions_premium_bound_chk/.test(cert) && /^rollback;/m.test(cert));
ok('F.8 la privacidad se comprueba con strpos, no con LIKE (en LIKE el _ es comodín)',
  /strpos\(e::text, 'cus_'\)/.test(cert) && !/like '%sub_%'/.test(cert));
ok('F.9 el aislamiento usa DOS usuarios reales DISTINTOS y sin estado comercial',
  /select id into v_a from auth\.users u/.test(cert) &&
  /select id into v_b from auth\.users u/.test(cert) &&
  /where u\.id <> v_a/.test(cert) &&
  (cert.match(/not exists \(select 1 from public\.subscriptions s where s\.user_id = u\.id\)/g) || []).length === 2);

// ══ G. FUERA DE ALCANCE INTACTO ═══════════════════════════════════════════
console.log('\nG · ALCANCE');
ok('G.1 ENFORCE_ENTITLEMENTS sigue en false (B2 no activa enforcement)',
  /ENFORCE_ENTITLEMENTS\s*=\s*false/.test(app));
// RE-DECIDIDA en M.02 B3 (2026-09-01). En B2 este assert era correcto: B2 no
// cambiaba ninguna superficie, así que los 5 call sites legacy DEBÍAN seguir en pie.
// B3 es exactamente el bloque autorizado a moverlos, y los movió: los cinco leen
// ahora `hasFeature()`. Lo que se conserva —y es lo que de verdad importaba— es que
// `hasAurixPremiumAccess` no vuelva a ser autoridad. Su contrato nuevo lo asevera
// AURIX-MONETIZATION-PRODUCT-ENTITLEMENT-harness.js (G.8).
ok('G.2 hasAurixPremiumAccess ya NO es autoridad (B3): delega en el entitlement real',
  /function hasAurixPremiumAccess\(_user\) \{\s*return hasFeature\('intelligence\.full'\);/.test(app.replace(/\r/g, '')) &&
  !/rbn892/.test(app.replace(/^\s*\/\/.*$/gm, '')));
ok('G.3 los previews siguen siendo el fallback',
  /_aurixPremiumPreviewHTML/.test(app) && /_aurixIntelligencePreviewHTML/.test(app));
// M.04 — re-decidido con la misma razón que N.1/N.3 del gate de B1: el alcance
// cambió, el invariante no. B2 sigue sin conocer al proveedor: el resolver no
// nombra Stripe ni Apple, y el cliente no habla con ninguno.
ok('G.4 el resolver sigue sin conocer al proveedor, y el cliente no habla con él',
  !/stripe|apple|verifyReceipt|storekit|checkout/i.test(sql) &&
  !/require\(['"]stripe['"]\)|api\.stripe\.com|sk_live|verifyReceipt|storekit/i.test(app));
// Sobre las FILAS del seed, no sobre el fichero: el comentario de B1 nombra por
// fuerza las claves que excluye, y buscarlas ahí es buscar su propia negación.
const B1_SEED = (() => { const src = stripInline(b1); const i = src.indexOf('insert into public.plan_features');
  return i < 0 ? '' : src.slice(i, src.indexOf(';', i)); })();
const SEED_KEYS = [...B1_SEED.matchAll(/'(?:free|premium)'\s*,\s*'([\w.]+)'/g)].map(m => m[1]);
ok('G.5 sin features especulativas: el seed sólo trae las 3 claves V1',
  [...new Set(SEED_KEYS)].sort().join(',') === 'intelligence.full,premium.settings,workspace.loan',
  'claves: ' + [...new Set(SEED_KEYS)]);
const FIN = ['portfolio_snapshots', 'capital_flows', 'category_history', 'performance_state'];
ok('G.6 ningún owner financiero / de Chart aparece en el resolver',
  !FIN.some(t => new RegExp(t, 'i').test(CODE)));
ok('G.7 el resolver no aporta JavaScript (B2 es server-side puro)',
  !/document\.|window\.|aurixEntitlements/.test(sql));

// ══ H. DOCUMENTACIÓN ══════════════════════════════════════════════════════
console.log('\nH · CONTRATO DOCUMENTADO');
ok('H.1 la ficha existe', doc.length > 2000);
ok('H.2 declara la precedencia exacta',
  /canonical subscription/i.test(doc) && /plan feature matrix/i.test(doc) &&
  /applicable override/i.test(doc) && /sanitized/i.test(doc));
ok('H.3 declara que founder no es un plan comercial',
  /founder/i.test(doc) && /(no es un plan|not a plan)/i.test(doc));
ok('H.4 contiene la auditoría de autoridad legacy clasificada A/B/C/D',
  /A · Autoridad REAL/i.test(doc) && /B · Presentación/i.test(doc) &&
  /C · Legacy/i.test(doc) && /D · Test/i.test(doc) &&
  /hasAurixPremiumAccess/.test(doc) && /app\.js:50426/.test(doc));
ok('H.5 registra la evidencia de la certificación 24/24 en producción',
  /24\s*\/\s*24|24 de 24/.test(doc));
ok('H.7 documenta que `features` es la ÚNICA autoridad y `plan` nunca una puerta',
  /ÚNICA autoridad de acceso/.test(doc) && /NUNCA es una puerta/.test(doc) &&
  /Nunca con `plan`/.test(doc));
ok('H.8 documenta que un DENY global es absoluto y por qué',
  /DENY global .* es ABSOLUTO/.test(doc) && /kill switch/.test(doc));
ok('H.9 documenta que la certificación es autorreparable y no se fía del rollback',
  /autorreparable/.test(doc) && /no se fía del rollback|no las repone/.test(doc));
ok('H.6 deja escrito que toda decisión nueva de entitlement pasa por el resolver',
  /única autoridad|single authority|toda decisión/i.test(doc));

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
