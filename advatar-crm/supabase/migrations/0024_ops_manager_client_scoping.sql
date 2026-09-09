-- 0024: an operations manager sees only the clients they are given.
--
-- Run 0016-0023 first.
--
-- Until now `is_management()` meant "ceo or operations_manager", and
-- every client-scoped table granted it unrestricted access. The brief
-- is that the CEO chooses which clients each operations manager can
-- reach.
--
-- The assignment already has a home: `client_staff`, which is how
-- staff and videographers are put on a client. An operations manager
-- goes in the same table rather than getting a parallel one, so the
-- CEO assigns everybody the same way and there is one place to look
-- when asking "who is on this client".
--
-- `is_management()` is deliberately NOT redefined. It still means
-- "ceo or operations manager" and still guards the things that are
-- not about one client — event categories, SOPs, task templates,
-- profiles. Only the client-scoped tables change, and they change to
-- ask a different question: not "are you management" but "can you see
-- THIS client".
--
-- Run VERIFY_0024.sql afterwards and check every row before treating
-- this as done.

-- =================================================================
-- 1. The question every client-scoped policy now asks
-- =================================================================

create or replace function public.can_see_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- The CEO sees everything, always.
    public.current_role() = 'ceo'
    -- Everyone else — operations manager, staff, videographer — sees
    -- a client only if they are on it.
    or (
      public.current_role() in ('operations_manager', 'staff', 'videographer')
      and target_client_id is not null
      and exists (
        select 1 from public.client_staff
        where client_id = target_client_id and staff_id = auth.uid()
      )
    );
$$;

grant execute on function public.can_see_client(uuid) to authenticated;

-- Whether the caller may manage assignments at all. Kept separate
-- from can_see_client so the CEO-only bits below read clearly.
create or replace function public.is_ceo_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() = 'ceo';
$$;

grant execute on function public.is_ceo_role() to authenticated;

-- =================================================================
-- 2. An operations manager who creates a client keeps it
-- =================================================================
-- Without this, a manager creating a client would watch it vanish the
-- moment it was saved: they can insert, but the new row is not one
-- they are assigned to, so it fails every read policy below. The
-- trigger assigns the creator, which is what anyone would expect
-- creating a record to mean.

create or replace function public.assign_creator_to_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role() = 'operations_manager' and auth.uid() is not null then
    insert into public.client_staff (client_id, staff_id, role_on_client)
    values (new.id, auth.uid(), 'operations manager')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists clients_assign_creator on clients;
create trigger clients_assign_creator
  after insert on clients
  for each row execute procedure public.assign_creator_to_client();

-- =================================================================
-- 3. Client-scoped tables
-- =================================================================
-- Each "management full access" policy becomes a "can see this
-- client" policy. The separate staff/videographer policies from
-- earlier migrations are left alone: they already say the same thing
-- for those roles, and RLS ORs policies together, so the overlap is
-- harmless and means fewer moving parts to get wrong.

-- clients ---------------------------------------------------------
drop policy if exists "clients: management full access" on clients;
create policy "clients: management full access"
  on clients for all
  using (public.can_see_client(id))
  with check (
    -- Creating a client is not scoped — you cannot be assigned to a
    -- row that does not exist yet. The trigger above then puts an
    -- operations manager onto what they just made.
    public.is_management()
  );

-- client_staff ----------------------------------------------------
-- Reading assignments follows the client. Changing them is CEO-only:
-- if a manager could edit this table they could assign themselves
-- any client, which would make the whole scoping decorative.
drop policy if exists "client_staff: management full access" on client_staff;
create policy "client_staff: read for visible clients"
  on client_staff for select
  using (public.can_see_client(client_id));

drop policy if exists "client_staff: ceo manages" on client_staff;
create policy "client_staff: ceo manages"
  on client_staff for all
  using (public.is_ceo_role())
  with check (public.is_ceo_role());

-- planners --------------------------------------------------------
drop policy if exists "planners: management full access" on planners;
create policy "planners: management full access"
  on planners for all
  using (public.can_see_client(client_id))
  with check (public.can_see_client(client_id));

-- fathom_calls ----------------------------------------------------
-- client_id is nullable here (an unmatched call), and an unassigned
-- call belongs to nobody in particular — the CEO keeps those.
drop policy if exists "fathom_calls: management full access" on fathom_calls;
create policy "fathom_calls: management full access"
  on fathom_calls for all
  using (
    public.is_ceo_role()
    or (client_id is not null and public.can_see_client(client_id))
  )
  with check (
    public.is_ceo_role()
    or (client_id is not null and public.can_see_client(client_id))
  );

-- documents -------------------------------------------------------
drop policy if exists "documents: management full access" on documents;
create policy "documents: management full access"
  on documents for all
  using (public.can_see_client(client_id))
  with check (public.can_see_client(client_id));

