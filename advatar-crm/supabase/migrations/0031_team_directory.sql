-- 0031: everyone can see who they are talking to.
--
-- Run 0016-0030 first.
--
-- Run VERIFY_0031.sql afterwards and check every row before treating
-- this as done.

-- =================================================================
-- The bug
-- =================================================================
-- Reported as: in "The Crew" message tab, every message says
-- "Someone" instead of the person's name.
--
-- "Someone" is the fallback the app renders when it cannot find a
-- name for an author id. It could not find one because a videographer
-- has no way to read anybody else's profile row:
--
--   "profiles: read own"           auth.uid() = id
--   "profiles: staff/ceo read all" is_staff_or_ceo()
--
-- and is_staff_or_ceo() means ceo, staff and operations_manager. A
-- videographer matches neither policy for anyone but themselves, so
-- the name lookup comes back empty and every message in the channel
-- is from "Someone". The Crew is the videographers' channel, which is
-- why it shows up there first and hardest.
--
-- The same gap hits a CLIENT, and worse, on a page written later:
-- every reply from the team on their own video's comment thread also
-- renders as "Someone". Confirmed by running both as those roles.
--
-- =================================================================
-- Why a view and not a wider policy
-- =================================================================
-- The obvious fix is to let videographers and clients select from
-- `profiles`. It is the wrong one, because row-level security cannot
-- restrict COLUMNS: that policy would hand them every colleague's
-- phone number, notification email and availability along with the
-- name. A client should not have the team's phone numbers because
-- somebody wanted a name on a comment.
--
-- So: a view carrying only the four display fields, and no policy
-- change at all.
--
-- The view deliberately does NOT use security_invoker. A view runs
-- with its owner's privileges by default, and its owner
-- (postgres) owns `profiles`, so the underlying policies are not
-- applied to whoever queries it. That is the mechanism doing the work
-- here — and the reason the column list below is the whole of the
-- security boundary. Nothing may be added to it without asking
-- whether a client should see it.

create or replace view public.team_directory as
  select
    id,
    full_name,
    role,
    avatar_url
  from public.profiles
  -- Client logins are not team members, and nobody needs to look one
  -- up by name. Excluding them also means a client cannot use this to
  -- enumerate other clients.
  where role in ('ceo', 'operations_manager', 'staff', 'videographer');

-- Readable by anyone signed in. Not by `anon`: there is no signed-out
-- page in this app that needs a staff list, and a public directory of
-- who works here is not something to hand out by accident.
revoke all on public.team_directory from anon;
grant select on public.team_directory to authenticated;

comment on view public.team_directory is
  'Display-only names, roles and photos for team members. Exposes four '
  'columns on purpose: profiles also holds phone, notification email and '
  'availability, none of which a client or a colleague needs in order to '
  'see who wrote a message. Runs with the owner''s privileges, so it is '
  'the column list that limits what is visible, not RLS.';
