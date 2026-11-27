-- VERIFY 0062 - run this after 0062_vsl_page.sql.

select '1. the VSL page has somewhere to keep its content' as check,
       case when to_regclass('public.site_pages') is not null then 'OK' else 'PROBLEM - 0062 did not run' end as result;

select '2. only the CEO and operations can change it' as check,
       case when to_regclass('public.site_pages') is not null and not exists (
         select 1 from pg_policies where schemaname = 'public' and tablename = 'site_pages'
           and coalesce(qual, '') not like '%operations_manager%'
       ) then 'OK' else 'PROBLEM - check the site_pages policies, or 0062 did not run' end as result;

select '3. the public folder for logos is there' as check,
       case when exists (select 1 from storage.buckets where id = 'site-media' and public) then 'OK'
            else 'PROBLEM - the site-media bucket is missing' end as result;
