'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MONETIZATION-COMMERCIAL-TRUTH — M.02 B0/B1 · server-authoritative gate
// ════════════════════════════════════════════════════════════════════════════
// Origen: el tier comercial vive hoy en localStorage y en user_portfolios.subscription.
// La segunda PARECE servidor y no lo es: el cliente escribe la fila completa y la RLS
// le concede UPDATE sobre ella. B1 crea la verdad comercial real; este harness es lo
// que impide que vuelva a ser escribible por el cliente.
//
// POR QUÉ NO SE EJECUTA POSTGRES DE VERDAD (declarado, no disimulado):
//   No hay psql, ni Docker, ni un Postgres local, y el repo es cero-dependencias
//   (el gate de CI corre `node` a pelo, sin npm install). La única credencial de
//   Supabase del repo es la publishable/anon, que no tiene privilegio sobre estas
//   tablas. Así que en lugar de hacer grep de cadenas, este harness:
//
//     1. PARSEA la migración a un modelo (tablas, columnas, constraints, políticas,
//        grants/revokes, funciones) con un stripper que respeta strings y $$…$$.
//     2. EJECUTA las CHECK constraints reales sobre filas candidatas con un
//        evaluador de lógica trivaluada (NULL ⇒ la constraint pasa, como Postgres).
//     3. RESUELVE la decisión de autorización como lo hace Postgres: privilegios
//        ANTES de RLS; permissive en OR; restrictive en AND; sin permissive ⇒ deny.
//        El modelo arranca con GRANT ALL a anon/authenticated, que es el default
//        REAL de Supabase para tablas nuevas de public — y la razón de los REVOKE.
//
//   Lo que esto NO puede demostrar: que el planner de la instancia real se comporte
//   igual. Eso queda como verificación del founder (bloque 5 de la migración).
//
// Cubre A–N del SPEC.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { return ''; } };

const MIG  = 'db/monetization_commercial_truth_1.sql';
const B0   = 'db/monetization_b0_legacy_inventory.sql';
const DOC  = 'docs/AURIX-MONETIZATION-M02-B1-COMMERCIAL-TRUTH.md';
const sql  = read(MIG);
const b0   = read(B0);
const doc  = read(DOC);
const app  = read('app.js');

let pass = 0, fail = 0; const failed = [];
function ok(n, c, extra) {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; failed.push(n); console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); }
}

// ── 1. Stripper + splitter que respeta literales y dollar-quoting ───────────
// Un literal SQL escapa la comilla DOBLÁNDOLA ('it''s'). Buscar la siguiente
// comilla con indexOf desincroniza el modelo entero en silencio, así que el
// escaneo es explícito. Devuelve el índice SIGUIENTE al literal.
function endOfLiteral(src, i) {
  let k = i + 1;
  while (k < src.length) {
    if (src[k] === "'") { if (src[k + 1] === "'") { k += 2; continue; } return k + 1; }
    k++;
  }
  return src.length;
}
function stripSql(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '--') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (two === '/*') { const e = src.indexOf('*/', i); i = e < 0 ? src.length : e + 2; continue; }
    if (src[i] === "'") { const j = endOfLiteral(src, i); out += src.slice(i, j); i = j; continue; }
    if (two === '$$') { const e = src.indexOf('$$', i + 2); out += src.slice(i, e + 2); i = e + 2; continue; }
    out += src[i++];
  }
  return out;
}
function splitStatements(src) {
  const st = []; let cur = '', i = 0;
  while (i < src.length) {
    if (src[i] === "'") { const j = endOfLiteral(src, i); cur += src.slice(i, j); i = j; continue; }
    if (src.slice(i, i + 2) === '$$') { const e = src.indexOf('$$', i + 2); cur += src.slice(i, e + 2); i = e + 2; continue; }
    if (src[i] === ';') { if (cur.trim()) st.push(cur.trim()); cur = ''; i++; continue; }
    cur += src[i++];
  }
  if (cur.trim()) st.push(cur.trim());
  return st;
}
const CLEAN = stripSql(sql);
const STMTS = splitStatements(CLEAN);
const norm  = (s) => s.replace(/\s+/g, ' ').trim();

// ── 2. Top-level comma split (para columnas/constraints) ────────────────────
function splitTopLevel(body) {
  const parts = []; let cur = '', d = 0, i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === "'") { const j = endOfLiteral(body, i); cur += body.slice(i, j); i = j; continue; }
    if (c === '(') d++; else if (c === ')') d--;
    if (c === ',' && d === 0) { parts.push(cur.trim()); cur = ''; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}
function parenBody(s, fromIdx) {
  const a = s.indexOf('(', fromIdx); if (a < 0) return '';
  let d = 0;
  for (let i = a; i < s.length; i++) {
    if (s[i] === "'") { i = endOfLiteral(s, i) - 1; continue; }
    if (s[i] === '(') d++;
    else if (s[i] === ')') { d--; if (!d) return s.slice(a + 1, i); }
  }
  return '';
}

// ── 3. Modelo ───────────────────────────────────────────────────────────────
const model = { tables: {}, policies: [], grants: [], funcGrants: [], rls: {}, functions: {},
                indexes: [], triggers: [], inserts: [] };

for (const raw of STMTS) {
  const s = norm(raw), low = s.toLowerCase();

  let m = low.match(/^create table (?:if not exists )?public\.(\w+)/);
  if (m) {
    const name = m[1];
    const body = parenBody(s, 0);
    const t = { name, columns: {}, checks: [], uniques: [], pk: null, raw: s };
    for (const item of splitTopLevel(body)) {
      const il = item.toLowerCase();
      let cm = il.match(/^constraint (\w+) check\b/);
      if (cm) { t.checks.push({ name: cm[1], expr: parenBody(item, il.indexOf('check')) }); continue; }
      cm = il.match(/^constraint (\w+) unique\b/);
      if (cm) { t.uniques.push({ name: cm[1], cols: splitTopLevel(parenBody(item, il.indexOf('unique'))).map(x => x.trim()) }); continue; }
      if (/^(check|unique|primary key|foreign key)\b/.test(il)) {
        if (il.startsWith('primary key')) t.pk = splitTopLevel(parenBody(item, 0)).map(x => x.trim());
        if (il.startsWith('check')) t.checks.push({ name: '(anon)', expr: parenBody(item, 0) });
        continue;
      }
      const cname = item.split(/\s+/)[0];
      const def = item.slice(cname.length).trim();
      t.columns[cname] = { def, defLow: def.toLowerCase() };
      if (/\bprimary key\b/i.test(def)) t.pk = [cname];
      if (/\bcheck\b/i.test(def)) t.checks.push({ name: cname + ':inline', expr: parenBody(def, def.toLowerCase().indexOf('check')) });
    }
    model.tables[name] = t;
    continue;
  }

  m = low.match(/^create policy (\w+) on public\.(\w+)\b/);
  if (m) {
    const permissive = !/\bas restrictive\b/.test(low);
    const cmdM = low.match(/\bfor (all|select|insert|update|delete)\b/);
    const toM  = s.match(/\bto\s+([\w\s,]+?)\s+(using|with check)\b/i);
    const using = /\busing\b/.test(low) ? parenBody(s, low.indexOf(' using')) : null;
    const wc    = /\bwith check\b/.test(low) ? parenBody(s, low.indexOf('with check')) : null;
    model.policies.push({
      name: m[1], table: m[2], permissive,
      cmd: cmdM ? cmdM[1] : 'all',
      roles: toM ? toM[1].split(',').map(x => x.trim().toLowerCase()) : ['public'],
      using, withCheck: wc, raw: s,
    });
    continue;
  }

  m = low.match(/^(grant|revoke) (.+?) on (?:table )?public\.(\w+) (?:to|from) (.+)$/);
  if (m) {
    model.grants.push({
      kind: m[1],
      privs: m[2].split(',').map(x => x.trim().toLowerCase()),
      table: m[3],
      roles: m[4].split(',').map(x => x.trim().toLowerCase()),
    });
    continue;
  }

  m = low.match(/^(grant|revoke) (.+?) on function public\.(\w+)\(\) (?:to|from) (.+)$/);
  if (m) {
    model.funcGrants.push({
      kind: m[1],
      privs: m[2].split(',').map(x => x.trim().toLowerCase()),
      fn: m[3],
      roles: m[4].split(',').map(x => x.trim().toLowerCase()),
    });
    continue;
  }

  m = low.match(/^alter table public\.(\w+) (enable|force) row level security$/);
  if (m) { model.rls[m[1]] = Object.assign(model.rls[m[1]] || {}, { [m[2]]: true }); continue; }

  m = low.match(/^create (?:or replace )?function public\.(\w+)/);
  if (m) { model.functions[m[1]] = s; continue; }

  m = low.match(/^create (unique )?index (?:if not exists )?(\w+) on public\.(\w+)/);
  if (m) { model.indexes.push({ unique: !!m[1], name: m[2], table: m[3], raw: s }); continue; }

  m = low.match(/^create trigger (\w+)/);
  if (m) { model.triggers.push({ name: m[1], raw: s }); continue; }

  m = low.match(/^insert into public\.(\w+)/);
  if (m) { model.inserts.push({ table: m[1], raw: s }); continue; }
}

