-- VERIFY 0046 - run this after 0046_video_performance.sql.
-- Safe to run before it too: every check reports rather than crashing.

select '1. post links and reports are there' as check,
       case when to_regclass('public.video_posts') is not null
             and to_regclass('public.performance_reports') is not null then 'OK'
            else 'PROBLEM - 0046 did not run' end as result;

select '2. videos can have a shape' as check,
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'content_videos' and column_name = 'aspect') then 'OK'
            else 'PROBLEM - 0046 did not run' end as result;

select '3. a post always belongs to its video''s client' as check,
       case when exists (select 1 from pg_trigger where tgname = 'video_posts_pin_client' and not tgisinternal) then 'OK'
            else 'PROBLEM - 0046 did not run' end as result;

select '4. videographers and clients can look at numbers but not change them' as check,
       case when to_regclass('public.video_posts') is not null and not exists (
         select 1 from pg_policies where schemaname = 'public' and tablename = 'video_posts'
           and cmd <> 'SELECT' and (qual like '%videographer%' or qual like '%''client''%')
       ) then 'OK' else 'PROBLEM - check the video_posts policies, or 0046 did not run' end as result;

select '5. reports are for the team only' as check,
       case when to_regclass('public.performance_reports') is not null
             and (select relrowsecurity from pg_class where oid = to_regclass('public.performance_reports'))
             and not exists (
               select 1 from pg_policies where schemaname = 'public' and tablename = 'performance_reports'
                 and (qual like '%videographer%' or qual like '%''client''%')
             ) then 'OK' else 'PROBLEM - check the performance_reports policies, or 0046 did not run' end as result;
