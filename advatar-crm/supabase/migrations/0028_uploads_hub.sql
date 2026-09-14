-- 0028: the Uploads hub.
--
-- Run 0016-0027 first.
--
-- Run VERIFY_0028.sql afterwards and check every row before treating
-- this as done.
--
-- =================================================================
-- What this changes, and why
-- =================================================================
-- Until now "submissions" was a one-way column: a videographer handed
-- work in, a reviewer wrote a note underneath, and that was the whole
-- conversation. The client never saw any of it, and there was nowhere
-- to put the raw footage the video was cut from.
--
-- Uploads turns that column into a place where the work actually
-- happens, for all four kinds of login:
--
--   1. Feedback becomes a two-way thread, and gains the two things
--      people kept writing out in prose — a timecode and a
--      screenshot.
--   2. Feedback is split into a checklist automatically, so the
--      videographer gets a list of things to fix rather than a
--      paragraph to re-read.
--   3. Feedback has an audience, so a client can comment on their own
--      video without seeing the team's internal review notes.
--   4. Raw footage and reference material get their own table, which
--      is the "assets" sub-tab — Drive links and image uploads,
--      attached to a client and optionally to one video.
--   5. Notifications fire on every hand-off, which is what the little
--      numbered circle beside each tab counts.

-- =================================================================
-- 1. Feedback grows up
-- =================================================================

alter table submission_feedback
  -- Where in the video. Seconds rather than "01:23" so it can be
  -- sorted, compared and turned back into a timecode for display —
  -- storing the formatted string would mean parsing it everywhere.
  -- Optional on purpose: most notes are about the whole cut.
  add column if not exists timecode_seconds integer,

  -- A frame grab, in the `feedback-shots` bucket, keyed by client id
  -- as its first path segment like every other bucket here. Also
  -- optional — the point of allowing it is that a picture settles an
  -- argument about framing in one go, not that anyone must supply one.
  add column if not exists screenshot_path text,

  -- Who the note is for.
  --
  --   'team'   — the internal review. CEO, operations manager, staff
  --              and the videographer who made the video. This is
  --              where someone can say "the client will hate this"
  --              without the client reading it.
  --   'client' — the client's own notes, and the team's replies to
  --              them. Visible to the client, so it is written to be.
  --
  -- Defaulting to 'team' keeps every row written before this
  -- migration internal, which is what its author intended when they
  -- wrote it: 0020 promised feedback was never shared.
  add column if not exists audience text not null default 'team',

  -- Set when a checklist was made from this note, so the trigger
  -- below is idempotent and the UI can say where an item came from.
  add column if not exists checklist_built boolean not null default false;

do $$
begin
  alter table public.submission_feedback
    add constraint submission_feedback_audience_check
    check (audience in ('team', 'client'));
exception
  when duplicate_object then null;
end
$$;

create index if not exists submission_feedback_audience_idx
  on submission_feedback (submission_id, audience, created_at);

-- -----------------------------------------------------------------
-- A conversation needs both sides able to speak
-- -----------------------------------------------------------------
-- 0020 deliberately gave a videographer no insert policy here, on the
-- grounds that feedback was the reviewer's column. Uploads makes it a
-- thread, so they get one — narrowly: only on their own submissions,
-- only as themselves.

drop policy if exists "submission_feedback: videographer reply own" on submission_feedback;
create policy "submission_feedback: videographer reply own"
  on submission_feedback for insert
  with check (
    public.current_role() = 'videographer'
    and public.owns_submission(submission_id)
    and author_id = auth.uid()
  );

-- -----------------------------------------------------------------
-- The client's side of it
-- -----------------------------------------------------------------
-- A client may read and write ONLY the 'client' audience, and only on
-- a video that was deliberately shared with them. The team's internal
-- notes on the same video stay invisible, which is the whole reason
-- audience exists rather than just opening feedback up.

drop policy if exists "submission_feedback: client read shared" on submission_feedback;
create policy "submission_feedback: client read shared"
  on submission_feedback for select
  using (
    public.current_role() = 'client'
    and audience = 'client'
    and exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and s.visibility = 'team_and_client'
        and s.client_id = public.current_client_id()
    )
  );

drop policy if exists "submission_feedback: client comment shared" on submission_feedback;
create policy "submission_feedback: client comment shared"
  on submission_feedback for insert
  with check (
    public.current_role() = 'client'
    -- A client cannot write into the internal thread even by asking
    -- for it directly: RLS cannot restrict columns, so the value is
    -- pinned here instead.
    and audience = 'client'
    and author_id = auth.uid()
    and exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and s.visibility = 'team_and_client'
        and s.client_id = public.current_client_id()
    )
  );

