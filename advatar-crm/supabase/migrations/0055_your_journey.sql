-- 0055 - Your Journey: where each person on the team is, and where they
-- can go.
--
-- journey_paths     Videographer and Sales to start with; the CEO can
--                   add more.
-- journey_levels    The steps along a path: what the level means, what
--                   you can do, the client range, the earnings range in
--                   pounds (always a range, never one figure), whether
--                   it's paid, and the "to move up" checklist. All
--                   placeholders until the CEO edits them.
-- journey_private   CEO ONLY. Which level is the minimum the business
--                   needs from someone. Nobody else can read this table
--                   at all; staff only ever see "First goal: get paid"
--                   on the first paid level.
-- journey_members   Who is on which path and level. Set by the CEO or
--                   an operations manager.
-- journey_reached   The date each level was reached (filled in
--                   automatically when someone is moved up).
-- journey_ticks     "To move up" steps a person has ticked. They show as
--                   waiting for sign-off until the CEO or an operations
--                   manager confirms them.
-- journey_videos    The video progress slot: where I started, what I
--                   make now, videos I want to make next.
--
-- Clients never see any of it. Safe to run twice.

-- ------------------------------------------------------------------
-- Paths and levels
-- ------------------------------------------------------------------
create table if not exists public.journey_paths (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_-]{2,40}$'),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  description text check (description is null or char_length(description) <= 1000),
  clients_word text not null default 'clients' check (char_length(clients_word) <= 60),
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.journey_levels (
  id uuid primary key default gen_random_uuid(),
  path_id uuid not null references public.journey_paths (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_-]{2,40}$'),
  position int not null default 0,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  summary text check (summary is null or char_length(summary) <= 2000),
  can_do text[] not null default '{}',
  clients_min int check (clients_min is null or clients_min >= 0),
  clients_max int check (clients_max is null or clients_max >= 0),
  clients_note text check (clients_note is null or char_length(clients_note) <= 120),
  earn_min int check (earn_min is null or earn_min >= 0),
  earn_max int check (earn_max is null or earn_max >= 0),
  paid boolean not null default true,
  vision boolean not null default false,
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  updated_at timestamptz not null default now(),
  unique (path_id, key)
);

create index if not exists journey_levels_path_idx on public.journey_levels (path_id, position);

alter table public.journey_paths enable row level security;
alter table public.journey_levels enable row level security;

drop policy if exists "journey_paths: team reads" on public.journey_paths;
create policy "journey_paths: team reads" on public.journey_paths
  for select using (public.current_role() in ('ceo', 'operations_manager', 'staff', 'videographer'));
drop policy if exists "journey_paths: ceo writes" on public.journey_paths;
create policy "journey_paths: ceo writes" on public.journey_paths
  for all using (public.is_ceo_role()) with check (public.is_ceo_role());

drop policy if exists "journey_levels: team reads" on public.journey_levels;
create policy "journey_levels: team reads" on public.journey_levels
  for select using (public.current_role() in ('ceo', 'operations_manager', 'staff', 'videographer'));
drop policy if exists "journey_levels: ceo writes" on public.journey_levels;
create policy "journey_levels: ceo writes" on public.journey_levels
  for all using (public.is_ceo_role()) with check (public.is_ceo_role());

grant select, insert, update, delete on public.journey_paths, public.journey_levels to authenticated;

-- ------------------------------------------------------------------
-- The CEO's private marker
-- ------------------------------------------------------------------
create table if not exists public.journey_private (
  path_id uuid primary key references public.journey_paths (id) on delete cascade,
  minimum_level_id uuid references public.journey_levels (id) on delete set null,
  note text check (note is null or char_length(note) <= 2000),
  updated_at timestamptz not null default now()
);

alter table public.journey_private enable row level security;

drop policy if exists "journey_private: ceo only" on public.journey_private;
create policy "journey_private: ceo only" on public.journey_private
  for all using (public.is_ceo_role()) with check (public.is_ceo_role());

grant select, insert, update, delete on public.journey_private to authenticated;

