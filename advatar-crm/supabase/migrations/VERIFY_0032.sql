-- Run this after 0032_notes.sql.
-- Every row in the first result should say OK.

with checks as (
  select 'table note_folders' as thing,
         to_regclass('public.note_folders') is not null as ok
  union all
  select 'table notes',
         to_regclass('public.notes') is not null
  union all
  select 'table note_checklist_items',
         to_regclass('public.note_checklist_items') is not null

  -- RLS switched on for all three. A table with RLS off is readable by
  -- every signed-in user, whatever the policies say.
  union all
  select 'RLS on for all three',
         (select count(*) from pg_class
          where oid in (to_regclass('public.note_folders'),
                        to_regclass('public.notes'),
                        to_regclass('public.note_checklist_items'))
            and relrowsecurity) = 3

  -- Exactly one policy per table, and each is the owner-only one. A
  -- second, wider policy would be OR'd with it and quietly undo the
  -- privacy, so the count is checked, not just the name.
  union all
  select 'one policy each, owner only',
         (select count(*) from pg_policies
          where schemaname = 'public'
            and tablename in ('note_folders', 'notes', 'note_checklist_items')) = 3
         and (select count(*) from pg_policies
              where schemaname = 'public'
                and tablename in ('note_folders', 'notes', 'note_checklist_items')
                and qual like '%owner_id = auth.uid()%') = 3

  union all
  -- Looked up by name and tested with exists, so an extra policy on
  -- the table shows up as PROBLEM above rather than crashing this
  -- query with "more than one row returned".
  select 'a note cannot go in someone else''s folder',
         exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'notes'
                   and policyname = 'notes: owner only'
                   and with_check like '%note_folders%')

  union all
  select 'a to-do cannot hang off someone else''s note',
         exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'note_checklist_items'
                   and policyname = 'note_checklist_items: owner only'
                   and with_check like '%notes%')

  union all
  -- CASE, not AND: has_table_privilege() errors on a table that does
  -- not exist, and AND is not guaranteed to stop early. This way a
  -- VERIFY run before the migration reads PROBLEM, not an error.
  select 'signed-out visitors refused',
         case when to_regclass('public.notes') is null
                or to_regclass('public.note_folders') is null
                or to_regclass('public.note_checklist_items') is null then false
              else not has_table_privilege('anon', 'public.notes', 'SELECT')
               and not has_table_privilege('anon', 'public.note_checklist_items', 'SELECT')
               and not has_table_privilege('anon', 'public.note_folders', 'SELECT')
         end

  union all
  select 'signed-in users may use them',
         case when to_regclass('public.notes') is null
                or to_regclass('public.note_checklist_items') is null then false
              else has_table_privilege('authenticated', 'public.notes', 'INSERT')
               and has_table_privilege('authenticated', 'public.note_checklist_items', 'UPDATE')
         end

  union all
  select 'ticking a to-do updates the note',
         exists (select 1 from pg_trigger
                 where tgname = 'note_checklist_items_touch_note' and not tgisinternal)

  union all
  select 'notes keep their own last-updated',
         exists (select 1 from pg_trigger
                 where tgname = 'notes_touch' and not tgisinternal)

  union all
  select 'deleting a folder keeps its notes',
         exists (select 1 from pg_constraint
                 where conrelid = to_regclass('public.notes')
                   and confrelid = to_regclass('public.note_folders')
                   and confdeltype = 'n')
)
select thing, case when ok then 'OK' else 'PROBLEM' end as state
from checks
order by thing;

-- How much is in use. Counts only — the notes themselves are private,
-- and this deliberately does not read them.
-- Run it only once the checks above are all OK: before the migration
-- these tables do not exist and this line will say so.
select
  (select count(*) from public.note_folders) as folders,
  (select count(*) from public.notes) as notes,
  (select count(*) from public.note_checklist_items) as to_do_items;
