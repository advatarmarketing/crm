-- Phase 18: not every client pays monthly.
--
-- `client_finance` only had `monthly_value`, which quietly assumed a
-- monthly retainer. A client on a quarterly retainer, an annual deal,
-- or a one-off project either got recorded wrongly or not at all — and
-- every revenue figure in the app was built on that number.
--
-- This adds the actual agreement (amount + how often + a free-text
-- note) and keeps `monthly_value` as a DERIVED monthly-equivalent,
-- maintained by a trigger. That way every existing screen that reads
-- monthly_value keeps working and starts being correct for
-- non-monthly clients, without two hand-maintained numbers that can
-- drift apart.

alter table client_finance
  add column if not exists billing_amount numeric,
  add column if not exists billing_frequency text,
  add column if not exists billing_notes text;

alter table client_finance drop constraint if exists client_finance_billing_frequency_check;
alter table client_finance add constraint client_finance_billing_frequency_check
  check (
    billing_frequency is null
    or billing_frequency in ('monthly', 'quarterly', 'annual', 'per_project', 'one_off')
  );

-- Anything already recorded was, by definition, a monthly figure.
update client_finance
set billing_amount = monthly_value,
    billing_frequency = 'monthly'
where billing_amount is null
  and monthly_value is not null;

-- =================================================================
-- Keep monthly_value in step with the agreement
-- =================================================================
-- Recurring revenue is the point of the figure, so one-off and
-- per-project work contributes 0 to it — that money shows up as paid
-- invoices instead, which is where it belongs. Counting a one-off
-- project as recurring revenue would overstate MRR permanently.

create or replace function public.sync_client_monthly_value()
returns trigger
language plpgsql
as $$
begin
  new.monthly_value := case new.billing_frequency
    when 'monthly'   then new.billing_amount
    when 'quarterly' then new.billing_amount / 3
    when 'annual'    then new.billing_amount / 12
    else 0
  end;

  -- No agreement recorded at all: leave it null rather than claiming
  -- the client is worth zero.
  if new.billing_amount is null or new.billing_frequency is null then
    new.monthly_value := null;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_client_monthly_value on client_finance;
create trigger sync_client_monthly_value
  before insert or update of billing_amount, billing_frequency on client_finance
  for each row
  execute procedure public.sync_client_monthly_value();

-- Recompute once for rows that already exist.
update client_finance
set billing_amount = billing_amount
where billing_amount is not null;
