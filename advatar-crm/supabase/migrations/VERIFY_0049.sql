-- VERIFY 0049 - run this after 0049_automatic_post_numbers.sql.

select '1. post numbers can be marked automatic' as check,
       case when exists (
         select 1 from pg_constraint
         where conname = 'video_posts_metrics_source_check'
           and pg_get_constraintdef(oid) like '%platform%'
       ) then 'OK' else 'PROBLEM - 0049 did not run (or 0046 has not run yet)' end as result;
