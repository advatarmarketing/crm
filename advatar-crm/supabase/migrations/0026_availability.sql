-- 0026: when a videographer is available, and a fix to the
-- "update your own profile" policy found while adding it.
--
-- Run 0016-0025 first.
--
-- Run VERIFY_0026.sql afterwards and check every row before treating
-- this as done.

-- =================================================================
-- 1. profiles.availability (prompt 9)
-- =================================================================
-- Free text on purpose. "Weekdays after 4, all day Saturday, away
-- 12-19 Aug" is how people actually describe their availability, and
-- a structured weekly grid would force everyone to lie about the
-- exception that matters most. The team reads it and books around it;
-- nothing computes against it.

alter table profiles
  add column if not exists availability text;

-- =================================================================
-- 2. Close a privilege escalation on "profiles: update own"
-- =================================================================
-- The policy from 0001 is:
--
--   create policy "profiles: update own" on profiles for update
--     using (auth.uid() = id);
--
-- With no WITH CHECK, Postgres reuses USING for the check, so the row
-- still has to be your own afterwards — but nothing pins the columns.
-- Row-level security cannot restrict columns, so any signed-in user
-- could run
--
--   update profiles set role = 'ceo' where id = auth.uid();
--
-- and grant themselves the CEO's access to every client, every
-- invoice and every wage in the system. A client login could do it.
--
-- This was reachable before today; adding `availability` to the set of
-- things people update about themselves is what turned it up.
--
-- The fix pins the two columns that decide access — `role` and
-- `client_id` — to what they already are. Everything a person
-- legitimately edits about themselves (name, phone, photo,
-- availability) still goes through untouched.
--
-- current_role() and current_client_id() are SECURITY DEFINER helpers
-- from 0002, so reading the caller's own row inside a policy ON that
-- same table does not recurse.

drop policy if exists "profiles: update own" on profiles;
create policy "profiles: update own"
  on profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = public.current_role()
    and client_id is not distinct from public.current_client_id()
  );

-- Management keeps its own policy from 0022, which is what legitimate
-- role changes go through — and that path is already limited to CEOs
-- and operations managers by is_management().
