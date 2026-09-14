-- Run this after 0030_notify_email.sql.
-- Every row in the first result should say OK.

with checks as (
  select 'profiles.notify_email' as thing,
         exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles'
                   and column_name = 'notify_email') as ok

  union all
  select 'notify_email shape check',
         exists (select 1 from pg_constraint
                 where conname = 'profiles_notify_email_shape')

  -- Anyone may set their own address...
  union all
  select 'anyone can set their own address',
         exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'profiles'
                   and policyname = 'profiles: update own')

  -- ...and that policy must still pin role, or this column would be
  -- a way back into the privilege escalation 0026 closed.
  union all
  select 'own update still pins role',
         coalesce((select with_check like '%role%' from pg_policies
                   where schemaname = 'public' and tablename = 'profiles'
                     and policyname = 'profiles: update own'), false)

  -- Management fills it in for people who will never open settings.
  union all
  select 'management can set it for others',
         exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'profiles'
                   and policyname = 'profiles: management update any')

  union all
  select 'fn notify_new_version',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'notify_new_version')

  union all
  select 'trigger submission_versions_notify',
         exists (select 1 from pg_trigger
                 where tgname = 'submission_versions_notify' and not tgisinternal)

  -- The new half: a client hears about a re-cut of a video already
  -- shared with them.
  union all
  select 'new cut tells the client too',
         coalesce((select prosrc like '%upload_new_version_client%' from pg_proc p
                   join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'notify_new_version'), false)

  -- ...but not on v1, which the share itself already announces.
  -- Two emails for one event is how people learn to ignore them.
  union all
  select 'no duplicate email on the first cut',
         coalesce((select prosrc like '%new.version > 1%' from pg_proc p
                   join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'notify_new_version'), false)
)
select thing, case when ok then 'OK' else 'PROBLEM' end as state
from checks
order by thing;

-- -----------------------------------------------------------------
-- The shape check, tried on the things people actually type.
-- Expect: the first three accepted, the last four rejected.
-- Nothing is written.
-- -----------------------------------------------------------------
with samples(value) as (
  values
    ('someone@example.co.uk'),
    ('first.last+crm@example.com'),
    (null),
    ('not an email'),
    ('missing@domain'),
    ('@example.com'),
    ('two spaces@example.com')
)
select
  coalesce(value, '(blank - falls back to the login address)') as typed,
  case
    when value is null
      or value ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    then 'accepted' else 'rejected'
  end as result
from samples;

-- Who currently has an address set, and where their mail will go.
-- Blank in the second column means it falls back to the login.
select role, full_name, coalesce(notify_email, '(login address)') as mail_goes_to
from profiles
order by role, full_name;
