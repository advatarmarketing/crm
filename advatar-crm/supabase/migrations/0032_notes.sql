-- 0032: Notes — a private notebook for every login.
--
-- Run 0016-0031 first.
--
-- Run VERIFY_0032.sql afterwards and check every row before treating
-- this as done.

-- =================================================================
-- What this is
-- =================================================================
-- Every login — CEO, operations manager, staff, videographer and
-- client — gets a Notes tab: folders, notes inside them with a title
-- and a body, and an optional to-do list inside any note. The to-do
-- items also appear on that person's To-do tab, and ticking one in
-- either place ticks it in both, because there is only one row.
--
-- =================================================================
-- Private means private
-- =================================================================
-- Every policy below is "owner only", for every operation, on all
-- three tables. Nobody else can read a note: not a colleague, not an
-- operations manager, and not the CEO.
--
-- That is deliberate and it is the opposite of almost everything
-- else in this schema, where management can see what the team does.
-- A notebook people suspect is being read is a notebook people stop
-- writing in, and a client's own notes are not the agency's business
-- at all. Anything meant to be shared already has a home: the team
-- thread on a client, Messages, the client's own To-do.
--
-- It is also why a note's to-do items live HERE rather than as rows
-- in `tasks`. `tasks` is shared by design — the CEO reads everyone's,
-- and a task on a client is visible to that client — so writing a
-- private jotting into it would publish it. Keeping the items with
-- the note, and having the To-do tab READ them for their owner only,
-- connects the two without leaking either.
--
-- A second reason: videographers and clients have no insert policy
-- on `tasks` at all, so a design that wrote there would have worked
-- for three roles out of five.

-- =================================================================
-- 1. Folders
-- =================================================================

create table if not exists public.note_folders (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Two folders called "Clients" and "clients" are one folder typed
-- twice. Per person — two people may of course both have "Ideas".
create unique index if not exists note_folders_owner_name
  on public.note_folders (owner_id, lower(btrim(name)));

-- =================================================================
-- 2. Notes
-- =================================================================
-- folder_id is optional. A note whose folder is deleted drops to
-- "No folder" rather than going with it: deleting a folder is tidying
-- up, and nobody expects tidying up to destroy what was inside.

create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  folder_id   uuid references public.note_folders(id) on delete set null,
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  body        text not null default '' check (char_length(body) <= 20000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The list is always "this person's notes, most recently updated
-- first", optionally narrowed to one folder.
create index if not exists notes_owner_updated on public.notes (owner_id, updated_at desc);
create index if not exists notes_folder on public.notes (folder_id);

-- =================================================================
-- 3. A note's to-do list
-- =================================================================
-- owner_id is stored rather than looked up through the note, so the
-- To-do tab can ask "my open items" in one indexed query instead of a
-- join, and so the policy below is a plain column comparison.

create table if not exists public.note_checklist_items (
  id          uuid primary key default gen_random_uuid(),
  note_id     uuid not null references public.notes(id) on delete cascade,
  owner_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  text        text not null check (char_length(btrim(text)) between 1 and 500),
  done        boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists note_checklist_items_note on public.note_checklist_items (note_id, position);
create index if not exists note_checklist_items_owner_open on public.note_checklist_items (owner_id, done);

-- =================================================================
-- 4. Keeping "last updated" honest
-- =================================================================
-- touch_updated_at() is 0018's. It is redefined here, identically, so
-- this migration does not depend on 0018 having been run in full.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists note_folders_touch on public.note_folders;
create trigger note_folders_touch
  before update on public.note_folders
  for each row execute procedure public.touch_updated_at();

drop trigger if exists notes_touch on public.notes;
create trigger notes_touch
  before update on public.notes
  for each row execute procedure public.touch_updated_at();

drop trigger if exists note_checklist_items_touch on public.note_checklist_items;
create trigger note_checklist_items_touch
  before update on public.note_checklist_items
  for each row execute procedure public.touch_updated_at();

-- Adding, ticking or removing a to-do item is a change to the note,
-- so it moves the note's "last updated" too — otherwise a note you
-- worked through this morning would sit below one you have not
-- opened in a week, and the list is ordered by exactly that.
--
-- Not security definer: the only note it touches is the one the item
-- belongs to, which the caller already owns, so their own RLS allows
-- it. When a whole note is deleted its items go by cascade, and this
-- then updates a row that no longer exists — zero rows, no error.
create or replace function public.touch_parent_note()
returns trigger
language plpgsql
as $$
begin
  update public.notes
     set updated_at = now()
   where id = coalesce(new.note_id, old.note_id);
  return null;
end;
$$;

drop trigger if exists note_checklist_items_touch_note on public.note_checklist_items;
create trigger note_checklist_items_touch_note
  after insert or update or delete on public.note_checklist_items
  for each row execute procedure public.touch_parent_note();

-- =================================================================
-- 5. Row-level security: owner only, everywhere
-- =================================================================

alter table public.note_folders enable row level security;
alter table public.notes enable row level security;
alter table public.note_checklist_items enable row level security;

drop policy if exists "note_folders: owner only" on public.note_folders;
create policy "note_folders: owner only"
  on public.note_folders for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- The folder check stops a note being filed into somebody else's
-- folder by id. It would not reveal anything — the folder's name is
-- still unreadable — but a row pointing into another person's space
-- is not a state worth allowing.
drop policy if exists "notes: owner only" on public.notes;
create policy "notes: owner only"
  on public.notes for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (
      folder_id is null
      or exists (
        select 1 from public.note_folders f
        where f.id = folder_id and f.owner_id = auth.uid()
      )
    )
  );

-- Both halves matter. owner_id alone would let an item claim to be
-- yours while hanging off someone else's note; note_id alone would
-- let the owner column say anything.
drop policy if exists "note_checklist_items: owner only" on public.note_checklist_items;
create policy "note_checklist_items: owner only"
  on public.note_checklist_items for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.notes n
      where n.id = note_id and n.owner_id = auth.uid()
    )
  );

-- Signed-in users only. The policies already refuse a signed-out
-- visitor, since auth.uid() is null; this makes it not a question.
revoke all on public.note_folders from anon;
revoke all on public.notes from anon;
revoke all on public.note_checklist_items from anon;

grant select, insert, update, delete on public.note_folders to authenticated;
grant select, insert, update, delete on public.notes to authenticated;
grant select, insert, update, delete on public.note_checklist_items to authenticated;
