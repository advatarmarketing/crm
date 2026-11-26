-- VERIFY 0058 - run this after 0058_videographer_video_links.sql.
-- Safe to run before it too: every check reports rather than crashing.

select '1. videographers can add a video''s link' as check,
       case when to_regprocedure('public.add_video_link(uuid, text, text)') is not null
             and to_regprocedure('public.films_submission(uuid)') is not null then 'OK'
            else 'PROBLEM - 0058 did not run' end as result;

select '2. they can see the upload behind the videos they film' as check,
       case when (select count(*) from pg_policies where schemaname = 'public'
                  and policyname in ('submissions: videographer reads filmed',
                                     'submission_versions: videographer reads filmed',
                                     'submission_feedback: videographer reads filmed',
                                     'submission_checklist: videographer reads filmed')) = 4 then 'OK'
            else 'PROBLEM - a read rule is missing, or 0058 did not run' end as result;

select '3. they still cannot send, approve or edit the schedule' as check,
       case when not exists (
         select 1 from pg_policies where schemaname = 'public'
           and tablename in ('submissions', 'content_videos')
           and cmd in ('UPDATE', 'ALL', 'DELETE')
           and coalesce(qual, '') like '%films_submission%'
       ) and not exists (
         select 1 from pg_policies where schemaname = 'public' and tablename = 'content_videos'
           and cmd <> 'SELECT' and coalesce(qual, '') || coalesce(with_check, '') like '%videographer%'
       ) then 'OK' else 'PROBLEM - check the submissions and content_videos policies' end as result;

select '4. only signed-in people can call it' as check,
       case when to_regprocedure('public.add_video_link(uuid, text, text)') is not null
             and not has_function_privilege('anon', 'public.add_video_link(uuid, text, text)', 'execute')
             and has_function_privilege('authenticated', 'public.add_video_link(uuid, text, text)', 'execute') then 'OK'
            else 'PROBLEM - check who can run add_video_link, or 0058 did not run' end as result;