// ── 4. Evaluador de expresiones SQL con lógica TRIVALUADA ───────────────────
// Postgres acepta una CHECK cuando evalúa TRUE **o NULL**. Reproducirlo importa:
// sin 3VL, `trial_end >= trial_start` con nulls parecería un rechazo y el test
// mentiría en la dirección tranquilizadora.
function makeParser(expr, row) {
  let i = 0; const s = expr;
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const peek = (w) => { ws(); return s.slice(i, i + w.length).toLowerCase() === w.toLowerCase(); };
  const eat = (w) => { ws(); if (!peek(w)) return false; i += w.length; return true; };
  function kw(w) { ws(); const re = new RegExp('^' + w + '\\b', 'i'); const m = s.slice(i).match(re); if (!m) return false; i += m[0].length; return true; }

  function operand() {
    ws();
    if (s[i] === '(') { const b = parenBody(s, i); i += b.length + 2; return { v: makeParser(b, row).parse() }; }
    if (s[i] === "'") { const e = endOfLiteral(s, i); const lit = s.slice(i + 1, e - 1).replace(/''/g, "'"); i = e; return { v: lit }; }
    const m = s.slice(i).match(/^[\w.]+/);
    if (!m) throw new Error('operand? @' + i + ' in ' + s);
    i += m[0].length;
    const t = m[0];
    if (/^-?\d+(\.\d+)?$/.test(t)) return { v: Number(t) };
    if (/^(true|false)$/i.test(t)) return { v: t.toLowerCase() === 'true' };
    if (t.toLowerCase() === 'null') return { v: null };
    if (!(t in row)) throw new Error('columna desconocida: ' + t);
    return { v: row[t] };
  }
  function comparison() {
    const L = operand().v;
    ws();
    if (kw('is')) {
      const neg = kw('not');
      // `is [not] distinct from` es NULL-safe y es justo la primitiva que arregla
      // el fail-open, así que el evaluador TIENE que entenderla: sin esta rama
      // caía en `is not null` y devolvía true, aceptando la fila que la
      // constraint rechaza. Lo detectó Z.3.
      if (kw('distinct')) {
        if (!kw('from')) throw new Error("`is distinct` sin `from`");
        const R = operand().v;
        const lN = L === null || L === undefined, rN = R === null || R === undefined;
        const distinct = (lN !== rN) || (!lN && !rN && L !== R);
        return neg ? !distinct : distinct;
      }
      if (!kw('null')) throw new Error('forma `is …` no soportada');
      const isNull = L === null || L === undefined;
      return neg ? !isNull : isNull;
    }
    // `not in` ANTES que `in`: sin esta rama la expresión caía al final de la
    // función y devolvía !!'active' = true, que es como un OR de fail-closed se
    // convierte en silencio en un OR siempre verdadero.
    let negIn = false;
    const save = i;
    if (kw('not')) { if (kw('in')) negIn = true; else { i = save; } }
    if (negIn || kw('in')) {
      const body = parenBody(s, i);
      i = s.indexOf('(', i) + body.length + 2;
      if (L === null || L === undefined) return null;
      const vals = body.split(',').map(x => x.trim().replace(/^'|'$/g, ''));
      const inside = vals.includes(String(L));
      return negIn ? !inside : inside;
    }
    if (eat('~')) {
      const R = operand().v;
      if (L === null || L === undefined || R === null) return null;
      return new RegExp(R).test(String(L));
    }
    for (const op of ['>=', '<=', '<>', '!=', '=', '>', '<']) {
      if (eat(op)) {
        const R = operand().v;
        if (L === null || L === undefined || R === null || R === undefined) return null;
        switch (op) {
          case '>=': return L >= R; case '<=': return L <= R;
          case '>':  return L >  R; case '<':  return L <  R;
          case '=':  return L === R;
          default:   return L !== R;
        }
      }
    }
    // Sólo un operando genuinamente booleano puede valer por sí mismo. Cualquier
    // otra cosa aquí significa sintaxis que el evaluador NO entiende, y eso tiene
    // que ser un error ROJO (Y.1), nunca un `true` cómodo.
    ws();
    const rest = s.slice(i).trim();
    const atEnd = rest === '' || /^(and|or|\))/i.test(rest);
    if (!atEnd) throw new Error('sintaxis no soportada: …' + rest.slice(0, 40));
    if (L === null || L === undefined) return null;
    if (typeof L !== 'boolean') throw new Error('operando no booleano suelto: ' + JSON.stringify(L));
    return L;
  }
  function notExpr() { if (kw('not')) { const v = notExpr(); return v === null ? null : !v; } return comparison(); }
  function andExpr() {
    let v = notExpr();
    while (kw('and')) { const r = notExpr(); v = (v === false || r === false) ? false : (v === null || r === null ? null : (v && r)); }
    return v;
  }
  function orExpr() {
    let v = andExpr();
    while (kw('or')) { const r = andExpr(); v = (v === true || r === true) ? true : (v === null || r === null ? null : (v || r)); }
    return v;
  }
  return { parse: () => { const v = orExpr(); ws(); return v; } };
}
// Un CHECK que el evaluador no entiende NO es un rechazo. Contarlo como tal hacía
// que un assert de RECHAZO pasara por la razón equivocada: si mañana se añade una
// CHECK con una llamada a función, `plan='founder' RECHAZADO` seguiría verde
// aunque el enum se hubiese ampliado para aceptarlo. Los errores de evaluación se
// acumulan aparte y fallan el gate por sí mismos.
const EVAL_ERRORS = [];
function checkAccepts(table, row) {
  const t = model.tables[table];
  const rejected = [], abstained = [];
  for (const c of t.checks) {
    let v;
    try { v = makeParser(c.expr, row).parse(); }
    catch (e) { EVAL_ERRORS.push(table + '.' + c.name + ': ' + e.message); continue; }
    if (v === false) rejected.push(c.name);
    else if (v === null) abstained.push(c.name);
  }
  return { accepted: rejected.length === 0, rejected, abstained };
}

