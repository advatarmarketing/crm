-- 0019: editable event categories for the shared calendar.
--
-- Run 0018 first — this alters the schedule_events table it created.
--
-- 0018 gave schedule_events a hardcoded `kind` column constrained to
-- five fixed values. The calendar needs categories that staff and the
-- operations manager can add, rename, recolour and remove themselves,
-- so the list becomes a table instead of a check constraint.
--
-- What changes:
--   * new event_categories table, seeded with the four types the
--     calendar was asked for plus the four `kind` already had, so
--     nothing existing loses its meaning;
--   * schedule_events.category_id replaces schedule_events.kind,
--     backfilled from it before the old column is dropped;
--   * videographers can tick their own tasks done, which their
--     dashboard needs and 0018 didn't allow.
--
-- Run VERIFY_0019.sql afterwards and check every row before treating
-- this as done.

-- =================================================================
-- 1. event_categories
-- =================================================================

create table if not exists event_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  -- Stored as a hex string so it can go straight into a style
  -- attribute. Constrained so a bad value can't quietly break every
  -- calendar that renders it.
  colour text not null default '#6b8aa6'
    check (colour ~ '^#[0-9a-fA-F]{6}$'),
  position integer not null default 0,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table event_categories enable row level security;

-- Everyone who can see a calendar can read the categories — without
-- them an event has no name or colour to render.
drop policy if exists "event_categories: read all" on event_categories;
create policy "event_categories: read all"
  on event_categories for select
  using (
    public.current_role() in ('ceo', 'operations_manager', 'staff', 'videographer')
  );

-- Managing the list is for staff and up, as asked. Videographers read
-- only: the categories are a shared vocabulary, and one person
-- renaming "Shoot day" changes it on everybody's calendar.
drop policy if exists "event_categories: staff and up manage" on event_categories;
create policy "event_categories: staff and up manage"
  on event_categories for all
  using (public.current_role() in ('ceo', 'operations_manager', 'staff'))
  with check (public.current_role() in ('ceo', 'operations_manager', 'staff'));

-- The four the calendar was asked for, then the four 0018's `kind`
-- column already had so existing rows keep their meaning. Any of
-- these can be renamed, recoloured or deleted from the app — they are
-- a starting point, not a fixed list.
insert into event_categories (name, colour, position) values
  ('Shoot day',              '#c77b58', 1),
  ('Edit',                   '#6b8aa6', 2),
  ('Dedicated working time', '#8fa37f', 3),
  ('Joint session / class',  '#9a6fa0', 4),
  ('Call',                   '#5b8c9e', 5),
  ('Meeting',                '#7a8b99', 6),
  ('Deadline',               '#b5544c', 7),
  ('Other',                  '#8a8a8a', 8)
on conflict (name) do nothing;

-- =================================================================
-- 2. schedule_events.category_id
-- =================================================================

alter table schedule_events
  add column if not exists category_id uuid references event_categories (id) on delete set null;

create index if not exists schedule_events_category_id_idx on schedule_events (category_id);

-- Backfill from the old `kind` values before dropping the column.
-- Guarded so re-running this file after the column is gone is a
-- no-op rather than an error.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'schedule_events'
      and column_name = 'kind'
  ) then
    update schedule_events e
    set category_id = c.id
    from event_categories c
    where e.category_id is null
      and c.name = case e.kind
        when 'shoot'    then 'Shoot day'
        when 'call'     then 'Call'
        when 'meeting'  then 'Meeting'
        when 'deadline' then 'Deadline'
        else 'Other'
      end;

    alter table schedule_events drop constraint if exists schedule_events_kind_check;
    alter table schedule_events drop column kind;
  end if;
end
$$;

-- Anything still without a category (rows inserted between the
-- backfill and this statement, or created with no category at all)
-- lands on "Other" rather than rendering colourless.
update schedule_events
set category_id = (select id from event_categories where name = 'Other')
where category_id is null;

-- =================================================================
-- 3. updated_at trigger
-- =================================================================

drop trigger if exists event_categories_touch_updated_at on event_categories;
create trigger event_categories_touch_updated_at
  before update on event_categories
  for each row execute procedure public.touch_updated_at();

-- =================================================================
-- 4. Videographers can tick their own tasks off
-- =================================================================
-- 0018 let a videographer READ the tasks assigned to them. Their own
-- dashboard shows those as a to-do list, and a to-do list you can't
-- tick is not a to-do list. Update only, and only rows already
-- assigned to them — the with-check repeats the condition so a
-- videographer can't reassign a task to someone else on the way past.

drop policy if exists "tasks: videographer update own" on tasks;
create policy "tasks: videographer update own"
  on tasks for update
  using (
    public.current_role() = 'videographer'
    and assigned_to = auth.uid()
  )
  with check (
    public.current_role() = 'videographer'
    and assigned_to = auth.uid()
  );
