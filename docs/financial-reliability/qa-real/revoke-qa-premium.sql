-- SPEC 1 · Retirar el Premium temporal de la cuenta SINTÉTICA (sólo la fila que se creó para esto).
delete from public.entitlement_overrides o
using auth.users u
where u.id = o.user_id and u.email = 'QA_EMAIL'
  and o.reason = 'qa' and o.granted_by = 'spec1-verificacion-real';
