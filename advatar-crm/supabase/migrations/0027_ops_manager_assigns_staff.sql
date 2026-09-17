-- 0027: an operations manager can build the team on their own clients.
--
-- Run 0016-0026 first.
--
-- Run VERIFY_0027.sql afterwards and check every row before treating
-- this as done.

-- =================================================================
-- Why this is narrower than "let them manage assignments"
-- =================================================================
-- 0024 scoped an operations manager to the clients they are ON, and
-- made `client_staff` writes CEO-only so they could not simply hand
-- themselves every client — that limit is the whole reason the
-- scoping means anything.
--
-- But it also stopped them putting a videographer on a shoot, which is
-- the everyday half of running an account. So the permission is split
-- along the line that actually matters:
--
--   they MAY add and remove staff and videographers
--     on a client they already run;
--   they MAY NOT touch their own row, another manager's, or a CEO's.
--
-- The first rule is their job. The second is what stops the scoping
-- being self-service: you cannot grant yourself a client, you cannot
-- grant a colleague manager access to one, and you cannot remove the
-- CEO from anything.

create or replace function public.role_of(target_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = target_id;
$$;

grant execute on function public.role_of(uuid) to authenticated;

-- A single predicate, used by both policies below so the insert and
-- the delete can never drift apart.
create or replace function public.may_assign_to_client(
  target_client_id uuid,
  target_staff_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_role() = 'operations_manager'
    -- Only on a client they are already on.
    and public.can_see_client(target_client_id)
    -- Never themselves.
    and target_staff_id <> auth.uid()
    -- Only the roles that do the work, never management.
    and public.role_of(target_staff_id) in ('staff', 'videographer');
$$;

grant execute on function public.may_assign_to_client(uuid, uuid) to authenticated;

drop policy if exists "client_staff: ops manager assigns workers" on client_staff;
create policy "client_staff: ops manager assigns workers"
  on client_staff for insert
  with check (public.may_assign_to_client(client_id, staff_id));

drop policy if exists "client_staff: ops manager unassigns workers" on client_staff;
create policy "client_staff: ops manager unassigns workers"
  on client_staff for delete
  using (public.may_assign_to_client(client_id, staff_id));

-- "client_staff: ceo manages" (0024) is untouched and still grants the
-- CEO everything, including the management assignments this policy
-- deliberately withholds.
