-- 0042 — The video schedule, and the client's say over each video.
--
-- Until now each video lived as a "slot" inside the content plan's
-- JSON (planners.content -> 'slots' -> 'items'). A slot had no date,
-- so nothing could put it on a calendar, warn anyone it was due, or
-- tell the client when it goes out. This gives every video its own row:
--
--   content_videos   one row per video going out. A date and a pillar
--                    are all it needs; hook, body, CTA and the rest
--                    are optional and can be filled in later, or never.
--                    Linked to the upload (submissions) that delivers it.
--
-- Every existing slot is copied across, once, with no date. The JSON is
-- left exactly as it was, as a backup — nothing is deleted.
--
-- It also adds, on the uploads side:
--   * submissions.kind — video, thumbnail or graphic, so thumbnails and
--     posters go through the system instead of WhatsApp.
--   * submission_versions.stream_url — an optional Cloudinary link the
--     client watches in the in-app player. `url` stays the Google Drive
--     link they can download.
--   * the client's verdict on a video (approved / changes asked for),
--     set only through client_decide_submission(), which checks the
--     client's package from 0041: a client we post for gets no buttons
--     at all, an approve-only client can only approve, and a full
--     revisions client can ask for changes up to their number of rounds.
--
-- Who can do what with content_videos:
--   * CEO / operations manager on their clients, and assigned staff:
--     everything.
--   * Assigned videographers: read.
--   * The client: read their own, so their calendar shows every video
--     going out. Never write.
--
-- Run 0041 first. Safe to run twice.

-- ------------------------------------------------------------------
-- 1. The schedule
-- ------------------------------------------------------------------
create table if not exists public.content_videos (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients (id) on delete cascade,
  -- Null while a video is planned but not yet given a day.
  publish_on    date,
  -- Order within a day, for the days that carry two.
  day_order     smallint not null default 1 check (day_order between 1 and 9),
  title         text check (title is null or char_length(title) <= 200),
  pillar        text check (pillar is null or char_length(pillar) <= 80),
  video_type    text check (video_type is null or char_length(video_type) <= 60),
  description   text check (description is null or char_length(description) <= 4000),
  hook          text check (hook is null or char_length(hook) <= 2000),
  body          text check (body is null or char_length(body) <= 8000),
  cta           text check (cta is null or char_length(cta) <= 2000),
  wms           text check (wms is null or char_length(wms) <= 200),
  scenery       text check (scenery is null or char_length(scenery) <= 200),
  video_set     text check (video_set is null or char_length(video_set) <= 80),
  -- The upload that delivers this video, once there is one.
  submission_id uuid references public.submissions (id) on delete set null,
  posted_at     timestamptz,
  -- The slot this row was copied from, so the copy runs once.
  legacy_slot_id text,
  created_by    uuid references public.profiles (id) on delete set null,
  updated_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists content_videos_client_date_idx
  on public.content_videos (client_id, publish_on, day_order);
create index if not exists content_videos_date_idx
  on public.content_videos (publish_on);
create index if not exists content_videos_submission_idx
  on public.content_videos (submission_id);
create unique index if not exists content_videos_legacy_slot_unique
  on public.content_videos (client_id, legacy_slot_id)
  where legacy_slot_id is not null;

alter table public.content_videos enable row level security;

drop policy if exists "content_videos: management" on public.content_videos;
create policy "content_videos: management"
  on public.content_videos for all
  using (public.can_manage_client(client_id))
  with check (public.can_manage_client(client_id));

drop policy if exists "content_videos: staff assigned" on public.content_videos;
create policy "content_videos: staff assigned"
  on public.content_videos for all
  using (public.current_role() = 'staff' and public.is_assigned_staff(client_id))
  with check (public.current_role() = 'staff' and public.is_assigned_staff(client_id));

drop policy if exists "content_videos: videographer reads assigned" on public.content_videos;
create policy "content_videos: videographer reads assigned"
  on public.content_videos for select
  using (public.current_role() = 'videographer' and public.is_assigned_staff(client_id));

drop policy if exists "content_videos: client reads own" on public.content_videos;
create policy "content_videos: client reads own"
  on public.content_videos for select
  using (public.current_role() = 'client' and client_id = public.current_client_id());

create or replace function public.content_videos_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists content_videos_touch_updated_at on public.content_videos;
create trigger content_videos_touch_updated_at
  before update on public.content_videos
  for each row execute procedure public.content_videos_touch_updated_at();

-- ------------------------------------------------------------------
-- 2. Copy every existing slot across, once
-- ------------------------------------------------------------------
-- Blank strings become nulls, so an unfilled hook is "not filled in"
-- rather than an empty answer. The slot's link, if it pointed at an
-- upload, is matched back to that upload through planner_slot_id.
insert into public.content_videos (
  client_id, legacy_slot_id, day_order, title, pillar, description,
  hook, body, cta, wms, scenery, video_set, submission_id
)
select
  p.client_id,
  s.item ->> 'id',
  1,
  nullif(btrim(left(s.item ->> 'title', 200)), ''),
  nullif(btrim(left(s.item ->> 'pillar', 80)), ''),
  nullif(btrim(left(s.item ->> 'description', 4000)), ''),
  nullif(btrim(left(s.item ->> 'hook', 2000)), ''),
  nullif(btrim(left(s.item ->> 'body', 8000)), ''),
  nullif(btrim(left(s.item ->> 'cta', 2000)), ''),
  nullif(btrim(left(s.item ->> 'wms', 200)), ''),
  nullif(btrim(left(s.item ->> 'scenery', 200)), ''),
  nullif(btrim(left(s.item ->> 'set', 80)), ''),
  (
    select sub.id from public.submissions sub
    where sub.client_id = p.client_id
      and sub.planner_slot_id = s.item ->> 'id'
    order by sub.created_at desc
    limit 1
  )
from public.planners p
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(p.content -> 'slots' -> 'items') = 'array'
       then p.content -> 'slots' -> 'items' else '[]'::jsonb end
) as s(item)
where p.client_id is not null
  and coalesce(s.item ->> 'id', '') <> ''
