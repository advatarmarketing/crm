-- VERIFY 0053 - run this after 0053_client_dashboard.sql. Every line should say OK.

select '1. YOU: your two brands exist' as check,
       case when (select count(*) from public.clients where internal_kind in ('personal', 'business')) = 2 then 'OK' else 'PROBLEM - 0053 did not run' end as result;

select '2. only the CEO can switch YOU on for someone' as check,
       case when to_regprocedure('public.set_own_content_access(uuid,boolean)') is not null then 'OK' else 'PROBLEM - 0053 did not run' end as result;

select '3. videos get Film / Edit / Send / Post to-dos' as check,
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tasks' and column_name = 'step')
             and exists (select 1 from pg_trigger where tgname = 'content_videos_sync_steps')
            then 'OK' else 'PROBLEM - 0053 did not run' end as result;

select '4. every upcoming video has its four steps' as check,
       case when not exists (
              select 1 from public.content_videos v
              where v.publish_on >= current_date and v.posted_at is null
                and (select count(*) from public.tasks t where t.video_id = v.id) <> 4
            ) then 'OK' else 'PROBLEM - some videos are missing steps' end as result;

select '5. ticking Post marks the video posted' as check,
       case when exists (select 1 from pg_trigger where tgname = 'tasks_post_step_marks_video') then 'OK' else 'PROBLEM - 0053 did not run' end as result;

select '6. scripts: team only, never the client' as check,
       case when to_regclass('public.scripts') is not null
             and (select relrowsecurity from pg_class where oid = 'public.scripts'::regclass)
             and exists (select 1 from pg_policies where tablename = 'scripts' and qual like '%client%')
            then 'OK' else 'PROBLEM - scripts table or its rules missing' end as result;

select '7. deadline dates: video out Mon 7 Dec 2026 is due to be sent Fri 4 Dec' as check,
       case when (select due from public.video_step_dates('2026-12-07') where step = 'submit') = date '2026-12-04' then 'OK' else 'PROBLEM - wrong dates' end as result;
