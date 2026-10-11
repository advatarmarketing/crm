-- WHICH MIGRATIONS HAVE I RUN?
--
-- Paste this whole thing into the Supabase SQL editor and press run.
-- It only READS — it changes nothing, and it is safe to run as often
-- as you like.
--
-- One row per migration, newest last, each saying RUN or NOT RUN and
-- what it was for. Anything before 0030 is left out on purpose: the
-- CRM could not sign you in or show a client without those, so if the
-- app works at all they are in.
--
-- Each check looks for the one thing its migration adds — a table, a
-- view or a column — rather than for a record of having run it, since
-- this project has no migrations table. That means it reports what is
-- actually in your database, which is the thing you want to know.

select *
from (
  values
    (
      '0030', 'Email notifications',
      case when exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'notify_email'
      ) then 'RUN' else 'NOT RUN' end
    ),
    (
      '0031', 'Real names on messages, not "Someone"',
      case when to_regclass('public.team_directory') is not null then 'RUN' else 'NOT RUN' end
    ),
    (
      '0032', 'Notes',
      case when to_regclass('public.notes') is not null then 'RUN' else 'NOT RUN' end
    ),
    (
      '0033', 'The enquiry form on the website',
      case when to_regclass('public.enquiry_throttle') is not null then 'RUN' else 'NOT RUN' end
    ),
    (
      '0034', 'Blank content plan template with prompts',
      case when to_regclass('public.planners_backup_0034') is not null then 'RUN' else 'NOT RUN' end
    ),
    (
      '0035', 'Note subfolders, colours and bold/italic',
      case when exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'note_folders' and column_name = 'parent_id'
      ) then 'RUN' else 'NOT RUN' end
    ),
    (
      '0036', 'The Schedule tab',
      case when to_regclass('public.planner_blocks') is not null then 'RUN' else 'NOT RUN' end
    ),
    (
      '0037', 'Priority on to-dos',
      case when exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'tasks' and column_name = 'priority'
      ) then 'RUN' else 'NOT RUN' end
    )
) as t(migration, what_it_adds, status)
order by migration;
