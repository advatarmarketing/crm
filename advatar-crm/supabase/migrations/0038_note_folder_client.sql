-- 0038: connect a notes folder to a client.
--
-- NOTHING IS DELETED OR OVERWRITTEN BY THIS FILE.
-- It adds one column to `note_folders` and nothing else. Every folder
-- you already have keeps its name, its parent, its colour and all of
-- its notes; each simply starts with no client attached, which is
-- what they all are today. Run it twice and the second run does
-- nothing.
--
-- No new policy, deliberately. note_folders is owner-only (0032) and
-- stays that way: attaching a client to a folder does NOT share that
-- folder with anybody, not with the client, not with whoever runs
-- that client, not with the CEO. It is a label on your own folder
-- saying who it is about. Notes in this app are private, and this
-- does not put a crack in that.
--
-- `on delete set null` rather than cascade: closing a client is not a
-- reason to destroy the notes you kept while working with them. The
-- folder stays, it simply stops pointing anywhere.

alter table public.note_folders
  add column if not exists client_id uuid references public.clients(id) on delete set null;

-- One folder per client, per person. Two folders of your own both
-- claiming to be Bright Co's is a filing mistake rather than a thing
-- anybody means to do, and it makes "open this client's notes"
-- ambiguous. Two DIFFERENT people may of course each keep their own
-- Bright Co folder — that is the owner_id in the index.
--
-- This also answers the only question the column is ever asked
-- ("which of my folders is this client's?"), so there is no second,
-- non-unique index alongside it. Partial, because the overwhelming
-- majority of folders have no client on them and indexing those rows
-- would be indexing nothing — and because a partial unique index
-- leaves every unattached folder free of the constraint rather than
-- allowing exactly one of them.
create unique index if not exists note_folders_owner_one_per_client
  on public.note_folders (owner_id, client_id)
  where client_id is not null;