// ── 5. Resolutor de autorización, orden real de Postgres ────────────────────
const SUPABASE_DEFAULT_PRIVS = ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'];
function privsFor(table, role) {
  // Supabase concede ALL por defecto a anon/authenticated en tablas nuevas de public.
  let set = new Set(SUPABASE_DEFAULT_PRIVS);
  for (const g of model.grants) {
    if (g.table !== table) continue;
    if (!g.roles.includes(role)) continue;
    const privs = g.privs.includes('all') ? SUPABASE_DEFAULT_PRIVS : g.privs;
    for (const p of privs) { if (g.kind === 'grant') set.add(p); else set.delete(p); }
  }
  return set;
}
function alwaysFalse(expr) { return expr !== null && /^\s*false\s*$/i.test(expr); }
function applies(p, table, role, cmd) {
  return p.table === table && (p.cmd === 'all' || p.cmd === cmd) &&
         (p.roles.includes(role) || p.roles.includes('public'));
}
function decide(table, role, cmd) {
  if (!privsFor(table, role).has(cmd)) return { allowed: false, why: 'privilege:' + cmd + ' not granted' };
  if (!model.rls[table] || !model.rls[table].enable) return { allowed: true, why: 'RLS not enabled' };
  const perm = model.policies.filter(p => p.permissive && applies(p, table, role, cmd));
  if (!perm.length) return { allowed: false, why: 'no permissive policy for ' + cmd };
  const anyOpen = perm.some(p => {
    const e = cmd === 'insert' ? p.withCheck : (p.using !== null ? p.using : p.withCheck);
    return !alwaysFalse(e);
  });
  if (!anyOpen) return { allowed: false, why: 'every permissive policy is FALSE' };
  const restr = model.policies.filter(p => !p.permissive && applies(p, table, role, cmd));
  for (const p of restr) {
    const e = cmd === 'insert' ? p.withCheck : (p.using !== null ? p.using : p.withCheck);
    if (alwaysFalse(e)) return { allowed: false, why: 'restrictive policy ' + p.name + ' denies' };
  }
  return { allowed: true, why: 'permitted' };
}

console.log('\nAURIX-MONETIZATION-COMMERCIAL-TRUTH — M.02 B0/B1');
console.log('Modelo: ' + Object.keys(model.tables).length + ' tablas · ' + model.policies.length +
            ' políticas · ' + model.grants.length + ' grant/revoke · ' + STMTS.length + ' sentencias\n');

// ══ A. SCHEMA EXISTE ═══════════════════════════════════════════════════════
console.log('A · SCHEMA');
const T = model.tables;
ok('A.1 la migración existe y parsea', sql.length > 2000 && STMTS.length > 10);
for (const t of ['subscriptions', 'entitlement_overrides', 'plan_features']) {
  ok('A.2 public.' + t + ' se crea', !!T[t]);
}
const SUB_COLS = ['user_id','plan','status','provider','billing_interval','trial_start','trial_end',
  'current_period_start','current_period_end','cancel_at_period_end','canceled_at','price_amount_cents',
  'price_currency','provider_customer_id','provider_subscription_id','last_event_id','last_event_at',
  'created_at','updated_at'];
const missSub = SUB_COLS.filter(c => !T.subscriptions || !(c in T.subscriptions.columns));
ok('A.3 subscriptions tiene las 19 columnas del contrato', missSub.length === 0, 'faltan: ' + missSub);
ok('A.4 subscriptions: UNA fila comercial efectiva por usuario (PK = user_id)',
  !!T.subscriptions && String(T.subscriptions.pk) === 'user_id');
ok('A.5 subscriptions.user_id referencia auth.users con on delete cascade',
  !!T.subscriptions && /references auth\.users \(id\) on delete cascade/i.test(T.subscriptions.columns.user_id.def));
const OV_COLS = ['id','user_id','feature_key','allowed','reason','starts_at','expires_at','created_at','updated_at'];
const missOv = OV_COLS.filter(c => !T.entitlement_overrides || !(c in T.entitlement_overrides.columns));
ok('A.6 entitlement_overrides tiene los campos mínimos', missOv.length === 0, 'faltan: ' + missOv);
ok('A.7 entitlement_overrides NO guarda información de pago',
  !!T.entitlement_overrides && !Object.keys(T.entitlement_overrides.columns)
    .some(c => /price|amount|currency|provider|invoice|receipt/i.test(c)));
ok('A.8 plan_features: PK compuesta (plan, feature_key)',
  !!T.plan_features && String(T.plan_features.pk) === 'plan,feature_key');
ok('A.9 no se reutiliza user_portfolios: la migración no lo altera',
  !/alter\s+table\s+public\.user_portfolios/i.test(CLEAN) && !/user_portfolios/i.test(
    STMTS.filter(s => /^(alter|drop|update|delete|insert)/i.test(s)).join(' ')));
ok('A.10 idempotente: todo CREATE TABLE/INDEX usa IF NOT EXISTS y toda política se DROPea antes',
  (CLEAN.match(/create table/gi) || []).length === (CLEAN.match(/create table if not exists/gi) || []).length &&
  (CLEAN.match(/create (unique )?index/gi) || []).length === (CLEAN.match(/create (unique )?index if not exists/gi) || []).length &&
  model.policies.every(p => new RegExp('drop policy if exists ' + p.name, 'i').test(CLEAN)));

// ══ B. CONSTRAINTS — ejecutadas contra filas reales ════════════════════════
console.log('\nB · CONSTRAINTS (ejecutadas, 3VL como Postgres)');
const PF_BASE = { plan: 'free', feature_key: 'workspace.loan', allowed: false, created_at: 1, updated_at: 1 };
const SUB_BASE = {
  user_id: 'u1', plan: 'free', status: 'active', provider: 'none', billing_interval: null,
  trial_start: null, trial_end: null, current_period_start: null, current_period_end: null,
  cancel_at_period_end: false, canceled_at: null, price_amount_cents: null, price_currency: null,
  provider_customer_id: null, provider_subscription_id: null, last_event_id: null, last_event_at: null,
  created_at: 1000, updated_at: 1000,
};
const subRow = (o) => Object.assign({}, SUB_BASE, o);
function accepts(table, row, expected, label) {
  const r = checkAccepts(table, row);
  ok(label, r.accepted === expected, r.accepted ? 'ACEPTADA' : 'rechazada por ' + r.rejected.join(', '));
}
ok('B.0 las CHECK de subscriptions se parsearon (>=8)', T.subscriptions && T.subscriptions.checks.length >= 8,
  'checks: ' + (T.subscriptions ? T.subscriptions.checks.length : 0));
accepts('subscriptions', subRow({}), true, 'B.1 fila mínima free/active/none ACEPTADA');
accepts('subscriptions', subRow({ plan: 'premium', status: 'trialing', provider: 'stripe',
  billing_interval: 'month', trial_start: 1, trial_end: 2, current_period_start: 1,
  current_period_end: 3, price_amount_cents: 1499, price_currency: 'EUR' }), true,
  'B.2 fila premium/stripe completa y coherente ACEPTADA');
