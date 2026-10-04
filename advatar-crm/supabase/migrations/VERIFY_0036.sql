-- VERIFY_0036.sql — read-only. Run after 0036.
--
-- Every row should read OK. Nothing here writes anything.

-- 1. Both tables exist.
select
  '1. tables exist' as check,
  case when (
    select count(*) from information_schema.tables
    where table_schema = 'public' and table_name in ('planner_blocks', 'planner_presets')
  ) = 2 then 'OK' else 'PROBLEM - 0036 did not run' end as result;

-- 2. Row level security is on for both. Without this every signed-in
--    person reads everybody's week.
select
  '2. RLS on' as check,
  case when count(*) = 2 then 'OK'
       else 'PROBLEM - only ' || count(*) || ' of 2 tables have it' end as result
from pg_tables
where schemaname = 'public'
  and tablename in ('planner_blocks', 'planner_presets')
  and rowsecurity;

-- 3. One owner-only policy each, and nothing else. A second policy on
--    either table would be an OR, not an AND — it could only ever
--    widen who can read a week.
select
  '3. owner-only, one policy each' as check,
  case when count(*) = 2 then 'OK'
       else 'PROBLEM - expected 2 policies, found ' || count(*) end as result
from pg_policies
where schemaname = 'public'
  and tablename in ('planner_blocks', 'planner_presets');

-- 4. The policies really do compare against the caller, rather than
--    being a permissive "true" that merely looks like a policy.
select
  '4. policies check the owner' as check,
  case when count(*) = 2 then 'OK'
       else 'PROBLEM - ' || (2 - count(*)) || ' policy/policies do not test owner_id' end as result
from pg_policies
where schemaname = 'public'
  and tablename in ('planner_blocks', 'planner_presets')
  and coalesce(qual, '') like '%owner_id%'
  and coalesce(with_check, '') like '%owner_id%';

-- 5. A block is either dated or repeating, never both and never
--    neither, and never ends before it starts.
select
  '5. block shape enforced' as check,
  case when (
    select count(*) from pg_constraint
    where conrelid = to_regclass('public.planner_blocks')
      and conname in ('planner_blocks_ends_after_start', 'planner_blocks_date_matches_repeat')
  ) = 2 then 'OK' else 'PROBLEM - a shape constraint is missing, or 0036 did not run' end as result;

-- 6. The weekday trigger, which is what stops a dated block drawing
--    in the wrong column.
select
  '6. weekday kept honest' as check,
  case when exists (
    select 1 from pg_trigger
    where tgrelid = to_regclass('public.planner_blocks') and tgname = 'planner_blocks_weekday'
  ) then 'OK' else 'PROBLEM - the trigger is missing, or 0036 did not run' end as result;

-- 7. The link to the company diary unlinks rather than cascades, so
--    deleting a calendar entry never deletes somebody's plan for
--    their morning.
select
  '7. calendar link unlinks, not deletes' as check,
  case when exists (
    select 1 from pg_constraint
    where conrelid = to_regclass('public.planner_blocks')
      and contype = 'f'
      and confrelid = to_regclass('public.schedule_events')
      and confdeltype = 'n'   -- 'n' = SET NULL
  ) then 'OK' else 'PROBLEM - wrong or missing foreign key, or 0036 did not run' end as result;

-- =================================================================
-- Below here reads the table itself
-- =================================================================
-- Which means these only run once 0036 has been applied. A statement
-- naming a column or a table is rejected when Postgres PARSES it,
-- before any CASE or guard inside it could run, so there is no way to
-- write these so they report rather than fail on a database that has
-- not run the migration. The seven checks above are the ones that
-- answer "did it work", and they always report.

-- Nothing in the data disagrees with the weekday trigger.
select
  'data: no block on the wrong day' as check,
  case when count(*) = 0 then 'OK'
       else 'PROBLEM - ' || count(*) || ' block(s) sit on the wrong weekday' end as result
from public.planner_blocks b
where b.on_date is not null
  and b.weekday <> extract(isodow from b.on_date)::int - 1;

-- What is there, if anything. Yours only: the policies above see to
-- that, so this shows your week and nobody else's.
select
  case b.weekday when 0 then 'Mon' when 1 then 'Tue' when 2 then 'Wed'
       when 3 then 'Thu' when 4 then 'Fri' when 5 then 'Sat' else 'Sun' end as day,
  to_char((b.start_minute || ' minutes')::interval, 'HH24:MI') as starts,
  to_char((b.end_minute || ' minutes')::interval, 'HH24:MI') as ends,
  b.title,
  case when b.repeats then 'every week' else to_char(b.on_date, 'DD Mon') end as when_,
  case when b.schedule_event_id is null then '-' else 'on the calendar' end as shared
from public.planner_blocks b
order by b.repeats desc, b.weekday, b.start_minute;
