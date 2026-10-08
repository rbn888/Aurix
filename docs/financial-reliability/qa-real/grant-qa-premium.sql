-- SPEC 1 · Premium TEMPORAL para UNA cuenta SINTÉTICA de verificación. Lo ejecuta el founder en el
-- SQL editor de Supabase (producción). No toca ninguna otra cuenta. Idempotente. Caduca en 7 días.
-- Requisito: la cuenta ya existe (ha iniciado sesión una vez con el correo sintético).
-- Sustituir QA_EMAIL por el correo sintético elegido (p. ej. un alias +aurixqa del founder).

-- 1) Comprobar que existe y es la que se espera (debe devolver UNA fila, creada hoy).
select id, email, created_at from auth.users where email = 'QA_EMAIL';

-- 2) Conceder el acceso (reason 'qa': dominio cerrado founder|comp|qa|support).
insert into public.entitlement_overrides (user_id, feature_key, allowed, reason, granted_by, expires_at)
select u.id, '*', true, 'qa', 'spec1-verificacion-real', now() + interval '7 days'
from auth.users u
where u.email = 'QA_EMAIL'
on conflict (user_id, feature_key) do nothing;

-- 3) Verificar.
select o.user_id, o.feature_key, o.reason, o.granted_by, o.expires_at
from public.entitlement_overrides o join auth.users u on u.id = o.user_id
where u.email = 'QA_EMAIL';
