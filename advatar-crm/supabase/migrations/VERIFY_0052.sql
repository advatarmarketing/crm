-- VERIFY 0052 - run this after 0052_social_scraper.sql. Every line should say OK.

select '1. readings are kept as dated rows' as check,
       case when to_regclass('public.social_readings') is not null then 'OK' else 'PROBLEM - 0052 did not run' end as result;

select '2. starting points can be saved' as check,
       case when to_regclass('public.social_baselines') is not null then 'OK' else 'PROBLEM - 0052 did not run' end as result;

select '3. six platforms allowed' as check,
       case when exists (select 1 from pg_constraint where conname = 'clients_social_platforms_check' and pg_get_constraintdef(oid) like '%linkedin%')
             and exists (select 1 from pg_constraint where conname = 'social_posts_platform_check' and pg_get_constraintdef(oid) like '%youtube%')
            then 'OK' else 'PROBLEM - 0052 did not run' end as result;

select '4. AI spend log and settings' as check,
       case when to_regclass('public.ai_usage') is not null and exists (select 1 from public.ai_settings where id)
            then 'OK' else 'PROBLEM - 0052 did not run' end as result;

select '5. clients can never read AI spend' as check,
       case when (select relrowsecurity from pg_class where oid = 'public.ai_usage'::regclass)
             and (select relrowsecurity from pg_class where oid = 'public.ai_settings'::regclass)
             and not exists (select 1 from pg_policies where tablename in ('ai_usage', 'ai_settings') and qual not like '%ceo%')
            then 'OK' else 'PROBLEM - ai_usage / ai_settings must be finance-only' end as result;

select '6b. spend report for Finance' as check,
       case when to_regprocedure('public.ai_spend_report(timestamptz,timestamptz,timestamptz)') is not null then 'OK' else 'PROBLEM - 0052 did not run' end as result;

select '6. clients only see good readings' as check,
       case when exists (select 1 from pg_policies where tablename = 'social_readings' and policyname = 'social_readings: client read own' and qual like '%ok%')
            then 'OK' else 'PROBLEM - social_readings client policy missing' end as result;

select '7. screenshot storage' as check,
       case when to_regclass('storage.buckets') is null then 'OK (no storage schema here)'
            when exists (select 1 from storage.buckets where id = 'social-shots' and not public)
             and exists (select 1 from storage.buckets where id = 'social-thumbs' and public)
            then 'OK' else 'PROBLEM - buckets missing' end as result;
