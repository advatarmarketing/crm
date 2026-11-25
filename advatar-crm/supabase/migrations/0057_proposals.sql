-- =================================================================
-- 0057 - Proposals: the client-facing proposal link, packages,
-- tracking, contract acceptance and payment.
--
--   proposal_deals        a prospect deal: a business we're talking
--                         to, or an existing client on a new deal
--   proposal_templates    pre-saves to start a proposal from
--   proposals             one version of a proposal; the client's link
--                         is its unguessable `code`
--   proposal_events       what the client did on the link (tracking)
--   proposal_acceptances  the record of who accepted which contract
--   proposal_payments     card and cash payments against a proposal
--
-- Who can see what:
--   - The CEO and operations managers: every deal.
--   - Sales (staff): the deals they made.
--   - The client's link never reads these tables as a signed-in
--     user. The server reads them on its behalf, by code only, and
--     hands the page just that one proposal.
-- Safe to run twice.
-- =================================================================

-- Who makes proposals: the CEO, operations and sales.
create or replace function public.can_make_proposals()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() in ('ceo', 'operations_manager', 'staff');
$$;
grant execute on function public.can_make_proposals() to authenticated;

-- -----------------------------------------------------------------
-- 1. Deals
-- -----------------------------------------------------------------
create table if not exists public.proposal_deals (
  id             uuid primary key default gen_random_uuid(),
  business_name  text not null,
  contact_name   text,
  email          text,
  -- Set when an existing client is taking on a new deal. Paying then
  -- updates that client rather than making a new one.
  client_id      uuid references public.clients (id) on delete set null,
  status         text not null default 'open' check (status in ('open', 'won', 'lost')),
  notes          text,
  owner_id       uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists proposal_deals_owner_idx on public.proposal_deals (owner_id, created_at desc);

-- Can this person see (and work on) this deal?
create or replace function public.can_see_deal(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() in ('ceo', 'operations_manager')
      or (public.current_role() = 'staff' and exists (
            select 1 from public.proposal_deals d where d.id = target and d.owner_id = auth.uid()));
$$;
grant execute on function public.can_see_deal(uuid) to authenticated;

alter table public.proposal_deals enable row level security;
-- Written out here rather than through can_see_deal(): a new row isn't
-- visible to a lookup yet, so "insert ... returning" would be refused.
drop policy if exists "proposal_deals: read" on public.proposal_deals;
create policy "proposal_deals: read" on public.proposal_deals
  for select using (
    public.current_role() in ('ceo', 'operations_manager')
    or (public.current_role() = 'staff' and owner_id = auth.uid())
  );
drop policy if exists "proposal_deals: create" on public.proposal_deals;
create policy "proposal_deals: create" on public.proposal_deals
  for insert with check (public.can_make_proposals() and owner_id = auth.uid());
drop policy if exists "proposal_deals: change" on public.proposal_deals;
create policy "proposal_deals: change" on public.proposal_deals
  for update using (
    public.current_role() in ('ceo', 'operations_manager')
    or (public.current_role() = 'staff' and owner_id = auth.uid())
  ) with check (public.can_make_proposals());
drop policy if exists "proposal_deals: remove" on public.proposal_deals;
create policy "proposal_deals: remove" on public.proposal_deals
  for delete using (public.current_role() in ('ceo', 'operations_manager'));

-- -----------------------------------------------------------------
-- 2. Templates (pre-saves)
-- -----------------------------------------------------------------
create table if not exists public.proposal_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  content     jsonb not null,
  message     text,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.proposal_templates enable row level security;
drop policy if exists "proposal_templates: read" on public.proposal_templates;
create policy "proposal_templates: read" on public.proposal_templates
  for select using (public.can_make_proposals());
drop policy if exists "proposal_templates: create" on public.proposal_templates;
create policy "proposal_templates: create" on public.proposal_templates
  for insert with check (public.can_make_proposals() and created_by = auth.uid());
drop policy if exists "proposal_templates: change" on public.proposal_templates;
create policy "proposal_templates: change" on public.proposal_templates
  for update using (public.current_role() in ('ceo', 'operations_manager') or created_by = auth.uid())
  with check (public.can_make_proposals());
drop policy if exists "proposal_templates: remove" on public.proposal_templates;
create policy "proposal_templates: remove" on public.proposal_templates
  for delete using (public.current_role() in ('ceo', 'operations_manager') or created_by = auth.uid());

-- -----------------------------------------------------------------
-- 3. Proposals (one row per version)
-- -----------------------------------------------------------------
create table if not exists public.proposals (
  id                uuid primary key default gen_random_uuid(),
  deal_id           uuid not null references public.proposal_deals (id) on delete cascade,
  version           integer not null default 1,
  -- The client's link: /proposal/<code>. Long and random.
  code              text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  content           jsonb not null,
  message           text,
  status            text not null default 'draft'
                      check (status in ('draft', 'sent', 'superseded', 'awaiting_payment', 'awaiting_cash', 'paid')),
  superseded_by     uuid references public.proposals (id) on delete set null,
  created_by        uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  sent_at           timestamptz,
  first_opened_at   timestamptz,
  finished_at       timestamptz,
  -- What the client chose, as accepted: { package, plan, extras }.
  choice            jsonb,
  accepted_email    text,
  accepted_at       timestamptz,
  amount            numeric,
  invoice_number    text,
  payment_method    text check (payment_method is null or payment_method in ('card', 'cash')),
  stripe_session_id text,
  stripe_subscription_id text,
  paid_at           timestamptz,
  -- The client this became (new, or the existing one on the deal).
  client_id         uuid references public.clients (id) on delete set null,
  -- Set when the client's login was made, so it isn't made twice.
  login_profile_id  uuid references public.profiles (id) on delete set null,
  emailed_at        timestamptz,
  email_problem     text,
  unique (deal_id, version)
);
create index if not exists proposals_deal_idx on public.proposals (deal_id, version desc);

alter table public.proposals enable row level security;
drop policy if exists "proposals: read" on public.proposals;
create policy "proposals: read" on public.proposals
  for select using (public.can_see_deal(deal_id));
drop policy if exists "proposals: create" on public.proposals;
create policy "proposals: create" on public.proposals
  for insert with check (public.can_make_proposals() and public.can_see_deal(deal_id));
drop policy if exists "proposals: change" on public.proposals;
create policy "proposals: change" on public.proposals
  for update using (public.can_see_deal(deal_id)) with check (public.can_see_deal(deal_id));
drop policy if exists "proposals: remove" on public.proposals;
create policy "proposals: remove" on public.proposals
  for delete using (public.can_see_deal(deal_id) and status = 'draft');

-- Once a client has accepted or paid, the proposal itself is fixed:
-- what they agreed to can't be edited afterwards.
create or replace function public.proposals_guard()
returns trigger
language plpgsql
as $$
begin
  if old.accepted_at is not null and new.content is distinct from old.content then
    raise exception 'This proposal has been accepted, so it can''t be edited. Make a new version instead.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists proposals_guard on public.proposals;
create trigger proposals_guard before update on public.proposals
  for each row execute procedure public.proposals_guard();

-- -----------------------------------------------------------------
-- 4. Tracking
-- -----------------------------------------------------------------
create table if not exists public.proposal_events (
  id           bigint generated always as identity primary key,
  proposal_id  uuid not null references public.proposals (id) on delete cascade,
  session_id   text not null,
  kind         text not null check (kind in ('open', 'slide', 'package', 'breakdown', 'extra', 'plan', 'contract', 'lets_go', 'email', 'method')),
  slide        text,
  package      text,
  ms           integer check (ms is null or ms between 0 and 3600000),
  detail       jsonb,
  at           timestamptz not null default now()
);
create index if not exists proposal_events_idx on public.proposal_events (proposal_id, at);

alter table public.proposal_events enable row level security;
drop policy if exists "proposal_events: read" on public.proposal_events;
create policy "proposal_events: read" on public.proposal_events
  for select using (exists (select 1 from public.proposals p where p.id = proposal_id and public.can_see_deal(p.deal_id)));
-- No insert policy: events are written by the server only.

-- -----------------------------------------------------------------
-- 5. Contract acceptance
-- -----------------------------------------------------------------
create table if not exists public.proposal_acceptances (
  id             uuid primary key default gen_random_uuid(),
  proposal_id    uuid not null references public.proposals (id) on delete cascade,
  contact_name   text,
  business_name  text,
  email          text not null,
  package        text not null,
  plan           text not null check (plan in ('monthly', 'upfront')),
  extras         jsonb not null default '{}'::jsonb,
  monthly        numeric not null,
  total          numeric not null,
  contract_text  text not null,
  ip             text,
  user_agent     text,
  accepted_at    timestamptz not null default now()
);
create index if not exists proposal_acceptances_idx on public.proposal_acceptances (proposal_id, accepted_at desc);

alter table public.proposal_acceptances enable row level security;
drop policy if exists "proposal_acceptances: read" on public.proposal_acceptances;
create policy "proposal_acceptances: read" on public.proposal_acceptances
  for select using (exists (select 1 from public.proposals p where p.id = proposal_id and public.can_see_deal(p.deal_id)));

-- -----------------------------------------------------------------
-- 6. Payments (card and cash)
-- -----------------------------------------------------------------
create table if not exists public.proposal_payments (
  id            uuid primary key default gen_random_uuid(),
  proposal_id   uuid not null references public.proposals (id) on delete cascade,
  method        text not null check (method in ('card', 'cash')),
  amount        numeric not null,
  -- 'first' is the payment that starts the deal; 'monthly' each one after.
  kind          text not null default 'first' check (kind in ('first', 'monthly')),
  stripe_ref    text unique,
  note          text,
  received_by   uuid references public.profiles (id) on delete set null,
  received_at   timestamptz not null default now()
);
create index if not exists proposal_payments_idx on public.proposal_payments (proposal_id, received_at desc);

alter table public.proposal_payments enable row level security;
drop policy if exists "proposal_payments: read" on public.proposal_payments;
create policy "proposal_payments: read" on public.proposal_payments
  for select using (exists (select 1 from public.proposals p where p.id = proposal_id and public.can_see_deal(p.deal_id)));
-- Cash is noted through record_cash_payment() below; card payments
-- are written by the server when Stripe confirms them.

-- Note cash received. Returns the proposal id, for the server to
-- finish setting the client up.
create or replace function public.record_cash_payment(target uuid, paid numeric, note_text text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.proposals;
begin
  select * into p from public.proposals where id = target;
  if p.id is null or not public.can_see_deal(p.deal_id) then
    raise exception 'You can''t see that proposal.';
  end if;
  if p.accepted_at is null then
    raise exception 'The client hasn''t accepted this proposal yet.';
  end if;
  if paid is null or paid <= 0 then
    raise exception 'Enter the amount received.';
  end if;
  insert into public.proposal_payments (proposal_id, method, amount, kind, note, received_by)
  values (target, 'cash', paid, case when p.paid_at is null then 'first' else 'monthly' end, note_text, auth.uid());
  update public.proposals
     set status = 'paid', paid_at = coalesce(paid_at, now()), payment_method = coalesce(payment_method, 'cash')
   where id = target;
  update public.proposal_deals set status = 'won', updated_at = now() where id = p.deal_id;
  return target;
end;
$$;
revoke all on function public.record_cash_payment(uuid, numeric, text) from public;
grant execute on function public.record_cash_payment(uuid, numeric, text) to authenticated;

-- -----------------------------------------------------------------
-- 7. Clients made from a proposal, so "Needs a team" can find them
-- -----------------------------------------------------------------
alter table public.clients add column if not exists from_proposal_id uuid references public.proposals (id) on delete set null;

-- Clients made from a proposal who have nobody on them yet.
create or replace function public.clients_needing_team()
returns table (client_id uuid, name text, paid_at timestamptz, deal_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, p.paid_at, p.deal_id
    from public.clients c
    join public.proposals p on p.id = c.from_proposal_id
   where public.current_role() in ('ceo', 'operations_manager')
     and not exists (select 1 from public.client_staff s where s.client_id = c.id)
   order by p.paid_at desc nulls last;
$$;
grant execute on function public.clients_needing_team() to authenticated;
