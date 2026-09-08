-- Run AFTER 0021, on its own. Changes nothing.
-- Every row should say OK.

with checks as (
  select 'table direct_messages' as thing,
         to_regclass('public.direct_messages') is not null as ok
  union all select 'table resource_checklist_items',
         to_regclass('public.resource_checklist_items') is not null
  union all select 'table resource_checklist_progress',
         to_regclass('public.resource_checklist_progress') is not null

  union all select 'RLS on direct_messages',
    (select relrowsecurity from pg_class where oid = 'public.direct_messages'::regclass)
  union all select 'RLS on resource_checklist_items',
    (select relrowsecurity from pg_class where oid = 'public.resource_checklist_items'::regclass)
  union all select 'RLS on resource_checklist_progress',
    (select relrowsecurity from pg_class where oid = 'public.resource_checklist_progress'::regclass)

  union all select 'fn is_team_member',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'is_team_member')
  union all select 'fn can_read_resource',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'can_read_resource')

  union all select 'policy direct_messages read own',
    exists (select 1 from pg_policies where schemaname='public' and tablename='direct_messages'
            and policyname='direct_messages: read own conversations')
  union all select 'policy direct_messages send as self',
    exists (select 1 from pg_policies where schemaname='public' and tablename='direct_messages'
            and policyname='direct_messages: send as self')
  union all select 'policy checklist items readable',
    exists (select 1 from pg_policies where schemaname='public' and tablename='resource_checklist_items'
            and policyname='resource_checklist_items: read with resource')
  union all select 'policy checklist progress own rows',
    exists (select 1 from pg_policies where schemaname='public' and tablename='resource_checklist_progress'
            and policyname='resource_checklist_progress: own rows')

  -- Only management writes SOP steps. If a non-management write policy
  -- appears here, an SOP has stopped being a standard.
  union all select 'only management can write SOP steps',
    not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='resource_checklist_items'
        and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
        and policyname <> 'resource_checklist_items: management manage'
    )

  -- Self-messaging must be rejected by the table itself.
  union all select 'direct_messages blocks self-messaging',
    exists (select 1 from pg_constraint where conname = 'direct_messages_not_self')
)
select thing, case when ok then 'OK' else 'PROBLEM' end as state
from checks
order by thing;
