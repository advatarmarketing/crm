-- 0054 - Guidelines split into Filming and Editing, and a "how to make
-- this video" guide for every client's content pillar.
--
-- 1. Every SOP (resources) gets a section: filming, editing, or none
--    (general). The CEO moves them between sections on the Tools page.
--
-- 2. pillar_guides: for each client and each content pillar, a Filming
--    guide and an Editing guide. Each has the elements needed (shots,
--    b-roll, props, on-screen text, music...) and the step-by-step
--    process. Written when a client starts, by the CEO and the
--    videographer together, so the CEO, the operations manager and the
--    team on that client can edit them. Clients never see them.
--
-- 3. guide_templates: what a new guide starts from, one per section.
--    The CEO and operations managers can change them.
--
-- 4. guide_runs: "Start a new video" gives a fresh copy of a guide's
--    checklist, optionally for one planned video, whose progress then
--    shows on the client's dashboard.
--
-- Safe to run twice.

-- ------------------------------------------------------------------
-- 1. SOP sections
-- ------------------------------------------------------------------
alter table public.resources add column if not exists stage text;
alter table public.resources drop constraint if exists resources_stage_check;
alter table public.resources add constraint resources_stage_check
  check (stage is null or stage in ('filming', 'editing'));

-- ------------------------------------------------------------------
-- 2. Guides per client and pillar
-- ------------------------------------------------------------------
create table if not exists public.pillar_guides (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  pillar text not null check (char_length(btrim(pillar)) between 1 and 80),
  stage text not null check (stage in ('filming', 'editing')),
  -- What you need: one line each.
  elements text[] not null default '{}',
  -- The process, in order: [{"id": "...", "text": "..."}]. Ids stay put
  -- when a step is reworded, so ticks in progress aren't lost.
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  notes text check (notes is null or char_length(notes) <= 4000),
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pillar_guides_key on public.pillar_guides (client_id, lower(btrim(pillar)), stage);

alter table public.pillar_guides enable row level security;

drop policy if exists "pillar_guides: team on client" on public.pillar_guides;
create policy "pillar_guides: team on client"
  on public.pillar_guides for all
  using (public.current_role() <> 'client' and public.can_see_client(client_id))
  with check (public.current_role() <> 'client' and public.can_see_client(client_id));

grant select, insert, update, delete on public.pillar_guides to authenticated;

create or replace function public.pillar_guides_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists pillar_guides_touch on public.pillar_guides;
create trigger pillar_guides_touch
  before update on public.pillar_guides
  for each row execute procedure public.pillar_guides_touch();

-- ------------------------------------------------------------------
-- 3. Starter templates
-- ------------------------------------------------------------------
create table if not exists public.guide_templates (
  stage text primary key check (stage in ('filming', 'editing')),
  elements text[] not null default '{}',
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.guide_templates enable row level security;

drop policy if exists "guide_templates: team reads" on public.guide_templates;
create policy "guide_templates: team reads"
  on public.guide_templates for select
  using (public.current_role() in ('ceo', 'operations_manager', 'staff', 'videographer'));

drop policy if exists "guide_templates: management writes" on public.guide_templates;
create policy "guide_templates: management writes"
  on public.guide_templates for all
  using (public.is_management())
  with check (public.is_management());

grant select, insert, update, delete on public.guide_templates to authenticated;

insert into public.guide_templates (stage, elements, steps) values
  (
    'filming',
    array['Shot list', 'B-roll ideas', 'Props', 'Location', 'Who is on camera'],
    '[
      {"id": "f1", "text": "Plan: read the script and the shot list"},
      {"id": "f2", "text": "Set up: light, sound and framing (9:16)"},
      {"id": "f3", "text": "Film the main shots, two good takes of each line"},
      {"id": "f4", "text": "Film the b-roll"},
      {"id": "f5", "text": "Check the footage before you leave"}
    ]'::jsonb
  ),
  (
    'editing',
    array['Captions style', 'Music', 'On-screen text', 'Colour look', 'End card'],
    '[
      {"id": "e1", "text": "Cut: strongest hook first, trim every pause"},
      {"id": "e2", "text": "Captions"},
      {"id": "e3", "text": "Music and sound effects"},
      {"id": "e4", "text": "Colour"},
      {"id": "e5", "text": "Export (9:16, 1080p)"},
      {"id": "e6", "text": "Upload for approval"}
    ]'::jsonb
  )
on conflict (stage) do nothing;

-- ------------------------------------------------------------------
-- 4. Runs: one video worked through a guide
-- ------------------------------------------------------------------
create table if not exists public.guide_runs (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.pillar_guides (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  video_id uuid references public.content_videos (id) on delete set null,
  done_steps text[] not null default '{}',
  started_by uuid references public.profiles (id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists guide_runs_guide_idx on public.guide_runs (guide_id, started_at desc);
create index if not exists guide_runs_video_idx on public.guide_runs (video_id) where video_id is not null;

alter table public.guide_runs enable row level security;

drop policy if exists "guide_runs: team on client" on public.guide_runs;
create policy "guide_runs: team on client"
  on public.guide_runs for all
  using (public.current_role() <> 'client' and public.can_see_client(client_id))
  with check (public.current_role() <> 'client' and public.can_see_client(client_id));

grant select, insert, update, delete on public.guide_runs to authenticated;

-- A run's client is its guide's client, whatever the browser sent.
create or replace function public.guide_runs_pin_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select client_id into new.client_id from public.pillar_guides where id = new.guide_id;
  if new.video_id is not null and not exists (select 1 from public.content_videos where id = new.video_id and client_id = new.client_id) then
    raise exception 'That video belongs to a different client.';
  end if;
  return new;
end;
$$;

drop trigger if exists guide_runs_pin_client on public.guide_runs;
create trigger guide_runs_pin_client
  before insert or update of guide_id, video_id on public.guide_runs
  for each row execute procedure public.guide_runs_pin_client();