accepts('subscriptions', subRow({ plan: 'founder' }), false,
  'B.3 plan=founder RECHAZADO — founder no es un plan comercial');
accepts('subscriptions', subRow({ plan: 'pro' }), false, 'B.4 plan fuera del enum RECHAZADO');
accepts('subscriptions', subRow({ status: 'lapsed' }), false, 'B.5 status fuera del enum RECHAZADO');
accepts('subscriptions', subRow({ provider: 'paypal' }), false, 'B.6 provider fuera del enum RECHAZADO');
accepts('subscriptions', subRow({ billing_interval: 'weekly' }), false, 'B.7 interval fuera del enum RECHAZADO');
accepts('subscriptions', subRow({ billing_interval: 'lifetime' }), true, 'B.8 interval=lifetime ACEPTADO');
accepts('subscriptions', subRow({ trial_start: 500, trial_end: 100 }), false,
  'B.9 trial que termina antes de empezar RECHAZADO');
accepts('subscriptions', subRow({ current_period_start: 500, current_period_end: 100 }), false,
  'B.10 periodo que termina antes de empezar RECHAZADO');
accepts('subscriptions', subRow({ price_amount_cents: -1, price_currency: 'EUR' }), false,
  'B.11 importe negativo RECHAZADO');
accepts('subscriptions', subRow({ price_amount_cents: 1499 }), false,
  'B.12 importe sin divisa RECHAZADO (par incompleto)');
accepts('subscriptions', subRow({ price_currency: 'EUR' }), false,
  'B.13 divisa sin importe RECHAZADA (par incompleto)');
accepts('subscriptions', subRow({ price_amount_cents: 1499, price_currency: 'eur' }), false,
  'B.14 divisa no ISO-4217 mayúscula RECHAZADA');
accepts('subscriptions', subRow({ price_amount_cents: 1499, price_currency: 'EURO' }), false,
  'B.15 divisa de 4 letras RECHAZADA');
accepts('subscriptions', subRow({ price_amount_cents: 0, price_currency: 'USD' }), true,
  'B.16 importe 0 (comp/trial contabilizado) ACEPTADO');

// ── FAIL-CLOSED contra escrituras PARCIALES (hallazgo alto de la revisión) ──
// Una fila premium sin cota es byte-idéntica a una compra lifetime legítima, y
// cualquier resolver natural la lee como Premium para siempre.
const PREM_LIVE = { plan: 'premium', status: 'active', provider: 'stripe',
  billing_interval: 'month', current_period_start: 1, current_period_end: 3,
  price_amount_cents: 1499, price_currency: 'EUR' };
accepts('subscriptions', subRow(PREM_LIVE), true, 'B.32 premium mensual completo ACEPTADO');
accepts('subscriptions', subRow(Object.assign({}, PREM_LIVE, { current_period_end: null })), false,
  'B.33 premium ACTIVO sin current_period_end RECHAZADO — era el fail-open');
accepts('subscriptions', subRow(Object.assign({}, PREM_LIVE, {
  status: 'trialing', trial_start: 1, trial_end: 2, current_period_end: null })), false,
  'B.34 premium TRIALING sin cota de periodo RECHAZADO');
accepts('subscriptions', subRow(Object.assign({}, PREM_LIVE, {
  billing_interval: 'lifetime', current_period_start: null, current_period_end: null,
  price_amount_cents: 9900 })), true,
  'B.35 lifetime sin periodo ACEPTADO — pero hay que DECIRLO explícitamente');
accepts('subscriptions', subRow(Object.assign({}, PREM_LIVE, {
  status: 'trialing', trial_start: 1, trial_end: null })), false,
  'B.36 trialing sin trial_end RECHAZADO (mismo fail-open en la ruta de prueba)');
accepts('subscriptions', subRow(Object.assign({}, PREM_LIVE, {
  price_amount_cents: null, price_currency: null })), false,
  'B.37 premium VIVO sin importe canónico RECHAZADO — es lo que hace decidible "paga"');
accepts('subscriptions', subRow(Object.assign({}, PREM_LIVE, {
  status: 'canceled', current_period_end: null, price_amount_cents: null, price_currency: null })), true,
  'B.38 premium CANCELADO sin cota ni importe ACEPTADO (no se sobre-restringe el fin de vida)');
accepts('subscriptions', subRow(Object.assign({}, PREM_LIVE, {
  provider: 'manual', price_amount_cents: 0 })), true,
  'B.39 comp manual ACEPTADO con importe 0 explícito ⇒ nunca cuenta como MRR');
ok('B.40 "paga" es decidible sobre la tabla: premium vivo ⇒ price_amount_cents no nulo',
  T.subscriptions.checks.some(c => /subscriptions_premium_price_chk/.test(c.name)));
accepts('plan_features', Object.assign({}, PF_BASE, { plan: 'free', allowed: true }), false,
  'B.41 (free, <clave premium>, TRUE) RECHAZADA — una fila no puede abrir Premium a todo Free');
accepts('plan_features', Object.assign({}, PF_BASE, {
  plan: 'free', feature_key: 'workspace.templates', allowed: true }), false,
  'B.42 tampoco con una clave FUTURA, que el seed nunca corregiría');
accepts('plan_features', Object.assign({}, PF_BASE, { plan: 'premium', allowed: true }), true,
  'B.43 (premium, workspace.loan, true) sigue ACEPTADA');

const OV_BASE = { id: 1, user_id: 'u1', feature_key: '*', allowed: true, reason: 'founder',
  granted_by: null, starts_at: 100, expires_at: null, created_at: 1, updated_at: 1 };
const ovRow = (o) => Object.assign({}, OV_BASE, o);
accepts('entitlement_overrides', ovRow({}), true, 'B.17 override global (*) founder ACEPTADO');
accepts('entitlement_overrides', ovRow({ feature_key: 'workspace.loan', reason: 'qa' }), true,
  'B.18 override de feature concreta ACEPTADO');
accepts('entitlement_overrides', ovRow({ feature_key: 'Workspace.Loan' }), false,
  'B.19 feature_key con mayúsculas RECHAZADA');
accepts('entitlement_overrides', ovRow({ feature_key: 'workspace' }), false,
  'B.20 feature_key sin namespace RECHAZADA');
accepts('entitlement_overrides', ovRow({ feature_key: '' }), false, 'B.21 feature_key vacía RECHAZADA');
accepts('entitlement_overrides', ovRow({ reason: 'because' }), false,
  'B.22 reason fuera de founder|comp|qa|support RECHAZADO');
accepts('entitlement_overrides', ovRow({ starts_at: 500, expires_at: 100 }), false,
  'B.23 ventana invertida RECHAZADA');
accepts('entitlement_overrides', ovRow({ allowed: false, reason: 'support' }), true,
  'B.24 override de DENEGACIÓN explícita ACEPTADO (revocar sin borrar la traza)');
ok('B.25 un usuario no puede tener dos overrides de la misma feature',
  !!T.entitlement_overrides && T.entitlement_overrides.uniques
    .some(u => String(u.cols) === 'user_id,feature_key'));

