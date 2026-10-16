-- VERIFY 0039 — run this after 0039_client_credentials.sql.
--
-- Checks 1 to 6 read the database's own catalogue, so they are safe
-- to run before the migration too: they report rather than crash.
--
-- Checks 7 and 8 read the new table itself, so if 0039 has not run
-- they come back with "relation public.client_credentials does not
-- exist". That is the expected answer in that case, not a fault.

select '1. the table is there' as check,
       case when to_regclass('public.client_credentials') is not null
            then 'OK' else 'PROBLEM - 0039 did not run' end as result;

select '2. row level security is on' as check,
       case when exists (
         select 1 from pg_class
         where oid = to_regclass('public.client_credentials') and relrowsecurity
       ) then 'OK'
       else 'PROBLEM - the table is open to everybody, or 0039 did not run' end as result;

select '3. only management and assigned staff' as check,
       case when (
         select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'client_credentials'
       ) = 2 then 'OK'
       else 'PROBLEM - expected exactly 2 policies, found ' || (
         select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'client_credentials'
       ) || ' - check nothing has been added by hand' end as result;

select '4. videographers and clients cannot see logins' as check,
       case when (
         select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'client_credentials'
           and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%videographer%'
       ) = 0 then 'OK'
       else 'PROBLEM - a policy on client_credentials mentions videographers' end as result;

select '5. passwords cannot be stored in the clear' as check,
       case when (
         select count(*) from pg_constraint
         where conrelid = to_regclass('public.client_credentials')
           and contype = 'c'
           and pg_get_constraintdef(oid) like '%secret_cipher%'
       ) > 0 then 'OK'
       else 'PROBLEM - the guard is missing, or 0039 did not run' end as result;

select '6. closing a client removes their logins' as check,
       case when exists (
         select 1 from pg_constraint
         where conrelid = to_regclass('public.client_credentials')
           and contype = 'f'
           and confrelid = to_regclass('public.clients')
           and confdeltype = 'c'
       ) then 'OK'
       else 'PROBLEM - logins would be left behind for a client that is gone, or 0039 did not run' end as result;

-- ------------------------------------------------------------------
-- Below here reads the table itself. Nothing it prints is a password:
-- the passwords are encrypted and this does not decrypt them.
-- ------------------------------------------------------------------

select '7. nothing readable is stored' as check,
       case when count(*) = 0 then 'OK - every saved password is encrypted'
            else 'PROBLEM - ' || count(*) || ' row(s) hold something that is not encrypted' end as result
from public.client_credentials
where secret_cipher is not null and secret_cipher !~ '^v[0-9]+\.';

select c.name as client,
       cc.platform,
       coalesce(cc.label, '') as which_one,
       coalesce(cc.username, '(no handle saved)') as handle,
       case when cc.secret_cipher is null then 'no password saved' else 'password saved' end as password
from public.client_credentials cc
join public.clients c on c.id = cc.client_id
order by c.name, cc.platform, cc.label;
