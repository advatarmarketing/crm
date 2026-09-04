-- Phase 12: three related changes requested together —
--
--   1. A new "operations_manager" role. This person runs sales and
--      strategy alongside the CEO, so it's grouped with `ceo` as
--      "management" everywhere below: full, unrestricted access to
--      clients/planners/documents/tasks/messages/leads, same as ceo
--      has always had. It does NOT get access to invoices,
--      client_finance, or payments — those stay ceo-only, since
--      nothing in this request asked for a second person to see
--      company financials, and that's an easy thing to widen later
--      (one policy each) if that's wrong.
--
--   2. Lead-tracking columns on `clients`, for the new /app/leads
--      view: where the lead came from, how warm it is, and when to
--      follow up next. Nothing here changes what "lead" means
--      (clients.stage already had it) — this just gives a lead its
--      own trackable fields instead of overloading next_action.
--
--   3. Per-client staff scoping. Every table below used to grant
--      `staff` the exact same unrestricted access as `ceo` via
--      is_staff_or_ceo(). That's being split apart: `ceo` and
--      `operations_manager` ("management") keep seeing everything,
--      but a plain `staff` account now only sees the clients it's
--      actually assigned to in `client_staff` — same shape as the
--      `videographer` policies already in 0002, except staff gets
--      read AND write on their assigned clients (videographer stays
--      read-only, unchanged).
--
--      One deliberate side effect: `fathom_calls` (the raw Prospects
--      inbox — Phase 6) moves from "ceo/staff" to "management only".
--      A brand-new lead has no client_staff row yet (nobody's been
--      assigned to it), so under the new per-client-assigned model
--      staff wouldn't be able to see it anyway — and prospecting is
--      sales/strategy work, which is exactly what the new
--      operations_manager role is for. If staff should still triage
--      incoming Fathom calls, say so and this policy widens back to
--      include `staff` unconditionally, same as before.

-- =================================================================
-- 1. operations_manager role
-- =================================================================

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('ceo', 'operations_manager', 'staff', 'videographer', 'client'));

-- =================================================================
-- 2. Lead-tracking columns
-- =================================================================

alter table clients
  add column if not exists lead_source text,
  add column if not exists lead_temperature text,
  add column if not exists follow_up_date date;

alter table clients drop constraint if exists clients_lead_temperature_check;
alter table clients add constraint clients_lead_temperature_check
  check (lead_temperature is null or lead_temperature in ('hot', 'warm', 'cold'));

-- =================================================================
-- 3. Helper functions
-- =================================================================

-- "Management": ceo + operations_manager. Full, unrestricted access
-- everywhere `is_staff_or_ceo()` used to be used, EXCEPT the tables
-- that are now staff-scoped (see below) — there, this replaces the
-- unrestricted half of the old policy.
create or replace function public.is_management()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() in ('ceo', 'operations_manager');
$$;

-- profiles/team-list style reads aren't client data, so staff keeps
-- seeing the whole team here — only client-scoped tables split staff
-- out below. Redefined (not dropped) so the existing "profiles:
-- staff/ceo read all" policy in 0002 picks up operations_manager too
-- without needing to touch that policy at all.
create or replace function public.is_staff_or_ceo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() in ('ceo', 'staff', 'operations_manager');
$$;

-- =================================================================
-- 4. clients — staff scoped to assigned clients (read + write)
-- =================================================================

drop policy if exists "clients: ceo/staff full access" on clients;
drop policy if exists "clients: management full access" on clients;
create policy "clients: management full access"
  on clients for all
  using (public.is_management())
  with check (public.is_management());

drop policy if exists "clients: staff read/write assigned" on clients;
create policy "clients: staff read/write assigned"
  on clients for select
  using (public.current_role() = 'staff' and public.is_assigned_staff(id));

drop policy if exists "clients: staff update assigned" on clients;
create policy "clients: staff update assigned"
  on clients for update
  using (public.current_role() = 'staff' and public.is_assigned_staff(id))
  with check (public.current_role() = 'staff' and public.is_assigned_staff(id));

-- videographer/client policies from 0002 are untouched.

-- =================================================================
-- 5. client_staff — management assigns; staff reads its own rows
-- =================================================================

drop policy if exists "client_staff: ceo/staff full access" on client_staff;
drop policy if exists "client_staff: management full access" on client_staff;
create policy "client_staff: management full access"
  on client_staff for all
  using (public.is_management())
  with check (public.is_management());