-- ------------------------------------------------------------------
-- People on a path
-- ------------------------------------------------------------------
create table if not exists public.journey_members (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  path_id uuid not null references public.journey_paths (id) on delete cascade,
  level_id uuid references public.journey_levels (id) on delete set null,
  started_on date not null default current_date,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.journey_reached (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  level_id uuid not null references public.journey_levels (id) on delete cascade,
  reached_on date not null default current_date,
  primary key (profile_id, level_id)
);

create table if not exists public.journey_ticks (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  level_id uuid not null references public.journey_levels (id) on delete cascade,
  step_id text not null check (char_length(step_id) between 1 and 80),
  status text not null default 'pending' check (status in ('pending', 'confirmed')),
  ticked_at timestamptz not null default now(),
  confirmed_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz,
  primary key (profile_id, level_id, step_id)
);

create table if not exists public.journey_videos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('started', 'now', 'next')),
  url text check (url is null or char_length(url) <= 1000),
  title text not null check (char_length(btrim(title)) between 1 and 140),
  note text check (note is null or char_length(note) <= 1000),
  level_id uuid references public.journey_levels (id) on delete set null,
  added_at timestamptz not null default now()
);

create index if not exists journey_videos_profile_idx on public.journey_videos (profile_id, added_at);

alter table public.journey_members enable row level security;
alter table public.journey_reached enable row level security;
alter table public.journey_ticks enable row level security;
alter table public.journey_videos enable row level security;

-- Your own, or everyone's if you're management. Only management sets
-- someone's path and level.
drop policy if exists "journey_members: own or management reads" on public.journey_members;
create policy "journey_members: own or management reads" on public.journey_members
  for select using (profile_id = auth.uid() or public.is_management());
drop policy if exists "journey_members: management writes" on public.journey_members;
create policy "journey_members: management writes" on public.journey_members
  for all using (public.is_management()) with check (public.is_management());

drop policy if exists "journey_reached: own or management reads" on public.journey_reached;
create policy "journey_reached: own or management reads" on public.journey_reached
  for select using (profile_id = auth.uid() or public.is_management());
drop policy if exists "journey_reached: management writes" on public.journey_reached;
create policy "journey_reached: management writes" on public.journey_reached
  for all using (public.is_management()) with check (public.is_management());

drop policy if exists "journey_ticks: own or management" on public.journey_ticks;
create policy "journey_ticks: own or management" on public.journey_ticks
  for all
  using (profile_id = auth.uid() or public.is_management())
  with check (profile_id = auth.uid() or public.is_management());

drop policy if exists "journey_videos: own or management" on public.journey_videos;
create policy "journey_videos: own or management" on public.journey_videos
  for all
  using (profile_id = auth.uid() or public.is_management())
  with check (profile_id = auth.uid() or public.is_management());

grant select, insert, update, delete on public.journey_members, public.journey_reached, public.journey_ticks, public.journey_videos to authenticated;

-- Only management signs a step off; a person can tick and untick their
-- own steps while they're waiting, but not touch a confirmed one.
create or replace function public.journey_ticks_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_management() or auth.uid() is null then
    if tg_op <> 'DELETE' and new.status = 'confirmed' and (tg_op = 'INSERT' or old.status <> 'confirmed') then
      new.confirmed_by := auth.uid();
      new.confirmed_at := now();
    end if;
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if old.status = 'confirmed' then
      raise exception 'This step has been signed off. Ask the CEO to change it.';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status = 'confirmed' then
    raise exception 'This step has been signed off. Ask the CEO to change it.';
  end if;
  new.status := 'pending';
  new.confirmed_by := null;
  new.confirmed_at := null;
  return new;
end;
$$;

drop trigger if exists journey_ticks_guard on public.journey_ticks;
create trigger journey_ticks_guard
  before insert or update or delete on public.journey_ticks
  for each row execute procedure public.journey_ticks_guard();

