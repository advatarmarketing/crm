-- 0020: video submissions with review rounds, client brand kits, and
-- an internal per-client team thread.
--
-- Run 0018 and 0019 first.
--
-- Three things, all for the videographer's own workspace:
--
--   submissions / submission_versions / submission_feedback
--       Work handed in for review. Link-based, not file uploads:
--       Supabase storage is not built for video, and the finished
--       cuts already live in Drive or Frame.io. Each revision round
--       is its own version row, so "v3" means something concrete
--       rather than a file quietly replaced in place.
--
--   client_brand_kits
--       Colours, fonts, tone of voice, platforms and dos/don'ts per
--       client, filled in by the team and read by whoever is shooting.
--
--   client_team_messages
--       An internal thread per client. Deliberately NOT the existing
--       message_threads table: that one is the conversation the
--       CLIENT can see from their portal. This is the team talking
--       among themselves about that client, and no client policy is
--       granted on it anywhere below.
--
-- Run VERIFY_0020.sql afterwards and check every row before treating
-- this as done.

-- =================================================================
-- 1. submissions
-- =================================================================

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients (id) on delete set null,
  title text not null,
  brief text,
  status text not null default 'submitted'
    check (status in ('submitted', 'in_review', 'changes_requested', 'approved')),
  -- Kept in step by the trigger below rather than written by hand, so
  -- it can't drift from the actual version rows.
  current_version integer not null default 0,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists submissions_created_by_idx on submissions (created_by);
create index if not exists submissions_client_id_idx on submissions (client_id);
create index if not exists submissions_status_idx on submissions (status);

create table if not exists submission_versions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions (id) on delete cascade,
  version integer not null,
  url text,
  notes text,
  submitted_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (submission_id, version)
);

create index if not exists submission_versions_submission_id_idx on submission_versions (submission_id);

create table if not exists submission_feedback (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions (id) on delete cascade,
  -- Which cut the comment was about. Kept when a newer version
  -- arrives, so the history reads correctly rather than every past
  -- note appearing to be about the latest cut.
  version integer,
  body text not null,
  author_id uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists submission_feedback_submission_id_idx on submission_feedback (submission_id);

-- -----------------------------------------------------------------
-- Ownership helper
-- -----------------------------------------------------------------
-- security definer so the policies on the child tables can look at
-- the parent submission without needing their own read access to it.

create or replace function public.owns_submission(target_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.submissions
    where id = target_submission_id and created_by = auth.uid()
  );
$$;

grant execute on function public.owns_submission(uuid) to authenticated;

-- -----------------------------------------------------------------
-- Submitting a new version is what moves the work back into review
-- -----------------------------------------------------------------
-- Done in a trigger rather than by the app so a videographer needs no
-- update policy on `submissions` at all. Without this they'd need
-- permission to write the status column, and RLS can't stop them
-- setting it to 'approved' — approving their own work is precisely
-- what this workflow exists to prevent.

create or replace function public.bump_submission_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.submissions
  set current_version = new.version,
      status = 'submitted',
      updated_at = now()
  where id = new.submission_id;
  return new;
end;
$$;

drop trigger if exists submission_versions_bump on submission_versions;
create trigger submission_versions_bump
  after insert on submission_versions
  for each row execute procedure public.bump_submission_version();

-- -----------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------

alter table submissions enable row level security;
alter table submission_versions enable row level security;
alter table submission_feedback enable row level security;

drop policy if exists "submissions: management full access" on submissions;
create policy "submissions: management full access"
  on submissions for all
  using (public.is_management())
  with check (public.is_management());

drop policy if exists "submissions: staff assigned" on submissions;
create policy "submissions: staff assigned"
  on submissions for all
  using (
    public.current_role() = 'staff'
    and client_id is not null
    and public.is_assigned_staff(client_id)
  )
  with check (
    public.current_role() = 'staff'
    and client_id is not null
    and public.is_assigned_staff(client_id)
  );

-- A videographer can see and raise their own work. No update policy
-- on purpose — see the trigger note above.
drop policy if exists "submissions: videographer read own" on submissions;
create policy "submissions: videographer read own"
  on submissions for select
  using (public.current_role() = 'videographer' and created_by = auth.uid());

drop policy if exists "submissions: videographer create own" on submissions;
create policy "submissions: videographer create own"
  on submissions for insert
  with check (public.current_role() = 'videographer' and created_by = auth.uid());

drop policy if exists "submission_versions: management full access" on submission_versions;
create policy "submission_versions: management full access"
  on submission_versions for all
  using (public.is_management())
  with check (public.is_management());

drop policy if exists "submission_versions: staff assigned" on submission_versions;
create policy "submission_versions: staff assigned"
  on submission_versions for select
  using (
    public.current_role() = 'staff'
    and exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and s.client_id is not null
        and public.is_assigned_staff(s.client_id)
    )
  );

