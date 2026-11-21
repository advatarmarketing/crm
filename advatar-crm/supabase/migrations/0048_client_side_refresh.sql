-- 0048 - The client side refresh
--
--   1. Files in five sections: Assets, Raw Footage, Invoices,
--      Proposals, Contracts (client_assets.section).
--   2. Content Hub results: which platforms each client posts on,
--      connected social accounts (tokens kept apart and encrypted),
--      a daily snapshot of followers, and recent posts.
--   3. The guarantee in the Content Plan, now off for every client
--      unless switched on (on for Mr 247).
--   4. (nothing — the menu order is in the app)
--   5. Whether a client has seen the welcome and app tour, saved
--      against their account so it shows once, on any device.
--
-- Safe to run twice. Needs 0028 (client files) and 0029.

-- =================================================================
-- 1. Files sections
-- =================================================================

alter table public.client_assets
  add column if not exists section text not null default 'assets';

alter table public.client_assets drop constraint if exists client_assets_section_check;
alter table public.client_assets
  add constraint client_assets_section_check
  check (section in ('assets', 'raw_footage', 'invoices', 'proposals', 'contracts'));

create index if not exists client_assets_section_idx on public.client_assets (client_id, section, created_at desc);

-- A client can still hand over their own logos and footage, but
-- invoices, proposals and contracts only ever come from us.
drop policy if exists "client_assets: client upload own" on public.client_assets;
create policy "client_assets: client upload own"
  on public.client_assets for insert
  with check (
    public.current_role() = 'client'
    and client_id = public.current_client_id()
    and visibility = 'team_and_client'
    and uploaded_by = auth.uid()
    and section in ('assets', 'raw_footage')
  );

-- The "new material" notification now opens the right section.
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
        case new.section
          when 'invoices' then 'New invoice in your Files'
          when 'proposals' then 'New proposal in your Files'
          when 'contracts' then 'New contract in your Files'
          else 'New material on your project'
        end,
        new.title,
        '/app/portal/uploads?section=' || new.section
      );
    end loop;
  end if;

  return new;
end;
$$;

-- =================================================================
-- 2. Content Hub: social results
-- =================================================================

-- Which platforms we post on for this client. Only these show on their
-- dashboard. Chosen by the team on the client's Performance tab.
alter table public.clients
  add column if not exists social_platforms text[] not null default '{}';

alter table public.clients drop constraint if exists clients_social_platforms_check;
alter table public.clients
  add constraint clients_social_platforms_check
  check (social_platforms <@ array['instagram', 'facebook', 'tiktok']::text[]);

-- One connected account per platform per client. Names and status
-- only: the client and the team on the client can read this.
create table if not exists public.social_connections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  platform text not null check (platform in ('instagram', 'facebook', 'tiktok')),
  account_name text,
  account_handle text,
  avatar_url text,
  status text not null default 'connected' check (status in ('connected', 'needs_reconnect')),
  connected_by uuid references public.profiles (id) on delete set null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error text,
  unique (client_id, platform)
);

alter table public.social_connections enable row level security;

drop policy if exists "social_connections: team read" on public.social_connections;
create policy "social_connections: team read" on public.social_connections
  for select using (public.current_role() <> 'client' and public.can_see_client(client_id));

drop policy if exists "social_connections: client read own" on public.social_connections;
create policy "social_connections: client read own" on public.social_connections
  for select using (public.current_role() = 'client' and client_id = public.current_client_id());

-- The access itself. Encrypted by the app before it is written, and
-- with row level security on and NO policies, so no signed-in person
-- can read a row at all — only the server's service key can.
create table if not exists public.social_tokens (
  connection_id uuid primary key references public.social_connections (id) on delete cascade,
  account_id text not null,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  refresh_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.social_tokens enable row level security;

-- A Facebook login that manages several Pages waits here (for 30
-- minutes) while the person picks the right one. Server only.
create table if not exists public.social_pending (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  user_token text not null,
  options jsonb not null default '[]',
  created_at timestamptz not null default now()
);

alter table public.social_pending enable row level security;

-- Followers on each account, once a day. Kept even if an account is
-- disconnected, so growth carries on when it is connected again.
create table if not exists public.social_snapshots (
  client_id uuid not null references public.clients (id) on delete cascade,
  platform text not null check (platform in ('instagram', 'facebook', 'tiktok')),
  day date not null,
  followers bigint,
  following bigint,
  posts_count bigint,
  taken_at timestamptz not null default now(),
  primary key (client_id, platform, day)
);

alter table public.social_snapshots enable row level security;

drop policy if exists "social_snapshots: team read" on public.social_snapshots;
create policy "social_snapshots: team read" on public.social_snapshots
  for select using (public.current_role() <> 'client' and public.can_see_client(client_id));

drop policy if exists "social_snapshots: client read own" on public.social_snapshots;
create policy "social_snapshots: client read own" on public.social_snapshots
  for select using (public.current_role() = 'client' and client_id = public.current_client_id());

-- Recent posts and their numbers, refreshed each day.
create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  platform text not null check (platform in ('instagram', 'facebook', 'tiktok')),
  external_id text not null,
  posted_at timestamptz not null,
  caption text,
  thumbnail_url text,
  permalink text,
  is_video boolean not null default false,
  likes bigint,
  comments bigint,
  views bigint,
  shares bigint,
  updated_at timestamptz not null default now(),
  unique (client_id, platform, external_id)
);

create index if not exists social_posts_client_idx on public.social_posts (client_id, posted_at desc);

alter table public.social_posts enable row level security;

drop policy if exists "social_posts: team read" on public.social_posts;
create policy "social_posts: team read" on public.social_posts
  for select using (public.current_role() <> 'client' and public.can_see_client(client_id));

drop policy if exists "social_posts: client read own" on public.social_posts;
create policy "social_posts: client read own" on public.social_posts
  for select using (public.current_role() = 'client' and client_id = public.current_client_id());

-- Nobody writes to these four from the browser: the server's daily
-- refresh and the connect flow do, with the service key.

-- =================================================================
-- 3. Guarantee: off unless switched on
-- =================================================================

alter table public.clients
  add column if not exists show_guarantee boolean not null default false;

-- Mr 247 keeps theirs. Matches "Mr 247", "Mr. 247", "MR247" and so on.
update public.clients
set show_guarantee = true
where regexp_replace(lower(name), '[^a-z0-9]', '', 'g') like 'mr247%';

-- =================================================================
-- 5. Welcome and app tour, once per account
-- =================================================================

alter table public.profiles
  add column if not exists tour_seen_at timestamptz;

-- Through a function rather than "update own", which deliberately
-- guards which profile columns a person can change.
create or replace function public.mark_tour_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set tour_seen_at = coalesce(tour_seen_at, now()) where id = auth.uid();
$$;

revoke all on function public.mark_tour_seen() from public;
grant execute on function public.mark_tour_seen() to authenticated;
