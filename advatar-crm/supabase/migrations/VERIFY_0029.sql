-- Run this after 0029_management_means_management.sql.
-- Every row in the first result should say OK.

with checks as (
  select 'fn can_manage_client' as thing,
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'can_manage_client') as ok

  -- The policy 0028 added and this migration removes.
  union all
  select 'videographer cannot write feedback',
         not exists (select 1 from pg_policies
                     where schemaname = 'public' and tablename = 'submission_feedback'
                       and policyname = 'submission_feedback: videographer reply own')

  -- ...but must still be able to read it, or the checklist arrives
  -- with no explanation behind it.
  union all
  select 'videographer can still read feedback',
         exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'submission_feedback'
                   and policyname = 'submission_feedback: videographer read own')

  union all
  select 'client can still comment',
         exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'submission_feedback'
                   and policyname = 'submission_feedback: client comment shared')

  union all
  select 'videographer can still add a cut',
         exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'submission_versions'
                   and policyname = 'submission_versions: videographer add own')

  union all
  select 'videographer can still tick the checklist',
         exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'submission_checklist'
                   and policyname = 'submission_checklist: videographer tick own')

  -- A videographer must have NO update policy on submissions. This is
  -- what stops somebody approving their own work, and it is the check
  -- worth reading twice.
  union all
  select 'nobody can approve their own work',
         not exists (select 1 from pg_policies
                     where schemaname = 'public' and tablename = 'submissions'
                       and cmd in ('ALL', 'UPDATE')
                       and coalesce(with_check, '') like '%videographer%')
)
select thing, case when ok then 'OK' else 'PROBLEM' end as state
from checks
order by thing;

-- -----------------------------------------------------------------
-- The heart of it: every "management full access" policy must now go
-- through can_manage_client(), and none of them may still be resting
-- on can_see_client() — which is true for videographers and is how
-- all of this happened.
--
-- Expect one row per table, every one saying FIXED.
-- -----------------------------------------------------------------
select
  tablename,
  policyname,
  case
    when qual like '%can_manage_client%' then 'FIXED'
    -- `resources` was never client-scoped and still uses the original
    -- helper, which has always meant ceo + operations manager. Correct
    -- as it stands, and not something this migration touches.
    when qual like '%is_management%' then 'ALREADY CORRECT'
    when qual like '%can_see_client%' then 'STILL WIDE OPEN'
    else 'CHECK BY HAND'
  end as state
from pg_policies
where schemaname = 'public'
  and (policyname like '%management full access%' or policyname = 'checklist: management full access')
order by tablename;

-- -----------------------------------------------------------------
-- Anything still granting write through can_see_client(), which is
-- true for videographers. Expect exactly two rows, both intended:
--
--   client_assets        raw footage and references are shared
--                        working material — the videographer shooting
--                        the job is who should be adding a Drive link
--   submission_checklist guarded by its own role list on top
--                        ('ceo', 'operations_manager', 'staff'), so
--                        can_see_client only narrows it further
--
-- A third row here is a table this migration missed.
-- -----------------------------------------------------------------
select
  tablename,
  policyname,
  case
    when qual like '%operations_manager%' then 'role-guarded as well'
    else 'shared with the whole team on purpose'
  end as note
from pg_policies
where schemaname = 'public'
  and qual like '%can_see_client%'
  and cmd = 'ALL'
order by tablename, policyname;
