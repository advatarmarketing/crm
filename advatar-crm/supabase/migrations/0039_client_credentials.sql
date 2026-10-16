-- 0039: a Passwords tab on every client — their social media logins.
--
-- Run 0016-0038 first.
--
-- Run VERIFY_0039.sql afterwards and check every row before treating
-- this as done.

-- =================================================================
-- What this is
-- =================================================================
-- One row per login: Instagram, TikTok, the Meta Business Suite
-- account, the Canva seat, whatever the account needs. Each row holds
-- the platform, the handle or email, an optional link, and the
-- password.
--
-- NOTHING IS DELETED OR CHANGED BY THIS FILE. It only adds a table
-- that does not exist yet. Run it twice and the second run does
-- nothing.
--
-- =================================================================
-- The password is never stored as a password
-- =================================================================
-- `secret_cipher` and `notes_cipher` hold AES-256-GCM ciphertext,
-- encrypted by the app with a key that lives in Vercel and is NOT in
-- this database. Reading every row of this table — a leaked backup, a
-- mis-set policy, a borrowed Supabase login — yields the platform and
-- the handle and nothing else. The password cannot be worked out from
-- what is stored here.
--
-- The check constraints below enforce the envelope format, so a
-- password typed straight into the Supabase table editor is REJECTED
-- rather than silently stored in the clear. That is the point of
-- them: the database refuses to hold a readable password even if
-- somebody tries to put one there by hand. A future encryption
-- format bumps the version prefix (v2., v3.) and still passes.

create table if not exists public.client_credentials (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients (id) on delete cascade,

  -- "Instagram", "TikTok", "Meta Business Suite". Free text rather
  -- than a list, because the list of places an account needs a login
  -- changes faster than a migration can keep up with.
  platform      text not null check (char_length(btrim(platform)) between 1 and 40),

  -- Which one, when there is more than one: "main", "the old one",
  -- "boss's personal".
  label         text check (label is null or char_length(label) <= 60),

  -- The handle or email. Deliberately NOT encrypted: it is half of
  -- what makes the row findable, it is usually public anyway, and
  -- hiding it would mean revealing a password just to see which
  -- account a row is about.
  username      text check (username is null or char_length(username) <= 200),
  url           text check (url is null or char_length(url) <= 500),

  secret_cipher text check (secret_cipher is null or secret_cipher ~ '^v[0-9]+\.'),
  notes_cipher  text check (notes_cipher is null or notes_cipher ~ '^v[0-9]+\.'),

  -- A fingerprint of the key the two columns above were encrypted
  -- with — not the key, and nothing the key can be recovered from.
  -- It exists so that if the key in Vercel is ever changed, the app
  -- can say "this was saved with the previous key" instead of showing
  -- a wall of nonsense.
  key_id        text check (key_id is null or char_length(key_id) <= 32),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles (id) on delete set null
);

create index if not exists client_credentials_client_idx
  on public.client_credentials (client_id, platform, label);

-- =================================================================
-- Who can see them
-- =================================================================
-- Narrower than almost anything else in this schema, on purpose.
--
--   CEO                  every client.
--   operations manager   the clients they are on (can_manage_client).
--   staff                the clients they are assigned to.
--   videographer         nothing. No policy below mentions them, and
--                        with RLS on, no policy means no access: the
--                        table reads as empty and every write is
--                        refused. They shoot and upload; they have
--                        never needed to log in as the client, and a
--                        password handed to everyone who has ever
--                        been on the account is a password nobody can
--                        say who used.
--   client               nothing, for the same reason the rest of
--                        their file is not in the portal. If a client
--                        should be able to hand over a login
--                        themselves, that is a portal screen and its
--                        own migration, not a policy loosened here.

alter table public.client_credentials enable row level security;

drop policy if exists "client_credentials: management" on public.client_credentials;
create policy "client_credentials: management"
  on public.client_credentials for all
  using (public.can_manage_client(client_id))
  with check (public.can_manage_client(client_id));

drop policy if exists "client_credentials: staff assigned" on public.client_credentials;
create policy "client_credentials: staff assigned"
  on public.client_credentials for all
  using (public.current_role() = 'staff' and public.is_assigned_staff(client_id))
  with check (public.current_role() = 'staff' and public.is_assigned_staff(client_id));

-- Keeps updated_at honest without the app having to remember.
-- public.touch_updated_at() is from 0018_schedule_resources.sql.
drop trigger if exists client_credentials_touch_updated_at on public.client_credentials;
create trigger client_credentials_touch_updated_at
  before update on public.client_credentials
  for each row execute procedure public.touch_updated_at();
