-- VERIFY 0056 - run this after 0056_professional_replier.sql. Every line should say OK.

select '1. the replier tables are there' as check,
       case when to_regclass('public.replier_runs') is not null and to_regclass('public.replier_playbook') is not null
             and to_regclass('public.replier_examples') is not null and to_regclass('public.replier_access') is not null
            then 'OK' else 'PROBLEM - 0056 did not run' end as result;

select '2. the playbook has its starting rules' as check,
       case when (select needs_ceo from public.replier_playbook where id) like '%another month%' then 'OK' else 'PROBLEM - playbook missing' end as result;

select '3. only the CEO changes the playbook and who has access' as check,
       case when exists (select 1 from pg_policies where tablename = 'replier_playbook' and policyname = 'replier_playbook: ceo writes')
             and exists (select 1 from pg_policies where tablename = 'replier_access' and policyname = 'replier_access: ceo all')
            then 'OK' else 'PROBLEM - rules missing' end as result;

select '4. people only see their own replies (the CEO sees all)' as check,
       case when (select relrowsecurity from pg_class where oid = 'public.replier_runs'::regclass)
             and exists (select 1 from pg_policies where tablename = 'replier_runs' and qual like '%auth.uid()%')
            then 'OK' else 'PROBLEM - replier_runs rules missing' end as result;

select '5. messages that need the CEO become a to-do' as check,
       case when to_regprocedure('public.replier_escalate(uuid)') is not null then 'OK' else 'PROBLEM - 0056 did not run' end as result;