accepts('plan_features', Object.assign({}, PF_BASE), true, 'B.26 (free, workspace.loan) ACEPTADA');
accepts('plan_features', Object.assign({}, PF_BASE, { plan: 'founder' }), false,
  'B.27 plan=founder en plan_features RECHAZADO');
accepts('plan_features', Object.assign({}, PF_BASE, { feature_key: 'WORKSPACE.LOAN' }), false,
  'B.28 feature_key mal formada RECHAZADA');

ok('B.29 idempotencia de webhook: unique parcial (provider, last_event_id)',
  model.indexes.some(i => i.unique && i.table === 'subscriptions' &&
    /provider, ?last_event_id/i.test(i.raw) && /where last_event_id is not null/i.test(i.raw)));
ok('B.30 una suscripción de proveedor pertenece a UNA fila: unique (provider, provider_subscription_id)',
  model.indexes.some(i => i.unique && i.table === 'subscriptions' &&
    /provider, ?provider_subscription_id/i.test(i.raw)));
ok('B.31 updated_at lo mantiene la base de datos, no el escritor',
  !!model.functions.aurix_touch_updated_at &&
  ['subscriptions', 'entitlement_overrides', 'plan_features']
    .every(t => model.triggers.some(g => new RegExp('on public\\.' + t + '\\b', 'i').test(g.raw))));

