-- 0018: schedule/timetable entries and SOP/tutorial resources.
--
-- Two new tables, both needed by more than one screen:
--
--   schedule_events  — the timetable shown on the dashboard (this
--                      week at a glance) and on a videographer's
--                      admin detail page (their own schedule).
--   resources        — SOPs and tutorials, shown on a videographer's
--                      detail page.
--
-- To-dos deliberately do NOT get a new table: `tasks` (0002) already
-- has assigned_to, due_date and done, and client_id is nullable, so a
-- standalone to-do with no client is already representable. Adding a
-- second task-shaped table would split the same concept in two.
--
-- Run VERIFY_0018.sql afterwards and check every row before treating
-- this as done.

-- =================================================================
-- 1. schedule_events
-- =================================================================
-- A shoot, a call, a deadline — anything that belongs on a calendar.
-- `assigned_to` is whose schedule it appears on; null means it's a
-- company-wide entry that management sees but nobody owns.

create table if not exists schedule_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  location text,
  notes text,
  kind text not null default 'shoot'
    check (kind in ('shoot', 'call', 'meeting', 'deadline', 'other')),
  client_id uuid references clients (id) on delete set null,
  assigned_to uuid references profiles (id) on delete set null,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists schedule_events_starts_at_idx on schedule_events (starts_at);
create index if not exists schedule_events_assigned_to_idx on schedule_events (assigned_to);
create index if not exists schedule_events_client_id_idx on schedule_events (client_id);

alter table schedule_events enable row level security;

drop policy if exists "schedule_events: management full access" on schedule_events;
create policy "schedule_events: management full access"
  on schedule_events for all
  using (public.is_management())
  with check (public.is_management());

-- Staff can manage entries on their own schedule, and read anything
-- attached to a client they're assigned to.
drop policy if exists "schedule_events: staff own or assigned" on schedule_events;
create policy "schedule_events: staff own or assigned"
  on schedule_events for all
  using (
    public.current_role() = 'staff'
    and (
      assigned_to = auth.uid()
      or (client_id is not null and public.is_assigned_staff(client_id))
    )
  )
  with check (
    public.current_role() = 'staff'
    and (
      assigned_to = auth.uid()
      or (client_id is not null and public.is_assigned_staff(client_id))
    )
  );

-- Videographers read their own schedule only. Read-only for now: the
-- videographer's own login and what they can change from it is a
-- later piece of work, and read access is what the admin-side view
-- built on top of this needs today.
drop policy if exists "schedule_events: videographer read own" on schedule_events;
create policy "schedule_events: videographer read own"
  on schedule_events for select
  using (
    public.current_role() = 'videographer'
    and (
      assigned_to = auth.uid()
      or (client_id is not null and public.is_assigned_staff(client_id))
    )
  );

-- Clients are deliberately given no policy here at all. A client
-- seeing the team's internal shoot calendar was not asked for, and
-- no policy means no access.

-- =================================================================
-- 2. resources — SOPs and tutorials
-- =================================================================
-- `audience_role` is who the resource is for. `assigned_to` narrows
-- it to one person when something applies to an individual rather
-- than a whole role; null means it applies to everyone in
-- audience_role.

create table if not exists resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'sop'
    check (kind in ('sop', 'tutorial', 'template', 'other')),
  url text,
  body text,
  audience_role text not null default 'videographer'
    check (audience_role in ('all', 'staff', 'videographer', 'operations_manager')),
  assigned_to uuid references profiles (id) on delete cascade,
  position integer not null default 0,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resources_audience_role_idx on resources (audience_role);
create index if not exists resources_assigned_to_idx on resources (assigned_to);

alter table resources enable row level security;

drop policy if exists "resources: management full access" on resources;
create policy "resources: management full access"
  on resources for all
  using (public.is_management())
  with check (public.is_management());

-- Everyone else reads what is aimed at them: their role, or 'all',
-- and either unassigned or assigned to them personally. Read-only —
-- SOPs are written by management.
drop policy if exists "resources: read own audience" on resources;
create policy "resources: read own audience"
  on resources for select
  using (
    public.current_role() in ('staff', 'videographer', 'operations_manager')
    and (audience_role = 'all' or audience_role = public.current_role())
    and (assigned_to is null or assigned_to = auth.uid())
  );

-- =================================================================
-- 3. Videographers can see their own standalone to-dos
-- =================================================================
-- 0002's "tasks: videographer read assigned" requires client_id to be
-- non-null and the client to be assigned to them, so a task created
-- for a videographer with no client attached was invisible to the
-- person it was for. The admin-side videographer page can create
-- exactly that kind of task, so this adds the missing case rather
-- than leaving those tasks unreachable from the videographer's login.

drop policy if exists "tasks: videographer read own" on tasks;
create policy "tasks: videographer read own"
  on tasks for select
  using (
    public.current_role() = 'videographer'
    and assigned_to = auth.uid()
  );

-- =================================================================
-- 4. updated_at triggers
-- =================================================================
-- Matches how the rest of this schema keeps updated_at honest.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists schedule_events_touch_updated_at on schedule_events;
create trigger schedule_events_touch_updated_at
  before update on schedule_events
  for each row execute procedure public.touch_updated_at();

drop trigger if exists resources_touch_updated_at on resources;
create trigger resources_touch_updated_at
  before update on resources
  for each row execute procedure public.touch_updated_at();
