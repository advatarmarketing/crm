-- Phase 9: Postgres Changes (Realtime) only fires for tables that are
-- members of the `supabase_realtime` publication — enabling RLS on a
-- table does NOT also enable Realtime for it, those are two separate
-- switches. Phase 5's PlannerDocument component already subscribes to
-- `postgres_changes` on `planners`, and this phase's client portal
-- adds subscriptions on `documents` and `messages` too — all three
-- need to actually be in the publication for any of those
-- subscriptions to receive anything, live or otherwise.
--
-- This was a gap Phase 5 should have flagged and didn't (there's no
-- migration anywhere before this one that touches
-- `supabase_realtime`), which only became obvious once a second
-- feature (this portal) depended on the same mechanism. Fixing it
-- forward here rather than leaving it to be a silent "why doesn't
-- live update work" surprise later.
--
-- Guarded with an existence check rather than a bare `alter
-- publication ... add table`, because that statement errors instead
-- of no-op'ing if the table is already a member (e.g. if a project
-- had this switched on by hand in the Supabase dashboard already) —
-- this makes the migration safe to run either way.
do $$
declare
  t text;
begin
  foreach t in array array['planners', 'documents', 'messages']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
