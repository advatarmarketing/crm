-- 0041 — What each client gets.
--
-- One row per client describing their package:
--   * how much say they have over the videos — none (we post for
--     them), approve-only, or full revisions with an optional number
--     of rounds
--   * which extras they pay for — thumbnails; graphics and posters
--   * when we post — set weekdays, every day, or N videos a week,
--     with optional days that carry two videos
--
-- Later work reads this to decide what a client sees: no review
-- buttons for a client we simply post for, no thumbnails section for
-- a client who doesn't get thumbnails, and the video schedule is
-- generated from the posting pattern.
--
-- Plus saved presets, so a new client is set up in one choice.
-- Choosing a preset COPIES its settings onto the client; editing or
-- deleting the preset later never changes a client already set up.
--
-- Who can do what:
--   * CEO, and an operations manager on their own clients: everything.
--   * Assigned staff and videographers: read the client's package
--     (it tells them how many videos are due and when), never change it.
--   * The client: reads their own package, so their portal can show
--     the right things. Never presets — those are internal.
--
-- Weekdays are stored as ISO numbers: 1 = Monday ... 7 = Sunday.
--
-- No defaults for the two big choices (how much say, when we post):
-- every client's package is chosen by a person, never assumed.
--
-- Safe to run twice.

-- ------------------------------------------------------------------
-- 1. Presets
-- ------------------------------------------------------------------
create table if not exists public.package_presets (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null check (char_length(btrim(name)) between 1 and 60),
  revisions            text not null
                         check (revisions in ('none', 'approve', 'full')),
  revision_rounds      integer
                         check (revision_rounds is null or revision_rounds between 1 and 20),
  thumbnails           boolean not null default false,
  graphics             boolean not null default false,
  posting_mode         text not null
                         check (posting_mode in ('weekdays', 'daily', 'per_week')),
  posting_weekdays     smallint[] not null default '{}'
                         check (posting_weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  videos_per_week      integer
                         check (videos_per_week is null or videos_per_week between 1 and 21),
  double_post_weekdays smallint[] not null default '{}'
                         check (double_post_weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint package_presets_rounds_need_full
    check (revision_rounds is null or revisions = 'full'),
  constraint package_presets_weekdays_need_days
    check (posting_mode <> 'weekdays' or cardinality(posting_weekdays) > 0),
  constraint package_presets_per_week_needs_count
    check (posting_mode <> 'per_week' or videos_per_week is not null)
);

create unique index if not exists package_presets_name_unique
  on public.package_presets (lower(btrim(name)));

alter table public.package_presets enable row level security;

drop policy if exists "package_presets: management" on public.package_presets;
create policy "package_presets: management"
  on public.package_presets for all
  using (public.is_management())
  with check (public.is_management());

-- ------------------------------------------------------------------
-- 2. Each client's package
-- ------------------------------------------------------------------
create table if not exists public.client_packages (
  client_id            uuid primary key references public.clients (id) on delete cascade,
  -- Which preset it was started from, for the label only.
  preset_id            uuid references public.package_presets (id) on delete set null,
  revisions            text not null
                         check (revisions in ('none', 'approve', 'full')),
  revision_rounds      integer
                         check (revision_rounds is null or revision_rounds between 1 and 20),
  thumbnails           boolean not null default false,
  graphics             boolean not null default false,
  posting_mode         text not null
                         check (posting_mode in ('weekdays', 'daily', 'per_week')),
  posting_weekdays     smallint[] not null default '{}'
                         check (posting_weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  videos_per_week      integer
                         check (videos_per_week is null or videos_per_week between 1 and 21),
  double_post_weekdays smallint[] not null default '{}'
                         check (double_post_weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  updated_by           uuid references public.profiles (id) on delete set null,
  constraint client_packages_rounds_need_full
    check (revision_rounds is null or revisions = 'full'),
  constraint client_packages_weekdays_need_days
    check (posting_mode <> 'weekdays' or cardinality(posting_weekdays) > 0),
  constraint client_packages_per_week_needs_count
    check (posting_mode <> 'per_week' or videos_per_week is not null)
);

alter table public.client_packages enable row level security;

drop policy if exists "client_packages: management" on public.client_packages;
create policy "client_packages: management"
  on public.client_packages for all
  using (public.can_manage_client(client_id))
  with check (public.can_manage_client(client_id));

-- Read-only for the rest of the team on clients they are on.
drop policy if exists "client_packages: team reads assigned" on public.client_packages;
create policy "client_packages: team reads assigned"
  on public.client_packages for select
  using (public.can_see_client(client_id));

-- Read-only for the client, their own row only.
drop policy if exists "client_packages: client reads own" on public.client_packages;
create policy "client_packages: client reads own"
  on public.client_packages for select
  using (
    public.current_role() = 'client'
    and client_id = public.current_client_id()
  );

-- ------------------------------------------------------------------
-- 3. Keep updated_at honest
-- ------------------------------------------------------------------
create or replace function public.packages_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists client_packages_touch_updated_at on public.client_packages;
create trigger client_packages_touch_updated_at
  before update on public.client_packages
  for each row execute procedure public.packages_touch_updated_at();

drop trigger if exists package_presets_touch_updated_at on public.package_presets;
create trigger package_presets_touch_updated_at
  before update on public.package_presets
  for each row execute procedure public.packages_touch_updated_at();
