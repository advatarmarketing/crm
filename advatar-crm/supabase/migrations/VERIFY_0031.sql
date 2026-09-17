-- Run this after 0031_team_directory.sql.
-- Every row in the first result should say OK.

with checks as (
  select 'view team_directory' as thing,
         to_regclass('public.team_directory') is not null as ok

  -- The column list IS the security boundary here, so it is checked
  -- rather than trusted. Four columns, and specifically not phone,
  -- notify_email, availability or client_id.
  union all
  select 'view exposes exactly four columns',
         (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'team_directory') = 4

  union all
  select 'view hides phone',
         not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'team_directory'
                       and column_name = 'phone')

  union all
  select 'view hides notification email',
         not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'team_directory'
                       and column_name = 'notify_email')

  union all
  select 'view hides availability',
         not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'team_directory'
                       and column_name = 'availability')

  union all
  select 'view hides client_id',
         not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'team_directory'
                       and column_name = 'client_id')

  -- It must NOT be security_invoker: the whole mechanism is that it
  -- runs with its owner's rights, so a videographer or client reading
  -- it is not stopped by profiles' own policies.
  union all
  select 'view runs with owner privileges',
         coalesce(
           (select not (coalesce(array_to_string(reloptions, ','), '') like '%security_invoker=true%')
            from pg_class where oid = to_regclass('public.team_directory')),
           false)

  union all
  select 'signed-in users may read it',
         has_table_privilege('authenticated', 'public.team_directory', 'SELECT')

  -- Signed-out visitors may not. There is no page that needs a staff
  -- list before you log in.
  union all
  select 'signed-out visitors may not',
         not has_table_privilege('anon', 'public.team_directory', 'SELECT')

  -- Client logins are not in it, so a client cannot use it to
  -- enumerate other clients.
  union all
  select 'client logins are excluded',
         not exists (select 1 from public.team_directory td
                     join public.profiles p on p.id = td.id
                     where p.role = 'client')

  -- And profiles itself must be no more readable than it was.
  union all
  select 'profiles policies unchanged',
         (select count(*) from pg_policies
          where schemaname = 'public' and tablename = 'profiles' and cmd = 'SELECT') = 2
)
select thing, case when ok then 'OK' else 'PROBLEM' end as state
from checks
order by thing;

-- What the view actually shows. Every team member, names filled in,
-- and no clients.
select role, full_name from public.team_directory order by role, full_name;
