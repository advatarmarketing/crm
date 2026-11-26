-- VERIFY 0061 - run this after 0061_videographer_posting.sql.

select '1. videographers can tick a video posted' as check,
       case when to_regprocedure('public.set_video_posted(uuid, boolean)') is not null then 'OK'
            else 'PROBLEM - 0061 did not run' end as result;

select '2. they can add and remove post links, not type numbers' as check,
       case when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'video_posts'
                  and policyname in ('video_posts: videographer adds assigned', 'video_posts: videographer removes own')) = 2
             and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'video_posts'
                  and cmd in ('UPDATE', 'ALL') and coalesce(qual, '') || coalesce(with_check, '') like '%videographer%') then 'OK'
            else 'PROBLEM - check the video_posts policies, or 0061 did not run' end as result;

select '3. they can correct a wrong video link' as check,
       case when to_regprocedure('public.fix_video_link(uuid, text)') is not null then 'OK'
            else 'PROBLEM - 0061 did not run' end as result;
