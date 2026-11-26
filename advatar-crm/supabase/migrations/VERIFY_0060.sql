-- VERIFY 0060 - run this after 0060_approve_before_client.sql.

select '1. only the CEO or operations can send a video to the client' as check,
       case when exists (select 1 from pg_trigger where tgname = 'submissions_approve_before_client' and not tgisinternal)
            then 'OK' else 'PROBLEM - 0060 did not run' end as result;

select '2. a videographer''s new version goes back for approval' as check,
       case when exists (select 1 from pg_trigger where tgname = 'submission_versions_need_approval' and not tgisinternal)
            then 'OK' else 'PROBLEM - 0060 did not run' end as result;
