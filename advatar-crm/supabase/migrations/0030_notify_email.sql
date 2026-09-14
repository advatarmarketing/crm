-- 0030: an address to be notified at, and the one hand-off that
-- wasn't telling anybody.
--
-- Run 0016-0029 first.
--
-- Run VERIFY_0030.sql afterwards and check every row before treating
-- this as done.

-- =================================================================
-- 1. profiles.notify_email
-- =================================================================
-- Email already worked: the triggers in 0025 and 0028 raise a
-- notification with `email_pending`, and /api/notifications/flush
-- drains the queue through Resend. What it had no way of knowing was
-- WHERE to send.
--
-- Until now it used the login address from auth.users, which is the
-- wrong thing to rely on for two reasons:
--
--   * a login is often a shared or made-up address — a client handed
--     "brightco@" to sign in with is not necessarily the person who
--     wants to hear that a video is ready;
--   * changing it means changing how somebody signs in, which is a
--     much bigger deal than changing where mail goes.
--
-- So this is a separate, optional field: "where should we write to
-- you". Blank means fall back to the login address, so nobody has to
-- fill it in for email to work, and filling it in never affects
-- signing in.
--
-- Every role gets one. A client wants to hear that their video is
-- ready; a videographer wants to hear that feedback has landed; the
-- CEO and the operations manager want to hear about both.

alter table profiles
  add column if not exists notify_email text;

-- Loose on purpose. This is a "did you obviously mistype it" check,
-- not an attempt to validate email addresses in a regex — that is a
-- famously bad idea, and the real test of an address is whether mail
-- to it arrives. Blank is stored as NULL by the app, and NULL passes.
do $$
begin
  alter table public.profiles
    add constraint profiles_notify_email_shape
    check (
      notify_email is null
      or notify_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    );
exception
  when duplicate_object then null;
end
$$;

-- No new policies are needed, and that is worth stating rather than
-- leaving to be discovered:
--
--   "profiles: update own" (0026) lets anybody edit their own row,
--   with `role` and `client_id` pinned. notify_email is neither, so
--   every role can set their own address and none of them can
--   escalate by doing it.
--
--   "profiles: management update any" (0022) is how a CEO or an
--   operations manager fills it in on somebody's behalf — which is
--   what makes this workable for a client who will never open the
--   settings page.
--
-- is_management() is CEO + operations manager, so staff cannot set
-- other people's addresses. Their own, yes.

-- =================================================================
-- 2. Telling the client when a new cut lands
-- =================================================================
-- The gap. 0028 tells the client the moment a video is SHARED with
-- them, and tells the team on every new version — but a v2 of a video
-- already shared told the client nothing. From where the client sits
-- that is exactly the event they care about: the thing they asked for
-- has been redone.
--
-- Folded into notify_new_version rather than added as a second
-- trigger on the same table, so there is one function that answers
-- "who hears about a new cut" instead of two that have to agree.

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
  select s.id, s.title, s.client_id, s.created_by, s.visibility
    into parent
  from public.submissions s
  where s.id = new.submission_id;

  if parent.id is null then
    return new;
  end if;

  select name into client_name from public.clients where id = parent.client_id;

  -- The team: the CEO always, plus whoever is assigned to the client
  -- — except the videographer who just uploaded, whom notify_user()
  -- already refuses to notify about their own action.
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
      concat_ws(' ' || chr(183) || ' ', client_name, 'ready to review'),
      '/app/uploads'
    );
  end loop;

  -- The client, but only on a video they can already see, and never
  -- on the first version — v1 of a shared submission is covered by
  -- the share itself (submitWorkAction, or submissions_shared_notify),
  -- and sending both would mean two emails for one event.
  if parent.visibility = 'team_and_client' and new.version > 1 then
    for recipient in
      select id from public.profiles
      where role = 'client' and client_id = parent.client_id
    loop
      perform public.notify_user(
        recipient,
        'upload_new_version_client',
        'An updated cut of "' || parent.title || '" is ready',
        'Version ' || new.version || ' is on your Uploads tab.',
        '/app/portal/uploads'
      );
    end loop;
  end if;

  return new;
end;
$$;

-- The trigger itself is unchanged from 0028; re-asserted so this file
-- is correct on a database where that one was somehow missed.
drop trigger if exists submission_versions_notify on submission_versions;
create trigger submission_versions_notify
  after insert on submission_versions
  for each row execute procedure public.notify_new_version();
