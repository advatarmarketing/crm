-- Phase 3: the full CRM schema + row-level security.
-- This is the load-bearing migration — RLS here is the actual
-- permission boundary. Everything the UI does to hide data (nav
-- items, role-gated components) is a convenience on top of this, not
-- a substitute for it.
--
-- Run 0001_profiles.sql before this one.

-- =================================================================
-- 0. Helper functions
-- =================================================================
-- Policies below need to check "what role is the calling user" and
-- "is the calling user assigned to this client" repeatedly, against
-- tables (profiles, client_staff) that themselves have RLS enabled.
-- A plain subquery inside another table's policy would be evaluated
-- under the CALLING user's RLS on profiles/client_staff, which for
-- anyone but ceo/staff would recurse into "can I even read that
-- profiles row" and silently return nothing. SECURITY DEFINER
-- functions sidestep that: they run with the function owner's
-- privileges, so they can always resolve "who is auth.uid() and what
-- can they see" regardless of the calling user's own RLS.

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select client_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_ceo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() = 'ceo';
$$;

create or replace function public.is_staff_or_ceo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() in ('ceo', 'staff');
$$;

create or replace function public.is_assigned_staff(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.client_staff
    where client_id = target_client_id and staff_id = auth.uid()
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =================================================================
-- 1. Tables
-- =================================================================

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  contact_email text,
  service text,
  stage text not null default 'lead'
    check (stage in ('lead', 'proposal', 'active')),
  monthly_value numeric,
  next_action text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Superseded by the real table above — 0001_profiles.sql only created
-- a one-column stub so profiles.client_id had something to reference.
alter table clients
  add column if not exists name text,
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists service text,
  add column if not exists stage text,
  add column if not exists monthly_value numeric,
  add column if not exists next_action text,
  add column if not exists avatar_url text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update clients set name = coalesce(name, 'Untitled client') where name is null;
alter table clients alter column name set not null;

update clients set stage = coalesce(stage, 'lead') where stage is null;
alter table clients alter column stage set not null;
alter table clients alter column stage set default 'lead';
alter table clients drop constraint if exists clients_stage_check;
alter table clients add constraint clients_stage_check
  check (stage in ('lead', 'proposal', 'active'));

create table if not exists client_staff (
  client_id uuid not null references clients (id) on delete cascade,
  staff_id uuid not null references profiles (id) on delete cascade,
  role_on_client text,
  created_at timestamptz not null default now(),
  primary key (client_id, staff_id)
);

create table if not exists planners (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references clients (id) on delete cascade,
  content jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published')),
  updated_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fathom_calls (
  id uuid primary key default gen_random_uuid(),
  fathom_call_id text not null unique,
  client_id uuid references clients (id) on delete set null,
  raw_payload jsonb,
  summary text,
  action_items jsonb,
  transcript_url text,
  received_at timestamptz,
  applied boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  name text not null,
  type text,
  status text,
  url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients (id) on delete cascade,
  assigned_to uuid references profiles (id) on delete set null,
  text text not null,
  due_date date,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists message_threads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references clients (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references message_threads (id) on delete cascade,
  sender_id uuid references profiles (id) on delete set null,
  sender_role text,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  number text,
  service text,
  amount numeric,
  invoice_date date,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references profiles (id) on delete cascade,
  amount numeric not null,
  note text,
  paid_on date not null default current_date,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- updated_at triggers, only on tables that carry the column.
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'planners', 'fathom_calls', 'documents', 'tasks', 'invoices'
  ]
  loop
    execute format(
      'drop trigger if exists set_updated_at on %I; create trigger set_updated_at before update on %I for each row execute procedure public.set_updated_at();',
      t, t
    );
  end loop;
end $$;

-- =================================================================
-- 2. profiles: extend Phase 2's policies so ceo/staff can see every
--    profile (needed for the team list and client_staff assignment
--    UI). "read own" / "update own" from 0001 stay as-is.
-- =================================================================

drop policy if exists "profiles: staff/ceo read all" on profiles;
create policy "profiles: staff/ceo read all"
  on profiles for select
  using (public.is_staff_or_ceo());

-- =================================================================
-- 3. clients
-- =================================================================

alter table clients enable row level security;

drop policy if exists "clients: ceo/staff full access" on clients;
create policy "clients: ceo/staff full access"
  on clients for all
  using (public.is_staff_or_ceo())
  with check (public.is_staff_or_ceo());

drop policy if exists "clients: videographer read assigned" on clients;
create policy "clients: videographer read assigned"
  on clients for select
  using (
    public.current_role() = 'videographer'
    and public.is_assigned_staff(id)
  );

drop policy if exists "clients: client read own" on clients;
create policy "clients: client read own"
  on clients for select
  using (
    public.current_role() = 'client'
    and id = public.current_client_id()
  );

-- =================================================================
-- 4. client_staff
-- =================================================================

alter table client_staff enable row level security;

drop policy if exists "client_staff: ceo/staff full access" on client_staff;
create policy "client_staff: ceo/staff full access"
  on client_staff for all
  using (public.is_staff_or_ceo())
  with check (public.is_staff_or_ceo());

-- Not in the spec explicitly, but harmless and useful: a videographer
-- can see their own assignment rows (e.g. to know their role_on_client
-- label). This grants nothing about OTHER staff's assignments.
drop policy if exists "client_staff: videographer read own" on client_staff;
create policy "client_staff: videographer read own"
  on client_staff for select
  using (
    public.current_role() = 'videographer'
    and staff_id = auth.uid()
  );

-- =================================================================
-- 5. planners
-- =================================================================

alter table planners enable row level security;

drop policy if exists "planners: ceo/staff full access" on planners;
create policy "planners: ceo/staff full access"
  on planners for all
  using (public.is_staff_or_ceo())
  with check (public.is_staff_or_ceo());

-- Read-only for videographers for now. Writing to specific planner
-- sections is deferred to Phase 7 pending your call on which
-- sections (if any) videographers should be able to edit.
drop policy if exists "planners: videographer read assigned" on planners;
create policy "planners: videographer read assigned"
  on planners for select
  using (
    public.current_role() = 'videographer'
    and public.is_assigned_staff(client_id)
  );

drop policy if exists "planners: client read own published" on planners;
create policy "planners: client read own published"
  on planners for select
  using (
    public.current_role() = 'client'
    and client_id = public.current_client_id()
    and status = 'published'
  );

-- =================================================================
-- 6. fathom_calls — ceo/staff only. Not readable by videographer or
--    client at all (raw call data/transcripts are a staff tool).
-- =================================================================

alter table fathom_calls enable row level security;

drop policy if exists "fathom_calls: ceo/staff full access" on fathom_calls;
create policy "fathom_calls: ceo/staff full access"
  on fathom_calls for all
  using (public.is_staff_or_ceo())
  with check (public.is_staff_or_ceo());

-- =================================================================
-- 7. documents
-- =================================================================

alter table documents enable row level security;

drop policy if exists "documents: ceo/staff full access" on documents;
create policy "documents: ceo/staff full access"
  on documents for all
  using (public.is_staff_or_ceo())
  with check (public.is_staff_or_ceo());

-- Read-only for videographers for now (same deferral as planners —
-- see note above and in tasks below).
drop policy if exists "documents: videographer read assigned" on documents;
create policy "documents: videographer read assigned"
  on documents for select
  using (
    public.current_role() = 'videographer'
    and public.is_assigned_staff(client_id)
  );

drop policy if exists "documents: client read own" on documents;
create policy "documents: client read own"
  on documents for select
  using (
    public.current_role() = 'client'
    and client_id = public.current_client_id()
  );

-- =================================================================
-- 8. tasks
-- =================================================================

alter table tasks enable row level security;

drop policy if exists "tasks: ceo/staff full access" on tasks;
create policy "tasks: ceo/staff full access"
  on tasks for all
  using (public.is_staff_or_ceo())
  with check (public.is_staff_or_ceo());

-- Read-only for videographers for now — same "confirm which fields
-- before allowing writes" deferral as planners/documents. NOTE:
-- tasks.client_id is nullable, and this policy only matches tasks
-- tied to an assigned client. A task with client_id null but
-- assigned_to = this videographer (an internal/admin task with no
-- client) is NOT visible under this policy as written. Flagging this
-- rather than silently adding a broader grant — say the word and
-- I'll add "or assigned_to = auth.uid()" here.
drop policy if exists "tasks: videographer read assigned" on tasks;
create policy "tasks: videographer read assigned"
  on tasks for select
  using (
    public.current_role() = 'videographer'
    and client_id is not null
    and public.is_assigned_staff(client_id)
  );

drop policy if exists "tasks: client read own" on tasks;
create policy "tasks: client read own"
  on tasks for select
  using (
    public.current_role() = 'client'
    and client_id = public.current_client_id()
  );

-- =================================================================
-- 9. message_threads
-- =================================================================

alter table message_threads enable row level security;

drop policy if exists "message_threads: ceo/staff full access" on message_threads;
create policy "message_threads: ceo/staff full access"
  on message_threads for all
  using (public.is_staff_or_ceo())
  with check (public.is_staff_or_ceo());

drop policy if exists "message_threads: videographer read assigned" on message_threads;
create policy "message_threads: videographer read assigned"
  on message_threads for select
  using (
    public.current_role() = 'videographer'
    and public.is_assigned_staff(client_id)
  );

drop policy if exists "message_threads: client read own" on message_threads;
create policy "message_threads: client read own"
  on message_threads for select
  using (
    public.current_role() = 'client'
    and client_id = public.current_client_id()
  );

-- =================================================================
-- 10. messages
-- =================================================================

alter table messages enable row level security;

drop policy if exists "messages: ceo/staff full access" on messages;
create policy "messages: ceo/staff full access"
  on messages for all
  using (public.is_staff_or_ceo())
  with check (public.is_staff_or_ceo());

-- Read-only for videographers, per this migration's spec. NOTE: this
-- means a videographer cannot send a message yet, even though "client
-- communication" was called out as something they need to see — the
-- spec for this migration only asked for select access here, with
-- message send/receive built out properly in Phase 10. Worth
-- revisiting then.
drop policy if exists "messages: videographer read assigned" on messages;
create policy "messages: videographer read assigned"
  on messages for select
  using (
    public.current_role() = 'videographer'
    and exists (
      select 1 from message_threads mt
      where mt.id = messages.thread_id
        and public.is_assigned_staff(mt.client_id)
    )
  );

drop policy if exists "messages: client read own" on messages;
create policy "messages: client read own"
  on messages for select
  using (
    public.current_role() = 'client'
    and exists (
      select 1 from message_threads mt
      where mt.id = messages.thread_id
        and mt.client_id = public.current_client_id()
    )
  );

-- =================================================================
-- 11. invoices — ceo only, full stop. Staff, videographer, and
--     client all get zero policies here, which under RLS means zero
--     rows, not an error.
-- =================================================================

alter table invoices enable row level security;

drop policy if exists "invoices: ceo full access" on invoices;
create policy "invoices: ceo full access"
  on invoices for all
  using (public.is_ceo())
  with check (public.is_ceo());

-- =================================================================
-- 12. payments — ceo writes everything; everyone (staff and
--     videographer alike) can only ever see their OWN rows, and can
--     never insert/update/delete, even their own.
-- =================================================================

alter table payments enable row level security;

drop policy if exists "payments: ceo full access" on payments;
create policy "payments: ceo full access"
  on payments for all
  using (public.is_ceo())
  with check (public.is_ceo());

drop policy if exists "payments: read own" on payments;
create policy "payments: read own"
  on payments for select
  using (staff_id = auth.uid());
