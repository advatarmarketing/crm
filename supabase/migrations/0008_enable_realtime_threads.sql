-- Phase 10: the chat UI needs to notice when a brand-new thread gets
-- created for a client that previously had none (e.g. a videographer
-- or client whose team hasn't messaged them yet, waiting for staff to
-- send the first message) — that requires subscribing to
-- `postgres_changes` on `message_threads` itself, not just `messages`.
-- 0006_enable_realtime.sql added `planners`/`documents`/`messages` to
-- the `supabase_realtime` publication but missed `message_threads`
-- since nothing needed it yet at the time. Same idempotent guard as
-- that migration, kept as its own file rather than editing
-- 0006 in place — once a migration has shipped, later phases fix
-- gaps forward with a new one instead of rewriting history.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_threads'
  ) then
    alter publication supabase_realtime add table public.message_threads;
  end if;
end $$;

-- ChatShell's unread-count bookkeeping needs to know, on an UPDATE
-- event, whether a message flipped from unread to read (or vice
-- versa) — it reads `old.read` off the Realtime payload to compute
-- that. By default Postgres's logical replication (which Realtime's
-- postgres_changes rides on) only includes a row's PRIMARY KEY
-- columns in the "old" image of an UPDATE/DELETE, not the rest of the
-- row — so `old.read` would come back undefined without this.
-- REPLICA IDENTITY FULL makes Postgres log the entire pre-update row,
-- which is what makes `old.read` available at all.
--
-- Trade-off worth knowing about: this makes every UPDATE on
-- `messages` write more to the WAL (the whole row's previous values,
-- not just its id) — completely fine at this app's scale (a handful
-- of read-flag flips per conversation), but the kind of thing that
-- would be worth revisiting if `messages` ever saw high-volume
-- updates.
alter table messages replica identity full;
