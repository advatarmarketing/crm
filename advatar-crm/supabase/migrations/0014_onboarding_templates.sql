-- Phase 17: stop onboarding and recurring work depending on memory.
--
--   1. An onboarding checklist created automatically the moment a
--      client becomes Active.
--   2. Task templates — a named set of tasks with due dates relative
--      to a start date, applied to a client in one click.
--   3. A task created automatically when a lead's follow-up date is
--      set, so a follow-up exists as work rather than only as a date
--      on a card.

-- =================================================================
-- 1. Onboarding checklist
-- =================================================================

create table if not exists client_checklist_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  label text not null,
  position integer not null default 0,
  done boolean not null default false,
  done_at timestamptz,
  done_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists client_checklist_items_client_idx
  on client_checklist_items (client_id, position);

alter table client_checklist_items enable row level security;

drop policy if exists "checklist: management full access" on client_checklist_items;
create policy "checklist: management full access"
  on client_checklist_items for all
  using (public.is_management())
  with check (public.is_management());

drop policy if exists "checklist: staff assigned" on client_checklist_items;
create policy "checklist: staff assigned"
  on client_checklist_items for all
  using (public.current_role() = 'staff' and public.is_assigned_staff(client_id))
  with check (public.current_role() = 'staff' and public.is_assigned_staff(client_id));

drop policy if exists "checklist: videographer read assigned" on client_checklist_items;
create policy "checklist: videographer read assigned"
  on client_checklist_items for select
  using (public.current_role() = 'videographer' and public.is_assigned_staff(client_id));

-- The default steps. Edit this function to change what a new client
-- gets — existing clients keep whatever checklist they already have,
-- since the trigger only fires on the move INTO active.
create or replace function public.create_onboarding_checklist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  steps text[] := array[
    'Kick-off call booked',
    'Brand assets collected',
    'Contract signed',
    '90-day plan approved',
    'First shoot scheduled',
    'Portal access sent to client',
    'First invoice raised'
  ];
  step text;
  idx integer := 0;
begin
  -- Only on the transition into active, and only once: re-activating
  -- a paused client should not wipe or duplicate a checklist someone
  -- has already been working through.
  if new.stage = 'active'
     and (old.stage is distinct from 'active')
     and not exists (select 1 from public.client_checklist_items where client_id = new.id)
  then
    foreach step in array steps loop
      insert into public.client_checklist_items (client_id, label, position)
      values (new.id, step, idx);
      idx := idx + 1;
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists create_onboarding_checklist on clients;
create trigger create_onboarding_checklist
  after update of stage on clients
  for each row
  execute procedure public.create_onboarding_checklist();

-- =================================================================
-- 2. Task templates
-- =================================================================

create table if not exists task_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists task_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references task_templates (id) on delete cascade,
  text text not null,
  -- Days from the date the template is applied. 0 = same day,
  -- 7 = a week later. Relative rather than fixed dates so one
  -- template works for every shoot cycle.
  offset_days integer not null default 0,
  position integer not null default 0
);

create index if not exists task_template_items_template_idx
  on task_template_items (template_id, position);

alter table task_templates enable row level security;
alter table task_template_items enable row level security;

-- Templates are shared agency-wide, not per client, so they are not
-- scoped by assignment: everyone who works with clients can read them
-- and apply them; only management can change them.

drop policy if exists "task_templates: read" on task_templates;
create policy "task_templates: read"
  on task_templates for select
  using (public.current_role() in ('ceo', 'operations_manager', 'staff', 'videographer'));

drop policy if exists "task_templates: management writes" on task_templates;
create policy "task_templates: management writes"
  on task_templates for all
  using (public.is_management())
  with check (public.is_management());

drop policy if exists "task_template_items: read" on task_template_items;
create policy "task_template_items: read"
  on task_template_items for select
  using (public.current_role() in ('ceo', 'operations_manager', 'staff', 'videographer'));

drop policy if exists "task_template_items: management writes" on task_template_items;
create policy "task_template_items: management writes"
  on task_template_items for all
  using (public.is_management())
  with check (public.is_management());

-- A starter template so the feature isn't empty on first use. Guarded
-- so re-running this migration doesn't create a second copy.
do $$
declare
  tpl_id uuid;
begin
  if not exists (select 1 from public.task_templates where name = 'Content shoot cycle') then
    insert into public.task_templates (name, description)
    values ('Content shoot cycle', 'A standard shoot-to-delivery run. Dates count from the day you apply it.')
    returning id into tpl_id;

    insert into public.task_template_items (template_id, text, offset_days, position) values
      (tpl_id, 'Confirm shoot date and location', 0, 0),
      (tpl_id, 'Send shot list and brief to client', 2, 1),
      (tpl_id, 'Shoot day', 7, 2),
      (tpl_id, 'First edit to client for review', 14, 3),
      (tpl_id, 'Apply client feedback', 18, 4),
      (tpl_id, 'Deliver final files', 21, 5);
  end if;
end $$;

-- =================================================================
-- 3. A task whenever a follow-up date is set
-- =================================================================
-- A date on a card is easy to miss; a task shows up in "needs
-- attention" and on the dashboard. Guarded against duplicates so
-- editing anything else about the client doesn't spawn another copy
-- of the same reminder.

create or replace function public.create_follow_up_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.follow_up_date is not null
     and new.follow_up_date is distinct from old.follow_up_date
     and not exists (
       select 1 from public.tasks
       where client_id = new.id
         and due_date = new.follow_up_date
         and done = false
         and text like 'Follow up with%'
     )
  then
    insert into public.tasks (client_id, text, due_date, done)
    values (new.id, format('Follow up with %s', new.name), new.follow_up_date, false);
  end if;

  return new;
end;
$$;

drop trigger if exists create_follow_up_task on clients;
create trigger create_follow_up_task
  after update of follow_up_date on clients
  for each row
  execute procedure public.create_follow_up_task();