// ══ C. RLS ACTIVADA ════════════════════════════════════════════════════════
console.log('\nC · RLS');
for (const t of ['subscriptions', 'entitlement_overrides', 'plan_features']) {
  ok('C.1 RLS habilitada en ' + t, !!(model.rls[t] && model.rls[t].enable));
}
ok('C.2 FORCE RLS deliberadamente ausente (el OWNER debe poder sembrar/administrar)',
  !['subscriptions', 'entitlement_overrides', 'plan_features'].some(t => model.rls[t] && model.rls[t].force) &&
  /force row level security` is deliberately NOT used|FORCE only affects/i.test(sql));
ok('C.3 la deny de subscriptions es RESTRICTIVE (sobrevive a una política permisiva futura)',
  model.policies.some(p => p.table === 'subscriptions' && !p.permissive && p.cmd === 'all' &&
    alwaysFalse(p.using) && alwaysFalse(p.withCheck) &&
    p.roles.includes('anon') && p.roles.includes('authenticated')));
ok('C.4 la deny de entitlement_overrides es RESTRICTIVE',
  model.policies.some(p => p.table === 'entitlement_overrides' && !p.permissive && p.cmd === 'all' &&
    alwaysFalse(p.using) && alwaysFalse(p.withCheck)));
ok('C.5 CERO políticas permisivas de escritura para anon/authenticated en las tres tablas',
  !model.policies.some(p => p.permissive && ['insert','update','delete','all'].includes(p.cmd) &&
    (p.roles.includes('anon') || p.roles.includes('authenticated') || p.roles.includes('public'))));
ok('C.6 los privilegios por defecto de Supabase se revocan explícitamente',
  ['subscriptions','entitlement_overrides','plan_features'].every(t =>
    model.grants.some(g => g.kind === 'revoke' && g.table === t && g.privs.includes('all') &&
      g.roles.includes('anon') && g.roles.includes('authenticated'))));

// ══ D–H. DECISIONES DE AUTORIZACIÓN ═══════════════════════════════════════
console.log('\nD–H · AUTORIZACIÓN (privilegios antes de RLS · permissive OR · restrictive AND)');
function denied(table, role, cmd, label) {
  const d = decide(table, role, cmd);
  ok(label, d.allowed === false, d.allowed ? 'PERMITIDO (' + d.why + ')' : d.why);
}
function allowed(table, role, cmd, label) {
  const d = decide(table, role, cmd);
  ok(label, d.allowed === true, d.why);
}
// D — no puede autocrearse Premium
denied('subscriptions', 'authenticated', 'insert', 'D.1 authenticated NO puede INSERT en subscriptions');
// E — no puede autoactualizarse
denied('subscriptions', 'authenticated', 'update', 'E.1 authenticated NO puede UPDATE en subscriptions');
denied('subscriptions', 'authenticated', 'delete', 'E.2 authenticated NO puede DELETE en subscriptions');
denied('subscriptions', 'authenticated', 'select', 'E.3 authenticated NO lee la tabla cruda (lee la superficie saneada)');
denied('subscriptions', 'anon', 'select', 'E.4 anon no tiene ningún acceso a subscriptions');
denied('subscriptions', 'anon', 'insert', 'E.5 anon no puede INSERT en subscriptions');
// F — overrides
denied('entitlement_overrides', 'authenticated', 'insert', 'F.1 authenticated NO puede crear un override');
denied('entitlement_overrides', 'authenticated', 'update', 'F.2 authenticated NO puede modificar un override');
denied('entitlement_overrides', 'authenticated', 'delete', 'F.3 authenticated NO puede borrar un override');
denied('entitlement_overrides', 'authenticated', 'select', 'F.4 authenticated NO enumera sus propios overrides');
denied('entitlement_overrides', 'anon', 'select', 'F.5 anon no tiene acceso a overrides');
// G — plan_features
denied('plan_features', 'authenticated', 'insert', 'G.1 authenticated NO puede INSERT en plan_features');
denied('plan_features', 'authenticated', 'update', 'G.2 authenticated NO puede UPDATE en plan_features');
denied('plan_features', 'authenticated', 'delete', 'G.3 authenticated NO puede DELETE en plan_features');
allowed('plan_features', 'authenticated', 'select', 'G.4 authenticated SÍ puede leer el catálogo de capacidades');
denied('plan_features', 'anon', 'select', 'G.5 anon no lee el catálogo (no hay superficie pre-auth)');
ok('G.6 el único grant del fichero es SELECT sobre plan_features a authenticated',
  model.grants.filter(g => g.kind === 'grant').every(g => g.table === 'plan_features' &&
    g.privs.length === 1 && g.privs[0] === 'select' && String(g.roles) === 'authenticated'));

// H — aislamiento entre usuarios
console.log('\nH · AISLAMIENTO A/B');
const CS = model.functions.aurix_commercial_state || '';
ok('H.1 la superficie saneada existe y es SECURITY DEFINER',
  /security definer/i.test(CS) && /returns table/i.test(CS));
ok('H.2 filtra SIEMPRE por auth.uid() — no acepta un user_id de entrada',
  /where s\.user_id = auth\.uid\(\)/i.test(CS) &&
  /create function public\.aurix_commercial_state\(\)/i.test(CS));
ok('H.2b se DROPea antes de crearse: re-aplicar tras ampliar la proyección no rompe',
  /drop function if exists public\.aurix_commercial_state\(\);/i.test(CLEAN));
ok('H.3 no hay ningún parámetro por el que pedir la fila de otro usuario',
  /aurix_commercial_state\(\s*\)/.test(CS));
ok('H.4 search_path fijado (una función SECURITY DEFINER sin él es escalable)',
  /set search_path = public, pg_temp/i.test(CS));
ok('H.5 execute concedido sólo a authenticated, revocado a public',
  /revoke all\s+on function public\.aurix_commercial_state\(\) from\s+public/i.test(CLEAN) &&
  /grant\s+execute on function public\.aurix_commercial_state\(\) to\s+authenticated/i.test(CLEAN));
ok('H.6 limit 1: una fila efectiva, nunca la de otro usuario por accidente', /limit 1/i.test(CS));
ok('H.7 A no puede leer la fila de B ni por la tabla ni por la función',
  decide('subscriptions', 'authenticated', 'select').allowed === false &&
  /auth\.uid\(\)/.test(CS));

// ══ PRIVACIDAD ════════════════════════════════════════════════════════════
console.log('\nPRIVACIDAD · identificadores de proveedor');
const SENSITIVE = ['provider_customer_id', 'provider_subscription_id', 'last_event_id',
                   'price_amount_cents', 'price_currency'];
const leaked = SENSITIVE.filter(c => new RegExp('\\b' + c + '\\b').test(CS));
ok('P.1 ninguna columna sensible aparece en la superficie de lectura', leaked.length === 0, 'fuga: ' + leaked);
ok('P.2 las columnas sensibles existen (no se resolvió el problema borrándolas)',
  SENSITIVE.every(c => c in T.subscriptions.columns));
ok('P.3 la proyección saneada es exactamente el conjunto no sensible acordado',
  ['plan','status','provider','billing_interval','trial_end','current_period_end',
   'cancel_at_period_end','updated_at'].every(c => new RegExp('s\\.' + c + '\\b').test(CS)));
ok('P.4 el cliente no tiene NINGUNA ruta de lectura a la tabla cruda',
  decide('subscriptions', 'authenticated', 'select').allowed === false &&
  decide('subscriptions', 'anon', 'select').allowed === false);
ok('P.5 la función NO resuelve entitlements (no mezcla overrides ni plan_features: eso es B2)',
  !/entitlement_overrides|plan_features/i.test(CS));

// ══ I. SEEDS ══════════════════════════════════════════════════════════════
console.log('\nI · SEEDS');
const seed = model.inserts.find(x => x.table === 'plan_features');
ok('I.1 hay exactamente un INSERT en la migración, y es el seed de plan_features',
  model.inserts.length === 1 && !!seed);
const seedRows = seed ? [...seed.raw.matchAll(/\(\s*'(\w+)'\s*,\s*'([\w.]+)'\s*,\s*(true|false)\s*\)/gi)]
  .map(m => ({ plan: m[1], key: m[2], allowed: m[3].toLowerCase() === 'true' })) : [];
ok('I.2 el seed son 6 filas (3 free + 3 premium)', seedRows.length === 6, 'filas: ' + seedRows.length);
const V1_KEYS = ['workspace.loan', 'intelligence.full', 'premium.settings'];
ok('I.3 las feature keys V1 son exactamente las tres aprobadas',
  JSON.stringify([...new Set(seedRows.map(r => r.key))].sort()) === JSON.stringify([...V1_KEYS].sort()),
  'keys: ' + [...new Set(seedRows.map(r => r.key))]);
ok('I.4 free NO recibe ninguna capacidad premium',
  seedRows.filter(r => r.plan === 'free').length === 3 &&
  seedRows.filter(r => r.plan === 'free').every(r => r.allowed === false));
ok('I.5 premium recibe las tres',
  seedRows.filter(r => r.plan === 'premium').length === 3 &&
  seedRows.filter(r => r.plan === 'premium').every(r => r.allowed === true));
ok('I.6 NO se crean todavía las keys diferidas',
  !seedRows.some(r => /workspace\.access|workspace\.compound|workspace\.templates|intelligence\.preview/.test(r.key)));
ok('I.7 el seed es re-ejecutable sin duplicar (on conflict do update)',
  !!seed && /on conflict \(plan, feature_key\) do update/i.test(seed.raw));
ok('I.8 subscriptions y entitlement_overrides nacen VACÍAS',
  !model.inserts.some(x => x.table === 'subscriptions' || x.table === 'entitlement_overrides'));

// ══ J. LEGACY NO ALIMENTA LA NUEVA VERDAD ═════════════════════════════════
console.log('\nJ · LEGACY ≠ COMMERCIAL TRUTH');
// Case-SENSITIVE para los identificadores del bundle: `PLAN_FEATURES` es legacy de
// cliente y `plan_features` es la tabla nueva; distinguirlos es el punto del assert.
ok('J.1 la migración no lee ni escribe ninguna fuente legacy',
  !/user_portfolios|aurix_plan|subscription_updated_at/i.test(CLEAN) &&
  !/PLAN_FEATURES|PREMIUM_FEATURES|PLAN_CATALOG|PROMO_CODES|premiumTier|hasAurixPremiumAccess/.test(CLEAN));
ok('J.2 cero backfill: no hay INSERT … SELECT en la migración',
  !/insert\s+into[\s\S]{0,200}?\bselect\b/i.test(CLEAN));
ok('J.3 la migración es no destructiva: ni DROP TABLE, ni DROP COLUMN, ni DELETE, ni TRUNCATE',
  !/drop\s+(table|column|schema)\b/i.test(CLEAN) && !/\btruncate\b/i.test(CLEAN) &&
  !STMTS.some(s => /^delete\s+from/i.test(s)) && !STMTS.some(s => /^update\s+public\./i.test(s)));
ok('J.4 la columna legacy user_portfolios.subscription sigue existiendo intacta',
  /add column if not exists\s+subscription\s/i.test(read('db/persistence_remote_subscription_1.sql')));
ok('J.5 los owners legacy del cliente siguen presentes (B1 no retira nada)',
  /const PLAN_KEY/.test(app) && /function hasAurixPremiumAccess/.test(app) &&
  /PLAN_FEATURES =/.test(app) && /PROMO_CODES =/.test(app) && /_collectSubscription/.test(app));
ok('J.6 el inventario B0 es READ-ONLY (cero sentencias mutantes)',
  b0.length > 500 && !/^\s*(insert|update|delete|alter|drop|grant|revoke|truncate)\b/im.test(b0));
ok('J.7 B0 declara explícitamente que sus valores NO se migran',
  /MUST NOT be converted into rows of\s*\n?--\s*public\.subscriptions|no backfill/i.test(b0) &&
  /FORBIDDEN/i.test(b0));
ok('J.8 ninguna clave de servicio entró en el repo',
  !/SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"][A-Za-z0-9._-]{20,}/.test(sql + b0 + doc));

// ══ K. OWNERS FINANCIEROS / CHART INTACTOS ════════════════════════════════
console.log('\nK · CHART / FINANCIAL');
const FIN = ['portfolio_snapshots','capital_flows','category_history','performance_state',
             'portfolio_snapshot_health','portfolio_history'];
const touched = FIN.filter(t => STMTS.some(s => new RegExp('(alter|drop|insert into|update|delete from)[\\s\\S]{0,80}' + t, 'i').test(s)));
ok('K.1 la migración no toca ningún owner financiero', touched.length === 0, 'tocados: ' + touched);
ok('K.2 las tres tablas nuevas no comparten nombre con ningún owner financiero',
  !Object.keys(T).some(t => FIN.includes(t)));
ok('K.3 la función helper no colisiona con las del motor financiero',
  !/aurix_minute_bucket/i.test(CLEAN) || !/create or replace function public\.aurix_minute_bucket/i.test(CLEAN));

// ══ L–N. UX / ENFORCEMENT / PROVEEDORES ═══════════════════════════════════
console.log('\nL–N · UX · ENFORCEMENT · PROVEEDORES');
ok('L.1 B1 no aporta JavaScript: ningún fichero de cliente participa en este bloque',
  !/\bdocument\b|\bwindow\b/.test(sql) && !/aurixEntitlements|requireFeature/.test(sql));
ok('L.2 la frontera Free/Premium visible no se movió: Workspace sigue tras hasAurixPremiumAccess',
  /hasAurixPremiumAccess/.test(app));
ok('L.3 los previews siguen siendo el fallback (no se retiraron)',
  /_aurixPremiumPreviewHTML/.test(app) && /_aurixIntelligencePreviewHTML/.test(app));
ok('M.1 ENFORCE_ENTITLEMENTS sigue en false', /ENFORCE_ENTITLEMENTS\s*=\s*false/.test(app));
ok('M.2 AURIX_PREMIUM_UI_ENABLED sigue en false', /AURIX_PREMIUM_UI_ENABLED\s*=\s*false/.test(app));
ok('N.1 Stripe sigue sin implementar: sólo aparece como valor de enum/documentación',
  !/require\(['"]stripe['"]\)|from ['"]stripe['"]|api\.stripe\.com|pk_live|sk_live/.test(app + sql) &&
  !fs.existsSync(path.join(root, 'api', 'stripe-webhook.js')));
ok('N.2 Apple IAP sigue sin implementar',
  !/verifyReceipt|storekit|in_app_purchase|appstoreconnect/i.test(app + sql));
ok('N.3 no hay checkout ni webhook de facturación en api/',
  !fs.readdirSync(path.join(root, 'api')).some(f => /stripe|checkout|billing|webhook|subscri/i.test(f)));
ok('N.4 provider=\'none\' es el default honesto mientras no haya integración',
  /provider\s+text\s+not null default 'none'/i.test(CLEAN));

// ══ Z. BARRIDO 3VL EXHAUSTIVO ════════════════════════════════════════════
// El primer intento de `subscriptions_premium_bound_chk` usaba `billing_interval
// = 'lifetime'`. Con la columna a NULL eso vale NULL, la cadena entera vale NULL
// y **Postgres ACEPTA una CHECK que devuelve NULL**: la fila más parcial de todas
// pasaba por el guard escrito para detenerla. Un test por EJEMPLO no lo vio,
// porque el ejemplo llevaba interval='month'.
//
// Así que aquí no se prueba el ejemplo: se recorre el producto cartesiano de los
// valores relevantes y se exige (1) que NINGUNA constraint se abstenga nunca, y
// (2) la propiedad de fail-closed sobre TODA fila aceptable.
console.log('\nZ · BARRIDO 3VL (toda constraint debe ser TOTAL: NULL = fila aceptada = fail-open)');
const AXES = {
  plan: ['free', 'premium'],
  status: ['active', 'trialing', 'past_due', 'canceled', 'expired'],
  billing_interval: [null, 'month', 'year', 'lifetime'],
  current_period_start: [null, 1],
  current_period_end: [null, 3],
  trial_start: [null, 1],
  trial_end: [null, 2],
  price_amount_cents: [null, 0, 1499],
  price_currency: [null, 'EUR'],
  provider: ['none', 'stripe', 'apple', 'manual'],
};
function sweep(axes, base) {
  const keys = Object.keys(axes); const out = [];
  (function rec(i, acc) {
    if (i === keys.length) { out.push(Object.assign({}, base, acc)); return; }
    for (const v of axes[keys[i]]) { acc[keys[i]] = v; rec(i + 1, acc); }
  })(0, {});
  return out;
}
const SWEEP = sweep(AXES, SUB_BASE);
let abstentions = 0, abstainedNames = new Set(), failOpen = null, acceptedCount = 0;
for (const row of SWEEP) {
  const r = checkAccepts('subscriptions', row);
  if (r.abstained.length) { abstentions++; r.abstained.forEach(n => abstainedNames.add(n)); }
  if (!r.accepted) continue;
  acceptedCount++;
  // LA PROPIEDAD: ninguna fila aceptable puede ser premium VIVO sin cota de fin.
  const live = row.plan === 'premium' && (row.status === 'active' || row.status === 'trialing');
  if (live && row.current_period_end === null && row.billing_interval !== 'lifetime') failOpen = failOpen || row;
}
ok('Z.1 el barrido cubre el espacio relevante', SWEEP.length === 2 * 5 * 4 * 2 * 2 * 2 * 2 * 3 * 2 * 4,
  'filas: ' + SWEEP.length);
ok('Z.2 NINGUNA constraint de subscriptions se abstiene (0 evaluaciones NULL en ' + SWEEP.length + ' filas)',
  abstentions === 0, abstentions + ' abstenciones en: ' + [...abstainedNames].join(', '));
ok('Z.3 PROPIEDAD FAIL-CLOSED: ninguna fila aceptable es premium VIVO sin cota de fin',
  failOpen === null, failOpen ? JSON.stringify(failOpen) : '');
ok('Z.4 el barrido sí acepta filas legítimas (no es verde por rechazarlo todo)',
  acceptedCount > 50, 'aceptadas: ' + acceptedCount);
ok('Z.5 PROPIEDAD: toda fila premium VIVA aceptable declara su importe canónico',
  SWEEP.filter(r => checkAccepts('subscriptions', r).accepted)
       .filter(r => r.plan === 'premium' && ['active','trialing'].includes(r.status))
       .every(r => r.price_amount_cents !== null));
ok('Z.6 PROPIEDAD: toda fila trialing aceptable declara trial_end',
  SWEEP.filter(r => checkAccepts('subscriptions', r).accepted)
       .filter(r => r.status === 'trialing').every(r => r.trial_end !== null));
ok('Z.7 "paga" es decidible: existe fila premium viva con price>0 y otra comp con price=0',
  SWEEP.filter(r => checkAccepts('subscriptions', r).accepted)
       .some(r => r.plan === 'premium' && r.status === 'active' && r.price_amount_cents > 0) &&
  SWEEP.filter(r => checkAccepts('subscriptions', r).accepted)
       .some(r => r.plan === 'premium' && r.status === 'active' && r.price_amount_cents === 0));

// Mismo barrido, exhaustivo, para las otras dos tablas.
const OV_SWEEP = sweep({
  feature_key: ['*', 'workspace.loan', 'Workspace.Loan', 'workspace', ''],
  allowed: [true, false], reason: ['founder', 'comp', 'qa', 'support', 'because'],
  starts_at: [100], expires_at: [null, 50, 500],
}, OV_BASE);
let ovAbst = 0; const ovNames = new Set();
for (const r of OV_SWEEP) { const c = checkAccepts('entitlement_overrides', r);
  if (c.abstained.length) { ovAbst++; c.abstained.forEach(n => ovNames.add(n)); } }
ok('Z.8 ninguna constraint de entitlement_overrides se abstiene', ovAbst === 0,
  ovAbst + ' en: ' + [...ovNames].join(', '));
const PF_SWEEP = sweep({ plan: ['free', 'premium', 'founder'],
  feature_key: ['workspace.loan', 'workspace.templates', 'WORKSPACE.LOAN'], allowed: [true, false] }, PF_BASE);
let pfAbst = 0;
for (const r of PF_SWEEP) { if (checkAccepts('plan_features', r).abstained.length) pfAbst++; }
ok('Z.9 ninguna constraint de plan_features se abstiene', pfAbst === 0);
// La TOTALIDAD de las constraints es DERIVADA: descansa en el NOT NULL de las
// columnas que aparecen sin guarda. Si una migración futura relaja uno de esos
// NOT NULL, `premium_bound_chk` vuelve a devolver NULL y el fail-open regresa en
// silencio — y el barrido no lo vería, porque sus dominios nunca generan NULL
// ahí. Así que el pilar se gatea explícitamente: quitar un NOT NULL de esta
// lista NO es una relajación, es un cambio FAIL-OPEN.
const NOT_NULL_PILLARS = {
  subscriptions: ['plan', 'status', 'cancel_at_period_end'],
  entitlement_overrides: ['feature_key', 'allowed', 'reason', 'starts_at'],
  plan_features: ['plan', 'feature_key', 'allowed'],
};
const nullable = [];
for (const [tbl, cols] of Object.entries(NOT_NULL_PILLARS)) {
  for (const c of cols) {
    const def = T[tbl] && T[tbl].columns[c] ? T[tbl].columns[c].defLow : '';
    if (!/\bnot null\b/.test(def)) nullable.push(tbl + '.' + c);
  }
}
ok('Z.11 los NOT NULL de los que DEPENDE la totalidad siguen en pie ' +
   '(quitar uno es un cambio fail-open, no una relajación)',
  nullable.length === 0, 'ya nullable: ' + nullable.join(', '));

ok('Z.10 PROPIEDAD: ninguna fila free aceptable concede nada',
  PF_SWEEP.filter(r => checkAccepts('plan_features', r).accepted)
          .every(r => r.plan !== 'free' || r.allowed === false));

// ══ INTEGRIDAD DEL PROPIO MODELO ═════════════════════════════════════════
// Un gate que modela el fichero puede quedarse verde por no ENTENDER una
// sentencia. Estos asserts hacen que lo no modelado falle en ROJO, no en verde.
console.log('\nY · INTEGRIDAD DEL MODELO (lo que el modelo no entiende debe fallar, no pasar)');
ok('Y.1 cada CHECK del fichero es evaluable: cero errores de evaluación',
  EVAL_ERRORS.length === 0, EVAL_ERRORS.join(' | '));
const GRANT_STMTS = STMTS.filter(x => /^(grant|revoke)\b/i.test(norm(x)));
ok('Y.2 todo GRANT/REVOKE del fichero encaja en una forma que el modelo SABE resolver',
  GRANT_STMTS.every(x => {
    const n = norm(x).toLowerCase();
    return /^(grant|revoke) [a-z, ]+ on (table )?public\.\w+ (to|from) [\w, ]+$/.test(n) ||
           /^(grant|revoke) [a-z, ]+ on function public\.\w+\(\) (to|from) [\w, ]+$/.test(n);
  }), 'formas no modeladas: ' + GRANT_STMTS.filter(x => {
    const n = norm(x).toLowerCase();
    return !/^(grant|revoke) [a-z, ]+ on (table )?public\.\w+ (to|from) [\w, ]+$/.test(n) &&
           !/^(grant|revoke) [a-z, ]+ on function public\.\w+\(\) (to|from) [\w, ]+$/.test(n);
  }).map(x => norm(x).slice(0, 60)));
ok('Y.3 ninguna forma de GRANT amplia o de nivel columna, que el modelo leería como ausencia',
  !/all tables in schema|all functions in schema|all sequences in schema|alter default privileges/i.test(CLEAN) &&
  !/grant[^;]*\([^)]*\)[^;]*on\s+public\./i.test(CLEAN) &&
  !/grant\s+all\s+privileges/i.test(CLEAN));
