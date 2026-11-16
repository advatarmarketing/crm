-- VERIFY 0042 — run this after 0042_content_videos.sql.
-- Safe to run before it too: every check reports rather than crashing.

select '1. the video schedule is there' as check,
       case when to_regclass('public.content_videos') is not null then 'OK'
            else 'PROBLEM - 0042 did not run' end as result;

select '2. it is locked down' as check,
       case when exists (select 1 from pg_class where oid = to_regclass('public.content_videos') and relrowsecurity)
            then 'OK' else 'PROBLEM - row level security is off, or 0042 did not run' end as result;

select '3. clients and videographers can only read it' as check,
       case when to_regclass('public.content_videos') is not null and not exists (
         select 1 from pg_policies
         where schemaname = 'public' and tablename = 'content_videos'
           and cmd <> 'SELECT'
           and (coalesce(qual, '') || coalesce(with_check, '')) ~ '''(client|videographer)'''
           and (coalesce(qual, '') || coalesce(with_check, '')) !~ 'can_manage_client'
       ) then 'OK' else 'PROBLEM - a client or videographer can change the schedule, or 0042 did not run' end as result;

select '4. the client verdict goes through the package check' as check,
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'client_decide_submission' and p.prosecdef
       ) then 'OK' else 'PROBLEM - client_decide_submission is missing, or 0042 did not run' end as result;

select '5. client notes respect the package' as check,
       case when exists (
         select 1 from pg_policies
         where schemaname = 'public' and tablename = 'submission_feedback'
           and policyname = 'submission_feedback: client comment shared'
           and with_check like '%client_revision_mode%'
       ) then 'OK' else 'PROBLEM - clients can comment whatever their package, or 0042 did not run' end as result;

select '6. uploads know what they are' as check,
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'submissions' and column_name = 'kind'
       ) and exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'submission_versions' and column_name = 'stream_url'
       ) then 'OK' else 'PROBLEM - 0042 did not run' end as result;

-- ------------------------------------------------------------------
-- Below here reads your data. Tables are named inside strings so this
-- still runs before the migration.
-- ------------------------------------------------------------------

select '7. old plan slots copied across' as check,
       case when to_regclass('public.content_videos') is null then 'not yet - 0042 did not run'
            else (xpath('/row/n/text()', query_to_xml(
                   'select count(*) as n from public.content_videos where legacy_slot_id is not null', false, true, '')))[1]::text
                 || ' video(s) brought over from content plans (they have no date yet - give them one on each client''s Videos tab)'
       end as result;

select '8. videos on the schedule' as check,
       case when to_regclass('public.content_videos') is null then 'not yet - 0042 did not run'
            else (xpath('/row/n/text()', query_to_xml(
                   'select count(*) as n from public.content_videos where publish_on is not null', false, true, '')))[1]::text
                 || ' dated video(s)'
       end as result;
