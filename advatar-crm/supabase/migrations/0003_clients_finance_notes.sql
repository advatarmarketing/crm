-- Phase 4 fix-forward migration.
--
-- Building the dashboard/clients-grid surfaced a real gap left by
-- Phase 3: clients.monthly_value lived on the same `clients` row that
-- staff has full RLS access to, but the CEO-only "Monthly Revenue"
-- tile / "Revenue by Service" donut need that figure to be genuinely
-- unreachable by staff at the query level — not hidden by a
-- client-side `if (role === 'ceo')` check, per this phase's explicit
-- instruction to let RLS do the filtering.
--
-- RLS in Postgres is row-level, not column-level, so as long as
-- monthly_value lived on `clients` there was no way to give staff
-- full row access to that table while blocking just this one column
-- without resorting to column privileges (GRANT/REVOKE per column),
-- which don't compose cleanly with RLS policies here. The
-- straightforward, idiomatic fix — and the one already established
-- by how `invoices` was split out in Phase 3 — is to move the
-- financial figure into its own table with its own ceo-only policy.
--
-- Also adding clients.notes here: the client detail panel asked for
-- in this phase needs somewhere for freeform staff notes to live, and
-- no existing table covers it.

-- ---------------------------------------------------------------
-- client_finance: one row per client, ceo-only in both directions.
-- ---------------------------------------------------------------

create table if not exists client_finance (
  client_id uuid primary key references clients (id) on delete cascade,
  monthly_value numeric,
  updated_at timestamptz not null default now()
);

alter table client_finance enable row level security;

drop policy if exists "client_finance: ceo full access" on client_finance;
create policy "client_finance: ceo full access"
  on client_finance for all
  using (public.is_ceo())
  with check (public.is_ceo());

drop trigger if exists set_updated_at on client_finance;
create trigger set_updated_at
  before update on client_finance
  for each row execute procedure public.set_updated_at();

-- Backfill from the old column, then drop it.
insert into client_finance (client_id, monthly_value)
select id, monthly_value from clients
where monthly_value is not null
on conflict (client_id) do update set monthly_value = excluded.monthly_value;

alter table clients drop column if exists monthly_value;

-- ---------------------------------------------------------------
-- clients.notes — freeform staff notes, same visibility as the rest
-- of the clients row (ceo/staff full access, videographer read-only
-- on assigned clients, client role never reads this table's internal
-- fields beyond what the portal chooses to show).
-- ---------------------------------------------------------------

alter table clients add column if not exists notes text;
