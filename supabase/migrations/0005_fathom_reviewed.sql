-- Phase 6 fix-forward migration.
--
-- fathom_calls.applied (Phase 3) answers one question: "has the
-- auto-mapper run on this call yet?" The /app/prospects page in this
-- phase needs a second, different question answered: "has a human
-- looked at what the mapper produced yet?" Overloading `applied` to
-- mean both would make the prospects list disappear the instant the
-- webhook fires, before anyone had a chance to review it — the
-- opposite of what "unreviewed fathom_calls" is asking for. Adding a
-- separate column instead of repurposing the existing one.

alter table fathom_calls add column if not exists reviewed_at timestamptz;
