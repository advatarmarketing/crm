-- VERIFY_0035.sql — read-only. Run after 0035.
--
-- Every row should read OK. Nothing here writes anything.

-- 1. Subfolders: the parent column exists.
select
  '1. folders can nest' as check,
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'note_folders' and column_name = 'parent_id'
  ) then 'OK' else 'PROBLEM - 0035 did not run' end as result;

-- 2. The old name index is gone and the per-parent one replaced it.
--    Without this, two subfolders in different folders could not share
--    a name — the whole point of nesting them.
select
  '2. names unique per place' as check,
  case
    when exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'note_folders_owner_name')
      then 'PROBLEM - the old index is still there'
    when exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'note_folders_owner_parent_name')
      then 'OK'
    else 'PROBLEM - neither index exists'
  end as result;

-- 3. The depth rule is enforced by the database, not just the page.
select
  '3. depth limit enforced' as check,
  case when exists (
    select 1 from pg_trigger
    where tgrelid = 'public.note_folders'::regclass and tgname = 'note_folders_depth'
  ) then 'OK' else 'PROBLEM - the trigger is missing' end as result;

-- 4. Colour labels exist on both tables.
select
  '4. colour labels' as check,
  case when (
    select count(*) from information_schema.columns
    where table_schema = 'public' and column_name = 'color'
      and table_name in ('note_folders', 'notes')
  ) = 2 then 'OK' else 'PROBLEM - missing from one or both tables' end as result;

-- 5. Rich text: the format flag exists and defaults to plain, so every
--    note written before 0035 keeps its line breaks.
select
  '5. body_format defaults to plain' as check,
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notes'
      and column_name = 'body_format' and column_default like '%plain%'
  ) then 'OK' else 'PROBLEM - missing or wrong default' end as result;

-- 6. Nothing already written was changed.
--
-- Read through to_jsonb rather than by naming the column. A CASE
-- guard is not enough on its own: Postgres resolves column names when
-- it PARSES the statement, before any CASE runs, so naming
-- body_format here would fail outright on a database that has not run
-- 0035 — and a check that errors instead of reporting hides exactly
-- the fault it exists to catch. Through to_jsonb a missing column is
-- simply a missing key, which is NULL, at runtime. Same lesson as
-- VERIFY_0032, one layer deeper.
select
  '6. existing notes untouched' as check,
  case
    when not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'notes' and column_name = 'body_format'
    ) then 'PROBLEM - 0035 did not run'
    when (
      select count(*) from public.notes n
      where to_jsonb(n) ->> 'body_format' = 'html' and n.body not like '%<%'
    ) = 0 then 'OK'
    else 'PROBLEM - some notes were marked as markup unexpectedly'
  end as result;

-- 7. Privacy is exactly as 0032 left it: one owner-only policy per
--    table, and nothing else. A column cannot widen a policy, but this
--    is the check worth being sure about.
select
  '7. still owner-only' as check,
  case when count(*) = 3 then 'OK'
       else 'PROBLEM - expected 3 policies across the three tables, found ' || count(*) end as result
from pg_policies
where schemaname = 'public'
  and tablename in ('note_folders', 'notes', 'note_checklist_items');

-- 8. Row level security is still switched on for all three.
select
  '8. RLS on' as check,
  case when count(*) = 3 then 'OK'
       else 'PROBLEM - only ' || count(*) || ' of 3 tables have it' end as result
from pg_tables
where schemaname = 'public'
  and tablename in ('note_folders', 'notes', 'note_checklist_items')
  and rowsecurity;

-- What is actually there, to see with your own eyes.
-- Same reason as check 6: read through to_jsonb so this still runs,
-- and still shows the folders, on a database without 0035.
select
  coalesce(parent.name, '(top level)') as inside,
  f.name as folder,
  coalesce(to_jsonb(f) ->> 'color', '-') as label,
  (select count(*) from public.notes n where n.folder_id = f.id) as notes
from public.note_folders f
left join public.note_folders parent
  on parent.id = (to_jsonb(f) ->> 'parent_id')::uuid
order by coalesce(parent.name, ''), f.name;