on conflict (client_id, legacy_slot_id) where legacy_slot_id is not null do nothing;

-- ------------------------------------------------------------------
-- 3. Uploads: what kind of deliverable, and where to stream it
-- ------------------------------------------------------------------
alter table public.submissions
  add column if not exists kind text not null default 'video',
  add column if not exists client_decision text,
  add column if not exists client_decided_at timestamptz,
  add column if not exists client_change_rounds integer not null default 0;

do $$
begin
  alter table public.submissions
    add constraint submissions_kind_check check (kind in ('video', 'thumbnail', 'graphic'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.submissions
    add constraint submissions_client_decision_check
    check (client_decision is null or client_decision in ('approved', 'changes_requested'));
exception when duplicate_object then null;
end $$;

alter table public.submission_versions
  add column if not exists stream_url text;

do $$
begin
  alter table public.submission_versions
    add constraint submission_versions_stream_url_check
    check (stream_url is null or (stream_url ~* '^https://' and char_length(stream_url) <= 1000));
exception when duplicate_object then null;
end $$;

-- A new cut wipes the client's last verdict: they approved, or asked
-- for changes on, the old one. And when they can already see the video,
-- they are told the new cut is there — the answer to their changes.
create or replace function public.submission_version_clears_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sub record;
  recipient uuid;
begin
  update public.submissions
     set client_decision = null, client_decided_at = null
   where id = new.submission_id
  returning id, title, client_id, visibility into sub;

  if new.version > 1 and sub.visibility = 'team_and_client' then
    for recipient in
      select id from public.profiles where role = 'client' and client_id = sub.client_id
    loop
      perform public.notify_user(
        recipient,
        'upload_new_version',
        'New version ready to watch',
        '"' || sub.title || '" has been updated. Please take a look.',
        '/app/portal/videos'
      );
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists submission_versions_clear_decision on public.submission_versions;
create trigger submission_versions_clear_decision
  after insert on public.submission_versions
  for each row execute procedure public.submission_version_clears_decision();

-- ------------------------------------------------------------------
-- 4. The client's verdict, gated by their package
-- ------------------------------------------------------------------
-- 'none'    — we post for them: nothing to approve, no change requests.
-- 'approve' — approve only.
-- 'full'    — approve, or ask for changes up to revision_rounds times
--             per video (no limit when revision_rounds is null).
-- No package set yet — treated like full revisions with no limit, which
-- is what a client could already do before packages existed.
create or replace function public.client_revision_mode(target_client_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select revisions from public.client_packages where client_id = target_client_id),
    'unset'
  );
$$;

grant execute on function public.client_revision_mode(uuid) to authenticated;

create or replace function public.client_decide_submission(
  target_submission_id uuid,
  decision text,
  note text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  sub record;
  mode text;
  rounds integer;
  client_name text;
  manager record;
begin
  if public.current_role() <> 'client' then
    raise exception 'Only the client can approve or ask for changes here.';
  end if;

  if decision not in ('approved', 'changes_requested') then
    raise exception 'Unknown decision.';
  end if;

  select id, client_id, title, visibility, current_version, created_by, client_change_rounds
    into sub
    from public.submissions
   where id = target_submission_id;

  if sub.id is null
     or sub.client_id is distinct from public.current_client_id()
     or sub.visibility <> 'team_and_client'
     or sub.current_version < 1 then
    raise exception 'That video is not available to review.';
  end if;

  mode := public.client_revision_mode(sub.client_id);
  rounds := (select revision_rounds from public.client_packages where client_id = sub.client_id);

  if mode = 'none' then
    raise exception 'Reviews are not part of your package.';
  end if;

  if decision = 'changes_requested' then
    if mode = 'approve' then
      raise exception 'Your package includes approval but not change requests.';
    end if;
    if rounds is not null and sub.client_change_rounds >= rounds then
      raise exception 'You have used all % round(s) of changes for this video.', rounds;
    end if;
  end if;

  update public.submissions
     set client_decision = decision,
         client_decided_at = now(),
         client_change_rounds = client_change_rounds + (case when decision = 'changes_requested' then 1 else 0 end)
   where id = sub.id;

  -- A note only travels with a change request; approving is a tick.
  if decision = 'changes_requested' and coalesce(btrim(note), '') <> '' then
    insert into public.submission_feedback (submission_id, version, body, author_id, audience)
    values (sub.id, sub.current_version, left(btrim(note), 4000), auth.uid(), 'client');
  end if;

  select name into client_name from public.clients where id = sub.client_id;

  -- Tell whoever made it, and everyone managing this client.
  perform public.notify_user(
    sub.created_by,
    'client_decision',
    case when decision = 'approved'
         then coalesce(client_name, 'The client') || ' approved "' || sub.title || '"'
         else coalesce(client_name, 'The client') || ' asked for changes on "' || sub.title || '"' end,
    nullif(btrim(note), ''),
    '/app/uploads?client=' || sub.client_id::text
  );

  for manager in
    select p.id from public.profiles p
     where p.id is distinct from sub.created_by
       and (p.role = 'ceo'
            or (p.role in ('operations_manager', 'staff')
                and exists (select 1 from public.client_staff cs
                             where cs.client_id = sub.client_id and cs.staff_id = p.id)))
  loop
    perform public.notify_user(
      manager.id,
      'client_decision',
      case when decision = 'approved'
           then coalesce(client_name, 'The client') || ' approved "' || sub.title || '"'
           else coalesce(client_name, 'The client') || ' asked for changes on "' || sub.title || '"' end,
      nullif(btrim(note), ''),
      '/app/uploads?client=' || sub.client_id::text
    );
  end loop;

  return decision;
end;
$$;

revoke all on function public.client_decide_submission(uuid, text, text) from public;
grant execute on function public.client_decide_submission(uuid, text, text) to authenticated;

-- A client leaves timestamped notes only when their package lets them
-- ask for changes (or has not been set yet — see above). An approve-only
-- or post-for-them client reads the team's replies but cannot start a
-- revisions thread from the side door.
drop policy if exists "submission_feedback: client comment shared" on public.submission_feedback;
create policy "submission_feedback: client comment shared"
  on public.submission_feedback for insert
  with check (
    public.current_role() = 'client'
    and audience = 'client'
    and author_id = auth.uid()
    and exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and s.visibility = 'team_and_client'
        and s.client_id = public.current_client_id()
        and public.client_revision_mode(s.client_id) in ('full', 'unset')
    )
  );

-- ------------------------------------------------------------------
-- 5. Sharing a video sends the client to their Videos page
-- ------------------------------------------------------------------
-- Same trigger as 0028, now pointing at the page with the player and
-- the feedback beside it, and written in the team's voice.
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
      case new.kind when 'thumbnail' then 'New thumbnail ready'
                    when 'graphic' then 'New graphic ready'
                    else 'New video ready to watch' end,
      '"' || new.title || '" - please check it in your Videos.',
      '/app/portal/videos'
    );
  end loop;

  return new;
end;
$$;
