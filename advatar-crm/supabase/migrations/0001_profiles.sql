-- Phase 2: profiles table + auto-provisioning trigger.
-- Run this in the Supabase SQL editor, or via `supabase db push`.

-- Minimal clients stub so the foreign key below has something to
-- point at. Phase 3's migration will replace this with the real,
-- fully-columned clients table (this statement is written so Phase 3
-- can safely `alter table` it further rather than needing to drop it).
create table if not exists clients (
  id uuid primary key default gen_random_uuid()
);

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'client'
    check (role in ('ceo', 'staff', 'videographer', 'client')),
  full_name text,
  avatar_url text,
  client_id uuid references clients (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Note: we deliberately do NOT add a "role='client' implies client_id
-- is not null" check constraint here. The auto-provisioning trigger
-- below inserts every new signup as role='client' with client_id
-- still null — a staff member links the account to an actual client
-- record afterward (via /app/settings/team or the client detail
-- panel, built in a later phase). A brand-new client-role profile
-- with no client_id yet is a valid, expected transient state, not a
-- data error, so it must not be blocked at the database level.

alter table profiles enable row level security;

-- Everyone can read their own profile (needed for role-based routing
-- right after login).
create policy "profiles: read own"
  on profiles for select
  using (auth.uid() = id);

-- Staff/CEO read access to all profiles is added in Phase 3 once the
-- staff/ceo role check is centralized in a helper function shared
-- across every table's policies — intentionally not duplicated here.

create policy "profiles: update own"
  on profiles for update
  using (auth.uid() = id);

-- ---------------------------------------------------------------
-- Auto-provisioning: every new auth.users row gets a matching
-- profiles row with role='client' by default. Real staff / CEO /
-- videographer accounts get their role corrected immediately after
-- invite by the /app/settings/team admin flow (service-role client,
-- see app/settings/team/actions.ts), which runs right after
-- auth.admin.inviteUserByEmail() creates the user.
-- ---------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
