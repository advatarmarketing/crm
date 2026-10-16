-- 0040: let a notes folder connected to a client be shown to them.
--
-- Run 0016-0039 first. 0035 and 0038 in particular: this uses
-- note_folders.parent_id (0035) and note_folders.client_id (0038).
--
-- Run VERIFY_0040.sql afterwards and check every row before treating
-- this as done.

-- =================================================================
-- What this changes, stated plainly
-- =================================================================
-- Until now every policy on notes was owner-only, for everybody,
-- with no exceptions: 0032 said so and 0038 was careful to keep it
-- that way, adding a column and no policy at all.
--
-- This is the exception, and it is the first one. A folder that is
-- connected to a client (0038) can now be ticked as shared, and that
-- client's login can then READ the notes in it from their portal.
--
-- It is off for every folder that exists and off for every folder
-- made from here on: `default false`, and the only thing that turns
-- it on is somebody ticking the box for that one folder. Nothing is
-- shared by connecting a folder to a client, which is what 0038
-- promised and what the Notes tab still says.
--
-- Nothing else changes. A shared folder is shared with that ONE
-- client login and nobody else: not other clients, not videographers,
-- not other staff, not the CEO. Owner-only still decides everything
-- outside this one case, which is why the policies below are SELECT
-- and are conditioned on the reader being a client.
--
-- NOTHING IS DELETED BY THIS FILE. Run it twice and the second run
-- does nothing.

alter table public.note_folders
  add column if not exists shared_with_client boolean not null default false;

-- "Shared with nobody" is not a state worth allowing: it reads as
-- shared in a list, is shared with no one, and would quietly become
-- a real share the moment a client was connected. Disconnecting a
-- client therefore has to clear the tick, and this makes forgetting
-- that an error rather than a silent surprise.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = to_regclass('public.note_folders')
      and conname = 'note_folders_shared_needs_client'
  ) then
    alter table public.note_folders
      add constraint note_folders_shared_needs_client
      check (not shared_with_client or client_id is not null);
  end if;
end $$;

-- =================================================================
-- Is this folder shared with the client who is asking?
-- =================================================================
-- A function rather than a subquery inside the policy, for a reason
-- that is not style: a policy on note_folders that itself selects
-- from note_folders recurses, and Postgres refuses the query. A
-- security definer function reads the table with RLS already settled
-- and hands back a yes or no.
--
-- It answers for the folder itself AND for a folder one level inside
-- it. Folders go two deep (0035) and the unique index from 0038
-- allows each person only one folder per client, so a subfolder can
-- never carry the connection itself — without this, filing a note
-- one level down would silently unshare it, which is not what
-- "share this folder" means to anybody.
--
-- current_client_id() is null for everyone who is not a client
-- login, so this is false for the whole team regardless of the
-- policies that call it.
create or replace function public.note_folder_shared_with_me(target_folder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.note_folders f
    left join public.note_folders p on p.id = f.parent_id
    where f.id = target_folder_id
      and public.current_client_id() is not null
      and (
        (f.shared_with_client and f.client_id = public.current_client_id())
        or (p.shared_with_client and p.client_id = public.current_client_id())
      )
  );
$$;

grant execute on function public.note_folder_shared_with_me(uuid) to authenticated;

-- =================================================================
-- The three read policies
-- =================================================================
-- SELECT only, every one of them. A client can read a shared note;
-- they cannot edit it, rename the folder, tick anything off or
-- delete anything. If they have something to say about it, that is
-- what Messages is for.
--
-- Each is additional to "owner only", which is untouched: a client
-- keeps their own private notebook exactly as before, and these
-- folders arrive alongside it rather than instead of it.

drop policy if exists "note_folders: client reads shared" on public.note_folders;
create policy "note_folders: client reads shared"
  on public.note_folders for select
  using (
    public.current_role() = 'client'
    and public.note_folder_shared_with_me(id)
  );

drop policy if exists "notes: client reads shared" on public.notes;
create policy "notes: client reads shared"
  on public.notes for select
  using (
    public.current_role() = 'client'
    and folder_id is not null
    and public.note_folder_shared_with_me(folder_id)
  );

-- The to-do list inside a note is part of the note, so a shared note
-- arrives whole rather than with its middle missing. Read-only: the
-- client sees what is ticked, and cannot tick anything.
drop policy if exists "note_checklist_items: client reads shared" on public.note_checklist_items;
create policy "note_checklist_items: client reads shared"
  on public.note_checklist_items for select
  using (
    public.current_role() = 'client'
    and exists (
      select 1 from public.notes n
      where n.id = note_id
        and n.folder_id is not null
        and public.note_folder_shared_with_me(n.folder_id)
    )
  );
