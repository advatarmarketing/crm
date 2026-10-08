-- 0037: a priority on every to-do.
--
-- NOTHING IS DELETED OR OVERWRITTEN BY THIS FILE.
-- It adds one column to `tasks` and nothing else. Every to-do you
-- already have keeps its wording, its due date, its client, its
-- assignee and its tick; each simply gains a priority of 'normal',
-- which is what the list already assumed everything was. Run it twice
-- and the second run does nothing.
--
-- Four levels rather than three. 'normal' is the default and is the
-- one the list does NOT badge: a to-do list where every row carries a
-- coloured label tells you nothing, so only the deliberate choices
-- show. 'low' is badged too, quietly, so that parking something is
-- visible rather than silent -- otherwise "low" and "never got round
-- to setting it" would look identical.

alter table public.tasks
  add column if not exists priority text not null default 'normal';

-- Added separately from the column so that re-running this file is
-- safe: `add column if not exists` skips a column that is already
-- there, and an inline constraint on a skipped column would never be
-- created at all, leaving the check silently missing.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = to_regclass('public.tasks')
      and conname = 'tasks_priority_check'
  ) then
    alter table public.tasks
      add constraint tasks_priority_check
      check (priority in ('urgent', 'high', 'normal', 'low'));
  end if;
end
$$;

-- The order the to-do list actually reads in: the urgent things first,
-- and within a level the oldest deadline first. Partial, because a
-- finished to-do is never sorted -- it sits in the "show N done" fold.
create index if not exists tasks_open_priority
  on public.tasks (priority, due_date)
  where not done;