ok('Y.4 no hay bloques DO $$ … $$: el modelo no ve dentro de ellos',
  !/\bdo\s*\$\$/i.test(CLEAN));
const fnRevoked = (fn) => model.funcGrants.some(g => g.kind === 'revoke' && g.fn === fn &&
  g.privs.includes('all') && ['public','anon','authenticated'].every(r => g.roles.includes(r)));
ok('Y.5 los privilegios de FUNCIÓN se revocan a los roles NOMBRADOS, no sólo a public',
  fnRevoked('aurix_commercial_state') && fnRevoked('aurix_touch_updated_at'));
ok('Y.5b tras revocar, EXECUTE se concede sólo a authenticated y sólo en la superficie saneada',
  model.funcGrants.filter(g => g.kind === 'grant').length === 1 &&
  model.funcGrants.filter(g => g.kind === 'grant').every(g => g.fn === 'aurix_commercial_state' &&
    g.privs.length === 1 && g.privs[0] === 'execute' && String(g.roles) === 'authenticated'));
const FNS = Object.keys(model.functions);
ok('Y.6 el fichero define exactamente dos funciones, y sólo UNA es SECURITY DEFINER',
  FNS.length === 2 && FNS.every(f => ['aurix_touch_updated_at', 'aurix_commercial_state'].includes(f)) &&
  FNS.filter(f => /security definer/i.test(model.functions[f])).length === 1, 'funciones: ' + FNS);
