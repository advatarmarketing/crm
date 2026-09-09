-- 0023: the SOP library is shared, not per-person.
--
-- Run 0016-0022 first.
--
-- 0018's "resources: read own audience" narrowed reads with
--   (assigned_to is null or assigned_to = auth.uid())
-- so an SOP pinned to one videographer was invisible to the rest. The
-- brief is that Guidelines is one shared checklist library every
-- videographer sees the same view of — it is a standards library, and
-- two people editing to different checklists is the exact problem SOPs
-- exist to prevent.
--
-- `resources.assigned_to` is kept rather than dropped: it still
-- records who a note was written for, and the admin side still shows
-- that label. It simply no longer hides the row from anybody.
--
-- Run VERIFY_0023.sql afterwards.

drop policy if exists "resources: read own audience" on resources;
create policy "resources: read own audience"
  on resources for select
  using (
    public.current_role() in ('staff', 'videographer', 'operations_manager')
    and (audience_role = 'all' or audience_role = public.current_role())
  );

-- The checklist steps follow whatever the resource policy allows, via
-- can_read_resource() (0021), so they widen with it automatically and
-- need no change here.
