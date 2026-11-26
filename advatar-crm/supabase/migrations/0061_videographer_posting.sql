-- 0061 - A videographer ticks a video as posted, adds where it was
--        posted, and corrects a wrong video link
--
-- For the videographer assigned to a client, on that client's videos:
--
--   * Tick (or untick) a video as posted.
--   * Add the link to each post (Instagram, TikTok, YouTube...), so its
--     views and likes are counted on the Performance tab, and remove a
--     link they added by mistake. The numbers still arrive by
--     themselves (the daily read, or YouTube); typing numbers in by
--     hand stays with the team.
--   * Correct the link on the current version when the wrong one went
--     in, without making a new version. If the client could already
--     see the video, it goes back to the CEO and operations to approve
--     first (the same rule as a new version, 0060), and they are told.
--
-- Everything else on the video stays read-only for them.
--
-- Safe to run twice. Needs 0042, 0046, 0047, 0058 and 0060.

-- -----------------------------------------------------------------
-- 1. Posted
-- -----------------------------------------------------------------
create or replace function public.set_video_posted(target_video uuid, posted boolean)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
  stamp timestamptz;
begin
  if auth.uid() is null or public.current_role() <> 'videographer' then
    raise exception 'Only a videographer ticks a video posted this way.' using errcode = '42501';
  end if;
  select client_id into cid from public.content_videos where id = target_video;
  if cid is null or not public.is_assigned_staff(cid) then
    raise exception 'You can''t change that video.' using errcode = '42501';
  end if;
  update public.content_videos
     set posted_at = case when posted then coalesce(posted_at, now()) else null end,
         updated_by = auth.uid()
   where id = target_video
  returning posted_at into stamp;
  return stamp;
end;
$$;

revoke all on function public.set_video_posted(uuid, boolean) from public;
revoke all on function public.set_video_posted(uuid, boolean) from anon;
grant execute on function public.set_video_posted(uuid, boolean) to authenticated;

-- -----------------------------------------------------------------
-- 2. Where it was posted
-- -----------------------------------------------------------------
-- Adding a link, and removing one of their own. No update policy: the
-- numbers are filled in by the app's server (the daily read, YouTube)
-- or typed by the team.
drop policy if exists "video_posts: videographer adds assigned" on public.video_posts;
create policy "video_posts: videographer adds assigned" on public.video_posts
  for insert with check (
    public.current_role() = 'videographer'
    and public.is_assigned_staff(client_id)
    and created_by = auth.uid()
    and views is null and likes is null and comments is null and shares is null and saves is null
  );

drop policy if exists "video_posts: videographer removes own" on public.video_posts;
create policy "video_posts: videographer removes own" on public.video_posts
  for delete using (
    public.current_role() = 'videographer'
    and public.is_assigned_staff(client_id)
    and created_by = auth.uid()
  );

-- -----------------------------------------------------------------
-- 3. Correcting the video link
-- -----------------------------------------------------------------
create or replace function public.fix_video_link(target_video uuid, link text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  sub record;
  clean text := btrim(coalesce(link, ''));
  recipient uuid;
begin
  if auth.uid() is null or public.current_role() <> 'videographer' then
    raise exception 'Only a videographer corrects links this way.' using errcode = '42501';
  end if;
  if clean !~* '^https?://' or length(clean) > 1000 then
    raise exception 'That doesn''t look like a video link.' using errcode = '22023';
  end if;

  select cv.id, cv.client_id, cv.submission_id into v
  from public.content_videos cv
  where cv.id = target_video;
  if v.id is null or not public.is_assigned_staff(v.client_id) then
    raise exception 'You can''t change that video.' using errcode = '42501';
  end if;

  select s.id, s.title, s.client_id, s.current_version, s.visibility into sub
  from public.submissions s
  where s.id = v.submission_id
  for update;
  if sub.id is null or coalesce(sub.current_version, 0) < 1 then
    raise exception 'That video has no link to correct yet. Add one first.' using errcode = '22023';
  end if;

  update public.submission_versions
     set url = clean, stream_url = null
   where submission_id = sub.id and version = sub.current_version;

  -- A link the client could see is a video nobody has approved any
  -- more: back to the CEO and operations, who are told.
  if sub.visibility = 'team_and_client' and not public.videographer_can_share() then
    update public.submissions
       set visibility = 'team_only', status = 'submitted', updated_at = now()
     where id = sub.id;
  end if;

  for recipient in
    select p.id from public.profiles p where p.role = 'ceo'
    union
    select cs.staff_id from public.client_staff cs
    join public.profiles p on p.id = cs.staff_id
    where cs.client_id = sub.client_id and p.role in ('operations_manager', 'staff')
  loop
    perform public.notify_user(
      recipient,
      'upload_new_version',
      'Link corrected: ' || sub.title,
      concat_ws(' ' || chr(183) || ' ', (select name from public.clients where id = sub.client_id), 'ready to review'),
      '/app/uploads'
    );
  end loop;

  return sub.current_version;
end;
$$;

revoke all on function public.fix_video_link(uuid, text) from public;
revoke all on function public.fix_video_link(uuid, text) from anon;
grant execute on function public.fix_video_link(uuid, text) to authenticated;
