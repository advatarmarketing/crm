-- Run this after 0028_uploads_hub.sql.
-- Every row in the first result should say OK.

with checks as (
  -- 1. Feedback's new columns
  select 'feedback.timecode_seconds' as thing,
         exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'submission_feedback'
                   and column_name = 'timecode_seconds') as ok

  union all
  select 'feedback.screenshot_path',
         exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'submission_feedback'
                   and column_name = 'screenshot_path')

  union all
  select 'feedback.audience',
         exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'submission_feedback'
                   and column_name = 'audience')

  -- The default must be 'team'. 0020 promised feedback was never
  -- shown to a client, and every row written before this migration
  -- was written under that promise — a default of 'client' would have
  -- put every past review note on display.
  --
  -- The default is checked rather than the rows themselves, because
  -- once clients start commenting there ARE rows with audience
  -- 'client', and a row count would read PROBLEM for the most normal
  -- reason possible. This stays true however long it is left before
  -- being re-run.
  union all
  select 'feedback defaults to internal',
         coalesce((select column_default like '%team%' from information_schema.columns
                   where table_schema = 'public' and table_name = 'submission_feedback'
                     and column_name = 'audience'), false)

  -- 2. The checklist
  union all
  select 'table submission_checklist',
         to_regclass('public.submission_checklist') is not null

  union all
  select 'checklist RLS on',
         coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.submission_checklist')), false)

  union all
  select 'fn build_checklist_from_feedback',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'build_checklist_from_feedback')

  union all
  select 'trigger submission_feedback_checklist',
         exists (select 1 from pg_trigger where tgname = 'submission_feedback_checklist' and not tgisinternal)

  union all
  select 'trigger submission_checklist_pin',
         exists (select 1 from pg_trigger where tgname = 'submission_checklist_pin' and not tgisinternal)

  -- A videographer may tick an item but not rewrite it. RLS cannot
  -- restrict columns, so this is a trigger, and the trigger existing
  -- is the whole guarantee.
  union all
  select 'reviewer policy excludes videographers',
         coalesce((select qual like '%operations_manager%' from pg_policies
                   where schemaname = 'public' and tablename = 'submission_checklist'
                     and policyname = 'submission_checklist: management'), false)

  -- The client must have no way in here at all: the list carries
  -- items made from the team's internal notes.
  union all
  select 'checklist has no client policy',
         not exists (select 1 from pg_policies
                     where schemaname = 'public' and tablename = 'submission_checklist'
                       and (qual like '%''client''%' or with_check like '%''client''%'))

  -- 3. Assets
  union all
  select 'table client_assets',
         to_regclass('public.client_assets') is not null

  union all
  select 'client_assets RLS on',
         coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.client_assets')), false)

  union all
  select 'client_assets team policy',
         exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_assets'
                 and policyname = 'client_assets: team on the client')

  union all
  select 'client_assets client read is share-gated',
         coalesce((select qual like '%team_and_client%' from pg_policies
                   where schemaname = 'public' and tablename = 'client_assets'
                     and policyname = 'client_assets: client read shared'), false)

  -- 4. Buckets, and their size limits specifically — the limit is the
  -- part of "image uploads can't be too big" that a browser can't be
  -- trusted with.
  union all
  select 'bucket feedback-shots',
         exists (select 1 from storage.buckets where id = 'feedback-shots' and not public)

  union all
  select 'feedback-shots capped at 5 MB',
         coalesce((select file_size_limit = 5242880 from storage.buckets where id = 'feedback-shots'), false)

  union all
  select 'feedback-shots images only',
         coalesce((select allowed_mime_types is not null from storage.buckets where id = 'feedback-shots'), false)

  union all
  select 'bucket upload-assets',
         exists (select 1 from storage.buckets where id = 'upload-assets' and not public)

  union all
  select 'upload-assets capped at 10 MB',
         coalesce((select file_size_limit = 10485760 from storage.buckets where id = 'upload-assets'), false)

  union all
  select 'storage policy feedback-shots team',
         exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'feedback-shots: team on the client')

  union all
  select 'storage policy upload-assets team',
         exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'upload-assets: team on the client')

  -- 5. Notification triggers — these are what the numbered circles count
  union all
  select 'trigger submission_versions_notify',
         exists (select 1 from pg_trigger where tgname = 'submission_versions_notify' and not tgisinternal)

  union all
  select 'trigger submission_feedback_notify',
         exists (select 1 from pg_trigger where tgname = 'submission_feedback_notify' and not tgisinternal)

  union all
  select 'trigger submissions_shared_notify',
         exists (select 1 from pg_trigger where tgname = 'submissions_shared_notify' and not tgisinternal)

  union all
  select 'trigger client_assets_notify',
         exists (select 1 from pg_trigger where tgname = 'client_assets_notify' and not tgisinternal)

  -- 6. The client's feedback policies
  union all
  select 'client may comment',
         exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'submission_feedback'
                 and policyname = 'submission_feedback: client comment shared')

  -- The single most important line in this migration: a client writing
  -- feedback must be pinned to the 'client' audience, or they could
  -- post into the team's internal thread.
  union all
  select 'client comment is pinned to client audience',
         coalesce((select with_check like '%audience%' from pg_policies
                   where schemaname = 'public' and tablename = 'submission_feedback'
                     and policyname = 'submission_feedback: client comment shared'), false)

  union all
  select 'client read is pinned to client audience',
         coalesce((select qual like '%audience%' from pg_policies
                   where schemaname = 'public' and tablename = 'submission_feedback'
                     and policyname = 'submission_feedback: client read shared'), false)

  union all
  select 'videographer may reply',
         exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'submission_feedback'
                 and policyname = 'submission_feedback: videographer reply own')
)
select thing, case when ok then 'OK' else 'PROBLEM' end as state
from checks
order by thing;

-- -----------------------------------------------------------------
-- The splitter, tried on the three shapes it has to handle.
-- Expect: 3 items, then 1 item, then 2 items.
-- Nothing is written — this runs the same regexes on sample text.
-- -----------------------------------------------------------------
with samples(shape, body) as (
  values
    ('bullets', e'- Trim the intro\n- Colour is too warm\n- Add the logo at the end'),
    ('short', 'Lovely, ship it.'),
    ('long paragraph', 'The opening shot runs about two seconds too long before the title card appears and it makes the whole thing feel slow. Could you also warm the grade slightly in the second half where it goes quite blue.')
),
split as (
  select shape,
         case
           when position(e'\n' in body) > 0 then regexp_split_to_array(body, e'\n')
           when length(body) > 180 then
             regexp_split_to_array(regexp_replace(body, '([.!?])\s+', e'\\1\n', 'g'), e'\n')
           else array[body]
         end as parts
  from samples
)
select shape,
       (select count(*) from unnest(parts) p
        where length(btrim(regexp_replace(p, '^\s*([-*•–]|\d+[.)])\s*', ''))) >= 3) as items
from split;

-- Every policy now on the new tables, for eyeballing.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename in ('submission_checklist', 'client_assets', 'submission_feedback')
order by tablename, policyname;