drop policy if exists "submission_versions: videographer own" on submission_versions;
create policy "submission_versions: videographer own"
  on submission_versions for select
  using (public.current_role() = 'videographer' and public.owns_submission(submission_id));

drop policy if exists "submission_versions: videographer add own" on submission_versions;
create policy "submission_versions: videographer add own"
  on submission_versions for insert
  with check (
    public.current_role() = 'videographer'
    and public.owns_submission(submission_id)
    and submitted_by = auth.uid()
  );

-- Feedback is written by the people reviewing, and read by the person
-- who submitted. A videographer gets no insert policy here: this is
-- the reviewer's column, not a conversation.
drop policy if exists "submission_feedback: management full access" on submission_feedback;
create policy "submission_feedback: management full access"
  on submission_feedback for all
  using (public.is_management())
  with check (public.is_management());

drop policy if exists "submission_feedback: staff assigned" on submission_feedback;
create policy "submission_feedback: staff assigned"
  on submission_feedback for all
  using (
    public.current_role() = 'staff'
    and exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and s.client_id is not null
        and public.is_assigned_staff(s.client_id)
    )
  )
  with check (
    public.current_role() = 'staff'
    and exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and s.client_id is not null
        and public.is_assigned_staff(s.client_id)
    )
  );

drop policy if exists "submission_feedback: videographer read own" on submission_feedback;
create policy "submission_feedback: videographer read own"
  on submission_feedback for select
  using (public.current_role() = 'videographer' and public.owns_submission(submission_id));

-- =================================================================
-- 2. client_brand_kits
-- =================================================================
-- One row per client. Arrays rather than free text for the things
-- that are genuinely lists, so they can be rendered as swatches and
-- chips instead of a paragraph someone has to read.

create table if not exists client_brand_kits (
  client_id uuid primary key references clients (id) on delete cascade,
  colours text[] not null default '{}',
  fonts text[] not null default '{}',
  platforms text[] not null default '{}',
  logo_urls text[] not null default '{}',
  tone_of_voice text,
  dos text,
  donts text,
  updated_by uuid references profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table client_brand_kits enable row level security;

drop policy if exists "client_brand_kits: management full access" on client_brand_kits;
create policy "client_brand_kits: management full access"
  on client_brand_kits for all
  using (public.is_management())
  with check (public.is_management());

drop policy if exists "client_brand_kits: staff assigned" on client_brand_kits;
create policy "client_brand_kits: staff assigned"
  on client_brand_kits for all
  using (public.current_role() = 'staff' and public.is_assigned_staff(client_id))
  with check (public.current_role() = 'staff' and public.is_assigned_staff(client_id));

-- Read-only for the people shooting to the brand.
drop policy if exists "client_brand_kits: videographer read assigned" on client_brand_kits;
create policy "client_brand_kits: videographer read assigned"
  on client_brand_kits for select
  using (public.current_role() = 'videographer' and public.is_assigned_staff(client_id));

-- =================================================================
-- 3. client_team_messages — internal, per client
-- =================================================================
-- No client policy anywhere here, deliberately. message_threads is
-- the thread a client can read; this one the team must be able to
-- speak freely in.

create table if not exists client_team_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  author_id uuid references profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists client_team_messages_client_id_idx
  on client_team_messages (client_id, created_at);

alter table client_team_messages enable row level security;

drop policy if exists "client_team_messages: management full access" on client_team_messages;
create policy "client_team_messages: management full access"
  on client_team_messages for all
  using (public.is_management())
  with check (public.is_management());

drop policy if exists "client_team_messages: staff assigned" on client_team_messages;
create policy "client_team_messages: staff assigned"
  on client_team_messages for all
  using (public.current_role() = 'staff' and public.is_assigned_staff(client_id))
  with check (public.current_role() = 'staff' and public.is_assigned_staff(client_id));

drop policy if exists "client_team_messages: videographer assigned read" on client_team_messages;
create policy "client_team_messages: videographer assigned read"
  on client_team_messages for select
  using (public.current_role() = 'videographer' and public.is_assigned_staff(client_id));

drop policy if exists "client_team_messages: videographer assigned write" on client_team_messages;
create policy "client_team_messages: videographer assigned write"
  on client_team_messages for insert
  with check (
    public.current_role() = 'videographer'
    and public.is_assigned_staff(client_id)
    and author_id = auth.uid()
  );

-- =================================================================
-- 4. updated_at triggers
-- =================================================================

drop trigger if exists submissions_touch_updated_at on submissions;
create trigger submissions_touch_updated_at
  before update on submissions
  for each row execute procedure public.touch_updated_at();

drop trigger if exists client_brand_kits_touch_updated_at on client_brand_kits;
create trigger client_brand_kits_touch_updated_at
  before update on client_brand_kits
  for each row execute procedure public.touch_updated_at();