ok('Y.7 ninguna función acepta parámetros (nada por donde pedir la fila de otro usuario)',
  FNS.every(f => new RegExp('function public\\.' + f + '\\(\\s*\\)').test(model.functions[f])));
ok('Y.8 ninguna función ESCRIBE en las tres tablas comerciales',
  !FNS.some(f => /insert into public\.(subscriptions|entitlement_overrides|plan_features)|update public\.(subscriptions|entitlement_overrides|plan_features)|delete from public\.(subscriptions|entitlement_overrides|plan_features)/i
    .test(model.functions[f])));
ok('Y.9 el modelo parseó TODAS las sentencias del fichero (nada cayó al suelo en silencio)',
  (() => {
    const known = Object.keys(model.tables).length + model.policies.length + model.grants.length +
      model.indexes.length + model.triggers.length + model.inserts.length + FNS.length +
      model.funcGrants.length +
      STMTS.filter(x => /^alter table public\.\w+ (enable|force) row level security$/i.test(norm(x))).length +
      STMTS.filter(x => /^drop (policy|trigger|function)/i.test(norm(x))).length;
    return known === STMTS.length;
  })(), 'sentencias ' + STMTS.length);

// ══ CONTRATO DOCUMENTADO ═════════════════════════════════════════════════
console.log('\nCONTRATO');
const CONTRACT = [
  /billing provider/i, /service-role/i, /subscriptions.*billing/i, /plan_features/i,
  /entitlement_overrides/i, /resolver/i, /never grants Premium/i, /fail-closed/i,
  /Founder ≠ paying customer/i, /MRR\/ARR/i, /Legacy state never grants a right/i,
];
ok('X.1 COMMERCIAL TRUTH CONTRACT V1 documentado en 12 puntos',
  /COMMERCIAL TRUTH CONTRACT V1/.test(doc) && CONTRACT.every(re => re.test(doc)),
  'faltan: ' + CONTRACT.filter(re => !re.test(doc)).map(String));
ok('X.2 el aviso LEGACY CLIENT STATE ≠ COMMERCIAL TRUTH está escrito',
  /LEGACY CLIENT STATE ≠ COMMERCIAL TRUTH/.test(doc));
ok('X.3 la desviación de Phase A (sin plan founder) está declarada, no escondida',
  /no `founder` plan/i.test(doc) && /Phase A/.test(doc));
ok('X.4 el estado de B0 se declara con evidencia y sin fingir que está ejecutado',
  /42501/.test(doc) && /execution pending on the founder/i.test(doc));
ok('X.5 la migración se declara NO APLICADA todavía', /\*\*\* NOT YET APPLIED \*\*\*/.test(sql));

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
