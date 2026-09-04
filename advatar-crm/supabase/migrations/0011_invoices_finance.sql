-- Phase 14: make the `invoices` table usable.
--
-- The table has existed since 0002_schema_rls.sql but nothing in the
-- app ever read or wrote it — there was no finance screen at all, only
-- "Payments" (money going OUT to staff). This migration adds the two
-- columns a real invoice needs and opens the table to the operations
-- manager alongside the CEO.
--
-- What is deliberately NOT changed here:
--   * `client_finance` (each client's monthly recurring value) stays
--     CEO-only. So does `payments` (what staff are paid). The
--     operations manager can raise and chase invoices for work they
--     sold, without seeing overall company revenue or anyone's wages.
--     If that split is wrong, the fix is one policy each — say so.
--
-- Status model: 'draft' | 'sent' | 'paid'. "Overdue" is deliberately
-- NOT a stored status — it is simply a sent invoice whose due_date has
-- passed, computed at read time. Storing it would mean something has
-- to run every night to flip rows over, and that something would
-- eventually not run.

-- =================================================================
-- 1. Columns
-- =================================================================

alter table invoices
  add column if not exists due_date date,
  add column if not exists paid_at timestamptz;

-- Existing rows (if any) predate the status vocabulary below; park
-- anything unrecognised as a draft rather than letting the constraint
-- fail on data that is already there.
update invoices
set status = 'draft'
where status is null or status not in ('draft', 'sent', 'paid');

alter table invoices alter column status set default 'draft';

alter table invoices drop constraint if exists invoices_status_check;
alter table invoices add constraint invoices_status_check
  check (status in ('draft', 'sent', 'paid'));

-- The finance list sorts by "what is owed, soonest first", and the
-- client detail page pulls one client's invoices; both are covered by
-- these.
create index if not exists invoices_status_due_date_idx on invoices (status, due_date);
create index if not exists invoices_client_id_idx on invoices (client_id);

-- =================================================================
-- 2. Access
-- =================================================================

-- Replaces "invoices: ceo full access" from 0002. is_management() is
-- ceo + operations_manager (defined in
-- 0010_ops_manager_leads_staff_scoping.sql).
drop policy if exists "invoices: ceo full access" on invoices;
drop policy if exists "invoices: management full access" on invoices;
create policy "invoices: management full access"
  on invoices for all
  using (public.is_management())
  with check (public.is_management());

-- Staff, videographers and clients still get no policy on this table
-- at all, which under RLS means zero rows rather than an error.
