-- Run AFTER 0020, on its own. Changes nothing.
-- Every row should say OK.

with checks as (
  select 'table submissions' as thing,
         to_regclass('public.submissions') is not null as ok
  union all select 'table submission_versions', to_regclass('public.submission_versions') is not null
  union all select 'table submission_feedback', to_regclass('public.submission_feedback') is not null
  union all select 'table client_brand_kits',   to_regclass('public.client_brand_kits') is not null
  union all select 'table client_team_messages', to_regclass('public.client_team_messages') is not null

  union all select 'RLS on submissions',
    (select relrowsecurity from pg_class where oid = 'public.submissions'::regclass)
  union all select 'RLS on submission_versions',
    (select relrowsecurity from pg_class where oid = 'public.submission_versions'::regclass)
  union all select 'RLS on submission_feedback',
    (select relrowsecurity from pg_class where oid = 'public.submission_feedback'::regclass)
  union all select 'RLS on client_brand_kits',
    (select relrowsecurity from pg_class where oid = 'public.client_brand_kits'::regclass)
  union all select 'RLS on client_team_messages',
    (select relrowsecurity from pg_class where oid = 'public.client_team_messages'::regclass)

  union all select 'fn owns_submission',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'owns_submission')
  union all select 'trigger submission_versions_bump',
    exists (select 1 from pg_trigger where tgname = 'submission_versions_bump')

  -- The important one: a videographer must not be able to write the
  -- status column, or they could approve their own work.
  union all select 'videographer has NO update policy on submissions',
    not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'submissions'
        and cmd in ('UPDATE', 'ALL')
        and policyname like '%videographer%'
    )
  union all select 'videographer can read own submissions',
    exists (select 1 from pg_policies where schemaname='public' and tablename='submissions'
            and policyname='submissions: videographer read own')
  union all select 'videographer can add versions',
    exists (select 1 from pg_policies where schemaname='public' and tablename='submission_versions'
            and policyname='submission_versions: videographer add own')
  union all select 'videographer has NO insert on feedback',
    not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='submission_feedback'
        and cmd in ('INSERT', 'ALL')
        and policyname like '%videographer%'
    )
  union all select 'brand kit readable by videographer',
    exists (select 1 from pg_policies where schemaname='public' and tablename='client_brand_kits'
            and policyname='client_brand_kits: videographer read assigned')

  -- The internal thread must never be reachable by a client login.
  union all select 'client_team_messages has NO client policy',
    not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='client_team_messages'
        and qual like '%''client''%'
    )
)
select thing, case when ok then 'OK' else 'PROBLEM' end as state
from checks
order by thing;
