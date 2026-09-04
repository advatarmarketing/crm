-- Phase 16: turn the Leads list into a pipeline you can forecast from.
--
-- Until now a lead carried no value and no sense of how likely it was,
-- so there was no way to answer "what is actually coming?" — only "how
-- many names are on the list". These three columns are what the Leads
-- page needs to weight and chase properly.

alter table clients
  add column if not exists estimated_value numeric,
  -- 0-100. Deliberately a plain integer rather than a set of named
  -- bands: agencies tend to want their own words for these, and a
  -- number can be relabelled in the UI without a migration.
  add column if not exists likelihood integer,
  add column if not exists last_contacted_at timestamptz;

alter table clients drop constraint if exists clients_likelihood_check;
alter table clients add constraint clients_likelihood_check
  check (likelihood is null or (likelihood >= 0 and likelihood <= 100));

alter table clients drop constraint if exists clients_estimated_value_check;
alter table clients add constraint clients_estimated_value_check
  check (estimated_value is null or estimated_value >= 0);

-- The Leads page filters on stage and orders by follow-up date; the
-- dashboard asks "what is overdue" across the same two columns.
create index if not exists clients_stage_idx on clients (stage);
create index if not exists clients_follow_up_date_idx on clients (follow_up_date)
  where follow_up_date is not null;