drop policy if exists "client_staff: staff read own" on client_staff;
create policy "client_staff: staff read own"
  on client_staff for select
  using (public.current_role() = 'staff' and staff_id = auth.uid());

-- =================================================================
-- 6. planners — staff full access, scoped to assigned clients
-- =================================================================

drop policy if exists "planners: ceo/staff full access" on planners;
drop policy if exists "planners: management full access" on planners;
create policy "planners: management full access"
  on planners for all
  using (public.is_management())
  with check (public.is_management());

drop policy if exists "planners: staff assigned" on planners;
create policy "planners: staff assigned"
  on planners for all
  using (public.current_role() = 'staff' and public.is_assigned_staff(client_id))
  with check (public.current_role() = 'staff' and public.is_assigned_staff(client_id));

-- =================================================================
-- 7. fathom_calls — management only (see note at top of file)
-- =================================================================

drop policy if exists "fathom_calls: ceo/staff full access" on fathom_calls;
drop policy if exists "fathom_calls: management full access" on fathom_calls;
create policy "fathom_calls: management full access"
  on fathom_calls for all
  using (public.is_management())
  with check (public.is_management());

-- =================================================================
-- 8. documents — staff full access, scoped to assigned clients
-- =================================================================

drop policy if exists "documents: ceo/staff full access" on documents;
drop policy if exists "documents: management full access" on documents;
create policy "documents: management full access"
  on documents for all
  using (public.is_management())
  with check (public.is_management());

drop policy if exists "documents: staff assigned" on documents;
create policy "documents: staff assigned"
  on documents for all
  using (public.current_role() = 'staff' and public.is_assigned_staff(client_id))
  with check (public.current_role() = 'staff' and public.is_assigned_staff(client_id));

-- =================================================================
-- 9. tasks — staff full access, scoped to assigned clients, plus
--    their own unassigned (client_id null) tasks
-- =================================================================

drop policy if exists "tasks: ceo/staff full access" on tasks;
drop policy if exists "tasks: management full access" on tasks;
create policy "tasks: management full access"
  on tasks for all
  using (public.is_management())
  with check (public.is_management());

drop policy if exists "tasks: staff assigned or own" on tasks;
create policy "tasks: staff assigned or own"
  on tasks for all
  using (
    public.current_role() = 'staff'
    and (
      (client_id is not null and public.is_assigned_staff(client_id))
      or assigned_to = auth.uid()
    )
  )
  with check (
    public.current_role() = 'staff'
    and (
      (client_id is not null and public.is_assigned_staff(client_id))
      or assigned_to = auth.uid()
    )
  );

-- =================================================================
-- 10. message_threads — staff scoped to assigned clients
-- =================================================================

drop policy if exists "message_threads: ceo/staff full access" on message_threads;
drop policy if exists "message_threads: management full access" on message_threads;
create policy "message_threads: management full access"
  on message_threads for all
  using (public.is_management())
  with check (public.is_management());

drop policy if exists "message_threads: staff assigned" on message_threads;
create policy "message_threads: staff assigned"
  on message_threads for all
  using (public.current_role() = 'staff' and public.is_assigned_staff(client_id))
  with check (public.current_role() = 'staff' and public.is_assigned_staff(client_id));

-- =================================================================
-- 11. messages — staff scoped to assigned clients (via thread)
-- =================================================================

drop policy if exists "messages: ceo/staff full access" on messages;
drop policy if exists "messages: management full access" on messages;
create policy "messages: management full access"
  on messages for all
  using (public.is_management())
  with check (public.is_management());

drop policy if exists "messages: staff assigned" on messages;
create policy "messages: staff assigned"
  on messages for all
  using (
    public.current_role() = 'staff'
    and exists (
      select 1 from message_threads mt
      where mt.id = messages.thread_id
        and public.is_assigned_staff(mt.client_id)
    )
  )
  with check (
    public.current_role() = 'staff'
    and exists (
      select 1 from message_threads mt
      where mt.id = messages.thread_id
        and public.is_assigned_staff(mt.client_id)
    )
  );

-- invoices, client_finance, and payments are untouched — still
-- ceo-only (invoices/client_finance) or self-only reads (payments),
-- per the note at the top of this file.
