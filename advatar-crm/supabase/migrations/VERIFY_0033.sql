-- Run this after 0033_website_enquiries.sql.
-- Every row in the first result should say OK.

with checks as (
  select 'clients.contact_phone' as thing,
         exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'clients'
                   and column_name = 'contact_phone') as ok

  union all
  select 'table enquiry_throttle',
         to_regclass('public.enquiry_throttle') is not null

  union all
  select 'enquiry_throttle has RLS on',
         coalesce((select relrowsecurity from pg_class
                   where oid = to_regclass('public.enquiry_throttle')), false)

  -- No policies is the design: RLS with no policy means no row is
  -- visible and no write is allowed to anyone but the service role.
  union all
  select 'enquiry_throttle has no policies',
         (select count(*) from pg_policies
          where schemaname = 'public' and tablename = 'enquiry_throttle') = 0

  union all
  select 'enquiry_throttle unreachable from the API',
         case when to_regclass('public.enquiry_throttle') is null then false
              else not has_table_privilege('anon', 'public.enquiry_throttle', 'SELECT')
               and not has_table_privilege('anon', 'public.enquiry_throttle', 'INSERT')
               and not has_table_privilege('authenticated', 'public.enquiry_throttle', 'SELECT')
               and not has_table_privilege('authenticated', 'public.enquiry_throttle', 'INSERT')
         end

  -- The public must not be able to write a client row directly; the
  -- enquiry goes through the server, which uses the service-role key.
  union all
  select 'signed-out visitors cannot write a lead',
         not has_table_privilege('anon', 'public.clients', 'INSERT')

  -- A new enquiry is unassigned, so the only policy that can match it
  -- is management's, and that one is can_manage_client() — CEO
  -- anywhere, operations manager only where assigned.
  union all
  select 'an unassigned lead is CEO-only',
         exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'clients'
                   and policyname = 'clients: management full access'
                   and qual like '%can_manage_client%')
         and (select count(*) from pg_policies
              where schemaname = 'public' and tablename = 'clients'
                and cmd in ('SELECT', 'ALL')
                and qual not like '%can_manage_client%'
                and qual not like '%is_assigned_staff%'
                and qual not like '%current_client_id%') = 0

  union all
  select 'can_manage_client exists (0029 was run)',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'can_manage_client')
)
select thing, case when ok then 'OK' else 'PROBLEM' end as state
from checks
order by thing;

-- Every policy that can show a `clients` row, so "CEO only" can be
-- read rather than taken on trust. Each one should name
-- can_manage_client (management), is_assigned_staff (staff or
-- videographer, assigned only) or current_client_id (a client seeing
-- their own record).
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'clients'
order by policyname;

-- Enquiries received so far.
select count(*) as website_enquiries
from public.clients
where lead_source = 'Website enquiry';
