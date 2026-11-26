-- VERIFY 0059 - run this after 0059_every_other_day.sql.

select '1. packages accept "every other day"' as check,
       case when (
         select count(*) from pg_constraint con
         where con.conrelid in ('public.client_packages'::regclass, 'public.package_presets'::regclass)
           and con.contype = 'c'
           and pg_get_constraintdef(con.oid) like '%alternate%'
       ) = 2 then 'OK' else 'PROBLEM - 0059 did not run' end as result;

select '2. no older rule still refuses it' as check,
       case when not exists (
         select 1 from pg_constraint con
         where con.conrelid in ('public.client_packages'::regclass, 'public.package_presets'::regclass)
           and con.contype = 'c'
           and pg_get_constraintdef(con.oid) like '%posting_mode%'
           and pg_get_constraintdef(con.oid) like '%per_week%'
           and pg_get_constraintdef(con.oid) not like '%videos_per_week%'
           and pg_get_constraintdef(con.oid) not like '%alternate%'
       ) then 'OK' else 'PROBLEM - an old posting rule is still there' end as result;
