-- 0021: direct team messaging, and SOPs that work as checklists.
--
-- Run 0018, 0019 and 0020 first.
--
--   direct_messages
--       One-to-one messaging between team members. Separate from
--       `messages` (the client portal conversation) and from
--       client_team_messages (internal notes about one client) — this
--       is two people talking, about anything.
--
--   resource_checklist_items / resource_checklist_progress
--       An SOP becomes a tickable checklist. The items belong to the
--       SOP and are written once by management; the ticks belong to
--       the person doing the work, so two videographers editing two
--       different videos from the same SOP never see each other's
--       progress, and either can clear their own and start again.
--
-- Run VERIFY_0021.sql afterwards and check every row before treating
-- this as done.

-- =================================================================
-- 1. Helpers
-- =================================================================

-- "On the team" = anyone who isn't a client. Used to keep client
-- logins out of team messaging entirely, on both ends of a message.
create or replace function public.is_team_member(target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = target_id
      and role in ('ceo', 'operations_manager', 'staff', 'videographer')
  );
$$;

grant execute on function public.is_team_member(uuid) to authenticated;

-- Whether the caller can see the SOP a checklist item hangs off.
-- Mirrors the `resources` policies from 0018 rather than restating
-- them, so the two can't drift apart.
create or replace function public.can_read_resource(target_resource_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.resources r
    where r.id = target_resource_id
      and (
        public.is_management()
        or (
          public.current_role() in ('staff', 'videographer', 'operations_manager')
          and (r.audience_role = 'all' or r.audience_role = public.current_role())
          and (r.assigned_to is null or r.assigned_to = auth.uid())
        )
      )
  );
$$;

grant execute on function public.can_read_resource(uuid) to authenticated;

-- =================================================================
-- 2. direct_messages
-- =================================================================

create table if not exists direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles (id) on delete cascade,
  recipient_id uuid not null references profiles (id) on delete cascade,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  -- Talking to yourself is almost certainly a bug in a caller rather
  -- than something anyone meant to do.
  constraint direct_messages_not_self check (sender_id <> recipient_id)
);

create index if not exists direct_messages_pair_idx
  on direct_messages (sender_id, recipient_id, created_at);
create index if not exists direct_messages_recipient_idx
  on direct_messages (recipient_id, read);

alter table direct_messages enable row level security;

-- Only the two people in the conversation, whoever they are. There is
-- deliberately no management override: a CEO reading everyone's
-- private messages is not something this was asked to do, and adding
-- it later is one policy.
drop policy if exists "direct_messages: read own conversations" on direct_messages;
create policy "direct_messages: read own conversations"
  on direct_messages for select
  using (sender_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists "direct_messages: send as self" on direct_messages;
create policy "direct_messages: send as self"
  on direct_messages for insert
  with check (
    sender_id = auth.uid()
    and public.is_team_member(auth.uid())
    and public.is_team_member(recipient_id)
  );

-- Marking as read is the only update anyone needs, and only the
-- person who received it.
drop policy if exists "direct_messages: recipient marks read" on direct_messages;
create policy "direct_messages: recipient marks read"
  on direct_messages for update
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- =================================================================
-- 3. SOP checklists
-- =================================================================

create table if not exists resource_checklist_items (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references resources (id) on delete cascade,
  text text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists resource_checklist_items_resource_idx
  on resource_checklist_items (resource_id, position);

alter table resource_checklist_items enable row level security;

drop policy if exists "resource_checklist_items: management manage" on resource_checklist_items;
create policy "resource_checklist_items: management manage"
  on resource_checklist_items for all
  using (public.is_management())
  with check (public.is_management());

-- Anyone who can read the SOP can read its steps. They can't change
-- them — an SOP everyone can edit isn't a standard.
drop policy if exists "resource_checklist_items: read with resource" on resource_checklist_items;
create policy "resource_checklist_items: read with resource"
  on resource_checklist_items for select
  using (public.can_read_resource(resource_id));

-- -----------------------------------------------------------------
-- Per-person tick state
-- -----------------------------------------------------------------
-- Keyed on (user_id, item_id): the ticks are the individual's working
-- state for the video they are on right now, not a property of the
-- SOP. Clearing them is how the same checklist is reused for the next
-- video, and one person clearing theirs never touches anyone else's.

create table if not exists resource_checklist_progress (
  user_id uuid not null references profiles (id) on delete cascade,
  item_id uuid not null references resource_checklist_items (id) on delete cascade,
  done boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create index if not exists resource_checklist_progress_user_idx
  on resource_checklist_progress (user_id);

alter table resource_checklist_progress enable row level security;

-- Your ticks, nobody else's — in both directions. No management
-- override here either: a half-ticked checklist is someone's
-- in-progress working state, not a record of anything.
drop policy if exists "resource_checklist_progress: own rows" on resource_checklist_progress;
create policy "resource_checklist_progress: own rows"
  on resource_checklist_progress for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists resource_checklist_progress_touch on resource_checklist_progress;
create trigger resource_checklist_progress_touch
  before update on resource_checklist_progress
  for each row execute procedure public.touch_updated_at();
