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
    ),
    (
      '0038', 'Connect a notes folder to a client',
      case when exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'note_folders' and column_name = 'client_id'
      ) then 'RUN' else 'NOT RUN' end
    ),
    (
      '0039', 'Passwords: client social media logins',
      case when to_regclass('public.client_credentials') is not null then 'RUN' else 'NOT RUN' end
    ),
    (
      '0040', 'Share a notes folder with its client',
      case when exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'note_folders' and column_name = 'shared_with_client'
      ) then 'RUN' else 'NOT RUN' end
    ),
    (
      '0041', 'Client packages and posting days',
      case when to_regclass('public.client_packages') is not null then 'RUN' else 'NOT RUN' end
    ),
    (
      '0042', 'Video schedule, client approvals, thumbnails and graphics',
      case when to_regclass('public.content_videos') is not null then 'RUN' else 'NOT RUN' end
    ),
    (
      '0043', 'Client Account page, live pop-ups, videographer privacy',
      case when to_regclass('public.client_accounts') is not null then 'RUN' else 'NOT RUN' end
    ),
    (
      '0044', 'Team access: the CEO chooses what each staff member sees',
      case when to_regclass('public.team_access') is not null then 'RUN' else 'NOT RUN' end
    ),
    (
      '0045', 'Video months: numbered videos in Month 1, Month 2...',
      case when to_regclass('public.content_cycles') is not null then 'RUN' else 'NOT RUN' end
    ),
    (
      '0046', 'Post links, engagement numbers and performance reports',
      case when to_regclass('public.video_posts') is not null then 'RUN' else 'NOT RUN' end
    ),
    (
      '0047', 'Which videographers may send videos straight to the client',
      case when to_regclass('public.videographer_access') is not null then 'RUN' else 'NOT RUN' end
    ),
    (
      '0048', 'Client side: Files sections, Content Hub results, guarantee switch, welcome tour',
      case when to_regclass('public.social_snapshots') is not null then 'RUN' else 'NOT RUN' end
    ),
    (
      '0049', 'Video post numbers fill in automatically from connected accounts',
      case when exists (select 1 from pg_constraint where conname = 'video_posts_metrics_source_check' and pg_get_constraintdef(oid) like '%platform%') then 'RUN' else 'NOT RUN' end
    ),
    (
      '0050', 'Accounts we manage: profile links and first posting date',
      case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'clients' and column_name = 'posting_started_on') then 'RUN' else 'NOT RUN' end
    ),
    (
      '0051', 'Instagram numbers from a profile link (via Advatar''s own Instagram)',
      case when to_regclass('public.agency_instagram') is not null then 'RUN' else 'NOT RUN' end
    ),
    (
      '0052', 'Social stats scraper: readings, starting points, AI spend',
      case when to_regclass('public.social_readings') is not null then 'RUN' else 'NOT RUN' end
    ),
    (
      '0053', 'Client dashboard: video steps as to-dos, scripts, YOU',
      case when to_regclass('public.scripts') is not null then 'RUN' else 'NOT RUN' end
    ),
    (
      '0054', 'Guidelines: Filming / Editing, and a guide per content pillar',
      case when to_regclass('public.pillar_guides') is not null then 'RUN' else 'NOT RUN' end
    ),
    (
      '0055', 'Your Journey: paths, levels, progress and sign-off',
      case when to_regclass('public.journey_paths') is not null then 'RUN' else 'NOT RUN' end
    ),
    (
      '0056', 'Professional Replier on the Messages page',
      case when to_regclass('public.replier_runs') is not null then 'RUN' else 'NOT RUN' end
    ),
    (
      '0057', 'Proposals: client proposal links, packages, tracking and payment',
      case when to_regclass('public.proposals') is not null then 'RUN' else 'NOT RUN' end
    )
) as t(migration, what_it_adds, status)
order by migration;
