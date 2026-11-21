-- 0051 - Instagram numbers from a profile link
--
-- Advatar connects its own Instagram business account once. The server
-- then uses it to look up any client's public Instagram business or
-- creator account from the profile link on their Performance tab:
-- followers, posts, likes and comments (not views), every day, without
-- the client having to log in.
--
-- Safe to run twice. Needs 0048.

-- Advatar's own account. One row. Row level security on and no
-- policies: only the server, with the service key, can read it, and the
-- access in it is encrypted by the app.
create table if not exists public.agency_instagram (
  id boolean primary key default true check (id),
  ig_user_id text not null,
  username text,
  access_token text not null,
  connected_by uuid references public.profiles (id) on delete set null,
  connected_at timestamptz not null default now(),
  last_error text
);

alter table public.agency_instagram enable row level security;

-- A client's Instagram read this way is shown as status 'lookup'.
alter table public.social_connections drop constraint if exists social_connections_status_check;
alter table public.social_connections
  add constraint social_connections_status_check
  check (status in ('connected', 'needs_reconnect', 'lookup'));

-- The Page picker after a Facebook login is also used when connecting
-- Advatar's own account, which belongs to no client.
alter table public.social_pending alter column client_id drop not null;