-- =================================================================
-- 2. The checklist built from feedback
-- =================================================================
-- The ask was: when feedback is submitted, the videographer gets a
-- checklist rather than a paragraph. This is that list.
--
-- Rows are written by the trigger below, not by hand, so an item can
-- always be traced back to the note it came from. `feedback_id` is
-- nullable because a videographer may also add their own item — a
-- thing they spotted themselves while fixing the rest.

create table if not exists submission_checklist (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions (id) on delete cascade,
  feedback_id uuid references submission_feedback (id) on delete cascade,
  -- Which cut the note was about, copied from the feedback row so the
  -- list still reads correctly after a new version lands.
  version integer,
  text text not null,
  done boolean not null default false,
  done_at timestamptz,
  -- 'team' or 'client', copied from the feedback that produced it, so
  -- the videographer can see at a glance whether the client asked for
  -- this or the reviewer did.
  source text not null default 'team',
  created_at timestamptz not null default now()
);

create index if not exists submission_checklist_submission_idx
  on submission_checklist (submission_id, done, created_at);

alter table submission_checklist enable row level security;

-- Reviewers: the CEO everywhere, an operations manager or staff
-- member on a client they are on.
--
-- The role list is spelled out rather than left to can_see_client()
-- alone, because that helper is true for a VIDEOGRAPHER on their own
-- clients too — and this policy is `for all`. Without the role check,
-- a videographer would inherit delete, and could quietly remove a
-- reviewer's request from the list it was made of. Their own, much
-- narrower policies are below.
drop policy if exists "submission_checklist: management" on submission_checklist;
create policy "submission_checklist: management"
  on submission_checklist for all
  using (
    public.current_role() in ('ceo', 'operations_manager', 'staff')
    and (
      public.is_ceo_role()
      or exists (
        select 1 from public.submissions s
        where s.id = submission_id and s.client_id is not null
          and public.can_see_client(s.client_id)
      )
    )
  )
  with check (
    public.current_role() in ('ceo', 'operations_manager', 'staff')
    and (
      public.is_ceo_role()
      or exists (
        select 1 from public.submissions s
        where s.id = submission_id and s.client_id is not null
          and public.can_see_client(s.client_id)
      )
    )
  );

-- The videographer owns the doing of it: they tick items off and may
-- add their own. They cannot delete one — a reviewer's request should
-- not be removable by the person it was made of.
drop policy if exists "submission_checklist: videographer own read" on submission_checklist;
create policy "submission_checklist: videographer own read"
  on submission_checklist for select
  using (public.current_role() = 'videographer' and public.owns_submission(submission_id));

drop policy if exists "submission_checklist: videographer tick own" on submission_checklist;
create policy "submission_checklist: videographer tick own"
  on submission_checklist for update
  using (public.current_role() = 'videographer' and public.owns_submission(submission_id))
  with check (public.current_role() = 'videographer' and public.owns_submission(submission_id));

drop policy if exists "submission_checklist: videographer add own" on submission_checklist;
create policy "submission_checklist: videographer add own"
  on submission_checklist for insert
  with check (
    public.current_role() = 'videographer'
    and public.owns_submission(submission_id)
    -- Only their own additions, never a forged one attributed to a
    -- reviewer's note.
    and feedback_id is null
  );

-- -----------------------------------------------------------------
-- Ticking is all a videographer may change
-- -----------------------------------------------------------------
-- The update policy above lets a videographer write to their own
-- checklist rows, and RLS cannot restrict which COLUMNS an update
-- touches — the same gap that let anyone set their own role to 'ceo'
-- until 0026 closed it. Left alone, the person the notes were written
-- about could edit the notes: "colour is too warm" becomes "looks
-- great", and the record of what was actually asked is gone.
--
-- So the text is pinned in a trigger. Ticking the box works; rewriting
-- the request silently does not take.

create or replace function public.keep_checklist_text()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role() = 'videographer' then
    new.text := old.text;
    new.feedback_id := old.feedback_id;
    new.source := old.source;
    new.version := old.version;
    new.submission_id := old.submission_id;
  end if;
  return new;
end;
$$;

drop trigger if exists submission_checklist_pin on submission_checklist;
create trigger submission_checklist_pin
  before update on submission_checklist
  for each row execute procedure public.keep_checklist_text();

-- No policy for clients anywhere on this table. The checklist is the
-- videographer's working list, including items made from the team's
-- internal notes, and showing it to a client would leak those notes
-- through the back door.

