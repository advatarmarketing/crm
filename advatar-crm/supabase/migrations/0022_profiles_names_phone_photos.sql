-- 0022: every login has a real name, a phone number field, and a
-- profile photo.
--
-- Run 0016-0021 first.
--
--   1. profiles.full_name is backfilled for every existing account and
--      made NOT NULL, so "Unnamed" can never be rendered again.
--   2. profiles.phone added, for every role.
--   3. A profile-avatars bucket, so a videographer can have a photo.
--      The existing client-avatars bucket is not reused: its write
--      policy is management-only, and a person should be able to
--      change their own picture.
--
-- Run VERIFY_0022.sql afterwards and check every row before treating
-- this as done.

-- =================================================================
-- 1. Names
-- =================================================================
-- Backfill order matters, best source first:
--   a) the name in auth metadata, if the invite carried one
--   b) the email's local part, prettified ("jo.smith" -> "Jo Smith")
--   c) a neutral placeholder, so the NOT NULL below can be applied
--
-- auth.users is readable here because migrations run as the owner.

update public.profiles p
set full_name = trim(u.raw_user_meta_data ->> 'full_name')
from auth.users u
where u.id = p.id
  and (p.full_name is null or btrim(p.full_name) = '')
  and coalesce(trim(u.raw_user_meta_data ->> 'full_name'), '') <> '';

update public.profiles p
set full_name = initcap(
      btrim(
        regexp_replace(
          -- local part, separators to spaces, trailing digits dropped
          regexp_replace(split_part(u.email, '@', 1), '[._+-]+', ' ', 'g'),
          '\s*\d+$', '', 'g'
        )
      )
    )
from auth.users u
where u.id = p.id
  and (p.full_name is null or btrim(p.full_name) = '')
  and coalesce(u.email, '') <> ''
  and btrim(regexp_replace(split_part(u.email, '@', 1), '[._+-]+', ' ', 'g')) <> '';

-- Anything still empty (no metadata, no email) gets a placeholder so
-- the constraint can go on. There should be none of these.
update public.profiles
set full_name = 'Team member'
where full_name is null or btrim(full_name) = '';

alter table public.profiles alter column full_name set not null;

-- Belt and braces: a whitespace-only name would satisfy NOT NULL and
-- still render as blank, which is the actual thing being prevented.
alter table public.profiles drop constraint if exists profiles_full_name_not_blank;
alter table public.profiles
  add constraint profiles_full_name_not_blank check (btrim(full_name) <> '');

-- =================================================================
-- 2. Phone numbers
-- =================================================================
-- Free text on purpose. Numbers arrive as "07700 900123",
-- "+44 7700 900123" and "(0044) 7700900123", and a format check would
-- reject a real number someone needs to store today.

alter table public.profiles
  add column if not exists phone text;

-- =================================================================
-- 3. Profile photos
-- =================================================================

insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', true)
on conflict (id) do nothing;

-- Public read: these are shown in the nav, on assignment rows and in
-- chat, on pages rendered for several different roles. A private
-- bucket would mean minting a signed URL per avatar per render, and
-- a staff photo is not a secret.
drop policy if exists "profile-avatars: public read" on storage.objects;
create policy "profile-avatars: public read"
  on storage.objects for select
  using (bucket_id = 'profile-avatars');

-- Files are stored as `<user_id>.jpg`, so the owner is the filename.
-- storage_path_client_id (0012) parses the first path segment as a
-- uuid; here the whole name minus its extension is the uuid, so this
-- needs its own parser rather than reusing that one.
create or replace function public.storage_object_owner_id(object_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  base text;
begin
  base := split_part(object_name, '.', 1);
  if base !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return null;
  end if;
  return base::uuid;
end;
$$;

grant execute on function public.storage_object_owner_id(text) to authenticated;

-- Your own photo is yours to set.
drop policy if exists "profile-avatars: own write" on storage.objects;
create policy "profile-avatars: own write"
  on storage.objects for all
  using (
    bucket_id = 'profile-avatars'
    and public.storage_object_owner_id(name) = auth.uid()
  )
  with check (
    bucket_id = 'profile-avatars'
    and public.storage_object_owner_id(name) = auth.uid()
  );

-- Management can set anyone's, so a photo can be added on someone's
-- behalf from their detail page.
drop policy if exists "profile-avatars: management write" on storage.objects;
create policy "profile-avatars: management write"
  on storage.objects for all
  using (bucket_id = 'profile-avatars' and public.is_management())
  with check (bucket_id = 'profile-avatars' and public.is_management());

-- =================================================================
-- 4. Updating your own profile
-- =================================================================
-- "profiles: update own" exists from 0001 and covers a person setting
-- their own name, phone and avatar_url. What was missing is
-- management being able to edit somebody else's — the Logins screen
-- has been doing it through the service-role client, which works but
-- means those writes bypass RLS entirely. This makes the same edit
-- expressible under normal permissions.

drop policy if exists "profiles: management update any" on profiles;
create policy "profiles: management update any"
  on profiles for update
  using (public.is_management())
  with check (public.is_management());
