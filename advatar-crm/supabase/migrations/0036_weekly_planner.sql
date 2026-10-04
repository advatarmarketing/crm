-- 0036_weekly_planner.sql
--
-- The Schedule tab: a personal week, planned by the hour.
--
-- Two tables, both private to one person in exactly the way notes are
-- (0032): one owner-only policy each, so the CEO cannot read a
-- videographer's week and nobody has to remember to filter by owner.
--
-- This is deliberately NOT the same thing as schedule_events (0018).
-- That table is the company diary — shoots, client calls, deadlines,
-- things other people need to see and plan around. This one is how
-- somebody lays out their own day, most of which is nobody else's
-- business. The bridge between them is one nullable column,
-- schedule_event_id, set only when a block is deliberately pushed
-- across.

-- =================================================================
-- 1. Saved items
-- =================================================================
-- The things that go into a week again and again — gym, Qur'an, deep
-- work, a team call. Dropping one onto the grid fills in its name,
-- colour, length and calendar kind, so a recurring part of the week
-- costs one click rather than a form.

create table if not exists public.planner_presets (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  color       text check (color is null or color in ('red','orange','gold','green','teal','blue','purple','pink')),

  -- How long it usually runs. Minutes, so a 25-minute block is
  -- representable and the grid never has to parse a duration string.
  default_minutes integer not null default 60 check (default_minutes between 5 and 1440),

  -- Which kind of entry it becomes IF it is ever pushed to the
  -- company calendar. Constrained to schedule_events' own list (0018)
  -- rather than a looser one, so a push can never be refused for
  -- carrying a kind that table does not accept.
  calendar_kind text not null default 'other'
    check (calendar_kind in ('shoot','call','meeting','deadline','other')),

  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Two saved items with the same name are one saved item added twice.
-- Per person, so everyone may have their own "Gym".
create unique index if not exists planner_presets_owner_name
  on public.planner_presets (owner_id, lower(btrim(name)));

create index if not exists planner_presets_owner_position
  on public.planner_presets (owner_id, position);

-- =================================================================
-- 2. The blocks themselves
-- =================================================================
-- A block is either:
--   * a one-off, which has a date; or
--   * a weekly routine, which has a weekday and no date.
--
-- Both carry a weekday so the grid can place them in one pass without
-- having to work out which kind it is holding. For a one-off the
-- weekday is derived from the date by the trigger below rather than
-- trusted from the caller — a block that said Tuesday while its date
-- was a Wednesday would draw in the wrong column and be impossible to
-- find.
--
-- Times are minutes from midnight rather than timestamps. A routine
-- has no date to hang a timestamp on, and "gym at 06:30 on Mondays"
-- should stay at 06:30 through a clock change rather than drifting to
-- 05:30 for half the year.

create table if not exists public.planner_blocks (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  notes       text not null default '' check (char_length(notes) <= 2000),

  -- 0 = Monday, to match the grid, which starts on Monday.
  weekday     smallint not null check (weekday between 0 and 6),
  start_minute integer not null check (start_minute between 0 and 1439),
  end_minute   integer not null check (end_minute between 1 and 1440),

  -- Null exactly when this repeats every week.
  on_date     date,
  repeats     boolean not null default false,

  color       text check (color is null or color in ('red','orange','gold','green','teal','blue','purple','pink')),
  calendar_kind text not null default 'other'
    check (calendar_kind in ('shoot','call','meeting','deadline','other')),

  -- Set only when this block has been pushed to the company calendar.
  -- ON DELETE SET NULL, so deleting the calendar entry from the
  -- Calendar tab unlinks the block rather than deleting somebody's
  -- plan for their morning.
  schedule_event_id uuid references public.schedule_events(id) on delete set null,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint planner_blocks_ends_after_start check (end_minute > start_minute),

  -- The two shapes, and nothing in between: a repeating block with a
  -- date would silently stop repeating, and a one-off without one
  -- would never appear in any week.
  constraint planner_blocks_date_matches_repeat
    check ((repeats and on_date is null) or (not repeats and on_date is not null))
);

create index if not exists planner_blocks_owner_date
  on public.planner_blocks (owner_id, on_date);

create index if not exists planner_blocks_owner_repeating
  on public.planner_blocks (owner_id, weekday) where repeats;

-- Keeps weekday honest for a one-off. extract(isodow) gives 1 for
-- Monday through 7 for Sunday; the grid counts from 0.
create or replace function public.set_planner_block_weekday()
returns trigger
language plpgsql
as $$
begin
  if new.on_date is not null then
    new.weekday := extract(isodow from new.on_date)::int - 1;
  end if;
  return new;
end;
$$;

drop trigger if exists planner_blocks_weekday on public.planner_blocks;
create trigger planner_blocks_weekday
  before insert or update of on_date on public.planner_blocks
  for each row execute procedure public.set_planner_block_weekday();

-- =================================================================
-- 3. Keeping "last updated" honest
-- =================================================================
-- touch_updated_at() is 0018's, redefined identically here so this
-- migration does not depend on 0018 having been run in full.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists planner_presets_touch on public.planner_presets;
create trigger planner_presets_touch
  before update on public.planner_presets
  for each row execute procedure public.touch_updated_at();

drop trigger if exists planner_blocks_touch on public.planner_blocks;
create trigger planner_blocks_touch
  before update on public.planner_blocks
  for each row execute procedure public.touch_updated_at();

-- =================================================================
-- 4. Privacy
-- =================================================================
-- One policy each, "owner only", covering select, insert, update and
-- delete together. Nobody else — not the CEO, not an operations
-- manager — reads somebody's week. A table with RLS on and no policy
-- is readable by nobody but the service role, so these are what make
-- the tables usable at all, not what restricts them.

alter table public.planner_presets enable row level security;
alter table public.planner_blocks enable row level security;

drop policy if exists "planner_presets: owner only" on public.planner_presets;
create policy "planner_presets: owner only"
  on public.planner_presets for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "planner_blocks: owner only" on public.planner_blocks;
create policy "planner_blocks: owner only"
  on public.planner_blocks for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Nothing is granted to anon. A signed-out visitor has no auth.uid(),
-- so every policy above is false for them anyway; this says so out
-- loud rather than leaving it to be inferred.
revoke all on public.planner_presets from anon;
revoke all on public.planner_blocks from anon;