-- -----------------------------------------------------------------
-- Turning a note into items
-- -----------------------------------------------------------------
-- The splitting rule, stated plainly so nobody has to guess at it:
--
--   * a note written as lines or bullets becomes one item per line;
--   * a note written as one long paragraph (over 180 characters and
--     no line breaks) is split into sentences;
--   * anything shorter stays exactly as it was written.
--
-- Conservative on purpose. Splitting a two-line note into six
-- sentence fragments would turn one clear request into a list of
-- things that each read like nonsense on their own.
--
-- A videographer's own reply never builds a checklist — they are not
-- giving themselves notes — which is why the author is compared to
-- the submission's creator before anything is written.

create or replace function public.build_checklist_from_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  submission_owner uuid;
  chunk text;
  cleaned text;
  parts text[];
  made integer := 0;
begin
  select created_by into submission_owner from public.submissions where id = new.submission_id;

  -- Their own note on their own work: nothing to action.
  if submission_owner is not null and new.author_id = submission_owner then
    return new;
  end if;

  if new.body is null or btrim(new.body) = '' then
    return new;
  end if;

  if position(e'\n' in new.body) > 0 then
    parts := regexp_split_to_array(new.body, e'\n');
  elsif length(new.body) > 180 then
    -- Split after . ! or ? followed by a space. Done by first marking
    -- those boundaries with a newline and then splitting on it, rather
    -- than with a lookbehind — the back-reference is supported
    -- everywhere and keeps the punctuation on its own sentence.
    parts := regexp_split_to_array(
      regexp_replace(new.body, '([.!?])\s+', e'\\1\n', 'g'),
      e'\n'
    );
  else
    parts := array[new.body];
  end if;

  foreach chunk in array parts loop
    -- Strip a leading bullet, dash, or "1." numbering.
    cleaned := btrim(regexp_replace(chunk, '^\s*([-*•–]|\d+[.)])\s*', ''));

    -- One- and two-character leftovers are punctuation, not tasks.
    if length(cleaned) < 3 then
      continue;
    end if;

    insert into public.submission_checklist
      (submission_id, feedback_id, version, text, source)
    values
      (new.submission_id, new.id, new.version, cleaned, new.audience);

    made := made + 1;
  end loop;

  if made > 0 then
    update public.submission_feedback set checklist_built = true where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists submission_feedback_checklist on submission_feedback;
create trigger submission_feedback_checklist
  after insert on submission_feedback
  for each row execute procedure public.build_checklist_from_feedback();

-- =================================================================
-- 3. Raw footage and reference material
-- =================================================================
-- The assets sub-tab. Two shapes in one table because they are the
-- same thing to everyone using it — "the stuff this video is made
-- from":
--
--   kind = 'link'  — a Drive / Dropbox / WeTransfer URL. How raw
--                    footage actually travels; nobody is uploading
--                    80 GB of rushes into Postgres storage.
--   kind = 'file'  — an image or small document in the
--                    `upload-assets` bucket, capped at 10 MB by the
--                    bucket itself (see below).
--
-- Attached to a client always, and to one submission optionally: a
-- location scout photo belongs to the client, a frame reference
-- belongs to a specific cut.

create table if not exists client_assets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  submission_id uuid references submissions (id) on delete set null,
  kind text not null default 'link' check (kind in ('link', 'file')),
  title text not null,
  url text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  notes text,
  -- Same two-value shape as submissions.visibility, and the same
  -- meaning, so nobody has to learn a second vocabulary: 'team' is
  -- internal, 'team_and_client' is on the client's own Uploads tab.
  visibility text not null default 'team'
    check (visibility in ('team', 'team_and_client')),
  uploaded_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists client_assets_client_idx on client_assets (client_id, created_at desc);
create index if not exists client_assets_submission_idx on client_assets (submission_id);

alter table client_assets enable row level security;

-- Everyone on the client — CEO, the operations manager running it,
-- assigned staff, the videographer shooting it — reads and writes.
-- can_see_client() (0024) already means exactly that for all four.
drop policy if exists "client_assets: team on the client" on client_assets;
create policy "client_assets: team on the client"
  on client_assets for all
  using (public.can_see_client(client_id))
  with check (public.can_see_client(client_id));

-- The client sees what was shared with them.
drop policy if exists "client_assets: client read shared" on client_assets;
create policy "client_assets: client read shared"
  on client_assets for select
  using (
    public.current_role() = 'client'
    and visibility = 'team_and_client'
    and client_id = public.current_client_id()
  );

