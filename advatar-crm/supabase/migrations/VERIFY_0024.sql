-- Run AFTER 0024, on its own. Changes nothing.
-- Every row should say OK.

with checks as (
  select 'fn can_see_client' as thing,
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='can_see_client') as ok
  union all select 'fn is_ceo_role',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.proname='is_ceo_role')
  union all select 'trigger clients_assign_creator',
    exists (select 1 from pg_trigger where tgname='clients_assign_creator')

  -- Only the CEO may change who is on a client. If a manager could
  -- write client_staff they could assign themselves anything, and the
  -- scoping would be decorative.
  union all select 'only CEO can change assignments',
    exists (select 1 from pg_policies where schemaname='public' and tablename='client_staff'
            and policyname='client_staff: ceo manages')
  union all select 'no management-write policy left on client_staff',
    not exists (select 1 from pg_policies where schemaname='public' and tablename='client_staff'
                and policyname='client_staff: management full access')
)
select thing, case when ok then 'OK' else 'PROBLEM' end as state
from checks
order by thing;

-- Every client-scoped policy should now mention can_see_client rather
-- than is_management. Anything listed here still grants an operations
-- manager blanket access.
select tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('clients','planners','documents','tasks','message_threads','messages',
                    'invoices','client_activity','client_checklist_items','schedule_events',
                    'submissions','submission_versions','submission_feedback',
                    'client_brand_kits','client_team_messages','fathom_calls')
  and policyname like '%management%'
  and qual not like '%can_see_client%'
  and qual not like '%is_ceo_role%'
order by tablename;

-- Who each operations manager can currently see. Empty for a manager
-- means they have not been given any clients yet.
select p.full_name as manager, c.name as client
from public.profiles p
left join public.client_staff cs on cs.staff_id = p.id
left join public.clients c on c.id = cs.client_id
where p.role = 'operations_manager'
order by p.full_name, c.name;
