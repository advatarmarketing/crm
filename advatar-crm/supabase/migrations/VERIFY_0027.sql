-- Run this after 0027_ops_manager_assigns_staff.sql.
-- Every row in the first result should say OK.

with checks as (
  select 'fn role_of' as thing,
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'role_of') as ok

  union all
  select 'fn may_assign_to_client',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'may_assign_to_client')

  union all
  select 'ops manager can add',
         exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_staff'
                 and policyname = 'client_staff: ops manager assigns workers')

  union all
  select 'ops manager can remove',
         exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_staff'
                 and policyname = 'client_staff: ops manager unassigns workers')

  -- The CEO's own policy must survive: it is the only route to
  -- assigning a manager or a CEO to a client.
  union all
  select 'CEO policy still present',
         exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_staff'
                 and policyname = 'client_staff: ceo manages')

  -- The limit, stated as a check rather than trusted: the new policies
  -- must both mention the guard function. If either stopped calling
  -- it, an operations manager could assign themselves.
  union all
  select 'add policy is guarded',
         coalesce((select with_check like '%may_assign_to_client%' from pg_policies
                   where schemaname = 'public' and tablename = 'client_staff'
                     and policyname = 'client_staff: ops manager assigns workers'), false)

  union all
  select 'remove policy is guarded',
         coalesce((select qual like '%may_assign_to_client%' from pg_policies
                   where schemaname = 'public' and tablename = 'client_staff'
                     and policyname = 'client_staff: ops manager unassigns workers'), false)
)
select thing, case when ok then 'OK' else 'PROBLEM' end as state
from checks
order by thing;

-- Every write policy now on the table, for eyeballing. Expect exactly
-- three: the CEO's, and the two added here.
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'client_staff' and cmd <> 'SELECT'
order by policyname;