-- And can hand material over themselves — a logo, a product shot, the
-- footage they took on their phone. Forced to 'team_and_client' so
-- they can still see what they just uploaded; a client who could
-- write 'team' would be able to post something into the team's side
-- and then not find it again.
drop policy if exists "client_assets: client upload own" on client_assets;
create policy "client_assets: client upload own"
  on client_assets for insert
  with check (
    public.current_role() = 'client'
    and client_id = public.current_client_id()
    and visibility = 'team_and_client'
    and uploaded_by = auth.uid()
  );

-- Removing their own upload, and only their own.
drop policy if exists "client_assets: client delete own" on client_assets;
create policy "client_assets: client delete own"
  on client_assets for delete
  using (
    public.current_role() = 'client'
    and client_id = public.current_client_id()
    and uploaded_by = auth.uid()
  );

-- =================================================================
-- 4. Buckets
-- =================================================================
-- Both private. Reads go through short-lived signed URLs minted
-- server-side, exactly like client-documents.
--
-- The size limits are enforced by Storage itself rather than only by
-- the upload form, because a limit that lives in the browser is a
-- suggestion. "Image uploads can't be too big" is the brief; 10 MB is
-- a generous phone screenshot and a hopeless video, which is the line
-- worth drawing.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feedback-shots', 'feedback-shots', false, 5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = false;

insert into storage.buckets (id, name, public, file_size_limit)
values ('upload-assets', 'upload-assets', false, 10485760)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      public = false;

-- -----------------------------------------------------------------
-- Storage policies
-- -----------------------------------------------------------------
-- Both buckets key on the first path segment being the client id, the
-- convention storage_path_client_id() (0016) already reads, so these
-- policies are the same shape as client-documents' and can be
-- reasoned about the same way.

drop policy if exists "feedback-shots: team on the client" on storage.objects;
create policy "feedback-shots: team on the client"
  on storage.objects for all
  using (
    bucket_id = 'feedback-shots'
    and public.can_see_client(public.storage_path_client_id(name))
  )
  with check (
    bucket_id = 'feedback-shots'
    and public.can_see_client(public.storage_path_client_id(name))
  );

drop policy if exists "feedback-shots: client own" on storage.objects;
create policy "feedback-shots: client own"
  on storage.objects for all
  using (
    bucket_id = 'feedback-shots'
    and public.current_role() = 'client'
    and public.storage_path_client_id(name) = public.current_client_id()
  )
  with check (
    bucket_id = 'feedback-shots'
    and public.current_role() = 'client'
    and public.storage_path_client_id(name) = public.current_client_id()
  );

drop policy if exists "upload-assets: team on the client" on storage.objects;
create policy "upload-assets: team on the client"
  on storage.objects for all
  using (
    bucket_id = 'upload-assets'
    and public.can_see_client(public.storage_path_client_id(name))
  )
  with check (
    bucket_id = 'upload-assets'
    and public.can_see_client(public.storage_path_client_id(name))
  );

drop policy if exists "upload-assets: client own" on storage.objects;
create policy "upload-assets: client own"
  on storage.objects for all
  using (
    bucket_id = 'upload-assets'
    and public.current_role() = 'client'
    and public.storage_path_client_id(name) = public.current_client_id()
  )
  with check (
    bucket_id = 'upload-assets'
    and public.current_role() = 'client'
    and public.storage_path_client_id(name) = public.current_client_id()
  );

-- =================================================================
-- 5. Notifications — what the numbered circle counts
-- =================================================================
-- The badge beside a tab is a count of that person's unread
-- notifications whose href is under that tab's path. That means the
-- badge needs no counting logic of its own and cannot drift from the
-- bell: both read the same rows. It also means the hrefs below are
-- load-bearing, not decoration.
--
-- Every trigger here is security definer and calls notify_user()
-- (0025), which already refuses to notify somebody about their own
-- action.

-- -----------------------------------------------------------------
-- A new cut lands
-- -----------------------------------------------------------------
-- Fires on submission_versions rather than submissions, so it covers
-- both the first hand-in and every revision after it. Management and
-- assigned staff are told; the client is not, because a new version
-- is not shared with them until somebody shares it.

create or replace function public.notify_new_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent record;
  client_name text;
  recipient uuid;
