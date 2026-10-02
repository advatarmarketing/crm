-- 0035_note_subfolders_colours_rich_text.sql
--
-- Three additions to the notes feature from 0032:
--
--   1. Subfolders — a folder may sit inside another folder.
--   2. Colour labels, on folders AND on notes.
--   3. Rich text in a note's body (bold, italic, underline, bullets).
--
-- Nothing here changes who can see what. Every policy on these tables
-- is still "owner only", and a column added to a table does not widen
-- a policy — see 0032 for the reasoning. Both new columns are
-- nullable with no default, so every row that already exists stays
-- valid and keeps working untouched.

-- =================================================================
-- 1. Subfolders
-- =================================================================
-- on delete SET NULL, not CASCADE, and deliberately: deleting a
-- folder is tidying up, and nobody expects tidying up to destroy what
-- was inside. A note whose folder goes drops to "No folder" (0032);
-- a subfolder whose parent goes is promoted to the top level the same
-- way, rather than disappearing with everything in it.

alter table public.note_folders
  add column if not exists parent_id uuid references public.note_folders(id) on delete set null;

create index if not exists note_folders_parent on public.note_folders (parent_id);

-- Two folders of the same name are only the same folder if they sit
-- in the same place. "Shoots" inside "Clients" and "Shoots" inside
-- "Internal" are two different folders; two called "Shoots" directly
-- inside "Clients" are one folder typed twice.
--
-- coalesce, because NULL never equals NULL in a unique index, so
-- without it the top level would stop being unique at all — the one
-- thing 0032's index was for.
drop index if exists public.note_folders_owner_name;

create unique index if not exists note_folders_owner_parent_name
  on public.note_folders (
    owner_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(name))
  );

-- Two levels, and no more. A folder inside a folder is what was
-- asked for and what the sidebar can show legibly; arbitrary nesting
-- needs a tree widget, a depth limit of its own, and a way to escape
-- a folder buried six deep.
--
-- This also makes a cycle impossible, which matters more than the
-- tidiness: a folder that is its own ancestor would hang any code
-- that walks upwards, including the page that draws the sidebar.
create or replace function public.check_note_folder_depth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_owner uuid;
  parent_parent uuid;
  has_children boolean;
begin
  if new.parent_id is null then
    -- A top-level folder may only move to the top level if nothing
    -- is relying on it being a parent... which is always fine.
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'A folder cannot be inside itself.';
  end if;

  select owner_id, parent_id into parent_owner, parent_parent
  from public.note_folders where id = new.parent_id;

  if parent_owner is null then
    raise exception 'That folder does not exist.';
  end if;

  -- Belt and braces: the owner-only policy already stops anyone
  -- naming someone else's folder as a parent, but a SECURITY DEFINER
  -- function must not assume the policy ran.
  if parent_owner <> new.owner_id then
    raise exception 'A folder can only sit inside one of your own folders.';
  end if;

  if parent_parent is not null then
    raise exception 'Folders go two levels deep: a folder, and folders inside it.';
  end if;

  -- Moving a folder that already has children inside another folder
  -- would put its children three deep.
  select exists (select 1 from public.note_folders where parent_id = new.id)
    into has_children;

  if has_children then
    raise exception 'That folder has folders inside it, so it cannot go inside another.';
  end if;

  return new;
end;
$$;

drop trigger if exists note_folders_depth on public.note_folders;
create trigger note_folders_depth
  before insert or update of parent_id on public.note_folders
  for each row execute procedure public.check_note_folder_depth();

-- =================================================================
-- 2. Colour labels
-- =================================================================
-- A fixed set of names rather than free-form hex. The app maps each
-- name to a pair of colours per theme, so a label stays readable in
-- dark mode and light mode both — which a stored "#ffeb3b" could not
-- do. NULL means no label, which is the default and stays the
-- default.

alter table public.note_folders
  add column if not exists color text
  check (color is null or color in ('red','orange','gold','green','teal','blue','purple','pink'));

alter table public.notes
  add column if not exists color text
  check (color is null or color in ('red','orange','gold','green','teal','blue','purple','pink'));

-- =================================================================
-- 3. Rich text
-- =================================================================
-- The body column keeps its type and its 20,000-character limit. What
-- changes is that it may now hold a small, fixed set of HTML tags
-- instead of plain text, and body_format says which.
--
-- Existing notes are plain and stay plain until they are next edited,
-- so nothing already written reflows or loses its line breaks. The
-- app reads this column to decide whether to render the text as-is or
-- as markup, and sanitises either way — it never trusts what is
-- stored here, however it got there.

alter table public.notes
  add column if not exists body_format text not null default 'plain'
  check (body_format in ('plain','html'));

-- =================================================================
-- 4. Done
-- =================================================================
-- No policy changes, by design. "notes: owner only", "folders: owner
-- only" and "items: owner only" from 0032 are untouched and still
-- cover every column added above: a policy grants access to a ROW,
-- and these rows belong to exactly one person as they always did.
