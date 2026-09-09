-- 0025: client calendars, notifications, submission visibility,
-- manual portfolio items, and a videographer team channel.
--
-- Run 0016-0024 first.
--
-- Run VERIFY_0025.sql afterwards and check every row before treating
-- this as done.

-- =================================================================
-- 1. Clients get a calendar (prompt 8)
-- =================================================================
-- 0018 gave schedule_events no client policy at all, so a client
-- login could not see a single booking. A shoot date is the main
-- thing a client wants a calendar for, so they read entries attached
-- to their own client record — and only those. Read-only: the diary
-- is run by the agency.

drop policy if exists "schedule_events: client read own" on schedule_events;
create policy "schedule_events: client read own"
  on schedule_events for select
  using (
    public.current_role() = 'client'
    and client_id is not null
    and client_id = public.current_client_id()
  );

-- =================================================================
-- 2. Notifications (prompt 10)
-- =================================================================

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  -- Where clicking it should take you.
  href text,
  read boolean not null default false,
  -- Set by the triggers below, cleared once an email has gone out.
  -- Kept as a column rather than a separate queue table so "did this
  -- get emailed" is answerable by looking at the notification.
  email_pending boolean not null default false,
  email_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on notifications (user_id, read, created_at desc);
create index if not exists notifications_email_pending_idx
  on notifications (email_pending) where email_pending;

alter table notifications enable row level security;

-- Yours and nobody else's, in both directions. There is no management
-- override: a notification is a private nudge, not a record.
drop policy if exists "notifications: own rows" on notifications;
create policy "notifications: own rows"
  on notifications for select
  using (user_id = auth.uid());

-- Marking your own as read is the only update anyone needs.
drop policy if exists "notifications: mark own read" on notifications;
create policy "notifications: mark own read"
  on notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Rows are written by the triggers below (security definer) and by
-- server-side code using the service-role client. No insert policy is
-- granted to anyone: a login that could write notifications could
-- write them to other people.