begin
  select s.id, s.title, s.client_id, s.created_by
    into parent
  from public.submissions s
  where s.id = new.submission_id;

  if parent.id is null then
    return new;
  end if;

  select name into client_name from public.clients where id = parent.client_id;

  -- Everyone who runs this client: the CEO always, plus whoever is
  -- assigned to it — except the videographer who just uploaded.
  for recipient in
    select p.id
    from public.profiles p
    where p.role = 'ceo'
    union
    select cs.staff_id
    from public.client_staff cs
    join public.profiles p on p.id = cs.staff_id
    where cs.client_id = parent.client_id
      and p.role in ('operations_manager', 'staff')
  loop
    perform public.notify_user(
      recipient,
      'upload_new_version',
      case when new.version = 1
        then 'New upload: ' || parent.title
        else 'New cut (v' || new.version || '): ' || parent.title
      end,
      concat_ws(' · ', client_name, 'ready to review'),
      '/app/uploads'
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists submission_versions_notify on submission_versions;
create trigger submission_versions_notify
  after insert on submission_versions
  for each row execute procedure public.notify_new_version();

-- -----------------------------------------------------------------
-- Feedback arrives
-- -----------------------------------------------------------------
-- Who hears about it depends on which way it is travelling:
--
--   a team note   -> the videographer who made the video;
--   a client note -> the videographer AND the team running the
--                    client, since a client comment usually needs a
--                    decision, not just a re-edit.

create or replace function public.notify_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent record;
  client_name text;
  recipient uuid;
  preview text;
begin
  select s.id, s.title, s.client_id, s.created_by
    into parent
  from public.submissions s
  where s.id = new.submission_id;

  if parent.id is null then
    return new;
  end if;

  select name into client_name from public.clients where id = parent.client_id;

  preview := case
    when length(new.body) > 90 then left(new.body, 87) || '…'
    else new.body
  end;

  perform public.notify_user(
    parent.created_by,
    'upload_feedback',
    'Feedback on ' || parent.title,
    preview,
    '/app/uploads'
  );

  if new.audience = 'client' then
    for recipient in
      select p.id from public.profiles p where p.role = 'ceo'
      union
      select cs.staff_id
      from public.client_staff cs
      join public.profiles p on p.id = cs.staff_id
      where cs.client_id = parent.client_id
        and p.role in ('operations_manager', 'staff')
    loop
      perform public.notify_user(
        recipient,
        'upload_client_feedback',
        'Client comment on ' || parent.title,
        concat_ws(' · ', client_name, preview),
        '/app/uploads'
      );
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists submission_feedback_notify on submission_feedback;
create trigger submission_feedback_notify
  after insert on submission_feedback
  for each row execute procedure public.notify_feedback();

-- -----------------------------------------------------------------
-- A video is shared with the client
-- -----------------------------------------------------------------
-- 0025's submitWorkAction already notifies the client from the server
-- when work is shared at submission time. This covers the other route
-- — a reviewer flipping an existing team-only video to shared — and
-- points at the client's own Uploads tab rather than the portal's
-- front page, so the badge lands on the right tab.

create or replace function public.notify_submission_shared()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
begin
  if new.visibility is not distinct from old.visibility then
    return new;
  end if;

  if new.visibility <> 'team_and_client' then
    return new;
  end if;

  for recipient in
    select id from public.profiles
    where role = 'client' and client_id = new.client_id
  loop
    perform public.notify_user(
      recipient,
      'upload_shared',
      'New video ready to watch',
      '“' || new.title || '” is on your Uploads tab.',
      '/app/portal/uploads'
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists submissions_shared_notify on submissions;
create trigger submissions_shared_notify
  after update on submissions
  for each row execute procedure public.notify_submission_shared();

-- -----------------------------------------------------------------
-- Material added to a client
-- -----------------------------------------------------------------
-- Told to the other side, whichever side that is: a client uploading
-- rushes tells the team, the team sharing a reference tells the
-- client.

create or replace function public.notify_asset_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
  actor_role text;
  client_name text;
begin
  actor_role := public.current_role();
  select name into client_name from public.clients where id = new.client_id;

  if actor_role = 'client' then
    for recipient in
      select p.id from public.profiles p where p.role = 'ceo'
      union
      select cs.staff_id
      from public.client_staff cs
      join public.profiles p on p.id = cs.staff_id
      where cs.client_id = new.client_id
        and p.role in ('operations_manager', 'staff', 'videographer')
    loop
      perform public.notify_user(
        recipient,
        'asset_added',
        'New material from ' || coalesce(client_name, 'a client'),
        new.title,
        '/app/uploads'
      );
    end loop;
  elsif new.visibility = 'team_and_client' then
    for recipient in
      select id from public.profiles
      where role = 'client' and client_id = new.client_id
    loop
      perform public.notify_user(
        recipient,
        'asset_added',
        'New material on your project',
        new.title,
        '/app/portal/uploads'
      );
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists client_assets_notify on client_assets;
create trigger client_assets_notify
  after insert on client_assets
  for each row execute procedure public.notify_asset_added();
