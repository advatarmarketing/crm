-- Phase 15: make a client's record the real hub for that client.
--
-- Three things, all hanging off one client:
--   1. Real document uploads (the `documents` table existed, but
--      nothing could put a file into it — only the Fathom webhook ever
--      wrote rows, and there was no storage bucket for files at all).
--   2. Linking a Fathom meeting to a specific client by hand, instead
--      of only ever receiving them blind through the webhook.
--   3. An activity timeline, so there is a record of what happened to
--      a client and when.

-- =================================================================
-- 1. A safe way to read the client id out of a storage path
-- =================================================================
-- Files are stored as `<client_id>/<uuid>-<filename>`, so the storage
-- policies below need the first path segment as a uuid. Casting it
-- directly would throw on any object whose first segment isn't a uuid
-- — and an exception inside an RLS policy fails the whole query, not
-- just that row. This returns null instead, which simply fails the
-- policy's comparison.

create or replace function public.storage_path_client_id(object_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  first_segment text;
begin
  first_segment := split_part(object_name, '/', 1);
  if first_segment !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return null;
  end if;
  return first_segment::uuid;
end;
$$;

-- =================================================================
-- 2. documents: columns for real uploaded files
-- =================================================================

alter table documents
  add column if not exists storage_path text,
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists uploaded_by uuid references profiles (id) on delete set null;

create index if not exists documents_client_id_idx on documents (client_id);

-- =================================================================
-- 3. The client-documents storage bucket
-- =================================================================
-- Deliberately NOT public, unlike `client-avatars` (0004). Avatars are
-- decorative; these are contracts and briefs. Downloads go through a
-- short-lived signed URL minted server-side, so a file is never
-- reachable by guessing a path.

insert into storage.buckets (id, name, public)
values ('client-documents', 'client-documents', false)
on conflict (id) do nothing;

drop policy if exists "client-documents: management all" on storage.objects;
create policy "client-documents: management all"
  on storage.objects for all
  using (bucket_id = 'client-documents' and public.is_management())
  with check (bucket_id = 'client-documents' and public.is_management());

drop policy if exists "client-documents: staff assigned" on storage.objects;
create policy "client-documents: staff assigned"
  on storage.objects for all
  using (
    bucket_id = 'client-documents'
    and public.current_role() = 'staff'
    and public.is_assigned_staff(public.storage_path_client_id(name))
  )
  with check (
    bucket_id = 'client-documents'
    and public.current_role() = 'staff'
    and public.is_assigned_staff(public.storage_path_client_id(name))
  );

drop policy if exists "client-documents: videographer read assigned" on storage.objects;
create policy "client-documents: videographer read assigned"
  on storage.objects for select
  using (
    bucket_id = 'client-documents'
    and public.current_role() = 'videographer'
    and public.is_assigned_staff(public.storage_path_client_id(name))
  );

drop policy if exists "client-documents: client read own" on storage.objects;
create policy "client-documents: client read own"
  on storage.objects for select
  using (
    bucket_id = 'client-documents'
    and public.current_role() = 'client'
    and public.storage_path_client_id(name) = public.current_client_id()
  );

-- =================================================================
-- 4. fathom_calls: manual linking
-- =================================================================
-- `fathom_call_id` is `not null unique` and has always been whatever
-- id the webhook payload carried. A meeting attached by hand has no
-- such id, so those rows get a generated `manual:<uuid>` value —
-- unique by construction, and obvious in the data where a row came
-- from. `source` records that explicitly rather than making anyone
-- pattern-match on the id.

alter table fathom_calls
  add column if not exists source text not null default 'webhook',
  add column if not exists meeting_url text,
  add column if not exists title text,
  add column if not exists created_by uuid references profiles (id) on delete set null;

alter table fathom_calls drop constraint if exists fathom_calls_source_check;
alter table fathom_calls add constraint fathom_calls_source_check
  check (source in ('webhook', 'manual'));

create index if not exists fathom_calls_client_id_idx on fathom_calls (client_id);

-- =================================================================
-- 5. client_activity: the timeline
-- =================================================================

create table if not exists client_activity (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  -- Free text rather than an enum: new kinds of event get added as
  -- features land, and an enum would mean a migration every time.
  kind text not null,
  summary text not null,
  meta jsonb,
  actor_id uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists client_activity_client_id_created_at_idx
  on client_activity (client_id, created_at desc);

alter table client_activity enable row level security;

drop policy if exists "client_activity: management full access" on client_activity;
create policy "client_activity: management full access"
  on client_activity for all
  using (public.is_management())
  with check (public.is_management());

drop policy if exists "client_activity: staff assigned" on client_activity;
create policy "client_activity: staff assigned"
  on client_activity for all
  using (public.current_role() = 'staff' and public.is_assigned_staff(client_id))
  with check (public.current_role() = 'staff' and public.is_assigned_staff(client_id));

drop policy if exists "client_activity: videographer read assigned" on client_activity;
create policy "client_activity: videographer read assigned"
  on client_activity for select
  using (public.current_role() = 'videographer' and public.is_assigned_staff(client_id));

-- The client role gets no policy here on purpose: this is the
-- internal record of how their account has been handled, not
-- something the portal shows them.

-- =================================================================
-- 6. Automatic logging for things the app doesn't route through a
--    server action
-- =================================================================
-- Stage changes can happen from the client detail form, which writes
-- to `clients` directly from the browser, so there is no server action
-- to hook. A trigger catches every path, including a hand edit in the
-- Supabase table editor.

create or replace function public.log_client_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage is distinct from old.stage then
    insert into public.client_activity (client_id, kind, summary, meta, actor_id)
    values (
      new.id,
      'stage_changed',
      format('Stage changed from %s to %s', coalesce(old.stage, 'none'), coalesce(new.stage, 'none')),
      jsonb_build_object('from', old.stage, 'to', new.stage),
      auth.uid()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists log_client_stage_change on clients;
create trigger log_client_stage_change
  after update of stage on clients
  for each row
  execute procedure public.log_client_stage_change();

create or replace function public.log_client_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.client_activity (client_id, kind, summary, meta, actor_id)
  values (
    new.id,
    'client_created',
    format('Added as a %s', coalesce(new.stage, 'lead')),
    jsonb_build_object('stage', new.stage),
    auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists log_client_created on clients;
create trigger log_client_created
  after insert on clients
  for each row
  execute procedure public.log_client_created();
