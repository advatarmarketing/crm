-- 0029: "management full access" means management again.
--
-- Run 0016-0028 first.
--
-- Run VERIFY_0029.sql afterwards and check every row before treating
-- this as done.

-- =================================================================
-- What went wrong
-- =================================================================
-- This started as "a videographer can leave feedback on their own
-- video, and shouldn't be able to". It is not that; it is much wider,
-- and the feedback box was only the part that happened to be visible.
--
-- 0024 scoped an operations manager to their own clients. It did that
-- by rewriting every policy named "<table>: management full access"
-- to use can_see_client(), and it said, in a comment:
--
--   "The separate staff/videographer policies from earlier
--    migrations are left alone: they already say the same thing for
--    those roles ... the overlap is harmless"
--
-- The overlap is not harmless, because those earlier policies were
-- READ-only and these are `for all`. can_see_client() is true for an
-- operations manager, a staff member AND a videographer assigned to
-- the client — that breadth is right for deciding what somebody may
-- SEE, which is what the helper was written for, and wrong for
-- deciding what they may WRITE.
--
-- Since 0024, a videographer assigned to a client has been able to:
--
--   * approve their own submissions — the single thing 0020's
--     workflow exists to prevent, and it says so in its own comments;
--   * write, edit and DELETE feedback, including a reviewer's notes;
--   * rewrite the brand kit, which 0020 gave them read-only;
--   * edit and delete documents and the content plan, both read-only
--     to them everywhere else;
--   * change invoices on their clients.
--
-- All four were confirmed by running them, not by reading the
-- policies.
--
-- =================================================================
-- The fix
-- =================================================================
-- One new helper that says what those policies always meant, and a
-- rewrite of each of them to use it. can_see_client() keeps its
-- current meaning and its current uses — it is correct for reads, and
-- for the tables added since (client_assets in 0028, where the whole
-- team genuinely does share write access).
--
-- What each role ends up with is what the earlier migrations already
-- granted by name: staff through their "staff assigned" policies,
-- videographers through their "videographer read/own" ones. Nothing
-- here removes a policy anybody legitimately relies on; it removes an
-- accidental second grant that sat on top of them.

create or replace function public.can_manage_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- The CEO manages everything, including rows with no client.
    public.is_ceo_role()
    -- An operations manager manages the clients they are on, and no
    -- others. This is the scoping 0024 was written for, stated in a
    -- way that does not also let the people being managed write.
    or (
      public.current_role() = 'operations_manager'
      and target_client_id is not null
      and public.can_see_client(target_client_id)
    );
$$;

grant execute on function public.can_manage_client(uuid) to authenticated;

-- =================================================================
-- 1. The policy 0028 should never have added
-- =================================================================
-- Feedback comes from the people reviewing the work and from the
-- client. 0020 said it plainly and was right: "A videographer gets no
-- insert policy here: this is the reviewer's column, not a
-- conversation." 0028 gave them one so they could reply in the
-- thread. That was my mistake and this removes it.
--
-- A videographer keeps their read access to both threads, which is
-- the part that matters to them — they have to see what was asked.
-- What they act on is the checklist, which is built from that
-- feedback and is still theirs to tick off and add to.

drop policy if exists "submission_feedback: videographer reply own" on submission_feedback;

-- =================================================================
-- 2. Every policy 0024 widened
-- =================================================================
-- Same shape as 0024's versions, with can_see_client() swapped for
-- can_manage_client(). Anything that was not about client scoping is
-- carried over untouched.

-- clients ---------------------------------------------------------
-- Staff keep "clients: staff read/write assigned" and "clients: staff
-- update assigned"; videographers keep "clients: videographer read
-- assigned". Both are select/update and neither grants delete.
drop policy if exists "clients: management full access" on clients;
create policy "clients: management full access"
  on clients for all
  using (public.can_manage_client(id))
  with check (
    -- Creating a client is not scoped — you cannot be assigned to a
    -- row that does not exist yet. 0024's trigger then puts an
    -- operations manager onto what they just made.
    public.is_management()
  );

-- planners --------------------------------------------------------
-- The content plan. A videographer reads it; they do not edit it.
drop policy if exists "planners: management full access" on planners;
create policy "planners: management full access"
  on planners for all
  using (public.can_manage_client(client_id))
  with check (public.can_manage_client(client_id));

-- fathom_calls ----------------------------------------------------
drop policy if exists "fathom_calls: management full access" on fathom_calls;
create policy "fathom_calls: management full access"
  on fathom_calls for all
  using (public.is_ceo_role() or public.can_manage_client(client_id))
  with check (public.is_ceo_role() or public.can_manage_client(client_id));

-- documents -------------------------------------------------------
drop policy if exists "documents: management full access" on documents;
create policy "documents: management full access"
  on documents for all
  using (public.can_manage_client(client_id))
  with check (public.can_manage_client(client_id));

-- tasks -----------------------------------------------------------
-- The clientless clause is kept, because a task with no client is
-- somebody's own to-do — but narrowed to the two management roles.
-- Staff and videographers reach their own tasks through "tasks: staff
-- assigned or own" and "tasks: videographer read/update own", which
-- is how they always should have.
drop policy if exists "tasks: management full access" on tasks;
create policy "tasks: management full access"
  on tasks for all
  using (
    public.can_manage_client(client_id)
    or (
      client_id is null
      and assigned_to = auth.uid()
      and public.current_role() in ('ceo', 'operations_manager')
    )
  )
  with check (
    public.can_manage_client(client_id)
    or (
      client_id is null
      and assigned_to = auth.uid()
      and public.current_role() in ('ceo', 'operations_manager')
    )
  );