-- tasks -----------------------------------------------------------
-- A task with no client is somebody's own to-do; it belongs to the
-- person it is assigned to, or whoever made it.
drop policy if exists "tasks: management full access" on tasks;
create policy "tasks: management full access"
  on tasks for all
  using (
    public.is_ceo_role()
    or (client_id is not null and public.can_see_client(client_id))
    or (client_id is null and assigned_to = auth.uid())
  )
  with check (
    public.is_ceo_role()
    or (client_id is not null and public.can_see_client(client_id))
    or (client_id is null and assigned_to = auth.uid())
  );

-- message_threads / messages --------------------------------------
drop policy if exists "message_threads: management full access" on message_threads;
create policy "message_threads: management full access"
  on message_threads for all
  using (public.can_see_client(client_id))
  with check (public.can_see_client(client_id));

drop policy if exists "messages: management full access" on messages;
create policy "messages: management full access"
  on messages for all
  using (
    exists (
      select 1 from public.message_threads t
      where t.id = thread_id and public.can_see_client(t.client_id)
    )
  )
  with check (
    exists (
      select 1 from public.message_threads t
      where t.id = thread_id and public.can_see_client(t.client_id)
    )
  );

-- invoices --------------------------------------------------------
drop policy if exists "invoices: management full access" on invoices;
create policy "invoices: management full access"
  on invoices for all
  using (public.can_see_client(client_id))
  with check (public.can_see_client(client_id));

-- client_activity -------------------------------------------------
drop policy if exists "client_activity: management full access" on client_activity;
create policy "client_activity: management full access"
  on client_activity for all
  using (public.can_see_client(client_id))
  with check (public.can_see_client(client_id));

-- client_checklist_items ------------------------------------------
drop policy if exists "checklist: management full access" on client_checklist_items;
create policy "checklist: management full access"
  on client_checklist_items for all
  using (public.can_see_client(client_id))
  with check (public.can_see_client(client_id));

-- schedule_events -------------------------------------------------
-- An entry with no client is somebody's diary rather than a client's.
-- The CEO keeps everything; a manager sees their own and their
-- clients'.
drop policy if exists "schedule_events: management full access" on schedule_events;
create policy "schedule_events: management full access"
  on schedule_events for all
  using (
    public.is_ceo_role()
    or (client_id is not null and public.can_see_client(client_id))
    or assigned_to = auth.uid()
    or (
      -- A manager may still book work for the people on their clients.
      public.current_role() = 'operations_manager'
      and assigned_to is not null
      and exists (
        select 1
        from public.client_staff mine
        join public.client_staff theirs on theirs.client_id = mine.client_id
        where mine.staff_id = auth.uid() and theirs.staff_id = schedule_events.assigned_to
      )
    )
  )
  with check (
    public.is_ceo_role()
    or (client_id is not null and public.can_see_client(client_id))
    or assigned_to = auth.uid()
    or (
      public.current_role() = 'operations_manager'
      and assigned_to is not null
      and exists (
        select 1
        from public.client_staff mine
        join public.client_staff theirs on theirs.client_id = mine.client_id
        where mine.staff_id = auth.uid() and theirs.staff_id = schedule_events.assigned_to
      )
    )
  );

-- submissions and their children ----------------------------------
drop policy if exists "submissions: management full access" on submissions;
create policy "submissions: management full access"
  on submissions for all
  using (
    public.is_ceo_role()
    or (client_id is not null and public.can_see_client(client_id))
  )
  with check (
    public.is_ceo_role()
    or (client_id is not null and public.can_see_client(client_id))
  );

drop policy if exists "submission_versions: management full access" on submission_versions;
create policy "submission_versions: management full access"
  on submission_versions for all
  using (
    exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and (public.is_ceo_role() or (s.client_id is not null and public.can_see_client(s.client_id)))
    )
  )
  with check (
    exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and (public.is_ceo_role() or (s.client_id is not null and public.can_see_client(s.client_id)))
    )
  );

drop policy if exists "submission_feedback: management full access" on submission_feedback;
create policy "submission_feedback: management full access"
  on submission_feedback for all
  using (
    exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and (public.is_ceo_role() or (s.client_id is not null and public.can_see_client(s.client_id)))
    )
  )
  with check (
    exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and (public.is_ceo_role() or (s.client_id is not null and public.can_see_client(s.client_id)))
    )
  );

-- client_brand_kits -----------------------------------------------
drop policy if exists "client_brand_kits: management full access" on client_brand_kits;
create policy "client_brand_kits: management full access"
  on client_brand_kits for all
  using (public.can_see_client(client_id))
  with check (public.can_see_client(client_id));

-- client_team_messages --------------------------------------------
drop policy if exists "client_team_messages: management full access" on client_team_messages;
create policy "client_team_messages: management full access"
  on client_team_messages for all
  using (public.can_see_client(client_id))
  with check (public.can_see_client(client_id));

-- =================================================================
-- 4. client_finance stays CEO-only
-- =================================================================
-- 0011 already restricted this to the CEO alone; scoping does not
-- widen it. Stated here so the omission above reads as deliberate.
