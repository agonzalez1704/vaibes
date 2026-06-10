-- One consent per (user, scope, policy_version). Re-consent only allowed when
-- the policy_version changes. Dedupe existing rows first (keep earliest).

delete from public.consents c
using public.consents older
where c.user_id = older.user_id
  and c.scope = older.scope
  and c.policy_version = older.policy_version
  and c.granted_at > older.granted_at;

alter table public.consents
  add constraint consents_user_scope_policy_unique
  unique (user_id, scope, policy_version);
