-- VERIFY 0048 - run this after 0048_client_side_refresh.sql.
-- Safe to run before it too: every check reports rather than crashing.

select '1. Files has five sections' as check,
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'client_assets' and column_name = 'section')
            then 'OK' else 'PROBLEM - 0048 did not run' end as result;

select '2. clients can only add Assets and Raw Footage' as check,
       case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_assets'
                          and policyname = 'client_assets: client upload own' and with_check like '%raw_footage%')
            then 'OK' else 'PROBLEM - check the client upload rule, or 0048 did not run' end as result;

select '3. social tables are there' as check,
       case when to_regclass('public.social_connections') is not null and to_regclass('public.social_tokens') is not null
             and to_regclass('public.social_snapshots') is not null and to_regclass('public.social_posts') is not null
             and to_regclass('public.social_pending') is not null
            then 'OK' else 'PROBLEM - 0048 did not run' end as result;

select '4. nobody signed in can read social access tokens' as check,
       case when to_regclass('public.social_tokens') is not null
             and (select relrowsecurity from pg_class where oid = 'public.social_tokens'::regclass)
             and not exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('social_tokens', 'social_pending'))
            then 'OK' else 'PROBLEM - social_tokens must have row level security on and no policies' end as result;

select '5. the guarantee is off except where switched on' as check,
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'clients' and column_name = 'show_guarantee')
            then 'OK - switched on for: ' || coalesce((select string_agg(name, ', ') from public.clients where show_guarantee), 'nobody (check Mr 247''s name)')
            else 'PROBLEM - 0048 did not run' end as result;

select '6. the welcome tour is remembered per account' as check,
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'tour_seen_at')
             and to_regprocedure('public.mark_tour_seen()') is not null
            then 'OK' else 'PROBLEM - 0048 did not run' end as result;
