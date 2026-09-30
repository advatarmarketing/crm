-- 0033: enquiries from the public website.
--
-- Run 0016-0032 first.
--
-- Run VERIFY_0033.sql afterwards and check every row before treating
-- this as done.

-- =================================================================
-- What this is
-- =================================================================
-- /enquire is a public page — no login — where someone who wants to
-- work with Advatar answers five short questions. Sending it creates
-- a LEAD: an ordinary `clients` row with stage 'lead' and
-- lead_source 'Website enquiry', so it lands in the Leads pipeline
-- beside every other lead rather than in a separate inbox somebody
-- has to remember to check.
--
-- Two small things are needed for that, and nothing else.

-- =================================================================
-- 1. A phone number on a lead
-- =================================================================
-- The enquiry asks for a phone number and makes it required, because
-- a lead you cannot ring is a lead you cannot chase. `clients` had
-- contact_name and contact_email but nowhere to put one.
--
-- Optional, like the rest: leads added by hand in the CRM have never
-- had to supply one and still do not.

alter table clients add column if not exists contact_phone text;

-- =================================================================
-- 2. Rate limiting
-- =================================================================
-- The page is open to the whole internet, so it needs a limit on how
-- often the same visitor can send. This has to be stored rather than
-- kept in the app's memory: the CRM runs on Vercel, where each
-- request may be served by a different instance that remembers
-- nothing, so an in-memory counter would stop roughly nobody.
--
-- What is stored is a SHA-256 hash of the sender's IP address, never
-- the address itself. That is enough to recognise "this visitor
-- again" for a few hours and useless for anything else. Rows older
-- than a day are deleted on each send, so the table stays small and
-- holds nothing for longer than it is needed.

create table if not exists public.enquiry_throttle (
  id          uuid primary key default gen_random_uuid(),
  ip_hash     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists enquiry_throttle_lookup
  on public.enquiry_throttle (ip_hash, created_at desc);

-- Nobody reaches this table through the API. RLS is on and there are
-- deliberately NO policies, which under Postgres means every row is
-- invisible and no write is allowed — for signed-in users as well as
-- signed-out ones. Only the server's service-role key, which bypasses
-- RLS, touches it, and only inside the enquiry's own code.
alter table public.enquiry_throttle enable row level security;

revoke all on public.enquiry_throttle from anon;
revoke all on public.enquiry_throttle from authenticated;

-- =================================================================
-- 3. Who can see a website enquiry
-- =================================================================
-- CEO only — which is already true, and worth writing down rather
-- than adding a policy for.
--
-- `clients: management full access` (0029) reads can_manage_client(),
-- which is the CEO anywhere, and an operations manager only on a
-- client they are ASSIGNED to. The staff and videographer policies
-- likewise require an assignment. A lead created by this page has no
-- assignments: it is inserted by the server's service-role key, so
-- there is no signed-in person for 0024's "assign the creator"
-- trigger to attach, and that trigger only ever fires for an
-- operations manager in the first place.
--
-- So a fresh website enquiry is visible to the CEO and to nobody
-- else, until the CEO puts someone on it — at which point that person
-- can see it, which is the point of putting them on it.
--
-- VERIFY_0033.sql checks this by reading the policies rather than
-- trusting this comment.
