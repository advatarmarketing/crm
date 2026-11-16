-- 0043 — The client's Account page, live pop-up notifications, and
--        closing videographers' view of contracts and money.
--
-- 1. client_accounts — one row per client: the day of the month their
--    payment is due, and a note from the team the client can read
--    ("All up to date, thank you", or "We haven't received November's
--    payment — could you check?"). Management writes it; the client
--    reads their own.
--
-- 2. Invoices — a client can now read their OWN invoices once sent or
--    paid (never drafts), so the Account page can show what is due,
--    what is paid, and whether they are up to date. Ticking an invoice
--    paid stays a management action, exactly as before.
--
-- 3. client_account_summary() — what the client is paying and how
--    often, read from client_finance (which stays CEO-only) through a
--    function that returns the caller's own client and nothing else.
--
-- 4. Videographers no longer see:
--      * client documents (contracts, signed agreements) — 0002 gave
--        them read access and nothing since took it away;
--      * the files behind those documents in storage;
--      * invoice and document entries in a client's activity history.
--    Their own pay (payments) was already theirs alone.
--
-- 5. Notifications join the realtime feed, so pop-ups arrive the
--    moment something happens instead of within a minute.
--
-- 6. A client can read their OWN saved social media logins (0039), so
--    a forgotten password is one click away in their portal. Read-only:
--    they cannot add, change or delete one. Videographers still have no
--    access at all.
--
-- Safe to run twice.

-- ------------------------------------------------------------------
-- 1. client_accounts
-- ------------------------------------------------------------------
create table if not exists public.client_accounts (
  client_id       uuid primary key references public.clients (id) on delete cascade,
  payment_day     smallint check (payment_day is null or payment_day between 1 and 28),
  note            text check (note is null or char_length(note) <= 1000),
  note_updated_at timestamptz,
  updated_by      uuid references public.profiles (id) on delete set null,
  updated_at      timestamptz not null default now()
);

alter table public.client_accounts enable row level security;

drop policy if exists "client_accounts: management" on public.client_accounts;
create policy "client_accounts: management"
  on public.client_accounts for all
  using (public.can_manage_client(client_id))
  with check (public.can_manage_client(client_id));

drop policy if exists "client_accounts: client reads own" on public.client_accounts;
create policy "client_accounts: client reads own"
  on public.client_accounts for select
  using (public.current_role() = 'client' and client_id = public.current_client_id());

-- ------------------------------------------------------------------
-- 2. A client reads their own sent and paid invoices
-- ------------------------------------------------------------------
drop policy if exists "invoices: client reads own sent" on public.invoices;
create policy "invoices: client reads own sent"
  on public.invoices for select
  using (
    public.current_role() = 'client'
    and client_id = public.current_client_id()
    and status in ('sent', 'paid')
  );

-- ------------------------------------------------------------------
-- 3. What they pay, without opening client_finance
-- ------------------------------------------------------------------
create or replace function public.client_account_summary()
returns table (billing_amount numeric, billing_frequency text)
language sql
stable
security definer
set search_path = public
as $$
  select f.billing_amount, f.billing_frequency
    from public.client_finance f
   where public.current_role() = 'client'
     and f.client_id = public.current_client_id();
$$;

revoke all on function public.client_account_summary() from public;
grant execute on function public.client_account_summary() to authenticated;

-- ------------------------------------------------------------------
-- 4. Videographers: no contracts, no money
-- ------------------------------------------------------------------
drop policy if exists "documents: videographer read assigned" on public.documents;
drop policy if exists "client-documents: videographer read assigned" on storage.objects;

drop policy if exists "client_activity: videographer read assigned" on public.client_activity;
create policy "client_activity: videographer read assigned"
  on public.client_activity for select
  using (
    public.current_role() = 'videographer'
    and public.is_assigned_staff(client_id)
    and kind !~ '^(invoice|document|finance|payment|billing|credential)'
  );

-- ------------------------------------------------------------------
-- 5. Live notifications
-- ------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ------------------------------------------------------------------
-- 6. A client sees their own logins (read-only)
-- ------------------------------------------------------------------
do $$
begin
  if to_regclass('public.client_credentials') is not null then
    execute 'drop policy if exists "client_credentials: client reads own" on public.client_credentials';
    execute $p$create policy "client_credentials: client reads own"
      on public.client_credentials for select
      using (public.current_role() = 'client' and client_id = public.current_client_id())$p$;
  end if;
end $$;
