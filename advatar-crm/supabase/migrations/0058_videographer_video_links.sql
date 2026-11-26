-- 0058 - A videographer adds the video link to the videos they film
--
-- Until now a videographer could look at a client's video schedule but
-- not touch it: the link behind each video was added by the CEO,
-- operations or the staff on that client. This lets the videographer
-- assigned to a client add the link to one of its videos, and later
-- links as new versions, from the video itself.
--
-- Deliberately narrow. They still cannot change the script, dates,
-- pillar or posted tick, cannot send anything to the client (that is
-- still the team's call, or 0047's switch on the Uploads page), and
-- cannot approve anything. What they can do on a video's upload is the
-- same as on an upload of their own: watch it, read the notes, tick
-- off the changes asked for and add their own.
--
-- Safe to run twice. Needs 0020, 0028, 0042 and 0047.

-- -----------------------------------------------------------------
-- 1. "This upload is behind a video of a client I film for"
-- -----------------------------------------------------------------
-- security definer so the policies below can look at content_videos
-- without going through its own policies.
create or replace function public.films_submission(target_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() = 'videographer'
    and exists (
      select 1 from public.content_videos cv
      where cv.submission_id = target_submission_id
        and public.is_assigned_staff(cv.client_id)
    );
$$;

revoke all on function public.films_submission(uuid) from public;
revoke all on function public.films_submission(uuid) from anon;
grant execute on function public.films_submission(uuid) to authenticated;

-- -----------------------------------------------------------------
-- 2. Seeing the upload behind the video, even if someone else added it
-- -----------------------------------------------------------------
-- Each of these sits beside the "own upload" policy from 0020/0028 and
-- only ever adds to it.
drop policy if exists "submissions: videographer reads filmed" on public.submissions;
create policy "submissions: videographer reads filmed" on public.submissions
  for select using (public.films_submission(id));

drop policy if exists "submission_versions: videographer reads filmed" on public.submission_versions;
create policy "submission_versions: videographer reads filmed" on public.submission_versions
  for select using (public.films_submission(submission_id));

drop policy if exists "submission_feedback: videographer reads filmed" on public.submission_feedback;
create policy "submission_feedback: videographer reads filmed" on public.submission_feedback
  for select using (public.films_submission(submission_id));

-- The changes to make: theirs to tick off and add to, never to delete,
-- and never one dressed up as coming from a reviewer's note.
drop policy if exists "submission_checklist: videographer reads filmed" on public.submission_checklist;
create policy "submission_checklist: videographer reads filmed" on public.submission_checklist
  for select using (public.films_submission(submission_id));

drop policy if exists "submission_checklist: videographer ticks filmed" on public.submission_checklist;
create policy "submission_checklist: videographer ticks filmed" on public.submission_checklist
  for update using (public.films_submission(submission_id))
  with check (public.films_submission(submission_id));

drop policy if exists "submission_checklist: videographer adds filmed" on public.submission_checklist;
create policy "submission_checklist: videographer adds filmed" on public.submission_checklist
  for insert with check (public.films_submission(submission_id) and feedback_id is null);

-- -----------------------------------------------------------------
-- 3. Adding the link
-- -----------------------------------------------------------------
-- One call does the whole thing, so it either all happens or none of
-- it does: the first link makes the upload behind the video (kept to
-- the team until someone sends it to the client) and ties it to the
-- video; every later link is a new version of that upload. The usual
-- triggers then run as for any upload: the CEO and the staff on the
-- client are told there is something to review, the client's last
-- verdict is cleared, and the video's Film and Edit steps are ticked.
--
-- Only the videographer assigned to the video's client may call it.
-- The app checks the link is a real one before it gets here; this
-- checks it again, roughly.
create or replace function public.add_video_link(target_video uuid, link text, fallback_title text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  sub_id uuid;
  next_version integer;
  clean text := btrim(coalesce(link, ''));
begin
  if auth.uid() is null or public.current_role() <> 'videographer' then
    raise exception 'Only a videographer adds links this way.' using errcode = '42501';
  end if;
  if clean !~* '^https?://' or length(clean) > 1000 then
    raise exception 'That doesn''t look like a video link.' using errcode = '22023';
  end if;

  select cv.id, cv.client_id, cv.title, cv.submission_id
  into v
  from public.content_videos cv
  where cv.id = target_video
  for update;
  if not found or not public.is_assigned_staff(v.client_id) then
    raise exception 'You can''t add a link to that video.' using errcode = '42501';
  end if;

  sub_id := v.submission_id;
  if sub_id is not null then
    select coalesce(s.current_version, 0) + 1 into next_version
    from public.submissions s
    where s.id = sub_id
    for update;
    if not found then
      sub_id := null;
    end if;
  end if;

  if sub_id is null then
    insert into public.submissions (title, client_id, created_by, status, visibility)
    values (
      left(coalesce(nullif(btrim(v.title), ''), nullif(btrim(fallback_title), ''), 'Video'), 200),
      v.client_id,
      auth.uid(),
      'submitted',
      'team_only'
    )
    returning id into sub_id;
    next_version := 1;
  end if;

  insert into public.submission_versions (submission_id, version, url, submitted_by)
  values (sub_id, next_version, clean, auth.uid());

  if v.submission_id is distinct from sub_id then
    update public.content_videos
    set submission_id = sub_id, updated_by = auth.uid()
    where id = v.id;
  end if;

  return next_version;
end;
$$;

revoke all on function public.add_video_link(uuid, text, text) from public;
revoke all on function public.add_video_link(uuid, text, text) from anon;
grant execute on function public.add_video_link(uuid, text, text) to authenticated;