-- message_threads / messages --------------------------------------
-- A videographer can still read a thread and send in it ("messages:
-- videographer send in assigned", "... update in assigned"). What
-- they lose is delete, which they were never meant to have.
drop policy if exists "message_threads: management full access" on message_threads;
create policy "message_threads: management full access"
  on message_threads for all
  using (public.can_manage_client(client_id))
  with check (public.can_manage_client(client_id));

drop policy if exists "messages: management full access" on messages;
create policy "messages: management full access"
  on messages for all
  using (
    exists (
      select 1 from public.message_threads t
      where t.id = thread_id and public.can_manage_client(t.client_id)
    )
  )
  with check (
    exists (
      select 1 from public.message_threads t
      where t.id = thread_id and public.can_manage_client(t.client_id)
    )
  );

-- invoices --------------------------------------------------------
-- The worst of the four. There is no staff or videographer policy on
-- this table at all, which is correct and always was — so this one
-- policy is the whole of its access control.
drop policy if exists "invoices: management full access" on invoices;
create policy "invoices: management full access"
  on invoices for all
  using (public.can_manage_client(client_id))
  with check (public.can_manage_client(client_id));

-- client_activity -------------------------------------------------
drop policy if exists "client_activity: management full access" on client_activity;
create policy "client_activity: management full access"
  on client_activity for all
  using (public.can_manage_client(client_id))
  with check (public.can_manage_client(client_id));

-- client_checklist_items ------------------------------------------
drop policy if exists "checklist: management full access" on client_checklist_items;
create policy "checklist: management full access"
  on client_checklist_items for all
  using (public.can_manage_client(client_id))
  with check (public.can_manage_client(client_id));

-- schedule_events -------------------------------------------------
-- The "or assigned_to = auth.uid()" clause is narrowed the same way
-- the tasks one is: a manager keeps their own diary, and a
-- videographer keeps "schedule_events: videographer read own", which
-- is read-only and is what every videographer-facing calendar in the
-- app already assumes.
drop policy if exists "schedule_events: management full access" on schedule_events;
create policy "schedule_events: management full access"
  on schedule_events for all
  using (
    public.can_manage_client(client_id)
    or (assigned_to = auth.uid() and public.current_role() in ('ceo', 'operations_manager'))
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
    public.can_manage_client(client_id)
    or (assigned_to = auth.uid() and public.current_role() in ('ceo', 'operations_manager'))
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

-- client_brand_kits -----------------------------------------------
-- 0020: "Read-only for the people shooting to the brand."
drop policy if exists "client_brand_kits: management full access" on client_brand_kits;
create policy "client_brand_kits: management full access"
  on client_brand_kits for all
  using (public.can_manage_client(client_id))
  with check (public.can_manage_client(client_id));

-- client_team_messages --------------------------------------------
-- A videographer keeps read and insert through their own two policies
-- (0020). What they lose is the ability to delete somebody else's
-- message from the thread.
drop policy if exists "client_team_messages: management full access" on client_team_messages;
create policy "client_team_messages: management full access"
  on client_team_messages for all
  using (public.can_manage_client(client_id))
  with check (public.can_manage_client(client_id));

-- submissions and their children ----------------------------------
-- The important one. A videographer raises a submission ("submissions:
-- videographer create own") and adds versions ("submission_versions:
-- videographer add own"); a trigger moves the status back to
-- 'submitted' on each new cut. They have never had, and must not
-- have, an update policy on `submissions` — that is what stops
-- somebody approving their own work.
drop policy if exists "submissions: management full access" on submissions;
create policy "submissions: management full access"
  on submissions for all
  using (public.is_ceo_role() or public.can_manage_client(client_id))
  with check (public.is_ceo_role() or public.can_manage_client(client_id));

drop policy if exists "submission_versions: management full access" on submission_versions;
create policy "submission_versions: management full access"
  on submission_versions for all
  using (
    exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and (public.is_ceo_role() or public.can_manage_client(s.client_id))
    )
  )
  with check (
    exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and (public.is_ceo_role() or public.can_manage_client(s.client_id))
    )
  );

drop policy if exists "submission_feedback: management full access" on submission_feedback;
create policy "submission_feedback: management full access"
  on submission_feedback for all
  using (
    exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and (public.is_ceo_role() or public.can_manage_client(s.client_id))
    )
  )
  with check (
    exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and (public.is_ceo_role() or public.can_manage_client(s.client_id))
    )
  );

-- =================================================================
-- 3. What is deliberately NOT changed
-- =================================================================
-- client_assets (0028) keeps can_see_client(). Raw footage and
-- references are shared working material: the videographer shooting
-- the job is exactly who should be adding a Drive link to it, and the
-- table was designed that way rather than inheriting it by accident.
--
-- The "staff assigned" policies everywhere are untouched. Staff
-- review work on the clients they are assigned to, the same way a
-- manager does, and that has been true since 0020. It is not part of
-- what broke here, so it is not quietly changed here either.