-- -----------------------------------------------------------------
-- Raising one
-- -----------------------------------------------------------------
create or replace function public.notify_user(
  target_user_id uuid,
  notification_kind text,
  notification_title text,
  notification_body text default null,
  notification_href text default null,
  wants_email boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_user_id is null then
    return;
  end if;

  -- Never notify somebody about their own action. Being told what you
  -- just did is noise, and it is the fastest way to make people stop
  -- reading the bell.
  if target_user_id = auth.uid() then
    return;
  end if;

  insert into public.notifications (user_id, kind, title, body, href, email_pending)
  values (target_user_id, notification_kind, notification_title, notification_body,
          notification_href, wants_email);
end;
$$;

-- -----------------------------------------------------------------
-- Assigned to a client
-- -----------------------------------------------------------------
create or replace function public.notify_client_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  client_name text;
begin
  select name into client_name from public.clients where id = new.client_id;

  perform public.notify_user(
    new.staff_id,
    'client_assigned',
    'You have been added to ' || coalesce(client_name, 'a client'),
    'Their brand kit, content plan and documents are on their page.',
    '/app/my-clients/' || new.client_id::text
  );

  return new;
end;
$$;

drop trigger if exists client_staff_notify on client_staff;
create trigger client_staff_notify
  after insert on client_staff
  for each row execute procedure public.notify_client_assignment();

-- -----------------------------------------------------------------
-- Given a task, or having an existing one materially changed
-- -----------------------------------------------------------------
-- "Materially" is the point: a task being ticked, or its wording
-- tidied, is not worth an email. A new assignee, a changed deadline,
-- or a rewritten task is.
create or replace function public.notify_task_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  client_name text;
  due_text text;
begin
  if new.assigned_to is null then
    return new;
  end if;

  if new.client_id is not null then
    select name into client_name from public.clients where id = new.client_id;
  end if;

  due_text := case
    when new.due_date is null then null
    else 'Due ' || to_char(new.due_date, 'FMDD FMMonth')
  end;

  if tg_op = 'INSERT' then
    perform public.notify_user(
      new.assigned_to,
      'task_assigned',
      'New task: ' || new.text,
      concat_ws(' · ', client_name, due_text),
      '/app/my-work'
    );
    return new;
  end if;

  -- UPDATE from here.
  if new.assigned_to is distinct from old.assigned_to then
    perform public.notify_user(
      new.assigned_to,
      'task_assigned',
      'A task was passed to you: ' || new.text,
      concat_ws(' · ', client_name, due_text),
      '/app/my-work'
    );
  elsif new.due_date is distinct from old.due_date then
    perform public.notify_user(
      new.assigned_to,
      'task_deadline_changed',
      'Deadline changed: ' || new.text,
      case when new.due_date is null then 'The due date was removed.' else due_text end,
      '/app/my-work'
    );
  elsif new.text is distinct from old.text then
    perform public.notify_user(
      new.assigned_to,
      'task_updated',
      'A task of yours was reworded',
      new.text,
      '/app/my-work'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_notify on tasks;
create trigger tasks_notify
  after insert or update on tasks
  for each row execute procedure public.notify_task_change();

-- =================================================================
-- 3. Submissions: one client, and who may see it (prompt 11)
-- =================================================================

alter table submissions
  add column if not exists visibility text not null default 'team_only'
    check (visibility in ('team_only', 'team_and_client')),
  -- The content plan slot this fulfils, when it matched one. Stored
  -- as the slot's id from planners.content -> 'slots' -> 'items',
  -- which is a jsonb array rather than a table, so this is a plain
  -- text reference rather than a foreign key.
  add column if not exists planner_slot_id text;

-- client_id becomes required. Existing rows may predate that, and
-- there is no correct client to guess for them, so this only tightens
-- the constraint when the data already satisfies it and says so
-- otherwise rather than failing the whole migration.
do $$
declare
  orphans integer;
begin
  select count(*) into orphans from public.submissions where client_id is null;

  if orphans = 0 then
    alter table public.submissions alter column client_id set not null;
    raise notice 'submissions.client_id is now NOT NULL.';
  else
    raise warning
      'submissions.client_id left nullable: % existing row(s) have no client. Set a client on them from the admin side, then re-run this migration to apply the constraint.',
      orphans;
  end if;
end
$$;

-- A client may read submissions on their own client record, but only
-- the ones deliberately shared with them.
drop policy if exists "submissions: client read shared" on submissions;
create policy "submissions: client read shared"
  on submissions for select
  using (
    public.current_role() = 'client'
    and visibility = 'team_and_client'
    and client_id is not null
    and client_id = public.current_client_id()
  );

drop policy if exists "submission_versions: client read shared" on submission_versions;
create policy "submission_versions: client read shared"
  on submission_versions for select
  using (
    public.current_role() = 'client'
    and exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and s.visibility = 'team_and_client'
        and s.client_id = public.current_client_id()
    )
  );

-- Feedback is deliberately NOT shared with the client: it is the
-- reviewer's working notes to the videographer, and sharing it would
-- change what people are willing to write.

-- =================================================================
-- 4. Portfolio items added by hand (prompt 12)
-- =================================================================
-- Separate from submissions rather than faking an approved one: this
-- is older work, a showreel, something shot before the CRM existed.
-- It never went through review and should not pretend it did.

create table if not exists portfolio_items (
  id uuid primary key default gen_random_uuid(),
  -- Defaulted so the browser never has to send it. The "own rows"
  -- policy below still checks it, so the default is a convenience,
  -- not the thing keeping one person out of another's portfolio.
  owner_id uuid not null default auth.uid() references profiles (id) on delete cascade,
  title text not null,
  url text,
  client_id uuid references clients (id) on delete set null,
  -- Free text, because half of this work predates the client list.
  client_label text,
  completed_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Re-applied outside the create so a table made by an earlier run of
-- this file picks the default up too.
alter table portfolio_items alter column owner_id set default auth.uid();

create index if not exists portfolio_items_owner_idx on portfolio_items (owner_id, completed_on desc);

alter table portfolio_items enable row level security;

drop policy if exists "portfolio_items: own rows" on portfolio_items;
create policy "portfolio_items: own rows"
  on portfolio_items for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Management can look at somebody's portfolio from their detail page.
drop policy if exists "portfolio_items: management read" on portfolio_items;
create policy "portfolio_items: management read"
  on portfolio_items for select
  using (public.is_management());

drop trigger if exists portfolio_items_touch on portfolio_items;
create trigger portfolio_items_touch
  before update on portfolio_items
  for each row execute procedure public.touch_updated_at();

-- =================================================================
-- 5. A team channel for videographers (prompt 13)
-- =================================================================
-- direct_messages (0021) already covers one-to-one, which is what the
-- admin-only tab needs. What is missing is the group conversation
-- between videographers. A channel keyed by name rather than a
-- members table: the membership rule is "your role", and a join table
-- would need maintaining every time somebody is hired.

create table if not exists team_channel_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'videographers',
  author_id uuid not null references profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists team_channel_messages_idx
  on team_channel_messages (channel, created_at);

alter table team_channel_messages enable row level security;

-- Videographers and management are in the videographer channel.
-- Management is included on purpose: it is a work channel, not a
-- private one, and the tab that IS private is the admin DM.
drop policy if exists "team_channel_messages: read" on team_channel_messages;
create policy "team_channel_messages: read"
  on team_channel_messages for select
  using (
    channel = 'videographers'
    and public.current_role() in ('videographer', 'staff', 'operations_manager', 'ceo')
  );

drop policy if exists "team_channel_messages: post as self" on team_channel_messages;
create policy "team_channel_messages: post as self"
  on team_channel_messages for insert
  with check (
    channel = 'videographers'
    and author_id = auth.uid()
    and public.current_role() in ('videographer', 'staff', 'operations_manager', 'ceo')
  );

-- Clients get no policy here at all.
