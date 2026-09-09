-- Run AFTER 0025, on its own. Changes nothing.
-- Every row in the first table should say OK.

with checks as (
  select 'table notifications' as thing, to_regclass('public.notifications') is not null as ok
  union all select 'table portfolio_items', to_regclass('public.portfolio_items') is not null
  union all select 'table team_channel_messages', to_regclass('public.team_channel_messages') is not null

  union all select 'fn notify_user',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.proname='notify_user')
  union all select 'trigger client_staff_notify',
    exists (select 1 from pg_trigger where tgname='client_staff_notify')
  union all select 'trigger tasks_notify',
    exists (select 1 from pg_trigger where tgname='tasks_notify')

  union all select 'submissions.visibility exists',
    exists (select 1 from information_schema.columns where table_schema='public'
            and table_name='submissions' and column_name='visibility')
  union all select 'submissions.planner_slot_id exists',
    exists (select 1 from information_schema.columns where table_schema='public'
            and table_name='submissions' and column_name='planner_slot_id')
  union all select 'clients can read shared submissions',
    exists (select 1 from pg_policies where schemaname='public' and tablename='submissions'
            and policyname='submissions: client read shared')
  union all select 'clients can read their calendar',
    exists (select 1 from pg_policies where schemaname='public' and tablename='schedule_events'
            and policyname='schedule_events: client read own')

  -- Nobody may write notifications to another person, and feedback is
  -- never exposed to a client. Both are absences, so both are checked
  -- as absences.
  union all select 'no insert policy on notifications',
    not exists (select 1 from pg_policies where schemaname='public' and tablename='notifications'
                and cmd in ('INSERT','ALL'))
  union all select 'clients cannot read submission feedback',
    not exists (select 1 from pg_policies where schemaname='public' and tablename='submission_feedback'
                and qual like '%''client''%')
  union all select 'clients cannot read the team channel',
    not exists (select 1 from pg_policies where schemaname='public' and tablename='team_channel_messages'
                and qual like '%''client''%')
)
select thing, case when ok then 'OK' else 'PROBLEM' end as state
from checks
order by thing;

-- Did submissions.client_id become required? If this says NULLABLE,
-- some existing submissions have no client — set one on each from the
-- admin side, then re-run 0025 to apply the constraint.
select 'submissions.client_id' as column,
       case when is_nullable = 'NO' then 'REQUIRED (good)' else 'NULLABLE — see note above' end as state
from information_schema.columns
where table_schema='public' and table_name='submissions' and column_name='client_id';

select count(*) as submissions_without_a_client from public.submissions where client_id is null;
