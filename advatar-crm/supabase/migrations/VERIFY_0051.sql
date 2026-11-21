-- VERIFY 0051 - run this after 0051_instagram_lookup.sql.

select '1. Advatar''s Instagram can be connected' as check,
       case when to_regclass('public.agency_instagram') is not null then 'OK' else 'PROBLEM - 0051 did not run' end as result;

select '2. nobody signed in can read its access' as check,
       case when to_regclass('public.agency_instagram') is not null
             and (select relrowsecurity from pg_class where oid = 'public.agency_instagram'::regclass)
             and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'agency_instagram')
            then 'OK' else 'PROBLEM - agency_instagram must have row level security on and no policies' end as result;

select '3. client Instagram can be read from a profile link' as check,
       case when exists (select 1 from pg_constraint where conname = 'social_connections_status_check' and pg_get_constraintdef(oid) like '%lookup%')
            then 'OK' else 'PROBLEM - 0051 did not run' end as result;