-- Moving someone to a level records the day they reached it.
create or replace function public.journey_members_reached()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if new.level_id is not null and (tg_op = 'INSERT' or new.level_id is distinct from old.level_id) then
    insert into public.journey_reached (profile_id, level_id, reached_on)
    values (new.profile_id, new.level_id, current_date)
    on conflict (profile_id, level_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists journey_members_reached on public.journey_members;
create trigger journey_members_reached
  before insert or update on public.journey_members
  for each row execute procedure public.journey_members_reached();

-- A level must belong to the member's path.
create or replace function public.journey_members_check_level()
returns trigger
language plpgsql
as $$
begin
  if new.level_id is not null and not exists (select 1 from public.journey_levels where id = new.level_id and path_id = new.path_id) then
    raise exception 'That level is on a different path.';
  end if;
  return new;
end;
$$;

drop trigger if exists journey_members_check_level on public.journey_members;
create trigger journey_members_check_level
  before insert or update on public.journey_members
  for each row execute procedure public.journey_members_check_level();

-- ------------------------------------------------------------------
-- Placeholder paths (edit them on the Team journeys page)
-- ------------------------------------------------------------------
insert into public.journey_paths (key, name, description, clients_word, position) values
  ('videographer', 'Videographer', 'From learning the basics to running your own office.', 'clients', 0),
  ('sales', 'Sales', 'From your first calls to building your own sales team.', 'new clients a month', 1)
on conflict (key) do nothing;

insert into public.journey_levels (path_id, key, position, title, summary, can_do, clients_min, clients_max, clients_note, earn_min, earn_max, paid, vision, steps)
select p.id, v.key, v.position, v.title, v.summary, v.can_do, v.cmin, v.cmax, v.cnote, v.emin, v.emax, v.paid, v.vision, v.steps::jsonb
from public.journey_paths p
join (values
  ('intern', 0, 'Intern', 'Learning everything from scratch, alongside the team on real shoots.',
    array['Help on shoots', 'Learn the camera, sound and light basics', 'Learn our editing style'], 0, 0, null, 0, 0, false, false,
    '[{"id":"s1","text":"Shadow 5 shoots"},{"id":"s2","text":"Edit 3 practice videos to our style"},{"id":"s3","text":"Know the filming and editing checklists"}]'),
  ('trainee', 1, 'Trainee', 'Your first client work, with full support on every video.',
    array['Film with the CEO on set', 'Edit first drafts', 'Use the pillar guides'], 1, 2, null, 0, 500, true, false,
    '[{"id":"s1","text":"10 videos approved by clients"},{"id":"s2","text":"Films a full shoot day with support"},{"id":"s3","text":"Edits need 2 rounds of changes or fewer"}]'),
  ('supported', 2, 'Supported videographer', 'Regular client work with the CEO filming alongside you.',
    array['Run shoots with help', 'Edit to the guide without reminders', 'Keep a client 1 week ahead'], 1, 3, 'or 1 big client', 800, 1200, true, false,
    '[{"id":"s1","text":"Clients kept a week ahead for a month"},{"id":"s2","text":"Plans a shoot day on your own"},{"id":"s3","text":"Writes a script the client approves first time"}]'),
  ('semi', 3, 'Semi-independent', 'You lead the shoots; help is there when you need it.',
    array['Lead shoot days', 'Write scripts', 'Keep clients 2 weeks ahead'], 3, 5, null, 1500, 2500, true, false,
    '[{"id":"s1","text":"Runs 5 clients with light help for a month"},{"id":"s2","text":"Client approval on first draft most of the time"},{"id":"s3","text":"Has a full backlog for every client"}]'),
  ('independent', 4, 'Independent', 'Filming, editing and posting for your clients on your own.',
    array['Manage 5 clients independently', 'Film, edit and post without help', 'Talk to clients directly'], 4, 6, null, 2500, 3500, true, false,
    '[{"id":"s1","text":"3 months independent with no missed deadlines"},{"id":"s2","text":"Clients renewing"},{"id":"s3","text":"Ready to train someone"}]'),
  ('team-builder', 5, 'Team builder', 'At full capacity, you start training people alongside you.',
    array['Train 1 to 2 people', 'Share your clients with your trainees', 'Grow your capacity'], 6, 12, null, 3500, 5000, true, false,
    '[{"id":"s1","text":"Trained someone to Supported videographer"},{"id":"s2","text":"Team keeps every client 2 weeks ahead"}]'),
  ('team-lead', 6, 'Team lead', 'A team of about 3 working under you.',
    array['Run a team of about 3', 'Manage around 20 clients', 'Hire with the CEO'], 15, 20, null, 5000, 8000, true, false,
    '[{"id":"s1","text":"Team of 3 running smoothly for 3 months"},{"id":"s2","text":"Ready to plan an office"}]'),
  ('office', 7, 'Your own office', 'Opening your own office, with funding from Advatar and wider investors.',
    array['Open and run an office', 'Build teams of your own', 'Funding from Advatar and investors'], 20, null, null, null, null, true, true,
    '[]'),
  ('leaders', 8, 'Growing leaders', 'Running the office and turning your people into team leads. The cycle carries on.',
    array['Grow team leads', 'Help them build their own teams'], null, null, null, null, null, true, true,
    '[]')
) as v (key, position, title, summary, can_do, cmin, cmax, cnote, emin, emax, paid, vision, steps) on true
where p.key = 'videographer'
on conflict (path_id, key) do nothing;

insert into public.journey_levels (path_id, key, position, title, summary, can_do, clients_min, clients_max, clients_note, earn_min, earn_max, paid, vision, steps)
select p.id, v.key, v.position, v.title, v.summary, v.can_do, v.cmin, v.cmax, v.cnote, v.emin, v.emax, v.paid, v.vision, v.steps::jsonb
from public.journey_paths p
join (values
  ('trainee', 0, 'Sales trainee', 'Learning the offer, the scripts and the CRM, and listening in on calls.',
    array['Listen in on sales calls', 'Learn the offer and pricing', 'Practise the scripts'], 0, 0, null, 0, 0, false, false,
    '[{"id":"s1","text":"Listen to 10 sales calls"},{"id":"s2","text":"Pass a role-play call"}]'),
  ('setter', 1, 'Appointment setter', 'Booking calls from leads.',
    array['Reach out to leads', 'Book discovery calls', 'Keep the pipeline up to date'], 0, 0, null, 200, 600, true, false,
    '[{"id":"s1","text":"20 calls booked in a month"},{"id":"s2","text":"Every lead logged in the CRM"}]'),
  ('closer-supported', 2, 'Supported closer', 'Taking calls with the CEO''s support.',
    array['Run discovery calls', 'Close with support'], 1, 3, null, 800, 1200, true, false,
    '[{"id":"s1","text":"3 clients signed in a month"},{"id":"s2","text":"Runs a call start to finish"}]'),
  ('closer', 3, 'Independent closer', 'Closing on your own.',
    array['Close on your own', 'Handle objections', 'Hand clients over to the team'], 3, 5, null, 1500, 2500, true, false,
    '[{"id":"s1","text":"5 clients signed in a month, twice"},{"id":"s2","text":"Clients staying past 3 months"}]'),
  ('senior', 4, 'Senior closer', 'Closing consistently and coaching others.',
    array['Coach setters', 'Take the biggest deals'], 5, 8, null, 2500, 4000, true, false,
    '[{"id":"s1","text":"Coached a setter to closer"}]'),
  ('team-builder', 5, 'Sales team builder', 'Building and training your own sales team.',
    array['Hire and train 1 to 3 people', 'Run the sales pipeline'], null, null, null, 4000, 6000, true, false,
    '[{"id":"s1","text":"Team of 3 hitting targets"}]'),
  ('own-team', 6, 'Your own sales team', 'Leading a sales team of your own.',
    array['Lead a sales team', 'Set targets with the CEO'], null, null, null, 6000, null, true, true,
    '[]')
) as v (key, position, title, summary, can_do, cmin, cmax, cnote, emin, emax, paid, vision, steps) on true
where p.key = 'sales'
on conflict (path_id, key) do nothing;

-- The minimum level: the ~£1k a month level on each path.
insert into public.journey_private (path_id, minimum_level_id)
select p.id, l.id
from public.journey_paths p
join public.journey_levels l on l.path_id = p.id
where (p.key, l.key) in (('videographer', 'supported'), ('sales', 'closer-supported'))
on conflict (path_id) do nothing;
