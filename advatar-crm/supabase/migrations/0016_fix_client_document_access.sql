-- 0016: make sure a client can actually open a document from their
-- portal.
--
-- Why this exists
-- ---------------
-- The app-side cause of "documents don't open for clients" was found
-- and fixed in the code (the new tab was being opened after an await,
-- which Safari/iOS blocks silently). This migration covers the other
-- half: the storage policies that decide whether a client is allowed
-- to be handed a signed URL at all.
--
-- Those policies were written in 0012_documents_fathom_activity.sql
-- and they are correct as written — this migration does not change
-- their logic. It re-asserts them because there is no way to check
-- from outside what is actually live in this database, and this
-- project has already had one migration silently roll back midway
-- (see 0010's note, where 0002's helper functions turned out never to
-- have been applied). If 0012 did fully apply, every statement below
-- is a no-op. If it didn't, this repairs it.
--
-- Run VERIFY_0016.sql afterwards and check every row says OK before
-- treating this as done.

-- =================================================================
-- 1. Helper functions the storage policies depend on
-- =================================================================
-- Re-declared for the same reason 0010 re-declared them: so this
-- migration stands on its own rather than assuming a prior state.
-- `create or replace` is a no-op if they already match.

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select client_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_management()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() in ('ceo', 'operations_manager');
$$;

create or replace function public.is_assigned_staff(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.client_staff
    where client_id = target_client_id and staff_id = auth.uid()
  );
$$;

-- Files are stored as `<client_id>/<uuid>-<filename>`, so the policies
-- need the first path segment as a uuid. Casting directly would throw
-- on any object whose first segment isn't a uuid, and an exception
-- inside an RLS policy fails the whole query rather than just that
-- row — so this returns null instead, which simply fails the
-- comparison.
create or replace function public.storage_path_client_id(object_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  first_segment text;
begin
  first_segment := split_part(object_name, '/', 1);
  if first_segment !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return null;
  end if;
  return first_segment::uuid;
end;
$$;

-- The policies run as the `authenticated` role, so it must be allowed
-- to call these. This is the default for new functions, but is stated
-- explicitly here because a revoked execute grant would fail every
-- policy below in a way that looks exactly like "file not found".
grant execute on function public.current_role() to authenticated;
grant execute on function public.current_client_id() to authenticated;
grant execute on function public.is_management() to authenticated;
grant execute on function public.is_assigned_staff(uuid) to authenticated;
grant execute on function public.storage_path_client_id(text) to authenticated;

-- =================================================================
-- 2. The bucket
-- =================================================================
-- Private on purpose: these are contracts and briefs, not avatars.
-- Reads go through a short-lived signed URL minted server-side.

insert into storage.buckets (id, name, public)
values ('client-documents', 'client-documents', false)
on conflict (id) do nothing;

-- =================================================================
-- 3. Storage policies for client-documents
-- =================================================================

drop policy if exists "client-documents: management all" on storage.objects;
create policy "client-documents: management all"
  on storage.objects for all
  using (bucket_id = 'client-documents' and public.is_management())
  with check (bucket_id = 'client-documents' and public.is_management());

drop policy if exists "client-documents: staff assigned" on storage.objects;
create policy "client-documents: staff assigned"
  on storage.objects for all
  using (
    bucket_id = 'client-documents'
    and public.current_role() = 'staff'
    and public.is_assigned_staff(public.storage_path_client_id(name))
  )
  with check (
    bucket_id = 'client-documents'
    and public.current_role() = 'staff'
    and public.is_assigned_staff(public.storage_path_client_id(name))
  );

drop policy if exists "client-documents: videographer read assigned" on storage.objects;
create policy "client-documents: videographer read assigned"
  on storage.objects for select
  using (
    bucket_id = 'client-documents'
    and public.current_role() = 'videographer'
    and public.is_assigned_staff(public.storage_path_client_id(name))
  );

-- The one that makes a client's portal downloads work.
drop policy if exists "client-documents: client read own" on storage.objects;
create policy "client-documents: client read own"
  on storage.objects for select
  using (
    bucket_id = 'client-documents'
    and public.current_role() = 'client'
    and public.storage_path_client_id(name) = public.current_client_id()
  );

-- =================================================================
-- 4. The documents table's own read policy for clients
-- =================================================================
-- Storage access is only half of it — the `documents` row has to be
-- readable too, or the app never gets as far as asking for a signed
-- URL. Re-asserted from 0002 for the same reason as everything above.

drop policy if exists "documents: client read own" on documents;
create policy "documents: client read own"
  on documents for select
  using (
    public.current_role() = 'client'
    and client_id = public.current_client_id()
  );
