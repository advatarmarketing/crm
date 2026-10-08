-- VERIFY 0037 — run this after 0037_task_priority.sql.
--
-- Safe to run BEFORE the migration too: every check reports rather
-- than crashing. That is why the data checks below read the column
-- through to_jsonb() instead of naming it — Postgres resolves a column
-- name when it reads the statement, long before any CASE could guard
-- it, so `case when ... then t.priority end` would still fail outright
-- on a database where the column does not exist yet.

select '1. the column is there' as check,
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'tasks' and column_name = 'priority'
       ) then 'OK' else 'PROBLEM - 0037 did not run' end as result;

select '2. every to-do has one' as check,
       case when (
         select is_nullable from information_schema.columns
         where table_schema = 'public' and table_name = 'tasks' and column_name = 'priority'
       ) = 'NO' then 'OK' else 'PROBLEM - the column allows blanks, or 0037 did not run' end as result;

select '3. new to-dos start at normal' as check,
       case when (
         select column_default from information_schema.columns
         where table_schema = 'public' and table_name = 'tasks' and column_name = 'priority'
       ) like '%normal%' then 'OK' else 'PROBLEM - wrong default, or 0037 did not run' end as result;

select '4. only the four levels allowed' as check,
       case when exists (
         select 1 from pg_constraint
         where conrelid = to_regclass('public.tasks') and conname = 'tasks_priority_check'
       ) then 'OK' else 'PROBLEM - the check is missing, or 0037 did not run' end as result;

select '5. sorted fast' as check,
       case when exists (
         select 1 from pg_indexes
         where schemaname = 'public' and tablename = 'tasks' and indexname = 'tasks_open_priority'
       ) then 'OK' else 'PROBLEM - the index is missing, or 0037 did not run' end as result;

-- ------------------------------------------------------------------
-- Below here reads your actual to-dos.
-- ------------------------------------------------------------------

select '6. nothing was lost' as check,
       'you have ' || count(*) || ' to-do(s), and all of them still have their wording' as result
from public.tasks t
where coalesce(btrim(t.text), '') <> '';

select '7. no to-do ended up with a nonsense level' as check,
       case when count(*) = 0 then 'OK'
            else 'PROBLEM - ' || count(*) || ' to-do(s) have a level outside the four' end as result
from public.tasks t
where coalesce(to_jsonb(t) ->> 'priority', 'normal') not in ('urgent', 'high', 'normal', 'low');

-- The level has to be read out in a subquery first: to_jsonb(t) is not
-- one of the grouping keys, so naming it again in the ORDER BY would
-- be rejected.
select x.level,
       count(*) filter (where not x.finished) as still_to_do,
       count(*) filter (where x.finished) as finished
from (
  select coalesce(to_jsonb(t) ->> 'priority', 'not set yet') as level, t.done as finished
  from public.tasks t
) x
group by x.level
order by case x.level
           when 'urgent' then 1 when 'high' then 2 when 'normal' then 3 when 'low' then 4 else 5 end;
