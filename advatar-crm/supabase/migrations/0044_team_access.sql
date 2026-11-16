-- 0044 - The CEO chooses what each staff member can see.
--
-- Three switches per staff member, set by the CEO on the Team access
-- page:
--
--   contracts  client documents (contracts, signed agreements), the
--              files behind them, and document entries in a client's
--              history
--   logins     the client's saved social media logins
--   money      the client's invoices and account (payment day, the
--              note to the client), and money entries in the history
--
-- A staff member with no row keeps exactly what they had before this
-- migration: contracts and logins on, money off. Nothing changes for
-- anybody until the CEO flips a switch.
--
-- Still true whatever the switches say:
--   * staff only ever see the clients they are assigned to;
--   * the CEO and operations managers are not affected;
--   * videographers stay locked out of contracts, logins and money
--     (0039, 0043) - these switches are for staff.
--
-- Safe to run twice.

-- ------------------------------------------------------------------
-- 1. The switches
-- ------------------------------------------------------------------
create table if not exists public.team_access (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  contracts  boolean not null,
  logins     boolean not null,
  money      boolean not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.team_access enable row level security;

drop policy if exists "team_access: ceo" on public.team_access;
create policy "team_access: ceo"
  on public.team_access for all
  using (public.is_ceo_role())
  with check (public.is_ceo_role());

drop policy if exists "team_access: read own" on public.team_access;
create policy "team_access: read own"
  on public.team_access for select
  using (profile_id = auth.uid());

-- Does the signed-in staff member have this switch on? Anyone who is
-- not staff gets false: the policies below only use it for staff.
create or replace function public.staff_can(area text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() = 'staff'
     and coalesce(
           (select case area
                     when 'contracts' then a.contracts
                     when 'logins'    then a.logins
                     when 'money'     then a.money
                   end
              from public.team_access a
             where a.profile_id = auth.uid()),
           area in ('contracts', 'logins')
         );
$$;

revoke all on function public.staff_can(text) from public;
grant execute on function public.staff_can(text) to authenticated;

-- ------------------------------------------------------------------
-- 2. Contracts
-- ------------------------------------------------------------------
drop policy if exists "documents: staff assigned" on public.documents;
create policy "documents: staff assigned"
  on public.documents for all
  using (public.current_role() = 'staff' and public.is_assigned_staff(client_id) and public.staff_can('contracts'))
  with check (public.current_role() = 'staff' and public.is_assigned_staff(client_id) and public.staff_can('contracts'));

drop policy if exists "client-documents: staff assigned" on storage.objects;
create policy "client-documents: staff assigned"
  on storage.objects for all
  using (
    bucket_id = 'client-documents'
    and public.current_role() = 'staff'
    and public.is_assigned_staff(public.storage_path_client_id(name))
    and public.staff_can('contracts')
  )
  with check (
    bucket_id = 'client-documents'
    and public.current_role() = 'staff'
    and public.is_assigned_staff(public.storage_path_client_id(name))
    and public.staff_can('contracts')
  );

-- ------------------------------------------------------------------
-- 3. Logins (0039 may not have been run; skip quietly if so)
-- ------------------------------------------------------------------
do $$
begin
  if to_regclass('public.client_credentials') is not null then
    execute 'drop policy if exists "client_credentials: staff assigned" on public.client_credentials';
    execute $p$create policy "client_credentials: staff assigned"
      on public.client_credentials for all
      using (public.current_role() = 'staff' and public.is_assigned_staff(client_id) and public.staff_can('logins'))
      with check (public.current_role() = 'staff' and public.is_assigned_staff(client_id) and public.staff_can('logins'))$p$;
  end if;
end $$;

-- ------------------------------------------------------------------
-- 4. Money: read-only, and only for assigned clients
-- ------------------------------------------------------------------
drop policy if exists "invoices: staff read when allowed" on public.invoices;
create policy "invoices: staff read when allowed"
  on public.invoices for select
  using (public.current_role() = 'staff' and public.is_assigned_staff(client_id) and public.staff_can('money'));

do $$
begin
  if to_regclass('public.client_accounts') is not null then
    execute 'drop policy if exists "client_accounts: staff read when allowed" on public.client_accounts';
    execute $p$create policy "client_accounts: staff read when allowed"
      on public.client_accounts for select
      using (public.current_role() = 'staff' and public.is_assigned_staff(client_id) and public.staff_can('money'))$p$;
  end if;
end $$;

-- ------------------------------------------------------------------
-- 5. A client's history follows the same switches
-- ------------------------------------------------------------------
drop policy if exists "client_activity: staff assigned" on public.client_activity;
create policy "client_activity: staff assigned"
  on public.client_activity for all
  using (
    public.current_role() = 'staff'
    and public.is_assigned_staff(client_id)
    and (kind !~ '^(invoice|finance|payment|billing|account)' or public.staff_can('money'))
    and (kind !~ '^document' or public.staff_can('contracts'))
    and (kind !~ '^credential' or public.staff_can('logins'))
  )
  with check (public.current_role() = 'staff' and public.is_assigned_staff(client_id));

-- 0043 missed one: changing a client's account note is logged as
-- "account_note", which videographers could still read.
drop policy if exists "client_activity: videographer read assigned" on public.client_activity;
create policy "client_activity: videographer read assigned"
  on public.client_activity for select
  using (
    public.current_role() = 'videographer'
    and public.is_assigned_staff(client_id)
    and kind !~ '^(invoice|document|finance|payment|billing|credential|account)'
  );
